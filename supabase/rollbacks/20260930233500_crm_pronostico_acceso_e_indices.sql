-- Reversión técnica bloqueada: la ACL anterior expone datos de otros tenants.
-- Recuperar el runtime con la RPC autorizada y conservar la vista privada.
-- No restaura datos ni elimina índices. Nunca concede SELECT a anon/authenticated.
DO $reversion_privacidad$
BEGIN
  RAISE EXCEPTION 'reversion_insegura_mv_crm_forecast: conservar el acceso mediante la RPC autorizada'
    USING ERRCODE='P0001';
END;
$reversion_privacidad$;
