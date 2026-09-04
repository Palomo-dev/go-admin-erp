# Fase 4 — Editor de branding multi-outlet (selector de outlet + filtrar secciones)

> Plan multi-outlet · Fase 4 de 7
> Fecha: 2026-08-31
> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Documento padre: [`PLAN.md`](./PLAN.md)
> Depende de: [Fase 0](./FASE-0-FUNDACIONES-BD.md), [Fase 2](./FASE-2-THEME-OVERRIDE.md)

---

## 1. Objetivo

El editor de branding del ERP (`src/app/organizacion/branding/editor/[pageId]/page.tsx`)
permite elegir outlet (branch) al crear/editar páginas, y filtra las secciones
disponibles según `branch_type` del outlet seleccionado.

Hoy el editor es 1:1 con la organización: lista todas las páginas de la org y
ofrece todas las secciones del `SECTION_CATALOG` sin distinción de tipo de
negocio. Con esta fase, el editor se vuelve **multi-outlet**:

- Un selector de outlet en la parte superior filtra páginas por `branch_id`.
- Las secciones que se pueden agregar se acotan al `branch_type` del outlet.
- Los settings (theme, header, footer) se cargan/guardan por `branch_id`.
- "Global (organización)" mantiene el comportamiento actual (todas las
  secciones, páginas globales) → **backward compat**.

---

## 2. Selector de outlet en el editor

### 2.1 Ubicación

En `src/app/organizacion/branding/editor/[pageId]/page.tsx`, añadir un
`OutletSelector` en el `EditorHeader` (o justo encima del sidebar). El selector
es un dropdown que lista:

1. **"Global (organización)"** — `branch_id = null`.
2. **Cada branch con `is_web_published = true`** — mostrando `name` + badge de
   `branch_type`.

### 2.2 Estado nuevo en el editor

```typescript
// src/app/organizacion/branding/editor/[pageId]/page.tsx

import { branchService } from '@/lib/services/branchService';
import type { Branch } from '@/types/branch';
import { OutletSelector, type OutletOption } from '@/components/organization/branding/editor/OutletSelector';

// Estado del outlet seleccionado
const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null); // null = Global
const [outletOptions, setOutletOptions] = useState<OutletOption[]>([]);
const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
// Branches publicadas (para resolver branch_type al cambiar outlet sin recargar)
const [publishedBranches, setPublishedBranches] = useState<Branch[]>([]);
```

> **Corrección QA (resolución inicial de `selectedBranchId`)**: al cargar el
> editor, `loadData` debe resolver el outlet inicial desde la página que se está
> editando, no asumir "Global" por defecto. El orden de carga es:
>
> 1. Cargar `currentPage` primero (sin `branchId`, por `pageId`).
> 2. Setear `selectedBranchId = currentPage.branch_id ?? null`.
> 3. Luego cargar `pages` y `settings` con ese `selectedBranchId`.
>
> ```typescript
> // Dentro de loadData — cargar la página actual PRIMERO para resolver el outlet
> const { data: page } = await websitePageBuilderService.getPageWithSections(pageId, organizationId, selectedBranchId);
> setCurrentPage(page);
>
> // Resolver el outlet desde la página (no asumir Global)
> const initialBranchId = page?.branch_id ?? null;
> setSelectedBranchId(initialBranchId);
>
> // Ahora cargar pages y settings con el branchId resuelto
> const [pagesData, settingsData] = await Promise.all([
>   websitePageBuilderService.getPages(organizationId!, initialBranchId),
>   websiteSettingsService.getSettings(organizationId!, initialBranchId),
> ]);
> setPages(pagesData);
> setSettings(settingsData);
> ```
>
> Si se cargan `pages` y `settings` antes de resolver `selectedBranchId`, el
> editor muestra datos del outlet equivocado (siempre Global) hasta que el
> usuario cambie manualmente el selector.
>
> **Corrección QA R7 (primera llamada a getPageWithSections)**: la primera
> llamada a `getPageWithSections` se hace con `selectedBranchId = null` (aún
> no se ha cargado la página). La validación de outlet se aplica cuando el
> usuario cambia de outlet activamente, no en la carga inicial. Por eso la
> validación en §4.4 usa `typeof selectedBranchId === 'number'` — con `null`
> (carga inicial) la validación de outlet se omite, permitiendo cargar
> cualquier página de la org al abrir el editor.

### 2.3 Carga de outlets publicables

Dentro de `loadData` (o un `useEffect` dedicado), cargar las branches
publicables de la organización:

```typescript
// Cargar outlets publicables (branches con is_web_published=true Y branch_type válido)
if (organizationId) {
  try {
    const allBranches = await branchService.getBranches(organizationId);

    // Filtrar is_web_published=true Y branch_type válido (no null/vacío).
    // publishedBranches solo contiene branches válidas: así doOutletChange
    // y OutletSelector nunca venen un outlet sin branch_type.
    const validPublished = allBranches.filter(
      (b) => b.is_web_published === true && !!b.branch_type,
    );
    setPublishedBranches(validPublished); // ← guardar directamente, sin variable temporal

    // Avisar al usuario de outlets publicados pero incompletos (sin branch_type)
    const invalid = allBranches.filter(
      (b) => b.is_web_published === true && !b.branch_type,
    );
    if (invalid.length > 0) {
      toast({
        title: 'Outlet(s) incompleto(s)',
        description: `${invalid.map((b) => b.name).join(', ')} está publicado pero no tiene branch_type. Corrígelo en Sucursales antes de editar su branding.`,
        variant: 'destructive',
      });
    }

    const options: OutletOption[] = [
      { value: null, label: 'Global (organización)', branchType: null },
      ...validPublished.map((b) => ({
        value: b.id!,
        label: b.name,
        branchType: b.branch_type ?? null,
      })),
    ];
    setOutletOptions(options);

    // Resolver la branch seleccionada (para filtrar secciones por branch_type)
    const resolved = validPublished.find((b) => b.id === selectedBranchId) ?? null;
    setSelectedBranch(resolved);
  } catch {
    // Si falla, fallback a Global
    setOutletOptions([{ value: null, label: 'Global (organización)', branchType: null }]);
  }
}
```

> **Corrección QA R2 (unificación `published`/`publishedBranches`)**: antes
> existía una variable temporal `published` en `loadData` que se guardaba con
> `setPublishedBranches` **sin** filtrar `branch_type`, y luego un bloque
> separado (antigua §2.7 parte A, ahora integrada en §2.3) volvía a filtrar con
> otra variable `validPublished`. Eso duplicaba lógica y dejaba
> `publishedBranches` con branches inválidas hasta que ese bloque las purgaba.
> Ahora `loadData` filtra `branch_type` **al cargar** y guarda directamente con
> `setPublishedBranches`, de modo que `publishedBranches` solo contiene branches
> válidas en todo el ciclo de vida del estado. La parte A de la antigua §2.7 se
> elimina (su lógica se integró aquí, en §2.3).

### 2.4 Comportamiento al cambiar outlet

```typescript
const handleOutletChange = async (branchId: number | null) => {
  // Si hay cambios sin guardar, confirmar antes de cambiar
  if (hasChanges) {
    setPendingOutletChange(branchId);
    return;
  }
  await doOutletChange(branchId);
};

const doOutletChange = async (branchId: number | null) => {
  setSelectedBranchId(branchId);
  // Reset pending changes
  pendingSectionUpdates.current.clear();
  pendingSettingsUpdates.current = {};
  setHasChanges(false);
  setActiveSectionId(null);

  // Recargar páginas y settings del outlet
  try {
    setIsLoading(true);
    const [pagesData, settingsData] = await Promise.all([
      websitePageBuilderService.getPages(organizationId!, branchId),
      websiteSettingsService.getSettings(organizationId!, branchId),
    ]);
    setPages(pagesData);
    setSettings(settingsData);

    // Resolver branch_type para filtrado de secciones
    // publishedBranches viene del estado (cargado en loadData), no de una
    // variable local fuera de scope — así el snippet compila.
    const branch = publishedBranches.find((b) => b.id === branchId) ?? null;
    setSelectedBranch(branch);

    // Si la página actual no pertenece al outlet seleccionado, cambiar a la primera
    if (currentPage && pagesData.length > 0) {
      const stillExists = pagesData.some((p) => p.id === currentPage.id);
      if (!stillExists) {
        await doPageChange(pagesData[0].id);
      }
    }
  } catch (error) {
    console.error('Error changing outlet:', error);
    toast({ title: 'Error', description: 'No se pudieron cargar los datos del outlet', variant: 'destructive' });
  } finally {
    setIsLoading(false);
  }
};
```

