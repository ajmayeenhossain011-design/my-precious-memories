-- MY PRECIOUS MEMORIES: secure management foundation
-- Run in Supabase SQL Editor only after reviewing the setup guide.
-- Existing private media SELECT access is intentionally retained.
create table if not exists public.memory_admin_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.memory_admin_credentials enable row level security;
revoke all on public.memory_admin_credentials from anon, authenticated;

create table if not exists public.text_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.text_memories enable row level security;
revoke insert, update, delete on public.text_memories from anon, authenticated;
grant select on public.text_memories to authenticated;
drop policy if exists "Owner can read text memories" on public.text_memories;
create policy "Owner can read text memories"
  on public.text_memories for select to authenticated
  using (auth.uid() = user_id);

-- Mutations must go through the memory-admin Edge Function, which verifies
-- the separate Master Password and uses the server-only service-role key.
drop policy if exists "Private owner upload rieftn_0" on storage.objects;
drop policy if exists "Private owner update rieftn_0" on storage.objects;
drop policy if exists "Private owner delete rieftn_0" on storage.objects;
