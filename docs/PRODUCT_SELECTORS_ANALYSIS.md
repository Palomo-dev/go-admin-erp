# Análisis de Selectores de Productos por Módulo

> Investigación con subagentes sobre cómo cada módulo maneja productos: tipo (service/product), track_stock, variantes, modificadores, recetas y seriales.

## Estructura de la BD (tabla `products`)

Campos relevantes confirmados en Supabase:

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `product_type` | text | `'product'` | `'product'` o `'service'` |
| `track_stock` | boolean | `true` | Si tiene control de stock |
| `track_serial` | boolean | `false` | Si requiere seguimiento de seriales |
| `is_parent` | boolean | `false` | Si tiene variantes hijas |
| `parent_product_id` | integer | null | FK al producto padre |
| `variant_data` | jsonb | `{}` | Atributos: `{"Color": "Rojo"}` |
| `is_composite` | boolean | `false` | Si es producto compuesto (receta) |
| `production_type` | text | `'simple'` | `'simple'` o `'composite'` |

### Tablas relacionadas
- **Variantes:** `variant_types`, `variant_values` (catálogos). La relación real es `parent_product_id` + `variant_data`.
- **Modificadores:** `product_modifier_groups`, `product_modifiers`
- **Recetas:** `product_recipes`, `recipe_ingredients`
- **Seriales:** `serial_numbers`, `serial_tracking_events`

---

## Tabla resumen global

### Módulo POS

| Componente | Tipo Producto | Track Stock | Variantes | Modificadores | Recetas | Seriales |
|------------|--------------|-------------|-----------|---------------|---------|----------|
| ProductSearch | ❌ | ✅ | ✅ | ✅ | ❌ | ⚠️ (en checkout) |
| VariantSelectorDialog | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| SerialSelectorDialog | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| AddProductDialog (mesas) | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| CheckoutDialog | ❌ | ✅ | ⚠️ (carrito) | ⚠️ (carrito) | ⚠️ (validación) | ✅ |

### Módulo Finanzas

| Componente | Tipo Producto | Track Stock | Variantes | Modificadores | Recetas | Seriales |
|------------|--------------|-------------|-----------|---------------|---------|----------|
| ProductSearchDialog (shared) | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ (campo) |
| ItemsFactura (venta) | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| ItemsListForm (compra) | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| SelectedProductsTable (compra) | ❌ | ❌ | ✅ (heredado) | ❌ (heredado) | ❌ | ✅ |
| NotaCreditoDialog | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| NuevaCotizacionForm | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |

### Módulo Inventario

| Componente | Tipo Producto | Track Stock | Variantes | Modificadores | Recetas | Seriales |
|------------|--------------|-------------|-----------|---------------|---------|----------|
| ProductSearchCombobox | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| ProductSearchDialog (shared) | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| NuevoAjusteForm | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| NuevaOrdenCompraForm | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| EditarOrdenCompraForm | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| NuevaTransferenciaForm | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| RecipeDialog | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |

### Módulo PMS

| Componente | Tipo Producto | Track Stock | Variantes | Modificadores | Recetas | Seriales |
|------------|--------------|-------------|-----------|---------------|---------|----------|
| AddConsumptionDialog | ❌ | ✅ (via POS) | ✅ | ✅ | ❌ | ❌ |
| ServicioDialog | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| SpaceFolioSummary | ❌ | ❌ | ✅ (visual) | ✅ (visual) | ❌ | ❌ |
| StepExtras | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Módulo CRM

| Componente | Tipo Producto | Track Stock | Variantes | Modificadores | Recetas | Seriales |
|------------|--------------|-------------|-----------|---------------|---------|----------|
| ProductSearchSelect | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| OpportunityForm | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Módulo Transporte

| Componente | Tipo Producto | Track Stock | Variantes | Modificadores | Recetas | Seriales |
|------------|--------------|-------------|-----------|---------------|---------|----------|
| ShipmentItems | ❌ | ❌ | ✅ (en notes) | ✅ (en notes) | ❌ | ❌ |

### Módulos sin selectores de productos
- **GYM:** Usa `MembershipPlan`, no selecciona productos
- **PARKING:** Usa `ParkingPassType` y `ParkingRate`, no selecciona productos
- **HRM:** No tiene selección de productos

---

## Hallazgos críticos

### 1. Ningún selector filtra por `product_type` (service vs product)
El campo `product_type` existe en la BD con valores `'product'` y `'service'`, pero **ningún componente lo consulta ni filtra por él**. Esto significa:
- Se pueden agregar servicios a órdenes de compra (no tiene sentido)
- Se pueden agregar servicios a ajustes de inventario (no tiene sentido)
- Se pueden agregar servicios a transferencias (no tiene sentido)
- No hay distinción visual entre productos y servicios en ningún selector

### 2. `track_stock` es inconsistente
- **POS y Finanzas:** Manejan `track_stock` correctamente
- **Inventario:** `NuevoAjusteForm` NO consulta `track_stock` (aunque es un ajuste de stock)
- **CRM:** No consulta `track_stock`
- **Transporte:** No consulta `track_stock`
- **PMS:** Solo `AddConsumptionDialog` lo maneja (via POS)

