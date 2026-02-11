# Análisis Crítico: Checkout Restaurante — go-admin-erp

> **Fecha**: Junio 2025  
> **Proyecto**: go-admin-erp (lado administrativo)  
> **Proyecto complementario**: goadmin-websites (lado cliente/website)  
> **Supabase ID**: jgmgphmzusbluqhuqihj

---

## 1. Resumen Ejecutivo

Se identificaron **6 problemas graves** y **4 gaps medios** en el flujo de pedidos online para restaurante. Este documento analiza:

1. Qué tablas ya existen y qué columnas están sin usar
2. Qué páginas admin ya existen en `go-admin-erp`
3. Qué es responsabilidad del **admin (ERP)** vs del **website (goadmin-websites)**
4. Si el módulo de **transporte/envíos** sirve para domicilios
5. Plan paso a paso de lo que se debe hacer **solo en go-admin-erp**

### Principio clave

> **El ERP es administrativo. No repite lógica del website.**  
> El website captura datos del cliente → el ERP los gestiona, procesa y vincula al POS.

---

## 2. Inventario de Tablas Relevantes

### 2.1 web_orders (pedido online)

| Columna | Tipo | Default | Estado |
|---------|------|---------|--------|
| `id` | uuid | gen_random_uuid() | ✅ Usado |
| `organization_id` | integer | — | ✅ Usado |
| `branch_id` | integer | — | ✅ Usado |
| `customer_id` | uuid | NULL | ✅ Usado |
| `order_number` | text | — | ✅ Usado |
| `status` | text | 'pending' | ✅ Usado |
| `source` | text | 'website' | ✅ Usado |
| `subtotal` | numeric | 0 | ✅ Usado |
| `tax_total` | numeric | 0 | ✅ Usado |
| `discount_total` | numeric | 0 | ✅ Usado |
| `delivery_fee` | numeric | 0 | ⚠️ Existe, website no lo calcula bien |
| **`tip_amount`** | numeric | 0 | 🔴 **NUNCA SE ESCRIBE** — checkout no lo captura |
| `total` | numeric | 0 | ✅ Usado |
| **`delivery_type`** | text | 'pickup' | 🔴 **NUNCA SE ESCRIBE** — checkout no pregunta |
| `delivery_partner` | text | NULL | ❌ Sin usar |
| `delivery_address` | jsonb | '{}' | ⚠️ Se envía siempre (aun en pickup) |
| **`is_scheduled`** | boolean | false | 🔴 **NUNCA SE ESCRIBE** |
| **`scheduled_at`** | timestamptz | NULL | 🔴 **NUNCA SE ESCRIBE** |
| `estimated_ready_at` | timestamptz | NULL | 🔴 Sin calcular |
| `estimated_delivery_at` | timestamptz | NULL | 🔴 Sin calcular |
| `payment_status` | text | 'pending' | ✅ Usado (webhooks) |
| `payment_method` | text | NULL | ✅ Usado |
| `payment_reference` | text | NULL | ✅ Usado |
| **`sale_id`** | uuid | NULL | 🔴 **NUNCA SE ESCRIBE** — conexión rota |
| `confirmed_at` | timestamptz | NULL | ⚠️ Se escribe desde admin |
| `confirmed_by` | uuid | NULL | ⚠️ Se escribe desde admin |
| `ready_at` | timestamptz | NULL | ⚠️ Parcial |
| `delivered_at` | timestamptz | NULL | ⚠️ Parcial |
| `cancelled_at` | timestamptz | NULL | ✅ Usado |

**Conclusión**: Las columnas `delivery_type`, `tip_amount`, `is_scheduled`, `scheduled_at` y `sale_id` existen pero **nunca se escriben**. El website necesita enviarlas; el admin necesita leerlas y actuar sobre ellas.

### 2.2 web_order_items

