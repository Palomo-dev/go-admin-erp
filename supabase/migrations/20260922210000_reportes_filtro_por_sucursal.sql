-- ============================================================================
-- Reportes: filtro por sucursal (p_branch_id)
-- ============================================================================
-- Contexto
--   El 2026-09-07 el frontend empezó a pasar `p_branch_id` a estas 9 RPC
--   (src/lib/services/reportes/modulos/{ventas,finanzas,inventario}Reports.ts)
--   sin que existiera la migración correspondiente. Las funciones en BD seguían
--   con la firma de 3 argumentos, así que PostgREST respondía 404
--   «Could not find the function ... in the schema cache» y esos reportes
--   estaban rotos en producción.
--
-- Decisiones
--   1. `p_branch_id bigint DEFAULT NULL` va SIEMPRE como ÚLTIMO parámetro:
--      las llamadas de 3 argumentos que ya existen siguen resolviendo.
--   2. Se hace DROP de la firma vieja antes del CREATE. NUNCA una sobrecarga:
--      dos firmas con el mismo nombre hacen que PostgREST devuelva
--      «Could not choose the best candidate function» (incidente
--      fn_pipeline_funnel, ver PROGRESS.md).
--   3. Tipo `bigint` por coherencia con `p_organization_id bigint`, que ya se
--      usaba aunque la columna `organization_id` sea `integer`. La columna
--      `branch_id` es `integer` en todas las tablas implicadas; la comparación
--      int4 = int8 pertenece a la familia de operadores `integer_ops`, así que
--      los índices sobre `branch_id` se siguen usando.
--   4. El filtro se escribe siempre como
--      `(p_branch_id IS NULL OR <tabla>.branch_id = p_branch_id)`,
--      de modo que con NULL el resultado es idéntico al de la función anterior.
--   5. Tablas SIN columna `branch_id` (`sale_items`, `invoice_applied_taxes`,
--      `products`): el filtro se aplica sobre la tabla padre que sí la lleva
--      (`sales`, `invoice_sales`, `stock_levels` / `stock_movements`). Está
--      anotado en cada caso; ninguna función acepta el parámetro en silencio.
--
-- Nota sobre `branch_id` NULL en los datos
--   `cash_sessions.branch_id`, `payments.branch_id`,
--   `accounts_receivable.branch_id` y `accounts_payable.branch_id` admiten
--   NULL. Al filtrar por una sucursal concreta esas filas quedan fuera, que es
--   la semántica correcta («lo de esta sucursal»), pero explica que la suma por
--   sucursales pueda ser menor que el total sin filtro.
--
-- Se conservan tal cual: SECURITY DEFINER, `SET search_path TO 'public'`,
-- el OWNER (postgres) y los GRANT (PUBLIC, anon, authenticated, service_role).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. fn_reporte_cierre_caja
--    Tablas: cash_sessions, payments, sales, returns — todas con branch_id.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_reporte_cierre_caja(bigint, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.fn_reporte_cierre_caja(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_branch_id bigint DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sesiones jsonb;
  v_por_metodo jsonb;
  v_descuentos numeric;
  v_devoluciones numeric;
  v_propinas numeric;
  v_total_ventas numeric;
  v_total_esperado numeric;
  v_total_real numeric;
BEGIN
  -- Sesiones de caja del período
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', cs.id,
    'sucursal_id', cs.branch_id,
    'abierta_por', cs.opened_by,
    'abierta_en', cs.opened_at,
    'cerrada_en', cs.closed_at,
    'monto_inicial', cs.initial_amount,
    'monto_final', cs.final_amount,
    'diferencia', cs.difference,
    'estado', cs.status
  )), '[]'::jsonb) INTO v_sesiones
  FROM cash_sessions cs
  WHERE cs.organization_id = p_organization_id
    AND cs.opened_at >= p_from AND cs.opened_at <= p_to
    AND (p_branch_id IS NULL OR cs.branch_id = p_branch_id);

  -- Totales por método de pago
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'metodo', pm.method,
    'cantidad', pm.cantidad,
    'total', pm.total
  )), '[]'::jsonb) INTO v_por_metodo
  FROM (
    SELECT p.method, COUNT(*) AS cantidad, COALESCE(SUM(p.amount), 0) AS total
    FROM payments p
    WHERE p.organization_id = p_organization_id
      AND p.created_at >= p_from AND p.created_at <= p_to
      AND p.status = 'completed'
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    GROUP BY p.method
  ) pm;

  -- Descuentos del período
  SELECT COALESCE(SUM(s.discount_total), 0) INTO v_descuentos
  FROM sales s
  WHERE s.organization_id = p_organization_id
    AND s.sale_date >= p_from AND s.sale_date <= p_to
    AND s.status NOT IN ('cancelled', 'void')
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id);

  -- Devoluciones (returns usa total_refund)
  SELECT COALESCE(SUM(r.total_refund), 0) INTO v_devoluciones
  FROM returns r
  WHERE r.organization_id = p_organization_id
    AND r.return_date >= p_from AND r.return_date <= p_to
    AND (p_branch_id IS NULL OR r.branch_id = p_branch_id);

  -- Propinas
  SELECT COALESCE(SUM(s.tip_amount), 0) INTO v_propinas
  FROM sales s
  WHERE s.organization_id = p_organization_id
    AND s.sale_date >= p_from AND s.sale_date <= p_to
    AND s.status NOT IN ('cancelled', 'void')
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id);

  -- Total ventas
  SELECT COALESCE(SUM(s.total), 0) INTO v_total_ventas
  FROM sales s
  WHERE s.organization_id = p_organization_id
    AND s.sale_date >= p_from AND s.sale_date <= p_to
    AND s.status NOT IN ('cancelled', 'void')
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id);

  -- Total esperado (suma de pagos completados)
  SELECT COALESCE(SUM(p.amount), 0) INTO v_total_esperado
  FROM payments p
  WHERE p.organization_id = p_organization_id
    AND p.created_at >= p_from AND p.created_at <= p_to
    AND p.status = 'completed'
    AND (p_branch_id IS NULL OR p.branch_id = p_branch_id);

  -- Total real (suma de montos finales de sesiones cerradas)
  SELECT COALESCE(SUM(cs.final_amount), 0) INTO v_total_real
  FROM cash_sessions cs
  WHERE cs.organization_id = p_organization_id
    AND cs.opened_at >= p_from AND cs.opened_at <= p_to
    AND cs.status = 'closed'
    AND (p_branch_id IS NULL OR cs.branch_id = p_branch_id);

  RETURN jsonb_build_object(
    'sesiones', v_sesiones,
    'por_metodo', v_por_metodo,
    'descuentos', v_descuentos,
    'devoluciones', v_devoluciones,
    'propinas', v_propinas,
    'total_ventas', v_total_ventas,
    'esperado_vs_real', jsonb_build_object(
      'esperado', v_total_esperado,
      'real', v_total_real,
      'diferencia', v_total_real - v_total_esperado
    )
  );
