-- Inventario B0 · 2/7 — Permisos y configuración del inventario
-- docs/implementacion/INVENTARIO-PLAN.md §5.1 (migración 4) y decisión P5 (2026-09-28).
--
-- Sin permisos nuevos: se resuelven sobre los que ya existen
-- (inventory.view/create/edit/delete/adjust/transfer, inventory.costs.view,
-- inventory_management, product_management) más el dueño de la organización.
--
--   acción           permisos que la conceden (además del dueño)
--   ver              cualquiera de inventory.* , inventory_management, product_management
--   crear            inventory.create, product_management, inventory_management
--   editar_catalogo  inventory.edit, product_management, inventory_management
--   eliminar         inventory.delete, product_management, inventory_management
--   ajustar          inventory.adjust, inventory_management
--   trasladar        inventory.transfer, inventory_management
--   recibir          inventory.create, inventory_management            (P6)
--   producir         inventory.create, inventory_management
--   garantias        inventory.edit, inventory_management
--   costos           fn_receta_int_puede_ver_costos (inventory.costs.view)
--   configurar       inventory_management
--
-- La UI oculta con fn_inventario_permisos; cada RPC vuelve a exigir con
-- fn_inventario_exigir_permiso(org, array['<acción>', ...]) (basta una).
--
-- Configuración por organización en organization_settings (key = 'inventario'):
--   bloquear_venta_sin_stock  (P5) false por defecto: vender sin existencias se
--                             permite como hoy; true hace que la venta falle con
--                             'stock_insuficiente' (23514) en fn_inv_int_mover.

create or replace function public.fn_inventario_permisos(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_owner boolean;
  v_gestion boolean;
  v_producto boolean;
  v_view boolean;
  v_create boolean;
  v_edit boolean;
  v_delete boolean;
  v_adjust boolean;
  v_transfer boolean;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    -- Rol de servicio (fn_assert_acceso_org ya rechazó anon/authenticated sin sesión).
    return jsonb_build_object('ver', true, 'crear', true, 'editar_catalogo', true, 'eliminar', true,
      'ajustar', true, 'trasladar', true, 'recibir', true, 'producir', true, 'garantias', true,
      'costos', true, 'configurar', true);
  end if;

  select exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = v_uid) into v_owner;
  v_gestion  := v_owner or public.check_user_permission(v_uid, p_org, 'inventory_management');
  v_producto := public.check_user_permission(v_uid, p_org, 'product_management');
  v_view     := public.check_user_permission(v_uid, p_org, 'inventory.view');
  v_create   := public.check_user_permission(v_uid, p_org, 'inventory.create');
  v_edit     := public.check_user_permission(v_uid, p_org, 'inventory.edit');
  v_delete   := public.check_user_permission(v_uid, p_org, 'inventory.delete');
  v_adjust   := public.check_user_permission(v_uid, p_org, 'inventory.adjust');
  v_transfer := public.check_user_permission(v_uid, p_org, 'inventory.transfer');

  return jsonb_build_object(
    'ver', v_gestion or v_producto or v_view or v_create or v_edit or v_delete or v_adjust or v_transfer,
    'crear', v_gestion or v_producto or v_create,
    'editar_catalogo', v_gestion or v_producto or v_edit,
    'eliminar', v_gestion or v_producto or v_delete,
    'ajustar', v_gestion or v_adjust,
    'trasladar', v_gestion or v_transfer,
    'recibir', v_gestion or v_create,
    'producir', v_gestion or v_create,
    'garantias', v_gestion or v_edit,
    'costos', public.fn_receta_int_puede_ver_costos(p_org),
    'configurar', v_gestion
  );
end;
$$;

comment on function public.fn_inventario_permisos(integer) is
  'Acciones de inventario que el usuario de la sesión puede hacer en la organización. La UI oculta con esto; las RPC vuelven a exigir con fn_inventario_exigir_permiso.';

create or replace function public.fn_inventario_exigir_permiso(p_org integer, p_acciones text[])
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_permisos jsonb;
  v_accion text;
begin
  v_permisos := public.fn_inventario_permisos(p_org);
  foreach v_accion in array coalesce(p_acciones, array[]::text[]) loop
    if not (v_permisos ? v_accion) then
      raise exception 'accion_desconocida' using errcode = '22023', detail = v_accion;
    end if;
    if (v_permisos->>v_accion)::boolean then
      return;
    end if;
  end loop;
  raise exception 'sin_permiso' using errcode = '42501',
    detail = 'No tienes permiso para esta acción de inventario: ' || array_to_string(p_acciones, ', ');
end;
$$;

comment on function public.fn_inventario_exigir_permiso(integer, text[]) is
  'Exige al menos una de las acciones de fn_inventario_permisos (ver, crear, editar_catalogo, eliminar, ajustar, trasladar, recibir, producir, garantias, costos, configurar). 42501 sin_permiso si ninguna.';

-- ── Configuración del inventario por organización ────────────────────────────
create or replace function public.fn_inventario_int_config(p_org integer)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('bloquear_venta_sin_stock', false)
         || coalesce((select os.settings from public.organization_settings os
                       where os.organization_id = p_org and os.key = 'inventario'), '{}'::jsonb);
$$;

create or replace function public.fn_inventario_config(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_org);
  return public.fn_inventario_int_config(p_org);
end;
$$;

create or replace function public.fn_inventario_config_guardar(p_org integer, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limpia jsonb := '{}'::jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['configurar']);
  if p_config ? 'bloquear_venta_sin_stock' then
    if jsonb_typeof(p_config->'bloquear_venta_sin_stock') <> 'boolean' then
      raise exception 'config_invalida' using errcode = '22023', detail = 'bloquear_venta_sin_stock';
    end if;
    v_limpia := v_limpia || jsonb_build_object('bloquear_venta_sin_stock', p_config->'bloquear_venta_sin_stock');
  end if;

  insert into public.organization_settings (organization_id, key, settings)
  values (p_org, 'inventario', v_limpia)
  on conflict (organization_id, key)
  do update set settings = public.organization_settings.settings || excluded.settings, updated_at = now();

  return public.fn_inventario_int_config(p_org);
end;
$$;

revoke all on function public.fn_inventario_permisos(integer) from anon, public;
revoke all on function public.fn_inventario_exigir_permiso(integer, text[]) from anon, public;
revoke all on function public.fn_inventario_int_config(integer) from anon, public, authenticated;
revoke all on function public.fn_inventario_config(integer) from anon, public;
revoke all on function public.fn_inventario_config_guardar(integer, jsonb) from anon, public;
grant execute on function public.fn_inventario_permisos(integer) to authenticated, service_role;
grant execute on function public.fn_inventario_exigir_permiso(integer, text[]) to authenticated, service_role;
grant execute on function public.fn_inventario_int_config(integer) to service_role;
grant execute on function public.fn_inventario_config(integer) to authenticated, service_role;
grant execute on function public.fn_inventario_config_guardar(integer, jsonb) to authenticated, service_role;
