# Eventos Personalizados - Go Admin ERP

## 📋 Índice
- [Introducción](#introducción)
- [Conceptos Básicos](#conceptos-básicos)
- [Estructura de un Evento](#estructura-de-un-evento)
- [Cómo Crear un Evento Personalizado](#cómo-crear-un-evento-personalizado)
- [Ejemplos por Módulo](#ejemplos-por-módulo)
- [Validaciones](#validaciones)
- [API Reference](#api-reference)
- [Casos de Uso Comunes](#casos-de-uso-comunes)

---

## 🎯 Introducción

Los **Eventos Personalizados** en Go Admin ERP te permiten crear triggers automatizados para situaciones específicas de tu negocio que no están cubiertas por los eventos del sistema. 

### ¿Cuándo usar eventos personalizados?
- Procesos de negocio únicos de tu organización
- Automatizaciones específicas por industria
- Alertas personalizadas basadas en criterios complejos
- Integraciones con sistemas externos

---

## 🧱 Conceptos Básicos

### Tipos de Eventos
| Tipo | Descripción | Ejemplo |
|------|-------------|---------|
| `system` | Eventos predefinidos del sistema | `usuario.login`, `venta.completada` |
| `business` | Eventos de procesos de negocio | `cliente.vencimiento_contrato` |
| `custom` | Eventos totalmente personalizados | `proceso.auditoria_especial` |

### Categorías por Módulo
- **CRM**: Gestión de clientes y oportunidades
- **Ventas**: Procesos de venta y metas
- **Inventario**: Control de stock y proveedores
- **Finanzas**: Pagos, facturas y créditos
- **RRHH**: Empleados y recursos humanos
- **PMS**: Property Management System (hoteles)
- **Custom**: Eventos completamente personalizados

---

## 🏗️ Estructura de un Evento

### Campos Obligatorios
```typescript
interface CreateCustomEventData {
  code: string;           // Formato: modulo.accion
  name: string;           // Nombre descriptivo
  module: string;         // Módulo al que pertenece
}
```

### Campos Opcionales
```typescript
interface CreateCustomEventData {
  description?: string;                    // Descripción detallada
  category?: 'business' | 'custom';       // Categoría (default: 'custom')
  sample_payload?: Record<string, any>;   // Ejemplo de datos
  is_active?: boolean;                     // Estado (default: true)
}
```

### Estructura Completa del Evento
```typescript
interface CustomEvent {
  id: string;
  organization_id: number;
  code: string;                           // Identificador único
  name: string;                           // Nombre para mostrar
  description?: string;                   // Descripción
  module: string;                         // Módulo
  category: 'system' | 'business' | 'custom';
  sample_payload: Record<string, any>;    // Estructura de datos esperada
  is_active: boolean;                     // Estado activo/inactivo
  created_by?: string;                    // Usuario creador
  created_at: string;                     // Fecha de creación
  updated_at: string;                     // Última actualización
}
```

---

## ⚡ Cómo Crear un Evento Personalizado

### Paso 1: Definir el Código
El código debe seguir el formato: `modulo.accion`

**Reglas:**
- Solo letras minúsculas, números y guiones bajos
- Debe empezar con letra
- Formato: `modulo.accion`

```typescript
// ✅ Correctos
"cliente.vencimiento_contrato"
"producto.stock_bajo"
"empleado.cumpleanos"

// ❌ Incorrectos
"Cliente.Vencimiento"     // Mayúsculas
"cliente-vencimiento"     // Guiones
"vencimiento"             // Sin módulo
```

### Paso 2: Definir el Payload
El payload define qué datos se enviarán cuando se dispare el evento.

```typescript
const samplePayload = {
  cliente_id: "string",
  fecha_vencimiento: "2024-01-15",
  dias_restantes: 30,
  tipo_contrato: "premium",
  valor_contrato: 15000
};
```

### Paso 3: Crear el Evento
```typescript
import { createCustomEvent } from '@/lib/services/customEventsService';

const nuevoEvento = await createCustomEvent(organizationId, {
  code: "cliente.vencimiento_contrato",
  name: "Vencimiento de Contrato de Cliente",
  description: "Se dispara 30 días antes del vencimiento de un contrato",
  module: "crm",
  category: "business",
  sample_payload: {
    cliente_id: "string",
    fecha_vencimiento: "2024-01-15",
    dias_restantes: 30,
    tipo_contrato: "premium",
    valor_contrato: 15000
  },
  is_active: true
});
```

---

## 📚 Ejemplos por Módulo

### 🤝 CRM (Customer Relationship Management)

#### 1. Vencimiento de Contrato
```typescript
{
  code: "cliente.vencimiento_contrato",
  name: "Vencimiento de Contrato",
  description: "Alerta 30 días antes del vencimiento",
  module: "crm",
  category: "business",
  sample_payload: {
    cliente_id: "cli_123",
    nombre_cliente: "Empresa ABC",
    fecha_vencimiento: "2024-02-15",
    dias_restantes: 30,
    tipo_contrato: "premium",
    valor_mensual: 5000
  }
}
```

#### 2. Cumpleaños de Cliente
```typescript
{
  code: "cliente.cumpleanos",
  name: "Cumpleaños de Cliente",
  description: "Recordatorio de cumpleaños para seguimiento personalizado",
  module: "crm",
  category: "business",
  sample_payload: {
    cliente_id: "cli_456",
    nombre: "Juan Pérez",
    fecha_nacimiento: "1985-03-15",
    email: "juan@email.com",
    telefono: "+1234567890",
    segmento: "VIP"
  }
}
```

#### 3. Oportunidad Sin Actividad
```typescript
{
  code: "oportunidad.sin_actividad",
  name: "Oportunidad Sin Actividad",
  description: "Oportunidad sin actividad por más de 7 días",
  module: "crm",
  category: "business",
  sample_payload: {
    oportunidad_id: "opp_789",
    cliente_id: "cli_123",
    valor_estimado: 25000,
    dias_sin_actividad: 10,
    etapa_actual: "negociacion",
    vendedor_asignado: "user_456"
  }
}
```

### 💰 Ventas

#### 1. Meta Alcanzada
```typescript
{
  code: "venta.meta_alcanzada",
  name: "Meta de Ventas Alcanzada",
  description: "Se alcanzó la meta mensual de ventas",
  module: "ventas",
  category: "business",
  sample_payload: {
    vendedor_id: "vend_123",
    mes: "2024-01",
    meta_establecida: 100000,
    ventas_realizadas: 105000,
    porcentaje_cumplimiento: 105,
    comision_ganada: 5250
  }
}
```

#### 2. Promoción Iniciada
```typescript
{
  code: "producto.promocion_iniciada",
  name: "Promoción de Producto Iniciada",
  description: "Nueva promoción disponible para un producto",
  module: "ventas",
  category: "business",
  sample_payload: {
    producto_id: "prod_456",
    nombre_producto: "Laptop Gaming",
    descuento_porcentaje: 15,
    fecha_inicio: "2024-01-15",
    fecha_fin: "2024-01-31",
    stock_disponible: 50
  }
}
```

### 📦 Inventario

#### 1. Producto Próximo a Caducar
```typescript
{
  code: "producto.caducidad_proxima",
  name: "Producto Próximo a Caducar",
  description: "Producto con fecha de caducidad en los próximos 30 días",
  module: "inventario",
  category: "business",
  sample_payload: {
    producto_id: "prod_789",
    nombre_producto: "Medicamento XYZ",
    lote: "LOTE-2024-001",
    fecha_caducidad: "2024-02-15",
    dias_restantes: 25,
    cantidad_stock: 100,
    almacen: "ALM-CENTRAL"
  }
}
```

#### 2. Entrega Retrasada de Proveedor
```typescript
{
  code: "proveedor.entrega_retrasada",
  name: "Entrega Retrasada",
  description: "Proveedor no ha cumplido con fecha de entrega",
  module: "inventario",
  category: "business",
  sample_payload: {
    proveedor_id: "prov_123",
    nombre_proveedor: "Distribuidora ABC",
    orden_compra: "OC-2024-001",
    fecha_entrega_esperada: "2024-01-10",
    dias_retraso: 5,
    productos_pendientes: ["prod_1", "prod_2"],
    valor_orden: 15000
  }
}
```

### 💳 Finanzas

#### 1. Factura Próxima a Vencer
```typescript
{
  code: "factura.vencimiento_30d",
  name: "Factura Vence en 30 Días",
  description: "Factura por cobrar vence en los próximos 30 días",
  module: "finanzas",
  category: "business",
  sample_payload: {
    factura_id: "fact_456",
    cliente_id: "cli_789",
    numero_factura: "F-2024-001",
    monto: 12500,
    fecha_vencimiento: "2024-02-15",
    dias_restantes: 28,
    estado: "pendiente"
  }
}
```

#### 2. Pago Rechazado
```typescript
{
  code: "pago.rechazado",
  name: "Pago Rechazado",
  description: "Pago rechazado por entidad bancaria",
  module: "finanzas",
  category: "business",
  sample_payload: {
    pago_id: "pago_123",
    factura_id: "fact_456",
    monto: 5000,
    metodo_pago: "tarjeta_credito",
    codigo_rechazo: "insufficient_funds",
    fecha_intento: "2024-01-15T10:30:00Z",
    intentos_realizados: 2
  }
}
```

### 👥 RRHH (Recursos Humanos)

#### 1. Cumpleaños de Empleado
```typescript
{
  code: "empleado.cumpleanos",
  name: "Cumpleaños de Empleado",
  description: "Felicitación automática por cumpleaños",
  module: "rrhh",
  category: "business",
  sample_payload: {
    empleado_id: "emp_123",
    nombre_completo: "María García",
    fecha_nacimiento: "1990-03-15",
    departamento: "Ventas",
    anos_cumplidos: 34,
    email_corporativo: "maria.garcia@empresa.com"
  }
}
```

#### 2. Solicitud de Vacaciones Pendiente
```typescript
{
  code: "vacaciones.solicitud_pendiente",
  name: "Solicitud de Vacaciones Pendiente",
  description: "Solicitud de vacaciones requiere aprobación",
  module: "rrhh",
  category: "business",
  sample_payload: {
    solicitud_id: "vac_456",
    empleado_id: "emp_789",
    fecha_inicio: "2024-02-15",
    fecha_fin: "2024-02-25",
    dias_solicitados: 8,
    supervisor_id: "emp_supervisor",
    motivo: "vacaciones_familiares"
  }
}
```

### 🏨 PMS (Property Management System)

#### 1. Check-in Programado para Hoy
```typescript
{
  code: "reserva.check_in_hoy",
  name: "Check-in Programado Hoy",
  description: "Huésped tiene check-in programado para hoy",
  module: "pms",
  category: "business",
  sample_payload: {
    reserva_id: "res_123",
    huesped_id: "guest_456",
    nombre_huesped: "Carlos Rodríguez",
    habitacion_asignada: "101",
    fecha_checkin: "2024-01-15",
    fecha_checkout: "2024-01-20",
    noches: 5,
    tarifa_total: 750
  }
}
```

#### 2. Habitación Requiere Mantenimiento
```typescript
{
  code: "habitacion.mantenimiento",
  name: "Habitación Requiere Mantenimiento",
  description: "Habitación reportada con problema de mantenimiento",
  module: "pms",
  category: "business",
  sample_payload: {
    habitacion_id: "hab_205",
    numero_habitacion: "205",
    tipo_problema: "aire_acondicionado",
    descripcion: "Aire acondicionado no enfría",
    prioridad: "alta",
    reportado_por: "emp_housekeeping",
    fecha_reporte: "2024-01-15T14:30:00Z"
  }
}
```

### 🔧 Custom (Eventos Totalmente Personalizados)

#### 1. Proceso de Auditoria Especial
```typescript
{
  code: "auditoria.proceso_especial",
  name: "Proceso de Auditoría Especial",
  description: "Trigger para procesos de auditoría personalizados",
  module: "custom",
  category: "custom",
  sample_payload: {
    proceso_id: "audit_789",
    tipo_auditoria: "compliance",
    departamento_objetivo: "finanzas",
    auditor_asignado: "emp_auditor",
    fecha_programada: "2024-02-01",
    documentos_requeridos: ["balance", "facturas", "conciliaciones"]
  }
}
```

---

## ✅ Validaciones

### Validación de Código
```typescript
import { validateEventCode } from '@/lib/services/customEventsService';

const resultado = validateEventCode("cliente.vencimiento_contrato");
if (!resultado.isValid) {
  console.error(resultado.error);
}
```

### Reglas de Validación
1. **Formato obligatorio**: `modulo.accion`
2. **Caracteres permitidos**: letras minúsculas, números, guiones bajos
3. **Debe empezar con letra**
4. **Máximo 100 caracteres total**

### Obtener Ejemplos por Módulo
```typescript
import { getEventCodeExamples } from '@/lib/services/customEventsService';

const ejemplosCRM = getEventCodeExamples('crm');
// Retorna: ['cliente.vencimiento_contrato', 'cliente.cumpleanos', 'oportunidad.sin_actividad']
```

---

## 🔌 API Reference

### Crear Evento
```typescript
async function createCustomEvent(
  organizationId: number, 
  eventData: CreateCustomEventData
): Promise<CustomEvent>
```

### Obtener Eventos
```typescript
async function getCustomEvents(
  organizationId: number,
  filter?: CustomEventFilter
): Promise<{ data: CustomEvent[]; count: number }>
```

### Actualizar Evento
```typescript
async function updateCustomEvent(
  eventId: string,
  eventData: Partial<CreateCustomEventData>
): Promise<CustomEvent>
```

### Eliminar Evento
```typescript
async function deleteCustomEvent(eventId: string): Promise<void>
```

### Activar/Desactivar Evento
```typescript
async function toggleCustomEventStatus(
  eventId: string,
  isActive: boolean
): Promise<CustomEvent>
```

---

## 💡 Casos de Uso Comunes

### 1. Automatización de Seguimiento
**Problema**: Los vendedores olvidan hacer seguimiento a clientes.
**Solución**: Evento `cliente.sin_contacto_7d` que dispara recordatorios automáticos.

### 2. Control de Inventario Proactivo
**Problema**: Products se agotan sin previo aviso.
**Solución**: Evento `producto.stock_minimo` para reordenar automáticamente.

### 3. Compliance Automático
**Problema**: Vencimientos legales o contractuales se pasan por alto.
**Solución**: Eventos de vencimiento con escalación automática.

### 4. Experiencia del Cliente
**Problema**: Fechas importantes del cliente se olvidan.
**Solución**: Eventos de cumpleaños, aniversarios y fechas especiales.

---

## 🎯 Mejores Prácticas

1. **Nombres Descriptivos**: Usa nombres claros que expliquen qué hace el evento
2. **Payload Completo**: Incluye todos los datos necesarios para las acciones
3. **Documentación**: Describe claramente cuándo y por qué se dispara
4. **Testing**: Prueba los eventos antes de activarlos en producción
5. **Monitoring**: Revisa regularmente el rendimiento de los eventos

---

## ⚠️ Limitaciones y Consideraciones

- **Máximo 100 eventos personalizados por organización**
- **Payload máximo de 10KB por evento**
- **Los códigos de evento no se pueden cambiar una vez creados**
- **Eliminar un evento elimina todos sus triggers asociados**

---

*Documentación actualizada: Enero 2024 - Go Admin ERP v3.0*
