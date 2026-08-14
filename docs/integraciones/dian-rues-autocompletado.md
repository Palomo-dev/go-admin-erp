# Integración DIAN / RUES - Autocompletado de Clientes y Proveedores

> **Fecha de implementación:** 2026-08-13
> **Módulos afectados:** CRM (clientes), Inventario (proveedores)
> **Proveedores:** Verifik (primario) + CoreSoft (fallback) + Factus (adquirientes)
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

### 2.3 Decisión: Verifik (primario) + CoreSoft (fallback) + Factus (adquirientes)

- **Verifik**: firma digital en cada respuesta (auditable, útil para compliance y Habeas Data), API REST moderna, RUES completo con representantes legales.
- **CoreSoft**: alternativa de menor costo si el volumen es bajo-medio (<1.000 consultas/mes): $49.000 COP/mes con plan único. Entrega teléfono, dirección y régimen que Verifik no tiene.
- **Factus**: ya contratado para facturación electrónica. Expone `GET /v2/dian/acquirer` que consulta la base oficial de DIAN y devuelve **nombre + email** del adquiriente. No tiene costo adicional (incluido en el plan de facturación). Sirve como fallback terciario y como única fuente de email para personas naturales.

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

## 12. Beneficios de Verifik (investigación a fondo 2026-08-14)

### 12.1 Datos exactos que entrega Verifik por cédula

#### `/v2/co/cedula` (básico, solo número)

```json
{
  "data": {
    "arrayName": ["JULIO", "CESAR", "CABANA", "CONTRERAS"],
    "documentNumber": "1121329662",
    "documentType": "CC",
    "firstName": "JULIO CESAR",
    "fullName": "JULIO CESAR CABANA CONTRERAS",
    "lastName": "CABANA CONTRERAS"
  },
  "signature": {
    "dateTime": "October 8, 2025 8:21 PM",
    "message": "Certified by Verifik.co"
  },
  "id": "I70IL"
}
```

Entrega: nombre completo, nombres y apellidos separados, array de nombres, tipo y número de documento. **No entrega teléfono, email, dirección ni tributos.**

#### `/v2/co/cedula/extra` (con fecha de expedición DD/MM/YYYY)

Agrega al básico:
- `expeditionDate` — fecha de expedición (ISO 8601)
- `expeditionPlace` — objeto con `municipio` y `departamento`
- `dateOfBirth` — fecha de nacimiento
- `gender` — HOMBRE / MUJER
- `isAlive` — estado vital (true/false)

#### `/v2/co/cedula/premium` (sin fecha de expedición)

Igual que `extra` pero Verifik resuelve la fecha de expedición automáticamente. Pricing premium (~2 créditos vs 0.3 del básico).

#### `/v2/co/registraduria/certificado` (certificado oficial PDF)

Entrega:
- `codigoVerificacion` — código para validar el certificado
- `novedad` — estado de vigencia ("VIGENTE")
- `pdfBase64` — PDF del certificado de Registraduría en base64
- `documento` — { cedula, fechaExpedicion, lugarExpedicion, nombre }

#### `/v2/co/cedula/by-name` (búsqueda inversa por nombre)

Parámetros: `primerNombre`, `primerApellido`, `sexo`, `fecha` (nacimiento DD/MM/YYYY), opcionales `segundoNombre`, `segundoApellido`. Retorna array `matches` con posibles coincidencias del registro civil.

#### `/v2/co/registraduria/serial` (por serial del registro civil)

Parámetro: `serial` (hasta 10 dígitos). Retorna datos del registro civil: nombre, género, oficina/notaría, fecha, serial.

#### `/v2/co/situacion-militar` (situación militar)

Entrega: `fullName`, `state` (situación militar), `place`, `adress`, `remissSince`.

#### `/v2/co/cedula/rethus` (profesionales de salud)

Entrega: identidad + `rethus.status` ("ACTIVO EN RETHUS") + `rethus.academic` (array de títulos: profesión, tipo, entidad, fechas) + `rethus.dataSSO` (beneficios/modalidad).

#### `/v2/co/afiliaciones` (EPS, ARL, pensiones — requiere fecha expedición)

Entrega:
- `informaciónPersonal` — nombres, sexo, fecha corte
- `eps` — entidad, régimen, fecha afiliación, estado, municipio
- `arl` — administradora, actividad, municipio
- `ap` (pensiones) — régimen, administradora
- `cajaCompensacion` y `cesantias`

