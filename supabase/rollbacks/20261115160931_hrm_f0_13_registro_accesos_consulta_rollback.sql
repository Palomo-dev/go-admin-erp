-- Revierte HRM fase 0 · paso 13. Devuelve las funciones a su versión anterior
-- (copiada de la migración que la creó).
-- ADVERTENCIA: borra del registro las filas «sin_permiso» y las de los grupos «basico» y «registro_accesos» para poder restaurar los CHECK (quita un momento el trigger de inmutabilidad). Exportarlas antes: son evidencia.

drop function if exists public.fn_hr_registro_mostrar_valores(uuid, integer, bigint, text, text, text);
drop function if exists public.fn_hr_registro_acceso_detalle(integer, bigint);
drop function if exists public.fn_hr_registro_accesos(integer, timestamptz, timestamptz, text, uuid, text, text, integer, integer);
drop function if exists public.fn_hr_registro_fila(public.hr_access_log);
drop function if exists public.fn_hr_nombre_usuario(uuid);
drop function if exists public.fn_hr_registrar_intento(uuid, integer, uuid, uuid, text, text, text, text, jsonb);
drop function if exists public.fn_hr_ip_parcial(inet);

alter table public.hr_access_log disable trigger trg_hr_access_log_inmutable;
delete from public.hr_access_log where action = 'sin_permiso' or data_group in ('basico','registro_accesos');
alter table public.hr_access_log enable trigger trg_hr_access_log_inmutable;
alter table public.hr_access_log drop constraint if exists hr_access_log_action_check;
alter table public.hr_access_log add constraint hr_access_log_action_check check (action in ('ver','editar','exportar'));
alter table public.hr_access_log drop constraint if exists hr_access_log_grupo_chk;
alter table public.hr_access_log add constraint hr_access_log_grupo_chk check (data_group = any (public.fn_hr_grupos_datos()));
