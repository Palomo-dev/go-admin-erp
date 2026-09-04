# Fase 3 — Catálogo por outlet (categories.branch_id + products filtrado)

> Fecha: 2026-08-31
> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: **F0** (Fundaciones BD — `categories.branch_id` nullable) y **F1** (resolución de outlet en middleware)
> Repos ERP: `C:\Users\USUARIO\CascadeProjects\go-admin-erp`
> Repos Sitio: `C:\Users\USUARIO\goadmin-websites`

> **Nota sobre números de línea:** los números de línea son referenciales y pueden
> variar ±2 líneas por commits recientes. Usar los nombres de función como
> referencia principal.

---

## 1. Objetivo

Cada outlet (restaurante) tiene su propio catálogo (categorías + productos). El hotel **no**
muestra menú de comida; cada restaurante **no** muestra habitaciones.

Concretamente:
- El sitio del hotel (`branch_id=1`, `branch_type=hotel`) muestra espacios + motor de reservas.
- El sitio del restaurante 1 (`branch_id=2`, `branch_type=restaurant`) muestra **solo** sus
  categorías de comida + las categorías globales de la org.
- El sitio del restaurante 2 (`branch_id=3`, `branch_type=restaurant`) hace lo mismo con sus
  propias categorías + las globales.
- Las categorías globales (`branch_id IS NULL`) aparecen en **todos** los outlets.

---

## 2. Modelo de catálogo por outlet

### 2.1 Esquema

| Tabla | Columna | Tipo | Significado |
|---|---|---|---|
| `categories` | `branch_id` | `int8` **nullable** | `NULL` = categoría global (compartida por toda la org); `X` = exclusiva del outlet `X`. |
| `products` | — | — | **No** tiene `branch_id` directo. Hereda el branch de su `category_id`. |

> **Decisión de diseño:** el branch de un producto se infiere de su categoría. Esto evita
> duplicar la columna `branch_id` en 28k+ productos y mantenerla sincronizada a mano. Si una
> categoría es global (`branch_id IS NULL`), sus productos son globales; si la categoría es del
> outlet `X`, sus productos son del outlet `X`.

### 2.2 Query de productos por outlet

Para obtener los productos visibles en el outlet `X`:

```sql
SELECT p.*
FROM products p
JOIN categories c ON p.category_id = c.id
WHERE p.organization_id = :orgId
  AND p.status = 'active'
  AND p.parent_product_id IS NULL
  AND (c.branch_id = :X OR c.branch_id IS NULL);
```

Es decir: **productos del outlet + productos globales**.

### 2.3 Query de categorías por outlet

```sql
SELECT *
FROM categories
WHERE organization_id = :orgId
  AND is_active = true
  AND (branch_id = :X OR branch_id IS NULL)
ORDER BY rank ASC;
```

> **Nota de ordenamiento:** la nueva versión de `getOrganizationCategories` (sección 3.1)
> ordena por `.order('display_order').order('rank')` y filtra `.eq('is_active', true)`, alineada
> con `categoryService.getAll` del ERP. Ver sección 11 para el detalle de la alineación.

---

## 3. Cambios en `queries.ts` (goadmin-websites)

Archivo: `C:\Users\USUARIO\goadmin-websites\lib\supabase\queries.ts`

### 3.1 `getOrganizationCategories(orgId, branchId?)`

Hoy (línea 433) ignora el branch y ordena **únicamente** por `.order('rank', { ascending: true })`
— no usa `display_order`. Nueva versión acepta `branchId` opcional y filtra con `.or()`,
ordenando por `.order('display_order').order('rank')` para alinearse con el ERP:

```typescript
export async function getOrganizationCategories(
  organizationId: number,
  branchId?: number | null,
) {
  const supabase = getSupabaseForPublicRead();

  let query = supabase
    .from('categories')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)                          // ← NUEVO: alineado con ERP
    .order('display_order', { ascending: true })    // ← NUEVO: alineado con ERP
    .order('rank', { ascending: true });            // ← orden secundario, igual que ERP

  // Si hay outlet, traer categorías del outlet + las globales (branch_id IS NULL)
  if (typeof branchId === 'number') {
    query = query.or(`branch_id.is.null,branch_id.eq.${branchId}`);
  }

  const { data, error } = await query;
  if (error) return [];
  return enrichCategoriesWithFallbackImage(supabase, data || []);
}
```

> **Importante (alineación con ERP):** el código real (línea 433) no filtra por `is_active` ni
> ordena por `display_order`. La nueva versión **sí** filtra `.eq('is_active', true)` y ordena
> por `.order('display_order').order('rank')` para coincidir con `categoryService.getAll` del
> ERP (sección 5.1). El sitio público no debe mostrar categorías inactivas, y el ordenamiento
> debe ser consistente entre ERP y sitio para que el admin vea lo mismo que el cliente. Ver
> sección 11 para el detalle de la alineación.

> **Nota:** `enrichCategoriesWithFallbackImage` (línea 40) ya cuenta productos activos por
> categoría. Como las categorías ya vienen filtradas por branch, el conteo de productos es
> consistente — solo cuenta productos de las categorías visibles. No requiere cambios.

### 3.2 `getOrganizationProducts(orgId, limit, branchId?)`

Hoy (línea 247) trae todos los productos activos de la org. Nueva versión filtra por branch de
la categoría vía subquery en dos pasos (PostgREST no soporta `JOIN ... WHERE` directo, así que
se resuelve con un `in('category_id', branchCategoryIds)`):

> **Nota QA R3**: usar el helper `getAllowedCategoryIds` (sección 12) en lugar de
> la subquery manual. El snippet de abajo ya usa el helper como ejemplo canónico;
> las demás funciones (§3.3, §9.1, §9.3, §9.4) muestran la subquery manual como
> referencia pero deben migrar al helper en la implementación.

