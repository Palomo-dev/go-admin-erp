-- Reversión de 20261117191900_hrm_m1_01_kiosco_esquema.
-- Aplicar DESPUÉS de revertir 20261117…_hrm_m1_02 (las funciones usan estas tablas).
-- Advertencia: se borran con sus filas los códigos de vinculación, los PIN y carnés,
-- las autorizaciones de foto (hr_marcacion_consents es de solo inserción: se borra la
-- tabla entera), los ajustes de foto por sede y la bandeja de eventos del kiosco. Los
-- kioscos y lectores vinculados pierden su clave y hay que vincularlos de nuevo. Las
-- fotos del bucket hr-marcacion-evidencia NO se borran desde SQL (protect_objects_delete):
-- vaciarlo antes con la API de Storage si se quiere quitar el bucket.

alter table public.hr_access_log drop constraint if exists hr_access_log_grupo_chk;
alter table public.hr_access_log add constraint hr_access_log_grupo_chk
  check (data_group = any (public.fn_hr_grupos_datos())
         or data_group = any (array['basico', 'registro_accesos']::text[]));

alter table public.hr_marcacion_intentos drop constraint if exists hr_marcacion_intentos_metodo_check;
alter table public.hr_marcacion_intentos add constraint hr_marcacion_intentos_metodo_check
  check (metodo in ('celular_ubicacion', 'qr', 'nfc_etiqueta', 'remoto', 'desconocido'));

drop index if exists public.attendance_events_foto_vence_idx;
drop index if exists public.attendance_events_raw_event_idx;
alter table public.attendance_events drop constraint if exists attendance_events_raw_event_fk;

drop table if exists public.hr_clock_raw_events;
drop table if exists public.hr_branch_marcacion_ajustes;
drop table if exists public.hr_marcacion_consents;
drop table if exists public.hr_credentials;
drop table if exists public.hr_marcacion_claves;
drop table if exists public.hr_kiosk_pairings;

drop index if exists public.hr_clock_secrets_llave_uq;
alter table public.hr_clock_secrets drop constraint if exists hr_clock_secrets_device_key_hash_check;
alter table public.hr_clock_secrets
  drop column if exists sup_fallos_desde,
  drop column if exists sup_fallos,
  drop column if exists pin_bloqueado_hasta,
  drop column if exists pin_fallos_desde,
  drop column if exists pin_fallos,
  drop column if exists key_revoked_at,
  drop column if exists key_rotated_at,
  drop column if exists device_key_hash;

-- El bucket queda si tiene objetos (la base no los puede borrar).
delete from storage.buckets b where b.id = 'hr-marcacion-evidencia'
  and not exists (select 1 from storage.objects o where o.bucket_id = b.id);
