-- Venta a consumidor final: el devengo pedía un NIT y el POS no tiene cliente.
-- Sin cliente, o con cliente sin documento, el tercero es 222222222222
-- «Consumidor final», salvo que la organización guarde otro en
-- contabilidad_consumidor_final. El reintento es idempotente por fact_key:
-- si el asiento ya existe no crea otro; solo completa el tercero que faltaba
-- y cierra la falla.

create table if not exists public.contabilidad_consumidor_final (
  organization_id integer primary key references public.organizations (id) on delete cascade,
  nit text not null,
  nombre text not null,
  updated_at timestamptz not null default now(),
  constraint contabilidad_consumidor_final_nit_chk check (nit ~ '^[0-9]{3,20}$'),
  constraint contabilidad_consumidor_final_nombre_chk check (char_length(btrim(nombre)) between 1 and 200)
);

comment on table public.contabilidad_consumidor_final is
  'Tercero que usa el devengo cuando la venta o la nota no trae cliente, o el cliente no tiene documento. Sin fila, el defecto es 222222222222 «Consumidor final».';

alter table public.contabilidad_consumidor_final enable row level security;

drop policy if exists "Los miembros gestionan el consumidor final de su organizacion"
  on public.contabilidad_consumidor_final;
create policy "Los miembros gestionan el consumidor final de su organizacion"
  on public.contabilidad_consumidor_final
  for all
  using (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = auth.uid() and om.is_active = true
    )
  )
  with check (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = auth.uid() and om.is_active = true
    )
  );

revoke all on table public.contabilidad_consumidor_final from public, anon;
grant select, insert, update, delete on table public.contabilidad_consumidor_final to authenticated;
grant all on table public.contabilidad_consumidor_final to service_role;

create or replace function public.fn_consumidor_final_contable(
  p_organization_id integer,
  out nit text,
  out nombre text
) returns record
language sql
stable
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce(nullif(btrim(c.nit), ''), '222222222222'),
         coalesce(nullif(btrim(c.nombre), ''), 'Consumidor final')
    from (select 1) semilla
    left join public.contabilidad_consumidor_final c
      on c.organization_id = p_organization_id;
$fn$;

revoke all on function public.fn_consumidor_final_contable(integer) from public, anon, authenticated;
grant execute on function public.fn_consumidor_final_contable(integer) to service_role;

create or replace function public.fn_tercero_de_documento(
  p_tipo text,
  p_id uuid,
  out nit text,
  out nombre text
) returns record
language plpgsql
stable
set search_path to 'public', 'pg_temp'
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
           nullif(btrim(s.name), '')
      into nit, nombre
      from public.invoice_purchase i
      left join public.suppliers s on s.id = i.supplier_id
     where i.id = p_id;
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

create or replace function public.fn_trg_tercero_linea_asiento()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_source text;
  v_source_id text;
  v_org integer;
  v_nit text;
  v_nombre text;
begin
  if new.tercero_nit is not null then
    return new;
  end if;
  select e.source, e.source_id, e.organization_id
    into v_source, v_source_id, v_org
    from public.journal_entries e
   where e.id = new.journal_entry_id;
  -- sales: el devengo del POS. La factura, si llega después, reutiliza la misma clave.
  if v_source is null or v_source not in ('invoice_sales', 'invoice_purchase', 'credit_note', 'cash_movements', 'support_documents', 'sales') then
    return new;
  end if;

  if v_source = 'cash_movements' then
    select nullif(btrim(cm.tercero_nit), ''), nullif(btrim(cm.tercero_nombre), '')
      into v_nit, v_nombre
      from public.cash_movements cm
     where cm.id::text = v_source_id and cm.organization_id = v_org;
  elsif v_source = 'invoice_purchase' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('compra', v_source_id::uuid) t;
  elsif v_source = 'support_documents' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('documento_soporte', v_source_id::uuid) t;
  else
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('venta', v_source_id::uuid) t;
  end if;

  if v_nit is not null then
    new.tercero_nit := v_nit;
    new.tercero_nombre := coalesce(new.tercero_nombre, v_nombre);
  end if;
  return new;
exception when others then
  return new;
end;
$fn$;

revoke all on function public.fn_trg_tercero_linea_asiento() from public, anon, authenticated;

