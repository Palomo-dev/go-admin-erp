# Plan: Sistema de Menús Nombrados + Footer Configurable + Header con Menús Seleccionables

**Fecha:** 2026-08-19
**Módulos implicados:** `app-organ` (branding) + repositorio `goadmin-websites`
**Repositorios:**
- ERP (editor): `C:\Users\USUARIO\CascadeProjects\go-admin-erp`
- Sitio público (consumidor): `C:\Users\USUARIO\goadmin-websites`
- Supabase project ID: `jgmgphmzusbluqhuqihj`

---

## Objetivo

Reemplazar el sistema actual de páginas sueltas con `show_in_header`/`show_in_footer` por un **sistema de menús nombrados** que actúan como contenedores de páginas, categorías, políticas y enlaces personalizados. Cada menú se asigna a una posición específica del header o footer, permitiendo organizar mejor el contenido y soportar mega-menús robustos para e-commerce.

Adicionalmente, hacer el footer configurable con múltiples layouts, navegación jerárquica, comportamiento responsive y preview visual en el editor.

---

## Análisis del Header Actual (SiteHeader.tsx)

### Arquitectura existente

**`SiteHeader.tsx`** (436 líneas) es el entry point. Recibe:
- `headerNav` — lista plana de páginas con `show_in_header=true`
- `headerNavTree` — árbol jerárquico de las mismas páginas
- `menuCategories` — árbol de categorías del inventario (solo si `show_categories_in_header=true`)

**5 variantes desktop** (carpeta `header/`):
- `HeaderClassic` — logo izq, nav centro, acciones der
- `HeaderCentered` — logo centro arriba, nav abajo
- `HeaderSplit` — logo izq, menú dividido, CTA der
- `HeaderMinimal` — logo + hamburguesa
- `HeaderMega` — logo + búsqueda arriba, nav abajo + mega dropdown

**4 variantes móviles** (carpeta `header/mobile/`):
- `MobileDrawer`, `MobileBottomSheet`, `MobileFullscreen`, `MobileTabs`

**`HeaderMega` ya tiene "dos fuentes" pero hardcodeadas:**
1. `navTree` (páginas) → renderiza items en la barra de nav inferior
2. `menuCategories` (categorías) → agrega un item "Categorías" que abre `MegaMenuDropdown`

**`MegaMenuDropdown`** renderiza categorías en grid multi-columna con:
- Imagen/icono + nombre por columna (categoría padre)
- Sub-categorías listadas verticalmente (hijas)
- "Ver todo" al final
- "Ver todas las categorías" en el footer del panel

### Problema actual

El mega-menú **mezcla dos fuentes hardcoded**:
- Páginas del sitio (navTree) para la barra de navegación
- Categorías del inventario (menuCategories) para el dropdown

**No se puede elegir** qué menú va en la barra de nav ni qué menú va en el mega dropdown. Tampoco se puede tener un mega-menú con items personalizados (no solo categorías).

### Recomendación

**No reescribir `SiteHeader.tsx` ni las variantes existentes.** El sistema de variantes ya funciona bien. Lo que falta es:

1. **Que el header reciba menús nombrados** en vez de `headerNav`/`headerNavTree` hardcoded
2. **Que `HeaderMega` pueda recibir dos menús**: uno para la barra de nav + uno para el mega dropdown
3. **Que el usuario elija** qué menú va en cada posición desde el editor

### Implementación

**`website_settings`** recibe 2 campos nuevos:
- `header_menu_id` UUID nullable → qué menú va en la barra de navegación del header
- `header_mega_menu_id` UUID nullable → qué menú va en el mega dropdown (solo para `header_style='mega'`)

**Flujo:**
1. El usuario crea menús nombrados desde el editor (ej: "Menú Principal", "Categorías Mega")
2. En "Configuración del Menú" (panel existente del header), selecciona qué menú va en `header_menu_id`
3. Si el layout es `mega`, selecciona también qué menú va en `header_mega_menu_id`
4. El sitio público lee `header_menu_id` y `header_mega_menu_id`, carga los menús con sus items jerárquicos
5. `SiteHeader` pasa los items del menú principal como `navTree` y los items del mega menú como `megaMenuItems`
6. `HeaderMega` renderiza `megaMenuItems` en el `MegaMenuDropdown` (en vez de `menuCategories` hardcoded)

**Backward compat:**
- Si `header_menu_id` es null, fallback a `headerNavTree` (comportamiento actual)
- Si `header_mega_menu_id` es null, fallback a `menuCategories` (comportamiento actual)
- Las 5 variantes de header y 4 móviles **no se modifican** — solo cambia la fuente de datos

---

## Concepto de Menús Nombrados

### Problema actual
- Las páginas tienen flags `show_in_header` y `show_in_footer` individuales
- No se pueden agrupar páginas en "menús" con nombre
- No se pueden mezclar páginas, categorías, políticas y enlaces personalizados en un mismo grupo
- No se puede tener un "Menú Principal" en el header y un "Menú de Políticas" en el footer de forma estructurada
- El mega-menú del header solo puede mostrar categorías del inventario, no items personalizados

### Solución: Menús como contenedores

**Un "Menú" es un contenedor nombrado** que agrupa items. Ejemplos:
- **"Menú Principal"** → Inicio, Productos, Categorías, Ofertas, Nosotros, Contacto → asignado a `header_menu_id`
- **"Categorías Mega"** → Cocina (con hijas: Ollas, Sartenes, Cubiertos), Baño (con hijas: Toallas, Jabones), Salón, Jardín → asignado a `header_mega_menu_id`
- **"Menú Footer 1"** → Productos, Categorías, Ofertas → asignado al footer columna 1
- **"Menú Footer 2"** → Nosotros, Contacto, Blog → asignado al footer columna 2
- **"Políticas"** → Términos, Privacidad, Cookies, Envíos, Devoluciones → asignado al footer columna 3

