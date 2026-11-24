-- Transporte · Fase 1 «Documentos completos» (Figma «23 Transporte» › 13, 2889:8513; lámina 24,
-- tabla propuesta `vehicle_documents`). Aprobado por el dueño el 2026-11-23.
--
-- 1. `vehicle_documents`: SOAT, técnico-mecánica, póliza, tarjeta de operación, matrícula y
--    certificado de navegabilidad (embarcaciones), licencia y examen médico (personas) y «otro»;
--    con número, entidad, vencimiento, si bloquea el despacho y archivo. Un documento vigente por
--    tipo y dueño (los anteriores quedan archivados, `is_active = false`).
--    RLS por pertenencia: leer con `transporte.view` (o ver todo en Logística); escribir con
--    `transporte.manage` (o gestionar Logística).
-- 2. Sincroniza las fechas de siempre (`vehicles.soat_expiry`… y `driver_credentials.license_*`):
--    las pantallas viejas y `fn_transporte_cumplimiento_interno` siguen viendo la misma fecha.
-- 3. El cumplimiento suma los demás documentos que bloquean (matrícula, navegabilidad, otro).
-- 4. Bucket PRIVADO `transporte-documentos` (`<org>/<documento>/<archivo>`), URL firmada.
-- 5. Avisos a los 30, 15 y 7 días antes de vencer por el canal de avisos del ERP
--    (`member_notices`: campana + correo del cron `avisos-miembro`), a quien gestiona Transporte y
--    al conductor dueño del documento. Cron diario `transporte-avisar-vencimientos`.
--
-- Rollback: supabase/rollbacks/20261123234500_transporte_documentos_rollback.sql

-- ── 1. Tabla ────────────────────────────────────────────────────────────────

create table if not exists public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  driver_credential_id uuid references public.driver_credentials(id) on delete cascade,
  doc_type text not null check (doc_type in ('soat', 'tecnomecanica', 'poliza', 'tarjeta_operacion', 'matricula', 'navegabilidad', 'licencia', 'examen_medico', 'otro')),
  country char(2) not null default 'CO',
  number text,
  issuer text,
  category text,
  issued_on date,
  expires_on date,
  blocks_dispatch boolean not null default true,
  file_path text,
  file_name text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_documents_un_dueno check ((vehicle_id is null) <> (driver_credential_id is null))
);

create index if not exists vehicle_documents_org_idx on public.vehicle_documents (organization_id, expires_on) where is_active;
create unique index if not exists vehicle_documents_vigente_vehiculo_uq on public.vehicle_documents (vehicle_id, doc_type) where is_active and vehicle_id is not null and doc_type <> 'otro';
create unique index if not exists vehicle_documents_vigente_conductor_uq on public.vehicle_documents (driver_credential_id, doc_type) where is_active and driver_credential_id is not null and doc_type <> 'otro';

comment on table public.vehicle_documents is
  'Transporte: documentos de vehículos y conductores (número, vencimiento, archivo en el bucket privado transporte-documentos, si bloquea el despacho). Un vigente por tipo y dueño; los demás archivados.';

create or replace function public.fn_vehicle_documents_antes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- El dueño tiene que ser de la misma organización (no se cuelga un documento a un vehículo ajeno).
  if new.vehicle_id is not null and not exists (select 1 from public.vehicles v where v.id = new.vehicle_id and v.organization_id = new.organization_id) then
    raise exception 'transporte: el vehículo no es de la organización' using errcode = '42501';
  end if;
  if new.driver_credential_id is not null and not exists (select 1 from public.driver_credentials d where d.id = new.driver_credential_id and d.organization_id = new.organization_id) then
    raise exception 'transporte: el conductor no es de la organización' using errcode = '42501';
  end if;
  if new.file_path is not null and split_part(new.file_path, '/', 1) <> new.organization_id::text then
    raise exception 'transporte: archivo fuera de la carpeta de la organización' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    -- El nuevo vigente archiva al anterior del mismo tipo (se conserva el historial).
    if new.is_active and new.doc_type <> 'otro' then
      update public.vehicle_documents x
         set is_active = false, updated_at = now()
       where x.is_active and x.doc_type = new.doc_type
         and ((new.vehicle_id is not null and x.vehicle_id = new.vehicle_id)
              or (new.driver_credential_id is not null and x.driver_credential_id = new.driver_credential_id));
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.fn_vehicle_documents_antes() from public, anon, authenticated;

drop trigger if exists trg_vehicle_documents_antes on public.vehicle_documents;
create trigger trg_vehicle_documents_antes
  before insert or update on public.vehicle_documents
  for each row execute function public.fn_vehicle_documents_antes();

-- ── 2. Las fechas de siempre siguen al documento vigente ───────────────────

