-- POS › Mesas — flujo completo de atención (Figma «POS — Mesas: flujo completo de atención
-- (propuesta)», 1073:666953, y «POS — Mesas: cuadrícula y plano (propuesta)», 870:98618;
-- docs/design/POS-MESAS-FLUJO-COMPLETO.md §8).
-- Aplicada el 2026-10-06 con apply_migration (versión 20261006164925).
--
-- ENSAYO: ver el bloque al final de este comentario (resultado copiado tal cual).
--
-- Qué hace (aditivo: columnas NULL o con DEFAULT, un CHECK ampliado y funciones nuevas;
-- sin DROP de columnas ni DELETE de datos):
-- 1. Estado «Por limpiar» (D11, T8): restaurant_tables.state admite 'cleaning'. Ninguna
--    función de la base exige 'free' para abrir una mesa (se revisaron pos_mesa_liberar,
--    pos_reserva_sentar, pos_mesa_agregar_pedido_web y pos_mesa_resumen_liberacion).
-- 2. Forma y tamaño de la mesa en el plano (editor 870:104583): restaurant_tables.shape y
--    .size, NULL = como hasta hoy (la forma sale de la capacidad). Color y orden de la zona
--    (870:580140): restaurant_zone_layouts.color y .sort_order.
-- 3. Nota de la mesa (D6, OrderNotePanel): table_sessions.service_notes jsonb
--    ({alergias[], instrucciones, ritmo, nota_cliente}). Viaja con cada ronda en
--    kitchen_tickets.table_note (texto ya armado, para que Comandas lo pinte sin leer la mesa).
-- 4. RPC (SECURITY DEFINER; la organización sale de la fila y se exige pertenencia con
--    fn_assert_acceso_org y acceso a la sede con app_branch_access; nada llega del cliente
--    como organización):
--    - pos_mesa_abrir(mesa, comensales, mesero?, cliente?, reserva?) — D1/T1 en una
--      transacción. Con reserva reutiliza pos_reserva_sentar (no duplica su lógica).
--    - pos_mesa_asignar_cliente(sesión, cliente?) — D2: el cliente queda en la venta al
--      elegirlo (hoy solo quedaba si era huésped). NULL = consumidor final.
--    - pos_mesa_enviar_ronda(sesión, round_key) — D5/T4: manda solo las líneas «por enviar»
--      (sale_items.notes.por_enviar) como UNA ronda, idempotente por round_key, con la regla
--      única de qué va a cocina (fn_lineas_a_cocina). Numera la ronda y la anota en la línea.
--    - pos_mesa_marcar_servido(líneas) — D6: «Servido» desde la cuenta (ítems → delivered y la
--      comanda pasa a delivered cuando no le queda nada vivo).
--    - pos_mesa_marcar_estado(mesa, 'cleaning'|'free') — D11/T8: «Por limpiar» y «Lista».
--    - pos_mesa_mover(sesión, mesa destino, modo, líneas?) — D7: toda la cuenta, algunos
--      productos o unir mesas, en una transacción (hoy son tres diálogos sin transacción).
--
-- Orden: independiente de las demás pendientes. Requiere fn_lineas_a_cocina,
-- web_orders.table_session_id y restaurant_reservations.table_session_id (ya aplicadas).
-- Si 20261006190000_cocina_comandas_v2 se aplica antes o después, no choca: no toca sus
-- columnas ni sus funciones.
--
-- ENSAYO (2026-10-06, vía execute_sql: el cuerpo de esta migración + un bloque `do` como
-- `authenticated` miembro de la org 140, sede 115, que termina en raise exception, de modo
-- que no queda nada; después se comprobó que la Mesa 4 sigue «free» y que no existen ni
-- la columna ni las funciones). Resultado tal cual:
--   ENSAYO_OK r1={reservation_id: null} (abrir Mesa 4 con 3 comensales y cliente)
--   | ronda1={ronda: 1, lineas: 1, a_cocina: 1, estaciones: [{lineas: 1, station: hot_kitchen}]}
--   | repetida={ronda: 1, ya_enviada: true} (mismo round_key: no duplica)
--   | ronda2={ronda: 2, lineas: 1, a_cocina: 1, estaciones: [{lineas: 1, station: all}]}
--   | servido={items: 1} | cliente_null={customer_id: null}
--   | mover_productos={modo: productos, lineas: 1} (a la Mesa 3, que estaba libre: abre su cuenta)
--   | unir={modo: unir, lineas: 1} (Mesa 3 vuelve a la Mesa 4) | cuenta={modo: cuenta} (Mesa 4 → Mesa 2)
--   | limpiar={state: cleaning} | lineas_mesa2=2 total_mesa2=65000.00 ses3=completed mesa3=free
--   mesa4=cleaning nota_cocina=«Alergias: Maní · Entradas primero»
--   item_l1=«delivered:Comensal 2 - sin cebolla»
--   | mesa2_limpiar=[mesa_ocupada] mesa2_abrir=[mesa_ocupada]
--   | ajeno_ronda=[42501 Acceso denegado a la organización]
--   ajeno_estado=[42501 Acceso denegado a la organización]

