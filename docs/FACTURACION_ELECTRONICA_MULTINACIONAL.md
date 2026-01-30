# Facturación Electrónica Multinacional - GO Admin ERP

## Resumen

GO Admin ERP soporta facturación electrónica para múltiples países. Este documento describe la configuración, requisitos y proveedores por país.

---

## Países Configurados

| Código | País | Moneda | Locale | Región |
|--------|------|--------|--------|--------|
| COL | Colombia | COP | es-CO | South America |
| MEX | México | MXN | es-MX | North America |
| USA | Estados Unidos | USD | en-US | North America |
| ESP | España | EUR | es-ES | Southern Europe |
| CHL | Chile | CLP | es-CL | South America |
| BRA | Brasil | BRL | pt-BR | South America |
| CAN | Canadá | CAD | en-CA | North America |
| GBR | Reino Unido | GBP | en-GB | Northern Europe |
| JPN | Japón | JPY | ja-JP | Eastern Asia |
| AUS | Australia | AUD | en-AU | Oceania |

---

## Impuestos por País (tax_templates)

### 🇨🇴 Colombia (COL)
| Código | Nombre | Tasa | Descripción |
|--------|--------|------|-------------|
| IVA_19 | IVA 19% | 19.00% | Impuesto al Valor Agregado estándar |
| IVA_5 | IVA 5% | 5.00% | IVA reducido |
| IVA_0 | Exento de IVA | 0.00% | Productos y servicios exentos |
| RETE_4 | Retención 4% | 4.00% | Retención en la fuente servicios |
| RETE_11 | Retención 11% | 11.00% | Retención honorarios profesionales |
| ICA_0.966 | ICA Bogotá | 0.97% | Impuesto de Industria y Comercio |

### 🇲🇽 México (MEX)
| Código | Nombre | Tasa | Descripción |
|--------|--------|------|-------------|
| MEX_IVA_16 | IVA 16% | 16.00% | Impuesto al Valor Agregado |
| MEX_IVA_0 | Exento de IVA | 0.00% | Productos exentos |
| MEX_IEPS_8 | IEPS 8% | 8.00% | Impuesto Especial sobre Producción |

### 🇺🇸 Estados Unidos (USA)
| Código | Nombre | Tasa | Descripción |
|--------|--------|------|-------------|
| USA_SALES_TAX_8 | Sales Tax 8% | 8.00% | Impuesto de ventas promedio |
| USA_TAX_EXEMPT | Tax Exempt | 0.00% | Productos exentos |

### 🇪🇸 España (ESP)
| Código | Nombre | Tasa | Descripción |
|--------|--------|------|-------------|
| ESP_IVA_21 | IVA 21% | 21.00% | IVA general |
| ESP_IVA_10 | IVA 10% | 10.00% | IVA reducido |
| ESP_IVA_4 | IVA 4% | 4.00% | IVA superreducido |
| ESP_IVA_0 | Exento de IVA | 0.00% | Productos exentos |

---

## Facturación Electrónica por País

### 🇨🇴 Colombia - DIAN

**Entidad Reguladora:** DIAN (Dirección de Impuestos y Aduanas Nacionales)

**Documentos Electrónicos:**
- Factura Electrónica de Venta
- Nota Crédito
- Nota Débito
- Documento Soporte

**Campos Específicos:**
- `cufe` - Código Único de Factura Electrónica
- `qr_code` - Código QR para validación DIAN

**Proveedores Soportados:**
| Proveedor | Código | Estado |
|-----------|--------|--------|
| Carvajal | `carvajal` | Disponible |
| FacturaTech | `facturatech` | Disponible |
| Siigo | `siigo` | Disponible |
| Alegra | `alegra` | Disponible |
| World Office | `world_office` | Disponible |

**Resolución de Facturación:**
- Prefijo y rango de numeración autorizado por DIAN
- Vigencia de la resolución

---

### 🇲🇽 México - SAT

**Entidad Reguladora:** SAT (Servicio de Administración Tributaria)

**Documentos Electrónicos:**
- CFDI (Comprobante Fiscal Digital por Internet)
- Nota de Crédito
- Nota de Cargo
- Complemento de Pago

**Campos Específicos:**
- `uuid` - Folio fiscal único
- `cadena_original` - Cadena original del timbre
- `sello_cfdi` - Sello digital del CFDI
- `sello_sat` - Sello del SAT

**PAC Recomendados:**
- Facturama
- FacturAPI
- Finkok

---

### 🇪🇸 España - AEAT

**Entidad Reguladora:** AEAT (Agencia Estatal de Administración Tributaria)