END;
$function$;

ALTER FUNCTION public.fn_reporte_cierre_caja(bigint, timestamptz, timestamptz, bigint) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_reporte_cierre_caja(bigint, timestamptz, timestamptz, bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reporte_cierre_caja(bigint, timestamptz, timestamptz, bigint) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. fn_reporte_ventas_resumen
--    Tablas: sales (branch_id), sale_items (SIN branch_id → se filtra por el
--    `sales` al que pertenece la línea), products (catálogo, no es por sucursal).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_reporte_ventas_resumen(bigint, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.fn_reporte_ventas_resumen(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_branch_id bigint DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_por_dia jsonb;
  v_por_sucursal jsonb;
  v_por_vendedor jsonb;
  v_por_categoria jsonb;
  v_total_ventas numeric;
  v_num_ventas integer;
BEGIN
  -- Por día
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'fecha', d.dia,
    'total', d.total,
    'num_ventas', d.cantidad
  )), '[]'::jsonb) INTO v_por_dia
  FROM (
    SELECT DATE(s.sale_date) AS dia,
           COALESCE(SUM(s.total), 0) AS total,
           COUNT(*) AS cantidad
    FROM sales s
    WHERE s.organization_id = p_organization_id
      AND s.sale_date >= p_from AND s.sale_date <= p_to
      AND s.status NOT IN ('cancelled', 'void')
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    GROUP BY DATE(s.sale_date)
    ORDER BY dia
  ) d;

  -- Por sucursal (con p_branch_id devuelve una sola fila: la sucursal pedida)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'sucursal_id', s.branch_id,
    'total', s.total,
    'num_ventas', s.cantidad
  )), '[]'::jsonb) INTO v_por_sucursal
  FROM (
    SELECT s.branch_id,
           COALESCE(SUM(s.total), 0) AS total,
           COUNT(*) AS cantidad
    FROM sales s
    WHERE s.organization_id = p_organization_id
      AND s.sale_date >= p_from AND s.sale_date <= p_to
      AND s.status NOT IN ('cancelled', 'void')
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    GROUP BY s.branch_id
    ORDER BY total DESC
  ) s;

  -- Por vendedor (fallback a user_id cuando salesperson_id es NULL)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'vendedor_id', v.vendedor_id,
    'total', v.total,
    'num_ventas', v.cantidad
  )), '[]'::jsonb) INTO v_por_vendedor
  FROM (
    SELECT COALESCE(s.salesperson_id, s.user_id) AS vendedor_id,
           COALESCE(SUM(s.total), 0) AS total,
           COUNT(*) AS cantidad
    FROM sales s
    WHERE s.organization_id = p_organization_id
      AND s.sale_date >= p_from AND s.sale_date <= p_to
      AND s.status NOT IN ('cancelled', 'void')
      AND COALESCE(s.salesperson_id, s.user_id) IS NOT NULL
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    GROUP BY COALESCE(s.salesperson_id, s.user_id)
    ORDER BY total DESC
  ) v;

  -- Por categoría (join sale_items -> products).
  -- sale_items no tiene branch_id: la sucursal la define la venta (s.branch_id).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'categoria_id', c.category_id,
    'total', c.total,
    'cantidad_items', c.cantidad
  )), '[]'::jsonb) INTO v_por_categoria
  FROM (
    SELECT p.category_id,
           COALESCE(SUM(si.total), 0) AS total,
           COALESCE(SUM(si.quantity), 0) AS cantidad
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    JOIN products p ON si.product_id = p.id
    WHERE s.organization_id = p_organization_id
      AND s.sale_date >= p_from AND s.sale_date <= p_to
      AND s.status NOT IN ('cancelled', 'void')
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    GROUP BY p.category_id
    ORDER BY total DESC
  ) c;

  SELECT COALESCE(SUM(s.total), 0), COUNT(*) INTO v_total_ventas, v_num_ventas
  FROM sales s
  WHERE s.organization_id = p_organization_id
    AND s.sale_date >= p_from AND s.sale_date <= p_to
    AND s.status NOT IN ('cancelled', 'void')
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id);

  RETURN jsonb_build_object(
    'por_dia', v_por_dia,
    'por_sucursal', v_por_sucursal,
    'por_vendedor', v_por_vendedor,
    'por_categoria', v_por_categoria,
    'total_ventas', v_total_ventas,
    'num_ventas', v_num_ventas
  );