Cada item de un menú puede ser:
- Una **página** existente (`website_pages`)
- Una **categoría** del inventario (`categories`)
- Una **política** (página de tipo `policy` con slug `/terminos`, `/privacidad`, etc.)
- Un **enlace personalizado** (label + url arbitraria)

### Modelo de datos

**Nueva tabla `website_menus`** (contenedores nombrados):
- `id` UUID PK
- `organization_id` INT NOT NULL FK
- `name` TEXT NOT NULL — nombre del menú (ej: "Menú Principal", "Categorías Mega")
- `slug` TEXT NOT NULL — identificador único por org
- `location` TEXT NOT NULL DEFAULT 'none' — `header` | `footer` | `both` | `none`
- `footer_column` INT nullable — columna del footer donde se ubica (1-6)
- `footer_order` INT NOT NULL DEFAULT 0 — orden dentro del footer
- `header_order` INT NOT NULL DEFAULT 0 — orden dentro del header
- `is_active` BOOLEAN NOT NULL DEFAULT true
- `created_at`, `updated_at` TIMESTAMPTZ

**Nueva tabla `website_menu_items`** (items de cada menú):
- `id` UUID PK
- `menu_id` UUID NOT NULL FK → `website_menus(id)` ON DELETE CASCADE
- `organization_id` INT NOT NULL FK (denormalizado para RLS)
- `item_type` TEXT NOT NULL — `page` | `category` | `policy` | `custom_link`
- `page_id` UUID nullable FK → `website_pages(id)` ON DELETE SET NULL
- `category_id` INT nullable FK → `categories(id)` ON DELETE SET NULL
- `custom_label` TEXT nullable — label para enlaces personalizados
- `custom_url` TEXT nullable — URL para enlaces personalizados
- `parent_item_id` UUID nullable FK → `website_menu_items(id)` ON DELETE SET NULL (jerarquía)
- `icon` TEXT nullable — icono Lucide
- `badge` TEXT nullable — texto de badge (ej: "Nuevo", "Oferta")
- `display_order` INT NOT NULL DEFAULT 0
- `is_active` BOOLEAN NOT NULL DEFAULT true
- `created_at`, `updated_at` TIMESTAMPTZ

**`website_settings`** recibe 2 campos nuevos para el header:
- `header_menu_id` UUID nullable FK → `website_menus(id)` ON DELETE SET NULL
- `header_mega_menu_id` UUID nullable FK → `website_menus(id)` ON DELETE SET NULL

**Migración de datos existentes:**
- Crear un menú "Menú Principal" por defecto para cada organización
- Migrar páginas con `show_in_header=true` a items del menú principal
- Setear `header_menu_id` al menú principal creado
- Si `show_categories_in_header=true`, crear un menú "Categorías" con las categorías raíz como items
- Setear `header_mega_menu_id` al menú de categorías (si existe)
- Crear un menú "Footer" por defecto para cada organización
- Migrar páginas con `show_in_footer=true` a items del menú footer
- Mantener `show_in_header`/`show_in_footer` en `website_pages` para backward compat

---

## Estado Actual (Resumen del Análisis)

### Base de Datos (Supabase - `jgmgphmzusbluqhuqihj`)

**`website_settings`** (columnas de footer existentes):
- `footer_style` TEXT default `'default'` — **4 valores soportados en sitio público**: `default`, `three_columns`, `centered`, `minimal`
- `footer_text` TEXT nullable — texto del copyright
- `footer_links` JSONB default `'[]'` — enlaces manuales (label + url + order)
- `show_powered_by` BOOLEAN default true — atribución "Powered by GO Admin"
- `social_links` JSONB — redes sociales (compartido con header)
- `business_hours` JSONB — horarios (compartido con header)

**`website_pages`** (columnas de footer existentes):
- `show_in_footer` BOOLEAN default false
- `footer_order` INTEGER default 0
- `parent_page_id` UUID nullable — **ya soporta jerarquía** (migración header Fase 0)
- `linked_category_id` INT nullable — **ya soporta vincular categorías** (migración header Fase 0)
- `menu_icon` TEXT nullable — icono Lucide
- `menu_badge` TEXT nullable — badge de texto

**Observación:** La BD **ya tiene todo lo necesario** para jerarquía y categorías en el footer. No se necesita migración de BD. Las columnas `parent_page_id`, `linked_category_id`, `menu_icon`, `menu_badge` se agregaron en la Fase 0 del header y son reutilizables para el footer.

### ERP (go-admin-erp) — Editor

- **`src/components/organization/branding/BrandingContentTab.tsx`**: pestaña "Footer" con:
  - Toggle "Powered by GO Admin"
  - Textarea "Texto del Footer"
  - Lista de enlaces manuales (footer_links: label + url)
  - **NO tiene selector de layout** (footer_style)
  - **NO tiene editor jerárquico** de páginas del footer
  - **NO tiene vinculación de categorías** al footer
  - **NO tiene preview visual** del footer

- **`src/components/organization/branding/BrandingThemeTab.tsx`**: línea 82, `footer_style` se carga en el estado del tema pero **NO hay UI para cambiarlo** (solo se setea vía presets de plantilla).

