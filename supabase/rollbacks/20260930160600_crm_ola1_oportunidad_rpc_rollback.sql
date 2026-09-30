-- Rollback de 20260930160600_crm_ola1_oportunidad_rpc.sql
--
-- Borra las RPC de oportunidad y sus helpers. Las rutas POST/PATCH/DELETE
-- /api/crm/opportunities y POST /api/crm/leads/[id]/qualify responden 500
-- mientras no se revierta también el código. Los datos escritos por las RPC
-- (oportunidades, líneas, actividades) se conservan.

drop function if exists public.crm_delete_opportunity(integer, uuid);
drop function if exists public.crm_update_opportunity(integer, uuid, jsonb, timestamptz);
drop function if exists public.crm_create_opportunity(integer, jsonb);
drop function if exists public.fn_crm_opp_validar_campos(integer, jsonb);
drop function if exists public.fn_crm_opp_lineas_aplicar(integer, uuid, jsonb);
drop function if exists public.fn_crm_uuid_o_null(text);
