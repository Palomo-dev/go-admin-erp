-- ============================================================
-- F0-SEC-B · cerrar las RPC SECURITY DEFINER del CRM a `anon`
-- (crm_v4 · F00 · paso 40)
-- ============================================================
-- PROBLEMA (veredicto F0-SEC-qa-r1, problemas 2 y 3): 31 funciones SECURITY
-- DEFINER del dominio CRM/IA/mensajería nacieron con el privilegio por defecto
-- del esquema (`=X` a PUBLIC) y por tanto son ejecutables con la clave
-- publicable del navegador, sin sesión, vía POST /rest/v1/rpc/<nombre>.
-- Dos de ellas (`fn_reporte_crm_funnel`, `fn_reporte_crm_ranking_vendedores`)
-- reciben la organización por parámetro y no comprobaban pertenencia: lectura
-- del embudo y del ranking de cualquier organización con la anon key.
--
-- MÉTODO (memoria «Exposición de RPC a anon»): las dos mitades juntas —
-- guarda de pertenencia en forma de afirmación positiva incondicional (con
-- `anon` auth.uid() es NULL y el EXISTS falla cerrado) + REVOKE de PUBLIC/anon.
-- Un bloque por función, cada uno con `set local lock_timeout = '3s'`, para
-- no encadenar bloqueos en una transacción única.
--
-- EVIDENCIA (verificada con el MCP el 2026-09-15, solo lectura):
--   · pg_proc: las 31 firmas existen, prosecdef = true, owner = postgres.
--   · ACL actual de todas: {=X, postgres=X, anon=X, authenticated=X,
--     service_role=X} (fn_expire_ai_agent_actions sin `=X` pero con anon y
--     authenticated explícitos).
--   · Llamadores (rg sobre go-admin-erp/src, supabase/functions, electron,
--     print-agent, goadmin-websites, go-admin-sellers, go-admin-super):
--       - fn_reporte_crm_funnel / fn_reporte_crm_ranking_vendedores:
--         navegador con sesión (crmReports.ts, commercialMetricsService.ts).
--       - fn_campaign_mark_{sent,opened,clicked,bounced,replied}: service
--         role (campaignBatch.ts, campaignEvents.ts, email/webhookService.ts).
--       - resto: ningún llamador en ningún repositorio.
--   · cron.job: fn_daily_task_agent, fn_reschedule_overdue_tasks,
--     fn_reset_monthly_ai_credits y fn_expire_ai_agent_actions corren como
--     `postgres` (owner): el REVOKE no los afecta.
--   · Cadenas internas (fn_daily_task_agent → fn_agent_upsert_task →
--     fn_agent_ensure_operational_goal / fn_agent_pick_assignee →
--     fn_agent_pick_member; trigger trg_auto_tag_conversation →
--     fn_auto_tag_conversation → fn_apply_conversation_tag): todas las
--     funciones que llaman son SECURITY DEFINER de `postgres`, así que la
--     llamada interna se resuelve con los privilegios del owner.
--
-- DESVIACIONES respecto a la lista del veredicto (con evidencia):
--   · fn_apply_conversation_tag, fn_agent_pick_assignee y fn_agent_pick_member
--     estaban en el grupo «conservar authenticated (tienen guarda)». No tienen
--     guarda (pg_get_functiondef: ni auth.uid() como condición ni
--     comprobación de organization_members del llamante) y no tienen ningún
--     llamador con sesión. Un usuario autenticado de la organización A podía
--     etiquetar conversaciones de B, o averiguar el user_id de un miembro de B.
--     Pasan al grupo «solo service_role».
--   · manual_refresh_forecast() no estaba en la lista: es el gemelo exacto de
--     refresh_mv_crm_forecast_safely() (mismo cuerpo, REFRESH MATERIALIZED
--     VIEW mv_crm_forecast sin CONCURRENTLY → ACCESS EXCLUSIVE sobre la vista
--     a demanda de anon). Sin llamadores. Recibe el mismo tratamiento.
--
-- RESULTADO ESPERADO: 216 → 184 funciones SECURITY DEFINER ejecutables por
-- anon en `public` (32 firmas cerradas). Consulta de verificación al final.
--
-- Idempotente: REVOKE/GRANT/CREATE OR REPLACE se pueden reaplicar.
-- Sin datos: el rollback restaura privilegios y definiciones íntegramente.
-- ============================================================


-- ------------------------------------------------------------
-- GRUPO A · solo service_role (y postgres/pg_cron): sin llamador de sesión
-- y sin guarda de pertenencia. 24 firmas.
-- ------------------------------------------------------------

