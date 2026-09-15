-- ============================================================
-- ROLLBACK de 20260909183951_crm_v4_f06_06_tool_runs_audit_inmutable
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Reabre voice_agent_tool_runs al cliente (políticas + grants) como estaba tras f06_02.
--
-- SOBRE LOS DATOS: no toca datos. OJO: el inquilino vuelve a poder borrar la prueba de un opt-out (Ley 1581).
-- ============================================================

begin;
comment on table public.voice_agent_tool_runs is null;
grant insert, update, delete, truncate on table public.voice_agent_tool_runs to anon, authenticated;
create policy vatr_insert on public.voice_agent_tool_runs for insert
  with check (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true));
create policy vatr_update on public.voice_agent_tool_runs for update
  using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true))
  with check (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true));
create policy vatr_delete on public.voice_agent_tool_runs for delete
  using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true));
commit;
