-- Configuración del modo de restricción de módulos por plan (GO-156)
--
-- Problema: hoy solo se cuenta max_modules sin verificar si el módulo está
-- en module_config.available_modules del plan. Hay 6 orgs Pro con finance
-- (solo Business+) y 22 con pms_hotel (solo Ultimate).
--
-- Solución: agregar modo configurable con 3 estados:
--   - off: sin control (comportamiento actual, para desarrollo)
--   - warn: muestra avisos pero no bloquea (default para producción)
--   - enforce: bloquea activación de módulos fuera del plan
--
-- La validación queda en moduleManagementService.ts; aquí solo la config.

-- Agregar columna de configuración en organization_preferences
ALTER TABLE organization_preferences
  ADD COLUMN IF NOT EXISTS module_enforcement_mode TEXT
    CHECK (module_enforcement_mode IN ('off', 'warn', 'enforce'))
    DEFAULT 'warn'
    NOT NULL;

COMMENT ON COLUMN organization_preferences.module_enforcement_mode IS
'Modo de restricción de módulos por plan. off=sin control, warn=aviso sin bloqueo (default), enforce=bloqueo estricto.';

-- Índice para queries de análisis
CREATE INDEX IF NOT EXISTS idx_org_prefs_enforcement_mode
  ON organization_preferences (module_enforcement_mode);
