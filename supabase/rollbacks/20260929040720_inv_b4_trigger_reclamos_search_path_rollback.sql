-- Reversión de 20260929040720_inv_b4_trigger_reclamos_search_path.sql.

alter function public.fn_update_warranty_claims_updated_at() reset search_path;
