-- Restaura la función anterior exactamente. Los eventos/historial ya creados
-- se conservan y siguen editables por la función de sesión. Requiere retirar
-- el nuevo emisor de voz antes de revertir; no borra reuniones ni créditos.
DROP FUNCTION IF EXISTS public.fn_crm_agendar_reunion_voz(integer,uuid,jsonb);
CREATE OR REPLACE FUNCTION public.fn_crm_guardar_reunion(p_org integer, p_event_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_event public.calendar_events;
  v_activity public.activities;
  v_customer uuid;
  v_opportunity uuid;
  v_assigned uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_timezone text;
  v_key text := nullif(p_payload->>'client_key', '');
  v_fingerprint text := md5((p_payload - 'client_key')::text);
  v_outcome text;
  v_metadata jsonb;
  v_notes text;
BEGIN
  PERFORM public.fn_assert_acceso_org(p_org);
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id=p_org AND user_id=v_actor AND is_active
  ) THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_payload='{}'::jsonb
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN (
      'title','start_at','end_at','timezone','location','description','customer_id',
      'opportunity_id','assigned_to','attendees','send_invite','client_key','status'
    )) THEN RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023'; END IF;
  IF length(coalesce(p_payload->>'title',''))>200
    OR length(coalesce(p_payload->>'location',''))>500
    OR length(coalesce(p_payload->>'description',''))>5000
    OR length(coalesce(v_key,''))>120
    OR (p_payload ? 'title' AND nullif(btrim(p_payload->>'title'),'') IS NULL)
    OR (p_payload ? 'status' AND coalesce(p_payload->>'status','') NOT IN ('scheduled','done','canceled'))
    OR (p_payload ? 'send_invite' AND jsonb_typeof(p_payload->'send_invite')<>'boolean')
    THEN RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_payload) e
    WHERE e.key IN ('title','start_at','end_at','timezone','client_key','status')
      AND jsonb_typeof(e.value)<>'string')
    OR EXISTS (SELECT 1 FROM jsonb_each(p_payload) e
      WHERE e.key IN ('location','description','customer_id','opportunity_id','assigned_to')
        AND jsonb_typeof(e.value) NOT IN ('string','null'))
    OR EXISTS (SELECT 1 FROM jsonb_each_text(p_payload) e
      WHERE e.key IN ('start_at','end_at')
        AND e.value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$')
    THEN RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023'; END IF;
  IF p_payload ? 'attendees' THEN
    IF jsonb_typeof(p_payload->'attendees')<>'array' THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(p_payload->'attendees')>20 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_payload->'attendees') a
      WHERE jsonb_typeof(a)<>'string' OR length(a #>> '{}')>320
        OR (a #>> '{}') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ) THEN RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023'; END IF;
  END IF;
  v_timezone := public.fn_timezone_for(p_org,NULL);
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=v_timezone)
    OR (p_payload ? 'timezone' AND p_payload->>'timezone' IS DISTINCT FROM v_timezone)
    THEN RAISE EXCEPTION 'zona_horaria_invalida' USING ERRCODE='22023'; END IF;

  IF p_event_id IS NULL THEN
    IF p_payload ? 'status' THEN RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023'; END IF;
    v_customer := nullif(p_payload->>'customer_id','')::uuid;
    v_opportunity := nullif(p_payload->>'opportunity_id','')::uuid;
    v_assigned := coalesce(nullif(p_payload->>'assigned_to','')::uuid,v_actor);
    IF v_customer IS NULL AND v_opportunity IS NULL THEN
      RAISE EXCEPTION 'entidad_requerida' USING ERRCODE='22023';
    END IF;
    IF v_opportunity IS NOT NULL THEN
      SELECT customer_id INTO v_event.customer_id FROM public.opportunities
        WHERE id=v_opportunity AND organization_id=p_org FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'entidad_no_encontrada' USING ERRCODE='P0002'; END IF;
      IF v_customer IS NOT NULL AND v_customer IS DISTINCT FROM v_event.customer_id THEN
        RAISE EXCEPTION 'cliente_incoherente' USING ERRCODE='22023';
      END IF;
      v_customer := v_event.customer_id;
    END IF;
    IF v_customer IS NOT NULL THEN
      PERFORM 1 FROM public.customers WHERE id=v_customer AND organization_id=p_org FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'entidad_no_encontrada' USING ERRCODE='P0002'; END IF;
    END IF;
    PERFORM 1 FROM public.organization_members
      WHERE organization_id=p_org AND user_id=v_assigned AND is_active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'responsable_no_encontrado' USING ERRCODE='P0002'; END IF;
    v_start := (p_payload->>'start_at')::timestamptz;
    v_end := (p_payload->>'end_at')::timestamptz;
    IF nullif(btrim(p_payload->>'title'),'') IS NULL THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023';
    END IF;
    IF v_key IS NOT NULL THEN
      -- Serializa reintentos del mismo actor sin imponer unicidad al legado.
      PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||':'||v_actor::text||':'||v_key,0));
      SELECT * INTO v_event FROM public.calendar_events
        WHERE organization_id=p_org AND created_by=v_actor AND event_type='meeting'
          AND metadata->>'source'='crm' AND metadata->>'client_key'=v_key
        ORDER BY created_at,id LIMIT 1 FOR UPDATE;
      IF FOUND THEN
        IF v_event.metadata->>'request_fingerprint' IS DISTINCT FROM v_fingerprint THEN
          RAISE EXCEPTION 'clave_reutilizada' USING ERRCODE='23505';
        END IF;
        SELECT * INTO v_activity FROM public.activities
          WHERE organization_id=p_org AND id=(v_event.metadata->>'activity_id')::uuid
            AND activity_type='meeting' AND metadata->>'event_id'=v_event.id::text;
        IF NOT FOUND THEN RAISE EXCEPTION 'historial_incoherente' USING ERRCODE='40001'; END IF;
        RETURN jsonb_build_object('event',to_jsonb(v_event),'activity_id',v_activity.id,'reused',true);
      END IF;
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k
      WHERE k NOT IN ('title','start_at','end_at','location','description','status')) THEN
      RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_event FROM public.calendar_events
      WHERE id=p_event_id AND organization_id=p_org AND event_type='meeting' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'reunion_no_encontrada' USING ERRCODE='P0002'; END IF;
    IF v_event.created_by IS DISTINCT FROM v_actor
      AND NOT public.fn_crm_tiene_permiso(p_org,'crm.activities.edit_any') THEN
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501';
    END IF;
    v_customer := v_event.customer_id;
    v_opportunity := v_event.opportunity_id;
    IF v_opportunity IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.opportunities WHERE id=v_opportunity AND organization_id=p_org
    ) OR v_customer IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.customers WHERE id=v_customer AND organization_id=p_org
    ) THEN RAISE EXCEPTION 'entidad_no_encontrada' USING ERRCODE='P0002'; END IF;
    v_start := CASE WHEN p_payload ? 'start_at' THEN (p_payload->>'start_at')::timestamptz ELSE v_event.start_at END;
    v_end := CASE WHEN p_payload ? 'end_at' THEN (p_payload->>'end_at')::timestamptz ELSE v_event.end_at END;
    -- Un enlace manipulado nunca permite editar otra actividad de la misma org.
    SELECT * INTO v_activity FROM public.activities
      WHERE organization_id=p_org AND activity_type='meeting'
        AND metadata->>'event_id'=v_event.id::text
        AND (v_event.metadata->>'activity_id' IS NULL OR id::text=v_event.metadata->>'activity_id')
        AND related_type=CASE WHEN v_opportunity IS NULL THEN 'customer' ELSE 'opportunity' END
        AND related_id=coalesce(v_opportunity,v_customer)
      ORDER BY id LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'historial_incoherente' USING ERRCODE='40001'; END IF;
  END IF;
  IF v_start IS NULL OR v_end IS NULL OR NOT isfinite(v_start) OR NOT isfinite(v_end) OR v_end<=v_start THEN
    RAISE EXCEPTION 'rango_invalido' USING ERRCODE='22023';
  END IF;
  v_outcome := CASE WHEN p_event_id IS NULL THEN 'scheduled' ELSE coalesce(p_payload->>'status',v_activity.outcome,'scheduled') END;
  IF v_outcome='done' AND v_start>now() THEN
    RAISE EXCEPTION 'reunion_futura' USING ERRCODE='22023';
  END IF;
  IF p_event_id IS NULL THEN
    v_metadata := jsonb_build_object('source','crm','opportunity_id',v_opportunity,
      'attendees',coalesce(p_payload->'attendees','[]'::jsonb),
      'send_invite',coalesce((p_payload->>'send_invite')::boolean,false),
      'client_key',v_key,'request_fingerprint',v_fingerprint);
    INSERT INTO public.calendar_events (organization_id,title,description,location,start_at,end_at,
      all_day,timezone,assigned_to,customer_id,opportunity_id,event_type,status,created_by,metadata)
    VALUES (p_org,btrim(p_payload->>'title'),p_payload->>'description',p_payload->>'location',v_start,v_end,
      false,v_timezone,v_assigned,v_customer,v_opportunity,'meeting','confirmed',v_actor,v_metadata)
    RETURNING * INTO v_event;
  ELSE
    v_metadata := coalesce(v_event.metadata,'{}'::jsonb);
    IF p_payload ? 'status' THEN
      v_metadata := v_metadata || jsonb_build_object('completed_at',
        CASE WHEN v_outcome='done' THEN coalesce(v_metadata->>'completed_at',now()::text) ELSE NULL END);
    END IF;
    UPDATE public.calendar_events SET
      title=CASE WHEN p_payload ? 'title' THEN btrim(p_payload->>'title') ELSE title END,
      description=CASE WHEN p_payload ? 'description' THEN p_payload->>'description' ELSE description END,
      location=CASE WHEN p_payload ? 'location' THEN p_payload->>'location' ELSE location END,
      start_at=v_start,end_at=v_end,
      status=CASE WHEN v_outcome='canceled' THEN 'cancelled' ELSE 'confirmed' END,
      metadata=v_metadata WHERE id=v_event.id AND organization_id=p_org RETURNING * INTO v_event;
  END IF;
  v_notes := concat_ws(E'\n',v_event.title,nullif(v_event.location,''),nullif(v_event.description,''));
  v_metadata := coalesce(v_activity.metadata,'{}'::jsonb) || jsonb_build_object(
    'event_id',v_event.id,'end_at',v_event.end_at,'location',v_event.location,
    'completed_at',v_event.metadata->'completed_at');
  IF p_event_id IS NULL THEN
    INSERT INTO public.activities (organization_id,user_id,activity_type,related_type,related_id,
      notes,channel,outcome,occurred_at,metadata)
    VALUES (p_org,v_actor,'meeting',CASE WHEN v_opportunity IS NULL THEN 'customer' ELSE 'opportunity' END,
      coalesce(v_opportunity,v_customer),v_notes,'meeting',v_outcome,v_start,v_metadata)
    RETURNING * INTO v_activity;
  ELSE
    UPDATE public.activities SET notes=v_notes,outcome=v_outcome,occurred_at=v_start,metadata=v_metadata
      WHERE id=v_activity.id AND organization_id=p_org RETURNING * INTO v_activity;
  END IF;
  UPDATE public.calendar_events SET metadata=metadata||jsonb_build_object('activity_id',v_activity.id)
    WHERE id=v_event.id AND organization_id=p_org RETURNING * INTO v_event;
  RETURN jsonb_build_object('event',to_jsonb(v_event),'activity_id',v_activity.id,'reused',false);
END;
$function$
;
REVOKE ALL ON FUNCTION public.fn_crm_guardar_reunion(integer,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_guardar_reunion(integer,uuid,jsonb) TO authenticated;
DROP FUNCTION IF EXISTS public.fn_crm_guardar_reunion_core(integer,uuid,jsonb,uuid,uuid);

