-- CRM ola 1 · M9 — cierre de las funciones heredadas de cambio de etapa.
-- Ver supabase/migrations/20260930160200_crm_ola1_revocar_etapa_heredadas.sql (cabecera completa).
-- Sin DROP: solo se retira EXECUTE. Rollback: supabase/rollbacks/20260930160200_crm_ola1_revocar_etapa_heredadas_rollback.sql

revoke execute on function public.direct_update_opportunity_bypass(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.direct_update_opportunity_stage(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.update_opportunity_stage(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.update_opportunity_stage_safe(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.update_opportunity_stage_safe(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.update_opportunity_stage_without_refresh(uuid, uuid) from public, anon, authenticated;

comment on function public.direct_update_opportunity_bypass(uuid, uuid, text) is
  'OBSOLETA (CRM ola 1, M9): sin EXECUTE para authenticated. Usar PATCH /api/crm/opportunities/[id]/stage.';
comment on function public.direct_update_opportunity_stage(uuid, uuid) is
  'OBSOLETA (CRM ola 1, M9): sin EXECUTE para authenticated. Usar PATCH /api/crm/opportunities/[id]/stage.';
comment on function public.update_opportunity_stage(uuid, uuid, integer) is
  'OBSOLETA (CRM ola 1, M9): sin EXECUTE para authenticated. Usar PATCH /api/crm/opportunities/[id]/stage.';
comment on function public.update_opportunity_stage_safe(uuid, uuid, integer) is
  'OBSOLETA (CRM ola 1, M9): sin EXECUTE para authenticated. Usar PATCH /api/crm/opportunities/[id]/stage.';
comment on function public.update_opportunity_stage_safe(uuid, uuid, text) is
  'OBSOLETA (CRM ola 1, M9): sin EXECUTE para authenticated. Usar PATCH /api/crm/opportunities/[id]/stage.';
comment on function public.update_opportunity_stage_without_refresh(uuid, uuid) is
  'OBSOLETA (CRM ola 1, M9): sin EXECUTE para authenticated. Usar PATCH /api/crm/opportunities/[id]/stage.';
