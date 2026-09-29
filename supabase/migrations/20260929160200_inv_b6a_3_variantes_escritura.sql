-- Inventario B6a · Variantes: RPC de escritura del catálogo (crear, editar,
-- renombrar con impacto, fusionar, ordenar, activar/desactivar, eliminar sin
-- uso, completar desde las variantes y usar los sugeridos del catálogo global).
--
-- Plan: docs/implementacion/INVENTARIO-PLAN.md §5.7 (B6a). Usa los ayudantes de
-- 20260929160100_inv_b6a_2_variantes_lectura.sql (misma regla de
-- correspondencia clave ↔ tipo y valor ↔ valor).
--
-- Todas SECURITY DEFINER con search_path fijo: `editar_catalogo` para
-- escribir y `eliminar` para borrar (`fn_inventario_exigir_permiso`, que valida
-- antes la pertenencia). Un candado por organización
-- (`pg_advisory_xact_lock`) serializa las escrituras del catálogo. Renombrar y
-- fusionar reescriben `variant_data` de hijos y padres en la misma
-- transacción (rastro en `products_audit_log`); los SKU no cambian.

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

-- Crea (p_id NULL) o edita un tipo. p_datos: nombre, estilo, meta, traducciones, activo.
-- Cambiar el nombre reescribe `variant_data` de sus variantes (y de los padres)
-- en la misma transacción. Nombre repetido sin distinguir mayúsculas ni
-- espacios → 23505 `nombre_repetido` (con el id del otro en `hint`).
create or replace function public.fn_variante_tipo_guardar(p_org integer, p_id integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.variant_types;
  v_nombre text := btrim(regexp_replace(coalesce(p_datos ->> 'nombre', ''), '\s+', ' ', 'g'));
  v_estilo text := nullif(p_datos ->> 'estilo', '');
  v_meta text := nullif(p_datos ->> 'meta', '');
  v_trad jsonb := p_datos -> 'traducciones';
  v_otro integer;
  v_id integer;
  v_actualizadas integer := 0;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['editar_catalogo']);
  if v_nombre = '' then
    raise exception 'nombre_requerido' using errcode = '23502', detail = 'El tipo necesita un nombre.';
  end if;
  if length(v_nombre) > 60 then
    raise exception 'nombre_largo' using errcode = '22001', detail = 'Máximo 60 caracteres.';
  end if;
  if v_trad is not null and jsonb_typeof(v_trad) <> 'object' then
    raise exception 'traducciones_invalidas' using errcode = '22023';
  end if;
  -- Serializa las escrituras del catálogo de la organización.
  perform pg_advisory_xact_lock(hashtext('variant_catalog'), p_org);

  select t.id into v_otro from public.variant_types t
   where t.organization_id = p_org and public.fn_variantes_int_norm(t.name) = public.fn_variantes_int_norm(v_nombre)
     and t.id is distinct from p_id
   order by t.id limit 1;
  if v_otro is not null then
    raise exception 'nombre_repetido' using errcode = '23505', hint = v_otro::text,
      detail = 'Ya existe un tipo con ese nombre (sin distinguir mayúsculas ni espacios).';
  end if;

  if p_id is null then
    insert into public.variant_types (organization_id, name, display_order, is_active, display_style, meta_attribute, translations)
    values (p_org, v_nombre,
            coalesce((select max(display_order) + 1 from public.variant_types where organization_id = p_org), 0),
            coalesce((p_datos ->> 'activo')::boolean, true),
            coalesce(v_estilo, 'texto'), v_meta, coalesce(v_trad, '{}'::jsonb))
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'variantes_actualizadas', 0);
  end if;

  v_t := public.fn_variantes_int_tipo(p_org, p_id);
  -- Solo se tocan las variantes si cambia el nombre o se pide unificar las
  -- escrituras («talla» → «Talla»); editar estilo o traducciones no las toca.
  if v_t.name is distinct from v_nombre or coalesce((p_datos ->> 'unificar')::boolean, false) then
    v_actualizadas := public.fn_variantes_int_reescribir(p_org, public.fn_variantes_int_claves_de(p_org, p_id), v_nombre, null, null);
  end if;

  update public.variant_types
     set name = v_nombre,
         display_style = coalesce(v_estilo, display_style),
         meta_attribute = case when p_datos ? 'meta' then v_meta else meta_attribute end,
         translations = coalesce(v_trad, translations),
         is_active = coalesce((p_datos ->> 'activo')::boolean, is_active)
   where id = p_id;

  return jsonb_build_object('id', p_id, 'variantes_actualizadas', v_actualizadas);
end;
$$;

