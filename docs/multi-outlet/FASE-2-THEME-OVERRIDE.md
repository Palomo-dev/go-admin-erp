# Fase 2 — Theme Override por Outlet

> Fecha: 2026-08-31
> Depende de: F0 (Fundaciones BD), F1 (Resolución de Outlet)
> Repos Sitio: `C:\Users\USUARIO\goadmin-websites`
> Esfuerzo: S (1-2 días)

---

## 1. Objetivo

Permitir que cada outlet (branch) tenga su propio theme (colores, logo, template)
que se **mergea** sobre el theme base de la organización.

El outlet no duplica toda la configuración: solo sobrescribe los campos que
define explícitamente. El resto hereda del theme de la org.

---

## 2. Modelo de theme merge

```
themeFinal = {
  ...orgSettings,      // theme base de la org (branch_id IS NULL)
  ...outletSettings,   // override del outlet (solo campos no-null)
}
```

Reglas:

- `outletSettings` es una fila de `website_settings` con `branch_id = X`.
- Solo los campos que el outlet define (valor **no-null**) sobrescriben los de la org.
- Si el outlet no tiene settings (`branch_id IS NULL` o no existe fila), se usa
  el theme de la org sin cambios — **backward compatibility total**.

Ejemplo concreto:

```
orgSettings = {
  primary_color: '#1E40AF',   // azul corporativo
  secondary_color: '#0F172A',
  website_logo_url: 'logo-corp.png',
  template_id: 'aurora',
  theme_mode: 'light',
}

outletSettings (branch_id=2, restaurante-1) = {
  primary_color: '#B91C1C',    // rojo del restaurante
  secondary_color: null,       // no override → hereda '#0F172A'
  website_logo_url: 'logo-rest1.png',
  template_id: null,           // no override → hereda 'aurora'
  theme_mode: null,
}

themeFinal = {
  primary_color: '#B91C1C',    // ← override del outlet
  secondary_color: '#0F172A',  // ← heredado de la org
  website_logo_url: 'logo-rest1.png', // ← override del outlet
  template_id: 'aurora',       // ← heredado de la org
  theme_mode: 'light',         // ← heredado de la org
}
```

---

## 3. Nueva query: `getOutletSettings`

Ubicación: `goadmin-websites/lib/get-org-context.ts` (o archivo nuevo
`lib/get-outlet-settings.ts` si se prefiere separar).

```typescript
import { createClient } from '@/lib/supabase/server'
import type { WebsiteSettings } from '@/types/database'

/**
 * Obtiene los website_settings específicos de un outlet (branch).
 * Retorna null si el outlet no tiene settings propios (fallback a org).
 *
 * Requiere F0: columna `branch_id` en `website_settings`.
 */
export async function getOutletSettings(
  organizationId: number,
  branchId: number
): Promise<WebsiteSettings | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('website_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('branch_id', branchId)
    .maybeSingle()

  if (error) {
    console.error('[getOutletSettings] error:', error.message)
    return null
  }

  return data as WebsiteSettings | null
}
```

Notas:

- `maybeSingle()` (no `single()`) porque es válido que no exista fila para el
  outlet — en ese caso retorna `null` y se usa el theme de la org.
- La query filtra por `organization_id` + `branch_id`. La RLS existente por
  `organization_id` sigue aplicando sin cambios.
- **Implementación canónica**: la versión production de `getOutletSettings`
  (cacheada con `cache()` de React 19 y usando `getSupabaseForPublicRead`)
  está en **§3.1**, junto con `getOrgSettings`. El código de arriba muestra
  la lógica base; al implementar, usar la versión de §3.1.

> **Nota (QA R2)**: `getOutletSettings` no valida la forma del dato devuelto
> por Supabase (confía en el tipo `WebsiteSettings` del cast). Considerar
> añadir validación Zod para `getOutletSettings` en una fase futura, de forma
> que un campo inesperado o mal tipado se detecte en runtime antes de llegar
> al merge. No es bloqueante para F2 — el cast `as WebsiteSettings` es
> suficiente mientras el esquema de BD y los tipos generados estén alineados.

