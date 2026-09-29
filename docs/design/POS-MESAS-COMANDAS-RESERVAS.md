# POS — Mesas, comandas y reservas: análisis y propuesta

Fecha: 2026-09-23. Alcance: `/app/pos/mesas`, `/app/pos/mesas/[id]`, `/app/pos/comandas` (cocina / KDS)
y `/app/pos/reservas-mesas`. Solo lectura de código; la base se consultó con el MCP de Supabase
(proyecto `jgmgphmzusbluqhuqihj`, solo `SELECT`, agregados sin identificar organizaciones). Rutas
relativas a `src/` salvo que se indique.

**Estado de la tanda: incompleta.** El cupo del MCP de Figma se agotó después de la primera tanda de
componentes. Lo que quedó hecho en Figma y lo que falta está en §6; el análisis (§1-§4), los cambios
de backend (§7) y las preguntas (§8) están completos.

Este documento **no repite** la auditoría control por control del 2026-09-22
(`docs/design/AUDITORIA-MESAS-PROMOCIONES.md`, 850 controles, §A-§C y §F-§I), que se da por leída.
Aquí se verifica que sigue vigente, se añaden los hallazgos nuevos y se ordena todo alrededor del
**flujo** reserva → mesa → comanda → cocina → servir → cuenta → cobro, que es lo que pidió el dueño.
Los hallazgos nuevos llevan **(nuevo)**.

---

## 0. Resumen para el dueño

1. **Se están "liberando" mesas sin cobrar, y la venta queda colgada.** De las 139 sesiones de mesa
   cerradas en toda la base, **44 dejaron su venta en `pending`** (43 con importe, **$ 1.924.550**
   en total) y otras 44 se cerraron sin venta. `Liberar mesa` está siempre habilitado y
   `MesasService.liberarMesa` cierra la sesión y marca la cocina como entregada, pero **no toca la
   venta** (nuevo, cuantificado).
2. **Nadie cierra nada.** Las 23 sesiones abiertas llevan más de 24 h abiertas, y 62 comandas siguen
   en `new`/`preparing`/`ready` con más de 24 h. El plano y la cocina muestran basura vieja como si
   fuera servicio en curso.
3. **La propina de la mesa no llega a Propinas.** El cobro del POS inserta en `tips`
   (`lib/services/posService.ts:1990-2012`); el cobro de mesa (`PedidosService.completarVentaMesa`)
   solo escribe `sales.tip_amount` y no crea la fila → el mesero no la ve, no se reparte y no se
   contabiliza con `trg_auto_journal_tip` (nuevo).
4. **El aviso "plato listo" existe pero llega vacío y sin enlace.** El trigger
   `notify_waiter_on_ticket_ready` escribe el texto en `payload.message`; la campana del header lee
   `payload.content` (`components/shell/header/Notificaciones.tsx:225`), así que muestra solo
   «Comanda lista para servir» sin la mesa. Y `kitchen_ticket_ready` no tiene destino en
   `getRedirect` (`components/notificaciones/NotificationDetailSheet.tsx:94-120`): tocarlo no lleva a
   la mesa (nuevo).
5. **Reservas: 0 filas en toda la base.** La pantalla nunca se ha usado; y al sentar a una reserva no
   se abre la mesa (no crea `table_sessions`), solo pinta la mesa de ocupada.
6. **El estado «sucia / por limpiar» que pidió el dueño no existe en la base**: el `CHECK` de
   `restaurant_tables.state` solo admite `free`, `occupied`, `reserved`.

---

## 1. Qué hay en la base (verificado hoy con el MCP)

### 1.1 Tablas y columnas del flujo

| Tabla | Columnas que importan | Observación |
|---|---|---|
| `restaurant_tables` | `id uuid`, `organization_id`, `branch_id` (NOT NULL), `name`, `zone` (texto libre), `capacity`, `state`, `position_x/y`, `rotation` | `state` CHECK `free/occupied/reserved`. **Sin UNIQUE** de nombre por sucursal. No hay tabla de zonas: la zona es texto. |
| `restaurant_zone_layouts` | `zone_name`, `position_x/y`, `width`, `height` | UNIQUE `(organization_id, branch_id, zone_name)` |
| `table_sessions` | `restaurant_table_id`, `sale_id`, `server_id` (NOT NULL), `customers`, `status`, `opened_at`, `closed_at`, `branch_id` | `status` CHECK `active/bill_requested/completed`. **Sin UNIQUE parcial "una sesión abierta por mesa"**: hoy hay **1 mesa con 2 sesiones abiertas**; el propio servicio las "limpia" al vuelo (`pedidosService.ts:166-190`). Sin vínculo con la reserva. |
| `kitchen_tickets` | `table_session_id`, `sale_id`, `status`, `priority`, `estimated_time`, `printed_at`, `ready_at`, `source`, `server_name` | `status` CHECK `new/preparing/ready/delivered`. **Única tabla del flujo publicada en Realtime** (junto con `notifications`). |
| `kitchen_ticket_items` | `sale_item_id`, `station`, `status`, `preparation_time`, `product_name`, `quantity`, `variant_data`, `modifiers` | `status` CHECK `pending/in_progress/ready/delivered`. **No publicada en Realtime.** `preparation_time` nunca se ha llenado (0 filas). |
| `restaurant_reservations` | `restaurant_table_id`, `customer_id`, `customer_name` (NOT NULL), `party_size`, `reservation_date date`, `reservation_time time`, `duration_minutes`, `status`, `source`, sellos `confirmed/seated/completed/cancelled_at`, `cancellation_reason` | `status` CHECK de 6 valores; `source` CHECK `admin/website/phone/whatsapp`. Sin restricción de exclusión de solape. |
| `notifications` | `recipient_user_id`, `channel`, `payload jsonb`, `status`, `read_at` | Publicada en Realtime. Aquí cae el aviso `kitchen_ticket_ready`. |
| `tips` | `sale_id`, `server_id` (NOT NULL), `amount > 0`, `tip_type` CHECK `cash/card/split/pooled`, `is_distributed` | Trigger contable `trg_auto_journal_tip`. |
| `service_charges` | `charge_type`, `charge_value`, `min_amount`, `min_guests`, `applies_to` (`dine_in`…), `is_taxable`, `is_optional` | Nadie la usa en el cobro (auditoría §H.7). |

