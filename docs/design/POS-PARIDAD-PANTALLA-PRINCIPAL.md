# POS — paridad de la pantalla principal: código ↔ Figma (2026-09-23/24)

Pedido del dueño: «Me gusta mucho la estructura actual del POS en Figma, pero quiero terminar de detallarla antes
de pasar las páginas a código. Revisa toda la interfaz, la base de datos, el backend, las tablas y la lógica, para
que al cambiar la interfaz no perdamos ninguna funcionalidad».

Alcance: `/app/pos` (`src/app/app/pos/page.tsx`) y todo lo que cuelga de ella (catálogo, carrito, cliente, cobro,
post-venta, caja desde el POS, pantalla del cliente, modo sin conexión, carritos múltiples y en espera, deuda,
enviar a cocina, variantes/modificadores/seriales/recetas, escáner, atajos) más `/app/pos/carritos`,
`/app/pos/pagos-pendientes`, `/app/pos/propinas` y `/app/pos/cargos-servicio`. Fuera de alcance (otros agentes):
mesas y reservas; ventas, devoluciones, CxC, cajas, comandas, pedidos online, cupones, promociones y reportes.

Fuentes: código en `main` + árbol de trabajo (solo lectura), BD `jgmgphmzusbluqhuqihj` solo con `SELECT` (conteos,
sin datos personales ni nombres de organizaciones), archivo Figma `EAvjINVRnlzFM70GVoWXgl`, página `05 POS y ventas`
(`264:98913`) y `02 Componentes` (`3:2`). No repite `POS-UX-V2.md`, `AUDITORIA-CONTROLES-PRODUCTOS-POS.md` §B,
`INVENTARIO-PRODUCTOS-Y-POS.md` §1.11, `POS-CARRITO-LINEAS-NOTAS.md` ni `POS-PROMOCIONES-CUPONES-CARGOS-PROPINAS.md`:
los re-verifica contra el código de hoy y añade lo que faltaba.

Abreviaturas de rutas: **P** `src/app/app/pos/page.tsx` · **PS** `src/components/pos/ProductSearch.tsx` ·
**CFB** `CategoryFilterBar.tsx` · **VSD** `VariantSelectorDialog.tsx` · **SSD** `SerialSelectorDialog.tsx` ·
**CT** `CartTabs.tsx` · **CV** `CartView.tsx` · **TS** `TaxSummary.tsx` · **CS** `CustomerSelector.tsx` ·
**CD** `CheckoutDialog.tsx` · **CDI** `display/CustomerDisplayIndicator.tsx` · **PSC** `PendientesSinConexionDialog.tsx`
(todos en `src/components/pos/`) · **SVC** `src/lib/services/posService.ts`. Los números de línea son de hoy;
`posService.ts` lo está editando otra sesión y puede correrse unas decenas de líneas.

Estados de la matriz: **calcado** (existe en código y en Figma con la misma función) · **Nuevo** (en Figma con badge,
no existe en código) · **falta** (existe en código, no en Figma) · **distinto** (en los dos, pero con otra función,
texto o regla) · **sobra** (en Figma sin respaldo en BD/backend: requiere cambio de backend, no se quita sin avisar).

---

## 0. Resumen

| Cifra | Valor |
|---|---|
| Filas de la matriz (§3) | **185** |
| calcado | 103 |
| Nuevo (bien marcado) | 13 |
| **falta** en Figma | **48** (13 graves; 26 de ellas son solo de móvil o tablet) |
| falta en código, no en diseño (B-23, D-08, E-31) | 3 |
| **distinto** | **12** |
| **sobra** (sin respaldo en BD/backend) | **6** |
| otras (nota de backend E-35, «no existe» F-09) | 2 |

C-32 cuenta como distinto (escritorio) y falta (móvil); E-29 como Nuevo y sobra.
| Frames de tablet del POS | **0** (el POS no tiene ninguno; solo Mesas, de otro agente) |
| Frames de `/app/pos/propinas` | **0** |

**Graves** (callejón sin salida, pérdida de función al pasar a código o dato que el diseño promete y la BD no tiene):

1. **Tablet no existe** para el POS (§3.J). A 768 px el código usa la vista móvil (vistas excluyentes + botón
   flotante); a 1024 px usa paneles 75/25 arrastrables. Ningún frame muestra cómo se reparte 1024 × 768 (con 808/560
   no cabe) ni cómo queda el cobro de 1120 × 900 en 768 de alto.
2. **Móvil sin caja**: no hay frame; la barra fija muestra «Cobrar · F4» siempre. En código «Cobrar» se deshabilita
   con «Debe abrir una caja antes de cobrar» (CV:1193-1206) y la apertura solo está en el «⋯» → callejón sin salida
   en el diseño (J-06).
3. **Móvil: carrito en espera y con deuda** no existen: «Reactivar», «Ver Factura», «Imprimir», «Cobrar deuda» y
   «Anular» solo están dibujados en escritorio (C-35…C-41, J-07, J-08).
4. **Móvil: «Elige la sucursal para vender»** (branch = «Todas») solo en escritorio (`158:29703`). En móvil el cajero
   no puede crear carrito y el diseño no le dice por qué (A-07, J-09).
5. **Móvil: cobro** solo dibuja Pagos + Entrega abierta; faltan Propina, Comisión y Factura electrónica abiertas y el
   estado «procesando» (E-40…E-43).
6. **`/app/pos/propinas`** no tiene ni un frame (K-01…K-10). La propuesta de `POS-PROMOCIONES-…md` §6 fila D quedó
   pendiente por cupo en la tanda anterior.
7. **`/app/pos/carritos` y `/app/pos/pagos-pendientes`** devuelven `null` y siguen en el menú
   (`config/moduleConfig.ts:117, 122`): pantalla en blanco (K-20, K-21). Decisión del dueño.
8. **«Caja 1 · 8:02»** en `MobileHeader Mode=pos` y en la sheet «Caja y dispositivo» **sobra**: `cash_sessions` no
   tiene nombre ni terminal (columnas verificadas: `id, organization_id, branch_id, opened_by, opened_at,
   initial_amount, …, uuid, account_code`) y `pos_terminals` tiene 0 filas. El código dice «Caja abierta · {hora}» /
   «Caja cerrada» (`header.posCashOpen`/`posCashClosed`, P:77-83). O se cambia el texto o se añade
   `cash_sessions.pos_terminal_id` (A-03).
9. **Métodos de pago fijos** en el cobro v2 (5 botones «Efectivo · Tarjeta · Transf. · QR · Otro», Alt+1…5):
   en código salen de `organization_payment_methods` (SVC:2086-2117). BD: activos `cash` 72, `card` 72, `transfer`
   72, `wompi` 5, `QR` 1, `001` 1; en facturas de 90 días hay `nequi` 163, `daviplata` 17, `pse` 5. Los botones deben
   ser los N primeros métodos activos de la organización + «Otro» (E-10).