### 3.1 Query directa de settings (desbloqueo de F0)

F0 §2.0 exige que F2 haga query directa de `website_settings` por
`(organization_id, branch_id IS NULL)` en lugar de depender del select
anidado `organization.website_settings` que devuelve PostgREST al expandir
la FK `organizations → website_settings`.

Helper `getOrgSettings` (ubicación: `goadmin-websites/lib/get-outlet-settings.ts`,
mismo archivo que `getOutletSettings`):

```typescript
import { cache } from 'react'

export const getOrgSettings = cache(async (organizationId: number): Promise<WebsiteSettings | null> => {
  const supabase = getSupabaseForPublicRead()
  const { data } = await supabase
    .from('website_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .is('branch_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as WebsiteSettings | null
})

export const getOutletSettings = cache(async (organizationId: number, branchId: number): Promise<WebsiteSettings | null> => {
  const supabase = getSupabaseForPublicRead()
  const { data } = await supabase
    .from('website_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('branch_id', branchId)
    .maybeSingle()
  return data as WebsiteSettings | null
})
```

> **Nota (desbloqueo de F0)**: esto desbloquea el DROP del constraint UNIQUE
> de F0: al no depender del select anidado `organizations → website_settings`,
> PostgREST puede devolver arrays sin romper el código. El helper hace query
> directa con `.is('branch_id', null)` + `.limit(1)` + `.maybeSingle()`, por
> lo que es tolerante a múltiples filas globales (caso edge que F0 prevé
> mientras se hace cleanup de duplicados).
>
> Ambos helpers están envueltos en `cache()` de React 19 para deduplicar
> llamadas dentro del mismo request (page.tsx y generateMetadata).

---

## 4. Helper: `mergeSettings`

Ubicación: `goadmin-websites/lib/merge-settings.ts` (archivo nuevo).

```typescript
import type { WebsiteSettings } from '@/types/database'

/**
 * Campos de metadatos que NUNCA deben heredarse ni sobrescribirse
 * via merge. Pertenecen a la fila concreta (org o outlet) y mezclarlos
 * causaria que el outlet "robe" el id/branch_id/created_at de la org
 * o viceversa.
 */
const METADATA_FIELDS = new Set([
  'id',
  'organization_id',
  'branch_id',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
])

/**
 * Hace un merge shallow de los settings de la org con los del outlet.
 * El outlet solo sobrescribe los campos que tiene con valor no-null.
 *
 * - Si outletSettings es null → retorna orgSettings (backward compat).
 * - Si orgSettings es null → retorna outletSettings (caso edge).
 * - Si ambos son null → retorna null.
 *
 * Excluye los METADATA_FIELDS del override: id, organization_id,
 * branch_id, created_at, updated_at, created_by, updated_by nunca
 * se copian del outlet sobre la org (pertenecen a filas distintas).
 *
 * El merge es shallow (1 nivel). No hace deep merge de objetos anidados
 * como `cart_button_texts` — si el outlet define ese campo, reemplaza
 * el array entero. Esto es intencional y predecible.
 */
export function mergeSettings(
  orgSettings: WebsiteSettings | null,
  outletSettings: WebsiteSettings | null
): WebsiteSettings | null {
  if (!orgSettings) return outletSettings
  if (!outletSettings) return orgSettings

  const outletOverrides = Object.fromEntries(
    Object.entries(outletSettings).filter(
      ([k, v]) => !METADATA_FIELDS.has(k) && v !== null && v !== undefined
    )
  )

  return { ...orgSettings, ...outletOverrides } as WebsiteSettings
}
```

Comportamiento del filtro:

- `!METADATA_FIELDS.has(k)` → descarta campos de metadatos (`id`,
  `organization_id`, `branch_id`, `created_at`, `updated_at`,
  `created_by`, `updated_by`) para que el outlet no sobrescriba los
  de la org. Estos campos pertenecen a la fila concreta y no tienen
  sentido en un merge de "configuracion efectiva".
