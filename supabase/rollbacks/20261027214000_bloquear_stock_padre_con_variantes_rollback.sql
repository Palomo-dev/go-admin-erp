drop trigger if exists trg_bloquear_stock_padre_variantes on public.stock_movements;
drop trigger if exists trg_bloquear_stock_padre_variantes on public.stock_levels;
drop function if exists public.fn_bloquear_stock_padre_variantes();
delete from supabase_migrations.schema_migrations where version = '20261027214000';