10. **«Generar QR de pago» no funciona en código** (CD envía `connectionId: ''` y las seis rutas lo rechazan con 400,
    además toman la organización del body). El diseño lo dibuja como funcional (`247:72757`, `183:2186…`) → sobra
    hasta arreglar backend (E-16).
11. **Factura electrónica sin configuración**: el interruptor aparece aunque la organización no tenga FE; BD:
    `electronic_invoicing_config` con 0 organizaciones y 8 trabajos en `electronic_invoicing_jobs`. Falta el estado
    «no configurada» (E-30).
12. **Recibo automático marcado «Nuevo» y ya existe**: el cobro encola el ticket físico si hay impresora de caja
    (CD:1194-1262) → el badge «Nuevo» de post-venta sobre «Recibo enviado a …» es incorrecto (F-05).
13. **Pantalla del cliente**: «Emparejar otro dispositivo» y «Revocar pantalla remota» (CDI:280-287,
    `PairingCodeDialog.tsx`, `RevokeRemoteDisplayDialog.tsx`) no están en el menú del indicador del POS
    (`185:48988`, 3 menús de B.1c) (H-06, H-07).

---

## 1. Coherencia de la cabecera móvil (pedido del dueño, prioridad alta) — **corregido en el componente**

Comparación `MobileHeader Mode=page` (`59:2885`) vs `Mode=pos` (`59:2973`), set `48:2550` en `02 Componentes`:

| Aspecto | Mode=page | Mode=pos antes | Mode=pos después |
|---|---|---|---|
| Alto / línea inferior | 56 · borde inferior 1 px `border/default` | igual | igual |
| Relleno izquierdo / derecho · separación | 8 / 12 · 8 | **4 / 8 · 6** | 8 / 12 · 8 |
| «←» | `IconButton Variant=ghost, Size=md` (40 px de área, radio 8) + `Icon/ArrowLeft` 20 px en `text/secondary`, x = 8 | misma instancia del kit, **x = 4** | x = 8 (idéntico) |
| «⋮» | `IconButton ghost Size=md` (40 px, icono 20) en x = 338 | **`Size=sm` (32 px, icono 16) en x = 350** | `Size=md` en x = 338 (idéntico) |
| Hover / pressed | los del set `IconButton` (`9:344…9:379`) | mismo set | mismo set |
| Chip de sucursal | — | `BranchBadge Scope=una, Tono=marca, Size=sm` (igual que las 65 instancias `sm` del archivo) | igual, ancho 177 (rellena) |

Como el cambio se hizo en el componente, se propaga a las 6 instancias `Mode=pos` de `05 POS y ventas`. Capturas:
`docs/design/figma/60-pos-paridad-cabecera-coherencia-antes.png` y `60-pos-paridad-cabecera-coherencia.png`
(root · page · pos lado a lado).

Nota: el `BranchBadge` del kit no tiene el tono fucsia que usa el código para una sucursal concreta
(`components/inventario/BranchBadge.tsx`): el kit decidió `Tono=marca` para «una» y «todas». Se deja así (coherente
en todo el archivo); si el dueño quiere distinguir «Todas» por color, es un cambio del kit, no del POS.

## 2. Selector de vista único (decisión del dueño 2026-09-24)

Detalle y recomendación sobre «por página» en `POS-UX-V2.md` §7.5 («Decisión del dueño 2026-09-24»). Resumen:
componente nuevo `SelectorVistaMenu` (`874:32008`, sección `874:31665`), usado en `PosProductSearch` (5 estados) y en
los móviles `250:81342` y `275:33959`; menú abierto en `874:582518` (móvil) y `874:582587` (escritorio); frame de
densidad `275:34511` eliminado.

**Candidatos a usar el mismo componente** (no se cambiaron): `SelectorVista` (`868:31799`, cuadrícula/plano) y
`SelectorDensidad` (`868:31832`) de «POS — Restaurante (Nuevo)» — mismo patrón con otro componente; `ViewToggle`
(`103:3095`, tabla/cuadrícula) con 18 instancias en `04 Inventario` y 15 en Mesas, Reservas y «Agregar productos a
la mesa» de `05`; `DensidadSelector` (`270:10001`) queda con una sola instancia en `Móvil / Ventas — nueva`
(`334:124281`); `SegmentedControl` se usa como selector de vista en algunas páginas de `06`/`07` (revisar caso a
caso: la mayoría son filtros, no vistas).

---

## 3. Matriz de paridad

Columnas: # · Función · Código · Escritorio · Tablet · Móvil · Estado · Nota. «—» = no aplica. Los nodos sin sección
son de `05 POS y ventas`.

### A. Cabecera, caja y sucursal

| # | Función | Código | Escritorio | Tablet | Móvil | Estado | Nota |
|---|---|---|---|---|---|---|---|
| A-01 | Título «Sistema POS» + organización + «Caja rápida / Venta» | P:620-626 | cabecera v2 (todos) | falta | `MobileHeader Mode=pos` (sin título, decisión) | calcado | |
| A-02 | Chip de sucursal `BranchBadge` (solo lectura) | P:626 | cabecera v2 | falta | Mode=pos | calcado | §1 |
| A-03 | Estado de caja en cabecera móvil «Caja abierta · {hora}» / «Caja cerrada» | P:77-83 (`useCabeceraMovil`) | «Cerrar Caja · F9» | falta | «Caja 1 · 8:02» | **sobra** | «Caja 1» no existe en BD (§0 grave 8) |
| A-04 | «Abrir Caja» (sin sesión) → `AperturaCajaDialog` | P:658 | `184:31793` | falta | sheet `186:7520`; entrada en «⋯» solo con caja abierta (`187:7933`) | **falta** (móvil sin caja) | grave 2 |
| A-05 | «Cerrar Caja» / deshabilitado con tooltip (caja ajena) | P:636-654 | `184:31722`, `184:31864` | falta | sheet «Caja y dispositivo» `187:7933` | calcado | permiso hoy por nombre de rol (P:115-119): cambio de código, no de diseño |
| A-06 | Apertura: alcance sucursal/global/mi caja, monto, notas | `cajas/AperturaCajaDialog.tsx` | `355:141810`, `186:6542`, `355:141811` | falta | `186:7520` | calcado | |
| A-07 | Sin sucursal concreta: no se puede crear carrito («Seleccione una sucursal…») | P:313-330 | `158:29703` | falta | **falta** | **falta** | grave 4 |
| A-08 | Arqueo y cierre (normal, ciego, cargando) | `cajas/CierreCajaDialog.tsx` | `355:141812…14` | falta | `186:7796` | calcado | |
| A-09 | Reloj HH:MM (sin tz de la org en código) | P:181-184, 665-670 | cabecera | falta | sheet «Caja y dispositivo» | calcado | el diseño ya muestra tz |
| A-10 | Contadores «N Activos» / «N En Espera» | P:677-690 | cabecera | falta | sheet | calcado | |
| A-11 | Skeleton de carga inicial | P:578-586 | `185:49120`, `158:28152` | falta | falta | **falta** (móvil) | |
| A-12 | «Organización no encontrada» | P:588-604 | `185:49184` | — | falta | calcado | móvil: mismo EmptyState |
| A-13 | Bloqueo 60 % mientras recarga (cambio de sucursal) | P:607 | `184:31935` | falta | falta | calcado | |
| A-14 | Divisor arrastrable 75/25 guardado en localStorage | P:766-794 | fijo 808/560 | falta | — | **distinto** | pregunta abierta de POS-UX-V2 §6 #1 |
| A-15 | «Seguir comprando» (volver a productos en móvil) | P:711-721 | — | — | cerrar la hoja (sin botón) | **distinto** | añadir «×»/«Seguir comprando» visible en la hoja |
| A-16 | Botón flotante «Carrito · n · $» | P:816-838 | — | — | barra fija «total + Cobrar · F4» | calcado (sustituido) | |
| A-17 | «Sin conexión» + pendientes (Desktop) | PSC:285-301 | `184:31722` | falta | sheet | calcado | |
| A-18 | Toasts de caja (antes invisibles) | P:255-278 | `187:7509` | — | — | calcado | |