- `v !== null` → descarta campos `null` (el outlet no los override).
- `v !== undefined` → descarta campos que no vienen en la fila (defensivo).
- Campos con valor `0`, `''`, `false` **sí** se consideran override válido
  (no se filtran) porque son valores intencionales.

> **Nota (QA R2)**: el filtro `v !== undefined` es defensivo. Supabase no
> debería devolver `undefined` en campos de una fila (devuelve `null` para
> campos sin valor), pero se mantiene como safety net. Si se detectan filas
> con `undefined` en producción, investigar el origen — posible bug en el
> cliente de Supabase o en una transformación intermedia.

---

## 5. Cambios en `OrganizationLayout.tsx`

Archivo: `goadmin-websites/components/site/OrganizationLayout.tsx`

### 5.1 Nueva prop `effectiveSettings`

```typescript
import type { WebsiteSettings } from '@/types/database'
import type { Branch } from '@/types/branch'

interface OrganizationLayoutProps {
  organization: OrganizationWithDetails
  template: TemplateConfig
  primaryColor: string
  children: React.ReactNode
  headerNav?: WebsitePage[]
  headerNavTree?: WebsitePageWithChildren[]
  menuCategories?: MenuCategory[]
  megaMenuItems?: NavItem[]
  footerNav?: WebsitePage[]
  footerNavTree?: WebsitePageWithChildren[]
  menus?: WebsiteMenuWithItems[]
  metaPixelId?: string | null
  googleAdsConfig?: { conversionId: string; conversionLabel?: string } | null
  taxSettings?: { name: string; rate: number; taxIncluded: boolean } | null
  frozenReason?: FrozenReason
  showCurrencyCode?: boolean
  currencyPosition?: 'left' | 'right'
  /**
   * Settings efectivos (merge org + outlet ya aplicado en page.tsx).
   * El layout NO vuelve a hacer el merge — recibe el resultado final.
   */
  effectiveSettings?: WebsiteSettings | null
  /**
   * Outlet (branch) activo resuelto por F1. null = sitio global de la org.
   * El layout puede usarlo para mostrar el nombre/logo del outlet, badges, etc.
   */
  outlet?: Branch | null
  /**
   * ID del outlet activo. number = outlet concreto, null = global,
   * undefined = legacy (sin outlet awareness).
   */
  branchId?: number | null
}
```

### 5.2 Usar `effectiveSettings` directamente

Dentro del componente, reemplazar:

```typescript
// ANTES:
const settings = organization.website_settings as any
```

por:

```typescript
// DESPUÉS:
// effectiveSettings viene como prop (merge ya aplicado en page.tsx).
// No se hace fallback a organization.website_settings: effectiveSettings
// siempre viene calculado (puede ser null si no hay settings globales).
const settings: WebsiteSettings | null = effectiveSettings ?? null
```

A partir de aquí, **todo el resto del componente sigue usando `settings`** sin
cambios — ya apunta al merge. Esto minimiza el diff y el riesgo de regresión.

> **Nota (QA R4)**: se elimina el fallback a `organization.website_settings`
> porque `effectiveSettings` siempre viene calculado desde `page.tsx` vía
> `getOrgSettings` (query directa, §3.1). Si `effectiveSettings` es `null`
> (no hay settings globales), el layout usa los defaults del template — no
> hay necesidad de leer el select anidado `organization.website_settings`.

> **Nota (QA R2)**: el merge se hace **una sola vez** en `page.tsx` vía
> `getEffectiveSettings`. El layout recibe `effectiveSettings` ya calculado
> y no duplica la lógica de merge. Esto elimina la confusión anterior donde
> `page.tsx` pasaba `outletSettings` y el layout volvía a mergear.

### 5.3 Campos que se benefician del merge automáticamente

