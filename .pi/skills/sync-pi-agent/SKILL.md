---
name: sync-pi-agent
description: Preview and sync an allowlisted subset of ~/.pi/agent into this repository. Use only when the user asks to back up or sync local Pi agent configuration, agents, rules, or skills.
disable-model-invocation: true
---

# Sync Pi Agent Files

Use `scripts/sync.sh` from this skill directory.

## Workflow

1. Run `scripts/sync.sh` without arguments. It previews additions and updates without changing the repository.
2. Review every reported path. The allowlist is limited to:
   - `AGENTS.md`, `settings.json`, and `keybindings.json`
   - Markdown files directly under `agents/` and `rules/`
   - text and source files inside skill directories that contain `SKILL.md`
3. Stop if the script reports a blocked path or suspected secret. Explain the finding without displaying secret values.
4. If the user has explicitly asked to perform the sync, run `scripts/sync.sh --apply`. Otherwise, show the preview and ask before applying it.
5. Inspect `git status --short` and `git diff --check`, then summarize changed paths. Do not commit or push unless separately requested.

The script only adds or updates allowlisted files. It does not delete repository files, follow symlinks, read runtime/session directories, or copy credentials and generated state.
