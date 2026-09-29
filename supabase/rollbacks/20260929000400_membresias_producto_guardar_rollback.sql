-- Rollback de 20260929000400_membresias_producto_guardar.sql
--
-- Invierte los reemplazos sobre la definición VIVA (el mismo patrón que la migración): cada bloque
-- nuevo debe aparecer exactamente una vez y vuelve a su fragmento original. Si otra migración
-- posterior tocó esos mismos bloques, se aborta sin cambiar nada. Revertir antes la fase 2.
-- No revierte datos: products.service_type y los planes creados desde el formulario se quedan
-- (los quita el rollback de 20260929000100).

do $$
declare
  v_def text := pg_get_functiondef('public.fn_producto_guardar(integer,jsonb)'::regprocedure);
  v_frag text[];
  v_repl text[];
  i integer;
begin
  if position('Membresías (20260929000400)' in v_def) = 0 then
    return; -- no aplicado
  end if;

  v_frag := array[
    -- 1. variables
    E'  v_tipo_rec text;\nbegin\n',
    -- 2. validación del tipo de servicio
    E'  if nullif(v_pr->>''station'', '''') is not null and v_pr->>''station'' not in',
    -- 3. editar: service_type en el mismo UPDATE (la CHECK exige null si deja de ser servicio)
    E'      product_type = coalesce(nullif(v_pr->>''product_type'', ''''), ''product''),\n',
    -- 4. bloque de membresía, antes de los impuestos
    E'  -- Impuestos (N por producto) y propagación a las variantes.\n',
    -- 5. resultado
    E'''variantes'', v_vars, ''imagenes_quitadas'', v_quitadas, ''recetas'', v_recetas);'
  ];
  v_repl := array[
    E'  v_tipo_rec text;\n'
    || E'  -- Membresías (20260929000400)\n'
    || E'  v_es_servicio boolean := coalesce(nullif(v_pr->>''product_type'', ''''), ''product'') = ''service'';\n'
    || E'  v_st_pedido text := nullif(btrim(coalesce(v_pr->>''service_type'', '''')), '''');\n'
    || E'  v_st text;\n'
    || E'  v_mb jsonb;\n'
    || E'  v_plan_id integer;\n'
    || E'begin\n',

    E'  if v_st_pedido is not null and v_st_pedido not in (''standard'', ''membership'', ''session_pack'', ''class'', ''course'', ''appointment'') then\n'
    || E'    raise exception ''tipo_servicio_invalido'' using errcode = ''22023'';\n'
    || E'  end if;\n'
    || E'  if v_es_servicio and v_st_pedido = ''membership'' and v_tiene_var then\n'
    || E'    raise exception ''membresia_con_variantes'' using errcode = ''22023'';\n'
    || E'  end if;\n'
    || E'  if nullif(v_pr->>''station'', '''') is not null and v_pr->>''station'' not in',

    E'      product_type = coalesce(nullif(v_pr->>''product_type'', ''''), ''product''),\n'
    || E'      service_type = case when v_es_servicio then coalesce(v_st_pedido, service_type, ''standard'') end,\n',

    E'  -- Membresías (20260929000400): tipo de servicio y plan de la membresía, en esta misma operación.\n'
    || E'  if v_modo <> ''editar'' then\n'
    || E'    update public.products set service_type = case when v_es_servicio then coalesce(v_st_pedido, ''standard'') end\n'
    || E'     where id = v_id and service_type is distinct from case when v_es_servicio then coalesce(v_st_pedido, ''standard'') end;\n'
    || E'  end if;\n'
    || E'  select service_type into v_st from public.products where id = v_id;\n'
    || E'  if v_st is distinct from ''membership'' then\n'
    || E'    if exists (select 1 from public.membership_plans mp join public.memberships m on m.membership_plan_id = mp.id\n'
    || E'                where mp.product_id = v_id and m.status not in (''cancelled'', ''expired'')) then\n'
    || E'      raise exception ''membresia_con_contratos'' using errcode = ''22023'';\n'
    || E'    end if;\n'
    || E'    update public.membership_plans set is_active = false where product_id = v_id and is_active;\n'
    || E'  else\n'
    || E'    if v_tiene_var then\n'
    || E'      raise exception ''membresia_con_variantes'' using errcode = ''22023'';\n'
    || E'    end if;\n'
    || E'    v_mb := case when jsonb_typeof(p_payload->''membresia'') = ''object'' then p_payload->''membresia'' end;\n'
    || E'    if v_mb is not null then\n'
    || E'      perform public.fn_membresias_int_exigir(p_organization_id, array[''memberships.plans.manage'']);\n'
    || E'      if coalesce(v_mb->>''duration_unit'', ''month'') not in (''day'', ''week'', ''month'', ''year'') then\n'
    || E'        raise exception ''membresia_unidad_invalida'' using errcode = ''22023'';\n'
    || E'      end if;\n'
    || E'      if coalesce(nullif(v_mb->>''duration_value'', '''')::int, 1) < 1 then\n'
    || E'        raise exception ''membresia_duracion_invalida'' using errcode = ''22023'';\n'
    || E'      end if;\n'
    || E'      if coalesce(v_mb->>''billing_mode'', ''prepaid'') not in (''prepaid'', ''on_credit'') then\n'
    || E'        raise exception ''membresia_cobro_invalido'' using errcode = ''22023'';\n'
    || E'      end if;\n'
    || E'      if coalesce(nullif(v_mb->>''grace_days'', '''')::int, 0) < 0 then\n'
    || E'        raise exception ''membresia_gracia_invalida'' using errcode = ''22023'';\n'
    || E'      end if;\n'
    || E'      if exists (select 1 from jsonb_array_elements_text(coalesce(v_mb->''allowed_branch_ids'', ''[]''::jsonb)) b\n'
    || E'                  where not exists (select 1 from public.branches br where br.id = b::int and br.organization_id = p_organization_id)) then\n'
    || E'        raise exception ''membresia_sede_invalida'' using errcode = ''22023'';\n'
    || E'      end if;\n'
    || E'      insert into public.membership_plans (organization_id, product_id, name, description, duration_days, price,\n'
    || E'        duration_unit, duration_value, billing_mode, renewal_mode, grace_days, requires_activation,\n'
    || E'        activation_window_days, freeze_allowed, freeze_max_times, freeze_max_days, allowed_branch_ids,\n'
    || E'        access_schedule, daily_checkin_limit, is_active, frequency)\n'
    || E'      values (p_organization_id, v_id, v_name, nullif(v_pr->>''description'', ''''), 30, null,\n'
    || E'        coalesce(v_mb->>''duration_unit'', ''month''), coalesce(nullif(v_mb->>''duration_value'', '''')::int, 1),\n'
    || E'        coalesce(v_mb->>''billing_mode'', ''prepaid''), case when v_mb->>''renewal_mode'' = ''automatic'' then ''automatic'' else ''manual'' end,\n'
    || E'        coalesce(nullif(v_mb->>''grace_days'', '''')::int, 0), coalesce((v_mb->>''requires_activation'')::boolean, false),\n'
    || E'        nullif(v_mb->>''activation_window_days'', '''')::int, coalesce((v_mb->>''freeze_allowed'')::boolean, false),\n'
    || E'        nullif(v_mb->>''freeze_max_times'', '''')::int, nullif(v_mb->>''freeze_max_days'', '''')::int,\n'
    || E'        case when jsonb_typeof(v_mb->''allowed_branch_ids'') = ''array'' and jsonb_array_length(v_mb->''allowed_branch_ids'') > 0\n'
    || E'             then array(select b::int from jsonb_array_elements_text(v_mb->''allowed_branch_ids'') b) end,\n'
    || E'        case when jsonb_typeof(v_mb->''access_schedule'') = ''object'' then v_mb->''access_schedule'' end,\n'
    || E'        nullif(v_mb->>''daily_checkin_limit'', '''')::int,\n'
    || E'        coalesce(nullif(v_pr->>''status'', ''''), ''active'') = ''active'', ''monthly'')\n'
    || E'      on conflict (product_id) where product_id is not null do update set\n'
    || E'        name = excluded.name, description = excluded.description,\n'
    || E'        duration_unit = excluded.duration_unit, duration_value = excluded.duration_value,\n'
    || E'        billing_mode = excluded.billing_mode, renewal_mode = excluded.renewal_mode,\n'
    || E'        grace_days = excluded.grace_days, requires_activation = excluded.requires_activation,\n'
    || E'        activation_window_days = excluded.activation_window_days, freeze_allowed = excluded.freeze_allowed,\n'
    || E'        freeze_max_times = excluded.freeze_max_times, freeze_max_days = excluded.freeze_max_days,\n'
    || E'        allowed_branch_ids = excluded.allowed_branch_ids, access_schedule = excluded.access_schedule,\n'
    || E'        daily_checkin_limit = excluded.daily_checkin_limit, is_active = excluded.is_active\n'
    || E'      returning id into v_plan_id;\n'
    || E'    else\n'
    || E'      -- Sin configuración: plan por defecto la primera vez; después solo se sincronizan nombre y estado.\n'
    || E'      insert into public.membership_plans (organization_id, product_id, name, description, duration_days, price,\n'
    || E'        duration_unit, duration_value, is_active, frequency)\n'
    || E'      values (p_organization_id, v_id, v_name, nullif(v_pr->>''description'', ''''), 30, null, ''month'', 1,\n'
    || E'        coalesce(nullif(v_pr->>''status'', ''''), ''active'') = ''active'', ''monthly'')\n'
    || E'      on conflict (product_id) where product_id is not null do update set\n'
    || E'        name = excluded.name, is_active = excluded.is_active\n'
    || E'      returning id into v_plan_id;\n'
    || E'    end if;\n'
    || E'  end if;\n\n'
    || E'  -- Impuestos (N por producto) y propagación a las variantes.\n',

    E'''variantes'', v_vars, ''imagenes_quitadas'', v_quitadas, ''recetas'', v_recetas,\n'
    || E'    ''service_type'', v_st, ''membership_plan_id'', v_plan_id);'
  ];

  for i in 1 .. array_length(v_repl, 1) loop
    if (length(v_def) - length(replace(v_def, v_repl[i], ''))) / length(v_repl[i]) <> 1 then
      raise exception 'rollback fn_producto_guardar: el bloque % no aparece exactamente una vez (¿la función cambió después?)', i;
    end if;
  end loop;
  for i in 1 .. array_length(v_repl, 1) loop
    v_def := replace(v_def, v_repl[i], v_frag[i]);
  end loop;
  execute v_def;
end $$;

do $$
declare
  v_def text := pg_get_functiondef('public.fn_producto_para_formulario(integer,integer)'::regprocedure);
  v_ini integer := position(E'    -- Membresías (20260929000400)' in v_def);
  v_fin integer := position(E'    ''imagenes'', coalesce((select jsonb_agg(jsonb_build_object(' in v_def);
begin
  if v_ini = 0 then
    return; -- no aplicado
  end if;
  if v_fin <= v_ini then
    raise exception 'rollback fn_producto_para_formulario: no se ubica el bloque';
  end if;
  execute substr(v_def, 1, v_ini - 1) || substr(v_def, v_fin);
end $$;
