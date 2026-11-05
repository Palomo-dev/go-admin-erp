-- GO-1 · Transporte, Fase 1 — cimientos (aditivo; sin datos de clientes tocados).
--
-- Todo lo nuevo es NULL-able o tiene DEFAULT con el comportamiento de hoy:
-- * shipments / transport_events: columnas nuevas en NULL = envío propio como hasta hoy.
-- * shipping_settings: sin fila = integraciones apagadas (flag por organización, default false).
-- * Ningún envío, pedido, credencial ni transportadora existente cambia.
-- * No toca pasajeros: transport_carriers no cambia; las transportadoras se crean al conectar,
--   siempre con service_type = 'cargo'.
--
-- Decisiones (Fase 0, 4-nov-2026):
-- * La línea de tiempo del envío sigue en transport_events (la lee /tracking de la tienda y ya
--   deduplica por external_event_id): se le agregan provider_status y canonical_status en vez de
--   crear carrier_tracking_status.
-- * «envia» es Envía Colvanes (la transportadora colombiana), no envia.com.
-- * El stock de dropshipping vive solo en supplier_products (nunca en stock_levels).

-- ---------------------------------------------------------------------------
-- 1. Formularios dinámicos por conector
-- ---------------------------------------------------------------------------
alter table public.integration_connectors add column if not exists settings_schema jsonb;
comment on column public.integration_connectors.settings_schema is
  'Formulario de conexión del conector (campos, cuáles son secretos → Vault, ayuda y fuente oficial). NULL = el asistente de siempre.';

-- Envía = Envía Colvanes (documentado).
update public.integration_providers
   set name = 'Envía Colvanes',
       metadata = metadata || jsonb_build_object('aclaracion', 'Envía Colvanes, la transportadora colombiana. No es envia.com (agregador, fuera de alcance).'),
       updated_at = now()
 where code = 'envia';
update public.integration_connectors
   set name = 'Envía Colvanes — Carga nacional', updated_at = now()
 where code = 'envia';

-- Capacidades según la documentación oficial disponible (antes todas decían true, también webhooks).
update public.integration_connectors
   set capabilities = jsonb_build_object('quote', true, 'label', true, 'labelPdf', true, 'track', true, 'cancel', true, 'cod', true, 'pickup', true, 'webhook', false),
       metadata = metadata || jsonb_build_object('fuente_capacidades', 'WSDL sandbox ags 1.4 y agw guías 1.4 (4-nov-2026)'),
       updated_at = now()
 where code = 'coordinadora';
update public.integration_connectors
   set capabilities = jsonb_build_object('quote', false, 'label', true, 'labelPdf', true, 'track', false, 'cancel', true, 'cod', false, 'pickup', false, 'webhook', false),
       metadata = metadata || jsonb_build_object('fuente_capacidades', 'WSDL GeneracionGuias.asmx (4-nov-2026); cotización y rastreo son otros servicios, pendientes de doc'),
       updated_at = now()
 where code = 'servientrega';
update public.integration_connectors
   set capabilities = jsonb_build_object('quote', false, 'label', false, 'labelPdf', false, 'track', false, 'cancel', false, 'cod', false, 'pickup', false, 'webhook', false),
       metadata = metadata || jsonb_build_object('fuente_capacidades', 'Sin documentación oficial todavía'),
       updated_at = now()
 where code in ('envia', 'interrapidisimo');

-- Formularios (solo campos de la doc oficial o los que la transportadora pide por contrato).
update public.integration_connectors set settings_schema = $json${
  "version": 1,
  "fuente": "WSDL oficial: https://sandbox.coordinadora.com/ags/1.4/server.php?wsdl y https://sandboxbe.coordinadora.com/agw/ws/guias/1.4/server.php?wsdl",
  "ambientes": ["sandbox", "production"],
  "campos": [
    {"clave": "nit", "etiqueta": "NIT", "tipo": "texto", "requerido": true, "secreto": false, "ayuda": "NIT de la cuenta comercial (Cotizador y Seguimiento)."},
    {"clave": "div", "etiqueta": "División (div)", "tipo": "texto", "requerido": true, "secreto": false, "ayuda": "Código de división que entrega Coordinadora con la cuenta."},
    {"clave": "apikey", "etiqueta": "API key del cotizador", "tipo": "secreto", "requerido": true, "secreto": true},
    {"clave": "clave_cotizador", "etiqueta": "Clave del cotizador", "tipo": "secreto", "requerido": true, "secreto": true},
    {"clave": "id_cliente", "etiqueta": "Id de cliente (guías)", "tipo": "numero", "requerido": true, "secreto": false},
    {"clave": "usuario_guias", "etiqueta": "Usuario de guías", "tipo": "texto", "requerido": true, "secreto": false},
    {"clave": "clave_guias", "etiqueta": "Clave de guías", "tipo": "secreto", "requerido": true, "secreto": true},
    {"clave": "codigo_cuenta", "etiqueta": "Código de cuenta", "tipo": "numero", "requerido": false, "secreto": false, "ayuda": "El que indique Coordinadora para la cuenta (por ejemplo, flete pago)."}
  ]
}$json$::jsonb, updated_at = now() where code = 'coordinadora';

