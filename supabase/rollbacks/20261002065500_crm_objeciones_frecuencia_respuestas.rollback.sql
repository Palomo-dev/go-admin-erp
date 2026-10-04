-- Retain mined rows: rollback removes only the new runtime entry points.
DROP FUNCTION IF EXISTS public.crm_objection_frequency(integer,timestamptz,text,uuid);
DROP FUNCTION IF EXISTS public.crm_objection_mine(integer,timestamptz,uuid,integer);
DROP FUNCTION IF EXISTS public.crm_objection_hits(integer,timestamptz,timestamptz,uuid[]);
DROP FUNCTION IF EXISTS public.crm_objection_register(integer,uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS public.crm_objection_catalog_write(integer,uuid,timestamptz,jsonb,boolean);
NOTIFY pgrst,'reload schema';
