-- F-61 · El costo de ventas tiene un solo camino: el kardex (ADR-CC-010).
--
-- Hallazgo al reconciliar: NINGUNA organización tiene regla inventory/confirmed
-- (las 85 tienen inventory/adjusted 6105/1405), y el costo de ventas SÍ se
-- contabiliza: fn_auto_journal_stock_movement asienta cada salida de inventario
-- por venta (POS, web, mesas, factura, folio) como 6105 D / 1405 C con su
-- subcuenta de sucursal —3.776 asientos en 15 organizaciones—, por ingrediente
-- en los productos con receta.
--
-- fn_auto_journal_sale_item_cogs era un segundo camino para el mismo hecho, que
-- nunca llegó a escribir (0 asientos source='sale_items'): sin regla, rechazaba.
-- De sus 99 rechazos (org 137: 2, org 144: 97), 96 tienen su salida en el kardex
-- por el mismo importe exacto y 3 son productos sin inventario propio (recetas)
-- cuyo costo salió por sus ingredientes. Sembrar la regla, como proponía F-61,
-- habría duplicado el costo de ventas en toda organización con costos.
--
-- Por eso:
--   1. se deshabilita trg_auto_journal_sale_item_cogs (se conserva la función);
--   2. journal_entry_failures gana columnas de resolución (aditivas);
--   3. los 99 rechazos se marcan resueltos, apuntando al asiento del kardex que
--      ya contabiliza su costo;
--   4. v_salud_contable cuenta solo rechazos sin resolver.
--
-- Queda fuera, porque no es cuestión de reglas: 723 salidas por venta con costo 0
-- (productos sin costo cargado, F-36) no generan asiento de costo.

alter table public.sale_items disable trigger trg_auto_journal_sale_item_cogs;

comment on function public.fn_auto_journal_sale_item_cogs() is
  'Deshabilitado el 2026-09-23 (ADR-CC-010): el costo de ventas lo contabiliza el kardex (fn_auto_journal_stock_movement) por cada salida de inventario. Este camino habría duplicado el costo. Se conserva la función para la reversión.';

alter table public.journal_entry_failures
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_entry_id integer,
  add column if not exists resolution text;

comment on column public.journal_entry_failures.resolved_at is
  'Cuándo se resolvió el rechazo (el hecho quedó contabilizado por otra vía o se corrigió la causa).';

-- 3a. Líneas cuyo propio producto salió por el kardex.
with f as (
  select jf.id, jf.organization_id, si.sale_id, si.product_id
  from journal_entry_failures jf
  join sale_items si on si.id::text = jf.source_id
  where jf.source = 'sale_items' and jf.reason = 'no_rule' and jf.resolved_at is null
),
k as (
  select f.id,
    (select je.id
     from stock_movements sm
     join journal_entries je on je.organization_id = f.organization_id
                             and je.source = 'stock_movements' and je.source_id = sm.id::text
     where sm.organization_id = f.organization_id and sm.source_id = f.sale_id::text
       and sm.product_id = f.product_id and sm.direction = 'out'
     order by sm.created_at limit 1) as entry_id
  from f
)
update journal_entry_failures jf
set resolved_at = now(),
    resolved_entry_id = k.entry_id,
    resolution = 'Costo contabilizado por el kardex (salida de inventario de la misma venta y producto). ADR-CC-010.'
from k
where jf.id = k.id and k.entry_id is not null;

-- 3b. Productos sin inventario propio (recetas): su costo salió por ingredientes.
with f as (
  select jf.id, jf.organization_id, si.sale_id
  from journal_entry_failures jf
  join sale_items si on si.id::text = jf.source_id
  join products p on p.id = si.product_id
  where jf.source = 'sale_items' and jf.reason = 'no_rule' and jf.resolved_at is null
    and not p.track_stock
),
k as (
  select f.id,
    (select je.id
     from stock_movements sm
     join journal_entries je on je.organization_id = f.organization_id
                             and je.source = 'stock_movements' and je.source_id = sm.id::text
     where sm.organization_id = f.organization_id and sm.source_id = f.sale_id::text
       and sm.direction = 'out'
     order by sm.created_at limit 1) as entry_id
  from f
)
update journal_entry_failures jf
set resolved_at = now(),
    resolved_entry_id = k.entry_id,
    resolution = 'Producto sin inventario propio (receta): costo contabilizado por el kardex de sus ingredientes. ADR-CC-010.'
from k
where jf.id = k.id and k.entry_id is not null;

-- 4. La vista de salud cuenta solo lo que sigue abierto.
create or replace view public.v_salud_contable
with (security_invoker = true) as
with fallos as (
  select organization_id,
         count(*) as rechazos_total,
         count(*) filter (where created_at > now() - interval '7 days') as rechazos_7d,
         max(created_at) as ultimo_rechazo
  from journal_entry_failures
  where resolved_at is null
  group by 1
),
por_motivo as (
  select organization_id, jsonb_object_agg(reason || ' · ' || coalesce(source, '?'), n) as rechazos_por_motivo
  from (select organization_id, reason, source, count(*) as n
        from journal_entry_failures where resolved_at is null group by 1, 2, 3) t
  group by 1
),
balance as (
  select je.organization_id, sum(jl.debit) as debitos, sum(jl.credit) as creditos
  from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id
  group by 1
)
select
  o.id as organization_id,
  coalesce(f.rechazos_total, 0) as rechazos_total,
  coalesce(f.rechazos_7d, 0) as rechazos_7d,
  f.ultimo_rechazo,
  coalesce(m.rechazos_por_motivo, '{}'::jsonb) as rechazos_por_motivo,
  coalesce(b.debitos, 0) = coalesce(b.creditos, 0) as balance_cuadra,
  c.cxc_libro,
  c.cxc_facturas_abiertas,
  c.diferencia as diferencia_cartera,
  c.importe_nc_sobre_pagadas,
  c.pagadas_sin_pago
from organizations o
left join fallos f on f.organization_id = o.id
left join por_motivo m on m.organization_id = o.id
left join balance b on b.organization_id = o.id
left join v_cartera_vs_documentos c on c.organization_id = o.id
where f.organization_id is not null or b.organization_id is not null;

revoke all on public.v_salud_contable from public, anon, authenticated;
grant select on public.v_salud_contable to service_role;
