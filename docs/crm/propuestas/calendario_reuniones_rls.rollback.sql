-- REVERSIÓN DE ACTIVACIÓN PROPUESTA: retira solo las nueve policies añadidas.
-- La expansión, el núcleo transaccional y las policies originales se conservan.
-- No modifica filas ni altera ACL de funciones.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '10s';

DROP POLICY IF EXISTS crm_calendar_exceptions_no_direct_delete ON public.calendar_exceptions;
DROP POLICY IF EXISTS crm_calendar_exceptions_no_direct_update ON public.calendar_exceptions;
DROP POLICY IF EXISTS crm_calendar_exceptions_no_direct_insert ON public.calendar_exceptions;
DROP POLICY IF EXISTS crm_calendar_activities_no_direct_delete ON public.activities;
DROP POLICY IF EXISTS crm_calendar_activities_no_direct_update ON public.activities;
DROP POLICY IF EXISTS crm_calendar_activities_no_direct_insert ON public.activities;
DROP POLICY IF EXISTS crm_calendar_events_no_direct_delete ON public.calendar_events;
DROP POLICY IF EXISTS crm_calendar_events_no_direct_update ON public.calendar_events;
DROP POLICY IF EXISTS crm_calendar_events_no_direct_insert ON public.calendar_events;
