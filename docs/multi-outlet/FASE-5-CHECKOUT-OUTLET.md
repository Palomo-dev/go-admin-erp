# Fase 5 — Checkout multi-outlet (branch_id en carrito + pedido)

> Fecha: 2026-08-31
> Depende de: **F1** (resolución de outlet), **F3** (catálogo por outlet)
> Repos Sitio: `C:\Users\USUARIO\goadmin-websites`
> Repos ERP: `C:\Users\USUARIO\CascadeProjects\go-admin-erp`

> **⚠️ Nota crítica — Dependencia F1:** F5 depende de F1. `getOrgContext()` debe
> devolver `branchId` en su return. Si F1 no está implementado, el ejemplo
> `app/checkout/page.tsx` no compilará. F5 asume que F1 ya entregó `branchId`
> en el contexto.

> **⚠️ Nota crítica — Documento de diseño:** Este documento es diseño. La
> implementación requiere modificar: `MenuView.tsx`, `CheckoutWizard.tsx`,
> `app/api/orders/route.ts`, `app/api/web-orders/route.ts`. Ver sección
> "Archivos a modificar" para el listado completo.

> **⚠️ Nota alta — Validación de branchId obligatoria:** La validación DEBE
> implementarse antes de confiar en `branchId` del cliente. Sin validación, un
> cliente malicioso puede enviar `branchId` de otra org. Ver secciones 4.2 y
> 5.2.

## 1. Objetivo

El checkout envía el `branch_id` del outlet activo **explícitamente**, sin usar
el fallback global. Los pedidos web caen al branch correcto.

Hoy el flujo es:

```
MenuView → carrito localStorage (sin branchId)
         → CheckoutWizard → POST /api/orders (sin branchId)
         → /api/orders resuelve branchId con fallback:
              is_web_stock_source → is_main → primera sucursal
```

El flujo objetivo es:

```
MenuView (outlet=restaurante-1, branchId=2)
         → carrito localStorage cart_${subdomain}_2
         → CheckoutWizard recibe branchId=2
         → POST /api/orders con branchId=2 explícito
         → /api/orders valida que branch 2 ∈ org y lo usa directo (sin fallback)
         → web_orders.branch_id = 2
         → stock_levels se descuenta del branch 2
```

## 2. Cambios en `MenuView.tsx` (carrito)

**Archivo:** `C:\Users\USUARIO\goadmin-websites\components\site\MenuView.tsx`

### 2.1 Prop nueva: `branchId`

El componente recibe el `branchId` del outlet activo (resuelto en F1). Si no hay
outlet (sitio global), es `undefined`.

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
  branchId?: number | null | undefined  // ← NUEVO: outlet activo
}
```

### 2.2 Key de localStorage incluye branchId

Hoy (línea 242):

```typescript
const cartKey = `cart_${organizationSubdomain}`
```

Nuevo:

```typescript
// Si hay outlet, la key incluye branchId → carritos separados por outlet.
// Si no hay outlet (sitio global), branchId es undefined → key sin sufijo
// (backward compat con carritos existentes).
const cartKey = typeof branchId === 'number'
  ? `cart_${organizationSubdomain}_${branchId}`
  : `cart_${organizationSubdomain}`
