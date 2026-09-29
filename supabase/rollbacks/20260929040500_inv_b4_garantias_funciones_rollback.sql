-- Reversión de 20260929040500_inv_b4_garantias_funciones.sql.
-- Los reclamos creados y los eventos que dejaron se conservan; sin estas
-- funciones (y con la RLS de solo lectura de 20260929040300) nadie puede
-- crearlos ni cambiarlos hasta revertir también esa migración.

drop function if exists public.fn_garantia_resolver(integer, uuid, jsonb);
drop function if exists public.fn_garantia_reemplazos(integer, uuid);
drop function if exists public.fn_garantia_enviar_rma(integer, uuid, jsonb);
drop function if exists public.fn_garantia_cambiar_estado(integer, uuid, text, text);
drop function if exists public.fn_garantia_crear(integer, integer, text, text);
drop function if exists public.fn_garantia_serial_para_reclamo(integer, integer, text);
drop function if exists public.fn_garantia_detalle(integer, uuid);
drop function if exists public.fn_garantias_listado(integer, jsonb);
drop function if exists public.fn_garantia_int_evento(integer, integer, uuid, text, text, text, uuid, text, jsonb);
drop function if exists public.fn_garantia_int_evaluar(integer, integer);
drop function if exists public.fn_garantia_int_siguiente_codigo(integer);