END;
$function$;

ALTER FUNCTION public.fn_reporte_ventas_resumen(bigint, timestamptz, timestamptz, bigint) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_reporte_ventas_resumen(bigint, timestamptz, timestamptz, bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reporte_ventas_resumen(bigint, timestamptz, timestamptz, bigint) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. fn_reporte_ventas_por_hora
--    Tablas: sales (branch_id).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_reporte_ventas_por_hora(bigint, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.fn_reporte_ventas_por_hora(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_branch_id bigint DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_por_hora jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'hora', h.hora,
    'total', h.total,
    'num_ventas', h.cantidad
  )), '[]'::jsonb) INTO v_por_hora
  FROM (
    SELECT EXTRACT(HOUR FROM s.sale_date)::int AS hora,
           COALESCE(SUM(s.total), 0) AS total,
           COUNT(*) AS cantidad
    FROM sales s
    WHERE s.organization_id = p_organization_id
      AND s.sale_date >= p_from AND s.sale_date <= p_to
      AND s.status NOT IN ('cancelled', 'void')
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    GROUP BY EXTRACT(HOUR FROM s.sale_date)
    ORDER BY hora
  ) h;

  RETURN jsonb_build_object('por_hora', v_por_hora);
END;
$function$;

ALTER FUNCTION public.fn_reporte_ventas_por_hora(bigint, timestamptz, timestamptz, bigint) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_reporte_ventas_por_hora(bigint, timestamptz, timestamptz, bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reporte_ventas_por_hora(bigint, timestamptz, timestamptz, bigint) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. fn_reporte_cxc_aging
--    Tablas: accounts_receivable (branch_id, admite NULL).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_reporte_cxc_aging(bigint, date);

CREATE OR REPLACE FUNCTION public.fn_reporte_cxc_aging(
  p_organization_id bigint,
  p_as_of date,
  p_branch_id bigint DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_buckets jsonb;
  v_total numeric;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'bucket', b.bucket,
    'total', b.total,
    'cantidad', b.cantidad
  )), '[]'::jsonb) INTO v_buckets
  FROM (
    SELECT
      CASE
        WHEN COALESCE(ar.days_overdue, 0) = 0 THEN 'corriente'
        WHEN ar.days_overdue BETWEEN 1 AND 30 THEN '1-30'
        WHEN ar.days_overdue BETWEEN 31 AND 60 THEN '31-60'
        WHEN ar.days_overdue BETWEEN 61 AND 90 THEN '61-90'
        ELSE '+90'
      END AS bucket,
      COALESCE(SUM(ar.balance), 0) AS total,
      COUNT(*) AS cantidad
    FROM accounts_receivable ar
    WHERE ar.organization_id = p_organization_id
      AND ar.status NOT IN ('paid', 'cancelled')
      AND ar.due_date <= p_as_of + INTERVAL '90 days'
      AND (p_branch_id IS NULL OR ar.branch_id = p_branch_id)
    GROUP BY bucket
    ORDER BY bucket
  ) b;

  SELECT COALESCE(SUM(ar.balance), 0) INTO v_total
  FROM accounts_receivable ar
  WHERE ar.organization_id = p_organization_id
    AND ar.status NOT IN ('paid', 'cancelled')
    AND (p_branch_id IS NULL OR ar.branch_id = p_branch_id);

  RETURN jsonb_build_object('buckets', v_buckets, 'total', v_total);
