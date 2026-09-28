-- Rollback de 20260925110000_pos_propinas_cargos_tipos_permisos_anulacion
--
-- ADVERTENCIAS (no restaura datos):
--   * Si ya hay propinas 'transfer' u 'online', el CHECK original (cash/card/
--     split/pooled) no se puede volver a poner: el ALTER falla. Decidir antes
--     qué hacer con esas filas; este archivo no las transforma.
--   * Borrar voided_at/voided_by/void_reason pierde qué propinas se anularon.
--     Los contra-asientos que creó fn_propina_anular NO se borran (los asientos
--     publicados son inmutables, ADR-CC-012): quedan en la contabilidad.
--   * Vuelve la política ALL por pertenencia: cualquier miembro escribe.

-- 9. service_charges
drop policy if exists service_charges_lectura on public.service_charges;
drop policy if exists service_charges_escritura on public.service_charges;
create policy service_charges_org_isolation on public.service_charges
  for all
  using (organization_id in (select organization_members.organization_id from public.organization_members
                              where organization_members.user_id = auth.uid() and organization_members.is_active = true));
grant select, insert, update, delete, truncate, references, trigger on public.service_charges to anon, authenticated;

-- 8. tips
drop policy if exists tips_lectura on public.tips;
drop policy if exists tips_registro on public.tips;
drop policy if exists tips_edicion on public.tips;
create policy tips_org_isolation on public.tips
  for all
  using (organization_id in (select organization_members.organization_id from public.organization_members
                              where organization_members.user_id = auth.uid() and organization_members.is_active = true));
grant select, insert, update, delete, truncate, references, trigger on public.tips to anon, authenticated;

-- 7, 6, 5. Funciones
drop function if exists public.fn_propinas_meseros(integer, integer);
drop function if exists public.fn_propinas_liquidar(integer, uuid[]);
drop function if exists public.fn_propina_anular(uuid, text);

-- 4. Guarda
drop trigger if exists trg_tips_guarda on public.tips;
drop function if exists public.fn_tips_guarda();

-- 3. Permiso
delete from public.job_position_permissions
 where permission_id in (select id from public.permissions where code = 'pos.propinas.liquidar');
delete from public.role_permissions
 where permission_id in (select id from public.permissions where code = 'pos.propinas.liquidar');
delete from public.permissions where code = 'pos.propinas.liquidar';

-- 2. Columnas de anulación
alter table public.tips drop column if exists void_reason;
alter table public.tips drop column if exists voided_by;
alter table public.tips drop column if exists voided_at;

-- 1. Tipos (falla si hay filas 'transfer' u 'online'; ver advertencia)
alter table public.tips drop constraint if exists tips_tip_type_check;
alter table public.tips add constraint tips_tip_type_check
  check (tip_type = any (array['cash', 'card', 'split', 'pooled']));
