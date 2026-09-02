# Plan Multi-Outlet — 1 organización, N negocios publicables

> Fecha: 2026-09-01 (audit profundo completado)
> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Repos ERP: `C:\Users\USUARIO\CascadeProjects\go-admin-erp`
> Repos Sitio: `C:\Users\USUARIO\goadmin-websites`

## Problema

Una organización (1 NIT, 1 razón social) opera **hotel + 2 restaurantes**. Hoy el sistema es
1:1: 1 org = 1 sitio web = 1 catálogo = 1 theme. No se puede tener:
- Sitio del hotel con motor de reservas + theme elegante
- Menú digital del restaurante 1 con theme propio
- Menú digital del restaurante 2 con theme distinto
- Todo bajo la misma razón social (facturación, inventario, members unificados)

## Diagnóstico verificado (BD real, MCP Supabase — audit 2026-09-01)

| Tabla | Rows | Tiene branch_id | Estado |
|---|---|---|---|
| `branches` | 84 | — (es la tabla) | ✅ existe, tiene `branch_type` (solo 2 con valor), `is_web_stock_source`. **Falta**: slug, subdomain, custom_domain, logo, is_web_published |
| `website_settings` | 81 | ❌ | 1:1 con org. **Falta**: branch_id. **⚠️ Constraint `UNIQUE(organization_id)` debe DROParse en F0** |
| `website_pages` | 1046 | ❌ | **Falta**: branch_id. **⚠️ Constraint `UNIQUE(organization_id, slug)` debe DROParse en F0** |
| `website_page_sections` | 1870 | ❌ | **Falta**: branch_id (heredar de page) |
| `categories` | 775 | ❌ | **Falta**: branch_id. **⚠️ Constraint `UNIQUE(organization_id, slug)` debe DROParse en F0** |
| `products` | 28098 | ❌ | Relación indirecta vía categoría. **Falta**: filtrar por branch |
| `web_orders` | 3364 | ✅ | Ya listo |
| `spaces` | 29 | ✅ | Ya listo (PMS) |
| `restaurant_tables` | 6 | ✅ | Ya listo (POS) |
| `stock_levels` | 19529 | ✅ | Ya listo (inventario) |

**Conclusión**: el backend operativo (POS, PMS, web_orders, stock) **ya es multi-branch**.
El bloqueo es la **capa pública**: website_settings, website_pages, categories son 1:1 con org.

### ⚠️ Constraints UNIQUE que chocan con multi-outlet (verificado 2026-09-01)

| Constraint | Tabla | Definición | Por qué choca |
|---|---|---|---|
| `unique_website_per_org` | `website_settings` | `UNIQUE (organization_id)` | Prohíbe múltiples settings por org (bloquea theme override por outlet) |
| `website_pages_organization_id_slug_key` | `website_pages` | `UNIQUE (organization_id, slug)` | Prohíbe mismo slug en distintos outlets (ej. "menu" en hotel y restaurante-1) |
| `categories_organization_id_slug_key` | `categories` | `UNIQUE (organization_id, slug)` | Prohíbe mismo slug en distintos outlets (ej. "bebidas" en restaurante-1 y restaurante-2) |

**F0 debe DROP estos 3 constraints antes de crear los nuevos índices con `COALESCE(branch_id, -1)`.**
El comportamiento para sitios 1:1 existentes (branch_id=NULL) es idéntico: sigue habiendo
exactamente 1 settings, 1 página por slug, 1 categoría por slug por organización.

### Hallazgos del audit de código (2026-09-01)

**goadmin-websites (sitio público):**
- Middleware ya detecta custom domains (cualquier dominio no-`*.goadmin.io` → `isCustomDomain=true`)
- `getOrganizationByHost(identifier)` resuelve org por subdomain o custom_domain
- `getWebsitePageBySlug(orgId, slug)` — sin branch_id (F1 lo añade)
- `/api/orders` POST **YA acepta `branchId`** en body (l.25); fallback si no viene
- Cart key: `cart_${subdomain}` — sin branch_id (F5 lo añade)
- `getMenuProducts` y `getOrganizationProducts` ya traen `stock_levels` con `branch_id`
- 74 API routes en total; webhooks ya leen `web_orders.branch_id`

**go-admin-erp (editor + servicios):**
- Editor `handleSave` (l.580-746): 6 pasos secuenciales con arrays hardcoded (`headerConfigKeys`, `footerKeys`)
- `websiteSettingsService`: 17 métodos, todos scopados por `organizationId`
- `websitePageBuilderService`: 28 métodos, `getPages(organizationId)` sin branch
- `branchService.updateBranch(branchId, branch)`: 1 sola llamada productiva en `BranchesTab.tsx:210`
- `BranchForm`: 593 líneas, `branch_code` readOnly, `hideStatusSection` para signup
- `/api/web-orders` POST: requiere `organization_id` + `branch_id` explícitos

## Calificación de preparación actual

| Capa | Calificación | Por qué |
|---|---|---|
| BD | 4/10 | branches existe pero sin identidad web; website/catálogo sin branch_id |
| UI | 2/10 | todo 1:1 org→sitio, sin resolución de outlet, sin selector en editor |
| Backend | 3/10 | web_orders ya tiene branch_id pero catálogo/website no |

## Principios

1. **No crear 3 organizaciones separadas** — perderías NIT único, facturación unificada, inventario compartido, members.
2. **Reusar `branches`** como unidad de negocio publicable (outlet).
3. **`branch_id` nullable** en todas las tablas web — `NULL` = global de la org, `X` = exclusivo del outlet.
4. **Theme merge**: `theme = {...orgSettings, ...outletOverride}`. El outlet solo override lo que cambia.
5. **Migraciones vía MCP de Supabase**, nunca archivos `.sql` en el repo.
6. **RLS por `organization_id`** (no por branch_id) — los outlets pertenecen a la misma razón social.
7. **Resolución de outlet** por subdominio (`hotel.tugranhotel.com`) o path (`tugranhotel.com/restaurante-1`).

