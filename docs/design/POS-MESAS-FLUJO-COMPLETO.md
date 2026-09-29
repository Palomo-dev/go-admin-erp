# POS — Mesas: flujo completo de atención (análisis + propuesta en Figma)

Fecha: 2026-09-28. Pedido del dueño: «En Figma, en Mesas, no veo cómo es todo el proceso de agregar
clientes, productos y demás, cobros, todos, y qué componentes reutiliza, y todo».

Alcance: atender una mesa de principio a fin — abrir, cliente, productos, comanda, rondas, mover /
unir / dividir, pre-cuenta, cobro, cierre, anulaciones y casos raros. Solo lectura de código; la
base se consultó con el MCP de Supabase (proyecto `jgmgphmzusbluqhuqihj`, solo `SELECT`,
agregados sin identificar organizaciones). Rutas relativas a `src/` salvo que se indique. Sin
cambios de código de la app.

Documentos que este **no repite** y da por leídos (y no contradice): `POS-MESAS-VISTAS.md` (plano y
cuadrícula, sección Figma `870:98618`), `POS-MESAS-COMANDAS-RESERVAS.md` (hallazgos M1–M10, D1–D12,
K1–K10), `POS-CARRITO-LINEAS-NOTAS.md` (líneas, notas, `CartLine v3`, `CartPanel`),
`POS-ESTACIONES-Y-COMANDAS.md` (Comandas v2 `959:583911`, `ComandaKDS v2`, `EstacionChip`),
`POS-CARGOS-SERVICIO-EN-VENTAS.md` (`CargoServicioFila`, pre-cuenta con cargo),
`POS-AUTORIZACION-SUPERVISOR.md` (`AutorizacionSupervisor`), `POS-COBRO-SERVIDOR.md`
(`pos_checkout_v1` modo `settle`) y `POS-UX-V2.md` (carrito y cobro v2, §7.5 vistas).

Leyenda de estado: **Existe** (funciona de punta a punta) · **A medias** (existe con huecos o
errores) · **No existe**.

---

## 0. Resumen para el dueño

1. **El flujo existe entero, pero en una pantalla aparte del POS.** La mesa tiene su propio
   buscador de productos, su propio carrito, sus propias notas y su propio desglose de impuestos
   (`components/pos/mesas/id/*`). Del POS de mostrador **solo reutiliza el cobro**
   (`CheckoutDialog`, que por dentro ya usa las piezas v2) y el selector de cliente. Todo lo demás
   está duplicado, y por eso la mesa no tiene chips de notas rápidas, ni descuento, ni el carrito
   aprobado en Figma.
2. **El cobro ya es el del POS y se decide en el servidor** (`pos_checkout_v1` modo `settle`,
   idempotente, con propina a `tips`). Pero **la cuenta dividida está rota**: el servidor marca como
   pagada la línea entera aunque el comensal haya pagado solo una parte, y el saldo queda en 0. Se
   puede liberar la mesa sin haber cobrado todo (E1). Es el error más grave del flujo.
3. **La cocina ve el pedido antes de «Enviar comanda».** La comanda nace al agregar el producto; el
   botón solo imprime. La mesa **no usa** las rondas idempotentes (`pos_cocina_enviar_ronda`) que ya
   usa el mostrador (E2). Las comandas de ajuste con motivo sí funcionan.
4. **El cliente elegido no se guarda** (salvo si es huésped de hotel): al recargar la página se
   pierde, y al cobrar el servidor conserva el que ya tenía la venta (E3). No existe «Consumidor
   final».
5. **No existe hoy**: abrir la mesa con mesero y cliente, sentar una reserva (no abre la mesa),
   notas rápidas en la mesa, cargo de servicio en el cobro, cupones en el cobro, autorización de
   supervisor al anular un plato, estado «por limpiar», aviso de mesa abandonada (las 23 sesiones
   abiertas llevan más de 24 h) y trabajo sin conexión.
6. **Propuesta en Figma** (§7): el recorrido completo en 15 pantallas de escritorio, 8 de tableta
   (la del mesero), 7 de móvil y 8 de estados, con un mapa del flujo y la tabla de reutilización, **montado con instancias del kit y de los diseños ya
   aprobados**: la mesa se atiende en el mismo POS (catálogo + `CartPanel Variant=mesa`), con la
   pestaña de la mesa, y cobra con el mismo `CheckoutDialog v2`. Lo que no existe en el código va
   con nota amarilla «Propuesta».

---

## 1. Pantallas y archivos del flujo

| Pieza | Archivo | Tamaño |
|---|---|---|
| Plano / cuadrícula | `app/app/pos/mesas/page.tsx` | 1.187 líneas |
| Detalle de la mesa | `app/app/pos/mesas/[id]/page.tsx` | 2.005 líneas, sin `next-intl` salvo liberar y cocina |
| Agregar productos | `components/pos/mesas/id/AddProductDialog.tsx` | 1.050 |
| Línea del pedido | `components/pos/mesas/id/OrderItemCard.tsx` | 421 |
| Acciones y resumen | `components/pos/mesas/id/MesaActionsSidebar.tsx` | 328 |
| Pre-cuenta | `components/pos/mesas/id/PreCuentaDialog.tsx` | 252 |
| Dividir / pagar partes | `components/pos/mesas/id/SplitBillDialog.tsx`, `SplitPaymentSelector.tsx` | 532 / 272 |
| Transferir ítem | `components/pos/mesas/id/TransferItemDialog.tsx` | 197 |
| Mover / combinar / liberar | `components/pos/mesas/MoverPedidoDialog.tsx`, `CombinarMesasDialog.tsx`, `LiberarMesaDialog.tsx` | 168 / 251 / 373 |
| Servicios | `components/pos/mesas/id/pedidosService.ts`, `components/pos/mesas/mesasService.ts` | 799 / 772 |
| Cocina desde la mesa | `components/pos/cocina/cocinaCliente.ts`, `app/api/pos/cocina/mesa-linea/route.ts` | — |
| Liberar | `app/api/pos/mesas/[id]/liberar/route.ts`, `components/pos/mesas/liberacionMesaCliente.ts` | — |
| Cobro | `components/pos/CheckoutDialog.tsx` → `lib/services/posService.ts` (`checkout`) | — |
| Reservas | `components/pos/reservas-mesas/reservasMesasService.ts` | 504 |

---

## 2. El flujo real, paso a paso

### 2.1 Abrir la mesa — **A medias**

