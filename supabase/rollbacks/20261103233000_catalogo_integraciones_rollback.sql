-- 20261103233000_catalogo_integraciones_rollback.sql
-- Revierte 20261103233000_catalogo_integraciones.sql
--
-- Borra SÓLO las filas sembradas por esa migración (metadata.seeded_by) y sólo si no tienen
-- integration_connections (FK ON DELETE RESTRICT). No toca las 4 transportadoras.
-- Un proveedor que conserve algún conector (porque tiene conexiones) no se borra.

DELETE FROM public.integration_connectors ico
 USING public.integration_providers ip
 WHERE ico.provider_id = ip.id
   AND ip.code IN ('wompi','bold','mercadopago','payu','stripe','paypal','bancolombia','breb','redeban',
                   'whatsapp','twilio','sendgrid','meta','tiktok','google_ads',
                   'booking','expedia','tripadvisor','airbnb','google_vacation_rentals',
                   'rappi','ifood','ubereats')
   AND ico.metadata->>'seeded_by' = 'catalogo-integraciones-20261103'
   AND NOT EXISTS (SELECT 1 FROM public.integration_connections icn WHERE icn.connector_id = ico.id);

DELETE FROM public.integration_providers ip
 WHERE ip.code IN ('wompi','bold','mercadopago','payu','stripe','paypal','bancolombia','breb','redeban',
                   'whatsapp','twilio','sendgrid','meta','tiktok','google_ads',
                   'booking','expedia','tripadvisor','airbnb','google_vacation_rentals',
                   'rappi','ifood','ubereats')
   AND ip.metadata->>'seeded_by' = 'catalogo-integraciones-20261103'
   AND NOT EXISTS (SELECT 1 FROM public.integration_connectors ico WHERE ico.provider_id = ip.id);
