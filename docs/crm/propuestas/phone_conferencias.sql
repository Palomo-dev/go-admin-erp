-- CANDIDATO PHONE independiente: NO aplicado. No modifica llamadas94 ni CAS20.
-- Estado durable en Postgres; el proveedor HTTP requiere reconciliación explícita.
CREATE TABLE IF NOT EXISTS public.crm_phone_sessions (
  call_id uuid PRIMARY KEY REFERENCES public.calls(id),
  organization_id integer NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  conference_name text NOT NULL UNIQUE,
  conference_sid text CHECK (conference_sid ~ '^CF[0-9a-fA-F]{32}$'),
  customer_sid text CHECK (customer_sid ~ '^CA[0-9a-fA-F]{32}$'),
  agent_sid text CHECK (agent_sid ~ '^CA[0-9a-fA-F]{32}$'),
  current_agent_user_id uuid,
  phase text NOT NULL DEFAULT 'connecting' CHECK (phase IN ('connecting','active','held','consulting','transferring','ended','error')),
  held_at timestamptz,
  hold_seconds integer NOT NULL DEFAULT 0 CHECK (hold_seconds>=0),
  pre_hold_muted boolean NOT NULL DEFAULT false,
  transfer_restore_held boolean NOT NULL DEFAULT false,
  recording_claim_state text NOT NULL DEFAULT 'none' CHECK (recording_claim_state IN ('none','pending','confirmed','absent','unknown')),
  recording_claim_until timestamptz,
  transfer_invite_id uuid,
  transfer_mode text CHECK (transfer_mode IN ('direct','consult')),
  transfer_status text CHECK (transfer_status IN ('dialing','connected','confirmed','failed')),
  transfer_name text CHECK (length(transfer_name)<=200),
  active_operation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (customer_sid IS NULL OR agent_sid IS NULL OR customer_sid<>agent_sid)
);
CREATE TABLE IF NOT EXISTS public.crm_phone_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL,
  call_id uuid NOT NULL REFERENCES public.calls(id),
  actor_id uuid,
  client_key uuid NOT NULL,
  fingerprint text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','dispatched','succeeded','failed','unknown')),
  lease_until timestamptz NOT NULL DEFAULT now()+interval '60 seconds',
  dispatched_at timestamptz,
  result jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_phone_operation_actor_key ON public.crm_phone_operations(organization_id,call_id,actor_id,client_key) WHERE actor_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_phone_operation_system_key ON public.crm_phone_operations(organization_id,call_id,client_key) WHERE actor_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_phone_operation_pending ON public.crm_phone_operations(organization_id,call_id) WHERE state IN ('reserved','dispatched','unknown');
CREATE TABLE IF NOT EXISTS public.crm_phone_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL,
  call_id uuid NOT NULL REFERENCES public.calls(id),
  operation_id uuid REFERENCES public.crm_phone_operations(id),
  role text NOT NULL CHECK (role IN ('customer','agent','transfer')),
  user_id uuid,
  destination text NOT NULL CHECK (length(destination) BETWEEN 1 AND 120),
  display_name text NOT NULL CHECK (length(display_name)<=200),
  call_sid text UNIQUE CHECK (call_sid ~ '^CA[0-9a-fA-F]{32}$'),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','dispatched','ringing','joined','declined','failed','unknown')),
  recording_announced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_phone_invite_call ON public.crm_phone_invites(organization_id,call_id);
