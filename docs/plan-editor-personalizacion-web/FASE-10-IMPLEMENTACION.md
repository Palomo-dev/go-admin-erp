# FASE 10 — Sistema dual de reseñas: implementación

> Vuelve al [PLAN.md](./PLAN.md) · Ver [FASE-9-10-PAGINAS-Y-REVIEWS.md](./FASE-9-10-PAGINAS-Y-REVIEWS.md)

## Qué se hizo

### F10.1 — Extracción de generatedReviews
- **Archivo:** `goadmin-websites/components/site/reviews/providers/generatedReviews.ts`
- Se extrajo **tal cual** (copiar y pegar, sin reescribir) toda la lógica de generación de reseñas del `ProductReviews.tsx` original: arrays de nombres, apellidos, ciudades, comentarios positivos/neutros/negativos, función `seededRandom` y función `generateReviews`.
- Se añadió un wrapper `getGeneratedReviews()` que devuelve `ReviewsResult` con la misma forma que los demás providers.
- El `ProductReviews.tsx` original **permanece intacto** (regla E.1: no se elimina ni reescribe).

### F10.2 — Arquitectura de orquestador
Estructura creada en `goadmin-websites/components/site/reviews/`:

| Archivo | Función |
|---|---|
| `types.ts` | Tipos compartidos: `ReviewItem`, `ReviewsResult`, `ReviewsConfig`, `resolveReviewsConfig()`, `shouldEmitAggregateRating()` |
| `ProductReviews.tsx` | **Orquestador**: elige provider según `reviews_source`, renderiza la UI idéntica al original |
| `ReviewSummaryBadge.tsx` | Badge de resumen — en modo `generated` usa la lógica original; en modo `real` usa agregados de `products` |
| `ReviewList.tsx` | Lista con paginación (igual al diseño original) |
| `ReviewCard.tsx` | Tarjeta individual — soporta imágenes y respuestas del comercio (solo reales) |
| `ReviewForm.tsx` | Formulario para escribir reseña |
| `RatingDistribution.tsx` | Barras de distribución por estrella |
| `providers/generatedReviews.ts` | Provider de reseñas generadas (extracción tal cual) |
| `providers/realReviews.ts` | Provider de reseñas reales — consulta `product_reviews` con `status='approved'` |
| `providers/mixedReviews.ts` | Provider mixto + automático — combina reales y generadas según política |

**Cero cambio visual:** el orquestador con `reviews_source='generated'` (default) usa exactamente la misma lógica de `getReviewStats` + `generateReviews`, produciendo salidas idénticas.

### F10.3 — Selector en el editor
- **Archivo ERP:** `src/lib/services/websitePageBuilderService.ts`
- Se añadió la sección `product_reviews` al `RAW_CATALOG` con variantes `['default']`.
- Campos del grupo **data**:
  - `reviews_source` (select: `generated` | `real` | `mixed` | `auto`, default `generated`)
  - `auto_switch_threshold` (number, default 3, `showIf: reviews_source=auto`)
  - `min_visible` (number, default 10, `showIf: reviews_source in [mixed, auto]`)
  - `rating_source` (select: `same_as_reviews` | `real_only` | `generated_only`)
  - `show_generated_disclaimer` (boolean, default false)
  - `generated_count` (number, `showIf: reviews_source in [generated, mixed, auto]`)
  - `generated_names_pool` (select: `colombia` | `mexico` | `espana` | `neutro`)
- Campos del grupo **content**: `empty_state_title`, `empty_state_message`, `empty_state_cta`
- La sección aparece automáticamente en el `AddSectionDialog` del editor.

### F10.4 — Tabla product_reviews
- **Migración:** `supabase/migrations/20260115000000_product_reviews.sql`
- Crea la tabla `product_reviews` con todos los campos del plan.
- RLS habilitado:
  - Lectura pública: solo `status='approved'`
  - Inserción: autenticado (validación de compra en API)
  - Update: para moderación (ERP usa service_role)
- Índices en `(product_id, status)` y `(organization_id, status)`.

### F10.5 — Agregados en products
- Columnas `rating_avg numeric(3,2)` y `reviews_count integer` añadidas a `products`.
- Trigger `recalc_product_review_stats()` recalcula tras insert/update/delete, contando solo `approved`.
- Usado por el modo `auto` (saber cuándo conmutar) y por `ReviewSummaryBadge` en modo real.

### F10.6 — Regla JSON-LD
- En `app/productos/[id]/page.tsx` se añadió JSON-LD `Product` + `Offer`.
- `AggregateRating` **solo se emite** cuando `rating_source` resuelve a datos reales:
  - `real_only` con `hasRealData`
  - `same_as_reviews` con `reviews_source != 'generated'` y `hasRealData`
- En modo `generated` no se declara `AggregateRating` (evita acción manual de Google).

## Decisiones de diseño

1. **Extracción sin reescribir:** Los arrays y funciones de `generatedReviews.ts` se copiaron byte a byte del original. Hay duplicación temporal entre el `ProductReviews.tsx` original y `generatedReviews.ts`, pero es lo que pide el plan ("copiar y pegar, no reescribir").
2. **El `ProductReviews.tsx` original no se toca:** Sigue existiendo en `components/site/` con su código original. Solo se cambió el import en `page.tsx` para apuntar al nuevo orquestador.
3. **Provider real es asíncrono:** `realReviews.ts` usa `useEffect` para cargar reseñas asíncronamente. Mientras carga, el orquestador muestra las generadas como placeholder (solo si el modo no es `generated`).
4. **Cast `as any` en queries de product_reviews:** La tabla aún no está en los tipos `Database` generados. Se usa `(supabase as any)` siguiendo el patrón existente en el codebase.
5. **Config desde `website_settings.product_reviews`:** La configuración de reseñas se lee de `organization.website_settings.product_reviews`. Cuando no existe (todos los sitios actuales), `resolveReviewsConfig(null)` devuelve el default `generated`.

## Pendientes

- **Ejecutar migración SQL** en Supabase (tabla `product_reviews` + columnas en `products`).
- **Regenerar tipos `Database`** del sitio tras la migración (para eliminar los casts `as any`).
- **F10.5 Flujo de captura:** Endpoint `POST /api/reviews`, job de email post-entrega, bandeja de moderación en el ERP.
- **Pools de nombres:** `generated_names_pool` solo tiene `colombia` implementado. Faltan `mexico`, `espana`, `neutro`.
- **`generated_rating_range`:** Definido en tipos pero no conectado al `generateReviews` (actualmente usa rango fijo 4.4-4.9).
- **Sección `product_reviews` en `SECTION_MAP` del sitio:** La sección del editor está definida en el catálogo del ERP, pero el sitio no la renderiza vía `SectionRenderer` (eso es FASE 9). Por ahora, el orquestador se usa directamente en `page.tsx`.
