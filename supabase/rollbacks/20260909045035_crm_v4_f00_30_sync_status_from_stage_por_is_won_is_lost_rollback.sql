-- ============================================================
-- ROLLBACK de 20260909045035_crm_v4_f00_30_sync_status_from_stage_por_is_won_is_lost
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1); cuerpo corregido en la ronda 4 (R1).
--
-- CUERPO EXACTO de la versión anterior inmediata de fn_sync_status_from_stage:
-- supabase_migrations.schema_migrations versión 20260901202059
-- (`f2_fn_sync_status_from_stage`, statements[1], 1 282 caracteres,
-- md5 3fa918f68f5a41b73b98186322d6de9a,
-- sha256 9c969708fd3079bf5eeac9775b7e6bf86024fcab18948e0c7635e0223a5e0d86).
-- Se copia statements[1] completo, incluido su DROP/CREATE TRIGGER, para que
-- la comprobación sea byte a byte: ese trigger es idéntico al vivo
-- (pg_get_triggerdef verificado el 2026-09-15) y f00_30 no lo tocó, así que
-- recrearlo es inocuo. Comprobación: `tail -n +28 <este archivo> | sha256sum`
-- debe dar el sha256 de arriba (el cuerpo empieza en la línea 28 y no termina
-- en salto de línea). No reformatear.
--
-- ORDEN — LEER ANTES DE EJECUTAR: solo válido si ANTES se revirtió
-- 20260909052947_fn_sync_status_from_stage_requiere_datos_de_cierre (F9-31),
-- que redefinió esta misma función después de f00_30 y es la versión viva.
-- Ejecutar este rollback sobre la versión viva la pisa y reintroduce el bug
-- crítico F9-31: la etapa cierra sola la oportunidad y se crean comisiones
-- con win_data = NULL. Además vuelve a derivar won/lost por probability
-- (100/0) y a estampar closed_at = now() sin COALESCE (hallazgo medio
-- del tester r3, F0-DB). No toca datos directamente. El trigger sigue apuntando a
-- la función.
-- ============================================================
-- F2: Función fn_sync_status_from_stage que sincroniza opportunities.status con stage
-- Cuando una oportunidad llega a la etapa final (is_won_stage o probability=100), marca status='won'
-- Cuando se mueve a una etapa con probability=0 y is_loss_stage, marca status='lost'
CREATE OR REPLACE FUNCTION fn_sync_status_from_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si la etapa tiene probability=100, marcar como won
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    UPDATE opportunities
      SET status = CASE
        WHEN (SELECT probability FROM stages WHERE id = NEW.stage_id) = 100 THEN 'won'
        WHEN (SELECT probability FROM stages WHERE id = NEW.stage_id) = 0 THEN 'lost'
        ELSE 'open'
      END,
      closed_at = CASE
        WHEN (SELECT probability FROM stages WHERE id = NEW.stage_id) IN (0, 100) THEN now()
        ELSE NULL
      END
      WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger que ejecuta fn_sync_status_from_stage después de update en opportunities
DROP TRIGGER IF EXISTS trg_sync_status_from_stage ON opportunities;
CREATE TRIGGER trg_sync_status_from_stage
  AFTER UPDATE OF stage_id ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_status_from_stage();