END;
$function$;

ALTER FUNCTION public.fn_reporte_cxc_aging(bigint, date, bigint) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_reporte_cxc_aging(bigint, date, bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reporte_cxc_aging(bigint, date, bigint) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. fn_reporte_cxp_aging
--    Tablas: accounts_payable (branch_id, admite NULL).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_reporte_cxp_aging(bigint, date);

CREATE OR REPLACE FUNCTION public.fn_reporte_cxp_aging(
  p_organization_id bigint,
  p_as_of date,
  p_branch_id bigint DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_buckets jsonb;
  v_total numeric;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'bucket', b.bucket,
    'total', b.total,
    'cantidad', b.cantidad
  )), '[]'::jsonb) INTO v_buckets
  FROM (
    SELECT
      CASE
        WHEN COALESCE(ap.days_overdue, 0) = 0 THEN 'corriente'
        WHEN ap.days_overdue BETWEEN 1 AND 30 THEN '1-30'
        WHEN ap.days_overdue BETWEEN 31 AND 60 THEN '31-60'
        WHEN ap.days_overdue BETWEEN 61 AND 90 THEN '61-90'
        ELSE '+90'
      END AS bucket,
      COALESCE(SUM(ap.balance), 0) AS total,
      COUNT(*) AS cantidad
    FROM accounts_payable ap
    WHERE ap.organization_id = p_organization_id
      AND ap.status NOT IN ('paid', 'cancelled')
      AND ap.due_date <= p_as_of + INTERVAL '90 days'
      AND (p_branch_id IS NULL OR ap.branch_id = p_branch_id)
    GROUP BY bucket
    ORDER BY bucket
  ) b;

  SELECT COALESCE(SUM(ap.balance), 0) INTO v_total
  FROM accounts_payable ap
  WHERE ap.organization_id = p_organization_id
    AND ap.status NOT IN ('paid', 'cancelled')
    AND (p_branch_id IS NULL OR ap.branch_id = p_branch_id);

  RETURN jsonb_build_object('buckets', v_buckets, 'total', v_total);
END;
$function$;

