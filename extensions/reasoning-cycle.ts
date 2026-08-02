import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const SHORTCUTS = {
	decrease: "alt+,",
	increase: "alt+.",
} as const;

// pi-tui's legacy terminal parser currently does not parse Alt+symbol sequences
// like ESC , and ESC . as KeyIds, so keep raw fallbacks for those terminals.
const RAW_SHORTCUTS = {
	decrease: "\x1b,",
	increase: "\x1b.",
} as const;

const ALL_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

type Direction = "increase" | "decrease";

export default function (pi: ExtensionAPI) {
	let unsubscribeTerminalInput: (() => void) | undefined;

	function getAvailableLevels(ctx: ExtensionContext): ThinkingLevel[] {
		const model = ctx.model;
		if (!model?.reasoning) return [];

		const thinkingLevelMap = model.thinkingLevelMap ?? {};
		return ALL_LEVELS.filter((level) => thinkingLevelMap[level] !== null);
	}

	function cycleThinking(ctx: ExtensionContext, direction: Direction) {
		const levels = getAvailableLevels(ctx);
		if (levels.length === 0) {
			const modelName = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "current model";
			ctx.ui.notify(`${modelName} has no reasoning levels`, "info");
			return;
		}

		const current = pi.getThinkingLevel();
		const currentIndex = levels.indexOf(current);
		const fallbackIndex = direction === "increase" ? -1 : 0;
		const index = currentIndex === -1 ? fallbackIndex : currentIndex;
		const offset = direction === "increase" ? 1 : -1;
		const next = levels[(index + offset + levels.length) % levels.length];

		pi.setThinkingLevel(next);
		const selected = pi.getThinkingLevel();
		ctx.ui.notify(`Thinking level: ${selected}`, "info");
	}

	pi.registerShortcut(SHORTCUTS.decrease, {
		description: "Decrease reasoning effort",
		handler: (ctx) => cycleThinking(ctx, "decrease"),
	});

	pi.registerShortcut(SHORTCUTS.increase, {
		description: "Increase reasoning effort",
		handler: (ctx) => cycleThinking(ctx, "increase"),
	});

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setStatus("reasoning-cycle", undefined);
		unsubscribeTerminalInput?.();
		unsubscribeTerminalInput = ctx.ui.onTerminalInput((data) => {
			if (data === RAW_SHORTCUTS.decrease) {
				cycleThinking(ctx, "decrease");
				return { consume: true };
			}
			if (data === RAW_SHORTCUTS.increase) {
				cycleThinking(ctx, "increase");
				return { consume: true };
			}
			return undefined;
		});
	});

	pi.on("session_shutdown", async () => {
		unsubscribeTerminalInput?.();
		unsubscribeTerminalInput = undefined;
	});
}