#### `/v2/co/registraduria/votacion` (lugar de votación)

Entrega: `address`, `department`, `municipality`, `pollingTable`, `votingStation`, `votingStationAddress`, `status`.

#### Otros documentos de identidad

| Endpoint | Documento | Datos clave |
|---|---|---|
| `/v2/co/foreigner-id/ce` | Cédula de Extranjería | nombre, expirationDate, status |
| `/v2/co/foreigner-id/pep` | Permiso Especial Permanencia | nombre, identification (venezolana), expirationDate, status |
| `/v2/co/foreigner-id/ppt` | Permiso Protección Temporal | nombre, expeditionDate, expirationDate, status |
| `/v2/co/cedula` con `PPT` | PPT (solo nombres) | nombre completo |
| `/v2/co/politically-exposed-persons` | PEP (AML, no migratorio) | array `detail` con declarante, entidad, cargo, publicación |

#### Resumen: lo que SÍ y NO entrega Verifik por cédula

| Dato | ¿Disponible? | Endpoint |
|---|---|---|
| Nombre completo | ✅ | cedula |
| Fecha de nacimiento | ✅ | cedula/extra, premium |
| Género | ✅ | cedula/extra |
| Estado vital (vivo/fallecido) | ✅ | cedula/extra |
| Lugar y fecha de expedición | ✅ | cedula/extra |
| Certificado Registraduría PDF | ✅ | registraduria/certificado |
| Situación militar | ✅ | situacion-militar |
| Lugar de votación + dirección | ✅ | registraduria/votacion |
| Profesión (RETHUS) | ✅ | cedula/rethus |
| EPS, ARL, pensiones | ✅ | afiliaciones |
| Antecedentes Policía/Procuraduría/Contraloría/INPEC | ✅ | background check |
| Procesos judiciales | ✅ | rama/procesos |
| Contratos públicos (SECOP) | ✅ | contracts |
| Servidor público (SIGEP) | ✅ | sigep/document |
| PEP (personas expuestas políticamente) | ✅ | politically-exposed-persons |
| Listas OFAC/ONU/Interpol/FBI/DEA/Europol | ✅ | background check internacional |
| **Teléfono** | ❌ | ninguno |
| **Email** | ❌ | ninguno (solo empresas vía invoicer) |
| **Dirección residencia** | ⚠️ | solo votación (dirección de votación, no residencia) |
| **Responsabilidades fiscales O-xx** | ❌ | ninguno |
| **Régimen tributario** | ❌ | ninguno |
| **Actividad CIIU** | ❌ | ninguno (solo empresas vía rues-complete) |

### 12.2 Catálogo completo de servicios Verifik

#### Biometría
- **Liveness Detection** — detecta si imagen facial es real o spoof (foto/pantalla/impreso)
- **Liveness Score** — score numérico de vida (0-1)
- **Face Comparison 1:1** — compara selfie vs documento, score de similitud
- **Compare with Liveness** — comparación + liveness en secuencia
- **Face Search 1:N** — busca rostro en colección de personas
- **Face Search Live** — búsqueda 1:N con garantía de persona viva
- **HumanAuthn** — autenticación biométrica sin almacenar plantillas (zero-knowledge, GDPR compliant)

#### OCR / Scan Docs
- **Scan Prompt** — extracción flexible con prompts de IA, precisión media, sin entrenamiento
- **Scan Studio** — OCR de alta precisión con modelos entrenados por tipo de documento
- **Smart Scan** — suite completa de digitalización

#### Servicios integrados
- **SmartCheck** — 90+ APIs de 15+ países en una sola interfaz unificada
- **SmartAccess** — login sin contraseñas (OTP email/SMS/WhatsApp + biométrico)
- **Access API** — endpoints para construir autenticación personalizada
- **SmartEnroll** — flujo KYC completo no-code: registro → email → teléfono → documento → biometría → completion
- **SmartEnroll Admin** — dashboard para revisión manual de verificaciones
- **SmartEnroll Self Hosted** — control total del flujo KYC vía API

#### Background check (antecedentes)
- **Colombia**: Policía (medidas correctivas + antecedentes), Procuraduría, Contraloría (PDF), INPEC (registros carcelarios), SECOP (contratos públicos)
- **Internacional**: OFAC, ONU, Interpol, FBI, DEA, Europol