Triggers relevantes: en `table_sessions` solo `trg_branch_default` y `trg_branch_audit`; en
`kitchen_tickets` `trg_kitchen_ticket_ready_notify`. **Ningún trigger mantiene coherente
`restaurant_tables.state` con `table_sessions.status`**; lo hace el código en cuatro sitios sin
transacción.

Permisos: en `permissions` solo existen `pos.view/create/discount/refund/void` y `pos_access`.
**No hay ningún permiso de mesas, cocina ni reservas de restaurante** (sí los hay de reservas del PMS:
`pms.reservations.*`).

### 1.2 Evidencia de uso (agregados, sin organizaciones)

| Dato | Valor |
|---|---|
| Mesas / organizaciones con mesas | 70 / 9 (22 `occupied`, 48 `free`, 0 `reserved`) |
| Sesiones | 22 `active` · 1 `bill_requested` · 139 `completed` |
| Sesiones abiertas con más de 24 h | **23 de 23** |
| Sesiones cerradas por estado de su venta | 51 `paid` · **44 `pending`** (43 con total > 0, **$ 1.924.550**) · 44 sin venta |
| Sesiones abiertas sin venta | 7 |
| Comandas | 38 `new` · 2 `preparing` · 22 `ready` · 143 `delivered`; **62 abiertas con más de 24 h** |
| Comandas sin mesa (creadas desde el carrito del POS) | 44 |
| Comandas con `printed_at` | 91 |
| Ítems de cocina por estación | `hot_kitchen` 248 · `all` 2 · sin estación 44 — **`cold_kitchen` y `bar` nunca usadas** |
| Avisos `kitchen_ticket_ready` | 31 (24 marcados como leídos) |
| Reservas de restaurante | **0** |
| Ventas de mesa con propina | 0 (el defecto de §0.3 aún no ha costado dinero; lo costará en cuanto se use) |

---

## 2. Análisis por página

### 2.1 Plano de mesas — `/app/pos/mesas`

**Qué muestra.** Cabecera con toggle Lista/Mapa, refrescar y «Nueva Mesa»; en Lista, barra de
acciones (Gestionar zonas, Combinar, Mover pedido, Historial), filtros (búsqueda, zona, estado con
emojis), tarjetas `MesaCard` agrupadas por zona con paginación, y 4 KPI **al final** de la página
(`app/app/pos/mesas/page.tsx:821-883`). En Mapa, `MesasFloorMap` con arrastre, rotación, zoom y
recuadros de zona.

**De dónde sale cada dato.** `MesasService.obtenerMesasConSesiones` (`components/pos/mesas/mesasService.ts`)
hace 6 consultas sueltas desde el navegador (`restaurant_tables`, `table_sessions` abiertas de toda
la organización, `sales`, `sale_items`, `profiles`, `kitchen_tickets`) y cruza en JS. Zonas: `DISTINCT
zone`; recuadros: `restaurant_zone_layouts`. Todo con el cliente de navegador
(`@/lib/supabase/config`) y la organización de `localStorage`, contra las reglas 5 y 6 de `CLAUDE.md`.

**Estados de mesa: UI vs BD.**

| Lo que pinta la UI | De dónde sale | ¿Lo admite la BD? |
|---|---|---|
| Libre | `state='free'` y sin sesión | Sí |
| Ocupada | hay sesión `active` | Sí (pero el filtro mira `state`, la tarjeta mira la sesión: `page.tsx:138-142` vs `MesaCard.tsx:18-31`) |
| Cuenta solicitada (= «por cobrar») | `table_sessions.status='bill_requested'` | Sí, como estado de **sesión**, no de mesa |
| Reservada | `state='reserved'` | Sí, pero 0 filas: nadie reserva |
| **Sucia / por limpiar** | — | **No.** Hay que añadirlo al `CHECK` (§7) |
| Combinada | — | No (auditoría §I.1: `table_combinations`) |

