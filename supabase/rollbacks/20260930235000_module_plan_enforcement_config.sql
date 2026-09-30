-- Reversión: quitar configuración de enforcement de módulos por plan
DROP INDEX IF EXISTS idx_org_prefs_enforcement_mode;

ALTER TABLE organization_preferences
  DROP COLUMN IF EXISTS module_enforcement_mode;
