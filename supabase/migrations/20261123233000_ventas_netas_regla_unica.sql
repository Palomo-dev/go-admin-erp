-- Una sola regla de «ventas netas» (decisión del dueño, 2026-11-23, con criterio
-- del Contador). La usan el widget de Ventas del Inicio (`fn_inicio_ventas_widget`)
-- y las cifras de «Todas las ventas» (`pos_ventas_cifras`): con el mismo rango,
-- la sucursal y los mismos filtros, el número es idéntico en las dos pantallas.
--
-- Fórmula (verificada con el MCP el 2026-11-23 sobre `sales`, `returns` e
-- `invoice_sales`):
--
--   venta neta del periodo = Σ (sales.total − sales.tax_total − sales.tip_amount)
--                              de las ventas del periodo (por sale_date) que no
--                              están anuladas ni en borrador
--                          − Σ base de las notas crédito del periodo
--                              (|total| − |tax_total|, por issue_date)
--                          − Σ base de las devoluciones del periodo SIN nota
--                              crédito válida (total_refund sin la parte de
--                              impuesto de su venta, por return_date)
--
--   · sales.tax_total ya suma IVA e INC (el devengo de la venta separa el INC de
--     ese mismo total: fn_impuesto_inc_parte). En la tienda web el subtotal trae
--     el impuesto adentro; por eso la base es total − tax_total y no subtotal.
--   · sales.total incluye la propina (Contador, 2026-11-20): la propina es pasivo
--     28150501 con los trabajadores, nunca ingreso.
--   · El domicilio (delivery_fee) sí es parte de la venta: se queda.
--   · Una devolución con nota crédito cuenta una sola vez, por la nota crédito.
--   · Devoluciones y notas crédito se restan en el periodo en que ocurren (no en
--     el de la venta), con el canal y la sede de la venta original, y solo si la
--     venta original cumple los mismos filtros del listado (cliente, cajero…).
--
-- Piezas:
--   1. fn_ventas_netas_movimientos: un renglón por venta y por devolución o nota
--      crédito, con la fórmula. Interna (solo la llaman funciones SECURITY DEFINER).
--   2. fn_ventas_netas_cifras: los totales, por canal, por sede y la serie (para
--      las mini-gráficas). Interna.
--   3. pos_ventas_cifras y fn_inicio_ventas_widget: misma firma, ahora sobre la
--      regla única (CREATE OR REPLACE conserva sus permisos).
--   4. fn_inicio_ventas_rango («Recaudado del periodo», lo COBRADO): agrega
--      `propinas` (la parte de propina de cada cobro) para aclararla en la
--      etiqueta; `impuestos` ya existía. Anticipos (customer_credit) no entran:
--      la función solo suma cobros de ventas, facturas y cartera.
--   5. fn_inicio_ventas_periodo: agrega `por_cobrar` = saldo hoy de las ventas
--      del periodo (lo vendido a crédito menos lo ya cobrado de esas ventas; la
--      cartera la mantiene el trigger de pagos, aquí solo se lee).
--   6. Índices para leer devoluciones y notas crédito por fecha.
--
-- Aditiva: sin tablas ni columnas nuevas. Reversión:
-- supabase/rollbacks/20261123233000_ventas_netas_regla_unica_rollback.sql.

-- ── 6. Índices ──────────────────────────────────────────────────────────────
create index if not exists idx_returns_org_fecha_procesadas
  on public.returns (organization_id, (coalesce(return_date, created_at)))
  where status = 'processed';

create index if not exists idx_invoice_sales_notas_credito_fecha
  on public.invoice_sales (organization_id, (coalesce(issue_date, created_at)))
  where document_type = 'credit_note';

-- ── 1. Movimientos de la venta neta ─────────────────────────────────────────
create or replace function public.fn_ventas_netas_movimientos(
  p_organization_id integer, p_sucursales integer[], p_desde timestamptz, p_hasta timestamptz,
  p_busqueda text default null, p_origenes text[] default null, p_estados text[] default null,
  p_metodos text[] default null, p_cliente_id uuid default null, p_cajero_id uuid default null,
  p_importe_min numeric default null, p_importe_max numeric default null, p_pagos text[] default null,
  p_con_saldo boolean default false, p_con_devolucion boolean default false,
  p_pendientes_sync boolean default false, p_canales text[] default null)
