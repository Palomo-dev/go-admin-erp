-- Reversión de 20260929211000_revocar_enumeracion_correos.
-- ATENCIÓN: vuelve a dejar que cualquiera con la clave anónima compruebe si un correo tiene cuenta.

grant execute on function public.check_email_exists(text) to authenticated;
grant execute on function public.get_auth_provider_by_email(text) to anon, authenticated;
