-- Un administrador ve y edita los envíos programados de toda su organización
-- con el cliente de su sesión.
--
-- La política permisiva de la fila propia (auth.uid() = user_id) y la
-- restrictiva de membresía dejaban al administrador solo sus filas, y la
-- ruta tenía que saltarse la RLS con el service role. Esta política
-- permisiva se suma a la propia: pasa quien es miembro activo y
-- administrador (super admin, rol 1 o 2, o el permiso admin.full_access,
-- el mismo criterio que hasOrgAdminOrPermission). Quien no lo es sigue
-- viendo solo las suyas. El cron y el guardado de cierres no cambian.

drop policy if exists scheduled_reports_admin_org on public.scheduled_reports;
create policy scheduled_reports_admin_org on public.scheduled_reports
  as permissive for all to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.user_id = (select auth.uid())
        and om.organization_id = scheduled_reports.organization_id
        and om.is_active = true
        and (
          om.is_super_admin = true
          or om.role_id in (1, 2)
          or public.check_user_permission((select auth.uid()), om.organization_id, 'admin.full_access')
        )
    )
  )
  with check (
    exists (
      select 1 from public.organization_members om
      where om.user_id = (select auth.uid())
        and om.organization_id = scheduled_reports.organization_id
        and om.is_active = true
        and (
          om.is_super_admin = true
          or om.role_id in (1, 2)
          or public.check_user_permission((select auth.uid()), om.organization_id, 'admin.full_access')
        )
    )
  );
