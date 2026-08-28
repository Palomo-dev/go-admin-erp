# FASES 0–2 — Fundaciones, hotfix responsive y reparación del catálogo

> Vuelve al [PLAN.md](./PLAN.md)

Estas tres fases son el núcleo. F1 es independiente y se puede hacer primero como hotfix. F2 depende de F0.

---

# FASE 1 — Responsive y full-bleed real (HOTFIX)

**Problema que resuelve:** P1. El hero no ocupa toda la pantalla y en tablet el sitio aparece corrido con scroll horizontal.

**Por qué pasa exactamente:**
`SectionWrapper` envuelve toda sección en `container mx-auto`. En Tailwind v3 sin configurar, `container` NO es fluido: es `max-width` fija por breakpoint (640 / 768 / 1024 / 1280 / 1536). A 887px de ancho el container mide 768px y `mx-auto` deja ~59px de margen a cada lado. `HeroFullscreen` intenta romperlo con `-mx-4 sm:-mx-6 lg:-mx-8` (16/24/32px), que nunca compensa esos 59px variables. Resultado: el hero queda desalineado respecto al header (que usa `max-w-7xl`) y en algunos anchos se desborda.

### 1.1 Unificar el sistema de anchos

**Archivo:** `goadmin-websites/tailwind.config.ts`

Agregar dentro de `theme.extend`:

```ts
container: {
  center: true,
  padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
  screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1400px' },
},
```

Esto por sí solo ya elimina el salto brusco entre breakpoints. Pero la solución correcta es la 1.2.

### 1.2 Reemplazar `container` por un ancho explícito y predecible

**Archivo:** `goadmin-websites/components/sections/SectionWrapper.tsx`

Reemplazar `<div className={`container mx-auto ${px}`}>` por un contenedor gobernado por el contrato de estilo:

```tsx
const CONTAINER_MAX: Record<string, string> = {
  sm: 'max-w-3xl', md: 'max-w-5xl', lg: 'max-w-7xl',
  xl: 'max-w-[1400px]', full: 'max-w-none',
}

const isFullBleed = content?.full_bleed === true || content?.container_width === 'full'
const innerClass = isFullBleed
  ? 'w-full'
  : `w-full mx-auto ${CONTAINER_MAX[content?.container_width || 'lg']} ${px}`
```

Reglas:
- `full_bleed = true` → el hijo ocupa el 100% del ancho de la ventana, **sin márgenes negativos**.
- `full_bleed = false` (default) → `max-w-7xl mx-auto`, **el mismo ancho que usa el header** (`SiteHeader` usa `max-w-7xl` en sus 5 variantes). Con esto el header y el contenido quedan alineados en todos los anchos, que es lo que hoy no pasa.

### 1.3 Eliminar el hack de márgenes negativos

**Archivo:** `goadmin-websites/components/sections/hero/HeroFullscreen.tsx`

Quitar `-mx-4 sm:-mx-6 lg:-mx-8 -mt-16 md:-mt-24` y depender de `full_bleed`. Para el solape con el header (el `-mt-*`), usar una variable CSS real en vez de un número mágico:
- En `OrganizationLayout`, exponer `--header-h` con la altura real del header.
- En el hero, `overlap_header: boolean` → `style={{ marginTop: 'calc(-1 * var(--header-h))', paddingTop: 'var(--header-h)' }}`.

**Compatibilidad:** los heros existentes no tienen `full_bleed` guardado. Poner el default de `full_bleed` en `true` **solo para `section_type='hero'`** conserva el aspecto actual; para el resto, default `false`.

### 1.4 Auditar el rango 768–1024px

1. Añadir `overflow-x: clip` al contenedor raíz de `OrganizationLayout` (`clip` en vez de `hidden` para no romper `position: sticky`).
2. Revisar los 22 `overflow-x-auto` del repo: los de carruseles son correctos; los que envuelven grids deben tener `min-w-0` en el hijo flex.
3. Revisar `hidden md:flex` en las 5 variantes de header: en 768–1024 se muestra el menú de escritorio en un espacio insuficiente. Subir el corte a `lg:` o activar el `mobile_breakpoint` que ya existe en `website_settings`.
4. Revisar `HeroSlider` con `full_width: false` (usa `max-w-7xl` dentro de un container ya limitado → doble limitación).

