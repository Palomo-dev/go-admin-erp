-- Org 140, 25-oct-2026: saldo de costo en 6135 (título del PUC; $2.300 contabilizados por movimientos de
-- inventario: asientos 49403 C500, 50559 D500, 50551 D500, 50644 D1800) -> 61400501, con un asiento de
-- reclasificación del mismo tipo que 134060 (source 'reclasificacion_titulo', fact_key 'p1_reclasif_6135:140';
-- 'p1_reclasif_auxiliar' ya lo usa el asiento 52540). NO aplicada.
-- Paso 4 de 4. Nota: en la base la org 140 es type_id 1 (restaurante), no 2; se hace igual, como se pidió.
-- 2408 (-1.600, venta 26ed882f del 22-oct, asiento 47437) NO se incluye: la venta es "Impuesto al consumo 8% (INC)"
-- (sale_items.tax_rate = 8, 1.600 / 20.000), no IVA 19% ni 5%; ni 24080501 ni 24080502 sirven. Lo reclasifica 20261025134120 a 24950501.
-- Borradores en 6135 de la org 140 -> 61400501. 6135 pasa a TÍTULO si nada la referencia y queda en saldo 0.
-- Bitácora '134085'. Fecha del asiento: '2026-10-25' 12:00 COT EXPLÍCITA (no la fecha del servidor); exige octubre abierto.
-- Rollback: supabase/rollbacks/20261025134085_org140_reclasificar_6135_rollback.sql

do $$
declare
  v_org constant integer := 140;
  v_saldo numeric;
  v_fecha date;
  v_branch integer;
  v_entry integer;
  r record;
begin
  if not exists (select 1 from public.chart_of_accounts where organization_id = v_org
                  and account_code = '61400501' and es_movimiento is true) then
    raise exception '134085: org 140 sin 61400501 de movimiento; abortar';
  end if;

  for r in select l.id from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
            where l.organization_id = v_org and l.account_code = '6135' and e.posted is not true loop
    update public.journal_lines set account_code = '61400501' where id = r.id;
    insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
    values ('134085', v_org, 'journal_lines', r.id::text, 'account_code', '6135', '61400501');
  end loop;

  select coalesce(sum(l.debit - l.credit), 0) into v_saldo
    from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
   where l.organization_id = v_org and l.account_code = '6135' and e.posted is true;

  if v_saldo <> 0 then
    if v_saldo <> 2300 then
      raise exception '134085: saldo 6135 org 140 = % (esperado 2300); detener y revisar', v_saldo;
    end if;
    -- Fecha FIJA 2026-10-25 (no current_date: no depende de aplicar antes de las 19:00 COT). Octubre debe estar abierto.
    v_fecha := date '2026-10-25';
    if not exists (select 1 from public.fiscal_periods fp where fp.organization_id = v_org
                     and fp.period_type = 'monthly' and fp.status = 'open'
                     and v_fecha between fp.start_date and fp.end_date) then
      v_fecha := null;
    end if;
    if v_fecha is null then raise exception '134085: org 140 con octubre 2026 cerrado; abrir el período antes de aplicar'; end if;
    select b.id into v_branch from public.branches b where b.organization_id = v_org order by b.is_main desc nulls last, b.id limit 1;
    insert into public.journal_entries (organization_id, branch_id, entry_date, memo, posted, source, source_id, fact_key, created_at, updated_at)
    values (v_org, v_branch, (v_fecha::text || ' 12:00 America/Bogota')::timestamptz, 'Reclasificación a auxiliar de movimiento',
            true, 'reclasificacion_titulo', '6135', 'p1_reclasif_6135:140', now(), now())
    returning id into v_entry;
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, organization_id, debit_base, credit_base)
    values
      (v_entry, '61400501', 'Reclasificación a auxiliar de movimiento (desde 6135)',
       greatest(v_saldo, 0), greatest(-v_saldo, 0), v_org, greatest(v_saldo, 0), greatest(-v_saldo, 0)),
      (v_entry, '6135', 'Reclasificación a auxiliar de movimiento (hacia 61400501)',
       greatest(-v_saldo, 0), greatest(v_saldo, 0), v_org, greatest(-v_saldo, 0), greatest(v_saldo, 0));
    insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
    values ('134085', v_org, 'journal_entries', v_entry::text, 'reclasificacion', v_saldo::text, 'p1_reclasif_6135:140');
  end if;

  if not exists (select 1 from public.accounting_rules x where x.organization_id = v_org and x.is_active
                   and '6135' in (x.debit_account_code, x.credit_account_code, x.discount_account_code, x.tax_account_code))
     and not exists (select 1 from public.configuracion_contable x where x.organization_id = v_org and x.account_code = '6135')
     and not exists (select 1 from public.categorias_tesoreria x where x.organization_id = v_org and x.cuenta_sugerida = '6135')
     and not exists (select 1 from public.branch_account_mappings x where x.organization_id = v_org
                       and '6135' in (x.base_account_code, x.sub_account_code))
     and exists (select 1 from public.chart_of_accounts where organization_id = v_org and account_code = '6135' and es_movimiento is not false) then
    -- QA BAJO #4: se guarda el valor real (true o NULL) para que el rollback lo restaure tal cual.
    insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
    select '134085', v_org, 'cuenta', '6135', 'es_movimiento', a.es_movimiento::text, 'false'
      from public.chart_of_accounts a where a.organization_id = v_org and a.account_code = '6135';
    update public.chart_of_accounts set es_movimiento = false, updated_at = now() where organization_id = v_org and account_code = '6135';
  end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261025134085', 'org140_reclasificar_6135', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
