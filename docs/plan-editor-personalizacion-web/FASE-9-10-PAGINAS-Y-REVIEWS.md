# FASES 9–10 — Páginas de detalle editables y sistema dual de reseñas

> Vuelve al [PLAN.md](./PLAN.md) · Dependen de [FASE 0 y 2](./FASE-0-FUNDACIONES.md)

---

# FASE 9 — Páginas de detalle y de flujo, editables

**Problema que resuelve:** P10. Hoy el selector de páginas del editor solo lista páginas de **listado**. Las pantallas que más convierten —detalle de producto, checkout— son JSX hardcodeado y no se pueden tocar.

## 9.1 Alcance y orden

| Plantilla (`page_type`) | Pantalla actual | Qué se puede personalizar | Prioridad |
|---|---|---|---|
| `product_detail` | `app/productos/[id]/page.tsx` (341 líneas) | Todo: orden, bloques, estilo, secciones extra | 1 |
| `category_detail` | `app/categorias/[slug]/CategoryPageClient.tsx` | Cabecera, filtros, grid, cards, banners intercalados | 2 |
| `cart` | `app/carrito` | Estilo, textos, bloques de confianza, upsell | 3 |
| `checkout` | `app/checkout` (`CheckoutWizard`) | Estilo, textos, orden de pasos, sellos, métodos visibles | 3 |
| `order_confirmation` | `app/pedido`, `app/tracking`, `app/consultar-pedido` | Todo salvo los datos del pedido | 4 |
| `space_detail` / `reservation` | `app/espacios`, `app/reserva`, `app/agendar` | Estilo, textos, bloques informativos | 4 |
| `account` | `app/mi-cuenta` | Estilo, qué pestañas se muestran | 5 |

**Límite firme:** en `cart`, `checkout` y `reservation` la personalización cubre **estilo, textos, orden de bloques y bloques decorativos** (garantías, métodos de pago, sellos de confianza, upsell). La lógica transaccional (cálculo de totales, impuestos, pasarela, validaciones) **no** se expone al editor. Hacer editable un motor de pago es pedir un incidente.

## 9.2 Patrón común (idéntico en las 7 plantillas)

1. **Nuevo `page_type`** en `website_pages`. Una fila por organización (`product_detail` y `category_detail` admiten override opcional por categoría vía `linked_category_id`, que ya existe en la tabla).
2. **Descomponer** el JSX actual en secciones registradas en `SECTION_MAP`, **sin cambiar el aspecto por defecto**: la plantilla por defecto reproduce exactamente el orden actual.
3. **Renderer con fallback**: `ProductDetailRenderer` busca la plantilla; si no existe, renderiza el layout hardcodeado de hoy. **Cero regresión** para los 480 sitios existentes (regla E.0.5 del plan).
4. **Feature flag por organización** para activar la plantilla progresivamente.
5. **Selector de contexto** en el editor: `?preview_entity=<id>` para ver la plantilla con un producto/categoría/espacio real.
6. **Agrupar el desplegable** de `EditorHeader` en: *Páginas* · *Plantillas de detalle* · *Flujo de compra*.

## 9.3 Detalle de producto: secciones nuevas

Descomposición de `app/productos/[id]/page.tsx:183-338`:

| Sección nueva | Contenido actual | Campos configurables |
|---|---|---|
| `product_gallery` | `ProductImageGallery` | `layout` (thumbs abajo/izquierda/grid/carrusel/stacked), `zoom` (hover/click/lightbox/none), `aspect_ratio`, `show_video`, `show_badges`, `thumb_size`, `CAROUSEL_FIELDS` |
| `product_info` | SKU, título, rating, precio, countdown, descripción | **repeater `blocks` ordenable**: `sku`, `title`, `rating`, `price`, `savings`, `countdown`, `short_description`, `variants`, `modifiers`, `quantity`, `stock`, `share`. Cada bloque con visibilidad y estilo |
| `product_actions` | `ProductDetailActions` | `buttons` (repeater), posición, sticky en móvil |
| `product_benefits` | grid 2×2 hardcodeado (envío, garantía, empaque, calidad) | repeater `{icon, title, description}` con `IconField` — hoy son 4 fijos que nadie puede cambiar |
| `product_description` | `ExpandableDescription` | `layout` (acordeón/tabs/completo), `max_height`, `show_specs` |
| `product_specs` | — (nuevo) | tabla de atributos del producto |
| `product_reviews` | `ProductReviews` | ver FASE 10 (incluye el selector de fuente de reseñas) |
| `related_products` | `RelatedProducts` | fuente (categoría/tag/manual/comprados juntos), `max_items`, `GRID_FIELDS`, `CARD_FIELDS` |
| `product_faq` | — (nuevo) | repeater, con JSON-LD `FAQPage` |
| `product_shipping` | — (nuevo) | info de envío y devoluciones |

