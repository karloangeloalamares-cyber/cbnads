-- 021_sync_profile_updates.sql
-- Goal: Ensure changes to public.profiles (e.g. full_name, role) are synced to auth.users metadata
-- This ensures the Supabase Auth Dashboard reflects the correct name/role.

-- 1. Create the sync function
create or replace function public.handle_profile_update()
returns trigger
language plpgsql
security definer
as $$
begin
  update auth.users
  set raw_user_meta_data = 
    coalesce(raw_user_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'full_name', new.full_name,
      'role', new.role
    )
  where id = new.id;
  return new;
end;
$$;
-- 2. Create the trigger
drop trigger if exists on_profile_user_update on public.profiles;
create trigger on_profile_user_update
  after update on public.profiles
  for each row
  execute procedure public.handle_profile_update();
