-- product_tags: fin de la lectura anónima y entre organizaciones (auditoría
-- del catálogo, docs/design/AUDITORIA-CATALOGO-PRODUCCION.md).
--
-- "Allow anon select product_tags" tenía USING (true) para el rol public:
-- anon leía las 729 etiquetas y un usuario de la org 137 veía 579 ajenas.
-- La tienda web las lee solo desde el servidor con service_role (el join
-- product_tags!products_tag_id_fkey de app/api/products/search y
-- lib/supabase/queries.ts); su navegador no las consulta.
--
-- La política de pertenencia usaba EXISTS correlacionado sin (select auth.uid()).
-- Mientras existió la USING (true) nunca se evaluaba de verdad; al quitarla
-- empieza a ejecutarse, así que se reescribe en la misma migración con la forma
-- IN (subconsulta), membresía activa y WITH CHECK explícito.

set local lock_timeout = '3s';

drop policy if exists "Allow anon select product_tags" on public.product_tags;
drop policy if exists "Users can view their organization product_tags" on public.product_tags;
drop policy if exists product_tags_miembros on public.product_tags;

create policy product_tags_miembros on public.product_tags
  for all to authenticated
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

revoke all on public.product_tags from anon;
revoke truncate on public.product_tags from authenticated;