- **`src/lib/services/websiteSettingsService.ts`**:
  - `WebsiteSettings` interface incluye `footer_style`, `footer_text`, `footer_links`, `show_powered_by`
  - `updateHeaderConfig()` existe pero **NO existe `updateFooterConfig()`**
  - `updateTheme()` incluye `footer_style` pero mezclado con colores/fuentes

- **`src/lib/services/websiteMenuService.ts`**:
  - `getFooterMenuTree(organizationId)` — **ya existe**, retorna árbol jerárquico del footer
  - `addCategoryToMenu()` soporta `options.show_in_footer` — **ya existe**
  - `nestPage()` — **ya existe**, funciona para header y footer
  - `reorderMenu()` — funciona con `header_order`, **NO hay `reorderFooterMenu()`**

- **`src/lib/services/websitePageBuilderService.ts`**:
  - `getFooterMenuTree(organizationId)` — **ya existe**
  - `updatePageMenu()` — actualiza `footer_order`, `show_in_footer` — **ya existe**
  - `reorderMenuItems()` — batch update de `header_order` — **NO hay `reorderFooterMenuItems()`**

- **`src/components/organization/branding/editor/`**: NO existe `FooterLayoutSelector`, `FooterOptionsPanel`, `FooterTreeEditor`, `FooterPreviewMockup`, `MobileFooterPanel`.

### Sitio Público (goadmin-websites) — Consumidor

- **`components/site/SiteFooter.tsx`** (~700 líneas): 4 layouts implementados:
  - `default` — 4 columnas (logo+descripción, contacto, horarios, enlaces)
  - `three_columns` — 3 columnas (logo+redes, enlaces, contacto)
  - `centered` — centrado (logo, nav inline, redes, bottom bar)
  - `minimal` — una fila (logo, nav inline, redes, bottom bar)
  - **Problema actual:** `FooterSection` usa `<details>`/`<summary>` para accordion en móvil, pero renderiza el contenido **dos veces** (una en `<details>`, otra en `hidden md:block`). El accordion siempre está cerrado por defecto.

- **`lib/get-org-context.ts`**: ya carga `footerNav` (plano) + `footerNavTree` (jerárquico) + `menuCategories`.

- **`lib/supabase/queries.ts`**: `getWebsiteFooterNav()` + `getWebsiteFooterNavTree()` — **ya existen**.

- **`types/database.ts`**: `WebsiteSettings` incluye `footer_style`. `WebsitePageWithChildren` ya soporta jerarquía.

### Brechas Críticas

| Brecha | Estado |
|--------|--------|
| Selector de layout de footer (5 opciones) | NO existe en ERP |
| Editor jerárquico de páginas del footer | NO existe en ERP |
| Vincular categorías al footer | Servicio existe, UI no |
| Preview visual del footer en editor | NO existe |
| Configuración responsive del footer | NO existe |
| `updateFooterConfig()` en servicio | NO existe |
| `reorderFooterMenuItems()` | NO existe |
| Footer accordion roto en móvil | Contenido duplicado, siempre cerrado |
| Layouts adicionales (split, mega) | NO existen en sitio público |
| Configuración móvil del footer | NO existe |

---

## Decisiones de Diseño

### 1. Layouts de Footer (5 opciones)

Se reutiliza la columna existente `footer_style` extendiendo sus valores.

| Layout | `footer_style` | Descripción | Columnas |
|--------|----------------|-------------|----------|
| **Clásico** | `default` | 4 columnas: logo+desc, contacto, horarios, enlaces | 4 |
| **3 Columnas** | `three_columns` | 3 columnas: logo+redes, enlaces, contacto | 3 |
| **Centrado** | `centered` | Todo centrado: logo, nav inline, redes | 1 (centrado) |
| **Minimal** | `minimal` | Una fila: logo, nav inline, redes | 1 (horizontal) |
| **Split** | `split` | 2 columnas grandes: izquierda logo+desc+redes, derecha enlaces en grid 2x2 | 2 |

### 2. Configuración Responsive del Footer

Nuevas columnas en `website_settings`:
- `mobile_footer_style` TEXT default `'accordion'` — comportamiento en móvil:
  - `accordion` — secciones colapsables (default, patrón actual arreglado)
  - `stacked` — todo expandido apilado verticalmente
  - `tabs` — tabs horizontales para cambiar entre secciones
  - `hidden` — ocultar footer en móvil (solo bottom bar)
- `mobile_footer_show_social` BOOLEAN default true — mostrar redes en móvil
- `mobile_footer_show_hours` BOOLEAN default false — mostrar horarios en móvil
- `footer_show_categories` BOOLEAN default false — mostrar categorías del inventario en footer
- `footer_columns` INTEGER default 4 — número de columnas (2-6) para layout `default`
- `footer_background` TEXT default `'dark'` — `dark` | `light` | `primary` | `custom`
- `footer_custom_bg_color` TEXT nullable — color hex si `footer_background = 'custom'`
- `footer_show_contact` BOOLEAN default true — mostrar columna de contacto
- `footer_show_hours` BOOLEAN default true — mostrar columna de horarios
- `footer_show_social` BOOLEAN default true — mostrar redes sociales
- `footer_show_newsletter` BOOLEAN default false — mostrar formulario de newsletter
- `footer_newsletter_title` TEXT nullable — título del formulario
- `footer_newsletter_placeholder` TEXT nullable — placeholder del input
- `footer_newsletter_button_text` TEXT nullable — texto del botón

### 3. Editor Jerárquico del Footer

