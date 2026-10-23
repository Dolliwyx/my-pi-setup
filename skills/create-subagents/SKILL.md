---
name: create-subagents
description: Create or configure custom agents for pi-subagents, including updates to existing agents and overrides of bundled agents.
---

# Create pi subagents

Build the smallest agent definition for the installed `pi-subagents` extension.

## 1. Resolve the installed contract

Locate the installed package and read its `package.json` and `docs/agents.md` before choosing fields. The current installation is `$PI_CODING_AGENT_DIR/npm/node_modules/pi-subagents`, defaulting to `~/.pi/agent/npm/node_modules/pi-subagents`. Use `docs/models.md` for model selection and policy; use `docs/configuration.md` or `docs/tool-reference.md` for settings or launch options not covered here. Installed docs and implementation govern version differences.

Determine the agent's name, purpose, scope, capabilities, model, and thinking level from the request. Ask only for decisions that cannot be inferred safely, especially scope:

- Global: `$PI_CODING_AGENT_DIR/agents/<name>.md`, defaulting to `~/.pi/agent/agents/<name>.md`
- Project: `.pi/agents/<name>.md` in standard Pi
- Legacy project fallback: `.agents/<name>.md`; this directory is scanned recursively

Project definitions beat user definitions, which beat package agents and builtins. Within a project, `.pi/agents/` beats legacy `.agents/`. The installed implementation also scans `~/.agents/`; inspect same-name definitions there when resolving global collisions.

Identity comes from frontmatter `name`, not the filename. Match the canonical runtime name to override an existing agent. Optional `package` registers the agent as `<package>.<name>`. Prefer a matching filename for clarity.

For field-only changes to an existing agent, prefer `subagents.agentOverrides.<name>` in user `settings.json` or project `.pi/settings.json`. A same-name agent file replaces the entire definition, including omitted fields; it is not a partial override.

Creating or configuring a definition does not authorize launching it. This step is complete when the installed schema, destination, and behavioral contract are unambiguous.

## 2. Encode capabilities and defaults

Include only fields needed by the contract:

```yaml
---
name: my-agent
description: When this agent should be used
tools: read, grep, find, ls
model: inherit
thinking: medium
inheritProjectContext: true
---
```

Key fields:

- `name` and `description`: required for discovery.
- `tools`: strict allowlist of builtin or registered extension tool names; omitted means normal builtins, empty means no tools. `mcp:server` or `mcp:server/tool` selects direct MCP tools. Naming an extension tool does not load its provider.
- `excludeTools`: deny-list applied after tool selection.
- `extensions`: omitted permits ambient extensions in background children; empty disables ambient loading; a list loads those extensions. Foreground children never load ambient extensions.
- `subagentOnlyExtensions`: provider paths loaded only in this agent's children. Relative paths resolve from the definition file.
- `model`: prefer an exact `provider/model-id`; `inherit` explicitly uses the parent model. Omitted uses configured defaults.
- `thinking`: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`, subject to model support and configured ceilings.
- `systemPromptMode`: `replace` for a standalone specialist (custom-agent default); `append` retains Pi's base prompt, not the parent's conversation.
- `inheritProjectContext`, `inheritGlobalContext`, `inheritSkills`: explicit context opt-ins. Ordinary custom agents start without repository instructions, global instructions, or the discovered skills catalog. Global inheritance also requires project inheritance.
- `advertise: true`: opt into parent-prompt discovery when the subagent tool is active; this does not authorize automatic delegation.
- `defaultContext`, `async`, `timeoutMs`, `toolTimeoutMs`, `skills`, `skillPath`, `output`, `defaultReads`, and `memory`: add only when needed, using the installed reference.
- `acceptanceRole: writer`: declare for implementation profiles that need automatic writer acceptance inference; it does not grant tools.

Model and thinking frontmatter are defaults, not immutable pins: settings overrides and explicit launches can replace them. If an enforced model boundary is requested, consult `docs/models.md` for `subagents.modelScope`; use `subagents.maxThinking` for a thinking ceiling. Verify a selected model's exact identifier with `pi --list-models`.

This step is complete when requested capabilities are encoded, defaults are distinguished from enforceable policy, and no unsupported field remains.

## 3. Write the agent prompt

Write the Markdown body as an operational system prompt:

1. State the role and expected result.
2. Give the process in task order, leaving judgment only where the role needs it.
3. Define a checkable output contract.
4. Pair unavoidable prohibitions with the positive behavior to follow.

For read-only agents, allowlist only read tools; omit Bash unless necessary, since it can mutate files despite omitting `write` and `edit`. If Bash is required, state its permitted read-only uses and disclose that this is prompt guidance, not a filesystem sandbox. If enforced read-only access is required, use a supporting sandbox or report that tool selection alone cannot enforce it. For writers, keep edits within the assigned scope and name verification expectations.

Leave nested delegation disabled unless explicitly authorized. Workers should return blockers to the parent instead of spawning more workers.

This step is complete when the prompt and structural capabilities agree and the agent can execute without hidden assumptions.

## 4. Verify the definition

Read the completed file and confirm:

- Destination and canonical `name` match the intended scope and precedence; check conflicting definitions and settings overrides.
- YAML is valid, required fields exist, and every field is supported by the installed extension.
- Tool access and loaded providers match the role.
- Selected model exists, thinking is supported, and effective settings or launch overrides are accounted for.
- Body, capabilities, context inheritance, and verification expectations agree.

For settings edits, validate JSON and preserve unrelated keys. Do not launch a child merely to validate a definition unless a smoke run is authorized. After reload, `/subagents-models <name>` shows the live model mapping; `subagent({ action: "list", capabilities: true })` confirms runtime discovery and capabilities.

Tell the user the changed path, model/thinking defaults, tool boundary, and to run `/reload` after external file or settings edits. Distinguish file validation from live runtime validation. Completion requires the applicable checks above to pass or any remaining blocker to be reported.
