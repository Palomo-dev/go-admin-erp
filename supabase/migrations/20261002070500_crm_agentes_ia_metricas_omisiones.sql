-- Extensión de métricas aplicadas: causas de omisión/reprogramación en SQL.
-- Esquema y códigos canónicos RNE/LEY2300 verificados 2026-10-02.
-- Figma 1311:86823. Una fila de voice_agent_calls cuenta una llamada;
-- los intentos del ledger afectan consumo, nunca el contador de llamadas.
create or replace function public.crm_voice_agent_metrics(
  p_org integer, p_agent uuid, p_days integer default 30,
  p_limit integer default 20, p_offset integer default 0
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  -- El ledger es privado: no se concede SELECT a authenticated.
  -- El wrapper sólo expone el agregado tras las guardas de sesión y visibilidad.
  if auth.uid() is null and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'sin_sesion' using errcode='42501';
  end if;
  perform public.fn_crm_exigir_permiso(p_org, array['crm.campaigns.manage']);
  if p_days is null or p_days not in (7,30,90) or p_limit is null or p_limit not between 1 and 100
     or p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'parametros_invalidos' using errcode='22023';
  end if;
  if not exists(select 1 from public.voice_agents a where a.id=p_agent and a.organization_id=p_org) then
    raise exception 'agente_no_encontrado' using errcode='P0002';
  end if;
  with visible as materialized (
    select v.*, c.full_name as customer_name,
      case when v.campaign_id is not null then 'campaign'
           when v.stage_agent_id is not null then 'stage' else 'direct' end as source
    from public.voice_agent_calls v
    left join public.customers c on c.id=v.customer_id and c.organization_id=p_org
    left join public.calls n on n.id=v.call_id and n.organization_id=p_org
    where v.organization_id=p_org and v.voice_agent_id=p_agent
      and v.created_at >= now()-make_interval(days=>p_days)
      and (v.customer_id is null or (c.id is not null and public.app_branch_access(c.branch_id)))
      and (v.call_id is null or (n.id is not null and
        (n.user_id=auth.uid() or public.fn_crm_tiene_permiso(p_org,'crm.calls.view_all'))))
  ), credit as (
    select coalesce(sum(case when r.settled_at is not null then r.minutes_charged else 0 end),0)::bigint as charged
    from public.crm_voice_credit_reservations r join visible v on v.id=r.voice_agent_call_id
    where r.organization_id=p_org
  ), legacy as (
    select coalesce(sum(v.credits_reserved),0)::bigint as charged from visible v
    where v.credits_settled_at is not null and not exists(
      select 1 from public.crm_voice_credit_reservations r
      where r.organization_id=p_org and r.voice_agent_call_id=v.id
    )
  ), statuses as (
    select status,count(*)::integer as total from visible group by status
  ), tools as (
    select t.tool,t.status,count(*)::integer as total
    from public.voice_agent_tool_runs t join visible v on v.id=t.voice_agent_call_id
    where t.organization_id=p_org group by t.tool,t.status
  ), recent as (
    select id,call_id,customer_name,status,outcome,duration_seconds,created_at,source,last_error_code
    from visible order by created_at desc,id desc limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'period_days',p_days,'total',count(*)::integer,
    'effective',count(*) filter(where status in ('completed','transferred'))::integer,
    'average_duration_seconds',round(avg(duration_seconds) filter(where status in ('completed','transferred')),1),
    'credits_consumed',(select charged from credit)+(select charged from legacy),
    'omissions',jsonb_build_object(
      'rne_excluded',count(*) filter(where status='skipped' and last_error_code='RNE')::integer,
      'law_rescheduled',count(*) filter(where status in ('pending','queued') and last_error_code='LEY2300')::integer,
      'other_skipped',count(*) filter(where status='skipped' and last_error_code is distinct from 'RNE')::integer
    ),
    'statuses',coalesce((select jsonb_agg(to_jsonb(s) order by s.status) from statuses s),'[]'::jsonb),
    'tools',coalesce((select jsonb_agg(to_jsonb(t) order by t.tool,t.status) from tools t),'[]'::jsonb),
    'rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc) from recent r),'[]'::jsonb),
    'limit',p_limit,'offset',p_offset
  ) into v_result from visible;
  return v_result;
end $$;
revoke all on function public.crm_voice_agent_metrics(integer,uuid,integer,integer,integer) from public, anon;
grant execute on function public.crm_voice_agent_metrics(integer,uuid,integer,integer,integer) to authenticated, service_role;