## Arquitectura objetivo

```
                    tugranhotel.com
                         │
                    hotel (outlet principal)
                    custom_domain='tugranhotel.com'
                         │
           ┌─────────────┼─────────────┐
           │             │             │
      tugranhotel.com  /restaurante-1   /restaurante-2
      (root, sin path)  path prefix     path prefix
           │             │             │
      branch_id=1    branch_id=2    branch_id=3
      type=hotel     type=restaurant type=restaurant
      is_default=true (Opción A)
           │             │             │
      theme hotel    theme rest1    theme rest2
      páginas hotel  páginas rest1  páginas rest2
      spaces         menú rest1     menú rest2
      reservas       pedidos        pedidos
```

URLs resultantes (todas bajo la misma razón social):
- `tugranhotel.com/` → **hotel** (outlet principal, sin /hotel ni subdominio)
- `tugranhotel.com/restaurante-1/menu` → menú digital del restaurante 1
- `tugranhotel.com/restaurante-2/menu` → menú digital del restaurante 2 (theme distinto)

> **Opción A — Hotel como outlet principal**: el branch hotel tiene
> `custom_domain='tugranhotel.com'`. El middleware resuelve ese dominio →
> outlet hotel directamente. No hay landing corporativa separada — el hotel
> ES el negocio principal y vive en el root. Los restaurantes viven como
> path prefixes (`/restaurante-1`, `/restaurante-2`).
> Si en el futuro se quiere una landing corporativa encima, se añade la
> columna `is_default_outlet boolean` sin romper nada.

## Fases

| Fase | Nombre | Capa | Esfuerzo | Depende de |
|---|---|---|---|---|
| **F0** | Fundaciones BD: identidad web en branches + branch_id en tablas web | BD | S | — |
| **F1** | Resolución de outlet en goadmin-websites (middleware + contexto + queries) | Backend/Sitio | M | F0 |
| **F2** | Theme override por outlet (layout + merge de settings) | UI/Sitio | S | F0, F1 |
| **F3** | Catálogo por outlet (categories.branch_id + products filtrado) | BD/Backend | M | F0 |
| **F4** | Editor de branding multi-outlet (selector de outlet + filtrar secciones) | UI/ERP | M | F0, F2 |
| **F5** | Checkout multi-outlet (branch_id en carrito + pedido) | UI/Backend | S | F1, F3 |
| **F6** | Gestión de sucursales con identidad web (BranchForm extendido) | UI/ERP | S | F0 |

Esfuerzo: S = 1-2 días · M = 3-5 días.

## Flujo end-to-end

```
1. Usuario crea 3 branches en ERP:
   → hotel:           custom_domain='tugranhotel.com', branch_type='hotel', is_web_published=true
   → restaurante-1:   slug='restaurante-1', branch_type='restaurant', is_web_published=true
   → restaurante-2:   slug='restaurante-2', branch_type='restaurant', is_web_published=true
2. ERP editor de branding: selecciona outlet → crea páginas por branch
   → hotel: páginas con secciones room_types, booking_cta (home en root)
   → restaurante-1: páginas con secciones menu_preview, specialties
3. Visitante entra a tugranhotel.com/ → middleware resuelve custom_domain → outlet hotel
   → Visitante entra a tugranhotel.com/restaurante-1/menu → outlet restaurante-1
   → getWebsitePageBySlug(orgId, 'menu', branchId=2)
   → getMenuProducts(orgId, branchId=2) → solo productos del restaurante 1
   → theme = merge(orgSettings, branchSettings_2)
   → OrganizationLayout renderiza con theme del restaurante 1
4. Visitante agrega items al carrito → carrito lleva branchId=2
5. Checkout → POST /api/orders con branchId=2 explícito
   → web_orders se crea con branch_id=2
   → inventario se descuenta de stock_levels del branch 2
6. ERP ve el pedido en /app/pos/pedidos-online filtrado por sucursal
```

## Definition of Done

1. Una organización con 3 branches (hotel + 2 restaurantes) tiene 3 sitios distintos.
2. Cada outlet tiene su propio theme (colores, logo, template).
3. Cada restaurante tiene su propio menú (productos distintos).
4. El hotel muestra habitaciones y motor de reservas.
5. Los pedidos web caen al branch correcto (no al fallback global).
6. El editor de branding permite elegir outlet al crear/editar páginas.
7. Las secciones disponibles se filtran por `branch_type` del outlet.
8. `npm run lint` + `tsc --noEmit` limpios en ambos repos.
9. Cero archivos `.sql` en el repo.
10. RLS sigue por `organization_id` (no se rompe el multi-tenant existente).

## Índice de documentos

| Documento | Contenido |
|---|---|
| `PLAN.md` | Este documento — resumen de las 7 fases |
| `FASE-0-FUNDACIONES-BD.md` | Migraciones BD: branches identidad web + branch_id |
| `FASE-1-RESOLUCION-OUTLET.md` | Middleware + get-org-context + queries con branchId |
| `FASE-2-THEME-OVERRIDE.md` | OrganizationLayout + merge de settings por outlet |
| `FASE-3-CATALOGO-OUTLET.md` | categories.branch_id + products filtrado por outlet |
| `FASE-4-EDITOR-MULTI-OUTLET.md` | Selector de outlet en editor + filtrar secciones |
| `FASE-5-CHECKOUT-OUTLET.md` | branch_id en carrito + checkout + /api/orders |
| `FASE-6-SUCURSALES-IDENTIDAD-WEB.md` | BranchForm con campos de identidad web |
