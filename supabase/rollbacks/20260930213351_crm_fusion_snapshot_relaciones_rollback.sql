-- Restaura exactamente la función de 20260930210840. Conserva snapshots existentes.
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