ALTER FUNCTION public.fn_reporte_cxp_aging(bigint, date, bigint) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_reporte_cxp_aging(bigint, date, bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reporte_cxp_aging(bigint, date, bigint) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. fn_reporte_flujo_efectivo
--    Tablas: payments (branch_id, admite NULL).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_reporte_flujo_efectivo(bigint, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.fn_reporte_flujo_efectivo(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_branch_id bigint DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_operativo numeric;
  v_inversion numeric;
  v_financiacion numeric;
  v_entradas numeric;
  v_salidas numeric;
BEGIN
  -- Entradas operativas (pagos recibidos)
  SELECT COALESCE(SUM(p.amount), 0) INTO v_entradas
  FROM payments p
  WHERE p.organization_id = p_organization_id
    AND p.created_at >= p_from AND p.created_at <= p_to
    AND p.status = 'completed'
    AND p.source NOT IN ('account_payable')
    AND (p_branch_id IS NULL OR p.branch_id = p_branch_id);

  -- Salidas operativas (pagos a proveedores)
  SELECT COALESCE(SUM(p.amount), 0) INTO v_salidas
  FROM payments p
  WHERE p.organization_id = p_organization_id
    AND p.created_at >= p_from AND p.created_at <= p_to
    AND p.status = 'completed'
    AND p.source = 'account_payable'
    AND (p_branch_id IS NULL OR p.branch_id = p_branch_id);

  v_operativo := v_entradas - v_salidas;
  v_inversion := 0;
  v_financiacion := 0;

  RETURN jsonb_build_object(
    'operativo', v_operativo,
    'inversion', v_inversion,
    'financiacion', v_financiacion,
    'entradas', v_entradas,
    'salidas', v_salidas,
    'neto', v_operativo + v_inversion + v_financiacion
  );
END;
$function$;

ALTER FUNCTION public.fn_reporte_flujo_efectivo(bigint, timestamptz, timestamptz, bigint) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_reporte_flujo_efectivo(bigint, timestamptz, timestamptz, bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reporte_flujo_efectivo(bigint, timestamptz, timestamptz, bigint) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. fn_reporte_impuestos
--    Tablas: invoice_sales (branch_id NOT NULL), invoice_purchase
--    (branch_id NOT NULL), invoice_applied_taxes (SIN branch_id → se filtra por
--    la factura de venta a la que pertenece el impuesto aplicado).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_reporte_impuestos(bigint, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.fn_reporte_impuestos(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_branch_id bigint DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_iva_generado numeric;
  v_iva_descontable numeric;
  v_iva_neto numeric;
  v_total_facturado numeric;
  v_por_codigo jsonb;
BEGIN
  -- IVA generado (ventas)
  SELECT COALESCE(SUM(inv.tax_total), 0) INTO v_iva_generado
  FROM invoice_sales inv
  WHERE inv.organization_id = p_organization_id
    AND inv.issue_date >= p_from AND inv.issue_date <= p_to
    AND inv.status NOT IN ('cancelled', 'void')
    AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id);

  -- Total facturado
  SELECT COALESCE(SUM(inv.total), 0) INTO v_total_facturado
  FROM invoice_sales inv
  WHERE inv.organization_id = p_organization_id
    AND inv.issue_date >= p_from AND inv.issue_date <= p_to
    AND inv.status NOT IN ('cancelled', 'void')
    AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id);

  -- IVA descontable (compras) - invoice_purchase
  SELECT COALESCE(SUM(ip.tax_total), 0) INTO v_iva_descontable
  FROM invoice_purchase ip
  WHERE ip.organization_id = p_organization_id
    AND ip.issue_date >= p_from AND ip.issue_date <= p_to
    AND ip.status NOT IN ('cancelled', 'void')
    AND (p_branch_id IS NULL OR ip.branch_id = p_branch_id);

  v_iva_neto := v_iva_generado - v_iva_descontable;

  -- Desglose por código de impuesto (invoice_applied_taxes).
  -- invoice_applied_taxes no tiene branch_id: la sucursal la define la factura.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'codigo', t.tax_code,
    'tasa', t.tax_rate,
    'base', t.base,
    'monto', t.monto
  )), '[]'::jsonb) INTO v_por_codigo
  FROM (
    SELECT iat.tax_code, iat.tax_rate,
           COALESCE(SUM(inv.subtotal), 0) AS base,
           COALESCE(SUM(inv.tax_total), 0) AS monto
    FROM invoice_applied_taxes iat
    JOIN invoice_sales inv ON iat.invoice_id = inv.id
    WHERE inv.organization_id = p_organization_id
      AND inv.issue_date >= p_from AND inv.issue_date <= p_to
      AND inv.status NOT IN ('cancelled', 'void')
      AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
    GROUP BY iat.tax_code, iat.tax_rate
    ORDER BY iat.tax_code
  ) t;

  RETURN jsonb_build_object(
    'iva_generado', v_iva_generado,
    'iva_descontable', v_iva_descontable,
    'iva_neto', v_iva_neto,
    'total_facturado', v_total_facturado,
    'por_codigo', v_por_codigo
  );
END;
$function$;

ALTER FUNCTION public.fn_reporte_impuestos(bigint, timestamptz, timestamptz, bigint) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_reporte_impuestos(bigint, timestamptz, timestamptz, bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reporte_impuestos(bigint, timestamptz, timestamptz, bigint) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. fn_reporte_movimientos_inventario
--    Tablas: stock_movements (branch_id NOT NULL).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_reporte_movimientos_inventario(bigint, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.fn_reporte_movimientos_inventario(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_branch_id bigint DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_por_tipo jsonb;
  v_por_sucursal jsonb;
  v_detalle jsonb;
  v_total_entradas numeric;
  v_total_salidas numeric;
BEGIN
  -- Por tipo (direction)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'direccion', t.direction,
    'cantidad', t.cantidad,
    'valor', t.valor,
    'num_movimientos', t.num
  )), '[]'::jsonb) INTO v_por_tipo
  FROM (
    SELECT sm.direction,
           COALESCE(SUM(sm.qty), 0) AS cantidad,
           COALESCE(SUM(sm.qty * sm.unit_cost), 0) AS valor,
           COUNT(*) AS num
    FROM stock_movements sm
    WHERE sm.organization_id = p_organization_id
      AND sm.created_at >= p_from AND sm.created_at <= p_to
      AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id)
    GROUP BY sm.direction
    ORDER BY sm.direction
  ) t;

  -- Por sucursal (con p_branch_id devuelve una sola fila: la sucursal pedida)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'sucursal_id', s.branch_id,
    'entradas', s.entradas,
    'salidas', s.salidas,
    'num_movimientos', s.num
  )), '[]'::jsonb) INTO v_por_sucursal
  FROM (
    SELECT sm.branch_id,
           COALESCE(SUM(CASE WHEN sm.direction = 'in' THEN sm.qty ELSE 0 END), 0) AS entradas,
           COALESCE(SUM(CASE WHEN sm.direction = 'out' THEN sm.qty ELSE 0 END), 0) AS salidas,
           COUNT(*) AS num
    FROM stock_movements sm
    WHERE sm.organization_id = p_organization_id
      AND sm.created_at >= p_from AND sm.created_at <= p_to
      AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id)
    GROUP BY sm.branch_id
    ORDER BY sm.branch_id
  ) s;

  -- Detalle (últimos 100 movimientos)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'producto_id', m.product_id,
    'sucursal_id', m.branch_id,
    'direccion', m.direction,
    'cantidad', m.qty,
    'costo_unitario', m.unit_cost,
    'fuente', m.source,
    'nota', m.note,
    'fecha', m.created_at
  )), '[]'::jsonb) INTO v_detalle
  FROM (
    SELECT sm.*
    FROM stock_movements sm
    WHERE sm.organization_id = p_organization_id
      AND sm.created_at >= p_from AND sm.created_at <= p_to
      AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id)
    ORDER BY sm.created_at DESC
    LIMIT 100
  ) m;

  SELECT COALESCE(SUM(CASE WHEN sm.direction = 'in' THEN sm.qty ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN sm.direction = 'out' THEN sm.qty ELSE 0 END), 0)
  INTO v_total_entradas, v_total_salidas
  FROM stock_movements sm
  WHERE sm.organization_id = p_organization_id
    AND sm.created_at >= p_from AND sm.created_at <= p_to
    AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id);

  RETURN jsonb_build_object(
    'por_tipo', v_por_tipo,
    'por_sucursal', v_por_sucursal,
    'detalle', v_detalle,
    'total_entradas', v_total_entradas,
    'total_salidas', v_total_salidas
  );
