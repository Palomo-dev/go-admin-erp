-- Reversión de 20261126020000_ajuste_vueltas_recaudo_org377.sql
--
-- Borra EXACTAMENTE los asientos de la corrección de vueltas (fact_key vueltas_recaudo:<pago>) con
-- el interruptor de mantenimiento de asientos publicados. Los números de nota contable (NA) que
-- tomaron quedan saltados: el consecutivo no retrocede. No toca pagos ni los asientos originales.
-- Lo preferible, si el Contador lo pide, es un contra-asiento con fecha nueva en vez de borrar.

DO $borrar$
declare
  v_l integer;
  v_e integer;
begin
  perform set_config('app.contabilidad_mantenimiento', 'on', true);
  delete from public.journal_lines l
   using public.journal_entries e
   where l.journal_entry_id = e.id
     and e.organization_id = 377
     and e.fact_key like 'vueltas_recaudo:%';
  get diagnostics v_l = row_count;
  delete from public.journal_entries e
   where e.organization_id = 377
     and e.fact_key like 'vueltas_recaudo:%';
  get diagnostics v_e = row_count;
  perform set_config('app.contabilidad_mantenimiento', '', true);
  raise notice 'Corrección de vueltas borrada: % asientos, % líneas', v_e, v_l;
end
$borrar$;