| Campo | Uso en layout | Comportamiento merge |
|---|---|---|
| `primary_color` | CSS var `--primary-color` (viene como prop) | Outlet override → nuevo color |
| `secondary_color` | CSS var `--secondary-color` (línea 104) | Outlet override → nuevo color |
| `accent_color` | CSS var `--accent-color` (línea 108) | Outlet override → nuevo color |
| `website_logo_url` | Se pasa al SiteHeader vía `organization` | Outlet override → nuevo logo |
| `theme_mode` | `light` / `dark` / `auto` (línea 86) | Outlet override → modo distinto |
| `custom_css` | `<style>` inline (línea 206) | Outlet override → CSS distinto |
| `custom_scripts` | `<CustomScripts>` (línea 210) | Outlet override → scripts propios |
| `analytics_id` | `<GoogleAnalytics>` (línea 202) | Outlet override → GA distinto |
| `chat_widget_*` | `<ChatWidget>` (línea 213) | Outlet override → chat propio |
| `countdown_*` | `<CountdownBanner>` (línea 137) | Outlet override → countdown propio |
| `cart_button_*` | `<CartDrawer>` (línea 188) | Outlet override → textos de botón |
| `shipping_*` | `<CartDrawer>` (línea 181) | Outlet override → shipping propio |
| `show_currency_code` | CurrencyProvider (línea 63) | Outlet override → display code |
| `currency_position` | CurrencyProvider (línea 64) | Outlet override → posición |

### 5.4 Logo del outlet en el header

El `SiteHeader` recibe `organization` y lee el logo de ahí. Para que el outlet
pueda tener su propio logo sin mutar el objeto `organization`, se debe pasar
el logo mergeado. Opción recomendada: agregar prop explícita al `SiteHeader`:

```typescript
// En OrganizationLayoutProps — no se necesita nueva prop,
// el logo viene en effectiveSettings.website_logo_url.
// SiteHeader debe leer el logo de settings, no de organization.

// Si SiteHeader ya lee organization.website_settings.website_logo_url,
// se puede pasar un organization "virtual" con el merge aplicado:
const organizationWithMergedSettings = {
  ...organization,
  website_settings: effectiveSettings,
}
```

Y pasar `organizationWithMergedSettings` a `SiteHeader` y `SiteFooter` en lugar
de `organization`. Esto asegura que cualquier componente hijo que lea
`organization.website_settings.*` vea el theme mergeado.

> **Decisión FINAL F2**: se pasa `organizationWithMergedSettings` donde
> `organization.website_settings = effectiveSettings`. Los componentes
> `SiteHeader` y `SiteFooter` NO se modifican — siguen leyendo
> `organization.website_settings`. Si la verificación de firmas (§8) revela
> que leen props separadas en lugar de `organization.website_settings`, se
> añade `effectiveSettings` como prop explícita. Pero el caso esperado (99%)
> es que leen `organization.website_settings`.

---

## 6. Cambios en `[[...slug]]/page.tsx`

Archivo: `goadmin-websites/app/(site)/[[...slug]]/page.tsx`

### 6.1 Cargar outlet settings después de resolver el outlet

```typescript
import { getEffectiveSettings } from '@/lib/get-effective-settings'
import { getOrgSettings } from '@/lib/get-outlet-settings'

// ... dentro de la función de la página, después de resolver outlet:

const outletId = outlet?.id ?? null
// Query directa de website_settings (no depender del select anidado
// organization.website_settings — ver §3.1, desbloqueo de F0).
const orgSettings = await getOrgSettings(organization.id)

// getEffectiveSettings retorna { effective, rawOutlet }:
//   - effective: merge org + outlet (lo que usan layout y metadata)
//   - rawOutlet: settings crudos del outlet (null si no tiene fila)
const { effective: effectiveSettings, rawOutlet: outletSettings } =
  await getEffectiveSettings(organization.id, outletId, orgSettings)

// Recalcular TODO desde effectiveSettings, no desde organization.website_settings
const template = loadTemplateConfig(effectiveSettings?.template_id || 'modern')
const primaryColor = effectiveSettings?.primary_color || template.primaryColor || '#1E40AF'
const showCurrencyCode = effectiveSettings?.show_currency_code ?? false
const currencyPosition = effectiveSettings?.currency_position ?? 'left'
```

