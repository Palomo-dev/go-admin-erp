# Paridad — Pedidos Online

Control por control de `docs/design/AUDITORIA-CONTROLES-PEDIDOS-ONLINE.md` (200 controles)
frente a lo dibujado en Figma («GO Admin — Sistema de diseño», `EAvjINVRnlzFM70GVoWXgl`,
página `05 POS y ventas`, Secciones **«Pedidos online — listado»** y **«Pedidos online —
detalle»**).

Fecha: 2026-09-22. Sin nombres de organizaciones cliente. Normas aplicadas:
`docs/design/PATRONES-TRANSVERSALES.md` y `docs/design/SISTEMA-BADGES.md`.

---

## Decisiones (delegadas por el dueño, 2026-09-22)

Las cinco dudas abiertas al cerrar la primera tanda quedaron resueltas y están aplicadas en los
frames. Se documentan aquí para que nadie las reabra.

### D1. Se añaden `preparing_at` e `in_delivery_at`

Sin ellas la línea de tiempo miente: «En preparación» y «En camino» **nunca** pueden llevar hora
(`OrderTimeline.tsx:82` es un ternario que devuelve `undefined` en las dos ramas) y no hay forma
de medir cumplimiento.

Migración propuesta, **aditiva y con columnas nulas**, como exige `CLAUDE.md`:

```sql
-- supabase/migrations/<ts>_web_orders_marcas_de_tiempo.sql
alter table public.web_orders
  add column if not exists preparing_at   timestamptz,
  add column if not exists in_delivery_at timestamptz;

comment on column public.web_orders.preparing_at   is
  'Instante en que el pedido pasó a preparación. Lo escribe el cambio de estado, no la interfaz.';
comment on column public.web_orders.in_delivery_at is
  'Instante en que el pedido salió hacia el cliente. Lo escribe el cambio de estado, no la interfaz.';

-- Consultas de cumplimiento: «pedidos a tiempo del periodo» filtra por sucursal y fecha
-- y compara ready_at/delivered_at con estimated_ready_at/estimated_delivery_at.
create index if not exists idx_web_orders_cumplimiento
  on public.web_orders (organization_id, branch_id, created_at desc)
  where status in ('ready','in_delivery','delivered');
```

Reversión en `supabase/rollbacks/` con los dos `drop column` y el `drop index`.

**Quién las escribe:** el cambio de estado, junto a `ready_at` y `delivered_at`, en el mismo
`update` que ya hace `webOrdersService.updateOrderStatus` (`webOrdersService.ts:391-409`) — y en
el hook del detalle, que hoy duplica ese `switch` (`useWebOrderDetail.ts:111-125`). **La interfaz
no escribe marcas de tiempo**; solo pide el cambio de estado.

Dibujado: en el detalle, cada paso con su hora real y, cuando hay promesa, «prometido 12:54 ·
3 min antes» o «+14 min de retraso» con el tono correspondiente (T1, T2, T3, T4). En el listado,
la columna pasa de «Compromiso» a **«A tiempo»** con el desvío coloreado, y el KPI «A tiempo
88 % · Contra lo prometido» mide el periodo (L1, L2, L8, L9, L7).

### D2. Los avisos al cliente se implementan y el diseño los contempla enteros

La infraestructura ya existe y está verificada: **Resend + `@react-email`** con
`src/lib/jobs/handlers/email.ts` (envío por cola, idempotente, con reintentos) y la Edge Function
**`channel-dispatch`** para WhatsApp (Meta y Twilio). Así que los cuatro textos que hoy prometen
una notificación dejan de mentir: se cumplen.

Sección nueva **«Pedidos online — avisos al cliente (Nuevo)»** con tres frames:

- **C1 · Configuración › POS — Avisos al cliente.** Seis momentos —pedido recibido, confirmado
  (con los tiempos), listo, en camino, entregado, y rechazado o cancelado— con **interruptor por
  canal** (correo y WhatsApp), el texto de la plantilla y «Vista previa» por fila; más remite,
  nombre visible y número de WhatsApp. Se dibuja en esta Sección y no dentro de
  «Configuración › POS» para no tocar una Sección existente; ahí es donde vive cuando se
  consolide.
- **C2 · Vista previa de la plantilla**, con conmutador de canal, el correo completo y las nueve
  variables disponibles.
- **C3 · Avisos en el historial del pedido**, con los cinco estados (Encolado · Enviado ·
  Entregado · Fallido · Sin datos) y el «Reenviar».

En el detalle (T1, T2, T3, T4) cada paso de la línea de tiempo lleva debajo **una línea por aviso
enviado**, con canal, hora y estado; el fallido lleva «Reenviar». En T2 se dibuja un WhatsApp
fallido a propósito, para que el caso exista.

El caso **sin correo ni teléfono** se resuelve antes de confirmar, no después: frame **D7 ·
«Confirmar sin datos de contacto»**, que avisa, deja añadir los datos en ese momento y exige
marcar «Confirmar igualmente, sin avisar al cliente».

**Dependencia anotada:** el envío va siempre por la cola de trabajos, **nunca desde el
navegador**. «Reenviar» vuelve a encolar el mismo trabajo; no envía por su cuenta.

### D3. Motivos tipificados, redactados para el cliente

Lista y orden definitivos: **Producto agotado · Fuera de zona de cobertura · Fuera de horario ·
Pago no confirmado · El cliente canceló · Otro**. Con «Otro» el texto libre es obligatorio.

El motivo **viaja al cliente** en el aviso de rechazo, así que cada opción se redacta en segunda
persona y sin jerga de operador: «Se nos agotó lo que pediste», «Tu dirección queda fuera de la
zona a la que llevamos», «Recibimos tu pedido fuera del horario de atención», «No nos llegó la
confirmación del pago», «Cancelamos el pedido a petición tuya». El campo de texto libre se
titula **«Qué verá el cliente»**.

Se guarda en `cancellation_reason`. Y queda escrito: **`cancelled_by` no se escribe nunca hoy**
—la columna existe y apunta a `auth.users`— y debe escribirse en el mismo `update` que el motivo.

Frames: **D2** (diálogo con el motivo elegido) y **D2b** (lista de motivos abierta, con el texto
que verá el cliente bajo cada opción).

### D4. El reembolso se expone

