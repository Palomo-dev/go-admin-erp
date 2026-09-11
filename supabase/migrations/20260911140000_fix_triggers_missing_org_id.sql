-- Migration: fix_triggers_missing_org_id
-- Date: 2026-09-11
-- Ronda 3, P0-1: Reparar 3 triggers que referencian NEW.organization_id en tablas sin esa columna.
--
-- currency_rates y provider_pricing son catalogos globales (no multi-tenant).
-- housekeeping_tasks resuelve la org via space_id -> spaces.branch_id -> branches.organization_id.
--
-- Bug reproducido en produccion:
--   INSERT INTO currency_rates (code, rate, source) VALUES ('EUR', 1.0, 'test');
--   -> ERROR: record "new" has no field "organization_id"
--
-- La ronda 2 elimino DEFAULT CURRENT_DATE y lo reemplazo por triggers que asumian
-- que toda tabla tenia organization_id. Estas tres no lo tienen.

-- ============================================================
-- fn_today_system(): hoy en la zona horaria de sistema (America/Bogota).
-- Reemplaza CURRENT_DATE (que usa el TimeZone del cluster = UTC).
-- Para catalogos globales que no pertenecen a ninguna organizacion.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_today_system()
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Zona horaria de sistema del SaaS. Si cambia, se modifica esta funcion.
  RETURN (now() AT TIME ZONE 'America/Bogota')::date;
END;
$$;

-- ============================================================
-- 1. currency_rates: catalogo global. Eliminar trigger, restaurar default con fn_today_system.
-- ============================================================
DROP TRIGGER IF EXISTS trg_set_rate_date_tz ON public.currency_rates;
DROP FUNCTION IF EXISTS public.fn_set_rate_date_tz();

ALTER TABLE public.currency_rates
  ALTER COLUMN rate_date SET DEFAULT public.fn_today_system();

-- ============================================================
-- 2. provider_pricing: catalogo global. Eliminar trigger, restaurar default con fn_today_system.
-- ============================================================
DROP TRIGGER IF EXISTS trg_set_valid_from_tz ON public.provider_pricing;

ALTER TABLE public.provider_pricing
  ALTER COLUMN valid_from SET DEFAULT public.fn_today_system();

-- ============================================================
-- 3. housekeeping_tasks: multi-tenant via space_id -> spaces.branch_id -> branches.organization_id.
--    Reescribir el trigger para resolver la org por esa ruta.
--    Si no se puede resolver (space_id invalido o sin branch), caer a fn_today_system().
-- ============================================================
DROP TRIGGER IF EXISTS trg_set_task_date_tz ON public.housekeeping_tasks;
DROP FUNCTION IF EXISTS public.fn_set_task_date_tz();

CREATE OR REPLACE FUNCTION public.fn_set_task_date_tz()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id integer;
BEGIN
  IF NEW.task_date IS NULL THEN
    -- Resolver organization_id via space_id -> spaces.branch_id -> branches.organization_id
    BEGIN
      SELECT b.organization_id INTO v_org_id
      FROM public.spaces s
      JOIN public.branches b ON b.id = s.branch_id
      WHERE s.id = NEW.space_id;
    EXCEPTION WHEN others THEN
      v_org_id := NULL;
    END;

    IF v_org_id IS NOT NULL THEN
      NEW.task_date := public.fn_today_for_org(v_org_id);
    ELSE
      -- No se pudo resolver la org: caer a sistema (America/Bogota)
      NEW.task_date := public.fn_today_system();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_task_date_tz
  BEFORE INSERT ON public.housekeeping_tasks
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_task_date_tz();
