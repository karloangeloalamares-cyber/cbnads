-- Migration 030: Explicit DENY Policies for Immutable Tables
-- Adds explicit deny policies for UPDATE and DELETE on approval and audit tables

-- ============================================================
-- AD_APPROVALS TABLE: Approvals should be immutable once created
-- ============================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "No updates on ad_approvals" ON ad_approvals;
DROP POLICY IF EXISTS "No deletes on ad_approvals" ON ad_approvals;
-- Prevent updates to ad_approvals (approvals are immutable)
CREATE POLICY "No updates on ad_approvals"
ON ad_approvals
FOR UPDATE
USING (false);
-- Prevent deletes on ad_approvals (approvals are permanent record)
CREATE POLICY "No deletes on ad_approvals"
ON ad_approvals
FOR DELETE
USING (false);
-- ============================================================
-- AUDIT_LOGS TABLE: Audit logs must be immutable for compliance
-- ============================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "No updates on audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "No deletes on audit_logs" ON audit_logs;
-- Prevent updates to audit_logs (audit trail must be immutable)
CREATE POLICY "No updates on audit_logs"
ON audit_logs
FOR UPDATE
USING (false);
-- Prevent deletes on audit_logs (audit trail must be permanent)
CREATE POLICY "No deletes on audit_logs"
ON audit_logs
FOR DELETE
USING (false);
-- ============================================================
-- TASKS TABLE: Add explicit DELETE policy
-- ============================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Admin/Manager can delete tasks" ON tasks;
-- Only Admins and Managers can delete tasks
CREATE POLICY "Admin/Manager can delete tasks"
ON tasks
FOR DELETE
USING (
    public.is_owner() OR
    (public.same_tenant(tenant_id) AND (public.is_admin() OR public.is_manager()))
);
-- ============================================================
-- Documentation Comments
-- ============================================================

COMMENT ON POLICY "No updates on ad_approvals" ON ad_approvals IS
'Approval records are immutable once created to maintain approval history integrity.';
COMMENT ON POLICY "No deletes on ad_approvals" ON ad_approvals IS
'Approval records cannot be deleted to maintain complete approval audit trail.';
COMMENT ON POLICY "No updates on audit_logs" ON audit_logs IS
'Audit logs are immutable for compliance and security auditing purposes.';
COMMENT ON POLICY "No deletes on audit_logs" ON audit_logs IS
'Audit logs cannot be deleted to maintain complete activity history for compliance.';
COMMENT ON POLICY "Admin/Manager can delete tasks" ON tasks IS
'Only Admins and Managers can delete tasks within their tenant.';
