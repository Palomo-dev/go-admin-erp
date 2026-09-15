-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f08_04_condition_step_fail_closed`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 1d9d2e732008ed7cba703b01aba69a38). No reformatear.
-- FASE-08 · ronda 3 · hallazgos N10 y N11 del tester.
--
-- N10: un paso `condition` sin condicion evaluaba a VERDADERO (normalizar un
--      valor nulo produce un grupo AND vacio, que se cumple siempre), asi que
--      el paso que la interfaz anuncia como "puede cortar la secuencia" no
--      cortaba nada. La validacion en TS lo rechaza al guardar; este CHECK es
--      el respaldo en la base, para que no entre por ninguna otra puerta.
--
-- N11: `continue_on_error` es TRUE por defecto, y en un paso de condicion eso
--      significaba "si la condicion no se pudo evaluar, encola el siguiente
--      igual", es decir, mandar el correo sin haber evaluado nada. Un paso de
--      condicion se guarda siempre en FALSE.
--
-- Sin funciones nuevas: esta migracion es solo DDL de restricciones, asi que no
-- hay nada con elevacion de privilegios que revocar a `anon`.
-- Verificado antes de aplicar: 0 filas en `sequence_steps`, ninguna viola.

-- Red de seguridad para datos preexistentes (hoy 0 filas).
UPDATE public.sequence_steps
   SET continue_on_error = false
 WHERE channel = 'condition' AND continue_on_error;

ALTER TABLE public.sequence_steps
  DROP CONSTRAINT IF EXISTS sequence_steps_condition_required_chk;

ALTER TABLE public.sequence_steps
  ADD CONSTRAINT sequence_steps_condition_required_chk CHECK (
    channel <> 'condition'
    OR (
      condition IS NOT NULL
      AND (
        (jsonb_typeof(condition) = 'object' AND condition <> '{}'::jsonb)
        OR (jsonb_typeof(condition) = 'array' AND jsonb_array_length(condition) > 0)
      )
    )
  );

ALTER TABLE public.sequence_steps
  DROP CONSTRAINT IF EXISTS sequence_steps_condition_no_continue_chk;

ALTER TABLE public.sequence_steps
  ADD CONSTRAINT sequence_steps_condition_no_continue_chk CHECK (
    channel <> 'condition' OR continue_on_error = false
  );

COMMENT ON CONSTRAINT sequence_steps_condition_required_chk ON public.sequence_steps IS
  'FASE-08 N10: un paso de condicion sin condicion evaluaba a verdadero y dejaba pasar la secuencia. Fail-closed.';

COMMENT ON CONSTRAINT sequence_steps_condition_no_continue_chk ON public.sequence_steps IS
  'FASE-08 N11: una condicion que falla al evaluarse corta la secuencia; continue_on_error no aplica a este canal.';