### 1.5 Cuarto viewport en el editor

**Archivo:** `go-admin-erp/src/components/organization/branding/editor/EditorHeader.tsx`

`DEVICE_WIDTHS` pasa de 3 a 4 entradas:
```ts
{ desktop: '100%', laptop: '1024px', tablet: '768px', mobile: '375px' }
```
El bug que reportaste vive justo en 834–900px, que hoy no se puede previsualizar.

### Criterios de aceptación F1
- [ ] En 768 / 834 / 900 / 1024 / 1280 px no hay scroll horizontal en home, productos y categorías.
- [ ] El borde izquierdo del header coincide con el del contenido en todos esos anchos.
- [ ] Un hero con `full_bleed` toca ambos bordes de la ventana en los 5 anchos.
- [ ] Los sitios existentes se ven idénticos antes/después (comparación de capturas en 5 organizaciones).

---

# FASE 0 — Fundaciones del schema y de los controles del editor

**Problema que resuelve:** habilita F2–F12. Sin esto, cada fase duplica trabajo.

## 0.1 Extender `ContentFieldDef`

**Archivo:** `go-admin-erp/src/lib/services/websitePageBuilderService.ts:70-81`

```ts
export type FieldGroup = 'content' | 'data' | 'layout' | 'style' | 'carousel' | 'behavior' | 'advanced';

export interface FieldCondition {
  field?: string;            // otro campo del mismo content
  equals?: any;
  in?: any[];
  variantIn?: string[];      // mostrar solo en ciertas variantes
}

export interface ContentFieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'richtext' | 'url' | 'image' | 'color' | 'number'
      | 'boolean' | 'select' | 'range' | 'icon' | 'repeater' | 'entity'
      | 'spacing' | 'alignment';
  placeholder?: string;
  helpText?: string;                    // explica para qué sirve (P: promo banners)
  group?: FieldGroup;                   // default 'content'
  showIf?: FieldCondition;              // condicional
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
  min?: number; max?: number; step?: number; suffix?: string;
  responsive?: boolean;                 // guarda { desktop, tablet, mobile }
  // type='repeater'
  itemFields?: ContentFieldDef[];
  itemLabelKey?: string;                // qué mostrar en la fila colapsada
  maxItems?: number;
  // type='entity'
  entity?: 'category' | 'product' | 'branch' | 'page' | 'table_zone';
  multiple?: boolean;
}
```

**Nota de diseño:** `responsive: true` guarda `{ desktop, tablet, mobile }` en vez de un escalar. El sitio lo resuelve con `resolveResponsive()` (0.5). Los valores escalares antiguos se siguen aceptando (retrocompatibilidad).

## 0.2 Grupos de campos reutilizables

**Archivo nuevo:** `go-admin-erp/src/lib/services/website/sectionFieldGroups.ts`