> **Nota crítica (QA)**: `page.tsx` debe recalcular **tres campos derivados**
> desde `effectiveSettings`, no desde `organization.website_settings`:
>
> 1. **`template`** — si `effectiveSettings.template_id` difiere del
>    `template_id` de la org, se debe cargar el template del outlet
>    (ej. `loadTemplateConfig(effectiveSettings.template_id)`). No reutilizar
>    el template de la org si el outlet lo sobrescribe.
> 2. **`showCurrencyCode`** — leer de `effectiveSettings.show_currency_code`,
>    no de `organization.website_settings.show_currency_code`.
> 3. **`currencyPosition`** — leer de `effectiveSettings.currency_position`,
>    no de `organization.website_settings.currency_position`.
>
> Si estos tres campos se siguen calculando desde `organization.website_settings`,
> el override del outlet no tendra efecto aunque el merge sea correcto.

### 6.2 Pasar `effectiveSettings` al `OrganizationLayout`

```typescript
<OrganizationLayout
  organization={organization}
  template={template}
  primaryColor={primaryColor}
  effectiveSettings={effectiveSettings}
  // ... resto de props sin cambios
>
  {pageContent}
</OrganizationLayout>
```

> **Nota (QA R2)**: el layout recibe `effectiveSettings` (merge ya aplicado),
> **no** `outletSettings`. El merge se hace una sola vez en `getEffectiveSettings`
> y no se duplica dentro del layout. `outletSettings` (raw) queda disponible en
> `page.tsx` por si se necesita para lógica condicional (ej. mostrar badge de
> outlet), pero no se pasa al layout.

---

## 7. Cambios en `generateMetadata`

Archivo: `goadmin-websites/app/(site)/[[...slug]]/page.tsx` — función
`generateMetadata`.

### 7.1 Helper reutilizable `getEffectiveSettings`

Para evitar duplicar la resolucion de settings entre `page.tsx` y
`generateMetadata`, se debe extraer un helper reutilizable:

```typescript
// lib/get-effective-settings.ts (archivo nuevo)
import type { WebsiteSettings } from '@/types/database'
import { getOutletSettings } from '@/lib/get-outlet-settings'
import { mergeSettings } from '@/lib/merge-settings'
import { cache } from 'react'

/**
 * Resultado de getEffectiveSettings.
 * - effective: merge org + outlet (lo que consumen layout y metadata).
 * - rawOutlet: settings crudos del outlet (null si no tiene fila propia).
 *   Se expone por si page.tsx necesita lógica condicional sobre el outlet
 *   sin volver a queryar.
 */
export interface EffectiveSettingsResult {
  effective: WebsiteSettings | null
  rawOutlet: WebsiteSettings | null
}

/**
 * Resuelve los settings efectivos (merge org + outlet) para una
 * organizacion y branch dados. Reutilizable por page.tsx y
 * generateMetadata para evitar duplicar queries.
 *
 * Retorna { effective, rawOutlet } para que el consumidor tenga tanto
 * el merge final como los settings crudos del outlet (útil para lógica
 * condicional sin duplicar query).
 *
 * En Next.js, page.tsx y generateMetadata corren en paralelo dentro
 * del mismo request. Este helper está envuelto en React cache() para
 * deduplicar la llamada cuando ambas lo invocan con los mismos
 * argumentos durante el mismo request.
 */
export const getEffectiveSettings = cache(
  async (
    organizationId: number,
    branchId: number | null,
    orgSettings: WebsiteSettings | null
  ): Promise<EffectiveSettingsResult> => {
    const rawOutlet = branchId
      ? await getOutletSettings(organizationId, branchId)
      : null
    const effective = mergeSettings(orgSettings, rawOutlet)
    return { effective, rawOutlet }
  }
)
```

> **Nota (QA)**: tanto `page.tsx` como `generateMetadata` deben usar
> `getEffectiveSettings(organization.id, outletId, orgSettings)` en lugar
> de llamar a `getOutletSettings` + `mergeSettings` por separado. Esto
> evita duplicar queries. En Next.js ambas funciones corren en paralelo
> dentro del mismo request, pero el helper envuelto en `cache()` de React
> 19 deduplica automaticamente la llamada cuando ambas lo invocan con los
> mismos argumentos durante el mismo render/request.
>
> **Nota de cache (QA R2)**: la cache de `getEffectiveSettings` es
> per-request (React 19 `cache()`). Se invalida automáticamente entre
> requests — no hay cache persistente que invalidar. Si un admin actualiza
> settings, el siguiente request verá los cambios sin necesidad de
> invalidación manual.

