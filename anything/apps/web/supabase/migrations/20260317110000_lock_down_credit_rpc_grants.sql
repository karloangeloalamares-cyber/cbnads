-- Phase 0 containment: lock credit mutation RPCs to service_role only.

revoke execute on function public.cbnads_web_adjust_prepaid_credits(
  uuid,
  numeric,
  text,
  text,
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated;

revoke execute on function public.cbnads_web_try_pay_invoice_with_credits(
  uuid,
  uuid,
  text
)
from public, anon, authenticated;

grant execute on function public.cbnads_web_adjust_prepaid_credits(
  uuid,
  numeric,
  text,
  text,
  uuid,
  uuid,
  uuid
)
to service_role;

grant execute on function public.cbnads_web_try_pay_invoice_with_credits(
  uuid,
  uuid,
  text
)
to service_role;