```ts
export const STYLE_FIELDS: ContentFieldDef[] = [
  { key: 'bg_type', label: 'Tipo de fondo', type: 'select', group: 'style',
    options: [{value:'none',label:'Sin fondo'},{value:'color',label:'Color'},
              {value:'gradient',label:'Degradado'},{value:'image',label:'Imagen'}] },
  { key: 'bg_color', label: 'Color de fondo', type: 'color', group: 'style',
    showIf: { field: 'bg_type', equals: 'color' } },
  { key: 'bg_gradient_from', label: 'Degradado desde', type: 'color', group: 'style',
    showIf: { field: 'bg_type', equals: 'gradient' } },
  { key: 'bg_gradient_to', label: 'Degradado hasta', type: 'color', group: 'style',
    showIf: { field: 'bg_type', equals: 'gradient' } },
  { key: 'bg_gradient_dir', label: 'Dirección', type: 'select', group: 'style',
    showIf: { field: 'bg_type', equals: 'gradient' }, options: [/* to-r, to-br, to-b… */] },
  { key: 'bg_image', label: 'Imagen de fondo', type: 'image', group: 'style',
    showIf: { field: 'bg_type', equals: 'image' } },
  { key: 'bg_overlay', label: 'Opacidad del overlay', type: 'range', group: 'style',
    min: 0, max: 100, step: 5, defaultValue: 0, suffix: '%',
    showIf: { field: 'bg_type', equals: 'image' } },
  { key: 'text_color', label: 'Color del texto', type: 'color', group: 'style' },
  { key: 'radius', label: 'Radio de borde', type: 'range', group: 'style',
    min: 0, max: 48, step: 2, defaultValue: 0, suffix: 'px' },
  { key: 'shadow', label: 'Sombra', type: 'select', group: 'style',
    options: [{value:'none',label:'Ninguna'},{value:'sm',label:'Suave'},
              {value:'md',label:'Media'},{value:'lg',label:'Fuerte'},{value:'xl',label:'Muy fuerte'}] },
  { key: 'border_width', label: 'Grosor del borde', type: 'range', group: 'style',
    min: 0, max: 8, step: 1, defaultValue: 0, suffix: 'px' },
  { key: 'border_color', label: 'Color del borde', type: 'color', group: 'style',
    showIf: { field: 'border_width', in: [1,2,3,4,5,6,7,8] } },
  { key: 'full_bleed', label: 'Ancho completo de pantalla', type: 'boolean', group: 'layout', defaultValue: false },
  { key: 'container_width', label: 'Ancho del contenido', type: 'select', group: 'layout',
    showIf: { field: 'full_bleed', equals: false },
    options: [{value:'sm',label:'Estrecho'},{value:'md',label:'Medio'},
              {value:'lg',label:'Ancho (por defecto)'},{value:'xl',label:'Extra ancho'}] },
];
// Los campos de padding/margen ya los cubre SectionSpacingEditor; se migran aquí en 0.4.

export const CAROUSEL_FIELDS: ContentFieldDef[] = [
  { key: 'autoplay', label: 'Reproducción automática', type: 'boolean', group: 'carousel', defaultValue: true },
  { key: 'interval_ms', label: 'Tiempo entre slides', type: 'range', group: 'carousel',
    min: 1000, max: 15000, step: 500, defaultValue: 5000, suffix: 'ms',
    showIf: { field: 'autoplay', equals: true } },
  { key: 'pause_on_hover', label: 'Pausar al pasar el mouse', type: 'boolean', group: 'carousel', defaultValue: true,
    showIf: { field: 'autoplay', equals: true } },
  { key: 'loop', label: 'Repetir en bucle', type: 'boolean', group: 'carousel', defaultValue: true },
  { key: 'transition', label: 'Transición', type: 'select', group: 'carousel',
    options: [{value:'slide',label:'Deslizar'},{value:'fade',label:'Fundido'},{value:'zoom',label:'Zoom'}] },
  { key: 'transition_ms', label: 'Velocidad de transición', type: 'range', group: 'carousel',
    min: 150, max: 1500, step: 50, defaultValue: 500, suffix: 'ms' },
  { key: 'show_arrows', label: 'Mostrar flechas', type: 'boolean', group: 'carousel', defaultValue: true },
  { key: 'arrow_style', label: 'Estilo de flecha', type: 'select', group: 'carousel',
    showIf: { field: 'show_arrows', equals: true },
    options: [{value:'circle',label:'Círculo'},{value:'square',label:'Cuadrado'},
              {value:'minimal',label:'Minimal'},{value:'chevron',label:'Solo chevrón'}] },
  { key: 'arrow_position', label: 'Posición de flechas', type: 'select', group: 'carousel',
    showIf: { field: 'show_arrows', equals: true },
    options: [{value:'inside',label:'Dentro'},{value:'outside',label:'Fuera'},
              {value:'top-right',label:'Arriba derecha'},{value:'bottom',label:'Abajo'}] },
  { key: 'arrow_size', label: 'Tamaño de flecha', type: 'range', group: 'carousel',
    min: 24, max: 72, step: 4, defaultValue: 40, suffix: 'px', showIf: { field: 'show_arrows', equals: true } },
  { key: 'arrow_color', label: 'Color de flecha', type: 'color', group: 'carousel',
    showIf: { field: 'show_arrows', equals: true } },
  { key: 'arrow_bg_color', label: 'Fondo de flecha', type: 'color', group: 'carousel',
    showIf: { field: 'show_arrows', equals: true } },
  { key: 'show_dots', label: 'Mostrar puntos', type: 'boolean', group: 'carousel', defaultValue: true },
  { key: 'dot_style', label: 'Estilo de puntos', type: 'select', group: 'carousel',
    showIf: { field: 'show_dots', equals: true },
    options: [{value:'dots',label:'Puntos'},{value:'bars',label:'Barras'},{value:'numbers',label:'Números'}] },
  { key: 'enable_swipe', label: 'Deslizar con el dedo', type: 'boolean', group: 'carousel', defaultValue: true },
  { key: 'slides_per_view', label: 'Elementos visibles', type: 'number', group: 'carousel', responsive: true },
];

export const GRID_FIELDS: ContentFieldDef[] = [
  { key: 'columns', label: 'Columnas', type: 'number', group: 'layout', responsive: true, min: 1, max: 8 },
  { key: 'rows', label: 'Filas máximas', type: 'number', group: 'layout', min: 1, max: 10 },
  { key: 'gap', label: 'Separación', type: 'range', group: 'layout', min: 0, max: 48, step: 4, defaultValue: 16, suffix: 'px' },
  { key: 'aspect_ratio', label: 'Proporción', type: 'select', group: 'layout',
    options: [{value:'auto',label:'Automática'},{value:'1/1',label:'Cuadrada'},{value:'4/3',label:'4:3'},
              {value:'3/4',label:'3:4 (vertical)'},{value:'16/9',label:'16:9'}] },
];

export const CARD_FIELDS: ContentFieldDef[] = [ /* card_radius, card_shadow, card_border_width,
  card_border_color, card_bg, card_padding, card_hover (zoom|lift|glow|none), card_layout
  (vertical|horizontal|overlay), image_fit, text_align */ ];

export const BUTTON_ITEM_FIELDS: ContentFieldDef[] = [
  { key: 'label', label: 'Texto', type: 'text' },
  { key: 'url', label: 'Enlace', type: 'url' },
  { key: 'variant', label: 'Estilo', type: 'select',
    options: [{value:'solid',label:'Sólido'},{value:'outline',label:'Contorno'},
              {value:'ghost',label:'Transparente'},{value:'link',label:'Enlace'}] },
  { key: 'size', label: 'Tamaño', type: 'select', options: [/* sm md lg xl */] },
  { key: 'icon', label: 'Icono', type: 'icon' },
  { key: 'icon_position', label: 'Posición del icono', type: 'select', options: [/* left right */] },
  { key: 'bg_color', label: 'Color', type: 'color' },
  { key: 'text_color', label: 'Color del texto', type: 'color' },
  { key: 'radius', label: 'Radio', type: 'range', min: 0, max: 48, step: 2 },
  { key: 'full_width_mobile', label: 'Ancho completo en móvil', type: 'boolean', defaultValue: true },
  { key: 'open_new_tab', label: 'Abrir en pestaña nueva', type: 'boolean', defaultValue: false },
];
```

