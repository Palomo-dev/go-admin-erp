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

---

## 4. Helper: `mergeSettings`

Ubicación: `goadmin-websites/lib/merge-settings.ts` (archivo nuevo).

```typescript
import type { WebsiteSettings } from '@/types/database'

/**
 * Hace un merge shallow de los settings de la org con los del outlet.
 * El outlet solo sobrescribe los campos que tiene con valor no-null.
 *
 * - Si outletSettings es null → retorna orgSettings (backward compat).
 * - Si orgSettings es null → retorna outletSettings (caso edge).
 * - Si ambos son null → retorna null.
 *
 * El merge es shallow (1 nivel). No hace deep merge de objetos anidados
 * como `cart_button_texts` — si el outlet define ese campo, reemplaza
 * el array entero. Esto es intencional y predecible.
 */
export function mergeSettings(
  orgSettings: WebsiteSettings | null,
  outletSettings: WebsiteSettings | null
): WebsiteSettings | null {
  if (!outletSettings) return orgSettings
  if (!orgSettings) return outletSettings

  return {
    ...orgSettings,
    ...Object.fromEntries(
      Object.entries(outletSettings).filter(
        ([, v]) => v !== null && v !== undefined
      )
    ),
  } as WebsiteSettings
}
```

Comportamiento del filtro:

- `v !== null` → descarta campos `null` (el outlet no los override).
- `v !== undefined` → descarta campos que no vienen en la fila (defensivo).
- Campos con valor `0`, `''`, `false` **sí** se consideran override válido
  (no se filtran) porque son valores intencionales.

---

## 5. Cambios en `OrganizationLayout.tsx`

Archivo: `goadmin-websites/components/site/OrganizationLayout.tsx`

### 5.1 Nueva prop `outletSettings`

```typescript
import { mergeSettings } from '@/lib/merge-settings'
import type { WebsiteSettings } from '@/types/database'

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
  /** Settings específicos del outlet (branch). Se mergean sobre los de la org. */
  outletSettings?: WebsiteSettings | null
}
```

### 5.2 Calcular `effectiveSettings`

Dentro del componente, reemplazar:

```typescript
// ANTES:
const settings = organization.website_settings as any
```

por:

```typescript
// DESPUÉS:
const orgSettings = (organization.website_settings as WebsiteSettings | null) ?? null
const effectiveSettings = mergeSettings(orgSettings, outletSettings ?? null)
const settings = effectiveSettings as any
```

A partir de aquí, **todo el resto del componente sigue usando `settings`** sin
cambios — ya apunta al merge. Esto minimiza el diff y el riesgo de regresión.

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

---

## 6. Cambios en `[[...slug]]/page.tsx`

Archivo: `goadmin-websites/app/(site)/[[...slug]]/page.tsx`

### 6.1 Cargar outlet settings después de resolver el outlet

```typescript
import { getOutletSettings } from '@/lib/get-outlet-settings'
import { mergeSettings } from '@/lib/merge-settings'

// ... dentro de la función de la página, después de resolver outlet:

const outletId = outlet?.id ?? null

// Cargar settings del outlet (null si no tiene propios)
const outletSettings = outletId
  ? await getOutletSettings(organization.id, outletId)
  : null

// Settings efectivos = merge org + outlet
const effectiveSettings = mergeSettings(
  organization.website_settings as WebsiteSettings | null,
  outletSettings
)

// primaryColor se calcula del merge, no de org sola
const primaryColor =
  effectiveSettings?.primary_color || organization.primary_color || '#1E40AF'
```

### 6.2 Pasar `outletSettings` al `OrganizationLayout`

```typescript
<OrganizationLayout
  organization={organization}
  template={template}
  primaryColor={primaryColor}
  outletSettings={outletSettings}
  // ... resto de props sin cambios
>
  {pageContent}
</OrganizationLayout>
```

---

## 7. Cambios en `generateMetadata`

Archivo: `goadmin-websites/app/(site)/[[...slug]]/page.tsx` — función
`generateMetadata`.