| Qué | Hoy | Evidencia |
|---|---|---|
| Diálogo «Abrir Mesa - {nombre}» | Solo pide **comensales** (tope = capacidad). Ni mesero ni cliente | `app/app/pos/mesas/page.tsx:995-1032`, `:386-400` |
| Escritura | `MesasService.abrirSesion`: `select` de sesión → `insert table_sessions` → `update restaurant_tables.state='occupied'`, desde el navegador y sin transacción | `components/pos/mesas/mesasService.ts:364-429`, llamada en `page.tsx:355-384` |
| Mesero | El usuario actual; se cambia después en el detalle (`SearchSelect` de miembros) | `mesasService.ts:389-393`; `[id]/page.tsx:853-908`, `:1954-1991` |
| Entrar a una mesa libre sin abrirla | El primer producto o el primer cliente crean la sesión con **2 comensales fijos** | `[id]/page.tsx:318-376` (`iniciarSesion(tableId, user.id, 2)` en `:356-360`) |
| Sucursal de la sesión | No se pasa `branch_id`: la pone el trigger con la sucursal del usuario, no la de la mesa | `mesasService.ts:400-409`; `pedidosService.ts:192-201` |
| Reserva que llega | «Marcar como sentada» solo pinta la mesa `occupied`: **no abre `table_sessions`**, no pasa personas ni cliente | `components/pos/reservas-mesas/reservasMesasService.ts:328-341` |
| Reservas en la base | **0 filas** en `restaurant_reservations` | MCP |

### 2.2 Asignar o cambiar el cliente — **A medias**

| Qué | Hoy | Evidencia |
|---|---|---|
| Dónde | Columna derecha del detalle, `CustomerSelector` (dibujado con `CustomerPicker` del kit) | `components/pos/mesas/id/MesaActionsSidebar.tsx:9`, `:116-120` |
| Buscar | Nombre, correo, teléfono o documento; también huéspedes del hotel con reserva `checked_in` | `components/pos/CustomerSelector.tsx:66-101`, `:212-223` |
| Crear en línea | Sí, `ClienteFormDialog`; sin red en Desktop, `OfflineCustomerDialog` | `CustomerSelector.tsx:225-229`, `:294-305` |
| Guardar | **Solo se escribe en `sales` si se elige una habitación** (`if (room && session)`); un cliente normal queda en memoria y se pierde al recargar | `[id]/page.tsx:1421-1492` (`:1430`, `:1434`) |
| Al cobrar | `pos_checkout_v1` hace `customer_id = coalesce(customer_id, v_customer)`: cambiar un cliente que la venta ya tenía **se ignora** | `supabase/migrations/20260925140300_pos_mesa_cobra_con_pos_checkout.sql:283-285` |
| Consumidor final | **No existe** en el código (0 coincidencias de «consumidor final» ni `222222222222`); en la base solo 2 organizaciones crearon un cliente así a mano | `grep`; MCP |
| Sesiones con cliente | 2 de 111 sesiones con venta | MCP |

### 2.3 Agregar productos — **Existe, con huecos**

| Qué | Hoy | Evidencia |
|---|---|---|
| Diálogo | `AddProductDialog`, grilla y carrito **propios** (no los del POS) | `components/pos/mesas/id/AddProductDialog.tsx` |
| Buscador, categorías, favoritos, «Top» | Existe (`CategoryFilterBar` del POS) | `AddProductDialog.tsx:22`, `:91-141`, `:214-254`, `:463` |
| Variantes y modificadores | Existe (`VariantSelectorDialog` del POS) | `AddProductDialog.tsx:20`, `:146-187` |
| Nota por línea | Existe, con `RichTextEditor` (HTML) | `AddProductDialog.tsx:796-804` |
| Notas rápidas (`ChipsNotasRapidas`, `pos_quick_notes`) | **No existe en la mesa**: solo en el mostrador | `components/pos/venta/carrito/EditorNotaLinea.tsx:7` |
| Alergia | Existe (casilla → `is_allergy`, `kitchen_tickets.has_allergy`) | `AddProductDialog.tsx:805-813`; `pedidosService.ts:430-443` |
| Por comensal | Existe (`guest_number` en `notes`), pero **por defecto va al comensal 1**, no a «General» | `AddProductDialog.tsx:287`, `:340-348`, `:761-794`; chip en `OrderItemCard.tsx:217-220` |
| Mismo producto, otros modificadores | El carrito agrupa por `product.id`: suma cantidad y **pierde los modificadores nuevos** | `AddProductDialog.tsx:270-274` |
| Escritura | `agregarProductos`: crea `sales` si falta → `table_sessions.sale_id` → `sale_items` → `kitchen_tickets` + `kitchen_ticket_items` → RPC `pos_mesa_recalcular_venta`; sin transacción | `pedidosService.ts:240-495`, `:507-513` |
| Cargo a la habitación (PMS) | Existe: si la cuenta está ligada a un huésped, cada producto va también al folio (`room_charge` o `direct_payment`) | `[id]/page.tsx:385-420`, `:500-536` |

### 2.4 Enviar la comanda a las estaciones — **A medias**

| Qué | Hoy | Evidencia |
|---|---|---|
| Cuándo nace la comanda | **Al agregar** (`status='new'`), no al pulsar «Enviar» | `pedidosService.ts:418-482` |
| «Enviar comanda» | Solo sella `printed_at` (lectura + `update` desde el navegador) e imprime | `pedidosService.ts:637-686`; `[id]/page.tsx:689-775` |
| Estación | `estacionEfectiva` en el navegador (propia → padre → categoría), igual a `fn_estacion_efectiva` | `lib/pos/estacionEfectiva.ts:37-39`; `AddProductDialog.tsx:165-169`, `:277` |
| Qué va a cocina | Mesa: `requires_preparation` **o** estación; mostrador: solo `requires_preparation` | `pedidosService.ts:423-426` vs `lib/pos/venta/enviarCocina.ts:71-76` |
| Impresión | `PrintJobsService.enqueueKitchenTicket` por estación; si no, navegador. Consolida la ronda y la de ajuste en un solo papel sin encabezado «AJUSTE» e ignora las estaciones sin impresora | `[id]/page.tsx:707-764`; `lib/services/printJobsService.ts:399-468` |
| Rondas idempotentes | `pos_cocina_enviar_ronda` + `round_key` existen pero **solo los usa el mostrador** (0 comandas con `round_key` en la base) | `lib/pos/venta/enviarCocina.ts:109-126`; MCP |
| Comanda de ajuste | **Existe**: restar o anular un plato ya enviado pide motivo (mín. 3) y genera comanda `adjustment` (RPC `pos_cocina_ajustar_linea_mesa`, con auditoría) | `OrderItemCard.tsx:28-47`, `:143-158`; `components/pos/cocina/cocinaCliente.ts:79-86`; `app/api/pos/cocina/mesa-linea/route.ts:36-42` |
| Tiempo real | Canal a `kitchen_ticket_items` **por organización** (cualquier cambio de cocina recarga esta mesa; la tabla ni siquiera está publicada) y a `kitchen_tickets` por sesión | `[id]/page.tsx:124-156`; publicación `supabase_realtime` (MCP) |

