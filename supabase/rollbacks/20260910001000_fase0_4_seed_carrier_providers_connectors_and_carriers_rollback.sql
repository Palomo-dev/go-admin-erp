-- 20260910001000_fase0_4_seed_carrier_providers_connectors_and_carriers_rollback.sql
-- Revierte 20260910001000_fase0_4_seed_carrier_providers_connectors_and_carriers.sql
--
-- Borra en orden inverso de dependencia y SÓLO lo que sembró la migración: las
-- transportadoras marcadas con metadata.seeded_by, los connectors y providers con
-- metadata.subcategory='carrier'.
--
-- ADVERTENCIA sobre datos: si después del seed el comerciante activó alguna de estas
-- transportadoras, le cargó credenciales (integration_connections + credentials) o le
-- asignó envíos (shipments.carrier_id), este rollback NO las borra: los DELETE de abajo
-- fallarán por clave foránea o dejarán filas colgadas según el caso. Comprueba antes:
--   select count(*) from transport_carriers where metadata->>'seeded_by' = 'GO-1 fase 0.4' and api_credentials_ref is not null;
--   select count(*) from shipments s join transport_carriers c on c.id = s.carrier_id where c.metadata->>'seeded_by' = 'GO-1 fase 0.4';
-- Si alguno es > 0, no apliques este rollback tal cual.

DELETE FROM public.transport_carriers
 WHERE metadata->>'seeded_by' = 'GO-1 fase 0.4'
   AND api_credentials_ref IS NULL;

DELETE FROM public.integration_connectors ico
 USING public.integration_providers ip
 WHERE ico.provider_id = ip.id
   AND ip.code IN ('coordinadora','envia','servientrega','interrapidisimo')
   AND ico.metadata->>'subcategory' = 'carrier'
   AND NOT EXISTS (SELECT 1 FROM public.integration_connections icn WHERE icn.connector_id = ico.id);

DELETE FROM public.integration_providers ip
 WHERE ip.code IN ('coordinadora','envia','servientrega','interrapidisimo')
   AND ip.metadata->>'subcategory' = 'carrier'
   AND NOT EXISTS (SELECT 1 FROM public.integration_connectors ico WHERE ico.provider_id = ip.id);
