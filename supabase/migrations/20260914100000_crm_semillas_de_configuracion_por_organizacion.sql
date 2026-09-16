-- ============================================================
-- CRM: semillas de configuración por organización (presente y futuro)
-- ============================================================
-- Reconciliación del plan (ANEXO-C §6–§7): F1, F2, F11, F12 y F4 tenían el
-- backend construido pero las tablas de configuración estaban VACÍAS para casi
-- todas las organizaciones, así que el producto "parecía roto" sin estarlo. La
-- propia captura del dueño decía «No hay configuración de scoring».
--
-- Medido antes de aplicar (2026-09-14):
--   verticals=0 · icp_profiles=0 · scoring_configs=1 · health_score_configs=1
--   objections=0 · discovery_templates=3 · onboarding_templates=0
--   partner_tiers=0 · referral_programs=0 · call_tags=2
--   Organizaciones con el módulo CRM activo: 49. Con pipeline: 8 (3 de ellas
--   sin el módulo, heredadas). Plantillas para copiar: scoring (org 134),
--   health (1 fila), discovery «Discovery General/Ventas» (org 2).
--
-- Diseño:
--   1. `fn_crm_seed_defaults(org)`: siembra TODO lo que falte a una organización.
--      Idempotente por construcción: `ON CONFLICT DO NOTHING` donde hay UNIQUE,
--      `WHERE NOT EXISTS` donde no. Nunca pisa lo que la organización ya tenga.
--   2. Backfill: se llama para toda organización con el CRM activo o con
--      pipeline.
--   3. Trigger en `organization_modules`: al activar el módulo `crm` de una
--      organización, se siembra sola. Así lo que venga queda cubierto sin que
--      nadie se acuerde.
--
-- Textos en español neutro. Sin nombres de organizaciones cliente (repo
-- público): solo ids. Sin credenciales. `SECURITY DEFINER` con `search_path`
-- fijo y `REVOKE ... FROM PUBLIC, anon` según docs/POLITICA-MIGRACIONES.md.
-- Probado en seco dentro de `begin; … rollback;` con conteos antes de aplicar.
--
-- Fuera de alcance a propósito: `icp_criteria` (el anexo pide verificar su
-- esquema jsonb contra F1 §2.2 antes de sembrar) y `provider_configs` (lo cubre
-- la migración de F0).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_crm_seed_defaults(p_org_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_vert int; n_icp int; n_scor int; n_heal int; n_obj int;
  n_disc int; n_onb int; n_tier int; n_ref int; n_tag int;
  v_scoring jsonb; v_health jsonb; v_discovery jsonb;
BEGIN
  IF p_org_id IS NULL THEN RETURN '{}'::jsonb; END IF;

  -- Verticales (sin UNIQUE → NOT EXISTS por slug)
  INSERT INTO verticals (organization_id, name, slug, color, sort_order, description, positioning, metadata)
  SELECT p_org_id, v.name, v.slug, v.color, v.sort_order, v.description, '{}'::jsonb, '{}'::jsonb
    FROM (VALUES
      ('Restaurantes y bares','restaurantes','#f97316',10,'Operación de mesas, delivery y caja'),
      ('Retail y comercio','retail','#3b82f6',20,'Punto de venta, inventario y fidelización'),
      ('Hotelería y turismo','hoteleria','#8b5cf6',30,'Reservas, PMS y housekeeping'),
      ('Servicios profesionales','servicios','#10b981',40,'Proyectos, horas y facturación'),
      ('Salud y bienestar','salud','#ec4899',50,'Agenda, historias y recordatorios'),
      ('Educación','educacion','#eab308',60,'Matrículas, cobros y comunicación'),
      ('Software / SaaS','saas','#06b6d4',70,'Suscripciones, onboarding y renovación'),
      ('Otros','otros','#6b7280',99,'Vertical genérica')
    ) AS v(name, slug, color, sort_order, description)
   WHERE NOT EXISTS (SELECT 1 FROM verticals x WHERE x.organization_id = p_org_id AND x.slug = v.slug);
  GET DIAGNOSTICS n_vert = ROW_COUNT;

  -- Perfiles ICP (UNIQUE (organization_id, band))
  INSERT INTO icp_profiles (organization_id, name, band, description, priority, color, sla_first_contact_hours)
  SELECT p_org_id, p.name, p.band, p.description, p.priority, p.color, p.sla
    FROM (VALUES
      ('ICP A — encaje ideal','A','Cumple tamaño, presupuesto, urgencia y decisor identificado',10,'#16a34a',4),
      ('ICP B — encaje bueno','B','Cumple la mayoría de criterios; requiere calificación adicional',50,'#f59e0b',24),
      ('ICP C — encaje bajo','C','Fuera del perfil objetivo; solo si hay capacidad',90,'#ef4444',72)
    ) AS p(name, band, description, priority, color, sla)
  ON CONFLICT (organization_id, band) DO NOTHING;
  GET DIAGNOSTICS n_icp = ROW_COUNT;

  -- Scoring (sin UNIQUE → NOT EXISTS por organización). Plantilla: la primera
  -- configuración activa existente en la plataforma.
  SELECT config INTO v_scoring FROM scoring_configs WHERE is_active IS DISTINCT FROM false ORDER BY created_at LIMIT 1;
  n_scor := 0;
  IF v_scoring IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scoring_configs s WHERE s.organization_id = p_org_id) THEN
    INSERT INTO scoring_configs (organization_id, config, is_active) VALUES (p_org_id, v_scoring, true);
    GET DIAGNOSTICS n_scor = ROW_COUNT;
  END IF;

  -- Salud del cliente (PK organization_id)
  SELECT config INTO v_health FROM health_score_configs ORDER BY updated_at NULLS LAST LIMIT 1;
  n_heal := 0;
  IF v_health IS NOT NULL THEN
    INSERT INTO health_score_configs (organization_id, config, refresh_interval_hours, is_active)
    VALUES (p_org_id, v_health, 24, true)
    ON CONFLICT (organization_id) DO NOTHING;
    GET DIAGNOSTICS n_heal = ROW_COUNT;
  END IF;

  -- Objeciones (sin UNIQUE → NOT EXISTS por título)
  INSERT INTO objections (organization_id, title, category, detection_signals, recommended_response, discovery_questions, sort_order)
  SELECT p_org_id, x.title, x.category, x.signals::jsonb, x.response, x.questions::jsonb, x.sort_order
    FROM (VALUES
      ('Es muy caro','precio','["caro","precio","presupuesto","costoso"]','Reencuadrar en valor: costo por día frente a ahorro o ingreso; ofrecer plan escalonado.','["¿Con qué lo comparas?","¿Qué presupuesto tienen asignado?"]',10),
      ('Ya tenemos un proveedor','competencia','["ya tenemos","usamos","proveedor actual"]','Preguntar qué funciona y qué no; posicionar el diferenciador; proponer un piloto en paralelo.','["¿Qué te gustaría que hiciera mejor tu sistema actual?"]',20),
      ('No es el momento','timing','["más adelante","el otro año","ahora no"]','Cuantificar el costo de esperar; fijar fecha de recontacto con un hito concreto.','["¿Qué tendría que pasar para que sea el momento?"]',30),
      ('Tengo que consultarlo','decisor','["consultar","mi socio","el gerente"]','Identificar al decisor y ofrecer una demostración conjunta.','["¿Quién más participa en la decisión?","¿Qué le preocuparía a esa persona?"]',40),
      ('Le faltan funcionalidades','funcionalidad','["no tiene","falta","no hace"]','Aclarar el caso de uso real; registrar lo que falta; ofrecer alternativa o hoja de ruta.','["¿Cómo resuelves eso hoy?","¿Es bloqueante o deseable?"]',50),
      ('No confío / no los conozco','confianza','["no los conozco","referencias","garantía"]','Casos de éxito del mismo sector; garantía o piloto; referencias.','["¿Qué te daría tranquilidad para avanzar?"]',60),
      ('Es complicado de implementar','implementación','["complicado","migrar","capacitar"]','Explicar el onboarding acompañado; mostrar la importación de datos.','["¿Cuántas personas lo usarían?","¿Qué datos habría que migrar?"]',70)
    ) AS x(title, category, signals, response, questions, sort_order)
   WHERE NOT EXISTS (SELECT 1 FROM objections ob WHERE ob.organization_id = p_org_id AND ob.title = x.title);
  GET DIAGNOSTICS n_obj = ROW_COUNT;

  -- Plantilla de discovery (UNIQUE (organization_id, name)). Plantilla: la
  -- primera activa con ese nombre que exista en la plataforma.
  SELECT sections INTO v_discovery FROM discovery_templates WHERE name = 'Discovery General/Ventas' AND is_active ORDER BY created_at LIMIT 1;
  n_disc := 0;
  IF v_discovery IS NOT NULL AND NOT EXISTS (SELECT 1 FROM discovery_templates d WHERE d.organization_id = p_org_id AND d.is_active) THEN
    INSERT INTO discovery_templates (organization_id, name, sections, is_active)
    VALUES (p_org_id, 'Discovery General/Ventas', v_discovery, true)
    ON CONFLICT (organization_id, name) DO NOTHING;
    GET DIAGNOSTICS n_disc = ROW_COUNT;
  END IF;

  -- Onboarding (UNIQUE (organization_id, name))
  INSERT INTO onboarding_templates (organization_id, name, default_duration_days, steps)
  VALUES (p_org_id, 'Onboarding estándar 30 días', 30, '[
    {"key":"kickoff","title":"Kickoff y objetivos","day":0,"owner":"vendor"},
    {"key":"config","title":"Configuración inicial","day":2,"owner":"cs"},
    {"key":"import","title":"Importación de datos","day":5,"owner":"cs"},
    {"key":"training","title":"Capacitación del equipo","day":7,"owner":"cs"},
    {"key":"assisted","title":"Uso asistido","day":10,"owner":"cs"},
    {"key":"review14","title":"Revisión día 14","day":14,"owner":"vendor"},
    {"key":"br30","title":"Business review día 30","day":30,"owner":"vendor"}
  ]'::jsonb)
  ON CONFLICT (organization_id, name) DO NOTHING;
  GET DIAGNOSTICS n_onb = ROW_COUNT;

  -- Niveles de partner (UNIQUE (organization_id, name))
  INSERT INTO partner_tiers (organization_id, name, min_deals, min_revenue, commission_rate, benefits)
  SELECT p_org_id, t.name, t.min_deals, t.min_revenue, t.rate, t.benefits::jsonb
    FROM (VALUES
      ('Registrado',0,0,10.00,'["Material comercial","Registro de negocios"]'),
      ('Plata',3,5000,15.00,'["Co-marketing","Soporte prioritario"]'),
      ('Oro',10,25000,20.00,'["Leads compartidos","Gerente de canal"]')
    ) AS t(name, min_deals, min_revenue, rate, benefits)
  ON CONFLICT (organization_id, name) DO NOTHING;
  GET DIAGNOSTICS n_tier = ROW_COUNT;

  -- Programa de referidos (UNIQUE (organization_id, name); CHECKs verificados:
  -- reward_type ∈ credit|discount|cash|gift, reward_to ∈ referrer|referred|both)
  INSERT INTO referral_programs (organization_id, name, description, reward_type, reward_amount, reward_to, is_active)
  VALUES (p_org_id, 'Referidos de clientes', 'El cliente que refiere recibe un descuento cuando el referido se convierte en cliente', 'discount', 10, 'referrer', true)
  ON CONFLICT (organization_id, name) DO NOTHING;
  GET DIAGNOSTICS n_ref = ROW_COUNT;

  -- Etiquetas de llamada (UNIQUE (organization_id, name)); las usa el análisis de F4
  INSERT INTO call_tags (organization_id, name, color, category, is_auto, rules)
  SELECT p_org_id, t.name, t.color, t.category, t.is_auto, t.rules::jsonb
    FROM (VALUES
      ('Interesado','#16a34a','outcome',true,'{"sentiment":"positive"}'),
      ('Objeción de precio','#f59e0b','objection',true,'{"objection_category":"precio"}'),
      ('Competencia mencionada','#8b5cf6','signal',true,'{"has_competitors":true}'),
      ('Decisor identificado','#0ea5e9','signal',true,'{"decision_maker_identified":true}'),
      ('Sin respuesta','#6b7280','outcome',false,'{}'),
      ('Buzón de voz','#6b7280','outcome',false,'{}'),
      ('Seguimiento requerido','#ef4444','next_step',true,'{"has_next_steps":true}')
    ) AS t(name, color, category, is_auto, rules)
  ON CONFLICT (organization_id, name) DO NOTHING;
  GET DIAGNOSTICS n_tag = ROW_COUNT;

  RETURN jsonb_build_object(
    'organization_id', p_org_id,
    'verticals', n_vert, 'icp_profiles', n_icp, 'scoring_configs', n_scor,
    'health_score_configs', n_heal, 'objections', n_obj, 'discovery_templates', n_disc,
    'onboarding_templates', n_onb, 'partner_tiers', n_tier, 'referral_programs', n_ref,
    'call_tags', n_tag
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_crm_seed_defaults(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_crm_seed_defaults(integer) TO service_role;

COMMENT ON FUNCTION public.fn_crm_seed_defaults(integer) IS
  'Siembra la configuración por defecto del CRM que le falte a una organización (idempotente). La llama el trigger de activación del módulo crm y el backfill inicial.';

-- Trigger: al activar el módulo crm, sembrar.
CREATE OR REPLACE FUNCTION public.fn_on_crm_module_activated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.module_code = 'crm' AND NEW.is_active IS TRUE
     AND (TG_OP = 'INSERT' OR OLD.is_active IS DISTINCT FROM TRUE) THEN
    PERFORM public.fn_crm_seed_defaults(NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_on_crm_module_activated() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_crm_module_activated_seed ON public.organization_modules;
CREATE TRIGGER trg_crm_module_activated_seed
  AFTER INSERT OR UPDATE OF is_active ON public.organization_modules
  FOR EACH ROW EXECUTE FUNCTION public.fn_on_crm_module_activated();

-- Backfill: toda organización con el CRM activo o con pipeline.
SELECT public.fn_crm_seed_defaults(o.id)
  FROM (
    SELECT organization_id AS id FROM public.organization_modules WHERE module_code = 'crm' AND is_active
    UNION
    SELECT DISTINCT organization_id FROM public.pipelines
  ) o;
