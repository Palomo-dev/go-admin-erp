-- Rollback de 20260930160200_crm_ola1_revocar_etapa_heredadas.sql
--
-- Devuelve EXECUTE a `authenticated`, como estaba (ACL previa:
-- postgres, authenticated, service_role; sin PUBLIC ni anon). Reabre el agujero
-- que la migración cerraba: úsese solo si aparece un llamador legítimo.
--
-- Contexto de la migración (su cabecera aplicada es corta):
-- Seis funciones SECURITY DEFINER, ejecutables por `authenticated`, que
-- escribían `opportunities.stage_id` (y a veces `status`) saltándose el gate de
-- etapa, los datos de cierre, el bloqueo optimista y los permisos: cualquier
-- miembro podía mover (o cerrar) cualquier oportunidad de su organización, y
-- dos de ellas ni siquiera exigían membresía activa.
--
-- Verificado antes de cerrar (2026-09-30):
--   · código: `grep` en src/, scripts/, supabase/functions/ y en el repo
--     hermano goadmin-websites → 0 llamadores;
--   · base: ninguna otra función las nombra (pg_get_functiondef) y ningún
--     cron.job las invoca.
-- La vía canónica es PATCH /api/crm/opportunities/[id]/stage (y /win, /lose),
-- que pasa por opportunityStageService.changeStage con permisos de servidor.
--
-- No se borran (sin DROP): solo se retira EXECUTE. service_role conserva el
-- permiso por si algún proceso interno olvidado aparece en los registros.
-- `update_stage_without_triggers` NO se revoca: la usa PATCH /api/crm/stages/[id]
-- y desde 20260930160100 exige crm.stages.manage.
--


grant execute on function public.direct_update_opportunity_bypass(uuid, uuid, text) to authenticated;
grant execute on function public.direct_update_opportunity_stage(uuid, uuid) to authenticated;
grant execute on function public.update_opportunity_stage(uuid, uuid, integer) to authenticated;
grant execute on function public.update_opportunity_stage_safe(uuid, uuid, integer) to authenticated;
grant execute on function public.update_opportunity_stage_safe(uuid, uuid, text) to authenticated;
grant execute on function public.update_opportunity_stage_without_refresh(uuid, uuid) to authenticated;

comment on function public.direct_update_opportunity_bypass(uuid, uuid, text) is null;
comment on function public.direct_update_opportunity_stage(uuid, uuid) is null;
comment on function public.update_opportunity_stage(uuid, uuid, integer) is null;
comment on function public.update_opportunity_stage_safe(uuid, uuid, integer) is null;
comment on function public.update_opportunity_stage_safe(uuid, uuid, text) is null;
comment on function public.update_opportunity_stage_without_refresh(uuid, uuid) is null;
