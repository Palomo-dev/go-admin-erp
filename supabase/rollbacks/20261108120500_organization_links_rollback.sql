-- Reversión de 20261108120500_organization_links.sql.
--
-- Revertir ANTES 20261108121000_consignaciones.sql (sus notas y funciones usan estas tablas).
-- ADVERTENCIA: borra los vínculos entre organizaciones y los documentos compartidos (las copias que
-- cruzaron). Las filas que cada organización ya creó al aceptar (sus notas, sus liquidaciones) no se
-- tocan. Respaldar organization_* antes, o no revertir con datos.

drop function if exists public.fn_documento_compartido_responder(uuid, integer, text, text);
drop function if exists public.fn_documento_compartido_aceptado(uuid, integer, text);
drop function if exists public.fn_documento_compartido_publicar(uuid, integer, text, text, jsonb, integer);
drop function if exists public.fn_vinculo_cambiar_estado(uuid, integer, text, text);
drop function if exists public.fn_vinculo_rechazar(text, text);
drop function if exists public.fn_vinculo_aceptar(text, integer, integer, uuid);
drop function if exists public.fn_vinculo_invitacion_ver(text);
drop function if exists public.fn_vinculo_invitar(integer, text[], integer, uuid, text, integer);
drop function if exists public.fn_vinculo_activo(uuid, integer, text);
drop function if exists public.fn_vinculo_presentacion(integer);
drop function if exists public.fn_vinculo_hash(text);
drop function if exists public.fn_vinculo_es_admin(integer);

drop table if exists public.organization_link_product_map;
drop table if exists public.organization_shared_documents;
drop table if exists public.organization_link_parties;
drop table if exists public.organization_links;

drop function if exists public.fn_documento_compartido_inmutable();
