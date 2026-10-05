-- Reversión: vuelve a contar como vivas todas las llamadas abiertas, sin límite de antigüedad.
-- (Las 5 filas de calls cerradas como 'failed' no se reabren: estaban colgadas desde septiembre.)
create or replace function public.crm_voice_live_slots(p_org integer)
returns table(slot_key text, voice_agent_id uuid, campaign_id uuid)
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
begin
 perform public.fn_assert_acceso_org(p_org);
 return query with sources as (
  select 'vac:'||v.id as slot_key,v.voice_agent_id,v.campaign_id,2 as priority
   from public.voice_agent_calls v where v.organization_id=p_org and v.status='in_progress'
  union all
  select 'vac:'||r.voice_agent_call_id,coalesce((r.metadata->>'voice_agent_id')::uuid,v.voice_agent_id),
   (r.metadata->>'campaign_id')::uuid,1
   from public.crm_voice_credit_reservations r
   join public.voice_agent_calls v on v.id=r.voice_agent_call_id and v.organization_id=r.organization_id
   where r.organization_id=p_org and r.direction='outbound' and r.state='reserved'
    and r.submission_state<>'rejected' and r.metadata->>'terminal_status' is null and r.session_ended_at is null
  union all
  select coalesce('vac:'||r.voice_agent_call_id,'vac:'||v.id,'call:'||c.id),
   coalesce((r.metadata->>'voice_agent_id')::uuid,v.voice_agent_id,c.voice_agent_id),
   coalesce((r.metadata->>'campaign_id')::uuid,v.campaign_id),3
   from public.calls c
   left join public.crm_voice_credit_reservations r on r.call_id=c.id and r.organization_id=c.organization_id
   left join public.voice_agent_calls v on v.call_id=c.id and v.organization_id=c.organization_id
   where c.organization_id=p_org and c.status in ('dialing','ringing','in_progress')
 )
 select distinct on (s.slot_key) s.slot_key,s.voice_agent_id,s.campaign_id from sources s order by s.slot_key,s.priority;
end;$function$;
