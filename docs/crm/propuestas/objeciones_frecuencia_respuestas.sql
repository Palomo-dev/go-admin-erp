-- MCP: esquema y CHECK verificados el 2026-10-02. Expansión compatible.
CREATE TABLE IF NOT EXISTS public.objection_responses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 objection_id uuid NOT NULL REFERENCES public.objections(id) ON DELETE CASCADE,
 call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
 segment_id uuid NOT NULL REFERENCES public.call_transcript_segments(id) ON DELETE CASCADE,
 response_text text NOT NULL CHECK(length(response_text) BETWEEN 1 AND 5000),
 start_ms integer NOT NULL CHECK(start_ms>=0), advanced boolean NOT NULL,
 mined_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,objection_id,call_id,segment_id)
);
CREATE INDEX IF NOT EXISTS objection_responses_org_objection_idx ON public.objection_responses(organization_id,objection_id);
ALTER TABLE public.objection_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.objection_responses FROM anon,authenticated;
GRANT SELECT ON public.objection_responses TO authenticated;
GRANT ALL ON public.objection_responses TO service_role;
DROP POLICY IF EXISTS objection_responses_read ON public.objection_responses;
CREATE POLICY objection_responses_read ON public.objection_responses FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.organization_members om WHERE om.organization_id=objection_responses.organization_id AND om.user_id=auth.uid() AND om.is_active) AND EXISTS(
 SELECT 1 FROM public.calls c LEFT JOIN public.opportunities o ON o.id=c.opportunity_id AND o.organization_id=c.organization_id
 LEFT JOIN public.customers customer ON customer.id=c.customer_id AND customer.organization_id=c.organization_id
 WHERE c.id=call_id AND c.organization_id=objection_responses.organization_id
 AND (c.user_id=auth.uid() OR public.fn_crm_tiene_permiso(c.organization_id,'crm.calls.view_all'))
 AND public.app_branch_access(coalesce(o.branch_id::integer,customer.branch_id))));

