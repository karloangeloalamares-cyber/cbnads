-- Phase 6 integrity hardening:
-- Add DB-level idempotency for manual credit adjustments.

alter table if exists public.cbnads_web_credit_ledger
  add column if not exists source_request_key text;

create unique index if not exists cbnads_web_credit_ledger_source_request_key_uniq
  on public.cbnads_web_credit_ledger (source_request_key)
  where source_request_key is not null
    and btrim(source_request_key) <> '';

create or replace function public.cbnads_web_adjust_prepaid_credits_atomic(
  p_advertiser_id uuid,
  p_amount numeric,
  p_entry_type text,
  p_note text,
  p_created_by uuid default null,
  p_invoice_id uuid default null,
  p_ad_id uuid default null,
  p_source_request_key text default null
)
returns table (
  advertiser_id uuid,
  credits numeric,
  balance_before numeric,
  balance_after numeric,
  ledger_id uuid,
  created boolean,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current numeric(12,2);
  v_next numeric(12,2);
  v_ledger cbnads_web_credit_ledger%rowtype;
  v_requested_amount numeric(12,2) := round(coalesce(p_amount, 0)::numeric, 2);
  v_requested_entry_type text := lower(btrim(coalesce(p_entry_type, '')));
  v_source_request_key text := nullif(
    left(lower(btrim(coalesce(p_source_request_key, ''))), 255),
    ''
  );
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

  if v_source_request_key is not null then
    perform pg_advisory_xact_lock(41723, hashtext(v_source_request_key));

    select *
    into v_ledger
    from public.cbnads_web_credit_ledger as ledger
    where ledger.source_request_key = v_source_request_key
    order by ledger.created_at desc
    limit 1;

    if found then
      if v_ledger.advertiser_id is distinct from p_advertiser_id then
        raise exception 'idempotency_key_conflict_advertiser';
      end if;

      if round(coalesce(v_ledger.amount, 0)::numeric, 2) <> v_requested_amount then
        raise exception 'idempotency_key_conflict_amount';
      end if;

      if lower(btrim(coalesce(v_ledger.entry_type, ''))) <> v_requested_entry_type then
        raise exception 'idempotency_key_conflict_entry_type';
      end if;

      return query
      select
        v_ledger.advertiser_id,
        v_ledger.balance_after,
        v_ledger.balance_before,
        v_ledger.balance_after,
        v_ledger.id,
        false,
        'idempotency_reuse';
      return;
    end if;
  end if;

  select coalesce(a.credits, 0)
  into v_current
  from public.cbnads_web_advertisers as a
  where a.id = p_advertiser_id
  for update;

  if not found then
    raise exception 'advertiser not found';
  end if;

  v_next := round((v_current + p_amount)::numeric, 2);
  if v_next < 0 then
    raise exception 'insufficient credits';
  end if;

  update public.cbnads_web_advertisers as a
  set credits = v_next,
      updated_at = now()
  where a.id = p_advertiser_id;

  begin
    insert into public.cbnads_web_credit_ledger (
      advertiser_id,
      invoice_id,
      ad_id,
      amount,
      balance_before,
      balance_after,
      entry_type,
      note,
      created_by,
      source_request_key
    )
    values (
      p_advertiser_id,
      p_invoice_id,
      p_ad_id,
      v_requested_amount,
      v_current,
      v_next,
      p_entry_type,
      p_note,
      p_created_by,
      v_source_request_key
    )
    returning * into v_ledger;
  exception when unique_violation then
    if v_source_request_key is not null then
      select *
      into v_ledger
      from public.cbnads_web_credit_ledger as ledger
      where ledger.source_request_key = v_source_request_key
      order by ledger.created_at desc
      limit 1;

      if found then
        if v_ledger.advertiser_id is distinct from p_advertiser_id then
          raise exception 'idempotency_key_conflict_advertiser';
        end if;

        if round(coalesce(v_ledger.amount, 0)::numeric, 2) <> v_requested_amount then
          raise exception 'idempotency_key_conflict_amount';
        end if;

        if lower(btrim(coalesce(v_ledger.entry_type, ''))) <> v_requested_entry_type then
          raise exception 'idempotency_key_conflict_entry_type';
        end if;

        return query
        select
          v_ledger.advertiser_id,
          v_ledger.balance_after,
          v_ledger.balance_before,
          v_ledger.balance_after,
          v_ledger.id,
          false,
          'idempotency_reuse';
        return;
      end if;
    end if;

    raise;
  end;

  return query
  select
    p_advertiser_id,
    v_next,
    v_current,
    v_next,
    v_ledger.id,
    true,
    'applied';
end;
$$;

revoke execute on function public.cbnads_web_adjust_prepaid_credits_atomic(
  uuid,
  numeric,
  text,
  text,
  uuid,
  uuid,
  uuid,
  text
)
from public, anon, authenticated;

grant execute on function public.cbnads_web_adjust_prepaid_credits_atomic(
  uuid,
  numeric,
  text,
  text,
  uuid,
  uuid,
  uuid,
  text
)
to service_role;
