-- Inventario B6b · Importar categorías y proveedores en el servidor, en una transacción.
--
-- Plan: docs/implementacion/INVENTARIO-PLAN.md §5.7 (B6b); Figma «Importar
-- categorías» `973:186211` e «Importar proveedores» `973:185225` / móvil `975:185874`.
--
-- Hasta hoy las dos importaciones insertaban fila por fila desde el navegador:
-- sin permiso en el servidor, sin transacción (un corte a mitad dejaba la mitad),
-- las categorías con estación «Bebidas» chocaban con el CHECK de `station` y los
-- proveedores repetidos se duplicaban (no había «actualizar el existente»).
--
-- Las dos RPC tienen el mismo contrato: `p_aplicar = false` REVISA (cada fila con
-- su acción y su motivo, sin escribir nada) y `p_aplicar = true` aplica en una
-- sola transacción lo que la revisión dejó válido (y, en proveedores, solo las
-- filas elegidas). La revisión es la misma función que aplica: lo que la pantalla
-- promete es exactamente lo que se escribe.
--
-- fn_categorias_importar(p_org, p_filas, p_aplicar)
--   fila: {fila, name, parent_name, slug, color, icon, description, is_active,
--          display_order, station, requires_preparation, meta_title, meta_description}
--   - nombre obligatorio; un nombre que ya existe en la organización se omite
--     (no se duplica); repetido en el archivo → error en la segunda;
--   - el padre debe existir o venir en el archivo; los padres se crean antes que
--     sus hijas (por pasadas; un ciclo en el archivo queda como error);
--   - slug único por organización (sufijo -2, -3…); estación solo si es válida.
--
-- fn_proveedores_importar(p_org, p_filas, p_aplicar, p_filas_elegidas)
--   fila: {fila, name, supplier_type, doc_type, nit, contact, phone, email, ...}
--   - nombre y documento obligatorios; correo con formato; plazo numérico;
--   - mismo documento que un proveedor de la organización → «actualizar»
--     (solo los campos que trae el archivo, nunca borra lo que ya tenía);
--   - documento repetido en el archivo → error en la segunda.
--
-- Ambas: SECURITY DEFINER, permiso de catálogo en el servidor
-- (`fn_productos_exigir_permiso`, que incluye `fn_assert_acceso_org`), sin anon,
-- y un tope de 2.000 filas por archivo.
--
-- Aplicada en dos pasos por el MCP (`inv_b6_importar_catalogo` y
-- `inv_b6_importar_catalogo_duplicados`): en el segundo, un documento repetido
-- solo cuenta contra una fila anterior que sí se importa. Este archivo es la
-- versión final e idempotente.

