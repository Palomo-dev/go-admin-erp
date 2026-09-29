-- Rollback de 20260929160000_inv_b7_1_vigencias_duplicadas.sql
-- Reabre las filas de precio y costo que P11 cerró, con el rastro de
-- private.inv_b7_vigencias_cerradas. Solo las que siguen con la fecha que les
-- puso la migración: si después alguien cambió esa fila, se respeta.
-- Reabrirlas vuelve a dejar productos con varias vigencias abiertas (D19, D20).

update public.product_prices pp
   set effective_to = null
  from private.inv_b7_vigencias_cerradas r
 where r.tabla = 'product_prices'
   and pp.id = r.fila_id
   and pp.effective_to = r.cerrada_en;

update public.product_costs pc
   set effective_to = null
  from private.inv_b7_vigencias_cerradas r
 where r.tabla = 'product_costs'
   and pc.id = r.fila_id
   and pc.effective_to = r.cerrada_en;

drop table if exists private.inv_b7_vigencias_cerradas;
