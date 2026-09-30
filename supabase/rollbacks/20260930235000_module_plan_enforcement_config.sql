-- Reversión: quitar configuración de enforcement de módulos por plan
DROP TABLE IF EXISTS module_enforcement_exceptions;
DROP TABLE IF EXISTS platform_settings;
