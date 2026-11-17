-- HRM · Marcación M0 · paso 1: esquema de métodos por sede, puntos de marcación,
-- secretos, excepciones temporales, intentos rechazados y usos del QR.
-- Plan: docs/hrm/PLAN-MARCACION-DISPOSITIVOS.md §6 y §10 (fase M0, aprobada 2026-11-16).
-- Todo es aditivo: columnas nuevas nulas o con valor por defecto, tablas nuevas.
-- attendance_events, time_clocks y hr_attendance_settings tienen 0 filas hoy.

-- 1. attendance_events: el método exacto de cada marca --------------------------------
-- `source` sigue igual (lo leen las funciones de la fase 2); `method` dice cómo se
-- marcó con el vocabulario de la sede. La marca original no se edita: los ajustes van
-- aparte (timesheet_adjustments) con motivo y aprobador.
alter table public.attendance_events add column if not exists method text;
alter table public.attendance_events add column if not exists device_time timestamptz;
alter table public.attendance_events add column if not exists raw_event_id uuid;
alter table public.attendance_events add column if not exists photo_expires_at timestamptz;
alter table public.attendance_events drop constraint if exists attendance_events_method_check;
alter table public.attendance_events add constraint attendance_events_method_check
  check (method is null or method in ('celular_ubicacion', 'qr', 'nfc_etiqueta', 'carne_nfc', 'carne_qr',
                                      'pin', 'rostro', 'huella', 'remoto', 'manual'));
comment on column public.attendance_events.method is
  'Marcación M0: cómo se marcó (vocabulario de hr_branch_clock_methods más remoto y manual). Nulo en marcas anteriores; Asistencia cae entonces a source.';
comment on column public.attendance_events.device_time is
  'Hora que reportó el equipo (terminales, M2). La de la marca sigue siendo event_at.';
comment on column public.attendance_events.raw_event_id is
  'Evento de la bandeja de dispositivos que originó la marca (M2; la clave foránea llega con la tabla).';
comment on column public.attendance_events.photo_expires_at is
  'Vencimiento de la foto de evidencia (30 días por defecto, 7 a 90; se retiene mientras haya revisión o reclamo). M1.';

-- 2. time_clocks: es la tabla de puntos y dispositivos (no se crea otra) ----------------
alter table public.time_clocks add column if not exists kind text;
alter table public.time_clocks add column if not exists vendor text;
alter table public.time_clocks add column if not exists model text;
alter table public.time_clocks add column if not exists serial_number text;
alter table public.time_clocks add column if not exists protocol text;
alter table public.time_clocks add column if not exists last_seen_at timestamptz;
alter table public.time_clocks add column if not exists last_ip inet;
alter table public.time_clocks add column if not exists firmware text;
alter table public.time_clocks add column if not exists clock_offset_s integer;
alter table public.time_clocks add column if not exists paired_at timestamptz;
alter table public.time_clocks add column if not exists disabled_at timestamptz;
alter table public.time_clocks drop constraint if exists time_clocks_kind_check;
alter table public.time_clocks add constraint time_clocks_kind_check
  check (kind is null or kind in ('terminal_huella', 'terminal_facial', 'kiosco', 'lector_escritorio', 'etiqueta_nfc', 'pantalla_qr'));
alter table public.time_clocks drop constraint if exists time_clocks_protocol_check;
alter table public.time_clocks add constraint time_clocks_protocol_check
  check (protocol is null or protocol in ('adms', 'isapi_push', 'isapi_pull', 'kiosco', 'escritorio', 'ninguno'));
alter table public.time_clocks drop constraint if exists time_clocks_textos_check;
alter table public.time_clocks add constraint time_clocks_textos_check
  check (coalesce(char_length(vendor), 0) <= 60 and coalesce(char_length(model), 0) <= 60
         and coalesce(char_length(serial_number), 0) <= 80 and coalesce(char_length(firmware), 0) <= 80);
