-- Asiento de la nota crédito con la cuenta de devolución del producto.

create or replace function public.fn_nc_asiento_devolucion(p_org integer, p_nc uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nc public.invoice_sales%rowtype;
  v_rule record;
  v_total numeric;
  v_tax numeric;
  v_neto numeric;
  v_cfg text;
  v_n integer;
  v_cuenta text;
  v_entry integer;
  v_asignado numeric := 0;
  v_monto numeric;
  v_i integer := 0;
  v_grupo record;
begin
  if p_nc is null then
    return;
  end if;
  select * into v_nc
    from public.invoice_sales
   where id = p_nc and organization_id = p_org and document_type = 'credit_note';
  if not found then
    return;
  end if;
  if exists (
    select 1 from public.journal_entries je
     where je.organization_id = p_org
       and je.fact_key = 'accrual:credit_note:' || p_nc::text
  ) then
    return;
  end if;

  select * into v_rule
    from public.accounting_rules
   where organization_id = p_org
     and source_type = 'sale_credit_note'
     and event_type = 'created'
     and is_active
   order by priority
   limit 1;
  if v_rule is null then
    perform public.fn_log_journal_failure(
      p_org, v_nc.branch_id, coalesce(v_nc.issue_date, now()),
      'invoice_sales', p_nc::text, 'accrual:credit_note:' || p_nc::text,
      null, null, abs(coalesce(v_nc.total, 0)),
      'no_rule', 'Sin regla contable activa de nota crédito');
    return;
  end if;

  v_total := abs(coalesce(v_nc.total, 0));
  v_tax := case when coalesce(v_rule.use_tax_from_document, false)
                then abs(coalesce(v_nc.tax_total, 0)) else 0 end;
  if v_tax > v_total then
    v_tax := v_total;
  end if;
  v_neto := v_total - v_tax;
  if v_total <= 0 then
    return;
  end if;

  select c.account_code into v_cfg
    from public.configuracion_contable c
   where c.organization_id = p_org
     and c.clave = 'devoluciones'
     and (c.branch_id = v_nc.branch_id or c.branch_id is null)
   order by c.branch_id nulls last
   limit 1;

  select count(*) into v_n
    from (
      select coalesce(
               nullif(public.fn_cuenta_catalogo_linea(p_org, ii.product_id, 'devolucion', null), ''),
               nullif(v_cfg, ''),
               v_rule.debit_account_code
             ) as cuenta
        from public.invoice_items ii
       where ii.invoice_sales_id = p_nc
       group by 1
    ) g;

  if coalesce(v_n, 0) <= 1 then
    select coalesce(
             nullif(public.fn_cuenta_catalogo_linea(p_org, ii.product_id, 'devolucion', null), ''),
             nullif(v_cfg, ''),
             v_rule.debit_account_code
           ) into v_cuenta
      from public.invoice_items ii
     where ii.invoice_sales_id = p_nc
     limit 1;
    v_cuenta := coalesce(v_cuenta, v_rule.debit_account_code);
    perform public.fn_create_journal_entry(
      p_organization_id := p_org,
      p_branch_id := v_nc.branch_id,
      p_entry_date := coalesce(v_nc.issue_date, now()),
      p_memo := 'Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
      p_source := 'invoice_sales',
      p_source_id := p_nc::text,
      p_debit_account := v_cuenta,
      p_credit_account := v_rule.credit_account_code,
      p_amount := v_total,
      p_tax_account := v_rule.tax_account_code,
      p_tax_amount := v_tax,
      p_tax_is_credit := false,
      p_fact_key := 'accrual:credit_note:' || p_nc::text,
      p_created_by := auth.uid()
    );
    return;
  end if;

  insert into public.journal_entries (
    organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key
  ) values (
    p_org, v_nc.branch_id, coalesce(v_nc.issue_date, now()),
    'Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
    'invoice_sales', p_nc::text, true, auth.uid(),
    'accrual:credit_note:' || p_nc::text
  ) returning id into v_entry;

  for v_grupo in
    select g.cuenta, g.peso, row_number() over (order by g.cuenta) as nro,
           count(*) over () as cuantos
      from (
        select coalesce(
                 nullif(public.fn_cuenta_catalogo_linea(p_org, ii.product_id, 'devolucion', null), ''),
                 nullif(v_cfg, ''),
                 v_rule.debit_account_code
               ) as cuenta,
               sum(abs(coalesce(ii.total_line, 0))) as peso
          from public.invoice_items ii
         where ii.invoice_sales_id = p_nc
         group by 1
      ) g
     order by g.cuenta
  loop
    v_i := v_i + 1;
    if v_i = v_grupo.cuantos then
      v_monto := v_neto - v_asignado;
    elsif coalesce((select sum(abs(coalesce(total_line, 0))) from public.invoice_items where invoice_sales_id = p_nc), 0) = 0 then
      v_monto := round(v_neto / v_grupo.cuantos, 2);
    else
      v_monto := round(v_neto * v_grupo.peso / nullif(
        (select sum(abs(coalesce(total_line, 0))) from public.invoice_items where invoice_sales_id = p_nc), 0), 2);
    end if;
    v_asignado := v_asignado + coalesce(v_monto, 0);
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, debit_base, credit_base
    ) values (
      v_entry,
      public.fn_puc_cuenta_de_sede(p_org, v_nc.branch_id, v_grupo.cuenta),
      'Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
      coalesce(v_monto, 0), 0, coalesce(v_monto, 0), 0
    );
  end loop;

  if v_tax > 0 and v_rule.tax_account_code is not null then
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, debit_base, credit_base
    ) values (
      v_entry,
      public.fn_puc_cuenta_de_sede(
        p_org, v_nc.branch_id,
        public.fn_cuenta_iva(p_org, v_nc.branch_id, 'invoice_sales', v_rule.tax_account_code)),
      'IVA - Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
      v_tax, 0, v_tax, 0
    );
  end if;

  insert into public.journal_lines (
    journal_entry_id, account_code, description, debit, credit, debit_base, credit_base
  ) values (
    v_entry,
    public.fn_puc_cuenta_de_sede(p_org, v_nc.branch_id, v_rule.credit_account_code),
    'Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
    0, v_total, 0, v_total
  );
end;
$function$;

comment on function public.fn_nc_asiento_devolucion(integer, uuid) is
  'Asiento de una nota crédito de devolución ya insertada (el disparador automático se apaga con app.asiento_por_lineas). El débito del neto usa products.cuenta_devolucion, luego la categoría, luego configuracion_contable.devoluciones y al final la regla. El IVA sigue el orden de fn_cuenta_iva. Idempotente por fact_key.';

revoke all on function public.fn_nc_asiento_devolucion(integer, uuid) from public, anon, authenticated;
