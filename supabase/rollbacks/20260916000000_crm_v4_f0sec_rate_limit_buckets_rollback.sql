-- Rollback de 20260916000000_crm_v4_f0sec_rate_limit_buckets.sql (F0-SEC r2, sub-parte D).
--
-- Antes de ejecutarlo: quitar RATE_LIMIT_STORE=db del entorno (o el código
-- bloqueará verify/* e invite/resend al no encontrar la RPC: fail-closed).
-- Borra los cubos (datos técnicos y efímeros: contadores por IP/usuario/destino
-- de la última ventana); no hay nada que restaurar.

drop function if exists public.fn_rate_limit_hit(jsonb);
drop function if exists public.fn_rate_limit_sweep();
drop index if exists public.rate_limit_buckets_updated_at_idx;
drop table if exists public.rate_limit_buckets;
