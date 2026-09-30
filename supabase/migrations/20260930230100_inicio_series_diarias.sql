-- Inicio igual al Figma (tanda 4, 2026-09-30): series para la gráfica
-- «Ventas del periodo» (periodo actual frente al anterior, dentro de la
-- tarjeta) y para las miniaturas de «Tienda web».
--
-- - fn_inicio_ventas_rango: `actual.granularidad` ('hora' si el rango cabe en
--   dos días, si no 'dia') y `actual.serie` [{b, v}] con el neto cobrado
--   (criterio de caja, menos reintegros) por hora/día LOCAL. Es la misma regla
--   de siempre: la serie sale de los mismos CTE `cs` y `reintegros`, así que
--   suma exactamente `actual.neto`. `fn_inicio_ventas_periodo` la llama para
--   el periodo y para el anterior, y por eso devuelve las dos series sin
--   cambiar.
-- - fn_inicio_tienda_web: `granularidad` y `serie` [{b, visitantes, pedidos,
--   pagados}] del periodo actual; `pendientes` sale ahora de
--   fn_inicio_pedidos_web_pendientes (la del bloque «Hoy»), que añade
--   `por_expirar` (30 min) y `expiran_hoy`.
--
-- Horas y días en la zona de la regla única (fn_timezone_for: sucursal →
-- organización). Aditiva: las claves anteriores no cambian; los llamadores que
-- no conocen las nuevas las ignoran (KPI de Ventas del POS, resumen por módulo).
-- SECURITY DEFINER, fn_assert_acceso_org y permisos como las originales
-- (CREATE OR REPLACE conserva los privilegios: sin anon).

