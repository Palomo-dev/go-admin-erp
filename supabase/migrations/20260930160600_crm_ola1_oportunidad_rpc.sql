-- CRM ola 1 · M4 — RPC transaccionales de oportunidad (plan §4.7 y §7.3).
--
-- Hasta hoy la oportunidad se creaba, editaba y borraba desde el navegador
-- (`opportunitiesService.ts`, N llamadas sin transacción ni permisos). Estas
-- RPC son la escritura canónica; las usan POST/PATCH/DELETE
-- /api/crm/opportunities y POST /api/crm/leads/[id]/qualify.
--
-- crm_create_opportunity(p_org, p_data)
--   · exige crm.opportunities.create;
--   · record_type SIEMPRE 'deal' (D2: no nacen oportunidades 'lead');
--   · pipeline: el indicado (de la organización) o el de VENTAS por defecto
--     (mismo orden que web_capture_lead); sin él → 'sin_embudo_ventas';
--   · etapa: la indicada (del pipeline, no terminal) o la primera no terminal;
--   · moneda NULL → la pone trg_00_moneda_base_por_defecto;
--   · líneas de producto y líneas libres en la misma transacción;
--   · actividad 'system' «Oportunidad creada» (o «… desde lead»);
--   · origen 'lead': reactiva el lead si estaba descartado y enlaza el
--     referido convertido que aún no tenía oportunidad.
--   · El ciclo de vida del cliente y la etapa inicial del historial los
--     escriben los triggers de 20260930160500.
-- crm_update_opportunity(p_org, p_id, p_data, p_expected_updated_at)
--   · exige crm.opportunities.edit y que sea PROPIA (responsable o creador) o
--     crm.opportunities.edit_any; reasignar a otro exige edit_any;
--   · etapa, estado, pipeline, record_type y datos de cierre NO se editan
--     aquí (van por PATCH …/stage, /win y /lose);
--   · metadata y discovery_data se FUSIONAN; líneas por diferencia (las que
--     no vienen se borran, las que traen id se actualizan, el resto se crea);
--   · bloqueo optimista opcional por updated_at → 'conflicto' (40001).
-- crm_delete_opportunity(p_org, p_id)   SECURITY DEFINER
--   · exige crm.opportunities.delete (+ propia o edit_any);
--   · se niega si está ganada o tiene factura, cotización, venta o comisión;
--   · limpia notas, tareas, actividades e historial de la oportunidad.
--
-- Errores (la ruta los traduce): 42501 sin_permiso/no_es_propia →403,
-- P0002 *_no_encontrad* →404, 22023 validación →400, P0001
-- sin_embudo_ventas/pipeline_sin_etapas/con_documentos/ganada →409,
-- 40001 conflicto →409.
--
-- Rollback: supabase/rollbacks/20260930160600_crm_ola1_oportunidad_rpc_rollback.sql

