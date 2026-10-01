-- CRM: archivar o recibir un callback tardío no reabre una campaña de voz.
CREATE OR REPLACE FUNCTION public.fn_vac_encolar_devolucion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- El archivo cancela pendientes; no crea otra llamada a partir de su callback.
  if new.last_error_code = 'CAMPAIGN_ARCHIVED'
     or (new.campaign_id is not null and not exists (
       select 1 from public.voice_agent_campaigns c
       where c.id = new.campaign_id and c.organization_id = new.organization_id
         and c.stats->>'archived_at' is null
     )) then
    return null;
  end if;
  if new.callback_at is null
     or old.status not in ('pending', 'queued', 'in_progress')
     or new.status in ('pending', 'queued', 'in_progress') then
    return null;
  end if;

  if new.customer_id is not null and exists (
    select 1
      from public.voice_agent_calls v
     where v.organization_id = new.organization_id
       and v.voice_agent_id = new.voice_agent_id
       and v.customer_id = new.customer_id
       and v.status in ('pending', 'queued', 'in_progress')
  ) then
    return null;
  end if;

  insert into public.voice_agent_calls (
    organization_id, voice_agent_id, campaign_id, customer_id, opportunity_id,
    stage_agent_id, status, scheduled_at, outcome
  ) values (
    new.organization_id, new.voice_agent_id, new.campaign_id, new.customer_id, new.opportunity_id,
    new.stage_agent_id, 'pending', greatest(new.callback_at, now()),
    case when new.outcome like 'callback%' then left(new.outcome, 500) else 'callback' end
  );

  return null;
end;
$function$;
revoke all on function public.fn_vac_encolar_devolucion() from public,anon,authenticated;
grant execute on function public.fn_vac_encolar_devolucion() to service_role;
