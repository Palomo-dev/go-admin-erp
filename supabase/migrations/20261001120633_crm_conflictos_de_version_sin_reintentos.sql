set lock_timeout='2s';
-- CRM: conflictos de negocio sin reintentos infinitos en PostgREST 14.
-- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
-- Mantiene versiones, transacciones, permisos, mensajes y firmas; cambia solo el SQLSTATE explícito.
CREATE OR REPLACE FUNCTION public.crm_campaign_archive(p_org integer, p_campaign uuid, p_version timestamp with time zone, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_row public.campaigns;v_status text;v_archived timestamptz:=clock_timestamp();
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_actor is null or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active) then
  raise exception 'actor_ajeno' using errcode='42501';end if;
 select * into v_row from public.campaigns where organization_id=p_org and id=p_campaign for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 if nullif(v_row.statistics->>'archived_at','') is not null then return to_jsonb(v_row);end if;
 if p_version is null or v_row.updated_at is distinct from p_version then raise exception 'campana_modificada' using errcode='P0001';end if;
 perform public.crm_campaign_read_context(p_org,p_campaign);
 v_status:=coalesce(nullif(v_row.statistics->>'state',''),v_row.status,'draft');
 if v_status not in('draft','scheduled','paused','sent','canceled') then raise exception 'campana_no_archivable' using errcode='P0001';end if;
 if v_status in('draft','scheduled','paused') then
  perform public.crm_campaign_transition(p_org,p_campaign,'cancel',p_version,p_actor,'{}');
 end if;
 if exists(select 1 from public.crm_whatsapp_credit_reservations where organization_id=p_org and campaign_id=p_campaign and state='reserved') then
  raise exception 'campana_requiere_conciliacion' using errcode='P0001';end if;
 update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('archived_at',v_archived,'archived_by',p_actor)
  where organization_id=p_org and id=p_campaign returning * into v_row;
 return to_jsonb(v_row);
end;$function$;

