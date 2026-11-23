-- Logística Fase 1 (aprobada por el dueño el 2026-11-23: Colombia, domiciliario propio) — 1/5:
-- domiciliarios sin contrato, conductor en columna propia, modo de despacho, estados nuevos,
-- contraentrega y código de entrega.
--
-- Diagnóstico de partida (docs/logistica/FASE1-CIMIENTOS.md): 1.423 envíos, todos en `pending` o
-- `cancelled`; 0 domiciliarios, 0 vehículos, 0 intentos, 0 pruebas de entrega; `cod_amount` nunca
-- se llena; el conductor vive en `shipments.metadata.driver_id` y `assignVehicleAndDriver` pisaba
-- todo `metadata`.
--
-- 1. driver_credentials: un domiciliario puede ser EXTERNO (sin contrato en Recursos humanos).
--    - employment_id y los datos de licencia pasan a admitir NULL (relajar un NOT NULL no cambia
--      tipos ni datos; la tabla tiene 0 filas). Un domiciliario en bicicleta no tiene licencia.
--    - Columnas nuevas: organization_id (la pertenencia ya no depende del empleo), branch_id,
--      user_id (para «Mis envíos»; NULL = sin cuenta), full_name, phone, documento, is_external,
--      vehicle_type.
--    - Un disparador completa organization_id y user_id desde el empleo cuando lo hay, y rechaza un
--      empleo de otra organización.
--    - RLS: la política anidada (employments → organization_members → IN) se reemplaza por el
--      patrón rápido sobre organization_id. Mismo alcance (miembros de la organización); ahora
--      exige miembro activo y deja fuera a anon.
-- 2. shipments: driver_id + vehicle_id + assigned_at en columnas propias (FK), fulfillment_mode
--    (own | last_mile | national_carrier | marketplace, por defecto own), motivo de la novedad,
--    contador de intentos fallidos y el recaudo de la contraentrega (monto, medio, fecha, giro).
--    El CHECK de status suma ready_for_pickup y failed_attempt (solo se amplía).
--    Backfill: el conductor y el vehículo que hubiera en metadata pasan a las columnas (hoy 0
--    filas con driver_id válido). metadata NO se toca.
-- 3. transport_events: canonical_status suma ready_for_pickup y failed_attempt; columna
--    reason_code con el motivo de cada novedad.
-- 4. delivery_attempts y proof_of_delivery: courier_id (el domiciliario, que puede no tener
--    usuario; driver_id sigue siendo el usuario de auth), y en la prueba el código verificado y el
--    recaudo. El CHECK de motivos suma 'lost'.
-- 5. shipment_delivery_codes: código de 4 dígitos por envío, obligatorio SOLO en contraentrega
--    propia. Tabla aparte para que el domiciliario no pueda leerlo (shipments la leen todos los
--    miembros): solo la leen los administradores (fn_caja_puede con un código que nadie tiene), la
--    tienda por service role (rastreo público) y las RPC SECURITY DEFINER que lo verifican.
--    Dos disparadores: BEFORE marca delivery_code_required; AFTER crea el código.
--
-- Verificado por MCP (taqjemqjtumhwptchcxk, 2026-11-23): columnas y CHECK de shipments,
-- transport_events, delivery_attempts, proof_of_delivery, driver_credentials (0 filas) y vehicles
-- (0 filas); pgcrypto en el esquema extensions; 0 envíos con source_type 'sale'.

-- ── 1. driver_credentials ──────────────────────────────────────────────────────────────────────
alter table public.driver_credentials alter column employment_id drop not null;
alter table public.driver_credentials alter column license_number drop not null;
alter table public.driver_credentials alter column license_category drop not null;
alter table public.driver_credentials alter column license_expiry drop not null;

alter table public.driver_credentials
  add column if not exists organization_id integer references public.organizations (id) on delete cascade,
  add column if not exists branch_id integer references public.branches (id) on delete set null,
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists document_type text,
  add column if not exists document_number text,
  add column if not exists is_external boolean not null default false,
  add column if not exists vehicle_type text;

