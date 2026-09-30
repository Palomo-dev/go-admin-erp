-- Inicio igual al Figma (tanda 4, 2026-09-30): pedidos web pendientes y los
-- que expiran pronto, en UNA función que usan el bloque «Hoy» (casilla
-- «Pedidos web · N pendientes · N expiran en menos de 30 min») y la tarjeta
-- «Tienda web» («N pendientes · N expiran hoy»).
--
-- Criterio de expiración: el mismo de `expire_pending_web_orders` (quien de
-- verdad expira los pedidos): `organization_settings` key 'web_commerce',
-- campo `order_expiration_minutes`; sin él, 1440 min para pagos manuales
-- (transferencia, efectivo, Bancolombia, PSE) y 30 min para el resto. El panel
-- de observabilidad de Pedidos online (`/api/web-orders/observability`) repite
-- la misma regla en Node: unificar las tres es trabajo aparte.
--
-- SECURITY DEFINER con `fn_assert_acceso_org`, permiso de ventas resuelto en
-- la base (el de la tarjeta «Tienda web») y sucursal con `app_branch_access`.
-- Días en la zona de la regla única (`fn_timezone_for`: sucursal → organización).

create or replace function public.fn_inicio_pedidos_web_pendientes(
  p_organization_id integer,
  p_branch_id integer default null,
  p_minutos integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sucursales integer[];
  v_tz text;
  v_fin_hoy timestamptz;
  v_crudo text;
  v_minutos_org integer;
  v_r jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_minutos is null or p_minutos < 1 or p_minutos > 1440 then
    raise exception 'Minutos inválidos' using errcode = '22023';
  end if;
  if auth.uid() is not null
     and not (public.fn_caja_puede(p_organization_id, 'pos.view')
              or public.fn_caja_puede(p_organization_id, 'sales_management')
              or public.fn_caja_puede(p_organization_id, 'reports.sales')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_branch_id is not null then
    if not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
      raise exception 'Sucursal no válida' using errcode = '22023';
    end if;
    if auth.uid() is not null and not public.app_branch_access(p_branch_id) then
      raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
    end if;
    v_sucursales := array[p_branch_id];
  else
    select coalesce(array_agg(b.id), array[]::integer[]) into v_sucursales
      from public.branches b
     where b.organization_id = p_organization_id
       and (auth.uid() is null or public.app_branch_access(b.id));
  end if;

  v_tz := public.fn_timezone_for(p_organization_id, p_branch_id);
  v_fin_hoy := ((now() at time zone v_tz)::date + 1)::timestamp at time zone v_tz;

  -- Minutos configurados por la organización (0 o texto raro = sin configurar).
  select os.settings->>'order_expiration_minutes' into v_crudo
    from public.organization_settings os
   where os.organization_id = p_organization_id and os.key = 'web_commerce'
   limit 1;
  if v_crudo ~ '^[0-9]{1,6}$' then
    v_minutos_org := nullif(v_crudo::integer, 0);
  end if;

  with pendientes as (
    select w.created_at + make_interval(mins => coalesce(
             v_minutos_org,
             case when w.payment_method in ('transfer', 'cash', 'bancolombia_transfer', 'bancolombia_collect', 'pse')
                  then 1440 else 30 end)) as expira
      from public.web_orders w
     where w.organization_id = p_organization_id
       and w.branch_id = any (v_sucursales)
       and w.status = 'pending'
       and w.payment_status = 'pending'
       and w.stock_released_at is null
  )
  select jsonb_build_object(
    'pendientes', count(*),
    'por_expirar', count(*) filter (where expira >= now() and expira <= now() + make_interval(mins => p_minutos)),
    'expiran_hoy', count(*) filter (where expira >= now() and expira < v_fin_hoy),
    'minutos', p_minutos,
    -- ¿La organización vende por la tienda web? Sin ningún pedido nunca, la
    -- casilla de «Hoy» sobra.
    'hay_pedidos', exists (select 1 from public.web_orders w where w.organization_id = p_organization_id)
  ) into v_r
  from pendientes;

  return v_r;
end;
$$;

comment on function public.fn_inicio_pedidos_web_pendientes(integer, integer, integer) is
  'Inicio: pedidos web pendientes (status y payment_status pending, stock sin liberar), cuántos expiran en los próximos p_minutos y cuántos antes de acabar el día (zona fn_timezone_for). Criterio de expiración de expire_pending_web_orders.';

revoke all on function public.fn_inicio_pedidos_web_pendientes(integer, integer, integer) from public, anon;
grant execute on function public.fn_inicio_pedidos_web_pendientes(integer, integer, integer) to authenticated, service_role;
