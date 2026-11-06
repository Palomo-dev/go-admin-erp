-- Quita el reintento. No reabre los fallos que ya marcó como resueltos.
-- El cron que lo llama se quita en el rollback de 20261024040758.

drop function if exists public.fn_reintentar_fallos_asiento();
