-- Rollback de 20261122075104_reportes_ventas_ampliados.
--
-- Quita las RPC nuevas (ventas por persona, lo más vendido, ítems vendidos,
-- despachos) y sus dos funciones internas, y devuelve «Ventas por hora» y el
-- «por día» de «Ventas del periodo» a la versión anterior. ADVERTENCIA: esa
-- versión agrupa con la zona de la base (UTC), es decir, vuelve la falla de
-- las horas corridas. Revierta también el código de los reportes.

DROP FUNCTION IF EXISTS public.fn_reporte_despachos(bigint, timestamptz, timestamptz, bigint);
DROP FUNCTION IF EXISTS public.fn_reporte_items_vendidos(bigint, timestamptz, timestamptz, bigint, text, uuid, text[], boolean, integer);
DROP FUNCTION IF EXISTS public.fn_reporte_mas_vendido(bigint, timestamptz, timestamptz, bigint, text, uuid, text[]);
DROP FUNCTION IF EXISTS public.fn_reporte_ventas_personas(bigint, timestamptz, timestamptz, bigint, text, uuid, text[]);
DROP FUNCTION IF EXISTS public.reporte_ventas_base(bigint, timestamptz, timestamptz, bigint, text, uuid, text[]);
DROP FUNCTION IF EXISTS public.reporte_pagos_venta(bigint, uuid);

CREATE OR REPLACE FUNCTION public.fn_reporte_ventas_por_hora(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone, p_branch_id bigint DEFAULT NULL::bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_por_hora jsonb;
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

DO $$
DECLARE
  v_def text := pg_get_functiondef('public.fn_reporte_ventas_resumen(bigint, timestamptz, timestamptz, bigint)'::regprocedure);
BEGIN
  IF position('AT TIME ZONE public.fn_timezone_for' IN v_def) = 0 THEN
    RETURN;
  END IF;
  EXECUTE replace(replace(v_def,
    'SELECT (s.sale_date AT TIME ZONE public.fn_timezone_for(p_organization_id::integer, p_branch_id::integer))::date AS dia,',
    'SELECT DATE(s.sale_date) AS dia,'),
    'GROUP BY 1
    ORDER BY dia', 'GROUP BY DATE(s.sale_date)
    ORDER BY dia');
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reporte_ventas_por_hora(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_ventas_por_hora(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;