**Tiempos.** `Date.now() - opened_at` evaluado en el render, sin tick: el reloj se congela
(`MesaCard.tsx:34-45`, `MesasFloorMap.tsx:503-508`). Umbral de «mesa olvidada» cableado a 45 min
(`MesaCard.tsx:48`). Es una resta de instantes, así que la zona horaria no altera los minutos; pero
**el historial** construye «hoy» con el reloj del navegador (`HistorialMesasDialog.tsx:43-48`) y manda
rangos sin offset a un `timestamptz` (`mesasHistorialService.ts:102-103`): con la organización en
Bogotá y un equipo en otra zona, «hoy» es otro día.

**Roto o engañoso (confirmado hoy; la auditoría da el detalle).**

| # | Hallazgo | Archivo:línea |
|---|---|---|
| M1 | Sin Realtime ni polling: el plano no se entera de nada de lo que pasa en otra caja o en cocina | `app/app/pos/mesas/page.tsx` (0 `.channel(`) |
| M2 | «¿Eliminar mesa?» inalcanzable: `setMesaEliminar` solo se llama con `null` | `app/app/pos/mesas/page.tsx:76, 210, 930` |
| M3 | `CombinarMesasDialog` montado y nunca abierto desde el plano; el modo rápido acepta mesas libres como «principal» | `page.tsx:914-919`, `:398-401`, `:1085-1092` |
| M4 | `moverPedido` libera la mesa origen aunque tenga otra sesión, y contiene un `UPDATE` que no hace nada | `mesasService.ts:721-728` |
| M5 | `abrirSesion` no es transaccional (sesión abierta sobre mesa «libre» si falla el 2.º `UPDATE`) y no hay UNIQUE que impida dos sesiones abiertas: hoy hay 1 mesa así | `mesasService.ts:363-421` |
| M6 | Filtro de estado ≠ tarjeta, y agrupación por zona sobre la página, no sobre el conjunto | `page.tsx:138-142`, `:736` |
| M7 | Moneda cableada: `$` a mano y `toLocaleString()` sin locale | `MesaCard.tsx:112`, `MesasFloorMap.tsx:722` |
| M8 | El Mapa no tiene menú ⋯, ni «Pedir cuenta», ni «Liberar», ni estado vacío; guarda posiciones de mesas que no muestra | `MesasFloorMap.tsx:415-418`, `:160-190` |
| M9 | Sin permisos: cualquiera crea, combina, mueve y libera | todo el módulo (0 `hasPermission`) |
| M10 | Los KPI están **al pie** de la página, después de la paginación: en el plano, que es la vista operativa, no se ven | `page.tsx:821-883` |

**Qué falta.** Ver de un vistazo qué mesas tienen **plato listo** (el dato existe: `kitchen_ticket_ready`),
cuáles **pidieron la cuenta** y cuáles **llevan demasiado**; ver las **próximas llegadas** de reservas
en el propio plano; y cerrar el ciclo con «por limpiar → libre».

### 2.2 Detalle de mesa — `/app/pos/mesas/[id]`

**Qué muestra.** Cabecera (Volver, nombre, estado, Historial, Combinar, Agregar producto), 5 tarjetas
(Comensales, Tiempo, Items, Total, Mesero), «Pedido actual» con `OrderItemCard` por línea (estado de
cocina del último `kitchen_ticket_items`), y `MesaActionsSidebar` con cliente, resumen y 6 acciones
(Enviar a cocina, Ver pre-cuenta, Solicitar cuenta, Dividir, Procesar pago, Liberar).

**De dónde sale.** `PedidosService` (`components/pos/mesas/id/pedidosService.ts`, 1279 líneas,
46 `.from(...)`, 0 `.rpc(...)`): sesión + venta + líneas + imágenes + cocina. Impuestos con
`useMesaTaxes`. Realtime solo sobre `kitchen_tickets`/`kitchen_ticket_items`
(`app/app/pos/mesas/[id]/page.tsx:116-148`), y el de ítems filtrado por **organización**, no por
sesión (`:126`): cualquier cambio de cocina de la organización recarga esta mesa. Además
`kitchen_ticket_items` no está publicada, así que ese canal no recibe nada.

**Lógica del flujo hoy.**

1. *Abrir mesa*: desde el plano (diálogo de comensales) → `abrirSesion` → navega al detalle.
2. *Agregar productos*: `AddProductDialog` → `sale_items` + `kitchen_tickets` (`status='new'`) +
   `kitchen_ticket_items` (`pending`) **en el mismo momento de agregar**, antes de «Enviar a cocina».
   O sea: la comanda aparece en el tablero de cocina **antes** de que el mesero la envíe; «Enviar a
   cocina» solo imprime y sella `printed_at` (`pedidosService.ts:417-449` y `:748-766`).
