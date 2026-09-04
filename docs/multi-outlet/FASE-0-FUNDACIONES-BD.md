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

### 2.0 DROP de constraints UNIQUE existentes — ⚠️ NO HACER DROP SIN ACTUALIZAR CÓDIGO

> **🚨 ADVERTENCIA CRÍTICA — LEER ANTES DE CUALQUIER DROP (2026-09-03):**
>
> **PostgREST** (el motor API detrás de Supabase) usa los constraints `UNIQUE`
> en `pg_constraint` — **NO los índices únicos** — para detectar relaciones
> **1:1** entre tablas. Sin el constraint `UNIQUE (organization_id)` en
> `website_settings`, PostgREST deja de tratar la relación
> `organizations → website_settings` como 1:1 y la devuelve como **array**
> en lugar de objeto.
>
> **Síntoma**: el sitio público pierde colores, header, footer y todo el diseño.
> El código hace `organization.website_settings?.primary_color` y recibe
> `undefined` porque `website_settings` es un array `[{...}]` en lugar de
> un objeto `{...}`.
>
> **Estado actual (2026-09-03)**: los 3 constraints UNIQUE originales fueron
> **restaurados** en BD para que los sitios existentes sigan funcionando:
> - `website_settings_organization_id_key` → `UNIQUE (organization_id)`
> - `website_pages_organization_id_slug_key` → `UNIQUE (organization_id, slug)`
> - `categories_organization_id_slug_key` → `UNIQUE (organization_id, slug)`
>
> **Los constraints NO se pueden dropear hasta que el código de la aplicación
> se actualice para hacer query directa por `(organization_id, branch_id)`** en
> lugar de depender del select anidado de `organizations` (ver F2 §3.1
> `getOrgSettings`). Esto significa que:
> - F1 (resolución outlet) debe actualizarse para hacer query directa de
>   `website_settings` por `(organization_id, branch_id)` en lugar de
>   depender del select anidado de `organizations`.
> - F2 (theme override) debe hacer lo mismo.
> - F3 (catálogo) debe hacer query directa de `categories` por
>   `(organization_id, branch_id)`.
> - Solo cuando ese código esté en producción se pueden dropear los
>   constraints y confiar en los índices branch-aware con `COALESCE`.
>
> **El orden correcto es:**
> 1. F0: añadir columnas `branch_id` + índices branch-aware (HECHO ✅)
> 2. F1-F3: actualizar código para query directa por `(org, branch_id)` (PENDIENTE)
> 3. Solo después: DROP de los 3 constraints UNIQUE originales
>
> **Lección aprendida**: los índices únicos con `COALESCE(branch_id, -1)` son
> correctos para integridad de datos, pero **PostgREST no los reconoce como
> constraints 1:1**. Solo reconoce constraints en `pg_constraint`, no índices
> en `pg_indexes`.

> **Pre-requisito**: exportar un snapshot del schema vía el dashboard de
> Supabase o PITR (Point-in-Time Recovery) antes de cualquier DROP destructivo.
> No usar `pg_dump` local para evitar archivos `.sql` en el repo. El proyecto
> Supabase permite restaurar a un punto en el tiempo si algo falla.

> **Verificado en BD real (2026-09-01)**: existen 3 constraints UNIQUE que
> chocan con multi-outlet. **Pero NO se pueden dropear hasta que el código
> de la aplicación se actualice** (ver advertencia arriba).

```sql
-- ⚠️ NO EJECUTAR ESTO HASTA QUE F1-F3 ESTÉN IMPLEMENTADOS Y EN PRODUCCIÓN
-- Los constraints fueron restaurados el 2026-09-03 para que los sitios
-- existentes sigan funcionando. Dropearlos sin actualizar el código rompe
-- PostgREST (devuelve arrays en lugar de objetos) y pierde colores/header/footer.

-- 1. website_settings: UNIQUE (organization_id) — prohíbe múltiples settings por org
--    Bloquea el theme override por outlet. DROP y reemplazar por (org, COALESCE(branch_id, -1))
--    Verificar nombres reales con:
--    SELECT conname FROM pg_constraint WHERE conrelid = 'website_settings'::regclass;
--    antes de ejecutar.
-- ALTER TABLE website_settings DROP CONSTRAINT IF EXISTS website_settings_organization_id_key;

-- 2. website_pages: UNIQUE (organization_id, slug) — prohíbe mismo slug en distintos outlets
--    Bloquea que hotel y restaurante-1 tengan ambos una página "menu". DROP y reemplazar.
-- ALTER TABLE website_pages DROP CONSTRAINT IF EXISTS website_pages_organization_id_slug_key;

-- 3. categories: UNIQUE (organization_id, slug) — prohíbe mismo slug en distintos outlets
--    Bloquea que cada restaurante tenga su categoría "bebidas". DROP y reemplazar.
-- ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_organization_id_slug_key;
```

