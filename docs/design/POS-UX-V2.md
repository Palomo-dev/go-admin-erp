# POS UX v2 — decisiones, mapa de atajos y paridad (Figma, 2026-09-22)

Archivo «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`). Páginas: `01 Sistema`, `02 Componentes`,
`03 Navegación y shell`, `04 Inventario`, `05 POS y ventas`, `06 Clientes`, `07 Finanzas`, `99 Descartes`. Esta tanda **parte de la tanda de fidelidad** (`docs/design/PARIDAD-POS-FIDELIDAD.md`)
y la sustituye en carrito, cobro, post-venta y móvil; conserva cabecera y caja, buscador y grid, CustomerPicker,
impuestos y Configuración › POS con retoques. Sin código, sin base de datos, sin commits.

Feedback del dueño que motiva la tanda: «El checkout puede ser mejor distribuido […] me gustaba la versión anterior
que daba rapidez y ponía las letras (atajos) […] todas las páginas [con] el mismo componente de paginación […]
¿dónde se activa la pantalla del cliente o la caja si está cerrada? […] cumplir las mismas funciones pero no con la
misma UI».

## 1. Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Componentes nuevos | `02 Componentes › POS v2` (Sección al final): `Kbd`, `KbdButton`, `CartTag`, `CartLine`, `CheckoutAccordion`, `CobrarButton` |
| Carrito v2 (escritorio, 8 estados) | `05 POS y ventas › Carrito` (filas 1-2); diálogos, toasts y sheets de fidelidad debajo |
| Cobro v2 (escritorio, 10 estados + post-venta offline) | `05 POS y ventas › Cobro` (filas 1-3); QR, seriales, toasts y sheets de fidelidad debajo |
| Cabecera y caja con `Kbd` | `05 POS y ventas › Cabecera y caja` (retoque en sitio) |
| Grid v2 (foco, `3*`, favoritas, stock por color) | `05 POS y ventas › Buscador y grid › Escritorio / POS v2 — Grid…` |
| Mapa de atajos (F1) | `05 POS y ventas › Mapa de atajos` (escritorio + hoja móvil) |
| Móvil v2 | `05 POS y ventas › Móvil v2` (POS, carrito en hoja, cobro ×4, post-venta) |
| Fidelidad sustituida | `99 Descartes › POS fidelidad (sustituido por v2 2026-09-22)` (16 frames, con anotaciones) |
| Capturas | `docs/design/figma/11-pos-v2-*.png` |

## 2. Decisiones D1-D5 y qué cambia respecto a la tanda de fidelidad

### D1 — Cabecera del POS: se mantiene la de fidelidad (+ chip de sucursal)
No hay `PosStatusBar` ni chips nuevos. La cabecera B.1 (Abrir/Cerrar Caja, indicador de pantalla del cliente con su
menú, «Sin conexión» + pendientes, contadores, reloj) sigue igual en escritorio y en el «⋯» del `MobileHeader
Mode=pos`. Lo único añadido: `Kbd` **F9** dentro de Abrir/Cerrar Caja (ahora `KbdButton`), `Kbd` **F10** dentro del
indicador de pantalla del cliente (4 estados + sheet móvil) y `Kbd` **Enter** en el botón de confirmar de
AperturaCajaDialog / CierreCajaDialog (escritorio y sheets). Retoque en sitio: 4 pantallas de cabecera, el frame
de 4 estados del indicador, 6 diálogos/sheets de caja y el sheet «Caja y dispositivo».
**Chip de sucursal (`BranchBadge`, restituido 2026-09-22):** el POS muestra hoy «Sucursal: {nombre}» junto al
nombre de la organización (`src/app/app/pos/page.tsx:603`, `src/components/inventario/BranchBadge.tsx`) — fucsia
para una sucursal concreta, azul para «Todas las sucursales». La v2 lo había perdido; ahora va en la fila 2 de la
cabecera («Mi empresa S.A.S. · Caja rápida / Venta · Sucursal: …») en los 20 frames v2 de escritorio, y como chip
compacto en el `MobileHeader Mode=pos` del kit (se propaga a todas las pantallas móviles). En el frame
`Carrito (vacío)` se dibuja la variante «Todas las sucursales» (chip azul) con el enlace «Elegir sucursal para
vender» + badge Nuevo en una segunda línea.

### D2 — Atajos de teclado visibles como `Kbd`
`Kbd` (18 px, Inter 11 Medium, fondo `bg/subtle`, borde `border/default`; variantes `Theme=light/dark/on-brand ×
Length=corta/larga`, prop «Tecla»). Va dentro del botón (`KbdButton`, `CobrarButton`, `CheckoutAccordion`) o en el
tooltip. Todo el sistema de atajos lleva badge «Nuevo» (hoy solo existe el lector de códigos por ráfaga, B.2 #13).
El mapa canónico está en §3 y dibujado en `POS — Mapa de atajos` (diálogo F1).

### D3 — Carrito: dos renglones por producto, todo visible
`CartLine` (536 px para la columna de 560; `Layout=mobile` 358 px):
- Renglón 1: miniatura 32 · nombre + variante en gris (una línea con «…»; SKU en tooltip, Nuevo) · cantidad `− n +`
  · bloque de importe (total, `{qty} × {unit} / {unit_code}`, `+$X impuestos` / `inc. $X impuestos` /
  «Sin impuesto») · acciones siempre visibles: nota (N), excluir impuesto (T), quitar (Supr).
- Renglón 2: casilla «Incluido» y etiquetas compactas `CartTag` (cocina, modificador `{mod.name} (+$X)`, nota,
  descuento `-$X` editable inline con los chips frecuentes al editar, «Sin impuesto (excluido)»). Las etiquetas
  ocultas no ocupan sitio.
- Cambio respecto a fidelidad: el precio unitario y los impuestos pasan del renglón 2 al bloque de importe del
  renglón 1 (junto al total) para que el renglón 2 quepa en 536 px con modificador + nota + descuento + «Incluido».
  Si una línea acumula más de tres etiquetas largas, la fila de etiquetas envuelve (caso raro, documentado).
- En móvil (358 px) el renglón 2 lleva cantidad, «Incluido» y acciones; las etiquetas van en un tercer renglón
  solo cuando existen.
- **Descuento por línea siempre alcanzable (restituido 2026-09-22):** cuando la línea no tiene descuento, el
  renglón de etiquetas muestra «+ Agregar descuento» con su `Kbd` `D` (`CartView.tsx:889`); el estado
  `editando-descuento` dibuja el campo «Descuento» (`:856`), Aplicar / Cancelar y los chips de descuentos
  frecuentes «−$ 5.000 / −$ 10.000 / 10 %» (`:907`). Se ve en el frame `Carrito (recién agregada)`.
- Estados del componente: simple / extras / foco (anillo brand; atajos D N T Supr en tooltip) / recien-agregada
  (1 s, `state/success-subtle`) / impuesto-excluido / editando-descuento.
- Columna del carrito: 560 px (fidelidad usaba 480); productos 808 px: el `PosProductSearch` reflowa a **3 tarjetas por fila** (236 px, gap 16) y la barra de categorías recorta en el borde del contenedor mostrando solo los chips que caben completos (Todas … Ropa + chevron de scroll). Verificado por script en los 20 frames v2 de escritorio: `clipsContent` activo y ningún hijo del grid ni de la barra con `x + width` mayor que su contenedor.
- Totales: se conservan el interruptor «Impuestos incluidos» y el selector «Impuestos disponibles» en una fila;
  Subtotal, un renglón por impuesto (`{nombre} {tasa}`, nunca «IVA» fijo), «Total impuestos», Descuento y
  **Total** grande.
- `CobrarButton` a todo el ancho (56 px) con importe y `Kbd`; Espera · Deuda · Enviar Cocina en una fila de tres
  `KbdButton` debajo.
- **Medición** (frame `Escritorio / POS v2 — Carrito (listo…)`, 1440×900): con 4 productos (uno con modificador +
  nota + descuento, uno de cocina, uno sin impuesto) el `CobrarButton` ocupa y = 792–848 → total y «Cobrar · $ ·
  F4» visibles sin scroll. Reparto vertical de la columna (767 px): pestañas 44 · cliente 44 · cabecera 24 ·
  líneas 366 · resumen 173 · acciones 116.

### D3b — Estados con acción
- Sin caja: `CobrarButton State=sin-caja` «Abrir caja para cobrar · F9» (abre AperturaCajaDialog); se retira el
  botón deshabilitado + aviso; la cabecera muestra «Abrir Caja · F9».
- Falta dinero: `CobrarButton State=falta` «Falta $ Y» deshabilitado y el bloque de pagos en ámbar.
- Sin conexión: igual que fidelidad (badge de cabecera → Pendientes; venta «Pendiente de sincronizar»).
- Procesando: `CobrarButton State=procesando` bloqueado con spinner.
- Vacío / cargando / error: EmptyState y Skeleton del kit; error con «Reintentar».

### D3c — Grid, post-venta, móvil y feedback
- Grid: foco visible de teclado en la tarjeta (↑↓ Enter), toda la tarjeta agrega (se conserva «Elegir»),
  cantidad rápida `3*` (Nuevo, tooltip bajo el buscador), «Favoritas» primero (estrella rellena), badge de stock
  con color (verde / ámbar ≤ 5 / rojo) y número.
- **Estrella por categoría (restituida 2026-09-22):** cada chip/tarjeta de categoría lleva su propia estrella de
  favorita (`CategoryFilterBar.tsx:134-142` y `:236-241`), ámbar rellena si `is_favorite` (Bebidas y Calzado en el
  ejemplo) y gris si no, con tooltip «Marcar como favorita» / «Quitar de favoritas». Está en los modos chips e
  images del componente `CategoryBar` del kit; en el modo combobox la estrella se marca en la lista del
  SearchSelect. Es independiente del filtro «Favoritas».
- **Badge «Top» (restituido 2026-09-22):** badge naranja con icono de llama abajo-izquierda sobre la imagen cuando
  `sales_count_90d > 0` (`ProductSearch.tsx:743-751`), con tooltip «{n} unidades vendidas en los últimos 90 días».
  Vive en `ProductCard` variante `pos` (prop «Mostrar Top», solo `Size=md`: la miniatura de `Size=sm` no tiene
  alto) y sustituye al «· Top» que la v2 había dejado como texto gris de metadatos (limpiado en 46 instancias).
- Post-venta: recibo impreso automático según Configuración › POS («Recibo enviado a {impresora}», Nuevo);
  `Enter` = nueva venta como acción primaria; «Re-imprimir Recibo» (P) y «Factura Electrónica» (F) secundarios;
  «Cerrar» (Esc). Variante offline con «Pendiente de sincronizar · {receipt_number_local}».
- Móvil: barra fija abajo con total y «Cobrar · F4» (sustituye al botón flotante «Carrito · n · $»); carrito como
  hoja deslizable; cobro en Sheet a pantalla completa; caja/pantalla/offline siguen en el «⋯» del
  `MobileHeader Mode=pos`.
- Feedback: línea recién agregada resaltada 1 s + Toast de una línea que se cierra solo; confirmaciones solo para
  acciones destructivas (se conservan los ConfirmDialog de fidelidad).

### D4 — Cobro por pasos progresivos (misma información, mejor distribuida)
`CheckoutDialog v2` (1120 px, dos zonas):
- Izquierda fija (360): «Total a pagar» grande, resumen colapsable «4 productos · ver detalle» (lista `{name} x{qty}`
  + Subtotal / Impuestos / Descuentos / Total), totales a pagar (Subtotal base imponible, Impuestos con desglose
  `{nombre} {tasa}` marcado Nuevo, Propina, Flete, Total a pagar) y las tres cifras **Total pagado / Falta /
  Cambio** (Falta en ámbar, Cambio en verde).
- Derecha = flujo: **Pagos** siempre abierto (botones grandes de método con `Kbd` Alt+1…5, Nuevo; monto con
  «Exacto · Alt+E» y montos rápidos 50k…1M; «Agregar»; lista de pagos con «Pago n», método, monto, «Generar QR de
  pago», «Eliminar»; casilla «Impuestos incluidos en precios») y cuatro `CheckoutAccordion` cerrados con resumen:
  «Entrega · Envío propio · $ 8.000 · Alt+D», «Propina · 10 % · $ 48.980 · sin mesero · Alt+P», «Comisión de
  Vendedor · Ana Gómez · 3 % · $ 14.694» (sin atajo: no está en el mapa), «Factura Electrónica · Activada ·
  Global · Alt+F». Al abrir uno se ve exactamente el contenido de fidelidad (frames «Entrega abierta», «Propina
  abierta», «Comisión abierta»).
- Pie fijo: «Cancelar · Esc» y `CobrarButton` «Completar venta · $ X · Enter»; si falta dinero, «Falta $ Y»
  deshabilitado.
- Cambio respecto a fidelidad: el diálogo pasa de 1829 px de alto (todo desplegado) a 900 px con los opcionales
  colapsados; ningún control se pierde (ver §4).

### D5 — Una sola paginación
Barrido por script de las 26 Secciones de pantallas (entonces todas en `03 Pantallas`; textos «Mostrando…», «Anterior/Siguiente», «n / m»,
«Página n de…» fuera de instancias del kit, y frames nombrados como paginación): **0 paginaciones dibujadas a
mano** (ya se habían sustituido en las tandas anteriores; las coincidencias fueron badges de seriales «1/2»,
pasos «1 / 1» y textos de lotes). Instancias de `Pagination` del kit por Sección: Escritorio — productos 8,
Escritorio — POS 2, Móvil — productos 1, Producto — Seriales 1, Producto — Notas · Historial 1, Productos —
Catálogo (menús) 4, POS — Cobro 10, POS — Cabecera y caja 4, POS — Carrito 8, POS — CustomerPicker 1, POS —
Buscador y grid 1, Configuración › POS 2, POS — Mapa de atajos 1 (las cifras altas son el `PosProductSearch`
de fondo en cada pantalla). Sustituciones en esta tanda: 0 por Sección.

### Ajuste del dueño en `ProductCard` (grid)
Estrella de favorito en un contenedor 28×28 con la misma inserción que el badge (top 12, right 12) y ambos centrados
verticalmente (Size=md: badge y estrella en y = 12–40; Size=sm: 8/8 con 24×24). Corregido en el componente maestro;
verificado en default (con descuento), out-of-stock (Agotado), selected y en la instancia del grid v2 (favorita
activa = estrella rellena).

## 3. Mapa de atajos (canónico, D2)

Evita F3, F5, F11, F12 y Ctrl+letra del navegador. Dibujado en `POS — Mapa de atajos` (diálogo F1, escritorio y
hoja móvil).

| Tecla | Acción | Dónde se ve el `Kbd` |
|---|---|---|
| `/` | Enfocar el buscador | SearchBar (ya existía) |
| `Esc` | Limpiar el buscador · cerrar el diálogo | cabecera y «Cancelar» del cobro, «Cerrar» post-venta |
| `↑ ↓` | Moverse por el grid | tooltip de la tarjeta con foco |
| `Enter` | Agregar el producto con foco | tooltip de la tarjeta con foco |
| `3*` | Cantidad rápida antes de elegir (Nuevo) | tooltip bajo el buscador |
| `F1` | Mapa de atajos | diálogo |
| `F2` | Cliente | «Cambiar» / «Seleccionar cliente» |
| `F4` | Cobrar | `CobrarButton` |
| `F6` | Poner en espera · reactivar | «Espera» / «Reactivar» |
| `F7` | Registrar deuda | «Deuda» |
| `F8` | Enviar a cocina | «Enviar Cocina» |
| `F9` | Abrir · cerrar caja | cabecera y «Abrir caja para cobrar» |
| `F10` | Pantalla del cliente | indicador de la cabecera |
| `Ctrl+N` | Nuevo carrito | botón «+» de las pestañas |
| `Ctrl+Tab` | Siguiente carrito | mapa |
| `Ctrl+B` | Código de barras manual | mapa |
| línea con foco: `+ / −`, `D`, `N`, `T`, `Supr` | cantidad, descuento, nota, impuesto incluido/excluido, quitar | tooltip de la línea (estado foco) |
| cobro: `Alt+1…5` | Efectivo · Tarjeta · Transferencia · QR · Otro | botones de método |
| `Alt+E` · `Alt+P` · `Alt+D` · `Alt+F` | Exacto · Propina · Entrega · Factura electrónica | «Exacto» y cabeceras de acordeón |
| `Enter` (cobro) | Completar venta, solo cubierto | `CobrarButton` |
| post-venta: `Enter` · `P` · `F` | Nueva venta · Reimprimir · Factura | botones de post-venta |

## 4. Tabla de paridad — B.1 / B.7 / B.8 / B.13-B.18 → frame de `03`

Estados: **calcado** (existe en código, misma función), **Nuevo** (badge en Figma), **sustituido por …**,
**omitido: motivo**. Cero omitidos sin motivo. Los controles no listados de B.1a-B.1c, B.9-B.11, B.6 y B.17 no
cambian respecto a `PARIDAD-POS-FIDELIDAD.md` (mismos frames, ahora con `Kbd` donde aplica).

| # auditoría | Control | Frame Figma (v2) | Estado |
|---|---|---|---|
| B.1 #1-#3 | icono, «Sistema POS», `{organization.name} · Caja rápida / Venta` | Cabecera del POS en todas las pantallas v2 (clon de fidelidad) | calcado |
| B.1 #4 | `BranchBadge` «Sucursal: {nombre}» (azul en «Todas», fucsia en una concreta) | fila 2 de la cabecera en los 20 frames v2 + chip en `MobileHeader Mode=pos`; variante «Todas las sucursales» + «Elegir sucursal para vender» en `Carrito (vacío)` | calcado (restituido 2026-09-22; además sigue el BranchPicker del AppHeader) |
| B.1 #5 | «Abrir Caja» | cabecera «sin caja» + `Carrito (sin caja)` | calcado + `Kbd` F9 (Nuevo) |
| B.1 #6-#7 | «Cerrar Caja» (+ deshabilitado con tooltip) | cabecera «caja abierta» / «otro cajero» | calcado + `Kbd` F9 |
| B.1 #8 | «Sin conexión» + N | cabecera (oculto en los estados en línea de v2) | calcado |
| B.1 #9-#12 | reloj, indicador de pantalla, «N Activos», «N En Espera» | cabecera | calcado; indicador + `Kbd` F10 (Nuevo) |
| B.1 #13 | divisor 75/25 | — | omitido: el reparto pasa a 808/560 fijo en 1440 (decisión D3); pregunta abierta |
| B.1 #14-#16 | skeleton, «Organización no encontrada», recargando | `POS — Cabecera y caja` (sin cambios) | calcado |
| B.1 #17-#18 | toasts y alerts | Toasts de fidelidad (sin cambios) | sustituido por Toast del kit |
| B.7 #1 | (Users) «Cliente» | fila de cliente del carrito (icono Users en «Sin cliente») | calcado (compacto) |
| B.7 #2-#3 | «Seleccionar cliente» / popover / diálogo ≤640 | `Carrito (sin caja)` «Seleccionar cliente · F2» → CustomerPicker (Sección de fidelidad) | calcado + `Kbd` F2 |
| B.7 #4-#12 | CustomerPicker | `POS — CustomerPicker` (sin cambios) | calcado |
| B.7 #13 | card: avatar, nombre, «Pendiente de sincronizar», email, teléfono, doc | fila de cliente: avatar, nombre (+ badge pendiente por instancia), «email · teléfono · CC n» en una línea | calcado (compacto, una línea truncable) |
| B.7 #13 (F.2) | saldo CxC | — | omitido en v2: la fila compacta no lo muestra; queda en la card completa del CustomerPicker (pregunta abierta) |
| B.7 #14 | «Quitar cliente» (+ Cambiar / Ver / Editar) | fila de cliente: «Cambiar · F2», Ver, Editar, X | calcado |
| B.7 #15 | alert de error | Toasts de fidelidad | sustituido por Toast |
| B.8 #1-#4 | pestaña con icono, nombre (8 chars + «…»), badge total, badge líneas, X | CartTabs de todos los carritos v2 | calcado |
| B.8 #5 | arrastre horizontal | — | calcado como comportamiento (2 pestañas + «+» en 560 px; la tercera se desplaza) |
| B.8 #6 | (Plus) crear carrito | `KbdButton` «+ · Ctrl+N» | calcado + `Kbd` |
| B.8 #7 | card resumen «Items · Cliente · En espera · total · hora» | cabecera del carrito «Carrito · n productos» + «Cliente: …»; en espera: badge + motivo + hora | calcado (compacto) |
| B.8 #8 | «No hay carritos activos» + «Crear Carrito» | `Carrito (vacío)` cubre el carrito vacío; «sin carritos» sigue en el frame `Col` de fidelidad (99) | calcado en fidelidad; omitido en v2: mismo EmptyState con otro texto |
| B.8 #9 | «¿Cerrar este carrito?» | ConfirmDialog de fidelidad (conservado en la Sección) | calcado |
| B.13 #1 | (ShoppingCart) «Carrito» | cabecera del carrito | calcado |
| B.13 #2 · #5 | badge «Espera», «Reactivar» | `Carrito (en espera)`: badge + «Reactivar · F6» (cabecera y fila secundaria) | calcado + `Kbd` |
| B.13 #3 · #4 · #6 | badge «Deuda», badge de cocina del carrito, «Deuda registrada - Ver en Cuentas por Cobrar» | `Carrito (con deuda)` | calcado |
| B.13 #7 | «Cliente: {full_name}» | cabecera del carrito | calcado |
| B.13 #8-#9 | miniatura, nombre | `CartLine` renglón 1 | calcado |
| B.13 #10 | badge de cocina por línea | `CartTag info` «En preparación» (Pan artesanal) | calcado |
| B.13 #11 | badge `{atributo}: {valor}` | variante en gris junto al nombre («· Talla 40 · Negro») | sustituido por texto secundario en el nombre (D3) |
| B.13 #12 | badge `{mod.name} (+$X)` | `CartTag warning` | calcado |
| B.13 #13 | badge (StickyNote) `{notes}` | `CartTag brand` con icono | calcado |
| B.13 #14-#16 | nota inline (campo, guardar, cancelar) | — | omitido en v2 como frame propio: mismo patrón que `Carrito completo / active (edición inline)` de fidelidad (99); la nota se edita tocando la etiqueta o N |
| B.13 #17 | badge `{sku}` | tooltip sobre el nombre (Nuevo) | sustituido por tooltip (D3) |
| B.13 #18 | `{$unit_price} / {unit_code}` | bloque de importe «1 × $ 15.000 / srv» | calcado (movido al renglón 1) |
| B.13 #19 | «Sin impuesto (excluido)» | `CartTag warning` + «Sin impuesto» en el bloque de importe | calcado |
| B.13 #20 | «+$X impuestos» / «(inc. $X impuestos)» | bloque de importe | calcado |
| B.13 #21 | badge (Tag) «-$X» | `CartTag danger` | calcado |
| B.13 #22-#27 | descuento inline + «Frecuentes» + «+ Agregar descuento» | `CartLine State=editando-descuento` (kit) y `Carrito (recién agregada)`; el enlace «+ Agregar descuento · D» en toda línea sin descuento | calcado |
| B.13 #28 | `{$total}` y «{qty} × {$unit}» | bloque de importe | calcado |
| B.13 #29-#31 | −, cantidad, + | renglón 1 (28 px) | calcado (+ ConfirmDialog al llegar a 0, Nuevo, conservado) |
| B.13 #32 | checkbox «Incluido» | renglón 2 (atenuado en excluido y en espera/deuda) | calcado |
| B.13 #33-#35 | excluir impuesto, nota, eliminar | acciones del renglón 1, siempre visibles (T, N, Supr) | calcado + atajos |
| B.13 #36 | Enter / Escape | mapa de atajos | calcado (documentado) |
| B.13 vacío | «El carrito está vacío» | `Carrito (vacío)` (EmptyState compact) | calcado |
| B.14 #1 | (Calculator) «Resumen» | bloque Resumen (sin título: la fila de impuestos incluidos lo encabeza) | sustituido: el título se retira para ganar altura (D3) |
| B.14 #2 | (Settings) sin acción | — | omitido: sin función en código (B.19 #7); pregunta abierta de fidelidad sigue vigente |
| B.14 #3 | switch «Impuestos incluidos» | fila superior del Resumen | calcado |
| B.14 #4 | «Subtotal:» | Resumen | calcado |
| B.14 #5-#8 | «Impuestos disponibles», selector y popover | Select sm «2 impuestos seleccionados» (popover abierto: frame de fidelidad en 99) | calcado |
| B.14 #9-#12 | impuestos aplicados por nombre, «Total impuestos», «Descuento», «Total» | Resumen (nombres reales, nunca «IVA») | calcado |
| B.14 #13 | «No hay impuestos configurados…» | `Carrito (vacío)` y `(error)` | calcado |
| B.14 cargando | skeleton | `Carrito (cargando)` | calcado |
| B.15 #1-#4 | Espera, Deuda, Enviar Cocina, Cobrar | fila secundaria `KbdButton` + `CobrarButton` (F6 F7 F8 F4) | calcado + `Kbd` |
| B.15 #5 | «Debe abrir una caja antes de cobrar» | `Carrito (sin caja)` | sustituido por «Abrir caja para cobrar · F9» (D3b) |
| B.15 #6-#9 | Ver Factura, Imprimir, Cobrar, Anular | `Carrito (con deuda)` | calcado (Anular con confirmación, conservada) |
| B.15 #10-#20 | diálogos Espera / Deuda / Detalle de Factura | frames de fidelidad conservados en la Sección | calcado |
| B.16 #1 | toast «No hay caja abierta» | Toasts de fidelidad | calcado |
| B.16 #2-#3 | «Procesar Pago», «{n} productos · Total», X | cabecera del CheckoutDialog v2 (+ `Kbd` Esc) | calcado |
| B.16 #4-#5 | «Resumen de Venta» y totales | zona izquierda, resumen colapsable (abierto en «inicial») | calcado |
| B.16 #6 (+E.7c) | Subtotal base, Impuestos + desglose, Propina, Flete, Total a pagar, Total pagado, Falta, Cambio | zona izquierda | calcado; desglose Nuevo |
| B.16 #7-#19 | Entrega completa | `Cobro (Entrega abierta · Alt+D)` | calcado dentro del acordeón |
| B.16 #20-#21 | «Métodos de Pago», «Agregar» | tarjeta Pagos | calcado |
| B.16 #22-#25 | «Pago n», «Eliminar», menú «Método», «Monto» | lista de pagos + botones de método (Alt+1…5, Nuevo) + NumberInput | calcado; el menú de método se sustituye por los 5 botones (Nuevo) — «Otro» abre el menú completo |
| B.16 #26 | «Exacto» + 50k…1M | `KbdButton` «Exacto · Alt+E» + chips | calcado + `Kbd` |
| B.16 #27 | «Generar QR de pago» / «Generando…» | fila «Pago 2 · QR Bancolombia» (cubierto / procesando) | calcado |
| B.16 #28 | toast link de pago | Toasts de fidelidad | calcado |
| B.16 #29 | «Impuestos incluidos en precios» | pie de la tarjeta Pagos | calcado |
| B.16 #30-#36 | Propina completa | `Cobro (Propina abierta · Alt+P)` | calcado dentro del acordeón |
| B.16 #37-#41 | Comisión completa | `Cobro (Comisión abierta)` | calcado dentro del acordeón |
| B.16 #42 | switch «Factura Electrónica» + info + «Global» | acordeón FE (resumen «Activada · Global», Alt+F) | calcado |
| B.16 #43 | «Cancelar» | pie «Cancelar · Esc» (deshabilitado en procesando) | calcado |
| B.16 #44 | «Completar Venta» / «Falta dinero» / «Procesando...» | `CobrarButton` default / falta («Falta $ Y») / procesando | calcado (texto «Falta dinero» → «Falta $ Y», D3b) |
| B.16 #45 · B.6 | Selección de Seriales | `Cobro › Selección de Seriales` (SerialPicker del kit sobre el cobro) | calcado |
| B.16 #46-#49 | ConfirmDialog stock, toasts, alert | frames de fidelidad conservados | calcado / sustituido por Toast |
| B.17 #1-#9 | Pago QR | `Cobro › Pago QR` (QrPaymentDialog de fidelidad sobre el cobro) + 4 estados conservados | calcado |
| B.18 #1-#3 | «¡Venta Completada!», «Venta #{id} procesada exitosamente», Total/Pagado/Cambio | Post-venta v2 (escritorio, offline, móvil) | calcado |
| B.18 #2 | «Pendiente de sincronizar · {receipt_number_local}» | Post-venta v2 (offline) | calcado |
| B.18 #4-#5 | «Re-imprimir Recibo», «Factura Electrónica» | Post-venta v2 (P, F) | calcado + `Kbd` |
| B.18 #6 | «Cerrar» | Post-venta v2 (Esc) | calcado |
| B.18 (Nuevo) | recibo automático «Recibo enviado a {impresora}», «Nueva venta · Enter» | Post-venta v2 | Nuevo (D3c) |
| B.3 estrella por categoría | estrella en cada chip/tarjeta de categoría (`onToggleFavorite`, ámbar si `is_favorite`, tooltip «Marcar como favorita» / «Quitar de favoritas») | `CategoryBar` del kit (modos chips e images) y grid v2 con tooltip | calcado (restituido 2026-09-22) |
| B.4 badge «Top» | badge naranja con llama abajo-izquierda sobre la imagen si `sales_count_90d > 0`, tooltip «{n} unidades vendidas en los últimos 90 días» | `ProductCard` variante `pos` (prop «Mostrar Top», solo Size=md) y grid v2 con tooltip | calcado (restituido 2026-09-22; sustituye al «· Top» de metadatos) |
| B.12 #1-#4 | vista productos / carrito móvil, «Seguir comprando», botón flotante | `POS — Móvil v2`: barra fija + hoja de carrito (cerrar la hoja = seguir comprando) | sustituido por la barra fija y la hoja (D3c) |

Conteo de esta tanda (filas anteriores): calcados 66 (4 restituidos el 2026-09-22: chip de sucursal, «+ Agregar
descuento» + edición, estrella por categoría y badge «Top») · Nuevo 9 (`Kbd`/atajos, botones de método, cantidad rápida,
desglose por impuesto, recibo automático, nueva venta con Enter, tooltip de SKU, foco de teclado, mapa F1) ·
sustituidos 8 · omitidos con motivo 6.

## 5. Chequeos y capturas

- Chequeo por script (2026-09-22): **0 solapes** entre Secciones y entre frames de primer nivel en `02`, `03` y
  `99`; 0 frames fuera de su Sección; 0 nodos sueltos; **0 instancias rotas** (`mainComponent` nulo); en las
  pantallas v2 **0 textos «IVA»** (los chips «IVA 19 %» de tandas anteriores y la fila «IVA» de Finanzas ›
  Impuestos son nombres de impuesto configurados por la organización, no etiquetas fijas).
- Capturas (`docs/design/figma/`): `11-pos-v2-02-componentes.png`, `11-pos-v2-03-carrito-seccion.png`,
  `11-pos-v2-03-cobro-seccion.png`, `11-pos-v2-03-mapa-atajos.png`, `11-pos-v2-03-movil-seccion.png`,
  `11-pos-v2-carrito-listo.png`, `11-pos-v2-cobro-cubierto.png`, `11-pos-v2-cobro-entrega-abierta.png`,
  `11-pos-v2-grid-foco-3x.png`, `11-pos-v2-movil-carrito.png`, `11-pos-v2-movil-cobro.png`,
  `11-pos-v2-post-venta.png`, `11-pos-v2-cabecera-kbd.png`, `11-pos-v2-movil-pos.png`. El MCP limita a 1024 px el lado mayor: las de
  Sección son vistas generales.
- Limitación del entorno de scripting: los nodos ocultos de una instancia no son accesibles por la API del MCP,
  por eso `CartLine State=extras` muestra las cinco etiquetas en el kit y cada instancia oculta las que no aplican.

## 6. Preguntas abiertas para el dueño (máximo 5)

1. Reparto fijo 808/560 en 1440 (D3) frente al divisor arrastrable 75/25 de hoy (B.1 #13): ¿se conserva el
   arrastre con 560 como ancho por defecto?
2. Comisión de vendedor sin atajo (no está en el mapa canónico): ¿se añade `Alt+C`?
3. Atajos configurables por organización (pie del mapa F1): ¿fase posterior o se descarta?
4. Saldo CxC del cliente en la fila compacta del carrito (F.2, Nuevo en fidelidad): ¿se muestra como badge o
   solo en la card completa del CustomerPicker?
5. Impresión automática del recibo (D3c): ¿por defecto activada en Configuración › POS para todas las
   organizaciones o solo cuando hay impresora vinculada a la estación?

## Reorganización por módulos (2026-09-22)

Petición del dueño: «en Figma podríamos separar mejor las pantallas para que no se vea tan
complicado, por módulos […] en este momento una sola página se está haciendo muy difícil de leer».
Las 26 Secciones de `03 Pantallas` se repartieron por módulo, con sus frames y anotaciones intactos
(nada se rehízo). Páginas del archivo tras la reorganización: `01 Sistema` · `02 Componentes` ·
`03 Navegación y shell` · `04 Inventario` · `05 POS y ventas` · `06 Clientes` · `07 Finanzas` ·
`99 Descartes`.

Cada página lleva arriba a la izquierda una Sección «Índice» con el nombre del módulo y la lista de
sus Secciones (texto de 18 px con el color `text/secondary` — pizarra — de `01 Sistema`). Dentro de
cada página las Secciones quedan apiladas por flujo (lista → detalle → diálogos → móvil), a 400 px
una de otra y con `x = 0`.

| Qué | Dónde (tras la reorganización) |
|---|---|
| Componentes nuevos | `02 Componentes › POS v2` (sin cambios) |
| Carrito v2 | `05 POS y ventas › Carrito` |
| Cobro v2 | `05 POS y ventas › Cobro` |
| Cabecera y caja con `Kbd` | `05 POS y ventas › Cabecera y caja` |
| Grid v2 | `05 POS y ventas › Buscador y grid` |
| Mapa de atajos (F1) | `05 POS y ventas › Mapa de atajos` |
| Móvil v2 | `05 POS y ventas › Móvil v2` |
| CustomerPicker compartido | `06 Clientes › CustomerPicker` |
| Impuestos | `07 Finanzas › Impuestos` |
| Fidelidad sustituida | `99 Descartes` (sin cambios) |

Vistas generales por página: `docs/design/figma/12-mapa-03-navegacion-y-shell.png`,
`12-mapa-04-inventario.png`, `12-mapa-05-pos-y-ventas.png`, `12-mapa-06-clientes.png`,
`12-mapa-07-finanzas.png`.

Chequeo por script al cerrar (las 8 páginas): 0 solapes entre Secciones, 0 solapes entre frames de
primer nivel, 0 nodos fuera de Sección en las páginas de pantallas, 0 instancias desvinculadas
(las instancias siguen apuntando a sus maestros de `02 Componentes`, que no se movió).


## 7. Descuentos y tarjetas de producto en móvil (tanda del 2026-09-22)

Dos encargos del dueño en la misma tanda:

- **«Se ve muy recortado las imágenes»** en las tarjetas de producto del POS en móvil (la franja de imagen medía
  ~25 px, `ProductCard Variant=pos, Size=sm`).
- **Botón «Descuento» junto a Cobrar**, con descuento por producto *y* descuento a toda la venta, y una columna
  nueva `discount_source` para poder distinguir los tres orígenes (aprobada por el dueño).

Esta tanda **solo dibuja**. La migración de `discount_source` se aplica después de que el dueño valide el diseño;
aquí no se tocó ni código ni base de datos.

### 7.1 Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| `ProductCardMovil` (Variant tarjeta / lista × State default · agotado · favorito · top · sin-foto) | `02 Componentes › POS v2` |
| `DensidadSelector` (Variant tarjeta / lista / compacta) | `02 Componentes › POS v2` |
| `CartTag` + 3 variantes nuevas (`descuento-manual`, `descuento-general`, `descuento-promocion`) | `02 Componentes › POS v2` (el set pasa de 6 a 9 variantes) |
| Carrito con los tres badges y los totales separados | `05 POS y ventas › Descuentos` |
| Diálogo «Descuento» (4 frames) y «Autorización de un supervisor» | `05 POS y ventas › Descuentos` |
| Sheets móviles de descuento y menú de acciones del carrito | `05 POS y ventas › Descuentos` |
| Ajuste «Límite de descuento sin autorización» (apagado / activo) | `05 POS y ventas › Descuentos` |
| POS móvil en modo Tarjeta (frame canónico corregido), modo Lista y selector de densidad | `05 POS y ventas › Móvil v2` |
| Capturas | `docs/design/figma/13-descuento-*.png` y `13-movil-cards-*.png` |

### 7.2 Descuentos — el modelo `discount_source`

Lo que hay hoy en el código (verificado antes de dibujar):

- `posService.ts:2734` — `cart.discount_total` es **la suma de los `discount_amount` de las líneas**. No existe
  ningún descuento «de cabecera»: todo descuento acaba escrito en una línea.
- `posService.updateCartItemDiscount` (`:1040`) — escribe `discount_amount` en una línea y lo acota a
  `quantity × unit_price`. Es el único camino manual de hoy.
- `posService.getFrequentDiscounts` (`:1097`) — lee `sale_items` e `invoice_items` con `discount_amount > 0` para
  el producto y devuelve **los 3 importes más frecuentes**. Hoy no puede distinguir de dónde vino cada importe.
- `promotionEngine` — sus descuentos se escriben también en `discount_amount` por línea, y solo cuando la línea no
  trae ya un descuento manual (`posService.ts:1697` y `:2714`). Es decir: **un descuento manual gana a la promoción**.
- `CartView.tsx` — badge rojo editable inline (`:831`), «+ Agregar descuento» (`:889`) y chips de frecuentes al
  editar (`:891` y `:908`).

Por eso la columna nueva. `discount_source` en `cart_items`, `sale_items` e `invoice_items`:

| Valor | Quién lo escribe | Badge en la línea | ¿Alimenta los chips de frecuentes? |
|---|---|---|---|
| `manual` | el cajero, por línea (diálogo «A un producto» o «+ Agregar descuento») | rojo, solo el importe: «−$ 10.000» | **Sí** |
| `general` | el reparto proporcional del descuento a toda la venta | rojo con icono de porcentaje y la etiqueta «general»; tooltip «Parte del descuento general de la venta» | No |
| `promotion` | `promotionEngine` | color de promoción (violeta) con el nombre de la promo; tooltip con la promoción y su vigencia | No |
| `NULL` | filas históricas anteriores a la migración | se lee y se pinta como `manual` | **Sí** |

Consecuencias de diseño que quedan dibujadas:

1. **Chips de frecuentes**: pasan a leer solo `manual` y nulos. El aviso del diálogo lo dice con esas palabras,
   porque es el cambio de comportamiento que el cajero puede notar.
2. **Reparto proporcional**: el descuento a toda la venta se prorratea por el importe de cada línea y **el ajuste
   de centavos va en la última**, para que la suma cuadre exactamente. El diálogo muestra la previsualización
   línea a línea antes de aplicar.
3. **«Quitar descuento general»** borra de un golpe solo las filas con `discount_source = general`; los manuales y
   las promociones quedan intactos. Hay dos entradas: el botón del diálogo y la **✕** de la fila de totales.
4. **Totales con tres filas separadas**: «Descuento (manual)», «Descuento general ✕» y «Promociones». Hoy los tres
   se suman en una sola cifra y no hay manera de deshacer solo uno.
5. La precedencia actual no cambia: escribir un descuento manual sobre una línea con promoción la sustituye, y el
   badge cambia de color.

### 7.3 Botón «Descuento · D» y el diálogo de dos pestañas

La botonera del carrito pasa de tres secundarios a **cuatro**: `Descuento D` · `Espera F6` · `Deuda F7` ·
`Cocina F8`, debajo del `Cobrar · $ · F4` a todo el ancho. Para que quepan cuatro en la columna de 560 px se
ocultan los iconos de los `KbdButton` y «Enviar Cocina» se abrevia a «Cocina» (contenido máximo 116 px sobre 128
disponibles; comprobado por script). En móvil los cuatro viven en el menú de acciones del carrito, con su `Kbd` a
la derecha para quien use teclado externo.

`Descuento` abre un diálogo (escritorio, 560 px) o un Sheet (móvil) con dos pestañas:

- **A un producto** (por defecto): lista de las líneas del carrito con su importe y el descuento que ya tengan;
  al elegir una, el mismo flujo de hoy — segmentado Importe / %, campo con el máximo de la línea, chips de
  frecuentes del producto y «Nuevo total de la línea». Botón «Quitar descuento» en el pie.
- **A toda la venta**: Importe / %, motivo opcional, aviso del reparto y **previsualización del reparto** por
  línea con el total repartido y la nota del ajuste de centavos. En el estado aplicado, «Quitar descuento
  general» es la acción destructiva del pie.

### 7.4 Tope por rol — ajuste opcional, apagado por defecto (Nuevo)

En `Configuración › POS`, tarjeta **«Límite de descuento sin autorización»** con badge «Nuevo» y el interruptor
**apagado por defecto**. Activa: tabla de límites por rol (`%` por línea y por venta; «Sin límite» para
administrador) y casilla «Pedir motivo obligatorio cuando se supere el límite». Cuando se supera, el diálogo
«Autorización de un supervisor» pide usuario o PIN y el motivo, y deja registro de quién autorizó y cuándo (con
la zona horaria de la organización). El límite **se comprueba en el servidor a partir del rol resuelto de la
sesión**, nunca del nombre del rol que llegue del cliente. Si el dueño lo descarta, se borran esos dos frames sin
tocar nada más.

### 7.5 Tarjetas de producto en móvil: modo Tarjeta y modo Lista

El selector de densidad del buscador pasa a tener **tres** opciones en móvil — Tarjeta · Lista · Compacta — y
recuerda la preferencia en el dispositivo. Hoy el código solo tiene dos tamaños de rejilla
(`ProductSearch.tsx:100`, `gridSize: 'small' | 'large'`) y ningún modo lista: el selector de tres opciones va
marcado «Nuevo».

- **Modo Tarjeta (por defecto)** — `ProductCardMovil Variant=tarjeta`, 171 px de ancho (2 columnas en 390 con 16
  de separación). Imagen **cuadrada 1:1** a todo el ancho (169 × 169) en vez de la franja de 25 px. Badges
  superpuestos en las esquinas de la imagen: descuento «-17 %» arriba-izquierda, estrella de favorito
  arriba-derecha, «Top» con llama abajo-izquierda y «Agotado» centrado sobre la imagen atenuada. Debajo: nombre a
  **2 líneas** con elipsis, precio con la comparación tachada, meta («3 var. · 22 uds» con el punto de color del
  stock) y «Elegir» a ancho completo. Sin foto: marcador con icono e inicial del producto, nunca un recuadro vacío.
- **Modo Lista (Nuevo)** — `ProductCardMovil Variant=lista`, fila de 358 × 74 con miniatura 56 × 56 a la
  izquierda, nombre + precio + meta a la derecha, estrella de favorito y botón «+» al final. Caben **≈7 productos
  por pantalla** en 390 × 844 con la barra fija de total y «Cobrar · F4» abajo (frente a 4 en modo tarjeta); el
  resto llega con el scroll infinito que ya existe.
- Estados cubiertos en los dos modos: `default`, `agotado`, `favorito`, `top`; `sin-foto` además en tarjeta.

El componente nuevo **sustituye a `ProductCard Variant=pos, Size=sm` en las pantallas móviles del POS**. El
`ProductCard` original no se tocó: sus instancias de escritorio y de catálogo siguen intactas.

### 7.6 Filas de paridad nuevas

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| B.13 (`CartView.tsx:831`) | badge rojo de descuento editable inline con el importe | `Carrito con descuentos` · línea 1 · `CartTag Variant=descuento-manual` | calcado |
| B.13 (`CartView.tsx:889`) | «+ Agregar descuento» en la línea | `Diálogo «Descuento» — A un producto` (mismo camino, aviso explícito) + líneas sin descuento del carrito | calcado |
| B.13 (`CartView.tsx:891`/`:908`) | chips de descuentos frecuentes del producto | `Diálogo «Descuento» — línea elegida` · fila «Frecuentes:» | calcado + Nuevo (filtro por `discount_source`) |
| B.13 (`promotionEngine`) | descuento de promoción escrito en la línea | `Carrito con descuentos` · línea 3 · `CartTag Variant=descuento-promocion` | Nuevo (hoy se ve igual que un manual) |
| B.13 (nuevo) | descuento repartido desde el general | `Carrito con descuentos` · línea 2 · `CartTag Variant=descuento-general` | Nuevo |
| B.14 (`posService.ts:2734`) | fila «Descuento:» con la suma de las líneas | `Carrito con descuentos` · «Descuento (manual):» | calcado (renombrado para distinguirlo) |
| B.14 (nuevo) | fila «Descuento general» con ✕ para quitarlo entero | `Carrito con descuentos` · fila de totales | Nuevo |
| B.14 (nuevo) | fila «Promociones» | `Carrito con descuentos` · fila de totales | Nuevo |
| B.15 (nuevo) | botón «Descuento · D» en la botonera | `Carrito con descuentos` · Secundarias (4 botones) | Nuevo |
| B.15 (nuevo) | diálogo «Descuento» pestaña «A un producto» | `Diálogo «Descuento» — A un producto` | Nuevo (agrupa el flujo de `updateCartItemDiscount`) |
| B.15 (nuevo) | diálogo «Descuento» pestaña «A toda la venta» + reparto | `Diálogo «Descuento» — A toda la venta` y su estado aplicado | Nuevo |
| B.15 (nuevo) | «Quitar descuento general» | pie del diálogo aplicado y ✕ de la fila de totales | Nuevo |
| B.12 / B.4 (`ProductSearch.tsx:670`) | imagen de la tarjeta del grid en móvil | `Móvil / POS v2 — productos` (modo Tarjeta, imagen 1:1) | sustituido: la franja de 25 px pasa a cuadrada 1:1 |
| B.4 (`ProductSearch.tsx:703`) | badge «Agotado» | `ProductCardMovil State=agotado` (centrado sobre imagen atenuada) | calcado |
| B.4 (`ProductSearch.tsx:743`) | badge «Top» con llama | `ProductCardMovil` (abajo-izquierda sobre la imagen) | calcado |
| B.4 (`ProductSearch.tsx:754`) | estrella de favorito | `ProductCardMovil State=favorito` (arriba-derecha) | calcado |
| B.4 (`ProductSearch.tsx:797`) | precio con `compare_price` tachado y badge de % | `ProductCardMovil` (precio + comparación; «-17 %» arriba-izquierda) | calcado |
| B.4 (`ProductSearch.tsx:100`, `:565`/`:574`) | selector de densidad de la rejilla (`small` / `large`) | `DensidadSelector` con 3 opciones + popover explicativo | sustituido por Tarjeta · Lista · Compacta (Nuevo el modo Lista y el recuerdo de la preferencia) |
| B.4 (nuevo) | modo lista con miniatura 56 px | `Móvil / POS v2 — productos · modo Lista` | Nuevo |
| D.17 (nuevo) | «Límite de descuento sin autorización» (% por rol) | `Configuración › POS — Límite…` (apagado y activo) | Nuevo, opcional, apagado por defecto |
| D.17 (nuevo) | diálogo «Autorización de un supervisor» | `Diálogo «Autorización de un supervisor»` | Nuevo |

Conteo de esta tanda: **calcados 8 · Nuevo 12 · sustituidos 3 · omitidos 0**.

### 7.7 Chequeos y capturas

Chequeo por script al cerrar (`02 Componentes` y `05 POS y ventas`):

- **0 solapes** entre Secciones y **0 solapes** entre frames de primer nivel dentro de cada Sección.
- **0 frames fuera de los límites de su Sección**.
- **0 instancias rotas** (`mainComponent` nulo) en las 8.405 instancias de `05 POS y ventas` y en `02 Componentes`.
- **0 desbordes nuevos**: los cuatro desbordes que reporta el script en el frame del carrito
  (`PosProductSearch` 1074/767, «Fila impuestos incluidos» 562/535, «Tag modificador» 196/190 y el `Select`
  32/28) son **idénticos** a los del frame de origen `Carrito (listo)` de la tanda v2 — se comparó nodo a nodo.
  Los que quedan en los frames móviles son áreas con scroll intencionado (`CategoryBar` horizontal, la rejilla de
  productos) y la elipsis del `OrgSwitcher` del kit.
- El índice de `05 POS y ventas` se actualizó con la Sección 10, «Descuentos».

Capturas (`docs/design/figma/`): `13-descuento-seccion.png`, `13-descuento-carrito.png`,
`13-descuento-dialogo-producto.png`, `13-descuento-dialogo-producto-elegido.png`,
`13-descuento-dialogo-venta.png`, `13-descuento-dialogo-venta-aplicado.png`, `13-descuento-autorizacion.png`,
`13-descuento-badges.png`, `13-descuento-movil-acciones.png`, `13-descuento-movil-sheet-producto.png`,
`13-descuento-movil-sheet-venta.png`, `13-descuento-config-limite.png`, `13-movil-cards-tarjeta.png`,
`13-movil-cards-lista.png`, `13-movil-cards-densidad.png`, `13-movil-cards-componente.png`.

### 7.8 Preguntas abiertas de esta tanda (máximo 5)

1. **Porcentaje o importe en la BD.** `discount_source` distingue el origen, pero el descuento general se guarda
   ya repartido en importes. ¿Hace falta además guardar el porcentaje y el motivo del descuento general a nivel
   de venta (por ejemplo en `sales` / `invoice_sales`) para poder reimprimirlo y auditarlo, o basta con el reparto?
2. **Modo lista como opción o como defecto.** En 390 × 844 el modo lista muestra ≈7 productos frente a 4 del modo
   tarjeta. ¿El defecto en móvil sigue siendo Tarjeta, o Lista para cajas con catálogos grandes?
3. **`ProductCardMovil` como componente aparte.** Se creó separado en vez de añadir variantes a `ProductCard`,
   porque la Sección «Productos y POS» de `02 Componentes` no tenía sitio vertical sin empujar `StockByBranchTable`
   y las demás. ¿Se consolida después dentro de `ProductCard` o se queda como componente móvil propio?
4. **Tope por rol.** ¿Se conserva el ajuste (apagado por defecto) o se descarta? Y si se conserva: ¿el límite es
   por línea y por venta como está dibujado, o basta con uno de los dos?
5. **Nombre de organización en el `MobileHeader` del kit.** Los frames móviles heredan del kit un nombre de
   organización ficticio en la cabecera; el manual de la tanda pide «Mi empresa S.A.S.». ¿Se cambia en el
   componente del kit (afecta a todas las pantallas móviles del archivo) o se deja como está?