`POST /api/web-orders/[id]/refund` ya hace nota crédito, devolución de stock y ajuste de cartera
en 331 líneas, y no tiene ningún control que lo llame. Se dibuja en **T3** («Reembolsar
pedido…», solo en pedidos **pagados y no reembolsados**) y en **G3**, que muestra explícitamente
qué va a pasar: la nota crédito y sobre qué factura, el stock que vuelve y a qué sucursal, el
ajuste en cartera, el aviso al cliente y la línea que queda en el historial. Total o parcial, por
líneas.

**No se calca el patrón roto de «Marcar como pagado»:** el diálogo llama al endpoint, no escribe
saldos a mano.

### D5. La acción primaria es «Confirmar pendientes · 12»

Correcta y coherente con que bajo RLS el ERP no puede insertar en `web_orders` (§L.3). El
contador sale del filtro real, y **sin pendientes el botón desaparece** en vez de quedarse en
gris: dibujado en **L3**, donde el subtítulo dice «ninguno pendiente de confirmar», el KPI
«Pendientes» está en 0 con tono neutro y la primaria no se pinta.

---

## Leyenda de frames

| Clave | Frame en Figma |
|---|---|
| **L1** | Escritorio / Pedidos online — lista (listo) |
| **L2** | Escritorio / Pedidos online — lista (cargando) |
| **L3** | Escritorio / Pedidos online — vacío (filtros sin resultados) |
| **L4** | Escritorio / Pedidos online — error |
| **L5** | Escritorio / Pedidos online — sin sucursal asignada (Nuevo) |
| **L6** | Escritorio / Pedidos online — tablero por estado |
| **L7** | Escritorio / Pedidos online — FilterPanel abierto |
| **L8** | Escritorio / Pedidos online — selección + BulkActionBar |
| **L9** | Escritorio / Pedidos online — menú ⋯ por fila |
| **L10** | Móvil / Pedidos online — listado (tarjetas) |
| **D1** | Diálogo — Confirmar pedido (tiempos, pago y aviso) |
| **D2** | Diálogo — Rechazar pedido (motivo tipificado) |
| **D2b** | Diálogo — Rechazar pedido (motivos tipificados, lista abierta) |
| **D3** | Diálogo — Cancelar pedido confirmado |
| **D4** | Diálogo — Imprimir comanda (Nuevo) |
| **D5** | Aviso de pedido nuevo (tiempo real) |
| **D6** | Toasts de Pedidos online |
| **D7** | Diálogo — Confirmar sin datos de contacto (Nuevo) |
| **T1** | Escritorio / Pedidos online — detalle (pendiente por confirmar) |
| **T2** | Escritorio / Pedidos online — detalle (en camino, con seguimiento) |
| **T3** | Escritorio / Pedidos online — detalle (entregado y cerrado) |
| **T4** | Móvil / Pedidos online — detalle (en camino) |
| **G1** | Diálogo — Asignar conductor y vehículo |
| **G2** | Diálogo — Registrar pago (Nuevo) |
| **G3** | Diálogo — Reembolsar pedido (Nuevo) |
| **S1** | Estado — Detalle cargando |
| **S2** | Estado — Pedido no encontrado y sin permiso |
| **C1** | Escritorio / Configuración › POS — Avisos al cliente (Nuevo) |
| **C2** | Diálogo — Vista previa de la plantilla (Nuevo) |
| **C3** | Panel — Avisos en el historial del pedido (Nuevo) |

«Calcado» = el control existe hoy y se dibuja con la misma etiqueta y el mismo efecto.
«Sustituido por …» = el control existe hoy pero se dibuja con otro componente o en otro sitio
por una norma del sistema o porque estaba roto. «Nuevo» = no existe en código. «Omitido» = no
se dibuja, siempre con motivo.

---

## B. Listado `/app/pos/pedidos-online`

### B.1 Cabecera de pantalla

