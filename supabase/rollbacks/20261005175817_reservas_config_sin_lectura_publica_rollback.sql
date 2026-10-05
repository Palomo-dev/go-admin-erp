-- Reversión: vuelve a permitir la lectura pública de configuraciones habilitadas.
alter policy restaurant_booking_settings_public_select on public.restaurant_booking_settings using (is_enabled = true);
