# POS — Carrito: líneas, iconos y notas (análisis + propuesta, 2026-09-23)

Pedido del dueño: los iconitos de la línea del carrito, las notas (de la línea y de la mesa) y el flujo
hasta cocina, en celular y escritorio, con el manual de marca y el flujo bien estructurado.

Archivo Figma `EAvjINVRnlzFM70GVoWXgl`. Sin código, sin migraciones y sin commits: solo diseño y este documento.
Conteos de la BD tomados el 2026-09-23 con `SELECT` (proyecto `jgmgphmzusbluqhuqihj`), sin datos personales.

---

## 1. Hallazgos (los más graves primero)

| # | Hallazgo | Evidencia |
|---|---|---|
| N1 | **La nota de la línea del mostrador no se guarda.** `handleSaveNotes` solo cambia el estado de React; el carrito vive en `localStorage` (`pos_carts_<org>`) y lo escribe solo `POSService`. La siguiente operación del servicio (subir cantidad, descuento, agregar otro producto) relee el carrito guardado y **la nota desaparece**; al recargar, también. Lo mismo le pasa a «Excluir impuesto». | `CartView.tsx:321-330` y `:294-301` · `app/app/pos/page.tsx:396-398` (`handleCartUpdate` = solo estado) · `posService.ts:906-918`, `:1007-1039`, `:2515` (único punto de escritura) |
| N2 | **El vínculo carrito ↔ comanda se pierde y la cocina recibe duplicados.** `kitchen_ticket_id` se pone solo en el estado de React; en cuanto `POSService` devuelve el carrito, ya no lo trae, y el siguiente «Enviar a cocina» crea una comanda nueva con **todas** las líneas. Además, cuando sí lo trae, las líneas «nuevas» se detectan por `nombre + cantidad + variante`: subir de 1 a 2 hamburguesas reenvía la línea completa (2) y cambiar la nota o el modificador no se detecta. | `app/app/pos/page.tsx:542` (solo `updateCartInState`) · `:489-501` (clave de deduplicación) |
| N3 | **Borrar o cambiar un plato ya enviado no avisa a cocina.** En mesa, `eliminarItem` borra las filas de `kitchen_ticket_items` aunque el plato esté en preparación; `actualizarCantidadItem` cambia `sale_items.quantity` y la comanda (que lee la cantidad por join) cambia en silencio. `kitchen_tickets.cancelled_at` existe y **nunca** se usa (0 filas). BD: **24** ítems de comanda con cantidad distinta a la de su línea de venta. | `mesas/id/pedidosService.ts:545-549`, `:622-652` · `OrderItemCard.tsx:247-278` (lápiz y papelera sin distinguir «enviado») |
| N4 | **Dos productos iguales con modificadores distintos se funden en la mesa.** El carrito del diálogo de mesa es un `Map` por `product_id`: la segunda hamburguesa «término medio» suma 1 a la primera «bien asada» y su modificador se pierde. Y la nota es **una por producto**, así que «2 hamburguesas, una sin cebolla» no se puede pedir. En el mostrador la fusión ignora la nota (misma causa). | `mesas/id/AddProductDialog.tsx:259-264`, `:308-315` · `posService.ts:933-942` |
| N5 | **La nota de cocina sale en la pre-cuenta del cliente.** No existe «destino» de la nota: `PreCuentaDialog` pinta `notes.extra` («sin cebolla», «alergia…») en el documento que se entrega al cliente. El recibo del POS, en cambio, no pinta ninguna nota (tampoco la que el cliente sí debería ver). | `mesas/id/PreCuentaDialog.tsx:121-123` · `lib/services/printService.ts:274-286` |
| N6 | **La nota de la mesa no existe en la interfaz.** `table_sessions.notes` existe (0 de 162 sesiones la usan) y no hay alergias, instrucciones generales ni ritmo de salida. El comensal se guarda dentro del JSON `sale_items.notes.guest_number` y **se pega como texto** en la nota de cocina: **158 de 173** notas de comanda son «Comensal N…». La cocina no puede distinguir una alergia de un comensal. | `pedidosService.ts:441-443` · BD: `kitchen_ticket_items.notes like 'Comensal %'` = 158 |
| N7 | **`cart.notes` y `sales.notes` están ocupados por texto del sistema.** «Factura: FV-… \| Vence: …» se guarda en `cart.notes` y se vuelve a leer con una expresión regular; no hay dónde poner la nota del pedido sin romper eso. | `posService.ts:1617`, `:2562` |
| N8 | **La nota de mesa se escribe con un editor de texto enriquecido** (`innerHTML`) y se guarda tal cual en `sale_items.notes.extra` y `kitchen_ticket_items.notes`; la impresora térmica la imprime entre `***`. Hoy hay 0 notas con etiquetas en la BD (riesgo latente: basta un Enter o una negrita). | `AddProductDialog.tsx:773-778` · `components/shared/RichTextEditor.tsx:72` · `lib/services/mobileEscposAdapter.ts:454-455` |
| N9 | **Iconos de 24 px en móvil y sin orden fijo.** Botones `h-6 w-6` (24 px) en el teléfono; la fila de controles mezcla cantidad, casilla «Incluido», excluir impuesto, nota y quitar; «+ Agregar descuento» es un enlace de texto aparte. Nada tiene tooltip con atajo. En mesa la línea tiene otro juego (lápiz de cantidad, «Transferir» con texto, papelera). | `CartView.tsx:963-1072`, `:903-911` · `OrderItemCard.tsx:243-279` |
| N10 | **El estado de cocina de la línea es el del ticket entero**, no el de la línea: todas las líneas «de preparación» muestran el mismo badge. Y para conocerlo se descargan **todas** las comandas de la organización (ya registrado como K8). | `CartView.tsx:241-244`, `:744-758` |
| N11 | **La comanda de mesa no guarda el nombre ni los modificadores del ítem** (los lee por join de `sale_items`): 229 de 294 ítems de comanda sin `product_name`; si la línea se borra, la comanda queda sin nombre. 65 ítems (camino del mostrador) no tienen `sale_item_id`. | `pedidosService.ts:434-446` vs `lib/services/kitchenService.ts:361-368` |
| N12 | En la mesa la comanda aparece en cocina **al agregar**, no al pulsar «Enviar» (ya registrado como D4 en `POS-MESAS-COMANDAS-RESERVAS.md`); por eso no hay estado «Por enviar» en ninguna línea. | `pedidosService.ts:417-453` |

