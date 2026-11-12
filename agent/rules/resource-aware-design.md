# Resource-Aware Design

Use this reference for data-intensive architecture, caching, queues, workers, background processing, or deployment sizing.

## Establish Constraints

- Inspect deployment configuration, service limits, dataset size, traffic shape, and existing operational patterns.
- When a constraint cannot be measured, state the assumption and choose a bounded, reversible design.
- Treat configuration and production evidence as authoritative; avoid fixed global memory or CPU assumptions.

## Prefer Bounded Work

- Push filtering, sorting, aggregation, joins, uniqueness checks, and pagination to the database or storage layer when appropriate.
- Stream or batch large inputs instead of loading complete datasets into memory.
- Bound concurrency, queues, retries, timeouts, and result sizes.
- Reuse existing indexes, workers, and caches before adding infrastructure.
- Add caching or background processing only when it reduces measured cost without creating a larger operational burden.

## Completion Check

Before finalizing the design, identify its largest collection, longest-running operation, and highest-concurrency path. Confirm each is bounded or document the verified constraint that makes it safe.
