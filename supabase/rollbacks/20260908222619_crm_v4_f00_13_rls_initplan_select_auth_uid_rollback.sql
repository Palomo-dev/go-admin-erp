-- ============================================================
-- ROLLBACK de 20260908222619_crm_v4_f00_13_rls_initplan_select_auth_uid
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Deshace la reescritura: vuelve a poner el literal auth.uid() en las 13 políticas
-- de public y las 8 crm_* de storage.objects (inverso exacto del regexp de la
-- migración; idempotente).
-- ============================================================

do $$
declare r record; v_qual text; v_check text; v_sql text; v_n integer := 0;
begin
  for r in
    select schemaname, tablename, policyname, cmd, qual, with_check
      from pg_policies
     where (schemaname = 'public' and policyname in (
              'outbound_jobs_select','crm_events_select','provider_configs_select',
              'comm_settings_select','comm_settings_update',
              'contact_consents_select','contact_consents_insert','contact_consents_update','contact_consents_delete',
              'user_comm_preferences_select','user_comm_preferences_insert','user_comm_preferences_update','user_comm_preferences_delete'))
        or (schemaname = 'storage' and tablename = 'objects' and policyname like 'crm\_%')
  loop
    v_qual  := regexp_replace(r.qual,       '\(\s*select\s+auth\.uid\(\)\s*\)', 'auth.uid()', 'gi');
    v_check := regexp_replace(r.with_check, '\(\s*select\s+auth\.uid\(\)\s*\)', 'auth.uid()', 'gi');
    if v_qual is not distinct from r.qual and v_check is not distinct from r.with_check then
      continue;
    end if;
    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null then v_sql := v_sql || format(' using (%s)', v_qual); end if;
    if r.with_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute v_sql;
    v_n := v_n + 1;
  end loop;
  raise notice 'rollback crm_v4_f00_13: % politicas revertidas', v_n;
end $$;
