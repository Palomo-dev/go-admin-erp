# Auditoría control por control — Pedidos Online

Insumo para rediseñar en Figma («GO Admin — Sistema de diseño», `EAvjINVRnlzFM70GVoWXgl`,
página `05 POS y ventas`) la pantalla **Pedidos Online** y su detalle. Baja un nivel respecto a
`docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md` §D.2, que ya inventarió 38 + 23 controles en
una tabla resumen: **aquí no se repite ese inventario, se profundiza** —cada control con su
etiqueta exacta, qué escribe en la base de datos, qué tabla toca, qué falla y qué no se ve.

Fecha: 2026-09-22. Solo lectura de código; esquema, `CHECK` y políticas RLS verificados con el
MCP de Supabase (proyecto `jgmgphmzusbluqhuqihj`, únicamente `SELECT` sobre catálogos del
sistema). Sin nombres de organizaciones cliente: los ejemplos usan «Mi empresa S.A.S.» y
«Distribuidora del Norte». Rutas relativas a `src/` salvo que se indique.

Leyenda de **Tipo**: botón · menú (trigger o ítem) · pestaña · campo · toggle (switch/checkbox/
segmento) · chip (píldora clicable) · badge (solo lectura) · tabla · diálogo · tooltip · atajo ·
estado (vacío/cargando/error/aviso) · texto · stat (KPI) · paginación · toast · cálculo (regla sin
control visible). **Etiqueta exacta** es el literal del código con su acentuación (o su falta).
Ninguna cadena de Pedidos Online pasa por `messages/es.json`: todos los textos están escritos en
los componentes, así que se citan tal cual. **Cuándo aparece**: «Siempre» = incondicional dentro
de su pantalla; breakpoints Tailwind (`sm` 640 · `md` 768 · `lg` 1024).

Índice: A. Mapa · B. Listado (cabecera, KPIs, período, filtros, masivos, tabla, paginación,
tablero, diálogos, estados) · C. Detalle (cabecera, productos, notas, línea de tiempo, acciones,
cliente, entrega, seguimiento, diálogos, estados) · D. Componentes del dominio que nadie usa ·
E. El servicio: qué lee y qué escribe · F. Ciclo de estados completo y quién lo cambia · G. Tiempo
real, sonido y auto-refresco · H. Conversión a venta y `sale_id` · I. Reserva y liberación de
stock · J. Tiempos estimados y programación · K. Pago, referencia y cupón · L. Esquema verificado
y columnas que existen y no se muestran · M. Lo roto o sin efecto · N. Qué le falta para ser útil ·
O. Conteo · P. Recomendación.

---

## A. Mapa de la funcionalidad

| Pieza | Archivo | Líneas | Papel |
|---|---|---|---|
| Listado | `app/app/pos/pedidos-online/page.tsx` | 1.442 | Pantalla completa: cabecera, KPIs, período, filtros, dos vistas, masivos, 2 diálogos |
| Detalle | `app/app/pos/pedidos-online/[id]/page.tsx` | 147 | Solo composición; toda la lógica en el hook |
| Hook del detalle | `[id]/hooks/useWebOrderDetail.ts` | 376 | Carga y 10 manejadores de acción; **escribe directo a `web_orders` sin pasar por el servicio** |
| Tarjetas del detalle | `[id]/components/Order*.tsx` | 8 archivos | Header, Products, Notes, Timeline, Actions, Customer, Delivery, Loading, NotFound |
| Diálogos del detalle | `[id]/components/{ConfirmOrderDialog,CancelOrderDialog}.tsx` | 192 + 85 | Confirmar y rechazar/cancelar |
| Componentes del dominio | `components/pos/pedidos-online/*` | 17 archivos | `WebOrderCard`, `WebOrderFilters`, `WebOrderStats`, `OrderActions`, `OrderItemsList`, `OrderTimeline`, `OrderTotals`, `CustomerInfo`, `DeliveryInfo`, `DeliveryTrackingCard`, `DeliveryTypeBadge`, `StatusBadge`, `PaymentStatusBadge`, `ProofOfDeliveryView`, `AssignDeliveryDialog`, `WebCommerceObservability`, `index.ts` |
| Servicio de datos | `lib/services/webOrdersService.ts` | 791 | Consultas, cambios de estado, stock, estadísticas, tiempo real |
| Servicio de confirmación | `lib/services/webOrderConfirmationService.ts` | 703 | La cadena completa: venta, comanda, propina, cupón, envío, factura, pago, cartera |
| Reparto de totales | `lib/services/webOrderTotals.ts` | — | Prorratea el descuento de pedido en las líneas de la factura |
| Endpoints (servidor) | `app/api/web-orders/**` | 6 rutas | `POST /` (crear desde la tienda), `GET·PATCH /[id]`, `/[id]/auto-confirm`, `/[id]/release-stock`, `/[id]/refund`, `/observability` |
| Cron | `app/api/cron/expire-pending-web-orders/route.ts` | — | Llama a la RPC `expire_pending_web_orders` |

**Dos caminos escriben el mismo pedido y no coinciden.** El listado usa `webOrdersService`; el
detalle usa `useWebOrderDetail`, que hace `supabase.from('web_orders').update(...)` a mano
(`useWebOrderDetail.ts:104-134`). Las diferencias no son cosméticas: ver §I y §M.

---

## B. Listado — `/app/pos/pedidos-online`

### B.1 Cabecera de pantalla — `page.tsx:627-694`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | (icono `ArrowLeft`) | `<a href="/app/pos">` — navegación dura, recarga toda la app | Siempre | page.tsx:629-633 |
| 2 | texto | «Pedidos Online» con icono `ShoppingBag` sobre cuadro azul | Título | Siempre | page.tsx:635-640 |
| 3 | texto | «POS / Pedidos Online» | Migas **falsas**: es un `<p>` gris, no enlaces | Siempre | page.tsx:641 |
| 4 | toggle | (icono `LayoutGrid`, `title="Vista Kanban"`) · (icono `List`, `title="Vista Lista"`) | Conmuta `viewMode`; por defecto `'list'` | Siempre | page.tsx:645-664 |
| 5 | toggle | (icono `Volume2`/`VolumeX`) `title="Silenciar notificaciones"` / «Activar sonido» | `soundEnabled`; solo en memoria, no se persiste | Siempre | page.tsx:665-673 |
| 6 | toggle | (icono `Bell`/`BellOff`) `title="Desactivar auto-refresh"` / «Activar auto-refresh» | `autoRefresh`; solo en memoria | Siempre | page.tsx:674-682 |
| 7 | botón | «Actualizar» (texto oculto bajo `sm`) | `loadOrders()`; icono gira mientras `loading` | `disabled` en `loading` | page.tsx:683-692 |

No hay acción primaria (no se puede crear un pedido desde el ERP: los pedidos nacen en la tienda
web o por los endpoints). No hay `BranchBadge` pese a que la pantalla filtra por
`branchFilter` del contexto (`page.tsx:95, 231`). No hay migas reales.

### B.2 KPIs del período — `WebOrderStats.tsx:83-182`

| # | Tipo | Etiqueta exacta | Qué muestra | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 8 | stat | «Pedidos hoy» / «Pedidos ayer» / «Pedidos (7 días)» / «Pedidos (30 días)» / «Total pedidos» | `total_orders` según `datePreset` | Siempre | WebOrderStats.tsx:17-23, 86-93 |
| 9 | stat | «Pendientes» | `pending` + `confirmed` + `preparing` + `ready` + `in_delivery` | Siempre; con `ring-2 ring-yellow-500` si > 0 | WebOrderStats.tsx:94-102; webOrdersService.ts:704-705 |
| 10 | stat | «Completados» | Solo `delivered` | Siempre | WebOrderStats.tsx:103-110 |
| 11 | stat | «Cancelados» | `cancelled` + `rejected` + `expired` | Siempre | WebOrderStats.tsx:111-119; webOrdersService.ts:708-709 |
| 12 | stat | «Ingresos» | Suma de `total` de pedidos con `payment_status='paid'` **o** `status='delivered'` | Siempre | WebOrderStats.tsx:120-127; webOrdersService.ts:712-716 |
| 13 | stat | «Ticket promedio» | Ingresos ÷ nº de pedidos contados como pagados | Siempre | WebOrderStats.tsx:128-135 |
| 14 | badge | «↑ 12 %» / «↓ 8 %» / «—», `title` = «vs ayer (misma hora)» / «vs antier» / «vs 7 días previos» / «vs 30 días previos» / «vs período previo» | Variación contra el período anterior equivalente | Si llegó `previousStats` | WebOrderStats.tsx:25-31, 50-81 |
| 15 | estado | 6 tarjetas con pulso | Esqueleto propio, no `Skeleton` del kit | `isLoading` | WebOrderStats.tsx:138-152 |

**Ninguna tarjeta es clicable.** «Pendientes» se resalta con un anillo amarillo pero no filtra.
«Completados» cuenta solo `delivered`, mientras el chip de filtro «Entregados» usa el mismo
estado: coinciden. «Pendientes» mezcla cinco estados bajo una etiqueta que el filtro usa para uno
solo («Pendientes» = `status='pending'`): **el KPI y el chip del mismo nombre no cuentan lo
mismo**.

### B.3 Selector de período — `page.tsx:700-740`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 16 | chip | «Período:» + «Hoy» · «Ayer» · «Últimos 7 días» · «Últimos 30 días» · «Personalizado» | Define `date_from`/`date_to` sobre `created_at` | Siempre | page.tsx:705-720 |
| 17 | campo | dos `input[type=date]` separados por «a» | Rango manual | Solo con «Personalizado» | page.tsx:721-737 |

Los rangos se calculan con `setHours(0,0,0,0)` y `toISOString()` (`page.tsx:156-181`): **la zona
horaria es la del navegador, no la de la organización.** Un pedido de las 23:30 en Bogotá entra en
«Hoy» solo si el navegador también está en Bogotá. El rango personalizado concatena
`customDateFrom + 'T00:00:00'` (`:175`), que es hora local del navegador. Regla 6 de
`docs/reglas-fechas-timezone.md` incumplida en toda la pantalla.

El período vive **fuera** del panel de filtros, en su propia tarjeta: es un segundo bloque de
filtrado que compite con el de §B.4.

### B.4 Buscador y filtros — `WebOrderFilters.tsx:161-311`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 18 | campo | «Buscar por # pedido, nombre, teléfono, correo, dirección o producto...» | Búsqueda con rebote de 400 ms; `Enter` aplica al instante | Siempre | WebOrderFilters.tsx:165-174, 85-93 |
| 19 | botón | «Buscar» | Aplica sin esperar el rebote — **redundante con el rebote** | Siempre | WebOrderFilters.tsx:175-177 |
| 20 | botón | «Limpiar» (icono `X`) | `onFilterChange({})`; **no limpia el período ni la sucursal** | Con algún filtro activo | WebOrderFilters.tsx:178-183 |
| 21 | chip | «Pendientes» · «Confirmados» · «Preparando» · «Listos» · «En camino» · «Entregados» · «Cancelados» · «Expirados» | Multi-selección de `status` | Siempre; fila con desplazamiento horizontal | WebOrderFilters.tsx:51-60, 188-202 |
| 22 | chip | «Pago:» + «Pagados» · «Pago pendiente» · «Pago fallido» · «Reembolsados» | Multi-selección de `payment_status` | Siempre | WebOrderFilters.tsx:62-67, 208-221 |
| 23 | chip | «Programados» (icono `CalendarClock`) | `is_scheduled = true` / sin filtro | Siempre | WebOrderFilters.tsx:227-235 |
| 24 | chip | «Tipo:» + «Todos» · «Retiro» · «Delivery propio» · «Terceros» | Selección única de `delivery_type` | Siempre | WebOrderFilters.tsx:69-74, 238-254 |
| 25 | badge | «Filtros activos:» + una píldora por filtro, cada una con «×» | Quita ese filtro | Con algún filtro activo | WebOrderFilters.tsx:258-309 |