create or replace function public.fn_categorias_importar(p_org integer, p_filas jsonb, p_aplicar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fila record;
  v_progreso boolean;
  v_slug_base text;
  v_slug text;
  v_n integer;
  v_id integer;
  v_padre integer;
  v_creadas integer := 0;
begin
  perform public.fn_productos_exigir_permiso(p_org, array['inventory.create', 'product_management', 'inventory_management']);

  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Se esperaba una lista de filas' using errcode = '22023', hint = 'IMPORTAR_FORMATO';
  end if;
  if jsonb_array_length(p_filas) > 2000 then
    raise exception 'Máximo 2.000 filas por archivo' using errcode = '22023', hint = 'IMPORTAR_DEMASIADAS';
  end if;

  create temp table if not exists tmp_cat_import (
    fila integer, nombre text, clave text, padre_nombre text, padre_clave text,
    slug text, color text, icon text, description text, is_active boolean, display_order integer,
    station text, requires_preparation boolean, meta_title text, meta_description text,
    accion text, motivo text, padre_id integer, nueva_id integer
  ) on commit drop;
  truncate tmp_cat_import;

  insert into tmp_cat_import (fila, nombre, clave, padre_nombre, padre_clave, slug, color, icon, description,
    is_active, display_order, station, requires_preparation, meta_title, meta_description, accion)
  select
    coalesce((e.value->>'fila')::integer, e.ordinality::integer + 1),
    left(btrim(coalesce(e.value->>'name', '')), 120),
    lower(btrim(coalesce(e.value->>'name', ''))),
    nullif(left(btrim(coalesce(e.value->>'parent_name', '')), 120), ''),
    nullif(lower(btrim(coalesce(e.value->>'parent_name', ''))), ''),
    nullif(replace(public.fn_import_normalizar(e.value->>'slug'), ' ', '-'), ''),
    case when coalesce(e.value->>'color', '') ~ '^#[0-9A-Fa-f]{6}$' then e.value->>'color' else '#6366f1' end,
    nullif(btrim(coalesce(e.value->>'icon', '')), ''),
    nullif(btrim(coalesce(e.value->>'description', '')), ''),
    coalesce((e.value->>'is_active')::boolean, true),
    coalesce((e.value->>'display_order')::integer, 0),
    case when e.value->>'station' in ('hot_kitchen', 'cold_kitchen', 'bar', 'cashier', 'all') then e.value->>'station' end,
    coalesce((e.value->>'requires_preparation')::boolean, false),
    nullif(btrim(coalesce(e.value->>'meta_title', '')), ''),
    nullif(btrim(coalesce(e.value->>'meta_description', '')), ''),
    'pendiente'
  from jsonb_array_elements(p_filas) with ordinality e;

  update tmp_cat_import set accion = 'error', motivo = 'nombre_obligatorio' where nombre = '';

  update tmp_cat_import t set accion = 'error', motivo = 'ya_existe'
  where t.accion = 'pendiente'
    and exists (select 1 from public.categories c where c.organization_id = p_org and lower(btrim(c.name)) = t.clave);

  update tmp_cat_import t set accion = 'error', motivo = 'repetida'
  where t.accion = 'pendiente'
    and exists (select 1 from tmp_cat_import o where o.clave = t.clave and o.fila < t.fila and o.nombre <> '');

  update tmp_cat_import t set accion = 'error', motivo = 'padre_si_misma'
  where t.accion = 'pendiente' and t.padre_clave = t.clave;

  -- Padres: existentes o de este archivo. Por pasadas, para que las hijas
  -- esperen a su padre; lo que no se resuelve (padre ausente, con error o en
  -- ciclo) queda como error.
  update tmp_cat_import t set padre_id = (
    select c.id from public.categories c
    where c.organization_id = p_org and lower(btrim(c.name)) = t.padre_clave
    order by c.parent_id nulls first, c.id limit 1)
  where t.accion = 'pendiente' and t.padre_clave is not null;

  update tmp_cat_import t set accion = 'lista'
  where t.accion = 'pendiente' and (t.padre_clave is null or t.padre_id is not null);

  loop
    update tmp_cat_import t set accion = 'lista'
    where t.accion = 'pendiente'
      and exists (select 1 from tmp_cat_import p where p.clave = t.padre_clave and p.accion = 'lista');
    get diagnostics v_n = row_count;
    exit when v_n = 0;
  end loop;

  update tmp_cat_import set accion = 'error', motivo = 'padre_no_existe' where accion = 'pendiente';

  if coalesce(p_aplicar, false) then
    -- Se crean en orden: primero las que tienen el padre resuelto.
    loop
      v_progreso := false;
      for v_fila in
        select * from tmp_cat_import t
        where t.accion = 'lista' and t.nueva_id is null
          and (t.padre_clave is null or t.padre_id is not null
               or exists (select 1 from tmp_cat_import p where p.clave = t.padre_clave and p.nueva_id is not null))
        order by t.fila
      loop
        v_padre := coalesce(v_fila.padre_id, (select p.nueva_id from tmp_cat_import p where p.clave = v_fila.padre_clave and p.nueva_id is not null limit 1));
        v_slug_base := coalesce(v_fila.slug, nullif(replace(public.fn_import_normalizar(v_fila.nombre), ' ', '-'), ''), 'categoria');
        v_slug := v_slug_base;
        v_n := 1;
        while exists (select 1 from public.categories c where c.organization_id = p_org and c.slug = v_slug) loop
          v_n := v_n + 1;
          v_slug := v_slug_base || '-' || v_n;
        end loop;

        insert into public.categories (organization_id, name, slug, parent_id, rank, icon, color, description, is_active,
          display_order, meta_title, meta_description, metadata, station, requires_preparation)
        values (p_org, v_fila.nombre, v_slug, v_padre, 0, v_fila.icon, v_fila.color, v_fila.description, v_fila.is_active,
          v_fila.display_order, v_fila.meta_title, v_fila.meta_description, '{}'::jsonb, v_fila.station, v_fila.requires_preparation)
        returning id into v_id;

        update tmp_cat_import set nueva_id = v_id, slug = v_slug where fila = v_fila.fila;
        v_creadas := v_creadas + 1;
        v_progreso := true;
      end loop;
      exit when not v_progreso;
    end loop;
  end if;

  return jsonb_build_object(
    'aplicado', coalesce(p_aplicar, false),
    'total', (select count(*) from tmp_cat_import),
    'validas', (select count(*) from tmp_cat_import where accion = 'lista'),
    'con_error', (select count(*) from tmp_cat_import where accion = 'error'),
    'subcategorias', (select count(*) from tmp_cat_import where accion = 'lista' and padre_clave is not null),
    'creadas', v_creadas,
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fila', t.fila, 'nombre', t.nombre, 'padre', t.padre_nombre,
        'accion', case when t.accion = 'lista' then 'crear' else 'error' end,
        'motivo', t.motivo, 'id', t.nueva_id) order by t.fila)
      from tmp_cat_import t), '[]'::jsonb)
  );
