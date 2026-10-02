-- Desactiva únicamente las restricciones nuevas; conserva políticas y datos previos.
-- Es repetible y no revierte llamadas, recibos, tareas ni historial.
DROP POLICY IF EXISTS crm_calls_lectura_autoria ON public.calls;
DROP POLICY IF EXISTS crm_calls_insert_solo_servidor ON public.calls;
DROP POLICY IF EXISTS crm_calls_update_solo_servidor ON public.calls;
DROP POLICY IF EXISTS crm_calls_delete_solo_servidor ON public.calls;
DROP POLICY IF EXISTS crm_activities_call_insert_solo_rpc ON public.activities;
DROP POLICY IF EXISTS crm_activities_call_update_solo_rpc ON public.activities;
DROP POLICY IF EXISTS crm_activities_call_delete_solo_rpc ON public.activities;
