-- Reportes de ventas ampliados (Figma «14 Reportes», sección 2733:51399,
-- aprobado 2026-11-22).
--
-- 1. Falla corregida: «Ventas por hora» y el «por día» de «Ventas del
--    periodo» agrupaban con la zona de la base (UTC): en Colombia una venta de
--    las 8 p. m. caía a la 1 a. m. y en el día siguiente. Ahora agrupan con la
--    zona de la organización (fn_timezone_for).
-- 2. reporte_ventas_base: la única definición de «qué ventas entran» y «de
--    quién es la venta» para los reportes nuevos (cajero = quien la registra,
--    vendedor = salesperson_id o quien la registra, mesero = tip_server_id), con
--    los filtros persona y método de pago. Interna: solo la llaman las
--    fn_reporte_* (SECURITY DEFINER), nadie tiene EXECUTE.
-- 3. fn_reporte_ventas_personas: por persona, por método de pago (lo cobrado),
--    por día y por hora.
-- 4. fn_reporte_mas_vendido: por producto, los 3 primeros de cada hora y los 10
--    primeros de cada sede.
-- 5. fn_reporte_items_vendidos: línea por línea (o solo las que llevan
--    descuento), paginado, con totales y descuentos por persona.
-- 6. fn_reporte_despachos: envíos (shipments) y traslados entre sedes.
-- Las ventas que cuentan son las mismas de los reportes existentes: estado
-- distinto de cancelled/void.

-- ── 1 ── Hora y día en la zona de la organización ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reporte_ventas_por_hora(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone, p_branch_id bigint DEFAULT NULL::bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_por_hora jsonb;
  v_por_hora_sede jsonb;
  v_tz text;
BEGIN
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Alcance de sucursal (ver reporte_exigir_alcance_sucursal).
  PERFORM public.reporte_exigir_alcance_sucursal(p_organization_id, p_branch_id);

  -- La hora es la del reloj de la organización, no la de la base (UTC).
  v_tz := public.fn_timezone_for(p_organization_id::integer, p_branch_id::integer);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'hora', h.hora,
    'total', h.total,
    'num_ventas', h.cantidad
  )), '[]'::jsonb) INTO v_por_hora
  FROM (
    SELECT EXTRACT(HOUR FROM (s.sale_date AT TIME ZONE v_tz))::int AS hora,
           COALESCE(SUM(s.total), 0) AS total,
           COUNT(*) AS cantidad
    FROM sales s
    WHERE s.organization_id = p_organization_id
      AND s.sale_date >= p_from AND s.sale_date <= p_to
      AND s.status NOT IN ('cancelled', 'void')
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    GROUP BY 1
    ORDER BY hora
  ) h;

  -- Hora × sede (pestaña «Por sede»).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'hora', h.hora,
    'sucursal_id', h.branch_id,
    'total', h.total,
    'num_ventas', h.cantidad
  ) ORDER BY h.hora, h.branch_id), '[]'::jsonb) INTO v_por_hora_sede
  FROM (
    SELECT EXTRACT(HOUR FROM (s.sale_date AT TIME ZONE v_tz))::int AS hora,
           s.branch_id,
           COALESCE(SUM(s.total), 0) AS total,
           COUNT(*) AS cantidad
    FROM sales s
    WHERE s.organization_id = p_organization_id
      AND s.sale_date >= p_from AND s.sale_date <= p_to
      AND s.status NOT IN ('cancelled', 'void')
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    GROUP BY 1, 2
  ) h;

  RETURN jsonb_build_object('por_hora', v_por_hora, 'por_hora_sede', v_por_hora_sede, 'zona', v_tz);
END;
$function$;

DO $$
DECLARE
  v_def text := pg_get_functiondef('public.fn_reporte_ventas_resumen(bigint, timestamptz, timestamptz, bigint)'::regprocedure);
  v_nuevo text;
BEGIN
  IF position('AT TIME ZONE public.fn_timezone_for' IN v_def) > 0 THEN
    RETURN;
  END IF;
  v_nuevo := replace(v_def, 'SELECT DATE(s.sale_date) AS dia,',
    'SELECT (s.sale_date AT TIME ZONE public.fn_timezone_for(p_organization_id::integer, p_branch_id::integer))::date AS dia,');
  v_nuevo := replace(v_nuevo, 'GROUP BY DATE(s.sale_date)', 'GROUP BY 1');
  IF v_nuevo = v_def OR position('DATE(s.sale_date)' IN v_nuevo) > 0 THEN
    RAISE EXCEPTION 'fn_reporte_ventas_resumen cambió: no aparecen las anclas del día';
  END IF;
  EXECUTE v_nuevo;
