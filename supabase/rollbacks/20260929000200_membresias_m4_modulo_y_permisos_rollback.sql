-- Rollback de 20260929000200_membresias_m4_modulo_y_permisos.sql
--
-- Las filas «gym» de organization_modules nunca se tocaron: basta con borrar las de «memberships»,
-- reactivar «gym» en el catálogo y devolver los planes de suscripción a «gym».
-- ADVERTENCIA: se pierden las activaciones de «memberships» hechas DESPUÉS de la migración en
-- organizaciones sin «gym» (no tienen equivalente en el código viejo) y las asignaciones manuales de
-- los permisos memberships.* a cargos.

drop trigger if exists trg_org_modules_alias_gym on public.organization_modules;
drop function if exists public.fn_org_modules_alias_gym();

-- Permisos (role_permissions / job_position_permissions caen en cascada por la FK).
delete from public.role_permissions
 where permission_id in (select id from public.permissions where module = 'memberships');
delete from public.job_position_permissions
 where permission_id in (select id from public.permissions where module = 'memberships');
delete from public.permissions where module = 'memberships';

drop function if exists public.fn_membresias_int_exigir(integer, text[]);

update public.plans
   set module_config = replace(module_config::text, '"memberships"', '"gym"')::jsonb
 where module_config::text like '%"memberships"%';

delete from public.job_position_page_access where module_code = 'memberships';
delete from public.job_position_module_access where module_code = 'memberships';
delete from public.organization_module_pages where module_code = 'memberships';
delete from public.organization_modules where module_code = 'memberships';

update public.modules set is_active = true, updated_at = now() where code = 'gym';
delete from public.modules where code = 'memberships';

-- validate_module_activation tal como estaba antes (definición viva del 2026-09-28).
CREATE OR REPLACE FUNCTION public.validate_module_activation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  org_plan_limit INTEGER;
  current_paid_modules INTEGER;
  is_module_core BOOLEAN;
  core_modules_count INTEGER;
BEGIN
  -- Solo validar en INSERT o UPDATE que active un módulo
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.is_active = true AND (OLD.is_active IS NULL OR OLD.is_active = false)) THEN

    -- Verificar si el módulo es core
    SELECT is_core INTO is_module_core
    FROM modules
    WHERE code = NEW.module_code;

    -- Si es core, permitir siempre
    IF is_module_core THEN
      -- Asegurar que enabled_at esté establecido
      IF NEW.enabled_at IS NULL THEN
        NEW.enabled_at := NOW();
      END IF;
      RETURN NEW;
    END IF;

    -- Obtener límite del plan (filtrar por suscripción activa o en trial)
    SELECT p.max_modules INTO org_plan_limit
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.organization_id = NEW.organization_id
      AND s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- Si no hay límite definido (NULL = ilimitado), permitir
    IF org_plan_limit IS NULL THEN
      IF NEW.enabled_at IS NULL THEN
        NEW.enabled_at := NOW();
      END IF;
      RETURN NEW;
    END IF;

    -- Contar módulos core DINÁMICAMENTE en vez de hardcodear
    SELECT COUNT(*) INTO core_modules_count
    FROM modules
    WHERE is_core = true AND is_active = true;

    -- Calcular módulos pagados permitidos (total - core)
    org_plan_limit := org_plan_limit - core_modules_count;

    -- Asegurar que no sea negativo
    IF org_plan_limit < 0 THEN
      org_plan_limit := 0;
    END IF;

    -- Contar módulos pagados activos actuales
    SELECT COUNT(*) INTO current_paid_modules
    FROM organization_modules om
    JOIN modules m ON om.module_code = m.code
    WHERE om.organization_id = NEW.organization_id
    AND om.is_active = true
    AND m.is_core = false
    AND (TG_OP = 'INSERT' OR om.module_code != NEW.module_code); -- Excluir el módulo actual en UPDATE

    -- Validar límite
    IF current_paid_modules >= org_plan_limit THEN
      RAISE EXCEPTION 'Cannot activate module %. Organization has reached the limit of % paid modules allowed by their plan.',
        NEW.module_code, org_plan_limit;
    END IF;

    -- Asegurar que enabled_at esté establecido
    IF NEW.enabled_at IS NULL THEN
      NEW.enabled_at := NOW();
    END IF;
  END IF;

  -- Si se está desactivando, establecer disabled_at
  IF TG_OP = 'UPDATE' AND NEW.is_active = false AND OLD.is_active = true THEN
    NEW.disabled_at := NOW();
  END IF;

  RETURN NEW;
END;
$function$;