Tres filas de chips siempre desplegadas: **20 controles permanentemente a la vista**, ninguno
plegado tras un botón «Filtros». No hay contador de filtros activos. El chip «Rechazados» no
existe pese a que el estado sí (`rejected`), así que los pedidos rechazados solo se ven quitando
todos los filtros. El filtro por `source` está soportado por el servicio
(`webOrdersService.ts:170-172`) y por el tipo del componente (`WebOrderFilters.tsx:35`) pero
**no tiene ningún control**: el origen (tienda web, app, WhatsApp, teléfono) no se puede filtrar
ni se muestra en ningún sitio.

### B.5 Barra de acciones masivas — `page.tsx:834-914`

| # | Tipo | Etiqueta exacta | Qué escribe | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 26 | toggle | Casilla de cabecera | Selecciona/deselecciona los de la página actual | Vista lista | page.tsx:921-929, 399-411 |
| 27 | toggle | Casilla por fila | `selectedOrders` | Vista lista | page.tsx:947-952 |
| 28 | texto | «{n} seleccionado(s)» | Contador | Con selección | page.tsx:837 |
| 29 | botón | «Limpiar» (icono `X`) | Vacía la selección | Con selección | page.tsx:838-841 |
| 30 | botón | «Confirmar» | `status='confirmed'` + `confirmed_at` — **y nada más** | Con selección | page.tsx:844-853; webOrdersService.ts:391-397 |
| 31 | botón | «En proceso» | `status='preparing'` | Con selección | page.tsx:854-863 |
| 32 | botón | «Listos» | `status='ready'` + `ready_at` | Con selección | page.tsx:864-873 |
| 33 | botón | «Entregados» | `status='delivered'` + `delivered_at` | Con selección | page.tsx:874-883 |
| 34 | botón | «Marcar pagados» | `payment_status='paid'` **y `payment_reference=null`** | Con selección | page.tsx:884-893; webOrdersService.ts:547-555 |
| 35 | botón | «Imprimir» | Abre `window.open('')` y escribe HTML a mano | Con selección | page.tsx:894-902, 463-514 |
| 36 | botón | «Exportar CSV» | Descarga `pedidos_AAAA-MM-DD.csv` | Con selección | page.tsx:903-911, 516-543 |

La barra se dibuja **encima de la tabla**, dentro del flujo, con fondo azul claro: empuja la tabla
hacia abajo al seleccionar. Es exactamente el caso que el patrón 1 de
`PATRONES-TRANSVERSALES.md` prohíbe. No hay «Seleccionar los N», no hay «⋯», y las ocho acciones
se reparten en una fila que se envuelve.

«Confirmar» en masa y «Confirmar» en la fila **hacen cosas distintas**: el masivo cambia el estado
y ya; el de la fila abre el diálogo y llama a `webOrderConfirmationService.confirmOrder`, que crea
venta, comanda, propina, cupón, envío, factura, pago y cartera (§H). Confirmar 20 pedidos con la
barra deja 20 pedidos sin venta ni factura.

### B.6 Tabla — vista lista, `page.tsx:915-1152`

Diez columnas, `min-w-[1100px]` con desplazamiento horizontal.

| # | Tipo | Columna / contenido | Qué muestra | Archivo:línea |
|---|---|---|---|---|
| 37 | tabla | (casilla) | Selección | page.tsx:921-929 |
| 38 | botón | **Pedido** — `CopyableId` con `order_number` | Abre el detalle; el icono copia el `id` (uuid), no el número | page.tsx:956-962 |
| 39 | badge | «Programado» (icono `CalendarClock`, índigo) | `is_scheduled` | page.tsx:963-968 |
| 40 | badge | «Propina» (icono `Coins`, ámbar) | `tip_amount > 0`; **no dice cuánto** | page.tsx:969-974 |
| 41 | texto | «📝 {customer_notes}» en amarillo | Nota del cliente, con emoji | page.tsx:976-980 |
| 42 | texto | **Cliente** — nombre, teléfono (icono `Phone`), correo | `customer_name` con respaldo en `customer.full_name` | page.tsx:983-998 |
| 43 | badge | **Estado** — «Pendiente» · «Confirmado» · «Preparando» · «Listo» · «En camino» · «Entregado» · «Cancelado» · «Rechazado» · «Expirado» | Mapa de colores **propio de la página**, distinto del de `StatusBadge` | page.tsx:545-573, 999-1003 |
| 44 | texto | **Entrega** — «Retiro» / «Propio» / «Tercero» + dirección + ciudad, departamento, país | Iconos `Store`/`Bike`/`Truck` | page.tsx:1004-1026 |
| 45 | texto | **Items** — «{n} producto(s)» + las 2 primeras líneas + «+{n} más...» | Resumen | page.tsx:1027-1041 |
| 46 | badge | **Pago** — `PaymentStatusBadge` + «{método} · {submétodo}» | «Pago pendiente» / «Pagado» / «Pago parcial» / «Reembolsado» / «Fallido» | page.tsx:1042-1050; PaymentStatusBadge.tsx:22-48 |
| 47 | texto | **Total** — «${n}» alineado a la derecha | `total.toLocaleString()` sin moneda ni configuración regional | page.tsx:1051 |
| 48 | texto | **Tiempo** — «22 sep, 14:30» + «35 min» | Fecha de creación y antigüedad | page.tsx:1052-1062, 943-944 |
| 49 | botón | **Acciones** — «Confirmar» (icono `CheckCircle`) | Abre el diálogo de confirmación | page.tsx:1065-1075 |
| 50 | botón | (icono `XCircle`, rojo, sin etiqueta ni tooltip) | Abre el diálogo de rechazo | `status='pending'` | page.tsx:1076-1083 |
| 51 | botón | «Preparar» | `status='preparing'` directo, sin confirmación | `status='confirmed'` | page.tsx:1086-1096 |
| 52 | botón | «Listo» | `status='ready'` | `status='preparing'` | page.tsx:1097-1106 |
| 53 | botón | «Entregado» | `status='delivered'` | `ready` + `pickup` | page.tsx:1107-1116 |
| 54 | botón | «Enviar» | `status='in_delivery'` | `ready` + domicilio | page.tsx:1117-1126 |
| 55 | botón | «Entregado» | `status='delivered'` | `in_delivery` | page.tsx:1127-1136 |
| 56 | botón | (icono `Eye`, sin tooltip) | Abre el detalle | Siempre | page.tsx:1137-1144 |

La fila **no** abre el detalle al pulsarla: hace falta el número o el ojo. Hay hasta **tres**
controles en la columna de acciones, uno de ellos destructivo (rechazar) suelto y solo
distinguible por el color rojo. No hay menú «⋯». Patrón 6 incumplido en los cuatro puntos.

No existe columna «Sucursal» aunque el servicio trae `branch:branches(id, name)`
(`webOrdersService.ts:153`): en vista consolidada no se distingue si el pedido es de «Sucursal
Principal» o de «Sucursal Norte».

### B.7 Paginación — `page.tsx:1153-1183`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 57 | paginación | «1–20 de 137» + `‹` + «1 / 7» + `›` | Corta el array en el navegador, 20 por página | Solo si hay más de 20 | page.tsx:1154-1183 |

Dibujada a mano, sin selector de tamaño de página, sin el componente del kit, y **solo se muestra
cuando hay más de 20**: con 20 exactos desaparece el resumen «1–20 de 20». Además `loadOrders`
hace `setCurrentPage(1)` al terminar (`page.tsx:240`) y el auto-refresco llama a `loadOrders` cada
30 s: **si estás en la página 4, vuelves a la 1 cada medio minuto.**

### B.8 Vista tablero — `page.tsx:1187-1295` y `WebOrderCard.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Archivo:línea |
|---|---|---|---|---|
| 58 | texto | «Pendientes (n)» (punto amarillo) | Columna 1 = `pending` | page.tsx:1192-1195, 615 |
| 59 | texto | «Confirmados (n)» (punto azul) | Columna 2 = `confirmed` | page.tsx:1219-1222, 616 |
| 60 | texto | «Preparando (n)» (punto naranja) | Columna 3 = `preparing` | page.tsx:1245-1248, 617 |
| 61 | texto | «Listos / En camino (n)» (punto verde) | Columna 4 = `ready` + `in_delivery` | page.tsx:1271-1274, 618 |
| 62 | botón | «Ver más ({n} restantes)» | Suma 10 tarjetas a esa columna | page.tsx:1205-1209, 620-622 |
| 63 | estado | «Sin pedidos pendientes» · «Sin pedidos confirmados» · «Nada en preparación» · «Sin pedidos listos» | Texto suelto centrado, sin icono ni acción | page.tsx:1210-1214, 1236-1240, 1262-1266, 1288-1292 |
| 64 | estado | 4 columnas × 3 tarjetas de esqueleto | Carga | page.tsx:788-822 |

El tablero **solo cubre 5 de los 9 estados**: entregados, cancelados, rechazados y expirados no
tienen columna y desaparecen de la vista. No se puede arrastrar entre columnas: el avance se hace
con el botón de la tarjeta. Cada columna tiene su propio «Ver más» de 10 en 10, una segunda
paginación distinta de la de la lista.

**Tarjeta `WebOrderCard`** (`WebOrderCard.tsx:127-327`):

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 65 | badge | «¡Urgente!» (rojo) + anillo rojo en la tarjeta | Pedido `pending` con más de **10 minutos** | `isUrgent` | WebOrderCard.tsx:125, 128, 135-139 |
| 66 | texto | `{order_number}` en negrita 18 px | — | Siempre | WebOrderCard.tsx:134 |
| 67 | badge | «Programado» · «Propina» | `is_scheduled`, `tip_amount>0` | Condicional | WebOrderCard.tsx:140-151 |
| 68 | texto | «Hoy 14:30 • 35 min» · «Para: {fecha}» | Creación, antigüedad y fecha programada | Siempre / programados | WebOrderCard.tsx:153-162 |
| 69 | badge | Estado (mapa **propio**, tercer mapa distinto) | — | Siempre | WebOrderCard.tsx:33-43, 164-167 |
| 70 | texto | Cliente (icono `User`) + teléfono (icono `Phone`) | «Cliente anónimo» si no hay nombre | Siempre | WebOrderCard.tsx:171-182 |
| 71 | badge | Tipo de entrega + método de pago (o transportadora si no hay método) | — | Siempre | WebOrderCard.tsx:185-199 |
| 72 | badge | `PaymentStatusBadge` | — | Siempre | WebOrderCard.tsx:200-202 |
| 73 | texto | Dirección (icono `MapPin`) | Solo domicilio | Condicional | WebOrderCard.tsx:205-210 |
| 74 | texto | «{n} producto(s)» + 3 líneas + «+{n} más...» | Resumen con `max-h-20` y scroll interno | Siempre | WebOrderCard.tsx:213-228 |
| 75 | texto | «Total» + «${n}» | — | Siempre | WebOrderCard.tsx:231-234 |
| 76 | texto | «Nota: {customer_notes}» sobre amarillo | — | Condicional | WebOrderCard.tsx:237-242 |
| 77 | botón | «Confirmar» / «Ok» (bajo `sm`) + (icono `XCircle`) | Diálogos | `pending` | WebOrderCard.tsx:246-266 |
| 78 | botón | «Iniciar preparación» / «Preparar» | `preparing` | `confirmed` | WebOrderCard.tsx:268-278 |
| 79 | botón | «Marcar listo» / «Listo» | `ready` | `preparing` | WebOrderCard.tsx:280-290 |
| 80 | botón | «Enviar a domicilio» / «Enviar» | `in_delivery` | `ready` + domicilio | WebOrderCard.tsx:292-302 |
| 81 | botón | «Marcar entregado» / «Entregado» | `delivered` | `ready`+`pickup` ó `in_delivery` | WebOrderCard.tsx:304-314 |
| 82 | botón | (icono `Eye`) | Detalle | Siempre | WebOrderCard.tsx:316-323 |

Las etiquetas de la tarjeta y las de la fila **no coinciden** para la misma acción: «Preparar»
(fila) frente a «Iniciar preparación» (tarjeta); «Listo» frente a «Marcar listo»; «Enviar» frente
a «Enviar a domicilio»; «Entregado» frente a «Marcar entregado». Y la tarjeta de `pending` en el
tablero no ofrece ninguna acción en los estados finales.

