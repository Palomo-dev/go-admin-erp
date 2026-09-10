-- Contador de uso del widget por sesion y ventana horaria.
-- En Postgres y no en memoria del proceso: las Edge Functions escalan a varias
-- instancias y un contador local no serviria de nada.
create table if not exists public.widget_rate_limit (
  channel_id  uuid        not null references public.channels(id) on delete cascade,
  session_id  text        not null,
  ventana     timestamptz not null,
  contador    integer     not null default 0,
  primary key (channel_id, session_id, ventana)
);

comment on table public.widget_rate_limit is
  'Uso del widget por sesion y hora. Sirve para cortar bucles automatizados sin afectar el uso normal (mediana real: 3 mensajes por conversacion, p99 = 32).';

alter table public.widget_rate_limit enable row level security;
revoke all on public.widget_rate_limit from anon, authenticated;
grant select, insert, update on public.widget_rate_limit to service_role;

-- Devuelve true si la peticion cabe dentro del limite. El INSERT ... ON CONFLICT
-- es atomico, asi que dos instancias concurrentes no se pisan el contador.
create or replace function public.widget_registrar_uso(
  p_channel uuid,
  p_session text,
  p_limite  integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ventana timestamptz := date_trunc('hour', now());
  v_contador integer;
begin
  if p_channel is null or p_session is null or p_session = '' then
    -- Sin sesion identificable no se puede contar: se deja pasar y que decidan
    -- las otras defensas. Bloquear aqui romperia clientes legitimos.
    return true;
  end if;

  insert into public.widget_rate_limit (channel_id, session_id, ventana, contador)
  values (p_channel, p_session, v_ventana, 1)
  on conflict (channel_id, session_id, ventana)
  do update set contador = public.widget_rate_limit.contador + 1
  returning contador into v_contador;

  return v_contador <= greatest(coalesce(p_limite, 30), 1);
end;
$fn$;

revoke all on function public.widget_registrar_uso(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.widget_registrar_uso(uuid, text, integer) to service_role;

-- Limpieza: las ventanas viejas no sirven para nada.
create or replace function public.widget_limpiar_rate_limit()
returns void
language sql
security definer
set search_path = public
as $fn$
  delete from public.widget_rate_limit where ventana < now() - interval '2 days';
$fn$;

revoke all on function public.widget_limpiar_rate_limit() from public, anon, authenticated;
grant execute on function public.widget_limpiar_rate_limit() to service_role;

-- Tope diario de respuestas de IA por conversacion. Protege los creditos aunque
-- el atacante cambie de sesion. p99 real = 32 mensajes por conversacion, asi que
-- 60 es holgado para cualquier cliente legitimo.
alter table public.ai_settings
  add column if not exists max_respuestas_ia_por_conversacion_dia integer not null default 60;

comment on column public.ai_settings.max_respuestas_ia_por_conversacion_dia is
  'Tope de respuestas automaticas por conversacion y dia. 0 = sin tope. Default 60 (p99 real de mensajes por conversacion: 32).';
