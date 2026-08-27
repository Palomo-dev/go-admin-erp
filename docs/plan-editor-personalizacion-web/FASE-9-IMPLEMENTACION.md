# FASE 9 — Implementación: Páginas de detalle y flujo editables

> Vuelve al [PLAN.md](./PLAN.md) · Especificación: [FASE-9-10-PAGINAS-Y-REVIEWS.md](./FASE-9-10-PAGINAS-Y-REVIEWS.md)

---

## Resumen

La FASE 9 hace editables las pantallas que más convierten —detalle de producto, categoría, carrito, checkout— descomponiéndolas en secciones registradas en el editor, con **cero regresión** para los 79 sitios existentes.

## Cambios de base de datos

### 1. Constraint `website_pages_page_type_check`
Ampliado para aceptar los nuevos `page_type`:
- `product_detail`, `category_detail`, `cart`, `checkout`, `order_confirmation`, `space_detail`, `account`

### 2. Columna `page_settings` (JSONB)
Añadida a `website_pages` para guardar ajustes de layout a nivel de página:
- `columns`: `'1'` | `'2'` | `'2+sidebar'`
- `gallery_width`: porcentaje o fracción
- `sticky_column`: boolean (columna derecha pegajosa al scroll)

### 3. Filas sembradas
79 organizaciones × 7 page_types = 553 filas nuevas, cada una con slug interno `__<page_type>` (prefijo doble underscore para evitar colisión con rutas reales). Ninguna aparece en header/footer (`show_in_header=false`, `show_in_footer=false`).

## Archivos modificados

### Sitio (`goadmin-websites`)

| Archivo | Cambio |
|---|---|
| `types/database.ts` | `page_type` ampliado + campo `page_settings` |
| `lib/supabase/queries.ts` | Nueva función `getWebsitePageByType(orgId, pageType)` |
| `components/sections/SectionRenderer.tsx` | 7 secciones registradas en `SECTION_MAP` |
| `components/sections/product-detail/ProductGallery.tsx` | **Nuevo** — galería configurable |
| `components/sections/product-detail/ProductInfo.tsx` | **Nuevo** — bloques ordenables (sku, title, rating, price, etc.) |
| `components/sections/product-detail/ProductActions.tsx` | **Nuevo** — acciones (add to cart, comprar) |
| `components/sections/product-detail/ProductBenefits.tsx` | **Nuevo** — repeater {icon, title, description} |
| `components/sections/product-detail/ProductDescription.tsx` | **Nuevo** — descripción con layout |
| `components/sections/product-detail/RelatedProductsSection.tsx` | **Nuevo** — productos relacionados |
| `components/sections/product-detail/ProductReviewsSection.tsx` | **Nuevo** — reseñas (delega a F10) |
| `components/sections/product-detail/ProductDetailRenderer.tsx` | **Nuevo** — orquestador con fallback |
| `app/productos/[id]/page.tsx` | Busca plantilla `product_detail`; si tiene secciones usa renderer, si no, layout hardcodeado. Añade BreadcrumbList JSON-LD |
| `app/categorias/[slug]/page.tsx` | Añade ItemList JSON-LD |

### ERP (`go-admin-erp`)

| Archivo | Cambio |
|---|---|
| `src/lib/services/websitePageBuilderService.ts` | 6 secciones de producto en `RAW_CATALOG`; `WebsitePage.page_settings`; `createPage` acepta `page_type`; nuevo método `getPreviewEntities()` |
| `src/components/organization/branding/editor/EditorHeader.tsx` | Dropdown agrupado: Páginas · Plantillas de detalle · Flujo de compra; selector de entidad de preview |
| `src/app/organizacion/branding/editor/[pageId]/page.tsx` | Estado `previewEntityId`/`previewEntities`; URL de preview adaptada por `page_type` |

## Patrón de renderizado (cero regresión)

```
app/productos/[id]/page.tsx
  ├── getWebsitePageByType(orgId, 'product_detail')
  ├── si templatePage.website_page_sections.length > 0
  │     └── <ProductDetailRenderer templatePage={...} />
  │           └── mapea secciones → <SectionRenderer data={productData} />
  └── else (sin secciones)
        └── layout hardcodeado actual (idéntico al de hoy)
```

Las 79 organizaciones tienen filas `product_detail` **sin secciones** → ven exactamente la página de hoy.

## JSON-LD añadido (F9.5)

- **Producto**: `Product` + `Offer` + `BreadcrumbList` (ya existía Product+Offer; BreadcrumbList es nuevo)
- **Categoría**: `ItemList` con posición, nombre y URL de cada producto

## Selector de contexto (F9.4)

Al editar una plantilla `product_detail`/`category_detail`/`space_detail`, el editor muestra un dropdown para elegir qué entidad real previsualizar. La URL de preview se construye como:
- `product_detail` → `/productos/<uuid>`
- `category_detail` → `/categorias/<slug>`
- `space_detail` → `/espacios/<slug>`
- `cart` → `/carrito`
- `checkout` → `/checkout`
- etc.

## Límites respetados

1. **Cero regresión**: una organización sin secciones en su plantilla ve exactamente la página de hoy.
2. **Lógica transaccional no expuesta**: checkout, pagos, validaciones no se exponen al editor. Las plantillas `cart`/`checkout`/`order_confirmation` existen como filas pero su descomposición en secciones es trabajo futuro (F9 las siembra; la descomposición detallada de carrito/checkout es prioridad 3-4 del plan).
3. **`product_reviews`**: la sección existe y delega al componente actual. La expansión a sistema dual es FASE 10.

## Verificación

- `npm run build` en `goadmin-websites`: ✅ exitoso
- `npm run build` en `go-admin-erp`: ✅ exitoso
- `tsc --noEmit` en `goadmin-websites`: ✅ sin errores