### 7.2 Uso en `generateMetadata`

```typescript
import { getEffectiveSettings } from '@/lib/get-effective-settings'
import { getOrgSettings } from '@/lib/get-outlet-settings'

export async function generateMetadata({
  params,
}: {
  params: { slug?: string[]; outlet?: string }
}): Promise<Metadata> {
  // ... resolver organization y outlet igual que en la página ...

  const outletId = outlet?.id ?? null
  // Query directa de website_settings (no depender del select anidado
  // organization.website_settings — ver §3.1, desbloqueo de F0).
  const orgSettings = await getOrgSettings(organization.id)
  const { effective: effectiveSettings } = await getEffectiveSettings(
    organization.id,
    outletId,
    orgSettings
  )

  const metaTitle =
    effectiveSettings?.meta_title ||
    organization.name ||
    'Sitio Web'
  const metaDescription =
    effectiveSettings?.meta_description || ''
  const ogImage = effectiveSettings?.og_image_url || null

  return {
    title: metaTitle,
    description: metaDescription,
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  }
}
```

Notas:

- Si el outlet no define `meta_title`, se hereda el de la org (o el nombre).
- `og_image_url` del outlet reemplaza la imagen de OpenGraph del outlet.
- El `metadataBase` y otros campos técnicos no se mergean (son de la org).

---

## 8. Verificación de firmas de componentes

> **Pre-requisito (QA R2)**: antes de implementar F2, se debe verificar
> cómo `SiteHeader` y `SiteFooter` consumen los settings. La estrategia
> de paso de props depende de su firma real.

Pasos:

1. **Leer** `components/site/SiteHeader.tsx` y `components/site/SiteFooter.tsx`
   antes de tocar `OrganizationLayout.tsx`.
2. **Verificar** si leen `organization.website_settings.*` directamente o si
   reciben props separadas (ej. `logoUrl`, `primaryColor` como props
   individuales).
3. **Caso esperado (lectura de `organization.website_settings`)**: pasar
   `organizationWithMergedSettings` (objeto virtual con el merge aplicado)
   en lugar de `organization`. Esto es la **decisión F2** (ver §5.4):
   ```typescript
   const organizationWithMergedSettings = {
     ...organization,
         website_settings: effectiveSettings,
   }
   // Pasar organizationWithMergedSettings a SiteHeader/SiteFooter
   ```
4. **Caso excepcional (props separadas)**: si tras la verificación resulta
   que `SiteHeader`/`SiteFooter` leen props individuales (`logoUrl`,
   `primaryColor`, etc.) y no `organization.website_settings`, añadir prop
   `effectiveSettings: WebsiteSettings` explícita a esos componentes y pasar
   `effectiveSettings` desde `OrganizationLayout`. En este caso mutar el
   objeto `organization` no tiene efecto. Documentar la desviación respecto
   a la decisión F2 en el PR.

> **Importante**: la decisión F2 (§5.4) es pasar
> `organizationWithMergedSettings`. La verificación de firmas confirma que
> `SiteHeader`/`SiteFooter` leen `organization.website_settings.*` (caso
> esperado). Solo si la verificación revela props separadas se aplica el
> caso excepcional del paso 4.

---

## 9. Definition of Done

- [ ] `getOutletSettings(organizationId, branchId)` implementada en
      `lib/get-outlet-settings.ts` (o `lib/get-org-context.ts`).
- [ ] `getOrgSettings(organizationId)` implementada en
      `lib/get-outlet-settings.ts` — query directa `branch_id IS NULL`
      (desbloqueo de F0, ver §3.1). `page.tsx` y `generateMetadata` la usan
      en lugar de leer `organization.website_settings`.
- [ ] `mergeSettings(orgSettings, outletSettings)` helper implementado en
      `lib/merge-settings.ts`.
