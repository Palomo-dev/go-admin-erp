-- Reversión de 20261111100100_puc_catalogo_origen_plantilla.sql.
--
-- Borra las filas con origen 'plantilla_go_admin' (ninguna tiene hijos en el catálogo) y la columna origen.
-- Las 2.503 filas del Decreto no cambian. El aviso del plan vuelve a mostrar esos 16 códigos como
-- «no está en el PUC».

delete from public.puc_catalogo
 where origen = 'plantilla_go_admin';

alter table public.puc_catalogo
  drop column if exists origen;
