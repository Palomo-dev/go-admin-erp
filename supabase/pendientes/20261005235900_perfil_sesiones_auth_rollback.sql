-- Reversión de 20261005235900_perfil_sesiones_auth (SIN APLICAR a 2026-10-05).
-- No restaura sesiones de Auth ya cerradas ni filas de user_devices ya marcadas
-- como revocadas: solo retira la función.
drop function if exists public.fn_cerrar_sesion_dispositivo(uuid);
