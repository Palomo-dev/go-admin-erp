-- HRM · Marcación M1 · paso 1: esquema del kiosco (tablet) y del lector de carnés.
-- Plan: docs/hrm/PLAN-MARCACION-DISPOSITIVOS.md §4.3, §4.5, §5.2, §5.3, §6 y §10 (M1,
-- aprobada por el dueño el 2026-11-17 junto con los diseños 20.28, 20.29 y 20.32).
-- Todo es aditivo: columnas nuevas nulas o con valor por defecto y tablas nuevas.
--
-- Decisiones de esta fase:
-- - La clave del equipo NUNCA se guarda: la tablet la genera, manda su SHA-256 al
--   pedir el código de vinculación y el hash pasa a hr_clock_secrets al vincular.
-- - PIN y carnés en hr_credentials, sin acceso desde el navegador: el PIN con
--   crypt() (bcrypt) para verificar y un HMAC con la clave de la organización
--   (hr_marcacion_claves) para encontrar a la persona sin probar uno por uno.
-- - La foto de evidencia solo con autorización (hr_marcacion_consents, foto_evidencia),
--   en el bucket privado hr-marcacion-evidencia; retención por sede (7 a 90 días).
-- - Cada marca del kiosco pasa por la bandeja hr_clock_raw_events (la misma que usarán
--   los relojes en M2): idempotente por (time_clock_id, local_id).

-- 1. Clave del equipo y bloqueo del PIN por equipo ------------------------------------------
alter table public.hr_clock_secrets add column if not exists device_key_hash text;
alter table public.hr_clock_secrets add column if not exists key_rotated_at timestamptz;
alter table public.hr_clock_secrets add column if not exists key_revoked_at timestamptz;
alter table public.hr_clock_secrets add column if not exists pin_fallos smallint not null default 0;
alter table public.hr_clock_secrets add column if not exists pin_fallos_desde timestamptz;
alter table public.hr_clock_secrets add column if not exists pin_bloqueado_hasta timestamptz;
alter table public.hr_clock_secrets add column if not exists sup_fallos smallint not null default 0;
alter table public.hr_clock_secrets add column if not exists sup_fallos_desde timestamptz;
alter table public.hr_clock_secrets drop constraint if exists hr_clock_secrets_device_key_hash_check;
alter table public.hr_clock_secrets add constraint hr_clock_secrets_device_key_hash_check
  check (device_key_hash is null or device_key_hash ~ '^[0-9a-f]{64}$');
create unique index if not exists hr_clock_secrets_llave_uq on public.hr_clock_secrets (device_key_hash)
  where device_key_hash is not null;
comment on column public.hr_clock_secrets.device_key_hash is
  'Marcación M1. SHA-256 de la clave del kiosco o del lector de escritorio (la clave la genera el equipo y nunca llega a la base). Nulo = revocada: el equipo debe vincularse de nuevo.';
comment on column public.hr_clock_secrets.pin_bloqueado_hasta is
  'Marcación M1 (D11). Tras 5 PIN incorrectos seguidos en este equipo, el teclado se bloquea 15 min o hasta que un supervisor lo desbloquee.';

-- 2. Códigos de vinculación (Figma 20.29.7) ------------------------------------------------
create table if not exists public.hr_kiosk_pairings (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pendiente' check (status in ('pendiente', 'vinculado', 'vencido')),
  ip inet,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  organization_id integer references public.organizations(id) on delete cascade,
  time_clock_id uuid references public.time_clocks(id) on delete cascade,
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz
);
comment on table public.hr_kiosk_pairings is
  'Marcación M1 (20.29.7). Código de 6 caracteres que muestra una tablet o un computador sin vincular; vence a los 10 min. Guarda solo el hash de la clave que generó el equipo. Sin políticas: solo funciones SECURITY DEFINER.';
create unique index if not exists hr_kiosk_pairings_codigo_uq on public.hr_kiosk_pairings (code) where status = 'pendiente';
create unique index if not exists hr_kiosk_pairings_llave_uq on public.hr_kiosk_pairings (key_hash);
create index if not exists hr_kiosk_pairings_ip_idx on public.hr_kiosk_pairings (ip, created_at desc);
alter table public.hr_kiosk_pairings enable row level security;
revoke all on public.hr_kiosk_pairings from public, anon, authenticated;

