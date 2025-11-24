# Sistema de Detalle de Mesa & Pedidos

## 📍 Ruta
`/app/pos/mesas/[id]`

## 🎯 Descripción
Sistema completo de gestión de pedidos por mesa. Permite añadir productos, gestionar items, transferir entre mesas, generar pre-cuentas y enviar comandas a cocina.

## 🏗️ Arquitectura

### Componentes Principales

#### 1. **MesaDetallePage** (`page.tsx`)
Página principal que gestiona el estado y coordina todas las operaciones.

**Funcionalidades:**
- Carga automática de sesión existente o creación de nueva
- Gestión de productos y pedidos
- Cálculo de totales en tiempo real
- Coordinación de diálogos y modales
- Integración con sistema de notificaciones

**Estados clave:**
```typescript
- session: TableSessionWithDetails | null
- preCuenta: PreCuenta | null
- itemToTransfer: SaleItem | null
```

#### 2. **AddProductDialog**
Modal para buscar y agregar productos al pedido.

**Características:**
- Búsqueda de productos por nombre/código
- Selector de cantidad con botones +/-
- Campo de notas de cocina
- Especificación de estación (Parrilla, Bar, etc.)
- Vista previa del producto seleccionado

**Flow:**
1. Buscar producto
2. Seleccionar de la lista
3. Ajustar cantidad
4. Añadir notas/estación
5. Agregar al pedido

#### 3. **OrderItemCard**
Card que representa cada item del pedido con opciones de gestión.

**Funcionalidades:**
- Edición inline de cantidad
- Mostrar notas de cocina
- Cálculo de subtotal (cantidad × precio)
- Eliminar item (con confirmación)
- Transferir a otra mesa

**Diseño:**
```
┌─────────────────────────────────────┐
│ Nombre del Producto         $50,000 │
│ 📝 Sin cebolla                      │
│ $25,000 c/u                         │
│                         Cant: 2 [✏️]│
│              [Transferir] [🗑️]      │
└─────────────────────────────────────┘
```

#### 4. **PreCuentaDialog**
Modal que muestra la pre-cuenta con detalle completo.

**Información mostrada:**
- Lista de todos los items con cantidades y precios
- Subtotal de productos
- Descuentos aplicados
- Impuestos calculados
- Total final
- Fecha y hora de generación

**Acciones:**
- Imprimir pre-cuenta
- Generar cuenta final
- Cerrar vista

#### 5. **TransferItemDialog**
Modal para transferir items entre mesas.

**Características:**
- Selector de mesa destino
- Ajuste de cantidad a transferir
- Soporte para transferencia parcial
- Lista de mesas disponibles (ocupadas y libres)
- Validaciones de cantidad

**Casos de uso:**
- **Transferencia total**: Item completo se mueve a otra mesa
- **Transferencia parcial**: Se divide el item entre dos mesas
- **Mesa sin sesión**: Se crea sesión automáticamente en destino

### Servicios

#### **PedidosService** (`pedidosService.ts`)
Servicio centralizado para todas las operaciones de pedidos.

**Métodos principales:**

```typescript
// Consultas
obtenerDetalleMesa(tableId: number): Promise<TableSessionWithDetails>
obtenerTicketsCocina(sessionId: number): Promise<KitchenTicket[]>

// Gestión de sesiones
iniciarSesion(tableId, serverId, customers): Promise<TableSessionWithDetails>
solicitarCuenta(sessionId: number): Promise<void>

// Productos y pedidos
agregarProductos(sessionId, productos[]): Promise<void>
actualizarCantidadItem(itemId, cantidad): Promise<void>
eliminarItem(itemId: string): Promise<void>

// Operaciones especiales
transferirItem(itemId, toTableId, quantity): Promise<void>
generarPreCuenta(sessionId): Promise<PreCuenta>
enviarComandaCocina(sessionId): Promise<void>
recalcularTotalVenta(saleId): Promise<void>
```

## 🗄️ Flujo de Datos

### Flujo Completo de Pedido

```
1. Cliente llega → Mesa
   ↓
2. Abrir sesión (table_sessions)
   ↓
3. Crear venta (sales)
   ↓
4. Añadir productos
   ↓
5. Crear sale_items
   ↓
6. Generar kitchen_ticket
   ↓
7. Crear kitchen_ticket_items
   ↓
8. Enviar a cocina (printed_at)
   ↓
9. Generar pre-cuenta
   ↓
10. Solicitar cuenta (status: bill_requested)
    ↓
11. Procesar pago (en módulo de pagos)
    ↓
12. Cerrar sesión (status: completed)
```

