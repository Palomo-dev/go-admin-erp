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

---

## Tarjeta Ventas de hoy — 2026-09-24

**Pedido del dueño.** La primera casilla del bloque «Hoy» (`TarjetaHoy · Caja`: «$ 1.284.500 ·
Abierta · Abierta por Ana G. a las 8:05 · Ver caja») no escala: según Configuración › POS puede
haber una caja por sucursal o una por cajero, y con 20 asesores habría 20 cajas. En su lugar va
**lo vendido hoy, venga de donde venga** (POS, tienda web, facturas hechas a mano).

Todo lo de abajo se verificó el 2026-09-23 contra la base (`jgmgphmzusbluqhuqihj`, solo
`SELECT`, conteos y agregados) y contra el código. Sin nombres de organizaciones: se usan ids.

### V.1 Lo que hay hoy en el código

| Pieza | Dónde | Qué hace | Problema |
|---|---|---|---|
| KPI «Ventas Hoy» | `components/inicio/inicioService.ts:463-465, 553-554, 612-613, 817` | suma `get_sales_by_hour/day` + `get_web_orders_revenue_by_hour/day` | `get_sales_by_*` solo cuenta `status IN ('paid','completed')`: **deja fuera las ventas a crédito y todas las facturas hechas a mano** (nacen `pending`). `'completed'` ni siquiera es un estado válido (`sales_status_check` admite `draft, paid, partial, pending, void`) |
| KPI «Facturas Hoy» | `inicioService.ts:465, 821` | `get_invoice_sales_by_*` | es un **conteo** de documentos (`COUNT(*)`), no un importe; mezcla facturas de POS y manuales |
| Web no duplicada | RPC `get_web_orders_revenue_by_*` | filtra `sale_id IS NULL` | correcto: el pedido web pagado ya vive en `sales` (`source='web'`, `web_order_id`) y solo se suma aparte si no tiene venta |
| Tendencia «Ventas del periodo» | `inicioService.ts:1020-1085`, montada en `app/app/inicio/page.tsx:339` | lee `sales` + `web_orders` **en el navegador** | ignora la sucursal del header (no recibe `branchFilter`) mientras los KPIs sí la aplican; trae filas (tope de 1.000 del cliente) en vez de agregar en la base |
| Alertas («Por cobrar vencido», «Stock bajo») | `inicioService.ts:1089-1162`, `DashboardAlertas.tsx:67` | cartera `overdue`, stock ≤ mínimo | tampoco reciben la sucursal; umbral `> 1000` sin moneda |
| Reporte de ventas | RPC `fn_reporte_ventas_resumen` (SECURITY DEFINER) | `status NOT IN ('cancelled','void')` y `DATE(sale_date)` | **otra regla** (cuenta las pendientes) y agrupa por el **día UTC**, prohibido por `docs/reglas-fechas-timezone.md`. El inicio y el reporte dan cifras distintas para el mismo día |
| Moneda | `utils/Utils.ts:71` (`formatCurrency(value, currency = "COP")`), usado por `DashboardKPIs.tsx:233,818`, `DashboardTendencia.tsx:110,128,165`, `DashboardAlertas.tsx:160`, `KpiDetailDialog.tsx:270,329` | formatea siempre en COP | ya existe la fuente única: `useMonedaOrganizacion()` (`lib/hooks/useOrgCurrency.ts:53`) → `resolveOrgCurrency` (`lib/services/monedaOrganizacion.ts:110`); `FinanzasSection.tsx:104` y `CrmSection.tsx:96` ya la usan |
| Quién ve el panel | `lib/dashboard/accesoPanel.ts:26` (roles 1, 2, 5) | decide en el **cliente** | el permiso `sales_management` lo tienen exactamente los roles 1, 2 y 5 (y 3 cargos): sirve para resolverlo en el servidor |

No hay ninguna RPC ni vista que dé «ventas de hoy por canal» con una regla única (buscado en
`pg_proc` y `information_schema.views`).

### V.2 Cajas: los dos modos y los datos reales

- **Dónde vive el modo:** `organization_settings` con `key = 'pos_cash_session_mode'`,
  `settings->>'mode'` ∈ `branch` (default: una caja compartida por sucursal) | `user` (cada
  cajero la suya). Código: `pos/configuracion/configuracionService.ts:131-139, 443-462`;
  consumo en `pos/cajas/CajasService.ts:96-115` (caché de 30 s) y `:156-226`.
