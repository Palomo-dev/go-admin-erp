# FASE 1 — Resolución de Outlet en goadmin-websites

> Fecha: 2026-08-31
> Repos Sitio: `C:\Users\USUARIO\goadmin-websites`
> Depende de: FASE-0 (BD: `branches.slug`, `branches.subdomain`, `branches.custom_domain`, `branches.is_web_published`, `branch_id` nullable en `website_pages`, `website_settings`, `categories`)

---

## 1. Objetivo

Resolver el **outlet (branch) activo** en el sitio público a partir de la URL y
propagar `branchId` a todas las queries de contenido (páginas, productos,
categorías, espacios, menús de navegación).

Hoy el sitio es 1:1 (1 org = 1 sitio). Después de FASE 1, una misma organización
puede servir N outlets (hotel + restaurantes) bajo la misma razón social, cada
uno con su propio catálogo y páginas, sin crear organizaciones separadas.

---

## 2. Estrategia de resolución de outlet

Dos mecanismos, evaluados en este orden de prioridad:

### 2.1 Sub-subdomain (prioridad 1)

```
hotel.tugranhotel.goadmin.io
└── outlet ─┬── org ──── sistema
   hotel    tugranhotel  goadmin.io
```

- `org` = `tugranhotel` (segunda etiqueta del host en dominios del sistema)
- `outlet` = `hotel` → `branches.subdomain = 'hotel'` dentro de esa org

### 2.2 Path prefix (prioridad 2, fallback)

```
tugranhotel.goadmin.io/restaurante-1/menu
└── org ──── sistema   └ outlet ─┬── página
   tugranhotel goadmin.io  restaurante-1  menu
```

- `org` = `tugranhotel` (subdominio del sistema)
- `outlet` = `restaurante-1` → `branches.slug = 'restaurante-1'`
- `página` = `menu` (resto del path después de remover el segmento del outlet)

### 2.3 Dominio personalizado de outlet

```
restaurante1.tugranhotel.com
```

Si el host no matchea `organization_domains.host` pero matchea
`branches.custom_domain`, se resuelve outlet directamente. Si matchea
`organization_domains.host`, el outlet se resuelve por path prefix (2.2).

**Caso especial — dominio custom de branch sin org conocida**: cuando el
middleware detecta un `custom_domain` que pertenece a un **branch** (no a una
org), necesita setear **AMBOS** headers para que `get-org-context` pueda
resolver la organización:

1. `x-custom-outlet-domain` = el host del branch (para que `getOrgContext`
   haga `getOutletByCustomDomain` y obtenga el branch).
2. `x-custom-domain` = un **identificador de la org** (subdomain o dominio
   principal de la org), para que `getOrgContext` pueda resolver la
   organización con `getOrganizationByHost`.

El problema: el middleware no conoce la org a partir de
`branches.custom_domain` sin una query a BD. Hay dos opciones:

- **Opción A (aceptable en F1)**: el middleware hace un lookup
  `branches.custom_domain = host` → obtiene `organization_id` → lookup
  `organizations.id = organization_id` → obtiene el `subdomain` o dominio
  principal de la org → setea `x-custom-domain` con ese identificador.
  Esto agrega 2 queries al middleware por request con dominio custom de
  branch. Es aceptable porque los dominios custom de branch son pocos y el
  middleware corre en el edge (latencia baja a Supabase).
- **Opción B (optimización futura)**: cachear el mapeo
  `branches.custom_domain → (organization_id, org_identifier)` en memoria
  del edge con TTL de 60s. Evita las 2 queries en cada request. No
  implementar en F1; documentar para F2/F3.

> **Decisión F1**: usar Opción A (query en middleware). El middleware ya
> hace queries a `organization_domains` para resolver dominios custom de
> org, así que agregar el lookup en `branches` es consistente. Documentar
> el costo (2 queries extra) y la ruta de optimización (cache) para F2.

### 2.4 Sin outlet (sitio global de la org)

```
tugranhotel.goadmin.io/        → outlet = null (sitio global de la org)
tugranhotel.goadmin.io/menu    → outlet = null, página = menu
```

`outlet = null` significa contenido global de la organización (backward compat
total con el comportamiento actual).

### 2.5 Outlet principal en root (Opción A — hotel como negocio principal)

Cuando el negocio principal (ej. hotel) debe vivir en el root del dominio
propio (`tugranhotel.com/`) sin path prefix ni subdominio, se configura ese
branch con `custom_domain='tugranhotel.com'`. El middleware resuelve el
dominio custom → outlet hotel directamente. No hay landing corporativa
separada — el hotel ES el sitio principal.

> **Corrección QA R7 (custom-org vs custom-outlet)**: el hotel usa el custom
> domain de la **organización** (`tugranhotel.com`), NO un custom domain de
> branch. El middleware clasifica `tugranhotel.com` como `custom-org` y setea
> `x-custom-domain: tugranhotel`. La resolución del hotel como outlet principal
> se hace por **path prefix vacío** — el hotel es la página global (sin path de
> outlet). Los restaurantes se resuelven por path prefix (`/restaurante-1/`,
> `/restaurante-2/`). El hotel NO necesita `branches.custom_domain` — vive en
> el root de la org.

```
tugranhotel.com/               → outlet = null (global = hotel, custom-org)
tugranhotel.com/habitaciones   → outlet = null (global = hotel), página = habitaciones
tugranhotel.com/restaurante-1  → outlet = restaurante-1 (path prefix)
tugranhotel.com/restaurante-2  → outlet = restaurante-2 (path prefix)
```

**Configuración de branches para este caso:**

> **Corrección QA R7**: el hotel NO tiene `branches.custom_domain` — vive en
> el root de la org. El dominio `tugranhotel.com` pertenece a la **organización**
> (`organization_domains.host`), no a un branch. El hotel se resuelve como
> outlet principal porque su `slug` matchea el path prefix vacío (es la página
> global). Los restaurantes sí usan `branches.slug` para path prefix.

| Branch | custom_domain | slug | branch_type | is_web_published |
|---|---|---|---|---|
| hotel | (null — vive en el root de la org) | (sin slug, no necesita path) | hotel | true |
| restaurante-1 | (null) | `restaurante-1` | restaurant | true |
| restaurante-2 | (null) | `restaurante-2` | restaurant | true |

**Prioridad de resolución en el middleware**:
1. Si el host matchea `organization_domains.host` → resolver org (`custom-org`), luego outlet por path prefix (caso hotel en root: path vacío = global = hotel).
2. Si el host matchea `branches.custom_domain` → resolver outlet por custom_domain de branch (caso `restaurante1.tugranhotel.com`).
3. Si el host es sub-subdomain → resolver outlet por subdomain.
4. Si no hay outlet → sitio global de la org.

> Si en el futuro se quiere una landing corporativa encima del hotel, se añade
> la columna `is_default_outlet boolean` sin romper nada: cuando el path es `/`
> y el outlet tiene `is_default_outlet=true`, se renderiza el outlet; si se
> quiere landing corporativa, se setea `is_default_outlet=false` y el root
> vuelve a ser global.

---

## 3. Cambios en `middleware.ts`

> Archivo: `C:\Users\USUARIO\goadmin-websites\middleware.ts`

### 3.1 Problema actual

El middleware (líneas 52-96) extrae **un solo** subdominio (`parts[0]`) para
dominios del sistema y marca `isCustomDomain = true` para todo lo demás. No
distingue sub-subdomains ni outlets por dominio personalizado.

### 3.2 Cambios

1. **Detección de sub-subdomain**: comparar el host contra la lista
   `SYSTEM_DOMAINS` (que puede incluir TLDs de múltiples partes como
   `goadmin.co.uk`) y extraer el subdomain delante del system domain matcheado.
   Si hay 2+ etiquetas antes del system domain (`hotel.tugranhotel` frente a
   `goadmin.io`), separar `outlet-subdomain` (primera etiqueta) de
   `org-subdomain` (segunda etiqueta).
2. **Inyectar `x-outlet-subdomain`** header cuando aplique.
3. **Dominios personalizados**: si el host no matchea `organization_domains.host`,
   intentar matchear `branches.custom_domain` o `branches.subdomain` contra el
   host (esto requiere una consulta a BD; ver helper `resolveHostType`).

### 3.3 Código — funciones nuevas a añadir

