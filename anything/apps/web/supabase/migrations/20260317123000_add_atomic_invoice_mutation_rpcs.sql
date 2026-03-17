-- Phase 1 integrity hardening:
-- Add transactional invoice mutation RPCs and lock execution to service_role.

create or replace function public.cbnads_web_update_invoice_atomic(
  p_invoice_id uuid,
  p_patch jsonb default '{}'::jsonb,
  p_items jsonb default '[]'::jsonb,
  p_replace_items boolean default false
)
returns table (
  invoice_id uuid,
  old_advertiser_id uuid,
  new_advertiser_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current cbnads_web_invoices%rowtype;
  v_updated cbnads_web_invoices%rowtype;
  v_item jsonb;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_amount numeric(12,2);
begin
  if p_invoice_id is null then
    raise exception 'invoice_id is required';
  end if;

  if coalesce(jsonb_typeof(p_patch), 'object') <> 'object' then
    raise exception 'patch must be an object';
  end if;

  if p_replace_items and coalesce(jsonb_typeof(p_items), 'array') <> 'array' then
    raise exception 'items must be an array';
  end if;

  if p_patch ? 'ad_ids' and p_patch->'ad_ids' is not null and jsonb_typeof(p_patch->'ad_ids') <> 'array' then
    raise exception 'ad_ids must be an array';
  end if;

  select *
  into v_current
  from cbnads_web_invoices as inv
  where inv.id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  update cbnads_web_invoices as inv
  set
    advertiser_id = case
      when p_patch ? 'advertiser_id' then nullif(btrim(coalesce(p_patch->>'advertiser_id', '')), '')::uuid
      else inv.advertiser_id
    end,
    advertiser_name = case
      when p_patch ? 'advertiser_name' then nullif(btrim(coalesce(p_patch->>'advertiser_name', '')), '')
      else inv.advertiser_name
    end,
    contact_name = case
      when p_patch ? 'contact_name' then nullif(btrim(coalesce(p_patch->>'contact_name', '')), '')
      else inv.contact_name
    end,
    contact_email = case
      when p_patch ? 'contact_email' then nullif(btrim(coalesce(p_patch->>'contact_email', '')), '')
      else inv.contact_email
    end,
    bill_to = case
      when p_patch ? 'bill_to' then nullif(btrim(coalesce(p_patch->>'bill_to', '')), '')
      else inv.bill_to
    end,
    issue_date = case
      when p_patch ? 'issue_date' then
        coalesce(
          nullif(btrim(coalesce(p_patch->>'issue_date', '')), '')::date,
          inv.issue_date
        )
      else inv.issue_date
    end,
    status = case
      when p_patch ? 'status' then nullif(btrim(coalesce(p_patch->>'status', '')), '')
      else inv.status
    end,
    discount = case
      when p_patch ? 'discount' then round(coalesce((p_patch->>'discount')::numeric, 0), 2)
      else inv.discount
    end,
    tax = case
      when p_patch ? 'tax' then round(coalesce((p_patch->>'tax')::numeric, 0), 2)
      else inv.tax
    end,
    total = case
      when p_patch ? 'total' then round(coalesce((p_patch->>'total')::numeric, 0), 2)
      else inv.total
    end,
    amount = case
      when p_patch ? 'amount' then round(coalesce((p_patch->>'amount')::numeric, 0), 2)
      else inv.amount
    end,
    amount_paid = case
      when p_patch ? 'amount_paid' then round(coalesce((p_patch->>'amount_paid')::numeric, 0), 2)
      else inv.amount_paid
    end,
    notes = case
      when p_patch ? 'notes' then nullif(btrim(coalesce(p_patch->>'notes', '')), '')
      else inv.notes
    end,
    ad_ids = case
      when p_patch ? 'ad_ids' then coalesce(p_patch->'ad_ids', '[]'::jsonb)
      else inv.ad_ids
    end,
    updated_at = case
      when p_patch ? 'updated_at' then coalesce((p_patch->>'updated_at')::timestamptz, now())
      else now()
    end
  where inv.id = p_invoice_id
  returning * into v_updated;

  if p_replace_items then
    delete from cbnads_web_invoice_items
    where invoice_id = p_invoice_id;

    for v_item in
      select value
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as value
    loop
      v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));
      v_unit_price := round(coalesce((v_item->>'unit_price')::numeric, 0), 2);
      v_amount := round(
        coalesce((v_item->>'amount')::numeric, (v_quantity * v_unit_price)::numeric),
        2
      );

      insert into cbnads_web_invoice_items (
        invoice_id,
        ad_id,
        product_id,
        description,
        quantity,
        unit_price,
        amount,
        created_at
      )
      values (
        p_invoice_id,
        nullif(btrim(coalesce(v_item->>'ad_id', '')), '')::uuid,
        nullif(btrim(coalesce(v_item->>'product_id', '')), '')::uuid,
        coalesce(v_item->>'description', ''),
        v_quantity,
        v_unit_price,
        v_amount,
        coalesce(nullif(v_item->>'created_at', '')::timestamptz, now())
      );
    end loop;
  end if;

  return query
  select
    v_updated.id,
    v_current.advertiser_id,
    v_updated.advertiser_id;
end;
$$;

create or replace function public.cbnads_web_soft_delete_invoice_atomic(
  p_invoice_id uuid,
  p_created_by uuid default null
)
returns table (
  invoice_id uuid,
  advertiser_id uuid,
  refunded_credits numeric,
  had_credit_refund boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice cbnads_web_invoices%rowtype;
  v_refund numeric(12,2) := 0;
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
    raise exception 'invoice_not_found';
  end if;

  if v_invoice.deleted_at is not null then
    raise exception 'invoice_already_deleted';
  end if;

  update cbnads_web_invoices as inv
  set deleted_at = now(),
      updated_at = now()
  where inv.id = v_invoice.id;

  update cbnads_web_ads as ads
  set invoice_id = null,
      paid_via_invoice_id = null,
      payment = 'Unpaid',
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

  if v_invoice.paid_via_credits = true and v_invoice.advertiser_id is not null then
    v_refund := round(
      greatest(coalesce(v_invoice.total, v_invoice.amount, v_invoice.amount_paid, 0), 0)::numeric,
      2
    );

    if v_refund > 0 then
      perform 1
      from public.cbnads_web_adjust_prepaid_credits(
        v_invoice.advertiser_id,
        v_refund,
        'invoice_delete_credit_refund',
        format(
          'Prepaid credits restored after deleting invoice %s',
          coalesce(nullif(v_invoice.invoice_number, ''), v_invoice.id::text)
        ),
        p_created_by,
        v_invoice.id,
        null
      );
    end if;
  end if;

  return query
  select
    v_invoice.id,
    v_invoice.advertiser_id,
    v_refund,
    (v_refund > 0);
end;
$$;

revoke execute on function public.cbnads_web_update_invoice_atomic(uuid, jsonb, jsonb, boolean)
from public, anon, authenticated;

revoke execute on function public.cbnads_web_soft_delete_invoice_atomic(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.cbnads_web_update_invoice_atomic(uuid, jsonb, jsonb, boolean)
to service_role;

grant execute on function public.cbnads_web_soft_delete_invoice_atomic(uuid, uuid)
to service_role;