-- ── helpers ─────────────────────────────────────────────────────────────────
create or replace function public.fn_crm_uuid_o_null(p_valor text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_valor is null or btrim(p_valor) = '' then
    return null;
  end if;
  return btrim(p_valor)::uuid;
exception when invalid_text_representation then
  raise exception 'uuid_invalido' using errcode = '22023', detail = p_valor;
end;
$$;

-- Líneas de producto y libres de una oportunidad (por diferencia).
create or replace function public.fn_crm_opp_lineas_aplicar(p_org integer, p_opp uuid, p_data jsonb)
returns void
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_linea jsonb;
  v_id uuid;
  v_ids uuid[];
  v_producto integer;
begin
  if jsonb_typeof(p_data -> 'products') = 'array' then
    v_ids := array(
      select public.fn_crm_uuid_o_null(x ->> 'id')
        from jsonb_array_elements(p_data -> 'products') x
       where nullif(x ->> 'id', '') is not null
    );
    delete from opportunity_products
     where opportunity_id = p_opp and not (id = any (coalesce(v_ids, array[]::uuid[])));
    for v_linea in select * from jsonb_array_elements(p_data -> 'products') loop
      v_producto := nullif(v_linea ->> 'product_id', '')::integer;
      if v_producto is null or not exists (
        select 1 from products p where p.id = v_producto and p.organization_id = p_org
      ) then
        raise exception 'producto_no_encontrado' using errcode = 'P0002', detail = coalesce(v_linea ->> 'product_id', '');
      end if;
      if coalesce((v_linea ->> 'quantity')::numeric, 1) <= 0 or coalesce((v_linea ->> 'unit_price')::numeric, 0) < 0 then
        raise exception 'linea_invalida' using errcode = '22023';
      end if;
      v_id := public.fn_crm_uuid_o_null(v_linea ->> 'id');
      if v_id is not null then
        update opportunity_products
           set product_id = v_producto,
               quantity = coalesce((v_linea ->> 'quantity')::numeric, 1),
               unit_price = coalesce((v_linea ->> 'unit_price')::numeric, 0),
               updated_at = now()
         where id = v_id and opportunity_id = p_opp;
        if not found then
          raise exception 'linea_no_encontrada' using errcode = 'P0002', detail = v_id::text;
        end if;
      else
        insert into opportunity_products (opportunity_id, product_id, quantity, unit_price)
        values (p_opp, v_producto, coalesce((v_linea ->> 'quantity')::numeric, 1), coalesce((v_linea ->> 'unit_price')::numeric, 0));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_data -> 'custom_lines') = 'array' then
    v_ids := array(
      select public.fn_crm_uuid_o_null(x ->> 'id')
        from jsonb_array_elements(p_data -> 'custom_lines') x
       where nullif(x ->> 'id', '') is not null
    );
    delete from opportunity_custom_lines
     where opportunity_id = p_opp and not (id = any (coalesce(v_ids, array[]::uuid[])));
    for v_linea in select * from jsonb_array_elements(p_data -> 'custom_lines') loop
      if nullif(btrim(v_linea ->> 'concept'), '') is null
         or coalesce((v_linea ->> 'quantity')::numeric, 1) <= 0
         or coalesce((v_linea ->> 'unit_price')::numeric, 0) < 0 then
        raise exception 'linea_invalida' using errcode = '22023';
      end if;
      v_id := public.fn_crm_uuid_o_null(v_linea ->> 'id');
      if v_id is not null then
        update opportunity_custom_lines
           set concept = btrim(v_linea ->> 'concept'),
               quantity = coalesce((v_linea ->> 'quantity')::numeric, 1),
               unit_price = coalesce((v_linea ->> 'unit_price')::numeric, 0),
               updated_at = now()
         where id = v_id and opportunity_id = p_opp;
        if not found then
          raise exception 'linea_no_encontrada' using errcode = 'P0002', detail = v_id::text;
        end if;
      else
        insert into opportunity_custom_lines (opportunity_id, concept, quantity, unit_price)
        values (p_opp, btrim(v_linea ->> 'concept'), coalesce((v_linea ->> 'quantity')::numeric, 1), coalesce((v_linea ->> 'unit_price')::numeric, 0));
      end if;
    end loop;
  end if;
end;
$$;