### 2.5 Seguir agregando rondas — **A medias**

Cada «Agregar producto» es de hecho una ronda, pero no hay número de ronda ni agrupación en la
cuenta: `OrderItemCard` muestra por línea el estado de cocina del último `kitchen_ticket_items`
(`OrderItemCard.tsx:83-89`). El diseño aprobado de rondas (`852:95110`, `CartLine v3` con
`por-enviar/en-cocina/preparando/lista`) no está implementado.

### 2.6 Mover, unir, transferir y dividir

| Qué | Estado | Evidencia |
|---|---|---|
| Mover la cuenta completa (`MoverPedidoDialog`) | **A medias**: solo desde el plano, no desde el detalle; dos `update` sin transacción; un `update` de `kitchen_tickets` no hace nada | `app/app/pos/mesas/page.tsx:568`, `:910-915`; `mesasService.ts:696-737` (`:722-726`) |
| Unir mesas (`CombinarMesasDialog`) | **A medias**: desde el encabezado del detalle; mueve sesiones y libera las demás. La mesa unida suma líneas de varias ventas pero **cobra solo `session.sale_id`** | `[id]/page.tsx:800-844`, `:1844-1849`; `mesasService.ts:590-632`; `pedidosService.ts:58-86` |
| Transferir productos (`TransferItemDialog`) | **A medias**: ofrece mesas libres que el servicio rechaza; si el destino no tiene venta deja la línea con `sale_id = null`; no mueve la cocina | `TransferItemDialog.tsx:61`, `:102-103`; `pedidosService.ts:710-798` |
| Dividir: por ítems | **Existe** | `SplitBillDialog.tsx:209-497` |
| Dividir: partes iguales / montos | **Roto**: reparte las unidades por turnos (`autoAssignItemsRoundRobin`) y el cobro va por esos platos, no por el monto de cada parte | `SplitBillDialog.tsx:180-186`; `[id]/page.tsx:1136-1205` |
| Dividir: por comensal | **No existe** como modo: las partes se llaman «Comensal N» pero no se precargan con el `guest_number` de cada línea | `SplitBillDialog.tsx:62-74` |
| Pagar cada parte | `SplitPaymentSelector` + `settle` con `split_id` y `paid_sale_item_ids` | `[id]/page.tsx:1059-1082`, `:1259-1267` |

### 2.7 Pre-cuenta — **Existe**

`PreCuentaDialog` con líneas, variantes, modificadores, comensal, nota para el cliente, subtotal,
descuento, impuesto y total; se imprime sola al abrirla (estación `cashier` o navegador)
(`PreCuentaDialog.tsx:88-175`; `[id]/page.tsx:538-644`). Huecos: la hora es la del navegador sin la
zona de la organización (`PreCuentaDialog.tsx:180-183`, `[id]/page.tsx:567`); incluye líneas ya
pagadas (`pedidosService.ts:573-574`); el interruptor de factura electrónica se descarta
(`[id]/page.tsx:1774-1777`); no muestra cargo de servicio ni propina sugerida (diseño aprobado
`880:114048` sin implementar).

### 2.8 Cobrar — **Existe (cobro), A medias (alrededor)**

El cobro es el `CheckoutDialog` del POS (`[id]/page.tsx:35`, `:1794-1826`) con un carrito armado
desde la sesión (`convertSessionToCart`, `:957-1011`) y `POSService.checkout` en modo `settle`
(`:1059-1082`): una transacción idempotente que valida la sesión y los precios, registra pagos,
factura, propina, comisión, stock y seriales (`POS-COBRO-SERVIDOR.md` §1).

| Qué | Estado | Evidencia (en `components/pos/CheckoutDialog.tsx` salvo otra ruta) |
|---|---|---|
| Métodos activos de la organización | **Existe** (`organization_payment_methods`, 5 botones + «Otro», Alt+1…5) | `:646-658`, `:1987-1997`; `lib/services/posService.ts:1819-1856` |
| Pago mixto | **Existe** | `:1037-1055`, `:2001-2062` |
| Pago parcial (abono) | **No existe** en el cobro; en la mesa, solo con la cuenta dividida | `lib/pos/venta/cobro/cuentasCobro.ts:12-13`, `:63` |
| Cambio | **Existe** | `:265-269`, `:1921` |
| Propina con mesero | **Existe** y ahora entra a `tips` (el `settle` la inserta). La mesa **no preselecciona su mesero** | `:2122-2213`; `supabase/migrations/20260925140200_pos_deuda_cobro_y_anulacion.sql:311-312`; `:161` |
| Cargo de servicio | **No existe** en el cobro (15 cargos activos configurados, ninguno se aplica) | 0 coincidencias; MCP |
| Descuentos | Solo se muestran; no hay `DialogoDescuento` en la mesa | `:1913` |
| Cupones | **No existe** en el cobro | 0 coincidencias |
| Promociones | **A medias**: se aplican al pedir, se omiten en el cobro | `pedidosService.ts:307-331`; `posService.ts:1538-1541` |
| Autorización de supervisor | **No existe** en el cliente (solo el enganche `fn_pos_autorizar_descuento` en el servidor) | MCP |
| Factura electrónica | **Existe** (interruptor, estado «no configurada», envío tras la venta) | `:2274-2297`, `:1707-1731`, `:1380-1502` |
| QR y pasarelas | **Existe** (Redeban, Bre-B, Bancolombia/Wompi, Bold); el botón no sale para `bold_qr` ni `bold_link` | `:780-908`, `:2024-2045`, `:2027` |
| Entrega y comisión | Aparecen también al cobrar una mesa (no hay forma de ocultarlas) | `:2078-2120`, `:2215-2272` |
| Caja abierta | La página exige caja siempre; el diálogo solo si `require_cash_session` | `MesaActionsSidebar.tsx:295`, `:306-310`; `CheckoutDialog.tsx:436-454` |

### 2.9 Cerrar y liberar la mesa — **Existe (liberar), No existe («por limpiar»)**