returns table(tipo text, venta_id uuid, fecha timestamptz, canal text, branch_id integer, estado text,
              efectiva boolean, bruto numeric, impuestos numeric, propinas numeric, neto numeric, saldo numeric)
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
-- Regla única de «ventas netas» (ver la cabecera de la migración 20261123233000):
--   neto de una venta       = total − tax_total (IVA + INC) − tip_amount
--   neto de una nota crédito = −(|total| − |tax_total|)
--   neto de una devolución sin nota crédito
--                            = −total_refund × (1 − tax_total / (total − tip_amount)) de su venta
-- `p_busqueda` llega ya como patrón (pos_ventas_patron), igual que en pos_ventas_filtradas.
begin
  if p_desde is null or p_hasta is null then
    raise exception 'Rango obligatorio' using errcode = '22023';
  end if;

  -- Ventas del periodo (todas las listadas: las anuladas y los borradores
  -- cuentan como transacción, con importe 0).
  return query
  select 'venta'::text, x.id, x.sale_date, x.canal, x.branch_id, x.estado, e.ef,
         case when e.ef then coalesce(x.total, 0) else 0 end,
         case when e.ef then coalesce(x.tax_total, 0) else 0 end,
         case when e.ef then coalesce(s.tip_amount, 0) else 0 end,
         case when e.ef then coalesce(x.total, 0) - coalesce(x.tax_total, 0) - coalesce(s.tip_amount, 0) else 0 end,
         case when x.estado in ('pendiente_pago', 'pago_parcial') then greatest(coalesce(x.balance, 0), 0) else 0 end
    from public.pos_ventas_filtradas(
      p_organization_id, p_sucursales, p_desde, p_hasta, p_busqueda, p_origenes, p_estados, p_metodos,
      p_cliente_id, p_cajero_id, p_importe_min, p_importe_max, p_pagos, p_con_saldo, p_con_devolucion,
      p_pendientes_sync, p_canales) x
    join public.sales s on s.id = x.id
   cross join lateral (select x.estado not in ('anulada', 'borrador') as ef) e;

  -- Devoluciones y notas crédito del periodo, con el canal y la sede de su venta.
  return query
  with red as (
    select 'nota_credito'::text as tipo,
           coalesce(n.sale_id, o.sale_id) as venta_id,
           coalesce(n.issue_date, n.created_at) as fecha,
           abs(coalesce(n.total, 0)) as bruto,
           abs(coalesce(n.tax_total, 0)) as impuestos
      from public.invoice_sales n
      left join public.invoice_sales o on o.id = n.related_invoice_id
     where n.organization_id = p_organization_id
       and n.document_type = 'credit_note'
       and coalesce(n.status, '') not in ('void', 'voided', 'cancelled', 'draft', 'rejected')
       and coalesce(n.issue_date, n.created_at) >= p_desde
       and coalesce(n.issue_date, n.created_at) <= p_hasta
    union all
    select 'devolucion'::text,
           r.sale_id,
           coalesce(r.return_date, r.created_at),
           coalesce(r.total_refund, 0),
           case when coalesce(s.total, 0) - coalesce(s.tip_amount, 0) > 0
                then coalesce(r.total_refund, 0) * coalesce(s.tax_total, 0) / (s.total - coalesce(s.tip_amount, 0))
                else 0 end
      from public.returns r
      join public.sales s on s.id = r.sale_id
     where r.organization_id = p_organization_id
       and r.status = 'processed'
       and r.voided_at is null
       and coalesce(r.return_date, r.created_at) >= p_desde
       and coalesce(r.return_date, r.created_at) <= p_hasta
       -- Con nota crédito válida, cuenta la nota crédito (una sola vez).
       and not exists (
         select 1 from public.invoice_sales n
          where n.id = r.credit_note_invoice_id
            and n.document_type = 'credit_note'
            and coalesce(n.status, '') not in ('void', 'voided', 'cancelled', 'draft', 'rejected'))
  ),
  -- Las ventas originales se vuelven a pasar por los MISMOS filtros (sin el de
  -- fecha): solo se resta lo de las ventas que el listado mostraría.
  limites as (
    select min(s.sale_date) as mn, max(s.sale_date) as mx
      from red
      join public.sales s on s.id = red.venta_id
     where s.organization_id = p_organization_id
       and s.branch_id = any (p_sucursales)
    having count(*) > 0
  ),
  origen as (
    select x.id, x.canal, x.branch_id, x.estado
      from limites l
     cross join lateral public.pos_ventas_filtradas(
       p_organization_id, p_sucursales, l.mn, l.mx, p_busqueda, p_origenes, p_estados, p_metodos,
       p_cliente_id, p_cajero_id, p_importe_min, p_importe_max, p_pagos, p_con_saldo, p_con_devolucion,
       p_pendientes_sync, p_canales) x
     where x.estado not in ('anulada', 'borrador')
  )
  select red.tipo, red.venta_id, red.fecha, o.canal, o.branch_id, o.estado, true,
         -red.bruto, -red.impuestos, 0::numeric, -(red.bruto - red.impuestos), 0::numeric
    from red
    join origen o on o.id = red.venta_id;
