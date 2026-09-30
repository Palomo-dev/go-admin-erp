-- CRM ola 1 · M6 — «Nuevo pipeline» transaccional (plan §4.3 y §7.3).
--
-- 44 de las 49 organizaciones con CRM activo no tienen embudo de ventas. Hoy
-- el pipeline y sus etapas se crean desde el navegador en varias llamadas
-- (PipelineHeader.tsx) o en la ruta de importar plantilla, en dos escrituras
-- sin transacción: si las etapas fallaban quedaba un pipeline a medias.
--
-- crm_create_pipeline_with_stages(p_org, p_data)
--   · exige crm.pipelines.manage (y el trigger de etapas, crm.stages.manage,
--     para las etapas ganadora/perdedora: los dos van juntos en D5);
--   · valida: nombre (único por organización), tipo sales|onboarding|renewal,
--     ≥ 1 etapa no terminal, ≥ 1 etapa ganadora, en ventas ≥ 1 perdedora,
--     ninguna ganadora y perdedora a la vez, probabilidades 0–100 y no
--     decrecientes entre etapas abiertas (orden por position);
--   · «por defecto»: si lo pide, o si es de ventas y la organización no tiene
--     ningún pipeline por defecto, queda por defecto y se quita el flag a los
--     demás de la organización;
--   · todo o nada.
-- crm_set_default_pipeline(p_org, p_id): marca el por defecto de la organización.
-- crm_delete_pipeline(p_org, p_id): se niega si tiene oportunidades (la FK de
--   opportunities.pipeline_id es ON DELETE CASCADE: borrarlo las borraría).
--
-- «Por defecto» es POR ORGANIZACIÓN, no por tipo: ya existe el índice único
-- parcial `unique_default_pipeline_per_org (organization_id) WHERE is_default`,
-- y el tablero (PipelineView) abre el pipeline por defecto de la organización.
-- Verificado por MCP el 2026-09-29: onboarding y renovación se crean siempre
-- con is_default = false (onboardingService, renewalService) y ninguna
-- organización tiene más de un por defecto. No se crea un índice por tipo:
-- sería más débil que el existente y contradiría su semántica.
--
-- Rollback: supabase/rollbacks/20260930160700_crm_ola1_pipeline_rpc_rollback.sql

create or replace function public.crm_create_pipeline_with_stages(p_org integer, p_data jsonb)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_name text := nullif(btrim(v_data ->> 'name'), '');
  v_type text := coalesce(nullif(btrim(v_data ->> 'pipeline_type'), ''), 'sales');
  v_default boolean := coalesce((v_data ->> 'is_default')::boolean, false);
  v_period text := coalesce(nullif(v_data ->> 'goal_period', ''), 'monthly');
  v_goal numeric := coalesce(nullif(v_data ->> 'goal_amount', '')::numeric, 0);
  v_stages jsonb := v_data -> 'stages';
  v_pipeline public.pipelines%rowtype;
  v_etapa jsonb;
  v_i integer := 0;
  v_won integer := 0;
  v_lost integer := 0;
  v_open integer := 0;
  v_prob integer;
  v_prev integer := -1;
