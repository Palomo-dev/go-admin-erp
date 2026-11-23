-- =============================================================================
-- Módulo «Logística» (code 'logistica'), separado de Transporte
-- =============================================================================
-- Decisión del dueño (2026-11-23, Figma «21 Logística» 2792:17 y núcleo común
-- 2793:2382): dos módulos visibles sobre un mismo núcleo. Logística es para
-- quien vende y despacha (por despachar, envíos, domiciliarios, cuadres,
-- seguimiento, configuración); Transporte queda para mover personas o carga
-- (viajes, rutas, horarios, boletos, manifiestos). Conductores y vehículos son
-- catálogo común: se ven en los dos.
--
-- Qué hace (idempotente, solo INSERT):
--   1. Inserta el módulo en `modules` como OPCIONAL (is_core = false, cuenta
--      para el cupo del plan igual que Transporte), icono truck, rank 495
--      (justo antes de Transporte, 500).
--   2. Lo activa para las organizaciones que hoy tienen Transporte activo: ahí
--      vivían Envíos, Mis envíos, Tracking, Tarifas de envío, Transportadoras,
--      Etiquetas y Direcciones de clientes, que pasan a Logística. Sin esto,
--      esas organizaciones perderían esas páginas al mudarse de módulo.
--   3. Acceso por cargo: en los cargos que ya restringen módulos, replica el
--      acceso que tenían a Transporte. Un cargo con filas y sin fila para el
--      módulo queda bloqueado por el middleware: sin esta réplica perderían
--      páginas que hoy usan.
--   4. Páginas: replica en Logística las filas de `organization_module_pages`
--      y `job_position_page_access` de las páginas que se mudaron (mismo estado,
--      ruta nueva). Las viejas se conservan (sus URL redirigen con 308).
--
-- Qué NO hace: no apaga Transporte ni borra filas; no toca planes ni cupos.
-- Verificado por MCP el 2026-11-23: 2 organizaciones con Transporte activo,
-- 0 cargos con filas de Transporte y 0 páginas de Transporte configuradas.
--
-- Rollback: supabase/rollbacks/20261123153948_logistica_modulo_navegacion_rollback.sql
-- =============================================================================

-- 1. El módulo.
insert into public.modules (code, name, description, is_core, icon, rank, is_active)
values (
  'logistica',
  'Logística',
  'Despacho de pedidos con domicilio: por despachar, envíos, domiciliarios, cuadres, seguimiento y configuración.',
  false,
  'truck',
  495,
  true
)
on conflict (code) do nothing;

-- 2. Activo donde Transporte ya lo estaba.
insert into public.organization_modules (organization_id, module_code, is_active)
select om.organization_id, 'logistica', true
  from public.organization_modules om
 where om.module_code = 'transport'
   and om.is_active is true
   and not exists (
         select 1 from public.organization_modules x
          where x.organization_id = om.organization_id and x.module_code = 'logistica'
       );

-- 3. Cargos que restringen módulos: el mismo acceso que tenían a Transporte.
insert into public.job_position_module_access (job_position_id, module_code, can_view, can_access)
select a.job_position_id, 'logistica', a.can_view, a.can_access
  from public.job_position_module_access a
 where a.module_code = 'transport'
   and not exists (
         select 1 from public.job_position_module_access x
          where x.job_position_id = a.job_position_id and x.module_code = 'logistica'
       );

-- 4. Páginas que se mudaron: ruta vieja → ruta nueva.
with mudanza(vieja, nueva, nombre) as (
  values
    ('/app/transporte/envios', '/app/logistica/envios', 'Envíos'),
    ('/app/transporte/tracking', '/app/logistica/seguimiento', 'Seguimiento y novedades'),
    ('/app/transporte/tarifas-envio', '/app/logistica/configuracion', 'Configuración'),
    ('/app/transporte/transportadoras', '/app/logistica/transportadoras', 'Transportadoras'),
    ('/app/transporte/etiquetas', '/app/logistica/etiquetas', 'Etiquetas'),
    ('/app/transporte/mis-envios', '/app/logistica/mis-envios', 'Mis envíos'),
    ('/app/transporte/direcciones-clientes', '/app/logistica/direcciones-clientes', 'Direcciones de clientes')
)
insert into public.organization_module_pages (organization_id, module_code, page_href, page_name, is_active)
select p.organization_id, 'logistica', m.nueva, m.nombre, p.is_active
  from public.organization_module_pages p
  join mudanza m on m.vieja = p.page_href
 where p.module_code = 'transport'
   and not exists (
         select 1 from public.organization_module_pages x
          where x.organization_id = p.organization_id and x.module_code = 'logistica' and x.page_href = m.nueva
       );

with mudanza(vieja, nueva) as (
  values
    ('/app/transporte/envios', '/app/logistica/envios'),
    ('/app/transporte/tracking', '/app/logistica/seguimiento'),
    ('/app/transporte/tarifas-envio', '/app/logistica/configuracion'),
    ('/app/transporte/transportadoras', '/app/logistica/transportadoras'),
    ('/app/transporte/etiquetas', '/app/logistica/etiquetas'),
    ('/app/transporte/mis-envios', '/app/logistica/mis-envios'),
    ('/app/transporte/direcciones-clientes', '/app/logistica/direcciones-clientes')
)
insert into public.job_position_page_access (job_position_id, module_code, page_href, can_view, can_access)
select a.job_position_id, 'logistica', m.nueva, a.can_view, a.can_access
  from public.job_position_page_access a
  join mudanza m on m.vieja = a.page_href
 where a.module_code = 'transport'
   and not exists (
         select 1 from public.job_position_page_access x
          where x.job_position_id = a.job_position_id and x.module_code = 'logistica' and x.page_href = m.nueva
       );
