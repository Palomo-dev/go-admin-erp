-- Reversión de 20261107150000_categoria_hereda_cuenta.
-- Devuelve fn_cuenta_catalogo_linea a su versión anterior, que solo mira la categoría directa.
-- Revertir antes 20261107151000_cuenta_efectiva, que depende de estas funciones.
-- Los asientos ya publicados no se tocan.

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
    case p_rol
      when 'costo' then nullif(btrim(p.cuenta_costo), '')
      when 'inventario' then nullif(btrim(p.cuenta_inventario), '')
      when 'devolucion' then coalesce(nullif(btrim(p.cuenta_devolucion), ''), nullif(btrim(p.cuenta_ingreso), ''))
      else nullif(btrim(p.cuenta_ingreso), '')
    end,
    case p_rol
      when 'costo' then nullif(btrim(c.cuenta_costo), '')
      when 'inventario' then nullif(btrim(c.cuenta_inventario), '')
      when 'devolucion' then coalesce(nullif(btrim(c.cuenta_devolucion), ''), nullif(btrim(c.cuenta_ingreso), ''))
      else nullif(btrim(c.cuenta_ingreso), '')
    end
  )
  from (select 1) semilla
  left join public.products p
    on p.id = p_product_id and p.organization_id = p_organization_id
  left join public.categories c
    on c.id = p.category_id and c.organization_id = p.organization_id;
$function$;

drop function if exists public.fn_cuenta_categoria_heredada(integer, integer, text);
drop function if exists public.fn_cuenta_de_rol(text, text, text, text, text);
