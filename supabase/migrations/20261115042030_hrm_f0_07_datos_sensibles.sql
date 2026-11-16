-- HRM fase 0 · paso 7: lectura y escritura de datos sensibles con registro de
-- accesos, y metadatos de documentos. ADR-001 §7 y §10.
--
-- Las funciones con p_actor SOLO las ejecuta service_role: las llama el route
-- handler después de getServerOrgContext(), con el actor de la sesión y la IP y
-- el agente de la petición original. El navegador no puede llamarlas. Cada
-- lectura o edición deja su fila en hr_access_log en la misma transacción.

-- 1. Metadatos de documentos (el archivo vive en el bucket hr-documentos) ----------
create table if not exists public.hr_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  person_id       uuid not null references public.hr_people(id),
  employment_id   uuid references public.employments(id),
  data_group      text not null,
  category        text not null check (category ~ '^[a-z][a-z0-9_]{2,40}$'),
  storage_path    text not null unique,
  file_name       text not null,
  mime_type       text not null,
  size_bytes      bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256          text check (sha256 ~ '^[0-9a-f]{64}$'),
  valid_until     date,
  retention_until date,
  status          text not null default 'activo' check (status in ('activo','reemplazado','anulado')),
  replaced_by     uuid references public.hr_documents(id),
  uploaded_by     uuid not null,
  created_at      timestamptz not null default now(),
  constraint hr_documents_grupo_chk check (data_group = any (public.fn_hr_grupos_datos()))
);
comment on table public.hr_documents is
  'HRM: metadatos de documentos del empleado (ADR-001 §10). Sin acceso directo: se listan y descargan por RPC con registro.';
create index if not exists hr_documents_persona_idx on public.hr_documents (person_id, data_group) where status = 'activo';

drop trigger if exists trg_hr_documents_misma_org on public.hr_documents;
create trigger trg_hr_documents_misma_org before insert on public.hr_documents
  for each row execute function public.fn_hr_misma_org_persona();

alter table public.hr_documents enable row level security;
revoke all on public.hr_documents from anon, authenticated, public;

