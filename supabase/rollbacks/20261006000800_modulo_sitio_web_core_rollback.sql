-- =============================================================================
-- Rollback de 20261006000800_modulo_sitio_web_core.sql
-- =============================================================================
-- Apaga el módulo base «Sitio web» sin borrar filas (sin DROP ni DELETE):
--   1. Devuelve el cupo de `plans.max_modules` (solo si el módulo sigue siendo
--      núcleo activo, para no restar dos veces).
--   2. Lo desactiva en todas las organizaciones (`organization_modules`).
--   3. Lo deja de núcleo e inactivo en `modules`: `assign_core_modules_to_organization`
--      ya no lo asigna y `validate_module_activation` ya no lo cuenta.
--   4. Quita el comentario de `modules.is_core` (no tenía ninguno antes).
--
-- Lo que NO revierte (advertencia de la política de migraciones): las filas
-- creadas en organization_modules, job_position_module_access y
-- job_position_page_access con module_code = 'website' se quedan (inactivas o
-- inertes con el módulo apagado). Volver a aplicar la migración las reutiliza.
--
-- Orden de despliegue: revertir ANTES el código que enlaza /app/sitio-web
-- (catálogo de navegación, middleware y redirecciones de next.config.js); con
-- el módulo apagado y ese código vivo, /app/sitio-web responde «módulo no
-- activado» y el sitio no tiene entrada en el menú.
-- =============================================================================

update public.plans
   set max_modules = max_modules - 1,
       updated_at  = now()
 where max_modules is not null
   and exists (
         select 1 from public.modules m
          where m.code = 'website' and m.is_core is true and m.is_active is true
       );

update public.organization_modules
   set is_active   = false,
       disabled_at = now()
 where module_code = 'website'
   and is_active is true;

update public.modules
   set is_core    = false,
       is_active  = false,
       updated_at = now()
 where code = 'website';

comment on column public.modules.is_core is null;