Datos de apoyo (BD, 2026-09-23): `sale_items` 5.640 filas; con `notes.extra` 169, **138 de ellas vacías**
(`""`), longitud media de las reales 10,6 caracteres; con comensal 165; con modificadores 119. Comandas 205
(163 de mesa, 42 del mostrador) en 6 organizaciones. La tabla `carts` (con `cart_data jsonb`) existe y está vacía.

---

## 2. Qué hay hoy en la línea (inventario de iconos)

### 2.1 Mostrador — `src/components/pos/CartView.tsx`

| Icono / control | Qué hace | Dónde guarda | Línea |
|---|---|---|---|
| `−` / campo / `+` | Cantidad | `pos_carts_<org>` vía `POSService.updateCartItemQuantity` | `:963-995`, servicio `:1007` |
| Total de la línea | Solo lectura (en escritorio a la derecha, en móvil abajo) | — | `:947-956`, `:999-1008` |
| Casilla «Incluido» | Impuesto incluido en el precio de esa línea | `POSService.updateItemTaxIncluded` | `:1011-1026` |
| `ReceiptText` | Excluir impuesto de la línea | **solo estado de React** (N1) | `:1029-1043` |
| `StickyNote` | Abre el campo de nota en línea (Enter guarda, Esc cancela) | **solo estado de React** (N1) | `:1046-1060`, `:793-826` |
| Etiqueta azul con la nota | Tocarla reabre la edición | — | `:783-790` |
| «+ Agregar descuento» y chips `−$ X` | Descuento por línea en pesos; los chips salen de descuentos frecuentes del producto | `POSService.updateCartItemDiscount` | `:851-942` |
| `Trash2` | Quitar la línea (sin confirmación) | servicio | `:1063-1072` |
| Badges | Variantes (índigo), modificadores (ámbar), estado de cocina del ticket | — | `:744-780` |

No existen hoy: precio manual, cortesía, vendedor por línea, comensal, lote/serial en la línea (el serial se
elige en el cobro), dividir línea, transferir (solo mesa).

### 2.2 Mesa — `src/components/pos/mesas/id/OrderItemCard.tsx` y `AddProductDialog.tsx`

| Control | Qué hace | Línea |
|---|---|---|
| Lápiz → campo + ✓ / ✗ | Cambia la cantidad (también si ya está en cocina) | `OrderItemCard.tsx:243-256` |
| «Transferir» (texto) | Mueve la línea a otra mesa | `:261-269` |
| Papelera + confirmación | Borra la línea y sus ítems de comanda, auditoría sin motivo obligatorio | `:271-278`, `pedidosService.ts:510-567` |
| 📝 texto | Muestra la nota (no se puede editar después de agregar) | `:191-195` |
| 👤 «Comensal N» | Muestra el comensal | `:161-165` |
| En el diálogo de agregar: `− n +`, botones de comensal 1…N / «General», editor enriquecido de nota | Arma el pedido antes de insertarlo | `AddProductDialog.tsx:700-781` |