-- Única definición de detección registrada + avance histórico; frecuencia y minería la reutilizan.
CREATE OR REPLACE FUNCTION public.crm_objection_hits(p_org integer,p_since timestamptz,p_until timestamptz,p_calls uuid[] DEFAULT NULL)
RETURNS TABLE(call_id uuid,objection_id uuid,quote text,started_at timestamptz,advanced boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH latest AS (
 SELECT DISTINCT ON(a.call_id) a.call_id,a.detected_objections FROM public.call_analyses a
 JOIN public.calls c ON c.id=a.call_id AND c.organization_id=p_org
 WHERE a.organization_id=p_org AND c.started_at>=p_since AND c.started_at<p_until
 AND (p_calls IS NULL OR c.id=ANY(p_calls)) ORDER BY a.call_id,a.created_at DESC,a.id DESC
 ), detections AS (
 SELECT l.call_id,d.value FROM latest l CROSS JOIN LATERAL jsonb_array_elements(
 CASE WHEN jsonb_typeof(l.detected_objections)='array' THEN l.detected_objections ELSE '[]'::jsonb END) d
 ), hits AS (
 SELECT DISTINCT ON(d.call_id,b.id) d.call_id,b.id objection_id,coalesce(d.value->>'quote','') quote
 FROM detections d JOIN public.objections b ON b.organization_id=p_org AND (
 d.value->>'objection_id'=b.id::text OR (nullif(d.value->>'objection_id','') IS NULL
 AND lower(trim(coalesce(d.value->>'label',CASE WHEN jsonb_typeof(d.value)='string' THEN d.value#>>'{}' END,'')))=lower(trim(b.title))))
 ORDER BY d.call_id,b.id,coalesce(d.value->>'quote','')
 ) SELECT h.call_id,h.objection_id,h.quote,c.started_at,
 EXISTS(SELECT 1 FROM public.opportunity_stage_history sh
 JOIN public.stages previous ON previous.id=sh.from_stage_id
 JOIN public.stages next ON next.id=sh.to_stage_id AND next.pipeline_id=previous.pipeline_id
 WHERE sh.organization_id=p_org AND sh.opportunity_id=c.opportunity_id
 AND sh.changed_at>coalesce(c.ended_at,c.started_at)
 AND previous.pipeline_id=o.pipeline_id
 AND next.position>previous.position AND coalesce(next.is_lost,false)=false
 AND (o.objection_id=h.objection_id OR EXISTS(SELECT 1 FROM public.opportunity_objections oo
 WHERE oo.organization_id=p_org AND oo.opportunity_id=o.id AND oo.objection_id=h.objection_id))) advanced
 FROM hits h JOIN public.calls c ON c.id=h.call_id AND c.organization_id=p_org
 LEFT JOIN public.opportunities o ON o.id=c.opportunity_id AND o.organization_id=p_org;
$$;
REVOKE ALL ON FUNCTION public.crm_objection_hits(integer,timestamptz,timestamptz,uuid[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_objection_frequency(p_org integer,p_since timestamptz,p_timezone text,p_objection uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 PERFORM public.fn_assert_acceso_org(p_org);
 IF p_since IS NULL OR p_since>now() OR p_since<now()-interval '92 days' OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN RAISE EXCEPTION 'periodo_invalido' USING errcode='22023'; END IF;
 IF p_objection IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.objections WHERE id=p_objection AND organization_id=p_org) THEN RAISE EXCEPTION 'objecion_no_encontrada' USING errcode='P0002'; END IF;
 WITH visible AS MATERIALIZED (
 SELECT h.*,c.opportunity_id FROM public.crm_objection_hits(p_org,p_since,now(),NULL) h
 JOIN public.calls c ON c.id=h.call_id AND c.organization_id=p_org
 LEFT JOIN public.opportunities o ON o.id=c.opportunity_id AND o.organization_id=p_org
 LEFT JOIN public.customers customer ON customer.id=c.customer_id AND customer.organization_id=p_org
 WHERE (p_objection IS NULL OR h.objection_id=p_objection)
 AND (c.user_id=auth.uid() OR public.fn_crm_tiene_permiso(p_org,'crm.calls.view_all'))
 AND public.app_branch_access(coalesce(o.branch_id::integer,customer.branch_id))
 ), totals AS (
 SELECT objection_id,count(*) call_count,count(*) FILTER(WHERE advanced) advanced_count,
 count(DISTINCT opportunity_id) opportunity_count,count(DISTINCT opportunity_id) FILTER(WHERE advanced) advanced_opportunity_count FROM visible GROUP BY objection_id
 ) SELECT jsonb_build_object(
 'frequencies',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM totals t),'[]'::jsonb),
 'weeks',coalesce((SELECT jsonb_agg(to_jsonb(w) ORDER BY week) FROM (
 SELECT to_char(date_trunc('week',started_at AT TIME ZONE p_timezone),'YYYY-MM-DD') week,count(*) call_count FROM visible GROUP BY 1) w),'[]'::jsonb),
 'calls',CASE WHEN p_objection IS NULL THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY started_at DESC,call_id) FROM (
 SELECT v.call_id,v.started_at,v.advanced,anchor.start_ms,
 coalesce(nullif(trim(concat_ws(' ',customer.first_name,customer.last_name)),''),c.to_number,c.from_number) customer_name,
 coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'') seller_name
 FROM visible v JOIN public.calls c ON c.id=v.call_id AND c.organization_id=p_org
 LEFT JOIN public.customers customer ON customer.id=c.customer_id AND customer.organization_id=p_org
 LEFT JOIN public.profiles p ON p.id=c.user_id
 LEFT JOIN LATERAL (SELECT s.start_ms FROM public.call_transcripts t JOIN public.call_transcript_segments s ON s.transcript_id=t.id AND s.organization_id=p_org
 WHERE t.call_id=c.id AND t.organization_id=p_org AND t.status='completed' AND s.speaker_role='customer' AND v.quote<>'' AND position(lower(v.quote) IN lower(s.text))>0 ORDER BY t.completed_at DESC,s.start_ms LIMIT 1) anchor ON true
 ORDER BY v.started_at DESC,v.call_id LIMIT 100) r),'[]'::jsonb) END,
 'responses',CASE WHEN p_objection IS NULL THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY advanced_count DESC,used_count DESC,response_text) FROM (
 SELECT min(btrim(r.response_text)) response_text,count(DISTINCT r.call_id) used_count,count(DISTINCT r.call_id) FILTER(WHERE v.advanced) advanced_count
 FROM public.objection_responses r JOIN visible v ON v.call_id=r.call_id AND v.objection_id=r.objection_id
 WHERE r.organization_id=p_org AND r.objection_id=p_objection
 GROUP BY lower(regexp_replace(btrim(r.response_text),'\s+',' ','g'))
 HAVING count(DISTINCT r.call_id) FILTER(WHERE v.advanced)>0 LIMIT 20) r),'[]'::jsonb) END
 ) INTO v_result;
 RETURN v_result;
