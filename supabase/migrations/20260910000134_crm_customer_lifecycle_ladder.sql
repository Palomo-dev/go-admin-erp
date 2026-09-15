-- Aplicada el 2026-09-10 vía MCP (apply_migration) como `crm_customer_lifecycle_ladder`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 5d7e183c65ac14363f6d18ddc0310590). No reformatear.
-- ─────────────────────────────────────────────────────────────────────────────
-- Escalera de ciclo de vida del cliente enganchada al ciclo del CRM.
--
-- POR QUÉ EN LA BASE Y NO EN `opportunityStageService`:
--   `opportunities.status = 'won'` lo escriben al menos cuatro caminos —
--   `opportunityStageService.changeStage`, `opportunitiesService.markAsWon`,
--   `opportunitiesService.updateOpportunity({status})` y, sobre todo, el propio
--   trigger `fn_sync_status_from_stage`, que cierra la oportunidad DESDE DENTRO
--   de la base cuando otra ruta mueve solo `stage_id` (callAnalysisService,
--   moveToStage, voiceAgentTools). Un enganche en el servicio se saltaría todos
--   esos casos en silencio. Es el mismo razonamiento de F9-31, y el mismo sitio
--   donde ya vive `trg_create_commission_on_opportunity_won`.
--
-- ESCALERA (solo sube):  lead → opportunity → customer
--   · La conversión lead→deal promueve SOLO desde 'lead'. Nunca degrada a un
--     'customer' porque se le abra otro lead.
--   · La victoria promueve a 'customer' desde cualquier estado, incluido
--     'churned' (reactivación). 'churned' está fuera de la escalera: una simple
--     conversión no lo toca, para no perder la señal de baja.
--
-- SEGURIDAD: SECURITY DEFINER porque `customers` tiene RLS y el trigger debe
-- funcionar igual desde sesión de usuario, service-role y cron. Va con
-- `REVOKE ... FROM PUBLIC, anon` (abajo) y con doble guarda de pertenencia:
--   1. el cliente se resuelve SIEMPRE por `organization_id = NEW.organization_id`
--      (no se puede tocar un cliente de otra organización), y
--   2. si hay sesión (`auth.uid()` no nulo) se exige membresía activa en
--      `organization_members`; si no la hay, no se promueve nada.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_sync_customer_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target  text;
  v_current text;
  v_uid     uuid;
BEGIN
  IF NEW.customer_id IS NULL OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Qué transición pide esta actualización. El trigger se dispara por columna
  -- (`OF status, record_type`), que salta también cuando la columna aparece en
  -- el SET sin cambiar de valor: por eso todo se decide con IS DISTINCT FROM.
  IF NEW.status = 'won' AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_target := 'customer';
  ELSIF NEW.record_type = 'deal' AND OLD.record_type IS DISTINCT FROM NEW.record_type THEN
    v_target := 'opportunity';
  ELSE
    RETURN NEW;
  END IF;

  -- Guarda de pertenencia (1): el cliente tiene que ser de la MISMA organización
  -- que la oportunidad.
  SELECT c.lifecycle_stage
    INTO v_current
    FROM customers c
   WHERE c.id = NEW.customer_id
     AND c.organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Guarda de pertenencia (2): con sesión, el usuario debe ser miembro activo.
  v_uid := auth.uid();
  IF v_uid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM organization_members om
     WHERE om.user_id = v_uid
       AND om.organization_id = NEW.organization_id
       AND COALESCE(om.is_active, true)
  ) THEN
    RETURN NEW;
  END IF;

  -- Escalera monotónica.
  IF v_target = 'opportunity' AND v_current IS DISTINCT FROM 'lead' THEN
    RETURN NEW;                       -- nunca degrada 'customer' ni resucita 'churned'
  END IF;
  IF v_target = 'customer' AND v_current = 'customer' THEN
    RETURN NEW;                       -- ya está arriba
  END IF;

  UPDATE customers
     SET lifecycle_stage = v_target,
         updated_at = now()
   WHERE id = NEW.customer_id
     AND organization_id = NEW.organization_id
     AND lifecycle_stage IS DISTINCT FROM v_target;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_sync_customer_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_sync_customer_lifecycle() FROM anon;
REVOKE ALL ON FUNCTION public.fn_sync_customer_lifecycle() FROM authenticated;

COMMENT ON FUNCTION public.fn_sync_customer_lifecycle() IS
  'Escalera monotonica de customers.lifecycle_stage: lead->opportunity al convertir un lead en deal, ->customer al ganar. Nunca degrada. Ver migracion crm_customer_lifecycle_ladder.';

DROP TRIGGER IF EXISTS trg_sync_customer_lifecycle ON public.opportunities;
CREATE TRIGGER trg_sync_customer_lifecycle
AFTER UPDATE OF status, record_type ON public.opportunities
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_customer_lifecycle();