#### Vehículos y conductores (Colombia)
- **RUNT por placa** — marca, línea, modelo, color, estado, SOAT, RTM
- **RUNT por VIN** — historial completo, especificaciones técnicas, limitaciones
- **Licencia de conducción** — categorías, vencimientos, multas
- **SIMIT suspensiones** — resoluciones de suspensión/cancelación

#### Salud (Colombia)
- **RETHUS** — profesionales de salud, títulos, estado
- **Afiliaciones** — EPS, ARL, pensiones, caja compensación, cesantías

#### Legal (Colombia)
- **Abogados** — registro público Rama Judicial
- **Procesos judiciales** — lista de procesos por persona
- **Expedientes** — detalle de expediente por juzgado
- **Validez profesional legal** — certificado de vigencia
- **SIGEP** — servidores públicos por documento o por nombre

#### Empresas (Colombia)
- **DIAN Verification** — estado tributario
- **Legal Invoicer** — facturador electrónico + email
- **RUES v3 básico** — resumen por categoría
- **RUES Complete v3** — dossier completo con representantes, actividades, establecimientos

#### Otros
- **IP Geolocation** — país, región, ciudad, ISP, ASN
- **Email validation** — OTP por email
- **Phone validation** — OTP por SMS/WhatsApp
- **Webhooks** — notificaciones en tiempo real de eventos KYC
- **Document Liveness** — detección de fraude documental (screen replay, copia impresa, sustitución de foto, manipulación digital)

### 12.3 Beneficios concretos para go-admin-erp

#### Firma digital con sello de tiempo (ÚNICO en el mercado)

Cada respuesta trae un objeto `signature` con `message`, `dateTime` e `id`. **Ningún competidor en Colombia/LATAM ofrece esto** (CoreSoft, Truora, Dataico, Mediavox, Auco, Apitude, Saphety: ninguno).

**Beneficio real**: en una auditoría de la DIAN, Superintendencia Financiera o UIAF, puedes demostrar con evidencia criptográfica que consultaste la identidad de un cliente/proveedor en una fecha y hora exactas. Esto sirve para:
- Cumplimiento Habeas Data (Ley 1581/2012)
- Evidencia de debida diligencia KYC/AML
- No repudio: nadie puede negar que la verificación se hizo
- Cadena de custodia para auditorías

#### SmartEnroll: KYC completo end-to-end

Flujo no-code embebible en el ERP:
1. Registro → 2. OTP email → 3. OTP teléfono → 4. Captura documento → 5. OCR → 6. Liveness → 7. Face comparison → 8. Background checks → 9. Completion

**Beneficio real**: onboarding de clientes/proveedores/empleados 100% digital, de días a minutos. Panel admin para revisión manual de casos edge. Webhooks para crear el registro en el ERP automáticamente cuando se completa el KYC.

#### Cobertura multi-país (15+ países, 90+ APIs)

Si go-admin-erp se expande a México, Perú, Chile, Brasil, Argentina, Ecuador, etc., **la misma integración sirve**. Solo cambias parámetros de país y tipo de documento. Con CoreSoft tendrías que integrar otro proveedor por cada país.

#### HumanAuthn: autenticación sin contraseñas y sin almacenar biometría

Combina biometría + criptografía + entropía. No almacena plantillas biométricas (GDPR compliant). Permite login passwordless en el ERP.

**Beneficio real**: si un cliente quiere acceso seguro sin contraseñas (ej: cajeros POS, bodegueros, conductores), HumanAuthn lo permite sin riesgo de data breach biométrico.

#### Background checks integrados (due diligence automático)

En una sola consulta puedes validar:
- Antecedentes Policía + Procuraduría + Contraloría + INPEC
- Listas internacionales OFAC, ONU, Interpol, FBI, DEA, Europol
- PEP (personas políticamente expuestas)
- Procesos judiciales
- Contratos públicos SECOP
- Servidores públicos SIGEP

**Beneficio real**: screening automático de proveedores y empleados contra todas las listas restrictivas. Cumplimiento SARLAFT sin contratar un servicio separado de compliance.

#### Validación de vehículos y conductores (RUNT + SIMIT)

