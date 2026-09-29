-- Reversión de 20260929160500_inv_b6a_6_variantes_datos_iniciales.sql
-- Deshace exacto lo que registró en private.inv_b6a_datos_iniciales: orden y
-- estilo anteriores, y borra los tipos y valores que creó (solo si siguen sin
-- uso por id: la cascada borraría relaciones).

set local lock_timeout = '5s';

update public.variant_values v
   set display_order = (r.valor_anterior #>> '{}')::integer
  from private.inv_b6a_datos_iniciales r
 where r.tabla = 'variant_values' and r.cambio = 'orden' and r.fila_id = v.id;

update public.variant_types t
   set display_order = (r.valor_anterior #>> '{}')::integer
  from private.inv_b6a_datos_iniciales r
 where r.tabla = 'variant_types' and r.cambio = 'orden' and r.fila_id = t.id;

update public.variant_types t
   set display_style = r.valor_anterior ->> 'display_style',
       meta_attribute = r.valor_anterior ->> 'meta_attribute'
  from private.inv_b6a_datos_iniciales r
 where r.tabla = 'variant_types' and r.cambio = 'estilo' and r.fila_id = t.id;

delete from public.variant_values v
 using private.inv_b6a_datos_iniciales r
 where r.tabla = 'variant_values' and r.cambio = 'creado' and r.fila_id = v.id
   and not exists (select 1 from public.product_variant_relations x where x.variant_value_id = v.id);

delete from public.variant_types t
 using private.inv_b6a_datos_iniciales r
 where r.tabla = 'variant_types' and r.cambio = 'creado' and r.fila_id = t.id
   and not exists (select 1 from public.variant_values x where x.variant_type_id = t.id)
   and not exists (select 1 from public.product_variant_relations x where x.variant_type_id = t.id);

drop table if exists private.inv_b6a_datos_iniciales;