### 2.3 Cómo viaja la nota hoy

```
Mostrador:  CartView (estado React) ─┬─ Enviar cocina → KitchenService.createKitchenTicketFromPOS
                                      │     kitchen_ticket_items.notes (texto) + print_jobs → ticket térmico «*** nota ***»
                                      └─ Cobrar → checkoutRpc.ts:130-132 → sale_items.notes = {product_name, extra, modifiers}
                                            recibo (printService.ts:274-286): sin nota · factura: modificadores en la descripción, sin nota
Mesa:       AddProductDialog → sale_items.notes {extra, guest_number, modifiers}  (al agregar)
                              → kitchen_ticket_items.notes = "Comensal N - nota"  (al agregar, sin «Enviar»)
            KDS (TicketCard.tsx:317-319) pinta la nota · pre-cuenta la pinta al cliente (N5)
```

---

## 3. Propuesta

### 3.1 Reglas del flujo

1. **Una acción = un icono, en orden fijo**, con tooltip «Acción · Atajo». Escritorio 32 px; táctil 44 px.
   - Mostrador: **Nota (N) · Modificadores (M) · Descuento (D) · ⋯ · Quitar (Supr)**.
   - Mesa, por enviar: **Nota · Modificadores · Comensal (C) · ⋯ · Quitar**.
   - Mesa, enviada: **Nota a cocina · Marcar servida · ⋯ · Anular (motivo)** — la cantidad se bloquea.
   - En espera / con deuda: todo deshabilitado salvo «⋯».
   - En móvil «Descuento» y «Comensal» pasan al «⋯» para que quepan 44 px.
   - «⋯» (secundarias, solo las que aplican): Precio manual (permiso) · Excluir impuesto (T) · Impuesto incluido (I) ·
     Separar una unidad · Duplicar · Transferir a otra mesa · Cortesía (permiso + motivo) · Vendedor de la línea ·
     Serial/lote · Quitar línea.
2. **Una nota tiene destino**: *Cocina* (comanda, KDS, ticket de cocina) o *Recibo del cliente* (ticket y factura).
   Nunca se cruzan: la pre-cuenta y el recibo no muestran notas de cocina.
3. **Alergia es un dato, no un texto**: casilla + alérgenos. Sale en rojo arriba de la comanda y el KDS pide
   «Confirmar» antes de «Empezar».
4. **Notas distintas = líneas distintas**: «Solo para 1 de las 2 unidades» separa la línea. Agregar el mismo
   producto con otros modificadores o nota crea otra línea.
5. **Nota del pedido / de la mesa** (una por pedido): comensales, alergias de la mesa, instrucciones para cocina,
   ritmo (todo junto / por tiempos / esperar aviso) y nota para el recibo. Se imprime en **cada** comanda.
6. **Por enviar → Ronda**: en mesa las líneas nuevas esperan «Enviar a cocina (n)»; cada envío es una ronda. Una
   línea enviada no se edita en silencio: cambiar cantidad crea una comanda de ajuste, anular pide motivo y
   marca el ítem de comanda como cancelado (no lo borra).
7. **Texto plano, 140 caracteres**, sin editor enriquecido.

### 3.2 Componentes (Figma › `02 Componentes` › sección `845:557466` «POS — Carrito: líneas y notas (Nuevo)», x = 56.000, y = 110.000)

| Componente | Node id | Variantes / propiedades |
|---|---|---|
| `CartLineAction` | `845:557509` | `Size=32/44` × `State=default/activo/peligro/deshabilitado` · swap `Icono` |
| `CartLineActionBar` | `845:557864` | `Contexto=mostrador/mesa-por-enviar/mesa-enviada/bloqueada` × `Layout=desktop/mobile` |
| `LineActionsMenu` («⋯») | `845:557865` | `MenuItem` del kit con icono y atajo; «Quitar línea» destructiva |
| `LineNote` | `845:558032` | `Destino=cocina/cliente/alergia` · texto `Nota` (envuelve, nunca «…») |
| `CartLine v3` | `846:87947` | `State=normal/con-nota/con-modificadores/con-descuento/por-enviar/en-cocina/preparando/lista/editando-cantidad/sin-stock/seleccionada` × `Layout=desktop/mobile` (22). Sustituye a `CartLine` `241:9682` al aprobarse |
| `LineNoteEditor` | `847:30394` | `Layout=popover/sheet` × `State=vacío/con-texto/alergia` |
| `OrderNotePanel` | `847:30744` | `Contexto=mesa/mostrador` × `State=vacío/con-datos` |
| `ComandaKDS · notas` | `848:30505` | `Estado=nueva/preparando` (alergia de mesa con «Confirmar», instrucción, nota por ítem, comensales) |
| `TicketImpreso · notas` | `848:30541` | `Tipo=cocina/recibo` (80 mm) |
| `CartPanel` | `849:31653` | `Variant=mostrador/mesa/vacío/en-espera/con-deuda` (usa `CartLine v3`, `CobrarButton`, `KbdButton`, `FilaDato`, `Badge`, `Avatar`) |

