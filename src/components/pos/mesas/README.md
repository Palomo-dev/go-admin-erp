# Sistema de Plano de Mesas - Restaurante

## 📍 Ruta
`/app/pos/mesas`

## 🎯 Descripción
Sistema completo de gestión de mesas para restaurante integrado con el módulo POS. Permite visualizar el estado de las mesas en tiempo real y gestionar operaciones como combinar mesas, mover pedidos y organizar zonas.

## 🏗️ Arquitectura

### Componentes Principales

#### 1. **MesasPage** (`page.tsx`)
Página principal que coordina todos los componentes y funcionalidades.

**Características:**
- Vista en grid responsive de todas las mesas
- Filtrado por zonas
- Estadísticas en tiempo real
- Gestión de estados de modales
- Integración con sistema de notificaciones (toast)

#### 2. **MesaCard** 
Card visual que representa cada mesa con su estado actual.

**Estados Visuales:**
- 🟢 **Libre** - Mesa disponible (verde)
- 🔴 **Ocupada** - Mesa con clientes (rojo)
- ⏳ **Cuenta** - Cliente solicitó la cuenta (naranja)
- 🟡 **Reservada** - Mesa reservada (amarillo)

**Información mostrada:**
- Nombre de la mesa
- Zona asignada
- Capacidad / Ocupación actual
- Tiempo de sesión activa
- Total de la cuenta (si existe)

#### 3. **MesaFormDialog**
Modal para crear y editar mesas.

**Campos:**
- Nombre de mesa (requerido)
- Zona (con opción de crear nueva)
- Capacidad (número de personas)

**Funcionalidades:**
- Validación de campos
- Gestión de zonas dinámicas
- Modo creación y edición

#### 4. **ZonasManager**
Gestión completa de zonas del restaurante.

**Operaciones:**
- Listar todas las zonas
- Renombrar zonas
- Eliminar zonas (las mesas quedan sin zona)

#### 5. **CombinarMesasDialog**
Combina múltiples mesas en una mesa principal.

**Proceso:**
1. Seleccionar mesa principal
2. Seleccionar mesas a combinar
3. Las sesiones se unen en la mesa principal
4. Mesas combinadas quedan libres

**Validaciones:**
- Solo mesas con sesión activa
- Al menos 2 mesas para combinar

#### 6. **MoverPedidoDialog**
Mueve un pedido de una mesa a otra.

**Proceso:**
1. Seleccionar mesa origen (con pedido)
2. Seleccionar mesa destino (libre)
3. La sesión se transfiere
4. Mesa origen queda libre

**Validaciones:**
- Mesa destino debe estar libre
- Solo sesiones activas

### Servicios

#### **MesasService** (`mesasService.ts`)
Servicio que encapsula toda la lógica de negocio y comunicación con Supabase.

**Métodos principales:**

```typescript
// Consultas
obtenerMesasConSesiones(): Promise<TableWithSession[]>
obtenerZonas(): Promise<string[]>

// CRUD Mesas
crearMesa(data: MesaFormData): Promise<RestaurantTable>
actualizarMesa(id: number, data: Partial<MesaFormData>): Promise<RestaurantTable>
eliminarMesa(id: number): Promise<void>
cambiarEstadoMesa(id: number, estado: TableState): Promise<RestaurantTable>

// Gestión Zonas
actualizarZona(zonaAntigua: string, zonaNueva: string): Promise<void>
eliminarZona(zona: string): Promise<void>

// Operaciones Avanzadas
combinarMesas(mesaPrincipalId: number, mesasACombinar: number[]): Promise<void>
dividirMesa(mesaOrigenId: number, mesasDestino: number[], sesionId: number): Promise<void>
moverPedido(sesionId: number, mesaDestinoId: number): Promise<void>
```

## 🗄️ Estructura de Base de Datos

### Tablas Utilizadas

#### `restaurant_tables`
```sql
- id: integer (PK)
- organization_id: integer (FK)
- branch_id: integer (FK)
- name: text
- zone: text (nullable)
- capacity: integer (default: 4)
- state: text (free | occupied | reserved)
- position_x: integer (nullable)
- position_y: integer (nullable)
- created_at: timestamp
- updated_at: timestamp
```

#### `table_sessions`
```sql
- id: integer (PK)
- organization_id: integer (FK)
- restaurant_table_id: integer (FK → restaurant_tables)
- sale_id: uuid (FK → sales)
- opened_at: timestamp
- closed_at: timestamp (nullable)
- server_id: uuid (FK → users)
- customers: integer (default: 1)
- status: text (active | bill_requested | completed)
- notes: text (nullable)
- created_at: timestamp
- updated_at: timestamp
```

#### `kitchen_tickets`
```sql
- id: integer (PK)
- organization_id: integer (FK)
- branch_id: integer (FK)
- table_session_id: integer (FK → table_sessions)
- sale_id: uuid (FK → sales)
- status: text (new | preparing | ready | delivered)
- priority: integer (default: 0)
- estimated_time: integer (nullable)
- printed_at: timestamp (nullable)
- created_at: timestamp
- updated_at: timestamp
```

## 🎨 Temas y Estilos