-- 3. Clave de la organización para encontrar PIN y carnés ---------------------------------
create table if not exists public.hr_marcacion_claves (
  organization_id integer primary key references public.organizations(id) on delete cascade,
  pepper text not null check (pepper ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
comment on table public.hr_marcacion_claves is
  'Marcación M1. Clave aleatoria por organización para el HMAC que identifica un PIN o un carné (hr_credentials.lookup_hash). Sin políticas: solo funciones SECURITY DEFINER.';
alter table public.hr_marcacion_claves enable row level security;
revoke all on public.hr_marcacion_claves from public, anon, authenticated;

-- 4. PIN y carnés (D11) --------------------------------------------------------------------
create table if not exists public.hr_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  employment_id uuid not null references public.employments(id) on delete cascade,
  kind text not null check (kind in ('pin', 'carne_nfc', 'carne_qr')),
  lookup_hash text not null check (lookup_hash ~ '^[0-9a-f]{64}$'),
  secret_hash text,
  label text check (label is null or char_length(label) <= 40),
  failed_attempts smallint not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  unlocked_by uuid references auth.users(id),
  unlocked_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  check (kind <> 'pin' or secret_hash is not null)
);
comment on table public.hr_credentials is
  'Marcación M1 (D11). PIN de 6 dígitos (crypt/bcrypt, nunca visible) y carnés NFC o QR (solo el HMAC del código). Bloqueo tras 5 intentos: 15 min o un supervisor. Sin acceso desde el navegador: las pantallas leen por funciones SECURITY DEFINER que nunca devuelven hashes.';
create unique index if not exists hr_credentials_lookup_uq on public.hr_credentials (organization_id, kind, lookup_hash)
  where revoked_at is null;
create unique index if not exists hr_credentials_un_pin_uq on public.hr_credentials (employment_id)
  where kind = 'pin' and revoked_at is null;
create index if not exists hr_credentials_vinculo_idx on public.hr_credentials (employment_id);
create index if not exists hr_credentials_org_idx on public.hr_credentials (organization_id, kind) where revoked_at is null;
drop trigger if exists trg_hr_credentials_org on public.hr_credentials;
create trigger trg_hr_credentials_org before insert on public.hr_credentials
  for each row execute function public.fn_hr_org_del_vinculo();
alter table public.hr_credentials enable row level security;
revoke all on public.hr_credentials from public, anon, authenticated;

-- 5. Autorizaciones de la persona (Figma 20.32) ---------------------------------------------
-- Cada fila es una decisión (dar o retirar) sobre uno o varios tipos; la vigente de cada
-- tipo es la última fila que lo incluye. Solo inserción, como hr_geo_consents.
create table if not exists public.hr_marcacion_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  employment_id uuid not null references public.employments(id),
  user_id uuid not null references auth.users(id),
  granted boolean not null,
  kinds text[] not null check (cardinality(kinds) > 0 and kinds <@ array['huella', 'rostro', 'foto_evidencia']::text[]),
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  ip inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  created_at timestamptz not null default now()
);
comment on table public.hr_marcacion_consents is
  'Marcación M1 (Ley 1581 art. 6; D4, D5). Autorización expresa, voluntaria y revocable por tipo: foto_evidencia (kiosco, M1), huella y rostro (relojes, M2). Solo inserción: la vigente de cada tipo es la última fila que lo incluye.';
create index if not exists hr_marcacion_consents_vinculo_idx on public.hr_marcacion_consents (employment_id, created_at desc);
drop trigger if exists trg_hr_marcacion_consents_org on public.hr_marcacion_consents;
create trigger trg_hr_marcacion_consents_org before insert on public.hr_marcacion_consents
  for each row execute function public.fn_hr_org_del_vinculo();
drop trigger if exists trg_hr_marcacion_consents_inmutable on public.hr_marcacion_consents;
create trigger trg_hr_marcacion_consents_inmutable before update or delete on public.hr_marcacion_consents
  for each row execute function public.fn_hr_solo_insercion();
alter table public.hr_marcacion_consents enable row level security;
revoke all on public.hr_marcacion_consents from public, anon;
revoke insert, update, delete, truncate on public.hr_marcacion_consents from authenticated;
drop policy if exists hr_marcacion_consents_select on public.hr_marcacion_consents;
create policy hr_marcacion_consents_select on public.hr_marcacion_consents for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view')));

