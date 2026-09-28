-- Importación de productos en servidor, por lotes y transaccional.
--
-- Sustituye la importación fila a fila desde el navegador
-- (`/app/inventario/productos/importar`, decenas de llamadas por producto sin
-- transacción) y la importación del scraping que hacía la Edge Function
-- `product-scraper` con service role y la organización del body.
--
-- fn_importar_productos_lote(p_organization_id, p_branch_id, p_modo, p_filas, p_opciones)
--   - SECURITY DEFINER + fn_assert_acceso_org (pertenencia) + REVOKE anon/public.
--   - Una llamada = un lote (≤ 200 filas). Cada fila va en su propia
--     subtransacción: si falla, se deshace SOLO esa fila y se informa; el resto
--     del lote se confirma junto.
--   - Categorías: busca por nombre normalizado (sin tildes ni mayúsculas) o
--     slug; si no existe la crea con slug ÚNICO por organización (sufijo -2, -3…).
--   - Stock inicial por kardex: fn_register_stock_entry (stock_levels +
--     stock_movements, que dispara el asiento contable). Nunca se suma
--     cantidad a stock_levels a mano (solo se fija `min_level`).
--   - Precios y costos con vigencia: se cierra el vigente y se abre otro solo
--     si cambia.
--   - Variantes: sku_padre → parent_product_id (el padre queda is_parent),
--     variant_data + product_variant_relations (variant_types / variant_values).
--   - Modificadores: en actualización se reemplazan TODOS los grupos una sola
--     vez (antes se borraban dentro del bucle y solo sobrevivía el último).
--   - Estación: solo valores del CHECK (hot_kitchen, cold_kitchen, bar, cashier,
--     all); «kitchen» → hot_kitchen.
--
-- fn_import_normalizar(text): nombre comparable (minúsculas, sin tildes, signos → espacio).

create or replace function public.fn_import_normalizar(p_texto text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p_texto, '')),
      'áéíóúàèìòùäëïöüâêîôûãõñç',
      'aeiouaeiouaeiouaeiouaonc'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

revoke all on function public.fn_import_normalizar(text) from public, anon;
grant execute on function public.fn_import_normalizar(text) to authenticated, service_role;

