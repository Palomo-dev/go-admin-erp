-- ============================================================
-- ROLLBACK de 20260915223000_crm_v4_f00_40_cerrar_rpc_crm_anon
-- ============================================================
-- Devuelve EXECUTE a PUBLIC, anon y authenticated (estado anterior medido con
-- pg_proc.proacl el 2026-09-15) y restaura las definiciones de
-- fn_reporte_crm_funnel y fn_reporte_crm_ranking_vendedores tal como las
-- devolvía pg_get_functiondef antes de la migración (sin guarda).
-- NO recomendado: reabre la lectura entre organizaciones vía anon key.
-- No hay datos que revertir.
-- ============================================================

-- ---------- GRUPO A (24 firmas) ----------
-- Estado anterior: {=X/postgres, anon=X, authenticated=X, service_role=X}
-- salvo fn_expire_ai_agent_actions, que no tenía `=X` (PUBLIC).

begin;
set local lock_timeout = '3s';
grant execute on function public.auto_close_inactive_conversations() to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_agent_ensure_operational_goal(integer) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_agent_upsert_task(integer, text, text, text, integer[], text, text[], text[], numeric) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_campaign_mark_bounced(uuid, uuid) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_campaign_mark_clicked(uuid, uuid) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_campaign_mark_opened(uuid, uuid) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_campaign_mark_replied(uuid, uuid) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_campaign_mark_sent(uuid, uuid) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_consume_ai_credits_on_message() to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_daily_task_agent() to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_expire_ai_agent_actions() to anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_get_campaign_metrics(uuid) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_get_conversation_for_summary(uuid) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_reschedule_overdue_tasks() to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_reset_monthly_ai_credits() to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_save_conversation_summary(uuid, text, text[], text) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.get_ai_tokens_usage(integer) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.get_conversation_stats(integer, timestamp with time zone, timestamp with time zone) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.mark_conversation_messages_as_read(uuid, bigint) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.refresh_mv_crm_forecast_safely() to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_agent_pick_assignee(integer, text[], text[], integer[]) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_agent_pick_member(integer, integer[]) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.fn_apply_conversation_tag(uuid, text, text) to public, anon, authenticated;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.manual_refresh_forecast() to public, anon, authenticated;
commit;

-- ---------- GRUPO B (6 firmas) ----------

begin;
set local lock_timeout = '3s';
grant execute on function public.direct_update_opportunity_bypass(uuid, uuid, text) to public, anon;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.direct_update_opportunity_stage(uuid, uuid) to public, anon;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.update_opportunity_stage(uuid, uuid, integer) to public, anon;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.update_opportunity_stage_safe(uuid, uuid, integer) to public, anon;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.update_opportunity_stage_safe(uuid, uuid, text) to public, anon;
commit;

begin;
set local lock_timeout = '3s';
grant execute on function public.update_opportunity_stage_without_refresh(uuid, uuid) to public, anon;
commit;

-- ---------- GRUPO C: definiciones anteriores (pg_get_functiondef 2026-09-15) ----------

begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_crm_funnel(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_por_etapa jsonb;
  v_total_pipeline numeric;
  v_forecast numeric;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'etapa_id', e.stage_id,
    'etapa_nombre', e.name,
    'cantidad', e.cantidad,
    'monto_total', e.monto,
    'probabilidad', e.probability
  )), '[]'::jsonb) INTO v_por_etapa
  FROM (
    SELECT o.stage_id, s.name, s.probability, s.position,
           COUNT(*) AS cantidad,
           COALESCE(SUM(o.amount), 0) AS monto
    FROM opportunities o
    JOIN stages s ON o.stage_id = s.id
    WHERE o.organization_id = p_organization_id
      AND o.status = 'open'
      AND o.created_at >= p_from AND o.created_at <= p_to
    GROUP BY o.stage_id, s.name, s.probability, s.position
    ORDER BY s.position
  ) e;

  SELECT COALESCE(SUM(o.amount), 0) INTO v_total_pipeline
  FROM opportunities o
  WHERE o.organization_id = p_organization_id
    AND o.status = 'open'
    AND o.created_at >= p_from AND o.created_at <= p_to;

  SELECT COALESCE(SUM(o.amount * s.probability / 100.0), 0) INTO v_forecast
  FROM opportunities o
  JOIN stages s ON o.stage_id = s.id
  WHERE o.organization_id = p_organization_id
    AND o.status = 'open'
    AND o.created_at >= p_from AND o.created_at <= p_to;

  RETURN jsonb_build_object(
    'por_etapa', v_por_etapa,
    'total_pipeline', v_total_pipeline,
    'forecast', v_forecast
  );
END;
$function$;

grant execute on function public.fn_reporte_crm_funnel(bigint, timestamp with time zone, timestamp with time zone) to public, anon;

commit;

begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_crm_ranking_vendedores(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ranking jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'vendedor_id', r.salesperson_id,
    'oportunidades_abiertas', r.abiertas,
    'oportunidades_ganadas', r.ganadas,
    'monto_ganado', r.monto_ganado,
    'tasa_cierre', r.tasa
  )), '[]'::jsonb) INTO v_ranking
  FROM (
    SELECT o.salesperson_id,
           COUNT(CASE WHEN o.status = 'open' THEN 1 END) AS abiertas,
           COUNT(CASE WHEN o.status = 'won' THEN 1 END) AS ganadas,
           COALESCE(SUM(CASE WHEN o.status = 'won' THEN o.amount ELSE 0 END), 0) AS monto_ganado,
           CASE WHEN COUNT(*) > 0 THEN round(COUNT(CASE WHEN o.status = 'won' THEN 1 END)::numeric / COUNT(*) * 100, 2) ELSE 0 END AS tasa
    FROM opportunities o
    WHERE o.organization_id = p_organization_id
      AND o.created_at >= p_from AND o.created_at <= p_to
      AND o.salesperson_id IS NOT NULL
    GROUP BY o.salesperson_id
    ORDER BY monto_ganado DESC
  ) r;

  RETURN jsonb_build_object('ranking', v_ranking);
END;
$function$;

grant execute on function public.fn_reporte_crm_ranking_vendedores(bigint, timestamp with time zone, timestamp with time zone) to public, anon;

commit;
