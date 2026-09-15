-- 20260910001000_fase0_4_seed_carrier_providers_connectors_and_carriers.sql
-- Versión aplicada en Supabase: 20260910002313 (vía MCP, proyecto jgmgphmzusbluqhuqihj).
-- Versionada a posteriori: se aplicó bajo la regla anterior ("cero .sql en el repo").
--
-- Fase 0.4 (GO-1) — Registro de las 4 transportadoras colombianas.
--
-- Tres capas, todas aditivas e idempotentes (ON CONFLICT DO NOTHING):
--   integration_providers   → el proveedor como tal
--   integration_connectors  → qué sabe hacer y en qué países
--   transport_carriers      → la transportadora dentro de cada organización
--
-- category='delivery' ya está admitido por el CHECK de integration_providers y lo usan
-- los marketplaces de domicilios. Para no confundir un marketplace con una transportadora
-- de carga, estas cuatro llevan metadata.subcategory='carrier'.
--
-- Las 8 filas de transport_carriers entran con is_active=false a propósito: no aparecen
-- en ningún selector del ERP hasta que el comerciante las active y cargue credenciales.
--
-- docs_url y tracking_url_template quedan en NULL DELIBERADAMENTE. Inventar la URL de
-- rastreo público de cada transportadora mandaría a compradores reales a un 404, y el
-- formato exacto sólo se confirma con la documentación oficial vigente — que es trabajo
-- de GO-8..GO-11, donde además hay que citarla. Se rellenan ahí, no aquí.
--
-- Las organizaciones destino (113 y 135) son las dos tiendas de e-commerce con ventas.
--
-- Rollback: supabase/rollbacks/20260910001000_fase0_4_seed_carrier_providers_connectors_and_carriers_rollback.sql

INSERT INTO public.integration_providers (code, name, category, auth_type, website_url, is_active, metadata)
VALUES
  ('coordinadora',    'Coordinadora',    'delivery', 'api_key', 'https://www.coordinadora.com',    true, '{"subcategory":"carrier","country":"CO"}'::jsonb),
  ('envia',           'Envía',           'delivery', 'api_key', 'https://envia.co',                true, '{"subcategory":"carrier","country":"CO"}'::jsonb),
  ('servientrega',    'Servientrega',    'delivery', 'api_key', 'https://www.servientrega.com',    true, '{"subcategory":"carrier","country":"CO"}'::jsonb),
  ('interrapidisimo', 'Interrapidísimo', 'delivery', 'api_key', 'https://www.interrapidisimo.com', true, '{"subcategory":"carrier","country":"CO"}'::jsonb)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.integration_connectors (provider_id, code, name, supported_countries, capabilities, required_scopes, is_active, metadata)
SELECT ip.id,
       ip.code,
       ip.name || ' — Carga nacional',
       ARRAY['CO'],
       '{"pull":true,"push":true,"webhooks":true,"quote":true,"label":true}'::jsonb,
       ARRAY[]::text[],
       true,
       '{"subcategory":"carrier"}'::jsonb
FROM public.integration_providers ip
WHERE ip.code IN ('coordinadora','envia','servientrega','interrapidisimo')
ON CONFLICT (provider_id, code) DO NOTHING;

INSERT INTO public.transport_carriers
  (organization_id, name, code, carrier_type, service_type, api_provider, tracking_url_template, is_active, metadata)
SELECT o.org_id,
       c.name,
       c.code,
       'third_party',
       'cargo',
       c.code,
       NULL,          -- ver nota de cabecera: se rellena con documentación oficial
       false,         -- invisible hasta que el comerciante la active
       jsonb_build_object('subcategory','carrier','seeded_by','GO-1 fase 0.4')
FROM (VALUES
        ('Coordinadora',    'coordinadora'),
        ('Envía',           'envia'),
        ('Servientrega',    'servientrega'),
        ('Interrapidísimo', 'interrapidisimo')
     ) AS c(name, code)
CROSS JOIN (VALUES (113), (135)) AS o(org_id)
ON CONFLICT (organization_id, code) DO NOTHING;