- **Tabla:** `cash_sessions` (`organization_id`, `branch_id`, `opened_by`, `opened_at`,
  `initial_amount`, `closed_at`, `final_amount`, `difference`, `status`). `pos_terminals` existe
  (terminales por sucursal) pero la sesión de caja **no** apunta a una terminal.
- **Configuración:** solo **2** organizaciones tienen la fila; las dos en `user`. Las demás caen
  al default `branch`.

| Dato (2026-09-23) | Valor |
|---|---|
| Organizaciones que han abierto caja alguna vez | 14 (99 sesiones) |
| Cajas abiertas ahora | **14**, en 10 organizaciones |
| Abiertas por organización | p50 = 1 · p90 = 2,2 · máx. = **4** |
| Abiertas por sucursal | máx. 1 en modo `branch`; **3** en la única organización en modo `user` con cajas abiertas |
| Simultáneas históricas (180 días) | p50 = 1 · p90 = 1,8 · máx. = 10 |
| **Abiertas desde antes de hoy** | **13 de 14** — antigüedad en días: 462, 427, 77, 39, 23, 21, 13, 12, 12, 11, 11, 7, 6, 1 |
| Cierres de los últimos 30 días con diferencia de arqueo ≠ 0 | 20 de 50 (todas por encima del 1 % del contado; mediana 100.250) |
| Duración de una sesión cerrada | p50 = 7,2 h · p90 = 113 h |

Conclusión: la casilla «Caja» mostraba **una** caja y hoy el caso real no es «muchas cajas del
día» sino **cajas olvidadas abiertas** durante semanas (13 de 14) y **arqueos con diferencia**
(40 %). Eso es lo accionable; el saldo de una caja concreta no lo es desde el inicio.

### V.3 Canales de venta y cómo no contar doble

| Canal | De dónde sale | Cuándo es «venta» | Evidencia |
|---|---|---|---|
| **POS** (incluye mesas) | `sales` `source='pos'` | al cobrarse (`paid`) o al registrarse a crédito (`pending` con cartera; `posService.ts:1411-1426` «Venta con deuda») | 1.970 `paid` + 271 `pending`; 212 de esas pendientes tienen factura y cartera; 52 ventas con `table_session_id` |
| **Tienda web** | `sales` `source='web'` con `web_order_id` | cuando el pedido se paga y se convierte en venta | 642 pedidos `confirmed/paid` con `sale_id` = 644 ventas con `web_order_id` (índice único `uq_sales_web_order_viva`). Los 4.779 `expired` y 887 `cancelled` no son venta |
| **Facturas hechas a mano** | `sales` `source='invoice'` (`NuevaFacturaForm.tsx:850-866`) + su `invoice_sales` | al emitirse; nacen `pending` aunque se vayan a pagar después | 673 `pending` + 2 `paid`. **Hoy el inicio no cuenta ninguna** |
| **Facturas sin venta** (antiguas o cotización convertida) | `invoice_sales` con `sale_id IS NULL`, `document_type <> 'credit_note'`, `status NOT IN ('void','draft')` | al emitirse | 36 en total, 5 en los últimos 30 días; 3 de las 4 cotizaciones convertidas generaron factura **sin** venta |
| **Hotel (PMS), CRM** | `sales` con `reservation_id` / `opportunity_id` | igual que POS | 2 con reserva. **Llegan con `source='pos'`** porque es el default de la columna (`posCrmLink.ts:121-137` no lo fija): el canal se deduce de la FK, no de `source` |
| Gimnasio, parqueadero, transporte | `payments` (`membership_payments`, `parking_payments`) y `trip_tickets.sale_id` | hoy **no crean venta** | 0 pagos de membresía, 1 de parqueadero, 5 tiquetes sin `sale_id`. Fuera de la v1; entran solos el día que esos módulos creen `sales` |

**La factura de una venta de POS o web no es otra venta.** `invoice_sales.sale_id` apunta a la
venta: 3.400+ facturas con venta se descartan para el total y solo se suman las de `sale_id IS NULL`.

Mezcla real de los últimos 30 días (todas las organizaciones):

| Canal | Regla actual del inicio | Regla propuesta |
|---|---:|---:|
| POS | 25.289.730 (1.639) | 29.986.330 (1.851) |
| Web | 27.757.370 (414) | 27.757.370 (414) |
| Facturas (venta `source='invoice'`) | **0** | 56.640.700 (129) |
| Facturas sin venta | — | 4.323.000 (5) |
| **Bruto** | **53.047.100** | **118.707.400** |
| Notas crédito | — | −1.407.100 (5) |
| **Neto** | — | **117.300.300** |

