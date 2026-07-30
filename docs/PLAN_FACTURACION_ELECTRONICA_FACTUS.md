# Plan de Implementación - Facturación Electrónica con Factus

## Estado: Análisis Completado

---

## 1. Análisis del Estado Actual

### 1.1 Infraestructura Existente

**Tablas de Supabase (ya creadas):**
- `electronic_invoicing_jobs` - Cola de trabajos con estados, reintentos, CUFE, QR
- `electronic_invoicing_events` - Historial de eventos por job
- `invoice_sales` - Facturas con campos `xml_uuid` (CUFE), `qr_image`, `validated_at`, `reference_code`, `payment_form`, `payment_method_code`, `send_email`, `allowance_charges`, `document_type`
- `invoice_sequences` - Rangos de numeración con `factus_numbering_range_id`
- `invoice_items` - Items con `code_reference`, `unit_measure_id`, `standard_code_id`, `is_excluded`, `tribute_id`, `withholding_taxes`, `discount_rate`, `tax_code`, `tax_rate`, `tax_included`, `note`
- `customers` - Clientes con `identification_type`, `identification_number`, `dv`, `legal_organization_id`, `tribute_id`, `fiscal_municipality_id`, `company_name`, `trade_name`, `first_name`, `last_name`, `address`, `email`, `phone`, `customer_type`
- `municipalities` - Municipios con `code`, `name`, `state_code`, `country_code`
- `branches` - Sucursales con `name`, `address`, `phone`, `email`, `municipality_id`

**Código Existente:**
- `src/lib/services/factusService.ts` - Servicio de integración con Factus (autenticación, crear factura, descargar PDF/XML, rangos, municipios, unidades)
- `src/lib/services/electronicInvoicingService.ts` - Servicio centralizado (cola de jobs, estados, validación, stats)
- `src/app/api/factus/auth/route.ts` - Autenticación con cache de token
- `src/app/api/factus/invoice/route.ts` - Crear/enviar factura a Factus
- `src/app/api/factus/jobs/route.ts` - Listar, reintentar, cancelar jobs
- `src/app/api/factus/download/route.ts` - Descargar PDF/XML
- `src/components/finanzas/facturacion-electronica/` - 8 componentes UI
- `src/app/app/finanzas/facturacion-electronica/page.tsx` - Página de monitoreo

**Puntos de Integración:**
- `NuevaFacturaForm.tsx` - Toggle de FE al crear factura
- `DetalleFactura.tsx` - Botón enviar a Factus + badge de estado
- `PreCuentaDialog.tsx` - Toggle en POS
- `CheckoutDialog.tsx` - Toggle en checkout PMS
- `VentaDetalle.tsx` - Botón enviar + badge en ventas POS

---

### 1.2 PROBLEMA CRÍTICO ENCONTRADO

**El formato de la API en `factusService.ts` está desactualizado.**

La API actual de Factus usa **códigos string** pero el código actual usa **IDs numéricos**:

| Campo | Código Actual (INCORRECTO) | API Factus Actual (CORRECTO) |
|--------|---------------------------|------------------------------|
| Establishment municipality | `municipality_id: number` | `municipality_code: string` |
| Customer identification doc | `identification_document_id: number` | `identification_document_code: string` |
| Customer legal organization | `legal_organization_id: number` | `legal_organization_code: string` |
| Customer tribute | `tribute_id: number` | `tribute_code: string` |
| Customer municipality | `municipality_id: number` | `municipality_code: string` |
| Item unit measure | `unit_measure_id: number` | `unit_measure_code: string` |
| Item standard code | `standard_code_id: number` | `standard_code: string` |
| Item taxes | `tax_rate: string` (campo único) | `taxes: [{code, rate, is_excluded}]` (array) |
| Payment | `payment_form` + `payment_method_code` (top-level) | `payment_details: [{payment_form, payment_method_code, amount, ...}]` (array) |
| Operation type | No existe | `operation_type: string` (default: "10") |
| Currency | No existe | `currency: {code, exchange_rate}` (opcional) |
| Cash rounding | No existe | `cash_rounding_amount: string` (opcional) |

