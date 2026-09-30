-- Configuración del modo de restricción de módulos por plan (GO-156)
--
-- Problema: hoy solo se cuenta max_modules sin verificar si el módulo está
-- en module_config.available_modules del plan. Hay 6 orgs Pro con finance
-- (solo Business+) y 22 con pms_hotel (solo Ultimate).
--
-- Solución: modo configurable con 3 estados controlado SOLO por la plataforma:
--   - off: sin control (desarrollo)
--   - warn: aviso sin bloqueo (default)
--   - enforce: bloquea activación de módulos fuera del plan
--
-- SEGURIDAD: el modo NO puede vivir en organization_preferences porque los
-- admins de la org pueden escribir ahí. Se crea:
-- 1. Configuración global en platform_settings (solo service_role escribe)
-- 2. Excepciones por org en module_enforcement_exceptions (solo service_role)

-- Tabla de configuración de plataforma (singleton)
CREATE TABLE IF NOT EXISTS platform_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  module_enforcement_mode TEXT NOT NULL
    CHECK (module_enforcement_mode IN ('off', 'warn', 'enforce'))
    DEFAULT 'warn',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE platform_settings IS
'Configuración global de la plataforma. Singleton (solo 1 fila). Solo service_role puede escribir.';

COMMENT ON COLUMN platform_settings.module_enforcement_mode IS
'Modo global de restricción de módulos por plan. off=sin control, warn=aviso sin bloqueo (default), enforce=bloqueo estricto.';

-- Insertar configuración inicial en modo 'warn'
INSERT INTO platform_settings (id, module_enforcement_mode)
VALUES (1, 'warn')
ON CONFLICT (id) DO NOTHING;

-- RLS: solo service_role puede escribir; authenticated puede leer
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_settings_select_for_authenticated"
  ON platform_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "platform_settings_all_for_service_role"
  ON platform_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Tabla de excepciones por organización
CREATE TABLE IF NOT EXISTS module_enforcement_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enforcement_mode TEXT NOT NULL
    CHECK (enforcement_mode IN ('off', 'warn', 'enforce')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  UNIQUE(organization_id)
);

COMMENT ON TABLE module_enforcement_exceptions IS
'Excepciones de enforcement por organización. Solo service_role puede escribir. Una org con excepción usa su modo específico en vez del global.';

COMMENT ON COLUMN module_enforcement_exceptions.reason IS
'Motivo de la excepción (ej: "cliente de pago anual", "decisión de Juan", "piloto").';

COMMENT ON COLUMN module_enforcement_exceptions.expires_at IS
'Fecha de expiración de la excepción (NULL = permanente).';

-- RLS: solo service_role puede escribir; authenticated puede leer solo su org
ALTER TABLE module_enforcement_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_enforcement_exceptions_select_for_org_members"
  ON module_enforcement_exceptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = module_enforcement_exceptions.organization_id
        AND om.is_active = true
    )
  );

CREATE POLICY "module_enforcement_exceptions_all_for_service_role"
  ON module_enforcement_exceptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_module_enforcement_exceptions_org
  ON module_enforcement_exceptions (organization_id);

CREATE INDEX IF NOT EXISTS idx_module_enforcement_exceptions_expires
  ON module_enforcement_exceptions (expires_at)
  WHERE expires_at IS NOT NULL;
