-- Recolector de llamadas del agente de voz colgadas en `in_progress`.
--
-- Incidente 2026-10-06 (org 125): cinco `voice_agent_calls` quedaron en
-- `in_progress` con su `calls.ended_at` ya puesto (la 2ª pasada del TwiML las
-- reabría después del `completed`). Ocupaban los cinco cupos de concurrencia de
-- la organización y la campaña dejó de marcar.
--
-- Cierra, para UNA organización, las filas `in_progress` cuya llamada ya
-- terminó (`calls.ended_at` no nulo) o que llevan más de `p_minutos` sin
-- actualizarse. Estado final:
--   · con `ended_at`: el estado terminal de `calls` si ya lo tiene; si no, se
--     deduce de `answered_by` (máquina → voicemail, fax → no_answer, persona o
--     desconocido → completed) y, sin respuesta, failed.
--   · sin `ended_at` (inactividad): failed, con `last_error_code = 'RECOLECTOR'`.
-- No borra filas ni mueve créditos. Deja rastro en `calls.metadata.recolector`.
-- La llama `runCampaignQueue` (service_role) antes de contar la concurrencia.
-- SECURITY INVOKER y ejecutable solo por service_role: ningún usuario puede
-- cerrar llamadas de otra organización (ni de la suya) con esta función.

create or replace function public.fn_vac_recoger_colgadas(p_org integer, p_minutos integer default 15)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_minutos integer := greatest(coalesce(p_minutos, 15), 5);
  v_corte timestamptz := clock_timestamp() - make_interval(mins => greatest(coalesce(p_minutos, 15), 5));
  v_n integer := 0;
begin
  if p_org is null then
    raise exception 'fn_vac_recoger_colgadas: p_org es obligatorio';
  end if;

  with objetivo as (
    select v.id,
           v.call_id,
           c.ended_at,
           (c.ended_at is null) as por_inactividad,
           case
             when c.ended_at is null then 'failed'
             when c.status in ('completed', 'failed', 'no_answer', 'canceled', 'voicemail') then c.status
             when c.status = 'busy' then 'failed'
             when c.answered_by like 'machine%' then 'voicemail'
             when c.answered_by = 'fax' then 'no_answer'
             when c.answered_by is not null or c.answered_at is not null then 'completed'
             else 'failed'
           end as estado_final
      from public.voice_agent_calls v
      left join public.calls c
        on c.id = v.call_id and c.organization_id = v.organization_id
     where v.organization_id = p_org
       and v.status = 'in_progress'
       and (c.ended_at is not null or v.updated_at < v_corte)
       for update of v skip locked
  ),
  upd_vac as (
    update public.voice_agent_calls v
       set status = o.estado_final,
           completed_at = coalesce(v.completed_at, o.ended_at, clock_timestamp()),
           locked_by = null,
           updated_at = clock_timestamp(),
           error_message = case when o.por_inactividad
                                then 'Cerrada por el recolector: sin cierre del proveedor en ' || v_minutos || ' min'
                                else v.error_message end,
           last_error_code = case when o.por_inactividad then 'RECOLECTOR' else v.last_error_code end
      from objetivo o
     where v.id = o.id
       and v.organization_id = p_org
    returning v.id
  ),
  upd_calls as (
    update public.calls c
       set status = o.estado_final,
           ended_at = coalesce(c.ended_at, clock_timestamp()),
           updated_at = clock_timestamp(),
           metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
             'recolector', jsonb_build_object(
               'at', clock_timestamp(),
               'motivo', case when o.por_inactividad then 'inactividad' else 'ended_at_sin_estado_final' end,
               'estado_previo', c.status
             )
           )
      from objetivo o
     where c.id = o.call_id
       and c.organization_id = p_org
       and c.status in ('dialing', 'ringing', 'in_progress')
    returning c.id
  )
  select count(*) into v_n from upd_vac;

  return v_n;
end;
$fn$;

comment on function public.fn_vac_recoger_colgadas(integer, integer) is
  'Cierra las voice_agent_calls in_progress de una organización cuya llamada ya terminó (calls.ended_at) o sin actualizar en p_minutos (mín. 5). Sin borrar ni mover créditos. Solo service_role.';

revoke all on function public.fn_vac_recoger_colgadas(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_vac_recoger_colgadas(integer, integer) to service_role;
