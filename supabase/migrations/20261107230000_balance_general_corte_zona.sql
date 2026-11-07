-- Frente G, consolidación de reportes de Finanzas (2026-11-07). Aplicada por el MCP con orden del dueño.
--
-- Problema: `fn_reporte_balance_general` (reporte `balance-general` de Reportes,
-- también en cierres y documentos) compara `journal_entries.entry_date`
-- (timestamptz) con `p_as_of` (date). La fecha se convierte a la medianoche UTC
-- del día de corte: en America/Bogota eso es las 7 p. m. del día ANTERIOR, así
-- que el corte deja por fuera casi todo el día de corte.
--
-- Evidencia (solo lectura, corte 2026-11-07, comparado con fn_saldos_cuentas
-- hasta el fin del día en la zona de la organización, que es lo que usa la
-- pantalla de Finanzas):
--   org 333: activos 203.484.727 vs 203.504.727; pasivos 610.531 vs 618.806;
--            resultado 202.874.196 vs 202.885.921 (7 asientos del 7 de nov. fuera).
--   org 338: activos 188.040 vs 200.276; pasivos 84.131 vs 85.024;
--            resultado 103.909 vs 115.252 (3 asientos fuera).
--   orgs 335 y 339: iguales (sin asientos el día de corte).
--
-- Corrección: el corte es el fin del día `p_as_of` en la zona de la
-- organización (`fn_timezone_for`), como en el motor de estados
-- (20261107141000_estados_financieros_motor.sql). Nada más cambia.
-- `CREATE OR REPLACE` conserva el ACL vigente (anon y PUBLIC revocados).

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
  -- Fin del día de corte en la zona de la organización (exclusivo).
  v_corte timestamptz;
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

  v_corte := (p_as_of + 1)::timestamp
    AT TIME ZONE coalesce(public.fn_timezone_for(p_organization_id::integer, null), 'America/Bogota');

  WITH lineas AS (
    SELECT ca.account_code, ca.name, ca.type,
           public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)
             - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate) AS neto
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_entry_id = je.id
      JOIN chart_of_accounts ca ON jl.account_code = ca.account_code
     WHERE je.organization_id = p_organization_id
       AND je.entry_date < v_corte
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
      AND je.entry_date < v_corte
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
