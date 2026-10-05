-- CANDIDATO SIN APLICAR: alta con pasos y eliminación de configuración sin uso.
-- RPC de sesión. No cambia motor, policies, tablas ni datos al instalarse.
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='4s';

DO $secuencias_config_guard$
DECLARE v_expected jsonb; v_oid regprocedure;
BEGIN
 FOR v_expected IN SELECT value FROM jsonb_array_elements($secuencias_config_manifest$
[
  {
    "name": "fn_crm_create_sequence",
    "signature": "fn_crm_create_sequence(integer,jsonb)",
    "md5": "e25f34b6cc65dc56a570c89fc00c79b5"
  },
  {
    "name": "fn_crm_delete_sequence",
    "signature": "fn_crm_delete_sequence(integer,uuid)",
    "md5": "02f758864eb2cad36225b980e97cfc82"
  }
]
$secuencias_config_manifest$::jsonb) LOOP
  v_oid:=to_regprocedure('public.'||(v_expected->>'signature'));
  IF v_oid IS NOT NULL AND (SELECT md5(prosrc) FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM v_expected->>'md5' THEN
   RAISE EXCEPTION 'secuencias_configuracion_cambio: %',v_expected->>'name' USING ERRCODE='P0001';
  END IF;
 END LOOP;
END;$secuencias_config_guard$;

CREATE OR REPLACE FUNCTION public.fn_crm_create_sequence(p_org integer,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE
 v_actor uuid:=auth.uid(); v_sequence public.sequences;
 v_input jsonb; v_steps jsonb; v_raw jsonb; v_exit jsonb; v_condition jsonb;
 v_queue jsonb; v_item jsonb; v_node jsonb; v_child jsonb;
 v_depth integer; v_leaves integer; v_field text; v_operator text;
 v_pipeline uuid; v_stage uuid; v_stage_pipeline uuid; v_template uuid;
 v_number integer; v_numbers integer[]:='{}'::integer[]; v_key text;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'sin_sesion' USING ERRCODE='42501'; END IF;
 PERFORM public.fn_crm_exigir_permiso(p_org,ARRAY['admin.full_access','crm.campaigns.manage']);
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>262144
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k NOT IN
   ('name','description','trigger_type','trigger_config','exit_conditions','is_active','pause_on_reply','pipeline_id','stage_id','created_by','steps')) THEN
  RAISE EXCEPTION 'secuencia_invalida' USING ERRCODE='22023';
 END IF;
 IF jsonb_typeof(p_input->'name') IS DISTINCT FROM 'string'
  OR length(btrim(p_input->>'name')) NOT BETWEEN 2 AND 200 THEN
  RAISE EXCEPTION 'secuencia_invalida' USING ERRCODE='22023';
 END IF;
 IF p_input ? 'created_by' AND p_input->'created_by'<>'null'::jsonb
  AND (jsonb_typeof(p_input->'created_by')<>'string' OR (p_input->>'created_by')::uuid IS DISTINCT FROM v_actor) THEN
  RAISE EXCEPTION 'actor_invalido' USING ERRCODE='42501';
 END IF;
 v_input:=jsonb_build_object('trigger_type','manual','trigger_config','{}'::jsonb,
  'exit_conditions','[]'::jsonb,'is_active',true,'pause_on_reply',true)||p_input;
 IF jsonb_typeof(v_input->'trigger_type') IS DISTINCT FROM 'string'
  OR v_input->>'trigger_type' NOT IN ('manual','lead_capture','stage_change','event','custom')
  OR jsonb_typeof(v_input->'trigger_config') IS DISTINCT FROM 'object'
  OR jsonb_typeof(v_input->'exit_conditions') IS DISTINCT FROM 'array'
  OR jsonb_typeof(v_input->'is_active') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(v_input->'pause_on_reply') IS DISTINCT FROM 'boolean'
  OR (v_input ? 'description' AND v_input->'description'<>'null'::jsonb AND jsonb_typeof(v_input->'description')<>'string') THEN
  RAISE EXCEPTION 'secuencia_invalida' USING ERRCODE='22023';
 END IF;
 FOR v_exit IN SELECT value FROM jsonb_array_elements(v_input->'exit_conditions') LOOP
  IF (jsonb_typeof(v_exit)='string' AND v_exit #>> '{}' IN ('won_lost','opted_out'))
   OR (jsonb_typeof(v_exit)='object' AND v_exit->>'type' IN ('won_lost','opted_out')) THEN
   CONTINUE;
  END IF;
  RAISE EXCEPTION 'secuencia_invalida' USING ERRCODE='22023';
 END LOOP;
 FOREACH v_key IN ARRAY ARRAY['pipeline_id','stage_id'] LOOP
  IF v_input ? v_key AND v_input->v_key<>'null'::jsonb AND jsonb_typeof(v_input->v_key)<>'string' THEN
   RAISE EXCEPTION 'secuencia_invalida' USING ERRCODE='22023';
  END IF;
 END LOOP;
 v_pipeline:=(v_input->>'pipeline_id')::uuid; v_stage:=(v_input->>'stage_id')::uuid;
 IF v_pipeline IS NOT NULL THEN
  PERFORM p.id FROM public.pipelines p WHERE p.id=v_pipeline AND p.organization_id=p_org FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'pipeline_no_encontrado' USING ERRCODE='P0002'; END IF;
 END IF;
 IF v_stage IS NOT NULL THEN
  SELECT s.pipeline_id INTO v_stage_pipeline FROM public.stages s
   JOIN public.pipelines p ON p.id=s.pipeline_id AND p.organization_id=p_org
   WHERE s.id=v_stage FOR SHARE OF s,p NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'etapa_no_encontrada' USING ERRCODE='P0002'; END IF;
  IF v_pipeline IS NOT NULL AND v_pipeline IS DISTINCT FROM v_stage_pipeline THEN
   RAISE EXCEPTION 'secuencia_invalida' USING ERRCODE='22023';
  END IF;
 END IF;
 v_steps:=coalesce(p_input->'steps','[]'::jsonb);
 IF jsonb_typeof(v_steps)<>'array' OR jsonb_array_length(v_steps)>50 THEN
  RAISE EXCEPTION 'pasos_invalidos' USING ERRCODE='22023';
 END IF;
 -- La fila padre y todos sus pasos se confirman juntos. Un fallo revierte ambos.
 INSERT INTO public.sequences(organization_id,name,description,trigger_type,trigger_config,
  exit_conditions,is_active,pause_on_reply,pipeline_id,stage_id,created_by)
 VALUES(p_org,btrim(v_input->>'name'),v_input->>'description',v_input->>'trigger_type',
  v_input->'trigger_config',v_input->'exit_conditions',(v_input->>'is_active')::boolean,
  (v_input->>'pause_on_reply')::boolean,v_pipeline,v_stage,v_actor) RETURNING * INTO v_sequence;
 FOR v_raw IN SELECT value FROM jsonb_array_elements(v_steps) LOOP
  IF jsonb_typeof(v_raw)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_raw) k WHERE k NOT IN
    ('step_number','delay_days','delay_hours','channel','template_id','action_config','condition','continue_on_error','name','is_active'))
   OR jsonb_typeof(v_raw->'step_number') IS DISTINCT FROM 'number'
   OR jsonb_typeof(v_raw->'delay_days') IS DISTINCT FROM 'number'
   OR jsonb_typeof(v_raw->'channel') IS DISTINCT FROM 'string'
   OR v_raw->>'channel' NOT IN ('email','whatsapp','call','task','wait','condition') THEN
   RAISE EXCEPTION 'pasos_invalidos' USING ERRCODE='22023';
  END IF;
  v_raw:=jsonb_build_object('delay_hours',0,'action_config','{}'::jsonb,
   'continue_on_error',CASE WHEN v_raw->>'channel'='condition' THEN false ELSE true END,'is_active',true)||v_raw;
  FOREACH v_key IN ARRAY ARRAY['step_number','delay_days','delay_hours'] LOOP
   IF jsonb_typeof(v_raw->v_key) IS DISTINCT FROM 'number'
    OR (v_raw->>v_key)::numeric IS DISTINCT FROM trunc((v_raw->>v_key)::numeric) THEN
    RAISE EXCEPTION 'pasos_invalidos' USING ERRCODE='22023';
   END IF;
  END LOOP;
  v_number:=((v_raw->>'step_number')::numeric)::integer;
  IF v_number<1 OR v_number=ANY(v_numbers)
   OR ((v_raw->>'delay_days')::numeric)::integer NOT BETWEEN 0 AND 3650
   OR ((v_raw->>'delay_hours')::numeric)::integer NOT BETWEEN 0 AND 23
   OR jsonb_typeof(v_raw->'action_config') IS DISTINCT FROM 'object'
   OR jsonb_typeof(v_raw->'continue_on_error') IS DISTINCT FROM 'boolean'
   OR jsonb_typeof(v_raw->'is_active') IS DISTINCT FROM 'boolean'
   OR (v_raw ? 'name' AND v_raw->'name'<>'null'::jsonb AND jsonb_typeof(v_raw->'name')<>'string')
   OR (v_raw ? 'template_id' AND v_raw->'template_id'<>'null'::jsonb AND jsonb_typeof(v_raw->'template_id')<>'string') THEN
   RAISE EXCEPTION 'pasos_invalidos' USING ERRCODE='22023';
  END IF;
  v_numbers:=array_append(v_numbers,v_number);
  v_template:=nullif(v_raw->>'template_id','')::uuid;
  IF v_template IS NOT NULL THEN
   PERFORM t.id FROM public.templates t WHERE t.id=v_template AND t.organization_id=p_org FOR SHARE NOWAIT;
   IF NOT FOUND THEN RAISE EXCEPTION 'plantilla_no_encontrada' USING ERRCODE='P0002'; END IF;
  END IF;
  v_condition:=coalesce(nullif(v_raw->'condition','null'::jsonb),
   nullif(v_raw->'action_config'->'condition','null'::jsonb));
  IF v_condition IS NOT NULL AND jsonb_typeof(v_condition) NOT IN ('object','array') THEN
   RAISE EXCEPTION 'pasos_invalidos' USING ERRCODE='22023';
  END IF;
  -- Frontera de datos del RPC: misma forma/allow-list que conditionsDsl.ts.
  -- No evalúa las reglas ni decide el envío; el motor TypeScript sigue siendo único.
  v_queue:='[]'::jsonb; v_leaves:=0;
  IF v_condition IS NOT NULL THEN
   IF jsonb_typeof(v_condition)='array' THEN
    FOR v_child IN SELECT value FROM jsonb_array_elements(v_condition) LOOP
     v_queue:=v_queue||jsonb_build_array(jsonb_build_object('node',v_child,'depth',1));
    END LOOP;
   ELSIF v_condition ? 'op' THEN
    IF jsonb_typeof(v_condition->'op') IS DISTINCT FROM 'string' OR v_condition->>'op' NOT IN ('and','or')
     OR jsonb_typeof(v_condition->'rules') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'pasos_invalidos' USING ERRCODE='22023';
    END IF;
    FOR v_child IN SELECT value FROM jsonb_array_elements(v_condition->'rules') LOOP
     v_queue:=v_queue||jsonb_build_array(jsonb_build_object('node',v_child,'depth',1));
    END LOOP;
   ELSIF v_condition ? 'field' THEN
    v_queue:=jsonb_build_array(jsonb_build_object('node',v_condition,'depth',1));
   ELSIF v_condition<>'{}'::jsonb THEN
    RAISE EXCEPTION 'pasos_invalidos' USING ERRCODE='22023';
   END IF;
  END IF;
  WHILE jsonb_array_length(v_queue)>0 LOOP
   v_item:=v_queue->0; v_queue:=v_queue-0; v_node:=v_item->'node'; v_depth:=(v_item->>'depth')::integer;
   IF v_depth>6 OR jsonb_typeof(v_node) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'pasos_invalidos' USING ERRCODE='22023';
   END IF;
   IF v_node ? 'op' THEN
    IF jsonb_typeof(v_node->'op') IS DISTINCT FROM 'string' OR v_node->>'op' NOT IN ('and','or')
     OR jsonb_typeof(v_node->'rules') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'pasos_invalidos' USING ERRCODE='22023';
    END IF;
    FOR v_child IN SELECT value FROM jsonb_array_elements(v_node->'rules') LOOP
     v_queue:=v_queue||jsonb_build_array(jsonb_build_object('node',v_child,'depth',v_depth+1));
    END LOOP;
   ELSE
    v_field:=v_node->>'field'; v_operator:=v_node->>'operator';
    IF jsonb_typeof(v_node->'field') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_node->'operator') IS DISTINCT FROM 'string'
     OR NOT (v_field=ANY(ARRAY['opportunity.amount','opportunity.currency','opportunity.status','opportunity.temperature','opportunity.icp_band','opportunity.icp_fit_score','opportunity.score_total','opportunity.record_type','opportunity.source','opportunity.expected_close_date','opportunity.last_contact_at','opportunity.contact_channel','opportunity.contact_result','opportunity.deal_type','opportunity.name','opportunity.stage_id','opportunity.pipeline_id','customer.customer_type','customer.lifecycle_stage','customer.health_score','customer.tags','customer.company_size','customer.has_email','customer.has_phone','customer.email','customer.phone','customer.id','customer.full_name','customer.city','customer.status','customer.created_at','customer.last_contact_at','customer.last_seen_at','customer.vertical_id','customer.tags_count','customer.last_purchase_at','customer.purchased_category_ids','stage.id','stage.name','stage.position','stage.probability','stage.is_won','stage.is_lost','stage.sla_days','pipeline.id','pipeline.pipeline_type','consent.email','consent.whatsapp','consent.sms','consent.voice','event.event_type']::text[])
      OR (left(v_field,14)='event.payload.' AND length(v_field)>14))
     OR v_operator NOT IN ('eq','ne','gt','gte','lt','lte','in','not_in','contains','not_contains','is_null','is_not_null','before','after','within_days','starts_with','ends_with') THEN
     RAISE EXCEPTION 'pasos_invalidos' USING ERRCODE='22023';
    END IF;
    v_leaves:=v_leaves+1;
   END IF;
  END LOOP;
  IF v_raw->>'channel'='condition' THEN
   IF v_condition IS NULL OR v_leaves=0
    OR (v_raw->>'continue_on_error')::boolean THEN
    RAISE EXCEPTION 'pasos_invalidos' USING ERRCODE='22023';
   END IF;
  END IF;
  INSERT INTO public.sequence_steps(organization_id,sequence_id,step_number,delay_days,
   delay_hours,channel,template_id,action_config,condition,continue_on_error,name,is_active)
  VALUES(p_org,v_sequence.id,v_number,((v_raw->>'delay_days')::numeric)::integer,
   ((v_raw->>'delay_hours')::numeric)::integer,v_raw->>'channel',v_template,v_raw->'action_config',
   v_condition,CASE WHEN v_raw->>'channel'='condition' THEN false ELSE (v_raw->>'continue_on_error')::boolean END,
   v_raw->>'name',(v_raw->>'is_active')::boolean);
 END LOOP;
 RETURN to_jsonb(v_sequence)||jsonb_build_object('steps',coalesce((
  SELECT jsonb_agg(to_jsonb(s) ORDER BY s.step_number,s.id) FROM public.sequence_steps s
  WHERE s.sequence_id=v_sequence.id AND s.organization_id=p_org),'[]'::jsonb));