-- 2. Autorización por persona y grupo ------------------------------------------------
create or replace function public.fn_hr_actor_puede_grupo(p_actor uuid, p_org integer, p_person uuid, p_grupo text, p_accion text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_base text;
  v_propio boolean;
begin
  if p_actor is null or p_person is null
     or not (p_grupo = any (public.fn_hr_grupos_datos()))
     or p_accion not in ('ver','editar','exportar') then
    return false;
  end if;
  if not exists (select 1 from public.hr_people p where p.id = p_person and p.organization_id = p_org) then
    return false;
  end if;
  if not exists (select 1 from public.organization_members om
                  where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    return false;
  end if;
  v_base := 'hr.data.' || p_grupo;
  if p_accion = 'editar' then
    return public.fn_hr_puede_actor(p_actor, p_org, v_base || '.edit');
  end if;
  v_propio := exists (select 1 from public.hr_people p where p.id = p_person and p.user_id = p_actor)
           or exists (select 1 from public.employments e join public.organization_members om on om.id = e.organization_member_id
                       where e.person_id = p_person and om.user_id = p_actor);
  if p_accion = 'exportar' and not (v_propio or public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.export')) then
    return false;
  end if;
  return v_propio
      or public.fn_hr_puede_actor(p_actor, p_org, v_base || '.view')
      or exists (select 1 from public.employments e
                  where e.person_id = p_person
                    and e.id in (select public.fn_hr_equipo_empleos_actor(p_actor, v_base || '.view_team')));
end;
$$;

-- 3. Leer ------------------------------------------------------------------------------
create or replace function public.fn_hr_datos_sensibles_leer(
  p_actor uuid, p_org integer, p_person uuid, p_grupo text, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from public.hr_people p where p.id = p_person and p.organization_id = p_org) then
    raise exception 'hr: la persona no existe' using errcode = 'P0002';
  end if;
  if not public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, p_grupo, 'ver') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  if p_grupo = 'identificacion' then
    v := jsonb_build_object(
      'identificacion', (select to_jsonb(i) - 'organization_id' from public.hr_people_identification i where i.person_id = p_person),
      'beneficiarios', coalesce((select jsonb_agg(to_jsonb(b) - 'organization_id' order by b.created_at)
                                   from public.hr_person_beneficiaries b where b.person_id = p_person and b.is_active), '[]'::jsonb),
      'contactos_emergencia', coalesce((select jsonb_agg(to_jsonb(c) - 'organization_id' order by c.priority, c.created_at)
                                   from public.hr_person_emergency_contacts c where c.person_id = p_person and c.is_active), '[]'::jsonb));
  elsif p_grupo = 'banco' then
    v := jsonb_build_object('cuentas', coalesce((select jsonb_agg(to_jsonb(a) - 'organization_id' order by a.is_primary desc, a.created_at)
                                   from public.hr_person_bank_accounts a where a.person_id = p_person and a.is_active), '[]'::jsonb));
  elsif p_grupo = 'salario_pago' then
    v := jsonb_build_object(
      'historial', coalesce((select jsonb_agg(jsonb_build_object(
                     'id', ev.id, 'employment_id', ev.employment_id, 'campo', ev.field, 'desde', ev.effective_from,
                     'anterior', ev.old_value, 'nuevo', ev.new_value, 'motivo', ev.reason, 'estado', ev.status,
                     'aprobado_por', ev.approved_by, 'aprobado_en', ev.approved_at) order by ev.effective_from desc, ev.created_at desc)
                   from public.hr_employment_events ev join public.employments e on e.id = ev.employment_id
                  where e.person_id = p_person and ev.field in ('salario','periodo_salario')), '[]'::jsonb),
      'vigente', coalesce((select jsonb_agg(jsonb_build_object(
                     'employment_id', e.id,
                     'salario', public.fn_hr_valor_vigente_interno(e.id, 'salario', public.fn_today_for(e.organization_id, e.branch_id)),
                     'periodo', public.fn_hr_valor_vigente_interno(e.id, 'periodo_salario', public.fn_today_for(e.organization_id, e.branch_id))))
                   from public.employments e where e.person_id = p_person), '[]'::jsonb));
  end if;

  v := v || jsonb_build_object('grupo', p_grupo, 'persona_id', p_person,
    'documentos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'categoria', d.category, 'nombre', d.file_name, 'tipo', d.mime_type, 'tamano', d.size_bytes,
        'vence', d.valid_until, 'creado', d.created_at) order by d.created_at desc)
      from public.hr_documents d where d.person_id = p_person and d.data_group = p_grupo and d.status = 'activo'), '[]'::jsonb));

  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, p_person, null, p_grupo, 'ver', p_ip, p_ua, p_ruta, '{}'::jsonb);
  return v;
end;
$$;

