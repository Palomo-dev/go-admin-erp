-- ============================================================
-- ROLLBACK de 20260908215612_crm_v4_f00_08_realtime_publication
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Saca de la publicación realtime las 7 tablas que M8 añadió (conversations y messages ya estaban y no se tocan).
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['calls','activities','call_transcripts','call_analyses','email_messages','opportunity_stage_history','outbound_jobs'] loop
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;