END;
$$;

-- ── 2 ── Qué ventas entran y de quién son ─────────────────────────────────
-- Pagos completados de una venta: los de su factura y los que apuntan a la venta.
CREATE OR REPLACE FUNCTION public.reporte_pagos_venta(p_organization_id bigint, p_sale_id uuid)
RETURNS TABLE (metodo text, monto numeric, cobrado_por uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.method, coalesce(p.amount, 0), p.created_by
    FROM public.invoice_sales i
    JOIN public.payments p
      ON p.organization_id = i.organization_id
     AND p.source = 'invoice_sales' AND p.source_id = i.id::text
   WHERE i.organization_id = p_organization_id AND i.sale_id = p_sale_id
     AND coalesce(i.document_type, 'invoice') = 'invoice'
     AND p.status = 'completed'
  UNION ALL
  SELECT p.method, coalesce(p.amount, 0), p.created_by
    FROM public.payments p
   WHERE p.organization_id = p_organization_id
     AND p.source = 'sale' AND p.source_id = p_sale_id::text
     AND p.status = 'completed'
$$;

COMMENT ON FUNCTION public.reporte_pagos_venta(bigint, uuid) IS
  'Pagos completados de una venta (los de su factura y los registrados contra la venta). Interna de los reportes de ventas.';

CREATE OR REPLACE FUNCTION public.reporte_ventas_base(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_branch_id bigint DEFAULT NULL,
  p_contar_por text DEFAULT 'cajero',
  p_persona uuid DEFAULT NULL,
  p_metodos text[] DEFAULT NULL
)
RETURNS TABLE (
  sale_id uuid,
  branch_id integer,
  persona uuid,
  registrada_por uuid,
  local_ts timestamp without time zone,
  total numeric,
  descuento numeric,
  propina numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH tz AS (
    SELECT public.fn_timezone_for(p_organization_id::integer, p_branch_id::integer) AS z
  ),
  v AS (
    SELECT s.id, s.branch_id, s.user_id, s.total, s.discount_total, s.tip_amount, s.sale_date,
           CASE coalesce(p_contar_por, 'cajero')
             WHEN 'vendedor' THEN coalesce(s.salesperson_id, s.user_id)
             WHEN 'mesero' THEN s.tip_server_id
             ELSE s.user_id
           END AS persona
      FROM public.sales s
     WHERE s.organization_id = p_organization_id
       AND s.sale_date >= p_from AND s.sale_date <= p_to
       AND s.status NOT IN ('cancelled', 'void')
       AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
  )
  SELECT v.id, v.branch_id, v.persona, v.user_id, (v.sale_date AT TIME ZONE tz.z),
         coalesce(v.total, 0), coalesce(v.discount_total, 0), coalesce(v.tip_amount, 0)
    FROM v CROSS JOIN tz
   WHERE (p_persona IS NULL OR v.persona = p_persona)
     AND (p_metodos IS NULL OR cardinality(p_metodos) = 0 OR EXISTS (
           SELECT 1 FROM public.reporte_pagos_venta(p_organization_id, v.id) pg
            WHERE pg.metodo = ANY (p_metodos)))
$$;

COMMENT ON FUNCTION public.reporte_ventas_base(bigint, timestamptz, timestamptz, bigint, text, uuid, text[]) IS
  'Ventas de los reportes de ventas (estado distinto de cancelled/void) con su persona según «Contar por» (cajero = user_id, vendedor = salesperson_id o user_id, mesero = tip_server_id), la hora local de la organización y los filtros persona y método de pago. Interna: solo la llaman las fn_reporte_*.';

-- ── 3 ── Ventas por persona ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reporte_ventas_personas(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_branch_id bigint DEFAULT NULL,
  p_contar_por text DEFAULT 'cajero',
  p_persona uuid DEFAULT NULL,
  p_metodos text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  PERFORM public.reporte_exigir_alcance_sucursal(p_organization_id, p_branch_id);

  IF coalesce(p_contar_por, 'cajero') NOT IN ('cajero', 'vendedor', 'mesero') THEN
    RAISE EXCEPTION 'contar_por_invalido' USING ERRCODE = '22023';
  END IF;

  WITH b AS (
    SELECT * FROM public.reporte_ventas_base(p_organization_id, p_from, p_to, p_branch_id, p_contar_por, p_persona, p_metodos)
  ),
  pg AS (
    -- Lo cobrado: con «Cajero» cuenta quien registró el pago; si no quedó, quien registró la venta.
    SELECT CASE WHEN coalesce(p_contar_por, 'cajero') = 'cajero' THEN coalesce(x.cobrado_por, b.persona) ELSE b.persona END AS persona,
           b.branch_id, x.metodo, x.monto
      FROM b CROSS JOIN LATERAL public.reporte_pagos_venta(p_organization_id, b.sale_id) x
     WHERE p_metodos IS NULL OR cardinality(p_metodos) = 0 OR x.metodo = ANY (p_metodos)
  ),
  sedes AS (
    SELECT persona, branch_id, count(*) AS n,
           row_number() OVER (PARTITION BY persona ORDER BY count(*) DESC, branch_id) AS orden
      FROM b GROUP BY persona, branch_id
  )
  SELECT jsonb_build_object(
    'totales', (SELECT jsonb_build_object(
                  'total', coalesce(sum(total), 0), 'num_ventas', count(*),
                  'descuentos', coalesce(sum(descuento), 0), 'propinas', coalesce(sum(propina), 0))
                FROM b),
    'por_persona', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'persona_id', r.persona, 'sucursal_id', s1.branch_id, 'sedes', r.sedes,
                      'num_ventas', r.n, 'total', r.total, 'descuentos', r.descuentos, 'propinas', r.propinas)
                      ORDER BY r.total DESC), '[]'::jsonb)
                    FROM (SELECT persona, count(*) AS n, sum(total) AS total, sum(descuento) AS descuentos,
                                 sum(propina) AS propinas, count(DISTINCT branch_id) AS sedes
                            FROM b GROUP BY persona) r
                    LEFT JOIN sedes s1 ON s1.persona IS NOT DISTINCT FROM r.persona AND s1.orden = 1),
    'por_metodo', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'persona_id', m.persona, 'metodo', m.metodo, 'monto', m.monto, 'pagos', m.n)
                     ORDER BY m.persona, m.monto DESC), '[]'::jsonb)
                   FROM (SELECT persona, metodo, sum(monto) AS monto, count(*) AS n FROM pg GROUP BY persona, metodo) m),
    'por_dia', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'persona_id', d.persona, 'fecha', d.dia, 'total', d.total, 'num_ventas', d.n)
                  ORDER BY d.dia, d.persona), '[]'::jsonb)
                FROM (SELECT persona, local_ts::date AS dia, sum(total) AS total, count(*) AS n FROM b GROUP BY 1, 2) d),
    'por_hora', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'persona_id', h.persona, 'hora', h.hora, 'total', h.total, 'num_ventas', h.n)
                   ORDER BY h.hora, h.persona), '[]'::jsonb)
                 FROM (SELECT persona, extract(hour FROM local_ts)::int AS hora, sum(total) AS total, count(*) AS n FROM b GROUP BY 1, 2) h),
    'devoluciones', (SELECT coalesce(sum(r.total_refund), 0)
                       FROM public.returns r
                      WHERE r.organization_id = p_organization_id
                        AND coalesce(r.return_date, r.created_at) >= p_from AND coalesce(r.return_date, r.created_at) <= p_to
                        AND coalesce(r.status, 'processed') NOT IN ('void', 'cancelled', 'anulado')
                        AND (p_branch_id IS NULL OR r.branch_id = p_branch_id))
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

