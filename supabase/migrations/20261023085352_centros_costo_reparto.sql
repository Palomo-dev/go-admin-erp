-- La línea sin centro y con distribución del documento se parte aquí.
-- Si ya trae centro (un reverso, o una parte ya repartida) se conserva.
create or replace function public.fn_journal_linea_heredar_centro()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_modo text;
  v_org integer;
  v_branch integer;
  v_source text;
  v_source_id text;
  v_centro uuid;
  v_slip text;
  v_dist uuid;
  v_i integer := 0;
  v_parte record;
begin
  select e.organization_id, e.branch_id, e.source, e.source_id
    into v_org, v_branch, v_source, v_source_id
    from public.journal_entries e
   where e.id = new.journal_entry_id;

  if new.organization_id is null or new.organization_id = 0 then
    new.organization_id := coalesce(v_org, new.organization_id);
  end if;
  v_org := coalesce(nullif(new.organization_id, 0), v_org);

  v_modo := public.fn_modo_centro(v_org, new.account_code);
  if v_modo = 'no_aplica' then
    new.cost_center_id := null;
    return new;
  end if;
  if new.cost_center_id is not null then
    return new;
  end if;

  if v_source = 'bank_transactions' and coalesce(v_source_id, '') ~ '^[0-9]+$' then
    select b.distribucion_id into v_dist
      from public.bank_transactions b
     where b.id = v_source_id::integer
       and b.organization_id = v_org;
  elsif v_source = 'cash_movements' and coalesce(v_source_id, '') ~ '^[0-9]+$' then
    select m.distribucion_id into v_dist
      from public.cash_movements m
     where m.id = v_source_id::integer
       and m.organization_id = v_org;
  elsif v_source = 'invoice_purchase'
     and coalesce(v_source_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select ip.distribucion_id into v_dist
      from public.invoice_purchase ip
     where ip.id = v_source_id::uuid
       and ip.organization_id = v_org;
  end if;

  if v_dist is not null then
    for v_parte in
      select *
        from public.fn_repartir_monto(
          v_org, v_branch, new.account_code, null::uuid, v_dist,
          coalesce(new.debit, 0), coalesce(new.credit, 0),
          coalesce(new.debit_base, 0), coalesce(new.credit_base, 0)
        )
    loop
      v_i := v_i + 1;
      if v_i = 1 then
        new.debit := v_parte.debito;
        new.credit := v_parte.credito;
        new.debit_base := v_parte.debito_base;
        new.credit_base := v_parte.credito_base;
        new.cost_center_id := v_parte.cost_center_id;
      else
        insert into public.journal_lines (
          journal_entry_id, account_code, description, debit, credit,
          organization_id, currency_code, exchange_rate, debit_base, credit_base,
          cost_center_id, tercero_nit, tercero_nombre
        ) values (
          new.journal_entry_id, new.account_code, new.description,
          v_parte.debito, v_parte.credito,
          coalesce(nullif(new.organization_id, 0), v_org),
          new.currency_code, new.exchange_rate,
          v_parte.debito_base, v_parte.credito_base,
          v_parte.cost_center_id, new.tercero_nit, new.tercero_nombre
        );
      end if;
    end loop;
    if v_i > 0 then
      return new;
    end if;
  end if;

  v_slip := split_part(coalesce(v_source_id, ''), ':', 1);
  if v_source = 'payroll_slips'
     and v_slip ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select e.cost_center_id into v_centro
      from public.payroll_slips s
      join public.employments e on e.id = s.employment_id
     where s.id = v_slip::uuid
       and (
         e.branch_id is null
         or exists (
           select 1 from public.branches b
            where b.id = e.branch_id and b.organization_id = v_org
         )
       );
  elsif v_source = 'invoice_purchase'
     and coalesce(v_source_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select ip.cost_center_id into v_centro
      from public.invoice_purchase ip
     where ip.id = v_source_id::uuid
       and ip.organization_id = v_org;
    if v_centro is null then
      select case when count(distinct ii.cost_center_id) = 1 then min(ii.cost_center_id::text)::uuid end
        into v_centro
        from public.invoice_items ii
       where ii.invoice_purchase_id = v_source_id::uuid
         and ii.cost_center_id is not null;
    end if;
  end if;

  new.cost_center_id := coalesce(v_centro, public.fn_centro_defecto(v_org, v_branch));
  if new.cost_center_id is null then
    raise warning 'centro_costo_omitido: la cuenta % quedó sin centro', new.account_code;
  end if;
  return new;
end;
$fn$;

create or replace function pg_temp.reemplazar_cuerpo(p_firma regprocedure, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $fn$
declare
  v_def text;
begin
  v_def := pg_get_functiondef(p_firma);
  if position(p_viejo in v_def) = 0 then
    if position(p_nuevo in v_def) > 0 then
      return;
    end if;
    raise exception 'No está el fragmento en %', p_firma::text;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$fn$;

select pg_temp.reemplazar_cuerpo(
  'public.fn_auto_journal_bank()'::regprocedure,
  $viejo$p_cost_center_id := coalesce(new.centro_costo_id, public.fn_centro_defecto(new.organization_id, v_branch_id)),$viejo$,
  $nuevo$p_cost_center_id := case when new.distribucion_id is not null then null else coalesce(new.centro_costo_id, public.fn_centro_defecto(new.organization_id, v_branch_id)) end,$nuevo$
);

select pg_temp.reemplazar_cuerpo(
  'public.fn_auto_journal_cash_movement()'::regprocedure,
  $viejo$p_cost_center_id := coalesce(new.centro_costo_id, public.fn_centro_defecto(v_session.organization_id, v_session.branch_id)),$viejo$,
  $nuevo$p_cost_center_id := case when new.distribucion_id is not null then null else coalesce(new.centro_costo_id, public.fn_centro_defecto(v_session.organization_id, v_session.branch_id)) end,$nuevo$
);

select pg_temp.reemplazar_cuerpo(
  'public.fn_asiento_documento_por_lineas(uuid,text,text)'::regprocedure,
  $viejo$nullif(v_linea->>'cost_center_id', '')::uuid$viejo$,
  $nuevo$case when p_tipo = 'compra' and exists (select 1 from public.invoice_purchase ip where ip.id = p_id and ip.organization_id = (v_armado->>'organization_id')::integer and ip.distribucion_id is not null) then null else nullif(v_linea->>'cost_center_id', '')::uuid end$nuevo$
);

select pg_temp.reemplazar_cuerpo(
  'public.fn_asiento_manual_crear(integer,integer,timestamptz,text,jsonb,boolean,text,numeric,text)'::regprocedure,
  $viejo$insert into public.journal_lines (
    journal_entry_id, account_code, description, debit, credit,
    organization_id, currency_code, exchange_rate, debit_base, credit_base,
    cost_center_id, tercero_nit, tercero_nombre
  )
  select v_entry_id, l->>'account_code', nullif(l->>'description', ''),
         coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0),
         p_organization_id, coalesce(p_currency_code, 'COP'), v_tasa,
         coalesce((l->>'debit')::numeric, 0) * v_tasa, coalesce((l->>'credit')::numeric, 0) * v_tasa,
         coalesce(nullif(l->>'cost_center_id', '')::uuid, public.fn_centro_defecto(p_organization_id, p_branch_id)),
         nullif(btrim(l->>'tercero_nit'), ''),
         nullif(btrim(l->>'tercero_nombre'), '')
    from jsonb_array_elements(p_lineas) l;$viejo$,
  $nuevo$insert into public.journal_lines (
    journal_entry_id, account_code, description, debit, credit,
    organization_id, currency_code, exchange_rate, debit_base, credit_base,
    cost_center_id, tercero_nit, tercero_nombre
  )
  select v_entry_id, l->>'account_code', nullif(l->>'description', ''),
         r.debito, r.credito,
         p_organization_id, coalesce(p_currency_code, 'COP'), v_tasa,
         r.debito_base, r.credito_base,
         r.cost_center_id,
         nullif(btrim(l->>'tercero_nit'), ''),
         nullif(btrim(l->>'tercero_nombre'), '')
    from jsonb_array_elements(p_lineas) l
    cross join lateral public.fn_repartir_monto(
      p_organization_id,
      p_branch_id,
      l->>'account_code',
      nullif(l->>'cost_center_id', '')::uuid,
      nullif(l->>'distribucion_id', '')::uuid,
      coalesce((l->>'debit')::numeric, 0),
      coalesce((l->>'credit')::numeric, 0),
      coalesce((l->>'debit')::numeric, 0) * v_tasa,
      coalesce((l->>'credit')::numeric, 0) * v_tasa
    ) r;$nuevo$
);
