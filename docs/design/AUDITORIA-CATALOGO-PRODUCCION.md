# Auditoría: catálogo y producción de Inventario

Fecha: 2026-09-23. Solo lectura: se revisó el código y se consultó la base de datos con el MCP de Supabase (`jgmgphmzusbluqhuqihj`) usando únicamente `SELECT`. No se escribió código ni se cambió la base de datos.

Alcance:
- Catálogo: Categorías, Proveedores, Etiquetas de producto, Unidades, Conversiones e Imágenes.
- Producción: Recetas, Costo de recetas, Producción y Distribución.

Las rutas son relativas a `src/` salvo que se indique otra cosa. Las organizaciones se citan por su id o por una descripción, nunca por su nombre.

Este documento acompaña a `PARIDAD-CATALOGO-PRODUCCION.md`, que describe lo que se dibujó en Figma. Complementa, sin repetirla, la auditoría control por control de proveedores y categorías que ya existe: `AUDITORIA-CONTROLES-PROVEEDORES-CATEGORIAS.md`.

---

## 0. Resumen

1. **Categorías y Proveedores no estaban diseñados en Figma.** Se buscaron por nombre de sección, de frame y por textos («Categorías», «Proveedores», «Nuevo proveedor», «SupplierPicker», «Unidades de medida», «Costo de recetas») en las páginas `02` a `10` y en `99 Descartes`. Lo que existía era esto:
   - En `04 Inventario`: la pestaña «Proveedores y etiquetas» del detalle de producto (sección «Producto — Imágenes · Proveedores y etiquetas», x=0, y≈37.782, frames `194:12856`, `194:13794` y `194:13908`) y el «Sheet · Organización y proveedor» (`191:10692`).
   - También en `04`: el `QuickCategoryForm` y el alta rápida de categoría (x=13.000).
   - En `02 Componentes › Finanzas`: el componente `SupplierPicker` (`415:160070`).
   - En `07 Finanzas`: «Registrar pago a proveedor» y el SupplierPicker dentro de la factura de compra.
   - En `03`: los frames llamados «Categorías» son de la navegación, no pantallas.
   - En `99 Descartes`: solo aparecen menciones dentro de detalles de producto sustituidos.

   `CATALOGO-ICONOS.md` ya lo decía: «Proveedor · Truck · (sin pantalla en Figma aún)» y «Categoría · Tags · (sin pantalla en Figma aún)». Las dos pantallas se diseñaron desde cero. Las tres piezas del producto se **clonaron** a la sección de Proveedores sin tocar el original.
2. **Producción no mueve el inventario de forma fiable.**
   - En la base de datos hay 1 orden `completed`, pero 0 consumos y 0 movimientos de kardex con `source = production`.
   - Si la RPC falla, el servicio marca la orden como completada igualmente (`lib/services/productionOrderService.ts:213-221`).
   - La RPC tiene un error de variables (§8) e ingresa el producto terminado con costo 0.
3. **Distribución no funciona de punta a punta.**
   - Crear una distribución nunca muestra órdenes, porque lee `localStorage 'currentOrgId'` (`components/inventario/distribucion/CrearTransferenciaDialog.tsx:72`).
   - «Marcar en tránsito» llama a una RPC que no existe (`update_stock_level`, `TransferenciasService.ts:260`).
   - Además escribe estados que el CHECK de la base de datos rechaza (`'complete'`/`'partial'`, `:330` y `:417`).
4. **Las recetas pierden historia y pueden descontar dos veces.**
   - `version` vale siempre 1 (`recipeService.ts:192`) y editar una receta borra y reinserta sus ingredientes.
   - Al vender, `decrement_stock_with_recipe` descuenta los ingredientes aunque ya se hubieran consumido en una orden de producción.
5. **Hay tres fugas de RLS en este dominio**, detalladas en §12:
   - `units`: cualquier administrador de cualquier organización puede editar las unidades de todos.
   - `unit_conversions`: cualquier miembro puede modificar o borrar las conversiones globales.
   - `shared_images`: cualquiera puede ver todas las imágenes y subirlas para cualquier organización.
