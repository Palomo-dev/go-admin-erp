-- Reversión de 20260930240000_voz_devolucion_llamada.sql
-- La columna callback_at la creó esa migración y solo la escribe
-- schedule_callback: quitarla no pierde datos de clientes.
drop trigger if exists trg_vac_encolar_devolucion on public.voice_agent_calls;
drop function if exists public.fn_vac_encolar_devolucion();
alter table public.voice_agent_calls drop column if exists callback_at;
