-- Inventario B4 · Garantías: esquema del reclamo y escritura solo por RPC.
--
-- Estado de hoy (2026-09-28): warranty_claims tiene 0 filas, sin CHECK de
-- estado, sin código legible («GAR-0007» de Figma), sin dónde guardar el envío
-- al proveedor (RMA: proveedor, transportadora, guía, notas; hoy el número de
-- RMA se perdía) y con una política FOR ALL por pertenencia (sin exigir
-- membresía activa) que dejaba a cualquier miembro, y a anon por GRANT, crear,
-- cambiar o borrar reclamos desde el navegador.
--
-- Qué cambia (aditivo; la tabla está vacía):
-- * Columnas NULL-ables: code, supplier_id, rma_carrier, rma_tracking,
--   rma_notes, rma_sent_at, rma_sent_by, approved_at, approved_by.
-- * CHECK de estado (pending · approved · in_process · resolved · rejected ·
--   cancelled) y de tipo de resolución (repair · replacement · refund ·
--   store_credit · rejected): los valores que ya usa el código.
-- * Código único por organización y un solo reclamo abierto por serial.
-- * RLS: solo lectura para miembros activos; crear, aprobar, rechazar, enviar
--   al proveedor y resolver van por las RPC fn_garantia_* (20260929040500).
--   Se revocan los GRANT de escritura de anon y authenticated.

alter table public.warranty_claims
  add column if not exists code text,
  add column if not exists supplier_id integer references public.suppliers(id) on delete set null,
  add column if not exists rma_carrier text,
  add column if not exists rma_tracking text,
  add column if not exists rma_notes text,
  add column if not exists rma_sent_at timestamptz,
  add column if not exists rma_sent_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid;

comment on column public.warranty_claims.code is 'Código legible por organización (GAR-0001), lo asigna fn_garantia_crear.';
comment on column public.warranty_claims.supplier_id is 'Proveedor al que se envía la unidad (RMA); por defecto el del serial.';
comment on column public.warranty_claims.rma_carrier is 'Transportadora del envío al proveedor.';
comment on column public.warranty_claims.rma_tracking is 'Guía del envío al proveedor.';
comment on column public.warranty_claims.rma_notes is 'Notas para el proveedor.';

alter table public.warranty_claims drop constraint if exists warranty_claims_status_check;
alter table public.warranty_claims
  add constraint warranty_claims_status_check
  check (status = any (array['pending', 'approved', 'in_process', 'resolved', 'rejected', 'cancelled']));

alter table public.warranty_claims drop constraint if exists warranty_claims_resolution_type_check;
alter table public.warranty_claims
  add constraint warranty_claims_resolution_type_check
  check (resolution_type is null
         or resolution_type = any (array['repair', 'replacement', 'refund', 'store_credit', 'rejected']));

create unique index if not exists warranty_claims_org_code_key
  on public.warranty_claims (organization_id, code) where code is not null;

create unique index if not exists warranty_claims_un_abierto_por_serial
  on public.warranty_claims (serial_number_id) where status in ('pending', 'approved', 'in_process');

create index if not exists idx_wc_org_status_fecha
  on public.warranty_claims (organization_id, status, claim_date desc);

-- RLS: lectura para miembros activos; la escritura es de las RPC (DEFINER).
drop policy if exists warranty_claims_insert_update_delete_policy on public.warranty_claims;
drop policy if exists warranty_claims_select_policy on public.warranty_claims;
drop policy if exists warranty_claims_lectura_miembros on public.warranty_claims;
create policy warranty_claims_lectura_miembros on public.warranty_claims
  for select to authenticated
  using (organization_id in (select om.organization_id
                               from public.organization_members om
                              where om.user_id = (select auth.uid())
                                and om.is_active = true));

alter table public.warranty_claims enable row level security;
revoke all on table public.warranty_claims from anon;
revoke insert, update, delete, truncate, references, trigger on table public.warranty_claims from authenticated;
