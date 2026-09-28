# Paridad — dashboard de inicio (`/app/inicio`) → Figma

Tabla de correspondencia entre los controles inventariados en
`docs/design/AUDITORIA-DASHBOARD-INICIO.md` y los frames de la página
`03 Navegación y shell` del archivo «GO Admin — Sistema de diseño»
(`EAvjINVRnlzFM70GVoWXgl`), secciones **«Inicio — dashboard»**,
**«Inicio — panel de empleado»**, **«Analítica web (Nuevo)»** y
**«Componentes — Inicio (Nuevo)»**.

Fecha: 2026-09-22 (actualizada con las tres decisiones del dueño de esa misma fecha). Sin
nombres de organizaciones cliente: se usan «Mi empresa S.A.S.», «Sucursal Principal» y
«Sucursal Norte».

**Estado** puede ser:

- **calcado** — existe hoy en el código y se dibuja igual.
- **Nuevo** — no existe en el código; lleva badge `Marca/Nuevo` en el frame.
- **sustituido por …** — existe, pero está roto o fuera de norma y se dibuja la versión
  correcta (regla I.4.4 del brief de fidelidad: lo roto no se calca).
- **omitido: …** — no se dibuja, siempre con el motivo.
- **descartado: …** — se llegó a dibujar y el dueño lo descartó; vive en `99 Descartes`.

Frames abreviados en la columna «Frame Figma»:

| Abrev. | Frame |
|---|---|
| **D-listo** | `Escritorio / Inicio — listo (dueño · administrador)` |
| **D-carg** | `Escritorio / Inicio — cargando` |
| **D-vacío** | `Escritorio / Inicio — vacío (organización nueva)` |
| **D-error** | `Escritorio / Inicio — error` |
| **D-sinsuc** | `Escritorio / Inicio — sin sucursal asignada` |
| **Dlg-KPI** | `Diálogo — Detalle de KPI (Ventas del periodo)` |
| **Pop-per** | `Popover — Periodo personalizado` |
| **Dlg-pers** | `Diálogo — Personalizar el inicio (Nuevo)` |
| **Dlg-conf** | `ConfirmDialog — Quitar el módulo del inicio` |
| **M-listo** | `Móvil / Inicio — listo (dueño · administrador)` |
| **M-carg** | `Móvil / Inicio — cargando` |
| **M-vacío** | `Móvil / Inicio — vacío (organización nueva)` |
| **M-sheet** | `Móvil / Inicio — detalle de KPI (Sheet)` |
| **D-empl / M-empl** | `Escritorio / Inicio — empleado` y su móvil |
| **AW-listo** | `Escritorio / Analítica web — listo` |
| **AW-sinubi** | `Escritorio / Analítica web — sin ubicación (Nuevo)` |
| **AW-carg** | `Escritorio / Analítica web — cargando` |
| **AWM-listo** | `Móvil / Analítica web — listo` |
| **AWM-sinubi** | `Móvil / Analítica web — sin ubicación (Nuevo)` |
| **Comp** | Sección `Componentes — Inicio (Nuevo)` |
| **99** | `99 Descartes` › `Inicio — perfiles explorados (descartado 2026-09-22)` |

---

## B. Página contenedora y cabecera

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| B.1 | Esqueleto inicial `animate-pulse` (`page.tsx:211-224`) | D-carg | sustituido por `Skeleton` del kit (hoy es un bloque dibujado a mano, duplicado en `:376-387`) |
| B.2 | `ModuleAccessDenied` con `?error=module_not_activated` | — | omitido: es una pantalla de otro dominio (`components/modules/ModuleAccessDenied`), ya cubierta en su propia auditoría |
| B.3 | Alerta de `?error=` (4 mensajes) | — | omitido: estado transitorio de navegación, no del inicio; su patrón es el `Toast` del kit, ya dibujado en D-error |
| B.4 | Saludo dinámico (`useDynamicGreeting`) | D-listo · M-listo · D-empl | sustituido por saludo estable según la hora **de la organización**; sin emoji ni `Math.random()` (auditoría §E.3) |
| B.5 | Fecha larga del día | D-listo · todos | calcado, formateado con la zona de la organización |
| B.6 | `BranchBadge` de la cabecera | D-listo · todos | sustituido por `BranchBadge Scope=una · Tono=marca · Size=md` del kit (hoy es fucsia con prefijo «Sucursal:», `SISTEMA-BADGES.md` §6) |
| B.7 | `BranchBadge` × 15 dentro de `ModuloSection` | — | **omitido a propósito**: patrón 9 — un solo badge por pantalla, en la cabecera |
| B.8 | Botón `Marcar Turno` → `/marcar` | D-listo (PageHeader) · D-empl | calcado, movido al `PageHeader` como acción secundaria |
| B.9 | Botón `Actualizar` | D-listo (PageHeader, icono) | calcado |
| B.10 | Toast `Dashboard actualizado` | — | omitido: el `Toast` del kit ya está instanciado en D-error; la variante de éxito es la misma pieza |
| B.11 | Toast de error de carga | D-error | calcado (`Toast Variant=error` + `EmptyState Variant=error`) |
| B.12 | Esqueleto de «rol sin resolver» | D-carg | calcado |
| B.13 | Badge de plan en el `AppHeader` («Ultimate») | D-listo · todos | calcado (viene del componente `AppHeader` del kit, no del inicio) |
| B.14 | Botón `Personalizar` en la cabecera | D-listo (PageHeader) | **Nuevo** — abre Dlg-pers |
| B.15 | Menú «⋯» de la cabecera | D-listo (PageHeader) | **Nuevo** — recoge lo secundario |