### B. Buscador, categorías y tarjetas

| # | Función | Código | Escritorio | Tablet | Móvil | Estado | Nota |
|---|---|---|---|---|---|---|---|
| B-01 | Buscador (nombre, SKU, código, variantes, modificadores), espera 300 ms | PS:198-209, 470-476 | `PosProductSearch` | falta | `250:81342` | calcado | |
| B-02 | Limpiar búsqueda (×) y «Limpiar» filtros | PS:487-523 | `PosProductSearch` | falta | SearchBar | calcado | |
| B-03 | Lector físico USB/BT (ráfaga) | `useHardwareBarcodeScanner.ts` | anotación `198:13916` | — | anotación | calcado | |
| B-04 | Escáner con cámara (hoy simulado) | PS:478-486; `ui/barcode-scanner.tsx:52-60` | `198:13899`, `198:13918` | falta | `198:13946`, `198:13968` | calcado (diseño = real) | cambio de código: lector real |
| B-05 | Código no encontrado / agotado / error | PS:320-374 | toasts `198:14779` | — | — | calcado | |
| B-06 | Variante escaneada con modificadores abre el diálogo del padre | PS:338-363 | — | — | — | **distinto** | código pierde la variante; el diseño debe preseleccionarla |
| B-07 | Categorías: 3 modos (combobox, chips, imágenes), orden configurable | CFB:93-253 | `198:13995` | falta | chips | calcado | |
| B-08 | Estrella de categoría favorita (`category_favorites`) | CFB:134-144, 236-249 | `CategoryBar` | falta | chips | calcado | |
| B-09 | «Top» de categoría | CFB:223-229 | `CategoryBar` | falta | chips | calcado | |
| B-10 | Selector de vista (hoy Compacta/Amplia sin persistir) | PS:576-593 | `SelectorVistaMenu` en `PosProductSearch` | falta | `SelectorVistaMenu` | Nuevo (2026-09-24) | §2 |
| B-11 | «Mostrar N ▲▼» por página | PS:525-573 | retirado | — | — | **distinto** | recomendación: scroll infinito (POS-UX-V2 §7.5) |
| B-12 | Contador «{total} prod.» (≥ md) | PS:596-598 | pie del grid | falta | retirado (paridad) | calcado | |
| B-13 | Tarjeta: imagen, categoría, «Agotado», «-%», «N var.», «Personalizable», «Top», estrella | PS:684-786 | `ProductCard pos` | falta | `ProductCardMovil` | calcado | |
| B-14 | Precio + comparación tachada; **precio 0/nulo = sin precio y se agrega a $0** | PS:805-822; SVC:495 | — | — | — | **falta** | estado «Sin precio» en la tarjeta (BD: 2 ventas POS de 90 días con línea a $0) |
| B-15 | Stock visible por color | — | grid v2 | — | tarjeta | Nuevo | hoy solo «Agotado» |
| B-16 | Receta (ChefHat) de solo lectura | PS:828-838, 972-1079 | `198:14255` | — | falta | **falta** (móvil) | sheet |
| B-17 | Favorito de producto (`product_favorites`) + toasts | PS:767-786, 404-456 | `ProductCard` | falta | `ProductCardMovil` | calcado | |
| B-18 | Paginación «Mostrando a–b de N» | PS:872-947 | `Pagination` del kit | falta | scroll infinito | **distinto** | pendiente decisión §2 |
| B-19 | Cargando (12 skeleton) / error «Reintentar» / vacío «Limpiar filtros» | PS:606-661 | `PosProductSearch` loading/error/empty, `184:32077` | falta | falta | **falta** (móvil) | |
| B-20 | Sin catálogo local (Desktop offline) | PS:142-151; `LocalCatalogNotice.tsx` | `158:28687`, `187:7419` | — | sheet | calcado | |
| B-21 | Diálogo de variantes: atributos, combinaciones inválidas, «Sin precio» | VSD:272-334 | `158:27344`, `198:14715` | falta | `159:31608` | calcado | |
| B-22 | Modificadores: «Elige 1 / Hasta N», obligatorios, validación | VSD:337-390, 132-183 | `198:14706` | — | `159:31608` | calcado | |
| B-23 | Stock por variante | — | — | — | — | falta en código y diseño | anotar en diseño si se quiere (Nuevo) |
| B-24 | Cantidad rápida «3*» | — | grid v2 | — | `250:81342` | Nuevo | |
| B-25 | Foco de teclado ↑↓ Enter | — | `249:80171` | — | — | Nuevo | |

### C. Carrito (líneas, totales, acciones)

