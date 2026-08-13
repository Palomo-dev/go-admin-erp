# Plan de Implementación - Módulo de Cotizaciones

## Objetivo

Crear un módulo completo de cotizaciones profesionales en el módulo de Finanzas, reutilizando componentes del módulo de Facturas de Venta pero con lógica separada. La cotización más completa: imprimir, PDF, email, convertir a factura, duplicar, estados, validez, términos y condiciones.

---

## Arquitectura

### Enfoque híbrido: componentes compartidos + lógica separada

**Componentes reutilizados** (de `facturas-venta/nueva-factura/`):
- `ClienteSelector` — búsqueda/selección de cliente
- `ItemsFactura` — línea de items con productos, qty, precio, descuento
- `ImpuestosFactura` — cálculo de impuestos
- `FormaPagoSelector` — selección de método de pago

**Componentes nuevos** (en `cotizaciones/`):
- Lista, tabla, filtros, header, formulario, detalle, editar, convertir

### Rutas
```
/app/finanzas/cotizaciones/
├── page.tsx              # Lista
├── nuevo/page.tsx        # Crear
├── [id]/page.tsx         # Detalle
└── [id]/editar/page.tsx  # Editar
```

### Estructura de componentes
```
src/components/finanzas/cotizaciones/
├── CotizacionesPage.tsx           # Lista con tabla, filtros, header
├── CotizacionesTable.tsx          # Tabla con columnas específicas
├── CotizacionesFiltros.tsx        # Filtros: búsqueda, estado, fecha
├── PageHeader.tsx                 # Header con botón "Nueva Cotización"
├── nueva-cotizacion/
│   ├── NuevaCotizacionForm.tsx    # Formulario principal
│   └── PageBackHeader.tsx         # Header con botón volver
├── id/
│   ├── DetalleCotizacion.tsx      # Vista detalle con todas las acciones
│   ├── ItemsDetalle.tsx           # Items de la cotización
│   ├── ConvertirFacturaDialog.tsx # Dialog cotización → factura
│   └── CambiarEstadoDialog.tsx    # Dialog para cambiar estado
├── editar/
│   └── EditarCotizacion.tsx       # Editar cotización existente
└── index.ts                       # Exportaciones
```

---

## Base de Datos

### Tabla `quotations`

| Columna | Tipo | Descripción |
|---|---|---|
| id | uuid PK | Identificador único |
| organization_id | int FK | Organización |
| branch_id | int FK | Sucursal |
| number | varchar | Número autoincremental (COT-001) |
| customer_id | uuid FK | Cliente |
| issue_date | date | Fecha de emisión |
| valid_until | date | Fecha de vencimiento de la oferta |
| currency | varchar | Moneda (COP, USD, etc.) |
| subtotal | numeric | Subtotal antes de impuestos |
| tax_total | numeric | Total de impuestos |
| discount_total | numeric | Descuento global |
| total | numeric | Total de la cotización |
| status | varchar | draft, sent, accepted, rejected, expired, converted |
| payment_terms | int | Días de plazo |
| payment_method | varchar | Método de pago |
| notes | text | Notas internas (no visibles en PDF) |
| terms_conditions | text | Términos y condiciones (visible en PDF) |
| salesperson_id | uuid | Vendedor asignado |
| converted_invoice_id | uuid | FK a invoice_sales cuando se convierte |
| created_by | uuid | Usuario que crea |
| created_at | timestamptz | Fecha de creación |
| updated_at | timestamptz | Fecha de actualización |

### Tabla `quotation_items`

| Columna | Tipo | Descripción |
|---|---|---|
| id | uuid PK | Identificador único |
| quotation_id | uuid FK | Cotización |
| product_id | int FK | Producto (opcional) |
| description | text | Descripción de la línea |
| qty | numeric | Cantidad |
| unit_price | numeric | Precio unitario |
| discount_amount | numeric | Descuento por línea |
| tax_code | varchar | Código de impuesto |
| tax_rate | numeric | Tasa de impuesto |
| tax_included | boolean | Impuesto incluido en precio |
| total_line | numeric | Total de la línea |

### RLS + Índices
- RLS habilitado en ambas tablas con aislamiento por organización
- Índices en `organization_id`, `customer_id`, `status`, `number`

---

## Funcionalidades

