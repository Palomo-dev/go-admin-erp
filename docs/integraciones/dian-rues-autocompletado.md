# Integración DIAN / RUES - Autocompletado de Clientes y Proveedores

> **Fecha de implementación:** 2026-08-13
> **Módulos afectados:** CRM (clientes), Inventario (proveedores)
> **Proveedores:** Verifik (primario) + CoreSoft (fallback)
> **Proyecto Supabase:** `jgmgphmzusbluqhuqihj`

---

## 1. Objetivo

Permitir que al ingresar un NIT o cédula en el formulario de cliente o proveedor, el sistema consulte automáticamente la DIAN y el RUES (Cámara de Comercio) y autocomplete los datos: razón social, email, teléfono, dirección, responsabilidades fiscales, CIIU, representantes legales, estado, etc.

---

## 2. Contexto y análisis previo

### 2.1 Realidad sobre las APIs oficiales

- **DIAN NO tiene API pública REST** para consulta general de RUT/NIT. Solo hay consulta manual con CAPTCHA en MUISCA, o el servicio SOAP de facturación electrónica (restringido a facturadores autorizados con certificado digital, Resolución 202 de 2025).
- **Cámara de Comercio / RUES NO tiene API pública oficial.** Solo portal web `rues.org.co` (consulta gratuita uno a uno) y portal `entidades.rues.org.co` (con token, para entidades).
- **La única vía viable para automatización son proveedores comerciales** que hacen el scraping/consulta y exponen una API REST.

### 2.2 Proveedores comerciales evaluados (2025-2026)

| Proveedor | DIAN | RUES | Modelo de precio | Notas |
|---|---|---|---|---|
| **Verifik** ✅ | Sí | Sí (básico + completo) | Créditos/SmartCheck | Firma digital en respuestas (auditoría), líder LATAM |
| **CoreSoft** ✅ | Sí | Sí | $49k–$349k COP/mes | Plan único DIAN+RUES+RUNT, sin límite diario |
| Mediavox | Sí | Sí | $49–$199 USD/mes | Multi-país LATAM, hard cap |
| LaFactura.co | Sí | Sí | ~$50 COP/factura | 15+ años, enfoque facturación electrónica |
| Auco | Sí | Sí (con representantes) | Créditos | Incluye validación de proveedores ficticios |
| Apitude | Sí (solo personas) | No | Por uso, asíncrono | Solo personas naturales |
| Dataico | Sí | No | Requiere ser cliente facturación | Proveedor DIAN autorizado |
| Normadata | No (solo formato) | No | Beta | Solo valida dígito verificador |

### 2.3 Decisión: Verifik (primario) + CoreSoft (fallback)

- **Verifik**: firma digital en cada respuesta (auditable, útil para compliance y Habeas Data), API REST moderna, RUES completo con representantes legales.
- **CoreSoft**: alternativa de menor costo si el volumen es bajo-medio (<1.000 consultas/mes): $49.000 COP/mes con plan único.

### 2.4 Estado de la BD antes de la integración

El proyecto **ya contaba** con toda la infraestructura fiscal colombiana en Supabase:

| Tabla | Propósito | Datos |
|---|---|---|
| `dian_identification_types` | Tipos de documento DIAN | `13`=CC, `31`=NIT, `41`=Pasaporte, `91`=NUIP, etc. |
| `dian_fiscal_responsibilities` | Responsabilidades fiscales | `O-13` Gran contribuyente, `O-15` Autorretenedor, `O-23` Agente retención IVA, `O-47` Simple, `O-48` Responsable IVA, `O-49` No responsable IVA, `R-99-PN` No responsable PN |
| `dian_tributes` | Tributos | `01` IVA, `05` ReteIVA, `06` ReteRenta, `07` ReteICA, `ZZ` No aplica |
| `municipalities` | Municipios DIAN | code, name, state_code, state_name, country_code |
| `country_identification_types` | Tipos de doc por país | Mapeo país ↔ código |

Las tablas `customers` y `suppliers` ya tenían los campos fiscales:
- **`customers`**: `doc_type`, `doc_number`, `dv`, `company_name`, `trade_name`, `legal_organization_id`, `tribute_id`, `fiscal_municipality_id`, `fiscal_responsibilities[]`, `customer_type` (person/company), `address`, `city`, `identification_type`, `identification_number`.
- **`suppliers`**: `nit`, `doc_type`, `tax_id`, `tax_regime`, `fiscal_responsibilities[]`, `supplier_type` (person/company), `address`, `city`, `state`, `country`, `bank_name`, `bank_account`.

**Conclusión:** No fue necesario modificar el esquema de `customers`/`suppliers`. Solo se conectó el frontend a una API externa y se mapeó la respuesta a los campos existentes.

