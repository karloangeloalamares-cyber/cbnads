-- Guarded credit-invoice mutations:
-- update/delete CRE-prefixed credit records while keeping advertiser credit balances in sync.

create or replace function public.cbnads_web_update_credit_invoice_atomic(
  p_invoice_id uuid,
  p_total numeric,
  p_note text default null,
  p_issue_date date default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_bill_to text default null,
  p_created_by uuid default null,
  p_change_reason text default null,
  p_source_request_key text default null
)
returns table (
  invoice_id uuid,
  advertiser_id uuid,
  total numeric,
  credit_delta numeric,
  ledger_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice cbnads_web_invoices%rowtype;
  v_current_total numeric(12,2);
  v_next_total numeric(12,2);
  v_delta numeric(12,2);
  v_adjustment record;
  v_reason text;
  v_source_request_key text := nullif(btrim(coalesce(p_source_request_key, '')), '');
begin
  if p_invoice_id is null then
    raise exception 'invoice_id is required';
  end if;

  select *
  into v_invoice
  from public.cbnads_web_invoices as inv
  where inv.id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  if v_invoice.deleted_at is not null then
    raise exception 'invoice_deleted';
  end if;

  if upper(coalesce(v_invoice.invoice_number, '')) not like 'CRE-%' then
    raise exception 'invoice_not_credit_record';
  end if;

  if v_invoice.advertiser_id is null then
    raise exception 'advertiser_id is required';
  end if;

  v_current_total := round(
    greatest(coalesce(v_invoice.total, v_invoice.amount, v_invoice.amount_paid, 0), 0)::numeric,
    2
  );
  v_next_total := round(
    greatest(coalesce(p_total, v_current_total), 0)::numeric,
    2
  );

  if v_next_total <= 0 then
    raise exception 'invoice_total_must_be_positive';
  end if;

  v_delta := round((v_next_total - v_current_total)::numeric, 2);

  if v_delta <> 0 then
    v_reason := coalesce(
      nullif(btrim(coalesce(p_change_reason, '')), ''),
      format(
        'Credit record %s adjusted.',
        coalesce(nullif(v_invoice.invoice_number, ''), v_invoice.id::text)
      )
    );

    select *
    into v_adjustment
    from public.cbnads_web_adjust_prepaid_credits_atomic(
      v_invoice.advertiser_id,
      v_delta,
      case
        when v_delta > 0 then 'credit_invoice_adjustment_add'
        else 'credit_invoice_adjustment_deduct'
      end,
      v_reason,
      p_created_by,
      v_invoice.id,
      null,
      case
        when v_source_request_key is null then null
        else left(v_source_request_key || ':credit-delta', 255)
      end
    );
  else
    v_adjustment := null;
  end if;

  update public.cbnads_web_invoices as inv
  set
    total = v_next_total,
    amount = v_next_total,
    amount_paid = v_next_total,
    status = 'Paid',
    issue_date = coalesce(p_issue_date, inv.issue_date, current_date),
    paid_date = coalesce(inv.paid_date, current_date),
    notes = case
      when p_note is null then inv.notes
      else nullif(btrim(coalesce(p_note, '')), '')
    end,
    contact_name = case
      when p_contact_name is null then inv.contact_name
      else nullif(btrim(coalesce(p_contact_name, '')), '')
    end,
    contact_email = case
      when p_contact_email is null then inv.contact_email
      else nullif(btrim(coalesce(p_contact_email, '')), '')
    end,
    bill_to = case
      when p_bill_to is null then inv.bill_to
      else nullif(btrim(coalesce(p_bill_to, '')), '')
    end,
    updated_at = now()
  where inv.id = v_invoice.id;

  return query
  select
    v_invoice.id,
    v_invoice.advertiser_id,
    v_next_total,
    v_delta,
    coalesce(v_adjustment.ledger_id, null::uuid);
end;
$$;

create or replace function public.cbnads_web_delete_credit_invoice_atomic(
  p_invoice_id uuid,
  p_created_by uuid default null,
  p_change_reason text default null,
  p_source_request_key text default null
)
returns table (
  invoice_id uuid,
  advertiser_id uuid,
  reversed_amount numeric,
  ledger_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice cbnads_web_invoices%rowtype;
  v_reversed_amount numeric(12,2);
  v_adjustment record;
  v_reason text;
  v_source_request_key text := nullif(btrim(coalesce(p_source_request_key, '')), '');
begin
  if p_invoice_id is null then
    raise exception 'invoice_id is required';
  end if;

  select *
  into v_invoice
  from public.cbnads_web_invoices as inv
  where inv.id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  if v_invoice.deleted_at is not null then
    raise exception 'invoice_already_deleted';
  end if;

  if upper(coalesce(v_invoice.invoice_number, '')) not like 'CRE-%' then
    raise exception 'invoice_not_credit_record';
  end if;

  if v_invoice.advertiser_id is null then
    raise exception 'advertiser_id is required';
  end if;

  v_reversed_amount := round(
    greatest(coalesce(v_invoice.total, v_invoice.amount, v_invoice.amount_paid, 0), 0)::numeric,
    2
  );

  if v_reversed_amount > 0 then
    v_reason := coalesce(
      nullif(btrim(coalesce(p_change_reason, '')), ''),
      format(
        'Credit record %s deleted.',
        coalesce(nullif(v_invoice.invoice_number, ''), v_invoice.id::text)
      )
    );

    select *
    into v_adjustment
    from public.cbnads_web_adjust_prepaid_credits_atomic(
      v_invoice.advertiser_id,
      -v_reversed_amount,
      'credit_invoice_delete_reversal',
      v_reason,
      p_created_by,
      v_invoice.id,
      null,
      case
        when v_source_request_key is null then null
        else left(v_source_request_key || ':credit-delete', 255)
      end
    );
  else
    v_adjustment := null;
  end if;

  update public.cbnads_web_invoices as inv
  set deleted_at = now(),
      updated_at = now()
  where inv.id = v_invoice.id;

  update public.cbnads_web_ads as ads
  set invoice_id = null,
      paid_via_invoice_id = null,
      payment = 'Unpaid',
      updated_at = now()
  where ads.id in (
    select linked_ids.linked_ad_id
    from (
      select distinct items.ad_id as linked_ad_id
      from public.cbnads_web_invoice_items as items
      where items.invoice_id = v_invoice.id
        and items.ad_id is not null
      union
      select nullif(value, '')::uuid as linked_ad_id
      from jsonb_array_elements_text(coalesce(v_invoice.ad_ids, '[]'::jsonb)) as value
      where nullif(value, '') is not null
    ) linked_ids
  );

  return query
  select
    v_invoice.id,
    v_invoice.advertiser_id,
    v_reversed_amount,
    coalesce(v_adjustment.ledger_id, null::uuid);
end;
$$;

revoke execute on function public.cbnads_web_update_credit_invoice_atomic(
  uuid,
  numeric,
  text,
  date,
  text,
  text,
  text,
  uuid,
  text,
  text
)
from public, anon, authenticated;

revoke execute on function public.cbnads_web_delete_credit_invoice_atomic(
  uuid,
  uuid,
  text,
  text
)
from public, anon, authenticated;

grant execute on function public.cbnads_web_update_credit_invoice_atomic(
  uuid,
  numeric,
  text,
  date,
  text,
  text,
  text,
  uuid,
  text,
  text
)
to service_role;

grant execute on function public.cbnads_web_delete_credit_invoice_atomic(
  uuid,
  uuid,
  text,
  text
)
to service_role;
