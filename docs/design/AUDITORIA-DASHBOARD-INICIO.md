# Auditoría control por control — dashboard de inicio (`/app/inicio`)

Insumo para rediseñar la pantalla de entrada de GO Admin en Figma («GO Admin — Sistema de
diseño», `EAvjINVRnlzFM70GVoWXgl`, página `03 Navegación y shell`). El dueño pide: «analiza
todo el dashboard de inicio y dame una propuesta para mejorar la interfaz y la experiencia de
usuario». Este documento hace las dos cosas: primero baja al detalle —**cada control** con su
etiqueta exacta, lo que hace, cuándo aparece y `archivo:línea`— y después propone, en la
sección «Propuesta», qué debería ser el inicio y qué hay que quitar para que lo sea.

Fecha: 2026-09-22. Solo lectura de código; el esquema, las funciones RPC y la publicación de
Realtime se verificaron con `SELECT` por el MCP de Supabase (`jgmgphmzusbluqhuqihj`), en modo
lectura. Sin nombres de organizaciones cliente. Rutas relativas a `src/` salvo que se indique.

Leyenda de **Tipo**: botón · menú (trigger o ítem) · pestaña · campo · toggle (switch/checkbox/
segmento) · chip (píldora clicable) · badge (solo lectura) · tabla · diálogo · tooltip · atajo ·
estado (vacío/cargando/error/aviso) · texto · stat (KPI) · paginación · toast · cálculo (regla sin
control visible). **Etiqueta exacta** es el literal del código con su acentuación (o su falta);
el inicio sí pasa casi todo por `messages/es.json` bajo la clave `home.*`, así que se cita el
texto en español y, cuando aporta, la clave. Lo que no pasa por i18n se señala.
**Cuándo aparece**: «Siempre» = incondicional dentro de su pantalla; breakpoints Tailwind
(`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280).

Índice: A. Qué ve cada quién · B. Página contenedora y cabecera · C. KPIs y diálogo de detalle ·
D. Alertas, actividad, tendencia, atajos y onboarding · E. Panel del empleado y widgets de
vendedor · F. Las 16 secciones por módulo · G. Tiempo real · H. Periodo y sucursal ·
I. Lo roto o sin efecto · J. Conteo de controles y coste de carga ·
**K. Analítica web y geolocalización** · **Propuesta** · Dudas.

---

## A. Qué ve cada quién

### A.1 Solo hay dos paneles, y la decisión se toma en el cliente

`app/app/inicio/page.tsx:70-75` calcula `canSeeFinancialDashboard`:

```
permContext.isSuperAdmin || STAGE_MANAGER_ROLE_IDS.includes(permContext.roleId)
```

y `STAGE_MANAGER_ROLE_IDS = [1, 2, 5]` (`lib/services/crm/stagePermissions.ts:35`), es decir
Super Admin, Admin de organización y Manager. Con eso el inicio se parte en dos ramas
(`page.tsx:318` y `page.tsx:360`):

| Rama | Quién | Qué monta |
|---|---|---|
| Financiera | roles 1, 2, 5 o super admin | `DashboardAtajos`, `DashboardKPIs`, `DashboardAlertas`, `DashboardActividad`, `DashboardTendencia`, `WebCommerceObservability`, `DashboardModulos` (15 secciones) |
| Empleado | todos los demás | `EmployeeDashboard` (turno, tareas, notificaciones, atajos) |

**Son dos paneles y así se quedan.** Decisión del dueño del 2026-09-22: «administrador y
gerente comparten panel; el empleado tiene el suyo». No hay ni habrá un tercero: no existe hoy
nada específico para cajero ni para vendedor, y no se va a crear. Un cajero con rol Manager
(`role_id` 5) ve el panel completo con cartera, utilidad y los 15 módulos; un cajero con
cualquier otro rol ve el panel de empleado, sin caja. Eso es lo que hay que ajustar dentro de
los dos paneles, no con un panel nuevo (§A.4).

Los perfiles de cajero y de vendedor que se llegaron a explorar en esta tanda están en
`99 Descartes` › «Inicio — perfiles explorados (descartado 2026-09-22)». No se borraron, por si
la decisión cambia.

Tres observaciones de fondo:

1. **La decisión se toma en el navegador.** `usePermissionContext` (`hooks/usePermissionContext.ts`)
   carga el contexto con el cliente de navegador (`lib/middleware/permissions.ts:35-46`). Lo que
   realmente protege los datos es la RLS, no esta comprobación. No es una vulnerabilidad —los
   datos financieros del empleado ni siquiera se piden (`page.tsx:160-163`)— pero conviene
   decirlo con estas palabras: **es una decisión de interfaz, no de seguridad**.
2. **Al empleado nunca se le explica por qué no ve cifras.** Existen las claves
   `home.restrictedTitle` («Dashboard restringido») y `home.restrictedMessage` («Los indicadores
   financieros están disponibles solo para administradores de la organización…») en
   `messages/es.json`, y **ninguna de las dos se usa en ningún archivo del repositorio**.
3. **`rolResuelto`** (`page.tsx:90`) es el guardia que evita pintarle a un administrador el
   panel de empleado durante un instante. Está bien resuelto y documentado en el propio código
   (`page.tsx:77-89`); se conserva en el diseño como el estado «cargando».

### A.2 El mapa completo de anclas — confirmado

Las auditorías previas decían que `/app/finanzas` y `/app/crm` no son pantallas sino
redirecciones, y que sus paneles reales viven aquí. **Confirmado, y además son once, no dos.**
Cada una de estas rutas es un `page.tsx` de 11 líneas que devuelve
`<ModuleRootRedirect moduleCode="…" />`:

`/app/chat`, `/app/crm`, `/app/finanzas`, `/app/gym`, `/app/hrm`, `/app/integraciones`,
`/app/inventario`, `/app/parking`, `/app/pm`, `/app/pms`, `/app/transporte`.

`ModuleRootRedirect` (`components/inicio/ModuleRootRedirect.tsx:24-62`) resuelve la primera
página activa del módulo con una consulta a `organization_module_pages` y hace `router.replace`.
Son pantallas reales, con `page.tsx` propio: `/app/pos`, `/app/reportes`, `/app/calendario`,
`/app/notificaciones` y todo lo que cuelga de `/app/organizacion`.

**El ancla de cada sección es el código de módulo**, no su nombre en español
(`ModuloSection.tsx:158`, `id={moduleCode}`). El comentario del propio archivo
(`ModuloSection.tsx:8`) dice «`#crm, #finanzas`» y es incorrecto: es `#finance`.

| Sección | Ancla | Código | Componente |
|---|---|---|---|
| Finanzas | `#finance` | `finance` | `sections/FinanzasSection.tsx` |
| Inventario | `#inventory` | `inventory` | `sections/InventarioSection.tsx` |
| POS | `#pos` | `pos` | `sections/PosSection.tsx` |
| CRM | `#crm` | `crm` | `sections/CrmSection.tsx` |
| PMS Hotel | `#pms_hotel` | `pms_hotel` | `sections/PmsSection.tsx` |
| Parking | `#parking` | `parking` | `sections/ParkingSection.tsx` |
| Gym | `#gym` | `gym` | `sections/GymSection.tsx` |
| HRM | `#hrm` | `hrm` | `sections/HrmSection.tsx` |
| Transporte | `#transport` | `transport` | `sections/TransporteSection.tsx` |
| Project Management | `#pm` | `pm` | `sections/PmSection.tsx` |
| Notificaciones | `#notifications` | `notifications` | `sections/NotificacionesSection.tsx` |
| Integraciones | `#integrations` | `integrations` | `sections/IntegracionesSection.tsx` |
| Calendario | `#calendar` | `calendar` | `sections/CalendarioSection.tsx` |
| Timeline | `#operations` | `operations` | `sections/TimelineSection.tsx` |
| Chat | `#chat` | `chat` | `sections/ChatSection.tsx` |
| **Mi panel de ventas** | `#mi-panel` | — | `sections/SellerSection.tsx` — **no está cableada** |

La decimosexta, `SellerSection`, existe con sus cuatro widgets y **no se monta en ninguna
parte**. Hay un test que lo exige explícitamente:
`components/inicio/widgets/__tests__/f13Widgets.test.ts:144-146` comprueba que
`page.tsx` **no** contenga `SellerSection` («WIP del dueño»).

Disonancia de nombres verificada: el módulo se llama `operations` en la base de datos
(`modules.code`), el nav lo etiqueta `modules.timeline` → «Timeline»
(`DashboardModulos.tsx:200`) y el componente se llama `TimelineSection`. Tres nombres para lo
mismo.

### A.3 Qué se decide por plan, por módulo, por rol y por cargo

| Palanca | Dónde se resuelve | Qué controla |
|---|---|---|
| Módulos activos | `moduleManagementService.getActiveModules(orgId)` (`page.tsx:136-146`) | Qué secciones se pintan (`DashboardModulos.tsx:295-297`), qué atajos (`DashboardAtajos.tsx:141-143`) y qué alertas (`DashboardAlertas.tsx:83-86`) |
| Rol | `permContext.roleId ∈ [1,2,5]` (`page.tsx:70-75`) | Panel financiero vs. panel de empleado |
| Cargo (`job_position_id`) | **No se usa en el inicio** | — |
| Plan | **No se consulta en el inicio** | — |

**El cargo no interviene.** `EmployeeDashboard.tsx:12-13` y `:149` afirman que los accesos
están «filtrados por los permisos de su cargo». Es falso: filtran por `permContext.moduleAccess`,
que `lib/middleware/permissions.ts:70-79` rellena con los `organization_modules` activos de la
**organización**. Un auxiliar de bodega ve el atajo a CRM y a Recursos Humanos porque la empresa
los tiene contratados, no porque su cargo se lo permita.

### A.4 De dónde debería salir la distinción entre los dos paneles — duda abierta

El dueño no ha respondido aún de dónde sale la frontera. Hoy sale del **rol**, con una lista de
tres ids cableada en un archivo de CRM (`stagePermissions.ts:35`), que es un sitio raro para
una decisión de interfaz. Las tres opciones, con lo que cuesta cada una:

| Opción | Cómo funcionaría | A favor | En contra |
|---|---|---|---|
| **1. Por rol** (lo de hoy) | `roleId ∈ [1,2,5]` o `isSuperAdmin` | Cero trabajo; ya está | La lista vive en `stagePermissions.ts`, que es de CRM; un cajero al que se le dio «Manager» para otra cosa acaba viendo la cartera. Y no distingue entre administrador y gerente aunque la organización sí lo haga |
| **2. Por cargo** (`job_position_id`) | Un permiso del cargo, del tipo `dashboard.finanzas`, resuelto en servidor | Es la palanca que la organización ya usa para todo lo demás; un cajero deja de ver cartera sin tocarle el rol | Hay 61 miembros sin asignaciones completas; habría que definir el permiso y darlo de alta en los cargos existentes |
| **3. Por ajuste explícito** | Un interruptor por miembro en «Miembros» | Control fino y visible | Una tercera fuente de verdad sobre quién ve qué, que hay que mantener a mano |

**Recomendación: la opción 2, con la 1 como puente.** El permiso del cargo es la palanca que el
sistema ya tiene para decidir qué ve cada quién, y resolverlo en servidor es lo que pide la
regla 6 de `CLAUDE.md` («los permisos se resuelven en el servidor, nunca a partir del nombre de
un rol»). Mientras se define el permiso, la lista de roles se mantiene, pero **se mueve fuera de
`stagePermissions.ts`** a un sitio propio del inicio, porque hoy una decisión de dashboard vive
en un archivo del CRM.

Lo que **no** cambia con ninguna de las tres: el panel de empleado no consulta datos financieros
(`page.tsx:160-163` omite el fetch), así que la protección real la sigue dando la RLS.

---

## B. Página contenedora y cabecera — `app/app/inicio/page.tsx` (392 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | (bloque `animate-pulse` dibujado a mano) | Esqueleto mientras no hay `mounted` ni `organization` | Antes de montar | `page.tsx:211-224` |
| 2 | estado | (mismo bloque, duplicado) | Fallback del `<Suspense>` | Durante la hidratación | `page.tsx:376-387` |
| 3 | estado | `ModuleAccessDenied` | Pantalla de módulo no activado | `?error=module_not_activated&module=…` | `page.tsx:207-209` |
| 4 | aviso | `El módulo solicitado no está activado.` · `No tienes permisos suficientes.` · `Tu plan no permite activar más módulos.` · `Ha ocurrido un error inesperado.` | Alerta según `?error=` | Con parámetro `error` | `page.tsx:229-238` |
| 5 | texto | saludo dinámico («Buenos días, Ana», «👋 Hola, Ana»…) | Saludo aleatorio con emoji | Siempre | `page.tsx:248`, lógica `useDynamicGreeting.ts:50-71` |
| 6 | texto | fecha larga en minúsculas con `capitalize` | Día de hoy | Siempre | `page.tsx:250-252`, cálculo `:94-101` |
| 7 | badge | `Sucursal:` + nombre | Sucursal activa | Siempre | `page.tsx:253`, `components/inventario/BranchBadge.tsx:13-31` |
| 8 | botón | `Marcar Turno` (`home.markShift`) | → `/marcar` | Siempre, para todos los perfiles | `page.tsx:269-278` |
| 9 | botón | `Actualizar` (`home.refresh`) | Recarga completa + toast | Solo panel financiero | `page.tsx:280-291` |
| 10 | toast | `Dashboard actualizado` | Confirma el refresco | Tras pulsar «Actualizar» | `page.tsx:204` |
| 11 | toast | `Error` / `No se pudieron cargar los datos del dashboard` | Fallo de carga no silenciosa | `catch` de `loadData` | `page.tsx:171-175` |
| 12 | estado | 6 cuadros + `DashboardKPIs isLoading` | Esqueleto neutro mientras el rol no está resuelto | `!rolResuelto` | `page.tsx:310-317` |
| 13 | selector | `PeriodoSelector` | Ver B.1 | Solo panel financiero | `page.tsx:258-267` |

**13 controles.**

### B.1 `PeriodoSelector` — `components/inicio/PeriodoSelector.tsx` (216 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1-6 | segmento | `Hoy` · `Ayer` · `7 días` · `30 días` · `90 días` · `Año` | Cambia `periodo` | Siempre | `:101-124`, opciones `:23-30` |
| 7 | segmento | `Personalizado` | Abre/cierra los campos de rango | Siempre | `:126-140` |
| 8-9 | campo | dos `input type=date` | Rango personalizado | `showCustom` | `:146-160` |
| 10 | botón | (icono ✓, `title="Aplicar"`) | Aplica el rango | `showCustom` | `:161-170` |
| 11 | botón | (icono ✕, `title="Cancelar"`) | Cancela; vuelve a «Hoy» si no había rango | `showCustom` | `:171-179` |
| 12 | texto | `2026-09-01 → 2026-09-22` | Rango activo, **en crudo** | `isCustom && !showCustom` | `:184-188` |
| 13 | botón | `Horas` / `08:00-17:00` | Abre `HorasPresets` o quita el filtro | Siempre | `:200-211` |

**13 controles.** El selector usa correctamente `todayInTz(timezone)` (`:71`) y
`toPlainDate(…, timezone)` (`:73`) — es de los pocos sitios del inicio que respeta la regla.

### B.2 `HorasPresets` — `components/inicio/HorasPresets.tsx` (106 líneas)

Seis presets con **emoji como icono** (`:354-359`: 🌅 ☀️ 🌙 🌃 🍽️ 🍴), dos campos
`input type=time` y dos botones. **10 controles.** El manual de badges
(`SISTEMA-BADGES.md`, §1.7) prohíbe expresamente el emoji en lugar del icono del kit.

Ambos —los campos de fecha y el panel de horas— **se insertan en línea dentro de la fila de la
cabecera** y empujan el resto de la pantalla hacia abajo. Incumple el patrón 11
(«una capa flotante siempre se abre pegada al control que la abre»).

---

## C. KPIs y diálogo de detalle

### C.1 `DashboardKPIs` — `components/inicio/DashboardKPIs.tsx` (1.014 líneas)

Once tarjetas en una rejilla `grid-cols-2 sm:grid-cols-4` (`:703`). La lista está cableada en
`kpiConfig` (`:59-177`):

| # | KPI | Etiqueta | `href` del «Ver página completa» | Fuente del número | Sucursal |
|---|---|---|---|---|---|
| 1 | `ventasHoy` | `Ventas Hoy` (cambia con el periodo) | `/app/pos/ventas` | RPC `get_sales_by_hour/day` + `get_web_orders_revenue_by_hour/day` | POS sí · web **no** |
| 2 | `ventasMes` | `Ventas 30 días` → `Ventas septiembre` | `/app/pos/ventas` | mismas RPC sobre el mes calendario | ídem |
| 3 | `clientesActivos` | `Clientes` | `/app/crm` (redirección) | `customers` count + RPC `get_customers_by_day` | **sí, y no debería** |
| 4 | `productosActivos` | `Productos` | `/app/inventario/productos` | `products` count `status='active'` | no |
| 5 | `facturasHoy` | `Facturas Hoy` | `/app/finanzas/facturas-venta` | RPC `get_invoice_sales_by_hour/day` | sí |
| 6 | `empleadosActivos` | `Miembros` | `/app/hrm/empleados` | `organization_members` count `is_active` | no |
| 7 | `reservasActivas` | `Reservas Activas` | `/app/pms` (redirección) | `reservations` count `confirmed`/`checked_in` | sí |
| 8 | `cuentasPorCobrar` | `Por Cobrar` | `/app/finanzas/cuentas-por-cobrar` | RPC `get_accounts_receivable_sum` | sí |
| 9 | `visitasWeb` | `Visitas Web` | `/app/pos/pedidos-online` | `website_visits` count + RPC por hora/día | **no** |
| 10 | `comprasWeb` | `Compras Web` | `/app/pos/pedidos-online` | RPC `get_web_orders_all_by_hour/day` | **no** |
| 11 | `conversionWeb` | `Conversión Web` | `/app/pos/pedidos-online` | cálculo en el navegador | **no** |

Controles adicionales dentro de cada tarjeta: badge de delta con flecha (`:869-887`), badge de
visitantes en vivo (`:823-835`), desglose de compras web en tres puntos de color
(`:838-853`), desglose de las tres tasas de conversión (`:855-867`), mini-embudo con tooltip
hover-only (`:408-499`) y cinco variantes de sparkline (`:239-681`). **≈29 controles.**

**Cinco hallazgos que importan para el rediseño:**

1. **Las once tarjetas se pintan siempre, haya o no el módulo.** `kpiConfig` no tiene
   `moduleCode` y `DashboardKPIs` no recibe `activeModuleCodes`. Una tienda de calzado sin PMS
   ve «Reservas Activas · 0»; una sin tienda web ve tres tarjetas de comercio web en cero, y
   **las consultas se lanzan igual**. Ojo: el problema de las tres tarjetas de comercio web
   —visitas, compras y conversión— **no es que existan, es que se consultan sin tienda**. El
   dueño las quiere y se conservan (§K).
2. **El sparkline de reserva es inventado.** `generateSparklineData` (`:203-215`) fabrica una
   curva con `Math.sin(i * 1.3 + value * 0.001)` y la pinta como si fueran datos. Se usa cuando
   no hay serie real (`:958-975`) — es decir, en `Clientes`, `Productos`, `Miembros`,
   `Reservas` y `Por Cobrar` si falla la serie mensual. **Un gráfico que no es un dato.**
3. **La etiqueta dinámica solo funciona en español.** `:721` hace
   `baseLabel.replace(/Hoy$/i, t(periodoLabel[periodo]))`. Con locale `en` la etiqueta es
   «Sales Today» y el regex no casa: el usuario cambia a «90 días» y sigue leyendo «Sales
   Today». Lo mismo en `:719` con `/\s*30\s+\S+$/i`.
4. **La tarjeta no navega.** `:987-996`: el `<button>` abre el diálogo; el `href` de
   `kpiConfig` solo se usa dentro del diálogo (`KpiDetailDialog.tsx:535`). Tres de esos `href`
   apuntan a redirecciones (`/app/crm`, `/app/pms`), así que «Ver página completa» hace dos
   saltos.
5. **Moneda cableada.** `formatCurrency` (`utils/Utils.ts:69-89`) fija
   `Intl.NumberFormat("es-CO", { currency: "COP" })` y ningún KPI le pasa la moneda de la
   organización. Todas las cifras de dinero del inicio están en pesos colombianos,
   independientemente de la organización.

### C.2 `KpiDetailDialog` — `components/inicio/KpiDetailDialog.tsx` (970 líneas)

Diálogo `max-w-3xl` con cifra grande, badge de delta, comparación con el periodo anterior,
cuatro botones de filtro para «Compras Web», las tres tasas de conversión, la gráfica grande o
el embudo, y el botón `Ver página completa`. **≈20 controles.**

**El defecto más caro de toda la pantalla está aquí.** `:197-208`: al abrir cualquier KPI se
llama otra vez a `inicioService.getDashboardData(...)` —las 41 consultas completas—, y
`:221` engancha `useDashboardRealtime(..., open)`, que instala **un segundo intervalo de 30
segundos** que repite esas 41 consultas. El intervalo de la página no se pausa
(`page.tsx:192-198` solo depende de la organización y el rol). Con un diálogo abierto, una sola
pestaña dispara **82 consultas cada 30 segundos**.

Otros dos: los tooltips del embudo son `group-hover` con `pointer-events-none`
(`:606-623` y `DashboardKPIs.tsx:479-493`), inalcanzables por teclado; y `value.toLocaleString()`
sin locale en `:598` y `:676`, mientras el resto del archivo sí lo pasa.

---

## D. Alertas, actividad, tendencia, atajos y onboarding

### D.1 `DashboardAlertas` — `components/inicio/DashboardAlertas.tsx` (171 líneas)

Tres alertas y solo tres, construidas en `inicioService.getAlertas` (`:1089-1162`):

| Alerta | Título | Descripción | Consulta | Severidad |
|---|---|---|---|---|
| `cuentas-vencidas` | `Cuentas por cobrar vencidas` | `N cuenta(s) vencida(s) · M día(s) máx.` | `accounts_receivable` `status='overdue'` | `alta` si `total > 1000` |
| `stock-bajo` | `Stock bajo` | `N producto(s) con stock por debajo del mínimo` | `stock_levels` + `products!inner` | `alta` si `N > 5` |
| `reservas-pendientes` | `Reservas confirmadas` | `N reserva(s) confirmada(s) pendiente(s) de check-in` | `reservations` count | `baja` siempre |

Más el contador, el estado vacío verde `No hay alertas críticas. Todo está en orden.` y el
esqueleto. **9 controles.**

Defectos:

- **`totalVencido > 1000` como umbral de «alta»** (`inicioService.ts:1121`). En pesos
  colombianos, mil pesos es nada: **toda organización con una sola factura vencida entra
  siempre en severidad alta**. El umbral no tiene moneda.
- **Los tres títulos están cableados en español** en el servicio (`:1123`, `:1140`, `:1154`),
  fuera de `messages/`. Y las descripciones usan el paréntesis de plural
  («cuenta(s) vencida(s)»), que no es castellano publicable.
- **`getAlertas` no filtra por sucursal** en ninguna de las tres consultas (`:1092-1112`),
  aunque la cabecera anuncie una sucursal concreta.
- **La consulta de stock trae filas y filtra en el navegador** (`:1101-1105` + `:1132-1134`):
  pide todas las filas de `stock_levels` con `min_level > 0` y compara `qty_on_hand <= min_level`
  en JavaScript, con el tope de 1.000 filas de PostgREST encima.
- **Las tres se consultan aunque el módulo esté apagado.** El filtro por
  `activeModuleCodes` se aplica al renderizar (`DashboardAlertas.tsx:83-86`), no al consultar.
- **No hay forma de descartar una alerta** ni de marcarla como vista.

### D.2 `DashboardActividad` — `components/inicio/DashboardActividad.tsx` (214 líneas)

Título, seis pestañas de filtro con contador, lista de hasta 8 ítems por página y una
paginación **dibujada a mano** (`:182-209`). **16 controles.**

- **Ignora el periodo por completo.** Las cinco consultas que la alimentan
  (`inicioService.ts:533-537`) son `order(...).limit(5)` sin ningún filtro de fecha. Se mezclan
  y se recortan a 15 (`:946-947`). Cambiar de «Hoy» a «Año» no cambia nada.
- **El estado crudo de la base de datos se filtra a la interfaz.** `inicioService.ts:892`
  produce `Venta pending`, `Venta cancelled`; `:904` produce `Factura FV-01 draft`; `:940`
  produce `Reserva checked_out`. Existe la clave `home.activity.saleStatus` («Venta {status}»)
  y no se usa: el texto se arma en español a mano con el `status` en inglés dentro.
- **Tiempo relativo con el reloj del navegador.** `formatRelativeTime` (`:51-62`) compara
  `new Date(dateStr)` con `new Date()` sin la zona de la organización. Es el mismo error que
  causó el incidente del PC desfasado 9 h (documentado en
  `supabase/migrations/20260915203000_website_live_visitors_hora_servidor.sql:1-11`).
- **Las filas no son enlaces.** `:154` es un `<div>`: no se puede abrir la venta ni la factura.
- **Paginación a mano**, contra el patrón 2. Además el espacio de nombres de las claves está
  duplicado: `t('activity.of')` dentro de `useTranslations('home.activity')` resuelve a
  `home.activity.activity.of`, que **existe** en `messages/es.json` — funciona, pero es un
  `activity.activity` que delata un copiar y pegar.

### D.3 `DashboardTendencia` — `components/inicio/DashboardTendencia.tsx` (184 líneas)

Título `Tendencia de Ventas (30 días)`, total, gráfica de área, tooltip, estado vacío
`Sin ventas en el período seleccionado` y esqueleto. **8 controles.**

- **`dias = 30` está cableado** en la llamada (`page.tsx:342`). El título dice «(30 días)»
  y el estado vacío dice «en el período seleccionado»: **dos periodos distintos en la misma
  tarjeta**.
- **`getTendenciaVentas` no acepta sucursal** (`inicioService.ts:1020-1085`). Con «Sucursal
  Norte» seleccionada, la gráfica sigue mostrando la organización entera.
- **Trae filas crudas sin `limit`** (`:1034-1048`): todas las `sales` y todos los `web_orders`
  de 30 días, para agrupar por día en el navegador. Con más de 1.000 ventas en el rango,
  PostgREST corta en seco y la tendencia queda **silenciosamente incompleta**.
- El formateador del eje Y (`:165`) hace
  `formatCurrency(v).replace(/\.\d+$/,'').replace(/\s/g,'')` sobre un importe en formato
  `es-CO` (`$ 1.234.567,00`): el regex no casa con los decimales de coma, así que no recorta
  nada y la etiqueta completa no cabe en los 60 px de ancho reservados.
- Usa `formatPlainDate` correctamente para el eje X (`:86`). Es el único gráfico del inicio que
  lo hace.

### D.4 `DashboardAtajos` — `components/inicio/DashboardAtajos.tsx` (172 líneas)

Diez atajos cableados en el array `atajos` (`:18-88`): `POS`, `Inventario`, `Finanzas`,
`Hotelería`, `CRM`, `Reportes`, `Mesas`, `Parking`, `Calendario`, `Config`. **10 controles.**

- **Es exactamente lo que `CLAUDE.md` prohíbe**: «Nunca cablees una lista de módulos ni de
  rutas: consúltala». Están cableadas las diez rutas y sus códigos de módulo.
- **Faltan seis módulos**: `gym`, `transport`, `chat`, `pm`, `notifications`, `integrations`.
  Un gimnasio con el módulo activo no tiene atajo al gimnasio. Existen las claves
  `home.shortcuts.notifications` y `home.shortcuts.hrm` en `messages/es.json` y **no hay
  atajos que las usen**; `home.shortcuts.hotel` sí existe pero no hay `hrm` en el array.
- **Cinco de los diez atajos rebotan**: `/app/inventario`, `/app/finanzas`, `/app/pms`,
  `/app/crm` y `/app/parking` son redirecciones cliente (A.2): esqueleto, consulta a
  `organization_module_pages` y `router.replace`. Dos navegaciones para un clic.

### D.5 `OnboardingBanner` — `components/inicio/OnboardingBanner.tsx` (179 líneas)

Franja con barra de progreso, siete pasos en rejilla y un bloque «Siguiente: …» con botón
`Continuar`. **9 controles.** Se muestra solo si la organización tiene 3 días o menos
(`:58-65`), no se descartó antes (`:50-55`) y queda algún paso (`:75-80`).

- **La clave de descarte es global**: `DISMISS_KEY = 'onboarding_dismissed'` (`:40`). Cerrarlo
  en una organización lo oculta en **todas** las del mismo navegador, incluida la recién creada
  donde haría falta.
- **No se puede volver a mostrar.**
- **Dos fuentes de verdad para el mismo texto**: `inicioService.ts:950-1006` rellena `titulo` y
  `descripcion` en español y el banner los ignora, usando `t('{step.id}.title')` (`:156`).
- El paso «Registrar clientes» apunta a `/app/crm` (`inicioService.ts:1003`), que es una
  redirección, no el listado de clientes.

### D.6 `WebCommerceObservability` — `components/pos/pedidos-online/WebCommerceObservability.tsx` (466 líneas)

Se monta **incondicionalmente** en `page.tsx:347-352`: sin comprobar módulo, sin `LazySection`,
sin recibir la sucursal. Collapsible con dos tablas (stock reservado y pedidos por expirar),
cada una con su propia paginación a mano. **≈15 controles.**

- **Duplica `formatCurrency`** con otra implementación (`:91-93`: `` `$${value.toLocaleString('es-CO')}` ``),
  incompatible con la de `utils/Utils.ts`.
- `formatTimeAgo` (`:95-101`) usa `Date.now()` y devuelve `hace 3h 12m` en español cableado.
- Refresca cada 60 s mientras está desplegado (`:141`).

> **Hallazgo de seguridad, fuera del alcance del diseño pero hay que decirlo.**
> `app/api/web-orders/observability/route.ts` crea el cliente con `SUPABASE_SERVICE_ROLE_KEY`
> (`:20-31`), toma `organization_id` **del query string** (`:35`) y **no comprueba ni la sesión
> ni la pertenencia** (verificado por `grep`: no hay `getServerOrgContext`, `withOrg`,
> `getServerUserClient`, `auth.getUser` ni `cookies()` en todo el archivo). Cualquiera que
> cambie el número lee el stock y los pedidos pendientes de otra organización. Incumple las
> reglas 5 y 6 de `CLAUDE.md`. Merece una tarea propia y una pasada de `security-review`.

---

## E. Panel del empleado y widgets de vendedor

### E.1 `EmployeeDashboard` — `components/inicio/EmployeeDashboard.tsx` (337 líneas)

Tarjeta destacada `Marcar Turno` (`:158-178`), hasta seis atajos (`:71-76`), tarjeta
`Mis tareas` con 5 ítems (`:209-260`) y tarjeta `Mis notificaciones` con 5 ítems
(`:271-326`). **26 controles.** Tres consultas al montar: `tasks`, `notifications` y
`notification_reads`.

- **`{task.due_date}` se pinta en crudo** (`:253`). La columna es `timestamp with time zone`,
  así que el empleado lee `2026-09-22T17:00:00+00:00` donde debería ver una hora.
- **`toLocaleString()` sin `timeZone` ni locale** en la fecha de la notificación (`:325`).
- **El contador «N sin leer» no puede pasar de 5** (`:274-278`): se calcula sobre las cinco
  notificaciones traídas (`NotificationService.ts:33` y `:51`). Con 40 sin leer dice «5 sin leer».
- **`notification_reads` se consulta sin `limit` y sin `organization_id`**
  (`NotificationService.ts:40-43`): todas las lecturas del usuario, de todas sus organizaciones
  y de todo el histórico, para compararlas con cinco ids.
- **Las tareas se ordenan por `created_at`, no por vencimiento** (`:110-111`), aunque lo único
  que se pinta sea la fecha de vencimiento.
- **El badge de estado miente para dos valores**: `TASK_STATUS_CONFIG` (`:79-84`) mapea
  `todo/in_progress/done/completed`, pero la columna tiene `DEFAULT 'open'`; toda tarea `open`
  o `canceled` cae al fallback y se pinta como **`Por hacer`**.
- **Cada tarea enlaza a `/app/pm`** (`:243`), la raíz redirectora del módulo, no a la tarea.
  La ruta correcta (`/app/pm/tareas?taskId=…`) existe y la usa `widgetModels.ts:115`.
- **Sin realtime y sin botón de refrescar** (el del header está oculto para este perfil,
  `page.tsx:280`): una notificación nueva no aparece hasta recargar la página.

### E.2 Widgets de vendedor — `components/inicio/widgets/**`

Cuatro widgets (`QuotaProgressWidget` 8 controles, `CommissionsWidget` 9,
`MyPipelineWidget` 13, `SellerLeaderboardWidget` 6) sobre `WidgetCard` (5), alimentados por una
sola llamada a `GET /api/crm/seller-dashboard` (`useSellerDashboard.ts:32`), que en el servidor
dispara entre 6 y 10 consultas. **≈41 controles, todos hoy sin montar** (A.2).

Lo bueno, y conviene conservarlo en el rediseño:

- **`SellerLeaderboardWidget` resuelve el permiso en el servidor** (`route.ts:17` +
  `sellerDashboardModel.ts:81-83`): si el rol no puede ver el ranking, la propiedad viaja
  `null` y el widget no renderiza nada. Es el único control del inicio que lo hace bien.
- **`SellerSection` es el único sitio del inicio que no cablea COP**: usa `useOrgCurrency()`
  (`SellerSection.tsx:16,21-22`).
- **`CommissionsWidget` separa las monedas en vez de sumarlas** (`widgetModels.ts:68-76`).

Lo malo:

- **Dos cifras de dinero suman monedas distintas.** `calculateAchievedAmount`
  (`lib/services/crm/salesTargetService.ts:392`) y `buildLeaderboard`
  (`sellerDashboardModel.ts:71`) acumulan `opportunities.amount` ignorando
  `opportunities.currency`, y se pintan con la moneda base. El ranking del equipo puede estar
  ordenado por una suma sin significado.
- **El ranking se recorta a 5 en el navegador** (`widgetModels.ts:100`) después de que el
  servidor haya enviado **todos** los miembros activos (`sellerDashboardService.ts:76-95`).
- **La API no acepta parámetros** (`route.ts:12`): ni periodo ni sucursal pueden propagarse sin
  cambiar el contrato.
- **No se recarga al cambiar de organización** (`useSellerDashboard.ts:41-46`), mientras que
  `useOrgCurrency` sí: las cifras de la organización anterior se reetiquetan con la moneda de la
  nueva.

### E.3 `useDynamicGreeting` — `components/inicio/useDynamicGreeting.ts` (84 líneas)

Un solo control (el saludo) con tres catálogos de literales. **1 control.**

- **`new Date().getHours()`** (`:303`): el tramo del día sale del reloj del navegador, no de la
  zona de la organización. Con el PC del incidente, saluda «Buenas noches» a mediodía.
- **Nueve cadenas en inglés con signos de exclamación invertidos**: `'¡Good morning!'`,
  `'¡Hello!'`, `'¡Hi!'`, `'¡Hey!'`, `'¡Good to see you!'`, `'¡Welcome!'`, `'¡What a joy!'`
  (`:278-285`).
- Solo hay catálogo `es` y `en`; el repositorio tiene cuatro locales. En portugués y francés se
  saluda en español.
- `Math.random()` en tres puntos: el saludo cambia en cada navegación al inicio.

### E.4 Código muerto

- **`LiveVisitorsBadge`** (`components/inicio/LiveVisitorsBadge.tsx`, 41 líneas) está exportado
  en `index.ts:18` y **no se monta en ningún sitio** (verificado por `grep` sobre todo `src/`).
- **`SellerSection` y sus cuatro widgets** (A.2).
- **`todayCheckins` de Gym** se consulta y se descarta (`GymSection.tsx:90`).
- **Los KPIs de inventario** se consultan, se guardan y **no se pintan**
  (`InventarioSection.tsx:80`, `:109` frente a `:160-169`).
- **`totalVentasWeb` del POS** se calcula (`posDashboardService.ts:150`) y no se muestra.
- Claves i18n definidas y nunca leídas: `home.restrictedTitle`, `home.restrictedMessage`,
  `home.welcomeSub`, `home.welcomeSubNoPending`, `home.activity.saleCompleted`,
  `home.activity.saleStatus`, `home.quickAccess`, `home.quickLinks.*`,
  `home.shortcuts.notifications`, `home.shortcuts.hrm`.

---

## F. Las 16 secciones por módulo

El contenedor es `DashboardModulos` (`components/inicio/DashboardModulos.tsx`, 373 líneas):
una barra de navegación con un ancla por módulo (`:218-253`), un botón
`Compacto`/`Expandido` que se guarda en `localStorage` (`:327-345`) y una `LazySection` por
módulo (`:352-367`). **17 controles propios.**

Cada sección se envuelve en `ModuloSection` (349 líneas), que aporta **8 controles por módulo**:
botón de colapsar con persistencia, `CSV`, `PDF`, `BranchBadge`, tres pestañas
(`Dashboard` / `Reportes` / `Métricas`) y dos placeholders.

### F.1 Cinco hallazgos estructurales

1. **Ninguna de las 16 secciones recibe el periodo.** `page.tsx:355-358` monta
   `<DashboardModulos activeModuleCodes isLoading />` y nada más: `periodo`, `horas` y
   `fechasCustom` (declarados en `page.tsx:60-62`) no se propagan, y ni `DashboardModulos` ni
   `ModuloSection` tienen props de periodo. Cada sección consulta su propia ventana fija:
   «Últimos 30 días» (Finanzas, CRM, Calendario, Timeline), «Hoy» cableado (POS, PMS) o
   «Estado actual» (Gym, HRM, Parking, PM, Integraciones, Transporte, Inventario).
   **Cambiar el periodo arriba no mueve un solo número abajo.**
2. **Colapsar una sección no evita sus consultas.** El `useEffect` vive en el componente de
   sección; `isCollapsed` solo oculta el `children` (`ModuloSection.tsx:217`).
3. **Quince consultas idénticas a `organizations`.** Las quince secciones cableadas repiten
   `supabase.from('organizations').select('name, legal_name, tax_id, city, address, phone,
   email, logo_url').eq('id', organizationId).single()` —solo para el pie del PDF—
   (`CalendarioSection.tsx:229-233`, `ChatSection.tsx:205-209`, `CrmSection.tsx:151-155`,
   `FinanzasSection.tsx:146-150`, `GymSection.tsx:114-118`, `HrmSection.tsx:120-124`,
   `IntegracionesSection.tsx:98-102`, `InventarioSection.tsx:100-104`,
   `NotificacionesSection.tsx:103-107`, `ParkingSection.tsx:107-111`, `PmSection.tsx:92-96`,
   `PmsSection.tsx:115-119`, `PosSection.tsx:101-105`, `TimelineSection.tsx:202-206`,
   `TransporteSection.tsx:114-118`).
4. **Ocho secciones declaran `const CURRENCY_CODE = 'COP'`**: `CrmSection.tsx:41`,
   `FinanzasSection.tsx:36`, `GymSection.tsx:33`, `HrmSection.tsx:31`,
   `InventarioSection.tsx:32`, `ParkingSection.tsx:26`, `PosSection.tsx:32`,
   `TransporteSection.tsx:27`.
5. **Treinta botones de exportación permanentemente deshabilitados.** `ModuloSection.tsx:196`
   y `:206` hacen `disabled={!exportData}` sin decir por qué. Incumple el patrón 6.6
   («nunca un botón deshabilitado sin explicación»).

### F.2 Tabla resumen de las 16 secciones

| Sección | Ancla | Controles | Consultas al montar | ¿Periodo? | ¿Sucursal? | Defectos |
|---|---|---:|---:|---|---|---:|
| Calendario | `#calendar` | 11 | 5 | No | No | 7 |
| Chat | `#chat` | 15 | 6 | No | No | 7 |
| CRM | `#crm` | 29 | ≈24 | No | Parcial | 12 |
| Finanzas | `#finance` | 31 | ≈25 | No | Sí | 8 |
| Gym | `#gym` | 21 | 9 | No | Parcial | 9 |
| HRM | `#hrm` | 23 | ≈17 + N(deptos) | No | Parcial | 9 |
| Integraciones | `#integrations` | 18 | ≈8 (3 duplicadas) | No | N/A | 7 |
| Inventario | `#inventory` | 23 | ≈16 (crece con sucursales) | No | Sí | 9 |
| Notificaciones | `#notifications` | 19 | 9 | No | No | 8 |
| Parking | `#parking` | 22 | 6 | No | Parcial | 9 |
| Project Management | `#pm` | 21 | 7 | No | N/A | 7 |
| PMS Hotel | `#pms_hotel` | 27 | ≈14 | No | Sí | 9 |
| POS | `#pos` | 18 | ≈8 | No | Sí | 7 |
| Mi panel de ventas | `#mi-panel` | 7 | 1 (HTTP) | No | No | 3 |
| Timeline | `#operations` | 11 | 6 | No | No | 9 |
| Transporte | `#transport` | 31 | 7 | No | Parcial | 11 |
| **Total** | | **327** | **≈168** | **0 / 16** | 5 sí · 4 parcial · 7 no | **141** |

### F.3 Lo peor de cada sección, en una línea

- **POS** — `posDashboardService.ts:160-174` trae **todos los `sale_items` de la historia** de
  la organización para el «Top productos», y `:204-212` **todas las `sales`** para «Ventas por
  sucursal». La cabecera dice «Hoy» y la tabla muestra acumulados históricos.
- **CRM** — el KPI `Pronóstico del Mes` está **inflado ×100**: `CRMDashboardService.ts:122-126`
  multiplica por `probability` en escala 0–100 mientras `:257` sí divide entre 100 para el
  embudo. Los dos números de la misma sección no coinciden.
- **Inventario** — N+1: `inventoryDashboardService.ts:522-561` hace, por cada sucursal, una
  consulta sin `limit` a `stock_levels` más ⌈N/200⌉ a `product_costs`, en bucle secuencial. Y
  los KPIs de inventario se consultan y nunca se pintan.
- **PMS** — los botones `Check-in` y `Check-out`, los más prominentes de la sección, **no hacen
  nada**: `PmsSection.tsx:188-189` no pasa los handlers.
- **Finanzas** — `AlertasCard.tsx:148-153`: el botón `Ver N alertas más` **no tiene `onClick`**.
- **Transporte** — **cinco de sus cinco acciones rápidas apuntan a rutas inexistentes**
  (`DashboardQuickActions.tsx:26,33,40,47,54`); `/app/transporte/eventos/nuevo` es un 404 puro
  y las otras cuatro caen en el segmento `[id]` con `id="nuevo"`.
- **Gym** — `/app/gym/ajustes` no existe (`QuickActions.tsx:56`), y las dos consultas de
  `payments` **no filtran por `organization_id`** (`gymService.ts:853-865`).
- **HRM** — `/app/hrm/timesheets` no existe (`hrmDashboardService.ts:231`), y `getKPIs`
  encadena siete `await` sin `Promise.all`.
- **Parking** — cuando se elige «Todas las sucursales», las consultas a `parking_spaces` y
  `parking_sessions` **no llevan filtro de organización** (`parkingDashboardService.ts:76-94`).
- **Timeline** — trae 30 días completos de `ops_audit_log` para contar usuarios distintos con
  un `Set` en el navegador (`:196-227`), y cablea a mano un diccionario tabla → módulo
  (`:36-48`).
- **Integraciones** — el KPI `Eventos` cuenta `event_catalog` **sin filtro de organización**
  (`integracionesDashboardService.ts:127-134`): es el mismo número para todos los tenants.
- **Notificaciones** — dos usos de la `formatDate` **deprecada** de `@/utils/Utils`
  (`AlertasRecientes.tsx:12,133` y `UltimasNotificaciones.tsx:12,142`), que internamente hace
  `split('T')[0]` y se queda con el día UTC.

**Siete rutas rotas en total**: `/app/gym/ajustes`, `/app/hrm/timesheets`,
`/app/transporte/viajes/nuevo`, `/app/transporte/envios/nuevo`,
`/app/transporte/manifiestos/nuevo`, `/app/transporte/incidentes/nuevo`,
`/app/transporte/eventos/nuevo`.

---

## G. Tiempo real

### G.1 Qué está realmente publicado

Verificado con `SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname =
'supabase_realtime'`. Son **22 tablas**:

`activities`, `ai_jobs`, `call_analyses`, `call_transcripts`, `calls`,
`conversation_tag_relations`, `conversations`, `email_messages`, `kitchen_tickets`, `messages`,
`mobile_call_bridges`, `notes`, `notification_reads`, `notifications`,
`opportunity_stage_history`, `outbound_jobs`, `products`, `profiles`, `tasks`, `web_orders`,
`website_visits`, `widget_sessions`.

**No están publicadas** —y son justamente las que alimentan los KPIs del inicio—: `sales`,
`invoice_sales`, `accounts_receivable`, `customers`, `stock_levels`, `stock_movements`,
`reservations`, `cash_sessions`, `cash_movements`, `organization_members`.

### G.2 `useDashboardRealtime` — una suscripción que no puede funcionar

`components/inicio/useDashboardRealtime.ts:51-58`:

```ts
const channel = supabase
  .channel(`dashboard_realtime_${organizationId}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', filter: `organization_id=eq.${organizationId}` },
      () => scheduleReload())
  .subscribe();
