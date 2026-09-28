-- ============================================================
-- Reportes · cerrar las RPC `fn_reporte_*` a `anon`/`PUBLIC`
-- y añadirles la guarda de pertenencia
-- ============================================================
-- PROBLEMA (fuga entre inquilinos, verificada contra producción el 2026-09-22):
-- de las 21 funciones `fn_reporte_*` del esquema `public`, solo dos
-- (`fn_reporte_crm_funnel` y `fn_reporte_crm_ranking_vendedores`, cerradas en
-- `20260915223000_crm_v4_f00_40_cerrar_rpc_crm_anon.sql`) comprueban la
-- pertenencia del llamante a `p_organization_id`. Las otras 19 son
-- SECURITY DEFINER, se creen el `p_organization_id` que reciben y nacieron con
-- el privilegio por defecto del esquema (`=X` a PUBLIC) más un GRANT explícito
-- a `anon`. Resultado: un POST a `/rest/v1/rpc/fn_reporte_*` con la sola clave
-- publicable del navegador —sin sesión— y un `p_organization_id` arbitrario
-- devuelve 200 con los datos de esa organización: ventas, cierres de caja,
-- cartera por cobrar y por pagar, impuestos, inventario, contabilidad,
-- auditoría de roles y actividad de operaciones de las 83 organizaciones.
--
-- MÉTODO (el mismo de `crm_v4_f00_40`, memoria «Exposición de RPC a anon»):
-- las dos mitades juntas, porque cada una sola es insuficiente —
--   (a) guarda de pertenencia como afirmación positiva incondicional al inicio
--       del cuerpo: con `anon` o con `service_role` `auth.uid()` es NULL y el
--       EXISTS falla cerrado, y la comparación es contra el `p_organization_id`
--       recibido, no contra ninguna otra organización;
--   (b) `REVOKE EXECUTE ... FROM PUBLIC, anon`, conservando `authenticated` y
--       `service_role`.
-- Un bloque por función, cada uno con `set local lock_timeout = '3s'`, para no
-- encadenar bloqueos en una transacción única.
--
-- EVIDENCIA (MCP, solo lectura, 2026-09-22):
--   · pg_proc: las 21 firmas existen, `prosecdef` = true, owner = postgres,
--     `proconfig` = {search_path=public} en todas.
--   · ACL de las 19: {=X/postgres, postgres=X, anon=X, authenticated=X,
--     service_role=X}. Es decir: PUBLIC y anon pueden ejecutarlas.
--   · Cuerpos: `pg_get_functiondef` no menciona `organization_members` en
--     ninguna de las 19, y cada una tiene exactamente un `BEGIN` a principio de
--     línea (la guarda entra justo después, antes de cualquier consulta).
--   · Llamadores (rg sobre `src/`, `supabase/functions/`, el repositorio de
--     sitios web): solo `src/lib/services/reportes/modulos/*.ts` y
--     `src/lib/services/crm/commercialMetricsService.ts`, todos con
--     `client ?? browserSupabase` — navegador con sesión (`authenticated`) o
--     cliente de sesión de `getServerOrgContext()` en el asistente de reportes
--     (`src/app/api/ai-assistant/reportes/route.ts`, que ya documenta que estas
--     RPC rechazan al service role). Ningún llamador con `anon` ni con
--     `service_role`. Ninguna Edge Function las invoca.
--   · `cron.job`: 0 jobs cuyo `command` mencione `fn_reporte`. No hace falta
--     excepción para `service_role`; si algún día un job las necesitara, se
--     resuelve como en `crm_v4_f00_40` (corriendo como `postgres`, el owner,
--     que no pasa por la ACL) y no relajando la guarda.
--
-- ALCANCE Y FIRMAS: se respeta la firma **actual** de cada función. Nueve de
-- ellas recibieron `p_branch_id bigint DEFAULT NULL` en
-- `20260922210000_reportes_filtro_por_sucursal.sql` (cierre_caja, cxc_aging,
-- cxp_aging, flujo_efectivo, impuestos, movimientos_inventario,
-- rotacion_inventario, ventas_por_hora, ventas_resumen): se reemplazan con esa
-- misma firma, nunca creando una sobrecarga nueva. La lógica de cada cuerpo es
-- byte a byte la de producción; lo único que se añade es la guarda.
--
-- Idempotente: REVOKE/GRANT/CREATE OR REPLACE se pueden reaplicar.
-- Sin datos: el rollback restaura privilegios y definiciones íntegramente.
-- Reversión: supabase/rollbacks/20260922233000_reportes_cerrar_anon_y_guarda_pertenencia_down.sql
-- ============================================================