```typescript
// middleware.ts (nuevas funciones auxiliares, fuera de middleware())

// Lista de dominios del sistema. Se comparan contra el host completo (no por
// número de etiquetas) para soportar TLDs con múltiples partes (ccTLDs como
// goadmin.co.uk = 3 etiquetas) y TLDs simples (goadmin.io = 2 etiquetas).
// El orden no importa: se elige el match más largo (más específico) primero.
const SYSTEM_DOMAINS = ['goadmin.co.uk', 'goadmin.io']

/**
 * Devuelve el system domain que matchea el hostname (o null si no hay match).
 * Se elige el match más largo para que 'goadmin.co.uk' prevalezca sobre un
 * hipotético 'co.uk' si ambos estuvieran en la lista.
 */
function matchSystemDomain(hostname: string): string | null {
  let best: string | null = null
  for (const d of SYSTEM_DOMAINS) {
    if (hostname === d || hostname.endsWith(`.${d}`)) {
      if (!best || d.length > best.length) best = d
    }
  }
  return best
}

/**
 * Clasifica el host en uno de:
 *  - { kind: 'system-org',     orgSubdomain, outletSubdomain?: string }
 *  - { kind: 'custom-org',     host }                 // dominio de la org
 *  - { kind: 'custom-outlet',  host, orgHost? }       // dominio de un branch
 *  - { kind: 'localhost-dev',  orgSubdomain?, outletSubdomain? }
 *  - { kind: 'unknown' }
 *
 * Para dominios personalizados NO consulta BD aquí (el middleware debe ser
 * rápido). La BD se consulta en get-org-context. Aquí solo marcamos el host
 * para que get-org-context sepa qué intentar primero.
 */
type HostResolution =
  | { kind: 'system-org'; orgSubdomain: string; outletSubdomain?: string }
  | { kind: 'custom-org'; host: string }
  | { kind: 'custom-outlet'; host: string }
  | { kind: 'localhost-dev'; orgSubdomain?: string; outletSubdomain?: string }
  | { kind: 'unknown' }

function resolveHost(hostname: string): HostResolution {
  const isLocalhost = hostname === 'localhost' || hostname.startsWith('localhost:')

  if (isLocalhost) {
    // subdomain.localhost o outlet.subdomain.localhost (dev)
    const parts = hostname.split('.')
    if (parts.length >= 3) {
      return { kind: 'localhost-dev', outletSubdomain: parts[0], orgSubdomain: parts[1] }
    }
    if (parts.length === 2 && parts[0] !== 'localhost') {
      return { kind: 'localhost-dev', orgSubdomain: parts[0] }
    }
    return { kind: 'localhost-dev' }
  }

  const systemDomain = matchSystemDomain(hostname)
  if (systemDomain) {
    // Extraer el subdomain delante del system domain (sin asumir nº de etiquetas).
    //   tugranhotel.goadmin.io        → prefix = 'tugranhotel'        → org
    //   hotel.tugranhotel.goadmin.io  → prefix = 'hotel.tugranhotel'  → outlet + org
    //   tugranhotel.goadmin.co.uk     → prefix = 'tugranhotel'        → org (TLD de 2 partes)
    //   hotel.tugranhotel.goadmin.co.uk → prefix = 'hotel.tugranhotel' → outlet + org
    const prefix = hostname.slice(0, hostname.length - systemDomain.length - 1)
    const labels = prefix.split('.')
    if (labels.length >= 2) {
      return { kind: 'system-org', orgSubdomain: labels[1], outletSubdomain: labels[0] }
    }
    if (labels.length === 1) {
      return { kind: 'system-org', orgSubdomain: labels[0] }
    }
    return { kind: 'unknown' }
  }

  // Dominio personalizado: no sabemos aquí si es de org o de branch.
  // get-org-context lo resuelve consultando organization_domains y branches.
  // Heurística: si tiene exactamente 2 etiquetas (tugranhotel.com) → org;
  // si tiene 3+ (hotel.tugranhotel.com) → podría ser outlet.
  //
  // IMPORTANTE: esta heurística es solo una primera clasificación para decidir
  // qué headers setear. El middleware NO confía ciegamente en "3+ etiquetas =
  // outlet". Cuando clasifica como 'custom-outlet', hace un lookup REAL en BD
  // (resolveBranchOrgByCustomDomain) consultando branches.custom_domain. Si el
  // lookup no encuentra el host en branches.custom_domain, el middleware no
  // setea x-custom-outlet-domain y el request cae al flujo de org custom domain
  // (getOrgContext probará organization_domains.host).
  //
  // Orden de lookup real en el middleware para dominios custom:
  //   1. organization_domains.host = hostname → es org (custom-org)
  //   2. branches.custom_domain = hostname → es outlet (custom-outlet)
  //   3. Si ninguno matchea → fallback a org custom domain (getOrgContext
  //      intentará getOrganizationByHost con el hostname crudo)
  //
  // Manejo de `www`: si el primer segmento es `www`, se ignora y se toma el
  // siguiente como candidato a outlet (o como org si no hay más etiquetas).
  //   www.tugranhotel.com        → custom-org (www ignorado, 2 etiquetas útiles)
  //   www.hotel.tugranhotel.com  → custom-outlet (www ignorado, outlet=hotel)
  //   hotel.tugranhotel.com      → custom-outlet (outlet=hotel, sin www)
  let parts = hostname.split('.')
  if (parts[0] === 'www') {
    parts = parts.slice(1) // descartar www y reevaluar con el resto
  }
  if (parts.length >= 3) {
    // candidato a outlet por sub-subdomain en dominio custom
    return { kind: 'custom-outlet', host: hostname }
  }
  return { kind: 'custom-org', host: hostname }
}

/**
 * Lookup de org desde un dominio custom de branch.
 * Usado por el middleware cuando resolveHost devuelve 'custom-outlet'.
 *
 * Flujo: branches.custom_domain = host → organization_id → organizations.subdomain
 *
 * Devuelve { orgIdentifier } o null si no hay match.
 * En F2/F3 se reemplaza por cache en edge (Opción B, ver §2.3).
 *
 * Usa el mismo cliente Supabase que ya crea el middleware (createServerClient
 * de @supabase/ssr con service role key + handler de cookies). Se pasa la
 * instancia ya creada para no construir un segundo cliente por request.
 */
async function resolveBranchOrgByCustomDomain(
  supabase: SupabaseClient,
  host: string
): Promise<{ orgIdentifier: string } | null> {
  // 1. branches.custom_domain → organization_id
  const { data: branch } = await supabase
    .from('branches')
    .select('organization_id')
    .eq('custom_domain', host)
    .eq('is_web_published', true)
    .maybeSingle()

  if (!branch?.organization_id) return null

  // 2. organizations.id → subdomain (identificador para getOrganizationByHost)
  const { data: org } = await supabase
    .from('organizations')
    .select('subdomain')
    .eq('id', branch.organization_id)
    .maybeSingle()

  if (!org?.subdomain) return null
  return { orgIdentifier: org.subdomain }
}
```

### 3.4 Código — bloque de middleware modificado

> **QA — almacenamiento sin `www`**: los campos `branches.custom_domain` y
> `branches.subdomain` deben almacenarse **SIEMPRE** sin prefijo `www.`. La
> validación en F6 (BranchForm) debe hacer
> `toLowerCase().trim().replace(/^www\./, '')` antes de guardar. Esto garantiza
> que el lookup `branches.custom_domain = effectiveHost` (donde `effectiveHost`
> ya viene sin `www` por el middleware) matchee correctamente.

Reemplazar el bloque de líneas 52-96 por:

```typescript
  // --- Lógica de subdominios / dominios personalizados / outlets ---
  const resolved = resolveHost(hostname)

  // Host efectivo sin www (para lookups en BD y headers).
  // branches.custom_domain y organization_domains.host se almacenan sin www.
  const effectiveHost = hostname.replace(/^www\./, '')

  let subdomain: string | null = null
  let outletSubdomain: string | null = null
  let isCustomDomain = false
  let isCustomOutletDomain = false

  switch (resolved.kind) {
    case 'localhost-dev':
      // En desarrollo, usar query param o header para simular
      subdomain = url.searchParams.get('subdomain') || request.headers.get('x-subdomain') || resolved.orgSubdomain || null
      outletSubdomain = url.searchParams.get('outlet') || request.headers.get('x-outlet-subdomain') || resolved.outletSubdomain || null
      break
    case 'system-org':
      subdomain = resolved.orgSubdomain
      outletSubdomain = resolved.outletSubdomain ?? null
      break
    case 'custom-org':
      isCustomDomain = true
      break
    case 'custom-outlet':
      isCustomDomain = true
      // Lookup REAL en BD: branches.custom_domain → organization_id
      // → organizations.subdomain. Si el host no está en branches.custom_domain,
      // no es un outlet — caer a custom-org (getOrgContext intentará
      // organization_domains.host). Se usa effectiveHost (sin www) porque
      // branches.custom_domain se almacena sin www.
      const branchRow = await resolveBranchOrgByCustomDomain(supabase, effectiveHost)
      if (branchRow?.orgIdentifier) {
        isCustomOutletDomain = true
        subdomain = branchRow.orgIdentifier // identificador de la org
      }
      // Si branchRow es null, isCustomOutletDomain queda false → flujo custom-org
      break
    case 'unknown':
    default:
      break
  }

  // Si no hay subdominio ni dominio personalizado, salir
  if (!subdomain && !isCustomDomain) {
    return supabaseResponse
  }

  // Agregar headers con información del tenant
  if (subdomain) {
    supabaseResponse.headers.set('x-subdomain', subdomain)
  }
  if (outletSubdomain) {
    supabaseResponse.headers.set('x-outlet-subdomain', outletSubdomain)
  }
  if (isCustomOutletDomain) {
    // Dominio custom de BRANCH: x-custom-domain lleva el identificador de la
    // org (resuelto vía lookup en resolveBranchOrgByCustomDomain), NO el
    // hostname del branch. El hostname del branch va en x-custom-outlet-domain.
    // Esto es crítico: getOrgContext usa `customDomain || subdomain` para
    // resolver la org con getOrganizationByHost. Si x-custom-domain llevara el
    // hostname del branch, getOrganizationByHost no encontraría la org (a
    // menos que consulte branches.custom_domain, que no lo hace).
    // Aquí `subdomain` ya contiene el orgIdentifier (subdomain de la org).
    // x-custom-outlet-domain usa effectiveHost (sin www) para que el lookup
    // en getOutletByCustomDomain matchee branches.custom_domain.
    supabaseResponse.headers.set('x-custom-domain', subdomain!)
    supabaseResponse.headers.set('x-custom-outlet-domain', effectiveHost)
  } else if (isCustomDomain) {
    // Dominio custom de ORG: x-custom-domain lleva el hostname (sin www).
    supabaseResponse.headers.set('x-custom-domain', effectiveHost)
  }

  return supabaseResponse
```

