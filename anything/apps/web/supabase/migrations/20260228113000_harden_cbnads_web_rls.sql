-- Harden access to the namespaced CBN Ads web tables.
-- This adds row-level security for cbnads_web_* and maps advertiser reads
-- through public.profiles.advertiser_id.

alter table if exists public.cbnads_web_pending_ads
  add column if not exists advertiser_id uuid references public.cbnads_web_advertisers(id) on delete set null;

create index if not exists idx_cbnads_web_advertisers_lower_email
  on public.cbnads_web_advertisers (lower(email));

create index if not exists idx_cbnads_web_advertisers_lower_name
  on public.cbnads_web_advertisers (lower(advertiser_name));

create index if not exists idx_cbnads_web_pending_ads_advertiser_id
  on public.cbnads_web_pending_ads (advertiser_id);

create index if not exists idx_cbnads_web_pending_ads_lower_email
  on public.cbnads_web_pending_ads (lower(email));

create index if not exists idx_cbnads_web_pending_ads_lower_name
  on public.cbnads_web_pending_ads (lower(advertiser_name));

create index if not exists idx_cbnads_web_invoice_items_ad_id
  on public.cbnads_web_invoice_items (ad_id);

create index if not exists idx_cbnads_web_invoices_lower_contact_email
  on public.cbnads_web_invoices (lower(contact_email));

update public.cbnads_web_ads as ads
set advertiser = advertisers.advertiser_name
from public.cbnads_web_advertisers as advertisers
where ads.advertiser_id = advertisers.id
  and (ads.advertiser is null or btrim(ads.advertiser) = '');

update public.cbnads_web_invoices as invoices
set advertiser_name = coalesce(nullif(invoices.advertiser_name, ''), advertisers.advertiser_name),
    contact_email = coalesce(invoices.contact_email, advertisers.email)
from public.cbnads_web_advertisers as advertisers
where invoices.advertiser_id = advertisers.id
  and (
    invoices.advertiser_name is null
    or btrim(invoices.advertiser_name) = ''
    or (invoices.contact_email is null and advertisers.email is not null)
  );

update public.cbnads_web_pending_ads as pending
set advertiser_id = (
  select advertisers.id
  from public.cbnads_web_advertisers as advertisers
  where (
      nullif(lower(btrim(coalesce(pending.email, ''))), '') is not null
      and lower(btrim(coalesce(advertisers.email, ''))) = lower(btrim(coalesce(pending.email, '')))
    )
    or (
      nullif(lower(btrim(coalesce(pending.advertiser_name, ''))), '') is not null
      and lower(btrim(coalesce(advertisers.advertiser_name, ''))) =
        lower(btrim(coalesce(pending.advertiser_name, '')))
    )
  order by advertisers.created_at asc
  limit 1
)
where pending.advertiser_id is null;

create or replace function public.cbnads_web_current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce((
    select role
    from public.profiles
    where id = auth.uid()
  ), ''));
$$;

create or replace function public.cbnads_web_is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cbnads_web_current_profile_role() in ('owner', 'admin', 'manager', 'staff');
$$;

create or replace function public.cbnads_web_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cbnads_web_current_profile_role() in ('owner', 'admin', 'manager');
$$;

create or replace function public.cbnads_web_current_advertiser_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select advertiser_id
  from public.profiles
  where id = auth.uid();
$$;

create or replace function public.cbnads_web_current_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce((
    select email
    from public.profiles
    where id = auth.uid()
  ), ''));
$$;

create or replace function public.cbnads_web_current_advertiser_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce((
    select advertiser_name
    from public.cbnads_web_advertisers
    where id = public.cbnads_web_current_advertiser_id()
  ), ''));
$$;