| Columna | Tipo | Estado |
|---------|------|--------|
| `product_id` | integer | ✅ Usado |
| `product_name` | text | ✅ Usado |
| `quantity` | numeric | ✅ Usado |
| `unit_price` | numeric | ✅ Usado |
| `tax_amount` | numeric | ✅ Usado |
| **`modifiers`** | jsonb | 🔴 **NUNCA SE USA** — `'[]'::jsonb` siempre |
| **`notes`** | text | 🔴 **NUNCA SE USA** |
| `status` | text | ⚠️ Parcial |

### 2.3 restaurant_tables

| Columna | Tipo | Default |
|---------|------|---------|
| `id` | uuid | uuid_generate_v4() |
| `organization_id` | integer | — |
| `branch_id` | integer | — |
| `name` | text | — |
| `zone` | text | NULL |
| `capacity` | integer | 4 |
| `state` | text | 'free' |
| `position_x` | integer | NULL |
| `position_y` | integer | NULL |

**Estado**: ✅ Tabla bien diseñada. Página admin `/pos/mesas` la gestiona con floor map, zonas, estados.

### 2.4 table_sessions

| Columna | Tipo | Default |
|---------|------|---------|
| `id` | uuid | uuid_generate_v4() |
| `organization_id` | integer | — |
| `restaurant_table_id` | uuid | NULL |
| `sale_id` | uuid | NULL |
| `server_id` | uuid | — |
| `customers` | integer | 1 |
| `status` | text | 'active' |
| `opened_at` | timestamptz | now() |
| `closed_at` | timestamptz | NULL |

**Estado**: ✅ Funcional para POS presencial. Para reservas web se necesita usar `reservations` con metadata.

### 2.5 sales (venta POS)

| Columna | Tipo | Estado |
|---------|------|--------|
| `id` | uuid | ✅ |
| `organization_id` | integer | ✅ |
| `branch_id` | integer | ✅ |
| `customer_id` | uuid | ✅ |
| `user_id` | uuid | ✅ (quien registra) |
| `total` | numeric | ✅ |
| `balance` | numeric | ✅ |
| `status` | text | ✅ |
| `payment_status` | text | ✅ |
| `tax_total` | numeric | ✅ |
| `subtotal` | numeric | ✅ |
| `discount_total` | numeric | ✅ |
| `reservation_id` | uuid | ⚠️ Para hotel, no usado en restaurant |

### 2.6 tips (propinas)

| Columna | Tipo | Default |
|---------|------|---------|
| `id` | uuid | gen_random_uuid() |
| `organization_id` | integer | — |
| `branch_id` | integer | — |
| `sale_id` | uuid | NULL |
| `payment_id` | uuid | NULL |
| `server_id` | uuid | — |
| `amount` | numeric | — |
| `tip_type` | text | 'cash' |
| `is_distributed` | boolean | false |

**Estado**: ✅ Tabla completa. Solo se usa desde POS presencial. Cuando un web_order con `tip_amount > 0` se confirme, debería crear un registro aquí con `tip_type = 'online'`.

### 2.7 kitchen_tickets / kitchen_ticket_items

| Tabla | Columnas Clave | Estado |
|-------|---------------|--------|
| `kitchen_tickets` | sale_id, table_session_id, status, priority, estimated_time | ✅ Funcional |
| `kitchen_ticket_items` | kitchen_ticket_id, sale_item_id, station, status, preparation_time | ✅ Funcional |

**Estado**: ✅ El sistema de comandas funciona. Cuando un web_order se vincule a una sale, se puede generar kitchen_ticket automáticamente.

---

## 3. Módulo de Transporte para Domicilios

### 3.1 Tablas del módulo transporte/envíos