**Decisión clave:** los grupos se **inyectan automáticamente** al construir el catálogo, no se copian a mano en cada sección:

```ts
export const SECTION_CATALOG: SectionTypeDefinition[] = RAW_CATALOG.map(s => ({
  ...s,
  contentFields: [...s.contentFields, ...STYLE_FIELDS, ...SPACING_FIELDS],
}));
```

Así, agregar un campo de estilo en el futuro beneficia a los 37 tipos de una vez.

## 0.3 Controles nuevos en el editor

**Carpeta nueva:** `go-admin-erp/src/components/organization/branding/editor/fields/`

Primero, **extraer** los controles existentes de `EditorSidebar.tsx` (1565 líneas) a esta carpeta:
`TextField`, `TextareaField`, `UrlField`, `ImageField` (mover `ImageFieldPicker`), `BooleanField`, `NumberField`, `SelectField`, `RangeField`.

⚠️ **Bug a corregir de paso:** `ContentFieldDef` declara `type: 'color'` pero `EditorSidebar.tsx:416-541` **no lo renderiza** — un campo de color hoy no pinta nada. Hay que añadir el caso.

Luego, los controles nuevos:

| Control | Archivo | Descripción |
|---|---|---|
| `ColorField` | `fields/ColorField.tsx` | Swatch + hex + **paleta del tema** (primary/secondary/accent de `website_settings`) + "heredar del tema" + transparente. Hoy `GlobalSettingsPanel` usa `<input type="color">` pelado. |
| `IconField` | `fields/IconField.tsx` | Buscador sobre iconos Lucide con preview en grid, categorías y "sin icono". Reutilizable en `categories.icon` y en `website_menu_items.icon`. |
| `RepeaterField` | `fields/RepeaterField.tsx` | Lista de items con agregar / duplicar / eliminar / reordenar (drag). Cada item se expande y renderiza `itemFields` recursivamente. **Reemplaza los 7 editores ad-hoc.** |
| `EntityField` | `fields/EntityField.tsx` | Selector con búsqueda contra Supabase según `entity`. Para `category`: árbol con padres/hijos, "seleccionar todas las hijas de X". Para `product`: búsqueda por nombre/SKU con miniatura. |
| `ResponsiveField` | `fields/ResponsiveField.tsx` | Envoltorio con 3 tabs (escritorio/tablet/móvil) alrededor de cualquier control, sincronizado con el viewport activo del preview. |
| `SpacingField` | `fields/SpacingField.tsx` | Generalización de `SectionSpacingEditor` (padding/margen arriba, abajo, laterales) con opción de enlazar valores. |
| `AlignmentField` | `fields/AlignmentField.tsx` | Grid 3×3 de posición (para texto sobre banners y heros). |