create or replace function public.cbnads_web_is_my_advertiser_resource(
  resource_advertiser_id uuid default null,
  resource_advertiser_name text default null,
  resource_email text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.cbnads_web_current_profile_role() = 'advertiser'
    and (
      (
        resource_advertiser_id is not null
        and resource_advertiser_id = public.cbnads_web_current_advertiser_id()
      )
      or (
        nullif(lower(btrim(coalesce(resource_email, ''))), '') is not null
        and lower(btrim(coalesce(resource_email, ''))) = public.cbnads_web_current_email()
      )
      or (
        nullif(lower(btrim(coalesce(resource_advertiser_name, ''))), '') is not null
        and lower(btrim(coalesce(resource_advertiser_name, ''))) =
          public.cbnads_web_current_advertiser_name()
      )
    );
$$;

grant select on table
  public.cbnads_web_advertisers,
  public.cbnads_web_products,
  public.cbnads_web_ads,
  public.cbnads_web_pending_ads,
  public.cbnads_web_invoices,
  public.cbnads_web_invoice_items
to authenticated;

alter table if exists public.cbnads_web_advertisers enable row level security;
alter table if exists public.cbnads_web_products enable row level security;
alter table if exists public.cbnads_web_ads enable row level security;
alter table if exists public.cbnads_web_pending_ads enable row level security;
alter table if exists public.cbnads_web_invoices enable row level security;
alter table if exists public.cbnads_web_invoice_items enable row level security;
alter table if exists public.cbnads_web_admin_settings enable row level security;
alter table if exists public.cbnads_web_notification_preferences enable row level security;
alter table if exists public.cbnads_web_team_members enable row level security;
alter table if exists public.cbnads_web_admin_notification_preferences enable row level security;
alter table if exists public.cbnads_web_sent_reminders enable row level security;

drop policy if exists cbnads_web_advertisers_select_authenticated on public.cbnads_web_advertisers;
create policy cbnads_web_advertisers_select_authenticated
on public.cbnads_web_advertisers
for select
to authenticated
using (
  public.cbnads_web_is_internal_user()
  or public.cbnads_web_is_my_advertiser_resource(id, advertiser_name, email)
);

drop policy if exists cbnads_web_advertisers_insert_manage on public.cbnads_web_advertisers;
create policy cbnads_web_advertisers_insert_manage
on public.cbnads_web_advertisers
for insert
to authenticated
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_advertisers_update_manage on public.cbnads_web_advertisers;
create policy cbnads_web_advertisers_update_manage
on public.cbnads_web_advertisers
for update
to authenticated
using (public.cbnads_web_can_manage())
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_advertisers_delete_manage on public.cbnads_web_advertisers;
create policy cbnads_web_advertisers_delete_manage
on public.cbnads_web_advertisers
for delete
to authenticated
using (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_products_select_internal on public.cbnads_web_products;
create policy cbnads_web_products_select_internal
on public.cbnads_web_products
for select
to authenticated
using (public.cbnads_web_is_internal_user());

drop policy if exists cbnads_web_products_insert_manage on public.cbnads_web_products;
create policy cbnads_web_products_insert_manage
on public.cbnads_web_products
for insert
to authenticated
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_products_update_manage on public.cbnads_web_products;
create policy cbnads_web_products_update_manage
on public.cbnads_web_products
for update
to authenticated
using (public.cbnads_web_can_manage())
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_products_delete_manage on public.cbnads_web_products;
create policy cbnads_web_products_delete_manage
on public.cbnads_web_products
for delete
to authenticated
using (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_ads_select_authenticated on public.cbnads_web_ads;
create policy cbnads_web_ads_select_authenticated
on public.cbnads_web_ads
for select
to authenticated
using (
  public.cbnads_web_is_internal_user()
  or public.cbnads_web_is_my_advertiser_resource(advertiser_id, advertiser, null)
);

drop policy if exists cbnads_web_ads_insert_manage on public.cbnads_web_ads;
create policy cbnads_web_ads_insert_manage
on public.cbnads_web_ads
for insert
to authenticated
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_ads_update_manage on public.cbnads_web_ads;
create policy cbnads_web_ads_update_manage
on public.cbnads_web_ads
for update
to authenticated
using (public.cbnads_web_can_manage())
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_ads_delete_manage on public.cbnads_web_ads;
create policy cbnads_web_ads_delete_manage
on public.cbnads_web_ads
for delete
to authenticated
using (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_pending_ads_select_authenticated on public.cbnads_web_pending_ads;
create policy cbnads_web_pending_ads_select_authenticated
on public.cbnads_web_pending_ads
for select
to authenticated
using (
  public.cbnads_web_is_internal_user()
  or public.cbnads_web_is_my_advertiser_resource(advertiser_id, advertiser_name, email)
);

drop policy if exists cbnads_web_pending_ads_insert_manage on public.cbnads_web_pending_ads;
create policy cbnads_web_pending_ads_insert_manage
on public.cbnads_web_pending_ads
for insert
to authenticated
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_pending_ads_update_manage on public.cbnads_web_pending_ads;
create policy cbnads_web_pending_ads_update_manage
on public.cbnads_web_pending_ads
for update
to authenticated
using (public.cbnads_web_can_manage())
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_pending_ads_delete_manage on public.cbnads_web_pending_ads;
create policy cbnads_web_pending_ads_delete_manage
on public.cbnads_web_pending_ads
for delete
to authenticated
using (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_invoices_select_authenticated on public.cbnads_web_invoices;
create policy cbnads_web_invoices_select_authenticated
on public.cbnads_web_invoices
for select
to authenticated
using (
  public.cbnads_web_is_internal_user()
  or public.cbnads_web_is_my_advertiser_resource(advertiser_id, advertiser_name, contact_email)
);

drop policy if exists cbnads_web_invoices_insert_manage on public.cbnads_web_invoices;
create policy cbnads_web_invoices_insert_manage
on public.cbnads_web_invoices
for insert
to authenticated
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_invoices_update_manage on public.cbnads_web_invoices;
create policy cbnads_web_invoices_update_manage
on public.cbnads_web_invoices
for update
to authenticated
using (public.cbnads_web_can_manage())
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_invoices_delete_manage on public.cbnads_web_invoices;
create policy cbnads_web_invoices_delete_manage
on public.cbnads_web_invoices
for delete
to authenticated
using (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_invoice_items_select_authenticated on public.cbnads_web_invoice_items;
create policy cbnads_web_invoice_items_select_authenticated
on public.cbnads_web_invoice_items
for select
to authenticated
using (
  public.cbnads_web_is_internal_user()
  or exists (
    select 1
    from public.cbnads_web_invoices as invoices
    where invoices.id = cbnads_web_invoice_items.invoice_id
      and public.cbnads_web_is_my_advertiser_resource(
        invoices.advertiser_id,
        invoices.advertiser_name,
        invoices.contact_email
      )
  )
  or exists (
    select 1
    from public.cbnads_web_ads as ads
    where ads.id = cbnads_web_invoice_items.ad_id
      and public.cbnads_web_is_my_advertiser_resource(
        ads.advertiser_id,
        ads.advertiser,
        null
      )
  )
);

drop policy if exists cbnads_web_invoice_items_insert_manage on public.cbnads_web_invoice_items;
create policy cbnads_web_invoice_items_insert_manage
on public.cbnads_web_invoice_items
for insert
to authenticated
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_invoice_items_update_manage on public.cbnads_web_invoice_items;
create policy cbnads_web_invoice_items_update_manage
on public.cbnads_web_invoice_items
for update
to authenticated
using (public.cbnads_web_can_manage())
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_invoice_items_delete_manage on public.cbnads_web_invoice_items;
create policy cbnads_web_invoice_items_delete_manage
on public.cbnads_web_invoice_items
for delete
to authenticated
using (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_admin_settings_select_manage on public.cbnads_web_admin_settings;
create policy cbnads_web_admin_settings_select_manage
on public.cbnads_web_admin_settings
for select
to authenticated
using (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_admin_settings_write_manage on public.cbnads_web_admin_settings;
create policy cbnads_web_admin_settings_write_manage
on public.cbnads_web_admin_settings
for all
to authenticated
using (public.cbnads_web_can_manage())
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_notification_preferences_select_manage on public.cbnads_web_notification_preferences;
create policy cbnads_web_notification_preferences_select_manage
on public.cbnads_web_notification_preferences
for select
to authenticated
using (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_notification_preferences_write_manage on public.cbnads_web_notification_preferences;
create policy cbnads_web_notification_preferences_write_manage
on public.cbnads_web_notification_preferences
for all
to authenticated
using (public.cbnads_web_can_manage())
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_team_members_select_internal on public.cbnads_web_team_members;
create policy cbnads_web_team_members_select_internal
on public.cbnads_web_team_members
for select
to authenticated
using (public.cbnads_web_is_internal_user());

drop policy if exists cbnads_web_team_members_write_manage on public.cbnads_web_team_members;
create policy cbnads_web_team_members_write_manage
on public.cbnads_web_team_members
for all
to authenticated
using (public.cbnads_web_can_manage())
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_admin_notification_preferences_select_manage on public.cbnads_web_admin_notification_preferences;
create policy cbnads_web_admin_notification_preferences_select_manage
on public.cbnads_web_admin_notification_preferences
for select
to authenticated
using (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_admin_notification_preferences_write_manage on public.cbnads_web_admin_notification_preferences;
create policy cbnads_web_admin_notification_preferences_write_manage
on public.cbnads_web_admin_notification_preferences
for all
to authenticated
using (public.cbnads_web_can_manage())
with check (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_sent_reminders_select_manage on public.cbnads_web_sent_reminders;
create policy cbnads_web_sent_reminders_select_manage
on public.cbnads_web_sent_reminders
for select
to authenticated
using (public.cbnads_web_can_manage());

drop policy if exists cbnads_web_sent_reminders_write_manage on public.cbnads_web_sent_reminders;
create policy cbnads_web_sent_reminders_write_manage
on public.cbnads_web_sent_reminders
for all
to authenticated
using (public.cbnads_web_can_manage())
with check (public.cbnads_web_can_manage());