-- 4. Guardar ------------------------------------------------------------------------------
-- p_datos (identificacion): { identificacion: {...}, beneficiarios: [...], contactos_emergencia: [...] }
-- p_datos (banco): { cuentas: [...] }
-- En las listas, un elemento con id actualiza (si es de la persona), sin id inserta,
-- y "is_active": false lo retira. Nada se borra.
create or replace function public.fn_hr_datos_sensibles_guardar(
  p_actor uuid, p_org integer, p_person uuid, p_grupo text, p_datos jsonb, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  j jsonb;
  it jsonb;
  v_campos text[] := '{}';
  v_id uuid;
  v_restriccion text;
begin
  if not exists (select 1 from public.hr_people p where p.id = p_person and p.organization_id = p_org) then
    raise exception 'hr: la persona no existe' using errcode = 'P0002';
  end if;
  if p_grupo not in ('identificacion','banco') then
    raise exception 'grupo_sin_edicion_directa: % se registra por su propio flujo', p_grupo using errcode = '22023';
  end if;
  if not public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, p_grupo, 'editar') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'hr: datos inválidos' using errcode = '22023';
  end if;

  if p_grupo = 'identificacion' then
    j := p_datos->'identificacion';
    if jsonb_typeof(j) = 'object' then
      select array_agg(k) into v_campos from jsonb_object_keys(j) k
       where k in ('doc_type','doc_number','doc_issue_date','doc_issue_place','birth_date','birth_place','sex','nationality',
                   'marital_status','personal_email','personal_phone','address','municipality_id','education_level');
      if exists (select 1 from public.hr_people_identification where person_id = p_person) then
        update public.hr_people_identification i set
          doc_type        = case when j ? 'doc_type' then j->>'doc_type' else i.doc_type end,
          doc_number      = case when j ? 'doc_number' then btrim(j->>'doc_number') else i.doc_number end,
          doc_issue_date  = case when j ? 'doc_issue_date' then (j->>'doc_issue_date')::date else i.doc_issue_date end,
          doc_issue_place = case when j ? 'doc_issue_place' then j->>'doc_issue_place' else i.doc_issue_place end,
          birth_date      = case when j ? 'birth_date' then (j->>'birth_date')::date else i.birth_date end,
          birth_place     = case when j ? 'birth_place' then j->>'birth_place' else i.birth_place end,
          sex             = case when j ? 'sex' then j->>'sex' else i.sex end,
          nationality     = case when j ? 'nationality' then j->>'nationality' else i.nationality end,
          marital_status  = case when j ? 'marital_status' then j->>'marital_status' else i.marital_status end,
          personal_email  = case when j ? 'personal_email' then j->>'personal_email' else i.personal_email end,
          personal_phone  = case when j ? 'personal_phone' then j->>'personal_phone' else i.personal_phone end,
          address         = case when j ? 'address' then j->>'address' else i.address end,
          municipality_id = case when j ? 'municipality_id' then (j->>'municipality_id')::uuid else i.municipality_id end,
          education_level = case when j ? 'education_level' then j->>'education_level' else i.education_level end,
          updated_by      = p_actor
         where i.person_id = p_person;
      else
        insert into public.hr_people_identification
          (person_id, organization_id, doc_type, doc_number, doc_issue_date, doc_issue_place, birth_date, birth_place, sex,
           nationality, marital_status, personal_email, personal_phone, address, municipality_id, education_level, updated_by)
        values (p_person, p_org, j->>'doc_type', btrim(j->>'doc_number'), (j->>'doc_issue_date')::date, j->>'doc_issue_place',
                (j->>'birth_date')::date, j->>'birth_place', j->>'sex', j->>'nationality', j->>'marital_status',
                j->>'personal_email', j->>'personal_phone', j->>'address', (j->>'municipality_id')::uuid, j->>'education_level', p_actor);
      end if;
    end if;

    if jsonb_typeof(p_datos->'beneficiarios') = 'array' then
      v_campos := v_campos || 'beneficiarios';
      for it in select * from jsonb_array_elements(p_datos->'beneficiarios') loop
        v_id := nullif(it->>'id', '')::uuid;
        if v_id is not null then
          update public.hr_person_beneficiaries b set
            full_name = coalesce(it->>'full_name', b.full_name),
            relationship = coalesce(it->>'relationship', b.relationship),
            doc_type = case when it ? 'doc_type' then it->>'doc_type' else b.doc_type end,
            doc_number = case when it ? 'doc_number' then it->>'doc_number' else b.doc_number end,
            birth_date = case when it ? 'birth_date' then (it->>'birth_date')::date else b.birth_date end,
            is_tax_dependent = coalesce((it->>'is_tax_dependent')::boolean, b.is_tax_dependent),
            is_ccf_beneficiary = coalesce((it->>'is_ccf_beneficiary')::boolean, b.is_ccf_beneficiary),
            is_health_beneficiary = coalesce((it->>'is_health_beneficiary')::boolean, b.is_health_beneficiary),
            is_active = coalesce((it->>'is_active')::boolean, b.is_active),
            notes = case when it ? 'notes' then it->>'notes' else b.notes end,
            updated_by = p_actor
           where b.id = v_id and b.person_id = p_person;
          if not found then raise exception 'hr: el beneficiario no es de la persona' using errcode = '42501'; end if;
        else
          insert into public.hr_person_beneficiaries (organization_id, person_id, full_name, relationship, doc_type, doc_number,
            birth_date, is_tax_dependent, is_ccf_beneficiary, is_health_beneficiary, notes, updated_by)
          values (p_org, p_person, it->>'full_name', it->>'relationship', it->>'doc_type', it->>'doc_number', (it->>'birth_date')::date,
            coalesce((it->>'is_tax_dependent')::boolean, false), coalesce((it->>'is_ccf_beneficiary')::boolean, false),
            coalesce((it->>'is_health_beneficiary')::boolean, false), it->>'notes', p_actor);
        end if;
      end loop;
    end if;

    if jsonb_typeof(p_datos->'contactos_emergencia') = 'array' then
      v_campos := v_campos || 'contactos_emergencia';
      for it in select * from jsonb_array_elements(p_datos->'contactos_emergencia') loop
        v_id := nullif(it->>'id', '')::uuid;
        if v_id is not null then
          update public.hr_person_emergency_contacts c set
            full_name = coalesce(it->>'full_name', c.full_name),
            relationship = case when it ? 'relationship' then it->>'relationship' else c.relationship end,
            phone = coalesce(it->>'phone', c.phone),
            alt_phone = case when it ? 'alt_phone' then it->>'alt_phone' else c.alt_phone end,
            priority = coalesce((it->>'priority')::smallint, c.priority),
            is_active = coalesce((it->>'is_active')::boolean, c.is_active),
            updated_by = p_actor
           where c.id = v_id and c.person_id = p_person;
          if not found then raise exception 'hr: el contacto no es de la persona' using errcode = '42501'; end if;
        else
          insert into public.hr_person_emergency_contacts (organization_id, person_id, full_name, relationship, phone, alt_phone, priority, updated_by)
          values (p_org, p_person, it->>'full_name', it->>'relationship', it->>'phone', it->>'alt_phone',
                  coalesce((it->>'priority')::smallint, 1), p_actor);
        end if;
      end loop;
    end if;

  elsif p_grupo = 'banco' then
    if jsonb_typeof(p_datos->'cuentas') <> 'array' then
      raise exception 'hr: se esperaba la lista de cuentas' using errcode = '22023';
    end if;
    v_campos := array['cuentas'];
    for it in select * from jsonb_array_elements(p_datos->'cuentas') loop
      v_id := nullif(it->>'id', '')::uuid;
      if coalesce((it->>'is_primary')::boolean, false) then
        update public.hr_person_bank_accounts set is_primary = false
         where person_id = p_person and is_primary and (v_id is null or id <> v_id);
      end if;
      if v_id is not null then
        update public.hr_person_bank_accounts a set
          bank_code = case when it ? 'bank_code' then it->>'bank_code' else a.bank_code end,
          bank_name = coalesce(it->>'bank_name', a.bank_name),
          account_type = coalesce(it->>'account_type', a.account_type),
          account_number = coalesce(btrim(it->>'account_number'), a.account_number),
          holder_name = case when it ? 'holder_name' then it->>'holder_name' else a.holder_name end,
          is_primary = coalesce((it->>'is_primary')::boolean, a.is_primary),
          valid_from = case when it ? 'valid_from' then (it->>'valid_from')::date else a.valid_from end,
          valid_to = case when it ? 'valid_to' then (it->>'valid_to')::date else a.valid_to end,
          is_active = coalesce((it->>'is_active')::boolean, a.is_active),
          updated_by = p_actor
         where a.id = v_id and a.person_id = p_person;
        if not found then raise exception 'hr: la cuenta no es de la persona' using errcode = '42501'; end if;
      else
        insert into public.hr_person_bank_accounts (organization_id, person_id, bank_code, bank_name, account_type, account_number,
          holder_name, is_primary, valid_from, valid_to, updated_by)
        values (p_org, p_person, it->>'bank_code', it->>'bank_name', it->>'account_type', btrim(it->>'account_number'),
          it->>'holder_name', coalesce((it->>'is_primary')::boolean, false), (it->>'valid_from')::date, (it->>'valid_to')::date, p_actor);
      end if;
    end loop;
  end if;

  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, p_person, null, p_grupo, 'editar', p_ip, p_ua, p_ruta,
    jsonb_build_object('campos', to_jsonb(coalesce(v_campos, '{}'))));
  return jsonb_build_object('ok', true, 'grupo', p_grupo, 'campos', to_jsonb(coalesce(v_campos, '{}')));