3. *Cocina*: el tablero cambia estados; al pasar a `ready`, el trigger crea el aviso al mesero.
4. *Servir*: no existe acción «Servido» en la mesa; el estado `delivered` solo se pone desde el
   tablero de cocina o al liberar la mesa (que marca **todo** como entregado aunque no se haya cocinado).
5. *Cuenta*: «Solicitar cuenta» pone la sesión en `bill_requested`; si hay >1 comensal abre
   «Dividir».
6. *Cobro*: `CheckoutDialog` con un carrito sintético (`convertSessionToCart`, `page.tsx:931`) y
   `onProcessPayment` → `completarVentaMesa` (`pedidosService.ts:886`), que **reimplementa** el
   checkout del POS: pagos, factura, ítems de factura, cartera, stock, seriales y comisiones.
7. *Cierre*: tras el último pago dividido, `liberarMesa` dentro de un `setTimeout` de 1,5 s
   (`page.tsx:1345-1369`).

**Propina y cargo de servicio al cerrar.** La propina se elige en el `CheckoutDialog` y viaja como
`tip_amount`/`tip_server_id`, pero **no se inserta en `tips`** (arriba §0.3). El cargo de servicio
**no se cobra nunca**: `service_charges` solo se lee en configuración y `CheckoutDialog.tsx:239` suma
`baseTotal + tipAmount + shippingFee` (auditoría §H.7; decisión del dueño §13 #6: va como línea de la
factura, antes de impuestos, no como propina).

**Roto o engañoso.**

| # | Hallazgo | Archivo:línea |
|---|---|---|
| D1 | **Liberar mesa con cuenta pendiente deja la venta en `pending` para siempre** (44 sesiones, $ 1.924.550) y marca la cocina como entregada | `components/pos/mesas/id/MesaActionsSidebar.tsx:315-322` (sin `disabled`) · `mesasService.ts:741-826` (no toca `sales`) |
| D2 | **Propina de mesa sin fila en `tips`** (nuevo) | `pedidosService.ts:886-950` vs `lib/services/posService.ts:1990-2012` |
| D3 | `completarVentaMesa` duplica el checkout del POS (regla 7) y además inserta la cartera a mano cuando `invoice_sales` ya la crea por trigger → cartera doble | `pedidosService.ts:886` · `:1123-1137` |
| D4 | La comanda llega a cocina al **agregar**, no al **enviar**; «Enviar a cocina» solo imprime | `pedidosService.ts:417-449` vs `:748-766` |
| D5 | `sendToFactus` de la pre-cuenta se descarta | `app/app/pos/mesas/[id]/page.tsx:1742-1745` |
| D6 | `SplitBillDialog` recibe los ítems ya pagados | `page.tsx:1823` |
| D7 | `confirm()` nativo para cerrar con pagos pendientes, y liberación con `setTimeout` | `page.tsx:1255`, `:1345` |
| D8 | Transferir un ítem ofrece mesas libres que el servicio rechaza; la transferencia parcial pierde el impuesto | `TransferItemDialog.tsx:60-62` · `pedidosService.ts:841`, `:859` |
| D9 | «Mover pedido» (cuenta completa) solo existe en el plano, no en el detalle | `mesasService.ts:695`; detalle sin entrada |
| D10 | El botón refrescar nunca muestra carga (recibe el evento como `silencioso`) | `page.tsx:1568` |
| D11 | Fechas de pre-cuenta e historial con `toLocaleString('es-CO')` del navegador, y la pre-cuenta imprime `new Date()` en cada render | `PreCuentaDialog.tsx:171-174` · `SessionTimelineDialog.tsx:32-40` |
| D12 | Sin permisos, organización del cliente, moneda cableada (`formatCurrency` con COP por defecto) | auditoría §B.12 #9-#11 |

### 2.3 Comandas / cocina — `/app/pos/comandas`

**Qué muestra.** Tablero de 4 columnas (Nuevos, En preparación, Listos para entregar, Entregados),
chips de zona y de estación (3 cableadas), botones de estado con contador, sonido, reimprimir y
paginación propia.

**De dónde sale.** `KitchenService.getKitchenTickets` (`lib/services/kitchenService.ts:70-124`): un
embed de cuatro niveles **sin `limit` ni ventana temporal** (trae todo el histórico); zona filtrada en
el navegador. Realtime sobre `kitchen_tickets` (publicada) y `kitchen_ticket_items` (no publicada).

**Estados de comanda: UI vs BD.** Dos vocabularios: ticket `new/preparing/ready/delivered`, ítem
`pending/in_progress/ready/delivered`; la UI dice «En Preparación» en uno y «Preparando» en el otro.
La autopromoción ticket ← ítems se hace **solo en el navegador** (`app/app/pos/comandas/page.tsx:194-224`).

**Tiempos.** `created_at` → minutos, congelados en `ready_at`; umbrales 10/20 min cableados
(`TicketCard.tsx:103-125`). La hora de creación no se muestra. Arrastrar de «Entregados» a «Nuevos»
pone `ready_at = null` y borra el tiempo real (`kitchenService.ts:192`).

