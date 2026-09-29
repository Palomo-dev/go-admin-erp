-- Acceso v3 · fase 5: bloqueo por intentos fallidos de inicio de sesión (docs/design/AUTH-ACCESO-V2.md §12.4).
--
-- El login pasa por POST /api/auth/acceso. Cada fallo de credenciales suma en dos claves:
--   · cuenta + IP  → 5 fallos en 15 min bloquean 15 min;
--   · solo IP      → 20 fallos en 15 min bloquean 15 min.
-- Las claves son SHA-256 calculados en el servidor de la app: nunca se guarda el correo ni la IP en
-- claro. Un acceso correcto borra la clave cuenta + IP.
--
-- Tabla y funciones solo para service_role (la ruta usa el cliente de servicio). RLS activo sin
-- políticas: ni anon ni authenticated la leen.

create table if not exists public.auth_intentos_acceso (
  clave text primary key,
  fallos integer not null default 0,
  ventana_desde timestamptz not null default now(),
  bloqueado_hasta timestamptz,
  actualizado_en timestamptz not null default now()
);

comment on table public.auth_intentos_acceso is
  'Contador de fallos de inicio de sesión por clave (SHA-256 de cuenta+IP o de IP). Sin datos personales en claro. Solo service_role.';

alter table public.auth_intentos_acceso enable row level security;
revoke all on table public.auth_intentos_acceso from public, anon, authenticated;
grant select, insert, update, delete on table public.auth_intentos_acceso to service_role;

create index if not exists idx_auth_intentos_acceso_actualizado on public.auth_intentos_acceso (actualizado_en);

-- ¿Alguna de las claves está bloqueada ahora? Devuelve el bloqueo que más dura, o null.
create or replace function public.fn_acceso_bloqueo_vigente(p_claves text[])
returns timestamptz
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select max(bloqueado_hasta)
    from public.auth_intentos_acceso
   where clave = any (p_claves)
     and bloqueado_hasta > now();
$$;

-- Registra un fallo en cada clave con su límite. p_entradas: [{"clave": "...", "limite": 5}, ...].
-- Ventana y bloqueo de 15 minutos. Devuelve el bloqueo vigente tras el fallo, o null.
create or replace function public.fn_acceso_registrar_fallo(p_entradas jsonb)
returns timestamptz
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ventana constant interval := interval '15 minutes';
  v_entrada jsonb;
  v_clave text;
  v_limite integer;
  v_hasta timestamptz;
begin
  if jsonb_typeof(p_entradas) is distinct from 'array' then
    raise exception 'fn_acceso_registrar_fallo: se espera un arreglo' using errcode = '22023';
  end if;

  for v_entrada in select * from jsonb_array_elements(p_entradas) loop
    v_clave := nullif(v_entrada ->> 'clave', '');
    v_limite := greatest(coalesce((v_entrada ->> 'limite')::integer, 5), 1);
    if v_clave is null or length(v_clave) > 128 then
      raise exception 'fn_acceso_registrar_fallo: clave no válida' using errcode = '22023';
    end if;

    insert into public.auth_intentos_acceso as a (clave, fallos, ventana_desde, actualizado_en)
    values (v_clave, 1, now(), now())
    on conflict (clave) do update set
      fallos = case when a.ventana_desde < now() - v_ventana then 1 else a.fallos + 1 end,
      ventana_desde = case when a.ventana_desde < now() - v_ventana then now() else a.ventana_desde end,
      actualizado_en = now();

    update public.auth_intentos_acceso
       set bloqueado_hasta = now() + v_ventana
     where clave = v_clave
       and fallos >= v_limite
       and (bloqueado_hasta is null or bloqueado_hasta <= now());
  end loop;

  select max(bloqueado_hasta) into v_hasta
    from public.auth_intentos_acceso
   where clave in (select e ->> 'clave' from jsonb_array_elements(p_entradas) e)
     and bloqueado_hasta > now();

  -- Limpieza oportunista: filas sin actividad en un día.
  delete from public.auth_intentos_acceso where actualizado_en < now() - interval '1 day';

  return v_hasta;
end;
$$;

-- Acceso correcto: borra el contador de la clave (cuenta + IP).
create or replace function public.fn_acceso_limpiar(p_clave text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  delete from public.auth_intentos_acceso where clave = p_clave;
$$;

revoke all on function public.fn_acceso_bloqueo_vigente(text[]) from public, anon, authenticated;
revoke all on function public.fn_acceso_registrar_fallo(jsonb) from public, anon, authenticated;
revoke all on function public.fn_acceso_limpiar(text) from public, anon, authenticated;
grant execute on function public.fn_acceso_bloqueo_vigente(text[]) to service_role;
grant execute on function public.fn_acceso_registrar_fallo(jsonb) to service_role;
grant execute on function public.fn_acceso_limpiar(text) to service_role;
