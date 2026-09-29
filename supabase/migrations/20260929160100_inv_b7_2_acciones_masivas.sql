-- Inventario B7 · 2/3 — Acciones masivas del catálogo por RPC
-- docs/implementacion/INVENTARIO-PLAN.md §5.8.
--
-- Antes: bulkService.ts cerraba vigencias con un UPDATE desde el navegador que
-- la RLS no dejaba pasar (0 filas, sin error) e insertaba la fila nueva: de ahí
-- los 16.359 productos con varios precios abiertos (D20). El costo masivo además
-- pisaba `stock_levels.avg_cost` en todas las sucursales con el costo nuevo.
-- Estado y categoría masivos no llegaban a las variantes y eliminar era una RPC
-- por producto (con solo pertenencia como permiso).
--
-- fn_productos_masivo_alcance(org, ids) → integer[]
--   Seleccionados + variantes de los padres + padre (y hermanas) de las
--   variantes: la misma expansión que ya usaban precio y costo masivos
--   (fn_productos_int_expandir_variantes). La interfaz parte el resultado en
--   lotes sin repetir un producto (un porcentaje no se aplica dos veces).
-- fn_productos_precio_masivo(org, ids, tipo, operacion, opciones) → resumen
--   tipo: venta · comparacion · compra (costo).
--   operacion: ajustar {modo: fijo|valor|porcentaje, cantidad}
--              redondear {modo: multiplo|digitos, multiplo, digitos, valor}
--              copiar_a_comparacion {sobrescribir}
--   Cada producto por fn_producto_int_fijar_precio / fn_producto_int_fijar_costo
--   (la misma regla de vigencia que el detalle y el formulario). No toca
--   `stock_levels.avg_cost`: el costo promedio lo mueve solo el kardex (B0).
--   Resumen: { cambiados, sin_cambio, omitidos: {codigo: n}, ejemplos: {codigo: [ids]} }.
-- fn_productos_estado_masivo(org, ids, estado) → { actualizados, variantes, no_encontrados }
--   active · inactive · discontinued · deleted; incluye las variantes de los
--   padres seleccionados (nunca revive una variante eliminada).
-- fn_productos_categoria_masiva(org, ids, categoria) → mismo resumen.
--
-- Permisos como el detalle (fn_producto_cambiar_estado / fn_producto_fijar_*):
-- editar = inventory.edit | product_management | inventory_management;
-- eliminar = inventory.delete | product_management | inventory_management.
-- Todas DEFINER, search_path fijo, REVOKE a anon y public.

-- ─── Alcance ────────────────────────────────────────────────────────────────
create or replace function public.fn_productos_masivo_alcance(
  p_organization_id integer, p_product_ids integer[])
