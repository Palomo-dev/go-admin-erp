-- Reversión de 20260929040300_inv_b4_garantias_esquema.sql.
-- Revertir antes 20260929040500 (las RPC fn_garantia_* usan estas columnas).
-- ADVERTENCIA: borra el código, el proveedor y los datos del envío (RMA) de los
-- reclamos que se hayan creado desde entonces.

drop policy if exists warranty_claims_lectura_miembros on public.warranty_claims;
create policy warranty_claims_select_policy on public.warranty_claims
  for select
  using (organization_id in (select organization_members.organization_id
                               from organization_members
                              where organization_members.user_id = auth.uid()));
create policy warranty_claims_insert_update_delete_policy on public.warranty_claims
  for all
  using (organization_id in (select organization_members.organization_id
                               from organization_members
                              where organization_members.user_id = auth.uid()));

grant select, insert, update, delete, truncate, references, trigger on table public.warranty_claims to anon, authenticated;

drop index if exists public.idx_wc_org_status_fecha;
drop index if exists public.warranty_claims_un_abierto_por_serial;
drop index if exists public.warranty_claims_org_code_key;

alter table public.warranty_claims drop constraint if exists warranty_claims_resolution_type_check;
alter table public.warranty_claims drop constraint if exists warranty_claims_status_check;

alter table public.warranty_claims
  drop column if exists approved_by,
  drop column if exists approved_at,
  drop column if exists rma_sent_by,
  drop column if exists rma_sent_at,
  drop column if exists rma_notes,
  drop column if exists rma_tracking,
  drop column if exists rma_carrier,
  drop column if exists supplier_id,
  drop column if exists code;
