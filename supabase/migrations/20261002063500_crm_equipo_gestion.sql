-- Compatible expansion only. Does not replace deployed RLS policies.
-- Schema characterized by Supabase MCP, project jgmgphmzusbluqhuqihj, 2026-10-02.
ALTER TABLE public.territories ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.crm_team_management_snapshot(p_org integer,p_actor uuid,p_start timestamptz,p_end timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_previous_sub text:=current_setting('request.jwt.claim.sub',true);v_result jsonb;
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' AND session_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'sin_permiso' USING errcode='42501'; END IF;
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_org AND user_id=p_actor AND is_active=true) THEN RAISE EXCEPTION 'sin_permiso' USING errcode='42501'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>interval '32 days' THEN RAISE EXCEPTION 'periodo_invalido' USING errcode='22023'; END IF;
 -- Bind the already validated human actor while evaluating the canonical branch helper.
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 v_result:=jsonb_build_object(
  'teams',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.name,t.id) FROM public.sales_teams t WHERE t.organization_id=p_org),'[]'::jsonb),
  'members',coalesce((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('name',coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.email),'role_name',r.name) ORDER BY m.created_at,m.id) FROM public.sales_team_members m JOIN public.profiles p ON p.id=m.user_id JOIN public.organization_members om ON om.user_id=m.user_id AND om.organization_id=p_org AND om.is_active=true LEFT JOIN public.sales_roles r ON r.id=m.sales_role_id AND r.organization_id=p_org WHERE m.organization_id=p_org),'[]'::jsonb),
  'territories',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_order,t.id) FROM public.territories t WHERE t.organization_id=p_org),'[]'::jsonb),
  'roles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) ORDER BY r.sort_order,r.id) FROM public.sales_roles r WHERE r.organization_id=p_org AND r.is_active=true),'[]'::jsonb),
  'people',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.email)) ORDER BY p.id) FROM public.organization_members m JOIN public.profiles p ON p.id=m.user_id WHERE m.organization_id=p_org AND m.is_active=true),'[]'::jsonb),
  'won',coalesce((SELECT jsonb_agg(jsonb_build_object('salesperson_id',o.salesperson_id,'amount',o.amount,'currency',o.currency,'closed_at',o.closed_at)) FROM public.opportunities o WHERE o.organization_id=p_org AND public.app_branch_access(o.branch_id::integer) AND o.status='won' AND o.closed_at>=p_start AND o.closed_at<p_end),'[]'::jsonb),
  'metrics',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT m.user_id,
    (SELECT count(*) FROM public.calls c LEFT JOIN public.opportunities o ON o.id=c.opportunity_id AND o.organization_id=p_org LEFT JOIN public.customers customer ON customer.id=c.customer_id AND customer.organization_id=p_org WHERE c.organization_id=p_org AND public.app_branch_access(coalesce(o.branch_id::integer,customer.branch_id)) AND c.user_id=m.user_id AND c.started_at>=p_start AND c.started_at<p_end) calls,
    (SELECT count(*) FROM public.calendar_events e WHERE e.organization_id=p_org AND public.app_branch_access(e.branch_id) AND e.assigned_to=m.user_id AND e.event_type='meeting' AND e.status='confirmed' AND e.start_at>=p_start AND e.start_at<p_end) meetings,
    (SELECT count(*) FROM public.opportunities o WHERE o.organization_id=p_org AND public.app_branch_access(o.branch_id::integer) AND o.salesperson_id=m.user_id AND o.status='won' AND o.closed_at>=p_start AND o.closed_at<p_end) won_count,
    (SELECT count(*) FROM public.opportunities o WHERE o.organization_id=p_org AND public.app_branch_access(o.branch_id::integer) AND o.salesperson_id=m.user_id AND o.status='lost' AND o.closed_at>=p_start AND o.closed_at<p_end) lost_count,
    (SELECT avg(extract(epoch FROM (o.closed_at-o.created_at))/86400) FROM public.opportunities o WHERE o.organization_id=p_org AND public.app_branch_access(o.branch_id::integer) AND o.salesperson_id=m.user_id AND o.status='won' AND o.closed_at>=p_start AND o.closed_at<p_end AND o.closed_at>=o.created_at) cycle_days
    FROM public.organization_members m WHERE m.organization_id=p_org AND m.is_active=true) x),'[]'::jsonb),
  'assignment',(SELECT jsonb_build_object('settings',s.settings,'updated_at',s.updated_at) FROM public.organization_settings s WHERE s.organization_id=p_org AND s.key='crm_lead_assignment'),
  'ranking_enabled',coalesce((SELECT (s.settings->>'enabled')::boolean FROM public.organization_settings s WHERE s.organization_id=p_org AND s.key='crm_team_ranking'),true),
  'rates',coalesce((SELECT jsonb_agg(jsonb_build_object('base_currency',r.base_currency,'target_currency',r.target_currency,'rate',r.rate,'effective_date',r.effective_date) ORDER BY r.effective_date,r.id) FROM public.exchange_rates r WHERE r.organization_id=p_org),'[]'::jsonb)
 );
 PERFORM set_config('request.jwt.claim.sub',coalesce(v_previous_sub,''),true);
 RETURN v_result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('request.jwt.claim.sub',coalesce(v_previous_sub,''),true);
 RAISE;
