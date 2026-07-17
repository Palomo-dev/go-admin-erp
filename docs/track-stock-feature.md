# Feature: No registrar stock en productos

## Objetivo

Permitir que ciertos productos (de difícil control de inventario) se marquen como **"no registrar stock"** mediante un checkbox **editable en cualquier momento** desde el formulario de creación o edición de producto. Estos productos:
- **No tienen control de stock** (se asume inventario infinito)
- **Se pueden vender sin validación** de stock disponible
- **No se les descuenta ni suma stock** en ventas, compras, transferencias ni movimientos
- **No aparecen en reportes de inventario** ni alertas de stock mínimo
- **En la tienda web** se muestran como "Siempre disponible"
- **El cambio es reversible**: se puede activar/desactivar en cualquier momento desde la edición del producto

### Editabilidad de `track_stock`

El campo `track_stock` se puede cambiar en cualquier momento:

| Escenario | Comportamiento |
|-----------|---------------|
| **Crear producto** con `track_stock = false` | No se crea sección de stock inicial. Producto vendible inmediatamente |
| **Editar producto** de `true` → `false` | Se oculta sección de stock. Los `stock_levels` existentes se mantienen pero se ignoran. Advertencia: "Al desactivar el control de stock, los niveles actuales se ignorarán" |
| **Editar producto** de `false` → `true` | Se muestra sección de stock. Advertencia: "Al activar el control de stock, deberás registrar el stock inicial por sucursal" |
| **Variantes** | Cada variante tiene su propio `track_stock` independiente, hereda del padre al crearse pero se puede cambiar individualmente |

## Comportamiento por módulo

### POS y ventas (ERP)
- **Productos con `track_stock = true`**: El POS ya descuenta stock en checkout. Se mantiene el comportamiento actual.
- **Productos con `track_stock = false`**: Se omiten de la validación de stock y de la reserva/descuento de `stock_levels`. Se venden sin restricción.

### Compras (ERP)
- **Productos con `track_stock = true`**: Al recepcionar factura de compra, se suma stock (`stock_movements` + `stock_levels`). Comportamiento actual.
- **Productos con `track_stock = false`**: No se generan movimientos ni se actualiza `stock_levels`.

### Transferencias (ERP)
- **Productos con `track_stock = true`**: Generan movimientos de salida/entrada y actualizan `stock_levels`. Comportamiento actual.
- **Productos con `track_stock = false`**: Se bloquean o advierten al intentar transferir (no tiene sentido transferir algo sin stock).

### Inventario y reportes (ERP)
- **Productos con `track_stock = false`**: Se excluyen de:
  - Niveles de stock (`stock_levels`)
  - Alertas de stock mínimo y agotados
  - Estadísticas de valor de inventario
  - Exportación a CSV de stock
  - Movimientos de stock

### Tienda web (goadmin-websites)
- **Productos con `track_stock = false`**:
  - En validación de orden: se excluyen del chequeo de stock disponible
  - En reserva de stock: no se reserva stock
  - En UI: se muestra badge "Siempre disponible" en lugar de cantidad
  - Botón de compra siempre habilitado

---

## Base de datos

### Migración

```sql
ALTER TABLE products ADD COLUMN track_stock boolean DEFAULT true NOT NULL;
```

- `true` = comportamiento actual (trackea stock por sucursal)
- `false` = no trackea, stock infinito, sin validación ni movimientos

### Tabla `products` (campos relevantes después de la migración)

| Columna | Tipo | Default | Descripción |
|---------|------|---------|-------------|
| `id` | integer | auto | PK |
| `organization_id` | integer | - | FK organización |
| `sku` | text | - | SKU único |
| `name` | text | - | Nombre |
| `track_stock` | boolean | `true` | Si false, no se controla stock |
| `status` | text | `'active'` | Estado del producto |
| `is_parent` | boolean | `false` | Si tiene variantes |
| `parent_product_id` | integer | null | FK producto padre (variantes) |

### Tabla `stock_levels` (sin cambios)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `product_id` | integer | FK producto |
| `branch_id` | integer | FK sucursal |
| `qty_on_hand` | numeric | Stock disponible |
| `qty_reserved` | numeric | Stock reservado |
| `avg_cost` | numeric | Costo promedio |
| `min_level` | numeric | Nivel mínimo |

> Los productos con `track_stock = false` simplemente no tendrán registros en `stock_levels`, o si los tienen, serán ignorados.

---

## Archivos a modificar

### ERP (go-admin-erp)

#### 1. Formularios de producto