**El inicio muestra hoy el 45 % de lo vendido.** Las facturas manuales son el canal más grande
del mes y no aparecen. Solo 3 organizaciones venden por más de un canal, así que el desglose es
útil para pocas; por eso va compacto.

### V.4 Regla canónica de «venta registrada»

1. **Qué entra:** `sales` con `status IN ('paid','partial','pending')` —fuera `void` y `draft`—
   más `invoice_sales` sin venta (`sale_id IS NULL`, no nota crédito, fuera `void`/`draft`), más
   (red de seguridad) `web_orders` pagados o entregados **sin** venta y no cancelados/expirados.
2. **Fecha:** `sales.sale_date` / `invoice_sales.issue_date`, recortada con el **día de la
   organización** (`organizations.timezone`; hoy las 85 están en `America/Bogota`). Nunca
   `DATE(ts)` ni `current_date`. Nadie usa horario operativo (`organization_settings.operating_hours`:
   0 filas), así que «hoy» = día calendario en la zona de la organización; la RPC lo respeta si
   algún día existe.
3. **Sucursal:** la del header. `NULL` = «Todas». La web se atribuye a `web_orders.branch_id`
   (NOT NULL), que pasa a la venta.
4. **Bruto y neto:** bruto = suma de lo anterior. Devoluciones = notas crédito emitidas hoy
   (`invoice_sales.document_type='credit_note'`, se guardan en negativo). La tarjeta muestra el
   **neto** y, si hubo devoluciones, «incluye −$ X en devoluciones».
5. **Número de ventas y ticket promedio:** n = filas que entran; ticket = bruto / n.
6. **Comparación:** contra **el mismo momento** —misma hora local— de ayer y del mismo día de la
   semana pasada. La RPC devuelve las dos; la tarjeta muestra una (pregunta 3).
7. **Canal:** `web` si `web_order_id` o `source='web'`; `facturas` si `source='invoice'` o factura
   sin venta; `hotel` si `reservation_id`; si no, `pos`. Solo se pintan los canales de módulos
   activos (`organization_modules` vía `moduleManagementService`), nunca una lista fija.

La **misma regla** se aplica a «Ventas del periodo» (tendencia), al diálogo de detalle, y debería
aplicarse a `fn_reporte_ventas_resumen`. Si no, la tarjeta y la tendencia dirán cifras distintas
con el periodo «Hoy».

### V.5 Propuesta — la tarjeta

`TarjetaVentasHoy` sustituye a `TarjetaHoy · Caja` en la primera posición del bloque «Hoy»:

```
Ventas de hoy                                  ↑ 12,4 % vs. ayer a esta hora
$ 3.842.600
86 ventas · ticket promedio $ 44.681
POS $ 2.410.000 · Web $ 1.012.600 · Facturas $ 420.000
                                                              Ver ventas →
```

- **Cifra:** neto del día en la moneda de la organización (código y decimales de
  `useMonedaOrganizacion`), nunca «COP» escrito.
- **Variación:** badge éxito/peligro con flecha; si la referencia es 0, «Primer día con ventas»
  en neutro (sin «∞ %»).
- **Desglose:** una línea, ordenada por importe, máximo 3 canales + «otros». Con un solo canal
  activo no se pinta.
- **Acción:** `Ver ventas` → listado de ventas filtrado por hoy y la sucursal activa.
- **Ámbito:** subtítulo «Sucursal Norte» o «Todas las sucursales»; con «Todas» el desglose puede
  ser por sucursal en vez de por canal (pregunta 4).
- **Tono:** neutro siempre. Vender poco no es una alerta; el color lo lleva la variación.

**Estados** (variantes del componente):

| Estado | Qué se ve |
|---|---|
| `listo` | lo de arriba |
| `cargando` | `Skeleton` con la forma de la tarjeta; cabecera intacta |
| `sin ventas` | «$ 0 · Aún no hay ventas hoy» + «Ayer a esta hora: $ X» + `Ir al POS` si POS está activo, `Nueva factura` si no |
| `error` | «No pudimos cargar las ventas» + `Reintentar`; el resto del bloque sigue |
| `sin permiso` | **no se renderiza**: la RPC responde 403 y la casilla se omite, sin hueco |
| `Todas` vs. una sucursal | mismo layout; cambia el subtítulo y, opcionalmente, el desglose |