returns integer[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.edit', 'product_management', 'inventory_management']);
  if coalesce(cardinality(p_product_ids), 0) > 50000 then
    raise exception 'demasiados_productos' using errcode = '22023', detail = '50000';
  end if;
  return public.fn_productos_int_expandir_variantes(p_organization_id, p_product_ids);
end;
$$;

-- ─── Interna: redondeo (espejo de calcularRedondeo del catálogo) ───────────
create or replace function public.fn_productos_int_redondear(
  p_valor numeric, p_modo text, p_multiplo numeric, p_digitos integer, p_fijo text)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_div numeric;
begin
  if p_valor is null or p_valor <= 0 then
    return p_valor;
  end if;
  if p_modo = 'multiplo' then
    if coalesce(p_multiplo, 0) <= 0 then return p_valor; end if;
    return round(p_valor / p_multiplo) * p_multiplo;
  end if;
  if coalesce(p_digitos, 0) <= 0 or p_fijo is null or p_fijo !~ '^[0-9]+$' then
    return p_valor;
  end if;
  v_div := power(10::numeric, p_digitos);
  return floor(p_valor / v_div) * v_div + p_fijo::numeric;
end;
$$;

-- ─── Precio, comparación y costo masivos ────────────────────────────────────
create or replace function public.fn_productos_precio_masivo(
  p_organization_id integer,
  p_product_ids integer[],
  p_tipo text,
  p_operacion text,
  p_opciones jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_modo text := p_opciones->>'modo';
  v_cantidad numeric := nullif(p_opciones->>'cantidad', '')::numeric;
  v_multiplo numeric := nullif(p_opciones->>'multiplo', '')::numeric;
  v_digitos integer := nullif(p_opciones->>'digitos', '')::integer;
  v_fijo text := p_opciones->>'valor';
  v_sobrescribir boolean := coalesce((p_opciones->>'sobrescribir')::boolean, false);
  v_id integer;
  v_precio record;
  v_costo record;
  v_actual numeric;
  v_nuevo numeric;
  v_comp numeric;
  v_cambio boolean;
  v_cambiados integer := 0;
  v_sin_cambio integer := 0;
  v_omitidos jsonb := '{}'::jsonb;
  v_ejemplos jsonb := '{}'::jsonb;
  v_motivo text;
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.edit', 'product_management', 'inventory_management']);
  if coalesce(cardinality(p_product_ids), 0) > 1000 then
    raise exception 'demasiados_productos' using errcode = '22023', detail = '1000';
  end if;
  if p_tipo not in ('venta', 'comparacion', 'compra') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_operacion = 'ajustar' then
    if v_modo not in ('fijo', 'valor', 'porcentaje') or v_cantidad is null then
      raise exception 'modo_invalido' using errcode = '22023';
    end if;
  elsif p_operacion = 'redondear' then
    if v_modo not in ('multiplo', 'digitos') then
      raise exception 'modo_invalido' using errcode = '22023';
    end if;
  elsif p_operacion = 'copiar_a_comparacion' then
    null;
  else
    raise exception 'operacion_invalida' using errcode = '22023';
  end if;

  -- Bloqueo en orden de id: dos acciones masivas simultáneas no se cruzan.
  perform 1 from public.products
   where id = any(coalesce(p_product_ids, '{}'::integer[]))
     and organization_id = p_organization_id
   order by id
     for update;

  for v_id in
    select p.id from public.products p
     where p.id = any(coalesce(p_product_ids, '{}'::integer[]))
       and p.organization_id = p_organization_id
       and coalesce(p.status, 'active') <> 'deleted'
     order by p.id
  loop
    v_motivo := null;
    v_cambio := false;

    if p_tipo = 'compra' then
      select cost, supplier_id into v_costo
        from public.product_costs
       where product_id = v_id and effective_from <= now()
         and (effective_to is null or effective_to > now())
       order by effective_from desc, id desc limit 1;
      v_actual := coalesce(v_costo.cost, 0);
      if p_operacion = 'ajustar' then
        if v_modo = 'porcentaje' and v_actual = 0 then
          v_motivo := 'sin_costo_previo';
        else
          v_nuevo := case v_modo
            when 'fijo' then v_cantidad
            when 'valor' then v_actual + v_cantidad
            else v_actual * (1 + v_cantidad / 100) end;
        end if;
      elsif p_operacion = 'redondear' then
        if v_actual <= 0 then
          v_motivo := 'sin_costo';
        else
          v_nuevo := public.fn_productos_int_redondear(v_actual, v_modo, v_multiplo, v_digitos, v_fijo);
        end if;
      else
        v_motivo := 'operacion_no_aplica';
      end if;
      if v_motivo is null then
        v_nuevo := round(greatest(0, v_nuevo), 2);
        v_cambio := public.fn_producto_int_fijar_costo(v_id, v_nuevo, null, v_costo.supplier_id);
      end if;
    else
      select price, compare_price into v_precio
        from public.product_prices
       where product_id = v_id and effective_from <= now()
         and (effective_to is null or effective_to > now())
       order by effective_from desc, id desc limit 1;
      v_actual := coalesce(v_precio.price, 0);
      v_comp := coalesce(v_precio.compare_price, 0);
      if p_operacion = 'copiar_a_comparacion' then
        if v_actual <= 0 then
          v_motivo := 'sin_precio';
        elsif v_comp > 0 and not v_sobrescribir then
          v_motivo := 'ya_tiene_comparacion';
        else
          v_nuevo := v_actual;
          v_comp := v_actual;
        end if;
      elsif p_tipo = 'venta' then
        if p_operacion = 'ajustar' then
          if v_precio.price is null and v_modo <> 'fijo' then
            v_motivo := 'sin_precio';
          else
            v_nuevo := case v_modo
              when 'fijo' then v_cantidad
              when 'valor' then v_actual + v_cantidad
              else v_actual * (1 + v_cantidad / 100) end;
          end if;
        elsif v_actual <= 0 then
          v_motivo := 'sin_precio';
        else
          v_nuevo := public.fn_productos_int_redondear(v_actual, v_modo, v_multiplo, v_digitos, v_fijo);
        end if;
      else -- comparacion
        if v_precio.price is null then
          v_motivo := 'sin_precio';
        elsif p_operacion = 'ajustar' then
          v_nuevo := v_actual;
          v_comp := case v_modo
            when 'fijo' then v_cantidad
            when 'valor' then v_comp + v_cantidad
            else v_comp * (1 + v_cantidad / 100) end;
        elsif v_comp <= 0 then
          v_motivo := 'sin_comparacion';
        else
          v_nuevo := v_actual;
          v_comp := public.fn_productos_int_redondear(v_comp, v_modo, v_multiplo, v_digitos, v_fijo);
        end if;
      end if;
      if v_motivo is null then
        v_nuevo := round(greatest(0, v_nuevo), 2);
        v_comp := nullif(round(greatest(0, v_comp), 2), 0);
        v_cambio := public.fn_producto_int_fijar_precio(v_id, v_nuevo, v_comp, null);
      end if;
    end if;

    if v_motivo is not null then
      v_omitidos := jsonb_set(v_omitidos, array[v_motivo],
        to_jsonb(coalesce((v_omitidos->>v_motivo)::integer, 0) + 1));
      if coalesce(jsonb_array_length(v_ejemplos->v_motivo), 0) < 20 then
        v_ejemplos := jsonb_set(v_ejemplos, array[v_motivo],
          coalesce(v_ejemplos->v_motivo, '[]'::jsonb) || to_jsonb(v_id));
      end if;
    elsif v_cambio then
      v_cambiados := v_cambiados + 1;
      update public.products set updated_at = now() where id = v_id;
    else
      v_sin_cambio := v_sin_cambio + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'cambiados', v_cambiados,
    'sin_cambio', v_sin_cambio,
    'no_encontrados', coalesce(cardinality(array(select distinct x from unnest(p_product_ids) x)), 0)
                        - v_cambiados - v_sin_cambio
                        - coalesce((select sum(value::integer) from jsonb_each_text(v_omitidos)), 0),
    'omitidos', v_omitidos,
    'ejemplos', v_ejemplos);
end;
$$;

-- ─── Interna: seleccionados + variantes de los padres seleccionados ────────
create or replace function public.fn_productos_int_con_variantes(p_org integer, p_ids integer[])
returns integer[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct x.id order by x.id), '{}'::integer[]) from (
    select p.id from public.products p
     where p.id = any(coalesce(p_ids, '{}'::integer[])) and p.organization_id = p_org
       and coalesce(p.status, 'active') <> 'deleted'
    union
    select c.id from public.products c
     where c.parent_product_id = any(coalesce(p_ids, '{}'::integer[])) and c.organization_id = p_org
       and coalesce(c.status, 'active') <> 'deleted'
  ) x;