-- ------------------------------------------------------------
-- 1 · fn_reporte_balance_general(bigint, date)
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

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

revoke execute on function public.fn_reporte_balance_general(bigint, date) from public, anon;
grant  execute on function public.fn_reporte_balance_general(bigint, date) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 2 · fn_reporte_chat_sla(bigint, timestamptz, timestamptz)
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_chat_sla(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_conversaciones integer;
  v_promedio_primera_respuesta numeric;
  v_promedio_resolucion numeric;
  v_por_estado jsonb;
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

  SELECT COUNT(*) INTO v_total_conversaciones
  FROM conversations c
  WHERE c.organization_id = p_organization_id
    AND c.created_at >= p_from AND c.created_at <= p_to;

  SELECT COALESCE(AVG(c.first_response_time_seconds), 0) INTO v_promedio_primera_respuesta
  FROM conversations c
  WHERE c.organization_id = p_organization_id
    AND c.created_at >= p_from AND c.created_at <= p_to
    AND c.first_response_time_seconds IS NOT NULL;

  SELECT COALESCE(AVG(c.avg_response_time_seconds), 0) INTO v_promedio_resolucion
  FROM conversations c
  WHERE c.organization_id = p_organization_id
    AND c.created_at >= p_from AND c.created_at <= p_to
    AND c.avg_response_time_seconds IS NOT NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'estado', e.status,
    'cantidad', e.cantidad
  )), '[]'::jsonb) INTO v_por_estado
  FROM (
    SELECT c.status, COUNT(*) AS cantidad
    FROM conversations c
    WHERE c.organization_id = p_organization_id
      AND c.created_at >= p_from AND c.created_at <= p_to
    GROUP BY c.status
    ORDER BY cantidad DESC
  ) e;

  RETURN jsonb_build_object(
    'total_conversaciones', v_total_conversaciones,
    'promedio_primera_respuesta_seg', v_promedio_primera_respuesta,
    'promedio_resolucion_seg', v_promedio_resolucion,
    'por_estado', v_por_estado
  );
END;
$function$;

revoke execute on function public.fn_reporte_chat_sla(bigint, timestamp with time zone, timestamp with time zone) from public, anon;
grant  execute on function public.fn_reporte_chat_sla(bigint, timestamp with time zone, timestamp with time zone) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 3 · fn_reporte_cierre_caja(bigint, timestamptz, timestamptz, bigint)
--     Firma con p_branch_id (migración 20260922210000).
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_cierre_caja(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone, p_branch_id bigint DEFAULT NULL::bigint)
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
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

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

revoke execute on function public.fn_reporte_cierre_caja(bigint, timestamp with time zone, timestamp with time zone, bigint) from public, anon;
grant  execute on function public.fn_reporte_cierre_caja(bigint, timestamp with time zone, timestamp with time zone, bigint) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 4 · fn_reporte_clientes_crecimiento(bigint, timestamptz, timestamptz)
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_clientes_crecimiento(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_por_mes jsonb;
  v_total_acumulado integer;
  v_nuevos integer;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'mes', m.mes,
    'nuevos', m.nuevos,
    'acumulado', m.acumulado
  )), '[]'::jsonb) INTO v_por_mes
  FROM (
    SELECT DATE_TRUNC('month', c.created_at) AS mes,
           COUNT(*) AS nuevos,
           SUM(COUNT(*)) OVER (ORDER BY DATE_TRUNC('month', c.created_at)) AS acumulado
    FROM customers c
    WHERE c.organization_id = p_organization_id
      AND c.created_at >= p_from AND c.created_at <= p_to
    GROUP BY DATE_TRUNC('month', c.created_at)
    ORDER BY mes
  ) m;

  SELECT COUNT(*) INTO v_total_acumulado
  FROM customers c
  WHERE c.organization_id = p_organization_id
    AND c.created_at <= p_to;

  SELECT COUNT(*) INTO v_nuevos
  FROM customers c
  WHERE c.organization_id = p_organization_id
    AND c.created_at >= p_from AND c.created_at <= p_to;

  RETURN jsonb_build_object(
    'por_mes', v_por_mes,
    'total_acumulado', v_total_acumulado,
    'nuevos_en_periodo', v_nuevos
  );
