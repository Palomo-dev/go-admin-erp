-- Restaurar la definición verificada anterior, sin borrar datos de bajas ya registradas.
CREATE OR REPLACE FUNCTION public.fn_crm_disponer_llamada(p_org integer, p_call uuid, p_key text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- El núcleo privado PHONE comparte el alcance de tenant/sucursal.
  PERFORM public.fn_phone_assert_call_scope_core(p_org,p_call);
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
$function$
;
REVOKE ALL ON FUNCTION public.fn_crm_disponer_llamada(integer,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_crm_disponer_llamada(integer,uuid,text,jsonb) TO authenticated;
