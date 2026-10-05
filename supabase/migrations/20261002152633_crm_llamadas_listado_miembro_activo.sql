-- Exige miembro activo en el listado de llamadas; conserva el delta de sucursales.
-- No modifica filas; sólo MCP tras gate acotado. No usa SQLSTATE 40001.
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='4s';
DO $crm_call_membership_delta$
DECLARE v_item jsonb; v_patch jsonb; v_oid oid; v_source text; v_definition text; v_metadata jsonb; v_current jsonb;
BEGIN
 FOR v_item IN SELECT value FROM jsonb_array_elements($crm_call_membership_manifest$[{"signature":"public.crm_calls_list(integer,jsonb)","acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","config":["search_path=public, pg_temp"],"owner":"postgres","security_definer":true,"before":"2645f28d3f4335dca1af203e17ae963b","after":"d687303712bed32ba1d17ec07bfe35cc","patches":[{"before":"  perform public.fn_assert_acceso_org(p_org);","after":"  perform public.fn_assert_acceso_org(p_org);\n  -- La pertenencia debe estar activa también para owner/creator de la org.\n  if auth.uid() is not null and not exists(select 1 from public.organization_members om\n    where om.organization_id=p_org and om.user_id=auth.uid() and om.is_active) then\n    raise exception 'sin_permiso' using errcode='42501';\n  end if;"}]}]$crm_call_membership_manifest$::jsonb) LOOP
  v_oid:=to_regprocedure(v_item->>'signature');
  IF v_oid IS NULL THEN RAISE EXCEPTION 'rpc_llamadas_ausente' USING ERRCODE='P0001'; END IF;
  SELECT p.prosrc,(to_jsonb(p)-'prosrc'-'proargdefaults') || jsonb_build_object('function_arguments',pg_get_function_arguments(p.oid),'default_ast_without_locations',regexp_replace(p.proargdefaults::text,':location -?[0-9]+',':location <offset>','g')) INTO v_source,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
  IF (SELECT p.proacl::text FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_item->>'acl'
   OR (SELECT to_jsonb(p.proconfig) FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_item->'config'
   OR (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_item->>'owner'
   OR (SELECT p.prosecdef FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM (v_item->>'security_definer')::boolean THEN
   RAISE EXCEPTION 'contrato_rpc_llamadas_modificado' USING ERRCODE='P0001'; END IF;
  IF md5(v_source)=v_item->>'after' THEN CONTINUE; END IF;
  IF md5(v_source) IS DISTINCT FROM v_item->>'before' THEN
   RAISE EXCEPTION 'fuente_rpc_llamadas_modificada' USING ERRCODE='P0001'; END IF;
  v_definition:=pg_get_functiondef(v_oid);
  FOR v_patch IN SELECT value FROM jsonb_array_elements(v_item->'patches') LOOP
   IF length(v_definition)-length(replace(v_definition,v_patch->>'before',''))<>length(v_patch->>'before') THEN
    RAISE EXCEPTION 'delta_rpc_llamadas_ambiguo' USING ERRCODE='P0001'; END IF;
   v_definition:=replace(v_definition,v_patch->>'before',v_patch->>'after');
  END LOOP;
  EXECUTE v_definition;
  SELECT p.prosrc,(to_jsonb(p)-'prosrc'-'proargdefaults') || jsonb_build_object('function_arguments',pg_get_function_arguments(p.oid),'default_ast_without_locations',regexp_replace(p.proargdefaults::text,':location -?[0-9]+',':location <offset>','g')) INTO v_source,v_current FROM pg_proc p WHERE p.oid=v_oid;
  IF md5(v_source) IS DISTINCT FROM v_item->>'after' OR v_metadata IS DISTINCT FROM v_current THEN
   RAISE EXCEPTION 'contrato_rpc_llamadas_no_conservado' USING ERRCODE='P0001'; END IF;
 END LOOP;
END;
$crm_call_membership_delta$;
