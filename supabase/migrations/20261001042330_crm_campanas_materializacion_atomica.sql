-- Cifras sin topes de lectura y publicación de audiencia con control de versión.
set lock_timeout='2s';
create or replace function public.crm_campaign_contact_counts(p_org integer,p_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_result jsonb;
begin
 perform public.fn_assert_acceso_org(p_org);
 if not exists(select 1 from public.campaigns where organization_id=p_org and id=p_campaign) then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 with contacts as (
  select case when cc.state='sent' and cc.metadata->>'state' in('delivered','read','replied') then cc.metadata->>'state'
    else coalesce(cc.state,cc.metadata->>'state','pending') end as state,cc.replied_at,cc.metadata
  from public.campaign_contacts cc where cc.campaign_id=p_campaign
 ) select jsonb_build_object('total',count(*),'pending',count(*) filter(where state='pending'),
  'queued',count(*) filter(where state='queued'),'sent',count(*) filter(where state in('sent','delivered','read','replied','opened','clicked')),
  'delivered',count(*) filter(where state in('delivered','read','replied')),'read',count(*) filter(where state in('read','replied')),
  'replied',count(*) filter(where state='replied' or replied_at is not null),'failed',count(*) filter(where state in('failed','bounced')),
  'skipped',count(*) filter(where state='skipped'),
  'cost',round(coalesce(sum(case when metadata->>'cost_amount' ~ '^[0-9]+(\.[0-9]+)?$' then (metadata->>'cost_amount')::numeric else 0 end),0),5)) into v_result from contacts;
 return v_result;
end;$function$;
revoke all on function public.crm_campaign_contact_counts(integer,uuid) from public,anon,authenticated;
grant execute on function public.crm_campaign_contact_counts(integer,uuid) to service_role;

create or replace function public.crm_materialize_campaign(
 p_org integer,p_campaign uuid,p_version timestamptz,p_channel uuid,p_rows jsonb,p_estimated numeric,p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
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
end;$function$;
revoke all on function public.crm_materialize_campaign(integer,uuid,timestamptz,uuid,jsonb,numeric,uuid) from public,anon,authenticated;
grant execute on function public.crm_materialize_campaign(integer,uuid,timestamptz,uuid,jsonb,numeric,uuid) to service_role;
