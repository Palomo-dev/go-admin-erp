-- Rollback de 20260928231000_producto_guardar_con_recetas.sql
--
-- Revertir ANTES que 20260928230000_receta_resolutor_unico (estas funciones usan las de allá).
-- DATOS: las recetas y versiones guardadas desde el formulario se conservan (product_recipes y
-- recipe_ingredients no se tocan); se pierde la tabla de idempotencia (solo resultados de guardados
-- ya hechos). El formulario desplegado envía «receta» y «clave_idempotencia»: con la función anterior
-- esas claves se ignoran, así que hay que revertir también el código del formulario.

-- fn_producto_guardar: cuerpo anterior, igual a 20260924110000_producto_formulario_transaccional.sql.
create or replace function public.fn_producto_guardar(p_organization_id integer, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_modo text := coalesce(p_payload->>'modo', 'crear');
  v_pr jsonb := coalesce(p_payload->'producto', '{}'::jsonb);
  v_id integer;
  v_uuid uuid;
  v_sku text := btrim(coalesce(v_pr->>'sku', ''));
  v_name text := btrim(coalesce(v_pr->>'name', ''));
  v_tiene_var boolean := coalesce((p_payload->>'tiene_variantes')::boolean, false);
  v_track boolean;
  v_x jsonb;
  v_ids integer[];
  v_gid integer;
  v_quitadas jsonb := '[]'::jsonb;
  v_vars jsonb := '[]'::jsonb;
  v_vid integer;
  v_i integer;
  v_pref integer;
  v_costo numeric := nullif(p_payload->'costo'->>'cost', '')::numeric;
  v_precio numeric := nullif(p_payload->'precio'->>'price', '')::numeric;
  v_comp numeric := nullif(p_payload->'precio'->>'compare_price', '')::numeric;
begin
  if v_modo not in ('crear', 'editar', 'duplicar') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  if v_modo = 'editar' then
    perform public.fn_productos_exigir_permiso(p_organization_id,
      array['inventory.edit', 'product_management', 'inventory_management']);
  else
    perform public.fn_productos_exigir_permiso(p_organization_id,
      array['inventory.create', 'product_management', 'inventory_management']);
  end if;

  -- Validación (los códigos los traduce la interfaz y marcan el campo).
  if v_sku = '' then
    raise exception 'sku_requerido' using errcode = '22023';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'nombre_corto' using errcode = '22023';
  end if;
  if v_precio is not null and v_precio < 0 then
    raise exception 'precio_negativo' using errcode = '22023';
  end if;
  if v_costo is not null and v_costo < 0 then
    raise exception 'costo_negativo' using errcode = '22023';
  end if;
  if v_comp is not null and v_comp > 0 and v_precio is not null and v_comp <= v_precio then
    raise exception 'comparacion_menor' using errcode = '22023';
  end if;
  if coalesce(v_pr->>'status', 'active') not in ('active', 'inactive', 'discontinued') then
    raise exception 'estado_invalido' using errcode = '22023';
  end if;
  if coalesce(v_pr->>'product_type', 'product') not in ('product', 'service') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if nullif(v_pr->>'station', '') is not null and v_pr->>'station' not in ('hot_kitchen', 'cold_kitchen', 'bar', 'cashier', 'all') then
    raise exception 'estacion_invalida' using errcode = '22023';
  end if;
  if nullif(v_pr->>'category_id', '') is not null and not exists (
       select 1 from public.categories where id = (v_pr->>'category_id')::int and organization_id = p_organization_id) then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p_payload->'categorias_adicionales', '[]'::jsonb)) c
              where not exists (select 1 from public.categories where id = c::int and organization_id = p_organization_id)) then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p_payload->'impuestos', '[]'::jsonb)) t
              where not exists (select 1 from public.organization_taxes where id = t::uuid and organization_id = p_organization_id)) then
    raise exception 'impuesto_invalido' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p_payload->'etiquetas', '[]'::jsonb)) t
              where not exists (select 1 from public.product_tags where id = t::int and organization_id = p_organization_id)) then
    raise exception 'etiqueta_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_payload->'proveedores', '[]'::jsonb)) s
              where not exists (select 1 from public.suppliers where id = (s->>'supplier_id')::int and organization_id = p_organization_id)) then
    raise exception 'proveedor_invalido' using errcode = '22023';
  end if;
  if exists (select 1 from public.products where organization_id = p_organization_id and sku = v_sku
              and (v_modo <> 'editar' or id <> (p_payload->>'product_id')::int)) then
    raise exception 'sku_duplicado' using errcode = '23505', detail = v_sku;
  end if;
  -- SKU repetidos dentro de las variantes del mismo guardado.
  if exists (select btrim(v->>'sku') from jsonb_array_elements(coalesce(p_payload->'variantes', '[]'::jsonb)) v
              group by 1 having count(*) > 1 or btrim(v->>'sku') = v_sku) then
    raise exception 'sku_variante_repetido' using errcode = '23505';
  end if;

  v_track := coalesce((v_pr->>'track_stock')::boolean, true) and coalesce(v_pr->>'product_type', 'product') <> 'service';

  if v_modo = 'editar' then
    v_id := (p_payload->>'product_id')::int;
    perform 1 from public.products where id = v_id and organization_id = p_organization_id and parent_product_id is null for update;
    if not found then
      raise exception 'producto_no_encontrado' using errcode = 'P0002';
    end if;
    if not v_tiene_var and exists (select 1 from public.products where parent_product_id = v_id and status <> 'deleted') then
      raise exception 'variantes_activas' using errcode = '22023';
    end if;
    update public.products set
      sku = v_sku, name = v_name,
      barcode = nullif(btrim(coalesce(v_pr->>'barcode', '')), ''),
      description = nullif(v_pr->>'description', ''),
      category_id = nullif(v_pr->>'category_id', '')::int,
      unit_code = coalesce(nullif(v_pr->>'unit_code', ''), unit_code),
      station = nullif(v_pr->>'station', ''),
      product_type = coalesce(nullif(v_pr->>'product_type', ''), 'product'),
      status = coalesce(nullif(v_pr->>'status', ''), status),
      brand = nullif(btrim(coalesce(v_pr->>'brand', '')), ''),
      reference = nullif(btrim(coalesce(v_pr->>'reference', '')), ''),
      track_stock = v_track,
      track_serial = coalesce((v_pr->>'track_serial')::boolean, false),
      serial_pattern = nullif(btrim(coalesce(v_pr->>'serial_pattern', '')), ''),
      auto_generate_serial = coalesce((v_pr->>'auto_generate_serial')::boolean, false),
      warranty_months = nullif(v_pr->>'warranty_months', '')::int,
      weight_kg = nullif(v_pr->>'weight_kg', '')::numeric,
      length_cm = nullif(v_pr->>'length_cm', '')::numeric,
      width_cm = nullif(v_pr->>'width_cm', '')::numeric,
      height_cm = nullif(v_pr->>'height_cm', '')::numeric,
      is_composite = coalesce((v_pr->>'is_composite')::boolean, is_composite),
      is_parent = v_tiene_var,
      updated_at = now()
     where id = v_id
    returning uuid into v_uuid;
    -- Las variantes heredan el seguimiento de inventario y de seriales.
    update public.products set track_stock = v_track,
           track_serial = coalesce((v_pr->>'track_serial')::boolean, false),
           warranty_months = nullif(v_pr->>'warranty_months', '')::int, updated_at = now()
     where parent_product_id = v_id;
  else
    insert into public.products (
      organization_id, sku, name, barcode, description, category_id, unit_code, station, product_type,
      status, brand, reference, track_stock, track_serial, serial_pattern, auto_generate_serial,
      warranty_months, weight_kg, length_cm, width_cm, height_cm, is_composite, is_parent)
    values (
      p_organization_id, v_sku, v_name, nullif(btrim(coalesce(v_pr->>'barcode', '')), ''), nullif(v_pr->>'description', ''),
      nullif(v_pr->>'category_id', '')::int, coalesce(nullif(v_pr->>'unit_code', ''), 'UN'), nullif(v_pr->>'station', ''),
      coalesce(nullif(v_pr->>'product_type', ''), 'product'), coalesce(nullif(v_pr->>'status', ''), 'active'),
      nullif(btrim(coalesce(v_pr->>'brand', '')), ''), nullif(btrim(coalesce(v_pr->>'reference', '')), ''), v_track,
      coalesce((v_pr->>'track_serial')::boolean, false), nullif(btrim(coalesce(v_pr->>'serial_pattern', '')), ''),
      coalesce((v_pr->>'auto_generate_serial')::boolean, false), nullif(v_pr->>'warranty_months', '')::int,
      nullif(v_pr->>'weight_kg', '')::numeric, nullif(v_pr->>'length_cm', '')::numeric,
      nullif(v_pr->>'width_cm', '')::numeric, nullif(v_pr->>'height_cm', '')::numeric,
      coalesce((v_pr->>'is_composite')::boolean, false), v_tiene_var)
    returning id, uuid into v_id, v_uuid;
  end if;

  -- Precio y costo (con vigencia; en crear, precio 0 se omite como antes).
  if p_payload ? 'precio' and v_precio is not null and (v_modo = 'editar' or v_precio > 0) then
    perform public.fn_producto_int_fijar_precio(v_id, v_precio, v_comp, nullif(p_payload->'precio'->>'desde', '')::timestamptz);
  end if;
  if p_payload ? 'costo' and v_costo is not null and (v_modo = 'editar' or v_costo > 0) then
    select (s->>'supplier_id')::int into v_pref
      from jsonb_array_elements(coalesce(p_payload->'proveedores', '[]'::jsonb)) s
     where coalesce((s->>'is_preferred')::boolean, false) limit 1;
    perform public.fn_producto_int_fijar_costo(v_id, v_costo, nullif(p_payload->'costo'->>'desde', '')::timestamptz, v_pref);
  end if;

  -- Impuestos (N por producto) y propagación a las variantes.
  if p_payload ? 'impuestos' then
    select coalesce(array_agg(c.id), '{}') into v_ids from public.products c where c.parent_product_id = v_id;
    delete from public.product_tax_relations where product_id = v_id or product_id = any(v_ids);
    insert into public.product_tax_relations (product_id, tax_id)
    select pid, t::uuid
      from unnest(array[v_id] || v_ids) pid
     cross join jsonb_array_elements_text(p_payload->'impuestos') t
    on conflict do nothing;
  end if;

  -- Categorías adicionales (las asignadas por regla no se tocan).
  if p_payload ? 'categorias_adicionales' then
    delete from public.product_category_relations
     where product_id = v_id and not assigned_by_rule
       and category_id not in (select c::int from jsonb_array_elements_text(p_payload->'categorias_adicionales') c);
    insert into public.product_category_relations (product_id, category_id, organization_id, assigned_by_rule)
    select v_id, c::int, p_organization_id, false
      from jsonb_array_elements_text(p_payload->'categorias_adicionales') c
     where c::int is distinct from nullif(v_pr->>'category_id', '')::int
       and not exists (select 1 from public.product_category_relations r where r.product_id = v_id and r.category_id = c::int);
  end if;

  -- Etiquetas (conjunto completo).
  if p_payload ? 'etiquetas' then
    delete from public.product_tag_relations
     where product_id = v_id and tag_id not in (select t::int from jsonb_array_elements_text(p_payload->'etiquetas') t);
    insert into public.product_tag_relations (product_id, tag_id)
    select v_id, t::int from jsonb_array_elements_text(p_payload->'etiquetas') t
     where not exists (select 1 from public.product_tag_relations r where r.product_id = v_id and r.tag_id = t::int);
  end if;

  -- Proveedores: se fusionan (los que no vienen se quedan) y el preferido es uno.
  if p_payload ? 'proveedores' then
    if exists (select 1 from jsonb_array_elements(p_payload->'proveedores') s where coalesce((s->>'is_preferred')::boolean, false)) then
      update public.product_suppliers set is_preferred = false, updated_at = now() where product_id = v_id and is_preferred;
    end if;
    for v_x in select * from jsonb_array_elements(p_payload->'proveedores') loop
      insert into public.product_suppliers (product_id, supplier_id, cost, lead_time_days, min_order_qty, supplier_sku, notes, is_preferred)
      values (v_id, (v_x->>'supplier_id')::int, coalesce(nullif(v_x->>'cost', '')::numeric, v_costo, 0),
              coalesce(nullif(v_x->>'lead_time_days', '')::int, 0), coalesce(nullif(v_x->>'min_order_qty', '')::numeric, 1),
              nullif(btrim(coalesce(v_x->>'supplier_sku', '')), ''), nullif(btrim(coalesce(v_x->>'notes', '')), ''),
              coalesce((v_x->>'is_preferred')::boolean, false))
      on conflict (product_id, supplier_id) do update set
        cost = excluded.cost,
        lead_time_days = case when v_x ? 'lead_time_days' then excluded.lead_time_days else product_suppliers.lead_time_days end,
        min_order_qty = case when v_x ? 'min_order_qty' then excluded.min_order_qty else product_suppliers.min_order_qty end,
        supplier_sku = case when v_x ? 'supplier_sku' then excluded.supplier_sku else product_suppliers.supplier_sku end,
        notes = case when v_x ? 'notes' then excluded.notes else product_suppliers.notes end,
        is_preferred = excluded.is_preferred,
        updated_at = now();
    end loop;
    if coalesce(p_payload->>'proveedores_quitar_preferido', 'false')::boolean then
      update public.product_suppliers set is_preferred = false, updated_at = now() where product_id = v_id and is_preferred;
    end if;
  end if;

  -- Stock: crear/duplicar = entradas por kardex; editar = solo mínimos y filas faltantes.
  if v_track and not v_tiene_var then
    if v_modo = 'editar' then
      perform public.fn_producto_int_stock_inicial(p_organization_id, v_id,
        (select coalesce(jsonb_agg(s - 'qty'), '[]'::jsonb) from jsonb_array_elements(coalesce(p_payload->'stock', '[]'::jsonb)) s), null);
    else
      perform public.fn_producto_int_stock_inicial(p_organization_id, v_id,
        (select coalesce(jsonb_agg(case when s ? 'unit_cost' and coalesce((s->>'unit_cost')::numeric, 0) > 0 then s
                                        else s || jsonb_build_object('unit_cost', coalesce(v_costo, 0)) end), '[]'::jsonb)
           from jsonb_array_elements(coalesce(p_payload->'stock', '[]'::jsonb)) s), 'Stock inicial');
    end if;
  end if;

  -- Variantes: crear o actualizar; las que ya no vienen pasan a baja lógica.
  if v_tiene_var then
    for v_x in select * from jsonb_array_elements(coalesce(p_payload->'variantes', '[]'::jsonb)) loop
      if v_modo <> 'editar' then
        v_x := v_x - 'id';
      end if;
      -- En editar, la cantidad de una variante existente no se toca aquí (va por ajuste).
      if nullif(v_x->>'id', '') is not null then
        v_x := jsonb_set(v_x, '{stock}', (select coalesce(jsonb_agg(s - 'qty'), '[]'::jsonb)
                                            from jsonb_array_elements(coalesce(v_x->'stock', '[]'::jsonb)) s));
      end if;
      v_vid := public.fn_producto_int_variante_guardar(p_organization_id, v_id, v_x, false);
      v_vars := v_vars || jsonb_build_object('id', v_vid, 'sku', btrim(coalesce(v_x->>'sku', '')));
    end loop;
    if v_modo = 'editar' then
      update public.products set status = 'deleted', updated_at = now()
       where parent_product_id = v_id and status <> 'deleted'
         and id not in (select (x->>'id')::int from jsonb_array_elements(v_vars) x);
    end if;
  end if;

  -- Modificadores (lista completa cuando viene).
  if p_payload ? 'modificadores' and jsonb_typeof(p_payload->'modificadores') = 'array' then
    select coalesce(array_agg((g->>'id')::int), '{}') into v_ids
      from jsonb_array_elements(p_payload->'modificadores') g
     where v_modo = 'editar' and nullif(g->>'id', '') is not null;
    delete from public.product_modifier_groups where product_id = v_id and not (id = any(v_ids));
    v_i := 0;
    for v_x in select * from jsonb_array_elements(p_payload->'modificadores') loop
      if btrim(coalesce(v_x->>'name', '')) = '' then
        raise exception 'grupo_sin_nombre' using errcode = '22023';
      end if;
      if coalesce(v_x->>'selection_mode', 'multiple') not in ('single', 'multiple') then
        raise exception 'modo_seleccion_invalido' using errcode = '22023';
      end if;
      if nullif(v_x->>'max_selections', '') is not null
         and (v_x->>'max_selections')::int < coalesce(nullif(v_x->>'min_selections', '')::int, 0) then
        raise exception 'min_max_invalido' using errcode = '22023';
      end if;
      v_gid := case when v_modo = 'editar' then nullif(v_x->>'id', '')::int end;
      if v_gid is not null and exists (select 1 from public.product_modifier_groups where id = v_gid and product_id = v_id) then
        update public.product_modifier_groups set
          name = btrim(v_x->>'name'), selection_mode = coalesce(v_x->>'selection_mode', 'multiple'),
          min_selections = coalesce(nullif(v_x->>'min_selections', '')::int, 0),
          max_selections = nullif(v_x->>'max_selections', '')::int,
          required = coalesce((v_x->>'required')::boolean, false), display_order = v_i, updated_at = now()
         where id = v_gid;
      else
        insert into public.product_modifier_groups (organization_id, product_id, name, selection_mode, min_selections,
          max_selections, required, display_order)
        values (p_organization_id, v_id, btrim(v_x->>'name'), coalesce(v_x->>'selection_mode', 'multiple'),
          coalesce(nullif(v_x->>'min_selections', '')::int, 0), nullif(v_x->>'max_selections', '')::int,
          coalesce((v_x->>'required')::boolean, false), v_i)
        returning id into v_gid;
      end if;
      delete from public.product_modifiers
       where group_id = v_gid
         and id not in (select (o->>'id')::int from jsonb_array_elements(coalesce(v_x->'opciones', '[]'::jsonb)) o
                         where v_modo = 'editar' and nullif(o->>'id', '') is not null);
      insert into public.product_modifiers (group_id, name, extra_price, is_active, display_order)
      select v_gid, btrim(o.value->>'name'), coalesce(nullif(o.value->>'extra_price', '')::numeric, 0),
             coalesce((o.value->>'is_active')::boolean, true), (o.ordinality - 1)::int
        from jsonb_array_elements(coalesce(v_x->'opciones', '[]'::jsonb)) with ordinality o
       where btrim(coalesce(o.value->>'name', '')) <> ''
         and (v_modo <> 'editar' or nullif(o.value->>'id', '') is null
              or not exists (select 1 from public.product_modifiers pm where pm.id = (o.value->>'id')::int and pm.group_id = v_gid));
      update public.product_modifiers pm set
        name = btrim(o.value->>'name'), extra_price = coalesce(nullif(o.value->>'extra_price', '')::numeric, 0),
        is_active = coalesce((o.value->>'is_active')::boolean, true), display_order = (o.ordinality - 1)::int, updated_at = now()
        from jsonb_array_elements(coalesce(v_x->'opciones', '[]'::jsonb)) with ordinality o
       where v_modo = 'editar' and pm.group_id = v_gid and nullif(o.value->>'id', '') is not null
         and pm.id = (o.value->>'id')::int;
      v_i := v_i + 1;
    end loop;
  end if;

  -- Imágenes (lista completa y ordenada cuando viene). Se devuelven las rutas
  -- que quedan sin uso para que el navegador las borre del almacenamiento.
  if p_payload ? 'imagenes' and jsonb_typeof(p_payload->'imagenes') = 'array' then
    select coalesce(array_agg(pi.id), '{}') into v_ids
      from public.product_images pi
     where pi.product_id = v_id
       and pi.id not in (select (i->>'id')::int from jsonb_array_elements(p_payload->'imagenes') i
                          where v_modo = 'editar' and nullif(i->>'id', '') is not null);
    -- Rutas que nadie más usa (ni otra fila ni la biblioteca compartida).
    select coalesce(jsonb_agg(distinct pi.storage_path), '[]'::jsonb) into v_quitadas
      from public.product_images pi
     where pi.id = any(v_ids) and pi.shared_image_id is null
       and not exists (select 1 from public.product_images o
                        where o.storage_path = pi.storage_path and not (o.id = any(v_ids)))
       and not exists (select 1 from jsonb_array_elements(p_payload->'imagenes') i
                        where i->>'storage_path' = pi.storage_path);
    delete from public.product_images where id = any(v_ids);
    update public.product_images set display_order = -1000000 - id where product_id = v_id;
    v_i := 0;
    for v_x in select * from jsonb_array_elements(p_payload->'imagenes') loop
      if v_modo = 'editar' and nullif(v_x->>'id', '') is not null
         and exists (select 1 from public.product_images where id = (v_x->>'id')::int and product_id = v_id) then
        update public.product_images set display_order = v_i,
               is_primary = coalesce((v_x->>'is_primary')::boolean, false),
               alt_text = nullif(btrim(coalesce(v_x->>'alt_text', '')), ''), updated_at = now()
         where id = (v_x->>'id')::int;
      else
        if btrim(coalesce(v_x->>'storage_path', '')) = '' then
          raise exception 'imagen_sin_ruta' using errcode = '22023';
        end if;
        insert into public.product_images (product_id, storage_path, display_order, is_primary, alt_text, shared_image_id)
        values (v_id, v_x->>'storage_path', v_i, coalesce((v_x->>'is_primary')::boolean, false),
                nullif(btrim(coalesce(v_x->>'alt_text', '')), ''), nullif(v_x->>'shared_image_id', '')::int);
      end if;
      v_i := v_i + 1;
    end loop;
    -- Una sola principal: si no hay, la primera.
    if not exists (select 1 from public.product_images where product_id = v_id and is_primary) then
      update public.product_images set is_primary = true
       where id = (select id from public.product_images where product_id = v_id order by display_order limit 1);
    end if;
  end if;

  -- Nota interna.
  if nullif(btrim(coalesce(p_payload->>'nota', '')), '') is not null and auth.uid() is not null then
    insert into public.product_notes (product_id, user_id, content, organization_id)
    values (v_id, auth.uid(), p_payload->>'nota', p_organization_id);
  end if;

  return jsonb_build_object(
    'id', v_id, 'uuid', v_uuid, 'sku', v_sku, 'name', v_name,
    'price', coalesce(v_precio, 0), 'cost', coalesce(v_costo, 0),
    'variantes', v_vars, 'imagenes_quitadas', v_quitadas);
end;
$$;

revoke all on function public.fn_producto_guardar(integer, jsonb) from public, anon;
grant execute on function public.fn_producto_guardar(integer, jsonb) to authenticated, service_role;

drop function if exists public.fn_receta_expandir(integer, numeric);
drop function if exists public.fn_receta_necesidades(integer, integer, jsonb);
drop function if exists public.fn_receta_costo(integer, integer, jsonb);
drop function if exists public.fn_producto_recetas_para_formulario(integer, integer);
drop function if exists public.fn_receta_guardar(integer, integer, jsonb);
drop function if exists public.fn_receta_int_guardar_version(integer, integer, jsonb);

drop table if exists public.product_save_requests;
