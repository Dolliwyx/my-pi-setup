import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Container, truncateToWidth, type Component } from "@earendil-works/pi-tui";

const ELLIPSIS = "…";

type AnyTool = ToolDefinition<any, any, any>;

type MinimalToolContext = {
  executionStarted: boolean;
  isPartial: boolean;
  isError: boolean;
};

class SingleLine implements Component {
  private text = "";

  setText(text: string): void {
    this.text = text;
  }

  render(width: number): string[] {
    return [truncateToWidth(this.text, width, ELLIPSIS)];
  }

  invalidate(): void {}
}

class EmptyResult extends Container {}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const tools = [
      createBashToolDefinition(ctx.cwd),
      createReadToolDefinition(ctx.cwd),
      createEditToolDefinition(ctx.cwd),
      createWriteToolDefinition(ctx.cwd),
      createGrepToolDefinition(ctx.cwd),
      createFindToolDefinition(ctx.cwd),
      createLsToolDefinition(ctx.cwd),
    ];

    for (const tool of tools) {
      pi.registerTool(toMinimalTool(tool as AnyTool));
    }
  });
}

function toMinimalTool(tool: AnyTool): AnyTool {
  const defaultRenderResult = tool.renderResult;

  return {
    ...tool,
    renderShell: "self",
    renderCall(args, theme, context) {
      const line = context.lastComponent instanceof SingleLine ? context.lastComponent : new SingleLine();
      const dot = statusDot(theme, context);
      const name = theme.fg("toolTitle", theme.bold(tool.name));
      const summary = formatSummary(tool.name, args);
      line.setText(summary ? `${dot} ${name} ${theme.fg("dim", summary)}` : `${dot} ${name}`);
      return line;
    },
    renderResult(result, options, theme, context) {
      if (options.expanded && defaultRenderResult) {
        return defaultRenderResult(
          result,
          options,
          theme,
          context.lastComponent instanceof EmptyResult ? { ...context, lastComponent: undefined } : context,
        );
      }

      const empty = context.lastComponent instanceof EmptyResult ? context.lastComponent : new EmptyResult();
      empty.clear();
      return empty;
    },
  };
}

function statusDot(theme: Parameters<NonNullable<AnyTool["renderCall"]>>[1], context: MinimalToolContext): string {
  if (!context.executionStarted) return theme.fg("muted", "●");
  if (context.isPartial) return theme.fg("warning", "●");
  if (context.isError) return theme.fg("error", "●");
  return theme.fg("success", "●");
}

function formatSummary(toolName: string, args: unknown): string {
  const input = isRecord(args) ? args : {};

  switch (toolName) {
    case "bash":
      return truncatePlain(asString(input.command) ?? "", 96);
    case "read":
      return [formatPath(input), formatRange(input)].filter(Boolean).join("");
    case "edit": {
      const count = Array.isArray(input.edits) ? input.edits.length : undefined;
      return [formatPath(input), count ? `${count} edit${count === 1 ? "" : "s"}` : undefined]
        .filter(Boolean)
        .join(" · ");
    }
    case "write":
    case "ls":
      return formatPath(input);
    case "grep": {
      const pattern = asString(input.pattern);
      const path = asString(input.path) ?? ".";
      return [pattern ? `/${truncatePlain(pattern, 40)}/` : undefined, `in ${path}`].filter(Boolean).join(" ");
    }
    case "find": {
      const pattern = asString(input.pattern);
      const path = asString(input.path) ?? ".";
      return [pattern ? truncatePlain(pattern, 48) : undefined, `in ${path}`].filter(Boolean).join(" ");
    }
    default:
      return "";
  }
}

function formatPath(input: Record<string, unknown>): string {
  const path = asString(input.path ?? input.file_path);
  return path ? shortenPath(path) : "";
}

function formatRange(input: Record<string, unknown>): string {
  const offset = typeof input.offset === "number" ? input.offset : undefined;
  const limit = typeof input.limit === "number" ? input.limit : undefined;
  if (offset === undefined && limit === undefined) return "";
  const start = offset ?? 1;
  const end = limit !== undefined ? start + limit - 1 : undefined;
  return end ? `:${start}-${end}` : `:${start}`;
}

function shortenPath(path: string): string {
  if (path.length <= 64) return path;
  const parts = path.split("/");
  if (parts.length <= 2) return truncatePlain(path, 64);
  return `${parts[0] === "" ? "/" : ""}${parts.slice(-2).join("/")}`;
}

function truncatePlain(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}${ELLIPSIS}` : value;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
