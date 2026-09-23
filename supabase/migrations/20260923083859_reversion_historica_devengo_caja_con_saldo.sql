-- Reversión histórica, CC-001 (segunda parte): devengo contra Caja de una
-- factura que sigue debiéndose.
--
-- Al neutralizar F-01 quedó a la vista: 378 facturas emitidas y sin pagar
-- (org 115: 377 por 163.589.984; org 125: 1 por 1.730.000) se devengaron contra
-- Caja, como si se hubieran cobrado. El asiento de cartera F-01 aportaba el 1305
-- que faltaba, a costa de duplicar el ingreso. Ahora Caja está inflada y 1305
-- corto por el mismo importe.
--
-- Criterio: devengo vivo de factura issued/partial con saldo > 0, cuyo débito no
-- es la cuenta por cobrar. Contra-asiento exacto + devengo corregido contra la
-- cuenta por cobrar con los importes de la factura (ADR-CC-001, ADR-CC-007).

create or replace function public.fn_reversion_devengo_caja_con_saldo_org(p_organization_id integer, p_lote text, p_ejecutar boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_rule record;
  v_antes jsonb;
  v_despues jsonb;
  v_c record;
  v_rev integer;
  v_rep integer;
  v_n integer := 0;
  v_resultado jsonb;
begin
  select * into v_rule from fn_regla_devengo_venta(p_organization_id);
  v_antes := fn_cuadre_contable_org(p_organization_id);

  for v_c in
    select je.id, je.entry_date, je.branch_id, je.memo, i.id as inv_id, i.sale_id, i.total, i.tax_total
    from journal_entries je
    join invoice_sales i on i.id::text = je.source_id and i.organization_id = je.organization_id
    where je.organization_id = p_organization_id
      and je.source = 'invoice_sales' and je.memo ilike 'Venta%' and je.posted
      and i.status in ('issued', 'partial') and i.balance > 0
      and not exists (select 1 from journal_entries r
                      where r.organization_id = p_organization_id and r.fact_key = 'reversal:' || je.id)
      and exists (select 1 from journal_lines jl
                  where jl.journal_entry_id = je.id and jl.debit > 0
                    and jl.account_code <> v_rule.debit_account_code
                    and jl.account_code <> coalesce(v_rule.tax_account_code, ''))
    order by je.id
  loop
    v_n := v_n + 1;
    if p_ejecutar then
      v_rev := fn_revertir_asiento(v_c.id, 'CC-001', p_lote);
      v_rep := fn_create_journal_entry(
        p_organization_id := p_organization_id,
        p_branch_id := v_c.branch_id,
        p_entry_date := v_c.entry_date,
        p_memo := 'CORRECCION CC-001 | ' || p_lote || ' | ' || coalesce(v_c.memo, ''),
        p_source := 'invoice_sales',
        p_source_id := v_c.inv_id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := v_c.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := case when v_rule.use_tax_from_document then coalesce(v_c.tax_total, 0) else 0 end,
        p_tax_is_credit := true,
        p_fact_key := case when v_c.sale_id is not null then 'accrual:sale:' || v_c.sale_id
                           else 'accrual:invoice:' || v_c.inv_id end || ':correccion:' || p_lote);
      if v_rep is null then
        raise exception 'Org %: no se pudo generar el devengo corregido de la factura %', p_organization_id, v_c.inv_id;
      end if;
      insert into journal_reversals (organization_id, lote, categoria, original_entry_id, reversal_entry_id, repost_entry_id)
      values (p_organization_id, p_lote, 'CC-001', v_c.id, v_rev, v_rep);
    end if;
  end loop;

  v_despues := fn_cuadre_contable_org(p_organization_id);

  if p_ejecutar and (v_despues->>'debitos')::numeric <> (v_despues->>'creditos')::numeric then
    raise exception 'Org %: el balance de prueba no cuadra (D % / C %); se deshace la organización',
      p_organization_id, v_despues->>'debitos', v_despues->>'creditos';
  end if;

  v_resultado := jsonb_build_object('conteos', jsonb_build_object('CC-001-saldo', v_n), 'antes', v_antes, 'despues', v_despues);
  insert into journal_reversal_runs (organization_id, lote, ejecutado, resultado)
  values (p_organization_id, p_lote, p_ejecutar, v_resultado);
  return v_resultado;
end;
$$;

revoke all on function public.fn_reversion_devengo_caja_con_saldo_org(integer, text, boolean) from public, anon, authenticated;
grant execute on function public.fn_reversion_devengo_caja_con_saldo_org(integer, text, boolean) to service_role;
