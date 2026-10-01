-- Rollback: Plan Pro quita módulo finance
-- Revierte 20261001000000_plan_pro_facturacion_electronica.sql

-- ADVERTENCIA: Este rollback NO desactiva el módulo finance en organizaciones que
-- ya lo activaron. Solo remueve finance de la lista de módulos disponibles del plan Pro.
-- Las organizaciones Pro que ya tengan finance activo lo conservarán hasta que se
-- desactive manualmente o se corra un script de limpieza.

-- Conteo ANTES del rollback: organizaciones Pro con finance activo
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
  
  RAISE NOTICE 'Organizaciones Pro con finance activo ANTES del rollback: %', v_count_before;
  
  IF v_count_before > 0 THEN
    RAISE WARNING 'Hay % organizaciones Pro con finance activo. El rollback NO las desactivará.', v_count_before;
  END IF;
END $$;

-- Restaurar el plan Pro: remover 'finance' de available_modules
UPDATE public.plans
SET 
  module_config = jsonb_set(
    jsonb_set(
      jsonb_set(
        module_config,
        '{available_modules}',
        (
          SELECT jsonb_agg(elem)
          FROM jsonb_array_elements(module_config->'available_modules') elem
          WHERE elem::text != '"finance"'
        )
      ),
      '{total_max_modules}',
      to_jsonb((module_config->>'total_max_modules')::int - 1)
    ),
    '{max_additional_modules}',
    to_jsonb((module_config->>'max_additional_modules')::int - 1)
  ),
  max_modules = max_modules - 1,
  updated_at = now()
WHERE code = 'pro';

-- Verificación: mostrar el module_config restaurado
DO $$
DECLARE
  v_config jsonb;
  v_count_after integer;
BEGIN
  SELECT module_config INTO v_config
  FROM public.plans
  WHERE code = 'pro';
  
  RAISE NOTICE 'Plan Pro restaurado. module_config: %', v_config::text;
  
  -- Conteo DESPUÉS del rollback
  SELECT count(*) INTO v_count_after
  FROM organizations o
  JOIN subscriptions s ON s.organization_id = o.id AND s.status = 'active'
  JOIN plans p ON p.id = s.plan_id AND p.code = 'pro'
  WHERE EXISTS (
    SELECT 1 FROM organization_modules om
    WHERE om.organization_id = o.id
      AND om.module_code = 'finance'
      AND om.is_active = true
  );
  
  IF v_count_after > 0 THEN
    RAISE WARNING 'ACCIÓN REQUERIDA: % organizaciones Pro aún tienen finance activo. Para desactivarlas:', v_count_after;
    RAISE WARNING 'UPDATE organization_modules SET is_active = false, disabled_at = now() WHERE module_code = ''finance'' AND organization_id IN (SELECT o.id FROM organizations o JOIN subscriptions s ON s.organization_id = o.id JOIN plans p ON p.id = s.plan_id WHERE p.code = ''pro'');';
  END IF;
END $$;

-- Restaurar comentario original
COMMENT ON COLUMN public.plans.module_config IS 
  'Configuración de módulos por plan. core_modules: siempre activos (no cuentan para límite). available_modules: módulos que el plan puede activar. total_max_modules = core_count + max_additional_modules.';
