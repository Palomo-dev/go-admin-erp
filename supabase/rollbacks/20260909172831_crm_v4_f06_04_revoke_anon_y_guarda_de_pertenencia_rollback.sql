-- ============================================================
-- ROLLBACK de 20260909172831_crm_v4_f06_04_revoke_anon_y_guarda_de_pertenencia
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Devuelve EXECUTE a anon/authenticated sobre las tres funciones y restaura
-- fn_stop_voice_campaign a la versión de f06_03 (sin guarda de pertenencia).
--
-- SOBRE LOS DATOS: no toca datos. Reabre el hallazgo CRÍTICO del tester de F6 r2 (lectura/sabotaje entre organizaciones con la clave anónima).
-- ============================================================

begin;
create or replace function public.fn_stop_voice_campaign(p_org integer, p_campaign uuid, p_reason text)
returns boolean language plpgsql volatile security definer set search_path to 'public' as $function$
BEGIN
  UPDATE public.voice_agent_campaigns
     SET emergency_stop = true, status = 'paused', stopped_reason = p_reason, stopped_at = now(), updated_at = now()
   WHERE id = p_campaign AND organization_id = p_org;
  RETURN FOUND;
END $function$;
grant execute on function public.fn_stop_voice_campaign(integer, uuid, text) to anon;
grant execute on function public.fn_log_consent_opt_out(integer, uuid, text, text, jsonb) to anon;
grant execute on function public.fn_claim_voice_agent_calls(integer, uuid, integer, text) to anon, authenticated;
commit;