Nuevo panel en `EditorSidebar` → "Configuración del Footer" (junto a "Configuración del Menú"):
- Selector de layout de footer (5 opciones con preview visual)
- Selector de columnas (slider 2-6) — condicional según layout
- Toggles: mostrar contacto, horarios, redes, newsletter, categorías
- Selector de fondo (dark/light/primary/custom + color picker)
- Editor jerárquico de items del footer (drag & drop tree):
  - Lista páginas con `show_in_footer = true`
  - Permite anidar páginas (parent_page_id)
  - Permite vincular una página a una categoría (linked_category_id)
  - Reordenar via footer_order
  - Asignar icono y badge
  - Agregar categorías existentes al footer
  - Agregar páginas existentes al footer

### 4. Preview Visual del Footer

Nuevo componente `FooterPreviewMockup` que muestra un mockup del footer **dentro del panel de configuración**, con feedback inmediato sin recargar iframe:
- 5 layouts desktop renderizados con divs Tailwind
- 4 layouts móvil renderizados (accordion, stacked, tabs, hidden)
- Responde a `isMobile` para alternar entre mockup desktop y móvil
- Muestra secciones condicionales según toggles (contacto, horarios, redes, newsletter, categorías)

### 5. Arreglo del Accordion en Móvil (Sitio Público)

El componente `FooterSection` actual renderiza el contenido dos veces. Se arreglará:
- Usar un único render del contenido
- En móvil: `<details>` con `<summary>` (accordion)
- En desktop: título fijo + contenido siempre visible
- El contenido se pasa como `children` una sola vez y se renderiza condicionalmente con CSS

---

## Fases del Plan

### Fase 0 — Migración de Base de Datos (Supabase) ⏳ PENDIENTE

**Objetivo:** Crear tablas de menús + extender `website_settings` con campos de configuración de footer.

**Cambios:**

```sql
-- ============================================================
-- Tabla 1: website_menus (contenedores nombrados)
-- ============================================================
CREATE TABLE IF NOT EXISTS website_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'none',
  footer_column INTEGER,
  footer_order INTEGER NOT NULL DEFAULT 0,
  header_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_website_menus_org
  ON website_menus(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_website_menus_header
  ON website_menus(organization_id, location, header_order)
  WHERE is_active = true AND location IN ('header', 'both');
CREATE INDEX IF NOT EXISTS idx_website_menus_footer
  ON website_menus(organization_id, location, footer_order)
  WHERE is_active = true AND location IN ('footer', 'both');

-- ============================================================
-- Tabla 2: website_menu_items (items de cada menú)
-- ============================================================
CREATE TABLE IF NOT EXISTS website_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id UUID NOT NULL REFERENCES website_menus(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'page',
  page_id UUID REFERENCES website_pages(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  custom_label TEXT,
  custom_url TEXT,
  parent_item_id UUID REFERENCES website_menu_items(id) ON DELETE SET NULL,
  icon TEXT,
  badge TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_menu_items_menu
  ON website_menu_items(menu_id, display_order)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_website_menu_items_parent
  ON website_menu_items(organization_id, parent_item_id);
CREATE INDEX IF NOT EXISTS idx_website_menu_items_org
  ON website_menu_items(organization_id, is_active);

-- ============================================================
-- Extender website_settings con configuración de footer + header menus
-- ============================================================
ALTER TABLE website_settings
  -- Header: selección de menús
  ADD COLUMN IF NOT EXISTS header_menu_id UUID REFERENCES website_menus(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS header_mega_menu_id UUID REFERENCES website_menus(id) ON DELETE SET NULL,
  -- Footer: configuración
  ADD COLUMN IF NOT EXISTS mobile_footer_style TEXT NOT NULL DEFAULT 'accordion',
  ADD COLUMN IF NOT EXISTS mobile_footer_show_social BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mobile_footer_show_hours BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS footer_show_categories BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS footer_columns INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS footer_background TEXT NOT NULL DEFAULT 'dark',
  ADD COLUMN IF NOT EXISTS footer_custom_bg_color TEXT,
  ADD COLUMN IF NOT EXISTS footer_show_contact BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS footer_show_hours BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS footer_show_social BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS footer_show_newsletter BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS footer_newsletter_title TEXT,
  ADD COLUMN IF NOT EXISTS footer_newsletter_placeholder TEXT,
  ADD COLUMN IF NOT EXISTS footer_newsletter_button_text TEXT;

-- ============================================================
-- Migración de datos: crear menús por defecto desde páginas existentes
-- ============================================================
-- Por cada organización con páginas en header, crear "Menú Principal"
-- Por cada organización con páginas en footer, crear "Menú Footer"
-- (Se ejecuta con un script SQL o desde el servicio ERP en Fase 1)

-- Comentarios
COMMENT ON TABLE website_menus IS 'Contenedores nombrados de items de navegación para header/footer';
COMMENT ON COLUMN website_menus.location IS 'Ubicación: header | footer | both | none';
COMMENT ON COLUMN website_menus.footer_column IS 'Columna del footer (1-6) donde se ubica el menú';
COMMENT ON TABLE website_menu_items IS 'Items de un menú: páginas, categorías, políticas o enlaces personalizados';
COMMENT ON COLUMN website_menu_items.item_type IS 'Tipo de item: page | category | policy | custom_link';
COMMENT ON COLUMN website_settings.header_menu_id IS 'Menú asignado a la barra de navegación del header';
COMMENT ON COLUMN website_settings.header_mega_menu_id IS 'Menú asignado al mega dropdown del header (solo header_style=mega)';
COMMENT ON COLUMN website_settings.mobile_footer_style IS 'Estilo footer móvil: accordion | stacked | tabs | hidden';
COMMENT ON COLUMN website_settings.footer_show_categories IS 'Mostrar categorías del inventario en footer';
COMMENT ON COLUMN website_settings.footer_columns IS 'Número de columnas del footer (2-6) para layout default';
COMMENT ON COLUMN website_settings.footer_background IS 'Fondo del footer: dark | light | primary | custom';
COMMENT ON COLUMN website_settings.footer_show_contact IS 'Mostrar columna de contacto en footer';
COMMENT ON COLUMN website_settings.footer_show_hours IS 'Mostrar columna de horarios en footer';
COMMENT ON COLUMN website_settings.footer_show_social IS 'Mostrar redes sociales en footer';
COMMENT ON COLUMN website_settings.footer_show_newsletter IS 'Mostrar formulario de newsletter en footer';
```