6. **Casi nada se conecta con nada.**
   - Ni la columna «Productos» de categorías ni la de etiquetas abren el catálogo filtrado.
   - El botón «Nueva orden de compra» del proveedor envía `?supplier=`, pero nadie lee ese parámetro.
   - El reporte de costo de recetas no enlaza a ninguna parte.
   - La orden de producción no muestra sus movimientos de kardex.

---

## 1. Cifras de la base de datos

Consultadas el 2026-09-23, en todo el proyecto.

| Tabla / dato | Filas | Organizaciones | Observación |
|---|---:|---:|---|
| `categories` | 1.113 | 24 | 4 con padre, 0 inactivas y 0 con `branch_id`. El árbol casi no se usa |
| `products` sin `category_id` | 35.087 de 53.319 | 25 | El 66 % de los productos no tiene categoría |
| `suppliers` | 1.604 | 21 | 0 inactivos y 0 con `rating`: ningún formulario los escribe. 0 personas naturales. 1 NIT repetido en una misma organización |
| `product_suppliers` | 11.863 | — | Sin `organization_id`: el aislamiento depende de RLS |
| Proveedores con cuentas por pagar / órdenes de compra / facturas | 24 / 5 / 24 | — | — |
| `product_tags` | 729 | 12 | Solo 4 etiquetas tienen uso (163 relaciones). Hay 725 sin usar y 4 pares con el mismo nombre en distinta mayúscula. Una organización tiene 170 |
| `units` | 13 | global | `conversion_factor = 1` en las 13. `unit_type` sí está lleno |
| `unit_conversions` | 10 | 0 (todas globales) | KG↔GR, LT↔ML, MT↔CM, y además PAQ = 10 UN y CAJ = 25 UN como reglas globales |
| `products.unit_code` | UN 53.046 · NULL 258 · GR 5 · SV 4 · LT 3 · PR 2 · CAJ 1 | — | — |
| `shared_images` | 72 | 13 | — |
| `product_images` | 118.935 en 42.473 productos | — | `max(id)` = 177.495 (ver §6) |
| `organization_images` | 0 | 0 | Tabla sin uso |
| `product_recipes` | 57 (55 activas) | 3 | 137 ingredientes. De los 53 insumos distintos, 15 no tienen `product_costs`. 7 ingredientes usan un producto sin unidad |
| `products` compuestos | 61 (`production_type = composite`) | — | — |
| `production_orders` | 1 (`completed`) | 1 | 0 `production_order_consumptions` y 0 `stock_movements` de producción |
| `inventory_transfers` | 5 (2 `pending`, 1 `in_transit`, 2 `received`) | 1 | 8 `transfer_items`, ninguno con `lot_id` |
| `stock_movements.source` | `transfer` 10 · `production` 0 | — | El CHECK admite `transfer_out` y `transfer_in`, pero no hay ningún movimiento con esos valores |
| `category_rules` | 0 | 0 | Las reglas de auto-asignación no se usan |

Hay además una desalineación de tipos:
- `units.code` es `char(4)`.
- `unit_conversions.from/to_unit_code` y `product_recipes.yield_unit_code` son `char(3)`.
- `recipe_ingredients.unit_code` y `products.unit_code` son `char(4)`.

Consecuencias: una unidad de 4 letras no se puede usar en conversiones ni como rendimiento de una receta. Y en JavaScript `'KG  ' !== 'KG '`, así que las comparaciones con `===` fallan (§7).

---

## 2. Categorías

El inventario control por control está en `AUDITORIA-CONTROLES-PROVEEDORES-CATEGORIAS.md`, §B. Aquí solo va lo nuevo o lo que ha cambiado.

**Ya corregido en el código:**
- Al editar, el nombre ya no regenera `slug` ni `meta_title` (`components/inventario/categorias/CategoryForm.tsx:105-118`).

