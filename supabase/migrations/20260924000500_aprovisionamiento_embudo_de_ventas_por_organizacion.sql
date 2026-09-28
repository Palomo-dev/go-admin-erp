-- ============================================================
-- Aprovisionamiento: toda organizacion nace con su embudo de ventas
-- ============================================================
-- Causa raiz de F-66 (ficha: docs/hallazgos/F-66.md) y de F-74.
--
-- El sintoma de F-66 fue que 23 leads del formulario web de una organizacion
-- acabaron en su embudo de Onboarding. La causa no era la eleccion del embudo
-- --que ya se corrigio-- sino que la organizacion NO TENIA embudo de ventas.
-- Medido el 2026-09-23 sobre las 85 organizaciones: 77 no tienen ningun embudo
-- de ventas y 76 no tienen ningun embudo. De las 8 organizaciones creadas entre
-- el 2026-08-26 y el 2026-09-23 (139..149), ninguna tiene embudo de ventas.
--
-- Reconstruccion del alta de una organizacion (verificada por MCP):
--   * 18 disparadores AFTER INSERT sobre `organizations` siembran sucursal
--     principal, 13 periodos fiscales, 48 cuentas contables, reglas contables,
--     6 departamentos con sus cargos, `comm_settings`, `provider_configs`,
--     `website_settings`, paginas del sitio, preferencias, suscripcion de
--     prueba, ajustes del asistente y los modulos `is_core`. Ninguno siembra
--     un embudo.
--   * `fn_crm_seed_defaults(org)` SI se dispara sola desde 2026-09-14
--     (`trg_crm_module_activated_seed` sobre `organization_modules`), pero
--     siembra diez tablas de configuracion y NINGUN embudo. Y solo corre si
--     alguien activa el modulo `crm`, que no es `is_core`.
--   * El unico sitio que creaba embudos al activar el CRM era
--     `src/app/api/modules/route.ts`, y creaba `onboarding` y `renewal`
--     --no `sales`--. De ahi los dos embudos y cero de ventas.
--
-- Esta migracion pone la siembra del embudo de ventas en la base, no en la
-- aplicacion, por dos razones: (1) un lead que llega por el formulario web no
-- pasa por ninguna ruta de Next, asi que la aplicacion no es el sitio donde
-- garantizar el invariante; (2) la unica ruta que lo hacia era una ruta HTTP
-- con service role, y depender de una llamada del cliente para que el dato
-- quede coherente es exactamente lo que fallo.
--
-- Dos vias, las dos idempotentes:
--   A. `trg_seed_crm_pipeline_on_org` (AFTER INSERT en `organizations`): toda
--      organizacion nueva nace con embudo, tenga el CRM encendido o no. Se
--      siembra aunque el CRM este apagado porque `web_capture_lead` no
--      comprueba el modulo (ver F-75): con el CRM apagado tambien entran leads.
--   B. `trg_seed_crm_pipeline_on_module` (al activar el modulo `crm`): cubre a
--      las organizaciones anteriores a esta migracion y repara a la que se
--      quede sin embudo.
--
-- No se toca `fn_crm_seed_defaults`: su contrato (firma, volatilidad,
-- SECURITY DEFINER, search_path, owner, ACL y cuerpo) queda intacto. El embudo
-- va en funcion propia para no reescribir 8,5 KB de cuerpo ajeno.
--
-- Seguridad. `fn_crm_seed_pipeline_ventas` escribe datos de UN inquilino y NO
-- lleva `fn_assert_acceso_org`, a proposito y con su contrapartida:
--   * `fn_assert_acceso_org` no sirve en un disparador de `organizations`. En
--     el momento del INSERT la fila de `organization_members` todavia no
--     existe --el formulario la inserta despues (`CreateOrganizationForm.tsx`)--
--     asi que la comprobacion dependeria de `created_by`/`owner_user_id` y
--     abortaria el alta completa de la organizacion cuando no estuvieran.
--   * En su lugar la funcion se cierra por ACL: `REVOKE` de `PUBLIC`, `anon` y
--     `authenticated`. Un inquilino no puede invocarla, ni para su propia
--     organizacion ni para otra. Solo la alcanzan sus dos disparadores (que
--     corren como `postgres` por ser SECURITY DEFINER) y `service_role`.
--   * El `p_org_id` de los disparadores sale de `NEW`, nunca de una entrada.
--
-- Sin nombres de organizaciones cliente y sin credenciales (repo publico).
-- Probada en seco dentro de un `DO` terminado en `RAISE EXCEPTION`
-- (transaccion abortada) con conteos antes/despues y doble ejecucion.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_crm_seed_pipeline_ventas(p_org_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_pipeline_id uuid;
  v_creado      boolean := false;
  v_default     boolean := false;
  n_etapas      int := 0;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN jsonb_build_object('organization_id', NULL, 'pipeline_creado', false, 'etapas', 0, 'motivo', 'org_nula');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_org_id) THEN
    RETURN jsonb_build_object('organization_id', p_org_id, 'pipeline_creado', false, 'etapas', 0, 'motivo', 'organizacion_inexistente');
  END IF;

  -- 1. ¿Ya hay embudo de ventas? `pipeline_type` es NULL-able con DEFAULT
  --    'sales', asi que un NULL heredado cuenta como ventas: mismo criterio
  --    que `web_capture_lead` despues de F-66, para que las dos funciones
  --    elijan siempre el mismo embudo.
  SELECT p.id INTO v_pipeline_id
    FROM public.pipelines p
   WHERE p.organization_id = p_org_id
     AND coalesce(p.pipeline_type, 'sales') = 'sales'
   ORDER BY (p.is_default IS TRUE) DESC, p.created_at ASC, p.id ASC
   LIMIT 1;

  -- 2. Crearlo si falta. `is_default` solo si la organizacion no tiene ya otro
  --    marcado: `unique_default_pipeline_per_org` es un UNIQUE parcial sobre
  --    (organization_id) WHERE is_default = true y no admite dos.
  IF v_pipeline_id IS NULL THEN
    SELECT NOT EXISTS (
      SELECT 1 FROM public.pipelines p
       WHERE p.organization_id = p_org_id AND p.is_default IS TRUE
    ) INTO v_default;

    INSERT INTO public.pipelines (organization_id, name, pipeline_type, is_default)
    VALUES (p_org_id, 'Ventas', 'sales', coalesce(v_default, false))
    RETURNING id INTO v_pipeline_id;

    v_creado := true;
  END IF;

  -- 3. Etapas, solo si el embudo no tiene ninguna. El NOT EXISTS no
  --    correlaciona con `e`: es todo o nada, no deja el embudo a medias ni
  --    duplica al reejecutar. `probability` va en porcentaje 0-100
  --    (CHECK `stages_probability_range`) y la etapa ganadora lleva `is_won`
  --    porque hay codigo que la busca (`opportunitiesService.getWonStage`):
  --    sin ella no se puede cerrar una oportunidad como ganada.
  --    Las 9 etapas son las de la plantilla 'sales' de
  --    `src/lib/services/crm/pipelineTemplates.ts`, copiadas una a una.
  INSERT INTO public.stages (pipeline_id, name, position, probability, color, sla_days, is_won, is_lost)
  SELECT v_pipeline_id, e.name, e.position, e.probability, e.color, e.sla_days, e.is_won, e.is_lost
    FROM (VALUES
      ('Lead nuevo',    1,  10, '#3b82f6',    3, false, false),
      ('Contactado',    2,  20, '#6366f1',    7, false, false),
      ('Calificado',    3,  35, '#8b5cf6',   10, false, false),
      ('Discovery',     4,  50, '#a855f7',   14, false, false),
      ('Demo',          5,  65, '#d946ef',   21, false, false),
      ('Propuesta',     6,  80, '#ec4899',   30, false, false),
      ('Negociacion',   7,  90, '#f97316',   45, false, false),
      ('Contrato/pago', 8, 100, '#22c55e', NULL,  true, false),
      ('Perdido',       9,   0, '#ef4444', NULL, false,  true)
    ) AS e(name, position, probability, color, sla_days, is_won, is_lost)
   WHERE NOT EXISTS (SELECT 1 FROM public.stages s WHERE s.pipeline_id = v_pipeline_id);
  GET DIAGNOSTICS n_etapas = ROW_COUNT;

  RETURN jsonb_build_object(
    'organization_id', p_org_id,
    'pipeline_id',     v_pipeline_id,
    'pipeline_creado', v_creado,
    'etapas',          n_etapas
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_crm_seed_pipeline_ventas(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crm_seed_pipeline_ventas(integer) TO service_role;

COMMENT ON FUNCTION public.fn_crm_seed_pipeline_ventas(integer) IS
  'Siembra idempotente del embudo de ventas por defecto de una organizacion: 1 pipeline pipeline_type=sales (is_default si no hay otro) y sus 9 etapas, con la ganadora marcada is_won. No lleva comprobacion de pertenencia porque no es invocable por un inquilino (REVOKE de anon y authenticated); sus llamadores son sus dos disparadores y service_role.';


-- ── Via A: toda organizacion nueva ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_seed_crm_pipeline_on_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  BEGIN
    PERFORM public.fn_crm_seed_pipeline_ventas(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- Una semilla nunca puede tumbar el alta de una organizacion. Mismo
    -- criterio que fn_seed_comm_settings_on_org.
    RAISE WARNING 'fn_seed_crm_pipeline_on_org(%) fallo: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_seed_crm_pipeline_on_org() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_seed_crm_pipeline_on_org() IS
  'Disparador AFTER INSERT en organizations: siembra el embudo de ventas por defecto. Traga cualquier error como WARNING para no abortar el alta.';

DROP TRIGGER IF EXISTS trg_seed_crm_pipeline_on_org ON public.organizations;
CREATE TRIGGER trg_seed_crm_pipeline_on_org
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.fn_seed_crm_pipeline_on_org();


-- ── Via B: al activar el modulo crm ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_seed_crm_pipeline_on_module()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NEW.module_code = 'crm' AND NEW.is_active IS TRUE
     AND (TG_OP = 'INSERT' OR OLD.is_active IS DISTINCT FROM TRUE) THEN
    BEGIN
      PERFORM public.fn_crm_seed_pipeline_ventas(NEW.organization_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'fn_seed_crm_pipeline_on_module(%) fallo: %', NEW.organization_id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_seed_crm_pipeline_on_module() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_seed_crm_pipeline_on_module() IS
  'Disparador al activar el modulo crm: siembra el embudo de ventas por defecto. Cubre las organizaciones anteriores al disparador de organizations y repara la que se haya quedado sin embudo. No sustituye a trg_crm_module_activated_seed (fn_crm_seed_defaults): son semillas distintas.';

DROP TRIGGER IF EXISTS trg_seed_crm_pipeline_on_module ON public.organization_modules;
CREATE TRIGGER trg_seed_crm_pipeline_on_module
AFTER INSERT OR UPDATE OF is_active ON public.organization_modules
FOR EACH ROW EXECUTE FUNCTION public.fn_seed_crm_pipeline_on_module();

-- NOTA: esta migracion NO hace backfill. Las 77 organizaciones que hoy no
-- tienen embudo de ventas son datos de clientes reales y su siembra
-- retroactiva la decide el dueño: el procedimiento y su SQL estan en
-- docs/hallazgos/F-74.md, sin ejecutar.
