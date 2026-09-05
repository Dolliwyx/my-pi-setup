---
name: herdr-delegation
description: Use Herdr for implementation only when the user explicitly requests Herdr. Requires HERDR_ENV=1 and covers pane setup, Pi execution, workstream isolation, verification, and review.
---

# Herdr Delegation

## Preconditions

1. Confirm that the user explicitly requested Herdr.
2. Confirm that `HERDR_ENV=1`. If not, tell the user Herdr is unavailable and stop this path.
3. Complete code exploration with normal read-only tools before Herdr implementation begins.
4. Keep Herdr and internal-subagent delegation separate within a workstream unless the user explicitly requests the combination.

The preflight is complete when the request, environment, implementation scope, and execution mode are all explicit.

## Execution

1. Create the minimum topology needed with `herdr_layout`. Default to a sibling pane in the caller's tab and working directory, and preserve focus unless the user asks otherwise.
2. Use Herdr only for implementation. Split panes only for independent workstreams or when the user explicitly requests multiple panes.
3. Start `pi` through `herdr_agent` using the configured implementation model with `max` thinking, unless the user names another harness or model.
4. Give each pane a bounded scope, relevant context, observable success criteria, and expected verification.
5. Require each pane to report its changes and verification to the main thread.
6. Review the actual changes and checks. Send required corrections to the same pane before accepting its work.

Leave panes you did not create open unless the user asks to close them.

## Completion

The Herdr work is complete when every assigned workstream has reported, the main thread has inspected its actual changes, relevant checks pass, and required revisions are resolved.
