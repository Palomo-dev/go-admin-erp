-- Reversión de 20261104031500_revocar_funciones_peligrosas_anon.sql.
-- Devuelve exactamente los EXECUTE leídos el 2026-11-04 antes de aplicarla.
-- OJO: reabre funciones críticas a la clave pública. Solo si la migración rompió algo.

grant execute on function
  public.set_config(text, text),
  public.set_org_context(bigint),
  public.set_session_org_id(integer),
  public.execute_alert_condition(text, integer),
  public.test_alert_condition(text, integer),
  public.reset_user_password(uuid, text),
  public.fn_reintentar_fallos_asiento()
to public, anon, authenticated;

grant execute on function
  public.direct_update_opportunity(uuid, uuid, text),
  public.update_stage_bypass(uuid, uuid, text),
  public.update_stage_bypass_triggers(uuid, text, text, text, numeric),
  public.fix_update_opportunity_stage(uuid, uuid, text),
  public.fn_pause_sequences_on_reply(integer, uuid, uuid, text)
to anon, authenticated;