Todo con instancias del kit (`Button`, `IconButton`, `Badge`, `Chip`, `Checkbox`, `SegmentedControl`, `MenuItem`,
`Kbd`, `CartTag`, `TiempoTranscurrido`, `VariantModifierDialog`, iconos `Icon/*`) y colores ligados a variables.

### 3.3 Pantallas (Figma › `05 POS y ventas` › sección `852:93388`, x = 0, y = 131.000)

| Pantalla | Node id | Estado |
|---|---|---|
| Escritorio / POS mostrador — nota de línea (popover «N») | `852:93391` | Hecha (1440 × 1013) |
| Escritorio / Mesa 4 — rondas + nota de la mesa (`OrderNotePanel`) | `852:95110` | Hecha; **el popover `OrderNotePanel` no salió en la última captura**: revisar su posición/orden de capas |
| Escritorio / Mesa 4 — modificadores al agregar | `852:96851` | Hecha, sin captura |
| Escritorio / Mesa 4 — dividir por comensal | `852:98042` | Hecha, sin captura |
| Móvil 390 (mesero): cuenta de mesa · nota de línea (hoja) · nota de mesa (hoja) · modificadores (hoja) · dividir · enviado a cocina | — | **Pendiente** (cupo agotado) |
| Tablet / Cocina — KDS con notas · Impresión cocina + recibo · Flujo de la nota | — | **Pendiente** (los componentes existen) |

Decisión de alto: con líneas de dos renglones más la barra de acciones, el `CartPanel` de mostrador con 3 líneas
mide ~880 px; en 1440 × 900 la lista de líneas debe hacer scroll interno con totales y «Cobrar» fijos (como pide D3).

### 3.4 Capturas

- `docs/design/figma/57-pos-carrito-line-note-editor.png` — set `LineNoteEditor` (tomada antes de cambiar los
  chips de alérgenos a `Chip Variant=toggle`; el resto está vigente).
- Faltan las demás (`get_screenshot` usa el mismo cupo).

---

## 4. Cambios de backend y BD necesarios (no aplicados)

Todos aditivos (columnas `NULL`-ables o con `DEFAULT`), con su `.sql` en `supabase/migrations/` y su reversión en
`supabase/rollbacks/` (`docs/POLITICA-MIGRACIONES.md`). Verificar columnas con el MCP antes de escribir.

**Sin migración (arreglos de código):**
1. `POSService.updateCartItemNote(cartId, itemId, { text, destino, alergia, alergenos })` y
   `updateCartItemTaxExcluded(...)` que escriban en `pos_carts_<org>` por `saveCartsToStorage`; `CartView` deja de
   llamar a `onCartUpdate` con cambios sin persistir (N1).
2. `POSService.setCartKitchenTicket(cartId, ticketId)` persistido; «Enviar a cocina» compara por **id de línea**
   del carrito (guardado en el ítem de comanda), no por nombre + cantidad (N2).
3. Clave de fusión de `addItemToCart` = producto + modificadores + nota; en mesa, el carrito del diálogo por id de
   línea, no por `product_id` (N4).
4. Nota en texto plano con `Textarea` y 140 caracteres; quitar `RichTextEditor` del diálogo de mesa (N8).
5. Pre-cuenta y recibo: solo la nota con destino «cliente»; ticket de cocina: alergias e instrucciones de la mesa
   arriba (N5).
6. Estado de cocina **por línea** (`kitchen_ticket_items.status`) con una consulta filtrada por el ticket, no
   `getKitchenTickets()` completo (N10).
7. La mesa usa `CartPanel` y el cobro de `posService` (regla 7; ya decidido en `POS-MESAS-COMANDAS-RESERVAS.md`).

**Con migración:**
1. `sale_items`: `guest_number smallint NULL`, `kitchen_note text NULL`, `customer_note text NULL`,
   `allergens text[] NULL`, `round_number smallint NULL`, `sent_to_kitchen_at timestamptz NULL`,
   `voided_at timestamptz NULL`, `void_reason text NULL`. Se sigue escribiendo `notes` jsonb por compatibilidad;
   backfill de `guest_number` desde `notes->>'guest_number'` (165 filas). `CHECK (char_length(kitchen_note) <= 140)`.
