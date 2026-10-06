-- POS — Comandas v2 (Figma «POS — Comandas v2 (propuesta)», 959:583911;
-- docs/design/POS-ESTACIONES-Y-COMANDAS.md §3 y §4 puntos 6–12).
-- NO APLICADA. La aplica el coordinador por el MCP (apply_migration).
--
-- ENSAYO (2026-10-06, MCP, org 140, todo dentro de un `do $$ … raise
-- exception 'ENSAYO_OK' $$`: la migración entera por EXECUTE y luego las
-- pruebas; nada quedó aplicado). Resultado: «ENSAYO_OK cerradas=1
-- tiempo=00:00:00.049» —
--   * comanda nueva con un plato (hot_kitchen) y una bebida (bar):
--     cambiar_estado(hot_kitchen, preparing) → «preparing»;
--     cambiar_estado(hot_kitchen, ready) → sigue «preparing» (el bar no ha
--     terminado: estado por estación);
--     marcar_item(bebida, hecho) → la comanda se deriva a «ready»;
--     cambiar_estado(bar, new) → vuelve a «preparing» y queda el evento;
--   * ≥ 4 eventos en kitchen_ticket_events;
--   * cancelar sin motivo → 22023 motivo_requerido;
--   * actor que no es miembro → 42501 sin_membresia;
--   * mover_item, avisar_mesero (sin mesero → 'sin_mesero'), rondas_mesa
--     (lee las rondas de una cuenta real), cancelar con motivo → «cancelled»;
--   * cerrar_anteriores cerró 1 comanda viva de hace días (revertido);
--   * como authenticated, llamar la RPC → insufficient_privilege.
-- Un primer ensayo con un reparto masivo de los permisos nuevos a roles
-- superó los 60 s del MCP: por eso ese reparto se quitó (ver punto 3).
--
-- Qué hace (aditivo: columnas NULL, una tabla nueva, funciones nuevas, dos
-- permisos y la publicación Realtime de kitchen_ticket_items; sin DROP ni
-- DELETE de datos):
-- 1. Tiempos por comanda y por ítem: kitchen_tickets.started_at,
--    waiter_notified_at; kitchen_ticket_items.started_at, ready_at.
-- 2. kitchen_ticket_events: la línea de tiempo del detalle (quién y cuándo
--    empezó, marcó lista, devolvió, canceló, movió o avisó). Solo lectura
--    para los miembros; se escribe desde las RPC.
-- 3. Permisos pos.cocina.operar (empezar, lista, entregar, avisar) y
--    pos.cocina.gestionar (devolver, cancelar, mover ítem, cerrar en bloque).
--    Para no dejar sin cocina a quien hoy la usa, operar también lo da
--    pos.view / pos_access y gestionar lo da pos.void (sin repartir los
--    permisos nuevos a roles en bloque).
-- 4. RPC (SECURITY DEFINER, organización y actor de la SESIÓN que pasa la
--    ruta con getServerOrgContext, membresía y permiso comprobados aquí):
--    pos_cocina_cambiar_estado, pos_cocina_marcar_item, pos_cocina_cancelar,
--    pos_cocina_mover_item, pos_cocina_cerrar_anteriores,
--    pos_cocina_avisar_mesero y pos_cocina_rondas_mesa (lectura para Mesas).
--    El estado de la comanda se DERIVA de sus ítems (estado por estación:
--    el bar ya no «termina» los platos de cocina).
-- 5. Realtime: kitchen_ticket_items entra en supabase_realtime (Mesas y el
--    tablero ya se suscriben y hoy no recibían nada).
--
-- Orden: independiente de las demás pendientes. Requiere las columnas de
-- f6dda487 (has_allergy, ticket_type…) y web_order_id, ya aplicadas.

-- 1. Columnas ---------------------------------------------------------------
alter table public.kitchen_tickets
  add column if not exists started_at timestamptz,
  add column if not exists waiter_notified_at timestamptz;

alter table public.kitchen_ticket_items
  add column if not exists started_at timestamptz,
  add column if not exists ready_at timestamptz;

comment on column public.kitchen_tickets.started_at is
  'Primera vez que alguna estación empezó la comanda (Comandas v2).';
comment on column public.kitchen_tickets.waiter_notified_at is
  'Último «Avisar al mesero» desde Comandas.';
