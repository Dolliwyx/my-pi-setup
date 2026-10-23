---
name: support-relay
description: Rewrite a technical braindump into a clear message for the support team.
disable-model-invocation: true
---

# Support relay

Rewrite the user's supplied technical internal braindump about a client-reported issue, investigation, fix, or explanation into a polished message for the support team. Support should be able to understand it and adapt or relay it to the client.

1. If no source text was supplied, ask for the braindump and do nothing else.
2. Preserve supplied facts and meaning. Keep confirmed facts separate from uncertainty; state hypotheses as hypotheses.
3. Write a concise, self-contained, skimmable, ready-to-send message addressed to support. Use calm, professional language and do not pretend to speak directly to the client.
4. Translate jargon into plain language. Retain technical detail only when it affects client impact, resolution, workarounds, limitations, risk, or next steps.
5. Remove debugging chatter, repetition, blame, sarcasm, and irrelevant implementation detail. Never invent root causes, scope, promises, timelines, client actions, or resolution status.
6. Preserve the stated distinction among fixed, mitigated, workaround available, expected behavior, unable to reproduce, and still investigating. Do not infer one status from another.
7. Ask a clarification only when a missing fact makes a safe rewrite impossible. Otherwise, record unresolved ambiguity, assumptions, or intentionally omitted details in a short `Internal notes` section.

Return only the rewritten content:

- The ready-to-send support-facing message, using natural prose rather than a rigid template.
- Then `Internal notes` with concise bullets only when useful; omit that section when there are no useful notes.

Do not explain the rewriting process.
