-- Reversion de 20260910194015_widget_limite_de_tasa_en_la_base
--
-- Quita el limite de tasa del widget publico.
--
-- OJO: revertir reabre el abuso. La `public_key` va embebida en el JavaScript
-- del sitio del cliente, asi que sin limite cualquiera puede enviar mensajes en
-- bucle y cada uno consume un credito de la organizacion.
--
-- Antes de revertir del todo, considera desactivarlo por organizacion sin perder
-- la defensa en las demas:
--   update ai_settings
--      set metadata = jsonb_set(coalesce(metadata,'{}'), '{widget_limite_por_hora}', '0')
--    where organization_id = <id>;

drop trigger if exists trg_widget_limite_de_tasa on public.messages;
drop function if exists public.fn_widget_limite_de_tasa();