**Estado actual de los constraints (2026-09-03):**
- ✅ Los 3 constraints UNIQUE originales **están presentes** en BD (restaurados).
- ✅ Los índices branch-aware con `COALESCE(branch_id, -1)` también están presentes.
- ⚠️ Los constraints originales impiden crear filas branch-specific por ahora
  (ej: no se puede crear un segundo `website_settings` para la misma org).
  Esto es **aceptable** hasta que F1-F3 se implementen.
- 📋 **Acción requerida para F1-F3**: antes de dropear los constraints,
  actualizar el código de `getOrganizationBySubdomain`,
  `getOrganizationByCustomDomain`, `getWebsitePageBySlug`,
  `getOrganizationCategories`, etc. para hacer query directa por
  `(organization_id, branch_id)` en lugar de depender del select anidado
  `organizations → website_settings`.

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
  IF NEW.page_id IS NULL THEN
    NEW.branch_id := NULL;
    RETURN NEW;
  END IF;
  SELECT branch_id INTO NEW.branch_id FROM website_pages WHERE id = NEW.page_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_section_branch
  BEFORE INSERT OR UPDATE ON website_page_sections
  FOR EACH ROW EXECUTE FUNCTION sync_section_branch_id();
```

**Nota**: el trigger garantiza que `sections.branch_id` siempre refleje el `branch_id` de la página padre, incluso si la aplicación no lo setea explícitamente o si la página cambia de outlet posteriormente.

> **Actualización post-QA (2026-09-02)**: la función incluye ahora un guard `IF NEW.page_id IS NULL` que setea `branch_id := NULL` y retorna temprano, evitando un `SELECT ... WHERE id = NULL` que siempre devolvería NULL pero dejaba el flujo del trigger en un estado frágil. **Aplicado en BD (2026-09-02)** vía MCP de Supabase — la BD tiene ahora la versión mejorada con el guard.

#### 2.4.1 Propagación cuando `page.branch_id` cambia (AFTER UPDATE)

El trigger `trg_sync_section_branch` (BEFORE INSERT OR UPDATE) sincroniza `sections.branch_id` cuando la **sección** cambia, pero **no propaga** cuando es el `branch_id` de la **página padre** el que cambia. Sin un segundo trigger, si una página se mueve de outlet, sus secciones quedan con el `branch_id` anterior (desincronizadas).

**Aplicado en BD (2026-09-02)**:

```sql
CREATE OR REPLACE FUNCTION sync_sections_branch_on_page_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo propagar si branch_id realmente cambió
  IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
    UPDATE website_page_sections
      SET branch_id = NEW.branch_id
      WHERE page_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_sections_on_page_update
  AFTER UPDATE OF branch_id ON website_pages
  FOR EACH ROW EXECUTE FUNCTION sync_sections_branch_on_page_update();
```

**Notas**:
- Es `AFTER UPDATE` (no BEFORE) porque debe actuar sobre la tabla hija `website_page_sections`, no sobre la propia `website_pages`.
- Usa `IS DISTINCT FROM` para comparar correctamente `NULL` con un valor real (el operador `<>` no funciona con `NULL`).
- Solo dispara cuando cambia la columna `branch_id` (`OF branch_id`), no en cualquier UPDATE de la página.

### 2.5 `categories` — `branch_id` nullable

```sql
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS branch_id integer REFERENCES branches(id) ON DELETE CASCADE;

-- Slug único por (org, branch). Excluye '' para que no se trate como slug válido.
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_org_branch_slug
  ON categories (organization_id, COALESCE(branch_id, -1), slug)
  WHERE slug IS NOT NULL AND slug <> '';