end;
$function$;

-- Documento comparable: solo dígitos, sin el dígito de verificación («900.123.456-7» → 900123456).
create or replace function public.fn_proveedor_int_documento(p_doc text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select nullif(regexp_replace(split_part(coalesce(p_doc, ''), '-', 1), '[^0-9A-Za-z]', '', 'g'), '');
$function$;

create or replace function public.fn_proveedores_importar(
  p_org integer,
  p_filas jsonb,
  p_aplicar boolean default false,
  p_filas_elegidas integer[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fila record;
  v_creados integer := 0;
  v_actualizados integer := 0;
begin
  perform public.fn_productos_exigir_permiso(p_org, array['inventory.create', 'product_management', 'inventory_management']);

  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Se esperaba una lista de filas' using errcode = '22023', hint = 'IMPORTAR_FORMATO';
  end if;
  if jsonb_array_length(p_filas) > 2000 then
    raise exception 'Máximo 2.000 filas por archivo' using errcode = '22023', hint = 'IMPORTAR_DEMASIADAS';
  end if;

  create temp table if not exists tmp_prov_import (
    fila integer, datos jsonb, nombre text, documento text, doc_clave text, tipo text, email text,
    plazo_texto text, plazo integer, cuenta_tipo text,
    accion text, motivo text, existente_id integer, fila_repetida integer, resultado_id integer
  ) on commit drop;
  truncate tmp_prov_import;

  insert into tmp_prov_import (fila, datos, nombre, documento, doc_clave, tipo, email, plazo_texto, cuenta_tipo, accion)
  select
    coalesce((e.value->>'fila')::integer, e.ordinality::integer + 1),
    e.value,
    left(btrim(coalesce(e.value->>'name', '')), 200),
    nullif(btrim(coalesce(e.value->>'nit', '')), ''),
    public.fn_proveedor_int_documento(e.value->>'nit'),
    coalesce(nullif(e.value->>'supplier_type', ''), 'company'),
    nullif(btrim(coalesce(e.value->>'email', '')), ''),
    nullif(btrim(coalesce(e.value->>'credit_days', '')), ''),
    nullif(btrim(coalesce(e.value->>'account_type', '')), ''),
    'pendiente'
  from jsonb_array_elements(p_filas) with ordinality e;

  update tmp_prov_import set accion = 'error', motivo = 'nombre_obligatorio' where nombre = '';
  update tmp_prov_import set accion = 'error', motivo = 'documento_obligatorio' where accion = 'pendiente' and doc_clave is null;
  update tmp_prov_import set accion = 'error', motivo = 'tipo_invalido' where accion = 'pendiente' and tipo not in ('person', 'company');
  update tmp_prov_import set accion = 'error', motivo = 'correo_invalido'
  where accion = 'pendiente' and email is not null and email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$';
  update tmp_prov_import set accion = 'error', motivo = 'plazo_invalido'
  where accion = 'pendiente' and plazo_texto is not null and plazo_texto !~ '^[0-9]{1,4}$';
  update tmp_prov_import set plazo = plazo_texto::integer where plazo_texto ~ '^[0-9]{1,4}$';
  update tmp_prov_import set accion = 'error', motivo = 'cuenta_invalida'
  where accion = 'pendiente' and cuenta_tipo is not null and cuenta_tipo not in ('savings', 'checking', 'other');

  -- Repetido frente a una fila anterior que sí se importa (una fila con error no cuenta).
  update tmp_prov_import t set accion = 'error', motivo = 'documento_repetido', fila_repetida = (
      select min(o.fila) from tmp_prov_import o where o.doc_clave = t.doc_clave and o.fila < t.fila and o.accion = 'pendiente')
  where t.accion = 'pendiente'
    and exists (select 1 from tmp_prov_import o where o.doc_clave = t.doc_clave and o.fila < t.fila and o.accion = 'pendiente');

  update tmp_prov_import t set existente_id = (
      select s.id from public.suppliers s
      where s.organization_id = p_org and public.fn_proveedor_int_documento(s.nit) = t.doc_clave
      order by s.is_active desc nulls last, s.id limit 1)
  where t.accion = 'pendiente';

  update tmp_prov_import set accion = case when existente_id is null then 'crear' else 'actualizar' end where accion = 'pendiente';

  if coalesce(p_aplicar, false) then
    for v_fila in
      select * from tmp_prov_import t
      where t.accion in ('crear', 'actualizar')
        and (p_filas_elegidas is null or t.fila = any(p_filas_elegidas))
      order by t.fila
    loop
      if v_fila.accion = 'crear' then
        insert into public.suppliers (organization_id, name, supplier_type, doc_type, nit, contact, phone, email, notes, description,
          address, city, state, country, postal_code, tax_id, tax_regime, fiscal_responsibilities, payment_terms, credit_days,
          website, bank_name, bank_account, account_type, dv, municipality_code, identification_document_code, country_code,
          legal_organization_code, trade_name, is_active)
        values (p_org, v_fila.nombre, v_fila.tipo,
          nullif(btrim(coalesce(v_fila.datos->>'doc_type', '')), ''), v_fila.documento,
          nullif(btrim(coalesce(v_fila.datos->>'contact', '')), ''), nullif(btrim(coalesce(v_fila.datos->>'phone', '')), ''),
          v_fila.email, nullif(btrim(coalesce(v_fila.datos->>'notes', '')), ''), nullif(btrim(coalesce(v_fila.datos->>'description', '')), ''),
          nullif(btrim(coalesce(v_fila.datos->>'address', '')), ''), nullif(btrim(coalesce(v_fila.datos->>'city', '')), ''),
          nullif(btrim(coalesce(v_fila.datos->>'state', '')), ''), coalesce(nullif(btrim(coalesce(v_fila.datos->>'country', '')), ''), 'Colombia'),
          nullif(btrim(coalesce(v_fila.datos->>'postal_code', '')), ''), nullif(btrim(coalesce(v_fila.datos->>'tax_id', '')), ''),
          nullif(btrim(coalesce(v_fila.datos->>'tax_regime', '')), ''),
          nullif(array(select btrim(x) from unnest(string_to_array(coalesce(v_fila.datos->>'fiscal_responsibilities', ''), ';')) x where btrim(x) <> ''), '{}'::text[]),
          nullif(btrim(coalesce(v_fila.datos->>'payment_terms', '')), ''), coalesce(v_fila.plazo, 0),
          nullif(btrim(coalesce(v_fila.datos->>'website', '')), ''), nullif(btrim(coalesce(v_fila.datos->>'bank_name', '')), ''),
          nullif(btrim(coalesce(v_fila.datos->>'bank_account', '')), ''), v_fila.cuenta_tipo,
          nullif(left(btrim(coalesce(v_fila.datos->>'dv', '')), 1), ''),
          nullif(btrim(coalesce(v_fila.datos->>'municipality_code', '')), ''),
          nullif(btrim(coalesce(v_fila.datos->>'identification_document_code', '')), ''),
          coalesce(nullif(left(btrim(coalesce(v_fila.datos->>'country_code', '')), 2), ''), 'CO'),
          nullif(left(btrim(coalesce(v_fila.datos->>'legal_organization_code', '')), 1), ''),
          nullif(btrim(coalesce(v_fila.datos->>'trade_name', '')), ''),
          coalesce((v_fila.datos->>'is_active')::boolean, true))
        returning id into v_fila.resultado_id;
        v_creados := v_creados + 1;
      else
        update public.suppliers s set
          name = v_fila.nombre,
          supplier_type = v_fila.tipo,
          doc_type = coalesce(nullif(btrim(coalesce(v_fila.datos->>'doc_type', '')), ''), s.doc_type),
          contact = coalesce(nullif(btrim(coalesce(v_fila.datos->>'contact', '')), ''), s.contact),
          phone = coalesce(nullif(btrim(coalesce(v_fila.datos->>'phone', '')), ''), s.phone),
          email = coalesce(v_fila.email, s.email),
          notes = coalesce(nullif(btrim(coalesce(v_fila.datos->>'notes', '')), ''), s.notes),
          description = coalesce(nullif(btrim(coalesce(v_fila.datos->>'description', '')), ''), s.description),
          address = coalesce(nullif(btrim(coalesce(v_fila.datos->>'address', '')), ''), s.address),
          city = coalesce(nullif(btrim(coalesce(v_fila.datos->>'city', '')), ''), s.city),
          state = coalesce(nullif(btrim(coalesce(v_fila.datos->>'state', '')), ''), s.state),
          country = coalesce(nullif(btrim(coalesce(v_fila.datos->>'country', '')), ''), s.country),
          postal_code = coalesce(nullif(btrim(coalesce(v_fila.datos->>'postal_code', '')), ''), s.postal_code),
          tax_id = coalesce(nullif(btrim(coalesce(v_fila.datos->>'tax_id', '')), ''), s.tax_id),
          tax_regime = coalesce(nullif(btrim(coalesce(v_fila.datos->>'tax_regime', '')), ''), s.tax_regime),
          fiscal_responsibilities = coalesce(
            nullif(array(select btrim(x) from unnest(string_to_array(coalesce(v_fila.datos->>'fiscal_responsibilities', ''), ';')) x where btrim(x) <> ''), '{}'::text[]),
            s.fiscal_responsibilities),
          payment_terms = coalesce(nullif(btrim(coalesce(v_fila.datos->>'payment_terms', '')), ''), s.payment_terms),
          credit_days = coalesce(v_fila.plazo, s.credit_days),
          website = coalesce(nullif(btrim(coalesce(v_fila.datos->>'website', '')), ''), s.website),
          bank_name = coalesce(nullif(btrim(coalesce(v_fila.datos->>'bank_name', '')), ''), s.bank_name),
          bank_account = coalesce(nullif(btrim(coalesce(v_fila.datos->>'bank_account', '')), ''), s.bank_account),
          account_type = coalesce(v_fila.cuenta_tipo, s.account_type),
          trade_name = coalesce(nullif(btrim(coalesce(v_fila.datos->>'trade_name', '')), ''), s.trade_name),
          updated_at = now()
        where s.id = v_fila.existente_id and s.organization_id = p_org;
        v_fila.resultado_id := v_fila.existente_id;
        v_actualizados := v_actualizados + 1;
      end if;
      update tmp_prov_import set resultado_id = v_fila.resultado_id where fila = v_fila.fila;
    end loop;
  end if;

  return jsonb_build_object(
    'aplicado', coalesce(p_aplicar, false),
    'total', (select count(*) from tmp_prov_import),
    'crear', (select count(*) from tmp_prov_import where accion = 'crear'),
    'actualizar', (select count(*) from tmp_prov_import where accion = 'actualizar'),
    'con_error', (select count(*) from tmp_prov_import where accion = 'error'),
    'creados', v_creados,
    'actualizados', v_actualizados,
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fila', t.fila, 'accion', t.accion, 'motivo', t.motivo, 'fila_repetida', t.fila_repetida,
        'existente_id', t.existente_id, 'id', t.resultado_id) order by t.fila)
      from tmp_prov_import t), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.fn_proveedor_int_documento(text) from public, anon;
grant execute on function public.fn_proveedor_int_documento(text) to authenticated, service_role;
revoke all on function public.fn_categorias_importar(integer, jsonb, boolean) from public, anon;
revoke all on function public.fn_proveedores_importar(integer, jsonb, boolean, integer[]) from public, anon;
grant execute on function public.fn_categorias_importar(integer, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_proveedores_importar(integer, jsonb, boolean, integer[]) to authenticated, service_role;
