-- Reversión de 20260929161000_inv_b6a_7_unidades_esquema.sql
-- Antes: revertir 20260929161200 y 20260929161100 (usan estas columnas).
-- Las conversiones POR PRODUCTO y las unidades PROPIAS no existían antes: se
-- borran (las unidades propias solo si nada las usa; si algo las usa, este
-- rollback falla por la FK y hay que decidir antes qué hacer con esos datos).

set local lock_timeout = '5s';

drop trigger if exists trg_unit_conversions_validar on public.unit_conversions;
drop function if exists public.fn_unit_conversions_validar();

delete from public.unit_conversions where product_id is not null;
drop index if exists public.unit_conversions_producto;
drop index if exists public.unit_conversions_alcance_unico;
alter table public.unit_conversions
  drop column if exists product_id,
  drop column if exists created_by,
  drop column if exists updated_at;

-- Escritura por pertenencia como la dejó 20260923133330.
grant insert, update, delete on public.unit_conversions to authenticated;
create policy unit_conversions_insercion on public.unit_conversions
  for insert to authenticated
  with check (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true));
create policy unit_conversions_edicion on public.unit_conversions
  for update to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true));
create policy unit_conversions_borrado on public.unit_conversions
  for delete to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active = true));

delete from public.unit_conversions uc
 using public.units u
 where u.organization_id is not null and (uc.from_unit_code = u.code or uc.to_unit_code = u.code);
delete from public.units where organization_id is not null;

drop policy if exists units_lectura on public.units;
create policy units_lectura on public.units
  for select to authenticated
  using (true);

drop index if exists public.units_organization_id;
alter table public.units
  drop column if exists organization_id,
  drop column if exists is_active,
  drop column if exists created_by;