2. `kitchen_ticket_items`: `guest_number smallint NULL`, `is_allergy boolean NOT NULL DEFAULT false`,
   `allergens text[] NULL`, `cancelled_at timestamptz NULL`, `cancel_reason text NULL`; `product_name`,
   `quantity` y `modifiers` como **copia** al enviar también en mesa (N11). Anular = `cancelled_at`, nunca `DELETE`.
3. `kitchen_tickets`: `round_number smallint NULL`, `order_note text NULL` (instantánea de la nota de mesa),
   `allergy_ack_at timestamptz NULL`, `allergy_ack_by uuid NULL`. Ya existen `cancelled_at` y `cancellation_reason`
   (hoy sin uso).
4. `table_sessions`: usar `notes` (existe) para instrucciones de cocina y añadir `allergens text[] NULL`,
   `receipt_note text NULL`, `pacing text NULL CHECK (pacing IN ('together','courses','hold'))`.
5. Nota del pedido de mostrador: campo propio en el carrito (`order_note`, `allergens`, `delivery_mode`) y en
   `sales` (`customer_note text NULL`) — no reutilizar `cart.notes`/`sales.notes` (N7).
6. Tabla nueva `pos_quick_notes` (`organization_id`, `branch_id NULL`, `label`, `kind` cocina/cliente/alergia,
   `display_order`, `is_active`, `usage_count`) con RLS por pertenencia; semilla calculada con las notas más
   frecuentes de `sale_items.notes->>'extra'` por organización.
7. RPC transaccionales (una sola llamada desde Node): `pos_send_round(p_session_id uuid)` (líneas «por enviar» →
   comanda + ítems con copia de nota, comensal y alergia; sella `sent_to_kitchen_at` y `round_number`),
   `pos_void_line(p_sale_item_id uuid, p_reason text)` (anula línea e ítem de comanda, audita en `ops_audit_log`,
   avisa por Realtime) y `pos_change_line_qty(...)` que, si la línea ya se envió, crea la comanda de ajuste.
   Organización desde la sesión, nunca del body.
8. Publicar `kitchen_ticket_items` en Realtime (ya pendiente en el plan de restaurante) para el estado por línea.

---

## 5. Qué quedó y qué falta en Figma

**Hecho:** los 10 componentes de §3.2 y 4 pantallas de escritorio de §3.3.

**Falta** (se agotó el cupo del MCP de Figma a mitad de la verificación):
1. Revisar en `852:95110` el overlay `OrderNotePanel / mesa con-datos` (no se vio en la captura) y en la pestaña
   «Mesa 4» los contadores heredados («$480k · 4»). En la línea «Limonada de coco» de `CartPanel` mesa, la etiqueta
   dice «Comensal 2» y debe decir «Comensal 1».
2. Pantallas móviles 390 (6) y tablet KDS + impresión + diagrama de flujo (§3.3).
3. Chequeo por script (0 solapes, 0 nodos fuera de sección, 0 instancias rotas, 0 textos truncados, 0 anotaciones
   dentro de frames). Las anotaciones de las 4 pantallas ya están como texto de sección, fuera de los frames.
4. Capturas `57-pos-carrito-*.png` del resto de componentes y pantallas.

## 6. Preguntas para el dueño

1. ¿Mover «Excluir impuesto» e «Impuesto incluido» al «⋯» (con etiqueta visible cuando están activos)? La tanda
   v2 los dejó siempre visibles; esta propuesta los saca de la barra para que queden 4-5 iconos.
2. ¿La alergia debe **bloquear** «Empezar» en cocina hasta que alguien la confirme, o solo resaltarse?
3. ¿Cambiar la cantidad de un plato ya enviado genera una comanda de ajuste automática, o se exige anular y
   pedir de nuevo?
4. ¿Las notas rápidas se configuran por sucursal (Configuración › POS) o se aprenden solas de las más usadas?
5. ¿La nota «para el cliente» debe ir también a la factura electrónica (campo de observaciones) o solo al ticket?

---

## 7. «Excluir impuesto», «Incluido» e «Impuestos incluidos»: qué hace cada control (análisis, 2026-09-23)

Pedido del dueño: antes de tocar nada, entender por qué el control de la línea y el *switch* cumplen funciones
distintas. En esta tanda **no se cambia su comportamiento ni su ubicación**: solo se persiste el flag de la línea
(bug N1). Los números de abajo están congelados en `src/__tests__/pos/impuestosLineaCarrito.test.ts` (carrito,
resumen y cobro) y `src/lib/offline/__tests__/impuestosCobroSobre.test.ts` (lo que viaja a `pos_checkout_v1`); ambos
se escribieron y pasaron **antes** del cambio y siguen pasando después.

