-- Conservar categorías e historial. Revertir el código antes de retirar ejecución.
revoke execute on function public.crm_forecast_snapshot(integer,text,uuid,uuid) from authenticated,service_role;
revoke execute on function public.crm_set_forecast_category(integer,uuid,text,timestamptz) from authenticated,service_role;
revoke execute on function public.crm_record_forecast_adjustment(integer,uuid,text,uuid,numeric,numeric,text,text,text,text,uuid) from service_role;
alter table public.opportunities disable trigger trg_crm_forecast_category_audit;
