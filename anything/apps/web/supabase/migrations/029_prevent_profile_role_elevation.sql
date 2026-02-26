-- Migration 029: Prevent Profile Role and Tenant Elevation
-- Adds trigger to prevent unauthorized changes to sensitive profile fields

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS check_profile_changes ON profiles;
DROP FUNCTION IF EXISTS prevent_sensitive_profile_changes();
-- Create function to prevent role and tenant changes
CREATE OR REPLACE FUNCTION prevent_sensitive_profile_changes()
RETURNS trigger AS $$
BEGIN
  -- Allow changes if user is Owner (platform super admin)
  IF public.is_owner() THEN
    RETURN NEW;
  END IF;

  -- Prevent role changes for non-Owners
  IF NEW.role != OLD.role THEN
    RAISE EXCEPTION 'Cannot modify user role. Only platform owners can change roles.';
  END IF;

  -- Prevent tenant_id changes (users cannot switch tenants)
  IF NEW.tenant_id != OLD.tenant_id THEN
    RAISE EXCEPTION 'Cannot modify tenant assignment. Users cannot switch organizations.';
  END IF;

  -- Prevent advertiser_id changes unless user is Admin/Manager of same tenant
  IF NEW.advertiser_id IS DISTINCT FROM OLD.advertiser_id THEN
    -- Allow if user is Admin or Manager in the same tenant
    IF NOT (
      public.same_tenant(NEW.tenant_id) AND
      (public.is_admin() OR public.is_manager())
    ) THEN
      RAISE EXCEPTION 'Cannot modify advertiser assignment without proper permissions.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Create trigger on profiles table
CREATE TRIGGER check_profile_changes
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION prevent_sensitive_profile_changes();
-- Add comment for documentation
COMMENT ON FUNCTION prevent_sensitive_profile_changes() IS
'Prevents unauthorized changes to sensitive profile fields (role, tenant_id, advertiser_id). Only Owners can change roles and tenant assignments.';
