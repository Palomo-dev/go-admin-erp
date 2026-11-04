-- Tras borrarse el proyecto anterior (2026-11-03), ~62 mil filas de product_images apuntan
-- a archivos de Storage que ya no existen: los sitios piden cada foto, reciben 400 y
-- muestran la imagen rota. Se marca cada fila con archivo_disponible (aditivo, sin borrar
-- filas) para que el sitio las omita, y dos triggers lo mantienen al día: si el archivo
-- vuelve a subirse a la misma ruta, la foto reaparece sola.
--
-- Ensayo (ENSAYO_OK): 62.332 filas sin archivo, 28.461 disponibles; un objeto nuevo en
-- product-images con la ruta de una fila faltante la vuelve a marcar disponible.
-- Rollback: supabase/rollbacks/20261104003053_product_images_archivo_disponible_rollback.sql
alter table public.product_images add column if not exists archivo_disponible boolean not null default true;

comment on column public.product_images.archivo_disponible is
  'false = storage_path no existe en el bucket product-images (ni es URL externa). Lo mantienen trg_product_images_archivo_disponible y trg_storage_product_images_sync.';

create or replace function public.fn_product_image_archivo_disponible(p_path text)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $f$
  select p_path ~* '^https?://'
      or exists (select 1 from storage.objects o where o.bucket_id = 'product-images' and o.name = p_path);
$f$;

create or replace function public.trg_product_images_archivo_disponible()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
begin
  new.archivo_disponible := public.fn_product_image_archivo_disponible(new.storage_path);
  return new;
end $f$;

create or replace function public.trg_storage_product_images_sync()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.bucket_id = 'product-images' then
    update public.product_images set archivo_disponible = true
     where storage_path = new.name and archivo_disponible is distinct from true;
  end if;
  if tg_op in ('DELETE', 'UPDATE') and old.bucket_id = 'product-images'
     and (tg_op = 'DELETE' or old.name is distinct from new.name) then
    update public.product_images set archivo_disponible = false
     where storage_path = old.name and archivo_disponible is distinct from false;
  end if;
  return null;
end $f$;

revoke all on function public.fn_product_image_archivo_disponible(text) from public, anon;
revoke all on function public.trg_product_images_archivo_disponible() from public, anon, authenticated;
revoke all on function public.trg_storage_product_images_sync() from public, anon, authenticated;

create trigger trg_product_images_archivo_disponible
  before insert or update of storage_path on public.product_images
  for each row execute function public.trg_product_images_archivo_disponible();

create trigger trg_storage_product_images_sync
  after insert or update of name or delete on storage.objects
  for each row execute function public.trg_storage_product_images_sync();

update public.product_images pi set archivo_disponible = false
 where not public.fn_product_image_archivo_disponible(pi.storage_path);

create index if not exists idx_product_images_storage_path on public.product_images (storage_path);