### 2.5 Páginas listadas

Al seleccionar un outlet, las páginas que se listan son:

- **"Global"** (`branchId = null`) → **solo** las páginas globales
  (`branch_id = NULL`) de la organización. No se mezclan con las de los
  outlets. (Corrección QA: antes traía todas, lo que era incorrecto.)
- **Outlet concreto** (`branchId = X`) → las páginas con `branch_id = X`
  (del outlet) **más** las páginas globales (`branch_id = NULL`), porque el
  outlet hereda el contenido global de la organización.

Esto se logra en el servicio (ver §4.1).

### 2.6 Crear página nueva

Al crear una página nueva desde el editor, se asigna el `branch_id` del outlet
seleccionado:

```typescript
const handleCreatePage = async (slug: string, title: string) => {
  if (!organizationId) return;
  const newPage = await websitePageBuilderService.createPage({
    organization_id: organizationId,
    slug,
    title,
    page_type: 'builtin',
    branch_id: selectedBranchId, // null si Global, X si outlet
  });
  setPages((prev) => [...prev, newPage]);
  await doPageChange(newPage.id);
};
```

### 2.7 Validación de `branch_type` obligatorio al publicar un outlet

> **Corrección QA**: un outlet con `is_web_published = true` pero
> `branch_type = null` es inválido: el editor no puede filtrar secciones y el
> sitio público (`goadmin-websites`) no sabe qué layout/render usar. Se valida
> en dos puntos:

**A) Al cargar outlets publicables (defensivo, en el editor)**

> **Corrección QA R2**: esta validación se integró directamente en `loadData`
> (§2.3). Ya no existe un bloque separado: `loadData` filtra
> `is_web_published === true && !!b.branch_type` al cargar y guarda el
> resultado directamente con `setPublishedBranches`, de modo que
> `publishedBranches` solo contiene branches válidas. Los outlets publicados
> pero sin `branch_type` se excluyen del selector y generan un toast
> advertencia. Ver el snippet de §2.3 para la implementación.

**B) Al publicar/despublicar un outlet (fuente de verdad, en `branchService`)**

El guardián real vive en el servicio que cambia `is_web_published`, para que la
validación aplique sin importar desde qué UI se publique:

```typescript
// src/lib/services/branchService.ts
async setWebPublished(branchId: number, published: boolean): Promise<Branch> {
  if (published) {
    // Validar branch_type antes de publicar
    const { data: branch } = await supabase
      .from('branches')
      .select('branch_type')
      .eq('id', branchId)
      .single();

    if (!branch?.branch_type) {
      throw new Error(
        'No se puede publicar el outlet: branch_type es obligatorio. ' +
        'Defínelo en el formulario de Sucursales antes de publicar.',
      );
    }
  }

  const { data, error } = await supabase
    .from('branches')
    .update({ is_web_published: published, updated_at: new Date().toISOString() })
    .eq('id', branchId)
    .select()
    .single();
  if (error) throw error;
  return data as Branch;
}
```

> **Nota**: esta validación se complementa con la mitigación del §8
> (`branch_type` vacío o desconocido) y con la Fase 6 (BranchForm), que debe
> marcar `branch_type` como obligatorio en el formulario cuando
> `is_web_published = true`.

---

## 3. Filtrado de secciones por `branch_type`

### 3.1 Mapa `branch_type → secciones permitidas`

El `SECTION_MAP` de `goadmin-websites` ya tiene secciones separadas por tipo de
negocio. Creamos un mapa en el ERP que espeja esa segmentación:

```typescript
// src/lib/services/website/sectionsByBranchType.ts

import type { BranchType } from '@/types/branch';

/**
 * Secciones universales — disponibles para todos los branch_type y para
 * "Global" (organización sin outlet).
 */
const UNIVERSAL_SECTIONS: string[] = [
  'hero',
  'gallery',
  'testimonials',
  'cta',
  'contact_form',
  'map',
  'stats',
  'text_block',
  'team',
  'faq',
  'newsletter',
  'image_text',
  'partners',
  'countdown',
  'services_list',
];

/**
 * Secciones de detalle de producto — solo relevantes si el outlet tiene
 * catálogo (retail). Se incluyen en retail porque el outlet puede tener
 * páginas de tipo product_detail / category_detail.
 */
const PRODUCT_DETAIL_SECTIONS: string[] = [
  'product_gallery',
  'product_info',
  'product_actions',
  'product_benefits',
  'product_description',
  'related_products',
  'product_specs',
  'product_faq',
  'product_shipping',
  'product_reviews',
];

const CATEGORY_DETAIL_SECTIONS: string[] = [
  'category_header',
  'category_filters',
  'category_products',
  'category_subcategories',
  'category_seo_text',
];

/**
 * Mapa branch_type → secciones permitidas (además de las universales).
 * Si el outlet es "Global" (branch_type = null) → se muestran TODAS las
 * secciones (comportamiento actual, backward compat).
 */
export const SECTIONS_BY_BRANCH_TYPE: Record<string, string[]> = {
  hotel: [
    ...UNIVERSAL_SECTIONS,
    'room_types',
    'amenities',
    'booking_cta',
    'why_choose_us',
  ],
  restaurant: [
    ...UNIVERSAL_SECTIONS,
    'menu_preview',
    'specialties',
    'reservation_cta',
    'delivery_cta',
    'chef_section',
  ],
  retail: [
    ...UNIVERSAL_SECTIONS,
    'products_grid',
    'categories_grid',
    'featured_products',
    'promo_banners',
    'brands',
    'offers',
    ...PRODUCT_DETAIL_SECTIONS,
    ...CATEGORY_DETAIL_SECTIONS,
  ],
  gym: [
    ...UNIVERSAL_SECTIONS,
    'membership_plans',
    'class_schedule',
    'trainers',
    'gym_features',
    'transformation',
  ],
  transport: [
    ...UNIVERSAL_SECTIONS,
    'routes',
    'fleet_showcase',
    'trip_search',
    'booking_transport',
    'coverage_map',
  ],
  parking: [
    ...UNIVERSAL_SECTIONS,
    'parking_zones',
    'parking_pricing',
    'parking_pass_plans',
    'parking_features',
    'parking_availability',
  ],
  services: [
    ...UNIVERSAL_SECTIONS,
    'features_grid',
    'how_it_works',
    'pricing_table',
    'demo_cta',
    'integrations',
  ],
};

/**
 * Devuelve la lista de section_type permitidos para un branch_type dado.
 * Si branchType es null/undefined (Global) → devuelve null, lo que indica
 * "sin filtro" (todas las secciones del catálogo).
 */
export function getAllowedSectionTypes(branchType: BranchType | null | undefined): string[] | null {
  if (!branchType) return null; // Global = todas
  return SECTIONS_BY_BRANCH_TYPE[branchType] ?? UNIVERSAL_SECTIONS;
}
```

### 3.2 Uso en el `AddSectionDialog`

El `AddSectionDialog` recibe `allowedSectionTypes` y filtra el catálogo:

```typescript
// src/components/organization/branding/editor/AddSectionDialog.tsx

interface AddSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (sectionType: string, sectionVariant: string) => void;
  existingSectionTypes: string[];
  /** null = todas las secciones (Global). string[] = solo esas. */
  allowedSectionTypes: string[] | null;
}

export default function AddSectionDialog({
  open,
  onOpenChange,
  onAdd,
  existingSectionTypes,
  allowedSectionTypes,
}: AddSectionDialogProps) {
  const t = useTranslations('branding.editor.addSection');
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<SectionTypeDefinition | null>(null);

  const filtered = SECTION_CATALOG.filter((s) => {
    // Filtro por branch_type
    if (allowedSectionTypes && !allowedSectionTypes.includes(s.type)) return false;
    // Filtro por búsqueda
    return (
      s.label.toLowerCase().includes(search.toLowerCase()) ||
      s.type.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
    );
  });

  // ... resto del componente sin cambios
}
```