### B.1 `PeriodoSelector`

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| B.1.1-6 | Segmentos `Hoy` · `Ayer` · `7 días` · `30 días` · `90 días` · `Año` | D-listo · AW-listo · Comp (`SelectorPeriodo Activo=hoy`) | calcado |
| B.1.7 | Segmento `Personalizado` | Pop-per · Comp (`SelectorPeriodo Activo=personalizado`) | calcado |
| B.1.8-9 | Dos `input type=date` | Pop-per | sustituido: hoy se insertan **en línea** en la cabecera y empujan la pantalla; pasan a popover anclado al disparador (patrón 11) |
| B.1.10-11 | Botones ✓ / ✕ del rango | Pop-per (`Aplicar` / `Cancelar`) | sustituido por `Button` del kit con texto, no solo icono |
| B.1.12 | Etiqueta del rango activo `2026-09-01 → 2026-09-22` | Pop-per (campos con `01/09/2026`) | sustituido: hoy se imprime la cadena cruda de la base; pasa por el formato de la organización |
| B.1.13 | Botón `Horas` / `08:00-17:00` | D-listo | calcado |
| B.1.14 | Selector de periodo en móvil | M-listo · M-carg · M-vacío · AWM-listo (`Select Size=sm`) | sustituido: hoy son 7 iconos sin etiqueta ni `aria-label` (`hidden sm:inline`) |

### B.2 `HorasPresets`

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| B.2.1-6 | Presets `Mañana` · `Tarde` · `Noche` · `Madrugada` · `Almuerzo` · `Cena` | Pop-per (`Mañana`, `Tarde`, `Noche`, `Todo el día`) | sustituido: se quitan los **emoji como icono** (🌅 ☀️ 🌙 🌃 🍽️ 🍴, `HorasPresets.tsx:354-359`), prohibidos por `SISTEMA-BADGES.md` §1.7; se agrupan en cuatro chips |
| B.2.7-8 | Dos `input type=time` | — | omitido del dibujo por espacio del popover; se conservan bajo el chip «Todo el día», que abre los dos campos. Anotado en el frame |
| B.2.9-10 | `Aplicar` / `Cancelar` | Pop-per | calcado |

---