**Impresión.** «Reimprimir» reencola `print_jobs` por estación
(`lib/services/printJobsService.ts:367-437`); para tickets del POS imprime «Producto × 1» porque solo
lee `sale_items` (`:463-474`). `markAsPrinted` no lo llama nadie.

**Roto o engañoso.**

| # | Hallazgo | Archivo:línea |
|---|---|---|
| K1 | **62 comandas abiertas con más de 24 h** ensucian el tablero: no hay cierre automático ni vista «turno actual» | datos §1.2 + `kitchenService.ts:77-124` (sin ventana) |
| K2 | La paginación corta **antes** de repartir en columnas → columnas vacías con tickets reales; contadores contradictorios | `app/app/pos/comandas/page.tsx:283-291` |
| K3 | Los contadores de estado caen a 0 al filtrar | `page.tsx:267-277` |
| K4 | Estaciones cableadas a 3; la BD admite 5 y en datos solo se usa `hot_kitchen` | `components/pos/comandas/FilterBar.tsx:27-31` |
| K5 | Ítems de otra estación atenuados al 35 % sin explicación | `TicketCard.tsx:211, 250` |
| K6 | Emojis como iconos en botones y urgencia | `TicketCard.tsx:168, 320, 337-339` |
| K7 | Escrituras sin guarda de organización (4) | `kitchenService.ts:195-200, 213-219, 235-243, 398-408` |
| K8 | **El carrito del POS descarga TODAS las comandas de la organización para leer el estado de una** (nuevo) | `components/pos/CartView.tsx:239-241` |
| K9 | Dos caminos para crear comandas: el de mesa (`pedidosService`) y el del carrito (`KitchenService.createKitchenTicketFromPOS`, dos `insert` sin transacción) | `pedidosService.ts:417-449` · `app/app/pos/page.tsx:482-535` · `kitchenService.ts:322-389` |
| K10 | No es una pantalla de cocina: 1440 con sidebar y paginación; en una tablet de pared no cabe ni se lee a 2 m | `app/app/pos/comandas/page.tsx` |

### 2.4 Reservas de mesas — `/app/pos/reservas-mesas`

**Qué muestra.** Filtros (búsqueda, estado, origen, rango de fechas), 6 stats, lista de tarjetas sin
paginación, formulario con nombre/teléfono/correo sueltos.

**De dónde sale.** `reservasMesasService.ts`: `restaurant_reservations` + embed de
`restaurant_tables`; stats contados en JS; disponibilidad calculada en JS solo para llenar el
desplegable.

**Reserva → llegada → mesa ocupada, hoy.** «Marcar como sentada» cambia el estado de la reserva y
pone la mesa en `occupied` (`reservasMesasService.ts:328-334`), **pero no abre `table_sessions`**:
la mesa queda «ocupada» sin sesión, sin mesero y sin comensales. Y al **completar, cancelar o
marcar no-show** pone la mesa en `free` **aunque tenga una sesión abierta** (`:334-339`) (nuevo).
No hay vínculo reserva ↔ sesión en ninguna tabla.

**Zona horaria.** Tres `new Date().toISOString().split('T')[0]` (prohibido, regla 1):
`app/app/pos/reservas-mesas/page.tsx:37`, `ReservaFormDialog.tsx:85`, `reservasMesasService.ts:176`.
Desde las 19:00 de Bogotá la pantalla abre en **mañana** — justo en la hora de las reservas de la
cena. Las horas de la reserva son `date` + `time` sin zona: correcto, se pintan tal cual.