CREATE OR REPLACE FUNCTION public.crm_campaign_save(p_org integer, p_campaign uuid, p_version timestamp with time zone, p_actor uuid, p_values jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_previous public.campaigns;v_row public.campaigns;v_stats jsonb;v_audience jsonb;v_source text;v_kind text;
 v_ids uuid[];v_refs uuid[];v_pipeline uuid;v_channel uuid;v_status text;v_n integer;v_key text;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_actor is null or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active) then
  raise exception 'actor_ajeno' using errcode='42501';end if;
 if jsonb_typeof(p_values) is distinct from 'object' or octet_length(p_values::text)>2000000 or exists(
  select 1 from jsonb_object_keys(p_values) k where k not in('name','channel','scheduled_at','template_id','segment_id','content','statistics')
 ) then raise exception 'datos_campana_invalidos' using errcode='22023';end if;
 if p_campaign is not null then
  select * into v_previous from public.campaigns where organization_id=p_org and id=p_campaign
   and nullif(statistics->>'archived_at','') is null for update;
  if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
  if p_version is null or v_previous.updated_at is distinct from p_version then raise exception 'campana_modificada' using errcode='P0001';end if;
  perform public.crm_campaign_read_context(p_org,p_campaign);
  v_status:=coalesce(nullif(v_previous.statistics->>'state',''),v_previous.status,'draft');
  if v_status not in('draft','scheduled') then raise exception 'campana_no_editable' using errcode='P0001';end if;
  v_row:=jsonb_populate_record(v_previous,p_values);
 else
  if p_version is not null then raise exception 'version_campana_invalida' using errcode='22023';end if;
  v_row:=jsonb_populate_record(null::public.campaigns,p_values);
 end if;
 v_stats:=coalesce(v_row.statistics,'{}');
 if jsonb_typeof(v_stats) is distinct from 'object' or nullif(btrim(v_row.name),'') is null or length(v_row.name)>200
  or v_row.channel is null or v_row.channel not in('whatsapp','email') or length(coalesce(v_row.content,''))>4096
  or (p_campaign is null and v_row.template_id is null and nullif(btrim(v_row.content),'') is null)
  or nullif(v_stats->>'archived_at','') is not null then raise exception 'datos_campana_invalidos' using errcode='22023';end if;
 if (p_campaign is null and nullif(v_stats->>'state','') is not null) or (p_campaign is not null and (v_stats->'state') is distinct from (v_previous.statistics->'state')) then raise exception 'estado_campana_no_editable' using errcode='22023';end if;
 if v_status='scheduled' and (
  v_row.channel is distinct from v_previous.channel or v_row.scheduled_at is distinct from v_previous.scheduled_at
  or v_row.template_id is distinct from v_previous.template_id or v_row.segment_id is distinct from v_previous.segment_id
  or v_row.content is distinct from v_previous.content
  or (v_stats-'description') is distinct from (coalesce(v_previous.statistics,'{}')-'description')
 ) then raise exception 'campana_programada_no_editable' using errcode='P0001';end if;
 if p_campaign is not null and exists(select 1 from public.crm_whatsapp_credit_reservations where organization_id=p_org and campaign_id=p_campaign and state='reserved') then
  raise exception 'reserva_anterior_requiere_conciliacion' using errcode='P0001';end if;
 if v_row.template_id is not null then
  perform id from public.templates where organization_id=p_org and id=v_row.template_id and channel=v_row.channel for share;
  if not found then raise exception 'plantilla_no_encontrada' using errcode='P0002';end if;
 end if;
 v_channel:=nullif(v_stats->>'channel_id','')::uuid;
 if v_channel is not null then
  perform id from public.channels where organization_id=p_org and id=v_channel and type=v_row.channel for share;
  if not found then raise exception 'canal_no_encontrado' using errcode='P0002';end if;
 end if;
 v_audience:=v_stats->'audience';v_source:=v_audience->>'source';
 if v_audience is not null and v_audience<>'null'::jsonb then
  if jsonb_typeof(v_audience) is distinct from 'object' or v_source is null or v_source not in('manual','stage','segment') then
   raise exception 'audiencia_invalida' using errcode='22023';end if;
  foreach v_key in array array['stage_ids','opportunity_ids','customer_ids'] loop
   if jsonb_typeof(coalesce(nullif(v_audience->v_key,'null'::jsonb),'[]'::jsonb)) is distinct from 'array' then
    raise exception 'audiencia_invalida' using errcode='22023';end if;
   if jsonb_array_length(coalesce(nullif(v_audience->v_key,'null'::jsonb),'[]'::jsonb))> (case when v_key='stage_ids' then 200 else 20000 end) then
    raise exception 'audiencia_invalida' using errcode='22023';end if;
  end loop;
  v_pipeline:=nullif(v_audience->>'pipeline_id','')::uuid;
  if v_pipeline is not null then
   perform id from public.pipelines where organization_id=p_org and id=v_pipeline for share;
   if not found then raise exception 'embudo_no_encontrado' using errcode='P0002';end if;
  end if;
  if v_source='segment' then
   v_ids:=array[nullif(v_audience->>'segment_id','')::uuid];
   if v_ids[1] is null or v_row.segment_id is distinct from v_ids[1] then raise exception 'audiencia_invalida' using errcode='22023';end if;
   perform id from public.segments where organization_id=p_org and id=v_ids[1] for share;
   if not found then raise exception 'segmento_no_encontrado' using errcode='P0002';end if;
  else
   if v_row.segment_id is not null then raise exception 'audiencia_invalida' using errcode='22023';end if;
   if v_source='stage' then
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into v_ids from jsonb_array_elements_text(coalesce(nullif(v_audience->'stage_ids','null'::jsonb),'[]'::jsonb));
    if cardinality(v_ids)=0 then raise exception 'audiencia_invalida' using errcode='22023';end if;
    perform p.id from public.pipelines p where p.organization_id=p_org and p.id in(select s.pipeline_id from public.stages s where s.id=any(v_ids)) order by p.id for share;
    perform s.id from public.stages s join public.pipelines p on p.id=s.pipeline_id and p.organization_id=p_org
     where s.id=any(v_ids) and (v_pipeline is null or s.pipeline_id=v_pipeline) order by s.id for share of s;
    get diagnostics v_n=row_count;
    if v_n<>cardinality(v_ids) then raise exception 'etapa_no_encontrada' using errcode='P0002';end if;
   else
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into v_ids from jsonb_array_elements_text(coalesce(nullif(v_audience->'customer_ids','null'::jsonb),'[]'::jsonb));
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into v_refs from jsonb_array_elements_text(coalesce(nullif(v_audience->'opportunity_ids','null'::jsonb),'[]'::jsonb));
    if cardinality(v_ids)+cardinality(v_refs)=0 then raise exception 'audiencia_invalida' using errcode='22023';end if;
    perform id from public.customers where organization_id=p_org and id=any(v_ids) order by id for share;
    get diagnostics v_n=row_count;
    if v_n<>cardinality(v_ids) then raise exception 'cliente_no_encontrado' using errcode='P0002';end if;
    perform id from public.opportunities where organization_id=p_org and id=any(v_refs) order by id for share;
    get diagnostics v_n=row_count;
    if v_n<>cardinality(v_refs) then raise exception 'oportunidad_no_encontrada' using errcode='P0002';end if;
    -- El cliente del negocio también es propio; una referencia antigua corrupta no llega al cálculo.
    if exists(select 1 from public.opportunities o where o.id=any(v_refs) and o.organization_id=p_org and o.customer_id is not null
      and not exists(select 1 from public.customers u where u.organization_id=p_org and u.id=o.customer_id)) then
     raise exception 'cliente_no_encontrado' using errcode='P0002';end if;
    perform u.id from public.customers u where u.organization_id=p_org and u.id in(select o.customer_id from public.opportunities o where o.organization_id=p_org and o.id=any(v_refs)) order by u.id for share;
   end if;
  end if;
  v_audience:=jsonb_build_object('source',v_source,'segment_id',case when v_source='segment' then v_row.segment_id end,
   'pipeline_id',case when v_source='stage' then v_pipeline end,
   'stage_ids',case when v_source='stage' then coalesce(nullif(v_audience->'stage_ids','null'::jsonb),'[]'::jsonb) else '[]'::jsonb end,
   'customer_ids',case when v_source='manual' then coalesce(nullif(v_audience->'customer_ids','null'::jsonb),'[]'::jsonb) else '[]'::jsonb end,
   'opportunity_ids',case when v_source='manual' then coalesce(nullif(v_audience->'opportunity_ids','null'::jsonb),'[]'::jsonb) else '[]'::jsonb end);
  v_stats:=jsonb_set(v_stats,'{audience}',v_audience,true);
 elsif p_campaign is null then raise exception 'audiencia_invalida' using errcode='22023';
 end if;
 -- La franja legal nunca se desactiva al guardar un borrador.
 v_stats:=v_stats||jsonb_build_object('respect_allowed_hours',true,'last_saved_by',p_actor,'last_saved_at',clock_timestamp());
 if p_campaign is null then
  insert into public.campaigns(organization_id,name,channel,status,scheduled_at,template_id,segment_id,content,statistics,created_by)
  values(p_org,btrim(v_row.name),v_row.channel,'draft',v_row.scheduled_at,v_row.template_id,v_row.segment_id,v_row.content,v_stats,p_actor) returning * into v_row;
 else
  update public.campaigns set name=btrim(v_row.name),channel=v_row.channel,scheduled_at=v_row.scheduled_at,template_id=v_row.template_id,
   segment_id=v_row.segment_id,content=v_row.content,statistics=v_stats where organization_id=p_org and id=p_campaign returning * into v_row;
 end if;
 return to_jsonb(v_row);
