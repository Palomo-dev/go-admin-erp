-- Inventario B6a · Variantes: RPC transaccionales del catálogo de tipos y
-- valores (Figma `969:595070`, página /app/inventario/variantes).
--
-- Plan: docs/implementacion/INVENTARIO-PLAN.md §5.7 (B6a) y
-- docs/design/INVENTARIO-PARIDAD-FIGMA.md §2.4 (12 defectos) y §3.3.
--
-- Modelo que se respeta: una variante es un producto hijo y sus atributos
-- viven en `products.variant_data` ({"Talla": "M"}); el padre guarda
-- {"types": [{"name": "Talla", "values": ["S", "M"]}]}; el catálogo
-- (`variant_types`/`variant_values`) sugiere y ordena; `product_variant_relations`
-- (solo la escribe la importación) enlaza por id.
--
-- Regla única de correspondencia entre una clave de `variant_data` y un tipo
-- del catálogo (`fn_variantes_int_claves`): igual sin espacios al borde; si
-- ningún tipo coincide así, igual sin mayúsculas (el de menor id). Lo mismo
-- para los valores dentro de su tipo. Así «talla» (349 variantes en una
-- organización) cuenta para «Talla» y renombrar «Talla» → «Talla» unifica la
-- escritura de todas sus variantes en una sola sentencia.
--
-- Todas SECURITY DEFINER con search_path fijo; leer exige `ver`, escribir
-- `editar_catalogo` y borrar `eliminar` (`fn_inventario_exigir_permiso`, que
-- valida antes la pertenencia con `fn_assert_acceso_org`). Sin EXECUTE para
-- anon ni public. Los ayudantes `fn_variantes_int_*` no se exponen.
--
-- Renombrar y fusionar reescriben `variant_data` de hijos y padres: cada fila
-- deja su rastro en `products_audit_log` (disparador existente) y el aviso de
-- cambio al catálogo de Facebook (`fn_meta_product_sync`), igual que editar
-- el producto. Los SKU no cambian.

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Ayudantes internos
-- ---------------------------------------------------------------------------

-- Pares (producto, clave, valor) de las variantes de la organización.
create or replace function public.fn_variantes_int_filas(p_org integer, p_incluir_borrados boolean default false)
returns table (product_id integer, clave text, valor text)
language sql
stable
set search_path = public, pg_temp
as $$
  select p.id, e.key, btrim(e.value #>> '{}')
    from public.products p
    cross join lateral jsonb_each(p.variant_data) e
   where p.organization_id = p_org
     and p.parent_product_id is not null
     and (p_incluir_borrados or p.status is distinct from 'deleted')
     and jsonb_typeof(p.variant_data) = 'object'
     and not (p.variant_data ? 'types')
     and jsonb_typeof(e.value) in ('string', 'number', 'boolean')
     and btrim(e.key) <> ''
     and btrim(e.value #>> '{}') <> '';
$$;

-- Cada clave distinta en uso y el tipo del catálogo al que corresponde (NULL si ninguno).
create or replace function public.fn_variantes_int_claves(p_org integer, p_incluir_borrados boolean default false)
returns table (clave text, tipo_id integer)
language sql
stable
set search_path = public, pg_temp
as $$
  with claves as (
    select distinct f.clave from public.fn_variantes_int_filas(p_org, p_incluir_borrados) f
  )
  select c.clave,
         coalesce(
           (select t.id from public.variant_types t
             where t.organization_id = p_org and btrim(t.name) = btrim(c.clave)
             order by t.id limit 1),
           (select t.id from public.variant_types t
             where t.organization_id = p_org and lower(btrim(t.name)) = lower(btrim(c.clave))
             order by t.id limit 1))
    from claves c;
$$;

-- Valor del catálogo al que corresponde un texto dentro de un tipo (misma regla).
create or replace function public.fn_variantes_int_valor_de(p_tipo integer, p_texto text)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select v.id from public.variant_values v
      where v.variant_type_id = p_tipo and btrim(v.value) = btrim(p_texto)
      order by v.id limit 1),
    (select v.id from public.variant_values v
      where v.variant_type_id = p_tipo and lower(btrim(v.value)) = lower(btrim(p_texto))
      order by v.id limit 1));
$$;

