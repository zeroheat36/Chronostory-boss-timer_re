create table if not exists public.chronostory_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.chronostory_state (id, payload)
values (
  'primary',
  jsonb_build_object(
    'bossSettings',
    jsonb_build_object(
      'pianus', jsonb_build_object('respawnMinutes', 180),
      'genomega', jsonb_build_object('respawnMinutes', 240)
    ),
    'serviceSettings',
    jsonb_build_object(
      'activeGraceMinutes', 180,
      'archiveAfterHours', 24,
      'duplicateWindowSeconds', 90
    ),
    'servers', jsonb_build_array(),
    'events', jsonb_build_array()
  )
)
on conflict (id) do nothing;

create or replace function public.touch_chronostory_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists chronostory_state_updated_at on public.chronostory_state;

create trigger chronostory_state_updated_at
before update on public.chronostory_state
for each row
execute function public.touch_chronostory_state_updated_at();
