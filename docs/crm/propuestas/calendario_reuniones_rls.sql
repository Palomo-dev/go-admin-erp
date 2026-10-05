-- ACTIVACIÓN PROPUESTA, NO APLICADA. Requiere expansión instalada y despliegue
-- de los escritores canónicos de calendario/CRM antes de ejecutar esta etapa.
-- No activar sobre el frontend antiguo que todavía escribe reuniones por SDK.
-- Conserva todas las policies permisivas originales y la lectura de las tablas.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '10s';

DROP POLICY IF EXISTS crm_calendar_events_no_direct_insert ON public.calendar_events;
CREATE POLICY crm_calendar_events_no_direct_insert
ON public.calendar_events AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (NOT public.fn_crm_calendar_event_managed(organization_id, id, metadata));

DROP POLICY IF EXISTS crm_calendar_events_no_direct_update ON public.calendar_events;
CREATE POLICY crm_calendar_events_no_direct_update
ON public.calendar_events AS RESTRICTIVE FOR UPDATE TO authenticated
USING (NOT public.fn_crm_calendar_event_managed(organization_id, id, metadata))
WITH CHECK (NOT public.fn_crm_calendar_event_managed(organization_id, id, metadata));

DROP POLICY IF EXISTS crm_calendar_events_no_direct_delete ON public.calendar_events;
CREATE POLICY crm_calendar_events_no_direct_delete
ON public.calendar_events AS RESTRICTIVE FOR DELETE TO authenticated
USING (NOT public.fn_crm_calendar_event_managed(organization_id, id, metadata));

DROP POLICY IF EXISTS crm_calendar_activities_no_direct_insert ON public.activities;
CREATE POLICY crm_calendar_activities_no_direct_insert
ON public.activities AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (NOT public.fn_crm_calendar_activity_managed(organization_id, id, metadata));

DROP POLICY IF EXISTS crm_calendar_activities_no_direct_update ON public.activities;
CREATE POLICY crm_calendar_activities_no_direct_update
ON public.activities AS RESTRICTIVE FOR UPDATE TO authenticated
USING (NOT public.fn_crm_calendar_activity_managed(organization_id, id, metadata))
WITH CHECK (NOT public.fn_crm_calendar_activity_managed(organization_id, id, metadata));

DROP POLICY IF EXISTS crm_calendar_activities_no_direct_delete ON public.activities;
CREATE POLICY crm_calendar_activities_no_direct_delete
ON public.activities AS RESTRICTIVE FOR DELETE TO authenticated
USING (NOT public.fn_crm_calendar_activity_managed(organization_id, id, metadata));

DROP POLICY IF EXISTS crm_calendar_exceptions_no_direct_insert ON public.calendar_exceptions;
CREATE POLICY crm_calendar_exceptions_no_direct_insert
ON public.calendar_exceptions AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.fn_crm_calendar_exception_manual(calendar_event_id));

DROP POLICY IF EXISTS crm_calendar_exceptions_no_direct_update ON public.calendar_exceptions;
CREATE POLICY crm_calendar_exceptions_no_direct_update
ON public.calendar_exceptions AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.fn_crm_calendar_exception_manual(calendar_event_id))
WITH CHECK (public.fn_crm_calendar_exception_manual(calendar_event_id));

DROP POLICY IF EXISTS crm_calendar_exceptions_no_direct_delete ON public.calendar_exceptions;
CREATE POLICY crm_calendar_exceptions_no_direct_delete
ON public.calendar_exceptions AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.fn_crm_calendar_exception_manual(calendar_event_id));