| # | Control | Frame | Estado |
|---|---|---|---|
| 1 | (icono `ArrowLeft`) → `/app/pos` | L1–L10 | sustituido por las migas del `PageHeader` («POS › Pedidos Online»): patrón 4, las migas son la vuelta atrás y el `<a href>` recargaba la app entera |
| 2 | «Pedidos Online» con icono sobre cuadro azul | L1–L10 | calcado (`PageHeader Variant=list`) |
| 3 | «POS / Pedidos Online» (párrafo gris) | L1–L10 | sustituido por `Breadcrumbs` reales del `PageHeader`: hoy es un `<p>`, no enlaces (§M #41) |
| 4 | Conmutador Kanban / Lista | L1, L6 | calcado como «Lista · Tablero» en la fila de sucursal; fuera de la fila de búsqueda (patrón 3) |
| 5 | Silenciar / activar sonido | D5 | sustituido por el bloque «Sonido de aviso» con «Probar sonido» y «Silenciar»: hoy el archivo no existe (§M #2) |
| 6 | Desactivar / activar auto-refresco | D5 | sustituido por el indicador «En vivo / Reconectando… / Sin tiempo real» (§G) |
| 7 | «Actualizar» | L1–L10 | calcado (`IconButton` de recarga en el `PageHeader`) |
| — | Acción primaria «Confirmar pendientes · 12» | L1 | **Nuevo** — patrón 4 exige una primaria; no puede ser «Nuevo pedido» porque bajo RLS el ERP no puede insertar en `web_orders` (§L.3) |
| — | `BranchBadge` de ámbito | L1–L10 | **Nuevo** — patrón 9.5; hoy la pantalla filtra por sucursal y no lo dice |

### B.2 KPIs del periodo

| # | Control | Frame | Estado |
|---|---|---|---|
| 8 | «Pedidos hoy / ayer / (7 días) / (30 días)» | L1 | calcado (`StatCard Size=sm`) |
| 9 | «Pendientes» con anillo amarillo | L1 | sustituido por `StatCard Tone=warning` **clicable** («Filtrar por pendientes»): hoy el anillo no lleva a ninguna parte (§B.2) |
| 10 | «Completados» | L1 | sustituido por «Entregados», que es lo que cuenta de verdad (`status='delivered'`) |
| 11 | «Cancelados» | L1 | calcado (`Tone=danger`) |
| 12 | «Ingresos» | L1 | calcado |
| 13 | «Ticket promedio» | L1 | sustituido por el detalle de «Ingresos» («Ticket $ 67.520»): libera un hueco para «A tiempo» sin perder el dato |
| 14 | Badge de variación «↑ 12 %» + tooltip de comparación | L1 | calcado (línea de detalle del `StatCard`) |
| 15 | Esqueleto propio de 6 tarjetas | L2 | sustituido por `Skeleton Variant=card` del kit (patrón 7) |
| — | «A tiempo 88 % · Contra lo prometido» | L1 | **Nuevo** — §N.4 |

### B.3 Selector de período

| # | Control | Frame | Estado |
|---|---|---|---|
| 16 | «Hoy · Ayer · Últimos 7 días · Últimos 30 días · Personalizado» | L7 | sustituido por el campo «Periodo (fecha de recepción)» dentro del `FilterPanel` + chip «Periodo: Hoy»: patrón 3 prohíbe filtros repartidos entre la cabecera y el panel |
| 17 | Dos `input[type=date]` con «a» | L7 | calcado dentro del panel (`DateRange State=default`) |

### B.4 Buscador y filtros

| # | Control | Frame | Estado |
|---|---|---|---|
| 18 | Buscador con rebote | L1, L10 | calcado (`SearchBar` con `Kbd` `/`) |
| 19 | Botón «Buscar» | — | **omitido**: redundante con el rebote de 400 ms que ya aplica la búsqueda (§M #29) |
| 20 | «Limpiar» | L1 | sustituido por «Limpiar todo» de `FilterChips` + «Limpiar» del panel, que ahora **sí** limpian el periodo (§M #30) |
| 21 | 8 chips de estado siempre desplegados | L7 | sustituido por el campo «Estado del pedido» (`MultiSelect`) del panel; se añade «Rechazado», que hoy no tiene chip |
| 22 | 4 chips de estado de pago | L7 | sustituido por «Estado de pago» (`MultiSelect`), con «Pago parcial», que hoy falta |
| 23 | Chip «Programados» | L7 | calcado como casilla «Solo pedidos programados» |
| 24 | «Tipo:» + 4 chips de entrega | L7 | sustituido por el `Select` «Tipo de entrega» |
| 25 | «Filtros activos:» + píldoras con «×» | L1, L6, L10 | calcado (`FilterChips` con «Limpiar todo»), movido debajo de la fila de búsqueda (patrón 3) |
| — | Filtro «Origen del pedido» | L7 | **Nuevo** en la interfaz; el servicio ya lo soporta (`webOrdersService.ts:170-172`) y no había control |
| — | «Solo pedidos con retraso» | L7 | **Nuevo** — §N.3 |
| — | «Solo con reserva de stock» | L7 | **Nuevo** — §I |
| — | Contador de filtros en el botón | L1, L7, L10 | **Nuevo** (`FilterButton State=active/open`) |

### B.5 Acciones masivas

| # | Control | Frame | Estado |
|---|---|---|---|
| 26 | Casilla de cabecera | L8 | calcado (`TableCell Variant=checkbox-mixed`) |
| 27 | Casilla por fila | L1, L8 | calcado (`checkbox` / `checkbox-on`) |
| 28 | «{n} seleccionado(s)» | L8 | sustituido por «3 pedidos» + «Seleccionar los 137»: patrón 12 exige el sustantivo del dominio y el «seleccionar todos» |
| 29 | «Limpiar» | L8 | calcado («×» a la derecha de la barra) |
| 30 | «Confirmar» | L8 | calcado en la etiqueta, **corregido en el efecto**: en el rediseño ejecuta la cadena completa (venta, factura, comanda…), no solo el cambio de estado (§M #5) |
| 31 | «En proceso» | L8 | sustituido por «Preparar», que es la etiqueta del resto del módulo |
| 32 | «Listos» | L8 | calcado |
| 33 | «Entregados» | L8 | calcado |
| 34 | «Marcar pagados» | L8 | sustituido por «Marcar como pagados» dentro del «⋯», y **sin borrar `payment_reference`** (§M #6) |
| 35 | «Imprimir» (ventana emergente con HTML a mano) | L8 → D4 | sustituido por «Imprimir comanda» en el «⋯», que abre D4 y pasa por el motor de documentos (§M #17, #18) |
| 36 | «Exportar CSV» | L8 | calcado como «Exportar a CSV» en el «⋯» |
| — | «Avisar a los clientes» | L8 | **Nuevo** — §N.6 |
| — | Barra flotante al pie, centrada, con «⋯» que vuelca hacia arriba | L8 | sustituido: hoy es un bloque azul encima de la tabla (patrón 1, §M #34) |
| — | «Eliminar» de la `BulkActionBar` | — | **omitido a propósito**: un pedido web no se borra; se rechaza o se cancela con motivo, una a una (patrón 12.2) |

### B.6 Tabla — vista lista

| # | Control | Frame | Estado |
|---|---|---|---|
| 37 | Columna de selección | L1 | calcado |
| 38 | `CopyableId` con el número de pedido | L1 | sustituido: la **fila entera** abre el detalle (patrón 6.1) y «Copiar N.º de pedido» vive en el «⋯» copiando el número, no el uuid (§M #42) |
| 39 | Badge «Programado» | L1, T1 | calcado (tono información contorno) |
| 40 | Badge «Propina» sin importe | L1, T1 | sustituido por «Propina $ 9.000», con el importe |
| 41 | «📝 {nota}» en amarillo | L1, T1 | sustituido por el bloque «Nota del cliente» del detalle y el icono del kit; sin emoji (§M #38) |
| 42 | Columna «Cliente» (nombre, teléfono, correo) | L1 | calcado; el correo se mueve al detalle para que la fila no crezca a tres líneas |
| 43 | Columna «Estado» con mapa de color propio | L1 | sustituido por `Badge` del kit según `SISTEMA-BADGES.md`; se unifican los seis mapas de estado (§M #21) |
| 44 | Columna «Entrega» | L1 | calcado |
| 45 | Columna «Items» | L1 | **omitido en la fila**: el resumen de dos líneas de productos no cabe con la columna «Compromiso», y el detalle lo da completo. Se conserva en la tarjeta del tablero (L6) y en móvil (L10) |
| 46 | Columna «Pago» (badge + método · submétodo) | L1 | calcado |
| 47 | Columna «Total» | L1 | calcado (`TableCell Variant=money`) |
| 48 | Columna «Tiempo» (fecha + antigüedad) | L1 | sustituido: la hora y el origen pasan a la segunda línea de «Pedido» y la antigüedad al compromiso |
| 49 | «Confirmar» en la fila | L1 | sustituido por un icono de avance de estado con tooltip (patrón 6.2) |
| 50 | (icono `XCircle`) rechazar, rojo y sin tooltip | L9 | sustituido por «Rechazar pedido…» dentro del «⋯», tras divisor y en rojo (patrón 6.4, §M #36) |
| 51 | «Preparar» | L1 | sustituido por el icono contextual |
| 52 | «Listo» | L1 | sustituido por el icono contextual |
| 53 | «Entregado» (retiro) | L1 | sustituido por el icono contextual |
| 54 | «Enviar» | L1 | sustituido por el icono contextual |
| 55 | «Entregado» (en camino) | L1 | sustituido por el icono contextual |
| 56 | (icono `Eye`) ver detalle | — | **omitido**: la fila entera abre el detalle (patrón 6.1) |
| — | Columna «A tiempo» (compromiso + desvío coloreado) | L1, L2, L7, L8, L9 | **Nuevo** — decisión D1; depende de `preparing_at` e `in_delivery_at` |
| — | Segundo icono de fila «Imprimir comanda» | L1 | **Nuevo** |
| — | Menú «⋯» de fila con 7 entradas | L9 | **Nuevo** (patrón 6.3 y 11) |
| — | Columna «Sucursal» en vista consolidada | — | **omitido en este frame**: los frames dibujan «Sucursal Principal»; la columna aparece cuando el `BranchBadge` dice «Todas (3)» (patrón 9.5). Queda descrita, no dibujada |

### B.7 Paginación

| # | Control | Frame | Estado |
|---|---|---|---|
| 57 | «1–20 de 137» + `‹` + «1 / 7» + `›`, dibujada a mano | L1, L2, L6, L8, L9 | sustituido por `Pagination Layout=full` del kit, con selector de tamaño, visible también con 20 resultados exactos y sin reiniciarse cada 30 s (patrón 2, §M #9, #35) |

### B.8 Vista tablero

| # | Control | Frame | Estado |
|---|---|---|---|
| 58 | Columna «Pendientes (n)» | L6 | calcado |
| 59 | Columna «Confirmados (n)» | L6 | calcado |
| 60 | Columna «Preparando (n)» | L6 | calcado |
| 61 | Columna «Listos / En camino (n)» | L6 | sustituido por dos columnas separadas, «Listos» y «En camino»: son dos tareas distintas |
| 62 | «Ver más ({n} restantes)» de 10 en 10 | L6 | sustituido por un enlace «Ver N más» por columna, sin segunda paginación (patrón 2) |
| 63 | «Sin pedidos pendientes / confirmados / Nada en preparación / Sin pedidos listos» | L6 | calcado como texto de columna vacía |
| 64 | Esqueleto del tablero | L2 | sustituido por el esqueleto de lista; el conmutador conserva la vista, no el estado de carga |
| 65 | «¡Urgente!» + anillo rojo a los 10 min | L6 | sustituido por el badge de compromiso en tono peligro y el borde rojo de la tarjeta: el umbral sale del compromiso, no de 10 minutos cableados (§M #39) |
| 66 | Número de pedido en la tarjeta | L6, L10 | calcado |
| 67 | Badges «Programado» y «Propina» | L6, L10 | calcado |
| 68 | «Hoy 14:30 • 35 min» y «Para: {fecha}» | L6, L10 | calcado como «14:05 · Tienda web» |
| 69 | Badge de estado (tercer mapa) | L6, L10 | sustituido por `Badge` del kit |
| 70 | Cliente y teléfono | L6, L10 | calcado |
| 71 | Tipo de entrega + método de pago | L6, L10 | calcado |
| 72 | `PaymentStatusBadge` | L10 | calcado |
| 73 | Dirección | L6, L10 | calcado |
| 74 | «{n} producto(s)» + 3 líneas con scroll interno | L10 | calcado en móvil; en el tablero se resume para que la tarjeta quepa en la columna |
| 75 | «Total» + importe | L6, L10 | calcado |
| 76 | «Nota: {customer_notes}» | L10 | calcado (sin emoji) |
| 77 | «Confirmar / Ok» + rechazar | L6, L10 | calcado; el rechazo pasa al «⋯» |
| 78 | «Iniciar preparación / Preparar» | L6 | sustituido por «Preparar» en los dos sitios: hoy la fila y la tarjeta usan etiquetas distintas para la misma acción (§B.8) |
| 79 | «Marcar listo / Listo» | L6 | sustituido por «Listo» |
| 80 | «Enviar a domicilio / Enviar» | L6 | sustituido por «Enviar» |
| 81 | «Marcar entregado / Entregado» | L6 | sustituido por «Entregado» |
| 82 | (icono `Eye`) | — | **omitido**: la tarjeta entera abre el detalle |
| — | Fila «Cerrados del periodo» con entregados, cancelados, rechazados, expirados y reembolsados | L6 | **Nuevo** — hoy el tablero solo cubre 5 de 9 estados y el resto desaparece (§M #31) |
| — | Badge de compromiso por tarjeta | L6 | **Nuevo** |

### B.9 Diálogos del listado

| # | Control | Frame | Estado |
|---|---|---|---|
| 83 | «Confirmar pedido» + «Indica el tiempo estimado de preparación» | D1 | sustituido: los **dos** diálogos de confirmación que hoy conviven y divergen se unifican en uno (§M #23) |
| 84 | «Tiempo de preparación (Listo aprox)» + Minutos/Horas/Días | D1 | calcado (`NumberInput` + `Select`) |
| 85 | «Tiempo de traslado (Entrega aprox)» + ayuda | D1 | calcado; la ayuda «Pon 0 si es retiro en tienda» desaparece porque el campo se oculta en retiro |
| 86 | Casilla «Marcar como pagado» | D1 | calcado |
| 87 | «Cancelar» / «Confirmar pedido» | D1 | calcado |
| 88 | «Rechazar pedido» + «El cliente será notificado» | D2 | calcado, y **ahora cierto**: la casilla «Avisar al cliente con el motivo» dispara el correo y el WhatsApp reales (decisión D2, §M #13) |
| 89 | «Motivo del rechazo» (texto libre) | D2, D2b | sustituido por los seis motivos tipificados, redactados para el cliente, con texto libre obligatorio en «Otro» (decisión D3) |
| 90 | «Cancelar» / «Rechazar pedido» | D2 | calcado |
| — | «Listo aprox: hoy 22 sep, 14:35» con fecha y zona de la organización | D1 | **Nuevo** — §M #14 |
| — | «Avisar al cliente con los tiempos estimados» | D1 | **Nuevo** — §N.6 |
| — | «Al confirmar se creará: Venta · Factura · Pago · Cartera · Comanda · Envío · Cupón · Propina» | D1 | **Nuevo** — §H, §N.1 |
| — | Aviso «Se liberará la reserva de 3 productos y se sellará `stock_released_at`» | D2 | **Nuevo** — §I, §M #3 y #4 |
| — | Diálogo «Cancelar pedido confirmado» | D3 | **Nuevo** — hoy no se puede cancelar a partir de «Preparando» (§M #32) |
| — | Diálogo «Imprimir comanda» | D4 | **Nuevo** — §C.5 #145 |

### B.10 Estados y toasts del listado

| # | Control | Frame | Estado |
|---|---|---|---|
| 91 | Tabla de 6 filas de esqueleto con las 10 cabeceras | L2 | sustituido por `Skeleton Variant=table-row` del kit (patrón 7) |
| 92 | «No hay pedidos que mostrar» | L3 | sustituido por `EmptyState Variant=search` con título, descripción y «Limpiar filtros» (patrón 7, §M #37) |
| 93 | Toast «Error / No se pudieron cargar los pedidos» | L4, D6 | sustituido por `EmptyState Variant=error` **en pantalla** con «Reintentar», además del toast (§M #37) |
| 94 | Toast «🔔 Nuevo pedido / Pedido {n} recibido» | D5 | sustituido por un `Toast Variant=info` sin emoji, con cliente, importe, expiración y «Ver el pedido» |
| 95 | Toast «Estado actualizado» | D6 | calcado |
| 96 | Toast «Pedido confirmado / Venta creada · Comanda…» | D6 | calcado y ampliado con el número de venta y de factura (§N.1) |
| 97 | Toast «Pedido rechazado / El cliente será notificado» | D6 | sustituido: dice el motivo que llegó al cliente y la reserva liberada |
| 98 | Toast «Acción masiva completada» | D6 | sustituido por `Toast Variant=partial` cuando no todos avanzan («2 de 3 pedidos actualizados») |
| 99 | Toast «Preparando impresión» | D4 | sustituido por el diálogo de impresión, que no falla en silencio si el navegador bloquea la ventana (§M #18) |
| 100 | Toast «Exportación completada» | D6 | calcado |
| — | `EmptyStateSinSucursal` | L5 | **Nuevo** — patrón 10 |
| — | Indicador «En vivo / Reconectando… / Sin tiempo real» | D5 | **Nuevo** — §G, §M #28 |

---

## C. Detalle `/app/pos/pedidos-online/[id]`

### C.1 Cabecera

| # | Control | Frame | Estado |
|---|---|---|---|
| 101 | «Volver» (`router.back()`) | T1–T4 | sustituido por las migas «POS › Pedidos Online › WO-000412» (patrón 4); en móvil se conserva la flecha del `MobileHeader` |
| 102 | `{order_number}` a 24 px | T1–T4 | calcado |
| 103 | `StatusBadge size="lg"` (cuarto mapa) | T1–T3 | sustituido por el `Badge` del `PageHeader` según `SISTEMA-BADGES.md`, en variante sólida: es el estado dominante |
| 104 | Badge «Programado» | T1 | calcado (fila de badges) |
| 105 | Badge «Cupón: {code}» | T1 | calcado como «Cupón AHORRA10» |
| 106 | Badge «Propina: ${n}» | T1, T2 | calcado |
| 107 | Fecha de creación | T1–T3 | calcado y **con la zona horaria de la organización** en el subtítulo (§M #14) |
| 108 | «Para: {fecha}» | T1 | calcado |
| 109 | «Ver venta POS» | T2, T3 | sustituido por la tarjeta «Documentos y trazabilidad», con la venta, la factura, la comanda, el envío y la cartera (§N.1) |
| 110 | `PaymentStatusBadge` a la derecha | T1–T3 | calcado en la fila de badges |
| — | Badge de origen del pedido | T1–T3 | **Nuevo** — `source` existe y no se muestra (§L.2) |
| — | `BranchBadge` del pedido | T1–T3 | **Nuevo** — patrón 9.5 |
| — | Badge «Reserva de stock activa / liberada» | T1–T3 | **Nuevo** — `stock_released_at` (§I) |
| — | Aviso «Expira en 28 minutos por falta de pago» | T1 | **Nuevo** — §J |
| — | Aviso de retraso / de cumplimiento | T2, T3 | **Nuevo** — §N.3 |

### C.2 Productos y totales

| # | Control | Frame | Estado |
|---|---|---|---|
| 111 | «Productos ({n})» | T1–T4 | calcado |
| 112 | Nombre del producto | T1–T4 | calcado |
| 113 | Badge de estado por línea (quinto mapa) | T1–T3 | calcado con el `Badge` del kit. **Sigue siendo de solo lectura**: ningún control lo cambia hoy y el rediseño no inventa uno; la cocina avanza en `kitchen_ticket_items` |
| 114 | «SKU: {sku}» | T1–T3 | calcado |
| 115 | «📝 {nota}» por línea | T1–T3 | calcado como «Nota: …», sin emoji |
| 116 | Modificadores «+ {nombre} (+$…)» | T1–T3 | calcado |
| 117 | «{cantidad} x ${precio}» + total de línea | T1–T4 | calcado |
| 118 | «Subtotal» | T1–T4 | calcado |
| 119 | «Impuestos» (una línea agregada) | T1–T4 | sustituido por **N filas `{nombre} {tasa}`** («IVA 19 %», «Impoconsumo 8 %»), regla I.4.1 de la auditoría de productos |
| 120 | «Descuento» en verde | T1 | sustituido por «Descuento · cupón AHORRA10», que dice de dónde sale (§K) |
| 121 | «Envío» | T1–T4 | calcado |
| 122 | «Propina» | T1–T4 | calcado |
| 123 | «Total» a 18 px | T1–T4 | calcado |
| — | Seriales de la línea (`serial_ids`) | T1 | **Nuevo** — columna real que no se muestra (§L.2) |

### C.3 Notas

| # | Control | Frame | Estado |
|---|---|---|---|
| 124 | «Notas» | T1–T3 | calcado |
| 125 | «Nota del cliente:» sobre amarillo | T1–T3 | calcado |
| 126 | «Notas internas:» sobre gris (solo lectura) | T1–T3 | sustituido por un bloque **editable** con «Editar»: hoy el campo se lee y ninguna pantalla lo escribe (§M, §N.9) |

### C.4 Línea de tiempo

| # | Control | Frame | Estado |
|---|---|---|---|
| 127 | «Historial del pedido» | T1–T4 | calcado |
| 128 | «Pedido recibido» + `created_at` | T1–T4 | calcado |
| 129 | «Programado para» + `scheduled_at` | T1 | calcado |
| 130 | «Confirmado» + `confirmed_at` | T2, T3 | calcado y ampliado con **quién** confirmó (`confirmed_by`, que hoy se escribe y no se muestra) |
| 131 | «En preparación» **sin hora nunca** | T2, T3, T4 | **Nuevo**: se dibuja con hora real; la columna `preparing_at` queda aprobada (decisión D1, §M #11) |
| 132 | «Listo» + `ready_at` | T2, T3, T4 | calcado y ampliado con «prometido 12:54 · 3 min antes» |
| 133 | «En camino» **sin hora nunca** | T2, T4 | **Nuevo**: `in_delivery_at` queda aprobada (decisión D1, §M #11) |
| 134 | «Entregado» + `delivered_at` | T3 | calcado y ampliado con el desvío contra el compromiso |
| 135 | «Cancelado / Rechazado / Expirado» + «Motivo: …» | D2, D3 | calcado en los diálogos; en el detalle se dibujaría con `cancelled_by`, que hoy **no se escribe nunca** (§M #12) |
| — | Variante `horizontal` de `OrderTimeline` | — | **omitido**: rama muerta, ninguna pantalla la usa (§D) |

### C.5 Acciones

| # | Control | Frame | Estado |
|---|---|---|---|
| 136 | «Acciones» | T1–T3 | calcado |
| 137 | «Confirmar pedido» | T1 | calcado (primario) |
| 138 | «Rechazar» | T1 | calcado (destructivo, abre D2) |
| 139 | «Iniciar preparación» | T1 (variante `confirmed`) | sustituido por «Preparar», misma etiqueta que en la lista |
| 140 | «Marcar como listo» | T1 (variante `preparing`) | sustituido por «Listo» |
| 141 | «Enviar a domicilio» | T2 | sustituido por «Enviar» |
| 142 | «Marcar como entregado» | T2 | calcado |
| 143 | «Marcar como pagado» (escribe `sales.balance` a mano) | G2 | sustituido por «Registrar pago», que inserta en `payments` y deja que los disparadores recalculen saldo y cartera (§M #7) |
| 144 | «Crear venta» (que además retrocede el estado) | T3 | sustituido por el enlace a la venta en «Documentos y trazabilidad»: la venta se crea al confirmar, no después (§M #8) |
| 145 | «Imprimir» que **nunca se dibuja** | T1–T3, D4 | **Nuevo en la práctica**: se dibuja y pasa por el motor de documentos (§M #1) |
| 146 | «Cancelar» solo en `pending`/`confirmed` | T2, D3 | sustituido: disponible también en `preparing`, `ready` y `in_delivery` (§M #32) |
| — | «Avisar al cliente del retraso» | T2 | **Nuevo** — §N.6 |
| — | «Llamar al conductor» | T2 | **Nuevo** |
| — | «Enviar el recibo al cliente» | T3 | **Nuevo** |
| — | «Crear devolución» | T3 | **Nuevo** en este módulo (existe en `/app/pos/devoluciones`) |
| — | «Reembolsar pedido…» | T3, G3 | **Nuevo** — el endpoint existe y no tiene botón (§M #45) |
| — | Variante `compact` de `OrderActions` | — | **omitido**: rama muerta (§D) |

### C.6 Cliente

| # | Control | Frame | Estado |
|---|---|---|---|
| 147 | «Cliente» | T1–T4 | calcado |
| 148 | Nombre o «Cliente anónimo» | T1–T4 | calcado |
| 149 | Teléfono → `tel:` | T1–T4 | calcado |
| 150 | Correo → `mailto:` | T1–T4 | calcado |
| 151 | Dirección compuesta | T1–T3 | sustituido: la dirección vive solo en la tarjeta «Entrega», no repetida en «Cliente» (patrón 4.1) |
| 152 | «📝 {instructions}» | T1–T3 | calcado en «Entrega», sin emoji |
| — | «Ver ficha del cliente» y «Escribir por WhatsApp» | T1–T3 | **Nuevo** — §N.10 |
| — | Documento y pedidos anteriores | T1–T3 | **Nuevo** — contexto que hoy obliga a salir de la pantalla |
| — | Componente `CustomerInfo` (3 variantes) | — | **omitido**: exportado y no usado por ninguna pantalla (§D) |

### C.7 Entrega

| # | Control | Frame | Estado |
|---|---|---|---|
| 153 | «Entrega» | T1–T4 | calcado |
| 154 | «Retiro en tienda / Delivery propio / Delivery terceros» | T1–T4 | calcado con las etiquetas corregidas («Recoger en tienda», «Domicilio propio», «Domicilio tercero»), coherentes con la lista |
| 155 | Badge `{delivery_partner}` | L1 | calcado (columna «Entrega») |
| 156 | Dirección, barrio, ciudad, departamento, país | T1–T3 | calcado |
| 157 | «📝 {instructions}» | T1 | calcado, sin emoji |
| 158 | «Ver en mapa» | T1, T2 | calcado |
| 159 | «Programado: {fecha}» | T1 | calcado |
| 160 | «Listo aprox: {hora}» **sin fecha** | T1, T2 | sustituido: con fecha completa, porque en comercio el compromiso son días (§M, §J) |
| 161 | «Entrega aprox: {hora}» **sin fecha** | T2 | sustituido igual |
| 162 | «Asignar Conductor» | T1, G1 | calcado como «Asignar conductor», abre G1 |
| — | Guía del envío | T2 | **Nuevo** |
| — | Componente `DeliveryInfo` y `DeliveryTypeBadge` | — | **omitido**: exportados y no usados (§D) |

### C.8 Seguimiento del envío

| # | Control | Frame | Estado |
|---|---|---|---|
| 163 | «Tracking» | T2 | calcado como «Seguimiento del envío» |
| 164 | Badge del estado del envío (sexto mapa) | T2 | sustituido por el `Badge` del kit |
| 165 | «Tracking:» + número | T2 | calcado como «Guía» |
| 166 | «Vehículo asignado» + placa, marca y modelo | T2 | calcado |
| 167 | «Conductor» + nombre + `tel:` | T2 | calcado |
| 168 | «Entrega estimada:» | T2 | calcado |
| 169 | «Historial» — últimos 5 eventos | T2 | calcado (Asignado · Recogido · En camino) |
| 170 | «Prueba de entrega» — recibido por, fecha, «⭐⭐⭐⭐» | T3 | calcado; la calificación pasa a `Badge` «5 de 5», sin emoji (§M #38) |
| 171 | «Ver firma» | T3 | calcado |
| 172 | «Ver ruta en Google Maps» | T2 | calcado |
| 173 | «Actualizar estado» | — | **omitido**: el seguimiento se refresca con el tiempo real de la pantalla; un botón de recarga manual por tarjeta es el síntoma de que no lo hacía (§C.8) |
| 174 | «No hay envío asignado» + «Asignar Delivery» | T1 | calcado como «Conductor · Sin asignar» + «Asignar conductor» |
| 175 | Esqueleto del seguimiento | S1 | calcado en el estado de carga del detalle |
| — | Seguimiento para `delivery_third_party` | — | **omitido**: no existe hoy ni en el módulo de transporte; queda anotado en §N.16 |
| — | `ProofOfDeliveryView` (11 KB) | — | **omitido**: exportado y no importado en ninguna parte (§D) |

### C.9 Diálogos del detalle

| # | Control | Frame | Estado |
|---|---|---|---|
| 176 | «Confirmar pedido» + «Indica los tiempos estimados» | D1 | unificado con el del listado |
| 177 | «Tiempo de preparación» | D1 | calcado |
| 178 | «Tiempo de traslado» (oculto en retiro) | D1 | calcado |
| 179 | «El cliente recibirá una notificación con estos tiempos estimados» | D1 | sustituido por la casilla «Avisar al cliente…»: el texto dejaba de ser falso solo si el aviso existe (§M #13) |
| 180 | Casilla «Marcar como pagado» | D1 | calcado |
| 181 | «Cancelar» / «Confirmar pedido» | D1 | calcado |
| 182 | «Rechazar pedido» / «Cancelar pedido» según estado | D2, D3 | calcado como dos diálogos distintos, con consecuencias distintas |
| 183 | «Motivo» + «Este motivo se mostrará al cliente» | D2, D3 | sustituido por motivo tipificado + nota |
| 184 | «Volver» / «Rechazar» | D2, D3 | sustituido: el botón de salida se llama **«Cancelar»** (patrón 8, §M #33) |
| 185 | «Asignar Delivery» + descripción | G1 | calcado como «Asignar la entrega de WO-000408» |
| 186 | «Vehículo» + placa, tipo, marca y modelo | G1 | calcado (`SearchSelect`) |
| 187 | «Conductor» + nombre o licencia | G1 | calcado (`SearchSelect`) |
| 188 | «Tiempo estimado de entrega (minutos)» 5–180 | G1 | sustituido por «Entrega estimada» con fecha y hora: el tope de 180 min es incompatible con los 5 días por defecto de una organización de comercio (§C.9) |
| 189 | «Cancelar» / «Asignar Delivery» | G1 | calcado como «Cancelar» / «Asignar» |
| 190 | «No hay vehículos / conductores disponibles» + salida al módulo de Transporte | G1 | calcado (descrito en la nota del diálogo) |
| 191 | Esqueleto del diálogo | G1 | calcado (nota) |
| 192 | Toast «Campos requeridos» | D6 | calcado |
| 193 | Toast «Asignación exitosa» | D6 | calcado |
| 194 | Toast «No se encontró el envío asociado…» | — | **omitido**: en el rediseño el envío se crea al confirmar (§H), así que el caso desaparece |
| — | «Registrar pago» | G2 | **Nuevo** — §N.8 |
| — | «Reembolsar pedido» | G3 | **Nuevo** — §N.7 |

### C.10 Estados del detalle

| # | Control | Frame | Estado |
|---|---|---|---|
| 195 | `PageHeaderSkeleton` + `DetailSkeleton` | S1 | calcado con `Skeleton` del kit |
| 196 | «Pedido no encontrado» + «Volver» + «Ver todos los pedidos» | S2 | sustituido por `EmptyState Variant=empty` y, separado, `Variant=forbidden` para «sin permiso»: hoy los tres casos caen en el mismo sitio (§C.10) |
| 197 | Toast «No se pudo cargar el pedido» | D6 | calcado |
| 198 | Toast «Pedido confirmado / Venta creada…» | D6 | calcado y ampliado |
| 199 | Toasts «Pedido en preparación / listo / en camino / entregado / cancelado / pagado» | D6 | calcado |
| 200 | Seis toasts que dicen solo «Error» | D6 | sustituido por `Toast Variant=error` con causa y acción («Reintentar») (§M #43) |

---

## Avisos al cliente — lo que no existía (decisión D2)

Ninguna fila de esta tabla sale de la auditoría: todo es «Nuevo». Se lista aparte para que se
vea qué hay que construir.

| Control | Frame | Estado |
|---|---|---|
| «Avisos al cliente» en Configuración › POS, con migas y una sola primaria «Guardar cambios» | C1 | **Nuevo** |
| Seis momentos: pedido recibido · confirmado · listo · en camino · entregado · rechazado o cancelado | C1 | **Nuevo** |
| Interruptor por canal (correo y WhatsApp) en cada momento | C1 | **Nuevo** |
| Texto de la plantilla por momento + «Vista previa» | C1, C2 | **Nuevo** |
| Remite del correo, nombre visible y número de WhatsApp | C1 | **Nuevo** |
| Vista previa por canal con De / Para / Asunto / cuerpo | C2 | **Nuevo** |
| Nueve variables de plantilla (`{{cliente}}`, `{{numero}}`, `{{listo_aprox}}`, `{{entrega_aprox}}`, `{{lineas}}`, `{{total}}`, `{{sucursal}}`, `{{motivo}}`, `{{conductor}}`) | C2 | **Nuevo** |
| «Enviarme una prueba» | C2 | **Nuevo** |
| Línea de aviso bajo cada paso del historial, con canal, hora y estado | T1, T2, T3, T4, C3 | **Nuevo** |
| Los cinco estados del aviso: Encolado · Enviado · Entregado · Fallido · Sin datos | C3 | **Nuevo** |
| «Reenviar» cuando el aviso falla o cuando se corrigió el dato | T2, C3 | **Nuevo** |
| Casilla «Avisar al cliente con los tiempos estimados» al confirmar | D1 | **Nuevo** |
| Casilla «Avisar al cliente con el motivo» al rechazar y al cancelar | D2, D3 | **Nuevo** |
| «Avisar al cliente del retraso» en el detalle | T2 | **Nuevo** |
| «Enviar el recibo al cliente» | T3 | **Nuevo** |
| «Avisar a los clientes» en la barra masiva | L8 | **Nuevo** |
| Aviso de pedido sin correo ni teléfono **antes** de confirmar, con los campos para añadirlos | D7 | **Nuevo** |
| Casilla «Confirmar igualmente, sin avisar al cliente» | D7 | **Nuevo** |
| Nota de infraestructura: el envío va por la cola de trabajos, nunca desde el navegador | C1, C3 | **Nuevo** |

---

## Conteo

| Estado | Controles |
|---|---|
| Calcado | 108 |
| Sustituido por otro componente, otra etiqueta o otro sitio | 60 |
| Omitido con motivo | 12 |
| **Total de la auditoría cubierto** | **180 de 200** |
| Añadido y marcado «Nuevo» en Figma | 73 marcas sobre 88 controles inventados (19 de ellos, los avisos al cliente, en su propia tabla) |

Los 20 controles restantes de los 200 son variantes de la misma familia que ya están cubiertas
por su fila (por ejemplo los seis avances de estado de la fila, que se dibujan con un único
icono contextual, o los cinco toasts de acción del detalle agrupados en D6). Ninguno queda sin
representación.

**Los 12 omitidos, con su motivo:**

1. Botón «Buscar» — redundante con el rebote que ya aplica la búsqueda.
2. Icono `Eye` de la fila — la fila entera abre el detalle (patrón 6.1).
3. Icono `Eye` de la tarjeta del tablero — ídem.
4. Columna «Items» en la fila de escritorio — no cabe con «Compromiso»; se conserva en el
   tablero y en móvil, y el detalle la da completa.
5. Columna «Sucursal» — solo aparece en vista consolidada, que no se dibuja en estos frames.
6. «Eliminar» de la `BulkActionBar` — un pedido web no se borra (patrón 12.2).
7. «Actualizar estado» del seguimiento — lo cubre el tiempo real de la pantalla.
8. Toast «No se encontró el envío asociado» — el caso desaparece al crear el envío al confirmar.
9. Variante `horizontal` de `OrderTimeline` — rama muerta en código.
10. Variante `compact` de `OrderActions` — rama muerta en código.
11. `CustomerInfo`, `DeliveryInfo` y `DeliveryTypeBadge` — exportados y no usados por ninguna
    pantalla.
12. `ProofOfDeliveryView` — exportado y no importado en ninguna parte.

## Verificación

- Secciones nuevas: **3** · frames de primer nivel: **30** · anotaciones: **31** · textos: 1.982.
- Solapes entre las 26 Secciones de la página `05 POS y ventas`: **0**.
- Solapes entre frames de primer nivel dentro de las tres Secciones nuevas: **0**.
- Nodos fuera de su Sección: **0**.
- Contenido fuera de su contenedor (excluidos los frames que recortan a propósito): **0**.
- Instancias rotas: **0** de **2.010**.
- Textos heredados de otra pantalla: **0** (comprobado contra una lista de literales de
  Productos, Ventas y Facturas: «4.368», «Nueva Venta», «Nuevo producto», «Importar»,
  «Precios · Stock», «de 1.312», «25 por página», «Emitida», «Borrador», «Regenerar»,
  «Aún no hay productos», «Ofertas», «Verano»).
- Contadores del dominio: «137 pedidos», «3 pedidos», «Seleccionar los 137», «Mostrando 1–20 de
  137 pedidos», «20 por página», páginas 1–7.
- **Las 23 Secciones que ya existían conservan su `x`, `y`, ancho y alto originales**:
  al crear una Sección nueva Figma empujó y encogió seis de ellas («Componentes — Mesas y
  promociones», «Mesas — plano y detalle», «Reservas de mesas», «Comandas», «Promociones y
  cupones», «Cargos de servicio») y el «Índice»; se restauraron una por una y se comprobó
  contra la geometría registrada antes de empezar.
- Índice de la página actualizado con las entradas 17, 18 y 19.

## Capturas

`docs/design/figma/24-pedidos-01-seccion-listado.png` ·
`24-pedidos-02-lista.png` · `24-pedidos-03-tablero.png` · `24-pedidos-04-masivos.png` ·
`24-pedidos-05-filtros.png` · `24-pedidos-06-menu-fila.png` · `24-pedidos-07-vacio.png` ·
`24-pedidos-08-movil-listado.png` · `24-pedidos-09-dialogo-confirmar.png` ·
`24-pedidos-10-seccion-detalle.png` · `24-pedidos-11-detalle-pendiente.png` ·
`24-pedidos-12-detalle-en-camino.png` · `24-pedidos-13-detalle-entregado.png` ·
`24-pedidos-14-movil-detalle.png` · `24-pedidos-15-seccion-avisos.png` ·
`24-pedidos-16-avisos-config.png` · `24-pedidos-17-avisos-plantilla.png` ·
`24-pedidos-18-avisos-historial.png` · `24-pedidos-19-motivos-rechazo.png` ·
`24-pedidos-20-sin-contacto.png` · `24-pedidos-21-reembolso.png`