| # | Función | Código | Escritorio | Tablet | Móvil | Estado | Nota |
|---|---|---|---|---|---|---|---|
| C-01 | Pestañas de carritos (nombre/cliente 8 chars, total, líneas) | CT:167-242 | `CartTabs` v2 | falta | hoja `250:81432` | calcado | CT:224 moneda cableada `COP` (código) |
| C-02 | Crear carrito «+» (sin límite) | CT:277-285 | «+ · Ctrl+N» | falta | «+» | calcado | |
| C-03 | Cerrar carrito (X, solo con >1) + confirmación | CT:246-268, 347-372 | `190:10788` | — | `190:11343` | calcado | |
| C-04 | Resumen del carrito activo (items, cliente, en espera, hora) | CT:289-321 | cabecera del carrito | falta | falta | calcado (compacto) | |
| C-05 | Sin carritos «Crear Carrito» | CT:323-344 | frame de fidelidad (99) | — | falta | calcado | |
| C-06 | Línea: miniatura, nombre, variante, modificadores, SKU, unitario | CV:721-836 | `CartLine` | falta | `CartLine mobile` | calcado | |
| C-07 | Estado de cocina de la línea (del ticket entero) | CV:744-758 | `CartTag` | falta | tag | calcado | N10 |
| C-08 | Nota de línea (Enter/Esc; hoy no persiste) | CV:783-826 | `852:93391` (otro agente) | — | falta | calcado / pendiente | N1 |
| C-09 | «Sin impuesto (excluido)» / «+$X impuestos» / «inc. $X» | CV:839-849 | bloque de importe | falta | sí | calcado | |
| C-10 | Descuento por línea (valor, chips frecuentes, tope) | CV:852-942 | `Carrito (recién agregada)`, `Descuentos` | falta | sheet `290:35435` | calcado | |
| C-11 | «−» a 0 elimina sin confirmar | CV:963-971 | `190:10989` (confirm, Nuevo) | — | — | Nuevo | |
| C-12 | Cantidad entera (sin decimales/peso) | CV:973-985 | `CartLine` | falta | sí | calcado | peso: no existe |
| C-13 | Casilla «Incluido» (C2) | CV:1010-1026 | renglón 2 | falta | sí | calcado | ver POS-CARRITO-LINEAS-NOTAS §7 |
| C-14 | «Excluir impuesto» (C1, hoy no persiste) | CV:1028-1043 | acción T | falta | sí | calcado | semántica distinta a C3; conservar |
| C-15 | Eliminar línea sin confirmar | CV:1062-1072 | acción Supr | falta | sí | calcado | |
| C-16 | Interruptor «Impuestos incluidos» (C3, copia a todas) | TS:326-340 | Resumen | falta | Resumen | calcado | |
| C-17 | «Impuestos disponibles» (solo sin impuesto por producto) | TS:367-438 | Resumen | falta | Resumen | calcado | no entra en `cart.total` (código) |
| C-18 | Engranaje del Resumen sin acción | TS:317-323 | retirado | — | — | calcado (omitido con motivo) | |
| C-19 | Subtotal, impuestos por nombre, total impuestos, descuento, total | TS:352-504 | Resumen | falta | Resumen | calcado | |
| C-20 | «No hay impuestos configurados…» | TS:507-511 | `Carrito (vacío)` | — | falta | calcado | |
| C-21 | Aviso «Sin impuesto asignado» por línea | CV:158-167, 739-741 | — | — | — | **falta** | tag en `CartLine` |
| C-22 | Carrito vacío | CV:698-703 | `244:67706` | falta | falta | **falta** (móvil) | hoja vacía con «/» → buscador |
| C-23 | «Espera» + diálogo motivo | CV:1152-1161, 1216-1257 | `190:10835` | — | `190:11388` | calcado | |
| C-24 | «Reactivar» | CV:668-678 | `244:65395` | falta | **falta** | **falta** (móvil) | grave 3 |
| C-25 | «Deuda» (requiere cliente) + diálogo | CV:1163-1173, 1260-1369 | `190:10875` | — | `190:11471` | calcado | |
| C-26 | Badge «Deuda» + «Deuda registrada - Ver en CxC» | CV:645-650, 680-686 | `244:66158` | falta | **falta** | **falta** (móvil) | grave 3 |
| C-27 | «Ver Factura» → Detalle de factura | CV:1100-1113, 1372-1397 | `244:66158`, `190:11018` | — | **falta** | **falta** (móvil) | |
| C-28 | «Imprimir» factura de la deuda | CV:1115-1123 | `244:66158` | — | **falta** | **falta** (móvil) | |
| C-29 | «Cobrar» deuda (no exige caja) | CV:1127-1135 | `244:66158` | — | **falta** | **falta** (móvil) | |
| C-30 | «Anular» deuda (nota crédito) | CV:1137-1145 | `244:66158` + `190:10960` | — | **falta** | **falta** (móvil) | |
| C-31 | «Enviar Cocina» (si alguna línea requiere preparación) | CV:1176-1191; P:439-565 | «Cocina · F8» | falta | «Cocina» | calcado | toasts dobles (código) |
| C-32 | «Cobrar» deshabilitado sin caja + «Debe abrir una caja…» | CV:1193-1206 | `244:64655` «Abrir caja para cobrar · F9» | falta | **falta** | distinto (esc.) / **falta** (móvil) | grave 2 |
| C-33 | Botón «Descuento · D» | — | `283:34398` | — | menú `290:35370` | Nuevo | la hoja `250:81432` sigue con 3 botones → alinear |
| C-34 | Descuento general / promoción separados | — | `Descuentos` | — | sheets | Nuevo | migración `discount_source` pendiente |
| C-35 | Promoción aplicada (hoy «−$X» igual que manual) | SVC:1679-1714 | `CartTag descuento-promocion` | — | sí | Nuevo | |
| C-36 | Cargo de servicio en el carrito | — | `504:86567` | — | — | **sobra** | ni carrito ni cobro leen `service_charges` (45 filas) |
| C-37 | Alergia / nota del pedido | — | `852:93388` (otro agente) | — | — | Nuevo | |

### D. Cliente

| # | Función | Código | Escritorio | Tablet | Móvil | Estado | Nota |
|---|---|---|---|---|---|---|---|
| D-01 | «Seleccionar cliente» (popover ≥640 / diálogo ≤640) | CS:507-572 | fila «Seleccionar cliente · F2» | falta | hoja | calcado | |
| D-02 | Buscar (nombre, email, teléfono, documento) | CS:63-212 | `06 Clientes › CustomerPicker` | falta | sí | calcado | |
| D-03 | «Espacios ocupados» (PMS, huésped en `checked_in`) | CS:81-108, 312-350 | CustomerPicker | — | — | **distinto** | el código ignora `room` (P:374): elegir la habitación no carga a la habitación |
| D-04 | Empresas con contacto | CS:159-168 | CustomerPicker | — | — | calcado | |
| D-05 | «Crear nuevo cliente» (formulario completo / offline) | CS:426-437, 578-589 | CustomerPicker + `187:7225` | — | `187:8463` | calcado | |
| D-06 | Tarjeta del cliente + «Pendiente de sincronizar» | CS:444-502 | fila compacta | falta | fila | calcado | |
| D-07 | Quitar cliente | CS:491-499 | X | falta | X | calcado | |
| D-08 | Saldo CxC / límite de crédito | — | — | — | — | falta en código | pregunta §6 |
| D-09 | Cliente obligatorio (solo «Deuda») | CV:1167 | «Deuda» deshabilitado | — | sí | calcado | FE no exige cliente (E-31) |
| D-10 | Sin resultados / sin clientes | CS:299-308 | CustomerPicker | — | — | calcado | |