CREATE TABLE IF NOT EXISTS public.crm_phone_presence (
  organization_id integer NOT NULL,
  user_id uuid NOT NULL,
  client_key uuid NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  device_registered boolean NOT NULL DEFAULT false,
  PRIMARY KEY(organization_id,user_id,client_key)
);
CREATE TABLE IF NOT EXISTS public.crm_phone_verified_mobiles (
  organization_id integer NOT NULL,
  user_id uuid NOT NULL,
  phone text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.crm_phone_mobile_proofs (
  proof_key uuid PRIMARY KEY,
  provider_ref text NOT NULL UNIQUE CHECK (provider_ref ~ '^VE[0-9a-fA-F]{32}$'),
  organization_id integer NOT NULL,
  user_id uuid NOT NULL,
  phone text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  approved_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_phone_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_phone_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_phone_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_phone_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_phone_verified_mobiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_phone_mobile_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_phone_sessions,public.crm_phone_operations,public.crm_phone_invites,public.crm_phone_presence,public.crm_phone_verified_mobiles,public.crm_phone_mobile_proofs FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_phone_assert_service_core()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'solo_servicio' USING ERRCODE='42501'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_assert_service_core() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_phone_assert_actor_core(p_org integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
 PERFORM public.fn_assert_acceso_org(p_org);
 IF v_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_org AND user_id=v_actor AND is_active) THEN
  RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
 RETURN v_actor;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_assert_actor_core(integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_phone_assert_call_scope_core(p_org integer,p_call uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_call public.calls;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_call FROM public.calls WHERE organization_id=p_org AND id=p_call;
 IF NOT FOUND OR (v_call.customer_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.customers c WHERE c.organization_id=p_org AND c.id=v_call.customer_id
    AND public.app_branch_access(c.branch_id::integer)))
  OR (v_call.opportunity_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.opportunities o WHERE o.organization_id=p_org AND o.id=v_call.opportunity_id
    AND o.customer_id IS NOT DISTINCT FROM v_call.customer_id AND public.app_branch_access(o.branch_id::integer))) THEN
  RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_assert_call_scope_core(integer,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_phone_state_core(p_session public.crm_phone_sessions,p_operation public.crm_phone_operations DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_phase text; v_supported boolean; v_busy boolean; v_transfer jsonb; v_seconds integer;
BEGIN
 v_supported:=p_session.conference_sid IS NOT NULL AND p_session.customer_sid IS NOT NULL AND p_session.agent_sid IS NOT NULL;
 v_busy:=p_session.active_operation_id IS NOT NULL;
 v_phase:=CASE p_session.phase WHEN 'connecting' THEN 'ready' WHEN 'active' THEN 'ready' ELSE p_session.phase END;
 IF v_busy AND p_operation.payload->>'action'='hold' AND p_operation.state IN ('reserved','dispatched') THEN
  v_phase:=CASE WHEN (p_operation.payload->>'held')::boolean THEN 'holding' ELSE 'resuming' END; END IF;
 v_seconds:=p_session.hold_seconds;
 IF p_session.held_at IS NOT NULL AND p_session.phase<>'ended' THEN
  v_seconds:=v_seconds+greatest(0,floor(extract(epoch FROM clock_timestamp()-p_session.held_at)))::integer; END IF;
 IF p_session.transfer_mode IS NOT NULL AND p_session.transfer_status IS NOT NULL THEN
  v_transfer:=jsonb_build_object('mode',p_session.transfer_mode,'status',p_session.transfer_status,'toName',coalesce(p_session.transfer_name,'')); END IF;
 RETURN jsonb_build_object('supported',v_supported,'phase',v_phase,'held',p_session.held_at IS NOT NULL AND p_session.phase<>'ended',
  'heldAt',CASE WHEN p_session.held_at IS NOT NULL AND p_session.phase<>'ended' THEN floor(extract(epoch FROM p_session.held_at)*1000)::bigint END,
  'holdSeconds',v_seconds,'transfer',v_transfer,'busy',v_busy,
  'error',CASE WHEN p_session.phase='error' OR p_operation.state='unknown' THEN 'No pudimos confirmar el control de la llamada' END);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_state_core(public.crm_phone_sessions,public.crm_phone_operations) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_phone_prepare(p_org integer,p_call uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_call public.calls; v_session public.crm_phone_sessions; v_result jsonb; v_rows integer;
BEGIN
 PERFORM public.fn_phone_assert_service_core();
 SELECT * INTO v_call FROM public.calls WHERE id=p_call AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'llamada_no_encontrada' USING ERRCODE='P0002'; END IF;
 IF v_call.provider<>'twilio' OR v_call.mode NOT IN ('browser','inbound') OR v_call.ended_at IS NOT NULL
  OR v_call.status NOT IN ('dialing','ringing','in_progress') OR v_call.provider_call_sid IS NULL
  OR v_call.provider_call_sid !~ '^CA[0-9a-fA-F]{32}$' THEN RAISE EXCEPTION 'conferencia_no_disponible' USING ERRCODE='22023'; END IF;
 INSERT INTO public.crm_phone_sessions(call_id,organization_id,direction,conference_name,customer_sid,agent_sid,current_agent_user_id)
 VALUES(p_call,p_org,v_call.direction,'go_'||p_org::text||'_'||p_call::text,
  CASE WHEN v_call.direction='inbound' THEN v_call.provider_call_sid END,
  CASE WHEN v_call.direction='outbound' THEN v_call.provider_call_sid END,
  CASE WHEN v_call.direction='outbound' THEN v_call.user_id END)
 ON CONFLICT(call_id) DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 SELECT * INTO v_session FROM public.crm_phone_sessions WHERE call_id=p_call AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ambito_invalido' USING ERRCODE='22023'; END IF;
 IF v_session.phase='ended' THEN RAISE EXCEPTION 'conferencia_terminada' USING ERRCODE='22023'; END IF;
 IF v_rows=0 THEN RETURN public.fn_phone_get(p_org,p_call); END IF;
 IF jsonb_typeof(v_call.metadata) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'metadata_invalida' USING ERRCODE='22023'; END IF;
 UPDATE public.calls SET metadata=metadata||jsonb_build_object('phone_control',public.fn_phone_state_core(v_session)),updated_at=now()
  WHERE id=p_call AND organization_id=p_org RETURNING * INTO v_call;
 RETURN public.fn_phone_get(p_org,p_call);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_prepare(integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_prepare(integer,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_phone_get(p_org integer,p_call uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_session public.crm_phone_sessions; v_call public.calls; v_operation public.crm_phone_operations; v_invites jsonb;
BEGIN
 PERFORM public.fn_phone_assert_service_core();
 SELECT * INTO v_session FROM public.crm_phone_sessions WHERE organization_id=p_org AND call_id=p_call;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO v_call FROM public.calls WHERE organization_id=p_org AND id=p_call;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO v_operation FROM public.crm_phone_operations WHERE organization_id=p_org AND call_id=p_call AND id=v_session.active_operation_id;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]'::jsonb) INTO v_invites FROM
  (SELECT * FROM public.crm_phone_invites WHERE organization_id=p_org AND call_id=p_call ORDER BY created_at DESC,id DESC LIMIT 100) x;
 RETURN jsonb_build_object('session',to_jsonb(v_session),'call',to_jsonb(v_call),'operation',CASE WHEN v_operation.id IS NOT NULL THEN to_jsonb(v_operation) END,
  'invites',v_invites,'state',public.fn_phone_state_core(v_session,v_operation));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_get(integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_get(integer,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_phone_get_invite(p_invite uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_invite public.crm_phone_invites; v_result jsonb;
BEGIN
 PERFORM public.fn_phone_assert_service_core();
 SELECT * INTO v_invite FROM public.crm_phone_invites WHERE id=p_invite;
 IF NOT FOUND THEN RETURN NULL; END IF;
 v_result:=public.fn_phone_get(v_invite.organization_id,v_invite.call_id);
 IF v_result IS NULL THEN RETURN NULL; END IF;
 RETURN (v_result-'invites'-'operation'-'state')||jsonb_build_object('invite',to_jsonb(v_invite));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_get_invite(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_get_invite(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_phone_resolve(p_org integer,p_sid text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid; v_session public.crm_phone_sessions; v_operation public.crm_phone_operations; v_call public.calls; v_id uuid;
BEGIN
 v_actor:=public.fn_phone_assert_actor_core(p_org);
 IF p_sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_id:=p_sid::uuid;
 ELSIF p_sid IS NULL OR p_sid !~ '^CA[0-9a-fA-F]{32}$' THEN RAISE EXCEPTION 'sid_invalida' USING ERRCODE='22023'; END IF;
 SELECT s.* INTO v_session FROM public.crm_phone_sessions s WHERE s.organization_id=p_org AND
  (s.call_id=v_id OR s.agent_sid=p_sid OR EXISTS(SELECT 1 FROM public.crm_phone_invites i WHERE i.organization_id=p_org AND i.call_id=s.call_id AND i.call_sid=p_sid))
  AND (s.current_agent_user_id=v_actor OR public.fn_crm_tiene_permiso(p_org,'crm.activities.edit_any'));
 IF NOT FOUND THEN
  SELECT * INTO v_call FROM public.calls c WHERE organization_id=p_org AND (id=v_id OR provider_call_sid=p_sid)
   AND (user_id=v_actor OR public.fn_crm_tiene_permiso(p_org,'crm.activities.edit_any'))
   AND NOT EXISTS(SELECT 1 FROM public.crm_phone_sessions WHERE call_id=c.id);
  IF NOT FOUND THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
  PERFORM public.fn_phone_assert_call_scope_core(p_org,v_call.id);
  RETURN jsonb_build_object('call_id',v_call.id,'state',jsonb_build_object('supported',false,
   'phase',CASE WHEN v_call.ended_at IS NOT NULL THEN 'ended' ELSE 'ready' END,'held',false,'heldAt',NULL,
   'holdSeconds',0,'transfer',NULL,'busy',false,'error',NULL));
 END IF;
 PERFORM public.fn_phone_assert_call_scope_core(p_org,v_session.call_id);
 SELECT * INTO v_operation FROM public.crm_phone_operations WHERE organization_id=p_org AND call_id=v_session.call_id AND id=v_session.active_operation_id;
 RETURN jsonb_build_object('call_id',v_session.call_id,'state',public.fn_phone_state_core(v_session,v_operation));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_resolve(integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_resolve(integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_phone_presence(p_org integer,p_client uuid,p_registered boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid;
BEGIN
 v_actor:=public.fn_phone_assert_actor_core(p_org);
 IF p_client IS NULL OR p_registered IS NULL THEN RAISE EXCEPTION 'presencia_invalida' USING ERRCODE='22023'; END IF;
 INSERT INTO public.crm_phone_presence(organization_id,user_id,client_key,last_seen,device_registered)
 VALUES(p_org,v_actor,p_client,clock_timestamp(),p_registered)
 ON CONFLICT(organization_id,user_id,client_key) DO UPDATE SET last_seen=EXCLUDED.last_seen,device_registered=EXCLUDED.device_registered;
 RETURN 'null'::jsonb;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_presence(integer,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_presence(integer,uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_phone_verify_mobile(p_org integer,p_user uuid,p_phone text,p_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_verified public.crm_phone_verified_mobiles; v_proof public.crm_phone_mobile_proofs;
 v_key uuid; v_approved timestamptz; v_profile public.profiles; v_meta jsonb; v_pending jsonb;
BEGIN
 PERFORM public.fn_phone_assert_service_core();
 IF p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{6,14}$' OR jsonb_typeof(p_proof) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_proof) k WHERE k NOT IN ('proof_key','provider_ref','approved_at'))
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['proof_key','provider_ref','approved_at']) k WHERE jsonb_typeof(p_proof->k) IS DISTINCT FROM 'string')
  OR p_proof->>'provider_ref' !~ '^VE[0-9a-fA-F]{32}$'
  OR p_proof->>'approved_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' THEN
  RAISE EXCEPTION 'prueba_invalida' USING ERRCODE='22023'; END IF;
 v_key:=public.fn_crm_uuid_o_null(p_proof->>'proof_key'); v_approved:=(p_proof->>'approved_at')::timestamptz;
 IF v_key IS NULL OR NOT isfinite(v_approved) OR v_approved>clock_timestamp() THEN RAISE EXCEPTION 'prueba_invalida' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_org AND user_id=p_user AND is_active) THEN
  RAISE EXCEPTION 'destino_no_verificado' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('phone_verify:'||p_org::text||':'||p_user::text,0));
 SELECT * INTO v_proof FROM public.crm_phone_mobile_proofs WHERE proof_key=v_key;
 IF FOUND THEN
  IF v_proof.organization_id<>p_org OR v_proof.user_id<>p_user OR v_proof.phone<>p_phone OR v_proof.provider_ref<>p_proof->>'provider_ref' OR v_proof.approved_at<>v_approved THEN
   RAISE EXCEPTION 'reintento_con_datos_distintos' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('phone',v_proof.phone,'verified_at',v_proof.verified_at); END IF;
 IF v_approved<clock_timestamp()-interval '10 minutes' THEN RAISE EXCEPTION 'prueba_caducada' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_profile FROM public.profiles WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'perfil_no_encontrado' USING ERRCODE='P0002'; END IF;
 v_meta:=coalesce(v_profile.metadata,'{}'::jsonb);
 IF jsonb_typeof(v_meta) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'metadata_invalida' USING ERRCODE='22023'; END IF;
 v_pending:=v_meta->'pending_mobile_verification';
 IF v_pending->>'phone'=p_phone AND v_pending->>'organization_id'=p_org::text THEN v_meta:=v_meta-'pending_mobile_verification'; END IF;
 INSERT INTO public.crm_phone_mobile_proofs(proof_key,provider_ref,organization_id,user_id,phone,approved_at)
 VALUES(v_key,p_proof->>'provider_ref',p_org,p_user,p_phone,v_approved) RETURNING * INTO v_proof;
 INSERT INTO public.crm_phone_verified_mobiles(organization_id,user_id,phone,verified_at) VALUES(p_org,p_user,p_phone,v_proof.verified_at)
 ON CONFLICT(organization_id,user_id) DO UPDATE SET phone=EXCLUDED.phone,verified_at=EXCLUDED.verified_at RETURNING * INTO v_verified;
 INSERT INTO public.user_comm_preferences(organization_id,user_id,mobile_phone_e164,mobile_verified_at)
 VALUES(p_org,p_user,p_phone,v_verified.verified_at)
 ON CONFLICT(organization_id,user_id) DO UPDATE SET mobile_phone_e164=EXCLUDED.mobile_phone_e164,mobile_verified_at=EXCLUDED.mobile_verified_at;
 UPDATE public.profiles SET phone=p_phone,metadata=v_meta||jsonb_build_object('mobile_verified_at',v_verified.verified_at) WHERE id=p_user;
 RETURN jsonb_build_object('phone',v_verified.phone,'verified_at',v_verified.verified_at);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_verify_mobile(integer,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_verify_mobile(integer,uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_phone_team(p_org integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid; v_result jsonb;
BEGIN
 v_actor:=public.fn_phone_assert_actor_core(p_org);
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.name,x.id),'[]'::jsonb) INTO v_result FROM (
  SELECT m.user_id AS id,btrim(concat_ws(' ',p.first_name,p.last_name)) AS name,
   NOT busy.value AND CASE WHEN pref.default_call_mode='mobile' THEN EXISTS(
    SELECT 1 FROM public.crm_phone_verified_mobiles a WHERE a.organization_id=p_org AND a.user_id=m.user_id AND a.phone=pref.mobile_phone_e164)
    ELSE EXISTS(SELECT 1 FROM public.crm_phone_presence h WHERE h.organization_id=p_org AND h.user_id=m.user_id
     AND h.device_registered AND h.last_seen>=clock_timestamp()-interval '45 seconds') END AS available,
   busy.value AS busy,CASE WHEN pref.default_call_mode='mobile' THEN 'mobile' ELSE 'browser' END AS mode
  FROM (SELECT DISTINCT user_id FROM public.organization_members WHERE organization_id=p_org AND is_active) m
  LEFT JOIN public.profiles p ON p.id=m.user_id
  LEFT JOIN public.user_comm_preferences pref ON pref.organization_id=p_org AND pref.user_id=m.user_id
  CROSS JOIN LATERAL(SELECT EXISTS(SELECT 1 FROM public.calls c LEFT JOIN public.crm_phone_sessions s ON s.call_id=c.id AND s.organization_id=c.organization_id
   WHERE c.organization_id=p_org AND c.status='in_progress' AND c.ended_at IS NULL
    AND (s.current_agent_user_id=m.user_id OR (s.call_id IS NULL AND c.user_id=m.user_id))) AS value) busy
  ORDER BY btrim(concat_ws(' ',p.first_name,p.last_name)),m.user_id
 ) x;
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_team(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_team(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_phone_inbound_context(p_org integer,p_call uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid; v_call public.calls; v_invite public.crm_phone_invites; v_customer public.customers;
BEGIN
 v_actor:=public.fn_phone_assert_actor_core(p_org);
 SELECT * INTO v_call FROM public.calls WHERE organization_id=p_org AND id=p_call AND direction='inbound';
 IF NOT FOUND THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
 PERFORM public.fn_phone_assert_call_scope_core(p_org,p_call);
 SELECT * INTO v_invite FROM public.crm_phone_invites WHERE organization_id=p_org AND call_id=p_call AND role='agent' AND user_id=v_actor
  ORDER BY created_at DESC,id DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_customer FROM public.customers WHERE id=v_call.customer_id AND organization_id=p_org;
 RETURN jsonb_build_object('id',v_call.id,'status',v_call.status,'from_number',v_call.from_number,'to_number',v_call.to_number,
  'customer_id',v_customer.id,'customer_name',v_customer.full_name,'since',v_customer.created_at,
  'invitation_mode',CASE WHEN v_invite.destination LIKE 'client:%' THEN 'browser' ELSE 'mobile' END,
  'mobile_invite_state',CASE WHEN v_invite.destination NOT LIKE 'client:%' THEN v_invite.state END);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_inbound_context(integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_inbound_context(integer,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_phone_invite(p_org integer,p_call uuid,p_operation uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_call public.calls; v_session public.crm_phone_sessions; v_invite public.crm_phone_invites;
 v_operation public.crm_phone_operations; v_user uuid; v_role text; v_destination text; v_known text;
BEGIN
 PERFORM public.fn_phone_assert_service_core();
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('role','user_id','destination','display_name'))
  OR jsonb_typeof(p_payload->'role') IS DISTINCT FROM 'string' OR p_payload->>'role' NOT IN ('customer','agent','transfer')
  OR jsonb_typeof(p_payload->'destination') IS DISTINCT FROM 'string' OR length(p_payload->>'destination') NOT BETWEEN 1 AND 120
  OR jsonb_typeof(p_payload->'display_name') IS DISTINCT FROM 'string' OR length(p_payload->>'display_name')>200
  OR (p_payload ? 'user_id' AND jsonb_typeof(p_payload->'user_id') NOT IN ('string','null')) THEN
  RAISE EXCEPTION 'invitacion_invalida' USING ERRCODE='22023'; END IF;
 v_user:=public.fn_crm_uuid_o_null(p_payload->>'user_id'); v_role:=p_payload->>'role'; v_destination:=p_payload->>'destination';
 SELECT * INTO v_call FROM public.calls WHERE id=p_call AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'llamada_no_encontrada' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_session FROM public.crm_phone_sessions WHERE call_id=p_call AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'conferencia_no_disponible' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_invite FROM public.crm_phone_invites WHERE organization_id=p_org AND call_id=p_call AND role=v_role
  AND operation_id IS NOT DISTINCT FROM p_operation AND user_id IS NOT DISTINCT FROM v_user ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  IF v_invite.destination<>v_destination THEN RAISE EXCEPTION 'reintento_con_datos_distintos' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('invite',to_jsonb(v_invite)); END IF;
 IF v_call.ended_at IS NOT NULL OR v_call.status NOT IN ('dialing','ringing','in_progress') OR v_session.phase='ended' THEN
  RAISE EXCEPTION 'conferencia_terminada' USING ERRCODE='22023'; END IF;
 IF v_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_org AND user_id=v_user AND is_active) THEN
  RAISE EXCEPTION 'destino_invalido' USING ERRCODE='22023'; END IF;
 IF v_role='customer' THEN
  IF v_user IS NOT NULL OR p_operation IS NOT NULL OR v_destination<>(CASE WHEN v_call.direction='inbound' THEN v_call.from_number ELSE v_call.to_number END) THEN
   RAISE EXCEPTION 'destino_invalido' USING ERRCODE='22023'; END IF;
  v_known:=v_session.customer_sid;
 ELSE
  IF v_role='agent' AND (v_user IS NULL OR p_operation IS NOT NULL) THEN RAISE EXCEPTION 'destino_invalido' USING ERRCODE='22023'; END IF;
  IF v_user IS NULL THEN
   IF v_destination !~ '^\+[1-9][0-9]{6,14}$' THEN RAISE EXCEPTION 'destino_invalido' USING ERRCODE='22023'; END IF;
  ELSIF v_destination<>'client:u_'||replace(v_user::text,'-','')||'_o_'||p_org::text AND NOT EXISTS(
   SELECT 1 FROM public.crm_phone_verified_mobiles a JOIN public.user_comm_preferences p ON p.organization_id=a.organization_id AND p.user_id=a.user_id
   WHERE a.organization_id=p_org AND a.user_id=v_user AND a.phone=v_destination AND p.mobile_phone_e164=a.phone) THEN
   RAISE EXCEPTION 'destino_no_verificado' USING ERRCODE='22023'; END IF;
  IF v_role='agent' AND v_user=v_session.current_agent_user_id THEN v_known:=v_session.agent_sid; END IF;
 END IF;
 IF v_role='transfer' THEN
  SELECT * INTO v_operation FROM public.crm_phone_operations WHERE id=p_operation AND organization_id=p_org AND call_id=p_call FOR UPDATE;
  IF NOT FOUND OR v_session.active_operation_id IS DISTINCT FROM p_operation OR v_operation.state NOT IN ('reserved','dispatched')
   OR v_operation.payload->>'action'<>'transfer'
   OR (v_operation.payload->'target' ? 'userId' AND v_user IS DISTINCT FROM public.fn_crm_uuid_o_null(v_operation.payload->'target'->>'userId'))
   OR (v_operation.payload->'target' ? 'number' AND (v_user IS NOT NULL OR v_destination<>v_operation.payload->'target'->>'number')) THEN
   RAISE EXCEPTION 'operacion_invalida' USING ERRCODE='22023'; END IF;
 END IF;
 INSERT INTO public.crm_phone_invites(organization_id,call_id,operation_id,role,user_id,destination,display_name,call_sid)
 VALUES(p_org,p_call,p_operation,v_role,v_user,v_destination,p_payload->>'display_name',v_known) RETURNING * INTO v_invite;
 RETURN jsonb_build_object('invite',to_jsonb(v_invite));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_invite(integer,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_invite(integer,uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_phone_claim(p_org integer,p_call uuid,p_key uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid; v_call public.calls; v_session public.crm_phone_sessions; v_operation public.crm_phone_operations;
 v_action text; v_fingerprint text; v_target uuid; v_allowed text[];
BEGIN
 v_actor:=public.fn_phone_assert_actor_core(p_org);
 v_action:=p_payload->>'action';
 v_allowed:=CASE v_action WHEN 'hold' THEN ARRAY['action','held'] WHEN 'transfer' THEN ARRAY['action','mode','target']
  WHEN 'confirm_transfer' THEN ARRAY['action'] WHEN 'cancel_transfer' THEN ARRAY['action'] WHEN 'hangup' THEN ARRAY['action'] END;
 IF p_key IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR v_allowed IS NULL
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k<>ALL(v_allowed))
  OR (v_action='hold' AND jsonb_typeof(p_payload->'held') IS DISTINCT FROM 'boolean')
  OR (v_action='transfer' AND (coalesce(p_payload->>'mode','') NOT IN ('direct','consult') OR jsonb_typeof(p_payload->'target') IS DISTINCT FROM 'object')) THEN
  RAISE EXCEPTION 'comando_invalido' USING ERRCODE='22023'; END IF;
 IF v_action='transfer' THEN
  IF (p_payload->'target' ? 'userId')=(p_payload->'target' ? 'number')
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload->'target') k WHERE k NOT IN ('userId','number')) THEN
   RAISE EXCEPTION 'destino_invalido' USING ERRCODE='22023'; END IF;
  IF p_payload->'target' ? 'userId' THEN
   IF jsonb_typeof(p_payload->'target'->'userId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'destino_invalido' USING ERRCODE='22023'; END IF;
   v_target:=public.fn_crm_uuid_o_null(p_payload->'target'->>'userId');
   IF v_target IS NULL OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_org AND user_id=v_target AND is_active) THEN
    RAISE EXCEPTION 'destino_invalido' USING ERRCODE='22023'; END IF;
  ELSIF jsonb_typeof(p_payload->'target'->'number') IS DISTINCT FROM 'string' OR p_payload->'target'->>'number' !~ '^\+[1-9][0-9]{6,14}$' THEN
   RAISE EXCEPTION 'destino_invalido' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT * INTO v_call FROM public.calls WHERE id=p_call AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'llamada_no_encontrada' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_session FROM public.crm_phone_sessions WHERE call_id=p_call AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'conferencia_no_disponible' USING ERRCODE='P0002'; END IF;
 v_actor:=public.fn_phone_assert_actor_core(p_org);
 PERFORM public.fn_phone_assert_call_scope_core(p_org,p_call);
 IF v_session.current_agent_user_id IS DISTINCT FROM v_actor AND NOT public.fn_crm_tiene_permiso(p_org,'crm.activities.edit_any') THEN
  RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
 v_fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 SELECT * INTO v_operation FROM public.crm_phone_operations WHERE organization_id=p_org AND call_id=p_call AND actor_id=v_actor AND client_key=p_key FOR UPDATE;
 IF FOUND THEN
  IF v_operation.fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'reintento_con_datos_distintos' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('operation_id',v_operation.id,'revision',v_session.revision,
   'replay',true,'response',v_operation.result,'state',public.fn_phone_state_core(v_session,v_operation)); END IF;
 IF v_call.status<>'in_progress' OR v_call.ended_at IS NOT NULL OR v_session.phase='ended' OR v_session.conference_sid IS NULL
  OR v_session.customer_sid IS NULL OR v_session.agent_sid IS NULL THEN RAISE EXCEPTION 'conferencia_no_disponible' USING ERRCODE='22023'; END IF;
 IF v_session.active_operation_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.crm_phone_operations WHERE organization_id=p_org AND call_id=p_call AND state IN ('reserved','dispatched','unknown')) THEN
  RAISE EXCEPTION 'operacion_pendiente' USING ERRCODE='40001'; END IF;
 IF v_action='confirm_transfer' AND (v_session.transfer_mode IS DISTINCT FROM 'consult' OR v_session.transfer_status IS DISTINCT FROM 'connected') THEN
  RAISE EXCEPTION 'transferencia_no_conectada' USING ERRCODE='22023'; END IF;
 IF v_action='cancel_transfer' AND (v_session.transfer_invite_id IS NULL OR v_session.transfer_status NOT IN ('dialing','connected')) THEN
  RAISE EXCEPTION 'transferencia_no_disponible' USING ERRCODE='22023'; END IF;
 IF v_action='transfer' AND (v_session.transfer_status IN ('dialing','connected') OR v_target=v_session.current_agent_user_id) THEN
  RAISE EXCEPTION 'transferencia_no_disponible' USING ERRCODE='22023'; END IF;
 INSERT INTO public.crm_phone_operations(organization_id,call_id,actor_id,client_key,fingerprint,payload)
 VALUES(p_org,p_call,v_actor,p_key,v_fingerprint,p_payload) RETURNING * INTO v_operation;
 UPDATE public.crm_phone_sessions SET active_operation_id=v_operation.id,revision=revision+1,updated_at=now()
 WHERE call_id=p_call AND organization_id=p_org RETURNING * INTO v_session;
 RETURN jsonb_build_object('operation_id',v_operation.id,'revision',v_session.revision,'replay',false,'state',public.fn_phone_state_core(v_session,v_operation));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_claim(integer,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_claim(integer,uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_phone_dispatch(p_org integer,p_call uuid,p_operation uuid,p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_call public.calls; v_session public.crm_phone_sessions; v_operation public.crm_phone_operations; v_stale boolean;
BEGIN
 PERFORM public.fn_phone_assert_service_core();
 SELECT * INTO v_call FROM public.calls WHERE organization_id=p_org AND id=p_call FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'llamada_no_encontrada' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_session FROM public.crm_phone_sessions WHERE organization_id=p_org AND call_id=p_call FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'conferencia_no_disponible' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_operation FROM public.crm_phone_operations WHERE organization_id=p_org AND call_id=p_call AND id=p_operation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'operacion_invalida' USING ERRCODE='22023'; END IF;
 v_stale:=v_session.revision IS DISTINCT FROM p_revision OR v_session.active_operation_id IS DISTINCT FROM p_operation
  OR v_session.phase='ended' OR v_call.ended_at IS NOT NULL OR v_operation.state NOT IN ('reserved','dispatched','unknown')
  OR (v_operation.state='reserved' AND v_operation.lease_until<clock_timestamp());
 IF NOT v_stale AND v_operation.state='reserved' THEN
  UPDATE public.crm_phone_operations SET state='dispatched',dispatched_at=clock_timestamp(),updated_at=now() WHERE id=p_operation RETURNING * INTO v_operation;
  UPDATE public.crm_phone_sessions SET revision=revision+1,updated_at=now() WHERE call_id=p_call RETURNING * INTO v_session;
 END IF;
 RETURN jsonb_build_object('session',to_jsonb(v_session),'call',to_jsonb(v_call),'operation',to_jsonb(v_operation),'stale',v_stale);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_dispatch(integer,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_dispatch(integer,uuid,uuid,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_phone_reject_invite(p_org integer,p_call uuid,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid; v_call public.calls; v_session public.crm_phone_sessions; v_invite public.crm_phone_invites;
 v_operation public.crm_phone_operations; v_payload jsonb;
BEGIN
 v_actor:=public.fn_phone_assert_actor_core(p_org);
 IF p_key IS NULL THEN RAISE EXCEPTION 'clave_invalida' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_call FROM public.calls WHERE id=p_call AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_session FROM public.crm_phone_sessions WHERE call_id=p_call AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'conferencia_no_disponible' USING ERRCODE='P0002'; END IF;
 v_actor:=public.fn_phone_assert_actor_core(p_org);
 PERFORM public.fn_phone_assert_call_scope_core(p_org,p_call);
 SELECT * INTO v_invite FROM public.crm_phone_invites WHERE organization_id=p_org AND call_id=p_call AND user_id=v_actor AND role='agent'
  ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'sin_permiso' USING ERRCODE='42501'; END IF;
 v_payload:=jsonb_build_object('action','reject_invite','invite_id',v_invite.id);
 SELECT * INTO v_operation FROM public.crm_phone_operations WHERE organization_id=p_org AND call_id=p_call AND actor_id=v_actor AND client_key=p_key FOR UPDATE;
 IF FOUND THEN
  IF v_operation.payload<>v_payload THEN RAISE EXCEPTION 'reintento_con_datos_distintos' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('invite_id',v_invite.id,'operation_id',v_operation.id,'revision',v_session.revision,'replay',true,
   'response',v_operation.result,'state',public.fn_phone_state_core(v_session,v_operation)); END IF;
 IF v_invite.state NOT IN ('reserved','dispatched','ringing') OR v_call.ended_at IS NOT NULL OR v_session.phase='ended' THEN
  RAISE EXCEPTION 'invitacion_terminada' USING ERRCODE='22023'; END IF;
 IF v_session.active_operation_id IS NOT NULL THEN RAISE EXCEPTION 'operacion_pendiente' USING ERRCODE='40001'; END IF;
 INSERT INTO public.crm_phone_operations(organization_id,call_id,actor_id,client_key,fingerprint,payload)
 VALUES(p_org,p_call,v_actor,p_key,encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'),v_payload) RETURNING * INTO v_operation;
 UPDATE public.crm_phone_sessions SET active_operation_id=v_operation.id,revision=revision+1,updated_at=now() WHERE call_id=p_call RETURNING * INTO v_session;
 RETURN jsonb_build_object('invite_id',v_invite.id,'operation_id',v_operation.id,'revision',v_session.revision,'replay',false,'state',public.fn_phone_state_core(v_session,v_operation));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_reject_invite(integer,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_reject_invite(integer,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_phone_target(p_org integer,p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_pref public.user_comm_preferences; v_profile public.profiles; v_destination text; v_mode text;
BEGIN
 PERFORM public.fn_phone_assert_service_core();
 IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_org AND user_id=p_user AND is_active)
  OR EXISTS(SELECT 1 FROM public.calls c LEFT JOIN public.crm_phone_sessions s ON s.call_id=c.id AND s.organization_id=c.organization_id
   WHERE c.organization_id=p_org AND c.status='in_progress' AND c.ended_at IS NULL
    AND (s.current_agent_user_id=p_user OR (s.call_id IS NULL AND c.user_id=p_user))) THEN RETURN NULL; END IF;
 SELECT * INTO v_pref FROM public.user_comm_preferences WHERE organization_id=p_org AND user_id=p_user;
 SELECT * INTO v_profile FROM public.profiles WHERE id=p_user;
 IF v_pref.default_call_mode='mobile' THEN
  SELECT phone INTO v_destination FROM public.crm_phone_verified_mobiles WHERE organization_id=p_org AND user_id=p_user AND phone=v_pref.mobile_phone_e164;
  IF v_destination IS NULL THEN RETURN NULL; END IF; v_mode:='mobile';
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.crm_phone_presence WHERE organization_id=p_org AND user_id=p_user AND device_registered AND last_seen>=clock_timestamp()-interval '45 seconds') THEN RETURN NULL; END IF;
  v_destination:='client:u_'||replace(p_user::text,'-','')||'_o_'||p_org::text; v_mode:='browser';
 END IF;
 RETURN jsonb_build_object('user_id',p_user,'name',btrim(concat_ws(' ',v_profile.first_name,v_profile.last_name)),
  'destination',v_destination,'mode',v_mode);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_target(integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_target(integer,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_phone_mobile_state(p_org integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid; v_pref public.user_comm_preferences; v_verified public.crm_phone_verified_mobiles;
BEGIN
 v_actor:=public.fn_phone_assert_actor_core(p_org);
 SELECT * INTO v_pref FROM public.user_comm_preferences WHERE organization_id=p_org AND user_id=v_actor;
 SELECT * INTO v_verified FROM public.crm_phone_verified_mobiles WHERE organization_id=p_org AND user_id=v_actor AND phone=v_pref.mobile_phone_e164;
 RETURN jsonb_build_object('phone',v_pref.mobile_phone_e164,'verified_at',v_verified.verified_at,
  'requires_verification',v_pref.mobile_phone_e164 IS NOT NULL AND v_verified.user_id IS NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_mobile_state(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_mobile_state(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_phone_apply(p_org integer,p_call uuid,p_revision bigint,p_session_patch jsonb,p_call_expected jsonb,p_call_patch jsonb,
 p_invite uuid DEFAULT NULL,p_invite_patch jsonb DEFAULT '{}',p_operation uuid DEFAULT NULL,p_operation_state text DEFAULT NULL,p_result jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_call public.calls; v_session public.crm_phone_sessions; v_new public.crm_phone_sessions;
 v_invite public.crm_phone_invites; v_invite_new public.crm_phone_invites; v_transfer public.crm_phone_invites;
 v_operation public.crm_phone_operations; v_call_result jsonb; v_patch jsonb; v_meta jsonb; v_state jsonb;
BEGIN
 PERFORM public.fn_phone_assert_service_core();
 IF jsonb_typeof(p_session_patch) IS DISTINCT FROM 'object' OR jsonb_typeof(p_call_patch) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_invite_patch) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_session_patch) k WHERE k NOT IN ('conference_sid','customer_sid','agent_sid','current_agent_user_id','phase',
   'held_at','hold_seconds','pre_hold_muted','transfer_restore_held','recording_claim_state','recording_claim_until',
   'transfer_invite_id','transfer_mode','transfer_status','transfer_name','active_operation_id'))
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_invite_patch) k WHERE k NOT IN ('call_sid','state','recording_announced_at')) THEN
  RAISE EXCEPTION 'parche_invalido' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_session_patch) e WHERE
   (e.key IN ('pre_hold_muted','transfer_restore_held') AND jsonb_typeof(e.value)<>'boolean')
   OR (e.key='hold_seconds' AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^\d+$' OR e.value::text::numeric>2147483647))
   OR (e.key NOT IN ('pre_hold_muted','transfer_restore_held','hold_seconds') AND jsonb_typeof(e.value) NOT IN ('string','null')))
  OR EXISTS(SELECT 1 FROM jsonb_each(p_invite_patch) e WHERE jsonb_typeof(e.value) NOT IN ('string','null')) THEN
  RAISE EXCEPTION 'parche_invalido' USING ERRCODE='22023'; END IF;
 IF p_operation_state IS NOT NULL AND p_operation_state NOT IN ('dispatched','succeeded','failed','unknown') THEN
  RAISE EXCEPTION 'estado_operacion_invalido' USING ERRCODE='22023'; END IF;
 IF p_result IS NOT NULL AND (jsonb_typeof(p_result) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_result) k WHERE k NOT IN ('supported','phase','held','heldAt','holdSeconds','transfer','busy','error'))
  OR NOT p_result ?& ARRAY['supported','phase','held','heldAt','holdSeconds','transfer','busy','error']
  OR jsonb_typeof(p_result->'supported') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_result->'held') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(p_result->'busy') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_result->'holdSeconds') IS DISTINCT FROM 'number'
  OR coalesce(p_result->>'phase','') NOT IN ('ready','holding','held','resuming','consulting','transferring','error','ended')
  OR p_result->>'holdSeconds' !~ '^\d+(\.\d+)?$'
  OR (p_result->>'holdSeconds')::numeric>2147483647
  OR jsonb_typeof(p_result->'heldAt') NOT IN ('number','null') OR jsonb_typeof(p_result->'error') NOT IN ('string','null')
  OR jsonb_typeof(p_result->'transfer') NOT IN ('object','null')) THEN RAISE EXCEPTION 'resultado_invalido' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_result->'heldAt')='number' AND ((p_result->>'heldAt')::numeric<0 OR (p_result->>'heldAt')::numeric>9007199254740991) THEN
  RAISE EXCEPTION 'resultado_invalido' USING ERRCODE='22023'; END IF;
 IF length(p_result->>'error')>500 THEN RAISE EXCEPTION 'resultado_invalido' USING ERRCODE='22023'; END IF;
 IF p_result->'transfer'<>'null'::jsonb AND (EXISTS(SELECT 1 FROM jsonb_object_keys(p_result->'transfer') k WHERE k NOT IN ('mode','status','toName'))
  OR coalesce(p_result->'transfer'->>'mode','') NOT IN ('direct','consult') OR coalesce(p_result->'transfer'->>'status','') NOT IN ('dialing','connected','confirmed','failed')
  OR jsonb_typeof(p_result->'transfer'->'toName') IS DISTINCT FROM 'string' OR length(p_result->'transfer'->>'toName')>200) THEN
  RAISE EXCEPTION 'resultado_invalido' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_call FROM public.calls WHERE organization_id=p_org AND id=p_call FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'llamada_no_encontrada' USING ERRCODE='P0002'; END IF;
 SELECT * INTO v_session FROM public.crm_phone_sessions WHERE organization_id=p_org AND call_id=p_call FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'conferencia_no_disponible' USING ERRCODE='P0002'; END IF;
 IF v_session.revision IS DISTINCT FROM p_revision THEN RETURN public.fn_phone_get(p_org,p_call)||jsonb_build_object('stale',true); END IF;
 v_new:=jsonb_populate_record(v_session,p_session_patch);
 IF v_new.phase IS NULL OR v_new.phase NOT IN ('connecting','active','held','consulting','transferring','ended','error')
  OR v_new.hold_seconds IS NULL OR v_new.hold_seconds<0 OR v_new.hold_seconds<v_session.hold_seconds
  OR v_new.pre_hold_muted IS NULL OR v_new.transfer_restore_held IS NULL
  OR (v_new.held_at IS NOT NULL AND (NOT isfinite(v_new.held_at) OR v_new.held_at>clock_timestamp() OR v_new.held_at<v_call.started_at))
  OR (v_new.conference_sid IS NOT NULL AND v_new.conference_sid !~ '^CF[0-9a-fA-F]{32}$')
  OR (v_new.customer_sid IS NOT NULL AND v_new.customer_sid !~ '^CA[0-9a-fA-F]{32}$')
  OR (v_new.agent_sid IS NOT NULL AND v_new.agent_sid !~ '^CA[0-9a-fA-F]{32}$')
  OR (v_new.transfer_mode IS NOT NULL AND v_new.transfer_mode NOT IN ('direct','consult'))
  OR (v_new.transfer_status IS NOT NULL AND v_new.transfer_status NOT IN ('dialing','connected','confirmed','failed'))
  OR length(v_new.transfer_name)>200 OR (v_new.customer_sid IS NOT NULL AND v_new.customer_sid=v_new.agent_sid)
  OR (v_session.phase='ended' AND v_new.phase<>'ended') THEN RAISE EXCEPTION 'estado_sesion_invalido' USING ERRCODE='22023'; END IF;
 IF v_new.recording_claim_state IS NULL OR v_new.recording_claim_state NOT IN ('none','pending','confirmed','absent','unknown')
  OR (v_new.recording_claim_until IS NOT NULL AND NOT isfinite(v_new.recording_claim_until))
  OR (v_session.recording_claim_state IN ('confirmed','absent') AND v_new.recording_claim_state<>v_session.recording_claim_state)
  OR (v_session.recording_claim_state='unknown' AND v_new.recording_claim_state NOT IN ('unknown','confirmed','absent'))
  OR (v_session.recording_claim_state='pending' AND v_new.recording_claim_state='none') THEN
  RAISE EXCEPTION 'claim_grabacion_invalido' USING ERRCODE='22023'; END IF;
 IF v_new.recording_claim_state='pending' THEN
  IF v_call.recording_enabled IS DISTINCT FROM true OR v_call.consent_given IS DISTINCT FROM true OR v_call.metadata->>'recording_absent_at' IS NOT NULL
   OR v_call.ended_at IS NOT NULL OR v_new.recording_claim_until IS NULL
   OR (v_session.recording_claim_state='none' AND (v_new.recording_claim_until<=clock_timestamp() OR v_new.recording_claim_until>clock_timestamp()+interval '120 seconds'))
   OR (v_session.recording_claim_state='pending' AND v_new.recording_claim_until IS DISTINCT FROM v_session.recording_claim_until)
   OR NOT EXISTS(SELECT 1 FROM public.call_consents WHERE organization_id=p_org AND call_id=p_call AND consent_type='recording' AND method<>'unverified_announcement') THEN
   RAISE EXCEPTION 'aviso_grabacion_no_acreditado' USING ERRCODE='22023'; END IF;
 END IF;
 IF (v_session.conference_sid IS NOT NULL AND v_new.conference_sid IS DISTINCT FROM v_session.conference_sid)
  OR (v_session.customer_sid IS NOT NULL AND v_new.customer_sid IS DISTINCT FROM v_session.customer_sid) THEN
  RAISE EXCEPTION 'sid_inmutable' USING ERRCODE='22023'; END IF;
 IF p_invite IS NOT NULL THEN
  SELECT * INTO v_invite FROM public.crm_phone_invites WHERE id=p_invite AND organization_id=p_org AND call_id=p_call FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitacion_invalida' USING ERRCODE='22023'; END IF;
  v_invite_new:=jsonb_populate_record(v_invite,p_invite_patch);
  IF v_invite_new.state IS NULL OR v_invite_new.state NOT IN ('reserved','dispatched','ringing','joined','declined','failed','unknown')
   OR (v_invite_new.call_sid IS NOT NULL AND v_invite_new.call_sid !~ '^CA[0-9a-fA-F]{32}$')
   OR (v_invite.call_sid IS NOT NULL AND v_invite_new.call_sid IS DISTINCT FROM v_invite.call_sid)
   OR (v_invite.state IN ('declined','failed') AND v_invite_new.state NOT IN ('declined','failed'))
   OR (v_invite.state='joined' AND v_invite_new.state IN ('reserved','dispatched','ringing')) THEN
   RAISE EXCEPTION 'estado_invitacion_invalido' USING ERRCODE='22023'; END IF;
  IF (v_invite_new.recording_announced_at IS NOT NULL AND (NOT isfinite(v_invite_new.recording_announced_at)
    OR v_invite_new.recording_announced_at>clock_timestamp() OR v_invite_new.recording_announced_at<v_call.started_at))
   OR (v_invite.recording_announced_at IS NOT NULL AND v_invite_new.recording_announced_at IS DISTINCT FROM v_invite.recording_announced_at) THEN
   RAISE EXCEPTION 'aviso_inmutable' USING ERRCODE='22023'; END IF;
  IF v_invite_new.role='transfer' AND v_invite_new.user_id IS NULL AND v_invite_new.state='joined'
   AND (v_call.recording_enabled OR v_session.recording_claim_state IN ('pending','confirmed','unknown')) AND v_invite_new.recording_announced_at IS NULL THEN
   RAISE EXCEPTION 'aviso_transferencia_requerido' USING ERRCODE='22023'; END IF;
 ELSIF p_invite_patch<>'{}'::jsonb THEN RAISE EXCEPTION 'invitacion_invalida' USING ERRCODE='22023'; END IF;
 IF v_new.transfer_invite_id IS NOT NULL THEN
  IF v_new.transfer_invite_id=p_invite THEN v_transfer:=v_invite_new;
  ELSE SELECT * INTO v_transfer FROM public.crm_phone_invites WHERE id=v_new.transfer_invite_id AND organization_id=p_org AND call_id=p_call FOR UPDATE; END IF;
  IF v_transfer.id IS NULL OR v_transfer.role<>'transfer' THEN RAISE EXCEPTION 'transferencia_invalida' USING ERRCODE='22023'; END IF;
 END IF;
 IF p_invite IS NOT NULL AND v_invite.role='transfer' AND (p_session_patch ?| ARRAY['transfer_status','transfer_invite_id','transfer_mode','transfer_name'])
  AND v_new.transfer_invite_id IS DISTINCT FROM p_invite AND NOT (
   v_new.transfer_invite_id IS NULL AND v_session.transfer_invite_id=p_invite AND v_new.transfer_mode IS NULL AND v_new.transfer_status IS NULL
   AND v_new.transfer_name IS NULL AND v_invite_new.state IN ('declined','failed') AND (
    (p_operation_state='succeeded' AND p_operation=v_session.active_operation_id AND EXISTS(SELECT 1 FROM public.crm_phone_operations WHERE id=p_operation
      AND organization_id=p_org AND call_id=p_call AND payload->>'action'='cancel_transfer' AND state IN ('dispatched','unknown')))
    OR (p_operation IS NULL AND p_operation_state IS NULL AND v_session.transfer_mode='consult' AND v_session.transfer_status='confirmed'
      AND v_invite.state='joined' AND v_new.agent_sid IS NOT DISTINCT FROM v_session.agent_sid
      AND v_new.current_agent_user_id IS NOT DISTINCT FROM v_session.current_agent_user_id))) THEN
   RAISE EXCEPTION 'transferencia_obsoleta' USING ERRCODE='22023'; END IF;
 IF v_new.agent_sid IS DISTINCT FROM v_session.agent_sid AND v_new.agent_sid IS NOT NULL THEN
  IF v_invite_new.id IS NULL OR v_invite_new.call_sid IS DISTINCT FROM v_new.agent_sid OR v_invite_new.state<>'joined'
   OR v_invite_new.user_id IS DISTINCT FROM v_new.current_agent_user_id
   OR (v_session.agent_sid IS NULL AND v_invite_new.role<>'agent')
   OR (v_session.agent_sid IS NOT NULL AND (v_invite_new.role<>'transfer' OR v_new.transfer_invite_id IS DISTINCT FROM v_invite_new.id)) THEN
   RAISE EXCEPTION 'propietario_pata_invalido' USING ERRCODE='22023'; END IF;
 ELSIF v_new.current_agent_user_id IS DISTINCT FROM v_session.current_agent_user_id THEN RAISE EXCEPTION 'propietario_pata_invalido' USING ERRCODE='22023'; END IF;
 IF v_new.current_agent_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=p_org AND user_id=v_new.current_agent_user_id AND is_active) THEN
  RAISE EXCEPTION 'propietario_pata_invalido' USING ERRCODE='22023'; END IF;
 IF v_new.customer_sid IS DISTINCT FROM v_session.customer_sid AND v_new.customer_sid IS NOT NULL
  AND (v_invite_new.id IS NULL OR v_invite_new.role<>'customer' OR v_invite_new.state<>'joined' OR v_invite_new.call_sid IS DISTINCT FROM v_new.customer_sid) THEN
  RAISE EXCEPTION 'pata_cliente_invalida' USING ERRCODE='22023'; END IF;
 IF p_operation IS NOT NULL THEN
  SELECT * INTO v_operation FROM public.crm_phone_operations WHERE id=p_operation AND organization_id=p_org AND call_id=p_call FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'operacion_invalida' USING ERRCODE='22023'; END IF;
  IF v_session.active_operation_id IS DISTINCT FROM p_operation OR v_operation.state IN ('succeeded','failed') THEN
   RETURN public.fn_phone_get(p_org,p_call)||jsonb_build_object('stale',true); END IF;
  IF p_operation_state IN ('succeeded','failed') THEN
   IF p_result IS NULL OR p_result='null'::jsonb THEN RAISE EXCEPTION 'resultado_requerido' USING ERRCODE='22023'; END IF;
   v_new.active_operation_id:=NULL;
  ELSIF p_operation_state='unknown' THEN
   IF v_new.phase<>'error' OR v_new.active_operation_id IS DISTINCT FROM p_operation THEN RAISE EXCEPTION 'reconciliacion_requerida' USING ERRCODE='22023'; END IF;
  END IF;
 ELSIF p_operation_state IS NOT NULL OR p_result IS NOT NULL THEN RAISE EXCEPTION 'operacion_invalida' USING ERRCODE='22023';
 ELSIF v_session.active_operation_id IS NOT NULL THEN
  SELECT * INTO v_operation FROM public.crm_phone_operations WHERE id=v_session.active_operation_id AND organization_id=p_org AND call_id=p_call FOR UPDATE;
 END IF;
 IF v_new.active_operation_id IS DISTINCT FROM v_session.active_operation_id AND NOT (v_new.active_operation_id IS NULL AND p_operation=v_session.active_operation_id
  AND p_operation_state IN ('succeeded','failed') AND p_result IS NOT NULL) THEN RAISE EXCEPTION 'reconciliacion_requerida' USING ERRCODE='22023'; END IF;
 IF v_new.phase<>'ended' AND v_new.transfer_status IN ('connected','confirmed') AND (v_transfer.id IS NULL OR v_transfer.state<>'joined') THEN
  RAISE EXCEPTION 'transferencia_no_conectada' USING ERRCODE='22023'; END IF;
 IF (v_call.ended_at IS NOT NULL OR v_call.status IN ('completed','failed','busy','no_answer','canceled','voicemail')) AND v_new.phase<>'ended' THEN
  RAISE EXCEPTION 'llamada_terminada' USING ERRCODE='22023'; END IF;
 v_meta:=CASE WHEN p_call_patch ? 'metadata' THEN p_call_patch->'metadata' ELSE v_call.metadata END;
 IF jsonb_typeof(v_meta) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'metadata_invalida' USING ERRCODE='22023'; END IF;
 v_new.revision:=v_session.revision+1; v_new.updated_at:=now();
 IF p_operation_state IS NOT NULL THEN v_operation.state:=p_operation_state; END IF;
 v_state:=public.fn_phone_state_core(v_new,v_operation);
 v_patch:=p_call_patch||jsonb_build_object('metadata',v_meta||jsonb_build_object('phone_control',v_state));
 v_call_result:=public.fn_crm_callback_llamada(p_org,p_call,p_call_expected,v_patch);
 IF (v_call_result->>'stale')::boolean THEN RETURN public.fn_phone_get(p_org,p_call)||jsonb_build_object('stale',true); END IF;
 v_call:=jsonb_populate_record(v_call,v_call_result->'call');
 IF v_new.recording_claim_state='confirmed' AND NOT coalesce((
  EXISTS(SELECT 1 FROM public.call_recordings WHERE organization_id=p_org AND call_id=p_call AND status IN ('processing','ready') AND provider_recording_sid ~ '^RE[0-9a-fA-F]{32}$')
  OR (v_call.metadata->>'recording_started_sid' ~ '^RE[0-9a-fA-F]{32}$' AND CASE
   WHEN v_call.metadata->>'recording_started_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' THEN
    isfinite((v_call.metadata->>'recording_started_at')::timestamptz) AND (v_call.metadata->>'recording_started_at')::timestamptz<=clock_timestamp()
    AND (v_call.metadata->>'recording_started_at')::timestamptz>=v_call.started_at ELSE false END)),false) THEN
  RAISE EXCEPTION 'evidencia_grabacion_requerida' USING ERRCODE='22023'; END IF;
 IF v_new.recording_claim_state='pending' AND (v_call.recording_enabled IS DISTINCT FROM true OR v_call.consent_given IS DISTINCT FROM true
   OR v_call.metadata->>'recording_absent_at' IS NOT NULL OR v_call.ended_at IS NOT NULL) THEN
  RAISE EXCEPTION 'aviso_grabacion_no_acreditado' USING ERRCODE='22023'; END IF;
 IF v_new.recording_claim_state='absent' AND v_session.recording_claim_state IN ('pending','unknown')
  AND (v_call.ended_at IS NULL OR EXISTS(SELECT 1 FROM public.call_recordings WHERE organization_id=p_org AND call_id=p_call)) THEN
  RAISE EXCEPTION 'reconciliacion_grabacion_requerida' USING ERRCODE='22023'; END IF;
 IF (v_call.ended_at IS NOT NULL OR v_call.status IN ('completed','failed','busy','no_answer','canceled','voicemail')) AND v_new.phase<>'ended' THEN
  RAISE EXCEPTION 'cierre_sesion_requerido' USING ERRCODE='22023'; END IF;
 IF p_invite IS NOT NULL THEN
  UPDATE public.crm_phone_invites SET call_sid=v_invite_new.call_sid,state=v_invite_new.state,recording_announced_at=v_invite_new.recording_announced_at,updated_at=now() WHERE id=p_invite; END IF;
 IF p_operation IS NOT NULL AND p_operation_state IS NOT NULL THEN
  UPDATE public.crm_phone_operations SET state=p_operation_state,result=coalesce(p_result,result),
   error_code=CASE p_operation_state WHEN 'unknown' THEN 'provider_unknown' WHEN 'failed' THEN 'provider_failed' ELSE NULL END,updated_at=now()
   WHERE id=p_operation; END IF;
 UPDATE public.crm_phone_sessions SET revision=v_new.revision,conference_sid=v_new.conference_sid,customer_sid=v_new.customer_sid,agent_sid=v_new.agent_sid,
  current_agent_user_id=v_new.current_agent_user_id,phase=v_new.phase,held_at=v_new.held_at,hold_seconds=v_new.hold_seconds,
  pre_hold_muted=v_new.pre_hold_muted,transfer_restore_held=v_new.transfer_restore_held,transfer_invite_id=v_new.transfer_invite_id,transfer_mode=v_new.transfer_mode,
  recording_claim_state=v_new.recording_claim_state,recording_claim_until=v_new.recording_claim_until,
  transfer_status=v_new.transfer_status,transfer_name=v_new.transfer_name,active_operation_id=v_new.active_operation_id,updated_at=now()
  WHERE call_id=p_call AND organization_id=p_org;
 RETURN public.fn_phone_get(p_org,p_call)||jsonb_build_object('stale',false,'invite',CASE WHEN p_invite IS NOT NULL THEN to_jsonb(v_invite_new) END);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_phone_apply(integer,uuid,bigint,jsonb,jsonb,jsonb,uuid,jsonb,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_phone_apply(integer,uuid,bigint,jsonb,jsonb,jsonb,uuid,jsonb,uuid,text,jsonb) TO service_role;

-- Reemplazo mínimo del cuerpo aplicado ce9624a33ee572c1816e3d1c1f1b048d.
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
  IF EXISTS(SELECT 1 FROM public.call_recordings WHERE organization_id=p_org AND call_id=p_call)
    OR v_call.metadata->>'recording_started_sid' ~ '^RE[0-9a-fA-F]{32}$'
    OR EXISTS(SELECT 1 FROM public.crm_phone_sessions WHERE organization_id=p_org AND call_id=p_call AND recording_claim_state IN ('pending','unknown','confirmed')) THEN
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