create or replace function public.fn_reintentar_asientos_tercero_requerido()
returns table (failure_id bigint, entry_id integer, resultado text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  f public.journal_entry_failures%rowtype;
  v_inv public.invoice_sales%rowtype;
  v_rule record;
  v_entry integer;
  v_nit text;
  v_nombre text;
  v_tipo text;
  v_bloqueo text;
  v_branch integer;
  v_debito text;
  v_credito text;
  v_fallo text;
  v_filas integer;
  v_creado boolean;
begin
  for f in
    select *
      from public.journal_entry_failures
     where reason = 'tercero_requerido'
       and resolved_at is null
       and fact_key is not null
     order by id
     for update
  loop
    v_entry := null;
    v_nit := null;
    v_nombre := null;
    v_creado := false;
    v_filas := 0;
    v_inv := null;

    select e.id
      into v_entry
      from public.journal_entries e
     where e.organization_id = f.organization_id
       and e.fact_key = f.fact_key
     limit 1;

    select *
      into v_inv
      from public.invoice_sales i
     where i.id = f.source_id::uuid
       and i.organization_id = f.organization_id;

    v_tipo := case
      when v_inv.document_type = 'credit_note' or f.fact_key like 'accrual:credit_note:%' then 'nota_credito'
      when v_inv.document_type = 'debit_note' then 'nota_debito'
      else 'venta'
    end;

    select t.nit, t.nombre
      into v_nit, v_nombre
      from public.fn_tercero_de_documento(v_tipo, f.source_id::uuid) t;

    if v_nit is null then
      failure_id := f.id;
      entry_id := v_entry;
      resultado := 'sigue_sin_tercero';
      return next;
      continue;
    end if;

    if v_entry is null then
      if v_inv.id is null then
        failure_id := f.id;
        entry_id := null;
        resultado := 'sin_documento';
        return next;
        continue;
      end if;

      v_bloqueo := public.fn_bloqueo_tercero_documento(
        f.organization_id,
        coalesce(v_inv.branch_id, f.branch_id),
        case when coalesce(v_inv.document_type, '') = 'credit_note' then 'sale_credit_note' else 'invoice_sales' end,
        v_inv.id
      );
      if v_bloqueo is not null then
        failure_id := f.id;
        entry_id := null;
        resultado := 'sigue_bloqueada';
        return next;
        continue;
      end if;

      if coalesce(v_inv.document_type, '') = 'credit_note' then
        select *
          into v_rule
          from public.accounting_rules r
         where r.organization_id = v_inv.organization_id
           and r.source_type = 'sale_credit_note'
           and r.event_type = 'created'
           and r.is_active = true
         order by r.priority
         limit 1;
        if not found then
          failure_id := f.id;
          entry_id := null;
          resultado := 'sin_regla';
          return next;
          continue;
        end if;
        v_entry := public.fn_create_journal_entry(
          p_organization_id := v_inv.organization_id,
          p_branch_id := v_inv.branch_id,
          p_entry_date := coalesce(v_inv.issue_date, f.entry_date, now()),
          p_memo := 'Nota Crédito ' || coalesce(v_inv.number, v_inv.id::text),
          p_source := 'invoice_sales',
          p_source_id := v_inv.id::text,
          p_debit_account := v_rule.debit_account_code,
          p_credit_account := v_rule.credit_account_code,
          p_amount := abs(coalesce(v_inv.total, 0)),
          p_tax_account := v_rule.tax_account_code,
          p_tax_amount := case when v_rule.use_tax_from_document then abs(coalesce(v_inv.tax_total, 0)) else 0 end,
          p_created_by := v_inv.created_by,
          p_tax_is_credit := false,
          p_fact_key := f.fact_key
        );
      else
        select *
          into v_rule
          from public.fn_regla_devengo_venta(v_inv.organization_id);
        if not found then
          failure_id := f.id;
          entry_id := null;
          resultado := 'sin_regla';
          return next;
          continue;
        end if;

        if public.fn_documento_tiene_cuenta_propia(
          v_inv.organization_id,
          v_inv.id,
          case when v_inv.document_type = 'debit_note' then 'nota_debito' else 'venta' end
        ) then
          v_entry := public.fn_asiento_documento_por_lineas(
            v_inv.id,
            case when v_inv.document_type = 'debit_note' then 'nota_debito' else 'venta' end,
            f.fact_key
          );
        else
          v_branch := v_inv.branch_id;
          if v_branch is null or v_branch = 0 or not exists (
            select 1 from public.branches b
             where b.id = v_branch and b.organization_id = v_inv.organization_id
          ) then
            select b.id into v_branch
              from public.branches b
             where b.organization_id = v_inv.organization_id
               and b.is_main = true
               and b.is_active = true
             limit 1;
            if v_branch is null then
              select min(b.id) into v_branch
                from public.branches b
               where b.organization_id = v_inv.organization_id;
            end if;
          end if;

          select r.cuenta, r.fallo
            into v_debito, v_fallo
            from public.fn_cuenta_configurada_de_sede(
              v_inv.organization_id, v_branch, 'invoice_sales', 'debito', v_rule.debit_account_code
            ) r;
          if v_fallo is not null then
            failure_id := f.id;
            entry_id := null;
            resultado := 'cuenta_no_configurada';
            return next;
            continue;
          end if;

          select r.cuenta, r.fallo
            into v_credito, v_fallo
            from public.fn_cuenta_configurada_de_sede(
              v_inv.organization_id, v_branch, 'invoice_sales', 'credito', v_rule.credit_account_code
            ) r;
          if v_fallo is not null then
            failure_id := f.id;
            entry_id := null;
            resultado := 'cuenta_no_configurada';
            return next;
            continue;
          end if;

          v_entry := public.fn_create_journal_entry(
            p_organization_id := v_inv.organization_id,
            p_branch_id := v_branch,
            p_entry_date := coalesce(v_inv.issue_date, f.entry_date, now()),
            p_memo := case when v_inv.document_type = 'debit_note' then 'Nota débito ' else 'Venta ' end
                      || coalesce(v_inv.number, v_inv.id::text),
            p_source := 'invoice_sales',
            p_source_id := v_inv.id::text,
            p_debit_account := v_debito,
            p_credit_account := v_credito,
            p_amount := v_inv.total,
            p_tax_account := v_rule.tax_account_code,
            p_tax_amount := case when v_rule.use_tax_from_document then coalesce(v_inv.tax_total, 0) else 0 end,
            p_created_by := v_inv.created_by,
            p_tax_is_credit := true,
            p_fact_key := f.fact_key
          );
        end if;
      end if;

      if v_entry is null then
        failure_id := f.id;
        entry_id := null;
        resultado := 'no_creado';
        return next;
        continue;
      end if;
      v_creado := true;
    end if;

    -- Las líneas publicadas no se editan. Esta llave es la de mantenimiento
    -- contable y aquí solo llena el tercero que quedó nulo.
    perform set_config('app.contabilidad_mantenimiento', 'on', true);
    update public.journal_lines jl
       set tercero_nit = v_nit,
           tercero_nombre = coalesce(jl.tercero_nombre, v_nombre)
      from public.journal_entries e
     where jl.journal_entry_id = e.id
       and e.id = v_entry
       and e.organization_id = f.organization_id
       and jl.tercero_nit is null;
    get diagnostics v_filas = row_count;
    perform set_config('app.contabilidad_mantenimiento', '', true);

    update public.journal_entry_failures
       set resolved_at = now(),
           resolved_entry_id = v_entry,
           resolution = case
             when v_creado then 'Reintento de tercero requerido: asiento creado con la clave del hecho.'
             when v_filas > 0 then 'La clave del hecho ya tenía asiento; se completó el tercero faltante y no se duplicó.'
             else 'La clave del hecho ya tenía asiento; no se duplicó.'
           end
     where id = f.id
       and resolved_at is null;

    failure_id := f.id;
    entry_id := v_entry;
    resultado := case when v_creado then 'creado' else 'ya_existia' end;
    return next;
  end loop;
end;
$fn$;

revoke all on function public.fn_reintentar_asientos_tercero_requerido() from public, anon, authenticated;
grant execute on function public.fn_reintentar_asientos_tercero_requerido() to service_role;

select public.fn_reintentar_asientos_tercero_requerido();