### B.9 Diálogos del listado

| # | Tipo | Etiqueta exacta | Qué hace | Archivo:línea |
|---|---|---|---|---|
| 83 | diálogo | «Confirmar pedido» — «Indica el tiempo estimado de preparación» | Cabecera | page.tsx:1298-1305 |
| 84 | campo | «Tiempo de preparación (Listo aprox)» — número + selector «Minutos»/«Horas»/«Días» | `prepMs` | page.tsx:1307-1334 |
| 85 | campo | «Tiempo de traslado (Entrega aprox)» + «Tiempo desde que está listo hasta que llega al cliente. Pon 0 si es retiro en tienda.» | `transitMs` | page.tsx:1335-1365 |
| 86 | toggle | «Marcar como pagado» | Fuerza `payment_status='paid'` y dispara factura, pago y cartera | page.tsx:1366-1375 |
| 87 | botón | «Cancelar» · «Confirmar pedido» (con `Loader2`) | — | page.tsx:1377-1392 |
| 88 | diálogo | «Rechazar pedido» — «Indica el motivo del rechazo. El cliente será notificado.» | Cabecera | page.tsx:1397-1404 |
| 89 | campo | «Motivo del rechazo», `placeholder` «Ej: Producto agotado, fuera de horario de entrega...» | Texto libre obligatorio | page.tsx:1406-1414 |
| 90 | botón | «Cancelar» · «Rechazar pedido» (`disabled` sin motivo) | — | page.tsx:1416-1436 |

El diálogo de confirmación del listado es una **segunda implementación** del que vive en
`[id]/components/ConfirmOrderDialog.tsx`, y diverge: el del listado muestra siempre el campo de
traslado y explica «Pon 0 si es retiro en tienda»; el del detalle lo oculta cuando es retiro
(`ConfirmOrderDialog.tsx:128-161`) y añade la frase «El cliente recibirá una notificación con
estos tiempos estimados.» (`:163-165`).

### B.10 Estados del listado

| # | Tipo | Etiqueta exacta | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|
| 91 | estado | Tabla de 6 filas de esqueleto con las 10 cabeceras | `loading` + vista lista | page.tsx:756-786 |
| 92 | estado | «No hay pedidos que mostrar» | `orders.length === 0` | page.tsx:825-829 |
| 93 | toast | «Error» / «No se pudieron cargar los pedidos» | Fallo de carga | page.tsx:243-247 |
| 94 | toast | «🔔 Nuevo pedido» / «Pedido {order_number} recibido» | Evento `INSERT` con `status='pending'` | page.tsx:288-291 |
| 95 | toast | «Estado actualizado» / «Pedido marcado como {estado}» | Cambio de estado por fila | page.tsx:376-379 |
| 96 | toast | «Pedido confirmado» / «Venta creada · Comanda enviada a cocina · Listo: 30 min · Entrega: 30 min · Marcado como pagado · Cupón redimido» | Confirmación | page.tsx:326-333 |
| 97 | toast | «Pedido rechazado» / «El cliente será notificado» | Rechazo | page.tsx:355-358 |
| 98 | toast | «Acción masiva completada» / «{n} pedido(s) marcado(s) como {estado}» | Masivos | page.tsx:423-426, 446-449 |
| 99 | toast | «Preparando impresión» / «{n} pedido(s) listos para imprimir» | Impresión masiva | page.tsx:510-513 |
| 100 | toast | «Exportación completada» / «{n} pedido(s) exportado(s) a CSV» | Exportación | page.tsx:539-542 |

El vacío es un párrafo gris dentro de una tarjeta: sin icono, sin distinguir «no hay nada todavía»
de «los filtros no devuelven nada», y **sin ninguna acción**. No hay estado de error en pantalla
—solo un toast que se va—, ni estado «sin sucursal asignada» pese a que la pantalla es de ámbito
de sucursal.

---

## C. Detalle — `/app/pos/pedidos-online/[id]`

Tres tarjetas a la izquierda (`lg:col-span-2`) y tres a la derecha (`[id]/page.tsx:71-107`).

### C.1 Cabecera — `OrderHeader.tsx:26-77`

| # | Tipo | Etiqueta exacta | Qué muestra | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 101 | botón | «Volver» (icono `ArrowLeft`, texto oculto bajo `sm`) | `router.back()` | Siempre | OrderHeader.tsx:29-32 |
| 102 | texto | `{order_number}` a 24 px | — | Siempre | OrderHeader.tsx:35 |
| 103 | badge | `StatusBadge size="lg"` | Cuarto mapa de estados, con iconos distintos a los otros tres | Siempre | OrderHeader.tsx:36; StatusBadge.tsx:20-70 |
| 104 | badge | «Programado» (índigo) | `is_scheduled` | Condicional | OrderHeader.tsx:37-42 |
| 105 | badge | «Cupón: {coupon_code}» (esmeralda, icono `Tag`) | `coupon_code` | Condicional | OrderHeader.tsx:43-48 |
| 106 | badge | «Propina: ${n}» (ámbar, icono `Coins`) | `tip_amount > 0` | Condicional | OrderHeader.tsx:49-54 |
| 107 | texto | «22 sep 2026, 14:30» | `created_at` con `toLocaleString('es-CO')` — zona del navegador | Siempre | OrderHeader.tsx:19-24, 57 |
| 108 | texto | «Para: {fecha}» (índigo) | `scheduled_at` | Programados | OrderHeader.tsx:58-63 |
| 109 | enlace | «Ver venta POS» (icono `ExternalLink`) | → `/app/pos/ventas/{sale_id}` | `sale_id` presente | OrderHeader.tsx:64-72 |
| 110 | badge | `PaymentStatusBadge` a la derecha del todo | Estado de pago | Siempre | OrderHeader.tsx:76 |

No hay migas, ni `BranchBadge`, ni origen del pedido, ni número de factura (el servicio lo devuelve
en `invoiceNumber` y se descarta), ni enlace a la factura ni a la comanda.

### C.2 Productos y totales — `OrderProductsCard.tsx` + `OrderItemsList.tsx` + `OrderTotals.tsx`

| # | Tipo | Etiqueta exacta | Qué muestra | Archivo:línea |
|---|---|---|---|---|
| 111 | texto | «Productos ({n})» (icono `Receipt`) | Título de la tarjeta | OrderProductsCard.tsx:18-21 |
| 112 | texto | Nombre del producto | Por línea | OrderItemsList.tsx:80 |
| 113 | badge | «Pendiente» · «Preparando» · «Listo» · «Cancelado» | Estado **por línea** (`web_order_items.status`), quinto mapa de colores | OrderItemsList.tsx:13-18, 81-85 |
| 114 | texto | «SKU: {product_sku}» | Condicional | OrderItemsList.tsx:87-89 |
| 115 | texto | «📝 {notes}» en amarillo | Nota del cliente por línea, con emoji | OrderItemsList.tsx:90-92 |
| 116 | texto | «+ {mod.name} (+${mod.price})» | Modificadores | OrderItemsList.tsx:93-101 |
| 117 | texto | «{cantidad} x ${precio}» + «${total}» | Derecha | OrderItemsList.tsx:103-108 |
| 118 | texto | «Subtotal» | Siempre | OrderTotals.tsx:41-44 |
| 119 | texto | «Impuestos» | Si `tax_total > 0` — **etiqueta genérica, sin nombre ni tasa** | OrderTotals.tsx:46-51 |
| 120 | texto | «Descuento» en verde con «-$» | Si `discount_total > 0` | OrderTotals.tsx:53-58 |
| 121 | texto | «Envío» | Si `delivery_fee > 0` | OrderTotals.tsx:60-65 |
| 122 | texto | «Propina» | Si `tip_amount > 0` | OrderTotals.tsx:67-72 |
| 123 | texto | «Total» a 18 px en color de marca | Siempre | OrderTotals.tsx:76-79 |

«Impuestos» es una línea única con el importe agregado. El pedido no guarda el desglose por
impuesto, y la regla I.4.1 de la auditoría de productos («nada dice IVA; toda etiqueta de impuesto
es `{nombre} {tasa}` y admite N filas») **no se puede cumplir con los datos actuales**: el nombre
del impuesto habría que traerlo de `product_taxes` a través de `sale_items`, o guardarlo en el
pedido al crearlo. El estado por línea (`web_order_items.status`) se pinta pero **ningún control lo
cambia**: la comanda de cocina avanza en `kitchen_ticket_items`, no aquí. Y `serial_ids`
(columna real de `web_order_items`) no se muestra nunca.

La moneda es el símbolo «$» cableado (`OrderTotals.tsx:24, 27`) con `toLocaleString()` sin
configuración regional: el separador de miles lo decide el navegador.

### C.3 Notas — `OrderNotesCard.tsx:12-46`

| # | Tipo | Etiqueta exacta | Qué muestra | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 124 | texto | «Notas» (icono `FileText`) | Título | Si hay alguna de las dos | OrderNotesCard.tsx:13-23 |
| 125 | texto | «Nota del cliente:» sobre amarillo | `customer_notes` | Condicional | OrderNotesCard.tsx:26-34 |
| 126 | texto | «Notas internas:» sobre gris | `internal_notes` | Condicional | OrderNotesCard.tsx:35-43 |

`internal_notes` se **lee** pero **no hay ningún control que la escriba** en toda la interfaz. El
servicio la acepta como opción de `updateOrderStatus` (`webOrdersService.ts:411-413`) y el endpoint
`PATCH /api/web-orders/[id]` también, pero ninguna pantalla la envía. Es un campo de solo lectura
que nunca tendrá contenido salvo que lo escriba la tienda web.

### C.4 Línea de tiempo — `OrderTimelineCard.tsx` + `OrderTimeline.tsx:30-231`

| # | Tipo | Paso | Marca de tiempo real | Archivo:línea |
|---|---|---|---|---|
| 127 | texto | «Historial del pedido» (icono `History`) | Título | OrderTimelineCard.tsx:16-19 |
| 128 | estado | «Pedido recibido» | `created_at` ✔ | OrderTimeline.tsx:54-61 |
| 129 | estado | «Programado para» | `scheduled_at` ✔ | OrderTimeline.tsx:62-69 |
| 130 | estado | «Confirmado» | `confirmed_at` ✔ | OrderTimeline.tsx:70-77 |
| 131 | estado | «En preparación» | **nunca** — `timestamp: order.status === 'preparing' ? undefined : undefined` | OrderTimeline.tsx:78-85 |
| 132 | estado | «Listo» | `ready_at` ✔ | OrderTimeline.tsx:86-93 |
| 133 | estado | «En camino» | **nunca** — `timestamp: undefined` | OrderTimeline.tsx:96-105 |
| 134 | estado | «Entregado» | `delivered_at` ✔ | OrderTimeline.tsx:107-114 |
| 135 | estado | «Cancelado» / «Rechazado» / «Expirado» + «Motivo: {cancellation_reason}» | `cancelled_at` ✔ | OrderTimeline.tsx:116-126, 221-225 |

Dos de los siete pasos **no pueden** llevar hora: no existen columnas `preparing_at` ni
`in_delivery_at` en `web_orders` (verificado, §L). La línea 82 es un ternario que devuelve
`undefined` en ambas ramas: el autor lo dejó marcado como pendiente. Tampoco se dice **quién**
hizo cada paso: `confirmed_by` se escribe pero no se muestra, y `cancelled_by` **no se escribe
nunca** (§L).

Existe una variante `horizontal` (`OrderTimeline.tsx:133-178`) que ninguna pantalla usa.

### C.5 Acciones — `OrderActionsCard.tsx` + `OrderActions.tsx:96-210`

