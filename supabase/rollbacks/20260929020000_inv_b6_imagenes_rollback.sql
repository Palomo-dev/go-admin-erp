-- Reversión de 20260929020000_inv_b6_imagenes.sql.
--
-- Retira las RPC de la biblioteca de imágenes y los índices, y repone el
-- disparador `trigger_update_image_url` tal como estaba (asigna una columna
-- `image_url` que `shared_images` no tiene: «Hacer pública» vuelve a fallar).
-- Las columnas `alt_text` y `created_by` se CONSERVAN: tienen datos de los
-- usuarios; si de verdad hay que quitarlas, descomentar al final sabiendo que
-- se pierden los textos alternativos escritos desde la biblioteca.

drop function if exists public.fn_imagenes_eliminar(integer, integer[]);
drop function if exists public.fn_imagen_asignar_productos(integer, integer, integer[], boolean);
drop function if exists public.fn_imagenes_visibilidad(integer, integer[], boolean);
drop function if exists public.fn_imagen_actualizar(integer, integer, text, text, boolean);
drop function if exists public.fn_imagen_registrar(integer, text, text, integer, text, jsonb, text);
drop function if exists public.fn_imagen_detalle(integer, integer);
drop function if exists public.fn_imagenes_listado(integer, text, text, text, text, text, text, integer, text, integer, integer);
drop function if exists public.fn_imagenes_resumen(integer);
drop function if exists public.fn_imagen_int_usos(integer, integer, text);

drop index if exists public.idx_product_images_storage_path;
drop index if exists public.idx_shared_images_org_creada;

drop trigger if exists trigger_update_image_url on public.shared_images;
create trigger trigger_update_image_url
  before insert or update of is_public on public.shared_images
  for each row execute function public.update_image_url();

-- alter table public.shared_images drop column if exists created_by;
-- alter table public.shared_images drop column if exists alt_text;
