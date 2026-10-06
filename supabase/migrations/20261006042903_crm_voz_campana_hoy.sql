-- ============================================================================
-- Voz › Detalle de campaña en marcha: panel «Hoy», devoluciones, «no volver a
-- llamar» y resultado de cada llamada (Figma CRM 1809:144962).
-- Aplicada por MCP el 2026-10-06. Reensayo previo como authenticated (admin de la
-- org 125: dia=116 tope_dia=120 filas=2), no miembro 42501, campaña ajena P0002,
-- 101 llamadas 22023, anon sin EXECUTE, service_role lee, alta con
-- fn_alta_organizacion OK: ENSAYO_OK.
--
-- ENSAYO 2026-10-06 — ENSAYO_OK (bloque DO con este mismo cuerpo, como
-- `authenticated` y `service_role`, y comprobando que `anon` no tiene EXECUTE;
-- termina en raise 'ENSAYO_OK' y todo se revierte;
-- comprobado después que la función no quedó creada). Resultado literal al
-- final de este encabezado, sección «Resultado del ensayo».
--
-- Qué falta hoy: `crm_voice_campaign_detail` (aplicada) da las cifras
-- acumuladas y la lista de llamadas, pero no lo que el Figma pinta en «Hoy»
-- (tope diario, esta hora, simultáneas, fallos seguidos, reintentos en cola,
-- reprogramadas por la Ley 2300) ni las devoluciones pendientes, las bajas
-- («no volver a llamar») o el resultado de cada fila («Reunión agendada · mié
-- 8 oct 10:00», «Buzón · reintento hoy 14:00»).
--
-- Sin reglas nuevas (regla dura 7): los cupos se cuentan EXACTAMENTE como la
-- compuerta de reclamo `crm_voice_call_claim_gate` (verificada por MCP el
-- 2026-10-06): intentos de `voice_agent_call_attempts` de la campaña desde el
-- inicio del día en la zona de la organización y en la última hora;
-- simultáneas = `crm_voice_live_slots` de la campaña. El alcance de filas es
-- el de `crm_voice_campaign_detail`: permiso `crm.opportunities.view`,
-- miembro activo, sucursal del cliente con `app_branch_access`, y el resultado
-- por llamada solo de las llamadas propias o con `crm.calls.view_all`.
-- Solo lectura (STABLE). Sin columnas nuevas.
--
-- Resultado del ensayo (2026-10-06, organización 125 —la única con campañas de
-- voz— y su campaña en marcha; solo conteos, sin datos personales). Mensaje
-- literal devuelto por el bloque DO; después `pg_proc` confirma 0 funciones
-- con ese nombre (todo revertido):
--   ENSAYO_OK crm_voice_campaign_hoy: T1 miembro admin lee la campaña
--   (cupos.dia=116 = conteo directo 116, cupos.hora=0, tope_dia=120,
--   tope_hora=40, simultaneas=0 de 5, fallos_seguidos=0, devoluciones=0,
--   ley2300=0, reintentos=0, no_volver=0, encolados=116 contactados=116, filas
--   pedidas 2 → 2) | T2 no miembro → 42501 | T3 organización ajena → 42501 |
--   T4 campaña inexistente → P0002 campana_no_encontrada | T5 101 llamadas →
--   22023 | T6 anon sin EXECUTE | T7 service_role lee (filas 2)
-- ============================================================================

