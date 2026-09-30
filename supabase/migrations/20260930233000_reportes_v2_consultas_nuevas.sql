-- Reportes v2: consultas de los reportes nuevos del centro de reportes
-- (Figma, página 14 Reportes, listas 10 a 14) y dos que corrigen reportes
-- existentes.
--
-- Todas siguen el contrato de fn_reporte_*:
--   - firma (p_organization_id bigint, p_from timestamptz, p_to timestamptz,
--     p_branch_id bigint default null): rango de instantes incluidos, ya
--     resuelto en la zona de la organización por quien llama;
--   - guarda de pertenencia al principio del cuerpo (42501) y después
--     reporte_exigir_alcance_sucursal: sin sucursal es el consolidado y solo
--     lo ve quien tiene acceso a todas;
--   - security definer, search_path fijo, EXECUTE revocado a PUBLIC y anon.
--
-- Los montos contables se leen con monto_base_asiento() (ver
-- 20260930232000_reportes_monto_base_asientos): debit_base/credit_base no se
-- llenan en los asientos que generan los módulos.
--
-- Contabilidad (alcance de toda la organización; la sucursal queda como
-- filtro opcional porque journal_entries.branch_id es obligatorio):
--   fn_reporte_balance_prueba          saldo inicial, débitos, créditos y
--                                      saldo final por cuenta (asientos
--                                      publicados, moneda base)
--   fn_reporte_libro_diario_origen     asientos del periodo por el documento
--                                      que los generó (journal_entries.source)
--   fn_reporte_gastos_naturaleza       gastos y costos por grupo del PUC
--   fn_reporte_periodo_fiscal          lo que falta para cerrar el periodo
--   fn_reporte_resultados_desglose     estado de resultados por sucursal, por
--                                      centro de costo y tendencia de 12 meses
-- Finanzas y tesorería (por sucursal):
--   fn_reporte_bancos_conciliacion     movimientos bancarios frente a lo
--                                      conciliado, por cuenta
--   fn_reporte_caja_bancos_diario      saldo de caja (1105) y bancos (111x) al
--                                      cierre de cada día, según el mayor
--   fn_reporte_rentabilidad_producto   ingreso neto, costo real (salidas de
--                                      inventario de la venta) y margen; los
--                                      dos reportes de rentabilidad por
--                                      producto mostraban solo ventas
-- Inventario y compras (por sucursal):
--   fn_reporte_movimiento_valorizado   saldo inicial, entradas, salidas y
--                                      saldo final al costo, por producto
--   fn_reporte_compras_proveedor       facturas de compra confirmadas por
--                                      proveedor
--   fn_reporte_ordenes_compra          órdenes emitidas, recibidas y
--                                      pendientes de recibir
--
-- Las listas por fila se cortan en 2.000 (las de mayor importe primero) y lo
-- dicen con 'truncado'; los totales siempre cubren todo el periodo.

