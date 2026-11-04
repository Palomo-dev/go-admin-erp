-- Rollback de 20261104003053. Antes, desplegar goadmin-websites sin el filtro por
-- archivo_disponible (si la columna desaparece y el sitio la pide, el select falla).
drop trigger if exists trg_storage_product_images_sync on storage.objects;
drop trigger if exists trg_product_images_archivo_disponible on public.product_images;
drop function if exists public.trg_storage_product_images_sync();
drop function if exists public.trg_product_images_archivo_disponible();
drop function if exists public.fn_product_image_archivo_disponible(text);
drop index if exists public.idx_product_images_storage_path;
alter table public.product_images drop column if exists archivo_disponible;