> **Corrección QA (extender `ICON_MAP`)**: el `ICON_MAP` del `AddSectionDialog`
> está limitado a los iconos de las secciones universales y hotel/restaurant.
> Extenderlo con iconos para los `branch_type` nuevos:
>
> ```typescript
> import {
>   // ... iconos existentes ...
>   Bus,            // transport
>   Dumbbell,       // gym
>   SquareParking,  // parking
>   Plug,           // services
> } from 'lucide-react';
>
> const ICON_MAP: Record<string, LucideIcon> = {
>   // ... entradas existentes ...
>   routes: Bus,
>   fleet_showcase: Bus,
>   trip_search: Bus,
>   booking_transport: Bus,
>   coverage_map: Bus,
>   membership_plans: Dumbbell,
>   class_schedule: Dumbbell,
>   trainers: Dumbbell,
>   gym_features: Dumbbell,
>   transformation: Dumbbell,
>   parking_zones: SquareParking,
>   parking_pricing: SquareParking,
>   parking_pass_plans: SquareParking,
>   parking_features: SquareParking,
>   parking_availability: SquareParking,
>   features_grid: Plug,
>   how_it_works: Plug,
>   pricing_table: Plug,
>   demo_cta: Plug,
>   integrations: Plug,
> };
> ```
>
> Si no se extiende `ICON_MAP`, las secciones sin icono mapeado muestran un
> icono fallback genérico (ej. `LayoutTemplate`). No es bloqueante, pero
> degrada la UX. **Deuda técnica**: ver item del DoD (§9) — "Extender ICON_MAP
> con Bus, Dumbbell, SquareParking, Plug para secciones de
> transporte/gym/parking/servicios".

### 3.3 Conexión desde el editor

En `page.tsx`, calcular las secciones permitidas y pasarlas al dialog:

```typescript
import { getAllowedSectionTypes } from '@/lib/services/website/sectionsByBranchType';

const allowedSectionTypes = getAllowedSectionTypes(selectedBranch?.branch_type);

// En el JSX:
<AddSectionDialog
  open={showAddDialog}
  onOpenChange={setShowAddDialog}
  onAdd={handleAddSection}
  existingSectionTypes={currentPage.sections.map((s) => s.section_type)}
  allowedSectionTypes={allowedSectionTypes}
/>
```

### 3.4 Reglas

- Si el outlet es **"Global"** (`branch_type = null`) → `allowedSectionTypes =
  null` → el dialog muestra **todas** las secciones del catálogo
  (comportamiento actual, backward compat).
- Si el outlet tiene `branch_type = 'hotel'` → solo secciones universales +
  `room_types`, `amenities`, `booking_cta`, `why_choose_us`.
- Si `branch_type` no está en el mapa (valor desconocido) → fallback a solo
  universales.

---

## 4. Cambios en `websitePageBuilderService.ts`

Archivo: `src/lib/services/websitePageBuilderService.ts`

### 4.1 `getPages(orgId, branchId?)`

Filtrar por `branch_id`. Cuando se pasa un `branchId` concreto, se listan las
páginas de ese outlet **+** las globales (`branch_id IS NULL`):

```typescript
class WebsitePageBuilderService {
  // ---- PAGES ----

  async getPages(organizationId: number, branchId?: number | null): Promise<WebsitePage[]> {
    let query = supabase
      .from('website_pages')
      .select('*')
      .eq('organization_id', organizationId);

    if (branchId === null) {
      // Global explícito: SOLO páginas globales (branch_id IS NULL)
      query = query.is('branch_id', null);
    } else if (branchId !== undefined) {
      // Outlet concreto: páginas del outlet + páginas globales (branch_id IS NULL)
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }
    // Si branchId === undefined (no se pasa) → no filtrar (backward compat legacy)

    const { data, error } = await query.order('header_order', { ascending: true });

    if (error) throw error;
    return (data || []) as WebsitePage[];
  }
```

> **Nota (corregido por QA)**: los tres casos son distintos:
> - `branchId = null` (Global explícito) → trae **solo** `branch_id IS NULL`.
>   Antes traía todas las páginas, lo que era incorrecto: "Global" debe mostrar
>   únicamente las páginas globales de la organización, no las de cada outlet.
> - `branchId = <n>` (outlet concreto) → trae las páginas del outlet **+** las
>   globales (herencia).
> - `branchId = undefined` (no se pasa, legacy) → no filtra por `branch_id`
>   (backward compat con llamadas que no conocen el parámetro).

### 4.2 `createPage(data)` — aceptar `branch_id` + validar slug único

> **Corrección QA**: el slug debe ser único **por `organization_id` +
> `branch_id`** (no global). El índice `idx_website_pages_org_branch_slug`
> (Fase 0 §2.1) garantiza unicidad en BD sobre `COALESCE(branch_id, -1)`, pero
> el cliente JS de Supabase no puede hacer `onConflict` sobre esa expresión, así
> que se valida **antes** de insertar con un `select` explícito. Si el slug ya
> existe para ese `(org, branch)`, se lanza un error claro en vez de depender
> del mensaje críptico de la constraint de BD.

```typescript
  async createPage(page: {
    organization_id: number;
    slug: string;
    title: string;
    page_type?: string;
    show_in_header?: boolean;
    show_in_footer?: boolean;
    header_order?: number;
    footer_order?: number;
    parent_page_id?: string | null;
    linked_category_id?: number | null;
    menu_icon?: string | null;
    menu_badge?: string | null;
    page_settings?: Record<string, any> | null;
    branch_id?: number | null; // ← NUEVO
  }): Promise<WebsitePage> {
    const branch = page.branch_id ?? null;

    // 1. Validar slug único por (organization_id, branch_id)
    let dupQuery = supabase
      .from('website_pages')
      .select('id')
      .eq('organization_id', page.organization_id)
      .eq('slug', page.slug);

    if (branch === null) {
      dupQuery = dupQuery.is('branch_id', null);
    } else {
      dupQuery = dupQuery.eq('branch_id', branch);
    }

    const { data: existing } = await dupQuery.maybeSingle();
    if (existing) {
      const scope = branch === null ? 'global de la organización' : `del outlet ${branch}`;
      throw new Error(`Ya existe una página con el slug "${page.slug}" en el ámbito ${scope}. Elige otro slug.`);
    }

    // 2. Insertar
    const { data, error } = await supabase
      .from('website_pages')
      .insert({
        ...page,
        branch_id: branch,
        page_type: page.page_type || 'builtin',
        is_published: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data as WebsitePage;
  }
```

### 4.2.1 `duplicatePage(pageId)` — validar slug único al duplicar

Al duplicar una página (acción existente en el editor), el slug propuesto suele
ser `${originalSlug}-copy`. Se aplica la misma validación de unicidad por
`(organization_id, branch_id)`:

> **Corrección QA R2 (tope máximo de iteraciones)**: el bucle `while (true)`
> original no tenía límite, lo que podía causar un loop infinito si por algún
> edge case (race condition, datos corruptos) el `select` nunca devolviera
> `null`. Se añadió un tope de 99 intentos (`MAX_DUP_ATTEMPTS`): si se alcanza,
> se lanza un error claro en vez de colgar el cliente.

