# Fase 0 — Fundaciones BD: identidad web en `branches` + `branch_id` en tablas web

> Plan multi-outlet · Fase 0 de 7
> Fecha: 2026-08-31
> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Documento padre: [`PLAN.md`](./PLAN.md)

---

## 1. Objetivo

Añadir **identidad web** a la tabla `branches` (slug, subdominio, dominio propio, logo, cover, flag de publicación) y la columna **`branch_id` nullable** a las tablas web que hoy son 1:1 con organización:

- `website_settings`
- `website_pages`
- `website_page_sections`
- `categories`

Con esto, `NULL` = contenido global de la organización, y `X` = contenido exclusivo del outlet (branch). El backend operativo (POS, PMS, `web_orders`, `stock_levels`) **ya es multi-branch**; esta fase desbloquea la capa pública.

**Regla de oro**: todas las migraciones se ejecutan vía `apply_migration` del MCP de Supabase. **Cero archivos `.sql`** en el repo.

---

## 1bis. Pre-checks — detectar duplicados antes de crear índices únicos

Antes de aplicar las migraciones de la sección 2, ejecutar vía `execute_sql` del MCP para detectar slugs duplicados que harían fallar la creación de índices únicos. Si alguna query retorna filas, hay que resolver los duplicados manualmente antes de continuar.

```sql
-- Detectar slugs duplicados en branches por organización
SELECT organization_id, slug, count(*)
FROM branches
WHERE slug IS NOT NULL AND slug <> ''
GROUP BY organization_id, slug
HAVING count(*) > 1;

-- Detectar subdominios duplicados (global)
SELECT subdomain, count(*)
FROM branches
WHERE subdomain IS NOT NULL AND subdomain <> ''
GROUP BY subdomain
HAVING count(*) > 1;

-- Detectar custom_domains duplicados (global)
SELECT custom_domain, count(*)
FROM branches
WHERE custom_domain IS NOT NULL AND custom_domain <> ''
GROUP BY custom_domain
HAVING count(*) > 1;

-- Detectar slugs duplicados en website_pages por (org, branch)
SELECT organization_id, slug, count(*)
FROM website_pages
WHERE slug IS NOT NULL AND slug <> ''
GROUP BY organization_id, slug
HAVING count(*) > 1;

-- Detectar slugs duplicados en categories por (org, branch)
SELECT organization_id, slug, count(*)
FROM categories
WHERE slug IS NOT NULL AND slug <> ''
GROUP BY organization_id, slug
HAVING count(*) > 1;
```

**Criterio**: si todas las queries retornan 0 filas, es seguro crear los índices únicos. Si alguna retorna filas, resolver duplicados antes de aplicar la sección 2.

---

## 2. Migraciones BD (vía MCP de Supabase)

Cada bloque es el SQL EXACTO que se pasa a `apply_migration` del MCP. No se versionan archivos `.sql` en el repositorio.

### 2.0 DROP de constraints UNIQUE existentes (CRÍTICO — antes de cualquier otra migración)

> **Verificado en BD real (2026-09-01)**: existen 3 constraints UNIQUE que
> **chocan** con multi-outlet y deben eliminarse antes de crear los nuevos
> índices. Sin este paso, la migración falla o no permite múltiples filas por org.

```sql
-- 1. website_settings: UNIQUE (organization_id) — prohíbe múltiples settings por org
--    Bloquea el theme override por outlet. DROP y reemplazar por (org, COALESCE(branch_id, -1))
ALTER TABLE website_settings DROP CONSTRAINT IF EXISTS unique_website_per_org;

-- 2. website_pages: UNIQUE (organization_id, slug) — prohíbe mismo slug en distintos outlets
--    Bloquea que hotel y restaurante-1 tengan ambos una página "menu". DROP y reemplazar.
ALTER TABLE website_pages DROP CONSTRAINT IF EXISTS website_pages_organization_id_slug_key;

-- 3. categories: UNIQUE (organization_id, slug) — prohíbe mismo slug en distintos outlets
--    Bloquea que cada restaurante tenga su categoría "bebidas". DROP y reemplazar.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_organization_id_slug_key;
```