exception
  when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'hr_people_identification_doc_uq' then
      raise exception 'documento_duplicado: ya hay una persona con ese documento en la organización' using errcode = '23505';
    end if;
    raise;
end;
$$;

-- 5. Crear persona (con su documento si viene) ---------------------------------------------
create or replace function public.fn_hr_persona_crear(p_actor uuid, p_org integer, p_datos jsonb, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.create') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if jsonb_typeof(p_datos->'identificacion') = 'object'
     and not public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.identificacion.edit') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  insert into public.hr_people (organization_id, first_name, second_name, last_name, second_last_name, preferred_name,
                                work_email, work_phone, created_by, updated_by)
  values (p_org, btrim(p_datos->>'first_name'), p_datos->>'second_name', p_datos->>'last_name', p_datos->>'second_last_name',
          p_datos->>'preferred_name', p_datos->>'work_email', p_datos->>'work_phone', p_actor, p_actor)
  returning id into v_id;
  if jsonb_typeof(p_datos->'identificacion') = 'object' then
    perform public.fn_hr_datos_sensibles_guardar(p_actor, p_org, v_id, 'identificacion',
      jsonb_build_object('identificacion', p_datos->'identificacion'), p_ip, p_ua, p_ruta);
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

-- 6. Documentos: registrar después de subir y autorizar la descarga ------------------------
create or replace function public.fn_hr_documento_registrar(
  p_actor uuid, p_org integer, p_person uuid, p_grupo text, p_categoria text, p_path text, p_nombre text,
  p_mime text, p_size bigint, p_sha256 text, p_valid_until date, p_employment uuid, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, p_grupo, 'editar') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_path is null or p_path not like (p_org::text || '/' || p_grupo || '/' || p_person::text || '/%') or p_path like '%..%' then
    raise exception 'hr: la ruta del documento no corresponde a la persona y el grupo' using errcode = '22023';
  end if;
  if p_employment is not null and not exists (select 1 from public.employments e where e.id = p_employment and e.person_id = p_person) then
    raise exception 'hr: el vínculo no es de la persona' using errcode = '22023';
  end if;
  insert into public.hr_documents (organization_id, person_id, employment_id, data_group, category, storage_path, file_name,
                                   mime_type, size_bytes, sha256, valid_until, uploaded_by)
  values (p_org, p_person, p_employment, p_grupo, p_categoria, p_path, left(p_nombre, 200), p_mime, p_size, lower(p_sha256), p_valid_until, p_actor)
  returning id into v_id;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, p_person, p_employment, p_grupo, 'editar', p_ip, p_ua, p_ruta,
    jsonb_build_object('documento', v_id, 'categoria', p_categoria));
  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.fn_hr_documento_autorizar_descarga(
  p_actor uuid, p_org integer, p_documento uuid, p_ip text, p_ua text, p_ruta text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  d public.hr_documents;
begin
  select * into d from public.hr_documents where id = p_documento and organization_id = p_org;
  if not found then
    raise exception 'hr: el documento no existe' using errcode = 'P0002';
  end if;
  if not public.fn_hr_actor_puede_grupo(p_actor, p_org, d.person_id, d.data_group, 'ver') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, d.person_id, d.employment_id, d.data_group, 'ver', p_ip, p_ua, p_ruta,
    jsonb_build_object('documento', d.id, 'categoria', d.category));
  return d.storage_path;
