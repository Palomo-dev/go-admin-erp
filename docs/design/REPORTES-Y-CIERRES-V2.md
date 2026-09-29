# Reportes y cierres v2 — todos los módulos (Figma)

Fecha: 2026-09-29 · Archivo Figma `EAvjINVRnlzFM70GVoWXgl` · Manual de marca v2.0
(página 01 Sistema). Estado: **propuesta en Figma, sin código**.

## 1. Qué había y por qué no bastaba

La página **14 Reportes** tenía 8 secciones (1198:218895 … 1235:765319), todas
alrededor de la franja horaria: pestañas Resumen · Ventas · Productos vendidos ·
Por trabajador · Cierres · Todos los reportes.

Problemas de experiencia de usuario:

| Problema | Efecto |
|---|---|
| Navegación por tipo de venta | Contabilidad, finanzas, compras, nómina y CRM quedaban escondidos en «Todos los reportes». |
| Filtros globales que no aplican a todo | Franja y trabajador parecían afectar a cualquier reporte; los contables los ignoran sin avisar. |
| El cierre solo tenía secciones de ventas | No se podía cerrar un mes con contabilidad, bancos, compras o nómina. |
| Textos cortados o encimados | El detalle de «Descuentos» se cortaba; en el diálogo, «Devoluciones, anulaciones y descuentos» chocaba con la columna vecina. |

El catálogo del código (`src/lib/services/reportes/reportesCatalogo.ts`) tiene
**69 reportes en 19 archivos de módulo**:

| Archivo | Reportes | Archivo | Reportes |
|---|---|---|---|
| chat | 4 | operaciones | 2 |
| clientes | 3 | organización | 3 |
| contabilidad | 3 | parking | 3 |
| crm | 6 | pm | 2 |
| finanzas | 10 | pms | 3 |
| gym | 3 | roles | 2 |
| hrm | 3 | seriales | 4 |
| integraciones | 2 | transporte | 3 |
| inventario | 4 | ventas | 6 |
| notificaciones | 3 | **Total** | **69** |

- Solo clientes, finanzas, inventario, seriales y ventas respetan horas
  (`getOrgDateRange`).
- No hay reportes de compras.
- Contabilidad solo tiene estado de resultados, balance general y presupuesto
  contra real.

## 2. Qué se diseñó (sección 9, página 14 Reportes)

Sección `1274:6026` «9. Centro de reportes v2 — todos los módulos (propuesta)»,
en y = 14336 y de 5040 × 1805 px. Tiene entrada enlazada en el Índice
(`1235:767457`).

| Nodo | Pantalla | Qué resuelve |
|---|---|---|
| `1274:6027` | Inicio de Reportes (1440 × 1425) | Buscador (tecla `/`) con periodo y sucursal globales. KPIs de todo el negocio: ventas, utilidad neta, caja y bancos, por cobrar, por pagar e inventario. Recientes con favorito. 9 tarjetas de módulo con 3 reportes cada una y etiquetas de los filtros que admite cada reporte. Aviso de los 4 módulos no contratados (12 reportes). |
| `1279:6586` | Visor: Estado de resultados (1440 × 1042) | Migas Reportes › Contabilidad. Vistas en pestañas: Resumido, Por cuenta (PUC), Por sucursal, Por centro de costo y Tendencia 12 meses. Filtros: periodo, comparativo y sucursal; «Franja: no aplica» deshabilitado. Tabla con subtotales. Panel «Lectura rápida» con alertas accionables (3 asientos fallidos → «Resolver asientos») y la lista de los filtros que admite el reporte. |
| `1283:17` | Diálogo «Generar cierre» v2 (640 × 1485) | Plantillas (Completo, Contable y financiero, Ventas y caja, Personalizada). Capítulos por módulo con casillas completas o parciales y contador «5 de 7»; Ventas desplegado con 8 reportes. Botón «Vista previa». La franja solo afecta a los capítulos que la admiten. |

Agrupación de módulos en la interfaz (conteos con los reportes nuevos propuestos):

