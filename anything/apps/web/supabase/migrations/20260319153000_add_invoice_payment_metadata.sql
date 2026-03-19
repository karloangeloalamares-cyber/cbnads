-- Add payment-source metadata for invoice settlement guardrails.

alter table if exists public.cbnads_web_invoices
  add column if not exists payment_provider text,
  add column if not exists payment_reference text,
  add column if not exists payment_note text;

create index if not exists idx_cbnads_web_invoices_payment_provider
  on public.cbnads_web_invoices(payment_provider);

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
    paid_date = case
      when p_patch ? 'paid_date' then nullif(btrim(coalesce(p_patch->>'paid_date', '')), '')::date
      else inv.paid_date
    end,
    payment_provider = case
      when p_patch ? 'payment_provider' then nullif(btrim(coalesce(p_patch->>'payment_provider', '')), '')
      else inv.payment_provider
    end,
    payment_reference = case
      when p_patch ? 'payment_reference' then nullif(btrim(coalesce(p_patch->>'payment_reference', '')), '')
      else inv.payment_reference
    end,
    payment_note = case
      when p_patch ? 'payment_note' then nullif(btrim(coalesce(p_patch->>'payment_note', '')), '')
      else inv.payment_note
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

create or replace function public.cbnads_web_create_invoice_atomic(
  p_invoice jsonb,
  p_items jsonb default '[]'::jsonb,
  p_ad_ids jsonb default '[]'::jsonb,
  p_update_ads_payment text default null,
  p_apply_credits boolean default false,
  p_actor_user_id uuid default null,
  p_credit_note text default null
)
returns table (
  invoice_id uuid,
  created boolean,
  applied_credits boolean,
  credit_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  v_invoice jsonb := coalesce(p_invoice, '{}'::jsonb);
  v_item jsonb;
  v_item_ad_id uuid;
  v_item_product_id uuid;
  v_item_description text;
  v_item_quantity integer;
  v_item_unit_price numeric(12,2);
  v_item_amount numeric(12,2);
  v_ad_text text;
  v_ad_id uuid;
  v_linked_ad_ids uuid[] := '{}'::uuid[];
  v_invoice_id uuid;
  v_created boolean := false;
  v_applied boolean := false;
  v_reason text := null;
  v_attempt integer := 0;
  v_max_attempts integer := 64;
  v_prefix text;
  v_issue_date date;
  v_date_digits text;
  v_invoice_number text;
  v_source_request_key text;
  v_status text;
  v_update_payment text;
  v_discount numeric(12,2);
  v_tax numeric(12,2);
  v_total numeric(12,2);
  v_amount numeric(12,2);
  v_amount_paid numeric(12,2);
  v_credit_result record;
begin
  if coalesce(jsonb_typeof(v_invoice), 'object') <> 'object' then
    raise exception 'invoice payload must be an object';
  end if;

  if coalesce(jsonb_typeof(p_items), 'array') <> 'array' then
    raise exception 'items payload must be an array';
  end if;

  if coalesce(jsonb_typeof(p_ad_ids), 'array') <> 'array' then
    raise exception 'ad_ids payload must be an array';
  end if;

  v_source_request_key := nullif(lower(btrim(coalesce(v_invoice->>'source_request_key', ''))), '');
  v_status := coalesce(nullif(btrim(coalesce(v_invoice->>'status', '')), ''), 'Pending');
  v_update_payment := nullif(btrim(coalesce(p_update_ads_payment, '')), '');
  if v_update_payment is null then
    v_update_payment := case when lower(v_status) = 'paid' then 'Paid' else 'Pending' end;
  end if;

  v_discount := round(
    coalesce(nullif(btrim(coalesce(v_invoice->>'discount', '')), '')::numeric, 0),
    2
  );
  v_tax := round(
    coalesce(nullif(btrim(coalesce(v_invoice->>'tax', '')), '')::numeric, 0),
    2
  );
  v_total := round(
    coalesce(
      nullif(btrim(coalesce(v_invoice->>'total', '')), '')::numeric,
      nullif(btrim(coalesce(v_invoice->>'amount', '')), '')::numeric,
      0
    ),
    2
  );
  v_amount := round(
    coalesce(
      nullif(btrim(coalesce(v_invoice->>'amount', '')), '')::numeric,
      v_total
    ),
    2
  );
  v_amount_paid := round(
    coalesce(
      nullif(btrim(coalesce(v_invoice->>'amount_paid', '')), '')::numeric,
      case when lower(v_status) = 'paid' then v_total else 0 end
    ),
    2
  );
  v_issue_date := coalesce(
    nullif(btrim(coalesce(v_invoice->>'issue_date', '')), '')::date,
    current_date
  );

  v_prefix := regexp_replace(
    upper(coalesce(nullif(btrim(coalesce(v_invoice->>'invoice_prefix', '')), ''), 'INV')),
    '[^A-Z0-9]',
    '',
    'g'
  );
  if v_prefix = '' then
    v_prefix := 'INV';
  end if;
  v_date_digits := to_char(v_issue_date, 'YYYYMMDD');

  if v_source_request_key is not null then
    select inv.id, coalesce(inv.paid_via_credits, false)
    into v_invoice_id, v_applied
    from public.cbnads_web_invoices as inv
    where inv.source_request_key = v_source_request_key
    order by inv.created_at desc
    limit 1;

    if v_invoice_id is not null then
      return query
      select v_invoice_id, false, v_applied, 'idempotency_reuse';
      return;
    end if;
  end if;

  for v_ad_text in
    select value
    from jsonb_array_elements_text(coalesce(p_ad_ids, '[]'::jsonb)) as value
  loop
    v_ad_text := nullif(btrim(coalesce(v_ad_text, '')), '');
    if v_ad_text is not null and lower(v_ad_text) ~ v_uuid_pattern then
      v_ad_id := v_ad_text::uuid;
      if not (v_ad_id = any(v_linked_ad_ids)) then
        v_linked_ad_ids := array_append(v_linked_ad_ids, v_ad_id);
      end if;
    end if;
  end loop;

  if jsonb_typeof(coalesce(v_invoice->'ad_ids', 'null'::jsonb)) = 'array' then
    for v_ad_text in
      select value
      from jsonb_array_elements_text(v_invoice->'ad_ids') as value
    loop
      v_ad_text := nullif(btrim(coalesce(v_ad_text, '')), '');
      if v_ad_text is not null and lower(v_ad_text) ~ v_uuid_pattern then
        v_ad_id := v_ad_text::uuid;
        if not (v_ad_id = any(v_linked_ad_ids)) then
          v_linked_ad_ids := array_append(v_linked_ad_ids, v_ad_id);
        end if;
      end if;
    end loop;
  end if;

  while v_attempt < v_max_attempts loop
    v_attempt := v_attempt + 1;

    v_invoice_number := nullif(btrim(coalesce(v_invoice->>'invoice_number', '')), '');
    if v_invoice_number is null then
      v_invoice_number := format(
        '%s-%s-%s',
        v_prefix,
        v_date_digits,
        substring(upper(md5(random()::text || clock_timestamp()::text || v_attempt::text)) from 1 for 4)
      );
    end if;

    begin
      insert into public.cbnads_web_invoices (
        invoice_number,
        advertiser_id,
        advertiser_name,
        ad_ids,
        contact_name,
        contact_email,
        bill_to,
        issue_date,
        due_date,
        status,
        discount,
        tax,
        total,
        amount,
        amount_paid,
        paid_date,
        payment_provider,
        payment_reference,
        payment_note,
        notes,
        is_recurring,
        recurring_period,
        last_generated_at,
        paid_via_credits,
        source_request_key,
        created_at,
        updated_at
      )
      values (
        v_invoice_number,
        nullif(btrim(coalesce(v_invoice->>'advertiser_id', '')), '')::uuid,
        nullif(btrim(coalesce(v_invoice->>'advertiser_name', '')), ''),
        to_jsonb(v_linked_ad_ids),
        nullif(btrim(coalesce(v_invoice->>'contact_name', '')), ''),
        nullif(btrim(coalesce(v_invoice->>'contact_email', '')), ''),
        nullif(btrim(coalesce(v_invoice->>'bill_to', '')), ''),
        v_issue_date,
        nullif(btrim(coalesce(v_invoice->>'due_date', '')), '')::date,
        v_status,
        v_discount,
        v_tax,
        v_total,
        v_amount,
        v_amount_paid,
        nullif(btrim(coalesce(v_invoice->>'paid_date', '')), '')::date,
        nullif(btrim(coalesce(v_invoice->>'payment_provider', '')), ''),
        nullif(btrim(coalesce(v_invoice->>'payment_reference', '')), ''),
        nullif(btrim(coalesce(v_invoice->>'payment_note', '')), ''),
        nullif(coalesce(v_invoice->>'notes', ''), ''),
        coalesce(
          nullif(btrim(coalesce(v_invoice->>'is_recurring', '')), '')::boolean,
          false
        ),
        nullif(btrim(coalesce(v_invoice->>'recurring_period', '')), ''),
        nullif(btrim(coalesce(v_invoice->>'last_generated_at', '')), '')::timestamptz,
        coalesce(
          nullif(btrim(coalesce(v_invoice->>'paid_via_credits', '')), '')::boolean,
          false
        ),
        v_source_request_key,
        coalesce(nullif(btrim(coalesce(v_invoice->>'created_at', '')), '')::timestamptz, now()),
        coalesce(nullif(btrim(coalesce(v_invoice->>'updated_at', '')), '')::timestamptz, now())
      )
      returning id into v_invoice_id;

      v_created := true;
      exit;
    exception when unique_violation then
      if v_source_request_key is not null then
        select inv.id, coalesce(inv.paid_via_credits, false)
        into v_invoice_id, v_applied
        from public.cbnads_web_invoices as inv
        where inv.source_request_key = v_source_request_key
        order by inv.created_at desc
        limit 1;

        if v_invoice_id is not null then
          return query
          select v_invoice_id, false, v_applied, 'idempotency_reuse';
          return;
        end if;
      end if;

      if nullif(btrim(coalesce(v_invoice->>'invoice_number', '')), '') is not null then
        raise;
      end if;
    end;
  end loop;

  if not v_created or v_invoice_id is null then
    raise exception 'could_not_create_unique_invoice';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as value
  loop
    v_item_ad_id := null;
    v_item_product_id := null;
    v_item_description := coalesce(v_item->>'description', '');
    v_item_quantity := greatest(
      1,
      coalesce(nullif(btrim(coalesce(v_item->>'quantity', '')), '')::integer, 1)
    );
    v_item_unit_price := round(
      coalesce(nullif(btrim(coalesce(v_item->>'unit_price', '')), '')::numeric, 0),
      2
    );
    v_item_amount := round(
      coalesce(
        nullif(btrim(coalesce(v_item->>'amount', '')), '')::numeric,
        (v_item_quantity * v_item_unit_price)::numeric
      ),
      2
    );

    if nullif(btrim(coalesce(v_item->>'ad_id', '')), '') ~* v_uuid_pattern then
      v_item_ad_id := nullif(btrim(coalesce(v_item->>'ad_id', '')), '')::uuid;
      if v_item_ad_id is not null and not (v_item_ad_id = any(v_linked_ad_ids)) then
        v_linked_ad_ids := array_append(v_linked_ad_ids, v_item_ad_id);
      end if;
    end if;

    if nullif(btrim(coalesce(v_item->>'product_id', '')), '') ~* v_uuid_pattern then
      v_item_product_id := nullif(btrim(coalesce(v_item->>'product_id', '')), '')::uuid;
    end if;

    insert into public.cbnads_web_invoice_items (
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
      v_invoice_id,
      v_item_ad_id,
      v_item_product_id,
      v_item_description,
      v_item_quantity,
      v_item_unit_price,
      v_item_amount,
      coalesce(nullif(btrim(coalesce(v_item->>'created_at', '')), '')::timestamptz, now())
    );
  end loop;

  update public.cbnads_web_invoices as inv
  set ad_ids = to_jsonb(v_linked_ad_ids),
      updated_at = now()
  where inv.id = v_invoice_id;

  if coalesce(array_length(v_linked_ad_ids, 1), 0) > 0 then
    update public.cbnads_web_ads as ads
    set payment = v_update_payment,
        invoice_id = v_invoice_id,
        paid_via_invoice_id = v_invoice_id,
        updated_at = now()
    where ads.id = any(v_linked_ad_ids);
  end if;

  if p_apply_credits then
    select *
    into v_credit_result
    from public.cbnads_web_try_pay_invoice_with_credits(
      v_invoice_id,
      p_actor_user_id,
      p_credit_note
    )
    limit 1;

    v_applied := coalesce(v_credit_result.applied, false);
    v_reason := coalesce(v_credit_result.reason, 'unknown');
  else
    v_applied := false;
    v_reason := 'not_requested';
  end if;

  return query
  select v_invoice_id, true, v_applied, v_reason;
end;
$$;
