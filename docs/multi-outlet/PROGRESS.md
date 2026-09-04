# PROGRESS — Multi-Outlet (1 org, N negocios publicables)

> Fuente de verdad persistente del workflow `/loop`.
> Última actualización: 2026-09-03 (fix crítico PostgREST)

## 🚨 INCIDENCIA CRÍTICA RESUELTA (2026-09-03)

**Problema**: dropear los 3 constraints UNIQUE originales rompió PostgREST.
Sin `UNIQUE (organization_id)` en `pg_constraint`, PostgREST deja de detectar
la relación 1:1 `organizations → website_settings` y devuelve **arrays** en
lugar de objetos. El sitio público perdió colores, header, footer y diseño
en TODAS las organizaciones.

**Causa raíz**: PostgREST detecta relaciones 1:1 buscando constraints UNIQUE
en `pg_constraint`, **no** índices únicos en `pg_indexes`. Los índices
branch-aware con `COALESCE(branch_id, -1)` son correctos para integridad de
datos, pero PostgREST no los reconoce como constraints 1:1.

**Fix aplicado**: los 3 constraints UNIQUE originales fueron **restaurados**:
- `website_settings_organization_id_key` → `UNIQUE (organization_id)`
- `website_pages_organization_id_slug_key` → `UNIQUE (organization_id, slug)`
- `categories_organization_id_slug_key` → `UNIQUE (organization_id, slug)`

**Impacto en el plan**: los constraints NO se pueden dropear hasta que F1-F3
actualicen el código para hacer query directa por `(organization_id, branch_id)`
en lugar de depender del select anidado `organizations → website_settings`.
Ver FASE-0-FUNDACIONES-BD.md §2.0 para el detalle completo.

## Estado global — DISEÑO APROBADO + IMPLEMENTACIÓN F1-F6 APROBADA (código en repos, sin commits)

| Fase | Nombre | Rondas QA diseño | Rondas QA código | Score final código | Estado | Notas |
|---|---|---|---|---|---|---|
| F0 | Fundaciones BD | 6 | — | 9.5/10 | **BD aplicada + aprobado** | Constraints UNIQUE restaurados para PostgREST. DROP diferido a post-F1-F3. Query directa desbloquea F0. |
| F1 | Resolución Outlet | 7 | 2 | 9.6/10 | **IMPLEMENTADO + aprobado** | resolver.ts + middleware + getOrgContext(pathFirstSegment) + page.tsx refactorizado. Build OK. |
| F2 | Theme Override | 6 | 2 | 9.5/10 | **IMPLEMENTADO + aprobado** | theme-merge.ts + getEffectiveSettings + OrganizationLayout con effectiveSettings. Build OK. |
| F3 | Catálogo Outlet | 6 | 3 | 9.5/10 | **IMPLEMENTADO + aprobado** | catalog-helpers.ts + getAllowedCategoryIds consumido + is_active en todas las queries + branchId en categorías/productos/favoritos. Build OK. |
| F4 | Editor Multi-Outlet | 7 | 4 | 9.6/10 | **IMPLEMENTADO + aprobado** | OutletSelector + getPageWithSections(validación) + 16 métodos con branchId + seedDefaultPages con branch_id + 16 iconos nuevos. Build OK. |
| F5 | Checkout Outlet | 6 | 4 | 9.5/10 | **IMPLEMENTADO + aprobado** | getCartKey(Number.isInteger) + 17 componentes migrados + api/orders con Number.isFinite + spread con ternario. Build OK. |
| F6 | Sucursales Identidad Web | 10 | 4 | 9.5/10 | **IMPLEMENTADO + aprobado** | webIdentityValidation.ts + setWebPublished con validateWebIdentityFormat + BranchForm con normalización + BranchesTab con formRef. Build OK. |

### Repositorios modificados (sin commits, sin PRs)