### 7.1 Los cuatro controles

| # | Control | Dónde vive | Qué escribe | Alcance |
|---|---|---|---|---|
| C1 | **Excluir impuesto** (icono `ReceiptText` de la línea) | `CartView.tsx:1028-1043`, handler `:294-301` | `CartItem.tax_excluded` | Una línea. Hasta hoy **solo en el estado de React** (se perdía con la siguiente operación del servicio o al recargar: N1). |
| C2 | **Incluido** (casilla de la línea) | `CartView.tsx:1010-1026` (deshabilitada si la línea está excluida), handler `:304-318` | `CartItem.tax_included` vía `POSService.updateItemTaxIncluded` (`posService.ts:1070-1096`), persistido y recalculado | Una línea. |
| C3 | **Impuestos incluidos** (switch del Resumen) | `TaxSummary.tsx:326-340` → `CartView.handleTaxIncludedChange` `:124-132` → `POSService.updateCartTaxSettings` (`posService.ts:1176-1206`) | `Cart.tax_included` **y copia el valor a `tax_included` de TODAS las líneas** (`:1190`) | Todo el carrito. Es un «aplicar a todas»: la línea puede cambiarse después con C2. El estado visual del switch se deriva de las líneas (`CartView.tsx:115-121`: todas → encendido, ninguna → apagado, mezcla → se queda como estaba). |
| C4 | **Impuestos incluidos en precios** (casilla del diálogo de cobro) | `CheckoutDialog.tsx:2311-2320`; se inicializa con `cart.tax_included` al abrir (`:414`) | Estado local del diálogo (`taxIncluded`), no vuelve al carrito | La venta: es el `tax_included` de `sales`/`invoice_sales` y el valor por defecto de las líneas **sin** C2 propio. |

Además existe `organization_taxes.tax_included` (configuración del impuesto). `TaxSummary.tsx:176-184` y `:204-205`
lo leen, pero **no tiene efecto**: el ítem ya llega con `tax_included` booleano (`:164`, `item.tax_included ??
taxIncluded`, y `taxIncluded` nunca es `undefined`), y `calculateCartTaxes` (`taxCalculations.ts:142`) da prioridad al
del ítem. El diálogo de cobro ni lo lee.

### 7.2 Cómo entra cada control en cada cálculo

Hay **tres** cálculos independientes del mismo carrito:

**(a) Carrito guardado — `POSService.calculateCartTotals` / `calculateItemTaxes` (`posService.ts:2312-2422`).**
Se ejecuta en cada mutación del servicio (agregar, cantidad, descuento, C2, C3). Por línea: base gravable = cantidad ×
precio − descuento; si `tax_included` → el impuesto se extrae (`base − base/(1+tasa)`) y el total es la base; si no, se
suma encima. **No lee `tax_excluded`** (una línea excluida sigue con su IVA en `cart.total`). Ese `cart.total` es el
que usan el botón «Cobrar», la deuda y la pantalla del cliente cuando no hay otro.

**(b) Resumen que ve el cajero — `TaxSummary` (`TaxSummary.tsx:146-245`).** Por línea:
- C1 activo → la línea se suma **sin impuesto y sin restar su descuento** (`:149-154`, `cantidad × precio`).
- si no → `tax_included = item.tax_included ?? switch` (`:164`) y `calculateCartTaxes`.
Sus totales son los que se proyectan en la pantalla del cliente (`CartView.tsx:171-189`).

**(c) Cobro — `CheckoutDialog.calculateCartTotals` (`CheckoutDialog.tsx:906-1002`) → `POSService.checkout`.**
- Por línea, `tax_included = item.tax_excluded ? false : (item.tax_included ?? cart.tax_included)` (`:928`): C1 **no
  quita el impuesto**, solo fuerza «no incluido»; la línea se calcula igual con la tasa del producto u organización.
- El impuesto total se **reparte** entre todas las líneas por peso del subtotal (`:1112-1127`) y ese `tax_rate`
  repartido es el que usa `POSService.checkout` (`posService.ts:1733-1781`), que vuelve a calcular por línea con
  `item.tax_included ?? checkoutData.tax_included` (`:1737`). `tax_excluded` tampoco se lee ahí.
- `buildCheckoutEnvelope` (`lib/offline/checkoutRpc.ts:128-148`) manda por línea `tax_rate`, `tax_amount`, `total` y
  `tax_included`, y a nivel de venta `tax_included` = C4 y los totales. `pos_checkout_v1` los escribe tal cual en
  `sale_items` y en `invoice_items` (`tax_included` de la línea o, si falta, el de la venta), y `sales.tax_total` /
  `invoice_sales.tax_total` con el total del sobre.

