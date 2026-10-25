-- Comisiones, 25-oct-2026, paso 4 de 4: org 113, anular las 2 comisiones nacidas de facturas de compra (bug, $41.300):
-- 21677585… ($19.500) y bd9629cc… ($21.800), status 'accrued', source_type 'invoice_purchase'. NO aplicada.
-- [DATO PROD → OK DIRECTO de Juan.] Requiere 134100 (su CHECK deja 'cancelled' fuera, ALTO#2) y 134130 (ALTO#1).
--   1. Verifica, y si algo no coincide ABORTA sin tocar nada: org 113, 2 filas, montos 19.500 y 21.800, total 41.300;
--      asientos 1573 y 1574 de la org 113, contabilizados, sin reversa previa, uno por comisión: enlazados por
--      source_id (comisión || ':accrued' o el id solo) o, si no enlazan (QA: no se encontró el enlace en prosrc), por
--      monto exacto de la comisión.
--   2. Revierte 1573/1574 con fn_revertir_asiento_en_fecha (contraasiento FECHADO '2026-10-25' 12:00 COT; nunca se
--      borra ni edita un asiento). Exige octubre ABIERTO.
--   3. status → 'cancelled'. El trigger de anulación no duplica la reversa (salta asientos ya revertidos).
-- Idempotente: si ya están 'cancelled' y los asientos revertidos, no hace nada.
-- Rollback: supabase/rollbacks/20261025134140_org113_anular_comisiones_factura_compra_rollback.sql

do $$
declare
  r record;
  v_n integer;
  v_total numeric;
  v_entry integer;
  v_rev integer;
begin
  select count(*), coalesce(sum(c.commission_amount), 0) into v_n, v_total
    from public.commissions c
   where c.organization_id = 113 and c.source_type = 'invoice_purchase'
     and (c.id::text like '21677585%' or c.id::text like 'bd9629cc%');
  if v_n <> 2 or v_total <> 41300 then
    raise exception '134140: org 113 esperaba 2 comisiones invoice_purchase por 41.300; hay % por %', v_n, v_total;
  end if;
  if not exists (select 1 from public.commissions c where c.organization_id = 113 and c.source_type = 'invoice_purchase'
                   and (c.id::text like '21677585%' or c.id::text like 'bd9629cc%') and c.status <> 'cancelled') then
    raise notice '134140: ya aplicada';
    return;
  end if;
  if not exists (select 1 from public.fiscal_periods fp where fp.organization_id = 113 and fp.period_type = 'monthly'
                   and fp.status = 'open' and date '2026-10-25' between fp.start_date and fp.end_date) then
    raise exception '134140: org 113 con octubre 2026 cerrado; abrir el período antes de aplicar';
  end if;

  for r in select c.id, c.commission_amount, c.status from public.commissions c
            where c.organization_id = 113 and c.source_type = 'invoice_purchase'
              and (c.id::text like '21677585%' or c.id::text like 'bd9629cc%') order by c.id loop
    if r.status = 'cancelled' then continue; end if;
    if r.status <> 'accrued' then
      raise exception '134140: comisión % en estado % (se esperaba accrued)', r.id, r.status;
    end if;
    -- asiento de la comisión: por source_id; si no, 1573/1574 por monto exacto
    select je.id into v_entry from public.journal_entries je
     where je.organization_id = 113 and je.id in (1573, 1574)
       and je.source_id in (r.id::text, r.id::text || ':accrued');
    if v_entry is null then
      select count(*), min(je.id) into v_n, v_entry from public.journal_entries je
       where je.organization_id = 113 and je.id in (1573, 1574)
         and (select sum(l.debit) from public.journal_lines l where l.journal_entry_id = je.id) = r.commission_amount;
      if v_n <> 1 then
        raise exception '134140: no se puede enlazar la comisión % (%) con un único asiento 1573/1574; revisar a mano', r.id, r.commission_amount;
      end if;
    end if;
    if not exists (select 1 from public.journal_entries je where je.id = v_entry and je.posted is true) then
      raise exception '134140: asiento % no está contabilizado', v_entry;
    end if;
    if not exists (select 1 from public.journal_entries x where x.organization_id = 113 and x.fact_key = 'reversal:' || v_entry) then
      v_rev := public.fn_revertir_asiento_en_fecha(v_entry, 'anulacion_comision', 'comision:' || r.id::text,
                                                   '2026-10-25 12:00 America/Bogota'::timestamptz, null);
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      values ('134140', 113, 'journal_entries', v_rev::text, 'reversa', v_entry::text, r.id::text);
    end if;
    update public.commissions set status = 'cancelled', updated_at = now() where id = r.id;
    insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
    values ('134140', 113, 'commissions', r.id::text, 'status', r.status, 'cancelled');
  end loop;
end $$;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261025134140', 'org113_anular_comisiones_factura_compra', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