**Renderizador de campos:** `fields/FieldRenderer.tsx` — un solo `switch` sobre `field.type` que sustituye el bloque de 125 líneas de `EditorSidebar.tsx:416-541`. `SectionListItem` pasa a ~200 líneas.

## 0.4 Agrupación y condicionales en el sidebar

**Archivo:** `go-admin-erp/src/components/organization/branding/editor/EditorSidebar.tsx`

1. Agrupar `definition.contentFields` por `field.group` y renderizar un `<Accordion>` por grupo, en este orden: **Contenido → Datos → Diseño (layout) → Estilo → Carrusel → Comportamiento → Avanzado**. Solo "Contenido" abierto por defecto.
2. Evaluar `showIf` antes de renderizar:
```ts
function isFieldVisible(field: ContentFieldDef, content: Record<string, any>, variant: string): boolean {
  const c = field.showIf; if (!c) return true;
  if (c.variantIn && !c.variantIn.includes(variant)) return false;
  if (c.field) {
    const v = content?.[c.field];
    if (c.equals !== undefined && v !== c.equals) return false;
    if (c.in && !c.in.includes(v)) return false;
  }
  return true;
}
```
3. Mostrar `helpText` como texto pequeño bajo el label.
4. **Eliminar** los bloques ad-hoc de `EditorSidebar.tsx:543-675` (hero booking switch, gallery, testimonials, faq, hero slides, category selector, categories options, brands, spacing) una vez que sus campos estén declarados como `repeater` / `entity` / `spacing` en el catálogo. Es refactor puro: mismo dato guardado, mismo JSON.

## 0.5 Lado del sitio: helpers de estilo

