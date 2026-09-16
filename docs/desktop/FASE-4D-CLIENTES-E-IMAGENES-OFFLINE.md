# Fase 4D — Cliente en el carrito e imágenes sin red (Go Admin Desktop)

Fecha: 2026-09-16. Roadmap: `docs/ROADMAP-DESKTOP.md` §Fase 4, punto 9. Depende de
la fase 4A (catálogo local, `docs/desktop/FASE-4A-LECTURA-OFFLINE.md`) y de la 4B
(outbox de ventas, `docs/desktop/FASE-4B-VENTA-OFFLINE.md`).

## 1. Problema que resuelve

Probado por el dueño en el `.exe` sin red, con 4A/4B ya funcionando (985 productos,
venta pendiente de sincronizar):

1. Al elegir un cliente: «Error al asignar cliente al carrito».
   `POSService.setCartCustomer` hacía `SELECT * FROM customers WHERE id = ?` contra
   Supabase aunque el selector ya lo había encontrado en el catálogo local; sin red y
   sin esa URL en la caché, 503.
2. No se podía registrar un cliente nuevo. «Crear nuevo cliente» abre `ClientForm`
   completo, que necesita Supabase para sus listas (roles, responsabilidades fiscales,
   tipos de documento, municipios) y para el insert; sin red el interceptor encolaba
   el `POST` y devolvía `202` con `data: null`, así que el formulario navegaba a
   `/app/clientes` sin cliente.
3. Al agregar un producto al carrito la miniatura no cargaba: las imágenes viven en
   Supabase Storage y sin red no había nada local (solo lo que Chromium tuviera en su
   caché HTTP, que no se controla).

Fuera del Desktop nada cambia. Todo pasa por `POSService.usesLocalCatalog()`
(= `isDesktop() && !isAppOnline()`) o por `isDesktop()`.

## 2. Cliente en el carrito sin red

`setCartCustomer(cartId, customerId)`:

```ts
if (this.usesLocalCatalog()) {
  cart.customer = await posOfflineReads.getCustomerById(this.organizationId, customerId);
} else { /* SELECT de siempre */ }
```

`posOfflineReads.getCustomerById` lee `goadmin-catalog › customers` (incluye los
creados sin red) y comprueba la organización; si no está, lanza
`CUSTOMER_NOT_IN_CATALOG_MESSAGE` («Sin conexión: el cliente no está en el catálogo
local…»). Cero consultas a Supabase en esa ruta.

`CustomerSelector` sin red salta las consultas de reservas (`reservations`, PMS) y de
contactos de empresa (`customer_company_links`): solo `POSService.searchCustomers`,
que ya resolvía sobre el catálogo local (4A) por nombre, email, teléfono, documento,
razón social y nombre comercial.

**Cliente «consumidor final» / por defecto:** no existe en el POS. El cliente del
carrito es opcional (`cart.customer_id` puede ir vacío) y `checkout` lo admite; no
hay ningún cliente genérico que haya que replicar.

## 3. Registrar cliente sin red

### 3.1 Id generado en el cliente

`customers.id` es `uuid` con default `gen_random_uuid()` (verificado por MCP el
2026-09-16), así que el id se genera con `crypto.randomUUID()` (`newLocalUuid`, el
mismo generador que las ventas). No hay ids negativos ni remapeo por tipo; el único
remapeo es el de §3.4.

Restricciones verificadas por MCP en `customers`:

| Constraint | Definición |
|---|---|
| `customers_pkey` | `PRIMARY KEY (id)` |
| `unique_customer_id_per_org` | `UNIQUE (organization_id, identification_number)` |
| `unique_customer_email_per_org` | `UNIQUE (organization_id, email)` |
| `customers_customer_type_check` | `person` / `company` |

Columnas generadas (`GENERATED ALWAYS`) que **nunca** se escriben: `full_name`,
`doc_type` (= `identification_type`), `doc_number` (= `identification_number`). El
payload del outbox solo lleva `first_name`/`last_name` e `identification_*`;
`computeFullName()` reproduce la expresión de `full_name` para la fila local.

### 3.2 UI

Sin red, «Crear nuevo cliente» abre `OfflineCustomerDialog` (nombres, apellidos,
tipo y número de documento, email, teléfono) en vez de `ClienteFormDialog`. Con red
—en Desktop o en la web— sigue el formulario completo de siempre. El aviso del
diálogo dice que el resto de datos (dirección, municipio, responsabilidades
fiscales) se completan después desde Clientes.

