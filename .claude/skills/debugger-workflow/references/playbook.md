# Debugging Playbook

## Reproduction Contract

Always document:

1. Exact route/action.
2. Identity/role used.
3. Input payload.
4. Expected behavior.
5. Actual behavior and error text.

## Isolation Heuristics

1. If UI and API both changed recently, isolate each layer independently.
2. If failure is data-specific, capture one failing and one passing sample.
3. If behavior differs by environment, diff env variables and build mode first.

## Common Failure Classes

1. Schema mismatch
   - missing column
   - renamed field
   - nullability drift
2. Authorization drift
   - role fallback
   - missing admin gate
3. State drift
   - stale client store
   - unhandled async sequence
4. Date/time issues
   - timezone parsing
   - date-only vs datetime confusion

## Minimal Patch Rule

1. Fix root cause directly.
2. Keep scope narrow.
3. Do not mix formatting/refactor with bug fix unless required.

## Regression Guard

After patch:

1. Re-run failing case.
2. Re-run at least one nearby happy path.
3. Run build/typecheck.
4. Document any untested risk.
