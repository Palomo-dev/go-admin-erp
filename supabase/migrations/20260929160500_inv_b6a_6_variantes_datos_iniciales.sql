-- Inventario B6a · Variantes: datos iniciales del catálogo (INVENTARIO-PARIDAD-FIGMA §3.2).
--
-- 1. Completar el catálogo con los atributos que ya usan las variantes y no
--    estaban (medido antes de aplicar: 133 pares en 15 organizaciones, entre
--    ellos 5 tipos que solo existían en `variant_data`). Se usa
--    `fn_producto_int_asegurar_atributos`, la misma función del guardado del
--    producto (no distingue mayúsculas).
-- 2. Orden de los tipos por uso (el más usado primero). `display_order` es
--    nuevo en `variant_types`: todos valían 0.
-- 3. Orden de los valores SOLO en los tipos sin orden definido: todos sus
--    valores con el mismo `display_order` (17 de 20 organizaciones) o un orden
--    igual al de creación (lo que deja el guardado del producto al agregar
--    valores: nadie lo eligió). Primero los que empiezan por número, de
--    menor a mayor («7» < «7.5» < «10»); luego las tallas de letra en su orden
--    (XXS < XS < S < M < L < XL < XXL/2XL < XXXL/3XL < 4XL < 5XL < Única); al
--    final el resto en orden alfabético. Los tipos con un orden
--    elegido (orgs 0, 2, 112 y parte de la 137) no se tocan. (Aplicado en dos
--    pasos: el segundo, `…_ajuste`, sumó el criterio «igual al de creación» y
--    puso «2XL» con las tallas de letra y no con los números.)
-- 4. `display_style = 'color'` y `meta_attribute = 'color'` en los tipos
--    llamados «Color», «Colores» o «Colour» (13 tipos).
--
-- No se modifica `variant_data` ni ningún producto. Todo lo anterior queda en
-- `private.inv_b6a_datos_iniciales` para que el rollback lo deshaga exacto.

set local lock_timeout = '5s';

create table if not exists private.inv_b6a_datos_iniciales (
  tabla text not null,
  fila_id integer not null,
  cambio text not null,
  valor_anterior jsonb,
  primary key (tabla, fila_id, cambio)
);
revoke all on private.inv_b6a_datos_iniciales from public, anon, authenticated;

-- 1. Completar el catálogo --------------------------------------------------
do $$
declare
  v_org integer;
  v_par record;
  v_tipos_antes integer[];
  v_valores_antes integer[];
begin
  select coalesce(array_agg(id), '{}') into v_tipos_antes from public.variant_types;
  select coalesce(array_agg(id), '{}') into v_valores_antes from public.variant_values;
  for v_org in
    select distinct p.organization_id from public.products p
     where p.organization_id > 0 and p.parent_product_id is not null
       and jsonb_typeof(p.variant_data) = 'object' and p.variant_data <> '{}'::jsonb
       and not (p.variant_data ? 'types')
  loop
    for v_par in
      select distinct btrim(f.clave) as clave, f.valor
        from public.fn_variantes_int_filas(v_org, false) f
        left join public.fn_variantes_int_claves(v_org, false) c on c.clave = f.clave
       where c.tipo_id is null or public.fn_variantes_int_valor_de(c.tipo_id, f.valor) is null
    loop
      perform public.fn_producto_int_asegurar_atributos(v_org, jsonb_build_object(v_par.clave, v_par.valor));
    end loop;
  end loop;
  insert into private.inv_b6a_datos_iniciales (tabla, fila_id, cambio)
  select 'variant_types', id, 'creado' from public.variant_types where not (id = any (v_tipos_antes))
  on conflict do nothing;
  insert into private.inv_b6a_datos_iniciales (tabla, fila_id, cambio)
  select 'variant_values', id, 'creado' from public.variant_values where not (id = any (v_valores_antes))
  on conflict do nothing;
end;
$$;

-- 2. Orden de los tipos por uso ----------------------------------------------
do $$
declare
  v_org integer;