**Consecuencia:** La integración actual NO funcionará con la API de Factus en producción.

---

## 2. Plan por Fases

### FASE 1: Corregir Formato de API de Factus (CRÍTICO)

**Objetivo:** Actualizar `factusService.ts` para usar el formato correcto de la API actual de Factus.

#### 1.1 Actualizar interfaces en `factusService.ts`

**Archivo:** `src/lib/services/factusService.ts`

Cambios en `FactusEstablishment`:
- `municipality_id: number` → `municipality_code: string`

Cambios en `FactusCustomer`:
- `identification_document_id: number` → `identification_document_code: string`
- `legal_organization_id: number` → `legal_organization_code: string`
- `tribute_id: number` → `tribute_code: string`
- `municipality_id: number` → `municipality_code: string`
- Agregar `country_code?: string`

Cambios en `FactusItem`:
- `unit_measure_id: number` → `unit_measure_code: string`
- `standard_code_id: number` → `standard_code: string`
- `tax_rate: string` → Eliminado
- `is_excluded: number` → Eliminado
- `tribute_id: number` → Eliminado
- Agregar `taxes: Array<{code: string; rate: string; is_excluded?: boolean}>`
- Agregar `discount_amount?: string`
- Agregar `note?: string`

Cambios en `FactusInvoiceRequest`:
- `payment_form` → Eliminado del top-level
- `payment_method_code` → Eliminado del top-level
- `payment_due_date` → Eliminado del top-level
- Agregar `payment_details: Array<{payment_form: string; payment_method_code: string; reference_code?: string; amount?: string; due_date?: string}>`
- Agregar `operation_type?: string` (default: "10")
- Agregar `currency?: {code: string; exchange_rate?: string}`
- Agregar `cash_rounding_amount?: string`
- Agregar `created_time?: string`

Cambios en `FactusInvoiceResponse`:
- Actualizar `data` para incluir: `number`, `reference_code`, `is_validated`, `validated_at`, `cufe`, `document_type`, `operation_type`, `payment_details`, `errors`

#### 1.2 Actualizar funciones de mapeo

- `mapIdentificationType` → Devolver código string ("31" para NIT, "13" para CC, etc.) en lugar de ID numérico
- `mapDocumentType` → Sin cambios (ya usa códigos string)
- `mapPaymentMethod` → Sin cambios (ya usa códigos string)
- Agregar `mapLegalOrganization(customerType)` → "1" (empresa) | "2" (persona)
- Agregar `mapTribute(tributeId)` → Mapear ID interno a código Factus
- Agregar `mapUnitMeasure(unitMeasureId)` → Mapear ID interno a código Factus
- Agregar `mapStandardCode(standardCodeId)` → Mapear ID interno a código Factus
- Agregar `mapTaxCode(taxCode)` → Mapear código interno a código DIAN

#### 1.3 Actualizar endpoint `createInvoice`

- URL: `${baseUrl}/v1/bills/validate` (sin cambios)
- Body: Usar nuevo formato con `payment_details`, `taxes` array, códigos string

#### 1.4 Actualizar endpoint de descarga

- PDF: `${baseUrl}/v1/bills/${invoiceNumber}/download-pdf` (verificar URL actual)
- XML: `${baseUrl}/v1/bills/${invoiceNumber}/download-xml` (verificar URL actual)

---

### FASE 2: Corregir API Route de Envío de Factura

**Objetivo:** Actualizar `src/app/api/factus/invoice/route.ts` para mapear correctamente los datos al nuevo formato.

#### 2.1 Actualizar mapeo de establishment

```typescript
establishment: {
  name: branch?.name || org?.name,
  address: branch?.address || org?.address,
  phone_number: branch?.phone || org?.phone,
  email: branch?.email || org?.email,
  municipality_code: branchMunicipalityCode, // string, no number
}
```

#### 2.2 Actualizar mapeo de customer

