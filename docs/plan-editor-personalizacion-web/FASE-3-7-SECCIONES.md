# FASES 3–7 — Hero, categorías, cards, testimonios y banners

> Vuelve al [PLAN.md](./PLAN.md) · Dependen de [FASE 0, 1 y 2](./FASE-0-FUNDACIONES.md)

Todas estas fases asumen que ya existen `STYLE_FIELDS`, `CAROUSEL_FIELDS`, `GRID_FIELDS`, `CARD_FIELDS`, `BUTTON_ITEM_FIELDS`, `RepeaterField`, `EntityField`, `IconField` y `ResponsiveField` (F0), y que `SectionWrapper` ya aplica el contrato de estilo (F2).

---

# FASE 3 — Hero pro

**Archivos del sitio:** `components/sections/hero/{HeroFullscreen,HeroMinimal,HeroSplit,HeroVideo,HeroSlider,HeroBookingWidget}.tsx`

## 3.1 Altura configurable

Hoy cada variante tiene su altura fija en el código: `HeroFullscreen` usa `min-h-[50vh] md:min-h-[70vh]`, `HeroVideo` `min-h-[60vh] md:min-h-[80vh]`, `HeroSplit` `md:min-h-[60vh]`, `HeroMinimal` solo `py-4`.

Campos nuevos (grupo Diseño):
| Campo | Tipo | Notas |
|---|---|---|
| `height_mode` | select | `auto` (contenido) · `screen` (100vh) · `custom` |
| `height_value` | number responsive | `showIf: height_mode = custom` |
| `height_unit` | select | `vh` / `px` |
| `min_height` | number responsive | red de seguridad |
| `subtract_header` | boolean | `calc(100dvh - var(--header-h))` |
| `vertical_align` | select | arriba / centro / abajo |
| `content_align` | alignment | grid 3×3 (izquierda-centro-derecha × arriba-medio-abajo) |
| `content_max_width` | number | ancho de la caja de texto |

**Detalle técnico:** usar `100dvh` y no `100vh`. En móvil, `100vh` incluye la barra del navegador y provoca que el hero se corte al hacer scroll. Fallback: `height: 100vh; height: 100dvh;`.

## 3.2 Botones múltiples (repeater)

Hoy solo hay `cta_text` + `cta_url` (y `cta_secondary_*` únicamente en `HeroSplit`).

```ts
{ key: 'buttons', label: 'Botones', type: 'repeater', group: 'content',
  itemFields: BUTTON_ITEM_FIELDS, itemLabelKey: 'label', maxItems: 4 }
```

**Compatibilidad obligatoria:** si `buttons` está vacío o no existe, el componente usa `cta_text`/`cta_url` como hasta ahora. Nada de migrar datos a la fuerza. Se ofrece en el editor un botón "Convertir a botones múltiples" que hace la conversión bajo demanda.

Además: `buttons_layout` (fila / columna / fila en desktop y columna en móvil), `buttons_gap`, `buttons_align`.

## 3.3 Slider completo

`HeroSlider.tsx` hoy tiene autoplay **fijo en 5000ms** (`useEffect` con `setInterval`, líneas 37-43), solo dots, sin flechas y sin swipe.

Se aplica `CAROUSEL_FIELDS` completo (F0.2): `autoplay`, `interval_ms`, `pause_on_hover`, `loop`, `transition` (slide/fade/zoom), `transition_ms`, `show_arrows`, `arrow_style`, `arrow_position`, `arrow_size`, `arrow_color`, `arrow_bg_color`, `show_dots`, `dot_style`, `enable_swipe`.

Implementación: el repo **ya tiene `embla-carousel-react`** en `node_modules`. Usarlo en vez de mantener el `setInterval` a mano — resuelve swipe, loop, accesibilidad y `prefers-reduced-motion` de una vez.

