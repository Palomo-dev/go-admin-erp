-- CRM › Agentes IA: métricas del listado y del detalle del agente (Figma 1298:84133 y 1311:86823).
--
-- Una sola función agrega en SQL (no en Node) lo que piden las dos pantallas:
--   * por agente: llamadas, contestadas y reuniones agendadas en la ventana;
--   * totales de la ventana y de la ventana anterior (para «+12 % frente a…»);
--   * créditos de voz cobrados desde `p_mes_desde` y el saldo de `ai_settings`;
--   * etapas asignadas (stage_agents + stages) con su política (auto | suggest);
--   * con `p_voice_agent_id`: desenlaces por estado, herramientas usadas y las
--     últimas llamadas con cliente, origen (etapa o campaña), duración y resultado.
--
-- SECURITY INVOKER: corre con la sesión del usuario, así que RLS de
-- voice_agent_calls, voice_agent_tool_runs, stage_agents y ai_settings limita
-- todo a las organizaciones de las que es miembro. El filtro por
-- `p_organization_id` es además explícito. Cerrada a anon (política 20261104053000).
--
-- «Llamadas» excluye las que nunca salieron (pending, queued, canceled).
-- «Contacto efectivo» = status completed (el buzón no cuenta).
-- «Agendadas» = resultado cita_agendada.

create or replace function public.crm_voice_agents_metricas(
  p_organization_id integer,
  p_dias integer default 7,
  p_voice_agent_id uuid default null,
  p_mes_desde timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 365))) as desde,
      now() - make_interval(days => 2 * greatest(1, least(coalesce(p_dias, 7), 365))) as desde_previo,
      coalesce(p_mes_desde, date_trunc('month', now())) as mes_desde
  ),
  llamadas as (
    select c.*, coalesce(c.started_at, c.created_at) as momento
      from voice_agent_calls c
     where c.organization_id = p_organization_id
       and c.status not in ('pending', 'queued', 'canceled')
       and (p_voice_agent_id is null or c.voice_agent_id = p_voice_agent_id)
  ),
  ventana as (
    select l.* from llamadas l, params p where l.momento >= p.desde
  ),
  previa as (
    select count(*)::int as n from llamadas l, params p where l.momento >= p.desde_previo and l.momento < p.desde
  ),
  por_agente as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'voice_agent_id', a.voice_agent_id,
             'llamadas', a.llamadas,
             'contestadas', a.contestadas,
             'agendadas', a.agendadas) order by a.voice_agent_id), '[]'::jsonb) as j
      from (
        select voice_agent_id,
               count(*)::int as llamadas,
               count(*) filter (where status = 'completed')::int as contestadas,
               count(*) filter (where resultado = 'cita_agendada')::int as agendadas
          from ventana
         where voice_agent_id is not null
         group by voice_agent_id
      ) a
  ),
  totales as (
    select jsonb_build_object(
      'llamadas', (select count(*)::int from ventana),
      'contestadas', (select count(*) filter (where status = 'completed')::int from ventana),
      'agendadas', (select count(*) filter (where resultado = 'cita_agendada')::int from ventana),
      'llamadas_previas', (select n from previa),
      'duracion_media_segundos', (select round(avg(duration_seconds))::int from ventana where status = 'completed' and duration_seconds > 0),
      'creditos_ventana', (select coalesce(sum(credits_reserved), 0)::int from ventana where credits_settled_at is not null),
      'creditos_mes', (select coalesce(sum(l.credits_reserved), 0)::int from llamadas l, params p
                        where l.credits_settled_at is not null and l.credits_settled_at >= p.mes_desde),
      'creditos_restantes', (select s.credits_remaining from ai_settings s where s.organization_id = p_organization_id)
    ) as j
  ),
  etapas as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'voice_agent_id', sa.voice_agent_id,
             'stage_id', sa.stage_id,
             'etapa', st.name,
             'posicion', st.position,
             'action_policy', sa.action_policy,
             'is_active', sa.is_active) order by sa.voice_agent_id, st.position), '[]'::jsonb) as j
      from stage_agents sa
      join stages st on st.id = sa.stage_id
     where sa.organization_id = p_organization_id
       and sa.voice_agent_id is not null
       and (p_voice_agent_id is null or sa.voice_agent_id = p_voice_agent_id)
  ),
  estados as (
    select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'n', e.n) order by e.n desc), '[]'::jsonb) as j
      from (select status, count(*)::int as n from ventana where p_voice_agent_id is not null group by status) e
  ),
  herramientas as (
    select coalesce(jsonb_agg(jsonb_build_object('tool', h.tool, 'n', h.n, 'status', h.status) order by h.n desc), '[]'::jsonb) as j
      from (
        select r.tool,
               count(*)::int as n,
               mode() within group (order by r.status) as status
          from voice_agent_tool_runs r
          join ventana v on v.id = r.voice_agent_call_id
         where p_voice_agent_id is not null
           and r.organization_id = p_organization_id
         group by r.tool
      ) h
  ),
  recientes as (
    select coalesce(jsonb_agg(x.fila order by x.momento desc), '[]'::jsonb) as j
      from (
        select v.momento,
               jsonb_build_object(
                 'id', v.id,
                 'call_id', v.call_id,
                 'cliente', cu.full_name,
                 'customer_id', v.customer_id,
                 'etapa', st.name,
                 'campana', ca.name,
                 'status', v.status,
                 'resultado', v.resultado,
                 'duracion_segundos', v.duration_seconds,
                 'momento', v.momento) as fila
          from ventana v
          left join customers cu on cu.id = v.customer_id
          left join stage_agents sa on sa.id = v.stage_agent_id
          left join stages st on st.id = sa.stage_id
          left join voice_agent_campaigns ca on ca.id = v.campaign_id
         where p_voice_agent_id is not null
         order by v.momento desc
         limit 20
      ) x
  )
  select jsonb_build_object(
    'por_agente', (select j from por_agente),
    'totales', (select j from totales),
    'etapas', (select j from etapas),
    'estados', (select j from estados),
    'herramientas', (select j from herramientas),
    'llamadas', (select j from recientes)
  );
$$;

comment on function public.crm_voice_agents_metricas(integer, integer, uuid, timestamptz) is
  'CRM › Agentes IA: métricas del listado (por agente) y del detalle (desenlaces, herramientas, últimas llamadas). SECURITY INVOKER: RLS limita a la organización del usuario.';

revoke all on function public.crm_voice_agents_metricas(integer, integer, uuid, timestamptz) from public, anon;
grant execute on function public.crm_voice_agents_metricas(integer, integer, uuid, timestamptz) to authenticated, service_role;