update public.integration_connectors set settings_schema = $json${
  "version": 1,
  "fuente": "WSDL oficial: http://web.servientrega.com:8081/GeneracionGuias.asmx?WSDL (AuthHeader)",
  "ambientes": ["production"],
  "campos": [
    {"clave": "login", "etiqueta": "Usuario (login)", "tipo": "texto", "requerido": true, "secreto": false},
    {"clave": "pwd", "etiqueta": "Contraseña (pwd)", "tipo": "secreto", "requerido": true, "secreto": true},
    {"clave": "id_cod_facturacion", "etiqueta": "Id_CodFacturacion", "tipo": "texto", "requerido": true, "secreto": false},
    {"clave": "nombre_cargue", "etiqueta": "Nombre_Cargue", "tipo": "texto", "requerido": true, "secreto": false}
  ]
}$json$::jsonb, updated_at = now() where code = 'servientrega';

update public.integration_connectors set settings_schema = $json${
  "version": 1,
  "fuente": "Sin documentación pública. Campos del web service corporativo según el plan de integración (usuario, contraseña, código de cuenta); se confirman con la doc de Envía Colvanes",
  "doc_pendiente": true,
  "ambientes": ["sandbox", "production"],
  "campos": [
    {"clave": "usuario", "etiqueta": "Usuario", "tipo": "texto", "requerido": true, "secreto": false},
    {"clave": "contrasena", "etiqueta": "Contraseña", "tipo": "secreto", "requerido": true, "secreto": true},
    {"clave": "codigo_cuenta", "etiqueta": "Código de cuenta", "tipo": "texto", "requerido": true, "secreto": false}
  ]
}$json$::jsonb, updated_at = now() where code = 'envia';

update public.integration_connectors set settings_schema = $json${
  "version": 1,
  "fuente": "Sin documentación oficial de cliente crédito todavía",
  "doc_pendiente": true,
  "ambientes": ["sandbox", "production"],
  "campos": []
}$json$::jsonb, updated_at = now() where code = 'interrapidisimo';

-- Dropi y Effi: proveedores de dropshipping (Fase 5). Visibles como «Próximamente».
insert into public.integration_providers (code, name, category, auth_type, website_url, docs_url, is_active, metadata)
values
  ('dropi', 'Dropi', 'delivery', 'api_key', 'https://dropi.co', null, true,
   jsonb_build_object('subcategory', 'dropshipping', 'status', 'coming_soon', 'country', 'CO')),
  ('effi', 'Effi', 'delivery', 'api_key', 'https://effi.com.co', null, true,
   jsonb_build_object('subcategory', 'dropshipping', 'status', 'coming_soon', 'country', 'CO'))
on conflict (code) do nothing;

insert into public.integration_connectors (provider_id, code, name, supported_countries, capabilities, is_active, metadata, settings_schema)
select p.id, v.code, v.name, array['CO'], '{}'::jsonb, true,
       jsonb_build_object('subcategory', 'dropshipping', 'status', 'coming_soon'),
       v.esquema
from (values
  ('dropi', 'Dropi — Dropshipping', $json${
    "version": 1,
    "fuente": "Dropi → Mis integraciones → token de la tienda; OpenAPI pendiente de TI de Dropi",
    "doc_pendiente": true,
    "ambientes": ["production"],
    "campos": [
      {"clave": "token", "etiqueta": "Token de integración", "tipo": "secreto", "requerido": true, "secreto": true},
      {"clave": "pais", "etiqueta": "País", "tipo": "seleccion", "requerido": true, "secreto": false, "opciones": ["CO"]}
    ]
  }$json$::jsonb),
  ('effi', 'Effi — Dropshipping', $json${
    "version": 1,
    "fuente": "Llave del usuario principal (Administración → Usuarios del sistema); doc de la API pendiente",
    "doc_pendiente": true,
    "ambientes": ["production"],
    "campos": [
      {"clave": "llave_api", "etiqueta": "Llave API", "tipo": "secreto", "requerido": true, "secreto": true}
    ]
  }$json$::jsonb)
) as v(code, name, esquema)
join public.integration_providers p on p.code = v.code
where not exists (select 1 from public.integration_connectors k where k.code = v.code);