- [ ] `OrganizationLayout` acepta prop `effectiveSettings` y la usa
      directamente (sin volver a mergear).
- [ ] `OrganizationLayout` usa `effectiveSettings` (vía `settings`) para todos
      los campos: primaryColor, secondaryColor, logo, fonts, theme_mode,
      custom_css, analytics, chat, countdown, cart, shipping.
- [ ] `SiteHeader` y `SiteFooter` reciben el organization con settings mergeados
      (o leen de `effectiveSettings` directamente).
- [ ] `[[...slug]]/page.tsx` llama `getEffectiveSettings` después de resolver
      outlet y pasa `effectiveSettings` al `OrganizationLayout`.
- [ ] `primaryColor` se calcula del merge: `effectiveSettings?.primary_color ||
      organization.primary_color`.
- [ ] `generateMetadata` usa `effectiveSettings` para `meta_title`,
      `meta_description`, `og_image_url`.
- [ ] Outlet sin settings (`branch_id IS NULL` o sin fila) usa theme de la org
      — backward compatibility verificada.
- [ ] Outlet con settings override solo los campos no-null; los null heredan.
- [ ] Verificar visualmente que el logo, colores y template del outlet se
      aplican correctamente en el sitio público.
- [ ] Verificar que campos con valor `0`, `''`, `false` son override válidos
      (no se filtran como null).
- [ ] `npm run lint` + `tsc --noEmit` limpios en `goadmin-websites`.
- [ ] No se rompe RLS (sigue por `organization_id`).
- [ ] **Regenerar tipos**: ejecutar
      `npx supabase gen types typescript --project-id jgmgphmzusbluqhuqihj`
      para que `types/database.ts` incluya `branch_id` en `WebsiteSettings`
      tras la migración de F0. Verificar que el campo aparezca antes de
      iniciar la implementación de F2.

---

## 10. Verificación post-implementación

Casos de prueba a ejecutar tras implementar F2 (antes de cerrar el PR):

1. **Outlet con settings parciales (solo `primary_color`)** → el merge
   conserva el resto de campos de la org (`secondary_color`, `template_id`,
   `theme_mode`, logo, etc.). Verificar que solo el color primario cambia.
2. **Outlet sin settings (sin fila en `website_settings` con su
   `branch_id`)** → `getOutletSettings` retorna `null`, el layout usa los
   settings de la org sin cambios. Backward compatibility total.
3. **Org global sin outlet** (`branch_id IS NULL`, sin override) → se usan
   los settings de la org. `getEffectiveSettings` retorna
   `{ effective: orgSettings, rawOutlet: null }`.
4. **Outlet con `primary_color='#FF0000'`** → verificar visualmente que el
   color rojo aplica en todos los elementos que usan `--primary-color`
   (botones, links, acentos).
5. **Outlet con `template_id='hotel'`** → verificar que el template cambia
   (carga `loadTemplateConfig('hotel')` desde `effectiveSettings.template_id`,
   no desde `organization.website_settings.template_id`). Ver §6.1 nota
   crítica sobre los 3 campos derivados.
6. **Campos con valor `0`, `''`, `false`** → se aplican como override
   válido (el filtro de `mergeSettings` solo descarta `null`/`undefined`,
   no valores falsy). Verificar ej. `show_currency_code: false` del outlet
   prevalece sobre `true` de la org.
7. **Cache per-request** → `page.tsx` y `generateMetadata` no duplican la
   query a `website_settings`. Verificar en logs de Supabase que
   `getOrgSettings` y `getOutletSettings` se ejecutan una sola vez por
   request gracias al wrapper `cache()` de React 19.

---

## 11. Riesgos y decisiones

### 11.1 Merge parcial de colores

**Riesgo**: si el outlet define `primary_color` pero no `secondary_color`, el
merge mantiene el `secondary_color` de la org. Esto puede generar combinaciones
cromáticas no armoniosas.

**Decisión documentada**: este es el comportamiento esperado. El diseñador del
outlet debe definir ambos colores si quiere un theme visualmente coherente.
No se aplica lógica de "auto-generar secondary a partir de primary" — eso es
responsabilidad del editor (Fase 4), no del runtime.

