-- Reversión de 20261115163247_crm_salud_tendencia_y_cambio.sql.
-- Solo borra las dos funciones de lectura; no toca datos.
drop function if exists public.fn_health_tendencia_org(integer, integer, text);
drop function if exists public.fn_health_score_hace(integer, integer, uuid);