### E. Cobro

| # | Función | Código | Escritorio | Tablet | Móvil | Estado | Nota |
|---|---|---|---|---|---|---|---|
| E-01 | Validar caja al abrir (`pos_require_cash_session`, default true) | CD:390-408 | toast | — | — | calcado | el botón del carrito ignora la config (código) |
| E-02 | Cabecera «Procesar Pago · n productos · Total: {cart.total}» | CD:1824-1837 | cobro v2 | falta | `250:81853` | calcado | dos totales distintos (código) |
| E-03 | Resumen de venta colapsable | CD:1849-1907 | zona izquierda | falta | «ver detalle» | calcado | |
| E-04 | Totales: subtotal base, impuestos, propina, flete, total, pagado, falta, cambio | CD:1910-1965 | zona izquierda | falta | cabecera | calcado | |
| E-05 | Aviso de líneas sin impuesto («se cobrará») | CD:248-260, 1844 | — | — | — | **falta** | |
| E-06 | Pago mixto «Agregar» / «Pago n» / «Eliminar» | CD:2190-2219 | `247:69830` | falta | `250:82123` | calcado | BD: 15 facturas POS con pago mixto en 90 días |
| E-07 | Monto; «Exacto» y billetes rápidos (solo efectivo) | CD:2244-2280 | «Exacto · Alt+E» + chips | falta | sí | calcado | código: sobre total, no sobre lo que falta |
| E-08 | Cambio | CD:1958-1963 | «Cambio» | falta | sí | calcado | |
| E-09 | «Falta dinero» / «Completar venta» / «Procesando…» | CD:2537-2560 | `247:70286`, `247:72304` | falta | `250:82411`; procesando **falta** | **falta** (móvil) | |
| E-10 | Método de pago desde `organization_payment_methods` | SVC:2086-2117; CD:2223-2242 | 5 botones fijos | falta | 5 botones | **distinto** | grave 9 |
| E-11 | «Impuestos incluidos en precios» (C4, local al cobro) | CD:2309-2322 | pie de Pagos | falta | sí | calcado | |
| E-12 | Entrega: Recoger / Envío propio / Tercero | CD:1978-2004 | `247:70719` | falta | `250:82681` | calcado | |
| E-13 | Conductor, dirección con búsqueda, ciudad, teléfono, contacto, instrucciones | CD:2010-2118 | `247:70719` | falta | `250:82681` | calcado | |
| E-14 | Tarifa de envío (`shipping_rates`, `show_on_pos`) | CD:2119-2138 | `247:70719` | falta | sí | calcado | |
| E-15 | Pago del envío Pagado/Pendiente (el flete se cobra igual) | CD:2141-2173 | `247:70719` | falta | sí | **distinto** | el diseño debe decir que «Pendiente» sigue sumando al total (o cambiar código) |
| E-16 | «Generar QR de pago» (4 códigos) + diálogo QR (4 estados) | CD:2283-2304, 748-876; `shared/QrPaymentDialog.tsx` | `247:72757`, `183:2186…2493` | falta | `183:3257` | **sobra** | grave 10 |
| E-17 | Link de pago Bold (no registra pago) | CD:839-847 | toast | — | — | calcado | rama inalcanzable en código |
| E-18 | «Mostrar en pantalla del cliente» (QR) | CD:2575-2588 | QR | — | — | calcado | |
| E-19 | Propina 5/10/15/20 % fijos + monto + mesero | CD:2354-2410 | `247:71297` | falta | **falta** | **falta** (móvil) | grave 5; % de la pantalla del cliente salen de `organization_settings` |
| E-20 | Propina elegida en la pantalla del cliente (5 estados) | `display/TipFromDisplayNotice.tsx` | `181:3011` | — | falta | calcado | |
| E-21 | Mesero = todos los miembros (sin filtro de cargo) | CD:2393-2410 | select | — | — | calcado | BD: 8/8 propinas con `server_id` = cajero |
| E-22 | Comisión: vendedor, % / monto, tasa desde `vendor_commission_rates` | CD:2426-2510 | `247:71816` | falta | **falta** | **falta** (móvil) | BD: 3 ventas de 90 días con vendedor |
| E-23 | Factura electrónica (interruptor, «Global») | CD:2518-2532 | acordeón FE | falta | resumen; abierto **falta** | **falta** (móvil) | |
| E-24 | Seriales al cobrar | CD:1060-1063; SSD | `247:73392` | falta | `183:3474` | calcado | |
| E-25 | Stock insuficiente de ingredientes (confirmar) | CD:2649-2687 | `183:2712` | — | falta | **falta** (móvil) | |
| E-26 | Toasts de offline, impresión y DIAN | CD:1174-1470 | `183:2858` | — | — | calcado | |
| E-27 | Error general (hoy `alert()`) | CD:1474-1480 | toast error | — | — | calcado (sustituido) | |
| E-28 | Cancelar (X / «Cancelar · Esc») | CD:1830-1837, 2537-2545 | pie | falta | pie | calcado | Esc no funciona hoy (código) |
| E-29 | Cupón en el cobro | — | `458:83918` (otro agente) | — | — | Nuevo / **sobra** | sin redención en `pos_checkout_v1` |
| E-30 | FE sin configuración en la organización | — | — | — | — | **falta** | grave 11 |
| E-31 | Cliente obligatorio con FE | — | — | — | — | falta en código | pregunta §6 |
| E-32 | Cargo de servicio en el cobro | — | `505:86668`, `460:236603` | — | — | **sobra** | sin columna ni tabla en la venta |
| E-33 | Propina como `tips` (efectivo/tarjeta) al cobrar | RPC `pos_checkout_v1` | — | — | — | calcado (dato) | |
| E-34 | Abono parcial de una deuda | SVC:1863-2021 (soporta) / CD `canComplete` (lo impide) | — | — | — | **distinto** | decidir: permitir abono parcial desde el cobro |
| E-35 | Doble clic = dos ventas en navegador | CD:2548; SVC:1830 | — | — | — | nota backend | `saleId` antes del primer clic |

### F. Post-venta

