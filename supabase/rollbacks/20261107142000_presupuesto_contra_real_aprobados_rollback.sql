-- Revierte 20261107142000 al cuerpo anterior, leído de producción antes de aplicar
-- (md5 de pg_get_functiondef: d687a1ddcaace38c9213fcb35b780d3a).
-- Es un paso atrás a sabiendas: vuelve a sumar borradores y a comparar por código exacto.
CREATE OR REPLACE FUNCTION public.fn_reporte_presupuesto_vs_real(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tiene_presupuesto boolean;
  v_tz text;
  v_mes_desde date;
  v_mes_hasta date;
  v_detalle jsonb;
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
  PERFORM public.reporte_exigir_alcance_sucursal(p_organization_id, NULL);

  SELECT EXISTS(
    SELECT 1 FROM budgets b
    WHERE b.organization_id = p_organization_id
  ) INTO v_tiene_presupuesto;

  v_tz := coalesce(public.fn_timezone_for(p_organization_id::integer, NULL), 'America/Bogota');
  v_mes_desde := date_trunc('month', p_from AT TIME ZONE v_tz)::date;
  v_mes_hasta := date_trunc('month', p_to AT TIME ZONE v_tz)::date;

  -- budget_lines.period es el mes (1-12) del año fiscal del presupuesto; una
  -- línea sin mes es anual y solo cuenta si el rango cubre el año completo.
  WITH reales AS (
    SELECT jl.account_code,
           COALESCE(SUM(
             public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)
               - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)
           ), 0) AS neto
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_entry_id = je.id
     WHERE je.organization_id = p_organization_id
       AND je.entry_date >= p_from AND je.entry_date <= p_to
       AND je.posted = true
     GROUP BY jl.account_code
  ), presupuestos AS (
    SELECT bl.account_code, COALESCE(SUM(bl.planned_amount), 0) AS presupuesto
      FROM budget_lines bl
      JOIN budgets b ON b.id = bl.budget_id AND b.organization_id = p_organization_id
     WHERE bl.organization_id = p_organization_id
       AND (
         (bl.period BETWEEN 1 AND 12
           AND make_date(b.fiscal_year, bl.period, 1) BETWEEN v_mes_desde AND v_mes_hasta)
         OR (bl.period IS NULL
           AND make_date(b.fiscal_year, 1, 1) >= v_mes_desde
           AND make_date(b.fiscal_year, 12, 1) <= v_mes_hasta)
       )
     GROUP BY bl.account_code
  ), filas AS (
    SELECT ca.account_code, ca.name, ca.type,
           COALESCE(p.presupuesto, 0) AS presupuesto,
           CASE WHEN ca.type = 'income' THEN -1 ELSE 1 END * COALESCE(r.neto, 0) AS real,
           r.account_code IS NOT NULL AS con_movimiento
      FROM chart_of_accounts ca
      LEFT JOIN reales r ON r.account_code = ca.account_code
      LEFT JOIN presupuestos p ON p.account_code = ca.account_code
     WHERE ca.organization_id = p_organization_id
       AND (r.account_code IS NOT NULL OR p.account_code IS NOT NULL)
  )
  SELECT COALESCE(jsonb_agg(
           CASE WHEN v_tiene_presupuesto THEN
             jsonb_build_object(
               'cuenta', f.account_code,
               'nombre', f.name,
               'tipo', f.type,
               'presupuesto', f.presupuesto,
               'real', f.real,
               'diferencia', f.real - f.presupuesto,
               'variacion', CASE WHEN f.presupuesto <> 0 THEN round(((f.real - f.presupuesto) / f.presupuesto * 100)::numeric, 2) ELSE null END
             )
           ELSE
             jsonb_build_object(
               'cuenta', f.account_code,
               'nombre', f.name,
               'tipo', f.type,
               'presupuesto', 0,
               'real', f.real,
               'diferencia', f.real,
               'variacion', null
             )
           END ORDER BY f.account_code), '[]'::jsonb)
    INTO v_detalle
    FROM filas f
   WHERE f.presupuesto <> 0 OR f.con_movimiento;

  RETURN jsonb_build_object('tiene_presupuesto', v_tiene_presupuesto, 'detalle', v_detalle);
END;
$function$;
