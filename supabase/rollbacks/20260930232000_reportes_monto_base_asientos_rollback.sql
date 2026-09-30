-- Reversión de 20260930232000_reportes_monto_base_asientos.
--
-- Devuelve las tres funciones a su definición anterior (la de
-- 20260922233000_reportes_cerrar_anon_y_guarda_pertenencia, que sumaba
-- debit_base/credit_base) y borra monto_base_asiento. No toca datos.
-- Aplicar ANTES la reversión de 20260930233000_reportes_v2_consultas_nuevas,
-- cuyas funciones usan monto_base_asiento.

CREATE OR REPLACE FUNCTION public.fn_reporte_balance_general(p_organization_id bigint, p_as_of date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_activos numeric;
  v_pasivos numeric;
  v_patrimonio numeric;
  v_detalle jsonb;
BEGIN
  -- Guarda de pertenencia (afirmación positiva incondicional: con anon o
  -- service_role auth.uid() es NULL y el EXISTS falla cerrado).
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

  -- Sumar saldos acumulados hasta la fecha
  SELECT
    COALESCE(SUM(CASE WHEN ca.type = 'asset' THEN jl.debit_base - jl.credit_base ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ca.type = 'liability' THEN jl.credit_base - jl.debit_base ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ca.type = 'equity' THEN jl.credit_base - jl.debit_base ELSE 0 END), 0)
  INTO v_activos, v_pasivos, v_patrimonio
  FROM journal_lines jl
  JOIN journal_entries je ON jl.journal_entry_id = je.id
  JOIN chart_of_accounts ca ON jl.account_code = ca.account_code
  WHERE je.organization_id = p_organization_id
    AND je.entry_date <= p_as_of
    AND je.posted = true
    AND ca.organization_id = p_organization_id
    AND ca.type IN ('asset', 'liability', 'equity');

  -- Detalle por cuenta
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cuenta', d.account_code,
    'nombre', d.name,
    'tipo', d.type,
    'saldo', d.saldo
  )), '[]'::jsonb) INTO v_detalle
  FROM (
    SELECT ca.account_code, ca.name, ca.type,
           CASE WHEN ca.type = 'asset' THEN COALESCE(SUM(jl.debit_base - jl.credit_base), 0)
                ELSE COALESCE(SUM(jl.credit_base - jl.debit_base), 0) END AS saldo
    FROM journal_lines jl
    JOIN journal_entries je ON jl.journal_entry_id = je.id
    JOIN chart_of_accounts ca ON jl.account_code = ca.account_code
    WHERE je.organization_id = p_organization_id
      AND je.entry_date <= p_as_of
      AND je.posted = true
      AND ca.organization_id = p_organization_id
      AND ca.type IN ('asset', 'liability', 'equity')
    GROUP BY ca.account_code, ca.name, ca.type
    HAVING CASE WHEN ca.type = 'asset' THEN COALESCE(SUM(jl.debit_base - jl.credit_base), 0)
                ELSE COALESCE(SUM(jl.credit_base - jl.debit_base), 0) END <> 0
    ORDER BY ca.type, ca.account_code
  ) d;

  RETURN jsonb_build_object(
    'activos', v_activos,
    'pasivos', v_pasivos,
    'patrimonio', v_patrimonio,
    'total_pasivo_patrimonio', v_pasivos + v_patrimonio,
    'detalle', v_detalle
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_reporte_estado_resultados(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ingresos numeric;
  v_costos numeric;
  v_gastos numeric;
  v_utilidad_bruta numeric;
  v_utilidad_operativa numeric;
  v_utilidad_neta numeric;
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

  -- Sumar débitos/créditos por tipo de cuenta
  SELECT
    COALESCE(SUM(CASE WHEN ca.type = 'income' THEN jl.credit_base - jl.debit_base ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ca.type = 'cost' THEN jl.debit_base - jl.credit_base ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ca.type = 'expense' THEN jl.debit_base - jl.credit_base ELSE 0 END), 0)
  INTO v_ingresos, v_costos, v_gastos
  FROM journal_lines jl
  JOIN journal_entries je ON jl.journal_entry_id = je.id
  JOIN chart_of_accounts ca ON jl.account_code = ca.account_code
  WHERE je.organization_id = p_organization_id
    AND je.entry_date >= p_from AND je.entry_date <= p_to
    AND je.posted = true
    AND ca.organization_id = p_organization_id;

  v_utilidad_bruta := v_ingresos - v_costos;
  v_utilidad_operativa := v_utilidad_bruta - v_gastos;
  v_utilidad_neta := v_utilidad_operativa;

  -- Detalle por cuenta
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cuenta', d.account_code,
    'nombre', d.name,
    'tipo', d.type,
    'monto', d.monto
  )), '[]'::jsonb) INTO v_detalle
  FROM (
    SELECT ca.account_code, ca.name, ca.type,
           CASE WHEN ca.type = 'income' THEN COALESCE(SUM(jl.credit_base - jl.debit_base), 0)
                ELSE COALESCE(SUM(jl.debit_base - jl.credit_base), 0) END AS monto
    FROM journal_lines jl
    JOIN journal_entries je ON jl.journal_entry_id = je.id
    JOIN chart_of_accounts ca ON jl.account_code = ca.account_code
    WHERE je.organization_id = p_organization_id
      AND je.entry_date >= p_from AND je.entry_date <= p_to
      AND je.posted = true
      AND ca.organization_id = p_organization_id
      AND ca.type IN ('income', 'cost', 'expense')
    GROUP BY ca.account_code, ca.name, ca.type
    ORDER BY ca.type, ca.account_code
  ) d;

  RETURN jsonb_build_object(
    'ingresos', v_ingresos,
    'costos', v_costos,
    'gastos', v_gastos,
    'utilidad_bruta', v_utilidad_bruta,
    'utilidad_operativa', v_utilidad_operativa,
    'utilidad_neta', v_utilidad_neta,
    'detalle', v_detalle
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_reporte_presupuesto_vs_real(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tiene_presupuesto boolean;
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

  -- Verificar si hay presupuestos
  SELECT EXISTS(
    SELECT 1 FROM budgets b
    WHERE b.organization_id = p_organization_id
  ) INTO v_tiene_presupuesto;

  IF NOT v_tiene_presupuesto THEN
    -- Sin presupuestos: retornar solo reales
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'cuenta', d.account_code,
      'nombre', d.name,
      'tipo', d.type,
      'presupuesto', 0,
      'real', d.real,
      'diferencia', d.real,
      'variacion', null
    )), '[]'::jsonb) INTO v_detalle
    FROM (
      SELECT ca.account_code, ca.name, ca.type,
             CASE WHEN ca.type IN ('income') THEN COALESCE(SUM(jl.credit_base - jl.debit_base), 0)
                  ELSE COALESCE(SUM(jl.debit_base - jl.credit_base), 0) END AS real
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON jl.account_code = ca.account_code
      WHERE je.organization_id = p_organization_id
        AND je.entry_date >= p_from AND je.entry_date <= p_to
        AND je.posted = true
        AND ca.organization_id = p_organization_id
      GROUP BY ca.account_code, ca.name, ca.type
      ORDER BY ca.account_code
    ) d;

    RETURN jsonb_build_object('tiene_presupuesto', false, 'detalle', v_detalle);
  END IF;

  -- Con presupuestos: comparar
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cuenta', d.account_code,
    'nombre', d.name,
    'presupuesto', d.presupuesto,
    'real', d.real,
    'diferencia', d.real - d.presupuesto,
    'variacion', CASE WHEN d.presupuesto <> 0 THEN round(((d.real - d.presupuesto) / d.presupuesto * 100)::numeric, 2) ELSE null END
  )), '[]'::jsonb) INTO v_detalle
  FROM (
    SELECT ca.account_code, ca.name,
           COALESCE(SUM(bl.amount), 0) AS presupuesto,
           CASE WHEN ca.type = 'income' THEN COALESCE(SUM(jl.credit_base - jl.debit_base), 0)
                ELSE COALESCE(SUM(jl.debit_base - jl.credit_base), 0) END AS real
    FROM chart_of_accounts ca
    LEFT JOIN budget_lines bl ON bl.account_code = ca.account_code
    LEFT JOIN budgets b ON bl.budget_id = b.id AND b.organization_id = p_organization_id
    LEFT JOIN journal_lines jl ON jl.account_code = ca.account_code
    LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id 
      AND je.organization_id = p_organization_id
      AND je.entry_date >= p_from AND je.entry_date <= p_to
      AND je.posted = true
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.account_code, ca.name
    HAVING COALESCE(SUM(bl.amount), 0) <> 0 
        OR COALESCE(SUM(jl.debit_base), 0) + COALESCE(SUM(jl.credit_base), 0) <> 0
    ORDER BY ca.account_code
  ) d;

  RETURN jsonb_build_object('tiene_presupuesto', true, 'detalle', v_detalle);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_balance_general(bigint, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_balance_general(bigint, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_reporte_estado_resultados(bigint, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_estado_resultados(bigint, timestamptz, timestamptz) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_reporte_presupuesto_vs_real(bigint, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_presupuesto_vs_real(bigint, timestamptz, timestamptz) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.monto_base_asiento(numeric, numeric, numeric);