```typescript
  async duplicatePage(pageId: string): Promise<WebsitePage> {
    // 1. Cargar la página origen
    const { data: src, error: srcErr } = await supabase
      .from('website_pages')
      .select('*')
      .eq('id', pageId)
      .single();
    if (srcErr) throw srcErr;

    // 2. Generar slug único dentro del ámbito (org, branch)
    const branch = src.branch_id ?? null;
    let candidate = `${src.slug}-copy`;
    let suffix = 1;
    const MAX_DUP_ATTEMPTS = 99; // tope para evitar loop infinito
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (++attempt > MAX_DUP_ATTEMPTS) {
        throw new Error(
          `No se pudo generar un slug único tras ${MAX_DUP_ATTEMPTS} intentos ` +
          `(base "${src.slug}-copy" en ámbito ${branch === null ? 'global' : `outlet ${branch}`}). ` +
          'Elige un slug manualmente.',
        );
      }
      let q = supabase
        .from('website_pages')
        .select('id')
        .eq('organization_id', src.organization_id)
        .eq('slug', candidate);
      if (branch === null) q = q.is('branch_id', null);
      else q = q.eq('branch_id', branch);

      const { data: clash } = await q.maybeSingle();
      if (!clash) break;
      candidate = `${src.slug}-copy-${++suffix}`;
    }

    // 3. Insertar la copia (mismo branch_id que la original)
    const { data, error } = await supabase
      .from('website_pages')
      .insert({
        organization_id: src.organization_id,
        slug: candidate,
        title: `${src.title} (copia)`,
        page_type: src.page_type,
        show_in_header: false, // la copia no se muestra hasta decidirlo
        show_in_footer: false,
        page_settings: src.page_settings,
        branch_id: branch,
        is_published: false,
      })
      .select()
      .single();
    if (error) throw error;
    return data as WebsitePage;
  }
```

### 4.2.2 `updatePage(pageId, updates)` — validar slug único al editar

> **Corrección QA**: `updatePage` debe validar que el slug sea único por
> `(organization_id, branch_id)` antes de guardar. Si el slug ya existe para
> otro `branch_id` (o para otra página en el mismo ámbito), lanzar un error
> claro. Esto evita que al renombrar el slug de una página se genere un
> conflicto silencioso con la constraint de BD.

```typescript
  async updatePage(
    pageId: string,
    updates: Partial<Pick<WebsitePage, 'slug' | 'title' | 'show_in_header' | 'show_in_footer' | 'header_order' | 'footer_order' | 'page_settings'>>,
  ): Promise<WebsitePage> {
    // Solo validar slug si se está cambiando
    if (updates.slug !== undefined) {
      // Cargar la página actual para obtener org y branch
      const { data: current } = await supabase
        .from('website_pages')
        .select('organization_id, branch_id, slug')
        .eq('id', pageId)
        .single();
      if (!current) throw new Error('Página no encontrada.');

      // Si el slug no cambió, no validar
      if (current.slug === updates.slug) {
        // Continuar con el update normal
      } else {
        const branch = current.branch_id ?? null;

        // Buscar si ya existe OTRA página con ese slug en el mismo ámbito
        let dupQuery = supabase
          .from('website_pages')
          .select('id')
          .eq('organization_id', current.organization_id)
          .eq('slug', updates.slug)
          .neq('id', pageId); // excluir la propia página

        if (branch === null) {
          dupQuery = dupQuery.is('branch_id', null);
        } else {
          dupQuery = dupQuery.eq('branch_id', branch);
        }

        const { data: existing } = await dupQuery.maybeSingle();
        if (existing) {
          const scope = branch === null
            ? 'global de la organización'
            : `del outlet ${branch}`;
          throw new Error(
            `Ya existe una página con el slug "${updates.slug}" en el ámbito ${scope}. Elige otro slug.`,
          );
        }
      }
    }

    // Proceder con el update
    const { data, error } = await supabase
      .from('website_pages')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', pageId)
      .select()
      .single();
    if (error) throw error;
    return data as WebsitePage;
  }
```

### 4.3 `addSection` — propagar `branch_id` de la página

La sección hereda `branch_id` de la página a la que pertenece. Para mantener
`website_page_sections.branch_id` sincronizado (ver Fase 0 §2.4), el servicio
copia el `branch_id` de la página al insertar la sección:

```typescript
  async addSection(section: {
    page_id: string;
    organization_id: number;
    section_type: string;
    section_variant: string;
    content?: Record<string, any>;
    settings?: Record<string, any>;
    sort_order: number;
  }): Promise<WebsitePageSection> {
    // Resolver branch_id de la página padre (para sincronizar sections.branch_id)
    const { data: page } = await supabase
      .from('website_pages')
      .select('branch_id')
      .eq('id', section.page_id)
      .single();

    const { data, error } = await supabase
      .from('website_page_sections')
      .insert({
        ...section,
        content: section.content || {},
        settings: section.settings || {},
        is_visible: true,
        branch_id: page?.branch_id ?? null, // ← hereda de la página
      })
      .select()
      .single();

    if (error) throw error;
    return data as WebsitePageSection;
  }
```

### 4.4 `getSections(pageId)` — sin cambios

Las secciones ya se obtienen vía `getPageWithSections(pageId)` que filtra por
`page_id`. No se necesita cambio: las secciones heredan el `branch_id` de la
página.

> **Corrección QA (validación de pertenencia en `getPageWithSections`)**:
> `getPageWithSections(pageId)` debe validar que la página pertenece a la org
> del usuario autenticado. Opcionalmente, si `selectedBranchId` está seteado,
> validar que `page.branch_id === selectedBranchId`. Si no coincide, mostrar
> error "Esta página pertenece a otro outlet".
>
> **Corrección QA R7**: la validación anterior usaba
> `if (selectedBranchId !== undefined)`, pero `loadData` inicializa
> `selectedBranchId` en `null` (no `undefined`). Con `null`, la condición
> `!== undefined` es `true`, y al comparar `pageBranch !== selectedBranchId`
> (ej. `X !== null`), lanzaría error al abrir una página de outlet válida.
> Se cambia a `typeof selectedBranchId === 'number'` para que la validación
> solo aplique cuando hay un outlet concreto seleccionado (número), no cuando
> es `null` (Global) o `undefined` (carga inicial).
>
> ```typescript
> async getPageWithSections(
>   pageId: string,
>   organizationId?: number,
>   selectedBranchId?: number | null,
> ): Promise<WebsitePage> {
>   const { data, error } = await supabase
>     .from('website_pages')
>     .select('*, sections:website_page_sections(*)')
>     .eq('id', pageId)
>     .single();
>   if (error) throw error;
>
>   // Validar que la página pertenece a la org del usuario
>   if (organizationId && data.organization_id !== organizationId) {
>     throw new Error('Esta página no pertenece a tu organización.');
>   }
>
>   // Validar pertenencia al outlet seleccionado (solo si hay outlet seleccionado)
>   if (typeof selectedBranchId === 'number' && typeof data.branch_id === 'number' && data.branch_id !== selectedBranchId) {
>     throw new Error('Esta página pertenece a otro outlet.');
>   }
>
>   // Si la página es global (branch_id IS NULL) y hay outlet seleccionado, permitir (fallback a global)
>   // Si la página es del outlet y no hay outlet seleccionado, permitir (carga inicial)
>   return data as WebsitePage;
> }
> ```

### 4.5 Interfaz `WebsitePage` — añadir `branch_id`

> Ver §8.2 para la interfaz completa de `WebsitePage` con `branch_id`. La
> definición canónica vive en §8.2 para evitar duplicación; este punto solo
> referencia que `WebsitePage` debe incluir el campo `branch_id?: number | null`
> añadido en la Fase 0.

---

## 5. Cambios en `websiteSettingsService.ts`

Archivo: `src/lib/services/websiteSettingsService.ts`

### 5.1 `getSettings(orgId, branchId?)`

Si `branchId` existe, traer los settings del branch; si no, settings de la org
(comportamiento actual):

