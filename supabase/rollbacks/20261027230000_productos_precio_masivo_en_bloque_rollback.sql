-- Rollback de 20261027230000: vuelve a la definición de fn_productos_precio_masivo que estaba en prod
-- el 2026-10-27 (pg_get_functiondef, loop fila por fila). Reintroduce el timeout en lotes grandes.
CREATE OR REPLACE FUNCTION public.fn_productos_precio_masivo(p_organization_id integer, p_product_ids integer[], p_tipo text, p_operacion text, p_opciones jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

revoke all on function public.fn_productos_precio_masivo(integer, integer[], text, text, jsonb) from public, anon;
grant execute on function public.fn_productos_precio_masivo(integer, integer[], text, text, jsonb) to authenticated, service_role;

delete from supabase_migrations.schema_migrations where version = '20261027230000';
