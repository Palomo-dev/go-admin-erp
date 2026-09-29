-- Inventario B6a · Variantes: `fn_variantes_resumen` y `fn_variantes_int_valores_de`
-- sin búsquedas por fila.
--
-- Medido tras 20260929160100: el resumen tardaba 0,3 s en la org 137 (3 tipos,
-- 21.142 variantes) pero 3,2 s en la 197 (1.932 valores, 11.646 variantes),
-- porque resolvía cada par (tipo, valor) en uso con dos subconsultas sobre los
-- valores del tipo. Ahora la correspondencia valor ↔ catálogo es un cruce por
-- hash (misma regla: igual sin espacios al borde y, si no hay, igual sin
-- mayúsculas, el de menor id). `fn_variantes_int_valores_de` (lo que reescribe
-- renombrar o fusionar un valor) evalúa solo las escrituras que se parecen al
-- valor, no todas las del tipo. (Aplicada en dos pasos: el segundo,
-- `…_ajuste`, une por columnas ya recortadas para que el cruce sea por hash.)

set local lock_timeout = '5s';

create or replace function public.fn_variantes_int_valores_de(p_org integer, p_tipo integer, p_valor integer)
returns text[]
language sql
stable
set search_path = public, pg_temp
as $$
  with v as (
    select value from public.variant_values where id = p_valor and variant_type_id = p_tipo
  ),
  c as (
    select public.fn_variantes_int_claves_de(p_org, p_tipo) as claves
  ),
  distintos as (
    select distinct f.valor
      from public.fn_variantes_int_filas(p_org, true) f, c, v
     where f.clave = any (c.claves)
       and lower(btrim(f.valor)) = lower(btrim(v.value))
  )
  select coalesce(array_agg(d.valor), '{}')
    from distintos d
   where public.fn_variantes_int_valor_de(p_tipo, d.valor) = p_valor;
$$;
revoke all on function public.fn_variantes_int_valores_de(integer, integer, integer) from public, anon, authenticated;

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
    select ft.tipo_id, ft.valor, lower(ft.valor) as l, count(distinct ft.product_id) as n
      from filas_t ft where ft.tipo_id is not null
     group by ft.tipo_id, ft.valor
  ),
  vals as (
    select v.id, v.variant_type_id, btrim(v.value) as b, lower(btrim(v.value)) as l
      from public.variant_values v
      join public.variant_types t on t.id = v.variant_type_id and t.organization_id = p_org
  ),
  exactos as (
    select distinct on (variant_type_id, b) variant_type_id, b, id from vals order by variant_type_id, b, id
  ),
  sin_mayus as (
    select distinct on (variant_type_id, l) variant_type_id, l, id from vals order by variant_type_id, l, id
  ),
  pares_v as (
    select p.tipo_id, p.valor, p.n, coalesce(e.id, s.id) as valor_id
      from pares p
      left join exactos e on e.variant_type_id = p.tipo_id and e.b = p.valor
      left join sin_mayus s on s.variant_type_id = p.tipo_id and s.l = p.l
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
    select pv.valor_id,
           jsonb_agg(jsonb_build_object('texto', pv.valor, 'variantes', pv.n) order by pv.n desc) as lista
      from pares_v pv
      join public.variant_values v on v.id = pv.valor_id
     where pv.valor <> v.value
     group by pv.valor_id
  ),
  fuera_tipo as (
    select pv.tipo_id, count(*) as n from pares_v pv where pv.valor_id is null group by pv.tipo_id
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
               'valores_fuera', coalesce(ftp.n, 0),
               'escrituras', coalesce((select jsonb_agg(jsonb_build_object('texto', et.clave, 'variantes', et.n) order by et.n desc)
                                         from escrituras_tipo et where et.tipo_id = t.id), '[]'::jsonb))
             order by t.display_order, lower(t.name), t.id)
        from public.variant_types t
        left join uso_tipo ut on ut.tipo_id = t.id
        left join rel_tipo rt on rt.id = t.id
        left join fuera_tipo ftp on ftp.tipo_id = t.id
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
               'escrituras', coalesce(ev.lista, '[]'::jsonb))
             order by v.variant_type_id, v.display_order, v.id)
        from public.variant_values v
        join public.variant_types t on t.id = v.variant_type_id and t.organization_id = p_org
        left join uso_valor uv on uv.valor_id = v.id
        left join rel_valor rv on rv.id = v.id
        left join escrituras_valor ev on ev.valor_id = v.id), '[]'::jsonb),
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

revoke all on function public.fn_variantes_resumen(integer) from public, anon;
grant execute on function public.fn_variantes_resumen(integer) to authenticated;