**Validación:**
- Verificar 2 tablas nuevas creadas
- Verificar 14 columnas nuevas en `website_settings`
- Verificar índices creados
- Ejecutar migración de datos: crear menús por defecto desde páginas existentes

---

### Fase 1 — ERP: Tipos TypeScript, Servicio de Menús y Servicio de Footer ⏳ PENDIENTE

**Objetivo:** Actualizar interfaces y servicios en go-admin-erp.

**Archivos a crear:**

1. **`src/lib/services/websiteMenuGroupService.ts`** (nuevo, ~300 líneas)
   - Interface `MenuGroup` — contenedor nombrado con `id`, `name`, `slug`, `location`, `footer_column`, `footer_order`, `header_order`, `is_active`, `items: MenuItem[]`
   - Interface `MenuItem` — item de menú con `item_type` (page/category/policy/custom_link), `page_id`, `category_id`, `custom_label`, `custom_url`, `parent_item_id`, `icon`, `badge`, `display_order`, `children: MenuItem[]`
   - `getMenus(organizationId)` — lista todos los menús de una org
   - `getMenusByLocation(organizationId, location)` — menús filtrados por header/footer
   - `createMenu(organizationId, data)` — crea un menú nuevo
   - `updateMenu(menuId, data)` — actualiza nombre, slug, ubicación, orden
   - `deleteMenu(menuId)` — elimina un menú y sus items (CASCADE)
   - `addMenuItem(menuId, item)` — agrega item al menú (página, categoría, política o enlace)
   - `updateMenuItem(itemId, data)` — actualiza item
   - `removeMenuItem(itemId)` — elimina item
   - `reorderMenuItems(menuId, itemIds)` — batch update de `display_order`
   - `nestMenuItem(itemId, parentItemId)` — anida item bajo otro
   - `getMenuTree(menuId)` — árbol jerárquico de items de un menú
   - `migrateExistingPages(organizationId)` — migración one-time: crea menús por defecto desde páginas con `show_in_header`/`show_in_footer`

**Archivos a modificar:**

2. **`src/lib/services/websiteSettingsService.ts`**
   - Extender `WebsiteSettings` interface con 14 campos nuevos de footer
   - Agregar método `updateFooterConfig(organizationId, config)`

3. **`src/lib/services/websitePageBuilderService.ts`**
   - Agregar `createPolicyPage(organizationId, data)` — crea página de tipo `policy` (términos, privacidad, cookies, etc.)
   - `getPolicyPages(organizationId)` — lista páginas de tipo `policy`

**Verificación:** `tsc --noEmit` — 0 errores

---

### Fase 2 — ERP: Panel "Configuración del Footer" + Gestor de Menús + Selector de Menú en Header ⏳ PENDIENTE

**Objetivo:** Nuevo panel en el editor para configurar layout de footer, columnas, secciones, navegación jerárquica, gestionar menús nombrados y seleccionar qué menú va en el header.

**Archivos a crear (6 componentes nuevos):**

1. **`src/components/organization/branding/editor/FooterLayoutSelector.tsx`** (~150 líneas)
   - Grid responsive de 5 tarjetas con mockups visuales (divs Tailwind):
     - `default` - Clásico (4 columnas)
     - `three_columns` - 3 Columnas
     - `centered` - Centrado
     - `minimal` - Minimal (una fila)
     - `split` - Split (2 columnas grandes)
   - Borde azul + indicador de check cuando seleccionado
   - Dark mode completo
   - Props: `currentLayout: string`, `onSelect: (layout: string) => void`

2. **`src/components/organization/branding/editor/FooterOptionsPanel.tsx`** (~180 líneas)
   - Campos de configuración:
     - Número de columnas (slider 2-6) — condicional según layout
     - Fondo del footer (dark/light/primary/custom + color picker)
     - Mostrar contacto (switch)
     - Mostrar horarios (switch)
     - Mostrar redes sociales (switch)
     - Mostrar categorías (switch)
     - Mostrar newsletter (switch) + título + placeholder + botón
     - Mostrar "Powered by" (switch)
     - Texto del footer (textarea)
   - Props: `settings` + `onUpdate`

3. **`src/components/organization/branding/editor/MenuGroupManager.tsx`** (~400 líneas)
   - **Gestor de menús nombrados** — el componente principal del nuevo sistema
   - Lista de menús existentes (cards con nombre, ubicación badge, número de items)
   - Botón "Crear Menú" → dialog con nombre + slug + ubicación (header/footer/both/none)
   - Al seleccionar un menú → muestra `MenuGroupEditor` con sus items
   - Acciones por menú: editar nombre, cambiar ubicación, eliminar
   - Reordena menús dentro del header/footer (drag & drop)
   - **Selector de menú para el header**: dropdown para elegir qué menú va en `header_menu_id`
   - **Selector de mega menú**: si `header_style='mega'`, dropdown para elegir qué menú va en `header_mega_menu_id`
   - Usa `websiteMenuGroupService`
   - Props: `organizationId: number`, `settings`, `onUpdate`

