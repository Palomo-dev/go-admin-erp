-- Aplicada el 2026-10-06 18:09:21 UTC con apply_migration (versión 20261006180921).
-- Carta QR en la mesa · 1/4 — llamar al mesero y pedir la cuenta desde el QR.
-- Figma «16 Sitio web» 2032:75742, láminas 07, 07b, 08 y 20 «Conectado».
--
-- Problema: desde la carta del QR el comensal no tenía cómo llamar al mesero ni pedir la cuenta.
-- `table_sessions.status = 'bill_requested'` existía, pero solo lo ponía el equipo.
--
-- Qué hace (aditivo: una tabla nueva, funciones nuevas; nada se reemplaza):
-- 1. `table_service_requests`: solicitudes de la mesa (kind 'waiter' | 'bill' | 'help', motivo,
--    estado open → ack → done, o 'cancelled' si el comensal la retira). RLS de lectura para
--    miembros con acceso a la sede; sin INSERT/UPDATE directos: solo por las RPC. En la
--    publicación supabase_realtime: POS › Mesas la ve en vivo.
-- 2. `fn_mesa_qr_sesion(org, mesa)` (interna): la mesa del QR de ESA organización y su sesión
--    activa (active | bill_requested). La usan todas las RPC públicas de la Carta QR.
-- 3. RPC públicas (las llama el servidor del sitio con service role; anon y authenticated NO):
--    - `fn_mesa_solicitar(org, mesa, motivo, detalle, comensal)`: «Llamar al mesero».
--    - `fn_mesa_pedir_cuenta(org, mesa, detalle, comensal)`: la sesión pasa a 'bill_requested'
--      y queda una solicitud 'bill'.
--    - `fn_mesa_cancelar_solicitud(org, mesa, solicitud)`: «Cancelar» del aviso (07b).
--    Todas exigen una sesión ACTIVA de la mesa: el QR es el uuid de la mesa (lo imprime
--    src/lib/pos/mesas/qrMesa.ts) y una foto del QR sirve para siempre; sin mesa abierta por el
--    equipo, el QR solo deja ver la carta. La organización llega del host del sitio y la mesa
--    tiene que ser suya; nunca se toma la organización de la mesa sin compararla.
--    Antirrebote en la base, además del límite por IP y por mesa del sitio: un llamado abierto
--    de la misma mesa en los últimos 60 s se devuelve en vez de crear otro.
-- 4. Aviso en la campana: `notifications` (channel 'app', status 'pending') al mesero de la
--    sesión, con payload {type:'table_service_request', kind, title, content, href,
--    request_id, table_session_id, restaurant_table_id, table_name} (el formato que lee la
--    campana del ERP: title, content y href).
-- 5. RPC de staff `pos_mesa_atender_solicitud(org, actor, solicitud, 'ack'|'done')`: mismo
--    patrón que pos_cocina_avisar_mesero (fn_pos_cocina_puede 'operar'). Idempotente. Marcar
--    'done' una solicitud 'bill' NO cambia table_sessions.status: la cierra el cobro.
--
-- Verificado por MCP antes de escribir (2026-10-06): restaurant_tables (id uuid,
-- organization_id, branch_id NOT NULL, name, zone), table_sessions (id, organization_id,
-- restaurant_table_id, branch_id, server_id NOT NULL, status CHECK active|bill_requested|
-- completed, sale_id, opened_at, customers), notifications (channel CHECK incluye 'app', status
-- CHECK incluye 'pending', payload NOT NULL), fn_pos_cocina_puede(org, actor, nivel),
-- app_branch_access(branch), profiles.first_name, branches.name.
--
--
-- ENSAYO (2026-10-06, execute_sql: UN bloque `do` con las 4 migraciones 20261006180921…181513
-- enteras —sin comentarios— y las pruebas, que se deshace con `raise exception`. Org 140, sede
-- 115, Mesa 1 con sesión activa (venta de 83.000, 3 líneas) y Mesa 2 libre; una conexión Wompi
-- sandbox y su método de pago creados DENTRO del bloque). Resultado tal cual:
--   ENSAYO_OK anon_pedido=42501 anon_solicitar=42501 anon_cuenta=42501 anon_resultado=42501
--   anon_valorar=42501 anon_atender=42501 anon_lee_solicitudes=42501 anon_lee_abonos=42501
--   anon_lee_valoraciones=42501 | auth_pedido=42501 auth_solicitar=42501 auth_abono=42501
--   auth_resultado=42501 auth_valorar=42501 auth_insert=42501 | sin_sesion=SIN_SESION
--   pedido_sin_sesion=null/0 otra_org=P0002 MESA_INVALIDA solicitar=true:open:mesero=<nombre>
--   repetido=true:true cancelar=true cuenta=true:bill_requested:bill_requested
--   cuenta_repetida=true avisos=2 aviso_cuenta=[Mesa 1 pide la cuenta | /app/pos/mesas/<mesa>]
--   | pedido: sesion=bill_requested rondas=3 total=83000.00 items_r1=1 estado_r1=servida
--   solicitudes=1 | cuenta: total=83000.00 saldo=83000.00 pasarela=null comensales=2
--   abono_sin_pasarela=SIN_PASARELA | iguales_visto_mal=MONTO_CAMBIO:41500.00
--   iguales=true:41500.00+4150.00:wompi_co:ref_ok=true en_curso=PAGO_EN_CURSO monto_bajo=MONTO
--   otra_org=42501 pago=paid:saldo=41500.00 repetido=YA_PROCESADO
--   pagos=1:invoice_sales/wompi/45650.00/carta_qr/tx-ensayo-1 abonado_lineas=41500.00
--   tip=4150.00 venta=pending/partial/41500.00 tips=1 | cuenta2: pagado=45650.00 saldo=41500.00
--   abonos=1 pend_comensal0=14500.00 resto=41500.00 pago2=paid:saldo=0.00
--   pago_que_excede=paid_unapplied:NO_APLICADO:venta_ya_pagada tras_pagar=CUENTA_PAGADA
--   venta_final=paid/paid/0.00 lineas_sin_pagar=0 avisos_pago=3 valorar_activa=true |
--   cerrada_pedido=null cerrada_solicitar=SIN_SESION valorar=true:El servicio+La comida:4
--   valorar_6=22023 valorar_sin_sesion=SIN_SESION | auth_lee_solicitudes=2 auth_lee_abonos=3
--   auth_lee_valoraciones=2 atender_ack=ack ack_otra_vez=false done=done actor_ajeno=42501
--   otra_org=42501
-- Lectura: anon y authenticated no ejecutan ninguna RPC pública ni leen/escriben las tablas
-- nuevas (authenticated miembro sí lee por RLS y atiende con la RPC de staff). Sin sesión
-- activa todo responde SIN_SESION. Otra organización: MESA_INVALIDA / 42501. El abono reparte
-- con pos_checkout_v1 (paid_amount 41.500 en líneas, propina 4.150 en sales.tip_amount y tips,
-- pago invoice_sales/wompi con origen carta_qr y la transacción); el mismo evento dos veces =
-- YA_PROCESADO; un segundo abono que llega con la cuenta ya pagada queda paid_unapplied con
-- aviso (venta_ya_pagada). Archivo del ensayo: no se versiona (scratchpad).

