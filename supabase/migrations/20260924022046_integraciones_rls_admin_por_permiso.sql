-- Integraciones: las políticas de integration_connections e integration_credentials
-- dejan de decidir «admin» por el NOMBRE del rol (regla dura 6 de CLAUDE.md).
--
-- Antes: `r.name = ANY ('owner','admin','Administrador','Admin de organización')`
-- (y la de lectura de credenciales, sin siquiera `is_active`). Un rol personalizado
-- con uno de esos nombres obtenía acceso a los secretos de las integraciones, y un
-- admin por permiso o por cargo quedaba fuera.
--
-- Ahora «admin» = miembro ACTIVO con `is_super_admin`, `role_id` 1|2 (Super Admin /
-- Admin de organización) o el permiso `admin.full_access` resuelto por
-- `check_user_permission` (rol + cargo, precedencia del cargo). Es el mismo criterio
-- que `requireOrgAdminOrPermission` / `withOrg({ admin: true })` en el servidor.
--
-- Rendimiento: `IN (SELECT …)` NO correlacionado con `(select auth.uid())`, que
-- Postgres evalúa una vez por sentencia (hashed subplan); `check_user_permission`
-- solo corre sobre las membresías del propio usuario. Sin EXISTS anidados.
--
-- No se toca la política de LECTURA de conexiones para miembros
-- ("Connections are viewable by organization members").
--
-- Verificado antes de aplicar en una transacción que se deshace: los 12 miembros
-- de las organizaciones con conexiones ven exactamente lo mismo que antes (11
-- admins por role_id 2 y un miembro con rol 4 sin acceso), y un rol 4 con
-- `admin.full_access` concedido dentro de la prueba pasa a ver sus credenciales.

drop policy if exists "Connections are manageable by organization admins" on public.integration_connections;

create policy integration_connections_admin_gestiona
  on public.integration_connections
  for all
  to authenticated
  using (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.user_id = (select auth.uid())
        and om.is_active = true
        and (
          om.is_super_admin = true
          or om.role_id in (1, 2)
          or public.check_user_permission((select auth.uid()), om.organization_id, 'admin.full_access')
        )
    )
  )
  with check (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.user_id = (select auth.uid())
        and om.is_active = true
        and (
          om.is_super_admin = true
          or om.role_id in (1, 2)
          or public.check_user_permission((select auth.uid()), om.organization_id, 'admin.full_access')
        )
    )
  );

comment on policy integration_connections_admin_gestiona on public.integration_connections is
  'Gestión de conexiones: miembro activo con is_super_admin, role_id 1|2 o permiso admin.full_access (check_user_permission). Nunca por nombre de rol.';

drop policy if exists "Credentials are manageable by organization admins" on public.integration_credentials;
drop policy if exists "Credentials are viewable by organization admins" on public.integration_credentials;

create policy integration_credentials_admin_gestiona
  on public.integration_credentials
  for all
  to authenticated
  using (
    connection_id in (
      select c.id
      from public.integration_connections c
      join public.organization_members om on om.organization_id = c.organization_id
      where om.user_id = (select auth.uid())
        and om.is_active = true
        and (
          om.is_super_admin = true
          or om.role_id in (1, 2)
          or public.check_user_permission((select auth.uid()), om.organization_id, 'admin.full_access')
        )
    )
  )
  with check (
    connection_id in (
      select c.id
      from public.integration_connections c
      join public.organization_members om on om.organization_id = c.organization_id
      where om.user_id = (select auth.uid())
        and om.is_active = true
        and (
          om.is_super_admin = true
          or om.role_id in (1, 2)
          or public.check_user_permission((select auth.uid()), om.organization_id, 'admin.full_access')
        )
    )
  );

comment on policy integration_credentials_admin_gestiona on public.integration_credentials is
  'Secretos de integraciones: solo admins de la organización de la conexión (is_super_admin, role_id 1|2 o admin.full_access). Nunca por nombre de rol.';