```typescript
customer: {
  identification_document_code: mapIdentificationType(customer.identification_type), // string
  identification: customer.identification_number,
  dv: customer.dv?.toString(),
  company: customer.company_name || '',
  trade_name: customer.trade_name || '',
  names: `${customer.first_name} ${customer.last_name}`.trim(),
  address: customer.address || '',
  email: customer.email || '',
  phone: customer.phone || '',
  legal_organization_code: mapLegalOrganization(customer.customer_type), // string
  tribute_code: mapTribute(customer.tribute_id), // string
  country_code: 'CO',
  municipality_code: customerMunicipalityCode, // string
}
```

#### 2.3 Actualizar mapeo de items

```typescript
items: items.map(item => ({
  code_reference: item.code_reference || item.product_id?.toString(),
  name: item.description,
  quantity: item.qty.toString(),
  discount_rate: (item.discount_rate || 0).toFixed(2),
  discount_amount: (item.discount_amount || 0).toFixed(2),
  price: item.unit_price.toFixed(2),
  unit_measure_code: mapUnitMeasure(item.unit_measure_id), // string
  standard_code: mapStandardCode(item.standard_code_id), // string
  taxes: [{
    code: mapTaxCode(item.tax_code),
    rate: (item.tax_rate || 0).toFixed(2),
    is_excluded: item.is_excluded === 1,
  }],
  withholding_taxes: item.withholding_taxes || [],
  note: item.note || '',
}))
```

#### 2.4 Actualizar payment_details

```typescript
payment_details: [{
  payment_form: invoice.payment_form || '1',
  payment_method_code: invoice.payment_method_code || '10',
  due_date: invoice.due_date?.split('T')[0],
  amount: invoice.total?.toFixed(2),
}]
```

#### 2.5 Agregar campos nuevos

```typescript
operation_type: '10',
cash_rounding_amount: '0.00',
```

#### 2.6 Actualizar manejo de respuesta

La respuesta de Factus ahora incluye:
- `data.number` (string) - Número de factura asignado por Factus
- `data.cufe` (string) - CUFE
- `data.is_validated` (boolean)
- `data.validated_at` (string | null)
- `data.errors` (object) - Errores de validación DIAN

Actualizar el guardado en `invoice_sales`:
- Guardar `number` de Factus en campo apropiado
- Guardar `cufe` en `xml_uuid`
- Guardar `validated_at` si viene en la respuesta

---

### FASE 3: Mejorar Gestión de Tokens

**Objetivo:** Centralizar y robustecer el manejo de tokens de Factus.

#### 3.1 Crear helper centralizado de token

**Archivo nuevo:** `src/lib/services/factusTokenManager.ts`

- Extraer la lógica de cache de token de las 3 routes que la duplican (`auth`, `invoice`, `download`)
- Implementar refresh automático cuando el token esté por expirar (< 60 segundos)
- Manejar errores de autenticación con reintentos
- Función `getValidToken()` compartida por todas las routes

#### 3.2 Actualizar routes para usar el token manager

- `src/app/api/factus/invoice/route.ts` - Usar token manager
- `src/app/api/factus/download/route.ts` - Usar token manager
- `src/app/api/factus/auth/route.ts` - Usar token manager
- Futuras routes (events, credit notes, etc.) - Usar token manager

---

### FASE 4: Implementar Notas Crédito y Débito

**Objetivo:** Soportar creación de notas crédito y débito a través de Factus.

#### 4.1 Extender `factusService.ts`

- Agregar función `createCreditNote(environment, token, data)` → POST `/v1/credit-notes/validate`
- Agregar función `createDebitNote(environment, token, data)` → POST `/v1/debit-notes/validate`
- Agregar interfaces `FactusCreditNoteRequest`, `FactusDebitNoteRequest`
- Ambas requieren `reference_code` de la factura original

#### 4.2 Extender API routes