```typescript
class WebsiteSettingsService {
  async getSettings(
    organizationId: number,
    branchId?: number | null,
  ): Promise<WebsiteSettings | null> {
    try {
      let query = supabase
        .from('website_settings')
        .select('*')
        .eq('organization_id', organizationId);

      if (branchId !== undefined && branchId !== null) {
        // Settings del outlet (branch_id = branchId)
        query = query.eq('branch_id', branchId);
      } else if (branchId === null) {
        // Global explícito: settings con branch_id IS NULL
        query = query.is('branch_id', null);
      }
      // branchId === undefined → legacy: sin filtro por branch_id.
      // ⚠ Puede devolver MÚLTIPLES filas (global + cada outlet). Se usa
      //   .limit(1).maybeSingle() para traer solo la primera y evitar el
      //   error PGRST116 (Multiple rows). Preferir siempre pasar `null`
      //   explícito para Global en vez de `undefined` (ver nota abajo).

      const { data, error } = await query.limit(1).maybeSingle();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      // Si no existen settings del outlet, retornar null (la UI puede
      // decidir crearlos o hacer fallback a los globales).
      return data as WebsiteSettings | null;
    } catch (error) {
      console.error('Error fetching website settings:', error);
      throw error;
    }
  }
```

> **Decisión**: si el outlet no tiene settings propios, `getSettings` retorna
> `null`. La UI del editor puede entonces hacer **fallback visual** a los
> settings globales (mostrarlos como base) y marcar los campos como "heredado"
> hasta que el usuario guarde un override. Esto se alinea con el principio de
> **theme merge** de la Fase 2: `theme = {...orgSettings, ...outletOverride}`.

> **Corrección QA R2 (caso `branchId === undefined`)**: el caso legacy
> `undefined` (no pasar el argumento) **no filtra** por `branch_id`, por lo que
> la query puede devolver **múltiples filas** (la global + una por cada outlet
> con settings propios). Sin `.limit(1)`, Postgrest lanza `PGRST116` (Multiple
> rows) al usar `.single()`/`.maybeSingle()`. Por eso se añadió
> `.limit(1).maybeSingle()`. **Recomendación**: deprecar el caso `undefined` y
> **siempre pasar `null` explícito** para traer la global (`.is('branch_id',
> null)`), o el `branchId` concreto del outlet. El caso `undefined` se mantiene
> solo por backward compat con llamadas antiguas que no conocen el parámetro;
> los nuevos call sites deben pasar `null` o un número.

### 5.2 `updateSettings(orgId, data, branchId?)` — upsert manual (por defecto)

Upsert de settings del branch. Si el outlet no tiene settings, se crean; si
tiene, se actualizan.

> **Corrección QA**: el cliente JS de Supabase **no soporta** `onConflict`
> sobre una expresión `COALESCE(branch_id, -1)` (el índice único
> `idx_website_settings_org_branch` de la Fase 0 §2.2 usa esa expresión para
> tratar `NULL` como único). Por eso la implementación **por defecto** es un
> upsert manual: `select` → si existe `update`, si no `insert`. La versión con
> `onConflict` se conserva más abajo solo como referencia/alternativa si en el
> futuro se migra el índice a columnas simples.

```typescript
  async updateSettings(
    organizationId: number,
    updates: Partial<WebsiteSettings>,
    branchId?: number | null,
  ): Promise<WebsiteSettings> {
    const branch = branchId ?? null;

    // 1. Buscar si ya existen settings para (org, branch)
    let query = supabase
      .from('website_settings')
      .select('id')
      .eq('organization_id', organizationId);

    if (branch === null) {
      query = query.is('branch_id', null);
    } else {
      query = query.eq('branch_id', branch);
    }

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      // Update
      const { data, error } = await supabase
        .from('website_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as WebsiteSettings;
    }

    // Insert (crear settings del outlet con defaults + overrides)
    const { data, error } = await supabase
      .from('website_settings')
      .insert({
        ...updates,
        organization_id: organizationId,
        branch_id: branch,
      })
      .select()
      .single();
    if (error) throw error;
    return data as WebsiteSettings;
  }
```

### 5.3 Alternativa con `onConflict` (no usar por defecto)

> **Corrección QA R7 (undefined vs null en getSettings/updateSettings)**:
> `getSettings` con `undefined` = legacy (sin filtro `branch_id`,
> `.limit(1).maybeSingle()`). `updateSettings` con `undefined` se normaliza a
> `null` (global). Esta diferencia es **intencional**: `getSettings` preserva
> backward compat (sitios legacy que no conocen el parámetro), mientras que
> `updateSettings` siempre escribe explícitamente (`branch_id = null` para
> global, `branch_id = X` para outlet). Nunca se debe pasar `undefined` a
> `updateSettings` en código nuevo — siempre pasar `null` (Global) o un número
> (outlet concreto).

> **No usar** `onConflict` para multi-outlet. El upsert manual (select + insert/update)
> de §5.2 es el enfoque correcto porque maneja el caso de settings globales vs outlet
> de forma explícita y predecible. La alternativa con `onConflict` se muestra solo
> como referencia de lo que **NO** hacer — el índice único
> `idx_website_settings_org_branch` usa `COALESCE(branch_id, -1)`, y el cliente JS
> de Supabase **no soporta** `onConflict` sobre una expresión `COALESCE`. Si en el
> futuro se reemplaza el índice por columnas simples (`organization_id, branch_id`
> con `NULLS NOT DISTINCT` en PG 15+), esta versión pasa a ser válida:

```typescript
  // ⚠ NO usar por defecto — ver nota arriba.
  async updateSettings(
    organizationId: number,
    updates: Partial<WebsiteSettings>,
    branchId?: number | null,
  ): Promise<WebsiteSettings> {
    const payload = {
      ...updates,
      organization_id: organizationId,
      branch_id: branchId ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('website_settings')
      .upsert(payload, {
        onConflict: 'organization_id,branch_id',
      })
      .select()
      .single();

    if (error) throw error;
    return data as WebsiteSettings;
  }
```

### 5.4 Métodos existentes (`updateTheme`, `updateHeaderConfig`, etc.)

Los métodos `updateTheme`, `updateHeaderConfig`, `updateFooterConfig`,
`updateContent`, `updateSEO`, etc. hoy filtran solo por `organization_id` con
`.eq('organization_id', organizationId).single()`. Para soportar multi-outlet,
**todos** deben aceptar `branchId?` y filtrar por `(organization_id, branch_id)`.

Patrón a aplicar a cada método:

```typescript
  async updateTheme(
    organizationId: number,
    theme: { /* ... */ },
    branchId?: number | null,
  ): Promise<WebsiteSettings> {
    let query = supabase
      .from('website_settings')
      .update({ ...theme, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId);

    if (branchId !== undefined && branchId !== null) {
      query = query.eq('branch_id', branchId);
    } else if (branchId === null) {
      query = query.is('branch_id', null);
    }

    const { data, error } = await query.select().maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('No se encontraron settings para el outlet.');
    return data as WebsiteSettings;
  }
```

Repetir el mismo patrón para: `updateHero`, `updateSections`, `updateFeatures`,
`updateSEO`, `updateContent`, `updateAdvanced`, `togglePublish`,
`updateHeaderConfig`, `updateFooterConfig`.

### 5.5 Interfaz `WebsiteSettings` — añadir `branch_id`

```typescript
export interface WebsiteSettings {
  id: string;
  organization_id: number;
  // ... campos existentes ...
  branch_id?: number | null; // ← NUEVO (Fase 0)
}
```

---

## 6. UI del editor

### 6.1 Componente `OutletSelector`

Archivo nuevo: `src/components/organization/branding/editor/OutletSelector.tsx`

