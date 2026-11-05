import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { AssistantMessageComponent, UserMessageComponent, getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Markdown, truncateToWidth, type Component } from "@earendil-works/pi-tui";

const ASSISTANT_TEXT_COMPONENT = Symbol.for("pi.ccstyle.assistant-text-component");
const ASSISTANT_TEXT_RENDER_PATCH = Symbol.for("pi.ccstyle.assistant-text-render-patch");
const USER_TEXT_COMPONENT = Symbol.for("local.assistant-style.user-text-component");
const USER_MESSAGE_RENDER_PATCH = Symbol.for("local.assistant-style.user-message-render-patch");

class AssistantText implements Component {
	readonly [ASSISTANT_TEXT_COMPONENT]: any;
	private readonly markdown: Markdown;
	private text: string;

	constructor(source: any, private readonly enabled: () => boolean) {
		this[ASSISTANT_TEXT_COMPONENT] = source;
		this.text = source.text;
		this.markdown = new Markdown(
			this.text, 0, 0, source.theme, source.defaultTextStyle, source.options,
		);
		// Remove generated fence rows at the token boundary, not literal backticks in code.
		const markdown = this.markdown as any;
		const renderToken = markdown.renderToken;
		markdown.renderToken = function (token: any, width: number, nextType?: string, style?: any) {
			const lines = renderToken.call(this, token, width, nextType, style);
			if (token.type === "code") {
				lines.shift();
				lines.splice(nextType && nextType !== "space" ? -2 : -1, 1);
			}
			return lines;
		};
	}

	render(width: number): string[] {
		const source = this[ASSISTANT_TEXT_COMPONENT];
		if (!this.enabled()) return source.render(width);
		if (this.text !== source.text) {
			this.text = source.text;
			this.markdown.setText(this.text);
		}
		let first = true;
		return this.markdown.render(Math.max(1, width - 3)).map((line) => {
			const marked = first && stripVTControlCharacters(line).trim().length > 0;
			if (marked) first = false;
			return truncateToWidth(`${marked ? " ● " : "   "}${line}`, Math.max(0, width), "");
		});
	}

	invalidate(): void {
		this[ASSISTANT_TEXT_COMPONENT].invalidate();
		this.markdown.invalidate();
	}
}

type AssistantTextPatch = { dispose(): void };

export function installAssistantTextRendering(isEnabled = () => true): () => void {
	const host = globalThis as unknown as Record<symbol, AssistantTextPatch | undefined>;
	host[ASSISTANT_TEXT_RENDER_PATCH]?.dispose();
	const prototype = AssistantMessageComponent.prototype as any;
	const original = prototype.render;
	const views = new WeakMap<object, AssistantText>();
	let active = true;
	const enabled = () => active && isEnabled();
	const installed = function (this: any, width: number): string[] {
		const children = this.contentContainer?.children ?? [];
		for (let i = 0; i < children.length; i++) {
			const source = children[i]?.[ASSISTANT_TEXT_COMPONENT] ?? children[i];
			if (!(source instanceof Markdown) || (source as any).defaultTextStyle?.italic) continue;
			if (!enabled()) {
				children[i] = source;
				continue;
			}
			let view = views.get(source);
			if (!view) {
				view = new AssistantText(source, enabled);
				views.set(source, view);
			}
			children[i] = view;
		}
		return original.call(this, width);
	};
	const patch: AssistantTextPatch = {
		dispose() {
			active = false;
			if (prototype.render === installed) prototype.render = original;
			if (host[ASSISTANT_TEXT_RENDER_PATCH] === patch) delete host[ASSISTANT_TEXT_RENDER_PATCH];
		},
	};
	prototype.render = installed;
	host[ASSISTANT_TEXT_RENDER_PATCH] = patch;
	return () => patch.dispose();
}

class UserText implements Component {
	readonly [USER_TEXT_COMPONENT]: any;
	private readonly markdown: Markdown;
	private text: string;

	constructor(source: any, private readonly enabled: () => boolean) {
		this[USER_TEXT_COMPONENT] = source;
		this.text = source.text;
		this.markdown = new Markdown(
			this.text, 0, 0, source.theme, source.defaultTextStyle, source.options,
		);
	}

	render(width: number): string[] {
		const source = this[USER_TEXT_COMPONENT];
		if (!this.enabled()) return source.render(width);
		if (this.text !== source.text) {
			this.text = source.text;
			this.markdown.setText(this.text);
		}
		let first = true;
		return this.markdown.render(Math.max(1, width - 3)).map((line) => {
			const marked = first && stripVTControlCharacters(line).trim().length > 0;
			if (marked) first = false;
			const marker = source.defaultTextStyle?.color?.("❯") ?? "❯";
			const gutter = marked ? ` ${marker} ` : "   ";
			const prefix = source.defaultTextStyle?.bgColor?.(gutter) ?? gutter;
			return truncateToWidth(`${prefix}${line}`, Math.max(0, width), "");
		});
	}

	invalidate(): void {
		this[USER_TEXT_COMPONENT].invalidate();
		this.markdown.invalidate();
	}
}

export function installUserMessageRendering(isEnabled = () => true): () => void {
	const host = globalThis as unknown as Record<symbol, AssistantTextPatch | undefined>;
	host[USER_MESSAGE_RENDER_PATCH]?.dispose();
	const prototype = UserMessageComponent.prototype as any;
	const original = prototype.render;
	const views = new WeakMap<object, UserText>();
	let active = true;
	const enabled = () => active && isEnabled();
	const installed = function (this: any, width: number): string[] {
		// A disposed layer may remain beneath another extension's fullscreen wrapper.
		if (!active) return original.call(this, width);
		for (let i = 0; i < this.children.length; i++) {
			const source = this.children[i]?.[USER_TEXT_COMPONENT] ?? this.children[i];
			if (!(source instanceof Markdown)) continue;
			if (!enabled()) {
				this.children[i] = source;
				continue;
			}
			let view = views.get(source);
			if (!view) {
				view = new UserText(source, enabled);
				views.set(source, view);
			}
			this.children[i] = view;
		}
		return original.call(this, width);
	};
	const patch: AssistantTextPatch = {
		dispose() {
			active = false;
			if (prototype.render === installed) prototype.render = original;
			if (host[USER_MESSAGE_RENDER_PATCH] === patch) delete host[USER_MESSAGE_RENDER_PATCH];
		},
	};
	prototype.render = installed;
	host[USER_MESSAGE_RENDER_PATCH] = patch;
	return () => patch.dispose();
}

export function createStyleEnabledReader(settingsPath = join(getAgentDir(), "pi-cc-extensions.json")) {
	let cached = false;
	let enabled = true;
	return () => {
		// Read once per synchronous render pass, not once per historical message.
		if (!cached) {
			cached = true;
			queueMicrotask(() => { cached = false; });
			try {
				enabled = JSON.parse(readFileSync(settingsPath, "utf8")).mode !== "off";
			} catch {
				enabled = true;
			}
		}
		return enabled;
	};
}

export default function (pi: ExtensionAPI): void {
	let dispose: (() => void) | undefined;
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui" || !ctx.hasUI) return;
		dispose?.();
		const isEnabled = createStyleEnabledReader();
		const disposeAssistant = installAssistantTextRendering(isEnabled);
		const disposeUser = installUserMessageRendering(isEnabled);
		dispose = () => {
			disposeUser();
			disposeAssistant();
		};
	});
	pi.on("session_shutdown", () => {
		dispose?.();
		dispose = undefined;
	});
}