-- Fusiona tipos en uno: las variantes pasan al destino (si una variante tiene
-- las dos claves, se conserva la del destino), los valores iguales sin
-- mayúsculas se unen, las relaciones por id se reapuntan y los tipos de origen
-- se borran.
create or replace function public.fn_variantes_fusionar_tipos(p_org integer, p_origen integer[], p_destino integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dest public.variant_types;
  v_origen integer[];
  v_o integer;
  v_val record;
  v_igual integer;
  v_claves text[] := '{}';
  v_actualizadas integer;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['editar_catalogo']);
  perform pg_advisory_xact_lock(hashtext('variant_catalog'), p_org);
  select array_agg(distinct x) into v_origen from unnest(coalesce(p_origen, '{}')) x where x is not null and x <> p_destino;
  if v_origen is null then
    raise exception 'sin_origen' using errcode = '22023', detail = 'Elige al menos un tipo para fusionar.';
  end if;
  v_dest := public.fn_variantes_int_tipo(p_org, p_destino);
  foreach v_o in array v_origen loop
    perform public.fn_variantes_int_tipo(p_org, v_o);
    v_claves := v_claves || public.fn_variantes_int_claves_de(p_org, v_o);
  end loop;
  -- Las escrituras del destino también se unifican a su nombre.
  v_claves := v_claves || public.fn_variantes_int_claves_de(p_org, p_destino);
  v_actualizadas := public.fn_variantes_int_reescribir(p_org, v_claves, v_dest.name, null, null);

  foreach v_o in array v_origen loop
    delete from public.product_variant_relations r
     where r.variant_type_id = v_o
       and exists (select 1 from public.product_variant_relations d where d.product_id = r.product_id and d.variant_type_id = p_destino);
    for v_val in select * from public.variant_values where variant_type_id = v_o order by display_order, id loop
      select v.id into v_igual from public.variant_values v
       where v.variant_type_id = p_destino and lower(btrim(v.value)) = lower(btrim(v_val.value)) order by v.id limit 1;
      if v_igual is not null then
        update public.product_variant_relations set variant_value_id = v_igual where variant_value_id = v_val.id;
        delete from public.variant_values where id = v_val.id;
      else
        update public.variant_values
           set variant_type_id = p_destino,
               display_order = coalesce((select max(display_order) + 1 from public.variant_values where variant_type_id = p_destino), 0),
               sku_code = case when sku_code is not null and exists (
                                 select 1 from public.variant_values s where s.variant_type_id = p_destino and upper(s.sku_code) = upper(variant_values.sku_code))
                               then null else sku_code end
         where id = v_val.id;
      end if;
    end loop;
    update public.product_variant_relations set variant_type_id = p_destino where variant_type_id = v_o;
    delete from public.variant_types where id = v_o;
  end loop;

  return jsonb_build_object('destino', p_destino, 'fusionados', cardinality(v_origen), 'variantes_actualizadas', v_actualizadas);
end;
$$;

-- ---------------------------------------------------------------------------
-- Valores
-- ---------------------------------------------------------------------------

-- Crea (p_id NULL) o edita un valor. p_datos: tipo_id, valor, hex, imagen, sku,
-- traducciones, activo. Cambiar el texto reescribe las variantes que lo usan.
create or replace function public.fn_variante_valor_guardar(p_org integer, p_id integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_v public.variant_values;
  v_tipo public.variant_types;
  v_texto text := btrim(regexp_replace(coalesce(p_datos ->> 'valor', ''), '\s+', ' ', 'g'));
  v_hex text := nullif(btrim(coalesce(p_datos ->> 'hex', '')), '');
  v_sku text := nullif(upper(btrim(coalesce(p_datos ->> 'sku', ''))), '');
  v_trad jsonb := p_datos -> 'traducciones';
  v_tipo_id integer;
  v_otro integer;
  v_id integer;
  v_actualizadas integer := 0;
  v_escrituras text[];
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['editar_catalogo']);
  if v_texto = '' then
    raise exception 'valor_requerido' using errcode = '23502', detail = 'El valor no puede quedar vacío.';
  end if;
  if length(v_texto) > 80 then
    raise exception 'valor_largo' using errcode = '22001', detail = 'Máximo 80 caracteres.';
  end if;
  if v_hex is not null and v_hex !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'hex_invalido' using errcode = '22023', detail = 'El color va como #RRGGBB.';
  end if;
  if v_sku is not null and v_sku !~ '^[A-Z0-9]{1,8}$' then
    raise exception 'sku_invalido' using errcode = '22023', detail = 'El código para el SKU lleva de 1 a 8 letras o números.';
  end if;
  if v_trad is not null and jsonb_typeof(v_trad) <> 'object' then
    raise exception 'traducciones_invalidas' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('variant_catalog'), p_org);

  if p_id is not null then
    select v.* into v_v from public.variant_values v
      join public.variant_types t on t.id = v.variant_type_id and t.organization_id = p_org
     where v.id = p_id for update of v;
    if v_v.id is null then
      raise exception 'valor_no_encontrado' using errcode = 'P0002', detail = 'El valor no existe o es de otra organización.';
    end if;
    v_tipo_id := v_v.variant_type_id;
  else
    v_tipo_id := nullif(p_datos ->> 'tipo_id', '')::integer;
  end if;
  v_tipo := public.fn_variantes_int_tipo(p_org, v_tipo_id);

  select v.id into v_otro from public.variant_values v
   where v.variant_type_id = v_tipo.id and public.fn_variantes_int_norm(v.value) = public.fn_variantes_int_norm(v_texto)
     and v.id is distinct from p_id order by v.id limit 1;
  if v_otro is not null then
    raise exception 'valor_repetido' using errcode = '23505', hint = v_otro::text,
      detail = 'Ese valor ya existe en el tipo (sin distinguir mayúsculas ni espacios).';
  end if;
  if v_sku is not null and exists (
       select 1 from public.variant_values v where v.variant_type_id = v_tipo.id and upper(v.sku_code) = v_sku and v.id is distinct from p_id) then
    raise exception 'sku_repetido' using errcode = '23505', detail = 'Ese código para el SKU ya lo usa otro valor del tipo.';
  end if;

  if p_id is null then
    insert into public.variant_values (variant_type_id, value, display_order, hex_color, image_url, sku_code, translations, is_active)
    values (v_tipo.id, v_texto,
            coalesce((select max(display_order) + 1 from public.variant_values where variant_type_id = v_tipo.id), 0),
            v_hex, nullif(p_datos ->> 'imagen', ''), v_sku, coalesce(v_trad, '{}'::jsonb),
            coalesce((p_datos ->> 'activo')::boolean, true))
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'variantes_actualizadas', 0);
  end if;

  if v_v.value is distinct from v_texto or coalesce((p_datos ->> 'unificar')::boolean, false) then
    v_escrituras := public.fn_variantes_int_valores_de(p_org, v_tipo.id, p_id);
  end if;
  if exists (select 1 from unnest(v_escrituras) e where e <> v_texto) then
    v_actualizadas := public.fn_variantes_int_reescribir(
      p_org, public.fn_variantes_int_claves_de(p_org, v_tipo.id), null, v_escrituras, v_texto);
  end if;

  update public.variant_values
     set value = v_texto,
         hex_color = case when p_datos ? 'hex' then v_hex else hex_color end,
         image_url = case when p_datos ? 'imagen' then nullif(p_datos ->> 'imagen', '') else image_url end,
         sku_code = case when p_datos ? 'sku' then v_sku else sku_code end,
         translations = coalesce(v_trad, translations),
         is_active = coalesce((p_datos ->> 'activo')::boolean, is_active)
   where id = p_id;

  return jsonb_build_object('id', p_id, 'variantes_actualizadas', v_actualizadas);
