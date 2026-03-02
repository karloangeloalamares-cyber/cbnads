---
name: ux-ui-audit
description: Run end-to-end UX/UI audits for web pages and dashboards. Use when the user asks for design parity, pixel-accurate checks, spacing/alignment review, responsive QA, interaction polish, or prioritized UI findings with concrete fixes.
---

# UX/UI Audit

## Overview

Execute a structured visual and interaction audit against a design reference or quality bar. Produce severity-ranked findings, file-level fixes, and verification steps.

## Audit Workflow

1. Define the target and baseline.
2. Capture objective evidence.
3. Evaluate visual parity and interaction quality.
4. Report issues by severity with exact fixes.
5. Re-verify after implementation.

## Step 1: Define Scope

Collect:

1. Route/page to audit.
2. Design source (image/Figma/HTML reference).
3. Required viewport(s): desktop, tablet, mobile.
4. Requested strictness: parity vs. usability optimization.

## Step 2: Capture Evidence

Gather side-by-side evidence before changing code:

1. Current implementation screenshot(s).
2. Target design screenshot(s).
3. Critical measurements:
   - spacing and layout rhythm
   - typography hierarchy
   - control sizing and alignment
   - color and contrast

## Step 3: Audit Categories

Audit against `references/checklist.md`:

1. Layout/parity
2. Controls and states
3. Responsiveness
4. Accessibility and readability
5. Copy clarity and task flow

## Step 4: Report Findings

Report findings first, ordered by severity:

1. `Critical`: blocks task completion or creates major confusion.
2. `High`: large parity gap or interaction failure.
3. `Medium`: visible quality issues and consistency gaps.
4. `Low`: polish opportunities.

For each finding include:

1. What is wrong.
2. Why it matters.
3. Where it is (`file:line` when code-backed).
4. Exact fix recommendation.

## Step 5: Re-verify

After edits:

1. Re-check against the same baseline.
2. Confirm no regressions on secondary breakpoints.
3. Call out remaining deltas explicitly.

## Output Format

Use:

1. `Findings` (severity-ordered)
2. `Fix Plan`
3. `Validation`

## References

1. `references/checklist.md` for full audit rubric.