## C. KPIs y diálogo de detalle

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| C.1 | KPI `Ventas Hoy` (etiqueta dinámica) | D-listo → «Ventas del periodo» · M-listo → «Ventas de hoy» | sustituido: pasa del bloque de 11 tarjetas a la **tarjeta de tendencia**, con su delta y su moneda explícita |
| C.2 | KPI `Ventas 30 días` / `Ventas {mes}` | D-listo (subtítulo de la tendencia) | sustituido: era la misma cifra en otra ventana; se unifica en el selector de periodo |
| C.3 | KPI `Clientes` | D-listo (fila `CRM (#crm)`: «1.284 clientes · 23 oportunidades abiertas · $ 96 M») | sustituido: es un conteo de catálogo, no un indicador del día (§P3) |
| C.4 | KPI `Productos` | D-listo (fila `Inventario (#inventory)`) | sustituido: ídem |
| C.5 | KPI `Facturas Hoy` | D-listo (fila `Finanzas (#finance)` desplegada) | sustituido: pasa al resumen del módulo |
| C.6 | KPI `Miembros` | — | **omitido: es un dato de administración, no del día.** Su sitio es `/app/organizacion/miembros`. Libera 1 conteo + 2 series |
| C.7 | KPI `Reservas Activas` | D-listo (fila de módulo PMS, cuando el módulo está activo) | sustituido: hoy se consulta y se pinta aunque PMS esté apagado |
| C.8 | KPI `Por Cobrar` | D-listo (`TarjetaHoy · Por cobrar vencido` + StatCard `Cartera vencida`) | sustituido: sube al bloque «Hoy» **con su acción** (`Cobrar`), que es lo que faltaba |
| C.9 | KPI `Visitas Web` | D-listo y M-listo (tarjeta `Tienda web` → casilla «Visitantes del periodo») · AW-listo (StatCard `Visitantes únicos` y `Sesiones`) | **sustituido: se conserva** (decisión del dueño). De tarjeta suelta a casilla con número, variación y **miniatura real**; el detalle va a la vista de analítica |
| C.10 | KPI `Compras Web` | D-listo y M-listo (casilla «Pedidos web») · `TarjetaHoy · Pedidos web` · AW-listo (StatCard `Pedidos`) | sustituido: el conteo se conserva en la tarjeta; lo **accionable** (12 pendientes, 3 expiran) sube al bloque «Hoy» |
| C.11 | KPI `Conversión Web` | D-listo y M-listo (casilla «Conversión») · AW-listo (StatCard `Conversión` + embudo) | **sustituido: se conserva.** La tasa queda en el dashboard; el embudo de tres etapas y las tres tasas se ven enteros en la vista de analítica |
| C.12 | Badge de delta con flecha (`+12,4 %`) | D-listo · AW-listo · M-listo | calcado (`Badge Tono=éxito/peligro · Variant=suave`) |
| C.13 | Badge de visitantes en vivo (punto verde pulsante) | D-listo y M-listo (cabecera de la tarjeta `Tienda web`: «37 en línea ahora») | **calcado y promovido**: es el único tiempo real que funciona (§G.3), así que pasa a la cabecera de la tarjeta en vez de esconderse dentro de un KPI |
| C.14 | Desglose de compras web (3 puntos de color) | AW-listo (embudo) · Dlg-KPI (filtros `Todos`/`pend.`/`pag.`/`cancel.`) | calcado, movido al detalle |
| C.15 | Desglose de las 3 tasas de conversión | AW-listo (embudo con sus tasas y el abandono) | calcado |
| C.16 | Mini-embudo con tooltip hover-only | AW-listo (embudo de barras con etiquetas visibles) | sustituido: el tooltip `group-hover` + `pointer-events-none` es inalcanzable por teclado; los porcentajes se leen sin hover |
| C.17 | Sparkline horario (hoy vs ayer a la misma hora) | Dlg-KPI · D-listo | calcado (línea sólida + discontinua, leyenda explícita) |
| C.18 | Sparkline diario por periodo | D-listo (gráfica de área) · AW-listo (`Visitantes y pedidos`) | calcado |
| C.19 | Sparkline mensual (mes actual vs anterior) | D-listo | calcado |
| C.20 | **Sparkline sintético** (`generateSparklineData`, `Math.sin`) | — | **omitido a propósito: es una curva inventada presentada como dato.** Las tres miniaturas de la tarjeta `Tienda web` son series reales de 24 puntos |
| C.21 | Esqueleto de 4 tarjetas de KPI | D-carg · M-carg · AW-carg | sustituido por `Skeleton Variant=card` del kit, con la forma del contenido real |
| C.22 | Diálogo: título + subtítulo de periodo | Dlg-KPI · M-sheet | calcado, con la sucursal y la moneda añadidas al subtítulo |
| C.23 | Diálogo: cifra grande | Dlg-KPI · M-sheet | calcado |
| C.24 | Diálogo: comparación «vs $ X periodo anterior» | Dlg-KPI · M-sheet · AW-listo (selector `vs periodo anterior`) | calcado |
| C.25 | Diálogo: gráfica grande con leyenda | Dlg-KPI · M-sheet | calcado |
| C.26 | Diálogo: estado `Sin datos suficientes para mostrar la gráfica` | — | omitido del dibujo: es la instancia `EmptyState Variant=empty` ya dibujada en D-vacío |
| C.27 | Diálogo: botón `Ver página completa` | Dlg-KPI (`Ver ventas`) · M-sheet | sustituido: el texto nombra el destino, y el destino no es una redirección |
| C.28 | Diálogo: `Actualizando...` con spinner | Dlg-KPI (anotación) | sustituido: se consulta **una vez al abrir**, sin intervalo de 30 s en paralelo al de la página (auditoría §C.2) |
| C.29 | Diálogo: exportar | Dlg-KPI (`Exportar CSV`) · AW-listo (`Exportar CSV` del PageHeader) | **Nuevo** |
| C.30 | Diálogo: cerrar con `Esc` | Dlg-KPI (`Cerrar` + `Kbd Esc`) | **Nuevo** — hoy no hay indicación del atajo |
| C.31 | **El diálogo como sitio del detalle de tienda web** | AW-listo · AWM-listo | **sustituido por una vista propia** (§K.1): un diálogo no tiene URL, no tiene periodo propio y no admite dos mapas y dos tablas |