Tras cobrar, `liberarTrasCobro` → `MesasService.liberarMesa` → ruta `liberar` → RPC `pos_mesa_liberar`
(verifica saldo 0; con saldo abre `LiberarMesaDialog`: cobrar, pasar a cartera o anular con
`pos.void`) (`[id]/page.tsx:942-954`, `:1316-1419`; `app/api/pos/mesas/[id]/liberar/route.ts:39-147`;
`supabase/migrations/20260924191500_pos_mesa_liberar_con_saldo.sql:245-528`). La mesa vuelve directo a
`free` (`:511`): el estado «por limpiar» no existe (`CHECK` de `restaurant_tables.state`:
`free/occupied/reserved`). Cuenta dividida: libera con un `setTimeout` de 1,5 s (`[id]/page.tsx:1363`).

### 2.10 Anular ítems o la comanda con motivo — **A medias**

Restar o quitar un plato enviado pide motivo y manda la comanda de ajuste (§2.4). Falta: permiso o
**autorización de supervisor** (la ruta `mesa-linea` solo valida pertenencia, `route.ts:29-50`); la
RPC **permite ajustar líneas ya pagadas** (`20260925100000_...sql:540-553`); todo plato con
preparación cuenta como «enviado» aunque no se haya enviado (`OrderItemCard.tsx:78-81`). No hay
«anular comanda completa» desde la mesa (sí desde Comandas v2, propuesta `961:279025`).

### 2.11 Casos

| Caso | Hoy | Evidencia |
|---|---|---|
| Mesa sin caja abierta | «Procesar pago» deshabilitado con «Debe abrir una caja…»; `?cobrar=1` avisa. Pero pre-cuenta → «Generar cuenta» y «Solicitar cuenta» con 1 comensal abren el cobro **sin mirar la caja** | `MesaActionsSidebar.tsx:295-310`; `[id]/page.tsx:1118-1133`, `:677`, `:1774-1777` |
| Sin conexión | **No existe** en la mesa; en Desktop el cobro de mesa sin red lanza un texto crudo | `components/pos/mesas/id/README.md:407`; `posService.ts:1770-1772` |
| Mesa abandonada | **No existe** aviso ni cierre: 23 de 23 sesiones abiertas llevan más de 24 h | MCP |
| Cobro fallido | Idempotente (el reintento no duplica). Si el cobro sale y falla la liberación, dice «Error al completar pago» → riesgo de volver a cobrar | `CheckoutDialog.tsx:1506-1523`; `[id]/page.tsx:1400-1417` |
| Sin permiso | No hay ningún permiso de mesas en la interfaz; solo `pos.void` al anular la venta al liberar | `route.ts:59-61` |

---

## 3. Base de datos (verificado hoy con el MCP)

| Tabla | Columnas que importan | Observación |
|---|---|---|
| `table_sessions` | `restaurant_table_id`, `sale_id`, `server_id` NOT NULL, `customers`, `status`, `opened_at`, `closed_at`, `branch_id` | `status` CHECK `active/bill_requested/completed`. Sin UNIQUE «una abierta por mesa» (hoy 1 mesa con 2). Sin `reservation_id` |
| `restaurant_tables` | `state` | CHECK `free/occupied/reserved` (sin `cleaning`) |
| `kitchen_tickets` | `status` (+`cancelled`), `ticket_type` `order/adjustment`, `adjusts_ticket_id`, `round_key`, `cart_id`, `has_allergy`, `allergy_ack_at/by` | Nuevas columnas de rondas y alergia: 205 comandas, **0** con `round_key`, **0** de ajuste, **0** con alergia |
| `kitchen_ticket_items` | `adjustment_kind` (`increase/decrease/void/note`), `quantity_delta`, `adjustment_reason`, `is_allergy`, `cancel_reason` | 294 ítems, ninguno de ajuste |
| `sale_items` | `paid_at`, `paid_by_split_id`, `tax_rate`, `tax_included`, `notes jsonb` | 6 líneas pagadas por partes |
| `sales` | `table_session_id`, `tip_amount`, `tip_server_id`, `reservation_id` (PMS), `delivery_fee` | Sin columna de cargo de servicio |
| `tips` | `sale_id`, `server_id` NOT NULL, `amount`, `tip_type` | 0 propinas de mesa (el camino nuevo aún no se ha usado: `pos_cobros` = 0) |
| `service_charges` | `applies_to` (`dine_in` 30, `delivery` 15), `is_optional` | 15 activos; ninguno se cobra |
| `restaurant_reservations` | `status` (6), `source` (4) | 0 filas |
| `pos_quick_notes` | — | Existe (notas rápidas del mostrador) |
| Tablas que **no** existen | `table_combinations`, cargo de servicio por venta, comensales, estaciones configurables | — |

RPC vivas del flujo: `pos_checkout_v1(jsonb)`, `pos_mesa_recalcular_venta(uuid)`,
`pos_mesa_resumen_liberacion(int, uuid)`, `pos_mesa_liberar(int, uuid, uuid, text, text, bool)`,
`fn_pos_mesa_saldo(uuid)`, `pos_cocina_enviar_ronda(int, uuid, jsonb)`,
`pos_cocina_ajustar_linea_mesa(int, uuid, uuid, numeric, text)`, `pos_cocina_confirmar_alergia`,
`pos_anular_venta_v1(uuid, text)`, `fn_pos_autorizar_descuento`. **No existen** RPC para abrir la
mesa, mover, unir, transferir ni sentar una reserva.

Realtime (`supabase_realtime`): `kitchen_tickets` y `notifications`; **no** `kitchen_ticket_items`,
`table_sessions`, `restaurant_tables` ni `sale_items`.

Uso: 22 sesiones `active`, 1 `bill_requested`, 139 `completed`; 23 abiertas con más de 24 h, 0 del
último día; 52 ventas de mesa `paid` enlazadas por `sales.table_session_id`.

---

## 4. Errores encontrados

Ordenados por gravedad. Los marcados **(nuevo)** no estaban en los documentos anteriores.