**Por qué es seguro hacer DROP ahora:**
- Los 3 constraints se reemplazan inmediatamente por índices únicos nuevos
  (secciones 2.2, 2.3, 2.5) que incluyen `COALESCE(branch_id, -1)`.
- El comportamiento para sitios 1:1 existentes (branch_id=NULL) es idéntico:
  sigue habiendo exactamente 1 settings, 1 página por slug, 1 categoría por slug
  por organización.
- Las filas existentes (81 settings, 1046 páginas, 775 categorías) no se tocan.
- El DROP + CREATE nuevo es atómico si se hace en una sola migración vía
  `apply_migration` del MCP.

### 2.1 `branches` — identidad web

```sql
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS subdomain text,
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS website_logo_url text,
  ADD COLUMN IF NOT EXISTS website_cover_url text,
  ADD COLUMN IF NOT EXISTS is_web_published boolean NOT NULL DEFAULT false;

-- Unique: slug por organización (no global). Excluye '' para que no se trate como slug válido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_org_slug
  ON branches (organization_id, slug)
  WHERE slug IS NOT NULL AND slug <> '';

-- Unique: subdomain global (no puede haber 2 outlets con mismo subdominio). Excluye ''.
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_subdomain
  ON branches (subdomain)
  WHERE subdomain IS NOT NULL AND subdomain <> '';

-- Unique: custom_domain global. Excluye ''.
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_custom_domain
  ON branches (custom_domain)
  WHERE custom_domain IS NOT NULL AND custom_domain <> '';
```

**Por qué `slug` es único por org pero `subdomain`/`custom_domain` son únicos globales:**

- **`slug`** identifica el outlet **dentro** de la organización (ej. `hotel`, `restaurante-1`). Dos organizaciones distintas pueden tener un outlet llamado `hotel` sin colisión, porque la URL final se resuelve como `tugranhotel.com/hotel` vs `otraorg.com/hotel`. Por eso el índice es compuesto `(organization_id, slug)`.
- **`subdomain`** y **`custom_domain`** son **puntos de entrada públicos globales** al DNS: `hotel.tugranhotel.com` y `hotel.otraorg.com` son hosts distintos, pero el subdominio puro `hotel` debe ser único dentro del dominio base del SaaS para evitar ambigüedad de enrutamiento. El `custom_domain` (ej. `mihotel.com`) es un FQDN único en internet: dos outlets no pueden apuntar al mismo dominio propio. Por eso ambos índices son globales (sin `organization_id`).

### 2.2 `website_settings` — `branch_id` nullable

```sql
ALTER TABLE website_settings
  ADD COLUMN IF NOT EXISTS branch_id integer REFERENCES branches(id) ON DELETE CASCADE;

-- Una org puede tener 1 settings global (branch_id=NULL) + 1 por cada branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_website_settings_org_branch
  ON website_settings (organization_id, COALESCE(branch_id, -1));
```

**Nota del índice**: `COALESCE(branch_id, -1)` permite que exista exactamente **una fila global** (`branch_id=NULL`) por organización y **una fila por cada branch**. Sin el `COALESCE`, PostgreSQL no trataría dos `NULL` como iguales en un índice único y se podrían crear múltiples settings globales duplicados.

### 2.3 `website_pages` — `branch_id` nullable

```sql
ALTER TABLE website_pages
  ADD COLUMN IF NOT EXISTS branch_id integer REFERENCES branches(id) ON DELETE CASCADE;

-- Slug único por (org, branch). NULL branch = página global. Excluye '' para que no se trate como slug válido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_website_pages_org_branch_slug
  ON website_pages (organization_id, COALESCE(branch_id, -1), slug)
  WHERE slug IS NOT NULL AND slug <> '';
```

### 2.4 `website_page_sections` — `branch_id` nullable (heredado de page)

```sql
ALTER TABLE website_page_sections
  ADD COLUMN IF NOT EXISTS branch_id integer REFERENCES branches(id) ON DELETE CASCADE;
```

