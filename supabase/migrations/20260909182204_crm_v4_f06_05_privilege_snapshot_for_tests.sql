-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f06_05_privilege_snapshot_for_tests`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 8a694b913e9e61bf1943793a9588db08). No reformatear.
-- FASE 06 · ronda 3 · R3-4
-- La suite de la fase no podía comprobar NADA sobre privilegios: una migración
-- futura que volviera a conceder `anon` (el fallo crítico de la ronda 2) habría
-- salido verde. Esta función expone una FOTO de solo lectura del estado real de
-- privilegios de los objetos de F6 para que la suite la contraste.
--
-- Seguridad:
--   · SECURITY INVOKER (NO definer): no eleva privilegios de nadie. Solo lee
--     catálogo (pg_proc, pg_class, pg_policies), que ya es legible por cualquier
--     rol; no devuelve ni un dato de ningún inquilino.
--   · Aun así se REVOCA de public/anon/authenticated y solo se concede a
--     service_role, para no ampliar la superficie de la API pública.
--   · Al no ser SECURITY DEFINER no hay `p_org` en el que confiar, así que no
--     procede guarda de pertenencia: no hay nada org-scoped que proteger.

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
         AND c.relname IN ('voice_agent_call_attempts', 'voice_agents', 'voice_agent_calls',
                           'voice_agent_campaigns', 'stage_agents', 'voices')
    ), '{}'::jsonb),
    'policies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('table', pol.tablename, 'cmd', pol.cmd, 'name', pol.policyname)
                       ORDER BY pol.tablename, pol.cmd, pol.policyname)
        FROM pg_policies pol
       WHERE pol.schemaname = 'public'
         AND pol.tablename IN ('voice_agent_call_attempts', 'voices', 'stage_agents')
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.fn_f6_privilege_snapshot() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_f6_privilege_snapshot() TO service_role;

COMMENT ON FUNCTION public.fn_f6_privilege_snapshot() IS
  'F6/R3-4: foto de solo lectura de privilegios de los objetos de FASE 06, para que la suite detecte una regresión de GRANT. SECURITY INVOKER, solo service_role.';