| # | Error | Efecto | Evidencia |
|---|---|---|---|
| E1 | **Cuenta dividida: la línea se marca pagada entera** aunque la parte lleve solo 1 de 3 unidades; en partes iguales/montos se reparten platos por turnos **(nuevo)** | Saldo 0 con dinero sin cobrar; la mesa se libera | `SplitBillDialog.tsx:180-186`; `[id]/page.tsx:1072`; `20260925140300_...sql:296-301`; `20260924191500_...sql:109-111` |
| E2 | La comanda nace al agregar; «Enviar» solo imprime; la mesa no usa `pos_cocina_enviar_ronda` | Cocina prepara lo que el mesero aún no confirmó; doble impresión si dos envían a la vez | `pedidosService.ts:418-482`, `:637-686` |
| E3 | El cliente normal no se guarda en la venta; al cobrar se conserva el anterior **(nuevo)** | Factura a nombre equivocado o sin cliente | `[id]/page.tsx:1430-1434`; `20260925140300_...sql:283-285` |
| E4 | Mesa unida: suma varias ventas pero cobra una **(nuevo)** | Saldo que no cuadra; `varias_ventas_con_saldo` al liberar | `pedidosService.ts:58-86`; `[id]/page.tsx:1066` |
| E5 | El cobro de cada parte usa precio × cantidad, sin descuento ni impuesto de la línea **(nuevo)** | Parte con importe distinto del que se ve | `[id]/page.tsx:1145-1200` |
| E6 | `SplitBillDialog` recibe líneas ya pagadas (D6 sigue) | Se puede volver a asignar lo pagado | `[id]/page.tsx:1855` |
| E7 | La RPC de ajuste permite cambiar o anular líneas pagadas **(nuevo)** | Cuenta pagada que cambia | `20260925100000_...sql:540-553` |
| E8 | Anular un plato enviado sin permiso ni supervisor | Cualquiera anula | `app/api/pos/cocina/mesa-linea/route.ts:29-50` |
| E9 | Reserva «sentada» sin sesión; completar/cancelar libera la mesa aunque otra cuenta la ocupe (B18) | Mesa «ocupada» sin cuenta, o libre con cuenta | `reservasMesasService.ts:328-341` |
| E10 | Cobro ok + liberación fallida = «Error al completar pago» | Riesgo de cobrar dos veces | `[id]/page.tsx:1400-1417` |
| E11 | Dos caminos abren el cobro sin revisar caja ni división | Cobro sin caja | `[id]/page.tsx:677`, `:1774-1777` |
| E12 | El total del cobro puede no coincidir con el de la columna (la mesa pone `tax_rate: 0` y el diálogo recalcula) | «Falta» o cambio falsos | `[id]/page.tsx:968`; `CheckoutDialog.tsx:950-997`, `:462-464` |
| E13 | `abrirSesion`/`agregarProductos` sin transacción ni `branch_id`; `maybeSingle` con mesas unidas crea otra sesión | Sesiones y ventas huérfanas | `mesasService.ts:364-429`; `pedidosService.ts:259-291` |
| E14 | Transferir a mesa sin venta deja `sale_id = null`; el diálogo ofrece mesas libres que fallan | Línea perdida | `pedidosService.ts:728-743`; `TransferItemDialog.tsx:61` |
| E15 | Mismo producto con otros modificadores pierde los nuevos | Plato mal preparado | `AddProductDialog.tsx:270-274` |
| E16 | Folio del hotel con «pago directo» registra un pago completado mientras la mesa sigue con saldo | Cobro doble | `[id]/page.tsx:407-417` |
| E17 | Tiempo real por organización recarga la mesa (y borra los montos del diálogo de dividir) por cualquier cambio de cocina | Parpadeo y datos perdidos | `[id]/page.tsx:134-137`; `SplitBillDialog.tsx:77-100` |
| E18 | Pre-cuenta: hora del navegador, incluye pagado, descarta la factura electrónica | Papel incorrecto | §2.7 |
| E19 | La propina no preselecciona el mesero de la mesa | Propina sin mesero o del equivocado | `CheckoutDialog.tsx:161` |
| E20 | Texto cableado en español en el detalle (toasts, títulos, «Pedido Actual»), colores de Tailwind a mano, emoji «👤» y «✓» | Contra 4 idiomas y el manual | `[id]/page.tsx:423-437`, `:1633`; `OrderItemCard.tsx:219` |

---

## 5. Qué reutiliza del POS de mostrador y qué duplica

| Pieza | Mostrador | Mesa | Veredicto |
|---|---|---|---|
| Cobro (`CheckoutDialog` → `CobroPanel`, `ResumenCobro`, `EditorPagoCobro`, `EntregaCobro`, `PostVenta`, `SelectorMetodoPago`) | sí | sí (`[id]/page.tsx:35`) | **Reutiliza** |
| Cobro en el servidor (`POSService.checkout` → `pos_checkout_v1`) | `sale` | `settle` | **Reutiliza** |
| Cliente (`CustomerSelector` → `CustomerPicker`) | sí | sí (`MesaActionsSidebar.tsx:9`) | **Reutiliza** (pero no guarda, E3) |
| Variantes y modificadores (`VariantSelectorDialog`) | sí | sí (`AddProductDialog.tsx:20`) | **Reutiliza** |
| Barra de categorías (`CategoryFilterBar`) | sí | sí (`AddProductDialog.tsx:22`) | **Reutiliza** |
| Estación (`estacionEfectiva`), impresión (`PrintJobsService`) | sí | sí | **Reutiliza** |
| Liberar con saldo (kit `Dialogo`, `StatusBadge`) | — | `LiberarMesaDialog.tsx:6` | Kit |
| Grilla de productos (`GrillaProductos`, `ProductSearch`, `ProductCard`) | sí | grilla propia en `AddProductDialog` | **Duplica** |
| Carrito (`PanelCarrito`, `LineasCarrito`, `CartLine`) | sí | carrito del diálogo + `OrderItemCard` | **Duplica** |
| Nota de línea (`EditorNotaLinea` + `ChipsNotasRapidas`) | sí | `RichTextEditor` (HTML) sin chips | **Duplica** |
| Descuento (`DialogoDescuento`, `EditorDescuentoLinea`) | sí | no hay | **Falta** |
| Enviar a cocina (`enviarCocina.ts` → `pos_cocina_enviar_ronda`) | sí | `pedidosService.enviarComandaCocina` | **Duplica** |
| Impuestos (`resumenImpuestos.ts`) | sí | `useMesaTaxes` / `MesaTaxBreakdown` | **Duplica** |
| Acciones (`AccionesCarrito`, `CobrarButton`) | sí | `MesaActionsSidebar` | **Duplica** |
| Cargando (`Skeleton` del kit) | sí | bloques a mano (`[id]/page.tsx:1529-1571`) | **Duplica** |
| Diálogos de comensales y mesero | — | `Dialog` a mano (`[id]/page.tsx:1874-1991`) | Propio |

La propuesta de Figma (§7) elimina las duplicaciones: la mesa **es una pestaña del carrito del POS**
(`CartPanel Variant=mesa`, aprobado en `POS-CARRITO-LINEAS-NOTAS.md`) sobre el mismo catálogo
(`PosProductSearch`), como ya decía `POS-MESAS-COMANDAS-RESERVAS.md` §3 («el carrito elegido del POS
v2 con la pestaña Mesa 4»).