| # | Tipo | Etiqueta exacta | Qué escribe | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 136 | texto | «Acciones» (icono `Zap`) | Título | Siempre | OrderActionsCard.tsx:40-43 |
| 137 | botón | «Confirmar pedido» | Abre el diálogo → cadena completa (§H) | `pending` | OrderActions.tsx:101-108 |
| 138 | botón | «Rechazar» (destructivo) | Abre `CancelOrderDialog` | `pending` | OrderActions.tsx:109-112 |
| 139 | botón | «Iniciar preparación» (icono `Timer`) | `status='preparing'` | `confirmed` | OrderActions.tsx:116-125 |
| 140 | botón | «Marcar como listo» (icono `Package`) | `status='ready'`, `ready_at` | `preparing` | OrderActions.tsx:127-136 |
| 141 | botón | «Enviar a domicilio» (icono `Truck`) | `status='in_delivery'` + arrastra `estimated_delivery_at` | `ready` + domicilio | OrderActions.tsx:138-147; useWebOrderDetail.ts:212-230 |
| 142 | botón | «Marcar como entregado» | `status='delivered'`, `delivered_at` | `ready`+`pickup` ó `in_delivery` | OrderActions.tsx:149-158 |
| 143 | botón | «Marcar como pagado» (contorno verde, icono `DollarSign`) | `web_orders.payment_status='paid'` + `sales.{payment_status,balance,status}` **a mano** | `payment_status≠'paid'` y no `pending` | OrderActions.tsx:160-175; useWebOrderDetail.ts:303-343 |
| 144 | botón | «Crear venta» (secundario, icono `Receipt`) | Si hay `sale_id` navega a la venta; si no, **vuelve a confirmar el pedido** | `delivered` sin `sale_id` | OrderActions.tsx:177-192; useWebOrderDetail.ts:261-286 |
| 145 | botón | «Imprimir» (icono `Printer`) | **Nunca se dibuja**: la página no pasa `onPrint` | Nunca | OrderActions.tsx:196-201; `[id]/page.tsx:81-93` |
| 146 | botón | «Cancelar» (contorno rojo, icono `XCircle`) | Abre `CancelOrderDialog` | `pending` ó `confirmed` | OrderActions.tsx:202-207 |

Existe una variante `compact` con solo iconos (`OrderActions.tsx:59-94`) que **ninguna pantalla
usa**.

A partir de `preparing` **no hay forma de cancelar**: `canCancel = ['pending','confirmed']`
(`OrderActions.tsx:56`). Un pedido en preparación que el cliente anula solo se puede sacar del
tablero marcándolo «entregado». Es el callejón sin salida más grave de la pantalla.

### C.6 Cliente — `OrderCustomerCard.tsx:12-85`

| # | Tipo | Etiqueta exacta | Qué muestra | Archivo:línea |
|---|---|---|---|---|
| 147 | texto | «Cliente» (icono `User`) | Título | OrderCustomerCard.tsx:20-23 |
| 148 | texto | Nombre, o «Cliente anónimo» | `customer_name` → `customer.full_name` | OrderCustomerCard.tsx:13, 26 |
| 149 | enlace | Teléfono → `tel:` | Condicional | OrderCustomerCard.tsx:28-41 |
| 150 | enlace | Correo → `mailto:` | Condicional | OrderCustomerCard.tsx:43-56 |
| 151 | texto | Dirección compuesta: calle, barrio, ciudad, departamento, país | Solo domicilio | OrderCustomerCard.tsx:59-74 |
| 152 | texto | «📝 {instructions}» | Indicaciones de entrega | OrderCustomerCard.tsx:75-79 |

**No hay enlace a la ficha del cliente** (`/app/clientes/{customer_id}`) aunque `customer_id`
existe, ni forma de asociar un pedido anónimo a un cliente del CRM, ni de ver su historial. No hay
enlace de WhatsApp pese a que `source` admite `'whatsapp'`.

### C.7 Entrega — `OrderDeliveryCard.tsx:39-176`

| # | Tipo | Etiqueta exacta | Qué muestra | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 153 | texto | «Entrega» (icono `Truck`) | Título | Siempre | OrderDeliveryCard.tsx:66-69 |
| 154 | texto | «Retiro en tienda» / «Delivery propio» / «Delivery terceros» | Iconos `Store`/`Bike`/`Truck` | Siempre | OrderDeliveryCard.tsx:22-37, 73-81 |
| 155 | badge | `{delivery_partner}` | Transportadora del pedido | Condicional | OrderDeliveryCard.tsx:76-80 |
| 156 | texto | Dirección, barrio, «ciudad, departamento, país» | — | Domicilio | OrderDeliveryCard.tsx:84-101 |
| 157 | texto | «📝 {instructions}» | — | Condicional | OrderDeliveryCard.tsx:102-106 |
| 158 | enlace | «Ver en mapa» (icono `Navigation`) → Google Maps | `lat` y `lng` | Condicional | OrderDeliveryCard.tsx:107-120 |
| 159 | texto | «Programado: {fecha}» | `scheduled_at` | Condicional | OrderDeliveryCard.tsx:125-130 |
| 160 | texto | «Listo aprox: {hora}» en verde | `estimated_ready_at`, **solo hora** | Condicional | OrderDeliveryCard.tsx:132-137 |
| 161 | texto | «Entrega aprox: {hora}» en morado | `estimated_delivery_at`, **solo hora** | Domicilio | OrderDeliveryCard.tsx:139-144 |
| 162 | botón | «Asignar Conductor» (icono `UserPlus`) | Delivery propio: si está `ready` crea el envío; si no abre el diálogo | `delivery_own` y estado en `confirmed`/`preparing`/`ready` | OrderDeliveryCard.tsx:44, 146-157; `[id]/page.tsx:96-105` |

«Listo aprox» y «Entrega aprox» se formatean con `toLocaleTimeString` **sin fecha**
(`OrderDeliveryCard.tsx:47-52`). Para una organización de comercio (`type_id = 3`) el
predeterminado de preparación es **1 día** y el de traslado **5 días**
(`useWebOrderDetail.ts:64-69`), así que la pantalla muestra «Listo aprox: 14:30» para algo que es
dentro de seis días. Es el error más confuso del detalle.

### C.8 Seguimiento del envío — `DeliveryTrackingCard.tsx:34-330`

Solo se monta con `delivery_own` y estado `in_delivery` o `delivered`
(`OrderDeliveryCard.tsx:45`).

| # | Tipo | Etiqueta exacta | Qué muestra | Archivo:línea |
|---|---|---|---|---|
| 163 | texto | «Tracking» (icono `Truck`) | Título | DeliveryTrackingCard.tsx:162-165 |
| 164 | badge | «Pendiente» · «Asignado» · «Recogido» · «En camino» · «Entregado» · «Devuelto» · «Cancelado» | Estado del `shipment`, **sexto mapa de estados** | DeliveryTrackingCard.tsx:70-94, 166-168 |
| 165 | texto | «Tracking:» + número monoespaciado | `shipment.tracking_number` | DeliveryTrackingCard.tsx:173-176 |
| 166 | texto | «Vehículo asignado» + «{placa} - {marca} {modelo}» | Del módulo de transporte | DeliveryTrackingCard.tsx:179-194 |
| 167 | texto | «Conductor» + nombre + enlace `tel:` | Del módulo de transporte | DeliveryTrackingCard.tsx:196-218 |
| 168 | texto | «Entrega estimada:» + fecha y hora | `shipment.expected_delivery_date` | DeliveryTrackingCard.tsx:221-232 |
| 169 | texto | «Historial» — últimos 5 eventos con hora | `transport_events` | DeliveryTrackingCard.tsx:235-264 |
| 170 | texto | «Prueba de entrega» — «Recibido por:», «Fecha:», «Calificación: ⭐⭐⭐⭐» | `proof_of_delivery` | DeliveryTrackingCard.tsx:267-289 |
| 171 | botón | «Ver firma» (icono `ExternalLink`) | Abre `signature_url` | DeliveryTrackingCard.tsx:290-297 |
| 172 | botón | «Ver ruta en Google Maps» (icono `Navigation`) | Solo con `out_for_delivery` y coordenadas | DeliveryTrackingCard.tsx:304-315 |
| 173 | botón | «Actualizar estado» (icono `RefreshCw`) | Recarga el envío a mano | DeliveryTrackingCard.tsx:318-326 |
| 174 | estado | «Delivery Propio» + «No hay envío asignado para este pedido» + «Asignar Delivery» | Sin envío | DeliveryTrackingCard.tsx:131-156 |
| 175 | estado | 3 líneas de esqueleto | Cargando | DeliveryTrackingCard.tsx:110-128 |

El seguimiento **no se actualiza solo**: hace falta pulsar «Actualizar estado». Y no hay
seguimiento para `delivery_third_party`: si el pedido va por transportadora, lo único que se ve es
el badge con el nombre del socio.

### C.9 Diálogos del detalle

| # | Tipo | Etiqueta exacta | Qué hace | Archivo:línea |
|---|---|---|---|---|
| 176 | diálogo | «Confirmar pedido» — «Indica los tiempos estimados para notificar al cliente.» | Cabecera | ConfirmOrderDialog.tsx:92-95 |
| 177 | campo | «Tiempo de preparación (Listo aprox)» + «Minutos»/«Horas»/«Días» | `prepMs` | ConfirmOrderDialog.tsx:99-126 |
| 178 | campo | «Tiempo de traslado (Entrega aprox)» + «Tiempo desde que está listo hasta que llega al cliente.» | `transitMs`; oculto en retiro | ConfirmOrderDialog.tsx:128-161 |
| 179 | texto | «El cliente recibirá una notificación con estos tiempos estimados.» | **Falso**, ver §M | ConfirmOrderDialog.tsx:163-165 |
| 180 | toggle | «Marcar como pagado» | `markAsPaid` | ConfirmOrderDialog.tsx:167-178 |
| 181 | botón | «Cancelar» · «Confirmar pedido» | — | ConfirmOrderDialog.tsx:180-188 |
| 182 | diálogo | «Rechazar pedido» / «Cancelar pedido» — «Indica el motivo. El cliente será notificado automáticamente.» | Título según estado | CancelOrderDialog.tsx:36-52 |
| 183 | campo | «Motivo» + «Este motivo se mostrará al cliente en su notificación.» | Texto libre obligatorio | CancelOrderDialog.tsx:54-67 |
| 184 | botón | «Volver» · «Rechazar» / «Cancelar pedido» | El botón de salida se llama **«Volver»**, no «Cancelar» | CancelOrderDialog.tsx:68-80 |
| 185 | diálogo | «Asignar Delivery» — «Selecciona el vehículo y conductor para la entrega» | Cabecera | AssignDeliveryDialog.tsx:183-191 |
| 186 | campo | «Vehículo» + «Seleccionar vehículo»; opciones = placa + «Moto»/«Carro»/«Van»/«Bicicleta»/«Camión» + marca y modelo | Del módulo de transporte | AssignDeliveryDialog.tsx:210-240, 165-174 |
| 187 | campo | «Conductor» + «Seleccionar conductor»; opciones = nombre o «Conductor {licencia}» + «Lic: {categoría}» | Ídem | AssignDeliveryDialog.tsx:242-272 |
| 188 | campo | «Tiempo estimado de entrega (minutos)» (5–180) + «Llegada estimada: 15:05» | Escribe `expected_delivery_date` del envío, **no** `estimated_delivery_at` del pedido | AssignDeliveryDialog.tsx:274-295, 133-144 |
| 189 | botón | «Cancelar» · «Asignar Delivery» | — | AssignDeliveryDialog.tsx:299-310 |
| 190 | estado | «No hay vehículos disponibles para delivery» / «No hay conductores disponibles» + «Configura vehículos y conductores en el módulo de Transporte» | Sin datos | AssignDeliveryDialog.tsx:94-99, 199-206 |
| 191 | estado | 3 líneas de esqueleto | Cargando | AssignDeliveryDialog.tsx:193-198 |
| 192 | toast | «Campos requeridos» / «Selecciona un vehículo y un conductor» | Validación | AssignDeliveryDialog.tsx:109-116 |
| 193 | toast | «Asignación exitosa» / «Se ha asignado el conductor y vehículo al pedido» | — | AssignDeliveryDialog.tsx:146-149 |
| 194 | toast | «Error» / «No se encontró el envío asociado. Intenta marcar el pedido como listo primero.» | Sin envío previo | AssignDeliveryDialog.tsx:123-131 |

El tope de 180 minutos del campo de entrega es incompatible con el predeterminado de 5 días de una
organización de comercio.

### C.10 Estados del detalle

