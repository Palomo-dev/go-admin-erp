-- Facturación electrónica como servicio de la plataforma + cola que reintenta.
--
-- Modelo (decisión del dueño, 2026-09-23): GO Admin presta la facturación
-- electrónica con el plan SaaS de Factus. Cada organización emite con SU NIT,
-- con una cuenta de Factus propia cuyas credenciales carga el equipo de la
-- plataforma (panel go-admin-super), nunca el cliente. Una cuenta de Factus es
-- UNA empresa emisora: el NIT sale del token, no del documento.
--
-- 1. electronic_invoicing_config: estado del servicio por organización y
--    credenciales cifradas en Supabase Vault (credentials_secret_id). Las
--    columnas de texto heredadas (client_id, client_secret, username,
--    password) quedan vacías por un trigger y sin permiso de lectura para el
--    cliente. Solo el servidor (service_role) guarda y lee credenciales, por
--    RPC SECURITY DEFINER sin EXECUTE para anon/authenticated.
-- 2. invoice_sales: el estado electrónico va en su propia columna
--    (einvoice_status), nunca en status (que es contable: draft, issued,
--    paid, partial, void). Número DIAN y QR en einvoice_number / einvoice_qr.
-- 3. electronic_invoicing_jobs: reference_code (idempotencia ante Factus y
--    webhook), bloqueo de envío (locked_at/locked_by), un solo job vivo por
--    documento (índices únicos parciales), y dos RPC: reclamar jobs
--    (FOR UPDATE SKIP LOCKED, solo organizaciones con el servicio activo) y
--    registrar el resultado de un intento en una transacción.
--
-- Aditiva: columnas NULL-ables o con DEFAULT; sin DROP de tablas ni columnas.
-- La política ALL de electronic_invoicing_config se sustituye por una de solo
-- lectura (la tabla tiene 0 filas).

-- ─── 1. Configuración por organización ──────────────────────────────────────

alter table public.electronic_invoicing_config
  add column if not exists service_status text not null default 'pending_activation',
  add column if not exists credentials_secret_id uuid,
  add column if not exists factus_company_nit text,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by uuid,
  add column if not exists last_check_at timestamptz,
  add column if not exists last_check_ok boolean,
  add column if not exists last_check_message text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'electronic_invoicing_config_service_status_check'
      and conrelid = 'public.electronic_invoicing_config'::regclass
  ) then
    alter table public.electronic_invoicing_config
      add constraint electronic_invoicing_config_service_status_check
      check (service_status in ('pending_activation', 'active', 'suspended'));
  end if;
end $$;

comment on column public.electronic_invoicing_config.service_status is
  'Servicio de facturación electrónica de GO Admin para la organización: pending_activation (sin credenciales verificadas: la cola no envía nada), active, suspended.';
comment on column public.electronic_invoicing_config.credentials_secret_id is
  'Id en vault.secrets del JSON con las credenciales de Factus de la organización. Solo lo lee el servidor (fn_factus_credenciales_leer).';
comment on column public.electronic_invoicing_config.factus_company_nit is
  'NIT de la empresa que devuelve Factus (GET /v2/companies) con esas credenciales; debe coincidir con el NIT de la organización para emitir.';
comment on column public.electronic_invoicing_config.client_secret is
  'OBSOLETA: las credenciales viven cifradas en Vault. Un trigger impide escribir aquí.';
comment on column public.electronic_invoicing_config.password is
  'OBSOLETA: las credenciales viven cifradas en Vault. Un trigger impide escribir aquí.';

create or replace function public.fn_eic_sin_secretos_en_claro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.client_secret is not null or new.password is not null
     or new.client_id is not null or new.username is not null then
    raise exception 'Las credenciales de facturación electrónica se guardan cifradas en Vault, no en columnas de texto'
      using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists trg_eic_sin_secretos_en_claro on public.electronic_invoicing_config;
create trigger trg_eic_sin_secretos_en_claro
  before insert or update on public.electronic_invoicing_config
  for each row execute function public.fn_eic_sin_secretos_en_claro();

-- RLS: los miembros solo LEEN el estado del servicio; nadie escribe desde el cliente.
drop policy if exists "Users can manage their org e-invoicing config" on public.electronic_invoicing_config;
drop policy if exists eic_select_miembros on public.electronic_invoicing_config;
create policy eic_select_miembros on public.electronic_invoicing_config
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

revoke all on public.electronic_invoicing_config from anon, authenticated;
grant select (
  id, organization_id, provider, environment, is_active, service_status,
  factus_company_nit, activated_at, last_check_at, last_check_ok,
  created_at, updated_at
) on public.electronic_invoicing_config to authenticated;