COMMENT ON FUNCTION public.fn_reporte_ventas_personas(bigint, timestamptz, timestamptz, bigint, text, uuid, text[]) IS
  'Reporte «Ventas por persona» y pestañas por persona del resumen del POS: totales, por persona, por método de pago (lo cobrado), por día y por hora local. contar_por: cajero | vendedor | mesero.';

-- ── 4 ── Lo más vendido ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reporte_mas_vendido(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_branch_id bigint DEFAULT NULL,
  p_contar_por text DEFAULT 'cajero',
  p_persona uuid DEFAULT NULL,
  p_metodos text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  PERFORM public.reporte_exigir_alcance_sucursal(p_organization_id, p_branch_id);

  WITH b AS (
    SELECT * FROM public.reporte_ventas_base(p_organization_id, p_from, p_to, p_branch_id, p_contar_por, p_persona, p_metodos)
  ),
  l AS (
    SELECT b.branch_id, extract(hour FROM b.local_ts)::int AS hora, si.product_id,
           coalesce(si.quantity, 0) AS unidades, coalesce(si.total, 0) AS ingreso
      FROM b JOIN public.sale_items si ON si.sale_id = b.sale_id
  ),
  prod AS (
    SELECT p.id, p.name, p.sku, c.name AS categoria
      FROM public.products p
      LEFT JOIN public.categories c ON c.id = p.category_id
     WHERE p.organization_id = p_organization_id
       AND p.id IN (SELECT DISTINCT product_id FROM l)
  ),
  por_producto AS (
    SELECT product_id, sum(unidades) AS unidades, sum(ingreso) AS ingreso FROM l GROUP BY product_id
  ),
  por_hora AS (
    SELECT hora, product_id, sum(unidades) AS unidades, sum(ingreso) AS ingreso,
           sum(sum(ingreso)) OVER (PARTITION BY hora) AS total_franja,
           row_number() OVER (PARTITION BY hora ORDER BY sum(ingreso) DESC, sum(unidades) DESC, product_id) AS puesto
      FROM l GROUP BY hora, product_id
  ),
  por_sede AS (
    SELECT branch_id, product_id, sum(unidades) AS unidades, sum(ingreso) AS ingreso,
           sum(sum(ingreso)) OVER (PARTITION BY branch_id) AS total_sede,
           row_number() OVER (PARTITION BY branch_id ORDER BY sum(ingreso) DESC, sum(unidades) DESC, product_id) AS puesto
      FROM l GROUP BY branch_id, product_id
  )
  SELECT jsonb_build_object(
    'totales', (SELECT jsonb_build_object('unidades', coalesce(sum(unidades), 0), 'ingreso', coalesce(sum(ingreso), 0),
                                          'productos', count(DISTINCT product_id)) FROM l),
    'por_producto', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'producto_id', x.product_id, 'producto', pr.name, 'sku', pr.sku, 'categoria', pr.categoria,
                       'unidades', x.unidades, 'ingreso', x.ingreso) ORDER BY x.ingreso DESC, x.unidades DESC), '[]'::jsonb)
                     FROM (SELECT * FROM por_producto ORDER BY ingreso DESC, unidades DESC LIMIT 500) x
                     LEFT JOIN prod pr ON pr.id = x.product_id),
    'por_hora', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'hora', x.hora, 'puesto', x.puesto, 'producto_id', x.product_id, 'producto', pr.name,
                   'categoria', pr.categoria, 'unidades', x.unidades, 'ingreso', x.ingreso, 'total_franja', x.total_franja)
                   ORDER BY x.hora, x.puesto), '[]'::jsonb)
                 FROM por_hora x LEFT JOIN prod pr ON pr.id = x.product_id WHERE x.puesto <= 3),
    'por_sede', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'sucursal_id', x.branch_id, 'puesto', x.puesto, 'producto_id', x.product_id, 'producto', pr.name,
                   'categoria', pr.categoria, 'unidades', x.unidades, 'ingreso', x.ingreso, 'total_sede', x.total_sede)
                   ORDER BY x.branch_id, x.puesto), '[]'::jsonb)
                 FROM por_sede x LEFT JOIN prod pr ON pr.id = x.product_id WHERE x.puesto <= 10)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

