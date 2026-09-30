-- Reportes contables: montos de asiento en moneda base.
--
-- journal_lines.debit_base y credit_base existen para la contabilidad
-- multimoneda, pero ningún generador de asientos las llena: tienen DEFAULT 0 y
-- currency_code queda NULL. Al 2026-09-30, 51.087 de 51.095 líneas tienen
-- debit_base = credit_base = 0 con débito o crédito distinto de cero. Las
-- funciones de reportes que sumaban *_base devolvían cero en toda la
-- organización: balance general, estado de resultados y presupuesto vs real.
--
-- No se rellenan los datos: los asientos publicados son inmutables
-- (trg_journal_lines_inmutable) y la corrección debe valer también para las
-- líneas que se sigan creando sin *_base. Se lee con monto_base_asiento():
-- el valor en moneda base si está, y si no el valor en la moneda de la línea
-- por su tasa (1 cuando no hay tasa, que es el caso de la moneda base).
--
-- De paso, tres defectos de las mismas funciones:
--   - estado de resultados: sumaba los costos con type = 'cost', que no existe
--     en chart_of_accounts (asset, liability, equity, income, expense). Los
--     costos se toman ahora por clase del PUC (6 y 7) y los gastos son el resto
--     de 'expense'.
--   - balance general: no incluía el resultado del ejercicio (ingresos menos
--     costos y gastos aún no trasladados al patrimonio), así que activo y
--     pasivo + patrimonio no cuadraban. Se devuelve 'resultado_ejercicio' y se
--     suma en 'total_pasivo_patrimonio'.
--   - presupuesto vs real: con presupuestos cargados leía budget_lines.amount,
--     que no existe (es planned_amount), y unía journal_lines solo por código
--     de cuenta, sin filtrar la organización de la línea. Presupuesto y real se
--     agregan ahora por separado, cada uno de su organización, y el presupuesto
--     se limita a los meses del rango.

CREATE OR REPLACE FUNCTION public.monto_base_asiento(p_monto numeric, p_monto_base numeric, p_tasa numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $$
  SELECT coalesce(nullif(p_monto_base, 0), coalesce(p_monto, 0) * coalesce(nullif(p_tasa, 0), 1))
$$;

COMMENT ON FUNCTION public.monto_base_asiento(numeric, numeric, numeric) IS
  'Monto de una línea de asiento en moneda base: *_base si está, si no el monto por su tasa de cambio (1 sin tasa).';

REVOKE EXECUTE ON FUNCTION public.monto_base_asiento(numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.monto_base_asiento(numeric, numeric, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Balance general
-- ---------------------------------------------------------------------------
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
  v_resultado numeric;
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

  WITH lineas AS (
    SELECT ca.account_code, ca.name, ca.type,
           public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)
             - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate) AS neto
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON jl.account_code = ca.account_code
     WHERE je.organization_id = p_organization_id
       AND je.entry_date <= p_as_of
       AND je.posted = true
       AND ca.organization_id = p_organization_id
  )
  SELECT
    COALESCE(SUM(neto) FILTER (WHERE type = 'asset'), 0),
    COALESCE(-SUM(neto) FILTER (WHERE type = 'liability'), 0),
    COALESCE(-SUM(neto) FILTER (WHERE type = 'equity'), 0),
    COALESCE(-SUM(neto) FILTER (WHERE type IN ('income', 'expense')), 0)
  INTO v_activos, v_pasivos, v_patrimonio, v_resultado
  FROM lineas;

  -- Detalle por cuenta
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cuenta', d.account_code,
    'nombre', d.name,
    'tipo', d.type,
    'saldo', d.saldo
  ) ORDER BY d.type, d.account_code), '[]'::jsonb) INTO v_detalle
  FROM (
    SELECT ca.account_code, ca.name, ca.type,
           CASE WHEN ca.type = 'asset' THEN 1 ELSE -1 END * COALESCE(SUM(
             public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)
               - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)
           ), 0) AS saldo
    FROM journal_lines jl
    JOIN journal_entries je ON jl.journal_entry_id = je.id
    JOIN chart_of_accounts ca ON jl.account_code = ca.account_code
    WHERE je.organization_id = p_organization_id
      AND je.entry_date <= p_as_of
      AND je.posted = true
      AND ca.organization_id = p_organization_id
      AND ca.type IN ('asset', 'liability', 'equity')
    GROUP BY ca.account_code, ca.name, ca.type
  ) d
  WHERE d.saldo <> 0;

  RETURN jsonb_build_object(
    'activos', v_activos,
    'pasivos', v_pasivos,
    'patrimonio', v_patrimonio,
    'resultado_ejercicio', v_resultado,
    'total_pasivo_patrimonio', v_pasivos + v_patrimonio + v_resultado,
    'detalle', v_detalle
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_balance_general(bigint, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_balance_general(bigint, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Estado de resultados
-- ---------------------------------------------------------------------------
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

  -- Costos: clases 6 y 7 del PUC (chart_of_accounts no tiene type = 'cost').
  WITH cuentas AS (
    SELECT ca.account_code, ca.name, ca.type,
           CASE
             WHEN ca.type = 'income' THEN 'ingreso'
             WHEN left(ca.account_code, 1) IN ('6', '7') THEN 'costo'
             ELSE 'gasto'
           END AS rubro,
           CASE WHEN ca.type = 'income' THEN -1 ELSE 1 END * COALESCE(SUM(
             public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)
               - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)
           ), 0) AS monto
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON jl.account_code = ca.account_code
     WHERE je.organization_id = p_organization_id
       AND je.entry_date >= p_from AND je.entry_date <= p_to
       AND je.posted = true
       AND ca.organization_id = p_organization_id
       AND ca.type IN ('income', 'expense')
     GROUP BY ca.account_code, ca.name, ca.type
  )
  SELECT
    COALESCE(SUM(monto) FILTER (WHERE rubro = 'ingreso'), 0),
    COALESCE(SUM(monto) FILTER (WHERE rubro = 'costo'), 0),
    COALESCE(SUM(monto) FILTER (WHERE rubro = 'gasto'), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'cuenta', account_code,
      'nombre', name,
      'tipo', type,
      'rubro', rubro,
      'monto', monto
    ) ORDER BY type, account_code), '[]'::jsonb)
  INTO v_ingresos, v_costos, v_gastos, v_detalle
  FROM cuentas;

  v_utilidad_bruta := v_ingresos - v_costos;
  v_utilidad_operativa := v_utilidad_bruta - v_gastos;
  v_utilidad_neta := v_utilidad_operativa;

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

REVOKE EXECUTE ON FUNCTION public.fn_reporte_estado_resultados(bigint, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_estado_resultados(bigint, timestamptz, timestamptz) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Presupuesto vs real
-- ---------------------------------------------------------------------------
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

REVOKE EXECUTE ON FUNCTION public.fn_reporte_presupuesto_vs_real(bigint, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_presupuesto_vs_real(bigint, timestamptz, timestamptz) TO authenticated, service_role;
