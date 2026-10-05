-- Corrige solo fechas futuras respaldadas por una reunión aún programada.
-- Conserva antes/después para un rollback condicionado a que no haya contactos
-- posteriores. El respaldo queda cerrado: RLS y sin grants ni policies de API.
CREATE TABLE IF NOT EXISTS public.crm_contact_time_repairs (
  organization_id integer NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('customer','opportunity')),
  entity_id uuid NOT NULL,
  previous_at timestamptz NOT NULL,
  repaired_at timestamptz,
  previous_channel text,
  repaired_channel text,
  previous_result text,
  repaired_result text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,entity_type,entity_id),
  CHECK (repaired_at IS NULL OR (isfinite(repaired_at) AND repaired_at<=recorded_at))
);
ALTER TABLE public.crm_contact_time_repairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_contact_time_repairs FROM PUBLIC,anon,authenticated,service_role;

DO $$
DECLARE
  v_target record;
  v_source record;
  v_at timestamptz;
  v_latest timestamptz;
  v_channel text;
  v_result text;
BEGIN
  -- Orden de bloqueo del trigger de contactos: oportunidad antes que cliente.
  PERFORM 1 FROM public.opportunities WHERE last_contact_at>now()
    ORDER BY organization_id,id FOR UPDATE;
  PERFORM 1 FROM public.customers WHERE last_contact_at>now()
    ORDER BY organization_id,id FOR UPDATE;
  FOR v_target IN
    SELECT 'opportunity'::text AS kind,o.organization_id,o.id,o.customer_id,
      o.last_contact_at,o.contact_channel,o.contact_result
    FROM public.opportunities o
    WHERE o.last_contact_at>now() AND EXISTS (
      SELECT 1 FROM public.activities a WHERE a.organization_id=o.organization_id
        AND a.related_type='opportunity' AND a.related_id=o.id
        AND a.activity_type='meeting' AND a.outcome='scheduled'
        AND a.occurred_at=o.last_contact_at)
      AND NOT EXISTS (SELECT 1 FROM public.crm_contact_time_repairs r
        WHERE r.organization_id=o.organization_id AND r.entity_type='opportunity' AND r.entity_id=o.id)
    UNION ALL
    SELECT 'customer',c.organization_id,c.id,c.id,c.last_contact_at,NULL::text,NULL::text
    FROM public.customers c
    WHERE c.last_contact_at>now() AND EXISTS (
      SELECT 1 FROM public.activities a
      LEFT JOIN public.opportunities o ON a.related_type='opportunity'
        AND o.id=a.related_id AND o.organization_id=a.organization_id
      WHERE a.organization_id=c.organization_id AND a.activity_type='meeting'
        AND a.outcome='scheduled' AND a.occurred_at=c.last_contact_at
        AND ((a.related_type='customer' AND a.related_id=c.id) OR o.customer_id=c.id))
      AND NOT EXISTS (SELECT 1 FROM public.crm_contact_time_repairs r
        WHERE r.organization_id=c.organization_id AND r.entity_type='customer' AND r.entity_id=c.id)
  LOOP
    v_latest:=NULL; v_channel:=NULL; v_result:=NULL;
    FOR v_source IN
      SELECT a.id,'activity'::text AS source,a.activity_type,
        coalesce(a.occurred_at,a.created_at) AS at,
        CASE WHEN a.activity_type='meeting' THEN a.metadata->>'completed_at' END AS completed_at,
        coalesce(a.channel,a.activity_type) AS channel,a.outcome AS result
      FROM public.activities a
      LEFT JOIN public.opportunities o ON a.related_type='opportunity'
        AND o.id=a.related_id AND o.organization_id=a.organization_id
      WHERE a.organization_id=v_target.organization_id
        AND a.activity_type IN ('call','email','whatsapp','sms','meeting','visit','ai_call')
        AND (a.activity_type<>'meeting' OR a.outcome='done')
        AND ((v_target.kind='opportunity' AND a.related_type='opportunity' AND a.related_id=v_target.id)
          OR (v_target.kind='customer' AND ((a.related_type='customer' AND a.related_id=v_target.id)
            OR o.customer_id=v_target.id)))
      UNION ALL
      SELECT c.id,'call','call',coalesce(c.ended_at,c.answered_at,c.started_at),NULL,
        CASE c.mode WHEN 'ai_agent' THEN 'voice_ai' WHEN 'bridge' THEN 'mobile' ELSE 'phone' END,'answered'
      FROM public.calls c
      LEFT JOIN public.opportunities o ON o.id=c.opportunity_id AND o.organization_id=c.organization_id
      WHERE c.organization_id=v_target.organization_id AND c.status='completed'
        AND c.answered_by IS DISTINCT FROM 'machine'
        AND ((v_target.kind='opportunity' AND c.opportunity_id=v_target.id)
          OR (v_target.kind='customer' AND (c.customer_id=v_target.id OR o.customer_id=v_target.id)))
      ORDER BY source,id
    LOOP
      v_at:=v_source.at;
      IF nullif(v_source.completed_at,'') IS NOT NULL THEN
        BEGIN v_at:=v_source.completed_at::timestamptz;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
          v_at:=v_source.at;
        END;
      END IF;
      IF v_at IS NOT NULL AND isfinite(v_at) AND v_at<=now()
        AND (v_latest IS NULL OR v_latest<v_at) THEN
        v_latest:=v_at; v_channel:=v_source.channel; v_result:=v_source.result;
      END IF;
    END LOOP;
    INSERT INTO public.crm_contact_time_repairs
      (organization_id,entity_type,entity_id,previous_at,repaired_at,
       previous_channel,repaired_channel,previous_result,repaired_result)
    VALUES (v_target.organization_id,v_target.kind,v_target.id,v_target.last_contact_at,v_latest,
      v_target.contact_channel,v_channel,v_target.contact_result,v_result);
    IF v_target.kind='opportunity' THEN
      UPDATE public.opportunities SET last_contact_at=v_latest,
        contact_channel=v_channel,contact_result=v_result
        WHERE id=v_target.id AND organization_id=v_target.organization_id
          AND last_contact_at=v_target.last_contact_at;
    ELSE
      UPDATE public.customers SET last_contact_at=v_latest
        WHERE id=v_target.id AND organization_id=v_target.organization_id
          AND last_contact_at=v_target.last_contact_at;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'contacto_cambio_durante_reparacion' USING ERRCODE='40001'; END IF;
  END LOOP;
END;
$$;
