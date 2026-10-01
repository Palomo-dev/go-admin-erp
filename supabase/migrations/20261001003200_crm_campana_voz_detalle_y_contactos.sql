-- Criterio único para contactos de voz: campañas y límite semanal usan la misma regla.
create or replace function public.fn_es_contacto_voz_efectivo(p_direction text,p_status text,p_answered_at timestamptz,p_answered_by text)
returns boolean language sql immutable set search_path=public,pg_temp as $$
 select coalesce(p_direction='outbound' and p_answered_at is not null
  and p_status in ('in_progress','completed')
  and coalesce(p_answered_by,'human') not like 'machine%'
  and coalesce(p_answered_by,'')<>'fax',false)
$$;
revoke all on function public.fn_es_contacto_voz_efectivo(text,text,timestamptz,text) from public,anon;
grant execute on function public.fn_es_contacto_voz_efectivo(text,text,timestamptz,text) to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fn_contactos_efectivos_semana(p_org integer, p_customer uuid, p_desde timestamp with time zone, p_hasta timestamp with time zone)
 RETURNS TABLE(canal text, contactos integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Voz: llamadas salientes CONTESTADAS por una persona (humanas o del agente).
  select 'voice'::text, count(*)::integer
    from public.calls c
   where c.organization_id = p_org
     and c.customer_id = p_customer
     and public.fn_es_contacto_voz_efectivo(c.direction,c.status,c.answered_at,c.answered_by)
     and c.answered_at >= p_desde and c.answered_at < p_hasta
  union all
  -- Correo: enviados (los fallidos o rebotados no llegaron).
  select 'email'::text, count(*)::integer
    from public.email_messages e
   where e.organization_id = p_org
     and e.to_customer_id = p_customer
     and e.sent_at >= p_desde and e.sent_at < p_hasta
     and e.status in ('sent', 'delivered', 'opened', 'clicked')
  union all
  -- Mensajería: mensajes salientes que inicia la empresa. Una respuesta dentro
  -- de las 24 h siguientes a un mensaje del cliente no es un contacto nuevo:
  -- la conversación la abrió él. Un contacto por conversación y día.
  select case when ch.type = 'whatsapp' then 'whatsapp' else 'mensajeria' end,
         count(distinct (m.conversation_id, floor(extract(epoch from (m.created_at - p_desde)) / 86400)))::integer
    from public.messages m
    join public.conversations cv on cv.id = m.conversation_id and cv.organization_id = p_org
    left join public.channels ch on ch.id = cv.channel_id
   where m.organization_id = p_org
     and cv.customer_id = p_customer
     and m.direction = 'outbound'
     and m.created_at >= p_desde and m.created_at < p_hasta
     and not exists (
       select 1 from public.messages mi
        where mi.conversation_id = m.conversation_id
          and mi.direction = 'inbound'
          and mi.created_at <= m.created_at
          and mi.created_at > m.created_at - interval '24 hours'
     )
   group by 1
$function$
;

-- Agregados sin truncamiento y detalle paginado; nunca devuelve conversaciones ni credenciales.
create or replace function public.crm_voice_campaign_detail(p_org integer,p_campaign uuid,p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_campaign jsonb; v_result jsonb; v_tz text;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.opportunities.view']);
 if p_page<1 or p_page>100000 then raise exception 'pagina_invalida' using errcode='22023';end if;
 select jsonb_build_object('id',v.id,'name',v.name,'status',v.status,'agent_name',a.name,
  'objective',v.objective,'emergency_stop',v.emergency_stop,'stopped_reason',v.stopped_reason,
  'stopped_at',v.stopped_at,'consecutive_failures',v.consecutive_failures,
  'max_calls_per_day',v.max_calls_per_day,'max_calls_per_hour',v.max_calls_per_hour,
  'max_concurrent',v.max_concurrent,'schedule',v.schedule,
  'rne_checked_at',r.checked_at,'rne_valid_until',r.valid_until)
 into v_campaign from public.voice_agent_campaigns v
 join public.voice_agents a on a.id=v.voice_agent_id and a.organization_id=p_org
 left join lateral(select checked_at,valid_until from public.voice_campaign_rne_checks
   where organization_id=p_org and campaign_id=v.id order by checked_at desc,id desc limit 1)r on true
 where v.id=p_campaign and v.organization_id=p_org;
 if v_campaign is null then raise exception 'campana_no_encontrada' using errcode='P0002';end if;
 select coalesce(timezone,'America/Bogota') into v_tz from public.organizations where id=p_org;
 with targets as materialized(
  select id,call_id,status,outcome,created_at,scheduled_at from public.voice_agent_calls
  where organization_id=p_org and campaign_id=p_campaign
 ), physical as materialized(
  select c.id,c.customer_id,c.status,c.started_at,c.direction,c.answered_at,c.answered_by,c.duration_seconds
  from public.calls c where c.organization_id=p_org and
   (c.metadata->>'campaign_id'=p_campaign::text
    or (c.metadata->>'campaign_id' is null and exists(select 1 from targets t where t.call_id=c.id)))
 ), history as(
  select c.id,c.status,c.started_at,c.duration_seconds,cu.full_name as customer_name
  from physical c left join public.customers cu on cu.id=c.customer_id and cu.organization_id=p_org
  order by c.started_at desc nulls last,c.id desc limit 25 offset (p_page-1)*25
 ), active as(
  select c.id,c.status,c.started_at,cu.full_name as customer_name from physical c
  left join public.customers cu on cu.id=c.customer_id and cu.organization_id=p_org
  where c.status in ('dialing','ringing','in_progress')
  order by c.started_at desc nulls last,c.id desc limit 100
 ), outcomes as(
  select status,count(*) as n from targets group by status
 )
 select jsonb_build_object('campaign',v_campaign,'stats',jsonb_build_object(
  'targets',(select count(*) from targets),
  'attempts',(select count(*) from physical),
  'today',(select count(*) from physical where (started_at at time zone v_tz)::date=(now() at time zone v_tz)::date),
  'effective',(select count(*) from physical where public.fn_es_contacto_voz_efectivo(direction,status,answered_at,answered_by)),
  'meetings',(select count(distinct coalesce(a.metadata->>'calendar_event_id',a.id::text)) from public.activities a
    where a.organization_id=p_org and a.outcome='meeting_booked'
    and exists(select 1 from targets t where t.id::text=a.metadata->>'voice_agent_call_id')),
  'conversation_minutes',(select coalesce(sum(greatest(coalesce(duration_seconds,0),0)),0)/60.0 from physical),
  'remaining_minutes',(select voice_minutes_remaining from public.comm_settings where organization_id=p_org and is_active limit 1),
  'active_total',(select count(*) from physical where status in ('dialing','ringing','in_progress')),
  'pending',(select count(*) from targets where status in ('pending','queued')),
  'rescheduled',(select count(*) from targets where status in ('pending','queued') and scheduled_at>now()),
  'outcomes',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from outcomes)),
  'history',(select coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) from history h),
  'active',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from active a),
  'page',p_page,'timezone',v_tz) into v_result;
 return v_result;
end;
$$;
revoke all on function public.crm_voice_campaign_detail(integer,uuid,integer) from public,anon;
grant execute on function public.crm_voice_campaign_detail(integer,uuid,integer) to authenticated,service_role;

