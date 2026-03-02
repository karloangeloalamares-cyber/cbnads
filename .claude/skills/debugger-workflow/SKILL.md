---
name: debugger-workflow
description: Run a structured, evidence-first debugging process across frontend and backend code. Use when a bug is reproducible but root cause is unknown, when regressions appear after changes, or when logs/build/runtime behavior must be isolated and fixed safely.
---

# Debugger Workflow

## Overview

Use a repeatable debugging lifecycle: reproduce, isolate, hypothesize, patch minimally, and verify with explicit evidence.

## Debugging Lifecycle

1. Reproduce reliably.
2. Define expected vs actual behavior.
3. Narrow fault domain.
4. Add focused instrumentation.
5. Implement smallest safe fix.
6. Verify and guard against regression.

## Step 1: Reproduce

Capture:

1. exact trigger steps
2. input data/state
3. environment assumptions (env vars, build mode, role)
4. observable failure output

Run context collector when useful:

```powershell
powershell -ExecutionPolicy Bypass -File skills/debugger-workflow/scripts/collect-debug-context.ps1
```

## Step 2: Isolate

Reduce scope quickly:

1. binary search route/component/handler boundaries
2. check recent commits in affected area
3. compare healthy vs failing code path

## Step 3: Hypothesize and Instrument

Add minimal logs/assertions exactly at uncertainty points:

1. do not flood logs globally
2. remove temporary instrumentation after fix
3. keep one active hypothesis at a time

## Step 4: Patch

Apply smallest change that resolves root cause:

1. avoid unrelated refactors in same patch
2. preserve existing public contracts unless requested
3. add guards for known edge cases

## Step 5: Verify

Run:

```powershell
npm run build
npm run typecheck
```

If relevant, rerun the exact reproduction scenario and confirm:

1. failure resolved
2. no adjacent regression
3. logs cleaned up

## Output Format

Use:

1. `Reproduction`
2. `Root Cause`
3. `Fix`
4. `Verification`
5. `Residual Risk`

## References

1. `references/playbook.md`
