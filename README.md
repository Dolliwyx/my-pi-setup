# my-pi-setup

Portable snapshot of my machine's [Pi coding agent](https://pi.dev) configuration. The machine is the source of truth; credentials and runtime state are excluded.

## Restore on another machine

Requires Python 3.10+, Git, Node.js 22.19+ and **Pi 1.4.0** (recorded in `snapshot.json`). On a POSIX system, install that Pi version with:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.4.0
git clone git@github.com:dolliwyx/my-pi-setup.git
cd my-pi-setup
python3 scripts/restore.py          # preview only
python3 scripts/restore.py --apply  # copy files and recreate skill links
pi update --extensions             # install the pinned package declarations
```

Close existing Pi sessions before applying. Changed destination files are backed up to a private temporary directory printed by the script; move that backup somewhere persistent if needed. The restore overwrites snapshot-owned files but never deletes unrelated files or copies credentials. **An existing machine's extra extensions, skills, agents, or instructions can still affect behavior**; review them or use a fresh profile for parity. The script refuses destination paths with symlinked parent directories. Native Windows symlink creation may need Developer Mode; WSL/Linux is the reference environment.

Set `SHORTCUT_TOKEN` and `TEAM_BRAIN_TOKEN` in the shell environment using your secret manager. They contain the raw tokens, without `Bearer `. Pi expands their references in `mcp.json`. Do not put their values in this repo.

Then start Pi and use `/login` for the model provider. The three Notion MCP entries retain the machine's enabled/disabled settings; when enabling them, sign in to each account separately with `/mcp login notion-smd`, `/mcp login notion-dolliwyx`, or `/mcp login notion-patch`. Use `/mcp` to inspect connection status.

### What is restored

| Repo path | Destination |
| --- | --- |
| `agent/` | `~/.pi/agent/` — settings, keybindings, model overrides, sanitized MCP config, extension preferences, rules, and subagent-manager definitions |
| `extensions/` | `~/.pi/agent/extensions/` — the machine's custom extensions, including session-diff |
| `agents/` | `~/.pi/agent/agents/` — current legacy agent definitions |
| `pi-agents/` | `~/.pi/agents/` — additional legacy agent definitions, kept in their original scope |
| `skills/` | `~/.agents/skills/` — all 42 shared skills with their scripts, schemas, and other assets |
| `home/AGENTS.md` | `~/AGENTS.md` — active home-level instructions, not a new global `~/.pi/agent/AGENTS.md` |
| `settings.json` | `~/.pi/settings.json` — additional UI settings |

The seven `~/.pi/agent/skills/` links are recreated from `snapshot.json`. Ponytail's six package-provided skills come from its pinned package, rather than another vendored copy. All declared npm packages are pinned to installed versions; Ponytail is pinned to the installed Git commit. Transitive npm dependencies and external services are not fully locked.

### Machine-specific integrations

- Playwright MCP no longer embeds this machine's Chromium executable path. Install its matching browser on the destination with `npx -y --package=@playwright/mcp@0.0.83 playwright install chromium`. Browser system libraries may also be required.
- Herdr itself is external to this snapshot. Its installer owns `herdr-agent-state.ts`; regenerate it through Herdr rather than copying the generated integration file.
- `obsidian-writing` retains the source machine's vault name, Windows CLI, and `/mnt/c/Users/A/obsidian/obsidian` path. Install Obsidian and adjust that skill's target to the destination vault.
- `tldraw-offline` retains Windows user `A` paths and references an external `~/skills/tldraw-offline/tq` helper. Install tldraw Desktop's integration and update those paths, or use the skill's raw-curl fallback.
- Other skills may require their documented tools, Python/npm dependencies, desktop applications, or external system skills (for example image generation). Those installations and personal documents are not included.
- Provider/model availability depends on the destination account. The preserved legacy `pi-agents/Explore.md` uses a model outside the main configured model cycle, as on the source machine.

Auth files, MCP OAuth tokens, device IDs, trust decisions, sessions, caches, usage history, and package installation directories are intentionally excluded. The `pi-usage.json` included here is a preference file (`codexFastMode`), not usage history.

## Refreshing the snapshot

Review machine changes before copying them into the matching paths above. Remove `deviceId` from settings, pin package versions to the installed versions, replace MCP secrets with environment references, and remove machine-local browser paths. Keep shared skill files and their assets together.

The older `.pi/skills/sync-pi-agent/scripts/sync.sh` is only a **partial legacy sync**: it misses shared/symlinked skills, nested extensions and several config files, and can replace pinned settings with the raw machine settings. Do not use it to refresh this portable snapshot.

Before committing, inspect the complete diff for credentials and machine state. Never copy all of `~/.pi/agent` wholesale.

## Checks

```sh
python3 -B -m unittest discover -s tests -v
PI_TEST_PACKAGE=/path/to/node_modules/@earendil-works/pi-coding-agent \
  node --test extensions/session-diff/*.test.mjs
```

The restore tests use temporary homes, check preview/idempotency/backups, retain existing credentials, and reject symlinked destination parents. See [session-diff](extensions/session-diff/README.md) for that extension's scope and controls.
