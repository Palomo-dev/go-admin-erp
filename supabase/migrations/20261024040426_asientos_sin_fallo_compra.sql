-- Compra sin líneas propias: el débito de inventario también pasa a 1435.
create or replace function public.fn_auto_journal_purchase()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_rule record;
  v_entry_id integer;
  v_fact_key text;
  v_debito text;
  v_credito text;
begin
  if new.status is distinct from 'received' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'received' then
    return new;
  end if;

  if coalesce(new.total, 0) >= 0 and round(coalesce(new.total, 0), 0) <= 0 then
    return new;
  end if;

  v_fact_key := 'accrual:purchase:' || new.id::text;

  if exists (
    select 1 from journal_entries
    where organization_id = new.organization_id
      and source = 'invoice_purchase'
      and source_id = new.id::text
      and memo like 'Compra %'
  ) then
    return new;
  end if;

  select * into v_rule from fn_regla_devengo_compra(new.organization_id);

  if v_rule.debit_account_code is null then
    perform fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.issue_date, now()),
      'invoice_purchase', new.id::text, v_fact_key, null, null, new.total,
      'no_rule', 'Sin regla contable activa de compra');
    return new;
  end if;

  v_debito := public.fn_cuenta_movimiento_o_detalle(
    new.organization_id, new.branch_id, v_rule.debit_account_code
  );
  v_credito := public.fn_cuenta_movimiento_o_detalle(
    new.organization_id, new.branch_id, v_rule.credit_account_code
  );

  if public.fn_documento_tiene_cuenta_propia(new.organization_id, new.id, 'compra') then
    v_entry_id := public.fn_asiento_documento_por_lineas(new.id, 'compra', v_fact_key);
  elsif public.fn_bloqueo_tercero_documento(new.organization_id, new.branch_id, 'invoice_purchase', new.id) is not null then
    perform fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.issue_date, now()),
      'invoice_purchase', new.id::text, v_fact_key,
      v_debito, v_credito, new.total,
      'tercero_requerido',
      public.fn_bloqueo_tercero_documento(new.organization_id, new.branch_id, 'invoice_purchase', new.id));
  else
    v_entry_id := fn_create_journal_entry(
      p_organization_id := new.organization_id,
      p_branch_id := new.branch_id,
      p_entry_date := coalesce(new.issue_date, now()),
      p_memo := 'Compra ' || coalesce(new.number_ext, new.id::text),
      p_source := 'invoice_purchase',
      p_source_id := new.id::text,
      p_debit_account := v_debito,
      p_credit_account := v_credito,
      p_amount := new.total,
      p_tax_account := v_rule.tax_account_code,
      p_tax_amount := case when v_rule.use_tax_from_document then new.tax_total else 0 end,
      p_tax_is_credit := false,
      p_fact_key := v_fact_key
    );
  end if;

  perform fn_asiento_compra_aplicar_retenciones(v_entry_id, new.id, v_credito);

  return new;
end;
$fn$;

-- Proveedor sin NIT ni cédula: el mismo tercero por defecto de la venta,
-- conservando el nombre del proveedor. No se inventa un documento.
create or replace function public.fn_tercero_de_documento(
  p_tipo text,
  p_id uuid,
  out nit text,
  out nombre text
) returns record
language plpgsql
stable
set search_path to public, pg_temp
as $fn$
declare
  v_org integer;
begin
  nit := null;
  nombre := null;
  if p_tipo in ('venta', 'nota_debito', 'nota_credito') then
    select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
           nullif(btrim(c.full_name), ''),
           i.organization_id
      into nit, nombre, v_org
      from public.invoice_sales i
      left join public.customers c
        on c.id = i.customer_id
       and c.organization_id = i.organization_id
     where i.id = p_id;

    -- El devengo del POS usa el id de la venta, que no es el id de la factura.
    if not found and p_tipo = 'venta' then
      select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
             nullif(btrim(c.full_name), ''),
             s.organization_id
        into nit, nombre, v_org
        from public.sales s
        left join public.customers c
          on c.id = s.customer_id
         and c.organization_id = s.organization_id
       where s.id = p_id;
    end if;

    if nit is null then
      select t.nit, t.nombre
        into nit, nombre
        from public.fn_consumidor_final_contable(v_org) t;
    end if;
  elsif p_tipo = 'compra' then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')),
           nullif(btrim(s.name), ''),
           i.organization_id
      into nit, nombre, v_org
      from public.invoice_purchase i
      left join public.suppliers s on s.id = i.supplier_id
     where i.id = p_id;
    if nit is null and v_org is not null then
      select t.nit, coalesce(nombre, t.nombre)
        into nit, nombre
        from public.fn_consumidor_final_contable(v_org) t;
    end if;
  elsif p_tipo = 'documento_soporte' then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), ''), nullif(btrim(d.provider->>'identification'), '')),
           coalesce(nullif(btrim(s.name), ''), nullif(btrim(d.provider->>'names'), ''))
      into nit, nombre
      from public.support_documents d
      left join public.suppliers s on s.id = d.supplier_id
     where d.id = p_id;
  end if;
end;
$fn$;

revoke all on function public.fn_tercero_de_documento(text, uuid) from public, anon, authenticated;