END; $$;
REVOKE ALL ON FUNCTION public.crm_team_management_snapshot(integer,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_team_management_snapshot(integer,uuid,timestamptz,timestamptz) TO service_role;
-- Reuses the canonical Segment context. TS evaluates its DSL once, never a second SQL rule engine.
CREATE OR REPLACE FUNCTION public.crm_territory_counts(p_org integer,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 500,p_as_of timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_customers jsonb;
BEGIN
 PERFORM public.fn_crm_exigir_permiso(p_org,ARRAY['crm.customers.view']);
 v_customers:=public.crm_segment_context_page(p_org,p_after,p_limit,NULL,p_as_of,NULL);
 RETURN jsonb_build_object('customers',(SELECT coalesce(jsonb_agg(value||jsonb_build_object('branches_count',c.branches_count,'current_software',c.current_software)),'[]'::jsonb) FROM jsonb_array_elements(v_customers) value JOIN public.customers c ON c.id=(value->>'id')::uuid AND c.organization_id=p_org),'opportunities',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT o.customer_id,count(*) opportunity_count FROM public.opportunities o WHERE o.organization_id=p_org AND public.app_branch_access(o.branch_id::integer) AND o.customer_id IN(SELECT (value->>'id')::uuid FROM jsonb_array_elements(v_customers)) GROUP BY o.customer_id) x),'[]'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.crm_territory_counts(integer,uuid,integer,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_territory_counts(integer,uuid,integer,timestamptz) TO authenticated,service_role;
-- Input validation only. Evaluation stays in the shared TS Segment/ICP engines.
CREATE OR REPLACE FUNCTION public.crm_validate_territory_criteria(p_value jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE v_node jsonb;v_depth integer;v_leaves integer:=0;v_rule jsonb;
BEGIN
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR octet_length(p_value::text)>65536 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_value) k WHERE k NOT IN('filter','rules','assigned_user_id')) THEN RAISE EXCEPTION 'criterios_invalidos' USING errcode='22023'; END IF;
 IF p_value ? 'filter' AND p_value ? 'rules' THEN RAISE EXCEPTION 'criterios_invalidos' USING errcode='22023'; END IF;
 IF p_value ? 'filter' THEN
  FOR v_node,v_depth IN WITH RECURSIVE tree(node,depth) AS (
   SELECT p_value->'filter',0 UNION ALL
   SELECT child.value,tree.depth+1 FROM tree CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(tree.node->'rules')='array' THEN tree.node->'rules' ELSE '[]'::jsonb END) child WHERE tree.depth<7
  ) SELECT node,depth FROM tree LOOP
   IF v_depth>6 OR jsonb_typeof(v_node) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'criterios_invalidos' USING errcode='22023'; END IF;
   IF v_node ? 'op' THEN
    IF coalesce(v_node->>'op','') NOT IN('and','or') OR jsonb_typeof(v_node->'rules') IS DISTINCT FROM 'array' OR jsonb_array_length(v_node->'rules')>50 OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_node) k WHERE k NOT IN('op','rules')) THEN RAISE EXCEPTION 'criterios_invalidos' USING errcode='22023'; END IF;
   ELSE
    v_leaves:=v_leaves+1;
    IF v_leaves>50 OR coalesce(v_node->>'field','') NOT IN('customer.customer_type','customer.lifecycle_stage','customer.health_score','customer.tags','customer.company_size','customer.has_email','customer.has_phone','customer.email','customer.phone','customer.id','customer.full_name','customer.city','customer.status','customer.created_at','customer.last_contact_at','customer.last_seen_at','customer.vertical_id','customer.tags_count','customer.last_purchase_at','customer.purchased_category_ids','consent.email','consent.whatsapp','consent.sms','consent.voice') OR coalesce(v_node->>'operator','') NOT IN('eq','ne','gt','gte','lt','lte','in','not_in','contains','not_contains','is_null','is_not_null','before','after','within_days','starts_with','ends_with') OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_node) k WHERE k NOT IN('field','operator','value')) THEN RAISE EXCEPTION 'criterios_invalidos' USING errcode='22023'; END IF;
    IF v_node->>'operator' IN('in','not_in') AND jsonb_typeof(v_node->'value') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'criterios_invalidos' USING errcode='22023'; END IF;
    IF v_node->>'operator' NOT IN('is_null','is_not_null') AND (NOT (v_node ? 'value') OR jsonb_typeof(v_node->'value') NOT IN('null','boolean','number','string','array')) THEN RAISE EXCEPTION 'criterios_invalidos' USING errcode='22023'; END IF;
   END IF;
  END LOOP;
 ELSIF p_value ? 'rules' THEN
  IF jsonb_typeof(p_value->'rules') IS DISTINCT FROM 'array' OR jsonb_array_length(p_value->'rules')>50 THEN RAISE EXCEPTION 'criterios_invalidos' USING errcode='22023'; END IF;
  FOR v_rule IN SELECT value FROM jsonb_array_elements(p_value->'rules') LOOP
   IF jsonb_typeof(v_rule) IS DISTINCT FROM 'object' OR coalesce(v_rule->>'field_key','') NOT IN('customers.company_size','customers.branches_count','customers.current_software','customers.lifecycle_stage','customers.city','customers.vertical_id','opportunities.amount','opportunities.currency','opportunities.deal_type') OR coalesce(v_rule->>'operator','') NOT IN('eq','neq','gt','gte','lt','lte','in','not_in','contains','starts_with') OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_rule) k WHERE k NOT IN('field_key','operator','value','weight','is_required')) THEN RAISE EXCEPTION 'criterios_invalidos' USING errcode='22023'; END IF;
  END LOOP;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.crm_validate_territory_criteria(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.crm_team_management_write(p_org integer,p_actor uuid,p_kind text,p_id uuid,p_expected timestamptz,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_before jsonb;v_after jsonb;v_id uuid;v_now timestamptz:=clock_timestamp();v_ref uuid;v_team uuid;
BEGIN
 IF auth.uid() IS NULL OR p_actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'actor_invalido' USING errcode='42501'; END IF;
 PERFORM public.fn_crm_exigir_permiso(p_org,ARRAY['crm.leads.assign']);
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR p_kind NOT IN('team','member','territory','assignment') THEN RAISE EXCEPTION 'datos_invalidos' USING errcode='22023'; END IF;
 IF p_kind='assignment' THEN
  IF NOT public.fn_crm_tiene_permiso(p_org,'admin.full_access') THEN RAISE EXCEPTION 'sin_permiso' USING errcode='42501'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('enabled','strategy','team_id')) OR jsonb_typeof(p_data->'enabled') IS DISTINCT FROM 'boolean' OR coalesce(p_data->>'strategy','') NOT IN('round_robin','territory','load_balance') THEN RAISE EXCEPTION 'datos_invalidos' USING errcode='22023'; END IF;
  v_team:=(p_data->>'team_id')::uuid;
  IF v_team IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sales_teams WHERE organization_id=p_org AND id=v_team AND is_active=true) THEN RAISE EXCEPTION 'equipo_invalido' USING errcode='22023'; END IF;
  IF (p_data->>'enabled')::boolean AND p_data->>'strategy'='territory' AND NOT EXISTS(SELECT 1 FROM public.territories WHERE organization_id=p_org AND is_active=true) THEN RAISE EXCEPTION 'territorios_requeridos' USING errcode='22023'; END IF;
  PERFORM pg_advisory_xact_lock(9142,p_org);
  SELECT to_jsonb(s) INTO v_before FROM public.organization_settings s WHERE organization_id=p_org AND key='crm_lead_assignment' FOR UPDATE;
  IF (v_before->>'updated_at')::timestamptz IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'conflicto_version' USING errcode='40001'; END IF;
  INSERT INTO public.organization_settings(organization_id,key,settings,updated_at) VALUES(p_org,'crm_lead_assignment',p_data,v_now) ON CONFLICT(organization_id,key) DO UPDATE SET settings=excluded.settings,updated_at=excluded.updated_at RETURNING to_jsonb(organization_settings.*) INTO v_after;
 ELSIF p_kind='team' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('name','description','is_active','territory_id')) THEN RAISE EXCEPTION 'datos_invalidos' USING errcode='22023'; END IF;
  IF length(trim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 120 OR length(coalesce(p_data->>'description',''))>1000 OR jsonb_typeof(p_data->'is_active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'datos_invalidos' USING errcode='22023'; END IF;
  v_ref:=(p_data->>'territory_id')::uuid;
  IF v_ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.territories WHERE organization_id=p_org AND id=v_ref AND (is_active=true OR NOT (p_data->>'is_active')::boolean)) THEN RAISE EXCEPTION 'territorio_invalido' USING errcode='22023'; END IF;
  IF p_id IS NOT NULL THEN
   SELECT to_jsonb(t) INTO v_before FROM public.sales_teams t WHERE id=p_id AND organization_id=p_org FOR UPDATE;
   IF v_before IS NULL THEN RAISE EXCEPTION 'equipo_no_encontrado' USING errcode='P0002'; END IF;
   IF p_expected IS NULL OR (v_before->>'updated_at')::timestamptz IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'conflicto_version' USING errcode='40001'; END IF;
   UPDATE public.sales_teams SET name=trim(p_data->>'name'),description=p_data->>'description',is_active=(p_data->>'is_active')::boolean,territory_id=v_ref,updated_at=v_now WHERE id=p_id AND organization_id=p_org RETURNING to_jsonb(sales_teams.*) INTO v_after;
   IF NOT (p_data->>'is_active')::boolean THEN UPDATE public.sales_team_members SET is_active=false,updated_at=v_now WHERE organization_id=p_org AND sales_team_id=p_id AND is_active=true; END IF;
  ELSE INSERT INTO public.sales_teams(organization_id,name,description,is_active,territory_id) VALUES(p_org,trim(p_data->>'name'),p_data->>'description',(p_data->>'is_active')::boolean,v_ref) RETURNING to_jsonb(sales_teams.*) INTO v_after; END IF;
 ELSIF p_kind='member' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('sales_team_id','user_id','sales_role_id','territory_id','quota_amount','quota_currency','is_active')) OR jsonb_typeof(p_data->'is_active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'datos_invalidos' USING errcode='22023'; END IF;
  v_team:=(p_data->>'sales_team_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.sales_teams WHERE organization_id=p_org AND id=v_team AND (is_active=true OR NOT (p_data->>'is_active')::boolean)) OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_org AND user_id=(p_data->>'user_id')::uuid AND is_active=true) THEN RAISE EXCEPTION 'miembro_invalido' USING errcode='22023'; END IF;
  IF p_data->>'sales_role_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sales_roles WHERE organization_id=p_org AND id=(p_data->>'sales_role_id')::uuid AND is_active=true) THEN RAISE EXCEPTION 'rol_invalido' USING errcode='22023'; END IF;
  IF p_data->>'territory_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.territories WHERE organization_id=p_org AND id=(p_data->>'territory_id')::uuid AND is_active=true) THEN RAISE EXCEPTION 'territorio_invalido' USING errcode='22023'; END IF;
  IF (p_data->>'quota_amount')::numeric<0 OR (p_data->>'quota_amount')::numeric>1e15 OR NOT EXISTS(SELECT 1 FROM public.organization_currencies WHERE organization_id=p_org AND currency_code=p_data->>'quota_currency') THEN RAISE EXCEPTION 'cuota_invalida' USING errcode='22023'; END IF;
  IF p_id IS NOT NULL THEN
   SELECT to_jsonb(m) INTO v_before FROM public.sales_team_members m WHERE id=p_id AND organization_id=p_org FOR UPDATE;
   IF v_before IS NULL THEN RAISE EXCEPTION 'miembro_no_encontrado' USING errcode='P0002'; END IF;
   IF p_expected IS NULL OR (v_before->>'updated_at')::timestamptz IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'conflicto_version' USING errcode='40001'; END IF;
   UPDATE public.sales_team_members SET sales_team_id=v_team,user_id=(p_data->>'user_id')::uuid,sales_role_id=(p_data->>'sales_role_id')::uuid,territory_id=(p_data->>'territory_id')::uuid,quota_amount=(p_data->>'quota_amount')::numeric,quota_currency=p_data->>'quota_currency',is_active=(p_data->>'is_active')::boolean,updated_at=v_now WHERE id=p_id AND organization_id=p_org RETURNING to_jsonb(sales_team_members.*) INTO v_after;
  ELSE INSERT INTO public.sales_team_members(organization_id,sales_team_id,user_id,sales_role_id,territory_id,quota_amount,quota_currency,is_active) VALUES(p_org,v_team,(p_data->>'user_id')::uuid,(p_data->>'sales_role_id')::uuid,(p_data->>'territory_id')::uuid,(p_data->>'quota_amount')::numeric,p_data->>'quota_currency',(p_data->>'is_active')::boolean) RETURNING to_jsonb(sales_team_members.*) INTO v_after; END IF;
 ELSE
  PERFORM public.crm_validate_territory_criteria(p_data->'criteria');
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('name','criteria','is_active','sort_order')) OR length(trim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 120 OR jsonb_typeof(p_data->'is_active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_data->'criteria') IS DISTINCT FROM 'object' OR (p_data->'criteria' ? 'filter' AND jsonb_typeof(p_data->'criteria'->'filter') IS DISTINCT FROM 'object') OR (p_data->'criteria' ? 'rules' AND jsonb_typeof(p_data->'criteria'->'rules') IS DISTINCT FROM 'array') OR (p_data->'criteria' ? 'filter' AND p_data->'criteria' ? 'rules') OR jsonb_typeof(p_data->'sort_order') IS DISTINCT FROM 'number' OR (p_data->>'sort_order')::int NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'datos_invalidos' USING errcode='22023'; END IF;
  IF p_data->'criteria'->>'assigned_user_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_org AND user_id=(p_data->'criteria'->>'assigned_user_id')::uuid AND is_active=true) THEN RAISE EXCEPTION 'miembro_invalido' USING errcode='22023'; END IF;
  IF p_id IS NOT NULL THEN
   SELECT to_jsonb(t) INTO v_before FROM public.territories t WHERE id=p_id AND organization_id=p_org FOR UPDATE;
   IF v_before IS NULL THEN RAISE EXCEPTION 'territorio_no_encontrado' USING errcode='P0002'; END IF;
   IF p_expected IS NULL OR (v_before->>'updated_at')::timestamptz IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'conflicto_version' USING errcode='40001'; END IF;
   UPDATE public.territories SET name=trim(p_data->>'name'),criteria=p_data->'criteria',is_active=(p_data->>'is_active')::boolean,sort_order=(p_data->>'sort_order')::int,updated_at=v_now WHERE id=p_id AND organization_id=p_org RETURNING to_jsonb(territories.*) INTO v_after;
  ELSE INSERT INTO public.territories(organization_id,name,criteria,is_active,sort_order) VALUES(p_org,trim(p_data->>'name'),p_data->'criteria',(p_data->>'is_active')::boolean,(p_data->>'sort_order')::int) RETURNING to_jsonb(territories.*) INTO v_after; END IF;
 END IF;
 v_id:=(v_after->>'id')::uuid;
 INSERT INTO public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at) VALUES(p_org,'team_structure_changed',p_kind,v_id,jsonb_build_object('actor_id',p_actor,'before',v_before,'after',v_after),'processed',v_now);
 RETURN v_after;
END; $$;
REVOKE ALL ON FUNCTION public.crm_team_management_write(integer,uuid,text,uuid,timestamptz,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.crm_team_management_write(integer,uuid,text,uuid,timestamptz,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