---

## 6. Propuesta: el flujo en una línea

La mesa **no es una pantalla aparte**: es una pestaña del carrito del POS («Mesa 4 · Cuenta», el
`CartPanel Variant=mesa` ya aprobado) sobre el mismo catálogo (`PosProductSearch`). Así la mesa gana
de una vez las notas rápidas, el descuento, los atajos, el carrito v2 y el cobro v2, y se borran
`AddProductDialog`, `OrderItemCard`, `MesaActionsSidebar` y `useMesaTaxes`.

1. **Abrir** desde el plano (aprobado en `870:98618`): comensales, mesero, cliente opcional y la
   reserva que llega, en una RPC `pos_table_open`.
2. **Cliente**: arranca en «Consumidor final»; «Cambiar · F2» con el `CustomerPicker` del POS; se
   guarda en la venta al elegirlo.
3. **Agregar**: lo nuevo queda «Por enviar»; variantes y modificadores con el diálogo del
   mostrador; nota, notas rápidas, alergia y comensal («General» por defecto) en la línea.
4. **Enviar**: cada envío es una ronda (`pos_cocina_enviar_ronda`, idempotente) por estación.
5. **Rondas**: la cuenta agrupa por ronda con su estado; la nota de la mesa viaja con cada ronda.
6. **Mover**: un diálogo con tres modos (toda la cuenta · algunos productos · unir), RPC
   `pos_table_move`.
7. **Dividir**: por comensal (precargado), por productos (se parten unidades) o partes iguales por
   **monto**; cada parte se cobra aparte y la mesa se libera cuando el servidor dice saldo 0.
8. **Pre-cuenta** con cargo de servicio y propina sugerida (diseño aprobado `880:114048`).
9. **Cobrar** con el `CheckoutDialog v2`, con cargo de servicio y el mesero de la mesa en la
   propina; sin Entrega ni Comisión en mesas.
10. **Cerrar**: la mesa pasa a «Por limpiar»; con saldo, el diálogo de liberar que ya existe.
11. **Anular** lo enviado: motivo siempre y, si la organización lo protege, PIN de supervisor.

---

## 7. Figma

Archivo `EAvjINVRnlzFM70GVoWXgl`. Enlace de cada nodo:
`https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=<id con guion>`.

### 7.1 Sección nueva

**«POS — Mesas: flujo completo de atención (propuesta)»** —
[`1073:666953`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1073-666953) en
`05 POS y ventas`, en x = 0, y = 117.011, 13.580 × 9.114, **justo debajo** de «POS — Mesas:
cuadrícula y plano» (`870:98618`, que termina en y = 116.611). Las 10 secciones que estaban debajo
(«Reservas de mesas» y siguientes) se bajaron 8.754 px para dejar 400 de aire; ninguna se solapa.
Enlazada en el Índice (`264:98920`, columna 2, línea «25. Mesas — flujo completo de atención
(propuesta)» con hipervínculo a la sección).

Cada pantalla lleva encima, **fuera del frame**, una nota gris (paso, qué muestra, «Reutiliza: …»)
y, si algo no existe en el código, una nota amarilla con la insignia «Propuesta» y la evidencia
(archivo:línea).

| Pieza | Node id |
|---|---|
| Mapa del flujo (12 pasos, estado de hoy y a qué frames lleva cada uno) | [`1073:666956`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1073-666956) |
| Tabla «componente → dónde se reutiliza» | [`1073:667179`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1073-667179) |

### 7.2 Pantallas

**Escritorio 1440**

| Frame | Paso | Node id | Estado en el código |
|---|---|---|---|
| D1 · Mesas — abrir la Mesa 7 (comensales, mesero, cliente, reserva) | 1 | [`1073:668206`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1073-668206) | Propuesta |
| D2 · Mesa 4 — cambiar el cliente | 2 | `1073:668472` | Propuesta (consumidor final, guardar) |
| D3 · Mesa 4 — agregar productos (catálogo del POS + cuenta) | 3 | `1073:668900` | Propuesta (pestaña del carrito) |
| D4 · Mesa 4 — variantes y modificadores | 3 | `1073:669159` | Existe |
| D5 · Mesa 4 — enviar la ronda (+ cómo llega a Comandas v2) | 4 | `1073:669441` | Propuesta |
| D6 · Mesa 4 — rondas y nota de la mesa | 5 | `1073:669777` | Propuesta |
| D7 · Mesa 4 — mover productos a otra mesa | 6 | [`1073:670023`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1073-670023) | Propuesta |
| D8 · Mesa 4 — dividir por comensal | 7 | `1075:117228` | Propuesta |
| D8b · Mesa 4 — cobrar por partes | 7 | [`1075:117464`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1075-117464) | Propuesta |
| D9 · Mesa 4 — pre-cuenta con cargo y propina (+ impresa 80 mm) | 8 | `1075:117822` | Existe a medias |
| D10 · Mesa 4 — cobrar (el mismo cobro del POS) | 9 | [`1075:118127`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1075-118127) | Existe (falta cargo de servicio) |
| D11 · Mesa 4 — cobrada, pasa a «Por limpiar» | 10 | `1075:119241` | Propuesta («por limpiar») |
| D12 · Mesa 4 — liberar con saldo pendiente | 10 | [`1075:120281`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1075-120281) | Existe |
| D13 · Mesa 4 — quitar un plato ya enviado (motivo + ajuste en cocina) | 11 | `1075:120599` | Existe |
| D14 · Mesa 4 — autorización de supervisor al anular | 11 | `1075:120995` | Propuesta |

**Tableta 1024 (la del mesero)**

| Frame | Node id |
|---|---|
| T1 · Mesas — abrir la Mesa 7 | `1077:124767` |
| T2 · Mesa 4 — tomar el pedido | [`1077:124909`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1077-124909) |
| T3 · Mesa 4 — nota, alergia y comensal de la línea | [`1077:125808`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1077-125808) |
| T4 · Mesa 4 — ronda enviada | `1077:126806` |
| T5 · Mesa 4 — menú ⋯ de la mesa (todas las acciones) | `1077:127714` |
| T6 · Mesa 4 — dividir por comensal | [`1077:128719`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1077-128719) |
| T7 · Mesa 4 — cobrar | `1077:129695` |
| T8 · Mesas — Mesa 4 cobrada, «Por limpiar» | `1077:130730` |

**Estados (tableta 1024)**