-- Guardar credenciales (plataforma). Deja el servicio pendiente de verificación.
create or replace function public.fn_factus_credenciales_guardar(
  p_organization_id integer,
  p_environment text,
  p_client_id text,
  p_client_secret text,
  p_username text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_name text := format('factus_credenciales_org_%s', p_organization_id);
  v_payload text;
begin
  if p_environment is null or p_environment not in ('sandbox', 'production') then
    raise exception 'Ambiente inválido: use sandbox o production' using errcode = '22023';
  end if;
  if coalesce(btrim(p_client_id), '') = '' or coalesce(btrim(p_client_secret), '') = ''
     or coalesce(btrim(p_username), '') = '' or coalesce(btrim(p_password), '') = '' then
    raise exception 'Faltan credenciales: client_id, client_secret, usuario y contraseña son obligatorios' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    raise exception 'La organización % no existe', p_organization_id using errcode = 'P0002';
  end if;

  v_payload := jsonb_build_object(
    'client_id', btrim(p_client_id),
    'client_secret', btrim(p_client_secret),
    'username', btrim(p_username),
    'password', p_password
  )::text;

  select c.credentials_secret_id into v_secret_id
  from public.electronic_invoicing_config c
  where c.organization_id = p_organization_id and c.provider = 'factus'
  for update;

  if v_secret_id is null then
    select s.id into v_secret_id from vault.secrets s where s.name = v_name;
  end if;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(v_payload, v_name, 'Credenciales de Factus de la organización (las carga la plataforma)');
  else
    perform vault.update_secret(v_secret_id, v_payload, v_name, 'Credenciales de Factus de la organización (las carga la plataforma)');
  end if;

  insert into public.electronic_invoicing_config
    (organization_id, provider, environment, credentials_secret_id, service_status, is_active)
  values
    (p_organization_id, 'factus', p_environment, v_secret_id, 'pending_activation', true)
  on conflict (organization_id, provider) do update
    set environment = excluded.environment,
        credentials_secret_id = excluded.credentials_secret_id,
        service_status = 'pending_activation',
        factus_company_nit = null,
        activated_at = null,
        activated_by = null,
        last_check_at = null,
        last_check_ok = null,
        last_check_message = null,
        is_active = true,
        updated_at = now();

  return v_secret_id;
end $$;

-- Leer credenciales (solo servidor). Por defecto solo si el servicio está activo.
create or replace function public.fn_factus_credenciales_leer(
  p_organization_id integer,
  p_incluir_pendiente boolean default false
)
returns table (
  environment text,
  client_id text,
  client_secret text,
  username text,
  password text,
  service_status text,
  factus_company_nit text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    c.environment,
    (s.decrypted_secret::jsonb ->> 'client_id'),
    (s.decrypted_secret::jsonb ->> 'client_secret'),
    (s.decrypted_secret::jsonb ->> 'username'),
    (s.decrypted_secret::jsonb ->> 'password'),
    c.service_status,
    c.factus_company_nit
  from public.electronic_invoicing_config c
  join vault.decrypted_secrets s on s.id = c.credentials_secret_id
  where c.organization_id = p_organization_id
    and c.provider = 'factus'
    and c.is_active
    and (c.service_status = 'active' or (p_incluir_pendiente and c.service_status = 'pending_activation'))
$$;

-- Cambiar el estado del servicio (plataforma) o registrar la verificación (servidor del ERP).
-- Activar exige credenciales guardadas y la verificación del NIT hecha por el servidor
-- (p_company_nit = NIT que devuelve Factus), que debe coincidir con el de la organización.
create or replace function public.fn_factus_servicio_estado(
  p_organization_id integer,
  p_status text,
  p_actor uuid default null,
  p_company_nit text default null,
  p_check_ok boolean default null,
  p_check_message text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg public.electronic_invoicing_config%rowtype;
  v_org_nit text;
  v_factus_nit text := nullif(regexp_replace(coalesce(p_company_nit, ''), '[^0-9]', '', 'g'), '');
begin
  if p_status is null or p_status not in ('pending_activation', 'active', 'suspended') then
    raise exception 'Estado inválido' using errcode = '22023';
  end if;

  select * into v_cfg
  from public.electronic_invoicing_config c
  where c.organization_id = p_organization_id and c.provider = 'factus'
  for update;
  if not found then
    raise exception 'La organización % no tiene credenciales de facturación electrónica', p_organization_id using errcode = 'P0002';
  end if;

  if p_status = 'active' then
    if v_cfg.credentials_secret_id is null then
      raise exception 'No se puede activar sin credenciales guardadas' using errcode = 'P0001';
    end if;
    v_factus_nit := coalesce(v_factus_nit, v_cfg.factus_company_nit);
    if v_factus_nit is null then
      raise exception 'No se puede activar sin verificar las credenciales contra Factus' using errcode = 'P0001';
    end if;
    select nullif(regexp_replace(coalesce(o.nit, o.tax_id, ''), '[^0-9]', '', 'g'), '')
      into v_org_nit
    from public.organizations o where o.id = p_organization_id;
    -- El NIT de la organización puede venir con o sin dígito de verificación.
    if v_org_nit is null
       or not (v_org_nit = v_factus_nit
               or (length(v_org_nit) = length(v_factus_nit) + 1 and left(v_org_nit, length(v_factus_nit)) = v_factus_nit)) then
      raise exception 'El NIT de la cuenta de Factus no coincide con el de la organización' using errcode = 'P0001';
    end if;
  end if;

  update public.electronic_invoicing_config c
     set service_status = p_status,
         factus_company_nit = coalesce(v_factus_nit, c.factus_company_nit),
         activated_at = case when p_status = 'active' then coalesce(c.activated_at, now()) else null end,
         activated_by = case when p_status = 'active' then coalesce(p_actor, c.activated_by) else null end,
         last_check_at = case when p_check_ok is not null then now() else c.last_check_at end,
         last_check_ok = coalesce(p_check_ok, c.last_check_ok),
         last_check_message = case when p_check_ok is not null then left(p_check_message, 500) else c.last_check_message end,
         updated_at = now()
   where c.id = v_cfg.id;

  return p_status;
end $$;

-- ─── 2. Estado electrónico propio del documento ─────────────────────────────

alter table public.invoice_sales
  add column if not exists einvoice_status text,
  add column if not exists einvoice_number text,
  add column if not exists einvoice_qr text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoice_sales_einvoice_status_check'
      and conrelid = 'public.invoice_sales'::regclass
  ) then
    alter table public.invoice_sales
      add constraint invoice_sales_einvoice_status_check
      check (einvoice_status is null or einvoice_status in
        ('pending', 'processing', 'sent', 'accepted', 'rejected', 'failed', 'cancelled'));
  end if;
end $$;

comment on column public.invoice_sales.einvoice_status is
  'Estado de la facturación electrónica del documento (DIAN vía Factus). Independiente de status, que es contable.';
comment on column public.invoice_sales.einvoice_number is
  'Número asignado por la DIAN/Factus al documento electrónico (prefijo + consecutivo del rango).';
comment on column public.invoice_sales.einvoice_qr is
  'URL o contenido del QR de la DIAN que devuelve Factus.';

-- ─── 3. Cola ────────────────────────────────────────────────────────────────

alter table public.electronic_invoicing_jobs
  add column if not exists reference_code text,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text;

comment on column public.electronic_invoicing_jobs.reference_code is
  'reference_code enviado a Factus. Estable entre reintentos: Factus responde con el documento existente si ya lo procesó.';
comment on column public.electronic_invoicing_jobs.locked_by is
  'Proceso que tiene el envío en vuelo (fn_einvoicing_reclamar_jobs). Solo ese proceso puede registrar el resultado.';

create index if not exists idx_ei_jobs_reference_code
  on public.electronic_invoicing_jobs (reference_code) where reference_code is not null;
create unique index if not exists uq_ei_jobs_documento_vivo
  on public.electronic_invoicing_jobs (invoice_id, document_type)
  where invoice_id is not null and status <> 'cancelled';
create unique index if not exists uq_ei_jobs_documento_soporte_vivo
  on public.electronic_invoicing_jobs (support_document_id)
  where support_document_id is not null and status <> 'cancelled';

-- El trigger de cambios de estado deja de registrar las transiciones hacia o
-- desde 'processing': esas las registra con detalle fn_einvoicing_registrar_resultado.
create or replace function public.fn_ei_jobs_status_change()
returns trigger
language plpgsql
as $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status
       AND NEW.status <> 'processing' AND OLD.status <> 'processing' THEN
        INSERT INTO electronic_invoicing_events (job_id, organization_id, event_type, event_code, event_message, metadata)
        VALUES (
            NEW.id,
            NEW.organization_id,
            CASE
                WHEN NEW.status = 'accepted' THEN 'accepted'
                WHEN NEW.status = 'rejected' THEN 'rejected'
                WHEN NEW.status = 'sent' THEN 'sent'
                WHEN NEW.status = 'failed' THEN 'error'
                WHEN NEW.status = 'cancelled' THEN 'cancelled'
                ELSE 'notification'
            END,
            NEW.error_code,
            COALESCE(NEW.error_message, 'Estado cambiado a ' || NEW.status),
            jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status, 'attempt', NEW.attempt_count)
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Reclamar jobs para enviarlos: solo organizaciones con el servicio activo y
-- credenciales guardadas. Un job 'processing' abandonado más de 10 minutos
-- vuelve a reclamarse (se reenvía con el mismo reference_code).
create or replace function public.fn_einvoicing_reclamar_jobs(
  p_worker text,
  p_limite integer default 10,
  p_job_id uuid default null
)
returns setof public.electronic_invoicing_jobs
language plpgsql
security definer
-- public (no ''): los triggers de las tablas que toca usan nombres sin esquema.
set search_path = public
as $$
begin
  if coalesce(btrim(p_worker), '') = '' then
    raise exception 'p_worker es obligatorio' using errcode = '22023';
  end if;

  return query
  with candidatos as (
    select j.id
    from public.electronic_invoicing_jobs j
    join public.electronic_invoicing_config c
      on c.organization_id = j.organization_id
     and c.provider = 'factus'
     and c.is_active
     and c.service_status = 'active'
     and c.credentials_secret_id is not null
    where j.provider = 'factus'
      and (p_job_id is null or j.id = p_job_id)
      and (
        (j.status = 'pending'
          and j.attempt_count < j.max_attempts
          and (j.next_retry_at is null or j.next_retry_at <= now()))
        or (j.status = 'processing' and j.locked_at is not null and j.locked_at < now() - interval '10 minutes')
      )
    order by coalesce(j.next_retry_at, j.created_at)
    limit greatest(1, least(coalesce(p_limite, 10), 50))
    for update of j skip locked
  )
  update public.electronic_invoicing_jobs j
     set status = 'processing',
         locked_at = now(),
         locked_by = p_worker
    from candidatos
   where j.id = candidatos.id
  returning j.*;
end $$;

-- Registrar el resultado de un intento, en una transacción: job, documento y evento.
-- p_estado: accepted | sent | rejected | pending (reintento o liberación) | failed.
-- Solo el proceso que reclamó el job (locked_by) puede registrarlo.
create or replace function public.fn_einvoicing_registrar_resultado(
  p_job_id uuid,
  p_worker text,
  p_estado text,
  p_contar_intento boolean default true,
  p_next_retry_at timestamptz default null,
  p_reference_code text default null,
  p_request_payload jsonb default null,
  p_response_payload jsonb default null,
  p_cufe text default null,
  p_numero text default null,
  p_qr text default null,
  p_qr_image text default null,
  p_validated_at timestamptz default null,
  p_error_code text default null,
  p_error_message text default null,
  p_evento_meta jsonb default null
)
returns public.electronic_invoicing_jobs
language plpgsql
security definer
-- public (no ''): audit_finance_changes y los demás triggers de invoice_sales
-- usan nombres sin esquema y heredan este search_path.
set search_path = public
as $$
declare
  v_job public.electronic_invoicing_jobs%rowtype;
  v_estado text := p_estado;
  v_intentos smallint;
  v_exito boolean;
  v_evento text;
begin
  if p_estado is null or p_estado not in ('accepted', 'sent', 'rejected', 'pending', 'failed') then
    raise exception 'Estado de resultado inválido: %', p_estado using errcode = '22023';
  end if;

  select * into v_job from public.electronic_invoicing_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job % no existe', p_job_id using errcode = 'P0002';
  end if;
  if v_job.status <> 'processing' or v_job.locked_by is distinct from p_worker then
    raise exception 'El job % no está reclamado por este proceso', p_job_id using errcode = 'P0001';
  end if;

  v_intentos := v_job.attempt_count + case when p_contar_intento then 1 else 0 end;
  if v_estado = 'pending' and v_intentos >= v_job.max_attempts then
    v_estado := 'failed';
  end if;
  v_exito := v_estado in ('accepted', 'sent');

  update public.electronic_invoicing_jobs j
     set status = v_estado,
         attempt_count = v_intentos,
         next_retry_at = case when v_estado = 'pending' then p_next_retry_at else null end,
         reference_code = coalesce(p_reference_code, j.reference_code),
         request_payload = coalesce(p_request_payload, j.request_payload),
         response_payload = coalesce(p_response_payload, j.response_payload),
         cufe = coalesce(p_cufe, j.cufe),
         qr_code = coalesce(p_qr, j.qr_code),
         error_code = case when v_exito then null else coalesce(p_error_code, j.error_code) end,
         error_message = case when v_exito then null else coalesce(left(p_error_message, 2000), j.error_message) end,
         processed_at = case when v_exito then now() else j.processed_at end,
         locked_at = null,
         locked_by = null
   where j.id = v_job.id
  returning * into v_job;

  if v_job.document_type = 'support_document' and v_job.support_document_id is not null then
    update public.support_documents d
       set status = case v_estado when 'pending' then 'pending' else v_estado end,
           cufe = coalesce(p_cufe, d.cufe),
           number = coalesce(p_numero, d.number),
           qr_code = coalesce(p_qr, d.qr_code),
           qr_image = coalesce(p_qr_image, d.qr_image),
           is_validated = case when v_estado = 'accepted' then true else d.is_validated end,
           validated_at = coalesce(p_validated_at, d.validated_at),
           factus_response = coalesce(p_response_payload, d.factus_response),
           error_code = case when v_exito then null else coalesce(p_error_code, d.error_code) end,
           error_message = case when v_exito then null else coalesce(left(p_error_message, 2000), d.error_message) end,
           sent_to_dian = case when v_exito then true else d.sent_to_dian end,
           sent_at = case when v_exito then coalesce(d.sent_at, now()) else d.sent_at end,
           updated_at = now()
     where d.id = v_job.support_document_id
       and d.organization_id = v_job.organization_id;
  elsif v_job.invoice_id is not null then
    update public.invoice_sales i
       set einvoice_status = v_estado,
           xml_uuid = coalesce(p_cufe, i.xml_uuid),
           einvoice_number = coalesce(p_numero, i.einvoice_number),
           einvoice_qr = coalesce(p_qr, i.einvoice_qr),
           qr_image = coalesce(p_qr_image, i.qr_image),
           validated_at = coalesce(p_validated_at, i.validated_at)
     where i.id = v_job.invoice_id
       and i.organization_id = v_job.organization_id;
  end if;

  v_evento := case v_estado
    when 'accepted' then 'accepted'
    when 'sent' then 'sent'
    when 'rejected' then 'rejected'
    when 'pending' then case when p_contar_intento then 'retry' else 'notification' end
    else 'error'
  end;

  insert into public.electronic_invoicing_events
    (job_id, organization_id, event_type, event_code, event_message, metadata)
  values (
    v_job.id,
    v_job.organization_id,
    v_evento,
    p_error_code,
    case
      when v_exito then 'Documento ' || coalesce(p_numero, '') || ' ' || case when v_estado = 'accepted' then 'aceptado por la DIAN' else 'enviado' end
      when v_estado = 'pending' and not p_contar_intento then coalesce(p_error_message, 'Envío liberado sin intentar')
      else coalesce(left(p_error_message, 2000), 'Error sin detalle')
    end,
    coalesce(p_evento_meta, '{}'::jsonb) || jsonb_build_object(
      'intento', v_intentos,
      'max_intentos', v_job.max_attempts,
      'estado', v_estado,
      'siguiente_intento', v_job.next_retry_at,
      'cufe', p_cufe,
      'numero', p_numero
    )
  );

  return v_job;
end $$;

-- ─── Permisos de las funciones: solo el servidor ────────────────────────────

revoke all on function public.fn_factus_credenciales_guardar(integer, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.fn_factus_credenciales_leer(integer, boolean) from public, anon, authenticated;
revoke all on function public.fn_factus_servicio_estado(integer, text, uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.fn_einvoicing_reclamar_jobs(text, integer, uuid) from public, anon, authenticated;
revoke all on function public.fn_einvoicing_registrar_resultado(uuid, text, text, boolean, timestamptz, text, jsonb, jsonb, text, text, text, text, timestamptz, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.fn_eic_sin_secretos_en_claro() from public, anon, authenticated;

grant execute on function public.fn_factus_credenciales_guardar(integer, text, text, text, text, text) to service_role;
grant execute on function public.fn_factus_credenciales_leer(integer, boolean) to service_role;
grant execute on function public.fn_factus_servicio_estado(integer, text, uuid, text, boolean, text) to service_role;
grant execute on function public.fn_einvoicing_reclamar_jobs(text, integer, uuid) to service_role;
grant execute on function public.fn_einvoicing_registrar_resultado(uuid, text, text, boolean, timestamptz, text, jsonb, jsonb, text, text, text, text, timestamptz, text, text, jsonb) to service_role;

-- Los 8 documentos que ya estaban en cola quedan marcados como pendientes en
-- su columna electrónica (la cola no los enviará hasta que su organización
-- tenga el servicio activo).
update public.invoice_sales i
   set einvoice_status = 'pending'
  from public.electronic_invoicing_jobs j
 where j.invoice_id = i.id
   and j.status = 'pending'
   and i.einvoice_status is null;
