-- Reversión de 20261123233000_ventas_netas_regla_unica.sql.
-- Devuelve pos_ventas_cifras, fn_inicio_ventas_widget, fn_inicio_ventas_rango y
-- fn_inicio_ventas_periodo a su versión anterior (CREATE OR REPLACE: mismos
-- permisos) y borra las dos funciones internas y los dos índices nuevos.

-- pos_ventas_cifras como en 20261123200752 (ventas = suma de total, con IVA y propina).
create or replace function public.pos_ventas_cifras(
  p_organization_id integer, p_branch_id integer, p_desde timestamptz, p_hasta timestamptz,
  p_desde_anterior timestamptz, p_hasta_anterior timestamptz, p_busqueda text default null,
  p_origenes text[] default null, p_estados text[] default null, p_metodos text[] default null,
  p_cliente_id uuid default null, p_cajero_id uuid default null, p_importe_min numeric default null,
  p_importe_max numeric default null, p_pagos text[] default null, p_con_saldo boolean default false,
  p_con_devolucion boolean default false, p_pendientes_sync boolean default false,
  p_canales text[] default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sucursales integer[];
  v_patron text := public.pos_ventas_patron(p_busqueda);
  v_actual jsonb;
  v_anterior jsonb;
  v_por_canal jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Rango inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > interval '400 days' then
    raise exception 'Rango demasiado largo' using errcode = '22023';
  end if;
  -- Quien vende ve lo vendido (la misma regla que fn_inicio_ventas_rango).
  if auth.uid() is not null
     and not (public.fn_caja_puede(p_organization_id, 'pos.view')
              or public.fn_caja_puede(p_organization_id, 'sales_management')
              or public.fn_caja_puede(p_organization_id, 'reports.sales')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_sucursales := public.pos_ventas_sucursales(p_organization_id, p_branch_id);

  with f as (
    select * from public.pos_ventas_filtradas(
      p_organization_id, v_sucursales, p_desde, p_hasta, v_patron,
      p_origenes, p_estados, p_metodos, p_cliente_id, p_cajero_id, p_importe_min, p_importe_max,
      p_pagos, p_con_saldo, p_con_devolucion, p_pendientes_sync, p_canales)
  ),
  -- Ventas que cuentan como vendidas: ni anuladas ni borradores.
  ef as (
    select * from f where estado not in ('anulada', 'borrador')
  ),
  impuestos as (
    -- 1) Con factura: sus líneas (cuadran con invoice_sales.tax_total).
    select it.tax_code as codigo, it.tax_rate as tasa,
           sum(case when it.tax_included then it.total_line - it.total_line / (1 + it.tax_rate / 100)
                    else it.total_line * it.tax_rate / 100 end) as monto
      from ef join public.invoice_items it on it.invoice_sales_id = ef.factura_id
     where it.tax_rate > 0
     group by 1, 2
    union all
    -- 2) Sin factura, con desglose guardado en la venta.
    select nullif(btrim(e ->> 'name'), ''), null::numeric, sum(coalesce((e ->> 'amount')::numeric, 0))
      from ef cross join lateral jsonb_array_elements(case when jsonb_typeof(ef.tax_breakdown) = 'array' then ef.tax_breakdown else '[]'::jsonb end) e
     where ef.factura_id is null
     group by 1
    union all
    -- 3) Sin factura ni desglose: el total de impuestos de la venta, sin detalle.
    select null, null::numeric, sum(ef.tax_total)
      from ef
     where ef.factura_id is null and coalesce(ef.tax_total, 0) > 0
       and (case when jsonb_typeof(ef.tax_breakdown) = 'array' then jsonb_array_length(ef.tax_breakdown) else 0 end) = 0
  ),
  detalle as (
    select codigo, tasa, round(sum(monto), 2) as monto
      from impuestos group by codigo, tasa having round(sum(monto), 2) <> 0
  )
  select jsonb_build_object(
           'ventas', round(coalesce((select sum(total) from ef), 0), 2),
           'transacciones', (select count(*) from f),
           'efectivas', (select count(*) from ef),
           'pagadas', (select count(*) from f where estado = 'pagada'),
           'pendientes', (select count(*) from f where estado in ('pendiente_pago', 'pago_parcial')),
           'anuladas', (select count(*) from f where estado = 'anulada'),
           'devueltas', (select count(*) from f where estado in ('devuelta', 'devuelta_parcial')),
           'ticket_promedio', case when (select count(*) from ef) > 0
                                   then round((select sum(total) from ef) / (select count(*) from ef), 2) else 0 end,
           'impuestos', round(coalesce((select sum(monto) from detalle), 0), 2),
           'impuestos_detalle', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'tasa', tasa, 'monto', monto) order by monto desc) from detalle), '[]'::jsonb)
         )
    into v_actual;

  -- Por canal (chips «Todos · POS · Tienda web…» y StatCard «Por canal»): los
  -- mismos filtros SIN el de canal, para que cada chip diga cuántas hay en él.
  select coalesce(jsonb_agg(jsonb_build_object('canal', g.canal, 'transacciones', g.n, 'ventas', g.v) order by g.n desc), '[]'::jsonb)
    into v_por_canal
    from (select a.canal, count(*) as n,
                 round(coalesce(sum(a.total) filter (where a.estado not in ('anulada', 'borrador')), 0), 2) as v
            from public.pos_ventas_filtradas(
              p_organization_id, v_sucursales, p_desde, p_hasta, v_patron,
              p_origenes, p_estados, p_metodos, p_cliente_id, p_cajero_id, p_importe_min, p_importe_max,
              p_pagos, p_con_saldo, p_con_devolucion, p_pendientes_sync, null) a
           group by a.canal) g;

  if p_desde_anterior is not null and p_hasta_anterior is not null and p_hasta_anterior >= p_desde_anterior then
    select jsonb_build_object(
             'ventas', round(coalesce(sum(a.total) filter (where a.estado not in ('anulada', 'borrador')), 0), 2),
             'transacciones', count(*))
      into v_anterior
      from public.pos_ventas_filtradas(
        p_organization_id, v_sucursales, p_desde_anterior, p_hasta_anterior, v_patron,
        p_origenes, p_estados, p_metodos, p_cliente_id, p_cajero_id, p_importe_min, p_importe_max,
        p_pagos, p_con_saldo, p_con_devolucion, p_pendientes_sync, p_canales) a;
  end if;

  return jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'actual', v_actual, 'anterior', v_anterior, 'por_canal', v_por_canal);
