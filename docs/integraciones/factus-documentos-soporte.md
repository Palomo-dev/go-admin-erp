# Documentos Soporte Electrónicos — Integración Factus API v2

> Documentos soporte DIAN para compras a proveedores **no responsables de IVA**.
> Creado: 2026-08-31

## Resumen

Un **Documento Soporte** (DS) es un documento electrónico DIAN que permite al comprador
soportar costos/gastos y deducir IVA cuando el proveedor **no es responsable de IVA**
(régimen simplificado, no residente, etc.). Se genera del lado del comprador y se envía
a la DIAN vía Factus.

**Endpoint Factus:** `POST /v2/support-documents/validate`

## Arquitectura

```
┌──────────────────────┐     ┌───────────────────────┐     ┌─────────────────┐
│  UI Finanzas         │────▶│  API Route Next.js    │────▶│  Factus API v2  │
│  /documentos-soporte │     │  /api/factus/         │     │  DIAN Gateway   │
│                      │     │  support-document     │     │                 │
└──────────────────────┘     └───────────────────────┘     └─────────────────┘
         │                            │                            │
         ▼                            ▼                            ▼
┌──────────────────────┐     ┌───────────────────────┐     ┌─────────────────┐
│  support_documents   │     │  electronic_          │     │  Validación     │
│  invoice_items       │     │  invoicing_jobs       │     │  DIAN (CUFE)    │
└──────────────────────┘     └───────────────────────┘     └─────────────────┘
```

## Base de Datos

### Tabla: `support_documents` (nueva)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID PK | Identificador único |
| `organization_id` | INTEGER | Multi-tenant |
| `branch_id` | INTEGER | Sucursal (opcional) |
| `supplier_id` | INTEGER | FK a suppliers (opcional) |
| `invoice_purchase_id` | UUID | FK a invoice_purchase (opcional) |
| `reference_code` | TEXT | Código único (mapea a Factus `reference_code`) |
| `numbering_range_id` | INTEGER | ID del rango en Factus |
| `number` | TEXT | Número asignado por DIAN |
| `issue_date` | TIMESTAMPTZ | Fecha de emisión |
| `created_time` | TEXT | Hora creación `HH:mm:ss` |
| `observation` | TEXT | Observaciones (máx 500) |
| `payment_details` | JSONB | Array de medios de pago |
| `cash_rounding_amount` | NUMERIC | Redondeo |
| `establishment` | JSONB | Datos del establecimiento |
| `provider` | JSONB | Datos del proveedor (NO cliente) |
| `subtotal` | NUMERIC | Subtotal sin impuestos |
| `tax_total` | NUMERIC | Total IVA |
| `total` | NUMERIC | Total documento |
| `status` | TEXT | `draft\|pending\|processing\|sent\|accepted\|rejected\|failed\|cancelled` |
| `cufe` | VARCHAR | Código Único Factura Electrónica |
| `qr_code` | TEXT | QR de DIAN |
| `validated_at` | TIMESTAMPTZ | Fecha validación DIAN |
| `is_validated` | BOOLEAN | Validado por DIAN |
| `factus_response` | JSONB | Respuesta completa de Factus |
| `error_message` | TEXT | Error si falló |

**RLS:** Habilitada con policies por `organization_id` (select/insert/update/delete).

### Tabla: `invoice_items` (modificada)

- **Nueva columna:** `support_document_id UUID` (FK a `support_documents.id`, ON DELETE CASCADE)
- Los items del DS se guardan con `invoice_type='support_document'` y `support_document_id` seteado.
- Reutiliza todos los campos existentes: `code_reference`, `discount_rate`, `unit_measure_id`,
  `standard_code_id`, `is_excluded`, `tribute_id`, `withholding_taxes`, `note`.

### Tabla: `electronic_invoicing_jobs` (modificada)

- `invoice_id` ahora es **nullable** (los DS no tienen `invoice_sales`).
- **Nueva columna:** `support_document_id UUID` (FK a `support_documents.id`).
- `document_type='support_document'` ya estaba soportado en el check constraint.

## Archivos Clave

### Backend
- `src/lib/services/factusService.ts` — Métodos: `createSupportDocument`, `getSupportDocumentByReference`, `listSupportDocuments`, `deleteSupportDocument`, `downloadSupportDocumentPDF`, `downloadSupportDocumentXML`
- `src/lib/services/factusTokenManager.ts` — Gestión de token (compartido con facturación)
- `src/app/api/factus/support-document/route.ts` — POST (crear/enviar), GET (listar/consultar), DELETE (eliminar no validado)
- `src/app/api/factus/support-document/download/route.ts` — GET (descargar PDF/XML)

### UI
- `src/components/finanzas/documentos-soporte/` — Componentes:
  - `SupportDocumentsPage.tsx` — Lista con stats, filtros y paginación
  - `SupportDocumentsTable.tsx` — Tabla de documentos
  - `SupportDocumentForm.tsx` — Formulario de creación con items y totales
  - `SupportDocumentDetail.tsx` — Vista de detalle con items, totales y acciones
  - `ProviderSelector.tsx` — Selector de proveedor (desde `suppliers` + ingreso manual)
  - `SendSupportDocumentButton.tsx` — Botón reutilizable para enviar a DIAN
  - `index.ts` — Barrel export

### Páginas
- `/app/finanzas/documentos-soporte` — Lista
- `/app/finanzas/documentos-soporte/nuevo` — Crear nuevo
- `/app/finanzas/documentos-soporte/[id]` — Detalle

