-- Reversión de 20261115180000_crm_oportunidad_lineas_config.sql.
-- Restaura fn_crm_opp_lineas_aplicar de 20260930210000 y quita las columnas
-- nuevas. ADVIERTE: borra los modificadores, la configuración de servicio, las
-- notas y los datos de hospedaje (tipo, huéspedes, plan) que se hayan guardado;
-- y falla al volver space_id a NOT NULL o al restaurar el UNIQUE si ya hay
-- líneas de hospedaje sin habitación o la misma variante dos veces en una
-- oportunidad (resolverlas a mano antes).

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

drop index if exists public.idx_opportunity_spaces_space_type;
alter table public.opportunity_spaces drop constraint if exists opportunity_spaces_huespedes;
alter table public.opportunity_spaces drop constraint if exists opportunity_spaces_espacio_o_tipo;
alter table public.opportunity_spaces alter column space_id set not null;
alter table public.opportunity_spaces
  drop column if exists rate_plan,
  drop column if exists children,
  drop column if exists adults,
  drop column if exists space_type_id;

drop index if exists public.uq_opportunity_products_linea;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'opportunity_products_opportunity_id_product_id_key') then
    alter table public.opportunity_products
      add constraint opportunity_products_opportunity_id_product_id_key unique (opportunity_id, product_id);
  end if;
end $$;
alter table public.opportunity_products
  drop column if exists notes,
  drop column if exists service_config,
  drop column if exists modifiers;