| # | Función | Código | Escritorio | Tablet | Móvil | Estado | Nota |
|---|---|---|---|---|---|---|---|
| F-01 | «¡Venta Completada!» + «Venta #{8} procesada» | CD:1687-1706 | `247:74846` | falta | `250:83088` | calcado | el número FACT no se muestra (código: la RPC lo devuelve y no se usa) |
| F-02 | «Pendiente de sincronizar · OFF-…» | CD:1707-1714 | `247:75030` | — | falta | calcado | |
| F-03 | Total / Pagado / Cambio | CD:1716-1737 | sí | falta | sí | calcado | |
| F-04 | «Re-imprimir Recibo» (usa sucursal principal) | CD:1740-1746 | «· P» | falta | sí | calcado | bug de sucursal (código) |
| F-05 | Ticket físico automático («Recibo enviado a …») | CD:1194-1262 | badge «Nuevo» | falta | badge «Nuevo» | **distinto** | ya existe: quitar «Nuevo» (grave 12); falta el estado «sin impresora de caja» |
| F-06 | «Factura Electrónica» (solo con CUFE) | CD:1747-1804 | «· F» | falta | sí | calcado | |
| F-07 | «Cerrar» (única vía a nueva venta) | CD:1805-1811 | «Cerrar · Esc» | falta | sí | calcado | |
| F-08 | «Nueva venta · Enter» | — | sí | — | sí | Nuevo | |
| F-09 | Enviar por WhatsApp / correo | — | — | — | — | no existe | |
| F-10 | Apertura de cajón automática con efectivo | CD:1265-1270; `cashDrawerService.ts` | — | — | — | **falta** | anotar en post-venta (sin UI propia) |

### G. Sin conexión (solo Go Admin Desktop)

| # | Función | Código | Escritorio | Tablet | Móvil | Estado | Nota |
|---|---|---|---|---|---|---|---|
| G-01 | Aviso de catálogo local (5 estados) | `LocalCatalogNotice.tsx` | `187:7419` | — | sheet | calcado | |
| G-02 | Pendientes de sincronizar (lista, reintentar, exportar) | PSC | `187:6906`, `187:7186` | — | `187:8362` | calcado | |
| G-03 | Cliente sin conexión | `OfflineCustomerDialog.tsx` | `187:7225`, `187:7322` | — | `187:8463` | calcado | |
| G-04 | Venta offline guardada «OFF-…» | CD:1174 | `247:75030` | — | falta | calcado | |
| G-05 | Favoritos encolados sin red | `utils/offlineCache.ts:156-169` | — | — | — | calcado (sin UI) | |
| G-06 | Otras escrituras sin red: «esta acción requiere internet» (503) | `offlineCache.ts` | — | — | — | **falta** | toast genérico |
| G-07 | Deuda sin red: bloqueada | SVC (checkout offline) | — | — | — | **falta** | estado deshabilitado de «Deuda»/«Cobrar deuda» sin red |

### H. Pantalla del cliente

| # | Función | Código | Escritorio | Tablet | Móvil | Estado | Nota |
|---|---|---|---|---|---|---|---|
| H-01 | Indicador: conectada / desactivada / sin señal / sin pantalla | CDI:132, 173-241 | `185:48988` | falta | sheet | calcado | |
| H-02 | Origen «(en este equipo / remota / ambas)» | CDI:219-241 | — | — | — | **falta** | texto del indicador |
| H-03 | Activar y abrir / Abrir / Cerrar | CDI:260-273 | `185:48988` | — | sheet | calcado | |
| H-04 | Toasts (arrastrar + F11, ventana bloqueada, activada) | `messages/es.json` `posCustomerDisplay.*` | `187:7509` | — | — | calcado | |
| H-05 | «Pantalla remota no disponible…» | CDI:275-279 | — | — | — | **falta** | |
| H-06 | «Emparejar otro dispositivo» (código de 6 dígitos) | CDI:280-283; `PairingCodeDialog.tsx` | — (existe en Configuración `201:41086`) | — | — | **falta** | grave 13 |
| H-07 | «Revocar pantalla remota» + confirmación | CDI:284-287; `RevokeRemoteDisplayDialog.tsx` | — | — | — | **falta** | grave 13 |
| H-08 | La pantalla muestra carrito, totales, pago, propina y «Gracias» | P:149-178; CV:171-189; CD:1185 | anotaciones | — | — | calcado | |

### I. Atajos de teclado

| # | Función | Código | Escritorio | Tablet | Móvil | Estado | Nota |
|---|---|---|---|---|---|---|---|
| I-01 | Mapa F1 y todos los `Kbd` (F2 F4 F6-F10, Ctrl+N, Alt+1…5…) | — (0 `keydown` en el POS) | `250:81064` | — | `250:83167` | Nuevo | |
| I-02 | Enter/Esc en nota y descuento | CV:799-801, 870-875 | mapa | — | — | calcado | |
| I-03 | Enter/Espacio en la X de la pestaña | CT:259-264 | — | — | — | calcado | |
| I-04 | Escape cierra diálogos Radix (no el cobro ni la caja) | — | «Esc» en el cobro | — | — | **distinto** | el cobro y la caja son portales propios sin Esc |

### J. Responsive y estados de flujo (móvil / tablet)

| # | Función | Código | Escritorio | Tablet | Móvil | Estado | Nota |
|---|---|---|---|---|---|---|---|
| J-01 | ≥ 1024: productos + carrito lado a lado | P:766-794 | frames 1440 | **falta 1024 × 768** | — | **falta** | grave 1 |
| J-02 | < 1024: vistas excluyentes (incluye tablet vertical 768) | P:797-838 | — | **falta 768 × 1024** | frames 390 | **falta** | grave 1 |
| J-03 | Cobro en 768 de alto (acordeones + pie fijo, scroll) | CD | — | **falta** | sheet | **falta** | |
| J-04 | Móvil: productos → hoja de carrito → cobro → post-venta | — | — | — | `250:81342` → `250:81432` → `250:81853` → `250:83088` | calcado | |
| J-05 | Móvil: «⋯» → «Caja y dispositivo» | — | — | — | `187:7933` | calcado | |
| J-06 | Móvil sin caja: barra fija «Abrir caja para cobrar · F9» y sheet sin caja | CV:1193-1206 | `244:64655` | — | **falta** | **falta** | grave 2 |
| J-07 | Móvil carrito en espera | CV:640-678 | `244:65395` | — | **falta** | **falta** | grave 3 |
| J-08 | Móvil carrito con deuda | CV:645-686, 1100-1145 | `244:66158` | — | **falta** | **falta** | grave 3 |
| J-09 | Móvil «Elige la sucursal para vender» | P:313-330 | `158:29703` | — | **falta** | **falta** | grave 4 |
| J-10 | Móvil: menú de vista abierto | — | `874:582587` | — | `874:582518` | Nuevo | orden de capas pendiente (§5) |

