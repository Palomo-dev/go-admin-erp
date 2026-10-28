-- ============================================================================
-- 20261027246000 — Libera las reservas VIVAS de pedidos web CANCELADOS.
--
-- Al 27-oct-2026 (SELECT en prod) 27 pedidos cancelados (todos payment_status
-- 'failed') siguen reteniendo stock: 44 reservas en 4 organizaciones
--   org 137: 17 pedidos, 23 reservas, 23 uds (sede 112, 19 productos)
--   org 333:  5 pedidos, 12 reservas, 24 uds (sede 538, 12 productos)
--   org 335:  3 pedidos,  7 reservas, 32 uds (sede 540,  7 productos)
--   org 338:  2 pedidos,  2 reservas,  2 uds (sede 543,  2 productos)
--
-- Independiente de 241500→245000 (se puede aplicar antes o después). Si luego
-- se reactiva uno de estos pedidos (20261027245000) vuelve a reservar todo o
-- nada, porque ese camino reserva siempre para los cancelados por pago fallido.
--
-- Respaldo: tabla public.bk_20261027246000_reservas_cancelados (reservas,
-- niveles de stock y stock_released_at de los pedidos). Reversión exacta:
-- supabase/rollbacks/20261027246000_liberar_reservas_cancelados_web_rollback.sql
-- Se libera con fn_inv_int_liberar (la misma rutina interna de
-- release_stock_for_order, sin fn_assert_acceso_org: aquí no hay JWT).
-- ============================================================================
set statement_timeout = '60s';
begin;

create table public.bk_20261027246000_reservas_cancelados (
  tipo text not null,                 -- 'reserva' | 'nivel' | 'pedido'
  id_fila text not null,
  organization_id integer,
  order_id uuid,
  product_id integer,
  branch_id integer,
  qty numeric,
  qty_reserved_antes numeric,
  qty_reserved_despues numeric,
  stock_released_at_antes timestamptz,
  creado timestamptz not null default now()
);
revoke all on public.bk_20261027246000_reservas_cancelados from public, anon, authenticated;

create temp table _obj on commit drop as
select w.id as order_id, w.organization_id, w.order_number
  from public.web_orders w
 where w.status = 'cancelled'
   and exists (select 1 from public.stock_reservations r
                where r.ref_type = 'web_order' and r.ref_id = w.id::text
                  and r.organization_id = w.organization_id and r.released_at is null);

insert into public.bk_20261027246000_reservas_cancelados (tipo, id_fila, organization_id, order_id, product_id, branch_id, qty)
select 'reserva', r.id::text, r.organization_id, o.order_id, r.product_id, r.branch_id, r.qty
  from _obj o join public.stock_reservations r
    on r.ref_type = 'web_order' and r.ref_id = o.order_id::text and r.organization_id = o.organization_id
 where r.released_at is null;

insert into public.bk_20261027246000_reservas_cancelados (tipo, id_fila, organization_id, product_id, branch_id, qty_reserved_antes)
select 'nivel', sl.id::text, max(b.organization_id), sl.product_id, sl.branch_id, sl.qty_reserved
  from public.stock_levels sl
  join public.bk_20261027246000_reservas_cancelados b
    on b.tipo = 'reserva' and b.product_id = sl.product_id and b.branch_id = sl.branch_id
 where sl.lot_id is null
 group by sl.id, sl.product_id, sl.branch_id, sl.qty_reserved;

insert into public.bk_20261027246000_reservas_cancelados (tipo, id_fila, organization_id, order_id, stock_released_at_antes)
select 'pedido', w.id::text, w.organization_id, w.id, w.stock_released_at
  from _obj o join public.web_orders w on w.id = o.order_id;

do $$
declare
  v record;
  v_pedidos integer;
  v_reservas integer;
begin
  select count(*) into v_pedidos from _obj;
  select count(*) into v_reservas from public.bk_20261027246000_reservas_cancelados where tipo = 'reserva';
  raise notice 'Pedidos cancelados con reservas vivas: %, reservas: % (27 y 44 al 27-oct)', v_pedidos, v_reservas;
  for v in select * from _obj order by organization_id, order_number loop
    perform public.fn_inv_int_liberar(v.organization_id, v.order_id::text,
      'cancelado_sin_liberar_20261027246000', null, null, false);
  end loop;
  if exists (select 1 from _obj o join public.stock_reservations r
              on r.ref_type = 'web_order' and r.ref_id = o.order_id::text and r.released_at is null) then
    raise exception 'Quedaron reservas vivas tras liberar';
  end if;
end $$;

update public.bk_20261027246000_reservas_cancelados b
   set qty_reserved_despues = sl.qty_reserved
  from public.stock_levels sl
 where b.tipo = 'nivel' and sl.id::text = b.id_fila;

commit;
