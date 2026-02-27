---
name: backend-audit
description: Audit backend/API correctness, security, and data integrity for route handlers and database integrations. Use when the user asks for backend review, auth/role checks, schema alignment, API contract validation, migration risk analysis, or production-readiness findings.
---

# Backend Audit

## Overview

Audit server route handlers, auth boundaries, and database interactions. Produce prioritized findings with concrete fixes and verification guidance.

## Audit Workflow

1. Inventory exposed endpoints and data stores.
2. Verify auth and role enforcement.
3. Verify data contracts and schema compatibility.
4. Verify mutation safety and error handling.
5. Verify operational readiness (migrations/env/deploy assumptions).

## Step 1: Map the Surface

Collect:

1. Route files under API directory.
2. Auth middleware/helpers.
3. Database helper modules.
4. Migration files relevant to current endpoints.

## Step 2: Auth and Authorization

Check:

1. unauthenticated path handling
2. role checks for privileged actions
3. trust boundaries (request body vs server-side lookups)
4. sensitive operation restrictions

## Step 3: Data Integrity

Audit against `references/checklist.md`:

1. schema-field compatibility
2. null/optional handling
3. transactionally related writes
4. idempotency and duplicate protection
5. derived field consistency

## Step 4: Error and API Contract Quality

Check:

1. status code correctness
2. error payload consistency
3. input validation completeness
4. response shape stability

## Step 5: Report Findings

List findings first by severity:

1. `Critical`
2. `High`
3. `Medium`
4. `Low`

For each finding include:

1. file reference
2. exploit/failure mode
3. impact
4. concrete remediation

## Verification Commands

Run:

```powershell
npm run build
npm run typecheck
```

If endpoint tests exist, execute targeted tests for touched routes.

## References

1. `references/checklist.md`