create unique index if not exists time_clocks_serie_uq on public.time_clocks (organization_id, serial_number)
  where serial_number is not null;
create index if not exists time_clocks_sede_idx on public.time_clocks (organization_id, branch_id, kind);
comment on column public.time_clocks.kind is
  'Marcación M0: tipo de punto. M0 crea pantalla_qr y etiqueta_nfc; los demás llegan con M1 (kiosco, lector) y M2 (terminales). `type` queda como legado.';

-- 3. Secretos de los puntos: fuera de time_clocks -----------------------------------------
-- time_clocks la lee hr.attendance.view; el secreto del QR o el código de la etiqueta
-- no. Esta tabla no tiene políticas: solo la leen las funciones SECURITY DEFINER.
create table if not exists public.hr_clock_secrets (
  time_clock_id uuid primary key references public.time_clocks(id) on delete cascade,
  organization_id integer not null references public.organizations(id) on delete cascade,
  qr_secret text check (qr_secret is null or qr_secret ~ '^[0-9a-f]{64}$'),
  tag_hash text check (tag_hash is null or tag_hash ~ '^[0-9a-f]{64}$'),
  rotated_at timestamptz not null default now()
);
comment on table public.hr_clock_secrets is
  'Marcación M0. Clave del QR que cambia cada 30 s (TOTP de la pantalla) y hash SHA-256 del código de la etiqueta NFC. Sin políticas: solo funciones SECURITY DEFINER.';
create unique index if not exists hr_clock_secrets_tag_uq on public.hr_clock_secrets (organization_id, tag_hash) where tag_hash is not null;
alter table public.hr_clock_secrets enable row level security;
revoke all on public.hr_clock_secrets from public, anon, authenticated;

-- 4. Métodos por sede ---------------------------------------------------------------------
create table if not exists public.hr_branch_clock_methods (
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer not null references public.branches(id) on delete cascade,
  method text not null check (method in ('celular_ubicacion', 'qr', 'nfc_etiqueta', 'carne_nfc', 'pin', 'rostro', 'huella')),
  enabled boolean not null default true,
  rules jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object'),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (branch_id, method)
);
comment on table public.hr_branch_clock_methods is
  'Marcación M0 (Figma 20.27). La sede define qué métodos se ofrecen y sus reglas (radio, ubicación con el QR, computador). Sin fila: valor por defecto de fn_hr_metodos_sede. La persona solo restringe (hr_attendance_settings.mecanismos) y RR. HH. puede abrir una excepción temporal (hr_marcacion_excepciones).';
create index if not exists hr_branch_clock_methods_org_idx on public.hr_branch_clock_methods (organization_id);

create or replace function public.fn_hr_sede_de_la_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.branches b where b.id = new.branch_id and b.organization_id = new.organization_id) then
    raise exception 'hr: la sede es de otra organización' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_hr_sede_de_la_org() from public, anon, authenticated;
drop trigger if exists trg_hr_branch_clock_methods_sede on public.hr_branch_clock_methods;
create trigger trg_hr_branch_clock_methods_sede before insert or update on public.hr_branch_clock_methods
  for each row execute function public.fn_hr_sede_de_la_org();

alter table public.hr_branch_clock_methods enable row level security;
revoke all on public.hr_branch_clock_methods from anon;
revoke insert, update, delete, truncate on public.hr_branch_clock_methods from authenticated;
drop policy if exists hr_branch_clock_methods_select on public.hr_branch_clock_methods;
create policy hr_branch_clock_methods_select on public.hr_branch_clock_methods for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

-- 5. La persona puede restringir también la etiqueta NFC ----------------------------------
alter table public.hr_attendance_settings drop constraint if exists hr_attendance_settings_mecanismos_check;
alter table public.hr_attendance_settings add constraint hr_attendance_settings_mecanismos_check
  check (cardinality(mecanismos) > 0 and mecanismos <@ array['app', 'qr', 'nfc', 'sin_marcacion']::text[]);
