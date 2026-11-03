-- 20261103233000_catalogo_integraciones.sql
--
-- Reconstruye el catálogo de integraciones (integration_providers + integration_connectors)
-- en el proyecto nuevo (taqjemqjtumhwptchcxk). En el proyecto viejo (jgmgphmzusbluqhuqihj,
-- borrado) estos proveedores se crearon a mano sin migración; aquí sólo entran los que el
-- código del ERP referencia por code. No se encontró respaldo del catálogo viejo: los codes
-- salen del código (fuente indicada en cada fila).
--
-- Idempotente: ON CONFLICT DO NOTHING sobre las claves únicas reales
--   integration_providers_code_key (code) e integration_connectors_provider_id_code_key (provider_id, code).
-- No toca las 4 transportadoras (coordinadora, envia, servientrega, interrapidisimo).
-- Todas las filas llevan metadata.seeded_by = 'catalogo-integraciones-20261103' para el rollback.
-- logo_url queda NULL: la UI toma el logo de PROVIDER_CONFIGS (AvailableProviders.tsx).
--
-- Rollback: supabase/rollbacks/20261103233000_catalogo_integraciones_rollback.sql

INSERT INTO public.integration_providers (code, name, category, auth_type, website_url, docs_url, is_active, metadata)
VALUES
  -- ── Pagos ────────────────────────────────────────────────────────────────
  -- wompi: AvailableProviders.tsx, StepCredentials.tsx, conexiones/nueva/page.tsx, integrations/wompi/*, api/integrations/wompi/webhook
  ('wompi',       'Wompi',        'payments', 'api_key', 'https://wompi.com',              'https://docs.wompi.co',                    true, '{"country":"CO","seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- bold: AvailableProviders.tsx, integrations/bold/*, qrShared/cobroQrServidor.ts (bold_link, bold_pos)
  ('bold',        'Bold',         'payments', 'api_key', 'https://bold.co',                'https://developers.bold.co',               true, '{"country":"CO","seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- mercadopago: AvailableProviders.tsx, StepCredentials.tsx, integrations/mercadopago/*, accesoIntegraciones.ts (mp_checkout)
  ('mercadopago', 'Mercado Pago', 'payments', 'api_key', 'https://www.mercadopago.com.co', 'https://www.mercadopago.com.co/developers', true, '{"seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- payu: AvailableProviders.tsx, StepCredentials.tsx, integrations/payu/*, accesoIntegraciones.ts (payu_co)
  ('payu',        'PayU',         'payments', 'api_key', 'https://colombia.payu.com',      'https://developers.payulatam.com',         true, '{"country":"CO","seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- stripe: AvailableProviders.tsx, StepCredentials.tsx, integrations/stripe/*, accesoIntegraciones.ts (stripe_payments)
  ('stripe',      'Stripe',       'payments', 'api_key', 'https://stripe.com',             'https://docs.stripe.com',                  true, '{"seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- paypal: AvailableProviders.tsx, StepCredentials.tsx, integrations/paypal/*, accesoIntegraciones.ts (paypal_checkout)
  ('paypal',      'PayPal',       'payments', 'oauth2',  'https://www.paypal.com',         'https://developer.paypal.com',             true, '{"seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- bancolombia / breb / redeban: StepCredentials.tsx, integrations/{bancolombia,breb,redeban}/*, qrShared/*, payfac/masterCredentialsService.ts,
  --   docs/integraciones/bancolombia-breb-redeban-qr-pagos.md §7.1 (redeban: 'auth_token' del doc no lo admite el CHECK → 'custom')
  ('bancolombia', 'Bancolombia',  'payments', 'oauth2',  'https://www.bancolombia.com',    'https://soportedevs.bancolombia.com',      true, '{"country":"CO","products":["qr_code","payment_button","transactional_information"],"seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  ('breb',        'Bre-B (Banco de la República)', 'payments', 'oauth2', 'https://www.banrep.gov.co', 'https://docs.mono.la/docs/guides/breb-participant', true, '{"country":"CO","providers":["mono"],"seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  ('redeban',     'Redeban Multicolor', 'payments', 'custom', 'https://www.redeban.com',   'https://developers.redeban.com/api/',      true, '{"country":"CO","seeded_by":"catalogo-integraciones-20261103"}'::jsonb),

  -- ── Mensajería ───────────────────────────────────────────────────────────
  -- whatsapp: AvailableProviders.tsx, StepCredentials.tsx (embeddedSignup), conexiones/nueva/page.tsx, integrations/whatsapp/*, notificaciones/canales/types.ts
  ('whatsapp',    'WhatsApp Business', 'messaging', 'api_key', 'https://business.whatsapp.com', 'https://developers.facebook.com/docs/whatsapp/cloud-api', true, '{"seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- twilio: AvailableProviders.tsx, conexiones/page.tsx (redirige a /app/integraciones/twilio), integrations/twilio/*, notificaciones/canales/types.ts
  ('twilio',      'Twilio',       'messaging', 'custom', 'https://www.twilio.com',         'https://www.twilio.com/docs',              true, '{"managed_by":"goadmin","seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- sendgrid: AvailableProviders.tsx, StepCredentials.tsx, integrations/sendgrid/sendgridService.ts (sendgrid_email)
  ('sendgrid',    'SendGrid',     'messaging', 'api_key', 'https://sendgrid.com',          'https://www.twilio.com/docs/sendgrid',     true, '{"seeded_by":"catalogo-integraciones-20261103"}'::jsonb),

  -- ── Social / Ads ─────────────────────────────────────────────────────────
  -- meta: AvailableProviders.tsx, StepCredentials.tsx (oauth facebook), api/integrations/meta/oauth/callback (meta_marketing)
  ('meta',        'Meta (Facebook / Instagram)', 'social', 'oauth2', 'https://www.facebook.com/business', 'https://developers.facebook.com/docs/marketing-apis', true, '{"seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- tiktok: AvailableProviders.tsx, StepCredentials.tsx, api/integrations/tiktok/oauth/callback (tiktok_marketing)
  ('tiktok',      'TikTok',       'social', 'oauth2', 'https://ads.tiktok.com',            'https://business-api.tiktok.com/portal/docs', true, '{"seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- google_ads: AvailableProviders.tsx, StepCredentials.tsx, google-ads/googleAdsConfig.ts (GOOGLE_ADS_CONNECTOR_CODE='google_ads')
  ('google_ads',  'Google Ads',   'ads',    'oauth2', 'https://ads.google.com',            'https://developers.google.com/google-ads/api/docs', true, '{"seeded_by":"catalogo-integraciones-20261103"}'::jsonb),

  -- ── OTA (la UI redirige category='ota' al Channel Manager del PMS; otaBridgeService busca conectores '%_ical') ──
  -- booking: AvailableProviders.tsx, ProviderCard.tsx, integrations/booking/*, docs/integraciones/booking-connectivity.md (booking_ota + booking_ical)
  ('booking',     'Booking.com',  'ota', 'oauth2', 'https://www.booking.com',              'https://developers.booking.com/connectivity', true, '{"seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- expedia: AvailableProviders.tsx, ProviderCard.tsx, integrations/expedia/*, docs/integraciones/expedia-connectivity.md (expedia_ota + expedia_ical); vrbo → expedia en otaBridgeService.ts
  ('expedia',     'Expedia',      'ota', 'api_key', 'https://www.expedia.com',             'https://developers.expediagroup.com',      true, '{"seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- tripadvisor: AvailableProviders.tsx, ProviderCard.tsx, integrations/tripadvisor/*, docs/integraciones/tripadvisor-content-api.md (tripadvisor_ical + tripadvisor_content)
  ('tripadvisor', 'Tripadvisor',  'ota', 'api_key', 'https://www.tripadvisor.com',         'https://tripadvisor-content-api.readme.io', true, '{"seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- airbnb: AvailableProviders.tsx, ProviderCard.tsx OTA_PROVIDERS, otaBridgeService.ts (sólo iCal)
  ('airbnb',      'Airbnb',       'ota', 'custom',  'https://www.airbnb.com',              NULL,                                       true, '{"sync":"ical","seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  -- google_vacation_rentals: AvailableProviders.tsx, ProviderCard.tsx, otaBridgeService.ts (google_vacation → google_vacation_rentals)
  ('google_vacation_rentals', 'Google Vacation Rentals', 'ota', 'custom', 'https://www.google.com/travel', NULL,                 true, '{"sync":"ical","seeded_by":"catalogo-integraciones-20261103"}'::jsonb),

  -- ── Delivery (marketplaces de domicilios) — SIN servicio implementado ──────
  -- rappi / ifood / ubereats: sólo existen en PROVIDER_CONFIGS de AvailableProviders.tsx (logo/color).
  -- No hay servicio, ruta API ni formulario de credenciales: entran con is_active=false y
  -- metadata.status='coming_soon' (la tabla no tiene columna de estado; getProviders filtra is_active=true,
  -- así que no aparecen en /app/integraciones/conexiones hasta que exista la integración).
  ('rappi',       'Rappi',        'delivery', 'api_key', 'https://www.rappi.com.co',       NULL, false, '{"status":"coming_soon","subcategory":"marketplace","seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  ('ifood',       'iFood',        'delivery', 'api_key', 'https://www.ifood.com.br',       NULL, false, '{"status":"coming_soon","subcategory":"marketplace","seeded_by":"catalogo-integraciones-20261103"}'::jsonb),
  ('ubereats',    'Uber Eats',    'delivery', 'api_key', 'https://www.ubereats.com',       NULL, false, '{"status":"coming_soon","subcategory":"marketplace","seeded_by":"catalogo-integraciones-20261103"}'::jsonb)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.integration_connectors (provider_id, code, name, supported_countries, capabilities, required_scopes, is_active, metadata)
SELECT ip.id, v.code, v.name, v.countries, v.capabilities::jsonb, v.scopes, v.is_active,
       '{"seeded_by":"catalogo-integraciones-20261103"}'::jsonb
FROM (VALUES
  -- provider       connector code          nombre                                   países          capabilities                                                                         scopes  activo
  -- accesoIntegraciones.ts CONECTORES, webOrderChangesServer.ts CONECTORES_LINK, webhookSecurity.ts, api/integrations/wompi/webhook
  ('wompi',       'wompi_co',               'Wompi Colombia',                         ARRAY['CO'],    '{"pull":true,"push":true,"realtime":false,"webhooks":true,"qr":true}',                '{}'::text[], true),
  -- cobroQrServidor.ts METODOS_COBRO_QR (bold_link, bold_qr→bold_pos)
  ('bold',        'bold_link',              'Bold — Link de pago',                    ARRAY['CO'],    '{"pull":true,"push":true,"realtime":false,"webhooks":true}',                          '{}'::text[], true),
  ('bold',        'bold_pos',               'Bold — Datáfono / QR',                   ARRAY['CO'],    '{"pull":true,"push":true,"realtime":false,"webhooks":true,"qr":true}',                '{}'::text[], true),
  -- accesoIntegraciones.ts / membresias/enlacePago.ts PASARELAS_EN_LINEA
  ('mercadopago', 'mp_checkout',            'Mercado Pago Checkout',                  ARRAY['CO','MX','AR','BR','CL','PE','UY'], '{"pull":true,"push":true,"realtime":false,"webhooks":true}', '{}'::text[], true),
  ('payu',        'payu_co',                'PayU Colombia',                          ARRAY['CO'],    '{"pull":true,"push":true,"realtime":false,"webhooks":true}',                          '{}'::text[], true),
  ('stripe',      'stripe_payments',        'Stripe Payments',                        '{}'::text[],   '{"pull":true,"push":true,"realtime":false,"webhooks":true}',                          '{}'::text[], true),
  ('paypal',      'paypal_checkout',        'PayPal Checkout',                        '{}'::text[],   '{"pull":true,"push":true,"realtime":false,"webhooks":true}',                          '{}'::text[], true),
  -- cobroQrServidor.ts, webhookSecurity.ts PROVIDER_TO_CONNECTOR, credentialRotation.ts, masterCredentialsService.ts
  ('bancolombia', 'bancolombia_qr',         'Bancolombia QR Code',                    ARRAY['CO'],    '{"pull":true,"push":true,"realtime":false,"webhooks":true,"qr":true}',                ARRAY['Transfer-Intention:write:app','Transfer-Intention:read:app'], true),
  ('breb',        'breb_mono',              'Bre-B vía Mono',                         ARRAY['CO'],    '{"pull":true,"push":true,"realtime":true,"webhooks":true,"qr":true}',                 ARRAY['collections','outgoing_transfers'], true),
  ('redeban',     'redeban_qr',             'Redeban QR Dinámico',                    ARRAY['CO'],    '{"pull":true,"push":true,"realtime":false,"webhooks":true,"qr":true}',                '{}'::text[], true),
  -- whatsapp: el código no filtra por connector code; 'whatsapp_cloud' es el source que usa whatsappCloudService.ts (inferido)
  ('whatsapp',    'whatsapp_cloud',         'WhatsApp Cloud API',                     '{}'::text[],   '{"pull":true,"push":true,"realtime":true,"webhooks":true}',                           '{}'::text[], true),
  -- twilio: gestionado por GO Admin desde /app/integraciones/twilio; code inferido
  ('twilio',      'twilio_messaging',       'Twilio SMS / WhatsApp / Voz',            '{}'::text[],   '{"pull":false,"push":true,"realtime":true,"webhooks":true}',                          '{}'::text[], true),
  -- sendgridService.ts / api/integrations/sendgrid/webhook (eq integration_connectors.code 'sendgrid_email')
  ('sendgrid',    'sendgrid_email',         'SendGrid Email',                         '{}'::text[],   '{"pull":false,"push":true,"realtime":false,"webhooks":true}',                         '{}'::text[], true),
  -- marketingAccess.ts MarketingConnectorCode
  ('meta',        'meta_marketing',         'Meta Marketing (Pixel / Conversions API)', '{}'::text[], '{"pull":true,"push":true,"realtime":false,"webhooks":false}',                         '{}'::text[], true),
  ('tiktok',      'tiktok_marketing',       'TikTok Marketing (Events API)',          '{}'::text[],   '{"pull":true,"push":true,"realtime":false,"webhooks":false}',                         '{}'::text[], true),
  ('google_ads',  'google_ads',             'Google Ads',                             '{}'::text[],   '{"pull":true,"push":true,"realtime":false,"webhooks":false}',                         '{}'::text[], true),
  -- OTAs: otaBridgeService.ts (like '%_ical'), docs booking/expedia/tripadvisor
  ('booking',     'booking_ical',           'Booking.com iCal',                       '{}'::text[],   '{"pull":true,"push":true,"realtime":false,"webhooks":false}',                         '{}'::text[], true),
  ('booking',     'booking_ota',            'Booking.com Connectivity API',           '{}'::text[],   '{"pull":true,"push":true,"realtime":true,"webhooks":true}',                           '{}'::text[], true),
  ('expedia',     'expedia_ical',           'Expedia iCal',                           '{}'::text[],   '{"pull":true,"push":true,"realtime":false,"webhooks":false}',                         '{}'::text[], true),
  ('expedia',     'expedia_ota',            'Expedia Connectivity API',               '{}'::text[],   '{"pull":true,"push":true,"realtime":true,"webhooks":true,"graphql":true}',            '{}'::text[], true),
  ('tripadvisor', 'tripadvisor_ical',       'Tripadvisor iCal',                       '{}'::text[],   '{"pull":true,"push":true,"realtime":false,"webhooks":false}',                         '{}'::text[], true),
  ('tripadvisor', 'tripadvisor_content',    'Tripadvisor Content API',                '{}'::text[],   '{"pull":true,"push":false,"realtime":false,"webhooks":false}',                        '{}'::text[], true),
  ('airbnb',      'airbnb_ical',            'Airbnb iCal',                            '{}'::text[],   '{"pull":true,"push":true,"realtime":false,"webhooks":false}',                         '{}'::text[], true),
  ('google_vacation_rentals', 'google_vacation_rentals_ical', 'Google Vacation Rentals iCal', '{}'::text[], '{"pull":true,"push":true,"realtime":false,"webhooks":false}',              '{}'::text[], true)
) AS v(provider_code, code, name, countries, capabilities, scopes, is_active)
JOIN public.integration_providers ip ON ip.code = v.provider_code
ON CONFLICT (provider_id, code) DO NOTHING;