END;
$function$;

revoke execute on function public.fn_reporte_clientes_crecimiento(bigint, timestamp with time zone, timestamp with time zone) from public, anon;
grant  execute on function public.fn_reporte_clientes_crecimiento(bigint, timestamp with time zone, timestamp with time zone) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 5 · fn_reporte_cxc_aging(bigint, date, bigint)
--     Firma con p_branch_id (migración 20260922210000).
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_cxc_aging(p_organization_id bigint, p_as_of date, p_branch_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_buckets jsonb;
  v_total numeric;
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

revoke execute on function public.fn_reporte_cxc_aging(bigint, date, bigint) from public, anon;
grant  execute on function public.fn_reporte_cxc_aging(bigint, date, bigint) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 6 · fn_reporte_cxp_aging(bigint, date, bigint)
--     Firma con p_branch_id (migración 20260922210000).
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_cxp_aging(p_organization_id bigint, p_as_of date, p_branch_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_buckets jsonb;
  v_total numeric;
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

revoke execute on function public.fn_reporte_cxp_aging(bigint, date, bigint) from public, anon;
grant  execute on function public.fn_reporte_cxp_aging(bigint, date, bigint) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 7 · fn_reporte_estado_resultados(bigint, timestamptz, timestamptz)
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

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

revoke execute on function public.fn_reporte_estado_resultados(bigint, timestamp with time zone, timestamp with time zone) from public, anon;
grant  execute on function public.fn_reporte_estado_resultados(bigint, timestamp with time zone, timestamp with time zone) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 8 · fn_reporte_flujo_efectivo(bigint, timestamptz, timestamptz, bigint)
--     Firma con p_branch_id (migración 20260922210000).
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_flujo_efectivo(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone, p_branch_id bigint DEFAULT NULL::bigint)
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
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

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

revoke execute on function public.fn_reporte_flujo_efectivo(bigint, timestamp with time zone, timestamp with time zone, bigint) from public, anon;
grant  execute on function public.fn_reporte_flujo_efectivo(bigint, timestamp with time zone, timestamp with time zone, bigint) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 9 · fn_reporte_impuestos(bigint, timestamptz, timestamptz, bigint)
--     Firma con p_branch_id (migración 20260922210000).
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_impuestos(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone, p_branch_id bigint DEFAULT NULL::bigint)
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
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

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

revoke execute on function public.fn_reporte_impuestos(bigint, timestamp with time zone, timestamp with time zone, bigint) from public, anon;
grant  execute on function public.fn_reporte_impuestos(bigint, timestamp with time zone, timestamp with time zone, bigint) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 10 · fn_reporte_integraciones_estado(bigint)
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_integraciones_estado(p_organization_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conexiones jsonb;
  v_activas integer;
  v_error integer;
  v_pausadas integer;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'nombre', c.name,
    'estado', c.status,
    'errores_24h', c.error_count_24h,
    'ultimo_error', c.last_error_message,
    'ultima_actividad', c.last_activity_at
  )), '[]'::jsonb) INTO v_conexiones
  FROM (
    SELECT id, name, status, error_count_24h, last_error_message, last_activity_at
    FROM integration_connections
    WHERE organization_id = p_organization_id
    ORDER BY status, name
  ) c;

  SELECT COUNT(*) FILTER (WHERE status = 'active') INTO v_activas
  FROM integration_connections WHERE organization_id = p_organization_id;

  SELECT COUNT(*) FILTER (WHERE status = 'error' OR error_count_24h > 0) INTO v_error
  FROM integration_connections WHERE organization_id = p_organization_id;

  SELECT COUNT(*) FILTER (WHERE status = 'paused') INTO v_pausadas
  FROM integration_connections WHERE organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'conexiones', v_conexiones,
    'activas', v_activas,
    'con_error', v_error,
    'pausadas', v_pausadas
  );
END;
$function$;

revoke execute on function public.fn_reporte_integraciones_estado(bigint) from public, anon;
grant  execute on function public.fn_reporte_integraciones_estado(bigint) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 11 · fn_reporte_movimientos_inventario(bigint, timestamptz, timestamptz, bigint)
--      Firma con p_branch_id (migración 20260922210000).
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_movimientos_inventario(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone, p_branch_id bigint DEFAULT NULL::bigint)
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
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

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

