import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const install = join(homedir(), ".pi/agent/install");
const version = readFileSync(join(install, "current-version"), "utf8").trim();
const root = join(install, "releases", version, "node_modules/@earendil-works/pi-coding-agent/dist");
const { loadExtensions } = await import(pathToFileURL(join(root, "core/extensions/loader.js")));

test("Skill loads through Pi and handles catalog, deduplication, resets, errors and rendering", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-skill-test-"));
	try {
		const result = await loadExtensions([new URL("./index.ts", import.meta.url).pathname], dir);
		assert.deepEqual(result.errors, []);
		assert.equal(result.extensions.length, 1);
		result.runtime.getActiveTools = () => ["Skill", "read"];
		const extension = result.extensions[0];
		const tool = extension.tools.get("Skill").definition;
		const fire = async (event, data = {}) => {
			for (const handler of extension.handlers.get(event) ?? []) await handler(data, {});
		};
		const path = join(dir, "SKILL.md");
		const source = "---\nname: demo\ndescription: Demo\n---\n\nFollow this demo.\n";
		writeFileSync(path, source);
		const skills = [
			{ name: "demo", description: "Demo skill", filePath: path, baseDir: dir },
			{ name: "manual", description: "Manual only", filePath: path, baseDir: dir, disableModelInvocation: true },
		];
		const start = () => fire("before_agent_start", { systemPromptOptions: { skills, sections: {} } });
		const call = (name, signal) => tool.execute("test", name === undefined ? {} : { name }, signal, undefined, {});
		await fire("session_start");
		const prompt = { systemPromptOptions: { skills, sections: { unrelated: "preserved" } } };
		await fire("before_agent_start", prompt);
		assert.match(prompt.systemPromptOptions.sections.skills, /<name>demo<\/name>/);
		assert.doesNotMatch(prompt.systemPromptOptions.sections.skills, /<name>manual<\/name>|Use the read tool/);
		assert.equal(prompt.systemPromptOptions.sections.unrelated, "preserved");
		assert.match((await call()).content[0].text, /demo: Demo skill/);
		assert.doesNotMatch((await call()).content[0].text, /manual/);
		const first = await call("demo");
		assert.equal(first.details.status, "loaded");
		assert.match(first.content[0].text, /Follow this demo/);
		assert.match(first.content[0].text, /Directory:/);
		assert.equal((await call("demo")).details.status, "already loaded");
		writeFileSync(path, source.replace("this demo", "changed demo"));
		assert.match((await call("demo")).content[0].text, /changed demo/);
		for (const event of ["session_compact", "session_tree", "session_start"]) {
			await fire(event);
			await start();
			assert.equal((await call("demo")).details.status, "loaded");
		}
		for (const name of ["dem", "DEMO", "../SKILL.md", "manual"]) {
			const unknown = await call(name);
			assert.equal(unknown.isError, true);
			assert.equal(unknown.details.status, "unknown skill");
		}
		assert.match((await call("dem")).content[0].text, /Possible matches: demo/);
		const theme = { fg: (_color, text) => text, bold: (text) => text };
		assert.match(tool.renderCall({ name: "demo" }, theme).render(120).join("\n"), /Skill demo/);
		const compact = tool.renderResult(first, { expanded: false }, theme).render(200).join("\n");
		assert.match(compact, /loaded/);
		assert.match(compact, /SKILL.md/);
		assert.doesNotMatch(compact, /Follow this demo/);
		assert.match(tool.renderResult(first, { expanded: true }, theme).render(200).join("\n"), /Follow this demo/);
		writeFileSync(path, "large\n".repeat(2100));
		for (let i = 0; i < 2; i++) {
			const partial = await call("demo");
			assert.equal(partial.details.status, "partial output");
			assert.match(partial.content[0].text, /Output truncated/);
		}
		rmSync(path);
		assert.equal((await call("demo")).isError, true);
		writeFileSync(path, source);
		assert.equal((await call("demo")).details.status, "loaded");
		const controller = new AbortController();
		controller.abort();
		await assert.rejects(call("demo", controller.signal), { name: "AbortError" });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
