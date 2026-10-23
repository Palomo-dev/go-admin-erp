-- Revierte 20261023085352_centros_costo_reparto.
-- Devuelve el disparador de la línea a la versión que solo hereda el centro,
-- sin partir el importe. Banco, caja, el asiento del documento y el asiento
-- manual dejan de mandar el centro vacío para forzar el reparto.
-- Las líneas ya partidas se quedan partidas: no se reescriben asientos publicados.
-- Ejecutar antes de revertir 20261023085326_centros_costo_distribucion.

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

drop trigger if exists trg_journal_linea_heredar_centro on public.journal_lines;
create trigger trg_journal_linea_heredar_centro
  before insert on public.journal_lines
  for each row execute function public.fn_journal_linea_heredar_centro();

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
  'public.fn_asiento_manual_crear(integer,integer,timestamptz,text,jsonb,boolean,text,numeric,text)'::regprocedure,
  $rb_viejo$insert into public.journal_lines (
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
    ) r;$rb_viejo$,
  $rb_nuevo$insert into public.journal_lines (
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
    from jsonb_array_elements(p_lineas) l;$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_asiento_documento_por_lineas(uuid,text,text)'::regprocedure,
  $rb_viejo$case when p_tipo = 'compra' and exists (select 1 from public.invoice_purchase ip where ip.id = p_id and ip.organization_id = (v_armado->>'organization_id')::integer and ip.distribucion_id is not null) then null else nullif(v_linea->>'cost_center_id', '')::uuid end$rb_viejo$,
  $rb_nuevo$nullif(v_linea->>'cost_center_id', '')::uuid$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_auto_journal_cash_movement()'::regprocedure,
  $rb_viejo$p_cost_center_id := case when new.distribucion_id is not null then null else coalesce(new.centro_costo_id, public.fn_centro_defecto(v_session.organization_id, v_session.branch_id)) end,$rb_viejo$,
  $rb_nuevo$p_cost_center_id := coalesce(new.centro_costo_id, public.fn_centro_defecto(v_session.organization_id, v_session.branch_id)),$rb_nuevo$
);
select pg_temp.reemplazar_cuerpo(
  'public.fn_auto_journal_bank()'::regprocedure,
  $rb_viejo$p_cost_center_id := case when new.distribucion_id is not null then null else coalesce(new.centro_costo_id, public.fn_centro_defecto(new.organization_id, v_branch_id)) end,$rb_viejo$,
  $rb_nuevo$p_cost_center_id := coalesce(new.centro_costo_id, public.fn_centro_defecto(new.organization_id, v_branch_id)),$rb_nuevo$
);