---

## 3. Arquitectura implementada

```
src/
├── app/api/dian/lookup/route.ts         ← Endpoint server-side (oculta API keys)
├── lib/services/dianLookupService.ts    ← Lógica de consulta + cache + mapeo
├── lib/utils/nitDv.ts                   ← Validación dígito verificación (módulo 11)
├── components/shared/DianLookupButton.tsx ← Botón reutilizable + checkbox Habeas Data
└── (modificaciones puntuales en ClientForm.tsx y NuevoProveedorForm.tsx)
```

### 3.1 Flujo de consulta

1. Usuario escribe NIT/cédula en el formulario de cliente o proveedor.
2. Marca el checkbox de autorización de tratamiento de datos (Habeas Data, Ley 1581/2012).
3. Al salir del campo (onBlur) o presionar el botón de consulta, se llama a `POST /api/dian/lookup`.
4. La server route valida la sesión, mapea el tipo de documento al código DIAN, valida el DV localmente (módulo 11).
5. El servicio `dianLookupService` verifica el cache en `dian_lookup_cache` (TTL 24h).
6. Si no hay cache, consulta Verifik (primario). Si falla, intenta CoreSoft (fallback).
7. Normaliza la respuesta y la guarda en cache con auditoría (quién consultó, cuándo).
8. El formulario autocompleta los campos con los datos normalizados.
9. Todos los campos quedan editables después del autocompletado.

### 3.2 Seguridad

- Las API keys van en variables de entorno (`VERIFIK_TOKEN`, `CORESOFT_API_KEY`), nunca en el cliente.
- La server route valida la sesión del usuario antes de consultar.
- El cache incluye auditoría: `queried_by` (usuario), `organization_id`, `expires_at`.

---

## 4. Archivos creados

### 4.1 `src/lib/utils/nitDv.ts`

Validación de NIT y dígito de verificación usando módulo 11 (algoritmo DIAN).

**Funciones exportadas:**
- `calcularDv(nitSinDv: string): number | null` — Calcula el DV de un NIT.
- `validarDv(nitCompleto: string): boolean` — Valida que un NIT con DV sea correcto.
- `parsearNit(nitInput: string): { nit: string, dv: string | null }` — Extrae NIT y DV de una cadena.
- `mapearTipoDocADian(tipoDocInterno: string): string` — Mapea tipos internos (`national_id`, `tax_id`) a códigos DIAN (`13`, `31`).

### 4.2 `src/lib/services/dianLookupService.ts`

Servicio de consulta DIAN/RUES con soporte multi-proveedor y cache.

**Funciones exportadas:**
- `consultarDian(req: DianLookupRequest): Promise<DianLookupResponse>` — Consulta principal con cache y fallback.
- `limpiarCacheExpirado(): Promise<number>` — Limpia entradas expiradas del cache (para cron jobs).

**Tipos exportados:**
- `DianLookupRequest` — `{ documentType, documentNumber, dv?, organizationId?, userId? }`
- `DianLookupResponse` — `{ success, provider, fromCache, data, rawResponse?, error? }`
- `DianNormalizedData` — Datos normalizados: `{ name, dv, email, phone, address, city, state, fiscalResponsibilities[], ciiu, rues: {...} }`

**Proveedores soportados:**
- Verifik: `GET https://api.verifik.co/v2/co/company/dian` + `GET https://api.verifik.co/v3/co/rues-complete`
- CoreSoft: `POST https://api.coresoft.co/v1/rut` + `GET https://api.coresoft.co/api/rues`

### 4.3 `src/app/api/dian/lookup/route.ts`

Endpoint server-side que oculta las API keys.

- `POST /api/dian/lookup` — Body: `{ documentType, documentNumber, dv?, organizationId? }`
- `GET /api/dian/lookup?documentType=31&documentNumber=900123456` — Variante GET.

### 4.4 `src/components/shared/DianLookupButton.tsx`

Componentes reutilizables:
- `DianLookupButton` — Botón para consultar DIAN (variantes: `button` | `icon`).
- `HabeasDataCheckbox` — Checkbox de autorización de tratamiento de datos (Ley 1581/2012).

---

## 5. Archivos modificados

### 5.1 `src/components/clientes/new/ClientForm.tsx`

Cambios puntuales:
- Import de `HabeasDataCheckbox` y tipo `DianNormalizedData`.
- Estado `habeasDataAuth` (checkbox opcional) y `consultandoDian` (loading).
- Función `handleDianResult(data)` — autocompleta `companyName`/`firstName`+`lastName`, `dv`, `email`, `phone`, `address`, `city`, `fiscalResponsibilities`.
- Función `consultarDocumento(docNumber?)` — llama a `/api/dian/lookup` y dispara `handleDianResult`.
- Campo `documentNumber` ahora tiene botón de consulta al lado y `onBlur` que dispara la consulta.
- Checkbox de Habeas Data debajo del campo de documento.

