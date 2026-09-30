-- ============================================================================
-- Agente de voz: «devolver la llamada» durante la propia llamada (2026-09-30)
--
-- Bug verificado en la llamada de prueba del 2026-09-30 (org 125): la
-- herramienta `schedule_callback` insertaba una fila `pending` para el mismo
-- cliente y agente MIENTRAS la llamada seguía `in_progress`, y el índice único
-- `voice_agent_calls_una_viva_por_cliente` (una sola fila viva —pending,
-- queued, in_progress— por organización, agente y cliente) la rechazaba
-- siempre. El agente terminaba diciendo «el sistema no permitió registrarla».
--
-- Arreglo (sin tocar el índice, que evita marcar dos veces al mismo cliente):
-- 1. `voice_agent_calls.callback_at`: la llamada en curso guarda la hora que
--    pidió la persona (NULL-able, aditiva).
-- 2. Trigger AFTER UPDATE OF status: cuando esa fila sale del estado vivo
--    (por el status callback de Twilio, por `releaseCall` o por cualquier otro
--    camino), crea la fila `pending` de la devolución con `scheduled_at =
--    callback_at`. En ese momento el índice ya no la bloquea. Si ya hay otra
--    fila viva para el cliente, no duplica.
--
-- La fila nueva pasa por TODAS las compuertas del despachador (franja legal,
-- Ley 2300, RNE, topes, créditos): el trigger solo la encola.
--
-- Rollback: supabase/rollbacks/20260930240000_voz_devolucion_llamada_rollback.sql
-- ============================================================================

alter table public.voice_agent_calls
  add column if not exists callback_at timestamptz null;

comment on column public.voice_agent_calls.callback_at is
  'Hora a la que la persona pidió que se le devuelva la llamada (herramienta schedule_callback). Al cerrarse la llamada, fn_vac_encolar_devolucion crea la fila pending.';

create or replace function public.fn_vac_encolar_devolucion()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
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
    -- El motivo lo dejó schedule_callback en el outcome de la llamada origen
    -- («callback: …»); si otro camino lo pisó, queda «callback» a secas.
    case when new.outcome like 'callback%' then left(new.outcome, 500) else 'callback' end
  );

  return null;
end;
$$;

comment on function public.fn_vac_encolar_devolucion() is
  'Crea la fila pending de una devolución de llamada (callback_at) cuando la llamada que la pidió deja de estar viva. Ver migración 20260930240000.';

revoke all on function public.fn_vac_encolar_devolucion() from public, anon, authenticated;

drop trigger if exists trg_vac_encolar_devolucion on public.voice_agent_calls;
create trigger trg_vac_encolar_devolucion
  after update of status on public.voice_agent_calls
  for each row
  when (new.callback_at is not null and old.status is distinct from new.status)
  execute function public.fn_vac_encolar_devolucion();