**Layout de la página:** `columns` (1 / 2 / 2+sidebar), ancho de la galería, `sticky_column` (derecha pegajosa al hacer scroll).

**Además:** el usuario puede insertar **cualquier sección genérica** (texto, galería, CTA, testimonios, banners) en el detalle. Eso es lo que pediste con "si le quiero agregar otra sesión".

## 9.4 Detalle de categoría

Secciones: `category_header` (título, descripción, imagen de portada, breadcrumb), `category_filters` (posición: barra superior / sidebar izquierdo / drawer móvil; qué filtros), `category_products` (reutiliza `products_grid` con `CARD_FIELDS`), `category_subcategories` (reutiliza `CategoriesSection` de la F4), `promo_banners` intercalado cada N productos, `category_seo_text` (bloque de texto al pie, útil para SEO).

## 9.5 Carrito y checkout

Bloques permitidos: `cart_items` (estilo de fila, mostrar imagen/variantes/notas), `cart_summary` (orden de líneas, textos), `cart_upsell` ("también te puede interesar"), `trust_badges` (repeater con iconos: pago seguro, envío, devoluciones), `payment_methods_strip` (logos de pasarelas), `coupon_box`, `shipping_estimator`, `empty_cart` (mensaje y CTA cuando está vacío), `checkout_steps` (etiquetas de pasos, estilo del indicador).

## 9.6 SEO y datos estructurados

Al descomponer en secciones, añadir JSON-LD generado desde los datos reales: `Product` + `Offer` + `BreadcrumbList` en detalle de producto, `ItemList` en categoría, `Restaurant` / `LocalBusiness` según la vertical. Y `sitemap.xml` por organización con productos y categorías publicados.

> Sobre `AggregateRating`: ver la regla de 10.7 — solo se emite cuando la fuente de reseñas activa es real.

### Criterios de aceptación F9
- [ ] Mover reviews arriba de la descripción, ocultar "beneficios" y agregar una sección de texto, sin tocar código.
- [ ] Entrar desde el mismo selector a la página de categoría y a la de checkout.
- [ ] Cambiar los 4 beneficios hardcodeados por otros con iconos propios.
- [ ] Una organización sin plantilla ve exactamente la página de hoy.
- [ ] JSON-LD válido según Rich Results Test.

---

# FASE 10 — Sistema dual de reseñas (generadas + reales, a elección del usuario)

**Decisión de negocio (E.1):** las reseñas generadas actuales **se mantienen y siguen funcionando exactamente igual**. Esta fase **añade** la opción de reseñas reales y deja que cada organización elija desde el editor cuál usar. No se elimina nada.

## 10.1 Qué hay hoy (se conserva intacto)

`components/site/ProductReviews.tsx:9-100` genera reseñas en el cliente a partir de arrays de nombres, apellidos, ciudades y comentarios, combinados con `seededRandom` para que sean consistentes entre recargas. `ReviewSummaryBadge` calcula el promedio de esos datos.

**Ese código no se borra ni se modifica en su lógica.** Se **extrae tal cual** a un proveedor (`providers/generatedReviews.ts`) para que pueda convivir con el proveedor de reseñas reales. Copiar y pegar, no reescribir.

## 10.2 Arquitectura: un componente, tres fuentes

```
components/site/reviews/
  ProductReviews.tsx            # orquestador: elige proveedor según config
  ReviewSummaryBadge.tsx        # igual que hoy, alimentado por el orquestador
  providers/
    generatedReviews.ts         # ← el seededRandom actual, movido sin cambios
    realReviews.ts              # ← nuevo: consulta product_reviews
    mixedReviews.ts             # ← combina ambos según la política elegida
  ReviewList.tsx  ReviewCard.tsx  ReviewForm.tsx  RatingDistribution.tsx
```

El orquestador expone siempre la misma forma de datos, así que el resto de la UI no distingue el origen.

## 10.3 El selector en el editor

Campo `reviews_source` en la sección `product_reviews` (grupo **Datos**):

| Valor | Comportamiento | Cuándo usarlo |
|---|---|---|
| `generated` | **Default.** Exactamente lo de hoy. | Tiendas nuevas, sin historial |
| `real` | Solo reseñas de `product_reviews` aprobadas. Si no hay, estado vacío con CTA. | Tiendas con clientes reales |
| `mixed` | Muestra las reales primero y completa hasta `min_visible` con generadas. | Transición |
| `auto` | Usa generadas hasta que el producto acumule `auto_switch_threshold` reseñas reales; a partir de ahí, solo reales. | **La opción recomendada**: arranca lleno y migra solo, producto por producto |

Campos de apoyo:

