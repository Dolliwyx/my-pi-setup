---
name: obsidian-writing
description: Write and maintain notes in the user's local Obsidian vault. Use when a task targets an Obsidian note, daily note, vault task, property, tag, wikilink, or folder.
---

# Obsidian writing

## Target

- CLI: `obsidian.exe`
- Vault: `obsidian`
- Filesystem root: `/mnt/c/Users/A/obsidian/obsidian`

Pass `vault=obsidian` on every CLI call. CLI `path` values are relative to the filesystem root.

## Flow

1. Resolve the target. Honor an explicit note path. Otherwise use `files`, `folders`, or `search` to inspect the vault; ask only when the destination or intended operation cannot be inferred.
2. Read an existing target before changing it. Preserve its frontmatter, heading hierarchy, links, embeds, tags, tasks, and local writing style unless the user asks to change them.
3. Make the smallest fitting mutation:
   - New note: `create` without `overwrite`.
   - Addition: `append` or `prepend`.
   - Rename or relocation: `rename` or `move`.
   - Property change: `property:set` or `property:remove`.
   - Surgical replacement inside a note: use the file-editing tool against the absolute path under the filesystem root; the CLI has no in-place replacement command.
4. Read the resulting note once. Completion means the requested content is present, existing unrelated content is intact, and the note remains valid Obsidian Markdown.
5. Report the vault-relative path and the operation performed.

## Writing

Write only what serves the note. Prefer short sections, descriptive headings, concise paragraphs, and lists where they improve scanning. Follow the note's established structure over imposing a new template.

Use `[[wikilinks]]` only for an existing note found in the vault or a note the user explicitly asks to create. Use `- [ ]` for actionable tasks and preserve existing task metadata.

## CLI patterns

```bash
obsidian.exe vault=obsidian files
obsidian.exe vault=obsidian search query="TERM" format=json
obsidian.exe vault=obsidian read path="FOLDER/NOTE.md"
obsidian.exe vault=obsidian create path="FOLDER/NOTE.md" content="CONTENT"
obsidian.exe vault=obsidian append path="FOLDER/NOTE.md" content="CONTENT"
```

Quote values containing spaces. Encode newlines in CLI `content` values as `\n`. Use `obsidian.exe help <command>` when a command's arguments are uncertain.

Treat `overwrite` and `delete permanent` as destructive: use them only when the user explicitly requests that exact outcome. Prefer recoverable `delete` for ordinary deletion.
