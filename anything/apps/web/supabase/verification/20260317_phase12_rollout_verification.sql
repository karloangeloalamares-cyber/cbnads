-- Phase 12 rollout verification (read-only)
-- Date: March 17, 2026
-- Purpose:
--   Verify that Phase 0-8 hardening objects are present and correctly granted.
-- Safety:
--   This script only runs SELECT statements.

-- 1) Required migrations applied
with required(version) as (
  values
    ('20260317110000'),
    ('20260317123000'),
    ('20260317133000'),
    ('20260317143000'),
    ('20260317153000'),
    ('20260317163000'),
    ('20260317173000'),
    ('20260317183000')
)
select
  r.version,
  (m.version is not null) as applied
from required as r
left join supabase_migrations.schema_migrations as m
  on m.version = r.version
order by r.version;

-- 2) Atomic/idempotency RPCs exist, are security definer, and are grant-restricted
with required(signature) as (
  values
    ('public.cbnads_web_adjust_prepaid_credits(uuid, numeric, text, text, uuid, uuid, uuid)'),
    ('public.cbnads_web_try_pay_invoice_with_credits(uuid, uuid, text)'),
    ('public.cbnads_web_update_invoice_atomic(uuid, jsonb, jsonb, boolean)'),
    ('public.cbnads_web_soft_delete_invoice_atomic(uuid, uuid)'),
    ('public.cbnads_web_create_invoice_atomic(jsonb, jsonb, jsonb, text, boolean, uuid, text)'),
    ('public.cbnads_web_adjust_prepaid_credits_atomic(uuid, numeric, text, text, uuid, uuid, uuid, text)'),
    ('public.cbnads_web_convert_pending_to_ad_atomic(uuid, jsonb, boolean)')
)
select
  r.signature,
  (f.proc_oid is not null) as exists,
  coalesce(p.prosecdef, false) as security_definer,
  coalesce(has_function_privilege('service_role', f.proc_oid, 'EXECUTE'), false) as service_role_execute,
  coalesce(has_function_privilege('anon', f.proc_oid, 'EXECUTE'), false) as anon_execute,
  coalesce(has_function_privilege('authenticated', f.proc_oid, 'EXECUTE'), false) as authenticated_execute
from required as r
left join lateral (
  select to_regprocedure(r.signature) as proc_oid
) as f on true
left join pg_proc as p
  on p.oid = f.proc_oid
order by r.signature;

-- 3) Required columns and indexes for idempotency/uniqueness
with required_columns(schema_name, table_name, column_name) as (
  values
    ('public', 'cbnads_web_ads', 'source_pending_ad_id'),
    ('public', 'cbnads_web_invoices', 'source_request_key'),
    ('public', 'cbnads_web_credit_ledger', 'source_request_key'),
    ('public', 'cbnads_web_pending_ads', 'source_request_key')
)
select
  rc.schema_name,
  rc.table_name,
  rc.column_name,
  exists (
    select 1
    from information_schema.columns as c
    where c.table_schema = rc.schema_name
      and c.table_name = rc.table_name
      and c.column_name = rc.column_name
  ) as exists
from required_columns as rc
order by rc.table_name, rc.column_name;

with required_indexes(index_name, table_name) as (
  values
    ('cbnads_web_ads_source_pending_ad_id_uniq', 'cbnads_web_ads'),
    ('cbnads_web_invoices_source_request_key_uniq', 'cbnads_web_invoices'),
    ('cbnads_web_credit_ledger_source_request_key_uniq', 'cbnads_web_credit_ledger'),
    ('cbnads_web_pending_ads_source_request_key_uniq', 'cbnads_web_pending_ads')
)
select
  ri.index_name,
  ri.table_name,
  exists (
    select 1
    from pg_indexes as i
    where i.schemaname = 'public'
      and i.indexname = ri.index_name
      and i.tablename = ri.table_name
  ) as exists
from required_indexes as ri
order by ri.table_name, ri.index_name;

-- 4) Capacity guard triggers present
with required_triggers(trigger_name, table_name) as (
  values
    ('cbnads_web_ads_slot_capacity_guard', 'cbnads_web_ads'),
    ('cbnads_web_pending_ads_slot_capacity_guard', 'cbnads_web_pending_ads')
)
select
  rt.trigger_name,
  rt.table_name,
  exists (
    select 1
    from pg_trigger as t
    join pg_class as c on c.oid = t.tgrelid
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = rt.table_name
      and t.tgname = rt.trigger_name
      and not t.tgisinternal
  ) as exists
from required_triggers as rt
order by rt.table_name, rt.trigger_name;

-- 5) Duplicate-key audit (should be zero duplicate_groups in every row)
select
  'cbnads_web_ads.source_pending_ad_id' as key_name,
  count(*) as duplicate_groups
from (
  select source_pending_ad_id
  from public.cbnads_web_ads
  where source_pending_ad_id is not null
  group by source_pending_ad_id
  having count(*) > 1
) as dup
union all
select
  'cbnads_web_invoices.source_request_key' as key_name,
  count(*) as duplicate_groups
from (
  select lower(btrim(source_request_key)) as source_request_key
  from public.cbnads_web_invoices
  where source_request_key is not null
    and btrim(source_request_key) <> ''
  group by lower(btrim(source_request_key))
  having count(*) > 1
) as dup
union all
select
  'cbnads_web_credit_ledger.source_request_key' as key_name,
  count(*) as duplicate_groups
from (
  select lower(btrim(source_request_key)) as source_request_key
  from public.cbnads_web_credit_ledger
  where source_request_key is not null
    and btrim(source_request_key) <> ''
  group by lower(btrim(source_request_key))
  having count(*) > 1
) as dup
union all
select
  'cbnads_web_pending_ads.source_request_key' as key_name,
  count(*) as duplicate_groups
from (
  select lower(btrim(source_request_key)) as source_request_key
  from public.cbnads_web_pending_ads
  where source_request_key is not null
    and btrim(source_request_key) <> ''
  group by lower(btrim(source_request_key))
  having count(*) > 1
) as dup;

-- 6) Human-readable execute grants snapshot for hardened RPCs
select
  rp.routine_name,
  rp.grantee,
  rp.privilege_type
from information_schema.routine_privileges as rp
where rp.routine_schema = 'public'
  and rp.routine_name in (
    'cbnads_web_adjust_prepaid_credits',
    'cbnads_web_try_pay_invoice_with_credits',
    'cbnads_web_update_invoice_atomic',
    'cbnads_web_soft_delete_invoice_atomic',
    'cbnads_web_create_invoice_atomic',
    'cbnads_web_adjust_prepaid_credits_atomic',
    'cbnads_web_convert_pending_to_ad_atomic'
  )
  and rp.privilege_type = 'EXECUTE'
order by rp.routine_name, rp.grantee;

