# Session diff

Run `/reload` after installing, then `/diff` in an interactive Pi session inside a Git repository.

`/diff` opens a colored, scrollable overlay on the right half of the terminal. Files start collapsed; opening one closes the previous file. The overlay covers the conversation; it does not resize it. Close and reopen to refresh the diff; file expansion, width, and layout reset on reopen.

- Tab / Shift+Tab: select the next / previous file (the `›` marker).
- Enter: expand or collapse the selected file.
- v: toggle unified / split (old/new side-by-side) view. Unified is the default. Below 80 panel columns, split falls back to unified and returns automatically when widened.
- `[` / `]`: shrink / widen the panel by 10 columns, between 40 columns and the terminal width. On narrower terminals it uses the available width.
- Arrow keys: scroll one line.
- Page Up / Page Down: scroll one page.
- Home / End: first / last line.
- Fullscreen mouse: click file headers to expand/collapse, click the layout control in the title to toggle unified/split, drag the left border to resize width, or use the wheel to scroll. Height stays fixed to the available terminal height. Regular terminal mode supports keyboard controls only.
- Escape, Ctrl+C, or q: close.

## Scope

The extension snapshots tracked and non-ignored untracked files when it first loads in a session. It displays changes since that baseline, restricted to files that are currently uncommitted, including staged changes, unstaged changes, additions, deletions, and renames (shown as deletion/addition). Earlier edits are excluded. It cannot recover edits made before installation or its first load.

The baseline survives `/reload` and session resume. Forking a session starts a new baseline. Changes made outside Pi after the baseline are included too; filesystem changes cannot reliably be attributed to one agent.

After commits, the baseline is adjusted against the current HEAD so committed changes do not appear. If a commit overlaps pre-existing edits and cannot be separated safely, that file displays an explanation instead of a misleading patch. Binary files display a summary; submodules are reported as unsupported.

The command only reads the repository and does not stage, reset, or commit anything. Git index refresh writes are disabled. Baseline copies are private (directory mode 0700, files 0600) under Pi's agent directory at `cache/session-diff/`; session entries store the corresponding manifest path. Large repositories require time and disk space for the initial snapshot. Baselines are retained for session resume, not automatically deleted. Removing a session's baseline makes its diff unavailable rather than silently resetting it.

## Checks

Core Git behavior uses Node's built-in test runner (Node 22.18+ or 24+):

```sh
node --test extensions/session-diff/git.test.mjs
```

The UI/lifecycle checks use the installed Pi extension loader and TUI utilities. Set `PI_TEST_PACKAGE` to your installed `@earendil-works/pi-coding-agent` package directory:

```sh
PI_TEST_PACKAGE=/path/to/node_modules/@earendil-works/pi-coding-agent \
  node --test extensions/session-diff/*.test.mjs
```

These check loader compatibility, baseline persistence, file expansion/selection, split alignment and narrow fallback, scrolling, text sanitization, rendering widths/heights, and right-edge positioning/focus restoration through Pi's real overlay compositor. They also exercise fullscreen mouse dispatch and mounted-overlay resizing. They do not substitute for a live terminal check.
