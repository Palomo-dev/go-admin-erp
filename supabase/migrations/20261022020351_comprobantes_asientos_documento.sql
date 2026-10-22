create or replace function public.fn_armar_asiento_documento(
  p_tipo text,
  p_id uuid,
  p_lineas jsonb default null
) returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_org integer;
  v_branch integer;
  v_total numeric := 0;
  v_tax numeric := 0;
  v_neto numeric := 0;
  v_fecha timestamptz;
  v_memo text;
  v_source text;
  v_created_by uuid;
  v_debito text;
  v_credito text;
  v_impuesto text;
  v_usa_impuesto boolean := false;
  v_cfg record;
  v_nit text;
  v_nombre text;
  v_rol text;
  v_impuesto_al_credito boolean;
  v_lineas jsonb := '[]'::jsonb;
  v_pesos numeric := 0;
  v_asignado numeric := 0;
  v_parte numeric;
  v_cuenta text;
  v_fallo text;
  v_exige record;
  v_i integer := 0;
  v_n integer := 0;
  v_base numeric := 0;
  v_reparto jsonb := '[]'::jsonb;
  v_suma_debe numeric := 0;
  v_suma_haber numeric := 0;
  r record;
begin
  if p_tipo = 'compra' then
    select i.organization_id, i.branch_id, abs(coalesce(i.total, 0)), abs(coalesce(i.tax_total, 0)),
           coalesce(i.issue_date, now()), i.created_by,
           'Compra ' || coalesce(i.number_ext, i.id::text)
      into v_org, v_branch, v_total, v_tax, v_fecha, v_created_by, v_memo
      from public.invoice_purchase i where i.id = p_id;
    v_source := 'invoice_purchase';
    v_impuesto_al_credito := false;
  elsif p_tipo = 'documento_soporte' then
    select d.organization_id, d.branch_id, abs(coalesce(d.total, 0)), abs(coalesce(d.tax_total, 0)),
           coalesce(d.issue_date, now()), d.created_by,
           'Documento soporte ' || coalesce(d.number, d.reference_code, d.id::text)
      into v_org, v_branch, v_total, v_tax, v_fecha, v_created_by, v_memo
      from public.support_documents d where d.id = p_id;
    v_source := 'support_documents';
    v_impuesto_al_credito := false;
  elsif p_tipo = 'nota_credito' and p_lineas is not null then
    select coalesce(sum(abs(coalesce((l->>'total_line')::numeric, 0))), 0)
      into v_total
      from jsonb_array_elements(p_lineas) l;
    select i.organization_id, i.branch_id, coalesce(i.issue_date, now()), i.created_by,
           abs(coalesce(i.tax_total, 0)), abs(coalesce(i.total, 0))
      into v_org, v_branch, v_fecha, v_created_by, v_tax, v_base
      from public.invoice_sales i where i.id = p_id;
    if v_base > 0 then
      v_tax := least(v_total, round(v_tax * v_total / v_base, 2));
    else
      v_tax := 0;
    end if;
    v_memo := 'Nota crédito';
    v_source := 'invoice_sales';
    v_impuesto_al_credito := false;
  else
    select i.organization_id, i.branch_id, abs(coalesce(i.total, 0)), abs(coalesce(i.tax_total, 0)),
           coalesce(i.issue_date, now()), i.created_by,
           case
             when i.document_type = 'credit_note' then 'Nota crédito ' || coalesce(i.number, i.id::text)
             when i.document_type = 'debit_note' then 'Nota débito ' || coalesce(i.number, i.id::text)
             else 'Venta ' || coalesce(i.number, i.id::text)
           end
      into v_org, v_branch, v_total, v_tax, v_fecha, v_created_by, v_memo
      from public.invoice_sales i where i.id = p_id;
    v_source := 'invoice_sales';
    v_impuesto_al_credito := p_tipo is distinct from 'nota_credito';
  end if;

  if v_org is null then
    return jsonb_build_object('ok', false, 'fallo', 'Documento no encontrado', 'lineas', '[]'::jsonb);
  end if;

  if p_tipo in ('compra', 'documento_soporte') then
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.fn_regla_devengo_compra(v_org) r;
  elsif p_tipo = 'nota_credito' then
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.accounting_rules r
     where r.organization_id = v_org
       and r.source_type = 'sale_credit_note'
       and r.event_type = 'created'
       and r.is_active = true
     order by r.priority
     limit 1;
  else
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.fn_regla_devengo_venta(v_org) r;
  end if;

  if v_debito is null then
    return jsonb_build_object('ok', false, 'fallo', 'No hay regla contable activa para este documento', 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;

  select * into v_cfg
    from public.fn_aplicar_configuracion_contable(
      v_org, v_branch,
      case when p_tipo = 'nota_credito' then 'sale_credit_note' else v_source end,
      v_debito, v_credito, v_impuesto
    );
  if v_cfg.fallo is not null then
    return jsonb_build_object('ok', false, 'fallo', v_cfg.fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;

  if not coalesce(v_usa_impuesto, false) then
    v_tax := 0;
  end if;
  v_total := round(coalesce(v_total, 0), 2);
  v_tax := round(coalesce(v_tax, 0), 2);
  if v_tax > v_total then
    v_tax := v_total;
  end if;
  v_neto := round(v_total - v_tax, 2);

  select t.nit, t.nombre into v_nit, v_nombre
    from public.fn_tercero_de_documento(
      case when p_tipo = 'nota_debito' then 'venta' else p_tipo end,
      p_id
    ) t;

  if p_lineas is not null and p_tipo = 'nota_credito' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'orden', s.orden, 'cuenta', s.cuenta, 'monto', s.monto, 'descripcion', s.descripcion
           ) order by s.orden), '[]'::jsonb)
      into v_reparto
      from (
        select row_number() over () as orden,
               coalesce(
                 public.fn_cuenta_catalogo_linea(v_org, nullif(l->>'product_id', '')::integer, 'devolucion', l->>'cuenta_contable'),
                 v_cfg.debito
               ) as cuenta,
               abs(coalesce((l->>'total_line')::numeric, 0)) as monto,
               coalesce(nullif(btrim(l->>'descripcion'), ''), 'Nota crédito') as descripcion
          from jsonb_array_elements(p_lineas) l
      ) s;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'orden', s.orden, 'cuenta', s.cuenta, 'monto', s.monto, 'descripcion', s.descripcion
           ) order by s.orden), '[]'::jsonb)
      into v_reparto
      from (
        select row_number() over (order by ii.created_at, ii.id) as orden,
               coalesce(
                 public.fn_cuenta_catalogo_linea(
                   v_org,
                   ii.product_id,
                   case
                     when p_tipo in ('compra', 'documento_soporte') and coalesce(pr.track_stock, false) then 'inventario'
                     when p_tipo in ('compra', 'documento_soporte') then 'costo'
                     when p_tipo = 'nota_credito' then 'devolucion'
                     else 'ingreso'
                   end,
                   ii.cuenta_contable
                 ),
                 case when v_impuesto_al_credito then v_cfg.credito else v_cfg.debito end
               ) as cuenta,
               abs(coalesce(ii.total_line, 0)) as monto,
               coalesce(nullif(btrim(ii.description), ''), v_memo) as descripcion
          from public.invoice_items ii
          left join public.products pr on pr.id = ii.product_id and pr.organization_id = v_org
         where case p_tipo
                 when 'compra' then ii.invoice_purchase_id = p_id
                 when 'documento_soporte' then ii.support_document_id = p_id
                 else ii.invoice_sales_id = p_id
               end
      ) s;
  end if;

  select coalesce(sum((e->>'monto')::numeric), 0), count(*)
    into v_pesos, v_n
    from jsonb_array_elements(v_reparto) e;
  v_asignado := 0;

  for r in
    select (e->>'cuenta') as cuenta,
           (e->>'monto')::numeric as monto,
           e->>'descripcion' as descripcion
      from jsonb_array_elements(v_reparto) e
     order by (e->>'orden')::integer
  loop
    v_i := v_i + 1;
    if v_pesos = 0 then
      v_parte := case when v_i = 1 then v_neto else 0 end;
    elsif v_i = v_n then
      v_parte := round(v_neto - v_asignado, 2);
    else
      v_parte := round(v_neto * r.monto / v_pesos, 2);
      v_asignado := v_asignado + v_parte;
    end if;
    if v_parte = 0 then
      continue;
    end if;
    v_fallo := public.fn_validar_cuenta_movimiento(v_org, r.cuenta);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, r.cuenta);
    if coalesce(v_exige.requiere_tercero, false) and v_nit is null then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || r.cuenta || ' exige el NIT o la cédula del tercero', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    if coalesce(v_exige.requiere_centro_costo, false) then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || r.cuenta || ' exige un centro de costo', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', r.cuenta,
      'descripcion', r.descripcion,
      'debito', case when v_impuesto_al_credito then 0 else v_parte end,
      'credito', case when v_impuesto_al_credito then v_parte else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre
    ));
  end loop;

  if v_tax > 0 and v_cfg.impuesto is not null then
    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cfg.impuesto);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cfg.impuesto);
    if coalesce(v_exige.requiere_tercero, false) and v_nit is null then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_cfg.impuesto || ' exige el NIT o la cédula del tercero', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_cfg.impuesto,
      'descripcion', 'IVA - ' || v_memo,
      'debito', case when v_impuesto_al_credito then 0 else v_tax end,
      'credito', case when v_impuesto_al_credito then v_tax else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre
    ));
  end if;

  v_cuenta := case when v_impuesto_al_credito then v_cfg.debito else v_cfg.credito end;
  v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cuenta);
  if v_fallo is not null then
    return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;
  select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cuenta);
  if coalesce(v_exige.requiere_tercero, false) and v_nit is null then
    return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_cuenta || ' exige el NIT o la cédula del tercero', 'lineas', '[]'::jsonb, 'organization_id', v_org);
  end if;

  v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
    'cuenta', v_cuenta,
    'descripcion', v_memo,
    'debito', case when v_impuesto_al_credito then v_total else 0 end,
    'credito', case when v_impuesto_al_credito then 0 else v_total end,
    'tercero_nit', v_nit,
    'tercero_nombre', v_nombre
  ));

  select coalesce(sum((l->>'debito')::numeric), 0), coalesce(sum((l->>'credito')::numeric), 0)
    into v_suma_debe, v_suma_haber
    from jsonb_array_elements(v_lineas) l;
  if round(v_suma_debe, 2) <> round(v_suma_haber, 2) or v_suma_debe = 0 then
    return jsonb_build_object(
      'ok', false,
      'fallo', 'El asiento no cuadra con las líneas del documento',
      'lineas', '[]'::jsonb,
      'organization_id', v_org
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'fallo', null,
    'organization_id', v_org,
    'branch_id', v_branch,
    'fecha', v_fecha,
    'memo', v_memo,
    'source', v_source,
    'source_id', p_id,
    'created_by', v_created_by,
    'tercero_nit', v_nit,
    'tercero_nombre', v_nombre,
    'lineas', v_lineas,
    'debitos', v_total,
    'creditos', v_total,
    'cuadra', true
  );
