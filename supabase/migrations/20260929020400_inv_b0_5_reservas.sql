-- Inventario B0 · 5/7 — Reservas de stock en SQL, registradas por documento
-- docs/implementacion/INVENTARIO-PLAN.md §5.1 (migración 7).
--
-- Antes: la tienda web reservaba por SQL (reserve_stock_for_web_order, sin
-- expandir recetas) y el ERP (pedidos web creados en el panel y oportunidades de
-- CRM) reservaba desde el NAVEGADOR leyendo y escribiendo stock_levels sin
-- bloqueo (stockMovementService.reserveStock/releaseStockReservation). Nadie
-- sabía qué reservó cada pedido: liberar restaba lo que el pedido decía «ahora»,
-- y 619 de 622 filas con reserva no tienen hoy un pedido pendiente que las explique.
--
-- Ahora:
--   · stock_reservations: una fila por (documento, producto, sucursal) reservado.
--     Solo lectura para los miembros; escriben las funciones de abajo.
--   · fn_inv_int_reservar / fn_inv_int_liberar: expanden la receta con el
--     resolutor único (fn_receta_int_expandir), bloquean las filas en orden de
--     producto (sin deadlocks) y liberan EXACTAMENTE lo que se reservó. Las
--     reservas anteriores a esta migración (sin registro) se liberan como antes.
--   · reserve_stock_for_web_order / release_stock_for_order (tienda web y cron de
--     expiración) conservan firma y respuesta; release ahora exige pertenencia
--     (antes cualquier sesión podía liberar el pedido de otra organización).
--   · fn_stock_reservar / fn_stock_liberar_reserva: RPC de la fachada TS
--     (stockMovementService) para pedidos del panel y oportunidades de CRM. Como
--     hoy, reservan aunque no haya disponible (no bloquean la venta, P5).
--   · fn_inv_reversion_entrada: camino temporal para 'folio_item_reversal' (borrar
--     un consumo del folio del PMS). Antes entraba por incrementOnPurchase con el
--     PRECIO DE VENTA como costo (corrompía avg_cost); ahora entra al costo con que
--     salió. B9 lo sustituye por fn_stock_entrada_devolucion desde el PMS.
--
-- Las 619 reservas huérfanas (D8, P10) se liberan en B10, no aquí.

-- ── Registro de reservas ─────────────────────────────────────────────────────
create table if not exists public.stock_reservations (
  id bigserial primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer not null references public.branches(id) on delete cascade,
  product_id integer not null references public.products(id) on delete cascade,
  qty numeric not null check (qty > 0),
  ref_type text not null check (ref_type in ('web_order', 'opportunity', 'otro')),
  ref_id text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  released_at timestamptz,
  release_reason text
);

create index if not exists idx_stock_reservations_ref_activa
  on public.stock_reservations (organization_id, ref_id) where released_at is null;
create index if not exists idx_stock_reservations_producto
  on public.stock_reservations (product_id, branch_id) where released_at is null;

comment on table public.stock_reservations is
  'Qué reservó cada documento (pedido web, oportunidad CRM). La escriben fn_inv_int_reservar/fn_inv_int_liberar; stock_levels.qty_reserved es su suma activa.';

alter table public.stock_reservations enable row level security;
drop policy if exists stock_reservations_select on public.stock_reservations;
create policy stock_reservations_select on public.stock_reservations
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));
revoke all on table public.stock_reservations from anon;
revoke insert, update, delete, truncate on table public.stock_reservations from authenticated;
grant select on table public.stock_reservations to authenticated;
revoke all on sequence public.stock_reservations_id_seq from anon, authenticated;