update public.driver_credentials dc
   set organization_id = coalesce(e.organization_id, om.organization_id),
       user_id = coalesce(dc.user_id, om.user_id)
  from public.employments e
  left join public.organization_members om on om.id = e.organization_member_id
 where dc.employment_id = e.id
   and dc.organization_id is null;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'driver_credentials_vehicle_type_check') then
    alter table public.driver_credentials add constraint driver_credentials_vehicle_type_check
      check (vehicle_type is null or vehicle_type in ('motorcycle', 'bicycle', 'car', 'van', 'on_foot', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'driver_credentials_identidad_check') then
    alter table public.driver_credentials add constraint driver_credentials_identidad_check
      check (employment_id is not null or nullif(btrim(coalesce(full_name, '')), '') is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'driver_credentials_organizacion_check') then
    alter table public.driver_credentials add constraint driver_credentials_organizacion_check
      check (organization_id is not null);
  end if;
end
$c$;

create index if not exists idx_driver_credentials_org on public.driver_credentials (organization_id);
create index if not exists idx_driver_credentials_branch on public.driver_credentials (branch_id);
create index if not exists idx_driver_credentials_user on public.driver_credentials (user_id);
create unique index if not exists uq_driver_credentials_org_user
  on public.driver_credentials (organization_id, user_id) where user_id is not null;

create or replace function public.fn_driver_credentials_completar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org integer;
  v_uid uuid;
begin
  if new.employment_id is not null then
    select coalesce(e.organization_id, om.organization_id), om.user_id
      into v_org, v_uid
      from public.employments e
      left join public.organization_members om on om.id = e.organization_member_id
     where e.id = new.employment_id;
    if new.organization_id is null then
      new.organization_id := v_org;
    elsif v_org is not null and new.organization_id <> v_org then
      raise exception 'EMPLEO_DE_OTRA_ORGANIZACION' using errcode = '42501';
    end if;
    if new.user_id is null then
      new.user_id := v_uid;
    end if;
  else
    new.is_external := true;
  end if;
  new.full_name := nullif(btrim(coalesce(new.full_name, '')), '');
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.fn_driver_credentials_completar() from public, anon, authenticated;

drop trigger if exists trg_driver_credentials_completar on public.driver_credentials;
create trigger trg_driver_credentials_completar
  before insert or update of employment_id, organization_id, user_id, full_name
  on public.driver_credentials
  for each row execute function public.fn_driver_credentials_completar();

drop policy if exists driver_credentials_org_access on public.driver_credentials;
drop policy if exists driver_credentials_miembros on public.driver_credentials;
create policy driver_credentials_miembros on public.driver_credentials
  for all to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active))
  with check (organization_id in (select om.organization_id from public.organization_members om
                                   where om.user_id = (select auth.uid()) and om.is_active));

