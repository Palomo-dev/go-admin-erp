-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_16_fn_release_job_crm_events_diag`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 d854e11f4f27fc2668b7d259ce2fc30d). No reformatear.
-- P8 (JOBS "Necesito de DB" c + pendiente fn_release_job): liberar un job reclamado sin consumir intento.
CREATE OR REPLACE FUNCTION public.fn_release_job(p_job_id uuid, p_worker text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  UPDATE public.outbound_jobs
     SET status = 'queued',
         attempts = GREATEST(attempts - 1, 0),
         locked_at = NULL,
         locked_by = NULL,
         run_at = now()
   WHERE id = p_job_id AND status = 'running' AND locked_by = p_worker
   RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_release_job(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_release_job(uuid, text) TO service_role;

-- Diagnostico del outbox en BD (hoy el error solo queda en outbound_jobs.last_error).
ALTER TABLE public.crm_events ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.crm_events ADD COLUMN IF NOT EXISTS last_error text;