-- ── Expansión común (receta → productos con inventario, agregados) ──────────
create or replace function public.fn_inv_int_expandir_items(p_org integer, p_items jsonb)
returns table (product_id integer, qty numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select e.product_id, sum(e.qty)::numeric
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
    cross join lateral public.fn_receta_int_expandir(
      p_org, nullif(i->>'product_id', '')::integer,
      coalesce(nullif(i->>'quantity', '')::numeric, nullif(i->>'qty', '')::numeric, 0), false) e
   where nullif(i->>'product_id', '') is not null
     and coalesce(nullif(i->>'quantity', '')::numeric, nullif(i->>'qty', '')::numeric, 0) > 0
     and exists (select 1 from public.products p
                  where p.id = nullif(i->>'product_id', '')::integer and p.organization_id = p_org)
     and e.track_stock
     and e.qty > 0
   group by e.product_id;
end;
$$;

-- ── Reservar ─────────────────────────────────────────────────────────────────
create or replace function public.fn_inv_int_reservar(
  p_org integer, p_branch integer, p_ref_type text, p_ref_id text, p_items jsonb, p_exigir_disponible boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_e record;
  v_sl public.stock_levels;
  v_faltan jsonb := '[]'::jsonb;
  v_reservas jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  if p_ref_id is null or btrim(p_ref_id) = '' then
    raise exception 'referencia_requerida' using errcode = '22023';
  end if;

  -- Un documento reserva una sola vez.
  perform pg_advisory_xact_lock(hashtextextended('reserva:' || p_org || ':' || p_ref_id, 0));
  if exists (select 1 from public.stock_reservations r
              where r.organization_id = p_org and r.ref_id = p_ref_id and r.released_at is null) then
    return jsonb_build_object('ok', true, 'ya_reservado', true);
  end if;

  -- 1) Bloquear en orden de producto y comprobar disponible.
  for v_e in select x.product_id, x.qty from public.fn_inv_int_expandir_items(p_org, p_items) x order by x.product_id loop
    v_sl := public.fn_inv_int_fila(v_e.product_id, p_branch, null, 0);
    if coalesce(v_sl.qty_on_hand, 0) - coalesce(v_sl.qty_reserved, 0) < v_e.qty then
      v_faltan := v_faltan || jsonb_build_object('product_id', v_e.product_id,
        'available', coalesce(v_sl.qty_on_hand, 0) - coalesce(v_sl.qty_reserved, 0), 'requested', v_e.qty);
    end if;
  end loop;

  -- 2) Todo o nada si se exige disponible (tienda web).
  if p_exigir_disponible and jsonb_array_length(v_faltan) > 0 then
    return jsonb_build_object('ok', false, 'shortages', v_faltan);
  end if;

  -- 3) Reservar y registrar.
  for v_e in select x.product_id, x.qty from public.fn_inv_int_expandir_items(p_org, p_items) x order by x.product_id loop
    update public.stock_levels
       set qty_reserved = coalesce(qty_reserved, 0) + v_e.qty, updated_at = now()
     where product_id = v_e.product_id and branch_id = p_branch and lot_id is null;
    insert into public.stock_reservations (organization_id, branch_id, product_id, qty, ref_type, ref_id)
    values (p_org, p_branch, v_e.product_id, v_e.qty, p_ref_type, p_ref_id);
    v_reservas := v_reservas || jsonb_build_object('product_id', v_e.product_id, 'qty', v_e.qty);
  end loop;

  return jsonb_build_object('ok', true, 'reservas', v_reservas, 'sin_disponible', v_faltan);
end;
$$;

-- ── Liberar ──────────────────────────────────────────────────────────────────
create or replace function public.fn_inv_int_liberar(
  p_org integer, p_ref_id text, p_motivo text,
  p_branch_legado integer default null, p_items_legado jsonb default null, p_expandir_legado boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_r record;
  v_e record;
  v_n integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('reserva:' || p_org || ':' || p_ref_id, 0));

  for v_r in
    select r.id, r.branch_id, r.product_id, r.qty
      from public.stock_reservations r
     where r.organization_id = p_org and r.ref_id = p_ref_id and r.released_at is null
     order by r.product_id, r.id
     for update
  loop
    perform public.fn_inv_int_fila(v_r.product_id, v_r.branch_id, null, 0);
    update public.stock_levels
       set qty_reserved = greatest(0, coalesce(qty_reserved, 0) - v_r.qty), updated_at = now()
     where product_id = v_r.product_id and branch_id = v_r.branch_id and lot_id is null;
    update public.stock_reservations
       set released_at = now(), release_reason = p_motivo
     where id = v_r.id;
    v_n := v_n + 1;
  end loop;

  -- Reservas anteriores al registro (el documento no tiene NINGUNA fila, ni activa
  -- ni liberada): se liberan como se liberaban, por lo que diga el documento.
  if v_n = 0 and p_branch_legado is not null and p_items_legado is not null
     and not exists (select 1 from public.stock_reservations r
                      where r.organization_id = p_org and r.ref_id = p_ref_id) then
    if p_expandir_legado then
      for v_e in select x.product_id, x.qty from public.fn_inv_int_expandir_items(p_org, p_items_legado) x order by x.product_id loop
        update public.stock_levels
           set qty_reserved = greatest(0, coalesce(qty_reserved, 0) - v_e.qty), updated_at = now()
         where product_id = v_e.product_id and branch_id = p_branch_legado and lot_id is null;
        v_n := v_n + 1;
      end loop;
    else
      for v_e in
        select (i->>'product_id')::integer as product_id, sum(coalesce(nullif(i->>'quantity', '')::numeric, 0)) as qty
          from jsonb_array_elements(p_items_legado) i
         where nullif(i->>'product_id', '') is not null
         group by 1 order by 1
      loop
        update public.stock_levels
           set qty_reserved = greatest(0, coalesce(qty_reserved, 0) - v_e.qty), updated_at = now()
         where product_id = v_e.product_id and branch_id = p_branch_legado and lot_id is null;
        v_n := v_n + 1;
      end loop;
    end if;
  end if;

  update public.web_orders
     set stock_released_at = now()
   where id::text = p_ref_id and organization_id = p_org and stock_released_at is null;

  return jsonb_build_object('ok', true, 'items_released', v_n);