### Relaciones de Base de Datos

```
restaurant_tables
    ↓ (1:N)
table_sessions
    ↓ (1:1)
sales ──────────┐
    ↓ (1:N)     │ (1:N)
sale_items      kitchen_tickets
    ↓ (1:1)         ↓ (1:N)
    └───────→ kitchen_ticket_items
```

## 🎨 Características de UI

### Tema Dark/Light
Todos los componentes soportan cambio dinámico de tema:

```tsx
// Textos
text-gray-900 dark:text-gray-100

// Fondos
bg-white dark:bg-gray-800
bg-blue-50 dark:bg-blue-950/20

// Bordes
border-gray-200 dark:border-gray-700
```

### Color Principal: Azul
- Botones primarios: `bg-blue-600`
- Hover: `hover:bg-blue-700`
- Texto destacado: `text-blue-600 dark:text-blue-400`
- Badges: `variant="default"` (azul)

### Responsive Design
- Mobile first approach
- Grid adaptativo: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- Flex wrap en botones: `flex-wrap`
- Overflow scroll en modales: `max-h-[90vh] overflow-y-auto`

## 📋 Casos de Uso

### 1. Añadir Productos
**Flujo:**
1. Click en "Agregar Producto"
2. Buscar producto por nombre
3. Seleccionar de la lista
4. Ajustar cantidad
5. Añadir notas: "Sin cebolla, término medio"
6. Especificar estación: "Parrilla"
7. Confirmar → Se crea sale_item y kitchen_ticket_item

**Resultado:**
- Item aparece en lista de pedidos
- Total se actualiza automáticamente
- Ticket queda pendiente de enviar a cocina

### 2. Modificar Cantidad
**Flujo:**
1. Click en ícono de edición (✏️) en item
2. Ajustar cantidad con input numérico
3. Click en check (✓) para confirmar
4. Total se recalcula automáticamente

### 3. Transferir Item
**Flujo:**
1. Click en "Transferir" en item
2. Seleccionar mesa destino
3. Ajustar cantidad a transferir
4. Confirmar
5. Item se mueve/divide según cantidad
6. Totales se recalculan en ambas mesas

**Casos:**
- **Total**: Item completo → Mesa destino
- **Parcial**: Se crea nuevo item en destino, se reduce en origen

### 4. Generar Pre-Cuenta
**Flujo:**
1. Click en "Ver Pre-Cuenta"
2. Se muestra modal con:
   - Detalle de todos los items
   - Subtotal, impuestos, descuentos
   - Total final
3. Opciones:
   - Imprimir para cliente
   - Generar cuenta final
   - Solo cerrar vista

### 5. Enviar a Cocina
**Flujo:**
1. Añadir todos los productos deseados
2. Click en "Enviar a Cocina"
3. Se marca `printed_at` en kitchen_tickets
4. Notificación: "Comanda enviada"

**Nota:** Solo se envían tickets no enviados previamente.

### 6. Solicitar Cuenta
**Flujo:**
1. Click en "Solicitar Cuenta"
2. Estado de sesión cambia a `bill_requested`
3. Badge cambia a "Cuenta Solicitada" (naranja)
4. En plano de mesas, la mesa aparece con estado ⏳

## 🔧 Configuración

### Variables Mock (Temporales)
```typescript
// En page.tsx línea 57
const userId = 'user-id-mock'; // TODO: Obtener del auth

// En AddProductDialog.tsx
const mockProducts: Product[] = [
  // Lista de productos de prueba
];
```

### Integración con Auth
Para producción, reemplazar:
```typescript
// Obtener usuario autenticado
const { data: { user } } = await supabase.auth.getUser();
const userId = user?.id;
```

### Precios de Productos
Actualmente los precios están hardcoded. En producción:
```typescript
// Consultar precio desde product_prices
const { data: price } = await supabase
  .from('product_prices')
  .select('unit_price')
  .eq('product_id', productId)
  .eq('branch_id', branchId)
  .single();
```

## 🚀 Funcionalidades Implementadas

✅ **Gestión de Sesiones:**
- Crear sesión automáticamente al entrar
- Cargar sesión existente
- Mostrar info de sesión (comensales, tiempo, total)

✅ **Gestión de Productos:**
- Búsqueda de productos
- Agregar con cantidad y notas
- Especificar estación de cocina

