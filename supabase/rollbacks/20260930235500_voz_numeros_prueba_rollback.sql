-- Rollback de 20260930235500_voz_numeros_prueba.sql
--
-- ⚠️ No restaura datos: borra la lista de números de prueba y su historial de
-- altas y bajas (quién agregó/quitó cada número y cuándo). Las llamadas que ya
-- usaron la exención conservan su marca en `calls.metadata.ley2300_exencion`.
--
-- Antes de ejecutarlo, revierte el código que usa estas piezas
-- (voiceAgent/cumplimiento.ts, voiceAgent/numerosPrueba.ts y la ruta
-- /api/crm/settings/telephony/test-numbers). Si no, la lectura de la exención
-- falla y el despachador aplica el tope semanal a todos (falla cerrado), y la
-- sección «Números de prueba» de Configuración muestra error.

drop function if exists public.fn_voz_es_numero_prueba(integer, text);
-- El trigger cae con la tabla.
drop table if exists public.crm_voice_test_numbers;
drop function if exists public.fn_crm_voice_test_numbers_guarda();
