-- PROPUESTA NO APLICADA. Restaura definición y ACL exactas; conserva oportunidades y vínculos creados.
CREATE OR REPLACE FUNCTION public.crm_create_opportunity(p_org integer, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_origen text := coalesce(nullif(btrim(v_data ->> 'origen'), ''), 'general');
  v_customer uuid;
  v_pipeline uuid;
  v_stage uuid;
  v_terminal boolean;
  v_opp public.opportunities%rowtype;
  v_meta jsonb;
begin
  perform public.fn_crm_exigir_permiso(p_org, array['crm.opportunities.create']);

  if nullif(btrim(v_data ->> 'name'), '') is null then
    raise exception 'nombre_obligatorio' using errcode = '22023';
  end if;
  if v_origen not in ('general', 'cliente', 'factura', 'conversacion', 'lead') then
    raise exception 'origen_invalido' using errcode = '22023';
  end if;
  perform public.fn_crm_opp_validar_campos(p_org, v_data);

  v_customer := public.fn_crm_uuid_o_null(v_data ->> 'customer_id');
  if v_origen in ('cliente', 'lead') and v_customer is null then
    raise exception 'cliente_obligatorio' using errcode = '22023';
  end if;

  -- Pipeline: el indicado (de la organización) o el de ventas por defecto.
  v_pipeline := public.fn_crm_uuid_o_null(v_data ->> 'pipeline_id');
  if v_pipeline is not null then
    if not exists (select 1 from pipelines p where p.id = v_pipeline and p.organization_id = p_org) then
      raise exception 'pipeline_no_encontrado' using errcode = 'P0002';
    end if;
  else
    select p.id into v_pipeline
      from pipelines p
     where p.organization_id = p_org
       and coalesce(p.pipeline_type, 'sales') = 'sales'
     order by (p.is_default is true) desc, p.created_at asc, p.id asc
     limit 1;
    if v_pipeline is null then
      raise exception 'sin_embudo_ventas' using errcode = 'P0001';
    end if;
  end if;

  -- Etapa: la indicada (no terminal) o la primera no terminal.
  v_stage := public.fn_crm_uuid_o_null(v_data ->> 'stage_id');
  if v_stage is not null then
    select coalesce(s.is_won, false) or coalesce(s.is_lost, false) into v_terminal
      from stages s where s.id = v_stage and s.pipeline_id = v_pipeline;
    if not found then
      raise exception 'etapa_no_encontrada' using errcode = 'P0002';
    end if;
    if v_terminal then
      raise exception 'etapa_terminal' using errcode = '22023';
    end if;
  else
    select s.id into v_stage
      from stages s
     where s.pipeline_id = v_pipeline
       and not coalesce(s.is_won, false) and not coalesce(s.is_lost, false)
     order by s.position asc, s.created_at asc nulls last, s.id asc
     limit 1;
    if v_stage is null then
      raise exception 'pipeline_sin_etapas' using errcode = 'P0001';
    end if;
  end if;

  v_meta := coalesce(case when jsonb_typeof(v_data -> 'metadata') = 'object' then v_data -> 'metadata' end, '{}'::jsonb)
            || jsonb_build_object('origen', v_origen)
            || case when v_data ? 'origen_ref' then jsonb_build_object('origen_ref', v_data -> 'origen_ref') else '{}'::jsonb end;

  insert into opportunities (
    organization_id, pipeline_id, stage_id, customer_id, name, amount, currency,
    expected_close_date, status, record_type, source, deal_type, salesperson_id,
    temperature, next_contact_at, next_action, commission_type, commission_rate,
    branch_id, vertical_id, sales_team_id, territory_id, billing_cycle_months,
    discovery_data, metadata, created_by
  ) values (
    p_org, v_pipeline, v_stage, v_customer, btrim(v_data ->> 'name'),
    coalesce(nullif(v_data ->> 'amount', '')::numeric, 0),
    nullif(upper(btrim(v_data ->> 'currency')), ''),
    nullif(v_data ->> 'expected_close_date', '')::date,
    'open', 'deal',
    nullif(btrim(v_data ->> 'source'), ''),
    nullif(btrim(v_data ->> 'deal_type'), ''),
    public.fn_crm_uuid_o_null(v_data ->> 'salesperson_id'),
    nullif(v_data ->> 'temperature', ''),
    nullif(v_data ->> 'next_contact_at', '')::timestamptz,
    nullif(btrim(v_data ->> 'next_action'), ''),
    coalesce(nullif(v_data ->> 'commission_type', ''), 'none'),
    coalesce(nullif(v_data ->> 'commission_rate', '')::numeric, 0),
    nullif(v_data ->> 'branch_id', '')::bigint,
    public.fn_crm_uuid_o_null(v_data ->> 'vertical_id'),
    public.fn_crm_uuid_o_null(v_data ->> 'sales_team_id'),
    public.fn_crm_uuid_o_null(v_data ->> 'territory_id'),
    nullif(v_data ->> 'billing_cycle_months', '')::integer,
    coalesce(case when jsonb_typeof(v_data -> 'discovery_data') = 'object' then v_data -> 'discovery_data' end, '{}'::jsonb),
    v_meta,
    v_uid
  )
  returning * into v_opp;

  perform public.fn_crm_opp_lineas_aplicar(p_org, v_opp.id, v_data);

  insert into activities (organization_id, activity_type, user_id, notes, related_type, related_id, occurred_at, metadata)
  values (
    p_org, 'system', v_uid,
    case when v_origen = 'lead' then 'Oportunidad creada desde lead' else 'Oportunidad creada' end,
    'opportunity', v_opp.id, now(),
    jsonb_build_object('source', 'crm_create_opportunity', 'origen', v_origen, 'customer_id', v_customer)
  );

  if v_origen = 'lead' then
    update customers
       set lead_discarded_at = null, lead_discard_reason = null, lead_discarded_by = null
     where id = v_customer and organization_id = p_org and lead_discarded_at is not null;
    update referrals
       set opportunity_id = v_opp.id
     where organization_id = p_org
       and referred_customer_id = v_customer
       and opportunity_id is null
       and status = 'converted';
  end if;

  select * into v_opp from opportunities where id = v_opp.id;
  return to_jsonb(v_opp);
end;
$function$;
revoke all on function public.crm_create_opportunity(integer,jsonb) from public, anon;
grant execute on function public.crm_create_opportunity(integer,jsonb) to authenticated, service_role;
