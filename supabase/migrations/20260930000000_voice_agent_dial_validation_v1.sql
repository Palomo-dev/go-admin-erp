-- ============================================================================
-- Validación previa a marcación (canDial) — Ley 2300 de 2023
-- ============================================================================
-- Fecha: 2026-09-30
-- Autor: Cloud Agent
-- Ticket: GO-validacion-candial
--
-- Implementa las estructuras necesarias para las validaciones V0-V10:
-- - Tabla de festivos de Colombia (2026-2027)
-- - Configuración legal en comm_settings.metadata
-- - RNE checks en customers.metadata
-- - Mejoras en voice_agent_call_attempts para frecuencia
-- - Vista de gasto del piloto (v_voice_pilot_spend)
--
-- IMPORTANTE: Esta migración NO se aplica automáticamente.
-- Juan debe aplicarla manualmente después de revisarla.
-- ============================================================================

-- ─── 1. Tabla de festivos de Colombia ───────────────────────────────────────
-- 
-- Festivos según Ley 51 de 1983 y Ley 2578 de 2026
-- Fuente: reglas_horario_llamadas_v1.md sección 4

CREATE TABLE IF NOT EXISTS public.holidays_co (
  holiday_date DATE PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  type TEXT CHECK (type IN ('fixed', 'movable', 'easter_based')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.holidays_co IS 
  'Festivos de Colombia (Ley 51 de 1983 y Ley 2578 de 2026). ' ||
  'Se actualiza anualmente en noviembre agregando el año siguiente.';

-- Permisos
ALTER TABLE public.holidays_co ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holidays_co_select_all" ON public.holidays_co
  FOR SELECT USING (true);

GRANT SELECT ON public.holidays_co TO authenticated, anon;

-- Índice por año para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_holidays_co_year 
  ON public.holidays_co (year);

-- ─── 2. Datos iniciales: festivos 2026-2027 ─────────────────────────────────

INSERT INTO public.holidays_co (holiday_date, name, year, type) VALUES
  -- 2026
  ('2026-10-12', 'Día de la Raza', 2026, 'movable'),
  ('2026-11-02', 'Todos los Santos', 2026, 'movable'),
  ('2026-11-16', 'Independencia de Cartagena', 2026, 'movable'),
  ('2026-12-08', 'Inmaculada Concepción', 2026, 'fixed'),
  ('2026-12-25', 'Navidad', 2026, 'fixed'),
  -- 2027
  ('2027-01-01', 'Año Nuevo', 2027, 'fixed'),
  ('2027-01-11', 'Reyes Magos', 2027, 'movable'),
  ('2027-03-22', 'San José', 2027, 'movable'),
  ('2027-03-25', 'Jueves Santo', 2027, 'easter_based'),
  ('2027-03-26', 'Viernes Santo', 2027, 'easter_based'),
  ('2027-05-01', 'Día del Trabajo', 2027, 'fixed'),
  ('2027-05-10', 'Ascensión del Señor', 2027, 'easter_based'),
  ('2027-05-31', 'Corpus Christi', 2027, 'easter_based'),
  ('2027-06-07', 'Sagrado Corazón', 2027, 'easter_based'),
  ('2027-07-05', 'San Pedro y San Pablo', 2027, 'movable'),
  ('2027-07-12', 'Virgen del Rosario de Chiquinquirá', 2027, 'movable'),
  ('2027-07-20', 'Día de la Independencia', 2027, 'fixed'),
  ('2027-08-07', 'Batalla de Boyacá', 2027, 'fixed'),
  ('2027-08-16', 'Asunción de la Virgen', 2027, 'movable'),
  ('2027-10-18', 'Día de la Raza', 2027, 'movable'),
  ('2027-11-01', 'Todos los Santos', 2027, 'fixed'),
  ('2027-11-15', 'Independencia de Cartagena', 2027, 'movable'),
  ('2027-12-08', 'Inmaculada Concepción', 2027, 'fixed'),
  ('2027-12-25', 'Navidad', 2027, 'fixed')
ON CONFLICT (holiday_date) DO NOTHING;

-- ─── 3. Configuración legal en comm_settings ─────────────────────────────────
--
-- Se agrega estructura esperada en metadata para la barrera legal (V0):
-- {
--   "privacy_policy_published_at": "2026-10-15T00:00:00Z",
--   "crc_rne_registered_at": "2026-10-16T00:00:00Z",
--   "crc_8308_number_registered_at": "2026-10-17T00:00:00Z",
--   "internal_test_numbers": ["+57...", "+1850..."]
-- }

COMMENT ON COLUMN public.comm_settings.metadata IS
  'Configuración extendida de comunicaciones. ' ||
  'Incluye: privacy_policy_published_at, crc_rne_registered_at, ' ||
  'crc_8308_number_registered_at, internal_test_numbers (V0)';

-- ─── 4. RNE checks en customers ──────────────────────────────────────────────
--
-- Se espera en metadata:
-- {
--   "rne_status": "no_excluido" | "excluido",
--   "rne_checked_at": "2026-10-18T00:00:00Z"
-- }

COMMENT ON COLUMN public.customers.metadata IS
  'Datos extendidos del cliente. ' ||
  'Incluye: rne_status (no_excluido|excluido), rne_checked_at (V4)';

-- ─── 5. Tabla auxiliar para números internos de prueba ──────────────────────
--
-- Lista centralizada de números permitidos cuando faltan requisitos legales (V0)

CREATE TABLE IF NOT EXISTS public.internal_test_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  description TEXT,
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

COMMENT ON TABLE public.internal_test_numbers IS
  'Números de teléfono del equipo autorizados para pruebas internas ' ||
  'cuando faltan requisitos legales (V0).';

-- Permisos
ALTER TABLE public.internal_test_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal_test_numbers_select_all" ON public.internal_test_numbers
  FOR SELECT USING (true);

GRANT SELECT ON public.internal_test_numbers TO authenticated;

-- ─── 6. Mejoras en voice_agent_call_attempts ────────────────────────────────
--
-- Se agregan columnas para registro de intentos y rechazos (V6, auditoría)

DO $$ BEGIN
  -- Columna 'answered' para distinguir intentos sin respuesta (V6)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_agent_call_attempts' 
    AND column_name = 'answered'
  ) THEN
    ALTER TABLE public.voice_agent_call_attempts
      ADD COLUMN answered BOOLEAN DEFAULT FALSE;
    
    COMMENT ON COLUMN public.voice_agent_call_attempts.answered IS
      'Indica si la llamada fue contestada por un humano (V6 frecuencia)';
  END IF;

  -- Columna 'rejection_code' para código de validación que rechazó (auditoría)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_agent_call_attempts' 
    AND column_name = 'rejection_code'
  ) THEN
    ALTER TABLE public.voice_agent_call_attempts
      ADD COLUMN rejection_code TEXT;
    
    COMMENT ON COLUMN public.voice_agent_call_attempts.rejection_code IS
      'Código de la validación que rechazó el intento (OUTSIDE_LEGAL_HOURS, DNC_INTERNAL, etc.)';
  END IF;

  -- Columna 'rejection_reason' para razón legible del rechazo (auditoría)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_agent_call_attempts' 
    AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE public.voice_agent_call_attempts
      ADD COLUMN rejection_reason TEXT;
    
    COMMENT ON COLUMN public.voice_agent_call_attempts.rejection_reason IS
      'Razón legible del por qué se rechazó el intento (para auditoría y métricas)';
  END IF;
