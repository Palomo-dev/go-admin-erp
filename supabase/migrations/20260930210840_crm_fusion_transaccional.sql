-- Ola 6: fusionar contactos sin escrituras parciales ni pérdida de auditoría.
create table if not exists public.customer_merges (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id),
  primary_customer_id uuid not null references public.customers(id),
  secondary_customer_id uuid not null references public.customers(id),
  snapshot jsonb not null,
  moved_rows jsonb not null default '[]'::jsonb,
  merged_by uuid not null references public.profiles(id),
  merged_at timestamptz not null default now(),
  undone_by uuid references public.profiles(id),
  undone_at timestamptz,
  check (primary_customer_id <> secondary_customer_id)
);
create index if not exists customer_merges_org_date_idx on public.customer_merges (organization_id, merged_at desc, id);
create unique index if not exists customer_merges_secondary_active_idx on public.customer_merges (secondary_customer_id) where undone_at is null;
alter table public.customer_merges enable row level security;
drop policy if exists crm_merges_read on public.customer_merges;
create policy crm_merges_read on public.customer_merges for select to authenticated using (
  public.user_belongs_to_organization((select auth.uid()), organization_id)
  and public.fn_crm_tiene_permiso(organization_id, 'crm.customers.merge')
);
revoke all on public.customer_merges from anon, authenticated;
grant select on public.customer_merges to authenticated;

insert into public.permissions (code, module, name, description)
values ('crm.customers.merge', 'crm', 'Fusionar clientes', 'Fusionar contactos con auditoría y restauración')
on conflict (code) do nothing;

