-- Reversión de 20261124120000_reportes_impuestos_netos_y_ventas_canal_sede.sql.
-- Devuelve fn_reporte_impuestos a su definición anterior (tal como estaba en la base el
-- 2026-11-24) y retira fn_reporte_ventas_canal_sede. No toca datos.

CREATE OR REPLACE FUNCTION public.fn_reporte_impuestos(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone, p_branch_id bigint DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_iva_generado numeric;
  v_iva_descontable numeric;
  v_iva_neto numeric;
  v_total_facturado numeric;
  v_por_codigo jsonb;
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

REVOKE EXECUTE ON FUNCTION public.fn_reporte_impuestos(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_impuestos(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_reporte_impuestos(bigint, timestamp with time zone, timestamp with time zone, bigint) IS NULL;

DROP FUNCTION IF EXISTS public.fn_reporte_ventas_canal_sede(bigint, timestamptz, timestamptz, bigint);