end;
$function$;

revoke all on function public.fn_ventas_netas_movimientos(integer, integer[], timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean, text[]) from public, anon, authenticated;
grant execute on function public.fn_ventas_netas_movimientos(integer, integer[], timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean, text[]) to service_role;

-- ── 2. Cifras de la venta neta ──────────────────────────────────────────────
create or replace function public.fn_ventas_netas_cifras(
  p_organization_id integer, p_sucursales integer[], p_desde timestamptz, p_hasta timestamptz,
  p_busqueda text default null, p_origenes text[] default null, p_estados text[] default null,
  p_metodos text[] default null, p_cliente_id uuid default null, p_cajero_id uuid default null,
  p_importe_min numeric default null, p_importe_max numeric default null, p_pagos text[] default null,
  p_con_saldo boolean default false, p_con_devolucion boolean default false,
  p_pendientes_sync boolean default false, p_canales text[] default null,
  p_serie text default null, p_zona text default null)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
-- Totales de fn_ventas_netas_movimientos (la regla única):
--   ventas          = Σ neto (ventas − devoluciones − notas crédito), sin IVA/INC ni propinas
--   bruto/impuestos/propinas = de las ventas efectivas, para explicar la cifra
--   devoluciones    = base de devoluciones y notas crédito del periodo
--   transacciones   = ventas listadas (con anuladas); efectivas = sin anuladas ni borradores
--   ticket_promedio = Σ neto de las ventas efectivas / efectivas (antes de devoluciones)
--   por_cobrar      = saldo hoy de las ventas del periodo
-- `p_serie` ('hora' | 'dia') agrega la serie local del periodo en `p_zona`:
-- [{b, v (neto), n (ventas efectivas), t (ticket)}], con los huecos en 0.
declare
  v jsonb;
  v_unidad text;
  v_paso interval;
  v_formato text;
  v_zona text := coalesce(nullif(btrim(p_zona), ''), 'America/Bogota');