| Tabla | Propósito | Útil para domicilios? |
|-------|-----------|----------------------|
| `shipments` | Envío con dirección, carrier, tracking, status | ✅ **SÍ** |
| `shipment_items` | Ítems del envío | ⚠️ Opcional |
| `delivery_attempts` | Intentos de entrega (status, coordenadas, fotos) | ✅ **SÍ** |
| `delivery_logs` | Logs de notificaciones de entrega | ❌ Es para notificaciones |
| `shipping_rates` | Tarifas de envío | ✅ Para calcular delivery_fee |
| `shipping_labels` | Etiquetas de envío | ❌ No aplica a comida |
| `dispatch_manifests` | Manifiestos de despacho | ❌ Logística pesada |
| `transport_carriers` | Transportistas/repartidores | ✅ **SÍ** |
| `transport_routes` | Rutas fijas de transporte | ❌ No aplica |
| `transport_events` | Eventos de timeline | ✅ **SÍ** |
| `trips` / `trip_tickets` / `trip_seats` | Transporte de pasajeros | ❌ No aplica |
| `transport_fares` | Tarifas de viajes | ❌ No aplica |
| `transport_incidents` | Incidentes | ⚠️ Opcional |
| `transport_stops` | Paradas de rutas | ❌ No aplica |

### 3.2 Tabla `shipments` — Ideal para domicilios

```
shipments
├── source_type: 'web_order'     ← tipo de origen
├── source_id: web_order.id      ← enlace directo
├── customer_id                  ← cliente
├── address_id                   ← dirección guardada
├── delivery_address             ← dirección texto
├── delivery_latitude/longitude  ← coordenadas
├── delivery_contact_name/phone  ← contacto
├── delivery_instructions        ← instrucciones
├── carrier_id                   ← repartidor (transport_carriers)
├── tracking_number              ← número de seguimiento
├── status                       ← draft → picked → dispatched → delivered
├── expected_delivery_date       ← fecha estimada
├── shipped_at / delivered_at    ← timestamps reales
└── shipping_fee                 ← costo del envío
```

### 3.3 Veredicto

> **SÍ, el módulo de transporte/envíos es reutilizable para domicilios de restaurante.**

La tabla `shipments` con `source_type = 'web_order'` + `source_id = web_order.id` es perfecta. Junto con `transport_carriers` (repartidores) y `delivery_attempts` (tracking de entrega), forma un sistema completo de delivery.

**NO se necesitan tablas nuevas para domicilios.** Solo hay que:
1. Crear un `shipment` cuando el admin confirma un pedido tipo `delivery`
2. Asignar un `carrier_id` (repartidor)
3. Actualizar estados del shipment según avanza la entrega

---

## 4. Páginas Admin Existentes — Inventario

### 4.1 Módulo POS (`/app/pos/`)

| Página | Ruta | Estado | Relevancia |
|--------|------|--------|------------|
| **POS Principal** | `/pos` | ✅ Completo | Búsqueda productos, carritos, checkout presencial |
| **Mesas** | `/pos/mesas` | ✅ Completo | Floor map, zonas, estados, combinar/mover, sesiones |
| **Mesa Detalle** | `/pos/mesas/[id]` | ✅ Completo | Sesión activa, pedido, cuenta |
| **Comandas** | `/pos/comandas` | ✅ Completo | Kitchen display, estaciones, filtros |
| **Pedidos Online** | `/pos/pedidos-online` | ✅ Funcional | Lista, filtros, stats, confirmar/rechazar/entregar |
| **Pedido Detalle** | `/pos/pedidos-online/[id]` | ✅ Completo | 7 componentes: Header, Products, Customer, Delivery, Timeline, Notes, Actions |
| **Ventas** | `/pos/ventas` | ✅ Completo | Historial, detalle, nueva venta |
| **Propinas** | `/pos/propinas` | ✅ Completo | Lista, formulario, resumen por mesero, distribución |
| **Cajas** | `/pos/cajas` | ✅ Completo | Turnos, arqueos, movimientos |
| **Cargos Servicio** | `/pos/cargos-servicio` | ✅ Completo | CRUD service_charges |
| **Cupones** | `/pos/cupones` | ✅ Completo | CRUD cupones |
| **Promociones** | `/pos/promociones` | ✅ Completo | CRUD promociones |
| **Devoluciones** | `/pos/devoluciones` | ✅ Completo | Motivos, gestión |
| **Reportes** | `/pos/reportes` | ✅ Completo | Reportes de ventas |
| **Pagos Pendientes** | `/pos/pagos-pendientes` | ✅ Completo | Cobros pendientes |
| **Configuración** | `/pos/configuracion` | ✅ Completo | Consecutivos, ajustes |
| **Carritos** | `/pos/carritos` | ❌ **Vacío** | Archivo existe pero sin contenido |

