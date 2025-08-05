# Eventos del Sistema Predeterminados - Go Admin ERP

## 📋 Índice
- [Introducción](#introducción)
- [Eventos por Módulo](#eventos-por-módulo)
- [Detalles de Cada Evento](#detalles-de-cada-evento)
- [Estructura del Payload](#estructura-del-payload)
- [Cómo Usar Estos Eventos](#cómo-usar-estos-eventos)
- [Comparación con Eventos Personalizados](#comparación-con-eventos-personalizados)

---

## 🎯 Introducción

Los **Eventos del Sistema Predeterminados** son eventos automáticos que vienen preconfigurados en Go Admin ERP para todas las organizaciones. Estos eventos se disparan automáticamente cuando ocurren acciones específicas en el sistema y están disponibles inmediatamente para crear triggers y automatizaciones.

### ✅ Características de los Eventos del Sistema
- **Automáticos**: Se disparan sin configuración adicional
- **Universales**: Disponibles para todas las organizaciones
- **Estandarizados**: Estructura y payload consistentes
- **No modificables**: Su definición no se puede cambiar
- **Listos para usar**: Se pueden usar inmediatamente en triggers

---

## 📚 Eventos por Módulo

### 👥 **Users (Gestión de Usuarios)**
| Código | Descripción | Cuándo se Dispara |
|--------|-------------|-------------------|
| `user.login` | Inicio de sesión de usuario | Cada vez que un usuario hace login |
| `user.created` | Nuevo usuario registrado | Cuando se crea un nuevo usuario |

### 💳 **Finance (Finanzas)**
| Código | Descripción | Cuándo se Dispara |
|--------|-------------|-------------------|
| `invoice.created` | Factura creada | Al crear una nueva factura |
| `invoice.paid` | Factura pagada | Cuando se registra el pago de una factura |

### 📦 **Inventory (Inventario)**
| Código | Descripción | Cuándo se Dispara |
|--------|-------------|-------------------|
| `inventory.low_stock` | Producto con stock bajo | Cuando el stock llega al mínimo establecido |

### 🏨 **PMS (Property Management System)**
| Código | Descripción | Cuándo se Dispara |
|--------|-------------|-------------------|
| `reservation.created` | Nueva reservación | Al crear una nueva reserva |

---

## 🔍 Detalles de Cada Evento

### 👤 **user.login**
```json
{
  "code": "user.login",
  "module": "users",
  "description": "Inicio de sesión de usuario",
  "sample_payload": {
    "user_id": "00000000-0000-0000-0000-000000000000",
    "ip_address": "127.0.0.1",
    "device": "Web Browser"
  }
}
```

**Casos de uso:**
- Alertas de seguridad por login desde nuevas ubicaciones
- Registros de auditoría automáticos
- Notificaciones de bienvenida personalizadas
- Control de acceso por horarios

---

### 👤 **user.created**
```json
{
  "code": "user.created",
  "module": "users",
  "description": "Nuevo usuario registrado",
  "sample_payload": {
    "user_id": "00000000-0000-0000-0000-000000000000",
    "name": "Usuario Ejemplo",
    "email": "usuario@ejemplo.com"
  }
}
```

**Casos de uso:**
- Emails de bienvenida automáticos
- Asignación automática de roles
- Notificaciones al equipo de RRHH
- Creación de perfiles en sistemas externos

---

### 💳 **invoice.created**
```json
{
  "code": "invoice.created",
  "module": "finance",
  "description": "Factura creada",
  "sample_payload": {
    "invoice_id": "INV-001",
    "customer_name": "Cliente Ejemplo",
    "total": 150,
    "due_date": "2025-06-30"
  }
}
```

**Casos de uso:**
- Envío automático de facturas por email
- Programación de recordatorios de pago
- Actualización de reportes financieros en tiempo real
- Notificaciones al departamento de cobranzas

---

### 💳 **invoice.paid**
```json
{
  "code": "invoice.paid",
  "module": "finance",
  "description": "Factura pagada",
  "sample_payload": {
    "invoice_id": "INV-001",
    "amount": 150,
    "payment_method": "transfer"
  }
}
```

**Casos de uso:**
- Confirmaciones de pago automáticas
- Actualización de estados contables
- Liberación automática de servicios
- Comisiones automáticas para vendedores

---

### 📦 **inventory.low_stock**
```json
{
  "code": "inventory.low_stock",
  "module": "inventory",
  "description": "Producto con stock bajo",
  "sample_payload": {
    "product_id": 123,
    "product_name": "Producto Ejemplo",
    "current_stock": 5,
    "min_stock": 10
  }
}
```

**Casos de uso:**
- Alertas al equipo de compras
- Reorder automático de productos
- Notificaciones a proveedores
- Alertas de productos críticos

---

### 🏨 **reservation.created**
```json
{
  "code": "reservation.created",
  "module": "pms",
  "description": "Nueva reservación",
  "sample_payload": {
    "reservation_id": "R-12345",
    "guest_name": "Huésped Ejemplo",
    "check_in": "2025-07-01",
    "check_out": "2025-07-05"
  }
}
```

**Casos de uso:**
- Confirmaciones automáticas por email
- Preparación de habitaciones
- Notificaciones al equipo de housekeeping
- Actualización de disponibilidad

---

## 🏗️ Estructura del Payload

Todos los eventos del sistema siguen esta estructura base:

```typescript
interface SystemEvent {
  code: string;           // Identificador único del evento
  module: string;         // Módulo al que pertenece
  description: string;    // Descripción del evento
  sample_payload: Record<string, any>;  // Estructura de datos
  created_at: string;     // Fecha de creación en el catálogo
}
```

### Campos Comunes en Payloads

#### **Identificadores**
- `user_id`: ID del usuario (UUID)
- `invoice_id`: ID de factura (string)
- `product_id`: ID de producto (number)
- `reservation_id`: ID de reservación (string)

#### **Información Contextual**
- `ip_address`: Dirección IP del usuario
- `device`: Dispositivo usado
- `amount`: Monto monetario
- `total`: Total de factura
- `current_stock`: Stock actual
- `min_stock`: Stock mínimo

#### **Fechas**
- `due_date`: Fecha de vencimiento
- `check_in`: Fecha de check-in
- `check_out`: Fecha de check-out

---

## ⚡ Cómo Usar Estos Eventos

### 1. **En Triggers Automáticos**
```typescript
// Ejemplo: Trigger para enviar email cuando se crea factura
{
  event_code: "invoice.created",
  action_type: "email",
  action_config: {
    to: "{{customer_email}}",
    subject: "Nueva factura generada",
    template: "invoice_created"
  }
}
```

### 2. **En Workflows Personalizados**
```typescript
// Ejemplo: Workflow cuando stock está bajo
{
  event_code: "inventory.low_stock",
  conditions: [
    {
      field: "current_stock",
      operator: "<=",
      value: 5
    }
  ],
  actions: [
    {
      type: "create_purchase_order",
      supplier: "default",
      quantity: "{{min_stock * 2}}"
    }
  ]
}
```

### 3. **En Integraciones Externas**
```typescript
// Ejemplo: Webhook a sistema externo
{
  event_code: "user.created",
  action_type: "webhook",
  action_config: {
    url: "https://api.external-system.com/users",
    method: "POST",
    headers: {
      "Authorization": "Bearer {{api_token}}"
    },
    body: {
      "name": "{{name}}",
      "email": "{{email}}",
      "source": "go-admin-erp"
    }
  }
}
```

---

## 🔄 Comparación con Eventos Personalizados

| Aspecto | Eventos del Sistema | Eventos Personalizados |
|---------|-------------------|----------------------|
| **Disponibilidad** | ✅ Inmediata | ⚙️ Requiere creación |
| **Modificación** | ❌ No modificables | ✅ Totalmente editables |
| **Disparo** | 🤖 Automático | 🔧 Manual o programado |
| **Payload** | 🔒 Fijo | 📝 Personalizable |
| **Alcance** | 🌍 Todas las orgs | 🏢 Por organización |
| **Mantenimiento** | 🔄 Automático | 👨‍💻 Manual |

---

## 📈 Roadmap de Eventos Futuros

### 🚀 **Próximos Eventos Planificados**

#### **CRM Module**
- `lead.created` - Nuevo lead registrado
- `opportunity.won` - Oportunidad ganada
- `opportunity.lost` - Oportunidad perdida
- `contact.updated` - Contacto actualizado

#### **Sales Module**
- `sale.completed` - Venta completada
- `quote.created` - Cotización creada
- `quote.accepted` - Cotización aceptada
- `discount.applied` - Descuento aplicado

#### **HR Module**
- `employee.hired` - Empleado contratado
- `employee.terminated` - Empleado terminado
- `timesheet.submitted` - Hoja de tiempo enviada
- `leave.approved` - Permiso aprobado

#### **Inventory Extended**
- `product.created` - Producto creado
- `supplier.delayed` - Proveedor retrasado
- `stocktake.completed` - Inventario completado

#### **Finance Extended**
- `payment.received` - Pago recibido
- `expense.approved` - Gasto aprobado
- `budget.exceeded` - Presupuesto excedido

---

## 💡 Mejores Prácticas

### ✅ **Do's (Recomendado)**
1. **Usar eventos del sistema** siempre que estén disponibles
2. **Combinar** eventos del sistema con personalizados
3. **Monitorear** el rendimiento de los triggers
4. **Documentar** las automatizaciones creadas
5. **Probar** en ambiente de desarrollo primero

### ❌ **Don'ts (Evitar)**
1. **No duplicar** funcionalidad que ya existe
2. **No crear** eventos personalizados para casos cubiertos
3. **No ignorar** los eventos del sistema disponibles
4. **No sobrecargar** con demasiadas automatizaciones
5. **No modificar** payloads esperados

---

## 🔗 Referencias

- **[Eventos Personalizados](./eventos-personalizados.md)** - Cómo crear tus propios eventos
- **[Triggers y Automatizaciones](./triggers-automatizaciones.md)** - Configurar acciones automáticas
- **[API Documentation](./api-eventos.md)** - Referencia técnica completa

---

*Última actualización: Enero 2024 - Go Admin ERP v3.0*
*Eventos activos: 6 | En desarrollo: 15+*
