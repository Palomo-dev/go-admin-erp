-- IMPORTANTE: correr con el período de OCTUBRE 2026 ABIERTO (los contraasientos caen en el período del 25-oct;
-- con octubre cerrado fn_revertir_asiento falla con periodo_cerrado).
-- Rollback de 20261025134120. Revertir ANTES 134115 y 134110. Usa la bitácora '134120'.
do $$
declare
  r record;
  v_ctas text[];
begin
  set constraints public.trg_chart_cuenta_titulo_configurada immediate;
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  -- 1. Cuentas: vuelven a su valor anterior real (true o NULL), antes de los contraasientos.
  for r in select * from public.p1_puc_bitacora where migracion = '134120' and objeto = 'cuenta' order by id desc loop
    update public.chart_of_accounts set es_movimiento = r.valor_anterior::boolean, updated_at = now()
     where organization_id = r.organization_id and account_code = r.clave;
  end loop;
  -- 2. Asientos de reclasificación: contraasiento. Si alguna cuenta del asiento es título (2408 en la org 140),
  --    se habilita de movimiento solo durante la reversión.
  for r in select organization_id, clave::integer id from public.p1_puc_bitacora
            where migracion = '134120' and objeto = 'journal_entries' order by id desc loop
    select array_agg(distinct a.account_code) into v_ctas
      from public.journal_lines l join public.chart_of_accounts a
        on a.organization_id = r.organization_id and a.account_code = l.account_code
     where l.journal_entry_id = r.id and a.es_movimiento is false;
    if v_ctas is not null then
      update public.chart_of_accounts set es_movimiento = true
       where organization_id = r.organization_id and account_code = any (v_ctas);
    end if;
    perform public.fn_revertir_asiento(r.id, 'rollback-134120', 'puc_migracion');
    if v_ctas is not null then
      update public.chart_of_accounts set es_movimiento = false
       where organization_id = r.organization_id and account_code = any (v_ctas);
    end if;
  end loop;
  -- 3. Resto
  for r in select * from public.p1_puc_bitacora where migracion = '134120'
            and objeto not in ('cuenta', 'journal_entries') order by id desc loop
    if r.objeto = 'accounting_rules' and r.campo = 'debit_account_code' then
      update public.accounting_rules set debit_account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'credit_account_code' then
      update public.accounting_rules set credit_account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'discount_account_code' then
      update public.accounting_rules set discount_account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'tax_account_code' then
      update public.accounting_rules set tax_account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'accounting_rules' and r.campo = 'use_tax_from_document' then
      update public.accounting_rules set use_tax_from_document = r.valor_anterior::boolean where id::text = r.clave;
    elsif r.objeto = 'accounting_rules_nueva' then
      delete from public.accounting_rules where id::text = r.clave;
    elsif r.objeto = 'configuracion_contable' then
      update public.configuracion_contable set account_code = r.valor_anterior where id::text = r.clave;
    elsif r.objeto = 'configuracion_contable_nueva' then
      delete from public.configuracion_contable where id::text = r.clave;
    elsif r.objeto = 'journal_lines' then
      update public.journal_lines set account_code = r.valor_anterior where id::text = r.clave;
    end if;
  end loop;
  set constraints public.trg_chart_cuenta_titulo_configurada immediate;  -- diferido: sin eventos pendientes para el ALTER
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  -- QA 801206c2 BAJO: el constraint queda IMMEDIATE (no se vuelve a diferir) para que otro rollback encadenado
  -- en la misma transacción no herede eventos diferidos pendientes.
  delete from public.p1_puc_bitacora where migracion = '134120';
exception when others then
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise;
end $$;

delete from supabase_migrations.schema_migrations where version = '20261025134120';
