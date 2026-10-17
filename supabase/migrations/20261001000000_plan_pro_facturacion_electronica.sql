-- Plan Pro: incluir módulo finance (facturación electrónica DIAN)
-- GO-fe-pro: Decisión del dueño (1-oct-2026): la facturación electrónica DIAN
-- viene incluida en TODOS los planes, incluido Pro, y GoAdmin reemplaza el
-- facturador del cliente (Siigo, Alegra, etc.).

-- Antes: Plan Pro solo tenía disponibles pos e inventory (total_max_modules: 11, max_additional_modules: 2).
-- Después: Pro tendrá finance además de pos e inventory (total_max_modules: 12, max_additional_modules: 3).

-- Conteo ANTES del cambio: organizaciones Pro con finance activo
-- (debería ser 0 si el enforcement funciona correctamente, pero puede haber
-- excepciones o configuraciones legacy):
DO $$
DECLARE
  v_count_before integer;
BEGIN
  SELECT count(*) INTO v_count_before
  FROM organizations o
  JOIN subscriptions s ON s.organization_id = o.id AND s.status = 'active'
  JOIN plans p ON p.id = s.plan_id AND p.code = 'pro'
  WHERE EXISTS (
    SELECT 1 FROM organization_modules om
    WHERE om.organization_id = o.id
      AND om.module_code = 'finance'
      AND om.is_active = true
  );
  
  RAISE NOTICE 'Organizaciones Pro con finance activo ANTES: %', v_count_before;
END $$;

-- Actualizar el plan Pro: agregar 'finance' a available_modules
UPDATE public.plans
SET 
  module_config = jsonb_set(
    jsonb_set(
      jsonb_set(
        module_config,
        '{available_modules}',
        (module_config->'available_modules')::jsonb || '["finance"]'::jsonb
      ),
      '{total_max_modules}',
      to_jsonb((module_config->>'total_max_modules')::int + 1)
    ),
    '{max_additional_modules}',
    to_jsonb((module_config->>'max_additional_modules')::int + 1)
  ),
  max_modules = max_modules + 1,
  updated_at = now()
WHERE code = 'pro';

-- Verificación: mostrar el module_config actualizado
DO $$
DECLARE
  v_config jsonb;
BEGIN
  SELECT module_config INTO v_config
  FROM public.plans
  WHERE code = 'pro';
  
  RAISE NOTICE 'Plan Pro actualizado. module_config: %', v_config::text;
END $$;

-- Comentario en la tabla
COMMENT ON COLUMN public.plans.module_config IS 
  'Configuración de módulos por plan. core_modules: siempre activos (no cuentan para límite). available_modules: módulos que el plan puede activar. total_max_modules = core_count + max_additional_modules. Actualizado 2026-10-01: Plan Pro ahora incluye finance (facturación electrónica DIAN).';

-- NOTA IMPORTANTE para aplicación en producción:
--
-- Este cambio NO activa automáticamente el módulo finance en organizaciones Pro existentes.
-- Solo permite que puedan activarlo desde la UI de módulos (/app/organizacion/modulos).
--
-- Riesgos:
-- 1. Las organizaciones Pro verán el módulo finance disponible en el catálogo de módulos.
-- 2. Si activan finance, verán TODO el menú de finanzas, no solo facturación electrónica.
-- 3. El módulo finance incluye 24 páginas: facturas venta/compra, cotizaciones, notas crédito,
--    documentos soporte, facturación electrónica, ingresos, egresos, transferencias, bancos,
--    cuentas por cobrar/pagar, saldos a favor, contabilidad completa (plan de cuentas, asientos,
--    mayor, balance de comprobación, estado de resultados, balance general, períodos fiscales),
--    reglas contables, centros de costos, activos fijos, presupuestos, impuestos, métodos de pago,
--    monedas, comisiones.
-- 4. Para usar facturación electrónica, necesitan además:
--    - Configurar proveedor (Factus) en /app/finanzas/facturacion-electronica/configuracion
--    - Tener datos de empresa completos (NIT, razón social, dirección)
--    - Tener resolución DIAN cargada
--    - Tener impuestos configurados
--
-- Recomendación post-deploy:
-- - Comunicar a clientes Pro que ya tienen acceso a facturación electrónica incluida
-- - Preparar documentación de configuración del proveedor
-- - Verificar que el onboarding de finance esté completo
-- - Monitorear activaciones del módulo finance en organizaciones Pro