### 4.2 Módulo Organización (`/app/organizacion/`)

| Página | Relevancia |
|--------|------------|
| **Dominios** | ✅ Gestión de subdominios y dominios personalizados para websites |

### 4.3 Módulo Transporte (`/app/transporte/`)

Necesita verificarse qué páginas admin ya existen para `shipments`, `transport_carriers`, etc.

---

## 5. Los 6 Problemas Graves — Análisis de Responsabilidades

### 🔴 P1: Checkout NO distingue Delivery/Pickup/Dine-in

| Aspecto | Responsable | Detalle |
|---------|-------------|---------|
| **UI selector tipo pedido** | 🌐 Website | Componente `OrderTypeSelector` en checkout |
| **Enviar `delivery_type` al crear orden** | 🌐 Website | POST `/api/orders` con campo delivery_type |
| **Mostrar `delivery_type` en admin** | 🏢 **Admin** | `OrderDeliveryCard` ya existe, debe mostrar badge delivery/pickup/dine-in |
| **Filtrar por `delivery_type`** | 🏢 **Admin** | `WebOrderFilters` ya tiene filtro de delivery_type |
| **Condicionar delivery_fee** | 🌐 Website | Solo cobrar delivery_fee si type=delivery |

**Estado admin**: La UI ya soporta `delivery_type` como tipo (`DeliveryType`). El servicio `webOrdersService` ya lo filtra. **No se necesitan cambios grandes en admin para P1**, solo asegurar que el badge/icono se muestre correctamente cuando llegue el dato.

---

### 🔴 P2: Sin menú digital estilo restaurante

| Aspecto | Responsable | Detalle |
|---------|-------------|---------|
| **Página `/menu` con categorías** | 🌐 Website | Componente MenuView, MenuItemCard |
| **Modificadores/extras** | 🌐 Website | ModifiersSelector → `web_order_items.modifiers` |
| **Gestión de productos/categorías** | 🏢 **Admin** | Ya existe en `/inventario` → `products`, `categories`, `product_tags` |

**Estado admin**: ✅ **No se necesitan cambios en admin.** Los productos y categorías ya se gestionan desde el inventario. El website solo necesita consumir esos datos de forma diferente (vista menú vs grilla retail).

---

### 🔴 P3: Sin reserva de mesas para restaurante

| Aspecto | Responsable | Detalle |
|---------|-------------|---------|
| **Wizard reserva de mesa web** | 🌐 Website | Nuevo `RestaurantReservationWizard` |
| **API disponibilidad de mesas** | 🌐 Website (API) | Verificar `restaurant_tables` + `table_sessions` + `reservations` |
| **Gestión de mesas** | 🏢 **Admin** | ✅ Ya existe en `/pos/mesas` |
| **Ver reservas de mesas** | 🏢 **Admin** | 🔴 **FALTA** — No hay vista calendario de reservas de mesas |
| **Confirmar/rechazar reservas web** | 🏢 **Admin** | 🔴 **FALTA** — Necesita página o sección |

**Admin necesita**:
1. **Vista de reservas de mesas** — Calendario o lista de reservas entrantes desde el website
2. **Acciones**: Confirmar, rechazar, contactar cliente
3. Puede ser una pestaña nueva en `/pos/mesas` o una página dedicada `/pos/reservas-mesas`

---

### 🔴 P4: Sin propinas online