END;
$function$;

ALTER FUNCTION public.fn_reporte_movimientos_inventario(bigint, timestamptz, timestamptz, bigint) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_reporte_movimientos_inventario(bigint, timestamptz, timestamptz, bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reporte_movimientos_inventario(bigint, timestamptz, timestamptz, bigint) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. fn_reporte_rotacion_inventario
--    Tablas: sale_items (SIN branch_id → por la venta), sales (branch_id),
--    products (catálogo de la organización, SIN branch_id: un producto no
--    pertenece a una sucursal), stock_levels (branch_id NOT NULL) y
--    stock_movements (branch_id NOT NULL). En el "dead stock" el filtro va
--    sobre stock_levels y stock_movements, que son las tablas que sí tienen
--    sucursal; `products` solo aporta el catálogo.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_reporte_rotacion_inventario(bigint, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.fn_reporte_rotacion_inventario(
  p_organization_id bigint,
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_branch_id bigint DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_top_vendidos jsonb;
  v_dead_stock jsonb;
  v_total_vendido numeric;
  v_num_productos_vendidos integer;
BEGIN
  -- Top vendidos (la sucursal la define la venta, no la línea)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'producto_id', t.product_id,
    'nombre', t.name,
    'sku', t.sku,
    'cantidad_vendida', t.cantidad,
    'total_ventas', t.total
  )), '[]'::jsonb) INTO v_top_vendidos
  FROM (
    SELECT si.product_id, p.name, p.sku,
           COALESCE(SUM(si.quantity), 0) AS cantidad,
           COALESCE(SUM(si.total), 0) AS total
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    JOIN products p ON si.product_id = p.id
    WHERE s.organization_id = p_organization_id
      AND s.sale_date >= p_from AND s.sale_date <= p_to
      AND s.status NOT IN ('cancelled', 'void')
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    GROUP BY si.product_id, p.name, p.sku
    ORDER BY cantidad DESC
    LIMIT 20
  ) t;

  -- Dead stock (productos sin movimientos en el período).
  -- products no tiene branch_id: el filtro va en stock_levels y stock_movements.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'producto_id', d.product_id,
    'nombre', d.name,
    'sku', d.sku,
    'stock_actual', d.qty_on_hand,
    'ultimo_movimiento', d.ultimo_mov
  )), '[]'::jsonb) INTO v_dead_stock
  FROM (
    SELECT p.id AS product_id, p.name, p.sku,
           COALESCE(sl.qty_on_hand, 0) AS qty_on_hand,
           MAX(sm.created_at) AS ultimo_mov
    FROM products p
    LEFT JOIN stock_levels sl ON sl.product_id = p.id
      AND (p_branch_id IS NULL OR sl.branch_id = p_branch_id)
    LEFT JOIN stock_movements sm ON sm.product_id = p.id
      AND sm.organization_id = p_organization_id
      AND sm.created_at >= p_from AND sm.created_at <= p_to
      AND (p_branch_id IS NULL OR sm.branch_id = p_branch_id)
    WHERE p.organization_id = p_organization_id
      AND p.status = 'active'
    GROUP BY p.id, p.name, p.sku, sl.qty_on_hand
    HAVING MAX(sm.created_at) IS NULL
       OR MAX(sm.created_at) < p_from
    ORDER BY sl.qty_on_hand DESC
    LIMIT 20
  ) d;

  SELECT COALESCE(SUM(si.total), 0), COUNT(DISTINCT si.product_id)
  INTO v_total_vendido, v_num_productos_vendidos
  FROM sale_items si
  JOIN sales s ON si.sale_id = s.id
  WHERE s.organization_id = p_organization_id
    AND s.sale_date >= p_from AND s.sale_date <= p_to
    AND s.status NOT IN ('cancelled', 'void')
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id);

  RETURN jsonb_build_object(
    'top_vendidos', v_top_vendidos,
    'dead_stock', v_dead_stock,
    'total_vendido', v_total_vendido,
    'num_productos_vendidos', v_num_productos_vendidos
  );
END;
$function$;

ALTER FUNCTION public.fn_reporte_rotacion_inventario(bigint, timestamptz, timestamptz, bigint) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_reporte_rotacion_inventario(bigint, timestamptz, timestamptz, bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reporte_rotacion_inventario(bigint, timestamptz, timestamptz, bigint) TO anon, authenticated, service_role;
