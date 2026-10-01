-- Recepción Cloud certificada: todas las escrituras y su postprocesado en una transacción.
-- Evidencia privada; los metadatos editables no deduplican ni autorizan consentimiento.
alter table public.crm_inbound_message_receipts
 add column provider_external_id text,
 add column provider_phone_digits text,
 add column provider_raw_message jsonb,
 add column provider_customer_phone text,
 add column provider_phone_matches boolean;
alter table public.crm_inbound_message_receipts add constraint crm_inbound_provider_proof_check check(
 (provider_external_id is null and provider_phone_digits is null and provider_raw_message is null and provider_customer_phone is null and provider_phone_matches is null)
 or (provider_external_id is not null and length(provider_external_id) between 1 and 500 and provider_phone_digits ~ '^[1-9][0-9]{7,14}$'
 and provider_phone_digits is not null and provider_raw_message is not null and jsonb_typeof(provider_raw_message)='object' and provider_phone_matches is not null));
create unique index crm_inbound_provider_external_uq on public.crm_inbound_message_receipts(organization_id,channel_id,provider_external_id) where provider_external_id is not null;

CREATE OR REPLACE FUNCTION public.crm_apply_inbound_contact_consent(p_org integer, p_message uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_message public.messages;v_customer uuid;v_settings jsonb;v_normal text;v_keywords jsonb;v_action text:='none';v_key text;v_out boolean:=false;v_in boolean:=false;v_receipt public.crm_inbound_message_receipts;
begin
 perform public.crm_lock_comm_wallet(p_org);
 select * into v_message from public.messages where id=p_message and organization_id=p_org for update;
 if not found then raise exception 'mensaje_no_encontrado' using errcode='P0002';end if;

 if v_message.direction<>'inbound' or v_message.role<>'customer' or v_message.content_type<>'text' then return 'none';end if;
 select q.customer_id into v_customer from public.conversations q join public.channels c on c.id=q.channel_id and c.organization_id=q.organization_id
 where q.id=v_message.conversation_id and q.organization_id=p_org and q.channel_id=v_message.channel_id and c.type='whatsapp';
 if not found or (v_message.sender_customer_id is not null and v_message.sender_customer_id<>v_customer) then return 'none';end if;
 select * into v_receipt from public.crm_inbound_message_receipts where organization_id=p_org and message_id=p_message for update;
 if found and v_receipt.consent_at is not null then return v_receipt.consent_action;end if;
 insert into public.crm_inbound_message_receipts(organization_id,message_id,channel_id,customer_id)
 values(p_org,p_message,v_message.channel_id,v_customer) on conflict(organization_id,message_id) do nothing;
 select settings into v_settings from public.provider_configs where organization_id=p_org and category='whatsapp' order by priority,id limit 1;
 v_normal:=public.crm_normalize_contact_keyword(v_message.content);
 v_keywords:=v_settings->'optout_keywords';
 if jsonb_typeof(v_keywords) is distinct from 'array' then v_keywords:='[]';end if;
 if jsonb_array_length(v_keywords)=0 then v_keywords:='["STOP","BAJA","CANCELAR","NO MAS","NO MÁS","UNSUBSCRIBE","SALIR","DETENER"]';end if;
 for v_key in select jsonb_array_elements_text(v_keywords) loop
  if v_normal<>'' and public.crm_normalize_contact_keyword(v_key)=v_normal then v_out:=true;exit;end if;
 end loop;
 v_keywords:=v_settings->'optin_keywords';
 if jsonb_typeof(v_keywords) is distinct from 'array' then v_keywords:='[]';end if;
 if jsonb_array_length(v_keywords)=0 then v_keywords:='["START","ALTA","VOLVER","INICIAR"]';end if;
 for v_key in select jsonb_array_elements_text(v_keywords) loop
  if v_normal<>'' and public.crm_normalize_contact_keyword(v_key)=v_normal then v_in:=true;exit;end if;
 end loop;
 if v_out then v_action:='opted_out';elsif v_in then v_action:='opted_in';end if;
 -- Un START de una identidad archivada no autoriza otro teléfono del principal.
 select * into v_receipt from public.crm_inbound_message_receipts where organization_id=p_org and message_id=p_message for update;
 if v_action='opted_in' and v_receipt.provider_external_id is not null and v_receipt.provider_phone_matches is distinct from true then v_action:='none';end if;
 perform public.crm_set_contact_consent(p_org,v_customer,'whatsapp',case when v_action='none' then 'unknown' else v_action end,
  case when v_action='none' then 'inbound_message' else 'inbound_keyword' end,jsonb_build_object('message_id',v_message.id,'text',left(v_message.content,500)));
 update public.messages set metadata=coalesce(metadata,'{}')||jsonb_build_object('crm_consent_action',v_action)
 where organization_id=p_org and id=p_message;
 update public.crm_inbound_message_receipts set consent_action=v_action,consent_at=clock_timestamp() where organization_id=p_org and message_id=p_message;
 return v_action;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crm_message_consent_inbound_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 -- Solo los adaptadores autenticados con service role certifican un mensaje entrante.
 if coalesce(auth.role(),'') not in('anon','authenticated') then
  -- La recepción atómica inserta primero su evidencia privada y luego procesa el consentimiento.
  if current_setting('crm.atomic_inbound_message',true) is distinct from new.id::text then
   perform public.crm_apply_inbound_contact_consent(new.organization_id,new.id);
  end if;
 end if;
 return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crm_merge_customers(p_org integer, p_primary uuid, p_secondaries uuid[], p_choices jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_primary public.customers;
  v_secondary public.customers;
  v_merge uuid;
  v_table text;
  v_ids jsonb;
  v_rows jsonb;
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
  perform public.crm_lock_comm_wallet(p_org);
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
    execute format('with originals as materialized (select id,to_jsonb(t) as before from public.%I t where organization_id=$2 and customer_id=$3 order by id for update), moved as (update public.%I t set customer_id=$1 from originals o where t.id=o.id and t.organization_id=$2 returning t.id,o.before,to_jsonb(t) as after) select coalesce(jsonb_agg(id),''[]''::jsonb),coalesce(jsonb_agg(jsonb_build_object(''id'',id,''before'',before,''after'',after)),''[]''::jsonb) from moved',v_table,v_table)
      into v_ids,v_rows using p_primary,p_org,v_secondary.id;
    v_moves := v_moves || jsonb_build_array(jsonb_build_object('table',v_table,'column','customer_id','ids',v_ids,'rows',v_rows));
  end loop;
  with originals as materialized (select id,to_jsonb(a) as before from public.activities a where organization_id=p_org and related_type='customer' and related_id=v_secondary.id order by id for update),
  moved as (update public.activities a set related_id=p_primary from originals o where a.id=o.id and a.organization_id=p_org returning a.id,o.before,to_jsonb(a) as after)
    select coalesce(jsonb_agg(id),'[]'::jsonb),coalesce(jsonb_agg(jsonb_build_object('id',id,'before',before,'after',after)),'[]'::jsonb) into v_ids,v_rows from moved;
  v_moves := v_moves || jsonb_build_array(jsonb_build_object('table','activities','column','related_id','ids',v_ids,'rows',v_rows));
  with originals as materialized (select cc.id,to_jsonb(cc) as before from public.campaign_contacts cc where cc.customer_id=v_secondary.id
    and exists (select 1 from public.campaigns c where c.id=cc.campaign_id and c.organization_id=p_org) order by cc.id for update),
  moved as (update public.campaign_contacts cc set customer_id=p_primary from originals o where cc.id=o.id returning cc.id,o.before,to_jsonb(cc) as after)
    select coalesce(jsonb_agg(id),'[]'::jsonb),coalesce(jsonb_agg(jsonb_build_object('id',id,'before',before,'after',after)),'[]'::jsonb) into v_ids,v_rows from moved;
  v_moves := v_moves || jsonb_build_array(jsonb_build_object('table','campaign_contacts','column','customer_id','ids',v_ids,'rows',v_rows));
  select jsonb_build_object('primary',to_jsonb(p),'secondary',to_jsonb(s)) into v_after
    from public.customers p, public.customers s where p.id=p_primary and s.id=v_secondary.id;
  insert into public.customer_merges (organization_id,primary_customer_id,secondary_customer_id,snapshot,moved_rows,merged_by)
    values (p_org,p_primary,v_secondary.id,jsonb_build_object('before',v_original,'after',v_after,'fields',to_jsonb(v_fields)),v_moves,auth.uid()) returning id into v_merge;
  return jsonb_build_object('id',v_merge,'primary_customer_id',p_primary,'moved_counts',(select jsonb_agg(jsonb_build_object('table',r->>'table','count',jsonb_array_length(r->'ids'))) from jsonb_array_elements(v_moves) r));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crm_unmerge_customer(p_org integer, p_merge uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  perform public.crm_lock_comm_wallet(p_org);
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
$function$
;

create or replace function public.crm_receive_whatsapp_cloud(p_org integer,p_channel uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_external text:=p_request->>'external_id';v_digits text:=p_request->>'phone_digits';v_raw jsonb:=p_request->'raw';
 v_content text:=p_request->>'content';v_type text:=p_request->>'content_type';v_payload jsonb:=p_request->'payload';
 v_proof jsonb:=p_request->'customer_proof';v_customer public.customers;v_source public.customers;
 v_identity public.customer_channel_identities;v_receipt public.crm_inbound_message_receipts;
 v_conv uuid;v_msg uuid;v_count integer;v_primary uuid;v_matches boolean;v_result jsonb;v_previous text;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>262144
  or v_external is null or length(v_external) not between 1 and 500 or v_digits is null or v_digits !~ '^[1-9][0-9]{7,14}$'
  or jsonb_typeof(v_raw) is distinct from 'object' or v_raw->>'id' is distinct from v_external or v_raw->>'from' is distinct from v_digits
  or v_content is null or length(v_content) not between 1 and 10000 or v_type is null or v_type not in('text','image','file','audio','video','location')
  or jsonb_typeof(v_payload) is distinct from 'object' then raise exception 'entrada_cloud_invalida' using errcode='22023';end if;
 if not exists(select 1 from public.channels where id=p_channel and organization_id=p_org and type='whatsapp') then raise exception 'canal_no_encontrado' using errcode='P0002';end if;
 select * into v_receipt from public.crm_inbound_message_receipts where organization_id=p_org and channel_id=p_channel and provider_external_id=v_external for update;
 if found then
  if v_receipt.provider_phone_digits is distinct from v_digits or v_receipt.provider_raw_message is distinct from v_raw then raise exception 'colision_entrada_cloud' using errcode='P0001';end if;
  if v_receipt.processed_at is null or not exists(select 1 from public.messages where id=v_receipt.message_id and organization_id=p_org and channel_id=p_channel and direction='inbound' and role='customer')
   then raise exception 'recibo_entrante_incompleto' using errcode='P0001';end if;
  -- Una fusión puede mover la conversación; el resultado histórico no vuelve a ejecutar efectos.
  return v_receipt.result||jsonb_build_object('message_id',v_receipt.message_id,'customer_id',v_receipt.customer_id,
   'conversation_id',(select conversation_id from public.messages where id=v_receipt.message_id and organization_id=p_org),'duplicate',true);
 end if;
 select * into v_identity from public.customer_channel_identities where channel_id=p_channel and identity_type='whatsapp_phone' and identity_value=v_digits for update;
 if found and v_identity.organization_id<>p_org then raise exception 'identidad_fuera_de_organizacion' using errcode='42501';end if;
 if v_proof is null or v_proof='null'::jsonb then
  if v_identity.id is not null then raise exception 'identidad_entrante_cambio' using errcode='40001';end if;
  insert into public.customers(organization_id,first_name,phone,metadata)
   values(p_org,left(coalesce(nullif(p_request->>'profile_name',''),v_digits),300),'+'||v_digits,jsonb_build_object('source','whatsapp'))
   returning * into v_customer;
  v_matches:=true;
 else
  if jsonb_typeof(v_proof) is distinct from 'object' then raise exception 'prueba_cliente_invalida' using errcode='22023';end if;
  select * into v_source from public.customers where organization_id=p_org and id=(v_proof->>'id')::uuid for update;
  if not found or v_source.phone is distinct from v_proof->>'phone' or v_source.status is distinct from v_proof->>'status' then raise exception 'cliente_entrante_cambio' using errcode='40001';end if;
  v_primary:=v_source.id;
  if v_source.status='merged' then
   select count(*),(array_agg(primary_customer_id))[1] into v_count,v_primary from public.customer_merges
    where organization_id=p_org and secondary_customer_id=v_source.id and undone_at is null;
   if v_count<>1 then raise exception 'fusion_entrante_invalida' using errcode='P0001';end if;
  end if;
  select * into v_customer from public.customers where organization_id=p_org and id=v_primary for update;
  if not found or v_customer.status='merged' or v_customer.id is distinct from (v_proof->>'resolved_id')::uuid
   or v_customer.phone is distinct from v_proof->>'resolved_phone' or jsonb_typeof(v_proof->'phone_matches') is distinct from 'boolean'
   then raise exception 'cliente_entrante_cambio' using errcode='40001';end if;
  if v_identity.id is not null and v_identity.customer_id not in(v_source.id,v_customer.id) then raise exception 'identidad_entrante_cambio' using errcode='40001';end if;
  v_matches:=(v_proof->>'phone_matches')::boolean;
 end if;
 insert into public.customer_channel_identities(organization_id,customer_id,channel_id,identity_type,identity_value,last_seen_at)
 values(p_org,v_customer.id,p_channel,'whatsapp_phone',v_digits,clock_timestamp())
 on conflict(channel_id,identity_type,identity_value) do update set last_seen_at=excluded.last_seen_at,updated_at=clock_timestamp()
 where customer_channel_identities.organization_id=p_org and customer_channel_identities.customer_id=v_customer.id;
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'identidad_entrante_cambio' using errcode='40001';end if;
 -- Compatibilidad con un mensaje creado por el adaptador anterior durante el despliegue.
 select count(*),(array_agg(id))[1] into v_count,v_msg from public.messages where organization_id=p_org and channel_id=p_channel and direction='inbound' and external_message_id=v_external;
 if v_count>1 then raise exception 'entrada_cloud_ambigua' using errcode='P0001';end if;
 if v_msg is not null then
  select conversation_id into v_conv from public.messages where organization_id=p_org and id=v_msg and sender_customer_id=v_customer.id
   and role='customer' and content_type=v_type and content=v_content and payload->'raw'=v_raw
   and exists(select 1 from public.conversations q where q.id=messages.conversation_id and q.organization_id=p_org and q.channel_id=p_channel and q.customer_id=v_customer.id);
  if v_conv is null then raise exception 'entrada_cloud_sin_contexto' using errcode='P0001';end if;
 else
  select id into v_conv from public.conversations where organization_id=p_org and channel_id=p_channel and customer_id=v_customer.id and status in('open','pending') order by created_at desc,id limit 1 for update;
  if v_conv is null then insert into public.conversations(organization_id,channel_id,customer_id,status,priority)values(p_org,p_channel,v_customer.id,'open','normal')returning id into v_conv;end if;
  v_msg:=gen_random_uuid();v_previous:=current_setting('crm.atomic_inbound_message',true);
  perform set_config('crm.atomic_inbound_message',v_msg::text,true);
  insert into public.messages(id,organization_id,conversation_id,channel_id,direction,role,sender_customer_id,content_type,content,payload,external_message_id,is_read,metadata)
  values(v_msg,p_org,v_conv,p_channel,'inbound','customer',v_customer.id,v_type,v_content,
   v_payload||jsonb_build_object('raw',v_raw,'phone',v_digits,'wa_id',v_digits),v_external,false,
   jsonb_build_object('wa_id',v_digits,'profile_name',p_request->>'profile_name','source','whatsapp_cloud','timestamp',v_raw->>'timestamp'));
  perform set_config('crm.atomic_inbound_message',coalesce(v_previous,''),true);
 end if;
 insert into public.crm_inbound_message_receipts(organization_id,message_id,channel_id,customer_id,provider_external_id,provider_phone_digits,provider_raw_message,provider_customer_phone,provider_phone_matches)
 values(p_org,v_msg,p_channel,v_customer.id,v_external,v_digits,v_raw,v_customer.phone,v_matches)
 on conflict(organization_id,message_id)do update set provider_external_id=excluded.provider_external_id,provider_phone_digits=excluded.provider_phone_digits,
  provider_raw_message=excluded.provider_raw_message,provider_customer_phone=excluded.provider_customer_phone,provider_phone_matches=excluded.provider_phone_matches;
 v_result:=public.crm_process_whatsapp_inbound(p_org,v_msg,p_channel,v_conv,v_customer.id);
 return v_result||jsonb_build_object('message_id',v_msg,'customer_id',v_customer.id,'conversation_id',v_conv,'duplicate',false);
end;$function$;
revoke all on function public.crm_receive_whatsapp_cloud(integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crm_receive_whatsapp_cloud(integer,uuid,jsonb) to service_role;
