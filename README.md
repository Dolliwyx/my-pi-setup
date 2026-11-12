# my-pi-setup

My personal [Pi coding agent](https://pi.dev) configuration and custom extensions. This repository keeps selected files from my local setup under version control for reference and reuse across machines.

It is not a complete backup or an automated installer. The repository no longer includes a restore script, a snapshot manifest, or the shared skills collection.

## Repository contents

| Path | Contents | Local location |
| --- | --- | --- |
| [`settings.json`](settings.json) | Root-level rendering preferences | `~/.pi/settings.json` |
| [`agent/`](agent/) | Settings, package declarations, keybindings, model overrides, MCP configuration, extension preferences, system-prompt additions, and design rules | `~/.pi/agent/` |
| [`agent/agents/`](agent/agents/) | Custom definitions for `@tintinweb/pi-subagents` | `~/.pi/agent/agents/` |
| [`implementation-playbook.md`](implementation-playbook.md) | Implementation guidance | `~/.pi/agent/implementation-playbook.md` |
| [`extensions/`](extensions/) | Custom TypeScript extensions and session-diff tests | `~/.pi/agent/extensions/` |
| [`home/AGENTS.md`](home/AGENTS.md) | Home-level instructions for coding agents | `~/AGENTS.md` |
| [`.pi/skills/sync-pi-agent/`](.pi/skills/sync-pi-agent/) | A project-local skill and script for partial sync from the local Pi configuration into this repository | Project-local tooling |

The tracked file list is available with `git ls-files`.

## Custom subagents

The repository contains these custom definitions:

- `explorer` inspects files and code without modifying them.
- `general` handles bounded tasks when a specialist is unsuitable.
- `researcher` collects external sources and reports evidence.
- `worker` implements and verifies bounded tasks.

Definitions record their model, thinking level, and instructions; read-only specialists also restrict tools. The saved settings disable built-in subagents.

## Custom extensions

| Extension | Purpose |
| --- | --- |
| [`assistant-style/`](extensions/assistant-style/) | Adds assistant reply gutters, hides assistant code fences, and compacts sent user messages; includes renderer tests |
| `clean-codeblocks.ts` | Adjusts Markdown code-block rendering |
| `codex-quota.ts` | Displays Codex quota and credit information |
| `minimal-tool-calls.ts` | Renders compact tool calls |
| `moonshot-balance.ts` | Displays the Moonshot account balance |
| `notify-done.ts` | Sends completion notifications |
| `prompt-timer.ts` | Displays elapsed time for an agent run |
| `reasoning-cycle.ts` | Changes the thinking level with `Alt+,` and `Alt+.` |
| `session-diff/` | Displays uncommitted changes since a session baseline with `/diff` |
| `skill/` | Loads skills by catalog name, deduplicates unchanged loads, and resets loaded state after context changes |

Presence in this repository does not mean an extension is enabled. [`agent/settings.json`](agent/settings.json) disables several of the included extensions.

The [session-diff README](extensions/session-diff/README.md) describes its scope, controls, and test commands.

## Configuration limits

The files reflect my setup, not a general-purpose default. Package declarations in `agent/settings.json` are unpinned; dependencies, model access, and external services are not included. The Playwright MCP configuration uses a machine-specific Chromium path that must be adjusted on other machines.

The saved settings reference shared skills under `~/.agents/skills/` that this repository does not contain. MCP integrations also require separate credentials or browser setup. [`agent/mcp.json`](agent/mcp.json) uses literal `API_TOKEN` placeholders instead of credentials. Replace each placeholder only in your local copy before enabling its integration; the placeholders do not read environment variables.

Credentials, OAuth tokens, device IDs, sessions, caches, package installations, mention-skill selection history, and other runtime state are outside the repository's scope. The generated Herdr integration is also excluded; Herdr installs and maintains it. [`.gitignore`](.gitignore) lists excluded paths.

## Sync limits

The project-local sync script copies only an allowlisted subset of `~/.pi/agent` into this repository. It does not restore files to a machine or sync the whole setup.

The script misses nested extensions, shared skills, root rendering preferences, and several configuration files. It also writes agent definitions to the obsolete root `agents/` directory rather than `agent/agents/`, can recreate root `skills/`, and copies settings without filtering device IDs or changelog state. It is not a full refresh workflow for the current repository layout.

Changes to the saved configuration require review for secrets, machine-specific paths, external dependencies, and unintended overwrites.