### 3. Seriales solo en compras y checkout POS
- **Facturas de compra:** Capturan seriales con `SerialCaptureSection`
- **POS checkout:** Selecciona seriales con `SerialSelectorDialog`
- **Facturas de venta:** NO capturan seriales (recibe el campo pero no lo usa)
- **Mesas:** NO manejan seriales en la selección (solo en checkout)
- **Inventario:** Ningún selector maneja seriales excepto `ProductSearchDialog` (shared)
- **CRM, Transporte, PMS:** No manejan seriales

### 4. Recetas no se manejan en selectores
- Solo `RecipeDialog` (inventario) crea/edita recetas
- `CheckoutDialog` (POS) valida stock de productos compuestos via `validateCompositeStock`
- Ningún selector muestra si un producto tiene receta asociada

### 5. Modificadores bien implementados en POS y Finanzas
- POS: `VariantSelectorDialog` maneja modificadores correctamente
- Finanzas: `ProductSearchDialog` (shared) integra con `VariantSelectorDialog`
- Inventario: Solo `ProductSearchDialog` (shared) maneja modificadores; `ProductSearchCombobox` no
- PMS: `AddConsumptionDialog` maneja modificadores via POS
- CRM y Transporte: No manejan modificadores

### 6. Variantes bien implementadas en la mayoría
- Todos los selectores principales filtran variantes hijas (`parent_product_id IS NULL`)
- `VariantSelectorDialog` permite seleccionar variantes específicas
- CRM y Transporte no manejan variantes correctamente (CRM no las considera, Transporte las guarda en notes)

---

## Problemas por prioridad

| # | Problema | Severidad | Módulos afectados |
|---|----------|-----------|-------------------|
| 1 | No filtrar servicios en contextos físicos (compras, ajustes, transferencias) | Alta | ✅ COMPLETADO | Inventario, Finanzas |
| 2 | Facturas de venta no capturan seriales | Alta | ✅ COMPLETADO | Finanzas |
| 3 | NuevoAjusteForm no consulta track_stock | Media | ✅ COMPLETADO | Inventario |
| 4 | CRM no maneja variantes ni modificadores | Media | ✅ COMPLETADO | CRM |
| 5 | Transporte no usa VariantSelectorDialog | Baja | ✅ COMPLETADO | Transporte |
| 6 | Ningún selector muestra si producto tiene receta | Baja | Todos |
| 7 | ProductSearchCombobox no maneja modificadores | Baja | Inventario |

---

## Historial de cambios

### [Fix 4] CRM - Manejar variantes y modificadores - COMPLETADO
- **Archivo:** `src/components/crm/oportunidades/OpportunityForm.tsx`
- **Cambio:** Se reemplazó `ProductSearchSelect` por `ProductSearchDialog` (shared) que maneja variantes, modificadores, track_stock y track_serial. Se agregó campo `modifiers` a `ProductLine` y función `handleProductSelect` que recibe producto + modificadores.
- **Razón:** El selector de CRM era muy básico y no soportaba variantes ni modificadores.
- **Lint:** Sin errores nuevos.

### [Fix 5] Transporte - Usar VariantSelectorDialog - COMPLETADO
- **Archivos:** `src/lib/services/shipmentsService.ts`, `src/components/transporte/envios/id/ShipmentItems.tsx`
- **Cambio:** Se agregaron campos `is_parent`, `parent_product_id`, `variant_data`, `has_modifiers` al servicio. En `ShipmentItems` se integró `VariantSelectorDialog` para selección estructurada de variantes y modificadores (antes se guardaban como JSON en notes).
- **Razón:** Las variantes y modificadores se guardaban sin selección estructurada.
- **Lint:** Sin errores nuevos.

### [Fix 2] Capturar seriales en factura de venta - COMPLETADO
- **Archivos:** `src/components/finanzas/facturas-venta/nueva-factura/ItemsFactura.tsx`, `src/components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm.tsx`
- **Cambio:** Se integró `SerialSelectorDialog` en `ItemsFactura` con badge visual "Serial" y progreso `X/Y`. En `NuevaFacturaForm` se agregó estado `serialSelections`, validación al guardar (bloquea si faltan seriales) y venta de seriales via `serialTrackingService.sellSerials` con `sale_channel='invoice'`.
- **Razón:** Las facturas de venta no capturaban seriales de productos con `track_serial=true`.
- **Lint:** Sin errores nuevos.

### [Fix 1] Filtrar servicios en contextos físicos - COMPLETADO
- **Archivos:** `src/lib/services/purchaseOrderService.ts`, `src/lib/services/adjustmentService.ts`, `src/components/inventario/transferencias/TransferenciasService.ts`, `src/components/inventario/ajustes/nuevo/NuevoAjusteForm.tsx`
- **Cambio:** Se agregó `.neq('product_type', 'service')` en 4 consultas Supabase para excluir servicios de órdenes de compra, ajustes y transferencias.
- **Razón:** No tiene sentido físico comprar, ajustar o transferir servicios.
- **Lint:** Sin errores nuevos.

### [Fix 3] Track_stock en NuevoAjusteForm - COMPLETADO
- **Archivo:** `src/components/inventario/ajustes/nuevo/NuevoAjusteForm.tsx`
- **Cambio:** Se agregó `track_stock` al select y filtro `.eq('track_stock', true)` en la consulta de productos (línea 124). Se agregó verificación de respaldo en `handleAddProduct` (líneas 369-388) que consulta `track_stock` antes de agregar.
- **Razón:** Permitía ajustar stock de productos sin seguimiento.
- **Lint:** Sin errores nuevos.