### Navegación
- `src/lib/config/modulePages.ts` — Registrado en `finance`
- `src/components/app-layout/Sidebar/SidebarNavigation.tsx` — Item en sidebar
- `src/components/app-layout/AppLayout.tsx` — Item en layout

## Mapeo de Datos: GO Admin → Factus

### Documento Soporte

| Campo GO Admin | Campo Factus | Notas |
|----------------|--------------|-------|
| `reference_code` | `reference_code` | Código único autogenerado `DS-YYYYMMDD-XXXX` |
| `numbering_range_id` | `numbering_range_id` | De `invoice_sequences` donde `document_type='support_document'` |
| `created_time` | `created_time` | `HH:mm:ss` |
| `observation` | `observation` | Máx 500 caracteres |
| `payment_details` | `payment_details` | Array de medios de pago |
| `cash_rounding_amount` | `cash_rounding_amount` | Default `0.00` |
| `establishment` | `establishment` | Datos sucursal u organización |
| `provider` | `provider` | Datos del proveedor (NO cliente) |

### Proveedor (provider)

| Campo | Tipo | Requerido | Notas |
|-------|------|-----------|-------|
| `identification_document_code` | string | Sí | `31`=NIT, `13`=CC, etc. |
| `identification` | string | Sí | Número de identificación |
| `dv` | string | No | Dígito verificación (auto-calculado si se omite) |
| `trade_name` | string | No | Nombre comercial |
| `names` | string | Sí | Nombre/razón social |
| `address` | string | Sí | Dirección |
| `country_code` | string | Sí | Default `CO` |
| `municipality_code` | string | No | Código municipio DIAN |
| `email` | string | No | Email proveedor |
| `phone` | string | No | Teléfono proveedor |
| `legal_organization_code` | string | No | `1`=Jurídica, `2`=Natural |

### Items

| Campo | Tipo | Requerido | Notas |
|-------|------|-----------|-------|
| `code_reference` | string | Sí | Código interno del producto |
| `name` | string | Sí | Descripción (máx 250) |
| `quantity` | string | Sí | Cantidad (máx 2 decimales) |
| `discount_rate` | string | No | % descuento |
| `price` | string | Sí | Precio unitario neto |
| `unit_measure_code` | string | Sí | `94`=Unidad, etc. |
| `standard_code` | string | Sí | `999` default |
| `taxes[].code` | string | Sí | Siempre `01` (IVA) |
| `taxes[].rate` | string | Sí | `0`, `5`, `19` |
| `taxes[].is_excluded` | boolean | No | Excluido de IVA |
| `withholding_taxes[]` | array | No | Retenciones aplicadas |

## Flujo de Uso

1. **Crear documento soporte** (`/documentos-soporte/nuevo`):
   - Seleccionar proveedor (desde `suppliers` existente o ingreso manual)
   - Agregar items con cantidades, precios e IVA
   - Guardar como borrador o enviar directamente a DIAN

2. **Enviar a DIAN** (desde detalle o desde formulario):
   - Se crea un `electronic_invoicing_job` con `document_type='support_document'`
   - Se mapean los datos al formato Factus v2
   - Se llama a `POST /v2/support-documents/validate`
   - Se actualiza `support_documents` con `cufe`, `number`, `is_validated`
   - Se registra evento en `electronic_invoicing_events`

3. **Descargar PDF/XML** (desde detalle, solo si `status='accepted'`):
   - `GET /v2/support-documents/{number}/download-pdf`
   - `GET /v2/support-documents/{number}/download-xml`

4. **Eliminar documento no validado**:
   - `DELETE /v2/support-documents/{reference_code}`
   - Solo se puede eliminar si `is_validated=false`

## Configuración

### Credenciales (variables de entorno, compartidas con facturación electrónica)

```env
FACTUS_CLIENT_ID=tu_client_id
FACTUS_CLIENT_SECRET=tu_client_secret
FACTUS_USERNAME=tu_usuario
FACTUS_PASSWORD=tu_password
FACTUS_ENVIRONMENT=sandbox  # o production
```

### Rango de numeración

Para documentos soporte se requiere un rango de numeración con `document_type='support_document'`
en la tabla `invoice_sequences`, con `factus_numbering_range_id` configurado al ID del rango
en Factus (filtrar por `filter[document]=24`).

## Diferencias con Facturación Electrónica (Facturas)

| Aspecto | Factura (01) | Documento Soporte |
|---------|--------------|-------------------|
| Quién emite | Vendedor (empresa) | Comprador (empresa) |
| Contraparte | Cliente (`customer`) | Proveedor (`provider`) |
| Tabla BD | `invoice_sales` | `support_documents` |
| Endpoint | `/v2/bills/validate` | `/v2/support-documents/validate` |
| Tipo documento | `01` | `24` (rango numeración) |
| Caso de uso | Venta a cliente | Compra a proveedor no responsable de IVA |
| Notas crédito | Sí (`91`) | Sí (notas de ajuste a DS) |

## Referencias

- [Factus API v2 - Documentos Soporte](https://developers.factus.com.co/documentos-soporte/descripcion-de-campos/)
- [Factus API v2 - Crear y validar DS](https://developers.factus.com.co/documentos-soporte/crear-validar/)
- [Factus API v2 - Rangos para DS](https://developers.factus.com.co/rangos-de-numeracion/facturación/ejemplos/crear-rango-para-documento-soporte/)
