-- Reversion de 20260910201206_vertical_del_prompt_por_organizacion
--
-- Quita el vertical del prompt: todas las organizaciones vuelven a recibir el
-- prompt de retail, incluidos los 8 hoteles, 5 restaurantes, 2 de servicios y
-- 1 de transporte que hay en la plataforma.
--
-- Hay que revertir TAMBIEN la Edge Function `ai-auto-response`: si la vista
-- desaparece y el codigo se queda, la consulta falla. El codigo lo tolera
-- (cae a 'retail' y registra el error), pero lo hara en cada mensaje.
--
-- La columna `vertical` NO se borra: contiene decisiones del usuario, como la
-- correccion de "Donde Checho" (registrado como restaurant, vende jeans).
-- Para desactivar sin perder ese dato, basta con revertir el codigo.

drop view if exists public.ai_vertical_efectivo;

-- alter table public.ai_settings drop constraint if exists ai_settings_vertical_ck;
-- alter table public.ai_settings drop column if exists vertical;
