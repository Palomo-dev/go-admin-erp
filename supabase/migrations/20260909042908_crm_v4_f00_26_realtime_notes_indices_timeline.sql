-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_26_realtime_notes_indices_timeline`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 4e7c7110ae81c2d110845800085a2646). No reformatear.
-- P17 (F9): `notes` en la publicación supabase_realtime.
-- useTimeline.ts:140-147 se suscribe a activities, calls, email_messages, tasks,
-- notes, messages y opportunity_stage_history. Verificado: las 6 primeras ya
-- estaban publicadas; solo faltaba `notes` (RLS activa, 4 políticas).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
  END IF;
END $$;

-- P18 (F9 §2): índices del camino de acceso del timeline. Ordena siempre por
-- (occurred_at|created_at DESC, id DESC) filtrando por (organization_id,
-- related_*_type, related_*_id) — ver src/lib/services/crm/timeline/sources.ts.
-- `activities` ya tiene activities_org_related_occurred_idx (F0 r1) y `calls`
-- idx_calls_org_opp / idx_calls_org_customer, pero tasks, notes y email_messages
-- no tenían NINGÚN índice sobre sus columnas de relación con la org.
-- Tablas hoy casi vacías (tasks 0, notes 0, email_messages 0), así que la
-- creación es instantánea y sin riesgo.

CREATE INDEX IF NOT EXISTS tasks_org_related_created_idx
  ON public.tasks (organization_id, related_to_type, related_to_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS notes_org_related_created_idx
  ON public.notes (organization_id, related_type, related_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS email_messages_org_related_created_idx
  ON public.email_messages (organization_id, related_id, created_at DESC, id DESC);