comment on column public.kitchen_ticket_items.started_at is
  'Cuándo la estación del ítem lo empezó.';
comment on column public.kitchen_ticket_items.ready_at is
  'Cuándo la estación del ítem lo marcó listo.';

-- 2. Línea de tiempo --------------------------------------------------------
create table if not exists public.kitchen_ticket_events (
  id                bigserial primary key,
  organization_id   integer not null references public.organizations(id) on delete cascade,
  kitchen_ticket_id integer not null references public.kitchen_tickets(id) on delete cascade,
  kitchen_ticket_item_id integer references public.kitchen_ticket_items(id) on delete set null,
  station           text,
  event             text not null check (event in (
                      'empezada', 'lista', 'entregada', 'devuelta', 'cancelada',
                      'item_hecho', 'item_deshecho', 'item_movido',
                      'cerrada_en_bloque', 'mesero_avisado')),
  actor_id          uuid,
  detail            jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists kitchen_ticket_events_ticket_idx
  on public.kitchen_ticket_events (kitchen_ticket_id, created_at);
create index if not exists kitchen_ticket_events_org_idx
  on public.kitchen_ticket_events (organization_id, created_at desc);

alter table public.kitchen_ticket_events enable row level security;

drop policy if exists kitchen_ticket_events_select on public.kitchen_ticket_events;
create policy kitchen_ticket_events_select on public.kitchen_ticket_events
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active));

revoke all on public.kitchen_ticket_events from anon;
grant select on public.kitchen_ticket_events to authenticated;

-- 3. Permisos ---------------------------------------------------------------
insert into public.permissions (code, module, name, description, category)
values
  ('pos.cocina.operar', 'pos', 'Operar cocina',
   'Empezar, marcar lista y entregar comandas, confirmar alergias y avisar al mesero', 'pos'),
  ('pos.cocina.gestionar', 'pos', 'Gestionar comandas',
   'Devolver a Nuevas, cancelar comandas, mover ítems de estación y cerrar comandas de días anteriores', 'pos')
on conflict (code) do nothing;

-- No se reparten a roles en bloque: admin y gerente (roles 1 y 2) pasan por
-- rol y, mientras nadie los asigne, fn_pos_cocina_puede acepta como hasta hoy
-- pos.view / pos_access (operar) y pos.void (gestionar).

-- 4. Funciones --------------------------------------------------------------

