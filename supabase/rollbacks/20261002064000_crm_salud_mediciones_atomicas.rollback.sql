-- Sólo funciones nuevas; no modifica configuraciones, scores, snapshots ni jobs.
DROP FUNCTION IF EXISTS public.fn_crm_configurar_salud(integer,jsonb,timestamptz);
DROP FUNCTION IF EXISTS public.fn_crm_encolar_salud(integer);
DROP FUNCTION IF EXISTS public.fn_crm_guardar_mediciones_salud(integer,jsonb,timestamptz,timestamptz);
DROP FUNCTION IF EXISTS public.fn_crm_salud_base(integer,uuid[]);
DROP FUNCTION IF EXISTS public.fn_crm_exigir_admin_salud(integer);
DROP FUNCTION IF EXISTS public.fn_crm_validar_config_salud(jsonb);