-- Validaciones comunes de alta y edición (lanzan 22023 / P0002).
create or replace function public.fn_crm_opp_validar_campos(p_org integer, p_data jsonb)
returns void
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uuid uuid;
begin
  if p_data ? 'name' and (nullif(btrim(p_data ->> 'name'), '') is null or length(btrim(p_data ->> 'name')) > 255) then
    raise exception 'nombre_invalido' using errcode = '22023';
  end if;
  if nullif(p_data ->> 'amount', '') is not null and (p_data ->> 'amount')::numeric < 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;
  if nullif(p_data ->> 'currency', '') is not null and upper(btrim(p_data ->> 'currency')) !~ '^[A-Z]{3}$' then
    raise exception 'moneda_invalida' using errcode = '22023';
  end if;
  if nullif(p_data ->> 'temperature', '') is not null and p_data ->> 'temperature' not in ('cold', 'warm', 'hot') then
    raise exception 'temperatura_invalida' using errcode = '22023';
  end if;
  if nullif(p_data ->> 'commission_rate', '') is not null
     and ((p_data ->> 'commission_rate')::numeric < 0 or (p_data ->> 'commission_rate')::numeric > 100) then
    raise exception 'comision_invalida' using errcode = '22023';
  end if;
  v_uuid := public.fn_crm_uuid_o_null(p_data ->> 'customer_id');
  if v_uuid is not null and not exists (select 1 from customers c where c.id = v_uuid and c.organization_id = p_org) then
    raise exception 'cliente_no_encontrado' using errcode = 'P0002';
  end if;
  v_uuid := public.fn_crm_uuid_o_null(p_data ->> 'salesperson_id');
  if v_uuid is not null and not exists (
    select 1 from organization_members om where om.user_id = v_uuid and om.organization_id = p_org and om.is_active
  ) then
    raise exception 'responsable_no_miembro' using errcode = '22023';
  end if;
  if nullif(p_data ->> 'branch_id', '') is not null and not exists (
    select 1 from branches b where b.id = (p_data ->> 'branch_id')::bigint and b.organization_id = p_org
  ) then
    raise exception 'sucursal_no_encontrada' using errcode = 'P0002';
  end if;
  v_uuid := public.fn_crm_uuid_o_null(p_data ->> 'vertical_id');
  if v_uuid is not null and not exists (select 1 from verticals v where v.id = v_uuid and v.organization_id = p_org) then
    raise exception 'vertical_no_encontrada' using errcode = 'P0002';
  end if;
  v_uuid := public.fn_crm_uuid_o_null(p_data ->> 'sales_team_id');
  if v_uuid is not null and not exists (select 1 from sales_teams t where t.id = v_uuid and t.organization_id = p_org) then
    raise exception 'equipo_no_encontrado' using errcode = 'P0002';
  end if;
  v_uuid := public.fn_crm_uuid_o_null(p_data ->> 'territory_id');
  if v_uuid is not null and not exists (select 1 from territories t where t.id = v_uuid and t.organization_id = p_org) then
    raise exception 'territorio_no_encontrado' using errcode = 'P0002';
  end if;
end;
$$;

-- ── Alta ────────────────────────────────────────────────────────────────────
create or replace function public.crm_create_opportunity(p_org integer, p_data jsonb)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
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
$$;

-- ── Edición ─────────────────────────────────────────────────────────────────
create or replace function public.crm_update_opportunity(p_org integer, p_id uuid, p_data jsonb, p_expected_updated_at timestamptz default null)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_opp public.opportunities%rowtype;
  v_edit_any boolean;
  v_nuevo_resp uuid;
  v_nuevo_cliente uuid;