-- ¿Puede el actor operar (o gestionar) la cocina de la organización?
create or replace function public.fn_pos_cocina_puede(p_organization_id integer, p_actor uuid, p_nivel text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_om record;
begin
  if p_actor is null then
    return false;
  end if;
  select om.role_id, om.is_super_admin into v_om
  from public.organization_members om
  where om.user_id = p_actor and om.organization_id = p_organization_id and om.is_active
  limit 1;
  if not found then
    return false;
  end if;
  if coalesce(v_om.is_super_admin, false) or v_om.role_id in (1, 2) then
    return true;
  end if;
  if p_nivel = 'gestionar' then
    return public.check_user_permission(p_actor, p_organization_id, 'pos.cocina.gestionar')
        or public.check_user_permission(p_actor, p_organization_id, 'pos.void')
        or public.check_user_permission(p_actor, p_organization_id, 'admin.full_access');
  end if;
  return public.check_user_permission(p_actor, p_organization_id, 'pos.cocina.operar')
      or public.check_user_permission(p_actor, p_organization_id, 'pos.cocina.gestionar')
      or public.check_user_permission(p_actor, p_organization_id, 'pos.view')
      or public.check_user_permission(p_actor, p_organization_id, 'pos_access')
      or public.check_user_permission(p_actor, p_organization_id, 'admin.full_access');
end;
$function$;

-- Estado de la comanda derivado de sus ítems vivos (no anulados).
create or replace function public.fn_pos_cocina_estado_derivado(p_ticket_id integer)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select case
    when count(*) = 0 then null
    when bool_and(i.status = 'delivered') then 'delivered'
    when bool_and(i.status in ('ready', 'delivered')) then 'ready'
    when bool_and(i.status = 'pending') then 'new'
    else 'preparing'
  end
  from public.kitchen_ticket_items i
  where i.kitchen_ticket_id = p_ticket_id and i.status <> 'cancelled';
$function$;

-- Aplica el estado derivado a la comanda (con sus tiempos).
create or replace function public.fn_pos_cocina_aplicar_derivado(p_ticket_id integer)
returns public.kitchen_tickets
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_kt public.kitchen_tickets%rowtype;
  v_estado text := public.fn_pos_cocina_estado_derivado(p_ticket_id);
begin
  select * into v_kt from public.kitchen_tickets where id = p_ticket_id;
  if v_estado is null or v_estado = v_kt.status or v_kt.status = 'cancelled' then
    return v_kt;
  end if;
  update public.kitchen_tickets
     set status = v_estado,
         started_at = case when v_estado in ('preparing', 'ready', 'delivered') then coalesce(started_at, now()) else started_at end,
         ready_at = case when v_estado = 'ready' then coalesce(ready_at, now())
                         when v_estado = 'delivered' then ready_at
                         else null end,
         updated_at = now()
   where id = p_ticket_id
   returning * into v_kt;
  return v_kt;
end;
$function$;

-- Cambiar el estado de la comanda, de una estación (p_station) o de todas (NULL).
create or replace function public.pos_cocina_cambiar_estado(
  p_organization_id integer,
  p_actor uuid,
  p_ticket_id integer,
  p_station text,
  p_estado text,
  p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_kt public.kitchen_tickets%rowtype;
  v_n integer := 0;
  v_ready_antes timestamptz;
  v_evento text;
begin
  if p_estado not in ('new', 'preparing', 'ready', 'delivered') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if not public.fn_pos_cocina_puede(p_organization_id, p_actor, case when p_estado = 'new' then 'gestionar' else 'operar' end) then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;
  select * into v_kt from public.kitchen_tickets
   where id = p_ticket_id and organization_id = p_organization_id
   for update;
  if not found then
    raise exception 'comanda_no_encontrada' using errcode = 'P0002';
  end if;
  if v_kt.status = 'cancelled' then
    raise exception 'comanda_cancelada' using errcode = 'P0001';
  end if;
  if p_estado in ('preparing', 'ready') and v_kt.has_allergy and v_kt.allergy_ack_at is null then
    raise exception 'alergia_sin_confirmar' using errcode = 'P0001';
  end if;
  v_ready_antes := v_kt.ready_at;

  if p_estado = 'preparing' then
    update public.kitchen_ticket_items
       set status = 'in_progress', started_at = coalesce(started_at, now()), updated_at = now()
     where kitchen_ticket_id = v_kt.id and status = 'pending'
       and (p_station is null or coalesce(station, '') = p_station);
    get diagnostics v_n = row_count;
    v_evento := 'empezada';
  elsif p_estado = 'ready' then
    update public.kitchen_ticket_items
       set status = 'ready', started_at = coalesce(started_at, now()), ready_at = coalesce(ready_at, now()), updated_at = now()
     where kitchen_ticket_id = v_kt.id and status in ('pending', 'in_progress')
       and (p_station is null or coalesce(station, '') = p_station);
    get diagnostics v_n = row_count;
    v_evento := 'lista';
  elsif p_estado = 'delivered' then
    update public.kitchen_ticket_items
       set status = 'delivered', updated_at = now()
     where kitchen_ticket_id = v_kt.id and status not in ('cancelled', 'delivered');
    get diagnostics v_n = row_count;
    update public.kitchen_tickets
       set status = 'delivered', ready_at = coalesce(ready_at, now()), updated_at = now()
     where id = v_kt.id and status <> 'delivered';
    v_evento := 'entregada';
  else
    update public.kitchen_ticket_items
       set status = 'pending', ready_at = null, updated_at = now()
     where kitchen_ticket_id = v_kt.id and status in ('in_progress', 'ready', 'delivered')
       and (p_station is null or coalesce(station, '') = p_station);
    get diagnostics v_n = row_count;
    v_evento := 'devuelta';
  end if;

  if p_estado <> 'delivered' then
    v_kt := public.fn_pos_cocina_aplicar_derivado(v_kt.id);
  else
    select * into v_kt from public.kitchen_tickets where id = p_ticket_id;
  end if;

  if v_n > 0 then
    insert into public.kitchen_ticket_events (organization_id, kitchen_ticket_id, station, event, actor_id, detail)
    values (p_organization_id, v_kt.id, p_station, v_evento, p_actor,
            jsonb_build_object('items', v_n, 'motivo', nullif(btrim(coalesce(p_motivo, '')), ''),
                               'ready_at_anterior', case when v_evento = 'devuelta' then v_ready_antes end));
  end if;

  return jsonb_build_object('ticket_id', v_kt.id, 'status', v_kt.status, 'started_at', v_kt.started_at,
                            'ready_at', v_kt.ready_at, 'items_cambiados', v_n);
end;
$function$;

-- Tocar un ítem: hecho (listo) o deshacer (vuelve a «en preparación»).
create or replace function public.pos_cocina_marcar_item(
  p_organization_id integer,
  p_actor uuid,
  p_item_id integer,
  p_hecho boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_it public.kitchen_ticket_items%rowtype;
  v_kt public.kitchen_tickets%rowtype;
begin
  if not public.fn_pos_cocina_puede(p_organization_id, p_actor, 'operar') then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;
  select i.* into v_it from public.kitchen_ticket_items i
   where i.id = p_item_id and i.organization_id = p_organization_id;
  if not found then
    raise exception 'linea_no_encontrada' using errcode = 'P0002';
  end if;
  select * into v_kt from public.kitchen_tickets where id = v_it.kitchen_ticket_id for update;
  if v_kt.status = 'cancelled' or v_it.status in ('cancelled', 'delivered') then
    raise exception 'comanda_cancelada' using errcode = 'P0001';
  end if;
  if v_kt.has_allergy and v_kt.allergy_ack_at is null then
    raise exception 'alergia_sin_confirmar' using errcode = 'P0001';
  end if;

  if coalesce(p_hecho, true) then
    if v_it.status <> 'ready' then
      update public.kitchen_ticket_items
         set status = 'ready', started_at = coalesce(started_at, now()), ready_at = now(), updated_at = now()
       where id = v_it.id;
      insert into public.kitchen_ticket_events (organization_id, kitchen_ticket_id, kitchen_ticket_item_id, station, event, actor_id)
      values (p_organization_id, v_kt.id, v_it.id, v_it.station, 'item_hecho', p_actor);
    end if;
  else
    if v_it.status = 'ready' then
      update public.kitchen_ticket_items
         set status = 'in_progress', ready_at = null, updated_at = now()
       where id = v_it.id;
      insert into public.kitchen_ticket_events (organization_id, kitchen_ticket_id, kitchen_ticket_item_id, station, event, actor_id)
      values (p_organization_id, v_kt.id, v_it.id, v_it.station, 'item_deshecho', p_actor);
    end if;
  end if;

  v_kt := public.fn_pos_cocina_aplicar_derivado(v_kt.id);
  return jsonb_build_object('ticket_id', v_kt.id, 'status', v_kt.status, 'ready_at', v_kt.ready_at,
                            'item_id', v_it.id, 'hecho', coalesce(p_hecho, true));
end;
$function$;

-- Cancelar la comanda entera (con motivo). La venta no cambia.
create or replace function public.pos_cocina_cancelar(
  p_organization_id integer,
  p_actor uuid,
  p_ticket_id integer,
  p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_kt public.kitchen_tickets%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if v_motivo is null then
    raise exception 'motivo_requerido' using errcode = '22023';
  end if;
  if not public.fn_pos_cocina_puede(p_organization_id, p_actor, 'gestionar') then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;
  select * into v_kt from public.kitchen_tickets
   where id = p_ticket_id and organization_id = p_organization_id
   for update;
  if not found then
    raise exception 'comanda_no_encontrada' using errcode = 'P0002';
  end if;
  if v_kt.status = 'cancelled' then
    return jsonb_build_object('ticket_id', v_kt.id, 'status', v_kt.status, 'repetida', true);
  end if;
  update public.kitchen_ticket_items
     set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()),
         cancel_reason = coalesce(cancel_reason, left(v_motivo, 500)), updated_at = now()
   where kitchen_ticket_id = v_kt.id and status not in ('cancelled', 'delivered');
  update public.kitchen_tickets
     set status = 'cancelled', cancelled_at = now(), cancellation_reason = left(v_motivo, 500), updated_at = now()
   where id = v_kt.id
   returning * into v_kt;
  insert into public.kitchen_ticket_events (organization_id, kitchen_ticket_id, event, actor_id, detail)
  values (p_organization_id, v_kt.id, 'cancelada', p_actor, jsonb_build_object('motivo', left(v_motivo, 500)));
  return jsonb_build_object('ticket_id', v_kt.id, 'status', v_kt.status, 'repetida', false);
end;
$function$;

-- Enviar un ítem a otra estación.
create or replace function public.pos_cocina_mover_item(
  p_organization_id integer,
  p_actor uuid,
  p_item_id integer,
  p_station text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_it public.kitchen_ticket_items%rowtype;
  v_destino text := nullif(btrim(coalesce(p_station, '')), '');
begin
  if v_destino is null or v_destino !~ '^[a-z0-9_]{1,60}$' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if not public.fn_pos_cocina_puede(p_organization_id, p_actor, 'gestionar') then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;
  select i.* into v_it from public.kitchen_ticket_items i
   where i.id = p_item_id and i.organization_id = p_organization_id
   for update;
  if not found then
    raise exception 'linea_no_encontrada' using errcode = 'P0002';
  end if;
  if v_it.station is distinct from v_destino then
    update public.kitchen_ticket_items set station = v_destino, updated_at = now() where id = v_it.id;
    insert into public.kitchen_ticket_events (organization_id, kitchen_ticket_id, kitchen_ticket_item_id, station, event, actor_id, detail)
    values (p_organization_id, v_it.kitchen_ticket_id, v_it.id, v_destino, 'item_movido', p_actor,
            jsonb_build_object('desde', v_it.station, 'hacia', v_destino));
  end if;
  return jsonb_build_object('item_id', v_it.id, 'station', v_destino, 'ticket_id', v_it.kitchen_ticket_id);
end;
$function$;

-- Cerrar en bloque las comandas vivas de días anteriores de una sede.
create or replace function public.pos_cocina_cerrar_anteriores(
  p_organization_id integer,
  p_actor uuid,
  p_branch_id integer,
  p_antes timestamptz,
  p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_ids integer[];
begin
  if v_motivo is null then
    raise exception 'motivo_requerido' using errcode = '22023';
  end if;
  if p_antes is null or p_antes > now() then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if not public.fn_pos_cocina_puede(p_organization_id, p_actor, 'gestionar') then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'sucursal_de_otra_organizacion' using errcode = '42501';
  end if;
  select coalesce(array_agg(kt.id), '{}') into v_ids
  from public.kitchen_tickets kt
  where kt.organization_id = p_organization_id
    and (p_branch_id is null or kt.branch_id = p_branch_id)
    and kt.status in ('new', 'preparing', 'ready')
    and kt.created_at < p_antes;
  if cardinality(v_ids) = 0 then
    return jsonb_build_object('cerradas', 0);
  end if;
  update public.kitchen_ticket_items
     set status = 'delivered', updated_at = now()
   where kitchen_ticket_id = any(v_ids) and status not in ('cancelled', 'delivered');
  -- Se cierran como entregadas: la alergia sin confirmar no aplica a lo que ya salió.
  update public.kitchen_tickets
     set status = 'delivered', updated_at = now()
   where id = any(v_ids);
  insert into public.kitchen_ticket_events (organization_id, kitchen_ticket_id, event, actor_id, detail)
  select p_organization_id, x, 'cerrada_en_bloque', p_actor, jsonb_build_object('motivo', left(v_motivo, 500))
  from unnest(v_ids) as x;
  return jsonb_build_object('cerradas', cardinality(v_ids));
end;
$function$;

-- «Avisar al mesero»: aviso en la campana del mesero de la mesa.
create or replace function public.pos_cocina_avisar_mesero(
  p_organization_id integer,
  p_actor uuid,
  p_ticket_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_kt public.kitchen_tickets%rowtype;
  v_mesero uuid;
  v_mesa text;
begin
  if not public.fn_pos_cocina_puede(p_organization_id, p_actor, 'operar') then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;
  select * into v_kt from public.kitchen_tickets
   where id = p_ticket_id and organization_id = p_organization_id
   for update;
  if not found then
    raise exception 'comanda_no_encontrada' using errcode = 'P0002';
  end if;
  select ts.server_id, rt.name into v_mesero, v_mesa
  from public.table_sessions ts
  left join public.restaurant_tables rt on rt.id = ts.restaurant_table_id
  where ts.id = v_kt.table_session_id and ts.organization_id = p_organization_id;
  if v_mesero is null then
    return jsonb_build_object('avisado', false, 'motivo', 'sin_mesero');
  end if;
  -- Idempotente: dos toques seguidos no mandan dos avisos.
  if v_kt.waiter_notified_at is not null and v_kt.waiter_notified_at > now() - interval '1 minute' then
    return jsonb_build_object('avisado', true, 'repetido', true);
  end if;
  insert into public.notifications (organization_id, recipient_user_id, channel, status, payload)
  values (p_organization_id, v_mesero, 'app', 'pending', jsonb_build_object(
    'type', 'kitchen_ticket_ready',
    'title', 'Comanda lista para servir',
    'message', case when v_mesa is not null
                    then 'La comanda #' || v_kt.id || ' de la mesa ' || v_mesa || ' está lista para servir'
                    else 'La comanda #' || v_kt.id || ' está lista para servir' end,
    'kitchen_ticket_id', v_kt.id,
    'table_session_id', v_kt.table_session_id,
    'table_name', v_mesa,
    'recordatorio', true));
  update public.kitchen_tickets set waiter_notified_at = now() where id = v_kt.id;
  insert into public.kitchen_ticket_events (organization_id, kitchen_ticket_id, event, actor_id)
  values (p_organization_id, v_kt.id, 'mesero_avisado', p_actor);
  return jsonb_build_object('avisado', true, 'repetido', false);
end;
$function$;

-- Lectura para Mesas: rondas de una cuenta con su estado (el contrato
-- con el agente de mesas; Comandas es el dueño de esta función).
create or replace function public.pos_cocina_rondas_mesa(
  p_organization_id integer,
  p_actor uuid,
  p_table_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not exists (
    select 1 from public.organization_members om
    where om.user_id = p_actor and om.organization_id = p_organization_id and om.is_active) then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(r order by r.created_at)
    from (
      select kt.id as ticket_id,
             kt.ticket_type,
             kt.adjusts_ticket_id,
             case when kt.ticket_type = 'order'
                  then row_number() over (partition by kt.ticket_type order by kt.created_at) end as ronda,
             kt.status, kt.created_at, kt.started_at, kt.ready_at, kt.has_allergy, kt.allergy_ack_at,
             (select count(*) from public.kitchen_ticket_items i where i.kitchen_ticket_id = kt.id and i.status <> 'cancelled') as items,
             (select count(*) from public.kitchen_ticket_items i where i.kitchen_ticket_id = kt.id and i.status in ('ready', 'delivered')) as items_listos
      from public.kitchen_tickets kt
      where kt.organization_id = p_organization_id and kt.table_session_id = p_table_session_id
    ) r), '[]'::jsonb);
end;
$function$;

revoke all on function public.fn_pos_cocina_puede(integer, uuid, text) from public, anon, authenticated;
revoke all on function public.fn_pos_cocina_aplicar_derivado(integer) from public, anon, authenticated;
revoke all on function public.pos_cocina_cambiar_estado(integer, uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.pos_cocina_marcar_item(integer, uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.pos_cocina_cancelar(integer, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.pos_cocina_mover_item(integer, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.pos_cocina_cerrar_anteriores(integer, uuid, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.pos_cocina_avisar_mesero(integer, uuid, integer) from public, anon, authenticated;
revoke all on function public.pos_cocina_rondas_mesa(integer, uuid, uuid) from public, anon, authenticated;
grant execute on function public.pos_cocina_cambiar_estado(integer, uuid, integer, text, text, text) to service_role;
grant execute on function public.pos_cocina_marcar_item(integer, uuid, integer, boolean) to service_role;
grant execute on function public.pos_cocina_cancelar(integer, uuid, integer, text) to service_role;
grant execute on function public.pos_cocina_mover_item(integer, uuid, integer, text) to service_role;
grant execute on function public.pos_cocina_cerrar_anteriores(integer, uuid, integer, timestamptz, text) to service_role;
grant execute on function public.pos_cocina_avisar_mesero(integer, uuid, integer) to service_role;
grant execute on function public.pos_cocina_rondas_mesa(integer, uuid, uuid) to service_role;

-- 5. Realtime ---------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kitchen_ticket_items') then
    alter publication supabase_realtime add table public.kitchen_ticket_items;
  end if;
end $$;