begin
  for v_org in select distinct organization_id from public.variant_types where organization_id > 0 loop
    with uso as (
      select c.tipo_id, count(distinct f.product_id) as n
        from public.fn_variantes_int_filas(v_org, false) f
        join public.fn_variantes_int_claves(v_org, false) c on c.clave = f.clave
       where c.tipo_id is not null
       group by c.tipo_id
    ),
    orden as (
      select t.id, t.display_order as antes,
             row_number() over (order by coalesce(u.n, 0) desc, lower(t.name), t.id) - 1 as pos
        from public.variant_types t left join uso u on u.tipo_id = t.id
       where t.organization_id = v_org
    ),
    respaldo as (
      insert into private.inv_b6a_datos_iniciales (tabla, fila_id, cambio, valor_anterior)
      select 'variant_types', o.id, 'orden', to_jsonb(o.antes) from orden o where o.antes is distinct from o.pos
      on conflict do nothing
      returning fila_id
    )
    update public.variant_types t set display_order = o.pos
      from orden o where o.id = t.id and t.display_order is distinct from o.pos;
  end loop;
end;
$$;

-- 3. Orden de los valores en los tipos sin orden -------------------------------
with posiciones as (
  select v.variant_type_id, v.id,
         row_number() over (partition by v.variant_type_id order by v.display_order, v.id) as por_orden,
         row_number() over (partition by v.variant_type_id order by v.id) as por_creacion,
         v.display_order
    from public.variant_values v
    join public.variant_types t on t.id = v.variant_type_id and t.organization_id > 0
),
sin_orden as (
  select p.variant_type_id
    from posiciones p
   group by p.variant_type_id
  having count(*) > 1
     and (count(distinct p.display_order) = 1 or bool_and(p.por_orden = p.por_creacion))
),
claves as (
  select v.id, v.variant_type_id, v.display_order as antes,
         case when lower(btrim(v.value)) in ('xxs','xs','s','m','l','xl','xxl','2xl','xxxl','3xl','4xl','5xl','única','unica','u') then 1
              when btrim(v.value) ~ '^[0-9]' then 0
              else 2 end as grupo,
         case when btrim(v.value) ~ '^[0-9]'
               and lower(btrim(v.value)) not in ('2xl','3xl','4xl','5xl')
              then substring(btrim(v.value) from '^[0-9]+(?:[.,][0-9]+)?') end as numero,
         case lower(btrim(v.value))
           when 'xxs' then 1 when 'xs' then 2 when 's' then 3 when 'm' then 4 when 'l' then 5 when 'xl' then 6
           when 'xxl' then 7 when '2xl' then 7 when 'xxxl' then 8 when '3xl' then 8 when '4xl' then 9 when '5xl' then 10
           else 11 end as talla,
         lower(btrim(v.value)) as texto
    from public.variant_values v
    join sin_orden s on s.variant_type_id = v.variant_type_id
),
orden as (
  select c.id, c.antes,
         row_number() over (partition by c.variant_type_id
                            order by c.grupo, replace(c.numero, ',', '.')::numeric nulls last, c.talla, c.texto, c.id) - 1 as pos
    from claves c
),
respaldo as (
  insert into private.inv_b6a_datos_iniciales (tabla, fila_id, cambio, valor_anterior)
  select 'variant_values', o.id, 'orden', to_jsonb(o.antes) from orden o where o.antes is distinct from o.pos
  on conflict do nothing
  returning fila_id
)
update public.variant_values v set display_order = o.pos
  from orden o where o.id = v.id and v.display_order is distinct from o.pos;

-- 4. Tipos de color ------------------------------------------------------------
with colores as (
  select t.id, t.display_style, t.meta_attribute
    from public.variant_types t
   where t.organization_id > 0
     and public.fn_variantes_int_norm(t.name) in ('color', 'colores', 'colour', 'colours', 'colors')
     and (t.display_style <> 'color' or t.meta_attribute is null)
),
respaldo as (
  insert into private.inv_b6a_datos_iniciales (tabla, fila_id, cambio, valor_anterior)
  select 'variant_types', c.id, 'estilo', jsonb_build_object('display_style', c.display_style, 'meta_attribute', c.meta_attribute)
    from colores c
  on conflict do nothing
  returning fila_id
)
update public.variant_types t
   set display_style = 'color', meta_attribute = coalesce(t.meta_attribute, 'color')
  from colores c where c.id = t.id;
