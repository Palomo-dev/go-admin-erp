-- RNE: reconoce E.164 y no acredita archivos vacíos. Los registros históricos se conservan.
set lock_timeout='2s';
CREATE OR REPLACE FUNCTION public.fn_rne_registrar_verificacion(p_org integer, p_campaign uuid, p_numeros text[], p_clientes_excluidos uuid[], p_objetivos_revisados integer, p_archivo text, p_sha256 text, p_usuario uuid, p_vigencia_dias integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_check_id uuid;
  v_ahora timestamptz := now();
  v_numeros integer;
  v_omitidas integer;
  v_excluidos integer := coalesce(array_length(p_clientes_excluidos, 1), 0);
begin
  perform public.fn_assert_acceso_org(p_org);
  if p_vigencia_dias is null or p_vigencia_dias < 1 or p_vigencia_dias > 30 then
    raise exception 'vigencia inválida: % (1 a 30 días)', p_vigencia_dias using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.voice_agent_campaigns c
     where c.id = p_campaign and c.organization_id = p_org
  ) then
    raise exception 'La campaña no pertenece a la organización' using errcode = '42501';
  end if;

  select count(*) into v_numeros
    from (select distinct n from unnest(coalesce(p_numeros, '{}'::text[])) as n
           where n ~ '^\+[1-9][0-9]{9,14}$') s;

  if v_numeros = 0 then
    raise exception 'rne_sin_numeros_validos' using errcode = '22023';
  end if;

  insert into public.voice_campaign_rne_checks (
    organization_id, campaign_id, checked_at, valid_until, file_name, file_sha256,
    numbers_in_file, checked_targets, excluded_targets, checked_by
  ) values (
    p_org, p_campaign, v_ahora, v_ahora + make_interval(days => p_vigencia_dias),
    left(p_archivo, 255), p_sha256,
    v_numeros, greatest(coalesce(p_objetivos_revisados, 0), 0), v_excluidos, p_usuario
  ) returning id into v_check_id;

  insert into public.crm_excluded_numbers (organization_id, phone_e164, source, rne_check_id, created_by)
  select distinct p_org, n, 'rne', v_check_id, p_usuario
    from unnest(coalesce(p_numeros, '{}'::text[])) as n
   where n ~ '^\+[1-9][0-9]{9,14}$'
  on conflict (organization_id, phone_e164, source) do nothing;

  update public.voice_agent_calls v
     set status = 'skipped',
         error_message = 'Número inscrito en el Registro de Números Excluidos (RNE)',
         last_error_code = 'RNE',
         completed_at = v_ahora,
         locked_by = null,
         updated_at = v_ahora
   where v.organization_id = p_org
     and v.campaign_id = p_campaign
     and v.status in ('pending', 'queued')
     and v.customer_id = any(coalesce(p_clientes_excluidos, '{}'::uuid[]));
  get diagnostics v_omitidas = row_count;

  update public.voice_campaign_rne_checks set skipped_calls = v_omitidas where id = v_check_id;

  return jsonb_build_object(
    'check_id', v_check_id,
    'checked_at', v_ahora,
    'valid_until', v_ahora + make_interval(days => p_vigencia_dias),
    'numbers_in_file', v_numeros,
    'checked_targets', greatest(coalesce(p_objetivos_revisados, 0), 0),
    'excluded_targets', v_excluidos,
    'skipped_calls', v_omitidas
  );
end $function$
;
CREATE OR REPLACE FUNCTION public.crm_campaigns_unificadas(p_org integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_data jsonb;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.opportunities.view']);
 with voice_counts as (
  select campaign_id,jsonb_object_agg(status,n) as counts from (
   select campaign_id,status,count(*) as n from public.voice_agent_calls
   where organization_id=p_org and campaign_id is not null group by campaign_id,status
  ) c group by campaign_id
 ), combined as (
  select c.id,c.name,'message'::text as source,c.channel,c.status,c.created_at,c.scheduled_at,
   c.statistics as stats,coalesce(s.name,'') as segment_name,t.name as content_name,
   false as emergency_stop,null::text as stopped_reason,null::timestamptz as rne_valid_until,null::integer as rne_numbers_in_file,
   '{}'::jsonb as voice_counts,null::text as data_policy_url
  from public.campaigns c
  left join public.segments s on s.id=c.segment_id and s.organization_id=p_org
  left join public.templates t on t.id=c.template_id and t.organization_id=p_org
  where c.organization_id=p_org
  union all
  select v.id,v.name,'voice','voice',v.status,v.created_at,null::timestamptz,v.stats,
   coalesce(s.name,''),a.name,v.emergency_stop,v.stopped_reason,r.valid_until,r.numbers_in_file,
   coalesce(vc.counts,'{}'::jsonb),cs.data_policy_url
  from public.voice_agent_campaigns v
  join public.voice_agents a on a.id=v.voice_agent_id and a.organization_id=p_org
  left join public.segments s on s.id::text=v.target_config->>'segment_id' and s.organization_id=p_org
  left join voice_counts vc on vc.campaign_id=v.id
  left join public.comm_settings cs on cs.organization_id=p_org and cs.is_active
  left join lateral (
   select valid_until,numbers_in_file from public.voice_campaign_rne_checks where organization_id=p_org and campaign_id=v.id
   order by checked_at desc,id desc limit 1
  ) r on true
  where v.organization_id=p_org
 )
 select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.source,c.id),'[]'::jsonb) into v_data from combined c;
 return v_data;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crm_voice_campaign_detail(p_org integer, p_campaign uuid, p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_campaign jsonb; v_result jsonb; v_tz text;
begin
 perform public.fn_crm_exigir_permiso(p_org,array['crm.opportunities.view']);
 if p_page<1 or p_page>100000 then raise exception 'pagina_invalida' using errcode='22023';end if;
 select jsonb_build_object('id',v.id,'name',v.name,'status',v.status,'agent_name',a.name,
  'objective',v.objective,'emergency_stop',v.emergency_stop,'stopped_reason',v.stopped_reason,
  'stopped_at',v.stopped_at,'consecutive_failures',v.consecutive_failures,
  'max_calls_per_day',v.max_calls_per_day,'max_calls_per_hour',v.max_calls_per_hour,
  'max_concurrent',v.max_concurrent,'schedule',v.schedule,
  'rne_checked_at',r.checked_at,'rne_valid_until',r.valid_until,'rne_numbers_in_file',r.numbers_in_file)
 into v_campaign from public.voice_agent_campaigns v
 join public.voice_agents a on a.id=v.voice_agent_id and a.organization_id=p_org
 left join lateral(select checked_at,valid_until,numbers_in_file from public.voice_campaign_rne_checks
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
$function$
;
revoke all on function public.fn_rne_registrar_verificacion(integer,uuid,text[],uuid[],integer,text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.fn_rne_registrar_verificacion(integer,uuid,text[],uuid[],integer,text,text,uuid,integer) to service_role;
