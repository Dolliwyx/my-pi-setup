import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, ScrollView, truncateToWidth, wrapTextWithAnsi, type Component, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";

export class DiffPanel implements Component {
	private readonly source: string[];
	private readonly scroll: ScrollView;
	private cachedWidth = -1;
	private lines: string[] = [];

	constructor(private tui: TUI, private theme: Theme, text: string, private done: () => void) {
		// Repository text must never be interpreted as terminal control sequences.
		this.source = text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, (character) => `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`).replace(/\t/g, "    ").trimEnd().split("\n");
		this.scroll = new ScrollView({ render: () => this.lines, invalidate: () => {} }, { scrollbar: "hidden" });
	}

	invalidate(): void {
		this.cachedWidth = -1;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || matchesKey(data, "q")) return this.done();
		if (matchesKey(data, "up")) this.scroll.scrollBy(-1);
		else if (matchesKey(data, "down")) this.scroll.scrollBy(1);
		else if (matchesKey(data, "pageup")) this.scroll.scrollBy(-this.scroll.viewportHeight);
		else if (matchesKey(data, "pagedown")) this.scroll.scrollBy(this.scroll.viewportHeight);
		else if (matchesKey(data, "home")) this.scroll.scrollToStart();
		else if (matchesKey(data, "end")) this.scroll.scrollToEnd();
	}

	handleMouse(event: TuiMouseEvent) {
		if (event.type !== "wheel") return undefined;
		this.scroll.scrollBy(event.wheelDelta ?? 0);
		return { handled: true, render: true };
	}

	render(width: number): string[] {
		const inner = Math.max(1, width - 2);
		if (inner !== this.cachedWidth) {
			this.lines = this.source.flatMap((line) => {
				const color = line.startsWith("diff --git") || line.startsWith("@@") ? "accent" : line.startsWith("+") ? "success" : line.startsWith("-") ? "error" : "text";
				return wrapTextWithAnsi(this.theme.fg(color, line), inner);
			});
			this.cachedWidth = inner;
		}
		const height = Math.max(1, this.tui.terminal.rows - 5);
		this.scroll.updateLayout(this.lines.length, height, () => this.tui.requestRender());
		const top = this.scroll.scrollTop;
		const body = this.scroll.render(inner).slice(top, top + height);
		while (body.length < height) body.push("");
		const border = (text: string) => this.theme.fg("border", text);
		const row = (text: string) => border("│") + truncateToWidth(text, inner, "…", true) + border("│");
		return [
			border(`┌${"─".repeat(inner)}┐`),
			row(this.theme.fg("accent", " Session diff") + this.theme.fg("muted", `  ${top + 1}–${Math.min(top + height, this.lines.length)}/${this.lines.length}`)),
			...body.map(row),
			row(this.theme.fg("muted", " ↑↓ PgUp/PgDn · Home/End · Esc close")),
			border(`└${"─".repeat(inner)}┘`),
		].map((line) => truncateToWidth(line, width));
	}
}