✅ **Gestión de Items:**
- Editar cantidad inline
- Eliminar items (con confirmación)
- Mostrar notas de cocina
- Transferir entre mesas

✅ **Operaciones:**
- Generar pre-cuenta detallada
- Solicitar cuenta final
- Enviar comandas a cocina
- Recalcular totales automáticamente

✅ **UI/UX:**
- Responsive design
- Dark/light mode
- Notificaciones toast
- Estados de carga
- Validaciones

## 📊 Cálculos Automáticos

### Total de Item
```typescript
total = quantity × unit_price
```

### Total de Venta
```typescript
subtotal = Σ(item.total)
tax_total = Σ(item.tax_amount)
discount_total = Σ(item.discount_amount)
total = subtotal + tax_total - discount_total
```

### Actualización en Cascada
Cuando se modifica un item:
1. Se actualiza `sale_items.total`
2. Se recalcula `sales.subtotal`
3. Se recalcula `sales.total`
4. Se actualiza `sales.balance`

## 🔒 Validaciones

### Agregar Productos
- ✅ Producto debe estar seleccionado
- ✅ Cantidad > 0
- ✅ Sesión debe existir

### Actualizar Cantidad
- ✅ Nueva cantidad > 0
- ✅ Item debe existir

### Eliminar Item
- ✅ Confirmación del usuario
- ✅ Item debe existir

### Transferir Item
- ✅ Mesa destino debe existir
- ✅ Cantidad <= cantidad disponible
- ✅ Cantidad > 0
- ✅ Mesa destino ≠ mesa origen

## 🐛 Soluciones Comunes

### Error: "No se pudo obtener detalles de la mesa"
**Causa:** La mesa no existe o no tiene sesión activa
**Solución:** El sistema crea automáticamente una nueva sesión

### Items no se actualizan después de agregar
**Causa:** No se está llamando a `cargarDatos()` después de la operación
**Solución:** Verificar que cada handler llame a `cargarDatos()`

### Total no se recalcula
**Causa:** Error en `recalcularTotalVenta()`
**Solución:** Verificar que todos los items tengan valores numéricos válidos

### Transferencia falla
**Causa:** Mesa destino no tiene sesión activa
**Solución:** El servicio crea automáticamente sesión si no existe

## 📈 Mejoras Futuras

### Corto Plazo
- [ ] Integración con catálogo real de productos
- [ ] Búsqueda avanzada de productos (por categoría, tags)
- [ ] Modificadores de producto (extras, quitar ingredientes)
- [ ] Impresión real de tickets y pre-cuentas
- [ ] División de cuenta por comensal

### Mediano Plazo
- [ ] Comentarios del chef en kitchen_ticket_items
- [ ] Tiempos estimados de preparación
- [ ] Notificaciones en tiempo real (Supabase Realtime)
- [ ] Historial de cambios en pedido
- [ ] Propinas sugeridas

### Largo Plazo
- [ ] Sincronización offline
- [ ] App móvil para meseros
- [ ] Integración con sistema de pagos
- [ ] Analytics de productos más vendidos
- [ ] Recomendaciones inteligentes

## 📚 Referencias

- [Documentación Supabase](https://supabase.com/docs)
- [Next.js App Router](https://nextjs.org/docs/app)
- [shadcn/ui](https://ui.shadcn.com)
- [Tailwind CSS](https://tailwindcss.com)

## 🎓 Guía de Desarrollo

### Añadir nueva funcionalidad
1. Definir tipos en `types.ts`
2. Implementar lógica en `pedidosService.ts`
3. Crear componente UI si es necesario
4. Integrar en `page.tsx`
5. Probar flujo completo

### Modificar componente existente
1. Leer componente actual
2. Identificar props y estado
3. Hacer cambios preservando compatibilidad
4. Probar en diferentes temas (dark/light)
5. Verificar responsive design

## ✅ Checklist de Producción

Antes de desplegar:
- [ ] Reemplazar productos mock con consulta real
- [ ] Integrar autenticación real (obtener userId)
- [ ] Configurar precios desde product_prices
- [ ] Implementar impresión de tickets
- [ ] Añadir manejo de errores robusto
- [ ] Optimizar queries (agregar índices)
- [ ] Configurar RLS en Supabase
- [ ] Testing de flujos completos
- [ ] Documentar APIs internas
- [ ] Capacitación a usuarios