set lock_timeout = '10s';

-- 1. Estado «Por limpiar» ------------------------------------------------------------------
alter table public.restaurant_tables drop constraint if exists restaurant_tables_state_check;
alter table public.restaurant_tables
  add constraint restaurant_tables_state_check
  check (state = any (array['free'::text, 'occupied'::text, 'reserved'::text, 'cleaning'::text]));

-- 2. Forma, tamaño y zona -------------------------------------------------------------------
alter table public.restaurant_tables
  add column if not exists shape text,
  add column if not exists size text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurant_tables_shape_check') then
    alter table public.restaurant_tables
      add constraint restaurant_tables_shape_check
      check (shape is null or shape = any (array['square'::text, 'round'::text, 'long'::text, 'bar'::text]));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurant_tables_size_check') then
    alter table public.restaurant_tables
      add constraint restaurant_tables_size_check
      check (size is null or size = any (array['s'::text, 'm'::text, 'l'::text]));
  end if;
end $$;

alter table public.restaurant_zone_layouts
  add column if not exists color text,
  add column if not exists sort_order integer;

comment on column public.restaurant_tables.shape is 'Forma en el plano: square, round, long, bar. NULL: la decide la capacidad.';
comment on column public.restaurant_tables.size is 'Tamaño en el plano: s, m, l. NULL: m.';
comment on column public.restaurant_zone_layouts.color is 'Color de la zona (uno de los 6 tonos del manual de marca).';
comment on column public.restaurant_zone_layouts.sort_order is 'Orden de la pestaña de la zona en el plano.';

-- 3. Nota de la mesa -----------------------------------------------------------------------
alter table public.table_sessions add column if not exists service_notes jsonb;
alter table public.kitchen_tickets add column if not exists table_note text;
comment on column public.table_sessions.service_notes is
  'Nota de la mesa (POS › Mesas, D6): {alergias: text[], instrucciones, ritmo: junto|tiempos|aviso, nota_cliente}.';
comment on column public.kitchen_tickets.table_note is
  'Nota de la mesa al enviar la ronda (alergias e instrucciones), ya armada para la cocina.';

-- 4. RPC ------------------------------------------------------------------------------------

-- Texto de la nota de la mesa para la comanda: alergias e instrucciones (la nota para el
-- recibo no va a cocina).
create or replace function public.fn_pos_mesa_nota_cocina(p_service_notes jsonb)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select nullif(left(concat_ws(' · ',
           case when jsonb_typeof(p_service_notes->'alergias') = 'array'
                     and jsonb_array_length(p_service_notes->'alergias') > 0
                then 'Alergias: ' || (select string_agg(a.value, ', ')
                                        from jsonb_array_elements_text(p_service_notes->'alergias') a) end,
           nullif(btrim(coalesce(p_service_notes->>'instrucciones', '')), '')), 500), '');
$function$;

