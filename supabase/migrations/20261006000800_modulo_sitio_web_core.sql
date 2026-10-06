-- =============================================================================
-- Módulo base «Sitio web» (code 'website')
-- =============================================================================
-- Decisión del dueño (2026-10-05, Figma 01a/01b/01e/01f): el sitio web es un
-- canal de venta, no un dato de la organización. Pasa a ser un MÓDULO BASE
-- (is_core) con su propia entrada en el menú lateral (/app/sitio-web/**), en
-- vez de vivir escondido en Organización › Sitio web (/app/organizacion/branding)
-- y Organización › Dominios.
--
-- Qué hace (todo idempotente, solo INSERT/UPDATE, sin DROP ni DELETE):
--   1. Sube en 1 `plans.max_modules` (planes con límite). El disparador
--      `validate_module_activation` calcula los módulos pagados permitidos como
--      max_modules - (núcleo activo, contado dinámicamente): sin este ajuste, un
--      núcleo más le quitaría un cupo pagado a toda organización. Guardado por
--      «el módulo aún no es núcleo activo», así que solo ocurre una vez.
--   2. Inserta el módulo en `modules` (is_core, icono globe, rank 130: entre
--      Clientes 125 y Roles 140).
--   3. Lo activa en `organization_modules` para TODAS las organizaciones. El
--      disparador `validate_module_activation` deja pasar siempre un núcleo.
--      Las organizaciones nuevas lo reciben solas: `assign_core_modules_to_organization`
--      (AFTER INSERT ON organizations) inserta todo módulo con is_core and is_active.
--   4. Acceso por cargo: replica, en los cargos que ya restringen módulos o
--      páginas, el acceso que tenían a Organización (de donde salen estas
--      páginas). Un cargo con filas en job_position_module_access y sin fila
--      para el módulo queda bloqueado por el middleware: sin esta réplica, los
--      cargos configurados perderían o ganarían acceso sin que nadie lo decida.
--
-- Qué NO hace:
--   - No oculta páginas por giro (Carta solo restaurantes, Tienda solo
--     comercio): ver el informe de la tarea. Toda página del módulo nace activa
--     (ausencia de fila en organization_module_pages = activa).
--   - No toca `plans.module_config` (informativo, ya inconsistente entre planes).
--
-- Rollback: supabase/rollbacks/20261006000800_modulo_sitio_web_core_rollback.sql
-- =============================================================================

-- 1. Cupo: un núcleo más no puede comerse un módulo pagado del plan.
update public.plans
   set max_modules = max_modules + 1,
       updated_at  = now()
 where max_modules is not null
   and not exists (
         select 1 from public.modules m
          where m.code = 'website' and m.is_core is true and m.is_active is true
       );

-- 2. El módulo.
insert into public.modules (code, name, description, is_core, icon, rank, is_active)
values (
  'website',
  'Sitio web',
  'Sitio web público de la organización: páginas, diseño, plantillas, dominios, ventas en línea, SEO y analítica.',
  true,
  'globe',
  130,
  true
)
on conflict (code) do update
   set is_core    = true,
       is_active  = true,
       updated_at = now()
 where public.modules.is_core is distinct from true
    or public.modules.is_active is distinct from true;

-- 3. Activo en todas las organizaciones existentes (sin duplicar: UNIQUE
--    (organization_id, module_code)). Reactiva la fila si un rollback la apagó.
insert into public.organization_modules (organization_id, module_code, is_active, enabled_at, activated_at)
select o.id, 'website', true, now(), now()
  from public.organizations o
on conflict (organization_id, module_code) do update
   set is_active   = true,
       disabled_at = null
 where public.organization_modules.is_active is distinct from true;

-- 4a. Acceso por cargo al módulo: el mismo que tenía cada cargo a Organización.
insert into public.job_position_module_access (job_position_id, module_code, can_view, can_access)
select a.job_position_id, 'website', a.can_view, a.can_access
  from public.job_position_module_access a
 where a.module_code = 'organizations'
on conflict (job_position_id, module_code) do nothing;

-- 4b. Acceso por cargo a las páginas: cada página nueva hereda el de la página
--     de la que viene (Sitio web de Organización, o Dominios de Organización).
insert into public.job_position_page_access (job_position_id, module_code, page_href, can_view, can_access)
select a.job_position_id, 'website', v.href, a.can_view, a.can_access
  from public.job_position_page_access a
  join (values
         ('/app/sitio-web',               '/app/organizacion/branding'),
         ('/app/sitio-web/paginas',       '/app/organizacion/branding'),
         ('/app/sitio-web/diseno',        '/app/organizacion/branding'),
         ('/app/sitio-web/plantillas',    '/app/organizacion/branding'),
         ('/app/sitio-web/carta',         '/app/organizacion/branding'),
         ('/app/sitio-web/tienda',        '/app/organizacion/branding'),
         ('/app/sitio-web/ventas',        '/app/organizacion/branding'),
         ('/app/sitio-web/dominios',      '/app/organizacion/dominios'),
         ('/app/sitio-web/seo',           '/app/organizacion/branding'),
         ('/app/sitio-web/analitica',     '/app/organizacion/branding'),
         ('/app/sitio-web/configuracion', '/app/organizacion/branding')
       ) as v(href, origen)
    on a.page_href = v.origen
 where a.module_code = 'organizations'
on conflict (job_position_id, page_href) do nothing;

comment on column public.modules.is_core is
  'Módulo base: siempre activo, no se puede desactivar (moduleManagementService.deactivateModule) ni cuenta contra plans.max_modules (validate_module_activation). Lo asigna assign_core_modules_to_organization a cada organización nueva.';
