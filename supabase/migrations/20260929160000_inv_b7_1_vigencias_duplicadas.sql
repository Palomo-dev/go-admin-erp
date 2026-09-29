-- Inventario B7 · 1/3 — P11: cerrar las vigencias duplicadas de precio y costo
-- docs/implementacion/INVENTARIO-PLAN.md §4.2 (D19, D20) y §6 P11 (aprobada).
--
-- Antes (2026-09-29): 16.359 productos con más de un precio abierto
-- (`product_prices.effective_to is null`) y 59 con más de un costo abierto. La
-- causa principal: las acciones masivas del catálogo (bulkService.ts) cerraban
-- desde el navegador con un UPDATE que la RLS ignoraba en silencio y luego
-- insertaban la fila nueva. Desde este bloque pasan por RPC (inv_b7_2).
--
-- Regla (P11): por producto queda abierta la fila que ya empezó con
-- `effective_from` más reciente (desempate: id mayor) y cada fila abierta
-- anterior se cierra en el `effective_from` de la siguiente fila abierta.
-- Es la misma fila que ya eligen:
--   · POS en el servidor (`fn_pos_precio_base_vigente`: effective_from desc, id desc)
--   · POS en el navegador y catálogo local (`lib/pos/precioVigente.ts`)
--   · factura de venta y de compra (`lib/services/documentos/vigencia.ts`)
--   · catálogo de inventario (`get_catalogo_productos`)
--   · tienda web normalizada (`normalizeProductPrices`: la abierta de id mayor;
--     coincide en los 16.359 casos medidos, 0 diferencias)
-- Cerrar una fila anterior en el inicio de la siguiente no cambia el precio
-- vigente en ningún instante (la siguiente ya ganaba desde ese momento), así
-- que el historial por fecha tampoco cambia. No hay filas abiertas a futuro
-- ni filas sin `effective_from` (medido).
--
-- Rastro: `private.inv_b7_vigencias_cerradas` guarda cada fila cerrada y la
-- fecha que recibió; de ahí restaura el rollback.

create table if not exists private.inv_b7_vigencias_cerradas (
  tabla text not null check (tabla in ('product_prices', 'product_costs')),
  fila_id integer not null,
  product_id integer not null,
  organization_id integer not null,
  cerrada_en timestamptz not null,
  aplicada_at timestamptz not null default now(),
  primary key (tabla, fila_id)
);
revoke all on private.inv_b7_vigencias_cerradas from public, anon, authenticated;

-- ── Precios ─────────────────────────────────────────────────────────────────
with abiertas as (
  select pp.id, pp.product_id,
         lead(pp.effective_from) over (partition by pp.product_id order by pp.effective_from, pp.id) as siguiente,
         row_number() over (partition by pp.product_id order by pp.effective_from desc, pp.id desc) as rk
    from public.product_prices pp
   where pp.effective_to is null
     and pp.effective_from <= now()
), guardadas as (
  insert into private.inv_b7_vigencias_cerradas (tabla, fila_id, product_id, organization_id, cerrada_en)
  select 'product_prices', a.id, a.product_id, p.organization_id, a.siguiente
    from abiertas a
    join public.products p on p.id = a.product_id
   where a.rk > 1 and a.siguiente is not null
  on conflict (tabla, fila_id) do nothing
  returning fila_id, cerrada_en
)
update public.product_prices pp
   set effective_to = g.cerrada_en
  from guardadas g
 where pp.id = g.fila_id
   and pp.effective_to is null;

-- ── Costos ──────────────────────────────────────────────────────────────────
with abiertas as (
  select pc.id, pc.product_id,
         lead(pc.effective_from) over (partition by pc.product_id order by pc.effective_from, pc.id) as siguiente,
         row_number() over (partition by pc.product_id order by pc.effective_from desc, pc.id desc) as rk
    from public.product_costs pc
   where pc.effective_to is null
     and pc.effective_from <= now()
), guardadas as (
  insert into private.inv_b7_vigencias_cerradas (tabla, fila_id, product_id, organization_id, cerrada_en)
  select 'product_costs', a.id, a.product_id, p.organization_id, a.siguiente
    from abiertas a
    join public.products p on p.id = a.product_id
   where a.rk > 1 and a.siguiente is not null
  on conflict (tabla, fila_id) do nothing
  returning fila_id, cerrada_en
)
update public.product_costs pc
   set effective_to = g.cerrada_en
  from guardadas g
 where pc.id = g.fila_id
   and pc.effective_to is null;

-- ── Comprobación: ningún producto con dos vigencias abiertas ya iniciadas ───
do $$
declare
  v_precios integer;
  v_costos integer;
begin
  select count(*) into v_precios from (
    select product_id from public.product_prices
     where effective_to is null and effective_from <= now()
     group by product_id having count(*) > 1) x;
  select count(*) into v_costos from (
    select product_id from public.product_costs
     where effective_to is null and effective_from <= now()
     group by product_id having count(*) > 1) x;
  if v_precios > 0 or v_costos > 0 then
    raise exception 'inv_b7_1: quedan vigencias duplicadas (precios %, costos %)', v_precios, v_costos;
  end if;
end;
$$;