create or replace function public.fn_vehicle_documents_sincronizar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not new.is_active then
    return null;
  end if;
  if new.vehicle_id is not null then
    update public.vehicles
       set soat_expiry = case when new.doc_type = 'soat' then new.expires_on else soat_expiry end,
           techno_expiry = case when new.doc_type = 'tecnomecanica' then new.expires_on else techno_expiry end,
           insurance_expiry = case when new.doc_type = 'poliza' then new.expires_on else insurance_expiry end,
           operating_card_expiry = case when new.doc_type = 'tarjeta_operacion' then new.expires_on else operating_card_expiry end,
           updated_at = now()
     where id = new.vehicle_id and new.doc_type in ('soat', 'tecnomecanica', 'poliza', 'tarjeta_operacion');
  else
    update public.driver_credentials
       set license_expiry = case when new.doc_type = 'licencia' then new.expires_on else license_expiry end,
           license_number = case when new.doc_type = 'licencia' and new.number is not null then new.number else license_number end,
           license_category = case when new.doc_type = 'licencia' and new.category is not null then new.category else license_category end,
           medical_certificate_expiry = case when new.doc_type = 'examen_medico' then new.expires_on else medical_certificate_expiry end,
           updated_at = now()
     where id = new.driver_credential_id and new.doc_type in ('licencia', 'examen_medico');
  end if;
  return null;
end;
$$;
revoke all on function public.fn_vehicle_documents_sincronizar() from public, anon, authenticated;

drop trigger if exists trg_vehicle_documents_sincronizar on public.vehicle_documents;
create trigger trg_vehicle_documents_sincronizar
  after insert or update of expires_on, number, category, is_active on public.vehicle_documents
  for each row execute function public.fn_vehicle_documents_sincronizar();

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.vehicle_documents enable row level security;

drop policy if exists vehicle_documents_select on public.vehicle_documents;
create policy vehicle_documents_select on public.vehicle_documents
  for select to authenticated
  using (
    organization_id in (select om.organization_id from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active)
    and (public.fn_caja_puede(organization_id, 'transporte.view') or public.fn_logistica_ve_todo(organization_id))
  );

drop policy if exists vehicle_documents_insert on public.vehicle_documents;
create policy vehicle_documents_insert on public.vehicle_documents
  for insert to authenticated
  with check (
    organization_id in (select om.organization_id from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active)
    and (public.fn_caja_puede(organization_id, 'transporte.manage') or public.fn_logistica_gestiona(organization_id))
  );

drop policy if exists vehicle_documents_update on public.vehicle_documents;
create policy vehicle_documents_update on public.vehicle_documents
  for update to authenticated
  using (
    organization_id in (select om.organization_id from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active)
    and (public.fn_caja_puede(organization_id, 'transporte.manage') or public.fn_logistica_gestiona(organization_id))
  )
  with check (
    organization_id in (select om.organization_id from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active)
    and (public.fn_caja_puede(organization_id, 'transporte.manage') or public.fn_logistica_gestiona(organization_id))
  );

drop policy if exists vehicle_documents_delete on public.vehicle_documents;
create policy vehicle_documents_delete on public.vehicle_documents
  for delete to authenticated
  using (
    organization_id in (select om.organization_id from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active)
    and (public.fn_caja_puede(organization_id, 'transporte.manage') or public.fn_logistica_gestiona(organization_id))
  );

revoke all on public.vehicle_documents from anon;

-- ── 3. Cumplimiento con los demás documentos ───────────────────────────────

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
      union all
      -- Documentos sin columna propia (matrícula, navegabilidad, otro) que bloquean el despacho.
      select vd.doc_type, vd.expires_on from public.vehicle_documents vd
       where vd.vehicle_id = t.vehicle_id and vd.is_active and vd.blocks_dispatch
         and vd.doc_type in ('matricula', 'navegabilidad', 'otro') and vd.expires_on is not null
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
        union all
        select vd.doc_type, vd.expires_on from public.vehicle_documents vd
         where vd.driver_credential_id = d.id and vd.is_active and vd.blocks_dispatch
           and vd.doc_type = 'otro' and vd.expires_on is not null
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

-- ── 4. Bucket privado ───────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('transporte-documentos', 'transporte-documentos', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists transporte_documentos_select on storage.objects;
create policy transporte_documentos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'transporte-documentos'
    and (storage.foldername(name))[1] in (select om.organization_id::text from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active)
    and (public.fn_caja_puede(((storage.foldername(name))[1])::integer, 'transporte.view') or public.fn_logistica_ve_todo(((storage.foldername(name))[1])::integer))
  );

drop policy if exists transporte_documentos_insert on storage.objects;
create policy transporte_documentos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'transporte-documentos'
    and (storage.foldername(name))[1] in (select om.organization_id::text from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active)
    and (public.fn_caja_puede(((storage.foldername(name))[1])::integer, 'transporte.manage') or public.fn_logistica_gestiona(((storage.foldername(name))[1])::integer))
  );

drop policy if exists transporte_documentos_delete on storage.objects;
create policy transporte_documentos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'transporte-documentos'
    and (storage.foldername(name))[1] in (select om.organization_id::text from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active)
    and (public.fn_caja_puede(((storage.foldername(name))[1])::integer, 'transporte.manage') or public.fn_logistica_gestiona(((storage.foldername(name))[1])::integer))
  );

-- ── 5. Avisos 30 · 15 · 7 días ─────────────────────────────────────────────

