# Paridad — servicio en mesa y promociones del POS (página `05 POS y ventas`)

Archivo Figma «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`), página **`05 POS y ventas`**.
Secciones nuevas **19. Componentes — Mesas y promociones**, **20. Mesas — plano y detalle**,
**21. Reservas de mesas**, **22. Comandas**, **23. Promociones y cupones** y **24. Cargos de
servicio**. El Índice de la página quedó regenerado con las 24 secciones.

Fuente de verdad: `docs/design/AUDITORIA-MESAS-PROMOCIONES.md` (850 controles en seis pantallas,
esquema verificado con el MCP de Supabase, 18 roturas que no se calcan). Norma aplicada:
`docs/design/PATRONES-TRANSVERSALES.md` (patrones 1-12) y `docs/design/SISTEMA-BADGES.md`.

**Decisiones de producto cerradas que este diseño aplica** — `PATRONES-TRANSVERSALES.md` §13,
entradas 5 a 8. Lo que cada una exige del esquema está en la auditoría §I.

| §13 | Decisión | Frames que la materializan |
|---|---|---|
| #5 | La combinación de mesas **queda registrada** y se puede deshacer con «Separar mesas» | `Diálogo — Separar mesas` · `Panel de la mesa — combinada (registro y separar)` · aviso en `Diálogo — Combinar mesas` · `MesaTile Estado=combinada` |
| #6 | El cargo de servicio se cobra como **línea propia de la factura, antes de impuestos**; **no** es propina | `Escritorio / POS — carrito con cargo de servicio` · `Diálogo — Cargo de servicio y propina en el cobro` · `Documento — Ticket 80 mm con cargo de servicio` · `Documento — Factura con el cargo como línea` · `Diálogo — Quitar el cargo de servicio (con motivo)` |
| #7 | En el conflicto descuento manual vs promoción **gana el mayor descuento**; se dice cuál ganó y el cajero puede forzar el suyo con motivo | `Diálogo — Conflicto de descuento (Nuevo)` · `SimuladorCarrito` · aviso del `asistente 2` · `Toasts de Promociones y cupones` |
| #8 | El **cliente es obligatorio** en la reserva, con alta rápida desde el propio picker | `Diálogo — Nueva reserva` · `Diálogo — Crear cliente desde la reserva (Nuevo)` |

La quinta duda —la RLS abierta de `restaurant_reservations`— **ya está corregida** por la migración
`20260922200000_rls_reservas_y_redenciones`, así que el diseño no la aborda: ver auditoría §F.4.

**Regla de esta tanda y de las siguientes: una pantalla ya diseñada y aprobada se instancia, no se
vuelve a montar a mano.** Recomponerla es como se pierden los nombres de producto, los badges y la
mitad de la información. Los frames que necesitan el POS completo —carrito, grid o cobro— son
**clones del frame aprobado** de las Secciones «Buscador y grid», «Carrito» y «Cobro» de esta misma
página, y lo único que se les añade es la pieza nueva. Los tres frames de esta tanda que se habían
montado a mano quedaron rehechos así (ver §6).

Estados de la columna final:

- **calcado** — existe en código y se dibujó igual, con la etiqueta exacta o con su acentuación corregida.
- **Nuevo** — no existe en código; lleva el badge `Marca/Nuevo` en Figma (30 instancias).
- **sustituido por …** — lo roto no se calca: se reemplaza por el componente correcto del kit o por
  el patrón que manda `PATRONES-TRANSVERSALES.md`.
- **omitido: motivo** — no se dibuja, con la razón.

Convenciones: escritorio 1440 × 932, móvil 390 × 844; cada frame lleva su anotación en gris
pizarra de 12 px arriba a la izquierda; 160 px entre frames y 400 px entre Secciones. Nombres
ficticios («Mi empresa S.A.S.», «Sucursal Principal», «Sucursal Norte») y personas inventadas.
Los impuestos se rotulan siempre `{nombre} {tasa}` («Impoconsumo 8 %»), nunca «IVA».
Todos los importes llevan separador de miles y el espacio tras el signo, `$ 128.400`.

---

## 1. Frames por Sección (99 frames + 8 componentes)

### Sección 19 — «Componentes — Mesas y promociones» (3.256 × 1.635)

| Componente | Variantes | Para qué |
|---|---|---|
| `MesaTile` | 6 (`libre`, `ocupada`, `cuenta-solicitada`, `reservada`, `combinada`, `tiempo-excedido`) | Baldosa del plano de salón |
| `LeyendaMesas` | 1 | Leyenda de los 6 estados por color |
| `ZonaPlano` | 1 | Contenedor de zona, editable |
| `ReservaSlot` | 6 (los 6 del `CHECK` de `restaurant_reservations.status`) | Bloque de reserva en la agenda |
| `ComandaCard` | 5 (los 4 del `CHECK` de `kitchen_tickets.status` + `demorada`) | Tarjeta del tablero de cocina |
| `ReglaPromocion` | 4 (incluir/excluir × producto/categoría) | Fila de regla del asistente |
| `SimuladorCarrito` | 1 | Simulador del efecto de una promoción |
| `RedencionRow` | 1 | Fila del historial de redenciones de un cupón |

### Sección 20 — «Mesas — plano y detalle» (9.600 × 5.080) · 38 frames

`Escritorio / Mesas — plano (listo · panel de la mesa abierto · editar plano · cargando · vacío ·
error)` · `Escritorio / Mesas — lista (listo · Filtros abiertos · menú ⋯ por fila)` ·
`Escritorio / Mesas — sin sucursal asignada (Nuevo)` · `Móvil / Mesas — plano · cuenta de la mesa
(hoja) · lista (tarjetas)` · `Diálogo — Combinar mesas (alcanzable) · Mover cuenta a otra mesa ·
Transferir cuenta (Nuevo) · Abrir mesa · Nueva mesa · Gestionar zonas · Historial de mesas` ·
`ConfirmDialog — Liberar mesa con cuenta pendiente · Eliminar mesa (Nuevo)` ·
`Escritorio / Mesa — detalle (listo · cuenta solicitada y dividida · sin caja abierta · cargando ·
vacío · error)` · `Diálogo — Agregar productos a la mesa · Pre-cuenta · Dividir cuenta · Cobrar por
comensal · Transferir producto · Historial de la mesa · **Separar mesas**` ·
`**Panel de la mesa — combinada (registro y separar)**` · `Toasts de Mesas` (7 toasts).

### Sección 21 — «Reservas de mesas» (8.000 × 2.368) · 15 frames

`Escritorio / Reservas — agenda del día (listo)` · `Escritorio / Reservas — lista (listo ·
cargando · vacío por filtros · error)` · `Escritorio / Reservas — sin sucursal asignada (Nuevo)` ·
`Diálogo — Nueva reserva · Editar reserva` · `Menú ⋯ de la reserva (por estado)` ·
`ConfirmDialog — Cancelar reserva · Eliminar reserva` · `Toasts de Reservas` (5) ·
`Móvil / Reservas — agenda del día · nueva reserva (hoja)` ·
`**Diálogo — Crear cliente desde la reserva (Nuevo)**`.

### Sección 22 — «Comandas» (8.000 × 2.192) · 12 frames

`Escritorio / Comandas — tablero (listo · filtrado por estación · cargando · vacío · error)` ·
`Escritorio / Comandas — sin sucursal asignada (Nuevo)` · `Diálogo — Detalle de comanda ·
Reimprimir comanda` · `ConfirmDialog — Devolver la comanda a «Nuevas» (Nuevo)` ·
`Toasts de Comandas` (5) · `Móvil / Comandas — tablero`.

### Sección 23 — «Promociones y cupones» (9.992 × 3.252) · 21 frames

`Escritorio / Promociones — listado (listo · cargando · vacío · error · menú ⋯ por fila)` ·
`Escritorio / Promociones — detalle` · `Escritorio / Promoción — asistente 1 · 2 · 3 · 4` ·
`Escritorio / Cupones — listado (listo · vacío)` · `Escritorio / Cupones — detalle con
redenciones` · `Diálogo — Nuevo cupón · Aplicar cupón en el cobro (Nuevo)` ·
`ConfirmDialog — Eliminar promoción · Eliminar cupón con redenciones` ·
`Toasts de Promociones y cupones` (5) · `Móvil / Promociones — listado` · `Móvil / Cupones — listado` ·
`**Diálogo — Conflicto de descuento (Nuevo)**`.

### Sección 24 — «Cargos de servicio» (6.336 × 2.160) · 13 frames

`Escritorio / Cargos de servicio — listado (listo · vacío)` · `Diálogo — Nuevo cargo de servicio ·
Importar cargos (CSV)` · `ConfirmDialog — Eliminar cargo de servicio` ·
`Toasts de Cargos de servicio` (4) · `Móvil / Cargos de servicio — listado` ·
`Documento — Ticket 80 mm con cargo de servicio` · `Documento — Factura con el cargo como línea` ·
`Diálogo — Quitar el cargo de servicio (con motivo)` ·
`Acordeón «Cargo de servicio» abierto (dentro del cobro aprobado)` ·
**clones del POS aprobado:** `Escritorio / POS — carrito con cargo de servicio` y
`Escritorio / POS — cobro con cargo de servicio`.

---

## 2. Paridad control por control

### A. Mesas — plano y listado (`/app/pos/mesas`, 186 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.1 #1 | (ArrowLeft) volver al POS | `Escritorio / Mesas — plano (listo)` · PageHeader | sustituido por: migas «POS › Mesas» del `PageHeader` (patrón 4) |
| A.1 #2-3 | «Plano de Mesas» / «POS / Mesas» | ídem · PageHeader | sustituido por: título «Mesas» + subtítulo con el recuento; la miga estática pasa a `Breadcrumbs` navegable |
| A.1 #4-5 | Toggle «Lista» / «Mapa» | ídem · `ViewToggle Value=grid` / `Value=table` | calcado (renombrado a plano/lista) |
| A.1 #6 | (RefreshCw) recargar | ídem · icono del `PageHeader` | calcado |
| A.1 #7 | «Nueva Mesa» | ídem · acción primaria | calcado, acentuación corregida a «Nueva mesa» |
| A.1 #8 | `BranchBadge` | ídem · fila de sucursal | calcado (patrón 9) |
| A.1 #9-10 | Esqueletos y bloqueo `opacity-60` | `Escritorio / Mesas — plano (cargando)` | sustituido por: `Skeleton` del kit solo en KPI y plano; la cabecera se mantiene (patrón 4) |
| A.1 #11 | Toast «No se pudieron cargar las mesas» | `Escritorio / Mesas — plano (error)` + `Toasts de Mesas` | sustituido por: `EmptyState Variant=error` con «Reintentar» (patrón 7) |
| A.1 #12-15 | KPI Libres / Ocupadas / Con Cuenta / Total | `Escritorio / Mesas — plano (listo)` · 4 `StatCard` | calcado; «Total» se sustituye por «Tiempo excedido» (**Nuevo**) y el total pasa al subtítulo |
| A.2 #16-18 | «Editar plano» / «Centrar» / «Guardar posiciones» | `Escritorio / Mesas — plano (editar plano)` | calcado; «Guardar plano» pasa a acción primaria del `PageHeader` y aparece el contador de cambios (**Nuevo**) |
| A.2 #19-23 | Zoom −/+/%, «Reset zoom», «Centrar mesas» | ídem | omitido: controles de lienzo sin equivalente estático; se documentan en la anotación del frame |
| A.2 #24-27 | Leyenda 🟢🔴🟠🟡 | `LeyendaMesas` | sustituido por: puntos de color del sistema de badges, 6 estados (patrón de `SISTEMA-BADGES.md`) |
| A.2 #28, #40-44 | Rejilla, persistencia, lienzo que crece, forma por capacidad, color de zona, recuadro | `ZonaPlano` + anotación | calcado como comportamiento; la forma por capacidad se omite (una sola baldosa) |
| A.2 #29-32 | Pan, arrastre de mesa, arrastre y redimensión de zona | `Escritorio / Mesas — plano (editar plano)` | calcado: borde discontinuo de zona + aviso de edición |
| A.2 #33 | Rotar 15° | ídem · anotación | omitido: gesto; se cita en el aviso de edición |
| A.2 #34-38 | Chip de zona, sillas, baldosa, tooltip, «{n}/{cap}» | `MesaTile` + `ZonaPlano` | sustituido por: la baldosa muestra siempre comensales, tiempo, mesero y total (hoy eso vive en un tooltip solo al pasar el ratón) |
| A.2 #39 | Texto de ayuda del modo edición | `Escritorio / Mesas — plano (editar plano)` · aviso azul | calcado, reescrito |
| A.2 #45-47 | Toasts de guardado | `Toasts de Mesas` | calcado + se añade el acuse de zonas, que hoy no existe |
| A.3 #48-51 | «Gestionar Zonas» · «Combinar Mesas» · «Mover Pedido» · «Historial» | `Escritorio / Mesas — lista (menú ⋯ por fila)` y diálogos | sustituido por: menú «⋯» del `PageHeader` (patrón 4.1: una sola acción primaria) |
| A.3 #52-56 | Buscador, X, zona, estado, «Limpiar filtros» | `Escritorio / Mesas — lista (Filtros abiertos)` | sustituido por: un buscador + «Filtros» + `FilterChips` (patrón 3) |
| A.3 #57-58 | «No hay mesas para mostrar» + «Crear Primera Mesa» | `Escritorio / Mesas — plano (vacío)` | sustituido por: `EmptyState Variant=empty` y `Variant=search` separados |
| A.3 #59-60 | Encabezados de zona con contador | `ZonaPlano` · badge de resumen | calcado; el contador pasa a ser del total, no de la página |
| A.3 #61-68 | Tarjeta: badge, nombre, zona, ocupación, tiempo, total, «{n} en cocina», «Revisar» | `MesaTile` | calcado; «Revisar» pasa a estado «Tiempo excedido» con su umbral en el KPI |
| A.3 #69 | (Receipt) «Solicitar cuenta» al pasar el ratón | `Escritorio / Mesas — plano (panel de la mesa abierto)` | sustituido por: acción visible del panel lateral (patrón 6: nada hover-only) |
| A.3 #70-73 | Menú ⋯: «Editar Mesa», «Editar Comensales», «Liberar Mesa» | `Escritorio / Mesas — lista (menú ⋯ por fila)` | calcado + 5 entradas más, 8 en total (patrón 11) |
| A.3 #74-81 | Paginación propia (9/12/20/30/50) | `Escritorio / Mesas — lista (listo)` · `Pagination Layout=full` | sustituido por: la paginación única del kit (patrón 2) |
| A.3 #82-83 | Toasts de solicitar cuenta | `Toasts de Mesas` | calcado |
| A.4 #84-92 | Modo combinar rápido sobre las tarjetas | `Diálogo — Combinar mesas (alcanzable)` | sustituido por: el diálogo de dos pasos, ahora alcanzable; las mesas sin cuenta salen deshabilitadas con su motivo |
| A.5.1 #93-105 | `MesaFormDialog` | `Diálogo — Nueva mesa` | calcado + aviso de que la sucursal no se puede cambiar al editar (**Nuevo**) |
| A.5.2 #106-121 | `ZonasManager` | `Diálogo — Gestionar zonas` | calcado + «Nueva zona» (**Nuevo**) |
| A.5.3 #122-130 | `MoverPedidoDialog` | `Diálogo — Mover cuenta a otra mesa` | calcado, renombrado; se añade qué se mueve con la cuenta |
| A.5.4 #131-140 | `CombinarMesasDialog` (**inalcanzable**) | `Diálogo — Combinar mesas (alcanzable)` | sustituido por: el mismo diálogo, ahora alcanzable desde el plano y desde el detalle, con el aviso de que la combinación queda registrada (§13 #5) |
| — | Registro de la combinación: mesas, principal, quién y cuándo | `Panel de la mesa — combinada (registro y separar)` | **Nuevo** (§13 #5). Exige `table_combinations` + `table_combination_members` y añadir `'combined'` al `CHECK` de `restaurant_tables.state`: ver auditoría §I.1 |
| — | «Separar mesas» que revierte la combinación | `Diálogo — Separar mesas` | **Nuevo** (§13 #5). Devuelve cada producto a la mesa donde se pidió y avisa de lo añadido después de combinar |
| A.5.5 #141-162 | `HistorialMesasDialog` | `Diálogo — Historial de mesas` | calcado + paginación del kit y rango en el huso de la organización |
| A.5.6 #163-182 | Abrir mesa, editar comensales, liberar | `Diálogo — Abrir mesa` · `ConfirmDialog — Liberar mesa con cuenta pendiente` | calcado; la confirmación cita el importe pendiente (**Nuevo**) |
| A.5.6 #183-186 | «¿Eliminar mesa?» (**inalcanzable**) | `ConfirmDialog — Eliminar mesa (Nuevo)` | sustituido por: conectado al menú «⋯», con la guarda de cuenta abierta |
| A.7.2 #2 | Sin permisos | — | omitido: no es un control de interfaz; queda en la auditoría §G.2 |
| — | Estado «sin sucursal asignada» | `Escritorio / Mesas — sin sucursal asignada (Nuevo)` | **Nuevo** (patrón 10) |
| — | Móvil | `Móvil / Mesas — plano · cuenta de la mesa · lista` | **Nuevo**: el módulo no tiene diseño móvil propio |

### B. Mesas — detalle (`/app/pos/mesas/[id]`, 239 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| B.1 #1-11 | Cabecera: «Volver», nombre, badge, zona, refrescar, «Historial», «Combinar Mesa», «Agregar Producto» | `Escritorio / Mesa — detalle (listo)` · `PageHeader Variant=detail` | calcado; «Combinar» baja al panel de acciones para dejar una sola primaria (patrón 4) |
| B.1 #12-15 | Esqueleto y toasts | `(cargando)` + `Toasts de Mesas` | calcado |
| B.2 #16-23 | KPI Comensales / Tiempo / Items / Total / Mesero | `(listo)` · 4 `StatCard` | calcado; «Mesero» pasa al panel de acciones y «Productos» gana el desglose por estado |
| B.2 #24-37 | Diálogos «Editar Comensales» y «Asignar Mesero» | `Diálogo — Abrir mesa` (comensales) y panel | sustituido por: edición en línea desde el panel; el diálogo de comensales se reutiliza del de apertura |
| B.3 #38-42 | «Pedido Actual», conteos, vacío | `(listo)` y `(vacío)` | calcado |
| B.3 #43-53 | Línea: nombre, comensal, variante, modificadores, estado de cocina, nota, precio, total | `(listo)` · líneas de pedido | calcado + **la estación por línea se hace visible** (hoy se guarda y nunca se pinta) |
| B.3 #54-63 | Cantidad, editar, transferir, eliminar | ídem · acciones de línea | sustituido por: `− n +` siempre visible y las tres acciones en texto, no hover-only |
| B.3 #64-67 | Imagen, «Items Pagados», toasts | `(cuenta solicitada y dividida)` | calcado |
| B.4 #68-72 | Cliente y resumen de la cuenta | `(listo)` · panel de acciones | sustituido por: fila compacta de cliente; el `CustomerPicker` desplegable se reserva al alta |
| B.4 #73-83 | «Enviar a Cocina», «Ver Pre-Cuenta», «Solicitar Cuenta», «Dividir Cuenta», división vigente | ídem + `(cuenta solicitada y dividida)` | calcado con `Kbd` (`F8`, `F7`) y el estado de cobro por comensal |
| B.4 #84-85 | «Procesar Pago» deshabilitado + «Debe abrir una caja…» | `(sin caja abierta)` | sustituido por: «Abrir caja para cobrar · F9», estado con acción |
| B.4 #86-92 | «Liberar Mesa» y su confirmación | `ConfirmDialog — Liberar mesa con cuenta pendiente` | calcado; la acción pasa a `Variant=destructive` y la descripción cita el importe |
| B.5 #93-135 | `AddProductDialog` (43 controles) | `Diálogo — Agregar productos a la mesa` | calcado sobre el `ProductPicker` del kit; la asignación por comensal y la estación quedan en la columna derecha |
| B.6 #136-152 | `PreCuentaDialog` (17 controles) | `Diálogo — Pre-cuenta` | calcado; **`sendToFactus` deja de descartarse**: el interruptor viaja al cobro |
| B.6 #147 | Datos de domicilio | — | omitido: el detalle de mesa nunca pasa `deliveryInfo` (prop muerta) |
| B.7 #153-179 | `SplitBillDialog` (27 controles) | `Diálogo — Dividir cuenta` | calcado con los tres modos; la lista ya excluye los productos cobrados |
| B.7 #180-199 | `SplitPaymentSelector` (20 controles) | `Diálogo — Cobrar por comensal` | calcado; el `confirm()` nativo se sustituye por `ConfirmDialog` |
| B.8 #200-210 | `TransferItemDialog` | `Diálogo — Transferir producto` | calcado; solo se ofrecen mesas con cuenta abierta y se explica el reparto del impuesto |
| B.9 #211-227 | `SessionTimelineDialog` | `Diálogo — Historial de la mesa` | calcado + las bajas de producto, que ya se auditan y no se leían |
| B.10 #228-239 | `MesaTaxBreakdown` | `(listo)` · resumen de la cuenta | calcado: la etiqueta es `{nombre} {tasa}`, nunca «IVA» |
| — | Transferir la cuenta completa | `Diálogo — Transferir cuenta (Nuevo)` | **Nuevo** (auditoría §H.3) |

### C. Reservas de mesas (69 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| R1 #1-6 | `BranchBadge`, título, subtítulo, «Actualizar», «Nueva Reserva» | `Escritorio / Reservas — lista (listo)` | calcado |
| R2 #7-12 | Buscador, Estado, Origen, fecha desde/hasta | `(listo)` + `FilterPanel` | sustituido por: un buscador + «Filtros» (patrón 3); el rango pasa al subtítulo |
| R2 #13-18 | 6 stats | `(listo)` · 6 `StatCard Size=sm` | calcado; «Hoy» pasa a «En el rango» —hoy la etiqueta miente cuando el rango es otro— y «No Show» a «No se presentó» |
| R2 #19 | `avg_party_size` calculado y nunca mostrado | `(listo)` · subtítulo «126 comensales» | sustituido por: el dato se muestra |
| R3 #20-29 | Tarjeta de reserva | `Escritorio / Reservas — lista (listo)` · `DataTable` | sustituido por: tabla del kit con paginación única (patrón 2 y 5); el teléfono y el correo pasan a la ficha del cliente |
| R3 #30-37 | Menú ⋯ por estado | `Menú ⋯ de la reserva (por estado)` | calcado + «Asignar mesa»; 8 entradas, lo destructivo al final (patrón 11) |
| R3 #38-40 | «¿Eliminar reserva?» | `ConfirmDialog — Eliminar reserva` | calcado; se recomienda cancelar en vez de borrar |
| R4 #41-55 | `ReservaFormDialog` | `Diálogo — Nueva reserva` y `Editar reserva` | sustituido por: **`CustomerPicker` compartido y obligatorio** (§13 #8); desaparecen los tres campos sueltos de nombre, teléfono y correo. Se añade el aviso de solape al guardar |
| — | Alta de cliente sin salir de la reserva | `Diálogo — Crear cliente desde la reserva (Nuevo)` | **Nuevo** (§13 #8). Nombre, apellido y teléfono; cruza por teléfono antes de crear porque `customers` no tiene único por teléfono (auditoría §I.4) |
| R4 (recordatorio) | — | `Diálogo — Nueva reserva` · bloque de recordatorio | **Nuevo**: no existe nada parecido en el módulo |
| R5 #56-69 | Estados y 10 toasts | `(cargando)`, `(vacío por filtros)`, `(error)`, `Toasts de Reservas` | sustituido por: `Skeleton`, `EmptyState` y `Toast` del kit; el esqueleto pinta 6 KPI, no 4 |
| — | Agenda por franjas y mesas | `Escritorio / Reservas — agenda del día (listo)` | **Nuevo** (auditoría §H.7) |
| — | Estado «sin sucursal asignada» | `Escritorio / Reservas — sin sucursal asignada (Nuevo)` | **Nuevo** (patrón 10) |
| — | Móvil | `Móvil / Reservas — agenda · nueva reserva` | **Nuevo** |

### D. Comandas de cocina (64 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C7 #1-8 | Cabecera, sonido, «Actualizar», `BranchBadge`, beep, toast de ticket nuevo | `Escritorio / Comandas — tablero (listo)` | calcado; el toggle de sonido pasa a «Silenciar» en la cabecera |
| C8 #9-14 | Chips de zona y estación | ídem + `(filtrado por estación)` | calcado + las 5 estaciones del `CHECK` (hoy solo 3, cableadas) |
| C8 #15-20 | Botones de estado con contador | ídem · cabecera de cada columna | sustituido por: el contador es del total, no de la lista ya filtrada |
| C9 #21-38 | `TicketCard`: mesa, zona, tiempo, ticket, mesero, reimprimir, badges, ítems, variantes, modificadores, estación, nota | `ComandaCard` + `Diálogo — Detalle de comanda` | calcado; los 5 emojis se sustituyen por iconos del kit |
| C9 #39-40 | Clic en el ítem sin etiqueta · atenuación al 35 % sin explicación | `(filtrado por estación)` · aviso azul | sustituido por: aviso que explica la atenuación |
| C9 #41-42 | Botones de avance con emoji · autopromoción | `ComandaCard` · botón de acción | sustituido por: botón del kit sin emoji |
| C9 #43-46 | Contador por columna, cabeceras, arrastrar y soltar, tope de 12 | `(listo)` | calcado; el retroceso pasa por `ConfirmDialog` |
| C9 #47-54 | 8 toasts | `Toasts de Comandas` | calcado + «Avisar al mesero», que consume el aviso que el trigger ya inserta |
| C10 #55-64 | Paginación propia y estados | `(listo)`, `(cargando)`, `(vacío)`, `(error)` | sustituido por: `Pagination` del kit, aplicada por columna; el esqueleto pinta 4 columnas, no 3 |
| — | Detalle de comanda con línea de tiempo | `Diálogo — Detalle de comanda` | **Nuevo** |
| — | Reimpresión por estación con estado del agente | `Diálogo — Reimprimir comanda` | **Nuevo**: hoy solo hay un toast con la clave cruda (`hot_kitchen`) |
| — | Estado «sin sucursal asignada» | `Escritorio / Comandas — sin sucursal asignada (Nuevo)` | **Nuevo** (patrón 10) |
| — | Móvil | `Móvil / Comandas — tablero` | **Nuevo** |

### E. Promociones y su motor (140 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| 1.1 #1-6 | Cabecera, «Cupones», «Nueva Promoción», 2 stats | `Escritorio / Promociones — listado (listo)` | calcado + 2 KPI más (Programadas, Ahorro del mes) |
| 1.2 #7-11 | Buscador, Estado, Tipo, recargar | ídem | sustituido por: un buscador + «Filtros» (patrón 3); los filtros `dateFrom`/`dateTo`, hoy muertos, se exponen |
| 1.3 #12-25 | Tabla: Promoción, Tipo, Descuento, Vigencia, Usos, Prioridad, Estado + badges | ídem · `DataTable` | calcado; «Prioridad» cede sitio a «Canales», que existe en datos y no se mostraba |
| 1.3 #26-31 | Menú ⋯ (5 entradas + switch decorativo) | `(menú ⋯ por fila)` | sustituido por: «Desactivar» real en vez del `Switch` con `pointer-events-none`; +2 entradas de simulación (**Nuevo**) |
| 1.4 #32-44 | Diálogo de borrado, estados, 4 toasts | `ConfirmDialog — Eliminar promoción`, `(cargando)`, `(vacío)`, `(error)`, `Toasts` | calcado; el borrado cita el uso real |
| 1.4 (paginación) | No existe | `(listo)` · `Pagination Layout=full` | **Nuevo** (patrón 2) |
| 2.1 #1-10 | Cabecera del detalle | `Escritorio / Promociones — detalle` | calcado |
| 2.2 #11-23 | «Detalles de la Promoción» y «Reglas Aplicadas» | ídem | calcado + Canales y Sucursales, que la ficha no mostraba |
| 2.3 #24-32 | «Estado», «Estadísticas», fechas | ídem · panel derecho | sustituido por: bloque «Uso» con ahorro, ventas y ticket medio; exige tabla de redención (**Nuevo**) |
| 2.4 #33-44 | Diálogos, estados, toasts | `ConfirmDialog` + `Toasts` | calcado |
| 3.0 #1-10 | Armazón del asistente | `asistente 1 · 2 · 3 · 4` | calcado; los pasos pasan a ser clicables hacia atrás y ganan resumen en la barra del pie |
| 3.1 #11-16 | Paso «Datos Básicos» | `asistente 1` | calcado |
| 3.2 #17-28 | Paso «Descuento» | `asistente 2` | calcado; «Envío Gratis» se dibuja deshabilitado con su motivo y se añade el aviso del descuento manual (**Nuevo**) |
| 3.3 #29-42 | Paso «Vigencia» | `asistente 3` | calcado + selector de sucursales (**Nuevo**, la columna existe) y la hora explícita del huso de la organización |
| 3.4 #43-52 | Paso «Reglas» | `asistente 4` | calcado sobre `ReglaPromocion`; se admite mezclar inclusiones y exclusiones |
| 4.4 | La promoción no se aplica si hay descuento manual | `Diálogo — Conflicto de descuento (Nuevo)` · `SimuladorCarrito` · aviso del `asistente 2` · `Toasts` | sustituido por: **gana el mayor descuento** (§13 #7). Se muestra cuál ganó y por qué, el cajero puede forzar el suyo con motivo, y nunca se suman salvo promoción combinable |
| — | Previsualización «a qué productos alcanza» | `asistente 4` · panel derecho | **Nuevo** |
| — | Simulador de carrito | `SimuladorCarrito` | **Nuevo** |
| — | Móvil | `Móvil / Promociones — listado` | **Nuevo** |
| R15-R17 | `free_shipping` roto de punta a punta | `asistente 2` · tarjeta deshabilitada | sustituido por: se ofrece marcado «Pendiente», no como opción viva |
| R29 | «Límite de Usos» decorativo | `asistente 3` + detalle · `Progress` | sustituido por: se dibuja con su contador real y el aviso de que hoy no se hace cumplir |

### F. Cupones (99 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| U.1 #1-14 | Cabecera, 2 stats, filtros, estados | `Escritorio / Cupones — listado (listo)` y `(vacío)` | calcado + 2 KPI (Redenciones, Descuento entregado) y acción en el vacío |
| U.1 #15-30 | Tabla y badges de estado (5 ramas) | ídem · `DataTable` | calcado + columna «Cliente», que existe y solo se veía en el detalle |
| U.1 #31-41 | Menú ⋯, diálogo de borrado, toasts | `ConfirmDialog — Eliminar cupón con redenciones` + `Toasts` | calcado; el `Switch` decorativo del menú se sustituye por «Desactivar» |
| U.1 (paginación) | No existe | `(listo)` · `Pagination Layout=full` | **Nuevo** (patrón 2) |
| U.2 #1-24 | Detalle: cabecera, «Detalles del Cupón», «Estado», «Estadísticas» | `Escritorio / Cupones — detalle con redenciones` | calcado; las fechas pasan al huso de la organización |
| U.2 #25-32 | «Historial de Redenciones» + «Exportar» | ídem · `RedencionRow` | calcado + paginación y columna «Canal» (POS/web) |
| U.2 #33-42 | Diálogos, estados, toasts | `Diálogo — Nuevo cupón` + `Toasts` | calcado |
| U.3 #1-16 | `CouponForm`, 11 campos | `Diálogo — Nuevo cupón` | calcado + «Usos por cliente» y «Cliente» (**Nuevo**: existen en la tabla y el formulario no los expone) |
| P.8 | El cupón no se aplica en el POS | `Diálogo — Aplicar cupón en el cobro (Nuevo)` | **Nuevo**: sustituye el `alert("… (demo)")` de Nueva Venta |

### G. Cargos de servicio (53 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| S.5 #1-2 | Título y subtítulo «…como propina sugerida» | `Escritorio / Cargos de servicio — listado (listo)` | sustituido por: «Importes que se suman a la cuenta»; el subtítulo actual describe algo que el código no hace |
| S.5 #3-8 | «Importar» y su diálogo CSV sin botón | `Diálogo — Importar cargos (CSV)` | sustituido por: previsualización + botón «Importar N cargos» (**Nuevo**) |
| S.5 #9-12 | «Nuevo Cargo» y 3 stats | `(listo)` | calcado + 2 KPI de cobro real |
| S.5 #13-16 | Filtros Estado / **Sucursal** / Aplica a / recargar | `(listo)` · fila de buscador y «Filtros» | sustituido por: **se elimina el filtro de sucursal propio** (patrón 9); hoy escribe en el `BranchContext` global |
| S.5 #17-19 | Estados de carga y vacío | `(listo)` y `(vacío)` | calcado + acción en el vacío |
| S.5 #20-32 | Tabla: Nombre, ámbito, Tipo, Valor, Condiciones, Aplica a, Estado, badges | `(listo)` · `DataTable` | calcado; la columna «Ámbito» aclara que un cargo global también aplica en cada sucursal |
| S.5 #33-40 | Menú ⋯, borrado, toasts | `ConfirmDialog — Eliminar cargo de servicio` + `Toasts` | calcado; el borrado avisa de las cuentas donde ya se cobró |
| S.6 #1-13 | `ChargeForm`, 9 campos | `Diálogo — Nuevo cargo de servicio` | calcado + previsualización del efecto (**Nuevo**); los dos interruptores dejan de ser decorativos |
| P.8-P.10 | El cargo no se cobra nunca | `Diálogo — Cargo de servicio y propina en el cobro (Nuevo)` | **Nuevo** (§13 #6): línea de la factura **antes de impuestos**, con la propina separada y fuera del documento; se explica por qué cada cargo aplica o no |
| — | El cargo en el carrito | `Escritorio / POS — carrito con cargo de servicio` | **Nuevo** (§13 #6): Subtotal → Cargo por servicio → Base gravable → Impuesto → Total |
| — | El cargo en el ticket | `Documento — Ticket 80 mm con cargo de servicio` | **Nuevo** (§13 #6): el cargo entre subtotal y base gravable; la propina, después del total y marcada como voluntaria |
| — | El cargo en la factura | `Documento — Factura con el cargo como línea` | **Nuevo** (§13 #6): línea con cantidad y valor unitario; la propina no aparece en el documento |
| S.6 #10 | «Cargo opcional» (interruptor decorativo) | `Diálogo — Quitar el cargo de servicio (con motivo)` | sustituido por: el cargo opcional se puede quitar en el cobro, con motivo obligatorio que queda en la auditoría de la venta |
| S.5 (paginación) | No existe | `(listo)` · `Pagination Layout=full` | **Nuevo** (patrón 2) |
| — | Móvil | `Móvil / Cargos de servicio — listado` | **Nuevo** |

---

## 3. Lo roto que no se calcó (15 casos de la auditoría §G.9)

| # | Rotura | Dónde se resuelve |
|---|---|---|
| 1 | «¿Eliminar mesa?» inalcanzable | `ConfirmDialog — Eliminar mesa (Nuevo)` conectado al menú «⋯» |
| 2 | `eliminarMesa` y `dividirMesa` código muerto | «Eliminar mesa» se dibuja; «Dividir mesa» se omite (lo cubre «Dividir cuenta») |
| 3 | El modo combinar acepta mesas libres | `Diálogo — Combinar mesas`: deshabilitadas con su motivo |
| 4 | `CombinarMesasDialog` nunca se abre | Alcanzable desde el plano y desde el detalle |
| 5 | `sendToFactus` se descarta | `Diálogo — Pre-cuenta`: el interruptor viaja al cobro |
| 6 | `ChargesHeader` con filtro de sucursal global | Eliminado (patrón 9) |
| 7 | 7 `alert()` + 1 `confirm()` en el cupón del POS | `Diálogo — Aplicar cupón en el cobro` + `Toasts` |
| 8 | `confirm()` nativo al cerrar con pagos pendientes | `ConfirmDialog` en `Cobrar por comensal` |
| 9 | Gana siempre el descuento manual, aunque descuente menos | Decisión §13 #7: gana el mayor. `Diálogo — Conflicto de descuento`, `SimuladorCarrito`, aviso del `asistente 2` y toast |
| 10 | `free_shipping` no hace nada | `asistente 2`: tarjeta deshabilitada con motivo |
| 11 | «Límite de Usos» decorativo | `asistente 3` y detalle: contador real + aviso |
| 12 | Importar cargos sin botón | `Diálogo — Importar cargos (CSV)` con previsualización |
| 13 | El estado «pending» de una reserva es inalcanzable | Chip de estado operativo en `Editar reserva` y menú «⋯» |
| 14 | 5 emojis como iconos en comandas | `ComandaCard` con iconos del kit |
| 15 | Retroceder una comanda borra `ready_at` | `ConfirmDialog — Devolver la comanda a «Nuevas»` |
| 16 | Combinar mesas no deja rastro y no se puede deshacer | Decisión §13 #5: `Diálogo — Separar mesas` y `Panel de la mesa — combinada` |
| 17 | El cargo de servicio no se cobra en ninguna venta | Decisión §13 #6: carrito, cobro, ticket y factura |
| 18 | La reserva no se liga al cliente | Decisión §13 #8: `CustomerPicker` obligatorio + alta rápida |

---

## 4. Chequeo automático

Ejecutado sobre las 6 Secciones nuevas con un script del propio archivo:

| Comprobación | Resultado |
|---|---|
| Secciones que se solapan entre sí (todas las de la página) | **0** |
| Frames de primer nivel que se solapan dentro de su Sección | **0** |
| Nodos que se salen de su Sección | **0** |
| Instancias rotas (`getMainComponentAsync` = null) | **0** de 5.389 instancias |
| Textos recortados por un ancestro con `clipsContent` | **0** de 4.715 textos |
| Etiquetas o contadores heredados del catálogo de productos | **0** |
| Componentes del kit encogidos por debajo de su ancho publicado | **0** |
| Nombres de producto truncados (`textTruncation` con el texto cortado) | **0** |

Nota sobre el último punto: las cadenas «Inventario» y «Ultimate» siguen apareciendo, pero
pertenecen al `Sidebar` y al `AppHeader` del shell —son el cromo de la aplicación, no relleno
heredado—. Los dos casos reales que sí había, las tarjetas de producto del `DataTable Layout=cards`
en móvil y el `ProductPicker` del diálogo de agregar productos, quedaron sobrescritos con mesas y
con platos.

---

## 5. Capturas

`docs/design/figma/`

| Archivo | Qué muestra |
|---|---|
| `27-mesas-01-componentes.png` | Sección 19 completa: los 8 componentes nuevos |
| `27-mesas-02-plano.png` | Plano del salón por zonas, estado listo |
| `27-mesas-03-panel-de-mesa.png` | Plano con el panel lateral de la mesa abierto |
| `27-mesas-04-lista.png` | Vista de lista con `DataTable` y paginación del kit |
| `27-mesas-05-detalle.png` | Detalle de mesa con el estado por estación en cada línea |
| `27-mesas-06-seccion.png` | Sección 20 completa (36 frames) |
| `27-reservas-01-agenda.png` | Agenda del día por franjas y mesas |
| `27-reservas-02-seccion.png` | Sección 21 completa (14 frames) |
| `27-reservas-03-nueva-reserva.png` | Alta con `CustomerPicker` y recordatorio |
| `27-comandas-01-tablero.png` | Tablero por estado con tiempos y prioridad |
| `27-comandas-02-seccion.png` | Sección 22 completa (12 frames) |
| `27-comandas-03-detalle-comanda.png` | Detalle de comanda con línea de tiempo |
| `27-promociones-01-listado.png` | Listado con canales y paginación |
| `27-promociones-02-detalle.png` | Detalle con reglas y bloque de uso |
| `27-promociones-03-asistente-paso4.png` | Paso 4: reglas, previsualización y simulador |
| `27-promociones-04-cupon-detalle.png` | Cupón con su historial de redenciones |
| `27-promociones-05-seccion.png` | Sección 23 completa (20 frames) |
| `27-cargos-01-listado.png` | Listado sin filtro de sucursal propio |
| `27-cargos-02-acordeon-cargo.png` | §13 #6 · el acordeón «Cargo de servicio» abierto dentro del cobro |
| `27-cargos-08-cobro-pos-con-cargo.png` | §13 #6 · el cobro **aprobado** del POS v2 con el cargo en los totales y su acordeón |
| `27-reservas-05-movil-nueva-reserva.png` | §13 #8 · el `CustomerPicker` del kit a sangre en móvil, con su alta rápida |
| `27-cargos-03-seccion.png` | Sección 24 completa (12 frames) |
| `27-cargos-04-carrito-con-cargo.png` | §13 #6 · el cargo como línea del carrito, antes de impuestos |
| `27-cargos-05-ticket.png` | §13 #6 · ticket 80 mm: cargo antes de la base gravable, propina después del total |
| `27-cargos-06-factura.png` | §13 #6 · la factura con el cargo como línea, y la propina fuera del documento |
| `27-cargos-07-quitar-cargo.png` | §13 #6 · quitar un cargo opcional, con motivo obligatorio |
| `27-mesas-07-separar-mesas.png` | §13 #5 · registro de la combinación y «Separar mesas» |
| `27-promociones-06-conflicto-descuento.png` | §13 #7 · gana el mayor descuento, con la opción de forzar el manual |
| `27-reservas-04-crear-cliente.png` | §13 #8 · alta rápida de cliente desde la reserva |

---

## 6. Lo que se rehízo instanciando el frame aprobado

El dueño revisó `27-cargos-04-carrito-con-cargo.png` y tenía razón: ese frame estaba montado a mano
y había perdido información que la interfaz aprobada sí da. Las líneas del carrito quedaban con el
nombre del producto reducido a puntos suspensivos, porque se metió un `CartLine` —publicado a 536 px
para la columna del POS— en un panel de ~320 px; y las tarjetas de producto eran un dibujo propio
sin los badges de descuento, «Top», favorito, variantes, stock por color ni «Personalizable».

| Frame | Antes | Ahora |
|---|---|---|
| `Escritorio / POS — carrito con cargo de servicio` | Montado a mano: grid propio y `CartLine` encogido a ~320 px | **Clon de `Escritorio / POS v2 — Carrito (listo)`** (Sección «Carrito»). Se conservan el grid, las tarjetas y las líneas aprobadas; lo añadido es la fila del cargo en el resumen, antes de impuestos, con la base gravable y el total recalculados |
| `Escritorio / POS — cobro con cargo de servicio` | No existía: el cargo solo aparecía en un diálogo propio que duplicaba el cobro | **Clon de `Escritorio / POS v2 — Cobro (cubierto)`** (Sección «Cobro»). Se añaden la fila del cargo en «Totales a pagar» y su acordeón propio `Alt+C`, junto a los de Entrega, Propina, Comisión y Factura electrónica |
| `Diálogo — Cargo de servicio y propina en el cobro (Nuevo)` | Pantalla de cobro paralela, montada a mano | Reconvertido en `Acordeón «Cargo de servicio» abierto (dentro del cobro aprobado)`: es el contenido del acordeón del frame clonado, no una pantalla aparte. Se le quitó el pie de «Completar venta», que pertenece al cobro |
| `Móvil / Reservas — nueva reserva (hoja)` | `CustomerPicker` encogido a 358 px y recortado | El picker va a sangre, a 390 px y con su altura natural, así que se ve entero —incluido su propio botón «Crear nuevo cliente», que es el alta rápida que pedía la decisión 8 y que ya estaba en el kit |

**Lo que no se rehízo, y por qué.** `Diálogo — Agregar productos a la mesa` ya instancia el
`ProductPicker` del kit a su ancho publicado; el panel lateral de la mesa y el detalle de mesa son
patrones nuevos que no existen en el conjunto aprobado, no versiones caseras de uno que sí exista, y
sus líneas van a 372 px y 700 px con el nombre completo a la vista.

**Comprobación añadida al script.** Además de los cinco chequeos anteriores, ahora se verifica que
ninguna instancia de `CartLine`, `ProductCard`, `PosProductSearch`, `ProductPicker`,
`CustomerPicker`, `DataTable`, `Pagination`, `EmptyState`, `ConfirmDialog`, `Toast`, `StatCard` ni
`PageHeader` quede por debajo de su ancho publicado, y que ningún texto con truncado activo esté
cortado. Las dos comprobaciones dan **0**.