| Frame | Node id |
|---|---|
| S1 · recién abierta, sin productos | `1078:131158` |
| S2 · cargando | `1078:131873` |
| S3 · error al cargar | `1078:132193` |
| S4 · sin caja abierta | [`1078:132437`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1078-132437) |
| S5 · sin conexión (ronda en cola) | `1078:133108` |
| S6 · sin permiso | `1078:133382` |
| S7 · mesa abierta hace 26 h | `1078:133630` |
| S8 · cobro rechazado | `1078:133889` |

**Móvil 390 (pasos clave)**

| Frame | Node id |
|---|---|
| M1 · Mesas — tocar una mesa (hoja) | `1080:162922` |
| M2 · Mesa 4 — tomar el pedido | `1080:162972` |
| M3 · Mesa 4 — la cuenta (hoja) | `1080:163247` |
| M4 · Mesa 4 — nota y alergia (hoja) | `1080:163673` |
| M5 · Mesa 4 — pre-cuenta (hoja) | [`1080:164174`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1080-164174) |
| M6 · Mesa 4 — cobrar | `1080:164520` |
| M7 · Mesa 4 — cobrada | `1080:164793` |

### 7.3 Componentes nuevos (solo los que no existían)

En `02 Componentes`, sección nueva **«POS — Mesas: flujo de atención (Nuevo 2026-09-28)»**
([`1073:667282`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1073-667282),
x = 89.000, y = 110.000). No se tocó ningún componente existente.

| Componente | Node id | Variantes | Para qué |
|---|---|---|---|
| `Comensal` | `1073:667312` | `Tipo=numero/general` × `Estado=default/seleccionado` · texto «Etiqueta» | Elegir a quién va una línea («General», C1…C8) |
| `CuentaDividida` | `1073:667363` | `Estado=pendiente/cobrando/pagada` · textos «Título», «Detalle», «Importe» | Una parte de la cuenta dividida, con su botón de cobro |
| `AvisoMesa` | `1073:667432` | `Tono=advertencia/peligro/informacion/neutro` · icono, «Título», «Descripción», botón «Acción» | Avisos de la mesa: reserva que llega, saldo, sin caja, sin conexión, mesa abandonada. El kit no tenía un aviso en línea (Alert/Banner) |

Colores ligados a variables del archivo (Light/Dark), iconos del kit, `Badge` y `Button` como
instancias.

### 7.4 Tabla «componente → dónde se reutiliza»

| Componente (kit o diseño aprobado) | Node id | Pantallas |
|---|---|---|
| `Sidebar Mode=rail` · `AppHeader` | `44:3039` · `45:2224` | D1–D14, T1–T8, S1–S8 |
| `MobileHeader` · `MobileTabBar` | `48:2550` · `57:3101` | M1–M7 |
| `PosProductSearch` (SearchBar, CategoryBar, ProductCard pos) | `155:7745` | D2–D14 (el catálogo de la mesa es el del POS) |
| `ProductCardMovil Variant=lista` · `CategoryBar` · `SearchBar` | `270:9913` · `115:5217` · `104:3468` | T2–T6, S1, S4, S5, S7, S8, M2 |
| `CartPanel Variant=mesa` (CartLine v3, CobrarButton, KbdButton, CartTag) | `849:31653` | D2–D9, D12–D14, T2–T7, S4, S5, S7, S8 |
| `CartPanel Variant=vacío` | `849:31653` | S1 |
| `CustomerPicker` (field · popover results) | `192:11644` | D1, D2 |
| `VariantModifierDialog` | `155:7980` | D4 |
| `LineNoteEditor` · `LineNote` | `847:30394` · `845:558032` | T3, M4 |
| `OrderNotePanel` | `847:30744` | D6 |
| `ComandaKDS v2` (con `ComandaItemKDS`, `EstacionChip`) | `953:195581` | junto a D5 (nueva, alergia) y D13 (ajuste) |
| Plano aprobado (`MesaPlano`, `LeyendaEstadosMesa`, `SelectorVista`, `SelectorDensidad`) | clones de `870:103527` y `870:576130` | D1, T1, T8 |
| `MesaCard Densidad=compacta` | `868:31742` | D7, M1 |
| `TiempoTranscurrido` · `Avatar` · `Badge` | `680:410531` · `7:44` · `7:70` | cabecera de la mesa en T2–T7 y S1–S8 |
| `SegmentedControl` · `Select` · `Chip` · `Checkbox` | `103:3064` · `103:3174` · `103:3013` · `50:2695` | D1, D7, T1, T3, T6 |
| `MenuItem` | `10:239` | T5 |
| `FilaDato` | `680:406357` | D8b, D12, M5 |
| `CheckoutDialog v2` (CheckoutAccordion, CobrarButton, KbdButton) | clon de `505:86668` / `505:86773` | D10, T7 |
| Móvil v2: cobro y post-venta | clones de `250:82123` y `250:83088` | M6, M7 |
| POS móvil v2: productos y carrito | clones de `250:81342` y `250:81432` | M2–M5 |
| `CargoServicioFila` · `AvisoPropinaVoluntaria` | `878:32064` · `878:32120` | D9 (clon de `880:114048` y `880:113991`), M5 |
| Post-venta v2 (`ResultadoOperacion`) | clon de `247:74846` | D11 |
| `ConfirmDialog` + `FormField` (el `DialogoMotivo` del kit) | clon de `331:54986` | D13 |
| `AutorizacionSupervisor Estado=pin` | `893:582887` | D14 |
| `Toast` | `108:4418` | D3, D5, T4, T8, S5, S8 |
| `EmptyState` · `Skeleton` | `106:3543` · `106:3394` | S2, S3, S6 |
| `Comensal` (Nuevo) | `1073:667312` | T3 |
| `CuentaDividida` (Nuevo) | `1073:667363` | D8b, T6 |
| `AvisoMesa` (Nuevo) | `1073:667432` | D1, T1, D12, S4, S5, S7 |

### 7.5 Chequeo por script

| Comprobación | Resultado |
|---|---|
| Hijos de primer nivel de la sección que se solapan (84: frames, notas, mapa, tabla y columnas «así llega a cocina») | **0** |
| Nodos fuera de la sección · secciones de la página que se solapan con la nueva | **0** · **0** |
| Instancias rotas (`getMainComponentAsync` nulo) en la sección y en la de componentes | **0** de 5.969 |
| Textos recortados | 2 detectados: la etiqueta «Plantilla ortopédica (+$ 25.000)» heredada del frame aprobado `852:96851`; se cambió por «Patacón (+$ 3.000)», que cabe. Los recortes que quedan son intencionales: catálogo y cuenta de la tableta (la cuenta oculta las rondas de abajo como si hiciera scroll), barra de categorías y el móvil bajo su hoja |
| Notas dentro de frames | **0** |
| Nombres reales de organización | **0**: las palabras de los textos de ambas secciones se cotejaron por SQL contra `organizations.name` y `legal_name`; solo coinciden palabras genéricas («hotel», «admin», «descuento», «todo»). Ejemplos usados: «Mesa 4 · Terraza», «Ana Gómez», «Carlos Ruiz», «Mi empresa S.A.S.» (del kit) |

