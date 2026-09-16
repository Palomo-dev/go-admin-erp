-- Reversión de 20260910000559_go_assistant_f0_restringir_lectura_agent_actions.sql
-- Vuelve a la política de lectura por pertenencia a la organización.
drop policy if exists "Authors and org admins can view agent actions" on public.ai_agent_actions;
create policy "Members can view agent actions of their organization"
  on public.ai_agent_actions for select
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = auth.uid() and om.is_active = true));