$$;

-- ─── Estado masivo (incluye eliminar) ───────────────────────────────────────
create or replace function public.fn_productos_estado_masivo(
  p_organization_id integer, p_product_ids integer[], p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids integer[];
  v_n integer;
  v_sel integer;
begin
  if p_status = 'deleted' then
    perform public.fn_productos_exigir_permiso(p_organization_id,
      array['inventory.delete', 'product_management', 'inventory_management']);
  else
    perform public.fn_productos_exigir_permiso(p_organization_id,
      array['inventory.edit', 'product_management', 'inventory_management']);
  end if;
  if p_status is null or p_status not in ('active', 'inactive', 'discontinued', 'deleted') then
    raise exception 'estado_invalido' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_product_ids), 0) > 5000 then
    raise exception 'demasiados_productos' using errcode = '22023', detail = '5000';
  end if;
  v_ids := public.fn_productos_int_con_variantes(p_organization_id, p_product_ids);
  select count(*) into v_sel from public.products
   where id = any(coalesce(p_product_ids, '{}'::integer[])) and id = any(v_ids);

  perform 1 from public.products where id = any(v_ids) order by id for update;
  update public.products set status = p_status, updated_at = now()
   where id = any(v_ids) and organization_id = p_organization_id
     and status is distinct from p_status;
  get diagnostics v_n = row_count;

  return jsonb_build_object(
    'actualizados', v_n,
    'seleccionados', v_sel,
    'variantes', cardinality(v_ids) - v_sel,
    'no_encontrados', coalesce(cardinality(array(select distinct x from unnest(p_product_ids) x)), 0) - v_sel);