begin
  perform public.fn_crm_exigir_permiso(p_org, array['crm.opportunities.edit', 'crm.opportunities.edit_any']);

  select * into v_opp from opportunities where id = p_id and organization_id = p_org for update;
  if not found then
    raise exception 'oportunidad_no_encontrada' using errcode = 'P0002';
  end if;

  v_edit_any := public.fn_crm_tiene_permiso(p_org, 'crm.opportunities.edit_any');
  if v_uid is not null and not v_edit_any
     and v_opp.salesperson_id is distinct from v_uid and v_opp.created_by is distinct from v_uid then
    raise exception 'no_es_propia' using errcode = '42501';
  end if;
  if p_expected_updated_at is not null and v_opp.updated_at is distinct from p_expected_updated_at then
    raise exception 'conflicto' using errcode = '40001';
  end if;
  if v_data ?| array['stage_id', 'status', 'pipeline_id', 'record_type', 'win_data', 'closed_at',
                     'loss_reason', 'loss_reason_value', 'organization_id', 'created_by'] then
    raise exception 'campo_no_editable' using errcode = '22023';
  end if;
  perform public.fn_crm_opp_validar_campos(p_org, v_data);

  if v_data ? 'salesperson_id' then
    v_nuevo_resp := public.fn_crm_uuid_o_null(v_data ->> 'salesperson_id');
    if v_uid is not null and not v_edit_any
       and v_nuevo_resp is distinct from v_opp.salesperson_id and v_nuevo_resp is distinct from v_uid then
      raise exception 'reasignar_requiere_permiso' using errcode = '42501';
    end if;
  end if;
  v_nuevo_cliente := case when v_data ? 'customer_id' then public.fn_crm_uuid_o_null(v_data ->> 'customer_id') else v_opp.customer_id end;

  update opportunities o set
    name = case when v_data ? 'name' then btrim(v_data ->> 'name') else o.name end,
    customer_id = v_nuevo_cliente,
    amount = case when v_data ? 'amount' then coalesce(nullif(v_data ->> 'amount', '')::numeric, 0) else o.amount end,
    currency = case when v_data ? 'currency' and nullif(v_data ->> 'currency', '') is not null then upper(btrim(v_data ->> 'currency')) else o.currency end,
    expected_close_date = case when v_data ? 'expected_close_date' then nullif(v_data ->> 'expected_close_date', '')::date else o.expected_close_date end,
    source = case when v_data ? 'source' then nullif(btrim(v_data ->> 'source'), '') else o.source end,
    deal_type = case when v_data ? 'deal_type' then nullif(btrim(v_data ->> 'deal_type'), '') else o.deal_type end,
    salesperson_id = case when v_data ? 'salesperson_id' then v_nuevo_resp else o.salesperson_id end,
    temperature = case when v_data ? 'temperature' then nullif(v_data ->> 'temperature', '') else o.temperature end,
    next_contact_at = case when v_data ? 'next_contact_at' then nullif(v_data ->> 'next_contact_at', '')::timestamptz else o.next_contact_at end,
    next_action = case when v_data ? 'next_action' then nullif(btrim(v_data ->> 'next_action'), '') else o.next_action end,
    commission_type = case when v_data ? 'commission_type' then coalesce(nullif(v_data ->> 'commission_type', ''), 'none') else o.commission_type end,
    commission_rate = case when v_data ? 'commission_rate' then coalesce(nullif(v_data ->> 'commission_rate', '')::numeric, 0) else o.commission_rate end,
    branch_id = case when v_data ? 'branch_id' then nullif(v_data ->> 'branch_id', '')::bigint else o.branch_id end,
    vertical_id = case when v_data ? 'vertical_id' then public.fn_crm_uuid_o_null(v_data ->> 'vertical_id') else o.vertical_id end,
    sales_team_id = case when v_data ? 'sales_team_id' then public.fn_crm_uuid_o_null(v_data ->> 'sales_team_id') else o.sales_team_id end,
    territory_id = case when v_data ? 'territory_id' then public.fn_crm_uuid_o_null(v_data ->> 'territory_id') else o.territory_id end,
    billing_cycle_months = case when v_data ? 'billing_cycle_months' then nullif(v_data ->> 'billing_cycle_months', '')::integer else o.billing_cycle_months end,
    discovery_data = case when jsonb_typeof(v_data -> 'discovery_data') = 'object' then coalesce(o.discovery_data, '{}'::jsonb) || (v_data -> 'discovery_data') else o.discovery_data end,
    metadata = case when jsonb_typeof(v_data -> 'metadata') = 'object' then coalesce(o.metadata, '{}'::jsonb) || (v_data -> 'metadata') else o.metadata end,
    updated_at = now()
  where o.id = p_id and o.organization_id = p_org;

  perform public.fn_crm_opp_lineas_aplicar(p_org, p_id, v_data);

  if v_nuevo_cliente is distinct from v_opp.customer_id then
    insert into activities (organization_id, activity_type, user_id, notes, related_type, related_id, occurred_at, metadata)
    values (p_org, 'system', v_uid,
            case when v_nuevo_cliente is null then 'Cliente desvinculado' else 'Cliente vinculado' end,
            'opportunity', p_id, now(),
            jsonb_build_object('source', 'crm_update_opportunity', 'customer_id', v_nuevo_cliente, 'previous_customer_id', v_opp.customer_id));
  end if;

  select * into v_opp from opportunities where id = p_id;
  return to_jsonb(v_opp);
