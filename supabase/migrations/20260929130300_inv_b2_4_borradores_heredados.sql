-- Inventario B2 · 4/4 — Borradores heredados con «sistema» y diferencia estimada
-- Los 3 borradores que dejó la pantalla anterior no tienen system_qty ni
-- difference (1/3 solo rellenó los aplicados). Se rellenan con la existencia de
-- hoy, como si se hubieran guardado ahora con fn_ajuste_guardar: así el listado
-- muestra su diferencia e impacto estimados. Al aplicarlos, fn_ajuste_aplicar
-- vuelve a leer la existencia y congela la real. No mueve stock.

update public.adjustment_items ai
   set system_qty = s.qty,
       difference = ai.quantity - s.qty,
       applied_cost = coalesce(nullif(ai.unit_cost, 0), s.avg)
  from (
    select i.id,
           coalesce((select sl.qty_on_hand from public.stock_levels sl
                      where sl.product_id = i.product_id and sl.branch_id = ia.branch_id
                        and sl.lot_id is not distinct from i.lot_id
                      order by sl.id limit 1), 0) as qty,
           (select nullif(sl.avg_cost, 0) from public.stock_levels sl
             where sl.product_id = i.product_id and sl.branch_id = ia.branch_id
               and sl.lot_id is not distinct from i.lot_id
             order by sl.id limit 1) as avg
      from public.adjustment_items i
      join public.inventory_adjustments ia on ia.id = i.inventory_adjustment_id
     where ia.status = 'draft'
       and coalesce(ia.mode, 'conteo') = 'conteo'
       and i.difference is null
  ) s
 where s.id = ai.id;