begin
  if p_serie is not null and p_serie not in ('hora', 'dia') then
    raise exception 'Serie inválida' using errcode = '22023';
  end if;
  if p_serie = 'hora' then
    v_unidad := 'hour'; v_paso := interval '1 hour'; v_formato := 'YYYY-MM-DD"T"HH24';
  else
    v_unidad := 'day'; v_paso := interval '1 day'; v_formato := 'YYYY-MM-DD';
  end if;

  with m as materialized (
    select * from public.fn_ventas_netas_movimientos(
      p_organization_id, p_sucursales, p_desde, p_hasta, p_busqueda, p_origenes, p_estados, p_metodos,
      p_cliente_id, p_cajero_id, p_importe_min, p_importe_max, p_pagos, p_con_saldo, p_con_devolucion,
      p_pendientes_sync, p_canales)
  )
  select jsonb_build_object(
    'ventas', round(coalesce(sum(m.neto), 0), 2),
    'bruto', round(coalesce(sum(m.bruto) filter (where m.tipo = 'venta'), 0), 2),
    'impuestos', round(coalesce(sum(m.impuestos) filter (where m.tipo = 'venta'), 0), 2),
    'propinas', round(coalesce(sum(m.propinas) filter (where m.tipo = 'venta'), 0), 2),
    'devoluciones', round(coalesce(-sum(m.neto) filter (where m.tipo <> 'venta'), 0), 2),
    'transacciones', count(*) filter (where m.tipo = 'venta'),
    'efectivas', count(*) filter (where m.tipo = 'venta' and m.efectiva),
    'ticket_promedio', case when count(*) filter (where m.tipo = 'venta' and m.efectiva) > 0
                            then round(sum(m.neto) filter (where m.tipo = 'venta' and m.efectiva)
                                       / count(*) filter (where m.tipo = 'venta' and m.efectiva), 2)
                            else 0 end,
    'por_cobrar', round(coalesce(sum(m.saldo), 0), 2),
    'por_canal', coalesce((
       select jsonb_agg(jsonb_build_object('canal', g.canal, 'ventas', g.v, 'efectivas', g.e, 'transacciones', g.n)
                        order by g.n desc, g.v desc, g.canal)
         from (select m2.canal,
                      round(coalesce(sum(m2.neto), 0), 2) as v,
                      count(*) filter (where m2.tipo = 'venta' and m2.efectiva) as e,
                      count(*) filter (where m2.tipo = 'venta') as n
                 from m m2 group by m2.canal) g), '[]'::jsonb),
    'por_sede', coalesce((
       select jsonb_agg(jsonb_build_object('id', g.branch_id, 'ventas', g.v, 'efectivas', g.e) order by g.v desc, g.branch_id)
         from (select m2.branch_id,
                      round(coalesce(sum(m2.neto), 0), 2) as v,
                      count(*) filter (where m2.tipo = 'venta' and m2.efectiva) as e
                 from m m2 group by m2.branch_id) g), '[]'::jsonb),
    'serie', case when p_serie is null then null else (
       select coalesce(jsonb_agg(jsonb_build_object(
                'b', to_char(g.t, v_formato),
                'v', round(coalesce(x.v, 0), 2),
                'n', coalesce(x.n, 0),
                't', case when coalesce(x.n, 0) > 0 then round(x.vv / x.n, 2) else 0 end) order by g.t), '[]'::jsonb)
         from generate_series(date_trunc(v_unidad, p_desde at time zone v_zona),
                              date_trunc(v_unidad, (p_hasta - interval '1 microsecond') at time zone v_zona),
                              v_paso) as g(t)
         left join (
           select date_trunc(v_unidad, m2.fecha at time zone v_zona) as t,
                  sum(m2.neto) as v,
                  sum(m2.neto) filter (where m2.tipo = 'venta' and m2.efectiva) as vv,
                  count(*) filter (where m2.tipo = 'venta' and m2.efectiva) as n
             from m m2 group by 1
         ) x on x.t = g.t) end
  ) into v
  from m;
  return v;
end;
$function$;

revoke all on function public.fn_ventas_netas_cifras(integer, integer[], timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean, text[], text, text) from public, anon, authenticated;
grant execute on function public.fn_ventas_netas_cifras(integer, integer[], timestamptz, timestamptz, text, text[], text[], text[], uuid, uuid, numeric, numeric, text[], boolean, boolean, boolean, text[], text, text) to service_role;

