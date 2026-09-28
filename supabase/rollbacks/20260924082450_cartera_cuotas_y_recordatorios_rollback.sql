-- Rollback de 20260924082450_cartera_cuotas_y_recordatorios.sql
-- ADVERTENCIA: borra el historial de recordatorios (ar_reminders). Las cuotas
-- creadas con fn_cxc_crear_plan_cuotas se quedan (son filas de ar_installments).
drop function if exists public.fn_cxc_registrar_recordatorio(uuid, text, text, text, text, uuid, text, text);
drop function if exists public.fn_cxc_eliminar_plan_cuotas(uuid);
drop function if exists public.fn_cxc_crear_plan_cuotas(uuid, jsonb);
drop table if exists public.ar_reminders;