| Funcionalidad | Descripción |
|---|---|
| Crear cotización | Con cliente, items, impuestos, descuentos, método de pago |
| Número autoincremental | COT-001, COT-002... |
| Validez de oferta | Fecha de vencimiento de la cotización |
| Términos y condiciones | Campo editable que aparece en el PDF |
| Editar | Mientras esté en estado draft o sent |
| Imprimir | Mismo sistema de impresión que facturas |
| Exportar PDF | PDF profesional con datos de la organización |
| Enviar por email | Enviar cotización al cliente |
| Convertir a factura | Un clic → crea invoice_sales con los mismos items |
| Duplicar | Crear nueva cotización desde una existente |
| Estados | Borrador, Enviada, Aceptada, Rechazada, Vencida, Convertida |
| Notas internas | No visibles en el PDF |
| Vendedor | Asignar vendedor a la cotización |
| Multi-moneda | Soporta monedas de la organización |
| Descuentos por línea | Descuento por item + descuento global |
| Impuestos | Mismo sistema que facturas (incluidos o no) |

### Estados y transiciones

```
draft → sent → accepted → converted
                ↓
             rejected
sent → expired (automático por fecha)
draft → draft (editable)
sent → sent (editable)
```

### Lo que NO tiene cotización (vs factura)
- Sin `balance` (no hay pagos)
- Sin facturación electrónica DIAN
- Sin notas crédito
- Sin registrar pagos
- Sin `accounts_receivable`

---

## Fases de Implementación

### Fase 1: Base de Datos
- Crear tabla `quotations` con todas las columnas
- Crear tabla `quotation_items` con todas las columnas
- Habilitar RLS con políticas de aislamiento por organización
- Crear índices para performance
- Crear función de numeración autoincremental

### Fase 2: Servicio
- Crear `src/lib/services/cotizacionesService.ts`
- Métodos: CRUD, listar con filtros, obtener por ID, cambiar estado, convertir a factura, duplicar
- Generación automática de número de cotización
- Cálculo de totales (subtotal, impuestos, descuentos)

### Fase 3: Rutas
- Crear 4 rutas en `/app/finanzas/cotizaciones/`
- Cada ruta importa su componente correspondiente
- Estructura idéntica a facturas-venta

### Fase 4: Componentes de Lista
- `CotizacionesPage` — página principal con header, filtros y tabla
- `CotizacionesTable` — tabla con columnas: número, cliente, fecha, validez, total, estado, acciones
- `CotizacionesFiltros` — filtros por búsqueda, estado, rango de fechas
- `PageHeader` — header con título, contador y botón "Nueva Cotización"

### Fase 5: Formulario de Creación
- `NuevaCotizacionForm` — formulario principal
- Reutiliza `ClienteSelector`, `ItemsFactura`, `ImpuestosFactura`, `FormaPagoSelector`
- Campos adicionales: validez, términos y condiciones, notas internas, vendedor
- Cálculo de totales en tiempo real
- Guardado en BD con generación automática de número

### Fase 6: Vista de Detalle
- `DetalleCotizacion` — vista completa con:
  - Header con número, estado, acciones (imprimir, PDF, email, editar, convertir, duplicar)
  - Información del cliente
  - Items de la cotización
  - Totales (subtotal, descuentos, impuestos, total)
  - Términos y condiciones
  - Notas internas
  - Timeline de cambios de estado
- `ItemsDetalle` — tabla de items (reutiliza estructura de facturas)
- `ConvertirFacturaDialog` — dialog para convertir a factura de venta
- `CambiarEstadoDialog` — dialog para cambiar estado manualmente

### Fase 7: Edición
- `EditarCotizacion` — formulario de edición
- Solo editable si estado es `draft` o `sent`
- Reutiliza misma estructura que `NuevaCotizacionForm` con datos precargados

### Fase 8: Conversión a Factura
- Al convertir: crea `invoice_sales` con los mismos items
- Copia cliente, items, impuestos, método de pago
- Genera número de factura automático
- Marca cotización como `converted` con `converted_invoice_id`
- Redirige al detalle de la factura creada

---

## Integración con PDF

El servicio PDF existente (`pdfService.ts`) se extenderá para soportar cotizaciones:
- Formato profesional con datos de la organización (logo, dirección, teléfono)
- Datos del cliente
- Items con cantidades, precios, descuentos
- Totales con desglose de impuestos
- Términos y condiciones al final
- Fecha de emisión y validez
- Número de cotización destacado

---

## Integración con Impresión

Se reutiliza el sistema de impresión existente (`print-agent`):
- Mismo flujo que facturas: generar HTML → enviar a agente de impresión
- Formato de cotización (no factura)
- Sin datos fiscales (sin NIT, sin resolución DIAN)

---

## Integración con Email

Envío de cotización por email:
- Template HTML profesional
- PDF adjunto
- Asunto personalizable
- Cuerpo del mensaje con resumen
- Enlace directo a la cotización (si el cliente tiene acceso)