| # | Tipo | Etiqueta exacta | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|
| 195 | estado | `PageHeaderSkeleton` + `DetailSkeleton` | `loading` | OrderLoadingState.tsx:5-12 |
| 196 | estado | «Pedido no encontrado» (icono `FileQuestion`) + «Volver» + «Ver todos los pedidos» | `!order` | OrderNotFoundState.tsx:12-34 |
| 197 | toast | «Error» / «No se pudo cargar el pedido» | Fallo de carga | useWebOrderDetail.ts:90-94 |
| 198 | toast | «Pedido confirmado» / «Venta creada · Comanda enviada a cocina · Listo: 1 días · Entrega: 5 días · Marcado como pagado · Envío creado» | Confirmación | useWebOrderDetail.ts:147-154 |
| 199 | toast | «Pedido rechazado» · «Pedido en preparación» · «Pedido listo para entrega» · «Pedido en camino» · «Pedido entregado» · «Pedido cancelado» · «Pedido marcado como pagado» · «Venta creada exitosamente» · «Envío creado» / «Ahora puedes asignar un conductor» | Por acción | useWebOrderDetail.ts:175, 190, 203, 223, 236, 250, 278, 293, 331 |
| 200 | toast | «Error» a secas, **sin descripción**, en 6 manejadores | Cualquier fallo | useWebOrderDetail.ts:180, 193, 206, 239, 255 |

Un error al marcar «listo» muestra un toast rojo que dice solo «Error». El estado «no encontrado»
es también el estado de «sin permiso» y el de «error de red»: los tres caen en el mismo sitio y
dicen lo mismo.

---

## D. Componentes del dominio que nadie usa

| Componente | Estado | Archivo |
|---|---|---|
| `ProofOfDeliveryView` (11 KB) | Exportado en `index.ts:24` y **no importado en ninguna parte** | ProofOfDeliveryView.tsx |
| `CustomerInfo` (3 variantes) | Exportado y **no usado**: el detalle tiene su propia `OrderCustomerCard` | CustomerInfo.tsx |
| `DeliveryInfo` (2 variantes) | Exportado y **no usado**: el detalle tiene su propia `OrderDeliveryCard` | DeliveryInfo.tsx |
| `DeliveryTypeBadge` + `DeliveryTypeIcon` + `getDeliveryTypeLabel` | Exportados y **no usados**: la fila y la tarjeta pintan sus propios iconos y etiquetas | DeliveryTypeBadge.tsx |
| `OrderActions variant="compact"` | Rama muerta | OrderActions.tsx:59-94 |
| `OrderTimeline variant="horizontal"` | Rama muerta | OrderTimeline.tsx:133-178 |
| `OrderItemsList variant="compact"` y `"summary"` | Ramas muertas: la lista y la tarjeta repiten el resumen a mano | OrderItemsList.tsx:29-69 |
| `OrderTotals variant="compact"` | Rama muerta: `WebOrderCard` repite el total a mano | OrderTotals.tsx:30-37 |
| `webOrdersService.convertToSale()` (90 líneas) | **Nunca se llama**. Crea la venta sin factura, sin propina, sin cupón y sin comanda | webOrdersService.ts:568-658 |
| `webOrdersService.confirmOrder / startPreparing / markAsReady / startDelivery / markAsDelivered` | Envoltorios nunca llamados: la interfaz usa `updateOrderStatus` directo | webOrdersService.ts:437-475 |
| `getPendingOrders()` | Nunca llamado | webOrdersService.ts:233-235 |
| `getOrderStats().by_delivery_type` y `.by_source` | Se calculan y se tiran: el componente de KPIs ni los recibe | webOrdersService.ts:694-695, 734-742 |
| `WebCommerceObservability` (17 KB) | Vive en `components/pos/pedidos-online/` pero se monta en **`/app/inicio`**, no en Pedidos Online | `app/app/inicio/page.tsx:32, 348` |
| `POST /api/web-orders/[id]/refund` (331 líneas) | Completo (nota crédito, devolución de stock, ajuste de cartera) y **sin ningún botón en el ERP** | `api/web-orders/[id]/refund/route.ts` |

---

## E. El servicio: qué lee y qué escribe

### E.1 Lecturas

| Método | Tablas | Observaciones |
|---|---|---|
| `getOrders(filters)` | `web_orders` + `web_order_items` + `customers(id, full_name, email, phone)` + `branches(id, name)` | **Sin `limit` ni `range`**: trae todos los pedidos de la organización en el rango. La paginación es del navegador |
| `getOrders` con búsqueda | Consulta previa a `web_order_items` por `product_name` y luego `id.in.(...)` | Dos viajes; si la consulta previa devuelve cientos de ids la URL de PostgREST puede romperse |
| `getOrderById(id)` | Ídem + `customers(address, city)` + `branches(address, phone)` | Usado solo por la confirmación del listado; el detalle repite la consulta a mano en el hook |
| `getOrderStats(from, to, branch)` | `web_orders` (`id, status, total, delivery_type, source, payment_status`) | **Trae todas las filas y agrega en el navegador**. Se invoca **dos veces** por carga (período actual y anterior) |
| `useWebOrderDetail.loadOrder` | Repite el `select` de `getOrderById` | Duplicación literal (`useWebOrderDetail.ts:74-84`) |
| `DeliveryTrackingCard` | `shipments`, `transport_events`, `proof_of_delivery` vía `deliveryIntegrationService` | Tres consultas más al abrir el detalle |
| `AssignDeliveryDialog` | `vehicles`, `drivers`, `employees` vía `deliveryIntegrationService` | Dos consultas al abrir |

Cada carga del listado dispara **3 consultas paralelas** que leen la tabla entera del rango, y el
auto-refresco las repite cada 30 s. Con 2.000 pedidos en «Últimos 30 días» son 6.000 filas por
minuto por pestaña abierta.

### E.2 Escrituras desde Pedidos Online

| Acción | Tablas que escribe | Ruta |
|---|---|---|
| Confirmar (fila, tarjeta o detalle) | `sales`, `sale_items`, `stock_levels` + `stock_movements`, `kitchen_tickets`, `kitchen_ticket_items`, `tips`, `coupon_redemptions`, `shipments`, `invoice_sales`, `invoice_items`, `payments`, `notifications`, `accounts_receivable`, `web_orders` | `webOrderConfirmationService.confirmOrder` |
| Confirmar en masa | `web_orders` (solo `status` + `confirmed_at`) | `webOrdersService.updateOrderStatus` |
| Preparar / Listo / Enviar / Entregado | `web_orders` | `updateOrderStatus` (lista) o `supabase.update` (detalle) |
| Rechazar desde el listado | `stock_levels`, `serial_numbers`, `web_orders` | `webOrdersService.rejectOrder` |
| Rechazar desde el detalle | `web_orders` **y nada más** | `useWebOrderDetail.handleRejectOrder` |
| Cancelar | `stock_levels`, `serial_numbers`, `web_orders` | `webOrdersService.cancelOrder` |
| Marcar como pagado (detalle) | `web_orders`, `sales` | `useWebOrderDetail.handleMarkAsPaid` |
| Marcar pagados (masivo) | `web_orders` (`payment_status` **y `payment_reference`**) | `webOrdersService.updatePaymentStatus` |
| Asignar conductor | `shipments` (`metadata`, `expected_delivery_date`) | `deliveryIntegrationService.assignVehicleAndDriver` |

### E.3 Qué trae de otras tablas y qué se pierde por el camino

- **`customers`**: `id`, `full_name`, `email`, `phone` (y `address`, `city` en el detalle). Se usan
  solo como respaldo de los campos desnormalizados del pedido. Nunca se enlaza a la ficha.
- **`branches`**: `id`, `name` (y `address`, `phone` en el detalle). **Se traen y no se pintan
  nunca.** Ni columna, ni badge, ni dirección de la tienda para el retiro.
- **`sales`**: solo el `sale_id` para el enlace «Ver venta POS». Ni número, ni estado, ni total de
  la venta.
- **`payments`**: se crean en la confirmación y no se muestran. No hay lista de pagos del pedido.
- **`invoice_sales`**: se crea y su número (`invoiceNumber`) se devuelve en el resultado y se
  **descarta**; no hay enlace a la factura.
- **`shipments` / `drivers` / `vehicles` / `transport_events` / `proof_of_delivery`**: solo para
  `delivery_own` y solo en el detalle.
- **`coupons` / `coupon_redemptions`**: el detalle muestra «Cupón: {código}» pero no el descuento
  que aplicó ese cupón (el importe va agregado en `discount_total`).
- **`kitchen_tickets`**: se crea la comanda y **no hay enlace a ella** ni forma de reimprimirla.

---

## F. Ciclo de estados completo y quién lo cambia

`CHECK` real en la base de datos (`web_orders_status_check`), **10 valores**:

```
pending · confirmed · preparing · ready · in_delivery · delivered · cancelled · rejected · refunded · expired
```

El tipo de TypeScript (`webOrdersService.ts:7`) declara **9**: le falta `refunded`. Consecuencia
directa en §M.

| De → a | Quién lo dispara | Qué escribe además |
|---|---|---|
| (nace) → `pending` | Tienda web (`POST /api/web-orders`) o `webOrdersService.createOrder` | Reserva stock (`stock_movementService.reserveStock`) |
| `pending` → `confirmed` | Diálogo «Confirmar pedido» (fila, tarjeta o detalle) | `confirmed_at`, `confirmed_by`, `sale_id`, `estimated_ready_at`, `estimated_delivery_at`, `payment_status` si se marcó pagado + toda la cadena de §H |
| `pending` → `confirmed` | Barra masiva «Confirmar» | Solo `confirmed_at` |
| `pending` → `confirmed` | `POST /[id]/auto-confirm` (webhook de la pasarela) | Cadena completa del lado servidor |
| `confirmed` → `preparing` | «Preparar» / «Iniciar preparación» | Nada más (**no hay `preparing_at`**) |
| `preparing` → `ready` | «Listo» / «Marcar como listo» | `ready_at` |
| `ready` → `in_delivery` | «Enviar» / «Enviar a domicilio» | Arrastra `estimated_delivery_at` si ya existía (**no hay `in_delivery_at`**) |
| `ready`/`in_delivery` → `delivered` | «Entregado» / «Marcar como entregado» | `delivered_at` |
| `pending` → `rejected` | Diálogo de rechazo | `cancelled_at`, `cancellation_reason`; libera stock **solo desde el listado** |
| `pending`/`confirmed` → `cancelled` | «Cancelar» | `cancelled_at`, `cancellation_reason`, libera stock |
| `pending` → `expired` | Cron `expire_pending_web_orders` (RPC) | `payment_status='failed'`, `cancelled_at`, `cancellation_reason='Expirado por falta de pago'`, `stock_released_at` |
| cualquiera → `refunded` | **Nadie**. La ruta `/[id]/refund` marca `payment_status='refunded'`, no `status` | — |

Ningún transición está validada: la interfaz oculta los botones que no aplican, pero el `UPDATE`
va directo a la tabla sin guarda de máquina de estados, ni en el cliente ni en la base de datos. Un
pedido `delivered` puede volver a `confirmed` (§M).

**`cancelled_by` no se escribe nunca.** La columna existe y apunta a `auth.users`, pero ni el
servicio, ni el hook, ni los endpoints la rellenan: quién canceló un pedido es irrecuperable.

---

## G. Tiempo real, sonido y auto-refresco

| Pieza | Cómo funciona | Qué pasa si falla |
|---|---|---|
| Suscripción | `supabase.channel('web_orders_changes')` a `postgres_changes` `event:'*'` sobre `web_orders`, filtrada por `organization_id` y, si hay sucursal concreta, por `branch_id` (`webOrdersService.ts:754-777`). La tabla **sí** está en la publicación `supabase_realtime` (verificado) | `.subscribe()` **sin callback de estado**: si el canal no se suscribe (token vencido, límite de canales, red), nadie se entera. No hay indicador de «en vivo» ni de «desconectado» |
| Aviso de pedido nuevo | Solo para `INSERT` con `status='pending'` (`page.tsx:283`) | Un pedido creado ya pagado (la tienda inserta y el webhook auto-confirma) **no avisa** |
| Sonido | `new Audio('/sounds/notification.mp3')` (`page.tsx:305`) | **El archivo no existe**: no hay carpeta `public/sounds` en el repositorio. `.catch(() => {})` traga el error. El botón del altavoz no hace nada audible |
| Recarga tras evento | Rebote de 800 ms y `loadOrders()` (`page.tsx:272-301`) | Correcto, pero cada recarga dispara 3 consultas completas |
| Auto-refresco | `setInterval(loadOrders, 30000)` (`page.tsx:258-266`) | Redundante con el tiempo real; y **reinicia la paginación a 1** en cada ciclo (`page.tsx:240`) |
| Nombre del canal | Fijo `'web_orders_changes'` | Dos pestañas de la misma app compiten por el mismo nombre de canal |