4. **`src/components/organization/branding/editor/MenuGroupEditor.tsx`** (~350 líneas)
   - **Editor de items de un menú** — se abre al seleccionar un menú
   - Árbol jerárquico de items (drag & drop tree, mismo patrón que `MenuTreeEditor`)
   - Cada item muestra: icono, label, badge de tipo (Página/Categoría/Política/Enlace), badge personalizado
   - Botón "Agregar Página" → picker de páginas existentes
   - Botón "Agregar Categoría" → picker de categorías del inventario (con hijas)
   - Botón "Agregar Política" → picker de páginas de tipo `policy` o crear nueva
   - Botón "Agregar Enlace" → dialog con label + url
   - Acciones por item: editar (icono + badge), anidar, eliminar, mover
   - Props: `menuId: string`, `organizationId: number`

5. **`src/components/organization/branding/editor/MobileFooterPanel.tsx`** (~120 líneas)
   - Campos de configuración móvil:
     - Estilo del footer móvil (accordion/stacked/tabs/hidden)
     - Mostrar redes en móvil (switch)
     - Mostrar horarios en móvil (switch)
   - Mockup visual de teléfono que muestra cómo se verá el footer según configuración
   - Props: `settings` + `onUpdate`

6. **`src/components/organization/branding/editor/FooterPreviewMockup.tsx`** (~350 líneas)
   - Mockup visual del footer dentro del panel de configuración
   - 5 layouts desktop renderizados con divs Tailwind
   - 4 layouts móvil renderizados (accordion, stacked, tabs, hidden)
   - Muestra menús como columnas del footer según `footer_column`
   - Componentes reutilizables internos: `MockFooterLogo`, `MockFooterLink`, `MockFooterSocial`, `MockFooterContact`, `MockFooterHours`, `MockFooterNewsletter`
   - Responde a `isMobile` para alternar entre desktop y móvil
   - Props: `layout`, `columns`, `background`, `showContact`, `showHours`, `showSocial`, `showNewsletter`, `showCategories`, `menus`, `isMobile`, `mobileStyle`

**Archivos a modificar:**

7. **`src/components/organization/branding/editor/index.ts`**
   - Agregar 6 exports: `FooterLayoutSelector`, `FooterOptionsPanel`, `MenuGroupManager`, `MenuGroupEditor`, `MobileFooterPanel`, `FooterPreviewMockup`

8. **`src/components/organization/branding/editor/EditorSidebar.tsx`**
   - 3 props nuevos: `showFooterConfig`, `onToggleFooterConfig`, `footerConfigContent`
   - Nueva sección colapsable "Configuración del Footer" entre "Configuración del Menú" y "Sections List"

9. **`src/components/organization/branding/editor/HeaderOptionsPanel.tsx`** (modificación puntual)
   - Agregar selector de menú para el header: dropdown con menús disponibles → guarda en `header_menu_id`
   - Si `header_style='mega'`, agregar selector de mega menú: dropdown con menús disponibles → guarda en `header_mega_menu_id`
   - Estos selectores reemplazan la configuración manual actual del `MenuTreeEditor` (que sigue disponible pero opcional)

10. **`src/app/organizacion/branding/editor/[pageId]/page.tsx`**
    - Imports de los 6 componentes nuevos
    - Estado `showFooterConfig` agregado
    - `footerConfigContent` construido con los 6 componentes anidados:
      - `FooterLayoutSelector` → `FooterPreviewMockup` → `FooterOptionsPanel` → `MobileFooterPanel` → `MenuGroupManager` (con `MenuGroupEditor` interno)
    - `handleSave` modificado: separar `footerUpdates` y llamar `updateFooterConfig`

11. **`src/components/organization/branding/BrandingPagesTab.tsx`**
    - Agregar sección "Menús" arriba de la lista de páginas
    - Mostrar menús existentes con badge de ubicación (header/footer/both)
    - Botón "Crear Menú" que abre el `MenuGroupManager` en un dialog
    - Nota: "Las páginas se asignan a menús desde el Editor Visual → Configuración del Footer"

12. **Traducciones (4 archivos)**
    - `messages/es.json`, `en.json`, `fr.json`, `pt.json`: `footerConfig`, `menuGroup`, `createMenu`, `menuLocation`, `menuItem`, `addPage`, `addCategory`, `addPolicy`, `addLink`, `policyPage`, `headerMenuSelect`, `megaMenuSelect`, etc.

**Verificación:** `tsc --noEmit` + `eslint` en archivos nuevos — 0 errores

---

### Fase 3 — ERP: Preview en el Editor ⏳ PENDIENTE

**Objetivo:** Que el editor refleje los cambios de footer en tiempo real.

**Verificación previa:**
- El iframe del preview ya se recarga después de guardar (`previewRefreshKey`)
- El toggle desktop/tablet/mobile ya existe en `EditorHeader`

**Trabajo:**
- `FooterPreviewMockup` se inserta entre `FooterLayoutSelector` y `FooterOptionsPanel` en `footerConfigContent`
- `isMobile` se pasa según `devicePreview === 'mobile'`
- El mockup se actualiza instantáneamente cuando el usuario cambia cualquier setting

**Verificación:** `tsc --noEmit` — 0 errores

---

### Fase 4 — Sitio Público: Tipos, Queries de Menús, Header y Footer ⏳ PENDIENTE