```

### 2.6 Validación de integridad: `branch_id` debe pertenecer a la misma org

**Problema**: las 4 tablas web (`website_settings`, `website_pages`, `website_page_sections`, `categories`) tienen tanto `organization_id` como `branch_id`. Nada en el esquema impide que `branch_id` apunte a un branch de **otra organización** distinta a `table.organization_id`, lo que rompería el aislamiento multi-org.

**Solución aplicada en BD (2026-09-02)**: un trigger BEFORE INSERT OR UPDATE en cada una de las 4 tablas que valida `branch.organization_id = table.organization_id`.

```sql
CREATE OR REPLACE FUNCTION validate_branch_belongs_to_org()
RETURNS TRIGGER AS $$
DECLARE
  branch_org_id integer;
BEGIN
  IF NEW.branch_id IS NULL THEN
    RETURN NEW;  -- contenido global, nada que validar
  END IF;

  SELECT organization_id INTO branch_org_id FROM branches WHERE id = NEW.branch_id;
  IF branch_org_id IS NULL OR branch_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'branch_id % no pertenece a organization_id %',
      NEW.branch_id, NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- website_settings
CREATE TRIGGER trg_validate_branch_org_settings
  BEFORE INSERT OR UPDATE OF branch_id, organization_id ON website_settings
  FOR EACH ROW EXECUTE FUNCTION validate_branch_belongs_to_org();

-- website_pages
CREATE TRIGGER trg_validate_branch_org_pages
  BEFORE INSERT OR UPDATE OF branch_id, organization_id ON website_pages
  FOR EACH ROW EXECUTE FUNCTION validate_branch_belongs_to_org();

-- website_page_sections
CREATE TRIGGER trg_validate_branch_org_sections
  BEFORE INSERT OR UPDATE OF branch_id, organization_id ON website_page_sections
  FOR EACH ROW EXECUTE FUNCTION validate_branch_belongs_to_org();

-- categories
CREATE TRIGGER trg_validate_branch_org_categories
  BEFORE INSERT OR UPDATE OF branch_id, organization_id ON categories
  FOR EACH ROW EXECUTE FUNCTION validate_branch_belongs_to_org();
```

**Notas**:
- El trigger dispara tanto si cambia `branch_id` como si cambia `organization_id` (para cubrir el caso de reasignar una fila a otra org sin cambiar el branch).
- Si `branch_id IS NULL` (contenido global), el trigger retorna inmediatamente sin validar — el contenido global no tiene branch asociado.
- Si el `branch_id` no existe en `branches` (FK roto), `branch_org_id` queda `NULL` y se levanta la excepción.

### 2.7 Índices parciales para performance

**Aplicados en BD (2026-09-02)** vía MCP de Supabase. Estos índices parciales optimizan las queries que filtran por `(organization_id, branch_id)` en las tablas web, y el filtrado de secciones por `branch_id` no nulo:

```sql
-- website_pages: filtro (organization_id, branch_id) para listar páginas de un outlet
CREATE INDEX IF NOT EXISTS idx_website_pages_org_branch
  ON website_pages (organization_id, branch_id);

-- categories: filtro (organization_id, branch_id) para listar categorías de un outlet
CREATE INDEX IF NOT EXISTS idx_categories_org_branch
  ON categories (organization_id, branch_id);

-- website_page_sections: filtro por branch_id no nulo (secciones asignadas a un outlet)
CREATE INDEX IF NOT EXISTS idx_website_page_sections_branch
  ON website_page_sections (branch_id)
  WHERE branch_id IS NOT NULL;
