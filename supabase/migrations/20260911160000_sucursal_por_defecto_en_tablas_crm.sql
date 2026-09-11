-- ============================================================
-- CRM: sucursal por defecto en oportunidades, conversaciones, mensajes y actividades
-- ============================================================
-- Hallazgo del dueño (2026-09-11, con capturas): la página de Oportunidades
-- decía «No se encontraron oportunidades» mientras el pipeline enseñaba 11 y
-- la ficha del cliente también. Medido contra la base antes de tocar nada:
--
--   tabla           sin sucursal   total
--   opportunities            36      36   (100 %)
--   conversations        20.606  20.606   (100 %)
--   messages            256.757 256.757   (100 %)
--   activities               77      77   (100 %)
--   customers                 0  33.334   (los clientes SÍ la llevan)
--
-- Ningún camino de escritura de esas cuatro tablas ponía `branch_id`: ni las
-- rutas, ni las funciones Edge, ni los webhooks, ni los formularios web. Y las
-- vistas filtraban `branch_id = <sucursal seleccionada>`, que descarta lo
-- nulo. Resultado: con cualquier sucursal seleccionada, la lista de
-- Oportunidades, el panel del CRM y los reportes salían VACÍOS para todas las
-- organizaciones.
--
-- Arreglar solo el código deja el agujero abierto para el siguiente escritor
-- que se olvide (ya se olvidaron todos). Por eso se cierra en la base:
--
--   1. `fn_org_main_branch(org)` resuelve la sucursal principal activa de la
--      organización. Determinista hoy: las 83 organizaciones tienen
--      exactamente una principal activa (medido), y lleva respaldo por si
--      alguna deja de tenerla.
--   2. Un trigger BEFORE INSERT en las cuatro tablas rellena `branch_id` con
--      esa sucursal cuando viene nulo. Cubre TODOS los escritores, presentes
--      y futuros, sin depender de que cada uno se acuerde.
--   3. Backfill de las filas existentes con la misma regla.
--
-- Semántica: una fila que nace sin sucursal pertenece a la sucursal principal
-- de su organización. Para las 78 organizaciones de una sola sucursal es
-- exactamente lo que hay; para las multisucursal es el único valor por
-- defecto razonable, y la fila se puede reasignar después.
--
-- El código (lectura) usa además `applyBranchFilterInclusive` como red de
-- seguridad: si alguna vez quedara una fila nula, sigue apareciendo.
--
-- Idempotente. Probado dentro de `begin; … rollback;` con conteos antes de
-- aplicar. Sin credenciales. La función con elevación lleva su REVOKE.
-- ============================================================

-- 1. Sucursal principal activa de una organización, con respaldo.
CREATE OR REPLACE FUNCTION public.fn_org_main_branch(p_org_id integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id
    FROM public.branches b
   WHERE b.organization_id = p_org_id
   ORDER BY (b.is_main AND b.is_active) DESC,  -- principal activa primero
            b.is_active DESC,                  -- luego cualquier activa
            b.is_main DESC,                    -- luego la principal aunque esté inactiva
            b.id ASC                           -- y si no, la más antigua
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.fn_org_main_branch(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_org_main_branch(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_org_main_branch(integer) IS
  'Sucursal principal activa de la organización (con respaldo). La usan los triggers de sucursal por defecto del CRM.';

-- 2. Trigger: si la fila nace sin sucursal, la de la organización.
CREATE OR REPLACE FUNCTION public.fn_set_branch_from_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.branch_id IS NULL AND NEW.organization_id IS NOT NULL THEN
    NEW.branch_id := public.fn_org_main_branch(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_branch_from_org() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.fn_set_branch_from_org() IS
  'BEFORE INSERT: rellena branch_id con la sucursal principal de la organización cuando viene nulo.';

DROP TRIGGER IF EXISTS trg_set_branch_from_org ON public.opportunities;
CREATE TRIGGER trg_set_branch_from_org
  BEFORE INSERT ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_branch_from_org();

DROP TRIGGER IF EXISTS trg_set_branch_from_org ON public.conversations;
CREATE TRIGGER trg_set_branch_from_org
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_branch_from_org();

DROP TRIGGER IF EXISTS trg_set_branch_from_org ON public.messages;
CREATE TRIGGER trg_set_branch_from_org
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_branch_from_org();

DROP TRIGGER IF EXISTS trg_set_branch_from_org ON public.activities;
CREATE TRIGGER trg_set_branch_from_org
  BEFORE INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_branch_from_org();

-- 3. Backfill de lo existente con la misma regla. Idempotente: solo toca nulos.
UPDATE public.opportunities o SET branch_id = public.fn_org_main_branch(o.organization_id)
 WHERE o.branch_id IS NULL AND o.organization_id IS NOT NULL;

UPDATE public.conversations c SET branch_id = public.fn_org_main_branch(c.organization_id)
 WHERE c.branch_id IS NULL AND c.organization_id IS NOT NULL;

UPDATE public.messages m SET branch_id = public.fn_org_main_branch(m.organization_id)
 WHERE m.branch_id IS NULL AND m.organization_id IS NOT NULL;

UPDATE public.activities a SET branch_id = public.fn_org_main_branch(a.organization_id)
 WHERE a.branch_id IS NULL AND a.organization_id IS NOT NULL;
