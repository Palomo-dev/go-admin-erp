-- PHONE: revoca solo APIs nuevas y restaura el retiro anterior exacto.
-- No elimina sesiones, actas, invitaciones, pruebas OTP ni operaciones.
DO $$
DECLARE v_signature text; v_function regprocedure; v_pending boolean;
BEGIN
 IF to_regclass('public.crm_phone_sessions') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.crm_phone_sessions s WHERE s.recording_claim_state IN (''pending'',''unknown'') OR (s.recording_claim_state=''confirmed'' AND NOT EXISTS(SELECT 1 FROM public.call_recordings r WHERE r.organization_id=s.organization_id AND r.call_id=s.call_id)))' INTO v_pending;
  IF v_pending THEN RAISE EXCEPTION 'rollback_phone_requiere_reconciliar_grabacion' USING ERRCODE='55000'; END IF;
 END IF;
 FOREACH v_signature IN ARRAY ARRAY[
  'public.fn_phone_assert_service_core()',
  'public.fn_phone_assert_actor_core(integer)',
  'public.fn_phone_assert_call_scope_core(integer,uuid)',
  'public.fn_phone_state_core(public.crm_phone_sessions,public.crm_phone_operations)',
  'public.fn_phone_prepare(integer,uuid)',
  'public.fn_phone_get(integer,uuid)',
  'public.fn_phone_get_invite(uuid)',
  'public.fn_phone_resolve(integer,text)',
  'public.fn_phone_presence(integer,uuid,boolean)',
  'public.fn_phone_verify_mobile(integer,uuid,text,jsonb)',
  'public.fn_phone_team(integer)',
  'public.fn_phone_inbound_context(integer,uuid)',
  'public.fn_phone_invite(integer,uuid,uuid,jsonb)',
  'public.fn_phone_claim(integer,uuid,uuid,jsonb)',
  'public.fn_phone_dispatch(integer,uuid,uuid,bigint)',
  'public.fn_phone_reject_invite(integer,uuid,uuid)',
  'public.fn_phone_target(integer,uuid)',
  'public.fn_phone_mobile_state(integer)',
  'public.fn_phone_apply(integer,uuid,bigint,jsonb,jsonb,jsonb,uuid,jsonb,uuid,text,jsonb)'
 ] LOOP
  v_function:=to_regprocedure(v_signature);
  IF v_function IS NOT NULL THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',v_function); END IF;
 END LOOP;
END;
$$;

-- Cuerpo ce9624a33ee572c1816e3d1c1f1b048d y ACL anteriores, sin borrar evidencia.
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