begin;
set local lock_timeout = '3s';
revoke execute on function public.auto_close_inactive_conversations() from public, anon, authenticated;
grant  execute on function public.auto_close_inactive_conversations() to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_agent_ensure_operational_goal(integer) from public, anon, authenticated;
grant  execute on function public.fn_agent_ensure_operational_goal(integer) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_agent_upsert_task(integer, text, text, text, integer[], text, text[], text[], numeric) from public, anon, authenticated;
grant  execute on function public.fn_agent_upsert_task(integer, text, text, text, integer[], text, text[], text[], numeric) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_campaign_mark_bounced(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.fn_campaign_mark_bounced(uuid, uuid) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_campaign_mark_clicked(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.fn_campaign_mark_clicked(uuid, uuid) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_campaign_mark_opened(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.fn_campaign_mark_opened(uuid, uuid) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_campaign_mark_replied(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.fn_campaign_mark_replied(uuid, uuid) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_campaign_mark_sent(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.fn_campaign_mark_sent(uuid, uuid) to service_role;
commit;

-- Función de trigger (returns trigger) que hoy no está enganchada a ningún
-- trigger; aun así se cierra: si se engancha, correrá como owner.
begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_consume_ai_credits_on_message() from public, anon, authenticated;
grant  execute on function public.fn_consume_ai_credits_on_message() to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_daily_task_agent() from public, anon, authenticated;
grant  execute on function public.fn_daily_task_agent() to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_expire_ai_agent_actions() from public, anon, authenticated;
grant  execute on function public.fn_expire_ai_agent_actions() to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_get_campaign_metrics(uuid) from public, anon, authenticated;
grant  execute on function public.fn_get_campaign_metrics(uuid) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_get_conversation_for_summary(uuid) from public, anon, authenticated;
grant  execute on function public.fn_get_conversation_for_summary(uuid) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_reschedule_overdue_tasks() from public, anon, authenticated;
grant  execute on function public.fn_reschedule_overdue_tasks() to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_reset_monthly_ai_credits() from public, anon, authenticated;
grant  execute on function public.fn_reset_monthly_ai_credits() to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_save_conversation_summary(uuid, text, text[], text) from public, anon, authenticated;
grant  execute on function public.fn_save_conversation_summary(uuid, text, text[], text) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.get_ai_tokens_usage(integer) from public, anon, authenticated;
grant  execute on function public.get_ai_tokens_usage(integer) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.get_conversation_stats(integer, timestamp with time zone, timestamp with time zone) from public, anon, authenticated;
grant  execute on function public.get_conversation_stats(integer, timestamp with time zone, timestamp with time zone) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.mark_conversation_messages_as_read(uuid, bigint) from public, anon, authenticated;
grant  execute on function public.mark_conversation_messages_as_read(uuid, bigint) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.refresh_mv_crm_forecast_safely() from public, anon, authenticated;
grant  execute on function public.refresh_mv_crm_forecast_safely() to service_role;
commit;

-- Desviación 1: sin guarda y sin llamador (ver cabecera).
begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_agent_pick_assignee(integer, text[], text[], integer[]) from public, anon, authenticated;
grant  execute on function public.fn_agent_pick_assignee(integer, text[], text[], integer[]) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_agent_pick_member(integer, integer[]) from public, anon, authenticated;
grant  execute on function public.fn_agent_pick_member(integer, integer[]) to service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.fn_apply_conversation_tag(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.fn_apply_conversation_tag(uuid, text, text) to service_role;
commit;

-- Desviación 2: gemelo de refresh_mv_crm_forecast_safely (ver cabecera).
begin;
set local lock_timeout = '3s';
revoke execute on function public.manual_refresh_forecast() from public, anon, authenticated;
grant  execute on function public.manual_refresh_forecast() to service_role;
commit;


-- ------------------------------------------------------------
-- GRUPO B · se conserva authenticated: tienen guarda de pertenencia
-- (auth.uid() NULL → RETURN FALSE) o son las dos fn_reporte_* que reciben
-- guarda en el grupo C. Solo se retira PUBLIC y anon. 6 firmas aquí + 2 en C.
-- Las 6 de etapa de oportunidad no tienen llamador en ningún repositorio:
-- candidatas a DROP en una fase posterior, fuera del alcance de esta.
-- ------------------------------------------------------------

begin;
set local lock_timeout = '3s';
revoke execute on function public.direct_update_opportunity_bypass(uuid, uuid, text) from public, anon;
grant  execute on function public.direct_update_opportunity_bypass(uuid, uuid, text) to authenticated, service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.direct_update_opportunity_stage(uuid, uuid) from public, anon;
grant  execute on function public.direct_update_opportunity_stage(uuid, uuid) to authenticated, service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.update_opportunity_stage(uuid, uuid, integer) from public, anon;
grant  execute on function public.update_opportunity_stage(uuid, uuid, integer) to authenticated, service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.update_opportunity_stage_safe(uuid, uuid, integer) from public, anon;
grant  execute on function public.update_opportunity_stage_safe(uuid, uuid, integer) to authenticated, service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.update_opportunity_stage_safe(uuid, uuid, text) from public, anon;
grant  execute on function public.update_opportunity_stage_safe(uuid, uuid, text) to authenticated, service_role;
commit;

begin;
set local lock_timeout = '3s';
revoke execute on function public.update_opportunity_stage_without_refresh(uuid, uuid) from public, anon;
grant  execute on function public.update_opportunity_stage_without_refresh(uuid, uuid) to authenticated, service_role;
commit;


-- ------------------------------------------------------------
-- GRUPO C · fn_reporte_crm_funnel y fn_reporte_crm_ranking_vendedores:
-- guarda de pertenencia + search_path fijo + revoke de anon.
-- Los cuerpos son los de producción (pg_get_functiondef, 2026-09-15); solo se
-- añade la guarda al inicio. Llamadores: navegador con sesión de usuario
-- (crmReports.ts, commercialMetricsService.ts), que pasan la organización
-- activa; un usuario de otra organización recibe 42501 y el servicio lo
-- propaga como error (commercialMetricsService tiene fallback en memoria).
-- No hay llamador con service_role: con service_role auth.uid() es NULL y la
-- guarda también rechaza; si algún día hace falta, se resuelve en el route
-- handler con getServerOrgContext(), no relajando la guarda.
-- ------------------------------------------------------------

begin;
set local lock_timeout = '3s';

create or replace function public.fn_reporte_crm_funnel(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_por_etapa jsonb;
  v_total_pipeline numeric;
  v_forecast numeric;
BEGIN
  -- Guarda de pertenencia (afirmación positiva incondicional: con anon o
  -- service_role auth.uid() es NULL y el EXISTS falla cerrado).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

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
$$;

revoke execute on function public.fn_reporte_crm_funnel(bigint, timestamp with time zone, timestamp with time zone) from public, anon;
grant  execute on function public.fn_reporte_crm_funnel(bigint, timestamp with time zone, timestamp with time zone) to authenticated, service_role;

commit;

begin;
set local lock_timeout = '3s';

create or replace function public.fn_reporte_crm_ranking_vendedores(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_ranking jsonb;
BEGIN
  -- Guarda de pertenencia (ver fn_reporte_crm_funnel).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

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
$$;

revoke execute on function public.fn_reporte_crm_ranking_vendedores(bigint, timestamp with time zone, timestamp with time zone) from public, anon;
grant  execute on function public.fn_reporte_crm_ranking_vendedores(bigint, timestamp with time zone, timestamp with time zone) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- VERIFICACIÓN (solo lectura; correr tras aplicar). Esperado: 0 filas.
-- ------------------------------------------------------------
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.prosecdef
--   and p.proname in (
--     'auto_close_inactive_conversations','fn_agent_ensure_operational_goal',
--     'fn_agent_upsert_task','fn_campaign_mark_bounced','fn_campaign_mark_clicked',
--     'fn_campaign_mark_opened','fn_campaign_mark_replied','fn_campaign_mark_sent',
--     'fn_consume_ai_credits_on_message','fn_daily_task_agent',
--     'fn_expire_ai_agent_actions','fn_get_campaign_metrics',
--     'fn_get_conversation_for_summary','fn_reschedule_overdue_tasks',
--     'fn_reset_monthly_ai_credits','fn_save_conversation_summary',
--     'get_ai_tokens_usage','get_conversation_stats',
--     'mark_conversation_messages_as_read','refresh_mv_crm_forecast_safely',
--     'manual_refresh_forecast','fn_agent_pick_assignee','fn_agent_pick_member',
--     'fn_apply_conversation_tag',
--     'direct_update_opportunity_bypass','direct_update_opportunity_stage',
--     'update_opportunity_stage','update_opportunity_stage_safe',
--     'update_opportunity_stage_without_refresh',
--     'fn_reporte_crm_funnel','fn_reporte_crm_ranking_vendedores')
--   and (
--     has_function_privilege('anon', p.oid, 'EXECUTE')
--     or (has_function_privilege('authenticated', p.oid, 'EXECUTE')
--         and p.proname not in (
--           'direct_update_opportunity_bypass','direct_update_opportunity_stage',
--           'update_opportunity_stage','update_opportunity_stage_safe',
--           'update_opportunity_stage_without_refresh',
--           'fn_reporte_crm_funnel','fn_reporte_crm_ranking_vendedores'))
--   );
--
-- Y la guarda de las dos fn_reporte_* (esperado: true, true):
-- select p.proname, pg_get_functiondef(p.oid) like '%ORG_FORBIDDEN%' as con_guarda
-- from pg_proc p where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('fn_reporte_crm_funnel','fn_reporte_crm_ranking_vendedores');
