-- Expansion-only rollback: previous tables and customer prepared core are preserved.
DROP FUNCTION IF EXISTS public.fn_crm_registrar_partner_deal(integer,uuid,uuid,uuid,text,jsonb,numeric,uuid,timestamptz);
DROP FUNCTION IF EXISTS public.fn_crm_partner_deal_base(integer,uuid,uuid,uuid,timestamptz);
DROP FUNCTION IF EXISTS public.fn_crm_convertir_referido(integer,uuid,uuid,uuid,jsonb,jsonb,jsonb);
DROP FUNCTION IF EXISTS public.fn_crm_referido_base(integer,uuid,uuid,uuid);
DROP FUNCTION IF EXISTS public.fn_crm_red_actor_sucursal(integer,uuid,text,integer);
DROP INDEX IF EXISTS public.partner_deals_active_opportunity_org_unique;
