-- ETOS Assessment Center — internal auth profile bootstrap
-- New Supabase Auth users receive the minimum facilitator profile.
-- Role elevation remains an explicit admin operation.

create or replace function private.handle_new_internal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, permissions, is_active)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Internal User'
    ),
    'facilitator',
    array['assessment.view']::text[],
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_internal_user() from public;
revoke all on function private.handle_new_internal_user() from anon;
revoke all on function private.handle_new_internal_user() from authenticated;

drop trigger if exists etos_internal_profile_on_auth_user on auth.users;
create trigger etos_internal_profile_on_auth_user
after insert on auth.users
for each row execute function private.handle_new_internal_user();