```

> **Nota**: `idx_website_settings_org_branch` ya existe como índice UNIQUE en §2.2 — no se recrea como índice de performance. Los índices parciales de §2.7 son solo para `website_pages`, `categories` y `website_page_sections`.

**Notas**:
- Los 2 primeros (`website_pages`, `categories`) cubren el patrón de query más frecuente del backend público: "dame el contenido de la org X para el outlet Y". El índice de `website_settings` ya está cubierto por el índice UNIQUE de §2.2.
- `idx_website_page_sections_branch` es un índice **parcial** (`WHERE branch_id IS NOT NULL`) que solo indexa las secciones asignadas a un outlet, excluyendo el contenido global (`NULL`). Esto reduce el tamaño del índice y acelera el filtrado de secciones por outlet sin hacer JOIN con `website_pages`.
- Estos índices son **no únicos** (de performance, no de integridad). Los constraints de unicidad están cubiertos por los índices de las secciones 2.2, 2.3 y 2.5.

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
    'idx_categories_org_branch_slug',
    'idx_website_pages_org_branch',
    'idx_categories_org_branch',
    'idx_website_page_sections_branch'
  )
ORDER BY indexname;

-- 5.4 Verificar que filas existentes tienen branch_id=NULL (backward compat)
-- Los counts deben coincidir con los del diagnóstico pre-migración
-- (verificar con SELECT count(*) FROM website_settings antes y después — deben ser iguales).
SELECT count(*) AS settings_global  FROM website_settings      WHERE branch_id IS NULL;
SELECT count(*) AS pages_global     FROM website_pages          WHERE branch_id IS NULL;
SELECT count(*) AS sections_global  FROM website_page_sections  WHERE branch_id IS NULL;
SELECT count(*) AS categories_global FROM categories            WHERE branch_id IS NULL;

-- 5.5 Verificar que branches tiene 86 filas y is_web_published=false por defecto
SELECT count(*) AS total_branches,
       count(*) FILTER (WHERE is_web_published = false) AS unpublished,
       count(*) FILTER (WHERE slug IS NULL) AS sin_slug
FROM branches;

-- 5.6 Verificar trigger de sincronización de section.branch_id
SELECT tgname, tgrelid::regclass AS table_name, tgenabled
FROM pg_trigger
WHERE tgname = 'trg_sync_section_branch';

-- 5.7 Verificar trigger de propagación cuando page.branch_id cambia
SELECT tgname, tgrelid::regclass AS table_name, tgenabled
FROM pg_trigger
WHERE tgname = 'trg_sync_sections_on_page_update';

-- 5.8 Verificar triggers de validación branch-org (4 tablas)
SELECT tgname, tgrelid::regclass AS table_name, tgenabled
FROM pg_trigger
WHERE tgname IN (
  'trg_validate_branch_org_settings',
  'trg_validate_branch_org_pages',
  'trg_validate_branch_org_sections',
  'trg_validate_branch_org_categories'
)
ORDER BY tgname;
```

**Criterios de aceptación de la verificación:**
- 5.1 → 6 filas (las 6 columnas nuevas existen en `branches`).
- 5.2 → 4 filas (las 4 tablas web tienen `branch_id`).
- 5.3 → 9 índices (6 únicos + 3 parciales de performance; `idx_website_settings_org_branch` ya existe como único y el parcial homónimo no se recrea).
- 5.4 → counts coinciden con los del diagnóstico pre-migración (verificar con `SELECT count(*) FROM website_settings` antes y después — deben ser iguales).
- 5.5 → `total_branches = 86`, `unpublished = 86`, `sin_slug = 86` (todas las existentes quedan sin slug y no publicadas por defecto).
- 5.6 → 1 fila (`trg_sync_section_branch` existe y está habilitado en `website_page_sections`).
- 5.7 → 1 fila (`trg_sync_sections_on_page_update` existe y está habilitado en `website_pages`).
- 5.8 → 4 filas (los 4 triggers `trg_validate_branch_org_*` existen y están habilitados).

---

## 6. Definition of Done