Si el ERP gestiona flotas, transporte o logística:
- RUNT por placa/VIN: marca, modelo, SOAT, RTM, historial
- Licencia de conducción: categorías, vencimientos, multas
- SIMIT: suspensiones activas

**Beneficio real**: validar que los conductores tienen licencia vigente y los vehículos tienen SOAT/RTM al día antes de asignarlos a rutas.

#### Salud: RETHUS + afiliaciones EPS/ARL/pensiones

Si el ERP atiende sector salud o necesita validar afiliaciones de empleados:
- RETHUS: validar que un médico/enfermero está activo y sus títulos
- Afiliaciones: verificar EPS, ARL, pensiones de un empleado por cédula

**Beneficio real**: credentialing automático de personal de salud + verificación de afiliaciones de seguridad social sin consultar SISPRO manualmente.

#### Webhooks para automatización

Eventos como `app_registration_completed`, `biometric_validation_validated`, `document_validation_created` se envían al backend del ERP en tiempo real.

**Beneficio real**: cuando un cliente completa su KYC, el ERP lo crea automáticamente en `customers` sin intervención manual. Si requiere revisión manual, notifica al equipo de compliance.

#### OCR de documentos (Scan Prompt + Scan Studio)

- Scan Prompt: extracción flexible con prompts, precisión media, sin entrenamiento
- Scan Studio: alta precisión con modelos entrenados por tipo de documento

**Beneficio real**: el usuario sube foto de la cédula/RUT y el ERP extrae los datos automáticamente en lugar de digitarlos. Reduce errores de captura.

#### Document Liveness (detección de fraude documental)

Detecta: documentos en pantalla, copias impresas, sustitución de foto, manipulación digital.

**Beneficio real**: si alguien intenta registrar una cédula falsa o manipulada, el sistema lo detecta antes de aprobar el alta.

#### Sistema de créditos unificado

Una sola "moneda" para todos los servicios (SmartCheck, SmartAccess, SmartEnroll, APIs directas, biometría). `includeCost=true` muestra el costo en cada respuesta.

**Beneficio real**: no necesitas contratos separados por servicio. Escalas pay-per-use. Planes desde $49 USD/mes (Starter) hasta $649 USD/mes (Business).

#### Dynamic Query (consulta inteligente)

Si la ruta estándar de cédula no retorna coincidencia, Verifik escala automáticamente a ruta premium sin que tengas que programar la lógica de fallback.

**Beneficio real**: mayor tasa de éxito en consultas sin código adicional. Solo pagas premium cuando funciona.

### 12.4 Comparativa directa vs CoreSoft

| Aspecto | Verifik | CoreSoft |
|---|---|---|
| Firma digital en respuestas | ✅ único | ❌ |
| Cobertura países | 15+ | 1 (Colombia) |
| KYC completo (SmartEnroll) | ✅ | ❌ |
| Biometría facial | ✅ | ❌ |
| Webhooks | ✅ | ❌ |
| SDKs múltiples lenguajes | ✅ | ❌ |
| Listas OFAC/ONU/Interpol | ✅ | limitado |
| Document Liveness | ✅ | ❌ |
| OCR de documentos | ✅ | ❌ |
| RETHUS + afiliaciones salud | ✅ | ❌ |
| RUNT + SIMIT + licencias | ✅ | ✅ |
| Cédula con dirección/teléfono | ❌ | ✅ (`/api/cedula`) |
| RUT con régimen en texto | ❌ | ✅ (`/v1/rut`) |
| Precio | medio ($49-649 USD/mes) | bajo ($49K-349K COP/mes) |

**Conclusión**: Verifik gana en cobertura, compliance, biometría, KYC y multi-país. CoreSoft gana en precio para Colombia y en entregar teléfono/dirección/régimen que Verifik no tiene. Por eso la combinación actual (Verifik primario + CoreSoft fallback) es correcta.

### 12.5 Cuándo usar Verifik vs CoreSoft en go-admin-erp

