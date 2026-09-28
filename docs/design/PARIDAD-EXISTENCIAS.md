# Paridad — Existencias: Stock, Movimientos, Ajustes, Traslados, Seriales, Garantías y Trazabilidad

Qué se dibujó en Figma para cada pantalla de `docs/design/AUDITORIA-EXISTENCIAS.md`, dónde está
y cómo se comprobó. Archivo «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`), página
**`04 Inventario`**, carril x ∈ [42.000, 60.000). Componentes nuevos en **`02 Componentes` ›
«Inventario — Existencias (Nuevo)»** (`580:275505`).

Fecha: 2026-09-23. Sin nombres de organizaciones cliente: «Mi empresa S.A.S.», «Comercial Andina
S.A.S.», «Distribuidora del Norte», «Sucursal Principal», «Sucursal Norte», «Bodega Norte».

Convención de estado: **Calcado** (existe hoy y se dibuja igual) · **Sustituido** (existe roto o
fuera de norma y se cambia por el componente correcto) · **Nuevo** (no existe en código).

---

## 1. Secciones

| Sección (id) | Posición | Frames | Escritorio | Móvil | Diálogos y capas |
|---|---|---|---|---|---|
| Existencias — Stock (`581:276750`) | x 42.000 · y 0 | 21 | 11 | 7 | 3 diálogos |
| Existencias — Movimientos (`586:286574`) | y 4.454 | 16 | 9 | 7 | — |
| Existencias — Ajustes (`586:303290`) | y 8.338 | 22 | 12 | 8 | 2 ConfirmDialog |
| Existencias — Traslados (`589:304083`) | y 13.062 | 24 | 12 | 8 | 1 diálogo + 3 ConfirmDialog |
| Existencias — Seriales (`590:319444`) | y 17.886 | 18 | 11 | 7 | — |
| Existencias — Garantías (`592:329722`) | y 22.510 | 17 | 8 | 6 | 2 diálogos + 1 ConfirmDialog |
| Existencias — Trazabilidad (`594:126324`) | y 26.834 | 16 | 9 | 7 | — |
| Existencias — Cómo se conecta (`597:141264`) | y 30.358 | 1 | mapa | — | — |
| **Total** | | **135** | | | |

Cada frame lleva su anotación **fuera**, encima, a 12 px: qué es, qué se sustituye y el
`archivo:línea` del defecto que resuelve.

---

## 2. Estados por pantalla

| Pantalla | listo | cargando | vacío | sin resultados | error | sin permiso | sin sucursal | ⋯ abierto | selección | detalle | móvil |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Stock | ✔ `582:277572` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | fila + «Nuevo movimiento» | ✔ `584:282661` | — (el detalle es el del producto) | 7 |
| Movimientos | ✔ `586:286575` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | fila | no aplica (bitácora de solo lectura) | — (abre el documento) | 7 |
| Ajustes | ✔ `586:303291` | ✔ | ✔ | — | ✔ | ✔ | ✔ | fila + detalle | ✔ `586:306911` | borrador y aplicado + nuevo | 8 |
| Traslados | ✔ `589:304084` | ✔ | ✔ | — | ✔ | ✔ | ✔ | pendiente, en tránsito, detalle | ✔ `589:307873` | en tránsito + recibir + nuevo | 8 |
| Seriales | ✔ `590:319445` | ✔ | ✔ | — | ✔ | ✔ | ✔ | vendido, en stock, detalle | ✔ `590:323332` | vendido | 7 |
| Garantías | ✔ `592:329723` | ✔ | ✔ | — | ✔ | ✔ | no aplica (organización) | pendiente, detalle | no aplica | pendiente + nuevo + resolver | 6 |
| Trazabilidad | ✔ lote `594:126325` · serial `594:127772` | ✔ | inicial `594:128377` | ✔ | ✔ | ✔ | ✔ | venta del lote | no aplica | — | 7 |

«Sin resultados» se dibujó donde la búsqueda es el uso principal (Stock, Movimientos,
Trazabilidad); en el resto el estado es el mismo `EmptyState Variant=search` del kit.

---

## 3. Cómo se conecta (lo que pidió el dueño)

| Desde | Hacia | Dónde se dibuja |
|---|---|---|
| Detalle de producto › Inventario | Stock, Kardex, Lotes, Seriales | sub-pestañas ya dibujadas + mapa `597:141265` |
| Stock, fila «⋯» | Kardex del producto, Lotes, Registrar entrada/salida, Trasladar, Mínimo | `584:281747` |
| Stock, «Nuevo movimiento» | Entrada, Salida, Ajuste por conteo, Traslado, Recibir orden de compra | `584:282222` |
| Movimiento | Documento de origen (venta, factura, pedido web, orden de compra, factura de compra, traslado, ajuste, nota crédito, folio) | `EnlaceDocumento` en cada fila · `586:295053` |
| Ajuste aplicado | Sus movimientos en el kardex | `586:309538` |
| Traslado | Kardex (salida y entrada), trazabilidad del lote | `589:319676` · `589:322534` |
| Serial | Venta, cliente, producto, reclamo de garantía | `590:322453` · `591:112363` |
| Reclamo | Serial, venta, cliente, proveedor (RMA) | `593:121183` · `592:332151` |
| Lote | Trazabilidad → ventas → clientes («Exportar clientes para retiro») | `594:126325` · `594:127217` |
| Todo | Mapa único de conexiones | `597:141265` |

---

## 4. Componentes

Todos en `02 Componentes` › «Inventario — Existencias (Nuevo)» (`580:275505`), con variables de
la colección Color (Light/Dark) y sin hex sueltos.

| Componente | Id | Variantes | Estado |
|---|---|---|---|
| `BadgeOrigenMovimiento` | `530:65022` | **22** (una por valor del CHECK; 8 nuevas: Recepción de compra, Factura de compra, Anulación de factura, Nota crédito, Devolución web, Reverso de folio, Traslado salida, Traslado entrada) | movido de la página 04 y ampliado |
| `BadgeVencimiento` | `530:65035` | 4 | movido |
| `LotPicker` | `530:65092` | 1 | movido |
| `SaldoCorridoCell` | `530:65096` | 1 | movido |
| `BadgeEstadoTraslado` | `580:276180` | Pendiente · En tránsito · Recibido · Recibido con diferencia · Cancelado | Nuevo (compone `Badge`) |
| `BadgeEstadoAjuste` | `580:276195` | Borrador · Aplicado | Nuevo |
| `BadgeTipoAjuste` | `580:276257` | Entrada · Salida | Nuevo |
| `BadgeEstadoReclamo` | `580:276240` | Pendiente · Aprobado · En proceso · Resuelto · Rechazado · Cancelado | Nuevo |
| `EnlaceDocumento` | `580:276801` | 10 tipos (Venta … Sin documento); propiedades Número, Detalle, Mostrar detalle | Nuevo |
| `EventoTrazabilidad` | `580:276919` | 8 tipos (Recepción, Traslado, Ajuste, Venta, Devolución, Garantía, Reparación, Merma); propiedades Título, Detalle, Fecha, Documento, Conector | Nuevo |
| `TableCell` | `106:3688` | + `Variant=two-line` (comfortable 64 · compact 52), propiedad `Secundario` | ampliado |
| `Checkbox` | `50:2695` | + `State=mixed` | ampliado (la cabecera de tabla con selección parcial no tenía variante) |
| Iconos | `02 › Fundamentos › Iconos` | `PackageMinus`, `CalendarX`, `Wrench`, `ScanBarcode` | Nuevos (lucide) |

Se instancian del kit sin redibujar: `PageHeader` (list y form), `DocumentHeader`,
`Breadcrumbs`, `BranchBadge` (incluida `Scope=sin-asignar`), `StatCard`, `SearchBar` (con
escáner), `FilterButton` (default · active · open), `Chip`, `TableCell`, `Pagination` (full y
compact), `BulkActionBar`, `EmptyState` (empty · search · error · forbidden),
`EmptyStateSinSucursal`, `Skeleton`, `MenuItem`, `ConfirmDialog`, `FormField`, `Select`,
`NumberInput`, `DateRange`, `Switch`, `ProductPicker`, `EstadoSerial`, `Button`, `IconButton`,
`MobileHeader`, `MobileTabBar`, `Sidebar`, `AppHeader`.

Hallazgo del kit que queda anotado: 31 de las 36 variantes de `Badge` tienen el texto sin
enlazar a la propiedad `Texto`; hay que sobrescribir la capa de texto a mano (así se hizo).

---

## 5. Decisiones de diseño

1. **Movimientos ≠ Kardex.** Movimientos es la bitácora de toda la organización (sin saldo);
   Kardex es el libro de un producto con saldo corrido. Deja de haber tres kardex.
2. **Una sola acción primaria de existencias: «Nuevo movimiento»**, con su menú. Entrada y salida
   manuales son ajustes de un renglón ya aplicados; no se inventa una tabla nueva.
3. **Nada destructivo sobre un movimiento.** Se corrige con un ajuste.
4. **Ajustes: «Descartar borrador»** sustituye a «Cancelar» (que hoy borra mintiendo); un
   aplicado no se edita.
5. **Traslados con los cuatro estados de la base** más «Recibido con diferencia» derivado; la
   salida se registra al despachar y quien recibe decide la diferencia.
6. **Garantía desde la venta**, no desde la recepción.
7. **Garantías es de ámbito de organización** (sin BranchBadge ni estado «sin sucursal»).
8. **Trazabilidad con un solo buscador** que reconoce lote, serial o documento.
9. **Confirmaciones**: el primario responde al título; cuando el primario ya es «Cancelar
   traslado», el secundario dice «Mantener».

---

## 6. Chequeo por script

Ejecutado el 2026-09-23 sobre las 13 secciones del carril y de la lista de Kardex y Lotes, al
final de la tanda:

| Criterio | Resultado |
|---|---|
| Secciones que se solapan (toda la página 04) | **0** |
| Nodos de primer nivel que se solapan dentro de una sección (frames y anotaciones) | **0** |
| Nodos fuera de su sección | **0** |
| Instancias rotas (`getMainComponentAsync` nulo) de 11.900 | **0** |
| Textos truncados (ancho natural > ancho del nodo, 2.330 revisados) | **0** |
| `Icon/Monitor` en cualquier instancia de las secciones | **0** |
| Anotaciones dentro de frames | **0** |
| Nodos ajenos dentro del carril x ∈ [42.000, 60.000) | **0** |

Defectos que el propio chequeo encontró y se corrigieron antes de cerrar: 32 textos truncados
(anchos de columna de Ajustes, Seriales y Trazabilidad, y el subtítulo móvil del Kardex), 5
anotaciones heredadas que tocaban el borde superior de su frame, el `DocumentHeader` del detalle
de ajuste y de traslado que empujaba el «⋯» fuera de la fila, un espaciador de 100 px en las
tarjetas móviles, el contador de filtros heredado en estados sin filtros y la hoja móvil que
nacía dentro del flujo en vez de flotar.

---

## 7. Capturas

`docs/design/figma/`

| Archivo | Qué muestra |
|---|---|
| `34-existencias-stock-escritorio-listo.png` | Stock, listo |
| `34-existencias-stock-menu-nuevo-movimiento.png` | Menú de la acción primaria |
| `34-existencias-stock-seleccion-masiva.png` | Selección y BulkActionBar de existencias |
| `34-existencias-stock-movil-sheet.png` | Hoja de acciones móvil |
| `34-existencias-stock-dialogo-registrar-entrada.png` | Registrar entrada con lote |
| `34-existencias-movimientos-escritorio-listo.png` | Movimientos con tipo y documento enlazado |
| `34-existencias-movimientos-menu-fila.png` | Menú de un movimiento |
| `34-existencias-ajustes-escritorio-listo.png` | Ajustes, listo |
| `34-existencias-ajuste-detalle-borrador-menu.png` | Detalle de borrador con su «⋯» |
| `34-existencias-nuevo-ajuste.png` | Formulario con lote y conteo |
| `34-existencias-traslados-menu-en-transito.png` | Menú de un traslado en tránsito |
| `34-existencias-traslado-detalle-en-transito.png` | Detalle con seguimiento |
| `34-existencias-traslado-recibir.png` | Recibir con diferencia |
| `34-existencias-traslado-movil-detalle.png` | Detalle móvil con «Recibir» |
| `34-existencias-seriales-menu-vendido.png` | Seriales con menú de un vendido |
| `34-existencias-serial-detalle.png` | Detalle de serial |
| `34-existencias-garantias-menu-pendiente.png` | Garantías con menú de un pendiente |
| `34-existencias-reclamo-detalle.png` | Detalle de reclamo |
| `34-existencias-trazabilidad-lote.png` | Trazabilidad de un lote |
| `34-existencias-trazabilidad-serial.png` | Trazabilidad de un serial |
| `34-existencias-mapa-conexiones.png` | Mapa de conexiones |
| `34-existencias-componentes.png` | Sección de componentes en `02` |
| `34-existencias-lotes-seleccion-masiva-corregida.png` | Lotes: BulkActionBar corregida |
| `34-existencias-lotes-menu-cabecera.png` | Lotes: «⋯» de cabecera abierto |
| `34-existencias-lotes-menu-fila-iconos.png` | Lotes: iconos del menú de fila |
| `34-existencias-lotes-movil-sheet-iconos.png` | Lotes: hoja móvil con iconos |
| `34-existencias-kardex-listo-corregido.png` | Kardex corregido |

Las capturas salen del MCP de Figma a escala 1 (1.440 px de ancho en escritorio).
