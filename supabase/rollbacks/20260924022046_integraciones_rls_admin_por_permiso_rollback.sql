-- Rollback de 20260924022046_integraciones_rls_admin_por_permiso.sql
-- Restaura las políticas anteriores TAL CUAL estaban (admin por NOMBRE de rol,
-- que es justo lo que la migración corrige). Solo estructura: no hay datos que revertir.

drop policy if exists integration_connections_admin_gestiona on public.integration_connections;

create policy "Connections are manageable by organization admins"
  on public.integration_connections
  for all
  to public
  using (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      join public.roles r on om.role_id = r.id
      where om.user_id = auth.uid()
        and om.is_active = true
        and (r.name)::text = any ((array['owner'::varchar, 'admin'::varchar, 'Administrador'::varchar, 'Admin de organización'::varchar])::text[])
    )
  )
  with check (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      join public.roles r on om.role_id = r.id
      where om.user_id = auth.uid()
        and om.is_active = true
        and (r.name)::text = any ((array['owner'::varchar, 'admin'::varchar, 'Administrador'::varchar, 'Admin de organización'::varchar])::text[])
    )
  );

drop policy if exists integration_credentials_admin_gestiona on public.integration_credentials;

create policy "Credentials are manageable by organization admins"
  on public.integration_credentials
  for all
  to public
  using (
    connection_id in (
      select c.id
      from public.integration_connections c
      join public.organization_members om on c.organization_id = om.organization_id
      join public.roles r on om.role_id = r.id
      where om.user_id = auth.uid()
        and om.is_active = true
        and (r.name)::text = any ((array['owner'::varchar, 'admin'::varchar, 'Administrador'::varchar, 'Admin de organización'::varchar])::text[])
    )
  )
  with check (
    connection_id in (
      select c.id
      from public.integration_connections c
      join public.organization_members om on c.organization_id = om.organization_id
      join public.roles r on om.role_id = r.id
      where om.user_id = auth.uid()
        and om.is_active = true
        and (r.name)::text = any ((array['owner'::varchar, 'admin'::varchar, 'Administrador'::varchar, 'Admin de organización'::varchar])::text[])
    )
  );

create policy "Credentials are viewable by organization admins"
  on public.integration_credentials
  for select
  to authenticated
  using (
    connection_id in (
      select c.id
      from public.integration_connections c
      join public.organization_members om on c.organization_id = om.organization_id
      join public.roles r on om.role_id = r.id
      where om.user_id = auth.uid()
        and (r.name)::text = any ((array['owner'::varchar, 'admin'::varchar, 'Administrador'::varchar])::text[])
    )
  );
