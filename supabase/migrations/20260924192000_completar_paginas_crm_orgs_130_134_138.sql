-- Completa la lista de páginas del CRM de las organizaciones 130, 134 y 138.
--
-- Por qué hace falta
-- ------------------
-- El código que ESCRIBE `organization_module_pages` y el que la LEÍA daban a la
-- ausencia de fila significados opuestos: al escribir, una página sin fila se
-- daba por activa; al leer, se daba por oculta. Así, cada página que se añadía
-- al catálogo nacía invisible —para siempre y sin avisar— en toda organización
-- que ya tuviera lista.
--
-- La semántica quedó unificada en código (`src/lib/navigation/paginaActiva.ts`:
-- ausente = activa), así que estas filas ya no hacen falta para que las páginas
-- se vean. Se añaden igualmente para que la lista guardada diga lo mismo que la
-- pantalla, y para que quien abra la configuración de módulos vea el catálogo
-- entero en verde en vez de media lista.
--
-- Medición del 2026-09-23 (catálogo del CRM: 19 páginas)
-- ------------------------------------------------------
--   org 130: 9 filas (8 del catálogo + 1 huérfana) → faltan 11
--   org 134: 10 filas                              → faltan  9
--   org 138: 8 filas                               → faltan 11
--   Ninguna de las tres tiene una sola fila con is_active = false: nadie ocultó
--   nunca una página del CRM a propósito en ellas, así que completar la lista
--   en true no pisa ninguna decisión.
--
-- Alcance: SOLO estas tres organizaciones y SOLO el módulo `crm`. Las orgs 120
-- y 145 también tienen la lista incompleta, pero su módulo CRM está desactivado
-- y además tienen filas en false: su caso es coherente y no se toca.
--
-- Idempotente: `on conflict do nothing`. Las filas que ya existen se quedan
-- como estén, incluida cualquiera que alguien haya apagado después.

insert into organization_module_pages
  (organization_id, module_code, page_href, page_name, is_active, enabled_at, disabled_at)
select o.organization_id,
       'crm',
       c.page_href,
       c.page_name,
       true,
       now(),
       null
from (values (130), (134), (138)) as o(organization_id)
cross join (values
    ('/app/crm/clientes', 'Clientes'),
    ('/app/crm/identidades', 'Identidades'),
    ('/app/crm/segmentos', 'Segmentos'),
    ('/app/crm/salud', 'Salud'),
    ('/app/crm/leads', 'Leads'),
    ('/app/crm/pipeline', 'Pipeline'),
    ('/app/crm/oportunidades', 'Oportunidades'),
    ('/app/crm/pronostico', 'Pronóstico'),
    ('/app/crm/equipo', 'Equipo'),
    ('/app/crm/objeciones', 'Objeciones'),
    ('/app/crm/actividades', 'Actividades'),
    ('/app/crm/llamadas', 'Llamadas'),
    ('/app/crm/campanas', 'Campañas'),
    ('/app/crm/plantillas', 'Plantillas'),
    ('/app/crm/secuencias', 'Secuencias'),
    ('/app/crm/referidos', 'Referidos'),
    ('/app/crm/partners', 'Partners'),
    ('/app/crm/agentes-ia', 'Agentes IA'),
    ('/app/crm/automatizaciones', 'Automatizaciones')
  ) as c(page_href, page_name)
on conflict (organization_id, module_code, page_href) do nothing;
