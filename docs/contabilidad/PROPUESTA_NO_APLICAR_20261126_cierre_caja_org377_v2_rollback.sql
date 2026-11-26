-- ═══ SUPERADA (2026-11-25) — NO EJECUTAR ═══════════════════════════════════════════════════════
-- El Contador aprobó estos asientos con el caso PERSONA NATURAL (la org 377 lo es: razón social =
-- nombre del dueño, NIT de persona natural). Se aplicaron con cuentas distintas a las de abajo:
-- 3130 en vez de 133015/1325 y 2380, y la nota «Retiro del propietario · por legalizar».
--   Aplicado:  supabase/migrations/20261126041000_cierre_caja_org377_persona_natural.sql (NA-641 a NA-649)
--   Reversión: supabase/rollbacks/20261126041000_cierre_caja_org377_persona_natural_rollback.sql
--   Cierre automático (sobrantes 42958102 / faltantes 53959502):
--              supabase/migrations/20261126040000_cierre_caja_sobrantes_faltantes.sql
-- Este archivo queda solo como antecedente de la revisión.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- Reversión de PROPUESTA_NO_APLICAR_20261126_cierre_caja_org377_v2.sql (solo si se aplicó).
--
-- Borra EXACTAMENTE los asientos de esa propuesta (org 377, fact_key cierre_caja_v2:%) con el
-- interruptor de mantenimiento de asientos publicados, y deshace la creación de la 133015 si la hizo
-- esa propuesta y nadie más la usó (1330 vuelve a ser de movimiento y se quita la sucesora).
-- No toca los asientos originales de los cierres, ni las sesiones de caja, ni las correcciones de
-- vueltas. Los números de nota contable (NA) que tomaron quedan saltados: el consecutivo no
-- retrocede. Lo preferible, si el Contador lo pide, es un contra-asiento con fecha nueva.

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

  -- La 133015 solo se quita si la creó la propuesta (created_by nulo) y ya no tiene movimientos.
  if exists (select 1 from public.chart_of_accounts c
              where c.organization_id = 377 and c.account_code = '133015' and c.created_by is null)
     and not exists (select 1 from public.journal_lines l
                       join public.journal_entries e on e.id = l.journal_entry_id
                      where e.organization_id = 377 and l.account_code = '133015') then
    delete from public.plan_cuentas_sucesoras
     where organization_id = 377 and account_code = '1330' and sucesora = '133015';
    delete from public.chart_of_accounts where organization_id = 377 and account_code = '133015';
    update public.chart_of_accounts set es_movimiento = true, updated_at = now()
     where organization_id = 377 and account_code = '1330'
       and not exists (select 1 from public.chart_of_accounts h
                        where h.organization_id = 377 and h.parent_code = '1330');
  end if;

  raise notice 'Cierre de caja v2 org 377 borrado: % asientos, % líneas', v_e, v_l;
end
$borrar$;
