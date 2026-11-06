-- Cuentas automáticas (1 de 2): la subcategoría hereda la cuenta de su categoría padre.
--
-- Antes fn_cuenta_catalogo_linea solo miraba la categoría directa del producto. Ahora sube por
-- categories.parent_id y usa la categoría más cercana que tenga cuenta para ese rol.
--
-- No cambia ningún asiento existente:
--   * Los asientos publicados no se recalculan: esta función solo corre al armar uno nuevo.
--   * Medido el 2026-11-06: 0 de 1.324 categorías con cuenta y 0 subcategorías. Hoy el resultado
--     de la función es idéntico para todas las líneas.
--   * Si la categoría directa tiene cuenta, gana ella, igual que antes.
-- El orden línea, producto, categoría no cambia, ni la regla de devolución: sin cuenta de
-- devolución en un nivel, ese nivel usa su cuenta de ingreso antes de seguir buscando.

-- Una sola tabla de rol a columna, para producto y categoría.
create or replace function public.fn_cuenta_de_rol(
  p_rol text,
  p_ingreso text,
  p_costo text,
  p_inventario text,
  p_devolucion text
)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select case p_rol
    when 'costo' then nullif(btrim(p_costo), '')
    when 'inventario' then nullif(btrim(p_inventario), '')
    when 'devolucion' then coalesce(nullif(btrim(p_devolucion), ''), nullif(btrim(p_ingreso), ''))
    else nullif(btrim(p_ingreso), '')
  end;
$function$;

-- Categoría más cercana con cuenta para el rol, subiendo por sus padres. Nunca sale de la organización.
-- La ruta corta un ciclo aunque trg_categories_sin_ciclos ya los impida al escribir.
create or replace function public.fn_cuenta_categoria_heredada(
  p_organization_id integer,
  p_category_id integer,
  p_rol text
)
returns table (cuenta text, category_id integer, profundidad integer)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with recursive cadena as (
    select c.id, c.parent_id, c.cuenta_ingreso, c.cuenta_costo, c.cuenta_inventario, c.cuenta_devolucion,
           0 as profundidad, array[c.id] as ruta
      from public.categories c
     where c.id = p_category_id and c.organization_id = p_organization_id
    union all
    select p.id, p.parent_id, p.cuenta_ingreso, p.cuenta_costo, p.cuenta_inventario, p.cuenta_devolucion,
           h.profundidad + 1, h.ruta || p.id
      from cadena h
      join public.categories p on p.id = h.parent_id and p.organization_id = p_organization_id
     where not p.id = any (h.ruta)
  )
  select public.fn_cuenta_de_rol(p_rol, c.cuenta_ingreso, c.cuenta_costo, c.cuenta_inventario, c.cuenta_devolucion),
         c.id,
         c.profundidad
    from cadena c
   where public.fn_cuenta_de_rol(p_rol, c.cuenta_ingreso, c.cuenta_costo, c.cuenta_inventario, c.cuenta_devolucion) is not null
   order by c.profundidad
   limit 1;
$function$;

create or replace function public.fn_cuenta_catalogo_linea(
  p_organization_id integer,
  p_product_id integer,
  p_rol text,
  p_cuenta_linea text
)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    nullif(btrim(p_cuenta_linea), ''),
    public.fn_cuenta_de_rol(p_rol, p.cuenta_ingreso, p.cuenta_costo, p.cuenta_inventario, p.cuenta_devolucion),
    (select h.cuenta from public.fn_cuenta_categoria_heredada(p_organization_id, p.category_id, p_rol) h)
  )
  from (select 1) semilla
  left join public.products p
    on p.id = p_product_id and p.organization_id = p_organization_id;
$function$;

-- Internas del motor: mismo acceso que fn_cuenta_catalogo_linea.
revoke all on function public.fn_cuenta_de_rol(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.fn_cuenta_categoria_heredada(integer, integer, text) from public, anon, authenticated;
grant execute on function public.fn_cuenta_de_rol(text, text, text, text, text) to service_role;
grant execute on function public.fn_cuenta_categoria_heredada(integer, integer, text) to service_role;