**Sigue pasando:**
- Al editar, `meta_description` se sobrescribe con cada tecla del nombre (`:117`) y de la descripción (`:125`), y guarda el HTML del editor enriquecido.
- `updateByUuid` no tiene el `generateSlug` de respaldo que sí tiene `create`. Si se borra el slug en edición, se guarda vacío (`lib/services/categoryService.ts:272` frente a `:214`).
- El conteo de productos ignora las asignaciones por regla que viven en `product_category_relations` (`categoryService.ts:191-205` y `CategoryProductsCard.tsx:42-47`).
- **Ciclos en el árbol.** El selector de padre solo excluye la propia categoría (`CategoryForm.tsx:70`). El arrastre solo valida las filas visibles de la página actual (`CategoriesTreeTable.tsx:95-105`).
- La paginación corta el árbol ya aplanado (`app/app/inventario/categorias/page.tsx:50-53`).
- La búsqueda no entra en las ramas contraídas (`useCategories.ts`).
- **RLS.** La política `Allow anon select categories` tiene `USING (true)`. Además, `getById`/`getByUuid`/`update`/`delete`/`move` no filtran por organización (`categoryService.ts:167-404`).
- Las acciones de fila solo aparecen al pasar el ratón (`opacity-0 group-hover`, `CategoriesTreeTable.tsx:344`). En pantallas táctiles no se ven.

**Conexiones:**
- La columna «Productos» no enlaza a nada, y `CatalogoProductos.tsx` no lee el filtro de la URL.
- No hay enlace a las promociones, las páginas web ni los menús web que usan la categoría.

---

## 3. Proveedores

El detalle completo está en `AUDITORIA-CONTROLES-PROVEEDORES-CATEGORIAS.md`, §A. Novedades verificadas:

- `supplierService.updateSupplier` **ya es parcial** (`lib/services/supplierService.ts:330-374`, `setIfPresent`). Pero `EditarProveedorForm` sigue inicializando y enviando `identification_document_code: '31'` y `legal_organization_code: '1'` cuando llegan vacíos (`components/inventario/proveedores/editar/EditarProveedorForm.tsx:35-36 · 85-87`). Resultado: una persona natural se guarda con el código DIAN de empresa.
- La tarjeta «Productos vinculados» del detalle **siempre sale vacía**. La consulta pide `products(..., is_active)` y `products` no tiene esa columna (`ProveedorDetalle.tsx:96`). El error se ignora.
- «Nueva Orden de Compra» envía `?supplier=` (`ProveedorDetalle.tsx:203`), pero ni `ordenes-compra/nuevo/page.tsx` ni `NuevaOrdenCompraForm` leen parámetros.
- El listado inventa datos: `limite_credito: 5000000` y días de crédito 30 cuando el valor es 0 (`CatalogoProveedores.tsx:140-141`).
- Borrar un proveedor arrastra en cascada sus órdenes y facturas de compra. Si tiene cuentas por pagar, falla con un error crudo, porque esa FK no declara acción (FK: `purchase_orders`/`invoice_purchase`/`product_suppliers` = `c`, `accounts_payable`/`product_costs` = `a`, `lots`/`serial_numbers` = `n`).
- Las exportaciones piden 10.000 filas, pero PostgREST corta en 1.000 por defecto.

---

## 4. Etiquetas de producto (tags)

Rutas: `app/app/inventario/etiquetas/page.tsx` → `components/inventario/etiquetas/EtiquetasPage.tsx`, servicio `EtiquetasService.ts`.

No hay que confundirlas con las etiquetas impresas de papel. Estas son `product_tags` y `product_tag_relations`. La pantalla «Imprimir etiquetas» (x=13.000) no se tocó.

**Qué muestra:** color, nombre, conteo de productos y tres acciones sueltas (editar, duplicar y eliminar). Tiene búsqueda en cliente y un Dialog.

**Lo roto:**
- **N+1.** Hace una consulta de conteo por cada etiqueta (`EtiquetasService.ts:22-34`), y no cuenta la columna heredada `products.tag_id`.
- **Eliminar deja datos a medias.** Primero borra las relaciones sin revisar el error y luego borra la etiqueta (`EtiquetasService.ts:94-110`). Como `products_tag_id_fkey` no tiene acción, el segundo paso puede fallar cuando las relaciones ya se perdieron.
- «Duplicar» falla la segunda vez por el UNIQUE `(organization_id, name)`, y el mensaje es genérico (`:116-118`).
- Ese UNIQUE distingue mayúsculas: «Oferta» y «oferta» conviven (4 pares en la base de datos).
- Usa `confirm()` nativo (`EtiquetasPage.tsx:131`).
- Actualizar y eliminar no filtran por organización (`:82` y `:104`).
- La política `Allow anon select product_tags` tiene `USING (true)`.

