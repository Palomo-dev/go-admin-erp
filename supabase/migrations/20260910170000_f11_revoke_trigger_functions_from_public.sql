-- F-11: REVOKE EXECUTE de funciones trigger SECURITY DEFINER a PUBLIC
--
-- 326 funciones SECURITY DEFINER estaban expuestas a anon via /rest/v1/rpc/.
-- 103 son funciones de trigger que nadie llama como RPC (verificado con grep).
--
-- El grant por defecto de Postgres es a PUBLIC (=X). REVOKE FROM anon no funciona
-- porque el privilegio viene de PUBLIC. Solucion: REVOKE FROM PUBLIC.
--
-- Los triggers siguen funcionando porque se ejecutan como el propietario (postgres).
-- service_role y postgres conservan acceso explicito.
--
-- Resultado: 326 -> 223 funciones expuestas a anon (-103).
-- Las 223 restantes son no-trigger y necesitan analisis individual (Fase 2).

DO $$
DECLARE
  r RECORD;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid = p.oid)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'F-11: % funciones trigger revocadas a PUBLIC', v_count;
END $$;