end;$function$;

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
  if v_primary.status='merged' or v_secondary.status='merged' then raise exception using errcode='P0001', message='registro_cambio'; end if;
  if v_primary.customer_type <> v_secondary.customer_type then raise exception using errcode='22023', message='tipo_cliente_distinto'; end if;
  -- No se encadenan fusiones mientras su restauración sigue pendiente.
  if exists (select 1 from public.customer_merges where organization_id=p_org and undone_at is null
    and (primary_customer_id=any(array[p_primary,v_secondary.id]) or secondary_customer_id=any(array[p_primary,v_secondary.id]))) then
    raise exception using errcode='P0001', message='fusion_pendiente';
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
$function$;

CREATE OR REPLACE FUNCTION public.crm_receive_whatsapp_cloud(p_org integer, p_channel uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  if v_identity.id is not null then raise exception 'identidad_entrante_cambio' using errcode='P0001';end if;
  insert into public.customers(organization_id,first_name,phone,metadata)
   values(p_org,left(coalesce(nullif(p_request->>'profile_name',''),v_digits),300),'+'||v_digits,jsonb_build_object('source','whatsapp'))
   returning * into v_customer;
  v_matches:=true;
 else
  if jsonb_typeof(v_proof) is distinct from 'object' then raise exception 'prueba_cliente_invalida' using errcode='22023';end if;
  select * into v_source from public.customers where organization_id=p_org and id=(v_proof->>'id')::uuid for update;
  if not found or v_source.phone is distinct from v_proof->>'phone' or v_source.status is distinct from v_proof->>'status' then raise exception 'cliente_entrante_cambio' using errcode='P0001';end if;
  v_primary:=v_source.id;
  if v_source.status='merged' then
   select count(*),(array_agg(primary_customer_id))[1] into v_count,v_primary from public.customer_merges
    where organization_id=p_org and secondary_customer_id=v_source.id and undone_at is null;
   if v_count<>1 then raise exception 'fusion_entrante_invalida' using errcode='P0001';end if;
  end if;
  select * into v_customer from public.customers where organization_id=p_org and id=v_primary for update;
  if not found or v_customer.status='merged' or v_customer.id is distinct from (v_proof->>'resolved_id')::uuid
   or v_customer.phone is distinct from v_proof->>'resolved_phone' or jsonb_typeof(v_proof->'phone_matches') is distinct from 'boolean'
   then raise exception 'cliente_entrante_cambio' using errcode='P0001';end if;
  if v_identity.id is not null and v_identity.customer_id not in(v_source.id,v_customer.id) then raise exception 'identidad_entrante_cambio' using errcode='P0001';end if;
  v_matches:=(v_proof->>'phone_matches')::boolean;
 end if;
 insert into public.customer_channel_identities(organization_id,customer_id,channel_id,identity_type,identity_value,last_seen_at)
 values(p_org,v_customer.id,p_channel,'whatsapp_phone',v_digits,clock_timestamp())
 on conflict(channel_id,identity_type,identity_value) do update set last_seen_at=excluded.last_seen_at,updated_at=clock_timestamp()
 where customer_channel_identities.organization_id=p_org and customer_channel_identities.customer_id=v_customer.id;
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'identidad_entrante_cambio' using errcode='P0001';end if;
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

CREATE OR REPLACE FUNCTION public.crm_record_forecast_adjustment(p_org integer, p_user uuid, p_period text, p_actor uuid, p_before numeric, p_after numeric, p_currency text, p_reason text, p_detail text, p_snapshot text, p_reverses uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_snapshot jsonb; v_row public.forecast_adjustments; v_previous public.forecast_adjustments; v_member public.organization_members;
begin
 if coalesce(auth.role(),'') in('anon','authenticated') or auth.uid() is not null then raise exception 'solo_servidor' using errcode='42501';end if;
 select * into v_member from public.organization_members where organization_id=p_org and user_id=p_actor and is_active;
 if not found or not coalesce((coalesce(v_member.is_super_admin,false) or v_member.role_id in(1,2) or public.check_user_permission(p_actor,p_org,'crm.forecast.adjust')),false) then raise exception 'sin_permiso' using errcode='42501';end if;
 if p_user is null then raise exception 'vendedor_invalido' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_user::text||':'||p_period,0));
 v_snapshot:=public.crm_forecast_snapshot(p_org,p_period,p_user,null);
 if v_snapshot->>'snapshotToken' is distinct from p_snapshot then raise exception 'registro_modificado' using errcode='P0001';end if;
 if p_currency is distinct from v_snapshot->>'base' then raise exception 'moneda_invalida' using errcode='22023';end if;
 if p_reverses is not null then
  select * into v_previous from public.forecast_adjustments where organization_id=p_org and user_id=p_user and period=p_period order by created_at desc,id desc limit 1;
  if v_previous.id is distinct from p_reverses or p_reason<>'reversal' then raise exception 'ajuste_no_vigente' using errcode='P0001';end if;
 end if;
 insert into public.forecast_adjustments(organization_id,period,user_id,amount_before,amount_after,currency,reason_code,reason_text,adjusted_by,snapshot_token,reverses_id)
 values(p_org,p_period,p_user,p_before,p_after,p_currency,p_reason,p_detail,p_actor,p_snapshot,p_reverses) returning * into v_row;
 return to_jsonb(v_row);
