-- BORRADOR: no aplicado, sin referencias en el runtime.
-- Requiere verificar esquema/ACL actuales por MCP, probar transacción + rollback,
-- y versionar como migración antes de cambiar los escritores Node.
-- La máquina callStateMachine sigue en TypeScript: el callback entrega un parche
-- calculado sobre un snapshot; SQL solo compara, aplica y sincroniza atómicamente.
-- Las actas de llamadas/disposiciones no contienen una autoría inventada.

CREATE TABLE IF NOT EXISTS public.crm_call_disposition_receipts (
  organization_id integer NOT NULL,
  actor_id uuid NOT NULL,
  call_id uuid NOT NULL,
  client_key text NOT NULL CHECK (length(client_key) BETWEEN 1 AND 120),
  request_fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,actor_id,call_id,client_key)
);
ALTER TABLE public.crm_call_disposition_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_call_disposition_receipts FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.crm_call_disposition_receipts IS
  'Recibos privados de disposiciones CRM; RLS sin políticas y sin grants de API por diseño.';

-- Solo los wrappers definidos abajo pueden ejecutar este núcleo.
CREATE OR REPLACE FUNCTION public.fn_crm_sync_llamada_core(p_org integer,p_call uuid,p_enrich jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_call public.calls;
  v_activity public.activities;
  v_customer uuid;
  v_related uuid;
  v_type text;
  v_outcome text;
  v_channel text;
  v_notes text;
  v_meta jsonb;
  v_created boolean:=false;
  v_due timestamptz;
  v_temperature text:=p_enrich->>'temperature';
  v_ref text;
  v_call_disposition_at timestamptz;
  v_activity_disposition_at timestamptz;
  v_use_activity_disposition boolean:=false;
  v_next jsonb;
BEGIN
  IF jsonb_typeof(p_enrich) IS DISTINCT FROM 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_enrich) k WHERE k NOT IN ('summary','temperature','sentiment','qualityScore','transcriptId','analysisId','nextSteps','tags','recordingId','outcome'))
    OR (p_enrich ? 'summary' AND jsonb_typeof(p_enrich->'summary') NOT IN ('string','null'))
    OR length(coalesce(p_enrich->>'summary',''))>20000
    OR (v_temperature IS NOT NULL AND v_temperature NOT IN ('cold','warm','hot'))
    OR EXISTS (SELECT 1 FROM jsonb_each(p_enrich) e WHERE e.key IN ('sentiment','transcriptId','analysisId','recordingId','outcome') AND jsonb_typeof(e.value) NOT IN ('string','null'))
    OR (p_enrich ? 'qualityScore' AND p_enrich->'qualityScore'<>'null'::jsonb AND (jsonb_typeof(p_enrich->'qualityScore')<>'number' OR (p_enrich->>'qualityScore')::numeric NOT BETWEEN 0 AND 100))
    OR EXISTS (SELECT 1 FROM jsonb_each(p_enrich) e WHERE e.key IN ('nextSteps','tags') AND jsonb_typeof(e.value) NOT IN ('array','null')) THEN
    RAISE EXCEPTION 'enriquecimiento_invalido' USING ERRCODE='22023'; END IF;
  -- Orden común de locks: llamada -> actividad -> oportunidad -> cliente.
  SELECT * INTO v_call FROM public.calls WHERE organization_id=p_org AND id=p_call FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'llamada_no_encontrada' USING ERRCODE='P0002'; END IF;
  IF jsonb_typeof(v_call.metadata) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'metadata_de_llamada_invalida' USING ERRCODE='22023'; END IF;
  -- Referencias internas verificadas contra el mismo tenant y la misma llamada.
  FOREACH v_ref IN ARRAY ARRAY['analysisId','transcriptId','recordingId'] LOOP
    IF nullif(p_enrich->>v_ref,'') IS NOT NULL THEN
      IF p_enrich->>v_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'referencia_de_llamada_invalida' USING ERRCODE='22023'; END IF;
      IF (v_ref='analysisId' AND NOT EXISTS (SELECT 1 FROM public.call_analyses
          WHERE id=(p_enrich->>v_ref)::uuid AND organization_id=p_org AND call_id=p_call))
        OR (v_ref='transcriptId' AND NOT EXISTS (SELECT 1 FROM public.call_transcripts
          WHERE id=(p_enrich->>v_ref)::uuid AND organization_id=p_org AND call_id=p_call))
        OR (v_ref='recordingId' AND NOT EXISTS (SELECT 1 FROM public.call_recordings
          WHERE id=(p_enrich->>v_ref)::uuid AND organization_id=p_org AND call_id=p_call)) THEN
        RAISE EXCEPTION 'referencia_de_llamada_incoherente' USING ERRCODE='22023'; END IF;
    ELSIF p_enrich->>v_ref='' THEN
      RAISE EXCEPTION 'referencia_de_llamada_invalida' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF p_enrich->>'analysisId' IS NOT NULL AND EXISTS (SELECT 1 FROM public.call_analyses a
    LEFT JOIN public.call_transcripts t ON t.id=a.transcript_id
    WHERE a.id=(p_enrich->>'analysisId')::uuid AND a.organization_id=p_org AND a.call_id=p_call
      AND a.transcript_id IS NOT NULL AND (t.id IS NULL OR t.organization_id<>p_org OR t.call_id<>p_call
        OR (p_enrich->>'transcriptId' IS NOT NULL AND t.id<>(p_enrich->>'transcriptId')::uuid))) THEN
    RAISE EXCEPTION 'referencia_de_llamada_incoherente' USING ERRCODE='22023'; END IF;
  IF v_call.status NOT IN ('completed','voicemail','no_answer','busy','failed','canceled') OR v_call.ended_at IS NULL THEN
    RETURN jsonb_build_object('activity_id',NULL);
  END IF;
  IF NOT isfinite(v_call.started_at) OR NOT isfinite(v_call.ended_at)
    OR v_call.ended_at<v_call.started_at OR v_call.ended_at>now() THEN
    RAISE EXCEPTION 'fecha_llamada_invalida' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_activity FROM public.activities WHERE organization_id=p_org AND call_id=p_call FOR UPDATE;
  v_customer:=v_call.customer_id;
  IF v_call.opportunity_id IS NOT NULL THEN
    SELECT customer_id INTO v_customer FROM public.opportunities
      WHERE organization_id=p_org AND id=v_call.opportunity_id FOR UPDATE;
    IF NOT FOUND OR v_customer IS DISTINCT FROM v_call.customer_id THEN
      RAISE EXCEPTION 'entidad_de_llamada_incoherente' USING ERRCODE='22023'; END IF;
    v_type:='opportunity';v_related:=v_call.opportunity_id;
  ELSIF v_customer IS NOT NULL THEN v_type:='customer';v_related:=v_customer;
  ELSE RETURN jsonb_build_object('activity_id',NULL); END IF;
  IF v_customer IS NOT NULL THEN
    PERFORM 1 FROM public.customers WHERE organization_id=p_org AND id=v_customer FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'cliente_no_encontrado' USING ERRCODE='P0002'; END IF;
  END IF;
  IF nullif(v_call.metadata->>'disposition_at','') IS NOT NULL THEN
    BEGIN v_call_disposition_at:=(v_call.metadata->>'disposition_at')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN v_call_disposition_at:=NULL; END;
  END IF;
  IF nullif(v_activity.metadata->>'disposition_at','') IS NOT NULL THEN
    BEGIN v_activity_disposition_at:=(v_activity.metadata->>'disposition_at')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN v_activity_disposition_at:=NULL; END;
  END IF;
  v_use_activity_disposition:=coalesce(nullif(v_activity.metadata->>'disposition_outcome','') IS NOT NULL
    AND (nullif(v_call.metadata->>'disposition_outcome','') IS NULL OR
      (isfinite(v_activity_disposition_at) AND (v_call_disposition_at IS NULL OR
        NOT isfinite(v_call_disposition_at) OR v_activity_disposition_at>v_call_disposition_at))),false);
  v_outcome:=coalesce(CASE WHEN v_use_activity_disposition THEN v_activity.metadata->>'disposition_outcome' END,
    nullif(v_call.metadata->>'disposition_outcome',''),nullif(v_activity.metadata->>'disposition_outcome',''),p_enrich->>'outcome',
    CASE v_call.status WHEN 'completed' THEN CASE WHEN v_call.answered_by='machine' THEN 'voicemail' ELSE 'answered' END
      ELSE v_call.status END);
  v_channel:=CASE v_call.mode WHEN 'ai_agent' THEN 'voice_ai' WHEN 'bridge' THEN 'mobile' ELSE 'phone' END;
  v_notes:=coalesce(CASE WHEN v_use_activity_disposition THEN v_activity.notes ELSE v_call.metadata->>'disposition_note' END,
    p_enrich->>'summary',v_call.metadata->>'live_note',v_call.metadata->>'notes',v_activity.notes);
  v_next:=CASE WHEN v_use_activity_disposition THEN v_activity.metadata->'disposition_next_action'
    ELSE v_call.metadata->'disposition_next_action' END;
  IF nullif(v_next->>'due_at','') IS NOT NULL THEN
    IF v_next->>'due_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' THEN
      RAISE EXCEPTION 'fecha_seguimiento_invalida' USING ERRCODE='22023'; END IF;
    v_due:=(v_next->>'due_at')::timestamptz;
    IF NOT isfinite(v_due) THEN RAISE EXCEPTION 'fecha_seguimiento_invalida' USING ERRCODE='22023'; END IF;
  END IF;
  v_meta:=coalesce(v_activity.metadata,'{}'::jsonb)||jsonb_build_object(
    'call_id',v_call.id,'direction',v_call.direction,'mode',v_call.mode,'call_status',v_call.status,'source','call_sync');
  -- Estas referencias ya se validaron por tenant y llamada antes de modificar el historial.
  v_meta:=v_meta||jsonb_strip_nulls(jsonb_build_object('analysis_id',p_enrich->'analysisId',
    'transcript_id',p_enrich->'transcriptId','recording_id',p_enrich->'recordingId',
    'sentiment',p_enrich->'sentiment','quality_score',p_enrich->'qualityScore',
    'temperature',p_enrich->'temperature','next_steps',p_enrich->'nextSteps','tags',p_enrich->'tags'));
  IF v_call.metadata ? 'disposition_outcome' AND NOT v_use_activity_disposition THEN
    v_meta:=v_meta||jsonb_build_object('disposition_outcome',v_outcome,
      'disposition_at',v_call.metadata->'disposition_at','disposition_next_action',v_call.metadata->'disposition_next_action');
  END IF;
  IF v_activity.id IS NULL THEN
    v_created:=true;
    INSERT INTO public.activities(organization_id,user_id,activity_type,call_id,related_type,related_id,
      occurred_at,channel,outcome,duration_seconds,notes,metadata)
      VALUES(p_org,v_call.user_id,'call',v_call.id,v_type,v_related,v_call.started_at,v_channel,v_outcome,
        v_call.duration_seconds,v_notes,v_meta) RETURNING * INTO v_activity;
  ELSE
    UPDATE public.activities SET user_id=v_call.user_id,related_type=v_type,related_id=v_related,
      occurred_at=v_call.started_at,channel=v_channel,outcome=v_outcome,duration_seconds=v_call.duration_seconds,
      notes=v_notes,metadata=v_meta WHERE organization_id=p_org AND id=v_activity.id RETURNING * INTO v_activity;
  END IF;
  -- El trigger conserva el inicio en el historial. El contacto acredita el cierre real
  -- para cliente y oportunidad, con la misma fecha pasada y sin retroceder ninguno.
  IF v_call.opportunity_id IS NOT NULL THEN
    UPDATE public.opportunities SET last_contact_at=v_call.ended_at,contact_channel=v_channel,contact_result=v_outcome,
      next_contact_at=coalesce(v_due,next_contact_at),temperature=coalesce(v_temperature,temperature)
      WHERE organization_id=p_org AND id=v_call.opportunity_id AND (last_contact_at IS NULL OR last_contact_at<=v_call.ended_at);
  END IF;
  IF v_customer IS NOT NULL THEN
    UPDATE public.customers SET last_contact_at=v_call.ended_at
      WHERE organization_id=p_org AND id=v_customer AND (last_contact_at IS NULL OR last_contact_at<v_call.ended_at);
  END IF;
  RETURN jsonb_build_object('activity_id',v_activity.id,'created',v_created);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_crm_sync_llamada_core(integer,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_crm_disponer_llamada(p_org integer,p_call uuid,p_key text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_call public.calls;
  v_receipt public.crm_call_disposition_receipts;
  v_fingerprint text:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  v_disposition jsonb:=p_payload->'disposition';
  v_next jsonb:=v_disposition->'next_action';
  v_meta jsonb;
  v_task jsonb;
  v_sync jsonb;
  v_response jsonb;
  v_due timestamptz;
BEGIN
  PERFORM public.fn_assert_acceso_org(p_org);
  IF v_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.organization_members
    WHERE organization_id=p_org AND user_id=v_actor AND is_active) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 120 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('disposition','live_note'))
    OR jsonb_typeof(v_disposition) IS DISTINCT FROM 'object'
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_disposition) k WHERE k NOT IN ('outcome','note','next_action'))
    OR coalesce(v_disposition->>'outcome','') NOT IN ('answered','no_answer','voicemail','busy','wrong_number','callback_requested')
    OR length(coalesce(v_disposition->>'note',''))>20000 OR length(coalesce(p_payload->>'live_note',''))>20000
    OR (v_disposition ? 'note' AND jsonb_typeof(v_disposition->'note') NOT IN ('string','null'))
    OR (p_payload ? 'live_note' AND jsonb_typeof(p_payload->'live_note') NOT IN ('string','null')) THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023'; END IF;
  IF v_next IS NOT NULL AND v_next<>'null'::jsonb AND (
    jsonb_typeof(v_next) IS DISTINCT FROM 'object' OR
    coalesce(v_next->>'type','') NOT IN ('none','task','meeting','email','whatsapp','call') OR
    EXISTS (SELECT 1 FROM jsonb_object_keys(v_next) k WHERE k NOT IN ('type','due_at','title')) OR
    length(coalesce(v_next->>'title',''))>200 OR
    (v_next ? 'due_at' AND jsonb_typeof(v_next->'due_at') NOT IN ('string','null')) OR
    (v_next ? 'title' AND jsonb_typeof(v_next->'title') NOT IN ('string','null'))
  ) THEN RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023'; END IF;
  IF nullif(v_next->>'due_at','') IS NOT NULL THEN
    IF v_next->>'due_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' THEN
      RAISE EXCEPTION 'fecha_seguimiento_invalida' USING ERRCODE='22023'; END IF;
    v_due:=(v_next->>'due_at')::timestamptz;
    IF NOT isfinite(v_due) THEN RAISE EXCEPTION 'fecha_seguimiento_invalida' USING ERRCODE='22023'; END IF;
  END IF;
  SELECT * INTO v_call FROM public.calls WHERE organization_id=p_org AND id=p_call FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'llamada_no_encontrada' USING ERRCODE='P0002'; END IF;
  IF v_call.user_id IS DISTINCT FROM v_actor AND NOT public.fn_crm_tiene_permiso(p_org,'crm.activities.edit_any') THEN
    RAISE EXCEPTION 'llamada_no_es_propia' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(v_call.metadata) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'metadata_de_llamada_invalida' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_receipt FROM public.crm_call_disposition_receipts
    WHERE organization_id=p_org AND actor_id=v_actor AND call_id=p_call AND client_key=p_key;
  IF FOUND THEN
    IF v_receipt.request_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION 'reintento_con_datos_distintos' USING ERRCODE='23505'; END IF;
    RETURN v_receipt.response;
  END IF;
  v_meta:=v_call.metadata||jsonb_build_object('disposition_outcome',v_disposition->>'outcome',
    'disposition_note',coalesce(v_disposition->'note',v_call.metadata->'disposition_note'),
    'disposition_next_action',CASE WHEN v_next->>'type'='none' THEN NULL ELSE v_next END,
    'disposition_by',v_actor,'disposition_at',now());
  IF p_payload ? 'live_note' THEN v_meta:=v_meta||jsonb_build_object('live_note',p_payload->'live_note'); END IF;
  UPDATE public.calls SET metadata=v_meta,updated_at=now(),status=CASE WHEN v_disposition->>'outcome'='voicemail'
    AND status IN ('completed','no_answer') THEN 'voicemail' ELSE status END
    WHERE organization_id=p_org AND id=p_call RETURNING * INTO v_call;
  v_sync:=public.fn_crm_sync_llamada_core(p_org,p_call);
  IF v_next->>'type'='task' THEN
    v_task:=public.fn_crm_crear_tarea(p_org,jsonb_build_object(
      'related_to_type',CASE WHEN v_call.opportunity_id IS NULL THEN 'customer' ELSE 'opportunity' END,
      'related_to_id',coalesce(v_call.opportunity_id,v_call.customer_id),
      'title',coalesce(nullif(btrim(v_next->>'title'),''),'Seguimiento de llamada'),
      -- La RPC canónica de tareas acepta hasta 5.000 caracteres; el texto completo
      -- permanece en calls.metadata y activities.notes, ambos enlazados a la entidad.
      'description',left(v_disposition->>'note',5000),'due_date',v_next->>'due_at','priority','med','assigned_to',v_actor,
      'client_key','call:'||p_call::text||':'||encode(sha256(convert_to(p_key,'UTF8')),'hex')));
  END IF;
  v_response:=jsonb_build_object('call',to_jsonb(v_call),'activity_id',v_sync->'activity_id','task_id',v_task->'id');
  INSERT INTO public.crm_call_disposition_receipts(organization_id,actor_id,call_id,client_key,request_fingerprint,response)
    VALUES(p_org,v_actor,p_call,p_key,v_fingerprint,v_response);
  RETURN v_response;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_crm_disponer_llamada(integer,uuid,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_disponer_llamada(integer,uuid,text,jsonb) TO authenticated;

-- CAS por JSON en BODY, evita el límite de URL de PostgREST para notas extensas.
-- Service role únicamente; firma y cuenta Twilio se verifican antes en el route.
CREATE OR REPLACE FUNCTION public.fn_crm_callback_llamada(p_org integer,p_call uuid,p_expected jsonb,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_call public.calls;
  v_old public.calls;
  v_new public.calls;
  v_sync jsonb;
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',
    nullif(current_setting('request.jwt.claim.role',true),''),'')<>'service_role' THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN
    ('status','metadata','started_at','answered_at','ended_at','duration_seconds','ring_seconds','duration_source','answered_by','provider_call_sid','customer_leg_sid','agent_leg_sid','cost_amount','cost_currency','recording_enabled','consent_given','bridge_mode')
  ) THEN RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_call FROM public.calls WHERE organization_id=p_org AND id=p_call FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'llamada_no_encontrada' USING ERRCODE='P0002'; END IF;
  IF jsonb_typeof(p_expected) IS DISTINCT FROM 'object' OR (
    SELECT count(*) FROM jsonb_object_keys(p_expected)
  )<>20 OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_expected) k WHERE k NOT IN (
    'status','metadata','started_at','answered_at','ended_at','duration_seconds','answered_by',
    'provider_call_sid','customer_leg_sid','agent_leg_sid','user_id','customer_id','opportunity_id',
    'recording_enabled','consent_given','bridge_mode','ring_seconds','duration_source','cost_amount','cost_currency'
  )) THEN RAISE EXCEPTION 'snapshot_invalido' USING ERRCODE='22023'; END IF;
  -- Cast tipado: Z y +00:00 representan el mismo timestamptz.
  v_old:=jsonb_populate_record(v_call,p_expected);
  IF ROW(v_call.status,v_call.metadata,v_call.started_at,v_call.answered_at,v_call.ended_at,
    v_call.duration_seconds,v_call.answered_by,v_call.provider_call_sid,v_call.customer_leg_sid,
    v_call.agent_leg_sid,v_call.user_id,v_call.customer_id,v_call.opportunity_id,v_call.recording_enabled,v_call.consent_given,
    v_call.bridge_mode,v_call.ring_seconds,v_call.duration_source,v_call.cost_amount,v_call.cost_currency) IS DISTINCT FROM
    ROW(v_old.status,v_old.metadata,v_old.started_at,v_old.answered_at,v_old.ended_at,
    v_old.duration_seconds,v_old.answered_by,v_old.provider_call_sid,v_old.customer_leg_sid,
    v_old.agent_leg_sid,v_old.user_id,v_old.customer_id,v_old.opportunity_id,v_old.recording_enabled,v_old.consent_given,
    v_old.bridge_mode,v_old.ring_seconds,v_old.duration_source,v_old.cost_amount,v_old.cost_currency) THEN
    RETURN jsonb_build_object('stale',true,'call',to_jsonb(v_call)); END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_patch) e WHERE e.key IN ('duration_seconds','ring_seconds')
    AND e.value<>'null'::jsonb AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^\d+$' OR (e.value::text)::numeric>2147483647))
    OR EXISTS (SELECT 1 FROM jsonb_each(p_patch) e WHERE e.key IN ('status','duration_source','answered_by','provider_call_sid','customer_leg_sid','agent_leg_sid','cost_currency','bridge_mode')
      AND jsonb_typeof(e.value) NOT IN ('string','null'))
    OR EXISTS (SELECT 1 FROM jsonb_each(p_patch) e WHERE e.key IN ('started_at','answered_at','ended_at') AND e.value<>'null'::jsonb AND
      (jsonb_typeof(e.value)<>'string' OR (e.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'))
    OR EXISTS (SELECT 1 FROM jsonb_each(p_patch) e WHERE e.key IN ('recording_enabled','consent_given') AND jsonb_typeof(e.value)<>'boolean')
    OR (p_patch ? 'cost_amount' AND p_patch->'cost_amount'<>'null'::jsonb AND
      (jsonb_typeof(p_patch->'cost_amount')<>'number' OR (p_patch->>'cost_amount')::numeric<0)) THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023'; END IF;
  v_new:=jsonb_populate_record(v_call,p_patch);
  IF v_new.started_at IS NULL OR NOT isfinite(v_new.started_at) OR v_new.started_at>now()+interval '5 minutes'
    OR (v_new.answered_at IS NOT NULL AND (NOT isfinite(v_new.answered_at) OR v_new.answered_at>now() OR v_new.answered_at<v_new.started_at))
    OR (v_new.ended_at IS NOT NULL AND (NOT isfinite(v_new.ended_at) OR v_new.ended_at>now() OR v_new.ended_at<v_new.started_at)) THEN
    RAISE EXCEPTION 'fecha_llamada_invalida' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(v_new.metadata) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023'; END IF;
  UPDATE public.calls SET status=v_new.status,metadata=v_new.metadata,started_at=v_new.started_at,answered_at=v_new.answered_at,ended_at=v_new.ended_at,
    duration_seconds=v_new.duration_seconds,ring_seconds=v_new.ring_seconds,duration_source=v_new.duration_source,
    answered_by=v_new.answered_by,provider_call_sid=v_new.provider_call_sid,customer_leg_sid=v_new.customer_leg_sid,agent_leg_sid=v_new.agent_leg_sid,
    cost_amount=v_new.cost_amount,cost_currency=v_new.cost_currency,recording_enabled=v_new.recording_enabled,
    consent_given=v_new.consent_given,bridge_mode=v_new.bridge_mode,updated_at=now()
    WHERE organization_id=p_org AND id=p_call RETURNING * INTO v_call;
  v_sync:=public.fn_crm_sync_llamada_core(p_org,p_call);
  RETURN jsonb_build_object('stale',false,'call',to_jsonb(v_call),'activity_id',v_sync->'activity_id');
END;
$$;
REVOKE ALL ON FUNCTION public.fn_crm_callback_llamada(integer,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crm_callback_llamada(integer,uuid,jsonb,jsonb) TO service_role;

-- Recuperación/enriquecimiento posterior del historial, siempre sobre la llamada actual.
CREATE OR REPLACE FUNCTION public.fn_crm_sync_llamada_servicio(p_org integer,p_call uuid,p_enrich jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',
    nullif(current_setting('request.jwt.claim.role',true),''),'')<>'service_role' THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
  RETURN public.fn_crm_sync_llamada_core(p_org,p_call,p_enrich);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_crm_sync_llamada_servicio(integer,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crm_sync_llamada_servicio(integer,uuid,jsonb) TO service_role;

-- El servicio canónico prepara el mismo DTO que usaba su INSERT; esta API agrega
-- validación de sesión y guarda llamada e historial dentro de una transacción.
CREATE OR REPLACE FUNCTION public.fn_crm_crear_llamada(p_org integer,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_data jsonb:=p_payload;
  v_row public.calls;
  v_call public.calls;
  v_customer uuid;
  v_columns text;
  v_fields text;
BEGIN
  PERFORM public.fn_assert_acceso_org(p_org);
  IF v_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.organization_members
    WHERE organization_id=p_org AND user_id=v_actor AND is_active) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(v_data) IS DISTINCT FROM 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_data) k WHERE k NOT IN (
    'provider','provider_call_sid','parent_call_sid','direction','mode','from_number','to_number','customer_id',
    'opportunity_id','user_id','voice_agent_id','status','answered_by','started_at','answered_at','ended_at',
    'duration_seconds','ring_seconds','recording_enabled','consent_given','cost_amount','cost_currency','metadata',
    'bridge_mode','agent_leg_sid','customer_leg_sid','duration_source'))
    OR EXISTS (SELECT 1 FROM jsonb_each(v_data) e WHERE e.key NOT IN
      ('duration_seconds','ring_seconds','recording_enabled','consent_given','cost_amount','metadata')
      AND jsonb_typeof(e.value) NOT IN ('string','null'))
    OR EXISTS (SELECT 1 FROM jsonb_each(v_data) e WHERE e.key IN ('duration_seconds','ring_seconds')
      AND e.value<>'null'::jsonb AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^\d+$' OR (e.value::text)::numeric>2147483647))
    OR EXISTS (SELECT 1 FROM jsonb_each(v_data) e WHERE e.key IN ('recording_enabled','consent_given') AND jsonb_typeof(e.value)<>'boolean')
    OR EXISTS (SELECT 1 FROM jsonb_each(v_data) e WHERE e.key IN ('started_at','answered_at','ended_at') AND e.value<>'null'::jsonb
      AND (e.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$')
    OR (v_data ? 'cost_amount' AND v_data->'cost_amount'<>'null'::jsonb
      AND (jsonb_typeof(v_data->'cost_amount')<>'number' OR (v_data->>'cost_amount')::numeric<0))
    OR (v_data ? 'metadata' AND jsonb_typeof(v_data->'metadata')<>'object') THEN
    RAISE EXCEPTION 'llamada_preparada_invalida' USING ERRCODE='22023'; END IF;
  v_row:=jsonb_populate_record(NULL::public.calls,v_data);
  IF v_row.user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'llamada_no_es_propia' USING ERRCODE='42501'; END IF;
  IF v_row.cost_amount IS NOT NULL THEN
    -- El coste se liquida mediante el callback de servicio, no mediante la sesión.
    RAISE EXCEPTION 'coste_de_llamada_solo_servicio' USING ERRCODE='22023'; END IF;
  IF nullif(btrim(v_row.provider),'') IS NULL OR nullif(btrim(v_row.from_number),'') IS NULL
    OR nullif(btrim(v_row.to_number),'') IS NULL OR v_row.direction IS NULL THEN
    RAISE EXCEPTION 'llamada_preparada_invalida' USING ERRCODE='22023'; END IF;
  IF v_row.started_at IS NOT NULL AND (NOT isfinite(v_row.started_at) OR v_row.started_at>now()+interval '5 minutes')
    OR v_row.answered_at IS NOT NULL AND (NOT isfinite(v_row.answered_at) OR v_row.answered_at>now()
      OR v_row.answered_at<coalesce(v_row.started_at,now()))
    OR v_row.ended_at IS NOT NULL AND (NOT isfinite(v_row.ended_at) OR v_row.ended_at>now()
      OR v_row.ended_at<coalesce(v_row.started_at,now())) THEN
    RAISE EXCEPTION 'fecha_llamada_invalida' USING ERRCODE='22023'; END IF;
  v_customer:=v_row.customer_id;
  IF v_row.opportunity_id IS NOT NULL THEN
    SELECT customer_id INTO v_customer FROM public.opportunities
      WHERE organization_id=p_org AND id=v_row.opportunity_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'oportunidad_no_encontrada' USING ERRCODE='P0002'; END IF;
    IF v_customer IS DISTINCT FROM v_row.customer_id THEN
      RAISE EXCEPTION 'entidad_de_llamada_incoherente' USING ERRCODE='22023'; END IF;
  END IF;
  IF v_customer IS NOT NULL THEN
    PERFORM 1 FROM public.customers WHERE organization_id=p_org AND id=v_customer FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'cliente_no_encontrado' USING ERRCODE='P0002'; END IF;
  END IF;
  IF v_row.voice_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.voice_agents
    WHERE organization_id=p_org AND id=v_row.voice_agent_id) THEN
    RAISE EXCEPTION 'agente_no_encontrado' USING ERRCODE='P0002'; END IF;
  v_data:=v_data||jsonb_build_object('organization_id',p_org);
  SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k)
    INTO v_columns,v_fields FROM jsonb_object_keys(v_data) k;
  EXECUTE format('INSERT INTO public.calls (%s) SELECT %s FROM jsonb_populate_record(NULL::public.calls,$1) r RETURNING calls.*',v_columns,v_fields)
    INTO v_call USING v_data;
  PERFORM public.fn_crm_sync_llamada_core(p_org,v_call.id);
  RETURN to_jsonb(v_call);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_crm_crear_llamada(integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_crear_llamada(integer,jsonb) TO authenticated;

-- Bloque para integrar al candidato llamadas_atomicas.sql; NO aplicado.
-- Un INSERT compartido para el payload normalizado por prepareLeadCustomerInsert.
CREATE OR REPLACE FUNCTION public.fn_crm_insertar_cliente_preparado_core(p_org integer,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_data jsonb:=p_data;
  v_row public.customers;
  v_columns text;
  v_fields text;
  v_result jsonb;
BEGIN
  IF jsonb_typeof(v_data) IS DISTINCT FROM 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(v_data) k WHERE k NOT IN (
      'branch_id','first_name','last_name','email','phone','company_name','customer_type','lifecycle_stage',
      'trade_name','identification_type','identification_number','dv','address','city','notes','metadata','tags','vertical_id','timezone'))
    OR v_data->>'lifecycle_stage' IS DISTINCT FROM 'lead'
    OR coalesce(v_data->>'customer_type','') NOT IN ('person','company')
    OR EXISTS (SELECT 1 FROM jsonb_each(v_data) e WHERE e.key IN (
      'first_name','last_name','email','phone','company_name','customer_type','lifecycle_stage',
      'trade_name','identification_type','identification_number','address','city','notes','vertical_id','timezone')
      AND jsonb_typeof(e.value) NOT IN ('string','null'))
    OR (v_data ? 'metadata' AND jsonb_typeof(v_data->'metadata') NOT IN ('object','null'))
    OR (v_data ? 'tags' AND jsonb_typeof(v_data->'tags') NOT IN ('array','null'))
    OR EXISTS (SELECT 1 FROM jsonb_each(v_data) e WHERE e.key IN ('branch_id','dv')
      AND e.value<>'null'::jsonb AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^-?[0-9]+$')) THEN
    RAISE EXCEPTION 'cliente_preparado_invalido' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(v_data->'tags')='array' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_data->'tags') t WHERE jsonb_typeof(t)<>'string') THEN
    RAISE EXCEPTION 'cliente_preparado_invalido' USING ERRCODE='22023'; END IF;
  v_row:=jsonb_populate_record(NULL::public.customers,v_data);
  IF (v_row.customer_type='person' AND nullif(btrim(v_row.first_name),'') IS NULL)
    OR (v_row.customer_type='company' AND nullif(btrim(v_row.company_name),'') IS NULL)
    OR (nullif(btrim(v_row.email),'') IS NULL AND nullif(btrim(v_row.phone),'') IS NULL) THEN
    RAISE EXCEPTION 'cliente_preparado_invalido' USING ERRCODE='22023'; END IF;
  IF v_row.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id=v_row.branch_id AND organization_id=p_org) THEN
    RAISE EXCEPTION 'sucursal_no_encontrada' USING ERRCODE='P0002'; END IF;
  IF v_row.vertical_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.verticals WHERE id=v_row.vertical_id AND organization_id=p_org) THEN
    RAISE EXCEPTION 'vertical_no_encontrada' USING ERRCODE='P0002'; END IF;
  IF v_row.timezone IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=v_row.timezone) THEN
    RAISE EXCEPTION 'zona_horaria_invalida' USING ERRCODE='22023'; END IF;
  v_data:=v_data||jsonb_build_object('organization_id',p_org);
  -- Solo identificadores de la whitelist; los valores viajan en USING y son
  -- tipados por la tabla real. Los extras omitidos conservan sus DEFAULT.
  SELECT string_agg(format('%I',k),',' ORDER BY k),string_agg(format('r.%I',k),',' ORDER BY k)
    INTO v_columns,v_fields FROM jsonb_object_keys(v_data) k;
  EXECUTE format('INSERT INTO public.customers (%s) SELECT %s FROM jsonb_populate_record(NULL::public.customers,$1) r RETURNING to_jsonb(customers)',v_columns,v_fields)
    INTO v_result USING v_data;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_crm_insertar_cliente_preparado_core(integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_crm_insertar_cliente_preparado(p_org integer,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.fn_assert_acceso_org(p_org);
  IF auth.uid() IS NULL THEN
    IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN
      RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
  ELSE
    PERFORM public.fn_crm_exigir_permiso(p_org,ARRAY['crm.leads.create','crm.customers.create']);
  END IF;
  RETURN public.fn_crm_insertar_cliente_preparado_core(p_org,p_data);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_crm_insertar_cliente_preparado(integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_insertar_cliente_preparado(integer,jsonb) TO authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.crm_call_link_receipts (
  organization_id integer NOT NULL,actor_id uuid NOT NULL,call_id uuid NOT NULL,
  client_key text NOT NULL,request_fingerprint text NOT NULL,response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,actor_id,call_id,client_key)
);
ALTER TABLE public.crm_call_link_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_call_link_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_crm_vincular_llamada(p_org integer,p_call uuid,p_key text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_call public.calls;
  v_receipt public.crm_call_link_receipts;
  v_key text:=p_key;
  v_fingerprint text:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  v_customer uuid;
  v_opportunity uuid;
  v_opp_customer uuid;
  v_created jsonb;
  v_sync jsonb;
  v_response jsonb;
  v_create_opp jsonb:=p_payload->'create_opportunity';
BEGIN
  PERFORM public.fn_assert_acceso_org(p_org);
  IF v_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.organization_members
    WHERE organization_id=p_org AND user_id=v_actor AND is_active) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
  IF p_key IS NULL OR p_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('customer_id','opportunity_id','create_customer','create_opportunity'))
    OR EXISTS (SELECT 1 FROM jsonb_each(p_payload) e WHERE e.key IN ('customer_id','opportunity_id') AND jsonb_typeof(e.value) NOT IN ('string','null'))
    OR (p_payload ? 'create_customer' AND (jsonb_typeof(p_payload->'create_customer')<>'object' OR p_payload ? 'customer_id'))
    OR (p_payload ? 'create_opportunity' AND (jsonb_typeof(v_create_opp)<>'object' OR p_payload ? 'opportunity_id')) THEN
    RAISE EXCEPTION 'vinculacion_invalida' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_call FROM public.calls WHERE id=p_call AND organization_id=p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'llamada_no_encontrada' USING ERRCODE='P0002'; END IF;
  IF v_call.user_id IS DISTINCT FROM v_actor AND NOT public.fn_crm_tiene_permiso(p_org,'crm.activities.edit_any') THEN
    RAISE EXCEPTION 'llamada_no_es_propia' USING ERRCODE='42501'; END IF;
  IF p_payload ? 'create_customer' THEN
    PERFORM public.fn_crm_exigir_permiso(p_org,ARRAY['crm.leads.create','crm.customers.create']); END IF;
  IF p_payload ? 'create_opportunity' THEN
    PERFORM public.fn_crm_exigir_permiso(p_org,ARRAY['crm.opportunities.create']); END IF;
  SELECT * INTO v_receipt FROM public.crm_call_link_receipts
    WHERE organization_id=p_org AND actor_id=v_actor AND call_id=p_call AND client_key=v_key;
  IF FOUND THEN
    IF v_receipt.request_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION 'vinculacion_intencion_reutilizada' USING ERRCODE='40001'; END IF;
    RETURN v_receipt.response;
  END IF;
  -- Mantiene el mismo orden de bloqueo que callback/disposición/sync.
  PERFORM 1 FROM public.activities WHERE organization_id=p_org AND call_id=p_call FOR UPDATE;
  v_customer:=CASE WHEN p_payload ? 'customer_id' THEN public.fn_crm_uuid_o_null(p_payload->>'customer_id') ELSE v_call.customer_id END;
  v_opportunity:=CASE WHEN p_payload ? 'opportunity_id' THEN public.fn_crm_uuid_o_null(p_payload->>'opportunity_id') ELSE v_call.opportunity_id END;
  IF v_opportunity IS NOT NULL THEN
    SELECT customer_id INTO v_opp_customer FROM public.opportunities
      WHERE id=v_opportunity AND organization_id=p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'oportunidad_no_encontrada' USING ERRCODE='P0002'; END IF;
    IF p_payload ? 'customer_id' OR p_payload ? 'create_customer' THEN
      IF v_customer IS DISTINCT FROM v_opp_customer OR p_payload ? 'create_customer' THEN
        RAISE EXCEPTION 'entidad_de_llamada_incoherente' USING ERRCODE='22023'; END IF;
    ELSE
      IF v_customer IS NOT NULL AND v_customer IS DISTINCT FROM v_opp_customer THEN
        RAISE EXCEPTION 'entidad_de_llamada_incoherente' USING ERRCODE='22023'; END IF;
      v_customer:=v_opp_customer;
    END IF;
  END IF;
  IF v_customer IS NOT NULL THEN
    PERFORM 1 FROM public.customers WHERE id=v_customer AND organization_id=p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'cliente_no_encontrado' USING ERRCODE='P0002'; END IF;
  END IF;
  IF p_payload ? 'create_customer' THEN
    IF v_call.customer_id IS NOT NULL THEN
      RAISE EXCEPTION 'llamada_ya_tiene_cliente' USING ERRCODE='40001'; END IF;
    v_created:=public.fn_crm_insertar_cliente_preparado_core(p_org,p_payload->'create_customer');
    v_customer:=(v_created->>'id')::uuid;
  END IF;
  IF p_payload ? 'create_opportunity' THEN
    IF v_call.opportunity_id IS NOT NULL THEN
      RAISE EXCEPTION 'llamada_ya_tiene_oportunidad' USING ERRCODE='40001'; END IF;
    IF v_customer IS NULL OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_create_opp) k
      WHERE k NOT IN ('name','pipeline_id','stage_id','amount','currency')) THEN
      RAISE EXCEPTION 'vinculacion_invalida' USING ERRCODE='22023'; END IF;
    v_created:=public.crm_create_opportunity(p_org,v_create_opp||jsonb_build_object(
      'customer_id',v_customer,'origen','cliente','source','manual',
      'metadata',jsonb_build_object('created_from_call_id',p_call)));
    v_opportunity:=(v_created->>'id')::uuid;
  END IF;
  IF v_call.customer_id IS NOT NULL AND v_customer IS DISTINCT FROM v_call.customer_id
    OR v_call.opportunity_id IS NOT NULL AND v_opportunity IS DISTINCT FROM v_call.opportunity_id THEN
    RAISE EXCEPTION 'llamada_ya_vinculada' USING ERRCODE='40001'; END IF;
  UPDATE public.calls SET customer_id=v_customer,opportunity_id=v_opportunity,updated_at=now()
    WHERE id=p_call AND organization_id=p_org RETURNING * INTO v_call;
  v_sync:=public.fn_crm_sync_llamada_core(p_org,p_call);
  v_response:=jsonb_build_object('call',to_jsonb(v_call),'activity_id',v_sync->'activity_id');
  INSERT INTO public.crm_call_link_receipts(organization_id,actor_id,call_id,client_key,request_fingerprint,response)
    VALUES(p_org,v_actor,p_call,v_key,v_fingerprint,v_response);
  RETURN v_response;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_crm_vincular_llamada(integer,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_vincular_llamada(integer,uuid,text,jsonb) TO authenticated;

-- Cierre del atajo genérico: no permite fabricar historial de una llamada con
-- permiso de lectura. El cuerpo anterior se conserva exactamente en el rollback.
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
  -- Un historial vinculado se deriva exclusivamente del flujo atómico de llamadas.
  IF p_payload->>'call_id' IS NOT NULL OR v_meta ? 'call_id' THEN
    RAISE EXCEPTION 'actividad_gestionada_por_llamada' USING ERRCODE='22023';
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
        RAISE EXCEPTION 'reintento_con_datos_distintos' USING ERRCODE='23505'; END IF;
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

REVOKE ALL ON FUNCTION public.fn_crm_registrar_actividad(integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_registrar_actividad(integer,jsonb) TO authenticated;

-- Bloque para integrar al candidato; NO aplicado. Wrappers solo service role.
CREATE OR REPLACE FUNCTION public.fn_crm_guardar_consentimiento(p_org integer,p_call uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_call public.calls;
  v_consent public.call_consents;
  v_announced timestamptz;
  v_given boolean;
BEGIN
  IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN
    RAISE EXCEPTION 'solo_servicio' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('consent_type','consent_given','announced_at','method','locale','recorded_announcement_text'))
    OR jsonb_typeof(p_payload->'consent_given') IS DISTINCT FROM 'boolean'
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['consent_type','announced_at','method','locale']) k
      WHERE jsonb_typeof(p_payload->k) IS DISTINCT FROM 'string' OR nullif(btrim(p_payload->>k),'') IS NULL)
    OR (p_payload ? 'recorded_announcement_text' AND jsonb_typeof(p_payload->'recorded_announcement_text') NOT IN ('string','null')) THEN
    RAISE EXCEPTION 'consentimiento_invalido' USING ERRCODE='22023'; END IF;
  IF p_payload->>'announced_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' THEN
    RAISE EXCEPTION 'fecha_consentimiento_invalida' USING ERRCODE='22023'; END IF;
  v_announced:=(p_payload->>'announced_at')::timestamptz;
  v_given:=(p_payload->>'consent_given')::boolean;
  IF NOT isfinite(v_announced) OR v_announced>clock_timestamp() THEN
    RAISE EXCEPTION 'fecha_consentimiento_invalida' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_call FROM public.calls WHERE id=p_call AND organization_id=p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'llamada_no_encontrada' USING ERRCODE='P0002'; END IF;
  IF v_given AND p_payload->>'consent_type'='recording' AND
    (v_call.recording_enabled IS DISTINCT FROM true OR v_call.metadata->>'recording_absent_at' IS NOT NULL) THEN
    RAISE EXCEPTION 'grabacion_no_habilitada' USING ERRCODE='22023'; END IF;
  INSERT INTO public.call_consents(organization_id,call_id,consent_type,announced_at,method,locale,recorded_announcement_text)
    VALUES(p_org,p_call,p_payload->>'consent_type',v_announced,p_payload->>'method',p_payload->>'locale',p_payload->>'recorded_announcement_text')
    ON CONFLICT(organization_id,call_id,consent_type) DO NOTHING RETURNING * INTO v_consent;
  IF NOT FOUND THEN
    SELECT * INTO v_consent FROM public.call_consents
      WHERE organization_id=p_org AND call_id=p_call AND consent_type=p_payload->>'consent_type'; END IF;
  IF v_consent.id IS NULL THEN RAISE EXCEPTION 'acta_no_encontrada' USING ERRCODE='P0002'; END IF;
  IF v_given AND v_consent.method='unverified_announcement' THEN
    RAISE EXCEPTION 'aviso_no_acreditado' USING ERRCODE='22023'; END IF;
  IF v_given OR (p_payload->>'consent_type'='recording' AND v_consent.method='unverified_announcement') THEN
    UPDATE public.calls SET consent_given=v_given,updated_at=now()
      WHERE id=p_call AND organization_id=p_org RETURNING * INTO v_call;
    PERFORM public.fn_crm_sync_llamada_core(p_org,p_call);
  END IF;
  RETURN jsonb_build_object('consent',to_jsonb(v_consent),'call',to_jsonb(v_call));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_crm_guardar_consentimiento(integer,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_guardar_consentimiento(integer,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_crm_retirar_consentimiento(p_org integer,p_call uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_call public.calls;
BEGIN
  IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN
    RAISE EXCEPTION 'solo_servicio' USING ERRCODE='42501'; END IF;
  IF nullif(btrim(p_reason),'') IS NULL OR length(p_reason)>500 THEN
    RAISE EXCEPTION 'motivo_consentimiento_invalido' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_call FROM public.calls WHERE id=p_call AND organization_id=p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'llamada_no_encontrada' USING ERRCODE='P0002'; END IF;
  -- Relee la evidencia tras obtener el lock; una grabación ya registrada gana.
  IF EXISTS(SELECT 1 FROM public.call_recordings WHERE organization_id=p_org AND call_id=p_call) THEN
    RETURN jsonb_build_object('voided',false,'call',to_jsonb(v_call)); END IF;
  DELETE FROM public.call_consents WHERE organization_id=p_org AND call_id=p_call AND consent_type='recording';
  UPDATE public.calls SET consent_given=false,recording_enabled=false,updated_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('recording_absent_at',clock_timestamp(),'recording_absent_reason',p_reason)
    WHERE id=p_call AND organization_id=p_org RETURNING * INTO v_call;
  PERFORM public.fn_crm_sync_llamada_core(p_org,p_call);
  RETURN jsonb_build_object('voided',true,'call',to_jsonb(v_call));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_crm_retirar_consentimiento(integer,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_retirar_consentimiento(integer,uuid,text) TO service_role;