| Aspecto | Responsable | Detalle |
|---------|-------------|---------|
| **UI selector de propina** | 🌐 Website | TipSelector en checkout (0%, 5%, 10%, 15%, custom) |
| **Enviar `tip_amount`** | 🌐 Website | POST `/api/orders` con tip_amount |
| **Mostrar propina en detalle** | 🏢 **Admin** | ⚠️ OrderProductsCard muestra totales pero no tip_amount separado |
| **Crear registro `tips`** | 🏢 **Admin** | 🔴 **FALTA** — Al confirmar web_order y crear sale, crear tip con `tip_type='online'` |
| **Reportes de propinas online** | 🏢 **Admin** | ⚠️ `/pos/propinas` solo muestra propinas POS |

**Admin necesita**:
1. Mostrar `tip_amount` en `OrderProductsCard` o `OrderDeliveryCard`
2. Al confirmar pedido → crear registro en `tips` con `tip_type = 'online'`
3. Que `/pos/propinas` incluya propinas online en sus filtros y reportes

---

### 🔴 P5: Sin pedidos programados

| Aspecto | Responsable | Detalle |
|---------|-------------|---------|
| **UI programar pedido** | 🌐 Website | ScheduleSelector en checkout |
| **Enviar `is_scheduled` + `scheduled_at`** | 🌐 Website | POST `/api/orders` |
| **Mostrar pedidos programados** | 🏢 **Admin** | 🔴 **FALTA** — Badge/indicador en cards y detalle |
| **Ordenar/filtrar programados** | 🏢 **Admin** | ⚠️ Filtros actuales no incluyen scheduled |

**Admin necesita**:
1. Badge "Programado para HH:MM" en `WebOrderCard`
2. Filtro "Programados" en `WebOrderFilters`
3. Ordenar por `scheduled_at` cuando aplique
4. Alerta/indicador cuando se acerque la hora programada

---

### 🔴 P6: web_orders.sale_id nunca se escribe — Conexión website→POS ROTA

**Este es el problema más grave del lado admin.** Es la razón por la que los pedidos online no entran al flujo POS.

| Aspecto | Responsable | Detalle |
|---------|-------------|---------|
| **Capturar pedido online** | 🌐 Website | ✅ Funcional (crea web_order) |
| **Confirmar pedido** | 🏢 **Admin** | ⚠️ Cambia status pero NO crea sale |
| **Crear `sale` + `sale_items`** | 🏢 **Admin** | 🔴 **FALTA** — Debe auto-crear al confirmar |
| **Generar `kitchen_ticket`** | 🏢 **Admin** | 🔴 **FALTA** — Comanda para cocina |
| **Escribir `web_orders.sale_id`** | 🏢 **Admin** | 🔴 **FALTA** — Vincular web_order ↔ sale |
| **Crear `tips` si tip_amount > 0** | 🏢 **Admin** | 🔴 **FALTA** |
| **Crear `shipment` si delivery** | 🏢 **Admin** | 🔴 **FALTA** — Para tracking |

**Flujo correcto al confirmar un web_order:**

```
Admin confirma pedido online
│
├── 1. Crear sale (organization_id, branch_id, customer_id, user_id=admin, 
│       total, subtotal, tax_total, discount_total, status='pending')
│
├── 2. Crear sale_items (por cada web_order_item → sale_item 
│       con product_id, quantity, unit_price, notes=modifiers+notes)
│
├── 3. Actualizar web_orders.sale_id = sale.id
│       web_orders.status = 'confirmed'
│       web_orders.confirmed_at = now()
│       web_orders.confirmed_by = admin_user_id
│
├── 4. Crear kitchen_ticket (sale_id, branch_id, status='new', priority)
│       + kitchen_ticket_items (por cada sale_item)
│
├── 5. Si tip_amount > 0:
│       Crear tips (sale_id, amount=tip_amount, tip_type='online', server_id=admin?)
│
├── 6. Si delivery_type = 'delivery':
│       Crear shipment (source_type='web_order', source_id=web_order.id, 
│       dirección del delivery_address, status='draft')
│
└── 7. Si delivery_type = 'dine-in' y hay mesa asignada:
        Crear/vincular table_session
```