---

## D. Alertas, actividad, tendencia, atajos y onboarding

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| D.1 | Alerta `Cuentas por cobrar vencidas` | D-listo (`TarjetaHoy · Por cobrar vencido`) · M-listo | sustituido: de aviso sin salida a casilla con acción `Cobrar`; el umbral `> 1000` sin moneda se elimina |
| D.2 | Alerta `Stock bajo` | D-listo (`TarjetaHoy · Stock crítico`) | sustituido: ídem, con acción `Reponer` y ámbito de sucursal explícito |
| D.3 | Alerta `Reservas confirmadas` | D-listo (fila de módulo PMS) | sustituido: severidad `baja` siempre = no es «Hoy», es resumen de módulo |
| D.4 | Contador de alertas | D-listo (`Badge` «5 cosas por atender») | calcado |
| D.5 | Estado vacío `No hay alertas críticas. Todo está en orden.` | D-listo (tono neutro de `TarjetaHoy`) | sustituido: en vez de una franja verde muda, cada casilla en neutro con su acción de consulta |
| D.6 | Esqueleto de alertas | D-carg | calcado |
| D.7 | Título `Actividad Reciente` | D-listo | calcado |
| D.8 | 6 pestañas de filtro con contador | D-listo (`Todo`/`Ventas`/`Facturas`/`Clientes`/`Inventario`) | calcado como `ChipModulo`, con el contador de la pestaña sobre el total real |
| D.9 | Filas de actividad (icono, descripción, tiempo relativo, monto) | D-listo | sustituido: **filas clicables** (hoy son `<div>`), estados traducidos (hoy «Venta pending»), tiempo relativo con la zona de la organización |
| D.10 | Paginación dibujada a mano | D-listo (`Pagination Layout=compact`) | sustituido por la paginación única del kit (patrón 2) |
| D.11 | Estado vacío `Sin actividad reciente` | D-vacío (`EmptyState Variant=empty`) | calcado |
| D.12 | Título `Tendencia de Ventas (30 días)` | D-listo (`Ventas del periodo`) | sustituido: el título ya no cablea «30 días» mientras el vacío dice «el período seleccionado» |
| D.13 | Total de la tendencia + `· 30d` | D-listo (`$ 42.180.900` + `+12,4 %`) | calcado |
| D.14 | Gráfica de área con tooltip | D-listo · M-listo | calcado, con la serie del periodo anterior como línea discontinua |
| D.15 | Estado vacío `Sin ventas en el período seleccionado` | D-vacío | calcado |
| D.16 | Leyenda y eje de fechas | D-listo · AW-listo (`— Periodo actual` / `- - Periodo anterior`) | **Nuevo** — hoy no hay leyenda y el eje Y no cabe en sus 60 px |
| D.17 | 10 atajos cableados | D-listo (lista de módulos consultada) | sustituido: la lista cableada de rutas (prohibida por `CLAUDE.md`) se reemplaza por la lista de módulos activos |
| D.18 | Onboarding: barra de progreso y `N/7 completados` | D-vacío (`3 de 7 · 43 %`) · M-vacío | calcado |
| D.19 | Onboarding: 7 pasos en rejilla | D-vacío (lista con `Checkbox`) | sustituido: pasa de franja separada a **contenido del bloque «Hoy»** mientras no hay datos |
| D.20 | Onboarding: `Siguiente: … Continuar` | D-vacío (botón `Ir` por paso) | sustituido: una acción por paso, en vez de una sola para el primero pendiente |
| D.21 | Onboarding: botón cerrar (✕) | D-vacío (`Ocultar por ahora`) | sustituido: hoy la clave de descarte es global a todas las organizaciones del navegador |
| D.22 | `WebCommerceObservability` (collapsible, 2 tablas, 2 paginaciones) | — | **omitido a propósito: es una herramienta de diagnóstico de un módulo.** Su sitio es `/app/pos/pedidos-online`. Además su endpoint toma `organization_id` del query string con `service_role` y sin comprobar sesión (auditoría §D.6) |

