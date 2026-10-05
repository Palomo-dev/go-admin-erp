-- Llamadas que quedaron en dialing/ringing/in_progress porque el proveedor
-- nunca avisó que terminaron ocupaban para siempre un cupo de concurrencia:
-- 5 llamadas del 12 al 17 de septiembre bloquearon todas las llamadas del
-- agente de la org 125 (voice_max_concurrent_calls = 5). Una llamada real no
-- dura más de 2 horas: pasado ese tiempo ya no cuenta como viva.
-- (Además, por execute_sql se cerraron como 'failed' esas 5 filas de calls.)
create or replace function public.crm_voice_live_slots(p_org integer)
returns table(slot_key text, voice_agent_id uuid, campaign_id uuid)
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
begin
 perform public.fn_assert_acceso_org(p_org);
 return query with sources as (
  select 'vac:'||v.id as slot_key,v.voice_agent_id,v.campaign_id,2 as priority
   from public.voice_agent_calls v where v.organization_id=p_org and v.status='in_progress'
    and coalesce(v.claimed_at, v.updated_at, v.created_at) > clock_timestamp() - interval '2 hours'
  union all
  select 'vac:'||r.voice_agent_call_id,coalesce((r.metadata->>'voice_agent_id')::uuid,v.voice_agent_id),
   (r.metadata->>'campaign_id')::uuid,1
   from public.crm_voice_credit_reservations r
   join public.voice_agent_calls v on v.id=r.voice_agent_call_id and v.organization_id=r.organization_id
   where r.organization_id=p_org and r.direction='outbound' and r.state='reserved'
    and r.submission_state<>'rejected' and r.metadata->>'terminal_status' is null and r.session_ended_at is null
    and r.created_at > clock_timestamp() - interval '2 hours'
  union all
  select coalesce('vac:'||r.voice_agent_call_id,'vac:'||v.id,'call:'||c.id),
   coalesce((r.metadata->>'voice_agent_id')::uuid,v.voice_agent_id,c.voice_agent_id),
   coalesce((r.metadata->>'campaign_id')::uuid,v.campaign_id),3
   from public.calls c
   left join public.crm_voice_credit_reservations r on r.call_id=c.id and r.organization_id=c.organization_id
   left join public.voice_agent_calls v on v.call_id=c.id and v.organization_id=c.organization_id
   where c.organization_id=p_org and c.status in ('dialing','ringing','in_progress')
    and c.created_at > clock_timestamp() - interval '2 hours'
 )
 select distinct on (s.slot_key) s.slot_key,s.voice_agent_id,s.campaign_id from sources s order by s.slot_key,s.priority;
end;$function$;