end;
$$;

-- ── Tienda web (misma firma y respuesta) ─────────────────────────────────────
create or replace function public.reserve_stock_for_web_order(
  p_organization_id integer, p_branch_id integer, p_order_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.fn_assert_acceso_org(p_organization_id::integer);
  if exists (select 1 from public.web_orders w where w.id = p_order_id and w.organization_id <> p_organization_id) then
    raise exception 'PEDIDO_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  -- Núcleo B0: expande receta, bloquea en orden y registra lo reservado por pedido.
  return public.fn_inv_int_reservar(p_organization_id, p_branch_id, 'web_order', p_order_id::text, p_items, true);
end;
$function$;

create or replace function public.release_stock_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_order record;
  v_items jsonb;
  v_r jsonb;
begin
  -- 1) Bloquear la fila del pedido para evitar concurrencia
  select id, organization_id, branch_id, status, stock_released_at
    into v_order
    from public.web_orders
   where id = p_order_id
   for update;

  if v_order is null then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;
  perform public.fn_assert_acceso_org(v_order.organization_id);

  -- 2) Idempotencia: si ya se liberó el stock, no hacer nada
  if v_order.stock_released_at is not null then
    return jsonb_build_object('ok', true, 'already_released', true);
  end if;

  -- 3) Liberar lo registrado; pedidos anteriores al registro, sus ítems sin expandir (como antes)
  select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantity)), '[]'::jsonb)
    into v_items
    from public.web_order_items i
   where i.web_order_id = p_order_id and i.product_id is not null;

  v_r := public.fn_inv_int_liberar(v_order.organization_id, p_order_id::text, 'release_stock_for_order',
                                   v_order.branch_id, v_items, false);

  -- 4) Marcar que el stock fue liberado
  update public.web_orders set stock_released_at = now() where id = p_order_id and stock_released_at is null;

  return jsonb_build_object('ok', true, 'items_released', (v_r->>'items_released')::integer);
end;
$function$;