**Repeater de slides** ampliado (hoy: `title`, `subtitle`, `image_url`, `image_url_mobile`, `cta_text`, `cta_url`):
añadir `video_url`, `overlay_opacity` por slide, `content_align` por slide, `buttons` (repeater anidado), `text_color`, `badge_text`.

## 3.4 Overlay avanzado

Hoy: `show_overlay` booleano + `overlay_opacity` numérico en algunas variantes.
Nuevo: `overlay_type` (`none`/`color`/`gradient`), `overlay_color`, `overlay_opacity`, `overlay_gradient_dir`, `overlay_blend_mode`.

## 3.5 Motores de reserva seleccionables

`HeroBookingWidget` está cableado a hotel (check-in/check-out/huéspedes → `/espacios`).

Nuevo registro `BOOKING_ENGINES` en `components/sections/hero/engines/`:
| Motor | Campos | Destino |
|---|---|---|
| `hotel` | check-in, check-out, adultos, niños | `/espacios?...` (actual) |
| `restaurant` | fecha, hora, personas, zona | ver [FASE 8](./FASE-8-RESERVAS-MESA.md) |
| `parking` | entrada, salida, tipo de vehículo | `/zonas?...` |
| `gym` | plan, sede | `/membresias?...` |
| `transport` | origen, destino, fecha, pasajeros | `/viajes?...` |
| `services` | servicio, fecha, profesional | `/agendar?...` |
| `custom` | repeater de campos definidos por el usuario | URL con query params |

Campos: `booking_engine` (select), `booking_position` (`inside` / `below` / `floating` / `overlap`), `booking_style` (`glass` / `solid` / `outlined`), `booking_radius`, `booking_fields` (qué campos mostrar), `booking_button_text`, `booking_target_url`.

Los widgets de `components/site/sections/{gym,spaces,transport}` ya existentes se reutilizan como base.

## 3.6 Exponer `hero:video` y rendimiento

- Declarar la variante `video` en el catálogo (existe en el sitio, no en el editor).
- Migrar el `<picture>` con `<img>` crudo a `next/image` con `priority`, `sizes` y `placeholder="blur"` donde haya `blurDataURL`. El hero es el LCP de casi todas las páginas.
- En `hero:video`: `poster` obligatorio, `preload="none"` en móvil y respetar `prefers-reduced-motion`.

### Criterios de aceptación F3
- [ ] Hero a pantalla completa real (`100dvh` menos header) sin scroll horizontal en 375/834/1440.
- [ ] 3 botones con estilos, iconos y colores distintos, configurados desde el editor.
- [ ] Slider de 3 slides con flechas cuadradas fuera del marco, intervalo de 3s, transición fundido y swipe en móvil.
- [ ] Motor de reserva de restaurante embebido y funcional en el hero.
- [ ] Los heros existentes se ven idénticos sin tocar nada.

---

# FASE 4 — Categorías: icono, color, grid y carrusel

**Archivos del sitio:** `components/sections/products/{CategoriesGrid,CategoriesHorizontal,CategoriesIcons}.tsx`

## 4.1 Unificar los tres componentes

Hoy son 3 archivos con lógica duplicada y capacidades desiguales: `CategoriesGrid` (461 líneas, el más completo: layouts, carrusel, búsqueda, paginación), `CategoriesHorizontal` (112, imagen circular + contador), `CategoriesIcons` (108, círculo con inicial).

**Plan:** un único `CategoriesSection.tsx` con `display_mode`, y los 3 archivos actuales quedan como wrappers de 5 líneas que fijan el `display_mode` por defecto. Así el `SECTION_MAP` no cambia y ningún sitio se rompe.

`display_mode`: `card` · `circle` · `icon` · `list` · `tile` (imagen de fondo con texto encima) · `banner` (ancho completo).

## 4.2 Icono, color e imagen

La tabla `categories` **ya tiene** `icon`, `color`, `image_url` y `description`. Hoy los componentes solo usan `image_url` (con fallback a emoji 🏷️ o a la inicial del nombre).

