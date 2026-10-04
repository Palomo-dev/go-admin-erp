-- PROPUESTA NO APLICADA. Definición anterior capturada por MCP; mismo núcleo INVOKER.
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
  v_ref jsonb;
  v_ref_tipo text;
  v_ref_id uuid;
  v_ref_stamp timestamptz;
  v_link uuid;
  v_origen_huella text;
  v_doc jsonb;
  v_items jsonb;
  v_channel text;
  v_meta_chat jsonb;
begin
  perform public.fn_crm_exigir_permiso(p_org, array['crm.opportunities.create']);

  if nullif(btrim(v_data ->> 'name'), '') is null then
    raise exception 'nombre_obligatorio' using errcode = '22023';
  end if;
  if v_origen not in ('general', 'cliente', 'factura', 'conversacion', 'lead') then
    raise exception 'origen_invalido' using errcode = '22023';
  end if;
  -- Una única fila de origen serializa los reintentos de Finanzas/Chat.
  -- INVOKER: conserva RLS de organización y sucursal; no eleva privilegios.
  if v_origen in ('factura', 'conversacion') then
    if auth.uid() is null then raise exception 'sesion_requerida' using errcode = '42501'; end if;
    v_ref := v_data -> 'origen_ref';
    if jsonb_typeof(v_ref) is distinct from 'object' then
      raise exception 'origen_ref_invalido' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_object_keys(v_ref)) <> 3
       or not (v_ref ?& array['tipo', 'id', 'updated_at'])
       or jsonb_typeof(v_ref -> 'tipo') is distinct from 'string'
       or jsonb_typeof(v_ref -> 'id') is distinct from 'string'
       or jsonb_typeof(v_ref -> 'updated_at') is distinct from 'string' then
      raise exception 'origen_ref_invalido' using errcode = '22023';
    end if;
    v_ref_tipo := v_ref ->> 'tipo';
    v_ref_id := public.fn_crm_uuid_o_null(v_ref ->> 'id');
    if v_ref_id is null or nullif(v_ref ->> 'updated_at', '') is null then
      raise exception 'origen_ref_invalido' using errcode = '22023';
    end if;
    begin
      v_ref_stamp := (v_ref ->> 'updated_at')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'origen_ref_invalido' using errcode = '22023';
    end;
    v_origen_huella := encode(extensions.digest(v_data::text, 'sha256'), 'hex');
    if v_origen = 'factura' then
      perform public.fn_crm_exigir_permiso(p_org, array['finance.view']);
      if v_ref_tipo = 'factura' then
        select to_jsonb(f), f.opportunity_id into v_doc, v_link
          from public.invoice_sales f where f.id = v_ref_id and f.organization_id = p_org for update;
      elsif v_ref_tipo = 'cotizacion' then
        select to_jsonb(q), q.opportunity_id into v_doc, v_link
          from public.quotations q where q.id = v_ref_id and q.organization_id = p_org for update;
      else raise exception 'origen_ref_invalido' using errcode = '22023';
      end if;
    else
      if v_ref_tipo is distinct from 'conversacion' then raise exception 'origen_ref_invalido' using errcode = '22023'; end if;
      select to_jsonb(c), public.fn_crm_uuid_o_null(c.metadata ->> 'opportunity_id')
        into v_doc, v_link from public.conversations c
       where c.id = v_ref_id and c.organization_id = p_org for update;
    end if;
    if v_doc is null then raise exception 'origen_no_encontrado' using errcode = 'P0002'; end if;
    if public.app_branch_access(nullif(v_doc ->> 'branch_id', '')::integer) is not true then
      raise exception 'sucursal_sin_acceso' using errcode = '42501';
    end if;
    if v_link is not null then
      select * into v_opp from public.opportunities
       where id = v_link and organization_id = p_org and customer_id = (v_doc ->> 'customer_id')::uuid;
      if not found then raise exception 'origen_vinculo_incoherente' using errcode = 'P0001'; end if;
      if v_opp.metadata ->> 'origen_huella' = v_origen_huella
         and v_opp.metadata -> 'origen_ref' = v_ref then return to_jsonb(v_opp); end if;
      raise exception 'origen_ya_vinculado' using errcode = '23505';
    end if;
    if v_ref_stamp is distinct from (v_doc ->> 'updated_at')::timestamptz then
      raise exception 'origen_modificado' using errcode = '23505';
    end if;
    v_customer := public.fn_crm_uuid_o_null(v_doc ->> 'customer_id');
    if v_customer is null then raise exception 'origen_sin_cliente' using errcode = 'P0001'; end if;
    if v_data ? 'customer_id' and public.fn_crm_uuid_o_null(v_data ->> 'customer_id') is distinct from v_customer then
      raise exception 'cliente_origen_incoherente' using errcode = '22023';
    end if;
    v_data := v_data || jsonb_build_object('customer_id', v_customer, 'branch_id', v_doc -> 'branch_id');
    if v_origen = 'factura' then
      if jsonb_typeof(v_doc -> 'total') is distinct from 'number' or (v_doc ->> 'total')::numeric < 0
         or coalesce(btrim(v_doc ->> 'currency'), '') !~ '^[A-Za-z]{3}$' then
        raise exception 'origen_importes_invalidos' using errcode = '22023';
      end if;
      if (v_data ? 'amount' and (v_data ->> 'amount')::numeric is distinct from (v_doc ->> 'total')::numeric)
         or (v_data ? 'currency' and upper(btrim(v_data ->> 'currency')) is distinct from upper(btrim(v_doc ->> 'currency'))) then
        raise exception 'importe_origen_incoherente' using errcode = '22023';
      end if;
      if v_ref_tipo = 'factura' then
        if exists (select 1 from public.invoice_items where invoice_sales_id = v_ref_id and invoice_type = 'sale' offset 200 limit 1) then
          raise exception 'origen_demasiadas_lineas' using errcode = '22023';
        end if;
        select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'concept', i.description, 'line_total', i.total_line,
          'quantity', i.qty, 'unit_price', i.total_line / nullif(i.qty, 0)) order by i.id), '[]'::jsonb)
          into v_items from (select id, product_id, description, qty, total_line from public.invoice_items
            where invoice_sales_id = v_ref_id and invoice_type = 'sale' for share) i;
      else
        if exists (select 1 from public.quotation_items where quotation_id = v_ref_id offset 200 limit 1) then
          raise exception 'origen_demasiadas_lineas' using errcode = '22023';
        end if;
        select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'concept', i.description, 'line_total', i.total_line,
          'quantity', i.qty, 'unit_price', i.total_line / nullif(i.qty, 0)) order by i.id), '[]'::jsonb)
          into v_items from (select id, product_id, description, qty, total_line from public.quotation_items
            where quotation_id = v_ref_id for share) i;
      end if;
      if jsonb_array_length(v_items) > 200 then raise exception 'origen_demasiadas_lineas' using errcode = '22023'; end if;
      if exists (select 1 from jsonb_array_elements(v_items) x where
        jsonb_typeof(x -> 'quantity') is distinct from 'number' or (x ->> 'quantity')::numeric <= 0
        or jsonb_typeof(x -> 'unit_price') is distinct from 'number' or (x ->> 'unit_price')::numeric < 0) then
        raise exception 'origen_lineas_invalidas' using errcode = '22023';
      end if;
      v_data := v_data || jsonb_build_object('amount', v_doc -> 'total', 'currency', upper(btrim(v_doc ->> 'currency')),
        'source', v_ref_tipo, 'spaces', '[]'::jsonb,
        'products', coalesce((select jsonb_agg(jsonb_build_object('product_id', g.product_id,
          'quantity', g.quantity, 'unit_price', g.line_total / g.quantity) order by g.product_id)
          from (select (x ->> 'product_id')::integer as product_id, sum((x ->> 'quantity')::numeric) as quantity,
            sum((x ->> 'line_total')::numeric) as line_total from jsonb_array_elements(v_items) x
            where x ->> 'product_id' is not null group by (x ->> 'product_id')::integer) g), '[]'::jsonb),
        'custom_lines', coalesce((select jsonb_agg((x - 'product_id' - 'line_total') || jsonb_build_object('concept',
          coalesce(nullif(btrim(x ->> 'concept'), ''), v_ref_tipo || ' ' || coalesce(v_doc ->> 'number', v_ref_id::text))))
          from jsonb_array_elements(v_items) x where x ->> 'product_id' is null), '[]'::jsonb));
    else
      select ch.type into v_channel from public.channels ch
       where ch.id = (v_doc ->> 'channel_id')::uuid and ch.organization_id = p_org;
      if not found then raise exception 'canal_no_encontrado' using errcode = 'P0002'; end if;
      v_data := v_data || jsonb_build_object('source', v_channel);
    end if;
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
            || case when v_data ? 'origen_ref' then jsonb_build_object('origen_ref', v_data -> 'origen_ref') else '{}'::jsonb end
            || case when v_origen_huella is not null then jsonb_build_object('origen_huella', v_origen_huella) else '{}'::jsonb end;

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

  -- El vínculo inverso y las líneas/historial nacen en esta misma transacción.
  if v_origen = 'factura' and v_ref_tipo = 'factura' then
    update public.invoice_sales set opportunity_id = v_opp.id where id = v_ref_id and organization_id = p_org;
    if not found then raise exception 'origen_no_encontrado' using errcode = 'P0002'; end if;
  elsif v_origen = 'factura' and v_ref_tipo = 'cotizacion' then
    update public.quotations set opportunity_id = v_opp.id where id = v_ref_id and organization_id = p_org;
    if not found then raise exception 'origen_no_encontrado' using errcode = 'P0002'; end if;
  elsif v_origen = 'conversacion' then
    v_meta_chat := case when jsonb_typeof(v_doc -> 'metadata') = 'object' then v_doc -> 'metadata' else '{}'::jsonb end;
    update public.conversations set metadata = v_meta_chat || jsonb_build_object('opportunity_id', v_opp.id)
     where id = v_ref_id and organization_id = p_org;
    if not found then raise exception 'origen_no_encontrado' using errcode = 'P0002'; end if;
  end if;
  select * into v_opp from opportunities where id = v_opp.id;
  return to_jsonb(v_opp);
end;
$function$;
revoke all on function public.crm_create_opportunity(integer,jsonb) from public, anon;
grant execute on function public.crm_create_opportunity(integer,jsonb) to authenticated, service_role;