end;
$$;

-- ─── Categoría masiva ───────────────────────────────────────────────────────
create or replace function public.fn_productos_categoria_masiva(
  p_organization_id integer, p_product_ids integer[], p_category_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids integer[];
  v_n integer;
  v_sel integer;
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.edit', 'product_management', 'inventory_management']);
  if not exists (select 1 from public.categories c
                  where c.id = p_category_id and c.organization_id = p_organization_id) then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_product_ids), 0) > 5000 then
    raise exception 'demasiados_productos' using errcode = '22023', detail = '5000';
  end if;
  v_ids := public.fn_productos_int_con_variantes(p_organization_id, p_product_ids);
  select count(*) into v_sel from public.products
   where id = any(coalesce(p_product_ids, '{}'::integer[])) and id = any(v_ids);

  perform 1 from public.products where id = any(v_ids) order by id for update;
  update public.products set category_id = p_category_id, updated_at = now()
   where id = any(v_ids) and organization_id = p_organization_id
     and category_id is distinct from p_category_id;
  get diagnostics v_n = row_count;

  return jsonb_build_object(
    'actualizados', v_n,
    'seleccionados', v_sel,
    'variantes', cardinality(v_ids) - v_sel,
    'no_encontrados', coalesce(cardinality(array(select distinct x from unnest(p_product_ids) x)), 0) - v_sel);
end;
$$;

revoke all on function public.fn_productos_masivo_alcance(integer, integer[]) from public, anon;
revoke all on function public.fn_productos_precio_masivo(integer, integer[], text, text, jsonb) from public, anon;
revoke all on function public.fn_productos_estado_masivo(integer, integer[], text) from public, anon;
revoke all on function public.fn_productos_categoria_masiva(integer, integer[], integer) from public, anon;
revoke all on function public.fn_productos_int_redondear(numeric, text, numeric, integer, text) from public, anon, authenticated;
revoke all on function public.fn_productos_int_con_variantes(integer, integer[]) from public, anon, authenticated;
grant execute on function public.fn_productos_masivo_alcance(integer, integer[]) to authenticated, service_role;
grant execute on function public.fn_productos_precio_masivo(integer, integer[], text, text, jsonb) to authenticated, service_role;
grant execute on function public.fn_productos_estado_masivo(integer, integer[], text) to authenticated, service_role;
grant execute on function public.fn_productos_categoria_masiva(integer, integer[], integer) to authenticated, service_role;
