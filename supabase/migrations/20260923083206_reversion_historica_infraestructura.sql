-- Reversión histórica de asientos: infraestructura (Bloque 5 del cierre contable).
--
-- Procedimiento: docs/procedimientos/reversion-asientos-duplicados.md
-- ADR: docs/decisiones/ADR-CC-007-reversion-historica.md
--
-- Nada de esto borra ni modifica un asiento publicado. Cada corrección es un
-- contra-asiento que copia el original línea por línea con débito y crédito
-- intercambiados —incluido su signo equivocado, si lo tenía— y, cuando el hecho
-- sigue vivo, un devengo nuevo con la fórmula vigente y los importes del
-- documento.

-- ── Bitácora ────────────────────────────────────────────────────────────────
create table if not exists public.journal_reversals (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  organization_id integer not null,
  lote text not null,
  categoria text not null check (categoria in ('F-48', 'F-45', 'F-49', 'CC-001')),
  original_entry_id integer not null,
  reversal_entry_id integer not null,
  repost_entry_id integer,
  unique (organization_id, original_entry_id)
);

create table if not exists public.journal_reversal_runs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  organization_id integer not null,
  lote text not null,
  ejecutado boolean not null,
  resultado jsonb not null
);

alter table public.journal_reversals enable row level security;
alter table public.journal_reversal_runs enable row level security;
revoke all on public.journal_reversals from anon, authenticated;
revoke all on public.journal_reversal_runs from anon, authenticated;

comment on table public.journal_reversals is
  'Cada contra-asiento de la reversión histórica: asiento original, su contra-asiento (fact_key reversal:{id}) y, si aplica, el devengo corregido.';
comment on table public.journal_reversal_runs is
  'Una fila por organización y lote de la reversión histórica: conteos y balance antes/después (simulación o ejecución).';

-- ── Contra-asiento exacto ───────────────────────────────────────────────────
create or replace function public.fn_revertir_asiento(p_entry_id integer, p_categoria text, p_lote text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_orig journal_entries%rowtype;
  v_rev_id integer;
  v_d numeric;
  v_c numeric;
begin
  select * into v_orig from journal_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Asiento % no existe', p_entry_id;
  end if;
  if not v_orig.posted then
    raise exception 'Asiento % no está publicado: no se revierte con contra-asiento', p_entry_id;
  end if;
  if exists (select 1 from journal_entries
             where organization_id = v_orig.organization_id and fact_key = 'reversal:' || p_entry_id) then
    raise exception 'Asiento % ya tiene contra-asiento', p_entry_id;
  end if;

  insert into journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted,
                               created_by, currency_code, exchange_rate, base_currency_code, fact_key)
  values (v_orig.organization_id, v_orig.branch_id, v_orig.entry_date,
          'REVERSION ' || p_categoria || ' | ' || p_lote || ' | asiento ' || p_entry_id || ' | ' || coalesce(v_orig.memo, ''),
          'reversal', p_entry_id::text, true, null,
          v_orig.currency_code, v_orig.exchange_rate, v_orig.base_currency_code,
          'reversal:' || p_entry_id)
  returning id into v_rev_id;

  -- Copia exacta con débito y crédito intercambiados: nunca la fórmula vigente.
  insert into journal_lines (journal_entry_id, account_code, description, debit, credit,
                             organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id)
  select v_rev_id, jl.account_code, 'REVERSION ' || coalesce(jl.description, ''), jl.credit, jl.debit,
         jl.organization_id, jl.currency_code, jl.exchange_rate, jl.credit_base, jl.debit_base, jl.cost_center_id
  from journal_lines jl
  where jl.journal_entry_id = p_entry_id;

  -- Original + contra-asiento = 0 por cuenta.
  if exists (
    select 1 from journal_lines jl
    where jl.journal_entry_id in (p_entry_id, v_rev_id)
    group by jl.account_code
    having sum(jl.debit) <> sum(jl.credit)
  ) then
    raise exception 'El contra-asiento de % no neutraliza alguna cuenta', p_entry_id;
  end if;

  select sum(debit), sum(credit) into v_d, v_c from journal_lines where journal_entry_id = v_rev_id;
  if v_d is distinct from v_c then
    raise exception 'El contra-asiento de % no cuadra (D % / C %)', p_entry_id, v_d, v_c;
  end if;

  return v_rev_id;
end;
$$;

revoke all on function public.fn_revertir_asiento(integer, text, text) from public, anon, authenticated;
grant execute on function public.fn_revertir_asiento(integer, text, text) to service_role;