| Archivo | Cambio |
|---------|--------|
| `src/components/inventario/productos/nuevo/InformacionBasica.tsx` | Agregar checkbox "No registrar stock" con tooltip: "Para productos de difícil control de inventario. Se podrán vender sin validar stock disponible." |
| `src/components/inventario/productos/nuevo/NuevoProductoForm.tsx` | Leer estado del checkbox, enviar `track_stock` al crear producto. Si `false`, ocultar sección `Inventario.tsx` y no crear registros en `stock_levels` |
| `src/components/inventario/productos/nuevo/Inventario.tsx` | Recibir prop `trackStock`. Si `false`, ocultar UI de stock por sucursal |
| `src/components/inventario/productos/editar/FormularioEdicionProducto.tsx` | Cargar `track_stock` desde DB. Mostrar checkbox. Si `false`, ocultar pestaña/section de stock. Guardar cambios |

#### 1b. Detalle de producto

| Archivo | Cambio |
|---------|--------|
| `src/components/inventario/productos/id/ProductoHeader.tsx` | Card "Stock" (líneas 357-379): si `track_stock = false`, mostrar "∞ Sin seguimiento" en lugar del número. No ejecutar fetch de stock |
| `src/components/inventario/productos/id/tabs/DetallesTab.tsx` | Reemplazar comentarios "track_stock removed" (líneas 116, 306) por checkbox funcional. Incluir `track_stock` en `handleSaveChanges` update (líneas 123-136) |
| `src/components/inventario/productos/id/tabs/StockTab.tsx` | Si `producto.track_stock = false`, mostrar mensaje "Este producto no tiene seguimiento de stock" y ocultar tabla, botones de ajuste/transferencia |
| `src/components/inventario/productos/id/DetalleProducto.tsx` | Si `track_stock = false`, ocultar botones "Ajustar Stock" y "Transferir" (líneas 182-198) |

#### 1c. Tabla de inventario

| Archivo | Cambio |
|---------|--------|
| `src/components/inventario/stock/StockTable.tsx` | Agregar columna "Seguimiento" entre "Categoría" y "Disponible". Badge verde "Con seguimiento" o gris "Sin seguimiento" (∞) |
| `src/lib/services/stockService.ts` | Incluir `track_stock` en select de `products` en `getStockLevels`. Agregar `trackStock?: boolean` a interfaz `StockFilters` (línea 79-86) |

#### 2. Inventario y reportes

| Archivo | Cambio |
|---------|--------|
| `src/lib/services/stockService.ts` | En `getStockLevels`, `getStockLevelsSimple`, `getStockStats`, `exportStockToCSV`: filtrar `products.track_stock = true`. En `getStockMovements`: filtrar productos con `track_stock = true` |

#### 3. POS

| Archivo | Cambio |
|---------|--------|
| `src/components/pos/types.ts` | Agregar `track_stock?: boolean` a interface `Product` |
| `src/lib/services/posService.ts` | En `searchProducts` y `getProductsPaginated`: incluir `track_stock` en el select. En `checkout`: para items con `track_stock = false`, omitir validación y descuento de stock. Para items con `track_stock = true`, mantener descuento actual |

#### 4. Transferencias

| Archivo | Cambio |
|---------|--------|
| `src/components/inventario/transferencias/TransferenciasService.ts` | Al agregar items: verificar `track_stock`. Si `false`, advertir o bloquear (no tiene sentido transferir sin stock). En `generarMovimientosSalida` y `recibirItems`: omitir productos con `track_stock = false` |

#### 5. Compras (facturas de compra)

| Archivo | Cambio |
|---------|--------|
| `src/components/finanzas/facturas-compra/FacturasCompraService.ts` | En `recepcionarInventario`: omitir items con `track_stock = false` (no generar `stock_movements` ni actualizar `stock_levels`) |

### Web Storefront (goadmin-websites)

| Archivo | Cambio |
|---------|--------|
| `app/api/orders/route.ts` | En validación B1 (líneas 54-81): excluir productos con `track_stock = false` del chequeo. En reserva de stock (líneas 260-277): saltar productos con `track_stock = false` |
| `app/api/products/stock/route.ts` | Para productos con `track_stock = false`, retornar `available: null` como indicador de "siempre disponible" |
| `app/categorias/[slug]/CategoryPageClient.tsx` | Si `track_stock = false` o `available === null`, mostrar badge "Siempre disponible" y siempre permitir compra |
| `app/components/site/ProductGrid.tsx` o `ProductsList.tsx` | Mostrar "Disponible" en lugar de cantidad para productos sin stock tracking |

---

## UX sugerida

### Checkbox en formulario de producto

```
[ ] No registrar stock
    Para productos de difícil control de inventario.
    Se podrán vender sin validar stock disponible.
```

