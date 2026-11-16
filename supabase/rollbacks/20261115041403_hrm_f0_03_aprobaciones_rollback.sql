-- Revierte HRM fase 0 · paso 3: motor de aprobaciones.
-- ADVERTENCIA: borra reglas, delegaciones, instancias, pasos y decisiones.
-- Revertir antes el paso 4 (hr_employment_events referencia las instancias).
-- No restaura datos.

drop function if exists public.fn_hr_mis_aprobaciones_pendientes(integer);
drop function if exists public.fn_hr_aprobacion_cancelar(uuid, text);
drop function if exists public.fn_hr_aprobacion_decidir(uuid, text, text);
drop function if exists public.fn_hr_aprobacion_al_cerrar(uuid);
drop function if exists public.fn_hr_aprobacion_iniciar(integer, text, text, uuid, uuid, uuid, jsonb);
drop function if exists public.fn_hr_resolver_aprobadores(integer, public.hr_approval_rule_steps, uuid);
drop function if exists public.fn_hr_usuario_de_empleo(uuid);
drop function if exists public.fn_hr_regla_aplica(jsonb, jsonb);
drop function if exists public.fn_hr_instancias_visibles();
drop table if exists public.hr_approval_decisions;
drop table if exists public.hr_approval_steps;
drop table if exists public.hr_approval_instances;
drop table if exists public.hr_approval_delegations;
drop table if exists public.hr_approval_rule_steps;
drop table if exists public.hr_approval_rules;
drop function if exists public.fn_hr_regla_paso_validar();
drop function if exists public.fn_hr_delegacion_validar();
drop function if exists public.fn_hr_solo_insercion();
