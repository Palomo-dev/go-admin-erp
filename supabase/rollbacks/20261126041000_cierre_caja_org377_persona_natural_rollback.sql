-- Reversión de 20261126041000_cierre_caja_org377_persona_natural.sql
--
-- Borra EXACTAMENTE los asientos de esa migración (org 377, fact_key cierre_caja_v2:%) con el
-- interruptor de mantenimiento de asientos publicados, y quita la 3130 «Capital de personas
-- naturales» de la org 377 si ya no tiene movimientos ni subcuentas (la creó esa migración).
-- No toca los asientos originales de los cierres, ni las sesiones de caja, ni las correcciones de
-- vueltas, ni las cuentas 42958102/53959502 (son de 20261126040000). Los números de nota contable
-- (NA-641 a NA-649) quedan saltados: el consecutivo no retrocede. Lo preferible, si el Contador lo
-- pide, es un contra-asiento con fecha nueva en vez de esta reversión.

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
     and e.fact_key like 'cierre_caja_v2:%';
  get diagnostics v_l = row_count;
  delete from public.journal_entries e
   where e.organization_id = 377
     and e.fact_key like 'cierre_caja_v2:%';
  get diagnostics v_e = row_count;
  perform set_config('app.contabilidad_mantenimiento', '', true);

  delete from public.chart_of_accounts c
   where c.organization_id = 377 and c.account_code = '3130'
     and not exists (select 1 from public.journal_lines l
                       join public.journal_entries e on e.id = l.journal_entry_id
                      where e.organization_id = 377 and l.account_code = '3130')
     and not exists (select 1 from public.chart_of_accounts h
                      where h.organization_id = 377 and h.parent_code = '3130');

  raise notice 'Cierre de caja org 377 (persona natural) borrado: % asientos, % líneas', v_e, v_l;
end
$borrar$;
