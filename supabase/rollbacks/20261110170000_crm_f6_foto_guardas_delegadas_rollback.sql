-- Reversión de 20261110170000_crm_f6_foto_guardas_delegadas (ESCRITA, NO APLICADA).
-- Restaura EXACTAMENTE la `fn_f6_privilege_snapshot` viva al 2026-11-10: el cuerpo es
-- byte a byte el de 20260909185302_crm_v4_f06_09_privilege_snapshot_incluye_indices
-- (md5 de pg_get_functiondef en producción: 17818c5524b8ad982be75e87f7fc907b) y el ACL
-- {postgres=X/postgres,service_role=X/postgres}. No reformatear.
-- Efecto: la foto vuelve a no informar guardas delegadas, y los casos L1-L3 de
-- f6Adversarial vuelven a marcar fn_stop_voice_campaign como "sin guarda" (falso positivo).
-- No toca datos.

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
    ), '[]'::jsonb),
    'indexes', COALESCE((
      SELECT jsonb_object_agg(i.indexname, i.indexdef)
        FROM pg_indexes i
       WHERE i.schemaname = 'public'
         AND i.indexname IN ('voice_agent_calls_una_viva_por_cliente')
    ), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_f6_privilege_snapshot() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_f6_privilege_snapshot() TO service_role;
