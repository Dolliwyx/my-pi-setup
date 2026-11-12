import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { Text } from "@earendil-works/pi-tui";
import type { ToolRendererResolver } from "@earendil-works/pi-coding-agent";
import assistantStyle from "../index.ts";

test("skill reads receive a display-only label; other calls and results stay native", () => {
	let resolver!: ToolRendererResolver;
	assistantStyle({
		on() {},
		registerToolRenderer(value: ToolRendererResolver) { resolver = value; },
	} as any);
	const native = new Text("native read", 0, 0);
	const original = {
		renderCall: () => native,
		renderResult: () => new Text("native result", 0, 0),
		renderShell: "default" as const,
	};
	assert.equal(resolver("bash", () => original), original);
	assert.equal(resolver("read", () => undefined), undefined);
	const renderer = resolver("read", () => original)!;
	assert.equal(renderer.renderResult, original.renderResult);
	assert.equal(renderer.renderShell, original.renderShell);
	const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
	const context = { cwd: "/skills/example" };
	for (const path of ["/skills/example/SKILL.md", "../example/SKILL.md", "SKILL.md", "@/skills/example/SKILL.md"]) {
		const args = { path, offset: 20, limit: 10 };
		const saved = JSON.stringify(args);
		const component = renderer.renderCall!(args, theme as any, context as any);
		assert.equal(stripVTControlCharacters(component.render(80).join("\n")).trim(), "Skill · example");
		assert.equal(JSON.stringify(args), saved);
	}
	for (const args of [{ path: "README.md" }, { path: "SKILL.md.bak" }, { path: "skill.md" }, {}, { path: 42 }]) {
		assert.equal(renderer.renderCall!(args, theme as any, context as any), native);
	}
	assert.equal(
		renderer.renderCall!({ file_path: "/skills/alias/SKILL.md" }, theme as any, context as any).render(80)[0].trim(),
		"Skill · alias",
	);
});