> **Nota**: para outlets por sub-subdomain del sistema
> (`hotel.tugranhotel.goadmin.io`), el middleware no consulta BD — solo
> separa etiquetas del host. Para dominios personalizados, el middleware hace
> un lookup real: primero intenta `branches.custom_domain = hostname` (vía
> `resolveBranchOrgByCustomDomain`). Si matchea, setea **ambos** headers:
> `x-custom-outlet-domain` = hostname del branch, y `x-custom-domain` =
> identificador de la org (subdomain resuelto). Si no matchea
> `branches.custom_domain`, cae al flujo de `custom-org` (setea solo
> `x-custom-domain` = hostname, y `getOrgContext` lo resuelve vía
> `organization_domains.host`). Esto agrega hasta 2 queries por request con
> dominio custom (aceptable; ver §2.3 para la ruta de cache en F2).
> `get-org-context` recibe los headers y resuelve org + branch sin
> ambigüedad.

---

## 4. Cambios en `get-org-context.ts`

> Archivo: `C:\Users\USUARIO\goadmin-websites\lib\get-org-context.ts`

### 4.1 Problema actual

`getOrgContext()` (líneas 30-90) lee `x-subdomain` / `x-custom-domain`, resuelve
la organización y devuelve navegación/menús. **No** resuelve outlet ni pasa
`branchId` a las queries de navegación.

### 4.2 Cambios

1. Leer además `x-outlet-subdomain` y `x-custom-outlet-domain`.
2. Después de resolver `organization`, resolver `outlet` (branch):
   - Si `x-outlet-subdomain` existe → `getOutletBySubdomain(orgId, subdomain)`
   - Si `x-custom-outlet-domain` existe → `getOutletByCustomDomain(orgId, host)`
   - Si no, intentar el **primer segmento del path** contra `branches.slug`
     (esto requiere recibir el path; ver §6 para `[[...slug]]/page.tsx`).
3. Devolver `outlet` (branch object o `null`) y `branchId` (`number | undefined`)
   además de `organization`. **`page.tsx` debe consumir `outlet` y `branchId`
   del return de `getOrgContext`**, no volver a resolverlos con `resolveOutlet`
   (ver §6.3 para el patrón anti-duplicación).
4. Pasar `branchId` a `getWebsiteHeaderNav`, `getWebsiteFooterNav`, etc.

> **QA — Unificación con `resolveOutlet` (§6.3)**:
>
> `getOrgContext(pathFirstSegment)` y `resolveOutlet` (en `page.tsx`) hacen
> trabajo similar pero en contextos distintos. Para evitar duplicación y
> ambigüedad, se establece esta división de responsabilidades:
>
> | Función | Contexto | Mecanismos que resuelve | Cuándo se llama |
> |---|---|---|---|
> | `getOrgContext(pathFirstSegment)` | Server Components de layout (header, footer, navegación global) | **Sub-subdomain** + **custom-domain de branch** + **path prefix** (si recibe `pathFirstSegment`) | En layouts que necesitan navegación antes de resolver la página concreta |
> | `resolveOutlet(organization, slug)` | `[[...slug]]/page.tsx` (catch-all) | **Path prefix** con `getOutletBySlug` (usa `slug[0]` del path) | En el page component que ya tiene el `slug` completo del path |
>
> **Por qué NO se duplican (aunque queden en archivos distintos)**:
>
> - `getOrgContext` es **server-side** (vive en `lib/get-org-context.ts`, corre
>   en Server Components de layout). Resuelve el outlet **por headers**
>   (`x-outlet-subdomain` / `x-custom-outlet-domain`) que el middleware ya
>   seteó al clasificar el host (sub-subdomain o custom-domain de branch). Solo
>   cae a `pathFirstSegment` si esos headers no existen.
> - `resolveOutlet` es **page-level** (vive en `app/[[...slug]]/page.tsx`).
>   Resuelve el outlet **por path segment** (`slug[0]` contra
>   `branches.slug`) porque su trabajo específico es extraer el segmento del
>   outlet del path y devolver los segmentos restantes como path de la página.
>   Lee los mismos headers que `getOrgContext`, pero **solo actúa si
>   `getOrgContext` no encontró outlet** (fallback por path).
>
> En la práctica: si el middleware ya seteó `x-outlet-subdomain` (caso
> sub-subdomain) o `x-custom-outlet-domain` (caso dominio custom de branch),
> `getOrgContext` resuelve el outlet por header y `resolveOutlet` lo recibe
> ya resuelto (no re-hace el lookup por path). `resolveOutlet` solo ejecuta
> `getOutletBySlug` cuando **no hay header de outlet** — es decir, el caso
> path-prefix puro (`tugranhotel.goadmin.io/restaurante-1/menu`). No hay
> doble query ni doble resolución.
>
> **Prevalencia**: si ambos mecanismos podrían aplicar (ej. sub-subdomain +
> path prefix en la misma URL), **el sub-subdomain / custom-domain prevalece**
> sobre el path prefix. Es decir, `getOrgContext` resuelve primero por headers
> (`x-outlet-subdomain` / `x-custom-outlet-domain`); solo si esos headers no
> existen usa `pathFirstSegment`. `resolveOutlet` en `page.tsx` hace lo mismo:
> revisa headers primero, y solo si no hay outlet por header cae al path prefix.
>
> **Regla práctica**: un outlet nunca se resuelve dos veces. Si
> `getOrgContext` ya resolvió el outlet por sub-subdomain/custom-domain,
> `resolveOutlet` recibe ese outlet vía headers y no intenta path prefix. Si
> `getOrgContext` no se llamó (ej. ruta que no usa layout), `resolveOutlet`
> es la única que resuelve y puede usar path prefix.
>
> **Implementación concreta**: `getOrgContext` acepta `pathFirstSegment?`
> opcional. Cuando se llama desde un layout que no tiene el path completo
> (ej. header/footer), se omite y solo resuelve por headers. Cuando se llama
> desde `page.tsx`, se le pasa `slug?.[0]` para que intente path prefix si
> no hay header de outlet. `resolveOutlet` en `page.tsx` se mantiene como
> función separada porque además de resolver el outlet **remueve el segmento
> del path** (algo que `getOrgContext` no hace).

### 4.3 Código — `getOrgContext` modificado

```typescript
import { headers } from 'next/headers'
import { getOutletBySubdomain, getOutletByCustomDomain, getOutletBySlug } from '@/lib/supabase/queries'
import type { OrganizationWithDetails } from '@/types/organization';
import type { Branch } from '@/types/branch';

export async function getOrgContext(pathFirstSegment?: string) {
  const headersList = await headers()
  const subdomain = headersList.get('x-subdomain')
  const customDomain = headersList.get('x-custom-domain')
  const outletSubdomain = headersList.get('x-outlet-subdomain')
  const customOutletDomain = headersList.get('x-custom-outlet-domain')
  const identifier = customDomain || subdomain

  if (!identifier) return null

  const organization = await getOrganizationByHost(identifier)
  if (!organization) return null

  // --- Resolver outlet (branch) ---
  let outlet: Branch | null = null

  if (outletSubdomain) {
    // Sub-subdomain: hotel.tugranhotel.goadmin.io
    outlet = await getOutletBySubdomain(organization.id, outletSubdomain)
  } else if (customOutletDomain) {
    // Dominio personalizado de un branch: restaurante1.tugranhotel.com
    outlet = await getOutletByCustomDomain(organization.id, customOutletDomain)
  } else if (pathFirstSegment) {
    // Path prefix: tugranhotel.com/restaurante-1/menu
    outlet = await getOutletBySlug(organization.id, pathFirstSegment)
  }

  const branchId = outlet?.id ?? undefined

  // --- Navegación (ahora con branchId) ---
  const [headerNav, headerNavTree, footerNav, footerNavTree] = await Promise.all([
    getWebsiteHeaderNav(organization.id, branchId),
    getWebsiteHeaderNavTree(organization.id, branchId),
    getWebsiteFooterNav(organization.id, branchId),
    getWebsiteFooterNavTree(organization.id, branchId)
  ])

  // ... resto igual (menús nombrados, mega-menú, frozen status) ...
  // (sin cambios en la lógica de namedHeaderMenu / namedMegaMenu / footerMenus)
  //
  // QA — getOrgContext debe pasar `branchId` a `getMenuCategories` y
  // `getMegaMenuItems` para que la navegación del header/footer refleje el
  // outlet activo. Sin esto, las categorías y items del mega-menú mostrarían
  // contenido de toda la org en lugar del outlet + globales.
  const menuCategories = await getMenuCategories(organization.id, branchId)
  const megaMenuItems = await getMegaMenuItems(organization.id, branchId)

  return {
    organization,
    outlet,          // ← NUEVO: branch object o null
    branchId,        // ← NUEVO: number | undefined
    primaryColor,
    template,
    headerNav,
    headerNavTree,
    footerNav,
    footerNavTree,
    menuCategories,
    megaMenuItems,
    websiteMenus: footerMenus,
    frozenReason,
    showCurrencyCode,
    currencyPosition,
  }
}
```