Campo nuevo `media_source`:
| Valor | Comportamiento |
|---|---|
| `image` | solo `image_url` |
| `icon` | icono Lucide de `categories.icon`, coloreado con `categories.color` |
| `color` | bloque de color plano con la inicial |
| `initial` | inicial sobre `primaryColor` (como hace hoy `CategoriesIcons`) |
| `auto` | **default**: imagen → icono → color → inicial |

Campos de apoyo: `icon_size`, `icon_bg` (`none`/`circle`/`square`/`rounded`), `icon_bg_opacity`, `use_category_color` (usar `categories.color` como fondo o solo como acento), `fallback_icon`.

**Importante:** también hay que **poder cargar** icono y color desde el ERP. Verificar que el formulario de categorías de inventario use `IconField` (F0) y un color picker; si no, agregarlo. `categories.icon` guarda el nombre del icono Lucide en texto.

`getOrganizationCategories` en `lib/supabase/queries.ts:414` ya hace `select('*')`, así que `icon` y `color` ya llegan al componente. No hay cambio de query.

## 4.3 Grid responsive de verdad

Hoy `getGridClass(count)` decide las columnas automáticamente según cuántas categorías haya, y `desktop_columns`/`desktop_rows` solo existen en `CategoriesGrid`.

Se aplica `GRID_FIELDS` con `ResponsiveField`: `columns` (desktop/tablet/mobile), `rows`, `gap`, `aspect_ratio`. Se conserva `columns = 'auto'` como opción que mantiene el comportamiento actual (y es el default, para no cambiar nada).

**Detalle técnico:** las clases `grid-cols-N` dinámicas no se pueden concatenar (Tailwind no las genera). Usar `style={{ gridTemplateColumns: 'repeat(var(--cols), minmax(0,1fr))' }}` con la variable definida por breakpoint mediante clases estáticas o CSS inline con media queries en una `<style>` scoped por sección.

## 4.4 Carrusel en cualquier modo

Hoy solo `CategoriesGrid` tiene carrusel en desktop y algunos tienen "carrusel" en móvil que es en realidad un `overflow-x-auto`.

Aplicar `CAROUSEL_FIELDS` (embla) a todos los `display_mode`, con `slides_per_view` responsive y `peek` (dejar ver el borde del siguiente, que es lo que invita a deslizar).

## 4.5 Card de categoría

Extraer a `components/sections/products/CategoryCard.tsx` (hoy está inline y duplicada 3 veces) y gobernarla con `CARD_FIELDS`:
`card_radius`, `card_shadow`, `card_border_width/color`, `card_bg`, `card_hover` (`zoom`/`lift`/`glow`/`none`), `image_fit`, `text_position` (`below` / `inside` / `overlay` / `on_hover`), `text_align`, `title_size`, `show_count`, `show_description`, `badge` (texto libre o "N productos").

## 4.6 Editor

- Declarar las 4 variantes reales (`default`, `grid`, `horizontal`, `icons`) — hoy el catálogo declara solo `grid`.
- `EntityField` de categorías con árbol: seleccionar categorías sueltas, "todas", o "las hijas de X".
- `order_by`: `rank` (actual) · `name` · `product_count` · `manual` (orden del selector).
- `hide_empty`: ocultar categorías sin productos.
- `max_depth`: mostrar solo categorías raíz o incluir subcategorías.

### Criterios de aceptación F4
- [ ] 5 columnas × 2 filas en desktop, 3 en tablet, carrusel en móvil, configurado desde el editor.
- [ ] Categorías mostrando icono Lucide con el color de la categoría.
- [ ] Card sin sombra, radio 0, texto sobre la imagen.
- [ ] Las secciones de categorías existentes se ven idénticas sin tocar nada.

---

# FASE 5 — Cards de producto y sistema de badges

## 5.1 Unificar las 4 cards duplicadas

