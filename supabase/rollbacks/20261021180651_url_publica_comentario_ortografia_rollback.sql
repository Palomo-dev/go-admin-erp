-- Rollback de 20261021180651_url_publica_comentario_ortografia.sql
-- Solo revierte el comentario de fn_url_publica_org. La función tiene que
-- existir: este rollback va antes de quitar 20261021175551.

comment on function public.fn_url_publica_org(integer) is
  'URL pública https de la tienda. Espejo de hostSitio: dominio propio principal verificado, si no el subdominio del sistema, si no organizations.subdomain.';