begin
  perform public.fn_crm_exigir_permiso(p_org, array['crm.pipelines.manage']);

  if v_name is null or length(v_name) > 120 then
    raise exception 'nombre_invalido' using errcode = '22023';
  end if;
  if v_type not in ('sales', 'onboarding', 'renewal') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if v_period not in ('monthly', 'quarterly', 'yearly') then
    raise exception 'periodo_invalido' using errcode = '22023';
  end if;
  if v_goal < 0 then
    raise exception 'meta_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from pipelines p where p.organization_id = p_org and lower(p.name) = lower(v_name)) then
    raise exception 'nombre_duplicado' using errcode = '23505';
  end if;
  if jsonb_typeof(v_stages) is distinct from 'array' or jsonb_array_length(v_stages) = 0 then
    raise exception 'sin_etapas' using errcode = '22023';
  end if;

  -- Validación de etapas (en el orden del arreglo, que es el de position).
  for v_etapa in select value from jsonb_array_elements(v_stages) with ordinality order by coalesce((value ->> 'position')::integer, ordinality::integer) loop
    if nullif(btrim(v_etapa ->> 'name'), '') is null or length(btrim(v_etapa ->> 'name')) > 80 then
      raise exception 'etapa_sin_nombre' using errcode = '22023';
    end if;
    if coalesce((v_etapa ->> 'is_won')::boolean, false) and coalesce((v_etapa ->> 'is_lost')::boolean, false) then
      raise exception 'etapa_ganada_y_perdida' using errcode = '22023';
    end if;
    v_prob := coalesce(nullif(v_etapa ->> 'probability', '')::integer, 0);
    if v_prob < 0 or v_prob > 100 then
      raise exception 'probabilidad_invalida' using errcode = '22023';
    end if;
    if nullif(v_etapa ->> 'sla_days', '') is not null and (v_etapa ->> 'sla_days')::integer < 0 then
      raise exception 'sla_invalido' using errcode = '22023';
    end if;
    if coalesce((v_etapa ->> 'is_won')::boolean, false) then
      v_won := v_won + 1;
    elsif coalesce((v_etapa ->> 'is_lost')::boolean, false) then
      v_lost := v_lost + 1;
    else
      v_open := v_open + 1;
      if v_prob < v_prev then
        raise exception 'probabilidades_desordenadas' using errcode = '22023';
      end if;
      v_prev := v_prob;
    end if;
  end loop;
  if v_open = 0 then
    raise exception 'sin_etapa_abierta' using errcode = '22023';
  end if;
  if v_won = 0 then
    raise exception 'sin_etapa_ganada' using errcode = '22023';
  end if;
  if v_type = 'sales' and v_lost = 0 then
    raise exception 'sin_etapa_perdida' using errcode = '22023';
  end if;

  -- Un embudo de ventas en una organización sin pipeline por defecto → por defecto.
  if v_type = 'sales' and not exists (select 1 from pipelines p where p.organization_id = p_org and p.is_default is true) then
    v_default := true;
  end if;
  -- unique_default_pipeline_per_org: un solo por defecto por organización.
  if v_default then
    update pipelines
       set is_default = false, updated_at = now()
     where organization_id = p_org and is_default is true;
  end if;

  insert into pipelines (organization_id, name, pipeline_type, is_default, goal_amount, goal_period, goal_currency)
  values (p_org, v_name, v_type, v_default, v_goal, v_period, nullif(upper(btrim(v_data ->> 'goal_currency')), ''))
  returning * into v_pipeline;

  for v_etapa in select value from jsonb_array_elements(v_stages) with ordinality order by coalesce((value ->> 'position')::integer, ordinality::integer) loop
    v_i := v_i + 1;
    insert into stages (pipeline_id, name, position, probability, color, sla_days, exit_criteria, is_won, is_lost, description)
    values (
      v_pipeline.id,
      btrim(v_etapa ->> 'name'),
      v_i,
      coalesce(nullif(v_etapa ->> 'probability', '')::integer, 0),
      coalesce(nullif(v_etapa ->> 'color', ''), '#3b82f6'),
      nullif(v_etapa ->> 'sla_days', '')::integer,
      case when jsonb_typeof(v_etapa -> 'exit_criteria') in ('object', 'array') then v_etapa -> 'exit_criteria' end,
      coalesce((v_etapa ->> 'is_won')::boolean, false),
      coalesce((v_etapa ->> 'is_lost')::boolean, false),
      nullif(btrim(v_etapa ->> 'description'), '')
    );
  end loop;

  select * into v_pipeline from pipelines where id = v_pipeline.id;
  return jsonb_build_object(
    'pipeline', to_jsonb(v_pipeline),
    'stages', (select coalesce(jsonb_agg(to_jsonb(s) order by s.position), '[]'::jsonb) from stages s where s.pipeline_id = v_pipeline.id)
  );
end;
$$;

create or replace function public.crm_set_default_pipeline(p_org integer, p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pipeline public.pipelines%rowtype;
begin
  perform public.fn_crm_exigir_permiso(p_org, array['crm.pipelines.manage']);
  select * into v_pipeline from pipelines where id = p_id and organization_id = p_org for update;
  if not found then
    raise exception 'pipeline_no_encontrado' using errcode = 'P0002';
  end if;
  update pipelines
     set is_default = false, updated_at = now()
   where organization_id = p_org
     and is_default is true
     and id <> p_id;
  update pipelines set is_default = true, updated_at = now() where id = p_id;
  select * into v_pipeline from pipelines where id = p_id;
  return to_jsonb(v_pipeline);
end;
$$;

create or replace function public.crm_delete_pipeline(p_org integer, p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pipeline public.pipelines%rowtype;
  v_opps integer;
begin
  perform public.fn_crm_exigir_permiso(p_org, array['crm.pipelines.manage']);
  select * into v_pipeline from pipelines where id = p_id and organization_id = p_org for update;
  if not found then
    raise exception 'pipeline_no_encontrado' using errcode = 'P0002';
  end if;
  select count(*) into v_opps from opportunities where pipeline_id = p_id;
  if v_opps > 0 then
    raise exception 'pipeline_con_oportunidades' using errcode = 'P0001', detail = v_opps::text;
  end if;
  delete from stages where pipeline_id = p_id;
  delete from pipelines where id = p_id and organization_id = p_org;
  return jsonb_build_object('id', p_id, 'era_por_defecto', coalesce(v_pipeline.is_default, false));
end;
$$;

comment on function public.crm_create_pipeline_with_stages(integer, jsonb) is 'CRM ola 1 (M6): pipeline + etapas en una transacción, con validación de etapas y un solo por defecto por organización. Exige crm.pipelines.manage.';
comment on function public.crm_set_default_pipeline(integer, uuid) is 'CRM ola 1 (M6): marca el pipeline por defecto de la organización. Exige crm.pipelines.manage.';
comment on function public.crm_delete_pipeline(integer, uuid) is 'CRM ola 1 (M6): borra un pipeline SIN oportunidades. Exige crm.pipelines.manage.';

revoke all on function public.crm_create_pipeline_with_stages(integer, jsonb) from public, anon;
revoke all on function public.crm_set_default_pipeline(integer, uuid) from public, anon;
revoke all on function public.crm_delete_pipeline(integer, uuid) from public, anon;
grant execute on function public.crm_create_pipeline_with_stages(integer, jsonb) to authenticated, service_role;
grant execute on function public.crm_set_default_pipeline(integer, uuid) to authenticated, service_role;
grant execute on function public.crm_delete_pipeline(integer, uuid) to authenticated, service_role;