### K. Páginas satélite

| # | Función | Código | Escritorio | Tablet | Móvil | Estado | Nota |
|---|---|---|---|---|---|---|---|
| K-01 | Propinas: cabecera «Gestión de Propinas» + «Distribuir (n)» + «Nueva Propina» | `propinas/TipsHeader.tsx:83-114` | **falta** | — | **falta** | **falta** | grave 6 |
| K-02 | Propinas: 4 KPI del día (ignoran filtros) | TipsHeader.tsx:127-169 | **falta** | — | **falta** | **falta** | |
| K-03 | Propinas: filtros mesero, estado, tipo, desde, hasta, recargar | TipsHeader.tsx:189-246 | **falta** | — | **falta** | **falta** | «Transferencia» y «Online» fallan contra el `CHECK` de `tips` |
| K-04 | Propinas: tabla con selección de pendientes | TipsList.tsx:173-203 | **falta** | — | **falta** | **falta** | |
| K-05 | Propinas: menú ⋯ Editar / Marcar distribuida / Eliminar | TipsList.tsx:249-274 | **falta** | — | **falta** | **falta** | |
| K-06 | Propinas: resumen por mesero | ServerSummary.tsx | **falta** | — | **falta** | **falta** | |
| K-07 | Propinas: diálogo Nueva/Editar (mesero, monto, tipo, notas) | TipForm.tsx:133-270 | **falta** | — | **falta** | **falta** | |
| K-08 | Propinas: confirmar eliminar | TipsList.tsx:284-300 | **falta** | — | **falta** | **falta** | |
| K-09 | Propinas: vacío / cargando / error | PropinasContent.tsx | **falta** | — | **falta** | **falta** | |
| K-10 | Propinas: también embebido en Configuración › POS | `configuracion/ConfigModals.tsx` | `199:73152` (solo tarjeta) | — | — | calcado | |
| K-11 | Cargos: cabecera + «Importar» + «Nuevo Cargo» | ChargesHeader.tsx:122-145 | `460:235205` | — | `460:236384` | calcado | |
| K-12 | Cargos: 3 KPI | ChargesHeader.tsx:158-186 | `460:235205` | — | sí | calcado | |
| K-13 | Cargos: filtros estado, sucursal (escribe el contexto global), aplica a | ChargesHeader.tsx:206-246 | `460:235205` | — | sí | calcado | |
| K-14 | Cargos: switch activo, badges, menú Editar/Duplicar/Eliminar | ChargesList.tsx:163-300 | `460:235205`, `460:236506` | — | sí | calcado | |
| K-15 | Cargos: formulario (nombre, tipo, valor, mínimos, aplica a, sucursal, gravado, opcional) | ChargeForm.tsx:150-367 | `460:236065` | — | falta | calcado | «Monto fijo» falla: código `fixed` vs `CHECK` `fixed_amount` |
| K-16 | Cargos: importar CSV | ChargesHeader.tsx:255-300 | `460:236168` | — | — | calcado | |
| K-17 | Cargos: vacío | ChargesList.tsx | `460:235758` | — | — | calcado | |
| K-18 | Cargos: cargando / error | — | **falta** | — | **falta** | **falta** | |
| K-19 | Cargos: impuesto explícito, ticket y factura con el cargo | — | `489:86550`, `489:86603`, `489:86705` | — | — | **sobra** | backend: `sale_service_charges`, `service_charges.tax_id` |
| K-20 | `/app/pos/carritos` | `app/app/pos/carritos/page.tsx` (null) | — | — | — | **falta** | grave 7 |
| K-21 | `/app/pos/pagos-pendientes` | `app/app/pos/pagos-pendientes/page.tsx` (null) | — | — | — | **falta** | grave 7 |

Conteo (por script sobre este archivo): 185 filas — A 18 · B 25 · C 37 · D 10 · E 35 · F 10 · G 7 · H 8 · I 4 ·
J 10 · K 21.

---

## 4. Revisión de la lógica de las pantallas de Figma

| # | Hallazgo en el flujo de Figma | Dónde | Propuesta |
|---|---|---|---|
| L1 | Móvil sin caja: la barra fija ofrece «Cobrar · F4» sin decir que falta la caja; la apertura solo vive en el «⋯» y el sheet solo está dibujado con caja abierta | `250:81342`, `187:7933` | barra fija `CobrarButton State=sin-caja` «Abrir caja para cobrar» y sheet «Caja y dispositivo» con «Abrir Caja · F9» |
| L2 | Hoja de carrito sin salida explícita (solo el tirador) | `250:81432` | «×» o «Seguir comprando» en la cabecera de la hoja (paridad con `P:711-721`) |
| L3 | Hoja de carrito con 3 botones; la sección Descuentos definió 4 en un menú | `250:81432` vs `290:35370` | alinear la hoja con el menú de acciones |
| L4 | Móvil no tiene estados en espera / con deuda / vacío: el cajero que pone un carrito en espera en el teléfono no ve cómo reactivarlo | Móvil v2 | frames J-07, J-08, C-22 |
| L5 | Cobro móvil: los acordeones Propina, Comisión y FE solo se ven cerrados | `250:81853` | frames abiertos (E-19, E-22, E-23) |
| L6 | Post-venta: «Recibo enviado a Impresora caja 1» con «Nuevo» — ya existe; falta el caso «sin impresora de caja» (toast del código) | `247:74846`, `250:83088` | quitar badge; añadir variante sin impresora |
| L7 | Menú de vista abierto queda debajo del grid y la barra de categorías | `874:582518`, `874:582587` | instancia `Estado=abierto` como hija absoluta al final del frame (§5) |
| L8 | Métodos de pago fijos: una organización sin «QR» vería un botón que no puede usar | cobro v2 | botones = métodos activos de la organización (máx. 4) + «Otro» |
| L9 | El cobro dice «Total: $ 489.800» arriba y «Total a pagar $ 546.780» en grande | `250:81853`, `247:69354` | es fiel al código (propina + flete), pero confunde: la cabecera debería decir «Productos: $ 489.800» |
| L10 | `__probe__` (40 × 40) suelto en (0, 0) de la página 05, fuera de sección | `473:85578` | no es de esta tanda; lo dejó otra sesión — borrar |

## 5. Qué se hizo en Figma en esta tanda

