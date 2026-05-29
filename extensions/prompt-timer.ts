import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const WIDGET_ID = "prompt-timer";
const UPDATE_INTERVAL_MS = 250;

type TimerState = "running" | "finished";

export default function (pi: ExtensionAPI) {
	let promptStartTime: number | undefined;
	let updateInterval: ReturnType<typeof setInterval> | undefined;

	function stopInterval(): void {
		if (!updateInterval) return;
		clearInterval(updateInterval);
		updateInterval = undefined;
	}

	function setTimerWidget(ctx: ExtensionContext, state: TimerState, elapsedMs: number): void {
		if (!ctx.hasUI) return;

		const theme = ctx.ui.theme;
		const label = state === "running" ? "Running for" : "Took";
		const duration = theme.fg(state === "running" ? "accent" : "success", formatDuration(elapsedMs));
		ctx.ui.setWidget(WIDGET_ID, [`${theme.fg("dim", label)} ${duration}`]);
	}

	pi.on("agent_start", async (_event, ctx) => {
		stopInterval();
		promptStartTime = Date.now();
		setTimerWidget(ctx, "running", 0);

		if (!ctx.hasUI) return;
		updateInterval = setInterval(() => {
			if (promptStartTime === undefined) return;
			setTimerWidget(ctx, "running", Date.now() - promptStartTime);
		}, UPDATE_INTERVAL_MS);
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (promptStartTime === undefined) return;

		const elapsedMs = Date.now() - promptStartTime;
		promptStartTime = undefined;
		stopInterval();
		setTimerWidget(ctx, "finished", elapsedMs);
	});

	pi.on("session_start", async (_event, ctx) => {
		promptStartTime = undefined;
		stopInterval();
		if (ctx.hasUI) ctx.ui.setWidget(WIDGET_ID, undefined);
	});

	pi.on("session_shutdown", async () => {
		promptStartTime = undefined;
		stopInterval();
	});
}

function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, ms / 1000);
	if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;

	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}m ${seconds.toFixed(1).padStart(4, "0")}s`;
}
