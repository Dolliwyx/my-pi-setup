import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, ScrollView, truncateToWidth, wrapTextWithAnsi, type Component, type OverlayOptions, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";

type FileDiff = { label: string; lines: string[] };

export class DiffPanel implements Component {
	private readonly source: string[];
	private readonly files: FileDiff[] = [];
	private readonly scroll: ScrollView;
	private cachedWidth = -1;
	private lines: string[] = [];
	private headers: number[] = [];
	private selected = 0;
	private expanded = -1;
	private split = false;
	// Pi retains this options object; changing its width resizes the mounted overlay.
	private readonly options: OverlayOptions = { anchor: "top-right", width: "50%", minWidth: 40, maxHeight: "100%", margin: { bottom: 1 } };
	private renderedWidth = 0;
	private dragging = false;
	private revealSelected = false;

	constructor(private tui: TUI, private theme: Theme, text: string, private done: () => void) {
		// Repository text must never be interpreted as terminal control sequences.
		this.source = text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, (character) => `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`).replace(/\t/g, "    ").trimEnd().split("\n");
		for (const line of this.source) {
			if (line.startsWith("diff --git ")) {
				// Keep JSON filename escapes visible, including embedded newlines and controls.
				const label = line.match(/^diff --git ("(?:\\.|[^"\\])*")/)?.[1];
				this.files.push({ label: label ? label.slice(1, -1) : line.slice(11), lines: [] });
			} else this.files.at(-1)?.lines.push(line);
		}
		this.scroll = new ScrollView({ render: () => this.lines, invalidate: () => {} }, { scrollbar: "hidden" });
	}

	overlayOptions(): OverlayOptions {
		return this.options;
	}

	invalidate(): void {
		this.cachedWidth = -1;
	}

	private changed(): void {
		this.invalidate();
		this.tui.requestRender();
	}

	private toggleFile(index: number): void {
		this.selected = index;
		this.expanded = this.expanded === index ? -1 : index;
		this.revealSelected = true;
		this.changed();
	}

	private resize(width: number): void {
		this.options.width = Math.min(this.tui.terminal.columns, Math.max(40, width));
		this.changed();
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || matchesKey(data, "q")) return this.done();
		if (matchesKey(data, "tab") || matchesKey(data, "shift+tab")) {
			if (!this.files.length) return;
			this.selected = (this.selected + (matchesKey(data, "tab") ? 1 : this.files.length - 1)) % this.files.length;
			this.revealSelected = true;
			this.changed();
		} else if (matchesKey(data, "enter")) {
			if (this.files.length) this.toggleFile(this.selected);
		} else if (matchesKey(data, "v")) {
			this.split = !this.split;
			this.changed();
		} else if (matchesKey(data, "[")) this.resize(this.renderedWidth - 10);
		else if (matchesKey(data, "]")) this.resize(this.renderedWidth + 10);
		else if (matchesKey(data, "up")) this.scroll.scrollBy(-1);
		else if (matchesKey(data, "down")) this.scroll.scrollBy(1);
		else if (matchesKey(data, "pageup")) this.scroll.scrollBy(-this.scroll.viewportHeight);
		else if (matchesKey(data, "pagedown")) this.scroll.scrollBy(this.scroll.viewportHeight);
		else if (matchesKey(data, "home")) this.scroll.scrollToStart();
		else if (matchesKey(data, "end")) this.scroll.scrollToEnd();
	}

	handleMouse(event: TuiMouseEvent) {
		if (event.type === "wheel") {
			this.scroll.scrollBy(event.wheelDelta ?? 0);
			return { handled: true, render: true };
		}
		if (event.type === "press" && event.button === "left" && event.x === 0) {
			this.dragging = true;
			return { capture: true };
		}
		if (this.dragging && (event.type === "drag" || event.type === "release")) {
			this.resize(this.tui.terminal.columns - event.screenX);
			if (event.type === "release") this.dragging = false;
			return { handled: true, render: true };
		}
		if ((event.type !== "press" && event.type !== "click") || event.button !== "left" || event.x < 1 || event.x >= event.width - 1) return undefined;
		if (event.y === 1 && event.x >= 16) {
			if (event.type === "click") {
				this.split = !this.split;
				this.changed();
			}
			return { handled: true, render: event.type === "click" };
		}
		if (event.y < 2 || event.y >= event.height - 2) return undefined;
		const index = this.headers.indexOf(this.scroll.scrollTop + event.y - 2);
		if (index < 0) return undefined;
		if (event.type === "click") this.toggleFile(index);
		return { handled: true, render: event.type === "click" };
	}

	private color(line: string): string {
		const color = line.startsWith("@@") ? "accent" : line.startsWith("+") ? "success" : line.startsWith("-") ? "error" : "text";
		return this.theme.fg(color, line);
	}

	private splitLines(lines: string[], width: number): string[] {
		const leftWidth = Math.floor((width - 3) / 2);
		const rightWidth = width - 3 - leftWidth;
		const result: string[] = [];
		const pair = (left: string, right: string) => {
			const oldLines = wrapTextWithAnsi(this.color(left), leftWidth);
			const newLines = wrapTextWithAnsi(this.color(right), rightWidth);
			for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
				result.push(truncateToWidth(oldLines[i] ?? "", leftWidth, "", true) + this.theme.fg("border", " │ ") + (newLines[i] ?? ""));
			}
		};
		pair(" Old", " New");
		let old: string[] = [], next: string[] = [];
		let inHunk = false;
		let lastSide = old;
		const flush = () => {
			for (let i = 0; i < Math.max(old.length, next.length); i++) pair(old[i] ?? "", next[i] ?? "");
			old = []; next = []; lastSide = old;
		};
		for (const line of lines) {
			if (inHunk && (line.startsWith("-") || line.startsWith("+"))) {
				lastSide = line.startsWith("-") ? old : next;
				lastSide.push(line);
			} else if (line.startsWith("\\ No newline") && lastSide.length) {
				lastSide[lastSide.length - 1] += `  ${line}`;
			} else {
				flush();
				if (line.startsWith("@@")) inHunk = true;
				if (inHunk && line.startsWith(" ")) pair(line, line);
				else result.push(...wrapTextWithAnsi(this.color(line), width));
			}
		}
		flush();
		return result;
	}

	render(width: number): string[] {
		this.renderedWidth = width;
		const inner = Math.max(1, width - 2);
		const useSplit = this.split && width >= 80;
		if (width !== this.cachedWidth) {
			this.headers = [];
			this.lines = [];
			for (const [index, file] of this.files.entries()) {
				this.headers.push(this.lines.length);
				this.lines.push(truncateToWidth(this.theme.fg(index === this.selected ? "accent" : "text", `${index === this.selected ? "›" : " "} ${index === this.expanded ? "▼" : "▶"} ${file.label}`), inner));
				if (index === this.expanded) {
					this.lines.push(...(useSplit ? this.splitLines(file.lines, inner) : file.lines.flatMap((line) => wrapTextWithAnsi(this.color(line), inner))));
				}
			}
			if (!this.files.length) this.lines = this.source.flatMap((line) => wrapTextWithAnsi(this.color(line), inner));
			this.cachedWidth = width;
		}
		const height = Math.max(1, this.tui.terminal.rows - 5);
		this.scroll.updateLayout(this.lines.length, height, () => this.tui.requestRender());
		if (this.revealSelected) {
			const header = this.headers[this.selected];
			if (this.expanded === this.selected || header < this.scroll.scrollTop || header >= this.scroll.scrollTop + height) this.scroll.scrollTo(header);
			this.revealSelected = false;
		}
		const top = this.scroll.scrollTop;
		const body = this.scroll.render(inner).slice(top, top + height);
		while (body.length < height) body.push("");
		const border = (text: string) => this.theme.fg("border", text);
		const row = (text: string) => border("│") + truncateToWidth(text, inner, "…", true) + border("│");
		const layout = useSplit ? "Split" : this.split ? "Unified (split needs 80 cols)" : "Unified";
		return [
			border(`┌${"─".repeat(inner)}┐`),
			row(this.theme.fg("accent", " Session diff") + this.theme.fg("muted", `  [${layout}] · v toggle`)),
			...body.map(row),
			row(this.theme.fg("muted", width < 50 ? " Tab/Enter · v · [ ] · Esc" : " Tab file · Enter open · [ ] size · Esc close")),
			border(`└${"─".repeat(inner)}┘`),
		].map((line) => truncateToWidth(line, width));
	}
}
