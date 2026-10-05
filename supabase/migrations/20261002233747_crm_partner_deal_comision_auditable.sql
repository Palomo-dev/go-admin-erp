-- Extensión aditiva del registro nativo: importe opcional, auditoría y replay.
-- El motor TS existente calcula comisión sugerida/promoción; el writer CAS
-- existente sigue confirmando partner + deal dentro de la misma transacción.
CREATE TABLE IF NOT EXISTS public.crm_partner_deal_receipts (
  organization_id integer NOT NULL REFERENCES public.organizations(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  client_key uuid NOT NULL,
  partner_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  request_json jsonb NOT NULL,
  suggested_amount numeric NOT NULL,
  confirmed_amount numeric NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  response jsonb NOT NULL,
  PRIMARY KEY (organization_id,actor_id,client_key),
  CHECK (suggested_amount>=0 AND confirmed_amount>=0)
);
ALTER TABLE public.crm_partner_deal_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_partner_deal_receipts FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.crm_partner_deal_receipts IS
  'Auditoría inmutable del registro de deal: actor, importe sugerido/confirmado y respuesta. Sin acceso directo por API; replay sólo mediante RPC de servicio con pertenencia y sucursal verificadas.';

CREATE OR REPLACE FUNCTION public.fn_crm_partner_deal_receipt(
  p_org integer,p_actor uuid,p_partner uuid,p_opportunity uuid,p_type text,
  p_key uuid,p_requested numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_receipt public.crm_partner_deal_receipts;v_request jsonb;v_branch integer;
BEGIN
  PERFORM public.fn_crm_exigir_permiso_actor(p_org,p_actor,'crm.opportunities.edit');
  IF p_requested IS NOT NULL THEN
    PERFORM public.fn_crm_exigir_permiso_actor(p_org,p_actor,'admin.full_access');
  END IF;
  IF p_key IS NULL OR coalesce(p_type,'') NOT IN('referral','co_sell','reseller')
    OR (p_requested IS NOT NULL AND (p_requested<0 OR p_requested>1000000000000
      OR p_requested::text IN('NaN','Infinity','-Infinity') OR round(p_requested,2)<>p_requested)) THEN
    RAISE EXCEPTION 'deal_preparado_invalido' USING errcode='22023';
  END IF;
  PERFORM 1 FROM public.partners WHERE organization_id=p_org AND id=p_partner;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner_no_encontrado' USING errcode='P0002'; END IF;
  SELECT branch_id::integer INTO v_branch FROM public.opportunities WHERE organization_id=p_org AND id=p_opportunity;
  IF NOT FOUND THEN RAISE EXCEPTION 'oportunidad_no_encontrada' USING errcode='P0002'; END IF;
  PERFORM public.fn_crm_red_actor_sucursal(p_org,p_actor,'crm.opportunities.edit',v_branch);
  v_request:=jsonb_build_object('partner_id',p_partner,'opportunity_id',p_opportunity,'deal_type',p_type,'commission_amount',p_requested);
  SELECT * INTO v_receipt FROM public.crm_partner_deal_receipts
    WHERE organization_id=p_org AND actor_id=p_actor AND client_key=p_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_receipt.request_json IS DISTINCT FROM v_request THEN
    RAISE EXCEPTION 'reintento_con_datos_distintos' USING errcode='P0001';
  END IF;
  RETURN v_receipt.response;
END; $$;
REVOKE ALL ON FUNCTION public.fn_crm_partner_deal_receipt(integer,uuid,uuid,uuid,text,uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crm_partner_deal_receipt(integer,uuid,uuid,uuid,text,uuid,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_crm_registrar_partner_deal_auditado(
  p_org integer,p_actor uuid,p_partner uuid,p_opportunity uuid,p_type text,
  p_expected jsonb,p_commission numeric,p_tier uuid,p_now timestamptz,
  p_key uuid,p_requested numeric,p_suggested numeric,p_metadata jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_replay jsonb;v_result jsonb;v_response jsonb;
BEGIN
  -- Misma exclusión transaccional que el writer original, también para replay.
  PERFORM pg_advisory_xact_lock(713552,p_org);
  v_replay:=public.fn_crm_partner_deal_receipt(p_org,p_actor,p_partner,p_opportunity,p_type,p_key,p_requested);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF p_suggested IS NULL OR p_suggested<0 OR p_suggested::text IN('NaN','Infinity','-Infinity')
    OR jsonb_typeof(p_metadata) IS DISTINCT FROM 'object'
    OR (p_requested IS NULL AND p_commission IS DISTINCT FROM p_suggested)
    OR (p_requested IS NOT NULL AND p_commission IS DISTINCT FROM p_requested) THEN
    RAISE EXCEPTION 'comision_preparada_invalida' USING errcode='22023';
  END IF;
  v_result:=public.fn_crm_registrar_partner_deal(p_org,p_actor,p_partner,p_opportunity,p_type,p_expected,p_commission,p_tier,p_now);
  v_response:=p_metadata||jsonb_build_object('deal',(v_result->'deal')||jsonb_build_object('opportunity',p_expected->'opportunity'));
  INSERT INTO public.crm_partner_deal_receipts(organization_id,actor_id,client_key,partner_id,opportunity_id,request_json,suggested_amount,confirmed_amount,recorded_at,response)
    VALUES(p_org,p_actor,p_key,p_partner,p_opportunity,jsonb_build_object('partner_id',p_partner,'opportunity_id',p_opportunity,'deal_type',p_type,'commission_amount',p_requested),p_suggested,p_commission,p_now,v_response);
  RETURN v_response;
END; $$;
REVOKE ALL ON FUNCTION public.fn_crm_registrar_partner_deal_auditado(integer,uuid,uuid,uuid,text,jsonb,numeric,uuid,timestamptz,uuid,numeric,numeric,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crm_registrar_partner_deal_auditado(integer,uuid,uuid,uuid,text,jsonb,numeric,uuid,timestamptz,uuid,numeric,numeric,jsonb) TO service_role;
