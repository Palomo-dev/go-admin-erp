-- Corrección puntual del SQLSTATE de conflictos deterministas.
-- Nueve RPC existentes; no modifica filas, firmas, locks, mensajes ni permisos.
-- Conserva el AST de defaults salvo offsets del parser y sus argumentos deparseados.
-- Aplicar únicamente mediante MCP después de aprobar el gate acotado.
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='4s';
DO $crm_conflict_forward$
DECLARE
 v_item jsonb; v_oid oid; v_source text; v_definition text;
 v_acl text; v_config jsonb; v_owner text; v_definer boolean;
 v_metadata jsonb; v_current_metadata jsonb;
BEGIN
 FOR v_item IN SELECT value FROM jsonb_array_elements($crm_conflict_manifest$[{"signature":"public.crm_objection_catalog_write(integer,uuid,timestamp with time zone,jsonb,boolean)","before":"fedf41a50cabc2286149d5684c56f5bd","after":"7c8ab4d2358986429e5f094331ff169f","changes":1,"acl":"{postgres=X/postgres,authenticated=X/postgres}","config":["search_path=public, pg_temp"],"owner":"postgres","security_definer":true},{"signature":"public.crm_team_management_write(integer,uuid,text,uuid,timestamp with time zone,jsonb)","before":"6882b9eeb534d30541260cace09ad03f","after":"e0c609a3264a2550aaea2384d78e36b4","changes":4,"acl":"{postgres=X/postgres,authenticated=X/postgres}","config":["search_path=public, pg_temp"],"owner":"postgres","security_definer":true},{"signature":"public.fn_crm_convertir_referido(integer,uuid,uuid,uuid,jsonb,jsonb,jsonb)","before":"eb432e11b03254fbe6019a336ff54a1b","after":"52bd8f753e9ae4132c27e97ca57cdc8a","changes":1,"acl":"{postgres=X/postgres,service_role=X/postgres}","config":["search_path=public, pg_temp"],"owner":"postgres","security_definer":true},{"signature":"public.fn_crm_registrar_partner_deal(integer,uuid,uuid,uuid,text,jsonb,numeric,uuid,timestamp with time zone)","before":"ee0d0c59c22887a47e417ddb97c6750c","after":"ed37127b8430364f927503eb8cba3337","changes":1,"acl":"{postgres=X/postgres,service_role=X/postgres}","config":["search_path=public, pg_temp"],"owner":"postgres","security_definer":true},{"signature":"public.fn_crm_vincular_llamada(integer,uuid,text,jsonb)","before":"fe99e3af9efbe62590f56e4b33a2aaac","after":"2dea24acc694be4888da41f910a8ef09","changes":4,"acl":"{postgres=X/postgres,authenticated=X/postgres}","config":["search_path=public, pg_temp"],"owner":"postgres","security_definer":true},{"signature":"public.fn_phone_claim(integer,uuid,uuid,jsonb)","before":"43a7f9acf0c9d148cd29c0b0e0cc5631","after":"2a0d95076def5117a4e2fe8a0eddb87d","changes":2,"acl":"{postgres=X/postgres,authenticated=X/postgres}","config":["search_path=public, pg_temp"],"owner":"postgres","security_definer":true},{"signature":"public.fn_phone_invite(integer,uuid,uuid,jsonb)","before":"ca814eba09a772e445c6bcb66b0384e8","after":"e84c023266593a92c10f0ee3cab7f402","changes":1,"acl":"{postgres=X/postgres,service_role=X/postgres}","config":["search_path=public, pg_temp"],"owner":"postgres","security_definer":true},{"signature":"public.fn_phone_reject_invite(integer,uuid,uuid)","before":"1712b7e7324de141ba84aadf38d45481","after":"dbbf67f2922f3c196a49fd4884b7df6d","changes":2,"acl":"{postgres=X/postgres,authenticated=X/postgres}","config":["search_path=public, pg_temp"],"owner":"postgres","security_definer":true},{"signature":"public.fn_phone_verify_mobile(integer,uuid,text,jsonb)","before":"75b5724b6539197bc4d313178871f0a8","after":"7c708a8a29e16513b417e6c57ca3e73e","changes":1,"acl":"{postgres=X/postgres,service_role=X/postgres}","config":["search_path=public, pg_temp"],"owner":"postgres","security_definer":true}]$crm_conflict_manifest$::jsonb)
 LOOP
  v_oid:=to_regprocedure(v_item->>'signature');
  IF v_oid IS NULL THEN RAISE EXCEPTION 'rpc_conflicto_ausente'; END IF;
  SELECT p.prosrc,p.proacl::text,to_jsonb(p.proconfig),pg_get_userbyid(p.proowner),p.prosecdef,
    (to_jsonb(p)-'prosrc'-'proargdefaults') || jsonb_build_object(
      'function_arguments',pg_get_function_arguments(p.oid),
      'default_ast_without_locations',regexp_replace(p.proargdefaults::text,':location -?[0-9]+',':location <offset>','g'))
   INTO v_source,v_acl,v_config,v_owner,v_definer,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
  IF v_acl IS DISTINCT FROM v_item->>'acl' OR v_config IS DISTINCT FROM v_item->'config'
   OR v_owner IS DISTINCT FROM v_item->>'owner'
   OR v_definer IS DISTINCT FROM (v_item->>'security_definer')::boolean THEN
   RAISE EXCEPTION 'contrato_rpc_conflicto_modificado'; END IF;
  IF md5(v_source)=v_item->>'after' THEN CONTINUE; END IF;
  IF md5(v_source) IS DISTINCT FROM v_item->>'before' THEN
   RAISE EXCEPTION 'fuente_rpc_conflicto_modificada'; END IF;
  v_definition := replace(pg_get_functiondef(v_oid), '''40001''', '''P0001''');
  EXECUTE v_definition;
  SELECT p.prosrc,(to_jsonb(p)-'prosrc'-'proargdefaults') || jsonb_build_object(
      'function_arguments',pg_get_function_arguments(p.oid),
      'default_ast_without_locations',regexp_replace(p.proargdefaults::text,':location -?[0-9]+',':location <offset>','g')) INTO v_source,v_current_metadata FROM pg_proc p WHERE p.oid=v_oid;
  IF md5(v_source) IS DISTINCT FROM v_item->>'after' OR v_metadata IS DISTINCT FROM v_current_metadata THEN
   RAISE EXCEPTION 'contrato_rpc_conflicto_no_conservado'; END IF;
 END LOOP;
END;
$crm_conflict_forward$;