-- ── 3a. Cifras de «Todas las ventas» sobre la regla única ───────────────────
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
  v_netas jsonb;
  v_todas jsonb;
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
           'transacciones', (select count(*) from f),
           'efectivas', (select count(*) from ef),
           'pagadas', (select count(*) from f where estado = 'pagada'),
           'pendientes', (select count(*) from f where estado in ('pendiente_pago', 'pago_parcial')),
           'anuladas', (select count(*) from f where estado = 'anulada'),
           'devueltas', (select count(*) from f where estado in ('devuelta', 'devuelta_parcial')),
           'impuestos', round(coalesce((select sum(monto) from detalle), 0), 2),
           'impuestos_detalle', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'tasa', tasa, 'monto', monto) order by monto desc) from detalle), '[]'::jsonb)
         )
    into v_actual;

  -- Ventas netas (regla única, fn_ventas_netas_cifras): «Ventas del periodo» y
  -- el ticket. Por canal (chips y StatCard), con todos los filtros MENOS el de
  -- canal, para que cada chip diga cuántas hay en él.
  v_todas := public.fn_ventas_netas_cifras(
    p_organization_id, v_sucursales, p_desde, p_hasta, v_patron,
    p_origenes, p_estados, p_metodos, p_cliente_id, p_cajero_id, p_importe_min, p_importe_max,
    p_pagos, p_con_saldo, p_con_devolucion, p_pendientes_sync, null);
  if p_canales is null then
    v_netas := v_todas;
  else
    v_netas := public.fn_ventas_netas_cifras(
      p_organization_id, v_sucursales, p_desde, p_hasta, v_patron,
      p_origenes, p_estados, p_metodos, p_cliente_id, p_cajero_id, p_importe_min, p_importe_max,
      p_pagos, p_con_saldo, p_con_devolucion, p_pendientes_sync, p_canales);
  end if;
  v_actual := v_actual || jsonb_build_object(
    'ventas', v_netas -> 'ventas',
    'ticket_promedio', v_netas -> 'ticket_promedio',
    'bruto', v_netas -> 'bruto',
    'impuestos_ventas', v_netas -> 'impuestos',
    'propinas', v_netas -> 'propinas',
    'devoluciones', v_netas -> 'devoluciones',
    'por_cobrar', v_netas -> 'por_cobrar');

  select coalesce(jsonb_agg(jsonb_build_object('canal', c ->> 'canal', 'transacciones', (c ->> 'transacciones')::integer, 'ventas', (c ->> 'ventas')::numeric)
                            order by (c ->> 'transacciones')::integer desc), '[]'::jsonb)
    into v_por_canal
    from jsonb_array_elements(v_todas -> 'por_canal') c
   where (c ->> 'transacciones')::integer > 0;

  if p_desde_anterior is not null and p_hasta_anterior is not null and p_hasta_anterior >= p_desde_anterior then
    select jsonb_build_object('ventas', a -> 'ventas', 'transacciones', a -> 'transacciones')
      into v_anterior
      from public.fn_ventas_netas_cifras(
        p_organization_id, v_sucursales, p_desde_anterior, p_hasta_anterior, v_patron,
        p_origenes, p_estados, p_metodos, p_cliente_id, p_cajero_id, p_importe_min, p_importe_max,
        p_pagos, p_con_saldo, p_con_devolucion, p_pendientes_sync, p_canales) a;
  end if;

  return jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'actual', v_actual, 'anterior', v_anterior, 'por_canal', v_por_canal);
end;
$function$;

