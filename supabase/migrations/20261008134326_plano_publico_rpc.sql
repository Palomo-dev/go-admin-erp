-- Plantilla «Café de especialidad» · M3 (fase F2): plano público de una sede.
--
-- get_restaurant_floor_plan_public(p_organization_id, p_branch_id) → jsonb
--   { branch_id, has_layout, zones: [...], tables: [...], elements: [...] }
--
-- Lo llama SOLO el servidor del sitio (service role), con la organización ya
-- resuelta desde el host. Devuelve lo que se dibuja y nada más: nunca el estado
-- de la mesa (`state`), sesiones, montos ni meseros.
--
-- Sede: tiene que ser de la organización y estar activa. No se exige
-- `branches.is_web_published`: esa bandera es la del sitio propio por sede
-- (outlet), y el sitio de la organización ya ofrece reservas en todas sus sedes
-- activas (lib/restaurant/sedes-modelo.ts). Exigirla dejaría sin plano a la
-- única sede que hoy recibe reservas web.
--
-- Zonas visibles (decisión E5): las de restaurant_booking_settings.allowed_zones
-- si la lista no está vacía; si está vacía, todas.

create or replace function public.get_restaurant_floor_plan_public(
  p_organization_id integer,
  p_branch_id integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ajustes public.restaurant_booking_settings;
  v_zonas   text[];
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if p_organization_id is null or p_branch_id is null or not exists (
    select 1 from public.branches b
     where b.id = p_branch_id
       and b.organization_id = p_organization_id
       and coalesce(b.is_active, true)
  ) then
    raise exception 'SEDE: La sede no pertenece a la organizacion' using errcode = '42501';
  end if;

  v_ajustes := public.fn_ajustes_reserva(p_organization_id, p_branch_id);
  if v_ajustes.id is not null and coalesce(array_length(v_ajustes.allowed_zones, 1), 0) > 0 then
    v_zonas := v_ajustes.allowed_zones;
  end if;

  return jsonb_build_object(
    'branch_id', p_branch_id,
    -- Hay plano si alguna mesa visible tiene posición guardada.
    'has_layout', exists (
      select 1 from public.restaurant_tables t
       where t.organization_id = p_organization_id
         and t.branch_id = p_branch_id
         and t.position_x is not null and t.position_y is not null
         and (v_zonas is null or t.zone = any (v_zonas))
    ),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'zone_name', n.nombre,
               'position_x', z.position_x,
               'position_y', z.position_y,
               'width', z.width,
               'height', z.height,
               'color', z.color,
               'sort_order', z.sort_order
             ) order by z.sort_order nulls last, n.nombre)
        from (
          select zl.zone_name as nombre
            from public.restaurant_zone_layouts zl
           where zl.organization_id = p_organization_id and zl.branch_id = p_branch_id
          union
          select t.zone
            from public.restaurant_tables t
           where t.organization_id = p_organization_id and t.branch_id = p_branch_id
             and t.zone is not null
        ) n
        left join public.restaurant_zone_layouts z
          on z.organization_id = p_organization_id
         and z.branch_id = p_branch_id
         and z.zone_name = n.nombre
       where v_zonas is null or n.nombre = any (v_zonas)
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               'name', t.name,
               'zone', t.zone,
               'shape', t.shape,
               'size', t.size,
               'capacity', t.capacity,
               'position_x', t.position_x,
               'position_y', t.position_y,
               'rotation', coalesce(t.rotation, 0),
               'is_web_bookable', t.is_web_bookable,
               'web_min_party', t.web_min_party,
               'web_max_party', t.web_max_party
             ) order by t.zone nulls last, t.name)
        from public.restaurant_tables t
       where t.organization_id = p_organization_id
         and t.branch_id = p_branch_id
         and (v_zonas is null or t.zone = any (v_zonas))
    ), '[]'::jsonb),
    'elements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'zone_name', e.zone_name,
               'kind', e.kind,
               'label', e.label,
               'position_x', e.position_x,
               'position_y', e.position_y,
               'width', e.width,
               'height', e.height,
               'rotation', e.rotation,
               'sort_order', e.sort_order
             ) order by e.sort_order, e.created_at)
        from public.restaurant_floor_elements e
       where e.organization_id = p_organization_id
         and e.branch_id = p_branch_id
         and e.show_on_web
         and (v_zonas is null or e.zone_name = any (v_zonas))
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_restaurant_floor_plan_public(integer, integer) is
  'Plano público de una sede para el sitio (solo service role): zonas, mesas (sin estado, sesiones, montos ni meseros) y elementos fijos con show_on_web.';

revoke all on function public.get_restaurant_floor_plan_public(integer, integer) from public, anon, authenticated;
grant execute on function public.get_restaurant_floor_plan_public(integer, integer) to service_role;
