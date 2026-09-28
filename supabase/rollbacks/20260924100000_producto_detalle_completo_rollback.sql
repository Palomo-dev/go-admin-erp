-- Rollback de 20260924100000_producto_detalle_completo.sql
--
-- Advertencias:
--  * No restaura datos: los precios/costos, variantes, seriales, eventos y
--    movimientos creados con estas funciones se quedan.
--  * Volver al CHECK estrecho de serial_numbers.status falla si ya hay filas
--    con reserved/returned/in_transit/damaged/rma/warranty_claim; por eso se
--    deja NOT VALID (no se valida contra lo existente).
--  * La política anterior de product_notes («authenticated y organization_id no
--    nulo») y las de variant_types/variant_values («organization_id IS NOT
--    NULL») abrían los datos a cualquier organización. Se restauran solo porque
--    un rollback debe devolver el estado anterior; reaplicar la migración la
--    vuelve a cerrar.
--  * El bucket product-documents no se borra si tiene objetos.

drop function if exists public.fn_producto_historial(integer, integer, text[], timestamptz, timestamptz, integer, integer);
drop function if exists public.fn_producto_cambiar_estado(integer, integer, text);
drop function if exists public.fn_producto_imagenes_ordenar(integer, integer, integer[], integer);
drop function if exists public.fn_producto_fijar_costo(integer, integer, numeric, timestamptz, integer);
drop function if exists public.fn_producto_fijar_precio(integer, integer, numeric, numeric, timestamptz);
drop function if exists public.fn_producto_variante_estado(integer, integer, text);
drop function if exists public.fn_producto_variante_guardar(integer, integer, jsonb);
drop function if exists public.fn_producto_serial_cambiar_estado(integer, integer[], text, text);
drop function if exists public.fn_producto_generar_seriales(integer, integer, integer, integer, text[], numeric, text);
drop function if exists public.fn_producto_lotes(integer, integer);
drop function if exists public.fn_producto_kardex(integer, integer, integer, timestamptz, timestamptz, text, text, integer, integer);
drop function if exists public.fn_producto_resumen(integer, integer);
drop function if exists public.fn_producto_int_variante_guardar(integer, integer, jsonb, boolean);
drop function if exists public.fn_producto_int_asegurar_atributos(integer, jsonb);
drop function if exists public.fn_producto_int_ajustar_stock(integer, integer, integer, numeric, numeric, text);
drop function if exists public.fn_producto_int_stock_inicial(integer, integer, jsonb, text);
drop function if exists public.fn_producto_int_fijar_costo(integer, numeric, timestamptz, integer);
drop function if exists public.fn_producto_int_fijar_precio(integer, numeric, numeric, timestamptz);
drop function if exists public.fn_productos_permisos(integer);
drop function if exists public.fn_productos_exigir_permiso(integer, text[]);

drop policy if exists product_documents_miembros_select on storage.objects;
drop policy if exists product_documents_miembros_insert on storage.objects;
drop policy if exists product_documents_miembros_delete on storage.objects;
delete from storage.buckets b
 where b.id = 'product-documents'
   and not exists (select 1 from storage.objects o where o.bucket_id = b.id);

drop policy if exists variant_values_miembros on public.variant_values;
create policy "Allow operations on variant_values by organization" on public.variant_values
  for all using (exists (select 1 from public.variant_types vt
                          where vt.id = variant_values.variant_type_id and vt.organization_id is not null));
drop policy if exists variant_types_miembros on public.variant_types;
create policy "Allow operations on variant_types by organization" on public.variant_types
  for all using (organization_id is not null);
drop policy if exists product_notes_miembros on public.product_notes;
create policy product_notes_org_isolation on public.product_notes
  for all using ((auth.role() = 'authenticated') and (organization_id is not null));

alter table public.product_notes drop column if exists edited_at;
alter table public.product_notes drop column if exists pinned_at;
alter table public.product_notes drop column if exists is_pinned;

alter table public.serial_numbers drop constraint if exists serial_numbers_status_check;
alter table public.serial_numbers add constraint serial_numbers_status_check
  check (status = any (array['in_stock', 'sold', 'warranty', 'repair', 'defective'])) not valid;

drop index if exists public.idx_products_parent;
drop index if exists public.idx_lots_product;
drop index if exists public.idx_product_notes_product;
drop index if exists public.idx_stock_movements_product_created;
drop index if exists public.idx_invoice_items_product_id;
drop index if exists public.idx_sale_items_product_id;
