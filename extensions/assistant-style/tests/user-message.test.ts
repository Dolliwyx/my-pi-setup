import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { UserMessageComponent, getMarkdownTheme, initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { installUserMessageRendering } from "../index.ts";

const plain = (component: UserMessageComponent, width = 60) =>
	component.render(width).map((line) => stripVTControlCharacters(line).trimEnd());

describe("compact user-message band", () => {
	let enabled = true;
	let dispose: () => void;

	beforeEach(() => {
		initTheme("dark");
		enabled = true;
		dispose = installUserMessageRendering(() => enabled);
	});
	afterEach(() => dispose());

	test("short messages occupy one highlighted row with a prompt marker", () => {
		const component = new UserMessageComponent("ok do that then");
		assert.deepEqual(plain(component), [" ❯ ok do that then"]);
		const lines = component.render(60);
		assert.equal(lines.length, 1);
		assert.match(lines[0], /\x1b\[48[;:]/);
		assert.equal(visibleWidth(lines[0]), 60);
	});

	test("wrapped and paragraph lines align under the first line's text", () => {
		const component = new UserMessageComponent("First line has enough words to wrap several times.\n\nSecond paragraph.");
		const lines = plain(component, 24);
		assert(lines[0].startsWith(" ❯ First"));
		assert(lines.at(-1)?.trim());
		assert.equal(lines.filter((line) => line.includes("❯")).length, 1);
		assert(lines.some((line) => line === ""));
		for (const line of lines.slice(1).filter((line) => line.trim())) {
			assert(line.startsWith("   "));
			assert(!line.startsWith("    "));
		}
	});

	test("user Markdown, literal escapes, and source text are preserved", () => {
		const source = "3) keep numbering\n7) keep numbering\n\n\\*literal\\*";
		const component = new UserMessageComponent(source);
		const lines = plain(component);
		assert(lines.some((line) => line.includes("3) keep numbering")));
		assert(lines.some((line) => line.includes("7) keep numbering")));
		assert(lines.some((line) => line.includes("\\*literal\\*")));
		assert.equal((component as any).text, source);
	});

	test("terminal zone markers survive on the single remaining row", () => {
		const lines = new UserMessageComponent("single row").render(40);
		assert.equal(lines.length, 1);
		assert(lines[0].includes("\x1b]133;A\x07"));
		assert(lines[0].includes("\x1b]133;B\x07"));
		assert(lines[0].includes("\x1b]133;C\x07"));
	});

	test("resize, wide text, and zero-width terminals stay within bounds", () => {
		const component = new UserMessageComponent("你好 👩‍💻 café é — enough text to wrap");
		for (const width of [0, 1, 2, 3, 4, 5, 8, 12, 24, 80, 12]) {
			const lines = component.render(width);
			for (const line of lines) assert(visibleWidth(line) <= width, `width ${width}`);
			if (width >= 5) assert(plain(component, width)[0].startsWith(" ❯ "));
		}
	});

	test("theme changes refresh the highlighted band", () => {
		const component = new UserMessageComponent("theme check");
		const dark = component.render(40);
		initTheme("light");
		component.invalidate();
		const light = component.render(40);
		assert.notDeepEqual(dark, light);
		assert.deepEqual(plain(component, 40), [" ❯ theme check"]);
	});

	test("off mode and shutdown restore native padding; reload does not duplicate markers", () => {
		const component = new UserMessageComponent("mode check");
		assert.deepEqual(plain(component), [" ❯ mode check"]);
		enabled = false;
		assert.deepEqual(plain(component), ["", " mode check", ""]);
		enabled = true;
		assert.deepEqual(plain(component), [" ❯ mode check"]);
		const oldDispose = dispose;
		dispose = installUserMessageRendering(() => enabled);
		oldDispose();
		assert.deepEqual(plain(component), [" ❯ mode check"]);
		dispose();
		assert.deepEqual(plain(component), ["", " mode check", ""]);
	});

	test("fullscreen wrappers keep their markers across disposal and reinstallation", () => {
		dispose();
		const prototype = UserMessageComponent.prototype as any;
		const native = prototype.render;
		const start = "\x1b_cc:p\x07";
		const end = "\x1b_cc:P\x07";
		const wrap = (render: any) => function (this: any, width: number) {
			const lines = render.call(this, width);
			if (lines.length) {
				lines[0] += start;
				lines[lines.length - 1] += end;
			}
			return lines;
		};
		try {
			for (const order of ["local-first", "fullscreen-first"]) {
				prototype.render = native;
				if (order === "fullscreen-first") prototype.render = wrap(native);
				dispose = installUserMessageRendering();
				const localLayer = prototype.render;
				if (order === "local-first") prototype.render = wrap(localLayer);
				const component = new UserMessageComponent("sticky prompt");
				let lines = component.render(40);
				assert.equal(lines.length, 1);
				assert(lines[0].includes(start) && lines[0].includes(end));
				assert(lines[0].includes("❯"));
				dispose();
				if (order === "local-first") prototype.render = localLayer;
				dispose = installUserMessageRendering();
				lines = component.render(40);
				assert.equal(lines.length, 1);
				assert.equal(stripVTControlCharacters(lines[0]).split("❯").length - 1, 1);
				dispose();
			}
		} finally {
			dispose();
			prototype.render = native;
		}
	});

	test("Markdown transformers receive the narrower user content width", () => {
		let contentWidth = 0;
		const transform = (value: string, context: any) => {
			assert.equal(context.messageType, "user");
			contentWidth = context.availableWidth;
			return value.replace("SOURCE", "TRANSFORMED");
		};
		const component = new UserMessageComponent("SOURCE", getMarkdownTheme(), 1, [transform]);
		assert.deepEqual(plain(component, 40), [" ❯ TRANSFORMED"]);
		assert.equal(contentWidth, 37);
	});
});