> **Si no hay outlet** → `outlet = null`, `branchId = undefined`. Las queries
> reciben `undefined` y **no filtran** por branch (backward compat: traen todo
> el contenido de la org sin distinción de branch). Ver §5.0 para la regla
> completa de los tres estados de `branchId`.

---

## 5. Cambios en `queries.ts`

> Archivo: `C:\Users\USUARIO\goadmin-websites\lib\supabase\queries.ts`

Para cada función listada, añadir parámetro opcional `branchId?: number | null`.
La semántica del filtro depende del valor de `branchId`:

### 5.0 Regla de filtro `branch_id`

| Valor de `branchId` | Filtro SQL | Significado |
|---|---|---|
| `undefined` | **NINGUNO** (no filtrar por `branch_id`) | Backward compat: sitio global sin outlet awareness. Trae TODO incluyendo outlets. Para sitios legacy que no saben de outlets. |
| `null` | `branch_id IS NULL` | Solo contenido global de la org (sin outlets). |
| `X` (number) | `branch_id = X OR branch_id IS NULL` | Contenido del outlet X + globales de la org. |

> **Por qué `undefined` no filtra**: los sitios que aún no participan de
> multi-outlet pasan `branchId = undefined` (o no lo pasan). Esos sitios deben
> comportarse exactamente como antes: traer todo el contenido de la org sin
> distinción de branch. Si filtráramos `branch_id IS NULL` para `undefined`,
> los sitios legacy que tienen filas con `branch_id = NULL` y filas con
> `branch_id` seteado perderían contenido sin haber migrado.

> **Patrón de código** para todas las queries (excepto `getWebsitePageBySlug`
> que usa fallback, ver §5.1):
> ```typescript
> if (branchId === null) {
>   query = query.is('branch_id', null)
> } else if (branchId !== undefined) {
>   query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
> }
> // branchId === undefined → no se añade ningún filtro de branch_id
> ```

### 5.1 `getWebsitePageBySlug` (línea 1027)

> **QA**: el uso de `.single()` lanza error cuando hay múltiples resultados
> (página del outlet + página global con el mismo slug). Se reemplaza por
> una estrategia de **dos búsquedas secuenciales** con `.maybeSingle()`: buscar
> primero la página del outlet, y si no existe, buscar la global.
>
> **Corrección QA R7**: el snippet anterior usaba
> `.or('branch_id.eq.X,branch_id.is.null').maybeSingle()`, que puede devolver
> **2 filas** (la del outlet + la global) cuando ambas existen con el mismo
> slug. Aunque `.maybeSingle()` no lanza error con múltiples filas (devuelve
> `null` en ese caso), el resultado es incorrecto: la página no se encuentra
> aunque existe. La solución es hacer **dos queries separadas**: primero la del
> outlet (`.eq('branch_id', branchId).maybeSingle()`), y si no existe, la
> global (`.is('branch_id', null).maybeSingle()`). Cada query devuelve como
> máximo 1 fila, evitando la ambigüedad.

```typescript
export async function getWebsitePageBySlug(
  organizationId: number,
  slug: string,
  branchId?: number | null
): Promise<WebsitePageWithSections | null> {
  const supabase = getSupabaseForPublicRead()

  const select = `
    *,
    website_page_sections (
      id, section_type, section_variant, content, settings, sort_order, is_visible
    )
  `

  // 1. Si hay outlet activo, buscar primero la página del outlet
  if (typeof branchId === 'number') {
    const { data: outletPage } = await supabase
      .from('website_pages')
      .select(select)
      .eq('organization_id', organizationId)
      .eq('slug', slug)
      .eq('is_published', true)
      .eq('branch_id', branchId)
      .maybeSingle()
    if (outletPage) return normalizePage(outletPage)
    // Fallback: buscar página global si no hay del outlet
  }

  // 2. Buscar página global (branch_id IS NULL)
  const { data, error } = await supabase
    .from('website_pages')
    .select(select)
    .eq('organization_id', organizationId)
    .eq('slug', slug)
    .eq('is_published', true)
    .is('branch_id', null)
    .maybeSingle()

  if (error || !data) return null
  return normalizePage(data)
}

// Helper para normalizar la página (extraído para reutilizar en los 3 caminos)
// Nota: se mantiene `any` porque el tipo de retorno de `.select()` de Supabase
// es complejo y varía según la query (joins anidados, selects con alias, etc.).
// Un tipado estricto requeriría generics que añadirían complejidad sin beneficio
// real aquí, ya que el cast a WebsitePageWithSections se hace inmediatamente.
function normalizePage(data: any): WebsitePageWithSections {
  const page = data as WebsitePageWithSections
  page.website_page_sections = (page.website_page_sections || [])
    .filter((s) => s.is_visible)
    .sort((a, b) => a.sort_order - b.sort_order)
  return page
}
```

> **Nota crítica (QA R6)**: para queries de fila única (como
> `getWebsitePageBySlug`), `undefined` y `null` se tratan igual: solo página
> global. La regla §5.0 de "undefined trae TODO" aplica solo a queries de
> **lista** (múltiples filas), no a `.maybeSingle()`. Si `branchId === undefined`
> no se filtrara por `branch_id IS NULL`, y existieran múltiples outlets con
> el mismo slug + una global, `.maybeSingle()` devolvería error (más de 1
> fila) en lugar de la página global esperada.
>
> **Corrección QA R7**: con la implementación de dos búsquedas secuenciales
> (outlet primero, global como fallback), cada query individual devuelve como
> máximo 1 fila, por lo que `.maybeSingle()` nunca recibe múltiples resultados.
> El caso `undefined` y `null` saltan directamente al paso 2 (global), que
> filtra `.is('branch_id', null)` — siempre 1 fila como máximo.

> **Prioridad**: página del outlet > página global. Si un outlet tiene su
> propia página `/menu`, esa prevalece sobre la global `/menu` de la org.
> Si el outlet no tiene página `/menu`, se sirve la global (fallback).

### 5.2 `getOrganizationProducts` (línea 247)

```typescript
export async function getOrganizationProducts(
  organizationId: number,
  limit = 12,
  branchId?: number | null
) {
  const supabase = getSupabaseForPublicRead()

  // Filtrar categorías según la regla de branch_id (ver §5.0)
  let categoryIds: number[] | null = null
  if (branchId !== undefined) {
    if (branchId === null) {
      // Solo categorías globales
      const { data: globalCats } = await supabase
        .from('categories')
        .select('id')
        .eq('organization_id', organizationId)
        .is('branch_id', null)
      categoryIds = (globalCats || []).map((c: any) => c.id)
    } else {
      // Categorías del outlet + globales
      const { data: cats } = await supabase
        .from('categories')
        .select('id')
        .eq('organization_id', organizationId)
        .or(`branch_id.eq.${branchId},branch_id.is.null`)
      categoryIds = (cats || []).map((c: any) => c.id)
    }
    if (categoryIds.length === 0) return []
  }

  let query = supabase
    .from('products')
    .select(`
      *, product_prices (*), product_images (...), stock_levels (...)
    `)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .is('parent_product_id', null)

  if (categoryIds) {
    query = query.in('category_id', categoryIds)
  }

  query = query.limit(limit)

  const { data, error } = await query
  if (error) return []

  // ... resto igual (variantes, filterStockByBranches) ...
  // NOTA STOCK: cuando branchId esté activo (número), filterStockByBranches
  // debe recibir [branchId] en lugar de getWebStockBranchIds(orgId) (todas las
  // sucursales web). Así el stock mostrado corresponde solo al outlet activo.
  // Ver §5.4 para el patrón completo.
  const products = data || []
  return products as Product[]
}
```

### 5.3 `getOrganizationCategories` (línea 433)

