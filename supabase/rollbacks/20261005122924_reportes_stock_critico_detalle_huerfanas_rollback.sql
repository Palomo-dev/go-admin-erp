-- Reversión de 20261005122924_reportes_stock_critico_detalle_huerfanas.
--
-- Devuelve fn_reporte_stock_critico_detalle a su versión de 20261005121435
-- (sin excluir las variantes de un padre eliminado). No toca datos.
-- CREATE OR REPLACE con la misma firma: conserva los GRANT.
-- Para quitar la función del todo, aplicar después
-- 20261005121435_reportes_stock_critico_detalle_rollback.sql.

CREATE OR REPLACE FUNCTION public.fn_reporte_stock_critico_detalle(
  p_organization_id bigint,
  p_branch_id bigint default null
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_total bigint;
  v_filas jsonb;
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

  SELECT count(*)
    INTO v_total
  FROM public.stock_levels sl
  JOIN public.products p ON p.id = sl.product_id
  WHERE p.organization_id = p_organization_id
    AND p.status = 'active'
    AND p.track_stock = true
    AND (p_branch_id IS NULL OR sl.branch_id = p_branch_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'producto_id', f.product_id,
           'padre_id', f.parent_product_id,
           'sku', f.sku,
           'nombre', f.name,
           'categoria', f.categoria,
           'sucursal', f.sucursal,
           'stock', f.qty_on_hand,
           'minimo', f.min_level,
           'costo', f.costo,
           'padre_sku', f.padre_sku,
           'padre_nombre', f.padre_nombre
         ) ORDER BY f.product_id, f.branch_id, f.lot_id NULLS FIRST), '[]'::jsonb)
    INTO v_filas
  FROM (
    SELECT sl.product_id,
           sl.branch_id,
           sl.lot_id,
           p.parent_product_id,
           p.sku,
           p.name,
           c.name AS categoria,
           b.name AS sucursal,
           coalesce(sl.qty_on_hand, 0) AS qty_on_hand,
           coalesce(sl.min_level, 0) AS min_level,
           CASE
             WHEN coalesce(sl.avg_cost, 0) > 0 THEN sl.avg_cost
             ELSE coalesce((
               SELECT pc.cost
               FROM public.product_costs pc
               WHERE pc.product_id = p.id
                 AND pc.effective_to IS NULL
               ORDER BY pc.effective_from DESC
               LIMIT 1
             ), 0)
           END AS costo,
           pp.sku AS padre_sku,
           pp.name AS padre_nombre
    FROM public.stock_levels sl
    JOIN public.products p ON p.id = sl.product_id
    LEFT JOIN public.categories c
      ON c.id = p.category_id AND c.organization_id = p.organization_id
    LEFT JOIN public.branches b
      ON b.id = sl.branch_id AND b.organization_id = p.organization_id
    LEFT JOIN public.products pp
      ON pp.id = p.parent_product_id AND pp.organization_id = p.organization_id
    WHERE p.organization_id = p_organization_id
      AND p.status = 'active'
      AND p.track_stock = true
      AND (p_branch_id IS NULL OR sl.branch_id = p_branch_id)
      AND (
        coalesce(sl.qty_on_hand, 0) <= 0
        OR (coalesce(sl.min_level, 0) > 0 AND coalesce(sl.qty_on_hand, 0) <= sl.min_level)
      )
  ) f;

  RETURN jsonb_build_object('total', v_total, 'filas', v_filas);
END;
$$;

COMMENT ON FUNCTION public.fn_reporte_stock_critico_detalle(bigint, bigint) IS
  'Reporte «Stock crítico»: filas críticas (existencia <= 0, o <= mínimo) con costo efectivo, y total de existencias del filtro. Guarda de pertenencia y alcance de sucursal.';
