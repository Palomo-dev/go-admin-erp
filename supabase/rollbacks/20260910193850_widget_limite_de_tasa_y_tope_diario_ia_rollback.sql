-- Reversion de 20260910193850_widget_limite_de_tasa_y_tope_diario_ia
--
-- Devuelve el widget al estado sin limite de tasa y quita el tope diario de
-- respuestas de IA por conversacion.
--
-- OJO: revertir esto reabre el vector de abuso. La `public_key` del widget va
-- embebida en el JavaScript del sitio del cliente, asi que sin limite cualquiera
-- puede enviar mensajes en bucle y cada uno consume un credito de la
-- organizacion. Revertir solo si el limite esta causando un problema mayor.
--
-- Hay que revertir TAMBIEN la Edge Function `chat-widget` (a la v75) y
-- `ai-auto-response`: si el SQL se va y el codigo se queda, las llamadas a
-- `widget_registrar_uso` fallaran. El codigo esta escrito para tolerarlo
-- (si la RPC falla, deja pasar), pero cada mensaje registrara un error.

drop function if exists public.widget_limpiar_rate_limit();
drop function if exists public.widget_registrar_uso(uuid, text, integer);
drop table if exists public.widget_rate_limit;

-- La columna del tope diario se deja a proposito: borrarla destruiria el valor
-- que cada organizacion haya configurado. Para desactivar el tope sin perder la
-- configuracion, basta con ponerlo en 0 (0 = sin tope):
--   update public.ai_settings set max_respuestas_ia_por_conversacion_dia = 0;
-- alter table public.ai_settings drop column if exists max_respuestas_ia_por_conversacion_dia;
