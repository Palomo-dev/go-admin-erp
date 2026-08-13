# Plan de Implementacion: Trazabilidad de Seriales, Ordenes de Compra y Facturas de Compra

## Resumen Ejecutivo

Sistema completo de trazabilidad de productos individuales desde su origen (proveedor, orden de compra, factura de compra, sucursal) hasta su destino final (cliente, canal de venta, vendedor), soportando reclamos de garantia e historial completo.

---

## Tabla de Contenidos

1. [Analisis del Estado Actual](#fase-0-analisis-del-estado-actual)
2. [Fase 1: Extension de la Tabla `serial_numbers`](#fase-1-extension-de-la-tabla-serial_numbers)
3. [Fase 2: Tabla de Trazabilidad de Seriales](#fase-2-tabla-de-trazabilidad-de-seriales)
4. [Fase 3: Integracion con Ordenes de Compra](#fase-3-integracion-con-ordenes-de-compra)
5. [Fase 4: Integracion con Facturas de Compra](#fase-4-integracion-con-facturas-de-compra)
6. [Fase 5: Integracion con Ventas (POS, Web, Facturas, Mesas)](#fase-5-integracion-con-ventas-pos-web-facturas-mesas)
7. [Fase 6: Servicio de Trazabilidad](#fase-6-servicio-de-trazabilidad)
8. [Fase 7: Interfaz de Usuario - Inventario](#fase-7-interfaz-de-usuario---inventario)
9. [Fase 8: Interfaz de Usuario - Productos](#fase-8-interfaz-de-usuario---productos)
10. [Fase 9: Reclamos de Garantia](#fase-9-reclamos-de-garantia)
11. [Fase 10: Reportes y Dashboard](#fase-10-reportes-y-dashboard)
12. [Fase 11: Seguridad y RLS](#fase-11-seguridad-y-rls)

---

## Fase 0: Analisis del Estado Actual

### Tablas Existentes Relevantes

#### `serial_numbers` (Existente - Basica)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | integer | NO | nextval |
| product_id | integer | NO | - |
| serial | text | NO | - |
| status | text | NO | - |
| sale_id | text | SI | - |
| purchase_id | text | SI | - |
| notes | text | SI | - |
| created_at | timestamptz | SI | now() |
| updated_at | timestamptz | SI | now() |

**Limitaciones actuales:**
- `sale_id` y `purchase_id` son `text` sin FK (no integridad referencial)
- No tiene `organization_id` (no filtra por organizacion)
- No tiene `branch_id` (no sabe en que sucursal esta)
- No tiene `supplier_id` (no sabe de que proveedor vino)
- No tiene `lot_id` (no se relaciona con lotes)
- No tiene `warranty_start` / `warranty_end` (no gestiona garantia)
- No tiene `sold_to_customer_id` (no sabe a quien se vendio)
- No tiene `sold_by_user_id` (no sabe quien lo vendio)
- No tiene `sale_channel` (no sabe por donde se vendio)
- No tiene `current_branch_id` (no sabe en que sucursal esta actualmente)
- RLS activo pero solo filtra por `product_id` → `organization_members`

#### `products` (Existente - 25 columnas)
Columnas clave: `id`, `organization_id`, `sku`, `name`, `barcode`, `track_stock`, `product_type`, `brand`, `reference`

#### `stock_levels` (Existente)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | integer | NO | nextval |
| product_id | integer | NO | - |
| branch_id | integer | NO | - |
| lot_id | integer | SI | null |
| qty_on_hand | numeric | SI | 0 |
| qty_reserved | numeric | SI | 0 |
| avg_cost | numeric | SI | 0 |
| min_level | numeric | SI | 0 |

#### `stock_movements` (Existente)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | integer | NO | nextval |
| organization_id | integer | NO | - |
| branch_id | integer | NO | - |
| product_id | integer | NO | - |
| lot_id | integer | SI | null |
| direction | text | NO | - |
| qty | numeric | NO | - |
| unit_cost | numeric | SI | - |
| source | text | NO | - |
| source_id | text | SI | - |
| note | text | SI | - |
| updated_by | uuid | SI | - |

#### `lots` (Existente)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | integer | NO | nextval |
| product_id | integer | NO | - |
| lot_code | text | NO | - |
| expiry_date | date | SI | - |
| supplier_id | integer | SI | - |

#### `purchase_orders` (Existente)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | integer | NO | nextval |
| uuid | uuid | NO | gen_random_uuid() |
| organization_id | integer | NO | - |
| branch_id | integer | NO | - |
| supplier_id | integer | NO | - |
| status | text | NO | - |
| expected_date | text | SI | - |
| total | numeric | SI | - |
| created_by | uuid | SI | - |
| notes | text | SI | - |

#### `purchase_order_items` (Existente)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | integer | NO | nextval |
| purchase_order_id | integer | NO | - |
| product_id | integer | NO | - |
| quantity | numeric | NO | - |
| unit_cost | numeric | NO | - |
| subtotal | numeric | NO | - |
| received_quantity | numeric | SI | - |
| notes | text | SI | - |

#### `invoice_purchase` (Existente)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | uuid | NO | uuid_generate_v4() |
| organization_id | integer | NO | - |
| branch_id | integer | NO | - |
| supplier_id | integer | NO | - |
| po_id | integer | SI | - |
| number_ext | text | NO | - |
| issue_date | timestamptz | SI | now() |
| due_date | timestamptz | SI | - |
| subtotal | numeric | SI | 0 |
| tax_total | numeric | SI | 0 |
| total | numeric | SI | 0 |
| balance | numeric | SI | 0 |
| status | text | NO | - |
| created_by | uuid | SI | - |

#### `invoice_items` (Existente - Compartida compra/venta)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | uuid | NO | uuid_generate_v4() |
| invoice_id | uuid | NO | - |
| invoice_type | text | NO | - |
| product_id | integer | SI | - |
| description | text | NO | - |
| qty | numeric | NO | 0 |
| unit_price | numeric | NO | 0 |
| tax_code | text | SI | - |
| tax_rate | numeric | SI | 0 |
| total_line | numeric | NO | 0 |
| invoice_sales_id | uuid | SI | - |
| invoice_purchase_id | uuid | SI | - |

#### `sales` (Existente - POS)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | uuid | NO | uuid_generate_v4() |
| organization_id | integer | NO | - |
| branch_id | integer | NO | - |
| customer_id | uuid | SI | - |
| user_id | uuid | NO | - |
| total | numeric | SI | 0 |
| status | text | NO | - |
| sale_date | timestamptz | SI | now() |
| salesperson_id | uuid | SI | - |
| table_session_id | uuid | SI | - |
| driver_id | uuid | SI | - |

#### `sale_items` (Existente - POS)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | uuid | NO | uuid_generate_v4() |
| sale_id | uuid | NO | - |
| product_id | integer | SI | - |
| quantity | numeric | NO | 1 |
| unit_price | numeric | NO | - |
| total | numeric | NO | - |

#### `web_orders` (Existente - Pedidos Online)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | uuid | NO | gen_random_uuid() |
| organization_id | integer | NO | - |
| branch_id | integer | NO | - |
| customer_id | uuid | SI | - |
| order_number | text | NO | - |
| status | text | NO | 'pending' |
| source | text | SI | 'website' |
| total | numeric | SI | 0 |
| sale_id | uuid | SI | - |

#### `web_order_items` (Existente)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | uuid | NO | gen_random_uuid() |
| web_order_id | uuid | NO | - |
| product_id | integer | SI | - |
| product_name | text | NO | - |
| quantity | numeric | NO | 1 |
| unit_price | numeric | NO | - |
| total | numeric | NO | - |

#### `invoice_sales` (Existente - Facturas de Venta)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | uuid | NO | uuid_generate_v4() |
| organization_id | integer | NO | - |
| branch_id | integer | NO | - |
| customer_id | uuid | SI | - |
| sale_id | uuid | SI | - |
| number | text | NO | - |
| total | numeric | SI | 0 |
| status | text | NO | - |
| created_by | uuid | SI | - |

#### `customers` (Existente)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | uuid | NO | gen_random_uuid() |
| organization_id | integer | SI | - |
| branch_id | integer | SI | - |
| first_name | text | SI | - |
| last_name | text | SI | - |
| email | text | SI | - |
| phone | text | SI | - |
| identification_number | text | SI | - |

#### `suppliers` (Existente)
| Columna | Tipo | Nulable | Default |
|---------|------|---------|---------|
| id | integer | NO | nextval |
| organization_id | integer | NO | - |
| name | text | NO | - |
| nit | text | SI | - |
| contact | text | SI | - |
| phone | text | SI | - |
| email | text | SI | - |

### Servicios Existentes (Frontend)

| Servicio | Archivo | Funcionalidad |
|----------|---------|---------------|
| `purchaseOrderService` | `src/lib/services/purchaseOrderService.ts` | CRUD ordenes de compra, recepcion |
| `stockMovementService` | `src/lib/services/stockMovementService.ts` | Increment/Decrement stock, reservas |
| `stockService` | `src/lib/services/stockService.ts` | Consulta de stock y movimientos |
| `supplierService` | `src/lib/services/supplierService.ts` | CRUD proveedores |
| `productService` | `src/lib/services/productService.ts` | CRUD productos |
| `inventoryDashboardService` | `src/lib/services/inventoryDashboardService.ts` | KPIs de inventario |
| `timelineService` | `src/lib/services/timelineService.ts` | Eventos de timeline |

### Modulos Frontend Existentes

| Modulo | Ruta | Componentes |
|--------|------|-------------|
| Inventario | `/app/inventario` | Dashboard, productos, stock, movimientos, ordenes-compra, proveedores |
| Finanzas | `/app/finanzas` | Facturas compra, cuentas por pagar |
| POS | `/app/pos` | Ventas, cajas, pedidos-online, mesas |
| Clientes | `/app/clientes` | Lista y detalle de clientes |
| Timeline | `/app/timeline` | Eventos del sistema |

---

## Fase 1: Extension de la Tabla `serial_numbers`

### Objetivo
Ampliar la tabla `serial_numbers` existente con columnas de trazabilidad completa, manteniendo compatibilidad con datos existentes.

### Cambios a la Tabla `serial_numbers`

```sql
-- Fase 1: Extension de serial_numbers
-- Agregar columnas de trazabilidad

ALTER TABLE public.serial_numbers
  ADD COLUMN IF NOT EXISTS organization_id integer,
  ADD COLUMN IF NOT EXISTS branch_id integer,
  ADD COLUMN IF NOT EXISTS lot_id integer,
  ADD COLUMN IF NOT EXISTS supplier_id integer,
  ADD COLUMN IF NOT EXISTS purchase_order_id integer,
  ADD COLUMN IF NOT EXISTS purchase_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS current_branch_id integer,
  ADD COLUMN IF NOT EXISTS sold_to_customer_id uuid,
  ADD COLUMN IF NOT EXISTS sold_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS sale_channel text DEFAULT 'in_stock',
  ADD COLUMN IF NOT EXISTS sale_date timestamptz,
  ADD COLUMN IF NOT EXISTS sale_id uuid,
  ADD COLUMN IF NOT EXISTS web_order_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_sale_id uuid,
  ADD COLUMN IF NOT EXISTS warranty_start date,
  ADD COLUMN IF NOT EXISTS warranty_end date,
  ADD COLUMN IF NOT EXISTS warranty_months integer,
  ADD COLUMN IF NOT EXISTS cost_at_purchase numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_at_sale numeric,
  ADD COLUMN IF NOT EXISTS received_date timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Llenar organization_id desde products para registros existentes
UPDATE public.serial_numbers sn
SET organization_id = p.organization_id
FROM public.products p
WHERE sn.product_id = p.id AND sn.organization_id IS NULL;

-- Hacer organization_id NOT NULL despues de llenar
ALTER TABLE public.serial_numbers
  ALTER COLUMN organization_id SET NOT NULL;

-- Foreign Keys
ALTER TABLE public.serial_numbers
  ADD CONSTRAINT fk_serial_organization FOREIGN KEY (organization_id) 
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_serial_branch FOREIGN KEY (branch_id) 
    REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_serial_lot FOREIGN KEY (lot_id) 
    REFERENCES public.lots(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_serial_supplier FOREIGN KEY (supplier_id) 
    REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_serial_purchase_order FOREIGN KEY (purchase_order_id) 
    REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_serial_purchase_invoice FOREIGN KEY (purchase_invoice_id) 
    REFERENCES public.invoice_purchase(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_serial_current_branch FOREIGN KEY (current_branch_id) 
    REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_serial_customer FOREIGN KEY (sold_to_customer_id) 
    REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_serial_product FOREIGN KEY (product_id) 
    REFERENCES public.products(id) ON DELETE CASCADE;

-- Indices para busqueda rapida
CREATE INDEX IF NOT EXISTS idx_serial_organization ON public.serial_numbers(organization_id);
CREATE INDEX IF NOT EXISTS idx_serial_product ON public.serial_numbers(product_id);
CREATE INDEX IF NOT EXISTS idx_serial_branch ON public.serial_numbers(branch_id);
CREATE INDEX IF NOT EXISTS idx_serial_supplier ON public.serial_numbers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_serial_status ON public.serial_numbers(status);
CREATE INDEX IF NOT EXISTS idx_serial_sale_channel ON public.serial_numbers(sale_channel);
CREATE INDEX IF NOT EXISTS idx_serial_customer ON public.serial_numbers(sold_to_customer_id);
CREATE INDEX IF NOT EXISTS idx_serial_po ON public.serial_numbers(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_serial_invoice_purchase ON public.serial_numbers(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_serial_current_branch ON public.serial_numbers(current_branch_id);
CREATE INDEX IF NOT EXISTS idx_serial_warranty_end ON public.serial_numbers(warranty_end);
```

### Estados de Serial (`status`)

| Estado | Descripcion |
|--------|-------------|
| `in_stock` | En inventario, disponible para venta |
| `reserved` | Reservado para un pedido web |
| `sold` | Vendido a un cliente |
| `returned` | Devuelto por cliente |
| `in_transit` | En transito entre sucursales |
| `damaged` | Danado, no vendible |
| `rma` | En proceso de devolucion a proveedor |
| `warranty_claim` | En reclamo de garantia |

### Canales de Venta (`sale_channel`)

| Canal | Descripcion |
|-------|-------------|
| `in_stock` | Aun no vendido |
| `pos` | Vendido via POS |
| `web` | Vendido via pedidos online |
| `invoice` | Vendido via factura de venta |
| `table` | Vendido via mesa del POS |

### Migracion de datos existentes

```sql
-- Migrar sale_id y purchase_id existentes (text) a las nuevas FK
-- Esto se hace con scripts de migracion caso por caso

-- Para seriales que tienen purchase_id como texto:
UPDATE public.serial_numbers
SET status = 'in_stock'
WHERE status IS NULL OR status = '';

-- Para seriales que tienen sale_id como texto y status = 'sold':
-- Se debe ejecutar un script que mapee el sale_id texto a sale_id uuid
-- y actualice sold_to_customer_id y sold_by_user_id desde la tabla sales
```

---

## Fase 2: Tabla de Trazabilidad de Seriales

### Objetivo
Crear una tabla de eventos que registre cada cambio de estado o movimiento de un serial, proporcionando un historial completo auditable.

### Nueva Tabla: `serial_tracking_events`

```sql
CREATE TABLE IF NOT EXISTS public.serial_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number_id integer NOT NULL REFERENCES public.serial_numbers(id) ON DELETE CASCADE,
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Tipo de evento
  event_type text NOT NULL,
  -- Valores: 'received', 'stock_in', 'reserved', 'sold', 'returned', 
  --          'transferred', 'damaged', 'rma_created', 'warranty_claim',
  --          'warranty_resolved', 'status_change'
  
  -- Datos del evento
  from_branch_id integer REFERENCES public.branches(id) ON DELETE SET NULL,
  to_branch_id integer REFERENCES public.branches(id) ON DELETE SET NULL,
  from_status text,
  to_status text,
  
  -- Referencias al documento que genero el evento
  source_table text,
  source_id text,
  
  -- Referencias especificas (se llenan segun el tipo de evento)
  purchase_order_id integer REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  purchase_invoice_id uuid REFERENCES public.invoice_purchase(id) ON DELETE SET NULL,
  sale_id uuid,
  web_order_id uuid,
  invoice_sale_id uuid,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  
  -- Quien y cuando
  performed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_date timestamptz NOT NULL DEFAULT now(),
  
  -- Informacion adicional
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_ste_serial ON public.serial_tracking_events(serial_number_id);
CREATE INDEX IF NOT EXISTS idx_ste_organization ON public.serial_tracking_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_ste_event_type ON public.serial_tracking_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ste_event_date ON public.serial_tracking_events(event_date);
CREATE INDEX IF NOT EXISTS idx_ste_source ON public.serial_tracking_events(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_ste_customer ON public.serial_tracking_events(customer_id);

-- RLS
ALTER TABLE public.serial_tracking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY serial_tracking_events_select_policy ON public.serial_tracking_events
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY serial_tracking_events_insert_update_delete_policy ON public.serial_tracking_events
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );
```

### Tipos de Evento y su mapeo

| Evento | Trigger | source_table | Datos que registra |
|--------|---------|--------------|-------------------|
| `received` | Recepcion de OC | `purchase_orders` | PO, proveedor, sucursal destino, costo |
| `stock_in` | Factura de compra registrada | `invoice_purchase` | Factura, proveedor, costo |
| `reserved` | Pedido web creado | `web_orders` | Pedido, sucursal |
| `sold` | Venta POS/Web/Factura/Mesa | `sales` / `web_orders` / `invoice_sales` | Cliente, vendedor, canal, precio |
| `returned` | Devolucion de cliente | `sales` | Cliente, motivo |
| `transferred` | Transferencia entre sucursales | `inventory_transfers` | Sucursal origen, destino |
| `damaged` | Marcado como danado | manual | Notas, sucursal |
| `rma_created` | Solicitud RMA a proveedor | `rma_requests` | Proveedor, motivo |
| `warranty_claim` | Reclamo de garantia | `warranty_claims` | Cliente, descripcion |
| `warranty_resolved` | Resolucion de garantia | `warranty_claims` | Resultado, notas |

---

## Fase 3: Integracion con Ordenes de Compra

### Objetivo
Al recibir una orden de compra, permitir registrar los seriales de los productos recibidos.

### Cambios en `purchase_order_items`

```sql
-- Agregar columna para indicar si el item requiere seriales
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS requires_serial boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS serials_received text[] DEFAULT '{}';
```

### Flujo de Recepcion con Seriales

```
1. Usuario crea Orden de Compra
   ├── Selecciona proveedor, sucursal, productos
   ├── Marca items que requieren serial (requires_serial = true)
   └── Guarda OC en estado 'draft' o 'sent'

2. Usuario recibe Orden de Compra
   ├── Por cada item con requires_serial = true:
   │   ├── Sistema pide ingresar seriales (uno por unidad)
   │   ├── Valida que no existan seriales duplicados
   │   ├── Crea registros en serial_numbers con:
   │   │   ├── product_id, organization_id, branch_id
   │   │   ├── supplier_id (de la OC)
   │   │   ├── purchase_order_id (id de la OC)
   │   │   ├── status = 'in_stock'
   │   │   ├── received_date = now()
   │   │   └── cost_at_purchase = unit_cost del item
   │   ├── Crea evento en serial_tracking_events:
   │   │   ├── event_type = 'received'
   │   │   ├── source_table = 'purchase_orders'
   │   │   ├── source_id = OC id
   │   │   ├── to_branch_id = branch de la OC
   │   │   └── to_status = 'in_stock'
   │   └── Actualiza serials_received en purchase_order_items
   └── Items sin requires_serial: flujo normal de stock

3. Sistema actualiza stock_levels
   ├── Incrementa qty_on_hand (flujo existente)
   └── Los seriales quedan vinculados a la OC
```

### Modificacion del `purchaseOrderService`

```typescript
// Nuevo metodo en purchaseOrderService.ts
async receivePurchaseOrderWithSerials(
  orderUuid: string,
  organizationId: number,
  receivedItems: Array<{
    itemId: number;
    productId: number;
    quantity: number;
    unitCost: number;
    serials?: string[]; // Lista de seriales si requires_serial = true
  }>,
  branchId: number,
  userId?: string
): Promise<{ success: boolean; error: Error | null }>
```

### Componentes Frontend a Modificar

- `src/components/inventario/ordenes-compra/` - Agregar seccion de captura de seriales al recibir
- `src/lib/services/purchaseOrderService.ts` - Nuevo metodo `receivePurchaseOrderWithSerials`
- `src/lib/services/stockMovementService.ts` - `incrementOnPurchase` debe crear seriales si se proporcionan

---

## Fase 4: Integracion con Facturas de Compra

### Objetivo
Al registrar una factura de compra, permitir vincular seriales a la factura y al proveedor.

### Cambios en `invoice_items`

```sql
-- Agregar columna para seriales asociados a la linea de factura
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS serial_numbers text[] DEFAULT '{}';
```

### Flujo de Factura de Compra con Seriales

```
1. Usuario crea Factura de Compra
   ├── Selecciona proveedor, sucursal
   ├── Agrega productos con cantidades y precios
   ├── Por cada producto que requiere serial:
   │   ├── Sistema pide ingresar seriales
   │   ├── Si la factura viene de una OC, pre-carga seriales ya recibidos
   │   └── Si no viene de OC, crea seriales nuevos
   └── Guarda factura

2. Sistema vincula seriales con la factura
   ├── Actualiza serial_numbers:
   │   ├── purchase_invoice_id = factura.id
   │   ├── supplier_id = factura.supplier_id
   │   ├── branch_id = factura.branch_id
   │   ├── cost_at_purchase = precio unitario
   │   └── received_date = issue_date de la factura
   └── Crea evento en serial_tracking_events:
       ├── event_type = 'stock_in'
       ├── source_table = 'invoice_purchase'
       └── source_id = factura.id

3. Sistema actualiza cuentas_por_pagar
   └── Flujo existente en finanzas
```

### Componentes Frontend a Modificar

- `src/components/finanzas/facturas-compra/nueva-factura/` - Agregar captura de seriales
- `src/components/finanzas/facturas-compra/id/` - Mostrar seriales vinculados
- `src/lib/services/facturaCompraService.ts` - Manejar seriales al crear factura

---

## Fase 5: Integracion con Ventas (POS, Web, Facturas, Mesas)

### Objetivo
Al realizar una venta por cualquier canal, descontar seriales del inventario y registrar la venta en el historial del serial.

### 5.1: Venta por POS (`sales` + `sale_items`)

```
Flujo:
1. Cajero agrega productos al carrito POS
2. Si producto requiere serial:
   ├── Sistema pide seleccionar serial(es) disponibles en la sucursal
   ├── Valida que el serial este 'in_stock' en la sucursal actual
   └── Asocia serial al sale_item
3. Al confirmar venta:
   ├── Por cada serial vendido:
   │   ├── Actualiza serial_numbers:
   │   │   ├── status = 'sold'
   │   │   ├── sale_id = sale.id
   │   │   ├── sold_to_customer_id = customer_id (si hay)
   │   │   ├── sold_by_user_id = user_id
   │   │   ├── sale_channel = 'pos'
   │   │   ├── sale_date = now()
   │   │   ├── price_at_sale = unit_price
   │   │   └── current_branch_id = branch_id
   │   └── Crea evento en serial_tracking_events:
   │       ├── event_type = 'sold'
   │       ├── source_table = 'sales'
   │       ├── source_id = sale.id
   │       ├── customer_id = customer_id
   │       └── performed_by = user_id
   └── Descuenta stock (flujo existente)
```

### 5.2: Venta por Web (`web_orders` + `web_order_items`)

```
Flujo:
1. Cliente agrega productos al carrito web
2. Si producto requiere serial:
   ├── Sistema reserva el serial automaticamente
   │   ├── status = 'reserved'
   │   └── web_order_id = web_order.id
   └── Crea evento 'reserved'
3. Al confirmar el pedido y pagar:
   ├── Actualiza serial_numbers:
   │   ├── status = 'sold'
   │   ├── sale_channel = 'web'
   │   ├── sold_to_customer_id = customer_id
   │   ├── sale_date = now()
   │   └── price_at_sale = unit_price
   └── Crea evento 'sold' con source_table = 'web_orders'
```

### 5.3: Venta por Factura de Venta (`invoice_sales` + `invoice_items`)

```
Flujo:
1. Usuario crea factura de venta
2. Si producto requiere serial:
   ├── Sistema pide seleccionar serial disponible
   └── Asocia serial al invoice_item
3. Al emitir factura:
   ├── Actualiza serial_numbers:
   │   ├── status = 'sold'
   │   ├── invoice_sale_id = invoice.id
   │   ├── sale_channel = 'invoice'
   │   ├── sold_to_customer_id = customer_id
   │   ├── sold_by_user_id = created_by
   │   └── sale_date = issue_date
   └── Crea evento 'sold' con source_table = 'invoice_sales'
```

### 5.4: Venta por Mesa (`sales` con `table_session_id`)

```
Flujo:
1. Mesero agrega productos a la mesa
2. Si producto requiere serial:
   ├── Al cobrar la mesa, sistema pide seleccionar serial
   └── Igual que POS pero con sale_channel = 'table'
3. Al cerrar mesa:
   ├── Actualiza serial_numbers:
   │   ├── status = 'sold'
   │   ├── sale_channel = 'table'
   │   ├── sale_id = sale.id
   │   └── table_session_id referenciado en sale
   └── Crea evento 'sold' con metadata.table_session_id
```

### Cambios en Tablas de Ventas

```sql
-- Agregar columna de seriales a sale_items
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS serial_ids integer[] DEFAULT '{}';

-- Agregar columna de seriales a web_order_items
ALTER TABLE public.web_order_items
  ADD COLUMN IF NOT EXISTS serial_ids integer[] DEFAULT '{}';

-- Agregar columna de seriales a invoice_items (para factura venta)
-- invoice_items ya tiene serial_numbers text[] agregado en Fase 4
-- Pero para venta usaremos serial_ids integer[] para FK
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS serial_ids integer[] DEFAULT '{}';
```

### Modificacion del `stockMovementService`

```typescript
// Nuevo metodo para descontar seriales al vender
async decrementSerialsOnSale(
  organizationId: number,
  branchId: number,
  saleId: string,
  items: Array<{
    product_id: number;
    serial_ids?: number[];
  }>,
  saleChannel: 'pos' | 'web' | 'invoice' | 'table',
  customerId?: string,
  userId?: string
): Promise<{ success: boolean; errors: string[] }>
```

### Componentes Frontend a Modificar

- `src/app/app/pos/ventas/` - Seleccion de serial al agregar producto con serial
- `src/app/app/pos/pedidos-online/` - Reserva automatica de serial
- `src/app/api/facturas-venta/` - Asociacion de serial al emitir factura
- `src/app/app/pos/mesas/` - Seleccion de serial al cobrar mesa
- `src/lib/services/stockMovementService.ts` - Nuevo metodo `decrementSerialsOnSale`

---

## Fase 6: Servicio de Trazabilidad

### Objetivo
Crear un servicio centralizado que maneje toda la logica de seriales y trazabilidad.

### Nuevo Archivo: `src/lib/services/serialTrackingService.ts`

```typescript
// Estructura del servicio

interface SerialNumber {
  id: number;
  product_id: number;
  organization_id: number;
  branch_id: number | null;
  serial: string;
  status: 'in_stock' | 'reserved' | 'sold' | 'returned' | 'in_transit' | 'damaged' | 'rma' | 'warranty_claim';
  // Trazabilidad origen
  supplier_id: number | null;
  purchase_order_id: number | null;
  purchase_invoice_id: string | null;
  lot_id: number | null;
  // Trazabilidad venta
  sold_to_customer_id: string | null;
  sold_by_user_id: string | null;
  sale_channel: string;
  sale_date: string | null;
  sale_id: string | null;
  web_order_id: string | null;
  invoice_sale_id: string | null;
  // Garantia
  warranty_start: string | null;
  warranty_end: string | null;
  warranty_months: number | null;
  // Costos
  cost_at_purchase: number;
  price_at_sale: number | null;
  // Ubicacion
  current_branch_id: number | null;
  received_date: string | null;
  notes: string | null;
}

interface SerialTrackingEvent {
  id: string;
  serial_number_id: number;
  event_type: string;
  from_branch_id: number | null;
  to_branch_id: number | null;
  from_status: string;
  to_status: string;
  source_table: string;
  source_id: string;
  customer_id: string | null;
  performed_by: string | null;
  event_date: string;
  notes: string | null;
  metadata: Record<string, any>;
}

interface SerialWithDetails extends SerialNumber {
  product?: { id: number; sku: string; name: string; brand?: string };
  supplier?: { id: number; name: string };
  branch?: { id: number; name: string };
  current_branch?: { id: number; name: string };
  customer?: { id: string; first_name: string; last_name: string; email: string; phone: string };
  sold_by_user?: { id: string; email: string };
  events?: SerialTrackingEvent[];
}

class SerialTrackingService {
  // === Creacion de Seriales ===
  async createSerials(data): Promise<SerialNumber[]>
  async createSerial(data): Promise<SerialNumber>

  // === Consulta de Seriales ===
  async getSerials(organizationId: number, filters?): Promise<SerialNumber[]>
  async getSerialByNumber(serial: string, organizationId: number): Promise<SerialWithDetails | null>
  async getSerialById(id: number): Promise<SerialWithDetails | null>
  async getSerialsByProduct(productId: number, branchId?: number): Promise<SerialNumber[]>
  async getSerialsByPurchaseOrder(poId: number): Promise<SerialNumber[]>
  async getSerialsByPurchaseInvoice(invoiceId: string): Promise<SerialNumber[]>
  async getSerialsByCustomer(customerId: string): Promise<SerialNumber[]>

  // === Historial / Trazabilidad ===
  async getSerialHistory(serialId: number): Promise<SerialTrackingEvent[]>
  async getFullTraceability(serial: string, organizationId: number): Promise<SerialWithDetails>

  // === Cambios de Estado ===
  async updateStatus(serialId: number, newStatus: string, eventData?): Promise<void>
  async transferSerial(serialId: number, toBranchId: number, userId: string): Promise<void>
  async markAsDamaged(serialId: number, notes: string, userId: string): Promise<void>
  async returnSerial(serialId: number, reason: string, userId: string): Promise<void>

  // === Ventas ===
  async sellSerials(serialIds: number[], saleData): Promise<void>
  async reserveSerials(serialIds: number[], webOrderId: string): Promise<void>
  async releaseReservedSerials(webOrderId: string): Promise<void>

  // === Garantia ===
  async getWarrantyInfo(serial: string): Promise<{ valid: boolean; endDate: string; daysLeft: number }>
  async createWarrantyClaim(serialId: number, claimData): Promise<void>
  async resolveWarrantyClaim(serialId: number, resolution: string): Promise<void>

  // === Generacion Masiva ===
  async generateSerialsFromPattern(
    productId: number,
    organizationId: number,
    pattern: string,
    quantity: number,
    branchId?: number,
    warrantyMonths?: number | null,
    costAtPurchase?: number
  ): Promise<{ data: SerialNumber[]; errors: string[] }>

  // === Validaciones ===
  async validateSerialExists(serial: string, organizationId: number): Promise<boolean>
  async validateSerialAvailable(serialId: number, branchId: number): Promise<boolean>
  async validateSerialForWarranty(serial: string, organizationId: number): Promise<boolean>
}

export const serialTrackingService = new SerialTrackingService();
```

### Variables de Patron de Serial

El metodo `generateSerialsFromPattern` soporta las siguientes variables:

| Variable | Descripcion | Ejemplo |
|----------|-------------|---------|
| `{PROD}` | SKU del producto | `PROD-001` |
| `{YYYY}` | Anio completo (4 digitos) | `2026` |
| `{YY}` | Anio corto (2 digitos) | `26` |
| `{MM}` | Mes (2 digitos) | `08` |
| `{DD}` | Dia (2 digitos) | `12` |
| `{SEQ}` | Consecutivo con 6 digitos | `000001` |
| `{####}` | Consecutivo con 4 digitos | `0001` |
| `{###}` | Consecutivo con 3 digitos | `001` |
| `{##}` | Consecutivo con 2 digitos | `01` |

El consecutivo se calcula automaticamente sumando los seriales existentes del producto, evitando duplicados.

---

## Fase 7: Interfaz de Usuario - Inventario

### Objetivo
Crear paginas y componentes para gestionar seriales desde el modulo de inventario.

### Nuevas Paginas

#### 7.1: `/app/inventario/seriales` - Lista de Seriales

```
Componentes:
├── SerialesHeader.tsx
│   ├── Titulo + boton "Nuevo Serial"
│   └── Boton "Importar Seriales" (CSV)
├── SerialesStats.tsx
│   ├── Total seriales
│   ├── En stock
│   ├── Vendidos
│   ├── En garantia
│   └── Danados
├── SerialesFilters.tsx
│   ├── Busqueda por serial
│   ├── Filtro por producto
│   ├── Filtro por estado
│   ├── Filtro por sucursal
│   ├── Filtro por proveedor
│   └── Filtro por rango de fecha de recepcion
└── SerialesTable.tsx
    ├── Serial
    ├── Producto (SKU + nombre)
    ├── Estado (badge con color)
    ├── Sucursal actual
    ├── Proveedor
    ├── Canal de venta
    ├── Cliente (si vendido)
    ├── Fecha venta
    └── Acciones (ver detalle, editar, cambiar estado)
```

#### 7.2: `/app/inventario/seriales/[id]` - Detalle de Serial

```
Componentes:
├── SerialDetailHeader.tsx
│   ├── Numero de serial (grande)
│   ├── Estado actual (badge)
│   ├── Producto
│   └── Botones de accion (transferir, marcar danado, etc.)
├── SerialInfoCard.tsx
│   ├── Informacion del producto
│   ├── Marca, referencia, SKU
│   └── Imagen del producto
├── SerialOriginCard.tsx
│   ├── Proveedor
│   ├── Orden de compra (link)
│   ├── Factura de compra (link)
│   ├── Lote (si aplica)
│   ├── Costo de compra
│   ├── Sucursal de recepcion
│   └── Fecha de recepcion
├── SerialSaleCard.tsx
│   ├── Canal de venta (POS/Web/Factura/Mesa)
│   ├── Cliente (link a CRM)
│   ├── Vendedor
│   ├── Sucursal de venta
│   ├── Precio de venta
│   ├── Fecha de venta
│   ├── Venta/Factura (link)
│   └── Mesa (si aplica)
├── SerialWarrantyCard.tsx
│   ├── Estado de garantia (vigente/vencida)
│   ├── Fecha inicio garantia
│   ├── Fecha fin garantia
│   ├── Dias restantes
│   └── Boton "Iniciar Reclamo"
├── SerialTimeline.tsx (usa componentes de timeline existentes)
│   └── Lista cronologica de todos los eventos
└── SerialActions.tsx
    ├── Transferir a otra sucursal
    ├── Marcar como danado
    ├── Enviar a RMA
    ├── Iniciar reclamo de garantia
    └── Cambiar estado manual
```

#### 7.3: Captura de Seriales al Recibir OC

Modificacion en `src/components/inventario/ordenes-compra/`:

```
Nuevo componente: RecepcionSerialDialog.tsx
├── Dialog que se abre al recibir items con requires_serial
├── Por cada unidad del item:
│   ├── Input para ingresar serial
│   ├── Validacion en tiempo real (no duplicados)
│   ├── Scanner de codigo de barras (opcional)
│   └── Auto-generar serial si el producto lo permite
├── Lista de seriales ingresados
├── Boton "Validar todos"
└── Boton "Confirmar recepcion"
```

### Modificacion en Ordenes de Compra Existente

- `src/components/inventario/ordenes-compra/` - Agregar columna "Requiere Serial" en items
- `src/app/app/inventario/ordenes-compra/[uuid]/page.tsx` - Agregar seccion de seriales recibidos
- `src/app/app/inventario/ordenes-compra/nuevo/page.tsx` - Checkbox "Requiere Serial" por item

---

## Fase 8: Interfaz de Usuario - Productos

### Objetivo
Agregar configuracion de seriales en el maestro de productos.

### Cambios en Tabla `products`

```sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_serial boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS serial_pattern text,
  ADD COLUMN IF NOT EXISTS auto_generate_serial boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS warranty_months integer;
```

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `track_serial` | boolean | Si el producto requiere tracking individual por serial |
| `serial_pattern` | text | Patron para auto-generar seriales (ej: `{BRAND}-{SKU}-{SEQ}`) |
| `auto_generate_serial` | boolean | Si el sistema auto-genera seriales al recibir |
| `warranty_months` | integer | Meses de garantia por defecto (null = sin garantia) |

### Modificacion en Formulario de Producto ✅ IMPLEMENTADO

Se implemento la configuracion de trazabilidad en el formulario de creacion de productos:

#### Archivos Modificados

- `src/components/inventario/productos/nuevo/InformacionBasica.tsx` — Auto-generacion de SKU y barcode (EAN-13 con checksum)
- `src/components/inventario/productos/nuevo/TrazabilidadSeccion.tsx` — Seccion completa de trazabilidad con:
  - Switch "Requiere numero de serial" (`track_serial`)
  - Switch "Auto-generar seriales" (`auto_generate_serial`)
  - Input "Meses de garantia" (`warranty_months`)
  - Constructor visual de patron de serial (`serial_pattern`) con:
    - Badges clickeables para variables: `{PROD}`, `{YYYY}`, `{YY}`, `{MM}`, `{DD}`, `{SEQ}`, `{####}`, `{###}`, `{##}`
    - Input para texto literal
    - Preview del patron en tiempo real
    - Capacidad de eliminar partes del patron individualmente
- `src/components/inventario/productos/nuevo/NuevoProductoForm.tsx` — Guarda campos de trazabilidad en `products` al crear
- `src/components/inventario/productos/id/tabs/DetallesTab.tsx` — Edicion de campos de trazabilidad en producto existente

#### Campos Guardados en `products`

| Campo | Tipo | Componente |
|-------|------|------------|
| `track_serial` | boolean | TrazabilidadSeccion |
| `auto_generate_serial` | boolean | TrazabilidadSeccion |
| `serial_pattern` | text | TrazabilidadSeccion |
| `warranty_months` | integer | TrazabilidadSeccion |

### Vista de Producto ✅ IMPLEMENTADO

- `src/components/inventario/productos/id/tabs/SerialesTab.tsx` - Pestana "Seriales" con:
  - Lista de seriales del producto con tabla (serial, estado, garantia, costo, precio, fecha recepcion)
  - Filtros por busqueda de texto y estado
  - Stats: total, en stock, reservados, vendidos
  - Exportacion a CSV
  - Badges de configuracion (trazabilidad activa, auto-generacion, meses garantia, patron)
  - **Generacion masiva de seriales** (ver seccion siguiente)

### Generacion Masiva de Seriales ✅ IMPLEMENTADO

Se agrego un boton "Generar seriales" en `SerialesTab.tsx` que abre un dialogo para generar seriales masivamente:

#### Caracteristicas

- **Visible solo si** el producto tiene `auto_generate_serial = true` y `serial_pattern` configurado
- **Dialogo con:**
  - Input de cantidad a generar (1-1000)
  - Selector de sucursal destino (opcional)
  - Informacion de stock actual vs seriales generados
  - Boton rapido "Generar los N seriales faltantes" (calcula stock - seriales existentes)
  - Info de garantia automatica segun `warranty_months` del producto
- **Genera seriales** usando `serialTrackingService.generateSerialsFromPattern()` con:
  - Patron del producto
  - Consecutivo automatico (basado en seriales existentes)
  - Garantia desde la fecha de generacion
  - Costo del producto como `cost_at_purchase`
- **Muestra toast** de exito o error parcial
- **Refresca** la lista de seriales despues de generar

#### Comparador Stock vs Seriales

Muestra una barra informativa con:
- Stock total (suma de `qty_on_hand` de `stock_levels`)
- Seriales generados (count de `serial_numbers`)
- Badge amarillo "N sin serial" si stock > seriales

### Debug de Guardado de Proveedor

Se agrego logging de debug en `NuevoProductoForm.tsx` para diagnosticar el problema donde `supplier_id` no se guarda al crear productos:

- `console.log` del valor de `supplier_id` y `cost` antes del insert
- Try/catch propio en el insert de `product_suppliers` para que no falle toda la creacion
- Toast de advertencia si el proveedor no se guarda, mostrando el error especifico
- Fallback `cost || 0` para evitar enviar `undefined`

---

## Fase 9: Reclamos de Garantia

### Objetivo
Sistema completo de gestion de reclamos de garantia basado en seriales.

### Nueva Tabla: `warranty_claims`

```sql
CREATE TABLE IF NOT EXISTS public.warranty_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  serial_number_id integer NOT NULL REFERENCES public.serial_numbers(id) ON DELETE CASCADE,
  
  -- Cliente que reclama
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  
  -- Detalles del reclamo
  claim_date timestamptz NOT NULL DEFAULT now(),
  claim_reason text NOT NULL,
  description text,
  
  -- Estado del reclamo
  status text NOT NULL DEFAULT 'pending',
  -- Valores: 'pending', 'approved', 'rejected', 'in_process', 'resolved', 'cancelled'
  
  -- Resolucion
  resolution text,
  resolution_date timestamptz,
  resolved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- Tipo de resolucion
  resolution_type text,
  -- Valores: 'repair', 'replacement', 'refund', 'store_credit', 'rejected'
  
  -- Referencias
  replacement_serial_id integer REFERENCES public.serial_numbers(id) ON DELETE SET NULL,
  refund_amount numeric,
  
  -- Proveedor (para RMA con proveedor)
  supplier_rma_number text,
  supplier_response text,
  
  -- Auditoria
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Adjuntos
  attachments jsonb DEFAULT '[]'::jsonb
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_wc_organization ON public.warranty_claims(organization_id);
CREATE INDEX IF NOT EXISTS idx_wc_serial ON public.warranty_claims(serial_number_id);
CREATE INDEX IF NOT EXISTS idx_wc_customer ON public.warranty_claims(customer_id);
CREATE INDEX IF NOT EXISTS idx_wc_status ON public.warranty_claims(status);
CREATE INDEX IF NOT EXISTS idx_wc_claim_date ON public.warranty_claims(claim_date);

-- RLS
ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY warranty_claims_select_policy ON public.warranty_claims
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY warranty_claims_insert_update_delete_policy ON public.warranty_claims
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );
```

### Nueva Pagina: `/app/inventario/garantias`

```
Componentes:
├── GarantiasHeader.tsx
├── GarantiasStats.tsx
│   ├── Pendientes
│   ├── Aprobadas
│   ├── Rechazadas
│   ├── Resueltas
│   └── Monto total en reclamos
├── GarantiasFilters.tsx
│   ├── Busqueda por serial o cliente
│   ├── Filtro por estado
│   ├── Filtro por tipo de resolucion
│   └── Filtro por rango de fecha
└── GarantiasTable.tsx
    ├── Numero de reclamo
    ├── Serial
    ├── Producto
    ├── Cliente
    ├── Fecha reclamo
    ├── Estado (badge)
    ├── Tipo resolucion
    └── Acciones (ver detalle, aprobar, rechazar)
```

### Detalle de Garantia: `/app/inventario/garantias/[id]`

```
Componentes:
├── GarantiaDetailHeader.tsx
├── GarantiaProductInfo.tsx
│   ├── Producto, serial, marca
│   ├── Fecha de compra
│   ├── Sucursal de compra
│   └── Estado de garantia (vigente/vencida)
├── GarantiaCustomerInfo.tsx
│   ├── Datos del cliente
│   ├── Contacto
│   └── Historial de compras
├── GarantiaClaimInfo.tsx
│   ├── Motivo del reclamo
│   ├── Descripcion
│   ├── Fecha
│   └── Adjuntos (fotos, videos)
├── GarantiaResolution.tsx
│   ├── Tipo de resolucion (reparar, reemplazar, reembolso, credito)
│   ├── Si reemplazo: seleccionar nuevo serial
│   ├── Si reembolso: monto
│   ├── Notas de resolucion
│   └── Botones: Aprobar, Rechazar, Enviar a proveedor (RMA)
└── GarantiaTimeline.tsx
    └── Historial del reclamo
```

---

## Fase 10: Reportes y Dashboard ✅ COMPLETADO

### Objetivo
Agregar reportes de trazabilidad al modulo de reportes general del sistema.

### Implementacion

Se crearon 4 reportes integrados en el catalogo del modulo de reportes (`/app/reportes`), bajo el modulo `inventory`. Los reportes aparecen automaticamente cuando el modulo de inventario esta activo.

### Archivo Creado

- `src/lib/services/reportes/modulos/serialTrackingReports.ts` — 4 definiciones de reporte

### Registro en Catalogo

- `src/lib/services/reportes/reportesCatalogo.ts` — Import y registro en `inventory: [...inventarioReports, ...serialTrackingReports]`

### Nuevos Reportes

#### 10.1: Reporte de Trazabilidad por Producto (`trazabilidad-producto`)
- **KPIs:** Total Seriales, En Stock, Vendidos, Costo Total
- **Columnas:** Serial, Producto, SKU, Marca, Proveedor, Estado, Ubicacion Actual, Costo, Fecha Recepcion, Fin Garantia
- **Filtro:** Rango de fecha (fecha de creacion del serial)
- **Limite:** 500 registros

#### 10.2: Reporte de Ventas por Serial (`ventas-serial`)
- **KPIs:** Seriales Vendidos, Ingresos Total, Ventas POS, Ventas Web
- **Columnas:** Serial, Producto, SKU, Cliente, Vendedor, Canal, Precio Venta, Fecha Venta
- **Filtro:** Rango de fecha (fecha de venta)
- **Limite:** 500 registros

#### 10.3: Reporte de Garantias (`garantias-reporte`)
- **KPIs:** Total Reclamos, Pendientes, Resueltos, Monto Reembolsos, Tiempo Prom. (dias)
- **Columnas:** Reclamo, Serial, Producto, Cliente, Fecha Reclamo, Estado, Resolucion, Monto, RMA Proveedor, Dias Resolucion
- **Filtro:** Rango de fecha (fecha de reclamo)
- **Calculo:** Tiempo promedio de resolucion en dias

#### 10.4: Reporte de Seriales por Proveedor (`seriales-proveedor`)
- **KPIs:** Proveedores, Total Seriales, Costo Total, Vendidos, Devueltos
- **Columnas:** Proveedor, Seriales Comprados, Costo Total, Vendidos, Devueltos, En Stock, Danados
- **Filtro:** Rango de fecha (fecha de creacion del serial)
- **Agrupacion:** Por proveedor
- **Limite:** 1000 registros

### KPIs en Dashboard de Inventario (via Reportes)

Los KPIs del plan original se muestran dentro de cada reporte:
- Total seriales en stock → KPI del reporte `trazabilidad-producto`
- Total seriales vendidos → KPI del reporte `ventas-serial`
- Reclamos de garantia pendientes → KPI del reporte `garantias-reporte`
- Valor de seriales en stock → KPI del reporte `trazabilidad-producto` (Costo Total)

---

## Fase 11: Seguridad y RLS ✅ COMPLETADO

### Objetivo
Asegurar todas las tablas nuevas y existentes con politicas RLS correctas.

### Migraciones Aplicadas

#### 11.1: RLS en `serial_numbers` — Filtro directo por `organization_id`

**Migracion:** `phase11_rls_serial_numbers`

Antes las politicas filtraban indirectamente via `product_id → products → organization_members`. Ahora filtran directamente por `organization_id` con `is_active = true`:

- `serial_numbers_select_policy` — SELECT
- `serial_numbers_insert_policy` — INSERT (WITH CHECK)
- `serial_numbers_update_policy` — UPDATE (USING + WITH CHECK)
- `serial_numbers_delete_policy` — DELETE

#### 11.2: Eliminar politicas anónimas en `stock_levels`

**Migracion:** `phase11_rls_stock_levels_remove_anon`

Eliminadas:
- `Allow anon select stock_levels` — Permitia SELECT a cualquier usuario
- `Allow anon update stock_levels` — Permitia UPDATE a cualquier usuario

Las politicas restantes (`stock_levels_select_policy`, `stock_levels_insert_update_delete_policy`) ya filtran correctamente por `organization_members`.

#### 11.3: Habilitar RLS en `stock_levels_dedup_backup_20260811`

**Migracion:** `phase11_rls_backup_table`

- RLS habilitado
- Creada politica `stock_levels_backup_select_policy` (SELECT filtrando via `product_id → products → organization_members`)
- Tabla tiene 4,607 registros de backup

### RLS en Tablas Nuevas (Verificado)

- `serial_tracking_events` — ✅ Filtra por `organization_id` (Fase 2)
- `warranty_claims` — ✅ Filtra por `organization_id` (Fase 9)

### Verificacion con Security Advisors

Ejecutado `get_advisors` post-migracion. No se reportaron advertencias de RLS para las tablas modificadas. Los advisors muestran problemas preexistentes no relacionados con esta fase.

---

## Resumen de Archivos a Crear/Modificar

### Archivos Nuevos

| Archivo | Modulo | Descripcion |
|---------|--------|-------------|
| `src/lib/services/serialTrackingService.ts` | Lib | Servicio central de seriales |
| `src/lib/services/warrantyService.ts` | Lib | Servicio de reclamos de garantia |
| `src/app/app/inventario/seriales/page.tsx` | Inventario | Lista de seriales |
| `src/app/app/inventario/seriales/[id]/page.tsx` | Inventario | Detalle de serial |
| `src/components/inventario/seriales/` | Inventario | Componentes de seriales |
| `src/app/app/inventario/garantias/page.tsx` | Inventario | Lista de garantias |
| `src/app/app/inventario/garantias/[id]/page.tsx` | Inventario | Detalle de garantia |
| `src/components/inventario/garantias/` | Inventario | Componentes de garantias |
| `src/components/inventario/ordenes-compra/RecepcionSerialDialog.tsx` | Inventario | Dialog de captura de seriales |

### Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/lib/services/purchaseOrderService.ts` | Metodo `receivePurchaseOrderWithSerials` |
| `src/lib/services/stockMovementService.ts` | Metodo `decrementSerialsOnSale` |
| `src/lib/services/productService.ts` | Campos `track_serial`, `warranty_months` |
| `src/app/app/inventario/productos/nuevo/page.tsx` | Seccion trazabilidad |
| `src/app/app/inventario/productos/[id]/page.tsx` | Pestana seriales |
| `src/components/inventario/ordenes-compra/` | Columna requiere serial |
| `src/components/finanzas/facturas-compra/nueva-factura/` | Captura de seriales |
| `src/components/finanzas/facturas-compra/id/` | Mostrar seriales |
| `src/app/app/pos/ventas/` | Seleccion de serial |
| `src/app/app/pos/pedidos-online/` | Reserva automatica |
| `src/app/app/pos/mesas/` | Seleccion de serial al cobrar |
| `src/app/api/facturas-venta/` | Asociacion de serial |
| `src/app/app/inventario/page.tsx` | KPIs de seriales en dashboard |

---

## Orden de Implementacion Recomendado

```
Fase 1 (DB)  ──→  Fase 2 (DB)  ──→  Fase 8 (DB + UI Productos)
                                            │
                                            ▼
Fase 3 (DB + UI OC)  ──→  Fase 4 (DB + UI Facturas)
                                            │
                                            ▼
Fase 5 (DB + UI Ventas)  ──→  Fase 6 (Servicio)
                                            │
                                            ▼
Fase 7 (UI Inventario)  ──→  Fase 9 (Garantias)
                                            │
                                            ▼
Fase 10 (Reportes)  ──→  Fase 11 (Seguridad)
```

### Estimacion por Fase

| Fase | Duracion Estimada | Dependencias |
|------|-------------------|--------------|
| Fase 1 | 1-2 dias | Ninguna |
| Fase 2 | 1 dia | Fase 1 |
| Fase 3 | 2-3 dias | Fase 1, Fase 2 |
| Fase 4 | 2 dias | Fase 3 |
| Fase 5 | 3-4 dias | Fase 6 |
| Fase 6 | 2 dias | Fase 1, Fase 2 |
| Fase 7 | 3-4 dias | Fase 6 |
| Fase 8 | 1-2 dias | Fase 1 |
| Fase 9 | 3 dias | Fase 6, Fase 7 |
| Fase 10 | 2 dias | Fase 7, Fase 9 |
| Fase 11 | 1 dia | Todas |

**Total estimado: 20-25 dias laborales**

---

## Diagrama de Flujo Completo

```
                    PROVEEDOR
                        │
                        ▼
              ORDEN DE COMPRA
              (purchase_orders)
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
     RECEPCION OC              FACTURA COMPRA
     (stock + seriales)       (invoice_purchase)
            │                       │
            ▼                       ▼
     SERIAL NUMBERS          SERIAL NUMBERS
     status = in_stock       status = in_stock
     + tracking_event        + tracking_event
            │                       │
            └───────┬───────────────┘
                    ▼
              STOCK LEVELS
              (qty_on_hand)
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
     POS VENTA   WEB PEDIDO  FACTURA VENTA
     (sales)     (web_orders) (invoice_sales)
        │           │           │
        ▼           ▼           ▼
     SERIAL      SERIAL      SERIAL
     status=sold status=sold status=sold
     channel=pos channel=web channel=invoice
        │           │           │
        └───────┬───┴───────────┘
                ▼
          CLIENTE
          (customers)
                │
                ▼
         RECLAMO GARANTIA?
         (warranty_claims)
                │
        ┌───────┴───────┐
        ▼               ▼
     APROBADO        RECHAZADO
     (repair/        (cerrar
      replace/       reclamo)
      refund)
```

---

## Consideraciones Tecnicas

### Performance
- Indices en todas las columnas de busqueda frecuente (serial, product_id, status, branch_id)
- Para listados grandes, usar paginacion con `limit` y `offset`
- Considerar particion por `organization_id` si el volumen crece

### Concurrencia
- Usar optimistic locking en cambios de estado de serial
- Validar `status = 'in_stock'` antes de vender (atomicidad)
- Usar transacciones para operaciones multi-tabla

### Integracion con Timeline Existente
- Los `serial_tracking_events` pueden disparar eventos en el timeline general
- Considerar un trigger que inserte en `domain_events` cuando se crea un `serial_tracking_event`

### Scanner de Codigo de Barras
- Los inputs de serial deben soportar scanner USB (que envia texto + Enter)
- Considerar usar `onKeyDown` para detectar el Enter del scanner

### Exportacion
- Exportar lista de seriales a CSV/Excel
- Exportar historial de un serial a PDF (para reclamos de garantia)

---

## Fase 12: Devoluciones con Seriales y Garantias Automaticas ✅ COMPLETADO

### Objetivo
Integrar manejo de seriales en el flujo de devoluciones del POS, incluyendo creacion automatica de reclamos de garantia cuando corresponde.

### Archivos Modificados

#### 12.1: `devolucionesService.ts` — Logica de seriales en devoluciones

**Metodo `actualizarStockDevolucion`** (nuevo):
- Recibe `items`, `saleId?`, `customerId?` como parametros
- Para cada item con `track_serial = true`:
  - Busca seriales vendidos asociados a la venta (status = 'sold')
  - Prioriza `serial_number_ids` explicitos del `RefundData` si fueron seleccionados en UI
  - Si el motivo es garantia/defectuoso/danado:
    - Actualiza serial a `warranty_claim`
    - Crea reclamo automatico en `warranty_claims` con status `pending`
  - Si es otro motivo (cambio, insatisfaccion, etc.):
    - Devuelve serial a `in_stock` via `serialTrackingService.returnSerial()`
    - Limpia campos de venta (sold_to_customer_id, sale_id, sale_channel, etc.)

**Metodos modificados para cargar seriales**:
- `buscarVentas()` — Incluye `track_serial` en query de producto y carga seriales vendidos
- `obtenerDetalleVenta()` — Igual, incluye `track_serial` y seriales vendidos
- `procesarDevolucion()` — Pasa `saleId` y `customerId` a `actualizarStockDevolucion`

#### 12.2: `types.ts` — Tipos extendidos

- `SaleItemForReturn.product` ahora incluye `track_serial: boolean`
- Nuevo interface `SoldSerialInfo` con `id`, `serial`, `status`, `sold_to_customer_id`
- `SaleItemForReturn` incluye `sold_serials?: SoldSerialInfo[]`
- `RefundData.items` incluye `serial_number_ids?: number[]` para seriales seleccionados explicitamente

#### 12.3: `ReturnForm.tsx` — UI de seleccion de seriales

- `ReturnItemData` extendido con `track_serial`, `available_serials`, `selected_serial_ids`
- Inicializacion de `returnItems` carga seriales disponibles desde la venta
- `handleSerialToggle` para seleccionar/deseleccionar seriales individuales
- `validateForm` valida que items serializados tengan al menos 1 serial seleccionado
- `handleSubmit` pasa `serial_number_ids` en `RefundData`
- UI: Badge "Serializado" en productos con `track_serial`
- UI: Para productos serializados, reemplaza input de cantidad con checkboxes de seriales individuales

#### 12.4: `posService.ts` — Cancelacion de deuda con nota de credito

- `cancelDebtWithCreditNote()` ahora integra `serialTrackingService`:
  - Busca seriales vendidos asociados a la venta original
  - Actualiza seriales a `in_stock` (devolucion por nota de credito)
  - Limpia campos de venta del serial

### Flujo de Devolucion con Seriales

```
Usuario busca venta → buscarVentas() carga items + seriales vendidos
  ↓
ReturnForm muestra items:
  - Productos NO serializados: input de cantidad normal
  - Productos serializados: checkboxes de seriales individuales
  ↓
Usuario selecciona seriales a devolver
  ↓
validateForm() verifica que items serializados tengan seriales seleccionados
  ↓
handleSubmit() envia RefundData con serial_number_ids
  ↓
procesarDevolucion() llama actualizarStockDevolucion()
  ↓
actualizarStockDevolucion():
  - Si motivo = garantia/defectuoso:
    → serial → warranty_claim
    → crea warranty_claim automatico
  - Si otro motivo:
    → serial → in_stock
    → limpia campos de venta
```

---

## Fase 13: Seriales en Flujos de Compra y Venta — Implementacion

### Objetivo
Analizar el impacto de integrar seriales en todos los flujos de compra y venta del sistema, y definir recomendaciones de implementacion.

### Estado Actual por Modulo

| Modulo | Ruta | Tiene serial? | Estado |
|--------|------|---------------|--------|
| Ordenes de compra | `/app/inventario/ordenes-compra` | Parcial | Detecta `track_serial` en recepcion, falta captura completa |
| Facturas de compra | `/app/finanzas/facturas-compra` | Parcial | `SelectedProductsTable` tiene `SerialCaptureSection`, falta integracion en guardado |
| Facturas de venta (API) | `/api/facturas-venta` | No | Sin integracion |
| POS ventas | `/app/pos` | Si | Fase 13.3 completada |
| POS mesas | `/app/pos/mesas/[id]` | Si | Hereda de CheckoutDialog (13.3) |
| POS ventas (historico) | `/app/pos/ventas` | No | Sin integracion |
| CheckoutDialog POS | `components/pos/CheckoutDialog.tsx` | Si | Fase 13.3 completada |
| CheckoutDialog PMS | `components/pms/checkout/CheckoutDialog.tsx` | No | Sin integracion |
| PMS folios | `/app/pms/folios` | No | Sin integracion |
| PMS espacios | `/app/pms/espacios/[id]` | No | Sin integracion |
| Cotizaciones | `/app/finanzas/cotizaciones` | No | Sin integracion |
| Pedidos online | `/app/pos/pedidos-online` | No | Sin integracion |
| Web orders (API) | `/api/web-orders` | Si | Fase 13.12 completada |
| Devoluciones | `components/pos/devoluciones` | Si | Fase 12 completada |

### Analisis de Impacto: Variantes y Modificadores

#### Variantes de Producto
Las variantes (talla, color, etc.) se manejan como productos independientes en la tabla `products` con `parent_product_id`. Cada variante hereda `track_serial` del producto padre o puede tener su propia configuracion.

**Recomendacion:**
- Si el producto padre tiene `track_serial = true`, todas sus variantes deben heredarlo
- Cada variante tiene sus propios seriales (no se comparten entre variantes)
- El `serial_pattern` puede incluir el SKU de la variante via `{PROD}`
- Al crear/editar variantes, copiar `track_serial`, `serial_pattern`, `warranty_months` del padre

#### Modificadores de Producto
Los modificadores (extras, sin ingrediente, etc.) son agregaciones al producto base, no productos independientes. No afectan el tracking de seriales.

**Recomendacion:**
- Los modificadores NO requieren seriales propios
- El serial se asocia al producto base, no a los modificadores
- Si un producto serializado tiene modificadores, el serial se asigna al producto base y los modificadores se registran en `sale_items.notes.modifiers`

### Recomendacion: Manejo por Tipo de Producto

#### 1. Productos con Stock Tracking + Seriales (`track_serial = true`)
- **Compra**: Capturar seriales al recibir OC o registrar factura de compra
- **Venta POS**: Mostrar selector de seriales disponibles (status = 'in_stock') antes de cobrar
- **Venta Web**: Auto-asignar primer serial disponible (FIFO) al confirmar pedido
- **Factura de venta**: Asociar seriales al crear factura
- **Devolucion**: Seleccionar seriales especificos a devolver (ya implementado Fase 12)

#### 2. Productos con Stock Tracking SIN Seriales (`track_serial = false`)
- **Compra**: Recepcion normal por cantidad, sin captura de seriales
- **Venta**: Descuento de stock normal por cantidad
- **Devolucion**: Devolucion normal por cantidad
- No se requiere ningun cambio en estos productos

#### 3. Servicios / Productos sin Stock (`type = 'service'` o sin stock tracking)
- **Compra**: No aplica (los servicios no se compran con stock)
- **Venta**: No se requiere serial ni descuento de stock
- **Devolucion**: Solo reembolso monetario, sin devolucion de stock ni seriales
- Los servicios deben tener `track_serial = false` forzosamente

### Plan de Implementacion por Modulo

#### 13.1: Ordenes de Compra (Recepcion) — `/app/inventario/ordenes-compra` ✅ COMPLETADO

**Estado**: Implementado y funcional.

**Implementacion**:
- `OrdenCompraDetalle.tsx` detecta `track_serial` y muestra `SerialCaptureSection` al recibir items
- Al confirmar recepcion, llama `purchaseOrderService.receiveItemsWithSerials()`
- `receiveItemsWithSerials` crea seriales via `serialTrackingService.createSerial()` con:
  - `product_id`, `organization_id`, `branch_id`, `serial`, `supplier_id`, `purchase_order_id`, `cost_at_purchase`
- Solo crea seriales por el delta de cantidad nueva recibida (no duplica si ya estaba parcialmente recibido)

#### 13.2: Facturas de Compra — `/app/finanzas/facturas-compra`

**Estado**: `SelectedProductsTable.tsx` ya tiene `SerialCaptureSection` que se muestra si `product.track_serial`.

**Falta**:
- Verificar que los seriales capturados se guarden al crear la factura
- En el detalle de factura de compra, mostrar seriales asociados
- Al guardar factura, llamar `serialTrackingService.receiveSerials()` con `source_table = 'invoice_purchase'`

#### 13.3: POS Checkout — `components/pos/CheckoutDialog.tsx` ✅ COMPLETADO

**Estado**: Implementado y funcional.

**Implementacion**:
- Nuevo componente `SerialSelectorDialog.tsx` para seleccion de seriales en checkout
  - Filtra items del carrito con `track_serial = true`
  - Carga seriales disponibles (`status = 'in_stock'`) via `serialTrackingService.getAvailableSerials()`
  - Permite seleccionar N seriales (N = cantidad del item) con checkboxes
  - Búsqueda en tiempo real, validacion de cantidad, advertencias si no hay suficientes
- `CheckoutDialog.tsx` integra el dialog:
  - Si hay items serializados y no se han seleccionado seriales, abre el selector
  - Pasa `serial_selections: Record<number, number[]>` en `CheckoutData`
- `posService.checkout()` vende los seriales:
  - Despues de decrementar stock, llama `serialTrackingService.sellSerials()` por cada item
  - Usa `sale_channel = 'pos'`, `sale_id`, `customer_id`, `price_at_sale`, `branch_id`
  - Best-effort: no bloquea la venta si hay errores de seriales
- `types.ts` extendido: `Product.track_serial`, `CheckoutData.serial_selections`
- `serialTrackingService.ts`: nuevo metodo `getAvailableSerials(productId, orgId, branchId?)`

#### 13.4: POS Mesas — `/app/pos/mesas/[id]` ✅ HEREDADO

**Estado**: Funcional via herencia.

Las mesas usan el mismo `CheckoutDialog` del POS, por lo que la funcionalidad de seriales de la Fase 13.3 se aplica automaticamente.

#### 13.5: POS Ventas (Historico) — `/app/pos/ventas`

**Estado**: Sin integracion.

**Recomendacion**: Mostrar seriales vendidos en el detalle de cada venta historica. No requiere captura (ya fue vendido). Agregar columna "Seriales" en la tabla de detalle de venta.

#### 13.6: API Facturas de Venta — `/api/facturas-venta`

**Estado**: Sin integracion. Solo existe ruta `[id]/route.ts` y `[id]/pdf/`.

**Recomendacion**: Al crear una factura de venta manualmente (no desde POS), permitir asociar seriales:
- Request body incluye `serial_ids: number[]` por item
- Validar que seriales esten `in_stock` y pertenezcan a la organizacion
- Llamar `serialTrackingService.sellSerials()` con `source_table = 'invoice_sales'`, `sale_channel = 'invoice'`

#### 13.7: PMS Checkout — `components/pms/checkout/CheckoutDialog.tsx`

**Estado**: Sin integracion.

**Recomendacion**: El checkout del PMS incluye consumibles del folio. Si un consumible es un producto serializado:
- Mostrar selector de seriales antes de confirmar checkout
- Llamar `serialTrackingService.sellSerials()` con `sale_channel = 'pms'`
- Los servicios de hospedaje (noche de hotel, etc.) no requieren serial

#### 13.8: PMS Folios — `/app/pms/folios`

**Estado**: Sin integracion.

**Recomendacion**: Mostrar seriales asociados a consumibles del folio en el detalle. No requiere captura al ver el folio, solo visualizacion.

#### 13.9: PMS Espacios — `/app/pms/espacios/[id]`

**Estado**: Sin integracion.

**Recomendacion**: No requiere captura de seriales directamente. Los seriales se manejan en el checkout del folio (13.7).

#### 13.10: Cotizaciones — `/app/finanzas/cotizaciones`

**Estado**: Sin integracion. `DetalleCotizacion.tsx` no tiene logica de seriales.

**Recomendacion**:
- Al crear cotizacion: NO asignar seriales (es un documento no vinculante)
- Al convertir cotizacion a factura/venta: Pedir seriales en ese momento
- Mostrar en detalle de cotizacion si los productos requieren serial (informativo)

#### 13.11: Pedidos Online — `/app/pos/pedidos-online`

**Estado**: Sin integracion.

**Recomendacion**: Al confirmar/aprobar un pedido online:
- Para items con `track_serial`, auto-asignar seriales disponibles (FIFO por fecha de recepcion)
- Llamar `serialTrackingService.reserveSerials()` al confirmar pedido
- Al completar el pedido (entregado), cambiar seriales de `reserved` a `sold`

#### 13.12: Web Orders API — `/api/web-orders` ✅ COMPLETADO

**Estado**: Implementado y funcional.

**Implementacion**:
- Al crear pedido web (POST), despues de crear los items:
  - Para cada item con `product.track_serial = true`:
    - Busca seriales disponibles via `serialTrackingService.getAvailableSerials()` (FIFO por `received_date`)
    - Auto-asigna los primeros N seriales (N = cantidad del item)
    - Reserva con `serialTrackingService.reserveSerials()` asociando `web_order_id`
    - Si no hay suficientes seriales, agrega advertencia a `serial_warnings` (no bloquea el pedido)
  - La respuesta incluye `serial_warnings: string[]` si hubo problemas
  - Best-effort: errores de seriales no bloquean la creacion del pedido
- Al cancelar pedido web (futuro): liberar seriales con `releaseReservedSerials()`

### Resumen de Prioridades

| Prioridad | Modulo | Dificultad | Impacto |
|-----------|--------|------------|---------|
| Alta | POS Checkout (13.3) ✅ | Media | Ventas POS con seriales |
| Alta | Web Orders API (13.12) ✅ | Media | Auto-asignacion pedidos web |
| Alta | Ordenes de Compra (13.1) ✅ | Media | Recepcion con seriales |
| Media | Facturas de Compra (13.2) | Baja | Ya tiene UI, falta guardado |
| Media | Facturas de Venta API (13.6) | Media | Facturacion manual |
| Media | PMS Checkout (13.7) | Media | Consumibles serializados |
| Baja | Cotizaciones (13.10) | Baja | Informativo + conversion |
| Baja | Pedidos Online (13.11) | Baja | Reserva al confirmar |
| Baja | POS Ventas historico (13.5) | Baja | Solo visualizacion |
| Baja | PMS Folios/Espacios (13.8/13.9) | Baja | Solo visualizacion |

### Diagrama de Flujo de Seriales en Compra/Venta

```
COMPRA:
  Orden de Compra → Recepcion [capturar seriales]
    ↓                    ↓
  Factura de Compra [validar seriales]
    ↓
  serial_numbers.status = in_stock
    ↓
  stock_levels.qty_on_hand += quantity

VENTA:
  POS Checkout [seleccionar seriales]     Web Order [auto-asignar seriales]
    ↓                                         ↓
  sellSerials()                          reserveSerials()
    ↓                                         ↓
  serial.status = sold                   serial.status = reserved
  sale_channel = pos                     web_order_id = WO_ID
    ↓                                         ↓
  (entregado)                            (confirmado/entregado)
                                           ↓
                                         sellSerials()
                                           ↓
                                         serial.status = sold
                                         sale_channel = web

FACTURA MANUAL:
  Crear factura → asociar serial_ids
    ↓
  sellSerials() con sale_channel = invoice

DEVOLUCION (ya implementado):
  ReturnForm → seleccionar seriales
    ↓
  Si garantia → warranty_claim + crea reclamo
  Si otro motivo → in_stock + limpia campos
```

---

## Revisiones

| Revision | Fecha | Autor | Cambios |
|----------|-------|-------|---------|
| 1.0 | 2025-01 | Cascade | Documento inicial |
| 2.0 | 2026-08 | Cascade | Fase 10 completada: 4 reportes de serial tracking integrados en modulo de reportes |
| 3.0 | 2026-08 | Cascade | Fase 11 completada: Endurecimiento de RLS en serial_numbers, stock_levels y tabla de backup |
| 4.0 | 2026-08 | Cascade | Fase 6: Metodo generateSerialsFromPattern con variables de patron. Fase 8: TrazabilidadSeccion con constructor visual de patron, SerialesTab con generacion masiva y comparador stock vs seriales. Debug de supplier_id en NuevoProductoForm |
| 5.0 | 2026-08 | Cascade | Fase 12: Devoluciones con seriales y garantias automaticas. Fase 13: Analisis de seriales en todos los flujos de compra/venta, variantes y modificadores |
| 6.0 | 2026-08 | Cascade | Fase 13.1: Recepcion de seriales en OC completada. Fase 13.3: Selector de seriales en POS CheckoutDialog + sellSerials() en posService.checkout(). Fase 13.12: Auto-asignacion FIFO de seriales en Web Orders API. Nuevo metodo getAvailableSerials() en serialTrackingService |