### 7.3 Resultado con y sin cada control (2 × $10.000, IVA 19 %)

| Caso | (a) carrito guardado | (b) Resumen | (c) Cobro / venta |
|---|---|---|---|
| Sin controles | 23.800 | 23.800 | 23.800 |
| C2 «Incluido» | 20.000 (IVA 3.193,28 dentro) | 20.000 | 20.000 |
| C3 switch encendido (copia C2 a todas) | 20.000 | 20.000 | 20.000 |
| C3 encendido y C2 apagado en la línea | 23.800 | 23.800 | 23.800 (la línea manda) |
| **C1 «Excluir impuesto»** | 23.800 (no lo mira) | **20.000 sin IVA** | **23.800: IVA encima** |
| C1 sobre una línea C2 | 20.000 | 20.000 sin IVA | **23.800: C1 fuerza «no incluido»** |
| C1 con descuento de $1.000 | 22.610 | **20.000 (ignora el descuento)** | 22.610 |

### 7.4 Factura electrónica y contabilidad

- **Factura electrónica (Factus).** El documento sale de `invoice_items`: `payloadsFactus.ts:95-110` manda a Factus el
  precio **sin** impuesto (si la línea tiene `tax_included` divide por `1+tasa`) y la tasa de la línea; Factus recalcula
  el impuesto. `tax_excluded` no llega a `invoice_items`: una línea excluida se factura **con** su IVA.
- **Contabilidad.** `fn_auto_journal_sale_pos` (trigger de `sales`) y `fn_auto_journal_sale` (trigger de
  `invoice_sales`) toman `NEW.tax_total` del documento como IVA por pagar cuando la regla contable lo pide
  (`use_tax_from_document`). Es decir, el IVA contable es el del cobro (c), no el del Resumen (b).

### 7.5 Conclusiones (para decidir, NO se cambiaron)

1. C1 y C3 son cosas distintas: C3 dice **cómo está expresado el precio** (con o sin IVA dentro) y se aplica a todas
   las líneas; C1 pretende **quitar el impuesto de una línea**. C2 es C3 para una sola línea.
2. **C1 solo lo respetan el Resumen y la pantalla del cliente.** El cobro, la venta, la factura electrónica y la
   contabilidad cobran el IVA de esa línea (y si la línea era «Incluido», C1 la pasa a IVA **encima**). El cajero ve un
   total y el diálogo de cobro pide otro.
3. Mientras C1 se perdía con la siguiente operación (N1), la discrepancia aparecía solo si se marcaba justo antes de
   «Cobrar». Al persistir el flag (esta tanda) la semántica es la misma, pero el flag **sobrevive**: la discrepancia se
   verá en más ventas. Recomendación para el dueño: decidir si C1 debe (i) cobrar la línea sin impuesto también en el
   cobro, la factura (como `is_excluded` o tarifa 0) y la contabilidad, o (ii) desaparecer. Cualquiera de las dos es
   un cambio de cálculo que va en su propia tarea, con estos tests como punto de partida.
4. `organization_taxes.tax_included` no tiene efecto en el POS de mostrador (§7.1).
5. En el Resumen, una línea con C1 y descuento suma el precio **sin** descontar (7.3, última fila).
6. La mesa tiene su propio `tax_excluded` en `useMesaTaxes.ts:100` (misma regla que el Resumen). Fuera de alcance.

---

## 8. Implementado (2026-09-24) — bugs N1, N2, N3, N5 y decisiones del dueño