-- ── Saldos del libro y de los documentos de una organización ────────────────
create or replace function public.fn_cuadre_contable_org(p_organization_id integer)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with r as (select * from fn_regla_devengo_venta(p_organization_id)),
  libro as (
    select jl.account_code, sum(jl.debit) d, sum(jl.credit) c
    from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id
    where je.organization_id = p_organization_id
    group by jl.account_code
  )
  select jsonb_build_object(
    'debitos', (select coalesce(sum(d), 0) from libro),
    'creditos', (select coalesce(sum(c), 0) from libro),
    'cxc_libro', (select coalesce(sum(d - c), 0) from libro where account_code = (select debit_account_code from r)),
    'iva_libro', (select coalesce(sum(c - d), 0) from libro where account_code = (select tax_account_code from r)),
    'ingreso_libro', (select coalesce(sum(c - d), 0) from libro where account_code = (select credit_account_code from r)),
    'cxc_docs', (select coalesce(sum(balance), 0) from invoice_sales
                 where organization_id = p_organization_id and status in ('issued', 'paid', 'partial')
                   and coalesce(document_type, 'invoice') = 'invoice'),
    'ingreso_docs', (select coalesce(sum(subtotal), 0) from invoice_sales
                     where organization_id = p_organization_id and status in ('issued', 'paid', 'partial')
                       and coalesce(document_type, 'invoice') in ('invoice', 'credit_note')),
    'iva_docs', (select coalesce(sum(tax_total), 0) from invoice_sales
                 where organization_id = p_organization_id and status in ('issued', 'paid', 'partial')
                   and coalesce(document_type, 'invoice') in ('invoice', 'credit_note'))
  );
$$;

revoke all on function public.fn_cuadre_contable_org(integer) from public, anon, authenticated;
grant execute on function public.fn_cuadre_contable_org(integer) to service_role;

-- ── Ejecutor por organización ───────────────────────────────────────────────
-- p_ejecutar = false: simulación (cuenta, no escribe asientos).
-- p_ejecutar = true: escribe contra-asientos y devengos corregidos en UNA
-- transacción; si el balance de la organización no cuadra al final, lanza una
-- excepción y la transacción entera se deshace (el «rollback de esa org»).
create or replace function public.fn_reversion_historica_org(p_organization_id integer, p_lote text, p_ejecutar boolean)
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
  v_total numeric;
  v_tax numeric;
  v_key text;
  v_n jsonb;
  v_resultado jsonb;
