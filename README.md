# my-pi-setup

Personal setup for the [Pi coding agent](https://github.com/earendil-works/pi-coding-agent). This repository collects small extensions and configuration experiments that customize the Pi terminal UI and day-to-day coding workflow.

## Extensions

| Extension | File | What it is for |
| --- | --- | --- |
| Clean code blocks | `extensions/clean-codeblocks.ts` | Patches Pi's Markdown rendering so code blocks display without visible triple-backtick fences, keeping the terminal transcript cleaner while preserving syntax highlighting and code block styling. |
| Reasoning cycle | `extensions/reasoning-cycle.ts` | Adds keyboard shortcuts for cycling the active model's reasoning/thinking level up or down during a Pi session, including raw terminal fallbacks for `Alt+,` and `Alt+.`. |
| Moonshot balance | `extensions/moonshot-balance.ts` | Displays your Moonshot account balance in the Pi status bar when a Moonshot model is active. Also registers a `/balance` command to show the balance on demand. |

## Usage

Load these extensions from your Pi configuration or extension entrypoint as appropriate for your local setup. Each file exports a default Pi extension function.