```typescript
export async function getOrganizationCategories(
  organizationId: number,
  branchId?: number | null
) {
  const supabase = getSupabaseForPublicRead()

  let query = supabase
    .from('categories')
    .select('*')
    .eq('organization_id', organizationId)

  // Regla de filtro branch_id (ver §5.0)
  if (branchId === null) {
    query = query.is('branch_id', null)
  } else if (branchId !== undefined) {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
  }
  // branchId === undefined → no filtrar (backward compat)

  const { data, error } = await query.order('rank', { ascending: true })

  if (error) return []
  return enrichCategoriesWithFallbackImage(supabase, data || [])
}
```

### 5.4 `getMenuProducts` (línea 1460)

```typescript
export async function getMenuProducts(
  organizationId: number,
  limit = 100,
  branchId?: number | null
) {
  const supabase = getSupabaseForPublicRead()

  // Filtrar por categorías según la regla de branch_id (ver §5.0)
  let categoryIds: number[] | null = null
  if (branchId !== undefined) {
    if (branchId === null) {
      const { data: globalCats } = await supabase
        .from('categories')
        .select('id')
        .eq('organization_id', organizationId)
        .is('branch_id', null)
      categoryIds = (globalCats || []).map((c: any) => c.id)
    } else {
      const { data: cats } = await supabase
        .from('categories')
        .select('id')
        .eq('organization_id', organizationId)
        .or(`branch_id.eq.${branchId},branch_id.is.null`)
      categoryIds = (cats || []).map((c: any) => c.id)
    }
    if (categoryIds.length === 0) return []
  }

  let query = supabase
    .from('products')
    .select(`
      *, product_prices (*), product_images (...), stock_levels (...), product_tag_relations ( tag_id )
    `)
    .eq('organization_id', organizationId)
    .eq('status', 'active')

  if (categoryIds) {
    query = query.in('category_id', categoryIds)
  }

  const { data, error } = await query.order('name', { ascending: true }).limit(limit)

  if (error) return []

  // NOTA STOCK: cuando branchId sea un número (outlet activo), pasar [branchId]
  // a filterStockByBranches en lugar de getWebStockBranchIds(orgId) (que trae
  // TODAS las sucursales web). Así el stock del menú refleja solo el outlet.
  const stockBranchIds = (branchId !== undefined && branchId !== null)
    ? [branchId]
    : await getWebStockBranchIds(organizationId)
  return filterStockByBranches(normalizeProductPrices(data || []), stockBranchIds)
}
```

### 5.5 `getOrganizationSpaces` (línea 754)

Hoy ya filtra por branches de la org. Hacer explícito el filtro por `branchId`
cuando se pasa:

```typescript
export async function getOrganizationSpaces(
  organizationId: number,
  branchId?: number | null
) {
  const supabase = getSupabaseForPublicRead()

  // Regla de filtro branch_id (ver §5.0):
  // - undefined → todos los branches de la org (sin filtro de branch_id, backward compat)
  // - null → solo espacios globales (branch_id IS NULL)
  // - X → espacios del outlet X + globales (branch_id = X OR branch_id IS NULL)
  let query = supabase
    .from('spaces')
    .select('id, name, description, branch_id, capacity, is_active, status, label, organization_id')
    .eq('organization_id', organizationId)
    .eq('status', 'available')

  if (branchId === null) {
    query = query.is('branch_id', null)
  } else if (branchId !== undefined) {
    // Outlet + globales: espacios del branch específico + espacios globales
    // que aplican a todos los outlets (branch_id IS NULL)
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
  } else {
    // undefined: sin filtro de branch_id (backward compat, trae TODO)
  }

  const { data: spaces, error } = await query.order('label', { ascending: true })

  // ... resto igual (imágenes, servicios) ...
}
```

### 5.6 `getWebsiteHeaderNav` (línea 1105)

```typescript
export async function getWebsiteHeaderNav(
  organizationId: number,
  branchId?: number | null
): Promise<WebsitePage[]> {
  const supabase = getSupabaseForPublicRead()

  let query = supabase
    .from('website_pages')
    .select('id, slug, title, header_order, parent_page_id, linked_category_id, menu_icon, menu_badge')
    .eq('organization_id', organizationId)
    .eq('is_published', true)
    .eq('show_in_header', true)

  // Regla de filtro branch_id (ver §5.0)
  if (branchId === null) {
    query = query.is('branch_id', null)
  } else if (branchId !== undefined) {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
  }
  // branchId === undefined → no filtrar (backward compat)

  const { data, error } = await query.order('header_order', { ascending: true })

  if (error || !data) return []
  return data as WebsitePage[]
}
```

### 5.7 `getWebsiteFooterNav` (línea 1132)

```typescript
export async function getWebsiteFooterNav(
  organizationId: number,
  branchId?: number | null
): Promise<WebsitePage[]> {
  const supabase = getSupabaseForPublicRead()

  let query = supabase
    .from('website_pages')
    .select('id, slug, title, footer_order, parent_page_id, linked_category_id, menu_icon, menu_badge')
    .eq('organization_id', organizationId)
    .eq('is_published', true)
    .eq('show_in_footer', true)

  // Regla de filtro branch_id (ver §5.0)
  if (branchId === null) {
    query = query.is('branch_id', null)
  } else if (branchId !== undefined) {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
  }
  // branchId === undefined → no filtrar (backward compat)

  const { data, error } = await query.order('footer_order', { ascending: true })

  if (error || !data) return []
  return data as WebsitePage[]
}
```

> **`getWebsiteHeaderNavTree` y `getWebsiteFooterNavTree`** (líneas 1123, 1150)
> delegan en las funciones planas, así que heredan el parámetro automáticamente:

```typescript
export async function getWebsiteHeaderNavTree(
  organizationId: number,
  branchId?: number | null
): Promise<WebsitePageWithChildren[]> {
  const flat = await getWebsiteHeaderNav(organizationId, branchId)
  return buildMenuTree(flat)
}

export async function getWebsiteFooterNavTree(
  organizationId: number,
  branchId?: number | null
): Promise<WebsitePageWithChildren[]> {
  const flat = await getWebsiteFooterNav(organizationId, branchId)
  return buildMenuTree(flat)
}
```

### 5.8 `getMenuCategories` (línea ~1480)

> **QA**: `[[...slug]]/page.tsx` (§6.4) llama
> `getMenuCategories(organization.id, branchId)` pero la firma actual de
> `getMenuCategories` solo acepta `organizationId`. Se añade `branchId?`
> para que la llamada sea consistente y filtre categorías del outlet + globales.

```typescript
export async function getMenuCategories(
  organizationId: number,
  branchId?: number | null
) {
  const supabase = getSupabaseForPublicRead()

  let query = supabase
    .from('categories')
    .select('*')
    .eq('organization_id', organizationId)

  // Regla de filtro branch_id (ver §5.0)
  if (branchId === null) {
    query = query.is('branch_id', null)
  } else if (branchId !== undefined) {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
  }
  // branchId === undefined → no filtrar (backward compat)

  const { data, error } = await query.order('rank', { ascending: true })

  if (error) return []
  return data || []
}
```

> Sin este cambio, la llamada `getMenuCategories(organization.id, branchId)`
> en `page.tsx` pasaría `branchId` como segundo argumento ignorado, y las
> categorías del header mostrarían categorías de toda la org (no del outlet).

---

## 6. Cambios en `[[...slug]]/page.tsx`

> Archivo: `C:\Users\USUARIO\goadmin-websites\app\[[...slug]]\page.tsx`

### 6.1 Problema actual

`getOrganizationFromHeaders()` (línea 52) resuelve la org pero no el outlet.
`CatchAllPage` (línea 137) usa `currentSlug = slug?.[0]` sin considerar que el
primer segmento pueda ser el slug de un outlet.

### 6.2 Cambios

1. Después de resolver `organization`, resolver `outlet`.
2. Si outlet existe y el primer segmento del path matchea `outlet.slug`,
   **remover ese segmento** del path (el resto es la página).
3. Pasar `branchId` a todas las queries (`getWebsitePageBySlug`,
   `getOrganizationProducts`, `getOrganizationCategories`, `getMenuProducts`,
   `getOrganizationSpaces`, `getWebsiteHeaderNav`, `getWebsiteFooterNav`, etc.).
4. Pasar `outlet` al `OrganizationLayout`.

### 6.3 Código — resolución de outlet + path

