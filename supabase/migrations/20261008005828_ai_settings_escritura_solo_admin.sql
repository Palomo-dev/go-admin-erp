-- ai_settings: la ESCRITURA (insert, update, delete) exige el permiso de
-- administrador de la organización, el mismo que decide el solo-lectura de
-- Configuración › Chat › IA del chat (`admin.full_access`, resuelto como
-- `hasOrgAdminOrPermission`: super admin, rol 1/2 o el permiso por rol/cargo).
--
-- Antes: las políticas permisivas de insert/update solo pedían ser miembro
-- activo, así que cualquier miembro podía cambiar el modelo, el prompt o
-- encender la IA escribiendo directo desde el navegador.
--
-- Se agregan políticas RESTRICTIVE (Postgres las combina con AND sobre las
-- permisivas). La lectura no cambia. No afecta a:
--   * service_role (webhook de Stripe, edge function ai-auto-response, crons):
--     no pasa por RLS;
--   * funciones SECURITY DEFINER de postgres (decrement_ai_credits,
--     refund_ai_credits, fn_provision_ai_settings, renovación de créditos…):
--     el dueño de la tabla no pasa por RLS (sin FORCE).
-- `fn_crm_tiene_permiso` ya existe (SECURITY DEFINER, execute para authenticated).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_settings' and policyname = 'ai_settings_escritura_admin_insert') then
    create policy ai_settings_escritura_admin_insert on public.ai_settings
      as restrictive for insert to authenticated
      with check (public.fn_crm_tiene_permiso(organization_id, 'admin.full_access'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_settings' and policyname = 'ai_settings_escritura_admin_update') then
    create policy ai_settings_escritura_admin_update on public.ai_settings
      as restrictive for update to authenticated
      using (public.fn_crm_tiene_permiso(organization_id, 'admin.full_access'))
      with check (public.fn_crm_tiene_permiso(organization_id, 'admin.full_access'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_settings' and policyname = 'ai_settings_escritura_admin_delete') then
    create policy ai_settings_escritura_admin_delete on public.ai_settings
      as restrictive for delete to authenticated
      using (public.fn_crm_tiene_permiso(organization_id, 'admin.full_access'));
  end if;
end
$$;

comment on policy ai_settings_escritura_admin_insert on public.ai_settings is
  'Crear la configuración del chat IA exige admin.full_access (o super admin / rol 1-2). Lo resuelve fn_crm_tiene_permiso con la sesión.';
comment on policy ai_settings_escritura_admin_update on public.ai_settings is
  'Cambiar la configuración del chat IA exige admin.full_access (o super admin / rol 1-2). Lo resuelve fn_crm_tiene_permiso con la sesión.';
comment on policy ai_settings_escritura_admin_delete on public.ai_settings is
  'Borrar la configuración del chat IA exige admin.full_access (o super admin / rol 1-2). Hoy no hay política permisiva de borrado: queda como defensa.';