**Conexiones:** la columna «Productos» no enlaza a nada y el catálogo no tiene filtro por etiqueta. Las etiquetas alimentan las reglas de categoría (campo «Etiqueta»), pero esa relación no se ve en ninguna de las dos pantallas.

---

## 5. Unidades y conversiones

Rutas: `unidades/page.tsx` → `components/inventario/unidades/UnidadesPage.tsx`; `conversiones/page.tsx` → `ConversionesPage.tsx`. Servicios: `UnidadesService.ts` y `lib/services/unitConversionService.ts`.

**Unidades:**
- `units` es global: no tiene `organization_id`.
- La política `units_insert_update_policy` deja escribir a cualquier usuario con `role_id = 2` en cualquier organización. Si lo cambia, cambia para todos los tenants.
- El conteo de productos por unidad no filtra por organización (`UnidadesService.ts:18-30`), y el borrado puede dejar sin unidad productos ajenos (`products_unit_code_fkey` = SET NULL).
- `parseFloat(...) || 1` guarda 1 cuando el factor está vacío o es inválido (`UnidadesPage.tsx:381`).
- El factor en sí no sirve: vale 1 en las 13 unidades.

**Conversiones:**
- No tienen UNIQUE, no crean la inversa y no validan que las dos unidades sean del mismo tipo.
- `getConversions` trae todas las filas y filtra en el cliente (`unitConversionService.ts:20-34`).
- `unitConversionService.convert` no la usa nadie. `stockMovementService.ts:70-81` duplica la lógica y, si no encuentra conversión, descuenta sin convertir.
- La política `unit_conversions_org_isolation` permite modificar y borrar las filas con `organization_id IS NULL`, es decir, las globales. La UI solo lo oculta con `readOnly`.
- **Error de modelo:** PAQ = 10 UN y CAJ = 25 UN son reglas globales, pero el tamaño de un paquete o de una caja depende del producto.

**Conexiones:** las dos pantallas no se enlazan entre sí (solo «← Inventario»), ni con productos ni con recetas.

---

## 6. Imágenes

Rutas: `imagenes/page.tsx` → `components/inventario/imagenes/ImagenesPage.tsx`, servicio `ImagenesService.ts`.

- **IDs falsos.** Las `product_images` se renderizan con `id + 100000` (`ImagenesService.ts:75`), y editar o borrar trata cualquier `id > 100000` como imagen de producto (`:199-200` y `:231`). Hoy `shared_images.id` llega hasta 72. El día que pase de 100.000, se editará o borrará la fila equivocada.
- **Filtros.** Con el filtro de visibilidad activo se hace `return` antes de aplicar la búsqueda y las etiquetas (`:105-123`).
- **Carga.** Se carga tres veces, con N+1 (`obtenerStats` y `obtenerTags` vuelven a llamar a `obtenerImagenes`), sin debounce y sin paginar las `product_images`. Hay 118.935 filas en total.
- **Subida.**
  - No hay límite de tamaño.
  - El nombre de archivo no se sanea (`:148`).
  - Si falla el INSERT, el archivo queda huérfano en storage (`:152-180`).
  - Borrar no reasigna `is_primary` (`:242-253`).
  - Al editar una imagen de producto, los cambios de `is_public` y de etiquetas se descartan (`:201-207`).
- **RLS de `shared_images`.** La política SELECT tiene `true` para todos. La política INSERT tiene `with check true`: cualquier usuario puede subir filas para cualquier organización.
- **Conexiones.** Un badge dice «N productos», pero no hay enlace a esos productos ni forma de asignar la imagen a un producto.

---

## 7. Recetas y costo de recetas

**Recetas** (`components/inventario/recetas/RecetasPage.tsx`, `RecipeDialog.tsx` y `lib/services/recipeService.ts`):

