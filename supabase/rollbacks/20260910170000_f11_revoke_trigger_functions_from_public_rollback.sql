-- Reversion de F-11: Re-grant EXECUTE a PUBLIC en funciones trigger
--
-- Restaura el estado anterior: todas las funciones trigger SECURITY DEFINER
-- vuelven a ser ejecutables por anyone (incluido anon via /rest/v1/rpc/).
-- Esto reintroduce el riesgo de seguridad que F-11 cerro.

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
      AND EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid = p.oid)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO PUBLIC', r.proname, r.args);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'F-11 rollback: % funciones trigger re-granted a PUBLIC', v_count;
END $$;
