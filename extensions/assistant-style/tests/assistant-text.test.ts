import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	AssistantMessageComponent,
	UserMessageComponent,
	getMarkdownTheme,
	initTheme,
} from "@earendil-works/pi-coding-agent";
import { Markdown, visibleWidth } from "@earendil-works/pi-tui";
import assistantStyle, { createStyleEnabledReader, installAssistantTextRendering } from "../index.ts";

const fence = "`".repeat(3);
let styleEnabled = true;
let dispose: () => void;

const message = (content: any[]) => ({
	role: "assistant", content, stopReason: "stop", timestamp: Date.now(),
});
const text = (value: string) => ({ type: "text", text: value });
const plain = (component: any, width = 60): string[] =>
	component.render(width).map((line: string) => stripVTControlCharacters(line).trimEnd());
const dotCount = (lines: string[]) => lines.filter((line) => line.startsWith(" ● ")).length;
const code = (body: string, language = "js") => `${fence}${language}\n${body}\n${fence}`;

beforeEach(() => {
	initTheme("dark");
	styleEnabled = true;
	dispose = installAssistantTextRendering(() => styleEnabled);
});

afterEach(() => {
	dispose();
});

test("one gutter per text block, not per paragraph; wrapped lines align", () => {
	const component = new AssistantMessageComponent(message([
		text("First block wraps across several narrow lines.\n\nAnother paragraph."),
		text("Second block."),
	]) as any);
	const lines = plain(component, 24);
	assert.equal(dotCount(lines), 2);
	assert(lines.some((line) => line.startsWith("   ") && line.trim() && !line.startsWith(" ● ")));
	assert(lines.includes(" ● Second block."));
});