```typescript
import { getOutletBySlug, getOutletBySubdomain, getOutletByCustomDomain } from '@/lib/supabase/queries'
import type { OrganizationWithDetails } from '@/types/organization';
import type { Branch } from '@/types/branch';

async function getOrganizationFromHeaders() {
  const headersList = await headers()
  const subdomain = headersList.get('x-subdomain')
  const customDomain = headersList.get('x-custom-domain')
  const identifier = customDomain || subdomain
  if (!identifier) return null
  return getOrganizationByHost(identifier)
}

/**
 * Resuelve el outlet (branch) activo.
 * Prioridad:
 *  1. x-outlet-subdomain (sub-subdomain del sistema)
 *  2. x-custom-outlet-domain (dominio personalizado de branch)
 *  3. Primer segmento del path contra branches.slug
 *
 * Devuelve { outlet, pathSegments } donde pathSegments tiene el segmento
 * del outlet removido si se resolvió por path prefix.
 */
async function resolveOutlet(
  organization: OrganizationWithDetails,
  slug: string[] | undefined
): Promise<{ outlet: Branch | null; pathSegments: string[] }> {
  const headersList = await headers()
  const outletSubdomain = headersList.get('x-outlet-subdomain')
  const customOutletDomain = headersList.get('x-custom-outlet-domain')

  const segments = slug || []

  // 1. Sub-subdomain
  if (outletSubdomain) {
    const outlet = await getOutletBySubdomain(organization.id, outletSubdomain)
    return { outlet, pathSegments: segments }
  }

  // 2. Dominio personalizado de branch
  if (customOutletDomain) {
    const outlet = await getOutletByCustomDomain(organization.id, customOutletDomain)
    return { outlet, pathSegments: segments }
  }

  // 3. Path prefix: primer segmento contra branches.slug
  if (segments.length > 0) {
    const candidate = segments[0]
    const outlet = await getOutletBySlug(organization.id, candidate)
    if (outlet) {
      // Remover el segmento del outlet del path
      return { outlet, pathSegments: segments.slice(1) }
    }
  }

  return { outlet: null, pathSegments: segments }
}
```

> **QA — No duplicar queries de headers/footer**: `getOrgContext` (§4.3) ya
> resuelve `outlet` y `branchId`, y ya consulta `getWebsiteHeaderNav`,
> `getWebsiteHeaderNavTree`, `getWebsiteFooterNav`, `getWebsiteFooterNavTree`.
> `page.tsx` **no debe volver a resolver el outlet ni re-consultar esos
> headers/footer**. En su lugar, `page.tsx` debe:
>
> 1. Llamar a `getOrgContext(slug?.[0])` que devuelve `{ organization, outlet,
>    branchId, headerNav, headerNavTree, footerNav, footerNavTree, ... }`.
> 2. Consumir `outlet` y `branchId` directamente del return de `getOrgContext`.
> 3. Reutilizar `headerNav`, `headerNavTree`, `footerNav`, `footerNavTree` del
>    return — no volver a llamar a esas queries.
> 4. Solo llamar a `resolveOutlet` como **fallback** si `getOrgContext` no
>    encontró outlet por headers Y se necesita resolver por path prefix.
>    `resolveOutlet` debe recibir el `outlet` ya resuelto (si lo hay) para no
>    re-hacer el lookup.
>
> **Patrón en `page.tsx`**:
> ```typescript
> const ctx = await getOrgContext(slug?.[0])
> if (!ctx) return <NotFoundPage />
> const { organization, outlet, branchId, headerNav, headerNavTree,
>         footerNav, footerNavTree, menuCategories, ... } = ctx
>
> // Solo si getOrgContext no resolvió outlet por headers, intentar path prefix
> let pathSegments = slug || []
> if (!outlet && slug?.[0]) {
>   const resolved = await resolveOutlet(organization, slug)
>   // usar resolved.outlet y resolved.pathSegments si encontró branch
> }
> ```
>
> Esto evita que `page.tsx` haga queries duplicadas de headers/footer que
> `getOrgContext` ya resolvió.

### 6.4 Uso en `CatchAllPage`

```typescript
export default async function CatchAllPage({ params, searchParams }: { ... }) {
  const { slug } = await params

  // --- getOrgContext resuelve org + outlet + navegación en una sola llamada ---
  // No duplicar queries: getOrgContext ya consulta headers, footer, menús.
  // page.tsx consume outlet y branchId de aquí.
  const ctx = await getOrgContext(slug?.[0])
  if (!ctx) return <NotFoundPage />

  const {
    organization, primaryColor, template,
    headerNav, headerNavTree, footerNav, footerNavTree,
    menuCategories, megaMenuItems, websiteMenus: footerMenus,
    frozenReason, showCurrencyCode, currencyPosition
  } = ctx
  // --- Guard anti-doble resolución de outlet ---
  // Si getOrgContext ya intentó resolver el outlet por path prefix (pasando
  // slug?.[0] como pathFirstSegment) y devolvió `outlet`, page.tsx NO debe
  // llamar resolveOutlet nuevamente. resolveOutlet solo se llama como fallback
  // cuando getOrgContext no pudo resolver el outlet (caso de subdomain o
  // custom domain que el middleware ya resolvió via headers, o cuando
  // getOrgContext no recibió pathFirstSegment).
  //
  // Guard canónico:
  //   const outlet = ctx.outlet ?? (ctx.branchId ? null : await resolveOutlet(organization, slug))
  // Forma expandida (para manejar también pathSegments):
  let outlet = ctx.outlet
  let branchId = ctx.branchId

  // --- Ajustar pathSegments: remover el segmento del outlet si aplica ---
  // Si getOrgContext resolvió el outlet por headers (sub-subdomain /
  // custom-domain), el path NO incluye el segmento del outlet → usar slug tal cual.
  // Si getOrgContext resolvió por path prefix (slug?.[0] = outlet.slug), o si
  // resolveOutlet lo resolvió por path prefix, hay que remover el primer segmento.
  let pathSegments = slug || []
  if (!outlet && slug?.[0]) {
    // getOrgContext no encontró outlet — intentar path prefix como fallback.
    // resolveOutlet solo se llama aquí, nunca cuando ctx.outlet ya existe.
    const resolved = await resolveOutlet(organization, slug)
    if (resolved.outlet) {
      outlet = resolved.outlet
      branchId = resolved.outlet.id
      pathSegments = resolved.pathSegments
    }
  } else if (outlet && slug?.[0] && slug[0] === outlet.slug) {
    // getOrgContext resolvió por path prefix — remover el segmento del outlet
    pathSegments = slug.slice(1)
  }

  // El slug de la página es el primer segmento DESPUÉS del outlet (o 'home')
  const currentSlug = pathSegments[0] || 'home'

  // --- Queries de contenido específico de la página (con branchId) ---
  // headerNav, headerNavTree, footerNav, footerNavTree, menuCategories ya
  // vienen de getOrgContext (ctx) — no re-consultarlos aquí.
  const page = await getWebsitePageBySlug(organization.id, currentSlug, branchId)

  if (page && page.website_page_sections.length > 0) {
    // Pre-fetch con branchId
    if (sectionTypes.includes('room_types')) {
      data.spaces = await getOrganizationSpaces(organization.id, branchId)
    }
    if (needsProducts) {
      data.products = await getOrganizationProducts(organization.id, 500, branchId)
    }
    if (sectionTypes.includes('categories_grid') || needsProducts) {
      data.categories = await getOrganizationCategories(organization.id, branchId)
    }

    return (
      <OrganizationLayout
        organization={organization}
        outlet={outlet}           // ← NUEVO
        branchId={branchId}       // ← NUEVO
        template={template}
        primaryColor={primaryColor}
        headerNav={headerNav}
        headerNavTree={headerNavTree}
        // ...
      >
        {/* ... */}
      </OrganizationLayout>
    )
  }

  // Fallbacks (menu, productos, espacios) también con branchId
  const fallback = await renderSlugFallback(
    currentSlug, organization, outlet, branchId, primaryColor, template,
    headerNav, headerNavTree, menuCategories, megaMenuItems,
    footerMenus, footerNav, footerNavTree, metaPixelId, googleAdsConfig,
    resolvedSearchParams, taxSettings, frozenReason
  )
  if (fallback) return fallback

  // 404
  // ...
}
```

### 6.5 `renderSlugFallback` — pasar `branchId` a las queries internas

En el caso `'menu'` (línea 376):

```typescript
case 'menu': {
  const [menuProducts, menuCategories, ...] = await Promise.all([
    getMenuProducts(organization.id, 200, branchId),
    getOrganizationCategories(organization.id, branchId),
    // ...
  ])
  // ...
}
```

En el caso `'productos'` (línea 417):

```typescript
case 'productos': {
  const [products, categories] = await Promise.all([
    getOrganizationProducts(organization.id, 500, branchId),
    getOrganizationCategories(organization.id, branchId)
  ])
  // ...
}
```

En el caso `'espacios'` (línea 450):

```typescript
case 'espacios': {
  const allSpaces = await getOrganizationSpaces(organization.id, branchId)
  // ...
}
```

---

## 7. Nueva query: `getOutletBySlug`

Añadir a `queries.ts`:

```typescript
/**
 * Obtiene un outlet (branch) por su slug dentro de una organización.
 * Solo devuelve branches publicados en la web (is_web_published = true).
 */
export async function getOutletBySlug(organizationId: number, slug: string) {
  const supabase = getSupabaseForPublicRead()
  const { data } = await supabase
    .from('branches')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('slug', slug)
    .eq('is_web_published', true)
    .maybeSingle()
  return data
}

/**
 * Obtiene un outlet por subdomain (sub-subdomain del sistema).
 */
export async function getOutletBySubdomain(organizationId: number, subdomain: string) {
  const supabase = getSupabaseForPublicRead()
  const { data } = await supabase
    .from('branches')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('subdomain', subdomain)
    .eq('is_web_published', true)
    .maybeSingle()
  return data
}

/**
 * Obtiene un outlet por dominio personalizado.
 */
export async function getOutletByCustomDomain(organizationId: number, host: string) {
  const supabase = getSupabaseForPublicRead()
  const { data } = await supabase
    .from('branches')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('custom_domain', host)
    .eq('is_web_published', true)
    .maybeSingle()
  return data
}
```