- [x] `branches` tiene `slug`, `subdomain`, `custom_domain`, `website_logo_url`, `website_cover_url`, `is_web_published` ✅ verificado 2026-09-02
- [x] Constraints UNIQUE originales **presentes/restaurados** en BD (NO eliminados — se dropearán solo después de F1-F3) ✅
- [x] `website_settings` tiene `branch_id` nullable ✅
- [x] `website_pages` tiene `branch_id` nullable ✅
- [x] `website_page_sections` tiene `branch_id` nullable ✅
- [x] `categories` tiene `branch_id` nullable ✅
- [x] Índices únicos nuevos creados (`idx_branches_org_slug`, `idx_branches_subdomain`, `idx_branches_custom_domain`, `idx_website_settings_org_branch`, `idx_website_pages_org_branch_slug`, `idx_categories_org_branch_slug`) ✅ 6/6
- [x] Índices parciales de performance creados (`idx_website_pages_org_branch`, `idx_categories_org_branch`, `idx_website_page_sections_branch`) ✅ Aplicados en BD (2026-09-02)
- [x] **Sitios 1:1 existentes siguen funcionando**: cada org sigue teniendo exactamente 1 settings, 1 página por slug, 1 categoría por slug (branch_id=NULL) ✅
- [x] Filas existentes tienen `branch_id=NULL` (backward compat verificada: settings=83, pages=1058, sections=1918, categories=800) ✅
- [x] RLS no se rompe (policies siguen filtrando solo por `organization_id`) ✅
- [x] Trigger `trg_sync_section_branch` creado y sincroniza `website_page_sections.branch_id` con `website_pages.branch_id` ✅ (tgenabled='O')
- [x] Trigger `trg_sync_sections_on_page_update` creado y propaga `branch_id` a las secciones cuando cambia el `branch_id` de la página padre ✅
- [x] Triggers `trg_validate_branch_org_*` (4 tablas) creados y validan que `branch_id.organization_id = table.organization_id` ✅
- [x] Cero archivos `.sql` en el repo (todo aplicado vía MCP de Supabase) ✅

---

## 7. Riesgos

- **Migración de contenido existente a outlets**: si una organización ya tiene páginas/categorías y quiere pasar a multi-outlet, hay que asignar `branch_id` a las filas existentes **manualmente** (caso por caso, desde el editor). Esta fase **no hace asignación automática** — las filas existentes quedan como contenido global (`NULL`).
- **`slug` vacío en branches existentes**: las 86 branches actuales quedan con `slug=NULL` y `is_web_published=false`. Antes de publicar un outlet hay que setear su slug (Fase 6 — BranchForm extendido).
- **`website_page_sections.branch_id` desincronizado**: como es redundante con `page.branch_id`, podría quedar `NULL` aunque la página pertenezca a un outlet. Mitigación: el trigger `trg_sync_section_branch` copia automáticamente `page.branch_id` al insertar/actualizar, garantizando consistencia sin depender de la aplicación.
- **Colisión de `custom_domain`**: si dos organizaciones intentan registrar el mismo dominio propio, el índice global lo bloquea. Es el comportamiento deseado, pero hay que manejar el error en la UI con un mensaje claro.
- **`ON DELETE CASCADE` en `branch_id` es intencional**: las 4 tablas web (`website_settings`, `website_pages`, `website_page_sections`, `categories`) tienen `branch_id ... REFERENCES branches(id) ON DELETE CASCADE`. Si se borra un branch, **todo el contenido de ese outlet desaparece automáticamente** — esto es correcto y deseado: no tiene sentido mantener páginas, secciones, settings o categorías de un outlet que ya no existe. El **contenido global** (`branch_id=NULL`) **no se ve afectado** por el CASCADE, porque `NULL` no referencia ningún branch y por tanto no se elimina al borrar un branch. Solo se borra el contenido que tenía explícitamente asignado el `branch_id` del outlet eliminado.

---

## 8. Rollback

> **Advertencia**: el rollback es **destructivo** — elimina columnas, índices y triggers creados en esta fase. Ejecutar solo si la fase 0 debe revertirse por completo. El orden importa: primero se eliminan triggers e índices (que dependen de las columnas), luego las columnas, y finalmente se recrean los constraints UNIQUE originales.

Ejecutar vía `apply_migration` del MCP de Supabase en este orden exacto:

### 8.1 DROP de triggers (4 nuevos + 1 de sincronización)

```sql
-- Trigger de sincronización section.branch_id (BEFORE INSERT OR UPDATE)
DROP TRIGGER IF EXISTS trg_sync_section_branch ON website_page_sections;
DROP FUNCTION IF EXISTS sync_section_branch_id();

-- Trigger de propagación cuando page.branch_id cambia (AFTER UPDATE)
DROP TRIGGER IF EXISTS trg_sync_sections_on_page_update ON website_pages;
DROP FUNCTION IF EXISTS sync_sections_branch_on_page_update();

-- Triggers de validación branch-org (4 tablas)
DROP TRIGGER IF EXISTS trg_validate_branch_org_settings ON website_settings;
DROP TRIGGER IF EXISTS trg_validate_branch_org_pages ON website_pages;
DROP TRIGGER IF EXISTS trg_validate_branch_org_sections ON website_page_sections;
DROP TRIGGER IF EXISTS trg_validate_branch_org_categories ON categories;
DROP FUNCTION IF EXISTS validate_branch_belongs_to_org();
```

