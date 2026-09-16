-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_13_rls_initplan_select_auth_uid`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 3894da4b890e8ac1157a21841326ac93). No reformatear.
-- P3 (tester F3, advisor auth_rls_initplan): reescribir auth.uid() -> (select auth.uid()) en las
-- politicas nuevas de F0 (13 en public + 8 crm_* en storage.objects). Idempotente: si ya esta
-- envuelto en un SELECT no se vuelve a envolver.
DO $$
DECLARE r record; v_qual text; v_check text; v_sql text; v_n integer := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
      FROM pg_policies
     WHERE (schemaname = 'public' AND policyname IN (
              'outbound_jobs_select','crm_events_select','provider_configs_select',
              'comm_settings_select','comm_settings_update',
              'contact_consents_select','contact_consents_insert','contact_consents_update','contact_consents_delete',
              'user_comm_preferences_select','user_comm_preferences_insert','user_comm_preferences_update','user_comm_preferences_delete'))
        OR (schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'crm\_%')
  LOOP
    v_qual  := regexp_replace(r.qual,       '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    v_check := regexp_replace(r.with_check, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    IF v_qual IS NOT DISTINCT FROM r.qual AND v_check IS NOT DISTINCT FROM r.with_check THEN
      CONTINUE; -- ya optimizada
    END IF;
    v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF r.qual IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_qual); END IF;
    IF r.with_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
    EXECUTE v_sql;
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'crm_v4_f00_13: % politicas reescritas', v_n;
END $$;