END $$;

-- ─── 7. Vista de gasto del piloto (V7) ──────────────────────────────────────
--
-- Calcula el gasto acumulado desde calls.cost_amount (Twilio real)
-- TODO: agregar estimación de ConversationRelay, ElevenLabs y LLM

CREATE OR REPLACE VIEW public.v_voice_pilot_spend AS
SELECT
  c.organization_id,
  COUNT(*) FILTER (WHERE c.mode = 'ai_agent') as total_calls,
  SUM(c.cost_amount) FILTER (WHERE c.mode = 'ai_agent') as total_spent_usd,
  SUM(c.duration_seconds) FILTER (WHERE c.mode = 'ai_agent') as total_minutes,
  MAX(c.started_at) FILTER (WHERE c.mode = 'ai_agent') as last_call_at
FROM public.calls c
WHERE c.mode = 'ai_agent'
  AND c.cost_amount IS NOT NULL
GROUP BY c.organization_id;

COMMENT ON VIEW public.v_voice_pilot_spend IS
  'Gasto acumulado del piloto del agente de voz (V7). ' ||
  'Incluye: total de llamadas, gasto total en USD, minutos totales.';

GRANT SELECT ON public.v_voice_pilot_spend TO authenticated;

-- ─── 8. Índices para mejorar rendimiento de validaciones ────────────────────

