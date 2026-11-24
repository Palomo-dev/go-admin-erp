-- Rollback de 20261123234500_transporte_documentos.
-- Quita el cron, los avisos (ampliación de member_notices solo si no hay avisos de transporte),
-- las políticas del bucket y vuelve el cumplimiento a las fechas de siempre. La tabla
-- vehicle_documents y el bucket se conservan comentados: borrarlos pierde documentos cargados.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'transporte-avisar-vencimientos') then
    perform cron.unschedule('transporte-avisar-vencimientos');
  end if;
end $$;
drop function if exists public.fn_transporte_avisar_vencimientos();

delete from public.member_notices where event = 'transporte.documento.vence';
alter table public.member_notices drop constraint if exists member_notices_event_check;
alter table public.member_notices add constraint member_notices_event_check check (event = any (array[
  'tarea.asignada', 'oportunidad.asignada', 'oportunidad.etapa', 'tarea.completada', 'tarea.atrasada', 'tarea.vence',
  'oportunidad.vence', 'oportunidad.atrasada', 'oportunidad.ganada', 'oportunidad.perdida', 'oportunidad.contacto',
  'caja.diferencia', 'cartera.resumen', 'inventario.cero', 'inventario.bajo'
]));
alter table public.member_notices drop constraint if exists member_notices_entity_check;
alter table public.member_notices add constraint member_notices_entity_check check (entity_type = any (array[
  'task', 'opportunity', 'cash_session', 'digest', 'stock'
]));

drop policy if exists transporte_documentos_select on storage.objects;
drop policy if exists transporte_documentos_insert on storage.objects;
drop policy if exists transporte_documentos_delete on storage.objects;

drop trigger if exists trg_vehicle_documents_sincronizar on public.vehicle_documents;
drop trigger if exists trg_vehicle_documents_antes on public.vehicle_documents;
drop function if exists public.fn_vehicle_documents_sincronizar();
drop function if exists public.fn_vehicle_documents_antes();

-- Cumplimiento: la versión de 20261123220000 (solo las fechas de vehicles y driver_credentials).
create or replace function public.fn_transporte_cumplimiento_interno(p_trip uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  t public.trips;
  v public.vehicles;
  d public.driver_credentials;
  v_bloqueos jsonb := '[]'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_doc record;
begin
  select * into t from public.trips where id = p_trip;
  if t.id is null then
    return null;
  end if;

  if t.vehicle_id is null then
    v_bloqueos := v_bloqueos || jsonb_build_object('causa', 'sin_vehiculo', 'grupo', 'asignacion', 'excepcion', false);
  else
    select * into v from public.vehicles where id = t.vehicle_id and organization_id = t.organization_id;
    for v_doc in
      select * from (values ('soat', v.soat_expiry), ('tecnomecanica', v.techno_expiry), ('poliza', v.insurance_expiry), ('tarjeta_operacion', v.operating_card_expiry)) x(causa, vence)
    loop
      if v_doc.vence is not null and v_doc.vence < t.trip_date then
        v_bloqueos := v_bloqueos || jsonb_build_object('causa', v_doc.causa, 'grupo', 'vehiculo', 'vence', v_doc.vence,
          'excepcion', public.fn_transporte_ajuste_excepcion(t.organization_id, 'documentosVehiculo'));
      elsif v_doc.vence is not null and v_doc.vence <= t.trip_date + 30 then
        v_avisos := v_avisos || jsonb_build_object('causa', v_doc.causa, 'grupo', 'vehiculo', 'vence', v_doc.vence, 'dias', v_doc.vence - t.trip_date);
      end if;
    end loop;
  end if;

  if t.driver_id is null then
    v_bloqueos := v_bloqueos || jsonb_build_object('causa', 'sin_conductor', 'grupo', 'asignacion', 'excepcion', false);
  else
    select * into d from public.driver_credentials
     where user_id = t.driver_id and organization_id = t.organization_id and coalesce(is_active, true)
     order by updated_at desc nulls last
     limit 1;
    if d.id is null then
      v_bloqueos := v_bloqueos || jsonb_build_object('causa', 'sin_credencial', 'grupo', 'conductor',
        'excepcion', public.fn_transporte_ajuste_excepcion(t.organization_id, 'documentosConductor'));
    else
      for v_doc in
        select * from (values ('licencia', d.license_expiry), ('examen_medico', d.medical_certificate_expiry)) x(causa, vence)
      loop
        if v_doc.vence is not null and v_doc.vence < t.trip_date then
          v_bloqueos := v_bloqueos || jsonb_build_object('causa', v_doc.causa, 'grupo', 'conductor', 'vence', v_doc.vence,
            'excepcion', public.fn_transporte_ajuste_excepcion(t.organization_id, 'documentosConductor'));
        elsif v_doc.vence is not null and v_doc.vence <= t.trip_date + 30 then
          v_avisos := v_avisos || jsonb_build_object('causa', v_doc.causa, 'grupo', 'conductor', 'vence', v_doc.vence, 'dias', v_doc.vence - t.trip_date);
        end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'trip_id', t.id,
    'fecha', t.trip_date,
    'bloqueos', v_bloqueos,
    'avisos', v_avisos,
    'admite_excepcion', jsonb_array_length(v_bloqueos) > 0
      and not exists (select 1 from jsonb_array_elements(v_bloqueos) b where (b ->> 'excepcion')::boolean is not true),
    'pide_pin', public.fn_transporte_ajuste_excepcion(t.organization_id, 'pedirPin')
  );
end;
$$;
revoke all on function public.fn_transporte_cumplimiento_interno(uuid) from public, anon, authenticated;
grant execute on function public.fn_transporte_cumplimiento_interno(uuid) to service_role;

-- drop table if exists public.vehicle_documents;
-- delete from storage.buckets where id = 'transporte-documentos';