set lock_timeout = '10s';

-- ── 1. Tabla ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.table_service_requests (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      integer not null references public.organizations(id) on delete cascade,
  branch_id            integer not null references public.branches(id) on delete cascade,
  restaurant_table_id  uuid not null references public.restaurant_tables(id) on delete cascade,
  table_session_id     uuid null references public.table_sessions(id) on delete set null,
  kind                 text not null check (kind in ('waiter', 'bill', 'help')),
  reason               text null check (reason is null or char_length(reason) <= 300),
  diner_label          text null check (diner_label is null or char_length(diner_label) <= 40),
  status               text not null default 'open' check (status in ('open', 'ack', 'done', 'cancelled')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  ack_by               uuid null references auth.users(id) on delete set null,
  ack_at               timestamptz null,
  done_by              uuid null references auth.users(id) on delete set null,
  done_at              timestamptz null
);

comment on table public.table_service_requests is
  'Solicitudes desde la Carta QR de la mesa: llamar al mesero (waiter/help) o pedir la cuenta (bill). Se escriben solo por fn_mesa_solicitar / fn_mesa_pedir_cuenta (sitio, service role) y pos_mesa_atender_solicitud (POS).';
comment on column public.table_service_requests.kind is 'waiter: llamar al mesero · bill: pedir la cuenta · help: otra ayuda.';
comment on column public.table_service_requests.reason is 'Motivo elegido en la Carta QR y el texto libre del comensal.';
comment on column public.table_service_requests.diner_label is 'Nombre que el comensal se puso en la Carta QR (opcional).';
comment on column public.table_service_requests.status is 'open → ack (va en camino) → done; cancelled si el comensal la retira.';

create index if not exists idx_table_service_requests_org_open
  on public.table_service_requests (organization_id, branch_id, created_at desc)
  where status in ('open', 'ack');
create index if not exists idx_table_service_requests_mesa
  on public.table_service_requests (restaurant_table_id, created_at desc);
create index if not exists idx_table_service_requests_sesion
  on public.table_service_requests (table_session_id) where table_session_id is not null;

alter table public.table_service_requests enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'table_service_requests'
                   and policyname = 'table_service_requests_select_miembros') then
    create policy table_service_requests_select_miembros on public.table_service_requests
      for select to authenticated
      using (
        organization_id in (
          select om.organization_id from public.organization_members om
           where om.user_id = (select auth.uid()) and om.is_active = true)
        and public.app_branch_access(branch_id)
      );
  end if;
