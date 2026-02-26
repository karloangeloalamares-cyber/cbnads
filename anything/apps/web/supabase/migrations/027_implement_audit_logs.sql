-- 027_implement_audit_logs.sql

-- Generic Audit Logic Function
create or replace function public.log_entity_action()
returns trigger
language plpgsql
security definer
as $$
declare
    v_tenant_id uuid;
    v_actor_id uuid;
    v_entity_type text;
    v_action text;
begin
    -- 1. Identify Actor (Defaults to current UID)
    v_actor_id := auth.uid();
    
    -- 2. Identify Entity Type based on table name
    v_entity_type := TG_TABLE_NAME;
    
    -- 3. Identify Action
    v_action := TG_OP;
    
    -- 4. Get Tenant ID (Assuming all audited tables have tenant_id)
    -- For DELETE, we use OLD, otherwise use NEW
    if (TG_OP = 'DELETE') then
        v_tenant_id := OLD.tenant_id;
    else
        v_tenant_id := NEW.tenant_id;
    end if;

    -- 5. Insert Log
    insert into public.audit_logs (
        tenant_id,
        actor_user_id,
        entity_type,
        entity_id,
        action,
        previous_value,
        new_value
    )
    values (
        v_tenant_id,
        v_actor_id,
        v_entity_type,
        case 
            when TG_OP = 'DELETE' then OLD.id 
            else NEW.id 
        end,
        v_action,
        case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end,
        case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) else null end
    );

    return null; -- Result is ignored for AFTER triggers
end;
$$;
-- Apply to Ads
drop trigger if exists audit_ads_trigger on public.ads;
create trigger audit_ads_trigger
after insert or update or delete
on public.ads
for each row
execute function public.log_entity_action();
-- Apply to Invoices
drop trigger if exists audit_invoices_trigger on public.invoices;
create trigger audit_invoices_trigger
after insert or update or delete
on public.invoices
for each row
execute function public.log_entity_action();
-- Apply to Advertisers
drop trigger if exists audit_advertisers_trigger on public.advertisers;
create trigger audit_advertisers_trigger
after insert or update or delete
on public.advertisers
for each row
execute function public.log_entity_action();
-- Apply to Payments (Explicit logging beyond the payments table itself)
drop trigger if exists audit_payments_trigger on public.payments;
create trigger audit_payments_trigger
after insert or update or delete
on public.payments
for each row
execute function public.log_entity_action();
