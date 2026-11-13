-- Reversión de 20261113183524_roles_dentro_de_organizacion.
--
-- Respaldo de lo que la migración tocó (conteo por MCP, 2026-11-13):
--   · job_position_page_access: insertó 0 filas (ningún cargo tenía filas de
--     página). Si se volvió a aplicar más tarde con cargos restringidos, las
--     filas que creó son exactamente las de (module_code='organizations',
--     page_href='/app/roles'): antes de esa migración el catálogo no tenía esa
--     página en Organización, así que ninguna fila legítima previa coincide.
--   · modules.roles.description: valía NULL.
--   · No borró ni modificó nada más (organization_modules, organization_module_pages
--     y job_position_module_access quedaron igual: 38 / 0 / 0 filas de roles).
--
-- Revertir la base NO basta: el código que mueve /app/roles al módulo
-- organizations (src/lib/navigation/catalog.ts y rutasModulos.ts) también hay
-- que revertirlo, o el módulo `roles` quedaría sin páginas en el menú.

delete from public.job_position_page_access
 where module_code = 'organizations'
   and page_href = '/app/roles';

update public.modules
   set description = null,
       updated_at = now()
 where code = 'roles'
   and description like 'Sin página propia desde 2026-11-13:%';