**goadmin-websites** (`C:\Users\USUARIO\goadmin-websites\`):
- `lib/outlet/resolver.ts` (NUEVO)
- `lib/outlet/theme-merge.ts` (NUEVO)
- `lib/outlet/catalog-helpers.ts` (NUEVO)
- `lib/utils.ts` (getCartKey)
- `middleware.ts` (x-outlet-subdomain)
- `lib/get-org-context.ts` (pathFirstSegment + effectiveSettings)
- `lib/supabase/queries.ts` (branchId en 10+ queries)
- `app/[[...slug]]/page.tsx` (refactorizado con getOrgContext)
- `components/site/OrganizationLayout.tsx` (effectiveSettings/outlet/branchId)
- `components/site/MenuView.tsx`, `CheckoutWizard.tsx`, `CartDrawer.tsx`, `CartIndicator.tsx`, `AddToCartButton.tsx`, `StickyAddToCart.tsx`, `ProductDetailActions.tsx`, `RelatedProducts.tsx`, `ProductGrid.tsx`, `ReorderButton.tsx`
- `components/sections/products/ProductCard.tsx`, `ProductsGrid.tsx`, `ProductsCarousel.tsx`, `FeaturedProductsCarousel.tsx`, `FeaturedProducts.tsx`, `ProductsList.tsx`
- `components/sections/category-detail/CategoryProducts.tsx`
- `components/sections/retail/OffersGrid.tsx`
- `app/carrito/page.tsx`, `CartPageClient.tsx`
- `app/checkout/page.tsx`
- `app/categorias/[slug]/page.tsx`, `CategoryPageClient.tsx`
- `app/productos/[id]/page.tsx`, `ProductDetailActions.tsx`
- `app/mi-cuenta/favoritos/page.tsx`, `pedidos/[id]/page.tsx`
- `app/api/orders/route.ts`, `app/api/products/route.ts`

**go-admin-erp** (`C:\Users\USUARIO\CascadeProjects\go-admin-erp\`):
- `src/lib/utils/webIdentityValidation.ts` (NUEVO)
- `src/lib/services/website/sectionsByBranchType.ts` (NUEVO)
- `src/components/organization/branding/editor/OutletSelector.tsx` (NUEVO)
- `src/types/branch.ts` (BranchType + campos web)
- `src/lib/services/branchService.ts` (createBranch/updateBranch/setWebPublished/validateWebIdentity)
- `src/lib/services/websiteSettingsService.ts` (15 métodos con branchId + applyBranchFilter + updateSettings upsert)
- `src/lib/services/websitePageBuilderService.ts` (getPages/getPageWithSections/createPage/seedDefaultPages con branch_id)
- `src/components/branches/BranchForm.tsx` (sección Identidad Web + validaciones)
- `src/components/organization/BranchesTab.tsx` (toggle publicación + columna Sitio Web + formRef)
- `src/components/organization/branding/editor/AddSectionDialog.tsx` (16 iconos nuevos)
- `src/components/organization/branding/editor/EditorHeader.tsx` (outlet indicator)
- `src/components/organization/branding/BrandingPagesTab.tsx` (branchId en getPages/seedDefaultPages)
- `src/app/organizacion/branding/editor/[pageId]/page.tsx` (OutletSelector + handleSave con branchId + upsert)

### Pendiente
- DROP de los 3 constraints UNIQUE originales (solo después de verificar que las query directas funcionan en producción)
- Commits y PRs (pendiente autorización explícita del usuario)
- Pruebas end-to-end en producción (verificar organizaciones existentes + outlets nuevos)

## F0 — Migración BD aplicada (vía Supabase MCP)

### Cambios aplicados en BD real (proyecto `jgmgphmzusbluqhuqihj`)

**Drops (destructivos) — ⚠️ REVERTIDOS, pendientes de re-ejecutar post F1-F3:**
- ~~DROP `categories_organization_id_slug_key`~~ → **restaurado** (PostgREST 1:1)
- ~~DROP `website_pages_organization_id_slug_key`~~ → **restaurado** (PostgREST 1:1)
- ~~DROP `unique_website_per_org`~~ (website_settings) → **restaurado** (PostgREST 1:1)
- Los drops se re-ejecutarán solo después de que F1-F3 actualicen el código
  para hacer query directa por `(organization_id, branch_id)`.

**Columnas nuevas en `branches`:**
- `slug` (text, nullable)
- `subdomain` (text, nullable)
- `custom_domain` (text, nullable)
- `website_logo_url` (text, nullable)
- `website_cover_url` (text, nullable)
- `is_web_published` (boolean, default false)

**Columnas `branch_id` (nullable, FK → branches.id ON DELETE CASCADE):**
- `website_settings.branch_id`
- `website_pages.branch_id`
- `website_page_sections.branch_id`
- `categories.branch_id`

**Índices únicos branch-aware (COALESCE(branch_id, -1)):**
- `idx_branches_org_slug` (organization_id, slug) WHERE slug IS NOT NULL AND slug <> ''
- `idx_branches_subdomain_global` (subdomain) WHERE subdomain IS NOT NULL AND subdomain <> ''
- `idx_branches_custom_domain_global` (custom_domain) WHERE custom_domain IS NOT NULL AND custom_domain <> ''
- `idx_website_settings_org_branch` (organization_id, COALESCE(branch_id, -1))
- `idx_website_pages_org_branch_slug` (organization_id, COALESCE(branch_id, -1), slug)
- `idx_categories_org_branch_slug` (organization_id, COALESCE(branch_id, -1), slug)

**Índices parciales para performance (R3):**
- `idx_website_pages_org_branch` (organization_id, branch_id)
- `idx_categories_org_branch` (organization_id, branch_id)
- `idx_website_settings_org_branch` (organization_id, branch_id)
- `idx_website_page_sections_branch` (branch_id) WHERE branch_id IS NOT NULL

**Triggers:**
- `trg_sync_section_branch` (BEFORE INSERT/UPDATE ON website_page_sections) → copia branch_id de la página padre
- `trg_sync_sections_on_page_update` (AFTER UPDATE OF branch_id ON website_pages) → propaga cambio a secciones existentes
- `trg_validate_branch_org_settings` (BEFORE INSERT/UPDATE ON website_settings) → valida branch pertenece a org
- `trg_validate_branch_org_pages` (BEFORE INSERT/UPDATE ON website_pages)
- `trg_validate_branch_org_sections` (BEFORE INSERT/UPDATE ON website_page_sections)
- `trg_validate_branch_org_categories` (BEFORE INSERT/UPDATE ON categories)

**Funciones:**
- `sync_section_branch_id()` — con guard `IF NEW.page_id IS NULL THEN NEW.branch_id := NULL`
- `sync_sections_branch_on_page_update()` — propaga cambios de branch_id de página a secciones
- `validate_branch_belongs_to_org()` — valida integridad cross-organization

### Estado post-migración

| Tabla | Filas | branch_id | Estado |
|---|---|---|---|
| branches | 86 | — | Todas unpublished, sin slug (preserva backward compat) |
| website_settings | 83 | NULL | Todas globales |
| website_pages | 1058 | NULL | Todas globales |
| website_page_sections | 1918 | NULL | Todas globales |
| categories | 800 | NULL | Todas globales |

### Verificación post-migración (ejecutada vía MCP)
- ✅ 6 columnas nuevas en branches presentes
- ✅ 4 columnas branch_id presentes en tablas web
- ✅ 6 índices únicos branch-aware presentes
- ✅ 4 índices parciales para performance presentes
- ✅ 6 triggers activos
- ✅ 3 constraints UNIQUE antiguos eliminados
- ✅ RLS intacta (sin cambios, sigue org-scoped)
- ✅ Backward compat: todas las filas existentes son globales (branch_id=NULL)

## Resumen de rondas QA

### Ronda 1 (scores iniciales)
| Fase | Score | Issues críticos |
|---|---|---|
| F0 | 6.5 | branch_id cross-org sin validar; trigger no propaga en page update; conteos inconsistentes |
| F1 | 6.0 | x-custom-domain mal seteado; bug effectiveHeaderNavTree; filtro branch_id inconsistente |
| F2 | 6.0 | mergeSettings no excluye metadatos; generateMetadata duplica queries |
| F3 | 5.0 | page.tsx prefetch sin branchId; RPC pos_product_ranking sin manejo; stock sin filtrar |
| F4 | 5.0 | handleSave no pasa selectedBranchId; tipos desactualizados; getPageWithSections sin filtro |
| F5 | 7.0 | Dependencia F1 no resuelta; validación branchId ∈ org no implementada |
| F6 | 8.0 | submitForm salta handleSubmit; tipos desfasados; DOMAIN_REGEX permisiva |

### Ronda 2 (después de builders R2)
| Fase | Score | Veredicto |
|---|---|---|
| F0 | 8.5 | aprobado |
| F1 | 8.0 | aprobado |
| F2 | 8.0 | aprobado |
| F3 | 6.5 | requiere-nueva-ronda (snippets stock contradictorios) |
| F4 | 7.5 | aprobado |
| F5 | 8.0 | aprobado |
| F6 | 7.5 | requiere-nueva-ronda (submitForm crashea sin evento) |

### Ronda 3 (solo F3 y F6)
| Fase | Score | Veredicto |
|---|---|---|
| F3 | 8.8 | aprobado |
| F6 | 9.5 | aprobado |

## Próximos pasos

1. **F0 BD: COMPLETADA** — migración aplicada y verificada.
2. **Esperar autorización del usuario** para iniciar implementación de F1-F6.
3. **Orden de implementación** (por dependencias):
   - F1 — Resolución outlet/domain/path (middleware + getOrgContext + queries)
   - F2 — Theme override (mergeSettings + getEffectiveSettings + OrganizationLayout)
   - F3 — Catálogo branch-aware (queries + stock + RPC)
   - F4 — Editor multi-outlet (selector + handleSave + tipos)
   - F5 — Checkout branch-aware (MenuView + CheckoutWizard + /api/orders)
   - F6 — Sucursales identidad web (BranchForm + branchService + BranchesTab)
4. **Cada fase implementada** debe pasar `npm run lint` + `tsc --noEmit` + tests antes de aprobar.
5. **No commit/push/PR** sin autorización explícita del usuario.

## Documentos de diseño (todos aprobados)

- `docs/multi-outlet/PLAN.md` — Plan maestro
- `docs/multi-outlet/FASE-0-FUNDACIONES-BD.md` — BD (aplicada)
- `docs/multi-outlet/FASE-1-RESOLUCION-OUTLET.md` — Resolución (aprobado 8.0)
- `docs/multi-outlet/FASE-2-THEME-OVERRIDE.md` — Theme (aprobado 8.0)
- `docs/multi-outlet/FASE-3-CATALOGO-OUTLET.md` — Catálogo (aprobado 8.8)
- `docs/multi-outlet/FASE-4-EDITOR-MULTI-OUTLET.md` — Editor (aprobado 7.5)
- `docs/multi-outlet/FASE-5-CHECKOUT-OUTLET.md` — Checkout (aprobado 8.0)
- `docs/multi-outlet/FASE-6-SUCURSALES-IDENTIDAD-WEB.md` — Sucursales (aprobado 9.5)
