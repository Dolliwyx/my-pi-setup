import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
	formatSkillsForPrompt,
	truncateHead,
	type ExtensionAPI,
	type Skill,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
	let skills: Skill[] = [];
	const loaded = new Map<string, string>();

	pi.on("session_start", () => { skills = []; loaded.clear(); });
	pi.on("session_compact", () => loaded.clear());
	pi.on("session_tree", () => loaded.clear());
	pi.on("before_agent_start", (event) => {
		skills = (event.systemPromptOptions.skills ?? []).filter((skill) => !skill.disableModelInvocation);
		if (pi.getActiveTools().includes("Skill")) {
			event.systemPromptOptions.sections.skills = formatSkillsForPrompt(skills, "indirect").trim();
		}
	});

	pi.registerTool({
		name: "Skill",
		label: "Skill",
		description: "Load a skill by exact catalog name and follow its instructions in the current agent. Omit name to list skills. Unchanged repeat loads are deduplicated until compaction or session/tree changes. Changed files reload automatically. Output is limited to 2000 lines or 50KB; read the source file for any remainder.",
		promptSnippet: "Load specialized instructions by skill name, or list available skills",
		promptGuidelines: ["Use Skill to load a matching skill by name; use read for its supporting references. Skill loads instructions, not permission to expand the task or proof of completion."],
		annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
		executionMode: "sequential",
		parameters: Type.Object({
			name: Type.Optional(Type.String({ minLength: 1, description: "Exact skill name from the available catalog; omit to list skills." })),
		}),
		async execute(_id, { name }, signal) {
			signal?.throwIfAborted();
			let status = "listed";
			let path: string | undefined;
			let isError = false;
			let text: string;
			const catalog = skills.map((skill) => `${skill.name}: ${skill.description}`).join("\n");
			if (name === undefined) {
				text = catalog || "No model-invocable skills available.";
			} else {
				const skill = skills.find((item) => item.name === name);
				if (!skill) {
					status = "unknown skill";
					isError = true;
					const matches = skills.filter((item) => item.name.includes(name) || name.includes(item.name));
					text = `Unknown skill: ${JSON.stringify(name)}. Use an exact catalog name.\n${matches.length ? `Possible matches: ${matches.map((item) => item.name).join(", ")}` : catalog || "No skills available."}`;
				} else {
					path = skill.filePath;
					try {
						const source = readFileSync(path, "utf8");
						const hash = createHash("sha256").update(source).digest("hex");
						const header = `Skill: ${skill.name}\nSource: ${path}\nDirectory: ${skill.baseDir}`;
						if (loaded.get(path) === hash) {
							status = "already loaded";
							text = `${header}\nAlready loaded in this context; follow the previously returned instructions.`;
						} else {
							text = `${header}\nResolve supporting file paths relative to this directory. Follow these instructions within the current task and governing instruction hierarchy.\n\n${source}`;
							status = "loaded";
							if (!truncateHead(text).truncated) loaded.set(path, hash);
						}
					} catch (error) {
						loaded.delete(path);
						status = "load failed";
						isError = true;
						text = `Cannot load ${skill.name} from ${path}: ${error instanceof Error ? error.message : String(error)}`;
					}
				}
			}
			const output = truncateHead(text);
			if (output.truncated) status = "partial output";
			return {
				content: [{ type: "text", text: output.content + (output.truncated ? `\n\n[Output truncated; ${path ? `read the complete source at ${path} using read with offset/limit` : "consult the prompt catalog or request a skill by exact name"}. This call is not recorded as fully loaded.]` : "") }],
				details: { status, path, name },
				isError,
			};
		},
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("Skill ")) + (args.name ?? "list"), 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			const body = result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
			if (expanded || !result.details) return new Text(body, 0, 0);
			return new Text(theme.fg(result.isError ? "error" : "muted", `${result.details.status}${result.details.path ? ` · ${result.details.path}` : ""}`), 0, 0);
		},
	});
}