```typescript
export async function getOrganizationProducts(
  organizationId: number,
  limit = 12,
  branchId?: number | null,
) {
  const supabase = getSupabaseForPublicRead();

  // 1. Si hay branchId, obtener los IDs de categorías visibles para ese outlet
  //    usando el helper reutilizable (sección 12).
  let allowedCategoryIds: number[] | null = null;
  if (typeof branchId === 'number') {
    allowedCategoryIds = await getAllowedCategoryIds(organizationId, branchId);
    if (allowedCategoryIds.length === 0) return [];
  }

  // 2. Query de productos
  let query = supabase
    .from('products')
    .select(`
      *,
      product_prices (*),
      product_images (
        id, storage_path, is_primary, display_order, shared_image_id,
        shared_images ( storage_path )
      ),
      stock_levels ( branch_id, qty_on_hand, qty_reserved )
    `)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .is('parent_product_id', null);

  if (typeof branchId === 'number' && allowedCategoryIds) {
    query = query.in('category_id', allowedCategoryIds);
  }

  const { data, error } = await query.limit(limit);
  if (error) return [];

  // Contar variantes para productos padre (igual que antes)
  const parentIds = (data || []).filter((p: any) => p.is_parent).map((p: any) => p.id);
  let variantCountMap: Record<number, number> = {};
  if (parentIds.length > 0) {
    const { data: children } = await supabase
      .from('products')
      .select('parent_product_id')
      .in('parent_product_id', parentIds)
      .eq('status', 'active');
    if (children) {
      children.forEach((c: any) => {
        variantCountMap[c.parent_product_id] = (variantCountMap[c.parent_product_id] || 0) + 1;
      });
    }
  }

  const stockBranchIds = typeof branchId === 'number'
    ? [branchId]
    : await getWebStockBranchIds(organizationId);

  return filterStockByBranches(
    normalizeProductPrices((data || []).map((p: any) => ({
      ...p,
      has_variants: p.is_parent === true,
      variant_count: variantCountMap[p.id] || 0,
    }))),
    stockBranchIds,
  );
}
```

> **Nota QA — stock por outlet:** `getWebStockBranchIds(orgId)` devuelve **todas** las
> sucursales web de la org. Cuando `branchId` esté activo, `filterStockByBranches` debe
> recibir `[branchId]` (solo el outlet activo), no todas las sucursales web. El snippet
> de arriba ya aplica este patrón:
>
> ```typescript
> const stockBranchIds = typeof branchId === 'number'
>   ? [branchId]
>   : await getWebStockBranchIds(organizationId);
> return filterStockByBranches(..., stockBranchIds);
> ```
>
> Para sitios globales sin outlet (`branchId = undefined`), mantener el comportamiento
> actual (`getWebStockBranchIds` devuelve todas las sucursales web). Esto aplica también
> a `getMenuProducts` (sección 3.3), a `getProductsByCategory` (sección 3.4) y a
> cualquier función que use `filterStockByBranches`.

### 3.3 `getMenuProducts(orgId, limit, branchId?)`

Hoy (línea 1460) trae todos los productos para el menú digital. Nueva versión con el mismo
patrón de filtrado por categoría:

> **Nota QA R3**: usar `getAllowedCategoryIds` (sección 12) en lugar de la
> subquery manual mostrada abajo. El snippet se mantiene como referencia del
> patrón, pero la implementación debe delegar al helper.

```typescript
export async function getMenuProducts(
  organizationId: number,
  limit = 100,
  branchId?: number | null,
) {
  const supabase = getSupabaseForPublicRead();

  // 1. Si hay branchId, obtener IDs de categorías visibles del outlet
  let allowedCategoryIds: number[] | null = null;
  if (typeof branchId === 'number') {
    const { data: cats } = await supabase
      .from('categories')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .or(`branch_id.is.null,branch_id.eq.${branchId}`);
    allowedCategoryIds = (cats || []).map((c: any) => c.id);
    if (allowedCategoryIds.length === 0) return [];
  }

  // 2. Query de productos del menú
  let query = supabase
    .from('products')
    .select(`
      *,
      product_prices (*),
      product_images (
        id, storage_path, is_primary, display_order, shared_image_id,
        shared_images ( storage_path )
      ),
      stock_levels ( branch_id, qty_on_hand, qty_reserved ),
      product_tag_relations ( tag_id )
    `)
    .eq('organization_id', organizationId)
    .eq('status', 'active');

  if (typeof branchId === 'number' && allowedCategoryIds) {
    query = query.in('category_id', allowedCategoryIds);
  }

  const { data, error } = await query
    .order('name', { ascending: true })
    .limit(limit);

  if (error) return [];
  const stockBranchIds = typeof branchId === 'number'
    ? [branchId]
    : await getWebStockBranchIds(organizationId);
  return filterStockByBranches(normalizeProductPrices(data || []), stockBranchIds);
}
```

> **Nota sobre `is_menu_item` (verificado vía MCP de Supabase):** se consultó
> `information_schema.columns` en el proyecto `jgmgphmzusbluqhuqihj` y **la columna
> `is_menu_item` NO existe** en la tabla `products`. Query de evidencia:
>
> ```sql
> SELECT column_name FROM information_schema.columns
> WHERE table_schema='public' AND table_name='products' AND column_name='is_menu_item';
> -- Resultado: [] (vacío — la columna NO existe)
> ```
>
> Esto cierra la observación del QA R2: cualquier referencia a `is_menu_item` en el código
> del ERP (`src/components/inventario/productos/types.ts`, `src/components/pos/product-search.tsx`,
> etc.) corresponde a un **campo del tipo TypeScript local** que **no está respaldado por una
> columna real en la BD** — es aspiracional o de frontend-only. En runtime, leer/escribir ese
> campo no toca la tabla `products` de Supabase; el valor se pierde al persistir.
>
> La query actual de `getMenuProducts` (línea 1460) trae **todos los productos activos** de la
> org (`.eq('status', 'active')`) sin filtrar por ningún flag de menú. El menú digital muestra
> todos los productos activos del outlet. Si en el futuro se agrega `is_menu_item` a la tabla
> `products` (vía MCP de Supabase, no archivo SQL), el filtro sería
> `.eq('is_menu_item', true)` además del filtro por categoría. Por ahora el catálogo del menú =
> todos los productos activos del outlet.

### 3.4 `getProductsByCategory(orgId, categoryId, branchId?)`

Hoy (línea 449) trae productos de una categoría específica. El cambio es mínimo: si llega
`branchId`, validar que la categoría pertenezca al outlet (o sea global) antes de devolver
productos. Esto evita que un usuario acceda a productos de otro outlet via `/categoria/[slug]`:

