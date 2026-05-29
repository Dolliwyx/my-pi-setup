import { Buffer } from "node:buffer";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";
const DEBOUNCE_MS = 60_000;
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

interface WindowInfo {
	used_percent?: number;
	reset_at?: number;
	reset_after_seconds?: number;
	limit_window_seconds?: number;
}

interface RateLimitInfo {
	allowed?: boolean;
	limit_reached?: boolean;
	primary_window?: WindowInfo | null;
	secondary_window?: WindowInfo | null;
}

interface CreditsInfo {
	has_credits?: boolean;
	unlimited?: boolean;
	balance?: number | string;
}

interface CodexUsageResponse {
	email?: string;
	plan_type?: string;
	rate_limit?: RateLimitInfo;
	code_review_rate_limit?: RateLimitInfo;
	additional_rate_limits?: unknown;
	credits?: CreditsInfo;
	spend_control?: { reached?: boolean };
}

interface QuotaLine {
	label: string;
	window: WindowInfo;
	limitReached?: boolean;
}

interface FooterData {
	getGitBranch(): string | null;
	getExtensionStatuses(): ReadonlyMap<string, string>;
	getAvailableProviderCount(): number;
	onBranchChange(callback: () => void): () => void;
}

type Theme = ExtensionContext["ui"]["theme"];

interface RightFooterState {
	statuses: Map<string, string>;
	requestRender?: () => void;
}

declare global {
	// Shared by right-side footer status extensions in this Pi runtime.
	var __piRightFooterState: RightFooterState | undefined;
}

function getRightFooterState(): RightFooterState {
	globalThis.__piRightFooterState ??= { statuses: new Map() };
	return globalThis.__piRightFooterState;
}

async function getCodexApiKey(modelRegistry: ExtensionAPI["modelRegistry"]): Promise<string | undefined> {
	if (modelRegistry.authStorage) {
		return await modelRegistry.authStorage.getApiKey("openai-codex");
	}
	return await modelRegistry.getApiKeyForProvider("openai-codex");
}

function extractAccountId(token: string): string | undefined {
	try {
		const payload = token.split(".")[1];
		if (!payload) return undefined;

		const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
		const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
		const accountId = parsed?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
		return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined;
	} catch {
		return undefined;
	}
}

async function fetchCodexUsage(apiKey: string, signal?: AbortSignal): Promise<CodexUsageResponse> {
	const accountId = extractAccountId(apiKey);
	const headers: Record<string, string> = {
		Authorization: `Bearer ${apiKey}`,
		Accept: "application/json",
	};
	if (accountId) headers["ChatGPT-Account-Id"] = accountId;

	const res = await fetch(USAGE_ENDPOINT, { headers, signal });
	const text = await res.text();
	let parsed: unknown;
	try {
		parsed = text ? JSON.parse(text) : undefined;
	} catch {
		parsed = undefined;
	}

	if (!res.ok) {
		const message =
			typeof parsed === "object" && parsed && "error" in parsed
				? JSON.stringify((parsed as { error: unknown }).error)
				: text || res.statusText;
		throw new Error(`Codex usage request failed (${res.status}): ${message}`);
	}

	return (parsed ?? {}) as CodexUsageResponse;
}

function isCodexModel(model: { provider: string } | undefined): boolean {
	return model?.provider === "openai-codex";
}

function clampPercent(value: number): number {
	return Math.max(0, Math.min(100, Math.round(value)));
}

function remainingPercent(window: WindowInfo): number | undefined {
	return typeof window.used_percent === "number" ? clampPercent(100 - window.used_percent) : undefined;
}

