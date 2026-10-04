-- Llamadas: alcance por vendedor, búsqueda de texto y cifras antes de paginar.
insert into public.permissions(code,module,name,description,category)
select 'crm.calls.view_all','crm','Ver llamadas del equipo','Consultar llamadas de otros vendedores de la organización','crm'
where not exists(select 1 from public.permissions where code='crm.calls.view_all');
create index if not exists call_transcripts_full_text_idx on public.call_transcripts using gin(to_tsvector('simple'::regconfig,coalesce(full_text,'')));
create index if not exists calls_org_user_started_idx on public.calls(organization_id,user_id,started_at desc);

create or replace function public.crm_calls_list(p_org integer,p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_all boolean; v_user uuid; v_q text:=nullif(trim(p_filters->>'q'),''); v_result jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  v_all:=auth.uid() is null or public.fn_crm_tiene_permiso(p_org,'crm.calls.view_all');
  v_user:=nullif(p_filters->>'user_id','')::uuid;
  if not v_all then
    if v_user is not null and v_user<>auth.uid() then raise exception using errcode='42501',message='sin_permiso'; end if;
    v_user:=auth.uid();
  end if;
  with filtered as materialized (
    select c.* from public.calls c where c.organization_id=p_org
      and (v_user is null or c.user_id=v_user)
      and (not(p_filters?'status') or c.status=p_filters->>'status')
      and (not(p_filters?'direction') or c.direction=p_filters->>'direction')
      and (not(p_filters?'mode') or c.mode=p_filters->>'mode')
      and (not(p_filters?'customer_id') or c.customer_id=(p_filters->>'customer_id')::uuid)
      and (not(p_filters?'opportunity_id') or c.opportunity_id=(p_filters->>'opportunity_id')::uuid)
      and (not(p_filters?'provider_call_sid') or c.provider_call_sid=p_filters->>'provider_call_sid')
      and (not(p_filters?'outcome') or c.metadata->>'disposition_outcome'=p_filters->>'outcome')
      and (not(p_filters?'from_date') or c.started_at>=(p_filters->>'from_date')::timestamptz)
      and (not(p_filters?'to_date') or case when coalesce((p_filters->>'to_date_exclusive')::boolean,false)
        then c.started_at<(p_filters->>'to_date')::timestamptz else c.started_at<=(p_filters->>'to_date')::timestamptz end)
      and (not(p_filters?'has_recording') or exists(select 1 from public.call_recordings r where r.organization_id=p_org and r.call_id=c.id and r.status='ready')=(p_filters->>'has_recording')::boolean)
      and (v_q is null or position(lower(v_q) in lower(c.from_number))>0 or position(lower(v_q) in lower(c.to_number))>0
        or exists(select 1 from public.customers cu where cu.organization_id=p_org and cu.id=c.customer_id and position(lower(v_q) in lower(cu.full_name))>0)
        or exists(select 1 from public.call_transcripts tr where tr.organization_id=p_org and tr.call_id=c.id and tr.status='completed'
          and to_tsvector('simple'::regconfig,coalesce(tr.full_text,'')) @@ websearch_to_tsquery('simple'::regconfig,v_q)))
  ), page as (
    select * from filtered order by started_at desc,id limit least(200,greatest(1,coalesce((p_filters->>'limit')::integer,50)))
    offset greatest(0,coalesce((p_filters->>'offset')::integer,0))
  )
  select jsonb_build_object('count',(select count(*) from filtered),'canViewAll',v_all,
    'stats',jsonb_build_object('totalToday',(select count(*) from filtered),
      'avgDuration',coalesce((select round(avg(duration_seconds) filter(where duration_seconds>0)) from filtered),0),
      'missed',(select count(*) from filtered where status in('no_answer','busy','canceled','failed','voicemail'))),
    'data',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object(
      'customer',(select jsonb_build_object('id',cu.id,'full_name',cu.full_name,'first_name',cu.first_name,'last_name',cu.last_name,'phone',cu.phone) from public.customers cu where cu.id=c.customer_id and cu.organization_id=p_org),
      'opportunity',(select jsonb_build_object('id',o.id,'name',o.name) from public.opportunities o where o.id=c.opportunity_id and o.organization_id=p_org),
      'user',(select jsonb_build_object('id',pr.id,'first_name',pr.first_name,'last_name',pr.last_name,'email',pr.email) from public.profiles pr where pr.id=c.user_id),
      'recordings',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'duration_seconds',r.duration_seconds,'channels',r.channels)) from public.call_recordings r where r.call_id=c.id and r.organization_id=p_org and r.status<>'deleted'),'[]'::jsonb),
      'analysis',(select jsonb_build_object('summary',a.summary,'sentiment',a.sentiment,'detected_objections',a.detected_objections) from public.call_analyses a where a.call_id=c.id and a.organization_id=p_org order by a.created_at desc,a.id limit 1),
      'consent_method',(select co.method from public.call_consents co where co.call_id=c.id and co.organization_id=p_org and co.consent_type='recording' order by co.announced_at desc,co.id limit 1),
      'disposition_outcome',c.metadata->>'disposition_outcome'
    ) order by c.started_at desc,c.id) from page c),'[]'::jsonb)) into v_result;
  return v_result;
end; $$;
revoke all on function public.crm_calls_list(integer,jsonb) from public,anon;
grant execute on function public.crm_calls_list(integer,jsonb) to authenticated,service_role;
