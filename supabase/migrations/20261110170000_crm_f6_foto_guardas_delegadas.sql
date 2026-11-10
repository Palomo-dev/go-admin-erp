-- ESCRITA, NO APLICADA (2026-11-10). Aplicar solo por el MCP de Supabase (apply_migration)
-- con el nombre `crm_f6_foto_guardas_delegadas`. Reversión: supabase/rollbacks/20261110170000_crm_f6_foto_guardas_delegadas_rollback.sql
--
-- Qué arregla: un FALSO POSITIVO de la red de seguridad de F6 (suite
-- src/lib/services/crm/__tests__/f6Adversarial.test.ts, bloque L), no un agujero.
--
-- `fn_f6_privilege_snapshot` decide si una función que escribe "comprueba la
-- pertenencia" buscando el TEXTO `organization_members` y `42501` en su cuerpo.
-- Desde 20261001002200 (crm_campanas_parada_con_permiso) y 20261001151437
-- (crm_campanas_voz_guardado_y_archivo_atomicos), `fn_stop_voice_campaign` ya no
-- consulta la tabla a mano: delega en las guardas de la casa, antes de escribir:
--   perform public.crm_lock_comm_wallet(p_org);           -> fn_assert_acceso_org(p_org)
--   perform public.fn_crm_exigir_permiso(p_org, array[…]); -> fn_assert_acceso_org(p_org) + permiso
-- La guarda es más fuerte que la original (pertenencia + permiso crm.campaigns.manage),
-- pero el texto ya no contiene `organization_members` y la foto la declara "sin guarda".
-- Prueba en seco del 2026-11-10 contra producción: un autenticado NO miembro recibe
-- 42501 «Acceso denegado a la organización»; el miembro y service_role la ejecutan.
--
-- Cambio (solo lectura de catálogo, SECURITY INVOKER, solo service_role):
--   · `function_guards.<fn>` conserva sus tres campos con el MISMO cálculo (compatibilidad)
--     y añade:
--       delegated_guards  guardas de la casa a las que llama con el MISMO `p_org`
--       guard_pos         posición (en el cuerpo) de la primera guarda, directa o delegada; 0 = ninguna
--       write_pos         posición de la primera escritura (insert/update/delete); 0 = no escribe
--   · clave nueva `guards`: el mismo análisis para las guardas de la casa
--     (fn_assert_acceso_org, fn_crm_exigir_permiso, crm_lock_comm_wallet), para que la
--     suite verifique que la guarda delegada comprueba de verdad la pertenencia y lanza
--     42501, en vez de creérselo por el nombre.
-- Los campos nuevos se calculan sobre `prosrc` (solo el cuerpo): con
-- `pg_get_functiondef` la cabecera `public.fn_assert_acceso_org(p_org integer)` se
-- contaría como una llamada a sí misma.
--
-- No toca datos ni privilegios de negocio. Idempotente (CREATE OR REPLACE + REVOKE/GRANT).

CREATE OR REPLACE FUNCTION public.fn_f6_privilege_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_catalog'
AS $$
  WITH guardas(nombre) AS (
    VALUES ('fn_assert_acceso_org'), ('fn_crm_exigir_permiso'), ('crm_lock_comm_wallet')
  ),
  defs AS (
    SELECT p.proname, p.prosecdef, pg_get_functiondef(p.oid) AS def, p.prosrc AS cuerpo
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('fn_stop_voice_campaign', 'fn_log_consent_opt_out',
                         'fn_assert_acceso_org', 'fn_crm_exigir_permiso', 'crm_lock_comm_wallet')
  ),
  analisis AS (
    SELECT d.proname, jsonb_build_object(
             'security_definer', d.prosecdef,
             'checks_membership', d.def ILIKE '%organization_members%',
             'raises_42501', d.def ILIKE '%42501%',
             'delegated_guards', COALESCE((
               SELECT jsonb_agg(g.nombre ORDER BY g.nombre)
                 FROM guardas g
                WHERE g.nombre <> d.proname
                  AND d.cuerpo ~* ('\m(public\.)?' || g.nombre || '\s*\(\s*p_org\M')
             ), '[]'::jsonb),
             'guard_pos', COALESCE(LEAST(
               NULLIF(regexp_instr(d.cuerpo, 'organization_members', 1, 1, 0, 'i'), 0),
               NULLIF(regexp_instr(d.cuerpo,
                 '\m(public\.)?(fn_assert_acceso_org|fn_crm_exigir_permiso|crm_lock_comm_wallet)\s*\(\s*p_org\M',
                 1, 1, 0, 'i'), 0)
             ), 0),
             'write_pos', regexp_instr(d.cuerpo,
               '\m(insert\s+into|update\s+[a-z_.]+\s+set|delete\s+from)\M', 1, 1, 0, 'i')
           ) AS info
      FROM defs d
  )
  SELECT jsonb_build_object(
    'functions', COALESCE((
      SELECT jsonb_object_agg(p.proname, COALESCE(p.proacl::text, 'DEFAULT'))
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('fn_claim_voice_agent_calls', 'fn_claim_voice_agent_call_one',
                           'fn_stop_voice_campaign', 'fn_log_consent_opt_out', 'fn_can_contact')
    ), '{}'::jsonb),
    'function_guards', COALESCE((
      SELECT jsonb_object_agg(a.proname, a.info)
        FROM analisis a
       WHERE a.proname IN ('fn_stop_voice_campaign', 'fn_log_consent_opt_out')
    ), '{}'::jsonb),
    'guards', COALESCE((
      SELECT jsonb_object_agg(a.proname, a.info)
        FROM analisis a
       WHERE a.proname IN (SELECT nombre FROM guardas)
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