| Caso de uso | Mejor opción |
|---|---|
| Autocompletar nombre de persona | Verifik (cédula) |
| Autocompletar teléfono/dirección persona natural | CoreSoft (`/api/cedula`) |
| Autocompletar empresa (representantes, establecimientos) | Verifik (rues-complete) |
| Validar régimen tributario texto | CoreSoft (`/v1/rut`) |
| KYC completo de cliente nuevo | Verifik (SmartEnroll) |
| Antecedentes para due diligence | Verifik (background check) |
| Screening OFAC/ONU/PEP | Verifik |
| Validar licencia de conductor | Verifik (RUNT) |
| Validar profesional de salud | Verifik (RETHUS) |
| Autenticación sin contraseñas | Verifik (HumanAuthn) |
| OCR de cédula/RUT subida | Verifik (Scan Studio) |
| Detección de cédula falsa | Verifik (Document Liveness) |
| Cumplimiento Habeas Data con auditoría | Verifik (firma digital) |

### 12.6 SLA y disponibilidad

| Producto | Disponibilidad | Notas |
|---|---|---|
| SmartCHECK | 90.0% Data API | Depende de conexiones con fuentes gubernamentales |
| SmartACCESS | 99.0% Email/Tel, 98.0% Biometría | |
| SmartEnroll | 99.0% Email/Tel, 98.0% Biometría, 98.0% Documentos, 90.0% Data API | Data API depende de fuentes gubernamentales |

Compensación en créditos por indisponibilidad causada por Verifik. No se garantiza tiempo de respuesta para fuentes gubernamentales (Verifik no controla las bases de datos gubernamentales).

### 12.7 Seguridad y compliance

- HTTPS/TLS 1.3 para todas las comunicaciones API
- Tokens JWT con expiración para autenticación
- Role-based access controls para equipos
- Rate limiting contra fuerza bruta
- Expiración de OTPs
- Cumplimiento Ley 1581/2012 (Habeas Data Colombia)
- Cumplimiento GDPR (HumanAuthn sin almacenamiento biométrico)
- Cumplimiento circulares KYC/AML de UIAF y Superintendencia Financiera

### 12.8 Facilidad de integración

- Documentación extensa en docs.verifik.co (Docusaurus)
- Ejemplos en JavaScript, Python, PHP, Swift, Go
- Postman collections disponibles
- GitHub Open-Verifik con documentación abierta
- Ambiente de sandbox con `demoMode`
- OTPs demo para testing
- SmartCheck permite pruebas en tiempo real en el dashboard

### 12.9 Planes de pricing SmartCheck

| Plan | Mensual | Anual | Créditos/año |
|---|---|---|---|
| Starter | $49 USD/mes | $490 USD/año | $588 |
| Basic | $129 USD/mes | $1.290 USD/año | $1.548 |
| Plus | $299 USD/mes | $2.990 USD/año | $3.588 |
| Business | $649 USD/mes | $6.490 USD/año | $7.788 |

Planes custom con volumen para empresas. Contratos anuales con tarifas preferenciales.

### 12.10 Fuentes consultadas

- Documentación oficial: https://docs.verifik.co
- Sitio principal: https://verifik.co
- Blog: https://verifik.co/blog/
- GitHub: https://github.com/Open-Verifik/verifik-documentation
- Endpoints Colombia: https://docs.verifik.co/identity/colombia/
- Full ID: https://docs.verifik.co/identity/colombia-full-id/
- Business validation: https://docs.verifik.co/business-validation/colombia/

---

## 13. Endpoint de Adquirientes de Factus (2026-08-14)

### 13.1 Qué es

Factus, el proveedor de facturación electrónica ya integrado en el ERP, expone un endpoint que consulta la base oficial de DIAN y devuelve el **nombre** y **correo electrónico** de un adquiriente a partir de su tipo y número de documento. Como ya pagamos por Factus para facturación, podemos reutilizar este endpoint para autocompletar clientes sin contratar un proveedor adicional.

### 13.2 Endpoint

```
GET /v2/dian/acquirer?identification_document_code={code}&identification_number={number}
Authorization: Bearer {factus_access_token}
Accept: application/json
```

- **Sandbox**: `https://api-sandbox.factus.com.co/v2/dian/acquirer`
- **Producción**: `https://api.factus.com.co/v2/dian/acquirer`

### 13.3 Parámetros

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `identification_document_code` | string | Código DIAN (`13`=CC, `31`=NIT, `41`=Pasaporte, etc.) |
| `identification_number` | string | Número de documento sin DV ni guiones |

### 13.4 Respuesta (HTTP 200)

```json
{
  "status": "OK",
  "message": "Solicitud exitosa",
  "data": {
    "name": "Nombre Cédula de ciudadanía 5",
    "email": "Mail_Cédula de ciudadanía[email protected]"
  }
}
```