-- Índice para frecuencia (V6): intentos del día por cliente
CREATE INDEX IF NOT EXISTS idx_voice_agent_call_attempts_customer_day
  ON public.voice_agent_call_attempts (organization_id, customer_id, attempted_at DESC);

-- Índice para frecuencia (V6): llamadas completadas recientes
CREATE INDEX IF NOT EXISTS idx_calls_customer_recent
  ON public.calls (organization_id, customer_id, started_at DESC)
  WHERE status = 'completed' AND duration_seconds IS NOT NULL;

-- Índice para concurrencia (V8): llamadas en progreso
CREATE INDEX IF NOT EXISTS idx_calls_org_in_progress
  ON public.calls (organization_id, mode, status)
  WHERE status = 'in_progress';

-- ─── 9. Función auxiliar: verificar si es festivo ───────────────────────────

CREATE OR REPLACE FUNCTION public.is_colombian_holiday(check_date DATE)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.holidays_co
    WHERE holiday_date = check_date
  );
$$;

COMMENT ON FUNCTION public.is_colombian_holiday(DATE) IS
  'Verifica si una fecha es festivo en Colombia según holidays_co';

GRANT EXECUTE ON FUNCTION public.is_colombian_holiday(DATE) TO authenticated;

-- ─── 10. Función auxiliar: último intento de marcación ──────────────────────
--
-- Útil para validar el ritmo de 20 segundos entre marcaciones (V8)

CREATE OR REPLACE FUNCTION public.get_last_dial_attempt(
  p_org_id INTEGER,
  p_mode TEXT DEFAULT 'ai_agent'
)
RETURNS TIMESTAMPTZ
LANGUAGE SQL
STABLE
AS $$
  SELECT MAX(started_at)
  FROM public.calls
  WHERE organization_id = p_org_id
    AND mode = p_mode;
$$;

COMMENT ON FUNCTION public.get_last_dial_attempt(INTEGER, TEXT) IS
  'Devuelve la fecha de la última marcación del agente (V8 ritmo)';

GRANT EXECUTE ON FUNCTION public.get_last_dial_attempt(INTEGER, TEXT) TO authenticated;

-- ============================================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================================

-- NOTAS PARA JUAN:
-- 
-- 1. Esta migración crea las estructuras necesarias para canDial (V0-V10)
-- 2. Los festivos 2026-2027 ya están cargados
-- 3. Cada año en noviembre, ejecutar:
--    INSERT INTO holidays_co (holiday_date, name, year, type) VALUES (...);
-- 4. La configuración legal se lee de comm_settings.metadata:
--    - privacy_policy_published_at
--    - crc_rne_registered_at
--    - crc_8308_number_registered_at
--    - internal_test_numbers (array de teléfonos)
-- 5. El estado RNE se guarda en customers.metadata:
--    - rne_status: 'no_excluido' | 'excluido'
--    - rne_checked_at: fecha de última consulta
-- 6. La vista v_voice_pilot_spend muestra el gasto acumulado
