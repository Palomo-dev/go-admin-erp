-- Reparación conservadora del historial legado de reuniones CRM.
-- Solo acredita el estado ya guardado en calendario: programada o cancelada.
-- Un creador ausente se conserva como autor desconocido; nunca se suplanta.
-- Los snapshots quedan cerrados a todas las API, incluso service_role.
CREATE TABLE IF NOT EXISTS public.crm_meeting_history_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_key text NOT NULL,
  organization_id integer NOT NULL,
  event_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created','linked','skipped')),
  skip_reason text,
  event_before jsonb NOT NULL,
  event_after jsonb,
  activity_id uuid,
  activity_after jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz,
  CHECK (
    (action='skipped' AND skip_reason IS NOT NULL AND event_after IS NULL
      AND activity_id IS NULL AND activity_after IS NULL)
    OR (action IN ('created','linked') AND skip_reason IS NULL AND event_after IS NOT NULL
      AND activity_id IS NOT NULL AND activity_after IS NOT NULL)
  )
);
ALTER TABLE public.crm_meeting_history_repairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_meeting_history_repairs FROM PUBLIC,anon,authenticated,service_role;
CREATE UNIQUE INDEX IF NOT EXISTS crm_meeting_history_repairs_active_event
  ON public.crm_meeting_history_repairs (repair_key,event_id) WHERE reverted_at IS NULL;
COMMENT ON TABLE public.crm_meeting_history_repairs IS
  'Evidencia privada del historial legado; RLS sin políticas y sin grants de API por diseño.';

DO $repair$
DECLARE
  v_key constant text := 'calendar_history_v1';
  v_event public.calendar_events;
  v_before jsonb;
  v_activity public.activities;
  v_match public.activities;
  v_count integer;
  v_reason text;
  v_action text;
  v_related_type text;
  v_related_id uuid;
  v_outcome text;
  v_customer uuid;
