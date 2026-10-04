-- Revertir antes de retirar el libro de reservas de voz. No modifica datos ni saldos.
CREATE OR REPLACE FUNCTION public.crm_voice_campaign_archive(p_org integer, p_campaign uuid, p_version timestamp with time zone, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_row public.voice_agent_campaigns%rowtype; v_now timestamptz:=clock_timestamp();
begin
 perform public.crm_lock_comm_wallet(p_org);
 if p_actor is null or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and is_active) then
  raise exception 'actor_ajeno' using errcode='42501'; end if;
 select * into v_row from public.voice_agent_campaigns where id=p_campaign and organization_id=p_org and stats->>'archived_at' is null for update;
 if not found then raise exception 'campana_no_encontrada' using errcode='P0002'; end if;
 if p_version is null or v_row.updated_at is distinct from p_version then raise exception 'campana_modificada' using errcode='P0001'; end if;
 perform 1 from public.voice_agent_calls where organization_id=p_org and campaign_id=p_campaign order by id for update;
 if exists(select 1 from public.voice_agent_calls where organization_id=p_org and campaign_id=p_campaign and status='in_progress') or
  exists(select 1 from public.calls c where c.organization_id=p_org and c.status in ('dialing','ringing','in_progress') and
   (c.metadata->>'campaign_id'=p_campaign::text or exists(select 1 from public.voice_agent_calls v where v.organization_id=p_org and v.campaign_id=p_campaign and v.call_id=c.id))) then
  raise exception 'llamadas_activas' using errcode='P0001'; end if;
 if exists(select 1 from public.voice_agent_calls where organization_id=p_org and campaign_id=p_campaign and credits_reserved>0 and credits_settled_at is null) then
  raise exception 'creditos_pendientes' using errcode='P0001'; end if;
 update public.voice_agent_calls set status='canceled',completed_at=v_now,updated_at=v_now,last_error_code='CAMPAIGN_ARCHIVED',locked_by=null
  where organization_id=p_org and campaign_id=p_campaign and status in ('pending','queued');
 update public.voice_agent_campaigns set status='completed',emergency_stop=true,stopped_at=v_now,stopped_reason='CAMPAIGN_ARCHIVED',updated_at=v_now,
  stats=stats||jsonb_build_object('archived_at',v_now,'archived_by',p_actor) where id=p_campaign and organization_id=p_org returning * into v_row;
 insert into public.crm_events(organization_id,event_type,entity_type,entity_id,payload,status,processed_at)
  values(p_org,'campaign.archived','voice_agent_campaign',p_campaign,jsonb_build_object('actor_id',p_actor),'processed',v_now);
 return to_jsonb(v_row);
end $function$
;

revoke all on function public.crm_voice_campaign_archive(integer,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.crm_voice_campaign_archive(integer,uuid,timestamptz,uuid) to service_role;
drop index if exists public.crm_voice_credits_pending_campaign_idx;