---

## E. Los dos paneles

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| E.0 | **Panel completo** (administrador y gerente, roles 1/2/5 o super admin) | D-listo · M-listo y sus 4 estados | es la sección «Inicio — dashboard» entera. Administrador y gerente **comparten panel**; lo que los separa es el selector de sucursal del header, no un panel distinto |
| E.0b | **De dónde sale la frontera** entre los dos paneles | D-empl (anotación) | duda abierta: rol (hoy), cargo o ajuste por miembro. Las tres opciones y la recomendación, en §A.4 de la auditoría |
| E.1 | Tarjeta `Marcar Turno` + botón | D-empl (`TarjetaHoy · Mi turno`) · M-empl | sustituido: de tarjeta decorativa a casilla con estado real del turno y hora de entrada |
| E.2 | Hasta 6 atajos filtrados por `moduleAccess` | D-empl (`Mis accesos`) · M-empl | sustituido: se calculan con los **permisos del cargo**, no con los módulos contratados (auditoría §A.3). Marcado «Nuevo» |
| E.3 | Tarjeta `Mis tareas` + `Ver todas` | D-empl · M-empl | calcado |
| E.4 | Fila de tarea con `{task.due_date}` en crudo | D-empl (`Vence hoy, 3:00 p. m.`) | sustituido: hoy se pinta el `timestamptz` completo; pasa por la zona de la organización |
| E.5 | Badge de estado de tarea | D-empl (`Por hacer` / `En progreso`) | sustituido: hoy `open` y `canceled` caen al fallback y se pintan como «Por hacer» |
| E.6 | Orden de las tareas | D-empl (anotación «ordenadas por vencimiento») | sustituido: hoy es `created_at desc` aunque solo se pinte el vencimiento |
| E.7 | Enlace de la tarea | D-empl | sustituido: hoy va a `/app/pm` (redirección); debe ir a `/app/pm/tareas?taskId=…`, que existe |
| E.8 | Tarjeta `Mis notificaciones` + badge `N sin leer` | D-empl (`TarjetaHoy · Mis notificaciones`) · M-empl | sustituido: hoy el contador no puede pasar de 5 |
| E.9 | Fecha de la notificación (`toLocaleString()`) | D-empl (`hace 26 min`) | sustituido: con la zona de la organización |
| E.10 | Estados vacíos `No tienes tareas asignadas` / `No tienes notificaciones` | — | omitido del dibujo: son instancias de `EmptyState Variant=empty`, ya dibujado en D-vacío |
| E.11 | Explicación de por qué no ve cifras | D-empl · M-empl | **Nuevo** — la traducción `home.restrictedMessage` existe y no se usa en ningún archivo |
| E.12 | `QuotaProgressWidget` (cuota, barra, ritmo) | 99 | **descartado: no hay panel de vendedor.** El widget existe en el código pero sin cablear; si algún día se monta, va dentro del panel completo |
| E.13 | `CommissionsWidget` | 99 | descartado: ídem |
| E.14 | `MyPipelineWidget` | 99 | descartado: ídem |
| E.15 | `SellerLeaderboardWidget` | — | **omitido: hoy suma monedas distintas** (`sellerDashboardModel.ts:71`), así que el orden puede no significar nada |
| E.16 | Panel de cajero (caja, turno, mesas, pedidos por entregar) | 99 | **descartado por el dueño el 2026-09-22**: son dos paneles. Lo que un cajero necesita se resuelve con las casillas del bloque «Hoy» y la personalización de P4 |
| E.17 | `LiveVisitorsBadge` | — | **omitido: código muerto.** Exportado en `index.ts:18` y no montado en ningún sitio. El badge que sí se usa es el de `DashboardKPIs`, promovido a la tarjeta `Tienda web` (C.13) |

---