> **Dependencia FASE-0**: estas queries requieren que `branches` tenga las
> columnas `slug`, `subdomain`, `custom_domain`, `is_web_published` (añadidas en
> FASE-0). Sin esas columnas, las queries fallan.

---

## 8. `website_settings` por branch — división entre F1 y F2

> **QA**: FASE-0 añadió `branch_id` (nullable) a `website_settings`, pero F1
> no lo usa. Esta sección aclara quién consume esa columna y cuándo.

### 8.1 F1 — solo resuelve el outlet

FASE 1 **no** lee `website_settings.branch_id`. El alcance de F1 es
exclusivamente:

1. Resolver el outlet (branch) activo desde la URL (middleware + `getOrgContext`
   + `resolveOutlet`).
2. Propagar `branchId` a las queries de **contenido** (páginas, productos,
   categorías, espacios, navegación).

Las `website_settings` que F1 lee son las **de la organización** (fila con
`branch_id IS NULL`), igual que antes. No hay merge de settings por branch en
F1. El `primaryColor`, `template`, `showCurrencyCode`, `currencyPosition` que
devuelve `getOrgContext` vienen todos de la settings global de la org.

### 8.2 F2 (Theme Override) — hace el merge de settings

FASE 2 es la que usa `website_settings.branch_id`. Cuando F2 esté
implementada, el flujo será:

1. F1 resuelve el outlet y devuelve `branchId` (como ya hace).
2. F2 lee `website_settings` con `branch_id = branchId` (settings del outlet).
3. Si existen settings del outlet, se hace un **merge shallow** sobre las
   settings globales de la org: los campos definidos en el outlet prevalecen;
   los que sean `null` en el outlet caen al valor global.
4. El resultado del merge es lo que se usa para `primaryColor`, `template`,
   logos, fuentes, etc.

**Esquema del merge (F2)**:

```typescript
// F2 — no implementar en F1
const globalSettings = await getWebsiteSettings(organizationId, null)
const branchSettings = branchId
  ? await getWebsiteSettings(organizationId, branchId)
  : null

const effectiveSettings = branchSettings
  ? { ...globalSettings, ...stripNulls(branchSettings) }
  : globalSettings
```

### 8.3 Por qué F1 no hace el merge

- **Alcance**: F1 es solo resolución de outlet. Mezclar theme override
  (F2) con resolución de outlet (F1) complica el testing y el rollback.
- **Dependencia**: el merge de settings requiere definir qué campos son
  overrideables por branch (¿solo color? ¿logo? ¿fuente? ¿layout?). Eso
  es diseño de F2, no de F1.
- **Backward compat**: si F1 no toca `website_settings.branch_id`, el
  sitio sin outlets funciona idéntico a antes (settings globales).

> **Acción F1**: documentar en el código de `getOrgContext` que
> `primaryColor`/`template`/etc. vienen de settings globales y que F2
> los reemplazará por el merge. Marcar con un comentario
> `// TODO F2: merge with branch settings`.

---

## 9. Definition of Done

- [ ] `middleware.ts` inyecta `x-outlet-subdomain` cuando hay sub-subdomain
      (`hotel.tugranhotel.goadmin.io`).
- [ ] `middleware.ts` inyecta `x-custom-outlet-domain` cuando el dominio
      personalizado podría ser de un branch.
- [ ] `middleware.ts` hace lookup de `branches.custom_domain` →
      `organization_id` → `organizations.subdomain` para setear
      `x-custom-domain` con el **identificador de la org** (NO el hostname del
      branch) cuando el dominio custom pertenece a un branch (Opción A, §2.3).
      `x-custom-outlet-domain` lleva el hostname del branch.
- [ ] `middleware.ts` no setea `x-custom-outlet-domain` si el lookup de
      `branches.custom_domain` no matchea (cae a flujo `custom-org`).
- [ ] `middleware.ts` ignora el segmento `www` en `resolveHost` y toma el
      siguiente como candidato a outlet (§3.3).
- [ ] `middleware.ts` usa `matchSystemDomain` (comparación contra lista de
      `SYSTEM_DOMAINS`) en vez de split por puntos simple, soportando TLDs de
      múltiples partes como `goadmin.co.uk` (§3.3).
- [ ] `getWebsitePageBySlug` usa `.maybeSingle()` con fallback
      outlet → global (no `.single()`).
- [ ] **Regla de filtro `branch_id`** (§5.0): `undefined` → no filtrar;
      `null` → `IS NULL`; `X` → `= X OR IS NULL`. Todas las queries de
      contenido siguen esta regla consistentemente.
- [ ] `page.tsx` consume `outlet`, `branchId`, `headerNav`, `headerNavTree`,
      `footerNav`, `footerNavTree` del return de `getOrgContext` — no vuelve
      a resolverlos ni duplica queries (§6.3).
- [ ] `filterStockByBranches` recibe `[branchId]` cuando hay outlet activo,
      no `getWebStockBranchIds(orgId)` (§5.2, §5.4).
- [ ] `getOrganizationSpaces` incluye espacios globales (`OR branch_id IS NULL`)
      cuando `branchId` es un número (§5.5).
- [ ] `getMenuCategories` acepta `branchId?: number | null` y filtra según
      la regla de §5.0 (outlet + globales cuando es número, solo globales
      cuando es null, sin filtro cuando es undefined).
- [ ] `get-org-context.ts` resuelve `outlet` (por sub-subdomain, dominio custom
      de branch, o path prefix) y lo devuelve junto a `branchId`.
- [ ] `queries.ts` acepta `branchId?` en: `getWebsitePageBySlug`,
      `getOrganizationProducts`, `getOrganizationCategories`, `getMenuProducts`,
      `getOrganizationSpaces`, `getWebsiteHeaderNav`, `getWebsiteFooterNav`,
      `getWebsiteHeaderNavTree`, `getWebsiteFooterNavTree`, `getMenuCategories`.
- [ ] `queries.ts` incluye `getOutletBySlug`, `getOutletBySubdomain`,
      `getOutletByCustomDomain`.
- [ ] `[[...slug]]/page.tsx` resuelve outlet, remueve el segmento del path cuando
      aplica, y pasa `branchId` a todas las queries.
- [ ] `[[...slug]]/page.tsx` pasa `outlet` al `OrganizationLayout`.
- [ ] **Backward compat**: sitio global sin outlet (`tugranhotel.goadmin.io/`)
      sigue funcionando igual (`outlet = null`, `branchId = undefined`).
- [ ] **Caso de uso**: `tugranhotel.goadmin.io/restaurante-1/menu` carga el menú
      del restaurante 1 (productos de las categorías del branch 2 + globales).
- [ ] **Caso de uso**: `hotel.tugranhotel.goadmin.io/` carga la home del hotel
      (páginas con `branch_id = 1` + globales).
- [ ] **Caso de uso (Opción A)**: `tugranhotel.com/` carga el hotel
      (branch con `custom_domain='tugranhotel.com'`) en el root, sin path
      prefix ni subdominio. `tugranhotel.com/restaurante-1/menu` carga el
      restaurante 1 por path prefix.
- [ ] `npm run lint` + `tsc --noEmit` limpios en `goadmin-websites`.
- [ ] Cero archivos `.sql` en el repo (los cambios de BD son FASE-0 vía MCP).

---

## 10. Riesgos

### 10.1 SEO: path prefix vs subdomain

- **Sub-subdomain** (`hotel.tugranhotel.com`) es mejor para SEO: cada outlet es
  un "sitio" distinto, Google los indexa por separado, y el path del outlet no
  compite con páginas globales.
- **Path prefix** (`tugranhotel.com/restaurante-1/menu`) es más simple de
  configurar (no requiere DNS wildcard ni certificados por outlet) pero Google
  lo trata como parte del mismo sitio. Si dos outlets tienen la misma página
  (`/menu`), el path prefix los diferencia (`/restaurante-1/menu` vs
  `/restaurante-2/menu`), pero la autoridad de dominio se comparte.

**Recomendación**: ofrecer ambos mecanismos (ya implementado en esta fase).
Documentar para el usuario que subdomain es preferible para outlets con mucho
tráfico SEO, y path prefix para outlets secundarios o menús digitales que no
necesitan indexación independiente.

### 10.2 Cache

Si el sitio se cachea por host (CDN, `revalidate`, ISR), el contenido cambia
según el outlet. Hay que invalidar cache **por outlet**, no solo por org.

- `export const revalidate = 60` (línea 50 de `page.tsx`) cachea por path. Con
  path prefix, `tugranhotel.com/restaurante-1/menu` y
  `tugranhotel.com/restaurante-2/menu` son paths distintos → cache separado
  (OK).