**Relación con «Ventas del periodo».** La tarjeta es siempre *hoy* y no obedece al selector de
periodo; la tendencia sí. Con el periodo en «Hoy» ambas deben dar la **misma cifra** (misma RPC).
En móvil ya existe una tarjeta de tendencia titulada «Ventas de hoy» (fila C.1): pasa a llamarse
«Ventas del periodo» para no duplicar el nombre.

### V.6 Qué pasa con la caja

La información de cajas sale de la cifra principal y queda **como aviso**, solo cuando hay algo
que hacer, con el mismo texto en los dos modos:

| Condición | Casilla en «cosas por atender» | Tono | Acción |
|---|---|---|---|
| Cajas abiertas desde un día anterior (en la sucursal activa o en todas) | «3 cajas abiertas desde días anteriores · la más vieja, hace 12 días» | advertencia | `Revisar cajas` → `/app/pos/cajas` filtrado por abiertas |
| Cierres de hoy/ayer con diferencia de arqueo por encima del umbral | «2 cierres con diferencia · −$ 100.250» | peligro | `Ver arqueos` |
| Nada de lo anterior | no aparece | — | — |

- En modo `user` el conteo es de cajas (una por cajero); en modo `branch`, de sucursales con caja
  abierta. El texto dice «cajas» en ambos: no hace falta que el dueño sepa en qué modo está.
- El umbral de diferencia se propone como **porcentaje** del contado (1 %) o valor configurable,
  nunca un importe fijo sin moneda.
- La fila de módulo «Ventas» conserva su badge «Caja abierta» → pasa a «N cajas abiertas».
- A quien opera una caja (el cajero) su estado ya lo tiene en la cabecera del POS
  (`MobileHeader` «Caja abierta · 8:02»); no se repite en el inicio.

### V.7 Permisos

La RPC exige `fn_assert_acceso_org(org)` **y** `fn_tiene_permiso(org, 'sales_management')`
(roles 1, 2, 5 y 3 cargos lo tienen hoy, igual que `ROLES_PANEL_COMPLETO`). Sin permiso responde
`42501` y la tarjeta no se pinta. Esto adelanta el «PASO 2» de `accesoPanel.ts`: el permiso se
resuelve en el servidor, no en la lista de roles del cliente.

### V.8 Cambios de backend necesarios (propuestos, **no aplicados**)

1. **RPC nueva** `fn_inicio_ventas_hoy(p_organization_id int, p_branch_id int default null) returns jsonb`,
   SECURITY DEFINER, `search_path = public, pg_temp`, `revoke all … from public, anon`,
   `grant execute … to authenticated`. Devuelve
   `{dia, zona, moneda, neto, bruto, devoluciones, num_ventas, ticket_promedio,
   ref_ayer, ref_semana, por_canal: [{canal, total, n}], cajas: {abiertas_antes_de_hoy,
   la_mas_vieja_dias, cierres_con_diferencia, diferencia_total}, calculado_en}`.
   Una sola lectura de 8 días de `sales` con `FILTER` para hoy / ayer-misma-hora /
   semana-misma-hora. Núcleo medido con `EXPLAIN (ANALYZE, BUFFERS)` en la organización con más
   ventas (org 144, 1.250 ventas): **6,3 ms, 207 buffers, todo en caché**.
2. **Índices** (aditivos): hoy `sales` no tiene índice por fecha (usa `idx_sales_cash_register` y
   filtra todas las ventas de la organización) y `invoice_sales` tampoco:
   `sales (organization_id, sale_date)` e
   `invoice_sales (organization_id, issue_date) where sale_id is null`. Con 3.569 ventas en total
   no urge; con una organización de 20 cajeros sí.
3. **Unificar la regla** en `get_sales_by_hour/day` (quitar `'completed'`, sumar `partial` y
   `pending`) o, mejor, que la tendencia y el diálogo llamen a una sola función por rango
   (`fn_inicio_ventas_rango`) con la misma regla. Corregir `fn_reporte_ventas_resumen`
   (`DATE(sale_date)` → día de la organización).
4. **`source` correcto** al crear ventas desde el CRM y el PMS (`posCrmLink.ts:121-137`), o
   deducir el canal por FK como en V.4.7.
5. **Frontend:** `formatCurrency` sin default `"COP"` en el inicio → `useMonedaOrganizacion`;
   pasar `branchFilter` a la tendencia y a las alertas.

Borrador del núcleo (para la migración; no ejecutado como DDL):

