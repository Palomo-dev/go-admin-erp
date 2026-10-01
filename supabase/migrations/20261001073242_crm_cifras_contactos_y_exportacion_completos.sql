-- Cifras, filtros y exportación completa desde el mismo contexto propio.
set lock_timeout='2s';
create or replace function public.crm_campaign_contact_state(p_state text,p_metadata jsonb)
returns text language sql immutable set search_path=public,pg_temp as $function$
 select case when p_state='sent' and p_metadata->>'state' in('delivered','read','replied') then p_metadata->>'state'
 else coalesce(p_state,p_metadata->>'state','pending') end;
$function$;
revoke all on function public.crm_campaign_contact_state(text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_campaign_contact_state(text,jsonb) to service_role;

create or replace function public.crm_campaign_timestamp(p_value text)
returns timestamptz language plpgsql immutable strict set search_path=public,pg_temp as $function$
begin
 if p_value!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then return null;end if;
 return p_value::timestamptz;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end;$function$;
revoke all on function public.crm_campaign_timestamp(text) from public,anon,authenticated;
grant execute on function public.crm_campaign_timestamp(text) to service_role;

create or replace function public.crm_campaign_read_context(p_org integer,p_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_campaign public.campaigns;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.opportunities.view']);
 select * into v_campaign from public.campaigns where organization_id=p_org and id=p_campaign;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 if exists(select 1 from public.campaign_contacts cc join public.customers u on u.id=cc.customer_id where cc.campaign_id=p_campaign and u.organization_id<>p_org) then raise exception 'contacto_campana_ajeno' using errcode='P0001';end if;
 return to_jsonb(v_campaign);
end;$function$;
revoke all on function public.crm_campaign_read_context(integer,uuid) from public,anon,authenticated;
grant execute on function public.crm_campaign_read_context(integer,uuid) to service_role;

create or replace function public.crm_campaign_contacts_dataset(p_org integer,p_campaign uuid,p_state text,p_q text)
returns table(id uuid,created_at timestamptz,row_data jsonb)
language sql stable security definer set search_path=public,pg_temp as $function$
 select cc.id,cc.created_at,to_jsonb(cc)||jsonb_build_object('customer',jsonb_build_object('id',u.id,'full_name',u.full_name,'first_name',u.first_name,'email',u.email,'phone',u.phone))
 from public.campaign_contacts cc join public.campaigns ca on ca.id=cc.campaign_id and ca.organization_id=p_org
 join public.customers u on u.id=cc.customer_id and u.organization_id=p_org
 where cc.campaign_id=p_campaign
 and (nullif(p_state,'') is null or public.crm_campaign_contact_state(cc.state,cc.metadata)=p_state)
 and (nullif(btrim(p_q),'') is null or position(lower(btrim(p_q)) in lower(concat_ws(' ',u.full_name,u.phone,u.email)))>0);
$function$;
revoke all on function public.crm_campaign_contacts_dataset(integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.crm_campaign_contacts_dataset(integer,uuid,text,text) to service_role;

create or replace function public.crm_campaign_contacts_page(p_org integer,p_campaign uuid,p_state text default null,p_q text default null,p_page integer default 1,p_size integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_result jsonb;
begin
 perform public.crm_campaign_read_context(p_org,p_campaign);
 if p_page is null or p_page not between 1 and 100000 or p_size is null or p_size not between 1 and 500 or length(coalesce(p_q,''))>200
  or (nullif(p_state,'') is not null and p_state not in('pending','queued','sent','delivered','read','opened','clicked','replied','bounced','failed','skipped')) then raise exception 'filtro_invalido' using errcode='22023';end if;
 with dataset as materialized(select * from public.crm_campaign_contacts_dataset(p_org,p_campaign,p_state,p_q)),
 page as(select * from dataset order by created_at nulls first,id limit p_size offset (p_page::bigint-1)*p_size)
 select jsonb_build_object('data',coalesce((select jsonb_agg(row_data order by created_at nulls first,id) from page),'[]'::jsonb),'total',(select count(*) from dataset)) into v_result;
 return v_result;
end;$function$;
revoke all on function public.crm_campaign_contacts_page(integer,uuid,text,text,integer,integer) from public,anon;
grant execute on function public.crm_campaign_contacts_page(integer,uuid,text,text,integer,integer) to authenticated,service_role;

create or replace function public.crm_campaign_contacts_export(p_org integer,p_campaign uuid,p_state text default null,p_q text default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_result jsonb;
begin
 perform public.crm_campaign_read_context(p_org,p_campaign);
 if length(coalesce(p_q,''))>200 or (nullif(p_state,'') is not null and p_state not in('pending','queued','sent','delivered','read','opened','clicked','replied','bounced','failed','skipped')) then raise exception 'filtro_invalido' using errcode='22023';end if;
 select jsonb_build_object('data',coalesce(jsonb_agg(row_data order by created_at nulls first,id),'[]'::jsonb),'total',count(*))
 into v_result from public.crm_campaign_contacts_dataset(p_org,p_campaign,p_state,p_q);
 return v_result;
end;$function$;
revoke all on function public.crm_campaign_contacts_export(integer,uuid,text,text) from public,anon;
grant execute on function public.crm_campaign_contacts_export(integer,uuid,text,text) to authenticated,service_role;

create or replace function public.crm_campaign_contact_stats(p_org integer,p_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_campaign jsonb;v_counts jsonb;v_errors jsonb;v_skips jsonb;v_timeline jsonb;v_unknown bigint;v_estimated numeric;
begin
 v_campaign:=public.crm_campaign_read_context(p_org,p_campaign);
 v_counts:=public.crm_campaign_contact_counts(p_org,p_campaign);
 select coalesce(jsonb_object_agg(code,total),'{}'::jsonb) into v_errors from(
  select cc.metadata->>'error_code' code,count(*) total from public.campaign_contacts cc where cc.campaign_id=p_campaign
   and public.crm_campaign_contact_state(cc.state,cc.metadata) in('failed','bounced','skipped') and nullif(cc.metadata->>'error_code','') is not null
  group by cc.metadata->>'error_code')x;
 select coalesce(jsonb_object_agg(reason,total),'{}'::jsonb) into v_skips from(
  select cc.metadata->>'skipped_reason' reason,count(*) total from public.campaign_contacts cc where cc.campaign_id=p_campaign
   and public.crm_campaign_contact_state(cc.state,cc.metadata)='skipped' and nullif(cc.metadata->>'skipped_reason','') is not null
  group by cc.metadata->>'skipped_reason')x;
 -- Una marca por contacto/tipo, con el instante convertido antes de agrupar.
 with marks as(
  select 'sent' type,sent_at event_at from public.campaign_contacts where campaign_id=p_campaign and sent_at is not null
  union all select 'delivered',public.crm_campaign_timestamp(metadata->>'delivered_at') from public.campaign_contacts where campaign_id=p_campaign
  union all select 'read',public.crm_campaign_timestamp(metadata->>'read_at') from public.campaign_contacts where campaign_id=p_campaign
  union all select 'failed',public.crm_campaign_timestamp(metadata->>'failed_at') from public.campaign_contacts where campaign_id=p_campaign),
 grouped as(select (date_trunc('minute',event_at at time zone 'UTC') at time zone 'UTC') as "minute",
  count(*)filter(where type='sent') sent,count(*)filter(where type='delivered') delivered,
  count(*)filter(where type='read') read,count(*)filter(where type='failed') failed from marks where event_at is not null group by 1)
 select coalesce(jsonb_agg(to_jsonb(grouped) order by "minute"),'[]'::jsonb) into v_timeline from grouped;
 select count(*) into v_unknown from public.campaign_contacts where campaign_id=p_campaign
  and public.crm_campaign_contact_state(state,metadata) in('delivered','read','replied','opened','clicked')
  and (metadata->>'cost_amount' is null or metadata->>'cost_amount' !~ '^[0-9]+([.][0-9]+)?$');
 if v_campaign#>>'{statistics,estimated_cost}' ~ '^[0-9]+([.][0-9]+)?$' then v_estimated:=(v_campaign#>>'{statistics,estimated_cost}')::numeric;end if;
 return jsonb_build_object('counts',v_counts,'by_error_code',v_errors,'by_skip_reason',v_skips,'timeline',v_timeline,'estimated_cost',v_estimated,
  'actual_cost',case when v_unknown=0 then (v_counts->>'cost')::numeric end,'known_actual_cost',(v_counts->>'cost')::numeric,'actual_cost_complete',v_unknown=0,'unpriced_contacts',v_unknown);
end;$function$;
revoke all on function public.crm_campaign_contact_stats(integer,uuid) from public,anon;
grant execute on function public.crm_campaign_contact_stats(integer,uuid) to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.crm_campaign_contact_counts(p_org integer, p_campaign uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
 perform public.fn_assert_acceso_org(p_org);
 if not exists(select 1 from public.campaigns where organization_id=p_org and id=p_campaign) then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 with contacts as (
  select public.crm_campaign_contact_state(cc.state,cc.metadata) as state,cc.replied_at,cc.metadata
  from public.campaign_contacts cc where cc.campaign_id=p_campaign
 ) select jsonb_build_object('total',count(*),'pending',count(*) filter(where state='pending'),
  'queued',count(*) filter(where state='queued'),'sent',count(*) filter(where state in('sent','delivered','read','replied','opened','clicked')),
  'delivered',count(*) filter(where state in('delivered','read','replied')),'read',count(*) filter(where state in('read','replied')),
  'replied',count(*) filter(where state='replied' or replied_at is not null),'failed',count(*) filter(where state in('failed','bounced')),
  'skipped',count(*) filter(where state='skipped'),
  'cost',round(coalesce(sum(case when metadata->>'cost_amount' ~ '^[0-9]+(\.[0-9]+)?$' then (metadata->>'cost_amount')::numeric else 0 end),0),5)) into v_result from contacts;
 return v_result;
end;$function$
;
