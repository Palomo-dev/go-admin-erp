-- Datos de prueba para el Kanban de Oportunidades CRM
-- NOTA: Reemplaza 'tu_organization_id' con el ID de la organización activa en tu instancia

-- 1. Insertar Pipeline de prueba (si no existe)
INSERT INTO pipelines (id, name, organization_id, is_default, created_at)
SELECT 
  'test-pipeline-id', 
  'Pipeline de Ventas', 
  organization_id, 
  true, 
  NOW()
FROM (
  SELECT organization_id 
  FROM (VALUES 
    ((SELECT COALESCE(
      (SELECT id::integer FROM organizations LIMIT 1), 
      1
    )::integer)) 
  ) AS t(organization_id)
) AS org
WHERE NOT EXISTS (
  SELECT 1 FROM pipelines 
  WHERE organization_id = org.organization_id 
  AND is_default = true
);

-- 2. Insertar Etapas de Pipeline (si no existen)
INSERT INTO stages (id, name, pipeline_id, position, probability, created_at)
SELECT 
  'stage-lead-id',
  'Lead',
  'test-pipeline-id',
  10,
  10,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM stages 
  WHERE id = 'stage-lead-id'
);

INSERT INTO stages (id, name, pipeline_id, position, probability, created_at)
SELECT 
  'stage-contact-id',
  'Contacto Inicial',
  'test-pipeline-id',
  20,
  25,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM stages 
  WHERE id = 'stage-contact-id'
);

INSERT INTO stages (id, name, pipeline_id, position, probability, created_at)
SELECT 
  'stage-proposal-id',
  'Propuesta',
  'test-pipeline-id',
  30,
  50,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM stages 
  WHERE id = 'stage-proposal-id'
);

INSERT INTO stages (id, name, pipeline_id, position, probability, created_at)
SELECT 
  'stage-negotiation-id',
  'Negociación',
  'test-pipeline-id',
  40,
  75,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM stages 
  WHERE id = 'stage-negotiation-id'
);

INSERT INTO stages (id, name, pipeline_id, position, probability, created_at)
SELECT 
  'stage-won-id',
  'Ganado',
  'test-pipeline-id',
  1000,
  100,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM stages 
  WHERE id = 'stage-won-id'
);

INSERT INTO stages (id, name, pipeline_id, position, probability, created_at)
SELECT 
  'stage-lost-id',
  'Perdido',
  'test-pipeline-id',
  999,
  0,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM stages 
  WHERE id = 'stage-lost-id'
);

-- 3. Insertar clientes de prueba (si no existen)
INSERT INTO customers (id, name, email, phone, organization_id, created_at)
SELECT 
  'customer-1-id',
  'Empresa ABC',
  'contacto@empresaabc.com',
  '555-1234',
  organization_id,
  NOW()
FROM (
  SELECT organization_id 
  FROM (VALUES 
    ((SELECT COALESCE(
      (SELECT id::integer FROM organizations LIMIT 1), 
      1
    )::integer)) 
  ) AS t(organization_id)
) AS org
WHERE NOT EXISTS (
  SELECT 1 FROM customers 
  WHERE id = 'customer-1-id'
);

INSERT INTO customers (id, name, email, phone, organization_id, created_at)
SELECT 
  'customer-2-id',
  'Comercial XYZ',
  'info@comercialxyz.com',
  '555-5678',
  organization_id,
  NOW()
FROM (
  SELECT organization_id 
  FROM (VALUES 
    ((SELECT COALESCE(
      (SELECT id::integer FROM organizations LIMIT 1), 
      1
    )::integer)) 
  ) AS t(organization_id)
) AS org
WHERE NOT EXISTS (
  SELECT 1 FROM customers 
  WHERE id = 'customer-2-id'
);

INSERT INTO customers (id, name, email, phone, organization_id, created_at)
SELECT 
  'customer-3-id',
  'Industrias 123',
  'ventas@industrias123.com',
  '555-9012',
  organization_id,
  NOW()
FROM (
  SELECT organization_id 
  FROM (VALUES 
    ((SELECT COALESCE(
      (SELECT id::integer FROM organizations LIMIT 1), 
      1
    )::integer)) 
  ) AS t(organization_id)
) AS org
WHERE NOT EXISTS (
  SELECT 1 FROM customers 
  WHERE id = 'customer-3-id'
);

-- 4. Insertar oportunidades de prueba

-- Oportunidad 1 - Etapa Lead
INSERT INTO opportunities (
  id, name, amount, currency, expected_close_date, 
  customer_id, stage_id, status, organization_id, 
  created_by, created_at
)
SELECT 
  'opp-1-id',
  'Proyecto de Software ERP',
  15000000,
  'COP',
  (NOW() + INTERVAL '30 days')::date,
  'customer-1-id',
  'stage-lead-id',
  'active',
  organization_id,
  (SELECT id FROM auth.users LIMIT 1),
  NOW()
