# FASE: Checkout Internacional — País, Estado, Teléfono con Prefijo

## Objetivo

Mejorar el checkout del storefront (`goadmin-websites`) para soportar:
- Selector de país (todos los países activos en BD)
- Selector de estado/departamento dependiente del país
- Input de ciudad/municipalidad con autocomplete
- Auto-detección de ubicación del cliente por IP
- Teléfono con prefijo internacional (+57, +1, +55, etc.)
- Integración con ERP: `web-orders` API, `pedidos-online`, `clientes`
- Compatibilidad con pasarelas: Wompi, Bold, Stripe, Mercado Pago

## Arquitectura

### Storefront (`goadmin-websites`)

#### Endpoints nuevos
- `GET /api/locations/countries` — Lista países activos con `phone_code` y bandera emoji
- `GET /api/locations/states?country_code=COL` — Estados/departamentos únicos de un país
- `GET /api/locations/cities?country_code=COL&state_code=05` — Municipios/ciudades de un estado
- `GET /api/locations/detect` — Auto-detección de país por IP (header `x-vercel-ip-country-code`)

Todos usan `createPublicClient()` (anon key, sin service_role), `NextResponse.json`, `force-dynamic`.

#### Componentes nuevos
- `components/site/LocationCheckoutFields.tsx` — Selector cascada país→estado→ciudad con:
  - Fetch a `/api/locations/*`
  - Auto-detección al montar (si no hay país seleccionado)
  - Fallback a input de texto si el país no tiene estados en BD
  - Datalist con ciudades de BD + fallback estático colombiano
  - `useId()` para IDs únicos por instancia
  - Labels con `htmlFor`/`id` para accesibilidad
  - Layout responsive `grid-cols-1 md:grid-cols-3`

- `components/site/PhoneCountryInput.tsx` — Input de teléfono con prefijo internacional:
  - Select de prefijo (+57, +1, etc.) con bandera emoji
  - Auto-selección basada en `countryCode` prop
  - Valor combinado: `prefix + " " + number`
  - `aria-label` en ambos campos

#### Util compartido
- `lib/utils/countryFlag.ts` — Función `countryCodeToFlag()` con mapeo ISO-3→ISO-2 explícito para los 10 países de la BD

#### Archivos modificados
- `components/site/CheckoutWizard.tsx`:
  - Estado `customerData` ampliado con `countryCode`, `stateCode`, `stateName`, `department`
  - Phone input reemplazado por `PhoneCountryInput`
  - City input reemplazado por `LocationCheckoutFields` con `fallbackCities`
  - Payload del pedido incluye `country`, `state`, `state_code`, `department` en `deliveryAddress`
  - Auto-guardado de dirección envía `country_code` y `department`
  - Carga de direcciones guardadas puebla campos nuevos
  - `canSubmitOnePage` requiere `countryCode`
  - Tipo `savedAddresses` actualizado a `address_line1`, `department`, `country_code`

- `app/api/orders/route.ts`:
  - Insert de `customer_addresses` usa `address_line1` (no `address_line`), incluye `country_code`, `department`, `is_active`
  - `delivery_address` fallback incluye campos nuevos condicionalmente

- `app/api/customer/me/route.ts`:
  - Select de direcciones usa `address_line1`, `department`, `country_code`

- `app/api/customer/address/route.ts`:
  - Acepta `country_code` y `department` del body
  - Inserts usan `address_line1`, `department`, `country_code`, `is_active`
  - Selects usan `address_line1`, `department`, `country_code`
  - Backward compat: acepta `address_line` y `state` del body, mapea a columnas reales

### ERP (`go-admin-erp`)

#### Archivos modificados
- `src/app/api/web-orders/route.ts`:
  - Interface `CreateWebOrderRequest` amplía `delivery_address` con `country`, `state`, `state_code`, `department`
  - Sanitización server-side: `country` → uppercase + slice(3), `state` → slice(100), `state_code` → slice(10), `department` → slice(100)
  - Insert usa objeto sanitizado
  - Compatibilidad: payloads antiguos sin campos nuevos siguen funcionando

- `src/lib/services/webOrderServerConfirmation.ts`:
  - `findOrCreateCustomerFromOrder`: guarda `country`, `state`, `state_code` en `metadata` del cliente
  - `ensureCustomerAddressFromOrder` (nuevo): crea `customer_addresses` con `country_code`, `department`, `city` si el cliente no tiene direcciones
  - Creación de shipment: `delivery_department` usa `addr.department || addr.state`, país/state_code van en `metadata` y `delivery_instructions`

## Contrato de datos

### Payload del checkout al ERP (`POST /api/web-orders`)

```json
{
  "organization_id": 138,
  "branch_id": 1,
  "delivery_type": "delivery_own",
  "delivery_address": {
    "address": "Calle 123 #45-67",
    "city": "Medellín",
    "country": "COL",
    "state": "Antioquia",
    "state_code": "05",
    "department": "Antioquia"
  },
  "customer_name": "Juan Pérez",
  "customer_email": "juan@example.com",
  "customer_phone": "+57 300 123 4567",
  "items": [...]
}
```

