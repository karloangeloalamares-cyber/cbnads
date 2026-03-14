-- Fix runtime ambiguity in cbnads_web_adjust_prepaid_credits.
-- The RETURNS TABLE output column `credits` shadows the table column name in
-- PL/pgSQL unless the table column is qualified.

create or replace function public.cbnads_web_adjust_prepaid_credits(
  p_advertiser_id uuid,
  p_amount numeric,
  p_entry_type text,
  p_note text,
  p_created_by uuid default null,
  p_invoice_id uuid default null,
  p_ad_id uuid default null
)
returns table (
  advertiser_id uuid,
  credits numeric,
  balance_before numeric,
  balance_after numeric,
  ledger_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current numeric(12,2);
  v_next numeric(12,2);
  v_ledger_id uuid;
begin
  if p_advertiser_id is null then
    raise exception 'advertiser_id is required';
  end if;

  if coalesce(p_amount, 0) = 0 then
    raise exception 'amount must not be zero';
  end if;

  if nullif(btrim(coalesce(p_entry_type, '')), '') is null then
    raise exception 'entry_type is required';
  end if;

  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'note is required';
  end if;

  select coalesce(a.credits, 0)
  into v_current
  from cbnads_web_advertisers a
  where a.id = p_advertiser_id
  for update;

  if not found then
    raise exception 'advertiser not found';
  end if;

  v_next := round((v_current + p_amount)::numeric, 2);
  if v_next < 0 then
    raise exception 'insufficient credits';
  end if;

  update cbnads_web_advertisers
  set credits = v_next,
      updated_at = now()
  where id = p_advertiser_id;

  insert into cbnads_web_credit_ledger (
    advertiser_id,
    invoice_id,
    ad_id,
    amount,
    balance_before,
    balance_after,
    entry_type,
    note,
    created_by
  )
  values (
    p_advertiser_id,
    p_invoice_id,
    p_ad_id,
    round(p_amount::numeric, 2),
    v_current,
    v_next,
    p_entry_type,
    p_note,
    p_created_by
  )
  returning id into v_ledger_id;

  return query
  select
    p_advertiser_id,
    v_next,
    v_current,
    v_next,
    v_ledger_id;
end;
$$;

grant execute on function public.cbnads_web_adjust_prepaid_credits(uuid, numeric, text, text, uuid, uuid, uuid)
to authenticated, service_role;