END;$$;
REVOKE ALL ON FUNCTION public.crm_objection_frequency(integer,timestamptz,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_objection_frequency(integer,timestamptz,text,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_objection_mine(p_org integer,p_since timestamptz,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_calls uuid[];v_count integer;v_written integer;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND session_user NOT IN('postgres','supabase_admin') THEN RAISE EXCEPTION 'sin_permiso' USING errcode='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 OR p_since IS NULL OR p_since>now() OR p_since<now()-interval '92 days' THEN RAISE EXCEPTION 'pagina_invalida' USING errcode='22023'; END IF;
 SELECT array_agg(id ORDER BY id),count(*) INTO v_calls,v_count FROM (
 SELECT c.id FROM public.calls c WHERE c.organization_id=p_org AND c.started_at>=p_since AND c.started_at<now()
 AND (p_after IS NULL OR c.id>p_after) AND EXISTS(SELECT 1 FROM public.call_analyses a WHERE a.call_id=c.id AND a.organization_id=p_org)
 ORDER BY c.id LIMIT p_limit) page;
 IF v_count=0 THEN RETURN jsonb_build_object('processed',0,'written',0,'next',NULL); END IF;
 -- Only an attributed customer quote and the next attributed seller segment are eligible.
 WITH eligible AS MATERIALIZED (
 SELECT p_org organization_id,h.objection_id,h.call_id,reply.id segment_id,left(btrim(reply.text),5000) response_text,reply.start_ms,h.advanced,now() mined_at
 FROM public.crm_objection_hits(p_org,p_since,now(),v_calls) h
 JOIN LATERAL (SELECT t.id FROM public.call_transcripts t WHERE t.organization_id=p_org AND t.call_id=h.call_id AND t.status='completed' ORDER BY t.completed_at DESC,t.id DESC LIMIT 1) transcript ON true
 JOIN LATERAL (SELECT s.end_ms FROM public.call_transcript_segments s WHERE s.organization_id=p_org AND s.transcript_id=transcript.id AND s.speaker_role='customer' AND h.quote<>'' AND position(lower(h.quote) IN lower(s.text))>0 ORDER BY s.start_ms LIMIT 1) anchor ON true
 JOIN LATERAL (SELECT s.id,s.text,s.start_ms FROM public.call_transcript_segments s WHERE s.organization_id=p_org AND s.transcript_id=transcript.id AND s.speaker_role='agent' AND s.start_ms>=anchor.end_ms AND length(btrim(s.text))>0 ORDER BY s.start_ms,s.id LIMIT 1) reply ON true
 ), written AS (
 INSERT INTO public.objection_responses(organization_id,objection_id,call_id,segment_id,response_text,start_ms,advanced,mined_at) SELECT * FROM eligible
 ON CONFLICT(organization_id,objection_id,call_id,segment_id) DO UPDATE SET response_text=excluded.response_text,start_ms=excluded.start_ms,advanced=excluded.advanced,mined_at=excluded.mined_at RETURNING id
 ), stale AS (
 DELETE FROM public.objection_responses r WHERE r.organization_id=p_org AND r.call_id=ANY(v_calls)
 AND NOT EXISTS(SELECT 1 FROM eligible e WHERE e.organization_id=r.organization_id AND e.objection_id=r.objection_id AND e.call_id=r.call_id AND e.segment_id=r.segment_id) RETURNING r.id
 ) SELECT count(*) INTO v_written FROM written;
 RETURN jsonb_build_object('processed',v_count,'written',v_written,'next',v_calls[array_length(v_calls,1)]);
END;$$;
REVOKE ALL ON FUNCTION public.crm_objection_mine(integer,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_objection_mine(integer,timestamptz,uuid,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.crm_objection_register(p_org integer,p_opportunity uuid,p_objection uuid DEFAULT NULL,p_resolve uuid DEFAULT NULL,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_opportunity public.opportunities;v_link public.opportunity_objections;v_before jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sin_permiso' USING errcode='42501'; END IF;
 PERFORM public.fn_crm_exigir_permiso(p_org,ARRAY['crm.opportunities.edit']);
 SELECT * INTO v_opportunity FROM public.opportunities WHERE id=p_opportunity AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'oportunidad_no_encontrada' USING errcode='P0002'; END IF;
 IF public.app_branch_access(v_opportunity.branch_id::integer) IS NOT TRUE OR (v_opportunity.salesperson_id IS DISTINCT FROM auth.uid() AND NOT public.fn_crm_tiene_permiso(p_org,'crm.opportunities.edit_any')) THEN RAISE EXCEPTION 'sin_permiso' USING errcode='42501'; END IF;
 IF (p_objection IS NULL)=(p_resolve IS NULL) OR length(coalesce(p_notes,''))>280 THEN RAISE EXCEPTION 'datos_invalidos' USING errcode='22023'; END IF;
 IF p_resolve IS NOT NULL THEN
  SELECT * INTO v_link FROM public.opportunity_objections WHERE id=p_resolve AND organization_id=p_org AND opportunity_id=p_opportunity FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'objecion_no_encontrada' USING errcode='P0002'; END IF;
  v_before:=to_jsonb(v_link);
  UPDATE public.opportunity_objections SET resolved=true,resolved_at=now() WHERE id=v_link.id RETURNING * INTO v_link;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.objections WHERE id=p_objection AND organization_id=p_org AND is_active) THEN RAISE EXCEPTION 'objecion_no_encontrada' USING errcode='P0002'; END IF;
  SELECT to_jsonb(oo) INTO v_before FROM public.opportunity_objections oo WHERE organization_id=p_org AND opportunity_id=p_opportunity AND objection_id=p_objection;
  INSERT INTO public.opportunity_objections(organization_id,opportunity_id,objection_id,notes,detected_by,resolved)
  VALUES(p_org,p_opportunity,p_objection,nullif(trim(p_notes),''),'manual',false)
  ON CONFLICT(opportunity_id,objection_id) DO UPDATE SET notes=coalesce(excluded.notes,opportunity_objections.notes),detected_by='manual',resolved=false,resolved_at=NULL RETURNING * INTO v_link;
  UPDATE public.opportunities SET objection_id=p_objection,updated_at=now() WHERE id=p_opportunity AND organization_id=p_org;
 END IF;
 INSERT INTO public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 VALUES(p_org,'objection_registered','opportunity',p_opportunity,jsonb_build_object('actor_id',auth.uid(),'before',v_before,'after',to_jsonb(v_link)),'processed',now());
 RETURN to_jsonb(v_link);
END;$$;
REVOKE ALL ON FUNCTION public.crm_objection_register(integer,uuid,uuid,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.crm_objection_register(integer,uuid,uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_objection_catalog_write(p_org integer,p_id uuid,p_expected timestamptz,p_data jsonb,p_archive boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_before jsonb;v_after public.objections;v_now timestamptz:=clock_timestamp();v_value jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sin_permiso' USING errcode='42501'; END IF;
 PERFORM public.fn_crm_exigir_permiso(p_org,ARRAY['admin.full_access']);
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('title','category','detection_signals','recommended_response','discovery_questions','related_case_studies','vertical_id','is_active','sort_order')) THEN RAISE EXCEPTION 'datos_invalidos' USING errcode='22023'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT to_jsonb(b) INTO v_before FROM public.objections b WHERE id=p_id AND organization_id=p_org FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'objecion_no_encontrada' USING errcode='P0002'; END IF;
  IF p_expected IS NOT NULL AND (v_before->>'updated_at')::timestamptz IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'conflicto_version' USING errcode='40001'; END IF;
  p_data:=v_before||p_data;
 END IF;
 IF p_archive THEN p_data:=p_data||jsonb_build_object('is_active',false); END IF;
 IF length(trim(coalesce(p_data->>'title',''))) NOT BETWEEN 1 AND 120 OR length(trim(coalesce(p_data->>'category',''))) NOT BETWEEN 1 AND 80 OR length(coalesce(p_data->>'recommended_response',''))>5000 OR (p_data?'is_active' AND jsonb_typeof(p_data->'is_active')<>'boolean') OR coalesce((p_data->>'sort_order')::int,0) NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'datos_invalidos' USING errcode='22023'; END IF;
 FOR v_value IN SELECT value FROM jsonb_each(p_data) WHERE key IN('detection_signals','discovery_questions','related_case_studies') LOOP
  IF jsonb_typeof(v_value) NOT IN('null','array') THEN RAISE EXCEPTION 'listas_invalidas' USING errcode='22023'; END IF;
  IF jsonb_typeof(v_value)='array' AND (jsonb_array_length(v_value)>50 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_value) item WHERE jsonb_typeof(item)<>'string' OR length(item#>>'{}')>500)) THEN RAISE EXCEPTION 'listas_invalidas' USING errcode='22023'; END IF;
 END LOOP;
 IF p_id IS NULL THEN
  INSERT INTO public.objections(organization_id,title,category,detection_signals,recommended_response,discovery_questions,related_case_studies,vertical_id,is_active,sort_order)
  VALUES(p_org,trim(p_data->>'title'),trim(p_data->>'category'),coalesce(nullif(p_data->'detection_signals','null'::jsonb),'[]'::jsonb),p_data->>'recommended_response',coalesce(nullif(p_data->'discovery_questions','null'::jsonb),'[]'::jsonb),CASE WHEN jsonb_typeof(p_data->'related_case_studies')='array' THEN ARRAY(SELECT value FROM jsonb_array_elements_text(p_data->'related_case_studies')) ELSE NULL END,(p_data->>'vertical_id')::uuid,coalesce((p_data->>'is_active')::boolean,true),coalesce((p_data->>'sort_order')::int,0)) RETURNING * INTO v_after;
 ELSE
  UPDATE public.objections SET title=trim(p_data->>'title'),category=trim(p_data->>'category'),detection_signals=coalesce(nullif(p_data->'detection_signals','null'::jsonb),'[]'::jsonb),recommended_response=p_data->>'recommended_response',discovery_questions=coalesce(nullif(p_data->'discovery_questions','null'::jsonb),'[]'::jsonb),related_case_studies=CASE WHEN jsonb_typeof(p_data->'related_case_studies')='array' THEN ARRAY(SELECT value FROM jsonb_array_elements_text(p_data->'related_case_studies')) ELSE NULL END,vertical_id=(p_data->>'vertical_id')::uuid,is_active=coalesce((p_data->>'is_active')::boolean,true),sort_order=coalesce((p_data->>'sort_order')::int,0),updated_at=v_now WHERE id=p_id AND organization_id=p_org RETURNING * INTO v_after;
 END IF;
 INSERT INTO public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at) VALUES(p_org,'objection_catalog_changed','objection',v_after.id,jsonb_build_object('actor_id',auth.uid(),'before',v_before,'after',to_jsonb(v_after)),'processed',v_now);
 RETURN to_jsonb(v_after);
END;$$;
REVOKE ALL ON FUNCTION public.crm_objection_catalog_write(integer,uuid,timestamptz,jsonb,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.crm_objection_catalog_write(integer,uuid,timestamptz,jsonb,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
