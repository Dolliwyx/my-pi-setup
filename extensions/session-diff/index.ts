import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { repository, sessionDiff, snapshot, type Snapshot } from "./git.ts";
import { DiffPanel } from "./panel.ts";

const ENTRY = "session-diff-baseline-v1";

export default function (pi: ExtensionAPI) {
	let baseline: Snapshot | undefined;
	let unavailable = "The session baseline has not been captured.";

	pi.on("session_start", async (event, ctx) => {
		baseline = undefined;
		try {
			const root = await repository(ctx.cwd);
			const saved = event.reason === "fork" ? undefined : ctx.sessionManager.getEntries().findLast((entry) => entry.type === "custom" && entry.customType === ENTRY);
			if (saved?.type === "custom") {
				const data = saved.data as { manifest: string };
				baseline = JSON.parse(await readFile(data.manifest, "utf8")) as Snapshot;
				if (baseline.root !== root) {
					baseline = undefined;
					throw new Error("The saved baseline belongs to a different Git repository.");
				}
			} else {
				baseline = await snapshot(root, join(getAgentDir(), "cache", "session-diff"));
				pi.appendEntry(ENTRY, { manifest: join(baseline.directory, "manifest.json") });
			}
		} catch (error) {
			unavailable = `Session diff unavailable: ${(error as Error).message}`;
			if (ctx.hasUI && !unavailable.includes("not a git repository")) ctx.ui.notify(unavailable, "warning");
		}
	});

	pi.registerCommand("diff", {
		description: "Show this session's uncommitted changes in a right-side overlay",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/diff requires Pi's interactive terminal UI.", "warning");
				return;
			}
			if (!baseline) {
				ctx.ui.notify(unavailable, "warning");
				return;
			}
			try {
				const text = await sessionDiff(baseline);
				await ctx.ui.custom<void>((tui, theme, _keys, done) => new DiffPanel(tui, theme, text, done), {
					overlay: true,
					overlayOptions: { anchor: "top-right", width: "50%", minWidth: 40, maxHeight: "100%", margin: { bottom: 1 } },
				});
			} catch (error) {
				ctx.ui.notify(`Unable to show session diff: ${(error as Error).message}`, "error");
			}
		},
	});
}