## F. Secciones por módulo

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| F.1 | Barra de navegación con 15 anclas (`#finance`, `#inventory`, …) | — | **omitido a propósito**: con los módulos plegados la propia lista es el índice. Las anclas se conservan en el `id` de cada fila |
| F.2 | Toggle `Compacto` / `Expandido` | — | **omitido**: con todo plegado por defecto y el orden personalizable, sobra un segundo eje de configuración |
| F.3 | Estado `No hay módulos de negocio activos. Configuración de módulos` | D-vacío | sustituido por `EmptyState` del kit con acción |
| F.4 | Botón de colapsar por módulo (con persistencia) | D-listo (`FilaModulo Estado=plegado` / `Estado=desplegado`) | calcado; la preferencia pasa de `localStorage` a `user_dashboard_preferences` |
| F.5 | Botones `CSV` y `PDF` × 15 | D-listo (menú «⋯» de `FilaModulo`) | sustituido: 30 botones permanentemente deshabilitados sin explicación (patrón 6.6) pasan al menú de la fila |
| F.6 | Pestañas `Dashboard` / `Reportes` / `Métricas` | — | **omitido del inicio**: los reportes de cada módulo viven en su módulo. Dos de las tres pestañas muestran hoy un placeholder de «en migración» |
| F.7 | Placeholder `{name} — Dashboard en migración` | — | omitido: no se calca un placeholder |
| F.8 | Placeholder `Reportes de {name} — En migración` | — | omitido: ídem |
| F.9 | Resumen de una línea por módulo | D-listo (`Ingresos $ 18.4 M · Egresos $ 9.1 M · Cartera vencida $ 3.4 M`) | **Nuevo** |
| F.10 | Badge de alertas por módulo | D-listo (`2 alertas`, `9 críticos`, `Caja abierta`, `6 sin tocar`) | **Nuevo** |
| F.11 | Finanzas desplegada: 8 KPIs | D-listo (4 `StatCard`) | sustituido: de 8 a 4. `Caja`, `Bancos`, `Cuentas por Cobrar` y `Cuentas por Pagar` se solapan con `Ingresos`/`Egresos`/«Hoy» |
| F.12 | El interior de los 15 dashboards de módulo | — | omitido del inicio: al desplegar la fila se muestra el dashboard del módulo tal cual existe hoy. Esta tanda dibuja la **fila**, no el interior |
| F.13 | Botón `Ver N alertas más` de Finanzas | — | omitido: **no tiene `onClick`** (`AlertasCard.tsx:148-153`); no se calca un control muerto |
| F.14 | Botones `Check-in` / `Check-out` de PMS | — | omitido: **no tienen handler** (`PmsSection.tsx:188-189`) |
| F.15 | Botón `Exportar` de Gym | — | omitido: nunca se renderiza (`GymSection.tsx:184-187` no pasa `onExport`) |
| F.16 | KPIs de inventario | D-listo (resumen de la fila `Inventario`) | sustituido: hoy se consultan, se guardan y **no se pintan** (`InventarioSection.tsx:80,109` vs `:160-169`) |
| F.17 | Acciones rápidas de Transporte (5) | — | omitido: **las cinco apuntan a rutas inexistentes** |
| F.18 | Acción `Configuración` de Gym | — | omitido: `/app/gym/ajustes` no existe |
| F.19 | Alerta `Timesheets por aprobar` de HRM | — | omitido: `/app/hrm/timesheets` no existe |
| F.20 | Tablas dibujadas a mano (POS, Notificaciones, Finanzas) | AW-listo (las dos tablas de geografía, con `TableCell` + `Pagination` del kit) | sustituido: el patrón correcto queda demostrado en la vista de analítica |
| F.21 | `Mi panel de ventas` (`#mi-panel`) | 99 | descartado: son dos paneles |

---

## G–H. Tiempo real, periodo y sucursal

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| G.1 | Suscripción `dashboard_realtime_{org}` sin `table` | D-listo (anotación «Actualizado hace 2 min») | sustituido: la suscripción no entrega eventos y las tablas de ventas no están publicadas. Se dibuja el refresco honesto con su marca de tiempo |
| G.2 | `setInterval` de 30 s que relanza 41 consultas | Dlg-KPI (anotación) | sustituido: 120 s, con `visibilitychange` y recargando solo «Hoy» (§P5) |
| G.3 | Segundo intervalo desde el diálogo de KPI | Dlg-KPI (anotación) | **omitido a propósito**: duplica la carga de la página |
| G.4 | `useLiveVisitors` sobre `website_visits` | D-listo · M-listo (badge «37 en línea ahora») | **calcado**: funciona bien (tabla publicada, reloj del servidor) y se conserva tal cual |
| H.1 | Periodo aplicado a los KPIs | D-listo · Dlg-KPI · AW-listo | calcado |
| H.2 | Periodo **no** aplicado a alertas, actividad, tendencia y 15 secciones | D-listo | sustituido: en el rediseño el periodo manda en la tendencia, en la actividad y en el resumen de cada módulo |
| H.3 | Sucursal aplicada parcialmente (web org-wide, clientes por sucursal) | AW-listo (`BranchBadge Scope=todas` + la frase «las visitas son de la tienda, no de una sucursal; la venta media sí respeta la sucursal») | sustituido: se declara el ámbito de **cada** cifra en vez de dejarlo implícito |
| H.4 | Estado «sin sucursal asignada» | D-sinsuc (`EmptyStateSinSucursal`) | **Nuevo** — patrón 10; hoy el inicio se pinta en ceros sin explicar por qué |