-- ── 3b. Widget de Ventas del Inicio sobre la regla única ────────────────────
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
  v_zona text;
  v_unidad text;
  v_periodo jsonb;
  v_anterior jsonb;
  v_hoy jsonb;
  v_semana jsonb;
  v_pedidos jsonb;
  v_por_sede jsonb;
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
  -- La zona de la regla única (sucursal → organización), la misma del rango.
  v_zona := public.fn_timezone_for(p_organization_id, p_branch_id);
  v_unidad := case when p_hasta - p_desde <= interval '2 days' then 'hora' else 'dia' end;

  -- Ventas netas (regla única): periodo con su serie (mini-gráficas de
  -- «Ventas del periodo» y «Ticket promedio»), anterior, hoy por hora y el
  -- mismo día de la semana pasada hasta esta misma hora.
  v_periodo := public.fn_ventas_netas_cifras(
    p_organization_id => p_organization_id, p_sucursales => v_sucursales,
    p_desde => p_desde, p_hasta => p_hasta, p_serie => v_unidad, p_zona => v_zona);
  v_anterior := public.fn_ventas_netas_cifras(
    p_organization_id => p_organization_id, p_sucursales => v_sucursales,
    p_desde => p_desde_anterior, p_hasta => p_hasta_anterior);
  if p_hoy_desde = p_desde and p_hoy_hasta = p_hasta then
    v_hoy := v_periodo;
  else
    v_hoy := public.fn_ventas_netas_cifras(
      p_organization_id => p_organization_id, p_sucursales => v_sucursales,
      p_desde => p_hoy_desde, p_hasta => p_hoy_hasta, p_serie => 'hora', p_zona => v_zona);
  end if;
  v_semana := public.fn_ventas_netas_cifras(
    p_organization_id => p_organization_id, p_sucursales => v_sucursales,
    p_desde => p_hoy_desde - interval '7 days', p_hasta => v_corte - interval '7 days');

  select coalesce(jsonb_agg(jsonb_build_object('id', (s ->> 'id')::integer, 'nombre', b.name,
                                               'ventas', (s ->> 'ventas')::numeric, 'efectivas', (s ->> 'efectivas')::integer)
                            order by (s ->> 'ventas')::numeric desc, b.name), '[]'::jsonb)
    into v_por_sede
    from jsonb_array_elements(v_periodo -> 'por_sede') s
    join public.branches b on b.id = (s ->> 'id')::integer;

  begin
    v_pedidos := public.fn_inicio_pedidos_web_pendientes(p_organization_id, p_branch_id, 30);
  exception
    when others then v_pedidos := null;
  end;

  return jsonb_build_object(
    'moneda', upper(public.fn_moneda_base_organizacion(p_organization_id)),
    'periodo', jsonb_build_object(
                 'ventas', v_periodo -> 'ventas', 'efectivas', v_periodo -> 'efectivas',
                 'ticket_promedio', v_periodo -> 'ticket_promedio', 'bruto', v_periodo -> 'bruto',
                 'impuestos', v_periodo -> 'impuestos', 'propinas', v_periodo -> 'propinas',
                 'devoluciones', v_periodo -> 'devoluciones'),
    'anterior', jsonb_build_object('ventas', v_anterior -> 'ventas', 'efectivas', v_anterior -> 'efectivas'),
    'hoy', jsonb_build_object('ventas', v_hoy -> 'ventas', 'efectivas', v_hoy -> 'efectivas'),
    'semana', jsonb_build_object('ventas', v_semana -> 'ventas', 'efectivas', v_semana -> 'efectivas'),
    -- Día de la semana del comparativo (0 = domingo) en la zona de la regla.
    'semana_dia', extract(dow from ((p_hoy_desde - interval '7 days') at time zone v_zona))::integer,
    'granularidad', v_unidad,
    'serie_periodo', coalesce(v_periodo -> 'serie', '[]'::jsonb),
    'serie_hoy', coalesce(v_hoy -> 'serie', '[]'::jsonb),
    'por_canal', (select coalesce(jsonb_agg(jsonb_build_object('canal', c ->> 'canal', 'ventas', (c ->> 'ventas')::numeric,
                                                               'efectivas', (c ->> 'efectivas')::integer)
                                            order by (c ->> 'ventas')::numeric desc, c ->> 'canal'), '[]'::jsonb)
                    from jsonb_array_elements(v_periodo -> 'por_canal') c
                   where (c ->> 'efectivas')::integer > 0 or (c ->> 'ventas')::numeric <> 0),
    'por_sede', v_por_sede,
    'sucursales', coalesce(array_length(v_sucursales, 1), 0),
    'pedidos', v_pedidos,
    'hay_ventas', exists (select 1 from public.sales s
                           where s.organization_id = p_organization_id and s.branch_id = any (v_sucursales)),
    'calculado_en', now());
end;
$function$;

-- ── 4. «Recaudado del periodo»: la parte de propina de cada cobro ───────────
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

  -- Serie del periodo (gráfica «Recaudado del periodo» del inicio): por hora si
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
                else 0 end as impuesto,
           -- Propina (pasivo 28150501, Contador 2026-11-20): su parte del cobro.
           case when coalesce(v.total, 0) > 0
                then (p.amount - coalesce(p.change_amount, 0)) * coalesce(v.tip_amount, 0) / v.total
                else 0 end as propina
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
      'propinas', round(coalesce((select sum(propina) from cs where periodo = 'actual'), 0), 2),
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

-- ── 5. «Por cobrar del periodo» junto a «Recaudado del periodo» ─────────────
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
  v_por_cobrar numeric;
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

  -- «Por cobrar del periodo»: saldo hoy de las ventas del periodo (regla única
  -- de ventas). Si falla, la tarjeta sigue sin la línea.
  begin
    v_por_cobrar := (public.fn_ventas_netas_cifras(
      p_organization_id => p_organization_id, p_sucursales => v_sucursales,
      p_desde => p_desde, p_hasta => p_hasta) ->> 'por_cobrar')::numeric;
  exception
    when others then v_por_cobrar := null;
  end;

  return jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'desde_anterior', p_desde_anterior,
    'hasta_anterior', p_hasta_anterior,
    'moneda_base', upper(public.fn_moneda_base_organizacion(p_organization_id)),
    'monedas', v_monedas,
    'actual', v_actual -> 'actual',
    'anterior', v_anterior -> 'actual',
    'por_cobrar', v_por_cobrar
  );
end;
$function$;
