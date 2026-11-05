import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { AssistantMessageComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { config, getCompactThinkingConfig } from "pi-cc-extensions/extensions/config/config.ts";
import { installCompactThinking } from "pi-cc-extensions/extensions/feature/compact-thinking.ts";
import { installCompactMode } from "pi-cc-extensions/extensions/renderer/compact-mode.ts";
import { installAssistantTextRendering } from "../index.ts";

const fence = "`".repeat(3);
const message = (content: any[]) => ({
	role: "assistant", content, stopReason: "stop", timestamp: Date.now(),
});
const text = (value: string) => ({ type: "text", text: value });
const code = (body: string) => `${fence}js\n${body}\n${fence}`;
const plain = (component: any): string[] =>
	component.render(60).map((line: string) => stripVTControlCharacters(line).trimEnd());
const dotCount = (lines: string[]) => lines.filter((line) => line.startsWith(" ● ")).length;

test("compact-thinking and compact-round rendering both retain the text decoration", () => {
	initTheme("dark");
	const originalMode = config.mode;
	const dispose = installAssistantTextRendering(() => config.mode !== "off");
	const handlers = new Map<string, Array<(event: any, ctx: any) => void>>();
	const pi = {
		on(name: string, handler: (event: any, ctx: any) => void) {
			const list = handlers.get(name) ?? [];
			list.push(handler);
			handlers.set(name, list);
		},
		appendEntry() {},
	};
	const ctx = {
		mode: "tui", hasUI: true,
		sessionManager: { getBranch: () => [], getEntries: () => [] },
		ui: { theme: { fg: (_key: string, value: string) => value }, setWidget() {} },
	};
	const query = installCompactThinking(pi as any, getCompactThinkingConfig());
	for (const handler of handlers.get("session_start") ?? []) handler({}, ctx);
	const compact = installCompactMode({ query, isIdle: () => true });
	try {
		for (const mode of ["on", "compact"] as const) {
			config.mode = mode;
			for (const hidden of [false, true]) {
				const component = new AssistantMessageComponent(message([
					{ type: "thinking", thinking: "Thinking preview" },
					text(`Reply\n\n${code("answer()")}`),
				]) as any, hidden);
				const lines = plain(component);
				assert.equal(dotCount(lines), 1, `${mode}, hidden=${hidden}`);
				assert(!lines.some((line) => line.includes(fence)));
				assert(lines.some((line) => line.includes("answer()")));
			}
		}
	} finally {
		compact.shutdown();
		for (const handler of handlers.get("session_shutdown") ?? []) handler({}, ctx);
		dispose();
		config.mode = originalMode;
	}
});
