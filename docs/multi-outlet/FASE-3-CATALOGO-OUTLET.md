# Fase 3 — Catálogo por outlet (categories.branch_id + products filtrado)

> Fecha: 2026-08-31
> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: **F0** (Fundaciones BD — `categories.branch_id` nullable) y **F1** (resolución de outlet en middleware)
> Repos ERP: `C:\Users\USUARIO\CascadeProjects\go-admin-erp`
> Repos Sitio: `C:\Users\USUARIO\goadmin-websites`

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

> **Nota de ordenamiento:** la query actual de `getOrganizationCategories` (línea 433 de
> `queries.ts`) ordena **únicamente** por `.order('rank', { ascending: true })`. No existe
> `display_order` en el ordenamiento actual. Se mantiene este comportamiento sin cambios para
> no alterar el orden visual existente en los 81 sitios en producción.

---

## 3. Cambios en `queries.ts` (goadmin-websites)

Archivo: `C:\Users\USUARIO\goadmin-websites\lib\supabase\queries.ts`

### 3.1 `getOrganizationCategories(orgId, branchId?)`

Hoy (línea 433) ignora el branch y ordena **únicamente** por `.order('rank', { ascending: true })`
— no usa `display_order`. Nueva versión acepta `branchId` opcional y filtra con `.or()`,
**manteniendo el ordenamiento actual por `rank`** (no se agrega `display_order`):

```typescript
export async function getOrganizationCategories(
  organizationId: number,
  branchId?: number,
) {
  const supabase = getSupabaseForPublicRead();

  let query = supabase
    .from('categories')
    .select('*')
    .eq('organization_id', organizationId)
    .order('rank', { ascending: true });  // ← único orden, igual que el código actual

  // Si hay outlet, traer categorías del outlet + las globales (branch_id IS NULL)
  if (branchId) {
    query = query.or(`branch_id.is.null,branch_id.eq.${branchId}`);
  }

  const { data, error } = await query;
  if (error) return [];
  return enrichCategoriesWithFallbackImage(supabase, data || []);
}
```

> **Importante:** el código real (línea 433) no filtra por `is_active` ni ordena por
> `display_order`. Se mantiene el comportamiento actual: solo `.eq('organization_id')` +
> `.order('rank', { ascending: true })`. No se agrega `is_active` ni `display_order` para no
> alterar el resultado de los sitios existentes.

> **Nota:** `enrichCategoriesWithFallbackImage` (línea 40) ya cuenta productos activos por
> categoría. Como las categorías ya vienen filtradas por branch, el conteo de productos es
> consistente — solo cuenta productos de las categorías visibles. No requiere cambios.

### 3.2 `getOrganizationProducts(orgId, limit, branchId?)`

Hoy (línea 247) trae todos los productos activos de la org. Nueva versión filtra por branch de
la categoría vía subquery en dos pasos (PostgREST no soporta `JOIN ... WHERE` directo, así que
se resuelve con un `in('category_id', branchCategoryIds)`):

```typescript
export async function getOrganizationProducts(
  organizationId: number,
  limit = 12,
  branchId?: number,
) {
  const supabase = getSupabaseForPublicRead();

  // 1. Si hay branchId, obtener los IDs de categorías visibles para ese outlet
  let allowedCategoryIds: number[] | null = null;
  if (branchId) {
    const { data: cats } = await supabase
      .from('categories')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .or(`branch_id.is.null,branch_id.eq.${branchId}`);
    allowedCategoryIds = (cats || []).map((c: any) => c.id);
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

  if (branchId && allowedCategoryIds) {
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

  const webBranchIds = await getWebStockBranchIds(organizationId);

  return filterStockByBranches(
    normalizeProductPrices((data || []).map((p: any) => ({
      ...p,
      has_variants: p.is_parent === true,
      variant_count: variantCountMap[p.id] || 0,
    }))),
    webBranchIds,
  );
}
```

### 3.3 `getMenuProducts(orgId, limit, branchId?)`

Hoy (línea 1460) trae todos los productos para el menú digital. Nueva versión con el mismo
patrón de filtrado por categoría:

```typescript
export async function getMenuProducts(
  organizationId: number,
  limit = 100,
  branchId?: number,
) {
  const supabase = getSupabaseForPublicRead();

  // 1. Si hay branchId, obtener IDs de categorías visibles del outlet
  let allowedCategoryIds: number[] | null = null;
  if (branchId) {
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

  if (branchId && allowedCategoryIds) {
    query = query.in('category_id', allowedCategoryIds);
  }

  const { data, error } = await query
    .order('name', { ascending: true })
    .limit(limit);

  if (error) return [];
  const webBranchIds = await getWebStockBranchIds(organizationId);
  return filterStockByBranches(normalizeProductPrices(data || []), webBranchIds);
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
  branchId?: number,
) {
  const supabase = getSupabaseForPublicRead();

  // Si hay branchId, validar que la categoría sea visible para ese outlet
  if (branchId) {
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
    .select(`*, product_prices (*)`)
    .eq('organization_id', organizationId)
    .eq('category_id', categoryId)
    .eq('status', 'active')
    .is('parent_product_id', null);

  if (error) return [];
  return normalizeProductPrices(data || []);
}
```

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
    branchId?: number  // ← NUEVO
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

    // ← NUEVO: si hay branchId, filtrar subcategorías visibles del outlet
    if (branchId) {
      subQuery = subQuery.or(`branch_id.is.null,branch_id.eq.${branchId}`)
    }

    const { data: subs } = await subQuery
    if (subs && subs.length > 0) {
      categoryIds = [...categoryIds, ...subs.map((s: any) => s.id)]
    }
  } else {
    categoryIds = [subcategoryId]
  }

  // ← NUEVO: si hay branchId, validar que la categoría padre sea visible para el outlet
  if (branchId) {
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
> 1. Se añade `branchId?: number` al tipo `options`.
> 2. Se desestructura `branchId` de `options`.
> 3. Si hay `branchId`, la subquery de subcategorías añade `.or(\`branch_id.is.null,branch_id.eq.${branchId}\`)`.
> 4. Si hay `branchId`, se valida que la categoría padre sea visible para el outlet antes de
>    devolver productos (evita acceso cross-outlet via `/categoria/[slug]`).
> 5. El resto de la función (ordenamiento `best_selling`, paginación en memoria, etc.) no cambia.

---

## 4. Cambios en `MenuView.tsx`

Archivo: `C:\Users\USUARIO\goadmin-websites\components\site\MenuView.tsx`

### 4.1 Aceptar prop `branchId?: number`

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
  branchId?: number  // ← NUEVO
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
async getAll(organizationId: number, branchId?: number): Promise<Category[]> {
  let query = supabase
    .from('categories')
    .select('*')
    .eq('organization_id', organizationId);

  if (branchId) {
    // Categorías del outlet + globales
    query = query.or(`branch_id.is.null,branch_id.eq.${branchId}`);
  }

  const { data, error } = await query
    .order('rank', { ascending: true });  // ← único orden, consistente con queries.ts

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
  branchId?: number;  // ← NUEVO
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
    } else if (branchId) {
      // Sin categoría específica: filtrar por categorías visibles del outlet
      const { data: cats } = await supabase
        .from('categories')
        .select('id')
        .eq('organization_id', this.organizationId)
        .eq('is_active', true)
        .or(`branch_id.is.null,branch_id.eq.${branchId}`);
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

- [ ] `getOrganizationCategories` filtra por `branchId` (categorías del outlet + globales)
- [ ] `getOrganizationProducts` filtra por `branchId` vía categoría (subquery de category IDs)
- [ ] `getMenuProducts` filtra por `branchId` vía categoría
- [ ] `getProductsByCategory` valida que la categoría sea visible para el outlet
- [ ] `MenuView` acepta y propaga `branchId` como prop
- [ ] Carrito de localStorage incluye `branchId` en la key (`cart_${subdomain}_${branchId}`)
- [ ] `app/[[...slug]]/page.tsx` pasa `branchId` (resuelto por F1) a las queries y a `MenuView`
- [ ] `categoryService.getAll` del ERP acepta `branchId` opcional
- [ ] `categoryService.create` del ERP acepta `branch_id` en `CategoryFormData`
- [ ] `posService.getProductsPaginated` acepta `branchId` para filtrar catálogo del outlet
- [ ] Categorías globales (`branch_id = NULL`) siguen apareciendo en todos los outlets
- [ ] Cada restaurante ve solo sus categorías + las globales
- [ ] El hotel no ve categorías de comida de los restaurantes
- [ ] `npm run lint` + `tsc --noEmit` limpios en ambos repos
- [ ] RLS sigue por `organization_id` (no se rompe el multi-tenant existente)

---

## 8. Riesgos y decisiones

### 8.1 Productos sin categoría (`category_id IS NULL`)

**Decisión:** los productos con `category_id IS NULL` **no se muestran** en ningún outlet. Solo
aparecen en el sitio global de la org (sin outlet, `branchId = undefined`), donde las queries no
filtran por categoría.

**Razón:** no hay forma de inferir el branch de un producto sin categoría. Forzarlos a aparecer
en todos los outlets rompería el aislamiento del catálogo. Si se quieren mostrar en un outlet,
deben asignarse a una categoría de ese outlet.

### 8.2 Cambio de categoría entre outlets

Si un producto cambia de una categoría del outlet A a una categoría del outlet B, el producto
"se mueve" de outlet. El **stock se mantiene** porque `stock_levels` es por `branch_id`
(independiente de la categoría), no por categoría. Es decir:

- El producto tenía stock en `stock_levels(branch_id=A)` → ese stock sigue ahí.
- Si ahora pertenece al outlet B, el sitio del outlet B mostrará el stock de `stock_levels(branch_id=B)`.
- Mover el producto de categoría **no** mueve el stock entre branches.

> Esto es correcto: el stock es un concepto operativo (inventario físico por sucursal), no de
> catálogo. El catálogo solo decide **qué** se muestra, no **cuánto** hay.

### 8.3 Subcategorías heredan branch

Si una categoría padre tiene `branch_id = X`, sus subcategorías deberían tener el mismo
`branch_id` (o ser globales). La UI de categorías debe **heredar** el `branch_id` del padre al
crear una subcategoría, y validar que no se cree una subcategoría global bajo una categoría de
outlet (o viceversa). Esto se valida en `CategoryForm.tsx`.

### 8.4 Performance

El filtrado de productos requiere un paso extra (subquery de category IDs) cuando hay `branchId`.
Para orgs con muchas categorías (775 en la BD actual), esta subquery es ligera (solo `select id`
con un `.or()`). No se espera impacto de performance significativo.

### 8.5 Compatibilidad con sitios 1:1 existentes

Si `branchId` es `undefined` (sitio global sin outlet), todas las queries se comportan **exactamente
igual que antes** — no se aplica ningún filtro. Esto garantiza que los 81 sitios 1:1 existentes
no se rompan al desplegar F3.