-- ── 2. shipments ───────────────────────────────────────────────────────────────────────────────
alter table public.shipments
  add column if not exists driver_id uuid references public.driver_credentials (id) on delete set null,
  add column if not exists vehicle_id uuid references public.vehicles (id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists fulfillment_mode text not null default 'own',
  add column if not exists exception_reason text,
  add column if not exists exception_detail text,
  add column if not exists failed_attempts smallint not null default 0,
  add column if not exists cod_collected_amount numeric(14, 2),
  add column if not exists cod_collected_method text,
  add column if not exists cod_collected_at timestamptz,
  add column if not exists cod_remitted_at timestamptz,
  add column if not exists delivery_code_required boolean not null default false;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'shipments_fulfillment_mode_check') then
    alter table public.shipments add constraint shipments_fulfillment_mode_check
      check (fulfillment_mode in ('own', 'last_mile', 'national_carrier', 'marketplace'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shipments_exception_reason_check') then
    alter table public.shipments add constraint shipments_exception_reason_check
      check (exception_reason is null or exception_reason in (
        'not_home', 'wrong_address', 'incomplete_address', 'rejected', 'damaged', 'lost', 'access_denied',
        'business_closed', 'weather', 'vehicle_issue', 'customer_request', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shipments_cod_collected_method_check') then
    alter table public.shipments add constraint shipments_cod_collected_method_check
      check (cod_collected_method is null or cod_collected_method in ('cash', 'card', 'transfer', 'qr'));
  end if;
end
$c$;

-- Estados: se amplía la lista (los 12 de antes siguen).
alter table public.shipments drop constraint if exists shipments_status_check;
alter table public.shipments add constraint shipments_status_check
  check (status = any (array['draft', 'pending', 'assigned', 'ready', 'ready_for_pickup', 'picked', 'dispatched',
                             'in_transit', 'out_for_delivery', 'failed_attempt', 'delivered', 'failed', 'returned',
                             'cancelled']));

-- Modo de despacho de lo que ya existe: transportadora si tiene proveedor o el pedido web era de
-- tercero (hoy 0 y 0); el resto queda 'own' por el DEFAULT.
update public.shipments s
   set fulfillment_mode = 'national_carrier'
 where s.fulfillment_mode = 'own'
   and (s.fulfillment_provider is not null
        or exists (select 1 from public.web_orders wo
                    where s.source_type = 'web_order' and wo.id = s.source_id
                      and wo.delivery_type = 'delivery_third_party'));

-- Conductor y vehículo que vivían en metadata (solo si son ids válidos que existen).
update public.shipments s
   set driver_id = dc.id,
       assigned_at = coalesce(s.assigned_at,
                              case when s.metadata->>'assigned_at' ~ '^\d{4}-\d{2}-\d{2}'
                                   then (s.metadata->>'assigned_at')::timestamptz end)
  from public.driver_credentials dc
 where s.driver_id is null
   and s.metadata->>'driver_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and dc.id = (s.metadata->>'driver_id')::uuid
   and dc.organization_id = s.organization_id;

update public.shipments s
   set vehicle_id = v.id
  from public.vehicles v
 where s.vehicle_id is null
   and s.metadata->>'vehicle_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and v.id = (s.metadata->>'vehicle_id')::uuid
   and v.organization_id = s.organization_id;

create index if not exists idx_shipments_driver on public.shipments (driver_id);
create index if not exists idx_shipments_vehicle on public.shipments (vehicle_id);
create index if not exists idx_shipments_driver_cod
  on public.shipments (organization_id, driver_id, cod_status) where driver_id is not null;
-- Un envío por venta POS, igual que por pedido web (idx_shipments_web_order_unique).
create unique index if not exists idx_shipments_sale_unique
  on public.shipments (source_type, source_id) where source_type = 'sale';

-- ── 3. transport_events ────────────────────────────────────────────────────────────────────────
alter table public.transport_events add column if not exists reason_code text;

alter table public.transport_events drop constraint if exists transport_events_canonical_status_check;
alter table public.transport_events add constraint transport_events_canonical_status_check
  check (canonical_status is null or canonical_status = any (array[
    'created', 'ready_for_pickup', 'assigned', 'picked', 'in_transit', 'out_for_delivery', 'failed_attempt',
    'delivered', 'exception', 'returned', 'cancelled']));

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'transport_events_reason_code_check') then
    alter table public.transport_events add constraint transport_events_reason_code_check
      check (reason_code is null or reason_code in (
        'not_home', 'wrong_address', 'incomplete_address', 'rejected', 'damaged', 'lost', 'access_denied',
        'business_closed', 'weather', 'vehicle_issue', 'customer_request', 'other'));
  end if;
end
$c$;

-- ── 4. delivery_attempts y proof_of_delivery ───────────────────────────────────────────────────
alter table public.delivery_attempts
  add column if not exists courier_id uuid references public.driver_credentials (id) on delete set null;
create index if not exists idx_delivery_attempts_courier on public.delivery_attempts (courier_id);

alter table public.delivery_attempts drop constraint if exists delivery_attempts_failure_reason_code_check;
alter table public.delivery_attempts add constraint delivery_attempts_failure_reason_code_check
  check (failure_reason_code = any (array[
    'not_home', 'wrong_address', 'incomplete_address', 'rejected', 'damaged', 'lost', 'access_denied',
    'business_closed', 'weather', 'vehicle_issue', 'customer_request', 'other']));

alter table public.proof_of_delivery
  add column if not exists courier_id uuid references public.driver_credentials (id) on delete set null,
  add column if not exists delivery_code_verified boolean not null default false,
  add column if not exists cod_collected_amount numeric(14, 2),
  add column if not exists cod_collected_method text;
create index if not exists idx_proof_of_delivery_courier on public.proof_of_delivery (courier_id);

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'proof_of_delivery_cod_collected_method_check') then
    alter table public.proof_of_delivery add constraint proof_of_delivery_cod_collected_method_check
      check (cod_collected_method is null or cod_collected_method in ('cash', 'card', 'transfer', 'qr'));
  end if;
end
$c$;

-- ── 5. Código de entrega ───────────────────────────────────────────────────────────────────────
create table if not exists public.shipment_delivery_codes (
  shipment_id uuid primary key references public.shipments (id) on delete cascade,
  organization_id integer not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  failed_tries smallint not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_shipment_delivery_codes_org on public.shipment_delivery_codes (organization_id);
alter table public.shipment_delivery_codes enable row level security;

drop policy if exists shipment_delivery_codes_admin_select on public.shipment_delivery_codes;
create policy shipment_delivery_codes_admin_select on public.shipment_delivery_codes
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active)
         and public.fn_caja_puede(organization_id, 'logistica.codigo_entrega.ver'));
revoke insert, update, delete, truncate on public.shipment_delivery_codes from anon, authenticated;

create or replace function public.fn_logistica_codigo_4_digitos()
returns text
language sql
volatile
set search_path = public
as $$
  select lpad(((('x' || encode(extensions.gen_random_bytes(2), 'hex'))::bit(16)::int) % 10000)::text, 4, '0');
$$;
revoke execute on function public.fn_logistica_codigo_4_digitos() from public, anon, authenticated;

create or replace function public.fn_shipments_marcar_codigo_requerido()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.delivery_code_required := (new.fulfillment_mode = 'own' and coalesce(new.cod_amount, 0) > 0);
  return new;
end;
$$;
revoke execute on function public.fn_shipments_marcar_codigo_requerido() from public, anon, authenticated;

create or replace function public.fn_shipments_crear_codigo_entrega()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.delivery_code_required then
    insert into public.shipment_delivery_codes (shipment_id, organization_id, code)
    values (new.id, new.organization_id, public.fn_logistica_codigo_4_digitos())
    on conflict (shipment_id) do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function public.fn_shipments_crear_codigo_entrega() from public, anon, authenticated;

drop trigger if exists trg_shipments_codigo_requerido on public.shipments;
create trigger trg_shipments_codigo_requerido
  before insert or update of cod_amount, fulfillment_mode on public.shipments
  for each row execute function public.fn_shipments_marcar_codigo_requerido();

drop trigger if exists trg_shipments_codigo_entrega on public.shipments;
create trigger trg_shipments_codigo_entrega
  after insert or update of cod_amount, fulfillment_mode on public.shipments
  for each row execute function public.fn_shipments_crear_codigo_entrega();

comment on column public.shipments.driver_id is 'Domiciliario asignado (driver_credentials). Fase 1 logística: reemplaza metadata.driver_id, que se conserva como espejo.';
comment on column public.shipments.fulfillment_mode is 'Quién entrega: own (domiciliario propio), last_mile (tercero de última milla), national_carrier (transportadora), marketplace.';
comment on column public.shipments.delivery_code_required is 'Lo calcula trg_shipments_codigo_requerido: contraentrega propia (cod_amount > 0 y fulfillment_mode = own).';
comment on table public.shipment_delivery_codes is 'Código de entrega de 4 dígitos (solo contraentrega). Lo leen administradores, el rastreo público (service role) y las RPC logistica_*. El domiciliario no.';
