-- Tabla para suscripciones Web Push (PWA)
-- A diferencia de device_push_tokens (FCM/APNs para app nativa),
-- esta tabla guarda suscripciones Web Push de la PWA instalada desde navegador.

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  platform text not null default 'web' check (platform = 'web'),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: usuarios solo pueden gestionar sus propias suscripciones
alter table public.web_push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'web_push_subscriptions'
    and policyname = 'Usuarios gestionan sus suscripciones web push'
  ) then
    create policy "Usuarios gestionan sus suscripciones web push"
      on public.web_push_subscriptions
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Índice para buscar por usuario
create index if not exists idx_web_push_subscriptions_user_id
  on public.web_push_subscriptions(user_id);

-- Índice para buscar por endpoint (upsert)
create index if not exists idx_web_push_subscriptions_endpoint
  on public.web_push_subscriptions(endpoint);

-- Trigger para updated_at
create or replace function update_web_push_subscriptions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_web_push_subscriptions_updated_at on public.web_push_subscriptions;
create trigger trg_web_push_subscriptions_updated_at
  before update on public.web_push_subscriptions
  for each row
  execute function update_web_push_subscriptions_updated_at();