### 5.2 `src/components/inventario/proveedores/nuevo/NuevoProveedorForm.tsx`

Cambios puntuales:
- Import de `HabeasDataCheckbox` y tipo `DianNormalizedData`.
- Estado `habeasDataAuth` y `consultandoDian`.
- Función `handleDianResult(data)` — autocompleta `name`, `email`, `phone`, `address`, `city`, `state`, `tax_regime`, `fiscal_responsibilities`.
- Función `consultarDocumento(docNumber?)` — llama a `/api/dian/lookup`.
- Campo `nit` ahora tiene botón de consulta al lado y `onBlur` que dispara la consulta.
- Checkbox de Habeas Data debajo del campo de documento.

### 5.3 `.env.example`

Variables agregadas:
```env
DIAN_PROVIDER=verifik
VERIFIK_TOKEN=your-verifik-bearer-token
CORESOFT_API_KEY=your-coresoft-api-key
```

---

## 6. Migración de base de datos

### Tabla `dian_lookup_cache` (migración `create_dian_lookup_cache`)

Cache de consultas DIAN/RUES con TTL de 24 horas.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid | PK |
| `document_type` | text | Tipo de documento DIAN (13, 31, 41, etc.) |
| `document_number` | text | Número sin DV |
| `document_key` | text | Generada: `document_type:document_number` |
| `provider` | text | `verifik` o `coresoft` |
| `raw_response` | jsonb | Respuesta cruda del proveedor |
| `normalized_data` | jsonb | Datos normalizados para mapear a customers/suppliers |
| `queried_by` | uuid | Usuario que consultó (FK auth.users) |
| `organization_id` | integer | Organización (FK organizations) |
| `expires_at` | timestamptz | Expiración (24h) |
| `created_at` | timestamptz | Fecha de creación |

**Índices:**
- `idx_dian_lookup_cache_key_provider` (document_key, provider)
- `idx_dian_lookup_cache_expires_at` (expires_at)

**RLS:** Habilitado. Solo usuarios autenticados pueden SELECT/INSERT/DELETE.

**Constraint:** UNIQUE (document_key, provider) — evita duplicados por proveedor.

---

## 7. Mapeo de campos API → BD

| Campo API (Verifik/CoreSoft) | Campo `customers` | Campo `suppliers` |
|---|---|---|
| `nombreRazon` / `razon_social` | `company_name` (empresa) o `first_name`+`last_name` (persona) | `name` |
| `nit` + `digito_verificacion` | `doc_number` + `dv` | `nit` |
| `estado` (REGISTRO ACTIVO) | `is_registered` | `is_active` |
| `email` | `email` | `email` |
| `telefono` / `phone` | `phone` | `phone` |
| `direccion` (RUES) | `address` | `address` |
| `ciudad` / `municipio` | `city` (locationData) | `city` |
| `departamento` | `state` (locationData) | `state` |
| `cod_ciiu_act_econ_pri` | `metadata.ciiu` (jsonb) | `metadata.ciiu` (jsonb) |
| Responsabilidades fiscales | `fiscal_responsibilities[]` (O-13, O-15, O-23, O-47, O-48, O-49) | `fiscal_responsibilities[]` |
| `matricula`, `camara`, `representantes` | `metadata.rues` (jsonb) | `metadata.rues` (jsonb) |

### Mapeo de responsabilidades fiscales

La descripción de DIAN se mapea a los códigos de `dian_fiscal_responsibilities`:

| Texto en descripción DIAN | Código |
|---|---|
| "gran contribuyente" | `O-13` |
| "autorretenedor" | `O-15` |
| "agente de retención IVA" | `O-23` |
| "simple" (régimen simple) | `O-47` |
| "responsable de IVA" (sin "no") | `O-48` |
| "no responsable de IVA" | `O-49` |
| (persona natural sin responsabilidades) | `R-99-PN` |

---

## 8. Configuración

### 8.1 Variables de entorno

Agregar al `.env.local`:

```env
# DIAN / RUES Lookup Integration
# Proveedor primario: "verifik" (firma digital, RUES completo) o "coresoft" (menor costo)
DIAN_PROVIDER=verifik
VERIFIK_TOKEN=tu-verifik-bearer-token
CORESOFT_API_KEY=tu-coresoft-api-key
```

### 8.2 Obtener credenciales

- **Verifik:** Registrarse en https://verifik.co, obtener Bearer token.
- **CoreSoft:** Registrarse en https://coresoft.solutions, obtener API key. Demo gratis disponible.

