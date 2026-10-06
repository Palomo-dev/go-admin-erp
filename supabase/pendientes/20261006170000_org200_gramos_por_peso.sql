-- Datos de la org 200 (una tienda de pollo y carnes): sus 21 productos activos en
-- gramos pasan a venderse por peso EN GRAMOS, sin cambiar la unidad ni el stock.
--
-- PENDIENTE. Se aplica SOLO cuando el código de la venta en gramos esté en
-- producción (el dueño pasa main a master) y DESPUÉS de la migración
-- supabase/migrations/20261006143255_venta_por_peso_en_gramos.sql.
--
-- Hoy: unit_code 'GR', stock en gramos (57.300 = 57,3 kg) pero precio y costo POR
-- KILO (precio 12000, costo 7000), así que la valoración del inventario está ×1000.
-- Después, todo por gramo, coherente con el stock:
--   - «Cómo se vende» = por peso, por fn_producto_int_modo_venta (la misma regla
--     del formulario): sale_mode 'weight', qty_decimals 0, precio escrito por kg
--     (price_ref 1000 GR).
--   - precio por gramo = precio / 1000 como NUEVA vigencia en product_prices
--     (la anterior se cierra en ese instante, no se borra).
--   - costo por gramo = costo / 1000 como nueva vigencia en product_costs.
--   - stock_levels.avg_cost / 1000.
--   - el stock (qty_on_hand) no cambia.
-- Valores exactos por id (sin nombres). Todos los precios y costos son múltiplos
-- de 100: la división entre 1000 es exacta con 2 decimales.
-- Falla entero (y no cambia nada) si algún valor actual no coincide con el
-- esperado: protege de aplicarlo dos veces o sobre datos que cambiaron.
-- Rollback: supabase/pendientes/20261006170000_org200_gramos_por_peso_rollback.sql

do $$
declare
  v_desde timestamptz := now();
  r record;
  v_n integer := 0;
begin
  if to_regprocedure('public.fn_peso_convertir(numeric,text,text)') is null then
    raise exception 'Falta la migración 20261006143255_venta_por_peso_en_gramos'
      using errcode = 'P0001';
  end if;

  for r in
    select * from (values
      (97008, 194274, 12000.00, 12.00, 15296, 7500.00, 7.50, 59866, 7500.00, 7.50),
      (97009, 194275, 12000.00, 12.00, 15297, 7500.00, 7.50, 59867, 7500.00, 7.50),
      (97010, 194276, 12000.00, 12.00, 15298, 7500.00, 7.50, 59868, 7500.00, 7.50),
      (97011, 194277, 10000.00, 10.00, 15299, 4500.00, 4.50, 59869, 4500.00, 4.50),
      (97012, 194278, 12000.00, 12.00, 15300, 8400.00, 8.40, 59870, 8400.00, 8.40),
      (97013, 194279, 12000.00, 12.00, 15301, 8400.00, 8.40, 59871, 8400.00, 8.40),
      (97014, 194280, 10000.00, 10.00, 15302, 5000.00, 5.00, 59872, 5000.00, 5.00),
      (97015, 194281, 15000.00, 15.00, 15303, 7000.00, 7.00, 59873, 7000.00, 7.00),
      (97016, 194282, 15000.00, 15.00, 15304, 10500.00, 10.50, 59874, 10500.00, 10.50),
      (97017, 194283, 16000.00, 16.00, 15305, 13000.00, 13.00, 59875, 13000.00, 13.00),
      (97018, 194284, 15000.00, 15.00, 15306, 12500.00, 12.50, 59876, 12500.00, 12.50),
      (97019, 194285, 13000.00, 13.00, 15307, 9000.00, 9.00, 59877, 9000.00, 9.00),
      (97020, 194286, 12000.00, 12.00, 15308, 6000.00, 6.00, 59878, 6000.00, 6.00),
      (97021, 194287, 13000.00, 13.00, 15309, 9000.00, 9.00, 59879, 9000.00, 9.00),
      (97025, 194291, 15000.00, 15.00, 15313, 8500.00, 8.50, 59883, 8500.00, 8.50),
      (97040, 194306, 8000.00, 8.00, 15328, 5000.00, 5.00, 59898, 5000.00, 5.00),
      (97042, 194308, 14000.00, 14.00, 15330, 11600.00, 11.60, 59900, 11600.00, 11.60),
      (97043, 194309, 10000.00, 10.00, 15331, 7000.00, 7.00, 59901, 7000.00, 7.00),
      (97044, 194310, 8000.00, 8.00, 15332, 4000.00, 4.00, 59902, 4000.00, 4.00),
      (97045, 194311, 12000.00, 12.00, 15333, 7700.00, 7.70, 59903, 7700.00, 7.70),
      (97046, 194312, 10000.00, 10.00, 15334, 7500.00, 7.50, 59904, 7500.00, 7.50)
    ) as t(product_id, price_id, price_old, price_new, cost_id, cost_old, cost_new, stock_id, avg_old, avg_new)
  loop
    -- Comprobación de los valores actuales (organización, unidad, modo, precio, costo y costo promedio).
    if not exists (select 1 from public.products p
                    where p.id = r.product_id and p.organization_id = 200 and p.status = 'active'
                      and btrim(p.unit_code) = 'GR' and p.sale_mode = 'unit')
       or not exists (select 1 from public.product_prices pp
                       where pp.id = r.price_id and pp.product_id = r.product_id and pp.price = r.price_old and pp.effective_to is null)
       or exists (select 1 from public.product_prices pp
                   where pp.product_id = r.product_id and pp.id <> r.price_id and (pp.effective_to is null or pp.effective_to > v_desde))
       or not exists (select 1 from public.product_costs pc
                       where pc.id = r.cost_id and pc.product_id = r.product_id and pc.cost = r.cost_old and pc.effective_to is null)
       or not exists (select 1 from public.stock_levels sl
                       where sl.id = r.stock_id and sl.product_id = r.product_id and sl.avg_cost = r.avg_old) then
      raise exception 'datos_distintos: el producto % no está como se esperaba', r.product_id
        using errcode = 'P0001';
    end if;

    perform public.fn_producto_int_modo_venta(200, r.product_id, '{"sale_mode":"weight"}'::jsonb, false);

    update public.product_prices set effective_to = v_desde where id = r.price_id;
    insert into public.product_prices (product_id, price, effective_from) values (r.product_id, r.price_new, v_desde);

    update public.product_costs set effective_to = v_desde where id = r.cost_id;
    insert into public.product_costs (product_id, cost, effective_from) values (r.product_id, r.cost_new, v_desde);

    update public.stock_levels set avg_cost = r.avg_new where id = r.stock_id;
    v_n := v_n + 1;
  end loop;

  if v_n <> 21 then
    raise exception 'se esperaban 21 productos y se procesaron %', v_n using errcode = 'P0001';
  end if;
end $$;
