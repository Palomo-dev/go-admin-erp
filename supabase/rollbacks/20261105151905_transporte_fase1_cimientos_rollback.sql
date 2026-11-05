-- Reversión de 20261105151905_transporte_fase1_cimientos.sql.
-- Solo para deshacer la Fase 1 antes de que existan datos en las tablas nuevas (en ese momento
-- solo hay estructura y catálogo). Los envíos y transportadoras existentes no cambian.

alter table public.products drop column if exists preferred_supplier_product_id;
drop table if exists public.supplier_products;
drop table if exists public.municipality_provider_codes;
drop table if exists public.shipment_costs;
drop table if exists public.shipping_settings;
alter table public.categories drop column if exists default_weight_kg;

alter table public.transport_events drop constraint if exists transport_events_canonical_status_check;
alter table public.transport_events drop column if exists canonical_status, drop column if exists provider_status;

drop index if exists public.idx_shipments_next_track_at;
drop index if exists public.idx_shipments_integration_connection;
alter table public.shipments drop constraint if exists shipments_fulfillment_provider_check;
alter table public.shipments drop constraint if exists shipments_label_status_check;
alter table public.shipments drop constraint if exists shipments_cod_status_check;
alter table public.shipments
  drop column if exists fulfillment_provider,
  drop column if exists integration_connection_id,
  drop column if exists provider_ref,
  drop column if exists label_status,
  drop column if exists label_error,
  drop column if exists cod_status,
  drop column if exists last_tracked_at,
  drop column if exists next_track_at;

-- Dropi y Effi (sin conexiones: si hubiera alguna, el delete del conector falla por FK y hay que
-- revisarla antes).
delete from public.integration_connectors where code in ('dropi', 'effi');
delete from public.integration_providers where code in ('dropi', 'effi');

-- Conectores de transportadoras: capacidades y nombres de antes.
update public.integration_connectors
   set capabilities = '{"pull": true, "push": true, "label": true, "quote": true, "webhooks": true}'::jsonb,
       metadata = metadata - 'fuente_capacidades',
       updated_at = now()
 where code in ('coordinadora', 'servientrega', 'envia', 'interrapidisimo');
update public.integration_connectors set name = 'Envía — Carga nacional', updated_at = now() where code = 'envia';
update public.integration_providers
   set name = 'Envía', metadata = metadata - 'aclaracion', updated_at = now()
 where code = 'envia';

alter table public.integration_connectors drop column if exists settings_schema;