test("code fences disappear while source and syntax highlighting remain", () => {
	const original = message([text(`Result:\n\n${code("const answer = 42;")}`)]);
	const saved = JSON.stringify(original);
	const component = new AssistantMessageComponent(original as any);
	const lines = plain(component);
	assert(!lines.some((line) => line.trim().startsWith(fence)));
	assert(lines.some((line) => line.trim() === "const answer = 42;"));
	assert(component.render(60).some((line: string) => /\x1b\[[\d;]*m/.test(line) && line.includes("answer")));
	assert.equal(JSON.stringify(original), saved);
});

test("a code-only response still receives its text-block gutter", () => {
	const lines = plain(new AssistantMessageComponent(message([text(code("answer()"))]) as any));
	assert.equal(dotCount(lines), 1);
	assert(lines.some((line) => line.startsWith(" ● ") && line.includes("answer()")));
});

test("literal triple backticks inside longer fences are preserved", () => {
	const markdown = `${fence}\`md\n${fence}js\nexample()\n${fence}\n${fence}\``;
	const lines = plain(new AssistantMessageComponent(message([text(markdown)]) as any));
	assert(lines.some((line) => line.includes(`${fence}js`)));
	assert(lines.some((line) => line.trim() === fence));
	assert(lines.some((line) => line.includes("example()")));
});

test("adjacent code blocks, following prose, and empty code retain their contents", () => {
	for (const markdown of [
		`${code("first()") }\nAfter`,
		`${code("first()") }\n${code("second()")}`,
		`${code("")}\nAfter`,
		`~~~js\nfirst()\n~~~\nAfter`,
		`> ${fence}js\n> first()\n> ${fence}\n\nAfter`,
	]) {
		const lines = plain(new AssistantMessageComponent(message([text(markdown)]) as any));
		assert(!lines.some((line) => line.includes(fence)));
		if (markdown.includes("first()")) assert(lines.some((line) => line.includes("first()")));
		if (markdown.includes("second()")) assert(lines.some((line) => line.includes("second()")));
		if (markdown.includes("After")) assert(lines.some((line) => line.includes("After")));
	}
});

test("streaming updates reuse text blocks without duplicating dots or stale content", () => {
	const component = new AssistantMessageComponent(message([text("Starting")]) as any);
	assert.equal(dotCount(plain(component)), 1);
	for (const value of ["Updated text", `Updated text\n\n${fence}js\nanswer()`, code("finished()")]) {
		component.updateContent(message([text(value)]) as any, true);
		const lines = plain(component);
		assert.equal(dotCount(lines), 1);
		assert(!lines.some((line) => line.includes("Starting")));
		assert(!lines.some((line) => line.trim() === fence || line.trim() === `${fence}js`));
	}
});

test("wide characters and terminal widths from zero to eighty stay within bounds", () => {
	const component = new AssistantMessageComponent(message([
		text(`你好 👩‍💻 café é — words that wrap\n\n${code("const longName = '你好 world';")}`),
	]) as any);
	for (const width of [0, 1, 2, 3, 4, 5, 8, 12, 24, 80]) {
		for (const line of component.render(width)) {
			assert(visibleWidth(line) <= width, `line exceeds width ${width}: ${JSON.stringify(line)}`);
		}
	}
});

test("visible thinking, error messages, user prompts, and standalone tool Markdown stay native", () => {
	const component = new AssistantMessageComponent(message([
		{ type: "thinking", thinking: code("private_thought()", "py") },
		text("Visible reply"),
	]) as any, false);
	const lines = plain(component);
	assert.equal(dotCount(lines), 1);
	assert(lines.some((line) => line.trim() === `${fence}py`));
	assert(lines.some((line) => line.trim() === fence));
	const toolMarkdown = new Markdown(code("tool_result()"), 0, 0, getMarkdownTheme());
	assert(plain(toolMarkdown).some((line) => line === `${fence}js`));
	assert.equal(dotCount(plain(toolMarkdown)), 0);
	const user = new UserMessageComponent(code("user_example()"));
	assert(plain(user).some((line) => line.trim() === `${fence}js`));
	assert.equal(dotCount(plain(user)), 0);
	const error = new AssistantMessageComponent({ ...message([]), stopReason: "error", errorMessage: "example failure" } as any);
	assert.equal(dotCount(plain(error)), 0);
	assert(plain(error).some((line) => line.includes("example failure")));
});

test("off mode restores native rendering, then on mode restores one gutter", () => {
	const component = new AssistantMessageComponent(message([text(code("answer()"))]) as any);
	assert.equal(dotCount(plain(component)), 1);
	styleEnabled = false;
	const native = plain(component);
	assert.equal(dotCount(native), 0);
	assert(native.some((line) => line.trim() === `${fence}js`));
	styleEnabled = true;
	assert.equal(dotCount(plain(component)), 1);
	assert(!plain(component).some((line) => line.includes(fence)));
});

test("reload and stale disposal do not stack gutters; shutdown restores native output", () => {
	const component = new AssistantMessageComponent(message([text(code("answer()"))]) as any);
	assert.equal(dotCount(plain(component)), 1);
	const previous = dispose;
	dispose = installAssistantTextRendering(() => styleEnabled);
	previous();
	assert.equal(dotCount(plain(component)), 1);
	assert(!plain(component).some((line) => line.includes(fence)));
	dispose();
	assert.equal(dotCount(plain(component)), 0);
	assert(plain(component).some((line) => line.trim() === `${fence}js`));
});

test("assistant Markdown transformers retain the actual content width", () => {
	const widths: number[] = [];
	const transformer = (markdown: string, context: any) => {
		widths.push(context.availableWidth);
		assert.equal(context.messageType, "assistant");
		return markdown.replace("SOURCE", "TRANSFORMED");
	};
	const component = new AssistantMessageComponent(
		message([text("SOURCE")]) as any, false, getMarkdownTheme(), "Thinking...", 1, [transformer],
	);
	assert(plain(component, 40).includes(" ● TRANSFORMED"));
	assert.equal(widths.at(-1), 37);
});

test("saved ccstyle mode is followed without importing the package", async () => {
	const directory = mkdtempSync(join(tmpdir(), "assistant-style-"));
	const settings = join(directory, "pi-cc-extensions.json");
	try {
		const enabled = createStyleEnabledReader(settings);
		assert.equal(enabled(), true);
		await Promise.resolve();
		writeFileSync(settings, JSON.stringify({ mode: "off" }));
		assert.equal(enabled(), false);
		await Promise.resolve();
		writeFileSync(settings, JSON.stringify({ mode: "compact" }));
		assert.equal(enabled(), true);
		await Promise.resolve();
		writeFileSync(settings, "invalid JSON");
		assert.equal(enabled(), true);
	} finally {
		rmSync(directory, { recursive: true });
	}
});

test("factory activates only in the TUI and cleans up across repeated session starts", () => {
	const mock = () => {
		const handlers = new Map<string, (event: any, ctx: any) => void>();
		assistantStyle({ on: (name: string, handler: any) => handlers.set(name, handler) } as any);
		return handlers;
	};
	const tui = mock();
	const headless = mock();
	const ctx = { mode: "tui", hasUI: true, ui: { requestRender() {} } };
	const component = new AssistantMessageComponent(message([text(code("answer()"))]) as any);
	tui.get("session_start")!({}, ctx);
	assert.equal(dotCount(plain(component)), 1);
	headless.get("session_start")!({}, { mode: "rpc", hasUI: true });
	headless.get("session_shutdown")!({}, {});
	assert.equal(dotCount(plain(component)), 1);
	tui.get("session_start")!({}, ctx);
	assert.equal(dotCount(plain(component)), 1);
	tui.get("session_shutdown")!({}, {});
	assert.equal(dotCount(plain(component)), 0);
	assert(plain(component).some((line) => line.trim() === `${fence}js`));
});