- **Editar borra los ingredientes.** `getRecipes` no los trae (`recipeService.ts:80-89`), el diálogo arranca con `ingredients=[]` (`RecipeDialog.tsx:100-108`) y `updateRecipe` hace DELETE e INSERT (`recipeService.ts:256-279`).
- Guardar no es transaccional: son 4 llamadas desde el cliente (`:176-224`).
- `version: 1` siempre (`:192`).
- `createRecipe` fuerza `production_type = 'composite'` (`:224`).
- **Eliminar.** No revierte `products.is_composite`, y falla si hay órdenes, porque `production_orders_recipe_id_fkey` no tiene acción.
- **Unidades.** Hay un `'UN  '` fijo (`RecipeDialog.tsx:132 · 167`) y el selector no filtra por `unit_type`.
- **Doble consumo.** `decrement_stock_with_recipe` descuenta los ingredientes al vender cualquier producto con receta activa, sin mirar `production_type` ni `yield_qty`. Si ese producto ya se produjo con una orden, los ingredientes se descuentan dos veces.

**Costo de recetas** (`components/inventario/reportes/CostoRecetasPage.tsx` y `CostoRecetasService.ts`):

- **Cálculo del costo:**
  - Toma el **máximo** `avg_cost` entre sucursales y lotes (`CostoRecetasService.ts:111-121`).
  - No usa `product_costs` como respaldo, así que un insumo sin existencias cuesta 0 sin avisar.
  - `avg_cost` es `numeric(12,2)`: un costo por gramo se redondea a 0,00.
  - Suma los ingredientes opcionales (`:133`).
- **La conversión nunca coincide.** Compara con `===` códigos que llegan rellenos a `char(4)` contra `char(3)` (`:24-31`).
- **Presentación del reporte:**
  - El KPI «Costo promedio/unidad» promedia productos distintos (`CostoRecetasPage.tsx:88-90`).
  - Mezcla recetas activas e inactivas.
  - Ninguna fila enlaza a la receta, a producción ni al kardex.
- **Formato:**
  - El nombre del CSV usa `toISOString().split('T')[0]` (`:63`, prohibido por las reglas de fechas).
  - La moneda está fijada en COP.

---

## 8. Producción

Archivos: `components/inventario/produccion/*`, `lib/services/productionOrderService.ts` y la RPC `complete_production_order`.

**En la RPC:**
- **Reutiliza `v_conv_factor`.** Primero guarda en ella la proporción (`produced / yield`) y luego la pisa con el factor de conversión de unidades del ingrediente.
  - Si no encuentra conversión, `SELECT INTO` deja la variable en NULL. La cantidad del ingrediente siguiente da NULL y el INSERT en `stock_movements.qty` (NOT NULL) falla.
  - Si sí la encuentra, los ingredientes siguientes se multiplican por el factor de unidad y no por la proporción.
- El producto terminado entra con `unit_cost 0` y no se actualiza su `avg_cost`.
- No valida existencias: deja stock negativo sin avisar.
- Solo trabaja con `lot_id IS NULL` y no respeta `is_optional`.
- `v_existing_stock IS NOT NULL` es falso para un RECORD con algún campo nulo (por ejemplo `avg_cost` NULL). En ese caso se inserta una fila duplicada en `stock_levels`, que además choca con el UNIQUE sobre `lot_id` nulo documentado en `CLAUDE.md`.

**En el servicio y la UI:**
- **Fallback silencioso.** Si la RPC falla, solo se cambia el estado a `completed` (`productionOrderService.ts:213-221`). Esto explica la orden completada sin consumos que hay en la base de datos.
- `prompt('Cantidad producida:')` nativo (`ProduccionPage.tsx:93`): si se escribe 0, completa la cantidad total, y acepta negativos.
- `confirm()` nativo para cancelar y eliminar (`:98` y `:120`).
- Una orden `in_progress` no se puede cancelar.
- `created_by` nunca se envía.
- Las fechas del detalle usan `toLocaleString('es-CO')`, que ignora la zona horaria de la organización.
- No se muestra la disponibilidad de ingredientes ni el costo estimado. `consumptions.stock_movement_id` se carga, pero no se muestra.

---

## 9. Distribución

Archivos: `components/inventario/distribucion/*` y `components/inventario/transferencias/TransferenciasService.ts`.