### 8.2 DROP de índices únicos nuevos (6) + índices parciales de performance (3)

```sql
-- Índices únicos (6)
DROP INDEX IF EXISTS idx_branches_org_slug;
DROP INDEX IF EXISTS idx_branches_subdomain;
DROP INDEX IF EXISTS idx_branches_custom_domain;
DROP INDEX IF EXISTS idx_website_settings_org_branch;
DROP INDEX IF EXISTS idx_website_pages_org_branch_slug;
DROP INDEX IF EXISTS idx_categories_org_branch_slug;

-- Índices parciales de performance (3 — sección 2.7)
DROP INDEX IF EXISTS idx_website_pages_org_branch;
DROP INDEX IF EXISTS idx_categories_org_branch;
DROP INDEX IF EXISTS idx_website_page_sections_branch;
```

### 8.3 DROP de columnas `branch_id` en las 4 tablas web

```sql
ALTER TABLE website_page_sections DROP COLUMN IF EXISTS branch_id;
ALTER TABLE website_pages DROP COLUMN IF EXISTS branch_id;
ALTER TABLE website_settings DROP COLUMN IF EXISTS branch_id;
ALTER TABLE categories DROP COLUMN IF EXISTS branch_id;
```

### 8.4 DROP de las 6 columnas nuevas en `branches`

```sql
ALTER TABLE branches
  DROP COLUMN IF EXISTS slug,
  DROP COLUMN IF EXISTS subdomain,
  DROP COLUMN IF EXISTS custom_domain,
  DROP COLUMN IF EXISTS website_logo_url,
  DROP COLUMN IF EXISTS website_cover_url,
  DROP COLUMN IF EXISTS is_web_published;
```

### 8.5 Recreación de los 3 constraints UNIQUE originales

> **Estado actual (2026-09-03)**: los 3 constraints UNIQUE originales están **presentes** en BD (fueron restaurados tras el incidente PostgREST). Esta sección solo aplica si en el futuro se dropean tras implementar F1-F3.

> **Nota**: los constraints UNIQUE originales no excluían slugs vacíos. Si se hace rollback, las filas con `slug=''` podrían violar el constraint. Verificar con `SELECT count(*) FROM website_pages WHERE slug = ''` antes de recrear.

```sql
-- website_settings: 1 settings por org (1:1 original)
ALTER TABLE website_settings
  ADD CONSTRAINT website_settings_organization_id_key UNIQUE (organization_id);

-- website_pages: slug único por org (1:1 original)
ALTER TABLE website_pages
  ADD CONSTRAINT website_pages_organization_id_slug_key UNIQUE (organization_id, slug);

-- categories: slug único por org (1:1 original)
ALTER TABLE categories
  ADD CONSTRAINT categories_organization_id_slug_key UNIQUE (organization_id, slug);
```

### 8.6 Verificación post-rollback

```sql
-- Confirmar que branch_id ya no existe en ninguna tabla web
SELECT table_name, column_name
FROM information_schema.columns
WHERE column_name = 'branch_id'
  AND table_name IN ('website_settings','website_pages','website_page_sections','categories');
-- Debe retornar 0 filas

-- Confirmar que las 6 columnas web de branches ya no existen
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'branches'
  AND column_name IN ('slug','subdomain','custom_domain','website_logo_url','website_cover_url','is_web_published');
-- Debe retornar 0 filas

-- Confirmar que los 3 constraints originales existen
SELECT conname
FROM pg_constraint
WHERE conname IN ('website_settings_organization_id_key','website_pages_organization_id_slug_key','categories_organization_id_slug_key');
-- Debe retornar 3 filas
```

**Criterios de aceptación del rollback**:
- 8.1 → 5 triggers y 3 funciones eliminadas.
- 8.2 → 9 índices eliminados (6 únicos + 3 parciales de performance).
- 8.3 → `branch_id` ya no existe en las 4 tablas web.
- 8.4 → 6 columnas web eliminadas de `branches`.
- 8.5 → 3 constraints UNIQUE originales recreados.
- 8.6 → verificación retorna 0 filas en columnas, 3 filas en constraints.