```typescript
export async function generateMetadata({
  params,
}: {
  params: { slug?: string[]; outlet?: string }
}): Promise<Metadata> {
  // ... resolver organization y outlet igual que en la página ...

  const outletId = outlet?.id ?? null
  const outletSettings = outletId
    ? await getOutletSettings(organization.id, outletId)
    : null

  const effectiveSettings = mergeSettings(
    organization.website_settings as WebsiteSettings | null,
    outletSettings
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

## 8. Definition of Done

- [ ] `getOutletSettings(organizationId, branchId)` implementada en
      `lib/get-outlet-settings.ts` (o `lib/get-org-context.ts`).
- [ ] `mergeSettings(orgSettings, outletSettings)` helper implementado en
      `lib/merge-settings.ts`.
- [ ] `OrganizationLayout` acepta prop `outletSettings` y calcula
      `effectiveSettings = mergeSettings(org, outlet)`.
- [ ] `OrganizationLayout` usa `effectiveSettings` (vía `settings`) para todos
      los campos: primaryColor, secondaryColor, logo, fonts, theme_mode,
      custom_css, analytics, chat, countdown, cart, shipping.
- [ ] `SiteHeader` y `SiteFooter` reciben el organization con settings mergeados
      (o leen de `effectiveSettings` directamente).
- [ ] `[[...slug]]/page.tsx` carga `getOutletSettings` después de resolver outlet
      y pasa `outletSettings` al `OrganizationLayout`.
- [ ] `primaryColor` se calcula del merge: `effectiveSettings?.primary_color ||
      organization.primary_color`.
- [ ] `generateMetadata` usa `effectiveSettings` para `meta_title`,
      `meta_description`, `og_image_url`.
- [ ] Outlet sin settings (`branch_id IS NULL` o sin fila) usa theme de la org
      — backward compatibility verificada.
- [ ] Outlet con settings override solo los campos no-null; los null heredan.
- [ ] `npm run lint` + `tsc --noEmit` limpios en `goadmin-websites`.
- [ ] No se rompe RLS (sigue por `organization_id`).

---

## 9. Riesgos y decisiones

### 9.1 Merge parcial de colores

**Riesgo**: si el outlet define `primary_color` pero no `secondary_color`, el
merge mantiene el `secondary_color` de la org. Esto puede generar combinaciones
cromáticas no armoniosas.

**Decisión documentada**: este es el comportamiento esperado. El diseñador del
outlet debe definir ambos colores si quiere un theme visualmente coherente.
No se aplica lógica de "auto-generar secondary a partir de primary" — eso es
responsabilidad del editor (Fase 4), no del runtime.

### 9.2 Merge shallow vs deep

El merge es **shallow** (1 nivel). Campos que son objetos anidados o arrays
(`cart_button_texts`, `custom_scripts`, `social_links`) se reemplazan enteros,
no se mergean clave por clave.

Ejemplo: si la org define `cart_button_texts: ['Comprar', 'Aprovechar', ...]`
y el outlet define `cart_button_texts: ['Pedir Ahora']`, el resultado es
`['Pedir Ahora']` (no una combinación). Esto es predecible y simple.

### 9.3 Performance: query extra por request

`getOutletSettings` agrega 1 query más por request (select de 1 fila por
`organization_id` + `branch_id`). Es una query indexada (PK compuesta o índice
único creado en F0) y retorna 0 o 1 fila. Impacto despreciable.

Si se quiere optimizar, se puede cache en el `getOrgContext` ya que ambas
queries van a la misma tabla `website_settings` — se podría hacer un solo
select con `.in('branch_id', [null, branchId])` y resolver ambas en memoria.
Pero no es necesario para Fase 2.

### 9.4 `organization.website_settings` vs `effectiveSettings`

El objeto `organization` que llega al layout **no se muta**. El layout calcula
`effectiveSettings` internamente y lo usa. Si un componente hijo profundo lee
`organization.website_settings` directamente (sin pasar por props), verá el
theme de la org, no el merge. Por eso se recomienda pasar
`organizationWithMergedSettings` a `SiteHeader`/`SiteFooter`.

### 9.5 Tipos: `WebsiteSettings` debe incluir `branch_id`

El tipo `WebsiteSettings` en `types/database.ts` debe incluir el campo
`branch_id: number | null` (agregado en F0). Verificar que el tipo generado
por Supabase lo incluya tras la migración de F0.

---

## 10. Archivos a crear/modificar

| Archivo | Acción | Repo |
|---|---|---|
| `lib/get-outlet-settings.ts` | **Crear** | goadmin-websites |
| `lib/merge-settings.ts` | **Crear** | goadmin-websites |
| `components/site/OrganizationLayout.tsx` | **Modificar** — agregar prop `outletSettings`, calcular `effectiveSettings` | goadmin-websites |
| `app/(site)/[[...slug]]/page.tsx` | **Modificar** — cargar outlet settings, pasar al layout, usar en `generateMetadata` | goadmin-websites |
| `types/database.ts` | **Verificar** — `WebsiteSettings` incluye `branch_id` | goadmin-websites |

---

## 11. Dependencias con otras fases

| Fase | Dependencia |
|---|---|
| **F0** | Requerida — `website_settings.branch_id` debe existir en BD |
| **F1** | Requerida — resolución de outlet debe entregar `branchId` a la página |
| **F3** | Independiente — catálogo por outlet no afecta theme |
| **F4** | Consumidora — el editor de branding usará `mergeSettings` para preview |
| **F5** | Independiente — checkout no usa theme merge |