**Sistemas:**
- SII (Suministro Inmediato de Información)
- TicketBAI (País Vasco)
- Verifactu (nuevo sistema 2025)

**Documentos Electrónicos:**
- Factura Electrónica (Facturae)
- Factura Simplificada
- Factura Rectificativa

---

### 🇨🇱 Chile - SII

**Entidad Reguladora:** SII (Servicio de Impuestos Internos)

**Documentos Electrónicos:**
- DTE (Documento Tributario Electrónico)
- Factura Electrónica
- Boleta Electrónica
- Nota de Crédito/Débito

---

### 🇧🇷 Brasil - SEFAZ

**Entidad Reguladora:** SEFAZ (Secretaria da Fazenda)

**Documentos Electrónicos:**
- NF-e (Nota Fiscal Eletrônica)
- NFC-e (Nota Fiscal de Consumidor)
- CT-e (Conhecimento de Transporte)

---

## Estructura de Base de Datos

### Tabla: `electronic_invoicing_jobs`

Cola de trabajos para envío de facturas electrónicas.

```sql
id                  UUID PRIMARY KEY
organization_id     INTEGER NOT NULL
invoice_id          UUID NOT NULL
document_type       TEXT -- invoice, credit_note, debit_note, support_document
provider            TEXT -- carvajal, facturatech, siigo, alegra, world_office
status              TEXT -- pending, processing, sent, accepted, rejected, failed, cancelled
attempt_count       SMALLINT DEFAULT 0
max_attempts        SMALLINT DEFAULT 5
next_retry_at       TIMESTAMPTZ
request_payload     JSONB
response_payload    JSONB
cufe                VARCHAR -- Código Único Factura Electrónica (Colombia)
qr_code             TEXT
error_code          TEXT
error_message       TEXT
processed_at        TIMESTAMPTZ
created_at          TIMESTAMPTZ DEFAULT NOW()
updated_at          TIMESTAMPTZ DEFAULT NOW()
```

### Tabla: `electronic_invoicing_events`

Historial de eventos por trabajo de facturación.

```sql
id              UUID PRIMARY KEY
job_id          UUID NOT NULL REFERENCES electronic_invoicing_jobs
event_type      TEXT NOT NULL
event_code      VARCHAR
event_message   TEXT
metadata        JSONB
created_at      TIMESTAMPTZ DEFAULT NOW()
```

---

## Flujo de Facturación Electrónica

```
1. Crear factura en invoice_sales
         ↓
2. Crear job en electronic_invoicing_jobs (status: pending)
         ↓
3. Worker procesa el job
         ↓
4. Enviar a proveedor (provider: carvajal, etc.)
         ↓
5. Recibir respuesta
         ↓
   ├─→ Aceptada: status = 'accepted', guardar cufe/qr_code
   └─→ Rechazada: status = 'rejected', registrar error
         ↓
6. Registrar evento en electronic_invoicing_events
```

---

## Configuración por Organización

Cada organización debe configurar:

1. **País de operación** - `organizations.country_code`
2. **Proveedor de facturación** - Credenciales API
3. **Resolución/Autorización** - Prefijo y rango
4. **Certificado digital** - Para firma electrónica

---

## Estados de Factura Electrónica

| Estado | Descripción |
|--------|-------------|
| `pending` | Pendiente de envío |
| `processing` | En proceso de envío |
| `sent` | Enviada al proveedor |
| `accepted` | Aceptada por entidad tributaria |
| `rejected` | Rechazada - requiere corrección |
| `failed` | Error técnico - reintentar |
| `cancelled` | Anulada |

---

## Próximos Pasos de Implementación

1. [ ] Crear servicio `electronicInvoicingService.ts`
2. [ ] Implementar integración con Carvajal (Colombia)
3. [ ] Crear UI para configuración de facturación electrónica
4. [ ] Implementar worker de procesamiento de jobs
5. [ ] Agregar campos CUFE/QR a detalle de factura
6. [ ] Crear API routes para webhooks de proveedores

---

## Referencias

- **Colombia DIAN:** https://www.dian.gov.co/facturacion-electronica
- **México SAT:** https://www.sat.gob.mx/consultas/35025/formato-de-factura-electronica
- **España AEAT:** https://www.agenciatributaria.es/AEAT/Contenidos_Comunes/La_Agencia_Tributaria/Modelos_y_Formularios/Suministro_Inmediato_Informacion/
- **Chile SII:** https://www.sii.cl/factura_electronica/
- **Brasil SEFAZ:** https://www.nfe.fazenda.gov.br/
