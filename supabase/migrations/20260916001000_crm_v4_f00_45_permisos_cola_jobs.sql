-- =============================================================================
-- crm_v4_f00_45_permisos_cola_jobs
-- F0-JOBS ronda 5 (decisión del orquestador ante el bloqueo del QA r3 punto 3,
-- con la autorización general del dueño del 2026-09-15: «los cargos cuentan»,
-- permisos resueltos en el servidor con `check_user_permission`, nunca por
-- nombre de rol ni por constantes cableadas).
--
-- Hasta ahora `canViewJobs`/`canRetryJobs` (jobsService.ts) dependían de
-- `STAGE_MANAGER_ROLE_IDS` (1, 2, 5) + `admin.full_access`: un cargo
-- (`job_position_permissions`) no podía ver la cola sin ser administrador
-- completo. Se crean dos códigos propios en `permissions` (módulo `crm`,
-- categoría `jobs`) y se conceden por defecto a los roles de sistema
-- Super Admin (1), Admin de organización (2) y Manager (5): exactamente la
-- misma jefatura comercial que tenía acceso antes, así que NADIE pierde acceso.
-- Los cargos pueden ahora conceder o negar cada uno con precedencia sobre el
-- rol (ya lo hace `check_user_permission`).
--
--   crm.jobs.view  — ver la cola de trabajos salientes (JobsMonitor, GET /api/crm/jobs)
--   crm.jobs.retry — reintentar un trabajo fallido (POST /api/crm/jobs/[id]/retry)
--
-- Idempotente: INSERT … ON CONFLICT (code) DO NOTHING; los grants por rol se
-- insertan solo si no existen. Sin DDL. Datos de catálogo, no de clientes.
-- Rollback: supabase/rollbacks/20260916001000_crm_v4_f00_45_permisos_cola_jobs_rollback.sql
-- =============================================================================

insert into public.permissions (code, name, description, module, category)
values
  ('crm.jobs.view',  'Ver cola de trabajos',       'Permite ver la cola de trabajos salientes del CRM (envíos, eventos, mantenimiento)', 'crm', 'jobs'),
  ('crm.jobs.retry', 'Reintentar trabajos',        'Permite reintentar un trabajo fallido de la cola del CRM',                             'crm', 'jobs')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id, allowed)
select r.id, p.id, true
  from public.permissions p
  cross join (values (1), (2), (5)) as r(id)
 where p.code in ('crm.jobs.view', 'crm.jobs.retry')
   and not exists (
     select 1 from public.role_permissions rp
      where rp.role_id = r.id and rp.permission_id = p.id
   );

-- Verificación (solo lectura, tras aplicar):
--   select p.code, array_agg(rp.role_id order by rp.role_id)
--     from public.permissions p join public.role_permissions rp on rp.permission_id = p.id
--    where p.code like 'crm.jobs.%' group by p.code;
--   -> crm.jobs.retry {1,2,5} · crm.jobs.view {1,2,5}