end;
$function$;


-- fn_inicio_ventas_widget como en 20261123205707.
create or replace function public.fn_inicio_ventas_widget(
  p_organization_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_desde_anterior timestamptz,
  p_hasta_anterior timestamptz,
  p_hoy_desde timestamptz,
  p_hoy_hasta timestamptz,
  p_branch_id integer default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sucursales integer[];
  v_corte timestamptz;
  v_periodo jsonb;
  v_por_canal jsonb;
  v_por_sede jsonb;
  v_anterior jsonb;
  v_hoy jsonb;
  v_semana jsonb;
  v_pedidos jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_desde is null or p_hasta is null or p_hasta <= p_desde
     or p_desde_anterior is null or p_hasta_anterior is null or p_hasta_anterior <= p_desde_anterior
     or p_hoy_desde is null or p_hoy_hasta is null or p_hoy_hasta <= p_hoy_desde then
    raise exception 'Rango inválido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > interval '400 days' or p_hoy_hasta - p_hoy_desde > interval '2 days' then
    raise exception 'Rango demasiado largo' using errcode = '22023';
  end if;
  -- Quien vende ve lo vendido (la misma regla que pos_ventas_cifras y fn_inicio_ventas_rango).
  if auth.uid() is not null
     and not (public.fn_caja_puede(p_organization_id, 'pos.view')
              or public.fn_caja_puede(p_organization_id, 'sales_management')
              or public.fn_caja_puede(p_organization_id, 'reports.sales')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_sucursales := public.pos_ventas_sucursales(p_organization_id, p_branch_id);
  v_corte := least(now(), p_hoy_hasta);

  with f as materialized (
    select x.canal, x.branch_id, x.total
      from public.pos_ventas_filtradas(
        p_organization_id, v_sucursales, p_desde, p_hasta, null, null, null, null, null, null,
        null, null, null, false, false, false, null) x
     where x.estado not in ('anulada', 'borrador')
  )
  select jsonb_build_object(
           'ventas', round(coalesce((select sum(total) from f), 0), 2),
           'efectivas', (select count(*) from f),
           'ticket_promedio', case when (select count(*) from f) > 0
                                   then round((select sum(total) from f) / (select count(*) from f), 2) else 0 end),
         coalesce((select jsonb_agg(jsonb_build_object('canal', g.canal, 'ventas', g.v, 'efectivas', g.n) order by g.v desc, g.canal)
                     from (select canal, count(*) as n, round(coalesce(sum(total), 0), 2) as v from f group by canal) g), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('id', g.branch_id, 'nombre', b.name, 'ventas', g.v, 'efectivas', g.n) order by g.v desc, b.name)
                     from (select branch_id, count(*) as n, round(coalesce(sum(total), 0), 2) as v from f group by branch_id) g
                     join public.branches b on b.id = g.branch_id), '[]'::jsonb)
    into v_periodo, v_por_canal, v_por_sede;

  select jsonb_build_object('ventas', round(coalesce(sum(x.total), 0), 2), 'efectivas', count(*))
    into v_anterior
    from public.pos_ventas_filtradas(
      p_organization_id, v_sucursales, p_desde_anterior, p_hasta_anterior, null, null, null, null, null, null,
      null, null, null, false, false, false, null) x
   where x.estado not in ('anulada', 'borrador');

  if p_hoy_desde = p_desde and p_hoy_hasta = p_hasta then
    v_hoy := v_periodo - 'ticket_promedio';
  else
    select jsonb_build_object('ventas', round(coalesce(sum(x.total), 0), 2), 'efectivas', count(*))
      into v_hoy
      from public.pos_ventas_filtradas(
        p_organization_id, v_sucursales, p_hoy_desde, p_hoy_hasta, null, null, null, null, null, null,
        null, null, null, false, false, false, null) x
     where x.estado not in ('anulada', 'borrador');
  end if;

  select jsonb_build_object('ventas', round(coalesce(sum(x.total), 0), 2), 'efectivas', count(*))
    into v_semana
    from public.pos_ventas_filtradas(
      p_organization_id, v_sucursales, p_hoy_desde - interval '7 days', v_corte - interval '7 days', null, null, null, null, null, null,
      null, null, null, false, false, false, null) x
   where x.estado not in ('anulada', 'borrador');

  begin
    v_pedidos := public.fn_inicio_pedidos_web_pendientes(p_organization_id, p_branch_id, 30);
  exception
    when others then v_pedidos := null;
  end;

  return jsonb_build_object(
    'moneda', upper(public.fn_moneda_base_organizacion(p_organization_id)),
    'periodo', v_periodo,
    'anterior', v_anterior,
    'hoy', v_hoy,
    'semana', v_semana,
    'por_canal', v_por_canal,
    'por_sede', v_por_sede,
    'sucursales', coalesce(array_length(v_sucursales, 1), 0),
    'pedidos', v_pedidos,
    'hay_ventas', exists (select 1 from public.sales s
                           where s.organization_id = p_organization_id and s.branch_id = any (v_sucursales)),
    'calculado_en', now());
end;
$function$;


-- fn_inicio_ventas_rango como estaba (sin propinas).
create or replace function public.fn_inicio_ventas_rango(p_organization_id integer, p_desde timestamp with time zone, p_hasta timestamp with time zone, p_branch_id integer default null::integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
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


-- fn_inicio_ventas_periodo como estaba (sin por cobrar).
create or replace function public.fn_inicio_ventas_periodo(p_organization_id integer, p_desde timestamp with time zone, p_hasta timestamp with time zone, p_desde_anterior timestamp with time zone, p_hasta_anterior timestamp with time zone, p_branch_id integer default null::integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
$function$;

drop function if exists public.fn_ventas_netas_cifras(integer, integer[], timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean, text[], text, text);
drop function if exists public.fn_ventas_netas_movimientos(integer, integer[], timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean, text[]);
drop index if exists public.idx_returns_org_fecha_procesadas;
drop index if exists public.idx_invoice_sales_notas_credito_fecha;
