# PROGRESS — Multi-Outlet (1 org, N negocios publicables)

> Fuente de verdad persistente del workflow `/loop`.
> Última actualización: 2026-09-01

## Estado global — AUDIT PROFUNDO COMPLETADO, PENDIENTE REVISIÓN

| Fase | Nombre | Rondas | Score previo | Estado | Notas audit 2026-09-01 |
|---|---|---|---|---|---|
| F0 | Fundaciones BD | 2 | 9.5 | **revisar** | HALLAZGO CRÍTICO: 3 constraints UNIQUE existentes chocan con multi-outlet |
| F1 | Resolución Outlet | 3 | 9.5 | **revisar** | middleware detecta custom_domain; getWebsitePageBySlug(orgId, slug) sin branch |
| F2 | Theme Override | 1 | 9.0 | **revisar** | handleSave usa arrays hardcoded headerConfigKeys/footerKeys |
| F3 | Catálogo Outlet | 3 | 9.5 | **revisar** | getMenuProducts ya trae stock_levels con branch_id |
| F4 | Editor Multi-Outlet | 3 | 9.5 | **revisar** | getPages(organizationId) sin branch; handleSave 6 pasos secuenciales |
| F5 | Checkout Outlet | 1 | 9.0 | **revisar** | /api/orders YA acepta branchId (l.25); cart key = cart_${subdomain} |
| F6 | Sucursales Identidad Web | 2 | 9.5 | **revisar** | BranchForm 593 líneas; updateBranch(branchId, branch) firma actual |

## Audit profundo 2026-09-01 — Hallazgos clave

### BD real (verificado vía MCP)

**Constraints UNIQUE que CHOCAN con multi-outlet (DROP obligatorio en F0):**
- `website_settings`: `UNIQUE (organization_id)` — prohíbe múltiples settings por org
- `website_pages`: `UNIQUE (organization_id, slug)` — prohíbe mismo slug en distintos outlets
- `categories`: `UNIQUE (organization_id, slug)` — prohíbe mismo slug en distintos outlets

**Datos actuales:**
- 84 branches, 81 website_settings (1:1 con org), 1046 website_pages, 1870 sections, 775 categories
- branches: la mayoría con `branch_type=NULL`; solo 1 con `branch_type='main'` (org 46)
- organization_domains: 20+ dominios verificados (system_subdomain + custom_domain)
- RLS: todas las tablas web tienen policies org-scoped + `Allow anon select` para público

### goadmin-websites (sitio público)

**Routing `[[...slug]]/page.tsx`:**
- `getOrganizationFromHeaders()` lee `x-subdomain` / `x-custom-domain` (inyectados por middleware)
- `getWebsitePageBySlug(organization.id, currentSlug)` — busca solo por org+slug, sin branch
- Switch fallback: `menu`, `productos`, `espacios`, `servicios`, `contacto`, `nosotros`
- `force-dynamic` + `revalidate=60` — render dinámico en cada request

**Middleware:**
- `*.goadmin.io` → extrae subdomain
- Cualquier otro dominio → `isCustomDomain=true` (ya soporta custom domains)
- Inyecta `x-subdomain` o `x-custom-domain`

**Queries (66 funciones exportadas):**
- `getOrganizationByHost(identifier)` — resuelve org por subdomain o custom_domain
- `getWebStockBranchIds(orgId)` — ya identifica sucursales web
- `getOrganizationProducts` — ya trae `stock_levels` con `branch_id`
- `getMenuProducts` — ya trae `stock_levels` con `branch_id`
- `getWebsitePageBySlug(orgId, slug)` — sin branch_id

**API routes (74 archivos):**
- `/api/orders` POST: YA acepta `branchId` en body (l.25); fallback `is_web_stock_source` → `is_main` → primera
- `/api/products/stock`: fija `is_main=true` (l.25-31)
- Webhooks (wompi/stripe/payu/paypal/mercadopago/bold): leen `web_orders.branch_id`

**Carrito:**
- `CheckoutWizard.tsx`: payload a `/api/orders` NO envía `branchId` actualmente
- Cart key: `cart_${subdomain}` — sin branch_id
- QR dine-in: `dine_in_table_${subdomain}`

### go-admin-erp (editor + servicios)

**Editor branding `[pageId]/page.tsx` (1083 líneas):**
- `handleSave` (l.580-746): 6 pasos secuenciales
- Separa settings con arrays hardcoded: `headerConfigKeys`, `footerKeys`
- `useHistory` para undo/redo (50 pasos)
- `pending*` refs para cambios diferidos

**websiteSettingsService (17 métodos):**
- Todos scopados por `organizationId` — sin branch_id
- `getSettings(orgId)`, `updateTheme(orgId, theme)`, `updateHeaderConfig(orgId, config)`, etc.

**websitePageBuilderService (28 métodos):**
- `getPages(organizationId)` — sin branch
- `getPageWithSections(pageId)` — sin validación de org
- `createPage(page)`, `updatePage(pageId, updates)`, etc.

**branchService (16 métodos):**
- `updateBranch(branchId, branch)` — firma actual
- `getAccessibleBranches(orgId)` — maneja roles
- `findNearestBranch(orgId, lat, lng)` — ya existe

**BranchForm (593 líneas):**
- `branch_code` readOnly
- `is_main`, `is_active`, `is_web_stock_source` forzados true en signup
- `opening_hours` y `features` serializados a JSON

**web-orders API:**
- POST requiere `organization_id` + `branch_id`
- Rollback manual si falla `web_order_items`
- `promotionEngine.evaluate` ya recibe `branch_id`

## Próximos pasos
1. **Revisar y actualizar F0-F6** con hallazgos del audit profundo.
2. **Esperar autorización del usuario** para iniciar implementación de F0.
3. F0: aplicar migraciones BD vía MCP (incluye DROP de 3 constraints + CREATE nuevos).
4. F1-F6: implementar en orden de dependencia.
5. Cada fase implementada debe pasar lint + tsc + tests antes de aprobar.
