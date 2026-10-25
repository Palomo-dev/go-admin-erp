-- Rollback de 20261025134145. Revertir ANTES 134120. Octubre 2026 ABIERTO (contraasiento con fn_revertir_asiento).
set constraints public.trg_chart_cuenta_titulo_configurada immediate;
do $$
declare r record;
begin
  for r in select * from public.p1_puc_bitacora where migracion = '134145' order by id desc loop
    if r.objeto = 'journal_entries' then
      if not exists (select 1 from public.journal_entries rv where rv.fact_key = 'reversal:' || r.clave) then
        perform public.fn_revertir_asiento(r.clave::integer, 'rollback-134145', 'puc_migracion');
      end if;
    elsif r.objeto = 'accounting_rules' and r.campo = 'credit_account_code' then
      update public.accounting_rules set credit_account_code = r.valor_anterior, updated_at = now() where id::text = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'debit_account_code' then
      update public.accounting_rules set debit_account_code = r.valor_anterior, updated_at = now() where id::text = r.clave;
    end if;
  end loop;
  delete from public.p1_puc_bitacora where migracion = '134145';
end $$;

delete from supabase_migrations.schema_migrations where version = '20261025134145';
