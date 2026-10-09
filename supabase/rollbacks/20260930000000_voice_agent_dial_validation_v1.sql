-- ============================================================================
-- ROLLBACK: Validación previa a marcación (canDial) — Ley 2300 de 2023
-- ============================================================================
-- Fecha: 2026-09-30
-- Autor: Cloud Agent
--
-- Revierte las estructuras creadas en la migración forward.
-- ============================================================================

-- ─── 10. Funciones auxiliares ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_last_dial_attempt(INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.is_colombian_holiday(DATE);

-- ─── 9. Índices ──────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_calls_org_in_progress;
DROP INDEX IF EXISTS public.idx_calls_customer_recent;
DROP INDEX IF EXISTS public.idx_voice_agent_call_attempts_customer_day;

-- ─── 8. Vista de gasto ───────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_voice_pilot_spend;

-- ─── 7. Columna answered en voice_agent_call_attempts ───────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'voice_agent_call_attempts' 
    AND column_name = 'answered'
  ) THEN
    ALTER TABLE public.voice_agent_call_attempts
      DROP COLUMN answered;
  END IF;
END $$;

-- ─── 6. Tabla de números de prueba internos ─────────────────────────────────

DROP TABLE IF EXISTS public.internal_test_numbers CASCADE;

-- ─── 5 & 4. Comentarios de metadata ─────────────────────────────────────────
-- Los comentarios no se pueden revertir sin perder otros comentarios.
-- Si es necesario, restaurar manualmente desde backup.

-- ─── 3. Datos de festivos ───────────────────────────────────────────────────
-- Se eliminarán con la tabla

-- ─── 2. Índice de año ────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_holidays_co_year;

-- ─── 1. Tabla de festivos ───────────────────────────────────────────────────

DROP TABLE IF EXISTS public.holidays_co CASCADE;

-- ============================================================================
-- FIN DEL ROLLBACK
-- ============================================================================

-- NOTA: Los comentarios en comm_settings.metadata y customers.metadata
-- no se revierten para no perder otros comentarios existentes.