end;
$$;

-- ── Borrado ─────────────────────────────────────────────────────────────────
create or replace function public.crm_delete_opportunity(p_org integer, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_opp public.opportunities%rowtype;
  v_notas integer;
  v_tareas integer;
  v_actividades integer;
begin
  perform public.fn_crm_exigir_permiso(p_org, array['crm.opportunities.delete']);

  select * into v_opp from opportunities where id = p_id and organization_id = p_org for update;
  if not found then
    raise exception 'oportunidad_no_encontrada' using errcode = 'P0002';
  end if;
  if v_uid is not null and not public.fn_crm_tiene_permiso(p_org, 'crm.opportunities.edit_any')
     and v_opp.salesperson_id is distinct from v_uid and v_opp.created_by is distinct from v_uid then
    raise exception 'no_es_propia' using errcode = '42501';
  end if;
  if v_opp.status = 'won' then
    raise exception 'oportunidad_ganada' using errcode = 'P0001';
  end if;
  if exists (select 1 from invoice_sales where opportunity_id = p_id)
     or exists (select 1 from quotations where opportunity_id = p_id)
     or exists (select 1 from sales where opportunity_id = p_id)
     or exists (select 1 from commissions where source_type = 'opportunity' and source_id = p_id::text) then
    raise exception 'con_documentos' using errcode = 'P0001';
  end if;

  delete from notes where organization_id = p_org and related_type = 'opportunity' and related_id = p_id;
  get diagnostics v_notas = row_count;
  delete from tasks where organization_id = p_org and related_to_type = 'opportunity' and related_to_id = p_id;
  get diagnostics v_tareas = row_count;
  delete from activities where organization_id = p_org and related_type = 'opportunity' and related_id = p_id;
  get diagnostics v_actividades = row_count;
  delete from opportunity_stage_history where opportunity_id = p_id;
  delete from opportunities where id = p_id and organization_id = p_org;

  return jsonb_build_object('id', p_id, 'notas', v_notas, 'tareas', v_tareas, 'actividades', v_actividades);
end;
$$;

comment on function public.crm_create_opportunity(integer, jsonb) is 'CRM ola 1 (M4): alta transaccional de oportunidad (record_type deal) con líneas y actividad. Exige crm.opportunities.create.';
comment on function public.crm_update_opportunity(integer, uuid, jsonb, timestamptz) is 'CRM ola 1 (M4): edición transaccional (propia o edit_any), metadata fusionada y líneas por diferencia. La etapa va por PATCH …/stage.';
comment on function public.crm_delete_opportunity(integer, uuid) is 'CRM ola 1 (M4): borrado con guarda (ganada o con documentos → no) y limpieza de notas, tareas, actividades e historial.';

revoke all on function public.fn_crm_uuid_o_null(text) from public, anon;
revoke all on function public.fn_crm_opp_lineas_aplicar(integer, uuid, jsonb) from public, anon;
revoke all on function public.fn_crm_opp_validar_campos(integer, jsonb) from public, anon;
revoke all on function public.crm_create_opportunity(integer, jsonb) from public, anon;
revoke all on function public.crm_update_opportunity(integer, uuid, jsonb, timestamptz) from public, anon;
revoke all on function public.crm_delete_opportunity(integer, uuid) from public, anon;
grant execute on function public.fn_crm_uuid_o_null(text) to authenticated, service_role;
grant execute on function public.fn_crm_opp_lineas_aplicar(integer, uuid, jsonb) to authenticated, service_role;
grant execute on function public.fn_crm_opp_validar_campos(integer, jsonb) to authenticated, service_role;
grant execute on function public.crm_create_opportunity(integer, jsonb) to authenticated, service_role;
grant execute on function public.crm_update_opportunity(integer, uuid, jsonb, timestamptz) to authenticated, service_role;
grant execute on function public.crm_delete_opportunity(integer, uuid) to authenticated, service_role;
