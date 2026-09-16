-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_30_sync_status_from_stage_por_is_won_is_lost`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 3b44613ec63564ca32cacc7da9e6ecb9). No reformatear.
-- F0 r4 · Tarea 2a (CRÍTICA): `fn_sync_status_from_stage` derivaba el status
-- de `stages.probability` (100 -> won, 0 -> lost) y estampaba `closed_at`,
-- pisando en un segundo UPDATE lo que escribe `opportunityStageService.ts`,
-- que decide por `stages.is_won/is_lost`. Consecuencias medidas por el tester:
--   * arrastrar a "Ganado" cerraba la oportunidad sin WonCloseModal ni
--     win_data y disparaba trg_create_commission_on_opportunity_won;
--   * mover a una etapa intermedia con probability=0 (p.ej. "Reunión
--     Agendada" de la org 2) la marcaba perdida y con closed_at, sin razón.
--
-- Nueva semántica (fuente de verdad: is_won/is_lost):
--   * etapa is_won  -> status='won'  (solo si aún no lo es)
--   * etapa is_lost -> status='lost' (solo si aún no lo es)
--   * etapa NO terminal -> NO se toca el status salvo que la oportunidad
--     viniera cerrada POR la etapa anterior (que sí era terminal): en ese caso
--     se reabre a 'open'. Si estaba cerrada por otra vía, no se toca.
--   * la función NUNCA escribe `closed_at`: esa columna la gobierna
--     `fn_opportunities_set_closed_at` (BEFORE UPDATE OF status), que respeta
--     el closed_at que ya venga (COALESCE) y lo limpia al reabrir.
-- El UPDATE anidado solo toca `status`, así que no re-dispara este trigger
-- (AFTER UPDATE OF stage_id) y deja de emitirse cuando no hace falta.
CREATE OR REPLACE FUNCTION public.fn_sync_status_from_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_won  boolean;
  v_new_lost boolean;
  v_old_won  boolean;
  v_old_lost boolean;
  v_target   text;
BEGIN
  IF NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(s.is_won, false), COALESCE(s.is_lost, false)
    INTO v_new_won, v_new_lost
    FROM stages s WHERE s.id = NEW.stage_id;

  IF NOT FOUND THEN
    RETURN NEW;                       -- etapa inexistente: no se inventa nada
  END IF;

  IF v_new_won AND v_new_lost THEN
    RAISE WARNING 'fn_sync_status_from_stage: stage % marcada is_won e is_lost a la vez; no se toca el status de la oportunidad %',
      NEW.stage_id, NEW.id;
    RETURN NEW;
  END IF;

  IF v_new_won THEN
    v_target := 'won';
  ELSIF v_new_lost THEN
    v_target := 'lost';
  ELSE
    -- Etapa no terminal: solo se reabre lo que cerró la etapa anterior.
    SELECT COALESCE(s.is_won, false), COALESCE(s.is_lost, false)
      INTO v_old_won, v_old_lost
      FROM stages s WHERE s.id = OLD.stage_id;

    IF COALESCE(v_old_won, false) OR COALESCE(v_old_lost, false) THEN
      v_target := 'open';
    ELSE
      RETURN NEW;                     -- ni status ni closed_at se tocan
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM v_target THEN
    UPDATE opportunities
       SET status = v_target
     WHERE id = NEW.id
       AND status IS DISTINCT FROM v_target;
  END IF;

  RETURN NEW;
END;
$function$;