```

**No especifica `table`.** Realtime no admite un `filter` sin tabla: la suscripción no entrega
eventos. Y aunque los entregara, las tablas que importan no están publicadas (G.1). Es decir:
**el «tiempo real» del dashboard es, en la práctica, el `setInterval` de 30 segundos de la línea
63-65**, que relanza las 41 consultas. El comentario del archivo (`:10-15`) describe un
comportamiento que no ocurre.

El mismo hook se instancia una segunda vez desde `KpiDetailDialog.tsx:221`.

### G.3 `useLiveVisitors` — la que sí funciona

`components/inicio/useLiveVisitors.ts:53-73` se suscribe a `INSERT` en **`website_visits`**, que
**sí** está publicada, con `table` y `filter` correctos. El conteo sale de la RPC
`website_live_visitors` con el reloj del **servidor** (corregido a propósito tras el incidente
del 2026-09-15, documentado en `:9-14`). Revalida cada 30 s (`:78`) y agrupa las ráfagas a 2 s.
Es el único mecanismo de tiempo real del inicio que hace lo que promete.

Dos pegas menores: si Realtime cae, `isActive` deja de pulsar pero el número sigue pintado como
si fuera actual (`:71-73`); y no hay `visibilitychange`, así que una pestaña en segundo plano
sigue consultando cada 30 s indefinidamente.

### G.4 Resumen de suscripciones

| Hook | Canal | Tabla | ¿Publicada? | ¿Entrega eventos? |
|---|---|---|---|---|
| `useDashboardRealtime` (página) | `dashboard_realtime_{org}` | **ninguna** (sin `table`) | — | **No** |
| `useDashboardRealtime` (diálogo) | `dashboard_realtime_{org}` | **ninguna** | — | **No** |
| `useLiveVisitors` | `website_visits_live_{org}` | `website_visits` | Sí | Sí |

Ninguna de las 16 secciones abre canal propio. `EmployeeDashboard` tampoco.

---

## H. Periodo y sucursal

### H.1 Periodo

`PeriodoSelector` alimenta tres estados en `page.tsx:60-62` que llegan **solo** a
`inicioService.getDashboardData` (`page.tsx:166`) y, desde ahí, a `DashboardKPIs` y a
`KpiDetailDialog`. **De los seis bloques del panel financiero, uno respeta el periodo.**

| Bloque | ¿Respeta el periodo? | Ventana real |
|---|---|---|
| KPIs (11 tarjetas) | **Sí** | la elegida |
| Diálogo de detalle de KPI | **Sí** | la elegida |
| Alertas | No | estado actual |
| Actividad reciente | No | últimos 15 registros, sin fecha |
| Tendencia de ventas | No | 30 días cableados |
| Observabilidad web | No | próximos 30 minutos |
| 15 secciones de módulo | **No** | 30 días · «hoy» · «estado actual», según cada una |

### H.2 Sucursal — la regla única del patrón 9 se incumple en cinco frentes

1. **El `BranchBadge` se pinta 16 veces.** Una en la cabecera (`page.tsx:253`) y una dentro del
   contenido de **cada** sección de módulo (`ModuloSection.tsx:265-269`, `showBranchBadge`
   por defecto `true`). La norma dice una, en la cabecera, debajo del título.
2. **El `BranchBadge` sigue en fucsia.** `components/inventario/BranchBadge.tsx:20-22` usa
   `bg-fuchsia-100 text-fuchsia-700`, el color que `SISTEMA-BADGES.md` §6 declara fuera del
   manual de marca, y mantiene el prefijo «Sucursal:» que el icono ya dice.
3. **Los KPIs de comercio web ignoran la sucursal por diseño.** Las RPC
   `get_website_visits_by_*`, `get_web_orders_all_by_*` y `get_web_orders_revenue_by_*`
   **no tienen parámetro `p_branch_id`** (verificado en `pg_proc`), y el servicio lo documenta
   (`inicioService.ts:471-472`). Con «Sucursal Norte» seleccionada, el KPI `Ventas` **suma
   ventas de POS filtradas por sucursal con ingresos web de toda la organización**.
4. **«Clientes» sí filtra por sucursal, y no debería.** `inicioService.ts:529` aplica
   `branchFilterQuery` a `customers`, y la RPC `get_customers_by_day` también filtra
   (verificado en `pg_proc`). El patrón 9 dice que clientes es de ámbito organización. En la
   base de datos las 35.028 filas de `customers` tienen `branch_id`, así que al elegir una
   sucursal el KPI `Clientes` cae a la fracción de esa sucursal sin avisar.
5. **Dos RPC aceptan `p_branch_id` y lo ignoran.** `get_products_by_day` y
   `get_org_members_by_day` declaran el parámetro y su cuerpo no lo usa (verificado con
   `pg_get_functiondef`). Además hay **sobrecargas duplicadas** de `get_invoice_sales_by_day`,
   `get_org_members_by_day` y `get_products_by_day` (con y sin `p_branch_id`), que es una
   ambigüedad latente en PostgREST.

Y las que no filtran en absoluto: `getAlertas`, `getTendenciaVentas`, `WebCommerceObservability`,
`EmployeeDashboard`, los cuatro widgets de vendedor y siete de las quince secciones.

---

## I. Lo roto o sin efecto

### I.1 Fechas y zona horaria

| # | Defecto | Archivo:línea |
|---|---|---|
| 1 | `new Date().getHours()` para el tramo del saludo | `useDynamicGreeting.ts:303` |
| 2 | `new Date()` vs `new Date(dateStr)` para el tiempo relativo | `DashboardActividad.tsx:51-62` |
| 3 | `timestamptz` pintado en crudo | `EmployeeDashboard.tsx:253` |
| 4 | `toLocaleString()` sin `timeZone` | `EmployeeDashboard.tsx:325` |
| 5 | `Date.now()` para «hace Xh Ym» | `WebCommerceObservability.tsx:95-101` |
| 6 | Rango personalizado impreso como `YYYY-MM-DD` crudo | `PeriodoSelector.tsx:186` |
| 7 | `formatDate` deprecada de `@/utils/Utils` (día UTC) | `AlertasRecientes.tsx:12,133` · `UltimasNotificaciones.tsx:12,142` |
| 8 | `toISOString().split('T')[0]` — **prohibido por la regla 1** | `pmsDashboardService.ts:128,129,205,206,263,264,318,319,414,415` · `hrmDashboardService.ts:115,209,268,325` · `parkingDashboardService.ts:68,251,252` · `transportService.ts:333` |
| 9 | `getToday()` sin zona → cae al fallback `America/Bogota` | `posDashboardService.ts:69` |
| 10 | ≈10 `toLocaleDateString`/`toLocaleTimeString`/`toLocaleString` sin `timeZone` | `WebhooksList.tsx:16-26` · `SesionesActivas.tsx:23-28` · `PasesPorVencer.tsx:37-42` · `SesionesCaja.tsx:66` · `TimelineSection.tsx:91-102` · `DashboardRecentEvents.tsx:143-146` · … |

Ninguno de estos está cubierto por `src/__tests__/guardrails.test.ts`.

### I.2 Moneda

- `formatCurrency` con `currency = "COP"` y locale `es-CO` por defecto
  (`utils/Utils.ts:69-89`), usada sin argumento en todo el inicio.
- Ocho secciones con `const CURRENCY_CODE = 'COP'` (F.1.4).
- Una segunda implementación incompatible (`WebCommerceObservability.tsx:91-93`).
- **Dos sumas de monedas mezcladas presentadas como una sola cifra**:
  `salesTargetService.ts:392` (avance de la cuota) y `sellerDashboardModel.ts:71` (ranking).
  También en CRM: `CRMDashboardService.ts:87` selecciona `currency` y `:102` lo ignora.
- `MyPipelineWidget` alterna monedas en una misma lista sin marcarlo
  (`widgetModels.ts:114`).
- El único sitio correcto es `SellerSection.tsx:21-22` con `useOrgCurrency()`.

### I.3 Controles que prometen y no cumplen

| Control | Qué pasa | Archivo:línea |
|---|---|---|
| `Check-in` / `Check-out` de PMS | Se pintan, se pulsan, **no hacen nada** | `PmsSection.tsx:188-189` |
| `Ver N alertas más` de Finanzas | **Sin `onClick`** | `AlertasCard.tsx:148-153` |
| `Exportar` de Gym | Nunca aparece: la sección no pasa `onExport` | `GymSection.tsx:184-187` |
| `CSV` y `PDF` × 15 módulos | Deshabilitados sin explicación | `ModuloSection.tsx:196,206` |
| KPIs de inventario | Consultados, guardados, **no pintados** | `InventarioSection.tsx:80,109` vs `:160-169` |
| `totalVentasWeb` del POS | Calculado y descartado | `posDashboardService.ts:150` |
| `todayCheckins` de Gym | Consultado y descartado | `GymSection.tsx:90` |
| Sparkline de reserva | **Curva inventada** con `Math.sin` | `DashboardKPIs.tsx:203-215` |
| Etiqueta dinámica de KPI | Solo funciona con locale `es` | `DashboardKPIs.tsx:719,721` |
| Filas de actividad | No son enlaces | `DashboardActividad.tsx:154` |

**No hay `alert()` ni `confirm()` en ningún archivo del inicio.** Verificado por `grep`. Es de
las pocas zonas del repositorio limpias en ese frente.

### I.4 Consultas: N+1, sin `limit` y agregación en el navegador

| Patrón | Dónde |
|---|---|
| **N+1** | `inventoryDashboardService.ts:522-561` (una consulta por sucursal + chunks de costes) · `hrmDashboardService.ts:418-430` (un `count` por departamento) |
| **Tabla entera al navegador** | `posDashboardService.ts:160-174` (todos los `sale_items`) · `:204-212` (todas las `sales`) · `CRMDashboardService.ts:502-521` (todos los `messages` y `conversations`) · `TimelineSection.tsx:196-201` (30 días de `ops_audit_log`) · `pmService.ts:189-192` (todos los proyectos, metas, tareas e hitos) · `gymService.ts:341-362` (todas las membresías con joins) · `inicioService.ts:1101-1105` (todo el stock) · `inicioService.ts:1034-1048` (todas las ventas de 30 días) |
| **`count` mal usado** | `gymService.ts:819-851` pide `count: 'exact'` y luego lee `data?.length` |
| **Consultas en serie** | `hrmDashboardService.ts` (13 `await` encadenados) · `transportService.ts:337-411` (5) · `gymService.ts:819-860` (6) |
| **Trabajo duplicado** | `IntegracionesSection.tsx:94-97` pide `getKPIs`, `getConnections` y `getWebhooks` en paralelo, y `getKPIs` ya llama a las otras dos internamente: `integration_connections` se consulta **3 veces** |

### I.5 Secciones que consultan con el módulo apagado

- Las **11 tarjetas de KPI** se consultan siempre, incluidas PMS, HRM y las tres de comercio
  web (C.1.1).
- Las **tres alertas** se consultan siempre y se filtran al pintar
  (`DashboardAlertas.tsx:83-86`).
- **`WebCommerceObservability`** se monta sin comprobar módulo (`page.tsx:347-352`).
- Una **sección colapsada consulta igual** (F.1.2).

---

## J. Conteo de controles y coste de carga

### J.1 Controles

| Bloque | Controles |
|---|---:|
| Página contenedora (`page.tsx`) | 13 |
| `PeriodoSelector` + `HorasPresets` | 23 |
| `DashboardKPIs` | ≈29 |
| `KpiDetailDialog` | ≈20 |
| `DashboardAlertas` | 9 |
| `DashboardActividad` | 16 |
| `DashboardTendencia` | 8 |
| `DashboardAtajos` | 10 |
| `OnboardingBanner` | 9 |
| `WebCommerceObservability` | ≈15 |
| `DashboardModulos` (nav + toggle) | 17 |
| **16 secciones de módulo** (incluye el chrome de `ModuloSection` ×15) | **327** |
| `EmployeeDashboard` | 26 |
| Widgets de vendedor (`widgets/**` + `WidgetCard`) | ≈41 |
| `LiveVisitorsBadge`, `LazySection`, `ModuleRootRedirect`, saludo | 12 |
| **Total aproximado** | **≈575** |

Para comparar: el detalle de producto y el POS juntos, la otra pantalla más densa del sistema,
suman ~1.100 controles repartidos en doce pestañas y dos pantallas. **El inicio concentra casi
600 en una sola página con scroll.**

### J.2 Coste de carga — una organización con los 15 módulos activos

**Primera carga (administrador, panel financiero):**

| Origen | Consultas |
|---|---:|
| `inicioService.getDashboardData` (un solo `Promise.all`) | **41** |
| Zona horaria + horas de operación (cacheadas después) | 2 |
| `moduleManagementService.getActiveModules` | 1 |
| `usePermissionContext` | ≈2 |
| `BranchContext` (sucursales accesibles) | 1-2 |
| `inicioService.getAlertas` | 3 |
| `inicioService.getTendenciaVentas` | 2 |
| `useLiveVisitors` (RPC inicial) | 1 |
| `WebCommerceObservability` | 1 HTTP → varias en el servidor |
| **15 secciones de módulo** | **≈168** |
| **Total** | **≈221 consultas + 1 HTTP** |

**En régimen, por pestaña abierta:**

- **+41 consultas cada 30 s** — el `setInterval` de `useDashboardRealtime` (G.2).
- **+2 RPC por minuto** — `useLiveVisitors`.
- **+1 HTTP por minuto** — observabilidad web, si está desplegada.
- **+41 consultas cada 30 s más** mientras haya un diálogo de KPI abierto (C.2).

Es decir: **una pestaña quieta, sin que nadie toque nada, hace 82 consultas por minuto; con un
diálogo abierto, 166.** Multiplicado por el número de administradores con la pestaña abierta.
Esto conecta directamente con el incidente del 2026-09-14, en el que Postgres se reinició por
una ráfaga de peticiones sin caché.

---

## K. Analítica web y geolocalización

El dueño lo pidió explícitamente el 2026-09-22: «me gustan mucho los visitantes en línea, las
conversiones y la tasa; se conservan, pero mejor presentados», y «quiero un mapa tipo Google
Analytics o Shopify: el mundo, y dónde están las personas que entran — Medellín, Bogotá, otro
país». Esta sección responde a las dos cosas.

### K.1 Por qué el diálogo gigante no es el sitio

Hoy, pulsar la tarjeta «Visitas Web» abre `KpiDetailDialog` (`max-w-3xl`) con una cifra, un
badge y una gráfica de líneas. Tres problemas, por orden de gravedad:

1. **Cuesta 41 consultas y monta un segundo temporizador** (§C.2). Abrir el detalle de un KPI
   recarga el dashboard entero, y el intervalo de la página no se pausa.
2. **No cabe lo que hace falta.** Un embudo, dos mapas y dos tablas ordenables no entran en un
   diálogo, y un diálogo no tiene URL: no se puede compartir ni volver a él.
3. **Hereda el periodo del dashboard.** Analizar tráfico pide su propia ventana y su propia
   comparación; forzarlo al periodo del inicio es lo que hace que hoy se mire poco.

**La alternativa: una vista propia, `/app/pos/pedidos-online/analitica`.** Se llega desde la
tarjeta, tiene su `PageHeader` con migas, su selector de periodo y su selector de comparación,
y ahí sí caben el embudo y los mapas. El diálogo desaparece para estos tres indicadores.

### K.2 Qué queda en el dashboard

Una sola tarjeta, «Tienda web», con tres casillas. Cada una:

- **el número** (visitantes del periodo, pedidos web, conversión),
- **la variación** frente al periodo anterior, como badge de la escala de tonos,
- **una miniatura real**: la serie del propio periodo, no una curva inventada. Se acaba
  `generateSparklineData` (`DashboardKPIs.tsx:203-215`), que dibuja `Math.sin`.

Más el badge de **visitantes en línea ahora** en la cabecera de la tarjeta, que es el único
tiempo real que funciona de verdad en el inicio (§G.3), y un enlace `Ver analítica web`.

De once tarjetas de KPI se pasa a una tarjeta con tres números: el dashboard queda ligero y el
detalle tiene sitio.

### K.3 El mapa no se puede alimentar hoy — dato verificado

Verificado con `SELECT` por el MCP sobre `website_visits` el 2026-09-22:

| Dato | Valor |
|---|---|
| Filas (visitas) | **220.626** |
| Sesiones distintas (`session_id`) | **151.961** |
| Organizaciones con tráfico | 19 |
| Rango de fechas | 2026-08-28 → hoy |
| Filas con `country` relleno | **0** — el 100 % está vacío |
| Columnas `city`, `region`, `latitude`, `longitude` | **no existen** |
| Columna `ip_hash` | existe, y se conserva |

**La causa está localizada y es de una línea.** El registro de la visita vive en el repositorio
de las tiendas, en `goadmin-websites/app/api/track-visit/route.ts`, y en el `insert` escribe
literalmente `country: null` (`:64`). No es que falle la geolocalización: es que nunca se
intentó resolverla.

Lo que sí hace bien hoy, y no se toca: **no guarda la IP en claro**. Toma `x-forwarded-for`,
calcula un SHA-256 y guarda 16 caracteres (`:33-40`). Ese `ip_hash` se queda como está.

### K.4 Qué hace falta — todo aditivo

**1 · Migración.** Columnas nuevas, todas `NULL`-ables y sin `DEFAULT`, sobre una tabla con
datos de clientes; nada de `DROP` ni cambios de tipo:

```sql
-- supabase/migrations/<ts>_website_visits_geolocalizacion.sql
alter table public.website_visits add column if not exists city      text;
alter table public.website_visits add column if not exists region    text;
alter table public.website_visits add column if not exists latitude  numeric(9,6);
alter table public.website_visits add column if not exists longitude numeric(9,6);

comment on column public.website_visits.country   is 'Código ISO 3166-1 alpha-2 resuelto en el borde a partir de la IP. NULL en las visitas anteriores a 2026-09.';
comment on column public.website_visits.city      is 'Ciudad resuelta en el borde. NULL si el proveedor no la resuelve.';
comment on column public.website_visits.region    is 'Región o departamento resuelto en el borde.';
comment on column public.website_visits.latitude  is 'Latitud aproximada de la ciudad, no del visitante. Precisión de ciudad, nunca de dispositivo.';
comment on column public.website_visits.longitude is 'Longitud aproximada de la ciudad, no del visitante.';

-- índice para las agregaciones del mapa; parcial, porque el histórico no tiene país
create index if not exists website_visits_org_country_created_idx
  on public.website_visits (organization_id, country, created_at desc)
  where country is not null;
```

Y su reversión en `supabase/rollbacks/`, en el mismo commit, según
`docs/POLITICA-MIGRACIONES.md`.

**2 · El registro de la visita.** En `goadmin-websites/app/api/track-visit/route.ts`, sustituir
`country: null` por lo que la propia petición ya trae. Vercel expone país, región y ciudad en
las cabeceras, así que **no hace falta ningún servicio externo, ninguna clave y ninguna llamada
de red**:

```ts
// x-vercel-ip-* en Vercel; el objeto request.geo expone lo mismo
const h = request.headers;
const country = h.get('x-vercel-ip-country') || null;                      // 'CO'
const region  = h.get('x-vercel-ip-country-region') || null;               // 'ANT'
const city    = h.get('x-vercel-ip-city');                                 // viene percent-encoded
const latitude  = h.get('x-vercel-ip-latitude');
const longitude = h.get('x-vercel-ip-longitude');
// …
country,
region,
city: city ? decodeURIComponent(city) : null,
latitude:  latitude  ? Number(latitude)  : null,
longitude: longitude ? Number(longitude) : null,
```

Tres reglas que no se negocian: la IP **no** se guarda en claro (se mantiene solo el `ip_hash`
actual), la precisión es **de ciudad, nunca de dispositivo**, y en desarrollo las cabeceras no
existen, así que todo cae a `null` sin romper nada.

**3 · Las agregaciones.** Dos RPC nuevas, para no volver a traer filas al navegador:
`get_web_visits_by_country(p_organization_id, p_timezone, p_start, p_end)` y
`get_web_visits_by_city(p_organization_id, p_timezone, p_start, p_end, p_country)`. Ambas
devuelven visitantes (sesiones distintas), sesiones, pedidos, conversión y venta media. La venta
media es la única columna que **sí** respeta la sucursal activa, porque sale de `sales` /
`web_orders`; las visitas son de la tienda, que es única por organización.

**4 · Solo cuenta hacia adelante.** Las 220.626 visitas ya registradas no se pueden
geolocalizar: el `ip_hash` es irreversible, que es justo lo que se quería. Por eso el estado
**«Todavía no tenemos la ubicación de tus visitantes»** no es un caso raro: es lo que verá toda
organización hasta que acumule datos con el cambio puesto. Está dibujado en escritorio y en
móvil, con la explicación y sin prometer un histórico que no va a llegar.

### K.5 Qué se dibuja

Sección «Analítica web (Nuevo)» de la página `03 Navegación y shell`, cinco frames:

| Frame | Qué muestra |
|---|---|
| `Escritorio / Analítica web — listo` | Cabecera con migas, periodo y comparación · 5 indicadores · embudo · evolución · mapa del mundo + tabla por país · mapa de Colombia + tabla por ciudad |
| `Escritorio / Analítica web — sin ubicación (Nuevo)` | Todo funcionando **menos** los mapas, con el estado vacío y el bloque «Qué hace falta» |
| `Escritorio / Analítica web — cargando` | Cabecera y periodo intactos; contenido en `Skeleton` del kit |
| `Móvil / Analítica web — listo` | Indicadores 2×2 · embudo compacto · mapa con conmutador Mundo/Colombia · lista de países · «Ver Colombia por ciudad» |
| `Móvil / Analítica web — sin ubicación (Nuevo)` | El estado vacío en `Layout=compact` |

Las tablas son del kit (`TableCell` + `Pagination`), con columnas **País/Ciudad · Visitantes ·
Sesiones · Conversión · Venta media**, ordenables por cualquier columna y ordenadas por
visitantes de partida. Los mapas son esquemáticos en Figma —la implementación usa un topojson
con las fronteras reales— y llevan la escala de intensidad con la rampa azul de marca.

**Toda la sección va marcada «Nuevo»**: ni la vista, ni los mapas, ni las columnas de
geolocalización existen hoy.

---

# Propuesta

No se trata de dibujar lo mismo más bonito. El inicio hoy hace tres cosas a la vez y ninguna
bien: es un resumen ejecutivo, es un menú de navegación y es la portada de quince dashboards.
La propuesta separa esas tres funciones.

## P0. El diagnóstico en una frase

**El inicio no responde a ninguna pregunta.** Un administrador que entra por la mañana ve once
KPIs que no puede accionar, tres alertas que no puede descartar, una tendencia de 30 días que
ignora el periodo que acaba de elegir y quince secciones plegables que consultan 168 veces la
base de datos para decirle números que también están en cada módulo. Lo único accionable —la
caja abierta, la factura vencida de 42 días, el pedido que expira en 20 minutos— o no está, o
está enterrado.

## P1. Qué debe responder el inicio en los primeros cinco segundos

**Dos paneles, dos preguntas** (decisión del dueño, §A.1):

| Panel | Quién | La pregunta | Lo que tiene que ver sin desplazar |
|---|---|---|---|
| **Completo** | Administrador y gerente (roles 1, 2 y 5, o super admin) | «¿Vamos bien, y hay algo que se esté rompiendo hoy?» | El bloque «Hoy» con lo accionable —caja, cobros vencidos, pedidos web, stock crítico, tareas— y, debajo, la tendencia del periodo y la tienda web. Todo **de la sucursal activa** |
| **Empleado** | Todos los demás | «¿Qué me toca hacer y está marcado mi turno?» | Turno, tareas ordenadas por vencimiento, notificaciones y sus accesos — con **una frase que explique** por qué no ve cifras |

Ninguna de las dos se responde con once KPIs de tamaño idéntico.

**La diferencia entre el dueño y el gerente de una sucursal no es de panel, es de sucursal.**
El mismo panel, con «Todas las sucursales» o con una concreta en el selector del header,
responde a los dos. Por eso no hacen falta tres paneles: hace falta que el selector de sucursal
mande de verdad en todos los bloques, que hoy no lo hace (§H.2).

Dentro del panel completo, lo que sí cambia por perfil es **qué casillas trae el bloque «Hoy»**:
a quien tiene caja asignada le entra la casilla de caja; a quien lleva cartera, la de cobros
vencidos. Eso se resuelve con el mismo mecanismo de personalización de P4, no con un panel
nuevo. Los perfiles de cajero y vendedor que se exploraron están en `99 Descartes`.

## P2. Jerarquía propuesta — tres bloques, en este orden

### Bloque 1 · «Hoy» — lo accionable

Una sola tarjeta con cinco casillas (componente nuevo `TarjetaHoy`, cuatro tonos). Cada casilla
tiene **etiqueta, estado, una cifra, un detalle y exactamente una acción**. El tono sale de la
tabla de `SISTEMA-BADGES.md`, no de un color libre:

| Casilla | Cifra | Acción | Tono |
|---|---|---|---|
| Caja | `$ 1.284.500` / «Cerrada» | `Arquear y cerrar` / `Abrir caja` | éxito / neutro |
| Por cobrar vencido | importe + nº de facturas + días de la más vieja | `Cobrar` | peligro |
| Pedidos web pendientes | nº + cuántos expiran en 30 min | `Atender` | advertencia |
| Stock crítico | nº de productos bajo mínimo **en esta sucursal** | `Reponer` | peligro |
| Mis tareas | nº abiertas + cuántas vencen hoy | `Abrir` | advertencia / neutro |

Reglas duras del bloque:

- **Nunca un callejón sin salida.** Si no hay nada urgente, el tono es neutro y la acción abre
  el listado («Al día · Ver cartera»). No se muestra un cero mudo.
- **Los umbrales llevan moneda.** El «alta» de cartera no puede ser `> 1000` (D.1): se define
  como porcentaje del saldo total o como un valor configurable por organización.
- **Cinco casillas como máximo.** Si la organización tiene más módulos, el orden lo decide la
  urgencia, no el catálogo.
- En una organización nueva, el bloque «Hoy» **es** el onboarding: los siete pasos con su
  progreso, en el mismo sitio. La franja aparte desaparece.

### Bloque 2 · Tendencia del periodo, actividad y tienda web

Dos tarjetas a la misma altura, y debajo la de tienda web:

- **«Ventas del periodo»** — la gráfica **respeta el `PeriodoSelector`**. Se acaba el `dias=30`
  cableado y el título que dice una cosa mientras el estado vacío dice otra. Lleva la moneda
  en el subtítulo y la comparación con el periodo anterior como línea discontinua.
- **«Actividad reciente»** — filtrada por la sucursal activa y por el periodo, con **filas
  clicables** al registro, estados traducidos (nada de «Venta pending») y la **paginación única
  del kit** en su variante `compact`.

Y, a todo el ancho, **«Tienda web»**: tres casillas con el número, la variación y una miniatura
**real** —visitantes del periodo, pedidos web y conversión—, el badge de visitantes en línea
ahora, y el enlace `Ver analítica web`. El detalle ya no es un diálogo: es una vista propia con
su periodo, su embudo y sus mapas (§K). Esta tarjeta solo aparece si el módulo de comercio web
está activo; hoy las tres consultas se lanzan haya tienda o no.

### Bloque 3 · Módulos, plegados por defecto

Quince secciones expandidas es un índice, no un dashboard. Se sustituyen por una lista de
**filas de módulo** (componente nuevo `FilaModulo`) de 56 px: icono, nombre, badge de alertas y
**un resumen de una línea** con los dos o tres números que el módulo considera suyos. Se
despliega el que interese.

- Exportar CSV y PDF **se mueven al menú «⋯»** de la fila. Treinta botones deshabilitados
  permanentemente en la pantalla de entrada no son un control, son ruido.
- **El `BranchBadge` se pinta una sola vez**, en el `PageHeader`, y en el sólido de marca, no
  en fucsia (`SISTEMA-BADGES.md` §6). Se eliminan los 15 de `ModuloSection`.
- **Plegar deja de consultar.** Hoy no es así (F.1.2); esa es la diferencia entre un tope de
  consultas y una promesa.

## P3. Lo que se quita, y por qué

| Se quita | Por qué |
|---|---|
| **Cinco de las once tarjetas de KPI** (`Clientes`, `Productos`, `Miembros`, `Reservas`, `Facturas Hoy`) | Son conteos de catálogo o de módulo, no indicadores del día. Su sitio es la fila de su módulo. Liberan 5 consultas de conteo y 10 de serie mensual. **Las tres de comercio web NO se quitan**: se agrupan en la tarjeta «Tienda web» (§K.2) |
| **El diálogo de detalle para los KPI de la tienda** | Cuesta 41 consultas, monta un segundo temporizador y no tiene sitio para el embudo ni los mapas. Se sustituye por la vista de analítica web (§K.1) |
| **El sparkline sintético** (`generateSparklineData`) | Es una curva inventada presentada como dato. Las miniaturas de la tarjeta «Tienda web» son series reales |
| **Los 15 `BranchBadge` de las secciones** | Patrón 9: uno por pantalla, en la cabecera |
| **Los 30 botones CSV/PDF siempre deshabilitados** | Patrón 6.6 |
| **La franja de onboarding independiente** | Se funde con el bloque «Hoy» |
| **`WebCommerceObservability` del inicio** | Es una herramienta de diagnóstico de un módulo; su sitio es `/app/pos/pedidos-online`. Y su endpoint necesita una corrección de seguridad antes que un rediseño (D.6) |
| **Los tres KPI de comercio web como tarjetas sueltas** | No desaparecen: se juntan en una sola tarjeta. Tres tarjetas de tamaño KPI para un módulo que muchas organizaciones no tienen desequilibraban la rejilla |
| **La barra de navegación de 15 anclas** | Con los módulos plegados, la lista **es** el índice |
| **El toggle «Compacto / Expandido»** | Con todo plegado por defecto y el orden personalizable, sobra un segundo eje de configuración |
| **`LiveVisitorsBadge`** (código muerto) y los `console.error` silenciosos | Ver E.4 |

## P4. Personalización — qué se puede mover y qué no

Diálogo **«Personalizar el inicio»** (marcado «Nuevo»), abierto desde el `PageHeader`.

**Se puede:** reordenar los bloques 2 y 3, ocultar módulos, ocultar «Tendencia» o «Actividad».
**No se puede:** ocultar «Hoy» (es el motivo de la pantalla) ni cambiar el orden interno de las
cinco casillas (lo fija la urgencia, no el gusto). Ocultar un módulo **deja de consultarlo**, y
el diálogo lo dice con esas palabras. Ocultar no es un permiso: el texto lo aclara.

**Lo que haría falta en la base de datos** — aditivo, sin `DROP` ni cambios de tipo:

```sql
-- migración aditiva; columnas con DEFAULT, sin tocar datos existentes
create table if not exists user_dashboard_preferences (
  id              bigserial primary key,
  organization_id integer not null references organizations(id) on delete cascade,
  user_id         uuid    not null references auth.users(id)    on delete cascade,
  layout          jsonb   not null default '{}'::jsonb,  -- orden y visibilidad por bloque
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);
```

Con RLS por pertenencia y `user_id = (select auth.uid())` —en `IN (SELECT … JOIN)`, no en
`EXISTS` anidado, por lo aprendido al quitar los `qual=true`—. Hoy solo se guardan en
`localStorage` el modo compacto (`DashboardModulos.tsx:275`) y el colapso por módulo
(`ModuloSection.tsx:89`): no viajan entre dispositivos, no distinguen organización y no guardan
orden. El descarte del onboarding (`OnboardingBanner.tsx:40`) tiene el mismo problema y se
migra a esta tabla.

## P5. Rendimiento — un tope de consultas por carga

**Objetivo: 12 consultas en la primera carga, frente a las ≈221 de hoy.**

1. **Una RPC para el bloque «Hoy»** — `get_home_today(p_organization_id, p_branch_id, p_timezone)`
   devuelve las cinco casillas en una fila. Hoy esos cinco números cuestan 5 consultas sueltas
   más las 3 de alertas.
2. **Una RPC para la tendencia** con el periodo y la sucursal como parámetros, sustituyendo
   `getTendenciaVentas` y su descarga de filas crudas.
3. **Una RPC por fila de módulo** — `get_module_summary(code, org, branch, periodo)` devuelve
   los dos o tres números del resumen. Nada más se consulta hasta que alguien despliega.
4. **Al desplegar un módulo se consulta ese módulo, y solo ese.** Los `useEffect` bajan del
   componente de sección al contenido desplegado.
5. **Se arregla o se retira `useDashboardRealtime`.** Dos opciones honestas: (a) suscribirse
   tabla por tabla a las que **sí** están publicadas y **publicar** `sales`, `invoice_sales` y
   `accounts_receivable` si se quiere tiempo real de verdad; (b) quedarse con el refresco
   periódico, pero **a 120 s, con `visibilitychange`** y recargando solo el bloque «Hoy», no las
   41 consultas.
6. **El diálogo de KPI no vuelve a cargar el dashboard entero.** Consulta lo suyo, una vez, y
   no instala un segundo intervalo (C.2).
7. **Esqueletos que se parecen a su contenido.** `LazySection` pinta hoy el mismo bloque de
   «4 tarjetas + gráfica» para todo, con `minHeight: 60` en modo compacto: el placeholder es
   más alto que el contenido y provoca salto de maquetación.
8. **El `PageHeader` y el selector de periodo se mantienen durante la carga** (patrón 4);
   solo el contenido va en `Skeleton`.

## P6. Móvil — qué se ve primero y qué se pliega

Orden fijo en 390 px: **saludo + sucursal + periodo → «Hoy» → tendencia del día → módulos
plegados**.

- «Hoy» muestra **las tres casillas más urgentes** y un enlace `Ver las 5 · stock crítico y
  tareas`. Cinco tarjetas apiladas son 700 px de scroll antes de la primera decisión.
- El `PeriodoSelector` de siete segmentos **se convierte en un `Select`**. Hoy en móvil se
  ocultan las etiquetas (`PeriodoSelector.tsx:121`, `hidden sm:inline`) y quedan siete iconos
  sin texto accesible ni `aria-label`.
- La fila de módulo **no muestra el resumen** (no cabe): icono, nombre, badge y chevron. No se
  trunca: se oculta.
- El detalle de KPI es una **hoja a pantalla parcial**, no un diálogo.
- La tendencia se reduce al día, con una sola línea y el delta como badge.

## P7. Correcciones que el diseño da por hechas

El rediseño no calca lo roto (regla I.4.4 del brief de fidelidad). Estas quedan asumidas en los
frames y hay que hacerlas en código:

1. Zona horaria de la organización en el saludo, en el tiempo relativo, en `due_date` y en las
   ≈17 ocurrencias de `toISOString().split('T')[0]` (I.1).
2. Moneda de la organización en todas las cifras, con `useOrgCurrency()` como en
   `SellerSection`; y **nunca sumar monedas distintas** (I.2).
3. Estados traducidos en la actividad reciente (D.2).
4. Las siete rutas rotas (F.3).
5. Los seis controles que no hacen nada (I.3).
6. El `BranchBadge` al sólido de marca (`SISTEMA-BADGES.md` §6).
7. El `Pronóstico del Mes` del CRM, inflado ×100 (F.3).
8. `getAlertas`, `getTendenciaVentas` y las siete secciones que ignoran la sucursal (H.2).
9. La contradicción de «Clientes»: o es de ámbito organización —y se quita el filtro de
   sucursal del KPI y de la RPC— o se documenta la excepción en `PATRONES-TRANSVERSALES.md`.
10. El endpoint `/api/web-orders/observability` (D.6) — **es la única que no puede esperar al
    rediseño**.

## P8. Qué es «Nuevo» y qué ya existe

**Nuevo** (no existe en el código, va marcado en Figma):

- El bloque «Hoy» completo y el componente `TarjetaHoy`.
- `FilaModulo` con resumen de una línea y menú «⋯».
- El diálogo «Personalizar el inicio» y la tabla `user_dashboard_preferences`.
- La frase que explica al empleado por qué no ve cifras (la traducción existe, el control no).
- El botón «Reordenar y ocultar» del bloque de módulos.
- **Toda la vista de analítica web** (§K): la vista en sí, el embudo, los dos mapas, las dos
  tablas ordenables, el estado «sin ubicación» y las columnas `city`, `region`, `latitude` y
  `longitude` de `website_visits`.

**Ya existe y se conserva:** el selector de periodo con sus siete opciones y el filtro de horas,
la actividad reciente con sus filtros, la tendencia de ventas, el onboarding de siete pasos, los
atajos, el badge de visitantes en línea, los tres indicadores de comercio web (reagrupados), el
panel de empleado con turno/tareas/notificaciones y los cuatro widgets de vendedor —que siguen
sin cablear, ver §A.2—.

**Explorado y descartado** (en `99 Descartes`): los paneles de cajero y de vendedor como
perfiles propios. El dueño cerró que son dos paneles.

---

## Dudas abiertas para el dueño

1. **De dónde sale la frontera entre los dos paneles** (§A.4). Hoy sale de una lista de tres
   `role_id` cableada en un archivo del CRM. ¿Rol, cargo (`job_position_id`) o ajuste por
   miembro? **Recomendación: cargo**, con la lista de roles como puente y movida fuera de
   `stagePermissions.ts`.
2. **Geolocalización: ¿se aprueba el cambio?** Es una migración aditiva de cuatro columnas más
   ocho líneas en `track-visit/route.ts` (§K.4). Sin ella el mapa no existe, y las 220.626
   visitas ya guardadas no se pueden recuperar: solo cuenta hacia adelante.
3. **«Clientes» y la sucursal.** Hoy el KPI filtra por `branch_id` y las 35.028 filas de
   `customers` lo tienen relleno, mientras `PATRONES-TRANSVERSALES.md` §9 dice que clientes es
   de ámbito organización. ¿Se quita el filtro del KPI (y de `get_customers_by_day`) o se
   documenta la excepción?
4. **Tiempo real de verdad o refresco honesto.** Publicar `sales`, `invoice_sales` y
   `accounts_receivable` en `supabase_realtime` tiene coste. ¿Se publican —y el bloque «Hoy» se
   actualiza solo— o se acepta un refresco cada 120 s con aviso de «actualizado hace N min»?
5. **Umbral de «alerta alta» en cartera.** ¿Porcentaje del saldo total, importe configurable
   por organización, o días de mora? Hoy es `> 1000` sin moneda, lo que hace que todas las
   organizaciones estén siempre en rojo.

Cerradas en esta ronda: **son dos paneles**, no cuatro (§A.1), y **los indicadores de comercio
web se conservan**, reagrupados en una tarjeta con su vista de detalle propia (§K).