**Archivo nuevo:** `goadmin-websites/lib/sectionStyle.ts`

```ts
export function resolveResponsive<T>(value: T | {desktop?:T;tablet?:T;mobile?:T} | undefined, fallback: T): T
export function buildSectionStyle(content, settings): { className: string; style: React.CSSProperties }
export function buildCardStyle(content): { className: string; style: React.CSSProperties }
export function buildButtonStyle(button): { className: string; style: React.CSSProperties }
```

`buildSectionStyle` traduce el contrato a clases Tailwind + CSS vars, y es la **única** función que `SectionWrapper` usa. Regla: nada de concatenar clases dinámicas tipo `` `rounded-[${n}px]` `` (Tailwind no las genera en build) — usar **CSS variables inline**: `style={{ '--sec-radius': `${n}px` }}` + clase estática `rounded-[var(--sec-radius)]`.

## 0.6 Contrato verificado editor ↔ sitio

**Sitio — archivo nuevo:** `goadmin-websites/app/api/_sections/manifest/route.ts`

Devuelve, derivado del código:
```json
{ "version": "1", "sections": [
  { "type": "gallery", "variants": ["masonry","grid","carousel","fullscreen"],
    "contentKeys": ["title","subtitle","images"] }
]}
```
`contentKeys` se declara en cada componente vía un export estático `export const CONTENT_KEYS = [...]` (simple y sin magia de AST).

**ERP — archivo nuevo:** `src/lib/services/website/sectionContract.ts` + test en CI que falla si:
- Un `type:variant` del catálogo no existe en el manifiesto (el usuario podría crear una sección que no renderiza).
- Un `type:variant` del manifiesto no existe en el catálogo (**los 15 huérfanos de P2**).
- Una clave de `contentFields` no está en `contentKeys` del componente (**el bug `items` vs `images` de P4**).

En el editor, mostrar un aviso discreto por sección desincronizada en vez de fallar en silencio.

### Criterios de aceptación F0
- [ ] Una sección de prueba usa los 7 controles nuevos, guarda y se refleja en el sitio.
- [ ] `EditorSidebar.tsx` baja de 1565 a menos de 500 líneas; los controles viven en `fields/`.
- [ ] Los campos `type: 'color'` renderizan (hoy no).
- [ ] Los 7 editores ad-hoc quedan reemplazados por `repeater`/`entity` **sin cambiar el JSON guardado**.
- [ ] El test de contrato corre en CI y reporta los 15 tipos huérfanos y el desajuste de la galería.

---

# FASE 2 — Contrato de estilo universal y reparación de las 37 secciones

**Problemas que resuelve:** P2, P3, P4, P5, P6. Es la fase con mejor relación esfuerzo/impacto del plan.

## 2.1 Aplicar el contrato de estilo en el sitio (una sola vez)

**Archivo:** `goadmin-websites/components/sections/SectionWrapper.tsx`

Ampliar para consumir todo `STYLE_FIELDS` vía `buildSectionStyle()`: fondo (color/degradado/imagen+overlay), color de texto, radio, sombra, borde, `full_bleed`, `container_width`, además del padding/margen que ya soporta.

Compatibilidad: mantener la lectura de `settings.bg_color` y `settings.text_color` (formato viejo) con precedencia menor que `content.bg_color`.

**Ganancia inmediata:** las 37 secciones pasan a tener fondo, borde, radio y sombra configurables sin tocar ninguna de ellas.

## 2.2 Reparar los bugs de contrato de claves (P4)

| Bug | Corrección |
|---|---|
| Galería: editor guarda `content.items`, sitio lee `content.images` | Elegir **`images`** como clave canónica (la usan los 4 componentes). En el editor, declarar el repeater con `key: 'images'`. **Migración NO destructiva** (regla E.0.4 del plan): copiar sin borrar el original, y solo si `images` no existe todavía.<br>`UPDATE website_page_sections SET content = content \|\| jsonb_build_object('images', content->'items') WHERE section_type='gallery' AND content ? 'items' AND NOT (content ? 'images');`<br>`content.items` queda ahí como respaldo. Además, el componente lee `content.images ?? content.items` para que funcione incluso sin ejecutar la migración. |
| `GalleryMasonry` lee además `website_settings.gallery_images` | Mantener como **fallback** si `content.images` está vacío, para no romper sitios que hoy dependen de la galería global. |
| Testimonios: editor guarda `company`, `TestimonialsGrid` lee `role` | Unificar en `role` y aceptar `company` como alias de lectura en el sitio. |