| Tarjeta | Archivos del catálogo | Reportes |
|---|---|---|
| Contabilidad | contabilidad + 4 nuevos | 7 |
| Finanzas y tesorería | finanzas + 2 nuevos | 12 |
| Ventas y POS | ventas | 6 |
| Inventario | inventario + seriales + 1 nuevo | 9 |
| Compras | 3 nuevos | 3 |
| Personas (nómina) | hrm | 3 |
| Clientes y CRM | clientes + crm | 9 |
| Atención y mensajería | chat + notificaciones | 7 |
| Operación y organización | organización + roles + integraciones + operaciones + pm | 11 |
| No contratados (ejemplo) | pms, parking, gym, transporte | 12 |

La lista de módulos visibles sale del plan (`organization_modules` +
`moduleManagementService.ts`); **no se cablea**.

## 3. Decisiones de UX (también en la nota de la sección)

1. **Por módulo, no por tipo de venta.** Cualquier reporte queda a dos clics o
   se encuentra con el buscador.
2. **Módulos no contratados visibles y bloqueados**, con su explicación y el
   botón «Ver planes».
3. **Filtros honestos.** Periodo y sucursal viajan a cualquier reporte. Cada
   reporte declara qué filtros admite; los que no aplican se muestran
   deshabilitados con el motivo.
4. **Un visor igual para todos:** migas, pestañas de vista, KPIs, tabla,
   lectura rápida y alertas con acción.
5. **Todo reporte se puede agregar al cierre.** El cierre se arma por
   capítulos, con plantillas.
6. **Manual de marca v2.0:**
   - Solo instancias de 02 Componentes (Sidebar, AppHeader, PageHeader,
     TabItem, SearchBar, SelectorFranja, Select, StatCard, TableCell, Badge,
     Checkbox, Chip, Button, SegmentedControl e íconos `Icon/*`).
   - Solo variables semánticas: `bg/*`, `text/*`, `border/*`, `brand/*`,
     `state/*`.
   - Enlaces en `text/link`; íconos de marca en `brand/deep` sobre
     `brand/tint`; etiquetas con pares suave/texto; rojo solo para cifras
     negativas.

Arreglos en la v1:

- StatCard `1203:189527`: el detalle pasa a «2,1 % de las ventas».
- El diálogo v2 evita el choque de textos con columnas de ancho fijo y rótulos
  más cortos.

Detalles de implementación que se descubrieron:

- La variante `Size=sm` de **Badge** y la variante `State=mixed` de
  **Checkbox** no tienen el texto conectado a su propiedad (`Texto` y
  `Etiqueta`). En las instancias se sobrescribió el texto a mano. Conviene
  conectarlo en 02 Componentes.
- El cambio de ícono en botones anidados funciona con la propiedad
  `Icono (swap)`, no con `swapComponent`.

## 4. Documento de cierre consolidado (página 09 Documentos)

Sección `1242:7891`, «Cierre de periodo consolidado — todos los módulos, por
capítulos». Carta, 12 páginas y 2 tirillas de 80 mm. Cifras de ejemplo de
septiembre 2026 contra agosto, cuadradas entre sí.

| Página | Nodo | Contenido | Estado |
|---|---|---|---|
| 1 | — | Portada, KPIs consolidados e índice de capítulos | Pendiente |
| 2 | `1265:7913` | Contabilidad: estado de resultados y balance general | Hecha |
| 3 | `1265:9236` | Balance de prueba, libro diario por origen, gastos por naturaleza y periodo fiscal | Hecha |
| 4 | — | Finanzas y tesorería | Pendiente |
| 5–7 | `1242:8254`, `1244:8620`, `1248:8562` | Ventas (POS) | Hechas |
| 8 | `1250:8569` | Inventario | Hecha |
| 9 | — | Compras y movimiento de inventario valorizado | Pendiente |
| 10 | — | Personas (nómina) | Pendiente |
| 11 | — | Clientes, CRM y otros módulos | Pendiente |
| 12 | `1256:7916` | Sucursales, cómo se calcula y firmas | Hecha |
| 80 mm | `1257:7930`, `1257:8159` | Cierre de turno por franja, general y por trabajador | Hechas |

Comprobaciones de cuadre ya dibujadas:

- Activo 171.742.500 = pasivo 80.720.000 + patrimonio 91.022.500.
- Débitos = créditos = 580.877.500.
- Utilidad neta 17.322.500 = utilidad antes de impuestos 26.650.000 − renta
  del 35 %.