```typescript
export async function getProductsByCategory(
  organizationId: number,
  categoryId: number,
  branchId?: number | null,
) {
  const supabase = getSupabaseForPublicRead();

  // Si hay branchId, validar que la categoría sea visible para ese outlet
  if (typeof branchId === 'number') {
    const { data: cat } = await supabase
      .from('categories')
      .select('id, branch_id')
      .eq('organization_id', organizationId)
      .eq('id', categoryId)
      .single();
    if (!cat || (cat.branch_id !== null && cat.branch_id !== branchId)) {
      return []; // categoría no visible para este outlet
    }
  }

  const { data, error } = await supabase
    .from('products')
    .select(`*, product_prices (*), stock_levels ( branch_id, qty_on_hand, qty_reserved )`)
    .eq('organization_id', organizationId)
    .eq('category_id', categoryId)
    .eq('status', 'active')
    .is('parent_product_id', null);

  if (error) return [];
  const stockBranchIds = typeof branchId === 'number'
    ? [branchId]
    : await getWebStockBranchIds(organizationId);
  return filterStockByBranches(normalizeProductPrices(data || []), stockBranchIds);
}
```

> **Nota QA — stock por outlet:** `getProductsByCategory` ahora aplica el mismo patrón
> de stock filtering que `getOrganizationProducts` y `getMenuProducts`: cuando hay
> `branchId` activo, `filterStockByBranches` recibe `[branchId]` (solo el outlet); si
> no, recibe todas las sucursales web vía `getWebStockBranchIds`. También se añadió
> `stock_levels ( branch_id, qty_on_hand, qty_reserved )` al `select` para que el
> stock llegue al cliente.

### 3.5 `getProductsByCategoryPaginated` (línea 566)

Hoy (línea 566) obtiene subcategorías sin filtrar por branch. Nueva versión acepta `branchId?`
en `options` y filtra las subcategorías para que solo incluyan categorías visibles del outlet
(del outlet + globales). Diff concreto:

```typescript
export async function getProductsByCategoryPaginated(
  organizationId: number,
  categoryId: number,
  options: {
    page?: number
    limit?: number
    sort?: 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'newest' | 'best_selling'
    subcategoryId?: number
    branchId?: number | null  // ← NUEVO
  } = {}
) {
  const supabase = getSupabaseForPublicRead()
  const { page = 1, limit = 12, sort = 'best_selling', subcategoryId, branchId } = options
  const offset = (page - 1) * limit

  // Obtener IDs de subcategorías para incluir productos de subcategorías
  let categoryIds = [categoryId]
  if (!subcategoryId) {
    let subQuery = supabase
      .from('categories')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('parent_id', categoryId)
      .eq('is_active', true)  // ← NUEVO: solo subcategorías activas

    // ← NUEVO: si hay branchId, filtrar subcategorías visibles del outlet
    if (typeof branchId === 'number') {
      subQuery = subQuery.or(`branch_id.is.null,branch_id.eq.${branchId}`)
    }

    const { data: subs } = await subQuery
    if (subs && subs.length > 0) {
      categoryIds = [...categoryIds, ...subs.map((s: any) => s.id)]
    }
  } else {
    categoryIds = [subcategoryId]
  }

  // ← NUEVO: si hay branchId y subcategoryId, validar que la subcategoría
  // pertenece al outlet (misma regla que categoría padre)
  if (typeof branchId === 'number' && subcategoryId) {
    const { data: subCat } = await supabase
      .from('categories')
      .select('id, branch_id')
      .eq('organization_id', organizationId)
      .eq('id', subcategoryId)
      .single()
    if (!subCat || (subCat.branch_id !== null && subCat.branch_id !== branchId)) {
      return { products: [], total: 0 }  // subcategoría no visible para este outlet
    }
  }

  // ← NUEVO: si hay branchId, validar que la categoría padre sea visible para el outlet
  if (typeof branchId === 'number') {
    const { data: parentCat } = await supabase
      .from('categories')
      .select('id, branch_id')
      .eq('organization_id', organizationId)
      .eq('id', categoryId)
      .single()
    if (!parentCat || (parentCat.branch_id !== null && parentCat.branch_id !== branchId)) {
      return { products: [], total: 0 }  // categoría no visible para este outlet
    }
  }

  let query = supabase
    .from('products')
    .select(`
      *,
      product_prices (*),
      product_images (
        id, storage_path, is_primary, display_order,
        shared_image_id,
        shared_images ( storage_path )
      ),
      stock_levels ( branch_id, qty_on_hand, qty_reserved )
    `, { count: 'exact' })
    .eq('organization_id', organizationId)
    .in('category_id', categoryIds)
    .eq('status', 'active')
    .is('parent_product_id', null)

  // ... resto de la función sin cambios (best_selling, ordenamiento, paginación) ...
```

> **Cambios vs código actual (línea 566):**
> 1. Se añade `branchId?: number | null` al tipo `options`.
> 2. Se desestructura `branchId` de `options`.
> 3. Si hay `branchId`, la subquery de subcategorías añade `.or(\`branch_id.is.null,branch_id.eq.${branchId}\`)`.
> 4. Si hay `branchId`, se valida que la categoría padre sea visible para el outlet antes de
>    devolver productos (evita acceso cross-outlet via `/categoria/[slug]`).
> 5. Si hay `branchId` **y** `subcategoryId`, se valida que la subcategoría pertenezca al outlet
>    (misma regla que categoría padre: `branch_id IS NULL` o `branch_id = branchId`). Sin esto,
>    pasar `subcategoryId` directamente saltaría el filtro de outlet.
> 6. El resto de la función (ordenamiento `best_selling`, paginación en memoria, etc.) no cambia.

> **Nota QA — `best_selling` y ranking branch-aware:** El ordenamiento `best_selling`
> depende del RPC `pos_product_ranking`. Cuando se altere el RPC con `p_branch_id`
> (ver sección 5.2), el ranking será branch-aware automáticamente — es decir, los
> "más vendidos" se calcularán por outlet y no a nivel de toda la org. Mientras el
> RPC no se altere, el ranking sigue siendo global (toda la org), pero los productos
> devueltos ya están filtrados por las categorías visibles del outlet.

---

## 4. Cambios en `MenuView.tsx`

Archivo: `C:\Users\USUARIO\goadmin-websites\components\site\MenuView.tsx`

