-- Rollback de 20261025134085 (org 140). Usa la bitácora '134085'.
do $$
declare r record;
begin
  -- asientos de reclasificación: se revierten (contraasiento), no se borran
  for r in select clave::integer id from public.p1_puc_bitacora where migracion = '134085' and objeto = 'journal_entries' loop
    perform public.fn_revertir_asiento(r.id, 'rollback-134085', 'puc_migracion');
  end loop;
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  for r in select * from public.p1_puc_bitacora where migracion = '134085' order by id desc loop
    if r.objeto = 'cuenta' then
      update public.chart_of_accounts set es_movimiento = true, updated_at = now()
       where organization_id = r.organization_id and account_code = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'debit_account_code' then
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