## 2.3 Declarar los 15 tipos huérfanos (P2)

Agregar al catálogo, con sus variantes reales del `SECTION_MAP` y sus campos leídos por cada componente:

| Tipo | Variantes | Campos mínimos a declarar |
|---|---|---|
| `reservation_cta` | `with_form`, `simple` | ver [FASE-8](./FASE-8-RESERVAS-MESA.md) |
| `specialties` | `featured` | `title`, `subtitle`, `max_items`, entity de productos, `GRID_FIELDS` |
| `chef_section` | `profile` | `title`, `name`, `role`, `bio`, `image_url`, `quote` |
| `delivery_cta` | `banner` | `title`, `subtitle`, `cta_text`, `cta_url`, `image_url` |
| `partners` | `logos` | repeater de logos (igual que `brands`) |
| `why_choose_us` | `icons` | repeater de items con `icon` (usar `IconField`) |
| `features_grid` | `alternating` | repeater `{title, description, image_url}` |
| `how_it_works` | `steps` | repeater `{step, title, description, icon}` |
| `services_list` | `cards`, `grid` | repeater + `GRID_FIELDS` |
| `pricing_table` | `three_columns` | repeater de planes con features |
| `demo_cta` | `form` | `title`, `subtitle`, `cta_text`, campos del formulario |
| `parking_zones` | `grid` | entity de zonas + `GRID_FIELDS` |
| `parking_pricing` | `cards` | repeater de tarifas |
| `parking_features` | `icons` | repeater con `icon` |
| `parking_availability` | `summary` | `title`, entity de sucursal, `refresh_seconds` |
| `parking_pass_plans` | `cards` | entity de planes |

## 2.4 Declarar las variantes faltantes (P3)

`hero:video`, `categories_grid:{default,horizontal,icons}`, `contact_form:split`, `gallery:masonry`, `faq:two_columns`, `testimonials:{grid,quotes,minimal}`, `cta:{split,with_image}`, `newsletter:{banner,with_image}`, `room_types:detailed`, `map:{embedded,full_width}`, `text_block:{left,two_columns}`, `stats:counters`, `team:grid`, `amenities:{icons,grid}`.

Cada variante nueva debe pasar el test de contrato de 0.6.

## 2.5 Completar el contenido faltante, sección por sección

Checklist derivado de la matriz A.3. Mínimo por sección:

| Sección | Qué agregar |
|---|---|
| `gallery` | `images` (repeater: `url`, `alt`, `caption`, `link`), `GRID_FIELDS`, `lightbox`, `CAROUSEL_FIELDS` (variante carousel) |
| `newsletter` | `image_url` (**arregla `with_image`**), `button_text`, `placeholder`, `disclaimer` (los 3 últimos **ya los lee** `NewsletterSimple.tsx:31,35` y nadie los expone), `layout`, colores del formulario, destino de la suscripción |
| `brands` | mantener repeater; añadir `CAROUSEL_FIELDS` para la variante carrusel y velocidad |
| `testimonials` | ver [FASE 6](./FASE-3-7-SECCIONES.md) |
| `promo_banners` | ver [FASE 7](./FASE-3-7-SECCIONES.md) |
| `faq`, `team`, `stats`, `amenities`, `menu_preview` | repeater de items + `GRID_FIELDS` |
| `products_grid`, `featured_products`, `offers` | `EntityField` de categorías/productos, `max_items`, `GRID_FIELDS` responsive, orden (`default|price_asc|price_desc|name|sales`), `show_filters`, `show_search`, `filter` (`on_sale`, `featured`, `new`) — **varios ya los soporta el componente** (`ProductsGrid.tsx` lee `show_filters`, `show_search`, `selected_category_ids`) y el editor no los expone |
| `room_types`, `membership_plans` | entity + `GRID_FIELDS` + `CARD_FIELDS` |
| `map` | `address`, `lat`, `lng`, `zoom`, `height`, `style`, `show_marker` |
| `contact_form` | campos del formulario (repeater), destino del email, `show_map/phone/email/address` (**ya los lee el componente**) |
| `text_block` | `richtext`, columnas, alineación |
| `cta` | `BUTTON_ITEM_FIELDS` como repeater |

