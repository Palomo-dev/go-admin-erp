-- Expansion compatible. Prepared values come only from the existing server TS engines.
-- Supabase MCP schema verified on 2026-10-02, project jgmgphmzusbluqhuqihj.
CREATE UNIQUE INDEX IF NOT EXISTS partner_deals_active_opportunity_org_unique ON public.partner_deals(organization_id,partner_id,opportunity_id) WHERE commission_status<>'rejected';

CREATE OR REPLACE FUNCTION public.fn_crm_red_actor_sucursal(p_org integer,p_actor uuid,p_code text,p_branch integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_sub text:=current_setting('request.jwt.claim.sub',true);
BEGIN
 PERFORM public.fn_crm_exigir_permiso_actor(p_org,p_actor,p_code);
 IF p_branch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch AND organization_id=p_org) THEN RAISE EXCEPTION 'sucursal_ajena' USING errcode='42501'; END IF;
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 IF public.app_branch_access(p_branch) IS DISTINCT FROM true THEN RAISE EXCEPTION 'sucursal_sin_permiso' USING errcode='42501'; END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true); RAISE;
END; $$;
REVOKE ALL ON FUNCTION public.fn_crm_red_actor_sucursal(integer,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_crm_referido_base(p_org integer,p_actor uuid,p_referral uuid,p_customer uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_r public.referrals%rowtype;v_c public.customers%rowtype;v_branch integer;
BEGIN
 PERFORM public.fn_crm_exigir_permiso_actor(p_org,p_actor,'crm.leads.create');
 SELECT * INTO v_r FROM public.referrals WHERE id=p_referral AND organization_id=p_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'referido_no_encontrado' USING errcode='P0002'; END IF;
 SELECT branch_id INTO v_branch FROM public.customers WHERE id=v_r.referrer_customer_id AND organization_id=p_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'referidor_ajeno' USING errcode='42501'; END IF;
 PERFORM public.fn_crm_red_actor_sucursal(p_org,p_actor,'crm.leads.create',v_branch);
 IF v_r.program_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.referral_programs WHERE id=v_r.program_id AND organization_id=p_org) THEN RAISE EXCEPTION 'programa_ajeno' USING errcode='42501'; END IF;
 IF p_customer IS NOT NULL THEN
  SELECT * INTO v_c FROM public.customers WHERE id=p_customer AND organization_id=p_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'cliente_no_encontrado' USING errcode='P0002'; END IF;
  PERFORM public.fn_crm_red_actor_sucursal(p_org,p_actor,'crm.leads.create',v_c.branch_id);
 END IF;
 RETURN jsonb_build_object('referral',to_jsonb(v_r),'customer',CASE WHEN p_customer IS NULL THEN NULL ELSE to_jsonb(v_c) END,
  'profiles',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('criteria',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.icp_criteria c WHERE c.icp_profile_id=p.id AND c.organization_id=p_org),'[]'::jsonb)) ORDER BY p.priority DESC,p.id) FROM public.icp_profiles p WHERE p.organization_id=p_org AND p.is_active=true),'[]'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.fn_crm_referido_base(integer,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crm_referido_base(integer,uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_crm_convertir_referido(p_org integer,p_actor uuid,p_referral uuid,p_customer uuid,p_expected jsonb,p_new_customer jsonb,p_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_r public.referrals%rowtype;v_c public.customers%rowtype;v_patch public.customers%rowtype;v_id uuid;v_new boolean:=p_customer IS NULL;v_current jsonb;v_sub text:=current_setting('request.jwt.claim.sub',true);
BEGIN
 PERFORM public.fn_crm_exigir_permiso_actor(p_org,p_actor,'crm.leads.create');
 IF jsonb_typeof(p_expected) IS DISTINCT FROM 'object' OR jsonb_typeof(p_changes) IS DISTINCT FROM 'object' OR octet_length(p_changes::text)>65536
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_changes) k WHERE k NOT IN('lead_source','owner_id','metadata','lead_discarded_at','lead_discard_reason','lead_discarded_by','updated_at','lead_score','icp_band')) THEN RAISE EXCEPTION 'datos_lead_invalidos' USING errcode='22023'; END IF;
 SELECT * INTO v_r FROM public.referrals WHERE id=p_referral AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'referido_no_encontrado' USING errcode='P0002'; END IF;
 IF v_r.status<>'qualified' OR v_r.referred_customer_id IS NOT NULL OR v_r.opportunity_id IS NOT NULL THEN RAISE EXCEPTION 'referido_ya_vinculado_o_no_calificado' USING errcode='P0001'; END IF;
 PERFORM 1 FROM public.customers WHERE organization_id=p_org AND id IN(v_r.referrer_customer_id,p_customer) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.referral_programs WHERE organization_id=p_org AND id=v_r.program_id FOR SHARE;
 PERFORM 1 FROM public.icp_profiles WHERE organization_id=p_org ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.icp_criteria WHERE organization_id=p_org ORDER BY id FOR SHARE;
 v_current:=public.fn_crm_referido_base(p_org,p_actor,p_referral,p_customer);
 IF v_current IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'referido_contexto_modificado' USING errcode='40001'; END IF;
 IF v_new THEN
  IF jsonb_typeof(p_new_customer) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'cliente_preparado_invalido' USING errcode='22023'; END IF;
  PERFORM public.fn_crm_red_actor_sucursal(p_org,p_actor,'crm.leads.create',(p_new_customer->>'branch_id')::integer);
  -- The public wrapper delegates to the only prepared-customer core; no duplicate INSERT engine.
  PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
  v_current:=public.fn_crm_insertar_cliente_preparado(p_org,p_new_customer);
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  v_id:=(v_current->>'id')::uuid;
 ELSE
  IF p_new_customer IS NOT NULL THEN RAISE EXCEPTION 'cliente_preparado_invalido' USING errcode='22023'; END IF;
  v_id:=p_customer;
 END IF;
 SELECT * INTO STRICT v_c FROM public.customers WHERE id=v_id AND organization_id=p_org FOR UPDATE;
 SELECT * INTO v_patch FROM jsonb_populate_record(NULL::public.customers,p_changes);
 IF v_patch.lead_source IS NULL OR v_patch.lead_source IS DISTINCT FROM coalesce(v_c.lead_source,'referral') OR v_patch.owner_id IS DISTINCT FROM coalesce(v_c.owner_id,v_patch.owner_id)
 OR jsonb_typeof(v_patch.metadata) IS DISTINCT FROM 'object' OR jsonb_typeof(v_patch.metadata->'lead') IS DISTINCT FROM 'object'
 OR v_patch.updated_at IS NULL OR abs(extract(epoch FROM (v_patch.updated_at-now())))>300 OR v_patch.lead_discarded_at IS NOT NULL OR v_patch.lead_discard_reason IS NOT NULL OR v_patch.lead_discarded_by IS NOT NULL
 OR (p_changes ? 'lead_score' AND (v_patch.lead_score IS NULL OR v_patch.lead_score NOT BETWEEN 0 AND 100)) THEN RAISE EXCEPTION 'datos_lead_invalidos' USING errcode='22023'; END IF;
 IF v_patch.owner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_org AND user_id=v_patch.owner_id AND is_active=true) THEN RAISE EXCEPTION 'responsable_ajeno_o_inactivo' USING errcode='42501'; END IF;
 UPDATE public.customers SET lead_source=v_patch.lead_source,owner_id=v_patch.owner_id,metadata=v_patch.metadata,lead_discarded_at=NULL,lead_discard_reason=NULL,lead_discarded_by=NULL,updated_at=v_patch.updated_at,
  lead_score=CASE WHEN p_changes ? 'lead_score' THEN v_patch.lead_score ELSE lead_score END,icp_band=CASE WHEN p_changes ? 'icp_band' THEN v_patch.icp_band ELSE icp_band END WHERE id=v_id AND organization_id=p_org RETURNING * INTO v_c;
 UPDATE public.referrals SET status='converted',referred_customer_id=v_id WHERE id=p_referral AND organization_id=p_org RETURNING * INTO v_r;
 RETURN jsonb_build_object('referral',to_jsonb(v_r),'customer',to_jsonb(v_c),'created_customer_id',CASE WHEN v_new THEN v_id ELSE NULL END);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true); RAISE;