end $$;

revoke all on public.table_service_requests from anon, public;
revoke insert, update, delete, truncate on public.table_service_requests from authenticated;
grant select on public.table_service_requests to authenticated;
grant all on public.table_service_requests to service_role;

-- Realtime: POS › Mesas se suscribe filtrando por organization_id.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'table_service_requests') then
    alter publication supabase_realtime add table public.table_service_requests;
  end if;
end $$;

-- ── 2. Mesa del QR y su sesión activa (interna) ─────────────────────────────────────────────
create or replace function public.fn_mesa_qr_sesion(
  p_organization_id integer,
  p_table_id uuid,
  out mesa_id uuid,
  out mesa_nombre text,
  out zona text,
  out branch_id integer,
  out sede_nombre text,
  out session_id uuid,
  out session_status text,
  out sale_id uuid,
  out server_id uuid,
  out opened_at timestamptz,
  out customers integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $f$
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'MESA_INVALIDA' using errcode = 'P0002';
  end if;
  select rt.id, rt.name, rt.zone, rt.branch_id, b.name
    into mesa_id, mesa_nombre, zona, branch_id, sede_nombre
    from public.restaurant_tables rt
    left join public.branches b on b.id = rt.branch_id
   where rt.id = p_table_id and rt.organization_id = p_organization_id;
  if mesa_id is null then
    raise exception 'MESA_INVALIDA' using errcode = 'P0002';
  end if;
  select ts.id, ts.status, ts.sale_id, ts.server_id, ts.opened_at, ts.customers
    into session_id, session_status, sale_id, server_id, opened_at, customers
    from public.table_sessions ts
   where ts.restaurant_table_id = mesa_id
     and ts.organization_id = p_organization_id
     and ts.status in ('active', 'bill_requested')
   order by ts.opened_at desc nulls last
   limit 1;
end;
$f$;

comment on function public.fn_mesa_qr_sesion(integer, uuid) is
  'Carta QR (interna): la mesa del QR de esa organización y su sesión activa (active|bill_requested). MESA_INVALIDA si la mesa no es de la organización.';

revoke all on function public.fn_mesa_qr_sesion(integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_mesa_qr_sesion(integer, uuid) to service_role;

-- Aviso a la campana del mesero de la sesión (interna).
create or replace function public.fn_mesa_qr_avisar(
  p_organization_id integer,
  p_recipient uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
begin
  insert into public.notifications (organization_id, recipient_user_id, channel, status, payload)
  values (p_organization_id, p_recipient, 'app', 'pending', p_payload);
end;
$f$;

revoke all on function public.fn_mesa_qr_avisar(integer, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_mesa_qr_avisar(integer, uuid, jsonb) to service_role;

-- Nombre corto del mesero para «Camilo va a tu mesa» (solo el primer nombre).
create or replace function public.fn_mesa_qr_nombre_mesero(p_user uuid)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $f$
  select nullif(split_part(btrim(coalesce(p.first_name, '')), ' ', 1), '')
    from public.profiles p where p.id = p_user;
$f$;

revoke all on function public.fn_mesa_qr_nombre_mesero(uuid) from public, anon, authenticated;
grant execute on function public.fn_mesa_qr_nombre_mesero(uuid) to service_role;

-- Texto saneado del comensal: sin controles, recortado.
create or replace function public.fn_mesa_qr_texto(p_texto text, p_max integer)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $f$
  select nullif(left(btrim(regexp_replace(coalesce(p_texto, ''), '[[:cntrl:]]+', ' ', 'g')), p_max), '');
$f$;

revoke all on function public.fn_mesa_qr_texto(text, integer) from public, anon;
grant execute on function public.fn_mesa_qr_texto(text, integer) to authenticated, service_role;

-- ── 3. RPC públicas (sitio, service role) ───────────────────────────────────────────────────
create or replace function public.fn_mesa_solicitar(
  p_organization_id integer,
  p_table_id uuid,
  p_motivo text default null,
  p_detalle text default null,
  p_comensal text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  c record;
  v_prev public.table_service_requests%rowtype;
  v_id uuid;
  v_reason text;
  v_kind text;
  v_creada timestamptz;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Acceso denegado a la organización' using errcode = '42501';
  end if;
  select * into c from public.fn_mesa_qr_sesion(p_organization_id, p_table_id);
  if c.session_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'SIN_SESION');
  end if;

  -- Antirrebote: un llamado vivo de esta mesa en los últimos 60 s se devuelve tal cual.
  select * into v_prev from public.table_service_requests r
   where r.restaurant_table_id = c.mesa_id
     and r.table_session_id = c.session_id
     and r.kind in ('waiter', 'help')
     and r.status in ('open', 'ack')
     and r.created_at > now() - interval '60 seconds'
   order by r.created_at desc
   limit 1;
  if v_prev.id is not null then
    return jsonb_build_object('ok', true, 'repetido', true, 'request_id', v_prev.id, 'status', v_prev.status,
                              'created_at', v_prev.created_at,
                              'mesero', public.fn_mesa_qr_nombre_mesero(c.server_id));
  end if;

  v_reason := concat_ws(' · ', public.fn_mesa_qr_texto(p_motivo, 80), public.fn_mesa_qr_texto(p_detalle, 200));
  v_reason := nullif(v_reason, '');
  v_kind := case when public.fn_mesa_qr_texto(p_motivo, 80) is null
                   or lower(public.fn_mesa_qr_texto(p_motivo, 80)) like '%mesero%' then 'waiter' else 'help' end;

  insert into public.table_service_requests (organization_id, branch_id, restaurant_table_id, table_session_id,
                                             kind, reason, diner_label)
  values (p_organization_id, c.branch_id, c.mesa_id, c.session_id, v_kind, v_reason,
          public.fn_mesa_qr_texto(p_comensal, 40))
  returning id, created_at into v_id, v_creada;

  perform public.fn_mesa_qr_avisar(p_organization_id, c.server_id, jsonb_build_object(
    'type', 'table_service_request',
    'kind', v_kind,
    'title', c.mesa_nombre || ' llama al mesero',
    'content', coalesce(v_reason, concat_ws(' · ', c.zona, c.sede_nombre)),
    'href', '/app/pos/mesas/' || c.mesa_id,
    'request_id', v_id,
    'table_session_id', c.session_id,
    'restaurant_table_id', c.mesa_id,
    'table_name', c.mesa_nombre));

  return jsonb_build_object('ok', true, 'repetido', false, 'request_id', v_id, 'status', 'open',
                            'created_at', v_creada,
                            'mesero', public.fn_mesa_qr_nombre_mesero(c.server_id));
end;
$f$;

comment on function public.fn_mesa_solicitar(integer, uuid, text, text, text) is
  'Carta QR: «Llamar al mesero». Exige sesión activa de la mesa; deduplica 60 s por mesa; avisa a la campana del mesero.';

revoke all on function public.fn_mesa_solicitar(integer, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_mesa_solicitar(integer, uuid, text, text, text) to service_role;

create or replace function public.fn_mesa_pedir_cuenta(
  p_organization_id integer,
  p_table_id uuid,
  p_detalle text default null,
  p_comensal text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  c record;
  v_prev public.table_service_requests%rowtype;
  v_id uuid;
  v_reason text;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Acceso denegado a la organización' using errcode = '42501';
  end if;
  select * into c from public.fn_mesa_qr_sesion(p_organization_id, p_table_id);
  if c.session_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'SIN_SESION');
  end if;

  update public.table_sessions
     set status = 'bill_requested', updated_at = now()
   where id = c.session_id and status = 'active';

  v_reason := public.fn_mesa_qr_texto(p_detalle, 200);

  -- Una sola solicitud de cuenta viva por sesión: la segunda vez se devuelve la misma.
  select * into v_prev from public.table_service_requests r
   where r.table_session_id = c.session_id and r.kind = 'bill' and r.status in ('open', 'ack')
   order by r.created_at desc limit 1;
  if v_prev.id is not null then
    if v_reason is not null and v_prev.reason is distinct from v_reason then
      update public.table_service_requests set reason = v_reason, updated_at = now() where id = v_prev.id;
    end if;
    return jsonb_build_object('ok', true, 'repetido', true, 'request_id', v_prev.id, 'status', v_prev.status,
                              'estado_sesion', 'bill_requested');
  end if;

  insert into public.table_service_requests (organization_id, branch_id, restaurant_table_id, table_session_id,
                                             kind, reason, diner_label)
  values (p_organization_id, c.branch_id, c.mesa_id, c.session_id, 'bill', v_reason,
          public.fn_mesa_qr_texto(p_comensal, 40))
  returning id into v_id;

  perform public.fn_mesa_qr_avisar(p_organization_id, c.server_id, jsonb_build_object(
    'type', 'table_service_request',
    'kind', 'bill',
    'title', c.mesa_nombre || ' pide la cuenta',
    'content', coalesce(v_reason, concat_ws(' · ', c.zona, c.sede_nombre)),
    'href', '/app/pos/mesas/' || c.mesa_id,
    'request_id', v_id,
    'table_session_id', c.session_id,
    'restaurant_table_id', c.mesa_id,
    'table_name', c.mesa_nombre));

  return jsonb_build_object('ok', true, 'repetido', false, 'request_id', v_id, 'status', 'open',
                            'estado_sesion', 'bill_requested');
end;
$f$;

comment on function public.fn_mesa_pedir_cuenta(integer, uuid, text, text) is
  'Carta QR: «Pedir la cuenta». La sesión activa pasa a bill_requested y queda una solicitud bill (una viva por sesión) con aviso al mesero.';

revoke all on function public.fn_mesa_pedir_cuenta(integer, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_mesa_pedir_cuenta(integer, uuid, text, text) to service_role;

create or replace function public.fn_mesa_cancelar_solicitud(
  p_organization_id integer,
  p_table_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  c record;
  v_n integer;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Acceso denegado a la organización' using errcode = '42501';
  end if;
  select * into c from public.fn_mesa_qr_sesion(p_organization_id, p_table_id);
  if c.session_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'SIN_SESION');
  end if;
  update public.table_service_requests
     set status = 'cancelled', updated_at = now()
   where id = p_request_id
     and organization_id = p_organization_id
     and restaurant_table_id = c.mesa_id
     and table_session_id = c.session_id
     and kind in ('waiter', 'help')
     and status = 'open';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n = 1, 'motivo', case when v_n = 1 then null else 'NO_CANCELABLE' end);
end;
$f$;

revoke all on function public.fn_mesa_cancelar_solicitud(integer, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_mesa_cancelar_solicitud(integer, uuid, uuid) to service_role;

-- ── 5. RPC de staff (POS › Mesas) ───────────────────────────────────────────────────────────
create or replace function public.pos_mesa_atender_solicitud(
  p_organization_id integer,
  p_actor uuid,
  p_request_id uuid,
  p_estado text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  v_r public.table_service_requests%rowtype;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_actor then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;
  if not public.fn_pos_cocina_puede(p_organization_id, p_actor, 'operar') then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;
  if p_estado is null or p_estado not in ('ack', 'done') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  select * into v_r from public.table_service_requests
   where id = p_request_id and organization_id = p_organization_id
   for update;
  if v_r.id is null then
    raise exception 'solicitud_no_encontrada' using errcode = 'P0002';
  end if;
  if auth.uid() is not null and not public.app_branch_access(v_r.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  -- Idempotente: ya en ese estado (o más adelante), se devuelve sin escribir.
  if v_r.status in ('done', 'cancelled') or (v_r.status = 'ack' and p_estado = 'ack') then
    return jsonb_build_object('request_id', v_r.id, 'status', v_r.status, 'cambio', false);
  end if;
  if p_estado = 'ack' then
    update public.table_service_requests
       set status = 'ack', ack_by = p_actor, ack_at = now(), updated_at = now()
     where id = v_r.id;
  else
    update public.table_service_requests
       set status = 'done', done_by = p_actor, done_at = now(),
           ack_by = coalesce(ack_by, p_actor), ack_at = coalesce(ack_at, now()), updated_at = now()
     where id = v_r.id;
  end if;
  -- Una solicitud 'bill' atendida NO cambia table_sessions.status: lo cierra el cobro.
  return jsonb_build_object('request_id', v_r.id, 'status', p_estado, 'cambio', true);
end;
$f$;

comment on function public.pos_mesa_atender_solicitud(integer, uuid, uuid, text) is
  'POS › Mesas: marca una solicitud de la Carta QR como ack (va en camino) o done. Permiso fn_pos_cocina_puede operar. Idempotente.';

revoke all on function public.pos_mesa_atender_solicitud(integer, uuid, uuid, text) from public, anon;
grant execute on function public.pos_mesa_atender_solicitud(integer, uuid, uuid, text) to authenticated, service_role;
