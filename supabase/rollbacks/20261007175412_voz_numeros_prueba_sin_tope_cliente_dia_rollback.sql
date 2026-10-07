-- Reversión de 20261007175412: los números de prueba vuelven a tener el tope de 2 intentos
-- por cliente, agente y día (definición anterior de crm_voice_call_claim_motivo).
create or replace function public.crm_voice_call_claim_motivo(p_org integer, p_vac uuid, p_bloquear boolean default true)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_vac public.voice_agent_calls;v_agent public.voice_agents;v_campaign public.voice_agent_campaigns;v_settings public.comm_settings;
 v_tz text;v_day timestamptz;v_hour timestamptz;v_unpaid integer;
begin
 perform public.fn_assert_acceso_org(p_org);
 select * into v_vac from public.voice_agent_calls where organization_id=p_org and id=p_vac;
 if not found or v_vac.status not in ('pending','queued') then return 'no_reclamable';end if;
 if v_vac.scheduled_at is not null and v_vac.scheduled_at>clock_timestamp() then
  return case when v_vac.last_error_code='LEY2300' then 'ley2300_reprogramada' else 'programada' end;
 end if;
 if p_bloquear then
  select * into v_agent from public.voice_agents where organization_id=p_org and id=v_vac.voice_agent_id and is_active for share;
 else
  select * into v_agent from public.voice_agents where organization_id=p_org and id=v_vac.voice_agent_id and is_active;
 end if;
 if not found then return 'agente_inactivo';end if;
 if p_bloquear then
  select * into v_settings from public.comm_settings where organization_id=p_org and is_active and voice_agent_enabled for share;
 else
  select * into v_settings from public.comm_settings where organization_id=p_org and is_active and voice_agent_enabled;
 end if;
 if not found then return 'agente_voz_apagado';end if;
 if v_settings.data_policy_url is null or v_settings.data_policy_url !~ '^https://\S+$' or length(v_settings.data_policy_url)>500 then return 'sin_politica_datos';end if;
 if v_vac.customer_id is null or not public.fn_can_contact(p_org,v_vac.customer_id,'voice','utility') then return 'sin_consentimiento';end if;
 if v_vac.campaign_id is not null then
  if p_bloquear then
   select * into v_campaign from public.voice_agent_campaigns where organization_id=p_org and id=v_vac.campaign_id for update;
  else
   select * into v_campaign from public.voice_agent_campaigns where organization_id=p_org and id=v_vac.campaign_id;
  end if;
  if not found or v_campaign.stats->>'archived_at' is not null or v_campaign.status<>'running' or v_campaign.emergency_stop or v_campaign.voice_agent_id<>v_vac.voice_agent_id then return 'campana_no_activa';end if;
 end if;
 if exists(select 1 from public.crm_voice_credit_reservations where organization_id=p_org and voice_agent_call_id=p_vac and state='reserved') then return 'reserva_pendiente';end if;
 if v_settings.voice_minutes_remaining is not null then
  select count(*) into v_unpaid from public.voice_agent_calls v where v.organization_id=p_org and v.status='in_progress' and v.credits_reserved=0
   and not exists(select 1 from public.crm_voice_credit_reservations r where r.organization_id=p_org and r.voice_agent_call_id=v.id and r.attempt_no=v.attempts);
  if v_settings.voice_minutes_remaining<=v_unpaid then return 'sin_minutos';end if;
 end if;
 if (select count(*) from public.crm_voice_live_slots(p_org))>=v_settings.voice_max_concurrent_calls then return 'concurrencia';end if;
 if v_vac.campaign_id is not null and (select count(*) from public.crm_voice_live_slots(p_org) s where s.campaign_id=v_vac.campaign_id)>=v_campaign.max_concurrent then return 'concurrencia';end if;
 select coalesce(timezone,'America/Bogota') into v_tz from public.organizations where id=p_org;
 v_day:=date_trunc('day',clock_timestamp() at time zone v_tz) at time zone v_tz;
 v_hour:=clock_timestamp()-interval '1 hour';
 if (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id and attempted_at>=v_day)>=v_agent.max_calls_per_day then return 'tope_diario';end if;
 if (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id and attempted_at>=v_hour)>=v_agent.max_calls_per_hour then return 'tope_hora';end if;
 if (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and voice_agent_id=v_vac.voice_agent_id and customer_id=v_vac.customer_id and attempted_at>=v_day)>=2 then return 'tope_cliente_dia';end if;
 if v_vac.campaign_id is not null then
  if (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and campaign_id=v_vac.campaign_id and attempted_at>=v_day)>=v_campaign.max_calls_per_day then return 'tope_diario';end if;
  if (select count(*) from public.voice_agent_call_attempts where organization_id=p_org and campaign_id=v_vac.campaign_id and attempted_at>=v_hour)>=v_campaign.max_calls_per_hour then return 'tope_hora';end if;
 end if;
 return null;
end;$function$;
