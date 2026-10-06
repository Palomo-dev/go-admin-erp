-- Rollback de supabase/pendientes/20261006170000_org200_gramos_por_peso.sql
--
-- Devuelve los 21 productos activos en gramos de la org 200 a los valores exactos
-- de antes: por unidad (fn_producto_int_modo_venta), precio y costo por kilo
-- vigentes (se reabre la fila original), y stock_levels.avg_cost original.
-- Sin DELETE: la vigencia por gramo que creó el pendiente se cierra en el mismo
-- instante en que empezó (queda en el historial, sin regir nunca).
-- Aplicarlo ANTES del rollback de la migración 20261006160000.
-- No toca ventas hechas en gramos mientras rigió: esas líneas quedan como se cobraron.

do $$
declare
  v_ahora timestamptz := now();
  r record;
begin
  for r in
    select * from (values
      (97008, 194274, 12000.00, 15296, 7500.00, 59866, 7500.00),
      (97009, 194275, 12000.00, 15297, 7500.00, 59867, 7500.00),
      (97010, 194276, 12000.00, 15298, 7500.00, 59868, 7500.00),
      (97011, 194277, 10000.00, 15299, 4500.00, 59869, 4500.00),
      (97012, 194278, 12000.00, 15300, 8400.00, 59870, 8400.00),
      (97013, 194279, 12000.00, 15301, 8400.00, 59871, 8400.00),
      (97014, 194280, 10000.00, 15302, 5000.00, 59872, 5000.00),
      (97015, 194281, 15000.00, 15303, 7000.00, 59873, 7000.00),
      (97016, 194282, 15000.00, 15304, 10500.00, 59874, 10500.00),
      (97017, 194283, 16000.00, 15305, 13000.00, 59875, 13000.00),
      (97018, 194284, 15000.00, 15306, 12500.00, 59876, 12500.00),
      (97019, 194285, 13000.00, 15307, 9000.00, 59877, 9000.00),
      (97020, 194286, 12000.00, 15308, 6000.00, 59878, 6000.00),
      (97021, 194287, 13000.00, 15309, 9000.00, 59879, 9000.00),
      (97025, 194291, 15000.00, 15313, 8500.00, 59883, 8500.00),
      (97040, 194306, 8000.00, 15328, 5000.00, 59898, 5000.00),
      (97042, 194308, 14000.00, 15330, 11600.00, 59900, 11600.00),
      (97043, 194309, 10000.00, 15331, 7000.00, 59901, 7000.00),
      (97044, 194310, 8000.00, 15332, 4000.00, 59902, 4000.00),
      (97045, 194311, 12000.00, 15333, 7700.00, 59903, 7700.00),
      (97046, 194312, 10000.00, 15334, 7500.00, 59904, 7500.00)
    ) as t(product_id, price_id, price_old, cost_id, cost_old, stock_id, avg_old)
  loop
    if not exists (select 1 from public.products p where p.id = r.product_id and p.organization_id = 200) then
      raise exception 'el producto % no es de la org 200', r.product_id using errcode = 'P0001';
    end if;

    perform public.fn_producto_int_modo_venta(200, r.product_id, '{"sale_mode":"unit"}'::jsonb, false);

    -- La vigencia por gramo (posterior a la original) deja de regir: termina donde empezó.
    update public.product_prices set effective_to = effective_from
     where product_id = r.product_id and id > r.price_id and (effective_to is null or effective_to > v_ahora);
    update public.product_prices set effective_to = null, price = r.price_old where id = r.price_id;

    update public.product_costs set effective_to = effective_from
     where product_id = r.product_id and id > r.cost_id and (effective_to is null or effective_to > v_ahora);
    update public.product_costs set effective_to = null, cost = r.cost_old where id = r.cost_id;

    update public.stock_levels set avg_cost = r.avg_old where id = r.stock_id;
  end loop;
end $$;