El selector y la tarjeta del cliente seleccionado muestran la insignia
«Pendiente de sincronizar» cuando `customer.pending_sync` es true.

### 3.3 `POSService.createCustomer` → `createCustomerOffline`

1. Duplicados contra el catálogo local con los mismos UNIQUE que Postgres
   (`findLocalCustomerDuplicate`: documento o email, por organización, sin
   distinguir mayúsculas): si existe, error «Ya existe un cliente con ese
   documento/email: <nombre>» y no se crea nada.
2. `enqueueOfflineCustomer(payload, id)` escribe en **una** pasada:
   - `goadmin-catalog › customers`: la fila con la forma replicada +
     `pending_sync: true` (el selector la ve al instante, `setCartCustomer` la
     asigna);
   - `goadmin-outbox › customers` (`customersOutbox.ts`): el registro `pending`.
3. Devuelve la fila como `Customer`. No se emite ningún fetch.

`createCustomer` con red no cambia salvo que ahora acepta `first_name`/`last_name`
explícitos (antes solo partía `full_name` por el primer espacio; se conserva ese
comportamiento cuando no vienen separados).

### 3.4 Sincronización: `customersSync.ts`

Mismo patrón que `salesSync`: uno a uno en orden de `created_at`, una sola pasada a
la vez, backoff 30 s → 1 → 2 → 4 min, `MAX_ATTEMPTS = 5` → `needs_review` con
`last_error` y el payload íntegro; **nunca se borra** un registro (`synced` se purga
a los 7 días).

Por registro:

1. `SELECT id FROM customers WHERE id = <local> AND organization_id = <org>`: si
   existe, ya se sincronizó (idempotente por id; cubre `syncing` huérfanos).
2. `INSERT` con el id local.
3. `23505` → el cliente ya existía: se relee por id (carrera) y, si no, se busca por
   `(organization_id, identification_number)` y luego `(organization_id, email)`.
   El id encontrado se guarda en `server_id`, la fila local provisional se retira del
   catálogo y se deja una copia bajo el id real, y `remapOutboxSalesCustomer(local,
   real)` cambia `cart.customer_id` en todos los sobres de venta no sincronizados.
   Nunca se crea un duplicado.
4. Éxito → `synced`, y la fila del catálogo pierde `pending_sync`.

**Orden clientes → ventas.** `salesSync.runSync` empieza por
`syncPendingCustomers()`. Además, `replayOne` de cada venta llama a
`ensureCustomerSynced(cart.customer_id)`:

| Estado del cliente | Efecto en la venta |
|---|---|
| no está en el outbox (cliente replicado normal) o `synced` | se reproduce (con el id remapeado si lo hubo) |
| `pending` (falló ahora mismo) | se deja en `pending` **sin consumir intentos**, `last_error` «Esperando al cliente pendiente…», reintento programado |
| `needs_review` | la venta falla con «El cliente de la venta requiere revisión…» (sí consume intento) |

**Replicación del catálogo.** La poda de `customers` al replicar retiraría los
clientes locales que aún no están en el servidor; `restorePendingCustomersToCatalog`
los vuelve a poner (`pending`, `syncing`, `needs_review`) justo después.

## 4. Imágenes sin red

### 4.1 `mediaCache.ts` — IndexedDB `goadmin-media`

Store `blobs` (clave `url`: `{ url, blob, size, type, stored_at, last_used_at }`,
índice `by_last_used`) y `meta` con el total en bytes.

- Tope total `MEDIA_MAX_TOTAL_BYTES` = 80 MB con desalojo **LRU** por
  `last_used_at` dentro de la misma transacción del `put`.
- Tope por imagen `MEDIA_MAX_ITEM_BYTES` = 300 KB: lo que pese más no se guarda
  (`too_large`); si `Content-Length` ya lo dice, ni se lee el cuerpo.
- `getCachedMedia` toca `last_used_at` como mucho una vez por minuto.
- `cacheImageFromNetwork(url, { skipIfFresh })` no vuelve a bajar entradas de
  menos de 7 días.
- `warmMediaCache(urls, { concurrency: 2, shouldContinue })`: lotes de 2, cede el
  hilo entre lotes, salta lo ya guardado, se detiene si `shouldContinue()` (=
  `isAppOnline()`) devuelve false; una sola pasada a la vez.
- No sabe de React ni de Supabase.

### 4.2 Precalentado desde el replicador

