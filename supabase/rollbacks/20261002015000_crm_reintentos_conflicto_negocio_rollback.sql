-- Restaura solamente los SQLSTATE anteriores; conserva actividades y tareas.
CREATE OR REPLACE FUNCTION public.fn_crm_crear_tarea(p_org integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_assigned uuid;
  v_related uuid;
  v_related_type text := p_payload->>'related_to_type';
  v_customer uuid;
  v_due timestamptz;
  v_priority text := coalesce(p_payload->>'priority','med');
  v_key text := p_payload->>'client_key';
  v_fingerprint text := encode(sha256(convert_to((p_payload-'client_key')::text,'UTF8')),'hex');
  v_task public.tasks;
BEGIN
  PERFORM public.fn_assert_acceso_org(p_org);
  IF v_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.organization_members
    WHERE organization_id=p_org AND user_id=v_actor AND is_active) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN (
      'related_to_type','related_to_id','title','description','due_date','priority','assigned_to','client_key'))
    OR coalesce(v_related_type,'') NOT IN ('customer','opportunity')
    OR nullif(btrim(p_payload->>'title'),'') IS NULL OR length(p_payload->>'title')>300
    OR nullif(p_payload->>'related_to_id','') IS NULL OR length(coalesce(p_payload->>'description',''))>5000
    OR v_priority NOT IN ('low','med','high','critical')
    OR (p_payload ? 'client_key' AND (jsonb_typeof(p_payload->'client_key')<>'string'
      OR length(v_key) NOT BETWEEN 1 AND 120))
    OR EXISTS (SELECT 1 FROM jsonb_each(p_payload) e WHERE
      (e.key IN ('related_to_type','related_to_id','title','priority') AND jsonb_typeof(e.value)<>'string')
      OR (e.key IN ('description','due_date','assigned_to') AND jsonb_typeof(e.value) NOT IN ('string','null')))
    THEN RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023'; END IF;
  v_related := (p_payload->>'related_to_id')::uuid;
  v_assigned := coalesce((p_payload->>'assigned_to')::uuid,v_actor);
  IF NOT EXISTS (SELECT 1 FROM public.organization_members
    WHERE organization_id=p_org AND user_id=v_assigned AND is_active) THEN
    RAISE EXCEPTION 'responsable_no_encontrado' USING ERRCODE='P0002'; END IF;
  IF v_related_type='opportunity' THEN
    SELECT customer_id INTO v_customer FROM public.opportunities
      WHERE id=v_related AND organization_id=p_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'entidad_no_encontrada' USING ERRCODE='P0002'; END IF;
  ELSE v_customer := v_related; END IF;
  IF v_customer IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers
    WHERE id=v_customer AND organization_id=p_org) THEN
    RAISE EXCEPTION 'entidad_no_encontrada' USING ERRCODE='P0002'; END IF;
  IF nullif(p_payload->>'due_date','') IS NOT NULL THEN
    IF p_payload->>'due_date' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' THEN
      RAISE EXCEPTION 'fecha_invalida' USING ERRCODE='22023'; END IF;
    v_due := (p_payload->>'due_date')::timestamptz;
    IF NOT isfinite(v_due) THEN RAISE EXCEPTION 'fecha_invalida' USING ERRCODE='22023'; END IF;
  END IF;
  IF v_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('crm_task:'||p_org::text||':'||v_actor::text||':'||v_key,0));
    SELECT * INTO v_task FROM public.tasks WHERE organization_id=p_org AND created_by=v_actor AND crm_client_key=v_key;
    IF FOUND THEN
      IF v_task.crm_request_fingerprint IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION 'reintento_con_datos_distintos' USING ERRCODE='40001'; END IF;
      RETURN to_jsonb(v_task);
    END IF;
  END IF;
  INSERT INTO public.tasks(organization_id,title,description,due_date,priority,status,assigned_to,
    created_by,related_to_type,related_to_id,customer_id,type,crm_client_key,crm_request_fingerprint)
    VALUES(p_org,btrim(p_payload->>'title'),p_payload->>'description',v_due,v_priority,'open',v_assigned,
      v_actor,v_related_type,v_related,v_customer,'crm',v_key,v_fingerprint) RETURNING * INTO v_task;
  RETURN to_jsonb(v_task);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_crm_registrar_actividad(p_org integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_type text := p_payload->>'activity_type';
  v_related_type text := p_payload->>'related_type';
  v_related uuid;
  v_customer uuid;
  v_call uuid;
  v_email uuid;
  v_message uuid;
  v_conversation uuid;
  v_at timestamptz;
  v_duration integer;
  v_meta jsonb := coalesce(p_payload->'metadata','{}'::jsonb);
  v_key text;
  v_fingerprint text;
  v_activity public.activities;
  v_followup jsonb;
  v_task jsonb;
BEGIN
  PERFORM public.fn_assert_acceso_org(p_org);
  IF v_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.organization_members
    WHERE organization_id=p_org AND user_id=v_actor AND is_active) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN (
      'activity_type','related_type','related_id','notes','channel','outcome','duration_seconds',
      'occurred_at','metadata','call_id','email_message_id','message_id','conversation_id','follow_up'))
    OR coalesce(v_type,'') NOT IN ('call','email','whatsapp','sms','meeting','visit','note')
    OR coalesce(v_related_type,'') NOT IN ('customer','opportunity')
    OR jsonb_typeof(v_meta) IS DISTINCT FROM 'object'
    OR octet_length(v_meta::text)>65536
    THEN RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_payload) e WHERE
      (e.key IN ('activity_type','related_type','related_id','occurred_at') AND jsonb_typeof(e.value)<>'string')
      OR (e.key IN ('notes','channel','outcome','call_id','email_message_id','message_id','conversation_id')
        AND jsonb_typeof(e.value) NOT IN ('string','null')))
    OR nullif(p_payload->>'related_id','') IS NULL
    OR length(coalesce(p_payload->>'notes',''))>20000
    OR length(coalesce(p_payload->>'channel',''))>40
    OR length(coalesce(p_payload->>'outcome',''))>60
    OR v_meta ?| ARRAY['event_id','activity_id','completed_at','voice_agent_call_id','request_fingerprint','follow_up_id']
    OR (v_meta ? 'client_key' AND (jsonb_typeof(v_meta->'client_key')<>'string'
      OR length(v_meta->>'client_key') NOT BETWEEN 1 AND 120))
    THEN RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023'; END IF;
  IF p_payload ? 'follow_up' THEN
    v_followup := p_payload->'follow_up';
    IF v_type<>'call' OR jsonb_typeof(v_followup) IS DISTINCT FROM 'object'
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_followup) k WHERE k NOT IN ('title','description','due_date','priority')) THEN
      RAISE EXCEPTION 'seguimiento_invalido' USING ERRCODE='22023'; END IF;
  END IF;
  v_related := (p_payload->>'related_id')::uuid;
  v_call := (p_payload->>'call_id')::uuid;
  v_email := (p_payload->>'email_message_id')::uuid;
  v_message := (p_payload->>'message_id')::uuid;
  v_conversation := (p_payload->>'conversation_id')::uuid;
  IF p_payload ? 'duration_seconds' AND p_payload->'duration_seconds'<>'null'::jsonb THEN
    IF jsonb_typeof(p_payload->'duration_seconds')<>'number'
      OR p_payload->>'duration_seconds' !~ '^\d+$' THEN
      RAISE EXCEPTION 'duracion_invalida' USING ERRCODE='22023'; END IF;
    v_duration := (p_payload->>'duration_seconds')::integer;
    IF v_duration NOT BETWEEN 0 AND 86400 THEN
      RAISE EXCEPTION 'duracion_invalida' USING ERRCODE='22023'; END IF;
  END IF;
  IF p_payload ? 'occurred_at' THEN
    IF p_payload->>'occurred_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' THEN
      RAISE EXCEPTION 'fecha_invalida' USING ERRCODE='22023'; END IF;
    v_at := (p_payload->>'occurred_at')::timestamptz;
    IF NOT isfinite(v_at) OR v_at>now()+interval '5 minutes' THEN
      RAISE EXCEPTION 'fecha_futura' USING ERRCODE='22023'; END IF;
  ELSE v_at := now(); END IF;
  -- Se conserva la tolerancia de reloj; nunca se persiste un contacto futuro.
  v_at := least(v_at,now());
  IF v_related_type='opportunity' THEN
    SELECT customer_id INTO v_customer FROM public.opportunities
      WHERE id=v_related AND organization_id=p_org FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'entidad_no_encontrada' USING ERRCODE='P0002'; END IF;
  ELSE v_customer := v_related; END IF;
  IF v_customer IS NOT NULL THEN
    PERFORM 1 FROM public.customers WHERE id=v_customer AND organization_id=p_org FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'entidad_no_encontrada' USING ERRCODE='P0002'; END IF;
  END IF;
  IF v_call IS NOT NULL THEN
    PERFORM 1 FROM public.calls WHERE id=v_call AND organization_id=p_org
      AND (user_id=v_actor OR public.fn_crm_tiene_permiso(p_org,'crm.calls.view_all'))
      AND (opportunity_id IS NULL OR (v_related_type='opportunity' AND opportunity_id=v_related))
      AND (customer_id IS NULL OR customer_id=v_customer) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'referencia_no_encontrada' USING ERRCODE='P0002'; END IF;
    IF v_type<>'call' THEN RAISE EXCEPTION 'referencia_invalida' USING ERRCODE='22023'; END IF;
  END IF;
  IF v_email IS NOT NULL AND (v_type<>'email' OR NOT EXISTS (
      SELECT 1 FROM public.email_messages WHERE id=v_email AND organization_id=p_org)) THEN
    RAISE EXCEPTION 'referencia_no_encontrada' USING ERRCODE='P0002'; END IF;
  IF v_message IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.messages
    WHERE id=v_message AND organization_id=p_org AND (v_conversation IS NULL OR conversation_id=v_conversation)) THEN
    RAISE EXCEPTION 'referencia_no_encontrada' USING ERRCODE='P0002'; END IF;
  IF v_conversation IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.conversations
    WHERE id=v_conversation AND organization_id=p_org AND customer_id=v_customer) THEN
    RAISE EXCEPTION 'referencia_no_encontrada' USING ERRCODE='P0002'; END IF;
  v_key := v_meta->>'client_key';
  v_fingerprint := encode(sha256(convert_to((p_payload || jsonb_build_object('metadata',v_meta-'client_key'))::text,'UTF8')),'hex');
  IF v_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('crm_activity:'||p_org::text||':'||v_actor::text||':'||v_key,0));
    SELECT * INTO v_activity FROM public.activities WHERE organization_id=p_org AND user_id=v_actor
      AND metadata ? 'client_key' AND metadata->>'client_key'=v_key ORDER BY created_at,id LIMIT 1;
    IF FOUND THEN
      IF v_activity.metadata->>'request_fingerprint' IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION 'reintento_con_datos_distintos' USING ERRCODE='40001'; END IF;
      RETURN jsonb_build_object('activity',to_jsonb(v_activity),'reused',true,'follow_up_id',v_activity.metadata->'follow_up_id');
    END IF;
  END IF;
  IF v_call IS NOT NULL THEN
    SELECT * INTO v_activity FROM public.activities WHERE organization_id=p_org AND call_id=v_call;
    IF FOUND THEN RETURN jsonb_build_object('activity',to_jsonb(v_activity),'duplicate',true); END IF;
  END IF;
  -- La procedencia y el cliente se derivan aquí; el navegador no los acredita.
  v_meta := (v_meta-'source'-'customer_id') || jsonb_build_object(
    'source','quick_actions','customer_id',v_customer,'request_fingerprint',v_fingerprint);
  INSERT INTO public.activities(organization_id,user_id,activity_type,related_type,related_id,
    notes,channel,outcome,duration_seconds,occurred_at,metadata,call_id,email_message_id,message_id,conversation_id)
    VALUES(p_org,v_actor,v_type,v_related_type,v_related,p_payload->>'notes',p_payload->>'channel',
      p_payload->>'outcome',v_duration,v_at,v_meta,v_call,v_email,v_message,v_conversation)
    RETURNING * INTO v_activity;
  IF v_followup IS NOT NULL THEN
    v_task := public.fn_crm_crear_tarea(p_org,v_followup || jsonb_build_object(
      'related_to_type',v_related_type,'related_to_id',v_related,'client_key','activity:'||v_activity.id::text));
    UPDATE public.activities SET metadata=metadata||jsonb_build_object('follow_up_id',v_task->'id')
      WHERE id=v_activity.id AND organization_id=p_org RETURNING * INTO v_activity;
  END IF;
  RETURN jsonb_build_object('activity',to_jsonb(v_activity),'reused',false,'follow_up_id',v_task->'id');
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_crm_crear_tarea(integer,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_crear_tarea(integer,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_crm_registrar_actividad(integer,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_registrar_actividad(integer,jsonb) TO authenticated;