function formatDuration(seconds: number): string {
	const total = Math.max(0, Math.round(seconds));
	const days = Math.floor(total / 86_400);
	const hours = Math.floor((total % 86_400) / 3_600);
	const minutes = Math.floor((total % 3_600) / 60);
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

function resetAfterSeconds(window: WindowInfo): number | undefined {
	if (typeof window.reset_after_seconds === "number") return window.reset_after_seconds;
	if (typeof window.reset_at === "number") return Math.max(0, window.reset_at - Date.now() / 1000);
	return undefined;
}

function formatWindowName(window: WindowInfo, fallback: string): string {
	const seconds = window.limit_window_seconds;
	if (typeof seconds !== "number") return fallback;
	if (seconds <= 6 * 3_600) return "5h";
	if (seconds >= 6 * 86_400) return "7d";
	return formatDuration(seconds);
}

function formatReset(window: WindowInfo): string {
	const resetAfter = resetAfterSeconds(window);
	const relative = resetAfter === undefined ? "unknown" : formatDuration(resetAfter);
	if (typeof window.reset_at !== "number") return relative;
	return `${relative} (${new Date(window.reset_at * 1000).toLocaleString()})`;
}

function getQuotaLines(data: CodexUsageResponse): QuotaLine[] {
	const lines: QuotaLine[] = [];
	const primary = data.rate_limit?.primary_window;
	const secondary = data.rate_limit?.secondary_window;
	if (primary) lines.push({ label: formatWindowName(primary, "primary"), window: primary, limitReached: data.rate_limit?.limit_reached });
	if (secondary) lines.push({ label: formatWindowName(secondary, "weekly"), window: secondary, limitReached: data.rate_limit?.limit_reached });

	const review = data.code_review_rate_limit?.primary_window;
	if (review) lines.push({ label: `review ${formatWindowName(review, "")}`.trim(), window: review, limitReached: data.code_review_rate_limit?.limit_reached });

	return lines;
}

function formatCredits(credits: CreditsInfo | undefined): string | undefined {
	if (!credits) return undefined;
	if (credits.unlimited) return "unlimited credits";
	if (credits.has_credits === false) return undefined;
	if (credits.balance === undefined) return credits.has_credits ? "credits available" : undefined;
	const balance = typeof credits.balance === "number" ? credits.balance.toFixed(0) : credits.balance;
	return `${balance} credits`;
}

function formatStatus(data: CodexUsageResponse): string {
	const lines = getQuotaLines(data);
	const limitReached = data.rate_limit?.limit_reached || data.spend_control?.reached;
	const prefix = limitReached ? "⛔ Codex" : "⚡ Codex";
	const parts = lines.slice(0, 2).map(({ label, window }) => {
		const left = remainingPercent(window);
		return `${label} ${left === undefined ? "?" : `${left}%`}`;
	});
	const credits = formatCredits(data.credits);
	if (credits) parts.push(credits);
	return parts.length > 0 ? `${prefix} ${parts.join(" · ")}` : `${prefix} quota unavailable`;
}

function formatDetails(data: CodexUsageResponse): string {
	const headerParts = ["Codex quota"];
	if (data.plan_type) headerParts.push(`plan: ${data.plan_type}`);
	if (data.email) headerParts.push(data.email);

	const details = [headerParts.join(" · ")];
	for (const { label, window, limitReached } of getQuotaLines(data)) {
		const left = remainingPercent(window);
		const used = typeof window.used_percent === "number" ? clampPercent(window.used_percent) : undefined;
		const state = limitReached ? " limit reached" : "";
		details.push(
			`${label}: ${left === undefined ? "?" : `${left}%`} left${used === undefined ? "" : ` (${used}% used)`}; resets in ${formatReset(window)}${state}`,
		);
	}

	const credits = formatCredits(data.credits);
	if (credits) details.push(`Credits: ${credits}`);
	if (data.rate_limit?.allowed === false) details.push("Requests are currently not allowed by the main Codex rate limit.");
	if (data.spend_control?.reached) details.push("Spend control is reached.");
	if (details.length === 1) details.push("No rate-limit windows were returned.");
	return details.join("\n");
}

function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function formatCwdForFooter(cwd: string, home: string | undefined): string {
	if (!home) return cwd;
	if (cwd === home) return "~";
	return cwd.startsWith(`${home}/`) ? `~/${cwd.slice(home.length + 1)}` : cwd;
}

function rightAlignLine(left: string, right: string | undefined, width: number, ellipsis: string): string {
	if (!right) return truncateToWidth(left, width, ellipsis);

	const rightWidth = visibleWidth(right);
	if (rightWidth >= width) return truncateToWidth(right, width, ellipsis);
	if (!left) return " ".repeat(width - rightWidth) + right;

	const maxLeftWidth = width - rightWidth - 1;
	const truncatedLeft = truncateToWidth(left, Math.max(0, maxLeftWidth), ellipsis);
	const leftWidth = visibleWidth(truncatedLeft);
	const padding = " ".repeat(Math.max(1, width - leftWidth - rightWidth));
	return truncatedLeft + padding + right;
}

function renderCodexFooter(
	ctx: ExtensionContext,
	pi: ExtensionAPI,
	theme: Theme,
	footerData: FooterData,
	rightStatusTexts: string[],
	width: number,
): string[] {
	let totalInput = 0;
	let totalOutput = 0;
	let totalCacheRead = 0;
	let totalCacheWrite = 0;
	let totalCost = 0;

	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			totalInput += entry.message.usage.input;
			totalOutput += entry.message.usage.output;
			totalCacheRead += entry.message.usage.cacheRead;
			totalCacheWrite += entry.message.usage.cacheWrite;
			totalCost += entry.message.usage.cost.total;
		}
	}

	const contextUsage = ctx.getContextUsage();
	const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
	const contextPercentValue = contextUsage?.percent ?? 0;
	const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";

	let pwd = formatCwdForFooter(ctx.sessionManager.getCwd(), process.env.HOME || process.env.USERPROFILE);
	const branch = footerData.getGitBranch();
	if (branch) pwd = `${pwd} (${branch})`;
	const sessionName = ctx.sessionManager.getSessionName();
	if (sessionName) pwd = `${pwd} • ${sessionName}`;

	const statsParts: string[] = [];
	if (totalInput) statsParts.push(`↑${formatTokens(totalInput)}`);
	if (totalOutput) statsParts.push(`↓${formatTokens(totalOutput)}`);
	if (totalCacheRead) statsParts.push(`R${formatTokens(totalCacheRead)}`);
	if (totalCacheWrite) statsParts.push(`W${formatTokens(totalCacheWrite)}`);

	const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
	if (totalCost || usingSubscription) {
		statsParts.push(`$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`);
	}

	const autoIndicator = " (auto)";
	const contextPercentDisplay =
		contextPercent === "?"
			? `?/${formatTokens(contextWindow)}${autoIndicator}`
			: `${contextPercent}%/${formatTokens(contextWindow)}${autoIndicator}`;
	let contextPercentStr = contextPercentDisplay;
	if (contextPercentValue > 90) contextPercentStr = theme.fg("error", contextPercentDisplay);
	else if (contextPercentValue > 70) contextPercentStr = theme.fg("warning", contextPercentDisplay);
	statsParts.push(contextPercentStr);

	let statsLeft = statsParts.join(" ");
	if (visibleWidth(statsLeft) > width) statsLeft = truncateToWidth(statsLeft, width, "...");

	const modelName = ctx.model?.id || "no-model";
	let rightSideWithoutProvider = modelName;
	if (ctx.model?.reasoning) {
		const thinkingLevel = pi.getThinkingLevel() || "off";
		rightSideWithoutProvider = thinkingLevel === "off" ? `${modelName} • thinking off` : `${modelName} • ${thinkingLevel}`;
	}

	let rightSide = rightSideWithoutProvider;
	if (footerData.getAvailableProviderCount() > 1 && ctx.model) {
		const withProvider = `(${ctx.model.provider}) ${rightSideWithoutProvider}`;
		if (visibleWidth(statsLeft) + 2 + visibleWidth(withProvider) <= width) rightSide = withProvider;
	}

	const statsLine = rightAlignLine(theme.fg("dim", statsLeft), theme.fg("dim", rightSide), width, theme.fg("dim", "..."));
	const pwdLine = truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "..."));
	const lines = [pwdLine, statsLine];

	const statusLine = Array.from(footerData.getExtensionStatuses().entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, text]) => sanitizeStatusText(text))
		.join(" ");
	const rightStatusLine = rightStatusTexts.length > 0 ? theme.fg("dim", rightStatusTexts.join("  ")) : undefined;
	if (statusLine || rightStatusLine) {
		lines.push(rightAlignLine(statusLine, rightStatusLine, width, theme.fg("dim", "...")));
	}

	return lines;
}