```typescript
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, Globe, Hotel, UtensilsCrossed, ShoppingBag, Dumbbell, Bus, ParkingCircle, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { BranchType } from '@/types/branch';

export interface OutletOption {
  value: number | null; // null = Global
  label: string;
  branchType: BranchType | null;
}

interface OutletSelectorProps {
  options: OutletOption[];
  value: number | null;
  onChange: (branchId: number | null) => void;
}

const BRANCH_TYPE_ICON: Record<string, any> = {
  hotel: Hotel,
  restaurant: UtensilsCrossed,
  retail: ShoppingBag,
  gym: Dumbbell,
  transport: Bus,
  parking: ParkingCircle,
  services: Wrench,
};

const BRANCH_TYPE_LABEL: Record<string, string> = {
  hotel: 'Hotel',
  restaurant: 'Restaurante',
  retail: 'Retail',
  gym: 'Gym',
  transport: 'Transporte',
  parking: 'Parking',
  services: 'Servicios',
};

export function OutletSelector({ options, value, onChange }: OutletSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-gray-400" />
      <Select
        value={value === null ? 'global' : String(value)}
        onValueChange={(val) => onChange(val === 'global' ? null : Number(val))}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Seleccionar outlet" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => {
            const Icon = opt.branchType ? BRANCH_TYPE_ICON[opt.branchType] : Globe;
            return (
              <SelectItem key={opt.value === null ? 'global' : opt.value} value={opt.value === null ? 'global' : String(opt.value)}>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{opt.label}</span>
                  {opt.branchType && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {BRANCH_TYPE_LABEL[opt.branchType] ?? opt.branchType}
                    </Badge>
                  )}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
```

### 6.2 Indicador visual de outlet en edición

En el `EditorHeader`, mostrar un badge con el nombre del outlet activo:

```tsx
{selectedBranch ? (
  <Badge variant="outline" className="gap-1">
    {selectedBranch.name}
    {selectedBranch.branch_type && (
      <span className="text-[10px] text-gray-500">
        · {selectedBranch.branch_type}
      </span>
    )}
  </Badge>
) : (
  <Badge variant="outline" className="gap-1">
    <Globe className="h-3 w-3" />
    Global
  </Badge>
)}
```

### 6.3 Advertencia al editar página global

Si el outlet seleccionado no es "Global" pero la página actual es global
(`branch_id = null`), mostrar una advertencia: editar una página global afecta
a **todos** los outlets.

```tsx
{currentPage?.branch_id === null && selectedBranchId !== null && (
  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
    ⚠ Estás editando una página <strong>global</strong>. Los cambios afectan a
    todos los outlets de la organización.
  </div>
)}
```

### 6.4 Recarga al cambiar outlet

Al cambiar el outlet (`handleOutletChange`), se recargan:

1. **Páginas** → `getPages(orgId, branchId)`.
2. **Settings** → `getSettings(orgId, branchId)`.
3. **Secciones permitidas** → se recalculan con
   `getAllowedSectionTypes(selectedBranch.branch_type)`.
4. Si la página actual no pertenece al outlet → cambiar a la primera página
   disponible.

### 6.5 ConfirmDialog para `pendingOutletChange`

> **Corrección QA**: `pendingOutletChange` (definido en §2.4) no tenía un
> `ConfirmDialog` asociado, a diferencia de `pendingPageChange` y
> `pendingDeleteSection`. Añadir el diálogo para que el usuario confirme antes
> de descartar cambios sin guardar al cambiar de outlet.

```tsx
{/* Confirmar cambio de outlet con cambios sin guardar */}
<ConfirmDialog
  open={pendingOutletChange !== undefined}
  onOpenChange={(open) => {
    if (!open) setPendingOutletChange(undefined);
  }}
  title="Cambiar de outlet"
  description="Tienes cambios sin guardar. Si cambias de outlet, se perderán. ¿Deseas continuar?"
  confirmText="Cambiar outlet"
  cancelText="Cancelar"
  onConfirm={async () => {
    const branchId = pendingOutletChange;
    setPendingOutletChange(undefined);
    if (branchId !== undefined) {
      await doOutletChange(branchId);
    }
  }}
/>
```

> El patrón es idéntico al de `pendingPageChange` y `pendingDeleteSection`:
> `handleOutletChange` setea `pendingOutletChange` si `hasChanges` es true, y
> el `ConfirmDialog` llama a `doOutletChange` al confirmar.

---

## 7. Actualización de `handleSave`

> **Corrección QA (crítico)**: el `handleSave` del editor seguía llamando a
> `websiteSettingsService.updateTheme(organizationId, ...)` **sin**
> `selectedBranchId`, lo que hace que los cambios se guarden siempre en la
> settings global (`branch_id IS NULL`) en vez de en el outlet seleccionado.
> Todos los métodos de guardado deben recibir `selectedBranchId` como último
> parámetro.

### 7.1 Recomendación: alternativa simple (mantener métodos existentes)

> **Corrección QA (crítico)**: existe la tentación de crear un `updateSettings`
> genérico que reciba un payload unificado y lo enrute internamente. Sin
> embargo, **se recomienda la alternativa simple**: mantener los métodos
> existentes (`updateTheme`, `updateHeaderConfig`, `updateFooterConfig`,
> `updateContent`, `updateSEO`, `togglePublish`) y añadir `selectedBranchId`
> como **último parámetro** a cada llamada en `handleSave`.
>
> **Razones**:
> - Minimiza cambios: no se refactoriza la firma ni el cuerpo de los métodos
>   del servicio (que ya aceptan `branchId?` según §5.4).
> - Evita introducir un `updateSettings` genérico que habría que conectar a
>   `handleSave` reescribiendo toda la lógica de guardado.
> - El riesgo de bug es menor: cada método ya sabe qué campos actualizar.
>
> Si en el futuro se quiere consolidar, se puede crear un `updateSettings`
> genérico que internamente llame a los métodos existentes, pero **no es
> necesario para esta fase**.

### 7.2 Snippet de `handleSave` modificado

```typescript
const handleSave = async () => {
  if (!organizationId) return;
  setIsSaving(true);
  try {
    // Pasar selectedBranchId a CADA llamada de guardado
    if (pendingSettingsUpdates.theme) {
      await websiteSettingsService.updateTheme(
        organizationId,
        pendingSettingsUpdates.theme,
        selectedBranchId, // ← NUEVO
      );
    }

    if (pendingSettingsUpdates.headerConfig) {
      await websiteSettingsService.updateHeaderConfig(
        organizationId,
        pendingSettingsUpdates.headerConfig,
        selectedBranchId, // ← NUEVO
      );
    }

    if (pendingSettingsUpdates.footerConfig) {
      await websiteSettingsService.updateFooterConfig(
        organizationId,
        pendingSettingsUpdates.footerConfig,
        selectedBranchId, // ← NUEVO
      );
    }

    if (pendingSettingsUpdates.content) {
      await websiteSettingsService.updateContent(
        organizationId,
        pendingSettingsUpdates.content,
        selectedBranchId, // ← NUEVO
      );
    }

    if (pendingSettingsUpdates.seo) {
      await websiteSettingsService.updateSEO(
        organizationId,
        pendingSettingsUpdates.seo,
        selectedBranchId, // ← NUEVO
      );
    }

    if (pendingSettingsUpdates.hero) {
      await websiteSettingsService.updateHero(
        organizationId,
        pendingSettingsUpdates.hero,
        selectedBranchId, // ← NUEVO
      );
    }

    if (pendingSettingsUpdates.features) {
      await websiteSettingsService.updateFeatures(
        organizationId,
        pendingSettingsUpdates.features,
        selectedBranchId, // ← NUEVO
      );
    }

    if (pendingSettingsUpdates.sections) {
      await websiteSettingsService.updateSections(
        organizationId,
        pendingSettingsUpdates.sections,
        selectedBranchId, // ← NUEVO
      );
    }

    if (pendingSettingsUpdates.publish !== undefined) {
      await websiteSettingsService.togglePublish(
        organizationId,
        pendingSettingsUpdates.publish,
        selectedBranchId, // ← NUEVO
      );
    }

    // Guardar secciones pendientes (sin cambios — ya usan pageId)
    for (const [sectionId, updates] of pendingSectionUpdates.current.entries()) {
      await websitePageBuilderService.updateSection(sectionId, updates);
    }

    pendingSectionUpdates.current.clear();
    pendingSettingsUpdates.current = {};
    setHasChanges(false);
    toast({ title: 'Cambios guardados', description: 'El branding del outlet se actualizó correctamente.' });
  } catch (error) {
    console.error('Error saving:', error);
    toast({ title: 'Error', description: 'No se pudieron guardar los cambios.', variant: 'destructive' });
  } finally {
    setIsSaving(false);
  }
};
```