end;
$$;

-- Exportación (la llama el servidor antes de generar un archivo con datos sensibles).
create or replace function public.fn_hr_registrar_exportacion(
  p_actor uuid, p_org integer, p_person uuid, p_grupo text, p_ip text, p_ua text, p_ruta text, p_detalle jsonb)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, p_grupo, 'exportar') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, p_person, null, p_grupo, 'exportar', p_ip, p_ua, p_ruta, p_detalle);
end;
$$;

-- 7. Qué puede hacer el usuario de la sesión (para que la UI muestre u oculte) -------------
create or replace function public.fn_hr_mis_permisos(p_org integer)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  g text;
  v_grupos jsonb := '{}'::jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    raise exception 'hr: se necesita una sesión' using errcode = '42501';
  end if;
  foreach g in array public.fn_hr_grupos_datos() loop
    v_grupos := v_grupos || jsonb_build_object(g, jsonb_build_object(
      'ver', public.fn_hr_puede(p_org, 'hr.data.' || g || '.view'),
      'ver_equipo', public.fn_hr_puede(p_org, 'hr.data.' || g || '.view_team'),
      'editar', public.fn_hr_puede(p_org, 'hr.data.' || g || '.edit')));
  end loop;
  return jsonb_build_object(
    'empleados', jsonb_build_object('ver', public.fn_hr_puede(p_org, 'hr.employees.view'),
                                    'ver_equipo', public.fn_hr_puede(p_org, 'hr.employees.view_team'),
                                    'crear', public.fn_hr_puede(p_org, 'hr.employees.create'),
                                    'editar', public.fn_hr_puede(p_org, 'hr.employees.edit')),
    'grupos', v_grupos,
    'exportar', public.fn_hr_puede(p_org, 'hr.data.export'),
    'asistencia', jsonb_build_object('ver', public.fn_hr_puede(p_org, 'hr.attendance.view'),
                                     'gestionar', public.fn_hr_puede(p_org, 'hr.attendance.manage')),
    'ausencias', jsonb_build_object('ver', public.fn_hr_puede(p_org, 'hr.leaves.view'),
                                    'aprobar', public.fn_hr_puede(p_org, 'hr.leaves.approve')),
    'nomina', jsonb_build_object('ver', public.fn_hr_puede(p_org, 'hr.payroll.view'),
                                 'procesar', public.fn_hr_puede(p_org, 'hr.payroll.process')),
    'aprobaciones', public.fn_hr_puede(p_org, 'hr.approvals.manage'),
    'parametros', public.fn_hr_puede(p_org, 'hr.parameters.manage'),
    'registro_accesos', public.fn_hr_puede(p_org, 'hr.access_log.view'));