- Con sub-subdomain, `hotel.tugranhotel.com/` y `tugranhotel.com/` son hosts
  distintos → cache separado (OK si la CDN cachea por host).
- **Peligro**: si se cachea a nivel de path sin incluir el host/outlet en la
  cache key, dos outlets con el mismo path (`/menu`) servirían contenido
  cruzado. Verificar la config de CDN/Vercel para que la cache key incluya el
  host completo.

### 10.3 Performance

- `resolveOutlet` hace 1 query extra por request (lookup de branch). Para
  mitigar, se puede cachear el resultado por host en memoria (edge) con TTL
  corto (60s). No implementar en FASE-1; documentar para optimización futura.
- Las queries con `branchId` hacen un `or(branch_id.eq.X,branch_id.is.null)`.
  Asegurar que existe un índice parcial en `(organization_id, branch_id)` en
  `website_pages`, `categories` (tarea de FASE-0).

### 10.4 Colisión de slugs

Si un outlet tiene `slug = 'menu'` y la org tiene una página global con
`slug = 'menu'`, el path prefix `tugranhotel.com/menu` podría interpretarse como
outlet `menu` (incorrecto). **Mitigación**: `getOutletBySlug` solo matchea
branches con `is_web_published = true`; los slugs de outlet deben ser únicos y
no coincidir con slugs de páginas globales. Validar en FASE-6 (editor de
sucursales) que el slug del branch no colisione con páginas existentes.

---

## 11. Verificación post-implementación

> **QA R2**: esta sección define los checks que deben ejecutarse después de
> implementar F1 para validar que la resolución de outlet funciona end-to-end
> en todos los mecanismos (path prefix, sub-subdomain, custom domain de org,
> custom domain de branch).

### 11.1 Checks de middleware (inyección de headers)

Para cada caso, verificar que el middleware inyecta los headers correctos:

| URL | Headers esperados | Verificación |
|---|---|---|
| `tugranhotel.goadmin.io/` | `x-subdomain: tugranhotel` (sin outlet headers) | `console.log(request.headers.get('x-subdomain'))` en middleware |
| `tugranhotel.goadmin.io/restaurante-1/menu` | `x-subdomain: tugranhotel` (sin outlet headers — el outlet se resuelve por path en getOrgContext) | Confirmar que NO hay `x-outlet-subdomain` ni `x-custom-outlet-domain` |
| `hotel.tugranhotel.goadmin.io/` | `x-subdomain: tugranhotel`, `x-outlet-subdomain: hotel` | Verificar ambos headers presentes |
| `restaurante1.tugranhotel.goadmin.io/` (sub-subdomain) | `x-subdomain: tugranhotel`, `x-outlet-subdomain: restaurante1` | Verificar ambos headers presentes |
| `tugranhotel.com/` (custom domain de org) | `x-custom-domain: tugranhotel.com` | Sin `x-custom-outlet-domain` |
| `restaurante1.tugranhotel.com/` (custom domain de branch) | `x-custom-domain: <org-subdomain>`, `x-custom-outlet-domain: restaurante1.tugranhotel.com` | Ambos headers; `x-custom-domain` lleva el identificador de la org, NO el hostname del branch |

**Query SQL para validar el lookup del middleware** (custom domain de branch):

```sql
-- Verificar que branches.custom_domain existe y está sin www
SELECT id, organization_id, slug, subdomain, custom_domain, is_web_published
FROM branches
WHERE custom_domain IS NOT NULL;
```

### 11.2 Checks de `getOrgContext`

Verificar que `getOrgContext` devuelve `outlet` y `branchId` correctamente:

```typescript
// Test manual en un Server Component temporal:
const ctx = await getOrgContext(slug?.[0])
console.log({
  hasOrg: !!ctx?.organization,
  hasOutlet: !!ctx?.outlet,
  branchId: ctx?.branchId,
  outletSlug: ctx?.outlet?.slug,
  navCount: ctx?.headerNav?.length,
})
```

| URL | `ctx.outlet` | `ctx.branchId` | `ctx.headerNav` |
|---|---|---|---|
| `tugranhotel.goadmin.io/` | `null` | `undefined` | páginas globales de la org |
| `tugranhotel.goadmin.io/restaurante-1/menu` | branch restaurante-1 | ID del branch | páginas del branch + globales |
| `hotel.tugranhotel.goadmin.io/` | branch hotel | ID del branch | páginas del branch + globales |
| `tugranhotel.com/` (custom domain de org) | `null` (global = hotel) | `undefined` | páginas globales (= hotel en root) |
| `restaurante1.tugranhotel.com/` (custom domain de branch) | branch restaurante1 | ID del branch | páginas del branch + globales |

### 11.3 Checks de `page.tsx` (consumo de outlet de getOrgContext)

Verificar que `page.tsx` **no llama `resolveOutlet`** cuando `getOrgContext` ya
resolvió el outlet:

```typescript
// Instrumentación temporal en CatchAllPage:
const ctx = await getOrgContext(slug?.[0])
console.log('ctx.outlet:', ctx?.outlet?.slug ?? 'null')
// Si ctx.outlet existe, resolveOutlet NO debe ejecutarse.
// Si ctx.outlet es null y hay slug[0], resolveOutlet se llama como fallback.
```

**Anti-patrón a detectar**: si los logs muestran que `getOutletBySlug` se
ejecuta dos veces para la misma URL (una en `getOrgContext` por
`pathFirstSegment` y otra en `resolveOutlet`), el guard de §6.4 no está
funcionando. Revisar que `page.tsx` usa el patrón:

```typescript
const outlet = ctx.outlet ?? (ctx.branchId ? null : await resolveOutlet(organization, slug))
```

### 11.4 Matriz de URLs de prueba end-to-end

Ejecutar cada URL y verificar el contenido renderizado (outlet correcto,
páginas correctas, navegación correcta):

| # | URL | Outlet esperado | Página esperada | Mecanismo | Notas |
|---|---|---|---|---|---|
| 1 | `tugranhotel.com/` | hotel (global, sin path prefix) | home del hotel | `custom-org` (dominio de la organización, NO de branch). Outlet: hotel = página global (sin path prefix) | El hotel vive en el root de la org |
| 2 | `tugranhotel.com/restaurante-1/menu` | restaurante-1 (path prefix) | menu del restaurante-1 | path prefix | Segmento `restaurante-1` removido del path |
| 3 | `tugranhotel.com/habitaciones` | hotel (global, sin path prefix) | habitaciones del hotel | `custom-org` + path. Outlet: hotel (global, sin segmento de outlet en path) | Sin segmento de outlet en el path |
| 4 | `hotel.tugranhotel.goadmin.io/` | hotel (sub-subdomain) | home del hotel | sub-subdomain del sistema | `x-outlet-subdomain: hotel` |
| 5 | `restaurante1.tugranhotel.goadmin.io/` | restaurante-1 (sub-subdomain) | home del restaurante-1 | sub-subdomain del sistema | `x-outlet-subdomain: restaurante1` |
| 6 | `restaurante1.tugranhotel.com/` | restaurante-1 (custom domain) | home del restaurante-1 | `custom-outlet` (3 etiquetas, `branches.custom_domain`) | Outlet: restaurante-1 |

**Para cada URL, verificar**:

1. **Outlet resuelto**: el `OrganizationLayout` recibe el `outlet` correcto
   (puede loguearse o verificarse con un data-attribute temporal
   `data-outlet-slug={outlet?.slug}`).
2. **Página correcta**: `getWebsitePageBySlug` devuelve la página del outlet
   (no la global si el outlet tiene su propia página con ese slug).
3. **Navegación correcta**: `headerNav` y `footerNav` contienen páginas del
   outlet + globales (no páginas de otros outlets).
4. **Categorías/menú correctos**: `getMenuCategories` y `getMegaMenuItems`
   reflejan el outlet activo (ver §4.3 — `getOrgContext` pasa `branchId`).
5. **Stock correcto**: `filterStockByBranches` recibe `[branchId]` cuando hay
   outlet activo (no `getWebStockBranchIds(orgId)` que trae todas las
   sucursales web).
6. **Sin doble query**: `getOutletBySlug` se ejecuta máximo 1 vez por request
   (ver §11.3).

### 11.5 Verificación de backward compat

| URL | Comportamiento esperado | Verificación |
|---|---|---|
| `tugranhotel.goadmin.io/` (org sin outlets) | `outlet = null`, `branchId = undefined`, contenido global | Las queries no filtran por `branch_id` (traen todo) |
| `tugranhotel.goadmin.io/menu` (org sin outlets) | Página global `menu` | `getWebsitePageBySlug` sin filtro de branch |
| Org con outlets pero URL sin outlet | `outlet = null`, `branchId = undefined` | Solo contenido global (`branch_id IS NULL` o sin filtro) |

> **Check crítico**: una org que NO tiene branches configurados debe
> comportarse **idéntico** a antes de F1. Si algo cambia (contenido
> desaparece, navegación rota), el filtro de `branchId` está mal aplicado —
> revisar que `undefined` no filtra (§5.0).
