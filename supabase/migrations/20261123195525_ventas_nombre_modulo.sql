-- Módulo «Ventas» (Figma 24 Ventas, aprobado por el dueño el 2026-11-23).
-- El código `pos` NO cambia (planes, organization_modules, cargos, permisos y
-- rutas /app/pos/**): solo el nombre visible y la descripción del catálogo de
-- módulos. Sin filas nuevas ni páginas nuevas en organization_module_pages.
update public.modules
   set name = 'Ventas',
       description = 'Ventas por todos los canales: POS, pedidos online, cotizaciones, devoluciones, cajas, cuentas por cobrar, restaurante y promociones.'
 where code = 'pos';