alter table public.hr_attendance_settings alter column mecanismos set default array['app', 'qr', 'nfc']::text[];

-- 6. Excepción temporal aprobada por RR. HH. ----------------------------------------------
create table if not exists public.hr_marcacion_excepciones (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  employment_id uuid not null references public.employments(id),
  metodo text not null check (metodo in ('celular_ubicacion', 'qr', 'nfc_etiqueta')),
  motivo text not null check (char_length(btrim(motivo)) between 5 and 500),
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz not null,
  aprobado_por uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revocada_at timestamptz,
  revocada_por uuid references auth.users(id),
  check (vigente_hasta > vigente_desde and vigente_hasta <= vigente_desde + interval '92 days')
);
comment on table public.hr_marcacion_excepciones is
  'Marcación M0. Permiso temporal para que una persona marque con un método que su sede o su ficha no le ofrecen (celular dañado, sede en obra…): motivo, vigencia (máx. 92 días) y quién aprobó. No se edita; solo se revoca.';
create index if not exists hr_marcacion_excepciones_vinculo_idx on public.hr_marcacion_excepciones (employment_id, vigente_hasta desc);
drop trigger if exists trg_hr_marcacion_excepciones_org on public.hr_marcacion_excepciones;
create trigger trg_hr_marcacion_excepciones_org before insert on public.hr_marcacion_excepciones
  for each row execute function public.fn_hr_org_del_vinculo();
alter table public.hr_marcacion_excepciones enable row level security;
revoke all on public.hr_marcacion_excepciones from anon;
revoke insert, update, delete, truncate on public.hr_marcacion_excepciones from authenticated;
drop policy if exists hr_marcacion_excepciones_select on public.hr_marcacion_excepciones;
create policy hr_marcacion_excepciones_select on public.hr_marcacion_excepciones for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view')));

-- 7. Intentos rechazados (antifraude y fila «Rechazada» de En vivo) -----------------------
create table if not exists public.hr_marcacion_intentos (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  employment_id uuid references public.employments(id) on delete cascade,
  branch_id integer references public.branches(id) on delete set null,
  time_clock_id uuid references public.time_clocks(id) on delete set null,
  metodo text not null check (metodo in ('celular_ubicacion', 'qr', 'nfc_etiqueta', 'remoto', 'desconocido')),
  motivo text not null check (motivo ~ '^[a-z_]{3,60}$'),
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.hr_marcacion_intentos is
  'Marcación M0. Intentos de marca rechazados (fuera de la sede, QR vencido o ya usado, etiqueta de otra sede…). Se guardan 90 días. Sin la ubicación: solo la distancia.';
create index if not exists hr_marcacion_intentos_org_idx on public.hr_marcacion_intentos (organization_id, created_at desc);
alter table public.hr_marcacion_intentos enable row level security;
revoke all on public.hr_marcacion_intentos from anon;
revoke insert, update, delete, truncate on public.hr_marcacion_intentos from authenticated;
drop policy if exists hr_marcacion_intentos_select on public.hr_marcacion_intentos;
create policy hr_marcacion_intentos_select on public.hr_marcacion_intentos for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view')));

-- 8. Usos del QR: cada código de la pantalla vale una sola vez ------------------------------
create table if not exists public.hr_qr_usos (
  time_clock_id uuid not null references public.time_clocks(id) on delete cascade,
  paso bigint not null,
  n integer not null check (n between 0 and 999),
  employment_id uuid not null references public.employments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (time_clock_id, paso, n)
);
comment on table public.hr_qr_usos is
  'Marcación M0. Código del QR (paso de 30 s, número de código dentro del paso) ya usado: un código sirve una sola vez. Se purga al día siguiente.';
alter table public.hr_qr_usos enable row level security;
revoke all on public.hr_qr_usos from public, anon, authenticated;
