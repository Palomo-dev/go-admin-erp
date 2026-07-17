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

### Variantes

- Cada variante tiene su propio `track_stock` independiente
- Al crear variante desde producto padre, hereda el valor `track_stock` del padre
- Se puede cambiar individualmente por variante

---

## Orden de implementación recomendado

1. **Migración DB**: `ALTER TABLE products ADD COLUMN track_stock boolean DEFAULT true NOT NULL`
2. **ERP - Formularios**: Checkbox en nuevo y editar producto
3. **ERP - Inventario**: Filtrar en `stockService.ts`
4. **ERP - POS**: Incluir campo, omitir validación/descuento
5. **ERP - Transferencias**: Advertir/bloquear
6. **ERP - Compras**: Omitir recepción de inventario
7. **Web Storefront**: Validación, reserva, UI

---

## Resumen de impacto

| Módulo | Productos track_stock=true | Productos track_stock=false |
|--------|---------------------------|----------------------------|
| Formulario producto | Stock por sucursal normal | Sin sección de stock |
| Inventario/Reportes | Aparece en niveles y stats | Excluido |
| POS | Valida y descuenta stock | Sin validación, sin descuento |
| Ventas web | Valida y reserva stock | Sin validación, sin reserva |
| Compras | Suma stock al recepcionar | No genera movimientos |
| Transferencias | Movimientos de salida/entrada | Bloqueado o advertido |
| Tienda web | Badge con cantidad | Badge "Siempre disponible" |
