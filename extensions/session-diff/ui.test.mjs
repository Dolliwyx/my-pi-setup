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
const { visibleWidth, sliceByColumn, stripTerminalSequences, TuiAltScreen } = await import(pathToFileURL(join(dirname(packagePath), "pi-tui/dist/index.js")));
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
	const tui = { terminal: { rows: 24, columns: 120 }, requestRender: () => renders++ };
	const ctx = {
		cwd, mode: "tui", hasUI: true,
		sessionManager: { getEntries: () => entries },
		ui: {
			notify: (...args) => notifications.push(args),
			custom: async (factory, opts) => {
				component = factory(tui, { fg: (_color, text) => text }, {}, () => { closed = true; });
				// Match Pi: resolve the options once, then retain the returned object.
				options = { ...opts, overlayOptions: opts.overlayOptions() };
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
	const collapsed = component.render(60);
	assert.match(collapsed.join("\n"), /▶ file/);
	assert.doesNotMatch(collapsed.join("\n"), /baseline|untrusted/);
	component.handleInput("\r");
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
	component.handleInput("]");
	compositor.frame();
	assert.deepEqual(handle.getBounds(), { row: 0, col: 50, width: 70, height: 23 });
	component.handleInput("[");
	compositor.frame();
	assert.equal(handle.getBounds().width, 60);
	handle.hide();
	assert.equal(compositor.getFocusedComponent(), editor);
	component.handleInput("\x1b");
	assert.ok(closed);
	await extension.commands.get("diff").handler("", { ...ctx, mode: "rpc" });
	assert.match(notifications.at(-1)[0], /interactive terminal/);

	const Panel = component.constructor;
	const theme = { fg: (_color, text) => text };
	const patch = [
		'diff --git "first file.ts" "first file.ts"',
		'--- "first file.ts"', '+++ "first file.ts"',
		"@@ -1,4 +1,5 @@", " context", "-old-one", "-old-two", "+new-one", "+new-two", "+extra-new", " tail",
		'diff --git "second.ts" "second.ts"',
		"Binary files differ",
		'diff --git "line\\nbreak\\u001b.ts"',
		"Unable to show diff: example",
	].join("\n");
	const mouse = (type, x, y, width = 100, height = 49) => ({ type, button: "left", x, y, screenX: x + 20, screenY: y, width, height, shift: false, alt: false, ctrl: false });

	await t.test("file accordion, selection, click targets and empty state", () => {
		const panel = new Panel({ terminal: { rows: 50, columns: 120 }, requestRender() {} }, theme, patch, () => {});
		let frame = panel.render(100);
		assert.match(frame.join("\n"), /› ▶ first file.ts/);
		assert.doesNotMatch(frame.join("\n"), /old-one|Binary files|Unable to show/);
		panel.handleInput("\r");
		frame = panel.render(100);
		assert.match(frame.join("\n"), /old-one/);
		panel.handleInput("\t");
		panel.render(100);
		panel.handleInput("\r");
		frame = panel.render(100);
		assert.match(frame.join("\n"), /› ▼ second.ts/);
		assert.match(frame.join("\n"), /Binary files differ/);
		assert.doesNotMatch(frame.join("\n"), /old-one/);
		panel.handleInput("\x1b[Z");
		frame = panel.render(100);
		assert.match(frame.join("\n"), /› ▶ first file.ts/);
		assert.equal(panel.handleMouse(mouse("press", 4, 2)).handled, true);
		assert.doesNotMatch(panel.render(100).join("\n"), /old-one/);
		panel.handleMouse(mouse("click", 4, 2));
		frame = panel.render(100);
		assert.match(frame.join("\n"), /old-one/);
		const contentRow = frame.findIndex((line) => line.includes("-old-one"));
		assert.equal(panel.handleMouse(mouse("click", 4, contentRow)), undefined);
		panel.handleMouse(mouse("click", 4, 2));
		frame = panel.render(100);
		assert.doesNotMatch(frame.join("\n"), /old-one/);
		assert.ok(frame.join("\n").includes("line\\nbreak\\u001b.ts"));
		assert.ok(!frame.join("\n").includes("\x1b"));
		panel.handleMouse(mouse("click", 4, 4));
		assert.match(panel.render(100).join("\n"), /Unable to show diff: example/);
		assert.doesNotMatch(panel.render(100).join("\n"), /old-one|Binary files differ/);
		const empty = new Panel(tui, theme, "No uncommitted changes made since the session baseline.", () => {});
		empty.handleInput("\t"); empty.handleInput("\r");
		assert.match(empty.render(60).join("\n"), /No uncommitted changes/);
	});

	await t.test("split aligns replacements and preserves unmatched lines, hunks, wrapping and newline markers", () => {
		const long = "界🙂".repeat(30);
		const text = 'diff --git "file" "file"\n--- "file"\n+++ "file"\n@@ -1,3 +1,4 @@\n-old-one\n-old-two\n+new-one\n+new-two\n+extra-new\n context\n@@ -8 +9 @@\n-' + long + '\n\\ No newline at end of file\n+short\n\\ No newline at end of file';
		const panel = new Panel({ terminal: { rows: 80, columns: 120 }, requestRender() {} }, theme, text, () => {});
		panel.handleInput("\r"); panel.handleInput("v");
		const frame = panel.render(100);
		const output = frame.join("\n");
		assert.match(output, /\[Split\]/);
		assert.match(output, /Old\s+│\s+New/);
		assert.match(output, /-old-one\s+│ \+new-one/);
		assert.match(output, /-old-two\s+│ \+new-two/);
		assert.match(output, /│\s+│ \+extra-new/);
		assert.match(output, /context\s+│\s+context/);
		assert.match(output, /@@ -8 \+9 @@/);
		// Rejoin each column independently: long lines and their notes wrap across rows.
		const oldText = frame.map((line) => sliceByColumn(line, 1, 47)).join("").replace(/\s/g, "");
		const newText = frame.map((line) => sliceByColumn(line, 51, 48)).join("").replace(/\s/g, "");
		assert.equal((oldText.match(/Nonewlineatendoffile/g) ?? []).length, 1);
		assert.equal((newText.match(/Nonewlineatendoffile/g) ?? []).length, 1);
		assert.equal((oldText.match(/界🙂/g) ?? []).length, 30);
		assert.ok(frame.every((line) => visibleWidth(line) <= 100));
		for (const width of [1, 20, 40, 79, 80, 100, 120]) {
			const rows = panel.render(width);
			assert.ok(rows.every((line) => visibleWidth(line) <= width));
			if (width >= 40) assert.match(rows[1], width >= 80 ? /\[Split\]/ : /Unified/);
		}
		assert.match(panel.render(100)[1], /\[Split\]/, "split preference survives narrow fallback");
		panel.handleInput("v");
		assert.match(panel.render(100)[1], /\[Unified\]/);
		assert.match(panel.render(100).join("\n"), /-old-one/);
	});

	await t.test("split keeps added/deleted files on the correct side and invalidation rebuilds theme colors", () => {
		let color = "31";
		const coloredTheme = { fg: (_color, text) => `\x1b[${color}m${text}\x1b[39m` };
		const text = [
			'diff --git "added" "added"', "old mode 000000", "new mode 100644", "--- /dev/null", '+++ "added"', "@@ -0,0 +1,2 @@", "+first-added", "+second-added",
			'diff --git "deleted" "deleted"', "old mode 100644", "new mode 000000", '--- "deleted"', "+++ /dev/null", "@@ -1,2 +0,0 @@", "-first-deleted", "-second-deleted",
		].join("\n");
		const panel = new Panel({ terminal: { rows: 24, columns: 120 }, requestRender() {} }, coloredTheme, text, () => {});
		panel.handleInput("\r"); panel.handleInput("v");
		let frame = panel.render(100);
		let output = stripTerminalSequences(frame.join("\n"));
		assert.match(output, /old mode 000000/);
		assert.match(output, /new mode 100644/);
		assert.match(output, /--- \/dev\/null/);
		assert.match(output, /│\s+│ \+first-added/);
		assert.match(output, /│\s+│ \+second-added/);
		panel.handleInput("\t"); panel.render(100); panel.handleInput("\r");
		frame = panel.render(100);
		output = stripTerminalSequences(frame.join("\n"));
		assert.match(output, /new mode 000000/);
		assert.match(output, /\+\+\+ \/dev\/null/);
		assert.match(output, /-first-deleted\s+│\s+│/);
		assert.match(output, /-second-deleted\s+│\s+│/);
		assert.doesNotMatch(output, /first-added/);
		assert.ok(frame.every((line) => visibleWidth(line) <= 100));
		assert.ok(frame.join("\n").includes("\x1b[31m"));
		color = "34";
		panel.invalidate();
		frame = panel.render(100);
		assert.ok(frame.join("\n").includes("\x1b[34m"));
		assert.ok(!frame.join("\n").includes("\x1b[31m"));
		assert.equal(stripTerminalSequences(frame.join("\n")), output);
	});

	await t.test("keyboard selection reveals offscreen headers and clicks account for scrolling", () => {
		const text = Array.from({ length: 30 }, (_, i) => `diff --git "file-${i}" "file-${i}"\nBinary files differ`).join("\n");
		const panel = new Panel({ terminal: { rows: 8, columns: 120 }, requestRender() {} }, theme, text, () => {});
		panel.render(60);
		for (let i = 0; i < 10; i++) { panel.handleInput("\t"); panel.render(60); }
		assert.match(panel.render(60).join("\n"), /› ▶ file-10/);
		panel.handleMouse(mouse("click", 4, 2, 60, 7));
		assert.match(panel.render(60).join("\n"), /› ▼ file-9/);
		panel.handleMouse({ ...mouse("wheel", 4, 2, 60, 7), wheelDelta: 10 });
		assert.doesNotMatch(panel.render(60).join("\n"), /› ▼ file-10/);
	});

	await t.test("real fullscreen mouse dispatch opens files, switches view and drags the mounted overlay", () => {
		class Fullscreen extends TuiAltScreen {
			constructor() { super({ columns: 120, rows: 24, hideCursor() {} }); this.stopped = true; }
			doRender() {}
			frame() { return this.compositeOverlays(Array(24).fill("conversation"), this.terminal.columns, this.terminal.rows); }
		}
		const screen = new Fullscreen();
		const panel = new Panel(screen, theme, patch, () => {});
		const opts = panel.overlayOptions();
		const handle = screen.showOverlay(panel, opts);
		screen.frame();
		const click = (x, y) => {
			screen.handleMouseEvent({ button: 0, x, y, release: false });
			screen.handleMouseEvent({ button: 0, x, y, release: true });
		};
		click(64, 2);
		assert.match(screen.frame().join("\n"), /old-one/);
		click(78, 1);
		assert.match(screen.frame().join("\n"), /Unified \(split needs 80 cols\)/);
		screen.handleMouseEvent({ button: 0, x: 60, y: 8, release: false });
		screen.handleMouseEvent({ button: 32, x: 20, y: 8, release: false });
		screen.handleMouseEvent({ button: 0, x: 20, y: 8, release: true });
		assert.match(screen.frame().join("\n"), /\[Split\]/);
		assert.equal(handle.getBounds().width, 100);
		assert.equal(handle.getBounds().col, 20);
		assert.equal(panel.overlayOptions(), opts, "options object must stay mounted");
		for (let i = 0; i < 10; i++) { panel.handleInput("]"); screen.frame(); }
		assert.equal(handle.getBounds().width, 120);
		for (let i = 0; i < 10; i++) { panel.handleInput("["); screen.frame(); }
		assert.equal(handle.getBounds().width, 40);
		assert.equal(handle.getBounds().col, 80);
		screen.terminal.columns = 30;
		assert.ok(screen.frame().every((line) => visibleWidth(line) <= 30));
		assert.equal(handle.getBounds().width, 30);
		handle.hide();
	});
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