**Objetivo:** Actualizar goadmin-websites para leer las nuevas tablas de menús y campos de header/footer.

**Archivos a modificar:**

1. **`types/database.ts`**
   - Extender `WebsiteSettings` con 16 campos nuevos (2 de header + 14 de footer)
   - Agregar interfaces `WebsiteMenu` y `WebsiteMenuItem`

2. **`lib/supabase/queries.ts`**
   - `getWebsiteMenus(organizationId)` — lista menús con items jerárquicos
   - `getWebsiteMenusByLocation(organizationId, location)` — menús filtrados por header/footer
   - `getMenuById(menuId)` — carga un menú específico con sus items
   - Mantener `getWebsiteHeaderNav()`, `getWebsiteHeaderNavTree()`, `getWebsiteFooterNav()`, `getWebsiteFooterNavTree()`, `getMenuCategories()` para backward compat

3. **`lib/get-org-context.ts`** (modificaciones puntuales, sin reescribir)
   - Si `settings.header_menu_id` existe, cargar ese menú y pasarlo como `headerNavTree` (convertido al formato `WebsitePageWithChildren[]` o directamente como `NavItem[]`)
   - Si `settings.header_mega_menu_id` existe, cargar ese menú y pasarlo como `megaMenuItems` (nuevo prop)
   - Si no existen, fallback a `headerNavTree` y `menuCategories` (backward compat)
   - Cargar `websiteMenus` para el footer además de `footerNav`/`footerNavTree`

4. **`components/site/SiteHeader.tsx`** (modificaciones puntuales, sin reescribir)
   - Agregar prop opcional `megaMenuItems?: NavItem[]` — items del mega menú nombrado
   - Si `megaMenuItems` viene, pasarlo a `HeaderMega` como `megaMenuItems` en vez de `menuCategories`
   - Si no viene, seguir pasando `menuCategories` (backward compat)
   - **No se modifican las 5 variantes desktop ni las 4 móviles** — solo cambia la fuente de datos

5. **`components/site/header/HeaderMega.tsx`** (modificación puntual, sin reescribir)
   - Agregar prop opcional `megaMenuItems?: NavItem[]`
   - Si `megaMenuItems` viene, renderizarlo en el `MegaMenuDropdown` en vez de `menuCategories`
   - Si no viene, seguir usando `menuCategories` (backward compat)
   - El `MegaMenuDropdown` recibe items en formato `NavItem[]` (con `children`) en vez de `MenuCategory[]`

6. **`components/site/header/MegaMenuDropdown.tsx`** (modificación puntual, sin reescribir)
   - Agregar prop opcional `items?: NavItem[]` — items de menú nombrado
   - Si `items` viene, renderizarlo en el grid multi-columna (mismo layout que categorías pero con items genéricos)
   - Si no viene, seguir usando `categories` (backward compat)
   - Cada item tiene `name`, `href`, `icon`, `badge`, `children` — mismo formato que `MenuCategory` pero genérico

**Verificación:** `tsc --noEmit` — 0 errores
**Regla:** No se reescribe `SiteHeader.tsx`, `HeaderMega.tsx` ni `MegaMenuDropdown.tsx`. Se agregan props opcionales y condicionales, respetando el backward compat.

---

### Fase 5 — Sitio Público: SiteFooter (modificaciones puntuales sobre el existente) ⏳ PENDIENTE

**Objetivo:** Arreglar el accordion roto, agregar el layout `split`, soportar la nueva configuración y renderizar menús nombrados — **trabajando sobre el `SiteFooter.tsx` existente, sin reescribirlo**.

**Principio:** No se reescribe el componente. Se hacen modificaciones puntuales:
- Arreglar `FooterSection` (líneas 65-88) para que no duplique el contenido.
- Agregar un nuevo bloque `if (footerStyle === 'split')` siguiendo el mismo patrón de los 4 layouts existentes.
- Agregar condicionales (`footer_show_contact`, `footer_show_hours`, `footer_show_social`, `footer_show_newsletter`, `footer_show_categories`) en los lugares donde ya se renderizan esas secciones.
- Agregar soporte para `footer_columns` en el layout `default` (cambiar el grid fijo `lg:grid-cols-4` por un grid dinámico).
- Agregar soporte para `footer_background` cambiando las clases `bg-gray-900` hardcodeadas por un switch.
- Agregar soporte para `mobile_footer_style` en `FooterSection` (accordion/stacked/tabs/hidden).
- Agregar bloque de newsletter si `footer_show_newsletter = true`.
- Agregar bloque de categorías si `footer_show_categories = true`.
- **Renderizar menús nombrados** en las columnas del footer según `footer_column` de cada menú. Si no hay menús, fallback a `footerNavTree` (backward compat).

**Archivos a modificar:**

1. **`components/site/SiteFooter.tsx`** (modificaciones puntuales, NO reescritura)
   - Arreglar `FooterSection`: render único de contenido, accordion solo en móvil
   - Agregar bloque `if (footerStyle === 'split')` (~60 líneas, mismo patrón que los otros 4)
   - Agregar condicionales de visibilidad en secciones existentes (contacto, horarios, redes)
   - Agregar bloque de newsletter (~30 líneas)
   - Agregar bloque de categorías (~20 líneas, reutilizando `buildCategoryItems` que ya existe)
   - Cambiar `bg-gray-900` hardcodeado por switch según `footer_background`
   - Cambiar `grid-cols-4` fijo por grid dinámico según `footer_columns`
   - Soportar `mobile_footer_style` en `FooterSection`
   - Agregar prop `menus?: WebsiteMenu[]` — si viene, renderiza menús en columnas; si no, sigue usando `footerNavTree`
   - Agregar función `buildMenuGroupItems(menu)` — convierte items de un menú a `FooterNavItem[]`