---

## 6. Los 4 Gaps Medios — Análisis

### 🟡 G1: Tracking estático (sin polling)

| Responsable | Admin necesita |
|-------------|---------------|
| 🌐 Website | Implementar polling o Supabase Realtime |
| 🏢 **Admin** | ✅ Ya actualiza estados correctamente. **Sin cambios necesarios.** |

### 🟡 G2: Sin estimación de tiempo

| Responsable | Admin necesita |
|-------------|---------------|
| 🏢 **Admin** | Al confirmar, calcular `estimated_ready_at` basado en cantidad de items + kitchen_tickets promedio de la organización |
| 🏢 **Admin** | Si delivery: `estimated_delivery_at = estimated_ready_at + tiempo_estimado_delivery` |

### 🟡 G3: Sin notificaciones de cambio de estado

| Responsable | Admin necesita |
|-------------|---------------|
| 🏢 **Admin** | Al cambiar estado de web_order → enviar notificación (email/WhatsApp) |
| 🏢 **Admin** | Puede reutilizar infraestructura de CRM (channels, messages) |

### 🟡 G4: Sin portal de cliente optimizado para restaurante

| Responsable | Admin necesita |
|-------------|---------------|
| 🌐 Website | `/mi-cuenta/pedidos` optimizado para restaurante |
| 🏢 **Admin** | ✅ **Sin cambios necesarios.** |

---

## 7. Plan de Implementación — Solo go-admin-erp

### Fase 1: Vincular web_orders → POS (CRÍTICO)

> **Objetivo**: Cuando un admin confirma un pedido online, se crea automáticamente la sale, sale_items, kitchen_ticket y se escribe sale_id.

| # | Tarea | Prioridad | Archivos a modificar |
|---|-------|-----------|---------------------|
| 1.1 | **Crear función `confirmWebOrder()`** en servicio — Crea sale + sale_items + kitchen_ticket + escribe sale_id + timestamps | 🔴 Alta | `src/lib/services/webOrdersService.ts` (o nuevo `webOrderConfirmationService.ts`) |
| 1.2 | **Actualizar acción "Confirmar"** en pedidos-online para usar la nueva función | 🔴 Alta | `src/app/app/pos/pedidos-online/page.tsx` |
| 1.3 | **Actualizar detalle** para usar la nueva función desde OrderActionsCard | 🔴 Alta | `src/app/app/pos/pedidos-online/[id]/components/OrderActionsCard.tsx` |
| 1.4 | **Mostrar venta vinculada** — Link a `/pos/ventas/[sale_id]` en detalle del pedido | 🟡 Media | `src/app/app/pos/pedidos-online/[id]/components/OrderHeader.tsx` |
| 1.5 | **Generar kitchen_ticket** al confirmar — Enviar a cocina automáticamente | 🔴 Alta | Reutilizar lógica existente de cocina |

### Fase 2: Propinas Online + Pedidos Programados

| # | Tarea | Prioridad | Archivos a modificar |
|---|-------|-----------|---------------------|
| 2.1 | **Mostrar `tip_amount`** en detalle de pedido online | 🟡 Media | `OrderProductsCard.tsx` o nuevo bloque en detalle |
| 2.2 | **Crear registro `tips`** al confirmar si `tip_amount > 0` | 🟡 Media | Dentro de `confirmWebOrder()` |
| 2.3 | **Incluir propinas online** en la página `/pos/propinas` — Filtro tip_type: 'online' | 🟡 Media | `PropinasService` + `TipsHeader` filtros |
| 2.4 | **Badge "Programado"** en WebOrderCard cuando `is_scheduled = true` | 🟡 Media | `WebOrderCard.tsx` |
| 2.5 | **Mostrar `scheduled_at`** en detalle del pedido | 🟡 Media | `OrderHeader.tsx` o `OrderTimelineCard.tsx` |
| 2.6 | **Filtro "Programados"** en lista de pedidos online | 🟢 Baja | `WebOrderFilters.tsx` |

