-- Inventario B3 · Traslados y distribución: esquema (INVENTARIO-PLAN.md §5.4).
--
-- Estado de hoy (2026-09-29): inventory_transfers no tiene código legible
-- («TR-0041» de Figma), ni quién/cuándo despachó o recibió, ni vínculo con la
-- orden de producción (distribución); transfer_items no guarda el costo con el
-- que salió la unidad, ni cuánto se dio de baja como faltante o volvió al
-- origen, ni los seriales que viajan. No hay seguimiento (Figma «Seguimiento»)
-- ni forma de que despachar o recibir dos veces no duplique.
--
-- Qué cambia (aditivo; 5 traslados, todos de la org 2):
-- * inventory_transfers: code (único por organización, lo pone un disparador
--   también para los traslados que crea el GO Assistant), shipped_at/by,
--   received_at/by, cancelled_at/by, cancel_reason, production_order_id (FK
--   NULL-able: distribución desde una orden de producción) y client_key
--   (idempotencia al crear).
-- * transfer_items: unit_cost (costo promedio del origen al despachar),
--   missing_qty (faltante en el transporte dado de baja), returned_qty (vuelto
--   al origen), difference_reason y serial_ids (seriales que viajan). CHECK:
--   recibido + faltante + devuelto <= enviado.
-- * inventory_transfer_events: el seguimiento del traslado (creado, editado,
--   despachado, recibido, cancelado, devuelto) y la clave de idempotencia de
--   cada operación. RLS de solo lectura para miembros activos: solo las RPC
--   fn_traslado_* (DEFINER) escriben.
-- La RLS de inventory_transfers y transfer_items sigue igual (la cierra B10;
-- assistant_create_transfer todavía inserta como invocador).

alter table public.inventory_transfers
  add column if not exists code text,
  add column if not exists shipped_at timestamptz,
  add column if not exists shipped_by uuid references auth.users(id) on delete set null,
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancel_reason text,
  add column if not exists production_order_id integer references public.production_orders(id) on delete set null,
  add column if not exists client_key text;

comment on column public.inventory_transfers.code is 'Código legible por organización (TR-0001). Lo asigna fn_traslado_int_codigo al insertar.';
comment on column public.inventory_transfers.shipped_at is 'Cuándo se despachó: sale del origen con transfer_out (fn_traslado_despachar).';
comment on column public.inventory_transfers.received_at is 'Cuándo quedó recibido del todo (fn_traslado_recibir).';
comment on column public.inventory_transfers.cancel_reason is 'Motivo de la cancelación o de la devolución al origen.';
comment on column public.inventory_transfers.production_order_id is 'Distribución: la orden de producción de la que sale lo enviado.';
comment on column public.inventory_transfers.client_key is 'Clave de idempotencia de la creación: repetir la misma creación devuelve el mismo traslado.';

-- Código de los que ya existen: TR-<id>, como los numeraba fn_inv_documentos.
update public.inventory_transfers
   set code = 'TR-' || lpad(id::text, 4, '0')
 where code is null;

create unique index if not exists inventory_transfers_org_code_key
  on public.inventory_transfers (organization_id, code) where code is not null;
create unique index if not exists inventory_transfers_org_client_key
  on public.inventory_transfers (organization_id, client_key) where client_key is not null;
create index if not exists idx_inventory_transfers_org_fecha
  on public.inventory_transfers (organization_id, created_at desc, id desc);
create index if not exists idx_inventory_transfers_produccion
  on public.inventory_transfers (production_order_id) where production_order_id is not null;

-- Código por organización: el siguiente número tras el mayor TR-n existente.
create or replace function public.fn_traslado_int_codigo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_n integer;
begin
  if new.code is not null and btrim(new.code) <> '' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('inv_traslado_codigo:' || new.organization_id));
  select coalesce(max(substring(t.code from '^TR-([0-9]{1,9})$')::integer), 0) + 1 into v_n
    from public.inventory_transfers t
   where t.organization_id = new.organization_id;
  new.code := 'TR-' || lpad(v_n::text, 4, '0');
  return new;
end;
$$;

revoke all on function public.fn_traslado_int_codigo() from public, anon, authenticated;

drop trigger if exists trg_traslado_codigo on public.inventory_transfers;
create trigger trg_traslado_codigo
  before insert on public.inventory_transfers
  for each row execute function public.fn_traslado_int_codigo();

alter table public.transfer_items
  add column if not exists unit_cost numeric,
  add column if not exists missing_qty numeric not null default 0,
  add column if not exists returned_qty numeric not null default 0,
  add column if not exists difference_reason text,
  add column if not exists serial_ids integer[];

comment on column public.transfer_items.unit_cost is 'Costo promedio del origen con el que salió (transfer_out); entra al destino con este mismo costo.';
comment on column public.transfer_items.missing_qty is 'Faltante en el transporte dado de baja al recibir (merma en destino, origen loss).';
comment on column public.transfer_items.returned_qty is 'Unidades en tránsito que volvieron al origen (fn_traslado_devolver).';
comment on column public.transfer_items.difference_reason is 'Motivo de la diferencia al recibir.';
comment on column public.transfer_items.serial_ids is 'Seriales (serial_numbers.id) que viajan en el renglón.';

alter table public.transfer_items drop constraint if exists transfer_items_cantidades_validas;
alter table public.transfer_items
  add constraint transfer_items_cantidades_validas
  check (quantity > 0
         and coalesce(received_qty, 0) >= 0
         and missing_qty >= 0
         and returned_qty >= 0
         and coalesce(received_qty, 0) + missing_qty + returned_qty <= quantity);

create index if not exists idx_transfer_items_traslado on public.transfer_items (inventory_transfer_id, id);

-- Seguimiento e idempotencia.
create table if not exists public.inventory_transfer_events (
  id bigserial primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  transfer_id integer not null references public.inventory_transfers(id) on delete cascade,
  tipo text not null check (tipo in ('creado', 'editado', 'despachado', 'recibido', 'cancelado', 'devuelto')),
  clave text,
  detalle jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.inventory_transfer_events is 'Seguimiento de cada traslado (Figma «Seguimiento») y claves de idempotencia de despachar/recibir/devolver. Solo lo escriben las RPC fn_traslado_*.';

create unique index if not exists inventory_transfer_events_clave_key
  on public.inventory_transfer_events (transfer_id, tipo, clave) where clave is not null;
create index if not exists idx_inventory_transfer_events_traslado
  on public.inventory_transfer_events (transfer_id, created_at, id);
create index if not exists idx_inventory_transfer_events_org
  on public.inventory_transfer_events (organization_id);

alter table public.inventory_transfer_events enable row level security;

drop policy if exists inventory_transfer_events_lectura_miembros on public.inventory_transfer_events;
create policy inventory_transfer_events_lectura_miembros on public.inventory_transfer_events
  for select to authenticated
  using (organization_id in (select om.organization_id
                               from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active = true));

revoke all on table public.inventory_transfer_events from anon;
revoke insert, update, delete, truncate on table public.inventory_transfer_events from authenticated;
grant select on table public.inventory_transfer_events to authenticated;
revoke all on sequence public.inventory_transfer_events_id_seq from anon, authenticated;

-- Seguimiento de los que ya existen: su creación.
insert into public.inventory_transfer_events (organization_id, transfer_id, tipo, detalle, created_by, created_at)
select t.organization_id, t.id, 'creado', jsonb_build_object('legado', true), t.created_by, coalesce(t.created_at, now())
  from public.inventory_transfers t
 where not exists (select 1 from public.inventory_transfer_events e where e.transfer_id = t.id and e.tipo = 'creado');