### 4.1 Aceptar prop `branchId?: number | null`

```typescript
interface MenuViewProps {
  products: MenuProduct[]
  categories: Category[]
  tags: Tag[]
  modifierTypes: ModifierType[]
  variantRelations: VariantRelation[]
  modifierGroupsMap?: Map<number, ModifierGroup[]>
  primaryColor: string
  organizationSubdomain: string
  organizationName: string
  customerId?: string | null
  organizationId?: number | null
  initialFavorites?: number[]
  branchId?: number | null  // ← NUEVO
}
```

Desestructurarlo en el componente:

```typescript
export function MenuView({
  products, categories, tags, modifierTypes, variantRelations, modifierGroupsMap,
  primaryColor, organizationSubdomain, organizationName,
  customerId, organizationId, initialFavorites = [], branchId
}: MenuViewProps) {
```

> `branchId` no se usa directamente en el render (los productos y categorías ya vienen
> filtrados desde el server), pero se necesita para **namespacing del carrito** (ver 4.2).

### 4.2 Carrito de localStorage con branchId

Hoy (línea 242) el carrito se guarda en `cart_${organizationSubdomain}`. Esto mezcla carritos de
distintos outlets del mismo subdominio. Cambiar a:

```typescript
const cartKey = `cart_${organizationSubdomain}${branchId ? `_${branchId}` : ''}`
```

Esto aplica en `addToCart` (línea 242). El resto de la lógica del carrito no cambia.

### 4.3 Propagar branchId desde `app/[[...slug]]/page.tsx`

En el `case 'menu':` (línea 376), pasar `branchId` a las queries y al componente:

```typescript
case 'menu': {
  const branchId = outlet?.id  // resuelto por middleware de F1

  const [menuProducts, menuCategories, menuTags, menuModifiers, menuVariantRelations, menuModifierGroups] = await Promise.all([
    getMenuProducts(organization.id, 200, branchId),
    getOrganizationCategories(organization.id, branchId),
    getOrganizationTags(organization.id),
    getProductModifiers(organization.id),
    getProductVariantRelations(organization.id),
    getProductModifierGroupsByOrg(organization.id),
  ])

  // ... favoritos sin cambios ...

  return (
    <Layout>
      <MenuView
        products={menuProducts}
        categories={menuCategories}
        tags={menuTags}
        modifierTypes={menuModifiers}
        variantRelations={menuVariantRelations}
        modifierGroupsMap={menuModifierGroups}
        primaryColor={primaryColor}
        organizationSubdomain={organization.subdomain || ''}
        organizationName={organization.name}
        customerId={customerId}
        organizationId={organization.id}
        initialFavorites={initialFavorites}
        branchId={branchId}  // ← NUEVO
      />
    </Layout>
  )
}
```

> `outlet` es el contexto resuelto en **F1** (middleware + `get-org-context`). Si no hay outlet
> (sitio global de la org), `branchId` es `undefined` y las queries traen todo (comportamiento
> actual, sin romper sitios 1:1 existentes).

---

## 5. Cambios en ERP (go-admin-erp)

### 5.1 `categoryService.ts`

Archivo: `C:\Users\USUARIO\CascadeProjects\go-admin-erp\src\lib\services\categoryService.ts`

**`getAll(orgId, branchId?)`** — hoy (línea 154) trae todas las categorías de la org. Añadir
filtro opcional por branch:

```typescript
async getAll(organizationId: number, branchId?: number | null): Promise<Category[]> {
  let query = supabase
    .from('categories')
    .select('*')
    .eq('organization_id', organizationId);

  if (typeof branchId === 'number') {
    // Categorías del outlet + globales
    query = query.or(`branch_id.is.null,branch_id.eq.${branchId}`);
  }

  const { data, error } = await query
    .order('display_order', { ascending: true })  // ← mantener display_order Y rank
    .order('rank', { ascending: true });          //   (ambos, no solo rank)

  if (error) throw error;
  return data || [];
},
```

**`create(orgId, formData)`** — hoy (línea 208) no envía `branch_id`. Añadirlo al insert:

```typescript
async create(organizationId: number, formData: CategoryFormData): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({
      organization_id: organizationId,
      name: formData.name.trim(),
      slug: formData.slug || generateSlug(formData.name),
      parent_id: formData.parent_id,
      rank: formData.rank,
      icon: formData.icon || null,
      color: formData.color || '#3B82F6',
      image_url: formData.image_url || null,
      description: formData.description || null,
      is_active: formData.is_active,
      display_order: formData.display_order,
      meta_title: formData.meta_title || null,
      meta_description: formData.meta_description || null,
      metadata: formData.metadata || {},
      station: formData.station || null,
      requires_preparation: formData.requires_preparation,
      branch_id: formData.branch_id ?? null,  // ← NUEVO: null = global
    })
    .select()
    .single();

  if (error) throw error;
  return data;
},
```

Añadir `branch_id?: number | null` a `CategoryFormData` (línea 37) y a `Category` (línea 8).

**`update(id, formData)`** — añadir propagación de `branch_id` si viene en `formData`:

```typescript
if (formData.branch_id !== undefined) updateData.branch_id = formData.branch_id;
```

> **Nota QA:** `updateByUuid(uuid, formData)` debe incluir `branch_id` en el update
> de la misma forma que `update(id, formData)`. Si `formData.branch_id !== undefined`,
> propagarlo al objeto de update. Sin esto, editar una categoría por UUID no permite
> reasignarla de outlet.

### 5.2 `posService.ts`

Archivo: `C:\Users\USUARIO\CascadeProjects\go-admin-erp\src\lib\services\posService.ts`

**`getProductsPaginated`** — hoy (línea 160) filtra por `category_id` directo. Añadir parámetro
`branchId` para filtrar el catálogo del outlet (categorías del outlet + globales):