### Fase 3: Delivery con módulo de envíos

| # | Tarea | Prioridad | Archivos a modificar |
|---|-------|-----------|---------------------|
| 3.1 | **Crear `shipment` automático** al confirmar pedido tipo delivery | 🟡 Media | Dentro de `confirmWebOrder()` |
| 3.2 | **Asignar repartidor** — UI para seleccionar carrier en detalle del pedido | 🟡 Media | Nuevo componente en `OrderDeliveryCard.tsx` |
| 3.3 | **Calcular `estimated_ready_at`** al confirmar — Basado en items/historial | 🟢 Baja | En `confirmWebOrder()` |
| 3.4 | **Calcular `estimated_delivery_at`** — `estimated_ready_at` + tiempo ruta | 🟢 Baja | En `confirmWebOrder()` |
| 3.5 | **Mostrar `delivery_type` con icono** en cards y detalle | 🟡 Media | `WebOrderCard.tsx`, `OrderDeliveryCard.tsx` |

### Fase 4: Reservas de Mesas (Admin)

| # | Tarea | Prioridad | Archivos a modificar |
|---|-------|-----------|---------------------|
| 4.1 | **Página de reservas de mesas** — Lista/calendario de reservas entrantes | 🟡 Media | Nuevo: `src/app/app/pos/reservas-mesas/page.tsx` |
| 4.2 | **Confirmar/rechazar reserva** — Acciones sobre reservas web | 🟡 Media | Componentes en reservas-mesas |
| 4.3 | **Vista en `/pos/mesas`** — Indicador de mesas con reserva próxima | 🟢 Baja | `MesaCard.tsx` — Badge de reserva |

### Fase 5: Notificaciones de cambio de estado

| # | Tarea | Prioridad | Archivos a modificar |
|---|-------|-----------|---------------------|
| 5.1 | **Email al cambiar estado** — confirmed, ready, delivered, cancelled | 🟢 Baja | Nueva función email o reutilizar Resend |
| 5.2 | **WhatsApp al cambiar estado** — Si canal CRM configurado | 🟢 Baja | Integrar con `whatsappSyncService` |

---

## 8. Lo que NO se debe hacer en go-admin-erp

| Funcionalidad | Por qué NO va en admin |
|---------------|----------------------|
| Menú digital (vista restaurante) | Es UI del website, consume los mismos productos del inventario |
| Selector delivery/pickup/dine-in | Es UI del checkout del website |
| Selector de propina | Es UI del checkout del website |
| Programar pedido | Es UI del checkout del website |
| Modificadores de plato | Es UI del carrito/checkout del website |
| Tracking en tiempo real | Es del website (Supabase Realtime/polling) |
| Portal mi-cuenta | Es del website |
| QR para dine-in | Es del website (genera URL `/menu?table=MESA-5`) |

---

## 9. Diagrama de Flujo: Website → Admin → POS