create or replace function public.crm_voice_campaign_hoy(
  p_org integer,
  p_campaign uuid,
  p_calls uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_c public.voice_agent_campaigns;
  v_tz text;
  v_day timestamptz;
  v_hour timestamptz;
  v_ver_todas boolean;
  v_res jsonb;
begin
  perform public.fn_crm_exigir_permiso(p_org, array['crm.opportunities.view']);
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'sin_sesion' using errcode = '42501';
  end if;
  -- El permiso elevado nunca acredita a un propietario sin pertenencia activa.
  if auth.uid() is not null and not exists (
    select 1 from public.organization_members m
     where m.organization_id = p_org and m.user_id = auth.uid() and m.is_active
  ) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_calls is not null and cardinality(p_calls) > 100 then
    raise exception 'demasiadas_llamadas' using errcode = '22023';
  end if;

  select * into v_c from public.voice_agent_campaigns
   where organization_id = p_org and id = p_campaign and stats->>'archived_at' is null;
  if not found then
    raise exception 'campana_no_encontrada' using errcode = 'P0002';
  end if;

  select coalesce(timezone, 'America/Bogota') into v_tz from public.organizations where id = p_org;
  -- Mismas fronteras que crm_voice_call_claim_gate.
  v_day := date_trunc('day', clock_timestamp() at time zone v_tz) at time zone v_tz;
  v_hour := clock_timestamp() - interval '1 hour';
  v_ver_todas := auth.uid() is null or public.fn_crm_tiene_permiso(p_org, 'crm.calls.view_all');

  with vac as materialized (
    select v.id, v.call_id, v.customer_id, v.status, v.outcome, v.attempts, v.last_error_code,
           v.scheduled_at, v.callback_at, v.created_at
      from public.voice_agent_calls v
     where v.organization_id = p_org and v.campaign_id = p_campaign
       and (v.customer_id is null or exists (
             select 1 from public.customers cu
              where cu.id = v.customer_id and cu.organization_id = p_org
                and (cu.branch_id is null or exists (select 1 from public.branches b where b.id = cu.branch_id and b.organization_id = p_org))
                and (auth.uid() is null or public.app_branch_access(cu.branch_id::integer))))
  ), pend as (
    select * from vac where status in ('pending', 'queued')
  ), filas as (
    select distinct on (v.call_id)
           v.call_id,
           jsonb_build_object(
             'estado', v.status,
             'resultado', left(v.outcome, 200),
             'devolucion_at', coalesce(v.callback_at, (
                select min(p.scheduled_at) from pend p
                 where p.customer_id = v.customer_id and coalesce(p.outcome, '') like 'callback%')),
             'reintento_at', (
                select min(p.scheduled_at) from pend p
                 where p.customer_id = v.customer_id and coalesce(p.outcome, '') not like 'callback%'),
             'ley2300', exists (
                select 1 from pend p
                 where p.customer_id = v.customer_id and p.last_error_code = 'LEY2300' and p.scheduled_at > clock_timestamp()),
             'reunion_at', (
                select min(e.start_at)
                  from public.activities a
                  join public.calendar_events e
                    on e.organization_id = p_org and e.id::text = a.metadata->>'calendar_event_id'
                 where a.organization_id = p_org and a.outcome = 'meeting_booked'
                   and a.metadata->>'voice_agent_call_id' = v.id::text),
             'no_volver_a_llamar', exists (
                select 1 from public.customers cu
                 where cu.id = v.customer_id and cu.organization_id = p_org
                   and (coalesce(cu.do_not_call, false) or lower(coalesce(cu.metadata->>'do_not_call', '')) = 'true'))
           ) as dato
      from vac v
      join public.calls n on n.id = v.call_id and n.organization_id = p_org
     where p_calls is not null and v.call_id = any (p_calls)
       and (n.user_id = auth.uid() or v_ver_todas)
     order by v.call_id, v.created_at desc
  )
  select jsonb_build_object(
    'timezone', v_tz,
    'cupos', jsonb_build_object(
      'dia', (select count(*) from public.voice_agent_call_attempts a
               where a.organization_id = p_org and a.campaign_id = p_campaign and a.attempted_at >= v_day),
      'tope_dia', v_c.max_calls_per_day,
      'hora', (select count(*) from public.voice_agent_call_attempts a
                where a.organization_id = p_org and a.campaign_id = p_campaign and a.attempted_at >= v_hour),
      'tope_hora', v_c.max_calls_per_hour,
      'simultaneas', (select count(*) from public.crm_voice_live_slots(p_org) s where s.campaign_id = p_campaign),
      'tope_simultaneas', v_c.max_concurrent,
      'fallos_seguidos', v_c.consecutive_failures
    ),
    'devoluciones', jsonb_build_object(
      'pendientes', (select count(*) from pend where coalesce(outcome, '') like 'callback%'),
      'proxima', (select min(scheduled_at) from pend where coalesce(outcome, '') like 'callback%' and scheduled_at >= clock_timestamp())
    ),
    'ley2300', jsonb_build_object(
      'reprogramadas', (select count(*) from pend where last_error_code = 'LEY2300' and scheduled_at > clock_timestamp()),
      'proxima', (select min(scheduled_at) from pend where last_error_code = 'LEY2300' and scheduled_at > clock_timestamp())
    ),
    'reintentos_en_cola', (select count(*) from pend
                            where attempts > 0 and coalesce(last_error_code, '') <> 'LEY2300'
                              and coalesce(outcome, '') not like 'callback%'),
    'no_volver_a_llamar', (select count(distinct cu.id) from vac
                             join public.customers cu on cu.id = vac.customer_id and cu.organization_id = p_org
                            where coalesce(cu.do_not_call, false) or lower(coalesce(cu.metadata->>'do_not_call', '')) = 'true'),
    'audiencia', jsonb_build_object(
      'encolados', (select count(distinct customer_id) from vac),
      'contactados', (select count(distinct customer_id) from vac where status not in ('pending', 'queued') or attempts > 0)
    ),
    'filas', coalesce((select jsonb_object_agg(f.call_id, f.dato) from filas f), '{}'::jsonb)
  ) into v_res;
  return v_res;
end;
$function$;

revoke all on function public.crm_voice_campaign_hoy(integer, uuid, uuid[]) from public, anon;
grant execute on function public.crm_voice_campaign_hoy(integer, uuid, uuid[]) to authenticated, service_role;

comment on function public.crm_voice_campaign_hoy(integer, uuid, uuid[]) is
  'Voz › detalle de campaña: cupos del día y de la hora (mismas fronteras que crm_voice_call_claim_gate), simultáneas, devoluciones, reprogramadas por Ley 2300, bajas y resultado por llamada. Mismo alcance que crm_voice_campaign_detail. Solo lectura.';