BEGIN
  -- Impide dos aplicaciones simultáneas del mismo backfill.
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM pg_advisory_xact_lock(hashtextextended('crm:calendar_history_v1',0));
  LOCK TABLE public.calendar_events,public.activities IN SHARE ROW EXCLUSIVE MODE;
  FOR v_event IN
    SELECT e.* FROM public.calendar_events e
    WHERE e.event_type='meeting' AND e.metadata->>'source'='crm'
      AND NOT EXISTS (
        SELECT 1 FROM public.crm_meeting_history_repairs r
        WHERE r.repair_key=v_key AND r.event_id=e.id AND r.reverted_at IS NULL
      )
      AND (
        nullif(e.metadata->>'activity_id','') IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.activities a
          WHERE a.id::text=e.metadata->>'activity_id'
            AND a.organization_id=e.organization_id AND a.activity_type='meeting'
            AND a.metadata->>'event_id'=e.id::text
            AND a.related_type=CASE WHEN e.opportunity_id IS NULL THEN 'customer' ELSE 'opportunity' END
            AND a.related_id=coalesce(e.opportunity_id,e.customer_id)
        )
      )
    ORDER BY e.organization_id,e.id FOR UPDATE OF e
  LOOP
    v_before:=to_jsonb(v_event);
    v_reason:=NULL;
    v_action:=NULL;
    v_activity:=NULL;
    v_customer:=NULL;
    v_related_type:=CASE WHEN v_event.opportunity_id IS NULL THEN 'customer' ELSE 'opportunity' END;
    v_related_id:=coalesce(v_event.opportunity_id,v_event.customer_id);
    v_outcome:=CASE WHEN v_event.status='cancelled' THEN 'canceled' ELSE 'scheduled' END;

    IF jsonb_typeof(v_event.metadata) IS DISTINCT FROM 'object'
      OR nullif(v_event.metadata->>'activity_id','') IS NOT NULL THEN
      v_reason:='enlace_preexistente_incoherente';
    ELSIF v_event.status NOT IN ('confirmed','cancelled') OR v_event.status IS NULL
      OR nullif(v_event.metadata->>'completed_at','') IS NOT NULL
      OR v_event.recurrence_rule IS NOT NULL OR v_event.all_day THEN
      v_reason:='estado_no_acreditable';
    ELSIF v_event.start_at IS NULL OR v_event.end_at IS NULL
      OR NOT isfinite(v_event.start_at) OR NOT isfinite(v_event.end_at)
      OR v_event.end_at<=v_event.start_at OR nullif(btrim(v_event.title),'') IS NULL THEN
      v_reason:='evento_invalido';
    ELSIF v_related_id IS NULL THEN
      v_reason:='entidad_ausente';
    END IF;

    IF v_reason IS NULL AND v_event.created_by IS NOT NULL THEN
      PERFORM 1 FROM public.organization_members
      WHERE organization_id=v_event.organization_id AND user_id=v_event.created_by FOR SHARE;
      -- La autoría histórica puede corresponder a un miembro hoy inactivo.
      IF NOT FOUND THEN v_reason:='autor_ajeno'; END IF;
    END IF;
    IF v_reason IS NULL AND v_event.opportunity_id IS NOT NULL THEN
      SELECT o.customer_id INTO v_customer FROM public.opportunities o
      WHERE o.id=v_event.opportunity_id AND o.organization_id=v_event.organization_id FOR SHARE;
      IF NOT FOUND OR v_customer IS DISTINCT FROM v_event.customer_id THEN
        v_reason:='oportunidad_o_cliente_incoherente';
      END IF;
    END IF;
    IF v_reason IS NULL AND v_event.customer_id IS NOT NULL THEN
      PERFORM 1 FROM public.customers c
      WHERE c.id=v_event.customer_id AND c.organization_id=v_event.organization_id FOR SHARE;
      IF NOT FOUND THEN v_reason:='cliente_ajeno'; END IF;
    END IF;

    IF v_reason IS NULL AND (
      (v_event.metadata ? 'customer_id' AND v_event.metadata->>'customer_id' IS DISTINCT FROM v_event.customer_id::text)
      OR (v_event.metadata ? 'opportunity_id' AND v_event.metadata->>'opportunity_id' IS DISTINCT FROM v_event.opportunity_id::text)
    ) THEN v_reason:='referencias_metadata_incoherentes'; END IF;
    IF v_reason IS NULL AND v_event.branch_id IS NOT NULL THEN
      PERFORM 1 FROM public.branches b
      WHERE b.id=v_event.branch_id AND b.organization_id=v_event.organization_id FOR SHARE;
      IF NOT FOUND THEN v_reason:='sucursal_ajena'; END IF;
    END IF;

    IF v_reason IS NULL THEN
      v_count:=0;
      -- También detecta referencias manipuladas desde otra organización.
      FOR v_match IN
        SELECT a.* FROM public.activities a
        WHERE lower(a.metadata->>'event_id')=v_event.id::text ORDER BY a.id FOR UPDATE OF a
      LOOP
        v_count:=v_count+1;
        v_activity:=v_match;
      END LOOP;
      IF v_count>1 THEN
        v_reason:='historial_ambiguo';
      ELSIF v_count=1 THEN
        IF EXISTS (
          SELECT 1 FROM public.calendar_events e
          WHERE e.id<>v_event.id AND lower(e.metadata->>'activity_id')=v_activity.id::text
        ) THEN
          v_reason:='historial_enlazado_a_otro_evento';
        ELSIF v_activity.metadata->>'event_id' IS DISTINCT FROM v_event.id::text
          OR v_activity.organization_id IS DISTINCT FROM v_event.organization_id
          OR v_activity.activity_type IS DISTINCT FROM 'meeting'
          OR v_activity.related_type IS DISTINCT FROM v_related_type
          OR v_activity.related_id IS DISTINCT FROM v_related_id
          OR v_activity.user_id IS DISTINCT FROM v_event.created_by
          OR v_activity.occurred_at IS DISTINCT FROM v_event.start_at
          OR v_activity.outcome IS DISTINCT FROM v_outcome THEN
          v_reason:='historial_preexistente_incoherente';
        ELSE
          v_action:='linked';
        END IF;
      ELSE
        INSERT INTO public.activities (
          organization_id,user_id,activity_type,related_type,related_id,
          notes,channel,outcome,occurred_at,branch_id,metadata
        ) VALUES (
          v_event.organization_id,v_event.created_by,'meeting',v_related_type,v_related_id,
          concat_ws(E'\n',v_event.title,nullif(v_event.location,''),nullif(v_event.description,'')),
          'meeting',v_outcome,v_event.start_at,v_event.branch_id,
          jsonb_build_object(
            'event_id',v_event.id,'end_at',v_event.end_at,'location',v_event.location,
            'source','calendar_history_repair','repair_key',v_key,
            'author_unknown',v_event.created_by IS NULL
          )
        ) RETURNING * INTO v_activity;
        v_action:='created';
      END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      INSERT INTO public.crm_meeting_history_repairs (
        repair_key,organization_id,event_id,action,skip_reason,event_before
      ) VALUES (v_key,v_event.organization_id,v_event.id,'skipped',v_reason,v_before);
      CONTINUE;
    END IF;
    UPDATE public.calendar_events
      SET metadata=metadata||jsonb_build_object('activity_id',v_activity.id)
      WHERE id=v_event.id AND organization_id=v_event.organization_id
      RETURNING * INTO v_event;
    INSERT INTO public.crm_meeting_history_repairs (
      repair_key,organization_id,event_id,action,event_before,event_after,activity_id,activity_after
    ) VALUES (
      v_key,v_event.organization_id,v_event.id,v_action,v_before,to_jsonb(v_event),
      v_activity.id,to_jsonb(v_activity)
    );
  END LOOP;
END;
$repair$;