## 2.6 Actualizar la matriz de cobertura

Al terminar, la tabla A.3 de `PLAN.md` se actualiza y se convierte en la tabla de cobertura viva: cada sección debe tener ≥1 campo de contenido propio + los grupos de estilo/layout inyectados.

### Criterios de aceptación F2
- [ ] Las 37 secciones permiten cambiar fondo (color/degradado/imagen), color de texto, radio, sombra, borde, padding y margen.
- [ ] Ninguna sección queda con un solo campo.
- [ ] La galería carga imágenes desde el editor y **se ven en el sitio** (bug P4 cerrado + migración de datos ejecutada).
- [ ] `newsletter:with_image` muestra la imagen; `newsletter` permite editar botón, placeholder y disclaimer.
- [ ] Los 15 tipos huérfanos aparecen en "Agregar sección" y son editables.
- [ ] El test de contrato pasa en verde en ambos sentidos.
- [ ] Capturas antes/después de 5 organizaciones sin diferencias visuales.

---

## Ronda 2 — Cierre de pendientes F0 (2026-08-28)

### Richtext (F0.3 pendiente)
- **Antes:** `richtext` usaba `TextareaField` (textarea plano sin formato).
- **Ahora:** `RichTextField.tsx` — textarea con toolbar de 3 botones (Bold → `<strong>`, Italic → `<em>`, Link → `<a href>`). Inserta tags HTML alrededor de la selección. El sitio renderiza el HTML vía `dangerouslySetInnerHTML` en `TextBlockCentered/Left/TwoColumns`.
- **Limitación documentada:** no es WYSIWYG (no muestra el formato aplicado en tiempo real). No soporta listas, encabezados ni imágenes inline. Suficiente para negritas, cursivas y enlaces — que cubre el 90% del uso en `text_block`. Una futura mejora puede integrar Tiptap o Lexical si se requiere formato avanzado.

### EntityField stubs (F0.3 pendiente)
- **Antes:** `branch` y `table_zone` mostraban "Entidad no soportada".
- **Ahora:**
  - `branch`: consulta `branches` (id, name) filtrado por `organization_id`. Single/multiple.
  - `table_zone`: consulta `restaurant_zone_layouts` (id, zone_name) con deduplicación por `zone_name`. Single/multiple.
- **Uso en catálogo:** `branch_id` (parking_availability), `zone_ids` (restaurant_zone_layouts).

### Validación de `showIf` (F0.4 pendiente)
- `isFieldVisible()` en `EditorSidebar.tsx:99` evalúa `showIf.field`, `showIf.equals`, `showIf.in` y `showIf.variantIn` antes de renderizar cada campo. Verificado: los campos condicionales (bg_color solo cuando bg_type=color, link_category_id solo cuando link_type=category, etc.) se ocultan/muestran correctamente.

### Integración `sectionStyle.ts` → `SectionWrapper.tsx` (F0.5 pendiente)
- **Confirmado:** `SectionWrapper.tsx:96-100` ya consume `buildSectionStyle(content, settings, sectionType)`. Filtra clases de layout (`w-full`, `mx-auto`, `max-w-*`) que maneja el div interno. Preserva compatibilidad con `settings.bg_color`/`settings.text_color` (formato viejo) como fallback cuando el contrato no aplica bg/text.
