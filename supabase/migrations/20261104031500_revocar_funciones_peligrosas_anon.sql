-- Urgente: 12 funciones SECURITY DEFINER que anon (la clave pública) podía ejecutar.
-- Aplicada por MCP el 2026-11-04.
--
-- Por qué: el 2026-09-15 se les quitó EXECUTE a anon a seis de ellas a mano
-- (20260915100000_revoke_six_critical_functions.sql es solo documental) y la base
-- restaurada el 2026-11-03 lo perdió. Las otras seis no tenían EXECUTE para anon en la
-- base anterior y lo recibieron por los default privileges al restaurar.
--   · execute_alert_condition / test_alert_condition: SQL dinámico como owner.
--   · reset_user_password: cambia la contraseña de cualquier usuario.
--   · set_config / set_org_context / set_session_org_id: fijan GUCs de la conexión.
--   · direct_update_opportunity, update_stage_bypass, update_stage_bypass_triggers,
--     fix_update_opportunity_stage: UPDATE de oportunidades de cualquier organización.
--   · fn_reintentar_fallos_asiento: rehace asientos de todas las organizaciones.
--   · fn_pause_sequences_on_reply: pausa secuencias de la organización que llegue.
--
-- Llamadores verificados (go-admin-erp, goadmin-websites, go-admin-sellers, go-admin-super,
-- Edge Functions, pg_cron, funciones SQL):
--   · set_config, set_org_context, set_session_org_id: ERP con sesión → authenticated LAS CONSERVA.
--   · fn_pause_sequences_on_reply: solo el runner de jobs del ERP con service role.
--   · test_alert_condition → execute_alert_condition (SQL, ambas definer). Nada más.
--   · el resto: ningún llamador.
-- service_role y postgres conservan EXECUTE en todas.
--
-- Rollback: supabase/rollbacks/20261104031500_revocar_funciones_peligrosas_anon_rollback.sql

revoke execute on function
  public.set_config(text, text),
  public.set_org_context(bigint),
  public.set_session_org_id(integer)
from public, anon;

revoke execute on function
  public.execute_alert_condition(text, integer),
  public.test_alert_condition(text, integer),
  public.reset_user_password(uuid, text),
  public.direct_update_opportunity(uuid, uuid, text),
  public.update_stage_bypass(uuid, uuid, text),
  public.update_stage_bypass_triggers(uuid, text, text, text, numeric),
  public.fix_update_opportunity_stage(uuid, uuid, text),
  public.fn_reintentar_fallos_asiento(),
  public.fn_pause_sequences_on_reply(integer, uuid, uuid, text)
from public, anon, authenticated;

do $verificar$
declare
  v_f text;
  v_sesion text[] := array['public.set_config(text,text)', 'public.set_org_context(bigint)', 'public.set_session_org_id(integer)'];
  v_cerradas text[] := array[
    'public.execute_alert_condition(text,integer)', 'public.test_alert_condition(text,integer)',
    'public.reset_user_password(uuid,text)', 'public.direct_update_opportunity(uuid,uuid,text)',
    'public.update_stage_bypass(uuid,uuid,text)', 'public.update_stage_bypass_triggers(uuid,text,text,text,numeric)',
    'public.fix_update_opportunity_stage(uuid,uuid,text)', 'public.fn_reintentar_fallos_asiento()',
    'public.fn_pause_sequences_on_reply(integer,uuid,uuid,text)'];
begin
  foreach v_f in array v_sesion || v_cerradas loop
    if has_function_privilege('anon', v_f::regprocedure, 'execute') then
      raise exception '% sigue ejecutable por anon', v_f;
    end if;
    if not has_function_privilege('service_role', v_f::regprocedure, 'execute') then
      raise exception '% perdió service_role', v_f;
    end if;
  end loop;
  foreach v_f in array v_sesion loop
    if not has_function_privilege('authenticated', v_f::regprocedure, 'execute') then
      raise exception '% perdió authenticated (el ERP la usa con sesión)', v_f;
    end if;
  end loop;
  foreach v_f in array v_cerradas loop
    if has_function_privilege('authenticated', v_f::regprocedure, 'execute') then
      raise exception '% sigue ejecutable por authenticated', v_f;
    end if;
  end loop;
end
$verificar$;