| Qué | Cómo | Dónde |
|---|---|---|
| **N1** Nota de la línea y «Excluir impuesto» persistidos | `POSService.updateCartItemNote` / `updateCartItemTaxExcluded` escriben en `pos_carts_<org>` (leen la lista completa: no borran carritos en deuda). «Excluir impuesto» conserva su semántica exacta: no recalcula y `calculateCartTotals` sigue sin leerlo (§7, tests que no cambiaron). | `posService.ts`, `CartView.tsx` |
| Nota con destino | `CartItem.notes` = cocina (como siempre), `customer_note` = cliente, `is_allergy`. Editor actual con conmutador Cocina/Cliente, casilla «Alergia» y chips de notas rápidas (sin rediseño). Una línea con nota ya no absorbe unidades sin nota (N4, mostrador). | `lib/pos/cocina/lineasCarrito.ts`, `components/pos/cocina/ChipsNotasRapidas.tsx` |
| **N2** Vínculo carrito ↔ comanda y envío por delta | `kitchen_tickets.cart_id` + `kitchen_ticket_items.cart_line_id` (id estable de la línea). «Enviar a cocina» manda TODAS las líneas de preparación a `pos_cocina_enviar_ronda` (ruta `POST /api/pos/cocina/ronda`), que en una transacción crea la comanda de lo nuevo y la de **ajuste** de lo cambiado (+/− unidades, nota o alergia cambiada) o quitado (anulación: el original queda `cancelled`, nunca se borra). Idempotente por `round_key`, que el carrito guarda **antes** de enviar: reintentar la misma ronda devuelve la comanda de la primera vez (`replayed`) y no imprime de nuevo. El carrito guarda lo enviado por línea («En cocina ×n» / «Cambio sin enviar»). Un carrito enviado antes de esta versión se adopta una vez (ítems asignados a líneas por nombre). | migración `20260925100000`, `app/app/pos/page.tsx` |
| **N3** Mesa | Cambiar la cantidad o quitar un plato pasa por `pos_cocina_ajustar_linea_mesa` (ruta `POST /api/pos/cocina/mesa-linea`): si ya está en cocina crea la comanda de ajuste y conserva la original; al anular, los ítems vivos quedan `cancelled` con motivo, se desvinculan de la línea y la línea sale de la cuenta (auditoría en `ops_audit_log`, misma forma que antes, en la misma transacción). Restar o anular algo enviado **exige motivo** (diálogo en `OrderItemCard`). Si todo ya estaba entregado, restar/anular no molesta a la cocina; sumar siempre avisa. La fórmula de la línea es la de antes, movida a la RPC (impuesto por unidad; total = precio × cantidad + impuesto). Los ítems de comanda nuevos de mesa guardan copia de nombre, cantidad y modificadores (N11); el KDS usa la copia cuando existe. | `pedidosService.ts`, `OrderItemCard.tsx` |
| Alergia | `is_allergy` en la línea y en el ítem; `kitchen_tickets.has_allergy`. En el KDS la comanda con alergia sin confirmar muestra el aviso en rojo y «Confirmar alergia»; «Empezar» queda deshabilitado. La base lo impone (disparadores en `kitchen_tickets` y `kitchen_ticket_items`): arrastrar la tarjeta o tocar el ítem tampoco lo salta. La confirmación queda con quién (usuario de la sesión) y cuándo (`pos_cocina_confirmar_alergia`). En mesa, casilla «La nota es una alergia» al agregar. | `TicketCard.tsx`, `app/app/pos/comandas/page.tsx` |
| Notas rápidas | Tabla `pos_quick_notes` (organización, sucursal opcional, texto, tipo cocina/cliente/alergia, orden, activa) con RLS de lectura por pertenencia; se escribe por `/api/pos/notas-rapidas` con permiso `organization_settings`. Las más usadas salen de `sale_items.notes->>'extra'` (180 días). Configuración › POS › «Notas rápidas». | `NotasRapidasSection.tsx` |
| **N5** Nota del cliente | Va a `sale_items.notes.customer_note`, a `invoice_items.note` (parche de `pos_checkout_v1`, migración `20260925100100`) y de ahí la cola de Factus ya la envía como `items[].note`; al ticket físico y al recibo (`note` en el ítem del ticket de venta). La nota de cocina ya no sale en la pre-cuenta ni en la pantalla del cliente (que ahora muestra solo `customer_note`). | `CheckoutDialog.tsx`, `printService.ts`, `print-agent/src/printing/*`, `PreCuentaDialog.tsx`, `lib/pos/display/projection.ts` |

Verificado: las RPC se probaron en una transacción deshecha (ronda nueva, reintento idempotente, +1, nota
cambiada, anulación por quitar la línea, ronda sin cambios, alergia que bloquea y se confirma, pertenencia,
sucursal ajena, mesa +1/−2 con y sin motivo, anulación con auditoría) y `pos_checkout_v1` con la nota del cliente
llegando a `invoice_items.note`.

**Pendiente / para decidir:**
1. «Excluir impuesto» en el cobro, la factura y la contabilidad (§7.5): decisión del dueño.
2. En mostrador, quitar o restar una línea ya enviada no avisa a cocina hasta el siguiente «Enviar a cocina»
   (la ronda sí genera el ajuste). Si se cobra sin reenviar, la comanda se marca entregada como antes.
3. Restar o anular en mesa no exige permiso (como antes); ¿pedir `pos.void`?
4. La nota del cliente en mesa aún no tiene editor (la mesa solo escribe la nota de cocina); la pre-cuenta ya
   la mostraría.
5. `kitchen_ticket_items` sigue fuera de la publicación de Realtime (§4, punto 8).
