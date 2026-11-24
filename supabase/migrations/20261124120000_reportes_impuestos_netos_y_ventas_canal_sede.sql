-- Reportes › Impuestos mejorado y Reportes › Ventas por canal y por sede (2026-11-24).
--
-- Aprobado por el dueño el 2026-11-24 (Figma «24 Ventas», sección 7: reporte de Impuestos
-- en computador y celular, y reporte por canal y sede). Criterio del Contador:
--   · IVA e INC van por separado y NETOS: lo de las facturas del periodo menos lo de las
--     notas crédito y las devoluciones del periodo. Las propinas no llevan impuesto.
--   · Las retenciones que nos practicaron van aparte (son a favor de la empresa, 1355) y no
--     se restan del IVA ni del INC.
--   · Es informativo: lo que se paga sale de la declaración (Finanzas › Centro tributario).
--
-- 1. `fn_reporte_impuestos` (misma firma, mismos permisos): conserva las claves que ya
--    devolvía (`iva_generado`, `iva_descontable`, `iva_neto`, `total_facturado`) con el mismo
--    cálculo, y agrega:
--      iva / inc            {ventas, devoluciones, neto}
--      por_tarifa           [{clase, tarifa, base, ventas, devoluciones, neto}]
--      retenciones          {retefuente, reteiva, reteica, otras, total, asientos}
--      compras              número de facturas de compra del periodo
--      saldo_iva_estimado   IVA neto − IVA de las compras
--    `por_codigo` se corrige: antes sumaba el subtotal de TODA la factura en cada código
--    (la cifra se repetía, ver 20261108101000); ahora sale de `por_tarifa`.
--
--    Impuesto de cada línea: la misma regla de `fn_impuesto_inc_parte` y `pos_ventas_cifras`
--    (peso = total_line·r/(1+r) si el precio incluye el impuesto, total_line·r si no; INC =
--    código «INC…» o tarifa 8 %). El impuesto del documento (`tax_total`, el de la factura) se
--    reparte entre sus líneas por ese peso, así la suma por tarifa da el total del documento.
--    Un documento con impuesto y sin líneas que lo expliquen va a «Sin detalle»: no se adivina.
--    Devoluciones sin nota crédito válida (`returns`): la misma regla de
--    `fn_ventas_netas_movimientos` decide cuáles cuentan; se reparten por tarifa con la
--    proporción de la factura de su venta (lo devuelto ÷ total de la factura).
--    Retenciones a favor: movimiento débito − crédito de las cuentas 1355 en los asientos
--    publicados del periodo (135515 retefuente, 135517 reteIVA, 135518 reteICA; el resto,
--    «otras»). Un asiento y su reverso se anulan solos.
--
-- 2. `fn_reporte_ventas_canal_sede` (nueva): la regla única de ventas netas
--    (`fn_ventas_netas_cifras`, la del Inicio y de Todas las ventas) con las sucursales que el
--    usuario puede ver (`pos_ventas_sucursales`). La suma por canal y la suma por sede dan el
--    total; lo que no tiene canal o sede sale tal cual («Sin asignar»), no se reparte.
--
-- Las dos: SECURITY DEFINER, guarda de pertenencia al principio, alcance de sucursal
-- (`reporte_exigir_alcance_sucursal`), sin `anon` ni PUBLIC.

