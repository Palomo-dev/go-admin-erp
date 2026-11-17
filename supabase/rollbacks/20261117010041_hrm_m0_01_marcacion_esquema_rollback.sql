-- Reversión de 20261117010041_hrm_m0_01_marcacion_esquema.
-- Aplicar DESPUÉS de revertir 20261117…_hrm_m0_02 (las funciones usan estas tablas).
-- Advertencia: se borran con sus filas los métodos por sede, los secretos de los
-- puntos (las pantallas de QR y las etiquetas NFC dejan de servir), las excepciones,
-- los intentos rechazados y los usos del QR; se pierden attendance_events.method,
-- device_time, raw_event_id y photo_expires_at y las columnas nuevas de time_clocks.
-- Si ya hay personas con 'nfc' en hr_attendance_settings.mecanismos, el CHECK
-- anterior no se puede restaurar sin quitarlo antes de esas filas.

drop table if exists public.hr_qr_usos;
drop table if exists public.hr_marcacion_intentos;
drop table if exists public.hr_marcacion_excepciones;
drop trigger if exists trg_hr_branch_clock_methods_sede on public.hr_branch_clock_methods;
drop table if exists public.hr_branch_clock_methods;
drop function if exists public.fn_hr_sede_de_la_org();
drop table if exists public.hr_clock_secrets;

alter table public.hr_attendance_settings alter column mecanismos set default array['app', 'qr']::text[];
alter table public.hr_attendance_settings drop constraint if exists hr_attendance_settings_mecanismos_check;
alter table public.hr_attendance_settings add constraint hr_attendance_settings_mecanismos_check
  check (cardinality(mecanismos) > 0 and mecanismos <@ array['app', 'qr', 'sin_marcacion']::text[]);

drop index if exists public.time_clocks_sede_idx;
drop index if exists public.time_clocks_serie_uq;
alter table public.time_clocks drop constraint if exists time_clocks_textos_check;
alter table public.time_clocks drop constraint if exists time_clocks_protocol_check;
alter table public.time_clocks drop constraint if exists time_clocks_kind_check;
alter table public.time_clocks
  drop column if exists disabled_at,
  drop column if exists paired_at,
  drop column if exists clock_offset_s,
  drop column if exists firmware,
  drop column if exists last_ip,
  drop column if exists last_seen_at,
  drop column if exists protocol,
  drop column if exists serial_number,
  drop column if exists model,
  drop column if exists vendor,
  drop column if exists kind;

alter table public.attendance_events drop constraint if exists attendance_events_method_check;
alter table public.attendance_events
  drop column if exists photo_expires_at,
  drop column if exists raw_event_id,
  drop column if exists device_time,
  drop column if exists method;