---

## K. Analítica web y geolocalización — todo Nuevo

| # | Control | Frame Figma | Estado |
|---|---|---|---|
| K.1 | Vista propia `/app/pos/pedidos-online/analitica` | AW-listo · AWM-listo | **Nuevo** — sustituye al diálogo para los tres indicadores de la tienda |
| K.2 | `PageHeader Variant=detail` con migas `Inicio › Analítica web` | AW-listo | **Nuevo** |
| K.3 | Selector de periodo propio + `vs periodo anterior` | AW-listo · AWM-listo | **Nuevo** — hoy el diálogo hereda el periodo del dashboard |
| K.4 | 5 indicadores: `Visitantes únicos`, `Sesiones`, `Pedidos`, `Conversión`, `Venta media` | AW-listo · AWM-listo (2×2) | **Nuevo** — `Visitantes únicos` = sesiones distintas, no filas de `website_visits` |
| K.5 | Embudo `Visitantes → Pedidos → Completados` con sus tasas y el abandono | AW-listo · AWM-listo | sustituido: existe hoy dentro del diálogo, con tooltips hover-only; aquí se lee sin hover |
| K.6 | Evolución con conmutador `Visitantes` / `Pedidos` / `Conversión` | AW-listo | **Nuevo** |
| K.7 | **Mapa del mundo con intensidad por país** | AW-listo · AWM-listo | **Nuevo** — esquemático en Figma; la implementación usa un topojson. Escala con la rampa azul de marca |
| K.8 | **Tabla por país**: País · Visitantes · Sesiones · Conversión · Venta media, ordenable | AW-listo | **Nuevo** — `TableCell` + cabeceras ordenables del kit |
| K.9 | **Mapa de Colombia por ciudad**, con el punto proporcional a los visitantes | AW-listo · AWM-listo (conmutador `Mundo` / `Colombia`) | **Nuevo** |
| K.10 | **Tabla por ciudad** + `Pagination Layout=compact` (39 ciudades) | AW-listo | **Nuevo** |
| K.11 | Leyenda de ciudades con punto de color y visitantes | AW-listo | **Nuevo** — sustituye a las etiquetas encima del mapa, que se solapaban |
| K.12 | Estado **«Todavía no tenemos la ubicación de tus visitantes»** | AW-sinubi · AWM-sinubi | **Nuevo, y obligatorio**: es lo que verá toda organización hasta que se active la geolocalización |
| K.13 | Bloque «Qué hace falta para que este mapa exista» | AW-sinubi | **Nuevo** — las cuatro condiciones, incluida la de que solo cuenta hacia adelante |
| K.14 | Estado cargando | AW-carg | **Nuevo** — cabecera y periodo intactos, contenido en `Skeleton` |
| K.15 | Columnas `city`, `region`, `latitude`, `longitude` de `website_visits` | — (bloque SQL en §K.4 de la auditoría) | **Nuevo** — migración aditiva, columnas NULL-ables, índice parcial |
| K.16 | Relleno de `country` en el registro de la visita | — (§K.4) | **sustituido**: hoy `goadmin-websites/app/api/track-visit/route.ts:64` escribe `country: null` a mano. Se resuelve en el borde con las cabeceras de la petición, sin servicio externo |
| K.17 | `ip_hash` (SHA-256 truncado, sin IP en claro) | — | **calcado: se conserva tal cual.** Es lo que hoy está bien hecho y no se toca |
| K.18 | RPC `get_web_visits_by_country` y `get_web_visits_by_city` | — (§K.4) | **Nuevo** — para no volver a traer filas al navegador |
| K.19 | Tarjeta `Tienda web` en el dashboard (3 casillas + badge en vivo + enlace) | D-listo · M-listo | **Nuevo como agrupación**; las tres cifras existen hoy como KPI sueltos |
| K.20 | Miniatura real de 24 puntos en cada casilla | D-listo · M-listo | sustituye a `generateSparklineData` (`Math.sin`) |

