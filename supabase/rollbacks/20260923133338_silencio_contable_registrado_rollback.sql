-- Rollback de 20260923133338_silencio_contable_registrado.sql
-- (y de 20260923133424, que reaplica lo mismo en fn_auto_journal_stock_movement).
--
-- Quita el registro marcado /* registro-sin-regla */ de los disparadores
-- fn_auto_journal_*, devolviendo exactamente `IF v_rule IS NULL THEN RETURN NEW;`
-- sobre la definición vigente (no pisa otros cambios posteriores), y retira la
-- vista de salud. fn_create_journal_entry_with_discount conserva el registro:
-- volver a RAISE NOTICE no aporta nada y su firma no cambió.
do $$
declare
  r record;
  v_def text;
begin
  for r in select p.oid from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prosrc like '%registro-sin-regla%'
  loop
    v_def := regexp_replace(pg_get_functiondef(r.oid),
      'IF v_rule IS NULL THEN /\* registro-sin-regla \*/ PERFORM fn_log_journal_failure\(.*?\); RETURN NEW;',
      'IF v_rule IS NULL THEN RETURN NEW;', 'g');
    execute v_def;
  end loop;
end $$;

drop view if exists public.v_salud_contable;