-- ---------------------------------------------------------------------------
-- Balance de prueba
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_balance_prueba(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id bigint default null
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cuentas jsonb;
  v_totales jsonb;
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

  WITH movimientos AS (
    SELECT jl.account_code,
           sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) FILTER (WHERE je.entry_date < p_from) AS inicial,
           sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)) FILTER (WHERE je.entry_date >= p_from) AS debitos,
           sum(public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) FILTER (WHERE je.entry_date >= p_from) AS creditos
      FROM public.journal_lines jl
      JOIN public.journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.organization_id = p_organization_id
       AND je.posted = true
       AND je.entry_date <= p_to
       AND (p_branch_id is null or je.branch_id = p_branch_id)
     GROUP BY jl.account_code
  ), filas AS (
    SELECT m.account_code,
           coalesce(ca.name, m.account_code) AS nombre,
           ca.type AS tipo,
           coalesce(m.inicial, 0) AS saldo_inicial,
           coalesce(m.debitos, 0) AS debitos,
           coalesce(m.creditos, 0) AS creditos,
           coalesce(m.inicial, 0) + coalesce(m.debitos, 0) - coalesce(m.creditos, 0) AS saldo_final
      FROM movimientos m
      LEFT JOIN public.chart_of_accounts ca
        ON ca.organization_id = p_organization_id AND ca.account_code = m.account_code
     WHERE coalesce(m.inicial, 0) <> 0 OR coalesce(m.debitos, 0) <> 0 OR coalesce(m.creditos, 0) <> 0
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'cuenta', f.account_code,
           'nombre', f.nombre,
           'tipo', f.tipo,
           'saldo_inicial', f.saldo_inicial,
           'debitos', f.debitos,
           'creditos', f.creditos,
           'saldo_final', f.saldo_final
         ) ORDER BY f.account_code), '[]'::jsonb),
         jsonb_build_object(
           'debitos', coalesce(sum(f.debitos), 0),
           'creditos', coalesce(sum(f.creditos), 0),
           'diferencia', coalesce(sum(f.debitos), 0) - coalesce(sum(f.creditos), 0),
           'cuentas', count(*)
         )
    INTO v_cuentas, v_totales
    FROM filas f;

  RETURN jsonb_build_object('cuentas', v_cuentas, 'totales', v_totales);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_balance_prueba(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_balance_prueba(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Libro diario por origen
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_libro_diario_origen(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id bigint default null
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_origenes jsonb;
  v_totales jsonb;
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

  WITH asientos AS (
    SELECT je.id,
           coalesce(je.source, 'manual') AS origen,
           je.posted,
           coalesce(sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)), 0) AS debitos,
           coalesce(sum(public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)), 0) AS creditos
      FROM public.journal_entries je
      LEFT JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
     WHERE je.organization_id = p_organization_id
       AND je.entry_date >= p_from AND je.entry_date <= p_to
       AND (p_branch_id is null or je.branch_id = p_branch_id)
     GROUP BY je.id, je.source, je.posted
  ), por_origen AS (
    SELECT a.origen,
           count(*) AS asientos,
           count(*) FILTER (WHERE NOT a.posted) AS sin_publicar,
           count(*) FILTER (WHERE round(a.debitos - a.creditos, 2) <> 0) AS descuadrados,
           sum(a.debitos) FILTER (WHERE a.posted) AS debitos,
           sum(a.creditos) FILTER (WHERE a.posted) AS creditos
      FROM asientos a
     GROUP BY a.origen
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'origen', o.origen,
           'asientos', o.asientos,
           'sin_publicar', o.sin_publicar,
           'descuadrados', o.descuadrados,
           'debitos', coalesce(o.debitos, 0),
           'creditos', coalesce(o.creditos, 0)
         ) ORDER BY o.asientos DESC, o.origen), '[]'::jsonb),
         jsonb_build_object(
           'asientos', coalesce(sum(o.asientos), 0),
           'sin_publicar', coalesce(sum(o.sin_publicar), 0),
           'descuadrados', coalesce(sum(o.descuadrados), 0),
           'debitos', coalesce(sum(o.debitos), 0),
           'creditos', coalesce(sum(o.creditos), 0)
         )
    INTO v_origenes, v_totales
    FROM por_origen o;

  RETURN jsonb_build_object('origenes', v_origenes, 'totales', v_totales);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_libro_diario_origen(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_libro_diario_origen(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Gastos por naturaleza (grupos del PUC: 51, 52, 53, 54, 61, 7…)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_gastos_naturaleza(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id bigint default null
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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

  WITH cuentas AS (
    SELECT jl.account_code AS cuenta,
           coalesce(max(ca.name), jl.account_code) AS nombre,
           left(jl.account_code, 2) AS grupo,
           sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) AS monto
      FROM public.journal_lines jl
      JOIN public.journal_entries je ON je.id = jl.journal_entry_id
      LEFT JOIN public.chart_of_accounts ca
        ON ca.organization_id = p_organization_id AND ca.account_code = jl.account_code
     WHERE je.organization_id = p_organization_id
       AND je.posted = true
       AND je.entry_date >= p_from AND je.entry_date <= p_to
       AND (p_branch_id is null or je.branch_id = p_branch_id)
       AND left(jl.account_code, 1) IN ('5', '6', '7')
     GROUP BY jl.account_code
    HAVING sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) <> 0
  ), total AS (
    SELECT coalesce(sum(monto), 0) AS monto, count(*) AS n FROM cuentas
  ), grupos AS (
    SELECT c.grupo,
           coalesce(
             (SELECT ca.name FROM public.chart_of_accounts ca
               WHERE ca.organization_id = p_organization_id AND ca.account_code = c.grupo LIMIT 1),
             CASE c.grupo
               WHEN '51' THEN 'Operacionales de administración'
               WHEN '52' THEN 'Operacionales de ventas'
               WHEN '53' THEN 'No operacionales'
               WHEN '54' THEN 'Impuesto de renta y complementarios'
               WHEN '59' THEN 'Ganancias y pérdidas'
               WHEN '61' THEN 'Costo de ventas y de prestación de servicios'
               WHEN '62' THEN 'Compras'
               ELSE 'Grupo ' || c.grupo
             END
           ) AS nombre,
           CASE
             WHEN c.grupo IN ('51', '52') THEN 'operacional'
             WHEN c.grupo = '53' THEN 'no_operacional'
             WHEN c.grupo = '54' THEN 'impuesto'
             WHEN left(c.grupo, 1) IN ('6', '7') THEN 'costo'
             ELSE 'otro'
           END AS naturaleza,
           sum(c.monto) AS monto,
           count(*) AS cuentas
      FROM cuentas c
     GROUP BY c.grupo
  )
  SELECT jsonb_build_object(
           'total', t.monto,
           'grupos', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'grupo', g.grupo,
                      'nombre', g.nombre,
                      'naturaleza', g.naturaleza,
                      'monto', g.monto,
                      'porcentaje', CASE WHEN t.monto <> 0 THEN round(g.monto / t.monto * 100, 2) ELSE 0 END,
                      'cuentas', g.cuentas
                    ) ORDER BY g.grupo), '[]'::jsonb)
               FROM grupos g
           ),
           'cuentas', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'cuenta', c.cuenta, 'nombre', c.nombre, 'grupo', c.grupo, 'monto', c.monto
                    ) ORDER BY c.monto DESC), '[]'::jsonb)
               FROM (SELECT * FROM cuentas ORDER BY monto DESC LIMIT 2000) c
           ),
           'truncado', t.n > 2000
         )
    INTO v_resultado
    FROM total t;

  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_gastos_naturaleza(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_gastos_naturaleza(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Estado del periodo fiscal: lo que falta para cerrar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_periodo_fiscal(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id bigint default null
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tz text;
  v_desde date;
  v_hasta date;
  v_periodos jsonb;
  v_sin_publicar integer;
  v_descuadrados integer;
  v_cajas_abiertas integer;
  v_compras_borrador integer;
  v_cuentas_bancarias integer;
  v_cuentas_conciliadas integer;
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

  v_tz := coalesce(public.fn_timezone_for(p_organization_id::integer, p_branch_id::integer), 'America/Bogota');
  v_desde := (p_from AT TIME ZONE v_tz)::date;
  v_hasta := (p_to AT TIME ZONE v_tz)::date;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'anio', fp.year, 'mes', fp.month, 'tipo', fp.period_type,
           'inicio', fp.start_date, 'fin', fp.end_date,
           'estado', fp.status, 'cerrado_en', fp.closed_at
         ) ORDER BY fp.start_date, fp.period_type), '[]'::jsonb)
    INTO v_periodos
    FROM public.fiscal_periods fp
   WHERE fp.organization_id = p_organization_id
     AND fp.start_date <= v_hasta AND fp.end_date >= v_desde;

  SELECT count(*) FILTER (WHERE NOT je.posted)
    INTO v_sin_publicar
    FROM public.journal_entries je
   WHERE je.organization_id = p_organization_id
     AND je.entry_date >= p_from AND je.entry_date <= p_to
     AND (p_branch_id is null or je.branch_id = p_branch_id);

  SELECT count(*)
    INTO v_descuadrados
    FROM (
      SELECT je.id
        FROM public.journal_entries je
        JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
       WHERE je.organization_id = p_organization_id
         AND je.posted = true
         AND je.entry_date >= p_from AND je.entry_date <= p_to
         AND (p_branch_id is null or je.branch_id = p_branch_id)
       GROUP BY je.id
      HAVING round(sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)) - sum(public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)), 2) <> 0
    ) d;

  SELECT count(*)
    INTO v_cajas_abiertas
    FROM public.cash_sessions cs
   WHERE cs.organization_id = p_organization_id
     AND cs.status = 'open'
     AND cs.opened_at <= p_to
     AND (p_branch_id is null or cs.branch_id = p_branch_id);

  SELECT count(*)
    INTO v_compras_borrador
    FROM public.invoice_purchase ip
   WHERE ip.organization_id = p_organization_id
     AND ip.status = 'draft'
     AND ip.issue_date >= p_from AND ip.issue_date <= p_to
     AND (p_branch_id is null or ip.branch_id = p_branch_id);

  SELECT count(*),
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM public.bank_reconciliations br
            WHERE br.organization_id = p_organization_id
              AND br.bank_account_id = ba.id
              AND br.status = 'closed'
              AND br.period_end >= v_hasta
         ))
    INTO v_cuentas_bancarias, v_cuentas_conciliadas
    FROM public.bank_accounts ba
   WHERE ba.organization_id = p_organization_id
     AND ba.is_active = true
     AND (p_branch_id is null or ba.branch_id = p_branch_id);

  RETURN jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'periodos', v_periodos,
    'asientos_sin_publicar', v_sin_publicar,
    'asientos_descuadrados', v_descuadrados,
    'cajas_abiertas', v_cajas_abiertas,
    'compras_en_borrador', v_compras_borrador,
    'cuentas_bancarias', v_cuentas_bancarias,
    'cuentas_conciliadas', v_cuentas_conciliadas
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_periodo_fiscal(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_periodo_fiscal(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Estado de resultados: desglose por sucursal, centro de costo y 12 meses
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_resultados_desglose(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id bigint default null
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tz text;
  v_mes_fin date;
  v_desde_tendencia timestamptz;
  v_por_sucursal jsonb;
  v_por_centro jsonb;
  v_tendencia jsonb;
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

  v_tz := coalesce(public.fn_timezone_for(p_organization_id::integer, p_branch_id::integer), 'America/Bogota');
  v_mes_fin := date_trunc('month', (p_to AT TIME ZONE v_tz))::date;
  v_desde_tendencia := ((v_mes_fin - interval '11 months')::timestamp) AT TIME ZONE v_tz;

  -- Ingresos: clase 4 (crédito − débito). Costos: clases 6 y 7. Gastos: 5.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'sucursal_id', s.branch_id, 'sucursal', coalesce(b.name, 'Sucursal #' || s.branch_id),
           'ingresos', s.ingresos, 'costos', s.costos, 'gastos', s.gastos,
           'utilidad', s.ingresos - s.costos - s.gastos
         ) ORDER BY s.ingresos DESC), '[]'::jsonb)
    INTO v_por_sucursal
    FROM (
      SELECT je.branch_id,
             coalesce(sum(public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate) - public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)) FILTER (WHERE left(jl.account_code, 1) = '4'), 0) AS ingresos,
             coalesce(sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) FILTER (WHERE left(jl.account_code, 1) IN ('6', '7')), 0) AS costos,
             coalesce(sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) FILTER (WHERE left(jl.account_code, 1) = '5'), 0) AS gastos
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.organization_id = p_organization_id
         AND je.posted = true
         AND je.entry_date >= p_from AND je.entry_date <= p_to
         AND (p_branch_id is null or je.branch_id = p_branch_id)
         AND left(jl.account_code, 1) IN ('4', '5', '6', '7')
       GROUP BY je.branch_id
    ) s
    LEFT JOIN public.branches b ON b.id = s.branch_id AND b.organization_id = p_organization_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'centro_id', c.cost_center_id, 'codigo', cc.code,
           'centro', coalesce(cc.name, 'Sin centro de costo'),
           'ingresos', c.ingresos, 'costos', c.costos, 'gastos', c.gastos,
           'utilidad', c.ingresos - c.costos - c.gastos
         ) ORDER BY (c.cost_center_id IS NULL), c.gastos + c.costos DESC), '[]'::jsonb)
    INTO v_por_centro
    FROM (
      SELECT jl.cost_center_id,
             coalesce(sum(public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate) - public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)) FILTER (WHERE left(jl.account_code, 1) = '4'), 0) AS ingresos,
             coalesce(sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) FILTER (WHERE left(jl.account_code, 1) IN ('6', '7')), 0) AS costos,
             coalesce(sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) FILTER (WHERE left(jl.account_code, 1) = '5'), 0) AS gastos
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.organization_id = p_organization_id
         AND je.posted = true
         AND je.entry_date >= p_from AND je.entry_date <= p_to
         AND (p_branch_id is null or je.branch_id = p_branch_id)
         AND left(jl.account_code, 1) IN ('4', '5', '6', '7')
       GROUP BY jl.cost_center_id
    ) c
    LEFT JOIN public.cost_centers cc ON cc.id = c.cost_center_id AND cc.organization_id = p_organization_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'mes', to_char(m.mes, 'YYYY-MM'),
           'ingresos', coalesce(t.ingresos, 0), 'costos', coalesce(t.costos, 0), 'gastos', coalesce(t.gastos, 0),
           'utilidad', coalesce(t.ingresos, 0) - coalesce(t.costos, 0) - coalesce(t.gastos, 0)
         ) ORDER BY m.mes), '[]'::jsonb)
    INTO v_tendencia
    FROM generate_series(v_mes_fin - interval '11 months', v_mes_fin, interval '1 month') AS m(mes)
    LEFT JOIN (
      SELECT date_trunc('month', je.entry_date AT TIME ZONE v_tz) AS mes,
             coalesce(sum(public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate) - public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)) FILTER (WHERE left(jl.account_code, 1) = '4'), 0) AS ingresos,
             coalesce(sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) FILTER (WHERE left(jl.account_code, 1) IN ('6', '7')), 0) AS costos,
             coalesce(sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) FILTER (WHERE left(jl.account_code, 1) = '5'), 0) AS gastos
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.organization_id = p_organization_id
         AND je.posted = true
         AND je.entry_date >= v_desde_tendencia AND je.entry_date <= p_to
         AND (p_branch_id is null or je.branch_id = p_branch_id)
         AND left(jl.account_code, 1) IN ('4', '5', '6', '7')
       GROUP BY 1
    ) t ON t.mes = m.mes;

  RETURN jsonb_build_object('por_sucursal', v_por_sucursal, 'por_centro_costo', v_por_centro, 'tendencia', v_tendencia);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_resultados_desglose(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_resultados_desglose(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Bancos y conciliación
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_bancos_conciliacion(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id bigint default null
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cuentas jsonb;
  v_totales jsonb;
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

  WITH cuentas AS (
    SELECT ba.id, ba.name, ba.bank_name, ba.account_number, ba.currency, ba.balance,
           count(bt.id) AS movimientos,
           coalesce(sum(bt.amount) FILTER (WHERE bt.amount > 0), 0) AS entradas,
           coalesce(-sum(bt.amount) FILTER (WHERE bt.amount < 0), 0) AS salidas,
           count(bt.id) FILTER (WHERE bt.matched_journal_line_id IS NOT NULL OR bt.status IN ('matched', 'reconciled')) AS conciliados,
           coalesce(sum(abs(bt.amount)) FILTER (WHERE bt.matched_journal_line_id IS NULL AND coalesce(bt.status, 'unmatched') NOT IN ('matched', 'reconciled')), 0) AS por_conciliar
      FROM public.bank_accounts ba
      LEFT JOIN public.bank_transactions bt
        ON bt.bank_account_id = ba.id
       AND bt.organization_id = p_organization_id
       AND bt.trans_date >= p_from AND bt.trans_date <= p_to
     WHERE ba.organization_id = p_organization_id
       AND ba.is_active = true
       AND (p_branch_id is null or ba.branch_id = p_branch_id)
     GROUP BY ba.id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'cuenta_id', c.id, 'cuenta', c.name, 'banco', c.bank_name, 'numero', c.account_number,
           'moneda', c.currency, 'saldo', c.balance,
           'movimientos', c.movimientos, 'entradas', c.entradas, 'salidas', c.salidas,
           'conciliados', c.conciliados, 'sin_conciliar', c.movimientos - c.conciliados,
           'por_conciliar', c.por_conciliar,
           'ultima_conciliacion', (
             SELECT jsonb_build_object('hasta', br.period_end, 'estado', br.status, 'diferencia', br.difference)
               FROM public.bank_reconciliations br
              WHERE br.organization_id = p_organization_id AND br.bank_account_id = c.id
              ORDER BY br.period_end DESC LIMIT 1
           )
         ) ORDER BY c.name), '[]'::jsonb),
         jsonb_build_object(
           'cuentas', count(*),
           'movimientos', coalesce(sum(c.movimientos), 0),
           'conciliados', coalesce(sum(c.conciliados), 0),
           'sin_conciliar', coalesce(sum(c.movimientos - c.conciliados), 0),
           'por_conciliar', coalesce(sum(c.por_conciliar), 0),
           'entradas', coalesce(sum(c.entradas), 0),
           'salidas', coalesce(sum(c.salidas), 0)
         )
    INTO v_cuentas, v_totales
    FROM cuentas c;

  RETURN jsonb_build_object('cuentas', v_cuentas, 'totales', v_totales);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_bancos_conciliacion(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_bancos_conciliacion(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Caja y bancos: saldo al cierre de cada día (libro mayor, 1105 y 111x)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_caja_bancos_diario(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id bigint default null
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tz text;
  v_inicial_caja numeric;
  v_inicial_bancos numeric;
  v_dias jsonb;
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

  v_tz := coalesce(public.fn_timezone_for(p_organization_id::integer, p_branch_id::integer), 'America/Bogota');

  SELECT coalesce(sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) FILTER (WHERE jl.account_code LIKE '1105%'), 0),
         coalesce(sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate) - public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) FILTER (WHERE jl.account_code LIKE '111%' OR jl.account_code LIKE '112%'), 0)
    INTO v_inicial_caja, v_inicial_bancos
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
   WHERE je.organization_id = p_organization_id
     AND je.posted = true
     AND je.entry_date < p_from
     AND (p_branch_id is null or je.branch_id = p_branch_id)
     AND (jl.account_code LIKE '1105%' OR jl.account_code LIKE '111%' OR jl.account_code LIKE '112%');

  WITH movimientos AS (
    SELECT (je.entry_date AT TIME ZONE v_tz)::date AS dia,
           coalesce(sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)) FILTER (WHERE jl.account_code LIKE '1105%'), 0) AS caja_entradas,
           coalesce(sum(public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) FILTER (WHERE jl.account_code LIKE '1105%'), 0) AS caja_salidas,
           coalesce(sum(public.monto_base_asiento(jl.debit, jl.debit_base, jl.exchange_rate)) FILTER (WHERE jl.account_code LIKE '111%' OR jl.account_code LIKE '112%'), 0) AS bancos_entradas,
           coalesce(sum(public.monto_base_asiento(jl.credit, jl.credit_base, jl.exchange_rate)) FILTER (WHERE jl.account_code LIKE '111%' OR jl.account_code LIKE '112%'), 0) AS bancos_salidas
      FROM public.journal_lines jl
      JOIN public.journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.organization_id = p_organization_id
       AND je.posted = true
       AND je.entry_date >= p_from AND je.entry_date <= p_to
       AND (p_branch_id is null or je.branch_id = p_branch_id)
       AND (jl.account_code LIKE '1105%' OR jl.account_code LIKE '111%' OR jl.account_code LIKE '112%')
     GROUP BY 1
  ), dias AS (
    SELECT d::date AS dia
      FROM generate_series((p_from AT TIME ZONE v_tz)::date, (p_to AT TIME ZONE v_tz)::date, interval '1 day') AS d
  ), serie AS (
    SELECT d.dia,
           coalesce(m.caja_entradas, 0) AS caja_entradas,
           coalesce(m.caja_salidas, 0) AS caja_salidas,
           coalesce(m.bancos_entradas, 0) AS bancos_entradas,
           coalesce(m.bancos_salidas, 0) AS bancos_salidas,
           v_inicial_caja + sum(coalesce(m.caja_entradas, 0) - coalesce(m.caja_salidas, 0)) OVER (ORDER BY d.dia) AS saldo_caja,
           v_inicial_bancos + sum(coalesce(m.bancos_entradas, 0) - coalesce(m.bancos_salidas, 0)) OVER (ORDER BY d.dia) AS saldo_bancos
      FROM dias d
      LEFT JOIN movimientos m ON m.dia = d.dia
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'dia', s.dia,
           'caja_entradas', s.caja_entradas, 'caja_salidas', s.caja_salidas, 'saldo_caja', s.saldo_caja,
           'bancos_entradas', s.bancos_entradas, 'bancos_salidas', s.bancos_salidas, 'saldo_bancos', s.saldo_bancos,
           'saldo_total', s.saldo_caja + s.saldo_bancos
         ) ORDER BY s.dia), '[]'::jsonb)
    INTO v_dias
    FROM serie s;

  RETURN jsonb_build_object(
    'saldo_inicial_caja', v_inicial_caja,
    'saldo_inicial_bancos', v_inicial_bancos,
    'dias', v_dias
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_caja_bancos_diario(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_caja_bancos_diario(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rentabilidad por producto: ingreso neto, costo real y margen
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_rentabilidad_producto(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id bigint default null
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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

  -- El ingreso es neto de impuesto (sale_items.total lo incluye). El costo es
  -- el de las salidas de inventario de esa venta: stock_movements.source_id
  -- es sales.id en los orígenes sale, web_sale, mesa_sale e invoice_sale.
  WITH ventas AS (
    SELECT s.id
      FROM public.sales s
     WHERE s.organization_id = p_organization_id
       AND s.sale_date >= p_from AND s.sale_date <= p_to
       AND s.status NOT IN ('cancelled', 'void')
       AND (p_branch_id is null or s.branch_id = p_branch_id)
  ), lineas AS (
    SELECT si.sale_id, si.product_id,
           sum(si.quantity) AS cantidad,
           sum(si.total - coalesce(si.tax_amount, 0)) AS ingreso
      FROM ventas v
      JOIN public.sale_items si ON si.sale_id = v.id
     GROUP BY si.sale_id, si.product_id
  ), costos AS (
    SELECT sm.source_id, sm.product_id, sum(sm.qty * sm.unit_cost) AS costo
      FROM public.stock_movements sm
     WHERE sm.organization_id = p_organization_id
       AND sm.direction = 'out'
       AND sm.source IN ('sale', 'web_sale', 'mesa_sale', 'invoice_sale')
       AND sm.source_id IN (SELECT v.id::text FROM ventas v)
     GROUP BY sm.source_id, sm.product_id
  ), por_producto AS (
    SELECT l.product_id,
           sum(l.cantidad) AS cantidad,
           sum(l.ingreso) AS ingreso,
           sum(coalesce(c.costo, 0)) AS costo,
           count(*) FILTER (WHERE coalesce(c.costo, 0) = 0) AS lineas_sin_costo
      FROM lineas l
      LEFT JOIN costos c ON c.source_id = l.sale_id::text AND c.product_id = l.product_id
     GROUP BY l.product_id
  ), totales AS (
    SELECT count(*) AS productos,
           coalesce(sum(r.cantidad), 0) AS cantidad,
           coalesce(sum(r.ingreso), 0) AS ingreso,
           coalesce(sum(r.costo), 0) AS costo,
           coalesce(sum(r.lineas_sin_costo), 0) AS lineas_sin_costo
      FROM por_producto r
  )
  SELECT jsonb_build_object(
           'totales', jsonb_build_object(
             'productos', t.productos,
             'cantidad', t.cantidad,
             'ingreso', t.ingreso,
             'costo', t.costo,
             'margen', t.ingreso - t.costo,
             'margen_pct', CASE WHEN t.ingreso <> 0 THEN round((t.ingreso - t.costo) / t.ingreso * 100, 2) ELSE 0 END,
             'lineas_sin_costo', t.lineas_sin_costo
           ),
           'productos', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'producto_id', r.product_id,
                      'nombre', coalesce(p.name, 'Producto #' || r.product_id),
                      'sku', p.sku,
                      'categoria', cat.name,
                      'cantidad', r.cantidad,
                      'ingreso', r.ingreso,
                      'costo', r.costo,
                      'margen', r.ingreso - r.costo,
                      'margen_pct', CASE WHEN r.ingreso <> 0 THEN round((r.ingreso - r.costo) / r.ingreso * 100, 2) ELSE 0 END,
                      'sin_costo', r.lineas_sin_costo > 0
                    ) ORDER BY r.ingreso DESC), '[]'::jsonb)
               FROM (SELECT * FROM por_producto ORDER BY ingreso DESC LIMIT 2000) r
               LEFT JOIN public.products p ON p.id = r.product_id AND p.organization_id = p_organization_id
               LEFT JOIN public.categories cat ON cat.id = p.category_id
           ),
           'truncado', t.productos > 2000
         )
    INTO v_resultado
    FROM totales t;

  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_rentabilidad_producto(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_rentabilidad_producto(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Movimiento de inventario valorizado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_movimiento_valorizado(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id bigint default null
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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

  WITH por_producto AS (
    SELECT sm.product_id,
           coalesce(sum(CASE WHEN sm.direction = 'in' THEN sm.qty ELSE -sm.qty END) FILTER (WHERE sm.created_at < p_from), 0) AS cant_inicial,
           coalesce(sum(CASE WHEN sm.direction = 'in' THEN 1 ELSE -1 END * sm.qty * coalesce(sm.unit_cost, 0)) FILTER (WHERE sm.created_at < p_from), 0) AS valor_inicial,
           coalesce(sum(sm.qty) FILTER (WHERE sm.created_at >= p_from AND sm.direction = 'in'), 0) AS cant_entradas,
           coalesce(sum(sm.qty * coalesce(sm.unit_cost, 0)) FILTER (WHERE sm.created_at >= p_from AND sm.direction = 'in'), 0) AS valor_entradas,
           coalesce(sum(sm.qty) FILTER (WHERE sm.created_at >= p_from AND sm.direction = 'out'), 0) AS cant_salidas,
           coalesce(sum(sm.qty * coalesce(sm.unit_cost, 0)) FILTER (WHERE sm.created_at >= p_from AND sm.direction = 'out'), 0) AS valor_salidas,
           count(*) FILTER (WHERE sm.created_at >= p_from AND coalesce(sm.unit_cost, 0) = 0) AS sin_costo
      FROM public.stock_movements sm
     WHERE sm.organization_id = p_organization_id
       AND sm.created_at <= p_to
       AND (p_branch_id is null or sm.branch_id = p_branch_id)
     GROUP BY sm.product_id
  ), filas AS (
    SELECT v.*,
           v.cant_inicial + v.cant_entradas - v.cant_salidas AS cant_final,
           v.valor_inicial + v.valor_entradas - v.valor_salidas AS valor_final
      FROM por_producto v
     WHERE NOT (v.cant_inicial = 0 AND v.cant_entradas = 0 AND v.cant_salidas = 0 AND v.valor_inicial = 0)
  ), totales AS (
    SELECT count(*) AS productos,
           coalesce(sum(f.valor_inicial), 0) AS valor_inicial,
           coalesce(sum(f.valor_entradas), 0) AS valor_entradas,
           coalesce(sum(f.valor_salidas), 0) AS valor_salidas,
           coalesce(sum(f.valor_final), 0) AS valor_final,
           coalesce(sum(f.sin_costo), 0) AS movimientos_sin_costo
      FROM filas f
  )
  SELECT jsonb_build_object(
           'totales', to_jsonb(t),
           'productos', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'producto_id', f.product_id,
                      'nombre', coalesce(p.name, 'Producto #' || f.product_id),
                      'sku', p.sku,
                      'cant_inicial', f.cant_inicial, 'valor_inicial', f.valor_inicial,
                      'cant_entradas', f.cant_entradas, 'valor_entradas', f.valor_entradas,
                      'cant_salidas', f.cant_salidas, 'valor_salidas', f.valor_salidas,
                      'cant_final', f.cant_final, 'valor_final', f.valor_final,
                      'sin_costo', f.sin_costo > 0
                    ) ORDER BY abs(f.valor_final) DESC), '[]'::jsonb)
               FROM (SELECT * FROM filas ORDER BY abs(valor_final) DESC LIMIT 2000) f
               LEFT JOIN public.products p ON p.id = f.product_id AND p.organization_id = p_organization_id
           ),
           'truncado', t.productos > 2000
         )
    INTO v_resultado
    FROM totales t;

  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_movimiento_valorizado(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_movimiento_valorizado(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Compras por proveedor (facturas de compra confirmadas)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_compras_proveedor(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id bigint default null
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_proveedores jsonb;
  v_totales jsonb;
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

  WITH facturas AS (
    SELECT ip.supplier_id, ip.subtotal, ip.tax_total, ip.total, ip.balance, ip.due_date
      FROM public.invoice_purchase ip
     WHERE ip.organization_id = p_organization_id
       AND ip.status NOT IN ('draft', 'void', 'cancelled')
       AND ip.issue_date >= p_from AND ip.issue_date <= p_to
       AND (p_branch_id is null or ip.branch_id = p_branch_id)
  ), por_proveedor AS (
    SELECT f.supplier_id,
           count(*) AS facturas,
           coalesce(sum(f.subtotal), 0) AS subtotal,
           coalesce(sum(f.tax_total), 0) AS impuestos,
           coalesce(sum(f.total), 0) AS total,
           coalesce(sum(f.balance), 0) AS saldo,
           count(*) FILTER (WHERE coalesce(f.balance, 0) > 0 AND f.due_date < p_to) AS vencidas
      FROM facturas f
     GROUP BY f.supplier_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'proveedor_id', pp.supplier_id,
           'proveedor', coalesce(s.name, 'Proveedor #' || pp.supplier_id),
           'nit', s.nit,
           'facturas', pp.facturas, 'subtotal', pp.subtotal, 'impuestos', pp.impuestos,
           'total', pp.total, 'saldo', pp.saldo, 'vencidas', pp.vencidas
         ) ORDER BY pp.total DESC), '[]'::jsonb),
         jsonb_build_object(
           'proveedores', count(*),
           'facturas', coalesce(sum(pp.facturas), 0),
           'subtotal', coalesce(sum(pp.subtotal), 0),
           'impuestos', coalesce(sum(pp.impuestos), 0),
           'total', coalesce(sum(pp.total), 0),
           'saldo', coalesce(sum(pp.saldo), 0)
         )
    INTO v_proveedores, v_totales
    FROM por_proveedor pp
    LEFT JOIN public.suppliers s ON s.id = pp.supplier_id AND s.organization_id = p_organization_id;

  RETURN jsonb_build_object('proveedores', v_proveedores, 'totales', v_totales);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_compras_proveedor(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_compras_proveedor(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Órdenes de compra: emitidas, recibidas y pendientes de recibir
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_ordenes_compra(
  p_organization_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id bigint default null
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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

  WITH ordenes AS (
    SELECT po.id, po.supplier_id, po.status, po.expected_date, po.created_at,
           coalesce(po.total, 0) AS total,
           coalesce(sum(poi.quantity), 0) AS pedido,
           coalesce(sum(poi.received_quantity), 0) AS recibido
      FROM public.purchase_orders po
      LEFT JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
     WHERE po.organization_id = p_organization_id
       AND po.created_at >= p_from AND po.created_at <= p_to
       AND (p_branch_id is null or po.branch_id = p_branch_id)
     GROUP BY po.id
  ), totales AS (
    SELECT count(*) AS ordenes,
           coalesce(sum(o.total) FILTER (WHERE o.status <> 'cancelled'), 0) AS total,
           count(*) FILTER (WHERE o.status = 'draft') AS borrador,
           count(*) FILTER (WHERE o.status = 'sent') AS enviadas,
           count(*) FILTER (WHERE o.status = 'partial') AS parciales,
           count(*) FILTER (WHERE o.status = 'received') AS recibidas,
           count(*) FILTER (WHERE o.status = 'cancelled') AS canceladas,
           coalesce(sum(CASE WHEN o.status IN ('sent', 'partial') AND o.pedido > 0
                             THEN o.total * greatest(o.pedido - o.recibido, 0) / o.pedido ELSE 0 END), 0) AS valor_pendiente
      FROM ordenes o
  )
  SELECT jsonb_build_object(
           'totales', to_jsonb(t),
           'ordenes', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'orden_id', o.id,
                      'proveedor', coalesce(s.name, 'Proveedor #' || o.supplier_id),
                      'estado', o.status,
                      'creada', o.created_at,
                      'esperada', o.expected_date,
                      'total', o.total,
                      'pedido', o.pedido,
                      'recibido', o.recibido,
                      'recibido_pct', CASE WHEN o.pedido > 0 THEN round(o.recibido / o.pedido * 100, 1) ELSE 0 END
                    ) ORDER BY o.created_at DESC), '[]'::jsonb)
               FROM (SELECT * FROM ordenes ORDER BY created_at DESC LIMIT 2000) o
               LEFT JOIN public.suppliers s ON s.id = o.supplier_id AND s.organization_id = p_organization_id
           ),
           'truncado', t.ordenes > 2000
         )
    INTO v_resultado
    FROM totales t;

  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reporte_ordenes_compra(bigint, timestamptz, timestamptz, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reporte_ordenes_compra(bigint, timestamptz, timestamptz, bigint) TO authenticated, service_role;