-- Lista cerrada: no se alteran importes ni facturas emitidas. Una restricción
-- única que impida mover una relación revierte TODA la operación.
create or replace function public.crm_merge_customers(
  p_org integer, p_primary uuid, p_secondaries uuid[], p_choices jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_primary public.customers;
  v_secondary public.customers;
  v_merge uuid;
  v_table text;
  v_ids jsonb;
  v_moves jsonb;
  v_original jsonb;
  v_after jsonb;
  v_patch jsonb := '{}'::jsonb;
  v_field text;
  v_source uuid;
  v_source_row jsonb;
  v_fields constant text[] := array['first_name','last_name','company_name','trade_name','identification_type','identification_number','email','phone','address','city'];
begin
  perform public.fn_crm_exigir_permiso(p_org, array['crm.customers.merge']);
  if auth.uid() is null then raise exception using errcode='42501', message='sin_sesion'; end if;
  if p_secondaries is null or cardinality(p_secondaries) <> 1 or p_primary = any(p_secondaries)
     or jsonb_typeof(p_choices) is distinct from 'object' then
    raise exception using errcode='22023', message='seleccion_invalida';
  end if;
  -- El orden estable evita interbloqueos. La comprobación incluye los dos ids.
  perform id from public.customers where organization_id=p_org and id=any(array_append(p_secondaries,p_primary)) order by id for update;
  select * into v_primary from public.customers where id=p_primary and organization_id=p_org;
  select * into v_secondary from public.customers where id=p_secondaries[1] and organization_id=p_org;
  if v_primary.id is null or v_secondary.id is null then raise exception using errcode='P0002', message='cliente_no_encontrado'; end if;
  if v_primary.status='merged' or v_secondary.status='merged' then raise exception using errcode='40001', message='registro_cambio'; end if;
  if v_primary.customer_type <> v_secondary.customer_type then raise exception using errcode='22023', message='tipo_cliente_distinto'; end if;
  -- No se encadenan fusiones mientras su restauración sigue pendiente.
  if exists (select 1 from public.customer_merges where organization_id=p_org and undone_at is null
    and (primary_customer_id=any(array[p_primary,v_secondary.id]) or secondary_customer_id=any(array[p_primary,v_secondary.id]))) then
    raise exception using errcode='40001', message='fusion_pendiente';
  end if;
  perform id from public.invoice_sales where organization_id=p_org and customer_id=v_secondary.id order by id for update;
  if exists (select 1 from public.invoice_sales where organization_id=p_org and customer_id=v_secondary.id
    and (status <> 'draft' or xml_uuid is not null or einvoice_status is not null)) then
    raise exception using errcode='P0001', message='factura_emitida';
  end if;
  v_original := jsonb_build_object('primary',to_jsonb(v_primary),'secondary',to_jsonb(v_secondary));
  for v_field, v_source_row in select key,value from jsonb_each(p_choices) loop
    if not v_field=any(v_fields) or jsonb_typeof(v_source_row) <> 'string' then
      raise exception using errcode='22023', message='campo_invalido';
    end if;
    v_source := (v_source_row #>> '{}')::uuid;
    if v_source not in (p_primary,v_secondary.id) then raise exception using errcode='22023', message='eleccion_invalida'; end if;
    v_patch := v_patch || jsonb_build_object(v_field, case when v_source=p_primary then to_jsonb(v_primary)->v_field else to_jsonb(v_secondary)->v_field end);
  end loop;
  -- El correo y documento son únicos por organización. Si se transfieren al
  -- principal se liberan en el archivado y se conservan íntegros en el snapshot.
  update public.customers set
    email=case when v_patch ? 'email' and v_patch->>'email'=v_secondary.email then null else email end,
    identification_number=case when v_patch ? 'identification_number' and v_patch->>'identification_number'=v_secondary.identification_number then null else identification_number end,
    status='merged', inactivated_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('merged_into',p_primary,'merged_at',now())
  where id=v_secondary.id and organization_id=p_org;
  if v_patch <> '{}'::jsonb then
    select * into v_primary from jsonb_populate_record(v_primary,v_patch);
    update public.customers set first_name=v_primary.first_name,last_name=v_primary.last_name,
      company_name=v_primary.company_name,trade_name=v_primary.trade_name,
      identification_type=v_primary.identification_type,identification_number=v_primary.identification_number,
      email=v_primary.email,phone=v_primary.phone,address=v_primary.address,city=v_primary.city
    where id=p_primary and organization_id=p_org;
  end if;
  v_moves := '[]'::jsonb;
  foreach v_table in array array['conversations','opportunities','calls','customer_channel_identities','invoice_sales'] loop
    execute format('with moved as (update public.%I set customer_id=$1 where organization_id=$2 and customer_id=$3 returning id) select coalesce(jsonb_agg(id),''[]''::jsonb) from moved',v_table)
      into v_ids using p_primary,p_org,v_secondary.id;
    v_moves := v_moves || jsonb_build_array(jsonb_build_object('table',v_table,'column','customer_id','ids',v_ids));
  end loop;
  with moved as (update public.activities set related_id=p_primary where organization_id=p_org and related_type='customer' and related_id=v_secondary.id returning id)
    select coalesce(jsonb_agg(id),'[]'::jsonb) into v_ids from moved;
  v_moves := v_moves || jsonb_build_array(jsonb_build_object('table','activities','column','related_id','ids',v_ids));
  with moved as (update public.campaign_contacts cc set customer_id=p_primary where customer_id=v_secondary.id
    and exists (select 1 from public.campaigns c where c.id=cc.campaign_id and c.organization_id=p_org) returning cc.id)
    select coalesce(jsonb_agg(id),'[]'::jsonb) into v_ids from moved;
  v_moves := v_moves || jsonb_build_array(jsonb_build_object('table','campaign_contacts','column','customer_id','ids',v_ids));
  select jsonb_build_object('primary',to_jsonb(p),'secondary',to_jsonb(s)) into v_after
    from public.customers p, public.customers s where p.id=p_primary and s.id=v_secondary.id;
  insert into public.customer_merges (organization_id,primary_customer_id,secondary_customer_id,snapshot,moved_rows,merged_by)
    values (p_org,p_primary,v_secondary.id,jsonb_build_object('before',v_original,'after',v_after,'fields',to_jsonb(v_fields)),v_moves,auth.uid()) returning id into v_merge;
  return jsonb_build_object('id',v_merge,'primary_customer_id',p_primary,'moved_rows',v_moves);
end;
$$;
revoke all on function public.crm_merge_customers(integer,uuid,uuid[],jsonb) from public, anon;
grant execute on function public.crm_merge_customers(integer,uuid,uuid[],jsonb) to authenticated;

create or replace function public.crm_unmerge_customer(p_org integer,p_merge uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_merge public.customer_merges;
  v_primary public.customers;
  v_secondary public.customers;
  v_row jsonb;
  v_field text;
  v_count integer;
  v_expected integer;
begin
  perform public.fn_crm_exigir_permiso(p_org,array['crm.customers.merge']);
  if auth.uid() is null or not exists (select 1 from public.organization_members
    where organization_id=p_org and user_id=auth.uid() and is_active and (is_super_admin or role_id in (1,2))) then
    raise exception using errcode='42501',message='solo_administrador';
  end if;
  select * into v_merge from public.customer_merges where id=p_merge and organization_id=p_org for update;
  if v_merge.id is null then raise exception using errcode='P0002',message='fusion_no_encontrada'; end if;
  if v_merge.undone_at is not null or v_merge.merged_at < now()-interval '30 days' then
    raise exception using errcode='P0001',message='fusion_no_reversible';
  end if;
  perform id from public.customers where organization_id=p_org and id in (v_merge.primary_customer_id,v_merge.secondary_customer_id) order by id for update;
  select * into v_primary from public.customers where id=v_merge.primary_customer_id and organization_id=p_org;
  select * into v_secondary from public.customers where id=v_merge.secondary_customer_id and organization_id=p_org;
  for v_field in select jsonb_array_elements_text(v_merge.snapshot->'fields') loop
    if to_jsonb(v_primary)->v_field is distinct from v_merge.snapshot->'after'->'primary'->v_field
      or to_jsonb(v_secondary)->v_field is distinct from v_merge.snapshot->'after'->'secondary'->v_field then
      raise exception using errcode='40001',message='registro_cambio';
    end if;
  end loop;
  if v_primary.id is null or v_secondary.id is null or v_secondary.status<>'merged'
    or v_secondary.metadata is distinct from v_merge.snapshot->'after'->'secondary'->'metadata' then
    raise exception using errcode='40001',message='registro_cambio';
  end if;
  for v_row in select value from jsonb_array_elements(v_merge.moved_rows) loop
    if v_row->>'table' not in ('conversations','opportunities','calls','customer_channel_identities','invoice_sales','activities','campaign_contacts')
      or v_row->>'column' not in ('customer_id','related_id') then raise exception using errcode='22023',message='snapshot_invalido'; end if;
    v_expected := jsonb_array_length(v_row->'ids');
    if v_row->>'table'='campaign_contacts' then
      update public.campaign_contacts cc set customer_id=v_merge.secondary_customer_id
        where cc.id in (select value::uuid from jsonb_array_elements_text(v_row->'ids')) and cc.customer_id=v_merge.primary_customer_id
        and exists (select 1 from public.campaigns c where c.id=cc.campaign_id and c.organization_id=p_org);
      get diagnostics v_count = row_count;
    else
      if v_row->>'table'='invoice_sales' then
        perform id from public.invoice_sales where organization_id=p_org
          and id in (select value::uuid from jsonb_array_elements_text(v_row->'ids')) order by id for update;
      end if;
      if v_row->>'table'='invoice_sales' and exists (select 1 from public.invoice_sales
        where organization_id=p_org and id in (select value::uuid from jsonb_array_elements_text(v_row->'ids'))
        and (status<>'draft' or xml_uuid is not null or einvoice_status is not null)) then
        raise exception using errcode='P0001',message='factura_emitida';
      end if;
      execute format('update public.%I set %I=$1 where organization_id=$2 and %I=$3 and id in (select value::uuid from jsonb_array_elements_text($4))%s',
        v_row->>'table',v_row->>'column',v_row->>'column',case when v_row->>'table'='activities' then ' and related_type=''customer''' else '' end)
        using v_merge.secondary_customer_id,p_org,v_merge.primary_customer_id,v_row->'ids';
      get diagnostics v_count = row_count;
    end if;
    if v_count<>v_expected then raise exception using errcode='40001',message='fila_movida_cambio'; end if;
  end loop;
  select * into v_primary from jsonb_populate_record(v_primary,v_merge.snapshot->'before'->'primary');
  -- Restaurar primero el principal libera los valores únicos transferidos.
  update public.customers set first_name=v_primary.first_name,last_name=v_primary.last_name,company_name=v_primary.company_name,
    trade_name=v_primary.trade_name,identification_type=v_primary.identification_type,identification_number=v_primary.identification_number,
    email=v_primary.email,phone=v_primary.phone,address=v_primary.address,city=v_primary.city
    where id=v_primary.id and organization_id=p_org;
  select * into v_secondary from jsonb_populate_record(v_secondary,v_merge.snapshot->'before'->'secondary');
  update public.customers set email=v_secondary.email,identification_number=v_secondary.identification_number,
    status=v_secondary.status,inactivated_at=v_secondary.inactivated_at,metadata=v_secondary.metadata
    where id=v_secondary.id and organization_id=p_org;
  update public.customer_merges set undone_at=now(),undone_by=auth.uid() where id=p_merge and organization_id=p_org;
  return jsonb_build_object('id',p_merge,'undone',true);
end;
$$;
revoke all on function public.crm_unmerge_customer(integer,uuid) from public,anon;
grant execute on function public.crm_unmerge_customer(integer,uuid) to authenticated;
