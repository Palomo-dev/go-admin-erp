-- Acceso v3 · fase 5: nadie fuera del servidor puede preguntar si un correo tiene cuenta
-- (docs/design/AUTH-ACCESO-V2.md §4.2, camino 1).
--
-- check_email_exists y get_auth_provider_by_email son SECURITY DEFINER sobre auth.users. Estaban
-- concedidas a anon (la segunda) y a authenticated (las dos): cualquiera con la clave anónima podía
-- comprobar correos sin pasar por ningún límite. Quedan solo para service_role, que es lo que usan
-- /api/auth/registro y /api/auth/invite.
--
-- Efecto en el código desplegado en master (anterior a la fase 2 de acceso v3): checkAuthProvider del
-- login y de «olvidé mi contraseña» recibe un error y devuelve null, así que solo desaparece la pista
-- «esta cuenta es de Google»; el acceso sigue igual. /api/auth/check-email usa el cliente de servicio.

revoke execute on function public.check_email_exists(text) from public, anon, authenticated;
revoke execute on function public.get_auth_provider_by_email(text) from public, anon, authenticated;
grant execute on function public.check_email_exists(text) to service_role;
grant execute on function public.get_auth_provider_by_email(text) to service_role;