### 8.3 Cambiar de proveedor

Cambiar `DIAN_PROVIDER` de `verifik` a `coresoft` (o viceversa). El servicio usa el proveedor configurado como primario y el otro como fallback automáticamente.

---

## 9. Cumplimiento legal (Habeas Data - Ley 1581/2012)

### Marco legal aplicable

- **Ley 1581 de 2012** — Régimen General de Protección de Datos Personales
- **Ley 1266 de 2008** — Hábeas Data (información financiera, crediticia, comercial)
- **Constitución Política Art. 15** — Derecho al Habeas Data

### Implementación en el ERP

1. **Checkbox de autorización** (opcional, no bloqueante): el usuario autoriza la consulta de su información en DIAN/RUES antes de que se realice.
2. **Auditoría de consultas**: la tabla `dian_lookup_cache` registra quién consultó qué NIT y cuándo (`queried_by`, `created_at`).
3. **Fuente documentada**: los datos incluyen metadata de su origen (DIAN/RUES, proveedor, fecha).
4. **Política de retención**: el cache expira en 24 horas. Los datos de facturación se conservan por obligación tributaria (5 años facturación, 10 años contabilidad).

### Derechos de los titulares (DIAN)

- **Derecho a Conocer:** Solicitar qué datos están almacenados.
- **Derecho a Actualizar:** Pedir actualización de datos desactualizados.
- **Derecho a Rectificar:** Corregir datos parciales, inexactos o incompletos.
- **Derecho a Suprimir:** Solicitar eliminación cuando proceda.
- **Derecho a Revocar autorización:** Cuando no sea necesario el tratamiento.

---

## 10. Verificación

### Comandos

```bash
npm run lint    # ESLint (Airbnb + Next.js)
npm run build   # Next.js build
npm test        # Tests
```

### Resultados de verificación (2026-08-13)

- **Lint:** Sin errores nuevos en los archivos de la integración. Los únicos errores de lint son preexistentes en otros archivos (`no-explicit-any` en props `onSuccess`, `ToastAction` sin usar).
- **Build:** `npm run build` exitoso (exit code 0).

### Pruebas manuales sugeridas

1. Configurar `VERIFIK_TOKEN` en `.env.local`.
2. Ir a Crear Cliente → seleccionar tipo "Empresa" → ingresar NIT `900197268` (DIAN).
3. Marcar checkbox de autorización → salir del campo (onBlur) o presionar botón.
4. Verificar que se autocompleten: razón social, DV, responsabilidades fiscales.
5. Repetir en Crear Proveedor con el mismo NIT.
6. Verificar que la segunda consulta venga de cache (toast muestra "(cache)").

---

## 11. Próximos pasos sugeridos

1. **Obtener credenciales reales** de Verifik y/o CoreSoft.
2. **Configurar variables de entorno** en producción.
3. **Probar con NITs reales** de clientes/proveedores existentes.
4. **Cron job de limpieza**: programar `limpiarCacheExpirado()` para ejecución diaria (ej: Vercel Cron o Supabase Edge Function).
5. **Extender a edición**: actualmente la consulta está en formularios de creación. Podría agregarse también en los formularios de edición de cliente/proveedor.
6. **Importación masiva**: integrar la consulta DIAN en `ImportarProveedores.tsx` para autocompletar proveedores desde CSV.
7. **Facturación electrónica**: los datos obtenidos (responsabilidades fiscales, régimen, CIIU) son directamente útiles para el módulo de facturación electrónica (Factus).

---

## 12. Referencias

### Documentación oficial

- **DIAN MUISCA:** https://muisca.dian.gov.co
- **DIAN Web Services Facturación:** https://www.dian.gov.co/impuestos/factura-electronica/Documents/Guia-Herramienta-para-el-Consumo-de-Web-Services.pdf
- **DIAN Resolución 202 de 2025:** Servicio de consulta de adquirientes.
- **RUES portal público:** https://rues.org.co
- **RUES portal entidades:** https://entidades.rues.org.co

### Proveedores comerciales

- **Verifik:** https://docs.verifik.co/business-validation/colombia/colombian-company-dian-verification/
- **CoreSoft:** https://coresoft.solutions/api-rut.html | Precios: https://coresoft.solutions/precios.html
- **Mediavox:** https://mediavox.co/mvdevportal
- **LaFactura.co:** https://wiki.lafactura.co

### Marco legal

- **Ley 1581 de 2012:** https://normograma.dian.gov.co/dian/compilacion/docs/ley_1581_2012.htm
- **Ley 1266 de 2008:** https://normograma.dian.gov.co/dian/compilacion/docs/ley_1266_2008.htm
- **SIC Habeas Data:** https://www.sic.gov.co/manejo-de-informacion-personal