-- Reescribe los atributos de UNA variante: las claves de `p_claves` pasan a
-- `p_clave_nueva` (si no es NULL) y, dentro de esas claves, los valores de
-- `p_valores` (sin espacios al borde) pasan a `p_valor_nuevo`. Si la variante ya
-- tenía la clave de destino exacta, gana esa (fusión: se conserva el destino).
create or replace function public.fn_variantes_int_mapear(
  p_vd jsonb, p_claves text[], p_clave_nueva text, p_valores text[], p_valor_nuevo text)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(x.k, x.v), '{}'::jsonb)
    from (
      select distinct on (m.k) m.k, m.v
        from (
          select case when e.key = any (p_claves) and p_clave_nueva is not null then p_clave_nueva else e.key end as k,
                 case when e.key = any (p_claves) and p_valores is not null
                           and btrim(e.value #>> '{}') = any (p_valores)
                      then to_jsonb(p_valor_nuevo) else e.value end as v,
                 (e.key = coalesce(p_clave_nueva, e.key)) as es_destino,
                 e.ord
            from jsonb_each(p_vd) with ordinality as e(key, value, ord)
        ) m
       order by m.k, m.es_destino desc, m.ord
    ) x;
$$;

-- Lo mismo para el padre ({"types": [{"name", "values"}]}), sin distinguir
-- mayúsculas ni espacios en los nombres: une entradas y valores repetidos.
create or replace function public.fn_variantes_int_mapear_padre(
  p_vd jsonb, p_claves text[], p_clave_nueva text, p_valores text[], p_valor_nuevo text)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_claves text[] := (select array_agg(lower(btrim(c))) from unnest(p_claves) c);
  v_valores text[] := (select array_agg(lower(btrim(c))) from unnest(p_valores) c);
  v_out jsonb := '[]'::jsonb;
  v_e jsonb;
  v_nombre text;
  v_en_tipo boolean;
  v_vals jsonb;
  v_val text;
  v_i integer;
  v_pos integer;
begin
  if p_vd is null or jsonb_typeof(p_vd -> 'types') is distinct from 'array' then
    return p_vd;
  end if;
  for v_e in select value from jsonb_array_elements(p_vd -> 'types') loop
    continue when jsonb_typeof(v_e) is distinct from 'object';
    v_nombre := v_e ->> 'name';
    v_en_tipo := lower(btrim(coalesce(v_nombre, ''))) = any (v_claves);
    if v_en_tipo and p_clave_nueva is not null then
      v_nombre := p_clave_nueva;
    end if;
    v_vals := '[]'::jsonb;
    if jsonb_typeof(v_e -> 'values') = 'array' then
      for v_val in select value #>> '{}' from jsonb_array_elements(v_e -> 'values') loop
        if v_en_tipo and v_valores is not null and lower(btrim(coalesce(v_val, ''))) = any (v_valores) then
          v_val := p_valor_nuevo;
        end if;
        if not exists (select 1 from jsonb_array_elements_text(v_vals) x where lower(btrim(x)) = lower(btrim(v_val))) then
          v_vals := v_vals || to_jsonb(v_val);
        end if;
      end loop;
    end if;
    -- ¿Ya hay una entrada con ese nombre? Se unen los valores.
    v_pos := null;
    for v_i in 0 .. jsonb_array_length(v_out) - 1 loop
      if lower(btrim(v_out -> v_i ->> 'name')) = lower(btrim(coalesce(v_nombre, ''))) then
        v_pos := v_i;
        exit;
      end if;
    end loop;
    if v_pos is null then
      v_out := v_out || jsonb_build_array(v_e || jsonb_build_object('name', v_nombre, 'values', v_vals));
    else
      for v_val in select value from jsonb_array_elements_text(v_vals) loop
        if not exists (select 1 from jsonb_array_elements_text(v_out -> v_pos -> 'values') x where lower(btrim(x)) = lower(btrim(v_val))) then
          v_out := jsonb_set(v_out, array[v_pos::text, 'values'], (v_out -> v_pos -> 'values') || to_jsonb(v_val));
        end if;
      end loop;
    end if;
  end loop;
  return jsonb_set(p_vd, '{types}', v_out);
end;
$$;

-- Aplica el mapeo a hijos y padres de la organización. Devuelve cuántas
-- VARIANTES (hijos) cambiaron.
create or replace function public.fn_variantes_int_reescribir(
  p_org integer, p_claves text[], p_clave_nueva text, p_valores text[], p_valor_nuevo text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_hijos integer := 0;
begin
  if p_claves is null or cardinality(p_claves) = 0 then
    return 0;
  end if;
  update public.products p
     set variant_data = public.fn_variantes_int_mapear(p.variant_data, p_claves, p_clave_nueva, p_valores, p_valor_nuevo)
   where p.organization_id = p_org
     and p.parent_product_id is not null
     and jsonb_typeof(p.variant_data) = 'object'
     and not (p.variant_data ? 'types')
     and p.variant_data ?| p_claves
     and public.fn_variantes_int_mapear(p.variant_data, p_claves, p_clave_nueva, p_valores, p_valor_nuevo) is distinct from p.variant_data;
  get diagnostics v_hijos = row_count;

  update public.products p
     set variant_data = public.fn_variantes_int_mapear_padre(p.variant_data, p_claves, p_clave_nueva, p_valores, p_valor_nuevo)
   where p.organization_id = p_org
     and p.variant_data ? 'types'
     and public.fn_variantes_int_mapear_padre(p.variant_data, p_claves, p_clave_nueva, p_valores, p_valor_nuevo) is distinct from p.variant_data;
  return v_hijos;
end;
$$;

-- Claves (escrituras) en uso de un tipo, borrados incluidos: lo que hay que reescribir.
create or replace function public.fn_variantes_int_claves_de(p_org integer, p_tipo integer)
returns text[]
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(c.clave), '{}') from public.fn_variantes_int_claves(p_org, true) c where c.tipo_id = p_tipo;
$$;

-- Escrituras en uso de un valor dentro de su tipo, borrados incluidos.
create or replace function public.fn_variantes_int_valores_de(p_org integer, p_tipo integer, p_valor integer)
returns text[]
language sql
stable
set search_path = public, pg_temp
as $$
  with c as (
    select public.fn_variantes_int_claves_de(p_org, p_tipo) as claves
  ),
  distintos as (
    select distinct f.valor
      from public.fn_variantes_int_filas(p_org, true) f, c
     where f.clave = any (c.claves)
  )
  select coalesce(array_agg(d.valor), '{}')
    from distintos d
   where public.fn_variantes_int_valor_de(p_tipo, d.valor) = p_valor;
$$;

-- Nombre normalizado para detectar repetidos al crear o renombrar: sin
-- mayúsculas, tildes ni espacios sobrantes («Diseño » = «diseno»).
create or replace function public.fn_variantes_int_norm(p_texto text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select translate(lower(btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g'))),
                   'áàäâãéèëêíìïîóòöôõúùüûçñ', 'aaaaaeeeeiiiiooooouuuucn');
$$;

-- El tipo debe ser de la organización (bloqueado para escribir).
create or replace function public.fn_variantes_int_tipo(p_org integer, p_tipo integer)
returns public.variant_types
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_t public.variant_types;
begin
  select * into v_t from public.variant_types where id = p_tipo and organization_id = p_org for update;
  if v_t.id is null then
    raise exception 'tipo_no_encontrado' using errcode = 'P0002', detail = 'El tipo de variante no existe o es de otra organización.';
  end if;
  return v_t;
end;
$$;

revoke all on function public.fn_variantes_int_filas(integer, boolean) from public, anon, authenticated;
revoke all on function public.fn_variantes_int_claves(integer, boolean) from public, anon, authenticated;
revoke all on function public.fn_variantes_int_valor_de(integer, text) from public, anon, authenticated;
revoke all on function public.fn_variantes_int_mapear(jsonb, text[], text, text[], text) from public, anon, authenticated;
revoke all on function public.fn_variantes_int_mapear_padre(jsonb, text[], text, text[], text) from public, anon, authenticated;
revoke all on function public.fn_variantes_int_reescribir(integer, text[], text, text[], text) from public, anon, authenticated;
revoke all on function public.fn_variantes_int_claves_de(integer, integer) from public, anon, authenticated;
revoke all on function public.fn_variantes_int_valores_de(integer, integer, integer) from public, anon, authenticated;
revoke all on function public.fn_variantes_int_norm(text) from public, anon, authenticated;
revoke all on function public.fn_variantes_int_tipo(integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lectura
-- ---------------------------------------------------------------------------

-- Catálogo con su uso real, agrupado en SQL (sin traer las variantes al
-- navegador). Incluye los atributos en uso que no están en el catálogo y el
-- catálogo global sugerido (org 0) para el estado vacío.
create or replace function public.fn_variantes_resumen(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_out jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);

  with filas as (
    select * from public.fn_variantes_int_filas(p_org, false)
  ),
  claves as (
    select * from public.fn_variantes_int_claves(p_org, false)
  ),
  filas_t as (
    select f.product_id, f.clave, f.valor, c.tipo_id
      from filas f join claves c on c.clave = f.clave
  ),
  pares as (
    select ft.tipo_id, ft.valor, count(distinct ft.product_id) as n
      from filas_t ft where ft.tipo_id is not null
     group by ft.tipo_id, ft.valor
  ),
  pares_v as (
    select p.tipo_id, p.valor, p.n, public.fn_variantes_int_valor_de(p.tipo_id, p.valor) as valor_id
      from pares p
  ),
  uso_tipo as (
    select ft.tipo_id, count(distinct ft.product_id) as n
      from filas_t ft where ft.tipo_id is not null group by ft.tipo_id
  ),
  escrituras_tipo as (
    select ft.tipo_id, ft.clave, count(distinct ft.product_id) as n
      from filas_t ft
      join public.variant_types t on t.id = ft.tipo_id
     where ft.clave <> t.name
     group by ft.tipo_id, ft.clave
  ),
  uso_valor as (
    select pv.valor_id, sum(pv.n)::integer as n
      from pares_v pv where pv.valor_id is not null group by pv.valor_id
  ),
  escrituras_valor as (
    select pv.valor_id, pv.valor, pv.n
      from pares_v pv
      join public.variant_values v on v.id = pv.valor_id
     where pv.valor <> v.value
  ),
  rel_tipo as (
    select r.variant_type_id as id, count(*) as n
      from public.product_variant_relations r
      join public.variant_types t on t.id = r.variant_type_id and t.organization_id = p_org
     group by r.variant_type_id
  ),
  rel_valor as (
    select r.variant_value_id as id, count(*) as n
      from public.product_variant_relations r
      join public.variant_types t on t.id = r.variant_type_id and t.organization_id = p_org
     group by r.variant_value_id
  )
  select jsonb_build_object(
    'tipos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               'nombre', t.name,
               'orden', t.display_order,
               'activo', t.is_active,
               'estilo', t.display_style,
               'meta', t.meta_attribute,
               'traducciones', t.translations,
               'creado', t.created_at,
               'variantes', coalesce(ut.n, 0),
               'relaciones', coalesce(rt.n, 0),
               'valores_fuera', (select count(*) from pares_v pv where pv.tipo_id = t.id and pv.valor_id is null),
               'escrituras', coalesce((select jsonb_agg(jsonb_build_object('texto', et.clave, 'variantes', et.n) order by et.n desc)
                                         from escrituras_tipo et where et.tipo_id = t.id), '[]'::jsonb))
             order by t.display_order, lower(t.name), t.id)
        from public.variant_types t
        left join uso_tipo ut on ut.tipo_id = t.id
        left join rel_tipo rt on rt.id = t.id
       where t.organization_id = p_org), '[]'::jsonb),
    'valores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id,
               'tipo_id', v.variant_type_id,
               'valor', v.value,
               'orden', v.display_order,
               'activo', v.is_active,
               'hex', v.hex_color,
               'imagen', v.image_url,
               'sku', v.sku_code,
               'traducciones', v.translations,
               'variantes', coalesce(uv.n, 0),
               'relaciones', coalesce(rv.n, 0),
               'escrituras', coalesce((select jsonb_agg(jsonb_build_object('texto', ev.valor, 'variantes', ev.n) order by ev.n desc)
                                         from escrituras_valor ev where ev.valor_id = v.id), '[]'::jsonb))
             order by v.variant_type_id, v.display_order, v.id)
        from public.variant_values v
        join public.variant_types t on t.id = v.variant_type_id and t.organization_id = p_org
        left join uso_valor uv on uv.valor_id = v.id
        left join rel_valor rv on rv.id = v.id), '[]'::jsonb),
    'fuera_catalogo', jsonb_build_object(
      'tipos', coalesce((
        select jsonb_agg(jsonb_build_object('texto', x.clave, 'variantes', x.n) order by x.n desc)
          from (select ft.clave, count(distinct ft.product_id) as n from filas_t ft where ft.tipo_id is null group by ft.clave) x), '[]'::jsonb),
      'pares', (select count(*) from pares_v pv where pv.valor_id is null)
               + (select count(distinct (ft.clave, ft.valor)) from filas_t ft where ft.tipo_id is null)),
    'variantes', (select count(distinct f.product_id) from filas f),
    'globales', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'nombre', g.name,
               'valores', coalesce((select jsonb_agg(gv.value order by gv.display_order, gv.id)
                                      from public.variant_values gv where gv.variant_type_id = g.id), '[]'::jsonb))
             order by g.id)
        from public.variant_types g where g.organization_id = 0), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

-- Permisos de ejecución
revoke all on function public.fn_variantes_resumen(integer) from public, anon;
grant execute on function public.fn_variantes_resumen(integer) to authenticated;
