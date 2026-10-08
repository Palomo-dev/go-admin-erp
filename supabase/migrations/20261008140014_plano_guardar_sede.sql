-- Plantilla «Café de especialidad» · E9 (fase F3): guardar el plano de una sede
-- en UNA transacción.
--
-- guardar_plano_sede(p_branch_id, p_cambios jsonb) → jsonb
--
-- Hasta hoy POS › Mesas › plano guardaba con N llamadas desde el navegador
-- (un insert, un update por mesa y un upsert de zonas): un fallo a mitad
-- dejaba el plano a medias. Ahora las mesas nuevas y editadas, el cambio de
-- nombre de las zonas, sus recuadros y los elementos fijos nuevos y editados
-- se guardan juntos o no se guarda nada (CLAUDE.md: servicios que tocan varias
-- tablas → RPC transaccional).
--
-- Los BORRADOS (mesas y elementos fijos) no van aquí: siguen desde el cliente
-- con RLS, como hoy las mesas (MesasService.eliminarMesa, que no borra una mesa
-- con cuenta abierta), y se hacen DESPUÉS de que esta RPC confirme. Motivo: en
-- este entorno el MCP de Supabase pide confirmación interactiva para cualquier
-- SQL con borrados, así que no se pudo ensayar ni aplicar sin supervisión.
-- Pendiente: moverlos a esta RPC en una migración ensayada con alguien que
-- pueda confirmar.
--
-- Permiso (resuelto en el servidor, el mismo que edita mesas hoy): sesión
-- (auth.uid()), pertenencia activa a la organización de la sede
-- (fn_assert_acceso_org) y acceso a la sede (app_branch_access). La
-- organización sale de la sede, nunca del cliente.
--
-- p_cambios:
--   mesas_nuevas    [{ clave, name, zone, capacity, shape, size, position_x,
--                      position_y, rotation, is_web_bookable, web_min_party,
--                      web_max_party }]
--   mesas_editadas  [{ id, …mismos campos }]
--   zonas           [{ zone_name, original, position_x, position_y, width,
--                      height, color, sort_order }]   (original ≠ zone_name: renombrar)
--   elementos       [{ id | clave, zone_name, kind, label, position_x,
--                      position_y, width, height, rotation, show_on_web, sort_order }]
-- Respuesta: { ok, mesas_nuevas: {clave: id}, elementos_nuevos: {clave: id},
--              mesas, zonas, elementos }

-- Lee y valida una mesa del JSON del editor (interna).
create or replace function public.fn_plano_mesa_desde_json(p jsonb)
returns public.restaurant_tables
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  r public.restaurant_tables;
begin
  r.name := nullif(btrim(coalesce(p ->> 'name', '')), '');
  if r.name is null or char_length(r.name) > 60 then
    raise exception 'datos_invalidos' using errcode = '22023', detail = 'nombre de la mesa';
  end if;
  r.zone := nullif(btrim(coalesce(p ->> 'zone', '')), '');
  r.capacity := round((p ->> 'capacity')::numeric)::integer;
  if r.capacity is null or r.capacity < 1 or r.capacity > 100 then
    raise exception 'datos_invalidos' using errcode = '22023', detail = 'capacidad de la mesa';
  end if;
  r.position_x := greatest(0, round(coalesce((p ->> 'position_x')::numeric, 0)))::integer;
  r.position_y := greatest(0, round(coalesce((p ->> 'position_y')::numeric, 0)))::integer;
  r.rotation := ((round(coalesce((p ->> 'rotation')::numeric, 0))::integer % 360) + 360) % 360;
  r.shape := nullif(p ->> 'shape', '');
  if r.shape is not null and r.shape not in ('square', 'round', 'long', 'bar') then
    raise exception 'datos_invalidos' using errcode = '22023', detail = 'forma de la mesa';
  end if;
  r.size := nullif(p ->> 'size', '');
  if r.size is not null and r.size not in ('s', 'm', 'l') then
    raise exception 'datos_invalidos' using errcode = '22023', detail = 'tamaño de la mesa';
  end if;
  r.is_web_bookable := coalesce((p ->> 'is_web_bookable')::boolean, true);
  r.web_min_party := round((p ->> 'web_min_party')::numeric)::integer;
  r.web_max_party := round((p ->> 'web_max_party')::numeric)::integer;
  return r;
end;
$$;

revoke all on function public.fn_plano_mesa_desde_json(jsonb) from public, anon, authenticated;

