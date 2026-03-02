---
name: frontend-audit
description: Audit frontend implementation quality for React/JS/TS applications. Use when the user asks for frontend code review, component/state audit, rendering/performance checks, maintainability issues, regression risk analysis, or actionable UI code fixes.
---

# Frontend Audit

## Overview

Evaluate frontend code structure and runtime behavior, then return severity-ranked findings with concrete file-level changes.

## Audit Workflow

1. Map route-to-component structure.
2. Trace state and data flow.
3. Evaluate correctness and UX behavior.
4. Evaluate maintainability and performance.
5. Verify with build/typecheck/tests when available.

## Step 1: Scope the Surface

Collect:

1. Target page/route.
2. Entry component(s).
3. Related hooks/utilities/services.
4. User-visible symptoms or acceptance criteria.

## Step 2: Trace Data and State

Review:

1. Source of truth for each displayed value.
2. Derived state and memoization correctness.
3. Async flow and loading/error handling.
4. Controlled vs uncontrolled input behavior.

## Step 3: Audit Quality Dimensions

Use `references/checklist.md` for:

1. correctness
2. readability and cohesion
3. reusability and duplication
4. rendering/performance
5. resilience and edge cases

## Step 4: Report Findings

List findings first, by severity:

1. `Critical`
2. `High`
3. `Medium`
4. `Low`

For each finding include:

1. file reference
2. impact/risk
3. why current behavior is incorrect or fragile
4. exact fix direction

## Step 5: Validate

Run applicable checks:

```powershell
npm run build
npm run typecheck
```

If tests exist for the area:

```powershell
npm test
```

## Output Format

Use:

1. `Findings`
2. `Assumptions / Unknowns`
3. `Fix Plan`
4. `Validation Results`

## References

1. `references/checklist.md`
