-- Rollback de 20261025134090. Revertir ANTES 134100 y 134095.
do $$
declare r record;
begin
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  for r in select * from public.p1_puc_bitacora where migracion = '134090' and campo is not null order by id desc loop
    if r.objeto = 'cuenta' then
      update public.chart_of_accounts set es_movimiento = r.valor_anterior::boolean, updated_at = now()  -- QA BAJO #4
       where organization_id = r.organization_id and account_code = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'debit_account_code' then
      update public.accounting_rules set debit_account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'credit_account_code' then
      update public.accounting_rules set credit_account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'configuracion_contable' then
      update public.configuracion_contable set account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'categorias_tesoreria' then
      update public.categorias_tesoreria set cuenta_sugerida = r.valor_anterior where id::text = r.clave;
    end if;
  end loop;
  for r in select organization_id, clave from public.p1_puc_bitacora
            where migracion = '134090' and objeto = 'cuenta' and campo is null order by length(clave) desc loop
    if exists (select 1 from public.journal_lines l where l.organization_id = r.organization_id and l.account_code = r.clave) then
      raise exception 'rollback 134090: org % cuenta % tiene líneas; no se borra', r.organization_id, r.clave;
    end if;
    delete from public.chart_of_accounts where organization_id = r.organization_id and account_code = r.clave;
  end loop;
  delete from public.p1_puc_bitacora where migracion = '134090';
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
exception when others then
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise;
end $$;
drop function if exists public.fn_comisiones_asegurar_cuentas(integer, text);
