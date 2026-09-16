-- ============================================================
-- ROLLBACK de 20260909173358_crm_v4_f06_04_attempt_ledger_and_dispatch_guardrails
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Elimina fn_claim_voice_agent_call_one, restaura fn_claim_voice_agent_calls a
-- la versión de f06_03 (sin libro de intentos), quita topes y columnas de
-- conciliación y elimina la tabla voice_agent_call_attempts. f06_05 y f06_07/09
-- (snapshot) van antes.
--
-- SOBRE LOS DATOS: destruye el libro de intentos (voice_agent_call_attempts) y la conciliación de créditos por llamada. OJO: el tope diario/horario vuelve a contarse por claimed_at (F-NEW-2).
-- ============================================================

begin;
drop function if exists public.fn_claim_voice_agent_call_one(integer, uuid, text);

create or replace function public.fn_claim_voice_agent_calls(p_org integer, p_campaign uuid, p_limit integer, p_worker text)
returns setof public.voice_agent_calls language plpgsql volatile security definer set search_path to 'public' as $function$
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN RETURN; END IF;
  RETURN QUERY
  WITH candidatos AS (
    SELECT vac.id FROM public.voice_agent_calls vac
     WHERE vac.organization_id = p_org AND vac.campaign_id = p_campaign
       AND vac.status IN ('pending','queued')
       AND (vac.scheduled_at IS NULL OR vac.scheduled_at <= now())
     ORDER BY vac.scheduled_at NULLS FIRST, vac.created_at
     LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE public.voice_agent_calls v
     SET status = 'in_progress', claimed_at = now(), locked_by = p_worker, attempts = v.attempts + 1, updated_at = now()
    FROM candidatos c WHERE v.id = c.id
  RETURNING v.*;
END $function$;
revoke all on function public.fn_claim_voice_agent_calls(integer, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.fn_claim_voice_agent_calls(integer, uuid, integer, text) to service_role;

alter table public.voice_agents drop constraint if exists voice_agents_max_calls_per_hour_check;
alter table public.voice_agents drop constraint if exists voice_agents_max_calls_per_day_check;
alter table public.voice_agents drop column if exists max_calls_per_hour, drop column if exists max_calls_per_day;
alter table public.voice_agent_calls drop column if exists credits_settled_at, drop column if exists credits_reserved;

drop table if exists public.voice_agent_call_attempts cascade;
commit;