revoke execute on function public.fn_reporte_movimientos_inventario(bigint, timestamp with time zone, timestamp with time zone, bigint) from public, anon;
grant  execute on function public.fn_reporte_movimientos_inventario(bigint, timestamp with time zone, timestamp with time zone, bigint) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 12 · fn_reporte_notificaciones_enviadas(bigint, timestamptz, timestamptz)
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_notificaciones_enviadas(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_por_canal jsonb;
  v_total integer;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'canal', c.channel,
    'enviadas', c.enviadas,
    'leidas', c.leidas
  )), '[]'::jsonb) INTO v_por_canal
  FROM (
    SELECT n.channel,
           COUNT(*) AS enviadas,
           COUNT(*) FILTER (WHERE n.read_at IS NOT NULL) AS leidas
    FROM notifications n
    WHERE n.organization_id = p_organization_id
      AND n.created_at >= p_from AND n.created_at <= p_to
    GROUP BY n.channel
    ORDER BY enviadas DESC
  ) c;

  SELECT COUNT(*) INTO v_total
  FROM notifications n
  WHERE n.organization_id = p_organization_id
    AND n.created_at >= p_from AND n.created_at <= p_to;

  RETURN jsonb_build_object('por_canal', v_por_canal, 'total', v_total);
END;
$function$;

revoke execute on function public.fn_reporte_notificaciones_enviadas(bigint, timestamp with time zone, timestamp with time zone) from public, anon;
grant  execute on function public.fn_reporte_notificaciones_enviadas(bigint, timestamp with time zone, timestamp with time zone) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 13 · fn_reporte_operaciones_actividad(bigint, timestamptz, timestamptz)
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_operaciones_actividad(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_por_modulo jsonb;
  v_por_usuario jsonb;
  v_total integer;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'modulo', m.module,
    'cantidad', m.cantidad
  )), '[]'::jsonb) INTO v_por_modulo
  FROM (
    SELECT a.entity_type AS module, COUNT(*) AS cantidad
    FROM ops_audit_log a
    WHERE a.organization_id = p_organization_id
      AND a.created_at >= p_from AND a.created_at <= p_to
    GROUP BY a.entity_type
    ORDER BY cantidad DESC
  ) m;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'usuario_id', u.user_id,
    'cantidad', u.cantidad
  )), '[]'::jsonb) INTO v_por_usuario
  FROM (
    SELECT a.user_id, COUNT(*) AS cantidad
    FROM ops_audit_log a
    WHERE a.organization_id = p_organization_id
      AND a.created_at >= p_from AND a.created_at <= p_to
      AND a.user_id IS NOT NULL
    GROUP BY a.user_id
    ORDER BY cantidad DESC
    LIMIT 20
  ) u;

  SELECT COUNT(*) INTO v_total
  FROM ops_audit_log a
  WHERE a.organization_id = p_organization_id
    AND a.created_at >= p_from AND a.created_at <= p_to;

  RETURN jsonb_build_object(
    'por_modulo', v_por_modulo,
    'por_usuario', v_por_usuario,
    'total_eventos', v_total
  );
END;
$function$;

revoke execute on function public.fn_reporte_operaciones_actividad(bigint, timestamp with time zone, timestamp with time zone) from public, anon;
grant  execute on function public.fn_reporte_operaciones_actividad(bigint, timestamp with time zone, timestamp with time zone) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 14 · fn_reporte_presupuesto_vs_real(bigint, timestamptz, timestamptz)
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

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

revoke execute on function public.fn_reporte_presupuesto_vs_real(bigint, timestamp with time zone, timestamp with time zone) from public, anon;
grant  execute on function public.fn_reporte_presupuesto_vs_real(bigint, timestamp with time zone, timestamp with time zone) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 15 · fn_reporte_roles_auditoria(bigint, timestamptz, timestamptz)
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_roles_auditoria(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_por_accion jsonb;
  v_total integer;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'accion', a.action,
    'cantidad', a.cantidad
  )), '[]'::jsonb) INTO v_por_accion
  FROM (
    SELECT r.action, COUNT(*) AS cantidad
    FROM roles_audit_log r
    WHERE r.organization_id = p_organization_id
      AND r.logged_at >= p_from AND r.logged_at <= p_to
    GROUP BY r.action
    ORDER BY cantidad DESC
  ) a;

  SELECT COUNT(*) INTO v_total
  FROM roles_audit_log r
  WHERE r.organization_id = p_organization_id
    AND r.logged_at >= p_from AND r.logged_at <= p_to;

  RETURN jsonb_build_object('por_accion', v_por_accion, 'total', v_total);