| Campo | Tipo | Notas |
|---|---|---|
| `auto_switch_threshold` | number (default 3) | `showIf: reviews_source = auto` |
| `min_visible` | number | cuántas completar en `mixed` |
| `rating_source` | select: `same_as_reviews` \| `real_only` \| `generated_only` | de dónde sale el promedio del badge |
| `show_generated_disclaimer` | boolean | muestra un pie del tipo "Reseñas de muestra" — **opcional, apagado por defecto** |
| `generated_count` | number | cuántas generar (hoy es fijo en el código) |
| `generated_rating_range` | range doble | rango de estrellas de las generadas |
| `generated_names_pool` | select | `colombia` (actual) \| `mexico` \| `españa` \| `neutro` — hoy los nombres colombianos están fijos y no sirven a un cliente de otro país |

**Configuración por defecto para sitios existentes:** `reviews_source = 'generated'` y el resto de valores replicando las constantes actuales del componente. Resultado: **cero cambio visual** en los 480 sitios.

## 10.4 Tabla `product_reviews` (solo si se activa el modo real)

```sql
create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references organizations(id) on delete cascade,
  product_id integer not null references products(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  order_id uuid,                          -- web_orders.id o sales.id
  author_name text not null,
  author_city text,
  rating smallint not null check (rating between 1 and 5),
  title text,
  content text,
  images text[],
  is_verified_purchase boolean not null default false,
  status text not null default 'pending', -- pending | approved | rejected
  rejection_reason text,
  reply_text text, reply_at timestamptz, reply_by uuid,
  helpful_count integer not null default 0,
  reported_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on product_reviews (product_id, status);
alter table public.product_reviews enable row level security;
```

**RLS:**
- Lectura pública: solo `status = 'approved'`.
- Inserción: cliente autenticado con compra verificada de ese producto, o vía token de un solo uso enviado por email.
- `status` y `reply_*`: solo miembros de la organización.

**Agregados sin N+1:** columnas `rating_avg numeric(3,2)` y `reviews_count integer` en `products`, mantenidas por trigger sobre `product_reviews` contando solo `approved`. Necesarias para el modo `auto` (saber cuándo cambiar), para ordenar por valoración y para pintar el rating en las cards de la F5 sin una consulta por producto.

## 10.5 Flujo de captura de reseñas reales

1. Pedido entregado (`web_orders.delivered_at` o venta en `sales`) → job que a los N días envía email con token de reseña.
2. `POST /api/reviews` valida el token y la compra, e inserta como `pending` (o `approved` si la organización desactiva la moderación).
3. Moderación en el ERP: bandeja de aprobar / rechazar / responder, con filtro por producto y calificación.
4. Aviso al comercio cuando llega una reseña de 1–2 estrellas.

Todo esto solo se activa si la organización usa `real`, `mixed` o `auto`. Una tienda en modo `generated` no ve nada de esto.

## 10.6 Personalización visual de la sección (aplica a las tres fuentes)

`layout` (lista / grid / carrusel), `reviews_per_page`, `default_sort` (recientes / útiles / mejor / peor), `show_distribution` (barras por estrella), `show_photos`, `allow_photos`, `show_reply`, `show_verified_badge`, `star_style`, `star_color`, `card_style` (`CARD_FIELDS`), `empty_state_title`, `empty_state_message`, `empty_state_cta`.

## 10.7 Regla única sobre JSON-LD

`AggregateRating` en los datos estructurados se emite **solo cuando `rating_source` resuelve a datos reales** (`real_only`, o `same_as_reviews` con `reviews_source` en `real`/`auto` ya conmutado). En modo `generated` la sección se muestra normalmente en la web pero **no se declara como calificación agregada a Google**.

Es la única restricción técnica que mantengo, y no es por criterio estético: publicar `AggregateRating` sin reseñas verificables es causa conocida de acción manual de Google sobre el dominio, lo que afectaría el posicionamiento del sitio del cliente. La visualización en la web queda tal cual está hoy.

## 10.8 Sin migración

No hay datos que migrar: las reseñas actuales se generan en cada carga y no viven en ninguna tabla. La fase es puramente aditiva y se puede aplazar sin bloquear ninguna otra.

### Criterios de aceptación F10
- [ ] Un sitio existente, sin tocar nada, muestra **exactamente** las mismas reseñas que hoy.
- [ ] El editor permite elegir entre generadas, reales, mixtas y automáticas.
- [ ] En modo `real` sin reseñas: estado vacío configurable, no error ni sección rota.
- [ ] En modo `auto`: al llegar a 3 reseñas reales de un producto, ese producto deja de mostrar generadas sin intervención.
- [ ] Se puede cambiar el número, el rango de estrellas y el origen de los nombres de las reseñas generadas.
- [ ] Moderación funcional en el ERP para el modo real.
- [ ] `AggregateRating` solo se emite con datos reales.
