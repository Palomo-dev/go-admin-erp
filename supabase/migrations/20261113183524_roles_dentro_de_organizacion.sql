-- «Roles y permisos» pasa a ser una página del módulo Organización (grupo
-- Equipo), diseño aprobado en Figma sección 91 (2026-11-13). La URL sigue
-- siendo /app/roles; lo que cambia es el módulo al que pertenece la ruta en el
-- catálogo de navegación y en el middleware (`organizations` en vez de `roles`).
--
-- Qué decide el acceso a /app/roles después del cambio (código, no esta
-- migración):
--   · módulo de la organización: `organizations` (núcleo) en vez de `roles`
--     (núcleo). Los dos están activos en las 38 organizaciones: nadie cambia.
--   · cargo, a nivel de módulo (`job_position_module_access`): pasa a mirar la
--     fila de `organizations` en vez de la de `roles`.
--   · cargo, a nivel de página (`job_position_page_access`, solo el menú):
--     /app/roles deja de ser la única página de su módulo, así que empieza a
--     filtrarse por página para los cargos que tienen filas de página.
--   · el permiso `roles.view` lo sigue exigiendo el servidor en
--     /api/organizacion/roles/** (sin cambio).
--
-- Conteo ANTES, por MCP, 2026-11-13 (proyecto taqjemqjtumhwptchcxk):
--   organization_modules  module_code='roles'                 38 (38 activas)
--   organization_modules  module_code='organizations'         38 (38 activas)
--   organization_module_pages  roles o /app/roles o /app/admin  0
--   job_position_module_access  total 0 · module_code='roles'  0
--   job_position_page_access    total 0 · /app/roles           0
--   job_positions                                             798 (ninguno restringido)
--   modules.roles.description                                 NULL
-- O sea: hoy ningún cargo restringe módulos ni páginas, así que el cambio de
-- módulo no le quita ni le da acceso a nadie. Esta migración lo COMPRUEBA y
-- deja resuelto, sin adivinar, el caso de que eso cambie antes de aplicarla:
--
--  (a) Cargo con filas de módulo cuyo acceso a `roles` difiere del de
--      `organizations`: tras el cambio ganaría o perdería /app/roles. No hay
--      forma exacta de preservarlo (abrir `organizations` le abriría todo
--      Organización por URL; el middleware no mira filas de página). Se
--      ABORTA con el conteo para resolverlo a mano.
--  (b) Cargo con filas de página: /app/roles empezaría a filtrarse por página
--      y se le escondería del menú. Se le añade la fila de página
--      (organizations, /app/roles) con la visibilidad que tenía antes: visible
--      si no tenía filas de módulo o si su fila de `roles` decía can_view.
--  (c) Filas de `organization_module_pages` del módulo `roles`: antes no
--      escondían nada (módulo de una sola página, `paginaActiva` 2.bis) y
--      después tampoco (nadie las lee bajo `roles`). Se dejan como están.
--
-- El registro `roles` de `modules` NO se borra: `organization_modules` tiene
-- FK a él (38 filas), Configuración › Roles (`roles.general`) cuelga de él y
-- `plans.module_config` lo nombra. `modules` no tiene columna de «fuera del
-- menú»: se documenta en `description`. El código deja de pintarlo como
-- módulo (no está en el catálogo de navegación).
--
-- Idempotente: (b) inserta solo si falta la fila; la descripción solo si está
-- vacía o ya es esta.

do $$
declare
  v_caso_a integer;
begin
  with cargos as (
    select job_position_id,
           bool_or(module_code = 'roles' and can_access)         as roles_acc,
           bool_or(module_code = 'roles' and can_view)           as roles_view,
           bool_or(module_code = 'organizations' and can_access) as org_acc,
           bool_or(module_code = 'organizations' and can_view)   as org_view
      from public.job_position_module_access
     group by job_position_id
  )
  select count(*) into v_caso_a
    from cargos
   where roles_acc is distinct from org_acc
      or roles_view is distinct from org_view;

  if v_caso_a > 0 then
    raise exception 'roles_dentro_de_organizacion: % cargo(s) con acceso a roles distinto del de organizations; resolver a mano antes de aplicar', v_caso_a;
  end if;
end $$;

-- (b) Cargos con filas de página: /app/roles conserva la visibilidad de antes.
insert into public.job_position_page_access (job_position_id, module_code, page_href, can_view, can_access)
select p.job_position_id,
       'organizations',
       '/app/roles',
       coalesce(m.sin_filas_modulo or m.roles_view, true),
       coalesce(m.sin_filas_modulo or m.roles_acc, true)
  from (select distinct job_position_id from public.job_position_page_access) p
  left join (
    select job_position_id,
           false                                         as sin_filas_modulo,
           bool_or(module_code = 'roles' and can_view)   as roles_view,
           bool_or(module_code = 'roles' and can_access) as roles_acc
      from public.job_position_module_access
     group by job_position_id
  ) m on m.job_position_id = p.job_position_id
 where not exists (
   select 1 from public.job_position_page_access x
    where x.job_position_id = p.job_position_id and x.page_href = '/app/roles'
 );

update public.modules
   set description = 'Sin página propia desde 2026-11-13: /app/roles es la página «Roles y permisos» del módulo organizations (grupo Equipo). Se conserva por la FK de organization_modules y por Configuración › Roles.',
       updated_at = now()
 where code = 'roles'
   and (description is null or description like 'Sin página propia desde 2026-11-13:%');