```

### 2.3 El carrito guarda `branchId` en su estado

Para que `CheckoutWizard` pueda leer el `branchId` del carrito (además de
recibirlo por props), cada item del carrito incluye `branchId`:

```typescript
const addToCart = (
  product: MenuProduct,
  quantity: number,
  notes: string,
  modifiers: CartModifier[],
  newModifiers: SelectedModifier[]
) => {
  const basePrice = product.product_prices?.[0]?.price || 0
  const extraTotal = newModifiers.reduce((sum, m) => sum + (m.extraPrice || 0), 0)
  const effectivePrice = Number(basePrice) + extraTotal
  const cartKey = typeof branchId === 'number'
    ? `cart_${organizationSubdomain}_${branchId}`
    : `cart_${organizationSubdomain}`
  const existingCart = JSON.parse(localStorage.getItem(cartKey) || '[]')
  const imgUrl = getProductImageUrl(product)

  const oldModKey = modifiers.map(m => `${m.valueId}`).sort().join('-')
  const newModKey = newModifiers.map(m => m.modifierId).sort().join('-')
  const modKey = [oldModKey, newModKey].filter(Boolean).join('-')
  const cartItemId = modKey ? `${product.id}_${modKey}` : product.id

  const existingIndex = existingCart.findIndex((item: any) => item.id === cartItemId)

  if (existingIndex >= 0) {
    existingCart[existingIndex].quantity += quantity
    if (notes) existingCart[existingIndex].notes = notes
  } else {
    existingCart.push({
      id: cartItemId,
      productId: product.id,
      name: product.name,
      price: effectivePrice,
      quantity,
      branchId, // ← NUEVO: el carrito sabe a qué outlet pertenece
      ...(imgUrl && { imageUrl: imgUrl }),
      ...(notes && { notes }),
      ...(modifiers.length > 0 && { modifiers }),
      ...(newModifiers.length > 0 && { newModifiers })
    })
  }

  localStorage.setItem(cartKey, JSON.stringify(existingCart))
  window.dispatchEvent(new CustomEvent('cart-updated'))

  // ... feedback visual existente ...
  setSelectedProduct(null)
}
```

### 2.4 Signature del componente

```typescript
export function MenuView({
  products, categories, tags, modifierTypes, variantRelations, modifierGroupsMap,
  primaryColor, organizationSubdomain, organizationName,
  customerId, organizationId, initialFavorites = [],
  branchId  // ← NUEVO
}: MenuViewProps) {
```

## 3. Cambios en `CheckoutWizard.tsx`

**Archivo:** `C:\Users\USUARIO\goadmin-websites\components\site\CheckoutWizard.tsx`

### 3.1 Prop nueva: `branchId`

```typescript
interface CheckoutWizardProps {
  organizationId: number
  primaryColor: string
  paymentMethods: WebsitePaymentMethod[]
  checkoutSettings?: CheckoutSettings
  isRestaurant?: boolean
  organizationSubdomain?: string
  branchId?: number | null | undefined  // ← NUEVO: outlet activo
}

export function CheckoutWizard({
  organizationId, primaryColor, paymentMethods: availableMethods,
  checkoutSettings, isRestaurant = false, organizationSubdomain,
  branchId  // ← NUEVO
}: CheckoutWizardProps) {
```

### 3.2 Leer carrito con key que incluye branchId

Hoy (línea 230):

```typescript
const savedCart = localStorage.getItem(`cart_${subdomain}`)
```

Nuevo:

```typescript
// organizationSubdomain debe venir siempre por prop desde el contexto server.
// Si es undefined, el carrito legacy usa key `cart_${organizationId}` como fallback.
const subdomain = organizationSubdomain
const cartKey = typeof branchId === 'number'
  ? `cart_${subdomain}_${branchId}`
  : `cart_${subdomain}`
const savedCart = localStorage.getItem(cartKey)
```

> **Nota:** `organizationSubdomain` debe venir siempre por prop desde el
> contexto server. Si es `undefined`, el carrito legacy usa key
> `cart_${organizationId}` como fallback. **No** usar
> `window.location.hostname.split('.')[0]` — en custom domains el subdomain
> no se infiere del hostname.

Lo mismo en `updateQuantity` (línea 330) y `removeItem` (línea 340):

```typescript
const updateQuantity = (id: number | string, delta: number) => {
  setCartItems(items => {
    const updated = items.map(item => {
      if (item.id === id) {
        return { ...item, quantity: Math.max(0, item.quantity + delta) }
      }
      return item
    }).filter(item => item.quantity > 0)

    // organizationSubdomain viene siempre por prop desde el contexto server.
    // Si es undefined, el carrito legacy usa key `cart_${organizationId}` como fallback.
    const subdomain = organizationSubdomain
    const cartKey = typeof branchId === 'number'
      ? `cart_${subdomain}_${branchId}`
      : `cart_${subdomain}`
    localStorage.setItem(cartKey, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('cart-updated'))
    return updated
  })
}

const removeItem = (id: number | string) => {
  setCartItems(items => {
    const updated = items.filter(item => item.id !== id)
    const subdomain = organizationSubdomain
    const cartKey = typeof branchId === 'number'
      ? `cart_${subdomain}_${branchId}`
      : `cart_${subdomain}`
    localStorage.setItem(cartKey, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('cart-updated'))
    return updated
  })
}
```

### 3.3 Incluir `branchId` en `orderPayload`

Hoy (líneas 465-483) el payload no incluye `branchId`:

```typescript
const orderPayload: any = {
  organizationId,
  customer: customerData,
  ...(customerId && { customerId }),
  items: cartItems.map(item => ({ ... })),
  subtotal,
  shipping,
  total,
  paymentMethod
}
```

Nuevo — incluir `branchId` explícito del outlet. Se conecta con el helper
`getBranchIdFromCart` (definido en sección 7.1) para que, si el prop `branchId`
no llegó (p.ej. checkout client-side sin contexto server), se lea del primer
item del carrito en localStorage:

```typescript
// Resolución final de branchId: prop del contexto → fallback al carrito.
const finalBranchId = branchId ?? getBranchIdFromCart(cartItems);

const orderPayload: any = {
  organizationId,
  // branchId explícito del outlet activo.
  // Si es undefined (sitio global sin outlet), /api/orders usa el fallback.
  ...(finalBranchId && { branchId: finalBranchId }),
  customer: customerData,
  ...(customerId && { customerId }),
  items: cartItems.map(item => ({
    id: item.productId || item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    sku: (item as any).sku || null,
    ...(item.modifiers && item.modifiers.length > 0 && { modifiers: item.modifiers }),
    ...(item.newModifiers && item.newModifiers.length > 0 && { newModifiers: item.newModifiers }),
    ...(item.notes && { notes: item.notes })
  })),
  subtotal,
  shipping,
  total,
  paymentMethod
}
```

> **Nota:** `finalBranchId` se omite del payload si es `undefined`/`null`
> (sitio global). Así el backend mantiene el fallback para sitios sin outlet.
> El helper `getBranchIdFromCart` garantiza que el `branchId` del carrito
> (guardado por `MenuView.addToCart`) se propague al payload aunque el prop
> no haya llegado por contexto.

## 4. Cambios en `app/api/orders/route.ts` (goadmin-websites)

**Archivo:** `C:\Users\USUARIO\goadmin-websites\app\api\orders\route.ts`

### 4.1 Estado actual

La línea 25 ya destructura `branchId` del body:

```typescript
const {
  organizationId, branchId, customer, customerId: authCustomerId, items,
  ...
} = body
```

Y las líneas 44-57 resuelven `resolvedBranchId` con fallback **solo si**
`branchId` no viene:

```typescript
let resolvedBranchId = branchId
if (!resolvedBranchId) {
  const { data: branches } = await (supabase as any)
    .from('branches')
    .select('id, is_main, is_web_stock_source')
    .eq('organization_id', organizationId)
    .order('id', { ascending: true })

  const list = branches || []
  resolvedBranchId =
    list.find((b: any) => b.is_web_stock_source)?.id ??
    list.find((b: any) => b.is_main)?.id ??
    list[0]?.id
}
```

Esto ya está casi bien: si `branchId` viene en el request, lo usa directo. **El
cambio requerido es agregar validación de seguridad** — verificar que el
`branchId` recibido pertenece a la `organizationId`.

### 4.2 Cambio: validar que branchId pertenece a la organización

Reemplazar el bloque de resolución (líneas 44-57) por:

```typescript
// ── Obtener branch_id (necesario para stock) ──
// Si el request trae branchId (outlet activo), usarlo directo — sin fallback.
// Si no viene (sitio global sin outlet), resolver con fallback:
//   is_web_stock_source → is_main → primera sucursal.
let resolvedBranchId = branchId

if (typeof resolvedBranchId === 'number') {
  // Validar que el branchId pertenece a la organización (seguridad).
  // Evita que un cliente envíe un branchId de otra org.
  const { data: branch } = await (supabase as any)
    .from('branches')
    .select('id')
    .eq('id', resolvedBranchId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!branch) {
    return NextResponse.json(
      { error: 'branch_id no pertenece a la organización' },
      { status: 400 }
    )
  }
} else {
  // Fallback: sitio global sin outlet.
  const { data: branches } = await (supabase as any)
    .from('branches')
    .select('id, is_main, is_web_stock_source')
    .eq('organization_id', organizationId)
    .order('id', { ascending: true })

  const list = branches || []
  resolvedBranchId =
    list.find((b: any) => b.is_web_stock_source)?.id ??
    list.find((b: any) => b.is_main)?.id ??
    list[0]?.id
}
```

> **Nota QA R6 — validación de `is_web_published` no duplicada:** la validación
> de `is_web_published` la garantiza F1
> (`getOutletBySlug`/`getOutletBySubdomain`/`getOutletByCustomDomain` filtran
> `is_web_published=true`). El backend de `/api/orders` y `/api/web-orders`
> validan pertenencia a la org. No se duplica la validación de publicación en
> el backend de órdenes — si un branch no está publicado, el middleware no
> resuelve su outlet y el cliente no tendría el `branchId`.

### 4.3 Resumen del comportamiento

| Escenario | `body.branchId` | Acción |
|---|---|---|
| Outlet activo (restaurante-1) | `2` | Validar `branch 2 ∈ org` → usar directo |
| Sitio global sin outlet | `undefined` | Fallback: `is_web_stock_source → is_main → primera` |
| branchId de otra org (ataque) | `999` | Validación falla → `400` |

## 5. Cambios en `app/api/web-orders/route.ts` (go-admin-erp)

**Archivo:** `C:\Users\USUARIO\CascadeProjects\go-admin-erp\src\app\api\web-orders\route.ts`

### 5.1 Estado actual

La línea 77 ya exige `branch_id`:

```typescript
if (!body.organization_id || !body.branch_id) {
  return NextResponse.json(
    { error: 'organization_id y branch_id son requeridos' },
    { status: 400 }
  )
}
```

**No necesita cambios funcionales** — este endpoint es interno del ERP y ya
requiere `branch_id` explícito.

> **Nota — Normalización de branchId antes de la query:** Antes de validar
> `branchId`, normalizar el tipo (el cliente puede enviar string o number):
> ```typescript
> const normalizedBranchId = typeof branchId === 'string' ? parseInt(branchId, 10) : branchId;
> ```
> Si el resultado es `NaN`, ignorar (fallback). Usar `normalizedBranchId` en
> la validación de pertenencia a la organización y en el INSERT a
> `web_orders`.

### 5.2 Cambio: validar que branch_id pertenece a organization_id (seguridad)

> **⚠️ Nota alta:** Esta validación DEBE implementarse. Sin ella, un caller
> puede enviar `branch_id` de otra organización. Como este documento es diseño,
> no hay evidencia de implementación — verificar en code review.

Agregar después de las validaciones básicas (después de línea 96):

```typescript
// Validar que branch_id pertenece a organization_id (seguridad).
// Evita que un caller envíe un branch_id de otra organización.
const supabase = getSupabaseClient();

const { data: branch } = await supabase
  .from('branches')
  .select('id')
  .eq('id', body.branch_id)
  .eq('organization_id', body.organization_id)
  .maybeSingle();

if (!branch) {
  return NextResponse.json(
    { error: 'branch_id no pertenece a la organización' },
    { status: 400 }
  );
}
```

> **Snippet — normalización + validación + INSERT a `web_orders`:**
>
> ```typescript
> // Normalizar branchId (el cliente puede enviar string o number)
> const normalizedBranchId = typeof branchId === 'string' ? parseInt(branchId, 10) : branchId
> const validBranchId = Number.isNaN(normalizedBranchId) ? null : normalizedBranchId
>
> // Validar pertenencia a la organización
> if (validBranchId) {
>   const { data: branch } = await supabase
>     .from('branches')
>     .select('id')
>     .eq('id', validBranchId)
>     .eq('organization_id', organizationId)
>     .maybeSingle()
>   if (!branch) {
>     return NextResponse.json({ error: 'branch_id no pertenece a organization_id' }, { status: 400 })
>   }
> }
>
> // INSERT con branch_id validado
> const { data: order, error: insertError } = await supabase
>   .from('web_orders')
>   .insert({ organization_id: organizationId, branch_id: validBranchId, /* ... */ })
>   .select().single()
> ```

> **Nota:** la llamada a `getSupabaseClient()` ya existe más abajo (línea 140
> en el código actual). Moverla arriba antes de la validación o reutilizar la
> instancia.

> **Nota QA R6 — validación de `is_web_published` no duplicada:** la validación
> de `is_web_published` la garantiza F1
> (`getOutletBySlug`/`getOutletBySubdomain`/`getOutletByCustomDomain` filtran
> `is_web_published=true`). El backend de `/api/orders` y `/api/web-orders`
> validan pertenencia a la org. No se duplica la validación de publicación en
> el backend de órdenes — si un branch no está publicado, el middleware no
> resuelve su outlet y el cliente no tendría el `branchId`.

## 6. Validación de branch_id (snippet reutilizable)

Este patrón se usa en ambos endpoints (`/api/orders` en goadmin-websites y
`/api/web-orders` en go-admin-erp):

```typescript
// Validar que branchId pertenece a la organización
if (typeof body.branchId === 'number') {
  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', body.branchId)
    .eq('organization_id', body.organizationId)
    .maybeSingle()

  if (!branch) {
    return NextResponse.json(
      { error: 'branch_id no pertenece a la organización' },
      { status: 400 }
    )
  }
}
```

**Por qué `maybeSingle()` y no `single()`:** si el branch no existe o no
pertenece a la org, la query devuelve `null` (no error). `single()` lanzaría un
error 0 rows/2+ rows, que requiere try/catch. `maybeSingle()` es más limpio para
validación de existencia.

## 7. Propagación de branchId: cadena completa

```
F1 (middleware) resuelve outlet → branchId=2
  ↓
Page component (menu page) recibe branchId del contexto
  ↓
<MenuView branchId={2} ... />          ← prop nueva
  ↓
addToCart() → localStorage cart_${subdomain}_2
  ↓
<CheckoutWizard branchId={2} ... />    ← prop nueva
  ↓
orderPayload = { organizationId, branchId: 2, items, ... }

### 7.1 Dónde se instancia CheckoutWizard

`CheckoutWizard` se instancia desde la página de checkout (`app/checkout/page.tsx`
o ruta equivalente en goadmin-websites). Esa página debe obtener `branchId` del
mismo contexto de outlet que resuelve F1 (middleware + `getOrgContext`), ya sea
leyendo el header `x-outlet-subdomain` en server component o recibiendo el
`branchId` del carrito activo en client component.

```typescript
// app/checkout/page.tsx (server component)
import { getOrgContext } from '@/lib/get-org-context'

export default async function CheckoutPage() {
  const { organization, branchId } = await getOrgContext()
  return <CheckoutWizard branchId={branchId} organizationId={organization.id} />
}
```

Si el checkout es client-side y no tiene acceso al contexto server, leer
`branchId` del primer item del carrito en localStorage (todos los items del
mismo carrito comparten el mismo `branchId` por construcción en F3).

```typescript
function getBranchIdFromCart(cartItems: CartItem[]): number | undefined {
  if (cartItems.length === 0) return undefined;
  return cartItems[0]?.branchId;
}
```

> **Caso carrito vacío:** si `cartItems.length === 0`, `getBranchIdFromCart`
> devuelve `undefined`. En ese caso el payload no incluye `branchId` y el
> backend aplica el fallback (`is_web_stock_source → is_main → primera`).

> **⚠️ Nota media — `organizationSubdomain` en custom domains:**
> `CheckoutWizard` y `MenuView` deben usar el mismo valor de
> `organizationSubdomain`, que debe venir siempre por prop desde el contexto
> server. **Nunca** calcularlo en el cliente con
> `window.location.hostname.split('.')[0]` — en custom domains el subdomain
> no se infiere del hostname. Si `organizationSubdomain` es `undefined`, el
> carrito legacy usa key `cart_${organizationId}` como fallback.
  ↓
POST /api/orders
  ↓
/api/orders valida branch 2 ∈ org → resolvedBranchId = 2 (sin fallback)
  ↓
→ INSERT INTO web_orders (organization_id, branch_id, ...) VALUES (orgId, 2, ...)
  ↓
reserve_stock_for_web_order(p_branch_id: 2) → stock_levels del branch 2
```

## 8. Archivos a modificar

| Archivo | Repo | Cambio |
|---|---|---|
| `components/site/MenuView.tsx` | goadmin-websites | Prop `branchId`, key de carrito con branchId, item guarda branchId |
| `components/site/CheckoutWizard.tsx` | goadmin-websites | Prop `branchId`, leer carrito con key branchId, incluir branchId en payload |
| `app/checkout/page.tsx` | goadmin-websites | Obtener `branchId` de `getOrgContext()` y pasarlo a `CheckoutWizard` |
| `app/api/orders/route.ts` | goadmin-websites | Validar `branchId ∈ org` antes de usarlo (sin fallback si viene) |
| `src/app/api/web-orders/route.ts` | go-admin-erp | Validar `branch_id ∈ organization_id` antes de procesar |

## 9. Plan de pruebas

| # | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | Carrito separado por outlet (restaurante-1 vs restaurante-2) | Agregar items en `/restaurante-1/menu`, navegar a `/restaurante-2/menu` | Carrito vacío en restaurante-2 (keys distintas en localStorage) |
| 2 | Carrito legacy sin branchId (sitio global) | Cargar sitio global (`/menu` sin outlet) con carrito `cart_${subdomain}` existente | Carrito legacy se carga sin cambios, `branchId` undefined, backend usa fallback |
| 3 | branchId manipulado por cliente (de otra org) | POST `/api/orders` con `branchId=999` (branch de otra org) | `400` con error "branch_id no pertenece a la organización" |
| 4 | Fallback cuando branchId no viene | POST `/api/orders` sin `branchId` (sitio global) | Backend resuelve `is_web_stock_source → is_main → primera` sucursal |
| 5 | Carrito vacío en checkout | Abrir checkout con carrito vacío | `getBranchIdFromCart([])` devuelve `undefined`, payload sin branchId, backend fallback |
| 6 | branch_id inválido en /api/web-orders (ERP) | POST `/api/web-orders` con `branch_id=999` (branch de otra org) | `400` con mensaje "branch_id no pertenece a organization_id" |
| 7 | Carrito de outlet A no mezcla items de outlet B | Abrir outlet A, agregar item, abrir outlet B, verificar carritos | Carrito de A sigue en localStorage key `cart_${sub}_A` y el de B está vacío (keys distintas) |
| 8 | Flujo end-to-end /api/web-orders con branch_id correcto | Crear web_order desde ERP con `branch_id=2`, verificar persistencia y stock | `web_orders.branch_id=2` y `reserve_stock` usa branch 2 (no fallback global) |
| 9 | branchId=null explícito en carrito (sitio global) | Enviar carrito con `branchId=null` desde sitio global | `getBranchIdFromCart` devuelve `null`, payload sin branchId, backend usa fallback `is_web_stock_source` |

## 10. Definition of Done

- [x] Carrito de localStorage incluye branchId en la key
      (`cart_${subdomain}_${branchId}`)
- [x] Carrito guarda `branchId` en cada item del estado
- [x] `CheckoutWizard` recibe `branchId` por props y lo envía en el payload
- [x] `/api/orders` usa `branchId` del request si viene (no fallback)
- [x] `/api/orders` valida que `branchId` pertenece a la organización
- [x] `/api/web-orders` valida que `branch_id` pertenece a `organization_id`
- [x] Sitio global sin outlet sigue funcionando (fallback actual sin cambios)
- [x] Pedido del restaurante 1 (branch_id=2) cae en `web_orders.branch_id=2`,
      no en el fallback
- [ ] `npm run lint` + `tsc --noEmit` limpios en ambos repos
- [x] Cero archivos `.sql` en el repo

## 11. Riesgos

### 11.1 Carritos separados por outlet (no se mezclan)

Si el usuario navega entre outlets con items en el carrito, **los carritos son
separados** por la key de localStorage:

- `cart_tugranhotel_2` → carrito del restaurante 1
- `cart_tugranhotel_3` → carrito del restaurante 2
- `cart_tugranhotel` → carrito del sitio global (sin outlet)

**Comportamiento esperado:** el usuario pasa de
`tugranhotel.com/restaurante-1/menu` a `tugranhotel.com/restaurante-2/menu` y ve
el carrito vacío (porque es otra key). Esto es **correcto** — no tiene sentido
mezclar items del restaurante 1 con items del restaurante 2 en un solo pedido,
porque cada pedido cae a un solo branch.

**Edge case a documentar al usuario:** si el usuario tenía items en el carrito
del sitio global (`cart_tugranhotel`) y entra a un outlet, no verá esos items.
No es un bug, es el comportamiento esperado de multi-outlet.

### 11.2 Carritos legacy (backward compat)

Los carritos guardados antes de este cambio usan la key `cart_${subdomain}` (sin
sufijo de branch). Como el sitio global sigue usando esa misma key, los
carritos legacy se preservan para sitios sin outlet. Para outlets nuevos, el
carrito empieza vacío (no hay migración de carrito global → carrito de outlet).

### 11.3 branchId manipulado por el cliente

El `branchId` viaja en el payload del POST, que es controlable por el cliente.
La validación en `/api/orders` (sección 4.2) garantiza que un branchId
manipulado que no pertenece a la org se rechaza con `400`. Sin esta validación,
un atacante podría hacer que el pedido caiga a un branch de otra organización.

### 11.4 Outlet sin stock configurado

Si el outlet activo (branch_id=2) no tiene filas en `stock_levels` para los
productos del pedido, la reserva atómica (`reserve_stock_for_web_order`) fallará
con shortage. Esto ya se maneja con el flujo existente de 409 + cancelar orden.
No es un riesgo nuevo de esta fase, pero conviene verificar que cada outlet
tenga su stock configurado antes de publicar el sitio.

### 11.5 Manipulación de branchId de items individuales del carrito

**Riesgo:** un cliente malicioso podría manipular el `branchId` de items
individuales del carrito (editando localStorage o interceptando el payload).

**Mitigación:** el backend valida el `branchId` **global** del payload
(`orderPayload.branchId` / `finalBranchId`), no el `branchId` de items
individuales. Los items se asocian al branch del order, no al suyo propio.
El `branchId` que viaja en cada item del carrito es solo informativo para el
cliente (para construir la key de localStorage); el backend lo ignora y usa
exclusivamente el `branchId` del nivel del pedido, que sí está validado contra
la organización (secciones 4.2 y 5.2).