FROM (
  SELECT organization_id 
  FROM (VALUES 
    ((SELECT COALESCE(
      (SELECT id::integer FROM organizations LIMIT 1), 
      1
    )::integer)) 
  ) AS t(organization_id)
) AS org
WHERE NOT EXISTS (
  SELECT 1 FROM opportunities 
  WHERE id = 'opp-1-id'
);

-- Oportunidad 2 - Etapa Contacto Inicial
INSERT INTO opportunities (
  id, name, amount, currency, expected_close_date, 
  customer_id, stage_id, status, organization_id, 
  created_by, created_at
)
SELECT 
  'opp-2-id',
  'Servicio de Consultoría Financiera',
  7500000,
  'COP',
  (NOW() + INTERVAL '45 days')::date,
  'customer-2-id',
  'stage-contact-id',
  'active',
  organization_id,
  (SELECT id FROM auth.users LIMIT 1),
  NOW()
FROM (
  SELECT organization_id 
  FROM (VALUES 
    ((SELECT COALESCE(
      (SELECT id::integer FROM organizations LIMIT 1), 
      1
    )::integer)) 
  ) AS t(organization_id)
) AS org
WHERE NOT EXISTS (
  SELECT 1 FROM opportunities 
  WHERE id = 'opp-2-id'
);

-- Oportunidad 3 - Etapa Propuesta
INSERT INTO opportunities (
  id, name, amount, currency, expected_close_date, 
  customer_id, stage_id, status, organization_id, 
  created_by, created_at
)
SELECT 
  'opp-3-id',
  'Desarrollo App Móvil',
  22000000,
  'COP',
  (NOW() + INTERVAL '60 days')::date,
  'customer-3-id',
  'stage-proposal-id',
  'active',
  organization_id,
  (SELECT id FROM auth.users LIMIT 1),
  NOW()
FROM (
  SELECT organization_id 
  FROM (VALUES 
    ((SELECT COALESCE(
      (SELECT id::integer FROM organizations LIMIT 1), 
      1
    )::integer)) 
  ) AS t(organization_id)
) AS org
WHERE NOT EXISTS (
  SELECT 1 FROM opportunities 
  WHERE id = 'opp-3-id'
);

-- Oportunidad 4 - Etapa Negociación
INSERT INTO opportunities (
  id, name, amount, currency, expected_close_date, 
  customer_id, stage_id, status, organization_id, 
  created_by, created_at
)
SELECT 
  'opp-4-id',
  'Implementación CRM Empresarial',
  35000000,
  'COP',
  (NOW() + INTERVAL '15 days')::date,
  'customer-1-id',
  'stage-negotiation-id',
  'active',
  organization_id,
  (SELECT id FROM auth.users LIMIT 1),
  NOW()
FROM (
  SELECT organization_id 
  FROM (VALUES 
    ((SELECT COALESCE(
      (SELECT id::integer FROM organizations LIMIT 1), 
      1
    )::integer)) 
  ) AS t(organization_id)
) AS org
WHERE NOT EXISTS (
  SELECT 1 FROM opportunities 
  WHERE id = 'opp-4-id'
);

-- Oportunidad 5 - Etapa Ganado
INSERT INTO opportunities (
  id, name, amount, currency, expected_close_date, 
  customer_id, stage_id, status, organization_id, 
  created_by, created_at
)
SELECT 
  'opp-5-id',
  'Soporte TI Anual',
  18000000,
  'COP',
  (NOW() - INTERVAL '5 days')::date,
  'customer-2-id',
  'stage-won-id',
  'won',
  organization_id,
  (SELECT id FROM auth.users LIMIT 1),
  NOW()
FROM (
  SELECT organization_id 
  FROM (VALUES 
    ((SELECT COALESCE(
      (SELECT id::integer FROM organizations LIMIT 1), 
      1
    )::integer)) 
  ) AS t(organization_id)
) AS org
WHERE NOT EXISTS (
  SELECT 1 FROM opportunities 
  WHERE id = 'opp-5-id'
);

-- Asegurar que existan las tablas para automatizaciones
CREATE TABLE IF NOT EXISTS opportunity_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id TEXT REFERENCES opportunities(id),
  organization_id INTEGER NOT NULL,
  from_stage_id TEXT REFERENCES stages(id),
  to_stage_id TEXT REFERENCES stages(id),
  changed_at TIMESTAMP WITH TIME ZONE,
  action_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  user_id TEXT,
  related_type TEXT,
  related_id TEXT,
  type TEXT,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE
);