-- 6. Foto de evidencia y letrero por sede (Figma 20.27.1) -----------------------------------
create table if not exists public.hr_branch_marcacion_ajustes (
  branch_id integer primary key references public.branches(id) on delete cascade,
  organization_id integer not null references public.organizations(id) on delete cascade,
  foto_dias smallint not null default 30 check (foto_dias between 7 and 90),
  letrero_puesto boolean not null default false,
  letrero_puesto_at timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
comment on table public.hr_branch_marcacion_ajustes is
  'Marcación M1 (D5). Días que se guarda la foto de evidencia en la sede (30 por defecto, 7 a 90) y si la sede ya puso el letrero de aviso. Sin fila: 30 días y letrero sin confirmar.';
drop trigger if exists trg_hr_branch_marcacion_ajustes_sede on public.hr_branch_marcacion_ajustes;
create trigger trg_hr_branch_marcacion_ajustes_sede before insert or update on public.hr_branch_marcacion_ajustes
  for each row execute function public.fn_hr_sede_de_la_org();
alter table public.hr_branch_marcacion_ajustes enable row level security;
revoke all on public.hr_branch_marcacion_ajustes from public, anon;
revoke insert, update, delete, truncate on public.hr_branch_marcacion_ajustes from authenticated;
drop policy if exists hr_branch_marcacion_ajustes_select on public.hr_branch_marcacion_ajustes;
create policy hr_branch_marcacion_ajustes_select on public.hr_branch_marcacion_ajustes for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

-- 7. Bandeja de eventos de equipos (kiosco ahora; relojes en M2) -----------------------------
create table if not exists public.hr_clock_raw_events (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  time_clock_id uuid not null references public.time_clocks(id) on delete cascade,
  device_user_id text check (device_user_id is null or char_length(device_user_id) <= 40),
  device_time timestamptz,
  event_kind text check (event_kind is null or event_kind ~ '^[a-z_]{2,30}$'),
  local_id uuid,
  received_at timestamptz not null default now(),
  verify_mode text check (verify_mode is null or verify_mode ~ '^[a-z_]{2,30}$'),
  employment_id uuid references public.employments(id) on delete set null,
  raw jsonb not null default '{}'::jsonb check (jsonb_typeof(raw) = 'object'),
  status text not null check (status in ('identificada', 'aceptada', 'repetida', 'en_espera', 'a_revision', 'rechazada')),
  reason text check (reason is null or reason ~ '^[a-z_]{3,60}$'),
  attendance_event_id uuid references public.attendance_events(id) on delete set null
);
comment on table public.hr_clock_raw_events is
  'Marcación M1/M2. Bandeja de lo que envían los equipos (kiosco, lector de escritorio y, en M2, relojes). Idempotente: (time_clock_id, local_id) para el kiosco y (time_clock_id, device_user_id, device_time, event_kind) para los relojes. Sin plantillas biométricas ni PIN. Se guarda 180 días.';
create unique index if not exists hr_clock_raw_events_local_uq on public.hr_clock_raw_events (time_clock_id, local_id)
  where local_id is not null;
create unique index if not exists hr_clock_raw_events_reloj_uq
  on public.hr_clock_raw_events (time_clock_id, device_user_id, device_time, coalesce(event_kind, ''))
  where device_user_id is not null;
create index if not exists hr_clock_raw_events_org_idx on public.hr_clock_raw_events (organization_id, received_at desc);
create index if not exists hr_clock_raw_events_reloj_idx on public.hr_clock_raw_events (time_clock_id, received_at desc);
alter table public.hr_clock_raw_events enable row level security;
revoke all on public.hr_clock_raw_events from public, anon;
revoke insert, update, delete, truncate on public.hr_clock_raw_events from authenticated;
drop policy if exists hr_clock_raw_events_select on public.hr_clock_raw_events;
create policy hr_clock_raw_events_select on public.hr_clock_raw_events for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view')));

-- La clave foránea que anunció M0 (attendance_events.raw_event_id).
alter table public.attendance_events drop constraint if exists attendance_events_raw_event_fk;
alter table public.attendance_events add constraint attendance_events_raw_event_fk
  foreign key (raw_event_id) references public.hr_clock_raw_events(id) on delete set null;
create index if not exists attendance_events_raw_event_idx on public.attendance_events (raw_event_id) where raw_event_id is not null;
create index if not exists attendance_events_foto_vence_idx on public.attendance_events (photo_expires_at)
  where photo_path is not null;

-- 8. Vocabulario --------------------------------------------------------------------------
alter table public.hr_marcacion_intentos drop constraint if exists hr_marcacion_intentos_metodo_check;
alter table public.hr_marcacion_intentos add constraint hr_marcacion_intentos_metodo_check
  check (metodo in ('celular_ubicacion', 'qr', 'nfc_etiqueta', 'remoto', 'desconocido', 'pin', 'carne_nfc', 'carne_qr'));
-- Cada vista de una foto de evidencia queda en el registro de accesos (§5.2).
alter table public.hr_access_log drop constraint if exists hr_access_log_grupo_chk;
alter table public.hr_access_log add constraint hr_access_log_grupo_chk
  check (data_group = any (public.fn_hr_grupos_datos())
         or data_group = any (array['basico', 'registro_accesos', 'foto_evidencia']::text[]));

-- 9. Bucket privado de la foto de evidencia (solo service role) ------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hr-marcacion-evidencia', 'hr-marcacion-evidencia', false, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;