end;
$$;

-- Fusiona valores del MISMO tipo en uno.
create or replace function public.fn_variantes_fusionar_valores(p_org integer, p_origen integer[], p_destino integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dest public.variant_values;
  v_origen integer[];
  v_o integer;
  v_escrituras text[] := '{}';
  v_actualizadas integer;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['editar_catalogo']);
  perform pg_advisory_xact_lock(hashtext('variant_catalog'), p_org);
  select v.* into v_dest from public.variant_values v
    join public.variant_types t on t.id = v.variant_type_id and t.organization_id = p_org
   where v.id = p_destino for update of v;
  if v_dest.id is null then
    raise exception 'valor_no_encontrado' using errcode = 'P0002';
  end if;
  select array_agg(distinct x) into v_origen from unnest(coalesce(p_origen, '{}')) x where x is not null and x <> p_destino;
  if v_origen is null then
    raise exception 'sin_origen' using errcode = '22023', detail = 'Elige al menos un valor para fusionar.';
  end if;
  if exists (select 1 from unnest(v_origen) o
              where not exists (select 1 from public.variant_values v where v.id = o and v.variant_type_id = v_dest.variant_type_id)) then
    raise exception 'tipo_distinto' using errcode = '22023', detail = 'Solo se fusionan valores del mismo tipo.';
  end if;
  foreach v_o in array v_origen loop
    v_escrituras := v_escrituras || public.fn_variantes_int_valores_de(p_org, v_dest.variant_type_id, v_o);
  end loop;
  v_escrituras := v_escrituras || public.fn_variantes_int_valores_de(p_org, v_dest.variant_type_id, p_destino);
  v_actualizadas := public.fn_variantes_int_reescribir(
    p_org, public.fn_variantes_int_claves_de(p_org, v_dest.variant_type_id), null, v_escrituras, v_dest.value);

  update public.product_variant_relations set variant_value_id = p_destino where variant_value_id = any (v_origen);
  delete from public.variant_values where id = any (v_origen);

  return jsonb_build_object('destino', p_destino, 'fusionados', cardinality(v_origen), 'variantes_actualizadas', v_actualizadas);
end;
$$;

-- Permisos de ejecución
revoke all on function public.fn_variante_tipo_guardar(integer, integer, jsonb) from public, anon;
revoke all on function public.fn_variantes_fusionar_tipos(integer, integer[], integer) from public, anon;
revoke all on function public.fn_variante_valor_guardar(integer, integer, jsonb) from public, anon;
revoke all on function public.fn_variantes_fusionar_valores(integer, integer[], integer) from public, anon;
grant execute on function public.fn_variante_tipo_guardar(integer, integer, jsonb) to authenticated;
grant execute on function public.fn_variantes_fusionar_tipos(integer, integer[], integer) to authenticated;
grant execute on function public.fn_variante_valor_guardar(integer, integer, jsonb) to authenticated;
grant execute on function public.fn_variantes_fusionar_valores(integer, integer[], integer) to authenticated;