-- ── RPC de la fachada TS (pedidos del panel y oportunidades CRM) ────────────
create or replace function public.fn_stock_reservar(p_org integer, p_branch integer, p_ref_id text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipo text;
begin
  perform public.fn_assert_acceso_org(p_org);
  v_tipo := case
    when exists (select 1 from public.web_orders w where w.id::text = p_ref_id and w.organization_id = p_org) then 'web_order'
    when exists (select 1 from public.opportunities o where o.id::text = p_ref_id and o.organization_id = p_org) then 'opportunity'
    else 'otro'
  end;
  return public.fn_inv_int_reservar(p_org, p_branch, v_tipo, p_ref_id, p_items, false);
end;
$$;

create or replace function public.fn_stock_liberar_reserva(p_branch integer, p_ref_id text, p_items jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
begin
  select b.organization_id into v_org from public.branches b where b.id = p_branch;
  if v_org is null then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  perform public.fn_assert_acceso_org(v_org);
  return public.fn_inv_int_liberar(v_org, p_ref_id, 'fn_stock_liberar_reserva', p_branch, p_items, true);
end;
$$;

-- ── Reingreso por reversión (camino temporal del folio del PMS) ─────────────
create or replace function public.fn_inv_reversion_entrada(
  p_org integer, p_branch integer, p_source text, p_source_id text, p_lineas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_l jsonb;
  v_prod integer;
  v_qty numeric;
  v_costo numeric;
  v_r jsonb;
  v_proc jsonb := '[]'::jsonb;
  v_salt jsonb := '[]'::jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  if p_source is distinct from 'folio_item_reversal' then
    raise exception 'ORIGEN_INVALIDO' using errcode = '22023', detail = coalesce(p_source, 'null');
  end if;
  if p_source_id is null or btrim(p_source_id) = '' then
    raise exception 'ORIGEN_SIN_ID' using errcode = '22023';
  end if;

  for v_l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    v_prod := nullif(v_l->>'product_id', '')::integer;
    v_qty := coalesce(nullif(v_l->>'quantity', '')::numeric, nullif(v_l->>'qty', '')::numeric, 0);
    if v_prod is null then
      v_salt := v_salt || jsonb_build_object('product_id', null, 'reason', 'no_product');
      continue;
    end if;
    if v_qty <= 0 then
      v_salt := v_salt || jsonb_build_object('product_id', v_prod, 'reason', 'invalid_qty');
      continue;
    end if;
    -- Al costo con que salió del folio, no al precio de venta.
    select case when sum(sm.qty) > 0 then sum(sm.qty * coalesce(sm.unit_cost, 0)) / sum(sm.qty) end
      into v_costo
      from public.stock_movements sm
     where sm.organization_id = p_org and sm.product_id = v_prod and sm.direction = 'out'
       and sm.source in ('folio_item', 'room_consumption') and sm.source_id = p_source_id;
    if coalesce(v_costo, 0) <= 0 then
      v_costo := public.fn_costo_unitario_producto(v_prod, p_branch, 0);
    end if;
    v_r := public.fn_inv_int_mover(p_org, p_branch, v_prod, null, 'in', v_qty, v_costo, p_source, p_source_id,
                                   'Reversión de consumo del folio', auth.uid(),
                                   jsonb_build_object('recalcular_costo', false, 'fefo', false));
    if (v_r->>'omitido')::boolean then
      v_salt := v_salt || jsonb_build_object('product_id', v_prod,
        'reason', case when v_r->>'motivo' = 'no_track_stock' then 'not_tracked' else 'product_not_found' end);
    else
      v_proc := v_proc || jsonb_build_object('product_id', v_prod, 'qty', v_qty, 'unit_cost', v_costo,
                                             'movement_id', (v_r->>'movement_id')::integer);
    end if;
  end loop;

  return jsonb_build_object('procesadas', v_proc, 'saltadas', v_salt);
end;
$$;

revoke all on function public.fn_inv_int_expandir_items(integer, jsonb) from anon, public, authenticated;
revoke all on function public.fn_inv_int_reservar(integer, integer, text, text, jsonb, boolean) from anon, public, authenticated;
revoke all on function public.fn_inv_int_liberar(integer, text, text, integer, jsonb, boolean) from anon, public, authenticated;
revoke all on function public.reserve_stock_for_web_order(integer, integer, uuid, jsonb) from anon, public;
revoke all on function public.release_stock_for_order(uuid) from anon, public;
revoke all on function public.fn_stock_reservar(integer, integer, text, jsonb) from anon, public;
revoke all on function public.fn_stock_liberar_reserva(integer, text, jsonb) from anon, public;
revoke all on function public.fn_inv_reversion_entrada(integer, integer, text, text, jsonb) from anon, public;
grant execute on function public.fn_inv_int_expandir_items(integer, jsonb) to service_role;
grant execute on function public.fn_inv_int_reservar(integer, integer, text, text, jsonb, boolean) to service_role;
grant execute on function public.fn_inv_int_liberar(integer, text, text, integer, jsonb, boolean) to service_role;
grant execute on function public.reserve_stock_for_web_order(integer, integer, uuid, jsonb) to authenticated, service_role;
grant execute on function public.release_stock_for_order(uuid) to authenticated, service_role;
grant execute on function public.fn_stock_reservar(integer, integer, text, jsonb) to authenticated, service_role;
grant execute on function public.fn_stock_liberar_reserva(integer, text, jsonb) to authenticated, service_role;
grant execute on function public.fn_inv_reversion_entrada(integer, integer, text, text, jsonb) to authenticated, service_role;