La suscripción se recrea cada vez que cambian `soundEnabled`, `loadOrders` o `branchFilter`
(`page.tsx:301`), y `loadOrders` cambia cuando cambian los filtros: **al escribir en el buscador se
destruye y se vuelve a crear el canal de tiempo real en cada pulsación aplicada**.

---

## H. Conversión a venta y `sale_id`

La conversión **no es una acción**: ocurre dentro de «Confirmar pedido». `webOrderConfirmationService.confirmOrder`
(`webOrderConfirmationService.ts:56-189`) hace, en este orden y **sin transacción**:

1. `sales` con `source='web'`, `include_in_cash_register=false` y `sale_date = web_orders.created_at`
   (no la fecha de confirmación) — `:196-228`.
2. `sale_items`, con el descuento de pedido **prorrateado** por línea mediante
   `repartirTotalesPedidoWeb` — `:233-273`.
3. Descuenta stock definitivo (`decrementOnSale`, origen `'web_sale'`) y libera la reserva — `:82-111`.
4. `kitchen_tickets` + `kitchen_ticket_items` con `estimated_time` en minutos y `priority = 0` si
   el pedido es programado — `:278-328`.
5. `tips` si hay propina: busca la propina que creó la tienda por `ilike notes` con el número de
   pedido y la completa con `sale_id` y `server_id`; si no la encuentra, crea una — `:659-699`.
6. `coupon_redemptions` si hay cupón: la tienda ya insertó una redención con `sale_id = web_order.id`
   (que no es una venta real) y el ERP **corrige** ese `sale_id` — `:336-394`.
7. `shipments` si el pedido es a domicilio — `:399-408`.
8. Si el pedido queda pagado: `invoice_sales` + `invoice_items`, `payments`, corrección del texto de
   la notificación que creó el disparador, y `accounts_receivable` — `:410-652`.
9. Por último, `web_orders` con `sale_id`, `status='confirmed'`, `payment_status`, `confirmed_at`,
   `confirmed_by`, `estimated_ready_at` y `estimated_delivery_at` — `:170-186`.

**Consecuencias para el diseño.** El paso 9 es el último: si algo falla en los pasos 1-8 después
de crear la venta, queda una venta huérfana y el pedido sigue en `pending`; volver a confirmar crea
una **segunda** venta. La interfaz no da ninguna señal de esto: el botón simplemente vuelve a estar
disponible.

`handleConvertToSale` (`useWebOrderDetail.ts:261-286`) sirve dos propósitos incompatibles bajo el
mismo botón «Crear venta»: si hay `sale_id`, navega a la venta; si no, **vuelve a llamar a
`confirmOrder`**, que pone el pedido en `confirmed` otra vez. Un pedido `delivered` sin venta
retrocede a `confirmed` al pulsar «Crear venta», y además se le crea una comanda de cocina para
algo ya entregado.

`webOrdersService.convertToSale` (`:568-658`) es una tercera implementación de lo mismo, más pobre
(sin factura, sin comanda, sin propina, sin cupón, con `status='paid'` cableado) y **nunca se
llama**.

---

## I. Reserva y liberación de stock — `stock_released_at`

**Reserva.** Al crear el pedido se llama a `stockMovementService.reserveStock`, que sube
`stock_levels.qty_reserved` (`webOrdersService.ts:351-364`). El error no bloquea: se registra en la
consola y el pedido se crea igual, posiblemente sin reserva. La interfaz **no muestra nunca** si un
pedido tiene reserva ni si esa reserva falló.

**Liberación: dos caminos que no se parecen.**

| Camino | Qué hace | ¿Marca `stock_released_at`? | ¿Idempotente? |
|---|---|---|---|
| RPC `release_stock_for_order(p_order_id)` (baseline:21550-21598) | Bloquea la fila, baja `qty_reserved` con `GREATEST(0, …)` y **sella `stock_released_at = now()`** | Sí | Sí: sale sin hacer nada si ya está sellada |
| `webOrdersService.releaseOrderStock` (`:496-536`) | Consulta el pedido, consulta los items, llama a `releaseStockReservation` y a `releaseReservedSerials` | **No** | **No** |

La RPC la usan el cron de expiración y el endpoint `/[id]/release-stock` (que llaman los webhooks
de la tienda). El método del cliente lo usan «Cancelar» y «Rechazar» **desde el listado**. Es decir:

- Cancelar un pedido desde el ERP baja `qty_reserved` pero **deja `stock_released_at` en NULL**.
- El panel de observabilidad y el cron consideran ese pedido «sin liberar»: las consultas del
  endpoint `/observability` filtran por `.is('stock_released_at', null)`
  (`api/web-orders/observability/route.ts:124, 154`) y la RPC de expiración también
  (baseline:3843). Un pedido cancelado a mano puede volver a «liberarse» y bajar `qty_reserved`
  **dos veces**.
- **Rechazar desde el detalle no libera nada**: `handleRejectOrder` del hook hace un `UPDATE`
  directo (`useWebOrderDetail.ts:170-184`) sin pasar por `rejectOrder`. La reserva se queda
  colgada para siempre. Rechazar el mismo pedido desde el listado sí la libera. **Dos botones con
  la misma etiqueta y distinto efecto sobre el inventario.**

La columna `stock_released_at` **no aparece en ninguna parte de la interfaz de Pedidos Online**. El
único sitio donde se ve algo de esto es el panel «Observabilidad de comercio», que está montado en
`/app/inicio`.

---

## J. Tiempos estimados y programación

| Campo | Quién lo escribe | Dónde se ve | Problema |
|---|---|---|---|
| `estimated_ready_at` | `confirmOrder` = `now + prepMs` (`webOrderConfirmationService.ts:68`) | «Listo aprox: {hora}» en el detalle | Solo hora, sin fecha: inútil si son días |
| `estimated_delivery_at` | `confirmOrder` = `now + prepMs + transitMs`, solo si `transitMs > 0` y no es retiro (`:165-167`); y `AssignDeliveryDialog` lo calcula pero lo escribe en el envío, no en el pedido | «Entrega aprox: {hora}» | Ídem; y nunca se compara con la entrega real |
| `is_scheduled` | La tienda web | Badge «Programado» en fila, tarjeta y cabecera; chip de filtro; paso en la línea de tiempo; `priority=0` en la comanda | Coherente |
| `scheduled_at` | La tienda web | «Para: {fecha}» y «Programado: {fecha}» | Se pinta con `toLocaleString('es-CO')`, zona del navegador |
| Predeterminados | `organization.type_id`: `1` = restaurante (30 min / 30 min), `3` = comercio (1 día / 5 días), resto (30 min / 60 min) | Campos del diálogo | `type_id` cableado como número mágico en dos archivos (`page.tsx:96-103`, `useWebOrderDetail.ts:52-69`) |

**No existe la hora real contra la estimada.** Como no hay `preparing_at` ni `in_delivery_at`, y
`ready_at`/`delivered_at` no se comparan con `estimated_ready_at`/`estimated_delivery_at` en
ninguna pantalla, la organización no puede saber si cumple sus promesas. Es el dato que más falta
(§N).

El tiempo de expiración del pedido pendiente sale de `organization_settings` clave `web_commerce`,
campo `order_expiration_minutes`, con respaldo de 1.440 minutos para métodos diferidos
(transferencia, efectivo, PSE, Bancolombia) y 30 para el resto (baseline:3808-3877). **Ese plazo no
se muestra en Pedidos Online**: solo aparece como «Próximos a expirar» en el panel del inicio.

---

## K. Pago, referencia y cupón

| Campo | Se muestra en | Se escribe desde |
|---|---|---|
| `payment_status` | `PaymentStatusBadge` en fila, tarjeta y cabecera del detalle; chips de filtro | «Marcar como pagado» (detalle), «Marcar pagados» (masivo), `confirmOrder` con la casilla, webhooks |
| `payment_method` | Fila («Efectivo», «Transferencia», «Wompi», «Nequi», «Daviplata», «PSE», «Tarjeta», «MercadoPago», «Stripe», «PayU», «PayPal») y tarjeta | Solo la tienda web |
| `payment_method_detail` | Fila y tarjeta («Bancolombia», «Tarjeta», «Nequi», «PSE», «Bancolombia Collect», «Daviplata») | Solo la tienda web |
| `payment_reference` | **En ningún sitio** | `updatePaymentStatus` lo pisa con `undefined` |
| `coupon_code` | Badge «Cupón: {código}» solo en la cabecera del detalle | Solo la tienda web |

El mapa de métodos de pago está **duplicado literalmente** en `page.tsx:577-605` y
`WebOrderCard.tsx:51-82`: dos copias de la misma tabla de 12 métodos y 6 submétodos.

«Marcar como pagado» del detalle (`useWebOrderDetail.ts:303-343`) escribe `web_orders` y `sales` a
mano: pone `payment_status='paid'`, `balance=0` y `status='paid'` en la venta. **No crea
`payments`, ni factura, ni toca la cartera.** El resultado es una venta que dice estar cobrada sin
ningún pago que la respalde, y una cuenta por cobrar que sigue abierta si existía. Es
exactamente lo que la nota de `pagos-triggers-saldo-y-cartera` desaconseja: el saldo se recalcula
insertando en `payments`, no escribiendo el saldo.

«Marcar pagados» del masivo es peor: `updatePaymentStatus(id, 'paid')` se llama sin referencia
(`page.tsx:445`), y el método hace `update({ payment_status, payment_reference })` con
`payment_reference` a `undefined` (`webOrdersService.ts:547-555`), lo que en PostgREST **escribe
`null`**: marcar pagado en masa **borra la referencia de la pasarela** de los pedidos que sí la
tenían.

El cupón: la tienda inserta la redención con `sale_id = web_order.id` y el ERP la corrige al
confirmar. Si el pedido se confirma en masa (que no llama a `confirmOrder`), **la redención se
queda apuntando a un id que no es una venta**. El descuento del cupón no se distingue del descuento
de promoción: ambos viven agregados en `discount_total`.

---

## L. Esquema verificado y columnas que existen y no se muestran

### L.1 `web_orders` — 41 columnas (verificado por MCP)

`CHECK` reales:

| Restricción | Valores |
|---|---|
| `web_orders_status_check` | `pending`, `confirmed`, `preparing`, `ready`, `in_delivery`, `delivered`, `cancelled`, `rejected`, **`refunded`**, `expired` |
| `web_orders_payment_status_check` | `pending`, `paid`, `partial`, `refunded`, `failed` |
| `web_orders_delivery_type_check` | `pickup`, `delivery_own`, `delivery_third_party` |
| `web_orders_source_check` | `website`, `mobile_app`, `whatsapp`, `phone` |

Claves foráneas: `organization_id` → `organizations` (cascada), `branch_id` → `branches` (cascada),
`customer_id` → `customers`, `sale_id` → `sales`, `confirmed_by` y `cancelled_by` → `auth.users`.

### L.2 Columnas que existen y la interfaz nunca muestra

