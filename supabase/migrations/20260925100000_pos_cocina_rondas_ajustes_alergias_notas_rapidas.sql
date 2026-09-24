-- ============================================================================
-- POS · Cocina: rondas idempotentes, comandas de ajuste, alergias y notas
-- rápidas (decisiones del dueño, 2026-09-23;
-- docs/design/POS-CARRITO-LINEAS-NOTAS.md, hallazgos N1, N2, N3, N5, N11).
--
-- 1. Mostrador. El vínculo carrito ↔ comanda deja de vivir en la pantalla:
--    `kitchen_tickets.cart_id` y `kitchen_ticket_items.cart_line_id` (id
--    estable de la línea del carrito). «Enviar a cocina» pasa por
--    `pos_cocina_enviar_ronda`, que en UNA transacción compara lo que hay en el
--    carrito con lo ya enviado POR LÍNEA y crea solo lo nuevo (comanda normal)
--    y los cambios sobre lo ya enviado (comanda de AJUSTE: +/− unidades, nota
--    cambiada o anulación). Es idempotente por `round_key`: la misma ronda
--    enviada dos veces devuelve la comanda de la primera vez.
-- 2. Mesa. Cambiar la cantidad o quitar un plato YA enviado no toca en
--    silencio la comanda original: `pos_cocina_ajustar_linea_mesa` crea la
--    comanda de ajuste y, al anular, marca el ítem original `cancelled` con su
--    motivo (nunca lo borra). La comanda guarda copia de nombre, cantidad y
--    modificadores (N11) para que la original no cambie por join.
-- 3. Alergias. `kitchen_ticket_items.is_allergy` y `kitchen_tickets.has_allergy`;
--    la comanda con alergia no puede pasar a preparación/lista hasta que
--    alguien la confirme (`pos_cocina_confirmar_alergia`, queda quién y cuándo).
--    Lo impone la base con un disparador: arrastrar la tarjeta o tocar el ítem
--    en el KDS tampoco se lo salta.
-- 4. Notas rápidas por organización o sucursal (`pos_quick_notes`) y las más
--    usadas calculadas de `sale_items.notes->>'extra'`.
--
-- Las funciones son SECURITY DEFINER y SOLO las ejecuta `service_role`: las
-- rutas /api/pos/cocina/* validan la organización con la sesión y pasan el
-- actor; la base vuelve a comprobar pertenencia y que cada fila sea de la
-- organización. Todo es aditivo: columnas NULL-ables o con DEFAULT.
-- ============================================================================

-- ── 1. Columnas ──────────────────────────────────────────────────────────────
alter table public.kitchen_tickets add column if not exists ticket_type text not null default 'order';
alter table public.kitchen_tickets add column if not exists adjusts_ticket_id integer null;
alter table public.kitchen_tickets add column if not exists cart_id uuid null;
alter table public.kitchen_tickets add column if not exists round_key uuid null;
alter table public.kitchen_tickets add column if not exists has_allergy boolean not null default false;
alter table public.kitchen_tickets add column if not exists allergy_ack_at timestamptz null;
alter table public.kitchen_tickets add column if not exists allergy_ack_by uuid null;

alter table public.kitchen_tickets drop constraint if exists kitchen_tickets_ticket_type_check;
alter table public.kitchen_tickets add constraint kitchen_tickets_ticket_type_check
  check (ticket_type in ('order', 'adjustment'));
alter table public.kitchen_tickets drop constraint if exists kitchen_tickets_adjusts_ticket_id_fkey;
alter table public.kitchen_tickets add constraint kitchen_tickets_adjusts_ticket_id_fkey
  foreign key (adjusts_ticket_id) references public.kitchen_tickets(id) on delete set null;

comment on column public.kitchen_tickets.ticket_type is
  'order = comanda normal; adjustment = comanda de ajuste sobre platos ya enviados (+/− unidades, nota cambiada o anulación).';
comment on column public.kitchen_tickets.adjusts_ticket_id is
  'Comanda original que ajusta una comanda de tipo adjustment.';
comment on column public.kitchen_tickets.cart_id is
  'Carrito del POS de mostrador que originó la comanda (id del carrito guardado en el navegador).';
comment on column public.kitchen_tickets.round_key is
  'Llave de idempotencia de la ronda «Enviar a cocina»: la misma ronda enviada dos veces devuelve la misma comanda.';
comment on column public.kitchen_tickets.has_allergy is
  'La comanda lleva al menos un ítem marcado como alergia: no se empieza a preparar sin confirmarla.';
comment on column public.kitchen_tickets.allergy_ack_at is 'Cuándo se confirmó la alergia en cocina.';
comment on column public.kitchen_tickets.allergy_ack_by is 'Quién confirmó la alergia en cocina (auth.users.id).';

alter table public.kitchen_ticket_items add column if not exists cart_line_id uuid null;
alter table public.kitchen_ticket_items add column if not exists is_allergy boolean not null default false;
alter table public.kitchen_ticket_items add column if not exists adjustment_kind text null;
alter table public.kitchen_ticket_items add column if not exists quantity_delta numeric null;
alter table public.kitchen_ticket_items add column if not exists adjusts_item_id integer null;
alter table public.kitchen_ticket_items add column if not exists adjustment_reason text null;
alter table public.kitchen_ticket_items add column if not exists cancelled_at timestamptz null;
alter table public.kitchen_ticket_items add column if not exists cancel_reason text null;

alter table public.kitchen_ticket_items drop constraint if exists kitchen_ticket_items_adjustment_kind_check;
alter table public.kitchen_ticket_items add constraint kitchen_ticket_items_adjustment_kind_check
  check (adjustment_kind is null or adjustment_kind in ('increase', 'decrease', 'void', 'note'));
alter table public.kitchen_ticket_items drop constraint if exists kitchen_ticket_items_adjusts_item_id_fkey;
alter table public.kitchen_ticket_items add constraint kitchen_ticket_items_adjusts_item_id_fkey
  foreign key (adjusts_item_id) references public.kitchen_ticket_items(id) on delete set null;

comment on column public.kitchen_ticket_items.cart_line_id is
  'Id estable de la línea del carrito de mostrador: lo enviado se compara por línea, no por nombre y cantidad.';
comment on column public.kitchen_ticket_items.is_allergy is 'La nota del ítem es una alergia.';
comment on column public.kitchen_ticket_items.adjustment_kind is
  'Solo en comandas de ajuste: increase (+ unidades), decrease (− unidades), void (anulación), note (nota cambiada).';
comment on column public.kitchen_ticket_items.quantity_delta is
  'Solo en ajustes: unidades con signo que suma o resta el ajuste (void = −lo enviado; note = 0).';
comment on column public.kitchen_ticket_items.adjusts_item_id is 'Ítem de comanda que ajusta este ítem.';
comment on column public.kitchen_ticket_items.adjustment_reason is 'Motivo del ajuste (obligatorio al restar o anular en mesa).';
comment on column public.kitchen_ticket_items.cancelled_at is 'Cuándo se anuló el ítem. Anular nunca borra el ítem.';
comment on column public.kitchen_ticket_items.cancel_reason is 'Motivo de la anulación del ítem.';

create unique index if not exists kitchen_tickets_round_key_uq
  on public.kitchen_tickets (organization_id, round_key, ticket_type) where round_key is not null;
create index if not exists kitchen_tickets_cart_id_idx
  on public.kitchen_tickets (organization_id, cart_id) where cart_id is not null;
create index if not exists kitchen_ticket_items_kitchen_ticket_id_idx
  on public.kitchen_ticket_items (kitchen_ticket_id);
create index if not exists kitchen_ticket_items_sale_item_id_idx
  on public.kitchen_ticket_items (sale_item_id) where sale_item_id is not null;
create index if not exists kitchen_ticket_items_cart_line_id_idx
  on public.kitchen_ticket_items (cart_line_id) where cart_line_id is not null;

-- ── 2. Alergia: no se empieza sin confirmar (lo impone la base) ──────────────
create or replace function public.fn_kitchen_ticket_alergia_guarda()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_privilegiado boolean := coalesce(auth.role(), '') = 'service_role'
                            or current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if not v_privilegiado then
    if new.allergy_ack_at is distinct from old.allergy_ack_at
       or new.allergy_ack_by is distinct from old.allergy_ack_by
       or (old.has_allergy and not new.has_allergy) then
      raise exception 'alergia_solo_por_confirmacion' using errcode = '42501';
    end if;
  end if;
  if new.has_allergy and new.allergy_ack_at is null
     and new.status in ('preparing', 'ready')
     and new.status is distinct from old.status then
    raise exception 'alergia_sin_confirmar' using errcode = 'P0001',
      hint = 'Confirme la alergia de la comanda antes de empezar a prepararla.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_kitchen_ticket_alergia_guarda on public.kitchen_tickets;
create trigger trg_kitchen_ticket_alergia_guarda
  before update on public.kitchen_tickets
  for each row execute function public.fn_kitchen_ticket_alergia_guarda();

create or replace function public.fn_kitchen_ticket_item_alergia_guarda()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status in ('in_progress', 'ready')
     and new.status is distinct from old.status
     and exists (
       select 1 from public.kitchen_tickets kt
       where kt.id = new.kitchen_ticket_id and kt.has_allergy and kt.allergy_ack_at is null
     ) then
    raise exception 'alergia_sin_confirmar' using errcode = 'P0001',
      hint = 'Confirme la alergia de la comanda antes de empezar a prepararla.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_kitchen_ticket_item_alergia_guarda on public.kitchen_ticket_items;
create trigger trg_kitchen_ticket_item_alergia_guarda
  before update of status on public.kitchen_ticket_items
  for each row execute function public.fn_kitchen_ticket_item_alergia_guarda();

-- ── 3. Estado enviado de una línea del carrito ───────────────────────────────
-- enviada   : hay ítems de comanda vivos (no anulados) de la línea.
-- sent_qty  : unidades que la cocina tiene hoy: ítems normales + deltas de los
--             ajustes +/−. Anular marca los ítems vivos de la línea como
--             cancelados, así que la línea queda en 0.
-- sent_note : la última nota comunicada (y si era alergia).
create or replace function public.fn_pos_cocina_linea_enviada(p_organization_id integer, p_cart_id uuid, p_line_id uuid)
returns table (enviada boolean, sent_qty numeric, sent_note text, sent_allergy boolean, ultimo_item integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with vivos as (
    select ki.*
    from public.kitchen_ticket_items ki
    join public.kitchen_tickets kt on kt.id = ki.kitchen_ticket_id
    where kt.organization_id = p_organization_id
      and kt.cart_id = p_cart_id
      and ki.cart_line_id = p_line_id
      and ki.cancelled_at is null
      and coalesce(ki.adjustment_kind, 'order') <> 'void'
  ),
  ultimo as (
    select v.id, v.notes, v.is_allergy from vivos v order by v.id desc limit 1
  )
  select
    exists (select 1 from vivos),
    coalesce((select sum(case when v.adjustment_kind is null then v.quantity
                              when v.adjustment_kind in ('increase', 'decrease') then v.quantity_delta
                              else 0 end) from vivos v), 0),
    (select u.notes from ultimo u),
    coalesce((select u.is_allergy from ultimo u), false),
    (select u.id from ultimo u);
$$;

create or replace function public.fn_pos_cocina_resultado_ronda(
  p_organization_id integer, p_cart_id uuid, p_round_key uuid, p_replayed boolean)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'replayed', p_replayed,
    'first_ticket_id', (
      select min(kt.id) from public.kitchen_tickets kt
      where kt.organization_id = p_organization_id and kt.cart_id = p_cart_id and kt.ticket_type = 'order'),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', kt.id,
        'ticket_type', kt.ticket_type,
        'adjusts_ticket_id', kt.adjusts_ticket_id,
        'created_at', kt.created_at,
        'has_allergy', kt.has_allergy,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ki.id,
            'cart_line_id', ki.cart_line_id,
            'product_name', ki.product_name,
            'quantity', ki.quantity,
            'quantity_delta', ki.quantity_delta,
            'adjustment_kind', ki.adjustment_kind,
            'adjustment_reason', ki.adjustment_reason,
            'notes', ki.notes,
            'is_allergy', ki.is_allergy,
            'station', ki.station,
            'variant_data', ki.variant_data,
            'modifiers', ki.modifiers) order by ki.id)
          from public.kitchen_ticket_items ki where ki.kitchen_ticket_id = kt.id), '[]'::jsonb)
      ) order by kt.id)
      from public.kitchen_tickets kt
      where kt.organization_id = p_organization_id and kt.round_key = p_round_key), '[]'::jsonb),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'line_id', l.line_id, 'sent_qty', e.sent_qty, 'sent_note', e.sent_note, 'sent_allergy', e.sent_allergy))
      from (
        select distinct ki.cart_line_id as line_id
        from public.kitchen_ticket_items ki
        join public.kitchen_tickets kt on kt.id = ki.kitchen_ticket_id
        where kt.organization_id = p_organization_id and kt.cart_id = p_cart_id and ki.cart_line_id is not null
      ) l
      cross join lateral public.fn_pos_cocina_linea_enviada(p_organization_id, p_cart_id, l.line_id) e), '[]'::jsonb)
  );
$$;

-- ── 4. «Enviar a cocina» del mostrador: una ronda, una transacción ───────────
-- p_payload = { cart_id, branch_id, round_key, server_name?, void_reason?,
--               legacy_ticket_id?, lines: [{ line_id, product_name, quantity,
--               station?, notes?, is_allergy?, variant_data?, modifiers? }] }
-- `lines` son las líneas del carrito que requieren preparación, TODAS (no solo
-- las nuevas): la base decide qué es nuevo, qué cambió y qué se quitó.
create or replace function public.pos_cocina_enviar_ronda(p_organization_id integer, p_actor uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cart_id      uuid;
  v_round        uuid;
  v_branch       integer;
  v_server       text;
  v_void_reason  text;
  v_legacy       integer;
  v_lines        jsonb;
  v_line         jsonb;
  v_line_id      uuid;
  v_qty          numeric;
  v_note         text;
  v_allergy      boolean;
  v_ids          uuid[] := '{}';
  v_asignadas    uuid[] := '{}';
  v_prev         record;
  v_orig         record;
  v_order_items  jsonb := '[]'::jsonb;
  v_adj_items    jsonb := '[]'::jsonb;
  v_void_ids     uuid[] := '{}';
  v_first_ticket integer;
  v_ticket       integer;
  r              record;
begin
  if p_actor is null or not exists (
    select 1 from public.organization_members om
    where om.user_id = p_actor and om.organization_id = p_organization_id and om.is_active
  ) then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;

  begin
    v_cart_id := nullif(p_payload->>'cart_id', '')::uuid;
    v_round := nullif(p_payload->>'round_key', '')::uuid;
    v_branch := nullif(p_payload->>'branch_id', '')::integer;
    v_legacy := nullif(p_payload->>'legacy_ticket_id', '')::integer;
  exception when others then
    raise exception 'datos_invalidos' using errcode = '22023';
  end;
  if v_cart_id is null or v_round is null or v_branch is null then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_organization_id) then
    raise exception 'sucursal_de_otra_organizacion' using errcode = '42501';
  end if;
  v_lines := coalesce(p_payload->'lines', '[]'::jsonb);
  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) > 200 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  v_server := left(nullif(btrim(coalesce(p_payload->>'server_name', '')), ''), 120);
  v_void_reason := left(nullif(btrim(coalesce(p_payload->>'void_reason', '')), ''), 500);

  -- Una ronda a la vez por carrito (dos pestañas o doble clic).
  perform pg_advisory_xact_lock(hashtextextended('pos_cocina_carrito:' || v_cart_id::text, 0));

  -- Idempotencia: la misma ronda ya se procesó → mismo resultado.
  if exists (select 1 from public.kitchen_tickets kt where kt.organization_id = p_organization_id and kt.round_key = v_round) then
    if exists (select 1 from public.kitchen_tickets kt
               where kt.organization_id = p_organization_id and kt.round_key = v_round
                 and kt.cart_id is distinct from v_cart_id) then
      raise exception 'ronda_de_otro_carrito' using errcode = '22023';
    end if;
    return public.fn_pos_cocina_resultado_ronda(p_organization_id, v_cart_id, v_round, true);
  end if;

  -- Validación de líneas.
  for v_line in select value from jsonb_array_elements(v_lines) loop
    begin
      v_line_id := nullif(v_line->>'line_id', '')::uuid;
      v_qty := coalesce(nullif(v_line->>'quantity', '')::numeric, 0);
    exception when others then
      raise exception 'linea_invalida' using errcode = '22023';
    end;
    if v_line_id is null or v_qty <= 0 or v_qty > 10000
       or nullif(btrim(coalesce(v_line->>'product_name', '')), '') is null then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;
    if v_line_id = any(v_ids) then
      raise exception 'linea_duplicada' using errcode = '22023';
    end if;
    v_ids := v_ids || v_line_id;
  end loop;

  -- Carrito enviado antes de esta versión (comanda sin cart_id): se adopta y
  -- sus ítems se asignan a las líneas por nombre, una vez, para no reenviarlos.
  if v_legacy is not null then
    update public.kitchen_tickets kt set cart_id = v_cart_id, updated_at = now()
    where kt.id = v_legacy and kt.organization_id = p_organization_id
      and kt.cart_id is null and kt.table_session_id is null and kt.source = 'pos';
    if found then
      for r in
        select ki.id, ki.product_name from public.kitchen_ticket_items ki
        where ki.kitchen_ticket_id = v_legacy and ki.cart_line_id is null
        order by ki.id
      loop
        select (l.value->>'line_id')::uuid into v_line_id
        from jsonb_array_elements(v_lines) with ordinality as l(value, ord)
        where btrim(l.value->>'product_name') = btrim(coalesce(r.product_name, ''))
          and not ((l.value->>'line_id')::uuid = any(v_asignadas))
        order by l.ord
        limit 1;
        if found and v_line_id is not null then
          update public.kitchen_ticket_items set cart_line_id = v_line_id, updated_at = now() where id = r.id;
          v_asignadas := v_asignadas || v_line_id;
        end if;
      end loop;
    end if;
  end if;

  -- Qué es nuevo y qué cambió, por línea.
  for v_line in select value from jsonb_array_elements(v_lines) loop
    v_line_id := (v_line->>'line_id')::uuid;
    v_qty := (v_line->>'quantity')::numeric;
    v_note := left(nullif(btrim(coalesce(v_line->>'notes', '')), ''), 140);
    v_allergy := coalesce((v_line->>'is_allergy')::boolean, false) and v_note is not null;
    select * into v_prev from public.fn_pos_cocina_linea_enviada(p_organization_id, v_cart_id, v_line_id);

    if not v_prev.enviada then
      v_order_items := v_order_items || jsonb_build_object(
        'line_id', v_line_id, 'product_name', left(btrim(v_line->>'product_name'), 255), 'quantity', v_qty,
        'notes', v_note, 'is_allergy', v_allergy, 'station', nullif(v_line->>'station', ''),
        'variant_data', case when jsonb_typeof(v_line->'variant_data') = 'object' then v_line->'variant_data' end,
        'modifiers', case when jsonb_typeof(v_line->'modifiers') = 'array' then v_line->'modifiers' end);
    else
      if v_qty <> v_prev.sent_qty then
        v_adj_items := v_adj_items || jsonb_build_object(
          'kind', case when v_qty > v_prev.sent_qty then 'increase' else 'decrease' end,
          'delta', v_qty - v_prev.sent_qty, 'quantity', abs(v_qty - v_prev.sent_qty),
          'line_id', v_line_id, 'product_name', left(btrim(v_line->>'product_name'), 255),
          'notes', v_note, 'is_allergy', v_allergy, 'station', nullif(v_line->>'station', ''),
          'variant_data', case when jsonb_typeof(v_line->'variant_data') = 'object' then v_line->'variant_data' end,
          'modifiers', case when jsonb_typeof(v_line->'modifiers') = 'array' then v_line->'modifiers' end,
          'adjusts_item_id', v_prev.ultimo_item,
          'reason', case when v_qty < v_prev.sent_qty then v_void_reason end);
      end if;
      if v_note is distinct from v_prev.sent_note or v_allergy is distinct from v_prev.sent_allergy then
        v_adj_items := v_adj_items || jsonb_build_object(
          'kind', 'note', 'delta', 0, 'quantity', v_qty,
          'line_id', v_line_id, 'product_name', left(btrim(v_line->>'product_name'), 255),
          'notes', v_note, 'is_allergy', v_allergy, 'station', nullif(v_line->>'station', ''),
          'variant_data', case when jsonb_typeof(v_line->'variant_data') = 'object' then v_line->'variant_data' end,
          'modifiers', case when jsonb_typeof(v_line->'modifiers') = 'array' then v_line->'modifiers' end,
          'adjusts_item_id', v_prev.ultimo_item, 'reason', null);
      end if;
    end if;
  end loop;

  -- Líneas enviadas que ya no están en el carrito → anulación.
  for r in
    select distinct ki.cart_line_id as line_id
    from public.kitchen_ticket_items ki
    join public.kitchen_tickets kt on kt.id = ki.kitchen_ticket_id
    where kt.organization_id = p_organization_id and kt.cart_id = v_cart_id
      and ki.cart_line_id is not null and ki.cancelled_at is null
      and not (ki.cart_line_id = any(v_ids))
  loop
    select * into v_prev from public.fn_pos_cocina_linea_enviada(p_organization_id, v_cart_id, r.line_id);
    if v_prev.enviada and v_prev.sent_qty > 0 then
      select ki.product_name, ki.station, ki.variant_data, ki.modifiers into v_orig
      from public.kitchen_ticket_items ki where ki.id = v_prev.ultimo_item;
      v_adj_items := v_adj_items || jsonb_build_object(
        'kind', 'void', 'delta', -v_prev.sent_qty, 'quantity', v_prev.sent_qty,
        'line_id', r.line_id, 'product_name', coalesce(v_orig.product_name, 'Producto'),
        'notes', v_prev.sent_note, 'is_allergy', v_prev.sent_allergy, 'station', v_orig.station,
        'variant_data', v_orig.variant_data, 'modifiers', v_orig.modifiers,
        'adjusts_item_id', v_prev.ultimo_item,
        'reason', coalesce(v_void_reason, 'Retirado del carrito'));
      v_void_ids := v_void_ids || r.line_id;
    end if;
  end loop;

  select min(kt.id) into v_first_ticket
  from public.kitchen_tickets kt
  where kt.organization_id = p_organization_id and kt.cart_id = v_cart_id and kt.ticket_type = 'order';

  if jsonb_array_length(v_order_items) > 0 then
    insert into public.kitchen_tickets (
      organization_id, branch_id, status, priority, source, server_name,
      cart_id, round_key, ticket_type, has_allergy
    ) values (
      p_organization_id, v_branch, 'new', 0, 'pos', v_server,
      v_cart_id, v_round, 'order',
      exists (select 1 from jsonb_array_elements(v_order_items) i where (i.value->>'is_allergy')::boolean)
    ) returning id into v_ticket;

    insert into public.kitchen_ticket_items (
      organization_id, kitchen_ticket_id, sale_item_id, station, notes, status,
      product_name, quantity, variant_data, modifiers, cart_line_id, is_allergy
    )
    select p_organization_id, v_ticket, null, i.value->>'station', i.value->>'notes', 'pending',
           i.value->>'product_name', (i.value->>'quantity')::numeric,
           case when jsonb_typeof(i.value->'variant_data') = 'object' then i.value->'variant_data' end,
           case when jsonb_typeof(i.value->'modifiers') = 'array' then i.value->'modifiers' end,
           (i.value->>'line_id')::uuid, coalesce((i.value->>'is_allergy')::boolean, false)
    from jsonb_array_elements(v_order_items) with ordinality as i(value, ord)
    order by i.ord;

    v_first_ticket := coalesce(v_first_ticket, v_ticket);
  end if;

  if jsonb_array_length(v_adj_items) > 0 then
    if array_length(v_void_ids, 1) > 0 then
      update public.kitchen_ticket_items ki
      set status = 'cancelled', cancelled_at = now(),
          cancel_reason = coalesce(v_void_reason, 'Retirado del carrito'), updated_at = now()
      from public.kitchen_tickets kt
      where kt.id = ki.kitchen_ticket_id and kt.organization_id = p_organization_id
        and kt.cart_id = v_cart_id and ki.cart_line_id = any(v_void_ids) and ki.cancelled_at is null;
    end if;

    insert into public.kitchen_tickets (
      organization_id, branch_id, status, priority, source, server_name,
      cart_id, round_key, ticket_type, adjusts_ticket_id, has_allergy
    ) values (
      p_organization_id, v_branch, 'new', 0, 'pos', v_server,
      v_cart_id, v_round, 'adjustment', v_first_ticket,
      exists (select 1 from jsonb_array_elements(v_adj_items) i
              where (i.value->>'is_allergy')::boolean and i.value->>'kind' <> 'void')
    ) returning id into v_ticket;

    insert into public.kitchen_ticket_items (
      organization_id, kitchen_ticket_id, sale_item_id, station, notes, status,
      product_name, quantity, variant_data, modifiers, cart_line_id, is_allergy,
      adjustment_kind, quantity_delta, adjusts_item_id, adjustment_reason
    )
    select p_organization_id, v_ticket, null, i.value->>'station', i.value->>'notes', 'pending',
           i.value->>'product_name', (i.value->>'quantity')::numeric,
           case when jsonb_typeof(i.value->'variant_data') = 'object' then i.value->'variant_data' end,
           case when jsonb_typeof(i.value->'modifiers') = 'array' then i.value->'modifiers' end,
           (i.value->>'line_id')::uuid, coalesce((i.value->>'is_allergy')::boolean, false),
           i.value->>'kind', (i.value->>'delta')::numeric, nullif(i.value->>'adjusts_item_id', '')::integer,
           i.value->>'reason'
    from jsonb_array_elements(v_adj_items) with ordinality as i(value, ord)
    order by i.ord;
  end if;

  return public.fn_pos_cocina_resultado_ronda(p_organization_id, v_cart_id, v_round, false);
end;
$$;

comment on function public.pos_cocina_enviar_ronda(integer, uuid, jsonb) is
  'Enviar a cocina del POS de mostrador: compara el carrito con lo ya enviado por línea (cart_line_id) y crea la comanda de lo nuevo y la de ajuste de lo cambiado o quitado, en una transacción. Idempotente por round_key. Solo service_role.';

-- ── 5. Mesa: cambiar la cantidad o anular un plato (con ajuste si ya se envió)
-- Reemplaza la escritura directa de PedidosService.actualizarCantidadItem y
-- eliminarItem. Misma fórmula de la línea que ellos: impuesto por unidad ×
-- cantidad nueva y total = precio × cantidad + impuesto. El total de la venta
-- lo sigue recalculando PedidosService.recalcularTotalVenta después.
create or replace function public.pos_cocina_ajustar_linea_mesa(
  p_organization_id integer, p_actor uuid, p_sale_item_id uuid, p_nueva_cantidad numeric, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_si         public.sale_items%rowtype;
  v_sale       public.sales%rowtype;
  v_motivo     text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
  v_actual     numeric;
  v_delta      numeric;
  v_enviada    boolean;
  v_entregada  boolean;
  v_nombre     text;
  v_mods       jsonb;
  v_variant    jsonb;
  v_orig_kt    public.kitchen_tickets%rowtype;
  v_ultimo     record;
  v_kind       text;
  v_adj        integer;
  v_tax_unit   numeric;
  v_tax        numeric;
  v_accion     text;
begin
  if p_actor is null or not exists (
    select 1 from public.organization_members om
    where om.user_id = p_actor and om.organization_id = p_organization_id and om.is_active
  ) then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;
  if p_nueva_cantidad is null or p_nueva_cantidad < 0 or p_nueva_cantidad > 10000 then
    raise exception 'cantidad_invalida' using errcode = '22023';
  end if;

  select si.* into v_si from public.sale_items si where si.id = p_sale_item_id for update;
  if not found then
    raise exception 'linea_no_encontrada' using errcode = 'P0002';
  end if;
  select s.* into v_sale from public.sales s
  where s.id = v_si.sale_id and s.organization_id = p_organization_id for update;
  if not found then
    raise exception 'linea_de_otra_organizacion' using errcode = '42501';
  end if;

  v_actual := v_si.quantity;
  if p_nueva_cantidad = v_actual then
    return jsonb_build_object('accion', 'sin_cambio', 'sale_id', v_sale.id);
  end if;
  v_delta := p_nueva_cantidad - v_actual;

  select p.name, p.variant_data into v_nombre, v_variant from public.products p where p.id = v_si.product_id;
  v_nombre := coalesce(v_nombre, v_si.notes->>'product_name', 'Producto');
  v_mods := case when jsonb_typeof(v_si.notes->'modifiers') = 'array' then v_si.notes->'modifiers' end;

  v_enviada := exists (
    select 1 from public.kitchen_ticket_items ki
    where ki.sale_item_id = v_si.id and ki.cancelled_at is null and ki.status <> 'cancelled');
  v_entregada := v_enviada and not exists (
    select 1 from public.kitchen_ticket_items ki
    where ki.sale_item_id = v_si.id and ki.cancelled_at is null and ki.status not in ('delivered', 'cancelled'));

  if v_enviada and v_delta < 0 and v_motivo is null then
    raise exception 'motivo_requerido' using errcode = '22023';
  end if;

  if v_enviada then
    -- La comanda original deja de leer nombre y cantidad por join (N11).
    update public.kitchen_ticket_items ki
    set product_name = v_nombre, quantity = v_actual,
        modifiers = coalesce(ki.modifiers, v_mods), variant_data = coalesce(ki.variant_data, v_variant),
        updated_at = now()
    where ki.sale_item_id = v_si.id and ki.product_name is null and ki.adjustment_kind is null;

    select kt.* into v_orig_kt
    from public.kitchen_tickets kt
    where kt.organization_id = p_organization_id
      and kt.id in (select ki.kitchen_ticket_id from public.kitchen_ticket_items ki where ki.sale_item_id = v_si.id)
    order by (kt.ticket_type = 'order') desc, kt.id desc
    limit 1;

    select ki.id, ki.station, ki.notes, ki.is_allergy into v_ultimo
    from public.kitchen_ticket_items ki
    where ki.sale_item_id = v_si.id and ki.cancelled_at is null
    order by ki.id desc limit 1;

    -- Sumar siempre avisa (hay que cocinar más); restar o anular solo si la
    -- cocina aún tiene algo sin entregar.
    if v_delta > 0 or not v_entregada then
      v_kind := case when p_nueva_cantidad = 0 then 'void' when v_delta > 0 then 'increase' else 'decrease' end;
      insert into public.kitchen_tickets (
        organization_id, branch_id, status, priority, source, table_session_id, sale_id,
        server_name, ticket_type, adjusts_ticket_id, has_allergy
      ) values (
        p_organization_id, v_orig_kt.branch_id, 'new', 0, coalesce(v_orig_kt.source, 'mesas'),
        v_orig_kt.table_session_id, v_orig_kt.sale_id, v_orig_kt.server_name, 'adjustment', v_orig_kt.id,
        coalesce(v_ultimo.is_allergy, false) and v_kind <> 'void'
      ) returning id into v_adj;

      insert into public.kitchen_ticket_items (
        organization_id, kitchen_ticket_id, sale_item_id, station, notes, status,
        product_name, quantity, variant_data, modifiers, is_allergy,
        adjustment_kind, quantity_delta, adjusts_item_id, adjustment_reason
      ) values (
        p_organization_id, v_adj, case when p_nueva_cantidad = 0 then null else v_si.id end,
        v_ultimo.station, v_ultimo.notes, 'pending',
        v_nombre, abs(v_delta), v_variant, v_mods, coalesce(v_ultimo.is_allergy, false),
        v_kind, v_delta, v_ultimo.id, v_motivo
      );
    end if;

    if p_nueva_cantidad = 0 then
      update public.kitchen_ticket_items ki
      set status = 'cancelled', cancelled_at = now(), cancel_reason = v_motivo, updated_at = now()
      where ki.sale_item_id = v_si.id and ki.cancelled_at is null and ki.status not in ('delivered', 'cancelled');
    end if;
  end if;

  if p_nueva_cantidad = 0 then
    -- La comanda conserva su copia; la línea sale de la cuenta.
    update public.kitchen_ticket_items set sale_item_id = null, updated_at = now() where sale_item_id = v_si.id;
    insert into public.ops_audit_log (
      organization_id, branch_id, user_id, entity_type, entity_id, action, previous_data, metadata
    ) values (
      p_organization_id, v_sale.branch_id, p_actor, 'sale_items', v_si.id::text, 'DELETE',
      jsonb_build_object('sale_id', v_si.sale_id, 'product_id', v_si.product_id, 'product_name', v_nombre,
                         'quantity', v_si.quantity, 'unit_price', v_si.unit_price, 'total', v_si.total,
                         'notes', v_si.notes),
      jsonb_build_object('table_session_id', v_sale.table_session_id, 'motivo', v_motivo,
                         'enviado_a_cocina', v_enviada, 'comanda_ajuste_id', v_adj)
    );
    delete from public.sale_items where id = v_si.id;
    v_accion := 'anulada';
  else
    v_tax_unit := coalesce(v_si.tax_amount, 0) / coalesce(nullif(v_si.quantity, 0), 1);
    v_tax := round(v_tax_unit * p_nueva_cantidad, 2);
    update public.sale_items
    set quantity = p_nueva_cantidad,
        total = v_si.unit_price * p_nueva_cantidad + v_tax,
        tax_amount = v_tax,
        updated_at = now()
    where id = v_si.id;
    if v_enviada then
      insert into public.ops_audit_log (
        organization_id, branch_id, user_id, entity_type, entity_id, action,
        previous_data, new_data, changed_fields, metadata
      ) values (
        p_organization_id, v_sale.branch_id, p_actor, 'sale_items', v_si.id::text, 'UPDATE',
        jsonb_build_object('quantity', v_actual), jsonb_build_object('quantity', p_nueva_cantidad), array['quantity'],
        jsonb_build_object('table_session_id', v_sale.table_session_id, 'motivo', v_motivo,
                           'enviado_a_cocina', true, 'comanda_ajuste_id', v_adj)
      );
    end if;
    v_accion := 'cantidad';
  end if;

  return jsonb_build_object(
    'accion', v_accion, 'sale_id', v_sale.id, 'enviado', v_enviada, 'ajuste_ticket_id', v_adj,
    'cantidad_anterior', v_actual, 'cantidad_nueva', p_nueva_cantidad);
end;
$$;

comment on function public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text) is
  'Mesa: cambia la cantidad de una línea o la anula (cantidad 0). Si el plato ya se envió a cocina crea una comanda de ajuste y, al anular, marca los ítems vivos como cancelados con motivo (obligatorio al restar o anular). Una transacción. Solo service_role.';

-- ── 6. Confirmar la alergia de una comanda ───────────────────────────────────
create or replace function public.pos_cocina_confirmar_alergia(p_organization_id integer, p_actor uuid, p_ticket_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kt public.kitchen_tickets%rowtype;
begin
  if p_actor is null or not exists (
    select 1 from public.organization_members om
    where om.user_id = p_actor and om.organization_id = p_organization_id and om.is_active
  ) then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;
  select kt.* into v_kt from public.kitchen_tickets kt
  where kt.id = p_ticket_id and kt.organization_id = p_organization_id for update;
  if not found then
    raise exception 'comanda_no_encontrada' using errcode = 'P0002';
  end if;
  if v_kt.has_allergy and v_kt.allergy_ack_at is null then
    update public.kitchen_tickets
    set allergy_ack_at = now(), allergy_ack_by = p_actor, updated_at = now()
    where id = v_kt.id
    returning * into v_kt;
  end if;
  return jsonb_build_object(
    'ticket_id', v_kt.id, 'has_allergy', v_kt.has_allergy,
    'allergy_ack_at', v_kt.allergy_ack_at, 'allergy_ack_by', v_kt.allergy_ack_by);
end;
$$;

comment on function public.pos_cocina_confirmar_alergia(integer, uuid, integer) is
  'Cocina confirma la alergia de una comanda (queda quién y cuándo); hasta entonces no puede pasar a preparación. Idempotente. Solo service_role.';

-- ── 7. Notas rápidas ─────────────────────────────────────────────────────────
create table if not exists public.pos_quick_notes (
  id             bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id      integer null references public.branches(id) on delete cascade,
  label          text not null,
  kind           text not null default 'kitchen',
  display_order  integer not null default 0,
  is_active      boolean not null default true,
  created_by     uuid null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint pos_quick_notes_label_check check (char_length(btrim(label)) between 1 and 140),
  constraint pos_quick_notes_kind_check check (kind in ('kitchen', 'customer', 'allergy'))
);

comment on table public.pos_quick_notes is
  'Notas rápidas del POS (chips del editor de nota de la línea), por organización o por sucursal. Se escriben por /api/pos/notas-rapidas con permiso; los miembros solo las leen.';
comment on column public.pos_quick_notes.branch_id is 'NULL = para toda la organización.';
comment on column public.pos_quick_notes.kind is 'kitchen = nota para cocina; customer = nota para el cliente (ticket y factura); allergy = alergia.';

create unique index if not exists pos_quick_notes_label_uq
  on public.pos_quick_notes (organization_id, coalesce(branch_id, 0), lower(btrim(label)), kind);
create index if not exists pos_quick_notes_org_idx
  on public.pos_quick_notes (organization_id, branch_id) where is_active;

alter table public.pos_quick_notes enable row level security;
drop policy if exists pos_quick_notes_select_miembros on public.pos_quick_notes;
create policy pos_quick_notes_select_miembros on public.pos_quick_notes
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active));
revoke all on public.pos_quick_notes from anon;

-- Las más usadas: notas de cocina de las ventas de los últimos 180 días.
create or replace function public.pos_notas_rapidas_sugeridas(p_organization_id integer, p_branch_id integer, p_limite integer)
returns table (texto text, usos bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select min(btrim(si.notes->>'extra')) as texto, count(*) as usos
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.organization_id = p_organization_id
    and (p_branch_id is null or s.branch_id = p_branch_id)
    and s.created_at >= now() - interval '180 days'
    and jsonb_typeof(si.notes) = 'object'
    and char_length(btrim(coalesce(si.notes->>'extra', ''))) between 2 and 140
    and position('<' in si.notes->>'extra') = 0
  group by lower(btrim(si.notes->>'extra'))
  having count(*) >= 2
  order by count(*) desc, min(btrim(si.notes->>'extra'))
  limit greatest(1, least(coalesce(p_limite, 8), 20));
$$;

comment on function public.pos_notas_rapidas_sugeridas(integer, integer, integer) is
  'Notas de cocina más usadas en las ventas de la organización (o de la sucursal) en los últimos 180 días, para sugerirlas como notas rápidas. Solo service_role.';

-- ── 8. Solo service_role ─────────────────────────────────────────────────────
revoke all on function public.fn_pos_cocina_linea_enviada(integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_pos_cocina_resultado_ronda(integer, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.pos_cocina_enviar_ronda(integer, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.pos_cocina_confirmar_alergia(integer, uuid, integer) from public, anon, authenticated;
revoke all on function public.pos_notas_rapidas_sugeridas(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.fn_pos_cocina_linea_enviada(integer, uuid, uuid) to service_role;
grant execute on function public.fn_pos_cocina_resultado_ronda(integer, uuid, uuid, boolean) to service_role;
grant execute on function public.pos_cocina_enviar_ronda(integer, uuid, jsonb) to service_role;
grant execute on function public.pos_cocina_ajustar_linea_mesa(integer, uuid, uuid, numeric, text) to service_role;
grant execute on function public.pos_cocina_confirmar_alergia(integer, uuid, integer) to service_role;
grant execute on function public.pos_notas_rapidas_sugeridas(integer, integer, integer) to service_role;
