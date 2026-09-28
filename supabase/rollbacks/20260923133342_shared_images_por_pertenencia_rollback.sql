-- Rollback de shared_images_por_pertenencia: restaura las políticas anteriores,
-- TAMBIÉN el agujero (lectura de todas las organizaciones e inserción para
-- cualquiera). No toca datos.

set local lock_timeout = '3s';

drop policy if exists shared_images_lectura on public.shared_images;
drop policy if exists shared_images_insercion on public.shared_images;
drop policy if exists shared_images_edicion on public.shared_images;
drop policy if exists shared_images_borrado on public.shared_images;
drop policy if exists "Usuarios pueden actualizar imágenes de su organización" on public.shared_images;
drop policy if exists "Usuarios pueden eliminar imágenes de su organización" on public.shared_images;
drop policy if exists "Usuarios pueden subir imágenes para cualquier organización" on public.shared_images;
drop policy if exists "Usuarios pueden ver todas las imágenes" on public.shared_images;

create policy "Usuarios pueden actualizar imágenes de su organización" on public.shared_images
  for update to public
  using (organization_id = ((auth.jwt() ->> 'organization_id'::text))::integer);

create policy "Usuarios pueden eliminar imágenes de su organización" on public.shared_images
  for delete to public
  using (organization_id = ((auth.jwt() ->> 'organization_id'::text))::integer);

create policy "Usuarios pueden subir imágenes para cualquier organización" on public.shared_images
  for insert to public
  with check (true);

create policy "Usuarios pueden ver todas las imágenes" on public.shared_images
  for select to public
  using (true);

-- Antes de la migración anon tenía solo REFERENCES, TRIGGER y TRUNCATE.
grant references, trigger, truncate on public.shared_images to anon;
grant truncate on public.shared_images to authenticated;