```typescript
static async getProductsPaginated({
  page = 1,
  limit = 12,
  search = '',
  category_id = null,
  status = 'active',
  includeVariants = false,
  branchId,  // ← NUEVO
}: {
  page?: number;
  limit?: number;
  search?: string;
  category_id?: number | null;
  status?: string;
  includeVariants?: boolean;
  branchId?: number | null;  // ← NUEVO
}) {
  try {
    const currentBranchId = branchId || await this.getBranchId();

    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('organization_id', this.organizationId);

    if (!includeVariants) {
      query = query.is('parent_product_id', null);
    }

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(
        `sku.ilike.%${search}%,name.ilike.%${search}%,description.ilike.%${search}%,barcode.eq.${search}`,
      );
    }

    if (category_id) {
      query = query.eq('category_id', category_id);
    } else if (typeof currentBranchId === 'number') {
      // Sin categoría específica: filtrar por categorías visibles del outlet
      const { data: cats } = await supabase
        .from('categories')
        .select('id')
        .eq('organization_id', this.organizationId)
        .eq('is_active', true)
        .or(`branch_id.is.null,branch_id.eq.${currentBranchId}`);
      const catIds = (cats || []).map((c: any) => c.id);
      if (catIds.length === 0) return { data: [], count: 0 };
      query = query.in('category_id', catIds);
    }

    const offset = (page - 1) * limit;
    const { data, error, count } = await query
      .order('name')
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // ... resto sin cambios (imágenes, variantes, stock, categorías, precios) ...
  }
}
```

> **Importante:** el filtro por branch **solo** aplica cuando no se pasa `category_id` explícito.
> Si el usuario del POS selecciona una categoría específica, se respeta (la categoría ya debería
> ser visible para el outlet según el selector de la UI).

> **Nota QA — RPC `pos_product_ranking`:** `getProductsPaginated` del POS usa el RPC
> `pos_product_ranking` para el ordenamiento `best_selling`. Este RPC necesita un parámetro
> `p_branch_id` (nullable) para filtrar por outlet a nivel de la consulta SQL. Esto requiere
> **alterar el RPC vía MCP de Supabase** (no archivo SQL). SQL propuesto:
>
> ```sql
> CREATE OR REPLACE FUNCTION public.pos_product_ranking(
>   p_org_id bigint,
>   p_branch_id bigint DEFAULT NULL,   -- ← NUEVO: nullable, filtra por outlet
>   p_limit int DEFAULT 12,
>   p_offset int DEFAULT 0
> )
> RETURNS TABLE (
>   product_id bigint,
>   total_sold numeric,
>   rank bigint
> )
> LANGUAGE sql
> AS $$
>   SELECT
>     p.id AS product_id,
>     COALESCE(SUM(oi.quantity), 0) AS total_sold,
>     ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(oi.quantity), 0) DESC) AS rank
>   FROM products p
>   JOIN categories c ON p.category_id = c.id
>   LEFT JOIN order_items oi ON oi.product_id = p.id
>   WHERE p.organization_id = p_org_id
>     AND p.status = 'active'
>     AND p.parent_product_id IS NULL
>     AND (p_branch_id IS NULL OR c.branch_id IS NULL OR c.branch_id = p_branch_id)
>   GROUP BY p.id
>   ORDER BY total_sold DESC
>   LIMIT p_limit OFFSET p_offset;
> $$;
> ```
>
> **Mientras no se pueda alterar el RPC**, filtrar en memoria los resultados por
> `category.branch_id`: traer los productos del RPC sin filtro, luego descartar los cuya
> categoría tenga `branch_id` distinto del outlet activo (y no sea `NULL`). Esto es menos
> eficiente pero funcional como solución temporal.

---

## 6. UI de gestión de categorías en ERP

Ruta: `C:\Users\USUARIO\CascadeProjects\go-admin-erp\src\app\app\inventario\categorias\`

### 6.1 Selector de outlet

En la página `page.tsx` (o en `useCategories.ts`), añadir un selector de outlet en la barra
superior. Al cambiar el outlet seleccionado, llamar `categoryService.getAll(orgId, branchId)`:

- **Todos / Global**: muestra todas las categorías de la org (sin filtro, `branchId = undefined`).
- **Outlet X**: muestra categorías del outlet X + las globales.

### 6.2 Asignar categoría a outlet al crear

En `CategoryForm.tsx` (`src/components/inventario/categorias/CategoryForm.tsx`), añadir un campo
**"Outlet"** (select) con opciones:

- **Global (todos los outlets)** → `branch_id = null`
- **[Nombre del outlet]** → `branch_id = X`

El campo se persiste en `formData.branch_id` y se envía al `categoryService.create`.

### 6.3 Indicador visual en la lista

En la tabla de categorías, añadir una columna o badge que indique si la categoría es **Global**
(`branch_id = null`) o pertenece a un outlet específico (mostrar el nombre del outlet).

---

## 7. Definition of Done

- [x] `getOrganizationCategories` filtra por `branchId` (categorías del outlet + globales)
- [x] `getOrganizationProducts` filtra por `branchId` vía categoría (subquery de category IDs)
- [x] `getMenuProducts` filtra por `branchId` vía categoría
- [x] `getProductsByCategory` valida que la categoría sea visible para el outlet
- [x] `getProductsByCategoryPaginated` valida `subcategoryId` pertenece al outlet
- [x] `getOfferProducts` acepta `branchId` y filtra por categoría (sección 9.1)
- [x] `getProductsByCategoryIds` acepta `branchId` y filtra categoryIds visibles (sección 9.2)
- [x] `getOrganizationServices` acepta `branchId` y filtra por categoría (sección 9.3)
- [x] `getProductsByIds` acepta `branchId` y filtra por categoría (sección 9.4)
- [x] `MenuView` acepta y propaga `branchId` como prop
- [x] Carrito de localStorage incluye `branchId` en la key (`cart_${subdomain}_${branchId}`)
- [x] `app/[[...slug]]/page.tsx` pasa `branchId` a **todas** las secciones (products_grid,
      featured_products, menu_preview, specialties, offers, promo_banners, categories_grid)
- [x] `filterStockByBranches` recibe `[branchId]` cuando hay outlet activo (no todas las web)
- [x] `categoryService.getAll` del ERP acepta `branchId` opcional y ordena por `display_order` + `rank`
- [x] `categoryService.create` del ERP acepta `branch_id` en `CategoryFormData`
- [x] `categoryService.updateByUuid` propaga `branch_id` igual que `update(id)`
- [x] `posService.getProductsPaginated` acepta `branchId` para filtrar catálogo del outlet
- [x] RPC `pos_product_ranking` alterado vía MCP con `p_branch_id` (o fallback en memoria)
- [x] Categorías globales (`branch_id = NULL`) siguen apareciendo en todos los outlets
- [x] Cada restaurante ve solo sus categorías + las globales
- [x] El hotel no ve categorías de comida de los restaurantes
- [ ] `npm run lint` + `tsc --noEmit` limpios en ambos repos
- [x] RLS sigue por `organization_id` (no se rompe el multi-tenant existente)
- [x] `getOrganizationCategories` filtra `is_active` y ordena por `display_order` + `rank` (alineado con ERP — sección 11)
- [x] Helper `getAllowedCategoryIds` extraído para eliminar subquery duplicada (sección 12)
- [x] Plan de pruebas definido para aislamiento de catálogo por outlet (sección 13)

---

## 8. Actualización del prefetch de secciones en page.tsx

Archivo: `C:\Users\USUARIO\goadmin-websites\app\[[...slug]]\page.tsx`

Las secciones `products_grid`, `featured_products`, `menu_preview`, `specialties`,
`offers`, `promo_banners` y `categories_grid` siguen llamando queries **sin `branchId`**.
Todos los pre-fetch de secciones deben pasar `branchId` (resuelto por F1) a las funciones
de catálogo. Sin esto, las secciones de la home muestran productos/categorías de otros
outlets.

Cambios concretos en cada `case` de secciones:

```typescript
const branchId = outlet?.id  // resuelto por middleware de F1