END;
$function$;

revoke execute on function public.fn_reporte_roles_auditoria(bigint, timestamp with time zone, timestamp with time zone) from public, anon;
grant  execute on function public.fn_reporte_roles_auditoria(bigint, timestamp with time zone, timestamp with time zone) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 16 · fn_reporte_rotacion_inventario(bigint, timestamptz, timestamptz, bigint)
--      Firma con p_branch_id (migración 20260922210000).
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_rotacion_inventario(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone, p_branch_id bigint DEFAULT NULL::bigint)
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
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

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

revoke execute on function public.fn_reporte_rotacion_inventario(bigint, timestamp with time zone, timestamp with time zone, bigint) from public, anon;
grant  execute on function public.fn_reporte_rotacion_inventario(bigint, timestamp with time zone, timestamp with time zone, bigint) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 17 · fn_reporte_stock_critico(bigint)
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_stock_critico(p_organization_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_items jsonb;
  v_total_criticos integer;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'producto_id', i.product_id,
    'sku', i.sku,
    'nombre', i.name,
    'sucursal_id', i.branch_id,
    'stock_actual', i.qty_on_hand,
    'stock_minimo', i.min_level,
    'faltante', i.min_level - i.qty_on_hand
  )), '[]'::jsonb) INTO v_items
  FROM (
    SELECT sl.product_id, p.sku, p.name, sl.branch_id,
           sl.qty_on_hand, sl.min_level
    FROM stock_levels sl
    JOIN products p ON sl.product_id = p.id
    WHERE p.organization_id = p_organization_id
      AND sl.qty_on_hand <= sl.min_level
      AND p.status = 'active'
    ORDER BY (sl.min_level - sl.qty_on_hand) DESC
  ) i;

  SELECT COUNT(*) INTO v_total_criticos FROM jsonb_array_elements(v_items);

  RETURN jsonb_build_object('items', v_items, 'total_criticos', v_total_criticos);
END;
$function$;

revoke execute on function public.fn_reporte_stock_critico(bigint) from public, anon;
grant  execute on function public.fn_reporte_stock_critico(bigint) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 18 · fn_reporte_ventas_por_hora(bigint, timestamptz, timestamptz, bigint)
--      Firma con p_branch_id (migración 20260922210000).
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

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

revoke execute on function public.fn_reporte_ventas_por_hora(bigint, timestamp with time zone, timestamp with time zone, bigint) from public, anon;
grant  execute on function public.fn_reporte_ventas_por_hora(bigint, timestamp with time zone, timestamp with time zone, bigint) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- 19 · fn_reporte_ventas_resumen(bigint, timestamptz, timestamptz, bigint)
--      Firma con p_branch_id (migración 20260922210000).
-- ------------------------------------------------------------
begin;
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.fn_reporte_ventas_resumen(p_organization_id bigint, p_from timestamp with time zone, p_to timestamp with time zone, p_branch_id bigint DEFAULT NULL::bigint)
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
  -- Guarda de pertenencia (ver fn_reporte_balance_general).
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (select auth.uid())
      AND om.organization_id = p_organization_id
      AND om.is_active = true
  ) THEN
    RAISE EXCEPTION 'ORG_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

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

revoke execute on function public.fn_reporte_ventas_resumen(bigint, timestamp with time zone, timestamp with time zone, bigint) from public, anon;
grant  execute on function public.fn_reporte_ventas_resumen(bigint, timestamp with time zone, timestamp with time zone, bigint) to authenticated, service_role;

commit;


-- ------------------------------------------------------------
-- VERIFICACIÓN (solo lectura; correr tras aplicar). Esperado: 0 filas.
-- ------------------------------------------------------------
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
--        has_function_privilege('service_role', p.oid, 'EXECUTE') as svc_x,
--        pg_get_functiondef(p.oid) like '%ORG_FORBIDDEN%' as con_guarda
-- from pg_proc p
-- where p.pronamespace = 'public'::regnamespace and p.proname like 'fn_reporte_%'
--   and (has_function_privilege('anon', p.oid, 'EXECUTE')
--        or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
--        or not has_function_privilege('service_role', p.oid, 'EXECUTE')
--        or pg_get_functiondef(p.oid) not like '%ORG_FORBIDDEN%'
--        or not p.prosecdef
--        or p.proconfig is distinct from array['search_path=public']);
