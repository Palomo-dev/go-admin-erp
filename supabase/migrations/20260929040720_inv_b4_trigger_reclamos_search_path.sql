-- Inventario B4 · El disparador updated_at de warranty_claims fija search_path
-- (aviso function_search_path_mutable de get_advisors). Sin cambio de
-- comportamiento.

alter function public.fn_update_warranty_claims_updated_at() set search_path = public, pg_temp;
