-- =====================================================================
-- Rollback de 20261005230615_precios_y_costos_por_sede (versión provisional:
-- renombrar junto con la migración al aplicarla).
--
-- ADVERTENCIA — NO RESTAURA DATOS: borra product_branch_prices y
-- product_branch_costs. Antes de ejecutarlo, si ya hay precios/costos de
-- sede, expórtalos (select * from ...) o el negocio pierde esa configuración
-- y cada sede vuelve al precio/costo general. Las ventas ya cerradas no
-- cambian (sale_items guarda el precio cobrado).
--
-- Orden: primero pos_checkout_v1 deja de pasar la sede, luego se restauran
-- las funciones con su cuerpo previo y al final se borra lo nuevo.
-- =====================================================================

-- 1. pos_checkout_v1: deshacer el parche de las dos llamadas (guarda md5).
do $$
declare
  v_oid regprocedure := 'public.pos_checkout_v1(jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
begin
  select md5(p.prosrc) into v_md5 from pg_proc p where p.oid = v_oid;
  if v_md5 = '8580166ba442c69ad9757f75f613c24d' then
    raise notice 'pos_checkout_v1 ya está en la versión previa; nada que hacer';
    return;
  end if;
  if v_md5 is distinct from '32a99ca1eb51eb44e28a2ed851157094' then
    raise exception 'pos_checkout_v1 cambió después de la migración (md5 %); revertir a mano las dos llamadas', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  v_def := replace(v_def,
    $n1$perform public.fn_pos_validar_linea_venta(v_org, v_actor, v_item, v_hora_precio, p_envelope->'discount_authorization', v_branch, v_sin_conexion);$n1$,
    $o1$perform public.fn_pos_validar_linea_venta(v_org, v_actor, v_item, v_hora_precio, p_envelope->'discount_authorization');$o1$);
  v_def := replace(v_def,
    $n2$'priced_at', v_si.created_at), v_si.created_at, null, coalesce((select s.branch_id from public.sales s where s.id = v_sale_id), v_branch), false);$n2$,
    $o2$'priced_at', v_si.created_at), v_si.created_at, null);$o2$);
  execute v_def;
  select md5(p.prosrc) into v_md5 from pg_proc p where p.oid = v_oid;
  if v_md5 <> '8580166ba442c69ad9757f75f613c24d' then
    raise exception 'la reversión de pos_checkout_v1 no produjo el cuerpo previo (md5 %)', v_md5;
  end if;
end;
$$;

