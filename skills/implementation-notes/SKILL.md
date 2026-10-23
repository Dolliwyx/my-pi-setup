---
name: implementation-notes
description: Maintains a running repo-root implementation-notes.html file that records how implementation decisions interpret, clarify, or diverge from a spec. Use when the user explicitly asks for implementation notes, maintaining implementation-notes.html, tracking decisions, capturing spec deviations, recording tradeoffs, or keeping running notes while implementing.
---

# Implementation Notes

## Use

Only use when user explicitly asks for implementation notes. Do not trigger just because code is being written.

Maintain repo-root `implementation-notes.html`: lightweight audit trail for decisions, spec interpretations, deviations, tradeoffs, and open questions.

## Flow

1. Find repo root. If ambiguous, use cwd and say so.
2. Create `implementation-notes.html` if missing.
3. If it exists, preserve old entries; append a new task entry.
4. Update at meaningful checkpoints.
5. Final response: mention notes were updated.

Never include secrets, tokens, credentials, private personal data, or sensitive config.

If a question blocks correctness, ask user. Notes are only for non-blocking uncertainty.

## Entry

Each task entry:

- Timestamp
- Summary
- Design decisions
- Deviations
- Tradeoffs
- Open questions

Keep concise. Include useful file paths, tickets, spec sections, anchors. For empty sections, say `No intentional deviations recorded.` or similar.

## HTML

When creating the file, use simple static HTML:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Implementation Notes</title>
  <style>body{font-family:system-ui,sans-serif;line-height:1.5;margin:2rem;max-width:960px}article{border-top:1px solid #ddd;margin-top:1.5rem;padding-top:1rem}code{background:#f5f5f5;padding:.1rem .25rem}</style>
</head>
<body>
  <h1>Implementation Notes</h1>
  <article>
    <h2>Task summary</h2>
    <p><time datetime="YYYY-MM-DD">YYYY-MM-DD</time></p>
    <h3>Summary</h3>
    <p>...</p>
    <h3>Design decisions</h3>
    <ul><li>...</li></ul>
    <h3>Deviations</h3>
    <ul><li>No intentional deviations recorded.</li></ul>
    <h3>Tradeoffs</h3>
    <ul><li>...</li></ul>
    <h3>Open questions</h3>
    <ul><li>No open questions recorded.</li></ul>
  </article>
</body>
</html>
```

When appending, match clear existing structure. Otherwise insert compatible `<article>` before `</body>`. Only repair malformed HTML if needed to append safely.

## Checkpoints

Update notes when:

- Ambiguous spec language got interpreted.
- Spec was intentionally not followed.
- Meaningful alternative was rejected.
- Non-blocking question should be revisited.

If none apply, add a short final entry saying the skill was active and no noteworthy decisions, deviations, tradeoffs, or open questions were found.
