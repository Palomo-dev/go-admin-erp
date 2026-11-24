-- Reversión de 20261123145549_logistica_f1_zonas_tarifas_reglas.sql (logística Fase 1, 2/5).
--
-- ADVERTENCIA: no restaura datos. Borra las zonas, su cobertura y las reglas de despacho con todo
-- su contenido, y la columna shipments.shipping_zone_id. Las tarifas de shipping_rates no se tocaron
-- (la migración solo las copió), así que siguen allí.
-- Revertir antes 4/5 y 5/5 si usan logistica_cotizar_envio.

drop function if exists public.logistica_cotizar_envio(integer, integer, jsonb, text, numeric, jsonb);
drop index if exists public.idx_shipments_shipping_zone;
alter table public.shipments drop column if exists shipping_zone_id;
drop table if exists public.delivery_rules;
drop table if exists public.shipping_zone_locations;
drop table if exists public.shipping_zones;
drop function if exists public.fn_shipping_zones_validar();
drop function if exists public.fn_logistica_punto_en_geojson(numeric, numeric, jsonb);
drop function if exists public.fn_logistica_punto_en_anillo(double precision, double precision, jsonb);
drop function if exists public.fn_logistica_normalizar(text);