```sql
-- dentro de fn_inicio_ventas_hoy, tras fn_assert_acceso_org y fn_tiene_permiso
with p as (
  select now() as ahora,
         ((now() at time zone o.timezone)::date)::timestamp at time zone o.timezone as ini_hoy
  from organizations o where o.id = p_organization_id
), v as (
  select case when s.web_order_id is not null or s.source = 'web' then 'web'
              when s.source = 'invoice' then 'facturas'
              when s.reservation_id is not null then 'hotel'
              else 'pos' end as canal,
         s.total, s.sale_date as ts
  from sales s, p
  where s.organization_id = p_organization_id
    and (p_branch_id is null or s.branch_id = p_branch_id)
    and s.status in ('paid','partial','pending')
    and s.sale_date >= p.ini_hoy - interval '7 days' and s.sale_date < p.ahora
  union all
  select 'facturas', i.total, i.issue_date
  from invoice_sales i, p
  where i.organization_id = p_organization_id
    and (p_branch_id is null or i.branch_id = p_branch_id)
    and i.sale_id is null
    and coalesce(i.document_type, 'invoice') <> 'credit_note'
    and i.status not in ('void','draft')
    and i.issue_date >= p.ini_hoy - interval '7 days' and i.issue_date < p.ahora
)
select sum(total) filter (where ts >= p.ini_hoy)                                   as bruto,
       count(*)   filter (where ts >= p.ini_hoy)                                   as num_ventas,
       sum(total) filter (where ts >= p.ini_hoy - interval '1 day'
                            and ts <  p.ahora   - interval '1 day')                as ref_ayer,
       sum(total) filter (where ts >= p.ini_hoy - interval '7 days'
                            and ts <  p.ahora   - interval '7 days')               as ref_semana
from v, p group by p.ini_hoy, p.ahora;
```

### V.9 Figma — pendiente por cupo

El cupo de llamadas del MCP de Figma se agotó en la tercera llamada (dos de lectura), antes de
escribir nada. **No se modificó el archivo.** Lo verificado para quien lo retome:

- `TarjetaHoy` es `COMPONENT_SET 445:195385` (`Componentes — Inicio (Nuevo)`), propiedad `Tono`;
  la casilla de caja es la variante `Tono=éxito` (`445:195325`), 212 × 152, con `Etiqueta`,
  `Estado` (Badge), `Valor`, `Detalle`, `Acción` (Button ghost sm).
- Instancias de `TarjetaHoy · Caja` a sustituir: escritorio listo `445:137185` (bloque `Hoy`
  `447:72950`, instancia `447:72960`), móvil listo `448:205216` (`Hoy` `448:205300`, instancia
  `448:205337`) y los frames de la sección «Inicio — Marcar turno (propuesta)» (`631:21838`,
  `631:22016`, `631:22201`, `631:22386`, `631:22561`, `631:23131`, `631:23523`, `631:23929`).
- **No hay frame de tablet** del inicio en la página `03 Navegación y shell`: hay que crearlo.
- Textos con «COP» fijo: `447:73045`, `631:23143`, `631:23535` («POS + tienda web · frente a los
  30 días anteriores · COP» → «Todas las ventas registradas · frente a los 30 días anteriores»),
  `448:196684` y `448:205834` («Hoy · Sucursal Principal · COP»). El subtítulo de la tendencia
  además debe dejar de decir «POS + tienda web».
- Falta: componente `TarjetaVentasHoy` (variantes `listo`, `cargando`, `sin ventas`, `error`,
  `todas las sucursales`), casilla de aviso de cajas (`TarjetaHoy Tono=advertencia` con
  «3 cajas abiertas desde días anteriores»), reemplazo en escritorio/tablet/móvil, chequeo por
  script y capturas `docs/design/figma/62-inicio-ventas-hoy-*.png`.

### V.9b Decisión del dueño (2026-09-24): la tarjeta sigue el selector de periodo

«No debería ser una tarjeta de ventas de *hoy*: que se base en el filtro de arriba (Hoy, Ayer,
7 días…), que sea dinámica». Esto **reemplaza** el párrafo «Relación con Ventas del periodo»
de V.5 y cambia la propuesta así:

- **Nombre y alcance:** `TarjetaVentas` («Ventas» + etiqueta del periodo activo: «Hoy»,
  «Ayer», «Últimos 7 días», «01/09 – 22/09»…). Obedece a `PeriodoSelector` (incluido
  «Personalizado» y el filtro de horas) y a la sucursal del header, como los KPIs.
