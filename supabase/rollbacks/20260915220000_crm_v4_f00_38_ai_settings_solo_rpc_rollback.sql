-- =============================================================================
-- ROLLBACK de crm_v4_f00_38_ai_settings_solo_rpc
-- Restaura los privilegios de tabla y las tres políticas originales de
-- public.ai_settings tal como estaban el 2026-09-15 (texto tomado de
-- pg_policies con el MCP). No toca datos.
--
-- ADVERTENCIA: al revertir, cualquier miembro vuelve a poder editar
-- credits_remaining desde el navegador (el crítico 1 del QA r1 se reabre).
-- =============================================================================

begin;

drop policy if exists ai_settings_select on public.ai_settings;
drop policy if exists ai_settings_insert on public.ai_settings;
drop policy if exists ai_settings_update on public.ai_settings;

-- Privilegios de columna: al conceder de nuevo la tabla completa, los grants
-- de columna quedan subsumidos; se revocan antes para no dejar rastro doble.
revoke all on table public.ai_settings from authenticated;
grant all on table public.ai_settings to anon, authenticated;

drop policy if exists "Members can manage AI settings" on public.ai_settings;
create policy "Members can manage AI settings" on public.ai_settings
  as permissive for all to public
  using (
    organization_id in (
      select om.organization_id
        from organization_members om
       where om.user_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select om.organization_id
        from organization_members om
       where om.user_id = auth.uid()
    )
  );

drop policy if exists "Organization admins can manage AI settings" on public.ai_settings;
create policy "Organization admins can manage AI settings" on public.ai_settings
  as permissive for all to public
  using (
    organization_id in (
      select om.organization_id
        from organization_members om
       where om.user_id = auth.uid()
         and om.is_super_admin = true
    )
  )
  with check (
    organization_id in (
      select om.organization_id
        from organization_members om
       where om.user_id = auth.uid()
         and om.is_super_admin = true
    )
  );

drop policy if exists "Users can view AI settings of their organization" on public.ai_settings;
create policy "Users can view AI settings of their organization" on public.ai_settings
  as permissive for select to public
  using (
    organization_id in (
      select organization_members.organization_id
        from organization_members
       where organization_members.user_id = auth.uid()
    )
  );

commit;