CREATE OR REPLACE FUNCTION public.fn_inicio_ventas_rango(p_organization_id integer, p_desde timestamp with time zone, p_hasta timestamp with time zone, p_branch_id integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sucursales integer[];
  v_duracion interval;
  v_r jsonb;
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_tz text;
  v_unidad text;
  v_paso interval;
  v_formato text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'Rango inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > interval '400 days' then
    raise exception 'Rango demasiado largo' using errcode = '22023';
  end if;
  -- Quien vende ve lo vendido: pos.view, sales_management, reports.sales o administración.
  if auth.uid() is not null
     and not (public.fn_caja_puede(p_organization_id, 'pos.view')
              or public.fn_caja_puede(p_organization_id, 'sales_management')
              or public.fn_caja_puede(p_organization_id, 'reports.sales')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_branch_id is not null then
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

  v_duracion := p_hasta - p_desde;

  -- Serie del periodo (gráfica «Ventas del periodo» del inicio): por hora si
  -- el rango cabe en dos días (Hoy, Ayer), si no por día; siempre en la zona
  -- de la regla única (sucursal → organización).
  v_tz := public.fn_timezone_for(p_organization_id, p_branch_id);
  if v_duracion <= interval '2 days' then
    v_unidad := 'hour'; v_paso := interval '1 hour'; v_formato := 'YYYY-MM-DD"T"HH24';
  else
    v_unidad := 'day'; v_paso := interval '1 day'; v_formato := 'YYYY-MM-DD';
  end if;

  with cobros as (
    select p.id as pago_id,
           p.payment_date as fecha,
           case when p.payment_date >= p_desde then 'actual' else 'anterior' end as periodo,
           (p.amount - coalesce(p.change_amount, 0)) as neto,
           coalesce(v.id::text, i.id::text) as documento,
           case
             when v.id is null then 'factura'
             when v.web_order_id is not null or v.source = 'web' then 'web'
             when v.table_session_id is not null then 'mesa'
             when v.source = 'invoice' then 'factura'
             else 'pos'
           end as canal,
           coalesce(v.branch_id, i.branch_id, p.branch_id) as sucursal,
           case when coalesce(i.total, v.total, 0) > 0
                then (p.amount - coalesce(p.change_amount, 0)) * coalesce(i.tax_total, v.tax_total, 0) / coalesce(i.total, v.total)
                else 0 end as impuesto
      from public.payments p
      left join public.accounts_receivable a
        on a.id = case when p.source = 'account_receivable' and p.source_id ~* v_uuid then p.source_id::uuid end
      left join public.invoice_sales i
        on i.id = case when p.source = 'invoice_sales' and p.source_id ~* v_uuid then p.source_id::uuid
                       when p.source = 'account_receivable' then a.invoice_id end
      left join public.sales v
        on v.id = case when p.source = 'sale' and p.source_id ~* v_uuid then p.source_id::uuid
                       else coalesce(i.sale_id, a.sale_id) end
     where p.organization_id = p_organization_id
       and p.status = 'completed'
       and p.voided_at is null
       and p.source in ('invoice_sales', 'sale', 'account_receivable')
       and p.payment_date >= p_desde - v_duracion
       and p.payment_date < p_hasta
  ),
  cs as (
    select * from cobros where sucursal = any (v_sucursales)
  ),
  reintegros as (
    select case when r.created_at >= p_desde then 'actual' else 'anterior' end as periodo, r.total_refund as monto,
           r.created_at as fecha
      from public.returns r
     where r.organization_id = p_organization_id
       and r.status = 'processed'
       and coalesce(r.refund_method, 'cash') = 'cash'
       and r.branch_id = any (v_sucursales)
       and r.created_at >= p_desde - v_duracion
       and r.created_at < p_hasta
  )
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'desde_anterior', p_desde - v_duracion,
    'actual', jsonb_build_object(
      'cobrado', round(coalesce((select sum(neto) from cs where periodo = 'actual'), 0), 2),
      'reintegros', round(coalesce((select sum(monto) from reintegros where periodo = 'actual'), 0), 2),
      'num_cobros', (select count(*) from cs where periodo = 'actual'),
      'ventas_cobradas', (select count(distinct documento) from cs where periodo = 'actual'),
      'impuestos', round(coalesce((select sum(impuesto) from cs where periodo = 'actual'), 0), 2),
      'por_canal', coalesce((select jsonb_object_agg(canal, total) from (
          select canal, round(sum(neto), 2) as total from cs where periodo = 'actual' group by canal) c), '{}'::jsonb),
      'por_sucursal', coalesce((select jsonb_object_agg(sucursal::text, total) from (
          select sucursal, round(sum(neto), 2) as total from cs where periodo = 'actual' group by sucursal) s), '{}'::jsonb),
      'facturado', round(coalesce((
          select sum(s.total) from public.sales s
           where s.organization_id = p_organization_id
             and s.branch_id = any (v_sucursales)
             and s.status not in ('void', 'draft', 'cancelled')
             and s.sale_date >= p_desde and s.sale_date < p_hasta), 0), 2),
      -- Neto (cobrado − reintegros) por hora o por día del periodo, con los
      -- huecos en 0: `b` es la hora/día local, `v` el neto.
      'granularidad', case v_unidad when 'hour' then 'hora' else 'dia' end,
      'serie', (
        select coalesce(jsonb_agg(jsonb_build_object('b', to_char(g.t, v_formato), 'v', round(coalesce(x.v, 0), 2)) order by g.t), '[]'::jsonb)
          from generate_series(date_trunc(v_unidad, p_desde at time zone v_tz),
                               date_trunc(v_unidad, (p_hasta - interval '1 microsecond') at time zone v_tz),
                               v_paso) as g(t)
          left join (
            select date_trunc(v_unidad, m.fecha at time zone v_tz) as t, sum(m.monto) as v
              from (select fecha, neto as monto from cs where periodo = 'actual'
                    union all
                    select fecha, -monto from reintegros where periodo = 'actual') m
             group by 1
          ) x on x.t = g.t
      )
    ),
    'anterior', jsonb_build_object(
      'cobrado', round(coalesce((select sum(neto) from cs where periodo = 'anterior'), 0), 2),
      'reintegros', round(coalesce((select sum(monto) from reintegros where periodo = 'anterior'), 0), 2),
      'num_cobros', (select count(*) from cs where periodo = 'anterior'),
      'ventas_cobradas', (select count(distinct documento) from cs where periodo = 'anterior')
    )
  ) into v_r;

  -- Neto (cobrado − reintegros) y ticket promedio por venta cobrada.
  v_r := jsonb_set(v_r, '{actual,neto}', to_jsonb(round((v_r #>> '{actual,cobrado}')::numeric - (v_r #>> '{actual,reintegros}')::numeric, 2)));
  v_r := jsonb_set(v_r, '{anterior,neto}', to_jsonb(round((v_r #>> '{anterior,cobrado}')::numeric - (v_r #>> '{anterior,reintegros}')::numeric, 2)));
  v_r := jsonb_set(v_r, '{actual,ticket_promedio}', to_jsonb(
    case when (v_r #>> '{actual,ventas_cobradas}')::integer > 0
         then round((v_r #>> '{actual,cobrado}')::numeric / (v_r #>> '{actual,ventas_cobradas}')::integer, 2)
         else 0 end));
  return v_r;
end;
$function$;

comment on function public.fn_inicio_ventas_rango(integer, timestamptz, timestamptz, integer) is
  'Ventas con criterio de caja (PARIDAD-DASHBOARD-INICIO §V.9c): lo cobrado por payment_date menos reintegros en efectivo, por canal y sucursal, con el periodo anterior de igual duración, y la serie del neto por hora o por día local (fn_timezone_for). Función única para los KPI de Ventas y el Inicio.';

CREATE OR REPLACE FUNCTION public.fn_inicio_tienda_web(p_organization_id integer, p_desde timestamp with time zone, p_hasta timestamp with time zone, p_desde_anterior timestamp with time zone, p_hasta_anterior timestamp with time zone, p_branch_id integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sucursales integer[];
  v_r jsonb;
  v_tz text;
  v_unidad text;
  v_paso interval;
  v_formato text;
  v_pend jsonb;
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

  -- Miniaturas (Figma «Miniatura (serie real)»): por hora si el periodo cabe
  -- en dos días, si no por día; en la zona de la regla única.
  v_tz := public.fn_timezone_for(p_organization_id, p_branch_id);
  if p_hasta - p_desde <= interval '2 days' then
    v_unidad := 'hour'; v_paso := interval '1 hour'; v_formato := 'YYYY-MM-DD"T"HH24';
  else
    v_unidad := 'day'; v_paso := interval '1 day'; v_formato := 'YYYY-MM-DD';
  end if;

  -- Pendientes ahora y los que expiran: la regla única del inicio.
  v_pend := public.fn_inicio_pedidos_web_pendientes(p_organization_id, p_branch_id, 30);

  -- Distintos con GROUP BY (agregado por hash) y no con count(distinct), que
  -- ordena: en la organización con más visitas, 3 s → 0,4 s para 60 días.
  with visitas as (
    select case when v.created_at >= p_desde then 'actual' else 'anterior' end as periodo,
           v.session_id, coalesce(v.ip_hash, v.session_id) as visitante, v.is_new_visitor,
           date_trunc(v_unidad, v.created_at at time zone v_tz) as t
      from public.website_visits v
     where v.organization_id = p_organization_id
       and ((v.created_at >= p_desde and v.created_at < p_hasta)
            or (v.created_at >= p_desde_anterior and v.created_at < p_hasta_anterior))
  ),
  sesiones as (
    select periodo, session_id, bool_or(coalesce(is_new_visitor, false)) as nueva
      from visitas group by periodo, session_id
  ),
  -- Visitante distinto por hora/día; de ahí salen los visitantes del periodo
  -- (sin volver a agrupar las visitas crudas) y la miniatura. Medido en la
  -- organización con más visitas (30 días): la serie cuesta ~25 ms; agrupar
  -- (hora/día, visitante) directamente sobre las visitas ordenaba en disco
  -- y costaba ~200 ms.
  visitas_b as (
    select periodo, t, visitante from visitas group by periodo, t, visitante
  ),
  visitantes as (
    select periodo, visitante from visitas_b group by periodo, visitante
  ),
  visitantes_b as (
    select t, count(*) as n from visitas_b where periodo = 'actual' group by t
  ),
  pedidos as (
    select case when w.created_at >= p_desde then 'actual' else 'anterior' end as periodo,
           (w.sale_id is not null or w.payment_status = 'paid') as pagado,
           w.created_at
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
    -- Estado actual, no depende del periodo (la misma función del bloque «Hoy»).
    'pendientes', coalesce((v_pend ->> 'pendientes')::integer, 0),
    'por_expirar', coalesce((v_pend ->> 'por_expirar')::integer, 0),
    'expiran_hoy', coalesce((v_pend ->> 'expiran_hoy')::integer, 0),
    'granularidad', case v_unidad when 'hour' then 'hora' else 'dia' end,
    -- Una fila por hora/día del periodo actual, con los huecos en 0.
    'serie', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'b', to_char(g.t, v_formato),
               'visitantes', coalesce(vb.n, 0),
               'pedidos', coalesce(pb.pedidos, 0),
               'pagados', coalesce(pb.pagados, 0)) order by g.t), '[]'::jsonb)
        from generate_series(date_trunc(v_unidad, p_desde at time zone v_tz),
                             date_trunc(v_unidad, (p_hasta - interval '1 microsecond') at time zone v_tz),
                             v_paso) as g(t)
        left join visitantes_b vb on vb.t = g.t
        left join (
          select date_trunc(v_unidad, created_at at time zone v_tz) as t,
                 count(*) as pedidos, count(*) filter (where pagado) as pagados
            from pedidos where periodo = 'actual' group by 1
        ) pb on pb.t = g.t
    )
  ) into v_r;

  return v_r;
end;
$function$;

comment on function public.fn_inicio_tienda_web(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer) is
  'Tarjeta «Tienda web» del inicio: visitantes (ip_hash o sesión), sesiones, pedidos y pedidos pagados del periodo y del anterior, serie por hora o por día local para las miniaturas, y pendientes ahora con los que expiran (fn_inicio_pedidos_web_pendientes). Sin importes (web_orders no guarda moneda).';

revoke all on function public.fn_inicio_ventas_rango(integer, timestamptz, timestamptz, integer) from public, anon;
revoke all on function public.fn_inicio_tienda_web(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.fn_inicio_ventas_rango(integer, timestamptz, timestamptz, integer) to authenticated, service_role;
grant execute on function public.fn_inicio_tienda_web(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer) to authenticated, service_role;
