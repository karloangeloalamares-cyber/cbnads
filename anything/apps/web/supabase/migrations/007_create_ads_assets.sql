-- 007_create_ads_assets.sql
-- We combine Ads (Posting Instance) and Assets/Deliverables if desired, 
-- but following the App schema, 'Ads' is the main deliverable entity.

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) not null,
  created_by uuid references public.profiles(id),
  order_id uuid references public.orders(id) not null,
  advertiser_id uuid references public.advertisers(id) not null,
  product_id uuid references public.products(id) not null,
  placement text check (placement in ('WhatsApp', 'Website', 'Both')) not null,
  status text check (status in ('Draft', 'Scheduled', 'Due', 'Posted', 'Completed', 'Missed', 'Cancelled')) default 'Draft',
  scheduled_date date not null,
  scheduled_time time,
  media_urls text[] default array[]::text[],
  text_caption text,
  cta_link text,
  media_sequence text check (media_sequence in ('media_first', 'text_first', 'combined')) default 'media_first',
  posted_at timestamp with time zone,
  proof jsonb, 
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
-- Enable RLS
alter table public.ads enable row level security;
