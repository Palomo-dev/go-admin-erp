# Integración Factus - Facturación Electrónica Colombia

## Índice
1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Análisis de Tablas Existentes](#análisis-de-tablas-existentes)
3. [Campos y Tablas Faltantes](#campos-y-tablas-faltantes)
4. [Arquitectura de Integración](#arquitectura-de-integración)
5. [Configuración de Credenciales](#configuración-de-credenciales)
6. [Endpoints de Factus API](#endpoints-de-factus-api)
7. [Mapeo de Datos](#mapeo-de-datos)
8. [Implementación Paso a Paso](#implementación-paso-a-paso)
9. [Tablas de Referencia DIAN](#tablas-de-referencia-dian)
10. [Ejemplos de Código](#ejemplos-de-código)

---

## Resumen Ejecutivo

**Factus** es un proveedor de facturación electrónica autorizado por la DIAN en Colombia. Esta documentación detalla la integración completa con GO Admin ERP.

### URLs de API
| Ambiente | URL Base |
|----------|----------|
| **Sandbox (Pruebas)** | `https://api-sandbox.factus.com.co` |
| **Producción** | `https://api.factus.com.co` |

### Documentos Soportados
- **01** - Factura Electrónica de Venta
- **03** - Instrumento Electrónico de Transmisión
- **91** - Nota Crédito
- **92** - Nota Débito

---

## Análisis de Tablas Existentes

### ✅ Tablas YA Existentes en Supabase

#### 1. `electronic_invoicing_jobs` - Cola de Trabajos
```
✅ id                  UUID PK
✅ organization_id     INTEGER NOT NULL
✅ invoice_id          UUID NOT NULL
✅ document_type       TEXT (invoice, credit_note, debit_note, support_document)
✅ provider            TEXT (carvajal, facturatech, siigo, alegra, world_office)
✅ status              TEXT (pending, processing, sent, accepted, rejected, failed, cancelled)
✅ attempt_count       SMALLINT DEFAULT 0
✅ max_attempts        SMALLINT DEFAULT 5
✅ next_retry_at       TIMESTAMPTZ
✅ request_payload     JSONB
✅ response_payload    JSONB
✅ cufe                VARCHAR(100) - Código Único Factura Electrónica
✅ qr_code             TEXT
✅ error_code          TEXT
✅ error_message       TEXT
✅ processed_at        TIMESTAMPTZ
✅ created_at          TIMESTAMPTZ
✅ updated_at          TIMESTAMPTZ
```

#### 2. `electronic_invoicing_events` - Historial de Eventos
```
✅ id              UUID PK
✅ job_id          UUID FK
✅ event_type      TEXT
✅ event_code      VARCHAR
✅ event_message   TEXT
✅ metadata        JSONB
✅ created_at      TIMESTAMPTZ
```

#### 3. `invoice_sales` - Facturas de Venta
```
✅ id                  UUID PK
✅ organization_id     INTEGER
✅ branch_id           INTEGER
✅ customer_id         UUID
✅ sale_id             UUID
✅ number              TEXT
✅ issue_date          TIMESTAMPTZ
✅ due_date            TIMESTAMPTZ
✅ currency            CHAR(3)
✅ subtotal            NUMERIC
✅ tax_total           NUMERIC
✅ total               NUMERIC
✅ balance             NUMERIC
✅ status              TEXT
✅ xml_uuid            TEXT
✅ notes               TEXT
✅ payment_method      TEXT
✅ tax_included        BOOLEAN
✅ payment_terms       INTEGER
✅ document_type       TEXT
✅ related_invoice_id  UUID (para notas crédito/débito)
```

#### 4. `invoice_sequences` - Rangos de Numeración
```
✅ id                  INTEGER PK
✅ organization_id     INTEGER
✅ branch_id           INTEGER
✅ document_type       TEXT
✅ resolution_number   VARCHAR - Número de resolución DIAN
✅ resolution_date     DATE
✅ prefix              VARCHAR
✅ range_start         INTEGER
✅ range_end           INTEGER
✅ current_number      INTEGER
✅ valid_from          DATE
✅ valid_until         DATE
✅ technical_key       TEXT - Clave técnica DIAN
✅ test_set_id         TEXT
✅ is_active           BOOLEAN
✅ alert_threshold     INTEGER
```

#### 5. `customers` - Clientes
```
✅ id                      UUID PK
✅ organization_id         INTEGER
✅ email                   TEXT
✅ phone                   TEXT
✅ first_name              TEXT
✅ last_name               TEXT
✅ identification_type     TEXT
✅ identification_number   TEXT
✅ address                 TEXT
✅ city                    TEXT
```

#### 6. `organizations` - Organizaciones
```
✅ id              INTEGER PK
✅ name            VARCHAR
✅ legal_name      TEXT
✅ nit             TEXT
✅ tax_id          VARCHAR
✅ email           VARCHAR
✅ phone           VARCHAR
✅ address         TEXT
✅ city            TEXT
✅ country_code    VARCHAR
✅ logo_url        TEXT
```

#### 7. `branches` - Sucursales/Establecimientos
```
✅ id              INTEGER PK
✅ organization_id INTEGER
✅ name            VARCHAR
✅ address         TEXT
✅ city            VARCHAR
✅ phone           VARCHAR
✅ email           VARCHAR
```

#### 8. `invoice_items` - Líneas de Factura
```
✅ id              UUID PK
✅ invoice_id      UUID
✅ product_id      INTEGER
✅ description     TEXT
✅ qty             NUMERIC
✅ unit_price      NUMERIC
✅ tax_code        TEXT
✅ tax_rate        NUMERIC
✅ total_line      NUMERIC
✅ discount_amount NUMERIC
✅ tax_included    BOOLEAN
```

#### 9. `products` - Productos
```
✅ id              INTEGER PK
✅ organization_id INTEGER
✅ sku             TEXT
✅ name            TEXT
✅ unit_code       CHAR
✅ tax_id          INTEGER
✅ barcode         TEXT
```

---

## Campos y Tablas Faltantes

### ❌ Campos FALTANTES en Tablas Existentes

#### 1. Agregar a `customers` (cliente)
```sql
-- Campos requeridos por Factus para el cliente
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dv INTEGER;                        -- Dígito de verificación NIT
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_name TEXT;                 -- Razón social (persona jurídica)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS trade_name TEXT;                   -- Nombre comercial
ALTER TABLE customers ADD COLUMN IF NOT EXISTS legal_organization_id INTEGER;    -- 1=Jurídica, 2=Natural
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tribute_id INTEGER;               -- ID tributo cliente (18, 21, etc.)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS municipality_id INTEGER;          -- ID municipio DIAN
ALTER TABLE customers ADD COLUMN IF NOT EXISTS fiscal_responsibilities TEXT[];   -- Responsabilidades fiscales
```

#### 2. Agregar a `organizations` (empresa emisora)
```sql
-- Campos requeridos por Factus para la empresa
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS dv INTEGER;                   -- Dígito de verificación
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS registration_code TEXT;       -- Código de registro mercantil
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS economic_activity TEXT;       -- Código CIIU
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS municipality_id INTEGER;      -- ID municipio DIAN
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS graphic_representation_name TEXT; -- Nombre en representación gráfica
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS fiscal_responsibilities TEXT[];   -- Responsabilidades fiscales
```

#### 3. Agregar a `branches` (establecimiento)
```sql
-- Campos requeridos por Factus para establecimiento
ALTER TABLE branches ADD COLUMN IF NOT EXISTS municipality_id INTEGER;           -- ID municipio DIAN
```

#### 4. Agregar a `invoice_items` (items de factura)
```sql
-- Campos requeridos por Factus para items
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS code_reference TEXT;          -- Código interno del producto
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2);   -- Porcentaje de descuento
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS unit_measure_id INTEGER;      -- ID unidad de medida DIAN
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS standard_code_id INTEGER DEFAULT 1; -- Estándar de código (1=999)
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS is_excluded INTEGER DEFAULT 0;     -- Excluido de IVA
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tribute_id INTEGER DEFAULT 1;      -- ID tributo (1=IVA)
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS withholding_taxes JSONB;           -- Retenciones aplicadas
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS note TEXT;                         -- Nota del item
```

#### 5. Agregar a `invoice_sales` (factura)
```sql
-- Campos requeridos por Factus
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS reference_code TEXT;          -- Código referencia interno
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS operation_type TEXT DEFAULT '10'; -- Tipo operación (10=Estándar)
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS payment_form TEXT DEFAULT '1';    -- 1=Contado, 2=Crédito
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS payment_method_code TEXT DEFAULT '10'; -- Código método pago DIAN
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS send_email BOOLEAN DEFAULT false; -- Enviar email al cliente
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;     -- Fecha validación DIAN
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS qr_image TEXT;                -- QR en base64
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS allowance_charges JSONB;      -- Cargos/descuentos globales
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS billing_period JSONB;         -- Período de facturación
```

#### 6. Agregar a `invoice_sequences` (rangos)
```sql
-- Campo faltante para Factus
ALTER TABLE invoice_sequences ADD COLUMN IF NOT EXISTS factus_numbering_range_id INTEGER; -- ID del rango en Factus
```

#### 7. Agregar a `electronic_invoicing_jobs`
```sql
-- Agregar 'factus' como proveedor válido
ALTER TABLE electronic_invoicing_jobs 
DROP CONSTRAINT IF EXISTS electronic_invoicing_jobs_provider_check;

ALTER TABLE electronic_invoicing_jobs 
ADD CONSTRAINT electronic_invoicing_jobs_provider_check 
CHECK (provider = ANY (ARRAY['carvajal', 'facturatech', 'siigo', 'alegra', 'world_office', 'factus', 'other']));
```

---

### ❌ Tablas NUEVAS Requeridas

#### 1. `factus_credentials` - Credenciales API Factus
```sql
CREATE TABLE IF NOT EXISTS factus_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    username TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, environment)
);

-- RLS Policy
ALTER TABLE factus_credentials ENABLE ROW LEVEL SECURITY;
```

#### 2. `dian_municipalities` - Municipios Colombia
```sql
CREATE TABLE IF NOT EXISTS dian_municipalities (
    id INTEGER PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    department_id INTEGER NOT NULL,
    department_code VARCHAR(5) NOT NULL,
    department_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_dian_municipalities_code ON dian_municipalities(code);
CREATE INDEX idx_dian_municipalities_department ON dian_municipalities(department_id);
```

#### 3. `dian_unit_measures` - Unidades de Medida
```sql
CREATE TABLE IF NOT EXISTS dian_unit_measures (
    id INTEGER PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Datos comunes
INSERT INTO dian_unit_measures (id, code, name) VALUES
(70, '94', 'Unidad'),
(71, 'KGM', 'Kilogramo'),
(72, 'LTR', 'Litro'),
(73, 'MTR', 'Metro'),
(74, 'H87', 'Pieza'),
(75, 'SET', 'Conjunto'),
(76, 'PR', 'Par'),
(77, 'DZN', 'Docena'),
(78, 'BX', 'Caja'),
(79, 'HUR', 'Hora')
ON CONFLICT (id) DO NOTHING;
```

#### 4. `dian_tributes` - Tributos DIAN
```sql
CREATE TABLE IF NOT EXISTS dian_tributes (
    id INTEGER PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK (type IN ('product', 'customer', 'withholding')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tributos de productos
INSERT INTO dian_tributes (id, code, name, type) VALUES
(1, '01', 'IVA', 'product'),
(2, '02', 'Impuesto al Consumo', 'product'),
(3, '03', 'ICA', 'product'),
(4, '04', 'INC', 'product'),
(5, '05', 'ReteIVA', 'withholding'),
(6, '06', 'ReteRenta', 'withholding'),
(7, '07', 'ReteICA', 'withholding')
ON CONFLICT (id) DO NOTHING;

-- Tributos de clientes
INSERT INTO dian_tributes (id, code, name, type) VALUES
(18, '01', 'IVA', 'customer'),
(21, 'ZZ', 'No aplica', 'customer'),
(22, 'ZA', 'IVA e INC', 'customer')
ON CONFLICT (id) DO NOTHING;
```

#### 5. `dian_identification_types` - Tipos de Documento
```sql
CREATE TABLE IF NOT EXISTS dian_identification_types (
    id INTEGER PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO dian_identification_types (id, code, name) VALUES
(1, '11', 'Registro civil'),
(2, '12', 'Tarjeta de identidad'),
(3, '13', 'Cédula de ciudadanía'),
(4, '21', 'Tarjeta de extranjería'),
(5, '22', 'Cédula de extranjería'),
(6, '31', 'NIT'),
(7, '41', 'Pasaporte'),
(8, '42', 'Documento de identificación extranjero'),
(9, '47', 'PEP'),
(10, '50', 'NIT de otro país'),
(11, '91', 'NUIP')
ON CONFLICT (id) DO NOTHING;
```

#### 6. `dian_payment_methods` - Métodos de Pago DIAN
```sql
CREATE TABLE IF NOT EXISTS dian_payment_methods (
    id INTEGER PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO dian_payment_methods (id, code, name) VALUES
(1, '10', 'Efectivo'),
(2, '42', 'Consignación bancaria'),
(3, '20', 'Cheque'),
(4, '47', 'Transferencia débito bancaria'),
(5, '71', 'Bonos'),
(6, '72', 'Vales'),
(7, '1', 'Instrumento no definido'),
(8, '49', 'Tarjeta débito'),
(9, '48', 'Tarjeta crédito'),
(10, 'ZZZ', 'Otro')
ON CONFLICT (id) DO NOTHING;
```

---

## Arquitectura de Integración

### Diagrama de Flujo
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   GO Admin ERP  │────▶│  Factus Service  │────▶│   Factus API    │
│  (Frontend/API) │     │   (Next.js API)  │     │  (DIAN Gateway) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                        │
         │                       │                        │
         ▼                       ▼                        ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  invoice_sales  │     │ electronic_      │     │     DIAN        │
│  invoice_items  │     │ invoicing_jobs   │     │  (Validación)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Componentes a Crear

```
src/
├── lib/
│   └── services/
│       └── factusService.ts          # Servicio principal Factus
│
├── app/
│   └── api/
│       └── factus/
│           ├── auth/
│           │   └── route.ts          # Autenticación OAuth
│           ├── invoice/
│           │   ├── route.ts          # Crear factura
│           │   └── [id]/
│           │       └── route.ts      # Consultar/Descargar
│           ├── credit-note/
│           │   └── route.ts          # Crear nota crédito
│           ├── numbering-ranges/
│           │   └── route.ts          # Obtener rangos
│           └── reference-tables/
│               └── route.ts          # Municipios, tributos, etc.
│
└── components/
    └── finanzas/
        └── facturacion-electronica/
            ├── FactusConfigForm.tsx  # Configuración credenciales
            ├── InvoiceStatusBadge.tsx # Estado factura electrónica
            └── FactusLogs.tsx        # Historial de envíos
```

---

## Configuración de Credenciales

### Paso 1: Obtener Credenciales de Factus

1. Registrarse en [https://factus.com.co](https://factus.com.co)
2. Solicitar credenciales de API (sandbox primero)
3. Obtener:
   - `client_id`
   - `client_secret`
   - `username`
   - `password`

### Paso 2: Almacenar Credenciales de Forma Segura

```typescript
// Ejemplo: Guardar credenciales encriptadas
import { createClient } from '@supabase/supabase-js';

async function saveFactusCredentials(
  organizationId: number,
  credentials: {
    environment: 'sandbox' | 'production';
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
  }
) {
  const supabase = createClient(/* ... */);
  
  // En producción, encriptar password antes de guardar
  const { data, error } = await supabase
    .from('factus_credentials')
    .upsert({
      organization_id: organizationId,
      environment: credentials.environment,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      username: credentials.username,
      password_encrypted: credentials.password, // TODO: Encriptar
      is_active: true,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'organization_id,environment'
    });
    
  return { data, error };
}
```

---

## Endpoints de Factus API

### 1. Autenticación
```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=password
client_id={client_id}
client_secret={client_secret}
username={username}
password={password}
```

**Respuesta:**
```json
{
  "token_type": "Bearer",
  "expires_in": 600,
  "access_token": "eyJ...",
  "refresh_token": "def..."
}
```

### 2. Crear Factura
```
POST /v1/bills/validate
Authorization: Bearer {access_token}
Content-Type: application/json
Accept: application/json
```

### 3. Consultar Factura
```
GET /v1/bills/{reference_code}/show-by-reference-code
Authorization: Bearer {access_token}
```

### 4. Descargar PDF
```
GET /v1/bills/{number}/download-pdf
Authorization: Bearer {access_token}
```

### 5. Descargar XML
```
GET /v1/bills/{number}/download-xml
Authorization: Bearer {access_token}
```

### 6. Obtener Rangos de Numeración
```
GET /v1/numbering-ranges
Authorization: Bearer {access_token}
```

### 7. Obtener Municipios
```
GET /v1/municipalities
Authorization: Bearer {access_token}
```

### 8. Obtener Unidades de Medida
```
GET /v1/measurement-units
Authorization: Bearer {access_token}
```

---

## Mapeo de Datos

### GO Admin ERP → Factus API

#### Factura (invoice_sales → Factus Bill)
| Campo GO Admin | Campo Factus | Descripción |
|----------------|--------------|-------------|
| `invoice_sequences.factus_numbering_range_id` | `numbering_range_id` | ID del rango en Factus |
| `document_type` | `document` | "01" factura, "91" NC |
| `reference_code` | `reference_code` | Código único interno |
| `notes` | `observation` | Observaciones |
| `payment_form` | `payment_form` | "1" contado, "2" crédito |
| `payment_method_code` | `payment_method_code` | Código método pago |
| `due_date` | `payment_due_date` | Fecha vencimiento |
| `send_email` | `send_email` | Enviar email |

#### Cliente (customers → Factus Customer)
| Campo GO Admin | Campo Factus | Descripción |
|----------------|--------------|-------------|
| `identification_type` → mapear | `identification_document_id` | ID tipo documento (ver tabla) |
| `identification_number` | `identification` | Número de documento |
| `dv` | `dv` | Dígito verificación |
| `company_name` | `company` | Razón social |
| `trade_name` | `trade_name` | Nombre comercial |
| `first_name + last_name` | `names` | Nombres (persona natural) |
| `address` | `address` | Dirección |
| `email` | `email` | Email |
| `phone` | `phone` | Teléfono |
| `legal_organization_id` | `legal_organization_id` | 1=Jurídica, 2=Natural |
| `tribute_id` | `tribute_id` | ID tributo |
| `municipality_id` | `municipality_id` | ID municipio |

#### Items (invoice_items → Factus Items)
| Campo GO Admin | Campo Factus | Descripción |
|----------------|--------------|-------------|
| `code_reference` o `products.sku` | `code_reference` | Código producto |
| `description` | `name` | Nombre/descripción |
| `qty` | `quantity` | Cantidad |
| `discount_rate` | `discount_rate` | % descuento |
| `unit_price` | `price` | Precio unitario |
| `tax_rate` | `tax_rate` | % IVA ("19.00", "5.00", "0.00") |
| `unit_measure_id` | `unit_measure_id` | ID unidad medida |
| `standard_code_id` | `standard_code_id` | 1 = Estándar 999 |
| `is_excluded` | `is_excluded` | 0 o 1 |
| `tribute_id` | `tribute_id` | ID tributo (1=IVA) |
| `withholding_taxes` | `withholding_taxes` | Array retenciones |

#### Establecimiento (branches → Factus Establishment)
| Campo GO Admin | Campo Factus | Descripción |
|----------------|--------------|-------------|
| `name` | `name` | Nombre establecimiento |
| `address` | `address` | Dirección |
| `phone` | `phone_number` | Teléfono |
| `email` | `email` | Email |
| `municipality_id` | `municipality_id` | ID municipio |

---

## Implementación Paso a Paso

### Paso 1: Ejecutar Migraciones SQL

```sql
-- Archivo: supabase/migrations/XXXXXX_factus_integration.sql

-- 1. Agregar proveedor factus
ALTER TABLE electronic_invoicing_jobs 
DROP CONSTRAINT IF EXISTS electronic_invoicing_jobs_provider_check;

ALTER TABLE electronic_invoicing_jobs 
ADD CONSTRAINT electronic_invoicing_jobs_provider_check 
CHECK (provider = ANY (ARRAY['carvajal', 'facturatech', 'siigo', 'alegra', 'world_office', 'factus', 'other']));

-- 2. Campos adicionales en customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS dv INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS trade_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS legal_organization_id INTEGER DEFAULT 2;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tribute_id INTEGER DEFAULT 21;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS municipality_id INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS fiscal_responsibilities TEXT[];

-- 3. Campos adicionales en organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS dv INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS registration_code TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS economic_activity TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS municipality_id INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS graphic_representation_name TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS fiscal_responsibilities TEXT[];

-- 4. Campos adicionales en branches
ALTER TABLE branches ADD COLUMN IF NOT EXISTS municipality_id INTEGER;

-- 5. Campos adicionales en invoice_items
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS code_reference TEXT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS unit_measure_id INTEGER DEFAULT 70;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS standard_code_id INTEGER DEFAULT 1;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS is_excluded INTEGER DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tribute_id INTEGER DEFAULT 1;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS withholding_taxes JSONB DEFAULT '[]';
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS note TEXT;

-- 6. Campos adicionales en invoice_sales
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS reference_code TEXT;
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS operation_type TEXT DEFAULT '10';
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS payment_form TEXT DEFAULT '1';
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS payment_method_code TEXT DEFAULT '10';
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS send_email BOOLEAN DEFAULT false;
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS qr_image TEXT;
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS allowance_charges JSONB DEFAULT '[]';
ALTER TABLE invoice_sales ADD COLUMN IF NOT EXISTS billing_period JSONB;

-- 7. Campo en invoice_sequences
ALTER TABLE invoice_sequences ADD COLUMN IF NOT EXISTS factus_numbering_range_id INTEGER;

-- 8. Crear tabla factus_credentials
CREATE TABLE IF NOT EXISTS factus_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    username TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, environment)
);

ALTER TABLE factus_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizations can manage their factus credentials" ON factus_credentials
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM organization_members 
            WHERE user_id = auth.uid()
        )
    );

-- 9. Crear tablas de referencia DIAN
CREATE TABLE IF NOT EXISTS dian_municipalities (
    id INTEGER PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    department_id INTEGER NOT NULL,
    department_code VARCHAR(5) NOT NULL,
    department_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dian_unit_measures (
    id INTEGER PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dian_tributes (
    id INTEGER PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK (type IN ('product', 'customer', 'withholding')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dian_identification_types (
    id INTEGER PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dian_payment_methods (
    id INTEGER PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_dian_municipalities_code ON dian_municipalities(code);
CREATE INDEX IF NOT EXISTS idx_factus_credentials_org ON factus_credentials(organization_id);
```

### Paso 2: Crear Servicio Factus

```typescript
// src/lib/services/factusService.ts

import { supabase } from '@/lib/supabase/config';

const FACTUS_URLS = {
  sandbox: 'https://api-sandbox.factus.com.co',
  production: 'https://api.factus.com.co',
};

interface FactusCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  environment: 'sandbox' | 'production';
}

interface FactusToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

interface FactusInvoiceRequest {
  document: '01' | '03' | '91' | '92';
  numbering_range_id: number;
  reference_code: string;
  observation?: string;
  payment_form?: '1' | '2';
  payment_method_code: string;
  payment_due_date?: string;
  send_email?: boolean;
  establishment: {
    name: string;
    address: string;
    phone_number: string;
    email: string;
    municipality_id: number;
  };
  customer: {
    identification_document_id: number;
    identification: string;
    dv?: number;
    company?: string;
    trade_name?: string;
    names: string;
    address: string;
    email: string;
    phone: string;
    legal_organization_id: number;
    tribute_id: number;
    municipality_id: number;
  };
  items: Array<{
    code_reference: string;
    name: string;
    quantity: number;
    discount_rate: number;
    price: number;
    tax_rate: string;
    unit_measure_id: number;
    standard_code_id: number;
    is_excluded: number;
    tribute_id: number;
    withholding_taxes?: Array<{
      code: string;
      withholding_tax_rate: number;
    }>;
  }>;
  allowance_charges?: Array<{
    concept_type: string;
    is_surcharge: boolean;
    reason: string;
    base_amount: string;
    amount: string;
  }>;
}

class FactusService {
  private async getCredentials(organizationId: number): Promise<FactusCredentials | null> {
    const { data, error } = await supabase
      .from('factus_credentials')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();

    if (error || !data) return null;

    return {
      clientId: data.client_id,
      clientSecret: data.client_secret,
      username: data.username,
      password: data.password_encrypted, // TODO: Decrypt
      environment: data.environment as 'sandbox' | 'production',
    };
  }

  private getBaseUrl(environment: 'sandbox' | 'production'): string {
    return FACTUS_URLS[environment];
  }

  async authenticate(organizationId: number): Promise<FactusToken> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      throw new Error('No se encontraron credenciales de Factus');
    }

    const baseUrl = this.getBaseUrl(credentials.environment);
    
    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        username: credentials.username,
        password: credentials.password,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Error de autenticación Factus: ${error}`);
    }

    const data = await response.json();
    
    const token: FactusToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };

    // Guardar token en BD
    await supabase
      .from('factus_credentials')
      .update({
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        token_expires_at: token.expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    return token;
  }

  async refreshToken(organizationId: number, refreshToken: string): Promise<FactusToken> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      throw new Error('No se encontraron credenciales de Factus');
    }

    const baseUrl = this.getBaseUrl(credentials.environment);
    
    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      // Si falla refresh, intentar autenticación completa
      return this.authenticate(organizationId);
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  private async getValidToken(organizationId: number): Promise<string> {
    const { data: credentials } = await supabase
      .from('factus_credentials')
      .select('access_token, refresh_token, token_expires_at')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();

    if (!credentials?.access_token) {
      const token = await this.authenticate(organizationId);
      return token.accessToken;
    }

    const expiresAt = new Date(credentials.token_expires_at);
    if (expiresAt <= new Date()) {
      // Token expirado, refrescar
      const token = await this.refreshToken(organizationId, credentials.refresh_token);
      return token.accessToken;
    }

    return credentials.access_token;
  }

  async createInvoice(
    organizationId: number,
    invoiceData: FactusInvoiceRequest
  ): Promise<any> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      throw new Error('No se encontraron credenciales de Factus');
    }

    const token = await this.getValidToken(organizationId);
    const baseUrl = this.getBaseUrl(credentials.environment);

    const response = await fetch(`${baseUrl}/v1/bills/validate`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(invoiceData),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Error al crear factura en Factus');
    }

    return result;
  }

  async getInvoiceByReference(
    organizationId: number,
    referenceCode: string
  ): Promise<any> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      throw new Error('No se encontraron credenciales de Factus');
    }

    const token = await this.getValidToken(organizationId);
    const baseUrl = this.getBaseUrl(credentials.environment);

    const response = await fetch(
      `${baseUrl}/v1/bills/${referenceCode}/show-by-reference-code`,
      {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Error al consultar factura en Factus');
    }

    return response.json();
  }

  async downloadPDF(
    organizationId: number,
    invoiceNumber: string
  ): Promise<Blob> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      throw new Error('No se encontraron credenciales de Factus');
    }

    const token = await this.getValidToken(organizationId);
    const baseUrl = this.getBaseUrl(credentials.environment);

    const response = await fetch(
      `${baseUrl}/v1/bills/${invoiceNumber}/download-pdf`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Error al descargar PDF de Factus');
    }

    return response.blob();
  }

  async downloadXML(
    organizationId: number,
    invoiceNumber: string
  ): Promise<string> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      throw new Error('No se encontraron credenciales de Factus');
    }

    const token = await this.getValidToken(organizationId);
    const baseUrl = this.getBaseUrl(credentials.environment);

    const response = await fetch(
      `${baseUrl}/v1/bills/${invoiceNumber}/download-xml`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Error al descargar XML de Factus');
    }

    return response.text();
  }

  async getNumberingRanges(organizationId: number): Promise<any[]> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      throw new Error('No se encontraron credenciales de Factus');
    }

    const token = await this.getValidToken(organizationId);
    const baseUrl = this.getBaseUrl(credentials.environment);

    const response = await fetch(`${baseUrl}/v1/numbering-ranges`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Error al obtener rangos de numeración');
    }

    const result = await response.json();
    return result.data || [];
  }

  async getMunicipalities(organizationId: number): Promise<any[]> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      throw new Error('No se encontraron credenciales de Factus');
    }

    const token = await this.getValidToken(organizationId);
    const baseUrl = this.getBaseUrl(credentials.environment);

    const response = await fetch(`${baseUrl}/v1/municipalities`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Error al obtener municipios');
    }

    const result = await response.json();
    return result.data || [];
  }

  async getUnitMeasures(organizationId: number): Promise<any[]> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      throw new Error('No se encontraron credenciales de Factus');
    }

    const token = await this.getValidToken(organizationId);
    const baseUrl = this.getBaseUrl(credentials.environment);

    const response = await fetch(`${baseUrl}/v1/measurement-units`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Error al obtener unidades de medida');
    }

    const result = await response.json();
    return result.data || [];
  }
}

