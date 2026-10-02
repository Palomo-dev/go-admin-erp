-- Reversión conservadora: restaura los datos de negocio solo si evento e historial
-- siguen exactamente como quedaron tras la reparación. updated_at registra la
-- reversión mediante el trigger habitual; no se desactiva ningún trigger.
-- Conserva snapshots privados y nunca elimina una actividad editada después.
-- Si evento o actividad cambiaron, rechaza toda la reversión con SQLSTATE 40001.
DO $rollback$
DECLARE
  v_key constant text := 'calendar_history_v1';
  v_repair record;
  v_event public.calendar_events;
  v_before public.calendar_events;
  v_activity public.activities;
BEGIN
  IF to_regclass('public.crm_meeting_history_repairs') IS NULL THEN RETURN; END IF;
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM pg_advisory_xact_lock(hashtextextended('crm:calendar_history_v1',0));
  LOCK TABLE public.calendar_events,public.activities IN SHARE ROW EXCLUSIVE MODE;
  FOR v_repair IN
    SELECT * FROM public.crm_meeting_history_repairs
    WHERE repair_key=v_key AND reverted_at IS NULL ORDER BY organization_id,event_id FOR UPDATE
  LOOP
    IF v_repair.action='skipped' THEN CONTINUE; END IF;
    SELECT * INTO v_event FROM public.calendar_events
      WHERE id=v_repair.event_id AND organization_id=v_repair.organization_id FOR UPDATE;
    IF NOT FOUND OR to_jsonb(v_event) IS DISTINCT FROM v_repair.event_after THEN
      RAISE EXCEPTION 'evento_cambiado_tras_reparacion' USING ERRCODE='40001';
    END IF;
    SELECT * INTO v_activity FROM public.activities
      WHERE id=v_repair.activity_id AND organization_id=v_repair.organization_id FOR UPDATE;
    IF NOT FOUND OR to_jsonb(v_activity) IS DISTINCT FROM v_repair.activity_after THEN
      RAISE EXCEPTION 'historial_cambiado_tras_reparacion' USING ERRCODE='40001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.activities a
      WHERE lower(a.metadata->>'event_id')=v_repair.event_id::text AND a.id<>v_repair.activity_id
    ) THEN
      RAISE EXCEPTION 'historial_nuevo_tras_reparacion' USING ERRCODE='40001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.calendar_events e
      WHERE e.id<>v_repair.event_id AND lower(e.metadata->>'activity_id')=v_repair.activity_id::text
    ) THEN
      RAISE EXCEPTION 'enlace_nuevo_tras_reparacion' USING ERRCODE='40001';
    END IF;
  END LOOP;

  FOR v_repair IN
    SELECT * FROM public.crm_meeting_history_repairs
    WHERE repair_key=v_key AND reverted_at IS NULL AND action<>'skipped'
    ORDER BY organization_id,event_id
  LOOP
    v_before:=jsonb_populate_record(NULL::public.calendar_events,v_repair.event_before);
    UPDATE public.calendar_events SET metadata=v_before.metadata
      WHERE id=v_repair.event_id AND organization_id=v_repair.organization_id;
    IF v_repair.action='created' THEN
      DELETE FROM public.activities
        WHERE id=v_repair.activity_id AND organization_id=v_repair.organization_id;
    END IF;
  END LOOP;
  UPDATE public.crm_meeting_history_repairs SET reverted_at=now()
    WHERE repair_key=v_key AND reverted_at IS NULL;
END;
$rollback$;
