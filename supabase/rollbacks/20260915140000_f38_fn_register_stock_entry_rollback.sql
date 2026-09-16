-- Rollback F-38/F-36: eliminar fn_register_stock_entry

DROP FUNCTION IF EXISTS public.fn_register_stock_entry(jsonb, text);
