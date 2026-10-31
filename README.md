# my-pi-setup

My personal [Pi coding agent](https://pi.dev) configuration and custom extensions. This repository keeps selected files from my local setup under version control for reference and reuse across machines.

It is not a complete backup or an automated installer. The repository no longer includes a restore script, a snapshot manifest, or the shared skills collection.

## Repository contents

| Path | Contents | Local location |
| --- | --- | --- |
| [`agent/`](agent/) | Settings, package declarations, keybindings, model overrides, MCP configuration, and extension preferences | `~/.pi/agent/` |
| [`agent/subagent-manager/agents/`](agent/subagent-manager/agents/) | Custom definitions for `pi-subagent-manager` | `~/.pi/agent/subagent-manager/agents/` |
| [`extensions/`](extensions/) | Custom TypeScript extensions and session-diff tests | `~/.pi/agent/extensions/` |
| [`home/AGENTS.md`](home/AGENTS.md) | Home-level instructions for coding agents | `~/AGENTS.md` |
| [`.pi/skills/sync-pi-agent/`](.pi/skills/sync-pi-agent/) | A project-local skill and script for partial sync from the local Pi configuration into this repository | Project-local tooling |

The tracked file list is available with `git ls-files`.

## Custom subagents

The repository contains these custom definitions:

- `explorer` investigates code and research questions without modifying files.
- `general-purpose` handles research, analysis, or implementation when a specialist is unsuitable.
- `reviewer` independently checks work for defects, regressions, security risks, and missing tests.
- `worker` completes and verifies bounded tasks.

Each definition records its model, thinking level, allowed tools, and instructions. The saved settings disable built-in subagents.

## Custom extensions

| Extension | Purpose |
| --- | --- |
| `clean-codeblocks.ts` | Adjusts Markdown code-block rendering |
| `codex-quota.ts` | Displays Codex quota and credit information |
| `minimal-tool-calls.ts` | Renders compact tool calls |
| `moonshot-balance.ts` | Displays the Moonshot account balance |
| `notify-done.ts` | Sends completion notifications |
| `prompt-timer.ts` | Displays elapsed time for an agent run |
| `reasoning-cycle.ts` | Changes the thinking level with `Alt+,` and `Alt+.` |
| `session-diff/` | Displays uncommitted changes since a session baseline with `/diff` |

Presence in this repository does not mean an extension is enabled. [`agent/settings.json`](agent/settings.json) disables several of the included extensions.

The [session-diff README](extensions/session-diff/README.md) describes its scope, controls, and test commands.

## Configuration limits

The files reflect my setup, not a general-purpose default. Package declarations are pinned in `agent/settings.json`, but dependencies, model access, and external services are not included.

The saved settings reference shared skills under `~/.agents/skills/` that this repository does not contain. MCP integrations also require separate credentials or browser setup. [`agent/mcp.json`](agent/mcp.json) references `SHORTCUT_TOKEN` and `TEAM_BRAIN_TOKEN` through environment variables rather than storing their values.

Credentials, OAuth tokens, sessions, caches, package installations, and other runtime state are outside the repository's scope. [`.gitignore`](.gitignore) lists excluded paths.

## Sync limits

The project-local sync script copies only an allowlisted subset of `~/.pi/agent` into this repository. It does not restore files to a machine or sync the whole setup.

The script misses custom subagent-manager definitions, nested extensions, shared skills, and several configuration files. It can also recreate removed `agents/`, `skills/`, and `agent/rules/` directories and replace pinned settings with local settings. It is not a full refresh workflow for the current repository layout.

Changes to the saved configuration require review for secrets, machine-specific paths, external dependencies, and unintended overwrites.