`catalogReplicator.runReplication` recuerda la imagen primaria de cada producto
(la que ya elegía `pickPrimaryImages`) y, al terminar, lanza en segundo plano —sin
retener la promesa de la replicación— `warmProductImages(urls)` con las URLs
públicas (`getStorageImageUrl`, ahora en `src/lib/utils/storageImageUrl.ts`,
compartida con `posService`). Solo en Desktop (`warmMedia ?? isDesktop()`), con red,
y nunca lanza. Como la replicación corre al entrar al POS/inicio y cada 10 minutos,
la caché se completa sola con uso normal; con 985 productos y ~50 KB por imagen son
~50 MB, dentro del tope.

### 4.3 `useCachedImage(url)` y `CachedProductImage`

```ts
const { src, fromCache, onError } = useCachedImage(product.image);
```

- Fuera del Desktop: `src === url`, sin tocar IndexedDB.
- Desktop con red: `src === url` y refresco de la caché en segundo plano.
- Desktop sin red, o tras `onError` (la carga en red falló): `blob:` URL del
  `Blob` guardado (`fromCache: true`), revocado al cambiar de imagen o desmontar;
  si no hay copia, `src === null` y el componente muestra «Sin imagen».

`CachedProductImage` (`mode="card"` con `next/image` `fill`, `mode="thumb"` con
`<img>`) lo usan la tarjeta de `ProductSearch` y la miniatura de `CartView` (edición
mínima: solo el bloque de la imagen; los hunks del emitter de la pantalla del
cliente no se tocaron). Un `blob:` va con `unoptimized` (no pasa por `/_next/image`).

## 5. Archivos

| Archivo | Papel |
|---|---|
| `src/lib/offline/customersOutbox.ts` | Outbox de clientes: tipos, `enqueueOfflineCustomer`, listado/actualización, purga, `findLocalCustomerDuplicate`, `restorePendingCustomersToCatalog`, `markCustomerSyncedInCatalog`, `computeFullName`. |
| `src/lib/offline/customersSync.ts` | `syncPendingCustomers`, `retryOutboxCustomer`, `ensureCustomerSynced`. Cliente Supabase inyectable; el real se carga bajo demanda. |
| `src/lib/offline/salesOutbox.ts` | `OUTBOX_DB_VERSION` 1 → 2 (store `customers`), `openOutbox`/`requestToPromise` exportados, `newLocalUuid`, `remapOutboxSalesCustomer`. |
| `src/lib/offline/salesSync.ts` | Clientes antes que ventas; `ensureCustomerSynced` por venta. |
| `src/lib/offline/catalogStore.ts` | `CatalogCustomer.pending_sync?`, `deleteCatalogRow`. |
| `src/lib/offline/catalogReplicator.ts` | Restaura clientes pendientes tras la poda; precalienta la caché de medios (`warmProductImages`). Opciones `warmMedia`, `fetchImpl`, `imageUrl` para tests. |
| `src/lib/offline/posOfflineReads.ts` | `getCustomerById`, `CUSTOMER_NOT_IN_CATALOG_MESSAGE`. |
| `src/lib/offline/mediaCache.ts` | Caché de medios (§4.1) y `resolveCachedImageSrc` (núcleo del hook). |
| `src/lib/offline/useCachedImage.ts` | Hook (§4.3). |
| `src/lib/utils/storageImageUrl.ts` | `getStorageImageUrl` (antes privada en `posService`). |
| `src/lib/services/posService.ts` | `setCartCustomer` y `createCustomer` con rama sin red; `splitCustomerName`; `createCustomerOffline`. |
| `src/components/pos/OfflineCustomerDialog.tsx` | Formulario rápido sin red. |
| `src/components/pos/CustomerSelector.tsx` | Sin red: solo catálogo local; abre el diálogo rápido; insignia «Pendiente de sincronizar». |
| `src/components/pos/CachedProductImage.tsx` | Imagen con respaldo local (card/thumb). |
| `src/components/pos/ProductSearch.tsx`, `CartView.tsx` | Usan `CachedProductImage`. |
| `src/components/pos/types.ts` | `Customer.pending_sync?`. |

Sin migraciones de base de datos.

## 6. Límites conocidos

- El formulario rápido sin red no pide dirección, municipio fiscal,
  responsabilidades fiscales ni contactos de empresa; se completan con red desde
  Clientes. `fiscal_responsibilities` va como `['R-99-PN']` (igual que
  `createCustomer` en línea) y `fiscal_municipality_id` en `NULL`.