-- Abrir la mesa (D1/T1): comensales, mesero, cliente y la reserva que llega, en una
-- transacción.
create or replace function public.pos_mesa_abrir(
  p_table_id uuid,
  p_customers integer,
  p_server_id uuid default null,
  p_customer_id uuid default null,
  p_reservation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_mesa   public.restaurant_tables%rowtype;
  v_server uuid;
  v_sesion uuid;
  v_sale   uuid;
  v_res    jsonb;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  select * into v_mesa from public.restaurant_tables where id = p_table_id for update;
  if v_mesa.id is null then
    raise exception 'mesa_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_mesa.organization_id);
  if not public.app_branch_access(v_mesa.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if p_customers is null or p_customers < 1 or p_customers > 99 then
    raise exception 'comensales_invalidos' using errcode = '22023';
  end if;

  v_server := coalesce(p_server_id, v_uid);
  if not exists (select 1 from public.organization_members om
                  where om.user_id = v_server and om.organization_id = v_mesa.organization_id and om.is_active) then
    raise exception 'mesero_invalido' using errcode = '22023';
  end if;
  if p_customer_id is not null and not exists (
       select 1 from public.customers c where c.id = p_customer_id and c.organization_id = v_mesa.organization_id) then
    raise exception 'cliente_invalido' using errcode = '22023';
  end if;

  if p_reservation_id is not null then
    -- La reserva se sienta con su propia regla (estado, sede, mesa libre).
    v_res := public.pos_reserva_sentar(v_mesa.organization_id, p_reservation_id, p_table_id, p_customers);
    v_sesion := (v_res->>'table_session_id')::uuid;
    update public.table_sessions set server_id = v_server, updated_at = now() where id = v_sesion;
  else
    if exists (select 1 from public.table_sessions ts
                where ts.restaurant_table_id = p_table_id and ts.organization_id = v_mesa.organization_id
                  and ts.status in ('active', 'bill_requested')) then
      raise exception 'mesa_ocupada' using errcode = 'P0001';
    end if;
    insert into public.table_sessions (organization_id, branch_id, restaurant_table_id, server_id, customers, status)
    values (v_mesa.organization_id, v_mesa.branch_id, p_table_id, v_server, p_customers, 'active')
    returning id into v_sesion;
    update public.restaurant_tables set state = 'occupied', updated_at = now() where id = p_table_id;
  end if;

  if p_customer_id is not null then
    insert into public.sales (organization_id, branch_id, customer_id, user_id, status, payment_status,
                              total, subtotal, tax_total, discount_total, table_session_id)
    values (v_mesa.organization_id, v_mesa.branch_id, p_customer_id, v_server, 'pending', 'pending',
            0, 0, 0, 0, v_sesion)
    returning id into v_sale;
    update public.table_sessions set sale_id = v_sale, updated_at = now() where id = v_sesion;
  end if;

  return jsonb_build_object('table_session_id', v_sesion, 'sale_id', v_sale,
                            'reservation_id', p_reservation_id, 'server_id', v_server);
end;
$function$;

-- Cliente de la cuenta (D2): queda en la venta al elegirlo. NULL = consumidor final.
create or replace function public.pos_mesa_asignar_cliente(p_session_id uuid, p_customer_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ses  public.table_sessions%rowtype;
  v_sale public.sales%rowtype;
  v_branch integer;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  select * into v_ses from public.table_sessions where id = p_session_id for update;
  if v_ses.id is null then
    raise exception 'sesion_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_ses.organization_id);
  if v_ses.status not in ('active', 'bill_requested') then
    raise exception 'sesion_cerrada' using errcode = 'P0001';
  end if;
  v_branch := coalesce(v_ses.branch_id, (select t.branch_id from public.restaurant_tables t where t.id = v_ses.restaurant_table_id));
  if v_branch is not null and not public.app_branch_access(v_branch) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if p_customer_id is not null and not exists (
       select 1 from public.customers c where c.id = p_customer_id and c.organization_id = v_ses.organization_id) then
    raise exception 'cliente_invalido' using errcode = '22023';
  end if;

  if v_ses.sale_id is null then
    if p_customer_id is null then
      return jsonb_build_object('sale_id', null, 'customer_id', null);
    end if;
    insert into public.sales (organization_id, branch_id, customer_id, user_id, status, payment_status,
                              total, subtotal, tax_total, discount_total, table_session_id)
    values (v_ses.organization_id, v_branch, p_customer_id, v_ses.server_id, 'pending', 'pending',
            0, 0, 0, 0, v_ses.id)
    returning * into v_sale;
    update public.table_sessions set sale_id = v_sale.id, updated_at = now() where id = v_ses.id;
  else
    select * into v_sale from public.sales where id = v_ses.sale_id for update;
    if v_sale.organization_id <> v_ses.organization_id then
      raise exception 'venta_de_otra_organizacion' using errcode = '42501';
    end if;
    if v_sale.status <> 'pending' then
      raise exception 'venta_cerrada' using errcode = 'P0001';
    end if;
    update public.sales set customer_id = p_customer_id, updated_at = now() where id = v_sale.id;
  end if;
  return jsonb_build_object('sale_id', v_sale.id, 'customer_id', p_customer_id);
end;
$function$;

-- Enviar la ronda (D5/T4): las líneas «por enviar» de la cuenta salen juntas como una ronda.
create or replace function public.pos_mesa_enviar_ronda(p_session_id uuid, p_round_key uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ses     public.table_sessions%rowtype;
  v_branch  integer;
  v_ids     uuid[];
  v_ronda   integer;
  v_ticket  integer;
  v_server  text;
  v_cocina  integer := 0;
  v_est     jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  if p_round_key is null then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  select * into v_ses from public.table_sessions where id = p_session_id for update;
  if v_ses.id is null then
    raise exception 'sesion_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_ses.organization_id);
  v_branch := coalesce(v_ses.branch_id, (select t.branch_id from public.restaurant_tables t where t.id = v_ses.restaurant_table_id));
  if v_branch is not null and not public.app_branch_access(v_branch) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  -- Idempotencia: la misma ronda (doble clic, reintento sin red) devuelve lo mismo.
  if exists (select 1 from public.kitchen_tickets kt
              where kt.organization_id = v_ses.organization_id and kt.round_key = p_round_key
                and kt.table_session_id is distinct from p_session_id) then
    raise exception 'ronda_de_otra_mesa' using errcode = '22023';
  end if;
  if v_ses.sale_id is not null and exists (
       select 1 from public.sale_items si where si.sale_id = v_ses.sale_id and si.notes->>'round_key' = p_round_key::text) then
    select (si.notes->>'ronda')::integer into v_ronda
      from public.sale_items si where si.sale_id = v_ses.sale_id and si.notes->>'round_key' = p_round_key::text limit 1;
    select kt.id into v_ticket from public.kitchen_tickets kt
     where kt.organization_id = v_ses.organization_id and kt.round_key = p_round_key limit 1;
    return jsonb_build_object('ya_enviada', true, 'ronda', v_ronda, 'ticket_id', v_ticket);
  end if;

  if v_ses.status not in ('active', 'bill_requested') then
    raise exception 'sesion_cerrada' using errcode = 'P0001';
  end if;
  if v_ses.sale_id is null then
    return jsonb_build_object('ya_enviada', false, 'lineas', 0);
  end if;

  select array_agg(si.id order by si.created_at, si.id) into v_ids
    from public.sale_items si
   where si.sale_id = v_ses.sale_id
     and si.paid_at is null
     and coalesce((si.notes->>'por_enviar')::boolean, false);
  if v_ids is null then
    return jsonb_build_object('ya_enviada', false, 'lineas', 0);
  end if;

  select greatest(
           coalesce((select max((si.notes->>'ronda')::integer) from public.sale_items si
                      where si.sale_id = v_ses.sale_id and si.notes ? 'ronda'), 0),
           (select count(*)::integer from public.kitchen_tickets kt
             where kt.table_session_id = p_session_id and kt.ticket_type = 'order')) + 1
    into v_ronda;

  select nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), '') into v_server
    from public.profiles pr where pr.id = auth.uid();

  if exists (select 1 from public.fn_lineas_a_cocina(v_ses.organization_id, v_ids)) then
    insert into public.kitchen_tickets (organization_id, branch_id, sale_id, table_session_id, status, priority,
                                        source, server_name, round_key, ticket_type, has_allergy, table_note)
    values (v_ses.organization_id, v_branch, v_ses.sale_id, p_session_id, 'new', 0,
            'pos', left(v_server, 120), p_round_key, 'order',
            exists (select 1 from public.sale_items si
                     where si.id = any(v_ids) and coalesce((si.notes->>'is_allergy')::boolean, false)
                       and nullif(btrim(coalesce(si.notes->>'extra', '')), '') is not null)
              or (jsonb_typeof(v_ses.service_notes->'alergias') = 'array'
                  and jsonb_array_length(v_ses.service_notes->'alergias') > 0),
            public.fn_pos_mesa_nota_cocina(v_ses.service_notes))
    returning id into v_ticket;

    insert into public.kitchen_ticket_items (organization_id, kitchen_ticket_id, sale_item_id, station, notes, status,
                                             product_name, quantity, variant_data, modifiers, is_allergy)
    select v_ses.organization_id, v_ticket, si.id, c.station,
           nullif(left(concat_ws(' - ',
             case when si.notes ? 'guest_number' then 'Comensal ' || (si.notes->>'guest_number') end,
             nullif(btrim(coalesce(si.notes->>'extra', '')), '')), 500), ''),
           'pending',
           coalesce(nullif(si.notes->>'product_name', ''), p.name, 'Producto'),
           si.quantity,
           p.variant_data,
           case when jsonb_typeof(si.notes->'modifiers') = 'array' and jsonb_array_length(si.notes->'modifiers') > 0
                then (select jsonb_agg(jsonb_build_object('name', m.value->>'name',
                                                          'extraPrice', coalesce(nullif(m.value->>'extraPrice', '')::numeric, 0)))
                        from jsonb_array_elements(si.notes->'modifiers') m) end,
           coalesce((si.notes->>'is_allergy')::boolean, false)
             and nullif(btrim(coalesce(si.notes->>'extra', '')), '') is not null
      from public.fn_lineas_a_cocina(v_ses.organization_id, v_ids) c
      join public.sale_items si on si.id = c.sale_item_id
      left join public.products p on p.id = si.product_id
     order by si.created_at, si.id;
    get diagnostics v_cocina = row_count;

    select coalesce(jsonb_agg(jsonb_build_object('station', e.station, 'lineas', e.n) order by e.station), '[]'::jsonb)
      into v_est
      from (select coalesce(ki.station, '') as station, count(*) as n
              from public.kitchen_ticket_items ki where ki.kitchen_ticket_id = v_ticket
             group by coalesce(ki.station, '')) e;
  end if;

  update public.sale_items
     set notes = (coalesce(notes, '{}'::jsonb) - 'por_enviar')
                 || jsonb_build_object('ronda', v_ronda, 'round_key', p_round_key, 'enviada_at', now()),
         updated_at = now()
   where id = any(v_ids);

  return jsonb_build_object('ya_enviada', false, 'ronda', v_ronda, 'ticket_id', v_ticket,
                            'lineas', cardinality(v_ids), 'a_cocina', v_cocina, 'estaciones', v_est);
end;
$function$;

-- «Servido» desde la cuenta (D6).
create or replace function public.pos_mesa_marcar_servido(p_sale_item_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org     integer;
  v_orgs    integer;
  v_n       integer := 0;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  if p_sale_item_ids is null or cardinality(p_sale_item_ids) = 0 or cardinality(p_sale_item_ids) > 200 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  select min(kt.organization_id), count(distinct kt.organization_id) into v_org, v_orgs
    from public.kitchen_ticket_items ki
    join public.kitchen_tickets kt on kt.id = ki.kitchen_ticket_id
   where ki.sale_item_id = any(p_sale_item_ids);
  if v_org is null then
    return jsonb_build_object('items', 0);
  end if;
  if v_orgs > 1 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  perform public.fn_assert_acceso_org(v_org);

  update public.kitchen_ticket_items ki
     set status = 'delivered', updated_at = now()
   where ki.sale_item_id = any(p_sale_item_ids)
     and ki.organization_id = v_org
     and ki.status not in ('delivered', 'cancelled');
  get diagnostics v_n = row_count;

  update public.kitchen_tickets kt
     set status = 'delivered', updated_at = now()
   where kt.organization_id = v_org
     and kt.status not in ('delivered', 'cancelled')
     and kt.id in (select ki.kitchen_ticket_id from public.kitchen_ticket_items ki where ki.sale_item_id = any(p_sale_item_ids))
     and not exists (select 1 from public.kitchen_ticket_items k2
                      where k2.kitchen_ticket_id = kt.id and k2.status not in ('delivered', 'cancelled'));
  return jsonb_build_object('items', v_n);
end;
$function$;

-- «Por limpiar» y «Lista» (D11/T8).
create or replace function public.pos_mesa_marcar_estado(p_table_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_mesa public.restaurant_tables%rowtype;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  if p_estado is null or p_estado not in ('cleaning', 'free') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  select * into v_mesa from public.restaurant_tables where id = p_table_id for update;
  if v_mesa.id is null then
    raise exception 'mesa_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_mesa.organization_id);
  if not public.app_branch_access(v_mesa.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if exists (select 1 from public.table_sessions ts
              where ts.restaurant_table_id = p_table_id and ts.organization_id = v_mesa.organization_id
                and ts.status in ('active', 'bill_requested')) then
    raise exception 'mesa_ocupada' using errcode = 'P0001';
  end if;
  update public.restaurant_tables set state = p_estado, updated_at = now() where id = p_table_id;
  return jsonb_build_object('table_id', p_table_id, 'state', p_estado);
end;
$function$;

-- Mover, unir o transferir (D7): una transacción.
create or replace function public.pos_mesa_mover(
  p_session_id uuid,
  p_table_destino uuid,
  p_modo text,
  p_sale_item_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ses     public.table_sessions%rowtype;
  v_dest    public.restaurant_tables%rowtype;
  v_origen  public.restaurant_tables%rowtype;
  v_dses    public.table_sessions%rowtype;
  v_dsale   uuid;
  v_n       integer := 0;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  if p_modo is null or p_modo not in ('cuenta', 'productos', 'unir') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  select * into v_ses from public.table_sessions where id = p_session_id for update;
  if v_ses.id is null then
    raise exception 'sesion_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_ses.organization_id);
  if v_ses.status not in ('active', 'bill_requested') then
    raise exception 'sesion_cerrada' using errcode = 'P0001';
  end if;
  select * into v_origen from public.restaurant_tables where id = v_ses.restaurant_table_id for update;
  select * into v_dest from public.restaurant_tables where id = p_table_destino for update;
  if v_dest.id is null or v_dest.organization_id <> v_ses.organization_id then
    raise exception 'mesa_no_encontrada' using errcode = 'P0002';
  end if;
  if v_dest.id = v_origen.id then
    raise exception 'misma_mesa' using errcode = '22023';
  end if;
  if v_dest.branch_id is distinct from v_origen.branch_id then
    raise exception 'mesa_de_otra_sede' using errcode = '22023';
  end if;
  if not public.app_branch_access(v_dest.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  select * into v_dses from public.table_sessions ts
   where ts.restaurant_table_id = p_table_destino and ts.organization_id = v_ses.organization_id
     and ts.status in ('active', 'bill_requested')
   order by ts.opened_at desc limit 1
   for update;

  if p_modo = 'cuenta' then
    if v_dses.id is not null then
      raise exception 'mesa_ocupada' using errcode = 'P0001';
    end if;
    update public.table_sessions set restaurant_table_id = p_table_destino, updated_at = now() where id = v_ses.id;
    update public.restaurant_reservations set restaurant_table_id = p_table_destino, updated_at = now()
     where table_session_id = v_ses.id and status = 'seated';
    update public.restaurant_tables set state = 'occupied', updated_at = now() where id = p_table_destino;
    if not exists (select 1 from public.table_sessions ts
                    where ts.restaurant_table_id = v_origen.id and ts.status in ('active', 'bill_requested')) then
      update public.restaurant_tables set state = 'free', updated_at = now() where id = v_origen.id;
    end if;
    return jsonb_build_object('modo', p_modo, 'table_session_id', v_ses.id, 'mesa_destino', p_table_destino);
  end if;

  if p_modo = 'productos' then
    if p_sale_item_ids is null or cardinality(p_sale_item_ids) = 0 or cardinality(p_sale_item_ids) > 200 then
      raise exception 'datos_invalidos' using errcode = '22023';
    end if;
    if v_ses.sale_id is null or exists (
         select 1 from unnest(p_sale_item_ids) as x(id)
          where not exists (select 1 from public.sale_items si
                             where si.id = x.id and si.sale_id = v_ses.sale_id
                               and si.paid_at is null and coalesce(si.paid_amount, 0) = 0)) then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;
  else
    -- unir: la cuenta de origen entra entera en la de destino, que debe estar abierta.
    if v_dses.id is null then
      raise exception 'mesa_sin_cuenta' using errcode = 'P0001';
    end if;
    if v_ses.sale_id is not null and exists (
         select 1 from public.sale_items si where si.sale_id = v_ses.sale_id and (si.paid_at is not null or coalesce(si.paid_amount, 0) > 0)) then
      raise exception 'cuenta_con_pagos' using errcode = 'P0001';
    end if;
  end if;

  -- Cuenta de destino (abre la mesa libre al recibir productos).
  if v_dses.id is null then
    insert into public.table_sessions (organization_id, branch_id, restaurant_table_id, server_id, customers, status)
    values (v_ses.organization_id, v_dest.branch_id, p_table_destino, v_ses.server_id, 1, 'active')
    returning * into v_dses;
    update public.restaurant_tables set state = 'occupied', updated_at = now() where id = p_table_destino;
  end if;
  v_dsale := v_dses.sale_id;
  if v_dsale is null then
    insert into public.sales (organization_id, branch_id, user_id, status, payment_status,
                              total, subtotal, tax_total, discount_total, table_session_id)
    values (v_ses.organization_id, v_dest.branch_id, v_dses.server_id, 'pending', 'pending', 0, 0, 0, 0, v_dses.id)
    returning id into v_dsale;
    update public.table_sessions set sale_id = v_dsale, updated_at = now() where id = v_dses.id;
  end if;

  if p_modo = 'productos' then
    -- Las comandas cuyos platos se van todos viajan con ellos (la cocina ve la mesa nueva).
    update public.kitchen_tickets kt
       set table_session_id = v_dses.id, sale_id = v_dsale, updated_at = now()
     where kt.table_session_id = v_ses.id
       and exists (select 1 from public.kitchen_ticket_items ki where ki.kitchen_ticket_id = kt.id and ki.sale_item_id = any(p_sale_item_ids))
       and not exists (select 1 from public.kitchen_ticket_items ki
                        where ki.kitchen_ticket_id = kt.id and ki.status <> 'cancelled'
                          and (ki.sale_item_id is null or not (ki.sale_item_id = any(p_sale_item_ids))));
    update public.sale_items set sale_id = v_dsale, updated_at = now()
     where id = any(p_sale_item_ids) and sale_id = v_ses.sale_id;
    get diagnostics v_n = row_count;
  else
    if v_ses.sale_id is not null then
      update public.sale_items set sale_id = v_dsale, updated_at = now() where sale_id = v_ses.sale_id;
      get diagnostics v_n = row_count;
    end if;
    update public.kitchen_tickets set table_session_id = v_dses.id, sale_id = v_dsale, updated_at = now()
     where table_session_id = v_ses.id;
    update public.web_orders set table_session_id = v_dses.id where table_session_id = v_ses.id;
    update public.restaurant_reservations set table_session_id = v_dses.id, restaurant_table_id = p_table_destino, updated_at = now()
     where table_session_id = v_ses.id and status = 'seated';
    update public.table_sessions
       set customers = coalesce(customers, 1) + coalesce(v_ses.customers, 1), updated_at = now()
     where id = v_dses.id;
    update public.table_sessions set status = 'completed', closed_at = now(), updated_at = now() where id = v_ses.id;
    if not exists (select 1 from public.table_sessions ts
                    where ts.restaurant_table_id = v_origen.id and ts.status in ('active', 'bill_requested')) then
      update public.restaurant_tables set state = 'free', updated_at = now() where id = v_origen.id;
    end if;
  end if;

  if v_ses.sale_id is not null then
    perform public.fn_pos_recalcular_venta(v_ses.sale_id);
  end if;
  perform public.fn_pos_recalcular_venta(v_dsale);

  return jsonb_build_object('modo', p_modo, 'table_session_id', v_dses.id, 'mesa_destino', p_table_destino,
                            'lineas', v_n);
end;
$function$;

revoke all on function public.fn_pos_mesa_nota_cocina(jsonb) from public, anon;
revoke all on function public.pos_mesa_abrir(uuid, integer, uuid, uuid, uuid) from public, anon;
revoke all on function public.pos_mesa_asignar_cliente(uuid, uuid) from public, anon;
revoke all on function public.pos_mesa_enviar_ronda(uuid, uuid) from public, anon;
revoke all on function public.pos_mesa_marcar_servido(uuid[]) from public, anon;
revoke all on function public.pos_mesa_marcar_estado(uuid, text) from public, anon;
revoke all on function public.pos_mesa_mover(uuid, uuid, text, uuid[]) from public, anon;
grant execute on function public.fn_pos_mesa_nota_cocina(jsonb) to authenticated, service_role;
grant execute on function public.pos_mesa_abrir(uuid, integer, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.pos_mesa_asignar_cliente(uuid, uuid) to authenticated, service_role;
grant execute on function public.pos_mesa_enviar_ronda(uuid, uuid) to authenticated, service_role;
grant execute on function public.pos_mesa_marcar_servido(uuid[]) to authenticated, service_role;
grant execute on function public.pos_mesa_marcar_estado(uuid, text) to authenticated, service_role;
grant execute on function public.pos_mesa_mover(uuid, uuid, text, uuid[]) to authenticated, service_role;
