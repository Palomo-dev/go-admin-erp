-- Rollback de 20261123220000_transporte_despacho_cumplimiento.
-- Las columnas nuevas de trips y la bitácora se conservan (aditivas; borrarlas pierde el historial
-- de despachos). Si de verdad hay que quitarlas, descomentar el bloque final.

drop trigger if exists trg_trips_guarda_despacho on public.trips;
drop function if exists public.fn_trips_guarda_despacho();
drop function if exists public.transporte_despachar_viaje(uuid, text, text);
drop function if exists public.fn_transporte_cumplimiento(uuid[]);
drop function if exists public.fn_transporte_cumplimiento_interno(uuid);
drop function if exists public.fn_transporte_ajuste_excepcion(integer, text);

drop trigger if exists trg_transporte_cargos_al_activar on public.organization_modules;
drop function if exists public.fn_transporte_cargos_al_activar();
drop function if exists public.fn_transporte_crear_cargos(integer);
drop function if exists public.fn_transporte_puede_actor(uuid, integer, text);

-- Lancha y yate: solo si no hay vehículos con esos tipos.
alter table public.vehicles drop constraint if exists vehicles_vehicle_type_check;
alter table public.vehicles add constraint vehicles_vehicle_type_check
  check (vehicle_type = any (array['motorcycle', 'car', 'van', 'truck', 'bus', 'minibus', 'trailer', 'other']));

-- Los cargos creados (TRA-DESPACHO, TRA-SUPERVISOR) y los permisos transporte.* se dejan: pueden
-- tener personas asignadas. Para quitarlos:
-- delete from public.job_position_permissions where permission_id in (select id from public.permissions where code like 'transporte.%');
-- delete from public.permissions where code in ('transporte.view', 'transporte.manage', 'transporte.despachar', 'transporte.despacho.excepcion');

-- drop table if exists public.trip_dispatch_log;
-- drop index if exists public.trips_dispatch_sheet_uq;
-- alter table public.trips
--   drop column if exists dispatched_at, drop column if exists dispatched_by, drop column if exists dispatch_sheet_number,
--   drop column if exists dispatch_block_reason, drop column if exists dispatch_override_reason,
--   drop column if exists dispatch_override_by, drop column if exists dispatch_override_at;
