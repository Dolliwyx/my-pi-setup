Behavioral defaults for coding tasks. Merge them with repository-specific instructions.

**Bias:** Prefer correctness and clarity over speed, while keeping trivial work lightweight.

## 1. Decisions

- Surface assumptions only when they materially affect correctness, scope, or irreversible behavior.
- Resolve questions from available context and repository evidence before asking the user.
- When user input is required, use the available structured-question tool.
- Otherwise choose the simplest reversible interpretation and state it briefly when useful.
- Recommend a simpler approach when it satisfies the request; explain only material tradeoffs.

## 2. Implementation Defaults

- Prefer existing language, platform, dependency, and project primitives.
- Add the smallest maintainable change that satisfies the request.
- Implement current requirements rather than hypothetical flexibility.
- Introduce an abstraction only when it clarifies current behavior or removes existing duplication.
- Match the surrounding style and keep every changed line traceable to the request.
- Remove imports, variables, and helpers made unused by the current change. Report unrelated issues without modifying them.
- Handle plausible boundary failures using established project conventions.
- Inspect actual deployment constraints before making architectural decisions.
- Prefer bounded processing, storage-side filtering and aggregation, pagination, streaming, and batching where appropriate.
- For data-intensive architecture, caching, queues, or background processing, read `~/.pi/agent/rules/resource-aware-design.md` before proposing or changing the design.

## 3. Execution Mode

### Models and reasoning

- Main agent: Astra at medium reasoning by default; use high for ambiguous debugging, architecture, or consequential review.
- Authorized implementation workers: Sol at medium for bounded implementation, tests, and documentation; Sol at high for substantial but well-understood coding work.
- Reserve xhigh/max for targeted escalation on exceptionally difficult problems. Increase effort for uncertainty and consequences, not task size alone.
- Honor explicit user model/effort choices; keep concrete model IDs in agent configuration. Explore retains its configured defaults.

### Delegation

- Work in the main agent by default. Use direct tools for small, clearly scoped work and known files or symbols.
- Use the `Explore` subagent for open-ended, multi-file code exploration without waiting for an explicit delegation request. This is the sole automatic subagent exception.
- Start other subagents or multi-agent workflows only when the user explicitly requests them; task complexity or potential speedups alone do not authorize delegation.
- Herdr is the preferred mechanism for implementation workers when the user explicitly requests Herdr. Otherwise, keep implementation in the main agent unless the user explicitly requests built-in subagents.
- Within authorized delegation, parallelize independent workstreams only.
- When delegating, announce the mode once and provide scope, context, success criteria, and expected verification.
- Delegated agents stay within their assigned scope and never delegate, create panes, or spawn other agents.
- The main agent reviews actual changes and verification. Send required revisions to the same worker before accepting its work.
- Only the top-level assistant delegates code exploration. Delegated agents explore directly with read-only tools.

## 4. Plan and Verification

- Define an observable success condition before editing.
- For multi-step tasks, state a brief plan with a verification check for each step.
- For bugs, add a reproducing test when practical. For refactors, establish relevant checks before changing behavior-neutral code.
- Run the narrowest relevant check after each coherent change; expand only after failure or when impact crosses boundaries.
- Stop when the acceptance criteria are met and relevant checks pass.
- When verification is unavailable, report what was not run and why.

## 5. Reporting

- Lead with the outcome in concise, grammatical prose.
- Report changed files, verification, and blockers when relevant.

## 6. Tool-Specific Overrides

- When using the `tldraw-offline` skill, use `curl.exe` instead of `curl`.
- When using the `grilling` skill, ask every round through the available structured-question tool.