-- ---------------------------------------------------------------------------
-- 2. Envíos: columnas para guías oficiales (NULL = envío propio, como hoy)
-- ---------------------------------------------------------------------------
alter table public.shipments
  add column if not exists fulfillment_provider text,
  add column if not exists integration_connection_id uuid references public.integration_connections(id) on delete set null,
  add column if not exists provider_ref text,
  add column if not exists label_status text,
  add column if not exists label_error text,
  add column if not exists cod_status text,
  add column if not exists last_tracked_at timestamptz,
  add column if not exists next_track_at timestamptz;

do $$ begin
  alter table public.shipments add constraint shipments_fulfillment_provider_check
    check (fulfillment_provider is null or fulfillment_provider in ('coordinadora', 'servientrega', 'envia', 'interrapidisimo', 'dropi', 'effi'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.shipments add constraint shipments_label_status_check
    check (label_status is null or label_status in ('pending', 'generated', 'error', 'void'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.shipments add constraint shipments_cod_status_check
    check (cod_status is null or cod_status in ('pending', 'collected', 'remitted'));
exception when duplicate_object then null; end $$;

create index if not exists idx_shipments_next_track_at on public.shipments (next_track_at)
  where next_track_at is not null;
create index if not exists idx_shipments_integration_connection on public.shipments (integration_connection_id)
  where integration_connection_id is not null;

comment on column public.shipments.fulfillment_provider is 'Quién despacha por API (transportadora o proveedor de dropshipping). NULL = envío propio.';
comment on column public.shipments.provider_ref is 'Id del envío o pedido en el proveedor (nunca inventado).';
comment on column public.shipments.label_status is 'Guía oficial: pending | generated | error | void. NULL = sin guía de proveedor.';
comment on column public.shipments.cod_status is 'Contraentrega: pending | collected | remitted. NULL = sin contraentrega.';

-- Línea de tiempo: estado del proveedor y estado canónico.
alter table public.transport_events
  add column if not exists provider_status text,
  add column if not exists canonical_status text;
do $$ begin
  alter table public.transport_events add constraint transport_events_canonical_status_check
    check (canonical_status is null or canonical_status in
      ('created', 'assigned', 'picked', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned', 'cancelled'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 3. Costos del envío (flete, comisión de recaudo, seguro…)
-- ---------------------------------------------------------------------------
create table if not exists public.shipment_costs (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  cost_type text not null check (cost_type in ('freight', 'cod_commission', 'insurance', 'other')),
  amount numeric(14, 2) not null,
  currency text not null default 'COP',
  source text not null check (source in ('quote', 'label', 'settlement', 'manual')),
  provider_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_shipment_costs_shipment on public.shipment_costs (shipment_id);
create index if not exists idx_shipment_costs_org on public.shipment_costs (organization_id);

-- ---------------------------------------------------------------------------
-- 4. Ciudades DANE ↔ catálogo de cada proveedor (global, no por organización)
-- ---------------------------------------------------------------------------
create table if not exists public.municipality_provider_codes (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  provider_code text not null,
  external_code text not null,
  external_name text,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (provider_code, municipality_id),
  unique (provider_code, external_code)
);

-- ---------------------------------------------------------------------------
-- 5. Dropshipping: productos del proveedor (stock solo aquí, nunca en stock_levels)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider_code text not null check (provider_code in ('dropi', 'effi')),
  external_product_id text not null,
  external_variant_id text not null default '',
  product_id integer references public.products(id) on delete set null,
  name text,
  sku text,
  barcode text,
  reference text,
  cost_price numeric(14, 2),
  suggested_price numeric(14, 2),
  currency text not null default 'COP',
  stock numeric(14, 3),
  weight_kg numeric(10, 3),
  length_cm numeric(10, 2),
  width_cm numeric(10, 2),
  height_cm numeric(10, 2),
  is_active boolean not null default true,
  raw jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider_code, external_product_id, external_variant_id)
);
create index if not exists idx_supplier_products_product on public.supplier_products (product_id) where product_id is not null;
create index if not exists idx_supplier_products_org_provider on public.supplier_products (organization_id, provider_code);

alter table public.products add column if not exists preferred_supplier_product_id uuid
  references public.supplier_products(id) on delete set null;
comment on column public.products.preferred_supplier_product_id is 'Dropshipping: proveedor elegido para este producto. NULL = producto propio (lo de hoy).';

-- ---------------------------------------------------------------------------
-- 6. Ajustes de envío por organización (flag) y peso por defecto
-- ---------------------------------------------------------------------------
create table if not exists public.shipping_settings (
  organization_id integer primary key references public.organizations(id) on delete cascade,
  carrier_integrations_enabled boolean not null default false,
  dropshipping_enabled boolean not null default false,
  default_weight_kg numeric(10, 3) check (default_weight_kg is null or default_weight_kg > 0),
  default_length_cm numeric(10, 2) check (default_length_cm is null or default_length_cm > 0),
  default_width_cm numeric(10, 2) check (default_width_cm is null or default_width_cm > 0),
  default_height_cm numeric(10, 2) check (default_height_cm is null or default_height_cm > 0),
  dropshipping_margin_percent numeric(6, 2) check (dropshipping_margin_percent is null or dropshipping_margin_percent >= 0),
  supplier_selection_rule text not null default 'max_margin_with_stock' check (supplier_selection_rule in ('max_margin_with_stock', 'manual')),
  allow_supplier_fallback boolean not null default false,
  supplier_stock_mode text not null default 'preferred' check (supplier_stock_mode in ('preferred', 'sum')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table public.shipping_settings is 'Ajustes de envío por organización. Sin fila = integraciones apagadas (lo de hoy).';

alter table public.categories add column if not exists default_weight_kg numeric(10, 3)
  check (default_weight_kg is null or default_weight_kg > 0);
comment on column public.categories.default_weight_kg is 'Peso por defecto de los productos de la categoría al generar una guía (si el producto no tiene peso).';

-- ---------------------------------------------------------------------------
-- 7. RLS por organización
-- ---------------------------------------------------------------------------
alter table public.shipment_costs enable row level security;
alter table public.municipality_provider_codes enable row level security;
alter table public.supplier_products enable row level security;
alter table public.shipping_settings enable row level security;

drop policy if exists shipment_costs_miembros on public.shipment_costs;
-- El costo solo puede colgar de un envío de la MISMA organización (JOIN con shipments).
create policy shipment_costs_miembros on public.shipment_costs for all to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                             where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (exists (select 1
                        from public.shipments s
                        join public.organization_members om on om.organization_id = s.organization_id
                       where s.id = shipment_costs.shipment_id
                         and s.organization_id = shipment_costs.organization_id
                         and om.user_id = (select auth.uid()) and om.is_active = true));

drop policy if exists supplier_products_miembros on public.supplier_products;
-- El producto propio vinculado (si hay) es de la MISMA organización (JOIN con products).
create policy supplier_products_miembros on public.supplier_products for all to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                             where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (organization_id in (select om.organization_id from public.organization_members om
                                  where om.user_id = (select auth.uid()) and om.is_active = true)
              and (product_id is null or exists (select 1 from public.products p
                                                  where p.id = supplier_products.product_id
                                                    and p.organization_id = supplier_products.organization_id)));

drop policy if exists shipping_settings_miembros_leen on public.shipping_settings;
create policy shipping_settings_miembros_leen on public.shipping_settings for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                             where om.user_id = (select auth.uid()) and om.is_active = true));

drop policy if exists shipping_settings_admin_gestiona on public.shipping_settings;
create policy shipping_settings_admin_gestiona on public.shipping_settings for all to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                             where om.user_id = (select auth.uid()) and om.is_active = true
                               and (om.is_super_admin = true or om.role_id = any (array[1, 2])
                                    or public.check_user_permission((select auth.uid()), om.organization_id, 'admin.full_access'))))
  with check (organization_id in (select om.organization_id from public.organization_members om
                                  where om.user_id = (select auth.uid()) and om.is_active = true
                                    and (om.is_super_admin = true or om.role_id = any (array[1, 2])
                                         or public.check_user_permission((select auth.uid()), om.organization_id, 'admin.full_access'))));

-- Catálogo global de ciudades por proveedor: lectura para usuarios con sesión; escritura solo
-- service_role (sin política de escritura).
drop policy if exists municipality_provider_codes_lectura on public.municipality_provider_codes;
create policy municipality_provider_codes_lectura on public.municipality_provider_codes for select to authenticated
  using (true);

-- Sin acceso anónimo a las tablas nuevas.
revoke all on public.shipment_costs, public.supplier_products, public.shipping_settings, public.municipality_provider_codes from anon;