- La comprobación de duplicados sin red solo ve los 2000 clientes replicados más
  recientes. Si el documento/email existe en Supabase pero no en el catálogo local,
  el cliente se crea localmente y al sincronizar se remapea al existente (§3.4); la
  venta queda bien, pero los datos escritos sin red (teléfono, email) **no**
  actualizan al cliente existente.
- Un cliente en `needs_review` bloquea sus ventas (con motivo visible en la bandeja
  de ventas). No hay todavía bandeja propia de clientes: se ve en `last_error` de la
  venta y en `goadmin-outbox › customers` (DevTools).
- Solo se cachea la imagen primaria de cada producto (la que muestra el POS); las
  variantes sin imagen propia heredan la del padre, que sí está. Las imágenes de más
  de 300 KB no se guardan y sin red muestran «Sin imagen».
- El precalentado necesita una replicación con red; en una instalación que nunca
  tuvo red no hay imágenes, igual que no hay catálogo.

## 7. Cómo probar sin red

1. Con red, abrir el POS en el Desktop y esperar «Catálogo local: N productos ·
   actualizado hh:mm». DevTools → Application → IndexedDB: `goadmin-media › blobs`
   va creciendo (lotes de 2, sin trabar la UI).
2. Apagar el WiFi. Banner «Sin conexión».
3. Agregar productos: la tarjeta y la miniatura del carrito muestran la imagen desde
   `blob:`; un producto cuya imagen no se alcanzó a bajar muestra «Sin imagen».
4. Seleccionar cliente → buscar por nombre/email/teléfono/documento → elegir: se
   asigna sin error y aparece en la tarjeta del carrito.
5. «Crear nuevo cliente» → diálogo corto → guardar: aparece seleccionado con
   «Pendiente de sincronizar»; en `goadmin-outbox › customers` hay un registro
   `pending` y en `goadmin-catalog › customers` la fila con `pending_sync: true`.
   Intentar crear otro con el mismo documento: error claro.
6. Cobrar una venta a ese cliente (queda `OFF-<suc>-<n>`).
7. Encender el WiFi: primero entra el cliente (`customers` en Supabase con el mismo
   `id` que el registro local), luego la venta con `customer_id` = ese id.
   Solo SELECT:

```sql
select id, first_name, last_name, identification_number, email, metadata->>'created_offline'
from customers where organization_id = <org> and created_at >= now() - interval '1 hour';

select s.id, s.customer_id, s.created_at from sales s
where s.organization_id = <org> and s.created_at >= now() - interval '1 hour' order by created_at;
```

8. Caso remapeo: crear sin red un cliente con un documento que ya exista en Supabase
   pero no esté entre los 2000 replicados; al reconectar el registro queda `synced`
   con `server_id` = id existente, no hay fila nueva en `customers`, y la venta llega
   con ese `customer_id`.

## 8. Tests

```bash
TZ=UTC            npx jest src/lib/offline src/__tests__/pos-display src/__tests__/guardrails.test.ts
TZ=America/Bogota npx jest src/lib/offline src/__tests__/pos-display src/__tests__/guardrails.test.ts
```

- `src/lib/offline/__tests__/customersOutbox.test.ts`: crear sin red → catálogo +
  outbox con el mismo id y búsqueda por los cuatro campos; duplicados locales;
  sincronización (insert con id local, idempotencia por id, remapeo por documento
  con ventas pendientes actualizadas, `needs_review` tras 5 fallos sin borrar,
  «Reintentar», backoff, purga solo de `synced`, restauración tras la poda); orden
  clientes → ventas (cliente antes que `checkout`, venta con cliente pendiente no
  se reproduce ni consume intentos, cliente en revisión hace fallar la venta con el
  motivo).
- `src/lib/offline/__tests__/mediaCache.test.ts`: constantes, tope por imagen, LRU
  con topes reducidos, descarga con `Content-Length`, frescura, precalentado por
  lotes que salta lo guardado y se detiene sin red, una sola pasada concurrente,
  `resolveCachedImageSrc` con red / sin red / sin copia / carga fallida.
- `src/lib/offline/__tests__/cartCustomerOffline.test.ts`: `POSService` en Desktop
  sin red → `setCartCustomer` desde el catálogo (cero operaciones a Supabase,
  cliente pendiente, error claro si no está, otra organización, quitar cliente);
  `createCustomer` sin red (uuid, `pending_sync`, outbox, columnas escritas,
  duplicados, nombre obligatorio) y con red (insert de siempre, sin outbox).

Datos inventados: organización 120, sucursal 7. `fake-indexeddb`; Supabase de
mentira de `__tests__/fakeSupabase.ts`.