- **Nueva distribución** nunca lista órdenes: `localStorage.getItem('currentOrgId')` (`CrearTransferenciaDialog.tsx:72`), una clave que nadie guarda.
- **Marcar en tránsito:**
  - Inserta `transfer_out` y llama a `.rpc('update_stock_level')` (`TransferenciasService.ts:260`), que no existe.
  - El respaldo filtra `stock_levels` por `organization_id`, una columna que no existe. Las existencias del origen no cambian aunque el kardex diga que sí.
- **Recibir:**
  - Escribe `'complete'`/`'partial'` en `transfer_items.status` y en `inventory_transfers.status` (`:330` y `:417`). Los CHECK no admiten esos valores y el error no se revisa.
  - El traslado nunca llega a `received`, así que el trigger contable `fn_auto_journal_inventory_transfer` nunca se dispara.
- **La UI no coincide con la base de datos:**
  - `statusConfig` no conoce `received` y lo pinta como «Borrador» (`DistribucionTable.tsx:35-42`).
  - La tarjeta «Recibidas» cuenta `complete`, así que siempre da 0 (`DistribucionStats.tsx:171`).
  - La búsqueda no se aplica.
  - La sucursal del header no filtra.
- **Cantidad máxima:** sale de la cantidad producida, no del stock del origen (`CrearTransferenciaDialog.tsx:60`).
- **Vínculo con la orden:** el traslado solo se vincula a la orden de producción por el texto de las notas (`:126`).
- Usa `confirm()` nativo (`DistribucionPage.tsx:65` y `:77`).

---

## 10. Permisos y estados

- **Ninguna** de las diez rutas comprueba permisos: no hay `usePermission`, `PermissionGuard` ni un `layout.tsx` de inventario. El estado «sin permiso» no existe en ninguna.
- Las pantallas de ámbito de sucursal no contemplan el estado «sin sucursal asignada» (Producción, Distribución y Costo de recetas).
- La organización sale de `localStorage` o de `getOrganizationId()` en varias pantallas: importadores, costo de recetas y distribución.

---

## 11. Iconos

- `SidebarNavigation.tsx:210-226` usa estos iconos:
  - `FolderOpen` para Categorías; el catálogo dice `Tags`.
  - `Hash` para Unidades.
  - `ChefHat` para Recetas, que también es el icono de Comanda.
  - `Truck` para Distribución, que también es el icono de Proveedor.
  - `DollarSign` para Costo de recetas.
- `moduleConfig.ts:127 · 129` usa `Grid3X3` para Categorías y `Users` para Proveedores.
- El diseño fija uno por concepto; están listados en `PARIDAD-CATALOGO-PRODUCCION.md` §4.

---

## 12. Riesgos de RLS verificados

| Tabla | Política | Riesgo |
|---|---|---|
| `units` | `units_insert_update_policy` · ALL · `auth.uid() IN (miembros con role_id = 2)` | Un administrador de **cualquier** organización edita o borra las unidades globales de todas |
| `unit_conversions` | `unit_conversions_org_isolation` · ALL · `organization_id IS NULL OR …` | Cualquier miembro modifica o borra las conversiones globales |
| `shared_images` | SELECT `true`; INSERT `with check true` | Cualquiera ve las imágenes de todas las organizaciones y puede insertar para otra |
| `categories` | `Allow anon select categories` · `true` | Lectura anónima del catálogo de todas las organizaciones |
| `product_tags` | `Allow anon select product_tags` · `true` | Lectura anónima |

`suppliers` ya no tiene la política anónima con `true` que aparece en el baseline: se verificó en la base de datos actual.

**Cerrado el 2026-09-23** con cuatro migraciones (`supabase/migrations/20260923133330_…` a `…133403_…`, cada una con su rollback) y el guardarraíl 26 de `src/__tests__/guardrails.test.ts`:

- `units`: los usuarios solo leen; escribe `service_role`. La pantalla Inventario / Unidades pasó a ser de solo lectura.
- `unit_conversions`: las globales solo se leen; las de una organización las escriben sus miembros activos.
- `shared_images`: las cuatro operaciones van por pertenencia activa, y las marcadas `is_public` se siguen viendo desde todas las organizaciones. De paso se descubrió que UPDATE y DELETE comparaban con `auth.jwt() ->> 'organization_id'`, un claim que ningún JWT lleva: nadie podía editar ni borrar sus propias imágenes. Ya se puede.
- `categories` y `product_tags`: sin acceso anónimo y sin lectura entre organizaciones. La `USING (true)` era para el rol `public`, así que también dejaba a cualquier usuario autenticado ver el catálogo de las demás. La tienda web no se ve afectada: las lee desde el servidor con `service_role`.

Se verificó con usuarios reales de tres organizaciones antes y después, y el rendimiento no cambió (subplan hasheado, `loops = 1`).

---

## 13. Cambios de backend y base de datos que necesita el diseño

No se aplicó ninguno. Todos son aditivos o de política, conforme a `POLITICA-MIGRACIONES.md`.

**Base de datos:**
1. **RLS:**
   - Cerrar la escritura de `units` y de las `unit_conversions` globales (`organization_id IS NULL`) a todo usuario que no sea de servicio.
   - `shared_images`: SELECT e INSERT por pertenencia a la organización.
   - Revocar el acceso anónimo a `categories` y `product_tags`, o limitarlo a lo que publica la tienda.
2. `units.organization_id` (NULL = del sistema), para las unidades propias. También hay que unificar el ancho de los códigos: `unit_conversions.from/to_unit_code` y `product_recipes.yield_unit_code` a `char(4)` o `text`, o limitar el código a 3 caracteres con un CHECK. Cambiar el tipo en una tabla con datos exige migración cuidadosa; por eso se propone un CHECK de longitud ≤ 3.
3. `unit_conversions`: UNIQUE `(coalesce(organization_id,-1), from_unit_code, to_unit_code, coalesce(product_id,-1))` y una columna nueva `product_id` NULL-able para las conversiones por producto (paquete, caja).
4. `product_tags`: UNIQUE sobre `(organization_id, lower(name))`, previa fusión de los 4 pares repetidos.
5. `production_orders`: `transfer_id` o una tabla `production_order_transfers`, para dejar de vincular por el texto de las notas. `product_recipes`: versión inmutable (INSERT de una fila nueva al editar, la anterior inactiva), manteniendo `production_orders.recipe_id`.
6. `inventory_transfers`: si se quiere «recibido con diferencia», derivarlo de `transfer_items.received_qty`. No hace falta un estado nuevo.

**RPC transaccionales:**

7. `complete_production_order` corregida:
   - Variable propia para el factor de unidad.
   - Validación de existencias con permiso explícito para dejar stock negativo.
   - Costo real al producto terminado (suma de consumos ÷ producido) y actualización de `avg_cost`.
   - Respetar `is_optional`.
   - Existencia de la fila por `FOUND`, no por `IS NOT NULL`.
   - Sin fallback en el servicio.
8. `save_recipe_version(recipe, ingredients[])`: crea la versión y sus ingredientes en una sola transacción.
9. `create_distribution(order, allocations[])`, `ship_transfer(id)` y `receive_transfer(id, items[])`: reserva, salida y entrada con movimientos `transfer_out`/`transfer_in`, costo y estados válidos. Sustituyen la RPC inexistente `update_stock_level`.
10. `decrement_stock_with_recipe`: no descontar ingredientes cuando `production_type` sea «al producir», y respetar `yield_qty` y `is_optional`.

**Vistas o RPC de agregados**, para dejar de calcular en el navegador:

11. Conteo de productos por categoría, incluidas las asignaciones por regla.
12. Saldo, vencido y cumplimiento por proveedor.
13. Uso de etiquetas, unidades, conversiones e imágenes.
14. Costo de receta por sucursal: `avg_cost` → `product_costs` vigente → sin costo, con la fuente.

**Servicios y rutas:**

15. Leer `?supplier=` en la nueva orden de compra; `?categoria=` y `?etiqueta=` en el catálogo.
16. Arreglar la ruta de la búsqueda global de proveedores: hoy es `/app/proveedores/{id}` y debe ser `/app/inventario/proveedores/{uuid}`.
17. Permisos resueltos en el servidor para las diez rutas. El costo de recetas va con un permiso propio de costos.