end;
$fn$;

create or replace function public.fn_asiento_documento_por_lineas(
  p_id uuid,
  p_tipo text,
  p_fact_key text
) returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_armado jsonb;
  v_entry_id integer;
  v_linea jsonb;
begin
  v_armado := public.fn_armar_asiento_documento(p_tipo, p_id, null);
  if coalesce((v_armado->>'ok')::boolean, false) is not true then
    perform public.fn_log_journal_failure(
      nullif(v_armado->>'organization_id', '')::integer,
      nullif(v_armado->>'branch_id', '')::integer,
      coalesce(nullif(v_armado->>'fecha', '')::timestamptz, now()),
      coalesce(v_armado->>'source', 'invoice_sales'),
      p_id::text,
      p_fact_key,
      null, null,
      coalesce((v_armado->>'debitos')::numeric, 0),
      'cuenta_linea',
      coalesce(v_armado->>'fallo', 'No se pudo armar el asiento')
    );
    return null;
  end if;

  if not public.fn_is_period_open(
    (v_armado->>'organization_id')::integer,
    ((v_armado->>'fecha')::timestamptz)::date
  ) then
    perform public.fn_log_journal_failure(
      nullif(v_armado->>'organization_id', '')::integer,
      nullif(v_armado->>'branch_id', '')::integer,
      coalesce(nullif(v_armado->>'fecha', '')::timestamptz, now()),
      coalesce(v_armado->>'source', 'invoice_sales'),
      p_id::text,
      p_fact_key,
      null, null,
      coalesce((v_armado->>'debitos')::numeric, 0),
      'period_closed',
      'Periodo contable cerrado para la fecha ' || (((v_armado->>'fecha')::timestamptz)::date)
    );
    return null;
  end if;

  begin
    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key
    ) values (
      (v_armado->>'organization_id')::integer,
      (v_armado->>'branch_id')::integer,
      (v_armado->>'fecha')::timestamptz,
      v_armado->>'memo',
      v_armado->>'source',
      p_id::text,
      true,
      nullif(v_armado->>'created_by', '')::uuid,
      p_fact_key
    ) returning id into v_entry_id;
  exception when unique_violation then
    select e.id into v_entry_id
      from public.journal_entries e
     where e.organization_id = (v_armado->>'organization_id')::integer
       and e.fact_key = p_fact_key
     limit 1;
    return v_entry_id;
  end;

  for v_linea in select * from jsonb_array_elements(v_armado->'lineas') loop
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, organization_id, tercero_nit, tercero_nombre
    ) values (
      v_entry_id,
      v_linea->>'cuenta',
      v_linea->>'descripcion',
      coalesce((v_linea->>'debito')::numeric, 0),
      coalesce((v_linea->>'credito')::numeric, 0),
      (v_armado->>'organization_id')::integer,
      nullif(v_linea->>'tercero_nit', ''),
      nullif(v_linea->>'tercero_nombre', '')
    );
  end loop;
  return v_entry_id;
end;
$fn$;

revoke all on function public.fn_armar_asiento_documento(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fn_asiento_documento_por_lineas(uuid, text, text) from public, anon, authenticated;