**Nota**: `branch_id` en `sections` es **redundante** — la sección pertenece a una página y la página ya tiene `branch_id`. Se mantiene por dos razones:

1. **Facilita queries**: filtrar secciones por outlet sin hacer JOIN con `website_pages` cada vez.
2. **Consistencia con el patrón**: todas las tablas web exponen `branch_id` directamente.

Se mantiene sincronizado con un trigger que copia `page.branch_id` al insertar/actualizar, garantizando consistencia sin depender de la aplicación:

```sql
CREATE OR REPLACE FUNCTION sync_section_branch_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT branch_id INTO NEW.branch_id FROM website_pages WHERE id = NEW.page_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_section_branch
  BEFORE INSERT OR UPDATE ON website_page_sections
  FOR EACH ROW EXECUTE FUNCTION sync_section_branch_id();
```

**Nota**: el trigger garantiza que `sections.branch_id` siempre refleje el `branch_id` de la página padre, incluso si la aplicación no lo setea explícitamente o si la página cambia de outlet posteriormente.

### 2.5 `categories` — `branch_id` nullable

```sql
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS branch_id integer REFERENCES branches(id) ON DELETE CASCADE;

-- Slug único por (org, branch). Excluye '' para que no se trate como slug válido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_org_branch_slug
  ON categories (organization_id, COALESCE(branch_id, -1), slug)
  WHERE slug IS NOT NULL AND slug <> '';
```

---

## 3. RLS

- Las policies existentes filtran por `organization_id`. **No se añade `branch_id` a RLS**.
- Razón: los outlets pertenecen a la **misma razón social** (mismo NIT, misma organización). Los admins de la org pueden editar todos los outlets — el aislamiento entre outlets es de **UX/editor**, no de seguridad.
- **Confirmar que las policies existentes siguen funcionando con `branch_id=NULL`**: como las policies solo chequean `organization_id`, las filas con `branch_id=NULL` (contenido global) siguen siendo accesibles exactamente como antes. No hay cambio de comportamiento.

Verificación rápida (vía `execute_sql` del MCP):

```sql
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('website_settings','website_pages','website_page_sections','categories');
```

Las `qual` deben seguir referenciando solo `organization_id`.

---

## 4. Backward compatibility

- Todas las columnas nuevas son **nullable** o tienen **default**:
  - `branch_id` → nullable (default `NULL`)
  - `is_web_published` → `NOT NULL DEFAULT false`
  - `slug`, `subdomain`, `custom_domain`, `website_logo_url`, `website_cover_url` → nullable
- Las filas existentes quedan con `branch_id=NULL` automáticamente → se interpretan como **contenido global de la organización**, exactamente el comportamiento actual.
- Las queries existentes que **no pasan `branch_id`** siguen trayendo todo (sin filtro de outlet). No hay regression.
- Los índices únicos usan `COALESCE(branch_id, -1)` para que el contenido global (`NULL`) no colisione con el contenido de un outlet real.

---

## 5. Verificación post-migración

Ejecutar vía `execute_sql` del MCP tras aplicar todas las migraciones:

```sql
-- 5.1 Verificar columnas nuevas en branches
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'branches'
  AND column_name IN ('slug','subdomain','custom_domain','website_logo_url','website_cover_url','is_web_published')
ORDER BY column_name;

-- 5.2 Verificar branch_id en tablas web
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE column_name = 'branch_id'
  AND table_name IN ('website_settings','website_pages','website_page_sections','categories')
ORDER BY table_name;

-- 5.3 Verificar índices únicos creados
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_branches_org_slug',
    'idx_branches_subdomain',
    'idx_branches_custom_domain',
    'idx_website_settings_org_branch',
    'idx_website_pages_org_branch_slug',
    'idx_categories_org_branch_slug'
  )
ORDER BY indexname;

-- 5.4 Verificar que filas existentes tienen branch_id=NULL (backward compat)
SELECT count(*) AS settings_global  FROM website_settings      WHERE branch_id IS NULL; -- debe ser 81
SELECT count(*) AS pages_global     FROM website_pages          WHERE branch_id IS NULL; -- debe ser 1046
SELECT count(*) AS sections_global  FROM website_page_sections  WHERE branch_id IS NULL; -- debe ser 1870
SELECT count(*) AS categories_global FROM categories            WHERE branch_id IS NULL; -- debe ser 775

-- 5.5 Verificar que branches tiene 84 filas y is_web_published=false por defecto
SELECT count(*) AS total_branches,
       count(*) FILTER (WHERE is_web_published = false) AS unpublished,
       count(*) FILTER (WHERE slug IS NULL) AS sin_slug
FROM branches;

-- 5.6 Verificar trigger de sincronización de section.branch_id
SELECT tgname, tgrelid::regclass AS table_name, tgenabled
FROM pg_trigger
WHERE tgname = 'trg_sync_section_branch';
```