// products_grid / featured_products / specialties
getOrganizationProducts(organization.id, limit, branchId)

// categories_grid
getOrganizationCategories(organization.id, branchId)

// offers
getOfferProducts(organization.id, branchId)

// menu_preview
getMenuProducts(organization.id, limit, branchId)
getOrganizationCategories(organization.id, branchId)

// promo_banners (si lista productos por categoría)
getProductsByCategoryIds(organization.id, categoryIds, branchId)
```

Ejemplo concreto del `case 'products_grid'`:

```typescript
case 'products_grid': {
  const products = await getOrganizationProducts(
    organization.id,
    section.config.limit || 8,
    ctx.branchId,
  );
  // ... render de la grilla de productos (sin cambios en el componente)
  break;
}
```

> **Importante:** si `branchId` es `undefined` (sitio global sin outlet), las queries se
> comportan exactamente como antes — no se aplica filtro. Esto preserva los 81 sitios 1:1
> existentes.

---

## 9. Funciones catálogo adicionales que necesitan branchId

Además de las funciones documentadas en la sección 3, estas 4 funciones de `queries.ts`
necesitan aceptar `branchId` opcional y aplicar el mismo patrón de filtrado por categoría
(subquery de category IDs visibles del outlet + globales):

### 9.1 `getOfferProducts(orgId, branchId?)`

> **Nota QA R3**: usar `getAllowedCategoryIds` (sección 12) en lugar de la
> subquery manual mostrada abajo.

```typescript
export async function getOfferProducts(
  organizationId: number,
  branchId?: number | null,
) {
  const supabase = getSupabaseForPublicRead();

  let allowedCategoryIds: number[] | null = null;
  if (typeof branchId === 'number') {
    const { data: cats } = await supabase
      .from('categories')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .or(`branch_id.is.null,branch_id.eq.${branchId}`);
    allowedCategoryIds = (cats || []).map((c: any) => c.id);
    if (allowedCategoryIds.length === 0) return [];
  }

  let query = supabase
    .from('products')
    .select(`*, product_prices (*)`)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .is('parent_product_id', null)
    // ... filtro de ofertas existente (price < compare_at, etc.) ...

  if (typeof branchId === 'number' && allowedCategoryIds) {
    query = query.in('category_id', allowedCategoryIds);
  }

  // ... resto sin cambios ...
}
```

### 9.2 `getProductsByCategoryIds(orgId, categoryIds, branchId?)`

```typescript
export async function getProductsByCategoryIds(
  organizationId: number,
  categoryIds: number[],
  branchId?: number | null,
) {
  const supabase = getSupabaseForPublicRead();

  // Si hay branchId, filtrar los categoryIds a solo los visibles del outlet
  let effectiveCategoryIds = categoryIds;
  if (typeof branchId === 'number') {
    const { data: cats } = await supabase
      .from('categories')
      .select('id')
      .eq('organization_id', organizationId)
      .in('id', categoryIds)
      .or(`branch_id.is.null,branch_id.eq.${branchId}`);
    effectiveCategoryIds = (cats || []).map((c: any) => c.id);
    if (effectiveCategoryIds.length === 0) return [];
  }

  const { data, error } = await supabase
    .from('products')
    .select(`*, product_prices (*)`)
    .eq('organization_id', organizationId)
    .in('category_id', effectiveCategoryIds)
    .eq('status', 'active')
    .is('parent_product_id', null);

  if (error) return [];
  return normalizeProductPrices(data || []);
}
```

### 9.3 `getOrganizationServices(orgId, branchId?)`

> **Nota QA R3**: usar `getAllowedCategoryIds` (sección 12) en lugar de la
> subquery manual mostrada abajo.

```typescript
export async function getOrganizationServices(
  organizationId: number,
  branchId?: number | null,
) {
  const supabase = getSupabaseForPublicRead();

  // Los servicios heredan el branch de su categoría (mismo patrón que productos)
  let allowedCategoryIds: number[] | null = null;
  if (typeof branchId === 'number') {
    const { data: cats } = await supabase
      .from('categories')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .or(`branch_id.is.null,branch_id.eq.${branchId}`);
    allowedCategoryIds = (cats || []).map((c: any) => c.id);
    if (allowedCategoryIds.length === 0) return [];
  }

  let query = supabase
    .from('products')
    .select(`*, product_prices (*)`)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .eq('is_service', true);

  if (typeof branchId === 'number' && allowedCategoryIds) {
    query = query.in('category_id', allowedCategoryIds);
  }

  const { data, error } = await query;
  if (error) return [];
  return normalizeProductPrices(data || []);
}
```

### 9.4 `getProductsByIds(orgId, productIds, branchId?)`

> **Nota QA R3**: usar `getAllowedCategoryIds` (sección 12) en lugar de la
> subquery manual mostrada abajo.

```typescript
export async function getProductsByIds(
  organizationId: number,
  productIds: number[],
  branchId?: number | null,
) {
  const supabase = getSupabaseForPublicRead();

  let query = supabase
    .from('products')
    .select(`
      *,
      product_prices (*),
      product_images (
        id, storage_path, is_primary, display_order, shared_image_id,
        shared_images ( storage_path )
      )
    `)
    .eq('organization_id', organizationId)
    .in('id', productIds)
    .eq('status', 'active');

  // Si hay branchId, filtrar por categorías visibles del outlet
  if (typeof branchId === 'number') {
    const { data: cats } = await supabase
      .from('categories')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .or(`branch_id.is.null,branch_id.eq.${branchId}`);
    const allowedCategoryIds = (cats || []).map((c: any) => c.id);
    if (allowedCategoryIds.length === 0) return [];
    query = query.in('category_id', allowedCategoryIds);
  }

  const { data, error } = await query;
  if (error) return [];
  return normalizeProductPrices(data || []);
}
```

> **Patrón común:** las 4 funciones usan el mismo mecanismo — subquery de `categories.id`
> con `.or(\`branch_id.is.null,branch_id.eq.${branchId}\`)` y luego `.in('category_id', ...)`
> en la query de productos. Si `branchId` es `undefined`, no se aplica ningún filtro.

---

## 10. Riesgos y decisiones

### 10.1 Productos sin categoría (`category_id IS NULL`)

**Decisión:** los productos con `category_id IS NULL` **no se muestran** en ningún outlet. Solo
aparecen en el sitio global de la org (sin outlet, `branchId = undefined`), donde las queries no
filtran por categoría.

**Razón:** no hay forma de inferir el branch de un producto sin categoría. Forzarlos a aparecer
en todos los outlets rompería el aislamiento del catálogo. Si se quieren mostrar en un outlet,
deben asignarse a una categoría de ese outlet.

### 10.2 Cambio de categoría entre outlets

Si un producto cambia de una categoría del outlet A a una categoría del outlet B, el producto
"se mueve" de outlet. El **stock se mantiene** porque `stock_levels` es por `branch_id`
(independiente de la categoría), no por categoría. Es decir:

- El producto tenía stock en `stock_levels(branch_id=A)` → ese stock sigue ahí.
- Si ahora pertenece al outlet B, el sitio del outlet B mostrará el stock de `stock_levels(branch_id=B)`.
- Mover el producto de categoría **no** mueve el stock entre branches.

> Esto es correcto: el stock es un concepto operativo (inventario físico por sucursal), no de
> catálogo. El catálogo solo decide **qué** se muestra, no **cuánto** hay.

### 10.3 Subcategorías heredan branch

Si una categoría padre tiene `branch_id = X`, sus subcategorías deberían tener el mismo
`branch_id` (o ser globales). La UI de categorías debe **heredar** el `branch_id` del padre al
crear una subcategoría, y validar que no se cree una subcategoría global bajo una categoría de
outlet (o viceversa). Esto se valida en `CategoryForm.tsx`.

### 10.4 Performance

El filtrado de productos requiere un paso extra (subquery de category IDs) cuando hay `branchId`.
Para orgs con muchas categorías (775 en la BD actual), esta subquery es ligera (solo `select id`
con un `.or()`). No se espera impacto de performance significativo.

### 10.5 Compatibilidad con sitios 1:1 existentes

Si `branchId` es `undefined` (sitio global sin outlet), todas las queries se comportan **exactamente
igual que antes** — no se aplica ningún filtro. Esto garantiza que los 81 sitios 1:1 existentes
no se rompan al desplegar F3.

---

## 11. Alineación de criterios entre sitio público y ERP

**Problema detectado (QA R3):** `getOrganizationCategories` en `queries.ts` (sitio público) no
filtraba `is_active` y ordenaba solo por `rank`, mientras que `categoryService.getAll` en el ERP
filtra `.eq('is_active', true)` y ordena por `display_order` + `rank`. Esta inconsistencia hace
que el admin vea un conjunto y orden distinto al que ve el cliente en el sitio.

**Corrección:** alinear `getOrganizationCategories` (sitio público) con `categoryService.getAll`
(ERP):

| Criterio | ERP (`categoryService.getAll`) | Sitio público (`getOrganizationCategories`) |
|---|---|---|
| `is_active` | `.eq('is_active', true)` | `.eq('is_active', true)` ← **NUEVO** |
| Orden 1 | `.order('display_order', { ascending: true })` | `.order('display_order', { ascending: true })` ← **NUEVO** |
| Orden 2 | `.order('rank', { ascending: true })` | `.order('rank', { ascending: true })` |
| Filtro branch | `.or(\`branch_id.is.null,branch_id.eq.${branchId}\`)` | `.or(\`branch_id.is.null,branch_id.eq.${branchId}\`)` |

**Justificación:** el sitio público no debe mostrar categorías inactivas. El ordenamiento debe
ser consistente entre ERP y sitio para que el admin vea lo mismo que el cliente. Si el admin
reordena categorías via `display_order` en el ERP, ese orden se refleja inmediatamente en el
sitio público.

**Snippet actualizado** (ver sección 3.1 para el contexto completo):

```typescript
let query = supabase
  .from('categories')
  .select('*')
  .eq('organization_id', organizationId)
  .eq('is_active', true)                          // ← alineado con ERP
  .order('display_order', { ascending: true })    // ← alineado con ERP
  .order('rank', { ascending: true });            // ← orden secundario
```

> **Impacto en sitios existentes:** las categorías inactivas que antes se mostraban en el sitio
> público dejarán de aparecer. Esto es el comportamiento correcto — una categoría inactiva no
> debería ser visible para el cliente. Si algún sitio dependía de mostrar categorías inactivas
> (caso atípico), debe activarlas en el ERP.

---

## 12. Helper reutilizable para category IDs por outlet

**Problema detectado (QA R3):** el patrón de subquery para obtener los IDs de categorías
visibles por outlet se repite en ~7 funciones (`getOrganizationProducts`, `getMenuProducts`,
`getOfferProducts`, `getOrganizationServices`, `getProductsByIds`, `posService.getProductsPaginated`,
y parcialmente en `getProductsByCategoryIds`). Esto dificulta el mantenimiento y es propenso a
inconsistencias.

**Corrección:** extraer un helper reutilizable y usarlo en todas las funciones de productos:

```typescript
async function getAllowedCategoryIds(organizationId: number, branchId?: number | null): Promise<number[]> {
  let query = supabase
    .from('categories')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)  // ← NUEVO: alineado con getOrganizationCategories
  
  if (typeof branchId === 'number') {
    query = query.or(`branch_id.is.null,branch_id.eq.${branchId}`);
  } else if (branchId === null) {
    query = query.is('branch_id', null);
  }
  
  const { data } = await query;
  return (data || []).map(c => c.id);
}
```

**Uso en las funciones de productos** (ejemplo con `getOrganizationProducts`):

```typescript
export async function getOrganizationProducts(
  organizationId: number,
  limit = 12,
  branchId?: number | null,
) {
  const supabase = getSupabaseForPublicRead();

  let allowedCategoryIds: number[] | null = null;
  if (typeof branchId === 'number') {
    allowedCategoryIds = await getAllowedCategoryIds(organizationId, branchId);
    if (allowedCategoryIds.length === 0) return [];
  }

  let query = supabase
    .from('products')
    .select(`/* ... */`)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .is('parent_product_id', null);

  if (typeof branchId === 'number' && allowedCategoryIds) {
    query = query.in('category_id', allowedCategoryIds);
  }

  // ... resto de la función ...
}
```

**Funciones que deben migrar al helper:**

| Función | Archivo | Sección |
|---|---|---|
| `getOrganizationProducts` | `queries.ts` | 3.2 |
| `getMenuProducts` | `queries.ts` | 3.3 |
| `getOfferProducts` | `queries.ts` | 9.1 |
| `getOrganizationServices` | `queries.ts` | 9.3 |
| `getProductsByIds` | `queries.ts` | 9.4 |
| `getProductsByCategoryIds` | `queries.ts` | 9.2 (variante: filtra sobre `categoryIds` recibidos) |
| `posService.getProductsPaginated` | `posService.ts` | 5.2 |

> **Nota:** `getProductsByCategoryIds` (sección 9.2) es una variante — filtra los `categoryIds`
> recibidos contra los visibles del outlet, en lugar de obtener todos los IDs desde cero. Puede
> usar el helper y luego intersectar con los `categoryIds` del argumento, o mantener su lógica
> específica pero idealmente reutilizando el mismo patrón de query.

> **Nota QA:** el helper debe residir en `queries.ts` (sitio público) y en `posService.ts` (ERP)
> por separado, ya que cada repositorio tiene su propia instancia de Supabase client. No se
> comparte código entre repos.

---

## 13. Plan de pruebas

Casos de prueba para validar el aislamiento de catálogo por outlet. Cada caso debe ejecutarse
contra la BD real (proyecto `jgmgphmzusbluqhuqihj`) con datos de una org multi-outlet (ej. org
con hotel `branch_id=1`, restaurante 1 `branch_id=2`, restaurante 2 `branch_id=3`).

### 13.1 Hotel no ve productos de restaurante (branch_id filter)

- **Precondición:** existe una categoría `Comida` con `branch_id=2` (restaurante 1) con
  productos asociados.
- **Acción:** cargar el sitio del hotel (`branchId=1`), sección `products_grid` o `menu`.
- **Resultado esperado:** los productos de la categoría `Comida` (branch_id=2) **no aparecen**.
  Solo se muestran productos de categorías con `branch_id=1` o `branch_id IS NULL`.

### 13.2 Restaurante 1 no ve productos de Restaurante 2

- **Precondición:** restaurante 1 (`branch_id=2`) y restaurante 2 (`branch_id=3`) tienen
  categorías exclusivas con productos.
- **Acción:** cargar el sitio del restaurante 1 (`branchId=2`).
- **Resultado esperado:** los productos de categorías con `branch_id=3` **no aparecen**. Solo
  se muestran productos de `branch_id=2` + `branch_id IS NULL`.

### 13.3 Categoría inactiva no aparece en sitio público

- **Precondición:** existe una categoría `Promo Temporal` con `is_active=false` y
  `branch_id IS NULL` (global).
- **Acción:** cargar cualquier sitio de la org (global o outlet).
- **Resultado esperado:** la categoría `Promo Temporal` **no aparece** en el listado de
  categorías ni en los productos asociados. Esto valida el filtro `.eq('is_active', true)`
  añadido en la sección 11.

### 13.4 Productos sin categoría no aparecen en outlet

- **Precondición:** existe un producto con `category_id IS NULL` y `status='active'`.
- **Acción:** cargar el sitio de un outlet (`branchId=2`).
- **Resultado esperado:** el producto sin categoría **no aparece**. Solo aparece en el sitio
  global (`branchId=undefined`), donde no se filtra por categoría. Ver sección 10.1.

### 13.5 Sitio global (sin outlet) ve todos los productos

- **Precondición:** org con productos en categorías de distintos branches + productos globales.
- **Acción:** cargar el sitio global de la org (`branchId=undefined`).
- **Resultado esperado:** se muestran **todos** los productos activos de la org, sin filtro de
  branch. Esto valida la compatibilidad con sitios 1:1 existentes (sección 10.5).

### 13.6 Stock de otra sucursal no aparece en menú del outlet

- **Precondición:** producto P pertenece a una categoría global. Tiene
  `stock_levels(branch_id=2, qty=100)` y `stock_levels(branch_id=3, qty=50)`.
- **Acción:** cargar el menú del restaurante 1 (`branchId=2`).
- **Resultado esperado:** el producto P aparece, pero el stock mostrado es **solo** el de
  `branch_id=2` (qty=100). El stock de `branch_id=3` no se muestra. Valida
  `filterStockByBranches([branchId], ...)` de las secciones 3.2–3.4.

### 13.7 subcategoryId de otro outlet → error 404

- **Precondición:** existe una subcategoría S con `branch_id=3` (restaurante 2), bajo una
  categoría padre global.
- **Acción:** desde el sitio del restaurante 1 (`branchId=2`), navegar a
  `/categoria/[slug]?subcategoryId=<id de S>`.
- **Resultado esperado:** `getProductsByCategoryPaginated` detecta que la subcategoría S no es
  visible para `branchId=2` y devuelve `{ products: [], total: 0 }`. La página renderiza un
  404 o "categoría no encontrada". Valida la validación de sección 3.5.