> **Nota**: si `selectedBranchId` es `null` (Global), los métodos del servicio
> filtran por `branch_id IS NULL` (§5.4), lo que corresponde a los settings
> globales de la organización — comportamiento correcto para "Global".

> **Corrección QA R2 (cobertura de métodos)**: el snippet anterior cubre
> `updateTheme`, `updateHeaderConfig`, `updateFooterConfig`, `updateContent`,
> `updateSEO`, `togglePublish`, `updateHero`, `updateFeatures` y
> `updateSections`. **Todos los métodos de `websiteSettingsService` que guardan
> settings deben recibir `selectedBranchId` como último parámetro.** Revisar los
> 17 métodos del servicio y asegurar que TODOS lo reciben. Si existe algún
> método de guardado que no aparece en el snippet (ej. `updateAdvanced`,
> `updateCustomCss`), añadirle `selectedBranchId` con el mismo patrón.

> **Nota QA R6 (lista completa de 17 métodos)**: los 17 métodos de
> `websiteSettingsService` son: `updateTheme`, `updateHeaderConfig`,
> `updateFooterConfig`, `updateContent`, `updateSEO`, `togglePublish`,
> `updateHero`, `updateFeatures`, `updateSections`, `updateAdvanced`,
> `updateCustomCss`, `updateLayout`, `updateNavigation`,
> `updateSocialLinks`, `updateBusinessHours`, `updateGallery`,
> `updateTestimonials`. Todos deben recibir `selectedBranchId` como último
> parámetro.

---

## 8. Actualización de tipos TypeScript

> **Corrección QA (medio)**: los tipos `Branch`, `WebsitePage` y
> `WebsitePageSection` están desactualizados: no reflejan las columnas
> añadidas en la Fase 0 (`branch_id`, `slug`, `subdomain`, etc.). Sin
> actualizar los tipos, el compilador de TypeScript no reconoce los campos
> nuevos y el editor no compila.

### 8.1 `src/types/branch.ts` — añadir campos web

```typescript
import type { BranchType } from '@/types/branch';

export interface Branch {
  id: number;
  organization_id: number;
  name: string;
  branch_type?: BranchType | null;
  // ... campos existentes ...

  // ← NUEVOS (Fase 0 — columns para multi-outlet web)
  slug?: string | null;
  subdomain?: string | null;
  custom_domain?: string | null;
  website_logo_url?: string | null;
  website_cover_url?: string | null;
  is_web_published?: boolean | null;
}
```

### 8.2 `websitePageBuilderService.ts` — añadir `branch_id` a interfaces

```typescript
export interface WebsitePage {
  id: string;
  organization_id: number;
  // ... campos existentes ...
  branch_id?: number | null; // ← NUEVO (Fase 0)
}

export interface WebsitePageSection {
  id: string;
  page_id: string;
  organization_id: number;
  // ... campos existentes ...
  branch_id?: number | null; // ← NUEVO (Fase 0)
}
```

### 8.3 Regenerar tipos de Supabase

Después de aplicar las migraciones de la Fase 0, regenerar los tipos
autogenerados de Supabase para que reflejen las columnas nuevas:

```bash
npx supabase gen types typescript --project-id jgmgphmzusbluqhuqihj \
  > src/types/supabase-generated.ts
```

> **Nota**: los tipos manuales (`Branch`, `WebsitePage`,
> `WebsitePageSection`) se mantienen como interfaces de dominio. Los tipos
> autogenerados sirven como referencia y para validar que las columnas
> existen en BD. Si se usa el cliente tipado de Supabase, los tipos
> autogenerados deben estar al día.

---

## 9. Definition of Done

- [x] Selector de outlet (`OutletSelector`) en el editor de branding
- [x] Opciones del selector: "Global" + branches con `is_web_published=true` **y `branch_type` válido**
- [x] Páginas se filtran por `branch_id` del outlet seleccionado (outlet + globales)
- [x] "Global" lista **solo** páginas globales (`branch_id IS NULL`), no todas
- [x] Secciones se filtran por `branch_type` del outlet en `AddSectionDialog`
- [x] `SECTIONS_BY_BRANCH_TYPE` cubre hotel, restaurant, retail, gym, transport, parking, services
- [x] "Global" muestra todas las secciones (backward compat)
- [x] Settings se cargan por `branch_id` (`getSettings(orgId, branchId)`)
- [x] Settings se guardan por `branch_id` (`updateSettings` con upsert **manual**, no `onConflict`)
- [x] Crear página asigna `branch_id` del outlet seleccionado
- [x] Crear/duplicar página valida slug único por `(organization_id, branch_id)` antes de insertar
- [x] `duplicatePage` tiene tope máximo de iteraciones (99) para evitar loop infinito
- [x] `publishedBranches` solo contiene branches con `branch_type` válido (filtrado al cargar en `loadData`)
- [x] `getSettings` con `branchId === undefined` usa `.limit(1).maybeSingle()` (caso legacy deprecado)
- [x] `addSection` propaga `branch_id` de la página a la sección
- [x] `getPageWithSections` valida que la página pertenece a la org (y opcionalmente al outlet seleccionado)
- [x] `updatePage` valida slug único por `(organization_id, branch_id)` antes de guardar
- [x] `handleSave` pasa `selectedBranchId` a cada llamada (`updateTheme`, `updateHeaderConfig`, `updateFooterConfig`, `updateContent`, `updateSEO`, `togglePublish`, `updateHero`, `updateFeatures`, `updateSections`)
- [x] Todos los métodos de `websiteSettingsService` que guardan settings reciben `selectedBranchId` como último parámetro (17 métodos)
- [x] `selectedBranchId` se resuelve desde `currentPage.branch_id` al cargar el editor (no se asume Global)
- [x] `ConfirmDialog` para `pendingOutletChange` (cambiar outlet con cambios sin guardar)
- [x] Validación de `branch_type` obligatorio al publicar un outlet (`is_web_published=true`)
- [x] Advertencia visible al editar página global desde un outlet
- [x] Indicador visual del outlet activo en el `EditorHeader`
- [x] Extender `ICON_MAP` con `Bus`, `Dumbbell`, `SquareParking`, `Plug` para secciones de transporte/gym/parking/servicios
- [x] Tipos `Branch`, `WebsitePage`, `WebsitePageSection` actualizados con campos de la Fase 0
- [x] Tipos de Supabase regenerados con `npx supabase gen types`
- [ ] `npm run lint` + `tsc --noEmit` limpios en el ERP
- [ ] Tests del plan de pruebas (§11) pasan
- [x] Cero archivos `.sql` en el repo

---

## 10. Riesgos

- **Página global editada desde un outlet**: si una página global
  (`branch_id = null`) se edita, afecta a todos los outlets. **Mitigación**:
  mostrar advertencia visible (§6.3) y requerir confirmación al guardar si la
  página es global y el outlet seleccionado no lo es.
- **Outlet sin settings propios**: si un outlet no tiene fila en
  `website_settings`, `getSettings` retorna `null`. La UI debe hacer fallback
  visual a los settings globales y marcar los campos como "heredado" hasta que
  el usuario guarde un override. Esto es consistente con el **theme merge** de
  la Fase 2.
- **`branch_type` vacío o desconocido**: si una branch tiene `branch_type =
  null` o un valor no mapeado, `getAllowedSectionTypes` retorna solo las
  universales. No rompe el editor, pero el usuario no verá secciones
  específicas. **Mitigación**: la validación de §2.7 (parte B,
  `branchService.setWebPublished`) bloquea la publicación de outlets sin
  `branch_type`, y la Fase 6 (BranchForm) debe marcarlo obligatorio
  cuando `is_web_published = true`.
- **Slug duplicado al crear/duplicar página**: el slug debe ser único por
  `(organization_id, branch_id)`. El índice `idx_website_pages_org_branch_slug`
  lo garantiza en BD, pero el mensaje de constraint es críptico. **Mitigación**:
  `createPage`/`duplicatePage` validan con un `select` previo y lanzan un error
  claro indicando el ámbito (global / outlet N) antes de insertar (§4.2).
