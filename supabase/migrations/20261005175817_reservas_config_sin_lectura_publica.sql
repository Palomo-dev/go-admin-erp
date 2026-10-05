-- restaurant_booking_settings_public_select dejaba leer a cualquiera (anon
-- incluido) la configuración habilitada de reservas de toda organización, con
-- los correos del personal (notify_emails). Nadie la usa: las RPC de reservas
-- son SECURITY DEFINER y el sitio lee con service role. Se neutraliza con
-- USING (false) en vez de DROP (las sentencias destructivas no se pueden
-- confirmar desde la herramienta de migraciones).
alter policy restaurant_booking_settings_public_select on public.restaurant_booking_settings using (false);
