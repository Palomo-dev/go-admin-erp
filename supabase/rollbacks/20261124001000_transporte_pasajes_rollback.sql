-- Rollback de 20261124001000_transporte_pasajes. Quita el cron y las RPC de pasajes y vuelve
-- fn_transporte_crear_cargos sin transporte.vender. Se conservan (comentados) la tabla seat_maps,
-- la columna vehicles.seat_map_id y el permiso: pueden tener datos o cargos asignados.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'transporte-liberar-retenciones') then
    perform cron.unschedule('transporte-liberar-retenciones');
  end if;
end $$;

drop function if exists public.fn_transporte_anular_boleto(uuid, text);
drop function if exists public.fn_transporte_cambiar_boleto(uuid, uuid, text);
drop function if exists public.fn_transporte_emitir_boleto(uuid, text, jsonb);
drop function if exists public.fn_transporte_soltar_puesto(uuid, text);
drop function if exists public.fn_transporte_retener_puesto(uuid, text, text);
drop function if exists public.fn_transporte_puestos_viaje(uuid);
drop function if exists public.fn_transporte_guarda_viaje(uuid, text);
drop function if exists public.fn_transporte_liberar_retenciones(uuid);
drop function if exists public.fn_transporte_recontar_puestos(uuid);
drop function if exists public.fn_transporte_libera_al_vencer(integer);
drop function if exists public.fn_transporte_ajuste_entero(integer, text[], integer);
drop function if exists public.fn_transporte_plano_aplicar(uuid, uuid);

create or replace function public.fn_transporte_crear_cargos(p_org integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dept uuid;
  v_despachador uuid;
  v_supervisor uuid;
begin
  if p_org is null then
    return;
  end if;

  select d.id into v_dept
    from public.departments d
   where d.organization_id = p_org and d.code = 'OPE'
   order by d.created_at
   limit 1;

  insert into public.job_positions (organization_id, department_id, code, name, description, level, is_active)
  values
    (p_org, v_dept, 'TRA-DESPACHO', 'Despachador de transporte', 'Da salida a los viajes del día e imprime la planilla de despacho', 'junior', true),
    (p_org, v_dept, 'TRA-SUPERVISOR', 'Supervisor de despacho', 'Programa la operación y autoriza excepciones de despacho con su PIN', 'mid', true)
  on conflict (organization_id, code) do nothing;

  select id into v_despachador from public.job_positions where organization_id = p_org and code = 'TRA-DESPACHO';
  select id into v_supervisor from public.job_positions where organization_id = p_org and code = 'TRA-SUPERVISOR';

  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select v_despachador, p.id, true from public.permissions p
   where v_despachador is not null and p.code in ('transporte.view', 'transporte.despachar')
  on conflict (job_position_id, permission_id) do nothing;

  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select v_supervisor, p.id, true from public.permissions p
   where v_supervisor is not null and p.code in ('transporte.view', 'transporte.manage', 'transporte.despachar', 'transporte.despacho.excepcion')
  on conflict (job_position_id, permission_id) do nothing;
end;
$$;
revoke all on function public.fn_transporte_crear_cargos(integer) from public, anon, authenticated;
grant execute on function public.fn_transporte_crear_cargos(integer) to service_role;

-- alter table public.vehicles drop column if exists seat_map_id;
-- drop table if exists public.seat_maps;
-- delete from public.job_position_permissions where permission_id in (select id from public.permissions where code = 'transporte.vender');
-- delete from public.permissions where code = 'transporte.vender';
