import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const packagePath = process.env.PI_TEST_PACKAGE;
if (!packagePath) throw new Error("Set PI_TEST_PACKAGE to the installed @earendil-works/pi-coding-agent directory.");
const { loadExtensions } = await import(pathToFileURL(join(packagePath, "dist/core/extensions/loader.js")));
const { visibleWidth } = await import(pathToFileURL(join(dirname(packagePath), "pi-tui/dist/index.js")));
const { TuiBase } = await import(pathToFileURL(join(dirname(packagePath), "pi-tui/dist/tui.js")));
const extensionPath = join(dirname(fileURLToPath(import.meta.url)), "index.ts");

test("real Pi loader, lifecycle persistence, right overlay, scrolling, sanitization and resizing", async (t) => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-diff-ui-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
	git("init", "-q"); git("config", "user.name", "test"); git("config", "user.email", "test@example.invalid");
	await writeFile(join(cwd, "file"), "baseline\n");
	git("add", "."); git("commit", "-qm", "baseline");
	const loaded = await loadExtensions([extensionPath], cwd);
	assert.deepEqual(loaded.errors, []);
	const extension = loaded.extensions[0];
	const entries = [];
	loaded.runtime.appendEntry = (customType, data) => entries.push({ type: "custom", customType, data });
	const notifications = [];
	let component, options, renders = 0, closed = false;
	const tui = { terminal: { rows: 24 }, requestRender: () => renders++ };
	const ctx = {
		cwd, mode: "tui", hasUI: true,
		sessionManager: { getEntries: () => entries },
		ui: {
			notify: (...args) => notifications.push(args),
			custom: async (factory, opts) => {
				options = opts;
				component = factory(tui, { fg: (_color, text) => text }, {}, () => { closed = true; });
			},
		},
	};
	const start = extension.handlers.get("session_start")[0];
	await start({ reason: "startup" }, ctx);
	assert.equal(entries.length, 1);
	assert.deepEqual(notifications, []);
	const manifest = JSON.parse(await readFile(entries[0].data.manifest, "utf8"));
	t.after(() => rm(manifest.directory, { recursive: true, force: true }));
	await writeFile(join(cwd, "file"), "\x1b[31muntrusted\x1b[0m\n" + "界🙂 long line ".repeat(20) + "\n" + Array.from({ length: 80 }, (_, i) => `line ${i}`).join("\n"));
	await start({ reason: "reload" }, ctx);
	assert.equal(entries.length, 1, "reload must not reset baseline");
	await extension.commands.get("diff").handler("", ctx);
	assert.equal(options.overlay, true);
	assert.equal(options.overlayOptions.anchor, "top-right");
	const first = component.render(60);
	assert.ok(first.join("\n").includes("baseline"));
	assert.ok(first.join("\n").includes("\\x1b[31m"));
	assert.ok(!first.join("\n").includes("\x1b[31m"));
	component.handleInput("\x1b[6~");
	assert.notDeepEqual(component.render(60), first);
	component.handleInput("\x1b[F");
	assert.match(component.render(60).join("\n"), /line 79/);
	component.handleInput("\x1b[H");
	assert.deepEqual(component.render(60), first);
	for (const width of [1, 20, 40, 80, 120]) {
		for (const rows of [8, 24, 50]) {
			tui.terminal.rows = rows;
			component.invalidate();
			const lines = component.render(width);
			assert.ok(lines.length <= rows);
			assert.ok(lines.every((line) => visibleWidth(line) <= width));
		}
	}
	assert.ok(renders > 0);
	class Compositor extends TuiBase {
		mode = "regular";
		constructor() { super({ columns: 120, rows: 24, hideCursor() {} }); this.stopped = true; }
		doRender() {}
		frame() { return this.compositeOverlays(Array(24).fill("conversation"), 120, 24); }
	}
	const compositor = new Compositor();
	const editor = { render: () => ["editor"], invalidate() {} };
	compositor.addChild(editor);
	compositor.setFocus(editor);
	tui.terminal.rows = 24;
	const handle = compositor.showOverlay(component, options.overlayOptions);
	const frame = compositor.frame();
	assert.deepEqual(handle.getBounds(), { row: 0, col: 60, width: 60, height: 23 });
	assert.ok(frame[0].startsWith("conversation"));
	assert.equal(compositor.getFocusedComponent(), component);
	handle.hide();
	assert.equal(compositor.getFocusedComponent(), editor);
	component.handleInput("\x1b");
	assert.ok(closed);
	await extension.commands.get("diff").handler("", { ...ctx, mode: "rpc" });
	assert.match(notifications.at(-1)[0], /interactive terminal/);
});

test("not a Git repository gives actionable feedback", async (t) => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-diff-no-git-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	const loaded = await loadExtensions([extensionPath], cwd);
	assert.deepEqual(loaded.errors, []);
	const notices = [];
	const ctx = { cwd, mode: "tui", hasUI: true, ui: { notify: (text) => notices.push(text) } };
	await loaded.extensions[0].handlers.get("session_start")[0]({ reason: "startup" }, ctx);
	await loaded.extensions[0].commands.get("diff").handler("", ctx);
	assert.match(notices.at(-1), /not a git repository/);
});