export const factusService = new FactusService();
export default factusService;
```

### Paso 3: Crear API Routes

```typescript
// src/app/api/factus/invoice/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import factusService from '@/lib/services/factusService';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId, invoiceId } = body;

    // Obtener datos de la factura
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoice_sales')
      .select(`
        *,
        customer:customers(*),
        items:invoice_items(*),
        branch:branches(*),
        organization:organizations(*)
      `)
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: 'Factura no encontrada' },
        { status: 404 }
      );
    }

    // Obtener rango de numeración con ID de Factus
    const { data: sequence } = await supabase
      .from('invoice_sequences')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('document_type', invoice.document_type || 'invoice')
      .eq('is_active', true)
      .single();

    if (!sequence?.factus_numbering_range_id) {
      return NextResponse.json(
        { error: 'No hay rango de numeración configurado para Factus' },
        { status: 400 }
      );
    }

    // Mapear datos a formato Factus
    const factusRequest = {
      document: invoice.document_type === 'credit_note' ? '91' : '01',
      numbering_range_id: sequence.factus_numbering_range_id,
      reference_code: invoice.reference_code || `INV-${invoice.id}`,
      observation: invoice.notes || '',
      payment_form: invoice.payment_form || '1',
      payment_method_code: invoice.payment_method_code || '10',
      payment_due_date: invoice.due_date?.split('T')[0],
      send_email: invoice.send_email || false,
      establishment: {
        name: invoice.branch?.name || invoice.organization?.name,
        address: invoice.branch?.address || invoice.organization?.address,
        phone_number: invoice.branch?.phone || invoice.organization?.phone,
        email: invoice.branch?.email || invoice.organization?.email,
        municipality_id: invoice.branch?.municipality_id || 980,
      },
      customer: {
        identification_document_id: mapIdentificationType(invoice.customer?.identification_type),
        identification: invoice.customer?.identification_number,
        dv: invoice.customer?.dv,
        company: invoice.customer?.company_name || '',
        trade_name: invoice.customer?.trade_name || '',
        names: `${invoice.customer?.first_name || ''} ${invoice.customer?.last_name || ''}`.trim(),
        address: invoice.customer?.address || '',
        email: invoice.customer?.email || '',
        phone: invoice.customer?.phone || '',
        legal_organization_id: invoice.customer?.legal_organization_id || 2,
        tribute_id: invoice.customer?.tribute_id || 21,
        municipality_id: invoice.customer?.municipality_id || 980,
      },
      items: invoice.items.map((item: any) => ({
        code_reference: item.code_reference || item.product_id?.toString() || '001',
        name: item.description,
        quantity: Number(item.qty),
        discount_rate: Number(item.discount_rate || 0),
        price: Number(item.unit_price),
        tax_rate: (Number(item.tax_rate) || 19).toFixed(2),
        unit_measure_id: item.unit_measure_id || 70,
        standard_code_id: item.standard_code_id || 1,
        is_excluded: item.is_excluded || 0,
        tribute_id: item.tribute_id || 1,
        withholding_taxes: item.withholding_taxes || [],
      })),
      allowance_charges: invoice.allowance_charges || [],
    };

    // Crear job en electronic_invoicing_jobs
    const { data: job, error: jobError } = await supabase
      .from('electronic_invoicing_jobs')
      .insert({
        organization_id: organizationId,
        invoice_id: invoiceId,
        document_type: invoice.document_type || 'invoice',
        provider: 'factus',
        status: 'processing',
        request_payload: factusRequest,
      })
      .select()
      .single();

    if (jobError) {
      return NextResponse.json(
        { error: 'Error creando job de facturación' },
        { status: 500 }
      );
    }

    try {
      // Enviar a Factus
      const result = await factusService.createInvoice(organizationId, factusRequest);

      // Actualizar job con respuesta exitosa
      await supabase
        .from('electronic_invoicing_jobs')
        .update({
          status: 'accepted',
          response_payload: result,
          cufe: result.data?.bill?.cufe,
          qr_code: result.data?.bill?.qr,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      // Actualizar factura con datos de DIAN
      await supabase
        .from('invoice_sales')
        .update({
          xml_uuid: result.data?.bill?.cufe,
          qr_image: result.data?.bill?.qr_image,
          validated_at: new Date().toISOString(),
          status: 'validated',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

      // Registrar evento
      await supabase
        .from('electronic_invoicing_events')
        .insert({
          job_id: job.id,
          event_type: 'validated',
          event_code: '200',
          event_message: result.message,
          metadata: {
            number: result.data?.bill?.number,
            cufe: result.data?.bill?.cufe,
          },
        });

      return NextResponse.json({
        success: true,
        data: result.data,
        jobId: job.id,
      });

    } catch (error: any) {
      // Actualizar job con error
      await supabase
        .from('electronic_invoicing_jobs')
        .update({
          status: 'failed',
          error_message: error.message,
          attempt_count: job.attempt_count + 1,
          next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      // Registrar evento de error
      await supabase
        .from('electronic_invoicing_events')
        .insert({
          job_id: job.id,
          event_type: 'error',
          event_message: error.message,
        });

      return NextResponse.json(
        { error: error.message, jobId: job.id },
        { status: 500 }
      );
    }

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

function mapIdentificationType(type: string | undefined): number {
  const mapping: Record<string, number> = {
    'CC': 3,  // Cédula de ciudadanía
    'NIT': 6, // NIT
    'CE': 5,  // Cédula extranjería
    'TI': 2,  // Tarjeta de identidad
    'PP': 7,  // Pasaporte
    'RC': 1,  // Registro civil
  };
  return mapping[type || 'CC'] || 3;
}
```

---

## Tablas de Referencia DIAN

### Tipos de Documento de Identidad
| ID | Código | Nombre |
|----|--------|--------|
| 1 | 11 | Registro civil |
| 2 | 12 | Tarjeta de identidad |
| 3 | 13 | Cédula de ciudadanía |
| 4 | 21 | Tarjeta de extranjería |
| 5 | 22 | Cédula de extranjería |
| 6 | 31 | NIT |
| 7 | 41 | Pasaporte |
| 8 | 42 | Documento extranjero |
| 9 | 47 | PEP |
| 10 | 50 | NIT otro país |
| 11 | 91 | NUIP |

### Tipos de Organización Legal
| ID | Código | Nombre |
|----|--------|--------|
| 1 | 1 | Persona Jurídica |
| 2 | 2 | Persona Natural |

### Tributos de Cliente
| ID | Código | Nombre |
|----|--------|--------|
| 18 | 01 | IVA |
| 21 | ZZ | No aplica |
| 22 | ZA | IVA e INC |

### Métodos de Pago
| Código | Nombre |
|--------|--------|
| 10 | Efectivo |
| 42 | Consignación bancaria |
| 20 | Cheque |
| 47 | Transferencia débito |
| 48 | Tarjeta crédito |
| 49 | Tarjeta débito |
| 71 | Bonos |
| 72 | Vales |
| ZZZ | Otro |

### Formas de Pago
| Código | Nombre |
|--------|--------|
| 1 | Contado |
| 2 | Crédito |

### Unidades de Medida Comunes
| ID | Código | Nombre |
|----|--------|--------|
| 70 | 94 | Unidad |
| 71 | KGM | Kilogramo |
| 72 | LTR | Litro |
| 73 | MTR | Metro |
| 74 | H87 | Pieza |
| 78 | BX | Caja |
| 79 | HUR | Hora |

---

## Checklist de Implementación

### Base de Datos
- [ ] Ejecutar migración para agregar campos a tablas existentes
- [ ] Crear tabla `factus_credentials`
- [ ] Crear tablas de referencia DIAN (municipios, tributos, etc.)
- [ ] Agregar 'factus' como proveedor válido en constraints

### Backend
- [ ] Crear `factusService.ts`
- [ ] Crear API route `/api/factus/auth`
- [ ] Crear API route `/api/factus/invoice`
- [ ] Crear API route `/api/factus/credit-note`
- [ ] Crear API route `/api/factus/download`
- [ ] Implementar job worker para reintentos

### Frontend
- [ ] Crear formulario de configuración de credenciales Factus
- [ ] Agregar botón "Enviar a DIAN" en detalle de factura
- [ ] Mostrar estado de factura electrónica (badge)
- [ ] Mostrar CUFE y QR en detalle de factura
- [ ] Agregar descargas de PDF/XML

### Sincronización
- [ ] Sincronizar rangos de numeración desde Factus
- [ ] Sincronizar municipios desde Factus (guardar en BD local)
- [ ] Sincronizar unidades de medida

### Testing
- [ ] Probar autenticación en sandbox
- [ ] Probar creación de factura
- [ ] Probar nota crédito
- [ ] Probar descarga de documentos
- [ ] Validar respuestas de error

---

## Referencias

- **Documentación Factus:** https://developers.factus.com.co/
- **Portal DIAN:** https://www.dian.gov.co/facturacion-electronica
- **Resolución DIAN 000042/2020:** Requisitos factura electrónica
- **Anexo Técnico 1.9:** Especificaciones técnicas DIAN

---

## Contacto Soporte Factus

- **Email:** soporte@factus.com.co
- **Web:** https://factus.com.co
- **Documentación API:** https://developers.factus.com.co

---

---

## Configuración de Credenciales

Las credenciales de Factus se configuran **exclusivamente via variables de entorno** para mayor seguridad.

### Desarrollo Local (.env.local)

```bash
# Factus API Credentials
FACTUS_CLIENT_ID=tu_client_id
FACTUS_CLIENT_SECRET=tu_client_secret
FACTUS_USERNAME=tu_username
FACTUS_PASSWORD=tu_password
FACTUS_ENVIRONMENT=sandbox
```

### Producción (Vercel)

Configurar las mismas variables en **Vercel Dashboard → Settings → Environment Variables**:

- `FACTUS_CLIENT_ID`
- `FACTUS_CLIENT_SECRET`
- `FACTUS_USERNAME`
- `FACTUS_PASSWORD`
- `FACTUS_ENVIRONMENT=production`

> **Nota:** Las credenciales NO se almacenan en base de datos por seguridad.

---

## Archivos Creados

### Servicio
- `src/lib/services/factusService.ts` - Servicio principal de integración

### API Routes
- `src/app/api/factus/auth/route.ts` - Autenticación OAuth
- `src/app/api/factus/invoice/route.ts` - Crear/enviar facturas
- `src/app/api/factus/jobs/route.ts` - Gestión de cola de jobs
- `src/app/api/factus/download/route.ts` - Descarga PDF/XML

### Componentes UI
- `src/components/finanzas/facturacion-electronica/JobsTable.tsx`
- `src/components/finanzas/facturacion-electronica/StatsCards.tsx`
- `src/components/finanzas/facturacion-electronica/JobDetailDialog.tsx`
- `src/components/finanzas/facturacion-electronica/FactusConfigDialog.tsx`
- `src/components/finanzas/facturacion-electronica/JobFilters.tsx`

### Página
- `src/app/app/finanzas/facturacion-electronica/page.tsx`

---

*Documento creado: Enero 2026*
*Versión: 1.0*
*GO Admin ERP - Integración Facturación Electrónica Colombia*
