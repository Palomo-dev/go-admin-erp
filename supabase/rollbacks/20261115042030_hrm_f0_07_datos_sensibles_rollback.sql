-- Revierte HRM fase 0 · paso 7: funciones de datos sensibles y hr_documents.
-- ADVERTENCIA: borra hr_documents (los metadatos). Los archivos del bucket no se
-- tocan, pero quedan sin índice. Exportar hr_documents antes si tiene filas.
-- No restaura datos.

drop function if exists public.fn_hr_mis_permisos(integer);
drop function if exists public.fn_hr_registrar_exportacion(uuid, integer, uuid, text, text, text, text, jsonb);
drop function if exists public.fn_hr_documento_autorizar_descarga(uuid, integer, uuid, text, text, text);
drop function if exists public.fn_hr_documento_registrar(uuid, integer, uuid, text, text, text, text, text, bigint, text, date, uuid, text, text, text);
drop function if exists public.fn_hr_persona_crear(uuid, integer, jsonb, text, text, text);
drop function if exists public.fn_hr_datos_sensibles_guardar(uuid, integer, uuid, text, jsonb, text, text, text);
drop function if exists public.fn_hr_datos_sensibles_leer(uuid, integer, uuid, text, text, text, text);
drop function if exists public.fn_hr_actor_puede_grupo(uuid, integer, uuid, text, text);
drop table if exists public.hr_documents;