**Roto o engañoso.** Estado `pending` inalcanzable (`reservasMesasService.ts:227`), sin validación de
solape al guardar, se puede reservar en el pasado, notas guardadas como HTML y pintadas como texto,
`.or()` con la búsqueda sin escapar (`:157`), 3 escrituras a `restaurant_tables` sin guarda de
organización, borrado físico, sin cliente del CRM (decisión §13 #8: obligatorio) y sin recordatorio.
Detalle en la auditoría §C.R y §H.7.

---

## 3. El flujo completo, hoy y propuesto

| Paso | Hoy | Propuesta (qué pantalla, qué dato) |
|---|---|---|
| Reserva | Formulario suelto, sin cliente, sin solape | Agenda del día por mesa × hora; cliente obligatorio con `CustomerPicker`; solape validado en BD |
| Llegada | «Marcar como sentada» pinta la mesa, sin sesión | **«Sentar»** abre la sesión (`table_sessions` con `reservation_id`, comensales = `party_size`, mesero) y lleva a la mesa |
| Mesa abierta | Diálogo de comensales en el plano | Igual, desde el panel lateral del plano o la hoja del mesero; una sola sesión abierta por mesa (UNIQUE) |
| Pedido | Agregar = comanda inmediata | Las líneas nuevas quedan **«Por enviar»** hasta pulsar **«Enviar a cocina»**; cada envío es una **ronda** (una comanda) |
| Cocina | Tablero de escritorio | **KDS** para tablet (oscuro), columnas por estado, por estación, reloj vivo, sin paginación, turno actual |
| Listo | Aviso en la campana sin mesa ni enlace | Aviso con mesa y enlace; **campana verde en la mesa** del plano; hoja del mesero «Plato listo» |
| Servir | No existe | **«Servido»** por ronda desde la mesa (ítem `delivered`) |
| Cuenta | `bill_requested` | Igual + pre-cuenta con fecha de la BD en la zona de la organización |
| Dividir | 3 modos, con ítems pagados colados | Por comensal / partes iguales / por ítems, solo sobre lo pendiente |
| Cobro | `CheckoutDialog` + `completarVentaMesa` duplicado | **El carrito elegido del POS v2** con la pestaña «Mesa 4» (`CartTag`) y el cobro de `posService` (una sola lógica); cargo de servicio como línea; propina a `tips` con el mesero |
| Cierre | Liberar siempre habilitado | La mesa pasa a **«Por limpiar»** al cobrar; «Lista» la devuelve a libre. Liberar con saldo exige permiso y motivo, y **anula** la venta |

---

## 4. Tiempos en la zona de la organización

- Los contadores («42 min», «14 min en cocina») son restas de instantes: correctos en cualquier zona,
  pero deben correr (tick de 30 s) y su base debe ser el instante de la BD.
- Toda **hora** mostrada (apertura de mesa, hora de la comanda, pre-cuenta, historial) pasa por
  `useFormatDate()` / `formatDateInTz(value, tz)`; hoy ninguna lo hace.
- «Hoy» de reservas e historial: `todayInTz(tz)`; los rangos a `timestamptz` con offset de la
  organización.
- Umbrales (mesa demorada, comanda demorada) por organización, no cableados (45 / 10 / 20 min hoy).

---

## 5. Propuesta de diseño

Principios: el plano es la pantalla de trabajo del salón (no un listado con mapa opcional); la cocina
es una pantalla aparte para tablet; el mesero trabaja en el móvil; y **cada pantalla enlaza con la
siguiente del flujo** (plano → mesa → cocina → cobro en el POS → plano). Estados por color de token
con icono (nunca solo color), menús «⋯» con un icono por acción, y los cinco estados de página (listo,
cargando, vacío con primer paso, error, sin permiso).

### 5.1 Componentes (Figma `02 Componentes` › «POS — Restaurante (Nuevo)», sección `680:410510`)

| Componente | Node id | Variantes / propiedades | Estado |
|---|---|---|---|
| `TiempoTranscurrido` | `680:410531` | `Nivel=normal/atencion/critico` · texto `Tiempo` | **Creado** |
| `MesaPlano` | `680:410764` | `Estado=libre/ocupada/por-cobrar/reservada/sucia` × `Forma=cuadrada/redonda/larga` (15) · textos `Nombre`, `Línea 1`, `Línea 2` · booleano `Aviso plato listo` | **Creado** |
| `LeyendaEstadosMesa` | `680:410766` | 5 textos de conteo | **Creado** — quedó **solapado** con el borde inferior del set `MesaPlano` (y = 664 frente a 324 + 424): hay que bajarlo a y ≈ 800 y recolocar `FlujoMesa` debajo |
| `FlujoMesa` | `680:411011` | `Paso=1…6` (Mesa abierta, Pedido, En cocina, Servido, Cuenta, Cobrada) | **Creado** — pendiente de revisión visual |
| `ComandaItemKDS` | — | `Estado=pendiente/preparando/listo` · textos `Cantidad`, `Producto`, `Nota` · booleano `Mostrar nota` | Pendiente |
| `ComandaKDS` | — | `Estado=nueva/en-preparacion/lista/demorada`; cabecera Mesa + `TiempoTranscurrido`; 3 `ComandaItemKDS`; `Button` del kit (Empezar / Marcar lista / Entregar) | Pendiente |
| `LineaPedidoMesa` | — | `Estado=por-enviar/en-cocina/preparando/listo/servido/pagado` × `Layout=escritorio/móvil`; estado con `Badge` del kit | Pendiente |
| `ReservaBloque` | — | `Estado=` los 6 del `CHECK`; textos `Hora`, `Cliente`, `Detalle` | Pendiente |
| `ReservaLlegadaFila` | — | `Estado=proxima/retrasada/sentada/no-show`; acción «Sentar» (`Button` del kit) | Pendiente |

Los componentes de paridad de `05 POS y ventas › Componentes — Mesas y promociones` (`MesaTile`,
`LeyendaMesas`, `ComandaCard`, `ReservaSlot`) quedan como antecedente; la propuesta usa los nuevos.

### 5.2 Frames (página `05 POS y ventas`, sección nueva «POS — Mesas, comandas y reservas (propuesta)», pendiente de crear en x ≈ 11.000, y ≈ 110.256)

**Flujo**
- `Flujo — de la reserva al cobro` (1440): el cuadro de §3 como diagrama, con la pantalla y la tabla
  de cada paso.

**Plano de mesas** — escritorio 1440 y tablet 1024
- `Escritorio / Mesas — plano (listo)`: KPI arriba (Libres, Ocupadas, Por cobrar, Platos listos,
  Próximas llegadas), pestañas de zona, `LeyendaEstadosMesa`, plano con `MesaPlano` en sus formas, y
  **panel de la mesa** a la derecha con `FlujoMesa`, líneas (`LineaPedidoMesa`), acciones «Agregar»,
  «Enviar a cocina (2)», «Pedir cuenta», «Cobrar en el POS». Tira «Próximas llegadas» con
  `ReservaLlegadaFila`.
- `… (menú ⋯ de la mesa)`: Abrir mesa · Agregar productos · Enviar a cocina · Pre-cuenta · Pedir
  cuenta · Dividir · Mover cuenta · Combinar · Cambiar mesero · Comensales · Marcar lista (limpia) ·
  Liberar (destructiva) · Editar · Eliminar (destructiva) — un icono por acción.
- `Tablet / Mesas — plano (listo)` con `Sidebar Mode=rail`.
- `Escritorio / Mesas — plano (cargando · vacío «Crea tu primera zona» · error · sin permiso)`.
- `ConfirmDialog — Liberar mesa con cuenta pendiente` (importe, motivo, «anula la venta»).

**Detalle de mesa** — escritorio 1440
- `Escritorio / Mesa 4 — detalle`: rondas (Ronda 1 servida, Ronda 2 en cocina, líneas «Por enviar»),
  `FlujoMesa`, cliente, resumen con **cargo de servicio 10 % como línea** e impuestos rotulados
  `{nombre} {tasa}`.
- `Diálogo — Dividir cuenta` (por comensal, solo lo pendiente).
- `Diálogo — Mover cuenta / productos a otra mesa` (une «Mover pedido», «Transferir ítem» y
  «Combinar»; mesas sin sesión deshabilitadas con motivo).
- `Escritorio / POS — cobro de la Mesa 4`: clon del cobro aprobado del POS v2 con la pestaña
  «Mesa 4», el cargo de servicio y la propina con el mesero «Ana Gómez».
- `Toast — Mesa cobrada · pasa a «Por limpiar»`.

**Cocina (KDS)** — tablet 1024 (modo oscuro por variables) y escritorio 1440
- `Tablet / Cocina — KDS (listo)`: pestañas de estación desde `printer_station_assignments`,
  columnas Nuevas / En preparación / Listas, `ComandaKDS`, reloj vivo, sin paginación, «Turno actual».
- `Tablet / Cocina — KDS (demoradas arriba)`, `… (vacío «Sin comandas»)`, `… (sin conexión)`,
  `… (sin permiso)`; `Escritorio / Cocina — KDS`.
- `ConfirmDialog — Devolver comanda a «Nuevas»` (conserva el tiempo).

**Mesero** — móvil 390 (`MobileHeader` + `MobileTabBar`)
- `Móvil / Mis mesas` (plano en rejilla de `MesaPlano`), `… Abrir mesa` (hoja de comensales),
  `… Tomar pedido` (catálogo + ronda), `… Enviar a cocina`, `… Pedido de la mesa` con aviso «Plato
  listo», `… Pedir cuenta`, `… Dividir`, `… Cobrar` (hoja con propina).

**Reservas** — escritorio 1440 y móvil 390
- `Escritorio / Reservas — agenda del día` (mesas × horas con `ReservaBloque`) + panel «Llegadas»
  (`ReservaLlegadaFila`, acción «Sentar»).
- `Escritorio / Reservas — lista`, `Diálogo — Nueva reserva` (cliente obligatorio), `Diálogo —
  Sentar a Ana Gómez en la Mesa 7`, estados (cargando · vacío «Crea la primera reserva» · error ·
  sin permiso), `Móvil / Reservas del día`.

---

## 6. Qué quedó hecho en Figma y qué falta

**Hecho** (una llamada de escritura antes de agotar el cupo):

- Sección `680:410510` «POS — Restaurante (Nuevo)» en `02 Componentes` (x = 48.000, y = 110.000;
  la de otro agente, «POS — Ventas (Nuevo)», está en x = 30.000).
- Componentes `TiempoTranscurrido` (`680:410531`), `MesaPlano` (`680:410764`), `LeyendaEstadosMesa`
  (`680:410766`) y `FlujoMesa` (`680:411011`), con colores ligados a variables (Light/Dark), estilos de
  texto del archivo, iconos del kit y propiedades de texto y booleanas.

**Falta** (cuando vuelva el cupo):

1. Corregir el solape dentro de la sección: `LeyendaEstadosMesa` (y = 664) cae dentro del set
   `MesaPlano` (324 – 748); bajar leyenda y `FlujoMesa` y reajustar la sección. Revisar el set
   `FlujoMesa` a ojo (texto de las etiquetas y conectores).
2. Crear `ComandaItemKDS`, `ComandaKDS`, `LineaPedidoMesa`, `ReservaBloque`, `ReservaLlegadaFila`.
3. Crear la sección de `05 POS y ventas` y todos los frames de §5.2.
4. Chequeo por script (0 solapes, 0 nodos fuera de sección, 0 instancias rotas, 0 textos truncados,
   0 anotaciones dentro de frames).
5. Capturas `docs/design/figma/44-pos-restaurante-*.png`. **No hay ninguna**: `get_screenshot` usa el
   mismo cupo.

---

## 7. Cambios de backend y BD necesarios (no aplicados)

Todos aditivos. Cada migración con su `.sql` en `supabase/migrations/` y su reversión en
`supabase/rollbacks/` (`docs/POLITICA-MIGRACIONES.md`).

1. **Estado «por limpiar»**: ampliar el `CHECK` de `restaurant_tables.state` a
   `free/occupied/reserved/cleaning` (cambio de restricción, no de tipo). Si se aprueba «combinada»
   (§I.1 de la auditoría), `combined` en la misma migración.
2. **Una sesión abierta por mesa**: `CREATE UNIQUE INDEX … ON table_sessions (restaurant_table_id)
   WHERE status <> 'completed'`. Antes, resolver la mesa que hoy tiene dos.
3. **Reserva ↔ sesión**: `table_sessions.reservation_id uuid NULL` con FK a `restaurant_reservations`.
4. **RPCs transaccionales** (`SECURITY INVOKER`, organización desde la sesión) que sustituyen a las
   cadenas de llamadas del navegador:
   - `pos_table_open(table_id, customers, reservation_id?)`
   - `pos_table_send_round(session_id, sale_item_ids[])` — crea **una** comanda por ronda con sus
     ítems (hoy la comanda nace al agregar).
   - `pos_table_move(session_id, target_table_id, item_ids?)` — mover cuenta, transferir ítems (con su
     impuesto) y combinar en un solo sitio.
   - `pos_table_close(session_id, reason?)` — si la venta no está pagada exige permiso y **anula** la
     venta (`sales.status`), cierra la cocina que falte y deja la mesa en `cleaning`.
   - `pos_reservation_seat(reservation_id, table_id?)` — sienta y abre la sesión.
   - Sincronizar `restaurant_tables.state` con un trigger sobre `table_sessions`, y quitar las cuatro
     copias del cliente.
5. **Cobro de mesa por `posService`** (regla 7): borrar `completarVentaMesa` y cobrar con el mismo
   checkout del POS sobre la venta de la sesión; así la propina entra a `tips`, la cartera la crea el
   trigger y el cargo de servicio se aplica como línea (decisión §13 #6).
6. **Realtime**: publicar `kitchen_ticket_items`, `table_sessions` y `restaurant_tables` en
   `supabase_realtime` (hoy solo `kitchen_tickets` y `notifications`).
7. **Aviso al mesero**: en `notify_waiter_on_ticket_ready`, escribir también `payload.content` (o
   que la campana lea `message` como ya hace el detalle, `NotificationDetailSheet.tsx:379`) y añadir
   `restaurant_table_id`; en `getRedirect`, el caso `kitchen_ticket_ready` → `/app/pos/mesas/{id}`.
   Crear el simétrico `table_bill_requested` para caja.
8. **Permisos nuevos** en `permissions`: `pos.tables.view/manage/close_with_balance`,
   `pos.kitchen.view/update`, `pos.table_reservations.view/manage`; resueltos en servidor.
9. **Consulta de cocina con ventana**: `getKitchenTickets` limitado al turno o a las últimas N horas,
   con zona y estación filtradas en SQL; contadores con `count` en la BD. Y `CartView` debe leer
   **una** comanda por id, no todas (`CartView.tsx:239`).
10. **Reservas**: restricción de exclusión (o validación en la RPC) contra el solape por mesa y
    franja; `todayInTz` en los tres sitios; `customer_id` obligatorio en la interfaz.
11. **Umbrales por organización** (mesa demorada, comanda en atención / crítica) en la configuración
    del POS.
12. **Datos viejos**: decidir con el dueño qué hacer con las 23 sesiones y las 62 comandas abiertas de
    más de 24 h, y con las 44 ventas `pending` de mesas liberadas (anular o pasar a cartera).

---

## 8. Preguntas para el dueño

1. **Mesas liberadas sin cobrar** (44 ventas, $ 1.924.550): ¿se anulan, o se pasan a cuentas por
   cobrar? Y en adelante, ¿«Liberar con saldo» debe **anular** la venta (con permiso y motivo) o
   dejarla como deuda del cliente?
2. **¿Cuándo nace la comanda?** Propuesta: al pulsar «Enviar a cocina» (por rondas), no al agregar el
   producto como hoy. ¿De acuerdo?
3. **«Por limpiar»**: ¿la mesa pasa sola a «por limpiar» al cobrar y la devuelve a libre el mesero, o
   prefieren omitir ese paso?
4. **Cobro de mesa**: ¿se cobra siempre en el POS (pestaña «Mesa 4» del carrito, en caja) o también
   desde el móvil del mesero con datáfono?
5. **Cocina**: ¿tienen tablet en la cocina o se sigue trabajando con la impresora? Y ¿separan
   estaciones (cocina fría, bar) o todo va a cocina caliente, como dicen los datos?
