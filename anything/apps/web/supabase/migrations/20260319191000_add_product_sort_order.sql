alter table if exists public.cbnads_web_products
  add column if not exists sort_order integer;

with ranked_products as (
  select
    id,
    row_number() over (
      order by
        coalesce(created_at, now()) asc,
        id asc
    ) - 1 as next_sort_order
  from public.cbnads_web_products
)
update public.cbnads_web_products as products
set sort_order = ranked_products.next_sort_order
from ranked_products
where ranked_products.id = products.id
  and products.sort_order is null;

alter table if exists public.cbnads_web_products
  alter column sort_order set default 0;

create index if not exists cbnads_web_products_sort_order_idx
  on public.cbnads_web_products (sort_order, created_at, id);
