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

```
tugranhotel.com/               → outlet = hotel (custom_domain match)
tugranhotel.com/habitaciones   → outlet = hotel, página = habitaciones
tugranhotel.com/restaurante-1  → outlet = restaurante-1 (path prefix)
tugranhotel.com/restaurante-2  → outlet = restaurante-2 (path prefix)
```

**Configuración de branches para este caso:**

| Branch | custom_domain | slug | branch_type | is_web_published |
|---|---|---|---|---|
| hotel | `tugranhotel.com` | (sin slug, no necesita path) | hotel | true |
| restaurante-1 | (null) | `restaurante-1` | restaurant | true |
| restaurante-2 | (null) | `restaurante-2` | restaurant | true |

**Prioridad de resolución en el middleware**:
1. Si el host matchea `branches.custom_domain` → resolver outlet por custom_domain (caso hotel).
2. Si el host matchea `organization_domains.host` → resolver org, luego outlet por path prefix.
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
  const isLocalhost = hostname.includes('localhost')

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

Reemplazar el bloque de líneas 52-96 por:

```typescript
  // --- Lógica de subdominios / dominios personalizados / outlets ---
  const resolved = resolveHost(hostname)

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
      isCustomOutletDomain = true
      // Lookup de org desde branches.custom_domain (Opción A, ver §2.3).
      // El middleware hace 2 queries: branches.custom_domain → organization_id
      // → organizations.subdomain. Setea x-custom-domain con el identificador
      // de la org para que get-org-context pueda resolverla.
      // En F2/F3 se reemplaza por cache en edge (Opción B).
      const branchRow = await resolveBranchOrgByCustomDomain(supabase, hostname)
      if (branchRow?.orgIdentifier) {
        subdomain = branchRow.orgIdentifier // identificador de la org
      }
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
  if (isCustomDomain) {
    supabaseResponse.headers.set('x-custom-domain', hostname)
  }
  if (isCustomOutletDomain) {
    supabaseResponse.headers.set('x-custom-outlet-domain', hostname)
  }

  return supabaseResponse
```

