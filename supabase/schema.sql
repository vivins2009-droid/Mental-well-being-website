create table if not exists public.user_tracker_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_tracker_states enable row level security;

drop policy if exists "Users can read their tracker state" on public.user_tracker_states;
create policy "Users can read their tracker state"
on public.user_tracker_states
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create their tracker state" on public.user_tracker_states;
create policy "Users can create their tracker state"
on public.user_tracker_states
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their tracker state" on public.user_tracker_states;
create policy "Users can update their tracker state"
on public.user_tracker_states
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_tracker_state_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_tracker_state_updated_at on public.user_tracker_states;
create trigger set_tracker_state_updated_at
before update on public.user_tracker_states
for each row
execute function public.set_tracker_state_updated_at();
