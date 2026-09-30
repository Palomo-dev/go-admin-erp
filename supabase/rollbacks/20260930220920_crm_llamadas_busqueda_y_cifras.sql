-- La función y los índices son aditivos; se conserva el esquema y se retira la API nueva.
revoke execute on function public.crm_calls_list(integer,jsonb) from authenticated,service_role;
-- Volver al código anterior deja de usar esta RPC. No se borran llamadas ni transcripciones.