### Soporte Dark/Light Mode
Todos los componentes están diseñados con soporte completo para tema claro y oscuro usando Tailwind CSS.

**Clases utilizadas:**
```tsx
// Textos
className="text-gray-900 dark:text-gray-100"

// Fondos
className="bg-white dark:bg-gray-800"

// Bordes y estados
className="border-green-500 bg-green-50 dark:bg-green-950/20"
```

### Color Principal: Azul
El sistema utiliza azul como color principal:
```tsx
- text-blue-500
- bg-blue-500
- border-blue-500
- hover:bg-blue-600
```

### Sistema de Badges
Estados visuales con badges de colores:
- **Verde**: Libre, disponible
- **Rojo**: Ocupado, error
- **Naranja**: Cuenta solicitada, advertencia
- **Amarillo**: Reservado, pendiente
- **Azul**: Información general

## 🔄 Flujos de Trabajo

### Flujo 1: Crear Mesa
1. Click en "Nueva Mesa"
2. Completar formulario (nombre, zona, capacidad)
3. Guardar → Mesa creada con estado "libre"

### Flujo 2: Combinar Mesas
1. Click en "Combinar Mesas"
2. Seleccionar mesa principal
3. Seleccionar mesas a combinar
4. Confirmar → Sesiones unidas, mesas secundarias liberadas

### Flujo 3: Mover Pedido
1. Click en "Mover Pedido"
2. Seleccionar mesa origen (con pedido)
3. Seleccionar mesa destino (libre)
4. Confirmar → Pedido transferido, mesa origen liberada

### Flujo 4: Gestionar Zonas
1. Click en "Gestionar Zonas"
2. Ver listado de zonas existentes
3. Editar nombre o eliminar zona
4. Las mesas se actualizan automáticamente

## 📦 Dependencias

### Componentes UI (shadcn/ui)
- Button
- Card
- Dialog
- Select
- Input
- Label
- Badge
- Checkbox
- ScrollArea
- AlertDialog

### Hooks
- `useToast` - Notificaciones
- `useState` - Estado local
- `useEffect` - Efectos

### Utilidades
- `cn` - Combinar clases Tailwind
- `getOrganizationId` - Obtener organización actual
- `getCurrentBranchId` - Obtener sucursal actual

### Iconos (lucide-react)
- Plus, Settings, RefreshCw
- GitMerge, MoveRight, Layers
- Users, Clock, DollarSign

## 🚀 Características Implementadas

✅ Vista en grid responsive
✅ Filtrado por zonas
✅ Estados visuales con colores
✅ Crear, editar, eliminar mesas
✅ Gestionar zonas del restaurante
✅ Combinar múltiples mesas
✅ Mover pedidos entre mesas
✅ Estadísticas en tiempo real
✅ Soporte dark/light mode
✅ Integración completa con Supabase
✅ Multi-tenant (organization y branch)
✅ Validaciones de negocio
✅ Notificaciones toast
✅ Confirmaciones de acciones destructivas

## 🔒 Seguridad

### Multi-tenant
- Todas las consultas filtran por `organization_id`
- Las operaciones respetan el `branch_id` actual
- RLS (Row Level Security) en Supabase

### Validaciones
- No eliminar mesa con sesión activa
- Verificar estado antes de combinar
- Validar disponibilidad antes de mover

## 🧪 Testing

### Casos de Prueba Sugeridos

1. **Crear mesa**
   - Con zona existente
   - Con nueva zona
   - Sin zona

2. **Combinar mesas**
   - 2 mesas con pedidos
   - 3+ mesas con pedidos
   - Validar unión de sesiones

3. **Mover pedido**
   - De mesa ocupada a libre
   - Validar liberación de origen
   - Validar ocupación de destino

4. **Gestionar zonas**
   - Renombrar zona
   - Eliminar zona
   - Verificar actualización en mesas

## 📝 Notas de Desarrollo

### Consideraciones
- El sistema está diseñado para ser extensible
- Los tipos están bien definidos en `types.ts`
- El servicio encapsula toda la lógica de negocio
- Los componentes son reutilizables

### Mejoras Futuras Sugeridas
- [ ] Drag & drop para reordenar mesas visualmente
- [ ] Vista de plano 2D con posiciones X,Y
- [ ] Historial de operaciones
- [ ] Exportar/importar configuración de mesas
- [ ] Notificaciones en tiempo real (Supabase Realtime)
- [ ] Reservas avanzadas con calendario
- [ ] División de cuenta por comensal
- [ ] Integración con sistema de turnos

## 🐛 Solución de Problemas

### Error: "No se pudo obtener el branch_id"
**Solución:** Verificar que el usuario tenga una sucursal asignada en localStorage.

### Error: "No se puede eliminar una mesa con sesión activa"
**Solución:** Primero cerrar o mover la sesión activa, luego eliminar la mesa.

### Las mesas no se actualizan
**Solución:** Click en el botón de refrescar o recargar la página.

## 📚 Referencias

- [Documentación Supabase](https://supabase.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com)
- [Tailwind CSS](https://tailwindcss.com)
- [Lucide Icons](https://lucide.dev)