| Columna | Qué guarda | Dónde debería verse |
|---|---|---|
| `source` | `website` / `mobile_app` / `whatsapp` / `phone` | Badge de origen en fila, tarjeta y cabecera; chip de filtro |
| `branch_id` (y `branches.name`, que **sí se trae**) | Sucursal del pedido | `BranchBadge` en la cabecera y columna «Sucursal» en vista consolidada |
| `payment_reference` | Referencia de la pasarela | Bloque de pago del detalle |
| `delivery_partner` | Transportadora | Solo se ve en el detalle y en la tarjeta; falta en la fila |
| `internal_notes` | Nota interna del equipo | Se lee; **no hay editor** |
| `confirmed_by` | Quién confirmó | Línea de tiempo |
| `cancelled_by` | Quién canceló | Línea de tiempo — **además nunca se escribe** |
| `stock_released_at` | Sello de liberación de la reserva | Badge «Reserva liberada» / «Reserva activa» |
| `updated_at` | Última modificación | Pie del detalle |
| `estimated_ready_at` / `estimated_delivery_at` | Compromisos | Solo en el detalle; faltan en la fila y en la tarjeta, que es donde se decide a quién atender primero |
| `web_order_items.serial_ids` | Seriales reservados de la línea | Línea del pedido |
| `web_order_items.status` | Estado por línea | Se pinta, pero ningún control lo cambia |

### L.3 Políticas RLS (verificado)

`web_orders` y `web_order_items` tienen RLS activa (`relrowsecurity = true`,
`relforcerowsecurity = false`).

| Tabla | Política | Operación | Condición |
|---|---|---|---|
| `web_orders` | «Users can view web_orders of their organization» | `SELECT` | `organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = (SELECT auth.uid()) AND om.is_active)` |
| `web_orders` | «Users can update web_orders of their organization» | `UPDATE` | Misma condición, **sin `(select auth.uid())`** |
| `web_order_items` | «Users can view…» / «Users can insert…» / «Users can update…» | `SELECT`/`INSERT`/`UPDATE` | A través de `web_order_id IN (SELECT … FROM web_orders WHERE …)` |
| `web_order_items` | **«Allow anon insert web_order_items»** | `INSERT` | **`with_check = true`** |

Tres cosas para el diseño y una para seguridad:

1. **No hay `INSERT` ni `DELETE` en `web_orders` para usuarios autenticados.** Los pedidos solo
   nacen por `service_role` (la tienda web y los endpoints). `webOrdersService.createOrder` no
   puede funcionar desde el navegador: es código muerto bajo RLS. El diseño no debe ofrecer «Nuevo
   pedido» en el ERP.
2. **El permiso es la pertenencia a la organización, nada más.** Cualquier miembro activo puede
   confirmar, rechazar, cancelar o marcar pagado cualquier pedido de cualquier sucursal. No hay
   filtro de sucursal en RLS ni comprobación de permiso en el código (0 apariciones de
   `usePermission`/`hasPermission` en toda la carpeta). El filtro por sucursal es puramente de
   interfaz.
3. La política de `UPDATE` no envuelve `auth.uid()` en un subselect, al contrario que la de
   `SELECT`: se reevalúa por fila. Es el patrón que la nota
   `rls-quitar-qual-true-destapa-el-coste` señala como caro.
4. **«Allow anon insert web_order_items» con `with_check = true`** deja que el rol `anon` inserte
   líneas en cualquier pedido de cualquier organización. No es un problema de diseño, pero sale de
   esta auditoría y debe corregirse aparte.

---

## M. Lo roto o sin efecto

| # | Qué | Evidencia | Gravedad |
|---|---|---|---|
| 1 | **«Imprimir» del detalle nunca se dibuja**: `OrderActionsCard` acepta `onPrint` pero `[id]/page.tsx` no lo pasa | OrderActions.tsx:196-201; `[id]/page.tsx:81-93` | Función perdida |
| 2 | **El sonido de aviso apunta a un archivo que no existe**: no hay `public/sounds/notification.mp3`; el `.catch(()=>{})` lo oculta | page.tsx:303-310 | El botón del altavoz es decorativo |
| 3 | **Rechazar desde el detalle no libera la reserva de stock**; desde el listado sí | useWebOrderDetail.ts:170-184 vs webOrdersService.ts:488-491 | Inventario bloqueado para siempre |
| 4 | **La liberación desde el ERP no sella `stock_released_at`**, así que el cron y la observabilidad pueden liberar otra vez | webOrdersService.ts:496-536 vs RPC `release_stock_for_order` | Doble descuento de `qty_reserved` |
| 5 | **«Confirmar» en masa no crea venta, ni comanda, ni factura, ni redime el cupón**, al contrario que «Confirmar» de la fila | page.tsx:417-438 vs :312-347 | Dos botones iguales, efectos distintos |
| 6 | **«Marcar pagados» borra `payment_reference`**: se envía `undefined`, que PostgREST escribe como `null` | page.tsx:445; webOrdersService.ts:547-555 | Pérdida de datos de la pasarela |
| 7 | **«Marcar como pagado» no crea `payments` ni factura ni cartera**: escribe `sales.balance = 0` a mano | useWebOrderDetail.ts:303-343 | Contabilidad inconsistente |
| 8 | **«Crear venta» sobre un pedido entregado lo devuelve a «Confirmado»** y le crea una comanda de cocina | useWebOrderDetail.ts:261-286 | Retroceso de estado |
| 9 | **El auto-refresco reinicia la paginación a la página 1 cada 30 s** | page.tsx:240, 258-266 | Imposible trabajar la página 3 |
| 10 | **`status='refunded'` existe en la base y no en el tipo**: `STATUS_CONFIG[status]` devolvería `undefined` y `config.color` lanzaría; la pantalla se cae en blanco | CHECK verificado vs webOrdersService.ts:7; StatusBadge.tsx:73-82; WebOrderCard.tsx:91; page.tsx:560-572 | Caída de la pantalla |
| 11 | **Dos pasos de la línea de tiempo nunca tienen hora**: `timestamp: order.status === 'preparing' ? undefined : undefined` | OrderTimeline.tsx:82, 101 | Historial incompleto |
| 12 | **`cancelled_by` no se escribe nunca** pese a existir la columna y la clave foránea | Búsqueda en todo `src/`: 0 escrituras | No hay responsable de la cancelación |
| 13 | **Los diálogos prometen una notificación al cliente que no existe**: «El cliente será notificado», «Este motivo se mostrará al cliente en su notificación», «El cliente recibirá una notificación con estos tiempos estimados» | page.tsx:1402, 357; CancelOrderDialog.tsx:51, 65; ConfirmOrderDialog.tsx:164 | Cuatro textos que mienten |
| 14 | **Toda fecha se pinta en la zona horaria del navegador**, nunca en la de la organización; `getOrganizationTimezone` se importa en el servicio y **no se usa** | webOrdersService.ts:5; page.tsx:156-181, 1056; OrderHeader.tsx:19-24; OrderTimeline.tsx:31-47 | Regla 3 y 6 de fechas incumplidas |
| 15 | **El nombre del CSV sale del día UTC**: `toISOString().slice(0,10)` | page.tsx:536 | Regla 1 de fechas incumplida |
| 16 | **Importaciones muertas de utilidades obsoletas**: `formatDate` (marcada `deprecated`) en `OrderHeader.tsx:7` y `formatCurrency` en `OrderProductsCard.tsx:6`, ninguna se usa | — | Ruido que ESLint señala |
| 17 | **La impresión masiva inyecta datos sin escapar en el HTML** que escribe en la ventana nueva: nombre, teléfono, dirección, nombre de producto y notas vienen de la tienda web | page.tsx:468-505 | Inyección de HTML |
| 18 | **La impresión masiva falla en silencio** si el navegador bloquea la ventana emergente: `if (!printWindow) return;` sin aviso | page.tsx:466-467 | Sin realimentación |
| 19 | **El CSV no escapa comillas ni lleva BOM**: `r.map(c => `"${c}"`)`; una nota con comillas rompe la fila y los acentos salen mal en Excel | page.tsx:531-532 | Exportación defectuosa |
| 20 | **Moneda cableada**: símbolo «$» literal y `toLocaleString()` sin configuración regional en toda la pantalla; la factura fija `currency: 'COP'` | OrderTotals.tsx:24-28; page.tsx:1051; webOrderConfirmationService.ts:440 | No sirve para otra moneda |
| 21 | **Seis mapas de estado distintos** para lo mismo: `page.tsx:545-573`, `StatusBadge.tsx:20-70`, `WebOrderCard.tsx:33-43`, `OrderItemsList.tsx:13-18`, `DeliveryTrackingCard.tsx:70-94`, `PaymentStatusBadge.tsx:18-48`. «Preparando» es `Clock`, `ChefHat` o `Timer` según dónde se mire | — | Incoherencia visual |
| 22 | **Dos mapas idénticos de métodos de pago** copiados literalmente | page.tsx:577-605 y WebOrderCard.tsx:51-82 | Divergencia asegurada |
| 23 | **Dos implementaciones del diálogo «Confirmar pedido»** que ya divergen en el campo de traslado y en los textos de ayuda | page.tsx:1298-1394 vs ConfirmOrderDialog.tsx:88-190 | Regla 7 de `CLAUDE.md` |
| 24 | **El detalle repite a mano la consulta de `getOrderById`** en lugar de llamar al servicio | useWebOrderDetail.ts:74-84 vs webOrdersService.ts:240-260 | Ídem |
| 25 | **Sin permisos**: 0 comprobaciones en toda la carpeta; cualquier miembro activo confirma, rechaza, cancela y marca pagado | Búsqueda de `usePermission`/`hasPermission` | Regla 6 de `CLAUDE.md` |
| 26 | **Paginación y conteos en el navegador**: `getOrders` sin `range`, `getOrderStats` trae todas las filas y agrega en el cliente, y se llama **dos veces** por carga | webOrdersService.ts:145-228, 663-749; page.tsx:232-236 | 3 consultas completas cada 30 s |
| 27 | **La búsqueda hace una consulta previa a `web_order_items` y mete los ids en un `id.in.(…)`**: con muchos resultados la URL de PostgREST se dispara | webOrdersService.ts:193-213 | Fallo silencioso con catálogos grandes |
| 28 | **La suscripción de tiempo real se recrea al aplicar cada filtro** y no comprueba el estado de `.subscribe()` | page.tsx:272-301; webOrdersService.ts:763-776 | El «tiempo real» puede estar caído sin avisar |
| 29 | **El botón «Buscar» es redundante** con el rebote de 400 ms que ya aplica la búsqueda | WebOrderFilters.tsx:85-93, 175-177 | Ruido |
| 30 | **«Limpiar» no limpia todo**: deja el período y la sucursal como estaban | WebOrderFilters.tsx:143-146 | Filtro fantasma |
| 31 | **El tablero solo cubre 5 de 9 estados**; entregados, cancelados, rechazados y expirados desaparecen | page.tsx:615-618, 1189-1294 | Pedidos invisibles |
| 32 | **Sin cancelación a partir de `preparing`** | OrderActions.tsx:56 | Callejón sin salida |
| 33 | **«Volver» como botón de salida de un diálogo destructivo**, en lugar de «Cancelar» | CancelOrderDialog.tsx:69-71 | Patrón 8 |
| 34 | **Barra de acciones masivas arriba, dentro del flujo** | page.tsx:834-914 | Patrón 1 |
| 35 | **Paginación dibujada a mano, sin selector de tamaño, y oculta con 20 elementos exactos** | page.tsx:1153-1183 | Patrón 2 |
| 36 | **Tres controles en la columna de acciones, uno destructivo suelto, sin menú «⋯», y la fila no abre el detalle** | page.tsx:1063-1145 | Patrón 6 |
| 37 | **Vacío sin acción, sin variante de «los filtros no devuelven nada», y sin estado de error en pantalla** | page.tsx:824-829 | Patrón 7 |
| 38 | **Emojis en lugar de iconos del kit**: «📝» en cinco sitios, «🔔» en el toast, «⭐» en la calificación | page.tsx:978, 289; OrderItemsList.tsx:91; OrderCustomerCard.tsx:77; OrderDeliveryCard.tsx:104; DeliveryTrackingCard.tsx:287 | Fuera del sistema |
| 39 | **`isUrgent` con 10 minutos cableados**, aplicado también a comercio donde la preparación son días | WebOrderCard.tsx:125 | Todo urgente |
| 40 | **`type_id` como número mágico** (1 = restaurante, 3 = comercio) en dos archivos | page.tsx:96-103; useWebOrderDetail.ts:52-53 | Frágil |
| 41 | **Migas falsas**: «POS / Pedidos Online» es un párrafo gris sin enlaces | page.tsx:641 | Navegación |
| 42 | **`CopyableId` copia el uuid, no el número de pedido** que es lo que el cliente dice por teléfono | page.tsx:956-962 | Copia inútil |
| 43 | **Seis toasts de error dicen solo «Error»**, sin descripción | useWebOrderDetail.ts:180, 193, 206, 239, 255 | Sin diagnóstico |
| 44 | **El panel «Observabilidad de comercio» vive en `/app/inicio`**, no donde se trabajan los pedidos, y trae su **séptima** paginación propia | `app/app/inicio/page.tsx:348`; WebCommerceObservability.tsx:420-466 | Alerta fuera de sitio |
| 45 | **El reembolso existe en el servidor y no en la interfaz**: 331 líneas de nota crédito, devolución de stock y ajuste de cartera sin ningún botón | `api/web-orders/[id]/refund/route.ts` | Función inaccesible |