2. **`components/site/OrganizationLayout.tsx`**
   - Pasar nuevos props a `SiteFooter` desde `settings` y `websiteMenus`: `footerColumns`, `footerBackground`, `footerShowContact`, `footerShowHours`, `footerShowSocial`, `footerShowNewsletter`, `footerShowCategories`, `mobileFooterStyle`, `mobileFooterShowSocial`, `mobileFooterShowHours`, `footerNewsletterTitle`, `footerNewsletterPlaceholder`, `footerNewsletterButtonText`, `menus`

**Verificación:** `tsc --noEmit` — 0 errores
**Regla:** No se reescribe `SiteFooter.tsx`. Se modifican puntualmente las secciones existentes y se agregan bloques nuevos siguiendo el mismo patrón.

---

### Fase 6 — Migración de BrandingContentTab ⏳ PENDIENTE

**Objetivo:** Migrar la configuración de footer de `BrandingContentTab` al nuevo panel del editor.

**Archivos a modificar:**

1. **`src/components/organization/branding/BrandingContentTab.tsx`**
   - Mantener pestañas "Redes Sociales" y "Horarios"
   - Pestaña "Footer" simplificada: solo texto del footer + enlaces manuales + powered by
   - Agregar nota: "La configuración completa del footer (layout, columnas, secciones, navegación) se gestiona desde el Editor Visual → Configuración del Footer"

2. **`src/components/organization/branding/BrandingThemeTab.tsx`**
   - Remover `footer_style` del estado del tema (migró al editor)

**Verificación:** `tsc --noEmit` — 0 errores

---

## Resumen de Archivos

### ERP (go-admin-erp) — Archivos nuevos
- `src/lib/services/websiteMenuGroupService.ts` — servicio CRUD de menús nombrados
- `src/components/organization/branding/editor/FooterLayoutSelector.tsx`
- `src/components/organization/branding/editor/FooterOptionsPanel.tsx`
- `src/components/organization/branding/editor/MenuGroupManager.tsx` — gestor de menús nombrados
- `src/components/organization/branding/editor/MenuGroupEditor.tsx` — editor de items de un menú
- `src/components/organization/branding/editor/MobileFooterPanel.tsx`
- `src/components/organization/branding/editor/FooterPreviewMockup.tsx`

### ERP (go-admin-erp) — Archivos modificados
- `src/lib/services/websiteSettingsService.ts` — 14 campos nuevos + `updateFooterConfig()`
- `src/lib/services/websitePageBuilderService.ts` — `createPolicyPage()`, `getPolicyPages()`
- `src/components/organization/branding/editor/index.ts` — 6 exports nuevos
- `src/components/organization/branding/editor/EditorSidebar.tsx` — sección "Configuración del Footer"
- `src/app/organizacion/branding/editor/[pageId]/page.tsx` — integración de 6 componentes
- `src/components/organization/branding/BrandingPagesTab.tsx` — sección "Menús"
- `src/components/organization/branding/BrandingContentTab.tsx` — simplificar pestaña Footer
- `src/components/organization/branding/BrandingThemeTab.tsx` — remover `footer_style` del tema
- `messages/es.json`, `messages/en.json`, `messages/fr.json`, `messages/pt.json`

### Sitio Público (goadmin-websites) — Archivos modificados (puntual, sin reescribir)
- `types/database.ts` — extender interface con 14 campos + interfaces `WebsiteMenu`/`WebsiteMenuItem`
- `lib/get-org-context.ts` — cargar `websiteMenus` con fallback a `footerNavTree`
- `lib/supabase/queries.ts` — `getWebsiteMenus()`, `getWebsiteMenusByLocation()`
- `components/site/SiteFooter.tsx` — **modificaciones puntuales sobre el existente**: arreglar `FooterSection`, agregar layout `split`, agregar condicionales de visibilidad, agregar newsletter, agregar categorías, soportar `footer_columns` y `footer_background`, renderizar menús nombrados
- `components/site/OrganizationLayout.tsx` — pasar nuevos props desde settings y menus

### Base de Datos
- 2 tablas nuevas: `website_menus`, `website_menu_items`
- 14 columnas nuevas en `website_settings`
- 6 índices nuevos
- Migración de datos: crear menús por defecto desde páginas existentes

---

## Orden de Ejecución

1. **Fase 0** — Migración BD (Supabase MCP)
2. **Fase 1** — Tipos y servicios ERP
3. **Fase 2** — Panel "Configuración del Footer" en EditorSidebar
4. **Fase 3** — Preview en el editor
5. **Fase 4** — Tipos y queries sitio público
6. **Fase 5** — SiteFooter mejorado
7. **Fase 6** — Migración de BrandingContentTab

---

## Notas

- **No se necesita migración de `website_pages`** — las columnas `parent_page_id`, `linked_category_id`, `menu_icon`, `menu_badge` ya existen (migración header Fase 0).
- **El servicio `websiteMenuService` ya soporta footer** — `getFooterMenuTree()` y `addCategoryToMenu({show_in_footer: true})` ya existen.
- **El sitio público ya carga `footerNavTree`** — `get-org-context.ts` ya hace el query jerárquico.
- **Backward compatible** — todos los campos nuevos tienen defaults seguros.
- **Scope** — todos los cambios en ERP bajo `src/components/organization/branding/` y `src/app/organizacion/branding/` (módulo `app-organ`).