end; $function$;

CREATE OR REPLACE FUNCTION public.crm_set_forecast_category(p_org integer, p_id uuid, p_category text, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_row public.opportunities;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.opportunities.edit','crm.opportunities.edit_any']);
 if p_category is null or p_category not in('commit','best_case','pipeline','omitted') then raise exception 'categoria_invalida' using errcode='22023';end if;
 select * into v_row from public.opportunities where id=p_id and organization_id=p_org for update;
 if not found then raise exception 'oportunidad_no_encontrada' using errcode='P0002';end if;
 if auth.uid() is not null and v_row.salesperson_id is distinct from auth.uid() and not public.fn_crm_tiene_permiso(p_org,'crm.opportunities.edit_any') then raise exception 'sin_permiso' using errcode='42501';end if;
 if v_row.status<>'open' or v_row.record_type<>'deal' then raise exception 'oportunidad_cerrada' using errcode='P0001';end if;
 if p_expected_updated_at is distinct from v_row.updated_at then raise exception 'registro_modificado' using errcode='P0001';end if;
 if v_row.forecast_category is not distinct from p_category then return to_jsonb(v_row);end if;
 update public.opportunities set forecast_category=p_category where id=p_id and organization_id=p_org returning * into v_row;
 return to_jsonb(v_row);
end; $function$;

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
      raise exception using errcode='P0001',message='registro_cambio';
    end if;
  end loop;
  if v_primary.id is null or v_secondary.id is null or v_secondary.status<>'merged'
    or v_secondary.metadata is distinct from v_merge.snapshot->'after'->'secondary'->'metadata' then
    raise exception using errcode='P0001',message='registro_cambio';
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
    if v_count<>v_expected then raise exception using errcode='P0001',message='fila_movida_cambio'; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.crm_update_opportunity(p_org integer, p_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_opp public.opportunities%rowtype;
  v_edit_any boolean;
  v_nuevo_resp uuid;
  v_nuevo_cliente uuid;
begin
  perform public.fn_crm_exigir_permiso(p_org, array['crm.opportunities.edit', 'crm.opportunities.edit_any']);

  select * into v_opp from opportunities where id = p_id and organization_id = p_org for update;
  if not found then
    raise exception 'oportunidad_no_encontrada' using errcode = 'P0002';
  end if;

  v_edit_any := public.fn_crm_tiene_permiso(p_org, 'crm.opportunities.edit_any');
  if v_uid is not null and not v_edit_any
     and v_opp.salesperson_id is distinct from v_uid and v_opp.created_by is distinct from v_uid then
    raise exception 'no_es_propia' using errcode = '42501';
  end if;
  if p_expected_updated_at is not null and v_opp.updated_at is distinct from p_expected_updated_at then
    raise exception 'conflicto' using errcode='P0001';
  end if;
  if v_data ?| array['stage_id', 'status', 'pipeline_id', 'record_type', 'win_data', 'closed_at',
                     'loss_reason', 'loss_reason_value', 'organization_id', 'created_by'] then
    raise exception 'campo_no_editable' using errcode = '22023';
  end if;
  perform public.fn_crm_opp_validar_campos(p_org, v_data);

  if v_data ? 'salesperson_id' then
    v_nuevo_resp := public.fn_crm_uuid_o_null(v_data ->> 'salesperson_id');
    if v_uid is not null and not v_edit_any
       and v_nuevo_resp is distinct from v_opp.salesperson_id and v_nuevo_resp is distinct from v_uid then
      raise exception 'reasignar_requiere_permiso' using errcode = '42501';
    end if;
  end if;
  v_nuevo_cliente := case when v_data ? 'customer_id' then public.fn_crm_uuid_o_null(v_data ->> 'customer_id') else v_opp.customer_id end;

  update opportunities o set
    name = case when v_data ? 'name' then btrim(v_data ->> 'name') else o.name end,
    customer_id = v_nuevo_cliente,
    amount = case when v_data ? 'amount' then coalesce(nullif(v_data ->> 'amount', '')::numeric, 0) else o.amount end,
    currency = case when v_data ? 'currency' and nullif(v_data ->> 'currency', '') is not null then upper(btrim(v_data ->> 'currency')) else o.currency end,
    expected_close_date = case when v_data ? 'expected_close_date' then nullif(v_data ->> 'expected_close_date', '')::date else o.expected_close_date end,
    source = case when v_data ? 'source' then nullif(btrim(v_data ->> 'source'), '') else o.source end,
    deal_type = case when v_data ? 'deal_type' then nullif(btrim(v_data ->> 'deal_type'), '') else o.deal_type end,
    salesperson_id = case when v_data ? 'salesperson_id' then v_nuevo_resp else o.salesperson_id end,
    temperature = case when v_data ? 'temperature' then nullif(v_data ->> 'temperature', '') else o.temperature end,
    next_contact_at = case when v_data ? 'next_contact_at' then nullif(v_data ->> 'next_contact_at', '')::timestamptz else o.next_contact_at end,
    next_action = case when v_data ? 'next_action' then nullif(btrim(v_data ->> 'next_action'), '') else o.next_action end,
    commission_type = case when v_data ? 'commission_type' then coalesce(nullif(v_data ->> 'commission_type', ''), 'none') else o.commission_type end,
    commission_rate = case when v_data ? 'commission_rate' then coalesce(nullif(v_data ->> 'commission_rate', '')::numeric, 0) else o.commission_rate end,
    branch_id = case when v_data ? 'branch_id' then nullif(v_data ->> 'branch_id', '')::bigint else o.branch_id end,
    vertical_id = case when v_data ? 'vertical_id' then public.fn_crm_uuid_o_null(v_data ->> 'vertical_id') else o.vertical_id end,
    sales_team_id = case when v_data ? 'sales_team_id' then public.fn_crm_uuid_o_null(v_data ->> 'sales_team_id') else o.sales_team_id end,
    territory_id = case when v_data ? 'territory_id' then public.fn_crm_uuid_o_null(v_data ->> 'territory_id') else o.territory_id end,
    billing_cycle_months = case when v_data ? 'billing_cycle_months' then nullif(v_data ->> 'billing_cycle_months', '')::integer else o.billing_cycle_months end,
    discovery_data = case when jsonb_typeof(v_data -> 'discovery_data') = 'object' then coalesce(o.discovery_data, '{}'::jsonb) || (v_data -> 'discovery_data') else o.discovery_data end,
    metadata = case when jsonb_typeof(v_data -> 'metadata') = 'object' then coalesce(o.metadata, '{}'::jsonb) || (v_data -> 'metadata') else o.metadata end,
    updated_at = now()
  where o.id = p_id and o.organization_id = p_org;

  perform public.fn_crm_opp_lineas_aplicar(p_org, p_id, v_data);

  if v_nuevo_cliente is distinct from v_opp.customer_id then
    insert into activities (organization_id, activity_type, user_id, notes, related_type, related_id, occurred_at, metadata)
    values (p_org, 'system', v_uid,
            case when v_nuevo_cliente is null then 'Cliente desvinculado' else 'Cliente vinculado' end,
            'opportunity', p_id, now(),
            jsonb_build_object('source', 'crm_update_opportunity', 'customer_id', v_nuevo_cliente, 'previous_customer_id', v_opp.customer_id));
  end if;

  select * into v_opp from opportunities where id = p_id;
  return to_jsonb(v_opp);
end;
$function$;
