-- CRM ola 3B (docs/crm/PLAN-FIGMA-A-CODIGO.md §4.7): el formulario único de
-- oportunidad en página guarda también los espacios del PMS por el servidor.
-- `fn_crm_opp_lineas_aplicar` (la usan crm_create_opportunity y
-- crm_update_opportunity en la misma transacción) aplica `spaces` por
-- diferencia, como ya hacía con `products` y `custom_lines`. Aditiva: sin
-- `spaces` en el cuerpo, nada cambia.
--
-- De paso, `fn_crm_uuid_o_null` fija `search_path` (aviso del asesor anotado
-- en «Ola 1 — estado»).

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
  v_espacio uuid;
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
  -- CRM ola 3B: espacios del PMS (`opportunity_spaces`) por diferencia, igual
  -- que productos y conceptos. El espacio debe ser de una sucursal de la
  -- organización; `total_price` es GENERATED y no se escribe.
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
      if v_espacio is null or not exists (
        select 1 from spaces s join branches b on b.id = s.branch_id
         where s.id = v_espacio and b.organization_id = p_org
      ) then
        raise exception 'espacio_no_encontrado' using errcode = 'P0002', detail = coalesce(v_linea ->> 'space_id', '');
      end if;
      if coalesce((v_linea ->> 'nights')::integer, 1) <= 0 or coalesce((v_linea ->> 'unit_price')::numeric, 0) < 0 then
        raise exception 'linea_invalida' using errcode = '22023';
      end if;
      v_id := public.fn_crm_uuid_o_null(v_linea ->> 'id');
      if v_id is not null then
        update opportunity_spaces
           set space_id = v_espacio,
               nights = coalesce((v_linea ->> 'nights')::integer, 1),
               unit_price = coalesce((v_linea ->> 'unit_price')::numeric, 0),
               updated_at = now()
         where id = v_id and opportunity_id = p_opp;
        if not found then
          raise exception 'linea_no_encontrada' using errcode = 'P0002', detail = v_id::text;
        end if;
      else
        insert into opportunity_spaces (opportunity_id, space_id, nights, unit_price)
        values (p_opp, v_espacio, coalesce((v_linea ->> 'nights')::integer, 1), coalesce((v_linea ->> 'unit_price')::numeric, 0));
      end if;
    end loop;
  end if;
end;
$$;

alter function public.fn_crm_uuid_o_null(text) set search_path to 'public', 'pg_temp';

revoke all on function public.fn_crm_opp_lineas_aplicar(integer, uuid, jsonb) from public, anon;
grant execute on function public.fn_crm_opp_lineas_aplicar(integer, uuid, jsonb) to authenticated, service_role;