END; $$;
REVOKE ALL ON FUNCTION public.fn_crm_convertir_referido(integer,uuid,uuid,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crm_convertir_referido(integer,uuid,uuid,uuid,jsonb,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_crm_partner_deal_base(p_org integer,p_actor uuid,p_partner uuid,p_opportunity uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_p public.partners%rowtype;v_o public.opportunities%rowtype;
BEGIN
 PERFORM public.fn_crm_exigir_permiso_actor(p_org,p_actor,'crm.opportunities.edit');
 IF p_now IS NULL OR abs(extract(epoch FROM (p_now-now())))>300 THEN RAISE EXCEPTION 'fecha_invalida' USING errcode='22023'; END IF;
 SELECT * INTO v_p FROM public.partners WHERE organization_id=p_org AND id=p_partner;
 IF NOT FOUND THEN RAISE EXCEPTION 'partner_no_encontrado' USING errcode='P0002'; END IF;
 SELECT * INTO v_o FROM public.opportunities WHERE organization_id=p_org AND id=p_opportunity;
 IF NOT FOUND THEN RAISE EXCEPTION 'oportunidad_no_encontrada' USING errcode='P0002'; END IF;
 PERFORM public.fn_crm_red_actor_sucursal(p_org,p_actor,'crm.opportunities.edit',v_o.branch_id::integer);
 IF EXISTS(SELECT 1 FROM public.partner_deals d LEFT JOIN public.opportunities o ON o.id=d.opportunity_id AND o.organization_id=p_org WHERE d.organization_id=p_org AND d.partner_id=p_partner AND d.commission_status<>'rejected' AND o.id IS NULL) THEN RAISE EXCEPTION 'deal_origen_ajeno' USING errcode='42501'; END IF;
 IF (SELECT count(*) FROM public.partner_deals WHERE organization_id=p_org AND partner_id=p_partner)>10000 THEN RAISE EXCEPTION 'demasiados_deals' USING errcode='54000'; END IF;
 RETURN jsonb_build_object('partner',to_jsonb(v_p),'opportunity',to_jsonb(v_o),
  'tiers',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.min_revenue,t.min_deals,t.id) FROM public.partner_tiers t WHERE t.organization_id=p_org),'[]'::jsonb),
  'deals',coalesce((SELECT jsonb_agg(to_jsonb(d)||jsonb_build_object('opportunity',jsonb_build_object('id',o.id,'amount',o.amount,'currency',o.currency)) ORDER BY d.id) FROM public.partner_deals d JOIN public.opportunities o ON o.id=d.opportunity_id AND o.organization_id=p_org WHERE d.organization_id=p_org AND d.partner_id=p_partner AND d.commission_status<>'rejected'),'[]'::jsonb),
  'base_currency',public.fn_moneda_base_organizacion(p_org),'timezone',(SELECT timezone FROM public.organizations WHERE id=p_org),
  'calendar',(SELECT settings FROM public.organization_settings WHERE organization_id=p_org AND key='calendar'),
  'rates',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.exchange_rates r WHERE r.organization_id=p_org),'[]'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.fn_crm_partner_deal_base(integer,uuid,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crm_partner_deal_base(integer,uuid,uuid,uuid,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_crm_registrar_partner_deal(p_org integer,p_actor uuid,p_partner uuid,p_opportunity uuid,p_type text,p_expected jsonb,p_commission numeric,p_tier uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_p public.partners%rowtype;v_d public.partner_deals%rowtype;v_current jsonb;
BEGIN
 PERFORM public.fn_crm_exigir_permiso_actor(p_org,p_actor,'crm.opportunities.edit');
 IF coalesce(p_type,'') NOT IN('referral','co_sell','reseller') OR p_commission IS NULL OR p_commission<0 OR p_commission::text IN('NaN','Infinity','-Infinity') OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'deal_preparado_invalido' USING errcode='22023'; END IF;
 PERFORM pg_advisory_xact_lock(713552,p_org);
 SELECT * INTO v_p FROM public.partners WHERE id=p_partner AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'partner_no_encontrado' USING errcode='P0002'; END IF;
 IF NOT v_p.is_active THEN RAISE EXCEPTION 'partner_inactivo' USING errcode='P0001'; END IF;
 PERFORM 1 FROM public.opportunities WHERE organization_id=p_org AND (id=p_opportunity OR id IN(SELECT opportunity_id FROM public.partner_deals WHERE organization_id=p_org AND partner_id=p_partner)) ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.partner_tiers WHERE organization_id=p_org ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.partner_deals WHERE organization_id=p_org AND partner_id=p_partner ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.exchange_rates WHERE organization_id=p_org ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.organizations WHERE id=p_org FOR SHARE;
 PERFORM 1 FROM public.organization_settings WHERE organization_id=p_org AND key IN('calendar','finanzas') ORDER BY key FOR SHARE;
 v_current:=public.fn_crm_partner_deal_base(p_org,p_actor,p_partner,p_opportunity,p_now);
 IF v_current IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'partner_contexto_modificado' USING errcode='40001'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_deals WHERE organization_id=p_org AND partner_id=p_partner AND opportunity_id=p_opportunity AND commission_status<>'rejected') THEN RAISE EXCEPTION 'deal_ya_registrado' USING errcode='23505'; END IF;
 IF p_tier IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_tiers WHERE id=p_tier AND organization_id=p_org) THEN RAISE EXCEPTION 'tier_ajeno' USING errcode='42501'; END IF;
 INSERT INTO public.partner_deals(organization_id,partner_id,opportunity_id,deal_type,commission_amount,commission_status) VALUES(p_org,p_partner,p_opportunity,p_type,p_commission,'pending') RETURNING * INTO v_d;
 IF p_tier IS NOT NULL THEN UPDATE public.partners SET tier_id=p_tier WHERE id=p_partner AND organization_id=p_org; END IF;
 RETURN jsonb_build_object('deal',to_jsonb(v_d),'tier_id',coalesce(p_tier,v_p.tier_id));
END; $$;
REVOKE ALL ON FUNCTION public.fn_crm_registrar_partner_deal(integer,uuid,uuid,uuid,text,jsonb,numeric,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crm_registrar_partner_deal(integer,uuid,uuid,uuid,text,jsonb,numeric,uuid,timestamptz) TO service_role;
