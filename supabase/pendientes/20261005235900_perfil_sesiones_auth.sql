-- ⚠️ SIN APLICAR (2026-10-05). Propuesta de «Mi perfil › Sesiones y dispositivos»
-- (Figma 346:20900): «Desconectar» un dispositivo concreto debe cerrar su sesión
-- de Supabase Auth, no solo esconder la fila de `user_devices`.
--
-- Estado verificado por MCP antes de escribir esto:
-- - `user_devices.session_id` (uuid) guardaba el id de la PERSONA, no el de la
--   sesión: 305 de 305 filas con session_id = user_id. Desde este cambio,
--   `registerUserDevice` guarda el claim `session_id` del JWT (= auth.sessions.id).
-- - `revoke_session(bigint)` y `revoke_other_sessions(uuid)` leen
--   `user_devices.refresh_token_id`, columna que no existe: no sirven y nadie las
--   llama. No se tocan aquí.
--
-- Qué hace: una función que, para un dispositivo de la propia persona, borra su
-- fila de `auth.sessions` (Auth invalida el refresh token: esa sesión no puede
-- renovarse y el access token vigente caduca en ≤ 1 h) y marca la fila como
-- revocada. Filas antiguas (session_id = user_id) no cierran nada: solo se marcan,
-- y la función lo devuelve (`sesion_cerrada = false`) para que la UI lo diga.
--
-- Para activarla en la UI: aplicar con `apply_migration`, quitar este aviso y
-- llamar `rpc('fn_cerrar_sesion_dispositivo', { p_dispositivo })` desde
-- `DeviceSessions.tsx` en vez de solo marcar la fila.

create or replace function public.fn_cerrar_sesion_dispositivo(p_dispositivo uuid)
returns table (sesion_cerrada boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_sesion uuid;
  v_actual uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_borradas integer := 0;
begin
  if v_uid is null then
    raise exception 'sin sesión' using errcode = '28000';
  end if;

  -- Pertenencia: solo dispositivos de quien llama.
  select d.session_id into v_sesion
  from public.user_devices d
  where d.id = p_dispositivo and d.user_id = v_uid;

  if not found then
    raise exception 'dispositivo no encontrado' using errcode = 'P0002';
  end if;

  -- La sesión desde la que se llama no se cierra por aquí (para eso, «Cerrar sesión»).
  if v_sesion is not null and v_sesion is distinct from v_actual and v_sesion <> v_uid then
    delete from auth.sessions s where s.id = v_sesion and s.user_id = v_uid;
    get diagnostics v_borradas = row_count;
  end if;

  update public.user_devices
     set is_active = false, revoked_at = now()
   where id = p_dispositivo and user_id = v_uid;

  return query select v_borradas > 0;
end;
$$;

revoke all on function public.fn_cerrar_sesion_dispositivo(uuid) from public, anon;
grant execute on function public.fn_cerrar_sesion_dispositivo(uuid) to authenticated;

comment on function public.fn_cerrar_sesion_dispositivo(uuid) is
  'Mi perfil › Sesiones: cierra la sesión de Auth de un dispositivo propio (user_devices.session_id = auth.sessions.id) y marca la fila revocada.';