**Campos devueltos:**
- `data.name` — Nombre o razón social
- `data.email` — Correo electrónico registrado en DIAN

### 13.5 Limitaciones

El endpoint **SOLO devuelve nombre y email**. NO devuelve:
- ❌ Teléfono
- ❌ Dirección
- ❌ Responsabilidades fiscales (O-13, O-15, O-23, etc.)
- ❌ Régimen tributario
- ❌ CIIU
- ❌ Municipio
- ❌ DV
- ❌ Datos RUES

### 13.6 Datos de prueba (sandbox)

| Tipo doc | Número | Nombre | Email |
|----------|--------|--------|-------|
| 11 | 1199991 | Nombre Registro civil 1 | Mail_Registro[email protected] |
| 12 | 1299991 | Nombre Tarjeta de identidad 1 | Mail_Tarjeta de[email protected] |
| 13 | 1399991 | Nombre Cédula de ciudadanía 1 | Mail_Cédula de ciudadanía[email protected] |
| 13 | 1399995 | Nombre Cédula de ciudadanía 5 | Mail_Cédula de ciudadanía[email protected] |
| 31 | 1699991 | Nombre NIT 1 | Mail_NIT[email protected] |

### 13.7 Autenticación

Requiere el mismo token OAuth2 de Factus que ya se usa para facturación electrónica. El `factusTokenManager.ts` ya centraliza la gestión del token (duracion 1 hora, refresh automático).

### 13.8 Rate limit

- **80 solicitudes por minuto** por usuario
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
- Error al exceder: HTTP 429

### 13.9 Códigos de error

| Código | Significado | Acción |
|--------|-------------|--------|
| 200 | OK | Procesar respuesta |
| 401 | Token inválido/expirado | Refrescar token |
| 404 | Adquiriente no encontrado | Mostrar "no encontrado" |
| 422 | Parámetros inválidos | Validar tipo/número |
| 429 | Rate limit excedido | Esperar `Retry-After` segundos |
| 500 | Error interno Factus | Reintentar o usar fallback |

### 13.10 Diferencia v1 vs v2

| Aspecto | v1 | v2 |
|---------|----|----|
| Parámetro | `identification_document_id` (int) | `identification_document_code` (string) |
| Valores | IDs numéricos (1, 2, 3...) | Códigos DIAN (11, 12, 13, 31...) |

**El código actual ya usa v2** (`mapIdentificationType` devuelve códigos string como `'13'`, `'31'`).

### 13.11 Restricciones de uso (DIAN)

Según la documentación de DIAN, los datos obtenidos solo pueden usarse para:
- Emisión de Factura Electrónica de Venta (FEV)
- Documento Equivalente Electrónico (DEE)

No hay prohibición explícita para autocompletar clientes en el CRM, pero el uso debe ser razonable y relacionado con facturación. El rate limit de 80 req/min gestiona el abuso.

### 13.12 ¿Consume créditos del plan?

⚠️ **No documentado públicamente.** La documentación de Factus no especifica si este endpoint consume créditos. Recomendación: contactar a Factus para confirmar, y monitorear el consumo después de las primeras consultas.

### 13.13 Plan de implementación

#### Fase 1: Agregar método a `factusService.ts`

```typescript
export interface FactusAcquirerResponse {
  name: string;
  email: string;
}

export async function getAcquirer(
  environment: 'sandbox' | 'production',
  accessToken: string,
  identificationDocumentCode: string,
  identificationNumber: string
): Promise<FactusAcquirerResponse> {
  const baseUrl = getBaseUrl(environment);
  const url = `${baseUrl}/v2/dian/acquirer?identification_document_code=${identificationDocumentCode}&identification_number=${identificationNumber}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Factus getAcquirer ${response.status}: ${errorBody}`);
  }

  const result = await response.json();
  return result.data;
}
```

Agregar al objeto `factusService`:
```typescript
const factusService = {
  // ... métodos existentes
  getAcquirer,
};
```

#### Fase 2: Crear API route

