-- Reversión de 20261110220010_puc_catalogo_decreto_2650_clases_4_5.sql.
--
-- Quita del catálogo de referencia las filas de las clases 4 y 5. No toca puc_plantilla ni
-- el plan de cuentas de ninguna organización. Para quitar la tabla entera, la reversión de
-- 20261110220000_puc_catalogo_decreto_2650.sql.

do $$
begin
  if to_regclass('public.puc_catalogo') is not null then
    delete from public.puc_catalogo where left(codigo, 1) in ('4', '5');
  end if;
end
$$;
