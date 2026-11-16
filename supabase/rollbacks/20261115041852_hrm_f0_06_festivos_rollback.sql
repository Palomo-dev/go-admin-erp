-- Revierte HRM fase 0 · paso 6: festivos de plataforma y de organización.
-- ADVERTENCIA: borra hr_org_holidays (los días propios que hayan cargado las
-- organizaciones). Los festivos de plataforma se recalculan con la función.
-- No restaura datos.

drop function if exists public.fn_hr_festivos(integer, date, date, integer);
drop function if exists public.fn_hr_es_festivo(integer, date, integer);
drop function if exists public.fn_hr_festivos_cargar(integer);
drop function if exists public.fn_hr_festivos_calcular(integer);
drop function if exists public.fn_hr_lunes_siguiente(date);
drop function if exists public.fn_hr_pascua(integer);
drop table if exists public.hr_org_holidays;
drop table if exists public.hr_holidays;
drop function if exists public.fn_hr_org_festivo_validar();
