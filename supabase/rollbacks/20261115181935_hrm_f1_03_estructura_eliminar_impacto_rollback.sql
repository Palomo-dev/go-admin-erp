-- Revierte HRM fase 1 · estructura, segunda parte (20261115181935_hrm_f1_03_estructura_eliminar_impacto).
-- Los cargos que se hayan «eliminado» quedan inactivos (is_active = false): no se reactivan.

drop function if exists public.fn_hr_escala_impacto(uuid, integer, uuid, jsonb, text, text, text);
drop function if exists public.fn_hr_cargo_eliminar(uuid, integer, uuid);
