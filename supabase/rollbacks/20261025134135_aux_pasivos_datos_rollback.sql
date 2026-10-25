-- IMPORTANTE: correr con el período de OCTUBRE 2026 ABIERTO (los contraasientos caen en el período del 25-oct).
-- Rollback de 20261025134135. Revertir ANTES 134140; después 134130 y 134125. Usa la bitácora '134135'.
-- Las cuentas vuelven a su valor anterior REAL (true o NULL: 2505/2335/2365 estaban en NULL en 109 orgs).
do $$
declare
  r record;
  v_ctas text[];
begin
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  -- 1. Cuentas (madres a movimiento) antes de los contraasientos.
  for r in select * from public.p1_puc_bitacora where migracion = '134135' and objeto = 'cuenta' order by id desc loop
    update public.chart_of_accounts set es_movimiento = r.valor_anterior::boolean, updated_at = now()
     where organization_id = r.organization_id and account_code = r.clave;
  end loop;
  -- 2. Asientos de reclasificación de 2205: contraasiento (con fn_revertir_asiento; nunca se borran).
  for r in select organization_id, clave::integer id from public.p1_puc_bitacora
            where migracion = '134135' and objeto = 'journal_entries' order by id desc loop
    select array_agg(distinct a.account_code) into v_ctas
      from public.journal_lines l join public.chart_of_accounts a
        on a.organization_id = r.organization_id and a.account_code = l.account_code
     where l.journal_entry_id = r.id and a.es_movimiento is false;
    if v_ctas is not null then
      update public.chart_of_accounts set es_movimiento = true
       where organization_id = r.organization_id and account_code = any (v_ctas);
    end if;
    if not exists (select 1 from public.journal_entries x where x.organization_id = r.organization_id and x.fact_key = 'reversal:' || r.id) then
      perform public.fn_revertir_asiento(r.id, 'rollback-134135', 'puc_migracion');
    end if;
    if v_ctas is not null then
      update public.chart_of_accounts set es_movimiento = false
       where organization_id = r.organization_id and account_code = any (v_ctas);
    end if;
  end loop;
  -- 3. Resto
  for r in select * from public.p1_puc_bitacora where migracion = '134135'
            and objeto not in ('cuenta', 'journal_entries') order by id desc loop
    if r.objeto = 'accounting_rules' and r.campo = 'debit_account_code' then
      update public.accounting_rules set debit_account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'credit_account_code' then
      update public.accounting_rules set credit_account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'tax_account_code' then
      update public.accounting_rules set tax_account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'configuracion_contable' then
      update public.configuracion_contable set account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'categorias_tesoreria' then
      update public.categorias_tesoreria set cuenta_sugerida = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'journal_entry_failures' then
      update public.journal_entry_failures
         set debit_account = nullif(split_part(r.valor_anterior, '|', 1), ''),
             credit_account = nullif(split_part(r.valor_anterior, '|', 2), '')
       where id::text = r.clave;
    elsif r.objeto = 'journal_lines' then
      update public.journal_lines set account_code = r.valor_anterior where id::text = r.clave;
    end if;
  end loop;
  set constraints public.trg_chart_cuenta_titulo_configurada immediate;  -- diferido: sin eventos pendientes para el ALTER
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  set constraints public.trg_chart_cuenta_titulo_configurada deferred;
  delete from public.p1_puc_bitacora where migracion = '134135';
exception when others then
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise;
end $$;
delete from supabase_migrations.schema_migrations where version = '20261025134135';
