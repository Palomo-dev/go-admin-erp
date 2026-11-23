-- Rollback de 20261123153948_logistica_modulo_navegacion.
--
-- Quita el módulo «Logística» y todo lo que la migración insertó. Las filas de
-- Transporte no se tocaron, así que no hay nada que restaurar allí.
-- Advertencia: si después de la migración alguien activó Logística a mano o
-- configuró páginas o cargos del módulo, este rollback también lo borra
-- (organization_modules cae en cascada por la FK de modules).
-- Antes de aplicarlo, revertir el código: el menú y las redirecciones 308 de
-- next.config.js apuntan a /app/logistica.

delete from public.job_position_page_access where module_code = 'logistica';
delete from public.organization_module_pages where module_code = 'logistica';
delete from public.job_position_module_access where module_code = 'logistica';
delete from public.organization_modules where module_code = 'logistica';
delete from public.modules where code = 'logistica';
