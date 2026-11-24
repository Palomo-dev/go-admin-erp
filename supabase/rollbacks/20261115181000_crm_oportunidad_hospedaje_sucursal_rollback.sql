-- Reversión de 20261115181000_crm_oportunidad_hospedaje_sucursal.sql.
-- Restaura fn_crm_opp_lineas_aplicar de 20261115180000 y quita la columna.
-- ADVIERTE: se pierde la sucursal guardada en las líneas de hospedaje.

create or replace function public.fn_crm_opp_lineas_aplicar(p_org integer, p_opp uuid, p_data jsonb)
 returns void
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_linea jsonb;
  v_id uuid;
  v_ids uuid[];
  v_producto integer;
  v_anterior integer;
  v_mods jsonb;
  v_config jsonb;
  v_notas text;
  v_espacio uuid;
  v_tipo uuid;
  v_entrada date;
  v_salida date;
  v_noches integer;
  v_adultos integer;
  v_ninos integer;
  v_plan text;
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
      v_anterior := null;
      if v_id is not null then
        select product_id into v_anterior from opportunity_products where id = v_id and opportunity_id = p_opp;
      end if;
      -- Producto nuevo en la línea: activo y vendible (la línea guarda la variante, nunca el padre).
      if v_anterior is distinct from v_producto then
        if not exists (select 1 from products p where p.id = v_producto and p.status = 'active') then
          raise exception 'producto_inactivo' using errcode = '22023', detail = v_producto::text;
        end if;
        if exists (select 1 from products h where h.parent_product_id = v_producto and h.organization_id = p_org and h.status = 'active') then
          raise exception 'producto_con_variantes' using errcode = '22023', detail = v_producto::text;
        end if;
      end if;
      v_mods := coalesce(v_linea -> 'modifiers', '[]'::jsonb);
      if jsonb_typeof(v_mods) <> 'array' then
        raise exception 'linea_invalida' using errcode = '22023', detail = 'modifiers';
      end if;
      if jsonb_array_length(v_mods) > 0 and public.fn_pos_extra_modificadores(p_org, v_producto, v_mods) is null then
        raise exception 'modificador_invalido' using errcode = '22023', detail = v_producto::text;
      end if;
      v_config := coalesce(v_linea -> 'service_config', '{}'::jsonb);
      if jsonb_typeof(v_config) <> 'object' then
        raise exception 'linea_invalida' using errcode = '22023', detail = 'service_config';
      end if;
      v_notas := nullif(btrim(coalesce(v_linea ->> 'notes', '')), '');
      if length(v_notas) > 1000 then
        raise exception 'linea_invalida' using errcode = '22023', detail = 'notes';
      end if;
      if v_id is not null then
        update opportunity_products
           set product_id = v_producto,
               quantity = coalesce((v_linea ->> 'quantity')::numeric, 1),
               unit_price = coalesce((v_linea ->> 'unit_price')::numeric, 0),
               modifiers = v_mods,
               service_config = v_config,
               notes = v_notas,
               updated_at = now()
         where id = v_id and opportunity_id = p_opp;
        if not found then
          raise exception 'linea_no_encontrada' using errcode = 'P0002', detail = v_id::text;
        end if;
      else
        insert into opportunity_products (opportunity_id, product_id, quantity, unit_price, modifiers, service_config, notes)
        values (p_opp, v_producto, coalesce((v_linea ->> 'quantity')::numeric, 1), coalesce((v_linea ->> 'unit_price')::numeric, 0), v_mods, v_config, v_notas);
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

  -- Hospedaje: por tipo de habitación (y, si ya se eligió, la habitación),
  -- con fechas, huéspedes y plan. Con las dos fechas, las noches salen de ellas.
  if jsonb_typeof(p_data -> 'spaces') = 'array' then
    v_ids := array(
      select public.fn_crm_uuid_o_null(x ->> 'id')
        from jsonb_array_elements(p_data -> 'spaces') x
       where nullif(x ->> 'id', '') is not null
    );
    delete from opportunity_spaces
     where opportunity_id = p_opp and not (id = any (coalesce(v_ids, array[]::uuid[])));
    for v_linea in select * from jsonb_array_elements(p_data -> 'spaces') loop
      v_espacio := public.fn_crm_uuid_o_null(v_linea ->> 'space_id');
      v_tipo := public.fn_crm_uuid_o_null(v_linea ->> 'space_type_id');
      if v_espacio is not null then
        select s.space_type_id into v_tipo
          from spaces s join branches b on b.id = s.branch_id
         where s.id = v_espacio and b.organization_id = p_org
           and (v_tipo is null or s.space_type_id = v_tipo);
        if not found then
          raise exception 'espacio_no_encontrado' using errcode = 'P0002', detail = coalesce(v_linea ->> 'space_id', '');
        end if;
      elsif v_tipo is null or not exists (select 1 from space_types st where st.id = v_tipo and st.organization_id = p_org) then
        raise exception 'espacio_no_encontrado' using errcode = 'P0002', detail = coalesce(v_linea ->> 'space_type_id', '');
      end if;
      v_entrada := nullif(v_linea ->> 'checkin_date', '')::date;
      v_salida := nullif(v_linea ->> 'checkout_date', '')::date;
      if (v_entrada is null) <> (v_salida is null) or (v_entrada is not null and v_salida <= v_entrada) then
        raise exception 'fechas_invalidas' using errcode = '22023';
      end if;
      v_noches := case when v_entrada is not null then v_salida - v_entrada else coalesce((v_linea ->> 'nights')::integer, 1) end;
      v_adultos := nullif(v_linea ->> 'adults', '')::integer;
      v_ninos := nullif(v_linea ->> 'children', '')::integer;
      v_plan := nullif(btrim(coalesce(v_linea ->> 'rate_plan', '')), '');
      if v_noches <= 0 or coalesce((v_linea ->> 'unit_price')::numeric, 0) < 0
         or coalesce(v_adultos, 0) < 0 or coalesce(v_ninos, 0) < 0 or length(v_plan) > 120 then
        raise exception 'linea_invalida' using errcode = '22023';
      end if;
      v_id := public.fn_crm_uuid_o_null(v_linea ->> 'id');
      if v_id is not null then
        update opportunity_spaces
           set space_id = v_espacio,
               space_type_id = v_tipo,
               nights = v_noches,
               unit_price = coalesce((v_linea ->> 'unit_price')::numeric, 0),
               checkin_date = v_entrada,
               checkout_date = v_salida,
               adults = v_adultos,
               children = v_ninos,
               rate_plan = v_plan,
               updated_at = now()
         where id = v_id and opportunity_id = p_opp;
        if not found then
          raise exception 'linea_no_encontrada' using errcode = 'P0002', detail = v_id::text;
        end if;
      else
        insert into opportunity_spaces (opportunity_id, space_id, space_type_id, nights, unit_price, checkin_date, checkout_date, adults, children, rate_plan)
        values (p_opp, v_espacio, v_tipo, v_noches, coalesce((v_linea ->> 'unit_price')::numeric, 0), v_entrada, v_salida, v_adultos, v_ninos, v_plan);
      end if;
    end loop;
  end if;
end;
$function$;

alter table public.opportunity_spaces drop column if exists branch_id;
