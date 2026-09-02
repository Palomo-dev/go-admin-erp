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
> `setPublishedBranches` **sin** filtrar `branch_type`, y luego §2.7 volvía a
> filtrar en un bloque separado con otra variable `validPublished`. Eso
> duplicaba lógica y dejaba `publishedBranches` con branches inválidas hasta
> que §2.7 las purgaba. Ahora `loadData` filtra `branch_type` **al cargar** y
> guarda directamente con `setPublishedBranches`, de modo que
> `publishedBranches` solo contiene branches válidas en todo el ciclo de vida
> del estado. La parte A de §2.7 se elimina (su lógica se integró aquí).

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

---

## 3. Filtrado de secciones por `branch_type`

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

### 3.1 Mapa `branch_type → secciones permitidas`

El `SECTION_MAP` de `goadmin-websites` ya tiene secciones separadas por tipo de
negocio. Creamos un mapa en el ERP que espeja esa segmentación:

```typescript
// src/lib/services/website/sectionsByBranchType.ts

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
export function getAllowedSectionTypes(branchType: string | null | undefined): string[] | null {
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

### 4.5 Interfaz `WebsitePage` — añadir `branch_id`

```typescript
export interface WebsitePage {
  id: string;
  organization_id: number;
  // ... campos existentes ...
  branch_id?: number | null; // ← NUEVO (Fase 0)
}
```

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

> **No es la implementación por defecto**. Se documenta solo como referencia.
> El índice único `idx_website_settings_org_branch` (Fase 0 §2.2) usa
> `COALESCE(branch_id, -1)`, y el cliente JS de Supabase **no soporta**
> `onConflict` sobre una expresión `COALESCE`. Si en el futuro se reemplaza
> el índice por columnas simples (`organization_id, branch_id` con
> `NULLS NOT DISTINCT` en PG 15+), esta versión pasa a ser válida:

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

export interface OutletOption {
  value: number | null; // null = Global
  label: string;
  branchType: string | null;
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

---

## 7. Definition of Done

- [ ] Selector de outlet (`OutletSelector`) en el editor de branding
- [ ] Opciones del selector: "Global" + branches con `is_web_published=true` **y `branch_type` válido**
- [ ] Páginas se filtran por `branch_id` del outlet seleccionado (outlet + globales)
- [ ] "Global" lista **solo** páginas globales (`branch_id IS NULL`), no todas
- [ ] Secciones se filtran por `branch_type` del outlet en `AddSectionDialog`
- [ ] `SECTIONS_BY_BRANCH_TYPE` cubre hotel, restaurant, retail, gym, transport, parking, services
- [ ] "Global" muestra todas las secciones (backward compat)
- [ ] Settings se cargan por `branch_id` (`getSettings(orgId, branchId)`)
- [ ] Settings se guardan por `branch_id` (`updateSettings` con upsert **manual**, no `onConflict`)
- [ ] Crear página asigna `branch_id` del outlet seleccionado
- [ ] Crear/duplicar página valida slug único por `(organization_id, branch_id)` antes de insertar
- [ ] `duplicatePage` tiene tope máximo de iteraciones (99) para evitar loop infinito
- [ ] `publishedBranches` solo contiene branches con `branch_type` válido (filtrado al cargar en `loadData`)
- [ ] `getSettings` con `branchId === undefined` usa `.limit(1).maybeSingle()` (caso legacy deprecado)
- [ ] `addSection` propaga `branch_id` de la página a la sección
- [ ] Validación de `branch_type` obligatorio al publicar un outlet (`is_web_published=true`)
- [ ] Advertencia visible al editar página global desde un outlet
- [ ] Indicador visual del outlet activo en el `EditorHeader`
- [ ] `npm run lint` + `tsc --noEmit` limpios en el ERP
- [ ] Cero archivos `.sql` en el repo

---

## 8. Riesgos

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
  específicas. **Mitigación**: la validación de §2.7 bloquea la publicación de
  outlets sin `branch_type`, y la Fase 6 (BranchForm) debe marcarlo obligatorio
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
