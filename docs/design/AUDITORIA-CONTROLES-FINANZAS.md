# Auditoría control por control — módulo Finanzas

Insumo para que el diseñador **calque la realidad** en Figma («GO Admin — Sistema de diseño»,
`EAvjINVRnlzFM70GVoWXgl`). Hermano de `docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md`:
mismo formato, misma leyenda, misma regla de «etiqueta exacta». Aquí va **cada control**
—botón, menú, pestaña, campo, toggle, chip, badge, tabla, diálogo, tooltip, atajo, estado—
de las 64 rutas de `/app/finanzas`, con su etiqueta exacta, lo que hace, cuándo aparece y
`archivo:línea`.

Fecha: 2026-09-22. Solo lectura de código; esquema, triggers, constraints, RLS y buckets
verificados por el MCP de Supabase (`jgmgphmzusbluqhuqihj`, solo `SELECT`). Sin nombres de
organizaciones cliente. Rutas relativas a `src/` salvo que se indique.

Leyenda de **Tipo**: botón · menú (trigger o ítem) · pestaña · campo · toggle (switch/checkbox/
segmento) · chip (píldora clicable) · badge (solo lectura) · tabla · columna · diálogo · tooltip ·
atajo · estado (vacío/cargando/error/aviso) · texto · stat (KPI) · paginación · toast ·
exportación · cálculo (regla sin control visible). **Etiqueta exacta** es el literal del código
con su acentuación (o su falta). **Finanzas no usa `messages/es.json` en absoluto**: 0 de sus 174
componentes llama a `useTranslations`; todos los textos están cableados en español. La única
excepción es el marco del dashboard (`home.section.*`), que sí está traducido.
**Cuándo aparece**: «Siempre» = incondicional dentro de su pantalla; breakpoints Tailwind
(`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280).

Índice: **A.** Dashboard de Finanzas (9 bloques) · **B.** Facturación (16 pantallas) · **C.** Cartera y
pagos (15) · **D.** Bancos (13) · **E.** Contabilidad (14 + la duplicidad de periodos) ·
**F.** Navegación, impuestos, monedas y reportes (4) · **G.** Impuestos: ampliación de la sección E
de la auditoría de productos/POS · **H.** Lo roto o sin efecto · **I.** Esquema real en la base de
datos · **J.** Patrones repetidos y componentes comunes · **K.** Conteo de controles por pantalla ·
**L.** Recomendación de rediseño.

Las 64 rutas están cubiertas. Las secciones B, C, D y E van pantalla por pantalla; F reúne la
navegación del módulo y las tres pantallas de configuración; G, H, I, J, K y L son transversales.

---

## A. Dashboard de Finanzas

### A.0 `/app/finanzas` ya no es una pantalla — `app/app/finanzas/page.tsx`

La ruta raíz del módulo es un **redirector de 11 líneas**. El dashboard de Finanzas se consolidó
en `/app/inicio#finance`.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | cálculo | — | `<ModuleRootRedirect moduleCode="finance" />`: resuelve la primera página activa del módulo para la organización y hace `router.replace` | Al entrar a `/app/finanzas` | `app/app/finanzas/page.tsx:10` |
| 2 | estado | `PageHeaderSkeleton` | Esqueleto mientras se resuelve el destino | Siempre (es lo único que se renderiza) | `components/inicio/ModuleRootRedirect.tsx:73-77` |
| 3 | estado | «No se pudo redirigir a la página del módulo.» | Pantalla completa de error | Si falla `resolveModuleRootRedirect` y no hay fallback estático | ModuleRootRedirect.tsx:63-70 |
| 4 | cálculo | — | Sin organización en sesión → `getStaticFirstPageHref('finance')` o `/app/inicio` | `organizationId` 0 o nulo | ModuleRootRedirect.tsx:34-38 |

**Para el diseño**: no dibujes una portada de Finanzas. El «home» del módulo es la sección
`#finance` de `/app/inicio`, y el menú lateral es la navegación real.

### A.1 Marco de la sección — `components/inicio/ModuloSection.tsx` (compartido por los 15 módulos)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | «Finanzas» (icono `Banknote`, chevron) | Colapsa/expande toda la sección (`aria-expanded`) | Siempre | ModuloSection.tsx:167-187 · `sections/FinanzasSection.tsx:199-200` |
| 2 | botón | «CSV» (icono `FileSpreadsheet`, outline sm) | Exporta KPIs + top clientes/proveedores a CSV | Siempre; `disabled` si no hay `exportData` o hay otra exportación en curso | ModuloSection.tsx:191-201 |
| 3 | botón | «PDF» (icono `FileText`, outline sm) | Exporta lo mismo a PDF con cabecera de la organización | Ídem | ModuloSection.tsx:202-212 |
| 4 | pestaña | «Dashboard» (`home.section.dashboard`) | Vista de KPIs y gráficos | Siempre (`hasReportes`) | ModuloSection.tsx:219-232 · `messages/es.json:351` |
| 5 | pestaña | «Reportes» (`home.section.reports`) | Monta `ReportesPage` de Finanzas embebido | Siempre | ModuloSection.tsx:233-246 · FinanzasSection.tsx:207 |
| 6 | pestaña | «Métricas» (`home.section.metrics`) | — | **Nunca en Finanzas** (`metricasContent` no se pasa) | ModuloSection.tsx:247-261 |
| 7 | toast | «CSV exportado» / «No se pudo generar el CSV» | Resultado de #2 | — | `messages/es.json:346-347` |
| 8 | toast | «PDF exportado» / «No se pudo generar el PDF» | Resultado de #3 | — | `messages/es.json:348-349` |
| 9 | texto | «Sin datos» / «No hay datos para exportar en esta sección» | Exportación vacía | — | `messages/es.json:343-344` |
| 10 | cálculo | — | La sección solo se monta si `finance` está en los módulos activos de la organización (`organization_modules`) | — | `components/inicio/DashboardModulos.tsx:63, 295-297, 349-351` |
| 11 | estado | «…» + enlace «…» a `/app/organizacion/modulos` | Sin módulos activos | Si `modulosVisibles.length === 0` | DashboardModulos.tsx:299-310 |
| 12 | toggle | Modo compacto / expandido (iconos `LayoutGrid` / `Rows3`) | Guarda `dashboard:modoCompacto` en `localStorage` | Cabecera de `/app/inicio` | DashboardModulos.tsx:325-345 |

### A.2 Carga de datos — `components/inicio/sections/FinanzasSection.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | cálculo | — | Período **fijo**: últimos 30 días (`getDefaultFilters()`), etiqueta interna «Últimos 30 días». **No hay selector de fechas visible** | Siempre | FinanzasSection.tsx:38-54, 115 |
| 2 | cálculo | — | 8 consultas en paralelo: KPIs, top clientes, top proveedores, ventas vs compras, aging, flujo, alertas y datos de la organización | Al montar y al cambiar de sucursal | FinanzasSection.tsx:129-151 |
| 3 | cálculo | — | Respeta el filtro global de sucursal (`useBranch().branchFilter`) y la zona horaria de la organización (`useOrgTimezone()`) | Siempre | FinanzasSection.tsx:102-103, 139-145 |
| 4 | toast | «Error» / «No se pudo cargar el dashboard de finanzas» | Fallo de cualquiera de las 8 consultas | — | FinanzasSection.tsx:178 |
| 5 | cálculo | — | Moneda **cableada** `CURRENCY_CODE = 'COP'` para los 6 componentes | Siempre | FinanzasSection.tsx:36, 210-225 |
| 6 | exportación | Columnas «Tipo» · «Nombre» · «Monto» (alineado a la derecha); 8 KPIs | Contenido de CSV/PDF | — | FinanzasSection.tsx:64-98 |

### A.3 KPIs — `components/finanzas/dashboard/KPICards.tsx`

Rejilla 1 / `sm:`2 / `lg:`4 columnas (l.186). Cada tarjeta: título, importe, línea de tendencia e icono en cuadro de color.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | stat | «Ingresos» (verde, `TrendingUp`) + «Ventas del período» | `invoice_sales` con `status in (paid, partial)` y `sale_id is null` + ventas POS + `web_orders` del rango | Siempre | KPICards.tsx:125-132 · `FinanzasDashboardService.ts:122-165` |
| 2 | stat | «Egresos» (rojo, `TrendingDown`) + «Compras del período» | `invoice_purchase` del rango | Siempre | KPICards.tsx:133-140 · Service:167-180 |
| 3 | stat | «Utilidad Bruta» (azul si ≥0, rojo si no) + «Positivo» / «Negativo» | `ingresos - egresos` | Siempre | KPICards.tsx:141-148 · Service:257 |
| 4 | stat | «Cartera Vencida» (amarillo si >0, verde si 0, `AlertTriangle`) + «Requiere atención» / «Sin vencidos» | `accounts_receivable` vencidas con `balance > 0` | Siempre | KPICards.tsx:149-156 · Service:182-190 |
| 5 | stat | «Caja» (morado, `Wallet`) | Sesiones de caja **abiertas**: `initial_amount` + entradas − salidas de `cash_movements` | Siempre; sin tendencia | KPICards.tsx:157-162 · Service:192-222 |
| 6 | stat | «Bancos» (azul, `Building2`) | Suma de `bank_accounts.balance` activas | Siempre; sin tendencia | KPICards.tsx:163-168 · Service:224-233 |
| 7 | stat | «Cuentas por Cobrar» (naranja, `Users`) + «Total pendiente» | `accounts_receivable.balance > 0` | Siempre | KPICards.tsx:169-175 · Service:235-244 |
| 8 | stat | «Cuentas por Pagar» (rojo, `Truck`) + «Total pendiente» | `accounts_payable.balance > 0` | Siempre | KPICards.tsx:176-182 · Service:246-255 |
| 9 | estado | Esqueleto por tarjeta (barra 4×24 + 7×32 + cuadro del icono) | Cargando | `isLoading` | KPICards.tsx:72-88 |
| 10 | — | **No hay** estado de error ni vacío propio: sin datos las 8 tarjetas muestran `$0` (`emptyKPIs`) | — | — | FinanzasSection.tsx:233-242 |

**Trampa de diseño**: las tarjetas 1-4 llevan una línea de tendencia con flecha, pero el texto es
**fijo** («Ventas del período», «Compras del período»…), no un porcentaje contra el período
anterior. No dibujes «+12 % vs. mes pasado»: ese dato no existe.

### A.4 Ventas vs Compras — `components/finanzas/dashboard/VentasComprasChart.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Ventas vs Compras» | Título de la tarjeta | Siempre | VentasComprasChart.tsx:37, 52, 125 |
| 2 | badge | «Ventas» (punto azul `#3b82f6`) · «Compras» (punto rojo `#ef4444`) | Leyenda manual (no `<Legend>` de Recharts) | Siempre | VentasComprasChart.tsx:128-136 |
| 3 | cálculo | — | Granularidad automática: rango ≤31 días → barras por **día**; mayor → por **mes** | Siempre | VentasComprasChart.tsx:69-77 · Service:363-469 |
| 4 | tabla | Ejes `label` (rotado −35° en modo día) y valor | Gráfico de barras o área según granularidad | Siempre | VentasComprasChart.tsx:145-200 |
| 5 | stat | «Total Ventas» (azul) · «Total Compras» (rojo) | Pie de la tarjeta, 2 columnas | Siempre | VentasComprasChart.tsx:204-220 |
| 6 | estado | «No hay datos disponibles para el período seleccionado» | Vacío (h-64 centrado) | `data.length === 0` | VentasComprasChart.tsx:57 |
| 7 | estado | `Skeleton h-64` | Cargando | `isLoading` | VentasComprasChart.tsx:36-45 |
| 8 | tooltip | Tooltip propio (`CustomTooltip`) | Hover sobre una barra | — | VentasComprasChart.tsx:197 |

### A.5 Antigüedad de cartera — `components/finanzas/dashboard/AgingChart.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Antigüedad de Cartera (CxC)» | Título | Siempre | AgingChart.tsx:30, 47, 64 |
| 2 | texto | «Total: {importe}» | Total de la cartera, a la derecha del título | Con datos | AgingChart.tsx:67 |
| 3 | tabla | Barra apilada horizontal de 5 tramos | Anchura proporcional al monto | Con datos | AgingChart.tsx:75-90 |
| 4 | tooltip | `title="{rango}: {importe} ({porcentaje}%)"` — tooltip **nativo del navegador** | Hover sobre un tramo | Con datos | AgingChart.tsx:84 |
| 5 | badge | «Vigente» (verde) · «1-30 días» (amarillo) · «31-60 días» (naranja) · «61-90 días» (rojo) · «+90 días» (rojo oscuro) | Leyenda con cuadro de color, porcentaje y monto | Con datos | AgingChart.tsx:94-110 · Service:489-522 |
| 6 | estado | «No hay cuentas por cobrar pendientes» | Vacío | `data.length === 0` | AgingChart.tsx:52 |
| 7 | estado | `Skeleton h-64` | Cargando | `isLoading` | AgingChart.tsx:29-35 |
| 8 | — | **Los tramos no son clicables**: no llevan a `/app/finanzas/cuentas-por-cobrar` filtrado | — | — | — |

### A.6 Flujo de caja proyectado — `components/finanzas/dashboard/FlujoProyectadoChart.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Flujo de Caja Proyectado (6 meses)» | Título (en cargando y vacío dice solo «Flujo de Caja Proyectado») | Siempre | FlujoProyectadoChart.tsx:115 · 37, 52 |
| 2 | toggle | Segmento «Gráfico» / «Tabla» | Cambia la vista; por defecto «Gráfico» | Siempre | FlujoProyectadoChart.tsx:119-144, 30 |
| 3 | badge | «Ingresos» · «Egresos» · «Saldo» (puntos de color) | Leyenda manual | Siempre | FlujoProyectadoChart.tsx:146-157 |
| 4 | tabla | `ComposedChart`: barras Ingresos/Egresos + área Saldo + línea Acumulado | Vista «Gráfico» | `view === 'grafico'` | FlujoProyectadoChart.tsx:162-230 |
| 5 | columna | «Mes» · «Ingresos» · «Egresos» · «Saldo» · «Acumulado» · «Tendencia» | Tabla de 6 columnas | Vista «Tabla» | FlujoProyectadoChart.tsx:234-239 |
| 6 | badge | Flecha ↑ verde / ↓ roja / `Minus` gris | Columna «Tendencia» según el signo del saldo | Por fila | FlujoProyectadoChart.tsx:244, 272-275 |
| 7 | tooltip | «Ingresos:» · «Egresos:» · «Saldo:» · «Acumulado:» | Tooltip propio del gráfico | Hover | FlujoProyectadoChart.tsx:83-102 |
| 8 | estado | «No hay datos de flujo proyectado» | Vacío | `data.length === 0` | FlujoProyectadoChart.tsx:57 |
| 9 | cálculo | — | 6 meses a futuro desde `invoice_sales`, `invoice_purchase`, `ar_installments` y `ap_installments` | — | Service:525-624 |

### A.7 Top clientes y proveedores — `components/finanzas/dashboard/TopClientesProveedores.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Top Clientes y Proveedores» | Título de la tarjeta | Siempre | TopClientesProveedores.tsx:108 |
| 2 | texto | «Top 5 Clientes» (azul, icono `Users`) | Lista izquierda; `md:` 2 columnas | Siempre | TopClientesProveedores.tsx:114 |
| 3 | texto | «Top 5 Proveedores» (naranja, icono `Truck`) | Lista derecha | Siempre | TopClientesProveedores.tsx:122 |
| 4 | badge | Corona `Crown` amarilla | Marca el primer puesto de cada lista | `index === 0` | TopClientesProveedores.tsx:77-79 |
| 5 | tabla | Nombre + importe + barra de progreso proporcional al máximo | Por fila | — | TopClientesProveedores.tsx:75-93 |
| 6 | estado | «Sin datos en el período» | Vacío, por lista | `items.length === 0` | TopClientesProveedores.tsx:66 |
| 7 | — | **Las filas no son clicables**: no llevan a la ficha del cliente ni del proveedor | — | — | — |

### A.8 Alertas — `components/finanzas/dashboard/AlertasCard.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Alertas y Notificaciones» (icono `Bell` azul) | Título | Siempre | AlertasCard.tsx:56, 79 |
| 2 | badge | «{n} alerta» / «{n} alertas» (azul) | Contador junto al título | `alertas.length > 0` | AlertasCard.tsx:82-84 |
| 3 | badge | «alta» (rojo) · «media» (amarillo) · «baja» (azul) — borde izquierdo del mismo color | Prioridad, en minúsculas y sin traducir | Por alerta | AlertasCard.tsx:33-47, 128-130 |
| 4 | texto | «Factura por vencer» + «{cliente} - Vence: {fecha}» | Vencimientos de los próximos 7 días (máx. 5), prioridad media | Si los hay | Service:646-658 |
| 5 | texto | «Cartera vencida (+30 días)» + «{n} facturas vencidas por ${total}» | Prioridad alta | Si hay vencidas +30 días | Service:672-683 |
| 6 | texto | «Resolución {prefijo} casi agotada» + «Usados {n} de {m} ({p}%)» | Consecutivo DIAN al ≥80 % | Si aplica | Service:698-705 |
| 7 | texto | «Resolución {prefijo} por vencer» + «Vence en {n} días ({fecha})» | Resolución próxima a caducar | Si aplica | Service:709-716 |
| 8 | botón | Icono `ChevronRight` (ghost, 32×32) | `Link` al `enlace` de la alerta | Si la alerta trae `enlace` | AlertasCard.tsx:136-141 |
| 9 | botón | «Ver {n} alertas más» (link azul) | **No hace nada**: no tiene `onClick` ni `href` | Si hay más de `maxItems` (5) | AlertasCard.tsx:148-153 |
| 10 | estado | «No hay alertas pendientes» (icono `CheckCircle`) | Vacío | `alertas.length === 0` | AlertasCard.tsx:89-93 |
| 11 | — | Los tipos `conciliacion` y `saldo_bajo` están en el `iconMap` pero **el servicio nunca los genera** | — | — | AlertasCard.tsx:26-32 · Service:46 |

---

## B. Facturación

### B.1 Facturas de venta (lista) `/app/finanzas/facturas-venta` — `components/finanzas/facturas-venta/FacturasVentaPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft, sin texto) | `Link href="/app/finanzas"` | Siempre | `components/finanzas/facturas-venta/PageHeader.tsx:44-48` |
| 2 | texto | «Facturas de Venta» (h1, FileText en cuadro azul) | Título | Siempre | PageHeader.tsx:50-55 |
| 3 | texto | «Finanzas / Facturas de Venta» | Migaja estática (no son enlaces) | Siempre | PageHeader.tsx:56-58 |
| 4 | botón | «Exportar» (icono Download, outline) | **Nada: no tiene `onClick`** | Siempre | PageHeader.tsx:64-78 |
| 5 | botón | «Importar CSV» (icono Upload; texto oculto en móvil) | Abre el diálogo de importación | Siempre | PageHeader.tsx:79-94 |
| 6 | botón | «Nueva Factura» (icono Plus, azul) | Valida la organización y navega a `/nuevo` | Siempre | PageHeader.tsx:21-38, 95-109 |
| 7 | toast | «Error» / «No se pudo determinar la organización activa. Por favor, seleccione una organización.» | Sin organización al pulsar #6 | — | PageHeader.tsx:25-27 |
| 8 | toast | «Error» / «Ocurrió un error al intentar crear una nueva factura. Por favor, inténtelo de nuevo.» | Excepción en #6 | — | PageHeader.tsx:34-36 |
| 9 | badge | Sucursal activa (`BranchBadge`) | Informativo | Siempre | FacturasVentaPage.tsx:30 |
| 10 | stat | «Facturas Próximas a Vencer» | Widget de vencimientos a **15 días** | Siempre | `FacturasProximasVencer.tsx:146-148` · FacturasVentaPage.tsx:33 |
| 11 | texto | «Facturas que vencerán en los próximos {15} días» | Descripción | Siempre | FacturasProximasVencer.tsx:149-151 |
| 12 | badge | «{n} factura» / «{n} facturas» (gris) | Conteo | Si hay ≥1 | FacturasProximasVencer.tsx:153-157 |
| 13 | estado | `CardListSkeleton cards={3}` | Carga | `isLoading` | FacturasProximasVencer.tsx:161-162 |
| 14 | estado | Caja roja con el mensaje de error | Error de consulta | `error` | FacturasProximasVencer.tsx:163-166 |
| 15 | estado | «No hay facturas próximas a vencer en los siguientes {15} días.» (icono Clock) | Vacío | Sin resultados | FacturasProximasVencer.tsx:167-171 |
| 16 | texto | Número / cliente / «Vence: {d de MMM, yyyy}» | Fila del widget | Por fila | FacturasProximasVencer.tsx:190-198 |
| 17 | texto | Saldo con `es-CO`/**COP fijo** y sin decimales | Importe pendiente | Por fila | FacturasProximasVencer.tsx:204-209 |
| 18 | badge | «Vence hoy» / «{n} día» / «{n} días» | ≤3 d rojo, ≤7 d ámbar, resto azul (AlertTriangle / Clock / CheckCircle) | Por fila | FacturasProximasVencer.tsx:128-139, 212-220 |
| 19 | botón | «Ver» (ghost azul) | `Link` al detalle | Por fila | FacturasProximasVencer.tsx:221-232 |
| 20 | campo | Placeholder «Buscar por número, cliente o referencia...» (Search) | **Solo filtra número y cliente: la referencia no** | Siempre | `FacturasFiltros.tsx:112-124` · `FacturasTable.tsx:125-130` |
| 21 | botón | «Filtros» (icono Filter; `secondary` cuando está abierto) | Abre/cierra el panel avanzado | Siempre | FacturasFiltros.tsx:132-155 |
| 22 | badge | Contador de filtros activos (círculo azul) | Nº de filtros | Si >0 | FacturasFiltros.tsx:147-154 |
| 23 | tooltip | «{n} filtros aplicados» / «Sin filtros aplicados» | Sobre #21 | Hover | FacturasFiltros.tsx:157-159 |
| 24 | campo | Select «Estado»: «Todos los estados» · «Borrador» · «Emitida» · «Pagada» · «Pago parcial» · «Anulada» · «Vencida» | Filtra `status` | Siempre | FacturasFiltros.tsx:163-184 |
| 25 | campo | Select «Estado de factura» (Tag) — **mismas 7 opciones que #24: control duplicado** | Idéntico a #24 | Panel abierto | FacturasFiltros.tsx:194-216 |
| 26 | campo | Select «Método de pago» (CreditCard): «Todos los métodos de pago» · «Efectivo» · «Transferencia bancaria» · «Tarjeta crédito/débito» · «Cheque» · «Crédito» · «Stripe» · «PayPal» · «MercadoPago» | Filtra `payment_method` | Panel abierto | FacturasFiltros.tsx:218-242 |
| 27 | campo | «Periodo de emisión» → «Desde» / «Hasta» (dos `DatePicker`) | Filtra `issue_date` | Panel abierto | FacturasFiltros.tsx:246-286 |
| 28 | campo | «Cliente» (placeholder «ID o nombre del cliente») | **Solo filtra por nombre: el ID se ignora** | Panel abierto | FacturasFiltros.tsx:288-305 · FacturasTable.tsx:158-163 |
| 29 | campo | «Rango de monto» (placeholders «Mínimo» / «Máximo») | Filtra `total` | Panel abierto | FacturasFiltros.tsx:309-345 |
| 30 | botón | «Limpiar filtros» (icono X, outline) | Resetea todo | Panel abierto | FacturasFiltros.tsx:348-362 |
| 31 | botón | «Aplicar ordenamiento» (ArrowDownUp, azul) | **No ordena nada**: reenvía los mismos filtros | Panel abierto | FacturasFiltros.tsx:364-384 |
| 32 | texto | «Mostrando {n} de {m} facturas» | Contador sobre la tabla | Siempre | FacturasTable.tsx:466-468 |
| 33 | paginación | «Mostrar» [5/10/20/50/100] «filas» | Tamaño de página (10 por defecto) | Siempre | FacturasTable.tsx:469-487, 117 |
| 34 | columna | (sin título, w-8/12) → ChevronRight/ChevronDown | Expande la fila | Siempre | FacturasTable.tsx:495, 522-539 |
| 35 | columna | «#» | Índice global | Siempre | FacturasTable.tsx:496, 540-542 |
| 36 | columna | «Número» | `CopyableId` (copiar + click al detalle) | Siempre | FacturasTable.tsx:497, 543-550 |
| 37 | columna | «Cliente» | Fallback «Cliente sin nombre» / «Cliente #{uuid}» | Siempre | FacturasTable.tsx:498, 350-360, 551 |
| 38 | columna | «Emitida» · «Vencimiento» | `dd/mm/aaaa` | Siempre | FacturasTable.tsx:499-500, 552-553 |
| 39 | columna | «Total» · «Saldo» (derecha) | `formatCurrency(..., currency)` | Siempre | FacturasTable.tsx:501-502, 554-559 |
| 40 | columna | «Método» | Nombre desde `payment_methods`; fallback «No especificado» | Siempre | FacturasTable.tsx:503, 362-369, 560-562 |
| 41 | badge | «Borrador» gris · «Emitida» azul · «Pagada» verde · «Pago Parcial» morado · «Anulada» rojo · «Vencida» amarillo · «Desconocido» gris | Columna «Estado» | Siempre | FacturasTable.tsx:77-102, 504, 563-567 |
| 42 | columna | «PMS» → icono Hotel a `/app/pms/calendario?reservation={id}`; «—» si no hay reserva. Tooltip `title="Ver reserva en PMS"` | Enlace al módulo PMS | Siempre | FacturasTable.tsx:505, 568-580 |
| 43 | columna | «Fact. Elect.» → `ElectronicInvoiceStatus` (badge DIAN o nada) | Estado de facturación electrónica | Siempre | FacturasTable.tsx:506, 581-587 |
| 44 | menú | (MoreVertical, `sr-only` «Abrir menú») | Menú «…» de fila | Siempre | FacturasTable.tsx:507, 588-603 |
| 45 | menú | «Ver» (Eye) | Navega al detalle | Siempre | FacturasTable.tsx:612-625 |
| 46 | menú | «Editar» (Pencil) | `…/{id}/editar` | **Solo `status === 'draft'`** | FacturasTable.tsx:626-641 |
| 47 | menú | «Enviar por email» (Mail) | **Solo toast informativo: no envía** | Siempre | FacturasTable.tsx:642-655 |
| 48 | toast | «Enviar factura» / «La factura {number} será enviada por email al cliente.» | — | Tras #47 | FacturasTable.tsx:650 |
| 49 | menú | «Enviar por WhatsApp» (Send) | **Solo toast informativo** | Siempre | FacturasTable.tsx:656-669 |
| 50 | toast | «Enviar factura» / «La factura {number} será enviada por WhatsApp al cliente.» | — | Tras #49 | FacturasTable.tsx:664 |
| 51 | tabla | «Historial de Pagos» (CreditCard azul) | Fila expandida con `PagosFactura` | Fila expandida | FacturasTable.tsx:676-688 |
| 52 | botón | «Registrar Pago» (PlusCircle, outline) | Abre `RegistrarPagoDialog` desde la fila | Si `balance > 0` | `PagosFactura.tsx:139-149` |
| 53 | stat | «Total Pagado:» (tarjeta azul) | Suma de pagos `completed` | Fila expandida | PagosFactura.tsx:153-160 |
| 54 | columna | «Fecha» · «Método» · «Referencia» · «Monto» · «Estado» | Tabla de pagos vía RPC `get_invoice_payments` | Fila expandida | PagosFactura.tsx:75-79, 191-195 |
| 55 | badge | «Completado» verde · «Pendiente» amarillo · «Fallido» rojo · «Reembolsado» morado | Estado del pago | Por pago | PagosFactura.tsx:116-129 |
| 56 | estado | «No hay pagos registrados para esta factura» | Vacío | Sin pagos | PagosFactura.tsx:182-185 |
| 57 | estado | Mensaje + botón «Reintentar» | Error al cargar pagos | — | PagosFactura.tsx:167-181 |
| 58 | paginación | «Anterior» / números / «Siguiente» con elipsis; en móvil solo «{página}» | Cambio de página | `totalPages > 1` | FacturasTable.tsx:697-788 |
| 59 | texto | «Mostrando {a} a {b} de {c} facturas» (oculto en móvil) / «Página {n} de {m}» (solo móvil) | Info de paginación | `totalPages > 1` | FacturasTable.tsx:705-712 |
| 60 | estado | `TableSkeleton` con columnas «Número, Cliente, Emitida, Vencimiento, Total, Saldo, Método de pago, Estado, Acciones» | Carga — **9 cabeceras y 10 celdas para una tabla de 13 columnas** | `cargando` | FacturasTable.tsx:410-411, 794-830 |
| 61 | estado | «Error al cargar datos» + mensaje + «Reintentar» (`window.location.reload()`) | Fallo de carga | `error` | FacturasTable.tsx:415-442 |
| 62 | estado | «No hay facturas» / «No se encontraron facturas de venta para mostrar.» | Vacío | Sin datos | FacturasTable.tsx:445-461 |
| 63 | toast | «Error» / «No se pudieron cargar las facturas» | Fallo de la consulta | — | FacturasTable.tsx:400 |
| 64 | diálogo | «Importar Facturas desde CSV» (FileSpreadsheet) / «Suba un archivo CSV con los datos de las facturas a importar» | Importación masiva | #5 | `ImportarCSVDialog.tsx:281-287` |
| 65 | botón | «Descargar Plantilla» (Download, outline) | `plantilla_facturas.csv` con 13 columnas y 3 filas de ejemplo | En el diálogo | ImportarCSVDialog.tsx:293-296, 257-268 |
| 66 | campo | «Archivo CSV» (`type=file accept=".csv"`) + botón X para limpiar | Parsea con PapaParse | En el diálogo | ImportarCSVDialog.tsx:300-315 |
| 67 | estado | «Procesando archivo...» (Loader2) | Parseo | `isParsing` | ImportarCSVDialog.tsx:318-323 |
| 68 | estado | «Errores encontrados:» + lista (máx. 10) + «... y {n} errores más» (p. ej. «Fila {n}: Número de factura vacío») | Errores de parseo | Con errores | ImportarCSVDialog.tsx:326-341, 111, 147 |
| 69 | columna | «Vista previa ({n} facturas)»: «Número» · «Fecha» · «Items» · «Total» (5 filas + «... y {n} facturas más») | Previsualización | Con datos | ImportarCSVDialog.tsx:344-383 |
| 70 | badge | «Listo para importar» (verde, CheckCircle) | — | Con datos | ImportarCSVDialog.tsx:348-351 |
| 71 | estado | «Importando facturas...» + «{n}%» + barra azul | Importación en curso | `isLoading` | ImportarCSVDialog.tsx:386-399 |
| 72 | botón | «Cancelar» / «Importar ({n})» / «Importando...» (Upload) | Inserta en `invoice_sales` + `invoice_items` **una a una** | En el diálogo | ImportarCSVDialog.tsx:403-421 |
| 73 | toast | «Archivo inválido» / «Por favor seleccione un archivo CSV» · «Sin datos» / «No hay facturas válidas para importar» · «Sin sucursal» / «No hay sucursal seleccionada para asignar las facturas» | Validaciones | — | ImportarCSVDialog.tsx:87, 164, 174 |
| 74 | toast | «Importación completada» / «{n} facturas importadas[, {m} con errores]» | Éxito o éxito parcial | — | ImportarCSVDialog.tsx:245-250 |

Datos: `invoice_sales` filtrada por `organization_id` (+ `branch_id`) y cruzada **en cliente** con `customers`, `payment_methods` y `sales` en cuatro consultas paralelas (FacturasTable.tsx:275-318); los pagos de la fila expandida por la RPC `get_invoice_payments`; el widget de vencimientos con `status='issued'`, `balance>0` y `due_date` entre hoy y hoy+15. **El filtrado y la paginación son 100 % en cliente** sobre todo el conjunto cargado. Layout `p-4 sm:p-6 lg:p-8`, tabla con `overflow-x-auto` y `-mx-3 sm:mx-0`; en móvil los números de página se sustituyen por un indicador. **No existe**: exportación funcional, impresión desde la lista, selección múltiple ni acciones en lote, ordenamiento por columna, ni «Anular» desde el menú «…».

### B.2 Detalle de factura de venta `/app/finanzas/facturas-venta/[id]` — `facturas-venta/id/DetalleFactura.tsx`

Es la pantalla más densa del módulo: **103 controles y 7 diálogos**.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | 4 `Skeleton` (cabecera, bloque, dos tarjetas) | Carga | `loading` | `app/app/finanzas/facturas-venta/[id]/page.tsx:107-119` |
| 2 | estado | «Factura no encontrada» / «La factura que buscas pudo haber sido eliminada o no pertenece a tu organización.» (FileX2) | PGRST116 o sin filas | `notFound` | `[id]/page.tsx:121-141` |
| 3 | botón | «Volver a facturas» (ArrowLeft, azul) | Vuelve al listado | Estado vacío | `[id]/page.tsx:131-138` |
| 4 | toast | «Error al cargar la factura» / «No se pudo cargar la información de la factura» | Excepción | — | `[id]/page.tsx:100` |
| 5 | botón | (icono ArrowLeft azul, ghost) | Vuelve al listado | Siempre | DetalleFactura.tsx:702-708 |
| 6 | texto | «Factura #{number}» (h1, FileText) | Título | Siempre | DetalleFactura.tsx:709-712 |
| 7 | badge | «Borrador» **amarillo** · «Emitida» azul · «Pagada» verde · «Pago Parcial» morado · «Anulada» **gris** · «Vencida» | **Mismos estados que el listado con colores distintos** (§H) | Siempre | DetalleFactura.tsx:76-98, 713-715 |
| 8 | badge | `FactusStatusBadge`: «Pendiente» · «Procesando» · «Enviado» · «Aceptada DIAN» · «Rechazada DIAN» · «Error» · «Cancelada» · «Sin FE»; tooltip con el CUFE | Estado DIAN | Si hay `eInvoiceStatus` | DetalleFactura.tsx:716-723 · `facturacion-electronica/FactusStatusBadge.tsx:76-114` |
| 9 | botón | «Editar» (Pencil, outline) | `…/{id}/editar` | Solo borrador | DetalleFactura.tsx:729-737 |
| 10 | botón | «Emitir» (Send, azul) | Abre la confirmación #11 | Solo borrador | DetalleFactura.tsx:738-748 |
| 11 | diálogo | «¿Emitir factura {number}?» / «Al emitir la factura se cambiará el estado a "Emitida" y se descontará el inventario. Esta acción no se puede deshacer.» · «Cancelar» / «Sí, emitir» | Verifica stock (`fn_invoice_stock_shortages`), RPC `issue_invoice` y descuenta inventario | Tras #10 | DetalleFactura.tsx:749-766, 518-532, 625-668 |
| 12 | toast | «Sin existencias suficientes para emitir» / «{producto}: necesita {x}, hay {y} \| … . **Repon** el inventario o ajusta las cantidades de la factura.» | Faltantes — **«Repon» sin tilde** | Al emitir | DetalleFactura.tsx:636 |
| 13 | toast | «Factura emitida» / «La factura ha sido emitida exitosamente.» | — | — | DetalleFactura.tsx:652 |
| 14 | toast | «Inventario en negativo» / «La factura se **emitio**, pero estas existencias quedaron bajo cero: {detalle}. Revisa el inventario de la sucursal.» | **Sin tilde** | Tras emitir | DetalleFactura.tsx:557 |
| 15 | toast | «La factura se **emitio**, pero el inventario no se **actualizo**» / «Revisa el stock de la sucursal manualmente» | **Dos palabras sin tilde** | Tras emitir | DetalleFactura.tsx:620 |
| 16 | botón | «Imprimir» (Printer, fondo gris) | `generarPDF()` → `PDFService.printInvoiceHTML` | Si no es borrador | DetalleFactura.tsx:769-779 |
| 17 | botón | «PDF» (Download, `title="Descargar PDF"`) | **La misma función que #16** | Siempre | DetalleFactura.tsx:780-789 |
| 18 | toast | «PDF Generado» / «La factura {number} está lista para imprimir/descargar.» | — | — | DetalleFactura.tsx:491 |
| 19 | botón | «Email» (Mail) · «WhatsApp» (Send) | **Solo toast, no envían** | Siempre | DetalleFactura.tsx:790-809, 440-446 |
| 20 | toast | «Enviando factura» / «La factura {number} será enviada por email\|WhatsApp al cliente.» | — | — | DetalleFactura.tsx:441, 445 |
| 21 | botón | «Enviar a DIAN» / «Enviando...» / «Enviada a DIAN» / «Procesando...» / «Pendiente DIAN» / «Reintentar DIAN» (Zap, o CheckCircle verde si aceptada) | Valida y abre la confirmación | No borrador ni anulada | DetalleFactura.tsx:810-821 · `SendToFactusButton.tsx:111-140` |
| 22 | diálogo | «Enviar Factura Electrónica» (Zap) / «Se enviará la factura **{number}** a la DIAN para su validación.» | Confirmación | Tras #21 | SendToFactusButton.tsx:142-152 |
| 23 | estado | «Errores de validación» + lista (Alert destructivo) | `validateInvoiceForEInvoicing` falló | En el diálogo | SendToFactusButton.tsx:154-166 |
| 24 | texto | «Una vez enviada, la factura será procesada por el proveedor de facturación electrónica y validada ante la DIAN. Este proceso puede tomar unos minutos.» | Aviso | Sin errores | SendToFactusButton.tsx:168-175 |
| 25 | botón | «Cancelar» / «Confirmar envío» (Zap; deshabilitado con errores) | Envía a Factus | En el diálogo | SendToFactusButton.tsx:177-188 |
| 26 | toast | «Factura enviada a DIAN» / «La factura {number} ha sido enviada para validación» · «Error al enviar» / «No se pudo enviar la factura a DIAN» | — | — | SendToFactusButton.tsx:85-95 |
| 27 | botón | «PDF DIAN» (FileText, `title="Descargar PDF de DIAN"`) → `factura-{n}.pdf` | Descarga desde el proveedor | Solo `accepted` + CUFE | DetalleFactura.tsx:824-847 |
| 28 | botón | «XML DIAN» (Download, `title="Descargar XML de DIAN"`) → `factura-{n}.xml` | Ídem | Solo `accepted` + CUFE | DetalleFactura.tsx:848-872 |
| 29 | botón | «Duplicar» (Copy, `title="Duplicar factura"`) | Abre la confirmación #30 | Siempre | DetalleFactura.tsx:875-886 |
| 30 | diálogo | «¿Duplicar factura {number}?» / «Se creará una nueva factura en borrador con los mismos items, cliente y condiciones. Podrás editarla antes de emitirla.» · «Cancelar» / «Sí, duplicar» | Navega a `/nuevo?duplicar={id}&cliente=…&moneda=…&terminos=…&metodo_pago=…&notas=…` | Tras #29 | DetalleFactura.tsx:887-901, 671-690 |
| 31 | toast | «Duplicando factura» / «Se está creando una nueva factura basada en la seleccionada.» | — | — | DetalleFactura.tsx:685 |
| 32 | botón | «Nota Crédito» (FileOutput, borde azul) | Abre `NotaCreditoDialog` | Si no está anulada | DetalleFactura.tsx:904-914 |
| 33 | botón | «Registrar Abono» (CreditCard, verde) | Abre `RegistrarPagoDialog` — **deja un `console.log` en producción** | Si no pagada ni anulada | DetalleFactura.tsx:917-927 |
| 34 | botón | «Marcar Pagada» (CheckCircle verde, outline) | Abre el diálogo de fecha | Si no pagada ni anulada | DetalleFactura.tsx:928-939 |
| 35 | botón | «Anular» (Ban, borde rojo) | Abre `AnularFacturaDialog` | Si no pagada ni anulada | DetalleFactura.tsx:940-948 |
| 36 | texto | «Información de la Factura» (Info) | Sección | Siempre | DetalleFactura.tsx:955-961 |
| 37 | texto | «Número:» · «Cliente:» · «Documento:» · «Email:» · «Teléfono:» (fallback «N/A») | Columna izquierda | Siempre | DetalleFactura.tsx:964-989 |
| 38 | texto | «Fecha de Emisión:» · «Fecha de Vencimiento:» · «Método de Pago:» · «Términos de Pago:» → «Contado» o «{n} días ({estado vencimiento})» | Columna derecha | Siempre | DetalleFactura.tsx:990-1016, 100-115 |
| 39 | texto | «Notas:» + caja gris | Notas | Si hay | DetalleFactura.tsx:1019-1026 |
| 40 | texto | «Resumen Financiero» (Receipt) | Sección | Siempre | DetalleFactura.tsx:1031-1042 |
| 41 | badge | «Imp. incluidos» (secondary) | `tax_included` | — | DetalleFactura.tsx:1036-1040 |
| 42 | cálculo | «Subtotal:» · «Descuentos:» (rojo con «- ») · «Impuestos:» · «Total:» (negrita) | Bloque de totales | «Descuentos» solo si >0 | DetalleFactura.tsx:1045-1067, 498-501 |
| 43 | cálculo | «Nota crédito / saldo aplicado:» (azul con «- ») | Crédito aplicado | Si >0 | DetalleFactura.tsx:1071-1078 |
| 44 | cálculo | «Pagado:» (verde) · «Pendiente:» (rojo si >0, verde si 0) | — | Siempre | DetalleFactura.tsx:1080-1092 |
| 45 | estado | «Factura completamente pagada» (caja verde, CheckCircle) | — | `status === 'paid'` | DetalleFactura.tsx:1094-1099 |
| 46 | texto | «Vendedor y Comisión» (User) · «Vendedor:» · «Comisión:» (Percent o DollarSign) | Sección | Si hay vendedor y comisión >0 | DetalleFactura.tsx:1105-1134 |
| 47 | cálculo | «Comisión calculada:» (caja azul) | `commission_amount` | Si >0 | DetalleFactura.tsx:1135-1144 |
| 48 | columna | «Detalle de Items»: «#» · «Descripción» · «Cant.» · «Precio Unit.» (`hidden sm`) · «Desc.» (`hidden md`) · «Impuesto» (`hidden md`) · «Total» | 7 columnas | Siempre | DetalleFactura.tsx:1150-1160 · `id/ItemsDetalle.tsx:75-81` |
| 49 | texto | «SKU: {sku}» sobre la descripción | Si hay SKU o `code_reference` | Por fila | ItemsDetalle.tsx:95-99 |
| 50 | chip | Serial en `font-mono` con borde | Números de serie | Si `serial_numbers` | ItemsDetalle.tsx:103-111 |
| 51 | badge | «Imp. incluido» (morado, solo móvil `md:hidden`) | — | Tasa >0 e incluido | ItemsDetalle.tsx:112-123 |
| 52 | texto | Nombre del impuesto + «Incluido» (badge morado) o «Adicional» / «{tasa}% (+imp.)»; «N/A» si tasa 0 | Celda de impuesto | Por fila | ItemsDetalle.tsx:134-160, 55-67 |
| 53 | texto | «* Los precios incluyen impuestos» / «* Los impuestos se calculan sobre el subtotal» | Pie de la tabla | Siempre | ItemsDetalle.tsx:171-179 |
| 54 | estado | «No hay ítems registrados en esta factura.» | Vacío | — | ItemsDetalle.tsx:47-53 |
| 55 | columna | «Pagos Aplicados» (CreditCard): «Fecha» · «Método» · «Referencia» (`hidden md`) · «Monto» · «Estado» (`hidden sm`) | 5 columnas | Siempre | DetalleFactura.tsx:1163-1173 · `id/PagosDetalle.tsx:77-81` |
| 56 | badge | «Completado» verde · «Pendiente» amarillo · «Fallido» rojo · «Reembolsado» morado | En móvil aparece bajo el monto | Por fila | PagosDetalle.tsx:38-54, 100-111 |
| 57 | estado | «No hay pagos registrados para esta factura.» | Vacío | — | PagosDetalle.tsx:29-35 |
| 58 | diálogo | «Registrar Pago» | Abono | `dialogPagoOpen` | `id/RegistrarPagoDialog.tsx:298-302` |
| 59 | campo | «Factura» → «{number} - {total}» (deshabilitado) · «Saldo Pendiente» (rojo, deshabilitado) | Contexto | En el diálogo | RegistrarPagoDialog.tsx:304-322 |
| 60 | campo | «Método de Pago» (placeholder «Selecciona un método de pago») | Métodos de la organización | En el diálogo | RegistrarPagoDialog.tsx:324-342 |
| 61 | campo | «Monto a Pagar» (placeholder «0.00») | Valida contra el saldo | En el diálogo | RegistrarPagoDialog.tsx:344-354 |
| 62 | estado | «El monto ingresado ({x}) excede el saldo pendiente ({y})» (Alert rojo) | Monto excedido | — | RegistrarPagoDialog.tsx:355-367 |
| 63 | campo | «Fecha de Pago» (`max` = hoy) | Fecha del abono | En el diálogo | RegistrarPagoDialog.tsx:370-385 |
| 64 | texto | «La fecha no puede ser anterior a la emisión de la factura» | Validación | — | RegistrarPagoDialog.tsx:386-388 |
| 65 | campo | «Referencia / Transacción» (placeholder «Número de transacción, últimos 4 dígitos, etc.») | Condicional al método (`requires_reference`, card o transfer) | Si aplica | RegistrarPagoDialog.tsx:391-402, 292-295 |
| 66 | botón | «Cancelar» / «Registrar Pago» (verde, Loader2) | Inserta en `payments`, **actualiza el saldo a mano** y llama a `create_account_receivable` (§H) | En el diálogo | RegistrarPagoDialog.tsx:404-421, 183-248 |
| 67 | toast | «Pago registrado» / «Se ha registrado un pago por {monto} exitosamente» | — | — | RegistrarPagoDialog.tsx:257 |
| 68 | toast | «Error al registrar pago» / mensaje según código (42883, 23503, genérico) | — | — | RegistrarPagoDialog.tsx:263-285 |
| 69 | diálogo | «Generar Nota de Crédito» (`sm:max-w-[700px]`) — **el único diálogo grande del bloque sin `DialogDescription`** | Nota de crédito | `dialogNotaCreditoOpen` | `id/NotaCreditoDialog.tsx:546-550` |
| 70 | campo | «Factura Original» (solo lectura) · «Número de Nota de Crédito» (placeholder «NC00000001») | Consecutivo editable | En el diálogo | NotaCreditoDialog.tsx:553-574 |
| 71 | texto | «Último número: {n}» | Ayuda | Si hay consecutivo previo | NotaCreditoDialog.tsx:569-573 |
| 72 | campo | «Motivo de la Nota de Crédito» (placeholder «Explica el motivo de la nota de crédito...», rows=2) | Se envía a la DIAN | En el diálogo | NotaCreditoDialog.tsx:577-586 |
| 73 | pestaña | «Por devolución de ítems» / «Por valor / concepto» | Alterna el modo | En el diálogo | NotaCreditoDialog.tsx:588-605 |
| 74 | campo | «Concepto» (placeholder «Ej: Descuento comercial acordado») · «Monto» | Modo valor | `modo === 'valor'` | NotaCreditoDialog.tsx:609-627 |
| 75 | texto | «La nota de crédito por valor reduce el saldo de la factura sin mover inventario.» | Aviso | Modo valor | NotaCreditoDialog.tsx:628-630 |
| 76 | columna | «Selecciona los Ítems para la Nota de Crédito»: «Sel.» · «Descripción» · «Cant. Original» · «Cant. a Devolver» · «Precio Unit.» · «Total» | 6 columnas | Modo ítems | NotaCreditoDialog.tsx:634-695 |
| 77 | estado | «No hay ítems disponibles» | Vacío | Modo ítems | NotaCreditoDialog.tsx:684-690 |
| 78 | cálculo | «Total de Nota de Crédito:» | Suma de las líneas seleccionadas | En el diálogo | NotaCreditoDialog.tsx:697-700 |
| 79 | botón | «Cancelar» / «Generar Nota de Crédito» (deshabilitado si el total ≤ 0) | Crea la NC negativa, copia impuestos y ajusta saldo y cartera | En el diálogo | NotaCreditoDialog.tsx:702-714 |
| 80 | toast | «Nota de crédito generada» / «Se ha generado la nota de crédito {n} por {monto} exitosamente» | — | — | NotaCreditoDialog.tsx:498 |
| 81 | toast | «Enviando a DIAN» / «La factura original fue aceptada por DIAN. Enviando nota de crédito...» · «Nota de crédito enviada a DIAN» / «CUFE: {16 chars}...» · «Envío a DIAN pendiente» / «La nota de crédito se creó pero no se pudo enviar a DIAN: {error}. Puede reintentar desde el detalle.» | Cadena de envío automático | — | NotaCreditoDialog.tsx:504, 511, 513-518 |
| 82 | diálogo | «Anular Factura {number}» (AlertTriangle rojo) / «Esta acción marca la factura como anulada y revierte su efecto contable y de cartera. No se puede deshacer.» | Anulación | `dialogAnularOpen` | `id/AnularFacturaDialog.tsx:146-156` |
| 83 | estado | «La factura ya tiene pagos aplicados ({monto}). No puede anularse directamente; usa una Nota de Crédito.» (caja amarilla) | **Bloquea la anulación** | Si hay pagos | AnularFacturaDialog.tsx:159-163 |
| 84 | campo | «Motivo de la anulación» (placeholder «Explica por qué se anula esta factura...», rows=3) | Se anexa a `notes` como «ANULADA: {motivo}» | En el diálogo | AnularFacturaDialog.tsx:165-177, 59-61 |
| 85 | botón | «Cancelar» / «Anular Factura» (destructive, deshabilitado si hay pagos) | `status='void'`, salda cartera y reingresa el stock | En el diálogo | AnularFacturaDialog.tsx:180-197, 64-130 |
| 86 | toast | «Factura anulada» / «La factura {number} fue anulada correctamente.» · «Error» / «No se pudo anular la factura: {mensaje}» | — | — | AnularFacturaDialog.tsx:132, 139 |
| 87 | diálogo | «Marcar como Pagada» / «Se registrará un pago total por {balance}. Selecciona la fecha del pago.» | Pago total | `dialogMarcarPagadaOpen` | DetalleFactura.tsx:1207-1214 |
| 88 | campo | «Fecha de Pago» (`max` hoy, `min` fecha de emisión) | — | En el diálogo | DetalleFactura.tsx:1215-1225 |
| 89 | texto | «La fecha no puede ser anterior a la emisión de la factura» | Validación | — | DetalleFactura.tsx:1226-1228 |
| 90 | botón | «Cancelar» / «Confirmar Pago» (verde, CheckCircle) | **Marca la factura pagada ANTES de insertar el pago** (§H) con referencia «Pago total automático» | En el diálogo | DetalleFactura.tsx:1230-1245, 386-400 |
| 91 | toast | «Factura pagada» / «La factura ha sido marcada como pagada exitosamente.» | — | — | DetalleFactura.tsx:430 |

Datos: carga en el cliente `invoice_sales` + `customers` (embebido), `invoice_items` + `products`, `payments` con `source='invoice_sales'` y el nombre del vendedor desde `profiles` (`[id]/page.tsx:37-98`). Layout `container mx-auto max-w-7xl`, tarjetas apiladas; **con las 12 acciones posibles la cabecera ocupa dos o tres líneas en pantallas medianas**. **No existe**: pestañas (todo va apilado), historial de auditoría, adjuntos, ni «Reversar pago» desde la tabla de pagos.

### B.3 Nueva factura de venta `/app/finanzas/facturas-venta/nuevo` — `facturas-venta/nueva-factura/NuevaFacturaForm.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft azul, ghost) | Vuelve al listado | Siempre | `nueva-factura/PageBackHeader.tsx:13-32` |
| 2 | texto | «Nueva Factura de Venta» (h1, FileText en cuadro azul) | Título | Siempre | PageBackHeader.tsx:33-38 |
| 3 | campo | «Número de Factura» (placeholder «Ej: FACT-00001», required) | Valida duplicado en `onBlur` | Siempre | NuevaFacturaForm.tsx:1083-1112 |
| 4 | botón | (icono RefreshCw, `title="Generar número automático"`) | `generateInvoiceNumber()` | Siempre | NuevaFacturaForm.tsx:1113-1129 |
| 5 | texto | «Este número de factura ya existe.» | Duplicado | — | NuevaFacturaForm.tsx:1131-1133 |
| 6 | campo | «Fecha de Emisión» (`DatePicker`) | Recalcula el vencimiento según los términos | Siempre | NuevaFacturaForm.tsx:1136-1152 |
| 7 | campo | «Fecha de Vencimiento» (`DatePicker`) | Editable | Siempre | NuevaFacturaForm.tsx:1154-1162 |
| 8 | campo | «Moneda» (Coins; placeholder «Seleccionar moneda» / «Cargando...»; formato «{código} - {nombre} ({símbolo})») | Monedas de la organización | Siempre | NuevaFacturaForm.tsx:1164-1196 |
| 9 | texto | «Datos del Cliente» (h3) | Sección | Siempre | NuevaFacturaForm.tsx:1207-1209 |
| 10 | campo | `BranchSelectorField` (required) | Sucursal | Siempre | NuevaFacturaForm.tsx:1211-1215 |
| 11 | campo | Select «Buscar cliente» | Selector de cliente con avatar | Siempre | `nueva-factura/ClienteSelector.tsx:236-310` |
| 12 | campo | Placeholder «Buscar cliente por nombre, email o teléfono» (`autoFocus`, dentro del desplegable) | Búsqueda en servidor con debounce 300 ms, `.limit(50)` | Desplegable abierto | ClienteSelector.tsx:251-264, 75-81, 141-145 |
| 13 | estado | «Buscando...» · «Cargando clientes...» / «No se encontraron clientes» | Carga y vacío | — | ClienteSelector.tsx:265-277 |
| 14 | texto | «Contacto: {nombre} ({cargo})» | Solo para `customer_type === 'company'` | Por opción | ClienteSelector.tsx:299-301 |
| 15 | botón | (icono Plus, outline 9×9) | Abre `ClienteFormDialog` (formulario completo) | Siempre | ClienteSelector.tsx:313-337 |
| 16 | texto | «Email: …» / «Teléfono: …» con avatar | Ficha del cliente elegido | Si hay cliente | ClienteSelector.tsx:341-368 |
| 17 | campo | «Oportunidad (opcional)» (placeholder «Sin oportunidad asociada») | Carga los productos de la oportunidad del CRM y la asocia — **sin impuesto** (§G) | Si hay oportunidades | NuevaFacturaForm.tsx:1224-1260 |
| 18 | texto | «Al seleccionar una oportunidad, se cargan sus productos y se asocia la factura a ella.» | Ayuda | — | NuevaFacturaForm.tsx:1253-1257 |
| 19 | texto | «Items de la Factura» (h3) | Sección | Siempre | NuevaFacturaForm.tsx:1269-1271 |
| 20 | diálogo | `ProductSearchDialog` en modo `sale` — **`currency="COP"` cableado** | Buscador del catálogo | Siempre | `nueva-factura/ItemsFactura.tsx:190-197` |
| 21 | botón | «Agregar Ítem Manual» (Plus, outline) | Añade una línea vacía | Siempre | ItemsFactura.tsx:199-213 |
| 22 | botón | «Capturar Seriales» (Package, azul claro) + badge con el nº de ítems seriados | Abre `SerialSelectorDialog` | Si hay ítems con serial | ItemsFactura.tsx:215-234 |
| 23 | columna | «Descripción» (input por fila) | — | Siempre | ItemsFactura.tsx:243, 262-296 |
| 24 | badge | «Serial» (morado, Package) · «{n}/{qty} seriales» (verde si completo, naranja si no) | Progreso de captura | Si `track_serial` | ItemsFactura.tsx:273-293 |
| 25 | columna | «Cantidad» (`min=1`) | Borde rojo + AlertCircle si supera el stock | Siempre | ItemsFactura.tsx:244, 297-321 |
| 26 | texto | «Stock: {n}» (rojo, bajo la cantidad) | Cantidad > existencias | — | ItemsFactura.tsx:316-320 |
| 27 | columna | «Precio Unit.» · «Descuento» (placeholder «0») | — | Siempre | ItemsFactura.tsx:245-246, 322-352 |
| 28 | columna | «Impuesto» → «{tasa}%» o «N/A» + checkbox «Incluido» | Alterna `tax_included` por línea | Siempre | ItemsFactura.tsx:247, 353-380 |
| 29 | columna | «Total» — **`formatCurrency(..., 'COP')` con moneda cableada** | Total de línea | Siempre | ItemsFactura.tsx:248, 381-383 |
| 30 | botón | (papelera, hover rojo) | Elimina la línea | Siempre | ItemsFactura.tsx:249, 384-398 |
| 31 | estado | «No hay ítems en la factura» | Vacío | — | ItemsFactura.tsx:253-258 |
| 32 | texto | «Condiciones de Pago» (h3) | Sección | Siempre | NuevaFacturaForm.tsx:1292-1294 |
| 33 | campo | «Términos de Pago» (placeholder «Seleccionar términos»): «Contado» · «15 días» · «30 días» · «45 días» · «60 días» · «90 días» · «Personalizado» | Recalcula el vencimiento | Siempre | NuevaFacturaForm.tsx:1296-1341 |
| 34 | campo | Input + «días» | Días personalizados | Si «Personalizado» | NuevaFacturaForm.tsx:1343-1368 |
| 35 | campo | «Forma de Pago» (placeholder «Seleccionar forma de pago») | Desde `organization_payment_methods` | Siempre | NuevaFacturaForm.tsx:1371-1376 · `FormaPagoSelector.tsx:100-144` |
| 36 | estado | «Cargando métodos...» / «No hay métodos de pago disponibles» | Ítems deshabilitados | — | FormaPagoSelector.tsx:123-131 |
| 37 | campo | «Notas» (placeholder «Notas adicionales») | Texto libre | Siempre | NuevaFacturaForm.tsx:1377-1394 |
| 38 | toggle | checkbox «Incluir en arqueo de caja» + «(Marca si esta factura debe aparecer en el cuadre de caja POS)» | `include_in_cash_register` | Siempre | NuevaFacturaForm.tsx:1395-1407 |
| 39 | toggle | Switch «Factura Electrónica» (Zap, azul al activarse) | Envía a la DIAN al guardar | Siempre | NuevaFacturaForm.tsx:1408-1422 · `ElectronicInvoiceToggle.tsx:40-67` |
| 40 | tooltip | «Al activar esta opción, la factura será enviada automáticamente a la DIAN para su validación electrónica.» (Info) | Ayuda | Hover | ElectronicInvoiceToggle.tsx:67-81 |
| 41 | badge | «Global» (azul) | El toggle lo fuerza la configuración de la organización (deshabilitado) | `eInvoiceAlwaysEnabled` | NuevaFacturaForm.tsx:1418-1420 |
| 42 | texto | «Resumen e Impuestos» (h3) | Sección | Siempre | `ImpuestosFactura.tsx:416-418` |
| 43 | cálculo | «Subtotal:» + «(imp. incluidos)» | — | Siempre | ImpuestosFactura.tsx:422-430 |
| 44 | toggle | checkbox «Impuestos incluidos en precios» | Propaga `tax_included` a todos los ítems | Siempre | ImpuestosFactura.tsx:438-458 |
| 45 | toggle | checkbox «{nombre} ({tasa}%)» por impuesto de la organización | Aplica/quita el impuesto | Siempre | ImpuestosFactura.tsx:468-511 |
| 46 | badge | «Predeterminado» (azul) | Marca el impuesto por defecto — **su checkbox no propaga al padre** (§G) | — | ImpuestosFactura.tsx:496-508 |
| 47 | estado | «No hay impuestos configurados» | Sin impuestos | — | ImpuestosFactura.tsx:512-516 |
| 48 | cálculo | «{nombre} ({tasa}%):» + «(incluido)» → importe · «Total Impuestos:» · «Total:» (azul, grande) + «(incluye ${subtotal} + impuestos)» | Desglose y totales — **formateados con `$` + `toFixed(2)`** (§G) | Siempre | ImpuestosFactura.tsx:521-569 |
| 49 | texto | «Comisión de Vendedor (opcional)» (h3, User) | Sección | Siempre | NuevaFacturaForm.tsx:1457-1460 |
| 50 | campo | «Vendedor» (placeholder «Seleccionar vendedor»; búsqueda «Buscar vendedor...»; «Sin asignar») | Miembros de la organización | Siempre | NuevaFacturaForm.tsx:1462-1476 |
| 51 | campo | «Comisión» (prefijo Percent o DollarSign, placeholder «0») | Tasa o monto | Siempre | NuevaFacturaForm.tsx:1477-1513 |
| 52 | toggle | «Porcentaje» / «Monto Fijo» | Cambia `commission_method` | Siempre | NuevaFacturaForm.tsx:1514-1533 |
| 53 | texto | «El porcentaje no puede superar 100%» / «El monto supera el total de la factura» | Validación | — | NuevaFacturaForm.tsx:1534-1545 |
| 54 | cálculo | «Comisión estimada ({x}% \| {monto}):» (caja azul) | Estimación | Vendedor + comisión >0 | NuevaFacturaForm.tsx:1548-1561 |
| 55 | botón | «Cancelar» (ArrowLeft, outline) → `router.back()` | — | Siempre | NuevaFacturaForm.tsx:1570-1585 |
| 56 | botón | «Guardar Factura» / «Guardar Cambios» / «Guardando...» (Save, azul) | Guarda | Siempre | NuevaFacturaForm.tsx:1586-1600 |
| 57 | toast | «Error» / «Debe ingresar un número de factura.» · «No se pudo obtener la información del usuario actual.» · «No se pudo determinar la organización activa.» · «No se pudo determinar la sucursal activa. Seleccione una sucursal.» · «Debe seleccionar un cliente para la factura.» · «Debe agregar al menos un ítem a la factura.» | Validaciones | — | NuevaFacturaForm.tsx:556, 564, 569, 574, 579, 584 |
| 58 | toast | «Seriales requeridos» / «Hay productos que requieren captura de seriales. Selecciónalos antes de guardar la factura.» | — | — | NuevaFacturaForm.tsx:596-599 |
| 59 | toast | «Número duplicado» / «Este número de factura ya existe. Por favor, utilice otro número.» | — | — | NuevaFacturaForm.tsx:469 |
| 60 | toast | «Éxito» / «La factura se ha creado correctamente.» | Sin FE | — | NuevaFacturaForm.tsx:1065 |
| 61 | toast | «Factura creada y enviada a DIAN» / «La factura {n} se ha creado y enviado para validación electrónica.» · «Factura creada» / «La factura se creó pero hubo un error al enviar a DIAN: {error}» | Con FE | — | NuevaFacturaForm.tsx:1056-1062 |
| 62 | toast | «Guardada, pero sin existencias para emitir» / «{detalle}. **Repon** el inventario antes de emitirla.» | **Sin tilde** | — | NuevaFacturaForm.tsx:1041 |
| 63 | toast | «Factura duplicada» / «Se han cargado los datos de la factura original. Modifique según necesite.» | Llegada con `?duplicar=` | — | NuevaFacturaForm.tsx:432 |
| 64 | toast | «Error» / «Ocurrió un error al guardar la factura: {JSON.stringify(error)}» — **vuelca el objeto de error crudo a la interfaz** | Excepción | — | NuevaFacturaForm.tsx:1073 |

Escribe en `invoice_sales` + `invoice_items` + `invoice_applied_taxes`. Cabecera en rejilla `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; la tabla de ítems fuerza `min-w-[800px]`, así que **en móvil siempre hay scroll horizontal**. **No existe**: guardar como borrador frente a emitir, previsualización del PDF antes de guardar, ni aviso de cambios sin guardar al salir.

### B.4 Editar factura de venta `/app/finanzas/facturas-venta/[id]/editar` — `facturas-venta/editar/EditarFacturaVenta.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Skeletons de cabecera + rejilla 2×2 + bloque | Carga | `loading` | EditarFacturaVenta.tsx:242-272 |
| 2 | botón | (icono ArrowLeft azul, ghost) | `router.back()` | Siempre | EditarFacturaVenta.tsx:323-335 |
| 3 | texto | «Editar Factura de Venta» (h1, FileText) | Título | Carga correcta | EditarFacturaVenta.tsx:339-341 |
| 4 | texto | «Editar Factura» (h1) — **título distinto en la pantalla de error** | Título | En error | EditarFacturaVenta.tsx:290-292 |
| 5 | estado | `Alert` destructivo con el mensaje | Error de carga o factura no editable | `error` | EditarFacturaVenta.tsx:295-298 |
| 6 | texto | «La factura no puede ser editada en su estado actual.» / «No se pudo cargar la información de la factura.» | Copy según el error | — | EditarFacturaVenta.tsx:300-304 |
| 7 | botón | «Intentar de nuevo» (default) · «Volver al detalle» (outline) | Recarga / navega | En error | EditarFacturaVenta.tsx:306-311 |
| 8 | formulario | Reutiliza **todo** `NuevaFacturaForm` con `esEdicion={true}` | Ver B.3 #3-#56 | Carga correcta | EditarFacturaVenta.tsx:352-357 |
| 9 | toast | «Factura actualizada» / «La factura de venta se ha actualizado correctamente.» · «Error al actualizar» / mensaje del error | — | — | EditarFacturaVenta.tsx:231, 236 |

Es un envoltorio: carga la factura, valida que sea editable y delega en `NuevaFacturaForm`; el guardado actualiza `invoice_sales`, `invoice_items`, `invoice_applied_taxes` (**con `tax_rate: 0` cableado**, §G) y, si la factura viene de una venta, también `sales` (EditarFacturaVenta.tsx:213-229). **No existe**: indicador de qué campos quedaron bloqueados; el título de la sección sigue diciendo «Items de la Factura».

### B.5 Facturas de compra (lista) `/app/finanzas/facturas-compra` — `components/finanzas/facturas-compra/FacturasCompraPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft, ghost) | `Link` a `/app/finanzas` (o `/app/inventario` si la ruta contiene `/inventario/`) | Siempre | `components/finanzas/facturas-compra/PageHeader.tsx:42-46` |
| 2 | texto | «Facturas de Compra» (h1, FileText en cuadro azul) / «Finanzas / Facturas de Compra» (o «Inventario / …») | Título y migaja | Siempre | PageHeader.tsx:24, 48-56 |
| 3 | botón | (icono RefreshCw) | **Nunca se renderiza**: la página monta `<PageHeader />` sin la prop `onRefresh` | Nunca | PageHeader.tsx:62-72 vs FacturasCompraPage.tsx:43 |
| 4 | botón | «Importar» (Upload; texto `hidden sm:inline`) | **Solo `console.log('Importar OFX para conciliación bancaria')`** | Siempre | PageHeader.tsx:30-32, 73-81 |
| 5 | botón | «Exportar» (Download; texto `hidden sm:inline`) | **Solo `console.log('Exportar reporte PDF')`** | Siempre | PageHeader.tsx:34-36, 82-90 |
| 6 | botón | «Nueva Factura» (Plus, azul) | `router.push('{basePath}/nuevo')` | Siempre | PageHeader.tsx:26-28, 91-98 |
| 7 | badge | Sucursal activa (`BranchBadge`) | Informativo | Siempre | FacturasCompraPage.tsx:44 |
| 8 | stat | «Total por Pagar» (DollarSign azul) · «Vencidas» (AlertTriangle rojo) + «{n} facturas» · «Críticas ≤3d» (Clock ámbar) · «Próximas ≤7d» (FileText naranja) | 4 KPIs calculados en cliente sobre las facturas con saldo | Siempre | `facturas-compra/FacturasProximasVencer.tsx:122-185` |
| 9 | estado | 4 tarjetas con `animate-pulse` | Carga de KPIs | `loading` | FacturasProximasVencer.tsx:99-116 |
| 10 | texto | «Facturas Próximas a Vencer» (Clock ámbar) + «({n})» | Sección de lista | Siempre | FacturasProximasVencer.tsx:190-198 |
| 11 | botón | «Ver todas» / «Ver menos» (ghost azul) | Alterna entre 5 y todas | Si hay >5 | FacturasProximasVencer.tsx:199-208 |
| 12 | estado | «¡Excelente!» / «No hay facturas próximas a vencer en los próximos {15} días» (TrendingUp verde) | Vacío | — | FacturasProximasVencer.tsx:212-217 |
| 13 | texto | `number_ext` / proveedor / «Vence: {fecha} ({n}d \| {n}d vencida)» + saldo y «de {total}» (`md`) | Fila del widget | Por fila | FacturasProximasVencer.tsx:242-272 |
| 14 | botón | (icono Eye, `title="Ver factura"`) | Navega al detalle | Por fila | FacturasProximasVencer.tsx:275-283 |
| 15 | botón | (icono CreditCard, `title="Registrar Pago"`) | **Nada: no tiene `onClick`** | Por fila | FacturasProximasVencer.tsx:284-291 |
| 16 | campo | «Buscar factura» (placeholder «Número de factura o notas...», Search) | Auto-aplica al teclear | Siempre | `FacturasCompraFiltros.tsx:86-101, 64-72` |
| 17 | campo | «Estado» (placeholder «Todos los estados»): «Todos los estados» · «Borrador» · «Recibida» · «Parcial» · «Pagada» · «Anulada» | Auto-aplica | Siempre | FacturasCompraFiltros.tsx:104-124 |
| 18 | campo | «Proveedor» (placeholder «Todos los proveedores») | Auto-aplica | Siempre | FacturasCompraFiltros.tsx:126-146 |
| 19 | botón | «Filtros» (Filter; texto `hidden sm:inline`) · «Limpiar» (X) | Abre el panel / resetea | «Limpiar» solo con filtros activos | FacturasCompraFiltros.tsx:149-169 |
| 20 | campo | «Fecha desde» · «Fecha hasta» (`type=date`) | **No auto-aplican**: hay que pulsar «Aplicar Filtros» | Panel abierto | FacturasCompraFiltros.tsx:178-202, 69-71 |
| 21 | botón | «Aplicar Filtros» (azul, ancho completo) | Aplica los filtros del panel | Panel abierto | FacturasCompraFiltros.tsx:204-212 |
| 22 | chip | «Búsqueda: {x}» azul · «Estado: {x}» verde (**muestra el código crudo: `draft`, `received`…**) · «Proveedor: {nombre}» morado · «Desde: {fecha}» / «Hasta: {fecha}» naranja | Filtros activos, **no cerrables** | Con filtros | FacturasCompraFiltros.tsx:218-246 |
| 23 | columna | «Núm. Factura» → `CopyableId` sobre `number_ext` | — | Siempre | `FacturasCompraTable.tsx:226, 253-265` |
| 24 | estado | AlertTriangle rojo junto al número | Factura vencida con saldo | `due_date < hoy` y `balance>0` | FacturasCompraTable.tsx:261-263 |
| 25 | columna | «Proveedor» (nombre + NIT en segunda línea) | — | Siempre | FacturasCompraTable.tsx:227, 266-273 |
| 26 | columna | «Fecha Emisión» (`hidden md`) · «Vencimiento» (`hidden lg`) · «Total» · «Balance» (`hidden sm`, rojo si >0, verde si 0) · «Moneda» (`hidden xl`) | **La tabla esconde columnas progresivamente** | Por breakpoint | FacturasCompraTable.tsx:228-233, 274-295 |
| 27 | badge | «Borrador» secondary · «Recibida» azul · «Parcial» outline amarillo · «Pagada» verde · «Anulada» destructive · «Desconocido» | Estado | Siempre | FacturasCompraTable.tsx:112-127, 232, 290-292 |
| 28 | columna | «Acciones» → **grupo de iconos sueltos, sin menú «…»** | — | Siempre | FacturasCompraTable.tsx:234, 296-356 |
| 29 | botón | (Eye, `title="Ver detalles"`) | `{basePath}/{id}` | Siempre | FacturasCompraTable.tsx:298-306 |
| 30 | botón | (Edit, `title="Editar"`) | `{basePath}/{id}/editar` | Solo `draft` | FacturasCompraTable.tsx:308-318 |
| 31 | botón | (Package, `title="Recepcionar a Inventario"`) | `/app/inventario/entradas/nueva?factura_id={id}` (marcado `// TODO` en el código) | Solo `received` | FacturasCompraTable.tsx:107-110, 320-330 |
| 32 | botón | (CreditCard, `title="Registrar Pago"`) | Abre `RegistrarPagoModal` | `balance>0` y estado `received`/`partial` | FacturasCompraTable.tsx:332-342 |
| 33 | botón | (Trash2 rojo, `title="Eliminar"`) | **`window.confirm`** «¿Está seguro de que desea eliminar esta factura?» + **`window.alert`** «Error al eliminar la factura. Solo se pueden eliminar facturas en estado borrador.» | Solo `draft` | FacturasCompraTable.tsx:90-100, 344-354 |
| 34 | estado | Fila roja con borde izquierdo si está vencida; amarilla si vence en ≤7 días; `opacity-50` si está anulada | Coloreado de filas | Según estado | FacturasCompraTable.tsx:129-147 |
| 35 | estado | «No se encontraron facturas de compra» (`colSpan={9}`) | Vacío | — | FacturasCompraTable.tsx:238-243 |
| 36 | estado | Esqueleto propio: 7 anchos de cabecera + 5 filas con `animationDelay` escalonado | Carga | `loading` | FacturasCompraTable.tsx:185-218 |
| 37 | paginación | «Anterior» / números / «Siguiente» (Chevron; textos `hidden sm:inline`) + «...» y «Mostrando {a} a {b} de {c} facturas» | **Página fija de 10, sin selector de tamaño** | `totalPages > 1` | FacturasCompraTable.tsx:50, 365-421 |
| 38 | botón | «← Volver a Finanzas» / «← Volver a Inventario» (outline) — **la flecha es un carácter, no un icono** | Navegación de pie | Siempre | FacturasCompraPage.tsx:67-71 |
| 39 | botón | «Cuentas por Pagar» (outline) | `/app/finanzas/cuentas-por-pagar` | En finanzas | FacturasCompraPage.tsx:83-85 |
| 40 | botón | «Proveedores» (outline) | `/app/finanzas/proveedores` — **esa ruta no existe** (los proveedores están en `/app/inventario/proveedores`) | En finanzas | FacturasCompraPage.tsx:86-88 |
| 41 | botón | «Productos» / «Categorías» (outline) | Enlaces de inventario | Si la ruta es de inventario | FacturasCompraPage.tsx:74-79 |

**La paginación y el filtrado sí son de servidor** (`FacturasCompraService.obtenerFacturas(filtros, page, pageSize, branchFilter)` sobre `invoice_purchase` con `suppliers` embebido), al contrario que en facturas de venta. KPIs `grid-cols-2 md:grid-cols-4`. **No existe**: menú «…», badge de facturación electrónica, fila expandible con pagos, ni selector de tamaño de página.

### B.6 Detalle de factura de compra `/app/finanzas/facturas-compra/[id]` — `facturas-compra/id/DetalleFacturaCompra.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Skeletons: cabecera, 3 botones, rejilla 3×, bloque, 2 tarjetas | Carga | `loading` | DetalleFacturaCompra.tsx:324-351 |
| 2 | estado | «Factura no encontrada» / «La factura solicitada no existe o ha sido eliminada.» + «Volver a Facturas» (ArrowLeft, outline) | Sin datos | `!factura` | DetalleFacturaCompra.tsx:353-373 |
| 3 | botón | «Volver» (ArrowLeft, ghost) | Vuelve a la lista | Siempre | DetalleFacturaCompra.tsx:382-389 |
| 4 | texto | «Factura {number_ext}» (h1) / «Detalles de la factura de compra» | Cabecera | Siempre | DetalleFacturaCompra.tsx:391-396 |
| 5 | botón | «Imprimir» (Printer, `title="Imprimir factura"`) | `handleImprimir()` | Siempre | DetalleFacturaCompra.tsx:402-411 |
| 6 | botón | «PDF» (Download, `title="Descargar PDF"`) | `PDFService.downloadPurchaseInvoicePDF` | Siempre | DetalleFacturaCompra.tsx:413-422, 277 |
| 7 | toast | «PDF Generado» / «La factura de compra {number_ext} está lista para descargar.» | — | — | DetalleFacturaCompra.tsx:278 |
| 8 | botón | «Recepcionar Inventario» / «Recepcionando...» (Package o Loader2, borde verde) | Entrada a inventario | Estados `draft`/`confirmed`/`partial` — **`'confirmed'` no existe en el tipo ni en el CHECK** (§H) | DetalleFacturaCompra.tsx:424-444 |
| 9 | badge | «Inventario Recibido» (CheckCircle, borde verde) | Marca de recepción | Solo `received` | DetalleFacturaCompra.tsx:446-451 |
| 10 | botón | «Registrar Pago» (CreditCard, outline) | Abre `RegistrarPagoModal` | `balance>0` y estado `confirmed`/`received`/`partial` | DetalleFacturaCompra.tsx:453-463 |
| 11 | botón | «Registrar Pago» (borde **punteado**, `title="Registrar Pago (Factura en Borrador)"`) | **Duplicado del #10**; el comentario del código lo llama «Botón temporal … (para testing)» y está en producción | `balance>0` y `draft` | DetalleFacturaCompra.tsx:465-477 |
| 12 | botón | «Confirmar Factura» (Send, azul) | `confirmarFactura`; el fallo sale por **`window.alert`** «Error al confirmar la factura: {mensaje}» | Solo `draft` | DetalleFacturaCompra.tsx:479-487, 281-297 |
| 13 | botón | «Editar» (Edit, gris) | `{basePath}/{id}/editar` | Solo `draft` | DetalleFacturaCompra.tsx:488-495 |
| 14 | botón | «Anular» (Ban, borde rojo, `title="Anular factura"`) | Abre `AnularFacturaCompraDialog` | Si estado ∉ {void, paid} | DetalleFacturaCompra.tsx:499-510 |
| 15 | texto | «Información de la Factura» + badge de estado | Sección | Siempre | DetalleFacturaCompra.tsx:520-523, 299-315 |
| 16 | texto | «Número» (FileText) · «Fecha Emisión» (Calendar) · «Vencimiento» (Clock) · «Moneda» (DollarSign); «-» si faltan | Datos básicos | Siempre | DetalleFacturaCompra.tsx:526-580 |
| 17 | badge | «{n}d» / «{n}d vencida» (rojo si vencida, amarillo si ≤7 días, gris si no) | Días a vencimiento | Si hay saldo | DetalleFacturaCompra.tsx:553-568 |
| 18 | texto | «Notas» + separador | — | Si hay notas | DetalleFacturaCompra.tsx:582-590 |
| 19 | columna | «Items de la Factura»: «Descripción» · «Cant.» · «P. Unit.» (`hidden sm`) · «Desc.» (`hidden md`) · «Imp.» (`hidden lg`) · «Total» | 6 columnas | Siempre | DetalleFacturaCompra.tsx:595-661 |
| 20 | texto | «SKU: {sku}» sobre la descripción + chips de serial (`Badge outline`, `font-mono`) | — | Si los hay | DetalleFacturaCompra.tsx:620-636 |
| 21 | texto | «Cuenta por Pagar» (CreditCard) | Sección | Siempre | `id/CuentaPorPagarInfo.tsx:46-49, 66-69, 135-138` |
| 22 | estado | «No se encontró información de cuenta por pagar» | Sin cartera asociada | — | CuentaPorPagarInfo.tsx:73-75 |
| 23 | badge | «Pagada» verde (CheckCircle) · «Pendiente» secondary · «Vencida» destructive (AlertTriangle) · «Parcial» outline amarillo | Estado de la cuenta | Con cartera | CuentaPorPagarInfo.tsx:84-108 |
| 24 | texto | «Monto Original» · «Saldo Pendiente» · «Fecha de Vencimiento» · «Monto Pagado» · «Progreso de Pago» (barra) | Datos de cartera | Con cartera | CuentaPorPagarInfo.tsx:146-207 |
| 25 | columna | «Historial de Pagos»: «Fecha» · «Método» (`hidden sm`) · «Referencia» (`hidden md`) · «Monto» · «Estado» | 5 columnas | Siempre | `id/HistorialPagos.tsx:48-51, 142-145, 186-190` |
| 26 | badge | «Completado» · «Pendiente» · «Fallido» | Estado del pago | Por fila | HistorialPagos.tsx:108, 115, 122 |
| 27 | texto | «Proveedor» (Building2) · nombre · «NIT: {nit}» (IdCard) · contacto / teléfono / email | Ficha lateral | Si hay proveedor | `id/InfoProveedorFactura.tsx:28-77` |
| 28 | botón | «Ver Perfil del Proveedor» (ExternalLink, outline, ancho completo) | `/app/inventario/proveedores/{uuid}` | Si el proveedor tiene `uuid` | InfoProveedorFactura.tsx:81-92 |
| 29 | texto | «Vendedor y Comisión» (User) · «Vendedor:» · «Comisión:» · «Comisión calculada:» | Comisión de compra | Si hay vendedor y comisión >0 | DetalleFacturaCompra.tsx:683-723 |
| 30 | cálculo | «Totales»: «Subtotal:» · «{impuesto} ({tasa}%)» · «Total impuestos:» · «Impuestos:» · «Total:» · «Balance:» (rojo) | Resumen lateral | Siempre | `id/ResumenTotalesFactura.tsx:117-188` |
| 31 | diálogo | «Registrar Pago» (CreditCard) / «Factura: **{number_ext}** - {proveedor}» | Pago a proveedor | `showPagoModal` | `facturas-compra/RegistrarPagoModal.tsx:214-220` |
| 32 | texto | «Balance pendiente:» (caja azul) | Saldo | En el diálogo | RegistrarPagoModal.tsx:225-232 |
| 33 | campo | «Monto del Pago *» (placeholder «0.00») | Valida contra el balance | En el diálogo | RegistrarPagoModal.tsx:235-249 |
| 34 | estado | «El monto ({x}) excede el balance pendiente ({y})» (Alert rojo) | Monto excedido | — | RegistrarPagoModal.tsx:250-260 |
| 35 | campo | «Método de Pago *» (placeholder «Seleccionar método...») | Métodos de la organización | En el diálogo | RegistrarPagoModal.tsx:264-283 |
| 36 | campo | «Referencia *» (placeholder «Número de transacción, cheque, etc.») | Condicional a `requires_reference` | Si aplica | RegistrarPagoModal.tsx:286-299 |
| 37 | campo | «Fecha de Pago *» (`max` hoy, `min` fecha de emisión) + «La fecha no puede ser anterior a la emisión de la factura» | — | En el diálogo | RegistrarPagoModal.tsx:302-323 |
| 38 | campo | «Notas» (`RichTextEditor`, placeholder «Notas adicionales sobre el pago...», `minHeight=60`) | Notas del pago | En el diálogo | RegistrarPagoModal.tsx:327-338 |
| 39 | botón | «Cancelar» / «Registrar Pago» / «Registrando...» (azul) | `FacturasCompraService.registrarPago` | En el diálogo | RegistrarPagoModal.tsx:341-366 |
| 40 | diálogo | **Seis validaciones con `window.alert`, sin un solo toast**: «El monto debe ser mayor a 0» · «El monto no puede exceder el balance pendiente» · «La referencia es requerida para este método de pago» · «La fecha de pago no puede ser anterior a la fecha de emisión ({fecha})» · «Seleccione una sucursal antes de registrar el pago.» · el error del servidor | Al enviar | — | RegistrarPagoModal.tsx:148, 153, 158, 166, 175, 197 |
| 41 | diálogo | «Anular Factura {number_ext}» / «Esta acción marca la factura como anulada, reversa el inventario recibido y salda la cuenta por pagar. No se puede deshacer.» | Anulación | `showAnularModal` | `id/AnularFacturaCompraDialog.tsx:85-87` |
| 42 | estado | «La factura ya tiene pagos registrados ({monto}). No puede anularse.» (caja amarilla) | Bloqueo | Si hay pagos | AnularFacturaCompraDialog.tsx:91-95 |
| 43 | campo | «Motivo de la anulación» (placeholder «Explica por qué se anula esta factura...», rows=3) | Motivo | En el diálogo | AnularFacturaCompraDialog.tsx:97-109 |
| 44 | botón | «Cancelar» / «Anular Factura» (destructive) | Anula, reversa inventario y salda cartera | En el diálogo | AnularFacturaCompraDialog.tsx:113-124 |

Layout de tres columnas `grid-cols-1 sm:grid-cols-2 md:grid-cols-3`; **el `lg:col-span-2` de la columna principal no tiene efecto** porque la rejilla se define hasta `md`, así que en `md` la maquetación queda descompensada. **No existe**: envío a la DIAN (las compras usan documentos soporte, pantalla aparte), envío por email/WhatsApp, duplicar, ni «Marcar pagada» directa.

### B.7 Nueva / editar factura de compra `/app/finanzas/facturas-compra/nuevo` y `/[id]/editar` — `facturas-compra/nueva-factura/NuevaFacturaForm.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | «Volver» (ArrowLeft, ghost; texto `hidden sm:inline`) | Abre la confirmación de salida | Siempre | NuevaFacturaForm.tsx:545-552 |
| 2 | texto | «Nueva Factura de Compra» / «Editar Factura de Compra» (h1) + «Registre una nueva factura de proveedor» / «Modificar los datos de la factura» | Cabecera | Siempre | NuevaFacturaForm.tsx:554-559 |
| 3 | botón | «Cancelar» / «Guardar Factura» — **barra de acciones duplicada arriba (`hidden sm:block`) y abajo** | Acciones | Siempre | NuevaFacturaForm.tsx:563-570, 740-748 · `FormActions.tsx:20-51` |
| 4 | campo | `BranchSelectorField` (required) | Sucursal | Siempre | NuevaFacturaForm.tsx:574-579 |
| 5 | texto | «Información Básica» | Sección | Siempre | `InformacionBasicaForm.tsx:203` |
| 6 | campo | «Proveedor *» (placeholder «Seleccionar proveedor...»; búsqueda «Buscar proveedor...») | Selector con debounce 300 ms, `.limit(50)` y fallback en memoria | Siempre | InformacionBasicaForm.tsx:207-218 · `SupplierSelector.tsx:178, 186, 81-87, 106-111` |
| 7 | texto | «Contacto:» / «Teléfono:» / «Email:» / «Notas:» | Ficha del proveedor elegido | Si hay proveedor | SupplierSelector.tsx:275-302 |
| 8 | campo | «Número de Factura *» (placeholder «Ej: COMP-2024-0001») | Verifica duplicados contra `invoice_purchase` | Siempre | InformacionBasicaForm.tsx:222-235, 143-165 |
| 9 | botón | (RefreshCw, `title="Generar número automáticamente"`) | Genera `COMP-{año}-{0000}` | Siempre | InformacionBasicaForm.tsx:236-246, 101-140 |
| 10 | texto | «Este número de factura ya existe» | Duplicado | Al escribir | InformacionBasicaForm.tsx:181, 248-252 |
| 11 | campo | «Moneda *» (placeholder «Seleccionar moneda»; «{código} - {nombre} (Base) {símbolo}») | Monedas de la organización | Siempre | InformacionBasicaForm.tsx:255-280 |
| 12 | campo | «Fecha de Emisión *» | Recalcula el vencimiento | Siempre | InformacionBasicaForm.tsx:285-299 |
| 13 | campo | «Términos de Pago» (placeholder «Seleccionar términos»): «Contado» · «15 días» · «30 días» · «45 días» · «60 días» · «90 días» · «Personalizado» | Calcula el vencimiento | Siempre | InformacionBasicaForm.tsx:301-326 |
| 14 | campo | Input + «días» | Días personalizados | Si «Personalizado» | InformacionBasicaForm.tsx:328-339 |
| 15 | campo | «Fecha de Vencimiento» | Editable | Siempre | InformacionBasicaForm.tsx:343-354 |
| 16 | campo | «Notas adicionales» (placeholder «Términos especiales, condiciones, etc.», rows=3) | — | Siempre | InformacionBasicaForm.tsx:357-370 |
| 17 | texto | «Productos para Factura de Compra» (ListChecks) + badge «{n} producto» / «{n} productos» | Sección de ítems | Siempre | `ItemsListForm.tsx:228-237` |
| 18 | botón | «Agregar Item Manual» / «Item Manual» (móvil) — PlusCircle, borde punteado azul | Abre `ManualItemDialog` | Siempre | ItemsListForm.tsx:238-241 |
| 19 | diálogo | «Agregar Item Manual» (FileText) / «Agregue un item personalizado que no está en el catálogo de productos» | Alta de línea libre | Tras #18 | `ManualItemDialog.tsx:107-116` |
| 20 | campo | «Descripción del Item *» (placeholder «Ej: Servicio de consultoría, Material especial, etc.») | — | En el diálogo | ManualItemDialog.tsx:120-134 |
| 21 | campo | «Costo Unitario *» (placeholder «0.00») · «Tasa de Impuesto (%)» (placeholder «0.0») | — | En el diálogo | ManualItemDialog.tsx:138-175 |
| 22 | campo | «Notas Adicionales» (placeholder «Información adicional sobre el item (opcional)») | **Se captura y no se envía**: `onItemAdd` solo recibe `description`, `cost` y `tax_rate` | En el diálogo | ManualItemDialog.tsx:179-190, 74-78 |
| 23 | texto | «El costo debe ser mayor a 0» · «La tasa de impuesto debe estar entre 0 y 100%» | Validación | Al enviar | ManualItemDialog.tsx:60, 64 |
| 24 | badge | «Vista Previa» (outline) + descripción, coste en verde y badge «{tasa}%» | Previsualización de la línea | Con descripción y coste >0 | ManualItemDialog.tsx:193-215 |
| 25 | botón | «Cancelar» / «Agregar Item» (PlusCircle, azul) | Añade la línea | En el diálogo | ManualItemDialog.tsx:218-236 |
| 26 | diálogo | `ProductSearchDialog` en modo `purchase` (con `supplierId`) | Buscador del catálogo | Siempre | ItemsListForm.tsx:242-249 |
| 27 | estado | «No hay productos seleccionados» / «Use el buscador para agregar productos del catálogo» / «Los productos agregados aparecerán aquí con sus costos y cantidades» | Vacío | — | `SelectedProductsTable.tsx:60-68` |
| 28 | texto | «Productos Seleccionados ({n})» + badge «Total: {importe}» | Cabecera de las líneas | Con líneas | SelectedProductsTable.tsx:77-86 |
| 29 | badge | **«📄 Manual»** (azul, con emoji en lugar de icono del kit) o «{SKU}» (outline) + «{tasa}%» | Origen de la línea | Por línea | SelectedProductsTable.tsx:104-117 |
| 30 | botón | (Trash2, destructive, `title="Eliminar"`) | Quita la línea | Por línea | SelectedProductsTable.tsx:119-129 |
| 31 | campo | «Descripción…» (placeholder «Descripción del producto en la factura») · «Cantidad» · «Costo unitario» · «Descuento» (placeholder «0») + «Total Línea» | **Las líneas son tarjetas, no una tabla** | Por línea | SelectedProductsTable.tsx:136-231 |
| 32 | texto | «Impuestos» (Calculator) + botón «Configurar» (Settings + ChevronDown) → `Popover` «Configuración de Impuestos» | Sección de impuestos | Si hay impuestos | `ImpuestosFacturaCompra.tsx:188-204` |
| 33 | toggle | checkbox «Impuestos incluidos en el precio» · checkbox por impuesto en «Impuestos Aplicables:» → «{nombre}» + badge «{tasa}%» | Propaga a las líneas | En el popover | ImpuestosFacturaCompra.tsx:207-245 |
| 34 | badge | «Estado:» → «Incluidos» / «No incluidos» · «{n} impuesto(s) aplicado(s):» — **nunca muestra el importe del impuesto** | Resumen | Siempre | ImpuestosFacturaCompra.tsx:256-270 |
| 35 | texto | «Comisión (opcional)» (h3, User) + «Comisionista» (placeholder «Seleccionar comisionista»; búsqueda «Buscar comisionista...»; «Sin asignar») | Sección | Siempre | NuevaFacturaForm.tsx:624-643 |
| 36 | campo | «Comisión» (prefijo Percent/DollarSign, placeholder «0») + toggle «Porcentaje» / «Monto Fijo» | — | Siempre | NuevaFacturaForm.tsx:644-699 |
| 37 | texto | «El porcentaje no puede superar 100%» / «El monto supera el total de la factura» + «Comisión estimada ({x}% \| {monto}):» (caja azul) | Validación y estimación | — | NuevaFacturaForm.tsx:700-727 |
| 38 | cálculo | «Resumen» + badge «Imp. incluidos» / «Imp. agregados» · «Subtotal:» · «{nombre} ({tasa}%):» · «Total impuestos:» · «Total final:» | Totales | Siempre | `ResumenFactura.tsx:44-96` |
| 39 | estado | «Sin impuestos aplicados» | `taxTotal === 0` | — | ResumenFactura.tsx:98-105 |
| 40 | botón | «Cancelar» (ArrowLeft) / «Guardar Factura» / «Actualizar Factura» / «Guardando...» / «Actualizando...» (Save, azul) | Envío | Siempre | FormActions.tsx:22-50 |
| 41 | diálogo | «¿Cancelar la factura?» / «Se perderán todos los cambios no guardados. Esta acción no se puede deshacer.» · «Seguir editando» / «Sí, cancelar» | **Confirmación de salida del kit** (la venta no la tiene) | Al cancelar | NuevaFacturaForm.tsx:752-767 |
| 42 | estado | Skeletons de cabecera y dos tarjetas | Carga en modo edición | `loading` | `editar/EditarFacturaCompra.tsx:88-130` |
| 43 | estado | `Alert` destructivo + «La factura no puede ser editada en su estado actual.» / «No se pudo cargar la información de la factura.» | Error | — | EditarFacturaCompra.tsx:133-146 |
| 44 | botón | «Intentar de nuevo» / «Volver a lista» — **son `<button>` con clases sueltas, no el componente `Button`** | Recuperación | En error | EditarFacturaCompra.tsx:148-160 |
| 45 | toast | «Factura actualizada» / «La factura de compra se ha actualizado correctamente.» · «Error al actualizar» / mensaje del error | — | — | EditarFacturaCompra.tsx:72, 81 |

Las líneas de ítems **no son una tabla** sino una tarjeta por producto: ocupa mucho vertical pero funciona mejor en móvil que la de venta. `/[id]/editar` reutiliza el formulario con `esEdicion`, **sin cabecera propia** (a diferencia de la venta, que sí la tiene). **No existe**: captura de seriales en la compra (sí existe en venta), toggle de facturación electrónica, ni vista previa del documento.

### B.8 Notas de crédito (lista) `/app/finanzas/notas-credito` — `components/finanzas/notas-credito/NotasCreditoPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(3)` | Carga | `isLoading` | NotasCreditoPage.tsx:177-185 |
| 2 | botón | (icono ArrowLeft, ghost icon) | `Link` a `/app/finanzas` | Siempre | NotasCreditoPage.tsx:192-196 |
| 3 | texto | «Notas de Crédito» (h1, FileText en cuadro azul) / «Gestión de notas crédito emitidas» | Cabecera | Siempre | NotasCreditoPage.tsx:197-206 |
| 4 | botón | «Nueva Nota Crédito» (Plus, azul) | **Navega a `/app/finanzas/facturas-venta`**: no crea nada; hay que entrar a una factura y usar su botón «Nota Crédito» | Siempre | NotasCreditoPage.tsx:210-216 |
| 5 | exportación | «Exportar» (Download, outline) → `notas_credito_{aaaa-mm-dd}.csv` con «Número, Fecha, Cliente, Factura Origen, Total, Estado» | **No escapa comas ni comillas**: un nombre con coma rompe las columnas | Siempre | NotasCreditoPage.tsx:154-175, 217-220 |
| 6 | badge | Sucursal activa (`BranchBadge`) | **Decorativo: la consulta no filtra por sucursal** | Siempre | NotasCreditoPage.tsx:223 |
| 7 | stat | «Total Emitido» (azul) · «Este Mes» (verde) · «Total Notas» (gris) · «En Borrador» (amarillo) | **«En Borrador» rotula un campo llamado `pending`** | Siempre | NotasCreditoPage.tsx:227-274 |
| 8 | campo | Placeholder «Buscar por número o notas...» (Search) | Búsqueda **en servidor y sin debounce**: recarga en cada tecla | Siempre | NotasCreditoPage.tsx:279-287, 103-131 |
| 9 | campo | Select «Estado» (Filter): «Todos» · «Borrador» · «Enviada» · «Aceptada» · «Rechazada» · «Anulada» | Filtra por `status` | Siempre | NotasCreditoPage.tsx:288-301 |
| 10 | botón | «Actualizar» (RefreshCw, outline) | `loadData()` | Siempre | NotasCreditoPage.tsx:302-305 |
| 11 | columna | «Número» → `CopyableId` al detalle | — | Siempre | NotasCreditoPage.tsx:314, 333-340 |
| 12 | columna | «Fecha» (Calendar) · «Cliente» (`first_name + last_name`; fallback «Sin cliente»; 2.ª línea con la identificación) | — | Siempre | NotasCreditoPage.tsx:315-316, 341-361 |
| 13 | columna | «Factura Origen» → enlace azul a `/app/finanzas/facturas-venta/{related_invoice_id}`; «-» si no hay | — | Siempre | NotasCreditoPage.tsx:317, 362-373 |
| 14 | columna | «Total» (derecha, rojo) | — | Siempre | NotasCreditoPage.tsx:318, 374-376 |
| 15 | badge | «Borrador» gris · «Pendiente» amarillo · «Enviada» azul · **«Aceptada DIAN»** verde · «Rechazada» rojo · «Anulada» rojo · «Pagada» verde, cada uno con icono | **El badge dice «Aceptada DIAN» y el filtro #9 dice «Aceptada»** | Siempre | NotasCreditoPage.tsx:60-88, 319, 377-382 |
| 16 | menú | (MoreVertical) → «Ver Detalle» (Eye) · «Anular» (XCircle rojo, tras separador) | «Anular» si estado ∉ {void, accepted} | Por fila | NotasCreditoPage.tsx:320, 383-409 |
| 17 | diálogo | **`window.confirm`** «¿Está seguro de anular esta nota de crédito?» + **`window.prompt`** «Motivo de la anulación:» | Anulación con diálogos del navegador | Tras «Anular» | NotasCreditoPage.tsx:138, 140 |
| 18 | toast | «Éxito» / «Nota de crédito anulada correctamente» · «Error» / «Error al anular» · «Error» / «No se pudieron cargar las notas de crédito» | — | — | NotasCreditoPage.tsx:144, 147-150, 123-127 |
| 19 | estado | «No hay notas de crédito registradas» (`colSpan={7}`) | Vacío | — | NotasCreditoPage.tsx:324-329 |

Internamente son filas de `invoice_sales` con totales negativos. **No existe**: **paginación** (se carga y pinta todo el resultado), ruta `/nuevo`, edición, descarga de PDF/XML desde la lista, filtro por sucursal real, ni columna de estado DIAN.

### B.9 Detalle de nota de crédito `/app/finanzas/notas-credito/[id]` — `notas-credito/NotaCreditoDetalle.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `DetailSkeleton` | Carga | `isLoading` | NotaCreditoDetalle.tsx:204-210 |
| 2 | estado | «Nota de crédito no encontrada» + «Volver al listado» | Sin datos | `!nota` | NotaCreditoDetalle.tsx:212-223 |
| 3 | botón | (icono ArrowLeft, ghost icon) | `Link` al listado | Siempre | NotaCreditoDetalle.tsx:230-234 |
| 4 | texto | «NC {number}» (h1, FileText en cuadro azul) + «Emitida el {fecha}» | Cabecera | Siempre | NotaCreditoDetalle.tsx:240-249 |
| 5 | badge | «Borrador» · «Pendiente» · «Enviada» · «Aceptada DIAN» · «Rechazada» · «Anulada» · «Pagada» | Estado | Siempre | NotaCreditoDetalle.tsx:46-62, 243-245 |
| 6 | botón | «Descargar PDF» (Download, outline) | **No descarga nada**: solo lanza el toast «Descarga» / «Generando PDF...» (el código dice «Aquí iría la lógica de descarga de PDF») | Siempre | NotaCreditoDetalle.tsx:199-202, 253-256 |
| 7 | botón | «Enviar a DIAN» (FileCheck o Loader2, azul) | `sendToFactus(nota.id, orgId, motivo)` | Estado ∉ {void, accepted} y sin job o job fallido | NotaCreditoDetalle.tsx:257-272, 172-197 |
| 8 | botón | «Reintentar DIAN» (RefreshCw, outline) | `retryDianSubmission` | Si hay job `rejected`/`failed` | NotaCreditoDetalle.tsx:273-288, 154-170 |
| 9 | botón | «Anular» (XCircle, destructive) | `confirm()` + `prompt()` nativos | Estado ∉ {void, accepted} | NotaCreditoDetalle.tsx:289-294 |
| 10 | toast | «Nota de crédito enviada a DIAN» / «CUFE: {16 chars}...» · «Éxito» / «Reintento de envío programado» · «Error» / «No se pudo determinar la organización» · «Error al enviar a DIAN» · «Error al reintentar» · «Error al anular» | — | — | NotaCreditoDetalle.tsx:184-187, 160, 150, 166, 176, 193 |
| 11 | texto | «Factura de Origen» (FileCheck) · «Número de Factura» · «Total Factura» + botón «Ver Factura» (ExternalLink, outline) | Tarjeta de la factura relacionada | Si hay `related_invoice` | NotaCreditoDetalle.tsx:302-329 |
| 12 | columna | «Detalle de Items» — **reutiliza `ItemsDetalle` de facturas de venta**: «#» · «Descripción» · «Cant.» · «Precio Unit.» · «Desc.» · «Impuesto» · «Total» | 7 columnas | Siempre | NotaCreditoDetalle.tsx:336-344 |
| 13 | cálculo | **«Subtotal»** (sin dos puntos, a diferencia de todos los demás documentos) | — | Siempre | NotaCreditoDetalle.tsx:348-351 |
| 14 | cálculo | «{nombre impuesto} (incl.)» / «(+imp.)» → «-{importe}»; si no hay grupos, «Impuestos (incluidos)» / «Impuestos (adicionales)» | Desglose agrupado **por tasa**, calculado en cliente (§G) | Si `tax_total ≠ 0` | NotaCreditoDetalle.tsx:352-396 |
| 15 | cálculo | «Total Nota Crédito» (rojo, grande) | — | Siempre | NotaCreditoDetalle.tsx:398-401 |
| 16 | texto | «Estado Facturación Electrónica» (FileCheck) · «Estado DIAN» + badge («Pendiente» · «Procesando» · «Enviada» · «Aceptada» · «Rechazada» · «Fallida») · «CUFE» | Tarjeta de FE | Si hay job | NotaCreditoDetalle.tsx:66-82, 407-431 |
| 17 | texto | «Historial de Eventos» + lista (Clock, **`event_type` crudo**, mensaje y fecha; `max-h-200px` con scroll) | La cola de FE sí traduce estos tipos; aquí no | Si hay eventos | NotaCreditoDetalle.tsx:433-460 |
| 18 | texto | «Cliente» (User) · nombre · identificación (Hash) · email (Mail); «Sin cliente asignado» | Panel lateral | Siempre | NotaCreditoDetalle.tsx:469-501 |
| 19 | texto | «Información» (FileText) · «Número» · «Fecha Emisión» · «Código Referencia» · «Notas» | Panel lateral | Los dos últimos, si existen | NotaCreditoDetalle.tsx:504-535 |
| 20 | stat | «Total Nota Crédito» sobre degradado rojo (`from-red-500 to-red-600`) + fecha | Tarjeta destacada | Siempre | NotaCreditoDetalle.tsx:538-548 |

Layout `grid lg:grid-cols-3` con dos columnas de contenido y una lateral. **No existe**: edición de la nota, descarga real de PDF/XML (a diferencia del detalle de factura, que sí tiene «PDF DIAN» y «XML DIAN»), ni acción de aplicar el crédito a otra factura.

### B.10 Cotizaciones (lista) `/app/finanzas/cotizaciones` — `components/finanzas/cotizaciones/CotizacionesPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft azul, ghost) | **`router.back()`**: vuelve al historial, no a `/app/finanzas`; con la pestaña recién abierta no va a ninguna parte | Siempre | `cotizaciones/PageHeader.tsx:13-20` |
| 2 | texto | «Cotizaciones» (h1, FileText en cuadro azul) / «Gestiona cotizaciones de ventas» | Cabecera | Siempre | PageHeader.tsx:21-30 |
| 3 | botón | «Nueva Cotización» (Plus, azul; ancho completo en móvil) | `/app/finanzas/cotizaciones/nuevo` | Siempre | PageHeader.tsx:33-39 |
| 4 | badge | Sucursal activa (`BranchBadge`) | Informativo | Siempre | CotizacionesPage.tsx:20 |
| 5 | campo | Placeholder «Buscar por número o cliente...» (Search) | Busca al pulsar Enter o «Filtrar» | Siempre | `CotizacionesFiltros.tsx:38-46` |
| 6 | atajo | `Enter` en el buscador | Ejecuta `handleBuscar()` | Foco en #5 | CotizacionesFiltros.tsx:43 |
| 7 | campo | Select «Estado»: «Todos» · «Borrador» · «Enviada» · «Aceptada» · «Rechazada» · «Vencida» · «Convertida» | **No se aplica hasta pulsar «Filtrar»** | Siempre | CotizacionesFiltros.tsx:47-60 |
| 8 | botón | «Filtrar» (Filter, azul) · «Limpiar» (X, outline) | Aplica / resetea | «Limpiar» solo con filtros activos | CotizacionesFiltros.tsx:61-70 |
| 9 | columna | «Número» (w-120) → `CopyableId` al detalle | — | Siempre | `CotizacionesTable.tsx:131, 147-153` |
| 10 | columna | «Cliente» (`customers.full_name`; «N/A») · «Emisión» (w-100) · «Válida hasta» (w-100) | `dd/mm/aaaa` | Siempre | CotizacionesTable.tsx:132-134, 155-163 |
| 11 | columna | «Total» (w-120, derecha) — `formatCurrency(total)` **sin pasar la moneda** | — | Siempre | CotizacionesTable.tsx:135, 164-166 |
| 12 | badge | «Borrador» gris · «Enviada» azul · «Aceptada» verde · «Rechazada» rojo · «Vencida» naranja · «Convertida» morado | Estado | Siempre | CotizacionesTable.tsx:29-51, 136, 167-171 |
| 13 | botón | Fila completa (`cursor-pointer`) | `/app/finanzas/cotizaciones/{id}` | Siempre | CotizacionesTable.tsx:142-145 |
| 14 | menú | (MoreVertical, w-60) → «Ver detalle» (Eye) · «Editar» (Pencil) · «Duplicar» (Copy) · «Eliminar» (Trash2 rojo) | «Editar» solo `draft`/`sent`; «Eliminar» solo `draft` | Por fila | CotizacionesTable.tsx:137, 172-198 |
| 15 | diálogo | **`window.confirm`** «¿Estás seguro de eliminar esta cotización?» — **tutea, frente al «usted» del resto del módulo** | Confirmación | Tras «Eliminar» | CotizacionesTable.tsx:98 |
| 16 | toast | «Cotización duplicada» / «Nueva cotización {number}» · «Cotización eliminada» (sin descripción) · «Error» / mensaje · «No se pudieron cargar las cotizaciones.» | — | — | CotizacionesTable.tsx:90, 101, 73-77, 93, 103 |
| 17 | estado | 5 `Skeleton` de 12 px | Carga | `loading` | CotizacionesTable.tsx:108-116 |
| 18 | estado | «No hay cotizaciones para mostrar.» | Vacío | — | CotizacionesTable.tsx:118-124 |

`CotizacionesService.listQuotations(...)` sobre `quotations` con `customers` embebido. Una sola `Card` con filtros y tabla; anchos fijos por columna y `overflow-x-auto`. **No existe**: **paginación** ni contador de resultados, KPIs, exportación, columnas de subtotal/impuestos, ni convertir a factura desde la lista.

### B.11 Detalle de cotización `/app/finanzas/cotizaciones/[id]` — `cotizaciones/id/DetalleCotizacion.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `Loader2` centrado a pantalla completa | Carga | `loading` | `app/app/finanzas/cotizaciones/[id]/page.tsx:42-48` |
| 2 | estado | «Cotización no encontrada» / «La cotización que buscas no existe o ha sido eliminada.» (FileQuestion) + «Volver a cotizaciones» | Sin datos | `notFound` | `[id]/page.tsx:50-65` |
| 3 | estado | «Error al cargar» / «Error al cargar la cotización. Verifica tu conexión e inténtalo de nuevo.» (AlertTriangle ámbar) + «Volver a cotizaciones» | Excepción | `error` | `[id]/page.tsx:67-81` |
| 4 | botón | (icono ArrowLeft azul, ghost) | Vuelve al listado | Siempre | DetalleCotizacion.tsx:274-276 |
| 5 | texto | «Cotización {number}» (h1, FileText en cuadro azul) | Título | Siempre | DetalleCotizacion.tsx:277-284 |
| 6 | badge | «Borrador» · «Enviada» · «Aceptada» · «Rechazada» · «Vencida» · «Convertida» | **Mapa de colores copiado literalmente del listado** | Siempre | DetalleCotizacion.tsx:30-52, 285-287 |
| 7 | botón | «Imprimir» (Printer, outline) | `PDFService.printInvoiceHTML` con `status='quotation'` | Siempre | DetalleCotizacion.tsx:292-294, 159-168 |
| 8 | toast | «PDF Generado» / «Cotización {number} lista para imprimir.» | — | — | DetalleCotizacion.tsx:164 |
| 9 | botón | «Email» (Mail o Loader2, outline; deshabilitado sin email del cliente) | **No envía nada**: cambia el estado a `sent` y muestra un toast de éxito | Siempre | DetalleCotizacion.tsx:295-298, 170-186 |
| 10 | toast | «Enviando...» / «Enviando cotización {number} por email» · «Cotización enviada» / «Enviada a {email}» · «Error» / «El cliente no tiene email configurado» | — | — | DetalleCotizacion.tsx:172, 177, 180 |
| 11 | botón | «Editar» (Pencil, outline) | `…/{id}/editar` | Solo `draft` o `sent` | DetalleCotizacion.tsx:266, 299-303 |
| 12 | botón | «Duplicar» (Copy o Loader2, outline) | Duplica y navega a la nueva | Siempre | DetalleCotizacion.tsx:304-307, 253-264 |
| 13 | botón | «Convertir a Factura» (FileCheck2 o Loader2, verde) | Abre la confirmación | Si estado ∉ {converted, rejected} | DetalleCotizacion.tsx:267, 308-313 |
| 14 | diálogo | «¿Convertir a factura de venta?» / «Esta acción creará una factura de venta a partir de la cotización {number}. La cotización quedará marcada como convertida y no podrá editarse.» · «Cancelar» / «Sí, convertir» | `convertToInvoice(...)` | Tras #13 | DetalleCotizacion.tsx:317-335 |
| 15 | toast | «Factura creada» / «La cotización fue convertida a factura exitosamente» · «Error» / «No hay sucursal configurada» | — | — | DetalleCotizacion.tsx:235, 242, 231 |
| 16 | texto | «Cliente» (h3 en mayúsculas) · avatar o inicial · nombre · «NIT/CC: {x}» · «Tel: {x}» · email | Tarjeta de cliente | Siempre | DetalleCotizacion.tsx:339-366 |
| 17 | texto | «Detalles» (h3) · «Fecha de emisión:» · «Válida hasta:» · «Moneda:» · «Plazo de pago:» ({n} días, 30 por defecto) | Tarjeta de detalles | Siempre | DetalleCotizacion.tsx:367-387 |
| 18 | columna | «Items»: «Descripción» · «Cant.» · «Precio Unit.» · «Descuento» · **«IVA»** · «Total» | Descripción renderizada como HTML; **la columna se llama «IVA» aunque el impuesto puede no serlo** (§G) | Siempre | DetalleCotizacion.tsx:391-424, 401 |
| 19 | texto | «{tasa}%» / «{tasa}% (incl.)» / «-» | Celda de impuesto | Por fila | DetalleCotizacion.tsx:416-418 |
| 20 | cálculo | «Subtotal:» · «Descuentos:» (rojo con «- ») · «Impuestos:» · «Total:» (azul, negrita) | **Cuarta variante de etiquetas de totales del módulo** | «Descuentos» solo si >0 | DetalleCotizacion.tsx:427-448 |
| 21 | texto | «Términos y Condiciones» (h3) · «Notas Internas» (h3) | Bloques HTML | Si existen | DetalleCotizacion.tsx:454-469 |
| 22 | texto | «Factura de Venta Relacionada» (h3) · número · «Creada a partir de esta cotización» + botón «Ver factura» (ExternalLink, outline) | Tarjeta final | `status === 'converted'` | DetalleCotizacion.tsx:475-501 |
| 23 | texto | «Cambiar Estado» (h3) | Tarjeta final | Si no está convertida | DetalleCotizacion.tsx:506-508 |
| 24 | botón | «Marcar como Enviada» (Send, outline) | `changeStatus('sent')` | Solo `draft` | DetalleCotizacion.tsx:510-514 |
| 25 | botón | «Marcar Aceptada» (FileCheck2, verde) | `changeStatus('accepted')` | `sent` o `draft` | DetalleCotizacion.tsx:515-519 |
| 26 | botón | «Rechazar» (rojo, **sin icono**, a diferencia del resto) | `changeStatus('rejected')` | `sent` o `draft` | DetalleCotizacion.tsx:520-524 |
| 27 | toast | «Estado actualizado» / «Cotización marcada como enviada» · «Cotización aceptada» / «La cotización fue marcada como aceptada» · «Cotización rechazada» (info, sin descripción) | — | — | DetalleCotizacion.tsx:192, 202, 212 |

Fechas con `date-fns` en formato `PPP` en español (`:102-109`): **quinta convención de fecha del módulo**. Layout de una columna con rejillas `md:grid-cols-2`. **No existe**: anulación, envío real por email o WhatsApp, badge de facturación electrónica (las cotizaciones no van a la DIAN), ni historial de cambios de estado.

### B.12 Nueva / editar cotización `/app/finanzas/cotizaciones/nuevo` y `/[id]/editar` — `cotizaciones/nueva-cotizacion/NuevaCotizacionForm.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `Loader2` centrado (`min-h-400px`) | Carga en modo edición | `loading` | NuevaCotizacionForm.tsx:316-322 |
| 2 | botón | (icono ArrowLeft azul, ghost) | `router.back()` | Siempre | `nueva-cotizacion/PageBackHeader.tsx:13-20` |
| 3 | texto | «Nueva Cotización» / «Editar Cotización» (h1, FileText) | Título según modo | Siempre | PageBackHeader.tsx:24-26 · NuevaCotizacionForm.tsx:326 |
| 4 | texto | «Información General» (h2) | Sección | Siempre | NuevaCotizacionForm.tsx:331-333 |
| 5 | campo | `BranchSelectorField` (required) · «Cliente» → `ClienteSelector` (ver B.3 #11-#16) | Sucursal y cliente | Siempre | NuevaCotizacionForm.tsx:334-341 |
| 6 | campo | «Fecha de Emisión» · «Válida hasta» (`type=date`) | — | Siempre | NuevaCotizacionForm.tsx:343-360 |
| 7 | campo | «Moneda»: «COP - Peso Colombiano» · «USD - Dólar» · «EUR - Euro» | **Lista cableada**: no consulta `organization_currencies`, al contrario que los demás formularios | Siempre | NuevaCotizacionForm.tsx:364-376 |
| 8 | campo | «Vendedor» (placeholder «Sin asignar»; búsqueda «Buscar vendedor...» con `autoFocus`; opción «Sin asignar») | Miembros de la organización | Siempre | NuevaCotizacionForm.tsx:377-407 |
| 9 | estado | «No se pudieron cargar los vendedores: {error}» (`role="alert"`, rojo) | Fallo al cargar miembros | `salespeopleError` | NuevaCotizacionForm.tsx:396-400 |
| 10 | campo | «Plazo de pago (días)» (30 por defecto) | — | Siempre | NuevaCotizacionForm.tsx:408-416 |
| 11 | campo | «Oportunidad (opcional)» (placeholder «Sin oportunidad asociada») + «Al seleccionar una oportunidad, se cargan sus productos y se asocia la cotización a ella.» | **Las líneas importadas nacen con `tax_rate: 0`** (§G) | Si hay oportunidades | NuevaCotizacionForm.tsx:418-440, 152-163 |
| 12 | texto | «Items de la Cotización» (h2) | Sección | Siempre | NuevaCotizacionForm.tsx:445-447 |
| 13 | tabla | `ItemsFactura` reutilizado — ver B.3 #20-#31 | Líneas | Siempre | NuevaCotizacionForm.tsx:448-455 |
| 14 | texto | «Impuestos y Totales» (h2) + `ImpuestosFactura` reutilizado — ver B.3 #42-#48 | Impuestos | Si hay `organizationId` | NuevaCotizacionForm.tsx:460-484 |
| 15 | cálculo | «Subtotal:» · «Impuestos:» · «Total:» (azul) | **Segundo bloque de totales: duplica el que ya pinta `ImpuestosFactura`** | Siempre | NuevaCotizacionForm.tsx:485-500 |
| 16 | texto | «Forma de Pago» (h2) + `FormaPagoSelector` | Método de pago | Siempre | NuevaCotizacionForm.tsx:504-509 |
| 17 | campo | «Notas internas (no visibles en PDF)» (`RichTextEditor`, placeholder «Notas internas para el equipo...», `minHeight=80`) | — | Siempre | NuevaCotizacionForm.tsx:517-526 |
| 18 | campo | «Términos y condiciones (visibles en PDF)» (`RichTextEditor`, placeholder «Términos y condiciones de la cotización...», `minHeight=100`) | — | Siempre | NuevaCotizacionForm.tsx:527-536 |
| 19 | botón | «Cancelar» (outline) | `router.back()` — **sin confirmación de cambios sin guardar** | Siempre | NuevaCotizacionForm.tsx:542-544 |
| 20 | botón | «Guardar Cotización» / «Actualizar Cotización» / «Guardando...» (Save o Loader2, azul) | `createQuotation` / `updateQuotation` | Siempre | NuevaCotizacionForm.tsx:545-557 |
| 21 | toast | «Cotización creada» / «Cotización {number} creada exitosamente» · «Cotización actualizada» / «Los cambios se guardaron correctamente» · «Error» / mensaje o «Error al guardar» | — | — | NuevaCotizacionForm.tsx:305, 301, 310 |

Escribe en `quotations` + `quotation_items`. La ruta `/[id]/editar` es un envoltorio de una línea que pasa `mode="edit"` (`cotizaciones/editar/EditarCotizacion.tsx:12`), **sin estados de carga ni de error propios**. Layout `max-w-5xl mx-auto`. **No existe**: número editable ni botón de consecutivo (lo asigna el servicio), previsualización del PDF, ni aviso de salida con cambios pendientes.

### B.13 Documentos soporte (lista) `/app/finanzas/documentos-soporte` — `documentos-soporte/SupportDocumentsPage.tsx`

**Identidad visual morada**, distinta del azul del resto del bloque.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft, `Link` con `p-2 rounded-lg`) | `Link` a `/app/finanzas` | Siempre | SupportDocumentsPage.tsx:143-148 |
| 2 | texto | «Documentos Soporte» (h1, FileCheck2 en cuadro **morado**) / «Finanzas / Documentos Soporte Electrónicos DIAN» | Cabecera | Siempre | SupportDocumentsPage.tsx:149-158 |
| 3 | botón | «Actualizar» (RefreshCw, outline h-9) | Recarga documentos y estadísticas | Siempre | SupportDocumentsPage.tsx:163-172 |
| 4 | botón | «Nuevo Documento» (Plus, **morado** `bg-purple-600`) | `/documentos-soporte/nuevo` | Siempre | SupportDocumentsPage.tsx:173-178 |
| 5 | stat | «Total» (FileText azul) · «Borradores» (Clock amarillo) · «Aceptados DIAN» (CheckCircle2 verde) · «Fallidos» (XCircle rojo) | 4 KPIs | Siempre | SupportDocumentsPage.tsx:184-207 |
| 6 | campo | Placeholder «Buscar por referencia, número o proveedor...» (Search) | **Filtra solo la página cargada**, en cliente | Siempre | SupportDocumentsPage.tsx:214-222, 129-136 |
| 7 | campo | Select «Estado»: «Todos los estados» · «Borrador» · «Pendiente» · «Procesando» · «Enviado» · «Aceptado» · «Rechazado» · «Fallido» · «Cancelado» | Filtra **en servidor** y vuelve a la página 1 | Siempre | SupportDocumentsPage.tsx:30-40, 223-234 |
| 8 | botón | «Limpiar» (ghost) | Resetea estado, búsqueda y página | Con filtro o búsqueda | SupportDocumentsPage.tsx:235-239 |
| 9 | columna | «Referencia» (`reference_code` + «No. {number}» si hay número DIAN) | — | Siempre | `SupportDocumentsTable.tsx:85, 105-114` |
| 10 | columna | «Proveedor» (`provider.names` o `supplier.name`; «N/A»; 2.ª línea con la identificación) · «Fecha» · «Total» (derecha, **sin moneda**) | — | Siempre | SupportDocumentsTable.tsx:86-88, 115-130 |
| 11 | badge | «Borrador» gris · «Pendiente» amarillo · «Procesando» azul · «Enviado» **índigo** · «Aceptado» verde · «Rechazado» rojo · «Fallido» rojo · «Cancelado» gris claro | Estado | Siempre | SupportDocumentsTable.tsx:44-56, 89, 131-135 |
| 12 | columna | «CUFE» (12 caracteres + «...» en `font-mono`; «-») · «Acciones» → icono Eye al detalle (**no hay menú «…»**) | — | Siempre | SupportDocumentsTable.tsx:90-91, 136-151 |
| 13 | estado | `TableSkeleton columns={6} rows={5}` — **declara 6 columnas para una tabla de 7** | Carga | `isLoading` | SupportDocumentsTable.tsx:59-61 |
| 14 | estado | «No hay documentos soporte» / «Crea tu primer documento soporte para enviarlo a la DIAN» (FileCheck2) + botón «Crear Documento Soporte» (morado) | Vacío con CTA | — | SupportDocumentsTable.tsx:63-78 |
| 15 | paginación | «Anterior» / «Siguiente» (outline) + «Mostrando {a} - {b} de {c}» | Página fija de 20 | `total > 20` | SupportDocumentsPage.tsx:51, 252-277 |

La lista viene de `GET /api/factus/support-document?...&limit=20`, pero **las estadísticas se consultan directamente a `support_documents` desde el navegador** (`:91-105`): dos caminos de datos para la misma pantalla. **No existe**: `BranchBadge` ni filtro por sucursal (**la única lista del bloque sin ellos**), exportación, acciones en lote, ni columna de factura de compra asociada.

### B.14 Detalle de documento soporte `/app/finanzas/documentos-soporte/[id]` — `documentos-soporte/SupportDocumentDetail.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `Loader2` morado centrado | Carga | `isLoading` | SupportDocumentDetail.tsx:218-224 |
| 2 | toast | «Error» / «Documento no encontrado» + redirección a la lista | No existe o es de otra organización | — | SupportDocumentDetail.tsx:108-112 |
| 3 | botón | (icono ArrowLeft, `Link`) | Vuelve a la lista | Siempre | SupportDocumentDetail.tsx:239-244 |
| 4 | texto | «Documento Soporte» (h1) + «Ref: {reference_code}» + « — No. {number}» | Cabecera | Siempre | SupportDocumentDetail.tsx:246-252 |
| 5 | badge | «Borrador» · «Pendiente» · «Procesando» · «Enviado» · «Aceptado» · «Rechazado» · «Fallido» · «Cancelado» | **Copia literal del mapa del listado** | Siempre | SupportDocumentDetail.tsx:68-77, 256 |
| 6 | estado | «**Error:** {error_message}» (tarjeta roja) | Rechazo o fallo DIAN | Si hay `error_message` | SupportDocumentDetail.tsx:261-269 |
| 7 | texto | «Información General» (Calendar morado) · «Fecha emisión:» · «Hora creación:» · «Validado DIAN:» · «CUFE:» (mono) · «Observación:» | Tarjeta izquierda | Cada fila si el dato existe | SupportDocumentDetail.tsx:273-295 |
| 8 | texto | «Proveedor» (Building2 morado) · «Nombre:» · «Identificación:» · «DV:» · «Dirección:» · «Email:» · «Teléfono:» · «País:» | Tarjeta derecha; «N/A» en nombre e identificación | — | SupportDocumentDetail.tsx:297-313 |
| 9 | columna | «Items» (Hash morado): «Código» · «Descripción» · «Cant.» · «Precio» · «Desc.» · **«IVA»** · «Total» | **Cabecera cableada como «IVA»** (§G) | Siempre | SupportDocumentDetail.tsx:317-362, 333 |
| 10 | texto | «{x}%» o «Excl.» | Celda de impuesto según `is_excluded` | Por fila | SupportDocumentDetail.tsx:353-355 |
| 11 | cálculo | «Subtotal:» · **«IVA:»** · «Total:» (negrita, borde superior) | **Único documento del módulo que rotula el impuesto como «IVA» en los totales** | Siempre | SupportDocumentDetail.tsx:364-380, 372 |
| 12 | botón | «Actualizar» (RefreshCw, outline) | `loadDocument()` | Siempre | SupportDocumentDetail.tsx:386-389 |
| 13 | botón | «Eliminar» (Trash2 o Loader2, outline rojo) | **`window.confirm`** «¿Eliminar este documento soporte? Esta acción no se puede deshacer.» + borrado en Factus y en `support_documents` | Solo `draft`/`failed`/`rejected` | SupportDocumentDetail.tsx:391-405, 181 |
| 14 | toast | «No se puede eliminar» / «Solo se pueden eliminar documentos en borrador, fallidos o rechazados» · «Documento eliminado» (sin descripción) | — | — | SupportDocumentDetail.tsx:173-177, 205 |
| 15 | botón | «PDF» / «XML» (FileDown / FileText o Loader2, outline) | `GET /api/factus/support-document/download?type=…&number=…` → `documento-soporte-{n}.pdf\|xml` | Solo `accepted` con número | SupportDocumentDetail.tsx:409-432, 132-169 |
| 16 | toast | «Sin número» / «El documento no tiene número asignado por DIAN aún» · «Descarga completada» / «Archivo PDF\|XML descargado» | — | — | SupportDocumentDetail.tsx:134-138, 159 |
| 17 | botón | «Enviar a DIAN» (Send o Loader2, **morado**) | `POST /api/factus/support-document` | Solo `draft`/`failed`/`rejected` | SupportDocumentDetail.tsx:436-442 · `SendSupportDocumentButton.tsx:65-78` |
| 18 | toast | «Documento validado por DIAN» / «Documento enviado a DIAN» · «Ref: {reference_code}» · «Error» / «No se pudo enviar el documento a DIAN» | Según `is_validated` | — | SendSupportDocumentButton.tsx:46-58 |

El detalle **no pasa por la API**: consulta `support_documents` e `invoice_items` (por `support_document_id`) directamente desde el cliente (`:101-120`), mientras las descargas y el envío sí van por `/api/factus/support-document`. **No existe**: ruta `/[id]/editar` (**un borrador no se puede corregir: solo borrar y rehacer**), historial de eventos DIAN (sí lo tienen las notas de crédito y la cola de FE), ni enlace a la factura de compra relacionada aunque `invoice_purchase_id` se guarde.

### B.15 Nuevo documento soporte `/app/finanzas/documentos-soporte/nuevo` — `documentos-soporte/SupportDocumentForm.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft, `Link`) | Vuelve a la lista | Siempre | SupportDocumentForm.tsx:415-420 |
| 2 | texto | «Nuevo Documento Soporte» (h1) / «Para compras a proveedores no responsables de IVA» | Cabecera | Siempre | SupportDocumentForm.tsx:422-427 |
| 3 | texto | «Datos Generales» | Sección | Siempre | SupportDocumentForm.tsx:434 |
| 4 | campo | «Código de referencia *» (placeholder «DS-0001») + ayuda «Auto-generado secuencial por organización» | Se autogenera al montar | Siempre | SupportDocumentForm.tsx:437-447, 174-177 |
| 5 | campo | «Fecha de emisión *» · «Hora de creación» (`type=time step=1`) | La hora la exige la DIAN | Siempre | SupportDocumentForm.tsx:448-464 |
| 6 | campo | «Moneda *» (placeholder «Seleccionar moneda»; «{nombre} (base)») | De `organization_currencies` | Siempre | SupportDocumentForm.tsx:465-486 |
| 7 | estado | «Cargando...» / «Sin monedas configuradas» (ítems deshabilitados) | Sin monedas | — | SupportDocumentForm.tsx:472-475 |
| 8 | campo | «Forma de pago *»: «Contado» / «Crédito» | Códigos DIAN 1 y 2 | Siempre | SupportDocumentForm.tsx:38-41, 487-501 |
| 9 | campo | «Fecha de vencimiento *» | Solo para crédito | `paymentForm === '2'` | SupportDocumentForm.tsx:502-511 |
| 10 | campo | «Método de pago *» → `FormaPagoSelector`, cuya etiqueta interna dice **«Forma de Pago»**: **doble etiqueta contradictoria** | Método de pago | Siempre | SupportDocumentForm.tsx:512-515 |
| 11 | campo | «Observaciones» (placeholder «Observaciones del documento (máx 500 caracteres)», `maxLength=500`, rows=2) | Observación DIAN | Siempre | SupportDocumentForm.tsx:516-525 |
| 12 | campo | «Factura de compra relacionada (opcional)» (placeholder «Seleccionar factura de compra...»; búsqueda «Buscar por número o proveedor...»; «No se encontraron facturas» / «Cargando facturas...»; «Sin factura de compra») | Vincula a `invoice_purchase` | Siempre | SupportDocumentForm.tsx:252-260, 526-537 |
| 13 | texto | «Proveedor» | Sección | Siempre | SupportDocumentForm.tsx:544 |
| 14 | campo | Placeholder «Seleccionar proveedor...» + búsqueda «Buscar proveedor...» | **Clon de `SupplierSelector`** con `.eq('is_active', true)`, 17 columnas DIAN y sin fallback en memoria | Siempre | `ProviderSelector.tsx:226-282, 86, 116` |
| 15 | estado | «Buscando...» (spinner **morado**) · «Cargando proveedores...» / «No se encontraron proveedores» | — | — | ProviderSelector.tsx:241-254 |
| 16 | texto | «NIT: {nit}» · «• {contacto}» | 2.ª línea de cada opción | Por opción | ProviderSelector.tsx:266-275 |
| 17 | botón | (icono Plus, outline, `title`/`aria-label` «Crear nuevo proveedor») | Abre `ProveedorFormDialog` con los campos fiscales DIAN | Siempre | ProviderSelector.tsx:285-302 |
| 18 | texto | Ficha morada: nombre · «NIT: {nit} - DV: {dv}» · «Nombre comercial: {x}» · «**Contacto:**» · «**Teléfono:**» · «**Email:**» · «**Dirección:**» · «**Municipio DIAN:**» (cada uno con un punto de color) | Resumen del proveedor | Con proveedor | ProviderSelector.tsx:306-384 |
| 19 | texto | «Items del Documento Soporte» (h3) + `ItemsFactura` reutilizado (ver B.3 #20-#31) | Líneas — **nacen con `tax_code: null, tax_rate: 0`** (§G) | Siempre | SupportDocumentForm.tsx:559-569, 142-144 |
| 20 | toggle | `ImpuestosFactura` reutilizado (ver B.3 #42-#48) | Impuestos y totales | Siempre | SupportDocumentForm.tsx:573-583 |
| 21 | botón | «Cancelar» (outline) · «Guardar borrador» (Save o Loader2, outline) · «Guardar y enviar a DIAN» (Send o Loader2, **morado**) | Inserta con `status='draft'`, o guarda y llama a `POST /api/factus/support-document` | Siempre | SupportDocumentForm.tsx:587-616 |
| 22 | toast | «Validación» / «Debe seleccionar un proveedor» · «El proveedor debe tener dirección (requerido por DIAN)» · «Debe agregar al menos un item» · «Todos los items deben tener una descripción» · «Las cantidades deben ser mayores a 0» · «Los precios no pueden ser negativos» · «Debe ingresar fecha de vencimiento para pago a crédito» · «Debe seleccionar un método de pago» | 8 validaciones | Al guardar | SupportDocumentForm.tsx:271-289 |
| 23 | toast | «Borrador guardado» / «Documento soporte {reference_code} guardado correctamente» · «Documento enviado a DIAN» / «Ref: {reference_code} — Validado \| En proceso» · «Error» / mensaje o «Error inesperado» | — | — | SupportDocumentForm.tsx:391-394, 386-389, 400-404 |

Inserta en `support_documents` (con `provider` como JSON y `payment_details` como array) e `invoice_items` con `invoice_type='support_document'`. Reutiliza `ItemsFactura`, `ImpuestosFactura`, `FormaPagoSelector` y `ProveedorFormDialog`. **No existe**: selector de sucursal (**el resto de formularios del bloque sí lo piden**), previsualización del JSON que se enviará a la DIAN, ni modo edición.

### B.16 Facturación electrónica `/app/finanzas/facturacion-electronica` — `app/app/finanzas/facturacion-electronica/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ChevronLeft, `Link` con `p-2 rounded-lg`) | `Link` a `/app/finanzas` | Siempre | page.tsx:239-245 |
| 2 | texto | «Facturación Electrónica» (h1, Zap azul) / «Monitoreo y gestión de facturas electrónicas DIAN» | Cabecera | Siempre | page.tsx:247-253 |
| 3 | botón | «Actualizar» (RefreshCw que gira, outline h-9) | Recarga jobs y estadísticas | Siempre | page.tsx:247-261 |
| 4 | toast | «Actualizado» / «Los datos se han actualizado correctamente» | — | — | page.tsx:132-135 |
| 5 | botón | «Configuración» (Settings, outline) | `Link` a `/facturacion-electronica/configuracion` — **esa ruta no existe** | Siempre | page.tsx:262-267 |
| 6 | botón | «Docs API» (ExternalLink, azul) | Abre `https://developers.factus.com.co` en pestaña nueva — **nombra al proveedor en la UI del cliente** | Siempre | page.tsx:268-276 |
| 7 | stat | «Total Enviados» (Send azul) · «Aceptados» (FileCheck2 verde) · «Rechazados» (FileX2 rojo) · «Pendientes» (Clock amarillo, `pending + processing`) · «Fallidos» (AlertTriangle naranja) · «Tasa de Éxito» (TrendingUp índigo, un decimal) | **6 KPIs** en `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`: en `md` quedan en dos filas de tres | Siempre | `StatsCards.tsx:33-87` · page.tsx:113-115 |
| 8 | estado | `Loader2` dentro de cada tarjeta KPI | Carga | `isLoading` | StatsCards.tsx:107-108 |
| 9 | texto | **«Cola de Facturación Electrónica»** (FileCheck azul) — nombre de infraestructura como título de sección | Sección | Siempre | page.tsx:284-287 |
| 10 | campo | Placeholder «Buscar por número de factura...» (Search) | **Filtra solo la página cargada** por número o CUFE, en cliente | Siempre | `JobFilters.tsx:49-54` · page.tsx:231-238 |
| 11 | campo | Select «Filtrar por estado» (Filter): «Todos los estados» · «Pendiente» · «Procesando» · «Enviado» · «Aceptado» · «Rechazado» · «Fallido» · «Cancelado» | Filtra **en servidor** y vuelve a la página 0 | Siempre | JobFilters.tsx:24-33, 60-71 |
| 12 | botón | «Limpiar» (X, ghost) | Resetea estado, búsqueda y página | Con filtros | JobFilters.tsx:75-85 |
| 13 | columna | «Factura» (`invoice.number` o los 8 primeros del `invoice_id`) · «Cliente» (`company_name` o «{nombre} {apellido}»; «N/A») | — | Siempre | `JobsTable.tsx:123-124, 145-150` |
| 14 | columna | «Tipo»: «Factura» · «Nota Crédito» · «Nota Débito» · «Doc. Soporte» (o el código crudo) | — | Siempre | JobsTable.tsx:79-84, 125, 151-155 |
| 15 | badge | «Pendiente» amarillo · «Procesando» azul · «Enviado» índigo · «Aceptado» verde · «Rechazado» rojo · «Fallido» rojo · «Cancelado» gris | Estado | Siempre | JobsTable.tsx:69-77, 126, 156-160 |
| 16 | columna | «CUFE» (12 caracteres + «...»; «-») · «Intentos» («{attempt_count}/{max_attempts}», rojo al agotarse) · «Fecha» | — | Siempre | JobsTable.tsx:127-129, 161-180 |
| 17 | menú | (MoreVertical) → «Ver detalles» (Eye) · «Descargar PDF» (FileDown) · «Descargar XML» (FileText) · «Reintentar» (RefreshCw) · «Cancelar» (XCircle rojo) | Descargas solo si `accepted` con CUFE; «Reintentar» si `failed`/`rejected` con intentos; «Cancelar» si `pending`/`processing` | Por fila | JobsTable.tsx:130, 181-219 |
| 18 | toast | «Reintento programado» / «El **job** se ha marcado para reintento» · «**Job** cancelado» / «El **job** se ha cancelado correctamente» · «Descarga completada» / «El archivo PDF\|XML se ha descargado» | **«job» en la UI del cliente** | — | page.tsx:151-154, 178-181, 212-215 |
| 19 | toast | «Error» / «No se pudieron cargar los **jobs** de facturación» · «No se pudo programar el reintento» · «No se pudo cancelar el **job**» · «No se pudo descargar el PDF\|XML» / «No hay número de factura disponible» | — | — | page.tsx:77-81, 158-162, 183-186, 217-221 |
| 20 | estado | `TableSkeleton columns={5} rows={5}` — **declara 5 columnas para una tabla de 8** | Carga | `isLoading` | JobsTable.tsx:102-106 |
| 21 | estado | «No hay **jobs** de facturación electrónica» / «Los **jobs** aparecerán aquí cuando envíes facturas a la DIAN» (FileText) | Vacío | — | JobsTable.tsx:108-116 |
| 22 | paginación | «Anterior» / «Siguiente» + «Mostrando {a} - {b} de {c}» | Página fija de 20 | `total > 20` | page.tsx:57, 317-343 |
| 23 | diálogo | «Factura Electrónica» + icono de estado + badge («Aceptada por DIAN» · «Rechazada» · «Fallida» · «Pendiente» · «Procesando» · «Enviada») (`max-w-4xl`, `max-h-95vh`) | Detalle del job | Tras «Ver detalles» | `JobDetailDialog.tsx:44-51, 113-122` |
| 24 | texto | «Factura No.» + número (Receipt en cuadro azul) · «No. DIAN» + consecutivo | Cabecera del diálogo | Siempre / si hay número DIAN | JobDetailDialog.tsx:126-145 |
| 25 | texto | «Cliente» (User) · «Fecha de envío» (Calendar) · «Tipo de documento» (Hash) · «Proveedor» (Building2) · «Intentos» → «{n} de {m}» · «Total» (Receipt); «—» si falta | Rejilla de datos | Siempre | JobDetailDialog.tsx:53-65, 147-156 |
| 26 | texto | «CUFE» + valor completo en caja `font-mono` + botón (icono Copy, ghost h-6) | Copia al portapapeles | Si hay CUFE | JobDetailDialog.tsx:162-177 |
| 27 | toast | «Copiado» / «CUFE copiado al portapapeles» | — | — | JobDetailDialog.tsx:99-102 |
| 28 | texto | «Código QR» (QrCode) + imagen 128×128 (`alt="Código QR DIAN"`) | QR de la DIAN | Si hay `qr_code` | JobDetailDialog.tsx:178-186 |
| 29 | estado | «Error de validación» (AlertTriangle) + «Código: {error_code}» + mensaje (caja roja) | Rechazo | Si hay `error_message` | JobDetailDialog.tsx:191-202 |
| 30 | pestaña | «Datos de la factura validada» (Receipt, **abierta por defecto**): «Número DIAN» (mono) · «Fecha de validación» · «Prefijo» · «Consecutivo» · «Estado DIAN» · «Errores DIAN» | Sección plegable | Si hay `response_payload.data` | JobDetailDialog.tsx:67-86, 205-218 |
| 31 | pestaña | «Historial de eventos» (Clock, abierta por defecto) | Línea de tiempo del job | Siempre | JobDetailDialog.tsx:221-223 |
| 32 | estado | «Validado» · «Enviado» · «Aceptado» · «Rechazado» · «Error» · «Reintento programado» · «Cancelado» · «Creado» + «({event_code})» + mensaje + fecha | **Aquí sí se traducen los `event_type`**, al contrario que en el detalle de nota de crédito | Por evento | `JobEventsTimeline.tsx:22-31, 67-101` |
| 33 | estado | «No hay eventos registrados» | Sin eventos | — | JobEventsTimeline.tsx:61-63 |
| 34 | pestaña | «Datos enviados a **Factus** (JSON)» (Code2, cerrada) → `<pre>` con scroll (máx. 400 px) | **Vuelca JSON crudo y nombra al proveedor** | Si hay `request_payload` | JobDetailDialog.tsx:226-232 |
| 35 | pestaña | «Respuesta de **Factus** (JSON)» (Code2, cerrada) → `<pre>` con scroll | Ídem | Si hay `response_payload` | JobDetailDialog.tsx:235-241 |
| 36 | botón | «Descargar PDF» (FileDown, outline) / «Descargar XML» (FileText, outline) / «Cerrar» (default, ancho completo en móvil) | Pie del diálogo | Descargas solo si `accepted` con CUFE | JobDetailDialog.tsx:104, 245-259 |

Los jobs vienen de `GET /api/factus/jobs?...&limit=20&offset=…`, pero **las estadísticas se leen directamente de `electronic_invoicing_jobs` en el navegador** (`page.tsx:89-124`) y los eventos de `electronic_invoicing_events` también en cliente (`JobEventsTimeline.tsx:39-43`). **No existe**: reintento o cancelación en lote, filtro por rango de fechas o por tipo de documento, enlace desde la fila a la factura de origen, **ninguna cifra de impuesto** (§G.4 #17), ni la pantalla de configuración a la que apunta #5.

---

## C. Cartera y pagos

### C.1 Cuentas por cobrar `/app/finanzas/cuentas-por-cobrar` — `components/finanzas/cuentas-por-cobrar/CuentasPorCobrarPage.tsx`

**La pantalla más grande del módulo**: 4 pestañas, 134 controles, 24 columnas y 18 KPIs.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft 20 px, ghost icon) | `Link` a `/app/finanzas` | Siempre | CuentasPorCobrarPage.tsx:135-139 |
| 2 | texto | «Cuentas por Cobrar» (h1, FileText azul en cuadro `rounded-xl`) / «Finanzas / Cuentas por Cobrar» | Migaja **no navegable** (es un `<p>`, no enlaces) | Siempre | CuentasPorCobrarPage.tsx:140-149 |
| 3 | botón | «Actualizar» (RefreshCw que gira, outline h-9) | Recarga lista + estadísticas | `disabled` con `isLoading` | CuentasPorCobrarPage.tsx:153-161 |
| 4 | badge | «Sucursal:» + «Todas las sucursales» (azul) / «{nombre}» o «Sucursal #{id}» (fucsia) | `BranchBadge` | Siempre | CuentasPorCobrarPage.tsx:165 |
| 5 | stat | «Total por Cobrar» (DollarSign azul) + «{n} cuentas activas» | `estadisticas.total_balance` | Siempre | `EstadisticasCards.tsx:17-24` |
| 6 | stat | «Vigentes» (TrendingUp verde) + «Al día» | `current_amount` | Siempre | EstadisticasCards.tsx:25-32 |
| 7 | stat | «Vencidas» (AlertTriangle rojo) + «Requieren seguimiento» | `overdue_amount` | Siempre | EstadisticasCards.tsx:33-40 |
| 8 | stat | «Promedio Días Cobro» (Clock ámbar) → «{n} días» + «Tiempo promedio» | `Math.round(promedio_dias_cobro)` | Siempre | EstadisticasCards.tsx:41-48 |
| 9 | estado | 4 tarjetas con 3 barras `animate-pulse` | Esqueleto de KPIs | `isLoading` | EstadisticasCards.tsx:51-67 |
| 10 | pestaña | «Cuentas» (FileText; en móvil **«Ctas»**) · «Aging» (TrendingDown) · «Recordatorios» (Bell; móvil **«Recor»**) · «Estadísticas» (BarChart3; móvil **«Stats»**) | 4 pestañas; «Cuentas» activa por defecto | Siempre | CuentasPorCobrarPage.tsx:173-191 |
| 11 | texto | «Filtros y Búsqueda» (Filter azul) | Cabecera del bloque | Pestaña Cuentas | `CuentasPorCobrarFiltros.tsx:73-76` |
| 12 | campo | «Buscar» (placeholder «Cliente, email, teléfono...», Search `pl-10`) | → `search_term` del RPC; **sin debounce** | Siempre | CuentasPorCobrarFiltros.tsx:82-94 |
| 13 | campo | «Estado» (placeholder «Todos los estados»): «Todos los estados» · «Al día» · «Vencidas» · «Parcialmente pagadas» · «Pagadas» | `todos`/`current`/`overdue`/`partial`/`paid` | Siempre | CuentasPorCobrarFiltros.tsx:98-112 |
| 14 | campo | «Aging» (placeholder «Todos los períodos»): «Todos los períodos» · «0-30 días» · «31-60 días» · «61-90 días» · «Más de 90 días» | Filtro de antigüedad | Siempre | CuentasPorCobrarFiltros.tsx:116-130 |
| 15 | campo | «Cliente» (placeholder «Nombre del cliente») | **Roto**: manda texto libre al parámetro `customer_id_filter uuid` del RPC (§H.2) | Siempre | CuentasPorCobrarFiltros.tsx:134-143 |
| 16 | texto | «Acciones» (label sobre los dos botones-icono) | — | Siempre | CuentasPorCobrarFiltros.tsx:147-149 |
| 17 | botón | (icono Filter, outline h-10) · (icono RefreshCw, outline) | Despliega los filtros avanzados / recarga | — | CuentasPorCobrarFiltros.tsx:151-167 |
| 18 | campo | «Fecha Vencimiento Desde» · «Fecha Vencimiento Hasta» (`type=date`) | `date_from` / `date_to` | Filtros avanzados | CuentasPorCobrarFiltros.tsx:176-198 |
| 19 | botón | «Limpiar Filtros» (outline h-9) | Resetea todo menos `pageSize` | Siempre | CuentasPorCobrarFiltros.tsx:206-212 |
| 20 | exportación | «Exportar CSV» (Download, outline) → `cuentas_por_cobrar_AAAA-MM-DD.csv` con 11 columnas: `ID,Cliente,Email,Teléfono,Monto,Balance,Fecha Vencimiento,Estado,Días Vencidos,Último Recordatorio,Fecha Creación` | **Ignora el filtro de sucursal** | `disabled` con `isLoading` | CuentasPorCobrarFiltros.tsx:215-223 · service.ts:407-440 |
| 21 | toast | «Reporte exportado exitosamente» / «Error al exportar el reporte» | — | — | CuentasPorCobrarFiltros.tsx:63, 66 |
| 22 | texto | «Cuentas por Cobrar ({total_count})» | Total del servidor | Pestaña Cuentas | `CuentasPorCobrarTable.tsx:182-184` |
| 23 | paginación | «Por página:» + 5 / 10 / 20 / 50 / 100 | Resetea a la página 1 | Siempre | CuentasPorCobrarTable.tsx:186-203 |
| 24 | columna | «Cliente» → `CopyableId` (nombre azul, `title="Ver detalle"`) + icono copiar (`title="Copiar"`, copia el UUID) + «ID: {8 chars}...» | — | Desktop (≥`sm`) | CuentasPorCobrarTable.tsx:313, 326-338 |
| 25 | columna | «Contacto» (email con Mail, teléfono con Phone) · «Monto» · «Balance» (rojo si >0, verde si no) | — | Desktop | CuentasPorCobrarTable.tsx:314-316, 339-367 |
| 26 | columna | «Vencimiento» (Calendar) | `formatDate` vía **`useFormatDate()`**: una de las pocas que sí usa el huso de la organización | Desktop | CuentasPorCobrarTable.tsx:317, 368-373 |
| 27 | columna | «Aging» → «{days_overdue} días» coloreado: ≤30 verde, ≤60 ámbar, ≤90 naranja, >90 rojo | — | Desktop | CuentasPorCobrarTable.tsx:319, 377-384, 108-113 |
| 28 | badge | «Al día» (CheckCircle, verde) · «Vencida ({n}d)» (AlertTriangle, rojo, **interpola los días**) · «Parcial» (Clock, ámbar) · «Pagada» (DollarSign, azul outline) · texto crudo gris de fallback | Columna «Estado» | — | CuentasPorCobrarTable.tsx:75-104 |
| 29 | menú | (MoreHorizontal, ghost 28×28, `align="end"`) → «Aplicar Abono» (CreditCard) · «Enviar Recordatorio» (Mail) · «Ver Detalles» (Eye) | «Abono» `disabled` si `balance <= 0`; «Recordatorio» `disabled` si `status !== 'overdue'` | Por fila | CuentasPorCobrarTable.tsx:386-415 |
| 30 | estado | **Segunda implementación completa en tarjetas** (`sm:hidden`): nombre + badge, rejilla 2×2 «Monto:» / «Balance:» / «Vencimiento:» / «Aging:», bloque de contacto y 3 botones «Abono» (h-7 `text-[10px]`) / «Recordar» / (icono Eye) | **No es una tabla responsive: son dos árboles distintos** | < 640 px | CuentasPorCobrarTable.tsx:209-306 |
| 31 | estado | «Cargando...» + 5 filas de 4 barras `animate-pulse` | Carga | `isLoading` | CuentasPorCobrarTable.tsx:141-163 |
| 32 | estado | «No se encontraron cuentas por cobrar con los filtros aplicados» | Vacío — **no distingue «sin datos» de «sin resultados»** | — | CuentasPorCobrarTable.tsx:165-175 |
| 33 | paginación | «Mostrando {a} a {b} de {n} registros» + anterior / 5 números / siguiente; en móvil solo 3 números | — | `total_pages > 1` | CuentasPorCobrarTable.tsx:428-482 |
| 34 | toast | «Error al cargar los datos» · «Error al cargar las cuentas por cobrar» · «Error al cargar las estadísticas» | — | — | CuentasPorCobrarPage.tsx:71, 83, 93 |

Datos: RPC `get_accounts_receivable_paginated(org_id, search_term, status_filter, aging_filter, customer_id_filter uuid, date_from, date_to, page_size, page_number, branch_id_filter)` (service.ts:37-49) y RPC `get_accounts_receivable_stats` (service.ts:482-486), ambas `SECURITY DEFINER`, llamadas desde el navegador. Layout: cabecera `flex-col sm:flex-row`; KPIs `1 / sm:2 / lg:4`; `TabsList` `grid-cols-2 sm:grid-cols-4`; filtros `1 / sm:2 / md:3 / lg:5`. **No existe**: orden por columna, selección múltiple, acciones masivas, estado «sin permiso», ni error reintentable dentro de la tabla.

#### C.1-bis Diálogo «Aplicar Abono» — `cuentas-por-cobrar/AplicarAbonoModal.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 35 | diálogo | «Aplicar Abono» (CreditCard azul), `sm:max-w-xl lg:max-w-2xl`, `max-h-[90vh]` | Modal | `open` | AplicarAbonoModal.tsx:212-219 |
| 36 | texto | «Información de la Cuenta» (User) · «Cliente» · «Balance Pendiente» (rojo `text-lg`) · «Monto Total» · «Fecha Vencimiento» | Contexto de solo lectura | Siempre | AplicarAbonoModal.tsx:225-252 |
| 37 | texto | «Detalles del Abono» (DollarSign) | Cabecera del formulario | Siempre | AplicarAbonoModal.tsx:261-264 |
| 38 | campo | «Monto del Abono *» (placeholder «0.00», `type=text` con regex `^\d*\.?\d*$`) | **Prellenado con el balance** al abrir; borde rojo si excede | Siempre | AplicarAbonoModal.tsx:269-282 |
| 39 | estado | `Alert` destructivo «El monto ingresado ({x}) excede el balance pendiente ({y})» (AlertCircle) | Validación en vivo | `montoExcedido` | AplicarAbonoModal.tsx:283-295 |
| 40 | campo | «Método de Pago *» (placeholder «Seleccione método») | `organization_payment_methods` activos; **preselecciona el primero** | Siempre | AplicarAbonoModal.tsx:299-324 |
| 41 | estado | «Cargando...» + Loader2 dentro del trigger | Carga de métodos | — | AplicarAbonoModal.tsx:308-312 |
| 42 | campo | «Fecha de Pago» (`type=date`) | **Por defecto hoy en UTC** (`toISOString().split('T')[0]`) | Siempre | AplicarAbonoModal.tsx:330-339 |
| 43 | campo | «Referencia / Transacción *» (placeholder «Número de transacción, últimos 4 dígitos, etc.») | Obligatoria | Si el método tiene `requires_reference` | AplicarAbonoModal.tsx:342-356 |
| 44 | campo | «Notas» (`RichTextEditor`, placeholder «Comentarios adicionales sobre el abono...», `minHeight=60`) | **No se envía al servicio** (§H.3) | Siempre | AplicarAbonoModal.tsx:359-370 |
| 45 | cálculo | «Balance después del abono:» + importe `text-lg font-bold` · «Estado resultante:» → «Pagado» o «Parcial» (verde) | Proyección | Con monto escrito | AplicarAbonoModal.tsx:375-390 |
| 46 | botón | «Cancelar» (outline; **no limpia el formulario**) / «Aplicar Abono» → «Aplicando...» (azul) | `disabled` sin monto o método, sin referencia obligatoria, o si el monto excede | Siempre | AplicarAbonoModal.tsx:397-417 |
| 47 | toast | «Por favor complete todos los campos requeridos» · «La referencia es requerida para este método de pago» · «El monto debe ser un número válido mayor a 0» · «El monto no puede ser mayor al balance pendiente» · «Abono aplicado exitosamente» · «Error al aplicar el abono» · «Error al cargar los métodos de pago» | — | — | AplicarAbonoModal.tsx:117-154, 95 |

**Contabilidad limpia**: `aplicarAbono` (service.ts:260-310) inserta **una sola fila** en `payments` con `source='account_receivable'`, `status='completed'`, `currency:'COP'` y **no escribe en `accounts_receivable`**: deja trabajar al trigger `tr_update_accounts_receivable_on_payment`, con un comentario explícito en el código (:308-309). Es el modelo correcto frente a §H.1 #1.

#### C.1-ter Diálogo «Enviar Recordatorio de Pago» — `EnviarRecordatorioModal.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 48 | diálogo | «Enviar Recordatorio de Pago» (Mail azul), `sm:max-w-2xl lg:max-w-3xl` | Modal | `open` | EnviarRecordatorioModal.tsx:85-91 |
| 49 | texto | «Información del Cliente» (User) · «Cliente» · «Email» («No disponible» si falta) | Contexto | Siempre | EnviarRecordatorioModal.tsx:97-113 |
| 50 | texto | «Balance Pendiente» (rojo) · «Días Vencidos» (AlertTriangle) · «Último Recordatorio» («Nunca») | Rejilla de 3 | Siempre | EnviarRecordatorioModal.tsx:115-140 |
| 51 | badge | «Fecha de vencimiento» (Calendar) + «Vencida» (Clock, rojo) | Tarjeta de estado | Siempre | EnviarRecordatorioModal.tsx:145-163 |
| 52 | texto | «Mensaje del Recordatorio» (Mail) + «Contenido del mensaje» | Cabecera | Siempre | EnviarRecordatorioModal.tsx:166-177 |
| 53 | botón | «Usar mensaje predeterminado» (outline h-8 `text-xs`) | Rellena la plantilla «Estimado(a) {cliente}, … Equipo de Cobranzas» | Siempre | EnviarRecordatorioModal.tsx:178-186, 27-40 |
| 54 | campo | `Textarea rows={10}` (placeholder «Escriba aquí el mensaje del recordatorio...») | Obligatorio | Siempre | EnviarRecordatorioModal.tsx:189-197 |
| 55 | texto | «El mensaje será enviado a: {email}» / «Email no disponible» | Pie del campo | Siempre | EnviarRecordatorioModal.tsx:199-201 |
| 56 | estado | Tarjeta ámbar «Email no disponible» / «Este cliente no tiene un email registrado. El recordatorio se registrará pero no se enviará automáticamente.» | Aviso | Sin email | EnviarRecordatorioModal.tsx:206-220 |
| 57 | botón | «Cancelar» / «Enviar Recordatorio» → «Enviando...» (azul) | **Solo actualiza `last_reminder_date`: no envía nada** (§H.3) | `disabled` sin mensaje | EnviarRecordatorioModal.tsx:223-237 |
| 58 | toast | «Por favor ingrese un mensaje» · «Recordatorio enviado exitosamente» · «Error al enviar el recordatorio» | — | — | EnviarRecordatorioModal.tsx:46, 64, 69 |

#### C.1-quater Pestaña «Aging» — `cuentas-por-cobrar/AgingReport.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 59 | texto | «Reporte de Aging» (TrendingDown azul) | Título | Siempre | AgingReport.tsx:147-150 |
| 60 | botón | «Actualizar» (RefreshCw; texto oculto bajo `sm`) | Recarga | Siempre | AgingReport.tsx:152-161 |
| 61 | exportación | «Exportar» (Download; texto oculto bajo `sm`) → `aging_report_AAAA-MM-DD.csv` con 8 columnas: `Cliente,Email,Teléfono,0-30 días,31-60 días,61-90 días,+90 días,Total` | — | Siempre | AgingReport.tsx:162-170, 41-82 |
| 62 | stat | «0-30 días» (verde) · «31-60 días» (ámbar) · «61-90 días» (naranja) · «+90 días» (rojo) · «Total» | Fila de totales, rejilla `2 / sm:3 / lg:5` | Con datos | AgingReport.tsx:182-213 |
| 63 | columna | «Cliente» · «Contacto» · «0-30 días» · «31-60 días» · «61-90 días» · «+90 días» · «Total» (`font-bold`) · «Riesgo» | **8 columnas**, las 5 de importe a la derecha | Desktop | AgingReport.tsx:266-315 |
| 64 | badge | «Alto Riesgo» (rojo, ≥75 %) · «Riesgo Medio» (ámbar, ≥50 %) · **«Riesgo Bajo»** (gris outline, ≥25 %) · **«Bajo Riesgo»** (verde, <25 %) | **Dos etiquetas casi idénticas para dos tramos distintos** | — | AgingReport.tsx:108-115 |
| 65 | cálculo | Semáforo por celda: ≥50 % del total rojo, ≥25 % ámbar, resto verde; 0 en gris | Color de cada bucket | Siempre | AgingReport.tsx:96-102 |
| 66 | estado | «Cargando reporte de aging...» + 5 filas de 5 barras · «No hay datos de aging disponibles» | Carga / vacío | — | AgingReport.tsx:118-141, 175-178 |
| 67 | estado | Tarjetas por cliente (nombre + email + badge de riesgo + rejilla 2×2 «0-30:» / «31-60:» / «61-90:» / «+90:» + «Total:») | **Segunda implementación para móvil** | < 640 px | AgingReport.tsx:216-259 |
| 68 | toast | «Error al cargar el reporte de aging» · «Reporte de aging exportado exitosamente» · «Error al exportar el reporte» | — | — | AgingReport.tsx:35, 77, 80 |

`obtenerReporteAging(branchId)` (service.ts:128) reutiliza el RPC paginado y **agrupa por cliente en el navegador**. **No existe**: gráfico, comparación de periodos, ni enlace desde la fila a la cuenta.

#### C.1-quinquies Pestaña «Recordatorios» — `cuentas-por-cobrar/RecordatoriosPanel.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 69 | texto | «Recordatorios ({n})» (Bell azul) | Título con el conteo | Siempre | RecordatoriosPanel.tsx:143-146 |
| 70 | botón | «Actualizar» (RefreshCw) · «Enviar ({n})» (Send, azul) | «Enviar» recorre los seleccionados con email y llama a `actualizarFechaRecordatorio` **uno a uno** | «Enviar» `disabled` sin selección | RecordatoriosPanel.tsx:148-166, 58-102 |
| 71 | stat | «Total Recordatorios» (azul) · «Monto Total» (rojo) · «Promedio Días» (ámbar) · «Con Email» (verde) | Rejilla `2 / lg:4` | Con datos | RecordatoriosPanel.tsx:184-209 |
| 72 | toggle | Checkbox de cabecera (sin etiqueta; en móvil «Seleccionar todos») + checkbox por fila | Selección múltiple | Siempre | RecordatoriosPanel.tsx:282-289, 302-309, 213-221 |
| 73 | columna | «Cliente» · «Contacto» (email o «Sin email» en gris claro) · «Monto» (rojo) · «Vencimiento» · «Días Vencidos» (AlertTriangle rojo) · «Último Recordatorio» («Nunca») · «Urgencia» | **7 columnas** | Desktop | RecordatoriosPanel.tsx:290-357 |
| 74 | badge | «Crítico» (rojo, ≥90 d) · «Urgente» (rojo claro, ≥60) · «Importante» (ámbar, ≥30) · «Normal» (outline) | Urgencia | — | RecordatoriosPanel.tsx:104-113 |
| 75 | estado | «Cargando recordatorios...» + 5 filas · Bell 48 px + «No hay recordatorios pendientes» + «Todas las cuentas están al día o ya tienen recordatorios recientes» | Carga / vacío | — | RecordatoriosPanel.tsx:115-137, 171-180 |
| 76 | toast | «Seleccione al menos un recordatorio» · «Ninguno de los recordatorios seleccionados tiene email» · «{n} recordatorios enviados exitosamente» · «{n} recordatorios fallaron» (warning) · «No se pudo enviar ningún recordatorio» · «Error al cargar los recordatorios» | — | — | RecordatoriosPanel.tsx:60, 68, 88, 90, 96, 34 |

`obtenerCuentasParaRecordatorio()` (service.ts:221-257) consulta `accounts_receivable` con `customers!inner`, filtrando `status='overdue'`, `balance > 0` y `last_reminder_date` nulo o de hace más de 3 días. **Ignora el filtro de sucursal.** Y pinta «Último Recordatorio» con `parseLocalDate` en móvil y con `new Date()` en escritorio: **dos formatos para el mismo dato** (`:265` vs `:350`).

#### C.1-sexies Pestaña «Estadísticas» — `EstadisticasCards.tsx` + `CuentasPorCobrarPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 77 | texto | «Resumen Detallado» · «Total Facturado» · «Total Cobrado» (verde) · «Parcialmente Cobrado» (ámbar) · «Cuentas Activas» | Tarjeta izquierda | Siempre | EstadisticasCards.tsx:107-150 |
| 78 | badge | «Eficiencia de Cobro» + % (`default` ≥80 %, `secondary` ≥60 %, `destructive` si no) · «Cartera Vencida» + % (`default` ≤10 %, `secondary` ≤25 %, `destructive` si no) | — | Siempre | EstadisticasCards.tsx:135-144 |
| 79 | texto | «Análisis de Tendencias» | Tarjeta derecha | Siempre | CuentasPorCobrarPage.tsx:224-226 |
| 80 | cálculo | «Eficiencia de cobro» + barra verde de 24 px + % · «Cartera vencida» + barra roja + % | **Repiten exactamente el dato de los badges #78: no hay ninguna serie temporal** | Siempre | CuentasPorCobrarPage.tsx:230-266 |
| 81 | texto | «Promedio de días para cobro: {n} días» | Pie tras un separador | Siempre | CuentasPorCobrarPage.tsx:268-274 |

**No existe**: ninguna gráfica real, serie temporal, ni exportación de esta pestaña.

### C.2 Detalle de cuenta por cobrar `/app/finanzas/cuentas-por-cobrar/[id]` — `cuentas-por-cobrar/id/CuentaPorCobrarDetailPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | 1 círculo + 2 líneas + 3 tarjetas + 2 paneles, todo `Skeleton` | Carga | `isLoading` | CuentaPorCobrarDetailPage.tsx:135-158 |
| 2 | estado | AlertCircle 48 px + «Cuenta no encontrada» + «La cuenta por cobrar solicitada no existe o no tienes permisos para verla.» + «Volver a Cuentas por Cobrar» | **Un 403 y un 404 se ven igual** | `!account` | CuentaPorCobrarDetailPage.tsx:160-178 |
| 3 | botón | (icono ArrowLeft, ghost icon) | Vuelve al listado | Siempre | CuentaPorCobrarDetailPage.tsx:185-192 |
| 4 | texto | «Cuenta por Cobrar» (h1, Receipt en caja azul) + «ID: {uuid completo}» | Cabecera | Siempre | CuentaPorCobrarDetailPage.tsx:193-203 |
| 5 | badge | «Al día» (verde) · «Vencida» (rojo) · **«Pagada» (azul)** · **«Parcial» (amarillo)** · «Desconocido» (gris) | `AccountStatusBadge` de CxC — **incompatible con el de CxP** (§J) | Siempre | `id/AccountStatusBadge.tsx:12-36` |
| 6 | botón | «Registrar Cobro» (DollarSign, azul) | **`document.getElementById('btn-registrar-cobro')?.click()`**: dispara el botón del panel inferior | `canApplyPayment` | CuentaPorCobrarDetailPage.tsx:207-217 |
| 7 | botón | «Marcar como Cobrada» (borde verde) | **`document.getElementById('btn-marcar-cobrada')?.click()`** | `canMarkAsPaid` | CuentaPorCobrarDetailPage.tsx:218-227 |
| 8 | exportación | «Exportar Estado» (Download, outline) → `estado_cuenta_{Cliente}_AAAA-MM-DD.txt` con «ESTADO DE CUENTA POR COBRAR» + `===========================` + Cliente / NIT / Factura / Fecha de Vencimiento / Monto Original / Total Cobrado / Balance Pendiente / Estado / Días de Atraso / Fecha de Generación | **TXT, no PDF** | Siempre | CuentaPorCobrarDetailPage.tsx:228-236, 73-112 |
| 9 | botón | «Actualizar» → «Actualizando...» (outline) | Recarga | Siempre | CuentaPorCobrarDetailPage.tsx:237-245 |
| 10 | stat | «Monto Original» (DollarSign azul) + «Monto inicial de la cuenta» | — | Siempre | CuentaPorCobrarDetailPage.tsx:251-266 |
| 11 | stat | «Balance Pendiente» (CreditCard rojo) + «Pendiente por cobrar» | — | Siempre | CuentaPorCobrarDetailPage.tsx:268-283 |
| 12 | stat | «Fecha de Vencimiento» (Calendar naranja) + «Fecha límite de pago» | `parseLocalDate(...).toLocaleDateString('es-CO', {year, month:'short', day})` | Siempre | CuentaPorCobrarDetailPage.tsx:285-300 |
| 13 | stat | «Días de Atraso» (Clock morado) + el tramo: «Al día» verde · «1-30 días» amarillo · «31-60 días» naranja · «61-90 días» rojo · «Más de 90 días» rojo oscuro | `getAgingInfo` — **5 tramos aquí, 4 en CxP** | Siempre | CuentaPorCobrarDetailPage.tsx:302-317 · `id/service.ts:115-151` |
| 14 | texto | «Información del Cliente» (User azul) · nombre (User) · email (Mail) · teléfono (Phone) · dirección (MapPin) | Cada línea solo si el dato existe | Siempre | CuentaPorCobrarDetailPage.tsx:325-363 |
| 15 | texto | «Factura de Venta» + número + fecha (caja `bg-gray-50`) + botón «Ver Factura» (FileText, outline) | Enlace a `/app/finanzas/facturas-venta/{invoice_id}` | Si hay `invoice_number` | CuentaPorCobrarDetailPage.tsx:368-397 |
| 16 | texto | «Fecha de Creación» · «Última Actualización» (con hora) · «Último Recordatorio» | `toLocaleDateString('es-CO', {year, month:'long', day, hour, minute})` | Siempre / si hay | CuentaPorCobrarDetailPage.tsx:399-421 |
| 17 | texto | «Acciones de Cuenta» (Edit azul) + «Gestiona pagos y recordatorios para esta cuenta» | Panel derecho | Siempre | `id/AccountActionsCard.tsx:224-230` |
| 18 | badge | «Atención requerida» (amarillo, ≤30 d) · «Urgente» (naranja, ≤60) · «Crítico» (rojo, >60) | Nada si está al día | `days_overdue > 0` | AccountActionsCard.tsx:195-217 |
| 19 | botón | «Enviar Recordatorio» + «Notificar al cliente sobre el pago pendiente» (MessageCircle naranja, tarjeta `w-full justify-start h-auto p-4`) | Abre el diálogo | Hay saldo, está vencida y no pagada | AccountActionsCard.tsx:237-251 |
| 20 | diálogo | «Enviar Recordatorio de Pago» / «Envía un recordatorio al cliente sobre el pago pendiente» (`max-w-2xl`) | Modal | — | AccountActionsCard.tsx:253-261 |
| 21 | campo | «Mensaje del recordatorio» (`Textarea min-h-[200px]`, placeholder «Escribe tu mensaje aquí...») | **Pseudo-controlado roto**: `value={reminderMessage \|\| getDefaultReminderMessage()}` pinta la plantilla con el estado vacío, así que «Enviar» sin editar salta «Por favor ingresa un mensaje» con el campo visiblemente lleno — y el campo no se puede vaciar | — | AccountActionsCard.tsx:264-273, 63-66 |
| 22 | botón | «Usar plantilla» (outline sm) | Copia la plantilla al estado (**hay que pulsarlo para poder enviar**) | — | AccountActionsCard.tsx:276-283 |
| 23 | botón | «Enviar Recordatorio» → «Enviando...» (Send, `bg-orange-600`) | `NotificationService.sendPaymentReminder` + `UPDATE last_reminder_date` — **este sí envía**, al contrario que el del listado | — | AccountActionsCard.tsx:284-291 · `id/service.ts:460-500` |
| 24 | botón | «Registrar Cobro» + «Registrar un pago parcial o total» (CreditCard azul), `id="btn-registrar-cobro"` | Abre el diálogo y carga métodos + cuotas | `canApplyPayment` | AccountActionsCard.tsx:299-318 |
| 25 | diálogo | «Registrar Cobro» / «Balance pendiente: {importe}» | Modal | `showPaymentDialog` | AccountActionsCard.tsx:319-327 |
| 26 | campo | «Aplicar a cuota (opcional)» (placeholder «Seleccionar cuota o aplicar automáticamente»): «Aplicar automáticamente a cuotas pendientes» + «Cuota #{n} - Saldo: {importe}» | Al elegir precarga el saldo de la cuota | Si hay cuotas pendientes | AccountActionsCard.tsx:330-357 |
| 27 | texto | «Si no seleccionas una cuota, el pago se aplicará automáticamente a las cuotas más antiguas» | Ayuda | Con cuotas | AccountActionsCard.tsx:358-360 |
| 28 | campo | «Monto del pago» (placeholder «0.00») + botones «Pago total» / «50%» (outline sm `text-xs`) | Rellenan `balance` y `balance / 2` | Siempre | AccountActionsCard.tsx:364-393 |
| 29 | campo | «Fecha de Pago» (`type=date`, `max` hoy, `min` fecha de emisión) + «La fecha no puede ser anterior a la emisión» (rojo `text-xs`, borde rojo) | Validación en vivo | Siempre | AccountActionsCard.tsx:397-417 |
| 30 | campo | «Método de pago» (placeholder «Seleccionar método») · «Referencia (Opcional)» (placeholder «Número de comprobante o referencia») | — | Siempre | AccountActionsCard.tsx:420-446 |
| 31 | botón | «Registrar Cobro» → «Aplicando...» (DollarSign, `w-full` azul) | `pagarCuota()` si hay cuota elegida; reparto automático de la más antigua a la más nueva; o `aplicarPago()` si no hay cuotas | Siempre | AccountActionsCard.tsx:448-455, 82-161 |
| 32 | botón | «Marcar como Pagada» + «Marcar la cuenta como completamente pagada» (CheckCircle verde), `id="btn-marcar-cobrada"` | Abre la confirmación | `canMarkAsPaid` | AccountActionsCard.tsx:462-477 |
| 33 | diálogo | «Marcar como Pagada» / «¿Estás seguro de que deseas marcar esta cuenta como pagada?» + caja amarilla «Balance pendiente: {importe}» (AlertTriangle) + «Esta acción creará un registro de pago por el balance total pendiente.» | Confirmación | — | AccountActionsCard.tsx:479-499 |
| 34 | botón | «Cancelar» / «Confirmar» → «Procesando...» (CheckCircle, verde) | `aplicarPago(balance, 'efectivo', 'Marcado como pagado')` — **método y referencia cableados, sin preguntar** | — | AccountActionsCard.tsx:500-514, 163-181 |
| 35 | texto | «Monto original:» · «Total pagado:» · «Balance pendiente:» (rojo) · «Último recordatorio:» | Pie del panel tras un separador | Siempre / condicional | AccountActionsCard.tsx:521-544 |
| 36 | toast | «Por favor ingresa un mensaje para el recordatorio» · «Recordatorio enviado exitosamente» · «Error al enviar el recordatorio» · «Por favor ingresa un monto válido» · «Por favor selecciona un método de pago» · «El monto no puede ser mayor al saldo de la cuota» · «El monto no puede ser mayor al balance pendiente» · «Pago aplicado exitosamente» · «Error al aplicar el pago» · «Cuenta marcada como pagada» · «Error al marcar la cuenta como pagada» | — | — | AccountActionsCard.tsx:64-177 |
| 37 | toast | «Cuenta por cobrar no encontrada» · «Error al cargar los detalles de la cuenta» · «Estado de cuenta exportado» · «Error al exportar el estado de cuenta» | Página | — | CuentaPorCobrarDetailPage.tsx:41, 51, 107, 110 |

Layout `container mx-auto px-4 py-8`; cabecera `flex-col lg:flex-row`; KPIs `1 / md:2 / lg:4`; contenido `1 / lg:2`, con «Plan de Cuotas» e «Historial de Pagos» apilados debajo a ancho completo. **No existe**: edición de la cuenta, cambio de fecha de vencimiento, anulación de un pago ya registrado, adjuntos, ni historial de auditoría.

#### C.2-bis Plan de cuotas (CxC) — `cuentas-por-cobrar/id/InstallmentsCard.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 38 | texto | «Plan de Cuotas» (Calendar azul) | Título | Siempre | InstallmentsCard.tsx:222-225 |
| 39 | botón | «Crear Cuotas» (Plus, azul sm) | Abre el diálogo | Sin cuotas y cuenta no pagada | InstallmentsCard.tsx:229-233 |
| 40 | diálogo | «Crear Plan de Cuotas» / «Divide el saldo pendiente de {importe} en cuotas mensuales» | Modal | — | InstallmentsCard.tsx:235-241 |
| 41 | campo | «Número de cuotas» (`type=number min=2 max=60`) | **El `max` del input (60) contradice la validación (36)** | — | InstallmentsCard.tsx:243-253, 84 |
| 42 | campo | «Tasa de interés mensual (%)» (`min=0 max=100 step=0.1`) | **Sin efecto: no se pasa a `crearCuotas`** | — | InstallmentsCard.tsx:255-267, 91-96 |
| 43 | cálculo | «Cuota estimada: {importe}» (caja azul) | `totalAmount / numberOfInstallments` — **ignora el interés** | — | InstallmentsCard.tsx:268-272 |
| 44 | botón | «Cancelar» / «Crear Cuotas» → «Creando...» (Loader2) | — | — | InstallmentsCard.tsx:274-288 |
| 45 | botón | «Eliminar Plan» (Trash2, borde rojo) | Abre la confirmación | Con cuotas | InstallmentsCard.tsx:293-297 |
| 46 | diálogo | «Eliminar Plan de Cuotas» / «¿Estás seguro de eliminar todas las cuotas? Esta acción no se puede deshacer.» + «Cancelar» / «Eliminar» (destructive) | Confirmación | — | InstallmentsCard.tsx:299-314 |
| 47 | estado | Calendar 48 px + «No hay cuotas configuradas para esta cuenta.» + «Crea un plan de cuotas para facilitar el cobro.» | Vacío | — | InstallmentsCard.tsx:320-325 |
| 48 | texto | Círculo con el número + «Cuota {n}» + «Vence: {fecha}» + importe + «Pagado: {importe}» (verde) | **Lista, no tabla** | Por cuota | InstallmentsCard.tsx:328-356 |
| 49 | badge | «Pagada» (verde) · «Vencida ({n}d)» (rojo) · «Pendiente» (amarillo) | **3 variantes aquí, 4 en CxP** | — | InstallmentsCard.tsx:185-193 |
| 50 | botón | «Saldo: {importe}» + «Pagar» (CreditCard, borde azul sm) | Abre el pago de cuota | Si no está pagada | InstallmentsCard.tsx:360-371 |
| 51 | cálculo | «Total Pagado» (verde) · «Pendiente» | Tras un separador | Con cuotas | InstallmentsCard.tsx:379-392 |
| 52 | diálogo | «Pagar Cuota #{n}» / «Saldo pendiente: {importe}» + «Monto a pagar» (placeholder «0.00») + «Pago total» / «50%» + «Método de pago» + «Referencia (opcional)» (placeholder «Número de comprobante») + «Cancelar» / «Registrar Pago» → «Procesando...» | Modal de pago de cuota | `showPayDialog` | InstallmentsCard.tsx:397-478 |
| 53 | toast | «El número de cuotas debe estar entre 2 y 36» · «Se han creado {n} cuotas exitosamente» · «Error al crear las cuotas» · «Cuotas eliminadas» · «Error al eliminar las cuotas» · «Ingresa un monto válido» · «El monto no puede ser mayor al saldo de la cuota» · «Selecciona un método de pago» · «Pago registrado exitosamente» · «Error al registrar el pago» | — | — | InstallmentsCard.tsx:85-179 |

`pagarCuota` (`id/service.ts:381-439`) actualiza `ar_installments` a mano y **después** llama a `aplicarPago`, que solo inserta en `payments`. No hay trigger de `payments` sobre `ar_installments`, así que la actualización manual es la única vía y **no duplica**; pero **las dos escrituras no son atómicas** (§H.1 #15).

#### C.2-ter Historial de pagos (CxC) — `cuentas-por-cobrar/id/PaymentHistoryCard.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 54 | texto | «Historial de Pagos» (CreditCard azul) + «{n} pagos registrados • Total pagado: {importe}» | **`n` es el tamaño de la página, no el total** | Siempre | PaymentHistoryCard.tsx:119-125 |
| 55 | campo | Placeholder «Buscar por referencia, método o factura...» (Search `pl-10`) | Filtro en servidor, **sin debounce** | Siempre | PaymentHistoryCard.tsx:132-140 |
| 56 | campo | Select (Filter): «Solo esta cuenta» / «Todos los pagos del cliente» | Alterna el alcance | Siempre | PaymentHistoryCard.tsx:145-156 |
| 57 | paginación | «Mostrar:» + 5 / 10 / 20 / 50 / 100 | Tamaño de página | Siempre | PaymentHistoryCard.tsx:160-174 |
| 58 | texto | DollarSign en círculo azul + importe + badge de método + badge de estado + fecha (Calendar) + «Ref: {x}» + «Factura: {x}» | **Tarjetas, no tabla** | Por pago | PaymentHistoryCard.tsx:198-231 |
| 59 | badge | «Efectivo» (verde) · «Transferencia» (azul) · «Tarjeta» (morado) · «Cheque» (naranja); mapea tanto `cash`/`efectivo` como `transfer`/`transferencia`; fallback gris con el código crudo | Método | — | PaymentHistoryCard.tsx:62-82 |
| 60 | badge | «Completado» (verde) · «Pendiente» (amarillo) · «Fallido» (rojo); fallback gris | Estado | — | PaymentHistoryCard.tsx:84-99 |
| 61 | estado | Spinner + «Cargando pagos...» · Receipt 48 px + «No hay pagos registrados» + «Este cliente no tiene pagos registrados.» / «Esta cuenta no tiene pagos registrados.» | Carga / vacío con dos redacciones | — | PaymentHistoryCard.tsx:178-195 |
| 62 | paginación | «Mostrando {a} a {b} de {n} pagos» + «Anterior» / «Página {x} de {y}» / «Siguiente» | **Tercera paginación distinta del módulo** | `totalPages > 1` | PaymentHistoryCard.tsx:234-263 |
| 63 | toast | «Error al cargar el historial de pagos» | — | — | PaymentHistoryCard.tsx:48 |

La fecha se pinta con `toLocaleDateString('es-CO', {…, hour, minute})` sobre `created_at`, **sin el huso de la organización**. **No existe**: anular un pago, ver el comprobante, ni exportar el historial.

### C.3 Cuentas por pagar `/app/finanzas/cuentas-por-pagar` — `cuentas-por-pagar/CuentasPorPagarPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft, ghost icon) | `Link` a `/app/finanzas` | Siempre | CuentasPorPagarPage.tsx:252-256 |
| 2 | texto | «Cuentas por Pagar» (h1, Wallet 24 px azul en caja `rounded-xl`) / «Finanzas / Cuentas por Pagar» | Migaja **no navegable** | Siempre | CuentasPorPagarPage.tsx:257-267 |
| 3 | botón | «Actualizar» (RefreshCw; texto oculto bajo `sm`) | Recarga datos + resumen + pagos programados | `disabled` con `refreshing` | CuentasPorPagarPage.tsx:271-280 |
| 4 | botón | «Aprobaciones» (móvil **«Aprob.»**, Calendar) + badge con el nº de pagos pendientes | Abre `AprobacionPagosModal` | El badge **arranca en 0**: `cargarPagosProgramados` solo se llama desde «Actualizar» | CuentasPorPagarPage.tsx:282-296, 139-148 |
| 5 | botón | «Exportar» (Download; texto oculto bajo `sm`) | Abre `ExportarBancaModal` | `disabled` sin selección | CuentasPorPagarPage.tsx:298-307 |
| 6 | toast | «Seleccionar cuentas» / «Debe seleccionar al menos una cuenta para exportar» | **Bloqueo redundante**: el botón ya está deshabilitado | — | CuentasPorPagarPage.tsx:210-216 |
| 7 | badge | «Sucursal:» + valor | `BranchBadge` | Siempre | CuentasPorPagarPage.tsx:311 |
| 8 | stat | «Total Pendiente» (Wallet azul) + «COP» + «Monto total por pagar» | `resumen.total_amount` | Con resumen | `ResumenCuentasPorPagar.tsx:40-47` |
| 9 | stat | «Pagos Vencidos» (AlertCircle, rojo si >0) + «{n} cuenta(s) vencida(s)» + badge con el porcentaje | `total_overdue` | — | ResumenCuentasPorPagar.tsx:48-56 |
| 10 | stat | «Pagos Parciales» (TrendingUp amarillo) + «Cuentas con pagos parciales» | `total_partial` | — | ResumenCuentasPorPagar.tsx:57-64 |
| 11 | stat | «Próximo Vencimiento» (Calendar morado) + fecha o «Sin vencimientos próximos» + «Vencido hace {n} días» · «Vence hoy» · «Vence mañana» · «Vence en {n} días» | `next_due_date` | — | ResumenCuentasPorPagar.tsx:65-86 |
| 12 | stat | «Nivel de Urgencia» (AlertCircle) + punto de color + «Alto» / «Medio» / «Bajo» + «{x}% vencido» | >30 % alto, >10 % medio | Siempre | ResumenCuentasPorPagar.tsx:154-181 |
| 13 | stat | «Proveedores Activos» (Users) + «Promedio: {importe}» · «Estado General» (TrendingUp) + «Pendientes» / «Parciales» (amarillo) / «Vencidas» (rojo) | 7 KPIs en total | Siempre | ResumenCuentasPorPagar.tsx:184-233 |
| 14 | estado | Tarjeta roja «Atención: Pagos Vencidos» + «Tienes {n} cuenta(s) por pagar vencida(s) por un total de {importe}. Se recomienda realizar los pagos lo antes posible para evitar recargos.» | Alerta | `total_overdue > 0` | ResumenCuentasPorPagar.tsx:237-255 |
| 15 | campo | «Búsqueda» (Search, placeholder «Buscar...») | Proveedor y número de factura; **usa `.or()` sobre recursos embebidos sin `!inner`**, que PostgREST no soporta (§H.2) | Siempre | `CuentasPorPagarFiltros.tsx:152-164` |
| 16 | campo | «Estado» (placeholder «Todos»): «Todos» · «Pendiente» · «Vencida» · «Parcial» · «Pagada» | **Roto**: emite `pendiente`/`vencida`/`parcial`/`pagada` contra valores reales `pending`/`partial`/`paid` (§H.2) | Siempre | CuentasPorPagarFiltros.tsx:167-181 |
| 17 | campo | «Vencimiento» (placeholder «Todos»): «Todos» · «Vence hoy» · «Próximos 7 días» · «Próximos 30 días» · «Vencidas» | **3 de las 4 no hacen nada** (§H.2) | Siempre | CuentasPorPagarFiltros.tsx:184-198 |
| 18 | botón | «Más filtros» / «Menos filtros» (móvil «Más» / «Menos»; chevron que rota) | Despliega el bloque avanzado | Siempre | CuentasPorPagarFiltros.tsx:201-222 |
| 19 | campo | «Proveedor» (placeholder «Todos»): «Todos los proveedores» + nombre y «NIT: {x}» por proveedor con saldo | — | Filtros avanzados | CuentasPorPagarFiltros.tsx:230-255 |
| 20 | campo | «Monto mínimo» (DollarSign, placeholder «0.00») · «Monto máximo» (placeholder «Sin límite») · «Vence desde» · «Vence hasta» (`type=date`) | 4 filtros avanzados | Filtros avanzados | CuentasPorPagarFiltros.tsx:258-317 |
| 21 | chip | «{n} filtro(s) activo(s)» (Filter, caja azul) + botón «Limpiar todo» (X, ghost azul) | Contador y reset | Con filtros | CuentasPorPagarFiltros.tsx:323-340 |
| 22 | pestaña | «Todas» (FileText) · «Vencidas» (AlertCircle) · «Próximas» (Calendar) · «Pendientes» (Wallet) | **Las tres últimas filtran en cliente sobre la página actual**, mientras la paginación sigue mostrando los totales sin filtrar (§H.2) | Siempre | CuentasPorPagarPage.tsx:328-343, 375, 402-409, 436 |
| 23 | toggle | Checkbox de cabecera + checkbox por fila | Selección múltiple (solo para exportar a banca) | Siempre | `CuentasPorPagarTable.tsx:188-194, 229-237` |
| 24 | columna | «Proveedor» → nombre azul clicable al detalle + «NIT: {x}» + contacto + teléfono (`tel:`) + email (`mailto:`) | — | Siempre | CuentasPorPagarTable.tsx:195, 239-278 |
| 25 | columna | «Factura» → `CopyableId` con `number_ext` + fecha de emisión; «Sin factura» | — | ≥`sm` | CuentasPorPagarTable.tsx:196, 280-300 |
| 26 | columna | «Fecha Venc.» (Calendar) — rojo si vencida, amarillo si ≤7 días, gris si no; «Sin fecha» | `formatDate` con `useFormatDate()` | ≥`md` | CuentasPorPagarTable.tsx:197, 302-309 |
| 27 | columna | «Monto» (derecha, + divisa de la factura o «COP») · «Saldo» (derecha, azul, + «Pagado: {importe}» si difiere) | — | Siempre / ≥`lg` | CuentasPorPagarTable.tsx:198-199, 311-333 |
| 28 | badge | «Vencida ({n}d)» (AlertCircle, rojo) — **tiene prioridad sobre el estado** · «Pendiente» (gris) · «Parcial» (borde amarillo) · «Pagada» (verde) · texto crudo | Columna «Estado» | — | CuentasPorPagarTable.tsx:89-107 |
| 29 | menú | (MoreHorizontal, ghost) → «Ver Detalle» (Eye) · «Registrar Pago» (CreditCard) · «Programar Pago» (Clock) · «Pagar con Open Finance» (Wallet) · «Copiar Info» (Building2) · «Ver Factura» (FileText) | **«Registrar Pago» y «Programar Pago» se ofrecen incluso en cuentas ya pagadas**; solo Open Finance comprueba `status !== 'paid' && balance > 0` | Por fila | CuentasPorPagarTable.tsx:340-379 |
| 30 | toast | «Información copiada» / «Los datos del proveedor se copiaron al portapapeles» | «Copiar Info» | — | CuentasPorPagarTable.tsx:156-159 |
| 31 | estado | 5 filas de `Skeleton` con las mismas 8 columnas y sus breakpoints | Carga | `loading` | CuentasPorPagarTable.tsx:168-179, 205-209 |
| 32 | estado | FileText + «No hay cuentas por pagar» + «Los pagos pendientes aparecerán aquí» (`colSpan={8}`) | Vacío — **no distingue «sin datos» de «sin resultados»** | — | CuentasPorPagarTable.tsx:210-224 |
| 33 | paginación | «Mostrando {a} a {b} de {n} registros» (móvil «{a}-{b} de {n}») + «Filas» 10/25/50/100 + primera/anterior/números/siguiente/última | `DataTablePagination` — **el único uso del componente compartido en todo el módulo** | Con datos | CuentasPorPagarTable.tsx:391-400 |
| 34 | toast | «Error» / «No se pudieron cargar las cuentas por pagar» · «Datos actualizados» / «La información se ha actualizado correctamente» · «Error» / «No se pudieron cargar los proveedores» | — | — | CuentasPorPagarPage.tsx:120-124, 159-162 · Filtros:70-74 |

Consulta directa a `accounts_payable` con joins embebidos a `suppliers` e `invoice_purchase`, `count:'exact'`, orden `due_date` ascendente y `range()` (`CuentasPorPagarService.ts:82-178`). Los `days_overdue` se recalculan **en cliente** usando `getToday(timezone)` de la organización (:186-191). El resumen son 3 consultas más agregadas en JS (:209-320). **La tabla no tiene vista de tarjetas**: esconde 3 columnas progresivamente y desborda en horizontal. **No existe**: orden por columna, «marcar como pagada» desde el listado, ni exportación CSV (la de banca es otra cosa).

#### C.3-bis Diálogo «Registrar Pago» — `cuentas-por-pagar/RegistrarPagoModal.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 35 | diálogo | «Registrar Pago» (CreditCard), `sm:max-w-xl lg:max-w-2xl`, `max-h-[90vh]` | Modal | `isOpen` | RegistrarPagoModal.tsx:228-235 |
| 36 | texto | Proveedor (Building2) + «NIT: {x}» + «Factura: {x}» + «Vence: {fecha}» + badge «Vencida {n}d» + «Saldo pendiente» / importe azul `text-xl` | Contexto | Siempre | RegistrarPagoModal.tsx:239-283 |
| 37 | campo | «Monto del Pago *» (DollarSign, placeholder «0.00», `min=0.01 max={balance}`) | Prellenado con el saldo; AlertCircle rojo dentro si excede | Siempre | RegistrarPagoModal.tsx:287-310 |
| 38 | estado | Caja roja «Monto excedido» + «El monto ingresado ({x}) excede el saldo pendiente de {y}» + «Exceso: {z}» | Validación en vivo | — | RegistrarPagoModal.tsx:312-326 |
| 39 | toast | «Monto excedido» / «El monto ingresado ({x}) excede el saldo pendiente de {y}» | **Se dispara en cada tecla**, además del bloque anterior | — | RegistrarPagoModal.tsx:171-177 |
| 40 | botón | «Pago completo» / «50%» (outline sm) | Rellenan `balance` y `balance/2` | Siempre | RegistrarPagoModal.tsx:334-353 |
| 41 | campo | «Fecha del Pago *» (Calendar, `type=date`) | Por defecto `todayInTz(timezone)` — **correcto, pero el valor no se envía** (§H.3) | Siempre | RegistrarPagoModal.tsx:357-376 |
| 42 | campo | «Método de Pago *» (CreditCard, placeholder «Seleccionar método de pago») | Cada ítem con badge «Requiere referencia» si aplica | `disabled` mientras cargan | RegistrarPagoModal.tsx:380-418 |
| 43 | campo | «Cuenta Bancaria (Opcional)» (Landmark, placeholder «Seleccionar cuenta bancaria»; opción «Sin especificar»; ítems «{bank_name} - {name} ({currency})») + «Seleccione la cuenta bancaria desde donde se realizará el pago» | **Sin efecto: no se envía** (§H.3) | Si hay cuentas | RegistrarPagoModal.tsx:421-456 |
| 44 | campo | «Referencia» (+ `*` si el método la exige; placeholder «Número de transacción, cheque, etc.») | — | Siempre | RegistrarPagoModal.tsx:459-477 |
| 45 | campo | «Notas» (`Textarea rows={3}`, placeholder «Comentarios adicionales sobre el pago...») | **Sin efecto: no se envía** | Siempre | RegistrarPagoModal.tsx:480-491 |
| 46 | botón | «Cancelar» / «Registrar Pago» (CheckCircle) → «Registrando...» (Loader2) → **«Monto Excedido»** (AlertCircle, botón rojo) | **Tres estados del mismo botón** | `disabled` si excede o ≤0 | RegistrarPagoModal.tsx:494-528 |
| 47 | estado | «El monto debe ser mayor a 0» · «El monto no puede ser mayor al saldo pendiente» · «Debe seleccionar un método de pago» · «Debe seleccionar una fecha de pago» · «La referencia es requerida para este método de pago» | Mensajes de campo en rojo con AlertCircle | Al enviar | RegistrarPagoModal.tsx:126-156 |
| 48 | toast | «Pago registrado» / «Se registró el pago de {importe} correctamente» · «Error al registrar pago» / {mensaje} · «Error» / «No se pudieron cargar los métodos de pago» | — | — | RegistrarPagoModal.tsx:199-211, 115-119 |

`registrarPago` (`CuentasPorPagarService.ts:436-499`) inserta en `payments` con `source='account_payable'` y llama a `actualizarBalancesDespuesDePago` (:597-652), que hace `UPDATE` de `accounts_payable` y, si hay factura, de `invoice_purchase`. **No hay doble contabilización** (ningún trigger cubre `source='account_payable'`), pero sí **falta de atomicidad y pisado de `invoice_purchase.status`** (§H.1 #7-#8).

#### C.3-ter Diálogo «Programar Pago» — `cuentas-por-pagar/ProgramarPagoModal.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 49 | diálogo | «Programar Pago» (Clock), `sm:max-w-xl lg:max-w-2xl` | Modal | `isOpen` | ProgramarPagoModal.tsx:241-248 |
| 50 | texto | Proveedor + NIT + «Factura: {x}» + «Vencida hace {n} días» / «Vence hoy» / «Vence mañana» / «Vence en {n} días» / «Sin fecha de vencimiento» (rojo / naranja ≤3 d / amarillo ≤7 d / verde) + «Saldo pendiente» | Contexto | Siempre | ProgramarPagoModal.tsx:252-289, 220-238 |
| 51 | estado | Tarjeta azul «Acerca de la programación de pagos» (Info) + «Los pagos programados quedan pendientes de aprobación por un supervisor. Una vez aprobados, podrán ser procesados o exportados para banca online.» | Explicación | Siempre | ProgramarPagoModal.tsx:292-307 |
| 52 | campo | «Monto del Pago *» + el mismo bloque de exceso y los botones «Pago completo» / «50%» | — | Siempre | ProgramarPagoModal.tsx:311-378 |
| 53 | campo | «Fecha Programada *» (`type=date`, `min={todayInTz}`) | Por defecto la fecha de vencimiento | Siempre | ProgramarPagoModal.tsx:381-400 |
| 54 | botón | «Hoy» / «Vencimiento» (outline sm) | Atajos de fecha | «Vencimiento» solo con `due_date` | ProgramarPagoModal.tsx:401-422 |
| 55 | campo | «Método de Pago Preferido *» (placeholder «Seleccionar método de pago») | Con badge «Requiere referencia» | Siempre | ProgramarPagoModal.tsx:427-464 |
| 56 | campo | «Referencia Sugerida» (placeholder «Número de transacción, cheque, etc.») + «Opcional: Se puede completar al momento de la aprobación» | — | Siempre | ProgramarPagoModal.tsx:467-482 |
| 57 | campo | «Notas / Justificación» (`Textarea rows={3}`, placeholder «Motivo de la programación, instrucciones especiales, etc.») | **Sin efecto: no se envía** | Siempre | ProgramarPagoModal.tsx:485-496 |
| 58 | botón | «Cancelar» / «Programar Pago» (CheckCircle) → «Programando...» → «Monto Excedido» | Tres estados | — | ProgramarPagoModal.tsx:498-534 |
| 59 | estado | «El monto debe ser mayor a 0» · «El monto no puede ser mayor al saldo pendiente» · «Debe seleccionar una fecha para el pago» · «La fecha programada no puede ser anterior a hoy» · «Debe seleccionar un método de pago» | Validaciones | Al enviar | ProgramarPagoModal.tsx:121-143 |
| 60 | toast | «Pago programado» / «Se programó el pago de {importe} para el {fecha}» · «Error al programar pago» / {mensaje} | — | — | ProgramarPagoModal.tsx:190-202 |

`programarPago` (`CuentasPorPagarService.ts:366-431`) inserta en `payments` con `status='pending'` y, sin referencia, escribe «Pago programado para {fecha}» en `reference`: **la fecha programada no tiene columna propia, vive dentro de ese texto** — y el aprobador la destruye al sobrescribir `reference` (§H.1 #14).

#### C.3-quater Diálogo «Aprobación de Pagos» — `cuentas-por-pagar/AprobacionPagosModal.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 61 | diálogo | «Aprobación de Pagos» (Clock) + badge «{n} pendiente(s)», `sm:max-w-4xl lg:max-w-6xl` | Modal | `isOpen && !mostrarDetalle` | AprobacionPagosModal.tsx:205-219 |
| 62 | estado | 3 tarjetas `Skeleton` · CheckCircle verde 48 px + «No hay pagos pendientes» + «Todos los pagos programados han sido revisados» | Carga / vacío | — | AprobacionPagosModal.tsx:222-259 |
| 63 | texto | Tarjeta por pago (borde izquierdo azul): proveedor o «Pago #{8 chars}» + «NIT: {x}» + «Creado: {fecha}» + «Creado hoy» / «Creado ayer» / «Creado hace {n} días» + solicitante + referencia (MessageSquare) + «Monto» / importe azul `text-xl` | Lista | Con pendientes | AprobacionPagosModal.tsx:263-323 |
| 64 | badge | «Pendiente» (borde amarillo) · «Aprobado» (verde) · «Rechazado» (rojo) · «Procesado» (gris) | **Solo «Pendiente» es alcanzable** (§H.4) | — | AprobacionPagosModal.tsx:166-180 |
| 65 | botón | «Ver» (Eye, outline sm) · (solo icono CheckCircle, verde) · (solo icono XCircle, destructive) | Detalle / aprobar / rechazar; los iconos pasan a `Loader2` | Por pago | AprobacionPagosModal.tsx:327-363 |
| 66 | campo | «Comentarios de aprobación/rechazo» (`RichTextEditor`, placeholder «Agregar comentarios sobre la decisión...», `minHeight=60`) | **Se guarda sobrescribiendo `payments.reference`** | Por pago | AprobacionPagosModal.tsx:369-380 |
| 67 | diálogo | «Detalle del Pago Programado» (FileText), `sm:max-w-xl lg:max-w-2xl` · «Información del Proveedor» («Nombre:», «NIT:») · «Información del Pago» («Monto:», «Fecha creado:», **«Monto del pago:»** — el mismo dato que «Monto:», repetido —, «Fecha vencimiento:») · «Información de Solicitud» («Solicitado por:» o «Usuario desconocido», «Fecha de solicitud:», «Referencia:») | Sub-modal | `mostrarDetalle` | AprobacionPagosModal.tsx:391-484 |
| 68 | toast | «Pago aprobado» / «El pago fue aprobado correctamente» · «Comentario requerido» / «Debe agregar un comentario al rechazar un pago» · «Pago rechazado» / «El pago fue rechazado correctamente» · «Error al aprobar» / «Error al rechazar» / {mensaje} · «Error» / «No se pudieron cargar los pagos pendientes» | — | — | AprobacionPagosModal.tsx:101-151, 82-86 |

#### C.3-quinquies Diálogo «Exportar / Conciliar Banca» — `cuentas-por-pagar/ExportarBancaModal.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 69 | diálogo | «Exportar / Conciliar Banca» (FileSpreadsheet) + badge «{n} cuenta(s)», `sm:max-w-3xl lg:max-w-5xl` | Modal | `isOpen` | ExportarBancaModal.tsx:342-354 |
| 70 | pestaña | «Exportar Pagos» (Download) · «Conciliar Archivo» (Upload) | **`<button>` planos con borde inferior azul, no `Tabs` de shadcn** | Siempre | ExportarBancaModal.tsx:358-379 |
| 71 | texto | «Resumen de Exportación» / «{n} cuenta(s) seleccionada(s)» / «Total a pagar» / importe azul `text-xl` | Resumen | Pestaña exportar | ExportarBancaModal.tsx:387-404 |
| 72 | campo | «Formato Bancario *» (placeholder «Seleccionar formato de banco»): «Bancolombia TXT» (.txt) · «Davivienda CSV» (.csv) · «BBVA Excel» (.xlsx) · «CSV Genérico» (.csv), cada uno con badge de extensión | **Ninguna rama del `switch` coincide con estos valores**: siempre sale el CSV genérico, con la extensión equivocada (§H.2) | Pestaña exportar | ExportarBancaModal.tsx:407-426, 59-88 vs 149-154 |
| 73 | columna | «Proveedor» · «Vencimiento» (con badge «+{n}d» si está vencida) · «Monto» (derecha) | Previsualización (`max-h-60`) | Pestaña exportar | ExportarBancaModal.tsx:445-489 |
| 74 | exportación | `pagos_AAAA-MM-DD{extensión}` con `NIT,Nombre,Monto,Referencia,Vencimiento` | Solo crea una fila en `bank_files` con `records_count`: **no guarda el contenido** | — | ExportarBancaModal.tsx:212-265 · CuentasPorPagarService.ts:882-935 |
| 75 | botón | «Exportar Archivo» (Download) → «Exportando...» (Loader2) | `disabled` sin formato | — | ExportarBancaModal.tsx:583-599 |
| 76 | campo | «Subir Archivo Bancario» (`type=file accept=".txt,.csv,.xlsx"`) + «Soporta archivos TXT, CSV y XLSX de confirmación bancaria» + botón (icono X, ghost sm) para descartar | Parsea en el navegador | Pestaña conciliar | ExportarBancaModal.tsx:498-532 |
| 77 | columna | «Estado» · «Referencia» (`font-mono`) · «Beneficiario» (o «Sin descripción») · «Monto» (derecha) · «Fecha» | Registros del archivo | Tras subir | ExportarBancaModal.tsx:539-569 |
| 78 | estado | CheckCircle verde (matched) · AlertTriangle amarillo (unmatched) · AlertCircle rojo (duplicate) · gris; el estado en `capitalize`. **Todos los registros se marcan `unmatched`** | Por fila | — | ExportarBancaModal.tsx:328-339, 116 |
| 79 | botón | «Conciliar Pagos» (CheckCircle) → «Conciliando...» | **Simulación**: `setTimeout` de 1 s con `console.log` (§H.3) | `disabled` sin registros | ExportarBancaModal.tsx:601-617, 132-140 |
| 80 | toast | «Formato requerido» / «Debe seleccionar un formato bancario» · «Archivo exportado» / «Se exportaron {n} pagos correctamente» · «Archivo procesado» / «Se procesaron {n} registros del archivo bancario» · «Conciliación completada» / «Se conciliaron {n} pagos correctamente» · «Error al exportar» · «Error al procesar archivo» · «Formato de archivo no válido» · «Error en conciliación» | — | — | ExportarBancaModal.tsx:214-318 |

#### C.3-sexies Diálogo «Pagar con Open Finance» — `cuentas-por-pagar/PayWithOpenFinanceDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 81 | diálogo | «Pagar con Open Finance» (Wallet azul) / «Inicia una transferencia bancaria **automatica** al proveedor» (**sin tilde**), `sm:max-w-[500px]` | Modal | `open` | PayWithOpenFinanceDialog.tsx:228-237 |
| 82 | texto | Proveedor (Building2) + «Monto:» + «Vencimiento:» (o «Sin fecha») | Contexto | Siempre | PayWithOpenFinanceDialog.tsx:241-262 |
| 83 | campo | «Cuenta bancaria origen» (placeholder «Seleccionar cuenta bancaria»; ítems «{name} - {bank_name o 'Sin banco'} ({saldo})») | `bank_accounts` activas | Siempre | PayWithOpenFinanceDialog.tsx:265-293 |
| 84 | estado | `Skeleton h-10 w-full` · «No hay cuentas bancarias activas configuradas» | Carga / vacío | — | PayWithOpenFinanceDialog.tsx:269-274 |
| 85 | botón | «Validar cuenta del proveedor» (CheckCircle, outline sm `w-full`) → «Validando...» | `POST /api/integrations/open-finance/validate-supplier` | `disabled` sin `supplierId` | PayWithOpenFinanceDialog.tsx:297-315 |
| 86 | estado | `Alert` verde «Cuenta validada» + «Titular: {x}» / «Banco: {x}» / «Cuenta: {x}» · `Alert` destructivo «Cuenta no validada» + lista de avisos · `Alert` amarillo con avisos | 3 resultados de validación | — | PayWithOpenFinanceDialog.tsx:322-367 |
| 87 | botón | «Cancelar» / «Pagar {importe}» (Wallet) → «Procesando...» | `POST /api/integrations/open-finance/pay-supplier` — **recibe `NaN`** desde el listado (§H.2) | `disabled` sin cuenta origen | PayWithOpenFinanceDialog.tsx:372-396 |
| 88 | toast | «Error» / «No se **encontro** el ID del proveedor» · «Error de **validacion**» / {mensaje} (**ambos sin tilde**) · «Seleccionar cuenta» / «Debe seleccionar una cuenta bancaria origen» · «Pago iniciado» / «Transferencia a {proveedor} por {importe} iniciada correctamente» · «Error en el pago» / {mensaje} | — | — | PayWithOpenFinanceDialog.tsx:141-220 |

### C.4 Detalle de cuenta por pagar `/app/finanzas/cuentas-por-pagar/[id]` — `cuentas-por-pagar/id/CuentaPorPagarDetailPage.tsx`

Gemela de C.2 con cuatro asimetrías de fondo. **Esta sí usa `formatDateInTz`/`formatDateTimeInTz`
con el huso de la organización**, al contrario que su equivalente de cobrar.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Círculo + 2 líneas + 4 tarjetas + 2 paneles `Skeleton` · AlertCircle + «Cuenta no encontrada» + «La cuenta por pagar solicitada no existe o no tienes permisos para verla.» + «Volver a Cuentas por Pagar» | Carga / error | — | CuentaPorPagarDetailPage.tsx:125-169 |
| 2 | texto | «Cuenta por Pagar» (h1, Receipt en caja azul) + «ID: {uuid}» | Cabecera | Siempre | CuentaPorPagarDetailPage.tsx:184-194 |
| 3 | badge | «Pendiente» (amarillo) · **«Pago Parcial»** (morado) · «Pagada» (**verde**) · «Vencida» (rojo); fallback «Pendiente» | `AccountStatusBadge` de CxP — **paleta y etiquetas distintas de las de CxC** | Siempre | `id/AccountStatusBadge.tsx:9-26` |
| 4 | botón | «Registrar Pago» (DollarSign, azul) · «Marcar como Pagada» (borde verde) | **`document.getElementById(...)?.click()`** sobre los botones del panel inferior | Según estado | CuentaPorPagarDetailPage.tsx:198-218 |
| 5 | exportación | «Exportar Estado» (Download) → `estado_cuenta_{Proveedor}_AAAA-MM-DD.txt` con «ESTADO DE CUENTA POR PAGAR» + `==========================` + Proveedor / NIT / Factura / Fecha de Vencimiento / Monto Original / Total Pagado / Balance Pendiente / Estado / Días de Atraso / Fecha de Generación | — | Siempre | CuentaPorPagarDetailPage.tsx:219-227, 76-115 |
| 6 | botón | «Actualizar» → «Actualizando...» | Recarga | Siempre | CuentaPorPagarDetailPage.tsx:228-236 |
| 7 | stat | «Monto Original» (DollarSign azul) · «Balance Pendiente» (Receipt rojo) · «Fecha de Vencimiento» (Calendar naranja) · «Días de Atraso» (Clock morado) | 4 KPIs | Siempre | CuentaPorPagarDetailPage.tsx:242-308 |
| 8 | cálculo | «Al día» · «1-30 días» · «31-60 días» · **«Más de 60 días»** | `getAgingInfo` — **4 tramos; CxC tiene 5** | Siempre | `id/service.ts:146-176` |
| 9 | texto | «Información del Proveedor» (Building2 azul) + nombre / «NIT: {x}» / email / teléfono / «Contacto: {x}» | Panel izquierdo | Cada línea si existe | CuentaPorPagarDetailPage.tsx:314-363 |
| 10 | botón | «Ver Perfil del Proveedor» (ExternalLink, outline sm) | `/app/inventario/proveedores/{uuid}` | Si hay `supplier_uuid` | CuentaPorPagarDetailPage.tsx:365-375 |
| 11 | texto | «Factura de Compra» + número + fecha + «Ver Factura» (FileText) · «Fecha de Creación» / «Última Actualización» | `formatDateTimeInTz` | Siempre / si hay factura | CuentaPorPagarDetailPage.tsx:380-424 |
| 12 | texto | «Acciones de Cuenta» (Edit azul) + «Gestiona pagos y operaciones para esta cuenta» | Panel derecho | Siempre | `id/AccountActionsCard.tsx:219-225` |
| 13 | chip | «Atención requerida» (amarillo) · «Urgente» (naranja) · «Crítico» (rojo) | **Es un `<span>`, no un `Badge` como en CxC** | `days_overdue > 0` | id/AccountActionsCard.tsx:190-212 |
| 14 | botón | «Registrar Pago» (CreditCard, azul), `id="btn-registrar-pago"` | **Botón normal en fila, no tarjeta ancha como en CxC** | `canRegisterPayment` | id/AccountActionsCard.tsx:236-241 |
| 15 | diálogo | «Registrar Pago» / «Balance pendiente: {importe}» | Modal | — | id/AccountActionsCard.tsx:242-250 |
| 16 | campo | «Aplicar a cuota (opcional)» (placeholder «Seleccionar cuota o aplicar automáticamente») + «Aplicar automáticamente a cuotas pendientes» + «Cuota #{n} - Saldo: {importe}» + «Si no seleccionas una cuota, el pago se aplicará automáticamente a las cuotas más antiguas» | — | Con cuotas pendientes | id/AccountActionsCard.tsx:253-284 |
| 17 | campo | «Monto del pago» (placeholder «0.00») + «Pago total» / «50%» | — | Siempre | id/AccountActionsCard.tsx:286-317 |
| 18 | campo | «Fecha de Pago» (`type=date`, `max={todayInTz}`, `min={emisión en tz}`) + «La fecha no puede ser anterior a la emisión» | **Aquí sí se envía**, al contrario que en el modal del listado | Siempre | id/AccountActionsCard.tsx:318-339 |
| 19 | campo | «Método de pago» (placeholder «Seleccionar método») · «Cuenta bancaria (opcional)» (placeholder «Seleccionar cuenta»; ítems «{name} - {bank_name}» con Building2) | **La cuenta sí se envía como `payments.bank_account_id`** | Siempre / si hay cuentas | id/AccountActionsCard.tsx:340-384 |
| 20 | campo | «Referencia *» (placeholder «Número de comprobante») | **Solo se pinta si el método la exige** | `requiresReference` | id/AccountActionsCard.tsx:385-397 |
| 21 | botón | «Registrar Pago» → «Procesando...» (DollarSign, `w-full`) | `pagarCuota()` / reparto automático / `registrarPago()` | Siempre | id/AccountActionsCard.tsx:398-405, 73-147 |
| 22 | botón | «Marcar como Pagada» (CheckCircle, borde verde), `id="btn-marcar-pagada"` + diálogo «Marcar como Pagada» / «¿Estás seguro de que deseas marcar esta cuenta como pagada?» + caja amarilla «Balance pendiente: {importe}» + «Esta acción creará un registro de pago por el balance total pendiente.» + «Cancelar» / «Confirmar» → «Procesando...» | **«Cancelar» no está envuelto en `DialogClose`: no cierra el diálogo** (§H.3) | `canMarkAsPaid` | id/AccountActionsCard.tsx:414-456, 442-444 |
| 23 | exportación | «Exportar Estado» (Download, outline) | **Segundo botón con el mismo nombre y distinto generador** que #5 | Siempre | id/AccountActionsCard.tsx:460-467, 169-188 |
| 24 | texto | «Monto original:» · «Total pagado:» · «Balance pendiente:» (rojo) | Pie del panel | Siempre | id/AccountActionsCard.tsx:471-486 |
| 25 | texto | «Historial de Pagos» (CreditCard azul) + badge «{n} pago(s)» | Panel inferior | Siempre | `id/PaymentHistoryCard.tsx:88-94` |
| 26 | texto | Icono de estado en círculo + importe + método traducido + «Ref: {x}» + nombre de la cuenta bancaria (Building2) + badge + fecha | Lista | Por pago | id/PaymentHistoryCard.tsx:104-148 |
| 27 | badge | «Completado» (verde, CheckCircle) · «Pendiente» (amarillo, Clock) · «Fallido» (rojo, XCircle) · «Cancelado» (gris, XCircle) | **4 variantes; CxC tiene 3** | — | id/PaymentHistoryCard.tsx:19-24 |
| 28 | texto | «Efectivo» · «Tarjeta de Crédito» · «Tarjeta de Débito» · «Transferencia» · «Cheque» · «Nequi» · «Daviplata» · «PSE» | Mapa de métodos — **8 etiquetas; CxC tiene 4** | — | id/PaymentHistoryCard.tsx:26-38 |
| 29 | estado | 3 `Skeleton h-16` · CreditCard 48 px + «No hay pagos registrados» | Carga / vacío | — | id/PaymentHistoryCard.tsx:67-101 |
| 30 | toast | «Cuenta por pagar no encontrada» · «Error al cargar los detalles de la cuenta» · «Estado de cuenta exportado» · «Error al exportar el estado de cuenta» · «Por favor ingresa un monto válido» · «El monto no puede ser mayor al balance pendiente» · «Por favor selecciona un método de pago» · «Este método de pago requiere una referencia» · «Pago registrado exitosamente» · «Error al registrar el pago» · «Cuenta marcada como pagada» · «Error al marcar la cuenta como pagada» | — | — | CuentaPorPagarDetailPage.tsx:44-113 · id/AccountActionsCard.tsx:75-163 |

**No existe**: edición de la cuenta, anulación de un pago ya registrado, adjuntos, historial de auditoría, **ni enlace a la pantalla `/cuotas`** (C.5).

#### C.4-bis Plan de cuotas (CxP) — `cuentas-por-pagar/id/InstallmentsCard.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 31 | texto | «Plan de Cuotas» (CalendarDays azul) + «{n} cuotas programadas» / «Crea un plan de pagos fraccionados» | **Descripción dinámica; CxC no la tiene** | Siempre | id/InstallmentsCard.tsx:231-239 |
| 32 | botón | «Crear Cuotas» (Plus, azul) | Abre el diálogo | Sin cuotas | id/InstallmentsCard.tsx:245-248 |
| 33 | diálogo | «Crear Plan de Cuotas» / «Divide el saldo pendiente de {importe} en cuotas mensuales» | Modal | — | id/InstallmentsCard.tsx:250-256 |
| 34 | campo | «Número de cuotas» (`min=2 max=60`) | **Validación coherente 2..60; en CxC el `max` es 60 y la validación 36** | — | id/InstallmentsCard.tsx:258-271, 101 |
| 35 | campo | «Tasa de interés mensual (%)» (`min=0 max=100 step=0.1`) | **Sí se envía a `crearCuotas`, al contrario que en CxC** | — | id/InstallmentsCard.tsx:272-286, 108-114 |
| 36 | cálculo | «Cuota estimada: {importe}» (caja azul) | `(total / n) * (1 + interés/100)` — **sí incluye el interés** | — | id/InstallmentsCard.tsx:287-295 |
| 37 | botón | «Cancelar» / «Crear Cuotas» → «Creando...» | — | — | id/InstallmentsCard.tsx:297-308 |
| 38 | botón | «Eliminar Plan» (Trash2, texto rojo) + diálogo «¿Eliminar plan de cuotas?» / «Esta acción eliminará todas las cuotas programadas. Los pagos ya realizados no se verán afectados.» + «Cancelar» / «Eliminar» | Confirmación | Con cuotas | id/InstallmentsCard.tsx:313-334 |
| 39 | estado | CalendarDays 48 px + «No hay cuotas programadas» + «Crea un plan de cuotas para fraccionar el pago» | Vacío | — | id/InstallmentsCard.tsx:341-346 |
| 40 | texto | Círculo 40 px con el número + importe + «Vence: {fecha}» + «Pagado: {importe}» (verde) | Lista | Por cuota | id/InstallmentsCard.tsx:354-375 |
| 41 | badge | «Pendiente» (amarillo, CalendarDays) · «Parcial» (morado, DollarSign) · «Pagada» (verde, CheckCircle) · «Vencida» (rojo, AlertTriangle) | **4 variantes con icono; CxC tiene 3 sin icono** | — | id/InstallmentsCard.tsx:26-47 |
| 42 | cálculo | Marcado de vencidas en cliente: `pending` con `due_date < hoy` pasa a `overdue` | **Solo visual, no persiste** | Al cargar | id/InstallmentsCard.tsx:82-89 |
| 43 | botón | «Saldo: {importe}» + «Pagar» (CreditCard, borde azul) + diálogo «Pagar Cuota #{n}» / «Saldo pendiente: {importe}» con «Monto a pagar», «Pago total» / «50%», «Método de pago», «Referencia (opcional)» (placeholder «Número de comprobante») y «Cancelar» / «Registrar Pago» → «Procesando...» | — | Si no está pagada | id/InstallmentsCard.tsx:381-488 |
| 44 | toast | «El número de cuotas debe estar entre 2 y 60» · «Cuotas creadas exitosamente» · «Error al crear las cuotas» · «Cuotas eliminadas» · «Error al eliminar las cuotas» · «Ingresa un monto válido» · «El monto no puede ser mayor al saldo de la cuota» · «Selecciona un método de pago» · «Pago registrado exitosamente» · «Error al registrar el pago» · «Error al cargar las cuotas» | — | — | id/InstallmentsCard.tsx:94-198 |

`crearCuotas` (`id/service.ts:221-274`) **sí desglosa `principal` e `interest` por cuota** y usa `toPlainDate(dueDate, timezone)`. `pagarCuota` (:356-403) actualiza `ap_installments` a mano y llama a `registrarPago`, con las mismas salvedades de atomicidad y de pisado de `invoice_purchase.status` que C.3-bis.

### C.5 Plan de cuotas `/app/finanzas/cuentas-por-pagar/[id]/cuotas` — `cuentas-por-pagar/id/cuotas/CuotasPage.tsx`

**Ruta huérfana**: `grep` sobre `src/` no encuentra ningún `Link` ni `router.push` hacia `/cuotas`.
Y es **el único sitio del módulo donde se puede editar una cuota**.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `Skeleton h-10 w-64` + 4 tarjetas + bloque `h-96` · «Cuenta no encontrada» + «Volver» | Carga / error | — | CuotasPage.tsx:275-298 |
| 2 | botón | (icono ArrowLeft 16 px, ghost icon) | Vuelve al detalle de la cuenta | Siempre | CuotasPage.tsx:307-314 |
| 3 | texto | «Plan de Cuotas» (h1) + «{proveedor} • {número de factura o 'Sin factura'}» | Cabecera | Siempre | CuotasPage.tsx:315-322 |
| 4 | botón | «Actualizar» (RefreshCw, outline) | Recarga | Siempre | CuotasPage.tsx:325-332 |
| 5 | botón | «Crear Plan» (Plus, azul) | Abre el diálogo de creación | Sin cuotas | CuotasPage.tsx:334-340 |
| 6 | botón | «Eliminar Plan» (Trash2, texto rojo, outline) | **Borra directamente, SIN confirmación** (el mismo botón del detalle sí confirma) | Con cuotas | CuotasPage.tsx:342-349 |
| 7 | stat | «Total Plan» · «Pagado» (verde) · «Por Pagar» (naranja) · «Cuentas Vencidas» (rojo si >0) | 4 KPIs | Siempre | CuotasPage.tsx:356-406 |
| 8 | texto | «Cronograma de Pagos» (CalendarDays azul) + «{n} cuotas programadas» / «No hay cuotas programadas» | Cabecera de la lista | Siempre | CuotasPage.tsx:412-420 |
| 9 | estado | CalendarDays 64 px + «No hay plan de cuotas» + «Crea un plan para fraccionar el pago de esta cuenta» + botón «Crear Plan de Cuotas» (Plus, azul) | **Vacío con su propio CTA: segundo punto de entrada al diálogo** | Sin cuotas | CuotasPage.tsx:423-434 |
| 10 | texto | Círculo 48 px con el número + importe + badge + «Vence: {fecha}» | **Lista de `<div>`, no tabla** | Con cuotas | CuotasPage.tsx:445-466 |
| 11 | badge | «Pendiente» (amarillo, **Clock**) · «Parcial» (morado, DollarSign) · «Pagada» (verde, CheckCircle) · «Vencida» (rojo, AlertTriangle) | **El icono de «Pendiente» es Clock, no CalendarDays como en C.4-bis** | — | CuotasPage.tsx:40-61 |
| 12 | texto | «Pagado: {importe} • Saldo: {importe}» (`text-xs` gris) | Desglose | Si `paid_amount > 0` | CuotasPage.tsx:467-473 |
| 13 | cálculo | Barra de progreso verde `h-2`, ancho = `paid_amount / amount * 100` | **Solo existe en esta pantalla** | Si `paid_amount > 0` | CuotasPage.tsx:441-443, 474-479 |
| 14 | texto | Notas de la cuota en cursiva `text-xs` gris claro | — | Si hay notas | CuotasPage.tsx:482-486 |
| 15 | botón | (icono Edit2, outline sm) · «Pagar» (DollarSign, **`bg-green-600`**, no azul) | Editar / pagar | Si no está pagada | CuotasPage.tsx:492-507 |
| 16 | diálogo | «Crear Plan de Cuotas» / «Divide el saldo de {importe} en cuotas mensuales» + «Número de cuotas» (`min=2 max=60`) + «Tasa de interés mensual (%)» + «Cuota estimada: {importe}» (caja azul, **sí incluye el interés**) + «Cancelar» / «Crear Plan» → «Creando...» | Alta | `showCreateDialog` | CuotasPage.tsx:520-573 |
| 17 | diálogo | **«Pagar Cuota {n}»** (SIN `#`, a diferencia de C.4-bis) / «Saldo pendiente: {importe}» | Pago de cuota | `showPayDialog` | CuotasPage.tsx:578-587 |
| 18 | campo | «Monto a pagar» (`type=number`, **sin placeholder**) + botón **«Pago total»** (outline sm) — **sin el «50%» que sí tienen las demás** | Prellenado con el saldo | — | CuotasPage.tsx:589-607 |
| 19 | campo | «Método de pago» (placeholder «Seleccionar método») | **ROTO**: usa `method.payment_methods?.code` y el servicio devuelve `payment_method` (singular) → todos los `SelectItem` valen `''` y Radix no los admite. **Desde esta pantalla no se puede pagar** (§H.2) | — | CuotasPage.tsx:609-626 vs `id/service.ts:465-473` |
| 20 | campo | «Cuenta bancaria (opcional)» (placeholder «Seleccionar cuenta»; ítems «{name} - {bank_name}») | `value={account.id}` es **número** y Radix exige string | Si hay cuentas | CuotasPage.tsx:627-646 |
| 21 | campo | «Referencia (opcional)» (placeholder «Número de comprobante») | — | — | CuotasPage.tsx:647-655 |
| 22 | botón | «Cancelar» / «Registrar Pago» (`bg-green-600`, **sin estado de carga**) | — | — | CuotasPage.tsx:657-667 |
| 23 | diálogo | «Editar Cuota {n}» + «Fecha de vencimiento» (`type=date`) + «Monto» + «Notas» (placeholder «Notas adicionales...») + «Cancelar» / «Guardar Cambios» | **Única edición de cuota del módulo** | `showEditDialog` | CuotasPage.tsx:672-718 |
| 24 | toast | «Cuenta no encontrada» · «Error al cargar los datos» · «El número de cuotas debe estar entre 2 y 60» · «Plan de cuotas creado exitosamente» · «Error al crear el plan de cuotas» · «Plan de cuotas eliminado» · «Error al eliminar el plan» · «Ingresa un monto válido» · «El monto no puede ser mayor al saldo de la cuota» · «Selecciona un método de pago» · «Pago registrado exitosamente» · «Error al registrar el pago» · «Cuota actualizada» · «Error al actualizar la cuota» | — | — | CuotasPage.tsx:110-237 |

Una sola carga con `Promise.all` de cuatro llamadas (`:102-107`). **Las fechas usan `formatPlainDate` y `asPlainDate` de `@/lib/utils/dateDisplay`: correcto para una columna `date`.** Imports muertos: `Separator` (:25), `Download` y `Upload` (:12-13). **No existe**: enlace de entrada, paginación, exportación, reprogramación masiva del plan, ni confirmación al eliminar.

### C.6 Ingresos `/app/finanzas/ingresos` — `components/finanzas/ingresos/IngresosPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(3)` | **Reemplaza toda la pantalla**, también en cada «Actualizar» | `isLoading` | IngresosPage.tsx:147-155 |
| 2 | botón | (icono ArrowLeft, ghost icon) | `Link` a `/app/finanzas` | Siempre | IngresosPage.tsx:162-166 |
| 3 | texto | «Ingresos» (h1, **TrendingUp verde** en cuadro `bg-green-100 rounded-xl`) / «Gestión de ingresos no relacionados a ventas» | Cabecera | Siempre | IngresosPage.tsx:167-176 |
| 4 | exportación | «Exportar» (Download, outline) → `ingresos_AAAA-MM-DD.csv` con `ID,Fecha,Concepto,Monto,Notas` | **Exporta `movements`, no `filteredMovements`: ignora la búsqueda**; sin escapar comas; **omite la columna «Fuente»** que la tabla sí muestra | Siempre | IngresosPage.tsx:180-183, 126-140 |
| 5 | botón | «Importar» (Upload, outline) | **Nada: no tiene `onClick`** | Siempre | IngresosPage.tsx:184-187 |
| 6 | botón | «Nuevo Ingreso» (Plus, azul) | Abre `NuevoIngresoDialog` | Siempre | IngresosPage.tsx:188-191 |
| 7 | badge | «Sucursal:» + valor | `BranchBadge` | Siempre | IngresosPage.tsx:195 |
| 8 | stat | «Total Acumulado» (verde) · «Este Mes» (azul) · «Hoy» (gris) · «Total Registros» | **«Este Mes» y «Hoy» se calculan con `new Date()` del navegador** (§H.5) | Siempre | IngresosPage.tsx:199-246 |
| 9 | campo | Placeholder «Buscar por concepto...» (Search `pl-10`) | Filtra **en cliente** por `concept` y `notes`, **sin debounce** | Siempre | IngresosPage.tsx:251-259, 142-145 |
| 10 | botón | «Actualizar» (RefreshCw, outline) | `loadData()` — pantalla completa a esqueleto | Siempre | IngresosPage.tsx:260-263 |
| 11 | columna | «ID» · «Fuente» · «Fecha» · «Concepto» · «Monto» (derecha) · «Notas» · «Acciones» | 7 columnas | Siempre | IngresosPage.tsx:272-278 |
| 12 | botón | «#{id}» (azul, `hover:underline`) + icono Copy 12 px (`title="Copiar"` / `title="Ver detalle"`) | El texto navega al detalle; **el icono copia el id numérico**, no el uuid | Por fila | IngresosPage.tsx:292-297 |
| 13 | chip | «Caja» (ámbar) / «Banco» (azul) — `rounded-full text-xs px-2 py-1` | **Es un `<span>` crudo, no un `Badge`** | Por fila | IngresosPage.tsx:300-306 |
| 14 | texto | Nombre de la cuenta bancaria (`block text-xs text-gray-500` bajo el concepto) | Contexto de la fila bancaria | Si aplica | IngresosPage.tsx:313-315 |
| 15 | menú | (MoreVertical, ghost 32×32, `align="end"`) → «Ver Detalle» (Eye) · «Editar» (Edit) · «Duplicar» (Copy) · separador · «Anular» (XCircle rojo) | **«Editar» no tiene `onClick`**; las tres últimas solo si `source === 'cash'` | Por fila | IngresosPage.tsx:324-358 |
| 16 | diálogo | **`window.confirm`** «¿Está seguro de anular este ingreso?» + **`window.prompt`** «Motivo de la anulación:» (acepta vacío) | **Ambas acciones fallan siempre** (§H.1 #9-#10) | Tras «Anular» | IngresosPage.tsx:110, 112 |
| 17 | estado | «No hay ingresos registrados» (`colSpan={7}`) | Vacío — **no distingue «sin datos» de «sin resultados»**; y un fallo de sesión se ve igual | — | IngresosPage.tsx:282-287 |
| 18 | toast | «Error» / «No se pudieron cargar los ingresos» · «Éxito» / «Ingreso duplicado correctamente» · «Error» / {result.error} · «Error» / «Error al duplicar» · «Éxito» / «Ingreso anulado correctamente» · «Error» / «Error al anular» | `toast({description: result.error})` **puede quedar con descripción `undefined`** | — | IngresosPage.tsx:81-122 |

La lista es la **unión en cliente** de `cash_movements` (`type='in'`) y `bank_transactions` (`transaction_type='deposit'`), ordenada en JS (`movimientosService.ts:534-605`). Los KPIs son una **segunda ronda de consultas a las mismas dos tablas**, sin agregación en BD (:443-501): dos consultas duplicadas por carga y todo el histórico al navegador. **No existe**: paginación, orden por columna, filtro por fechas/fuente/sucursal, selección múltiple, estado «sin permiso», error reintentable, ni tarjetas en móvil.

#### C.6-bis Diálogo «Nuevo Ingreso» — `ingresos/NuevoIngresoDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 19 | diálogo | «Nuevo Ingreso» (DollarSign verde 20 px) / «Registre un ingreso que no proviene de ventas ni facturas» (`sm:max-w-[500px]`) | Modal | `open` | NuevoIngresoDialog.tsx:134-143 |
| 20 | campo | «Sucursal *» (Building2 14 px, placeholder «Seleccionar sucursal»; ítems con «(principal)» si `is_main`) | `BranchSelectorField` | Siempre | NuevoIngresoDialog.tsx:147 |
| 21 | estado | «Cargando sucursales...» (Select deshabilitado) · «No hay sucursales configuradas» (ámbar, Building2) · «Estás en "Todas las sucursales". Selecciona a qué sucursal pertenece este registro.» (ámbar 12 px, borde ámbar) | 3 estados del selector | — | `BranchSelectorField.tsx:72-132` |
| 22 | campo | «Concepto *» (placeholder «Ej: Aporte de socio, Préstamo, Ajuste...») | Obligatorio | Siempre | NuevoIngresoDialog.tsx:149-160 |
| 23 | campo | «Monto *» (prefijo «$» dentro del input, placeholder «0.00», `step=0.01 min=0`, `pl-8`) | Obligatorio > 0 | Siempre | NuevoIngresoDialog.tsx:162-179 |
| 24 | toggle | «Origen» + radios «Caja» (Wallet) y «Banco» (Building2) en fila `gap-4` | Elige la tabla destino; «Caja» por defecto | Siempre | NuevoIngresoDialog.tsx:181-203 |
| 25 | campo | «Cuenta Bancaria *» (placeholder «Seleccione una cuenta»; ítems «{bank_name o "Banco"} - {name}») | `bank_accounts` activas | Solo si Origen = Banco | NuevoIngresoDialog.tsx:205-226 |
| 26 | campo | «Notas (Opcional)» (`Textarea rows={3}`, placeholder «Información adicional...») | En el movimiento bancario **se guarda en `reference`**, no en un campo de notas | Siempre | NuevoIngresoDialog.tsx:228-240 · movimientosService.ts:328 |
| 27 | botón | «Cancelar» (outline; **no limpia el formulario**) / «Guardar Ingreso» (azul) → «Guardando...» (Loader2) | — | — | NuevoIngresoDialog.tsx:243-265 |
| 28 | toast | «Error» / «El concepto es requerido» · «El monto debe ser mayor a 0» · «Seleccione una cuenta bancaria» · «Éxito» / «Ingreso registrado correctamente» · «Error» / {result.error} (p. ej. «No hay una sesión de caja abierta») · «Error» / «Error al registrar el ingreso» | — | — | NuevoIngresoDialog.tsx:69-127 |

Origen «Caja» → `createCashMovement`, que **exige una sesión de caja abierta** (`cash_sessions.status='open'`, movimientosService.ts:269-272). Origen «Banco» → `createBankTransaction` con `transaction_type='deposit'`, `trans_date = now()` y `status='unmatched'` — **ambos valores fuera del CHECK de la tabla** (§H.2 #28). Los asientos los generan los triggers `trg_auto_journal_cash_movement` / `trg_auto_journal_bank`: la UI no escribe contabilidad a mano, pero **si no hay `accounting_rules` el movimiento queda sin asiento, en silencio**. **No existe**: campo de fecha (siempre «ahora»), categoría o centro de costo, adjuntos, referencia separada de notas, ni aviso previo de que sin sesión de caja abierta el guardado fallará.

### C.7 Detalle de ingreso `/app/finanzas/ingresos/[id]` — `components/finanzas/ingresos/IngresoDetalle.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `DetailSkeleton` (bloque 64×64 + 2 líneas + rejilla de 4 pares) | Carga | `isLoading` | IngresoDetalle.tsx:109-115 |
| 2 | estado | «Ingreso no encontrado» (h2, `p-6 text-center`) + «Volver al listado» | Sin registro para ese uuid | `movement === null` | IngresoDetalle.tsx:117-128 |
| 3 | toast | «Error» / «No se pudo cargar el detalle del ingreso» | Fallo de carga | — | IngresoDetalle.tsx:41-45 |
| 4 | botón | (icono ArrowLeft, ghost) | Vuelve al listado | Siempre | IngresoDetalle.tsx:135-139 |
| 5 | texto | «Ingreso #{id}» (h1) — **usa el id NUMÉRICO, no el uuid** | Título, con DollarSign verde en cuadro `bg-green-100 rounded-xl` | Siempre | IngresoDetalle.tsx:140-147 |
| 6 | badge | «Confirmado» (verde `bg-green-100 text-green-700`) | **Literal fijo: no hay estado real en la BD**. En los bancarios sí existe `status` (`unmatched`/`matched`/`reconciled`) y no se muestra | Siempre | IngresoDetalle.tsx:148-150 |
| 7 | texto | `formatDate(created_at)` (`text-sm text-gray-500`) | Fecha bajo el título | Siempre | IngresoDetalle.tsx:152-154 |
| 8 | exportación | «Exportar» (Download, outline) → `ingreso_{id}.txt` con «COMPROBANTE DE INGRESO» + `======================` + «ID:», «Fecha:», «Concepto:», «Monto:», «Notas:» (ausentes → «N/A») | **TXT, no PDF** | Siempre | IngresoDetalle.tsx:158-161, 88-107 |
| 9 | botón | «Duplicar» (Copy, outline) | `duplicateMovement(id, '')` y navega al resultado — **falla siempre, y se ofrece también para bancarios** (§H.1 #10-#11) | Siempre | IngresoDetalle.tsx:162-165 |
| 10 | botón | «Anular» (XCircle, destructive) | **`window.confirm`** «¿Está seguro de anular este ingreso?» + **`window.prompt`** «Motivo de la anulación:» — **falla siempre, y opera sobre `cash_movements` por id numérico aunque el movimiento sea bancario** (§H.1 #9, #11) | Siempre | IngresoDetalle.tsx:166-169, 57, 59 |
| 11 | texto | «Información del Movimiento» (FileText) | Tarjeta principal | Siempre | IngresoDetalle.tsx:178-181 |
| 12 | texto | «Concepto» / valor `font-medium` · «Monto» / valor `text-2xl font-bold text-green-600` | Datos | Siempre | IngresoDetalle.tsx:186-195 |
| 13 | texto | «Fecha de Registro» (Calendar) | Dato | Siempre | IngresoDetalle.tsx:203-207 |
| 14 | texto | «Origen» (Wallet) → **SIEMPRE «Caja»** | **Incorrecto para los movimientos bancarios**; el gemelo de egresos sí lo hace condicional | Siempre | IngresoDetalle.tsx:210-214 |
| 15 | texto | «Notas» (`whitespace-pre-wrap`, tras un `Separator`) | En los bancarios muestra en realidad `bank_transactions.reference` | Si hay notas | IngresoDetalle.tsx:218-228 |
| 16 | texto | «Movimiento de Caja» / «Transacción Bancaria» (Wallet) | Cabecera condicional de la 2.ª tarjeta | Siempre | IngresoDetalle.tsx:235-238 |
| 17 | badge | «Caja» (ámbar) / «Banco» (azul), bajo la etiqueta «Fuente» | — | Siempre | IngresoDetalle.tsx:242-253 |
| 18 | texto | «Cuenta Bancaria» / nombre de la cuenta | Dato | Si hay cuenta | IngresoDetalle.tsx:254-261 |
| 19 | texto | «Identificador» (FileText) / UUID en `font-mono text-sm` | **Sin botón de copiar**, a diferencia del listado | Siempre | IngresoDetalle.tsx:269-281 |
| 20 | stat | «Monto Total» / importe `text-3xl font-bold` sobre `bg-gradient-to-br from-green-500 to-green-600` + «Ingreso registrado el {fecha}» | Tarjeta destacada | Siempre | IngresoDetalle.tsx:283-291 |
| 21 | toast | «Éxito» / «Ingreso anulado correctamente» · «Error» / {result.error} · «Error» / «Error al anular» · «Éxito» / «Ingreso duplicado correctamente» · «Error» / «Error al duplicar» | — | — | IngresoDetalle.tsx:63-84 |

`getMovementByUuid(uuid)` busca primero en `cash_movements` y, si no hay, en `bank_transactions` con join a `bank_accounts` (`movimientosService.ts:154-209`). Para los bancarios, `concept = description || 'Transacción bancaria'` y `notes = reference`. Layout `grid lg:grid-cols-3` con la principal a `lg:col-span-2`. Imports muertos: `User` (:9) y `Edit` (:14). **No existe**: historial/auditoría, enlace a la sesión de caja o al asiento contable generado, usuario que registró, adjuntos, edición, **ni validación de tipo**: un uuid de egreso abierto bajo `/ingresos/` se pinta como ingreso y en verde.

### C.8 Egresos `/app/finanzas/egresos` — `components/finanzas/egresos/EgresosPage.tsx`

**Gemela byte a byte de C.6** salvo color, icono y seis literales. Misma estructura de controles, mismas 7 columnas, mismo menú «…» de 4 ítems, mismos toasts y el mismo `filteredMovements` sobre `concept` + `notes`.

| Qué cambia | C.6 (Ingresos) | C.8 (Egresos) | Archivo:línea |
|---|---|---|---|
| Icono y color de cabecera | `TrendingUp` verde sobre `bg-green-100` | **`TrendingDown` rojo sobre `bg-red-100`** | EgresosPage.tsx:156-158 |
| Título / subtítulo | «Ingresos» / «Gestión de ingresos no relacionados a ventas» | «Egresos» / «Gestión de egresos no relacionados a compras» | EgresosPage.tsx:160-165 |
| Botón de alta | «Nuevo Ingreso» | «Nuevo Egreso» | EgresosPage.tsx:177-180 |
| Color del KPI «Total Acumulado» y de la columna «Monto» | `text-green-600` | `text-red-600` | EgresosPage.tsx:188-199, 265 |
| Estado vacío | «No hay ingresos registrados» | «No hay egresos registrados» | EgresosPage.tsx:271-276 |
| Nombre del CSV | `ingresos_AAAA-MM-DD.csv` | `egresos_AAAA-MM-DD.csv` (misma cabecera `ID,Fecha,Concepto,Monto,Notas`) | EgresosPage.tsx:115-129 |
| Confirmación nativa | «¿Está seguro de anular este ingreso?» | «¿Está seguro de anular este egreso?» (el `prompt` «Motivo de la anulación:» es idéntico) | EgresosPage.tsx:99, 101 |
| Toasts | «…los ingresos» · «Ingreso duplicado correctamente» · «Ingreso anulado correctamente» | «No se pudieron cargar los egresos» · «Egreso duplicado correctamente» · «Egreso anulado correctamente» | EgresosPage.tsx:70-74, 88, 105 |
| Imports muertos | `Filter`, `DollarSign`, `Calendar`, `Badge`, `Select…` | **Ninguno**: este fichero no importa `Badge` ni `Select` | — |

Referencias en C.8 para los controles idénticos: esqueleto 136-144 · botón atrás 151-155 · «Exportar» 169-172 · «Importar» (sin `onClick`) 173-176 · `BranchBadge` 184 · KPIs 188-235 · buscador «Buscar por concepto...» 240-248 · «Actualizar» 249-252 · cabeceras 261-267 · `CopyableId` 281-286 · chip «Caja»/«Banco» 289-295 · cuenta bancaria 302-304 · menú «…» 313-318 · «Ver Detalle» 320-326 · «Editar» (sin `onClick`) 329-332 · «Duplicar» 333-339 · separador 340 · «Anular» 341-347 · `filteredMovements` 131-134.

**Diferencia real de datos, no de UI**: lee `cash_movements` con `type='out'` y `bank_transactions` con `transaction_type='withdrawal'`, y **los importes bancarios se guardan negativos** (`amount: -data.amount`, `movimientosService.ts:326`); la UI los pinta con `Math.abs`, así que el signo nunca aparece.

#### C.8-bis Diálogo «Nuevo Egreso» — `egresos/NuevoEgresoDialog.tsx`

Gemelo de C.6-bis, con las **mismas líneas** (134-265): `BranchSelectorField` en 147, prefijo «$» en 162-179, radios «Caja»/«Banco» en 181-203, select de cuenta en 205-226 y notas en 228-240. Solo cambian seis literales:

| Control | C.6-bis | C.8-bis | Archivo:línea |
|---|---|---|---|
| Título e icono | «Nuevo Ingreso» (DollarSign verde 20 px) | «Nuevo Egreso» (**`MinusCircle` rojo** 20 px) | NuevoEgresoDialog.tsx:137-140 |
| Descripción | «Registre un ingreso que no proviene de ventas ni facturas» | «Registre un egreso que no proviene de compras ni facturas» | NuevoEgresoDialog.tsx:141-143 |
| Placeholder de «Concepto *» | «Ej: Aporte de socio, Préstamo, Ajuste...» | «Ej: Gastos menores, Retiro de efectivo...» | NuevoEgresoDialog.tsx:149-160 |
| Botón de envío | «Guardar Ingreso» / «Guardando...» | «Guardar Egreso» / «Guardando...» | NuevoEgresoDialog.tsx:252-265 |
| Toast de éxito | «Ingreso registrado correctamente» | «Egreso registrado correctamente» (las tres validaciones son idénticas) | NuevoEgresoDialog.tsx:114, 69, 75, 80 |
| Toast de excepción | «Error al registrar el ingreso» | «Error al registrar el egreso» | NuevoEgresoDialog.tsx:127 |

**No existe, y aquí es crítico**: ninguna validación de saldo disponible — se puede registrar un egreso mayor que el efectivo de la sesión de caja o que el saldo de la cuenta bancaria.

### C.9 Detalle de egreso `/app/finanzas/egresos/[id]` — `components/finanzas/egresos/EgresoDetalle.tsx`

Gemelo de C.7 con un desplazamiento de una línea. Equivalencias directas: `DetailSkeleton` 108-114 · botón atrás 134-138 · «Volver al listado» 122-124 · toast de carga 40-44 · `confirm` 56 y `prompt` 58 · «Información del Movimiento» 177-180 · «Concepto» 185-188 · «Fecha de Registro» 202-206 · «Notas» 217-227 · «Movimiento de Caja»/«Transacción Bancaria» 234-237 · badge «Caja»/«Banco» 241-251 · «Cuenta Bancaria» 253-260 · «Identificador» sin copiar 268-280 · toasts 62, 65, 68, 77-78, 80, 83.

| Qué cambia | C.7 (Ingreso) | C.9 (Egreso) | Archivo:línea |
|---|---|---|---|
| Icono y color de cabecera | `DollarSign` verde en `bg-green-100 rounded-xl` | **`MinusCircle` rojo en `bg-red-100 rounded-xl`** | EgresoDetalle.tsx:139-141 |
| Título | «Ingreso #{id}» | «Egreso #{id}» | EgresoDetalle.tsx:144-146 |
| Badge fijo | «Confirmado» verde | «Confirmado» **rojo** (`bg-red-100 text-red-700`) — mismo literal, distinta paleta | EgresoDetalle.tsx:147-149 |
| Color del «Monto» | `text-green-600` | `text-red-600` | EgresoDetalle.tsx:191-194 |
| **Campo «Origen»** | **SIEMPRE «Caja»** (bug) | **Condicional «Caja» / «Banco» — correcto aquí.** Única asimetría funcional entre los gemelos: el mismo componente copiado, con el fallo arreglado en una sola de las dos copias | EgresoDetalle.tsx:209-213 |
| Tarjeta degradada | `from-green-500 to-green-600` + «Ingreso registrado el {fecha}» | `from-red-500 to-red-600` + «Egreso registrado el {fecha}» | EgresoDetalle.tsx:282-290 |
| TXT | `ingreso_{id}.txt` / «COMPROBANTE DE INGRESO» | `egreso_{id}.txt` / «COMPROBANTE DE EGRESO». **El subrayado `======================` mide 22 signos en los dos**, aunque el título del egreso es una letra más corto: desalineado por copia | EgresoDetalle.tsx:87-106, 91-92 |
| Confirmación nativa | «¿Está seguro de anular este ingreso?» | «¿Está seguro de anular este egreso?» | EgresoDetalle.tsx:56 |
| Toasts | «Ingreso anulado/duplicado correctamente» · «No se pudo cargar el detalle del ingreso» | «Egreso anulado/duplicado correctamente» · «No se pudo cargar el detalle del egreso» | EgresoDetalle.tsx:62, 77-78, 40-44 |
| Imports muertos | `User` (:9) y `Edit` (:14) | Solo `User` (:9) | EgresoDetalle.tsx:9 |

**No existe**: proveedor o beneficiario, comprobante/factura asociada, adjuntos, flujo de aprobación, ni enlace al asiento contable. Comparte con C.7 los tres fallos de fondo (§H.1 #10-#12).

### C.10 Métodos de pago `/app/finanzas/metodos-pago` — `metodos-pago/PaymentMethodsPage.tsx`

Dos pestañas. Es la pantalla con **más columnas del módulo** (11) y **la única con drag & drop**.

#### C.10.1 Pestaña «Métodos Activos» — `PaymentMethodsList.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Métodos de Pago \| GO Admin ERP» | `<title>` de la pestaña del navegador | Siempre | `app/app/finanzas/metodos-pago/page.tsx:5` |
| 2 | botón | (icono ArrowLeft, ghost icon) | `Link` a `/app/finanzas` | Siempre | PaymentMethodsPage.tsx:204-208 |
| 3 | texto | «Métodos de Pago» (h1, SVG de tarjeta 24×24 sobre `bg-blue-100 rounded-xl`) / «Finanzas / Métodos de Pago» | Migaja **no navegable** (es un `<p>`, no enlaces) | Siempre | PaymentMethodsPage.tsx:209-218 |
| 4 | botón | «Nuevo Método» (Plus, azul; `w-full` en móvil) | Limpia la selección y salta a la pestaña «editar» | Siempre | PaymentMethodsPage.tsx:221-224, 189-192 |
| 5 | pestaña | «Métodos Activos» · «Editar Método» / «Nuevo Método» (desde `sm`; en móvil **«Editar» / «Nuevo»**) | La segunda cambia de texto según haya método seleccionado | Siempre; la 1.ª activa por defecto | PaymentMethodsPage.tsx:229-241 |
| 6 | texto | «Métodos de Pago Disponibles» (azul) / «Gestiona los métodos de pago que tu organización acepta y configura sus opciones» | Cabecera de la tarjeta | Pestaña lista | PaymentMethodsPage.tsx:247-250 |
| 7 | texto | «Arrastra para reordenar la prioridad en el website» (GripVertical 12×12, `text-xs`) | Ayuda del drag & drop | Siempre | PaymentMethodsList.tsx:622-625 |
| 8 | botón | «Actualizar» (RefreshCcw que gira; texto oculto bajo `sm`) | Recarga las 3 consultas | `disabled` con `isLoading` | PaymentMethodsList.tsx:626-634 |
| 9 | columna | (sin cabecera, `w-8`) asa de arrastre · (sin cabecera, `w-8 sm:w-10`) icono · «Método de Pago» · «Código» (≥`md`) · «Países» (≥`lg`) · «Recomendación» (≥`xl`) · «Requiere Ref.» (≥`2xl`) · «Integración» (≥`sm`) · «Website» · «Estado» · «Acciones» | **11 columnas; a 375 px solo quedan 6 visibles** | Siempre | PaymentMethodsList.tsx:637-696, 646-656 |
| 10 | botón | Asa `GripVertical` 16×16 (`cursor-grab` / `active:cursor-grabbing`) | Arrastra la fila; se activa tras 8 px y **soporta teclado**. La fila baja a `opacity-.5` y se pinta `bg-blue-50` | Siempre | PaymentMethodsList.tsx:167-169, 346-355, 162-166 |
| 11 | estado | Iniciales de color: «N» morado (nequi) · «D» rojo (daviplata) · «P» azul (pse) · «U» verde (payu) · «M» celeste (mp) · «O» amarillo (oxxo) · «S» rojo (spei) · «S» morado (stripe) · «C» índigo (conekta) | Cuadro 16×16 `rounded` con la letra en blanco | Según el código | PaymentMethodsList.tsx:558-576 |
| 12 | estado | Iconos genéricos: `CreditCard` (card/tarjeta) · `Banknote` (cash/efectivo) · `Building2` (transfer/transferencia) · `Wallet` (resto) | Para los códigos no listados | — | PaymentMethodsList.tsx:579-587 |
| 13 | badge | «Sistema» (secondary) | `payment_method.is_system` | — | PaymentMethodsList.tsx:176-178 |
| 14 | badge | Código ISO de país, p. ej. «CO» (outline `text-[10px]`; **verde si es recomendado ahí**) · «+N» (secondary) si hay más de 3 · «Global» (secondary) si no hay países | Columna «Países»; con >3 se muestran solo 2 | — | PaymentMethodsList.tsx:187-226 |
| 15 | badge | «★ Recomendado (CO)» (azul; el paréntesis solo si hay `countryCode`) · «-» si no lo es | Columna «Recomendación» | — | PaymentMethodsList.tsx:229-234 |
| 16 | badge | Nombre de la pasarela (p. ej. «wompi») o «Conectado» (verde) + Settings 12×12 → `Link` a `/app/integraciones/conexiones` | Columna «Integración» | Si hay `settings.gateway` o `integration_connection_id` | PaymentMethodsList.tsx:125-137 |
| 17 | badge | «Conectar» (amarillo, Zap 12×12) → `Link` a conexiones | Si el código está en `INTEGRATION_METHODS` (wompi, payu, stripe, mp, mercadopago, paypal, conekta, nequi, daviplata, pse, oxxo, spei, cashapp, venmo, zelle) o en `GATEWAY_METHODS`, y no hay conexión | — | PaymentMethodsList.tsx:115-118, 140-152 |
| 18 | badge | «Nativo» (secondary) para `cash`, `card`, `transfer`, `check`, `credit` · «—» para el resto | Método manual | — | PaymentMethodsList.tsx:155-158 |
| 19 | toggle | Switch verde (columna «Website») | `UPDATE show_on_website` con **actualización optimista y reversión si falla** | `disabled` mientras se guarda ese código o si `id === 0` | PaymentMethodsList.tsx:244-249, 397-442 |
| 20 | toggle | Switch azul (columna «Estado») | `UPDATE is_active`, también optimista | Ídem | PaymentMethodsList.tsx:252-257, 358-394 |
| 21 | menú | (MoreHorizontal, ghost 32×32; `sr-only` «Abrir menú») + `DropdownMenuLabel` «Acciones» + separador | Menú de fila | Siempre | PaymentMethodsList.tsx:260-269 |
| 22 | menú | «Editar» (Edit) | Salta a la pestaña «editar» con el método cargado | `disabled` con `isLoading` | PaymentMethodsList.tsx:270-277 |
| 23 | menú | «Eliminar» (Trash2, rojo) | Abre la confirmación | **Solo si no es `is_system`** | PaymentMethodsList.tsx:278-290 |
| 24 | menú | «Configurar Integración» (Zap azul) | `Link` a `/app/integraciones/conexiones/nueva?provider={code}&return=/app/finanzas/metodos-pago` | Solo si el código está en `GATEWAY_METHODS`: payu, stripe, mp, mercadopago, wompi, conekta, paypal | PaymentMethodsList.tsx:70, 291-304 |
| 25 | estado | «Cargando métodos de pago...» (RefreshCcw girando, `colSpan={11}`) · «No se encontraron métodos de pago.» | Carga / vacío | — | PaymentMethodsList.tsx:661-675 |
| 26 | diálogo | «¿Eliminar método de pago?» / «Estás a punto de eliminar **{nombre}** ({código}). Esta acción no se puede deshacer. El método dejará de estar disponible para tu organización.» | `AlertDialog` | Tras «Eliminar» | PaymentMethodsList.tsx:700-707 |
| 27 | botón | «Cancelar» / «Sí, eliminar» → «Eliminando...» (`bg-red-600`) | `DELETE` de `organization_payment_methods` **y, si no es de sistema, de `payment_methods`** (tabla global, §H.7 #34) | En el diálogo | PaymentMethodsList.tsx:710-719, 503-551 |
| 28 | toast | «Estado actualizado» / «El método de pago ha sido activado.» (o «desactivado.») · «Visibilidad actualizada» / «El método será visible en el website.» (o «no será visible») · «Orden actualizado» / «El orden de los métodos de pago ha sido guardado.» · «Método eliminado» / «El método "{nombre}" ha sido eliminado.» | Confirmaciones | — | PaymentMethodsList.tsx:376-379, 424-427, 486-489, 536-539 |
| 29 | toast | «Método no configurado» / «Primero debes configurar este método de pago.» · «Error» / «No se pudo actualizar el estado del método de pago.» · «No se pudo actualizar la visibilidad.» · «No se pudo actualizar el orden.» · «No se pudo eliminar el método de pago: {mensaje}» (típicamente «…tu cargo o rol no tiene el permiso de facturación.») · «No se pudieron cargar los métodos de pago» | Errores | — | PaymentMethodsList.tsx:398-405, 386-390, 434-438, 494-498, 518-547 · PaymentMethodsPage.tsx:172-176 |
| 30 | cálculo | Orden de filas = `website_display_order` ascendente; **las filas sin orden caen al final con valor `999`** | Prioridad en la tienda | Siempre | PaymentMethodsList.tsx:608-614 |

Todo desde el **cliente de navegador**: `payment_methods` con `countries:country_payment_methods(...)` filtrando `is_active` y ordenando por `name` (PaymentMethodsPage.tsx:87-100); `organizations.country_code` como respaldo (:107-111); `organization_payment_methods` con el join `payment_method:payment_method_code(*)` (:132-148); y la RPC `get_recommended_payment_methods(country_code)` (:155-156). **Las escrituras son `UPDATE`/`DELETE` directos, sin servicio ni route handler.** El reordenado son N `UPDATE` secuenciales, no una RPC transaccional (§H.9). **No existe**: KPIs, paginación, buscador ni filtro (ni por estado, ni por país, ni por integración), exportación, selección múltiple, estado «sin permiso» (el fallo solo se ve como toast al borrar), tooltips, atajos, ni enlace visible a `/metodos-pago/qr-sessions`.

#### C.10.2 Pestaña «Nuevo / Editar Método» — `PaymentMethodForm.tsx` + `AccountMappingForm.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 31 | texto | «Editar Método de Pago» / «Nuevo Método de Pago» (azul) + «Modifica la configuración del método de pago seleccionado» / «Configura un nuevo método de pago para tu organización» | Cabecera | Pestaña editar | PaymentMethodsPage.tsx:269-276 |
| 32 | estado | «No se pudo determinar la organización actual. Por favor, actualice la página.» | **Sustituye al formulario entero** | Sin `organizationId` | PaymentMethodsPage.tsx:290-294 |
| 33 | campo | «Método de pago» (placeholder «Selecciona un método de pago») | Elige el método a configurar | Solo al crear | PaymentMethodForm.tsx:437-480 |
| 34 | texto | «Métodos de pago» (encabezado de grupo `text-xs font-semibold` con borde inferior) | Separa el bloque manual: **solo `cash`, `transfer` y `card`** | Select abierto | PaymentMethodForm.tsx:55, 454-464 |
| 35 | texto | «Integraciones (requieren conexión)» (encabezado azul sobre `bg-blue-50/50`) | Separa el bloque de pasarelas | Select abierto | PaymentMethodForm.tsx:466-468 |
| 36 | campo | «⚡ Wompi» · «⚡ PayU» · «⚡ Mercado Pago» · «⚡ Stripe» · «⚡ PayPal» · «⚡ Bancolombia QR» · «⚡ Bre-B (Mono)» · «⚡ Redeban QR» · «⚡ Bold (Link de Pago)» · «⚡ Bold QR» | **No configuran nada**: redirigen a `/app/integraciones/conexiones/nueva?provider={uuid}`. **«Bold (Link de Pago)» y «Bold QR» comparten el mismo `providerId`** (§H.3) | Select abierto | PaymentMethodForm.tsx:58-70, 469-473, 181-188 |
| 37 | campo | «+ Crear método personalizado» (valor `new`, con borde superior) | Cambia el bloque por «Nombre del método» + «Código interno» | Select abierto | PaymentMethodForm.tsx:474, 190-191 |
| 38 | campo | «Nombre del método» (placeholder «Ej. Pago Contraentrega») + «Código interno» (placeholder «Ej. pago_contraentrega», ayuda «Sin espacios, único») | Validan «El nombre debe tener al menos 3 caracteres» y «El código debe tener al menos 2 caracteres» | Modo personalizado o al editar un método no manual | PaymentMethodForm.tsx:339-365, 388-414, 78-79 |
| 39 | estado | «Método de pago» + caja de solo lectura con el nombre + badge **«Editando»** (secondary azul `text-[10px]`) | El valor viaja en un `<input type="hidden">` | Al editar | PaymentMethodForm.tsx:369-386, 418-435 |
| 40 | estado | «Disponible en:» + badges con `country.name` (o el código), sobre caja azul con MapPin | Cobertura geográfica | Si el método tiene países | PaymentMethodForm.tsx:484-496 |
| 41 | estado | «Selecciona un método de pago para configurar sus opciones.» (`Alert` ámbar, AlertCircle) | Aviso previo | Sin método ni modo personalizado | PaymentMethodForm.tsx:498-505 |
| 42 | toggle | «Activo» + «Disponible en el sistema» (Switch azul en tarjeta con borde) | `organization_payment_methods.is_active` | Con método seleccionado | PaymentMethodForm.tsx:514-528 |
| 43 | toggle | «Requiere referencia» + «Pedir # transacción» (Checkbox azul) | **Escribe en `payment_methods`, tabla GLOBAL sin `organization_id`** (§H.7 #34) | Con método seleccionado | PaymentMethodForm.tsx:529-547 |
| 44 | texto | «Personalización para la Web» (Globe azul) + «Nombre y descripción que verán los clientes en tu página web» | Cabecera del bloque | Con método seleccionado | PaymentMethodForm.tsx:551-560 |
| 45 | campo | «Nombre para la Web» (placeholder «Ej: Pago Contraentrega, Pago en tienda, Tarjeta online...») + «Si lo dejas vacío, se usará el nombre del catálogo: "{nombre}"» | Nombre público | Bloque web | PaymentMethodForm.tsx:563-582 |
| 46 | campo | «Instrucciones para el cliente» (`RichTextEditor`, placeholder «Ej: Paga al recibir tu pedido en efectivo o con tarjeta al repartidor...», `minHeight=60`) | HTML que ve el comprador | Bloque web | PaymentMethodForm.tsx:585-602 |
| 47 | botón | Barra del editor: «Negrita» · «Cursiva» · «Subrayado» · «Viñetas» · «Numeración» · «Alinear izquierda» · «Centrar» · «Alinear derecha» (iconos 14×14; el texto es el `title`) | `document.execCommand` | Con el editor visible | `shared/RichTextEditor.tsx:42-50` |
| 48 | toggle | «Visible en Web» (Switch azul `text-xs`) · «Orden» (`type=number min=0`, placeholder «0») · «Icono» (placeholder «Seleccionar icono») | **«Orden» es el mismo campo que el drag & drop de la lista** | Bloque web, rejilla `sm:grid-cols-3` | PaymentMethodForm.tsx:606-665 |
| 49 | campo | «💵 Billetes» · «🪙 Monedas» · «💳 Tarjeta» · «🏦 Banco» · «🔄 Transferencia» · «👛 Billetera» · «📱 Móvil» · «📲 QR» · «🌐 Online» · «⚡ Pago rápido» · «🚚 Contraentrega» · «🏪 En tienda» | Valores `banknotes`, `coins`, `credit-card`, `building-bank`, `arrow-left-right`, `wallet`, `smartphone`, `qr-code`, `globe`, `zap`, `truck`, `store` | Select abierto | PaymentMethodForm.tsx:649-660 |
| 50 | texto | «¿Necesitas métodos como Wompi, Nequi o PayU? Conéctalos desde **Integraciones → Conexiones** y se agregarán automáticamente.» (caja de borde discontinuo, ExternalLink) | El fragmento en negrita es un `Link` | Con método seleccionado | PaymentMethodForm.tsx:671-680 |
| 51 | pestaña | «Contabilidad (Mapeo de cuentas)» + chevron que rota 180° | `Collapsible`, **cerrado por defecto** | Con método seleccionado | PaymentMethodForm.tsx:117, 683-696 |
| 52 | texto | «Configuración Contable» (Landmark, azul) + «Vincula este método de pago con tus cuentas contables y bancarias» | Cabecera | Acordeón abierto | `AccountMappingForm.tsx:253-261` |
| 53 | estado | «Cargando cuentas...» (Loader2 azul, `p-8`) | Carga | — | AccountMappingForm.tsx:264-268 |
| 54 | texto | «Cuentas Bancarias» (Building2 azul) + badge con el número | Subsección | — | AccountMappingForm.tsx:273-277 |
| 55 | campo | «Cuenta Bancaria Destino» (Landmark; placeholder «Selecciona una cuenta bancaria»; primera opción «Sin asignar») + «Donde se depositarán los pagos recibidos con este método» | Cada opción con Building2 + nombre + badge del banco | Si hay cuentas | AccountMappingForm.tsx:168-199 |
| 56 | estado | «No tienes cuentas bancarias configuradas. **Crear cuenta bancaria**» (`Alert` amarillo) | Enlace a `/app/finanzas/bancos/cuentas` — **ruta inexistente** (§H.4) | Sin cuentas | AccountMappingForm.tsx:282-290 |
| 57 | texto | «Cuentas Contables» (Wallet verde) + badge con el número | Subsección | — | AccountMappingForm.tsx:298-302 |
| 58 | campo | «Cuenta de Ingresos» + «Cuenta donde se registrarán los ingresos por este método» | `income_account`; solo cuentas de tipo `income` | Si hay plan de cuentas | AccountMappingForm.tsx:306-311 |
| 59 | campo | «Cuenta por Cobrar» + «Para pagos pendientes o diferidos» · «Cuenta de Caja/Efectivo» + «Para métodos de pago en efectivo» | Ambas filtran por tipo `asset`: **los dos desplegables ofrecen exactamente la misma lista** (§H.3) | Si hay plan de cuentas | AccountMappingForm.tsx:312-323 |
| 60 | texto | Etiquetas de grupo en mayúsculas: «ACTIVO» · «PASIVO» · «PATRIMONIO» · «INGRESO» · «GASTO»; cada opción «{código} - {nombre}» | Agrupación del select | Select abierto | AccountMappingForm.tsx:157-166, 228-235 |
| 61 | estado | «No hay cuentas contables configuradas» · «No tienes un plan de cuentas configurado. **Configurar plan de cuentas**» (`Alert` azul, Info) | Vacíos; el enlace va a `/app/finanzas/contabilidad/plan-cuentas` | — | AccountMappingForm.tsx:241-243, 326-334 |
| 62 | texto | «La configuración contable es opcional» (Info 12×12) | Nota del pie | Acordeón abierto | AccountMappingForm.tsx:342-345 |
| 63 | botón | «Aplicar Configuración» (Save, azul sm) | Filtra las claves vacías o `"none"` y sube el mapeo al padre — **no escribe en la base de datos** | `disabled` mientras carga o guarda | AccountMappingForm.tsx:346-355, 135-155 |
| 64 | botón | «Cancelar» (outline; `w-full` en móvil) / «Guardar» (azul, Loader2) | Vuelve a la lista / `INSERT`-`UPDATE` en `organization_payment_methods` | «Guardar» `disabled` sin método | PaymentMethodForm.tsx:702-713, 226-326 |
| 65 | toast | «Mapeo aplicado» / «La configuración contable se aplicará al guardar el método de pago» **y** «Mapeo guardado» / «Recuerda guardar el método de pago para confirmar los cambios.» | **Dos toasts por un solo clic** (§H.3) | Tras #63 | AccountMappingForm.tsx:146-149 + PaymentMethodForm.tsx:219-222 |
| 66 | toast | «Método de pago guardado» / «Configurado exitosamente» · «Error» / «Ya existe un método con este código» · «Error» / «No se pudo guardar: {mensaje}» (incluye «No se pudo determinar el ID de la organización» y «No se ha seleccionado un método de pago válido») · «Error» / «No se pudieron cargar los datos contables» | — | — | PaymentMethodForm.tsx:318-322, 244-247, 231, 263 · AccountMappingForm.tsx:118-122 |
| 67 | cálculo | `settings = { gateway, gateway_config, account_mapping }`; `gateway_config` y `account_mapping` se omiten si están vacíos | Lo que se escribe en `organization_payment_methods.settings` | Al guardar | PaymentMethodForm.tsx:266-270 |

Formulario con react-hook-form + zod (`.passthrough()`, :73-85). Escribe directamente desde el navegador: comprueba duplicado en `payment_methods` (:236-240), inserta el método personalizado (:249-257), busca la vinculación con `maybeSingle()` (:281-286) y hace `UPDATE`/`INSERT` (:291-301); al editar **también actualiza `name` y `requires_reference` en `payment_methods`** si el código no es manual (:304-310). `AccountMappingForm` lee `chart_of_accounts` y `bank_accounts` con su propio `useOrganization()` (:85-114). **No existe**: ningún campo de pasarela alcanzable desde aquí (§H.3), comisiones, límites de importe, restricción por sucursal o por canal (POS/web/facturas), vista previa del método tal como lo verá el cliente, validación de unicidad del `website_display_order`, «Guardar y crear otro», ni confirmación al salir con cambios sin guardar.

#### C.10.3 Configuración de pasarelas — **39 controles huérfanos**

Todo `metodos-pago/gateways/**` es código muerto: `gatewayConfig` nunca deja de ser `{}`
(`PaymentGatewaysSection.tsx:60`, `PaymentMethodGatewayConfig.tsx:24`), el campo `gateway` no tiene
control en la UI y **ninguna ruta renderiza estos formularios**. Los literales existen y no se
alcanzan: «Configuración de Stripe» · «Configuración de Wompi» · «Configuración de PayU» ·
«Configuración de Mercado Pago» · «Configuración para pasarela: {gateway}»; los campos «Clave
Pública» / «Clave Privada» / «Clave Secreta» / «Token de Acceso» / «API Key» / «Secret Key» /
«Client ID (opcional)» / «Client Secret (opcional)» / «ID de Integrador (opcional)» / «Merchant ID» /
«Account ID» / «URL para Webhooks (opcional)» / «URL de Webhook» / «Entorno» (en la genérica es
**texto libre**, placeholder «production o sandbox») / «Configuración adicional (JSON)»
(`<textarea min-h-32>`, placeholder `{ "campo": "valor" }`, que **se parsea en cada tecleo y el error
solo va a consola**); y las 4 tarjetas «Stripe» / «Pagos con tarjeta internacionales», «Wompi» /
«Pagos en Colombia (PSE, tarjetas, Nequi)», «Mercado Pago» / «Pagos en Latinoamérica», «PayU» /
«Pagos en Latinoamérica» con sus badges «Conectado» (verde) y «Error» (rojo), sus botones
«Configurar» y «Conectar» (azul, Zap) y el pie «Ver todas las integraciones de pagos» →
`/app/integraciones?filter=payments`. Además `PAYMENT_GATEWAY_OPTIONS` (9 opciones) no tiene
consumidores y `ACCOUNTING_DEFAULT_MAPPINGS` declara claves (`income`/`receivable`/`bank`/`cash`)
que **no coinciden** con las que el formulario guarda (`income_account`/`receivable_account`/
`cash_account`/`bank_account_id`) (`payment-method-types.ts:53-70`).

### C.11 Historial de Pagos QR `/app/finanzas/metodos-pago/qr-sessions` — `app/app/finanzas/metodos-pago/qr-sessions/page.tsx`

Pantalla de un solo fichero; la tabla es `<table>` HTML plano, no el `Table` de shadcn.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Historial de Pagos QR» (h1, icono QrCode azul sobre `bg-blue-100 rounded-xl`) | Título | Siempre | qr-sessions/page.tsx:179-185 |
| 2 | texto | «Finanzas / Metodos de Pago / Sesiones QR» (**«Metodos» sin tilde**) | Migaja **no navegable** | Siempre | page.tsx:186-188 |
| 3 | botón | «Refrescar» (RefreshCw, outline; gira al cargar) | `loadSessions()` | `disabled` mientras carga | page.tsx:191-201 |
| 4 | chip | «Todos» · «Pendientes» · «Pagados» · «Expirados» · «Rechazados» · «Cancelados» | Filtran **en cliente**; `variant="default"` el activo, `outline` el resto | Siempre | page.tsx:55-60, 207-216 |
| 5 | campo | Placeholder «Buscar por referencia...» (Search 16px, `pl-9`) | Coincidencia parcial de `reference`, **sin debounce** | Ancho completo en móvil, `w-72` desde `sm` | page.tsx:218-226, 140-146 |
| 6 | stat | «Sesiones QR ({n})» | Contador **tras** filtrar | Siempre | page.tsx:232 |
| 7 | columna | «Referencia» (`font-mono text-xs`, o «-») · «Proveedor» (código crudo: `bold`, `bancolombia`…) · «Monto» (derecha) · «Estado» · «Origen» (crudo: `pos`, `invoice`…) · «Creado» · «Pagado» | **7 columnas de las 17 del tipo declarado** | Siempre | page.tsx:262-302 |
| 8 | badge | «Pendiente» (warning) · «Pagado» (success) · «Expirado» (secondary) · «Rechazado» (destructive) · «Cancelado» (secondary) | Estado | Por fila | page.tsx:68-72 |
| 9 | estado | Iconos 16 px: CheckCircle2 verde (pagado), Clock amarillo (pendiente), XCircle rojo (rechazado), XCircle gris (expirado y cancelado) | Refuerzo visual | Por fila | page.tsx:158-172 |
| 10 | estado | «Cargando sesiones...» (RefreshCw girando, `py-12`) | Carga | `loading` | page.tsx:235-242 |
| 11 | estado | QrCode 48 px + «No hay sesiones QR para mostrar» + «Aun no se han generado sesiones QR.» (**sin tilde**) o «No hay sesiones que coincidan con los filtros seleccionados.» | Vacío, con dos redacciones | Sin filas | page.tsx:243-255 |
| 12 | cálculo | Orden fijo `created_at` descendente, **tope duro de 100 filas** | No configurable | Siempre | page.tsx:112-113 |
| 13 | cálculo | Formato «22 sept 2026, 14:35» (`es-CO`); «-» ante nulo o fecha inválida | `formatDate` local | Columnas «Creado» y «Pagado» | page.tsx:76-89 |

Un único `select('*')` sobre **`payment_qr_sessions`** filtrado por `organization_id` y, si hay sucursal, por `branch_id` (page.tsx:106-113). La única entrada a la pantalla en todo el código es la notificación de `lib/services/integrations/qrShared/qrNotificationService.ts:90,131`. **No existe**: botón de volver, KPIs (total cobrado, conversión, tiempo medio a pago), filtro por fechas / proveedor / origen, paginación, exportación, detalle expandible (`connector_code`, `external_qr_id`, `expires_at`, `payment_id`, `source_id` no se ven), enlace al pago o a la venta, cancelar o reenviar un QR pendiente, refresco automático, **ningún toast** (los errores solo van a `console.error`, l.118) ni menú «…».

### C.12 Transferencias bancarias `/app/finanzas/transferencias` — `components/finanzas/transferencias/TransferenciasPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(3)` | Carga | `isLoading` | TransferenciasPage.tsx:143-151 |
| 2 | botón | (icono ArrowLeft, ghost icon) | `Link` a `/app/finanzas` | Siempre | TransferenciasPage.tsx:158-162 |
| 3 | texto | «Transferencias Bancarias» (h1, ArrowLeftRight en caja azul) / «Movimientos entre cuentas bancarias» | Cabecera | Siempre | TransferenciasPage.tsx:163-172 |
| 4 | exportación | «Exportar» (Download, outline) → `transferencias_AAAA-MM-DD.csv`, cabecera `ID,Fecha,Origen,Destino,Monto,Referencia,Estado` | **Exporta todo, ignora la búsqueda activa**; sin escapado de comas | Siempre | TransferenciasPage.tsx:176-179, 113-135 |
| 5 | botón | «Nueva Transferencia» (Plus, azul) | Abre el diálogo | Siempre | TransferenciasPage.tsx:180-183 |
| 6 | badge | «Sucursal:» + «Todas las sucursales» / «{nombre}» / «Sucursal #{id}» | `BranchBadge` | Siempre | TransferenciasPage.tsx:187 |
| 7 | stat | «Total Transferido» (azul) · «Este Mes» (verde) · «Total Operaciones» · «Pendientes» (amarillo) | **«Pendientes» siempre marca 0** (§H) | Siempre | TransferenciasPage.tsx:191-238 |
| 8 | campo | Placeholder «Buscar por cuenta o referencia...» (Search, `pl-10`) | Filtro cliente sobre `from_account.name`, `to_account.name` y `reference` | Siempre | TransferenciasPage.tsx:245-250 |
| 9 | botón | «Actualizar» (RefreshCw, outline) | `loadData()` | Siempre | TransferenciasPage.tsx:252-255 |
| 10 | columna | «Fecha» · «Origen» · **«»** (cabecera vacía, solo para una flecha) · «Destino» · «Monto» · «Referencia» · «Estado» · «Acciones» | 8 columnas | Siempre | TransferenciasPage.tsx:264-271 |
| 11 | texto | Building2 + nombre (negrita) + `bank_name` (xs gris) | Columnas Origen y Destino | Por fila | TransferenciasPage.tsx:287-315 |
| 12 | columna | «Referencia» → `CopyableId`: el texto es `reference` (`title="Ver detalle"`) y **el icono copia el UUID, no la referencia**; «-» si es nula | — | Por fila | TransferenciasPage.tsx:319-330 |
| 13 | badge | «Completada» (verde) · «Pendiente» (amarillo, **inalcanzable**) · «Anulada» (rojo) | Estado | Por fila | TransferenciasPage.tsx:46-54 |
| 14 | menú | (MoreVertical, ghost 32×32, `align="end"`) → «Ver Detalle» (Eye) · «Anular» (XCircle rojo, tras separador) | «Anular» solo si `status === 'completed'` | Por fila | TransferenciasPage.tsx:337-362 |
| 15 | diálogo | **`window.confirm`** «¿Está seguro de anular esta transferencia? Se revertirán los saldos.» + **`window.prompt`** «Motivo de la anulación:» (si se cancela, guarda «Sin motivo») | Anulación | Tras «Anular» | TransferenciasPage.tsx:97-99 · transferenciasService.ts:257-258 |
| 16 | estado | «No hay transferencias registradas» (`colSpan={8}`) | Vacío — **mismo texto con y sin búsqueda** | — | TransferenciasPage.tsx:275-280 |
| 17 | toast | «Error» / «No se pudieron cargar las transferencias» · «Éxito» / «Transferencia anulada correctamente» · «Error» / {error} · «Error» / «Error al anular» | — | — | TransferenciasPage.tsx:82-86, 103, 106, 109 |
| 18 | diálogo | «Nueva Transferencia» (ArrowLeftRight azul) / «Transfiera fondos entre sus cuentas bancarias» (`sm:max-w-[550px]`) | Alta | Tras #5 | `NuevaTransferenciaDialog.tsx:143-149` |
| 19 | campo | «Sucursal *» (Building2; placeholder «Seleccionar sucursal»; ítems «{nombre}» + «(principal)») | `BranchSelectorField` con sus 3 estados («Cargando sucursales...», «No hay sucursales configuradas», aviso ámbar «Estás en "Todas las sucursales"…») | Siempre | NuevaTransferenciaDialog.tsx:153 · `BranchSelectorField.tsx:72-132` |
| 20 | campo | «Cuenta Origen *» (placeholder «Seleccione cuenta origen»; ítems «{bank_name o 'Banco'} - {name}» + saldo a la derecha) | Excluye la cuenta destino | Siempre | NuevaTransferenciaDialog.tsx:157-179 |
| 21 | texto | «Saldo disponible: {importe}» (verde) | Eco del saldo de origen | Tras elegir origen | NuevaTransferenciaDialog.tsx:182-186 |
| 22 | estado | Building2 → ArrowRight azul → Building2, centrado | Decorativo | Siempre | NuevaTransferenciaDialog.tsx:190-196 |
| 23 | campo | «Cuenta Destino *» (placeholder «Seleccione cuenta destino») | Excluye la cuenta origen | Siempre | NuevaTransferenciaDialog.tsx:200-224 |
| 24 | campo | «Monto a Transferir *» (prefijo «$», placeholder «0.00») | Importe | Siempre | NuevaTransferenciaDialog.tsx:229-244 |
| 25 | campo | «Fecha de Transferencia» (`type=date`, hoy en **UTC**) | — | Siempre | NuevaTransferenciaDialog.tsx:249-258 |
| 26 | campo | «Referencia / Comprobante» (placeholder «Ej: TRF-001, Comprobante #...») | Texto libre | Siempre | NuevaTransferenciaDialog.tsx:263-272 |
| 27 | campo | «Notas (Opcional)» (Textarea rows=2, placeholder «Información adicional...») | Texto libre | Siempre | NuevaTransferenciaDialog.tsx:277-287 |
| 28 | botón | «Cancelar» (outline) / «Realizar Transferencia» (azul) → «Procesando...» (Loader2) | — | — | NuevaTransferenciaDialog.tsx:291-313 |
| 29 | toast | «Error» / «Seleccione la cuenta origen» · «…Seleccione la cuenta destino» · «…Las cuentas deben ser diferentes» · «…El monto debe ser mayor a 0» · **«Advertencia»** / «Saldo insuficiente. Disponible: {importe}» (variante `destructive` pese al título) · «Éxito» / «Transferencia realizada correctamente» | Validaciones y resultado | — | NuevaTransferenciaDialog.tsx:84-133 |
| 30 | cálculo | `status: 'completed'` **fijo** en el insert | La UI nunca crea una transferencia pendiente | Siempre | transferenciasService.ts:160 |

Lee `bank_transfers` con dos joins embebidos a `bank_accounts` por FK de origen y destino (54-102). Al insertar dispara `trg_auto_journal_bank_transfer` y `trg_branch_default`/`trg_branch_audit`. **No escribe** en `payments`, `accounts_receivable` ni `accounts_payable`; sí intenta mover `bank_accounts.balance` a mano, y **ese `UPDATE` nunca se envía** (§H). **No existe**: paginación, orden, filtros por estado/fecha/cuenta, selección múltiple, vista de tarjetas en móvil, ni control de permisos más allá del `AuthGuard` global.

### C.13 Detalle de transferencia `/app/finanzas/transferencias/[id]` — `transferencias/TransferenciaDetalle.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `DetailSkeleton` | Carga | `isLoading` | TransferenciaDetalle.tsx:117-123 |
| 2 | estado | «Transferencia no encontrada» (h2 centrado) + botón «Volver al listado» | Error o id de otra organización — **no distingue un 403** | `!transfer` | TransferenciaDetalle.tsx:125-136 |
| 3 | botón | (icono ArrowLeft, ghost) | `Link` al listado | Siempre | TransferenciaDetalle.tsx:143-147 |
| 4 | texto | «Transferencia» (h1) — **sin número ni referencia** | Título | Siempre | TransferenciaDetalle.tsx:153-155 |
| 5 | badge | «Completada» / «Pendiente» / «Anulada» | Mapa de colores **duplicado literalmente** del listado | Siempre | TransferenciaDetalle.tsx:156-158, 29-39 |
| 6 | texto | `formatDate(transfer_date)` | Subtítulo | Siempre | TransferenciaDetalle.tsx:160-162 |
| 7 | exportación | «Exportar» (Download, outline) → `transferencia_{8 chars}.txt` con «COMPROBANTE DE TRANSFERENCIA» + `=============================` + «CUENTA ORIGEN» / «CUENTA DESTINO» / «MONTO:» / «Referencia:» / «Estado:» / «Notas:» (ausentes → «N/A») | **Texto plano, no PDF** | Siempre | TransferenciaDetalle.tsx:166-169, 85-115 |
| 8 | botón | «Anular» (XCircle, destructive) | `confirm` + `prompt` nativos; el motivo se anexa a `notes` como «ANULADA: {motivo}» | Solo `completed` | TransferenciaDetalle.tsx:170-175, 69-71 |
| 9 | texto | «Detalle de la Transferencia» (ArrowLeftRight) | Tarjeta principal | Siempre | TransferenciaDetalle.tsx:183-189 |
| 10 | estado | «ORIGEN» (mayúsculas, rojo, Building2, caja `bg-red-50`) + nombre + banco o «Sin banco» | Bloque izquierdo | Siempre | TransferenciaDetalle.tsx:193-204 |
| 11 | estado | ArrowRight azul 32 px | Separador | Siempre | TransferenciaDetalle.tsx:206-209 |
| 12 | estado | «DESTINO» (verde, `bg-green-50`) + nombre + banco o «Sin banco» | Bloque derecho | Siempre | TransferenciaDetalle.tsx:212-223 |
| 13 | stat | «Monto Transferido» + importe `text-4xl` azul, centrado | Cifra principal | Siempre | TransferenciaDetalle.tsx:226-231 |
| 14 | texto | «Información Adicional» (FileText) · «Fecha de Transferencia» (Calendar) · «Referencia» (Hash) o «Sin referencia» | Rejilla `grid-cols-2` **fija, no responsive** | Siempre | TransferenciaDetalle.tsx:236-258 |
| 15 | texto | «Notas» (`whitespace-pre-wrap`, tras un `Separator`) | Muestra también el sufijo «ANULADA: …» | Si hay notas | TransferenciaDetalle.tsx:261-271 |
| 16 | texto | «Registro» (User) · «ID de Transferencia» + UUID en `font-mono text-xs` — **sin botón de copiar**, a diferencia del listado | Panel lateral | Siempre | TransferenciaDetalle.tsx:278-291 |
| 17 | texto | «Creado el» + fecha · «Creado por» + `created_by.slice(0,8)` + «...» — **trozo de UUID, no el nombre** | — | Si hay `created_by` | TransferenciaDetalle.tsx:292-305 |
| 18 | stat | «Monto de Transferencia» + importe `text-3xl` + fecha, sobre `bg-gradient-to-br from-blue-500 to-blue-600` | **Repite el dato de #13** | Siempre | TransferenciaDetalle.tsx:309-319 |
| 19 | toast | «Error» / «No se pudo cargar el detalle de la transferencia» · «Éxito» / «Transferencia anulada correctamente» · «Error» / {error} · «Error» / «Error al anular» | — | — | TransferenciaDetalle.tsx:53-57, 75, 78, 81 |

Layout `grid lg:grid-cols-3` con la tarjeta principal a `lg:col-span-2`. **No existe**: historial/auditoría, adjuntos, impresión/PDF, enlace a la conciliación bancaria ni al asiento contable, duplicar, ni edición.

### C.14 Saldos a favor `/app/finanzas/saldos-a-favor` — `components/finanzas/saldos-a-favor/SaldosAFavorPage.tsx`

**No son notas de crédito fiscales**: son anticipos del cliente sobre la tabla `credit_notes` (§I.1).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Saldos a favor» (h1, Wallet azul) / «Anticipos y créditos de clientes aplicables a facturas.» | Cabecera — **sin botón de volver** | Siempre | SaldosAFavorPage.tsx:88-94 |
| 2 | botón | «Nuevo saldo» (Plus, primario) | Abre `NuevoSaldoFavorDialog` | Siempre | SaldosAFavorPage.tsx:96-99 |
| 3 | badge | «Sucursal:» + «Todas las sucursales» / «{nombre}» | `BranchBadge` | Siempre | SaldosAFavorPage.tsx:102 |
| 4 | stat | «Total disponible» (verde, `text-2xl`) | **Cálculo en cliente**: suma de `balance` de los `active` ya cargados | Tarjeta única a ancho completo | SaldosAFavorPage.tsx:104-113, 66-68 |
| 5 | columna | «Cliente» (o «N/A») · «Monto» · «Usado» (`amount − balance`) · «Disponible» (`font-semibold`) · «Vence» · «Estado» · «Acciones» | 7 columnas | Siempre | SaldosAFavorPage.tsx:120-126 |
| 6 | texto | «05 feb 2026» (`format(parseLocalDate(expiry_date), 'dd MMM yyyy', {locale: es})`); «—» si es nulo o el parseo falla | Columna «Vence» | Por fila | SaldosAFavorPage.tsx:153, 75-82 |
| 7 | badge | «Activo» (verde) · «Usado» (gris) · «Vencido» (rojo) | Estado | Por fila | SaldosAFavorPage.tsx:32-34 |
| 8 | badge | Texto crudo del estado, **sin clases de color** | Fallback | `cancelled` u otro | SaldosAFavorPage.tsx:144 |
| 9 | botón | «Aplicar» (outline sm, sin icono) | Abre `AplicarSaldoFavorDialog` | Visible siempre; **`disabled`** si no está activo o `balance <= 0` | SaldosAFavorPage.tsx:157-166 |
| 10 | estado | Loader2 girando (`colSpan={7}`, `py-8`) | Carga dentro de la tabla | `isLoading` | SaldosAFavorPage.tsx:130-135 |
| 11 | estado | «No hay saldos a favor registrados.» (`colSpan={7}`) | Vacío — **también se muestra si la consulta falla** | — | SaldosAFavorPage.tsx:136-141 |
| 12 | diálogo | «Nuevo saldo a favor» (`sm:max-w-[480px]`) | Alta | Tras #2 | `NuevoSaldoFavorDialog.tsx:106` |
| 13 | texto | «Registra un anticipo o saldo a favor del cliente. Genera el asiento contable (crédito a Anticipos 2805).» | Descripción — **expone el código PUC al usuario** | — | NuevoSaldoFavorDialog.tsx:107-109 |
| 14 | campo | «Sucursal *» (placeholder «Seleccionar sucursal») | `BranchSelectorField` | Siempre | NuevoSaldoFavorDialog.tsx:113 |
| 15 | campo | «Cliente» (placeholder «Selecciona un cliente») | Select de `customers.full_name`, **sin buscador y sin límite** | Siempre | NuevoSaldoFavorDialog.tsx:115-129 |
| 16 | campo | «Monto» (`type=number min=0`), **sin placeholder** (valor inicial literal `0`) | Importe | Siempre | NuevoSaldoFavorDialog.tsx:131-140 |
| 17 | campo | «Origen del dinero» (select **sin placeholder**, arranca en «Bancos (1110)»): «Bancos (1110)» / «Caja (1105)» | Cuenta de contrapartida — **códigos PUC cableados en el componente** | Siempre | NuevoSaldoFavorDialog.tsx:142-153, 49 |
| 18 | campo | «Vencimiento (opcional)» (`type=date`) · «Notas (opcional)» (Textarea rows=2, placeholder «Motivo del saldo a favor...») | — | Siempre | NuevoSaldoFavorDialog.tsx:155-174 |
| 19 | botón | «Cancelar» (outline) / «Crear saldo» (+ Loader2) | RPC `fn_create_customer_credit` | — | NuevoSaldoFavorDialog.tsx:178-184 |
| 20 | toast | «Error» / «Selecciona un cliente» · «El monto debe ser mayor a 0» · «Saldo a favor creado» / «El saldo a favor se registró correctamente.» · «Error» / {error.message} (p. ej. «No se pudo obtener el branch_id. Seleccione una sucursal.») | — | — | NuevoSaldoFavorDialog.tsx:69-96 |
| 21 | diálogo | «Aplicar saldo a favor» (`sm:max-w-[480px]`) | Aplicación a una factura | Tras #9 | `AplicarSaldoFavorDialog.tsx:296` |
| 22 | texto | «Cliente: **{nombre o 'N/A'}** · Disponible: **{importe}**» | Descripción contextual | Con saldo | AplicarSaldoFavorDialog.tsx:297-304 |
| 23 | campo | «Factura pendiente» (placeholder «Selecciona una factura»; ítems «{number} — saldo {importe}») | Facturas con saldo | Siempre | AplicarSaldoFavorDialog.tsx:308-321 |
| 24 | estado | «Este cliente no tiene facturas pendientes.» | Vacío del select — **también mientras carga y si la consulta falla** | — | AplicarSaldoFavorDialog.tsx:322-324 |
| 25 | campo | «Monto a aplicar» (`type=number min=0`), sin placeholder | Al elegir factura precarga `min(saldo factura, saldo disponible)` | Siempre | AplicarSaldoFavorDialog.tsx:327-336, 250-254 |
| 26 | botón | «Cancelar» (outline) / «Aplicar» (+ Loader2; **`disabled` sin factura elegida**) | RPC `fn_apply_customer_credit` | — | AplicarSaldoFavorDialog.tsx:340-346 |
| 27 | toast | «Error» / «Selecciona una factura» (inalcanzable) · «El monto debe ser mayor a 0» · «El monto excede el saldo disponible» · «El monto excede el saldo de la factura» · «Saldo aplicado» / «El saldo a favor se aplicó a la factura.» · «Error» / {error.message} («Saldo a favor no encontrado», «El saldo a favor no está disponible», «La factura pertenece a otra organización») | Los dos mensajes de exceso los repite el RPC con el mismo texto | — | AplicarSaldoFavorDialog.tsx:259-286 · baseline:4504, 4511 |

El servicio está **dentro de `components/`, no en `src/lib/services/`**, y el listado tiene **dos rutas distintas**: sin sucursal → RPC `fn_list_customer_credits`; con sucursal → consulta directa a `credit_notes` + join `customers`, calculando `used` en cliente (saldosAFavorService.ts:399-437). **No existe**: buscador, filtros, orden, paginación, exportación, detalle del saldo, historial de aplicaciones (`credit_note_applications` no se muestra en ninguna pantalla) ni reverso de una aplicación.

### C.15 Comisiones `/app/finanzas/comisiones` — `app/app/finanzas/comisiones/page.tsx` + `components/finanzas/comisiones/**`

**La única pantalla del módulo que pasa por un route handler y por `getServerOrgContext()`.** También la única con foco gestionado y `aria-live`. Es el modelo a seguir para el rediseño.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Comisiones» (Percent 28 px azul, h1) / «Gestión y seguimiento de comisiones generadas» | Cabecera — sin volver ni migaja | Siempre | `ComisionesHeader.tsx:9-15` |
| 2 | botón | «Actualizar» (RefreshCw, outline sm, `id="comisiones-actualizar"`) | `GET /api/crm/commissions?{query}`; el icono gira | `disabled` con `state.loading` | page.tsx:59-62 |
| 3 | stat | «Devengado» (TrendingUp, chip azul) + «{n} comisiones vivas» | `pending_total + paid_total` | Siempre | `ComisionesSummary.tsx:29-37, 86-88` |
| 4 | stat | «Pagado» (CheckCircle2, chip verde) + «{n} pagadas» | `paid_total` | Siempre | ComisionesSummary.tsx:38-46 |
| 5 | stat | «Pendiente de pago» (Clock, chip ámbar) + «{n} por pagar» | `pending_total` | Siempre | ComisionesSummary.tsx:47-55 |
| 6 | stat | «Canceladas» (XCircle, chip rojo) + «ninguna» o «{importe} rechazadas · {importe} clawback» | `cancelled_total` | Siempre | ComisionesSummary.tsx:56-67 |
| 7 | estado | `Skeleton h-8 w-28` · «—» con `aria-label="No disponible"` + «No se pudo cargar» | Carga / error — **nunca pinta `$0` si la carga falló** | — | ComisionesSummary.tsx:81-88 |
| 8 | texto | «+ {N comisión/comisiones} en {MONEDA}: {x} devengado · {y} pagado · {z} pendiente» | Monedas distintas de la base, **nunca sumadas** | Si las hay | ComisionesSummary.tsx:92-100 |
| 9 | estado | `aria-label="Resumen de comisiones del filtro"` / `aria-label="Comisiones en otras monedas"` | Landmarks para lector de pantalla | — | ComisionesSummary.tsx:71, 93 |
| 10 | campo | «Buscar» (placeholder «Nombre o notas», Search `pl-9`, `id="com-search"`) | `?search=` (recorte a 80 chars en servidor) — **sin debounce** | Siempre | `ComisionesFilters.tsx:38-42` |
| 11 | campo | «Miembro» (`id="com-member"`): «Todos» + «{nombre}» → `email` → «Miembro» | **Solo si `canManage`** | — | ComisionesFilters.tsx:45-60 |
| 12 | campo | «Estado» (`id="com-status"`): «Todos» / «Pendientes» / «Pagadas» / «Canceladas» | Filtro | Siempre | ComisionesFilters.tsx:62-75 |
| 13 | campo | «Origen» (`id="com-source"`): «Todos» / «Factura de venta» / «Oportunidad» / «Venta POS» / «Factura de compra» | Filtro | Siempre | ComisionesFilters.tsx:77-91 |
| 14 | campo | `<fieldset>` con `<legend>` «Devengadas entre» + dos `type=date` (`aria-label="Desde"` / «Hasta») + «y» (`aria-hidden`) | `?from=`/`?to=`, **inclusivo**; se convierte con `plainDateToInstant(…, tz)` en la zona de la organización — **regla canónica cumplida** | Siempre | ComisionesFilters.tsx:94-101 · route.ts:46 |
| 15 | chip | «{N} filtro activo» / «{N} filtros activos» (azul) | Contador — **el rango de fechas cuenta como 1** | Si >0 | ComisionesFilters.tsx:107-109 · comisionesModel.ts:36-38 |
| 16 | botón | «Limpiar» (X 14 px, ghost) | Resetea los filtros | Con filtros activos | ComisionesFilters.tsx:110-113 |
| 17 | estado | `Alert variant="destructive"` «No se pudieron cargar las comisiones» + «{error} · Se muestra la última lista conocida.» + botón «Reintentar» | Banner **no bloqueante** | `state.error` | page.tsx:75-83 |
| 18 | estado | `TableSkeleton columns={8} rows={5}` | Esqueleto — **la tabla tiene 9 columnas con permisos y 7 sin ellos** | Carga sin datos previos | page.tsx:87-88 |
| 19 | estado | Barra `role="region" aria-label="Acciones sobre la selección"` (`bg-blue-50`, **no flotante**) | Aparece entre filtros y tabla | Con `canManage` y selección o diálogo abierto | `ComisionesToolbar.tsx:49, 66-71` |
| 20 | texto | «{N} seleccionada · {total}» / «{N} seleccionadas · {total}» (`aria-live="polite"`) | Recuento + suma | En la barra | ComisionesToolbar.tsx:72-74 |
| 21 | botón | «Pagar» + «({N})» si N>1 (Check, azul) | Diálogo de pago en lote | Si **todas** están en `accrued` | ComisionesToolbar.tsx:75-80 |
| 22 | botón | «Rechazar» (XCircle, outline) | `ReasonDialog` | Si todas en `accrued` | ComisionesToolbar.tsx:81-86 |
| 23 | botón | «Clawback» (RotateCcw, rojo) | `ClawbackDialog` (2 pasos) | Todas en `paid` **y** exactamente 1 seleccionada | ComisionesToolbar.tsx:87-98 |
| 24 | texto | «Selecciona comisiones del mismo estado para actuar sobre ellas.» | Explica la ausencia de acciones | Sin acciones posibles | ComisionesToolbar.tsx:99-101 |
| 25 | botón | (icono X, ghost, `aria-label="Quitar selección"`) | Limpia la selección | En la barra | ComisionesToolbar.tsx:102-104 |
| 26 | tabla | `<caption class="sr-only">` «Comisiones del filtro actual» | Título accesible | Con ≥1 fila | `ComisionesList.tsx:54` |
| 27 | columna | Checkbox de cabecera (`data-select-all`), `aria-label` alterna «Seleccionar todas» / «Quitar selección de todas» | Selección global | Solo `canManage` | ComisionesList.tsx:57-61 |
| 28 | columna | «Comisionista» · «Origen» · «Base» · «Tasa» · «Comisión» · «Estado» · «Devengada» · «Acciones» | 8 + la de selección | Siempre | ComisionesList.tsx:62-69 |
| 29 | toggle | Checkbox de fila, `aria-label="Seleccionar comisión de {nombre} por {importe}"` | — | Solo `canManage` | ComisionesList.tsx:80-84 |
| 30 | texto | Nombre o **«Sin nombre»** + «Miembro» / «Proveedor» / «Tercero» | Traduce `payee_type` | Siempre | ComisionesList.tsx:86-87 |
| 31 | botón | «Venta POS» · «Factura de venta» · «Factura de compra» · «Oportunidad» (ExternalLink + `<span class="sr-only">(abrir origen)</span>`) | `Link` a `/app/pos/ventas/{id}`, `/app/finanzas/facturas-venta/{id}`, `/app/finanzas/facturas-compra/{id}`, `/app/crm/oportunidades/{id}` | Con ruta y `source_id` | ComisionesList.tsx:90-95 · comisionesModel.ts:40-58 |
| 32 | texto | Misma etiqueta **sin enlace**, o el `source_type` crudo | Fallback | Sin `source_id` | ComisionesList.tsx:96-98 |
| 33 | badge | «Pendiente» (Clock, ámbar) · «Pagada» (CheckCircle2, verde) · «Clawback» (XCircle, rojo) · «Rechazada» (rojo) · «Cancelada» (rojo) | **En BD solo hay `accrued`/`paid`/`cancelled`**: las tres últimas se distinguen por `metadata.reason` | Por fila | ComisionesList.tsx:35-37 · comisionesModel.ts:97-102 |
| 34 | texto | «Motivo: {notes}» (`max-w-[16rem] text-xs`) | Motivo del rechazo o clawback | `cancelled` con notas | ComisionesList.tsx:108-110 |
| 35 | botón | «Pagar» (outline h-7) · «Clawback» (ghost rojo) | Acción de fila | `accrued` / `paid` con `canManage` | ComisionesList.tsx:115-124 |
| 36 | estado | Fila seleccionada `bg-blue-50 dark:bg-blue-900/20`; sin seleccionar `hover:bg-gray-50` | Realce | — | ComisionesList.tsx:79 |
| 37 | estado | Card `border-dashed` con Percent en círculo azul: «Ninguna comisión coincide con el filtro» + «Prueba a ampliar el periodo, cambiar el miembro o quitar el estado.» | Vacío **filtrado** | Con filtros | `ComisionesEmpty.tsx:11-19` |
| 38 | estado | «Aún no hay comisiones devengadas» + «Se generan solas al facturar con vendedor o al ganar una oportunidad, con la tasa configurada en …» + enlace «Configuración › CRM › Vendedores y comisiones» → `/app/configuracion?modulo=crm` | Vacío **real** | Sin filtros | ComisionesEmpty.tsx:23-29 |
| 39 | diálogo | «¿Pagar {importe} a {payee_name o 'sin nombre'}?» / «La comisión pasará a pagada con la fecha de hoy. Solo se paga si sigue pendiente.» · «Cancelar» / «Sí, pagar» | Pago de una fila (vía `bulk-pay` con un solo id) | `payRow !== null` | page.tsx:103-113 · `confirm-dialog.tsx:62-97` |
| 40 | estado | «Procesando...» + Loader2 | Sustituye la etiqueta de confirmar | `loading` | confirm-dialog.tsx:85-90 |
| 41 | diálogo | «¿Pagar {total} a {payee}?» / «{N comisión/es pendiente/s} pasará a pagada» / «pasarán a pagadas» + «con la fecha de hoy. Solo se pagan las que sigan pendientes.» | Pago en lote — **máx. 200 ids, el resto → 400** | `dialog === 'pay'` | ComisionesToolbar.tsx:106-116 · bulk-pay/route.ts:6, 22 |
| 42 | diálogo | «Rechazar comisión» (N=1) / «Rechazar {N} comisiones» + «{total} de {payee} quedarán canceladas (rechazadas). El motivo se guarda en cada comisión.» | Rechazo | `dialog === 'reject'` | ComisionesToolbar.tsx:118-122 · `ReasonDialog.tsx:58-63` |
| 43 | campo | «Motivo» (Textarea rows=3, `maxLength={500}`, `autoFocus`, **sin placeholder**) + «Obligatorio · máximo 500 caracteres.» | Obligatorio | En el diálogo | ReasonDialog.tsx:71-92 |
| 44 | estado | «Escribe el motivo: queda registrado en la comisión.» (`role="alert"`, rojo, con `aria-invalid` + `aria-describedby`; devuelve el foco al textarea) | Validación al enviar vacío | — | ReasonDialog.tsx:50-52, 85-88 |
| 45 | botón | «Cancelar» (outline) / «Rechazar» (submit, azul) → «Procesando…» | **N `POST /api/crm/commissions/{id}/reject` en serie, sin transacción** | — | ReasonDialog.tsx:95-100 · useComisiones.ts:138-155 |
| 46 | diálogo | «Revertir comisión pagada (clawback)» / «Vas a revertir {importe} de {payee}. La comisión pasará a cancelada; la fecha de pago se conserva como evidencia.» · «Continuar» (rojo) | Paso 1 — **aún no llama a la API** | `open && reason === null` | `ClawbackDialog.tsx:64-74` |
| 47 | diálogo | «¿Revertir {importe} de {payee}?» / «Motivo: «{reason}». Esta acción cancela la comisión y no se puede deshacer desde aquí.» · «No, volver» / «Sí, revertir» (destructive) | Paso 2 | `open && reason !== null` | ClawbackDialog.tsx:76-91 |
| 48 | toast | «1 comisión pagada» / «3 comisiones pagadas · 1 no se pudo pagar ({motivo})» · «No se pudo pagar» · «2 comisiones rechazadas · 1 no se pudo rechazar ({motivo})» · «Comisión revertida (clawback)» · «No se pudo revertir» · «No se pudo completar» | Máximo 5 a la vez, 5000 ms | — | page.tsx:49, 51, 128 · ComisionesToolbar.tsx:62, 127 · useComisiones.ts:161 |
| 49 | estado | Orden de retorno del foco al cerrar un diálogo cuyo disparador ya no existe: **fila siguiente → «Actualizar» → checkbox «Seleccionar todas» → `null`**; nunca enfoca el `<body>` | `commissionFocusFallback` + `focusAfterCommissionAction` | — | `comisionesFocus.ts:20-43` · comisionesModel.ts:136-143 |
| 50 | cálculo | Toda escritura exige `.eq('status', from)`: **dos peticiones concurrentes no pagan dos veces** | Servidor | Siempre | commissionAdminService.ts:10-12 |
| 51 | cálculo | `canManageCommissions`: `isSuperAdmin` o `roleId ∈ STAGE_MANAGER_ROLE_IDS` — **por id de rol, nunca por nombre** | Gate de la pantalla | Siempre | commissionTransitions.ts:242-244 |
| 52 | cálculo | El clawback conserva `paid_at` y guarda `paid_at_before_clawback`, `clawback_at`, `clawback_by` | Auditoría | Al revertir | commissionTransitions.ts:101-113 |
| 53 | cálculo | Sin `canManage` desaparecen la columna de selección, la de acciones, la barra y el filtro «Miembro», y **el servidor fuerza `payee_id = ctx.userId`** | Gate real | — | route.ts:44 · ComisionesList.tsx:57, 69, 113 |

Errores del servidor, todos en texto plano por `routeError` (`f13RouteSupport.ts:40-54`): 400 «status inválido: accrued, paid o cancelled», 400 «source_type inválido», 400 «from/to deben ser YYYY-MM-DD», 401/403 de `OrgContextError` («Requiere rol de administrador o manager de la organización»), 409 «No se puede aplicar «{acción}» a una comisión en estado «{estado}» (se requiere «{estado}»).», 404 «Comisión no encontrada en esta organización», 502 «La base de datos no respondió: {mensaje}», 500 genérico; y a los 20 s «La petición a {url} superó los 20 s. El servidor o la base de datos no respondieron.» (`fetchJson.ts:14, 50-53`). **Ninguno se pinta junto al campo: todos salen como toast rojo.** **No existe**: orden por columna, paginación (`count` se recibe y se tira; el defecto es 200 y el tope 500), densidad, selector de columnas, exportación, filtro por tipo de comisión (la API lo acepta), ni atajos de teclado.

---

## D. Bancos

Ninguna de estas 13 pantallas comprueba permisos ni módulo contratado. La organización sale de
`getOrganizationId()`, que lee `localStorage` (`lib/hooks/useOrganization.ts:376-379`).
El bloque tiene **dos lenguajes visuales distintos**: D.1-D.9 son «ERP clásico» (flecha atrás,
icono en caja azul, migaja, listas en tarjetas, colores Tailwind a mano) y D.10-D.13 son «panel de
integración» (sin flecha atrás, sin migaja, `<Table>` de shadcn, variantes semánticas
`success`/`warning`/`info`/`destructive`). La acentuación también cambia: D.1-D.7 llevan tildes,
D.8-D.13 **no** («Tesoreria», «Numero», «Proposito», «Deteccion de Anomalias»).

### D.1 Bancos (lista) `/app/finanzas/bancos` — `components/finanzas/bancos/BancosPage.tsx` (+ `BancosPageHeader`, `BankStatsCards`, `BankAccountsGrid`, `BankAccountCard`, `RealTimeBalanceWidget`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft, sin texto) | `Link href="/app/finanzas"` | Siempre | `components/finanzas/bancos/BancosPageHeader.tsx:165-169` |
| 2 | texto | «Gestión Bancaria» | H1 | Siempre | BancosPageHeader.tsx:174-176 |
| 3 | texto | «Finanzas / Bancos» | Migaja estática (no es componente Breadcrumb) | Siempre | BancosPageHeader.tsx:177-179 |
| 4 | botón | (icono RefreshCw, sin texto) | `onRefresh()` → recarga cuentas + KPIs; el icono gira y el botón se deshabilita | Siempre | BancosPageHeader.tsx:184-194 |
| 5 | botón | «Exportar» (icono FileDown) | **Nada: no tiene `onClick`** | Siempre | BancosPageHeader.tsx:195-201 |
| 6 | botón | «Nueva Cuenta» (icono Plus) | `router.push('/app/finanzas/bancos/cuentas/nuevo')` | Siempre | BancosPageHeader.tsx:202-208 |
| 7 | badge | «Sucursal:» + «Todas las sucursales» / nombre / «Sucursal #{id}» | `BranchBadge`; azul si null, fucsia si concreta. No es clicable | Siempre | BancosPage.tsx:68 · `components/inventario/BranchBadge.tsx:16-29` |
| 8 | estado | 4 rectángulos `h-28 animate-pulse` | Esqueleto de KPIs | `isLoading` o `stats === null` | BankStatsCards.tsx:227-238 |
| 9 | stat | «Total Cuentas» + «{n} activas» (Landmark azul) | `stats.total_accounts` | Cargado | BankStatsCards.tsx:242-257 |
| 10 | stat | «Cuentas Activas» + «de {n} cuentas» (CreditCard verde) | `stats.active_accounts` | Cargado | BankStatsCards.tsx:259-274 |
| 11 | stat | «Saldo Total» + «En todas las cuentas activas» (DollarSign esmeralda) | Verde si ≥0, rojo si <0 | Cargado | BankStatsCards.tsx:276-295 |
| 12 | stat | «Conciliaciones Pendientes» + «Por completar» (AlertCircle naranja) | `bank_reconciliations` en `draft`/`in_progress` | Cargado | BankStatsCards.tsx:297-312 |
| 13 | pestaña | «Cuentas Bancarias» (icono Landmark) | Activa por defecto; fondo `blue-100` | Siempre | BancosPage.tsx:76-82 |
| 14 | pestaña | «Conciliación Bancaria» (icono ArrowRightLeft) | Placeholder con 2 botones | Siempre | BancosPage.tsx:83-89 |
| 15 | texto | «Cuentas Bancarias» | Título de la Card | Pestaña 1 | BancosPage.tsx:95-97 |
| 16 | estado | 3 rectángulos `h-48 animate-pulse` (grid 1/2/3) | Esqueleto de tarjetas | `isLoading` | BankAccountsGrid.tsx:330-341 |
| 17 | estado | «No hay cuentas bancarias» + «Aún no has registrado ninguna cuenta bancaria. Crea una nueva cuenta para comenzar a gestionar tus finanzas.» | Vacío. **Sin botón de acción** | `accounts.length === 0` | BankAccountsGrid.tsx:343-357 |
| 18 | texto | {nombre de la cuenta} — `CopyableId` | Click abre el detalle (`title="Ver detalle"`); el icono copia el id y pasa a check verde 2 s | Por tarjeta | BankAccountCard.tsx:91-96 · `components/common/CopyableId.tsx:53-84` |
| 19 | texto | {bank_name} / «Sin banco» | Subtítulo | Por tarjeta | BankAccountCard.tsx:98-100 |
| 20 | badge | «Activa» (verde) / «Inactiva» (gris) | `is_active` | Por tarjeta | BankAccountCard.tsx:104-111 |
| 21 | menú | (icono MoreVertical «⋮») | Abre el DropdownMenu | Por tarjeta | BankAccountCard.tsx:112-117 |
| 22 | menú | «Ver Detalles» (Eye) | `/app/finanzas/bancos/cuentas/{id}` | Menú abierto | BankAccountCard.tsx:119-122 |
| 23 | menú | «Movimientos» (ArrowRightLeft) | `.../{id}/movimientos` | Menú abierto | BankAccountCard.tsx:123-126 |
| 24 | menú | «Editar» (Edit) | `.../{id}?edit=true` — **el parámetro no lo lee nadie** | Menú abierto | BankAccountCard.tsx:127-130 |
| 25 | menú | «Desactivar» (XCircle roja) / «Activar» (CheckCircle verde) | `UPDATE bank_accounts.is_active`. **Sin confirmación** | Menú abierto, tras separador | BankAccountCard.tsx:131-147 |
| 26 | texto | «****{4 últimos dígitos}» (CreditCard) | Enmascara `account_number` | Si hay número | BankAccountCard.tsx:156-164 |
| 27 | badge | «Corriente» / «Ahorros» / «Crédito» / {valor crudo} / «Cuenta» | `getAccountTypeLabel`, variante `outline` | Junto al número | BankAccountCard.tsx:72-79, 160-162 |
| 28 | stat | «Saldo Actual» + importe grande | `formatCurrency(balance, currency ?? 'COP')`, verde/rojo | Por tarjeta | BankAccountCard.tsx:167-176 |
| 29 | botón | «Movimientos» (outline, media anchura) | Navega a movimientos | Por tarjeta | BankAccountCard.tsx:189-197 |
| 30 | botón | «Detalles» (outline, media anchura) | Navega al detalle | Por tarjeta | BankAccountCard.tsx:198-206 |
| 31 | estado | 5 skeletons apilados | Carga del widget de saldo real | Mientras consulta | RealTimeBalanceWidget.tsx:103-115 |
| 32 | estado | «Error al consultar saldo real» + mensaje + botón «Reintentar» (RefreshCw) | Card roja | Si falla `/real-balance` | RealTimeBalanceWidget.tsx:118-142 |
| 33 | estado | «Sin vinculacion Open Finance» (**sin tilde**) | Card gris informativa | `data.isLinked === false` | RealTimeBalanceWidget.tsx:145-156 |
| 34 | texto | «Saldo ERP» (Database) + importe | `bank_accounts.balance` | Widget visible | RealTimeBalanceWidget.tsx:171-179 |
| 35 | texto | «Saldo Banco» (Building2 azul) + importe | `data.realBalance` del proveedor | Widget visible | RealTimeBalanceWidget.tsx:182-190 |
| 36 | badge | «Diferencia» + importe; verde con CheckCircle si \|dif\| < 1, rojo con AlertCircle si ≥ 1 | Umbral **fijo de 1 unidad monetaria** | Widget visible | RealTimeBalanceWidget.tsx:160, 193-210 |
| 37 | texto | «Actualizado hace menos de 1 minuto» / «hace {n} minuto(s)» / «hora(s)» / «dia(s)» (**sin tilde**) | `timeAgo` en cliente | Widget visible | RealTimeBalanceWidget.tsx:41-55, 214-216 |
| 38 | botón | «Actualizar» (ghost, RefreshCw pequeño) | `toast.promise(fetchBalance())` | Widget visible | RealTimeBalanceWidget.tsx:217-226 |
| 39 | toast | «Consultando saldo real...» → «Saldo actualizado» / «Error al actualizar saldo» | Toast de promesa | Al pulsar #38 | RealTimeBalanceWidget.tsx:95-99 |
| 40 | botón | «Ver Conciliaciones» (azul) | `/app/finanzas/conciliacion-bancaria` | Pestaña 2 | BancosPage.tsx:115-120 |
| 41 | estado | «Gestión de Conciliaciones» + «Accede al módulo completo de conciliación bancaria para gestionar tus extractos y conciliar movimientos.» | Placeholder de la pestaña 2 | Pestaña 2 | BancosPage.tsx:123-130 |
| 42 | botón | «Ir a Conciliación Bancaria» (outline) | Mismo destino que #40 | Pestaña 2 | BancosPage.tsx:131-137 |
| 43 | toast | «Datos actualizados» / «Error al cargar los datos bancarios» | Refresco y carga | — | BancosPage.tsx:50 · 36 |
| 44 | toast | «Cuenta activada» / «Cuenta desactivada» / «Error al cambiar el estado de la cuenta» | Toggle | — | BancosPage.tsx:56 · 60 |

Datos: `BancosService` sobre `bank_accounts` filtrado por `organization_id` y, con filtro global activo, por `branch_id` (`BancosService.ts:102-128`); KPIs sumados en cliente y conteo de `bank_reconciliations` con `count:'exact', head:true` (`BancosService.ts:553-618`). El widget llama a `/api/integrations/open-finance/real-balance`. Layout: KPIs `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`; tarjetas `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`; pestañas `grid-cols-2` a ancho completo. **No existe**: buscador, filtro por banco/tipo/estado, orden, paginación, selección múltiple, exportación real ni vista de tabla. Cada tarjeta dispara su propio `fetch` a `/real-balance` (`BankAccountCard.tsx:44-48`) y el widget dispara **otro idéntico** (`RealTimeBalanceWidget.tsx:71-73`): **2N peticiones por pantalla**.

### D.2 Detalle de cuenta `/app/finanzas/bancos/cuentas/[id]` — `components/finanzas/bancos/cuentas/CuentaDetailPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Skeleton: círculo `h-10` + 2 barras + 3 cajas `h-32` | Carga inicial | `isLoading` | CuentaDetailPage.tsx:143-160 |
| 2 | estado | Pantalla en blanco (`return null`) | Tras el toast y la redirección | `!account` | CuentaDetailPage.tsx:52-56, 162-164 |
| 3 | toast | «Cuenta bancaria no encontrada» | Error + `router.push('/app/finanzas/bancos')` | Cuenta inexistente | CuentaDetailPage.tsx:53-54 |
| 4 | toast | «Error al cargar los datos de la cuenta» | Excepción de carga | — | CuentaDetailPage.tsx:72 |
| 5 | botón | (icono ArrowLeft) | `Link` al listado | Siempre | CuentaDetailPage.tsx:171-175 |
| 6 | texto | {account.name} | H1 | Siempre | CuentaDetailPage.tsx:180-182 |
| 7 | texto | «{bank_name} • {Cuenta Corriente\|Cuenta de Ahorros\|Línea de Crédito\|Cuenta}» | Subtítulo | Siempre | CuentaDetailPage.tsx:124-131, 183-185 |
| 8 | badge | «Activa» (verde) / «Inactiva» (gris) | Estado | Siempre | CuentaDetailPage.tsx:189-196 |
| 9 | botón | «Actualizar» (outline sm, RefreshCw) | `loadData()` | Siempre | CuentaDetailPage.tsx:197-206 |
| 10 | botón | «Editar» (outline sm, Edit) | `.../{id}?edit=true` — **sin efecto: la página nunca lee `searchParams`** | Siempre | CuentaDetailPage.tsx:207-215 |
| 11 | stat | «Saldo Actual» (DollarSign verde) | Verde/rojo por signo | Siempre | CuentaDetailPage.tsx:221-237 |
| 12 | stat | «Saldo Inicial» (DollarSign azul) | `initial_balance ?? 0` | Siempre | CuentaDetailPage.tsx:239-251 |
| 13 | stat | «Número de Cuenta» (CreditCard morado) | «****1234» o «N/A» | Siempre | CuentaDetailPage.tsx:253-265 |
| 14 | stat | «Moneda» (**icono Calendar naranja — icono equivocado**) | `currency ?? 'COP'` | Siempre | CuentaDetailPage.tsx:267-279 |
| 15 | texto | «Información de la Cuenta» (Building2 azul) | Título de la Card izquierda | Siempre | CuentaDetailPage.tsx:287-290 |
| 16 | texto | «Banco» / valor o «N/A» | Solo lectura | Siempre | CuentaDetailPage.tsx:293-296 |
| 17 | texto | «Tipo de Cuenta» | Solo lectura | Siempre | CuentaDetailPage.tsx:297-300 |
| 18 | texto | «Número Completo» | **Número sin enmascarar, sin permiso especial** | Siempre | CuentaDetailPage.tsx:301-304 |
| 19 | texto | «Fecha de Creación» + fecha larga con hora | `toLocaleDateString('es-CO')` en la zona del navegador | Siempre | CuentaDetailPage.tsx:133-141, 305-308 |
| 20 | texto | «Ultima sincronizacion Open Finance» (**sin tildes**) + fecha | De `open_finance_accounts` | Si hay `ofLink.last_balance_at` | CuentaDetailPage.tsx:310-320 |
| 21 | botón | «Ver Movimientos» (azul, ancho completo, ArrowRightLeft) | `.../{id}/movimientos` | Siempre | CuentaDetailPage.tsx:322-329 |
| 22 | botón | «Sincronizar con Open Finance» / «Sincronizando...» (outline azul, Zap pulsante) | `POST /api/integrations/open-finance/sync` | Si hay `ofLink` | CuentaDetailPage.tsx:332-341 |
| 23 | botón | «Sincronizar con Open Finance» (deshabilitado, `opacity-50`) | Inerte | Sin `ofLink` | CuentaDetailPage.tsx:343-354 |
| 24 | tooltip | «Esta cuenta no tiene un link de Open Finance vinculado» | Explica #23 | Hover | CuentaDetailPage.tsx:355-357 |
| 25 | botón | «Importar Extracto» (outline, Upload) | **Nada: no tiene `onClick`** | Siempre | CuentaDetailPage.tsx:362-368 |
| 26 | botón | «Nueva Conciliación» (outline, **icono FileDown — equivocado**) | `/app/finanzas/conciliacion-bancaria/nuevo` **sin preseleccionar la cuenta** | Siempre | CuentaDetailPage.tsx:369-376 |
| 27 | texto | «Últimos Movimientos» + «Los 10 movimientos más recientes» | Card derecha (2/3) | Siempre | CuentaDetailPage.tsx:385-391 |
| 28 | botón | «Ver Todos» (outline sm) | Navega a movimientos | Siempre | CuentaDetailPage.tsx:393-400 |
| 29 | estado | «No hay movimientos registrados» | Vacío | `transactions.length === 0` | CuentaDetailPage.tsx:403-407 |
| 30 | texto | {descripción} / «Sin descripción» + fecha con hora; DollarSign en círculo verde (credit) o rojo (debit) | Fila | Por movimiento | CuentaDetailPage.tsx:410-434 |
| 31 | cálculo | «+{importe}» / «-{importe}» | `formatCurrency(Math.abs(amount))` **sin pasar la moneda** | Por movimiento | CuentaDetailPage.tsx:437-444 |
| 32 | texto | «Ref: {reference}» | Bajo el importe | Si hay referencia | CuentaDetailPage.tsx:445-449 |
| 33 | toast | «Sincronizacion completada: {n} transacciones sincronizadas, {m} importadas» | Éxito de la sincronización | — | CuentaDetailPage.tsx:108-110 |
| 34 | toast | «Error al sincronizar con Open Finance» | Fallo | — | CuentaDetailPage.tsx:116-118 |

Datos: `obtenerCuentaBancaria(id)` + `obtenerTransacciones(id, {limit:10})`, más una consulta directa a `open_finance_accounts` con `.single()` desde el cliente (`CuentaDetailPage.tsx:62-69`): con 0 o >1 filas devuelve error y `ofLink` queda null sin avisar. Layout: KPIs `grid-cols-2 md:grid-cols-4`; cuerpo `grid-cols-1 lg:grid-cols-3`. **No existe**: modo edición (pese al `?edit=true`), borrado, importación de extracto, exportación, historial de saldos ni gráfico.

### D.3 Movimientos `/app/finanzas/bancos/cuentas/[id]/movimientos` — `components/finanzas/bancos/cuentas/MovimientosPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Skeleton de cabecera + `h-96` | Carga | `isLoading` | MovimientosPage.tsx:128-141 |
| 2 | botón | (icono ArrowLeft) | `Link` al detalle de la cuenta | Siempre | MovimientosPage.tsx:150-154 |
| 3 | texto | «Movimientos Bancarios» (ArrowRightLeft en caja azul) | H1 | Siempre | MovimientosPage.tsx:159-161 |
| 4 | texto | «{account.name} • {bank_name}» | Subtítulo | Siempre | MovimientosPage.tsx:162-164 |
| 5 | botón | «Actualizar» (outline sm, RefreshCw) | `loadData()` | Siempre | MovimientosPage.tsx:168-177 |
| 6 | botón | «Importar CSV» (outline sm, Upload) | **Nada: no tiene `onClick`** | Siempre | MovimientosPage.tsx:178-181 |
| 7 | botón | «Exportar» (outline sm, Download) | **Nada: no tiene `onClick`** | Siempre | MovimientosPage.tsx:182-185 |
| 8 | botón | «Nuevo Movimiento» (azul, Plus) | Abre el diálogo | Siempre | MovimientosPage.tsx:187-192 |
| 9 | diálogo | «Nuevo Movimiento» · «Registrar un movimiento manual en la cuenta» | Alta manual | Tras #8 | MovimientosPage.tsx:193-199 |
| 10 | campo | «Tipo de Movimiento» → Select «Ingreso (Crédito)» / «Egreso (Débito)» | `credit` por defecto | En el diálogo | MovimientosPage.tsx:201-217 |
| 11 | campo | «Descripción *» (placeholder «Descripción del movimiento») | Obligatorio | En el diálogo | MovimientosPage.tsx:218-226 |
| 12 | campo | «Monto *» (placeholder «0.00», `type=number step=0.01`) | Debe ser > 0 | En el diálogo | MovimientosPage.tsx:227-237 |
| 13 | campo | «Referencia» (placeholder «Número de referencia (opcional)») | Opcional | En el diálogo | MovimientosPage.tsx:238-246 |
| 14 | botón | «Cancelar» (outline) | Cierra **sin limpiar el formulario** | En el diálogo | MovimientosPage.tsx:249-251 |
| 15 | botón | «Registrar» / «Guardando...» (azul) | Crea la transacción y recalcula el saldo | En el diálogo | MovimientosPage.tsx:252-258 |
| 16 | toast | «La descripción es requerida» / «Ingresa un monto válido» | Validación cliente | — | MovimientosPage.tsx:78 · 82 |
| 17 | toast | «Movimiento registrado exitosamente» / «Error al registrar el movimiento» | Resultado | — | MovimientosPage.tsx:96 · 102 |
| 18 | toast | «Cuenta bancaria no encontrada» / «Error al cargar los movimientos» | Carga | — | MovimientosPage.tsx:51 · 60 |
| 19 | stat | «Saldo Actual» (texto `3xl`, verde/rojo) | Con moneda | Siempre | MovimientosPage.tsx:269-278 |
| 20 | stat | «Total Movimientos» | `transactions.length` — **conteo de lo cargado, no del total en BD** | Siempre | MovimientosPage.tsx:279-282 |
| 21 | campo | Placeholder «Buscar por descripción o referencia...» (Search) | Filtra **en cliente** | Siempre | MovimientosPage.tsx:291-299 |
| 22 | campo | Select «Estado» (Filter): «Todos» / «Pendientes» / «Conciliados» | Filtra en cliente por `status` | Siempre | MovimientosPage.tsx:300-310 |
| 23 | texto | «Movimientos ({n})» | Contador de resultados | Siempre | MovimientosPage.tsx:318-320 |
| 24 | estado | «No hay movimientos» + «No se encontraron movimientos con los filtros aplicados» / «Aún no hay movimientos registrados en esta cuenta» | Vacío. **Sin botón de limpiar filtros** | Lista vacía | MovimientosPage.tsx:323-334 |
| 25 | texto | {descripción} / «Sin descripción»; DollarSign en círculo verde/rojo | Fila | Por fila | MovimientosPage.tsx:343-357 |
| 26 | texto | {fecha con hora} · «•» · «Ref: {reference}» (Calendar) | Metadatos | Por fila | MovimientosPage.tsx:358-367 |
| 27 | badge | «Conciliado» (borde verde) / «Pendiente» (borde amarillo) | `status==='matched'`; **cualquier otro valor cae en «Pendiente»** | Por fila | MovimientosPage.tsx:371-378 |
| 28 | cálculo | «+{importe}» / «-{importe}» | Sin moneda | Por fila | MovimientosPage.tsx:379-386 |

Datos: `bank_transactions` por `organization_id` + `bank_account_id`, orden `trans_date desc`, **sin `limit`** (`BancosService.ts:225-269`): se traen todas y se filtra en memoria. El alta son dos escrituras no transaccionales — `INSERT` con `status:'pending'` y luego `SELECT balance` + `UPDATE bank_accounts.balance` (`BancosService.ts:271-336`), con carrera si dos usuarios registran a la vez. Lista de tarjetas apiladas, no `<Table>`. **No existe**: paginación, orden configurable, filtro por fechas o importe, edición/borrado, detalle, adjuntos ni importación/exportación reales.

### D.4 Nueva cuenta `/app/finanzas/bancos/cuentas/nuevo` — `components/finanzas/bancos/cuentas/NuevaCuentaForm.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft) | `Link href="/app/finanzas/bancos"` | Siempre | NuevaCuentaForm.tsx:104-108 |
| 2 | texto | «Nueva Cuenta Bancaria» (Building2 en caja azul) | H1 | Siempre | NuevaCuentaForm.tsx:113-115 |
| 3 | texto | «Finanzas / Bancos / Nueva Cuenta» | Migaja estática | Siempre | NuevaCuentaForm.tsx:116-118 |
| 4 | texto | «Información de la Cuenta» + «Ingresa los datos de la nueva cuenta bancaria» | Cabecera de la Card | Siempre | NuevaCuentaForm.tsx:125-128 |
| 5 | campo | «Nombre de la Cuenta *» (placeholder «Ej: Cuenta Principal Bancolombia») | Obligatorio | Siempre | NuevaCuentaForm.tsx:133-144 |
| 6 | campo | «Banco *» (Select, placeholder «Seleccionar banco») | Obligatorio | Siempre | NuevaCuentaForm.tsx:147-166 |
| 7 | menú | 14 opciones de bancos colombianos + «Otro» | **Catálogo cableado en el archivo**, no sale de BD; «Otro» se guarda literalmente como «Otro» | Select abierto | NuevaCuentaForm.tsx:22-37, 159-163 |
| 8 | campo | «Número de Cuenta» (placeholder «Ej: 1234567890») | Opcional, texto libre, sin validación de formato | Siempre | NuevaCuentaForm.tsx:169-180 |
| 9 | campo | «Tipo de Cuenta» (Select, placeholder «Seleccionar tipo») | `checking` por defecto | Siempre | NuevaCuentaForm.tsx:184-203 |
| 10 | menú | «Cuenta Corriente» · «Cuenta de Ahorros» · «Línea de Crédito» · «Cuenta de Inversión» | **`investment` no tiene etiqueta en el resto de pantallas** | Select abierto | NuevaCuentaForm.tsx:15-20, 196-199 |
| 11 | campo | «Moneda» (Select, opciones «{code} - {name}») | «COP» por defecto | Siempre | NuevaCuentaForm.tsx:205-224 |
| 12 | campo | «Saldo Inicial» (placeholder «0.00») + ayuda «Este será el saldo de apertura de la cuenta» | Alimenta a la vez `balance` e `initial_balance` | Siempre | NuevaCuentaForm.tsx:228-244 |
| 13 | botón | «Cancelar» (outline) | Vuelve al listado, sin confirmar descarte | Siempre | NuevaCuentaForm.tsx:248-255 |
| 14 | botón | «Crear Cuenta» / «Guardando...» (azul, Save) | `INSERT bank_accounts` y redirección | Siempre | NuevaCuentaForm.tsx:256-263 |
| 15 | toast | «El nombre de la cuenta es requerido» / «Selecciona un banco» | Validación | — | NuevaCuentaForm.tsx:69 · 74 |
| 16 | toast | «Cuenta bancaria creada exitosamente» | Éxito | — | NuevaCuentaForm.tsx:89 |
| 17 | toast | «Error al crear la cuenta bancaria» | Fallo genérico — **también cubre «no hay sucursal activa»** | — | NuevaCuentaForm.tsx:93 |

El Select de moneda se llena con `organization_currencies` → `currencies` y cae a `[{COP, Peso Colombiano, $}]` si la organización no tiene monedas (`BancosService.ts:622-650`). El alta exige `branch_id`: `getBranchId()` lanza «Branch ID no disponible» si no hay sucursal en `localStorage` y ese error llega como el toast genérico #17 (`BancosService.ts:94-98, 157-187`). Layout `max-w-2xl mx-auto`. **No existe**: campo de sucursal, notas, vinculación con el plan de cuentas, IBAN/SWIFT, toggle de activa ni validación de duplicado.

### D.5 Conciliación bancaria (lista) `/app/finanzas/conciliacion-bancaria` — `components/finanzas/conciliacion-bancaria/ConciliacionPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Skeleton cabecera + 4 KPIs + `h-96` | Carga | `isLoading` | ConciliacionPage.tsx:88-104 |
| 2 | botón | (icono ArrowLeft) | `Link href="/app/finanzas"` — **al índice de Finanzas, no a Bancos** | Siempre | ConciliacionPage.tsx:111-115 |
| 3 | texto | «Conciliación Bancaria» / «Finanzas / Conciliación Bancaria» | H1 + migaja | Siempre | ConciliacionPage.tsx:120-125 |
| 4 | botón | «Actualizar» (outline sm, RefreshCw) | `loadData()` | Siempre | ConciliacionPage.tsx:129-138 |
| 5 | botón | «Nueva Conciliación» (azul, Plus) | `.../conciliacion-bancaria/nuevo` | Siempre | ConciliacionPage.tsx:139-145 |
| 6 | stat | «Total» (FileText azul) | `stats.total` | Si hay `stats` | ConciliacionPage.tsx:152-162 |
| 7 | stat | «Borradores» (Clock gris) | `stats.draft` | Si hay `stats` | ConciliacionPage.tsx:164-174 |
| 8 | stat | «En Progreso» (ArrowRightLeft azul) | `stats.in_progress` | Si hay `stats` | ConciliacionPage.tsx:176-186 |
| 9 | stat | «Cerradas» (CheckCircle verde) | `stats.closed` | Si hay `stats` | ConciliacionPage.tsx:188-198 |
| 10 | campo | Select «Cuenta bancaria»: «Todas las cuentas» + «{name} - {bank_name}» | Filtra **en cliente** | Siempre | ConciliacionPage.tsx:206-218 |
| 11 | campo | Select «Estado»: «Todos los estados» / «Borrador» / «En Progreso» / «Cerrada» | Filtra en cliente | Siempre | ConciliacionPage.tsx:220-230 |
| 12 | texto | «Conciliaciones ({n})» + «Lista de conciliaciones bancarias» | Cabecera | Siempre | ConciliacionPage.tsx:238-243 |
| 13 | estado | «No hay conciliaciones» + «Crea una nueva conciliación para comenzar a conciliar tus movimientos bancarios.» + botón «Nueva Conciliación» | Vacío con CTA | Lista vacía | ConciliacionPage.tsx:246-262 |
| 14 | texto | {nombre de la cuenta} / «Cuenta» — `CopyableId` | Click abre el detalle; el icono copia el UUID | Por fila | ConciliacionPage.tsx:277-282 |
| 15 | texto | «{dd mmm yyyy} - {dd mmm yyyy}» (Calendar) | Periodo | Por fila | ConciliacionPage.tsx:284-287 |
| 16 | stat | «Diferencia» + importe | Verde si 0, rojo si no. **Siempre 0 en la práctica** (nadie recalcula el campo) | Por fila | ConciliacionPage.tsx:291-300 |
| 17 | badge | «Borrador» (gris) / «En Progreso» (azul) / «Cerrada» (verde) / {valor crudo} | `getStatusBadge` | Por fila | ConciliacionPage.tsx:69-80, 301 |
| 18 | botón | (icono Eye, ghost) | **Decorativo: sin `onClick`**; la fila entera es clicable | Por fila | ConciliacionPage.tsx:302-304 |
| 19 | botón | Fila completa (`cursor-pointer`) | `/app/finanzas/conciliacion-bancaria/{id}` | Por fila | ConciliacionPage.tsx:266-269 |
| 20 | toast | «Error al cargar las conciliaciones» | Fallo | — | ConciliacionPage.tsx:45 |

Datos: `bank_reconciliations` con join embebido a `bank_accounts`, orden `period_end desc` (`ConciliacionService.ts:19-67`); con sucursal activa se resuelven primero los `bank_account_id` y se aplica un `.in(...)`. Filas como tarjetas, no `<Table>`. **No existe**: buscador, filtro por fechas, paginación, borrado o reapertura, exportación, menú «…» por fila, ni `BranchBadge` (a diferencia de D.1, aunque sí filtre por sucursal).

### D.6 Nueva conciliación `/app/finanzas/conciliacion-bancaria/nuevo` — `components/finanzas/conciliacion-bancaria/NuevaConciliacionForm.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft) | `Link` al listado | Siempre | NuevaConciliacionForm.tsx:90-94 |
| 2 | texto | «Nueva Conciliación Bancaria» / «Finanzas / Conciliación Bancaria / Nueva» | H1 + migaja | Siempre | NuevaConciliacionForm.tsx:99-104 |
| 3 | texto | «Datos de la Conciliación» + «Configura el período y cuenta para la conciliación» | Cabecera | Siempre | NuevaConciliacionForm.tsx:111-114 |
| 4 | campo | «Cuenta Bancaria *» (Select, placeholder «Seleccionar cuenta») | Obligatorio; **solo cuentas `is_active`**; sin «Todas» | Siempre | NuevaConciliacionForm.tsx:119-136 |
| 5 | estado | «Saldo Actual en Sistema» + importe azul + «Este será el saldo de apertura de la conciliación» | Panel informativo | Tras elegir cuenta | NuevaConciliacionForm.tsx:139-154 |
| 6 | campo | «Fecha Inicio *» (Calendar, `type=date`) | Obligatorio | Siempre | NuevaConciliacionForm.tsx:158-169 |
| 7 | campo | «Fecha Fin *» (Calendar, `type=date`) | Debe ser ≥ inicio | Siempre | NuevaConciliacionForm.tsx:170-181 |
| 8 | campo | «Saldo según Extracto Bancario» (placeholder «Ingresa el saldo del extracto bancario») + ayuda «Este es el saldo que aparece en tu extracto bancario para el período seleccionado» | Opcional → `null` si vacío | Siempre | NuevaConciliacionForm.tsx:185-200 |
| 9 | botón | «Cancelar» (outline) | Vuelve sin confirmar | Siempre | NuevaConciliacionForm.tsx:204-211 |
| 10 | botón | «Crear Conciliación» / «Creando...» (azul, Save) | `INSERT` y `router.push` al detalle | Siempre | NuevaConciliacionForm.tsx:212-219 |
| 11 | toast | «Selecciona una cuenta bancaria» / «Selecciona el período de conciliación» / «La fecha de inicio debe ser anterior a la fecha de fin» | Validación | — | NuevaConciliacionForm.tsx:53 · 57 · 61 |
| 12 | toast | «Conciliación creada exitosamente» / «Error al crear la conciliación» / «Error al cargar las cuentas bancarias» | Resultados | — | NuevaConciliacionForm.tsx:75 · 79 · 39 |

El Select se puebla **sin filtro de sucursal** (`NuevaConciliacionForm.tsx:35`): aquí se ven cuentas de todas las sucursales, al contrario que en el listado. El insert fija `opening_balance` = saldo actual, `closing_balance = opening_balance`, `difference = 0`, `status='draft'` (`BancosService.ts:405-439`). **No existe**: carga del extracto (CSV/OFX), validación de solapamiento de periodos, ni preselección de cuenta al llegar desde D.2 #26.

### D.7 Detalle de conciliación `/app/finanzas/conciliacion-bancaria/[id]` — `ConciliacionDetailPage.tsx` + `AIMatchingPanel.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Skeleton `h-12` + 4 KPIs + `h-96` | Carga | `isLoading` | ConciliacionDetailPage.tsx:150-160 |
| 2 | toast | «Conciliación no encontrada» | Error + redirección | Id inexistente | ConciliacionDetailPage.tsx:42-43 |
| 3 | botón | (icono ArrowLeft) | `Link` al listado | Siempre | ConciliacionDetailPage.tsx:172-176 |
| 4 | texto | «Conciliación Bancaria» / «{cuenta} • {dd mmm yyyy} - {dd mmm yyyy}» | H1 + periodo | Siempre | ConciliacionDetailPage.tsx:181-186 |
| 5 | badge | «Borrador» / «En Progreso» / «Cerrada» | `getStatusBadge` **duplicado del de D.5** | Siempre | ConciliacionDetailPage.tsx:137-148, 190 |
| 6 | botón | «Actualizar» (outline sm, RefreshCw) | `loadData()` | Siempre | ConciliacionDetailPage.tsx:191-200 |
| 7 | botón | «Cerrar Conciliación» (**verde**, Lock) | Abre el diálogo de cierre | Si `status !== 'closed'` | ConciliacionDetailPage.tsx:201-209 |
| 8 | stat | «Saldo Apertura» (DollarSign azul) | `opening_balance` | Siempre | ConciliacionDetailPage.tsx:215-227 |
| 9 | stat | «Saldo Extracto» (DollarSign morado) | `statement_balance ?? 0` | Siempre | ConciliacionDetailPage.tsx:229-241 |
| 10 | stat | «Conciliado» (CheckCircle verde) | Suma de items con `is_matched` | Siempre | ConciliacionDetailPage.tsx:164, 243-255 |
| 11 | cálculo | «Diferencia» + CheckCircle verde (=0) o XCircle rojo (≠0) | `statement_balance − (opening + conciliado)`, **en cliente, nunca se guarda** | Siempre | ConciliacionDetailPage.tsx:165, 257-269 |
| 12 | pestaña | «Conciliacion manual» (**sin tilde**) | Dos paneles | Por defecto | ConciliacionDetailPage.tsx:275 |
| 13 | pestaña | «Sugerencias IA» | Monta `AIMatchingPanel` | Siempre | ConciliacionDetailPage.tsx:276, 402-407 |
| 14 | texto | «Movimientos Bancarios Pendientes ({n})» + «Transacciones sin conciliar en el período» | Panel A | Pestaña manual | ConciliacionDetailPage.tsx:284-289 |
| 15 | estado | «Todas las transacciones están conciliadas» (CheckCircle verde) | Vacío del panel A | Sin pendientes | ConciliacionDetailPage.tsx:292-298 |
| 16 | texto | {descripción} / «Sin descripción» + fecha + «+/-{importe}» | Fila pendiente; lista con `max-h-96 overflow-y-auto` | Por transacción | ConciliacionDetailPage.tsx:300-322 |
| 17 | botón | (icono Link2, outline sm) | `matchTransaccion(rec, txId, 'manual')` | Por fila, si no está cerrada | ConciliacionDetailPage.tsx:323-332 |
| 18 | texto | «Items Conciliados ({n})» + «Transacciones ya conciliadas» | Panel B | Pestaña manual | ConciliacionDetailPage.tsx:344-349 |
| 19 | estado | «Aún no hay items conciliados» | Vacío del panel B | Sin items | ConciliacionDetailPage.tsx:352-358 |
| 20 | texto | «Pago» / «Asiento» / «Manual» + fecha del match / «Sin fecha» + importe verde | Fila conciliada (fondo y borde verdes) | Por item | ConciliacionDetailPage.tsx:361-380 |
| 21 | botón | (icono XCircle, ghost rojo) | Borra el item y devuelve la tx a `pending`. **Sin confirmación** | Por item, si no está cerrada | ConciliacionDetailPage.tsx:381-390 |
| 22 | diálogo | «Cerrar Conciliación» · «¿Estás seguro de que deseas cerrar esta conciliación? Esta acción no se puede deshacer.» | Confirmación | Tras #7 | ConciliacionDetailPage.tsx:411-418 |
| 23 | texto | «**Diferencia actual:** {importe}» sobre panel amarillo | Recordatorio | En el diálogo | ConciliacionDetailPage.tsx:419-422 |
| 24 | texto | «⚠️ Existe una diferencia. Se recomienda resolverla antes de cerrar.» | Aviso — **solo recomienda, no bloquea** | Diferencia ≠ 0 | ConciliacionDetailPage.tsx:423-427 |
| 25 | botón | «Cancelar» / «Cerrar Conciliación» (verde, Lock) | `UPDATE status='closed', closed_at=now()` | En el diálogo | ConciliacionDetailPage.tsx:430-440 |
| 26 | toast | «Transacción conciliada» / «Error al conciliar la transacción» | Match manual | — | ConciliacionDetailPage.tsx:83 · 87 |
| 27 | toast | «Conciliación deshecha» / «Error al deshacer la conciliación» | Unmatch | — | ConciliacionDetailPage.tsx:96 · 100 |
| 28 | toast | «Conciliación cerrada exitosamente» / «Error al cerrar la conciliación» | Cierre | — | ConciliacionDetailPage.tsx:108 · 113 |
| 29 | estado | «Sugerencias IA» + 3 skeletons `h-28` | Carga del panel IA (Sparkles morado) | — | AIMatchingPanel.tsx:187-203 |
| 30 | estado | «Sugerencias IA» + mensaje + botón «Reintentar» | Error del panel IA | Fallo de `/suggest-matches` | AIMatchingPanel.tsx:205-226 |
| 31 | texto | «Sugerencias IA» + «{n} sugerencia(s) encontrada(s)» | Cabecera | Pestaña IA | AIMatchingPanel.tsx:233-239 |
| 32 | botón | «Actualizar» (outline sm, RefreshCw) | `loadSuggestions()` | Pestaña IA | AIMatchingPanel.tsx:242-250 |
| 33 | botón | «Auto-conciliar alta confianza» / «Conciliando...» (**morado**, Zap) | `POST /suggest-matches`; deshabilitado sin sugerencias | Pestaña IA | AIMatchingPanel.tsx:251-259 |
| 34 | estado | «No hay sugerencias pendientes» (Check verde) | Vacío | — | AIMatchingPanel.tsx:264-270 |
| 35 | badge | «{score} - Alta» (verde, >80) / «{score} - Media» (amarillo, 50-80) / «{score} - Baja» (rojo, <50) | **Umbrales cableados** | Por sugerencia | AIMatchingPanel.tsx:175-183, 280 |
| 36 | botón | «Aceptar» (verde sm, Check) | `matchTransaccion(..., 'payment', candidateId)` y refresca | Por sugerencia | AIMatchingPanel.tsx:282-290 |
| 37 | botón | «Rechazar» (outline sm, X) | **Solo la quita de la lista local**: reaparece al refrescar | Por sugerencia | AIMatchingPanel.tsx:131-134, 291-300 |
| 38 | texto | «Transaccion bancaria» (**sin tilde**) + descripción / «Sin descripcion» + fecha + importe | Panel izquierdo | Por sugerencia | AIMatchingPanel.tsx:306-327 |
| 39 | texto | «Pago candidato» + referencia / «Sin referencia» + fecha + importe verde | Panel derecho | Por sugerencia | AIMatchingPanel.tsx:329-346 |
| 40 | cálculo | «Monto» {v}/40 · «Fecha» {v}/30 · «Ref.» {v}/20 · «Desc.» {v}/10 | 4 barras moradas con el desglose del score (máximos cableados) | Por sugerencia | AIMatchingPanel.tsx:350-355, 368-398 |
| 41 | toast | «Match aceptado y conciliado» / «Error al aceptar el match» / «Sugerencia rechazada» / «{n} matches auto-conciliados» | Resultados del panel IA | — | AIMatchingPanel.tsx:118 · 124 · 133 · 153 |

Datos: `bank_reconciliations` con join a `bank_accounts` (`BancosService.ts:375-403` — **este `select` no filtra por `organization_id`**); items de `bank_reconciliation_items`; pendientes = `bank_transactions` del periodo con `.or('status.is.null,status.neq.matched')`. Las sugerencias vienen de `/api/integrations/open-finance/suggest-matches`. El match escribe en dos pasos no transaccionales (`BancosService.ts:484-527`). **No existe**: reabrir una conciliación cerrada (el icono `Unlock` está importado sin usar), notas, adjunto del extracto, exportación del acta, match parcial o N:1, ni paginación. `obtenerPagosCandidatos` se ejecuta en cada carga y su resultado **nunca se pinta**.

### D.8 Tesorería consolidada `/app/finanzas/bancos/tesoreria` — `components/finanzas/bancos/TesoreriaPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft) | `Link href="/app/finanzas/bancos"` | Siempre | TesoreriaPage.tsx:213-221 |
| 2 | texto | «Tesoreria Consolidada» (**sin tilde**) / «Finanzas / Bancos / Tesoreria» | H1 + migaja (Wallet en caja azul) | Siempre | TesoreriaPage.tsx:226-231 |
| 3 | botón | «Actualizar» (outline, RefreshCw) | Relanza las 4 llamadas | Siempre | TesoreriaPage.tsx:235-245 |
| 4 | estado | 3 skeletons `h-28` | Carga de KPIs | `isLoading` | TesoreriaPage.tsx:249-254 |
| 5 | stat | «Total COP» + «Saldo consolidado en pesos» (Wallet azul) | `totalByCurrency.COP ?? 0` | Cargado | TesoreriaPage.tsx:258-273 |
| 6 | stat | «Total USD» + «Saldo consolidado en dolares» (**sin tilde**) | **Solo COP y USD están cableados: cualquier otra moneda no se muestra** | Cargado | TesoreriaPage.tsx:276-291 |
| 7 | stat | «Flujo Neto 90 dias» + «Entradas: {x} \| Salidas: {y}» | `projection.netFlow`, forzado a COP | Cargado | TesoreriaPage.tsx:294-320 |
| 8 | texto | «Posicion Consolidada por Cuenta» (**sin tilde**, Building2) | Título de la Card | Siempre | TesoreriaPage.tsx:327-330 |
| 9 | estado | 3 skeletons `h-12` / «No hay cuentas bancarias activas para consolidar» | Carga / vacío | — | TesoreriaPage.tsx:333-338, 401-405 |
| 10 | columna | «Banco» · «Cuenta» · «Moneda» · «Saldo Local» · «Saldo Real» · «Diferencia» · «Vinculada» | Tabla de **7 columnas** | Con datos | TesoreriaPage.tsx:343-349 |
| 11 | badge | «SI» (verde) / «NO» (secondary) (**sin tilde**) | Columna «Vinculada» | Por fila | TesoreriaPage.tsx:388-396 |
| 12 | cálculo | «Diferencia» gris si null, naranja si \|dif\| > 1, verde si no | Umbral fijo de 1 | Por fila | TesoreriaPage.tsx:375-387 |
| 13 | texto | «Proyeccion de Flujo de Caja (90 dias)» (**sin tildes**) | Título de la Card | Siempre | TesoreriaPage.tsx:412-415 |
| 14 | estado | Skeleton `h-64` / «No hay movimientos proyectados en los proximos 90 dias» | Carga / vacío | — | TesoreriaPage.tsx:418-419, 498-502 |
| 15 | cálculo | Gráfico de barras `h-48` en `div` (sin SVG), hasta **30 días** con movimiento, verde/rojo escalado al máximo | Filtra `inflow>0 \|\| outflow>0` | Con datos | TesoreriaPage.tsx:198-206, 423-450 |
| 16 | tooltip | «{fecha}\nEntradas: {x}\nSalidas: {y}\nSaldo: {z}» | Atributo `title` **nativo del navegador** | Hover | TesoreriaPage.tsx:433 |
| 17 | badge | «Entradas» (cuadro verde) · «Salidas» (cuadro rojo) | Leyenda | Con datos | TesoreriaPage.tsx:453-462 |
| 18 | stat | «Total Entradas» · «Total Salidas» · «Flujo Neto» | 3 cifras bajo el gráfico, siempre en COP | Con datos | TesoreriaPage.tsx:465-496 |
| 19 | texto | «Alertas de Tesoreria» (**sin tilde**) + badge naranja con el número | Título (AlertTriangle) | Siempre | TesoreriaPage.tsx:509-517 |
| 20 | badge | «Saldo negativo» / «CxP vencida» / «CxP por vencer» / «Riesgo de concentracion» / «Discrepancia de saldo» + « - » + «Alta»/«Media»/«Baja» | Título del `Alert`, borde rojo/naranja/amarillo | Por alerta | TesoreriaPage.tsx:94-122, 531-542 |
| 21 | texto | {alert.message} | **Solo informativa: sin botón de acción ni descarte** | Por alerta | TesoreriaPage.tsx:539-541 |
| 22 | estado | 2 skeletons `h-16` / «No hay alertas de tesoreria activas» | Carga / vacío | — | TesoreriaPage.tsx:520-525, 546-550 |
| 23 | texto | «Concentracion de Pagos por Proveedor (Top 10)» (**sin tilde**) | Título de la Card | Siempre | TesoreriaPage.tsx:557-560 |
| 24 | columna | «Proveedor» · «Total Pagos» · «N. Pagos» · «Promedio» · «% Concentracion» | Tabla de 5 columnas; la última con `Progress` de 24 px, naranja si >30 % | Con datos | TesoreriaPage.tsx:573-611 |
| 25 | estado | «No hay datos de concentracion de pagos en el periodo» | Vacío | — | TesoreriaPage.tsx:616-620 |
| 26 | toast | «Organizacion no disponible» / «Error al cargar los datos de tesoreria» / «Datos de tesoreria actualizados» | — | — | TesoreriaPage.tsx:136 · 176 · 191 |

Cuatro endpoints en paralelo con `?organizationId=` tomado de `localStorage`: `/treasury`, `/treasury/projection?days=90`, `/treasury/alerts` y `/treasury/concentration` (`TesoreriaPage.tsx:148-161`). El rango de concentración («1 de enero → hoy») se deriva con **`toISOString().split('T')[0]`**, patrón prohibido por `CLAUDE.md`. Las dos `<Table>` (7 y 5 columnas) **no tienen contenedor de scroll horizontal**. **No existe**: selector de rango ni de horizonte, filtro por sucursal o moneda, conversión a moneda base, exportación, ni acción sobre una alerta.

### D.9 Anomalías `/app/finanzas/bancos/anomalias` — `components/finanzas/bancos/AnomalyPanel.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft) | `Link href="/app/finanzas/bancos"` | Siempre | AnomalyPanel.tsx:248-256 |
| 2 | texto | «Deteccion de Anomalias» (**sin tildes**) / «Finanzas / Bancos / Anomalias» | H1 + migaja (Shield naranja) | Siempre | AnomalyPanel.tsx:261-266 |
| 3 | botón | «Actualizar» (outline, RefreshCw) | Relanza `/anomalies` | Siempre | AnomalyPanel.tsx:270-280 |
| 4 | estado | 4 skeletons `h-28` | Carga de KPIs | `isLoading` | AnomalyPanel.tsx:284-289 |
| 5 | stat | «Total Alertas» (AlertTriangle naranja) | `summary.totalAlerts ?? 0` | Cargado | AnomalyPanel.tsx:292-297 |
| 6 | stat | «Alta Severidad» (AlertTriangle roja) | `summary.highSeverity ?? 0` | Cargado | AnomalyPanel.tsx:298-303 |
| 7 | stat | «Duplicados» (Copy azul) | `summary.duplicates.length ?? 0` | Cargado | AnomalyPanel.tsx:304-309 |
| 8 | stat | «Discrepancias» (DollarSign morado) | `summary.balanceDiscrepancies.length ?? 0` | Cargado | AnomalyPanel.tsx:310-315 |
| 9 | estado | «Error» + mensaje de la API o «Error de conexion al cargar anomalias» | `Alert` rojo | `error && !isLoading` | AnomalyPanel.tsx:154, 158, 320-326 |
| 10 | pestaña | «Duplicados» (Copy) + badge azul · «Montos» (DollarSign) + badge naranja · «Patrones» (Clock) + badge amarillo · «Saldos» (Shield) + badge morado | 4 pestañas en `grid-cols-4` | Siempre | AnomalyPanel.tsx:338-373 |
| 11 | texto | «{n} transacciones duplicadas» + «**Monto:**», «**Fecha:**», «**Descripcion:**» (**sin tilde**), «**IDs:**» | Tarjeta `Alert` por grupo | Tab Duplicados | AnomalyPanel.tsx:379-409 |
| 12 | badge | «Alta» (rojo) / «Media» (amarillo) / «Baja» (gris) | `SeverityBadge` | En cada alerta | AnomalyPanel.tsx:89-122, 391 |
| 13 | botón | «Resolver» (outline sm, CheckCircle) | Abre el diálogo de resolución | En cada alerta de los 4 tabs | AnomalyPanel.tsx:411-419, 470-478, 523-531, 590-598 |
| 14 | estado | «No se detectaron transacciones duplicadas» / «No se detectaron montos inusuales» / «No se detectaron patrones sospechosos» / «No se detectaron discrepancias de saldo» | Vacíos de los 4 tabs | — | AnomalyPanel.tsx:423-428, 483-486, 536-539, 606-611 |
| 15 | texto | «Monto inusual» / «Horario inusual» / «Fragmentacion» / «Monto alto en fin de semana» + descripción + «Esperado: {x}» / «Actual: {y}» + «Tx ID: {n}» | Tabs Montos y Patrones | Con datos | AnomalyPanel.tsx:111-116, 434-467, 493-521 |
| 16 | columna | «Cuenta» · «Saldo Local» · «Saldo Calculado» · «Saldo Real» · «Diferencia» · «Severidad» · «Accion» (**sin tilde**) | Tabla de **7 columnas** | Tab Saldos | AnomalyPanel.tsx:551-557 |
| 17 | diálogo | «Resolver Anomalia» · «Ingrese una descripcion de como se resolvio la anomalia. Esta accion quedara registrada en el log del sistema.» (**sin tildes**) | Confirmación | Tras #13 | AnomalyPanel.tsx:617-625 |
| 18 | campo | `Textarea` 4 filas · placeholder «Ej: Falso positivo, las transacciones corresponden a pagos diferentes...» | Obligatorio | En el diálogo | AnomalyPanel.tsx:627-633 |
| 19 | botón | «Cancelar» / «Confirmar Resolucion» (**sin tilde**, spinner) | `POST /anomalies/resolve` — **el servicio solo hace `console.log`: no persiste nada** | En el diálogo | AnomalyPanel.tsx:636-653 |
| 20 | toast | «Organizacion no disponible» / «Anomalias actualizadas» / «Ingrese una resolucion» / «Anomalia marcada como resuelta» / «Error al resolver anomalia» / «Error de conexion al resolver» | **Todos sin tildes** | — | AnomalyPanel.tsx:139 · 173 · 186 · 206 · 211 · 215 |

Una sola llamada: `GET /api/integrations/open-finance/anomalies?organizationId={id}` con el id de `localStorage`. Todos los importes se fuerzan a COP. La tabla de Saldos no tiene scroll horizontal. **No existe**: filtro por cuenta, severidad o fecha; historial de resueltas; enlace de la alerta al movimiento (solo «Tx ID: {n}» como texto); ni recarga tras resolver.

### D.10 Open Finance (dashboard) `/app/finanzas/open-finance` — `app/app/finanzas/open-finance/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Open Finance» / «Finanzas / Open Finance / Dashboard» | H1 + migaja. **Sin botón de volver** | Siempre | `app/app/finanzas/open-finance/page.tsx:276-282` |
| 2 | badge | «Operativo» (success) / «No configurado» (destructive) | `health.isConfigured` | Tras cargar | open-finance/page.tsx:285-291 |
| 3 | texto | «Estado del servicio» (Activity) | Título de la Card | Siempre | open-finance/page.tsx:298-301 |
| 4 | estado | «Proveedor» + «Prometeo» / «Belvo» / {capitalizado} / «-» | CheckCircle verde o XCircle rojo | Cargado | open-finance/page.tsx:95-99, 312-326 |
| 5 | estado | «Variables de entorno» + «Configuradas» / «Faltan variables» | **El icono usa `isOperational`, no el propio cálculo** | Cargado | open-finance/page.tsx:329-343, 684-687 |
| 6 | estado | «Links activos» + número (LinkIcon) | `health.activeLinks` | Cargado | open-finance/page.tsx:346-356 |
| 7 | estado | «Ultima sincronizacion» (**sin tilde**) + fecha / «Nunca» | — | Cargado | open-finance/page.tsx:359-369 |
| 8 | estado | «Problemas detectados» + lista de errores | `Alert` destructivo | `health.errors.length > 0` | open-finance/page.tsx:374-386 |
| 9 | stat | «Links activos» (LinkIcon azul) | `open_finance_links` activos | Siempre | open-finance/page.tsx:393-411 |
| 10 | stat | «Cuentas vinculadas» (Building2 esmeralda) | `open_finance_accounts` activas | Siempre | open-finance/page.tsx:414-432 |
| 11 | stat | «Transacciones (30 dias)» (**sin tilde**, Database morado) | `open_finance_transactions` de 30 días | Siempre | open-finance/page.tsx:435-453 |
| 12 | stat | «Consentimientos activos» (Shield ámbar) | `/consents/stats` | Siempre | open-finance/page.tsx:456-474 |
| 13 | texto | «Acciones rapidas» (**sin tilde**) | Título de la Card | Siempre | open-finance/page.tsx:480-482 |
| 14 | botón | «Sincronizar ahora» / «Sincronizando...» (primario, RefreshCw) | `POST /open-finance/sync` | Siempre | open-finance/page.tsx:486-494 |
| 15 | botón | «Refrescar saldos» / «Refrescando...» (outline, RefreshCw) | `POST /open-finance/refresh-balances` | Siempre | open-finance/page.tsx:495-504 |
| 16 | botón | «Detectar anomalias» (**sin tilde**, outline) | `Link` a `/app/finanzas/bancos/anomalias` | Siempre | open-finance/page.tsx:505-510 |
| 17 | botón | Tarjeta «Gestion de consentimientos» + «Autorizaciones de acceso a datos financieros» (Shield azul) | `Link` a `/open-finance/consents` | Siempre | open-finance/page.tsx:522-541 |
| 18 | botón | Tarjeta «Tesoreria consolidada» + «Saldos y proyeccion de flujo de caja» (Wallet esmeralda) | `Link` a `/bancos/tesoreria` | Siempre | open-finance/page.tsx:544-563 |
| 19 | botón | Tarjeta «Deteccion de anomalias» + «Identificacion de movimientos inusuales» (AlertTriangle naranja) | `Link` a `/bancos/anomalias` | Siempre | open-finance/page.tsx:566-585 |
| 20 | texto | «Estado de configuracion» (**sin tilde**, Database) | Card inferior izquierda | Siempre | open-finance/page.tsx:594-597 |
| 21 | badge | {NOMBRE_DE_LA_VARIABLE} en `<code>` + «Configurado» / «Falta configurar» | Una fila por variable | Si hay `envVars` | open-finance/page.tsx:608-620 |
| 22 | estado | «No se pudo verificar la configuracion» (**sin tilde**) | Sin `envVars` | — | open-finance/page.tsx:622-626 |
| 23 | texto | «Ultima sincronizacion» + «Fecha de ultima sincronizacion global» | Card inferior derecha | Siempre | open-finance/page.tsx:633-650 |
| 24 | estado | «Hay {n} transacciones pendientes de importar al ERP.» | `Alert variant="warning"` | `pendingTransactions > 0` | open-finance/page.tsx:651-659 |
| 25 | botón | «Sincronizar ahora» (ancho completo) | **Duplicado de #14** | Siempre | open-finance/page.tsx:660-669 |
| 26 | toast | «Error al cargar el estado de Open Finance» / «Error al cargar el resumen…» / «Organizacion no disponible» / «Sincronizacion iniciada correctamente» / «Saldos refrescados correctamente» / «Error al sincronizar» / «Error al refrescar saldos» | — | — | open-finance/page.tsx:132 · 187 · 196 · 222 · 250 · 227 · 254 |

Mezcla dos orígenes: consultas **directas a Supabase desde el navegador** con `count:'exact', head:true` (`page.tsx:152-166`) y llamadas a `/api/integrations/open-finance/*`. El corte de 30 días usa **`toISOString().split('T')[0]`** (`page.tsx:141-143`). **No existe**: listado ni alta de links bancarios (no hay «Conectar banco» pese a existir `/api/integrations/open-finance/links`), tabla de cuentas vinculadas, historial de sincronizaciones, botón de volver, ni entrada en el menú lateral.

### D.11 Consentimientos `/app/finanzas/open-finance/consents` — `app/app/finanzas/open-finance/consents/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Consentimientos Open Finance» / «Gestion de autorizaciones de acceso a datos financieros» (**sin tilde**) | H1 + subtítulo. **Sin volver ni migaja** | Siempre | consents/page.tsx:229-239 |
| 2 | estado | «Tus derechos sobre los datos financieros» + párrafo sobre el Decreto 0368 de 2026, los 90 días de duración máxima y el derecho a revocar | `Alert variant="info"` | Siempre | consents/page.tsx:242-251 |
| 3 | stat | «Total» (Shield azul) · «Activos» (ShieldCheck verde) · «Revocados» (XCircle rojo) · «Expirados» (Clock gris) | **Sin esqueleto: muestran 0 mientras cargan** | Siempre | consents/page.tsx:255-298 |
| 4 | texto | «Lista de consentimientos» | Título de la Card | Siempre | consents/page.tsx:304-306 |
| 5 | campo | Select «Estado»: «Todos los estados» / «Activos» / «Revocados» / «Expirados» | Filtra **en servidor** (`?status=`) | Siempre | consents/page.tsx:311-321 |
| 6 | campo | Select «Tipo»: «Todos los tipos» / «Acceso a datos» / «Iniciacion de pago» / «Validacion de cuenta» (**sin tildes**) | Filtra en servidor (`?consentType=`) | Siempre | consents/page.tsx:322-332 |
| 7 | columna | «Tipo» · «Proposito» (**sin tilde**, truncado `max-w-xs` con `title`) · «Estado» · «Autorizado» · «Expiracion» (**sin tilde**) · «Acciones» | Tabla de 6 columnas | Siempre | consents/page.tsx:339-344 |
| 8 | badge | «Activo» (success) / «Revocado» (destructive) / «Expirado» (secondary) | — | Por fila | consents/page.tsx:88-99, 369-373 |
| 9 | badge | Icono Clock ámbar junto a la fecha | Si faltan ≤ 7 días para expirar (`RENEW_THRESHOLD_DAYS`) | Por fila | consents/page.tsx:102, 119-125, 375-382 |
| 10 | botón | «Renovar» (outline sm, RefreshCw) | `POST /consents/{id}/renew` | Solo si activo **y** faltan ≤ 7 días | consents/page.tsx:385-395 |
| 11 | botón | «Revocar» (destructive sm, XCircle) | Abre el diálogo | Solo si `status === 'active'` | consents/page.tsx:396-408 |
| 12 | estado | «Cargando consentimientos...» / «No hay consentimientos registrados» | Fila única `colSpan={6}`. **Sin CTA** | — | consents/page.tsx:348-359 |
| 13 | diálogo | «Revocar consentimiento» (ShieldAlert rojo) · «Estas a punto de revocar el consentimiento **{proposito}**. Esta accion interrumpira el acceso a los datos financieros asociados y no puede deshacerse.» | Confirmación | Tras #11 | consents/page.tsx:429-441 |
| 14 | campo | «Motivo de revocacion» (**sin tilde**) → `<textarea>` **nativo**, placeholder «Describe el motivo de la revocacion...» | Obligatorio | En el diálogo | consents/page.tsx:442-452 |
| 15 | botón | «Cancelar» / «Revocar consentimiento» / «Revocando...» (destructive) | `DELETE /consents/{id}` con `{reason}` | En el diálogo | consents/page.tsx:454-469 |
| 16 | toast | «Debe ingresar un motivo de revocacion» / «Consentimiento revocado correctamente» / «Consentimiento renovado por 90 dias mas» / «Error al revocar» / «Error al renovar» / «Error al cargar los consentimientos» | **Sin tildes** | — | consents/page.tsx:178 · 192 · 216 · 198 · 220 · 153 |

Todo vía API; a diferencia de D.10, aquí **no se envía `organizationId`**: lo resuelve el servidor. **No existe**: alta de consentimiento, detalle con `scope`/`ip_address`/`user_agent`/`granted_by` (están en el tipo y no se pintan), paginación, exportación del registro de auditoría, ni columna de institución (`consent.link.institution_name` se declara y no se usa).

### D.12 PayFac — Cuentas de dispersión `/app/finanzas/payfac/cuentas` — `app/app/finanzas/payfac/cuentas/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Cargando organizacion...» (spinner, `h-96`) | Espera de `useOrganization` | `orgLoading` | payfac/cuentas/page.tsx:278-287 |
| 2 | estado | «No hay organizacion activa» + «Selecciona una organizacion para gestionar tus cuentas.» (Inbox) | Bloqueo | `!orgId` | cuentas/page.tsx:290-302 |
| 3 | texto | «Cuentas de Dispersion» (**sin tilde**) / «Cuentas donde recibes tus dispersiones» | H1. **Sin volver ni migaja** | Siempre | cuentas/page.tsx:308-320 |
| 4 | botón | «Refrescar» (outline, RefreshCw) | `loadAccounts()` | Siempre | cuentas/page.tsx:322-332 |
| 5 | botón | «Nueva Cuenta» (primario, Plus) | Resetea, carga las cuentas bancarias y abre el diálogo | Siempre | cuentas/page.tsx:333-344 |
| 6 | estado | «Estas cuentas son donde el ERP admin te envia tus dispersiones. Deben estar verificadas para recibir pagos automaticos via Bre-B.» | Banner azul (Info) | Siempre | cuentas/page.tsx:348-355 |
| 7 | texto | «Cuentas Registradas ({n})» | Título de la Card | Siempre | cuentas/page.tsx:360-362 |
| 8 | estado | «Cargando cuentas...» / «No hay cuentas de dispersion registradas» + «Crea una cuenta para empezar a recibir tus dispersiones.» | Carga / vacío. **Sin CTA dentro del estado** | — | cuentas/page.tsx:365-383 |
| 9 | columna | «Banco» · «Tipo» · «Numero» (**sin tilde**, `font-mono`, **sin enmascarar**) · «Titular» · «ID Titular» · «Cuenta contable vinculada» · «Verificado» · «Acciones» | Tabla de **8 columnas** | Con datos | cuentas/page.tsx:388-395 |
| 10 | badge | «Verificada» (success, ShieldCheck) / «Pendiente» (warning, ShieldAlert) | — | Por fila | cuentas/page.tsx:433-451 |
| 11 | botón | «Eliminar» (ghost rojo, Trash2 → spinner) | `DELETE /payout-accounts/{id}`. **Sin confirmación** | Por fila | cuentas/page.tsx:453-466 |
| 12 | diálogo | «Nueva Cuenta de Dispersion» · «Registra una cuenta bancaria para recibir tus dispersiones.» (`max-w-lg`) | Alta | Tras #5 | cuentas/page.tsx:477-484 |
| 13 | campo | «Vincular cuenta bancaria existente (opcional)» (Select) + ayuda «Si seleccionas una cuenta existente, se auto-llenaran los datos bancarios.» | Opciones «Sin vincular (ingresar manualmente)», «Cargando...» y «{name} - {banco} ({número})» | En el diálogo | cuentas/page.tsx:488-537 |
| 14 | campo | «Banco *» (placeholder «Ej: Bancolombia, Davivienda...») | **Texto libre: aquí no hay catálogo**, al contrario que D.4 | En el diálogo | cuentas/page.tsx:540-548 |
| 15 | campo | «Tipo de Cuenta *» (Select «Ahorros» / «Corriente») | «Ahorros» por defecto | En el diálogo | cuentas/page.tsx:551-567 |
| 16 | campo | «Numero de Cuenta *» (placeholder «Numero de cuenta bancaria») | Obligatorio | En el diálogo | cuentas/page.tsx:570-578 |
| 17 | campo | «Titular *» (placeholder «Nombre completo del titular») | Obligatorio | En el diálogo | cuentas/page.tsx:581-591 |
| 18 | campo | «Tipo de Documento *» (Select «Cedula de Ciudadania» / «Cedula de Extranjeria» / «NIT» / «Permiso Especial de Permanencia») | «CC» por defecto | En el diálogo | cuentas/page.tsx:594-616 |
| 19 | campo | «Numero de Documento *» (placeholder «Numero de identificacion del titular») | Obligatorio | En el diálogo | cuentas/page.tsx:619-629 |
| 20 | campo | «Clave Bre-B (opcional)» + ayuda «Si se configura, permite dispersion automatica via Bre-B.» | `null` si vacío | En el diálogo | cuentas/page.tsx:632-645 |
| 21 | botón | «Cancelar» / «Guardar» (primario, spinner) | `POST /payout-accounts` — **siempre falla: envía snake_case y la API exige camelCase** | En el diálogo | cuentas/page.tsx:649-661 |
| 22 | toast | «Completa todos los campos obligatorios» / «Cuenta de dispersion creada correctamente» / «No se pudo crear la cuenta de dispersion» / «Cuenta eliminada correctamente» / «No se pudo eliminar la cuenta» / «No se pudieron cargar las cuentas de dispersion» | — | — | cuentas/page.tsx:206 · 234 · 240 · 257 · 261 · 181 |

La lista viene de `GET /api/integrations/payfac/payout-accounts?organizationId={id}`; el Select de vinculación consulta **directamente** `bank_accounts` desde el navegador (`cuentas/page.tsx:147-158`). La tabla de 8 columnas se desborda por debajo de ~1100 px. **No existe**: edición, acción de verificación (el badge «Pendiente» no se puede accionar), validación de dígitos, paginación ni enmascarado.

### D.13 PayFac — Mis dispersiones `/app/finanzas/payfac/dispersiones` — `app/app/finanzas/payfac/dispersiones/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Cargando organizacion...» / «No hay organizacion activa» + «Selecciona una organizacion para ver tus dispersiones.» | Bloqueos | — | dispersiones/page.tsx:206-230 |
| 2 | texto | «Mis Dispersiones» / «Pagos recibidos del procesador» | H1. **Sin volver ni migaja** | Siempre | dispersiones/page.tsx:238-250 |
| 3 | botón | «Refrescar» (outline, RefreshCw) | Relanza resumen + lista | Siempre | dispersiones/page.tsx:251-264 |
| 4 | stat | «Total Recaudado» (TrendingUp azul) | `summary.total_gross ?? 0` — **siempre 0: la respuesta se desenvuelve mal** | Siempre | dispersiones/page.tsx:270-286 |
| 5 | stat | «Total Comision» (**sin tilde**, Percent naranja) | `summary.total_commission ?? 0` | Siempre | dispersiones/page.tsx:289-305 |
| 6 | stat | «Total Dispersado» (Banknote verde) | `summary.total_net ?? 0` | Siempre | dispersiones/page.tsx:308-324 |
| 7 | stat | «Pendiente de Dispersion» (**sin tilde**, Clock amarillo) | `summary.pending ?? 0` | Siempre | dispersiones/page.tsx:327-343 |
| 8 | chip | «Todas» / «Pendientes» / «Procesadas» / «Fallidas» | 4 botones `sm`; el activo en `default`. Filtran **en servidor** | Siempre | dispersiones/page.tsx:99-104, 347-358 |
| 9 | texto | «Dispersiones ({n})» | Título de la Card | Siempre | dispersiones/page.tsx:363-365 |
| 10 | estado | «Cargando dispersiones...» / «No hay dispersiones para mostrar» + «Aun no se han registrado dispersiones para esta organizacion.» | Carga / vacío | — | dispersiones/page.tsx:368-386 |
| 11 | columna | «Referencia» · «Proveedor» · «Total» · «Comision» (**sin tilde**) · «Neto» · «Estado» · «Metodo» (**sin tilde**) · «Periodo» · «Fecha» | Tabla de **9 columnas** | Con datos | dispersiones/page.tsx:391-399 |
| 12 | badge | «Pendiente» (warning) / «Procesando» (info) / «Completada» (success) / «Fallida» (destructive) / «Cancelada» (secondary) | — | Por fila | dispersiones/page.tsx:87-96, 424 |
| 13 | botón | Fila completa (`cursor-pointer`) | `getPayoutDetail(id)` → abre el diálogo | Por fila | dispersiones/page.tsx:404-407 |
| 14 | diálogo | «Dispersion {referencia}» + badge de estado · «Detalle de la dispersion recibida del procesador.» (`max-w-2xl`) | Detalle | Tras #13 | dispersiones/page.tsx:459-467 |
| 15 | estado | «Cargando detalle...» | El diálogo se abre ya en este estado | `detailLoading` | dispersiones/page.tsx:450-456 |
| 16 | stat | «Total Recaudado» / «Comision» / «Neto Recibido» | `grid-cols-3` (blanco / naranja / verde) | En el diálogo | dispersiones/page.tsx:470-504 |
| 17 | columna | «Payment ID» · «Referencia» · «Bruto» · «Comision» · «Neto» | Tabla interna de 5 columnas, tras un `Separator` «Items de la dispersion» | En el diálogo | dispersiones/page.tsx:506-550 |
| 18 | estado | «Esta dispersion no tiene items detallados.» | **Es lo que se ve siempre**, por el desenvuelto incorrecto | — | dispersiones/page.tsx:555-559 |
| 19 | toast | «No se pudo cargar el resumen de dispersiones» / «No se pudieron cargar las dispersiones» / «No se pudo cargar el detalle de la dispersion» | — | — | dispersiones/page.tsx:151 · 173 · 191 |

`/payouts/summary`, `/payouts` y `/payouts/{id}` responden `{success, data}` y la página las asigna directas al estado (`dispersiones/page.tsx:147-148, 170-171, 187-188`): los KPIs quedan en 0 y la tabla revienta con `payouts.map is not a function` en cuanto la API devuelve filas. **No existe**: filtro por fechas o periodo, exportación, paginación, reintento de una dispersión fallida, enlace del «Payment ID» al pago del ERP, ni conciliación contra el banco.

---

## E. Contabilidad

Ninguna de estas 14 pantallas usa `messages/es.json` y buena parte está **sin tildes** (los cuatro
informes y los tres módulos satélite). Ninguna es mock ni está tras feature flag: todas leen
Postgres real. Todas dependen del módulo `finance` del plan
(`config/moduleConfig.ts:149-160`, `lib/config/modulePages.ts:53-64`) salvo
`/app/finanzas/periodos-contables`, que **no está en ningún catálogo ni en el menú** (§E.15).

### E.1 Contabilidad (hub) `/app/finanzas/contabilidad` — `components/finanzas/contabilidad/ContabilidadHomePage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Contabilidad» (h1 2xl bold, Calculator en cuadro azul) | Título | Siempre | ContabilidadHomePage.tsx:216-222 |
| 2 | texto | «Gestión contable y financiera» | Subtítulo | Siempre | ContabilidadHomePage.tsx:223-225 |
| 3 | badge | «Sucursal:» + «Todas las sucursales» / nombre | `BranchBadge` | Siempre | ContabilidadHomePage.tsx:229 |
| 4 | estado | `StatsSkeleton count={4}` | Esqueleto de KPIs | `isLoading` | ContabilidadHomePage.tsx:232-235 |
| 5 | stat | «Total Asientos» | `count` de `journal_entries` | Cargado | ContabilidadHomePage.tsx:238-249 |
| 6 | stat | «Asientos Publicados» (verde) | `posted = true` | Cargado | ContabilidadHomePage.tsx:250-261 |
| 7 | stat | «Cuentas Contables» (azul) | `chart_of_accounts` activas | Cargado | ContabilidadHomePage.tsx:262-273 |
| 8 | stat | «Periodos Abiertos» (**sin tilde**, morado) | `fiscal_periods` con `status='open'` | Cargado | ContabilidadHomePage.tsx:274-285 |
| 9 | texto | «Folios PMS - Resumen Contable» (Receipt) | Tarjeta PMS | Si `totalFolios > 0` | ContabilidadHomePage.tsx:290-296 |
| 10 | stat | «Folios Abiertos» · «Total Items» | Conteos de `folios` / `folio_items` | Ídem | ContabilidadHomePage.tsx:300-311 |
| 11 | stat | «Items Pendientes» (ámbar) | **Es un importe, no un conteo, pese al rótulo** | Ídem | ContabilidadHomePage.tsx:312-317 · 161-163 |
| 12 | stat | «Saldo Total Pendiente» (rojo) | Suma de `folios.balance` | Ídem | ContabilidadHomePage.tsx:318-323 |
| 13 | botón | «Ver Folios» (Receipt, outline sm) | `Link` a `/app/pms/folios` | Ídem | ContabilidadHomePage.tsx:326-331 |
| 14 | texto | «Módulos de Contabilidad» (h2) | Encabezado de la rejilla | Siempre | ContabilidadHomePage.tsx:339-341 |
| 15 | botón | «Plan de Cuentas» / «Gestión del catálogo contable» (BookOpen azul, ArrowRight) | `/contabilidad/plan-cuentas` | Siempre | ContabilidadHomePage.tsx:20-26, 346-367 |
| 16 | botón | «Asientos Contables» / «Registro y gestión de asientos» (FileText verde) | `/…/asientos` | Siempre | ContabilidadHomePage.tsx:27-33 |
| 17 | botón | «Balance de Comprobación» / «Reporte de saldos por cuenta» (BarChart3 azul) | `/…/balance-comprobacion` | Siempre | ContabilidadHomePage.tsx:34-40 |
| 18 | botón | «Estado de Resultados» / «P&G: ingresos, costos y gastos» (TrendingUp verde) | `/…/estado-resultados` | Siempre | ContabilidadHomePage.tsx:41-47 |
| 19 | botón | «Balance General» / «Estado de situación financiera» (Calculator morado) | `/…/balance-general` | Siempre | ContabilidadHomePage.tsx:48-54 |
| 20 | botón | «Mayor Contable» / «Libro mayor por cuenta» (BookOpen azul) | `/…/mayor-contable` | Siempre | ContabilidadHomePage.tsx:55-61 |
| 21 | botón | «Reglas Contables» / «Asientos automáticos por evento» (Shield naranja) | `/app/finanzas/reglas-contables` | Siempre | ContabilidadHomePage.tsx:62-68 |
| 22 | botón | «Períodos Fiscales» / «Apertura y cierre de períodos» (CalendarClock morado) | `/…/periodos-fiscales` | Siempre | ContabilidadHomePage.tsx:69-75 |
| 23 | botón | «Centro de Costos» / «Gestión de centros de costo» (LayoutGrid naranja) | `/app/finanzas/centro-costos` | Siempre | ContabilidadHomePage.tsx:76-82 |
| 24 | botón | «Activos Fijos» / «Registro y depreciación de activos» (Package verde) | `/app/finanzas/activos-fijos` | Siempre | ContabilidadHomePage.tsx:83-89 |
| 25 | botón | «Presupuestos» / «Planificación y control presupuestal» (Target azul) | `/app/finanzas/presupuestos` | Siempre | ContabilidadHomePage.tsx:90-96 |
| 26 | texto | «Acciones Rápidas» + «Accesos directos a operaciones comunes» | Última tarjeta | Siempre | ContabilidadHomePage.tsx:376-379 |
| 27 | botón | «Nuevo Asiento» (FileText, azul sólido) | `/…/asientos?action=new` → abre el diálogo al llegar | Siempre | ContabilidadHomePage.tsx:383-388 |
| 28 | botón | «Nueva Cuenta» (BookOpen, outline) | `/…/plan-cuentas?action=new` — **el destino no lee `action`** | Siempre | ContabilidadHomePage.tsx:389-394 |
| 29 | botón | «Ver Períodos» (CalendarClock, outline) | `/…/periodos-fiscales` | Siempre | ContabilidadHomePage.tsx:395-400 |
| 30 | toast | «Error al cargar el resumen» | Fallo de `obtenerResumen` | — | ContabilidadHomePage.tsx:126 |

Datos: `ContabilidadService.obtenerResumen()` (`ContabilidadService.ts:61-95`) con tres `count` en paralelo; el bloque PMS consulta `folios` + `folio_items` **desde el componente** con el cliente de navegador (`ContabilidadHomePage.tsx:132-179`), saltándose el servicio. KPIs `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`; módulos `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. **No existe**: estado vacío (con `resumen` null no se pinta nada), estado de error en pantalla, migas, selector de periodo, botón de recarga ni control de permisos.

### E.2 Asientos contables `/app/finanzas/contabilidad/asientos` — `components/finanzas/contabilidad/asientos/AsientosPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono ArrowLeft, ghost icon) | `Link` a `/app/finanzas/contabilidad` | Siempre | AsientosPage.tsx:217-221 |
| 2 | texto | «Asientos Contables» / «Registro y gestión de asientos» | Cabecera (FileText azul) | Siempre | AsientosPage.tsx:222-232 |
| 3 | botón | «Nuevo Asiento» (Plus, azul sólido) | Abre el diálogo #25 | Siempre | AsientosPage.tsx:235-238 |
| 4 | badge | «Sucursal: …» | `BranchBadge` | Siempre | AsientosPage.tsx:241 |
| 5 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(3)` | Carga | `isLoading` | AsientosPage.tsx:202-210 |
| 6 | stat | «Total Asientos» · «Publicados» (verde) · «Borradores» (amarillo) | Conteos en cliente | Siempre | AsientosPage.tsx:245-272 |
| 7 | campo | Placeholder «Buscar por ID o memo...» (Search) | Filtra **en cliente** | Siempre | AsientosPage.tsx:279-287, 193-197 |
| 8 | campo | Select «Estado» (150 px): «Todos» / «Publicados» / «Borradores» | Filtro cliente | Siempre | AsientosPage.tsx:288-297 |
| 9 | campo | Select «Origen» (150 px): «Todos los orígenes» / «Manual» / `{source}` **crudo** (`sale`, `purchase`, `folio_item`…) | Filtro cliente, opciones derivadas de los datos | Siempre | AsientosPage.tsx:298-309, 200 |
| 10 | texto | «Lista de Asientos» + «{n} asientos encontrados» | Cabecera | Siempre | AsientosPage.tsx:317-320 |
| 11 | columna | «ID» · «Fecha» · «Memo» · «Origen» · «Estado» · «Acciones» | 6 columnas | Siempre | AsientosPage.tsx:326-331 |
| 12 | columna | «ID» → `CopyableId` con `#{id}` (azul, monoespaciado) | Copiar / navegar al detalle | Por fila | AsientosPage.tsx:337-344 |
| 13 | columna | «Fecha» → `toLocaleDateString('es-CO')` | **Corre un día** (§H) | Por fila | AsientosPage.tsx:345-347 |
| 14 | badge | «Origen» → `Badge variant="outline"` con `source` o «manual» | **Valor crudo en inglés** | Por fila | AsientosPage.tsx:351-355 |
| 15 | badge | «Publicado» (verde) / «Borrador» (amarillo) | `posted` | Por fila | AsientosPage.tsx:356-361 |
| 16 | botón | (icono Eye, ghost sm) | `Link` al detalle | Por fila | AsientosPage.tsx:364-368 |
| 17 | botón | (icono Check, ghost sm, verde) | `posted = true`, **sin confirmación** | Solo si `!posted` | AsientosPage.tsx:369-373, 158-166 |
| 18 | botón | (icono Copy, ghost sm) | Duplica el asiento | Por fila | AsientosPage.tsx:374-376, 168-176 |
| 19 | botón | (icono Trash2, ghost sm, rojo) | `confirm('¿Estás seguro de eliminar este asiento?')` → borra líneas y cabecera | Solo si `!posted` | AsientosPage.tsx:377-381, 178-187 |
| 20 | diálogo | «Nuevo Asiento Contable» / «Crea un nuevo asiento con sus líneas de débito y crédito» (`max-w-4xl`, scroll 90vh) | Alta manual | #3 o `?action=new` | AsientosPage.tsx:392-399, 55-57 |
| 21 | campo | «Fecha *» (`type=date`) | Por defecto **hoy en UTC** | En el diálogo | AsientosPage.tsx:403-409, 44 |
| 22 | campo | «Memo» (placeholder «Descripción del asiento») | Texto libre | En el diálogo | AsientosPage.tsx:412-418 |
| 23 | botón | «Agregar Línea» (Plus, outline sm) | Añade una fila vacía | En el diálogo | AsientosPage.tsx:426-428 |
| 24 | columna | «Cuenta» · «Descripción» · «Débito» (w-32) · «Crédito» (w-32) · (vacía w-10) | Mini-tabla, mínimo 2 filas | En el diálogo | AsientosPage.tsx:435-439 |
| 25 | campo | Select por línea, placeholder «Seleccionar», «{código} - {nombre}», `max-h-60` | **Lista plana y sin búsqueda** | Por línea | AsientosPage.tsx:446-460 |
| 26 | campo | Input placeholder «Descripción» · dos `type=number` placeholder «0.00» | Descripción, débito y crédito | Por línea | AsientosPage.tsx:463-486 |
| 27 | botón | (icono Trash2, ghost sm, rojo) | Quita la línea | Si hay >2 líneas | AsientosPage.tsx:489-493 |
| 28 | cálculo | «Total Débitos:» · «Total Créditos:» · «Diferencia:» (**verde si cuadra, rojo si no**) | Sumas en vivo; tolerancia 0.01 | En el diálogo | AsientosPage.tsx:503-520, 111 |
| 29 | botón | «Cancelar» (outline) | Cierra **sin limpiar el formulario** | En el diálogo | AsientosPage.tsx:525-527 |
| 30 | botón | «Crear Asiento» (azul, Loader2) | **`disabled` mientras no cuadre la partida doble** | En el diálogo | AsientosPage.tsx:528-531 |
| 31 | toast | «La fecha es requerida» / «Se requieren al menos 2 líneas con valores» / «El asiento debe estar balanceado (débitos = créditos)» / «Seleccione una sucursal antes de crear el asiento.» | Validaciones | — | AsientosPage.tsx:115 · 121 · 126 · 133 |
| 32 | toast | «Asiento creado exitosamente» / «publicado» / «duplicado» / «eliminado» + sus «Error al …» | Resultados | — | AsientosPage.tsx:146,152 · 161,164 · 171,174 · 182,185 |
| 33 | toast | «Error al cargar los datos» | Carga inicial | — | AsientosPage.tsx:71 |

Datos: `obtenerAsientos({branchId})` sobre `journal_entries` (`ContabilidadService.ts:178-217`), orden `entry_date desc`. El alta es un `insert` en `journal_entries` + `insert` masivo en `journal_lines` **desde el navegador, sin RPC transaccional** (`ContabilidadService.ts:288-338`): si falla el segundo queda una cabecera huérfana. Convierte con `currency_rates` si la moneda no es COP (`:271-285`), pero **el diálogo no ofrece selector de moneda**. **No existe**: paginación (se traen todos los asientos), filtro por rango de fechas (el servicio lo soporta, la UI no), edición, anulación/reversión (no hay estado «anulado»: solo `posted`), centro de costo por línea (la columna existe en `journal_lines`), exportación ni selección múltiple.

### E.3 Detalle de asiento `/app/finanzas/contabilidad/asientos/[id]` — `asientos/AsientoDetailPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `DetailSkeleton` | Carga | `isLoading` | AsientoDetailPage.tsx:95-101 |
| 2 | botón | (icono ArrowLeft, ghost icon) | Vuelve al listado | Siempre | AsientoDetailPage.tsx:110-114 |
| 3 | texto | «Asiento #{id}» (h1) + `{memo}` o «Sin descripción» | Título y subtítulo | Siempre | AsientoDetailPage.tsx:119-124 |
| 4 | badge | «Publicado» (verde) / «Borrador» (amarillo) | Estado | Siempre | AsientoDetailPage.tsx:126-129 |
| 5 | botón | «Publicar» (Check, verde sólido) | `posted = true`, **sin confirmación** | Si `!posted` | AsientoDetailPage.tsx:133-138 |
| 6 | botón | «Duplicar» (Copy, outline) | Duplica y navega al nuevo | Siempre | AsientoDetailPage.tsx:139-142, 63-75 |
| 7 | botón | «Eliminar» (Trash2, outline rojo) | `confirm('¿Estás seguro de eliminar este asiento?')` | Si `!posted` | AsientoDetailPage.tsx:143-148, 77-90 |
| 8 | stat | «Fecha» (Calendar) → formato largo «22 de septiembre de 2026» | **Corre un día** (§H) | Siempre | AsientoDetailPage.tsx:154-170 |
| 9 | stat | «Origen» (Link) → `source` o «Manual» + «#{source_id}» | **Texto, no enlace** al documento origen | Siempre | AsientoDetailPage.tsx:172-185 |
| 10 | stat | «Creado» (User) → `created_at` | **Pese al icono, no muestra quién** (`created_by` no se lee) | Siempre | AsientoDetailPage.tsx:187-199 |
| 11 | texto | «Líneas del Asiento» + «{n} líneas registradas» | Cabecera | Siempre | AsientoDetailPage.tsx:205-208 |
| 12 | columna | «Cuenta» · «Descripción» · «Débito» · «Crédito» | 4 columnas | Siempre | AsientoDetailPage.tsx:214-217 |
| 13 | columna | «Cuenta» → código monoespaciado + nombre | Join a `chart_of_accounts` | Por línea | AsientoDetailPage.tsx:223-234 |
| 14 | cálculo | «Total Débitos» · «Total Créditos» · «Balance» → «✓ Balanceado» (verde) o la diferencia (rojo) | Verificación de partida doble | Siempre | AsientoDetailPage.tsx:253-270 |
| 15 | toast | «Asiento no encontrado» → redirige · «Error al cargar el asiento» + los de publicar/duplicar/eliminar | — | — | AsientoDetailPage.tsx:36-37, 43, 54-57, 68-71, 83-86 |

Dos consultas separadas (`ContabilidadService.ts:219-252`). La ruta parsea el id con `parseInt` sin validar (`app/app/finanzas/contabilidad/asientos/[id]/page.tsx:12-14`): un id no numérico da `NaN` → «Asiento no encontrado». Los totales usan `flex justify-end gap-8` sin `flex-wrap` (se apilan mal por debajo de ~480 px). **No existe**: edición de líneas, impresión/PDF del comprobante, historial, enlace real al origen, moneda ni tasa (`currency_code`, `exchange_rate`, `debit_base`, `credit_base` existen y no se muestran), ni el centro de costo.

### E.4 Plan de cuentas `/app/finanzas/contabilidad/plan-cuentas` — `plan-cuentas/PlanCuentasPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(3)` | Carga | `isLoading` | PlanCuentasPage.tsx:269-277 |
| 2 | botón | (icono ArrowLeft, ghost icon) | Vuelve al hub | Siempre | PlanCuentasPage.tsx:284-288 |
| 3 | texto | «Plan de Cuentas» / «Gestión del catálogo contable» (BookOpen azul) | Cabecera | Siempre | PlanCuentasPage.tsx:289-299 |
| 4 | botón | «Expandir Todo» / «Colapsar Todo» (outline) | Expande o vacía el set de nodos abiertos | Siempre | PlanCuentasPage.tsx:303-308, 125-128 |
| 5 | botón | «Nueva Cuenta» (Plus, azul) | Abre el diálogo en alta | Siempre | PlanCuentasPage.tsx:309-312 |
| 6 | badge | «Sucursal: …» | `BranchBadge` — **decorativo: el plan de cuentas no tiene sucursal** | Siempre | PlanCuentasPage.tsx:316 |
| 7 | campo | Placeholder «Buscar por código o nombre...» (Search) | Filtra y reconstruye el árbol | Siempre | PlanCuentasPage.tsx:322-329, 74-80 |
| 8 | campo | Select «Tipo de cuenta» (180 px): «Todos los tipos» / «Activo» / «Pasivo» / «Patrimonio» / «Ingreso» / «Gasto» | Filtro | Siempre | PlanCuentasPage.tsx:331-341, 19-25 |
| 9 | stat | 5 tarjetas «Activo» · «Pasivo» · «Patrimonio» · «Ingreso» · «Gasto» con su conteo | Sobre el total **sin filtrar** | Siempre | PlanCuentasPage.tsx:347-358 |
| 10 | texto | «Estructura de Cuentas» + «{n} cuentas en total» | Cabecera del árbol | Siempre | PlanCuentasPage.tsx:363-366 |
| 11 | botón | ChevronRight / ChevronDown (20×20) | Expande o colapsa; invisible sin hijos | Por nodo | PlanCuentasPage.tsx:223-228 |
| 12 | texto | Código monoespaciado (w-20) + nombre + «({n})» de hijos + descripción xs | Sangría de **24 px por nivel** | Por nodo | PlanCuentasPage.tsx:230-250 |
| 13 | badge | «Activo» (azul) / «Pasivo» (rojo) / «Patrimonio» (morado) / «Ingreso» (verde) / «Gasto» (naranja) | Tipo | Por nodo | PlanCuentasPage.tsx:207-210, 252 |
| 14 | botón | (icono Edit, ghost 32×32) | Abre el diálogo en edición | Por nodo | PlanCuentasPage.tsx:255-257 |
| 15 | botón | (icono Trash2, ghost 32×32, rojo) | `confirm('¿Estás seguro de eliminar esta cuenta?')` → `DELETE`, **también en cuentas con hijos o movimientos** | Por nodo | PlanCuentasPage.tsx:258-260, 196-205 |
| 16 | estado | «No se encontraron cuentas» / «No hay cuentas registradas» | Vacío con y sin filtro | — | PlanCuentasPage.tsx:372-376 |
| 17 | diálogo | «Nueva Cuenta Contable» / «Agrega una nueva cuenta al plan» — o «Editar Cuenta» / «Modifica los datos de la cuenta» | Alta o edición | #5 / #14 | PlanCuentasPage.tsx:384-391 |
| 18 | campo | «Código *» (placeholder «Ej: 1105», monoespaciado, **`disabled` al editar**) | PK junto con la organización | En el diálogo | PlanCuentasPage.tsx:395-402 |
| 19 | campo | «Tipo *» (Select, sin placeholder) | 5 opciones; «Activo» por defecto | En el diálogo | PlanCuentasPage.tsx:405-418 |
| 20 | campo | «Nombre *» (placeholder «Nombre de la cuenta») | Texto | En el diálogo | PlanCuentasPage.tsx:423-429 |
| 21 | campo | «Cuenta Padre (opcional)» (Select, placeholder «Sin cuenta padre», `max-h-60`) | **Lista plana** de todas las cuentas | En el diálogo | PlanCuentasPage.tsx:433-451 |
| 22 | campo | «Descripción» → `RichTextEditor` (placeholder «Descripción opcional», `minHeight={60}`) | **Guarda HTML** en `chart_of_accounts.description` | En el diálogo | PlanCuentasPage.tsx:455-462 |
| 23 | botón | «Cancelar» / «Crear Cuenta» / «Guardar Cambios» (azul, spinner) | — | En el diálogo | PlanCuentasPage.tsx:466-472 |
| 24 | toast | «El código y nombre son requeridos» / «Cuenta creada exitosamente» / «Cuenta actualizada exitosamente» / «Error al guardar la cuenta» / «Cuenta eliminada exitosamente» / «Error al eliminar. Puede tener cuentas hijas o movimientos.» / «Error al cargar el plan de cuentas» | — | — | PlanCuentasPage.tsx:163 · 183 · 176 · 190 · 200 · 203 · 65 |

PK verificada: `(organization_id, account_code)`; `type` con CHECK de 5 valores. **No existe**: importación del PUC colombiano ni plantilla inicial, exportación (el icono `Download` se importa y no se usa, l.6), activar/desactivar una cuenta (`is_active` solo se escribe `true` al crear: las inactivas se ven igual que las activas), saldo por cuenta en el árbol, reordenamiento ni validación de que el padre sea del mismo tipo. Al filtrar, **un hijo cuyo padre no pasa el filtro se promueve a raíz** (l.96-103): el árbol filtrado miente sobre la jerarquía.

### E.5 Balance de comprobación `/app/finanzas/contabilidad/balance-comprobacion` — `balance-comprobacion/BalanceComprobacionPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(3)` | Carga — **tapa también los filtros** | `isLoading` | BalanceComprobacionPage.tsx:78-86 |
| 2 | texto | «Balance de Comprobacion» (**sin tilde**) / «Saldos y movimientos por cuenta» | Cabecera (FileText azul). **Sin flecha de volver** | Siempre | BalanceComprobacionPage.tsx:92-99 |
| 3 | exportación | «Exportar CSV» (Download, outline) | `balance-comprobacion-{inicio}-{fin}.csv` vía Blob; cabeceras **sin tildes** `Codigo,Nombre,Tipo,Saldo Ini Debito,Saldo Ini Credito,Mov Debito,Mov Credito,Saldo Fin Debito,Saldo Fin Credito` + fila `TOTALES` | Siempre | BalanceComprobacionPage.tsx:100-103, 63-76 |
| 4 | badge | «Sucursal: …» | `BranchBadge` — **decorativo: el informe no filtra por sucursal** | Siempre | BalanceComprobacionPage.tsx:106 |
| 5 | campo | «Fecha Inicio» (`type=date`) | Por defecto, día 1 del mes actual | Siempre | BalanceComprobacionPage.tsx:111-114, 28 |
| 6 | campo | «` `Fecha Fin» (**la etiqueta lleva un espacio inicial en el código**) | Por defecto, hoy | Siempre | BalanceComprobacionPage.tsx:115-118 |
| 7 | botón | «Consultar» (Calendar, azul) | Relanza `getTrialBalance` | Siempre | BalanceComprobacionPage.tsx:119-122 |
| 8 | texto | «Detalle por Cuenta» + «{n} cuentas» | Cabecera de la tabla | Siempre | BalanceComprobacionPage.tsx:129-130 |
| 9 | columna | «Codigo» · «Cuenta» · «Tipo» · «Saldo Ini. Debito» · «Saldo Ini. Credito» · «Mov. Debito» · «Mov. Credito» · «Saldo Fin. Debito» · «Saldo Fin. Credito» (**9 columnas, todas sin tildes**) | `<table>` nativa con `overflow-x-auto` | Siempre | BalanceComprobacionPage.tsx:134-146 |
| 10 | columna | «Tipo» → «Activo» / «Pasivo» / «Patrimonio» / «Ingreso» / «Gasto» | `TYPE_LABELS` local | Por fila | BalanceComprobacionPage.tsx:13-19, 153 |
| 11 | cálculo | Importes con `Intl.NumberFormat('es-CO')` **sin símbolo de moneda**; «-» si \|valor\| < 0.01 | Formateo local | Por celda | BalanceComprobacionPage.tsx:21-24 |
| 12 | cálculo | Fila `<tfoot>` «TOTALES» (colSpan 3, bold, borde doble) + los 6 totales | Suma en cliente | Siempre | BalanceComprobacionPage.tsx:163-173, 51-61 |

Datos: `getTrialBalance` (`ReportesContablesService.ts:111-203`): cuentas activas y **dos** consultas a `journal_lines` con `!inner` a `journal_entries` (periodo y anteriores), ambas con `posted = true`. **No existe**: estado vacío (con cero cuentas se ve la tabla con solo TOTALES), estado de error en pantalla (solo `console.error`, l.44), filtro por sucursal ni centro de costo, exclusión de cuentas sin movimiento, nivel de detalle del PUC, comparación entre periodos, Excel/PDF ni paginación.

### E.6 Estado de resultados `/app/finanzas/contabilidad/estado-resultados` — `estado-resultados/EstadoResultadosPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton` + `CardListSkeleton` | Carga | `isLoading` | EstadoResultadosPage.tsx:61-69 |
| 2 | texto | «Estado de Resultados» / «Ingresos y gastos del periodo» (**«periodo» sin tilde**) | Cabecera (TrendingUp verde). **Sin flecha de volver** | Siempre | EstadoResultadosPage.tsx:75-83 |
| 3 | badge | «Sucursal: …» | `BranchBadge` — decorativo | Siempre | EstadoResultadosPage.tsx:85 |
| 4 | campo | «Fecha Inicio» (`type=date`) | Por defecto, **1 de enero** del año actual | Siempre | EstadoResultadosPage.tsx:91-93, 38 |
| 5 | campo | «Fecha Fin» (`type=date`) | Por defecto, hoy | Siempre | EstadoResultadosPage.tsx:94-97 |
| 6 | botón | «Consultar» (Calendar, azul) | Relanza `getIncomeStatement` | Siempre | EstadoResultadosPage.tsx:98-101 |
| 7 | texto | «Ingresos» (TrendingUp verde) + «Total: {importe}» | Tarjeta izquierda | Siempre | EstadoResultadosPage.tsx:109-113 |
| 8 | tabla | Árbol de ingresos: código xs monoespaciado + nombre (**bold si tiene hijos**) · importe a la derecha; sangría **20 px por nivel** | Recursiva, sin `<thead>` | Siempre | EstadoResultadosPage.tsx:18-34, 118 |
| 9 | cálculo | «TOTAL INGRESOS» (verde, borde doble) | Suma de raíces | Siempre | EstadoResultadosPage.tsx:119-122 |
| 10 | texto | «Gastos» (TrendingDown rojo) + «Total: {importe}» + «TOTAL GASTOS» (rojo) | Tarjeta derecha | Siempre | EstadoResultadosPage.tsx:129-143 |
| 11 | stat | «Resultado del Periodo» + «Utilidad» (verde) o «Perdida» (**sin tilde**, rojo) + importe absoluto `3xl` | Tarjeta de cierre, borde verde/rojo | Siempre | EstadoResultadosPage.tsx:150-171 |

`getIncomeStatement` (`ReportesContablesService.ts:205-301`): ingresos crédito−débito, gastos débito−crédito, `posted=true`. En el árbol, **un nodo con hijos toma la suma de hijos y descarta su propio movimiento** (l.275-282): una cuenta padre con apuntes directos pierde ese importe. **No existe**: botón de exportar (el icono `Download` se importa en la l.4 y **no se usa**), estado vacío, estado de error, comparación con el periodo anterior ni con presupuesto, margen bruto/operacional (es un P&G de dos bloques planos, sin línea de costo de ventas), filtro por sucursal ni centro de costo.

### E.7 Balance general `/app/finanzas/contabilidad/balance-general` — `balance-general/BalanceGeneralPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton` + `CardListSkeleton` | Carga | `isLoading` | BalanceGeneralPage.tsx:58-66 |
| 2 | texto | «Balance General» / «Estado de situacion financiera» (**sin tilde**) | Cabecera (icono **Scale** morado). Sin flecha de volver | Siempre | BalanceGeneralPage.tsx:72-80 |
| 3 | badge | «Sucursal: …» | `BranchBadge` — decorativo | Siempre | BalanceGeneralPage.tsx:82 |
| 4 | campo | «Fecha de Corte» (`type=date`) | **Único filtro**; por defecto hoy | Siempre | BalanceGeneralPage.tsx:87-90 |
| 5 | botón | «Consultar» (Calendar, azul) | Relanza `getBalanceSheet` | Siempre | BalanceGeneralPage.tsx:91-94 |
| 6 | estado | «Balance cuadrado: Activos = Pasivos + Patrimonio» (franja verde, CheckCircle) — o «Balance descuadrado: Diferencia de {importe}» (franja roja, AlertCircle) | Ecuación contable, tolerancia 0.01 | Siempre | BalanceGeneralPage.tsx:99-108 · ReportesContablesService.ts:395 |
| 7 | texto | «Activos» + «Total: {importe}» + «TOTAL ACTIVOS» (azul) | Tarjeta izquierda con árbol de 2 columnas | Siempre | BalanceGeneralPage.tsx:113-123 |
| 8 | texto | «Pasivos» + «TOTAL PASIVOS» (rojo) | Tarjeta derecha superior | Siempre | BalanceGeneralPage.tsx:132-142 |
| 9 | texto | «Patrimonio» + «TOTAL PATRIMONIO» (morado) | Tarjeta derecha inferior | Siempre | BalanceGeneralPage.tsx:150-160 |
| 10 | cálculo | «PASIVOS + PATRIMONIO» + importe (tarjeta `border-2`) | Contrapartida del total de activos | Siempre | BalanceGeneralPage.tsx:166-173 |

`getBalanceSheet(asOfDate)` (`ReportesContablesService.ts:303-397`). Mismo criterio de padres que el P&G (el padre **sustituye** su importe por la suma de hijos, l.369-374). **No existe**: exportación en ninguna forma, estado vacío ni de error, columna comparativa, clasificación corriente/no corriente, filtro por sucursal, y **el resultado del ejercicio no se arrastra al patrimonio**: por eso el aviso #6 dirá «descuadrado» en cuanto haya ingresos o gastos sin cierre contabilizado.

### E.8 Mayor contable `/app/finanzas/contabilidad/mayor-contable` — `mayor-contable/MayorContablePage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Mayor Contable» / «Movimientos detallados por cuenta» | Cabecera (BookOpen **índigo**). Sin flecha de volver | Siempre | MayorContablePage.tsx:79-87 |
| 2 | badge | «Sucursal: …» | `BranchBadge` — decorativo | Siempre | MayorContablePage.tsx:89 |
| 3 | campo | «Cuenta» (Select, placeholder «Seleccionar cuenta», `max-h-60`, `flex-1`) | **Todas** las cuentas (también inactivas); **preselecciona la primera** al cargar | Siempre | MayorContablePage.tsx:94-108, 44-56 |
| 4 | campo | «Fecha Inicio» / «Fecha Fin» (`type=date`) | 1 de enero del año actual / hoy | Siempre | MayorContablePage.tsx:109-116 |
| 5 | botón | «Consultar» (icono **Search**, azul) | Relanza `getLedger` | Siempre | MayorContablePage.tsx:117-120 |
| 6 | estado | `StatsSkeleton(4)` + `TableSkeleton(4×6)` | Carga (cabecera y filtros siguen visibles) | `isLoading` | MayorContablePage.tsx:125-129 |
| 7 | stat | «Saldo Inicial» · «Total Debito» (**sin tilde**, verde) · «Total Credito» (**sin tilde**, rojo) · «Saldo Final» | 4 KPIs | Con datos | MayorContablePage.tsx:133-156 |
| 8 | texto | «{código} - {nombre}» + «{Tipo} \| {n} movimientos» | Cabecera de la tabla | Con datos | MayorContablePage.tsx:161-166 |
| 9 | columna | «Fecha» · «Asiento» · «Descripcion» (**sin tilde**) · «Origen» · «Debito» · «Credito» · «Saldo» | 7 columnas, `<table>` nativa | Con movimientos | MayorContablePage.tsx:174-183 |
| 10 | tabla | Fila fija «Saldo Inicial» (colSpan 6, fondo gris) + su importe | Primera fila del cuerpo | Con movimientos | MayorContablePage.tsx:186-189 |
| 11 | columna | «Asiento» → «#{id}» monoespaciado | **Texto, no enlace al detalle** | Por fila | MayorContablePage.tsx:193 |
| 12 | columna | «Descripcion» → el **memo del asiento**, no la descripción de la línea | «-» si vacío | Por fila | MayorContablePage.tsx:194 · ReportesContablesService.ts:473 |
| 13 | columna | «Saldo» → saldo corrido acumulado (bold) | Calculado en cliente según naturaleza | Por fila | MayorContablePage.tsx:198 · ReportesContablesService.ts:457-479 |
| 14 | estado | «No hay movimientos en este periodo» | Cuenta sin movimientos | — | MayorContablePage.tsx:169-170 |
| 15 | estado | «Seleccione una cuenta para ver el mayor contable» (tarjeta, py-12) | `ledger` null | — | MayorContablePage.tsx:208-213 |

`getLedger` (`ReportesContablesService.ts:399-495`), todo con `posted=true`. **No existe**: exportación, impresión, **paginación** (el `select` de `journal_lines` no lleva `range`, así que PostgREST corta en su límite y **el saldo final puede quedar truncado sin avisar**), mayor de varias cuentas, enlace al asiento, filtro por sucursal ni origen; la columna `description` de la línea nunca se muestra pese a pedirse en el `select` (l.444).

### E.9 Períodos fiscales `/app/finanzas/contabilidad/periodos-fiscales` — `periodos-fiscales/PeriodosFiscalesPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(3)` | Carga | `isLoading` | PeriodosFiscalesPage.tsx:125-133 |
| 2 | texto | «Períodos Fiscales» / «Gestión de períodos contables» | Cabecera (CalendarClock morado). Sin flecha de volver | Siempre | PeriodosFiscalesPage.tsx:139-146 |
| 3 | botón | «Generar Períodos» (Plus, **outline**) | Abre el diálogo #10 | Siempre | PeriodosFiscalesPage.tsx:148-151 |
| 4 | estado | CalendarClock 48 px + «No hay períodos fiscales creados» + botón «Generar Períodos» | Vacío con CTA | Sin periodos | PeriodosFiscalesPage.tsx:155-167 |
| 5 | texto | «Año {año}» (anual) o «{Mes} {año}» (mensual) | Título de cada tarjeta | Con datos | PeriodosFiscalesPage.tsx:119-123, 174-176 |
| 6 | badge | «Abierto» (verde) / «Cerrado» (azul) / «Bloqueado» (rojo) / `{status}` crudo | Estado | Con datos | PeriodosFiscalesPage.tsx:106-117 |
| 7 | texto | «Inicio: {fecha}» · «Fin: {fecha}» · «Tipo: Anual/Mensual» · «Cerrado: {fecha}» | Cuerpo de la tarjeta, `toLocaleDateString('es')` | Con datos | PeriodosFiscalesPage.tsx:181-188 |
| 8 | texto | `{notes}` en xs cursiva con borde superior | Notas del cierre | Si hay | PeriodosFiscalesPage.tsx:189-191 |
| 9 | botón | «Cerrar» (CheckCircle2, outline sm) | Abre el diálogo #14 | Si `status === 'open'` | PeriodosFiscalesPage.tsx:193-202 |
| 10 | botón | «Reabrir» (Unlock, outline sm) | `status='open'`, `closed_at`/`closed_by` a null, **sin confirmación** | Si `status === 'closed'` | PeriodosFiscalesPage.tsx:205-212, 84-93 |
| 11 | botón | «Bloquear» (Lock, outline sm) | **Siempre falla** (§H) | Si `status === 'closed'` | PeriodosFiscalesPage.tsx:213-220, 95-104 |
| 12 | diálogo | «Generar Períodos Fiscales» (sin descripción) | Alta masiva | #3 / #4 | PeriodosFiscalesPage.tsx:232-236 |
| 13 | campo | «Año» (`type=number`) + «Tipo de Período» (Select «Mensuales (12 períodos)» / «Anual (1 período)») | La anual **siempre falla** (§H) | En el diálogo | PeriodosFiscalesPage.tsx:238-257 |
| 14 | diálogo | «Cerrar Período» + «Está por cerrar el período **{etiqueta}**. Una vez cerrado, no se podrán crear asientos en este período.» | **La advertencia es falsa** (§H) | #9 | PeriodosFiscalesPage.tsx:267-276 |
| 15 | campo | «Notas (opcional)» → Textarea 3 filas, placeholder «Notas sobre el cierre...» | Se guarda en `fiscal_periods.notes` | En el diálogo | PeriodosFiscalesPage.tsx:277-285 |
| 16 | botón | «Cancelar» / «Cerrar Período» · «Cancelar» / «Generar» | Pies de los dos diálogos | — | PeriodosFiscalesPage.tsx:288-289, 260-261 |
| 17 | toast | «Error al cargar períodos fiscales» / «12 períodos mensuales generados para {año}» / «Período anual generado para {año}» / «Error al generar períodos» / «Período cerrado correctamente» / «Error al cerrar período» / «Período reabierto» / «Error al reabrir período» / «Período bloqueado» / «Error al bloquear período» | — | — | PeriodosFiscalesPage.tsx:47 · 57 · 60 · 66 · 74 · 80 · 87 · 91 · 98 · 102 |

Verificado en BD: `status` CHECK `('open','closing','closed')` y `period_type` CHECK `('monthly','quarterly','yearly')`, con UNIQUE `(organization_id, year, month, period_type)`. **No existe**: KPIs, filtro por año, eliminación, edición, alta de un periodo suelto (`crearPeriodo` existe sin UI, `PeriodosFiscalesService.ts:40-61`; `showCreate` se declara y nunca se usa, l.29), ni cierre contable real (no genera asiento de cierre ni valida que el periodo cuadre).

### E.10 Periodos contables `/app/finanzas/periodos-contables` — `periodos-contables/PeriodosContablesPage.tsx`

Pantalla **huérfana**: no está en el menú, ni en `modulePages.ts`, ni en `moduleConfig.ts`, ni enlazada desde el hub. Solo se llega escribiendo la URL (§E.15).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(3)` | Carga | `isLoading` | PeriodosContablesPage.tsx:145-153 |
| 2 | texto | «Periodos Contables» (**sin tilde**) / «Gestión de apertura y cierre de periodos fiscales» | Cabecera (**Calendar azul**) | Siempre | PeriodosContablesPage.tsx:159-171 |
| 3 | campo | Select «Filtrar año» (140 px): «Todos los años» + los años presentes, descendente | Filtro cliente | Siempre | PeriodosContablesPage.tsx:174-187, 143 |
| 4 | botón | «Generar Año» (**FileSpreadsheet**, outline) | Abre el diálogo #5 | Siempre | PeriodosContablesPage.tsx:191-194 |
| 5 | diálogo | «Generar Periodos Anuales» / «Se crearán 12 periodos mensuales para el año seleccionado» + campo «Año» + «Cancelar» / «Generar» | Alta masiva | #4 | PeriodosContablesPage.tsx:196-221 |
| 6 | botón | «Nuevo Periodo» (Plus, azul) | Abre el diálogo #7 | Siempre | PeriodosContablesPage.tsx:228-231 |
| 7 | diálogo | «Nuevo Periodo Contable» / «Crea un nuevo periodo fiscal» + «Año» (`type=number`) + «Mes» (Select con los 12 meses) + «Cancelar» / «Crear» | Alta unitaria; calcula `start_date`/`end_date` | #6 | PeriodosContablesPage.tsx:233-276, 59-68 |
| 8 | stat | «Total Periodos» · «Periodos Abiertos» (verde) · «Periodos Cerrados» (gris) | Conteos | Siempre | PeriodosContablesPage.tsx:285-312 |
| 9 | texto | «Lista de Periodos» + «{n} periodos encontrados» | Cabecera de la tabla | Siempre | PeriodosContablesPage.tsx:318-321 |
| 10 | columna | «Periodo» · «Año» · «Fecha Inicio» · «Fecha Fin» · «Estado» · «Cerrado Por» · «Acciones» | 7 columnas, `Table` de shadcn | Siempre | PeriodosContablesPage.tsx:327-333 |
| 11 | columna | «Periodo» → nombre del mes o «Anual» | `MONTHS[month-1]` | Por fila | PeriodosContablesPage.tsx:339-341 |
| 12 | columna | «Fecha Inicio» / «Fecha Fin» → `toLocaleDateString('es-CO')` sobre un `date` | **Corren un día** (§H) | Por fila | PeriodosContablesPage.tsx:343-348 |
| 13 | badge | «Abierto» (verde) / «Cerrando» (amarillo) / «Cerrado» (gris) / `{status}` crudo | Estado | Por fila | PeriodosContablesPage.tsx:126-137 |
| 14 | columna | «Cerrado Por» | **Muestra la fecha `closed_at`, no el usuario** (§H) | Por fila | PeriodosContablesPage.tsx:350-355 |
| 15 | botón | (icono Lock, outline sm, amarillo) | Abre el diálogo #17 | Si `status='open'` | PeriodosContablesPage.tsx:358-370 |
| 16 | botón | (icono Unlock, outline sm, verde) | Reabre, **sin confirmación** | Si `status='closed'` | PeriodosContablesPage.tsx:371-380 |
| 17 | diálogo | «Cerrar Periodo» / «¿Estás seguro de cerrar este periodo? No se podrán registrar más movimientos.» + recuadro ámbar «{Mes} {año}» + «Esta acción bloqueará todos los registros contables de este periodo.» | **La advertencia es falsa** (§H) | #15 | PeriodosContablesPage.tsx:391-413 |
| 18 | botón | «Cancelar» / «Cerrar Periodo» (**amarillo**, Lock) | Cierra con `closed_by = usuario actual` | En el diálogo | PeriodosContablesPage.tsx:415-421, 101-102 |
| 19 | toast | «Error al cargar los periodos contables» / «Periodo creado exitosamente» / «Error al crear el periodo» / «Periodos del año {año} generados exitosamente» / «Error al generar los periodos» / «Periodo cerrado exitosamente» / «Error al cerrar el periodo» / «Periodo reabierto exitosamente» / «Error al reabrir el periodo» | — | — | PeriodosContablesPage.tsx:50 · 70 · 75 · 85 · 90 · 103 · 109 · 118 · 122 |

**La misma tabla `fiscal_periods`** que E.9. **No existe**: eliminación ni edición desde la UI (`eliminarPeriodo` y `actualizarPeriodo` existen en el servicio, l.80-97 y 173-183, y ningún botón las llama; `Trash2` y `Edit` se importan sin usar, l.5), ni cierre contable real.

### E.11 Reglas contables `/app/finanzas/reglas-contables` — `reglas-contables/ReglasContablesPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(3)` | Carga | `isLoading` | ReglasContablesPage.tsx:165-173 |
| 2 | texto | «Reglas Contables» / «Configuración de asientos automáticos» | Cabecera (**Settings** azul). Sin flecha de volver | Siempre | ReglasContablesPage.tsx:179-191 |
| 3 | campo | Select «Filtrar origen» (160 px): «Todos los orígenes» + los **13** de `SOURCE_TYPES` | Filtro cliente | Siempre | ReglasContablesPage.tsx:194-207 · ReglasContablesService.ts:32-46 |
| 4 | botón | «Nueva Regla» (Plus, azul) | Abre el diálogo #14 | Siempre | ReglasContablesPage.tsx:209-212 |
| 5 | stat | «Total Reglas» · «Reglas Activas» (verde) · «Reglas Inactivas» (gris) | Conteos | Siempre | ReglasContablesPage.tsx:217-245 |
| 6 | texto | «Lista de Reglas» + «{n} reglas encontradas» | Cabecera | Siempre | ReglasContablesPage.tsx:251-254 |
| 7 | columna | «Nombre» · «Origen» · «Evento» · «Débito» · «Crédito» · «Estado» · «Acciones» | 7 columnas; **las filas inactivas a `opacity-50`** | Siempre | ReglasContablesPage.tsx:261-267, 272 |
| 8 | badge | «Origen» → etiqueta en español o **valor crudo** (`folio_item`, `parking_session`…) | `Badge variant="outline"` | Por fila | ReglasContablesPage.tsx:157, 276-280 |
| 9 | columna | «Evento» → etiqueta en español o valor crudo (`no_show`, `delivered_cod`…) | — | Por fila | ReglasContablesPage.tsx:158, 281-283 |
| 10 | columna | «Débito» / «Crédito» → **solo el código de cuenta** en `text-xs`, sin el nombre | `getAccountName` está definido y **nunca se usa** (l.159) | Por fila | ReglasContablesPage.tsx:284-289 |
| 11 | badge | «Activa» (verde) / «Inactiva» (gris) | `is_active` | Por fila | ReglasContablesPage.tsx:290-295 |
| 12 | botón | (Edit, ghost sm) · (Copy, ghost sm) · (Power/PowerOff, ghost sm) · (Trash2, ghost sm, rojo) | Editar · Duplicar (**siempre falla**, §H) · Alternar activa **sin confirmación** · `confirm('¿Estás seguro de eliminar esta regla?')` | Por fila | ReglasContablesPage.tsx:298-309, 126-155 |
| 13 | diálogo | «Nueva Regla Contable» / «Configura la regla para generar asientos automáticos» — o «Editar Regla» (`max-w-2xl`, cuerpo `max-h-[60vh]`) | Alta/edición | #4 / #12 | ReglasContablesPage.tsx:322-331 |
| 14 | campo | «Nombre *» (placeholder «Ej: Venta con IVA») | Texto | En el diálogo | ReglasContablesPage.tsx:333-339 |
| 15 | campo | «Descripción» → `RichTextEditor` (placeholder «Descripción de la regla...», `minHeight={60}`) | **Guarda HTML** | En el diálogo | ReglasContablesPage.tsx:343-350 |
| 16 | campo | «Origen *» (Select, placeholder «Seleccionar origen») — 13 opciones | — | En el diálogo | ReglasContablesPage.tsx:355-368 |
| 17 | campo | «Evento *» (Select, placeholder «Seleccionar evento») — «Creación» · «Pago» · «Pago Parcial» · «Anulación» · «Confirmación» · «Cancelación» · «Reembolso» · «Ajuste» | 8 opciones | En el diálogo | ReglasContablesService.ts:48-57 |
| 18 | texto | Recuadro azul: ArrowLeftRight + «Cuentas Contables» | Agrupador visual | En el diálogo | ReglasContablesPage.tsx:388-392 |
| 19 | campo | «Cuenta Débito *» / «Cuenta Crédito *» (Select, placeholder «Seleccionar cuenta», `max-h-60`) | Lista plana de cuentas activas | En el diálogo | ReglasContablesPage.tsx:395-428 |
| 20 | campo | «Cuenta IVA (opcional)» (Select, placeholder «Seleccionar cuenta de IVA», primera opción «Sin cuenta de IVA») | Cuenta de impuesto | En el diálogo | ReglasContablesPage.tsx:434-450 |
| 21 | toggle | Switch «Usar IVA del documento» | `use_tax_from_document` | En el diálogo | ReglasContablesPage.tsx:453-459 |
| 22 | campo | «Prioridad» (`type=number`) + ayuda «Menor número = mayor prioridad» | `priority`, 0 por defecto | En el diálogo | ReglasContablesPage.tsx:461-472 |
| 23 | botón | «Cancelar» / «Crear Regla» / «Guardar Cambios» (azul, spinner) | — | En el diálogo | ReglasContablesPage.tsx:475-481 |
| 24 | toast | «Error al cargar los datos» / «Completa todos los campos requeridos» / «Regla creada exitosamente» / «Regla actualizada exitosamente» / «Error al guardar la regla» / «Regla duplicada exitosamente» / «Error al duplicar la regla» / «Regla desactivada» / «Regla activada» / «Error al cambiar estado» / «Regla eliminada exitosamente» / «Error al eliminar la regla» | — | — | ReglasContablesPage.tsx:58 · 102 · 113 · 110 · 120 · 129 · 132 · 139 · 142 · 150 · 153 |

Verificado en BD: `accounting_rules` tiene además `discount_account_code` (**sin campo en el formulario**) y `conditions jsonb` (sin UI), y los CHECK admiten **34 orígenes y 25 eventos** frente a los 13 y 8 que ofrece la UI: las reglas sembradas para PMS, parqueaderos, transporte, nómina o membresías **existen, se listan con el código crudo y no se pueden crear ni reproducir desde esta pantalla** (y al editarlas el Select aparece vacío y se pierde el valor si se guarda). UNIQUE `(organization_id, source_type, event_type, priority)`. **No existe**: probar la regla (el icono `Play` se importa, l.5, y no hay botón), ver los asientos generados, columnas de prioridad o IVA en la tabla, filtro por evento o estado, orden manual ni permisos.

### E.12 Centro de costos `/app/finanzas/centro-costos` — `centro-costos/CentroCostosPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(3)` | Carga | `isLoading` | CentroCostosPage.tsx:69-77 |
| 2 | texto | «Centro de Costos» / «Clasificacion de gastos por departamento» (**sin tilde**) | Cabecera (**Building2 naranja**; el hub anuncia LayoutGrid). Sin flecha de volver | Siempre | CentroCostosPage.tsx:82-90 |
| 3 | botón | «Nuevo» (Plus, azul) | Abre el diálogo #7 | Siempre | CentroCostosPage.tsx:91-93 |
| 4 | texto | «{n} centros» | **El único título de la tarjeta es el contador** | Siempre | CentroCostosPage.tsx:97 |
| 5 | estado | «No hay centros de costos registrados» | Vacío | — | CentroCostosPage.tsx:99-101 |
| 6 | texto | Código monoespaciado (w-20) + nombre (`flex-1`) | **Lista plana, sin jerarquía** | Por centro | CentroCostosPage.tsx:104-106 |
| 7 | badge | «Inactivo» (texto xs rojo, sin píldora) | Si `is_active === false` | Por centro | CentroCostosPage.tsx:107 |
| 8 | botón | (Edit, ghost 32×32) · (Trash2, ghost 32×32, rojo) | Editar · `confirm('Eliminar este centro de costos?')` (**sin «¿»**) | Por centro | CentroCostosPage.tsx:108-113, 58-67 |
| 9 | diálogo | «Nuevo Centro de Costos» / «Editar Centro de Costos» (sin descripción) | Alta/edición | #3 / #8 | CentroCostosPage.tsx:121-123 |
| 10 | campo | «Codigo *» (**sin tilde**, monoespaciado, `disabled` al editar, **sin placeholder**) | UNIQUE con la organización | En el diálogo | CentroCostosPage.tsx:126-128 |
| 11 | campo | «Nombre *» (sin placeholder) | Texto | En el diálogo | CentroCostosPage.tsx:130-131 |
| 12 | toggle | Switch «Activo» | `is_active`, activado por defecto | En el diálogo | CentroCostosPage.tsx:133-136 |
| 13 | botón | «Cancelar» (outline) / «Guardar» (azul) | **Sin spinner ni `disabled`: permite doble envío** | En el diálogo | CentroCostosPage.tsx:139-140 |
| 14 | toast | «Error al cargar centros de costos» / «Codigo y nombre son requeridos» / «Centro de costo actualizado» / «Centro de costo creado» / «Error al guardar» / «Eliminado» / «Error al eliminar» | — | — | CentroCostosPage.tsx:31 · 39 · 46 · 49 · 54 · 63 · 65 |

`cost_centers` tiene `parent_id uuid` y el `formData` lo arrastra (l.20, 43), pero **no hay ningún campo en el diálogo**: siempre se guarda `null` y la jerarquía es inalcanzable. **No existe**: KPIs, buscador, filtro por activo/inactivo, árbol, gasto acumulado por centro (`journal_lines.cost_center_id` existe y nadie lo consulta aquí), exportación, paginación ni orden.

### E.13 Activos fijos `/app/finanzas/activos-fijos` — `activos-fijos/ActivosFijosPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(3)` | Carga | `isLoading` | ActivosFijosPage.tsx:63-71 |
| 2 | texto | «Activos Fijos» / «Gestion y depreciacion de activos» (**sin tildes**) | Cabecera (Package **teal**; el hub lo anuncia verde). Sin flecha de volver | Siempre | ActivosFijosPage.tsx:76-84 |
| 3 | botón | «Nuevo Activo» (Plus, azul) | Abre el diálogo #10 | Siempre | ActivosFijosPage.tsx:85-87 |
| 4 | stat | «Total Activos» · «Valor Adquisicion» · «Depreciacion Acum.» · «Valor Actual» (**las 3 últimas sin tilde**) | Sumas en cliente | Siempre | ActivosFijosPage.tsx:91-94 |
| 5 | texto | «Listado de Activos» | Cabecera de la tabla | Siempre | ActivosFijosPage.tsx:98 |
| 6 | estado | «No hay activos fijos registrados» | Vacío | — | ActivosFijosPage.tsx:100-101 |
| 7 | columna | «Codigo» · «Nombre» · «Tipo» · «Estado» · «Costo» · «Deprec. Acum.» · «Valor Actual» · «Deprec./Mes» + columna de acciones sin rótulo | **9 columnas**, `<table>` nativa con `overflow-x-auto` | Con datos | ActivosFijosPage.tsx:106-116 |
| 8 | columna | «Tipo» → «Edificio» · «Vehiculo» · «Equipo» · «Mobiliario» · «Computo» · «Software» · «Terreno» · «Otro» (**todas sin tilde**) | `ASSET_TYPES` | Por fila | FixedAssetService.ts:43-52 |
| 9 | badge | «Activo» (verde) / «Dado de Baja» (rojo) / «Totalmente Depreciado» (gris) / «Vendido» (azul) | `STATUS_LABELS` | Por fila | ActivosFijosPage.tsx:20-25, 127 |
| 10 | cálculo | «Deprec./Mes» → `(costo − rescate) / vida útil en meses`; **0 si el método no es línea recta** | En cliente, no se persiste | Por fila | FixedAssetService.ts:110-115 |
| 11 | botón | (Edit, ghost 32×32) · (Trash2, ghost 32×32, rojo, `confirm('Eliminar este activo?')`) | Editar / borrar | Por fila | ActivosFijosPage.tsx:134-135, 57-61 |
| 12 | diálogo | «Nuevo Activo Fijo» / «Editar Activo Fijo» (`max-w-2xl`, sin descripción) | Alta/edición | #3 / #11 | ActivosFijosPage.tsx:148-150 |
| 13 | campo | «Codigo *» (monoespaciado, `disabled` al editar) + «Tipo *» (Select, 8 opciones, «Equipo» por defecto) | Fila de 2 columnas | En el diálogo | ActivosFijosPage.tsx:153-154 |
| 14 | campo | «Nombre *» + «Descripcion» (**sin tilde**, Input de una línea) | — | En el diálogo | ActivosFijosPage.tsx:156-157 |
| 15 | campo | «Fecha Adquisicion *» (`type=date`, hoy en UTC) + «Costo Adquisicion *» (`type=number`) | Fila de 2 columnas | En el diálogo | ActivosFijosPage.tsx:159-160, 34 |
| 16 | campo | «Valor Rescate» + «Vida Util (meses)» (12 por defecto) + «Metodo Dep.» (Select «Linea Recta» / «Saldo Decreciente» / «Unidades de Produccion», **sin tildes**) | Fila de 3 columnas | En el diálogo | ActivosFijosPage.tsx:163-165 · FixedAssetService.ts:54-58 |
| 17 | botón | «Cancelar» / «Guardar» (azul, **sin spinner ni `disabled`**) | — | En el diálogo | ActivosFijosPage.tsx:169-170 |
| 18 | toast | «Error al cargar activos» / «Codigo y nombre requeridos» / «Activo actualizado» / «Activo creado» / «Error al guardar» / «Eliminado» / «Error al eliminar» | — | — | ActivosFijosPage.tsx:43 · 48 · 51 · 52 · 54 · 59 · 60 |

Al crear fija `current_value = acquisition_cost`, `accumulated_depreciation = 0`, `status='active'` (`FixedAssetService.ts:84-86`). **No existe**: corrida de depreciación — nada actualiza jamás `accumulated_depreciation` ni `current_value`, así que los KPIs se quedan en 0 y en el costo para siempre —, asiento de depreciación, baja o venta (los estados «Dado de Baja», «Totalmente Depreciado» y «Vendido» **son inalcanzables desde la UI**), asignación de las cuentas contables ni del centro de costo (las cuatro columnas existen en BD y en `FixedAssetInput`, l.37-40, **sin campos**), buscador, filtros, exportación, detalle ni calendario de depreciación.

### E.14 Presupuestos `/app/finanzas/presupuestos` — `presupuestos/PresupuestosPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(3)` | Carga | `isLoading` | PresupuestosPage.tsx:64-72 |
| 2 | texto | «Presupuestos» / «Planificacion y control financiero» (**sin tilde**) | Cabecera (Target **cian**; el hub lo anuncia azul). Sin flecha de volver | Siempre | PresupuestosPage.tsx:77-85 |
| 3 | botón | «Nuevo Presupuesto» (Plus, azul) | Abre el diálogo #10 | Siempre | PresupuestosPage.tsx:86-88 |
| 4 | texto | «Presupuestos» | Título de la columna maestra (`md:col-span-1`) | Siempre | PresupuestosPage.tsx:93 |
| 5 | estado | «No hay presupuestos» | Lista vacía | — | PresupuestosPage.tsx:95-96 |
| 6 | botón | Fila clicable: nombre + «{año} \| {importe}»; fondo azul claro si seleccionada | Carga las líneas | Por presupuesto | PresupuestosPage.tsx:99-104, 46-50 |
| 7 | badge | `draft` (gris) · `approved` (azul) · `active` (verde) · `closed` (rojo) | **Estados crudos en inglés** | Por presupuesto | PresupuestosPage.tsx:23-28, 105 |
| 8 | botón | (Trash2, ghost 32×32, rojo, con `stopPropagation`) | `confirm('Eliminar este presupuesto?')` → `DELETE` | Por presupuesto | PresupuestosPage.tsx:106, 58-62 |
| 9 | texto | «Seleccione un presupuesto» — o «Lineas - {nombre}» (**sin tilde**) | Título del panel derecho (`md:col-span-2`) | Siempre | PresupuestosPage.tsx:115 |
| 10 | estado | «Seleccione un presupuesto para ver sus lineas» / «No hay lineas en este presupuesto» | Vacíos | — | PresupuestosPage.tsx:117-120 |
| 11 | columna | «Cuenta» · «Periodo» (centrada) · «Planificado» · «Real» · «Varianza» | 5 columnas, `<table>` nativa | Con líneas | PresupuestosPage.tsx:125-131 |
| 12 | columna | «Periodo» → «P{n}» (P1…P12) | Mes | Por línea | PresupuestosPage.tsx:137 |
| 13 | cálculo | «Varianza» **verde si ≥ 0, rojo si < 0** | Se lee de la columna generada `variance` | Por línea | PresupuestosPage.tsx:140 |
| 14 | diálogo | «Nuevo Presupuesto» (sin descripción) + «Nombre *» + «Año Fiscal *» (`type=number`) + «Cancelar» / «Crear» (**sin spinner ni `disabled`**) | Alta con `status='draft'` | #3 | PresupuestosPage.tsx:151-160 |
| 15 | toast | «Error al cargar presupuestos» / «Error al cargar lineas» / «Nombre requerido» / «Presupuesto creado» / «Error al crear» / «Eliminado» / «Error al eliminar» | — | — | PresupuestosPage.tsx:42 · 49 · 53 · 54 · 55 · 60 · 61 |

Layout maestro-detalle `grid md:grid-cols-3` (1 + 2); por debajo de `md` las dos tarjetas se apilan. **No existe**: **ninguna forma de crear, editar o borrar una línea presupuestal desde la UI** (`upsertLine` y `deleteLine` existen en el servicio, l.96-117, y nadie las llama: un presupuesto recién creado no puede llenarse), aprobación ni cambio de estado (los cuatro estados del CHECK son inalcanzables salvo `draft`), recálculo de `total_amount` (se crea en 0 y nunca se actualiza), carga de la ejecución real desde `journal_lines` (`actual_amount` y `variance` se quedan en 0), edición, exportación, filtro por año ni gráfico presupuesto-vs-real.

### E.15 Las dos pantallas de periodos están duplicadas

Ambas leen y escriben **la misma tabla `fiscal_periods`**, con servicios independientes y el mismo tipo `FiscalPeriod` declarado dos veces **con enums distintos**.

| | `/contabilidad/periodos-fiscales` (E.9) | `/periodos-contables` (E.10) |
|---|---|---|
| Componente | `PeriodosFiscalesPage.tsx` (295 l.) | `PeriodosContablesPage.tsx` (427 l.) |
| Servicio | `PeriodosFiscalesService.ts` (141 l.) | `PeriodosContablesService.ts` (184 l.) |
| Título | «Períodos Fiscales» (con tilde) | «Periodos Contables» (sin tilde) |
| Enlazada desde | Menú, hub, `moduleConfig`, `modulePages` | **Nada: ruta huérfana** |
| Presentación | Rejilla de tarjetas | KPIs + tabla de 7 columnas |
| `status` en el tipo | `'open' \| 'closed' \| 'locked'` (l.12) | `'open' \| 'closing' \| 'closed'` (l.12) — **coincide con el CHECK real** |
| `period_type` en el tipo | `'monthly' \| 'quarterly' \| 'annual'` — **`annual` no existe en BD** | `'monthly' \| 'quarterly' \| 'yearly'` — correcto |
| Generar | Mensual **o** anual (la anual falla) | Solo los 12 meses del año |
| Alta unitaria | No (el servicio la tiene, sin UI) | Sí, con año + mes |
| Cerrar | Con **notas**, **sin `closed_by`** | **Sin notas**, con `closed_by` |
| Bloquear | Sí (roto) | No |
| Filtro por año / KPIs | No / No | Sí / 3 |

Para el diseño: **maquetar una sola pantalla**, la del listado con KPIs, filtro por año y tabla (E.10), pero con el enum real (`open`/`closing`/`closed`), notas de cierre y columna «Cerrado por» con el usuario. E.9 y la ruta `/periodos-contables` deberían desaparecer.

---

## F. Configuración y otros

### F.0 La navegación del módulo: tres listas cableadas

**El menú de Finanzas no sale de `organization_modules`.** `organization_modules` decide si el
módulo entero aparece; `organization_module_pages` filtra qué entradas de una **lista cableada** se
muestran. Y esa lista está escrita tres veces.

| Fuente | Entradas | Quién la consume | Archivo:línea |
|---|---|---|---|
| **A. Submenú del sidebar** | 28, en español duro | `SidebarNavigation` → `NavSection` y `SubMenuPanel` | `components/app-layout/Sidebar/SidebarNavigation.tsx:167-197` |
| **B. Catálogo para `organization_module_pages`** | 28, **idénticas byte a byte a A** | `moduleManagementService.activateModule` → `activateAllModulePages` | `lib/config/modulePages.ts:41-71` · `lib/services/moduleManagementService.ts:301-308, 594-608` |
| **C. `moduleSubroutes.finance`** | **18**, con etiquetas divergentes | Solo `components/layout/DynamicSidebar.tsx` y `sidebar/ModuleItem.tsx` — **`DynamicSidebar` no lo importa nadie: huérfano** | `config/moduleConfig.ts:145-164` |

Divergencias de C frente a A/B: «Facturas de Venta» vs «Facturas de venta», «Métodos de Pago» vs
«Métodos de pago», «Balance de Comprobacion» (**sin tilde**) vs «Balance de Comprobación», y añade
«Finanzas» → `/app/finanzas` como primera entrada.

Las 28 entradas de la lista A = B, todas en `SidebarNavigation.tsx:168-196` y `modulePages.ts:42-70`:

| # | Etiqueta exacta | Ruta | Icono |
|---|---|---|---|
| 0 | «Gestión» (sección, i18n `nav.sectionManagement`) | — | — |
| 0b | «Finanzas» (i18n `nav.finance`), `moduleCode:'finance'`, href padre **`/app/finanzas/facturas-venta`** | — | FileText |
| 1 | «Facturas de venta» | `/app/finanzas/facturas-venta` | FileText |
| 2 | «Cotizaciones» | `/cotizaciones` | ClipboardList |
| 3 | «Facturas de compra» | `/facturas-compra` | Receipt |
| 4 | «Notas de crédito» | `/notas-credito` | FileText |
| 5 | «Ingresos» | `/ingresos` | TrendingUp |
| 6 | «Egresos» | `/egresos` | TrendingDown |
| 7 | «Transferencias» | `/transferencias` | ArrowLeftRight |
| 8 | «Cuentas por cobrar» | `/cuentas-por-cobrar` | DollarSign |
| 9 | «Saldos a favor» | `/saldos-a-favor` | DollarSign (repetido) |
| 10 | «Cuentas por pagar» | `/cuentas-por-pagar` | CreditCard |
| 11 | «Bancos» | `/bancos` | Building2 |
| 12 | «Contabilidad» | `/contabilidad` | Calculator |
| 13 | «Plan de Cuentas» | `/contabilidad/plan-cuentas` | ListChecks |
| 14 | «Asientos» | `/contabilidad/asientos` | FileText (repetido) |
| 15 | «Balance de Comprobación» | `/contabilidad/balance-comprobacion` | BarChart3 |
| 16 | «Estado de Resultados» | `/contabilidad/estado-resultados` | TrendingUp (repetido) |
| 17 | «Balance General» | `/contabilidad/balance-general` | Calculator (repetido) |
| 18 | «Mayor Contable» | `/contabilidad/mayor-contable` | BookOpen |
| 19 | «Reglas Contables» | `/reglas-contables` | Shield |
| 20 | «Períodos Fiscales» | `/contabilidad/periodos-fiscales` | CalendarClock |
| 21 | «Centro de Costos» | `/centro-costos` | LayoutGrid |
| 22 | «Activos Fijos» | `/activos-fijos` | Package |
| 23 | «Presupuestos» | `/presupuestos` | Target |
| 24 | «Facturación Electrónica» | `/facturacion-electronica` | Zap |
| 25 | «Documentos Soporte» | `/documentos-soporte` | FileCheck2 |
| 26 | «Impuestos» | `/impuestos` | Percent |
| 27 | «Monedas» | `/monedas` | Globe |
| 28 | «Métodos de pago» | `/metodos-pago` | CreditCard (repetido) |
| 29 | «Comisiones» | `/comisiones` | HandCoins |

Controles del contenedor: cabecera azul «Finanzas» del `SubMenuPanel` (`SubMenuPanel.tsx:375-377`),
botón (icono PanelLeftClose) / «Abrir panel de submenú» (`aria-label`) (`SubMenuPanel.tsx:381-387`,
`AppLayout.tsx:1526-1530`), pie «{n} opciones» (`SubMenuPanel.tsx:438`). Si tras filtrar por
`organization_module_pages` y por cargo queda **una sola** página, el módulo deja de tener submenú y
pasa a ser un enlace directo (`SidebarNavigation.tsx:505-512`); el panel no se muestra con ≤1
páginas (`AppLayout.tsx:1501-1509`).

Resolución de visibilidad: (1) `activeModuleCodes.includes('finance')` de `organization_modules`
(`SidebarNavigation.tsx:479`); (2) `jobPositionVisibleModules`, `null` = sin restricción (`:481-483`);
(3) `activeModulePages['finance']`, **`undefined` = todas activas**, `[]` = ninguna (`:492-497`);
(4) `jobPositionVisiblePages` (`:500-502`).

**Defectos de la navegación** (para el diseño: el menú de 28 entradas en una sola columna `w-56` es
el problema de usabilidad más visible del módulo):

| # | Hallazgo | Archivo:línea |
|---|---|---|
| N-a | Tres listas cableadas del mismo módulo (28 / 28 / 18), una huérfana. CRM ya lo resolvió con fuente única (`config/crmNav.ts`, comentado en `SidebarNavigation.tsx:132-136`); Finanzas no | SidebarNavigation.tsx:167-197 · modulePages.ts:41-71 · moduleConfig.ts:145-164 |
| N-b | **Rutas existentes sin entrada ni enlace entrante en toda la app**: `/reportes`, `/periodos-contables`, `/open-finance` (+`/consents`), `/payfac/cuentas`, `/payfac/dispersiones`. `bancos/tesoreria` y `bancos/anomalias` solo se alcanzan desde `open-finance`, que a su vez es inalcanzable | verificado con `grep` global |
| N-c | `/conciliacion-bancaria` no está en el menú: solo se llega desde «Bancos» | BancosPage.tsx:116, 133 |
| N-d | Dos pantallas de periodos coexisten (§E.15) | modulePages.ts:61 · `components/finanzas/periodos-contables/` |
| N-e | El href padre apunta a `/app/finanzas/facturas-venta`, no a `/app/finanzas`; y `/app/finanzas` ya no es un hub, es un redirector (§A.0). Aun así **todas** las cabeceras de Finanzas ponen ahí su flecha «atrás» | SidebarNavigation.tsx:164 · `app/app/finanzas/page.tsx:9-11` |
| N-f | Menú a medio traducir: la sección y el módulo usan `t('sectionManagement')` / `t('finance')`; las 28 hijas son literales en español | SidebarNavigation.tsx:119, 163 vs 168-196 |
| N-g | Iconos repetidos entre entradas distintas (FileText ×3, DollarSign ×2, CreditCard ×2, Calculator ×2, TrendingUp ×2): el icono deja de ser pista visual en una lista de 28 | SidebarNavigation.tsx:168-196 |
| N-h | `SubMenuPanel` está comentado como «Multi-Column» pero es una sola columna `w-56`: 28 entradas en scroll vertical | AppLayout.tsx:1488 · SubMenuPanel.tsx:362, 391 |

### F.1 Impuestos `/app/finanzas/impuestos` — `components/finanzas/impuestos/*`

La sección E.2 de la auditoría de productos/POS ya inventarió 22 controles de esta pantalla. Aquí va
la tabla completa; **★ marca lo que aquella omitió**.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 ★ | texto | «Gestión de Impuestos \| Finanzas» | `metadata.title` | Pestaña del navegador | `app/app/finanzas/impuestos/page.tsx:7` |
| 2 ★ | botón | (icono ArrowLeft) | `Link` a `/app/finanzas`, que es un **redirector**, no un hub | Siempre | `components/finanzas/impuestos/TaxesIndexPage.tsx:15-19` |
| 3 ★ | texto | «Gestión de Impuestos» / «Finanzas / Impuestos» | Cabecera + **migaja falsa** (no navegable) | Siempre | TaxesIndexPage.tsx:25, 28 |
| 4 ★ | texto | «Impuestos de la Organización» | `CardTitle` | Siempre | `TaxesTable.tsx:229` |
| 5 | botón | «Nuevo Impuesto» | Abre `TaxForm` en alta | Siempre | TaxesTable.tsx:231-238 |
| 6 | campo | «Buscar impuestos...» | Filtro **en memoria** sobre `name`, `description` y `formatPercent(rate)` | Siempre | TaxesTable.tsx:246, 167-171 |
| 7 ★ | botón | (icono RefreshCcw, **sin etiqueta ni `aria-label`**) | Recarga vía RPC `list_organization_taxes`; gira mientras `loading` | Siempre | TaxesTable.tsx:252-260 |
| 8 | columna | «Nombre» · «Tasa» · «Descripción» · «Estado» · «Predeterminado» · «Incluido en precio» · «Acciones» | Las columnas 3ª-6ª se ocultan por breakpoint (`md`, `lg`, `sm`, `sm`) | Siempre | TaxesTable.tsx:267-273 |
| 9 ★ | estado | «Cargando impuestos...» | Spinner en `colSpan=7` | `loading` | TaxesTable.tsx:282 |
| 10 ★ | estado | «No hay impuestos disponibles» + botón «Crear nuevo impuesto» | Vacío con CTA | 0 resultados | TaxesTable.tsx:290, 298 |
| 11 | badge | `formatPercent(rate)` → **«19.00%»**, no «19%» | E.2 lo describía como `{rate}%`: son 2 decimales fijos | Por fila | TaxesTable.tsx:313 · `utils/Utils.ts:138-141` |
| 12 | badge | «Incluido» (junto a la tasa) | `tax_included` | Por fila | TaxesTable.tsx:320 |
| 13 | texto | «-» | Descripción vacía | Por fila | TaxesTable.tsx:325 |
| 14 | toggle | «Activo» / «Inactivo» | `update` directo **saltándose la RPC y sin filtro `organization_id`** | Por fila, ≥`lg` | TaxesTable.tsx:328-335, 140-143 |
| 15 | badge | «Predeterminado» (ámbar) / «-» | `is_default` | Por fila, ≥`sm` | TaxesTable.tsx:344, 346 |
| 16 | badge | «Incluido» (verde) / «-» | `tax_included` | Por fila, ≥`sm` | TaxesTable.tsx:354, 356 |
| 17 | botón | (icono Pencil) / (icono Trash2) | Editar / eliminar; **sin `aria-label` ni tooltip** | Por fila | TaxesTable.tsx:360-375 |
| 18 ★ | paginación | «Mostrando {a} a {b} de {n} impuestos» / «{a}-{b} de {n}» | Escritorio / móvil | Con resultados | TaxesTable.tsx:390, 393 |
| 19 ★ | campo | «Filas» + 5 / 10 / 15 / 20 | `itemsPerPage` | Ídem | TaxesTable.tsx:398-413 |
| 20 ★ | paginación | «Página anterior» / «Página siguiente» (`sr-only`) + números | **Lee `window.innerWidth` dentro del render** (riesgo de hidratación) | Ídem | TaxesTable.tsx:417-463, 430 |
| 21 ★ | toast | «Advertencia» / «No se encontró una organización activa.» | Sin organización en `localStorage` | Al montar | TaxesTable.tsx:74-76 |
| 22 ★ | toast | «Error» / «No se pudieron cargar los impuestos. Intente de nuevo.» | Fallo de la RPC | — | TaxesTable.tsx:128-130 |
| 23 ★ | toast | «Éxito» / «Impuesto activado correctamente.» · «desactivado correctamente.» · «No se pudo actualizar el estado del impuesto.» | Toggle #14 | — | TaxesTable.tsx:153-154, 160 |
| 24 | diálogo | «Nuevo Impuesto» / «Editar Impuesto» | — | — | `TaxForm.tsx:251` |
| 25 | texto | «ℹ️ **Plantillas sugeridas:** Se muestran automáticamente los impuestos configurados para su país de operación. Puede usar una plantilla o crear un impuesto personalizado.» | — | Alta con plantillas | TaxForm.tsx:257-260 |
| 26 | toggle | checkbox «Usar plantilla de impuesto» | **Se auto-activa** si hay plantillas | Alta | TaxForm.tsx:268-276, 84-86 |
| 27 | campo | «Plantillas de Impuestos Disponibles» + `({templates[0].country})` | **El país mostrado es el de la primera plantilla**, no el de la organización | Alta + #26 | TaxForm.tsx:282-287 |
| 28 | campo | `<select>` **nativo**: «Seleccionar plantilla del país» · «{name} - {rate}% ({description})» | Rompe el kit shadcn del resto de la app | Alta + #26 | TaxForm.tsx:297-309 |
| 29 ★ | texto | «Se muestran solo las plantillas específicas para su país de operación» | **Falso si la RPC falló**: el fallback carga `tax_templates` de todos los países | Alta + #26 | TaxForm.tsx:311 vs 91-98 |
| 30 | texto | «No hay plantillas de impuestos disponibles para su país» | Vacío | Sin plantillas | TaxForm.tsx:292 |
| 31 | campo | «Nombre *» (placeholder «Ej: IVA 19%») | `name` | Siempre | TaxForm.tsx:322, 329 |
| 32 | campo | «Tasa (%) *» (placeholder «Ej: 19») | `type="text"` + `replace(/[^0-9.]/g,'')`: **admite «1.2.3»** y `parseFloat` se queda con `1.2` | Siempre | TaxForm.tsx:335, 340-348 |
| 33 | campo | «Descripción» (placeholder «Descripción del impuesto») | — | Siempre | TaxForm.tsx:354, 361 |
| 34 | toggle | «Impuesto activo» · «Impuesto predeterminado» · «Impuesto incluido en el precio» | — | Siempre | TaxForm.tsx:373, 385, 397 |
| 35 | texto | «El precio del producto ya incluye este impuesto. No se sumará al total.» | Ayuda | `taxIncluded` | TaxForm.tsx:402 |
| 36 | botón | «Cancelar» / «Guardar» / «Guardando...» | **«Guardando...» es inalcanzable**: `setLoading(true)` no se llama nunca → el botón no se deshabilita y **el doble envío crea dos impuestos** | Pie | TaxForm.tsx:408-429, 64, 219 |
| 37 ★ | toast | «El nombre del impuesto es obligatorio.» / «La tasa debe estar entre 0 y 100%.» | La 2ª nunca dispara con tasa vacía (`NaN` pasa ambas comparaciones); lo salva `isFormValid()` en el `disabled` | Al guardar | TaxForm.tsx:164, 173, 154-156, 418 |
| 38 ★ | toast | «Impuesto creado correctamente.» / «Impuesto actualizado correctamente.» / «No se pudo guardar el impuesto. Intente de nuevo.» | — | Al guardar | TaxForm.tsx:204, 215 |
| 39 | diálogo | «Eliminar Impuesto» · «¿Está seguro de que desea eliminar el impuesto **{name}** ({formatPercent(rate)})?» · «Esta acción no se puede deshacer. El impuesto será eliminado permanentemente.» | RPC `delete_organization_tax` | Papelera | `DeleteTaxDialog.tsx:117-122` |
| 40 | botón | «Cancelar» / «Eliminar» / «Eliminando...» | Aquí sí funciona el estado de carga | Pie | DeleteTaxDialog.tsx:130-147 |
| 41 ★ | — | — | `checkTaxUsage()` (cuenta `product_tax_relations`) está **definida y nunca se llama**: no hay aviso «este impuesto está en N productos» | — | DeleteTaxDialog.tsx:38-52 |
| 42 ★ | — | — | `updateDefaultTax()` en `TaxForm` es **código muerto** (la RPC ya desmarca) | — | TaxForm.tsx:224-244 |
| 43 ★ | — | — | Import sin usar: `PlusCircle` | — | TaxesTable.tsx:14 |
| 44 | — | — | **Sigue sin existir**: tipo de tributo, exento, base, orden de aplicación, código DIAN propio, vigencia, cuenta contable, acción masiva, exportación y control de permisos | — | — |

### F.2 Monedas `/app/finanzas/monedas` — `components/finanzas/monedas/*`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Monedas & Tipo de Cambio» / «Finanzas / Monedas» | Cabecera; el «&» es el único de la app | Siempre | `app/app/finanzas/monedas/page.tsx:51, 54` |
| 2 | estado | «Cargando...» / «Obteniendo información de la organización» | Mientras resuelve la organización | Al entrar | page.tsx:29-30 |
| 3 | pestaña | «Monedas» · «Tasas de Cambio» · «Preferencias» · «Histórico» | `defaultValue="currencies"`; **no se refleja en la URL** | Siempre | page.tsx:65, 71, 77, 83 |
| 4 | texto | «Catálogo de Monedas» / «Tasas de Cambio» / «Preferencias de Moneda» / «Gráfico de Tendencia» | Títulos de tarjeta | Por pestaña | page.tsx:90, 101, 112, 125 |
| 5 | texto | «Monedas Disponibles» | **Título duplicado** dentro de «Catálogo de Monedas» | Pestaña 1 | `CurrencyTable.tsx:199` |
| 6 | botón | «Nueva Moneda» | Abre «Agregar Nueva Moneda» | Pestaña 1 | CurrencyTable.tsx:203, 208 |
| 7 | columna | «Código» · «Nombre» · «Símbolo» · «Decimales» · «Base» · «Auto» · «Acciones» | RPC `get_organization_currencies` | Pestaña 1 | CurrencyTable.tsx:231-237 |
| 8 | estado | «Cargando monedas...» / «No hay monedas disponibles.» | — | Pestaña 1 | CurrencyTable.tsx:245, 251 |
| 9 | botón | «Base» (deshabilitado) / «Establecer» | RPC `set_organization_base_currency` | Por fila | CurrencyTable.tsx:276 |
| 10 | toggle | Switch **sin etiqueta** (columna «Auto») | RPC `set_currency_auto_update` | Por fila, ≥`sm` | CurrencyTable.tsx:282-286 |
| 11 | botón | (icono Trash2) | Deshabilitado si es la moneda base | Por fila | CurrencyTable.tsx:291-299 |
| 12 | diálogo | `window.confirm('¿Está seguro de eliminar esta moneda? Esta acción no se puede deshacer.')` | **Confirm nativo**, no `AlertDialog` | Papelera | CurrencyTable.tsx:161 |
| 13 | toast | «Moneda base actualizada» · «Configuración actualizada» · «Moneda eliminada» · «No se puede eliminar la moneda base. Cambie la moneda base primero.» | — | — | CurrencyTable.tsx:94, 130, 177, 155 |
| 14 | campo | «Buscar moneda por código o nombre...» | Filtro en memoria | Diálogo de alta | `CurrencySelector.tsx:178, 97-103` |
| 15 | campo | «Seleccione una moneda» / «Seleccionar moneda» / «Monedas disponibles ({n})» / «{code} - {name} ({symbol})» | RPC `get_currency_templates` | Diálogo de alta | CurrencySelector.tsx:188, 204, 219, 226 |
| 16 | botón | «Actualizar» / «Reintentar» / «Cancelar» / «Añadir Moneda» / «Añadiendo...» | Alta con `p_is_base:false, p_auto_update:true` **fijos** | Diálogo de alta | CurrencySelector.tsx:171, 199, 242, 254, 133 |
| 17 | estado | «Cargando monedas...» / «No se encontraron monedas con esa búsqueda.» / «No hay plantillas de moneda disponibles para añadir.» / «No se encontraron monedas disponibles para añadir» | 4 vacíos distintos | Diálogo de alta | CurrencySelector.tsx:210, 214, 215, 63 |
| 18 | campo | `DatePicker` «Seleccionar fecha» / «Fecha» | Siempre con valor (hoy) | Pestaña 2 | `ExchangeRatesTable.tsx:900-903` |
| 19 | badge | «Moneda base:» {code} + «Base preferida» / «USD (fallback)» / «Primera disponible» / «Catálogo global» (móvil: «Base» / «USD» / «Primera» / «Global») | Verde / azul / naranja / morado | Pestaña 2 | ExchangeRatesTable.tsx:905, 919-929 |
| 20 | badge | «Datos de tasas:» · «Base:» · «Fuente:» + «API Automática» / «API Respaldo» / `{source}` | — | Con tasas | ExchangeRatesTable.tsx:942, 960, 966, 976-983 |
| 21 | texto | «**Información:** Las tasas se actualizan automáticamente cada día a las 2:00 AM UTC. Use "Sincronizar Ahora" solo si necesita datos más recientes.» | **Ningún botón se llama «Sincronizar Ahora»**: el que existe dice «Sincronizar Tasas» y solo aparece con la tabla vacía | Con tasas | ExchangeRatesTable.tsx:995-996 vs 1047 |
| 22 | columna | «Moneda» · «Código» · «Tasa» · «Tendencia» · «Histórico (5d)» | `rate.toFixed(6)` | Pestaña 2 | ExchangeRatesTable.tsx:1020-1024, 1069 |
| 23 | badge | «+{x}%» verde / «{x}%» rojo | Comparación con la fecha anterior disponible | ≥`md` | ExchangeRatesTable.tsx:1079-1087 |
| 24 | tooltip | `{rate.toFixed(6)}` + `dd/MM` | Sparkline SVG de 5 días — **una consulta por fila** | ≥`lg` | ExchangeRatesTable.tsx:154-170, 37-56 |
| 25 | estado | «No hay tasas de cambio disponibles para esta fecha» + «Sincronizar Tasas» / «Sincronizando...» | Vacío con CTA | 0 tasas | ExchangeRatesTable.tsx:1032, 1042, 1047 |
| 26 | toast | «Fecha futura» · «Sin tasas disponibles» · «Sin datos» · «Moneda base» · «Información» · «Mostrando tasas del {fecha} (última actualización disponible)» | **6 toasts distintos** según el caso | Pestaña 2 | ExchangeRatesTable.tsx:536, 601, 613, 461, 431, 568 |
| 27 | texto | «Conversor de Monedas» | Tarjeta embebida | Con tasas y monedas | `CurrencyConverter.tsx:407` |
| 28 | campo | «Monto» · «Monedas» · «Resultado» (cabeceras ≥`md`) · placeholder «Ingrese un monto» · `aria-label="Monto a convertir"` | Valor inicial **1000**, `step="100"` | Conversor | CurrencyConverter.tsx:420-422, 435, 438 |
| 29 | campo | Dos `Select` «Moneda» + botón de intercambio | Par inicial **cableado `USD`→`COP`** | Conversor | CurrencyConverter.tsx:447, 60-61 |
| 30 | cálculo | «1 {from} = {x} {to}» · resultado `{símbolo} {toLocaleString}` · «---» | `toLocaleString(undefined, …)` usa el locale del **navegador**, no `es-CO` | Conversor | CurrencyConverter.tsx:602, 495-498, 501 |
| 31 | badge | «% respecto a ayer:» + «+{x}%» / «{x}%» | Verde / rojo / gris | Si hay diferencia | CurrencyConverter.tsx:625, 635 |
| 32 | texto | «Última actualización: {dd/MM/yyyy}» · «Fuente: OpenExchangeRates API» + botón «Actualizar» | — | Conversor | CurrencyConverter.tsx:646, 655, 658 |
| 33 | texto | «Preferencias de Moneda» (**3.ª vez en la misma vista**) + «Las preferencias de moneda afectan a toda la organización. La moneda predeterminada se usará como respaldo cuando no se especifique una moneda base.» | — | Pestaña 3 | `CurrencyPreferences.tsx:313, 317` |
| 34 | campo | «Moneda Predeterminada» · «Seleccione moneda predeterminada» · «No hay monedas disponibles» + ayuda «Esta moneda se utilizará como respaldo cuando no exista una moneda base.» | Validación zod «Por favor seleccione una moneda predeterminada» | Pestaña 3 | CurrencyPreferences.tsx:328, 336, 342, 358, 58 |
| 35 | toggle | «Sincronización Automática de Tasas» + «Actualizar tasas de cambio automáticamente cada día usando OpenExchangeRates.» | Guarda `settings.auto_sync_exchange_rates`; **ningún proceso lo lee** (el cron es global) | Pestaña 3 | CurrencyPreferences.tsx:372, 375 · `app/api/cron/update-exchange-rates/route.ts` |
| 36 | botón | «Guardar Preferencias» / «Guardando...» | Escribe `organization_preferences.settings` **y** reescribe `organization_currencies.is_base` con 3 `update`/`insert` encadenados, **sin transacción** | Pestaña 3 | CurrencyPreferences.tsx:398, 403, 231-286 |
| 37 | toast | «Preferencias guardadas» / «La moneda base ha sido actualizada correctamente en todas las configuraciones.» | — | Pestaña 3 | CurrencyPreferences.tsx:290-291 |
| 38 | badge | «Histórico de Tasas de Cambio» + badge «OpenExchangeRates» | — | Pestaña 4 | `ExchangeRateHistory.tsx:237, 240` |
| 39 | botón | «Actualizar desde API» / «Actualizando...» · «Recargar» · «Exportar» | **3 botones para 2 acciones** | Pestaña 4 | ExchangeRateHistory.tsx:252, 256, 260 |
| 40 | campo | «Filtros:» · «Moneda:» + «Todas» · «Desde:» · «Hasta:» · «Limpiar filtros» | Filtro **en memoria** sobre 1000 filas | Pestaña 4 | ExchangeRateHistory.tsx:269, 273, 279, 288, 298, 318 |
| 41 | stat | «{code}» · «{n} registros» · valor · «Min: {x}» «Max: {x}» | **Solo las 4 primeras monedas** (`.slice(0,4)`), sin indicar que hay más | Pestaña 4 | ExchangeRateHistory.tsx:326, 333, 339-340 |
| 42 | columna | «Fecha Efectiva» · «Par» · «Tasa» · «Variación» · «Fuente» · «Registro» | Badge «API» / «Manual»; par «USD/COP» | Pestaña 4 | ExchangeRateHistory.tsx:360-365, 390, 417 |
| 43 | estado | «No hay registros de tasas de cambio» | Vacío | — | ExchangeRateHistory.tsx:353 |
| 44 | paginación | «Mostrando {a} a {b} de {n} registros» · «Filas» 10/25/50/100 · «...» | **El único componente de paginación extraído de todo el módulo** | Pestaña 4 | `ExchangeRateHistoryPagination.tsx:73, 81, 90, 126` |
| 45 | exportación | «Exportación completada» / «Se exportaron {n} registros»; CSV `tasas_cambio_{YYYY-MM-DD}.csv` con cabeceras «Fecha, Moneda Base, Moneda, Tasa, Fuente, Fecha Registro» | **Sin escapado de comas** | Pestaña 4 | ExchangeRateHistory.tsx:185-186, 181, 164, 175 |
| 46 | pestaña | «Gráfico Histórico» · «Logs de Actualización» | Sub-pestañas dentro de «Gráfico de Tendencia»: **4.º nivel de anidamiento** | Pestaña 4 | `ExchangeRatesChart.tsx:549, 550` |
| 47 | texto | «Evolución de Tasas - Últimos 30 días» | — | Sub-pestaña 1 | ExchangeRatesChart.tsx:558 |
| 48 | chip | «{n} monedas \| {code\|'ninguna'} seleccionada» | **Comentado en el código como «Estado de depuración» y visible en producción** (≥`sm`) | Sub-pestaña 1 | ExchangeRatesChart.tsx:559-562 |
| 49 | botón | «Actualizar tasas» / «Actualizando...» (`title="Actualizar tasas desde OpenExchangeRates API"`) | `<button>` crudo, no `Button` del kit | Sub-pestaña 1 | ExchangeRatesChart.tsx:566-581 |
| 50 | campo | «Seleccionar moneda» · «Monedas ({n})» · «No hay monedas disponibles» | **Sin preselección: el gráfico arranca vacío** | Sub-pestaña 1 | ExchangeRatesChart.tsx:592, 596, 603 |
| 51 | estado | «No hay datos históricos disponibles para {code}.» · «Posibles causas:» · «La moneda no tiene datos en la tabla **currency_rates**» · «No hay registros para los últimos 30 días» · «La moneda no está configurada para actualización automática» | **Expone el nombre de una tabla de la BD al usuario final** | Sin datos | ExchangeRatesChart.tsx:623-629 |
| 52 | botón | «Reintentar carga» / «Actualizar tasas» | Duplicados de #49 | Sin datos | ExchangeRatesChart.tsx:641, 654 |
| 53 | badge | «Base: {code}» · «Mostrando: {code}» | — | Con datos | ExchangeRatesChart.tsx:667, 672 |
| 54 | tooltip | «Fecha: {dd/MM/yy}» + «Tasa de cambio»; leyenda «Tasa de {code}» | Recharts | Con datos | ExchangeRatesChart.tsx:708-709, 715 |
| 55 | texto | «Histórico de Actualizaciones» + botón «Recargar logs» | — | Sub-pestaña 2 | ExchangeRatesChart.tsx:732, 737 |
| 56 | columna | «Fecha» · «Estado» · «Organizaciones» · «Detalles» — badge «Éxito» / «Error», celda «{ok}/{total}», texto «{n} organizaciones procesadas» | **Fuga entre inquilinos**: `exchange_rates_logs` no tiene `organization_id` y su política es `FOR SELECT USING (auth.role() = 'authenticated')` → cualquier cliente ve **cuántas organizaciones tiene la plataforma** | Sub-pestaña 2 | ExchangeRatesChart.tsx:750-753, 765-774, 423 · baseline:30555-30565, 58718 |
| 57 | estado | «No hay registros de actualizaciones disponibles.» · «Sin detalles» · «Formato de detalles no válido» | — | Sub-pestaña 2 | ExchangeRatesChart.tsx:743, 409, 425 |
| 58 | estado | «Error en el componente» + «Recargar página» (`window.location.reload()`) | Error de carga | — | ExchangeRatesChart.tsx:520, 528 |

Código muerto y defectos propios de Monedas: `handleFillRealData`, `syncRatesLegacy`,
`checkDailyDataAvailability`, `initData`, `dailyDataStatus` y `lastAutoUpdateInfo` (con su
`loadAutoUpdateInfo`, que consulta la BD en cada montaje) están definidos y **nunca se renderizan**
(`ExchangeRatesTable.tsx:215-249, 840-876, 256-283, 311-315, 253, 328-381`); los imports
`Calendar`, `Popover*`, `Input`, `CalendarIcon`, `Edit`, `Save`, `X`, `obtenerTasasDeCambio` y
`guardarTasasDeCambio` son restos de una **edición manual de tasas desaparecida** (hoy no hay forma
de corregir una tasa a mano) (`:6-7, 19-22`); `Pencil` sin usar en `CurrencyTable.tsx:16` (no hay
editar moneda); `ExchangeRateHistory` declara la prop `organizationId` y **nunca la usa** (`:50, 53`):
el histórico es global. **88 `console.log`** solo en `monedas/`. `currencies_select_policy … USING
(true)` sin restricción de rol deja el catálogo abierto a `anon` (baseline:58127).

### F.3 Reportes `/app/finanzas/reportes` — `components/finanzas/reportes/ReportesPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(3)` | **La pantalla real tiene 6 tarjetas**, no 4+3 | `isLoading` | ReportesPage.tsx:121-123 |
| 2 | texto | «Reportes Financieros» / «Hub de informes y análisis financiero» | Cabecera con flecha atrás a `/app/finanzas` | Siempre | ReportesPage.tsx:143, 146 |
| 3 | campo | «Período» + «Hoy» · «Esta semana» · «Este mes» · «Este trimestre» · «Este año» | El tipo `RangeOption` incluye `'custom'` pero **no hay selector de rango libre** | Siempre | ReportesPage.tsx:154, 46-50, 43 |
| 4 | cálculo | — | `getDateRange` usa `new Date()` local **sin la zona horaria de la organización**; solo `'today'` hace `setHours(0,0,0,0)` → «Esta semana/Este mes/trimestre/año» arrancan a la hora actual del día de inicio | Siempre | ReportesPage.tsx:53-81 |
| 5 | botón | «Actualizar» | Recarga | Siempre | ReportesPage.tsx:166 |
| 6 | stat | «Estado de Resultados (P&G)» / «Ingresos, costos y utilidades» · «Ingresos» · «Costos» · «Utilidad Neta» · «Margen: {x}%» | Verde/rojo según signo | Siempre | ReportesPage.tsx:185-212 |
| 7 | stat | «Flujo de Caja» / «Movimiento de efectivo» · «Ingresos» · «Egresos» · «Saldo Final» · «{n} mov. caja» «{n} trans. banco» | — | Siempre | ReportesPage.tsx:229-262 |
| 8 | stat | «Cartera» / «Cuentas por cobrar y pagar» · «Por Cobrar» · «Por Pagar» · «Vencida: {x}» · «{n} clientes» «{n} proveedores» | Aviso rojo solo si hay cartera vencida | Siempre | ReportesPage.tsx:279-306 |
| 9 | stat | «Impuestos» / **«IVA y retenciones»** · «IVA Recaudado» · «IVA Pagado» · «Saldo IVA» | **La descripción miente**: no hay ninguna retención en la tarjeta ni en el servicio | Siempre | ReportesPage.tsx:323, 326, 331, 337, 343 |
| 10 | cálculo | — | `getTaxReport` suma `invoice_sales.tax_total` − `invoice_purchase.tax_total` (excluye `void`) y devuelve `reteFuente: 0, reteICA: 0, reteIVA: 0` **cableados** | Siempre | `lib/services/reportesFinancierosService.ts:271-280, 39-46, 434` |
| 11 | stat | «Caja» / «Estado de cajas y arqueos» · «Total en Caja» · «Sesiones» «{n} abiertas» · «Mov. Hoy» · «Último arqueo: {fecha}» | Fecha vía `formatDate` **deprecada** | Siempre | ReportesPage.tsx:363-393 |
| 12 | stat | «Bancos» / «Cuentas y transacciones» · «Saldo Total» · depósitos/retiros · «{n} cuentas activas» «{n} transacciones» · «{n} reconciliaciones pendientes» | Aviso ámbar si hay pendientes | Siempre | ReportesPage.tsx:411-445 |
| 13 | botón | (icono Download ×6, **sin etiqueta ni `aria-label`**) | `handleExport` **solo lanza un toast** «Exportando» / «Generando reporte de {tipo}...». No genera ni descarga nada | 1 por tarjeta | ReportesPage.tsx:180, 224, 274, 318, 358, 406 · 111-116 |
| 14 | texto | «Accesos Rápidos» + «Facturas Venta» · «Facturas Compra» · «Ingresos» · «Egresos» · «CxC» · «CxP» | 6 enlaces cableados; «CxC»/«CxP» no aparecen en ninguna otra parte de la UI | Siempre | ReportesPage.tsx:456-494 |
| 15 | — | — | **La ruta `/app/finanzas/reportes` no está enlazada desde ningún sitio** (0 coincidencias fuera de su propio `page.tsx`). El componente sí se ve, pero embebido como sub-pestaña «Reportes» de `/app/inicio#finance` | — | `app/app/finanzas/reportes/page.tsx` · `FinanzasSection.tsx:28, 203, 207` |
| 16 | — | — | Consecuencia: dentro de esa pestaña el componente pinta **su propia cabecera de página completa** (`min-h-screen`, flecha «atrás», título y subtítulo) → **página dentro de página** | — | ReportesPage.tsx:129-149 |

---

## G. Impuestos: ampliación de la sección E de la auditoría de productos/POS

La sección E de `docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md` (líneas 1644-1780) cubre el
modelo de datos, la pantalla de configuración, el producto, el carrito del POS, el cobro, el ticket
y Factus, con 15 inconsistencias. **Aquí solo va lo que allí no está.** Lo omitido por E.2 sobre
`/app/finanzas/impuestos` está en §F.1 con ★; esto añade lo demás.

### G.1 Correcciones y matices a lo ya escrito

| # | Hallazgo | Archivo:línea |
|---|---|---|
| G-1 | El badge de tasa **no** es `{rate}%` (E.2 #4) sino `formatPercent(rate)` = **«19.00%»**; y el buscador compara contra esa cadena, así que escribir «19%» no encuentra nada | TaxesTable.tsx:313, 170 · `utils/Utils.ts:138-141` |
| G-2 | **Corrección a la matriz E.6**: `is_excluded` **sí** se escribe — en documentos soporte, derivado de `tax_rate === 0`, no como decisión del usuario | `documentos-soporte/SupportDocumentForm.tsx:358` |
| G-3 | El toggle «Activo» de la tabla (E.7 #14) además filtra **solo por `id`**, sin `organization_id`: depende íntegramente de RLS | TaxesTable.tsx:140-143 |
| G-4 | «Guardando...» del `TaxForm` es inalcanzable: `setLoading(true)` no existe → sin protección contra doble envío, y la RPC crearía **dos impuestos** | TaxForm.tsx:64, 219, 418-428 |
| G-5 | Tras guardar, la lista se refresca con `setTimeout(…, 500)` | TaxesTable.tsx:208-211 |
| G-6 | El país del selector de plantillas sale de `templates[0].country`, no de la organización; y si la RPC falla, el fallback carga plantillas de **todos los países** mientras el texto sigue prometiendo lo contrario | TaxForm.tsx:283-287, 91-98 vs 311 |

### G.2 Impuestos en facturas desde Finanzas (más allá de E.5 filas 8-10)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | «Resumen e Impuestos» | Cabecera del bloque | Nueva factura de venta | `facturas-venta/nueva-factura/ImpuestosFactura.tsx:417` |
| 2 | texto | «Subtotal:» + «(imp. incluidos)» | Base imponible | Ídem | ImpuestosFactura.tsx:423, 427 |
| 3 | texto | «Impuestos aplicables:» (minúscula) | En compra es «Impuestos Aplicables:» (mayúscula) | Ídem | ImpuestosFactura.tsx:436 vs `ImpuestosFacturaCompra.tsx:222` |
| 4 | texto | «Total Impuestos:» · «Total:» | Totales | Ídem | ImpuestosFactura.tsx:546, 560 |
| 5 | texto | «(incluye ${subtotal} + impuestos)» | Aviso ámbar **contradictorio**: solo se pinta cuando `taxIncluded` **y** hay líneas no incluidas | Ídem | ImpuestosFactura.tsx:563-566 |
| 6 | cálculo | — | Todos los importes con `` `$${x.toFixed(2)}` ``: **sin separador de miles y con punto decimal** («$1234567.89») en un ERP colombiano, mientras el resto usa `formatCurrency` | Ídem | ImpuestosFactura.tsx:425, 537, 548, 562 |
| 7 | — | — | El checkbox del impuesto **predeterminado** solo cambia estado local y **no llama a `onAppliedTaxesChange`**: el formulario padre nunca se entera de que se desmarcó | Ídem | ImpuestosFactura.tsx:395-406 |
| 8 | — | — | **32 `console.log`** volcando el cálculo línea a línea en producción («========== CÁLCULO DE TOTALES ==========», «• Base imponible ajustada…») | Ídem | ImpuestosFactura.tsx (fichero completo) |
| 9 | — | — | El cálculo vive en el **cuerpo del componente**, no en `useMemo`: se recalcula (y re-loguea) en cada render | Ídem | ImpuestosFactura.tsx:60-130 |
| 10 | — | — | `type OrganizationTax.id: number`, pero `organization_taxes.id` es **uuid** | Ídem | ImpuestosFactura.tsx:9 |
| 11 | texto | «Impuestos» · «Configurar» · «Configuración de Impuestos» | Popover de ajustes | Nueva factura de compra | ImpuestosFacturaCompra.tsx:170-206 |
| 12 | badge | «Estado:» + «Incluidos» / «No incluidos» | — | Ídem | ImpuestosFacturaCompra.tsx:232-236 |
| 13 | texto | «{n} impuesto(s) aplicado(s):» + «• {name} ({rate}%)» | **Nunca muestra el importe del impuesto**, solo cuáles se aplican | Ídem | ImpuestosFacturaCompra.tsx:245-255 |
| 14 | estado | «No hay impuestos configurados para esta organización» / «No hay impuestos seleccionados» | Dos vacíos distintos | Ídem | ImpuestosFacturaCompra.tsx:263-264 |
| 15 | cálculo | — | **Cuarto motor de impuestos**: la factura de compra llama a `calculateCartTaxes`, el motor del **carrito del POS** | Ídem | ImpuestosFacturaCompra.tsx:12-17, 118 |
| 16 | cálculo | — | **Asimetría que E.7 #6 no recoge**: compra consulta `organization_taxes` **sin** `tax_templates!inner`; venta **sí** lo usa → un impuesto personalizado (`template_id NULL`) aparece en la factura de compra y **no** en la de venta ni en cotizaciones | Ídem | ImpuestosFacturaCompra.tsx:203-209 vs ImpuestosFactura.tsx:365 |
| 17 | columna | «Impuesto» → «{tax_rate}%» / «N/A» + checkbox «Incluido» por línea | El literal del checkbox es «Incluido» | Ítems factura venta | `ItemsFactura.tsx:247, 356, 358, 375` |
| 18 | cálculo | — | Al cambiar `tax_code`/`tax_rate` de una línea se **pisa** su `tax_included` con el valor global | Ídem | ItemsFactura.tsx:148-151 |
| 19 | cálculo | — | **Sexta** estrategia de resolución del nombre del impuesto: `item.taxes?.name` → buscar en `organizationTaxes` por `id` **o** por `name` → «Impuesto {rate}%» → literal **«Impuesto»** | Detalle factura venta | `facturas-venta/id/ItemsDetalle.tsx:56-66, 80` |
| 20 | cálculo | — | Al **editar** una factura de venta se borran e insertan las filas de `invoice_applied_taxes` con **`tax_rate: 0` cableado** → se pierde la tasa del desglose por código | Editar factura venta | `facturas-venta/editar/EditarFacturaVenta.tsx:195-208` |
| 21 | cálculo | — | Totales del resumen con `Intl.NumberFormat('es-CO', { currency: currency \|\| 'COP' })`: **séptimo** formateador de dinero | Nueva factura venta / compra | `facturas-venta/nueva-factura/NuevaFacturaForm.tsx:1555` · `facturas-compra/nueva-factura/NuevaFacturaForm.tsx:721` |

### G.3 Retenciones: no existen como funcionalidad

Búsqueda exhaustiva de `withholding`, `retencion`, `retención`, `ReteFuente`, `ReteIVA`, `ReteICA`,
`rete_` en todo el repositorio. **Conclusión: hay cableado muerto en cinco sitios y ninguna UI.**

| # | Tipo | Hallazgo | Archivo:línea |
|---|---|---|---|
| R1 | esquema | `invoice_items.withholding_taxes jsonb DEFAULT '[]'` — **única columna transaccional de retención del ERP**. Sin `comment`, sin constraint de forma, sin índice | baseline:31600 |
| R2 | esquema | **Nadie la escribe.** Ninguno de los ~40 `insert` sobre `invoice_items` (POS, facturas venta/compra, cotizaciones, notas crédito, documentos soporte, devoluciones, pedidos, refunds web) la incluye → siempre queda en `[]` | verificado en todo `src/` |
| R3 | esquema | `payroll_slips.tax_withholding numeric(12,2) DEFAULT 0`; el servicio de nómina escribe literalmente `tax_withholding: 0, // TODO: Calcular retención en la fuente` | baseline:34865 · `lib/services/payrollCalculationService.ts:336` |
| R4 | esquema | `country_payroll_rules.tax_brackets jsonb` con comentario «Tabla de retención en la fuente en formato JSON» — **nunca se lee** en el cálculo | baseline:29296, 29329 |
| R5 | esquema | `dian_tributes.type CHECK IN ('product','customer','withholding')` — **sin ningún seed de filas `withholding`** en ninguna migración (el seed está solo en `docs/INTEGRACION_FACTUS_COLOMBIA.md:348-350`, nunca aplicado) | baseline:30009 |
| R6 | esquema | **No existe**: columna de retención en `invoice_sales`/`invoice_purchase`, tabla de conceptos/tarifas/bases, UVT, ciudades para ICA, ni tipificación de tributo en `organization_taxes` | — |
| R7 | UI | **Única UI real de retención del repositorio**: «Tabla de Retención en la Fuente (UVT)» en HRM › Reglas País, columnas «Desde UVT» · «Hasta UVT» · «Tarifa» · «Base UVT». Es **solo lectura** | `components/hrm/reglas-pais/RuleDetailModal.tsx:265, 272-275` |
| R8 | UI | «IVA y retenciones» en Reportes Financieros: **etiqueta falsa**, la tarjeta solo pinta IVA | ReportesPage.tsx:326 |
| R9 | UI | «Impuestos (IVA/Retenciones)» / «IVA generado, IVA descontable y retenciones del período» en el motor de reportes: las 4 métricas reales son «IVA Generado», «IVA Descontable», «IVA Neto», «Total Facturado» | `lib/services/reportes/modulos/finanzasReports.ts:439-440, 461-464` |
| R10 | UI | **0 coincidencias** de `rete\|retenc\|withhold` en `ImpuestosFactura.tsx` (573 líneas), `ImpuestosFacturaCompra.tsx`, `SupportDocumentForm.tsx`, `SupportDocumentDetail.tsx` y todo `facturacion-electronica/**` | — |
| R11 | cálculo | `TaxReport` declara `reteFuente`, `reteICA`, `reteIVA` y los devuelve **cableados a 0**; `totalImpuestos = ivaRecaudado − ivaPagado` no los descuenta | `reportesFinancierosService.ts:39-46, 277-280, 434` |
| R12 | cálculo | **No se restan de ningún total ni de la cartera.** `fn_recalc_invoice_totals()` (trigger de `invoice_items`) calcula `v_total = SUM(total_line)` y `v_new_balance = GREATEST(v_total − v_paid, 0)`: ignora `withholding_taxes` por completo | baseline (`fn_recalc_invoice_totals`) |
| R13 | cálculo | **Única resta existente en todo el repositorio**, y solo dentro del asistente de IA (no persiste): `const total = subtotal + iva + inc - retenciones;`, con el prompt «Las retenciones (ReteIVA, ReteFuente, ReteICA) van en 'retenciones_impreso' … número POSITIVO: son un descuento sobre el total.» | `lib/ai/agent/tools/documentos.ts:494-495, 402-403, 265, 434, 506` |
| R14 | RPC | `fn_reporte_impuestos(p_organization_id, p_from, p_to)` devuelve `iva_generado`, `iva_descontable`, `iva_neto`, `total_facturado`, `por_codigo`. **Cero retenciones.** Además se la invoca con un 4.º parámetro `p_branch_id` **que no existe en la firma SQL** | baseline:13559-13621 · `finanzasReports.ts:449` |
| R15 | Factus/DIAN | El campo sí viaja, pero siempre vacío: factura → `withholding_taxes: (item.withholding_taxes \|\| []).map(...)`; documento soporte → condicional; **nota crédito → `withholding_taxes: []` literal** | `app/api/factus/invoice/route.ts:239-242` · `support-document/route.ts:182-189` · `credit-note/route.ts:92` |
| R16 | Factus/DIAN | `mapTaxCode` tiene `'RETE_4':'09'`, `'RETE_11':'09'`, `'ICA_0.966':'07'`, y `mapTribute` `5:'06' // Renta`, `6:'07' // ICA`. **Nunca se disparan**: esos códigos de `tax_templates` no tienen seed en ninguna migración | `lib/services/factusService.ts:716-718, 669-670` |
| R17 | tipos | Tipos que las declaran y nadie rellena: `FactusItem.withholding_taxes`, `FactusSupportItem.withholding_taxes`, `TaxReport.rete*`, `payrollService.tax_withholding`, `TotalesRecalculados.retenciones` | factusService.ts:68-71, 182 · reportesFinancierosService.ts:42-44 · `lib/services/payrollService.ts:65` · documentos.ts:434 |
| R18 | — | **0 coincidencias** de `autorretencion`/`autorretención` en todo el repositorio. `print-agent/`: cero. `supabase/functions/`: cero. Ninguna migración posterior al baseline toca retenciones | — |

**Para el diseño**: una retención es un **descuento sobre el total a pagar** que además genera una
cuenta contable propia y un certificado. Hoy no hay ni el campo ni la resta. Si el rediseño las
incorpora, hay que diseñar de cero: tipificación del tributo en `organization_taxes`, conceptos con
base mínima en UVT y tarifa, ciudad para ICA, línea negativa en el resumen de totales de los seis
documentos, columna en la cartera, y certificado imprimible.

### G.4 Notas de crédito, documentos soporte, cotizaciones y facturación electrónica

| # | Módulo | Tipo | Etiqueta exacta / hallazgo | Archivo:línea |
|---|---|---|---|---|
| 1 | Nota crédito (desde factura) | cálculo | Modo **«por ítems»**: deriva una *tasa efectiva* `tax_total/subtotal*100` de la factura y la usa cuando la línea no trae `tax_rate`. Es un promedio ponderado: con IVA 19 % e INC 8 % mezclados, **ambas líneas se acreditan a una tasa intermedia que no existe** | `facturas-venta/id/NotaCreditoDialog.tsx:111-124, 363-401` |
| 2 | Nota crédito | cálculo | Modo **«por valor»**: escribe `tax_total: 0` y `tax_rate: 0`, y actualiza la factura con `{subtotal: -monto, tax_total: 0, total: -monto}` → **la nota no acredita nada de impuesto** | NotaCreditoDialog.tsx:243, 280, 302 |
| 3 | Nota crédito | cálculo | Detalle: **quinto motor**. Agrupa por `tax_rate` y resuelve el nombre con `organizationTaxes.find(t => Number(t.rate) === rate)`, con fallback «Impuesto {rate}%» → **dos impuestos distintos con la misma tasa se funden en uno** | `notas-credito/NotaCreditoDetalle.tsx:352-375, 364` |
| 4 | Nota crédito | texto | «Subtotal» (**sin dos puntos**, a diferencia de todos los demás documentos) | NotaCreditoDetalle.tsx:349 |
| 5 | Nota crédito | — | `invoice_applied_taxes` se **lee** (propia y de la factura original) pero la nota **nunca escribe sus propias filas** | `lib/services/notasCreditoService.ts:185-189, 204-208` |
| 6 | Doc. soporte | columna | «IVA» (cabecera de tabla, **cableada**) — el documento soporte es una compra a no obligados a facturar, donde el tributo no es necesariamente IVA | `documentos-soporte/SupportDocumentDetail.tsx:333` |
| 7 | Doc. soporte | texto | «IVA:» (línea de totales, **cableada**). Único documento del módulo que rotula el impuesto como «IVA» en los totales; los demás dicen «Impuestos:» | SupportDocumentDetail.tsx:372 |
| 8 | Doc. soporte | cálculo | Toda línea nueva nace con `tax_code: null, tax_rate: 0, tax_included: false` — **sin heredar el impuesto del producto ni el predeterminado** | `SupportDocumentForm.tsx:142-144` |
| 9 | Doc. soporte | cálculo | Al guardar: `tax_code: item.tax_code \|\| '01'` — **código DIAN de IVA cableado**. Defecto gemelo de E.7 #7, en un fichero que E.7 no cita | SupportDocumentForm.tsx:351 |
| 10 | Doc. soporte | cálculo | `is_excluded: Number(item.tax_rate \|\| 0) === 0 ? 1 : 0` — ver G-2 | SupportDocumentForm.tsx:358 |
| 11 | Doc. soporte | toggle | `tax_included` se aplica **en bloque** a todas las líneas | SupportDocumentForm.tsx:268 |
| 12 | Cotización | cálculo | Reutiliza `ImpuestosFactura` e `ItemsFactura` de facturas de venta → **hereda el `tax_templates!inner`**: los impuestos personalizados tampoco salen en cotizaciones | `cotizaciones/nueva-cotizacion/NuevaCotizacionForm.tsx:451, 467` |
| 13 | Cotización | cálculo | Al **importar los productos de una oportunidad del CRM**, cada línea se crea con `tax_code: null, tax_rate: 0` → la cotización sale **sin impuesto**, ignorando `product_tax_relations` | NuevaCotizacionForm.tsx:152-163 |
| 14 | Cotización | cálculo | Al editar se recupera el `tax_included` global de `quotation_items[0]`: si las líneas divergen, se pierde | NuevaCotizacionForm.tsx:203 |
| 15 | Cotización | columna | «IVA» (cabecera de tabla, **cableada**) | `cotizaciones/id/DetalleCotizacion.tsx:401` |
| 16 | Cotización | texto | «Subtotal:» · «Descuentos:» · «Impuestos:» · «Total:» — **cuarta variante** de etiquetas de totales | DetalleCotizacion.tsx:430-444 |
| 17 | Fact. electrónica | — | **`components/finanzas/facturacion-electronica/**` no muestra ni una sola cifra de impuesto**: 0 coincidencias de `tax`/`Impuesto`/`IVA` en los 9 componentes. El monitor de envíos a la DIAN no deja ver el desglose tributario que la DIAN valida, ni los códigos de tributo, ni el motivo de un rechazo por impuestos | los 9 `.tsx` del directorio |

### G.5 Contabilización del impuesto

| # | Tipo | Etiqueta exacta / hallazgo | Archivo:línea |
|---|---|---|---|
| 1 | esquema | `tax_account_mapping(id, organization_id, tax_template_id, organization_tax_id, account_code, account_type DEFAULT 'tax_payable', is_active, …)` con UNIQUE por `(organization_id, organization_tax_id)` y por `(organization_id, tax_template_id)`, más su trigger de timestamp | baseline:38700-38713, 43957-43968, 25410-25420 |
| 2 | — | **`tax_account_mapping` está muerta.** 0 coincidencias en `src/`, 0 en `supabase/functions/`, 0 en migraciones posteriores al baseline; solo aparece en 6 documentos de `docs/`. **Lo único que la toca es su propio trigger de `updated_at`** (baseline:25410-25420). Cuenta contable por impuesto diseñada, migrada y nunca conectada | verificado con `grep -rn` sobre `src/`, `supabase/functions/` y `supabase/migrations/` |
| 3 | campo | «Cuenta IVA (opcional)» — **único control de contabilización de impuesto de toda la aplicación**. Es `accounting_rules.tax_account_code`: **una** cuenta por regla, no por impuesto | `reglas-contables/ReglasContablesPage.tsx:434-450` |
| 4 | campo | «Seleccionar cuenta de IVA» / «Sin cuenta de IVA» | ReglasContablesPage.tsx:440, 443 |
| 5 | toggle | «Usar IVA del documento» (`use_tax_from_document`) | ReglasContablesPage.tsx:458 |
| 6 | — | Las tres etiquetas dicen «IVA» para un campo genérico de tributo: **un INC o un ICA se contabilizan bajo un control rotulado «IVA»** | ReglasContablesPage.tsx:434, 440, 443, 458 |
| 7 | cálculo | Semilla colombiana de `accounting_rules`: **`'2405'` para todo** — venta a crédito, venta de contado, compra a crédito, compra de contado, devolución de venta, anulación de venta y orden de compra recibida. El plan de cuentas la describe como «Impuestos y Contribuciones por Pagar … Tributos por pagar (IVA, retenciones, etc.)» | baseline:9567-9589, 9903 |
| 8 | — | **No existe 2408** (IVA por pagar / descontable) ni **2365 / 2367 / 2368** (retenciones) en el código: solo aparecen en `docs/PROMPT-AGENTE-FINANZAS.md:436` y `docs/hallazgos/F-43.md:11`. IVA generado e IVA descontable van a la **misma** cuenta `2405`, con lo que el saldo contable del impuesto **no es conciliable con la declaración** | verificado sobre `src/` y `supabase/migrations/` |
| 9 | cálculo | `v_rule.tax_account_code` se pasa como `p_tax_account` en 5 puntos de las funciones de asiento | baseline:5145, 7071, 7370, 7543, 8082 |

### G.6 Inconsistencias nuevas (16-34; las 1-15 están en E.7)

| # | Inconsistencia | Archivo:línea |
|---|---|---|
| 16 | `ImpuestosFacturaCompra` consulta `organization_taxes` **sin** `tax_templates!inner`, mientras venta y `taxResolver` sí lo usan: un impuesto personalizado se aplica en compras y desaparece en ventas y cotizaciones | ImpuestosFacturaCompra.tsx:203-209 vs ImpuestosFactura.tsx:365 |
| 17 | **Cuarto motor** de impuestos: la factura de compra llama a `calculateCartTaxes`, el del carrito del POS | ImpuestosFacturaCompra.tsx:12-17, 118 |
| 18 | **Quinto motor**: el detalle de nota crédito agrupa por tasa y resuelve el nombre por coincidencia numérica de `rate` | NotaCreditoDetalle.tsx:352-375 |
| 19 | **Sexta** estrategia de nombre en el detalle de factura de venta, con fallback literal «Impuesto» | ItemsDetalle.tsx:56-66 |
| 20 | Nota crédito «por valor»: `tax_total: 0` — se acredita el total sin devolver el impuesto | NotaCreditoDialog.tsx:243, 302 |
| 21 | Nota crédito «por ítems»: tasa efectiva promediada `tax_total/subtotal` cuando la línea no trae `tax_rate` | NotaCreditoDialog.tsx:113, 122, 373 |
| 22 | `tax_code: '01'` cableado al guardar un documento soporte | SupportDocumentForm.tsx:351 |
| 23 | Etiquetas «IVA» cableadas en Finanzas fuera del POS: cabecera y totales de documento soporte, cabecera de cotización, los tres controles de Reglas Contables y las tres métricas de Reportes | SupportDocumentDetail.tsx:333, 372 · DetalleCotizacion.tsx:401 · ReglasContablesPage.tsx:434, 440, 443, 458 · ReportesPage.tsx:331, 337, 343 |
| 24 | Cotización desde oportunidad del CRM: líneas con `tax_rate: 0`, ignorando `product_tax_relations` | NuevaCotizacionForm.tsx:152-163 |
| 25 | Líneas nuevas de documento soporte nacen con `tax_rate: 0`, sin heredar el impuesto por defecto | SupportDocumentForm.tsx:142-144 |
| 26 | Editar factura de venta reescribe `invoice_applied_taxes` con `tax_rate: 0` cableado | EditarFacturaVenta.tsx:195-208 |
| 27 | El checkbox del impuesto predeterminado en la factura de venta no propaga al padre | ImpuestosFactura.tsx:395-406 |
| 28 | `tax_account_mapping` completamente desconectada; todo el impuesto, de venta y de compra, contra la misma cuenta `2405` | baseline:38700-38713, 9567-9589 |
| 29 | `facturacion-electronica/**` no muestra ninguna información tributaria pese a ser el monitor DIAN | los 9 `.tsx` del directorio |
| 30 | `fn_reporte_impuestos` se invoca con un 4.º argumento `p_branch_id` inexistente en la firma SQL | finanzasReports.ts:449 vs baseline:13559 |
| 31 | El bloque de totales de la factura de venta formatea con `` `$${x.toFixed(2)}` ``: sin miles y con punto decimal | ImpuestosFactura.tsx:425, 537, 548, 562 |
| 32 | 32 `console.log` con el desglose completo del cálculo de impuestos en producción | ImpuestosFactura.tsx (fichero completo) |
| 33 | `OrganizationTax.id` tipado `number` frente al `uuid` real | ImpuestosFactura.tsx:9 |
| 34 | `is_excluded` sí se escribe (corrección a E.6), derivado de `tax_rate === 0` y no de una decisión del usuario | SupportDocumentForm.tsx:358 |

---

## H. Lo roto o sin efecto

Consolidado y ordenado por gravedad. Los defectos concretos de cada pantalla están en su sección;
aquí van los que el diseñador **no debe calcar** y los que cambian lo que hay que dibujar.

### H.1 Dinero: saldos que no cuadran

| # | Qué | Archivo:línea |
|---|---|---|
| 1 | **El diálogo de pago de factura de venta escribe tres veces el mismo saldo.** Inserta en `payments` (lo que ya dispara `trg_recalc_invoice_balance_from_payments` y `tr_update_accounts_receivable_on_payment`), **después** hace `UPDATE invoice_sales SET balance = factura.balance − monto, status = …` con un cálculo hecho en el navegador, y **encima** llama a la RPC `create_account_receivable`. Tres fuentes de verdad compitiendo por el mismo número, con una condición de carrera contra el trigger | `facturas-venta/id/RegistrarPagoDialog.tsx:184-248` (insert :184, update :204-223, RPC :234) |
| 2 | **«Marcar Pagada» marca la factura pagada ANTES de insertar el pago**: primero `UPDATE invoice_sales SET balance = 0, status = 'paid'` (y crea una fila en `sales` si no existe), y solo entonces inserta en `payments`. Si el insert falla, la factura queda pagada sin pago | `facturas-venta/id/DetalleFactura.tsx:355-400` |
| 3 | **Doble resta en `accounts_receivable` al aplicar un saldo a favor.** `fn_apply_customer_credit` actualiza `invoice_sales.balance`, lo que dispara `tr_update_account_receivable` → `create_account_receivable()`, que **fija** `accounts_receivable.balance = invoice_sales.balance`; acto seguido el propio RPC **vuelve a restar `p_amount` a mano** sobre la cartera ya actualizada. La cartera queda por debajo y puede marcarse `'paid'` antes de tiempo | baseline:4528-4540 · trigger 49328 |
| 4 | **La aplicación de un saldo a favor no pasa por `payments`**: no aparece en ningún informe de pagos ni en el arqueo, aunque sí dispara la comisión si la factura pasa a `'paid'` | baseline:4485-4557 · 49686 |
| 5 | **Los saldos de `bank_accounts` nunca se mueven en Transferencias.** Se llama a la RPC `update_bank_balance`, **que no existe** en el esquema, y el fallback construye el `update` **sin `await` ni `.then()`**: en supabase-js 2.x el builder solo emite la petición al hacer `then`, así que **la escritura nunca se envía**. Ni al crear ni al anular. Por eso la validación «Saldo insuficiente» compara contra un saldo congelado | `lib/services/transferenciasService.ts:190-234, 202-206, 225-229` |
| 6 | **El asiento de la transferencia es nulo**: `fn_auto_journal_bank_transfer` usa `v_rule.debit_account_code` **tanto en el débito como en el crédito**, y sin una `accounting_rules` con `source_type='bank'` no hace nada. Anular tampoco genera asiento de reversión | baseline (cuerpo del trigger) · transferenciasService.ts:252-273 |
| 7 | **CxP: el toast miente si falla el ajuste de saldo.** `registrarPago` inserta en `payments` y luego llama a `actualizarBalancesDespuesDePago`, cuyos errores se tragan con `console.error` **sin lanzar**: sale «Pago registrado» aunque `accounts_payable.balance` no se haya movido | `cuentas-por-pagar/CuentasPorPagarService.ts:491, 626, 644` |
| 8 | **CxP pisa `invoice_purchase.status`** fijando `'paid'`/`'partial'` y borrando el estado de recepción de inventario (`'received'`) — justo lo que el trigger de BD evita a propósito | CuentasPorPagarService.ts:634-641 · baseline, `fn_recalc_invoice_balance_from_payments` |
| 9 | **«Anular» un ingreso o un egreso falla siempre.** `cancelMovement` inserta `type: 'income'`/`'expense'` contra un `CHECK type IN ('in','out')` | `lib/services/movimientosService.ts:401` · baseline:28228 |
| 10 | **«Duplicar» un ingreso o un egreso falla siempre.** Las cuatro llamadas pasan `userId = ''` contra `user_id uuid NOT NULL` con FK a `auth.users`. Y si funcionara, **invertiría el tipo** | IngresosPage.tsx:97 · EgresosPage.tsx:86 · IngresoDetalle.tsx:76 · EgresoDetalle.tsx:75 · movimientosService.ts:287, 428-437 |
| 11 | **«Anular»/«Duplicar» del detalle de ingreso/egreso también se muestran para movimientos bancarios**, pero resuelven **por id numérico contra `cash_movements`**. Los ids de `bank_transactions` y `cash_movements` son secuencias independientes: anular la transacción bancaria #5 opera sobre el **movimiento de caja #5**. El listado sí lo protege; el detalle no | IngresoDetalle.tsx:162-169 · EgresoDetalle.tsx:161-168 · movimientosService.ts:129-149 |
| 12 | **La anulación de un movimiento no anula nada**: no hay columna de estado, solo se inserta una contrapartida «ANULACIÓN: …». Ni `getAllMovements` ni `getStats` excluyen el original, y **`getStats` usa `Math.abs`**: la contrapartida **suma** y «Total Acumulado» queda inflado al doble | movimientosService.ts:482-483 |
| 13 | **La nota de crédito «por valor» no acredita impuesto**: escribe `tax_total: 0` y actualiza la factura con `{subtotal: -monto, tax_total: 0, total: -monto}`. La «por ítems» usa una **tasa efectiva promediada** (`tax_total/subtotal`) cuando la línea no trae `tax_rate`: con IVA 19 % e INC 8 % mezclados, ambas líneas se acreditan a una tasa que no existe | `facturas-venta/id/NotaCreditoDialog.tsx:243, 302, 111-124, 363-401` |
| 14 | **Aprobar un pago programado sobrescribe `payments.reference`** con el comentario del supervisor, destruyendo la referencia original (donde además vive la fecha programada) | CuentasPorPagarService.ts:673, 406 |
| 15 | **`pagarCuota` no es atómico** ni en CxC ni en CxP: actualiza la cuota y después inserta en `payments`; si el segundo paso falla, la cuota queda pagada y la cartera no | `cuentas-por-cobrar/id/service.ts:405-433` · `cuentas-por-pagar/id/service.ts:374-398` |

### H.2 Cosas que fallan siempre

| # | Qué | Archivo:línea |
|---|---|---|
| 16 | **«Bloquear» un periodo fiscal.** El servicio escribe `status: 'locked'` y el CHECK real es `('open','closing','closed')` | `PeriodosFiscalesService.ts:92` |
| 17 | **«Generar Períodos» → «Anual (1 período)».** Inserta `period_type: 'annual'` y el CHECK admite `('monthly','quarterly','yearly')` | `PeriodosFiscalesService.ts:133` |
| 18 | **«Duplicar» una regla contable.** Copia `source_type`, `event_type` y `priority` tal cual, contra un UNIQUE de esas tres columnas | `ReglasContablesService.ts:171-180` |
| 19 | **«Guardar» una cuenta de dispersión PayFac.** La página envía snake_case (`bank_name`, `account_type`…) y la ruta desestructura camelCase (`bankName`, `accountType`…) → 400 | `payfac/cuentas/page.tsx:212-224` vs `api/integrations/payfac/payout-accounts/route.ts:79-113` |
| 20 | **La tabla de dispersiones PayFac revienta.** `const data: Payout[] = await res.json()` recibe `{success, data}`: `payouts.length` es `undefined`, no entra en el estado vacío y llega a `payouts.map(...)` → `TypeError`. Los 4 KPIs quedan en 0 y el detalle siempre dice «Esta dispersion no tiene items detallados.» | `payfac/dispersiones/page.tsx:147-148, 170-171, 187-188` |
| 21 | **El select «Método de pago» de `/cuentas-por-pagar/[id]/cuotas`.** Usa `method.payment_methods?.code` y el servicio devuelve `payment_method` (singular): todos los `SelectItem` valen `''`, que Radix no admite. **En esa pantalla no se puede pagar una cuota** | CuotasPage.tsx:620 vs `cuentas-por-pagar/id/service.ts:465-473` |
| 22 | **El filtro «Cliente» de cuentas por cobrar rompe la consulta.** Manda texto libre a un parámetro `uuid` del RPC → error de casteo → toast de error y tabla congelada | `CuentasPorCobrarFiltros.tsx:134-143` · service.ts:43 · baseline:16471 |
| 23 | **El filtro «Estado» de cuentas por pagar no devuelve nada.** La UI emite `pendiente`/`vencida`/`parcial`/`pagada` y la columna guarda `pending`/`partial`/`paid` | `CuentasPorPagarFiltros.tsx:174-178` · CuentasPorPagarService.ts:109-115 |
| 24 | **3 de las 4 opciones de «Vencimiento» de CxP no hacen nada**: la UI emite `hoy`/`proximos_7`/`proximos_30`/`vencidas` y el `switch` solo trata `vencidas`/`proximas`/`futuras` | CuentasPorPagarFiltros.tsx:191-195 · CuentasPorPagarService.ts:160-170 |
| 25 | **«Pagar con Open Finance» manda `NaN`**: `Number(cuentaSeleccionada.id)` sobre un uuid | CuentasPorPagarPage.tsx:523 |
| 26 | **El diálogo de asiento permite líneas que la base rechaza**: nada impide débito y crédito a la vez en la misma línea, y el CHECK `journal_lines.check_debit_credit` las rechaza — **con la cabecera ya insertada y huérfana**, porque el alta son dos `insert` sucesivos sin RPC transaccional | AsientosPage.tsx:471-486 · ContabilidadService.ts:288-338 |
| 27 | **«Guardar» de un impuesto no se deshabilita**: `setLoading(true)` no se llama nunca, así que «Guardando...» es inalcanzable y **el doble clic crea dos impuestos** | `impuestos/TaxForm.tsx:64, 219, 418-428` |
| 28 | **La UI de movimientos bancarios escribe valores que el CHECK no admite**: `transaction_type` `'credit'`/`'debit'` frente a `('deposit','withdrawal','transfer','fee','interest','other')`, y `status: 'pending'` frente a `('unmatched','matched','reconciled')` | MovimientosPage.tsx:201-217 · BancosService.ts:271-336 · §I.3 |

### H.3 Botones y campos sin efecto

**Sin `onClick`:** «Exportar» de facturas de venta (`facturas-venta/PageHeader.tsx:64-78`), «Exportar» de bancos
(`BancosPageHeader.tsx:195-201`), «Importar Extracto» (`CuentaDetailPage.tsx:362-368`), «Importar CSV» y
«Exportar» de movimientos (`MovimientosPage.tsx:178-185`), «Registrar Pago» del widget de vencimientos de
compra (`facturas-compra/FacturasProximasVencer.tsx:284-291`), «Importar» de ingresos y egresos
(`IngresosPage.tsx:184-187`, `EgresosPage.tsx:173-176`), «Editar» del menú de ingresos/egresos
(`IngresosPage.tsx:340-343`), icono Eye de las conciliaciones (`ConciliacionPage.tsx:302-304`),
«Ver {n} alertas más» del dashboard (`AlertasCard.tsx:148-153`).

**Solo `console.log`:** «Importar» y «Exportar» de facturas de compra
(`facturas-compra/PageHeader.tsx:30-36`).

**Solo un toast, sin hacer nada:** «Enviar por email» y «Enviar por WhatsApp» (lista y detalle de
facturas de venta, `FacturasTable.tsx:642-669`, `DetalleFactura.tsx:440-446`), «Email» del detalle de
cotización (`DetalleCotizacion.tsx:170-186`), «Descargar PDF» del detalle de nota de crédito
(`NotaCreditoDetalle.tsx:199-202`), los **6 botones de exportar de Reportes Financieros**
(`ReportesPage.tsx:111-116`), «Conciliar Pagos» de CxP (`ExportarBancaModal.tsx:132-140`),
«Resolver» una anomalía (`anomalyDetectionService.ts:614-630` solo hace `console.log`),
«Rechazar» una sugerencia de IA (solo filtra el array local, `AIMatchingPanel.tsx:131-134`),
los dos modales de recordatorio de CxC (`EnviarRecordatorioModal.tsx:53-64`,
`RecordatoriosPanel.tsx:77-88`).

**Campos que se capturan y no se envían:** «Notas Adicionales» del ítem manual de compra
(`ManualItemDialog.tsx:74-78`), «Notas» del abono de CxC (`AplicarAbonoModal.tsx:363-369`),
«Cuenta Bancaria», «Fecha del Pago» y «Notas» del `RegistrarPagoModal` de CxP (`:74, 197, 362-376`),
«Notas / Justificación» de «Programar Pago» (`ProgramarPagoModal.tsx:485-496`), «Tasa de interés
mensual (%)» del plan de cuotas de CxC (`InstallmentsCard.tsx:255-272`), el `parent_id` de centro de
costos (`CentroCostosPage.tsx:20, 43`).

**Parámetros que nadie lee:** `?edit=true` del detalle de cuenta bancaria
(`BankAccountCard.tsx:127-130`), `?action=new` de plan de cuentas (`ContabilidadHomePage.tsx:389`),
`?filter=vencidas` de la alerta de cartera (`FinanzasDashboardService.ts:681`).

**Funciones definidas y nunca llamadas:** `checkTaxUsage` (`DeleteTaxDialog.tsx:38-52`),
`updateDefaultTax` (`TaxForm.tsx:224-244`), `getAccountName` (`ReglasContablesPage.tsx:159`),
`crearPeriodo` (`PeriodosFiscalesService.ts:40-61`), `eliminarPeriodo`/`actualizarPeriodo`
(`PeriodosContablesService.ts:80-97, 173-183`), `BudgetService.upsertLine`/`deleteLine`
(`BudgetService.ts:96-117` — **por eso un presupuesto no se puede llenar**), `recalcularDiferencia`
(`ConciliacionService.ts:223-250`), `getFiltrosPorTab` (`CuentasPorPagarPage.tsx:222-235`),
`handlePagoRegistrado`/`handlePagoProgramado` (`CuentasPorPagarPage.tsx:187-203`),
`updateMovement` (`movimientosService.ts:345-371`), `getResumenGeneral`
(`FinanzasDashboardService.ts:729`).

**Subárboles enteros muertos:** las **39 pantallas de configuración de pasarela de pago**
(`metodos-pago/gateways/*` + `PaymentGatewaysSection.tsx:60`): `gatewayConfig` nunca deja de ser `{}`,
el campo `gateway` no tiene control en la UI y ninguna ruta renderiza esos formularios. Los
**24 campos de credenciales** que contienen (Stripe, Wompi, PayU, Mercado Pago, genérico) no se
alcanzan desde ningún sitio.

### H.4 Rutas huérfanas y enlaces rotos

**Enlaces a rutas que no existen:** `/app/finanzas/configuracion/secuencias` (las dos alertas de
resolución DIAN del dashboard, `FinanzasDashboardService.ts:704, 715`),
`/app/finanzas/facturacion-electronica/configuracion` (`facturacion-electronica/page.tsx:284`),
`/app/finanzas/proveedores` (`FacturasCompraPage.tsx:86`), `/app/finanzas/bancos/cuentas`
(`AccountMappingForm.tsx:286`). El botón «Nueva Nota Crédito» lleva a `/app/finanzas/facturas-venta`
porque **no hay ruta `/notas-credito/nuevo`** (`NotasCreditoPage.tsx:210-216`).

**Rutas que existen y no están enlazadas desde ningún sitio** (§F.0 N-b): `/reportes`,
`/periodos-contables`, `/open-finance` (+`/consents`), `/payfac/cuentas`, `/payfac/dispersiones`,
`/cuentas-por-pagar/[id]/cuotas`. `bancos/tesoreria` y `bancos/anomalias` solo se alcanzan desde
`open-finance`, que a su vez es inalcanzable. `conciliacion-bancaria` solo desde «Bancos».
`/metodos-pago/qr-sessions` solo desde una notificación.

**Tipos y estados inalcanzables desde la UI:** los cuatro estados de `budgets` salvo `draft`; los
tres estados de `fixed_assets` salvo `active`; `bank_transfers.status = 'pending'`; los badges
«Aprobado», «Rechazado» y «Procesado» del modal de aprobaciones de CxP
(`AprobacionPagosModal.tsx:166-180`); el badge «Bloqueado» de periodos fiscales.

### H.5 Fechas y zona horaria

Las reglas de `docs/reglas-fechas-timezone.md` se incumplen de forma sistemática en el módulo:

- **`toISOString().split('T')[0]`** (prohibido, regla 1): **~74 usos en 35 ficheros** de
  `src/components/finanzas/**` y `src/app/app/finanzas/**`. Concentrados en nombres de fichero de
  exportación y en «hoy» por defecto de los `type=date`.
- **`.split('T')[0]` sobre un valor de la BD** (prohibido, regla 2): 8 usos, entre ellos
  `ProgramarPagoModal.tsx:86, 416` sobre `due_date`, que es `timestamptz`.
- **`formatDate` / `parseLocalDate` de `@/utils/Utils`, deprecated** (regla 4): **32 ficheros** los
  importan. Solo **12 ficheros** usan `useFormatDate()`.
- **`journal_entries.entry_date` es `timestamptz`**, no `date`: el diálogo envía `'2026-09-22'`, se
  guarda `2026-09-22 00:00+00` y en Bogotá (UTC−5) se pinta **21 de septiembre**
  (`AsientosPage.tsx:346`, `AsientoDetailPage.tsx:161-165`, `MayorContablePage.tsx:192`).
- **Los periodos generados empiezan el día anterior**: `new Date(year, i, 1)` + `toISOString()` deja
  enero en `2025-12-31` en UTC−5 (`PeriodosFiscalesService.ts:110-111`,
  `PeriodosContablesService.ts:154-155`), lo que hace que `fn_is_period_open` evalúe el periodo
  equivocado en los bordes de mes.
- **Los informes contables pierden el último día del rango**: comparan un `timestamptz` con una
  cadena de fecha, así que el corte es a las `00:00Z` y **todo asiento automático generado ese día
  por las RPC `fn_auto_journal_*` queda fuera** del balance, del P&G y del mayor
  (`ReportesContablesService.ts:136, 231, 325, 451`).
- **Locales cableados** (`'es-ES'` y `'es-CO'` conviviendo) y ~11 ficheros con un `formatDate`
  propio que ignora el huso de la organización.
- Los KPIs «Hoy» y «Este Mes» de ingresos, egresos y transferencias se calculan con `new Date()`
  del navegador: **dos usuarios en husos distintos ven cifras distintas para la misma organización**
  (`movimientosService.ts:454-456`).

### H.6 Diálogos nativos del navegador

**27 usos de `window.confirm` / `window.prompt` en 19 ficheros**, más **9 `window.alert`**. No son
estilables y rompen el kit en las acciones más delicadas del módulo: eliminar una factura de compra
(`FacturasCompraTable.tsx:91, 98`), las **6 validaciones** del pago a proveedor
(`facturas-compra/RegistrarPagoModal.tsx:148-197`), confirmar una factura de compra
(`DetalleFacturaCompra.tsx:295`), anular una nota de crédito con `prompt` para el motivo
(`NotasCreditoPage.tsx:138, 140`), eliminar una cotización (`CotizacionesTable.tsx:98`), eliminar un
documento soporte (`SupportDocumentDetail.tsx:181`), anular ingresos, egresos y transferencias
(6 pares `confirm` + `prompt`), eliminar asientos, cuentas contables, reglas, centros de costo,
activos fijos, presupuestos y monedas. Frente a ello, `ui/alert-dialog` se importa **4 veces** y
`ui/confirm-dialog` **2**.

Además el copy mezcla tratamientos: **«¿Está seguro…» (usted) conviven con «¿Estás seguro…» (tú)**,
y tres de ellos van **sin el signo de apertura**: «Eliminar este activo?», «Eliminar este centro de
costos?», «Eliminar este presupuesto?». En todo `finanzas/` hay 15 «Selecciona un…» frente a
16 «Seleccione un/una…».

### H.7 Multi-tenant, permisos y seguridad

| # | Qué | Archivo:línea |
|---|---|---|
| 29 | **No hay ni una sola comprobación de permisos en la UI del módulo**: 0 usos de `usePermission`/`hasPermission` en los 174 componentes de `src/components/finanzas/**`. Cerrar un periodo, publicar un asiento, borrar una cuenta contable, anular una factura o eliminar una regla están disponibles para cualquiera que alcance la ruta. **No hay estado «sin permiso» que maquetar porque no existe** | verificado con `grep` |
| 30 | **Las claves i18n del gate que sí se diseñó son huérfanas**: `home.restrictedTitle` («Dashboard restringido») y `home.restrictedMessage` («Los indicadores financieros están disponibles solo para administradores de la organización…») **no se usan en ningún fichero** | `messages/es.json:359-360` |
| 31 | **Comisiones es la única pantalla que pasa por un route handler y `getServerOrgContext()`.** Las otras 63 rutas resuelven la organización desde `localStorage` (`getOrganizationId()`) y escriben con el cliente de navegador: la única barrera es RLS | `useOrganization.ts:376-379` |
| 32 | **Muchos `update`/`delete` filtran solo por `id`, sin `organization_id`**: `ContabilidadService` (asientos), `PeriodosContablesService`, `PeriodosFiscalesService`, `ReglasContablesService`, `CostCenterService`, `FixedAssetService`, `BudgetService`, `BancosService.actualizarCuentaBancaria`/`toggleActivoCuenta`/`obtenerConciliacion`, `TaxesTable` (toggle activo) | ver cada sección |
| 33 | **`fn_apply_customer_credit` es `SECURITY DEFINER` sin guarda de pertenencia y está concedida a `anon`** | baseline:4485-4557, 64542 |
| 34 | **Fuga entre organizaciones en métodos de pago**: al editar se escriben `name` y `requires_reference` en `payment_methods`, tabla **global sin `organization_id`**; al borrar, la fila global desaparece **para todos los inquilinos**, y el fallo solo se registra con `console.warn` mientras la UI declara éxito | `PaymentMethodForm.tsx:304-310` · `PaymentMethodsList.tsx:524-531` |
| 35 | **Fuga entre organizaciones en los logs de tasas de cambio**: `exchange_rates_logs` no tiene `organization_id` y su política es `FOR SELECT USING (auth.role() = 'authenticated')`, así que la sub-pestaña «Logs de Actualización» le dice a cualquier cliente **cuántas organizaciones tiene la plataforma** | `ExchangeRatesChart.tsx:750-774` · baseline:30555-30565, 58718 |
| 36 | **El bucket `invoices` de Storage es público.** `/api/facturas-venta/[id]/pdf` genera el PDF, lo sube con la service role y devuelve `getPublicUrl`: **cualquiera con el uuid de la factura la descarga sin sesión**. Además el `POST` toma el contenido del **cuerpo de la petición** y hace `upsert: true` sin validar que el `[id]` sea de la organización del usuario, así que un usuario autenticado puede **sobrescribir el PDF de la factura de otra organización**. El `GET` hermano sirve `facturas-venta/{id}.html` del mismo bucket con la clave anónima y sin comprobar nada | `app/api/facturas-venta/[id]/pdf/route.ts:7-13, 200-217` · `[id]/route.ts:11-30` · `storage.buckets.public = true` |
| 37 | **`organizationId` viaja por query o por body** a las rutas de PayFac y Open Finance en lugar de salir solo de la sesión | `payout-accounts/route.ts:42-49, 91-95` · `TesoreriaPage.tsx:150-160` · `AnomalyPanel.tsx:146-148` |
| 38 | **`tax_account_mapping` existe y nadie la consulta** (0 coincidencias en `src/`): todo el impuesto, de venta y de compra, se contabiliza contra la misma cuenta `2405` (§G.5) | baseline:38700-38713, 9567-9589 |

### H.8 Copy, etiquetas y consistencia visual

- **Textos sin tildes visibles al usuario**: los cuatro informes contables enteros («Balance de
  Comprobacion», «Estado de situacion financiera», «Perdida», «Descripcion», «Debito», «Credito»),
  centro de costos, activos fijos, presupuestos, tesorería, anomalías, Open Finance, PayFac y las
  sesiones QR. En facturas de venta: «La factura se **emitio**», «no se **actualizo**»,
  «**Repon** el inventario» (`DetalleFactura.tsx:557, 620, 636`;
  `nueva-factura/NuevaFacturaForm.tsx:1041`).
- **Jerga técnica en la UI del cliente**: «No hay **jobs** de facturación electrónica», «El **job**
  se ha marcado para reintento», «Cola de Facturación Electrónica», «Datos enviados a **Factus**
  (JSON)» con volcado de JSON crudo, enlace «Docs API» a `developers.factus.com.co`
  (`facturacion-electronica/*`); «La moneda no tiene datos en la tabla **currency_rates**»
  (`ExchangeRatesChart.tsx:625`); «Genera el asiento contable (crédito a Anticipos **2805**)»
  (`NuevoSaldoFavorDialog.tsx:107-109`); chip de filtro «Estado: **draft**»
  (`FacturasCompraFiltros.tsx:225-229`); estados `draft`/`approved`/`active`/`closed` en inglés
  crudo en presupuestos (`PresupuestosPage.tsx:105`); `source_type`/`event_type` crudos en reglas
  contables; `event_type` crudo en la línea de tiempo de la nota de crédito.
- **`toastError("Error", …${JSON.stringify(error)}`**: vuelca el objeto de error de Supabase a la
  interfaz (`facturas-venta/nueva-factura/NuevaFacturaForm.tsx:1073`).
- **Chip de depuración en producción**: «{n} monedas \| {code} seleccionada», comentado en el código
  como «Estado de depuración» (`ExchangeRatesChart.tsx:559-562`).
- **236 `console.log` en producción** en `src/components/finanzas/**`, concentrados en
  `FacturasCompraService` (43), `ImpuestosFactura` (32), `ExchangeRatesTable` (30),
  `NuevaFacturaForm` de compra (28), `CurrencyConverter` (27) y `ExchangeRatesChart` (24).
- **Etiquetas inconsistentes para el mismo concepto**: «Pago Parcial» vs «Pago parcial»,
  «Aceptada DIAN» (badge) vs «Aceptada» (filtro) en la misma pantalla, KPI «En Borrador» sobre un
  campo `pending`, «Balance» (compras) vs «Saldo» (ventas), «Núm. Factura» vs «Número», «Cancelado»
  (documentos soporte) vs «Anulada» (transferencias) para `cancelled`, «Riesgo Bajo» y «Bajo Riesgo»
  como dos tramos distintos del mismo informe de antigüedad (`AgingReport.tsx:113, 115`).
- **Etiqueta con espacio inicial**: «` `Fecha Fin» (`BalanceComprobacionPage.tsx:116`).
- **Iconos equivocados**: Calendar para «Moneda» (`CuentaDetailPage.tsx:267-279`), FileDown para
  «Nueva Conciliación» (`:369-376`), User para «Creado» sin mostrar quién
  (`AsientoDetailPage.tsx:187-199`); y tres módulos cuyo color e icono **no coinciden con los que
  anuncia el hub de contabilidad** (centro de costos, activos fijos, presupuestos).
- **Tablas mal contadas**: `colSpan={12}` para 13 columnas (`FacturasTable.tsx:507, 678`),
  `TableSkeleton columns={6}` para 7 (`SupportDocumentsTable.tsx:60`), `columns={5}` para 8
  (`JobsTable.tsx:104`), `columns={8}` para 9 (`comisiones/page.tsx:88`), y el esqueleto de facturas
  de venta con 9 cabeceras, 10 celdas y rótulos que no coinciden con los reales.
- **Emoji en lugar de icono del kit**: badge «📄 Manual»
  (`facturas-compra/nueva-factura/SelectedProductsTable.tsx:104-107`).
- **`<button>` con clases sueltas en lugar de `Button`**: recuperación de errores en editar compra
  (`EditarFacturaCompra.tsx:148-160`), «Actualizar tasas» (`ExchangeRatesChart.tsx:566-581`),
  «Reintentar» de comisiones (`comisiones/page.tsx:80`).
- **CSV sin escapar**: notas de crédito, ingresos, egresos, transferencias y el histórico de tasas
  no entrecomillan ni escapan comas; un nombre de cliente con coma rompe las columnas.

### H.9 Rendimiento y arquitectura

- **2N peticiones HTTP en el listado de bancos**: un `fetch` a `/real-balance` por tarjeta más otro
  dentro del widget (`BankAccountCard.tsx:44-48` + `RealTimeBalanceWidget.tsx:71-73`).
- **Una consulta por fila** para el sparkline de 5 días del histórico de tasas
  (`ExchangeRatesTable.tsx:154-170`).
- **Sin paginación** en: notas de crédito, cotizaciones, asientos contables, plan de cuentas, balance
  de comprobación, mayor contable (donde **el saldo final puede quedar truncado en silencio** por el
  límite por defecto de PostgREST), movimientos bancarios, ingresos, egresos, transferencias, saldos
  a favor, métodos de pago, comisiones (tope 200) y sesiones QR (tope duro de 100).
- **Filtrado y paginación en cliente sobre el conjunto completo** en facturas de venta, movimientos
  bancarios, conciliaciones, documentos soporte y la cola de facturación electrónica: la búsqueda
  solo mira la página cargada.
- **Búsqueda sin debounce** en notas de crédito (recarga contra el servidor en cada tecla), sesiones
  QR, comisiones, ingresos, egresos, transferencias y saldos a favor.
- **Dos caminos de datos para la misma pantalla**: la cola de facturación electrónica y los
  documentos soporte leen los KPIs **directamente de la tabla desde el navegador** mientras la lista
  va por API (`facturacion-electronica/page.tsx:89-124`, `SupportDocumentsPage.tsx:88-109`).
- **Escrituras sin transacción** (leer → calcular → escribir, o dos `insert` sucesivos): alta de
  movimiento bancario, match y unmatch de conciliación, alta de asiento contable, registro de pago
  en CxC/CxP, reordenado de métodos de pago, guardado de preferencias de moneda.
- **Servicios fuera de sitio**: `saldosAFavorService` vive en `src/components/finanzas/`, no en
  `src/lib/services/`.

---

## I. Esquema real en la base de datos

Verificado el 2026-09-22 por el MCP de Supabase (`jgmgphmzusbluqhuqihj`), solo lectura:
`information_schema.columns`, `pg_constraint`, `pg_trigger`, `pg_policy` y `storage.buckets`.
Notación: **NN** = `NOT NULL`; **NN sin default** = hay que enviarlo siempre;
**GEN** = columna generada, no se escribe.

### I.1 Documentos de venta y compra

| Tabla | Columnas | Trampas para el diseño |
|---|---|---|
| `invoice_sales` | `id uuid` · `organization_id int` **NN sin default** · `branch_id int` **NN sin default** · `customer_id uuid` NULL · `sale_id uuid` NULL · `number text` **NN sin default** · `issue_date timestamptz` DEF `now()` · `due_date timestamptz` · `currency bpchar` DEF `'USD'` · `subtotal`/`tax_total`/`total`/`balance numeric` DEF 0 · `status text` **NN sin default** · `xml_uuid` · `created_by`/`created_at`/`updated_at` · `notes` · `payment_method` · `tax_included bool` NN DEF false · `payment_terms int` · `description` · `related_invoice_id uuid` · `document_type text` · `reference_code` · `operation_type` DEF `'10'` · `payment_form` DEF `'1'` · `payment_method_code` DEF `'10'` · `send_email bool` DEF false · `validated_at` · `qr_image` · `allowance_charges jsonb` DEF `[]` · `billing_period jsonb` · `salesperson_id` · `commission_rate`/`commission_type`/`commission_method`/`commission_amount` · `payment_terms_id uuid` · `opportunity_id uuid` | `branch_id` es **NN sin default**: sin sucursal en sesión el alta falla. `currency` por defecto es **`'USD'`**, no COP. `status` CHECK `('draft','issued','paid','partial','void')` — **`'voided'` no existe** aunque el código lo trate. `document_type` CHECK `('invoice','credit_note','debit_note','proforma','recurring')`: **las notas de crédito viven aquí**, no en `credit_notes`. `number` es NN sin default: lo calcula la app. |
| `invoice_purchase` | `id uuid` · `organization_id`/`branch_id`/`supplier_id int` **NN sin default** · `po_id int` · `number_ext text` **NN sin default** · `issue_date`/`due_date` · `currency` DEF `'USD'` · `subtotal`/`tax_total`/`total`/`balance` DEF 0 · `status text` **NN sin default** · `notes` · `payment_terms`/`payment_terms_id` · `payment_method` · `tax_included bool` NN DEF false · `salesperson_id` · `commission_*` | `status` CHECK `('draft','received','paid','partial','void')` — **`'confirmed'` no existe**, y el detalle de compra condiciona dos botones a ese valor (§H). `supplier_id` es **integer**, mientras `customer_id` de ventas es **uuid**. |
| `invoice_items` | `id uuid` · `invoice_id uuid` **NN** · `invoice_type text` **NN sin default** · `product_id int` · `description text` **NN sin default** · `qty`/`unit_price`/`total_line numeric` NN DEF 0 · `tax_code text` · `tax_rate numeric` DEF 0 · `tax_included bool` NN DEF false · `discount_amount`/`discount_rate` DEF 0 · `invoice_sales_id uuid` · `invoice_purchase_id uuid` · `support_document_id uuid` · `code_reference` · `unit_measure_id int` DEF 70 · `standard_code_id int` DEF 1 · `is_excluded int` DEF 0 · `tribute_id int` DEF 1 · `withholding_taxes jsonb` DEF `[]` · `note` · `serial_numbers text[]` DEF `{}` · `serial_ids int[]` DEF `{}` | **Una sola tabla para venta, compra y documento soporte**: además de `invoice_id` + `invoice_type` hay tres FK específicas (`invoice_sales_id`, `invoice_purchase_id`, `support_document_id`) que conviven con ella. No hay `tax_id`: el impuesto por línea es `tax_code` + `tax_rate` (texto y número), no una FK a `organization_taxes`. `is_excluded` es **integer**, no booleano. `withholding_taxes` existe y **ninguna pantalla lo escribe** (§G). |
| `quotations` | `id uuid` · `organization_id int` NN · `branch_id int` · `number varchar` NN · `customer_id uuid` **NN** · `issue_date date` **NN** · `valid_until date` · `currency varchar` NN DEF `'COP'` · `subtotal`/`tax_total`/`discount_total`/`total` NN DEF 0 · `status varchar` NN DEF `'draft'` · `payment_terms`/`payment_method` · `notes` · `terms_conditions` · `salesperson_id` · `converted_invoice_id uuid` · `opportunity_id` · `sections_json jsonb` · `signature_id uuid` · `payment_link_url`/`payment_link_id`/`payment_link_amount` | **`issue_date` es `date`**, no `timestamptz` (usar `formatPlainDate`, no `formatDateInTz`). `currency` por defecto sí es COP, al contrario que las facturas. `customer_id` es NN: no hay cotización sin cliente. `status` **no tiene CHECK**: texto libre. Tiene trigger `trg_set_quotation_issue_date_tz`. `sections_json`, `signature_id` y los tres `payment_link_*` **no tienen UI**. |
| `quotation_items` | `id uuid` · `quotation_id uuid` NN · `product_id int` · `description text` NN · `qty` NN DEF 1 · `unit_price`/`discount_amount`/`tax_rate`/`total_line` NN DEF 0 · `tax_code varchar` · `tax_included bool` NN DEF false | **Tabla propia**: las cotizaciones NO usan `invoice_items`, aunque el formulario comparta el componente `ItemsFactura`. |
| `support_documents` | `id uuid` · `organization_id int` NN · `branch_id`/`supplier_id int` · `invoice_purchase_id uuid` · `reference_code text` **NN sin default** · `numbering_range_id int` · `number` · `issue_date` DEF now() · `created_time text` · `observation` · `payment_details jsonb` DEF `[]` · `cash_rounding_amount` DEF 0 · `establishment jsonb` · `provider jsonb` **NN sin default** · `subtotal`/`tax_total`/`total` DEF 0 · `currency bpchar` DEF `'COP'` · `status text` NN DEF `'draft'` · `cufe varchar` · `qr_code`/`qr_image` · `validated_at` · `is_validated`/`sent_to_dian bool` DEF false · `sent_at` · `factus_response jsonb` · `error_code`/`error_message` · `tax_included bool` NN DEF false | **`provider jsonb` es NN sin default**: el formulario tiene que serializar los datos fiscales del proveedor, no basta con `supplier_id`. `status` sin CHECK. |
| `credit_notes` | `id uuid` · `organization_id int` NN · `customer_id uuid` **NN** · `amount numeric` NN (CHECK > 0) · `balance numeric` NN (CHECK ≥ 0) · `expiry_date` · `status text` NN DEF `'active'` · `notes` · `branch_id` | **No son las notas de crédito de facturación**: son los **saldos a favor** del cliente (`/app/finanzas/saldos-a-favor`). Las notas de crédito fiscales son `invoice_sales` con `document_type='credit_note'`. Nombre colisionante: el diseño debe usar dos rótulos distintos. `status` CHECK `('active','used','expired','cancelled')`. |
| `credit_note_applications` | `id uuid` · `organization_id int` NN · `credit_note_id uuid` NN · `invoice_id uuid` NN · `amount numeric` NN · `created_by` · `created_at` | Aplicación de un saldo a favor a una factura. |

### I.2 Cartera y pagos

| Tabla | Columnas | Trampas |
|---|---|---|
| `payments` | `id uuid` · `organization_id int` **NULL** · `branch_id int` · `source text` · `source_id text` · `method text` · `amount numeric` · `currency bpchar` **NN sin default** · `reference` · `processor_response jsonb` · `status text` · `created_by` · `created_at`/`updated_at` DEF now() · `payment_date timestamptz` DEF now() · `discount_amount numeric` NN DEF 0 · `change_amount numeric` NN DEF 0 | `currency` es **NN sin default**: el diseño debe exigir moneda siempre. `source_id` es **text**, no uuid: guarda el uuid como cadena. `status` **sin CHECK**, pero los triggers solo cuentan `'completed'`. `source` en uso: `'invoice_sales'`, `'invoice_purchase'`, `'sale'`, `'account_receivable'`, más folios, membresías y parqueaderos del PMS. `organization_id` es nullable. |
| `accounts_receivable` | `id uuid` · `organization_id int` NN · `customer_id uuid` · `invoice_id uuid` · `amount`/`balance numeric` · `due_date timestamptz` · `status text` · `days_overdue int` · `last_reminder_date` · `sale_id uuid` · `branch_id` · `discount_amount numeric` NN DEF 0 | `status` **sin CHECK**: texto libre (`'pending'`, `'partial'`, `'paid'`… según quién escriba). `days_overdue` lo recalcula el trigger `tr_update_days_overdue` **solo en UPDATE**, nunca en INSERT. |
| `accounts_payable` | `id uuid` · `organization_id int` NN · `supplier_id int` **NN** · `invoice_id uuid` · `amount`/`balance` · `due_date` · `status` · `days_overdue` · `branch_id` · `discount_amount` NN DEF 0 | Sin `last_reminder_date` ni `sale_id`: **no es simétrica con CxC**. Sin trigger de `days_overdue`. |
| `ar_installments` / `ap_installments` | `id uuid` · `account_receivable_id` / `account_payable_id uuid` NN · `installment_number smallint` NN · `due_date date` **NN** · `amount`/`balance numeric` NN · `principal`/`interest` · `status text` NN DEF `'pending'` · `paid_amount` NN DEF 0 · `paid_at` · `days_overdue` · `discount_amount` NN DEF 0 · (**solo AP**: `notes`) | `due_date` es **`date`**, no timestamptz: `formatPlainDate`. CHECK de `status`: AR `('pending','partial','paid','overdue','written_off')`, AP `('pending','partial','paid','overdue','cancelled')` — **los dos últimos valores difieren**, así que el badge no puede ser el mismo componente sin parametrizar. |
| `commissions` | `id uuid` · `organization_id int` NN · `branch_id` · `commission_type text` NN DEF `'salesperson'` · `source_type text` NN · `source_id text` NN · `source_item_id` · `payee_type text` NN DEF `'employee'` · `payee_id uuid` · `payee_name` · `base_amount`/`commission_rate`/`commission_amount` NN DEF 0 · `currency` DEF `'USD'` · `status text` NN DEF `'accrued'` · `accrued_at`/`paid_at` · `notes` · `metadata jsonb` · `created_by` | CHECK: `commission_type` `('salesperson','intermediation_sale','intermediation_purchase')`, `payee_type` `('employee','supplier','third_party')`, `source_type` `('sale','invoice_sale','invoice_purchase','opportunity')`, `status` `('accrued','paid','cancelled')`. Se crean **por trigger**, no desde la UI. |

### I.3 Bancos, tesorería y dispersiones

| Tabla | Columnas | Trampas |
|---|---|---|
| `bank_accounts` | `id int` (secuencia) · `organization_id int` NN · `branch_id int` **NN sin default** · `name text` NN · `account_number` · `bank_name` · `account_type` · `currency bpchar` DEF `'USD'` · `balance`/`initial_balance numeric` DEF 0 · `is_active bool` DEF true · `created_by`/`created_at`/`updated_at` | `branch_id` **NN sin default** (de ahí el toast genérico de D.4). `id` es **integer**, no uuid. `currency` por defecto `'USD'`. Sin `account_code` contable: **no hay vínculo con el plan de cuentas**. |
| `bank_transactions` | `id int` · `organization_id int` NN · `bank_account_id int` NN · `trans_date timestamptz` DEF now() · `description` · `amount numeric` **NN** · `reference` · `matched_journal_line_id int` · `transaction_type text` **NN sin default** · `status text` DEF `'unmatched'` · `import_source`/`import_id` · `uuid uuid` NN DEF gen_random_uuid() · `branch_id` | CHECK `transaction_type` `('deposit','withdrawal','transfer','fee','interest','other')` — **pero la UI de D.3 escribe `'credit'` y `'debit'`**, que no están en el CHECK. CHECK `status` `('unmatched','matched','reconciled')` — **la UI escribe `'pending'`**, que tampoco está. Tiene a la vez `id` integer y `uuid`. |
| `bank_reconciliations` | `id uuid` · `organization_id int` NN · `bank_account_id int` NN · `period_start`/`period_end date` **NN** · `opening_balance`/`closing_balance numeric` NN DEF 0 · `statement_balance numeric` · **`difference numeric` GEN** · `status text` NN DEF `'draft'` · `notes` · `created_by`/`closed_by`/`closed_at` | **`difference` es una columna GENERADA**: no se puede escribir. Por eso «recalcular la diferencia» no es un `UPDATE` sino actualizar `closing_balance`/`statement_balance`. CHECK `status` `('draft','in_progress','closed')`. `period_*` son `date`. |
| `bank_reconciliation_items` | `id uuid` · `reconciliation_id uuid` NN · `bank_transaction_id int` · `match_type text` NN · `matched_payment_id uuid` · `matched_journal_line_id int` · `amount numeric` NN · `is_matched bool` NN DEF false · `match_date` · `notes` | — |
| `open_finance_links` / `_accounts` / `_transactions` / `_consents` | Ver §D.10-D.11. `links`: `provider` DEF `'prometeo'`, `institution_code`/`institution_name` NN, `session_key`, `status` DEF `'active'`, `sync_frequency` DEF `'daily'`. `accounts`: `external_account_id text` NN, `bank_account_id int` (puente al ERP), `last_balance`/`last_balance_at`. `transactions`: `external_transaction_id` NN, `bank_transaction_id int`, `is_imported bool` NN DEF false. `consents`: `consent_type`/`purpose` NN, `scope jsonb`, `granted_at` NN DEF now(), `expires_at`, `revoked_at`/`revoked_reason`, `ip_address`, `user_agent`, `granted_by`, `status` NN DEF `'active'` | `organization_id` es **bigint** aquí y `integer` en el resto del módulo. `scope`, `ip_address`, `user_agent` y `granted_by` **no se muestran en ninguna pantalla**. |
| `organization_payout_accounts` | `id uuid` · `organization_id bigint` NN · `bank_name`/`account_type`/`account_number`/`account_holder_name`/`account_holder_id`/`account_holder_id_type text` **todas NN sin default** · `breb_key_type` DEF `'ALPHA'` · `breb_key_value` · `is_active` NN DEF true · `is_verified bool` NN DEF false · `verified_at` · `bank_account_id int` | Seis campos NN sin default: el diálogo de D.12 los marca todos con `*`, correcto. **No hay acción de verificación en ninguna UI**: `is_verified` solo se puede cambiar desde fuera. |
| `organization_payouts` | `id uuid` · `organization_id bigint` NN · `payout_reference text` NN · `provider_code text` NN · `total_amount`/`commission_amount`/`net_amount numeric` NN DEF 0 · `currency` NN DEF `'COP'` · `status text` NN DEF `'pending'` · `payout_method` NN DEF `'breb'` · `bank_account_id bigint` · `provider_payout_id` · `provider_response jsonb` · `period_start`/`period_end timestamptz` **NN** · `scheduled_at`/`processed_at`/`failed_at` · `failure_reason` · `created_by` | Los nombres reales son `total_amount`/`commission_amount`/`net_amount`; la pantalla D.13 lee `total_gross`/`total_commission`/`total_net` del resumen de la API. |
| `payout_items` | `id uuid` · `payout_id uuid` NN · `payment_id uuid` **NN** · `payment_qr_session_id uuid` · `gross_amount`/`net_amount numeric` NN · `commission_amount` NN DEF 0 · `reference` | Enlaza cada dispersión con los `payments` del ERP: el «Payment ID» de D.13 **sí puede ser un enlace**. |

### I.4 Contabilidad

| Tabla | Columnas | Trampas |
|---|---|---|
| `chart_of_accounts` | **PK compuesta `(organization_id, account_code)`** · `account_code text` NN · `organization_id int` NN · `name text` NN · `type text` **NN sin default** · `parent_code text` · `is_active bool` DEF true · `description text` · `created_at`/`updated_at` | **No tiene `id`**: la clave es el código dentro de la organización, por eso «Código» se deshabilita al editar. CHECK `type` `('asset','liability','income','expense','equity')` — **5 valores, en inglés**. `description` guarda **HTML** porque la UI usa `RichTextEditor`. Sin `level`, sin `nature`, sin `currency`, sin saldo. |
| `journal_entries` | `id int` (secuencia) · `organization_id int` NN · `branch_id int` **NN sin default** · `entry_date timestamptz` DEF now() · `memo text` · `posted bool` DEF false · `source`/`source_id text` · `created_by` · `currency_code varchar` DEF `'COP'` · `exchange_rate numeric` DEF 1.0 · `base_currency_code varchar` DEF `'COP'` | **`entry_date` es `timestamptz`**, no `date`: de ahí el bug de «corre un día» (§H). `posted` es un **booleano**, no un estado: **no existe «anulado»**. `id` es integer. |
| `journal_lines` | `id int` · `journal_entry_id int` NN · `account_code text` NN · `description text` · `debit`/`credit numeric` DEF 0 · `organization_id int` NN DEF 0 · `currency_code`/`exchange_rate` · `debit_base`/`credit_base numeric` DEF 0 · `cost_center_id uuid` | CHECK `check_debit_credit`: **no se puede tener débito y crédito a la vez en la misma línea** — el diálogo de E.2 no lo valida. `cost_center_id` existe y **ningún formulario lo captura**. Trigger `tr_set_journal_line_org_id` rellena la organización. |
| `fiscal_periods` | `id uuid` · `organization_id int` NN · `year smallint` NN · `month smallint` · `period_type text` NN DEF `'monthly'` · `start_date`/`end_date date` **NN** · `status text` NN DEF `'open'` · `closed_by`/`closed_at` · `notes` | CHECK `status` `('open','closing','closed')` — **`'locked'` no existe** (§H). CHECK `period_type` `('monthly','quarterly','yearly')` — **`'annual'` no existe** (§H). UNIQUE `(organization_id, year, month, period_type)`. |
| `accounting_rules` | `id uuid` · `organization_id int` NN · `name text` NN · `description text` · `source_type`/`event_type text` **NN** · `debit_account_code`/`credit_account_code text` **NN** · `tax_account_code text` · `use_tax_from_document bool` DEF false · `is_active` NN DEF true · `priority smallint` DEF 0 · `conditions jsonb` · `discount_account_code text` | Los CHECK admiten **34 `source_type` y 25 `event_type`**; la UI solo ofrece 13 y 8. `conditions` y `discount_account_code` **no tienen campo**. UNIQUE `(organization_id, source_type, event_type, priority)` — por eso «Duplicar» siempre falla. |
| `cost_centers` | `id uuid` · `organization_id int` NN · `code`/`name text` NN · `parent_id uuid` · `is_active` NN DEF true | `parent_id` sin UI: la jerarquía es inalcanzable. |
| `fixed_assets` | `id uuid` · `organization_id int` NN · `code`/`name text` NN · `description` · `asset_type text` NN · `acquisition_date date` **NN** · `acquisition_cost`/`salvage_value numeric` NN DEF 0 · `useful_life_months int` NN DEF 12 · `depreciation_method text` NN DEF `'straight_line'` · `accumulated_depreciation`/`current_value numeric` NN DEF 0 · `status text` NN DEF `'active'` · `account_asset_code`/`account_depreciation_code`/`account_expense_code text` · `cost_center_id uuid` | CHECK: `asset_type` 8 valores, `depreciation_method` 3, `status` `('active','disposed','fully_depreciated','sold')`. Las **cuatro** columnas de cuentas y el centro de costo no tienen campo en el formulario. |
| `asset_depreciations` | `id uuid` · `organization_id int` NN · `fixed_asset_id uuid` NN · `period_date date` NN · `depreciation_amount`/`accumulated_after numeric` NN DEF 0 · `journal_entry_id int` | **La tabla existe y nada la escribe**: la corrida de depreciación no está implementada. |
| `budgets` / `budget_lines` | `budgets`: `id uuid` · `organization_id` NN · `name text` NN · `fiscal_year int` NN · `status text` NN DEF `'draft'` · `total_amount numeric` NN DEF 0 · `created_by`/`approved_by`. `budget_lines`: `id uuid` · `budget_id uuid` NN · `organization_id` NN · `account_code text` NN · `period int` NN · `planned_amount`/`actual_amount numeric` NN DEF 0 · **`variance numeric` GEN** · `cost_center_id uuid` | CHECK `budgets.status` `('draft','approved','active','closed')`. **`variance` es GENERADA**: se deriva de `planned_amount` y `actual_amount`. `approved_by` sin UI. |

### I.5 Configuración: impuestos, monedas, métodos de pago, consecutivos

| Tabla | Columnas | Trampas |
|---|---|---|
| `organization_taxes` | `id uuid` · `organization_id int` NN · `template_id int` · `name varchar(100)` NN · `rate numeric` NN · `description` · `is_default`/`is_active`/`tax_included bool` | Ver §G. Tiene **2 políticas RLS con `qual = true`** (verificado en `pg_policy`). |
| `tax_account_mapping` | `id uuid` · `organization_id int` NN · `tax_template_id int` · `organization_tax_id uuid` · `account_code varchar` **NN** · `account_type varchar` NN DEF `'tax_payable'` · `is_active` | **Sin ninguna pantalla**: la contabilización del impuesto no se puede configurar (§G). |
| `invoice_applied_taxes` / `invoice_purchase_applied_taxes` | `id uuid` · `invoice_id uuid` NN · `tax_code text` **NN** · `tax_rate numeric` DEF 0 · `is_applied bool` DEF true | El desglose se persiste **por código**, no por `organization_tax_id` (§G). |
| `currencies` | **PK `code bpchar`** · `name`/`symbol text` NN · `decimals int` **NN sin default** · `auto_update bool` DEF true · `is_active bool` NN DEF true | Catálogo **global**, no por organización. |
| `organization_currencies` | **PK `(organization_id, currency_code)`** · `is_base bool` DEF false · `auto_update bool` DEF true | Qué monedas usa cada organización y cuál es la base. |
| `exchange_rates` | `id int` · `organization_id int` NN · `base_currency`/`target_currency bpchar` NN · `rate numeric` NN · `is_default bool` · `source varchar` · `effective_date date` **NN** | Por organización. **1 política RLS con `qual = true`**. |
| `currency_rates` | `id uuid` · `code varchar` NN · `rate_date date` NN DEF `fn_today_system()` · `rate numeric` NN · `source text` NN · `api_data jsonb` · `base_currency_code varchar` | **Segunda tabla de tasas, global**, que usa la contabilidad (`ContabilidadService.ts:277`). Conviven dos modelos de tasa de cambio. |
| `payment_methods` | **PK `code text`** · `name text` NN · `requires_reference bool` DEF false · `is_active` · `is_system bool` DEF false | Catálogo **global**. |
| `organization_payment_methods` | `id int` · `organization_id int` NN · `payment_method_code text` NN · `is_active` · `settings jsonb` · `show_on_website bool` DEF true · `website_display_order`/`website_display_name`/`website_description`/`website_icon` · `integration_connection_id uuid` | Los 4 campos `website_*` se comparten con la tienda web. |
| `country_payment_methods` / `dian_payment_methods` | Catálogos de apoyo: recomendados por país y códigos DIAN | — |
| `payment_qr_sessions` | `id uuid` · `organization_id int` NN · `branch_id` · `payment_id uuid` · `provider_code`/`connector_code text` **NN** · `integration_connection_id` · `reference text` **NN** · `external_qr_id` · `qr_data`/`qr_image_url` · `amount numeric` **NN** · `currency bpchar` NN DEF `'COP'` · `status text` NN DEF `'pending'` · `source`/`source_id` · `customer_label` · `expires_at`/`paid_at` · `provider_response jsonb` · `created_by` | Alimenta `/app/finanzas/metodos-pago/qr-sessions` y los `payout_items`. |
| `invoice_sequences` | `id int` · `organization_id`/`branch_id int` NN · `document_type text` NN · `resolution_number varchar` · `resolution_date date` · `prefix varchar` NN · `range_start`/`range_end int` NN · `current_number int` NN DEF 0 · `valid_from`/`valid_until date` · `technical_key`/`test_set_id` · `is_active` NN DEF true · `alert_threshold int` DEF 100 · `factus_numbering_range_id int` | Alimenta las alertas de resolución DIAN del dashboard (§A.8 #6-#7), cuyo enlace apunta a una **ruta inexistente** (§H). `alert_threshold` existe y el dashboard usa un 80 % cableado en su lugar. |

### I.6 Triggers: lo que pasa sin que la UI lo pida

Esto es lo más importante para el diseño del diálogo de pago. **Insertar una fila en `payments`
dispara 11 triggers**, y varios de ellos ya recalculan la factura y la cartera:

| Tabla | Trigger | Momento | Qué hace |
|---|---|---|---|
| `payments` | `trg_normalize_payment_status` | BEFORE INSERT/UPDATE | Normaliza `status` |
| `payments` | `trg_branch_default` | BEFORE INSERT | Rellena `branch_id` si falta |
| `payments` | `tr_update_accounts_receivable_on_payment` | AFTER INSERT | Con `source='invoice_sales'`: crea la CxC si no existe o **copia `invoice_sales.balance` a `accounts_receivable.balance`**. Con `source='account_receivable'`: resta `amount + discount_amount`, deriva `status` (`paid`/`partial`) y **propaga el saldo a `invoice_sales`** |
| `payments` | `trg_recalc_invoice_balance_from_payments` | AFTER INSERT/UPDATE/**DELETE** | Recalcula `balance` (y `status` en ventas) desde la **suma de los pagos `completed`**, para la factura nueva y la anterior si el pago cambió de destino. Ignora `draft`, `void` y `voided`. En compras **solo toca el balance**, porque `status` mezcla recepción con pago |
| `payments` | `trg_auto_journal_payment` | AFTER INSERT | Asiento contable del pago |
| `payments` | `trg_auto_journal_folio_payment` · `trg_auto_journal_membership_payment` · `trg_auto_journal_parking_payment` | AFTER INSERT | Asientos de los módulos PMS / membresías / parqueaderos |
| `payments` | `trg_auto_journal_parking_reversal` | AFTER UPDATE | Reversión de parqueaderos |
| `payments` | `trg_notify_payment_registered` | AFTER INSERT | Notificación |
| `payments` | `audit_payments_trigger` | AFTER INSERT/UPDATE/DELETE | Auditoría financiera |
| `invoice_sales` | `tr_create_account_receivable` / `tr_update_account_receivable` | AFTER INSERT / UPDATE | **Crear o actualizar una factura ya crea y mantiene su cuenta por cobrar** |
| `invoice_sales` | `trg_auto_journal_sale` · `trg_auto_journal_credit_note` | AFTER INSERT | Asientos de venta y de nota de crédito |
| `invoice_sales` | `trg_auto_journal_void` | AFTER UPDATE | Asiento de anulación |
| `invoice_sales` | `trg_create_commission_on_invoice_sale` | AFTER UPDATE | Crea la comisión |
| `invoice_sales` | `audit_invoice_sales_trigger` | AFTER INSERT/UPDATE/DELETE | Auditoría |
| `invoice_purchase` | `trg_auto_journal_purchase` · `trg_create_commission_on_invoice_purchase` · `trg_notify_purchase_invoice` | AFTER INSERT/UPDATE | Asiento, comisión y notificación |
| `accounts_receivable` | `trg_auto_journal_ar` · `trg_ar_mark_customer_purchased` · `tr_update_days_overdue` · `tr_validate_accounts_receivable_relations` | — | Asiento, marca de cliente comprador, mora (solo en UPDATE) y validación de relaciones |
| `accounts_payable` | `trg_auto_journal_ap` | AFTER INSERT | Asiento |
| `ar_installments` / `ap_installments` | `trg_ar_installments_before_save` / `trg_auto_journal_ap_installment` | — | Normalización y asiento de la cuota |
| `bank_transactions` | `trg_auto_journal_bank` | AFTER INSERT | Asiento bancario |
| `sales` (POS) | `trg_auto_journal_sale_pos` · `trg_create_commission_on_sale` · `trg_pos_to_folio` · `trg_sales_mark_customer_purchased` | — | — |

**Consecuencia directa para el diseño.** El diálogo «Registrar pago» debe **insertar una fila en
`payments` y nada más**. Cualquier pantalla que además escriba a mano `invoice_sales.balance`,
`invoice_sales.status` o `accounts_receivable` está compitiendo con los triggers y produce saldos
divergentes (§H). El diálogo tampoco necesita pedir «¿crear la cuenta por cobrar?»: ya existe desde
que se emitió la factura. Y como `trg_recalc_invoice_balance_from_payments` también corre en
`DELETE`, **eliminar un pago revierte el saldo solo**: la UI no debe «deshacer» a mano.

### I.7 RLS y almacenamiento

- **RLS activa en las 25 tablas del módulo revisadas**, sin ninguna política abierta a `anon`.
  Solo dos excepciones con `qual = true` (visibles para cualquier usuario autenticado):
  `organization_taxes` (2 políticas) y `exchange_rates` (1).
- `payments` tiene 6 políticas; `support_documents`, 5; `exchange_rates`, 5.
- **El bucket `invoices` de Storage es público** (`storage.buckets.public = true`). Los PDF que
  genera `/api/facturas-venta/[id]/pdf` se suben ahí con la service role y se devuelve
  `getPublicUrl` (`app/api/facturas-venta/[id]/pdf/route.ts:200-217`): cualquiera con el uuid de la
  factura puede descargarla sin sesión. Además el `POST` toma el contenido del **cuerpo de la
  petición** y hace `upsert: true` sin validar la organización del `[id]`, así que un usuario
  autenticado de una organización puede sobrescribir el PDF de la factura de otra. Ver §H.

---

## J. Patrones repetidos y componentes comunes

### J.1 El patrón «lista con filtros + detalle + diálogo de pago»

**El patrón canónico completo (lista + filtros extraídos + detalle + diálogo de pago) existe 4 veces.**
Otras 15 pantallas son versiones degradadas, con los filtros o la tabla escritos en línea dentro del
`Page`.

| # | Carpeta | Lista | Filtros | Detalle | Diálogo de pago | Completo |
|---|---|---|---|---|---|---|
| 1 | `cuentas-por-cobrar` | `CuentasPorCobrarTable` | `CuentasPorCobrarFiltros` | `id/CuentaPorCobrarDetailPage` | `AplicarAbonoModal` + `id/AccountActionsCard` + `id/InstallmentsCard` | **sí (3 diálogos)** |
| 2 | `cuentas-por-pagar` | `CuentasPorPagarTable` | `CuentasPorPagarFiltros` | `id/CuentaPorPagarDetailPage` | `RegistrarPagoModal`, `ProgramarPagoModal`, `PayWithOpenFinanceDialog`, `id/AccountActionsCard`, `id/InstallmentsCard`, `id/cuotas/CuotasPage` | **sí (6 diálogos)** |
| 3 | `facturas-venta` | `FacturasTable` | `FacturasFiltros` | `id/DetalleFactura` | `id/RegistrarPagoDialog` | sí |
| 4 | `facturas-compra` | `FacturasCompraTable` | `FacturasCompraFiltros` | `id/DetalleFacturaCompra` | `RegistrarPagoModal` | sí |
| 5 | `cotizaciones` | `CotizacionesTable` | `CotizacionesFiltros` | `id/DetalleCotizacion` | — | sin pago |
| 6 | `comisiones` | `ComisionesList` | `ComisionesFilters` | en línea | `ClawbackDialog`, `ReasonDialog` | sin detalle |
| 7 | `facturacion-electronica` | `JobsTable` | `JobFilters` | `JobDetailDialog` (diálogo, no página) | — | sin detalle |
| 8-19 | `notas-credito`, `documentos-soporte`, `ingresos`, `egresos`, `transferencias`, `saldos-a-favor`, `presupuestos`, `activos-fijos`, `bancos`, `conciliacion-bancaria`, `periodos-contables`, `contabilidad/asientos` | Tabla en línea dentro del `Page` | En línea o inexistentes | Unas sí, otras no | 0-3 | degradado |

### J.2 Componentes comunes que deberían salir

| Componente propuesto | Reimplementaciones | Dónde |
|---|---|---|
| **`DocumentHeader`** (flecha atrás `ghost size="icon"` + icono en caja `bg-*-100 rounded-xl p-2` + h1 `text-2xl font-bold` + subtítulo o migaja + acciones con `flex-wrap`) | **≈32** | El patrón más repetido del módulo. Detalles: `facturas-venta/id/DetalleFactura:700` · `facturas-compra/id/DetalleFacturaCompra:379` · `cotizaciones/id/DetalleCotizacion:271` · `notas-credito/NotaCreditoDetalle:227` · `documentos-soporte/SupportDocumentDetail:236` · `egresos/EgresoDetalle:131` · `ingresos/IngresoDetalle:132` · `transferencias/TransferenciaDetalle:140` · `contabilidad/asientos/AsientoDetailPage:107` · `cuentas-por-cobrar/id/…:182` · `cuentas-por-pagar/id/…:173` · `conciliacion-bancaria/ConciliacionDetailPage:169` · `bancos/cuentas/CuentaDetailPage:168`. Listas: **4 `PageHeader` distintos** (`cotizaciones/`, `facturas-venta/`, `facturas-compra/`, `bancos/BancosPageHeader`) + 2 `PageBackHeader` + los escritos en línea. **No hay ningún `PageHeader` compartido en `components/common/`.** Conviven tres botones de volver: `<Link><Button variant="ghost" size="icon">`, `<Link className="p-2 rounded-lg hover:bg-gray-100">` y `router.back()` |
| **`StatusBadge`** de documento | **≈38 mapas distintos**, ~140 variantes | Ninguno reutiliza a otro. Solo **2** están extraídos como componente, **se llaman igual y son incompatibles**: `cuentas-por-cobrar/id/AccountStatusBadge.tsx` («Al día» verde / «Vencida» roja / «Pagada» **azul** / «Parcial» **amarillo** / «Desconocido») frente a `cuentas-por-pagar/id/AccountStatusBadge.tsx` («Pendiente» amarillo / «Pago Parcial» **morado** / «Pagada» **verde** / «Vencida» rojo). El único realmente compartido del módulo es `FactusStatusBadge`, usado 3 veces |
| **`AplicarPagoDialog`** (contexto + monto con atajos «Pago total»/«50%» + fecha + método + referencia condicional + cuenta bancaria + notas + resumen proyectado) | **11** (+2 afines) | `cuentas-por-cobrar/AplicarAbonoModal:43` · `cuentas-por-cobrar/id/AccountActionsCard:42` · `cuentas-por-cobrar/id/InstallmentsCard:64` · `cuentas-por-pagar/RegistrarPagoModal:63` · `cuentas-por-pagar/ProgramarPagoModal:64` · `cuentas-por-pagar/PayWithOpenFinanceDialog:72` · `cuentas-por-pagar/id/AccountActionsCard:42` · `cuentas-por-pagar/id/InstallmentsCard:69` · `cuentas-por-pagar/id/cuotas/CuotasPage:85` · `facturas-venta/id/RegistrarPagoDialog:63` · `facturas-compra/RegistrarPagoModal:57`. Afines: `saldos-a-favor/AplicarSaldoFavorDialog:35` · `cuentas-por-pagar/AprobacionPagosModal:42`. **Los pares CxC↔CxP de `id/AccountActionsCard` y de `id/InstallmentsCard` son clones línea a línea**, y cada uno reimplementa `montoExcedido`, `requiereReferencia` y `fechaError`. Cinco repiten el par «Pago total» / «50%». **8 ficheros distintos insertan en `payments`** |
| **`TablaLineasDocumento`** | **7** (+2 de asiento) | Lectura: `facturas-venta/id/ItemsDetalle` (**el único reutilizado**: detalle de factura y de nota de crédito) · `facturas-compra/id/DetalleFacturaCompra:603` · `cotizaciones/id/DetalleCotizacion:397` · `documentos-soporte/SupportDocumentDetail:329`. Edición: `facturas-venta/nueva-factura/ItemsFactura` (**reutilizado 3 veces**: factura de venta, cotización, documento soporte) · `facturas-compra/nueva-factura/SelectedProductsTable` (tarjetas, no tabla) · `facturas-venta/id/NotaCreditoDialog:642`. Asientos: `AsientoDetailPage:215` · `AsientosPage:436` |
| **`FiltrosDocumento`** | **13** (7 extraídos + 6 en línea) | Extraídos: `CuentasPorCobrarFiltros` · `CuentasPorPagarFiltros` · `FacturasFiltros` · `FacturasCompraFiltros` · `CotizacionesFiltros` · `JobFilters` · `ComisionesFilters`. En línea: `SupportDocumentsPage:210` · `NotasCreditoPage:277` · `EgresosPage:238` · `IngresosPage:249` · `TransferenciasPage:241` · `monedas/ExchangeRateHistory:266-321` |
| **`ResumenTotales`** | **9** (+7 bloques «saldo pendiente») | `facturas-compra/id/ResumenTotalesFactura:119-180` · `facturas-compra/nueva-factura/ResumenFactura:57-99` · `facturas-venta/id/DetalleFactura:1046-1066` · `ImpuestosFactura:423-569` · `ImpuestosFacturaCompra:171-230` · `DetalleCotizacion:426-446` · `NuevaCotizacionForm:488` · `NotaCreditoDetalle:346-400` · `SupportDocumentDetail:364-378`. **Cuatro juegos de etiquetas distintos** para lo mismo, y uno («Subtotal» sin dos puntos) desalineado |
| **`SelectorPeriodo`** | **8** | Los tres bloques «Fecha Inicio + Fecha Fin + Consultar» de `BalanceComprobacionPage:113/117`, `EstadoResultadosPage:92/96` y `MayorContablePage:111/115` son **idénticos** salvo el icono del botón (Calendar vs Search) y el valor por defecto. Variante de una sola fecha: `BalanceGeneralPage:87`. Más `CuentasPorCobrarFiltros:176/189`, `CuentasPorPagarFiltros:291/306`, `FacturasCompraFiltros:179/192` y `ExchangeRateHistory:60-61`. **El único con presets** («Hoy», «Esta semana», «Este mes», «Este trimestre», «Este año») es `reportes/ReportesPage:46-50` |
| **`StatCards`** | **≈26** (6 extraídos + ≈20 rejillas en línea) | Extraídos: `EstadisticasCards` (CxC) · `ResumenCuentasPorPagar` · `BankStatsCards` · `facturacion-electronica/StatsCards` · `dashboard/KPICards` · `ComisionesSummary`. Los de ingresos, egresos, transferencias y notas de crédito comparten el **mismo shape** (`total`, `thisMonth`, `today`) con marcado idéntico. Dos maquetas conviven: `CardHeader`+`CardContent` y `CardContent py-3` |
| **`ExportarDocumento`** | **18 ficheros** repiten el mismo bloque `Blob → createObjectURL → a.download → a.click → revokeObjectURL` con nombre `<modulo>_${new Date().toISOString().split('T')[0]}.csv` | `balance-comprobacion:70-75` · `AgingReport:68-75` · `CuentasPorCobrarFiltros:54-61` · `CuentaPorCobrarDetailPage:97-103` · `cuentas-por-pagar/id/AccountActionsCard:173-179` · `CuentaPorPagarDetailPage:100-106` · `ExportarBancaModal:232-245` · `SupportDocumentDetail:151-156` · `EgresoDetalle:100-105` · `EgresosPage:123-128` · `IngresoDetalle:101-106` · `IngresosPage:134-139` · `TransferenciaDetalle:109-114` · `TransferenciasPage:129-134` · `NotasCreditoPage:169-174` · `DetalleFactura:831-835, 855-860` · `ImportarCSVDialog:263-267` · `ExchangeRateHistory:178-182`. **Contraste**: las 6 exportaciones de `/app/finanzas/reportes` no hacen nada |
| **`PaginacionTabla`** | **8, con 3 algoritmos distintos** de «qué números mostrar» | `CuentasPorCobrarTable:435-480` (shadcn `Pagination`) · `PaymentHistoryCard:234-258` (manual) · `CuentasPorPagarTable:393` (`DataTablePagination`) · `FacturasTable:697-786` · `FacturasCompraTable:365-413` (**lógica distinta de la anterior**) · `impuestos/TaxesTable:388-458` (`Array.from` + **`window.innerWidth` dentro del render**) · `monedas/ExchangeRateHistoryPagination` (**el único extraído**) · `SupportDocumentsPage:262-270` |
| **`ConfirmarAccionDialog`** | **2 estilos, 27 llamadas nativas** | Del kit: `impuestos/DeleteTaxDialog` (**el único componente extraído**), `facturas-venta/id/AnularFacturaDialog` y su clon `facturas-compra/id/AnularFacturaCompraDialog`, `ConfirmDialog` de comisiones. Frente a ellos, **27 `window.confirm`/`prompt` en 19 ficheros** (§H.6) |

### J.3 Selectores de cliente y de proveedor

**`grep` de `pos/CustomerSelector` en `src/components/finanzas/**` y `src/app/app/finanzas/**`:
0 coincidencias.** Ninguna de las 22 implementaciones catalogadas en la sección F de la auditoría de
productos/POS está en Finanzas: aquella inventaría POS, PMS, CRM, clientes e inventario. Las 7 de
aquí son **nuevas**, y las de proveedor inauguran una segunda familia con el mismo problema (la
sección F no cubre selectores de proveedor en absoluto).

| Componente (archivo:línea) | Dónde se usa | Control | Cómo busca | Crear inline |
|---|---|---|---|---|
| **`ClienteSelector`** `facturas-venta/nueva-factura/ClienteSelector.tsx:38` | Nueva/editar factura de venta (`NuevaFacturaForm:1217`) y nueva/editar cotización (`NuevaCotizacionForm:340`) | `Select` de shadcn con un `Input` **sticky** dentro del `SelectContent` (patrón propio, no `Command`/`Popover`) | Servidor. Carga inicial `.limit(100)` (:188-193). Búsqueda `.or('full_name.ilike, email.ilike, phone.ilike, company_name.ilike, trade_name.ilike, identification_number.ilike')`, orden `full_name`, `.limit(50)`, **debounce 300 ms** (:75-81, 141-145). Contacto principal de empresas vía `customer_company_links` (:90-99) | Sí — `ClienteFormDialog` de `@/components/shared/form-dialogs` (:331-337) |
| `saldos-a-favor/NuevoSaldoFavorDialog.tsx:117-128` | Diálogo «Nuevo saldo a favor» | `Select` plano | Servidor, `select('id, full_name')`, `order('full_name')`, **sin `limit` y sin búsqueda**: trae todos los clientes de la organización | No |
| `facturas-venta/FacturasTable.tsx:303-306` | Resolución del nombre en el listado | — | `select('id, full_name, first_name, last_name')` **sin `limit`** | No |
| `cuentas-por-cobrar/CuentasPorCobrarFiltros.tsx:134-143` | Filtro «Cliente» de CxC | `Input` de texto libre | **Roto**: manda texto a un parámetro `uuid` (§H.2) | No |
| **`SupplierSelector`** `facturas-compra/nueva-factura/SupplierSelector.tsx:26` | `InformacionBasicaForm:209` | Mismo patrón `Select` + `Input` sticky | Servidor: `.or('name.ilike, nit.ilike, contact.ilike, email.ilike')`, orden `name`, `.limit(50)`, **debounce 300 ms** (:81-87, 118-122). Si la consulta falla, **cae a filtro en memoria** sobre la lista recibida por props (:106-111). La carga inicial la hace el padre con `select('*')` **sin `limit`** (`FacturasCompraService:952-956`) | Sí — `ProveedorFormDialog` (:238-242) |
| **`ProviderSelector`** `documentos-soporte/ProviderSelector.tsx:60` | `SupportDocumentForm:547` | Idéntico | **Clon de `SupplierSelector`** con tres diferencias: añade `.eq('is_active', true)`, selecciona 17 columnas DIAN, carga inicial propia `.limit(50)`, y **sin** fallback en memoria. **Mismos literales palabra por palabra**; solo cambia el color del spinner (morado vs azul) | Sí — `ProveedorFormDialog` |
| `cuentas-por-pagar/CuentasPorPagarService.ts:755-775` · `FacturasCompraService.ts:950-968` | Filtros «Proveedor» de CxP y de compras | `Select` | `suppliers` con `accounts_payable!inner(balance)` y `.gt('balance', 0)`, o `select('*')`; ambos **sin `limit`** | No |

**Para el rediseño**: `ClienteSelector`, `SupplierSelector` y `ProviderSelector` comparten el mismo
patrón (Select con Input sticky, debounce 300 ms, `.limit(50)`, diálogo de alta en línea) y
**divergen del `CustomerSelector` del POS** (Popover `w-96` en escritorio / `Dialog` en móvil,
`POSService.searchCustomers` con 7 columnas en el `ilike`, avatar, soporte offline, badge «Pendiente
de sincronizar»). Un **`EntityPicker`** único cubriría las 7 de Finanzas y las 22 de la sección F,
porque las diferencias reales son solo tres: la tabla, las columnas del `ilike` y el diálogo de alta.

### J.4 Formateo de dinero y de fecha

**Moneda: 6 implementaciones, ninguna consulta la moneda de la organización.** `es-CO` está cableado
en las seis y `'COP'` aparece literal **85 veces** en `src/components/finanzas/**`.

1. `formatCurrency` de `@/utils/Utils` (`:69-80`, `currency='COP'` por defecto) — **~92 ficheros**.
   Solo 4 pasan la moneda explícitamente.
2. `Intl.NumberFormat('es-CO', {min:0, max:2})` **sin `style:'currency'`** — 6 cuerpos idénticos que
   **no pintan símbolo**: activos fijos, balance de comprobación, balance general, estado de
   resultados, mayor contable y presupuestos.
3. `Intl.NumberFormat('es-CO', {style:'currency'})` en línea — 4 sitios.
4. `.toLocaleString()` crudo con `$` manual — 6 sitios, uno **sin locale** y dos con el locale del
   navegador.
5. `formatNumber` de Utils — 2 sitios.
6. `` `$${x.toFixed(2)}` `` — **sin separador de miles y con punto decimal** en el bloque de totales
   de la factura de venta (`ImpuestosFactura:425, 537, 548, 562`).

Además `formatCurrency` fuerza **2 decimales siempre**: en COP se pinta «$ 50.000,00», que no es
como se escribe un peso colombiano. Y `getOrgBaseCurrency` existe
(`lib/services/crm/salesTargetService.ts`) y lo usan CRM y POS, pero **ningún fichero de
`src/components/finanzas/**` lo llama**.

**Fecha: 5 convenciones coexistiendo.** `formatDate`/`parseLocalDate` **deprecated** en 32 ficheros;
`useFormatDate()`/`formatDateInTz`/`formatPlainDate` (correcto) en 12; un formateador local propio
sin huso en 11 (con clones exactos entre bancos y conciliación); `date-fns` en 8; y
`toISOString().split('T')[0]` en 35. **Asimetría clave**: `cuentas-por-pagar/id/*` fue migrado a
`dateDisplay`, y sus **clones exactos** en `cuentas-por-cobrar/id/*` siguen con parches manuales
`dateString + 'T00:00:00'`.

### J.5 Otros datos transversales

- **0 usos de `useTranslations`** en los 174 componentes de `src/components/finanzas/**`: el módulo
  entero está en español duro pese a existir `messages/{en,fr,pt}.json`.
- **Dos sistemas de notificación conviviendo**: `toast()` de `sonner` (CxC, detalles de CxC/CxP,
  cuotas, transferencias) y `useToast()` de `@/components/ui/use-toast` (CxP listado, ingresos,
  egresos, saldos a favor, métodos de pago, comisiones). **333 llamadas** en total.
- **`BranchBadge`**: 18 ficheros. **`BranchSelectorField`**: 7. **`CopyableId`**: 12.
- **`ui/pagination`: 3 usos. `ui/alert-dialog`: 4. `ui/confirm-dialog`: 2. `ui/date-picker`: 3.**
  Frente a 27 `confirm()` nativos y 8 paginaciones a mano.
- **Esqueletos: ~12 patrones distintos** — `PageHeaderSkeleton`+`StatsSkeleton`+`CardListSkeleton`
  (10 pantallas, copia literal del mismo bloque de 8 líneas), `DetailSkeleton`, `TableSkeleton` (con
  el número de columnas **mal en 4 sitios**), barras `animate-pulse` a mano y spinners circulares.

---

## K. Conteo de controles por pantalla

«Controles» = filas inventariadas en las tablas de este documento (incluye textos, badges y estados),
no elementos del DOM. Los botones por fila (menú «…», copiar, checkbox) se cuentan una vez.

| Bloque | Pantalla | Controles | Diálogos | Columnas |
|---|---|---|---|---|
| **A** | A.0 Redirector `/app/finanzas` | 4 | 0 | — |
| | A.1 Marco `ModuloSection` | 12 | 0 | — |
| | A.2 Carga de datos | 6 | 0 | — |
| | A.3 KPIs | 10 | 0 | — (8 tarjetas) |
| | A.4 Ventas vs Compras | 8 | 0 | — |
| | A.5 Antigüedad de cartera | 8 | 0 | — |
| | A.6 Flujo proyectado | 9 | 0 | 6 |
| | A.7 Top clientes/proveedores | 7 | 0 | — |
| | A.8 Alertas | 11 | 0 | — |
| | **Subtotal A** | **75** | **0** | **6** |
| **B** | B.1 Facturas de venta (lista) | 74 | 2 | 13 + 5 |
| | B.2 Detalle de factura de venta | 91 | **7** | 7 + 5 + 6 |
| | B.3 Nueva factura de venta | 64 | 3 | 7 |
| | B.4 Editar factura de venta | 9 (+64 heredados) | 3 | 7 |
| | B.5 Facturas de compra (lista) | 41 | 2 nativos + 1 modal | 9 |
| | B.6 Detalle de factura de compra | 44 | 2 + 1 `alert` | 6 + 5 |
| | B.7 Nueva/editar factura de compra | 45 | 3 + 1 popover | 0 (tarjetas) |
| | B.8 Notas de crédito (lista) | 19 | 2 nativos | 7 |
| | B.9 Detalle de nota de crédito | 20 | 2 nativos | 7 |
| | B.10 Cotizaciones (lista) | 18 | 1 nativo | 7 |
| | B.11 Detalle de cotización | 27 | 1 | 6 |
| | B.12 Nueva/editar cotización | 21 | 3 | 7 |
| | B.13 Documentos soporte (lista) | 15 | 0 | 7 |
| | B.14 Detalle de documento soporte | 18 | 1 nativo | 7 |
| | B.15 Nuevo documento soporte | 23 | 2 | 7 |
| | B.16 Facturación electrónica | 36 | 1 (+5 secciones plegables) | 8 |
| | **Subtotal B** | **≈565** | **20 del kit + 10 nativos** | **≈120** |
| **C** | C.1 Cuentas por cobrar (4 pestañas) | 81 | 2 | 8 + 8 + 8 = **24** |
| | C.2 Detalle de cuenta por cobrar | 63 | 6 | 0 (listas) |
| | C.3 Cuentas por pagar (4 pestañas) | 53 + 68 en diálogos | **6** | 8 + 3 + 5 = 16 |
| | C.4 Detalle de cuenta por pagar | 54 | 5 | 0 |
| | C.5 Plan de cuotas (**ruta huérfana**) | 26 | 3 | 0 |
| | C.6 Ingresos (lista + modal) | 64 | 3 | 7 |
| | C.7 Detalle de ingreso | 31 | 2 nativos | 0 |
| | C.8 Egresos (lista + modal) | 56 | 3 | 7 |
| | C.9 Detalle de egreso | 31 | 2 nativos | 0 |
| | C.10 Métodos de pago (2 pestañas) | 113 | 1 | 11 |
| | C.10.3 Pasarelas (**huérfano**) | 39 | 0 | 0 |
| | C.11 Sesiones QR | 13 | 0 | 7 |
| | C.12 Transferencias (lista + modal) | 30 | 3 | 8 |
| | C.13 Detalle de transferencia | 19 | 2 nativos | 0 |
| | C.14 Saldos a favor (+2 diálogos) | 27 | 2 | 7 |
| | C.15 Comisiones | 53 | 5 | 9 / 7 |
| | **Subtotal C** | **≈821** | **36 del kit + 10 nativos** | **≈96** |
| **D** | D.1 Bancos (lista) | 44 | 0 | 0 (tarjetas) |
| | D.2 Detalle de cuenta | 34 | 0 | 0 |
| | D.3 Movimientos | 28 | 1 | 0 |
| | D.4 Nueva cuenta | 17 | 0 | — |
| | D.5 Conciliación (lista) | 20 | 0 | 0 |
| | D.6 Nueva conciliación | 12 | 0 | — |
| | D.7 Detalle de conciliación (+IA) | 41 | 1 | 0 |
| | D.8 Tesorería | 26 | 0 | 12 |
| | D.9 Anomalías | 20 | 1 | 7 |
| | D.10 Open Finance | 26 | 0 | 0 |
| | D.11 Consentimientos | 16 | 1 | 6 |
| | D.12 PayFac cuentas | 22 | 1 | 8 |
| | D.13 PayFac dispersiones | 19 | 1 | 9 + 5 |
| | **Subtotal D** | **325** | **6** | **47** |
| **E** | E.1 Contabilidad (hub) | 30 | 0 | — |
| | E.2 Asientos | 33 | 1 | 6 + 5 |
| | E.3 Detalle de asiento | 15 | 0 | 4 |
| | E.4 Plan de cuentas | 24 | 1 | árbol |
| | E.5 Balance de comprobación | 12 | 0 | **9** |
| | E.6 Estado de resultados | 11 | 0 | 2 × 2 |
| | E.7 Balance general | 10 | 0 | 2 × 3 |
| | E.8 Mayor contable | 15 | 0 | 7 |
| | E.9 Períodos fiscales | 17 | 2 | — (tarjetas) |
| | E.10 Periodos contables (**huérfana**) | 19 | 3 | 7 |
| | E.11 Reglas contables | 24 | 1 | 7 |
| | E.12 Centro de costos | 14 | 1 | — (lista) |
| | E.13 Activos fijos | 18 | 1 | 9 |
| | E.14 Presupuestos | 15 | 1 | 5 |
| | **Subtotal E** | **257** | **11** | **62** |
| **F** | F.0 Navegación del módulo | 34 (28 entradas + 6 controles) | 0 | — |
| | F.1 Impuestos | 44 | 2 | 7 |
| | F.2 Monedas (4 pestañas + 2 sub) | 58 | 1 nativo | 6 + 5 + 7 = 18 |
| | F.3 Reportes | 16 | 0 | — (6 tarjetas) |
| | **Subtotal F** | **152** | **2 + 1 nativo** | **25** |
| | **TOTAL DEL MÓDULO** | **≈2 195** | **≈75 del kit + ≈21 nativos** | **≈356** |

Para comparar: la auditoría de productos y POS contó **273 controles** solo en el detalle de producto.
**Finanzas es del orden de tres veces más grande que todo aquel alcance**, con 64 rutas frente a 30.

Otros totales verificados con `grep` sobre `src/components/finanzas/**`: **45 ficheros** con
`DialogContent`/`AlertDialogContent`, **43** con tabla, **333** llamadas a toast, **227**
placeholders, **102** textos de estado vacío, **54** ficheros con `Skeleton`, **71** con spinner,
**18** con exportación a fichero y **236** `console.log`.

---

## L. Recomendación de rediseño

Criterio: «diseñar de nuevo» = la pantalla no existe en Figma o lo que existe cubre menos de la mitad
de sus controles; «completar» = existe y faltan estados, diálogos o sub-bloques; «no diseñar» = la
pantalla no debería sobrevivir al rediseño.

### L.1 Las 6 plantillas que cubren las 64 rutas

Lo primero no es dibujar 64 pantallas: es dibujar **6 plantillas con variantes**. El grueso del
módulo son copias con otro color y cuatro literales distintos.

| # | Plantilla | Cubre | Variantes |
|---|---|---|---|
| 1 | **Listado de documentos** (cabecera + KPIs + filtros + pestañas + tabla + menú «…» + paginación) | B.1, B.5, B.8, B.10, B.13, B.16, C.1, C.3, C.10, C.11, C.12, C.14, C.15, D.5, E.2, E.10, E.11, E.13 | con/sin pestañas · con/sin KPIs · tabla vs tarjetas |
| 2 | **Detalle de documento** (cabecera con badge y barra de acciones + KPIs + paneles + tabla de líneas + totales + historial) | B.2, B.6, B.9, B.11, B.14, C.2, C.4, D.2, D.7, E.3 | venta / compra / cartera / bancario |
| 3 | **Formulario de documento** (cabecera + datos generales + selector de tercero + líneas + impuestos y totales + condiciones + acciones) | B.3, B.4, B.7, B.12, B.15, D.4, D.6 | venta / compra / cotización / soporte |
| 4 | **Movimiento simple** (lista de 7 columnas + 4 KPIs + detalle con tarjeta destacada) | C.6-C.9, C.12, C.13, D.3 | ingreso verde / egreso rojo / transferencia azul |
| 5 | **Informe** (cabecera + selector de periodo + tabla o árbol + totales + exportar) | E.5, E.6, E.7, E.8, D.8, F.3 | rango / fecha de corte / cuenta |
| 6 | **Configuración** (lista con toggles y orden + formulario en pestaña o diálogo) | E.4, E.9, E.12, E.14, F.1, F.2, D.12 | — |

Más **4 componentes transversales**: `DocumentHeader`, `StatusBadge` parametrizado,
`AplicarPagoDialog` y `EntityPicker` (§J).

### L.2 Diseñar de nuevo (prioridad 1)

| # | Pantalla | Volumen real | Por qué | Sección |
|---|---|---|---|---|
| 1 | **`AplicarPagoDialog` único** | 11 copias | Es el control con más dinero en juego del ERP y hay **11 versiones incompatibles**, dos de ellas clones línea a línea. El diseño debe fijar un solo diálogo y **un solo contrato: insertar en `payments` y nada más** (§I.6) | J.2, H.1 |
| 2 | **Detalle de factura de venta** (B.2) | 91 controles, 7 diálogos, 12 acciones en cabecera | La pantalla más densa del módulo; hoy la barra de acciones ocupa 2-3 líneas en pantallas medianas. Necesita jerarquía (acción primaria + «…») y pestañas | B.2 |
| 3 | **Cuentas por cobrar y por pagar** (C.1, C.3) | 81 + 121 controles, 24 + 16 columnas, 8 diálogos | Las dos gemelas más grandes, **con dos lenguajes de badge incompatibles** y, en CxC, dos árboles distintos (tabla y tarjetas) en lugar de uno responsive | C.1, C.3, J.2 |
| 4 | **Los 4 informes contables** (E.5-E.8) | 12 + 11 + 10 + 15 | Sin tildes, sin exportación (salvo uno), sin estados vacío ni de error, sin paginación, con tablas nativas y un `BranchBadge` que miente. Son los documentos que el contador imprime: hoy no son presentables | E.5-E.8 |
| 5 | **`StatusBadge` parametrizado** | 38 mapas, ~140 variantes | Antes de dibujar nada más hay que decidir el lenguaje de estado (§L.4) | J.2 |
| 6 | **Navegación del módulo** (F.0) | 28 entradas en una columna `w-56` | El problema de usabilidad más visible. Hay que agrupar por vertical y decidir qué entra | F.0 |
| 7 | **Plan de cuotas** (C.2-bis, C.4-bis, C.5) | 3 implementaciones | Ninguna es una tabla; las tres difieren en badges y en si muestran principal/interés | J.2 |
| 8 | **Métodos de pago + pasarelas** (C.10) | 113 + **39 huérfanos** | Hay que decidir si las pasarelas entran o se borran: son 24 campos de credenciales sin ruta | C.10, H.3 |

### L.3 Completar (prioridad 2)

| Pantalla | Qué añadir |
|---|---|
| Dashboard (A.3-A.8) | Selector de periodo (hoy el rango es fijo a 30 días y no hay control), tramos de antigüedad clicables, filas de «Top clientes» enlazadas, y quitar las líneas de tendencia falsas de los KPIs |
| Formularios de documento (B.3, B.7, B.12, B.15) | Confirmación de salida con cambios sin guardar (solo la tiene la compra), previsualización del PDF, selector de sucursal en documento soporte, y un solo bloque de totales (la cotización pinta dos) |
| Facturación electrónica (B.16) | El desglose tributario que la DIAN valida — hoy **no muestra ni una cifra de impuesto** —, la pantalla de configuración a la que ya apunta un botón, y reintento en lote |
| Bancos (D.1-D.4) | Buscador, filtros, orden y paginación (no hay ninguno), vista de tabla además de tarjetas, e importación de extracto real |
| Conciliación (D.5-D.7) | Reabrir una conciliación cerrada, adjuntar el extracto, exportar el acta, y bloquear el cierre con diferencia ≠ 0 |
| Contabilidad (E.2-E.4) | Paginación, filtro por rango de fechas, edición y anulación de asientos, centro de costo por línea, y selector de cuenta con búsqueda y árbol |
| Presupuestos y activos fijos (E.13, E.14) | **Alta y edición de líneas presupuestales** (hoy un presupuesto no se puede llenar) y **corrida de depreciación** (hoy nada actualiza el valor) |
| Impuestos (F.1) | Ver §L.5 |

### L.4 Decisiones que el diseño tiene que tomar antes de dibujar

1. **Un solo lenguaje de estado.** Hoy `paid` es **azul** en cartera por cobrar y **verde** en cartera
   por pagar y en facturas; `partial` es «Parcial» ámbar en unos sitios y «Pago Parcial» morado en
   otros; `draft` es gris en el listado de facturas y amarillo en su propio detalle; `void` es rojo
   en el listado y gris en el detalle. Propuesta: 6 tonos fijos (borrador gris · emitido azul ·
   parcial ámbar · pagado verde · vencido rojo · anulado gris tachado) y **una sola etiqueta por
   estado**, con las de compra y cartera como variantes de texto, no de color.
2. **Nada dice «IVA».** Toda etiqueta de impuesto es `{nombre} {tasa}`. Hoy hay «IVA» cableado en la
   cabecera y los totales de documento soporte, en la tabla de cotización, en los tres controles de
   Reglas Contables y en las tres métricas de Reportes (§G.6 #23).
3. **Las retenciones no existen**: ni campo, ni resta, ni certificado (§G.3). Si entran en el
   rediseño, hay que diseñarlas de cero, empezando por tipificar el tributo.
4. **Un solo `DocumentHeader`.** 32 cabeceras, 4 `PageHeader` distintos, 3 botones de volver y tres
   flechas «atrás» que apuntan a `/app/finanzas`, que **ya no es un hub sino un redirector**.
5. **Qué pasa con las 6 rutas huérfanas** (`/reportes`, `/periodos-contables`, `/open-finance`,
   `/payfac/*`, `/cuotas`) y con las **dos pantallas de periodos** que leen la misma tabla (§E.15).
6. **Permisos.** Hoy no hay ni uno, y las claves i18n del gate («Dashboard restringido») existen sin
   usarse. Si el rediseño va a tener estados «sin permiso», hay que inventarlos: no hay nada que
   calcar.
7. **Móvil.** Cinco pantallas tienen **dos árboles completos** (tabla + tarjetas) en lugar de una
   tabla responsive; otras nueve tienen tablas de 7-9 columnas **sin scroll horizontal ni
   alternativa**. Hay que elegir una sola estrategia.

### L.5 Impuestos: qué añadir (ampliando la recomendación de la sección E de productos/POS)

Aquella auditoría ya pedía «Tipo de tributo», «Aplica sobre», «Exento» y «Código DIAN» en `TaxForm`,
y un `MultiSelect` de impuestos en el producto. Desde Finanzas hay que sumar:

- **Cuenta contable por impuesto**: `tax_account_mapping` existe, tiene UNIQUE por impuesto y
  **ninguna pantalla la usa**; hoy el IVA generado y el descontable van a la misma cuenta `2405`
  (§G.5). Sin eso, el saldo contable del impuesto no es conciliable con la declaración.
- **Retenciones** como líneas negativas en el resumen de totales de los seis documentos, con su
  concepto, base mínima en UVT, tarifa y ciudad para ICA (§G.3).
- **Un solo motor de cálculo**: hoy hay **seis** (POS `calculateItemTaxes`, `TaxSummary`,
  `CheckoutDialog`, `resolveLineTax`, `calculateCartTaxes` reutilizado por la factura de compra, y el
  agrupador por tasa del detalle de nota de crédito), y **seis estrategias distintas de resolver el
  nombre del impuesto**.
- **Coherencia del `tax_templates!inner`**: hoy un impuesto personalizado se aplica en la factura de
  compra y desaparece en la de venta y en la cotización (§G.2 #16).
- **El monitor de facturación electrónica debe mostrar el desglose tributario** que la DIAN valida
  (§G.4 #17).

### L.6 Lo que no hay que calcar

Las listas de §H son la lista negra. En particular, **no se dibujan**: los 27 `confirm()`/`prompt()`
nativos, los 9 `window.alert`, los 6 botones de exportar de Reportes que no exportan, los dos
«Registrar Pago» del detalle de compra (uno es un botón de pruebas con borde punteado), el chip de
depuración de Monedas, el volcado de JSON crudo de la cola de facturación electrónica, las tres
paginaciones distintas, los dos bloques de totales de la cotización, el «Monto Transferido» repetido
dos veces en el detalle de transferencia, y las 39 pantallas de pasarela que ninguna ruta renderiza.