export default function (pi: ExtensionAPI) {
	let lastFetchTime = 0;
	let cachedUsage: CodexUsageResponse | undefined;
	let inFlight: Promise<CodexUsageResponse> | undefined;
	const rightFooterState = getRightFooterState();
	let requestFooterRender: (() => void) | undefined;

	function setQuotaStatus(text: string | undefined) {
		if (text) rightFooterState.statuses.set("codex-quota", text);
		else rightFooterState.statuses.delete("codex-quota");
		rightFooterState.requestRender?.();
	}

	function installFooter(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		ctx.ui.setFooter((tui, theme, footerData) => {
			requestFooterRender = () => tui.requestRender();
			rightFooterState.requestRender = requestFooterRender;
			const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose() {
					unsubscribeBranch();
					if (rightFooterState.requestRender === requestFooterRender) rightFooterState.requestRender = undefined;
					requestFooterRender = undefined;
				},
				invalidate() {},
				render(width: number): string[] {
					return renderCodexFooter(ctx, pi, theme, footerData, Array.from(rightFooterState.statuses.values()), width);
				},
			};
		});
	}

	async function readUsage(ctx: ExtensionContext, force: boolean): Promise<CodexUsageResponse> {
		if (!force && cachedUsage && Date.now() - lastFetchTime < DEBOUNCE_MS) return cachedUsage;
		if (inFlight) return await inFlight;

		const apiKey = await getCodexApiKey(ctx.modelRegistry);
		if (!apiKey) {
			throw new Error("No openai-codex login found. Run /login and select ChatGPT Plus/Pro (Codex).");
		}

		inFlight = fetchCodexUsage(apiKey, ctx.signal);
		try {
			cachedUsage = await inFlight;
			lastFetchTime = Date.now();
			return cachedUsage;
		} finally {
			inFlight = undefined;
		}
	}

	async function updateStatus(ctx: ExtensionContext, options: { force?: boolean; notifyErrors?: boolean } = {}) {
		if (!isCodexModel(ctx.model)) {
			setQuotaStatus(undefined);
			return;
		}

		try {
			const usage = await readUsage(ctx, options.force ?? false);
			setQuotaStatus(formatStatus(usage));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setQuotaStatus("⚡ Codex quota error");
			if (options.notifyErrors) ctx.ui.notify(message, "error");
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		installFooter(ctx);
		await updateStatus(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		await updateStatus(ctx, { force: isCodexModel(ctx.model) });
	});

	pi.on("thinking_level_select", async () => {
		requestFooterRender?.();
	});

	pi.on("turn_end", async (_event, ctx) => {
		if (!isCodexModel(ctx.model)) return;
		if (Date.now() - lastFetchTime < DEBOUNCE_MS) return;
		await updateStatus(ctx);
	});

	pi.on("session_shutdown", async () => {
		rightFooterState.statuses.delete("codex-quota");
		if (rightFooterState.requestRender === requestFooterRender) rightFooterState.requestRender = undefined;
		requestFooterRender = undefined;
	});

	pi.registerCommand("codex-quota", {
		description: "Show OpenAI Codex usage quota",
		handler: async (_args, ctx) => {
			try {
				const usage = await readUsage(ctx, true);
				if (isCodexModel(ctx.model)) setQuotaStatus(formatStatus(usage));
				ctx.ui.notify(formatDetails(usage), "info");
			} catch (err) {
				ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
			}
		},
	});
}
