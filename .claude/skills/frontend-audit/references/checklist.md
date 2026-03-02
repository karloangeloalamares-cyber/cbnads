# Frontend Audit Checklist

## Correctness

1. Verify displayed data maps to correct source fields.
2. Verify sorting/filtering/pagination logic matches UX expectations.
3. Verify mutation flows update UI state and cache/store consistently.
4. Verify loading/error/empty states are reachable and meaningful.

## Component Design

1. Keep component responsibility narrow.
2. Avoid massive mixed-concern files when splitting is feasible.
3. Eliminate repeated logic through shared utilities/hooks.
4. Keep naming and prop contracts explicit and predictable.

## State and Effects

1. Avoid stale closure and dependency array mistakes.
2. Avoid duplicated derived state that can drift.
3. Clean up event listeners/timers/subscriptions.
4. Guard against race conditions in async handlers.

## Performance

1. Check unnecessary re-renders from unstable props/callbacks.
2. Check expensive computations without memoization where needed.
3. Check large tables/lists for rendering pressure.
4. Check bundle-heavy imports in route-level code.

## UX and Resilience

1. Preserve user input on transient failures.
2. Surface clear errors and recovery actions.
3. Handle null/undefined and malformed data safely.
4. Keep keyboard and focus behavior usable.

## Reporting Template

For each finding:

1. Severity
2. File reference
3. Risk/impact
4. Concrete remediation