**Archivo nuevo:** `src/app/api/factus/credit-note/route.ts`
- POST: Recibe `invoiceId`, `organizationId`, `creditNoteData`
- Crea job con `document_type: 'credit_note'`
- Envía a Factus

**Archivo nuevo:** `src/app/api/factus/debit-note/route.ts`
- POST: Recibe `invoiceId`, `organizationId`, `debitNoteData`
- Crea job con `document_type: 'debit_note'`
- Envía a Factus

#### 4.3 Extender `electronicInvoicingService.ts`

- Agregar `sendCreditNote(invoiceId, orgId, creditNoteData)`
- Agregar `sendDebitNote(invoiceId, orgId, debitNoteData)`

---

### FASE 5: Implementar Webhooks de Eventos DIAN

**Objetivo:** Recibir notificaciones de DIAN sobre cambios de estado.

#### 5.1 Crear API route de webhook

**Archivo nuevo:** `src/app/api/factus/webhook/route.ts`
- POST: Recibe eventos de Factus/DIAN
- Tipos de eventos: `accepted`, `rejected`, `validated`, `cancelled`
- Actualiza el job correspondiente en `electronic_invoicing_jobs`
- Registra evento en `electronic_invoicing_events`
- Verifica firma/origen del webhook (seguridad)

#### 5.2 Actualizar estados de jobs

- Cuando DIAN acepta: `status = 'accepted'`, guardar CUFE y QR
- Cuando DIAN rechaza: `status = 'rejected'`, guardar `error_code` y `error_message`
- Cuando hay validación: `status = 'sent'` → esperar respuesta DIAN

---

### FASE 6: Implementar Procesamiento Automático de Jobs

**Objetivo:** Procesar jobs pendientes automáticamente con reintentos.

#### 6.1 Crear API route de procesamiento

**Archivo nuevo:** `src/app/api/factus/process-pending/route.ts`
- POST: Procesa jobs en estado `pending` o `failed` (con reintentos disponibles)
- Verifica `next_retry_at` para respetar backoff
- Ejecuta envío a Factus
- Actualiza estado del job

#### 6.2 Implementar lógica de reintentos

- Backoff exponencial: 5min, 15min, 30min, 1h, 2h
- Máximo 5 intentos (configurable en `max_attempts`)
- Después de max_attempts: status = 'failed' permanentemente

#### 6.3 Configurar cron job (opcional)

- Usar Vercel Cron Jobs o Supabase Edge Functions
- Ejecutar cada 5 minutos
- Llamar a `/api/factus/process-pending`

---

### FASE 7: Mejorar UI de Configuración

**Objetivo:** Permitir configurar credenciales de Factus por organización.

#### 7.1 Crear tabla de configuración

**Migración Supabase:**

```sql
CREATE TABLE electronic_invoicing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  provider TEXT NOT NULL DEFAULT 'factus',
  environment TEXT NOT NULL DEFAULT 'sandbox', -- sandbox | production
  client_id TEXT,
  client_secret TEXT, -- encriptado
  username TEXT,
  password TEXT, -- encriptado
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, provider)
);
```

#### 7.2 Crear página de configuración

**Archivo nuevo:** `src/app/app/finanzas/facturacion-electronica/configuracion/page.tsx`
- Formulario para ingresar credenciales de Factus
- Selector de ambiente (sandbox/production)
- Test de conexión (llamar a `/api/factus/auth`)
- Visualización de rangos de numeración disponibles
- Botón para sincronizar rangos desde Factus

#### 7.3 Actualizar API routes para usar config de DB

- En lugar de `process.env.FACTUS_*`, leer de `electronic_invoicing_config`
- Mantener env vars como fallback para desarrollo

---

### FASE 8: Mejorar UI de Monitoreo

**Objetivo:** Mejorar la experiencia de visualización y gestión de jobs.

#### 8.1 Mejorar `JobsTable`

- Agregar columna de número de factura de Factus
- Agregar columna de fecha de validación
- Agregar indicador visual de reintentos
- Agregar botón de descarga directa (PDF/XML) en fila

#### 8.2 Mejorar `JobDetailDialog`