- Ubicado en sección "Información básica", junto a campos como SKU y barcode
- **Disponible tanto en creación como en edición** de producto
- Al marcarlo, la sección "Inventario inicial por sucursal" se oculta con animación
- Al desmarcarlo, la sección "Inventario inicial por sucursal" aparece
- **En edición**, si se desmarca después de haber estado marcado, mostrar advertencia: "Al desactivar el control de stock, los niveles actuales se ignorarán"
- **En edición**, si se marca después de haber estado desmarcado, mostrar advertencia: "Al activar el control de stock, deberás registrar el stock inicial por sucursal"

### Indicador en listados

- En listado de productos: icono pequeño (ej: ∞) junto al nombre para productos sin stock tracking
- En POS: badge "Sin stock" o icono ∞ en la tarjeta del producto
- En tienda web: badge "Siempre disponible" en verde

### Detalle de producto (`/app/inventario/productos/[id]`)

Componentes afectados (analizados en código actual):

| Componente | Archivo | Cambio |
|------------|---------|--------|
| **ProductoHeader** | `src/components/inventario/productos/id/ProductoHeader.tsx` (líneas 357-379) | Card "Stock": si `track_stock = false`, mostrar "∞ Sin seguimiento" en lugar del número. Ocultar loading de stock. Color gris o azul para distinguir |
| **DetallesTab** | `src/components/inventario/productos/id/tabs/DetallesTab.tsx` (líneas 116, 306) | Reemplazar comentarios "track_stock removed" por checkbox "No registrar stock" funcional. Guardar `track_stock` en `handleSaveChanges` (línea 123-136) |
| **StockTab** | `src/components/inventario/productos/id/tabs/StockTab.tsx` | Si `producto.track_stock = false`, mostrar mensaje "Este producto no tiene seguimiento de stock" en lugar de la tabla de stock por sucursal. Ocultar botones de ajuste y transferencia |
| **DetalleProducto** | `src/components/inventario/productos/id/DetalleProducto.tsx` (líneas 182-198) | Si `track_stock = false`, ocultar botones "Ajustar Stock" y "Transferir" (no aplican) |

### Tabla de inventario (`/app/inventario/stock`)

Componente afectado:

| Componente | Archivo | Cambio |
|------------|---------|--------|
| **StockTable** | `src/components/inventario/stock/StockTable.tsx` | Agregar columna "Seguimiento" entre "Categoría" y "Disponible". Para productos con `track_stock = true`: badge verde "Con seguimiento". Para `false`: badge gris "Sin seguimiento" con icono ∞. Los productos sin seguimiento pueden filtrarse con un toggle |
| **stockService.ts** | `src/lib/services/stockService.ts` | En `getStockLevels`: incluir `track_stock` en el select de `products`. Agregar filtro opcional `trackStock?: boolean` a `StockFilters` (línea 79-86) |

### Variantes

- Cada variante tiene su propio `track_stock` independiente
- Al crear variante desde producto padre, hereda el valor `track_stock` del padre
- Se puede cambiar individualmente por variante

---

## Orden de implementación recomendado

1. **Migración DB**: `ALTER TABLE products ADD COLUMN track_stock boolean DEFAULT true NOT NULL`
2. **ERP - Formularios**: Checkbox en nuevo y editar producto
3. **ERP - Detalle de producto**: ProductoHeader, DetallesTab, StockTab, DetalleProducto
4. **ERP - Tabla de inventario**: StockTable con columna "Seguimiento", stockService con filtro
5. **ERP - Inventario**: Filtrar en `stockService.ts` (reportes, stats, export)
6. **ERP - POS**: Incluir campo, omitir validación/descuento
7. **ERP - Transferencias**: Advertir/bloquear
8. **ERP - Compras**: Omitir recepción de inventario
9. **Web Storefront**: Validación, reserva, UI

---

## Resumen de impacto

| Módulo | Productos track_stock=true | Productos track_stock=false |
|--------|---------------------------|----------------------------|
| Formulario producto | Stock por sucursal normal | Sin sección de stock |
| Detalle producto - Header | Card "Stock" muestra total numérico | Card "Stock" muestra "∞ Sin seguimiento" |
| Detalle producto - DetallesTab | Checkbox desmarcado | Checkbox marcado, guardable |
| Detalle producto - StockTab | Tabla de stock por sucursal | Mensaje "Sin seguimiento", sin botones de ajuste |
| Detalle producto - Acciones | Botones "Ajustar Stock" y "Transferir" visibles | Botones ocultos |
| Tabla de inventario | Badge verde "Con seguimiento" | Badge gris "Sin seguimiento" (∞) |
| Inventario/Reportes | Aparece en niveles y stats | Excluido |
| POS | Valida y descuenta stock | Sin validación, sin descuento |
| Ventas web | Valida y reserva stock | Sin validación, sin reserva |
| Compras | Suma stock al recepcionar | No genera movimientos |
| Transferencias | Movimientos de salida/entrada | Bloqueado o advertido |
| Tienda web | Badge con cantidad | Badge "Siempre disponible" |