create or replace function public.guardar_plano_sede(p_branch_id integer, p_cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uuid      constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_c         jsonb := coalesce(p_cambios, '{}'::jsonb);
  v_org       integer;
  v           jsonb;
  v_txt       text;
  v_original  text;
  v_id        uuid;
  v_mesa      public.restaurant_tables;
  v_kind      text;
  v_nuevas    jsonb := '{}'::jsonb;
  v_elem_new  jsonb := '{}'::jsonb;
  v_n_mesas   integer := 0;
  v_n_zonas   integer := 0;
  v_n_elem    integer := 0;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  if jsonb_typeof(v_c) <> 'object' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  select b.organization_id into v_org from public.branches b where b.id = p_branch_id;
  if v_org is null then
    raise exception 'sede_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_org);
  if not public.app_branch_access(p_branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  -- 1. Zonas renombradas: el recuadro, las mesas y los elementos siguen a la zona.
  for v in select * from jsonb_array_elements(coalesce(v_c -> 'zonas', '[]'::jsonb)) loop
    v_txt := nullif(btrim(coalesce(v ->> 'zone_name', '')), '');
    v_original := nullif(btrim(coalesce(v ->> 'original', '')), '');
    if v_txt is null then
      raise exception 'datos_invalidos' using errcode = '22023', detail = 'zona sin nombre';
    end if;
    if v_original is not null and v_original <> v_txt then
      update public.restaurant_zone_layouts z
         set zone_name = v_txt, updated_at = now()
       where z.organization_id = v_org and z.branch_id = p_branch_id and z.zone_name = v_original
         and not exists (
           select 1 from public.restaurant_zone_layouts o
            where o.organization_id = v_org and o.branch_id = p_branch_id and o.zone_name = v_txt);
      update public.restaurant_tables t
         set zone = v_txt, updated_at = now()
       where t.organization_id = v_org and t.branch_id = p_branch_id and t.zone = v_original;
      update public.restaurant_floor_elements e
         set zone_name = v_txt
       where e.organization_id = v_org and e.branch_id = p_branch_id and e.zone_name = v_original;
    end if;
  end loop;

  -- 2. Mesas nuevas.
  for v in select * from jsonb_array_elements(coalesce(v_c -> 'mesas_nuevas', '[]'::jsonb)) loop
    v_mesa := public.fn_plano_mesa_desde_json(v);
    insert into public.restaurant_tables (
      organization_id, branch_id, name, zone, capacity, state,
      position_x, position_y, rotation, shape, size,
      is_web_bookable, web_min_party, web_max_party)
    values (
      v_org, p_branch_id, v_mesa.name, v_mesa.zone, v_mesa.capacity, 'free',
      v_mesa.position_x, v_mesa.position_y, v_mesa.rotation, v_mesa.shape, v_mesa.size,
      v_mesa.is_web_bookable, v_mesa.web_min_party, v_mesa.web_max_party)
    returning id into v_id;
    if nullif(v ->> 'clave', '') is not null then
      v_nuevas := v_nuevas || jsonb_build_object(v ->> 'clave', v_id);
    end if;
    v_n_mesas := v_n_mesas + 1;
  end loop;

  -- 3. Mesas editadas.
  for v in select * from jsonb_array_elements(coalesce(v_c -> 'mesas_editadas', '[]'::jsonb)) loop
    if coalesce(v ->> 'id', '') !~ v_uuid then
      raise exception 'datos_invalidos' using errcode = '22023', detail = 'id de mesa';
    end if;
    v_mesa := public.fn_plano_mesa_desde_json(v);
    update public.restaurant_tables t
       set name = v_mesa.name,
           zone = v_mesa.zone,
           capacity = v_mesa.capacity,
           position_x = v_mesa.position_x,
           position_y = v_mesa.position_y,
           rotation = v_mesa.rotation,
           shape = v_mesa.shape,
           size = v_mesa.size,
           is_web_bookable = v_mesa.is_web_bookable,
           web_min_party = v_mesa.web_min_party,
           web_max_party = v_mesa.web_max_party,
           updated_at = now()
     where t.id = (v ->> 'id')::uuid and t.organization_id = v_org and t.branch_id = p_branch_id;
    if not found then
      raise exception 'mesa_no_encontrada' using errcode = 'P0002';
    end if;
    v_n_mesas := v_n_mesas + 1;
  end loop;

  -- 4. Zonas: recuadro, color y orden.
  for v in select * from jsonb_array_elements(coalesce(v_c -> 'zonas', '[]'::jsonb)) loop
    insert into public.restaurant_zone_layouts (
      organization_id, branch_id, zone_name, position_x, position_y, width, height, color, sort_order, updated_at)
    values (
      v_org, p_branch_id, btrim(v ->> 'zone_name'),
      round(coalesce((v ->> 'position_x')::numeric, 0))::integer,
      round(coalesce((v ->> 'position_y')::numeric, 0))::integer,
      greatest(1, round(coalesce((v ->> 'width')::numeric, 200)))::integer,
      greatest(1, round(coalesce((v ->> 'height')::numeric, 150)))::integer,
      case when (v ->> 'color') ~ '^#[0-9a-fA-F]{6}$' then v ->> 'color' end,
      round((v ->> 'sort_order')::numeric)::integer,
      now())
    on conflict (organization_id, branch_id, zone_name) do update
      set position_x = excluded.position_x,
          position_y = excluded.position_y,
          width = excluded.width,
          height = excluded.height,
          color = excluded.color,
          sort_order = excluded.sort_order,
          updated_at = now();
    v_n_zonas := v_n_zonas + 1;
  end loop;

  -- 5. Elementos fijos nuevos y editados.
  for v in select * from jsonb_array_elements(coalesce(v_c -> 'elementos', '[]'::jsonb)) loop
    v_kind := v ->> 'kind';
    if v_kind is null or v_kind not in ('column', 'planter', 'bar', 'wall', 'door', 'window', 'label') then
      raise exception 'datos_invalidos' using errcode = '22023', detail = 'tipo de elemento';
    end if;
    if coalesce(v ->> 'id', '') ~ v_uuid then
      update public.restaurant_floor_elements e
         set zone_name = nullif(btrim(coalesce(v ->> 'zone_name', '')), ''),
             kind = v_kind,
             label = left(nullif(btrim(coalesce(v ->> 'label', '')), ''), 60),
             position_x = greatest(0, round(coalesce((v ->> 'position_x')::numeric, 0)))::integer,
             position_y = greatest(0, round(coalesce((v ->> 'position_y')::numeric, 0)))::integer,
             width = least(4000, greatest(4, round(coalesce((v ->> 'width')::numeric, 60))))::integer,
             height = least(4000, greatest(4, round(coalesce((v ->> 'height')::numeric, 60))))::integer,
             rotation = ((round(coalesce((v ->> 'rotation')::numeric, 0))::integer % 360) + 360) % 360,
             show_on_web = coalesce((v ->> 'show_on_web')::boolean, true),
             sort_order = round(coalesce((v ->> 'sort_order')::numeric, 0))::integer
       where e.id = (v ->> 'id')::uuid and e.organization_id = v_org and e.branch_id = p_branch_id;
      if not found then
        raise exception 'elemento_no_encontrado' using errcode = 'P0002';
      end if;
    else
      insert into public.restaurant_floor_elements (
        organization_id, branch_id, zone_name, kind, label,
        position_x, position_y, width, height, rotation, show_on_web, sort_order)
      values (
        v_org, p_branch_id,
        nullif(btrim(coalesce(v ->> 'zone_name', '')), ''),
        v_kind,
        left(nullif(btrim(coalesce(v ->> 'label', '')), ''), 60),
        greatest(0, round(coalesce((v ->> 'position_x')::numeric, 0)))::integer,
        greatest(0, round(coalesce((v ->> 'position_y')::numeric, 0)))::integer,
        least(4000, greatest(4, round(coalesce((v ->> 'width')::numeric, 60))))::integer,
        least(4000, greatest(4, round(coalesce((v ->> 'height')::numeric, 60))))::integer,
        ((round(coalesce((v ->> 'rotation')::numeric, 0))::integer % 360) + 360) % 360,
        coalesce((v ->> 'show_on_web')::boolean, true),
        round(coalesce((v ->> 'sort_order')::numeric, 0))::integer)
      returning id into v_id;
      if nullif(v ->> 'clave', '') is not null then
        v_elem_new := v_elem_new || jsonb_build_object(v ->> 'clave', v_id);
      end if;
    end if;
    v_n_elem := v_n_elem + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'mesas_nuevas', v_nuevas,
    'elementos_nuevos', v_elem_new,
    'mesas', v_n_mesas,
    'zonas', v_n_zonas,
    'elementos', v_n_elem
  );
end;
$$;

comment on function public.guardar_plano_sede(integer, jsonb) is
  'Guarda el plano de una sede en una transacción: mesas nuevas y editadas, zonas (recuadro, color, orden, nombre) y elementos fijos nuevos y editados. Permiso: sesión + pertenencia a la organización de la sede + acceso a la sede.';

revoke all on function public.guardar_plano_sede(integer, jsonb) from public, anon;
grant execute on function public.guardar_plano_sede(integer, jsonb) to authenticated;