alter table public.member_notices drop constraint if exists member_notices_event_check;
alter table public.member_notices add constraint member_notices_event_check check (event = any (array[
  'tarea.asignada', 'oportunidad.asignada', 'oportunidad.etapa', 'tarea.completada', 'tarea.atrasada', 'tarea.vence',
  'oportunidad.vence', 'oportunidad.atrasada', 'oportunidad.ganada', 'oportunidad.perdida', 'oportunidad.contacto',
  'caja.diferencia', 'cartera.resumen', 'inventario.cero', 'inventario.bajo',
  'transporte.documento.vence'
]));
alter table public.member_notices drop constraint if exists member_notices_entity_check;
alter table public.member_notices add constraint member_notices_entity_check check (entity_type = any (array[
  'task', 'opportunity', 'cash_session', 'digest', 'stock', 'vehicle_document'
]));

create or replace function public.fn_transporte_avisar_vencimientos()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  u uuid;
  n integer := 0;
  v_umbral integer;
  v_nombre text;
begin
  for r in
    with docs as (
      -- Documentos con su fila (número y archivo).
      select vd.organization_id as org, vd.id as ref_id, vd.doc_type as tipo, vd.expires_on as vence,
             coalesce(v.plate, dc.full_name) as dueno, dc.user_id as conductor
        from public.vehicle_documents vd
        left join public.vehicles v on v.id = vd.vehicle_id
        left join public.driver_credentials dc on dc.id = vd.driver_credential_id
       where vd.is_active and vd.expires_on is not null
      union all
      -- Fechas de siempre que aún no tienen documento cargado.
      select v.organization_id, v.id, x.tipo, x.vence, v.plate, null::uuid
        from public.vehicles v
        cross join lateral (values ('soat', v.soat_expiry), ('tecnomecanica', v.techno_expiry), ('poliza', v.insurance_expiry), ('tarjeta_operacion', v.operating_card_expiry)) x(tipo, vence)
       where coalesce(v.is_active, true) and x.vence is not null
         and not exists (select 1 from public.vehicle_documents vd where vd.vehicle_id = v.id and vd.doc_type = x.tipo and vd.is_active)
      union all
      select dc.organization_id, dc.id, x.tipo, x.vence, dc.full_name, dc.user_id
        from public.driver_credentials dc
        cross join lateral (values ('licencia', dc.license_expiry), ('examen_medico', dc.medical_certificate_expiry)) x(tipo, vence)
       where coalesce(dc.is_active, true) and x.vence is not null and dc.organization_id is not null
         and not exists (select 1 from public.vehicle_documents vd where vd.driver_credential_id = dc.id and vd.doc_type = x.tipo and vd.is_active)
    )
    select d.*, d.vence - public.fn_today_for(d.org, null) as dias
      from docs d
      join public.organization_modules om on om.organization_id = d.org and om.module_code = 'transport' and om.is_active
     where d.vence - public.fn_today_for(d.org, null) between 0 and 30
  loop
    v_umbral := case when r.dias <= 7 then 7 when r.dias <= 15 then 15 else 30 end;
    v_nombre := case r.tipo
      when 'soat' then 'SOAT' when 'tecnomecanica' then 'Revisión técnico-mecánica' when 'poliza' then 'Póliza'
      when 'tarjeta_operacion' then 'Tarjeta de operación' when 'matricula' then 'Matrícula' when 'navegabilidad' then 'Certificado de navegabilidad'
      when 'licencia' then 'Licencia de conducción' when 'examen_medico' then 'Examen médico' else 'Documento' end;
    for u in
      select om.user_id from public.organization_members om
       where om.organization_id = r.org and om.is_active
         and public.fn_transporte_puede_actor(om.user_id, r.org, 'transporte.manage')
      union
      select r.conductor where r.conductor is not null
    loop
      if public.fn_avisos_miembro_poner(
           r.org, u, null, 'transporte.documento.vence', 'vehicle_document', r.ref_id,
           v_nombre || ' por vencer · ' || coalesce(r.dueno, ''),
           'Vence el ' || to_char(r.vence, 'DD/MM/YYYY') || ' (en ' || r.dias || ' días). Vencido, bloquea el despacho.',
           '/app/transporte/flota?estado=por_vencer',
           'transporte.doc:' || r.ref_id || ':' || r.tipo || ':' || r.vence || ':' || v_umbral || ':' || u
         ) is not null then
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end;
$$;
revoke all on function public.fn_transporte_avisar_vencimientos() from public, anon, authenticated;
grant execute on function public.fn_transporte_avisar_vencimientos() to service_role;

comment on function public.fn_transporte_avisar_vencimientos() is
  'Avisos de documentos de transporte a 30, 15 y 7 días (member_notices: campana y correo). Un aviso por umbral, documento y persona (idempotency_key). Lo corre el cron transporte-avisar-vencimientos.';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'transporte-avisar-vencimientos') then
    perform cron.unschedule('transporte-avisar-vencimientos');
  end if;
  perform cron.schedule('transporte-avisar-vencimientos', '25 11 * * *', 'select public.fn_transporte_avisar_vencimientos();');
end $$;
