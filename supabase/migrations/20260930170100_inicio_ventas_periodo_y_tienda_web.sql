-- Inicio — «Ventas del periodo» por canal y tarjeta «Tienda web» (Figma «03
-- Navegación y shell», frame 445:137185). Aprobado por el dueño el 2026-09-30.
--
-- 1. `fn_inicio_ventas_periodo`: envoltorio de `fn_inicio_ventas_rango` (la
--    regla ÚNICA de ventas con criterio de caja, §V.9c de
--    PARIDAD-DASHBOARD-INICIO.md) que NO reimplementa la regla: la llama dos
--    veces, una por periodo, para que la comparación sea contra el periodo
--    anterior que elige el inicio («hoy» → ayer hasta la misma hora) y no
--    contra el rango de igual duración que calcula la función. Añade
--    `monedas`: las monedas de los cobros del periodo. Con más de una, la
--    pantalla no suma importes (`fn_inicio_ventas_rango` suma `amount` sin
--    mirar `currency`).
-- 2. `fn_inicio_tienda_web`: visitantes, sesiones, pedidos y conversión del
--    periodo y del anterior. Pedidos pendientes con el mismo criterio del
--    bloque «Hoy» (`status` y `payment_status` = pending, stock sin liberar).
--    Sin importes: `web_orders` no guarda moneda. Las visitas no tienen
--    sucursal (`website_visits` no la guarda): se cuentan de toda la tienda.
--
-- Ambas: SECURITY DEFINER, `fn_assert_acceso_org`, sucursal validada con
-- `app_branch_access`, permiso de ventas resuelto en la base, sin grant a anon.

create or replace function public.fn_inicio_ventas_periodo(
  p_organization_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_desde_anterior timestamptz,
  p_hasta_anterior timestamptz,
  p_branch_id integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actual jsonb;
  v_anterior jsonb;
  v_sucursales integer[];
  v_monedas jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_desde_anterior is null or p_hasta_anterior is null or p_hasta_anterior <= p_desde_anterior then
    raise exception 'Rango anterior inválido' using errcode = '22023';
  end if;
  -- Rango, permiso de ventas y sucursal: los valida fn_inicio_ventas_rango.
  v_actual := public.fn_inicio_ventas_rango(p_organization_id, p_desde, p_hasta, p_branch_id);
  v_anterior := public.fn_inicio_ventas_rango(p_organization_id, p_desde_anterior, p_hasta_anterior, p_branch_id);

  if p_branch_id is not null then
    v_sucursales := array[p_branch_id];
  else
    select coalesce(array_agg(b.id), array[]::integer[]) into v_sucursales
      from public.branches b
     where b.organization_id = p_organization_id
       and (auth.uid() is null or public.app_branch_access(b.id));
  end if;

  -- Monedas de los cobros del periodo (mismo universo que la función: pagos
  -- completados y no anulados de ventas, facturas y cartera). Un pago sin
  -- sucursal también cuenta: ante la duda, no se suma.
  select coalesce(jsonb_agg(distinct upper(btrim(p.currency))), '[]'::jsonb)
    into v_monedas
    from public.payments p
   where p.organization_id = p_organization_id
     and p.status = 'completed'
     and p.voided_at is null
     and p.source in ('invoice_sales', 'sale', 'account_receivable')
     and p.payment_date >= p_desde
     and p.payment_date < p_hasta
     and (p.branch_id is null or p.branch_id = any (v_sucursales));

  return jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'desde_anterior', p_desde_anterior,
    'hasta_anterior', p_hasta_anterior,
    'moneda_base', upper(public.fn_moneda_base_organizacion(p_organization_id)),
    'monedas', v_monedas,
    'actual', v_actual -> 'actual',
    'anterior', v_anterior -> 'actual'
  );
end;
$$;

comment on function public.fn_inicio_ventas_periodo(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer) is
  'Ventas del periodo del inicio: fn_inicio_ventas_rango para el periodo y para el anterior que elige el inicio, más las monedas de los cobros (no se suman monedas distintas).';

