-- Rollback de 20261025134155 (versión sin bloqueo al guardar): quita la validación DIAN, la cola y los helpers.
-- Los drop de triggers/funciones de la versión anterior quedan por si se aplicó aquella.
drop view if exists public.v_lineas_sin_tercero;
drop function if exists public.fn_validar_identificacion_para_dian(integer, text);
drop trigger if exists trg_00_tercero_obligatorio on public.support_documents;
drop trigger if exists trg_00_tercero_obligatorio on public.invoice_purchase;
drop trigger if exists zy_trg_tercero_obligatorio_linea on public.journal_lines;
drop function if exists public.fn_trg_tercero_obligatorio_documento();
drop function if exists public.fn_trg_tercero_obligatorio_linea();
drop function if exists public.fn_origen_exige_tercero(text);
drop function if exists public.fn_cuenta_exige_tercero(integer, text);
drop function if exists public.fn_tercero_vacio(text);
delete from supabase_migrations.schema_migrations where version = '20261025134155';
