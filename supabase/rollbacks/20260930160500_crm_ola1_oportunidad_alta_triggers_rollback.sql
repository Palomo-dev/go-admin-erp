-- Rollback de 20260930160500_crm_ola1_oportunidad_alta_triggers.sql
--
-- Quita los dos triggers de alta. DATOS: las filas de historial iniciales
-- (from_stage_id IS NULL) y los ciclos de vida ya subidos se conservan; si hay
-- que quitar el historial inicial:
--   delete from opportunity_stage_history where from_stage_id is null;

drop trigger if exists trg_opp_stage_history_insert on public.opportunities;
drop function if exists public.fn_log_stage_initial();
drop trigger if exists trg_sync_customer_lifecycle_on_insert on public.opportunities;
drop function if exists public.fn_sync_customer_lifecycle_on_insert();