- **Secciones existentes fuera del filtro**: si una página ya tiene secciones
  que no están en el `branch_type` del outlet (ej. se migró contenido global a
  un outlet hotel pero tenía `menu_preview`), esas secciones **siguen
  renderizando** — el filtro solo aplica al **agregar** nuevas secciones, no
  elimina las existentes. El usuario puede eliminarlas manualmente.
- **`website_page_sections.branch_id` desincronizado**: si una sección se
  crea sin `branch_id` (ej. vía importación o API directa), puede quedar
  `NULL` aunque la página pertenezca a un outlet. **Mitigación**: `addSection`
  resuelve el `branch_id` de la página al insertar (§4.3). Opcionalmente,
  añadir un trigger en BD que sincronice `sections.branch_id = pages.branch_id`
  on insert/update (mencionado en Fase 0 §2.4 como mejora opcional de Fase 4).
- **Performance**: `getPages` con `or(branch_id.eq.X,branch_id.is.null)` es
  una query simple sobre el índice `idx_website_pages_org_branch_slug`. No
  hay impacto medible con 1046 filas.

---

## 11. Plan de pruebas

Casos de prueba que validan el comportamiento multi-outlet del editor. Deben
pasar antes de marcar el DoD como completo (ver §9, item "Tests del plan de
pruebas (§11) pasan").

### 11.1 Editor en modo Global: cambios se guardan en fila global

- **Precondición**: outlet seleccionado = "Global (organización)"
  (`selectedBranchId = null`).
- **Acción**: editar theme/header/footer y pulsar Guardar.
- **Resultado esperado**: `websiteSettingsService.updateTheme(orgId, data,
  null)` filtra por `branch_id IS NULL`. La fila global de
  `website_settings` se actualiza. Ninguna fila de outlet se modifica.
- **Verificación BD**: `SELECT branch_id, updated_at FROM website_settings
  WHERE organization_id = <org> ORDER BY branch_id;` → solo la fila con
  `branch_id IS NULL` tiene `updated_at` reciente.

### 11.2 Editor en modo Outlet X: cambios se guardan en fila del outlet

- **Precondición**: outlet seleccionado = "Outlet X"
  (`selectedBranchId = X`, branch con `is_web_published = true` y
  `branch_type` válido).
- **Acción**: editar theme y pulsar Guardar.
- **Resultado esperado**: `websiteSettingsService.updateTheme(orgId, data,
  X)` filtra por `branch_id = X`. La fila del outlet X se actualiza (o se
  crea vía upsert manual si no existía). La fila global no se modifica.
- **Verificación BD**: `SELECT branch_id, updated_at FROM website_settings
  WHERE organization_id = <org>;` → solo la fila con `branch_id = X` tiene
  `updated_at` reciente.

### 11.3 Cambiar de outlet con cambios pendientes → ConfirmDialog

- **Precondición**: outlet = "Outlet X", `hasChanges = true` (se editó una
  sección o settings sin guardar).
- **Acción**: cambiar el selector a "Outlet Y".
- **Resultado esperado**: `handleOutletChange` detecta `hasChanges` y setea
  `pendingOutletChange = Y`. Se abre el `ConfirmDialog` (§6.5) con mensaje
  "Tienes cambios sin guardar. Si cambias de outlet, se perderán. ¿Deseas
  continuar?".
- **Sub-caso A (confirmar)**: al confirmar, `doOutletChange(Y)` recarga
  páginas y settings del outlet Y. Los cambios pendientes se descartan.
- **Sub-caso B (cancelar)**: al cancelar, `pendingOutletChange = undefined`,
  el selector vuelve a "Outlet X", los cambios pendientes se conservan.

### 11.4 Editar página global desde outlet → warning

- **Precondición**: outlet seleccionado = "Outlet X"
  (`selectedBranchId = X`). La página actual es global
  (`currentPage.branch_id = null`), lo cual es posible porque `getPages`
  incluye páginas globales al listar un outlet concreto (§2.5).
- **Resultado esperado**: el `EditorHeader` muestra la advertencia visible
  (§6.3): "⚠ Estás editando una página global. Los cambios afectan a
  todos los outlets de la organización."
- **Acción**: editar una sección de la página global y guardar.
- **Resultado esperado**: los cambios se guardan en la página global
  (`branch_id = null`), afectando a todos los outlets. El warning debe
  seguir visible mientras `currentPage.branch_id === null && selectedBranchId
  !== null`.

### 11.5 Duplicar página de outlet → nueva página en mismo outlet

- **Precondición**: outlet = "Outlet X", página actual pertenece al outlet
  (`currentPage.branch_id = X`).
- **Acción**: duplicar la página (`duplicatePage(pageId)`).
- **Resultado esperado**: la nueva página se crea con `branch_id = X` (mismo
  outlet que la original), slug único dentro del ámbito `(org, X)` con
  sufijo `-copy` (o `-copy-2`, `-copy-3`, etc. si ya existe).
- **Verificación BD**: `SELECT branch_id, slug FROM website_pages WHERE id =
  <newPageId>;` → `branch_id = X`, `slug` termina en `-copy` o variante.
- **Edge case**: si se alcanzan 99 intentos sin slug libre, se lanza error
  claro (§4.2.1, `MAX_DUP_ATTEMPTS`).

### 11.6 Slug duplicado en mismo outlet → error

- **Precondición**: outlet = "Outlet X". Ya existe una página con slug
  `"home"` y `branch_id = X`.
- **Acción**: crear una nueva página con slug `"home"` en el mismo outlet X.
- **Resultado esperado**: `createPage` detecta el duplicado con el `select`
  previo (§4.2) y lanza: `Ya existe una página con el slug "home" en el
  ámbito del outlet X. Elige otro slug.` La página no se inserta.
- **Verificación**: no hay nueva fila en `website_pages` con ese slug y
  branch.

### 11.7 Slug duplicado en distinto outlet → ok

- **Precondición**: existe una página con slug `"home"` y `branch_id = X`
  (Outlet X).
- **Acción**: crear una nueva página con slug `"home"` en el Outlet Y
  (`branch_id = Y`, `Y ≠ X`).
- **Resultado esperado**: `createPage` no encuentra duplicado en el ámbito
  `(org, Y)` y la página se crea correctamente. El slug `"home"` coexiste en
  dos outlets distintos — la unicidad es por `(organization_id, branch_id)`,
  no global.
- **Verificación BD**: `SELECT branch_id, slug FROM website_pages WHERE
  organization_id = <org> AND slug = 'home';` → dos filas, una con
  `branch_id = X` y otra con `branch_id = Y`.

### 11.8 selectedBranchId inicial desde currentPage.branch_id

- **Precondición**: abrir el editor directamente sobre una página que
  pertenece al Outlet X (`page.branch_id = X`) vía URL
  `/organizacion/branding/editor/<pageId>`.
- **Resultado esperado**: `loadData` (§2.2) carga `currentPage` primero,
  resuelve `selectedBranchId = page.branch_id = X`, y luego carga `pages` y
  `settings` con ese `branchId`. El selector muestra "Outlet X" seleccionado
  al renderizar, no "Global".
- **Sub-caso página global**: si `page.branch_id = null`, el selector
  muestra "Global (organización)" al cargar.
- **Verificación UI**: el `OutletSelector` refleja el outlet correcto desde
  el primer render, sin parpadeo ni cambio asíncrono posterior.

### 11.9 Editor en modo legacy (branchId undefined)

- **Precondición**: una llamada interna o legacy invoca
  `getSettings(organizationId)` sin pasar `branchId` (es `undefined`).
- **Acción**: cargar el editor sin resolver el outlet (caso deprecado pero
  funcional).
- **Resultado esperado**: `getSettings` usa `.limit(1).maybeSingle()` sin
  filtro `branch_id` — comportamiento deprecado pero funcional. Devuelve la
  primera fila de `website_settings` de la org (puede ser global o de un
  outlet). No lanza `PGRST116`. **Recomendación**: deprecar este caso y
  siempre pasar `null` explícito para Global, o el `branchId` concreto del
  outlet.
