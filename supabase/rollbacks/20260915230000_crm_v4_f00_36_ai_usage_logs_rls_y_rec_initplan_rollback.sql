-- Rollback de crm_v4_f00_36_ai_usage_logs_rls_y_rec_initplan.
-- Restaura las políticas y los grants EXACTAMENTE como estaban antes (medidos
-- en pg_policies / pg_class.relacl el 2026-09-15). Ojo: el estado anterior es
-- el inseguro (INSERT abierto a anon en ai_usage_logs); solo se revierte si la
-- migración rompió una escritura legítima, y en ese caso conviene aplicar en
-- su lugar una política `for insert to authenticated with check (pertenencia)`.
-- No toca datos: no hay DML en la migración.

begin;

-- 3) call_recordings: políticas con auth.uid() sin subselect (como estaban) y grant a anon.
alter policy rec_select on public.call_recordings
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = auth.uid() and om.is_active = true));
alter policy rec_insert on public.call_recordings
  with check (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = auth.uid() and om.is_active = true));
alter policy rec_update on public.call_recordings
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = auth.uid() and om.is_active = true))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = auth.uid() and om.is_active = true));
alter policy rec_delete on public.call_recordings
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = auth.uid() and om.is_active = true));
grant all on public.call_recordings to anon;

-- 2) Políticas de SELECT heredadas (roles={public}, sin is_active, sin subselect).
drop policy if exists ai_usage_logs_select on public.ai_usage_logs;
create policy "Members can view AI usage logs of their organization" on public.ai_usage_logs
  for select
  using (organization_id in (
    select organization_members.organization_id
      from public.organization_members
     where organization_members.user_id = auth.uid()));

drop policy if exists comm_usage_logs_select on public.comm_usage_logs;
create policy comm_usage_logs_select on public.comm_usage_logs
  for select
  using (organization_id in (
    select organization_members.organization_id
      from public.organization_members
     where organization_members.user_id = auth.uid()));

-- 1) Política de INSERT heredada y grants de tabla.
create policy "Service role can insert AI usage logs" on public.ai_usage_logs
  for insert
  with check (true);

grant all on public.ai_usage_logs, public.comm_usage_logs to anon, authenticated;

commit;