**Archivo nuevo**: `src/app/api/factus/acquirer/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';
import factusService from '@/lib/services/factusService';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const documentType = searchParams.get('documentType');
  const documentNumber = searchParams.get('documentNumber');

  if (!documentType || !documentNumber) {
    return NextResponse.json(
      { error: 'documentType y documentNumber son requeridos' },
      { status: 400 }
    );
  }

  const credentials = getCredentials();
  if (!credentials) {
    return NextResponse.json({ error: 'Credenciales no configuradas' }, { status: 500 });
  }

  const accessToken = await getValidToken();
  if (!accessToken) {
    return NextResponse.json({ error: 'No se pudo obtener token' }, { status: 500 });
  }

  try {
    const data = await factusService.getAcquirer(
      credentials.environment,
      accessToken,
      documentType,
      documentNumber
    );
    return NextResponse.json({ success: true, provider: 'factus', data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

#### Fase 3: Integrar en `dianLookupService.ts` como proveedor terciario

```typescript
type Provider = 'verifik' | 'coresoft' | 'factus';
```

Flujo de fallback:
1. Verificar cache (`dian_lookup_cache`, TTL 24h)
2. **Verifik** (primario) → RUES completo + responsabilidades + representantes
3. **CoreSoft** (fallback 1) → régimen + teléfono + dirección
4. **Factus** (fallback 2) → nombre + email (gratis, ya pagado)
5. Combinar resultados: cada proveedor llena los campos que los otros no tienen

#### Fase 4: Variables de entorno

No requiere variables nuevas. Ya están configuradas:
```env
FACTUS_CLIENT_ID=...
FACTUS_CLIENT_SECRET=...
FACTUS_USERNAME=...
FACTUS_PASSWORD=...
FACTUS_ENVIRONMENT=sandbox
```

### 13.14 Comparativa: Factus vs Verifik vs CoreSoft

| Dato | Verifik | CoreSoft | Factus |
|------|---------|----------|--------|
| Nombre/razón social | ✅ | ✅ | ✅ |
| Email | ❌ | ❌ | ✅ |
| Teléfono | ❌ | ✅ | ❌ |
| Dirección | ❌ | ✅ | ❌ |
| Responsabilidades fiscales | ❌ | ✅ (texto) | ❌ |
| Régimen tributario | ❌ | ✅ (texto) | ❌ |
| CIIU | ❌ | ❌ | ❌ |
| RUES (representantes, matrícula) | ✅ | ✅ | ❌ |
| Firma digital/auditoría | ✅ | ❌ | ❌ |
| Costo adicional | Sí (créditos) | Sí (plan COP) | Incluido en plan facturación |
| Rate limit | Variable | Por plan | 80 req/min |

### 13.15 Estrategia de combinación de datos

Para un NIT `900123456-1`:
- **Verifik** devuelve: razón social, representantes, matrícula RUES, actividades
- **CoreSoft** devuelve: régimen ("Común"), teléfono, dirección, responsabilidades
- **Factus** devuelve: nombre, email registrado en DIAN

El ERP combina los tres y autocompleta:
- `company_name` ← Verifik/CoreSoft/Factus (primero que tenga)
- `email` ← Factus (único que lo entrega para personas)
- `phone` ← CoreSoft
- `address` ← CoreSoft
- `fiscal_responsibilities` ← CoreSoft (mapear texto a O-xx)
- `metadata.rues` ← Verifik

### 13.16 Cumplimiento legal

- Los datos provienen de la base oficial de DIAN (registrada por adquirientes 2023-2024)
- El uso está destinado a facturación electrónica, que es el caso de uso del ERP
- Se mantiene el checkbox de Habeas Data (Ley 1581/2012) en los formularios
- La auditoría se registra en `dian_lookup_cache` con `provider='factus'`

### 13.17 Fuentes consultadas

- **Endpoint adquirientes**: https://developers.factus.com.co/informacion-adquirientes/obtener-datos-adquiriente/
- **Tablas de referencia**: https://developers.factus.com.co/tablas-de-referencia/tablas/
- **Autenticación**: https://developers.factus.com.co/autenticacion/auth/
- **Rate limits**: https://developers.factus.com.co/limite-de-request
- **Guía DIAN consulta adquirientes**: https://www.dian.gov.co/impuestos/factura-electronica/Documents/Paso-a-paso-Servicio-de-consulta-para-completar-la-informacion.pdf
- **Postman collection**: https://developers.factus.com.co/coleccion
- **Documentación completa Factus**: https://developers.factus.com.co/

---

## 14. Referencias

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
