-- Reversión de 20260924192000_completar_paginas_crm_orgs_130_134_138.sql
--
-- Borra EXACTAMENTE las 31 filas que la migración añadió, enumeradas una a una
-- en vez de «borra el CRM de estas tres organizaciones»: las 27 filas que ya
-- existían el 2026-09-23 (9 en la org 130, 10 en la 134 y 8 en la 138, más la
-- huérfana `/app/crm/configuracion` de la 130) son datos de clientes anteriores
-- y no se tocan.
--
-- Recuerda que revertir esto NO vuelve a esconder esas páginas: desde que la
-- semántica está unificada, una página sin fila se ve. Para esconderla de
-- verdad hay que dejar su fila en `is_active = false`.

delete from organization_module_pages p
using (values
    (130, '/app/crm/salud'),
    (130, '/app/crm/leads'),
    (130, '/app/crm/equipo'),
    (130, '/app/crm/objeciones'),
    (130, '/app/crm/llamadas'),
    (130, '/app/crm/plantillas'),
    (130, '/app/crm/secuencias'),
    (130, '/app/crm/referidos'),
    (130, '/app/crm/partners'),
    (130, '/app/crm/agentes-ia'),
    (130, '/app/crm/automatizaciones'),
    (134, '/app/crm/leads'),
    (134, '/app/crm/objeciones'),
    (134, '/app/crm/llamadas'),
    (134, '/app/crm/plantillas'),
    (134, '/app/crm/secuencias'),
    (134, '/app/crm/referidos'),
    (134, '/app/crm/partners'),
    (134, '/app/crm/agentes-ia'),
    (134, '/app/crm/automatizaciones'),
    (138, '/app/crm/salud'),
    (138, '/app/crm/leads'),
    (138, '/app/crm/equipo'),
    (138, '/app/crm/objeciones'),
    (138, '/app/crm/llamadas'),
    (138, '/app/crm/plantillas'),
    (138, '/app/crm/secuencias'),
    (138, '/app/crm/referidos'),
    (138, '/app/crm/partners'),
    (138, '/app/crm/agentes-ia'),
    (138, '/app/crm/automatizaciones')
  ) as a(organization_id, page_href)
where p.organization_id = a.organization_id
  and p.module_code = 'crm'
  and p.page_href = a.page_href;
