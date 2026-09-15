-- ============================================================
-- ROLLBACK de 20260909185302_crm_v4_f06_09_privilege_snapshot_incluye_indices
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Restaura fn_f6_privilege_snapshot a la versión de f06_07 (sin la clave 'indexes').
-- ============================================================

begin;

create or replace function public.fn_f6_privilege_snapshot()
returns jsonb language sql stable security invoker set search_path to 'public', 'pg_catalog' as $$
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
       WHERE n.nspname = 'public' AND p.proname IN ('fn_stop_voice_campaign', 'fn_log_consent_opt_out')
    ), '{}'::jsonb),
    'tables', COALESCE((
      SELECT jsonb_object_agg(c.relname, jsonb_build_object('rls', c.relrowsecurity, 'acl', COALESCE(c.relacl::text, 'DEFAULT')))
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname IN ('voice_agent_call_attempts', 'voice_agent_tool_runs', 'voice_agents', 'voice_agent_calls', 'voice_agent_campaigns', 'stage_agents', 'voices')
    ), '{}'::jsonb),
    'policies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('table', pol.tablename, 'cmd', pol.cmd, 'name', pol.policyname)
                       ORDER BY pol.tablename, pol.cmd, pol.policyname)
        FROM pg_policies pol
       WHERE pol.schemaname = 'public' AND pol.tablename IN ('voice_agent_call_attempts', 'voice_agent_tool_runs', 'voices', 'stage_agents', 'voice_agents', 'voice_agent_calls', 'voice_agent_campaigns')
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.fn_f6_privilege_snapshot() from public, anon, authenticated;
grant execute on function public.fn_f6_privilege_snapshot() to service_role;
commit;
