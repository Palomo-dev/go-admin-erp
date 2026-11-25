-- Reversión de 20261126030000_ajuste_vueltas_recaudo_org377_caja43.sql
--
-- Borra EXACTAMENTE los dos asientos de la corrección de vueltas de la caja 43 (RC-0018 y RC-0019,
-- fact_key vueltas_recaudo:<pago>) con el interruptor de mantenimiento de asientos publicados. No toca
-- los seis de 20261126020000 ni los pagos ni los asientos originales. Los números de nota contable (NA)
-- que tomaron quedan saltados: el consecutivo no retrocede. Lo preferible, si el Contador lo pide, es
-- un contra-asiento con fecha nueva en vez de borrar.

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
     and e.fact_key in (
       select 'vueltas_recaudo:' || p.id::text from public.payments p
        where p.organization_id = 377 and p.receipt_number in ('RC-0018', 'RC-0019'));
  get diagnostics v_l = row_count;
  delete from public.journal_entries e
   where e.organization_id = 377
     and e.fact_key in (
       select 'vueltas_recaudo:' || p.id::text from public.payments p
        where p.organization_id = 377 and p.receipt_number in ('RC-0018', 'RC-0019'));
  get diagnostics v_e = row_count;
  perform set_config('app.contabilidad_mantenimiento', '', true);
  raise notice 'Corrección de vueltas caja 43 borrada: % asientos, % líneas', v_e, v_l;
end
$borrar$;
