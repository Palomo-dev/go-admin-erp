-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_08_realtime_publication`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 38cb420d5e267584b36f60edae6f91b7). No reformatear.
-- M8: realtime para tablas del CRM (conversations y messages ya estaban). Todas tienen RLS.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['calls','activities','call_transcripts','call_analyses','email_messages','opportunity_stage_history','outbound_jobs'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;