```
┌─────────────────────────────────────────────────────────────┐
│                   WEBSITE (goadmin-websites)                  │
├─────────────────────────────────────────────────────────────┤
│ Cliente elige: delivery/pickup/dine-in                       │
│ Cliente agrega platos con modificadores                      │
│ Cliente elige propina y programación                         │
│ Cliente paga (5 pasarelas)                                   │
│ → INSERT web_orders (delivery_type, tip_amount, is_scheduled)│
│ → INSERT web_order_items (modifiers, notes)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ webhook pago exitoso
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  ADMIN (go-admin-erp)                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ /pos/pedidos-online → Ve nuevo pedido                        │
│    │                                                         │
│    ▼ Admin hace clic "Confirmar"                             │
│    │                                                         │
│    ├── 1. INSERT sales (vinculada a web_order)               │
│    ├── 2. INSERT sale_items (desde web_order_items)          │
│    ├── 3. UPDATE web_orders SET sale_id = sale.id            │
│    ├── 4. INSERT kitchen_ticket + items                      │
│    ├── 5. INSERT tips (si tip_amount > 0)                    │
│    └── 6. INSERT shipment (si delivery)                      │
│                                                              │
│ /pos/comandas → Cocina ve la comanda                         │
│    │                                                         │
│    ▼ Cocina termina                                          │
│    │                                                         │
│    ├── UPDATE web_orders SET status='ready', ready_at=now()  │
│    └── Notificar cliente (email/WhatsApp)                    │
│                                                              │
│ Si delivery:                                                 │
│    ├── Asignar repartidor (shipment.carrier_id)              │
│    ├── UPDATE shipment status → dispatched                   │
│    └── UPDATE web_orders SET status='on_the_way'             │
│                                                              │
│ Entregado:                                                   │
│    ├── UPDATE web_orders SET status='delivered'              │
│    ├── UPDATE shipment status → delivered                    │
│    └── UPDATE sales SET status='paid'                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Dependencias entre Proyectos

| Cambio en Website | Que Admin necesita para funcionar |
|-------------------|----------------------------------|
| Enviar `delivery_type` en POST /api/orders | Admin ya lee el campo, solo necesita badge/icono |
| Enviar `tip_amount` | Admin debe crear registro `tips` al confirmar |
| Enviar `is_scheduled` + `scheduled_at` | Admin debe mostrar badge y filtro |
| Enviar `modifiers` en items | Admin debe mostrar en detalle de productos |
| Enviar `notes` en items | Admin debe mostrar en detalle de productos |

> **Importante**: Los cambios en admin de Fase 1 (confirmWebOrder) se pueden desarrollar ANTES de que el website envíe los campos nuevos. La función simplemente los lee si existen (fallback a valores default).

---

## 11. Priorización Final

```
URGENCIA ALTA (Fase 1):
  → confirmWebOrder() — sale + sale_items + kitchen_ticket + sale_id
  → Sin esto, los pedidos online NO llegan a POS ni a cocina
  
URGENCIA MEDIA (Fases 2-3):
  → Propinas online + Pedidos programados + Delivery con shipments
  → Mejora la experiencia pero no bloquea el flujo básico
  
URGENCIA BAJA (Fases 4-5):
  → Reservas de mesas + Notificaciones
  → Funcionalidades nuevas, no arreglos de flujos rotos
```

---

## 12. Resumen de Archivos a Crear/Modificar

### Nuevos

| Archivo | Fase | Descripción |
|---------|------|-------------|
| `src/lib/services/webOrderConfirmationService.ts` | 1 | Lógica de confirmación: sale + items + kitchen + tips + shipment |
| `src/app/app/pos/reservas-mesas/page.tsx` | 4 | Página de gestión de reservas de mesas |
| Componentes de reservas-mesas | 4 | Cards, filtros, acciones |

### Modificar

| Archivo | Fase | Cambio |
|---------|------|--------|
| `WebOrderCard.tsx` | 2-3 | Badge programado + icono delivery_type |
| `OrderProductsCard.tsx` | 2 | Mostrar tip_amount, modifiers, notes |
| `OrderActionsCard.tsx` | 1 | Usar confirmWebOrder() al confirmar |
| `OrderDeliveryCard.tsx` | 3 | Selector de repartidor, mostrar shipment |
| `OrderHeader.tsx` | 1-2 | Link a sale vinculada, badge scheduled |
| `OrderTimelineCard.tsx` | 2 | Mostrar scheduled_at en timeline |
| `WebOrderFilters.tsx` | 2 | Filtro de programados |
| `PropinasService` + componentes | 2 | Incluir propinas online |
| `pedidos-online/page.tsx` | 1 | Usar confirmWebOrder() |
| `MesaCard.tsx` | 4 | Badge de reserva próxima |
