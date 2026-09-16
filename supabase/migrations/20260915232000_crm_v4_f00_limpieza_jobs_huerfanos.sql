-- =============================================================================
-- crm_v4_f00_limpieza_jobs_huerfanos
-- F0-DB ronda 3 (QA r2, problema 6). Migración de DATOS, no de esquema.
--
-- 6 jobs `crm_event` en `failed` (terminal) de la org 125, creados el
-- 2026-09-10 00:18–00:19 UTC, con last_error 'JobFatalError: event_not_found:…'
-- y cuyo `payload->>'event_id'` ya no existe en crm_events (alguien borró los
-- eventos de prueba de F0-JOBS sin borrar sus jobs). `failed` no se reintenta
-- ni caduca sola hasta la retención de 30 d de `maintenance` (2026-10-10), y
-- mientras tanto `v_outbound_jobs_failed` los muestra como fallos vivos.
--
-- Ids medidos el 2026-09-15 (select … where kind='crm_event' and status='failed'):
--   b933ec21-b090-4d3f-a9c9-b4783abd1908  event 3af1e91e-5b8a-49b0-b8b7-84ab2c75df1e
--   b42d8efc-34ef-479f-91c6-43ae4fca7535  event 6bd567a9-7175-46b1-b3aa-cf00400e051f
--   84830477-4e9f-4cf3-b5a1-de1a0bf26489  event fdf3aee9-6890-42f6-9380-b1f77b6c7cc1
--   e0e49e03-1097-4e3b-943e-4fc62ba78c17  event 1e76c33e-1514-4496-8484-18286a57764a
--   9cd62de1-fbe6-4216-a13d-4479d93ab967  event b0edbb37-4b2b-4424-a640-9e140e9020d2
--   3d2e3511-f529-4099-bdd7-9e791b779bbb  event 94e79c6b-8fff-47a7-9a04-6a385c8a0b14
--
-- El DELETE no lista ids: borra por condición (kind + status + last_error +
-- evento inexistente) para que sea idempotente y no dependa de que nadie haya
-- creado otro huérfano igual entre la medición y la aplicación. Esperado: 6.
-- Retención permanente: `runMaintenance` (src/lib/jobs/handlers/maintenance.ts)
-- borra `failed|dead` con updated_at > 30 d; cubierto por handlers.test.ts.
-- Rollback: supabase/rollbacks/20260915232000_crm_v4_f00_limpieza_jobs_huerfanos_rollback.sql
-- (NO restaura datos).
-- =============================================================================

begin;

delete from public.outbound_jobs j
 where j.kind = 'crm_event'
   and j.status = 'failed'
   and j.last_error like 'JobFatalError: event_not_found%'
   and not exists (
     select 1 from public.crm_events e
      where e.id = nullif(j.payload->>'event_id', '')::uuid
   );

commit;

-- Verificación (solo lectura, tras aplicar):
--   select count(*) from public.v_outbound_jobs_failed;                       -> 0
--   select count(*) from public.outbound_jobs where kind='crm_event' and status='failed'; -> 0