### Persistencia en BD

| Campo | Tabla | Columna | Notas |
|-------|-------|---------|-------|
| country | web_orders | delivery_address (JSONB) | Código ISO-3 |
| state | web_orders | delivery_address (JSONB) | Nombre del estado |
| state_code | web_orders | delivery_address (JSONB) | Código del estado |
| department | web_orders | delivery_address (JSONB) | Alias de state |
| country | shipments | metadata (JSONB) | delivery_country |
| state | shipments | metadata (JSONB) | delivery_state |
| country_code | customer_addresses | country_code | Text |
| department | customer_addresses | department | Text |
| country | customers | metadata (JSONB) | Solo clientes nuevos desde web |

## Fuente de datos

- **Países**: tabla `countries` (10 países activos: AUS, BRA, CAN, CHL, COL, ESP, USA, JPN, MEX, GBR)
- **Estados**: tabla `municipalities` (distinct state_code/state_name por country_code)
- **Ciudades**: tabla `municipalities` (582 municipios colombianos)
- **Fallback**: 65 ciudades colombianas hardcodeadas en CheckoutWizard para cuando la BD no tiene municipios

## Auto-detección de ubicación

- Usa header `x-vercel-ip-country-code` (inyectado por Vercel)
- Convierte ISO-2 → ISO-3 con mapeo explícito
- Busca el país en la BD por código
- Si no detecta, devuelve `{ country_code: null }` (no bloquea checkout)
- El usuario puede override manual

## Teléfono internacional

- Select de prefijo se llena desde `/api/locations/countries` (campo `phone_code`)
- Auto-selecciona el prefijo basado en el país seleccionado
- Valor combinado: `phone_code + " " + numero` (ej: `+57 300 123 4567`)
- Se envía como `customer_phone` (string único, compatible con backend existente)

## Compatibilidad con pasarelas

Verificado por tester (ronda 1, 9/10):
- **Wompi**: webhook no lee `delivery_address`, usa `reference` y `status`. No afectado.
- **Bold**: webhook no lee `delivery_address`, valida firma y delega. No afectado.
- **Stripe**: webhook no lee `delivery_address`. No afectado.
- **Mercado Pago**: webhook no lee `delivery_address`. No afectado.
- **`/api/checkout/init`**: recibe solo `orderNumber`, `gateway`, `returnUrl`. No afectado.
- **Payloads antiguos**: siguen funcionando (campos nuevos son opcionales)

## Rondas de calidad

| Ronda | Calificación | Problemas | Acción |
|-------|--------------|-----------|--------|
| 1 | 8/10 | Datalist huérfano, labels sin htmlFor, department redundante | Fix en ronda 2 |
| 2 | 9/10 | Persistencia incompleta, aria-label faltante, sin validación país, IDs estáticos, util duplicado | Fix en ronda 3 |
| 3 | 9/10 | Columnas inexistentes en /api/customer/me y /api/customer/address, banderas incorrectas | Fix en ronda 4 |
| 4 | 10/10 | Solo observaciones INFO (dead code menor, DireccionesClient sin campos nuevos) | Aprobado |

## Riesgos y consideraciones

1. **Solo 10 países en BD**: si se necesitan más, hay que insertarlos en la tabla `countries` vía Supabase MCP
2. **Solo Colombia tiene estados/municipios**: otros países muestran input de texto libre
3. **Auto-detección por IP**: solo funciona en Vercel (header `x-vercel-ip-country-code`). En local devuelve null.
4. **Teléfono como string único**: el backend guarda `customer_phone` como string con prefijo incluido. No hay columna separada para el código de país.
5. **DireccionesClient.tsx**: formulario "Mis Direcciones" no envía `department` ni `country_code` (issue pre-existente, no bloquea checkout)

## Archivos creados

- `goadmin-websites/app/api/locations/countries/route.ts`
- `goadmin-websites/app/api/locations/states/route.ts`
- `goadmin-websites/app/api/locations/cities/route.ts`
- `goadmin-websites/app/api/locations/detect/route.ts`
- `goadmin-websites/components/site/LocationCheckoutFields.tsx`
- `goadmin-websites/components/site/PhoneCountryInput.tsx`
- `goadmin-websites/lib/utils/countryFlag.ts`

## Archivos modificados

- `goadmin-websites/components/site/CheckoutWizard.tsx`
- `goadmin-websites/app/api/orders/route.ts`
- `goadmin-websites/app/api/customer/me/route.ts`
- `goadmin-websites/app/api/customer/address/route.ts`
- `go-admin-erp/src/app/api/web-orders/route.ts`
- `go-admin-erp/src/lib/services/webOrderServerConfirmation.ts`
