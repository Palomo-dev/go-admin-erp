-- Conserva deals y auditoría registrada; no borra ni modifica datos.
-- El writer original de nueve argumentos nunca se alteró y sigue disponible.
DROP FUNCTION IF EXISTS public.fn_crm_registrar_partner_deal_auditado(integer,uuid,uuid,uuid,text,jsonb,numeric,uuid,timestamptz,uuid,numeric,numeric,jsonb);
DROP FUNCTION IF EXISTS public.fn_crm_partner_deal_receipt(integer,uuid,uuid,uuid,text,uuid,numeric);
REVOKE ALL ON public.crm_partner_deal_receipts FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.crm_partner_deal_receipts IS
  'Auditoría de deals conservada tras rollback. Sin API directa ni funciones de replay activas.';