| Implementación actual | Archivo |
|---|---|
| `ProductCardGrid` | `app/categorias/[slug]/CategoryPageClient.tsx:351-467` |
| `ProductCardList` | `app/categorias/[slug]/CategoryPageClient.tsx:469-533` |
| card de relacionados | `components/site/RelatedProducts.tsx:118-183` |
| `FavoriteProductCard` | `app/mi-cuenta/favoritos/FavoriteProductCard.tsx` |

Todas repiten `rounded-xl`, `border`, `shadow-sm hover:shadow-lg`, badges y botones con pequeñas diferencias.

**Plan:** un `components/sections/products/ProductCard.tsx` con `variant` (`grid` / `list` / `compact` / `overlay`) que reciba `cardStyle` desde la sección. Los 4 usos actuales pasan a consumirlo. Es refactor sin cambio visual (los defaults reproducen el aspecto actual).

## 5.2 `CARD_FIELDS` aplicado

`card_radius`, `border_width`, `border_color`, `shadow` (`none`/`sm`/`md`/`lg`/`xl`), `shadow_hover`, `bg`, `padding`, `image_ratio` (`1:1`/`4:3`/`3:4`/`16:9`), `image_fit` (`cover`/`contain`), `hover_effect` (`none`/`zoom-image`/`lift`/`glow`/`border`), `layout`, `text_align`, `title_lines` (clamp), `show_description`, `price_style` (`inline`/`stacked`), `show_compare_price`, `currency_position`.

## 5.3 Badges declarativos

Hoy están hardcodeados y siempre visibles: descuento (rojo, arriba-izquierda), agotado, variantes (con icono `Layers`, arriba-derecha), "⚡ N vendidos" (abajo-izquierda).

```ts
{ key: 'badges', label: 'Etiquetas', type: 'repeater', group: 'content',
  itemFields: [
    { key:'type', type:'select', options:[
      'discount','new','bestseller','out_of_stock','low_stock',
      'free_shipping','variants','sales_count','rating','custom' ] },
    { key:'label', type:'text', helpText:'Usa {value} para el dato: "-{value}%"' },
    { key:'condition_value', type:'number', helpText:'Ej: mostrar "nuevo" si tiene menos de N días' },
    { key:'bg_color', type:'color' }, { key:'text_color', type:'color' },
    { key:'position', type:'select', options:['top-left','top-right','bottom-left','bottom-right'] },
    { key:'shape', type:'select', options:['pill','square','ribbon','corner'] },
    { key:'icon', type:'icon' },
    { key:'size', type:'select', options:['sm','md','lg'] },
  ], itemLabelKey: 'type' }
```

Default: los 4 badges actuales precargados, para que nada cambie de aspecto.

## 5.4 Botones de la card

```ts
{ key: 'card_buttons', type: 'repeater', itemFields: [
  { key:'action', type:'select', options:[
    'add_to_cart','buy_now','wishlist','quick_view','whatsapp','share','view_detail','custom'] },
  ...BUTTON_ITEM_FIELDS,
]}
```
Más: `buttons_position` (`below` / `overlay_hover` / `bottom_bar` / `beside_price`), `buttons_layout`, `icon_only`.

`whatsapp` compone el mensaje con nombre del producto y URL; útil para las tiendas que cierran por WhatsApp.

## 5.5 Rating en la card

`show_rating`, `rating_style` (`stars`/`compact`/`stars_count`), `rating_position`, `hide_if_no_reviews`.
Queda disponible pero **solo tiene sentido tras la [FASE 10](./FASE-9-10-PAGINAS-Y-REVIEWS.md)** (hoy los reviews son falsos). Hasta entonces, default `false`.

## 5.6 Aplicar a todas las secciones que muestran productos

`products_grid`, `featured_products`, `offers`, `menu_preview`, `specialties`, `related_products` y la card de categoría de la F4 comparten `CARD_FIELDS`. Un solo cambio de estilo debe poder aplicarse a todas (ver "copiar estilo entre secciones" en la [FASE 12](./FASE-12-EDITOR-PRO.md)).

