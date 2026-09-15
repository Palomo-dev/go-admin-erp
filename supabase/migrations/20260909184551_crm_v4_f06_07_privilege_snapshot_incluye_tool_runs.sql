-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f06_07_privilege_snapshot_incluye_tool_runs`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 42a16f87549338f6cd9dac3818b07391). No reformatear.
-- La foto de privilegios debe cubrir TAMBIÉN el gemelo cerrado en
-- `crm_v4_f06_06_tool_runs_audit_inmutable`, o la suite no protegería la
-- auditoría del agente. Mismas condiciones: SECURITY INVOKER, solo service_role.

CREATE OR REPLACE FUNCTION public.fn_f6_privilege_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT jsonb_build_object(
    'functions', COALESCE((
      SELECT jsonb_object_agg(p.proname, COALESCE(p.proacl::text, 'DEFAULT'))
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('fn_claim_voice_agent_calls', 'fn_claim_voice_agent_call_one',
                           'fn_stop_voice_campaign', 'fn_log_consent_opt_out', 'fn_can_contact')
    ), '{}'::jsonb),
    'function_guards', COALESCE((
      SELECT jsonb_object_agg(p.proname, jsonb_build_object(
               'security_definer', p.prosecdef,
               'checks_membership', pg_get_functiondef(p.oid) ILIKE '%organization_members%',
               'raises_42501', pg_get_functiondef(p.oid) ILIKE '%42501%'))
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('fn_stop_voice_campaign', 'fn_log_consent_opt_out')
    ), '{}'::jsonb),
    'tables', COALESCE((
      SELECT jsonb_object_agg(c.relname, jsonb_build_object(
               'rls', c.relrowsecurity,
               'acl', COALESCE(c.relacl::text, 'DEFAULT')))
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname IN ('voice_agent_call_attempts', 'voice_agent_tool_runs', 'voice_agents',
                           'voice_agent_calls', 'voice_agent_campaigns', 'stage_agents', 'voices')
    ), '{}'::jsonb),
    'policies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('table', pol.tablename, 'cmd', pol.cmd, 'name', pol.policyname)
                       ORDER BY pol.tablename, pol.cmd, pol.policyname)
        FROM pg_policies pol
       WHERE pol.schemaname = 'public'
         AND pol.tablename IN ('voice_agent_call_attempts', 'voice_agent_tool_runs', 'voices',
                               'stage_agents', 'voice_agents', 'voice_agent_calls', 'voice_agent_campaigns')
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_f6_privilege_snapshot() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_f6_privilege_snapshot() TO service_role;