- Mostrar request_payload formateado (JSON viewer)
- Mostrar response_payload formateado
- Mostrar timeline de eventos del job
- Mostrar CUFE y QR code si disponibles
- Botón de copiar CUFE

#### 8.3 Agregar vista de eventos

**Archivo nuevo:** `src/components/finanzas/facturacion-electronica/JobEventsTimeline.tsx`
- Timeline visual de eventos del job
- Cada evento muestra: tipo, código, mensaje, timestamp
- Codificación por color según tipo de evento

#### 8.4 Agregar filtros avanzados

- Filtro por rango de fechas
- Filtro por número de factura
- Filtro por CUFE
- Exportar resultados a CSV

---

### FASE 9: Integrar Descarga de PDF/XML en Detalle de Factura

**Objetivo:** Permitir descargar documentos desde el detalle de factura.

#### 9.1 Actualizar `DetalleFactura.tsx`

- Agregar botones de descarga PDF/XML cuando la factura tenga CUFE
- Mostrar QR code de DIAN si está disponible
- Mostrar CUFE con botón de copiar
- Mostrar fecha de validación

#### 9.2 Actualizar `VentaDetalle.tsx` (POS)

- Mismos botones de descarga
- Mostrar estado de FE en el recibo

---

### FASE 10: Validación Pre-Envío Mejorada

**Objetivo:** Validar todos los datos antes de enviar a Factus.

#### 10.1 Mejorar `validateInvoiceForEInvoicing`

Validaciones adicionales:
- Cliente: `legal_organization_id`, `tribute_id`, `fiscal_municipality_id`
- Factura: `payment_form`, `payment_method_code`, `reference_code`
- Items: `code_reference`, `unit_measure_id`, `standard_code_id`, `tax_code`
- Organización: `nit`, `dv`, `municipality_id`
- Secuencia: `factus_numbering_range_id` configurado y activo

#### 10.2 Mostrar errores de validación en UI

- Antes de enviar, mostrar dialog con errores faltantes
- Sugerir acciones para corregir cada error
- Bloquear envío hasta que todos los errores se resuelvan

---

## 3. Orden de Ejecución Recomendado

| Prioridad | Fase | Esfuerzo | Dependencias |
|-----------|------|----------|-------------|
| 🔴 CRÍTICA | Fase 1 - Corregir formato API | Medio | Ninguna |
| 🔴 CRÍTICA | Fase 2 - Corregir API route | Medio | Fase 1 |
| 🟡 Alta | Fase 3 - Token manager | Bajo | Fase 1 |
| 🟡 Alta | Fase 10 - Validación mejorada | Bajo | Fase 2 |
| 🟢 Media | Fase 7 - Configuración por org | Medio | Fase 3 |
| 🟢 Media | Fase 8 - UI de monitoreo | Medio | Fase 2 |
| 🟢 Media | Fase 9 - Descarga en detalle | Bajo | Fase 2 |
| 🔵 Baja | Fase 4 - Notas crédito/débito | Alto | Fase 2 |
| 🔵 Baja | Fase 5 - Webhooks | Medio | Fase 2 |
| 🔵 Baja | Fase 6 - Procesamiento automático | Medio | Fase 2 |

---

## 4. Archivos a Modificar/Crear

### Archivos a Modificar

| Archivo | Fase | Cambios |
|---------|------|---------|
| `src/lib/services/factusService.ts` | 1 | Actualizar interfaces y funciones al formato actual de API |
| `src/app/api/factus/invoice/route.ts` | 2 | Actualizar mapeo de datos al nuevo formato |
| `src/app/api/factus/download/route.ts` | 3 | Usar token manager centralizado |
| `src/app/api/factus/auth/route.ts` | 3 | Usar token manager centralizado |
| `src/lib/services/electronicInvoicingService.ts` | 4, 10 | Agregar notas crédito/débito, mejorar validación |
| `src/components/finanzas/facturacion-electronica/JobsTable.tsx` | 8 | Agregar columnas y botones de descarga |
| `src/components/finanzas/facturacion-electronica/JobDetailDialog.tsx` | 8 | Mostrar payloads, timeline, CUFE, QR |
| `src/components/finanzas/facturacion-electronica/JobFilters.tsx` | 8 | Agregar filtros avanzados |
| `src/components/finanzas/facturas-venta/id/DetalleFactura.tsx` | 9 | Botones descarga, QR, CUFE |
| `src/components/pos/ventas/VentaDetalle.tsx` | 9 | Botones descarga en POS |