Correcciones hechas durante la tanda: la propiedad «Texto» del `Badge` del kit **no llega a la capa
de texto** en varias variantes (mostraba «Ultimate» o «Pagado» por defecto): se sobrescribió la capa
en cada insignia nueva y en `CuentaDividida`; el velo del cobro aprobado (`505:86772`) es opaco y
el de esta sección quedó al 55 %; el catálogo de ejemplo del kit (calzado) se cambió por platos en
todos los frames de la sección; en el clon de `852:96851` (D4) el diálogo y el velo estaban fuera del
frame (x = 2.880) y se centraron.

### 7.6 Capturas (`docs/design/figma/`)

`78-mesas-flujo-seccion.png`, `78-mesas-flujo-mapa.png`, `78-mesas-flujo-tabla-reutiliza.png`,
`78-mesas-flujo-componentes.png`, `78-mesas-flujo-d1-abrir.png`, `78-mesas-flujo-d7-mover.png`,
`78-mesas-flujo-d8b-cobrar-partes.png`, `78-mesas-flujo-d12-liberar-saldo.png`,
`78-mesas-flujo-t3-nota-comensal.png`, `78-mesas-flujo-t6-dividir.png`,
`78-mesas-flujo-s4-sin-caja.png`, `78-mesas-flujo-m5-precuenta.png`.

### 7.7 Pendiente / a revisar

1. **T7**: el cobro de tableta es el `CheckoutDialog v2` de escritorio a escala 0,87 (1.120 px no
   caben en 1.024). Si se aprueba, conviene una variante de 960 px del diálogo.
2. **M2–M5**: la cabecera móvil del POS (`MobileHeader Mode=pos`) no tiene título; muestra sucursal y
   caja. Para la mesa haría falta «Mesa 4 · Terraza» en esa cabecera (cambio del componente del kit:
   no se tocó).
3. **`Badge` del kit** (`7:70`): su propiedad «Texto» no está ligada a la capa en todas las
   variantes; hay que arreglarla en el componente (afecta a todo el archivo). No se tocó.
4. El índice de `05 POS y ventas` salta números (19 repetido, faltan secciones recientes); se añadió
   solo la línea 25 de esta sección.

---

## 8. Cambios de backend y BD necesarios (no aplicados)

Se suman a los de `POS-MESAS-COMANDAS-RESERVAS.md` §7 y `POS-MESAS-VISTAS.md` §5; aquí solo lo que
pide este flujo. Todos aditivos, con `.sql` y reversión (`docs/POLITICA-MIGRACIONES.md`).

1. **Cuenta dividida (E1, urgente)**: pagar **unidades** de una línea (partir la línea en el
   servidor antes de marcarla) y partes por **monto** sin marcar líneas; el saldo sale de los pagos,
   no de `paid_at`. Rechazar `paid_sale_item_ids` que no cubran la línea entera.
2. **Cliente de la venta (E3)**: guardar `sales.customer_id` al elegirlo (RPC con pertenencia) y que
   `pos_checkout_v1` en `settle` acepte **cambiar** el cliente mientras no haya factura electrónica.
3. **Rondas en la mesa (E2)**: que la mesa use `pos_cocina_enviar_ronda` con `round_key`; las líneas
   nuevas nacen sin comanda («por enviar»).
4. **RPC `pos_table_open`** (mesa, comensales, mesero, cliente?, reserva?) y columna
   `table_sessions.reservation_id`; **`pos_table_move`** (mover, transferir con su impuesto y
   descuento, unir) en una transacción.
5. **`pos_cocina_ajustar_linea_mesa`** rechaza líneas pagadas o de ventas `paid`/`void` (E7) y
   comprueba el permiso o la autorización de supervisor (E8).
6. **Cargo de servicio** en `pos_checkout_v1` (especificado en `POS-CARGOS-SERVICIO-EN-VENTAS.md` §6).
7. **Estado `cleaning`** en el `CHECK` de `restaurant_tables.state`; `pos_mesa_liberar` deja la mesa
   ahí.
8. **Consumidor final**: un cliente por organización creado al activar el POS, usado por defecto en
   mesa y mostrador.
9. **Realtime**: publicar `kitchen_ticket_items`, `table_sessions` y `sale_items`, y filtrar el canal
   de la mesa por sesión (E17).

---

## 9. Preguntas para el dueño (con recomendación)

1. **¿La mesa se atiende dentro del POS, como una pestaña del carrito, y se retira la pantalla
   aparte de la mesa?** Recomendación: **sí**. Es lo que ya aprobó el carrito de mesa
   (`CartPanel Variant=mesa`) y elimina cuatro duplicados; el plano sigue siendo la entrada.
2. **Cuenta dividida en partes iguales: ¿una sola factura con varios pagos o una factura por
   comensal?** Recomendación: **una factura y varios pagos** por defecto; factura por comensal solo
   si el comensal la pide con sus datos (factura electrónica a su nombre), como opción de la parte.
3. **¿Crear «Consumidor final» automáticamente en cada organización?** Recomendación: **sí**, con el
   documento de consumidor final de la DIAN, y que sea el cliente por defecto de mesas y mostrador.
4. **¿Anular un plato ya enviado exige PIN de supervisor?** Recomendación: **motivo siempre; PIN
   configurable, apagado por defecto** (el mismo interruptor de `POS-AUTORIZACION-SUPERVISOR.md`).
5. **¿El mesero cobra desde la tableta o el teléfono?** Recomendación: **desde la tableta sí** si la
   organización usa caja por usuario o datáfono inalámbrico; desde el teléfono, solo pre-cuenta y
   pedir la cuenta.
6. **Mesa abandonada: ¿qué umbral y qué hacer?** Recomendación: aviso a las **4 h** en el plano y en
   la mesa, lista en el cierre de caja y **nunca** cierre automático (el saldo lo decide una persona).
   Con eso, resolver las 23 sesiones abiertas de más de 24 h que hay hoy.
7. **«Por limpiar»: ¿paso obligatorio?** Recomendación: **encendido por defecto y apagable** por
   organización; apagado, la mesa vuelve a libre al cobrar, como hoy.
