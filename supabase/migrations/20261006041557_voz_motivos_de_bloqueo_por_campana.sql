-- ============================================================================
-- Voz › Campañas: «esta pasada no marcó por…» con los motivos REALES de la
-- compuerta de reclamo (Figma CRM 1809:144962, chips de motivo).
-- Aplicada por MCP el 2026-10-06. Reensayo previo (mismo día, do/raise): 124 filas,
-- 0 diferencias entre la compuerta vieja y la nueva (ninguna fila reclamable en ese
-- momento: la rama «true» se verificó por equivalencia del código, condición por
-- condición), ACL {postgres} intacta, fn_claim_voice_agent_calls con service_role
-- ejecuta igual, authenticated sin EXECUTE en las dos funciones nuevas.
--
-- Problema: `crm_voice_call_claim_gate` devuelve solo true/false. Cuando una
-- campaña en marcha no marca, el panel no puede decir POR QUÉ con el mismo
-- criterio con el que `fn_claim_voice_agent_calls` descarta cada fila; el
-- diagnóstico en TypeScript solo aproxima (no ve la concurrencia viva de
-- `crm_voice_live_slots`, que solo puede ejecutar `postgres`, ni los topes por
-- agente y por cliente).
--
-- Solución sin duplicar la regla (regla dura 7):
--   1. `crm_voice_call_claim_motivo(p_org, p_vac, p_bloquear)` contiene el
--      cuerpo de la compuerta, en el MISMO orden, y devuelve el código del
--      primer motivo que impide reclamar (NULL = se puede). Con
--      `p_bloquear = false` hace las mismas lecturas sin `for share` /
--      `for update` (diagnóstico de solo lectura, no compite con el despacho).
--   2. `crm_voice_call_claim_gate` pasa a ser `motivo(…, true) IS NULL`:
--      mismo resultado, misma firma, mismos bloqueos y mismos permisos.
--   3. `crm_voice_campana_bloqueos(p_org, p_campaign, p_limite)` agrupa las
--      filas pendientes de una campaña por motivo (cantidad y próxima hora
--      programada). Solo `service_role` (la ruta de diagnóstico ya valida la
--      organización de la sesión antes de usar el cliente de servicio).
--
-- Códigos: no_reclamable · ley2300_reprogramada · programada · agente_inactivo
-- · agente_voz_apagado · sin_politica_datos · sin_consentimiento ·
-- campana_no_activa · reserva_pendiente · sin_minutos · concurrencia ·
-- tope_diario · tope_hora · tope_cliente_dia. La interfaz los traduce
-- (`vozCampanasDisparo.chips.claim_*`); sin esta migración el panel sigue con
-- el diagnóstico de TypeScript.
--
-- Verificado por MCP el 2026-10-06 (solo SELECT): definiciones vivas de
-- `crm_voice_call_claim_gate` y `fn_claim_voice_agent_calls`; ACL de la
-- compuerta = {postgres}; `voice_agent_calls.last_error_code` existe y el
-- despachador escribe 'LEY2300' al reprogramar (voiceAgentService.dialClaimedCall).
-- Ensayo 2026-10-06 (bloque DO con este mismo cuerpo, termina en
-- raise 'ENSAYO_OK' y todo se revierte; comprobado después que ninguna función
-- nueva quedó y la compuerta conserva su md5 de prosrc 9bc16f16…):
--   filas=124 diferencias_gate=0 (la compuerta nueva da el mismo booleano que
--   la vieja en TODAS las filas de voice_agent_calls) · authenticated con
--   sesión de un miembro → 42501 en las dos funciones nuevas · service_role →
--   lee los bloqueos de la campaña en marcha (0 grupos: sin pendientes).
-- El cuerpo de la compuerta del rollback = prosrc vivo (md5 idéntico).
-- ============================================================================

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

revoke all on function public.crm_voice_call_claim_motivo(integer, uuid, boolean) from public, anon, authenticated;

comment on function public.crm_voice_call_claim_motivo(integer, uuid, boolean) is
  'Primer motivo por el que una fila de voice_agent_calls no se puede reclamar (NULL = se puede). Fuente única de la compuerta crm_voice_call_claim_gate; p_bloquear=false para diagnóstico sin bloqueos.';

-- La compuerta conserva firma, ACL ({postgres}) y resultado.
create or replace function public.crm_voice_call_claim_gate(p_org integer, p_vac uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
 return public.crm_voice_call_claim_motivo(p_org, p_vac, true) is null;
end;$function$;

create or replace function public.crm_voice_campana_bloqueos(p_org integer, p_campaign uuid, p_limite integer default 200)
returns table(motivo text, cantidad integer, proximo timestamptz)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
 perform public.fn_assert_acceso_org(p_org);
 return query
 with filas as (
  select v.id, v.scheduled_at from public.voice_agent_calls v
   where v.organization_id=p_org and v.campaign_id=p_campaign and v.status in ('pending','queued')
   order by v.scheduled_at nulls first, v.created_at, v.id
   limit least(greatest(coalesce(p_limite,200),1),500)
 ), evaluadas as (
  select public.crm_voice_call_claim_motivo(p_org, f.id, false) as m, f.scheduled_at as s from filas f
 )
 select e.m, count(*)::integer, min(e.s) from evaluadas e where e.m is not null group by e.m order by count(*) desc, e.m;
end;$function$;

revoke all on function public.crm_voice_campana_bloqueos(integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.crm_voice_campana_bloqueos(integer, uuid, integer) to service_role;

comment on function public.crm_voice_campana_bloqueos(integer, uuid, integer) is
  'Filas pendientes de una campaña de voz agrupadas por el motivo de crm_voice_call_claim_motivo (solo lectura, sin bloqueos). Solo service_role, con la organización ya validada.';
