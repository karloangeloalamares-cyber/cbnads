-- Add prepaid credits support for advertisers and invoices.

alter table cbnads_web_advertisers
add column if not exists credits numeric(12,2) not null default 0.00;

alter table cbnads_web_invoices
add column if not exists paid_via_credits boolean not null default false;

create table if not exists cbnads_web_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references cbnads_web_advertisers(id) on delete cascade,
  invoice_id uuid references cbnads_web_invoices(id) on delete set null,
  ad_id uuid references cbnads_web_ads(id) on delete set null,
  amount numeric(12,2) not null,
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  entry_type text not null,
  note text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cbnads_web_credit_ledger_advertiser
on cbnads_web_credit_ledger(advertiser_id, created_at desc);

create index if not exists idx_cbnads_web_credit_ledger_invoice
on cbnads_web_credit_ledger(invoice_id);

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

create or replace function public.cbnads_web_try_pay_invoice_with_credits(
  p_invoice_id uuid,
  p_created_by uuid default null,
  p_note text default null
)
returns table (
  applied boolean,
  reason text,
  invoice_id uuid,
  advertiser_id uuid,
  amount numeric,
  balance_before numeric,
  balance_after numeric,
  ledger_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice cbnads_web_invoices%rowtype;
  v_current numeric(12,2);
  v_next numeric(12,2);
  v_total numeric(12,2);
  v_note text;
  v_ledger_id uuid;
  v_single_ad_id uuid;
begin
  if p_invoice_id is null then
    raise exception 'invoice_id is required';
  end if;

  select *
  into v_invoice
  from cbnads_web_invoices
  where id = p_invoice_id
  for update;

  if not found then
    return query
    select false, 'invoice_not_found', p_invoice_id, null::uuid, 0::numeric, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  v_total := round(greatest(coalesce(v_invoice.total, v_invoice.amount, 0), 0)::numeric, 2);

  if v_invoice.deleted_at is not null then
    return query
    select false, 'invoice_deleted', v_invoice.id, v_invoice.advertiser_id, v_total, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  if lower(coalesce(v_invoice.status, '')) <> 'pending' then
    return query
    select false, 'invoice_not_pending', v_invoice.id, v_invoice.advertiser_id, v_total, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  if v_invoice.advertiser_id is null then
    return query
    select false, 'missing_advertiser', v_invoice.id, null::uuid, v_total, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  if v_total <= 0 then
    return query
    select false, 'non_positive_total', v_invoice.id, v_invoice.advertiser_id, v_total, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  select coalesce(credits, 0)
  into v_current
  from cbnads_web_advertisers
  where id = v_invoice.advertiser_id
  for update;

  if not found then
    return query
    select false, 'advertiser_not_found', v_invoice.id, v_invoice.advertiser_id, v_total, null::numeric, null::numeric, null::uuid;
    return;
  end if;

  if v_current < v_total then
    return query
    select false, 'insufficient_credits', v_invoice.id, v_invoice.advertiser_id, v_total, v_current, v_current, null::uuid;
    return;
  end if;

  v_next := round((v_current - v_total)::numeric, 2);

  select linked.linked_ad_id
  into v_single_ad_id
  from (
    select distinct ad_id as linked_ad_id
    from cbnads_web_invoice_items
    where invoice_id = v_invoice.id
      and ad_id is not null
    union
    select nullif(value, '')::uuid as linked_ad_id
    from jsonb_array_elements_text(coalesce(v_invoice.ad_ids, '[]'::jsonb)) as value
    where nullif(value, '') is not null
  ) linked
  limit 1;

  update cbnads_web_advertisers
  set credits = v_next,
      updated_at = now()
  where id = v_invoice.advertiser_id;

  v_note := coalesce(
    nullif(btrim(coalesce(p_note, '')), ''),
    format(
      'Prepaid credits applied to invoice %s',
      coalesce(nullif(v_invoice.invoice_number, ''), v_invoice.id::text)
    )
  );

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
    v_invoice.advertiser_id,
    v_invoice.id,
    v_single_ad_id,
    -v_total,
    v_current,
    v_next,
    'invoice_payment',
    v_note,
    p_created_by
  )
  returning id into v_ledger_id;

  update cbnads_web_invoices
  set status = 'Paid',
      paid_via_credits = true,
      amount_paid = v_total,
      paid_date = current_date,
      updated_at = now()
  where id = v_invoice.id;

  update cbnads_web_ads
  set payment = 'Paid',
      invoice_id = coalesce(invoice_id, v_invoice.id),
      paid_via_invoice_id = coalesce(paid_via_invoice_id, v_invoice.id),
      updated_at = now()
  where id in (
    select linked_ad_id
    from (
      select distinct ad_id as linked_ad_id
      from cbnads_web_invoice_items
      where invoice_id = v_invoice.id
        and ad_id is not null
      union
      select nullif(value, '')::uuid as linked_ad_id
      from jsonb_array_elements_text(coalesce(v_invoice.ad_ids, '[]'::jsonb)) as value
      where nullif(value, '') is not null
    ) linked_ids
  );

  return query
  select true, 'applied', v_invoice.id, v_invoice.advertiser_id, v_total, v_current, v_next, v_ledger_id;
end;
$$;

grant execute on function public.cbnads_web_adjust_prepaid_credits(uuid, numeric, text, text, uuid, uuid, uuid)
to authenticated, service_role;

grant execute on function public.cbnads_web_try_pay_invoice_with_credits(uuid, uuid, text)
to authenticated, service_role;