---

## N. Qué le falta para ser útil

Ordenado por lo que más cuesta hoy a quien atiende los pedidos.

> **Decidido el 2026-09-22** (detalle y migración propuesta en
> `docs/design/PARIDAD-PEDIDOS-ONLINE.md` › «Decisiones»): se añaden `preparing_at` e
> `in_delivery_at` (puntos 3 y 4); **los avisos al cliente se implementan** sobre la
> infraestructura que ya existe —Resend + `@react-email` con `src/lib/jobs/handlers/email.ts`,
> y la Edge Function `channel-dispatch` para WhatsApp— y el diseño los contempla enteros
> (punto 6); los motivos de rechazo y cancelación se tipifican con la lista del punto 2; y el
> reembolso se expone en la interfaz llamando al endpoint que ya existe (punto 7).

1. **Confirmación trazable y una sola.** Que «Confirmar» signifique siempre lo mismo —fila, tarjeta,
   masivo y detalle—, que la cadena sea transaccional (una RPC), y que el resultado se vea:
   «Venta V-1042 · Factura FACT-0087 · Comanda #318», con enlaces. Hoy se crean nueve registros en
   otras tablas y el pedido solo enseña «Ver venta POS».
2. **Motivo de rechazo y de cancelación tipificados.** Hoy es texto libre con un ejemplo en el
   `placeholder`. **Decidida la lista**, en este orden: «Producto agotado», «Fuera de zona de
   cobertura», «Fuera de horario», «Pago no confirmado», «El cliente canceló» y «Otro» con texto
   libre obligatorio. Como el motivo viaja al cliente en el aviso de rechazo, se redacta en
   segunda persona, no en jerga de operador. Se guarda en `cancellation_reason`, y
   **`cancelled_by` debe escribirse**: hoy no se escribe nunca.
3. **Tiempo real contra tiempo prometido. Decidido: se añaden `preparing_at` e
   `in_delivery_at`**, aditivas y nulas, escritas por el cambio de estado —no por la interfaz—
   junto a `ready_at` y `delivered_at`. Con ellas, la línea de tiempo muestra cada paso con su
   hora real **y** la prometida, con el desvío («Listo 14:52 · prometido 14:30 · +22 min»), y el
   listado gana la columna «A tiempo». Sin esto no hay forma de saber si la promesa se cumple, y
   la línea de tiempo tiene dos pasos mudos.
4. **Métricas de cumplimiento en los KPIs.** «Pedidos a tiempo», «Retraso medio», «Tasa de rechazo»
   y «Tiempo medio de preparación» por período y sucursal, junto a los seis KPIs actuales. Los
   datos ya existirían con el punto 3.
5. **Impresión de comanda y de recibo desde el pedido.** El botón «Imprimir» del detalle está
   escrito y nunca se dibuja; la impresión masiva es HTML a mano en una ventana emergente. Debe
   pasar por el motor de documentos (`docs/design/DOCUMENTOS-PDF.md`): comanda de cocina 80 mm,
   etiqueta de entrega y recibo, con vista previa y elección de impresora.
6. **Aviso al cliente de verdad.** Cuatro textos de la interfaz prometen una notificación que no
   existe. **Decidido: se implementa.** La infraestructura ya está —correo por Resend con
   plantillas de `@react-email` a través de `src/lib/jobs/handlers/email.ts`, que envía por cola,
   es idempotente y reintenta; y WhatsApp por la Edge Function `channel-dispatch`—, así que lo
   que falta es el catálogo de momentos (pedido recibido, confirmado con los tiempos, listo, en
   camino, entregado, y rechazado o cancelado con el motivo), el interruptor por canal, la
   plantilla de cada uno y el registro del envío en el historial del pedido con su estado y un
   «Reenviar». El envío va siempre por la cola, **nunca desde el navegador**. Y el pedido sin
   correo ni teléfono se advierte **antes** de confirmar, no después de que el envío falle.
7. **Reembolso desde la interfaz. Decidido: se expone.** El endpoint hace nota crédito, devuelve
   stock y ajusta cartera. Falta el botón —solo en pedidos pagados y no reembolsados—, el diálogo
   (total o parcial, por línea, con motivo y con el detalle explícito de qué va a pasar) y el
   estado `refunded` en la escala de badges, que además hoy tumbaría la pantalla. El diálogo
   **llama al endpoint**: no escribe saldos a mano como hace «Marcar como pagado».
8. **Pagos del pedido visibles.** Lista de pagos con método, submétodo, referencia de la pasarela,
   importe y fecha; y «Registrar pago» que inserte en `payments` en lugar de escribir el saldo a
   mano.
9. **Nota interna editable.** El campo existe, se lee y nadie lo puede escribir. Es lo primero que
   pide quien atiende («el cliente llamó, lo pasamos a mañana»).
10. **Enlace al cliente del CRM y a la ficha del producto.** Hoy el pedido es una isla: ni la ficha
    del cliente, ni su historial, ni la ficha del producto de cada línea.
11. **Sucursal visible.** `branches.name` ya viaja en cada pedido. Falta el `BranchBadge` en la
    cabecera y la columna «Sucursal» en vista consolidada (patrón 9.5).
12. **Origen visible y filtrable.** `source` distingue tienda web, app, WhatsApp y teléfono; hoy no
    se ve ni se filtra.
13. **Estado de la reserva.** Badge «Reserva activa» / «Reserva liberada» a partir de
    `stock_released_at`, y aviso de «Reserva huérfana» en el propio pedido, no solo en el inicio.
14. **Expiración a la vista.** «Expira en 12 min» en la fila y en la tarjeta de los pedidos
    pendientes de pago, con el plazo que sale de `organization_settings`.
15. **Editar el pedido antes de confirmar.** Cambiar cantidades, quitar una línea agotada o
    sustituir un producto es la conversación más frecuente con el cliente, y hoy solo se puede
    rechazar todo.
16. **Seguimiento para transportadora.** `delivery_third_party` no tiene ni número de guía ni
    estado: solo el nombre del socio en un badge.

---

## O. Conteo

| Bloque | Controles |
|---|---|
| B.1 Cabecera del listado | 7 |
| B.2 KPIs | 8 |
| B.3 Período | 2 |
| B.4 Buscador y filtros | 8 |
| B.5 Acciones masivas | 11 |
| B.6 Tabla (vista lista) | 20 |
| B.7 Paginación | 1 |
| B.8 Vista tablero (columnas + tarjeta) | 25 |
| B.9 Diálogos del listado | 8 |
| B.10 Estados y toasts del listado | 10 |
| **Listado** | **100** |
| C.1 Cabecera del detalle | 10 |
| C.2 Productos y totales | 13 |
| C.3 Notas | 3 |
| C.4 Línea de tiempo | 9 |
| C.5 Acciones | 11 |
| C.6 Cliente | 6 |
| C.7 Entrega | 10 |
| C.8 Seguimiento del envío | 13 |
| C.9 Diálogos del detalle | 19 |
| C.10 Estados y toasts del detalle | 6 |
| **Detalle** | **100** |
| **Total inventariado** | **200** |

Contra los **38 + 23 = 61** de `AUDITORIA-CONTROLES-PRODUCTOS-POS.md` §D.2, que agrupaba familias
enteras en una fila. Además: **14 piezas de código muertas** (§D), **12 columnas que existen y no
se muestran** (§L.2) y **45 defectos** (§M).

---

## P. Recomendación

**Qué se calca.** La cadena de confirmación (venta, comanda, propina, cupón, envío, factura, pago,
cartera) es lo mejor que tiene el módulo y se respeta entera; los tiempos estimados con unidad
(minutos/horas/días) y los predeterminados por tipo de organización; el reparto del descuento de
pedido en las líneas de la factura; la búsqueda con rebote que también busca por producto y por
dirección; la comparación de KPIs contra el período anterior «a la misma hora»; el seguimiento del
envío con conductor, vehículo, eventos y prueba de entrega; y las dos vistas, lista y tablero.

**Qué se rehace y por qué.**

1. **Una sola norma de listado.** `PageHeader` con migas reales y **sin** acción primaria de
   creación (bajo RLS el ERP no puede crear pedidos); `BranchBadge` bajo el título; KPIs del kit
   con «Pendientes» **clicable**; un solo buscador + botón «Filtros» con contador que recoge
   estado, pago, tipo de entrega, origen, programados **y el período**; chips de filtros activos
   debajo; `DataTable` con la fila abriendo el detalle, como máximo dos iconos no destructivos y
   «⋯» con lo destructivo tras divisor; `Pagination` del kit; `BulkActionBar` **flotante al pie**
   con las acciones del dominio y los textos de este dominio.
2. **Un solo mapa de estados.** Seis mapas pasan a uno, según `SISTEMA-BADGES.md`: pendiente =
   advertencia suave; confirmado = información suave; preparando = advertencia suave; listo = éxito
   suave; en camino = información suave; entregado = éxito suave; cancelado y rechazado = peligro
   suave; expirado = neutro suave; reembolsado = información contorno. Pago: pagado = éxito suave;
   pendiente = advertencia suave; parcial = advertencia contorno; reembolsado = información
   contorno; fallido = peligro suave. Un solo badge sólido por fila, reservado al estado dominante.
3. **Tablero completo y honesto.** Cinco columnas de trabajo (Pendientes, Confirmados, Preparando,
   Listos, En camino) y un acceso a «Cerrados» para entregados, cancelados, rechazados y
   expirados, para que ningún pedido desaparezca. Sin segunda paginación: la del kit.
4. **Detalle con la trazabilidad a la vista.** Cabecera con número, origen, sucursal, estado, pago,
   programado, propina y cupón; enlaces a la venta, a la factura y a la comanda; línea de tiempo
   con hora real y prometida en cada paso y con el responsable; bloque de pagos con referencia;
   nota interna editable; entrega con seguimiento también para transportadora.
5. **Lo roto no se calca.** «Imprimir» se dibuja y pasa por el motor de documentos; el aviso sonoro
   se dibuja como función real con su archivo; «Confirmar» hace lo mismo en los cuatro sitios;
   «Marcar como pagado» abre un diálogo de registro de pago; «Crear venta» desaparece como botón y
   se convierte en el enlace a la venta; el botón de salida de los diálogos destructivos se llama
   «Cancelar»; el vacío, el error y el «sin sucursal asignada» se dibujan con acción.
6. **Lo que no existe se marca «Nuevo».** Estado `refunded` y diálogo de reembolso, motivos
   tipificados, aviso al cliente, «Expira en N min», badge de reserva, métricas de cumplimiento,
   edición del pedido antes de confirmar, enlace al cliente del CRM y columna de sucursal.

**Lo que hay que arreglar en código, fuera del diseño** (por orden de riesgo): rechazar desde el
detalle sin liberar stock; la liberación que no sella `stock_released_at`; «Marcar pagados» que
borra la referencia de la pasarela; «Marcar como pagado» que escribe el saldo a mano; el estado
`refunded` que tumba la pantalla; «Crear venta» que retrocede el estado; la ausencia total de
comprobación de permisos; la política «Allow anon insert web_order_items» con `with_check = true`;
la paginación y los conteos en el navegador; y la zona horaria de la organización en todas las
fechas.
