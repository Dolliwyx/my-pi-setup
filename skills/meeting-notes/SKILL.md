---
name: meeting-notes
description: Generate structured meeting notes from agendas, transcripts, rough notes, or meeting summaries. Use when the user asks to create, organize, clean up, or format meeting notes.
---

# Meeting notes

Turn the supplied meeting material into concise Obsidian Markdown. Preserve stated facts and wording where useful; never invent attendees, decisions, owners, deadlines, blockers, or next steps.

## Flow

1. Extract the project, meeting date, agenda, discussion topics, decisions, action items, blockers, and next steps from the source. Use the current local date only when the meeting date is absent.
2. Consolidate repeated points. Record each decision under its discussion topic and repeat it in the decision summary for scanning.
3. Write the note using the exact section order below. Replace an empty section's body with `- None recorded.` rather than fabricating content.
4. If a destination in the Obsidian vault is given, follow the vault's existing naming and writing conventions. Otherwise return the completed Markdown.
5. Verify every decision and task is supported by the source, every task uses a checkbox, and each agenda item is no longer than two sentences.

## Format

```markdown
---
type: meeting
project: PROJECT OR BLANK
date: YYYY-MM-DD
---

# Agenda

1. Agenda item
2. Agenda item

# Discussion

1. **Topic name**
   - **Discussion**: Key points discussed.
   - **Decision**: Decision made, or `None recorded.`
   - **Notes**: Relevant context, or `None recorded.`
2. **Topic name**
   - **Discussion**: Key points discussed.
   - **Decision**: Decision made, or `None recorded.`
   - **Notes**: Relevant context, or `None recorded.`

# Decisions Made

- Decision

# Action Items

- [ ] Action item

# Issues / Blockers

- Issue or blocker

# Next Steps

- Next step
```

Use YAML-safe scalar values. Keep agenda entries to at most two sentences. Split discussion by topic when meaningful; use one topic for a short, single-subject meeting. Keep all six sections, with `- None recorded.` for sections lacking source material. In Discussion, keep the three labeled fields for every topic.
