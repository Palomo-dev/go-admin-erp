# Fase 00 — Inventario y protección de lo existente

Estado: **cerrada el 2026-09-21** por [ADR-002 D9](ADR-002-DECISIONES-Y-SECUENCIA.md), con dos riesgos declarados que el dueño verifica desde los paneles antes de la primera migración: respaldo de Supabase (el MCP no lo expone) y correspondencia código local / despliegues (Vercel responde 403). Dependencias: ninguna. Resultado: una línea base reproducible que permita mejorar el editor sin alterar silenciosamente las tiendas activas.

Entregas por parte: [F00-A consumidores](F00-INVENTARIO-CONSUMIDORES.md), [F00-B1 fichas de referencias](F00-FICHAS-REFERENCIAS.md), muestras visuales [B2a](F00-COBERTURA-VISUAL-AMPLIADA.md), [B2b hotel/restaurante](F00-B2-HOTEL-Y-RESTAURANTE.md) y [B2c comercio](F00-B2-COMERCIO-ADICIONAL.md), [F00-C esquema y recuperación](F00-ESQUEMA-Y-RECUPERACION.md) y [reporte del tester](F00-REPORTE-TESTER.md). Los estados y calificaciones se anexan en `PROGRESS.md`; la aprobación de un inventario no acredita los recorridos ni la recuperación pendientes.

## UX y componentes

- F00-01. Inventariar flujos de branding, creación de páginas, menús, checkout, reserva, subida de recursos, dominios y preview. Marcar qué controles tienen efecto y cuáles son solo representación.
- F00-02. Seleccionar casos representativos autorizados o sintéticos: tienda global con ventas, hotel, restaurante, sitio sin imágenes y outlet en borrador. Registrar portada, listado, detalle, carrito/reserva, header/footer y móvil. Usar identificadores sin nombres de clientes en evidencia pública.
- F00-03. Completar el recorrido de las 32 referencias: home, menús abiertos, footer, páginas internas enlazadas, estados responsive y comportamiento observable. La revisión anterior no inspeccionó todas sus rutas; completar esa cobertura antes de cerrar el catálogo.
- F00-04. Elaborar ficha de cada patrón: composición, campos, datos, acciones, estados, imágenes, video, comportamiento móvil y correspondencia con el catálogo. Documentar secciones nuevas descubiertas en el recorrido.

## Código y backend

Revisar `src/app/app/organizacion/branding/page.tsx`, `src/app/organizacion/branding/editor/[pageId]/page.tsx`, servicios `websiteSettingsService.ts`, `websitePageBuilderService.ts` y servicios de menús. En websites: `lib/get-org-context.ts`, `lib/outlet/`, `lib/supabase/queries.ts`, `components/site/`, `components/sections/`, rutas y APIs consumidoras.

- F00-05. Inventariar todas las lecturas anidadas de `website_settings`, usos de `.single()`, filtros omitidos de sucursal y rutas que reconstruyen el layout. Incluir jobs, correo, metadatos y API, no solo el editor.
- F00-06. Registrar el mecanismo real de caché e invalidación. Medir consultas por render y volumen cargado en páginas con varias secciones del mismo dominio.
- F00-07. Definir activación V2 por sitio en servidor, inicialmente apagada. Reutilizar un mecanismo existente si soporta ese alcance; si no, diseñarlo en F02. El cliente no puede activar flags de otros sitios.
- F00-08. Identificar cambios ajenos en ambos árboles y los archivos compartidos antes de implementar. Este plan no autoriza sobrescribirlos.

## Base de datos

Por MCP verificar columnas, constraints, índices, funciones, políticas y Storage. La auditoría anterior observó 84 settings globales, 1.064 páginas y 1.944 secciones; estos conteos deben refrescarse, no asumirse.

Inventariar el grafo de FK y consumidores de settings/pages/sections/menus/versiones/presets/branches. Comprobar unicidad por sitio, posibles huérfanos, aliases guardados y correspondencia entre sucursal de página y sección. Obtener agregados, no exportaciones de datos privados.

No aplicar migraciones en esta fase. Documentar cómo recuperar contenido y configuración antes de la primera modificación real; verificar disponibilidad y alcance del respaldo en el entorno de despliegue.

## Verificación y salida

Las pruebas locales usan una copia y una salida nuevas por ejecución, fuera de los árboles de trabajo. No reutilizar `.next`, `.next-desktop` ni otro directorio generado que ya exista: el primer intento de esta ronda regeneró parcialmente `.next-desktop`, incidencia documentada en el reporte. No usar ese artefacto para empaquetar sin una regeneración explícita posterior. Conservar por separado log, comando, código de salida y restricciones de red; mantener bloqueadas las conexiones a servicios operativos desde las pruebas. El build de websites intentó autenticación desde una ruta de depuración durante prerender y el bloqueo la interceptó: no contar ese manejo de error como autenticación funcional.

- [x] Matriz de rutas y capacidades con consumidores identificados ([F00-A](F00-INVENTARIO-CONSUMIDORES.md)).
- [ ] Capturas y recorridos base en 360/390, 768 y escritorio; mediciones comparables de red/render. **Pasa a primera tarea de la etapa 1** (es la base de la evidencia «captura» de ADR-002 D8).
- [x] Inventario de las 32 referencias con cobertura explícita y enlaces ([fichas](F00-FICHAS-REFERENCIAS.md), muestras B2).
- [x] Pruebas ERP (`npx jest`, `npx tsc --noEmit -p tsconfig.json`, `npx next build`) y websites (`npm run typecheck`, `npx next build`) ejecutadas, con fallos existentes clasificados en el reporte. Esto registra ejecución, no suite íntegramente verde ni validación productiva.
- [ ] Verificación de tracking. **Sale de V2** (ADR-002 D10): se reescribe `verify:tracking` fuera de este plan.
- [x] Lista de datos/operaciones que jamás se ejecutan desde preview y de rutas críticas de venta/reserva (webhooks, checkout, `/api/orders`, reservas: ver [F00-A](F00-INVENTARIO-CONSUMIDORES.md); el `POST /api/templates/apply` se desactivó el 2026-09-21).

Reversión: no hay cambios de comportamiento ni de esquema. Entrega de fase: informe base y actualización de cobertura. Un fallo previo no se atribuye a V2, pero un flujo crítico roto debe resolverse antes del piloto que dependa de él.
