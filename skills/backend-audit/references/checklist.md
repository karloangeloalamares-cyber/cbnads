# Backend Audit Checklist

## Endpoint Inventory

1. Enumerate all route handlers in scope.
2. Confirm method/path semantics match behavior.
3. Confirm admin/public/private boundaries are explicit.

## Auth and Authorization

1. Verify authentication is required where expected.
2. Verify role checks exist for privileged actions.
3. Verify fallback roles do not accidentally escalate access.
4. Verify no trust of client-provided role fields.

## Input Validation

1. Validate required fields and types.
2. Validate enum/range constraints.
3. Reject malformed dates/IDs/arrays early.
4. Sanitize or constrain free-form fields where needed.

## Data Integrity

1. Verify table/column names align with migration schema.
2. Verify mutation order for related records.
3. Verify duplicate-safe behavior for retries.
4. Verify derived fields stay consistent after writes.

## Error and Response Contract

1. Return stable response shape for success/failure.
2. Use status codes that map to actual failure classes.
3. Avoid leaking internal implementation details.
4. Return actionable client-facing error messages.

## Operational Safety

1. Verify env vars required by route are documented.
2. Verify migration dependencies are explicit.
3. Verify compatibility behavior for partial schemas.
4. Verify logs are sufficient for debugging production issues.

## Reporting Template

For each finding:

1. Severity
2. Route/file reference
3. Risk scenario
4. Concrete fix