### Archivos a Crear

| Archivo | Fase | Descripción |
|---------|------|-------------|
| `src/lib/services/factusTokenManager.ts` | 3 | Gestión centralizada de tokens |
| `src/app/api/factus/credit-note/route.ts` | 4 | API route para notas crédito |
| `src/app/api/factus/debit-note/route.ts` | 4 | API route para notas débito |
| `src/app/api/factus/webhook/route.ts` | 5 | Webhook de eventos DIAN |
| `src/app/api/factus/process-pending/route.ts` | 6 | Procesamiento automático de jobs |
| `src/app/app/finanzas/facturacion-electronica/configuracion/page.tsx` | 7 | Página de configuración |
| `src/components/finanzas/facturacion-electronica/JobEventsTimeline.tsx` | 8 | Timeline de eventos |

### Migraciones Supabase

| Migración | Fase | Descripción |
|-----------|------|-------------|
| `electronic_invoicing_config` | 7 | Tabla de configuración por organización |

---

## 5. Mapeo de Códigos DIAN (Referencia)

### Tipos de Documento de Identificación
| Código | Descripción |
|--------|-------------|
| 11 | Registro civil |
| 12 | Tarjeta de identidad |
| 13 | Cédula de ciudadanía |
| 21 | Tarjeta de extranjería |
| 22 | Cédula de extranjería |
| 31 | NIT |
| 41 | Pasaporte |
| 42 | Documento de identificación extranjero |
| 50 | NIT de otro país |
| 91 | NUIP |

### Tipos de Organización
| Código | Descripción |
|--------|-------------|
| 1 | Persona Jurídica |
| 2 | Persona Natural |

### Tributos
| Código | Descripción |
|--------|-------------|
| 01 | IVA |
| ZZ | No responsable de IVA |
| 04 | Consumo |
| 0A | Régimen simple |
| 06 | Renta |
| 07 | ICA |

### Formas de Pago
| Código | Descripción |
|--------|-------------|
| 1 | Contado |
| 2 | Crédito |

### Métodos de Pago (DIAN)
| Código | Descripción |
|--------|-------------|
| 10 | Efectivo |
| 42 | Consignación bancaria |
| 47 | Transferencia |
| 48 | Tarjeta crédito |
| 49 | Tarjeta débito |
| 20 | Cheque |

### Tipos de Impuesto
| Código | Descripción |
|--------|-------------|
| 01 | IVA |
| 04 | INC |
| 06 | IC |
| 07 | ICA |
| 08 | ReteIVA |
| 09 | ReteFuente |
| 10 | ReteICA |

---

## 6. Consideraciones Técnicas

### Seguridad
- Las credenciales de Factus deben almacenarse encriptadas en DB (Fase 7)
- Los webhooks deben verificar firma de origen (Fase 5)
- Los tokens no deben exponerse en el cliente

### Performance
- Cache de token en memoria (ya implementado, mejorar en Fase 3)
- Paginación en lista de jobs (ya implementado)
- Procesamiento async de jobs (Fase 6)

### Manejo de Errores
- Distinguir entre errores técnicos (failed) y rechazos DIAN (rejected)
- Backoff exponencial para reintentos
- Logging completo en `electronic_invoicing_events`

### Multi-organización
- Cada organización tiene su propia configuración (Fase 7)
- Las credenciales pueden ser diferentes por organización
- Soporte para múltiples proveedores (Factus, Carvajal, Siigo, etc.)