### Criterios de aceptación F5
- [ ] Card sin borde, sin sombra, radio 0, con badge "Envío gratis" abajo-derecha y botón de WhatsApp al hacer hover.
- [ ] Los mismos ajustes aplicados a productos, ofertas y relacionados.
- [ ] Las 4 implementaciones duplicadas quedan reducidas a una.
- [ ] Sin cambio visual en los sitios existentes.

---

# FASE 6 — Testimonios

**Archivos:** `components/sections/testimonials/{TestimonialsCarousel,TestimonialsGrid,TestimonialsQuotes,TestimonialsMinimal}.tsx`

## 6.1 Tabla `testimonials`

```sql
create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references organizations(id) on delete cascade,
  author_name text not null,
  author_role text,
  author_avatar_url text,
  company text,
  company_logo_url text,
  content text not null,
  rating smallint check (rating between 1 and 5),
  source text,                -- 'manual' | 'google' | 'facebook' | 'tripadvisor'
  source_url text,
  product_id integer references products(id) on delete set null,
  branch_id integer references branches(id) on delete set null,
  language text default 'es',
  is_published boolean not null default true,
  is_featured boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.testimonials enable row level security;
```
RLS: lectura pública de `is_published = true`; escritura por membresía.

CRUD en el ERP dentro de branding, con botón **"Importar los testimonios que ya tengo"** que recorre `website_page_sections.content.items` de las secciones `testimonials` de la organización y los inserta. Sin borrar el JSON original (rollback fácil).

## 6.2 Origen de datos

`data_source`: `manual` (JSON, como hoy — **default**) · `database` · `mixed`.
Con `database`: `filter_featured`, `filter_min_rating`, `filter_product` (testimonios del producto en la página de detalle), `filter_branch`, `filter_language`, `max_items`.

## 6.3 Aleatorio

- `randomize` (checkbox, lo que pediste).
- `random_seed_scope`: `session` (no cambia al navegar entre páginas — recomendado) · `request` (cambia en cada carga) · `daily`.
- Implementación: barajado **en servidor** con semilla derivada de la cookie de sesión, para no romper la hidratación de React (barajar en cliente causa mismatch SSR/CSR).

## 6.4 Presentaciones

Unificar las 4 variantes bajo `layout`, conservando los `section_variant` actuales como presets:
`grid` · `carousel` (uno o varios visibles) · `masonry` · `quotes` (cita grande centrada) · `minimal` (línea vertical) · `slider_single` · `marquee` (cinta infinita) · `video`.

Más `CAROUSEL_FIELDS` y `GRID_FIELDS` responsive.

⚠️ Hoy `TestimonialsCarousel` **no es un carrusel**: es un grid de 3 columnas. Al implementar el carrusel real hay que mantener el aspecto de grid como default para esa variante y no sorprender a nadie.

## 6.5 Estrellas

`show_rating`, `star_style` (`filled`/`outline`/`emoji`/`hearts`/`custom_icon`), `star_color`, `star_empty_color`, `star_size`, `show_numeric` ("4.8"), `max_stars`.

## 6.6 Composición de la tarjeta

- `content_order`: repeater ordenable con los bloques `rating`, `quote_mark`, `text`, `author`, `role`, `company_logo`, `date`, `source_badge`. Esto es lo que permite "cambiar la ubicación de los componentes".
- `avatar_position` (`top`/`left`/`right`/`bottom`/`none`), `avatar_shape` (`circle`/`square`/`rounded`), `avatar_size`, `avatar_fallback` (inicial o icono).
- `quote_marks` (`none`/`before`/`around`/`background`), `quote_mark_color`, `quote_mark_size`.
- `text_align`, `text_size`, `text_max_lines` (con "leer más").
- `card_style` compartido (`CARD_FIELDS`).
- `show_source_badge` ("Reseña de Google").