| Cambio | Nodo |
|---|---|
| `MobileHeader Mode=pos`: rellenos 8/12, separación 8, «⋮» `Size=md` (se propaga) | `59:2973` |
| Sección nueva «POS — Selector de vista (Nuevo 2026-09-24)» en `02 Componentes` (x 64000, y 110000) | `874:31665` |
| Componente `SelectorVistaMenu` (10 variantes) | set `874:32008`; cerrado `874:31666`, `:31677`, `:31690`, `:31702`, `:31713`; abierto `874:31726`, `:31787`, `:31850`, `:31912`, `:31959` |
| `PosProductSearch` (5 estados): fuera `ViewToggle` y «24 por página»; dentro `SelectorVistaMenu` | `155:7745` |
| Móvil Tarjetas y Lista: botón `SelectorVistaMenu`, sin fila de densidad ni conteo | `250:81342`, `275:33959` |
| Frame de densidad eliminado | `275:34511` (borrado) |
| Móvil — menú de vista abierto (Nuevo) | `874:582518` |
| Escritorio — menú de vista abierto (Nuevo) | `874:582587` |
| Anotaciones | `874:582586`, `874:583302`, `250:83325`, `275:34555` |

**Pendiente por cupo** (el MCP de Figma llegó al límite de llamadas del plan tras la captura del componente):

1. Orden de capas del menú abierto (L7) en `874:582518` y `874:582587`.
2. Revisar el `IconButton` que quedó a la derecha en `PosProductSearch` (`155:6642`): si es otro control de vista,
   quitarlo.
3. Tablet: `Tablet 1024 / POS — carrito listo` (productos 2 columnas + carrito 400), `Tablet 1024 / POS — cobro`
   (acordeones + pie fijo en 768), `Tablet 768 / POS — productos` (grid 3 columnas + barra fija) y
   `Tablet 768 / POS — hoja de carrito` (J-01…J-03).
4. Móvil: sin caja (L1, J-06), en espera (J-07), con deuda (J-08), vacío (C-22), elige sucursal (J-09), cobro con
   Propina / Comisión / FE abiertas y procesando (E-09, E-19, E-22, E-23), stock insuficiente (E-25), cargando y
   error del catálogo (B-19).
5. Menú del indicador de pantalla con «Emparejar otro dispositivo» y «Revocar pantalla remota» (H-06, H-07) y el
   origen de la señal (H-02).
6. `/app/pos/propinas` completo (K-01…K-09) en escritorio y móvil, con la propuesta de `POS-PROMOCIONES-…md` §5.
7. Estado «FE no configurada» en el acordeón (E-30); tarjeta «Sin precio» (B-14); tag «Sin impuesto asignado» en
   `CartLine` (C-21); aviso de líneas sin impuesto en el cobro (E-05).
8. Quitar el badge «Nuevo» del recibo automático y añadir la variante «sin impresora de caja» (F-05).
9. Texto de la cabecera móvil: «Caja 1 · 8:02» → «Caja abierta · 8:02» (A-03), salvo que el dueño apruebe el
   cambio de backend.
10. Chequeo por script de la página 05 y 02 (0 solapes, 0 nodos fuera de sección, 0 instancias rotas, 0 textos
    truncados) y captura `60-pos-paridad-movil-lista-despues.png`: no se pudieron correr después de los cambios.
    Evidencia parcial: el script de creación devolvió las filas del buscador con anchos 898 + 40 + 40 (escritorio)
    y 310 + 40 (móvil) sin desbordes, y las capturas tomadas no muestran instancias rotas.

## 6. Cambios de backend necesarios (no aplicados)

Todos aditivos, por el MCP, con `.sql` en `supabase/migrations/` y reversión en `supabase/rollbacks/`.

| # | Cambio | Por qué (fila) |
|---|---|---|
| BE1 | `cash_sessions.pos_terminal_id uuid NULL` → `pos_terminals(id)` (o renunciar a «Caja 1») | A-03 |
| BE2 | QR del POS: resolver `connectionId` en el servidor y tomar la organización de la sesión (`withOrg`) en las 6 rutas `create-qr`/`bold/*` | E-16 (regla dura 5) |
| BE3 | Idempotencia del cobro: `sale_id` generado al abrir el diálogo y reutilizado en reintentos | E-35 |
| BE4 | Deuda por RPC transaccional (hoy inserts sueltos en `sales`, `invoice_sales`, `invoice_items`, `sale_items`) + límite de crédito del cliente | C-25, D-08 (regla dura 7) |
| BE5 | Cargo de servicio en la venta: `sale_service_charges` + `service_charges.tax_id`; alinear `fixed` → `fixed_amount` | C-36, E-32, K-15, K-19 |
| BE6 | Cupón en `pos_checkout_v1` (redención en `coupon_redemptions`) | E-29 |
| BE7 | `tips.tip_type`: ampliar `CHECK` a `transfer`/`qr` o quitar las opciones de la interfaz | K-03 |
| BE8 | `organization_payment_methods`: exponer orden/favoritos para los botones rápidos del cobro | E-10 |
| BE9 | Persistir el carrito de React (nota, `tax_excluded`, `kitchen_ticket_id`) y no borrar los `hold_with_debt` del almacenamiento | C-08, C-14, J-08 |
| BE10 | Publicar `cash_sessions` en Realtime (la suscripción de P:215-240 no hace nada) | A-05 |

## 7. Preguntas para el dueño

1. **Tablet**: ¿en 1024 × 768 prefieres productos + carrito lado a lado (carrito 400 px, grid de 2) o la vista móvil
   con hoja? Hoy el código hace lado a lado desde 1024.
2. **`/app/pos/carritos` y `/app/pos/pagos-pendientes`**: ¿se retiran del menú (hoy pantalla en blanco) o se diseñan
   como «Carritos en espera y con deuda» y «Pagos QR/link pendientes»?
3. **«Caja 1»**: ¿las cajas tienen nombre (terminal) o basta «Caja abierta · 8:02»?
4. **«Por página»**: ¿scroll infinito en todo el POS (recomendado) o la sección «Por página» dentro del menú de vista?
5. **Abono parcial de deuda** desde el cobro (el servicio lo soporta, la pantalla lo impide): ¿se permite?

## 8. Capturas (`docs/design/figma/`)

`60-pos-paridad-cabecera-coherencia-antes.png`, `60-pos-paridad-cabecera-coherencia.png`,
`60-pos-paridad-vista-componente.png`, `60-pos-paridad-vista-escritorio-antes.png` (copia de
`11-pos-v2-carrito-listo.png`), `60-pos-paridad-vista-escritorio-menu-abierto.png`,
`60-pos-paridad-vista-movil-antes-tarjeta.png`, `60-pos-paridad-vista-movil-antes-lista.png`,
`60-pos-paridad-vista-movil-antes-densidad.png`, `60-pos-paridad-vista-movil-tarjetas-despues.png`,
`60-pos-paridad-vista-movil-menu-abierto.png`. En las dos de «menú abierto» se ve el defecto de capas L7.