- **Comparación:** contra el **periodo anterior equivalente** (Hoy → ayer a la misma hora;
  7 días → los 7 anteriores; rango personalizado → el rango de igual duración inmediatamente
  anterior). Es la misma lógica que ya usa «Ventas del periodo» («frente a los 30 días
  anteriores»).
- **Ubicación:** el bloque «Hoy · N cosas por atender» es estado *actual* (pendientes que no
  dependen del periodo); una cifra que cambia con el filtro no pertenece ahí. La tarjeta pasa a
  **encabezar la sección «Ventas del periodo»** (cifra, n.º de ventas, ticket promedio,
  variación y desglose por canal encima de la gráfica), y el bloque «Hoy» queda solo con avisos:
  cajas abiertas desde días anteriores, cierres con diferencia, por cobrar vencido, etc.
- **Backend:** en vez de `fn_inicio_ventas_hoy`, una sola `fn_inicio_ventas_rango(p_org,
  p_desde, p_hasta, p_branch, p_horas)` con la regla de V.4 que alimenta tarjeta, gráfica y
  diálogo de detalle (así nunca dan cifras distintas). La parte de cajas se separa en una
  función de avisos que no depende del periodo.
- La pregunta 3 de V.10 queda resuelta por esta decisión.

### V.9c Respuestas del dueño (2026-09-24) — reemplazan la regla de V.4

1. **Solo cuenta lo pagado (criterio de caja).** Las ventas a crédito y las facturas sin pagar
   **no** entran. La cifra es lo que efectivamente se cobró, en la **fecha del pago**: un abono
   de hoy a una factura del mes pasado entra hoy, como corte del día. Fuente: `payments`
   (`payment_date` en el día de la organización, `status` válido), atribuido al canal y a la
   sucursal de la venta o factura que paga; menos los reintegros de devoluciones del periodo.
   «Número de ventas» y «ticket promedio» se calculan sobre las ventas **pagadas por completo**
   en el periodo (o se reemplazan por «n.º de cobros»; decidir al diseñar la tarjeta).
2. **Comparación:** periodo anterior de igual duración (Hoy → ayer; Ayer → antier; 7 días → los
   7 anteriores; y así). Ver V.9b.
3. **«Todas las sucursales»:** desglose **por sucursal**. El desglose por canal (POS, tienda
   web, facturas) se deja solo cuando hay una sucursal elegida y la organización vende por más
   de un canal.
4. **Las 62 ventas `pending` sin factura ni cartera** (revisadas: hoy son 59, 7 organizaciones,
   la mayoría de org 120 entre julio y agosto): ninguna tiene pago, movimiento de stock ni
   factura; casi todas sin cliente. Son cobros que no terminaron (flujo anterior a
   `pos_checkout_v1`), no ventas. Con el criterio de caja **no cuentan**. Hay una del
   2026-09-16 (org 140): verificar que el flujo actual ya no deja huérfanas.
5. **Cajas de prueba:** las dos abiertas desde 2025 (org 2, sesiones 2 y 5) se cerraron el
   2026-09-24 con `difference = 0` (sin asiento) y nota de cierre administrativo.
6. **`fn_reporte_ventas_resumen` no se cambia** por ahora.

### V.10 Preguntas para el dueño

1. **Ventas a crédito y facturas pendientes de pago:** ¿cuentan como «venta de hoy»? La propuesta
   dice sí (se vendió aunque no se haya cobrado); lo cobrado es otra cifra (caja / recaudo).
2. **Fecha:** ¿la de la venta (`sale_date`, que en una factura manual puede ser anterior) o la
   de registro (`created_at`)? Se propone la de la venta, como el reporte y la DIAN.
3. **Referencia:** ¿«vs. ayer a esta hora» (lo que usa hoy el inicio) o «vs. el mismo día de la
   semana pasada» (mejor para negocios con fin de semana fuerte)?
4. **«Todas las sucursales»:** ¿desglose por canal o por sucursal?
5. **62 ventas de POS en `pending` sin factura ni cartera** (7 organizaciones, 2,9 M en total, la
   mayoría de julio-agosto de 2026): ¿son ventas reales o restos de un flujo que falló a mitad?
   Con la regla propuesta cuentan.
6. **Cajas abiertas hace más de un año** (2 sesiones, 462 y 427 días): ¿se cierran de oficio o se
   dejan para que el aviso las haga visibles?
7. ¿Se unifica ya `fn_reporte_ventas_resumen` con la misma regla, aunque cambie cifras que los
   clientes han visto en el reporte?
