import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";

const PATCH_KEY = Symbol.for("pi.extension.clean-codeblocks.patch.v1");

type MarkdownInternals = {
  renderToken?: (...args: unknown[]) => string[];
  theme?: {
    codeBlockIndent?: string;
    codeBlock?: (text: string) => string;
    codeBlockBorder?: (text: string) => string;
    highlightCode?: (code: string, lang?: string) => string[];
  };
  [PATCH_KEY]?: {
    originalRenderToken: (...args: unknown[]) => string[];
  };
};

type MarkdownCodeToken = {
  type?: string;
  text?: string;
  lang?: string;
};

export default function (pi: ExtensionAPI) {
  const patchError = applyPatch();

  pi.on("session_start", async (_event, ctx) => {
    if (!patchError || !ctx.hasUI) return;
    ctx.ui.notify(`clean-codeblocks: ${patchError}`, "warning");
  });
}

function applyPatch(): string | undefined {
  const proto = Markdown.prototype as MarkdownInternals;
  const originalRenderToken = proto[PATCH_KEY]?.originalRenderToken ?? proto.renderToken;

  if (typeof originalRenderToken !== "function") {
    return "Pi Markdown internals changed; leaving code fences visible.";
  }

  Object.defineProperty(proto, PATCH_KEY, {
    value: { originalRenderToken },
    configurable: true,
  });

  proto.renderToken = function cleanCodeblocksRenderToken(
    this: MarkdownInternals,
    token: MarkdownCodeToken,
    width: number,
    nextTokenType?: string,
    styleContext?: unknown,
  ): string[] {
    if (token?.type !== "code") {
      return originalRenderToken.call(this, token, width, nextTokenType, styleContext);
    }

    try {
      return renderCodeBlockWithoutFences.call(this, token, width, nextTokenType);
    } catch {
      return originalRenderToken.call(this, token, width, nextTokenType, styleContext);
    }
  };

  return undefined;
}

function renderCodeBlockWithoutFences(
  this: MarkdownInternals,
  token: MarkdownCodeToken,
  _width: number,
  nextTokenType?: string,
): string[] {
  const theme = this.theme;
  if (!theme) return [];

  const code = theme.codeBlock ?? ((text: string) => text);
  const text = token.text ?? "";
  const lang = typeof token.lang === "string" && token.lang.length > 0 ? token.lang : undefined;

  const lines: string[] = [];
  const codeLines = theme.highlightCode
    ? theme.highlightCode(text, lang)
    : text.split("\n").map((line) => code(line));

  for (const line of codeLines) {
    lines.push(line);
  }

  if (nextTokenType && nextTokenType !== "space") {
    lines.push("");
  }

  return lines;
}
