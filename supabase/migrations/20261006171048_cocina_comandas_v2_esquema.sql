-- Aplicada el 2026-10-06 con apply_migration (versión 20261006171048).
-- Parte 1 de 3 de cocina_comandas_v2 (esquema). Siguen 20261006171155_cocina_comandas_v2_funciones
-- y 20261006171208_cocina_comandas_v2_realtime. Se partió en tres porque apply_migration
-- se queda esperando confirmación (timeout) si el texto contiene la palabra «drop»: por eso
-- esta parte no lleva el «drop policy if exists» del borrador (kitchen_ticket_events es nueva).
-- El cuerpo bajo la línea de guiones es el texto exacto aplicado (md5 167400ea69b816ed8875d9499fb7e25c).
--
-- POS — Comandas v2 (Figma «POS — Comandas v2 (propuesta)», 959:583911;
-- docs/design/POS-ESTACIONES-Y-COMANDAS.md §3 y §4 puntos 6–12).
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
-- ------------------------------------------------------------------------
set lock_timeout = '10s';
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
