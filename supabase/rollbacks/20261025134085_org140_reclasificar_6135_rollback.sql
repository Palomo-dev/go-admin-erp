-- IMPORTANTE: correr con el período de OCTUBRE 2026 ABIERTO. fn_revertir_asiento fecha el contraasiento en el
-- período del asiento de reclasificación (25-oct); con octubre cerrado falla con periodo_cerrado.
-- Rollback de 20261025134085 (org 140). Usa la bitácora '134085'.
do $$
declare r record;
begin
  set constraints public.trg_chart_cuenta_titulo_configurada immediate;
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  -- 1. PRIMERO las cuentas vuelven a movimiento (QA Soporte 25-oct, ALTO #1): el contraasiento usa la cuenta que
  --    la migración volvió título (p. ej. D6135) y zz_trg_puc_linea_solo_movimiento lo rechazaría.
  for r in select * from public.p1_puc_bitacora where migracion = '134085' and objeto = 'cuenta' order by id desc loop
    -- QA BAJO #4: se restaura el valor anterior registrado (true o NULL), no un true fijo.
    update public.chart_of_accounts set es_movimiento = r.valor_anterior::boolean, updated_at = now()
     where organization_id = r.organization_id and account_code = r.clave;
  end loop;
  -- 2. DESPUÉS los asientos de reclasificación: se revierten (contraasiento), no se borran
  for r in select clave::integer id from public.p1_puc_bitacora where migracion = '134085' and objeto = 'journal_entries' loop
    perform public.fn_revertir_asiento(r.id, 'rollback-134085', 'puc_migracion');
  end loop;
  -- 3. El resto de la bitácora
  for r in select * from public.p1_puc_bitacora where migracion = '134085' and objeto <> 'cuenta' order by id desc loop
    if r.objeto = 'accounting_rules' and r.campo = 'debit_account_code' then
      update public.accounting_rules set debit_account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'credit_account_code' then
      update public.accounting_rules set credit_account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'discount_account_code' then
      update public.accounting_rules set discount_account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'configuracion_contable' then
      update public.configuracion_contable set account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'categorias_tesoreria' then
      update public.categorias_tesoreria set cuenta_sugerida = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'journal_lines' then
      update public.journal_lines set account_code = r.valor_anterior where id::text = r.clave;
    end if;
  end loop;
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  delete from public.p1_puc_bitacora where migracion = '134085';
exception when others then
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise;
end $$;

delete from supabase_migrations.schema_migrations where version = '20261025134085';
