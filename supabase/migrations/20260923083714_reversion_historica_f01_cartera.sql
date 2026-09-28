-- Reversión histórica, categoría F-01: el asiento de cartera que repite el ingreso.
--
-- Hasta la Fase 0, trg_create_account_receivable publicaba un asiento
-- `source='accounts_receivable'` (1305 D / 4105 C) al crear la cuenta por
-- cobrar, además del devengo de la venta. El disparador se apagó, pero sus
-- asientos siguen publicados: 1.414 entre el 5-jul y el 11-sep, en 14
-- organizaciones. 1.289 repiten el ingreso de un hecho que ya tiene su devengo
-- vivo; esos se neutralizan. Los que son el único devengo de su hecho se
-- conservan, y los de cuentas por cobrar borradas (48) son huérfanos y se
-- excluyen.
--
-- Mismo contrato que el resto de la reversión: contra-asiento exacto con
-- fn_revertir_asiento, una transacción por organización, balance de prueba
-- comprobado al final. ADR-CC-007.

alter table public.journal_reversals drop constraint if exists journal_reversals_categoria_check;
alter table public.journal_reversals
  add constraint journal_reversals_categoria_check
  check (categoria in ('F-48', 'F-45', 'F-49', 'CC-001', 'F-01'));

create or replace function public.fn_reversion_f01_org(p_organization_id integer, p_lote text, p_ejecutar boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_c record;
  v_rev integer;
  v_n integer;
  v_huerfanos integer;
  v_unicos integer;
  v_resultado jsonb;
begin
  v_antes := fn_cuadre_contable_org(p_organization_id);

  drop table if exists _ar;
  create temp table _ar on commit drop as
  select je.id, a.id as ar_id, a.invoice_id,
         coalesce(a.sale_id, (select i.sale_id from invoice_sales i where i.id = a.invoice_id)) as sale_id
  from journal_entries je
  left join accounts_receivable a on a.id::text = je.source_id and a.organization_id = p_organization_id
  where je.organization_id = p_organization_id
    and je.source = 'accounts_receivable'
    and je.posted
    and not exists (select 1 from journal_entries r
                    where r.organization_id = p_organization_id and r.fact_key = 'reversal:' || je.id);

  -- Devengos de venta vivos (originales o corregidos) por factura y por venta.
  drop table if exists _vivo;
  create temp table _vivo on commit drop as
  select je.source, je.source_id
  from journal_entries je
  where je.organization_id = p_organization_id
    and je.source in ('invoice_sales', 'sales')
    and (je.memo ilike 'Venta%' or je.memo ilike 'CORRECCION%')
    and not exists (select 1 from journal_entries r
                    where r.organization_id = p_organization_id and r.fact_key = 'reversal:' || je.id);

  drop table if exists _f01;
  create temp table _f01 on commit drop as
  select a.id
  from _ar a
  where a.ar_id is not null
    and (exists (select 1 from _vivo v where v.source = 'invoice_sales' and v.source_id = a.invoice_id::text)
      or exists (select 1 from _vivo v where v.source = 'sales' and v.source_id = a.sale_id::text)
      or exists (select 1 from _vivo v join invoice_sales i on i.id::text = v.source_id
                 where v.source = 'invoice_sales' and i.sale_id = a.sale_id));

  select count(*) into v_n from _f01;
  select count(*) into v_huerfanos from _ar where ar_id is null;
  select count(*) into v_unicos from _ar a where a.ar_id is not null and not exists (select 1 from _f01 f where f.id = a.id);

  if p_ejecutar then
    for v_c in select id from _f01 order by id loop
      v_rev := fn_revertir_asiento(v_c.id, 'F-01', p_lote);
      insert into journal_reversals (organization_id, lote, categoria, original_entry_id, reversal_entry_id)
      values (p_organization_id, p_lote, 'F-01', v_c.id, v_rev);
    end loop;
  end if;

  v_despues := fn_cuadre_contable_org(p_organization_id);

  if p_ejecutar and (v_despues->>'debitos')::numeric <> (v_despues->>'creditos')::numeric then
    raise exception 'Org %: el balance de prueba no cuadra tras F-01 (D % / C %); se deshace la organización',
      p_organization_id, v_despues->>'debitos', v_despues->>'creditos';
  end if;

  v_resultado := jsonb_build_object(
    'conteos', jsonb_build_object('F-01', v_n, 'unico_devengo_conservado', v_unicos, 'huerfanos_excluidos', v_huerfanos),
    'antes', v_antes, 'despues', v_despues);

  insert into journal_reversal_runs (organization_id, lote, ejecutado, resultado)
  values (p_organization_id, p_lote, p_ejecutar, v_resultado);

  return v_resultado;
end;
$$;

revoke all on function public.fn_reversion_f01_org(integer, text, boolean) from public, anon, authenticated;
grant execute on function public.fn_reversion_f01_org(integer, text, boolean) to service_role;