### Criterios de aceptación F6
- [ ] Testimonios desde la BD, 6 aleatorios por sesión, en carrusel con estrellas moradas y avatar a la izquierda.
- [ ] Reordenar los bloques internos de la tarjeta desde el editor.
- [ ] Los testimonios en JSON siguen funcionando sin migrar.

---

# FASE 7 — Banners promocionales conectados al catálogo

**Archivo:** `components/sections/retail/PromoBannersGrid.tsx` (57 líneas)

## 7.1 Qué es hoy y por qué confunde

`content.banners[]` es un array escrito a mano con `title`, `subtitle`, `image_url`, `cta_text`, `cta_url`, `bg_color`, renderizado en un grid fijo `md:grid-cols-2`. **No consulta productos ni categorías.** Y el editor solo expone `title` — o sea, los banners ni siquiera se pueden crear desde el editor: los que se ven vienen del preset de plantilla.

## 7.2 Destino tipado

```ts
link_type: 'category' | 'product' | 'collection' | 'page' | 'url' | 'none'
link_category_id / link_product_id / link_page_id / link_url
```
Con `EntityField`, al elegir "categoría" el editor muestra el árbol real de categorías y arma el `href` (`/categorias/{slug}`) automáticamente. Se acabó escribir URLs a mano.

## 7.3 Autocompletado desde la entidad

`inherit_from_entity` (boolean): si está activo y no hay valor propio, el banner toma `image_url`, `name` y `color` de la categoría o producto elegido. Y puede mostrar datos vivos:
`dynamic_badge`: `none` · `product_count` ("48 productos") · `min_price` ("desde $59.900") · `max_discount` ("hasta -40%") · `stock_status`.

Esto requiere prefetch en `app/[[...slug]]/page.tsx`: si hay `promo_banners` con `link_type='category'`, cargar los agregados de esas categorías.

## 7.4 Tabla `promo_banners` (opcional pero recomendable)

```sql
create table public.promo_banners (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references organizations(id) on delete cascade,
  title text, subtitle text, badge_text text,
  image_url text, image_url_mobile text,
  bg_color text, text_color text,
  link_type text not null default 'url',
  link_category_id integer references categories(id) on delete set null,
  link_product_id integer references products(id) on delete set null,
  link_page_id uuid references website_pages(id) on delete set null,
  link_url text,
  starts_at timestamptz, ends_at timestamptz,
  position_key text,          -- 'home_top', 'category_sidebar', …
  is_published boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
Ventaja sobre el JSON: **vigencia por fechas** (un banner de Navidad se apaga solo) y reutilización del mismo banner en varias páginas. `data_source`: `manual` (JSON) · `database` · `auto_by_category`.

## 7.5 Layout y estilo

`layout_preset`: `2-up` (actual) · `3-up` · `1+2` (uno grande y dos pequeños) · `hero+grid` · `full_band` · `carousel` · `masonry`.
Más: `columns` responsive, `aspect_ratio`, `gap`, `height_mode`, `text_position` (alignment 3×3), `text_bg` (caja tras el texto para legibilidad), `overlay`, `hover_effect` (`zoom`/`lift`/`reveal-cta`/`none`), `CARD_FIELDS`, `CAROUSEL_FIELDS`.

## 7.6 `helpText` en el editor

Cada campo lleva su explicación, y la sección una descripción clara: *"Bloques promocionales con imagen que enlazan a una categoría, un producto o una URL. Úsalos para destacar campañas."* Buena parte de la confusión que reportaste es UX del panel, no del componente.

### Criterios de aceptación F7
- [ ] 3 banners que apuntan a categorías reales, con imagen heredada de la categoría, badge "48 productos" y vigencia hasta fin de mes.
- [ ] Layout `1+2` en desktop y carrusel en móvil.
- [ ] Los banners que hoy vienen del preset siguen viéndose igual.