-- 2. fn_pos_validar_linea_venta de 5 argumentos: cuerpo previo (2026-10-05).
CREATE OR REPLACE FUNCTION public.fn_pos_validar_linea_venta(p_org integer, p_actor uuid, p_item jsonb, p_created_at timestamp with time zone, p_autorizacion jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_product  integer := nullif(p_item->>'product_id', '')::integer;
  v_qty      numeric := (p_item->>'quantity')::numeric;
  v_price    numeric := coalesce((p_item->>'unit_price')::numeric, 0);
  v_disc     numeric := coalesce((p_item->>'discount_amount')::numeric, 0);
  v_rate     numeric := coalesce((p_item->>'tax_rate')::numeric, 0);
  v_incl     boolean := coalesce((p_item->>'tax_included')::boolean, false);
  v_total    numeric := coalesce((p_item->>'total')::numeric, 0);
  v_tax      numeric := coalesce((p_item->>'tax_amount')::numeric, 0);
  v_mods     jsonb;
  v_extra    numeric;
  v_base     numeric;
  v_hay_base boolean := false;
  v_ok       boolean := false;
  v_momento  timestamptz;
  v_priced   timestamptz;
  v_net      numeric;
  v_exp_tax  numeric;
  v_exp_tot  numeric;
  v_nombre   text;
begin
  if v_product is null then
    raise exception 'producto_invalido' using errcode = '22023',
      detail = 'La línea no trae producto.';
  end if;
  select p.name into v_nombre from public.products p where p.id = v_product and p.organization_id = p_org;
  if not found then
    raise exception 'producto_invalido' using errcode = '22023',
      detail = format('El producto %s no es de la organización.', v_product);
  end if;
  -- Producto eliminado (20260930234100): no se vende, salvo que la línea sea
  -- anterior a la baja (venta sin conexión: hora del equipo; mesa: hora de la línea).
  perform public.fn_producto_exigir_vendible(p_org, v_product, p_created_at);
  -- Productos por peso o medida (20260929120100): decimales, mínimo y origen del peso.
  perform public.fn_pos_validar_pesaje(p_org, p_actor, p_item);

  if v_disc > round(v_qty * v_price, 2) + 0.01 then
    raise exception 'descuento_excede_linea' using errcode = '22023',
      detail = format('Producto %s: descuento %s mayor que la línea %s.', v_product, v_disc, round(v_qty * v_price, 2));
  end if;
  if v_disc > 0 then
    perform public.fn_pos_autorizar_descuento(p_org, p_actor, p_item, p_autorizacion);
  end if;

  -- Modificadores: los del sobre o, en sobres antiguos, los de las notas.
  v_mods := case
    when jsonb_typeof(p_item->'modifiers') = 'array'
         and exists (select 1 from jsonb_array_elements(p_item->'modifiers') m
                      where coalesce(m->>'modifier_id', m->>'modifierId') is not null)
      then p_item->'modifiers'
    when jsonb_typeof(p_item->'notes'->'modifiers') = 'array' then p_item->'notes'->'modifiers'
    else p_item->'modifiers'
  end;
  v_extra := public.fn_pos_extra_modificadores(p_org, v_product, v_mods);
  if v_extra is null then
    raise exception 'modificador_invalido' using errcode = '22023',
      detail = format('Producto %s: un modificador no está configurado para el producto.', v_product);
  end if;

  v_priced := nullif(p_item->>'priced_at', '')::timestamptz;
  for v_momento in
    select m from unnest(array[
      now(),
      case when p_created_at between now() - interval '30 days' and now() + interval '5 minutes' then p_created_at end,
      case when v_priced between now() - interval '30 days' and now() + interval '5 minutes' then v_priced end
    ]) m
    where m is not null
  loop
    v_base := public.fn_pos_precio_base_vigente(v_product, v_momento);
    if v_base is not null then
      v_hay_base := true;
      if abs(v_base + v_extra - v_price) <= 0.01 then
        v_ok := true;
        exit;
      end if;
    end if;
  end loop;
  if not v_hay_base then
    raise exception 'precio_no_vigente' using errcode = '22023',
      detail = format('«%s» (producto %s) no tiene precio vigente.', v_nombre, v_product);
  end if;
  if not v_ok then
    raise exception 'precio_no_coincide' using errcode = '22023',
      detail = format('«%s» (producto %s): precio enviado %s, vigente %s.', v_nombre, v_product, v_price,
                      public.fn_pos_precio_base_vigente(v_product, now()) + v_extra);
  end if;

  -- Regla única de la línea (la misma de POSService.checkout).
  if v_rate < 0 or v_rate > 100 then
    raise exception 'linea_incoherente' using errcode = '22023',
      detail = format('Producto %s: tasa de impuesto %s fuera de rango.', v_product, v_rate);
  end if;
  v_net := v_qty * v_price - v_disc;
  v_exp_tax := round(case when v_incl then v_net - v_net / (1 + v_rate / 100) else v_net * v_rate / 100 end, 2);
  v_exp_tot := case when v_incl then v_net else v_net + v_exp_tax end;
  if abs(v_total - v_exp_tot) > 0.05 or abs(v_tax - v_exp_tax) > 0.05 then
    raise exception 'linea_incoherente' using errcode = '22023',
      detail = format('Producto %s: total %s / impuesto %s; esperado %s / %s.', v_product, v_total, v_tax, v_exp_tot, v_exp_tax);
  end if;
end;
$function$;

revoke all on function public.fn_pos_validar_linea_venta(integer, uuid, jsonb, timestamp with time zone, jsonb) from public, anon, authenticated;

drop function if exists public.fn_pos_validar_linea_venta(integer, uuid, jsonb, timestamp with time zone, jsonb, integer, boolean);

-- 3. fn_costo_unitario_producto: cuerpo previo (costo vigente general).
CREATE OR REPLACE FUNCTION public.fn_costo_unitario_producto(p_product_id integer, p_branch_id integer, p_fallback numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_costo numeric;
BEGIN
    SELECT avg_cost INTO v_costo
    FROM stock_levels
    WHERE product_id = p_product_id
      AND branch_id = p_branch_id
      AND lot_id IS NULL
    LIMIT 1;

    IF COALESCE(v_costo, 0) > 0 THEN
        RETURN v_costo;
    END IF;

    SELECT cost INTO v_costo
    FROM product_costs
    WHERE product_id = p_product_id
      AND effective_from <= now()
      AND (effective_to IS NULL OR effective_to > now())
    ORDER BY effective_from DESC
    LIMIT 1;

    IF COALESCE(v_costo, 0) > 0 THEN
        RETURN v_costo;
    END IF;

    RETURN COALESCE(p_fallback, 0);
END;
$function$;

-- 4. fn_receta_costo: cuerpo previo (costo vigente general).
CREATE OR REPLACE FUNCTION public.fn_receta_costo(p_organization_id integer, p_branch_id integer, p_receta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rec jsonb := p_receta;
  v_ver boolean;
  v_rinde numeric;
  v_lineas jsonb;
  v_tanda numeric;
  v_sin integer;
  v_err integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_branch_id is not null and not exists (
       select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  if p_receta ? 'recipe_id' then
    v_rec := public.fn_receta_int_a_jsonb(nullif(p_receta->>'recipe_id', '')::integer);
    if v_rec is null or (v_rec->>'organization_id')::integer <> p_organization_id then
      raise exception 'receta_no_encontrada' using errcode = 'P0002';
    end if;
  end if;
  v_ver := public.fn_receta_int_puede_ver_costos(p_organization_id);
  v_rinde := coalesce(nullif(nullif(v_rec->>'yield_qty', '')::numeric, 0), 1);

  with l as (
    select c.*,
           (select sl.avg_cost from public.stock_levels sl
             where sl.product_id = c.ingredient_product_id and sl.branch_id = p_branch_id and sl.lot_id is null
             limit 1) as promedio,
           (select pc.cost from public.product_costs pc
             where pc.product_id = c.ingredient_product_id and pc.effective_from <= now()
               and (pc.effective_to is null or pc.effective_to > now())
             order by pc.effective_from desc, pc.id desc limit 1) as vigente,
           (select sum(sl.qty_on_hand) from public.stock_levels sl
             where sl.product_id = c.ingredient_product_id and sl.branch_id = p_branch_id) as existencia
      from public.fn_receta_int_calcular(p_organization_id, v_rec, v_rinde) c
  ), k as (
    select l.*,
           case when coalesce(l.promedio, 0) > 0 then l.promedio
                when coalesce(l.vigente, 0) > 0 then l.vigente end as costo_unitario,
           case when coalesce(l.promedio, 0) > 0 then 'promedio_sucursal'
                when coalesce(l.vigente, 0) > 0 then 'costo_vigente'
                else 'sin_costo' end as fuente
      from l
  ), m as (
    select k.*, case when k.costo_unitario is not null and k.factor is not null then k.cantidad * k.costo_unitario end as costo_linea
      from k
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'orden', m.orden,
           'ingredient_product_id', m.ingredient_product_id,
           'nombre', m.nombre,
           'sku', m.sku,
           'track_stock', m.track_stock,
           'unidad_receta', m.unidad_receta,
           'unidad_ingrediente', m.unidad_ingrediente,
           'cantidad_neta', round(m.cantidad_neta, 6),
           'merma_pct', m.merma_pct,
           'cantidad_bruta', round(m.cantidad_bruta, 6),
           'factor', m.factor,
           'cantidad', round(m.cantidad, 6),
           'opcional', m.opcional,
           'existencia', m.existencia,
           'fuente', m.fuente,
           'costo_unitario', case when v_ver then m.costo_unitario end,
           'costo_linea', case when v_ver then round(m.costo_linea, 4) end,
           'error', m.error) order by m.orden), '[]'::jsonb),
         sum(m.costo_linea) filter (where not m.opcional),
         count(*) filter (where not m.opcional and m.costo_unitario is null and m.error is null),
         count(*) filter (where m.error is not null)
    into v_lineas, v_tanda, v_sin, v_err
    from m;

  return jsonb_build_object(
    'permitido', v_ver,
    'rinde', v_rinde,
    'unidad_rinde', nullif(upper(btrim(coalesce(v_rec->>'yield_unit_code', ''))), ''),
    'costo_tanda', case when v_ver then round(coalesce(v_tanda, 0), 4) end,
    'costo_unidad', case when v_ver then round(coalesce(v_tanda, 0) / v_rinde, 4) end,
    'completo', coalesce(v_sin, 0) = 0 and coalesce(v_err, 0) = 0,
    'lineas_sin_costo', coalesce(v_sin, 0),
    'lineas_con_error', coalesce(v_err, 0),
    'lineas', v_lineas);
end;
$function$;

-- 5. Lo nuevo.
drop function if exists public.fn_receta_costo_teorico_sede(integer, integer, integer, timestamptz);
drop function if exists public.fn_productos_sede_fijar(integer, text, integer[], integer[], numeric, numeric, timestamptz, boolean, integer);
drop function if exists public.fn_producto_sede_int_fijar_precio(integer, integer, integer, numeric, numeric, timestamptz);
drop function if exists public.fn_producto_sede_int_fijar_costo(integer, integer, integer, numeric, integer, timestamptz);
drop function if exists public.fn_precio_vigente(integer, integer, timestamptz, boolean);
drop function if exists public.fn_costo_vigente(integer, integer, timestamptz, boolean);
drop function if exists public.fn_precios_vigentes_lote(integer, integer, integer[], timestamptz, boolean);
drop function if exists public.fn_costos_vigentes_lote(integer, integer, integer[], timestamptz, boolean);

drop table if exists public.product_branch_prices;
drop table if exists public.product_branch_costs;
drop function if exists public.fn_producto_sede_tg_coherencia();