revoke all on function public.fn_inicio_ventas_periodo(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.fn_inicio_ventas_periodo(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer) to authenticated, service_role;


create or replace function public.fn_inicio_tienda_web(
  p_organization_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_desde_anterior timestamptz,
  p_hasta_anterior timestamptz,
  p_branch_id integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sucursales integer[];
  v_r jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_desde is null or p_hasta is null or p_hasta <= p_desde
     or p_desde_anterior is null or p_hasta_anterior is null or p_hasta_anterior <= p_desde_anterior then
    raise exception 'Rango inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > interval '400 days' then
    raise exception 'Rango demasiado largo' using errcode = '22023';
  end if;
  -- Los pedidos web viven en el POS («Pedidos online»): mismo permiso que ventas.
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

  -- Sin tienda web (ni pedidos ni visitas nunca), la tarjeta sobra.
  if not exists (select 1 from public.web_orders w where w.organization_id = p_organization_id)
     and not exists (select 1 from public.website_visits v where v.organization_id = p_organization_id) then
    return jsonb_build_object('activa', false);
  end if;

  -- Distintos con GROUP BY (agregado por hash) y no con count(distinct), que
  -- ordena: en la organización con más visitas, 3 s → 0,4 s para 60 días.
  with visitas as (
    select case when v.created_at >= p_desde then 'actual' else 'anterior' end as periodo,
           v.session_id, coalesce(v.ip_hash, v.session_id) as visitante, v.is_new_visitor
      from public.website_visits v
     where v.organization_id = p_organization_id
       and ((v.created_at >= p_desde and v.created_at < p_hasta)
            or (v.created_at >= p_desde_anterior and v.created_at < p_hasta_anterior))
  ),
  sesiones as (
    select periodo, session_id, bool_or(coalesce(is_new_visitor, false)) as nueva
      from visitas group by periodo, session_id
  ),
  visitantes as (
    select periodo, visitante from visitas group by periodo, visitante
  ),
  pedidos as (
    select case when w.created_at >= p_desde then 'actual' else 'anterior' end as periodo,
           (w.sale_id is not null or w.payment_status = 'paid') as pagado
      from public.web_orders w
     where w.organization_id = p_organization_id
       and w.branch_id = any (v_sucursales)
       and ((w.created_at >= p_desde and w.created_at < p_hasta)
            or (w.created_at >= p_desde_anterior and w.created_at < p_hasta_anterior))
  )
  select jsonb_build_object(
    'activa', true,
    'desde', p_desde,
    'hasta', p_hasta,
    'actual', jsonb_build_object(
      'visitantes', (select count(*) from visitantes where periodo = 'actual'),
      'sesiones', (select count(*) from sesiones where periodo = 'actual'),
      'sesiones_nuevas', (select count(*) from sesiones where periodo = 'actual' and nueva),
      'pedidos', (select count(*) from pedidos where periodo = 'actual'),
      'pedidos_pagados', (select count(*) from pedidos where periodo = 'actual' and pagado)
    ),
    'anterior', jsonb_build_object(
      'visitantes', (select count(*) from visitantes where periodo = 'anterior'),
      'sesiones', (select count(*) from sesiones where periodo = 'anterior'),
      'pedidos', (select count(*) from pedidos where periodo = 'anterior'),
      'pedidos_pagados', (select count(*) from pedidos where periodo = 'anterior' and pagado)
    ),
    -- Estado actual, no depende del periodo (mismo criterio que el bloque «Hoy»).
    'pendientes', (
      select count(*) from public.web_orders w
       where w.organization_id = p_organization_id
         and w.branch_id = any (v_sucursales)
         and w.status = 'pending'
         and w.payment_status = 'pending'
         and w.stock_released_at is null
    )
  ) into v_r;

  return v_r;
end;
$$;

comment on function public.fn_inicio_tienda_web(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer) is
  'Tarjeta «Tienda web» del inicio: visitantes (ip_hash o sesión), sesiones, pedidos y pedidos pagados del periodo y del anterior, y pendientes ahora. Sin importes (web_orders no guarda moneda).';

revoke all on function public.fn_inicio_tienda_web(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.fn_inicio_tienda_web(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer) to authenticated, service_role;