end;
$$;

revoke execute on function public.fn_hr_actor_puede_grupo(uuid, integer, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_datos_sensibles_leer(uuid, integer, uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_datos_sensibles_guardar(uuid, integer, uuid, text, jsonb, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_persona_crear(uuid, integer, jsonb, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_documento_registrar(uuid, integer, uuid, text, text, text, text, text, bigint, text, date, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_documento_autorizar_descarga(uuid, integer, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_registrar_exportacion(uuid, integer, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_hr_mis_permisos(integer) from public, anon;
grant execute on function public.fn_hr_actor_puede_grupo(uuid, integer, uuid, text, text) to service_role;
grant execute on function public.fn_hr_datos_sensibles_leer(uuid, integer, uuid, text, text, text, text) to service_role;
grant execute on function public.fn_hr_datos_sensibles_guardar(uuid, integer, uuid, text, jsonb, text, text, text) to service_role;
grant execute on function public.fn_hr_persona_crear(uuid, integer, jsonb, text, text, text) to service_role;
grant execute on function public.fn_hr_documento_registrar(uuid, integer, uuid, text, text, text, text, text, bigint, text, date, uuid, text, text, text) to service_role;
grant execute on function public.fn_hr_documento_autorizar_descarga(uuid, integer, uuid, text, text, text) to service_role;
grant execute on function public.fn_hr_registrar_exportacion(uuid, integer, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.fn_hr_mis_permisos(integer) to authenticated;