begin
  select * into v_rule from fn_regla_devengo_venta(p_organization_id);
  v_antes := fn_cuadre_contable_org(p_organization_id);

  drop table if exists _acc;
  create temp table _acc on commit drop as
  select je.id, je.source, je.entry_date, je.branch_id, je.memo,
         case when je.source = 'invoice_sales' then je.source_id::uuid end as inv_id,
         case when je.source = 'sales' then je.source_id::uuid end as sale_id
  from journal_entries je
  where je.organization_id = p_organization_id
    and je.posted
    and ((je.source = 'invoice_sales' and je.memo ilike 'Venta%'
          and je.source_id ~ '^[0-9a-f-]{36}$')
      or (je.source = 'sales' and je.memo ilike 'Venta POS%'
          and je.source_id ~ '^[0-9a-f-]{36}$'))
    and not exists (select 1 from journal_entries r
                    where r.organization_id = p_organization_id and r.fact_key = 'reversal:' || je.id);

  -- Documento de cada devengo: la factura (o la de su venta) y la venta.
  drop table if exists _doc;
  create temp table _doc on commit drop as
  select a.*,
         coalesce(a.inv_id, (select i.id from invoice_sales i
                             where i.sale_id = a.sale_id and i.organization_id = p_organization_id
                               and coalesce(i.document_type, 'invoice') = 'invoice'
                             order by i.created_at limit 1)) as doc_inv_id,
         coalesce(a.sale_id, (select i.sale_id from invoice_sales i where i.id = a.inv_id)) as doc_sale_id,
         exists (select 1 from sales s where s.id = a.sale_id) as venta_existe
  from _acc a;

  drop table if exists _cand;
  create temp table _cand (entry_id integer primary key, categoria text, repostear boolean,
                           inv_id uuid, sale_id uuid) on commit drop;

  -- F-48: devengo de la venta POS cuya factura tiene devengo propio.
  insert into _cand
  select d.id, 'F-48', false, d.doc_inv_id, d.sale_id
  from _doc d
  where d.source = 'sales' and d.venta_existe
    and exists (select 1 from _doc f where f.source = 'invoice_sales' and f.inv_id = d.doc_inv_id);

  -- F-49: devengo de una factura que sigue en borrador.
  insert into _cand
  select d.id, 'F-49', false, d.inv_id, d.doc_sale_id
  from _doc d join invoice_sales i on i.id = d.inv_id
  where d.source = 'invoice_sales' and i.status = 'draft'
  on conflict do nothing;

  -- Lo que queda es el devengo canónico de cada hecho. Se excluyen los huérfanos
  -- (venta borrada) y los documentos anulados.
  drop table if exists _canon;
  create temp table _canon on commit drop as
  select d.*
  from _doc d
  where not exists (select 1 from _cand c where c.entry_id = d.id)
    and (d.source = 'invoice_sales' or d.venta_existe)
    and not exists (select 1 from invoice_sales i where i.id = d.doc_inv_id and i.status = 'void')
    and not exists (select 1 from sales s where s.id = d.doc_sale_id and s.status = 'void');

  -- F-45: el IVA quedó al débito.
  insert into _cand
  select c.id, 'F-45', true, c.doc_inv_id, c.doc_sale_id
  from _canon c
  where exists (select 1 from journal_lines jl
                where jl.journal_entry_id = c.id and jl.account_code = v_rule.tax_account_code and jl.debit > 0)
  on conflict do nothing;

  -- CC-001: devengo contra Caja de un hecho que además tiene cobro contabilizado.
  insert into _cand
  select c.id, 'CC-001', true, c.doc_inv_id, c.doc_sale_id
  from _canon c
  where not exists (select 1 from _cand x where x.entry_id = c.id)
    and exists (select 1 from journal_lines jl
                where jl.journal_entry_id = c.id and jl.debit > 0
                  and jl.account_code <> v_rule.debit_account_code
                  and jl.account_code <> coalesce(v_rule.tax_account_code, ''))
    and exists (select 1 from payments p
                join journal_entries pe on pe.organization_id = p_organization_id
                                        and pe.source = 'payments' and pe.source_id = p.id::text
                where p.organization_id = p_organization_id
                  and ((p.source = 'invoice_sales' and p.source_id = c.doc_inv_id::text)
                    or (p.source in ('sale', 'web_order') and p.source_id = c.doc_sale_id::text)))
  on conflict do nothing;

  select jsonb_build_object(
    'F-48', count(*) filter (where categoria = 'F-48'),
    'F-49', count(*) filter (where categoria = 'F-49'),
    'F-45', count(*) filter (where categoria = 'F-45'),
    'CC-001', count(*) filter (where categoria = 'CC-001'),
    'huerfanos_excluidos', (select count(*) from _doc where source = 'sales' and not venta_existe),
    'anulados_excluidos', (select count(*) from _doc d
                           where not exists (select 1 from _cand c where c.entry_id = d.id)
                             and (exists (select 1 from invoice_sales i where i.id = d.doc_inv_id and i.status = 'void')
                               or exists (select 1 from sales s where s.id = d.doc_sale_id and s.status = 'void'))))
  into v_n from _cand;

  if p_ejecutar then
    for v_c in select c.*, a.entry_date, a.branch_id, a.memo from _cand c join _acc a on a.id = c.entry_id order by c.entry_id loop
      v_rev := fn_revertir_asiento(v_c.entry_id, v_c.categoria, p_lote);
      v_rep := null;

      if v_c.repostear then
        select coalesce(i.total, s.total), coalesce(i.tax_total, s.tax_total)
          into v_total, v_tax
        from (select 1) x
        left join invoice_sales i on i.id = v_c.inv_id
        left join sales s on s.id = v_c.sale_id;

        v_key := case when v_c.sale_id is not null then 'accrual:sale:' || v_c.sale_id
                      else 'accrual:invoice:' || v_c.inv_id end || ':correccion:' || p_lote;

        if coalesce(v_total, 0) > 0 then
          v_rep := fn_create_journal_entry(
            p_organization_id := p_organization_id,
            p_branch_id := v_c.branch_id,
            p_entry_date := v_c.entry_date,
            p_memo := 'CORRECCION ' || v_c.categoria || ' | ' || p_lote || ' | ' || coalesce(v_c.memo, ''),
            p_source := case when v_c.inv_id is not null then 'invoice_sales' else 'sales' end,
            p_source_id := coalesce(v_c.inv_id, v_c.sale_id)::text,
            p_debit_account := v_rule.debit_account_code,
            p_credit_account := v_rule.credit_account_code,
            p_amount := v_total,
            p_tax_account := v_rule.tax_account_code,
            p_tax_amount := case when v_rule.use_tax_from_document then coalesce(v_tax, 0) else 0 end,
            p_tax_is_credit := true,
            p_fact_key := v_key);
        end if;
      end if;

      insert into journal_reversals (organization_id, lote, categoria, original_entry_id, reversal_entry_id, repost_entry_id)
      values (p_organization_id, p_lote, v_c.categoria, v_c.entry_id, v_rev, v_rep);
    end loop;
  end if;

  v_despues := fn_cuadre_contable_org(p_organization_id);

  if p_ejecutar and (v_despues->>'debitos')::numeric <> (v_despues->>'creditos')::numeric then
    raise exception 'Org %: el balance de prueba no cuadra tras la reversión (D % / C %); se deshace la organización',
      p_organization_id, v_despues->>'debitos', v_despues->>'creditos';
  end if;

  v_resultado := jsonb_build_object('conteos', v_n, 'antes', v_antes, 'despues', v_despues);

  insert into journal_reversal_runs (organization_id, lote, ejecutado, resultado)
  values (p_organization_id, p_lote, p_ejecutar, v_resultado);

  return v_resultado;
end;
$$;

revoke all on function public.fn_reversion_historica_org(integer, text, boolean) from public, anon, authenticated;
grant execute on function public.fn_reversion_historica_org(integer, text, boolean) to service_role;