EXCEPTION
 WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'datos_invalidos' USING ERRCODE='22023';
 WHEN lock_not_available THEN
  RAISE EXCEPTION 'registro_cambio' USING ERRCODE='P0001';
END;$function$;
ALTER FUNCTION public.fn_crm_create_sequence(integer,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_crm_create_sequence(integer,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_create_sequence(integer,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_crm_delete_sequence(p_org integer,p_sequence_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sin_sesion' USING ERRCODE='42501'; END IF;
 PERFORM public.fn_crm_exigir_permiso(p_org,ARRAY['admin.full_access','crm.campaigns.manage']);
 IF p_sequence_id IS NULL THEN RAISE EXCEPTION 'secuencia_invalida' USING ERRCODE='22023'; END IF;
 -- Comparte el padre con FOR SHARE del inscriptor/reanudador; nunca espera en ciclos.
 PERFORM s.id FROM public.sequences s WHERE s.id=p_sequence_id AND s.organization_id=p_org FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Las FK antiguas no son compuestas por tenant. Sólo se lee la referencia al
 -- padre ya autorizado para impedir que una cascada borre datos incoherentes.
 PERFORM s.id FROM public.sequence_steps s WHERE s.sequence_id=p_sequence_id ORDER BY s.id FOR UPDATE NOWAIT;
 IF EXISTS(SELECT 1 FROM public.sequence_steps s WHERE s.sequence_id=p_sequence_id AND s.organization_id IS DISTINCT FROM p_org) THEN
  RAISE EXCEPTION 'secuencia_referencias_invalidas' USING ERRCODE='P0001';
 END IF;
 IF EXISTS(SELECT 1 FROM public.sequence_enrollments e WHERE e.sequence_id=p_sequence_id)
  OR EXISTS(SELECT 1 FROM public.sequence_step_runs r JOIN public.sequence_steps s ON s.id=r.step_id WHERE s.sequence_id=p_sequence_id) THEN
  RAISE EXCEPTION 'secuencia_con_historial' USING ERRCODE='P0001';
 END IF;
 -- Únicamente configuración sin uso: la FK elimina sus pasos dentro de esta TX.
 DELETE FROM public.sequences WHERE id=p_sequence_id AND organization_id=p_org;
 RETURN FOUND;
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'registro_cambio' USING ERRCODE='P0001';
END;$function$;
ALTER FUNCTION public.fn_crm_delete_sequence(integer,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_crm_delete_sequence(integer,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.fn_crm_delete_sequence(integer,uuid) TO authenticated;
DO $secuencias_config_post$
DECLARE v_expected jsonb; v_proc pg_proc;
BEGIN
 FOR v_expected IN SELECT value FROM jsonb_array_elements($secuencias_config_manifest$
[
  {
    "name": "fn_crm_create_sequence",
    "signature": "fn_crm_create_sequence(integer,jsonb)",
    "md5": "e25f34b6cc65dc56a570c89fc00c79b5"
  },
  {
    "name": "fn_crm_delete_sequence",
    "signature": "fn_crm_delete_sequence(integer,uuid)",
    "md5": "02f758864eb2cad36225b980e97cfc82"
  }
]
$secuencias_config_manifest$::jsonb) LOOP
  SELECT * INTO STRICT v_proc FROM pg_proc WHERE oid=to_regprocedure('public.'||(v_expected->>'signature'));
  IF md5(v_proc.prosrc) IS DISTINCT FROM v_expected->>'md5'
   OR v_proc.proowner::regrole::text<>'postgres' OR NOT v_proc.prosecdef
   OR v_proc.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]
   OR NOT has_function_privilege('authenticated',v_proc.oid,'EXECUTE')
   OR has_function_privilege('anon',v_proc.oid,'EXECUTE')
   OR has_function_privilege('service_role',v_proc.oid,'EXECUTE') THEN
   RAISE EXCEPTION 'secuencias_configuracion_contrato: %',v_expected->>'name' USING ERRCODE='P0001';
  END IF;
 END LOOP;
END;$secuencias_config_post$;
NOTIFY pgrst,'reload schema';
