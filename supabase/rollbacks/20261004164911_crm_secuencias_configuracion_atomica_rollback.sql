-- REVERSIÓN DE RPC ADITIVAS: retirar después de volver al runtime compatible.
-- No borra secuencias creadas ni restaura configuración eliminada por el usuario.
-- Ningún consumidor antiguo debe recuperar permiso de borrar historial.
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
DROP FUNCTION IF EXISTS public.fn_crm_delete_sequence(integer,uuid);
DROP FUNCTION IF EXISTS public.fn_crm_create_sequence(integer,jsonb);
NOTIFY pgrst,'reload schema';