**Criterios de aceptación de la verificación:**
- 5.1 → 6 filas (las 6 columnas nuevas existen en `branches`).
- 5.2 → 4 filas (las 4 tablas web tienen `branch_id`).
- 5.3 → 6 índices.
- 5.4 → counts coinciden con los del diagnóstico del PLAN (`81`, `1046`, `1870`, `775`).
- 5.5 → `total_branches = 84`, `unpublished = 84`, `sin_slug = 84` (todas las existentes quedan sin slug y no publicadas por defecto).
- 5.6 → 1 fila (`trg_sync_section_branch` existe y está habilitado en `website_page_sections`).

---

## 6. Definition of Done

- [ ] `branches` tiene `slug`, `subdomain`, `custom_domain`, `website_logo_url`, `website_cover_url`, `is_web_published`
- [ ] **Constraints UNIQUE antiguos eliminados**: `unique_website_per_org`, `website_pages_organization_id_slug_key`, `categories_organization_id_slug_key` (verificado con `pg_constraint`)
- [ ] `website_settings` tiene `branch_id` nullable
- [ ] `website_pages` tiene `branch_id` nullable
- [ ] `website_page_sections` tiene `branch_id` nullable
- [ ] `categories` tiene `branch_id` nullable
- [ ] Índices únicos nuevos creados (`idx_branches_org_slug`, `idx_branches_subdomain`, `idx_branches_custom_domain`, `idx_website_settings_org_branch`, `idx_website_pages_org_branch_slug`, `idx_categories_org_branch_slug`)
- [ ] **Sitios 1:1 existentes siguen funcionando**: cada org sigue teniendo exactamente 1 settings, 1 página por slug, 1 categoría por slug (branch_id=NULL)
- [ ] Filas existentes tienen `branch_id=NULL` (backward compat verificada con 5.4)
- [ ] RLS no se rompe (policies siguen filtrando solo por `organization_id`)
- [ ] Trigger `trg_sync_section_branch` creado y sincroniza `website_page_sections.branch_id` con `website_pages.branch_id`
- [ ] Cero archivos `.sql` en el repo (todo aplicado vía MCP de Supabase)

---

## 7. Riesgos

- **Migración de contenido existente a outlets**: si una organización ya tiene páginas/categorías y quiere pasar a multi-outlet, hay que asignar `branch_id` a las filas existentes **manualmente** (caso por caso, desde el editor). Esta fase **no hace asignación automática** — las filas existentes quedan como contenido global (`NULL`).
- **`slug` vacío en branches existentes**: las 84 branches actuales quedan con `slug=NULL` y `is_web_published=false`. Antes de publicar un outlet hay que setear su slug (Fase 6 — BranchForm extendido).
- **`website_page_sections.branch_id` desincronizado**: como es redundante con `page.branch_id`, podría quedar `NULL` aunque la página pertenezca a un outlet. Mitigación: el trigger `trg_sync_section_branch` copia automáticamente `page.branch_id` al insertar/actualizar, garantizando consistencia sin depender de la aplicación.
- **Colisión de `custom_domain`**: si dos organizaciones intentan registrar el mismo dominio propio, el índice global lo bloquea. Es el comportamiento deseado, pero hay que manejar el error en la UI con un mensaje claro.
