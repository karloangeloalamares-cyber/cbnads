-- Fix PL/pgSQL ambiguity between output column names and table columns.
-- Error observed: column reference "invoice_id" is ambiguous (42702).

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
  from cbnads_web_invoices as inv
  where inv.id = p_invoice_id
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

  select coalesce(ad.credits, 0)
  into v_current
  from cbnads_web_advertisers as ad
  where ad.id = v_invoice.advertiser_id
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
    select distinct items.ad_id as linked_ad_id
    from cbnads_web_invoice_items as items
    where items.invoice_id = v_invoice.id
      and items.ad_id is not null
    union
    select nullif(value, '')::uuid as linked_ad_id
    from jsonb_array_elements_text(coalesce(v_invoice.ad_ids, '[]'::jsonb)) as value
    where nullif(value, '') is not null
  ) linked
  limit 1;

  update cbnads_web_advertisers as ad
  set credits = v_next,
      updated_at = now()
  where ad.id = v_invoice.advertiser_id;

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

  update cbnads_web_invoices as inv
  set status = 'Paid',
      paid_via_credits = true,
      amount_paid = v_total,
      paid_date = current_date,
      updated_at = now()
  where inv.id = v_invoice.id;

  update cbnads_web_ads as ads
  set payment = 'Paid',
      invoice_id = coalesce(ads.invoice_id, v_invoice.id),
      paid_via_invoice_id = coalesce(ads.paid_via_invoice_id, v_invoice.id),
      updated_at = now()
  where ads.id in (
    select linked_ids.linked_ad_id
    from (
      select distinct items.ad_id as linked_ad_id
      from cbnads_web_invoice_items as items
      where items.invoice_id = v_invoice.id
        and items.ad_id is not null
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

grant execute on function public.cbnads_web_try_pay_invoice_with_credits(uuid, uuid, text)
to authenticated, service_role;