---

## Componentes nuevos

| Componente | Variantes | Dónde vive | Estado |
|---|---|---|---|
| `TarjetaHoy` | `Tono=éxito` · `peligro` · `advertencia` · `neutro` | Comp | **Nuevo** — casilla accionable del bloque «Hoy» |
| `FilaModulo` | `Estado=plegado` · `Estado=desplegado` | Comp | **Nuevo** — fila de módulo con resumen y menú «⋯» |
| `ChipModulo` | `State=default` · `State=activo` | Comp | **Nuevo** — chip de navegación, de filtro y de ámbito del mapa |
| `SelectorPeriodo` | `Activo=hoy` · `Activo=personalizado` | Comp | **Nuevo como componente**; el control existe hoy dibujado a mano en `PeriodoSelector.tsx` |
| `Dlg-pers` («Personalizar el inicio») | — | «Inicio — dashboard» | **Nuevo** — requiere `user_dashboard_preferences` (§P4) |

Componentes del kit reutilizados sin modificar: `AppHeader`, `Sidebar Mode=expanded`,
`MobileHeader Mode=root` y `Mode=page`, `MobileTabBar`, `PageHeader Variant=list` y
`Variant=detail`, `Breadcrumbs`, `StatCard`, `Badge`, `BranchBadge`, `Button`, `Checkbox`,
`Switch`, `Select`, `Skeleton`, `EmptyState`, `EmptyStateSinSucursal`, `TableCell`,
`Pagination`, `ConfirmDialog`, `Toast`, `Progress`, `Kbd`, `Marca/Nuevo` y la familia `Icon/*`.

---

## Resumen de la paridad

| Estado | Filas |
|---|---:|
| calcado | 38 |
| Nuevo | 35 |
| sustituido por … | 45 |
| omitido, con motivo | 22 |
| descartado por el dueño | 5 |
| **Total de filas** | **145** |

**Cero «omitido» sin motivo.** Los 22 omitidos se reparten en cuatro familias:

1. **Controles muertos** (7): `Ver N alertas más`, `Check-in`/`Check-out` de PMS, `Exportar` de
   Gym, `LiveVisitorsBadge`, las 5 acciones de Transporte, `/app/gym/ajustes` y
   `/app/hrm/timesheets`. No se calca lo que no funciona.
2. **Contenido que pertenece a otro módulo** (4): la observabilidad de comercio web, el interior
   de los 15 dashboards de módulo, las pestañas de reportes y el ranking del equipo.
3. **Decisiones de producto del rediseño** (6): el `BranchBadge` × 15, la barra de 15 anclas, el
   toggle compacto/expandido, el KPI `Miembros`, el sparkline sintético y el segundo intervalo
   del diálogo.
4. **Piezas del kit ya dibujadas en otro frame** (5): estados vacíos y toasts que son la misma
   instancia con otro texto.

Los 5 **descartados** son los perfiles de cajero y vendedor y sus tres widgets, que el dueño
cerró el 2026-09-22 («son dos paneles»). Están en `99 Descartes`, no borrados.

## Verificación

Ejecutada por script sobre la página `03 Navegación y shell`:

- Solapes entre secciones: **0** (11 secciones)
- Solapes entre frames de primer nivel: **0** (24 frames en las 4 secciones nuevas)
- Nodos fuera de su sección: **0**
- Contenido desbordado de su frame: **0**
- Instancias rotas: **0** de **1.124**
- Textos truncados (medidos clonando con auto-ancho): **0**
- Nodos sueltos en la página, fuera de una sección: **0**
- Etiquetas o contadores heredados de otro dominio: **0** (se detectaron y corrigieron tres
  migas `Zapatilla urbana Nova 42` heredadas del `PageHeader Variant=detail` del kit; el único
  «4.368 productos» que queda está en la fila de Inventario, que es exactamente el catálogo, y
  «Ultimate» es el badge de plan del propio `AppHeader`)

Capturas: `docs/design/figma/25-inicio-01-seccion.png`,
`25-inicio-02-escritorio-listo.png`, `25-inicio-03-dialogos.png`,
`25-inicio-04-movil.png`, `25-inicio-05-panel-empleado.png`,
`25-inicio-06-componentes.png`, `25-inicio-07-analitica-web-seccion.png`,
`25-inicio-08-analitica-web-escritorio.png`.
