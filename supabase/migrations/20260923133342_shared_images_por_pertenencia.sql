-- shared_images por pertenencia a la organización (auditoría del catálogo,
-- docs/design/AUDITORIA-CATALOGO-PRODUCCION.md, hallazgos de RLS).
--
-- Antes: SELECT con USING (true) y INSERT con WITH CHECK (true). Verificado
-- antes de aplicar: un usuario de la org 137 veía 60 imágenes privadas de otras
-- organizaciones e insertaba una fila a nombre de la org 145.
-- UPDATE y DELETE comparaban organization_id con auth.jwt() ->> 'organization_id',
-- un claim que ningún JWT de usuario lleva (no hay access token hook): nadie
-- podía editar ni borrar sus propias imágenes (0 filas, sin error). Ahora las
-- cuatro operaciones van por membresía activa.
--
-- is_public = true se sigue viendo desde todas las organizaciones: la galería
-- (ImagenesService, ImagePickerDialog) consulta organization_id = X OR is_public
-- a propósito. Solo la organización dueña puede marcarla o desmarcarla.

set local lock_timeout = '3s';

drop policy if exists "Usuarios pueden actualizar imágenes de su organización" on public.shared_images;
drop policy if exists "Usuarios pueden eliminar imágenes de su organización" on public.shared_images;
drop policy if exists "Usuarios pueden subir imágenes para cualquier organización" on public.shared_images;
drop policy if exists "Usuarios pueden ver todas las imágenes" on public.shared_images;
drop policy if exists shared_images_lectura on public.shared_images;
drop policy if exists shared_images_insercion on public.shared_images;
drop policy if exists shared_images_edicion on public.shared_images;
drop policy if exists shared_images_borrado on public.shared_images;

create policy shared_images_lectura on public.shared_images
  for select to authenticated
  using (
    is_public is true
    or organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

create policy shared_images_insercion on public.shared_images
  for insert to authenticated
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

create policy shared_images_edicion on public.shared_images
  for update to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  )
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

create policy shared_images_borrado on public.shared_images
  for delete to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

revoke all on public.shared_images from anon;
revoke truncate on public.shared_images from authenticated;
