-- Restaura los resultados anteriores. No revierte audiencias, constancias ni saldos.
-- La nueva comprobación RNE queda revocada: los handlers nuevos requieren la migración.
set lock_timeout='2s';
CREATE OR REPLACE FUNCTION public.crm_materialize_campaign(p_org integer, p_campaign uuid, p_version timestamp with time zone, p_channel uuid, p_rows jsonb, p_estimated numeric, p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_campaign public.campaigns;v_template public.templates;v_purpose text;v_rows integer;v_counts jsonb;v_exclusions jsonb;v_now timestamptz:=clock_timestamp();
begin
 perform public.fn_assert_acceso_org(p_org);
 if p_version is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'audiencia_invalida' using errcode='22023';end if;
 v_rows:=jsonb_array_length(p_rows);
 if v_rows>5000 or octet_length(p_rows::text)>5000000 or (p_estimated is not null and (p_estimated<0 or p_estimated::text in('NaN','Infinity','-Infinity'))) then
  raise exception 'audiencia_invalida' using errcode='22023';end if;
 select * into v_campaign from public.campaigns where organization_id=p_org and id=p_campaign for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 if v_campaign.updated_at is distinct from p_version then raise exception 'version_desactualizada' using errcode='P0001';end if;
 if v_campaign.status is distinct from 'draft' or nullif(v_campaign.statistics->>'state','') is not null
  or coalesce((v_campaign.statistics->>'credits_reserved')::integer,0)>0 then raise exception 'campana_no_editable' using errcode='P0001';end if;
 if v_campaign.channel not in('whatsapp','email') or v_campaign.channel is null then raise exception 'canal_invalido' using errcode='22023';end if;
 if v_campaign.channel='whatsapp' and not exists(select 1 from public.channels where organization_id=p_org and id=p_channel and type='whatsapp' and status='active') then
  raise exception 'canal_no_disponible' using errcode='P0001';end if;
 v_purpose:=coalesce(v_campaign.statistics->>'purpose','utility');
 if v_purpose not in('marketing','utility') then raise exception 'proposito_invalido' using errcode='22023';end if;
 if v_campaign.template_id is not null then
  select * into v_template from public.templates where organization_id=p_org and id=v_campaign.template_id and channel=v_campaign.channel and is_active;
  if not found then raise exception 'plantilla_no_encontrada' using errcode='P0002';end if;
  if v_campaign.channel='whatsapp' then
   if v_template.metadata->>'status' is distinct from 'APPROVED' then raise exception 'plantilla_no_aprobada' using errcode='P0001';end if;
   if lower(v_template.metadata->>'category')='marketing' then v_purpose:='marketing';end if;
  end if;
 end if;
 -- No se permite una publicación parcial: IDs duplicados, ajenos o relaciones incoherentes abortan todo.
 if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r) is distinct from 'object'
  or r->>'customer_id' is null or coalesce(r->>'state','') not in('pending','skipped')
  or jsonb_typeof(r->'metadata') is distinct from 'object') then raise exception 'contacto_invalido' using errcode='22023';end if;
 if (select count(distinct (r->>'customer_id')::uuid) from jsonb_array_elements(p_rows) r)<>v_rows then raise exception 'contacto_duplicado' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r left join public.customers c on c.id=(r->>'customer_id')::uuid and c.organization_id=p_org
  where c.id is null or c.status='merged') then raise exception 'cliente_no_encontrado' using errcode='P0002';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where nullif(r#>>'{metadata,opportunity_id}','') is not null
  and not exists(select 1 from public.opportunities o where o.organization_id=p_org and o.id=(r#>>'{metadata,opportunity_id}')::uuid and o.customer_id=(r->>'customer_id')::uuid)) then
  raise exception 'oportunidad_no_encontrada' using errcode='P0002';end if;
 delete from public.campaign_contacts where campaign_id=p_campaign and sent_at is null
  and coalesce(state,metadata->>'state','pending') in('pending','queued','skipped');
 with authorized as materialized (
  select r,public.fn_can_contact(p_org,(r->>'customer_id')::uuid,v_campaign.channel,v_purpose) as allowed
  from jsonb_array_elements(p_rows) r
 )
 insert into public.campaign_contacts(campaign_id,customer_id,state,metadata)
 select p_campaign,(r->>'customer_id')::uuid,
  case when not allowed then 'skipped' else r->>'state' end,
  ((r->'metadata')-'state'-'message_id'-'claim_token')||jsonb_build_object('organization_id',p_org,'attempts',0,'batch_no',null,'state',
   case when not allowed then 'skipped' else r->>'state' end,
   'skipped_reason',case when not allowed then 'opted_out' else r#>>'{metadata,skipped_reason}' end)
 from authorized on conflict(campaign_id,customer_id) do nothing;
 v_counts:=public.crm_campaign_contact_counts(p_org,p_campaign);
 select coalesce(jsonb_object_agg(reason,n),'{}') into v_exclusions from (
  select coalesce(metadata->>'skipped_reason','unspecified') as reason,count(*) as n from public.campaign_contacts
  where campaign_id=p_campaign and coalesce(state,metadata->>'state','pending')='skipped' group by 1
 ) e;
 update public.campaigns set statistics=coalesce(statistics,'{}')||jsonb_build_object('state',null,'channel_id',p_channel,
  'purpose',v_purpose,'counts',v_counts,'total_contacts',v_counts->'total','pending',v_counts->'pending','skipped',v_counts->'skipped',
  'exclusions',v_exclusions,'estimated_cost',p_estimated,'materialized_at',v_now)
 where organization_id=p_org and id=p_campaign;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
 values(p_org,'campaign.materialized','campaign',p_campaign,jsonb_build_object('counts',v_counts,'version_before',p_version,'applied_by',coalesce(auth.uid(),p_actor)),'processed',v_now);
 return jsonb_build_object('total',v_counts->'total','pending',v_counts->'pending','skipped',v_counts->'skipped','skipped_by_reason',v_exclusions,'estimated_cost',p_estimated);
end;$function$
;
CREATE OR REPLACE FUNCTION public.crm_register_campaign_rne(p_org integer, p_campaign uuid, p_numbers text[], p_excluded jsonb, p_file text, p_sha256 text, p_actor uuid, p_days integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid:=gen_random_uuid();v_now timestamptz:=clock_timestamp();v_count integer;v_targets integer;v_excluded integer;v_skipped integer:=0;v_result jsonb;
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_days is null or p_days not between 1 and 30 or p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$'
  or jsonb_typeof(p_excluded)is distinct from 'array'or cardinality(p_numbers)>500000 then raise exception 'verificacion_rne_invalida'using errcode='22023';end if;
 if p_actor is not null and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active)then raise exception 'actor_ajeno'using errcode='42501';end if;
 perform 1 from public.campaigns where organization_id=p_org and id=p_campaign and nullif(statistics->>'archived_at','') is null for update;
 if not found then raise exception 'campana_no_encontrada'using errcode='P0002';end if;
 select count(*)into v_count from public.crm_rne_valid_numbers(p_numbers);
 if v_count=0 then raise exception 'rne_sin_numeros_validos'using errcode='22023';end if;
 if exists(select 1 from public.campaign_contacts cc join public.customers u on u.id=cc.customer_id where cc.campaign_id=p_campaign and u.organization_id<>p_org)then raise exception 'contacto_campana_ajeno'using errcode='P0001';end if;
 if exists(
  with numbers as materialized(select phone_e164 from public.crm_rne_valid_numbers(p_numbers)),
  proof as materialized(select * from jsonb_to_recordset(p_excluded)as x(customer_id uuid,phone text,phone_e164 text))
  select 1 from proof p left join public.customers u on u.organization_id=p_org and u.id=p.customer_id
   left join public.campaign_contacts cc on cc.customer_id=p.customer_id and cc.campaign_id=p_campaign
   left join numbers n on n.phone_e164=p.phone_e164
  where u.id is null or cc.id is null or u.phone is distinct from p.phone or n.phone_e164 is null
 )then raise exception 'audiencia_rne_modificada'using errcode='P0001';end if;
 select count(*)into v_targets from public.campaign_contacts where campaign_id=p_campaign;
 select count(distinct customer_id)into v_excluded from jsonb_to_recordset(p_excluded)as x(customer_id uuid);
 insert into public.campaign_rne_checks(id,organization_id,campaign_id,checked_at,valid_until,file_name,file_sha256,numbers_in_file,checked_targets,excluded_targets,checked_by)
 values(v_id,p_org,p_campaign,v_now,v_now+make_interval(days=>p_days),left(p_file,255),p_sha256,v_count,v_targets,v_excluded,p_actor);
 perform public.crm_import_rne_numbers(p_org,p_numbers,v_id,p_actor);
 v_result:=public.crm_skip_campaign_contacts_subset(p_org,p_campaign,'rne',array(select distinct customer_id from jsonb_to_recordset(p_excluded)as x(customer_id uuid)),p_actor);
 v_skipped:=coalesce((v_result->>'skipped')::integer,0);
 update public.campaign_rne_checks set skipped_contacts=v_skipped where id=v_id;
 return jsonb_build_object('id',v_id,'check_id',v_id,'checked_at',v_now,'valid_until',v_now+make_interval(days=>p_days),
  'numbers_in_file',v_count,'checked_targets',v_targets,'excluded_targets',v_excluded,'skipped_contacts',v_skipped);
end;$function$
;
revoke all on function public.crm_materialize_campaign(integer,uuid,timestamptz,uuid,jsonb,numeric,uuid)from public,anon,authenticated;
grant execute on function public.crm_materialize_campaign(integer,uuid,timestamptz,uuid,jsonb,numeric,uuid)to service_role;
revoke all on function public.crm_register_campaign_rne(integer,uuid,text[],jsonb,text,text,uuid,integer)from public,anon,authenticated;
grant execute on function public.crm_register_campaign_rne(integer,uuid,text[],jsonb,text,text,uuid,integer)to service_role;
revoke all on function public.crm_register_campaign_rne_versioned(integer,uuid,timestamptz,text[],jsonb,text,text,uuid,integer)from public,anon,authenticated,service_role;