> **Nota**: para outlets por sub-subdomain del sistema
> (`hotel.tugranhotel.goadmin.io`), el middleware no consulta BD — solo
> separa etiquetas del host. Para dominios personalizados de **branch**
> (`restaurante1.tugranhotel.com`), el middleware sí hace un lookup de
> `branches.custom_domain` → `organization_id` → `organizations.subdomain`
> para setear **ambos** headers (`x-custom-outlet-domain` + `x-custom-domain`
> con el identificador de la org). Esto agrega 2 queries por request con
> dominio custom de branch (aceptable; ver §2.3 para la ruta de cache en F2).
> `get-org-context` recibe ambos headers y resuelve org + branch sin
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
3. Devolver `outlet` (branch object o `null`) además de `organization`.
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
import { getOutletBySubdomain, getOutletByCustomDomain, getOutletBySlug } from '@/lib/supabase/queries'

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
  let outlet: any | null = null

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

  return {
    organization,
    outlet,          // ← NUEVO: branch object o null
    branchId,        // ← NUEVO: number | undefined
    primaryColor,
    template,
    headerNav,
    headerNavTree: effectiveHeaderNavTree,
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
> reciben `undefined` y no filtran por branch (backward compat: contenido global
> de la org).

---

## 5. Cambios en `queries.ts`

> Archivo: `C:\Users\USUARIO\goadmin-websites\lib\supabase\queries.ts`

Para cada función listada, añadir parámetro opcional `branchId?: number`. Cuando
esté presente, filtrar `branch_id = branchId OR branch_id IS NULL` (páginas del
outlet + globales de la org). Excepción: `getWebsitePageBySlug` usa estrategia
de fallback con `.maybeSingle()` (ver §5.1).

### 5.1 `getWebsitePageBySlug` (línea 1027)

> **QA**: el uso de `.single()` lanza error cuando hay múltiples resultados
> (página del outlet + página global con el mismo slug). Se reemplaza por
> una estrategia de fallback con `.maybeSingle()`: buscar primero la página
> del outlet, y si no existe, buscar la global.

```typescript
export async function getWebsitePageBySlug(
  organizationId: number,
  slug: string,
  branchId?: number
): Promise<WebsitePageWithSections | null> {
  const supabase = getSupabaseForPublicRead()

  const select = `
    *,
    website_page_sections (
      id, section_type, section_variant, content, settings, sort_order, is_visible
    )
  `

  // 1. Si hay branchId, buscar primero la página del outlet (branch_id.eq.X)
  if (branchId !== undefined) {
    const { data: branchPage } = await supabase
      .from('website_pages')
      .select(select)
      .eq('organization_id', organizationId)
      .eq('slug', slug)
      .eq('is_published', true)
      .eq('branch_id', branchId)
      .maybeSingle() // 0 o 1 resultado (branch_id es único por slug dentro de un branch)

    if (branchPage) {
      return normalizePage(branchPage)
    }

    // 2. Fallback: página global (branch_id IS NULL)
    const { data: globalPage } = await supabase
      .from('website_pages')
      .select(select)
      .eq('organization_id', organizationId)
      .eq('slug', slug)
      .eq('is_published', true)
      .is('branch_id', null)
      .maybeSingle()

    if (globalPage) {
      return normalizePage(globalPage)
    }

    return null
  }

  // 3. Sin branchId: solo páginas globales (backward compat)
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
function normalizePage(data: any): WebsitePageWithSections {
  const page = data as WebsitePageWithSections
  page.website_page_sections = (page.website_page_sections || [])
    .filter((s) => s.is_visible)
    .sort((a, b) => a.sort_order - b.sort_order)
  return page
}
```

> **Prioridad**: página del outlet > página global. Si un outlet tiene su
> propia página `/menu`, esa prevalece sobre la global `/menu` de la org.
> Si el outlet no tiene página `/menu`, se sirve la global (fallback).

### 5.2 `getOrganizationProducts` (línea 247)

```typescript
export async function getOrganizationProducts(
  organizationId: number,
  limit = 12,
  branchId?: number
) {
  const supabase = getSupabaseForPublicRead()

  // Si hay branchId, obtener las categorías del branch + globales y filtrar
  let categoryIds: number[] | null = null
  if (branchId !== undefined) {
    const { data: cats } = await supabase
      .from('categories')
      .select('id')
      .eq('organization_id', organizationId)
      .or(`branch_id.eq.${branchId},branch_id.is.null`)
    categoryIds = (cats || []).map((c: any) => c.id)
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
}
```

### 5.3 `getOrganizationCategories` (línea 433)

```typescript
export async function getOrganizationCategories(
  organizationId: number,
  branchId?: number
) {
  const supabase = getSupabaseForPublicRead()

  let query = supabase
    .from('categories')
    .select('*')
    .eq('organization_id', organizationId)

  if (branchId !== undefined) {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
  }

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
  branchId?: number
) {
  const supabase = getSupabaseForPublicRead()

  // Filtrar por categorías del branch + globales (igual que getOrganizationProducts)
  let categoryIds: number[] | null = null
  if (branchId !== undefined) {
    const { data: cats } = await supabase
      .from('categories')
      .select('id')
      .eq('organization_id', organizationId)
      .or(`branch_id.eq.${branchId},branch_id.is.null`)
    categoryIds = (cats || []).map((c: any) => c.id)
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
  const webBranchIds = await getWebStockBranchIds(organizationId)
  return filterStockByBranches(normalizeProductPrices(data || []), webBranchIds)
}
```

### 5.5 `getOrganizationSpaces` (línea 754)

Hoy ya filtra por branches de la org. Hacer explícito el filtro por `branchId`
cuando se pasa:

```typescript
export async function getOrganizationSpaces(
  organizationId: number,
  branchId?: number
) {
  const supabase = getSupabaseForPublicRead()

  // Si hay branchId, usar solo ese branch; si no, todos los branches de la org
  let branchIds: number[]
  if (branchId !== undefined) {
    branchIds = [branchId]
  } else {
    const { data: branches } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', organizationId)
    if (!branches || branches.length === 0) return []
    branchIds = branches.map((b: any) => b.id)
  }

  const { data: spaces, error } = await supabase
    .from('spaces')
    .select(`...`)
    .in('branch_id', branchIds)
    .eq('status', 'available')
    .order('label', { ascending: true })

  // ... resto igual (imágenes, servicios) ...
}
```

### 5.6 `getWebsiteHeaderNav` (línea 1105)

```typescript
export async function getWebsiteHeaderNav(
  organizationId: number,
  branchId?: number
): Promise<WebsitePage[]> {
  const supabase = getSupabaseForPublicRead()

  let query = supabase
    .from('website_pages')
    .select('id, slug, title, header_order, parent_page_id, linked_category_id, menu_icon, menu_badge')
    .eq('organization_id', organizationId)
    .eq('is_published', true)
    .eq('show_in_header', true)

  if (branchId !== undefined) {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
  }

  const { data, error } = await query.order('header_order', { ascending: true })

  if (error || !data) return []
  return data as WebsitePage[]
}
```

### 5.7 `getWebsiteFooterNav` (línea 1132)

```typescript
export async function getWebsiteFooterNav(
  organizationId: number,
  branchId?: number
): Promise<WebsitePage[]> {
  const supabase = getSupabaseForPublicRead()

  let query = supabase
    .from('website_pages')
    .select('id, slug, title, footer_order, parent_page_id, linked_category_id, menu_icon, menu_badge')
    .eq('organization_id', organizationId)
    .eq('is_published', true)
    .eq('show_in_footer', true)

  if (branchId !== undefined) {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
  }

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
  branchId?: number
): Promise<WebsitePageWithChildren[]> {
  const flat = await getWebsiteHeaderNav(organizationId, branchId)
  return buildMenuTree(flat)
}

export async function getWebsiteFooterNavTree(
  organizationId: number,
  branchId?: number
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
  branchId?: number
) {
  const supabase = getSupabaseForPublicRead()

  let query = supabase
    .from('categories')
    .select('*')
    .eq('organization_id', organizationId)

  if (branchId !== undefined) {
    query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
  }

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
  organization: any,
  slug: string[] | undefined
): Promise<{ outlet: any | null; pathSegments: string[] }> {
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

### 6.4 Uso en `CatchAllPage`

```typescript
export default async function CatchAllPage({ params, searchParams }: { ... }) {
  const headersList = await headers()
  const subdomain = headersList.get('x-subdomain')
  const customDomain = headersList.get('x-custom-domain')
  const identifier = customDomain || subdomain

  if (!identifier) return <NotFoundPage />

  const organization = await getOrganizationByHost(identifier)
  if (!organization) return <NotFoundPage subdomain={identifier} />

  const { slug } = await params

  // --- NUEVO: resolver outlet ---
  const { outlet, pathSegments } = await resolveOutlet(organization, slug)
  const branchId = outlet?.id ?? undefined

  // El slug de la página es el primer segmento DESPUÉS del outlet (o 'home')
  const currentSlug = pathSegments[0] || 'home'

  // --- Queries con branchId ---
  const [headerNav, headerNavTree, footerNav, footerNavTree, menuCategories, ...] = await Promise.all([
    getWebsiteHeaderNav(organization.id, branchId),
    getWebsiteHeaderNavTree(organization.id, branchId),
    getWebsiteFooterNav(organization.id, branchId),
    getWebsiteFooterNavTree(organization.id, branchId),
    showCategoriesInHeader ? getMenuCategories(organization.id, branchId) : Promise.resolve([]),
    // ...
  ])

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
        headerNavTree={effectiveHeaderNavTree}
        // ...
      >
        {/* ... */}
      </OrganizationLayout>
    )
  }

  // Fallbacks (menu, productos, espacios) también con branchId
  const fallback = await renderSlugFallback(
    currentSlug, organization, outlet, branchId, primaryColor, template,
    headerNav, effectiveHeaderNavTree, menuCategories, megaMenuItems,
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
      `x-custom-domain` con el identificador de la org cuando el dominio
      custom pertenece a un branch (Opción A, §2.3).
- [ ] `middleware.ts` ignora el segmento `www` en `resolveHost` y toma el
      siguiente como candidato a outlet (§3.3).
- [ ] `middleware.ts` usa `matchSystemDomain` (comparación contra lista de
      `SYSTEM_DOMAINS`) en vez de split por puntos simple, soportando TLDs de
      múltiples partes como `goadmin.co.uk` (§3.3).
- [ ] `getWebsitePageBySlug` usa `.maybeSingle()` con fallback
      outlet → global (no `.single()`).
- [ ] `getMenuCategories` acepta `branchId?` y filtra por outlet + globales.
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