create or replace function public.fn_importar_productos_lote(
  p_organization_id integer,
  p_branch_id integer,
  p_modo text,
  p_filas jsonb,
  p_opciones jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_stock_existentes text := coalesce(nullif(p_opciones->>'stock_existentes', ''), 'ignorar');
  v_origen text := case when p_opciones->>'origen' = 'web' then 'web' else 'archivo' end;
  v_fuente text := nullif(left(coalesce(p_opciones->>'fuente_url', ''), 300), '');
  v_row jsonb;
  v_resultados jsonb := '[]'::jsonb;
  v_avisos jsonb;
  v_fila integer;
  v_sku text;
  v_nombre text;
  v_tipo text;
  v_unidad text;
  v_estacion text;
  v_estado text;
  v_track boolean;
  v_existente_id integer;
  v_existente_estado text;
  v_product_id integer;
  v_accion text;
  v_n integer;
  v_category_id integer;
  v_categoria text;
  v_slug_base text;
  v_slug text;
  v_parent_id integer;
  v_variante jsonb;
  v_precio numeric;
  v_comparacion numeric;
  v_costo numeric;
  v_stock numeric;
  v_minimo numeric;
  v_prev_id integer;
  v_prev_precio numeric;
  v_prev_comparacion numeric;
  v_prev_costo numeric;
  v_proveedor text;
  v_proveedor_id integer;
  v_primer_proveedor integer;
  v_tax_id uuid;
  v_impuesto text;
  v_tasa numeric;
  v_etiqueta text;
  v_tag_id integer;
  v_primera_etiqueta integer;
  v_grupo jsonb;
  v_grupo_id integer;
  v_opcion jsonb;
  v_i integer;
  v_k text;
  v_v text;
  v_vt_id integer;
  v_vv_id integer;
  v_creados integer := 0;
  v_actualizados integer := 0;
  v_omitidos integer := 0;
  v_fallidos integer := 0;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if p_modo not in ('crear_y_actualizar', 'solo_crear', 'solo_actualizar', 'duplicar') then
    raise exception 'MODO_INVALIDO' using errcode = '22023';
  end if;
  if v_stock_existentes not in ('ignorar', 'sumar') then
    raise exception 'STOCK_EXISTENTES_INVALIDO' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORGANIZACION' using errcode = '42501';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'FILAS_REQUERIDAS' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) > 200 then
    raise exception 'DEMASIADAS_FILAS' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_filas) loop
    v_fila := nullif(v_row->>'fila', '')::integer;
    v_sku := left(nullif(btrim(v_row->>'sku'), ''), 100);
    v_avisos := '[]'::jsonb;
    v_product_id := null;
    v_accion := null;

    begin
      v_nombre := left(nullif(btrim(v_row->>'nombre'), ''), 200);
      if v_sku is null then raise exception 'SIN_SKU' using errcode = '22023'; end if;
      if v_nombre is null then raise exception 'SIN_NOMBRE' using errcode = '22023'; end if;

      select p.id, p.status into v_existente_id, v_existente_estado
        from public.products p
       where p.organization_id = p_organization_id and p.sku = v_sku;

      if v_existente_id is not null and p_modo = 'solo_crear' then
        v_accion := 'omitido';
        v_avisos := v_avisos || jsonb_build_object('codigo', 'EXISTE_OMITIDO');
      elsif v_existente_id is null and p_modo = 'solo_actualizar' then
        v_accion := 'omitido';
        v_avisos := v_avisos || jsonb_build_object('codigo', 'NO_EXISTE_OMITIDO');
      end if;

      if v_accion is null then
        if v_existente_id is not null and p_modo = 'duplicar' then
          v_n := 2;
          while exists (select 1 from public.products p where p.organization_id = p_organization_id and p.sku = v_sku || '-' || v_n) loop
            v_n := v_n + 1;
          end loop;
          v_sku := v_sku || '-' || v_n;
          v_existente_id := null;
          v_avisos := v_avisos || jsonb_build_object('codigo', 'SKU_RENOMBRADO', 'detalle', v_sku);
        end if;

        -- ── Valores normalizados ────────────────────────────────────────
        v_tipo := case when v_row->>'tipo' = 'service' then 'service' else 'product' end;
        v_track := coalesce(nullif(v_row->>'rastrear_stock', '')::boolean, v_tipo = 'product');
        v_unidad := upper(nullif(btrim(v_row->>'unidad'), ''));
        if v_unidad is null or not exists (select 1 from public.units u where u.code = v_unidad) then
          v_unidad := case when v_tipo = 'service' then 'SV' else 'UN' end;
        end if;
        v_estacion := nullif(v_row->>'estacion', '');
        if v_estacion = 'kitchen' then v_estacion := 'hot_kitchen'; end if;
        if v_estacion is not null and v_estacion not in ('hot_kitchen', 'cold_kitchen', 'bar', 'cashier', 'all') then
          v_estacion := null;
        end if;
        v_estado := coalesce(nullif(v_row->>'estado', ''), 'active');
        if v_estado not in ('active', 'inactive', 'discontinued') then v_estado := 'active'; end if;
        v_precio := nullif(v_row->>'precio', '')::numeric;
        v_comparacion := nullif(v_row->>'precio_comparacion', '')::numeric;
        if v_comparacion is not null and (v_precio is null or v_comparacion <= v_precio) then v_comparacion := null; end if;
        v_costo := nullif(v_row->>'costo', '')::numeric;
        v_stock := nullif(v_row->>'stock', '')::numeric;
        v_minimo := nullif(v_row->>'stock_minimo', '')::numeric;
        if v_precio is not null and v_precio < 0 then raise exception 'PRECIO_INVALIDO' using errcode = '22023'; end if;
        if v_costo is not null and v_costo < 0 then raise exception 'COSTO_INVALIDO' using errcode = '22023'; end if;
        if v_stock is not null and v_stock < 0 then raise exception 'STOCK_INVALIDO' using errcode = '22023'; end if;
        v_variante := case when jsonb_typeof(v_row->'datos_variante') = 'object' then v_row->'datos_variante' else null end;

        -- ── Categoría (slug único por organización) ─────────────────────
        v_category_id := null;
        v_categoria := left(nullif(btrim(v_row->>'categoria'), ''), 120);
        if v_categoria is not null then
          select c.id into v_category_id
            from public.categories c
           where c.organization_id = p_organization_id
             and (public.fn_import_normalizar(c.name) = public.fn_import_normalizar(v_categoria)
                  or c.slug = replace(public.fn_import_normalizar(v_categoria), ' ', '-'))
           order by (c.branch_id is null) desc, c.id
           limit 1;
          if v_category_id is null then
            v_slug_base := coalesce(nullif(replace(public.fn_import_normalizar(v_categoria), ' ', '-'), ''), 'categoria');
            v_slug := v_slug_base;
            v_n := 1;
            while exists (select 1 from public.categories c where c.organization_id = p_organization_id and c.slug = v_slug) loop
              v_n := v_n + 1;
              v_slug := v_slug_base || '-' || v_n;
            end loop;
            insert into public.categories (organization_id, name, slug, rank)
            values (p_organization_id, v_categoria, v_slug, 0)
            returning id into v_category_id;
            v_avisos := v_avisos || jsonb_build_object('codigo', 'CATEGORIA_CREADA', 'detalle', v_categoria);
          end if;
        end if;

        -- ── Padre de la variante ────────────────────────────────────────
        v_parent_id := null;
        if nullif(btrim(v_row->>'sku_padre'), '') is not null then
          select p.id into v_parent_id
            from public.products p
           where p.organization_id = p_organization_id and p.sku = btrim(v_row->>'sku_padre');
          if v_parent_id is null then raise exception 'PADRE_NO_ENCONTRADO' using errcode = 'P0002'; end if;
          update public.products set is_parent = true, updated_at = now()
           where id = v_parent_id and is_parent is distinct from true;
        end if;

        -- ── Producto ────────────────────────────────────────────────────
        if v_existente_id is null then
          insert into public.products (
            organization_id, sku, name, description, category_id, unit_code, barcode, status,
            is_parent, parent_product_id, variant_data, track_stock, product_type, brand, reference, station
          ) values (
            p_organization_id, v_sku, v_nombre, nullif(v_row->>'descripcion', ''), v_category_id, v_unidad,
            nullif(v_row->>'codigo_barras', ''), v_estado,
            coalesce((v_row->>'es_padre')::boolean, false), v_parent_id, coalesce(v_variante, '{}'::jsonb),
            v_track, v_tipo, nullif(v_row->>'marca', ''), nullif(v_row->>'referencia', ''), v_estacion
          )
          returning id into v_product_id;
          v_accion := 'creado';
        else
          v_product_id := v_existente_id;
          update public.products p set
            name = v_nombre,
            description = coalesce(nullif(v_row->>'descripcion', ''), p.description),
            category_id = coalesce(v_category_id, p.category_id),
            unit_code = case when nullif(v_row->>'unidad', '') is not null then v_unidad else p.unit_code end,
            barcode = coalesce(nullif(v_row->>'codigo_barras', ''), p.barcode),
            status = case when v_row ? 'estado' and nullif(v_row->>'estado', '') is not null then v_estado
                          when p.status = 'deleted' then 'active' else p.status end,
            is_parent = case when (v_row->>'es_padre')::boolean then true else p.is_parent end,
            parent_product_id = coalesce(v_parent_id, p.parent_product_id),
            variant_data = coalesce(v_variante, p.variant_data),
            track_stock = case when v_row ? 'rastrear_stock' then v_track else p.track_stock end,
            product_type = case when v_row ? 'tipo' then v_tipo else p.product_type end,
            brand = coalesce(nullif(v_row->>'marca', ''), p.brand),
            reference = coalesce(nullif(v_row->>'referencia', ''), p.reference),
            station = case when v_row ? 'estacion' and v_row->>'estacion' is not null then v_estacion else p.station end,
            updated_at = now()
          where p.id = v_product_id;
          if v_existente_estado = 'deleted' then
            v_avisos := v_avisos || jsonb_build_object('codigo', 'PRODUCTO_RESTAURADO');
          end if;
          v_accion := 'actualizado';
        end if;

        -- ── Proveedores (el primero es el preferido) ────────────────────
        v_primer_proveedor := null;
        if jsonb_typeof(v_row->'proveedores') = 'array' then
          v_i := 0;
          for v_proveedor in select left(btrim(value), 150) from jsonb_array_elements_text(v_row->'proveedores') loop
            continue when v_proveedor = '' or public.fn_import_normalizar(v_proveedor) = '';
            select s.id into v_proveedor_id
              from public.suppliers s
             where s.organization_id = p_organization_id
               and public.fn_import_normalizar(s.name) = public.fn_import_normalizar(v_proveedor)
             order by s.id limit 1;
            if v_proveedor_id is null then
              insert into public.suppliers (organization_id, name, notes, is_active)
              values (p_organization_id, v_proveedor,
                      case when v_origen = 'web' then 'Creado por importación web' || coalesce(' desde ' || v_fuente, '') else null end,
                      true)
              returning id into v_proveedor_id;
              v_avisos := v_avisos || jsonb_build_object('codigo', 'PROVEEDOR_CREADO', 'detalle', v_proveedor);
            end if;
            if v_primer_proveedor is null then v_primer_proveedor := v_proveedor_id; end if;
            insert into public.product_suppliers (product_id, supplier_id, cost, is_preferred, supplier_sku, notes)
            values (v_product_id, v_proveedor_id, coalesce(v_costo, 0),
                    v_i = 0 and not exists (select 1 from public.product_suppliers ps where ps.product_id = v_product_id and ps.is_preferred),
                    case when v_origen = 'web' then nullif(v_row->>'referencia', '') else null end,
                    case when v_origen = 'web' then 'Vinculado por importación web' else null end)
            on conflict (product_id, supplier_id) do nothing;
            v_i := v_i + 1;
            v_proveedor_id := null;
          end loop;
        end if;

        -- ── Precio con vigencia ─────────────────────────────────────────
        if v_precio is not null and v_precio > 0 then
          select pp.id, pp.price, pp.compare_price into v_prev_id, v_prev_precio, v_prev_comparacion
            from public.product_prices pp
           where pp.product_id = v_product_id and pp.effective_to is null
           order by pp.effective_from desc limit 1;
          -- Sin columna de comparación en la fila: se conserva la vigente si sigue siendo mayor.
          if not (v_row ? 'precio_comparacion') then
            v_comparacion := case when v_prev_comparacion > v_precio then v_prev_comparacion else null end;
          end if;
          if v_prev_id is null or v_prev_precio <> v_precio or v_prev_comparacion is distinct from v_comparacion then
            update public.product_prices set effective_to = now()
             where product_id = v_product_id and effective_to is null;
            insert into public.product_prices (product_id, price, compare_price, effective_from)
            values (v_product_id, v_precio, v_comparacion, now());
          end if;
          v_prev_id := null;
        end if;

        -- ── Costo con vigencia ──────────────────────────────────────────
        if v_costo is not null and v_costo > 0 then
          select pc.id, pc.cost into v_prev_id, v_prev_costo
            from public.product_costs pc
           where pc.product_id = v_product_id and pc.effective_to is null
           order by pc.effective_from desc limit 1;
          if v_prev_id is null or v_prev_costo <> v_costo then
            update public.product_costs set effective_to = now()
             where product_id = v_product_id and effective_to is null;
            insert into public.product_costs (product_id, cost, supplier_id, effective_from)
            values (v_product_id, v_costo, v_primer_proveedor, now());
          end if;
          v_prev_id := null;
        end if;

        -- ── Impuesto (por nombre o por tasa) ────────────────────────────
        v_impuesto := nullif(btrim(v_row->>'impuesto'), '');
        if v_impuesto is not null then
          v_tasa := nullif(replace(substring(v_impuesto from '[0-9]+(?:[.,][0-9]+)?'), ',', '.'), '')::numeric;
          select t.id into v_tax_id
            from public.organization_taxes t
           where t.organization_id = p_organization_id
             and coalesce(t.is_active, true)
             and (public.fn_import_normalizar(t.name) = public.fn_import_normalizar(v_impuesto)
                  or (v_tasa is not null and t.rate = v_tasa))
           order by (public.fn_import_normalizar(t.name) = public.fn_import_normalizar(v_impuesto)) desc,
                    t.is_default desc nulls last, t.created_at
           limit 1;
          if v_tax_id is null then
            v_avisos := v_avisos || jsonb_build_object('codigo', 'IMPUESTO_NO_ENCONTRADO', 'detalle', v_impuesto);
          else
            insert into public.product_tax_relations (product_id, tax_id) values (v_product_id, v_tax_id)
            on conflict do nothing;
          end if;
          v_tax_id := null;
        end if;

        -- ── Etiquetas ───────────────────────────────────────────────────
        v_primera_etiqueta := null;
        if jsonb_typeof(v_row->'etiquetas') = 'array' then
          for v_etiqueta in select left(btrim(value), 80) from jsonb_array_elements_text(v_row->'etiquetas') loop
            continue when v_etiqueta = '';
            select t.id into v_tag_id from public.product_tags t
             where t.organization_id = p_organization_id and lower(t.name) = lower(v_etiqueta)
             order by t.id limit 1;
            if v_tag_id is null then
              insert into public.product_tags (organization_id, name) values (p_organization_id, v_etiqueta)
              on conflict (organization_id, name) do nothing
              returning id into v_tag_id;
              if v_tag_id is null then
                select t.id into v_tag_id from public.product_tags t
                 where t.organization_id = p_organization_id and t.name = v_etiqueta;
              end if;
            end if;
            if v_primera_etiqueta is null then v_primera_etiqueta := v_tag_id; end if;
            insert into public.product_tag_relations (product_id, tag_id) values (v_product_id, v_tag_id)
            on conflict do nothing;
            v_tag_id := null;
          end loop;
          if v_primera_etiqueta is not null then
            update public.products set tag_id = v_primera_etiqueta where id = v_product_id and tag_id is null;
          end if;
        end if;

        -- ── Nota (solo al crear, con autor) ─────────────────────────────
        if v_accion = 'creado' and v_uid is not null and nullif(btrim(v_row->>'nota'), '') is not null then
          insert into public.product_notes (product_id, user_id, content, organization_id)
          values (v_product_id, v_uid, left(v_row->>'nota', 5000), p_organization_id);
        end if;

        -- ── Relaciones de variante (tipo/valor) ─────────────────────────
        if v_variante is not null and v_parent_id is not null then
          for v_k, v_v in select key, left(btrim(value), 100) from jsonb_each_text(v_variante) loop
            continue when btrim(v_k) = '' or v_v = '';
            select vt.id into v_vt_id from public.variant_types vt
             where vt.organization_id = p_organization_id and lower(vt.name) = lower(btrim(v_k))
             order by vt.id limit 1;
            if v_vt_id is null then
              insert into public.variant_types (organization_id, name) values (p_organization_id, left(btrim(v_k), 80))
              on conflict (organization_id, name) do nothing returning id into v_vt_id;
              if v_vt_id is null then
                select vt.id into v_vt_id from public.variant_types vt
                 where vt.organization_id = p_organization_id and vt.name = left(btrim(v_k), 80);
              end if;
            end if;
            select vv.id into v_vv_id from public.variant_values vv
             where vv.variant_type_id = v_vt_id and lower(vv.value) = lower(v_v)
             order by vv.id limit 1;
            if v_vv_id is null then
              insert into public.variant_values (variant_type_id, value, display_order) values (v_vt_id, v_v, 0)
              on conflict (variant_type_id, value) do nothing returning id into v_vv_id;
              if v_vv_id is null then
                select vv.id into v_vv_id from public.variant_values vv where vv.variant_type_id = v_vt_id and vv.value = v_v;
              end if;
            end if;
            insert into public.product_variant_relations (product_id, variant_type_id, variant_value_id)
            values (v_product_id, v_vt_id, v_vv_id)
            on conflict (product_id, variant_type_id) do update set variant_value_id = excluded.variant_value_id;
            v_vt_id := null;
            v_vv_id := null;
          end loop;
        end if;

        -- ── Modificadores (reemplazo completo) ──────────────────────────
        if jsonb_typeof(v_row->'modificadores') = 'array' and jsonb_array_length(v_row->'modificadores') > 0 then
          delete from public.product_modifier_groups where product_id = v_product_id;
          v_i := 0;
          for v_grupo in select value from jsonb_array_elements(v_row->'modificadores') loop
            continue when nullif(btrim(v_grupo->>'nombre'), '') is null;
            insert into public.product_modifier_groups (organization_id, product_id, name, selection_mode, min_selections, max_selections, required, display_order)
            values (p_organization_id, v_product_id, left(btrim(v_grupo->>'nombre'), 100),
                    case when v_grupo->>'modo' = 'multiple' then 'multiple' else 'single' end,
                    greatest(coalesce(nullif(v_grupo->>'min', '')::integer, 0), 0),
                    nullif(v_grupo->>'max', '')::integer,
                    coalesce(nullif(v_grupo->>'requerido', '')::boolean, false),
                    v_i)
            returning id into v_grupo_id;
            v_n := 0;
            for v_opcion in select value from jsonb_array_elements(coalesce(v_grupo->'opciones', '[]'::jsonb)) loop
              continue when nullif(btrim(v_opcion->>'nombre'), '') is null;
              insert into public.product_modifiers (group_id, name, extra_price, is_active, display_order)
              values (v_grupo_id, left(btrim(v_opcion->>'nombre'), 100), coalesce(nullif(v_opcion->>'precio', '')::numeric, 0), true, v_n);
              v_n := v_n + 1;
            end loop;
            v_i := v_i + 1;
          end loop;
        end if;

        -- ── Stock por kardex ────────────────────────────────────────────
        if v_track and coalesce(v_stock, 0) > 0 then
          if v_accion = 'creado' or v_stock_existentes = 'sumar' then
            if coalesce(v_costo, 0) <= 0 then
              select pc.cost into v_costo from public.product_costs pc
               where pc.product_id = v_product_id and pc.effective_to is null
               order by pc.effective_from desc limit 1;
            end if;
            if coalesce(v_costo, 0) <= 0 then
              raise exception 'STOCK_SIN_COSTO' using errcode = '22023';
            end if;
            perform public.fn_register_stock_entry(
              jsonb_build_array(jsonb_build_object(
                'organization_id', p_organization_id,
                'branch_id', p_branch_id,
                'product_id', v_product_id,
                'qty', v_stock,
                'unit_cost', v_costo,
                'source', case when v_accion = 'creado' then 'initial' else 'adjustment' end,
                'note', case when v_accion = 'creado' then 'Stock inicial (importación ' || v_origen || ')'
                             else 'Entrada por importación ' || v_origen end,
                'updated_by', v_uid
              )),
              null
            );
          else
            v_avisos := v_avisos || jsonb_build_object('codigo', 'STOCK_IGNORADO');
          end if;
        end if;

        -- ── Stock mínimo de la sucursal ─────────────────────────────────
        if v_minimo is not null and v_minimo >= 0 and v_track then
          update public.stock_levels set min_level = v_minimo, updated_at = now()
           where product_id = v_product_id and branch_id = p_branch_id and lot_id is null;
          if not found then
            insert into public.stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
            values (v_product_id, p_branch_id, null, 0, 0, coalesce(v_costo, 0), v_minimo);
          end if;
        end if;
      end if;

      if v_accion = 'creado' then v_creados := v_creados + 1;
      elsif v_accion = 'actualizado' then v_actualizados := v_actualizados + 1;
      else v_omitidos := v_omitidos + 1;
      end if;
      v_resultados := v_resultados || jsonb_build_object(
        'fila', v_fila, 'sku', v_sku, 'ok', true, 'accion', v_accion,
        'product_id', v_product_id, 'avisos', v_avisos);
    exception when others then
      v_fallidos := v_fallidos + 1;
      v_resultados := v_resultados || jsonb_build_object(
        'fila', v_fila, 'sku', v_sku, 'ok', false, 'error', left(sqlerrm, 300), 'codigo', sqlstate);
    end;

    v_existente_id := null;
    v_existente_estado := null;
    v_category_id := null;
    v_parent_id := null;
  end loop;

  return jsonb_build_object(
    'creados', v_creados,
    'actualizados', v_actualizados,
    'omitidos', v_omitidos,
    'fallidos', v_fallidos,
    'resultados', v_resultados
  );
end;
$$;

revoke all on function public.fn_importar_productos_lote(integer, integer, text, jsonb, jsonb) from public, anon;
grant execute on function public.fn_importar_productos_lote(integer, integer, text, jsonb, jsonb) to authenticated, service_role;

comment on function public.fn_importar_productos_lote(integer, integer, text, jsonb, jsonb) is
  'Importa un lote de productos (≤ 200 filas) en una transacción, con subtransacción por fila. Pertenencia por fn_assert_acceso_org; stock por fn_register_stock_entry. Ver supabase/migrations/20260924150000_importar_productos_lote.sql.';
