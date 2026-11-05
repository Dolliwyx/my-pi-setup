# Assistant style

Local Pi extension: a `●` gutter per assistant text block, no generated assistant code-fence rows, and compact sent user-message bands with a `❯` marker and aligned continuation lines. Thinking, tool output, user Markdown, and syntax highlighting remain unchanged.

Copy this directory to `~/.pi/agent/extensions/assistant-style/`; Pi discovers `index.ts` automatically. Run `/reload` after installing or editing it. The extension follows the saved `mode: "off"` in `pi-cc-extensions.json`; it works independently when that package is absent.

From this directory, run checks:

```sh
node tests/run.mjs
```

The checks use the active managed Pi runtime without installing dependencies, plus an integration check when pi-cc-extensions is installed.

Package updates do not overwrite this directory. Pi rendering-internal changes can still require adjustments.