### 11.2 Merge shallow vs deep

El merge es **shallow** (1 nivel). Campos que son objetos anidados o arrays
(`cart_button_texts`, `custom_scripts`, `social_links`) se reemplazan enteros,
no se mergean clave por clave.

Ejemplo: si la org define `cart_button_texts: ['Comprar', 'Aprovechar', ...]`
y el outlet define `cart_button_texts: ['Pedir Ahora']`, el resultado es
`['Pedir Ahora']` (no una combinación). Esto es predecible y simple.

> **Limitación conocida (QA)**: si el outlet quiere cambiar un solo campo de
> un objeto anidado (ej. solo el primer elemento de `cart_button_texts`, o
> solo `social_links.instagram`), debe copiar **todo** el objeto/array con
> el cambio aplicado. El merge shallow no permite "patchear" sub-claves.
>
> Esto se documenta como limitación intencional de F2. Si en el futuro se
> necesita merge profundo (deep merge clave por clave de objetos anidados),
> se evaluara en una fase posterior — requiere definir reglas de merge por
> tipo de campo (array vs objeto vs escalar) y añade complejidad al helper
> `mergeSettings`. Por ahora, el editor (Fase 4) debe enviar el objeto
> completo al guardar.

### 11.3 Performance: query extra por request

`getOutletSettings` agrega 1 query más por request (select de 1 fila por
`organization_id` + `branch_id`). Es una query indexada (PK compuesta o índice
único creado en F0) y retorna 0 o 1 fila. Impacto despreciable.

Si se quiere optimizar, se puede cache en el `getOrgContext` ya que ambas
queries van a la misma tabla `website_settings` — se podría hacer un solo
select con `.in('branch_id', [null, branchId])` y resolver ambas en memoria.
Pero no es necesario para Fase 2.

### 11.4 `organization.website_settings` vs `effectiveSettings`

El objeto `organization` que llega al layout **no se muta**. El layout recibe
`effectiveSettings` como prop (merge ya aplicado en `page.tsx` vía
`getEffectiveSettings`) y no recalcula nada. Si un componente hijo profundo lee
`organization.website_settings` directamente (sin pasar por props), verá el
theme de la org, no el merge. Por eso se recomienda pasar
`organizationWithMergedSettings` a `SiteHeader`/`SiteFooter`.

### 11.5 Tipos: `WebsiteSettings` debe incluir `branch_id`

El tipo `WebsiteSettings` en `types/database.ts` debe incluir el campo
`branch_id: number | null` (agregado en F0). Verificar que el tipo generado
por Supabase lo incluya tras la migración de F0.

---

## 12. Archivos a crear/modificar

| Archivo | Acción | Repo |
|---|---|---|
| `lib/get-outlet-settings.ts` | **Crear** — exporta `getOrgSettings` (query directa `branch_id IS NULL`) + `getOutletSettings` (cacheadas con `cache()`) | goadmin-websites |
| `lib/merge-settings.ts` | **Crear** | goadmin-websites |
| `lib/get-effective-settings.ts` | **Crear** — helper reutilizable cacheado para page.tsx y generateMetadata | goadmin-websites |
| `components/site/OrganizationLayout.tsx` | **Modificar** — agregar prop `effectiveSettings`, usarla directamente (sin volver a mergear) | goadmin-websites |
| `app/(site)/[[...slug]]/page.tsx` | **Modificar** — cargar outlet settings, pasar al layout, usar en `generateMetadata` | goadmin-websites |
| `types/database.ts` | **Verificar** — `WebsiteSettings` incluye `branch_id` | goadmin-websites |

---

## 13. Dependencias con otras fases

| Fase | Dependencia |
|---|---|
| **F0** | Requerida — `website_settings.branch_id` debe existir en BD |
| **F1** | Requerida — resolución de outlet debe entregar `branchId` a la página |
| **F3** | Independiente — catálogo por outlet no afecta theme |
| **F4** | Consumidora — el editor de branding usará `mergeSettings` para preview |
| **F5** | Independiente — checkout no usa theme merge |