COMMENT ON FUNCTION public.fn_reporte_mas_vendido(bigint, timestamptz, timestamptz, bigint, text, uuid, text[]) IS
  'Reporte «Lo más vendido»: por producto (hasta 500), los 3 primeros de cada hora local y los 10 primeros de cada sede, por ingreso.';

-- ── 5 ── Ítems vendidos (y productos con descuento) ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_reporte_items_vendidos(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_branch_id bigint DEFAULT NULL,
  p_contar_por text DEFAULT 'cajero',
  p_persona uuid DEFAULT NULL,
  p_metodos text[] DEFAULT NULL,
  p_solo_descuento boolean DEFAULT false,
  p_limite integer DEFAULT 2000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resultado jsonb;
  v_limite integer := least(greatest(coalesce(p_limite, 2000), 1), 5000);
BEGIN
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  PERFORM public.reporte_exigir_alcance_sucursal(p_organization_id, p_branch_id);

  WITH b AS (
    SELECT * FROM public.reporte_ventas_base(p_organization_id, p_from, p_to, p_branch_id, p_contar_por, p_persona, p_metodos)
  ),
  l AS (
    SELECT b.sale_id, b.branch_id, b.persona, b.local_ts, si.id AS item_id, si.product_id,
           coalesce(si.quantity, 0) AS cantidad, coalesce(si.unit_price, 0) AS precio,
           coalesce(si.discount_amount, 0) AS descuento, coalesce(si.tax_amount, 0) AS impuesto,
           coalesce(si.total, 0) AS total
      FROM b JOIN public.sale_items si ON si.sale_id = b.sale_id
     WHERE NOT coalesce(p_solo_descuento, false) OR coalesce(si.discount_amount, 0) > 0
  )
  SELECT jsonb_build_object(
    'totales', (SELECT jsonb_build_object('lineas', count(*), 'cantidad', coalesce(sum(cantidad), 0),
                                          'descuento', coalesce(sum(descuento), 0), 'impuesto', coalesce(sum(impuesto), 0),
                                          'total', coalesce(sum(total), 0)) FROM l),
    'lineas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'fecha', x.local_ts, 'venta_id', x.sale_id, 'factura', x.factura, 'producto_id', x.product_id,
                 'producto', x.producto, 'sku', x.sku, 'cantidad', x.cantidad, 'precio', x.precio,
                 'descuento', x.descuento, 'impuesto', x.impuesto, 'total', x.total,
                 'persona_id', x.persona, 'sucursal_id', x.branch_id) ORDER BY x.local_ts DESC, x.item_id), '[]'::jsonb)
               FROM (SELECT l.*, p.name AS producto, p.sku,
                            (SELECT i.number FROM public.invoice_sales i
                              WHERE i.sale_id = l.sale_id AND i.organization_id = p_organization_id
                                AND coalesce(i.document_type, 'invoice') = 'invoice'
                              ORDER BY i.created_at LIMIT 1) AS factura
                       FROM l LEFT JOIN public.products p ON p.id = l.product_id
                      ORDER BY l.local_ts DESC, l.item_id
                      LIMIT v_limite) x),
    'por_persona', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'persona_id', r.persona, 'lineas', r.n, 'descuento', r.descuento, 'total', r.total)
                      ORDER BY r.descuento DESC), '[]'::jsonb)
                    FROM (SELECT persona, count(*) AS n, sum(descuento) AS descuento, sum(total) AS total
                            FROM l GROUP BY persona) r),
    'limite', v_limite
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