## 5. Hallazgos en el código (para la fase de implementación)

- `periodosService.ts`:
  - `fmt(new Date(custom.from))` interpreta la fecha como UTC y en Bogotá
    muestra el día anterior.
  - La etiqueta quincenal sale duplicada: «16 al 30/09/2026 septiembre 2026».
  - `startOfDay` usa la zona horaria del navegador.
- `generarNumeroDocumento` (`reportExecutionService.ts`):
  - Toma `YYYYMM` de `fechaInicio` pero cuenta por `created_at` del mes.
  - Tiene condición de carrera.
  - En diciembre busca el mes 13.
- Solo 5 de los 19 archivos de reportes respetan la franja horaria.
- **Reportes nuevos propuestos:** balance de prueba, libro diario por origen,
  estado del periodo fiscal, bancos y conciliación, retenciones, compras por
  proveedor, órdenes de compra y movimiento de inventario valorizado. Las
  tablas existen: `journal_entries`, `journal_lines`, `fiscal_periods`,
  `bank_accounts`, `bank_transactions`, `purchase_orders`, `invoice_purchase`
  y `stock_movements`.
- **Día en UTC en 13 archivos de reportes.** Arman el rango con
  `` `${fecha}T00:00:00Z` ``: contabilidad, CRM, chat, parking, PMS, HRM,
  transporte, notificaciones, organización, roles, operaciones, PM e
  integraciones. En Bogotá, el «día» de esos reportes empieza a las 7:00 p. m.
  del día anterior. El visor contable v2 dice «se calcula por día», así que ese
  día tiene que ser el de la organización (`getOrgDateRange`).
- **Topes que truncan sumas:**
  - `.limit(50)` en `inventarioReports.ts:429` (rentabilidad por producto).
  - `.limit(500)` y `.limit(1000)` en `serialTrackingReports.ts`.
  - Consultas sin `.range` que se quedan en el techo de filas por defecto de
    PostgREST.
- **«Rentabilidad por producto» no tiene costo ni margen.** Reutiliza la RPC de
  rotación.
- **El cierre corre en el navegador.** `ejecutarCierre` se llama desde
  `src/app/app/reportes/page.tsx` y dibuja el PDF con jsPDF
  (`pdfExportService`). No usa el motor de documentos de marca ni
  `pos_caja_esperado`.
- **El historial no reproduce el cierre.** Al volver a descargarlo, el PDF se
  regenera con los datos actuales (`page.tsx:213`) y con otro número; el
  snapshot solo guarda los KPIs.
- **`/app/reportes` no tiene i18n** (no hay `useTranslations` en
  `src/components/reportes/**`). Además usa colores sueltos (`bg-blue-600`,
  `bg-gray-50` y hex en `ReporteChart.tsx`) y casi no usa el kit (`PageHeader`,
  `StatCard`, `DataTable`, `FilterChips`, `EmptyState`).
- **Tres stacks de reportes sin motor común:** `/app/reportes`,
  `/app/pos/reportes` y las páginas de reportes de inventario y finanzas. El
  rediseño v2 supone un solo catálogo.
- **Textos que conviene renombrar en la interfaz:** «Funnel de Ventas» →
  «Embudo de ventas» y «Performance de Agentes» → «Desempeño de agentes».
  Todo en 4 idiomas.

## 6. Preguntas para el dueño

1. ¿Las cuatro plantillas del cierre (Completo, Contable y financiero, Ventas y
   caja, Personalizada) cubren lo que usan los clientes, o falta alguna?
2. ¿«Programar envíos» (reportes por correo) entra en esta fase o después?
3. ¿El cierre mensual debe cerrar el periodo fiscal al firmarse, o solo avisar
   que sigue abierto?

## 7. Chequeo de Figma (2026-09-29)

| Página | Nodos de primer nivel que no son SECTION | Solapes entre secciones | Hijos fuera de su sección | Instancias sin componente | Componentes fuera de 02 |
|---|---|---|---|---|---|
| 01 Sistema | 0 | 0 | 0 | 0 | 0 |
| 09 Documentos | 0 | 0 | 0 | 0 | 34 (la sección de componentes de Documentos que ya existía y está documentada; no se creó ninguno) |
| 14 Reportes | 0 | 0 | 0 | 0 | 0 |
