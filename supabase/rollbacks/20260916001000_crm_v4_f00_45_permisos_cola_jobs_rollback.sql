-- Rollback de crm_v4_f00_45_permisos_cola_jobs.
-- Retira los dos códigos de permiso de la cola; `role_permissions` y
-- `job_position_permissions` caen en cascada (FK ON DELETE CASCADE).
-- Tras revertir, jobsService.ts vuelve a depender solo de admin.full_access y
-- de STAGE_MANAGER_ROLE_IDS (comportamiento de la ronda 4).
delete from public.permissions where code in ('crm.jobs.view', 'crm.jobs.retry');