COMMENT ON FUNCTION public.fn_reporte_items_vendidos(bigint, timestamptz, timestamptz, bigint, text, uuid, text[], boolean, integer) IS
  'Reporte «Ítems vendidos» (y pestaña «Productos con descuento» con p_solo_descuento): líneas de venta con hora local, factura, persona y sede (hasta p_limite, máx. 5000), totales de todas y descuentos por persona.';

-- ── 6 ── Despacho de mercancías ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reporte_despachos(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_branch_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  PERFORM public.reporte_exigir_alcance_sucursal(p_organization_id, p_branch_id);

  WITH d AS (
    -- Envíos a clientes (pedidos web y del POS): se cuentan por la fecha de despacho o, sin ella, de creación.
    SELECT 'envio'::text AS tipo, sh.id::text AS id, sh.shipment_number AS numero,
           coalesce(sh.dispatched_at, sh.created_at) AS fecha, sh.branch_id AS origen_id,
           NULL::integer AS destino_sucursal_id,
           coalesce(nullif(btrim(sh.delivery_contact_name), ''), nullif(btrim(c.full_name), '')) AS destino,
           sh.delivery_city AS ciudad, sh.created_by AS responsable, sh.status AS estado, sh.delivered_at AS entregado,
           (SELECT coalesce(sum(it.qty), 0) FROM public.shipment_items it WHERE it.shipment_id = sh.id) AS items
      FROM public.shipments sh
      LEFT JOIN public.customers c ON c.id = sh.customer_id
     WHERE sh.organization_id = p_organization_id
       AND coalesce(sh.dispatched_at, sh.created_at) >= p_from AND coalesce(sh.dispatched_at, sh.created_at) <= p_to
       AND (p_branch_id IS NULL OR sh.branch_id = p_branch_id)
    UNION ALL
    -- Traslados entre sedes: se cuentan por la fecha de envío o, sin ella, de creación.
    SELECT 'traslado', t.id::text, t.code, coalesce(t.shipped_at, t.created_at), t.origin_branch_id,
           t.dest_branch_id, NULL, NULL, coalesce(t.shipped_by, t.created_by), t.status, t.received_at,
           (SELECT coalesce(sum(ti.quantity), 0) FROM public.transfer_items ti WHERE ti.inventory_transfer_id = t.id)
      FROM public.inventory_transfers t
     WHERE t.organization_id = p_organization_id
       AND coalesce(t.shipped_at, t.created_at) >= p_from AND coalesce(t.shipped_at, t.created_at) <= p_to
       AND (p_branch_id IS NULL OR t.origin_branch_id = p_branch_id OR t.dest_branch_id = p_branch_id)
  )
  SELECT jsonb_build_object(
    'totales', (SELECT jsonb_build_object(
                  'despachos', count(*), 'items', coalesce(sum(items), 0),
                  'entregados', count(*) FILTER (WHERE estado IN ('delivered', 'received', 'completed')),
                  'cancelados', count(*) FILTER (WHERE estado IN ('cancelled', 'canceled')),
                  'pendientes', count(*) FILTER (WHERE estado NOT IN ('delivered', 'received', 'completed', 'cancelled', 'canceled')))
                FROM d),
    'despachos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'tipo', x.tipo, 'id', x.id, 'numero', x.numero, 'fecha', x.fecha, 'origen_id', x.origen_id,
                    'destino_sucursal_id', x.destino_sucursal_id, 'destino', x.destino, 'ciudad', x.ciudad,
                    'responsable_id', x.responsable, 'estado', x.estado, 'entregado', x.entregado, 'items', x.items)
                    ORDER BY x.fecha DESC), '[]'::jsonb)
                  FROM (SELECT * FROM d ORDER BY fecha DESC LIMIT 2000) x),
    'por_responsable', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'responsable_id', r.responsable, 'despachos', r.n, 'items', r.items, 'entregados', r.entregados)
                          ORDER BY r.n DESC), '[]'::jsonb)
                        FROM (SELECT responsable, count(*) AS n, sum(items) AS items,
                                     count(*) FILTER (WHERE estado IN ('delivered', 'received', 'completed')) AS entregados
                                FROM d GROUP BY responsable) r),
    'items', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'producto_id', i.product_id, 'producto', p.name, 'sku', p.sku, 'cantidad', i.cantidad, 'despachos', i.n)
                ORDER BY i.cantidad DESC), '[]'::jsonb)
              FROM (SELECT x.product_id, sum(x.cantidad) AS cantidad, count(DISTINCT x.doc) AS n
                      FROM (SELECT it.product_id, it.qty AS cantidad, 'e' || it.shipment_id::text AS doc
                              FROM public.shipment_items it
                              JOIN d ON d.tipo = 'envio' AND d.id = it.shipment_id::text
                            UNION ALL
                            SELECT ti.product_id, ti.quantity, 't' || ti.inventory_transfer_id
                              FROM public.transfer_items ti
                              JOIN d ON d.tipo = 'traslado' AND d.id = ti.inventory_transfer_id::text) x
                     WHERE x.product_id IS NOT NULL
                     GROUP BY x.product_id
                     ORDER BY 2 DESC LIMIT 500) i
              LEFT JOIN public.products p ON p.id = i.product_id)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

COMMENT ON FUNCTION public.fn_reporte_despachos(bigint, timestamptz, timestamptz, bigint) IS
  'Reporte «Despacho de mercancías»: envíos a clientes (shipments) y traslados entre sedes (inventory_transfers) del periodo, por despacho, por ítem y por responsable.';

-- ── Privilegios ───────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.reporte_ventas_base(bigint, timestamptz, timestamptz, bigint, text, uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reporte_pagos_venta(bigint, uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_ventas_por_hora(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_reporte_ventas_resumen(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_reporte_ventas_personas(bigint, timestamptz, timestamptz, bigint, text, uuid, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_reporte_mas_vendido(bigint, timestamptz, timestamptz, bigint, text, uuid, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_reporte_items_vendidos(bigint, timestamptz, timestamptz, bigint, text, uuid, text[], boolean, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_reporte_despachos(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_reporte_ventas_por_hora(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_reporte_ventas_resumen(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_reporte_ventas_personas(bigint, timestamptz, timestamptz, bigint, text, uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_reporte_mas_vendido(bigint, timestamptz, timestamptz, bigint, text, uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_reporte_items_vendidos(bigint, timestamptz, timestamptz, bigint, text, uuid, text[], boolean, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_reporte_despachos(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;