-- ── 1. Impuestos ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_reporte_impuestos(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone, p_branch_id bigint DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_iva_generado numeric;
  v_iva_descontable numeric;
  v_iva_neto numeric;
  v_total_facturado numeric;
  v_compras integer;
  v_detalle jsonb;
  v_retenciones jsonb;
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

  -- Claves de siempre, con el mismo cálculo de antes.
  SELECT COALESCE(SUM(inv.tax_total), 0), COALESCE(SUM(inv.total), 0)
    INTO v_iva_generado, v_total_facturado
  FROM public.invoice_sales inv
  WHERE inv.organization_id = p_organization_id
    AND inv.issue_date >= p_from AND inv.issue_date <= p_to
    AND inv.status NOT IN ('cancelled', 'void')
    AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id);

  SELECT COALESCE(SUM(ip.tax_total), 0), COUNT(*)
    INTO v_iva_descontable, v_compras
  FROM public.invoice_purchase ip
  WHERE ip.organization_id = p_organization_id
    AND ip.issue_date >= p_from AND ip.issue_date <= p_to
    AND ip.status NOT IN ('cancelled', 'void')
    AND (p_branch_id IS NULL OR ip.branch_id = p_branch_id);

  v_iva_neto := v_iva_generado - v_iva_descontable;

  -- IVA e INC netos, por tarifa.
  WITH facturas AS (
    -- Facturas (+) y notas crédito (−) del periodo; cada una con sus propias líneas.
    SELECT inv.id AS factura_id,
           CASE WHEN inv.document_type = 'credit_note' THEN 'devolucion' ELSE 'venta' END AS lado,
           1::numeric AS k
      FROM public.invoice_sales inv
     WHERE inv.organization_id = p_organization_id
       AND COALESCE(inv.document_type, 'invoice') IN ('invoice', 'credit_note')
       AND COALESCE(inv.status, '') NOT IN ('void', 'voided', 'cancelled', 'draft', 'rejected')
       AND COALESCE(inv.issue_date, inv.created_at) >= p_from
       AND COALESCE(inv.issue_date, inv.created_at) <= p_to
       AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
  ),
  devoluciones AS (
    -- Devoluciones sin nota crédito válida (misma regla de fn_ventas_netas_movimientos).
    SELECT r.id, COALESCE(r.total_refund, 0) AS reembolso,
           CASE WHEN COALESCE(s.total, 0) - COALESCE(s.tip_amount, 0) > 0
                THEN COALESCE(r.total_refund, 0) * COALESCE(s.tax_total, 0) / (s.total - COALESCE(s.tip_amount, 0))
                ELSE 0 END AS impuesto,
           (SELECT o.id FROM public.invoice_sales o
             WHERE o.sale_id = r.sale_id
               AND COALESCE(o.document_type, 'invoice') = 'invoice'
               AND COALESCE(o.status, '') NOT IN ('void', 'voided', 'cancelled', 'draft', 'rejected')
             ORDER BY o.created_at
             LIMIT 1) AS factura_id
      FROM public.returns r
      JOIN public.sales s ON s.id = r.sale_id
     WHERE r.organization_id = p_organization_id
       AND r.status = 'processed'
       AND r.voided_at IS NULL
       AND COALESCE(r.return_date, r.created_at) >= p_from
       AND COALESCE(r.return_date, r.created_at) <= p_to
       AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.invoice_sales n
          WHERE n.id = r.credit_note_invoice_id
            AND n.document_type = 'credit_note'
            AND COALESCE(n.status, '') NOT IN ('void', 'voided', 'cancelled', 'draft', 'rejected'))
  ),
  documentos AS (
    -- `doc_id`: una misma factura puede entrar varias veces (varias devoluciones).
    SELECT row_number() OVER () AS doc_id, u.* FROM (
      SELECT f.factura_id, f.lado, f.k FROM facturas f
      UNION ALL
      -- Con factura de origen: lo devuelto en la proporción de esa factura.
      SELECT d.factura_id, 'devolucion', d.reembolso / ABS(i.total)
        FROM devoluciones d
        JOIN public.invoice_sales i ON i.id = d.factura_id
       WHERE ABS(COALESCE(i.total, 0)) > 0
    ) u
  ),
  lineas AS (
    SELECT doc.doc_id, doc.factura_id, doc.lado, doc.k,
           ABS(COALESCE(inv.tax_total, 0)) AS impuesto_doc,
           ABS(COALESCE(ii.total_line, 0)) AS bruto,
           ii.r,
           CASE WHEN UPPER(COALESCE(ii.tax_code, '')) LIKE 'INC%' OR ABS(ii.r - 0.08) < 0.0005 THEN 'INC'
                WHEN ii.r > 0 THEN 'IVA'
                ELSE 'EXENTO' END AS clase,
           CASE WHEN ii.r > 0 OR UPPER(COALESCE(ii.tax_code, '')) LIKE 'INC%'
                THEN ABS(CASE WHEN COALESCE(ii.tax_included, false) THEN COALESCE(ii.total_line, 0) * ii.r / (1 + ii.r)
                              ELSE COALESCE(ii.total_line, 0) * ii.r END)
                ELSE 0 END AS peso
      FROM documentos doc
      JOIN public.invoice_sales inv ON inv.id = doc.factura_id
      JOIN LATERAL (
        SELECT i.*, CASE WHEN i.tax_rate > 1 THEN i.tax_rate / 100 ELSE COALESCE(i.tax_rate, 0) END AS r
          FROM public.invoice_items i
         WHERE i.invoice_sales_id = doc.factura_id
      ) ii ON true
  ),
  sumas AS (
    SELECT doc_id, SUM(peso) AS sp, SUM(bruto) AS sb FROM lineas GROUP BY doc_id
  ),
  repartido AS (
    -- Impuesto del documento repartido por el peso de cada línea.
    SELECT l.lado,
           CASE WHEN s.sp > 0 THEN l.clase WHEN l.impuesto_doc > 0 THEN 'SIN_DETALLE' ELSE l.clase END AS clase,
           CASE WHEN s.sp > 0 AND l.clase <> 'EXENTO' THEN ROUND(l.r * 100, 2) END AS tarifa,
           l.k * CASE WHEN s.sp > 0 THEN l.impuesto_doc * l.peso / s.sp
                      WHEN l.impuesto_doc > 0 AND s.sb > 0 THEN l.impuesto_doc * l.bruto / s.sb
                      ELSE 0 END AS impuesto,
           l.k * (l.bruto - CASE WHEN s.sp > 0 THEN l.impuesto_doc * l.peso / s.sp
                                 WHEN l.impuesto_doc > 0 AND s.sb > 0 THEN l.impuesto_doc * l.bruto / s.sb
                                 ELSE 0 END) AS base
      FROM lineas l
      JOIN sumas s ON s.doc_id = l.doc_id
    UNION ALL
    -- Documentos sin líneas: su impuesto entero, sin detalle de tarifa.
    SELECT doc.lado, 'SIN_DETALLE', NULL::numeric,
           doc.k * ABS(COALESCE(inv.tax_total, 0)),
           doc.k * (ABS(COALESCE(inv.total, 0)) - ABS(COALESCE(inv.tax_total, 0)))
      FROM documentos doc
      JOIN public.invoice_sales inv ON inv.id = doc.factura_id
     WHERE NOT EXISTS (SELECT 1 FROM public.invoice_items i WHERE i.invoice_sales_id = doc.factura_id)
    UNION ALL
    -- Devoluciones cuya venta no tiene factura: impuesto de la venta, sin detalle.
    SELECT 'devolucion', 'SIN_DETALLE', NULL::numeric, d.impuesto, d.reembolso - d.impuesto
      FROM devoluciones d
      LEFT JOIN public.invoice_sales i ON i.id = d.factura_id
     WHERE d.factura_id IS NULL OR ABS(COALESCE(i.total, 0)) = 0
  ),
  grupos AS (
    SELECT clase, tarifa,
           SUM(CASE WHEN lado = 'venta' THEN base ELSE -base END) AS base,
           SUM(impuesto) FILTER (WHERE lado = 'venta') AS ventas,
           SUM(impuesto) FILTER (WHERE lado = 'devolucion') AS devoluciones
      FROM repartido
     GROUP BY clase, tarifa
  )
  SELECT jsonb_build_object(
    'iva', jsonb_build_object(
      'ventas', ROUND(COALESCE(SUM(g.ventas) FILTER (WHERE g.clase = 'IVA'), 0), 2),
      'devoluciones', ROUND(COALESCE(SUM(g.devoluciones) FILTER (WHERE g.clase = 'IVA'), 0), 2),
      'neto', ROUND(COALESCE(SUM(COALESCE(g.ventas, 0) - COALESCE(g.devoluciones, 0)) FILTER (WHERE g.clase = 'IVA'), 0), 2)),
    'inc', jsonb_build_object(
      'ventas', ROUND(COALESCE(SUM(g.ventas) FILTER (WHERE g.clase = 'INC'), 0), 2),
      'devoluciones', ROUND(COALESCE(SUM(g.devoluciones) FILTER (WHERE g.clase = 'INC'), 0), 2),
      'neto', ROUND(COALESCE(SUM(COALESCE(g.ventas, 0) - COALESCE(g.devoluciones, 0)) FILTER (WHERE g.clase = 'INC'), 0), 2)),
    'sin_detalle', ROUND(COALESCE(SUM(COALESCE(g.ventas, 0) - COALESCE(g.devoluciones, 0)) FILTER (WHERE g.clase = 'SIN_DETALLE'), 0), 2),
    'por_tarifa', COALESCE(jsonb_agg(jsonb_build_object(
        'clase', g.clase,
        'tarifa', g.tarifa,
        'base', ROUND(COALESCE(g.base, 0), 2),
        'ventas', ROUND(COALESCE(g.ventas, 0), 2),
        'devoluciones', ROUND(COALESCE(g.devoluciones, 0), 2),
        'neto', ROUND(COALESCE(g.ventas, 0) - COALESCE(g.devoluciones, 0), 2))
      ORDER BY CASE g.clase WHEN 'IVA' THEN 1 WHEN 'INC' THEN 2 WHEN 'EXENTO' THEN 3 ELSE 4 END, g.tarifa DESC NULLS LAST)
      FILTER (WHERE g.clase IS NOT NULL), '[]'::jsonb)
  )
  INTO v_detalle
  FROM grupos g;

  -- Retenciones que nos practicaron: cuentas 1355 de los asientos publicados del periodo.
  SELECT jsonb_build_object(
    'retefuente', ROUND(COALESCE(SUM(x.valor) FILTER (WHERE x.tipo = 'retefuente'), 0), 2),
    'reteiva', ROUND(COALESCE(SUM(x.valor) FILTER (WHERE x.tipo = 'reteiva'), 0), 2),
    'reteica', ROUND(COALESCE(SUM(x.valor) FILTER (WHERE x.tipo = 'reteica'), 0), 2),
    'otras', ROUND(COALESCE(SUM(x.valor) FILTER (WHERE x.tipo = 'otras'), 0), 2),
    'total', ROUND(COALESCE(SUM(x.valor), 0), 2),
    'asientos', COUNT(DISTINCT x.entry_id))
  INTO v_retenciones
  FROM (
    SELECT je.id AS entry_id,
           CASE WHEN jl.account_code LIKE '135515%' THEN 'retefuente'
                WHEN jl.account_code LIKE '135517%' THEN 'reteiva'
                WHEN jl.account_code LIKE '135518%' THEN 'reteica'
                ELSE 'otras' END AS tipo,
           COALESCE(jl.debit, 0) - COALESCE(jl.credit, 0) AS valor
      FROM public.journal_entries je
      JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
     WHERE je.organization_id = p_organization_id
       AND je.posted = true
       AND je.entry_date >= p_from AND je.entry_date <= p_to
       AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
       AND jl.account_code LIKE '1355%'
  ) x;

  RETURN jsonb_build_object(
    'iva_generado', v_iva_generado,
    'iva_descontable', v_iva_descontable,
    'iva_neto', v_iva_neto,
    'total_facturado', v_total_facturado,
    'compras', v_compras,
    'iva', v_detalle -> 'iva',
    'inc', v_detalle -> 'inc',
    'sin_detalle', v_detalle -> 'sin_detalle',
    'por_tarifa', v_detalle -> 'por_tarifa',
    'por_codigo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'codigo', CASE t ->> 'clase' WHEN 'EXENTO' THEN 'EXENTO' WHEN 'SIN_DETALLE' THEN 'SIN_DETALLE'
                              ELSE (t ->> 'clase') || '_' || TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM (t ->> 'tarifa')))
                         END,
               'tasa', COALESCE((t ->> 'tarifa')::numeric, 0),
               'base', (t ->> 'base')::numeric,
               'monto', (t ->> 'neto')::numeric))
        FROM jsonb_array_elements(v_detalle -> 'por_tarifa') t), '[]'::jsonb),
    'retenciones', v_retenciones,
    'saldo_iva_estimado', ROUND(COALESCE((v_detalle -> 'iva' ->> 'neto')::numeric, 0) - v_iva_descontable, 2)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_impuestos(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_impuestos(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_reporte_impuestos(bigint, timestamp with time zone, timestamp with time zone, bigint) IS
  'Reportes › Impuestos: IVA e INC netos de notas crédito y devoluciones, por tarifa; IVA de compras; retenciones que nos practicaron (1355). Informativo: lo que se paga sale de la declaración.';

-- ── 2. Ventas por canal y por sede ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_reporte_ventas_canal_sede(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone, p_branch_id bigint DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sucursales integer[];
  v_cifras jsonb;
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

  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Rango inválido' USING ERRCODE = '22023';
  END IF;
  IF p_to - p_from > interval '400 days' THEN
    RAISE EXCEPTION 'Rango demasiado largo' USING ERRCODE = '22023';
  END IF;

  -- Las sucursales que el usuario ve, igual que Todas las ventas.
  v_sucursales := public.pos_ventas_sucursales(p_organization_id::integer, p_branch_id::integer);

  -- La regla única de ventas netas (sin IVA ni INC, menos devoluciones, sin propinas).
  v_cifras := public.fn_ventas_netas_cifras(p_organization_id::integer, v_sucursales, p_from, p_to);

  RETURN v_cifras || jsonb_build_object(
    'sedes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', b.id, 'nombre', b.name) ORDER BY b.name)
        FROM public.branches b
       WHERE b.organization_id = p_organization_id
         AND b.id = ANY (v_sucursales)), '[]'::jsonb));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_ventas_canal_sede(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_ventas_canal_sede(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_reporte_ventas_canal_sede(bigint, timestamp with time zone, timestamp with time zone, bigint) IS
  'Reportes › Ventas por canal y por sede: fn_ventas_netas_cifras (la regla única del Inicio y de Todas las ventas) con las sucursales que el usuario ve. Canal y sede suman el total.';
