# Auditoría control por control — Proveedores y Categorías

Insumo para que el diseñador **calque la realidad** en Figma («GO Admin — Sistema de diseño»,
`EAvjINVRnlzFM70GVoWXgl`) antes de rediseñar Proveedores y Categorías. Mismo formato y leyenda
que `docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md`: aquí va **cada control** —botón, menú,
pestaña, campo, toggle, chip, badge, tabla, diálogo, tooltip, atajo, estado— con su etiqueta
exacta, lo que hace, cuándo aparece y `archivo:línea`.

Fecha: 2026-09-22. Solo lectura de código; `suppliers`, `categories` y sus tablas relacionadas
verificadas con `SELECT` por el MCP de Supabase (`jgmgphmzusbluqhuqihj`, solo lectura). Sin
nombres de organizaciones cliente. Rutas relativas a `src/` salvo que se indique.

Leyenda de **Tipo**: botón · menú (trigger o ítem) · pestaña · campo · toggle (switch/checkbox/
segmento) · chip (píldora clicable) · badge (solo lectura) · tabla · diálogo · tooltip · atajo ·
estado (vacío/cargando/error/aviso) · texto · stat (KPI) · paginación · toast · cálculo (regla sin
control visible). **Etiqueta exacta** es el literal del código con su acentuación (o su falta);
**ninguna** de estas dos pantallas pasa por `messages/es.json`, así que los textos se citan tal
cual. **Cuándo aparece**: «Siempre» = incondicional dentro de su pantalla; breakpoints Tailwind
(`xs` 475 · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280).

Índice: A. Proveedores (listado, detalle, nuevo, editar, importar) · B. Categorías (árbol,
detalle con 7 tarjetas, formulario, importar) · C. Selectores de proveedor repartidos por la app
y `SupplierPicker` propuesto · D. Selectores de categoría y `QuickCategoryForm` · E. Datos que
trae cada pantalla · F. Esquema real verificado por MCP · G. Lo roto o sin efecto · H. Conteo de
controles · I. Recomendación de rediseño.

---

## A. Proveedores

Cinco rutas, todas bajo `/app/inventario/proveedores`. Las cinco páginas de `app/` son cáscaras
de 9–19 líneas que solo envuelven el componente en
`p-4 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen`
(`app/app/inventario/proveedores/page.tsx:13-19`, `nuevo/page.tsx:3-9`, `importar/page.tsx:3-9`,
`[id]/page.tsx:8-15`, `[id]/editar/page.tsx:8-15`).

**Ninguna de las cinco comprueba permisos** (no hay `usePermission`, `PermissionGuard` ni
equivalente en `components/inventario/proveedores/**` ni en `app/app/inventario/proveedores/**`):
no existe el estado «sin permiso». La organización sale de `getOrganizationId()`
(localStorage, `lib/hooks/useOrganization`), no de la sesión.

### A.1 Listado `/app/inventario/proveedores` — cabecera `proveedores/ProveedoresPageHeader.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | Icono `Truck` sobre `bg-blue-100` | Marca de la pantalla | Siempre | ProveedoresPageHeader.tsx:35-37 |
| 2 | texto | «Catálogo de Proveedores» (h1) | — | Siempre | ProveedoresPageHeader.tsx:39-41 |
| 3 | texto | «Gestiona proveedores, condiciones de pago e historial de compras» | Subtítulo | Siempre | ProveedoresPageHeader.tsx:42-44 |
| 4 | botón | «Nuevo Proveedor» (icono `PlusCircle`, azul) | `router.push('/app/inventario/proveedores/nuevo')` | Siempre; `w-full` en móvil | ProveedoresPageHeader.tsx:49-55 · CatalogoProveedores.tsx:346 |
| 5 | menú | «Exportar» (icono `Download` + `ChevronDown`, outline) | Abre `DropdownMenu align="end"` | Solo si llega alguno de los 3 callbacks (siempre lo hacen) | ProveedoresPageHeader.tsx:57-68 |
| 5a | menú (ítem) | «CSV (.csv)» | `supplierService.exportSuppliersToCSV` → `Blob` con BOM → descarga `proveedores_{fecha}.csv` | Siempre | ProveedoresPageHeader.tsx:71 · CatalogoProveedores.tsx:229-265 |
| 5b | menú (ítem) | «Excel (.xlsx)» | `exportSuppliersToXLSX` → `proveedores_{fecha}.xlsx` | Siempre | ProveedoresPageHeader.tsx:74 · CatalogoProveedores.tsx:268-303 |
| 5c | menú (ítem) | «PDF (.pdf)» | `exportSuppliersToPDF` → `proveedores_{fecha}.pdf` | Siempre | ProveedoresPageHeader.tsx:77 · CatalogoProveedores.tsx:306-341 |
| 6 | botón | «Importar» (icono `Upload`, outline) | `Link` a `/app/inventario/proveedores/importar` | Siempre | ProveedoresPageHeader.tsx:83-91 |
| 7 | toast | «Sin datos» / «No hay proveedores para exportar» (destructive) | Export vacío | Si el CSV es `''` o el blob mide 0 | CatalogoProveedores.tsx:235-240 · 273-279 · 311-317 |
| 8 | toast | «Exportación completada» / «El archivo CSV ha sido descargado» | Éxito (tres variantes: CSV / Excel / PDF) | Tras descargar | CatalogoProveedores.tsx:253-256 · 291-294 · 329-332 |
| 9 | toast | «Error» / «No se pudo exportar los proveedores» (destructive) | Fallo de exportación | En `catch` | CatalogoProveedores.tsx:259-263 |

**No hay KPIs.** `supplierService.getSupplierStats()` (total, con email, con teléfono, añadidos en
30 días) existe en `lib/services/supplierService.ts:445-469` y **nadie lo llama**.

### A.2 Listado — filtros `proveedores/FiltrosProveedores.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 10 | campo | `placeholder="Buscar por nombre, NIT, contacto..."` (`type="search"`, icono `Search`) | Escribe en `filters.busqueda`; **sin debounce**: cada tecla dispara el `useEffect` y una consulta nueva | Siempre; contenedor `flex-1` | FiltrosProveedores.tsx:142-148 · CatalogoProveedores.tsx:161 |
| 11 | botón | «Limpiar filtros» (`sm:` en adelante) / «Limpiar» (móvil), icono `X` | Resetea `{busqueda:'', estado:'', ordenarPor:'name'}` | Siempre; `disabled` si no hay búsqueda ni estado | FiltrosProveedores.tsx:154-163 |
| 12 | cálculo | — | La consulta busca `name, email, nit` con `or(...ilike)`; **el placeholder promete «contacto» y la pantalla no lo busca** (`supplierService.getSuppliers` sí incluye `contact`, pero el listado no usa ese método) | Siempre | CatalogoProveedores.tsx:71 vs supplierService.ts:182 |

Comentario en el código: «Aquí se pueden agregar más filtros como estado, fecha de creación, etc»
(FiltrosProveedores.tsx:152). El tipo `FiltrosProveedores` declara `estado` y `ordenarPor`
(`proveedores/types.ts:450-454`) y **ninguno de los dos tiene control visible**: `ordenarPor`
queda fijo en `'name'` ascendente, `estado` nunca cambia.

### A.3 Listado — tabla `proveedores/ProveedoresTable.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 13 | tabla (col) | «ID» | `proveedor.id` (entero secuencial) | Siempre; `w-[60px] sm:w-[80px]` | ProveedoresTable.tsx:256 · 283 |
| 14 | tabla (col) | «Nombre» → `CopyableId` | Texto azul que navega al detalle (`title="Ver detalle"`) + botón copiar el **uuid** (`title="Copiar"`, check verde 2 s) | Siempre | ProveedoresTable.tsx:257 · 285-289 · common/CopyableId.tsx:28-70 |
| 15 | tabla (col) | «NIT» | `nit \|\| '-'` | `md:` en adelante | ProveedoresTable.tsx:258 · 291 |
| 16 | tabla (col) | «Contacto» | `contact \|\| '-'` | `lg:` en adelante | ProveedoresTable.tsx:259 · 292 |
| 17 | tabla (col) | «Teléfono» | `phone \|\| '-'` | `sm:` en adelante | ProveedoresTable.tsx:260 · 293 |
| 18 | tabla (col) | «Correo» | `email \|\| '-'` | `xl:` en adelante | ProveedoresTable.tsx:261 · 294 |
| 19 | tabla (col) | «Días Crédito» | `condiciones_pago.dias_credito` — **`credit_days \|\| 30`**: un proveedor de contado (`credit_days = 0`) se pinta «30» | `md:` en adelante | ProveedoresTable.tsx:262 · 295-297 · CatalogoProveedores.tsx:140 |
| 20 | tabla (col) | «Cumplimiento» + barra de progreso + «{n}%» | Verde ≥80, amarillo ≥60, rojo <60; «Sin datos» si `undefined` | `lg:` en adelante; `w-[180px] sm:w-[200px]` | ProveedoresTable.tsx:263 · 223-248 |
| 21 | botón | Icono `Eye`, `title="Ver detalles"` | `Link` a `/app/inventario/proveedores/{uuid}` | Siempre | ProveedoresTable.tsx:303-312 |
| 22 | botón | Icono `Pencil`, `title="Editar"` | `Link` a `…/{uuid}/editar` | Siempre | ProveedoresTable.tsx:313-322 |
| 23 | botón | Icono `Copy`, `title="Duplicar"` | `supplierService.duplicateSupplier` y redirige a editar la copia | Solo si llega `onDuplicate` (siempre) | ProveedoresTable.tsx:323-333 · CatalogoProveedores.tsx:164-192 |
| 24 | botón | Icono `Trash2` (rojo), `title="Eliminar"` | Abre el `AlertDialog` | Siempre | ProveedoresTable.tsx:334-342 |
| 25 | estado | «No hay proveedores registrados» | Fila única `colSpan={9}` | Si la página actual está vacía | ProveedoresTable.tsx:268-276 |
| 26 | estado | `Skeleton h-8 w-8` centrado + «Duplicando...» | Carga o duplicado en curso | Mientras `loading \|\| isDuplicating` | CatalogoProveedores.tsx:357-360 |
| 27 | paginación | «Mostrando {a}-{b} de {n}» | Texto | Solo si `totalPages > 1` | ProveedoresTable.tsx:355-357 |
| 28 | paginación | «Anterior» (`ChevronLeft`) / «{p} / {total}» / «Siguiente» (`ChevronRight`) | Paginación **en memoria**, 10 por página fijos, sin selector de tamaño | Solo si `totalPages > 1`; el texto se oculta en móvil | ProveedoresTable.tsx:215 · 358-382 |

**No hay selección múltiple ni barra de acciones masivas** en proveedores (a diferencia del
catálogo de productos): no existen checkbox de fila, «seleccionar todo», ni `BulkActionBar`.

### A.4 Listado — diálogo de eliminación `CatalogoProveedores.tsx:370-390`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 29 | diálogo | Título «Confirmar eliminación» | `AlertDialog` | Tras el botón `Trash2` | CatalogoProveedores.tsx:373 |
| 30 | texto | «¿Estás seguro de que deseas eliminar este proveedor? Esta acción no se puede deshacer.» | Descripción. **No dice el nombre del proveedor ni avisa de órdenes/facturas asociadas** | Siempre en el diálogo | CatalogoProveedores.tsx:374-376 |
| 31 | botón | «Cancelar» | Cierra | Siempre | CatalogoProveedores.tsx:379-381 |
| 32 | botón | «Eliminar» (rojo) | `supplierService.deleteSupplier(uuid, orgId)` → `delete` duro; quita la fila del estado local | Siempre | CatalogoProveedores.tsx:382-387 · supplierService.ts:383-404 |
| 33 | toast | «Éxito» / «Proveedor eliminado correctamente» | — | Al borrar | CatalogoProveedores.tsx:204-207 |
| 34 | toast | «Error» / «No se pudo eliminar el proveedor» (destructive) | `purchase_orders.supplier_id` es `ON DELETE CASCADE` y `invoice_purchase.supplier_id` también: borrar un proveedor **arrastra sus órdenes y facturas de compra**; `accounts_payable.supplier_id` no tiene acción, así que si tiene cartera el `DELETE` falla con un error de FK crudo | En `catch` | CatalogoProveedores.tsx:213-218 · §F |
| 35 | toast | «Éxito» / «Proveedor duplicado correctamente» · «Error» / «No se pudo duplicar el proveedor» | Duplicado | Tras `Copy` | CatalogoProveedores.tsx:173-176 · 183-188 |

### A.5 Detalle `/app/inventario/proveedores/[id]` — `proveedores/detalle/ProveedorDetalle.tsx`

Una sola columna larga (`lg:col-span-2`) con **8 tarjetas** + panel lateral `sticky top-6`.
**No hay pestañas**: todo está apilado. Fechas con `useFormatDate()` (correcto, zona de la
organización).

#### A.5.1 Cabecera

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 36 | botón | «Volver» (`ArrowLeft`, ghost) | `Link` al listado | Siempre | ProveedorDetalle.tsx:184-186 |
| 37 | texto | Logo `next/image` 48×48 redondeado | `supplier.logo_url` | Solo si hay `logo_url` | ProveedorDetalle.tsx:188-189 |
| 38 | texto | `{supplier.name}` (h1 `text-2xl`) | — | Siempre | ProveedorDetalle.tsx:192 |
| 39 | texto | «NIT: {nit}» o «Proveedor #{id}» | Subtítulo | Siempre | ProveedorDetalle.tsx:193-195 |
| 40 | botón | «Editar» (`Edit`, outline) | `Link` a `…/{uuid}/editar` | Siempre | ProveedorDetalle.tsx:200-202 |
| 41 | botón | «Nueva Orden de Compra» (`Plus`, azul) | `router.push('/app/inventario/ordenes-compra/nuevo?supplier={id}')` | Siempre | ProveedorDetalle.tsx:203-205 |

**No hay** en el detalle: badge de estado (`is_active`), estrellas de `rating`, duplicar,
eliminar, desactivar, ni «Registrar pago». Todo eso existe en la BD o en el listado, no aquí.

#### A.5.2 Tarjeta «Información del Proveedor» (icono `Building2`)

Rejilla `md:grid-cols-2` de `InfoItem` (icono con fondo de color + etiqueta + valor).

| # | Tipo | Etiqueta exacta | Valor | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 42 | texto | «NIT / Identificación» | `nit \|\| 'No registrado'` | Siempre | ProveedorDetalle.tsx:220 |
| 43 | texto | «Persona de Contacto» | `contact \|\| 'No registrado'` | Siempre | ProveedorDetalle.tsx:221 |
| 44 | texto | «Teléfono» | `phone \|\| 'No registrado'` (texto plano, **no es un `tel:`**) | Siempre | ProveedorDetalle.tsx:222 |
| 45 | texto | «Correo Electrónico» | `email \|\| 'No registrado'` (**no es un `mailto:`**) | Siempre | ProveedorDetalle.tsx:223 |
| 46 | texto | «Sitio Web» | `website` (**texto plano, no enlaza**) | Solo si `website` | ProveedorDetalle.tsx:224 |
| 47 | texto | «Fecha de Registro» | `formatDate(created_at)` | Siempre | ProveedorDetalle.tsx:225 |
| 48 | texto | «Descripción» + `HtmlContentRenderer` | HTML del editor enriquecido, fondo `bg-blue-50` | Solo si `description` | ProveedorDetalle.tsx:228-235 |
| 49 | texto | «Notas» (icono `FileText`) + `HtmlContentRenderer` | HTML, fondo gris | Solo si `notes` | ProveedorDetalle.tsx:237-247 |

#### A.5.3 Tarjeta «Dirección» (icono `MapPin`)

| # | Tipo | Etiqueta exacta | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|
| 50 | texto | «Dirección» | Si `address` | ProveedorDetalle.tsx:261 |
| 51 | texto | «Ciudad» | Si `city` | ProveedorDetalle.tsx:262 |
| 52 | texto | «Departamento» | Si `state` | ProveedorDetalle.tsx:263 |
| 53 | texto | «País» | Si `country` | ProveedorDetalle.tsx:264 |
| 54 | texto | «Código Postal» | Si `postal_code` | ProveedorDetalle.tsx:265 |

Toda la tarjeta se oculta si `fullAddress` (concatenación de los 5) está vacía
(ProveedorDetalle.tsx:177 · 252). No hay mapa ni enlace a maps.

#### A.5.4 Tarjeta «Información Fiscal y Comercial» (icono `CreditCard`)

| # | Tipo | Etiqueta exacta | Valor | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 55 | texto | «Régimen Tributario» | Mapa: «Régimen Simple» / «Régimen Común» / «Gran Contribuyente» / «No Responsable de IVA»; si el valor no está en el mapa se pinta crudo | Si `tax_regime` | ProveedorDetalle.tsx:281 · 139-142 |
| 56 | texto | «Condiciones de Pago» | Mapa: «Contado» / «Crédito 15 días» / 30 / 60 / 90; fallback «No definido» | Si `payment_terms` | ProveedorDetalle.tsx:282 · 134-137 |
| 57 | texto | «Días de Crédito» | `{credit_days} días` | Si `credit_days` no es `null`/`undefined` (incluye 0) | ProveedorDetalle.tsx:283 |

La tarjeta entera se oculta si no hay ninguno de los tres (ProveedorDetalle.tsx:272).
**No se muestran** `tax_id`, `fiscal_responsibilities` ni `is_active`, que sí existen en la BD.

#### A.5.5 Tarjeta «Datos Fiscales DIAN» (icono `FileText`)

| # | Tipo | Etiqueta exacta | Valor | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 58 | texto | «Tipo Doc. DIAN» | `identification_document_code` crudo (se guarda «31», se pinta «31») | Si existe | ProveedorDetalle.tsx:299 |
| 59 | texto | «Dígito Verificación» | `dv` | Si existe | ProveedorDetalle.tsx:300 |
| 60 | texto | «Tipo Organización» | `'1'` → «Empresa», cualquier otro → «Persona Natural» | Si existe | ProveedorDetalle.tsx:301 |
| 61 | texto | «Código País» | `country_code` | Si existe | ProveedorDetalle.tsx:302 |
| 62 | texto | «Código Municipio» | `municipality_code` crudo (no se traduce a nombre) | Si existe | ProveedorDetalle.tsx:303 |
| 63 | texto | «Nombre Comercial» | `trade_name` | Si existe | ProveedorDetalle.tsx:304 |

#### A.5.6 Tarjeta «Información Bancaria» (icono `Landmark`)

| # | Tipo | Etiqueta exacta | Valor | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 64 | texto | «Banco» | `bank_name` | Si existe | ProveedorDetalle.tsx:320 |
| 65 | texto | «Número de Cuenta» | `bank_account` **en claro, sin enmascarar ni copiar** | Si existe | ProveedorDetalle.tsx:321 |
| 66 | texto | «Tipo de Cuenta» | «Ahorros» / «Corriente» / «Otro» | Si `account_type` | ProveedorDetalle.tsx:322 · 144-147 |

#### A.5.7 Tarjeta «Productos Vinculados» (icono `Package`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 67 | badge | `{products.length}` (azul) junto al título | Conteo | Si hay productos | ProveedorDetalle.tsx:334 |
| 68 | estado | «No hay productos vinculados a este proveedor» | Vacío | Si `products.length === 0` | ProveedorDetalle.tsx:339 |
| 69 | tabla (col) | «Producto» | `product.name` o `Producto #{id}` | Siempre | ProveedorDetalle.tsx:345 · 355 |
| 70 | tabla (col) | «SKU» | `product.sku \|\| '-'` | Siempre | ProveedorDetalle.tsx:346 · 356 |
| 71 | tabla (col) | «Costo» (derecha) | `formatCurrency(cost)` de `product_suppliers.cost` | Siempre | ProveedorDetalle.tsx:347 · 357 |
| 72 | tabla (col) | «Preferido» | Estrella amarilla rellena si `is_preferred`, si no «-» | Siempre | ProveedorDetalle.tsx:348 · 358 |
| 73 | tabla (col) | «SKU Proveedor» | `supplier_sku \|\| '-'` | Siempre | ProveedorDetalle.tsx:349 · 359 |
| 74 | botón (fila) | Fila entera `cursor-pointer` | Navega a `/app/inventario/productos/{uuid}` | Si el producto tiene uuid | ProveedorDetalle.tsx:354 |

**No se pintan** `lead_time_days` ni `min_order_qty` aunque se consultan
(ProveedorDetalle.tsx:66 · 76-77). **No hay** botón «Vincular producto» desde aquí: la relación
solo se crea desde la pestaña Proveedores del producto.

#### A.5.8 Tarjeta «Órdenes de Compra Recientes» (icono `ShoppingCart`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 75 | estado | «No hay órdenes de compra registradas» | Vacío | Si no hay | ProveedorDetalle.tsx:378 |
| 76 | tabla (col) | «Fecha» · «Número» · «Estado» · «Total» | `formatDate(created_at)` · `OC-{id}` · badge · `formatCurrency` | Siempre | ProveedorDetalle.tsx:384-387 · 393-396 |
| 77 | badge | «Borrador» gris · «Pendiente» amarillo · «Aprobada» verde · «Completada» azul · «Cancelada» rojo · «Pagada» verde | `getStatusBadge(status)`; cualquier estado desconocido cae a «Borrador» | Siempre | ProveedorDetalle.tsx:121-132 |
| 78 | botón (fila) | Fila `cursor-pointer` | `/app/inventario/ordenes-compra/{id}` | Siempre | ProveedorDetalle.tsx:392 |

Límite fijo de **10** órdenes (`supplierService.ts:474-486`), sin «ver todas» ni paginación. El
título dice «Recientes» pero no hay enlace al listado filtrado.

#### A.5.9 Tarjeta «Facturas de Compra Recientes» (icono `Receipt`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 79 | estado | «No hay facturas de compra registradas» | Vacío | Si no hay | ProveedorDetalle.tsx:415 |
| 80 | tabla (col) | «Fecha» · «Número» · «Estado» · «Total» | `created_at` · `number_ext` o `FC-{id.slice(0,8)}` · badge · moneda | Siempre | ProveedorDetalle.tsx:421-424 · 430-433 |
| 81 | botón (fila) | Fila `cursor-pointer` | `/app/finanzas/facturas-compra/{id}` | Siempre | ProveedorDetalle.tsx:429 |

Límite fijo de **10** (`supplierService.ts:503-515`). **Se consulta `issue_date` y se pinta
`created_at`** (supplierService.ts:511 vs ProveedorDetalle.tsx:430).

#### A.5.10 Tarjeta «Cuentas por Pagar» (icono `Wallet`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 82 | badge | `{accountsPayable.length}` (azul) | Conteo | Si hay | ProveedorDetalle.tsx:449 |
| 83 | estado | «No hay cuentas por pagar registradas» | Vacío | Si no hay | ProveedorDetalle.tsx:454 |
| 84 | tabla (col) | «Factura» · «Vencimiento» · «Estado» · «Monto» · «Saldo» | `invoice_number` o `CxP-{id.slice(0,8)}` · `due_date` o «-» · badge · `amount` · `balance` | Siempre | ProveedorDetalle.tsx:460-464 · 470-483 |
| 85 | badge | «Pagada» verde · «Vencida ({n}d)» rojo · «Parcial» amarillo · «Pendiente» gris | Según `status`; los días vienen de `accounts_payable.days_overdue` | Siempre | ProveedorDetalle.tsx:473-480 |
| 86 | botón (fila) | Fila `cursor-pointer` | `/app/finanzas/cuentas-por-pagar/{id}` | Siempre | ProveedorDetalle.tsx:469 |

**Sin límite**: trae todas las CxP del proveedor (`supplierService.ts:657-682`). Se consulta
`discount_amount` y no se pinta.

#### A.5.11 Tarjeta «Historial de Pagos» (icono `DollarSign` verde)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 87 | badge | `{payments.length}` (verde) | Conteo | Si hay | ProveedorDetalle.tsx:499 |
| 88 | estado | «No hay pagos registrados a este proveedor» | Vacío | Si no hay | ProveedorDetalle.tsx:504 |
| 89 | tabla (col) | «Fecha» · «Método» · «Referencia» · «Origen» · «Monto» | `payment_date` o `created_at` · `method` con `capitalize` (**valor crudo de la BD: «cash», «card»…**) · `reference \|\| '-'` · «CxP» / «Factura» · monto en verde | Siempre | ProveedorDetalle.tsx:510-514 · 519-525 |

Las filas **no navegan** (a diferencia de las otras cuatro tablas). No hay botón «Registrar pago».

#### A.5.12 Tarjeta «Stock de Productos del Proveedor» (icono `Boxes`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 90 | badge | `{stockSummary.length}` (azul) | Conteo | Si hay | ProveedorDetalle.tsx:540 |
| 91 | estado | «No hay productos con stock registrado» | Vacío | Si no hay | ProveedorDetalle.tsx:545 |
| 92 | tabla (col) | «Producto» · «SKU» · «Costo» · «Stock Total» · «Valor Stock» | `stock_total` o «N/A» si `track_stock` es falso; `stock_value = stock_total × cost` calculado en el navegador | Siempre | ProveedorDetalle.tsx:551-555 · 561-567 · supplierService.ts:835-851 |
| 93 | botón (fila) | Fila `cursor-pointer` | `/app/inventario/productos/{uuid}` | Si hay uuid | ProveedorDetalle.tsx:560 |

**El stock suma todas las sucursales** e ignora el filtro global de sucursal
(`supplierService.ts:821-833`). Se calcula `branches_with_stock` y no se pinta.

#### A.5.13 Panel lateral «Resumen Financiero» (`sticky top-6`)

Ocho filas `label / valor`, **todas calculadas en el navegador** sobre los arrays ya cargados.

| # | Tipo | Etiqueta exacta | Cálculo | Archivo:línea |
|---|---|---|---|---|
| 94 | stat | «Productos» | `products.length` | ProveedorDetalle.tsx:617-619 |
| 95 | stat | «Órdenes de Compra» | `purchaseOrders.length` — **solo las 10 traídas**, no el total real | ProveedorDetalle.tsx:621-623 |
| 96 | stat | «Facturas» | `invoices.length` — **solo las 10 traídas** | ProveedorDetalle.tsx:625-627 |
| 97 | stat | «Total Compras» (verde) | `reduce` de los totales de esas 10 órdenes | ProveedorDetalle.tsx:629-633 |
| 98 | stat | «Total Facturado» | `reduce` de los totales de esas 10 facturas | ProveedorDetalle.tsx:635-639 |
| 99 | stat | «Saldo Pendiente CxP» (icono `TrendingDown` rojo) | `reduce` de `balance` (este sí sobre todas las CxP) | ProveedorDetalle.tsx:641-648 |
| 100 | stat | «Total Pagado» (icono `DollarSign` verde) | `reduce` de `amount` | ProveedorDetalle.tsx:650-657 |
| 101 | stat | «Valor en Stock» (icono `Boxes` azul) | `reduce` de `stock_value` | ProveedorDetalle.tsx:659-666 |
| 102 | botón | «Editar Proveedor» (`Edit`, outline, ancho completo) | `Link` a editar — **duplica el botón #40 de la cabecera** | ProveedorDetalle.tsx:668-672 |

#### A.5.14 Estados de la pantalla

| # | Tipo | Etiqueta exacta | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|
| 103 | estado | `PageHeaderSkeleton` + `DetailSkeleton` | Mientras `isLoading` | ProveedorDetalle.tsx:159-166 |
| 104 | estado | «Proveedor no encontrado» + botón «Volver a la lista» | Si `supplier` es `null` tras cargar | ProveedorDetalle.tsx:168-175 |
| 105 | toast | «Error» / «Proveedor no encontrado» (destructive) + redirección al listado | Si el uuid no existe | ProveedorDetalle.tsx:74-76 |
| 106 | toast | «Error» / mensaje del `catch` (destructive) + redirección | Si falla la carga | ProveedorDetalle.tsx:112-115 |

El estado #104 es **inalcanzable en la práctica**: los dos caminos que dejan `supplier` en `null`
hacen `router.push` antes (ProveedorDetalle.tsx:75 · 115).

### A.6 Nuevo proveedor `/app/inventario/proveedores/nuevo` — `proveedores/nuevo/NuevoProveedorForm.tsx`

Formulario de 2/3 + panel lateral. Acepta `embedded`, `onSuccess`, `onCancel` para reutilizarse
dentro de diálogos (NuevoProveedorForm.tsx:22-31); **hoy nadie lo usa embebido**.

#### A.6.1 Tarjeta «Información del Proveedor» (icono `Building2`)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 107 | botón | «Volver» (`ArrowLeft`, ghost) | `Link` al listado | Si `!embedded` | NuevoProveedorForm.tsx:283-285 |
| 108 | texto | «Nuevo Proveedor» (h1) + «Registra un nuevo proveedor en el sistema» | — | Si `!embedded` | NuevoProveedorForm.tsx:287-288 |
| 109 | toggle | «Tipo de Proveedor» → tarjetas «Empresa» (`Building2`) / «Persona Natural» (`User`) | Dos `div` clicables `grid-cols-2 max-w-md`; **sin `role`, sin teclado** | Siempre | NuevoProveedorForm.tsx:305-323 |
| 110 | campo | «Empresa proveedora asociada (opcional)» → `Select`, placeholder «Sin empresa asociada» | Lista **todos** los `suppliers` con `supplier_type='company'` de la organización, sin límite ni búsqueda, orden por `name`; escribe `parent_supplier_id` | Solo si `supplierType === 'person'` **y** hay al menos una empresa | NuevoProveedorForm.tsx:326-340 · 150-163 |
| 110a | texto | «Vincula esta persona como contacto/proveedor hijo de una empresa» | Ayuda | Con el #110 | NuevoProveedorForm.tsx:338 |
| 111 | campo | «Razón Social *» (empresa) / «Nombre completo *» (persona); placeholder «Empresa S.A.S.» / «Juan Pérez» | Único obligatorio; borde rojo + «El nombre es requerido» si falla | Siempre; `md:col-span-2` | NuevoProveedorForm.tsx:344-346 · 246 |
| 112 | campo | «Tipo de Documento» → `Select`, placeholder «Seleccionar» | Opciones de `country_identification_types` filtradas por el `country_code` de la organización, con fallback al país «GEN» y, si tampoco hay, a la lista cableada «ID Tributario / Fiscal», «Documento nacional», «Pasaporte», «Otro» | Siempre; se filtra por `forCompany`/`forPerson` | NuevoProveedorForm.tsx:349-357 · 105-176 |
| 113 | campo | «Número de Documento», placeholder «123456789-0» | Escribe `nit`; **`onBlur` dispara la consulta DIAN/RUES** | Siempre | NuevoProveedorForm.tsx:362-368 |
| 114 | botón | Icono `Building2`, `title="Consultar DIAN/RUES"`, `aria-label` igual | `POST /api/dian/lookup` y autocompleta nombre, email, teléfono, dirección, ciudad, departamento, régimen y responsabilidades fiscales | `disabled` si no hay autorización Habeas Data, si ya está consultando o si el nº tiene <4 caracteres | NuevoProveedorForm.tsx:369-384 · 56-97 |
| 115 | toggle | `HabeasDataCheckbox` (texto en `shared/DianLookupButton`) | Autoriza el tratamiento de datos (Ley 1581/2012); sin él, #114 queda deshabilitado | Siempre | NuevoProveedorForm.tsx:386-390 |
| 116 | campo | «Persona de Contacto», placeholder «Nombre del contacto» (icono `User`) | Escribe `contact` | Siempre | NuevoProveedorForm.tsx:393-397 |
| 117 | campo | «Sitio Web», placeholder «https://www.ejemplo.com» (icono `Globe`) | Escribe `website`; **sin validación de URL** | Siempre | NuevoProveedorForm.tsx:400-404 |
| 118 | campo | «Descripción» → `RichTextEditor`, placeholder «Descripción del proveedor, productos que ofrece...» | HTML | Siempre | NuevoProveedorForm.tsx:417 |
| 119 | botón | «Generar con IA» / «Generando...» (icono `Sparkles`/`Loader2`, morado) | `POST /api/ai-assistant/improve-text` con `type: 'supplier_description'` | `disabled` sin nombre | NuevoProveedorForm.tsx:412-415 · 209-224 |

#### A.6.2 Tarjetas «Información de Contacto», «Dirección», «Información Fiscal y Comercial»

| # | Tipo | Etiqueta exacta | Placeholder | Archivo:línea |
|---|---|---|---|---|
| 120 | campo | «Teléfono» (icono `Phone`) | «+57 300 123 4567» | NuevoProveedorForm.tsx:432-435 |
| 121 | campo | «Correo Electrónico» (`type="email"`, icono `Mail`) | «proveedor@ejemplo.com»; valida con regex y muestra «Email inválido» | NuevoProveedorForm.tsx:439-444 · 247 |
| 122 | campo | «Dirección» (`md:col-span-2`) | «Calle, número, oficina...» | NuevoProveedorForm.tsx:460-461 |
| 123 | campo | «Ciudad» | «Ciudad» | NuevoProveedorForm.tsx:464-465 |
| 124 | campo | «Departamento / Estado» | «Departamento» | NuevoProveedorForm.tsx:468-469 |
| 125 | campo | «País» | «Colombia» (valor inicial «Colombia», texto libre, **no es un selector de países**) | NuevoProveedorForm.tsx:472-473 |
| 126 | campo | «Código Postal» | «110111» | NuevoProveedorForm.tsx:476-477 |
| 127 | campo | «Régimen Tributario» → `Select`, placeholder «Seleccionar régimen» | «Régimen Simple» · «Régimen Común» · «Gran Contribuyente» · «No Responsable de IVA» | NuevoProveedorForm.tsx:493-502 |
| 128 | campo | «Condiciones de Pago» → `Select`, placeholder «Seleccionar» | «Contado» · «Crédito 15 días» · «Crédito 30 días» · «Crédito 60 días» · «Crédito 90 días»; **al elegir, rellena «Días de Crédito» con 0/15/30/60/90** | NuevoProveedorForm.tsx:505-519 |
| 129 | campo | «Días de Crédito» (`type="number" min="0"`) | «30» | NuevoProveedorForm.tsx:522-523 |

**No hay** campo para `tax_id`, `fiscal_responsibilities` (solo se rellena desde la consulta
DIAN), `is_active` ni `rating`, aunque las cuatro columnas existen en la BD.

#### A.6.3 Tarjeta «Datos Fiscales DIAN» (icono `FileText`)

| # | Tipo | Etiqueta exacta | Qué hace | Archivo:línea |
|---|---|---|---|---|
| 130 | campo | «Dígito de Verificación (DV)», placeholder «0-9», `maxLength={1}`, ancho `w-20` | Escribe `dv` | NuevoProveedorForm.tsx:541-547 |
| 131 | botón | «Calcular DV» (outline) | `calcularDv(nit)` (módulo 11 DIAN) de `lib/utils/nitDv`; `disabled` sin NIT | NuevoProveedorForm.tsx:548-557 · 196-207 |
| 131a | texto | «Auto-calculable desde el NIT (módulo 11)» | Ayuda | NuevoProveedorForm.tsx:559-561 |
| 132 | campo | «Nombre Comercial», placeholder «Nombre comercial (opcional)» | `trade_name` | NuevoProveedorForm.tsx:564-570 |
| 133 | campo | «Código Tipo Documento DIAN» → `Select` (sin placeholder) | «31 - NIT» · «13 - Cédula de ciudadanía» · «22 - Cédula de extranjería» · «42 - Doc. identificación extranjero» · «12 - Tarjeta de identidad» · «41 - Pasaporte» · «91 - NUIP»; se **auto-mapea** desde «Tipo de Documento» (#112) vía `mapearTipoDocADian` | NuevoProveedorForm.tsx:573-590 · 180-188 |
| 134 | campo | «Tipo Organización DIAN» → `Select` | «1 - Empresa» · «2 - Persona Natural»; se **auto-fija** según el toggle #109 | NuevoProveedorForm.tsx:593-605 · 186 |
| 135 | campo | «Código País», `maxLength={2}`, `toUpperCase()` | «CO» | NuevoProveedorForm.tsx:608-615 |
| 136 | campo | «Código Municipio DIAN», `maxLength={5}`, placeholder «05001» | Texto libre; **no hay buscador de municipios** (el formulario de clientes sí tiene `MunicipalitySearch`) | NuevoProveedorForm.tsx:618-625 |
| 136a | texto | «Código DIAN de 5 dígitos (ej: 05001 = Medellín)» | Ayuda | NuevoProveedorForm.tsx:626-628 |

#### A.6.4 «Información Bancaria», «Notas Adicionales», panel lateral

| # | Tipo | Etiqueta exacta | Qué hace | Archivo:línea |
|---|---|---|---|---|
| 137 | campo | «Banco», placeholder «Nombre del banco» | Texto libre, **no es un selector de bancos** | NuevoProveedorForm.tsx:644-645 |
| 138 | campo | «Número de Cuenta», placeholder «Número de cuenta» | Texto libre, sin máscara | NuevoProveedorForm.tsx:648-649 |
| 139 | campo | «Tipo de Cuenta» → `Select`, placeholder «Seleccionar» | «Ahorros» · «Corriente» · «Otro» | NuevoProveedorForm.tsx:652-660 |
| 140 | campo | «Notas Adicionales» → `RichTextEditor`, placeholder «Información adicional sobre el proveedor...» | Sin botón de IA (comentario «Notas (sin IA)») | NuevoProveedorForm.tsx:666-675 |
| 141 | botón | «Guardar Proveedor» (azul, ancho completo, `Save`/`Loader2`) | `supplierService.createSupplier` → redirige al detalle | NuevoProveedorForm.tsx:686-689 · 252-277 |
| 142 | botón | «Cancelar» (outline, ancho completo) | `Link` al listado, o `onCancel()` si `embedded` | NuevoProveedorForm.tsx:690-696 |
| 143 | botón | «Generar con IA» / «Generando...» (icono `Wand2`, morado) en la tarjeta «Logo» | `POST /api/ai-assistant/generate-image` con «Logo profesional para proveedor: {nombre}» | NuevoProveedorForm.tsx:705-708 · 226-242 |
| 144 | campo | `ImageUploader` (bucket `supplier-logos`, carpeta `logos`, sin etiqueta) | Sube/quita el logo | NuevoProveedorForm.tsx:712-719 |
| 145 | toast | «Proveedor creado» / «El proveedor ha sido creado correctamente» | Éxito | NuevoProveedorForm.tsx:265 |
| 146 | toast | «Error» / mensaje del servidor (destructive) | Fallo | NuevoProveedorForm.tsx:275 |
| 147 | toast | «Descripción generada con IA» · «Logo generado con IA» · «Escribe el nombre primero» · «Ingresa el NIT primero» · «DV calculado» / «Dígito de verificación: {n}» | Microtoasts | NuevoProveedorForm.tsx:220 · 238 · 210 · 199 · 205 |

### A.7 Editar proveedor `/app/inventario/proveedores/[id]/editar` — `proveedores/editar/EditarProveedorForm.tsx`

Es una copia del formulario de alta **a la que le faltan controles**, y esa diferencia tiene
consecuencias en la BD (ver §G).

| # | Tipo | Etiqueta exacta | Diferencia respecto a «Nuevo» | Archivo:línea |
|---|---|---|---|---|
| 148 | botón | «Volver» (`ArrowLeft`) | Vuelve al **detalle**, no al listado | EditarProveedorForm.tsx:170-172 |
| 149 | texto | «Editar Proveedor» + «Modifica la información del proveedor» | — | EditarProveedorForm.tsx:174-175 |
| 150 | campo | «Nombre / Razón Social *», placeholder «Nombre del proveedor» | Etiqueta y placeholder **distintos** a los del alta (#111) | EditarProveedorForm.tsx:192-193 |
| 151 | campo | «NIT / Identificación», placeholder «123456789-0» | **Sin consulta DIAN/RUES, sin Habeas Data, sin «Tipo de Documento»** | EditarProveedorForm.tsx:197-198 |
| 152 | campo | «Descripción» → **`Textarea rows={3}`** | El alta usa `RichTextEditor`: al editar, el HTML guardado se muestra como etiquetas en crudo y se vuelve a guardar como texto | EditarProveedorForm.tsx:225 |
| 153 | campo | «Notas Adicionales» → **`Textarea rows={3}`** | Igual que #152 | EditarProveedorForm.tsx:482 |
| 154 | botón | «Guardar Cambios» (azul) | `supplierService.updateSupplier` → redirige al detalle | EditarProveedorForm.tsx:148-151 · 494-497 |
| 155 | botón | «Cancelar» (outline) | `Link` al detalle | EditarProveedorForm.tsx:499 |
| 156 | estado | `PageHeaderSkeleton` + `DetailSkeleton` | Mientras `isLoading` | EditarProveedorForm.tsx:158-165 |
| 157 | toast | «Proveedor actualizado» / «Los cambios han sido guardados correctamente» | Éxito | EditarProveedorForm.tsx:150 |

Idénticos al alta: «Persona de Contacto», «Sitio Web», «Teléfono», «Correo Electrónico», las 5
de Dirección, las 3 fiscales, las 6 de «Datos Fiscales DIAN» (con «Calcular DV»), las 3
bancarias, la tarjeta «Logo» con «Generar con IA» y el `ImageUploader` a `supplier-logos`.

**Faltan respecto al alta** (5 controles): el toggle «Tipo de Proveedor», el selector «Empresa
proveedora asociada», el `Select` «Tipo de Documento», el botón «Consultar DIAN/RUES» y el
`HabeasDataCheckbox`.

### A.8 Importar proveedores `/app/inventario/proveedores/importar` — `proveedores/importar/ImportarProveedores.tsx`

Asistente de **una sola pantalla** (no hay pasos): archivo → vista previa → importar → resultados.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 158 | botón | «Volver» (`ArrowLeft`, ghost) | `Link` al listado | Siempre | ImportarProveedores.tsx:431-436 |
| 159 | texto | «Importar Proveedores» (h1) + «Importa proveedores masivamente desde un archivo CSV o Excel» | — | Siempre | ImportarProveedores.tsx:438-443 |
| 160 | texto | «Seleccionar Archivo» (`CardTitle`, icono `FileSpreadsheet`) + «Sube un archivo CSV o Excel (.xlsx) con los proveedores a importar» | — | Siempre | ImportarProveedores.tsx:453-459 |
| 161 | campo | Zona `border-2 border-dashed p-8`, «Arrastra un archivo o haz clic para seleccionar» + «Archivos CSV o Excel (.xlsx)» (icono `FileUp`) | `<input type="file" accept=".csv,.xlsx,.xls">` oculto tras un `<label>`. **No hay `onDrop`: arrastrar no funciona** | Si no hay archivo | ImportarProveedores.tsx:462-499 |
| 162 | estado | `CheckCircle` verde + `{file.name}` + «{n} registros encontrados» + botón «Seleccionar otro archivo» | Archivo cargado; el borde pasa a verde | Si hay archivo | ImportarProveedores.tsx:478-488 |
| 163 | texto | «Vista Previa ({n} registros)» | Título de la tarjeta de previsualización | Si `parsedData.length > 0` | ImportarProveedores.tsx:508-510 |
| 164 | badge | «{n} válidos» (verde, `CheckCircle`) | Conteo | Siempre en la vista previa | ImportarProveedores.tsx:512-515 |
| 165 | badge | «{n} con errores» (rojo, `XCircle`) | Conteo | Si hay inválidos | ImportarProveedores.tsx:516-521 |
| 166 | tabla (col) | «Fila» · «Nombre» · «NIT» · «Contacto» · «Teléfono» · «Email» · «Estado» | Vista previa en `max-h-96`; las filas inválidas llevan fondo `bg-red-50` | Siempre | ImportarProveedores.tsx:529-535 · 540-551 |
| 167 | badge | «Válido» (verde) / lista de errores separada por comas (rojo) | Errores posibles: «Nombre es requerido», «Email inválido», «Tipo debe ser "person" o "company"», «Días Crédito debe ser numérico» | Por fila | ImportarProveedores.tsx:552-563 · 171-189 |
| 168 | botón | «Descargar Plantilla» (`Download`, outline) | Genera `plantilla_proveedores.csv` con 25 columnas y una fila de ejemplo | Siempre | ImportarProveedores.tsx:620-627 · 54-72 |
| 169 | botón | «Importar {n} Proveedores» (azul, `Upload`/`Loader2`) | `supplierService.importSuppliers`: un `INSERT` por fila en bucle, sin transacción | Solo si hay filas válidas y aún no hay resultados | ImportarProveedores.tsx:629-642 · supplierService.ts:532-625 |
| 170 | botón | «Ver Proveedores» (verde, `CheckCircle`) | `Link` al listado | Solo tras importar con al menos 1 éxito | ImportarProveedores.tsx:644-651 |
| 171 | texto | «Instrucciones» (icono `AlertTriangle` amarillo) + lista ordenada de 6 pasos: «Descarga la plantilla CSV», «Llena los datos de proveedores», «El campo "Nombre" es obligatorio», «Guarda el archivo en formato CSV», «Sube el archivo y verifica la vista previa», «Haz clic en "Importar" para confirmar» | Ayuda lateral | Siempre | ImportarProveedores.tsx:655-672 |
| 172 | estado | «Resultados de Importación» + «{n} importados correctamente» (verde) + «{n} con errores» (rojo) + lista «Fila {n}: {error}» | Resultado | Tras importar | ImportarProveedores.tsx:574-610 |
| 173 | toast | «Archivo inválido» / «Por favor selecciona un archivo CSV o Excel (.xlsx)» · «Archivo vacío» / «El archivo no contiene datos para importar» · «Error» / «No se pudo procesar el archivo» · «Sin datos válidos» / «No hay proveedores válidos para importar» · «Importación completada» / «{n} proveedores importados correctamente» · «Errores en la importación» / «{n} proveedores no pudieron ser importados» | — | Según el caso | ImportarProveedores.tsx:294-298 · 324-328 · 332-336 · 347-351 · 389-392 · 396-400 |

Columnas de la plantilla (ImportarProveedores.tsx:55): Nombre · Tipo · NIT · Tipo Doc · Contacto ·
Teléfono · Email · Descripción · Dirección · Ciudad · Departamento · País · Código Postal ·
Tax ID · Régimen Tributario · Responsabilidades Fiscales · Términos de Pago · Días Crédito ·
Sitio Web · Activo · Rating · Banco · Cuenta Bancaria · Tipo Cuenta · Notas. Cada cabecera admite
alias en español y en inglés (`headerIndex` / `getStr`, ImportarProveedores.tsx:82-115 · 205-213).
**«Activo» y «Rating» se leen y se tiran** (`void isActive; void rating;`, l.192-193) y el
importador del servicio tampoco los inserta.

**No hay**: paso de mapeo de columnas, detección de duplicados por NIT, actualización de
existentes (solo inserta), barra de progreso durante la importación, ni estado de carga mientras
se parsea (`isProcessing` se calcula en l.303/338 y **no se renderiza en ninguna parte**).

---

## B. Categorías

Cuatro rutas bajo `/app/inventario/categorias`. **Tampoco hay control de permisos** en ninguna.
La organización sale de `useOrganization()` en el listado y el detalle, y de `getOrganizationId()`
(localStorage) en el importador — dos vías distintas en la misma pantalla.

**Código muerto**: `categorias/nuevo/NuevaCategoriaForm.tsx` (391 líneas) y
`categorias/editar/EditarCategoriaForm.tsx` (279 líneas) son formularios completos con su propio
`generateSlug` (`NuevaCategoriaForm.tsx:70`) que **ningún archivo importa**: las rutas `nuevo` y
`[id]/editar` usan `CategoryForm` (`app/app/inventario/categorias/nuevo/page.tsx:8`,
`[id]/editar/page.tsx:10`).

### B.1 Árbol `/app/inventario/categorias` — cabecera `categorias/CategoriesPageHeader.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 174 | botón | Icono `ArrowLeft`, `aria-label="Volver a inventario"` | `Link` a `/app/inventario` | Siempre | CategoriesPageHeader.tsx:41-47 |
| 175 | texto | Icono `FolderTree` sobre `bg-blue-100` + «Categorías» (h1) + «Organiza tus productos en categorías jerárquicas» | — | Siempre | CategoriesPageHeader.tsx:48-56 |
| 176 | menú | «Exportar» (`Download` + `ChevronDown`, outline `size="sm"`) | Abre el `DropdownMenu` | Siempre | CategoriesPageHeader.tsx:61-72 |
| 176a | menú (ítem) | «CSV» | `categoryService.exportCategoriesToCSV` → `categorias_{Date.now()}.csv` | Siempre | CategoriesPageHeader.tsx:74-77 · page.tsx:71-83 |
| 176b | menú (ítem) | «Excel (XLSX)» | → `categorias_{Date.now()}.xlsx` | Siempre | CategoriesPageHeader.tsx:78-81 · page.tsx:85-96 |
| 176c | menú (ítem) | «PDF» | → `categorias_{Date.now()}.pdf` | Siempre | CategoriesPageHeader.tsx:82-85 · page.tsx:98-109 |
| 177 | botón | «Importar» (`Upload`, outline) | Abre `ImportCategoriesDialog` | Siempre | CategoriesPageHeader.tsx:89-97 |
| 178 | botón | «Actualizar» (`RefreshCw`, gira mientras refresca) | `loadData(true)` | Siempre; `disabled` mientras `isRefreshing` | CategoriesPageHeader.tsx:99-108 |
| 179 | botón | «Nueva Categoría» (`Plus`, azul) | `router.push('/app/inventario/categorias/nuevo')` | Siempre; en móvil ocupa las 2 columnas | CategoriesPageHeader.tsx:110-117 |
| 180 | toast | «Exportación completada» / «CSV generado correctamente» (o «Excel…», «PDF…») · «Error» / mensaje (destructive) | — | Tras exportar | page.tsx:78 · 91 · 104 |

La barra de acciones es `grid grid-cols-2` en móvil y `flex` desde `sm:` (CategoriesPageHeader.tsx:60).
Los nombres de archivo usan `Date.now()` (un epoch en milisegundos, ilegible), a diferencia de
proveedores que usa una fecha.

### B.2 Árbol — KPIs `categorias/CategoriesStatsCards.tsx`

| # | Tipo | Etiqueta exacta | Valor | Archivo:línea |
|---|---|---|---|---|
| 181 | stat | «Total» (icono `FolderTree` azul) | `categories.length` | CategoriesStatsCards.tsx:177 · categoryService.ts:124 |
| 182 | stat | «Activas» (icono `CheckCircle2` verde) | `filter(is_active)` | CategoriesStatsCards.tsx:178 · categoryService.ts:125 |
| 183 | stat | «Inactivas» (icono `XCircle` ámbar) | `filter(!is_active)` | CategoriesStatsCards.tsx:179 · categoryService.ts:126 |
| 184 | stat | «Raíz» (icono `Package` morado) | `filter(parent_id === null)` | CategoriesStatsCards.tsx:180 · categoryService.ts:127 |

Rejilla `grid-cols-2 sm:grid-cols-4`. Los cuatro se calculan **en el navegador** sobre el array
completo (`computeStats`, categoryService.ts:121-130). `withChildren` se calcula y **no se pinta**.
Ninguno es clicable (no filtran).

### B.3 Árbol — barra de herramientas `categorias/CategoriesToolbar.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Archivo:línea |
|---|---|---|---|---|
| 185 | campo | `placeholder="Buscar categorías..."` (icono `Search`, `flex-1 max-w-md`) | Filtra **en memoria** y **solo por `name`**; sin debounce | CategoriesToolbar.tsx:143-148 · useCategories.ts:177-179 |
| 186 | botón | «Expandir todo» (`ChevronDown`, outline `text-xs`) | Añade todos los ids al `Set` de expandidos | CategoriesToolbar.tsx:151-153 · useCategories.ts:164-171 |
| 187 | botón | «Colapsar todo» (`ChevronRight`, outline `text-xs`) | Vacía el `Set` | CategoriesToolbar.tsx:154-156 · useCategories.ts:173 |

**El filtro actúa sobre el árbol ya aplanado y solo con las ramas expandidas**
(`flattenTree` solo desciende si `isExpanded`, useCategories.ts:44-46; `filtered` filtra ese
resultado, useCategories.ts:176-179): si el usuario colapsa una rama, sus hijas **no aparecen en
la búsqueda**. Al cargar, todas quedan expandidas (useCategories.ts:81).

### B.4 Árbol — tabla `categorias/CategoriesTreeTable.tsx`

Tabla con **drag & drop** (`@hello-pangea/dnd`) para reparentar.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 188 | botón | Asa `GripVertical`, `title="Arrastra para mover a otra categoría"` (`cursor-grab`) | Inicia el arrastre | Siempre; columna `w-[40px]` | CategoriesTreeTable.tsx:237-245 |
| 189 | tabla (col) | «Nombre» (icono `FolderTree`), `w-[350px]` | Sangría `level × 24px` | Siempre | CategoriesTreeTable.tsx:191-193 · 249 |
| 190 | botón | Chevron `ChevronDown`/`ChevronRight` | Expande/colapsa la rama | Solo si `hasChildren`; si no, hueco `w-5` | CategoriesTreeTable.tsx:250-258 |
| 191 | texto | Icono Lucide dinámico sobre `{color}20`, o punto de color `w-3 h-3` | `renderCatIcon`: resuelve `LucideIcons[cat.icon]`; si el nombre no existe, no pinta nada | Icono si `cat.icon`; punto si no | CategoriesTreeTable.tsx:81-93 · 259-262 |
| 192 | botón | `CopyableId` con el nombre | Navega a `/app/inventario/categorias/{uuid}`; copia el **uuid** | Siempre | CategoriesTreeTable.tsx:263-267 |
| 193 | badge | «Nv.{level}» (gris, `text-[10px]`) | Nivel de anidamiento | Si `level > 0` | CategoriesTreeTable.tsx:268-272 |
| 194 | badge | «Soltar aquí → subcategoría» (azul, `animate-pulse`) | Destino de arrastre | Mientras se arrastra sobre esa fila | CategoriesTreeTable.tsx:273-277 |
| 195 | tabla (col) | «Color» (icono `Palette`), `w-[60px]` | Cuadro `w-6 h-6` con `title` = el hex; fallback `#3B82F6` | Siempre | CategoriesTreeTable.tsx:194-196 · 282-286 |
| 196 | tabla (col) | «Imagen» (icono `ImageIcon`), `w-[80px]` | `<img>` 32×32 (**`<img>` plano, no `next/image`**) o icono gris | Siempre | CategoriesTreeTable.tsx:197-199 · 289-295 |
| 197 | tabla (col) | «Estado» (icono `CheckCircle2`) | Badge «Activa» verde / «Inactiva» ámbar outline | Siempre | CategoriesTreeTable.tsx:200-202 · 298-308 |
| 198 | tabla (col) | «Productos» (icono `Package`) | `productCount` (gris si 0). **No es un enlace al catálogo filtrado** | Siempre | CategoriesTreeTable.tsx:203-205 · 311-315 |
| 199 | tabla (col) | «Hijas» (icono `FolderTree`) | `childCount` (azul si >0) | Siempre | CategoriesTreeTable.tsx:206-208 · 318-322 |
| 200 | tabla (col) | «Prep.» (icono `ChefHat`) | Círculo naranja con `ChefHat` (`title="Requiere preparación"`) o «—» (`title="Sin preparación"`) | Siempre | CategoriesTreeTable.tsx:209-211 · 325-333 |
| 201 | tabla (col) | «Slug» (icono `Tag`) | `cat.slug` en mono, `max-w-[120px]` con salto de línea | Siempre | CategoriesTreeTable.tsx:212-214 · 336-340 |
| 202 | botón | Icono `Eye`, `title="Ver detalle"` | Detalle | Solo al pasar el ratón (`opacity-0 group-hover:opacity-100`) | CategoriesTreeTable.tsx:344-347 |
| 203 | botón | Icono `Edit`, `title="Editar"` | `…/{uuid}/editar` | Solo al pasar el ratón | CategoriesTreeTable.tsx:348-350 |
| 204 | menú | Icono `MoreVertical` | Abre el `DropdownMenu align="end"` | Solo al pasar el ratón | CategoriesTreeTable.tsx:351-354 |
| 204a | menú (ítem) | «Agregar subcategoría» (`FolderPlus`) | `/app/inventario/categorias/nuevo?parent={id}` | Siempre | CategoriesTreeTable.tsx:356-358 |
| 204b | menú (ítem) | «Duplicar» (`Copy`) | `categoryService.duplicate`: nombre «{n} (copia)», slug «{slug}-copia-{epoch}» | Siempre | CategoriesTreeTable.tsx:359-361 · categoryService.ts:331-352 |
| 204c | menú (ítem) | «Desactivar» / «Activar» (`ToggleLeft`) | `toggleActive` | Siempre | CategoriesTreeTable.tsx:362-364 |
| 204d | menú (ítem) | «Mover a raíz» (`ArrowUpRight`) | `move(id, null, 999)` | Solo si `level > 0` | CategoriesTreeTable.tsx:365-369 |
| 204e | menú (ítem) | «Eliminar» (`Trash2`, rojo) | Abre el `AlertDialog` | Siempre; tras un `DropdownMenuSeparator` | CategoriesTreeTable.tsx:370-373 |
| 205 | estado | Fila especial «Arrastra aquí para mover a raíz» / «Soltar aquí → mover a raíz» (icono `Home`, borde punteado; verde al pasar por encima) | Zona de soltar para desanidar | Siempre al final de la tabla | CategoriesTreeTable.tsx:384-420 |
| 206 | estado | «No hay categorías» + «Crea tu primera categoría» + botón «Crear Categoría» (`Plus`, azul) | Vacío sin búsqueda | Si `filtered.length === 0` y no hay término | CategoriesTreeTable.tsx:162-181 |
| 207 | estado | «Sin resultados» + «No se encontraron resultados para "{término}"» (sin botón) | Vacío con búsqueda | Si `filtered.length === 0` y hay término | CategoriesTreeTable.tsx:167-172 |
| 208 | estado | `CategoriesLoadingSkeleton`: 4 tarjetas `h-20`, barra `h-12`, 5 filas `h-14` | Carga inicial | Mientras `isLoading` | CategoriesLoadingSkeleton.tsx:206-216 · page.tsx:127-128 |
| 209 | toast | «Categoría desactivada» / «Categoría activada» · «Categoría duplicada» · «Categoría eliminada» · «Categoría movida a raíz» / «La categoría ya no tiene padre» · «Categoría movida» / «Ahora es subcategoría de "{nombre}"» | Acciones | Según el caso | useCategories.ts:96 · 107 · 120 · 133 · 146-148 |
| 210 | toast | «Error» / «No se pudieron cargar las categorías» · «No se pudo cambiar el estado» · «No se pudo duplicar» · «No se pudo eliminar» · «No se pudo mover» · «No se pudo mover la categoría» (todos destructive) | Fallos | En `catch` | useCategories.ts:83 · 99 · 110 · 123 · 136 · 152 |

**No hay selección múltiple ni acciones masivas** en el árbol (no hay checkbox de fila ni
`BulkActionBar`), igual que en proveedores.

### B.5 Árbol — paginación y navegación rápida

| # | Tipo | Etiqueta exacta | Qué hace | Archivo:línea |
|---|---|---|---|---|
| 211 | paginación | `DataTablePagination` con opciones 10 / 25 / 50 / 100 (por defecto 25) | Pagina el **árbol aplanado**: un padre puede quedar en una página y sus hijas en la siguiente | page.tsx:151-159 |
| 212 | botón | «← Inventario» (outline `size="sm"`) | `Link` a `/app/inventario` — duplica el #174 | page.tsx:163 |
| 213 | botón | «Productos» (outline `size="sm"`) | `Link` a `/app/inventario/productos` | page.tsx:164 |

### B.6 Árbol — diálogo de eliminación `categorias/DeleteCategoryDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Archivo:línea |
|---|---|---|---|---|
| 214 | diálogo | «¿Eliminar categoría?» | `AlertDialog` | DeleteCategoryDialog.tsx:242 |
| 215 | texto | «Esta acción no se puede deshacer. Las subcategorías se moverán a la raíz automáticamente.» | **No nombra la categoría ni avisa de cuántos productos quedarán sin categoría** | DeleteCategoryDialog.tsx:243-245 |
| 216 | botón | «Cancelar» | Cierra | DeleteCategoryDialog.tsx:248 |
| 217 | botón | «Eliminar» (rojo) | Primero `update parent_id = null` a las hijas, luego `delete` | DeleteCategoryDialog.tsx:249 · categoryService.ts:299-312 |

`products.category_id` es `ON DELETE SET NULL`, así que los productos quedan sin categoría en
silencio (§F).

### B.7 Árbol — diálogo de importación `categorias/ImportCategoriesDialog.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 218 | diálogo | «Importar Categorías» (icono `Upload`), `max-w-3xl max-h-[85vh]` | — | Tras «Importar» | ImportCategoriesDialog.tsx:235-240 |
| 219 | texto | «Cargue categorías desde un archivo CSV o Excel. Use la plantilla para asegurar el formato correcto.» | Descripción | Siempre | ImportCategoriesDialog.tsx:241-243 |
| 220 | campo | `BranchSelectorField` con `required` (etiqueta «Sucursal», placeholder «Seleccionar sucursal») | **Control muerto**: `branchId` se guarda en estado y **nunca se envía**; `importCategories` no recibe sucursal y nada escribe `categories.branch_id` | Siempre | ImportCategoriesDialog.tsx:248-252 · 194-221 |
| 221 | botón | «Descargar plantilla» (`Download`, outline `size="sm"`) | `plantilla_categorias.csv` con 8 columnas y 3 filas de ejemplo | Siempre | ImportCategoriesDialog.tsx:255-258 · 27-30 |
| 222 | botón | «Limpiar» (ghost `size="sm"`) | Vacía filas, nombre y resultado | Si hay filas | ImportCategoriesDialog.tsx:259-263 |
| 223 | campo | Zona `border-2 border-dashed p-6` (icono `FileSpreadsheet`) con enlace «Seleccionar archivo (.csv o .xlsx)» o el nombre del archivo | `<input type="file" accept=".csv,.xlsx,.xls">` oculto. **Sin `onDrop`** | Siempre | ImportCategoriesDialog.tsx:266-279 |
| 224 | texto | «{n} válidas» (verde, `CheckCircle`) · «{n} inválidas» (rojo, `XCircle`) · «{n} total» | Conteos; «válida» = tiene nombre no vacío | Si hay filas | ImportCategoriesDialog.tsx:283-295 · 230-231 |
| 225 | tabla (col) | «Estado» · «Nombre» · «Categoría Padre» · «Color» (con muestra circular) · «Estación» | Vista previa `max-h-64`; tabla HTML propia, **no el `Table` del kit** | Si hay filas | ImportCategoriesDialog.tsx:297-336 |
| 226 | botón | «Cancelar» (outline) | Cierra (y limpia al cerrar) | Siempre | ImportCategoriesDialog.tsx:359-361 |
| 227 | botón | «Importar ({n})» (azul, `Upload`/`Loader2`, «Importando...») | `categoryService.importCategories`: un `INSERT` por fila, ordenando primero las sin padre; el padre se resuelve **por nombre en minúsculas** | `disabled` si no hay filas válidas | ImportCategoriesDialog.tsx:362-378 · categoryService.ts:529-610 |
| 228 | estado | «{n} categorías importadas correctamente» + lista «Fila {n}: {error}» (`max-h-32`) | Resultado | Tras importar | ImportCategoriesDialog.tsx:340-355 |
| 229 | toast | «Formato no soportado» / «Use .csv o .xlsx» · «Error al leer el archivo» · «Error» / «No hay organización activa» · «Importación completada» / «{n} categorías importadas» · «No se importaron categorías» / «Revise los errores» · «Error de importación» / mensaje | — | Según el caso | ImportCategoriesDialog.tsx:185 · 190 · 197 · 206 · 213 · 217 |

Cabeceras admitidas con alias (ImportCategoriesDialog.tsx:32-45): Nombre · Categoría Padre ·
Slug · Color · Icono · Descripción · Activa · Orden · Estación · Requiere Preparación ·
Meta Título · Meta Descripción.

### B.8 Detalle `/app/inventario/categorias/[id]` — `app/app/inventario/categorias/[id]/page.tsx`

Cabecera + rejilla `lg:grid-cols-3`: columna principal con 5 tarjetas, lateral con 2.

#### B.8.1 Cabecera `categorias/CategoryDetailHeader.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Archivo:línea |
|---|---|---|---|---|
| 230 | botón | Icono `ArrowLeft`, `aria-label="Volver a categorías"` | `Link` al árbol | CategoryDetailHeader.tsx:36-42 |
| 231 | texto | Cuadro `w-9 h-9 sm:w-10 sm:h-10` con el icono de la categoría sobre `{color}20` (fallback `FolderTree`) | — | CategoryDetailHeader.tsx:43-51 |
| 232 | texto | `{category.name}` (h1) | — | CategoryDetailHeader.tsx:54-56 |
| 233 | badge | «Activa» (verde) / «Inactiva» (gris) | `is_active` | CategoryDetailHeader.tsx:57-64 |
| 234 | texto | «/{slug}» | Subtítulo | CategoryDetailHeader.tsx:66 |
| 235 | botón | «Desactivar» / «Activar» (`ToggleLeft`, outline) | `toggleActiveByUuid` + recarga | CategoryDetailHeader.tsx:72-80 · page.tsx:88-97 |
| 236 | botón | «Duplicar» (`Copy`, outline) | `duplicateByUuid` y **navega a la copia** | CategoryDetailHeader.tsx:81-89 · page.tsx:99-108 |
| 237 | botón | «Editar» (`Edit`, azul) | `…/{uuid}/editar` | CategoryDetailHeader.tsx:90-97 |
| 238 | botón | «Eliminar» (`Trash2`, outline rojo) | Abre el `AlertDialog` propio de la página | CategoryDetailHeader.tsx:98-106 |

En móvil los cuatro botones se colocan en `grid-cols-2` y «Eliminar» ocupa las dos columnas
(CategoryDetailHeader.tsx:71 · 102).

#### B.8.2 Tarjeta «Información General» `categorias/CategoryInfoCard.tsx`

| # | Tipo | Etiqueta exacta | Valor | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 239 | texto | «Descripción» + `HtmlContentRenderer` | HTML | Si `description` | CategoryInfoCard.tsx:144-151 |
| 240 | texto | «Categoría Padre» | Enlace azul al padre, o «Raíz (sin padre)» | Siempre | CategoryInfoCard.tsx:154-166 |
| 241 | texto | «Orden» | `display_order` | Siempre | CategoryInfoCard.tsx:167-170 |
| 242 | texto | «Rank» | `rank` — **dos campos de orden distintos visibles y sin explicación** | Siempre | CategoryInfoCard.tsx:171-174 |
| 243 | texto | «Estación» | `STATION_LABELS[station]` o «Sin estación asignada» | Siempre | CategoryInfoCard.tsx:175-180 |
| 244 | chip | «Requiere preparación» (naranja, `ChefHat`) / «Sin preparación» (gris, `Utensils`) | `requires_preparation` | Siempre | CategoryInfoCard.tsx:181-194 |
| 245 | texto | «Creada» / «Actualizada» (icono `Calendar`) | `formatDateTimeInTz(valor, timezone)` — correcto | Siempre | CategoryInfoCard.tsx:197-216 · 135-136 |

#### B.8.3 Resto de tarjetas del detalle

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 246 | texto | Tarjeta «SEO» (icono `Globe`) con «Meta Title» y «Meta Description» | Solo lectura | **La tarjeta entera desaparece si faltan los dos** | CategorySeoCard.tsx:232-258 |
| 247 | texto | Tarjeta «Subcategorías» (icono `FolderTree`) + badge con el conteo | Lista de enlaces: punto de color + nombre + badge «Activa»/«Inactiva» | **Desaparece si no hay hijas** (no hay estado vacío) | CategoryChildrenCard.tsx:273-313 |
| 248 | botón | Cabecera plegable «Productos vinculados» + badge `{n}` o «...» (iconos `ChevronUp`/`ChevronDown`) | Despliega la lista | Siempre; **arranca plegada** | CategoryProductsCard.tsx:61-76 |
| 249 | estado | `Skeleton h-5 w-8` centrado | Carga | Mientras `loading` y esté desplegada | CategoryProductsCard.tsx:81-83 |
| 250 | estado | «No hay productos en esta categoría» (icono `Package` al 30 %) | Vacío | Si no hay productos | CategoryProductsCard.tsx:84-88 |
| 251 | botón (fila) | Nombre + SKU en mono + badge de estado + icono `ExternalLink` | `Link` a `/app/inventario/productos/{uuid}` | Por producto; lista `max-h-[400px]` | CategoryProductsCard.tsx:91-119 |
| 252 | badge | «Activo» (verde) o el valor crudo de `products.status` / «N/A» | — | Por fila | CategoryProductsCard.tsx:106-115 |
| 253 | texto | Tarjeta «Visual»: cuadro `w-14 h-14` con el icono sobre `{color}20`, nombre del icono o «Sin icono», muestra de color + hex en mono | Solo lectura | Siempre (lateral) | CategoryVisualCard.tsx:336-366 |
| 254 | texto | «Imagen»: `<img>` `w-full h-40 object-cover` o recuadro punteado «Sin imagen» | Solo lectura | Siempre (lateral) | CategoryVisualCard.tsx:369-383 |
| 255 | stat | Tarjeta «Estadísticas»: «Productos» (`Package`) · «Subcategorías» (`FolderTree`) · «ID» (`Hash`, en mono) | Conteos ya calculados en la página | Siempre (lateral) | CategoryStatsCard.tsx:405-432 |
| 256 | estado | Skeletons `h-8 w-64` + `h-40` + `h-60` | Carga | Mientras `isLoading` | page.tsx:110-122 |
| 257 | estado | «Categoría no encontrada» (icono `FolderTree`) + botón «Volver a categorías» | Si `category` es `null` | page.tsx:124-136 |
| 258 | diálogo | «¿Eliminar categoría?» + «Esta acción no se puede deshacer. Las subcategorías se moverán a la raíz automáticamente.» + «Cancelar» / «Eliminar» | **Segunda copia literal** del `AlertDialog` de B.6, escrita a mano en la página en vez de reutilizar `DeleteCategoryDialog` | page.tsx:179-196 |
| 259 | toast | «Error» / «No se pudo cargar la categoría» · «Categoría eliminada» · «Error» / «No se pudo eliminar» · «Categoría desactivada»/«activada» · «Error» (sin descripción) · «Categoría duplicada» · «Error» / «No se pudo duplicar» | — | Según el caso | page.tsx:70 · 79 · 82 · 92 · 95 · 103 · 106 |

La `CategoryVisualCard` y el `IconSelector`/`ColorPicker` del formulario **no comparten** la
previsualización: son tres dibujos distintos del mismo par icono+color.

#### B.8.4 Tarjeta «Reglas de Auto-asignación» `categorias/CategoryRulesCard.tsx`

Constructor de reglas que asigna productos a la categoría automáticamente.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 260 | texto | «Reglas de Auto-asignación» (icono `Wand2`) + badge «{n} regla»/«{n} reglas» | Título | El badge solo si hay reglas guardadas y no hay cambios sin guardar | CategoryRulesCard.tsx:315-325 |
| 261 | texto | «Define reglas para asignar productos automáticamente a esta categoría. Los productos que cumplan las condiciones serán asignados. Puedes re-asignar manualmente después.» | Ayuda | Siempre | CategoryRulesCard.tsx:328-330 |
| 262 | estado | Recuadro punteado «No hay reglas definidas» + botón «Agregar primera regla» (`Plus`) | Vacío | Si `rules.length === 0` | CategoryRulesCard.tsx:333-340 |
| 263 | campo | `Select` AND/OR (`w-20 h-7 text-xs`) con una línea divisoria | Combinador entre reglas | En todas menos la primera | CategoryRulesCard.tsx:351-367 |
| 264 | campo | «Campo» → `Select h-8 text-xs` | «Nombre» · «SKU» · «Marca» · «Referencia» · «Código de barras» · «Proveedor» · «Etiqueta» · «Estado» · «Tipo de producto» · «Precio mínimo» · «Precio máximo» | Por regla | CategoryRulesCard.tsx:372-387 · categoryRulesService.ts:46-58 |
| 265 | campo | «Operador» → `Select h-8 text-xs` | «Contiene» · «No contiene» · «Es igual a» · «No es igual a» · «Empieza con» · «Termina con» · «Mayor que» · «Menor que» · «Mayor o igual que» · «Menor o igual que» · «Está en la lista» · «No está en la lista»; se filtran según el tipo del campo y se corrige solo al cambiar de campo | Por regla | CategoryRulesCard.tsx:390-405 · categoryRulesService.ts:87-107 · 173-191 |
| 266 | campo | «Valor» → `Select` (`placeholder="Seleccionar..."`) para Proveedor/Etiqueta/Estado/Tipo, o `Input` con `placeholder="0"` (numérico) / «Escribir o seleccionar...» + `<datalist>` de hasta 50 sugerencias reales de `products.brand`/`reference`/`station` | Valor de la condición | Por regla | CategoryRulesCard.tsx:408-443 · 146-154 |
| 267 | botón | Icono `Trash2` (`h-8 w-8`, gris → rojo) | Quita la regla | Por regla | CategoryRulesCard.tsx:446-453 |
| 268 | botón | «Agregar regla» (`Plus`, outline punteado, ancho completo) | Añade `{field:'name', operator:'contains', value:''}` | Si ya hay reglas | CategoryRulesCard.tsx:460-462 · 160-171 |
| 269 | botón | «Vista previa» (`Eye`/`Loader2`, outline, `flex-1`) | Evalúa sin guardar | `disabled` si alguna regla no tiene valor (salvo operadores de lista) | CategoryRulesCard.tsx:510-519 · 230-259 |
| 270 | botón | «Guardar reglas» (`Save`/`Loader2`, outline, `flex-1`) | **Borra todas las reglas de la categoría y reinserta** | `disabled` si no hay cambios | CategoryRulesCard.tsx:520-529 · 199-228 |
| 271 | botón | «Aplicar y asignar» (`CheckCircle2`/`Loader2`, azul, `flex-1`) | Guarda y luego asigna los productos | `disabled` igual que #269 | CategoryRulesCard.tsx:530-538 · 261-283 |
| 272 | estado | Panel azul «Vista previa» (icono `Eye`) + badge «{n} producto»/«{n} productos» + lista `max-h-40` (nombre + SKU) + «y {n} más...» si pasa de 50 | Resultado de la evaluación | Tras «Vista previa» | CategoryRulesCard.tsx:467-505 |
| 273 | estado | «Ningún producto cumple estas reglas» (icono `AlertCircle`) | Vacío | Si la evaluación devuelve 0 | CategoryRulesCard.tsx:498-503 |
| 274 | estado | `Skeleton h-20 w-full` bajo el título | Carga | Mientras `loading` | CategoryRulesCard.tsx:296-309 |

**Ninguno de los tres botones da retroalimentación**: guardar, previsualizar y aplicar solo hacen
`console.error` en el `catch` y **no muestran ningún toast, ni de éxito ni de error**
(CategoryRulesCard.tsx:223-227 · 254-258 · 278-282). Tras «Aplicar y asignar» el usuario no sabe
cuántos productos se movieron aunque el servicio devuelve `result.assigned`.

### B.9 Formulario de categoría `nuevo` y `[id]/editar` — `categorias/CategoryForm.tsx`

**Un solo componente para alta y edición** (`isEditMode = !!categoryUuid`, CategoryForm.tsx:45),
centrado en `max-w-2xl` con cabecera `sticky top-0 z-10`. Es lo contrario de proveedores, que
tiene dos formularios divergentes.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 275 | botón | Icono `ArrowLeft` | `Link` al árbol | Siempre | CategoryForm.tsx:189-191 |
| 276 | texto | «Editar Categoría» / «Nueva Categoría» (h1) + «Modificar información de la categoría» / «Crear una nueva categoría de productos» | — | Siempre | CategoryForm.tsx:196-202 |
| 277 | campo | «Nombre *» (asterisco rojo), placeholder «Ej: Electrónicos, Ropa, Alimentos...», `autoFocus`, `required` | Escribe `name` **y regenera `slug`, `meta_title` y `meta_description` en cada tecla** | Siempre | CategoryForm.tsx:218-228 · 105-114 |
| 278 | campo | «Categoría Padre» → `Select`, placeholder «Sin categoría padre (raíz)» | Lista **plana** de todas las categorías de la organización (las hijas llevan el prefijo de texto `  └ `); excluye solo la propia | Siempre | CategoryForm.tsx:231-249 · 66-74 |
| 279 | campo | «Descripción» → `RichTextEditor`, placeholder «Descripción de la categoría (opcional)» | HTML; además copia el HTML a `meta_description` | Siempre | CategoryForm.tsx:282-287 · 116-122 |
| 280 | botón | «Generar con IA» / «Generando...» (`Sparkles`/`Loader2`, morado) | `POST /api/ai-assistant/improve-text` con `type: 'category_description'` | `disabled` sin nombre | CategoryForm.tsx:254-280 |
| 281 | campo | «Slug (URL)» (icono `Link2`), placeholder «se-genera-automaticamente», fuente mono | Editable a mano | Siempre | CategoryForm.tsx:291-299 |
| 281a | texto | «Se genera automáticamente del nombre, pero puedes editarlo manualmente» | Ayuda | Siempre | CategoryForm.tsx:300-302 |
| 282 | campo | «Estación de Cocina/Bar» → `Select`, placeholder «Sin estación asignada» | «Cocina Caliente» · «Cocina Fría» · «Bar» · «Caja» · «Todas las estaciones» | Siempre | CategoryForm.tsx:305-320 · printersService.ts:56-62 |
| 282a | texto | «Los productos de esta categoría se enrutarán a esta estación al enviarse a cocina. Un producto puede sobreescribir esta estación individualmente.» | Ayuda | Siempre | CategoryForm.tsx:321-323 |
| 283 | toggle | «Requiere preparación» (`Switch`) + «Sí»/«No» (naranja/gris) + ayuda «Los productos de esta categoría generarán tickets de cocina al enviarse desde el POS» | `requires_preparation` | Siempre | CategoryForm.tsx:326-342 |
| 284 | toggle | «Estado» (`Switch`) + «Activa»/«Inactiva» (verde/gris) | `is_active` | Siempre | CategoryForm.tsx:344-355 |
| 285 | campo | `ColorPicker` con etiqueta «Color» | Color de la categoría | Siempre; `sm:grid-cols-2` | CategoryForm.tsx:366-370 |
| 286 | campo | `IconSelector` con etiqueta «Icono» (recibe el color para previsualizar) | Icono Lucide | Siempre | CategoryForm.tsx:371-376 |
| 287 | texto | «Vista Previa» + «{icono} · {color}» sobre un cuadro `w-14 h-14` | Previsualización | Solo si hay icono | CategoryForm.tsx:380-398 |
| 288 | botón | «Generar con IA» / «Generando...» (`Wand2`, morado) junto a «Imagen de Categoría» | `POST /api/ai-assistant/generate-image` | `disabled` sin nombre | CategoryForm.tsx:403-430 |
| 289 | campo | `ImageUploader` (bucket `categories`, carpeta `images`, sin etiqueta) | Sube/quita la imagen | Siempre | CategoryForm.tsx:432-439 |
| 290 | campo | «Título SEO», placeholder «Título para motores de búsqueda» + ayuda «Se genera automáticamente del nombre, pero puedes personalizarlo» | `meta_title` | Siempre | CategoryForm.tsx:453-463 |
| 291 | campo | «Descripción SEO» → `Textarea rows={3} resize-none`, placeholder «Descripción para motores de búsqueda» + ayuda «Se genera automáticamente de la descripción, pero puedes personalizarlo» | `meta_description` | Siempre | CategoryForm.tsx:465-477 |
| 292 | botón | «Cancelar» (outline) | `router.back()` | Siempre | CategoryForm.tsx:483-490 |
| 293 | botón | «Crear Categoría» / «Guardar Cambios» (azul, `Save`) o «Guardando...» (`Loader2`) | Al crear, calcula `rank` y `display_order` como `max(display_order de hermanas) + 1`; redirige **siempre al árbol**, nunca al detalle | Siempre | CategoryForm.tsx:491-501 · 143-164 |
| 294 | estado | `PageHeaderSkeleton` + `DetailSkeleton` | Mientras carga en modo edición | — | CategoryForm.tsx:172-179 |
| 295 | toast | «Error» / «El nombre es requerido» · «Error» / «No se encontró la organización» · «Categoría actualizada» / «"{n}" guardada correctamente» · «Categoría creada» / «"{n}" creada exitosamente» · «Error» / mensaje · «Error» / «No se pudo cargar la categoría» · «Escribe un nombre primero» · «Descripción generada» · «Imagen generada con IA» | — | Según el caso | CategoryForm.tsx:132 · 136 · 158 · 161 · 166 · 99 · 259 · 270 · 420 |

**No hay control** para `rank`, `display_order` ni `metadata` aunque los tres viajan en
`CategoryFormData` (CategoryForm.tsx:94 · categoryService.ts:132-148): al editar se conservan los
valores que ya tenía, y al crear se calculan solos. El detalle sí los enseña (#241, #242).

---

## C. Selectores de proveedor repartidos por la app (`SupplierPicker`)

Mismo formato que §F de `AUDITORIA-CONTROLES-PRODUCTOS-POS.md` (selector de cliente). Hoy hay
**15 implementaciones con interfaz** + 7 resolutores sin interfaz (IA, importadores, servicios).
Notación: «cliente» = filtro en memoria; «servidor» = `ilike` por PostgREST con
`@/lib/supabase/config` (RLS) salvo que se indique.

### C.1 Inventario de selectores

| Componente (archivo:línea) | Dónde se usa | Control | Qué busca y cómo | Fila | Crear inline | Filtros | Múltiple | Extras / roto |
|---|---|---|---|---|---|---|---|---|
| **Facturas de compra `SupplierSelector`** `components/finanzas/facturas-compra/nueva-factura/SupplierSelector.tsx:26` | `nueva-factura/InformacionBasicaForm.tsx:209` → `NuevaFacturaForm.tsx:582`; `facturas-compra/editar/EditarFacturaCompra.tsx:169` | `Select` de shadcn con un `Input` **dentro** del `SelectContent` (barra `sticky top-0 p-2`). Trigger `h-8 sm:h-9`; input `pl-8 h-7 sm:h-8`; lista `max-h-[180px] sm:max-h-[200px]`; botón `+` `h-8 w-8 sm:h-9 sm:w-9` | Servidor: `or` ilike `name, nit, contact, email`, `eq organization_id`, `order name asc`, **límite 50**; debounce **300 ms** (:118-122); umbral 0. No filtra `is_active`. Término sin escapar | `name` + «NIT: {nit} • {contact}». Panel del seleccionado con `name, nit, contact, phone, email, notes` e icono `Building2` | **Sí**: botón `Plus` → `ProveedorFormDialog` (`NuevoProveedorForm` completo) | Ninguno | No | Placeholders «Seleccionar proveedor...», «Buscar proveedor...», «No se encontraron proveedores», «Cargando proveedores...». **Roto**: si la búsqueda devuelve 0 filas, el `useMemo` (:49-57) cae a `return proveedores` y muestra **la lista completa sin filtrar** |
| **Documentos soporte `ProviderSelector`** `components/finanzas/documentos-soporte/ProviderSelector.tsx:60` | `documentos-soporte/SupportDocumentForm.tsx:547` | Mismo patrón. Trigger `h-9`; input `pl-8 h-8`; lista `max-h-[200px]`; botón `+` `h-9 w-9`; panel del seleccionado morado (`bg-purple-50`) | Servidor: 18 columnas, `or` ilike `name, nit, contact, email`, **`eq is_active true`**, `order name`, límite 50; debounce 300 ms; carga inicial sin término | `name` + «NIT: {nit} • {contact}». Panel: `name`, `nit` + « - DV: {dv}», «Nombre comercial», `contact`, `phone`, `email`, `address`, «Municipio DIAN» | **Sí**: `Plus` (`title`/`aria-label` «Crear nuevo proveedor») → `ProveedorFormDialog` | **`is_active`** — el único de los 15 | No | Devuelve un **objeto DIAN** de 12 campos + `supplier_id`, no un id |
| **Órdenes de compra `SearchSelectCombobox`** `components/inventario/ordenes-compra/SearchSelectCombobox.tsx:24` | `ordenes-compra/nuevo/NuevaOrdenCompraForm.tsx:350` (etiqueta «Proveedor *») | Input + dropdown absoluto propio `max-h-64`; al elegir, el input se sustituye por un chip con botón limpiar `h-7 w-7` | **Cliente**: `purchaseOrderService.ts:979-989` trae `id, uuid, name` **sin límite**; filtra en memoria por `name`/`subtitle`; render recortado a `.slice(0, 30)` (:131); sin debounce | `name` + `subtitle` — pero el servicio **no trae `subtitle`**, así que solo se ve el nombre. Icono `Truck` | **Sí**: botón ghost «Nuevo» → `QuickCreateDialog max-w-7xl`, «Crea un proveedor y se seleccionará automáticamente para esta orden.» | Ninguno | No | Placeholders «Buscar proveedor...», «No se encontraron resultados» |
| **Editar orden de compra** `components/inventario/ordenes-compra/editar/EditarOrdenCompraForm.tsx:315` | Ruta `[id]/editar` | `Select` **plano**, sin buscador, altura por defecto | Sin búsqueda; misma carga sin límite | `name` | **No** (la pantalla hermana de alta sí lo tiene) | Ninguno | No | Placeholder «Seleccionar proveedor» (sin puntos suspensivos) |
| **Filtro de órdenes de compra** `components/inventario/ordenes-compra/OrdenesCompraFilters.tsx:67` | `app/app/inventario/ordenes-compra/page.tsx:212-221` | `Select w-[180px]` + `Input pl-8` de texto libre | Sin búsqueda de proveedores. El `Input` filtra **en cliente** sobre las órdenes ya cargadas (`page.tsx:101`) | `name` | No | «Todos los proveedores» (`all`); el `Select` solo aparece si hay proveedores | No | Placeholders «Proveedor», «Buscar por proveedor o notas...» |
| **Filtro de facturas de compra** `components/finanzas/facturas-compra/FacturasCompraFiltros.tsx:130` | `FacturasCompraPage.tsx:22, 36` | `Select` plano `h-8 sm:h-9` | Sin búsqueda; `FacturasCompraService.ts:949-966` usa **`select('*')` sin límite** | `name`; el chip de filtro activo pinta «Proveedor: {name}» o «Desconocido» | No | «Todos los proveedores» (`todos`) | No | — |
| **Filtro de cuentas por pagar** `components/finanzas/cuentas-por-pagar/CuentasPorPagarFiltros.tsx:232` | Panel de filtros avanzados de CxP | `Select` plano `h-8 sm:h-9` dentro de un bloque colapsable | Sin búsqueda; `CuentasPorPagarService.ts:755-800`: `select('*, accounts_payable!inner(balance)')`, `gt balance 0`, sucursal opcional, **sin orden ni límite**, dedupe manual | `label` (= `name`) + «NIT: {nit}» | No | **Solo proveedores con saldo pendiente**; filtro por sucursal vía join | No | Único que filtra por estado de cartera. Placeholders «Todos» / «Todos los proveedores» |
| **Producto › pestaña Proveedores** `components/inventario/productos/id/tabs/ProveedoresTab.tsx:439` (diálogo :421) | `productos/id/DetalleProducto.tsx:342` | `Dialog sm:max-w-lg` con un `Select` plano dentro; tabla inline con los ya vinculados | Sin búsqueda: `select('id, name, nit')`, `order name`, **sin límite**. Los vinculados salen de `product_suppliers` con embed, filtrados **solo por `product_id`** (sin `organization_id`) | `{name} ({nit})` en una línea. Tabla: `supplier_name`, «NIT: …», `cost`, `lead_time_days` + « días», `min_order_qty`, `supplier_sku` o «—», estrella `is_preferred` | **No** crea proveedor; crea la **relación** (`cost`, `lead_time_days`, `min_order_qty`, `supplier_sku`, `notes`, `is_preferred`) | Excluye los ya vinculados (:297-299) | No | «Agregar Proveedor» se deshabilita si no quedan disponibles |
| **Producto nuevo/editar `SearchSelect`** `components/ui/search-select.tsx:30` usado en `productos/nuevo/InformacionBasica.tsx:512` | `NuevoProductoForm.tsx:658`, `editar/FormularioEdicionProducto.tsx:1105` | `Popover` + `Button role="combobox"` `h-10`; `PopoverContent` **`w-[320px]`**; `ScrollArea` **`h-[240px]`** | **Cliente**: `select('id, name')`, `order name`, **sin límite**; sin debounce ni umbral | Solo `name` (no se mapea `sublabel`, así que no hay NIT ni contacto) | **Sí**: «Nuevo» → `QuickCreateDialog max-w-7xl`, «Crea un proveedor y se seleccionará automáticamente para este producto.» | Ninguno | No | Etiqueta «Proveedor Principal». «Seleccionar proveedor», «Buscar proveedor...», «No se encontraron proveedores», «Sin proveedor». Skeleton `h-10 w-full` al cargar |
| **Producto detalle `SearchSelect`** `productos/id/tabs/DetallesTab.tsx:408` | `DetalleProducto.tsx:307` | Mismo `SearchSelect` | **Cliente**: `select('*')` — todas las columnas — `order name`, **sin límite** | Solo `name` | **No** (divergencia con la pantalla de alta) | Ninguno | No | Al guardar sincroniza `product_suppliers.is_preferred` (:222-237) |
| **Lotes** `components/inventario/lotes/LotesPage.tsx:560` | Diálogo crear/editar lote | `Select` plano | Sin búsqueda; `LotesService.ts:147-165`: `select('id, name')`, **sin límite** | `name` | No | Ninguno | No | «Seleccionar proveedor» / «Sin proveedor»; la tabla pinta `lote.supplier?.name \|\| '-'` |
| **Reglas de categoría** `components/inventario/categorias/CategoryRulesCard.tsx:411` | Detalle de categoría (B.8.4) | `Select` **`h-8 text-xs`** — el más pequeño de la app | Sin búsqueda; `select('id, name')`, `order name`, **sin límite** | `name` | No | Solo si `rule.field === 'supplier'` | No | Placeholder «Seleccionar...» |
| **Proveedor padre (alta de proveedor)** `proveedores/nuevo/NuevoProveedorForm.tsx:329` | `/nuevo` y todos los «crear inline» que lo embeben | `Select` plano | Sin búsqueda; `eq supplier_type 'company'`, `order name`, **sin límite** | `name` | n/a | `supplier_type='company'` | No | «Empresa proveedora asociada (opcional)» / «Sin empresa asociada». **No existe en el formulario de edición** (§A.7) |
| **Listado de proveedores** `proveedores/FiltrosProveedores.tsx:45` + `CatalogoProveedores.tsx:65-75` | `/app/inventario/proveedores` | `Input` con icono | Servidor: `select('*')`, `or` ilike `name, email, nit`, `order`, **sin límite ni paginación en la consulta**; **sin debounce** | Tabla completa (§A.3) | Navega a `/nuevo` | `estado`, `ordenarPor` (sin control) | No | Placeholder promete «contacto» y el `or()` **no lo busca**. `console.log` de depuración en :59, :78-79 |
| **Búsqueda global del header** `components/app-layout/Header/GlobalSearch/searchService.ts:57` | `Header/GlobalSearch.tsx:145-151` | Overlay: `Input h-12` + resultados agrupados | Servidor con `abortSignal` y timeout 3 s: `select('id, name, nit, email')`, `or` ilike `name, nit, email` (**con espacios tras las comas**), `eq organization_id`, **límite 5**; debounce 400 ms si 1 carácter / 200 ms si más; umbral ≥1 | `name` + `nit \|\| email` | No | Ninguno | No | **Roto**: `url: '/app/proveedores/${proveedor.id}'` (`GlobalSearch.tsx:150`) — esa ruta no existe y además la página espera `uuid`, no `id`: 404 garantizado |

Resolutores **sin interfaz** (mismo dominio, otras siete reglas de búsqueda):
`supplierService.getSuppliers` (`supplierService.ts:170-203`, la única con paginación real
`count:'exact'` + `range`, `pageSize` 50), `api/ai-assistant/dynamic-options/route.ts:51-56`
(límite 300, **sin consumidores**), `lib/ai/agent/tools/consulta.ts:263-283` (`buscar_proveedores`,
límite 10, **la única que escapa `%`, `_`, `\`**), `lib/ai/agent/tools/documentos.ts:1206-1266`
(resuelve por NIT generando variantes con y sin DV y con puntos; único que mira `tax_id`),
`lib/ai/agent/tools/facturas.ts:220-225` (NIT normalizado con `ilike`, incompatible con el
anterior), `lib/services/aiActionsService.ts:692-749` (`createSupplier`/`updateSupplier`) y el
importador de productos (`app/app/inventario/productos/importar/page.tsx:973-982` y `:1157-1186`,
**único con soporte multi-proveedor** separando por `;`).

Diálogos de creación existentes: `shared/form-dialogs/ProveedorFormDialog.tsx` (modal propio, no
`Dialog` de shadcn: overlay `fixed inset-0 bg-black bg-opacity-50 z-50`, panel
`max-w-7xl max-h-[97vh] sm:max-h-[90vh]`, título «Nuevo Proveedor», subtítulo «Registra un nuevo
proveedor en el sistema.»), `QuickCreateDialog` con `NuevoProveedorForm embedded` y
`maxWidth="max-w-7xl"` (dos textos distintos según la pantalla), y **alta automática sin
confirmación** desde el importador de productos y desde el asistente de IA.

### C.2 Unión de capacidades del `SupplierPicker`

| Capacidad | Quién la tiene hoy |
|---|---|
| Búsqueda en servidor `ilike` sobre `name, nit, contact, email` | `SupplierSelector`, `ProviderSelector`, `supplierService.getSuppliers`. El listado y la búsqueda global se quedan en 3 campos (`name, nit, email`) |
| Búsqueda por `tax_id` y por NIT con variantes de DV | Solo `lib/ai/agent/tools/documentos.ts:1206-1226` |
| Escapado del término (`%`, `_`, `\`) | Solo `lib/ai/agent/tools/consulta.ts:272-274`. Los demás interpolan `%${term}%`: una coma rompe el `or()` de PostgREST (400) |
| Debounce ~300 ms | `SupplierSelector`, `ProviderSelector`. Variable (400/200 ms) en la búsqueda global. **Ninguno** en el listado ni en los filtros en cliente |
| Cancelación anti-carrera (`abortSignal`) | Solo la búsqueda global (`searchService.ts`) |
| Carga inicial sin término | `ProviderSelector` (50), `SupplierSelector` (lista del padre) |
| Paginación real (`count` + `range`) | Solo `supplierService.getSuppliers` — y **ninguna pantalla la usa** |
| Filtro `is_active` | **Solo `ProviderSelector`.** Las otras 14 muestran proveedores inactivos |
| Filtro por `supplier_type` (persona/empresa) | Solo el selector de proveedor padre |
| Filtro por saldo de cartera / sucursal | Solo `CuentasPorPagarFiltros` |
| Excluir los ya vinculados | Solo `ProveedoresTab` |
| Fila con NIT y contacto | `SupplierSelector`, `ProviderSelector`, `CuentasPorPagarFiltros` (solo NIT), `ProveedoresTab` (solo NIT). Los `SearchSelect` de producto pintan solo el nombre |
| Logo, color e icono del proveedor (`logo_url`, `color`, `icon`) | **Nadie.** Las tres columnas existen y solo el detalle pinta el logo |
| `rating` (0–5, con `CHECK` en la BD e índice) | **Nadie**: ni se escribe en el alta ni se lee en ningún selector |
| Datos fiscales DIAN en la fila del seleccionado | Solo `ProviderSelector` |
| Saldo por pagar del proveedor en la fila | **Nadie.** Solo el detalle lo calcula en el navegador (§A.5.13) |
| Crear con el formulario completo | `SupplierSelector`, `ProviderSelector`, `InformacionBasica`, `NuevaOrdenCompraForm` — los cuatro embeben `NuevoProveedorForm` |
| Crear rápido (mínimo) | **Nadie**: o el formulario de 40 campos, o una fila invisible creada por el importador con solo `name` |
| Editar / ver el proveedor seleccionado | **Nadie** |
| Selección múltiple | Solo el importador de productos (texto separado por `;`), sin interfaz |
| Teclado (`role="combobox"`, `aria-*`) | Solo `ui/search-select.tsx` (`role="combobox"`). `SearchSelectCombobox` y los `Select` planos no |
| Estados diferenciados (cargando / sin resultados / escribe para buscar) | «Cargando proveedores...» y «No se encontraron proveedores» solo en `SupplierSelector` y `ProviderSelector` |
| Offline (Desktop) | **Nadie** (a diferencia del `CustomerPicker`, que sí tiene réplica local) |

### C.3 Divergencias a reconciliar

1. **Campos de búsqueda distintos en 8 conjuntos**: `name,nit,contact,email` (3 implementaciones,
   con el orden cambiado entre ellas), `name,email,nit` (listado), `name,nit,email` (búsqueda
   global), `name,nit` (IA consulta), `nit`+`tax_id` con variantes (IA documentos), solo `nit`
   (IA facturas), solo `name` (fallback de IA documentos), y **filtrado en cliente sobre `name`**
   en 4 pantallas.
2. **Placeholders**: «Seleccionar proveedor...» (2), «Seleccionar proveedor» sin puntos (5),
   «Buscar proveedor...» (5), «Buscar por nombre, NIT, contacto...» (listado, y no busca contacto),
   «Buscar por proveedor o notas...» (órdenes), «Proveedor» (filtro), «Todos los proveedores» (3),
   «Todos» (CxP), «Sin proveedor» (3), «Sin empresa asociada», «Seleccionar...» (reglas),
   «Buscar organizaciones, clientes, productos...» (búsqueda global, que **sí** busca proveedores
   y no los nombra).
3. **Contenedores y alturas**: cinco alturas de trigger (`h-8 sm:h-9`, `h-8`, `h-9`, `h-10`, por
   defecto) y cuatro de lista (`max-h-[180px] sm:max-h-[200px]`, `max-h-[200px]`,
   `ScrollArea h-[240px]`, `max-h-64`). Anchos: `w-[320px]` fijo, `w-[180px]`, `w-full`.
   Cuatro patrones de contenedor: `Select` con input dentro, `Popover` + combobox, dropdown
   absoluto propio, `Select` plano.
4. **Contratos de salida**: `onValueChange(number | null)` (`SupplierSelector`),
   `onChange(ProviderData)` con 12 campos (`ProviderSelector`), `onSelect(option | null)` objeto
   (`SearchSelectCombobox`), `onValueChange(string)` (`ui/search-select`, editar orden),
   `string → parseInt` (`ProveedoresTab`), `string → number | null` (lotes),
   `(value: string)` con `'all'` (órdenes) o `'todos'` (facturas, CxP).
5. **Cuatro sentinelas para «ninguno/todos»**: `''`, `'none'`, `'all'`, `'todos'`.
6. **Límites**: 1, 5, 10, 30 (recorte en cliente), 50, 300 y **sin límite en 12 consultas**
   (`purchaseOrderService`, `FacturasCompraService` con `select('*')`, `CuentasPorPagarService`
   con `select('*')` + join, `DetallesTab` con `select('*')`, `ProveedoresTab`,
   `InformacionBasica` ×2, `LotesService`, `CategoryRulesCard`, `NuevoProveedorForm`,
   `CatalogoProveedores` con `select('*')`, `ReportesService` — este último además con un N+1 de
   `purchase_orders` por proveedor, e importador de productos).
7. **Orden**: `order('name', {ascending:true})` explícito en 3, `order('name')` implícito en 9,
   configurable en el listado y **sin orden** en `CuentasPorPagarService.obtenerProveedoresConSaldo`,
   `searchService` y `ReportesService`.
8. **Ámbito de organización**: seis consultas dependen **solo de RLS** — `ProveedoresTab.tsx:100-108`,
   `NotificationDetailSheet.tsx:163-167` y `:264-268`, `CajasService.ts:1434`,
   `treasuryService.ts:562-566`, `paymentInitiationService.ts:200-204` y `:446`,
   `ReportesService.ts:223-228`.
9. **Rutas rotas**: `GlobalSearch.tsx:150` → `/app/proveedores/{id}` (no existe, y usa `id` donde
   la página espera `uuid`); `FacturasCompraPage.tsx:86` → `/app/finanzas/proveedores` (no existe).
10. **Creación inline asimétrica**: la existe en las cuatro pantallas de alta y **falta en las
    cinco equivalentes de edición o consulta** (`EditarOrdenCompraForm`, `DetallesTab`, lotes,
    `ProveedoresTab`, reglas) y en los tres filtros.

### C.4 Contrato propuesto para el diseño del `SupplierPicker`

`SupplierPicker` con `Layout=popover|dialog|inline|sheet`, `Size=sm|md`,
`State=idle|typing|loading|results|empty|error`, `mode=single|multi`, `allowEmpty`,
`showCreate` (rápido y completo), `filter: {isActive?, supplierType?, withPayableBalance?,
branchId?, excludeIds?}`, `context: 'purchase-order'|'purchase-invoice'|'support-document'|
'product'|'lot'|'category-rule'|'filter'|'global-search'`.

- **Fila** = `SupplierRow`: logo o inicial con `color`, `name`, badge empresa/persona
  (`supplier_type`), `nit` con DV, `contact`, `phone`, `email`, badge «Inactivo», chip opcional
  de saldo por pagar y chip opcional de `rating`.
- **Seleccionado** = `SupplierCard` con acciones «Cambiar», «Ver», «Editar», «Quitar» —hoy
  ninguna existe— y, en contexto de documento soporte, el bloque DIAN (`dv`, `trade_name`,
  `municipality_code`, `identification_document_code`).
- **Crear rápido** = un solo `QuickSupplierForm` (nombre*, tipo persona/empresa, tipo y número de
  documento, contacto, teléfono, email) que reemplace las cuatro incrustaciones del formulario
  completo de 40 campos y las dos altas automáticas silenciosas; «Más datos» abre
  `NuevoProveedorForm` en un `Sheet`.
- **Un solo servicio** `supplierSearchService.search({term, limit, filters})` con escapado de
  comodines, los 5 campos (`name, nit, contact, email, tax_id`), variantes de NIT con DV,
  `abortSignal` y paginación `count`+`range` — reutilizando lo que ya hacen bien
  `supplierService.getSuppliers`, `consulta.ts` y `documentos.ts`, hoy en tres sitios distintos.

---

## D. Selectores de categoría y `QuickCategoryForm`

22 implementaciones, ninguna de las cuales muestra el árbol real.

### D.1 Inventario de selectores

| Componente (archivo:línea) | Dónde se usa | Control | Qué consulta | Qué pinta | Crear inline | Múltiple | Extras / roto |
|---|---|---|---|---|---|---|---|
| **Producto — categoría principal** `productos/nuevo/InformacionBasica.tsx:383-393` | `NuevoProductoForm.tsx:658`, `editar/FormularioEdicionProducto.tsx:1105`, `productos/[id]/duplicar/page.tsx:129` | `SearchSelect` (`ui/search-select.tsx:30`): Popover + input + `ScrollArea h-[240px]`, `w-[320px]`; skeleton `h-10 w-full` | `select('id, name, station')`, `eq organization_id`, `order name`. **Sin límite, sin `is_active`, plano** | Solo `name` | **Sí**: botón «Nueva» (`h-7 px-2 text-xs`) → `QuickCreateDialog` con `QuickCategoryForm`, «Crea una categoría y se seleccionará automáticamente para este producto.» | No | Usa `cat.station` para el texto de ayuda de estación (:571-577); recarga y autoselecciona tras crear |
| **Producto — categorías adicionales (chips)** `InformacionBasica.tsx:395-449` | Ídem | Chips `px-2.5 py-1 rounded-full text-xs` en `flex flex-wrap gap-2 min-h-[42px]` | Reutiliza el array anterior; excluye la principal | `name`; corta a 20 con «Ver más (N categorías)» / «Ver menos» | No | **Sí** → `category_ids: number[]` | Se persiste en `product_category_relations` |
| **Producto detalle — principal** `productos/id/tabs/DetallesTab.tsx:328-339` | Pestaña «Detalles» | `SearchSelect` | **`select('*')`**, `order name`, sin límite, plano | `name` | **No** (divergencia con el alta) | No | Sincroniza N:M manual vs `assigned_by_rule` (:182-212) |
| **Producto detalle — chips adicionales** `DetallesTab.tsx:341-389` | Ídem | Chips idénticos | Reutiliza el array | `name`; corte a 20 pero **calcula `length - 20 - 1`** mientras el alta calcula `length - 20` | No | **Sí** | «No hay categorías disponibles» si solo hay una |
| **Filtro del catálogo** `productos/FiltrosProductos.tsx:147-157` | Listado de productos | `SearchSelect h-9` | `select('*')`, sin límite, plano | `name` | No | No | `noneValue="todos"`, `noneLabel="Todas"` |
| **Acciones masivas → «Asignar categoría»** `productos/bulk/AccionesMasivas.tsx:496-508` | Barra de selección del catálogo | `Select` sin buscador | `select('id, name')`, sin límite | `name` | No | No | **No hay opción «ninguna»**: no se puede desasignar en masa |
| **Filtro de stock** `inventario/stock/StockFilters.tsx:80-92` | `app/app/inventario/stock/page.tsx:236` | `Select` | `stockService.ts:479-483`: `select('id, name')`, sin límite | `name` | No | No | «todas» = `"all"` (contrato distinto al del catálogo) |
| **Filtro de reportes** `inventario/reportes/ReportesPage.tsx:267-281` | Reportes de inventario | `Select` | `ReportesService.ts:265-270`, sin límite | `name` | No | No | «Todas las categorías» = `"all"` |
| **Barra de categorías del POS `CategoryFilterBar`** `components/pos/CategoryFilterBar.tsx:80-255` | `pos/ProductSearch.tsx:491-499`, `pos/mesas/id/AddProductDialog.tsx:434-440` (mesas y PMS) | **Tri-modo**: `searchselect` (`sm:w-[180px] h-9 sm:h-10`), `images` (tarjetas `w-20 h-20 rounded-xl border-2` con arrastre), `buttons` (chips `px-3 py-2 rounded-full`) | `posService.ts:610-617`: `select('*')`, `order rank`, sin límite, plano; ranking por RPC `pos_category_ranking`; offline `posOfflineReads.ts:315` | `name` + icono Lucide + `color` (con paleta determinística de respaldo) + `image_url` + badge «Top» + badge de conteo `productCounts` **que ningún consumidor le pasa** | No | No (`'all'` o id como string) | Estrella de favorito solo en `ProductSearch`; orden configurable `display_order \| name \| rank \| favorites` |
| **Consumos PMS** `pms/espacios/id/AddConsumptionDialog.tsx:276-301` | `app/app/pms/espacios/[id]/page.tsx:824` | Chips `Button size="sm"` en `flex gap-2 overflow-x-auto` | `select('id, name, slug, rank')`, `order rank`, `order name` — **SIN `eq organization_id` y sin límite** | `name`; badge de conteo solo en el chip «Todas» | No | No | **Riesgo multi-tenant**: solo RLS. Duplica a mano lo que hace `CategoryFilterBar`, que sí usa su diálogo hermano |
| **Promociones** `pos/promociones/nuevo/PromotionWizard.tsx:814-843` | `/pos/promociones/nuevo` y `[id]` | Lista de `Checkbox` en `max-h-60 overflow-y-auto` | `promotionsService.ts:417-422`: `eq is_active true`, **sin `order()` → orden indefinido**, sin límite | `name` | No | **Sí** → `include_category` / `exclude_category` | Único que filtra `is_active`. La hidratación al editar (`promotionsService.ts:132-137`) **no filtra organización** |
| **Menú del sitio web** `organization/branding/editor/MenuTreeEditor.tsx:963-1016` | `app/organizacion/branding/editor/[pageId]/page.tsx:1103` | Popover propio con `<input type="checkbox">` nativos, `max-h-60` | `websiteMenuService.ts:133-154` → `categoryService.getAll` → filtra `is_active` → **`buildCategoryTree` (árbol anidado)** | `icon` como texto crudo + `name` + badge «Vinculada» | No | **Sí** → `Set<number>` | **Roto**: recorre solo las raíces; las subcategorías (`children`) nunca aparecen |
| **«Vincular a categoría» por item de menú** `MenuTreeEditor.tsx:395-413` | Mismo editor | `Select h-8` | `flatCategories` (`:257-259`) — **el nombre miente: no aplana nada** | `name` | No | No | Mismo fallo de árbol. Opción vacía «Sin categoría» |
| **Page-builder `EntityField` (`entity: 'category'`)** `organization/branding/editor/fields/EntityField.tsx:113-281` | `FieldRenderer.tsx:87`; 9 bloques declarados en `websitePageBuilderService.ts` | Panel a medida: seleccionadas **reordenables por arrastre** (`GripVertical h-3 w-3`) + buscador `Input h-7` + lista `max-h-40` de `Checkbox` | `select('id, name, image_url, parent_id')`, `order name`, sin límite, sin `is_active`. **Pide `parent_id` y no lo usa** | Miniatura `image_url` o 🏷️, `name`, índice «#N» | No | **Sí** → `number[]` ordenado | «Categorías seleccionadas (N)», «Sin selección: se muestran todas las categorías», «Arrastra para reordenar. Solo se mostrarán las seleccionadas.», vacío «No hay categorías creadas» |
| **Opciones de `category_detail`** `lib/services/websitePageBuilderService.ts:3803-3814` | Selector de entidad-de-página del editor | Opciones `{id, label}` | `select('id, slug, name')`, `order name`, **`limit(50)`** | `name` | No | No | **Único con límite**; devuelve el `slug` como `id` |
| **Asistente IA `dynamic-options`** `app/api/ai-assistant/dynamic-options/route.ts:44-50` | **Nadie** | Contrato `{value,label}[]` | `select('id, name')`, `limit(300)` | `name` | No | — | Código muerto junto con `FIELD_OPTION_SOURCE`/`DynamicOptions` (`lib/ai/assistant/clientTypes.ts:76-99`) |
| **Búsqueda global** `Header/GlobalSearch/searchService.ts:59` | Buscador del header | Lista de resultados | `select('id, name, slug')`, `ilike name`, `eq organization_id`, con límite | `name` | No | No | Correcto; navega a `/app/inventario/categorias/{uuid}` (bien, a diferencia de proveedores) |
| **Importador de productos** `app/app/inventario/productos/importar/page.tsx:959-970` y `:1121-1152` | Asistente de importación | Sin interfaz: la categoría llega como texto | `select('id, name, slug')`, sin límite; `Map` por nombre y slug normalizados | — | **Sí, automático**: inserta solo `{organization_id, name, slug}` → sin `color`, `icon`, `rank` ni `display_order` | — | Ante colisión de slug reintenta con `` `${slug}-${Date.now()}` `` → slugs basura. Aviso «Categoría "X" creada automáticamente» |
| **Importador de categorías** `ImportCategoriesDialog` + `categoryService.importCategories` | §B.7 | Diálogo CSV/XLSX; el padre se resuelve **por nombre** | `INSERT` fila a fila, sin `upsert` | — | Sí | — | **Sin comprobación previa de slug duplicado**: la fila falla con el error crudo de Postgres. Color por defecto `#6366f1`, distinto del `#3B82F6` de `emptyFormData` |
| **Asistente IA `create_category`** `lib/services/aiActionsService.ts:600-644` | Acciones del asistente | Sin interfaz | `INSERT` con `{organization_id, name, slug, description, parent_id}` | — | Sí | — | **El único que resuelve bien la colisión de slug**: hasta 4 intentos `base`, `base-2`, `base-3`, `base-4` (:614-633), y valida que el padre sea del mismo tenant (`resolveOptionalRef`, :606) |
| **`FiltrosInventario`** `components/inventario/FiltrosInventario.tsx:80-93` | **Nadie** | `<select>` **nativo** | No consulta: recibe `categorias` por props con un default cableado (:26) | `nombre` (campo en español, incompatible con `name`) | No | No | Código muerto |
| **`inventoryDashboardService.getCategories`** `lib/services/inventoryDashboardService.ts:652-665` | **Nadie** | — | `select('id, name')` | — | — | — | Código muerto. El KPI `totalCategories` (:200-203) usa `select('id', {count:'exact'})` **sin `head: true`**: descarga todas las filas para contarlas |

### D.2 `QuickCategoryForm` — el único alta inline

Archivo `components/inventario/productos/nuevo/QuickCategoryForm.tsx` (254 líneas). Único
consumidor: `productos/nuevo/InformacionBasica.tsx:589`, dentro de `QuickCreateDialog` con título
«Nueva Categoría» y descripción «Crea una categoría y se seleccionará automáticamente para este
producto.». Contrato: `onSuccess(category)` / `onCancel()` (:27-32).

| # | Tipo | Etiqueta exacta | Placeholder exacto | Control | Validación | Archivo:línea |
|---|---|---|---|---|---|---|
| 296 | campo | «Nombre» + `*` rojo | «Ej: Electrónicos, Ropa, Alimentos...» | `Input`, `autoFocus`, `required` | Toast «Error» / «El nombre es requerido» | QuickCategoryForm.tsx:129-135 · 82-85 |
| 297 | campo | «Categoría Padre» | «Sin categoría padre (raíz)» (como `SelectValue` y como ítem `value="none"`) | `Select` | Ninguna: **no impide ciclos** | QuickCategoryForm.tsx:143-155 |
| 298 | campo | «Descripción» | «Descripción de la categoría (opcional)» | **`Input`, no `Textarea`** (el formulario grande usa `RichTextEditor`) | — | QuickCategoryForm.tsx:163-174 |
| 299 | campo | «Estación de Cocina/Bar» | «Sin estación asignada» | `Select` sobre `STATION_LABELS` | — | QuickCategoryForm.tsx:180-189 |
| 300 | toggle | «Requiere preparación» + ayuda «Los productos de esta categoría generarán tickets de cocina» | — | `Switch` + «Sí»/«No» | — | QuickCategoryForm.tsx:199-202 |
| 301 | toggle | «Estado» | — | `Switch` + «Activa»/«Inactiva» | — | QuickCategoryForm.tsx:216 |
| 302 | botón | «Cancelar» (outline) / «Crear Categoría» (azul) / «Guardando...» (`Loader2`) | — | — | — | QuickCategoryForm.tsx:245-249 |
| 303 | toast | «Error» / «No se encontró la organización» | — | — | — | QuickCategoryForm.tsx:86-89 |

**Slug**: `handleNameChange` (:64-73) llama a `generateSlug` de `categoryService`
(`categoryService.ts:80-87`: minúsculas → `NFD` → quita diacríticos → `[^a-z0-9]+` → `-` →
recorta guiones) y de paso rellena `meta_title = name` y
`meta_description = description || 'Categoría: {name}'`. **No comprueba unicidad.**
**Qué inserta**: calcula `rank` y `display_order` como `max(display_order de hermanas) + 1`
(:95-105) y delega en `categoryService.create` — los mismos 15 campos que el formulario grande.
La carga del desplegable de padres usa `categoryService.getAll` **sin límite** y **silencia los
errores con un `catch {}` vacío** (:59-61): si falla, el usuario ve una lista vacía sin aviso.

### D.3 Divergencias a reconciliar

1. **Cinco sentinelas para «sin/todas»**: `'none'`, `'todos'`, `'all'`, `''`, `undefined`.
2. **Siete contratos de salida**: `number | null`, `string` sin parsear, `number[]`,
   `slug: string`, `{value,label}`, `{id, nombre}` y `Set<number>`.
3. **Jerarquía**: **ninguno de los 22 muestra el árbol**. `QuickCategoryForm:155` solo insinúa
   nivel con el prefijo de texto `` `  └ ` ``, y el formulario grande hace lo mismo
   (`CategoryForm.tsx:244`); ambos distinguen «tiene padre / no tiene», no la profundidad real.
   `EntityField` pide `parent_id` y lo ignora; `websiteMenuService` sí arma el árbol y
   `MenuTreeEditor` solo pinta las raíces.
4. **Conteo de productos**: solo `CategoryFilterBar` sabe pintarlo y ningún consumidor se lo pasa;
   `categoryService.getProductCounts` solo lo usa la pantalla de categorías.
5. **Filtro `is_active`**: solo promociones y el menú del website. Los ocho selectores de
   inventario muestran categorías inactivas.
6. **Color e icono**: solo el POS y, parcialmente, el page-builder y el menú. Los ocho de
   inventario pintan texto plano aunque el árbol de categorías tiene columnas dedicadas para ambos.
7. **Crear inline**: solo el alta de producto. La pantalla equivalente de edición (`DetallesTab`)
   no lo tiene.
8. **Placeholders**: «Seleccionar categoría» / «Buscar categoría...» / «No se encontraron
   categorías» / «Sin categoría» (alta y detalle de producto) · «Categoría» / «Todas» (filtro del
   catálogo) · «Categorías» / «Todas las categorías» (POS) · «Seleccione categoría» (masivas) ·
   «Todas las categorías» (stock, reportes) · «Sin categoría» (menú web).
9. **Contrato propuesto** — `CategoryPicker` con `Layout=popover|dialog|inline|chips|tiles`,
   `mode=single|multi`, `tree=true` (sangría real, con búsqueda que **sí** entra en ramas
   colapsadas), `filter: {isActive?, station?, withProducts?}`, `showProductCount`,
   `showColorIcon`, `allowEmpty` con un solo sentinel (`null`), `showCreate` reutilizando
   `QuickCategoryForm` con validación de slug e impedimento de ciclos. Un solo
   `categorySearchService` que devuelva el árbol con conteos desde la BD (hoy se descargan todas
   las filas y se cuentan en el navegador, §E).

---

## E. Datos que trae cada pantalla

Qué tabla se consulta, con qué joins y qué campos acaban pintados. **Negrita** = dato de otra
tabla. La última columna señala lo que **la interfaz calcula en el navegador y debería venir de
la base de datos**.

### E.1 Proveedores

| Pantalla | Tablas y consultas | Campos pintados | Lo que calcula el navegador |
|---|---|---|---|
| Listado (`CatalogoProveedores.tsx:64-161`) | `suppliers select('*')` `eq organization_id` + `or ilike name,email,nit` + `order`. Después **`purchase_orders`** `select('supplier_id, status, expected_date, updated_at')` `in supplier_id` `not expected_date is null` `in status ('received','sent')` | `id`, `name`, `nit`, `contact`, `phone`, `email`, `credit_days`, **% de cumplimiento** | **Todo el cumplimiento**: agrupa las órdenes por proveedor y calcula `entregadas a tiempo / total` comparando `updated_at <= expected_date` (l.100-123). Es una agregación que debería ser una vista o RPC; hoy se descargan todas las órdenes de todos los proveedores en cada tecla del buscador. **La paginación también**: la consulta no lleva `range`, se traen todas las filas y se cortan de 10 en 10 en memoria (`ProveedoresTable.tsx:215-220`) |
| Detalle (`ProveedorDetalle.tsx:66-117`) | `suppliers` por uuid; en paralelo **`purchase_orders`** (10), **`invoice_purchase`** (10), **`accounts_payable`** con embed `invoice_purchase(number_ext, issue_date, total)` (todas), **`payments`** (todas las de la organización con `source in (account_payable, invoice_purchase)` y `status='completed'`), **`product_suppliers`** con embed `products(id, uuid, name, sku, is_active)`, **`stock_levels`** `in product_id` | 30 campos de `suppliers`; de OC: `created_at`, `id`, `status`, `total`; de facturas: `created_at`, `number_ext`, `status`, `total`; de CxP: `invoice_number`, `due_date`, `status`, `days_overdue`, `amount`, `balance`; de pagos: `payment_date`, `method`, `reference`, `source`, `amount`; de productos: `name`, `sku`, `cost`, `is_preferred`, `supplier_sku`; de stock: total y valor | **Los 8 KPIs del «Resumen Financiero»** (§A.5.13) y el **valor de stock** (`stock_total × cost`, `supplierService.ts:849`). Los pagos se **filtran en el navegador**: se descargan **todos los pagos completados de la organización** y luego se cruzan contra dos listas de ids (`supplierService.ts:734-766`) — debería ser un `in` en el servidor o una RPC. Los conteos «Órdenes de Compra» y «Facturas» **mienten**: cuentan solo las 10 traídas |
| Nuevo (`NuevoProveedorForm.tsx`) | **`organizations`** `select('country_code')`; **`country_identification_types`** `select('code, name, for_company, for_person')` por país (con fallback «GEN»); `suppliers` `select('id, name')` `eq supplier_type 'company'` | Tipos de documento del país; lista de empresas proveedoras | — |
| Editar (`EditarProveedorForm.tsx:63-95`) | `suppliers` por uuid | 27 campos | — |
| Importar | Solo escribe: `INSERT` fila a fila en `suppliers` (`supplierService.ts:579-612`) | — | La validación por fila (nombre, email, tipo, días de crédito) se hace **dos veces**: en el componente (`ImportarProveedores.tsx:171-189`) y otra vez en el servicio (`supplierService.ts:545-570`) |
| Exportaciones | `getSuppliers(orgId, {}, 1, 10000)` — una página de **diez mil** filas | 26 columnas incluidas `is_active` y `rating`, **que ninguna pantalla deja editar** | La fecha de creación se formatea con `toLocaleDateString('es-CO')` (`supplierService.ts:902`): zona del navegador, no de la organización |

**Lo que el detalle NO muestra y podría**: número real de órdenes y facturas (un `count` en la
BD), antigüedad de la cartera por tramos (`accounts_payable` ya tiene `days_overdue`),
`lead_time_days` y `min_order_qty` promedio (ya se consultan), último pedido y último pago,
`rating`, `is_active`, `tax_id` y `fiscal_responsibilities`.

### E.2 Categorías

| Pantalla | Tablas y consultas | Campos pintados | Lo que calcula el navegador |
|---|---|---|---|
| Árbol (`useCategories.ts:70-88`) | `categories select('*')` `eq organization_id` `order display_order, rank`; **`products`** `select('category_id')` `eq organization_id` `not category_id is null` | `name`, `uuid`, `slug`, `color`, `icon`, `image_url`, `is_active`, `requires_preparation`, `parent_id`, **conteo de productos**, conteo de hijas | **Todo**: el árbol (`buildCategoryTree`, `categoryService.ts:89-119`), los 4 KPIs (`computeStats`, :121-130), el **conteo de productos por categoría** —que descarga **una fila por producto de la organización** solo para contar (`categoryService.ts:191-205`)— y el aplanado con niveles. Con 500 productos eso son 500 filas por carga; debería ser `select category_id, count(*) group by` o una vista |
| Detalle (`app/app/inventario/categorias/[id]/page.tsx:55-74`) | `categories` por uuid; `categories` **completa otra vez** (`getAll`) solo para hallar el padre y las hijas; **`products`** `select('category_id')` otra vez para el conteo; **`products`** `select('id, uuid, name, sku, status, description')` `eq category_id` `eq organization_id` `order name` **sin límite** (`CategoryProductsCard.tsx:42-47`); **`category_rules`** `eq category_id`; **`suppliers`** y **`product_tags`** para los desplegables de las reglas; **`products`** tres veces más para las sugerencias de `brand`, `reference` y `station` (`CategoryRulesCard.tsx:127-141`) | Los 22 campos de la categoría + padre + hijas + productos + reglas | El padre y las hijas se buscan **en memoria** sobre el array completo (`page.tsx:67-68`) en vez de con dos consultas por `parent_id`. El conteo de productos se recalcula descargando de nuevo todos los `category_id`. `description` se selecciona en `CategoryProductsCard` y **no se usa** |
| Formulario | `categories getAll` (sin límite) para el desplegable de padre | — | `rank` y `display_order` se calculan como `max(display_order de hermanas) + 1` **en el navegador** (`CategoryForm.tsx:146-153`), con una condición de carrera evidente si dos usuarios crean a la vez |
| Importar | `categories getAll` para el mapa nombre→id; luego `INSERT` fila a fila | — | La resolución del padre se hace **por nombre en minúsculas** en un `Map` del navegador (`categoryService.ts:534-535`): dos categorías con el mismo nombre en ramas distintas se confunden |
| Exportaciones | `getAll` | 12 columnas; la «Categoría Padre» se resuelve **por nombre** desde un `Map` local (`categoryService.ts:409-410 · 429`) | El nombre del padre. `Estación` se exporta con el **valor crudo** (`hot_kitchen`), no con su etiqueta |

**Datos de otras tablas que la pantalla de categorías no muestra y el rediseño podría**: ventas o
unidades vendidas por categoría (existe la RPC `pos_category_ranking`, que hoy **solo usa el POS**),
favoritos del POS (`category_favorites`), páginas del sitio web vinculadas (`website_pages.
linked_category_id`, `website_menu_items.category_id`), promociones que la referencian
(`promotion_rules.category_id`) y cuántos productos llegarían por reglas (`category_rules`).

---

## F. Esquema real verificado con el MCP de Supabase

Proyecto `jgmgphmzusbluqhuqihj`, consultas de solo lectura sobre `information_schema.columns`,
`pg_constraint` y `pg_indexes` (2026-09-22).

### F.1 `public.suppliers` (39 columnas)

| Columna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | integer | NO | `nextval('suppliers_id_seq')` | PK. Es el valor que usan todas las FK |
| `organization_id` | integer | **NO** | — | **NOT NULL sin default.** FK a `organizations` `ON DELETE CASCADE` |
| `name` | text | **NO** | — | **NOT NULL sin default.** Único obligatorio del formulario |
| `nit` | text | SÍ | — | **No tiene índice único.** El comentario «NIT debe ser único, no duplicar» de `supplierService.ts:424` es falso: nada impide dos proveedores con el mismo NIT |
| `contact` | text | SÍ | — | **La columna es `contact`, NO `contact_name`** (trampa confirmada; el fallo histórico está documentado en `lib/services/aiActionsService.ts:697-698` y `lib/ai/assistant/actionCatalog.ts:17`). `grep -rn "contact_name" src` solo devuelve `customers`, `shipments` y contactos CRM |
| `phone`, `email`, `notes`, `description`, `address`, `city`, `state`, `postal_code`, `tax_id`, `tax_regime`, `payment_terms`, `website`, `bank_name`, `bank_account`, `logo_url`, `icon`, `trade_name` | text | SÍ | — | — |
| `created_at`, `updated_at` | timestamptz | SÍ | `now()` | `updated_at` **se escribe a mano** en `updateSupplier` (`supplierService.ts:364`), no hay trigger |
| `uuid` | uuid | **NO** | `gen_random_uuid()` | Único (`suppliers_uuid_idx`). **Es lo que usan las rutas** `/[id]` y `/[id]/editar` |
| `color` | text | SÍ | `'#10b981'` | **Nada lo lee ni lo escribe en toda la app** |
| `country` | text | SÍ | `'Colombia'` | Texto libre |
| `country_code` | char | SÍ | `'CO'` | — |
| `fiscal_responsibilities` | text[] | SÍ | — | Solo se rellena desde la consulta DIAN; no hay control para editarlas |
| `credit_days` | integer | SÍ | `0` | **Default 0**, por eso el `|| 30` del listado (§A.3 #19) es un error |
| `is_active` | boolean | SÍ | `true` | Índices `idx_suppliers_is_active` e `idx_suppliers_organization_active`. **Ningún formulario lo escribe y solo un selector lo filtra** |
| `rating` | numeric | SÍ | — | `CHECK (rating >= 0 AND rating <= 5)`, índice `idx_suppliers_rating`. **Nadie lo escribe ni lo lee** |
| `account_type` | text | SÍ | — | `CHECK IN ('savings','checking','other')` |
| `supplier_type` | text | **NO** | `'company'` | `CHECK IN ('person','company')`. **NOT NULL con default**: por eso el `update` que no lo envía lo devuelve a `'company'` (§G) |
| `parent_supplier_id` | integer | SÍ | — | FK a `suppliers` `ON DELETE SET NULL`, índice parcial `idx_suppliers_parent`. **Jerarquía de proveedores que ninguna pantalla visualiza** |
| `doc_type`, `dv` (char), `municipality_code` (varchar), `identification_document_code` (varchar), `legal_organization_code` (char) | — | SÍ | — | DIAN/Factus |

**Índices**: `suppliers_pkey`, `suppliers_uuid_idx` (único), `idx_suppliers_is_active`,
`idx_suppliers_organization_active`, `idx_suppliers_parent`, `idx_suppliers_rating`,
`idx_suppliers_tax_id`. **No hay índice sobre `name` ni `nit`**, que es justo por donde buscan
las 15 implementaciones. **No hay ningún índice de texto (`gin`/`trgm`)** para los `ilike '%…%'`.

**Trampas confirmadas y ampliadas**:
- `contact`, no `contact_name` ✔.
- **`nit` no es único**, pese a lo que dice el código.
- **Ninguna columna es `GENERATED ALWAYS`** (a diferencia de `customers`): aquí sí se escribe todo.
- `supplier_type` es `NOT NULL` con default: un `update` parcial que lo omita lo reescribe.
- Borrar un proveedor **arrastra en cascada** sus `purchase_orders` e `invoice_purchase`
  (`ON DELETE CASCADE`), pone a `NULL` sus `lots.supplier_id` y `serial_numbers.supplier_id`,
  borra sus `product_suppliers` — y **falla** si tiene `accounts_payable`, porque esa FK no
  declara acción. El diálogo de borrado no dice nada de esto (§A.4 #30).
- RLS activo con 4 políticas.

### F.2 `public.categories` (21 columnas)

| Columna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | integer | NO | `nextval` | PK |
| `organization_id` | integer | **NO** | — | **NOT NULL sin default.** FK `ON DELETE CASCADE` |
| `parent_id` | integer | SÍ | — | FK a `categories` **sin acción declarada**: no se puede borrar un padre sin desvincular antes a las hijas (por eso `categoryService.delete` las mueve a raíz primero) |
| `name` | text | **NO** | — | **NOT NULL sin default** |
| `slug` | text | **NO** | — | **NOT NULL sin default y único por organización** (trampa confirmada). Nunca se comprueba antes de insertar salvo en el asistente de IA |
| `rank` | integer | **NO** | `0` | NOT NULL con default |
| `display_order` | integer | SÍ | `0` | **Segundo campo de orden**, redundante con `rank`; el árbol ordena por `display_order` y luego `rank` (`categoryService.ts:114 · 159-160`) |
| `created_at`, `updated_at` | timestamptz | SÍ | `now()` | `updated_at` se escribe a mano en `update`/`updateByUuid` |
| `icon` | text | SÍ | — | Nombre de icono Lucide, sin validar |
| `color` | text | SÍ | `'#6366f1'` | **El default de la BD (`#6366f1`) no coincide con el del formulario (`#3B82F6`, `categoryService.ts:138`) ni con el del importador (`#6366f1`)** |
| `image_url`, `description`, `meta_title`, `meta_description` | text | SÍ | — | — |
| `is_active` | boolean | SÍ | `true` | Índices `idx_categories_is_active`, `idx_categories_organization_active` |
| `uuid` | uuid | **NO** | `gen_random_uuid()` | Único (`idx_categories_uuid`). Es lo que usan las rutas |
| `metadata` | jsonb | SÍ | `'{}'` | En `CategoryFormData` y **sin ningún control** |
| `requires_preparation` | boolean | SÍ | `false` | — |
| `station` | text | SÍ | — | **`CHECK IN ('hot_kitchen','cold_kitchen','bar','cashier','all')`** |
| `branch_id` | integer | SÍ | — | FK a `branches` `ON DELETE CASCADE`, índice `idx_categories_org_branch`. **Nada en la app lo lee ni lo escribe** (§G) |

**Constraints e índices de `slug` — hay tres, y se contradicen**:
1. `categories_organization_id_slug_key`: `UNIQUE (organization_id, slug)` — sin condición.
2. `idx_categories_org_branch_slug`: `UNIQUE (organization_id, COALESCE(branch_id, -1), slug)
   WHERE slug IS NOT NULL AND slug <> ''` — promete slugs **por sucursal**.
3. `idx_categories_org_slug_unique`: `UNIQUE (organization_id, slug) WHERE branch_id IS NULL`.

El (1) hace **imposible** lo que permite el (2): dos sucursales de la misma organización no pueden
tener una categoría con el mismo slug, aunque el índice por sucursal lo contemple. Si alguna vez
se activa `branch_id`, hay que decidir cuál sobra.

**FK entrantes a `categories`**: `products.category_id` (`ON DELETE SET NULL` — al borrar una
categoría los productos quedan **sin categoría, en silencio**), `product_category_relations`,
`category_rules`, `category_favorites`, `promotion_rules` (todas `ON DELETE CASCADE`),
`website_menu_items.category_id` y `website_pages.linked_category_id` (`SET NULL`).

RLS activo con 5 políticas. `category_rules` (1 política) y `category_favorites` (1) también.

### F.3 Tablas auxiliares relevantes

- **`product_suppliers`**: `product_id` y `supplier_id` NOT NULL, `cost` NOT NULL default 0,
  `lead_time_days` default 0, `min_order_qty` default 1, `is_preferred` default false,
  `supplier_sku`, `notes`. **UNIQUE `(product_id, supplier_id)`**, índice parcial
  `idx_product_suppliers_preferred (product_id, is_preferred) WHERE is_preferred`.
  **No tiene `organization_id`**: el aislamiento depende de RLS y de la FK al producto.
- **`category_rules`**: `category_id`, `organization_id`, `field`, `operator` NOT NULL; `value`,
  `value_array` (text[] default `{}`), `logic_combiner` NOT NULL default `'AND'`, `display_order`
  NOT NULL default 0, `is_active` NOT NULL default true. **Sin `CHECK` sobre `field`/`operator`**:
  la validación vive solo en TypeScript (`categoryRulesService.ts:46-107`).
- **`category_favorites`**: `organization_id` + `category_id` con UNIQUE. **La pantalla de
  categorías no lo usa**; solo el POS.

---

## G. Lo roto o sin efecto

Clasificado por gravedad. Todo con `archivo:línea`.

### G.1 Corrompe datos

1. **Editar un proveedor le cambia el tipo y le borra el padre, el tipo de documento y las
   responsabilidades fiscales.** `supplierService.updateSupplier` escribe **siempre**
   `supplier_type: input.supplier_type || 'company'`, `parent_supplier_id: … || null`,
   `doc_type: … || null` y `fiscal_responsibilities: … || null`
   (`lib/services/supplierService.ts:334-336 · 351`), pero `EditarProveedorForm` **no carga ni
   envía ninguno de los cuatro** (`editar/EditarProveedorForm.tsx:74-89 · 148`). Guardar cualquier
   cambio en una persona natural la convierte en empresa, la desvincula de su empresa madre y
   pierde los datos fiscales obtenidos de la DIAN.
2. **Editar el nombre de una categoría le cambia el slug y le pisa el SEO.** `handleNameChange`
   regenera `slug`, `meta_title` y `meta_description` en cada pulsación **también en modo
   edición** (`categorias/CategoryForm.tsx:105-114`). El slug es la URL pública de la categoría
   en la tienda web (`website_pages.linked_category_id`, `website_menu_items.category_id`):
   renombrar «Bebidas» a «Bebidas frías» rompe el enlace y borra el `meta_title` escrito a mano.
3. **La descripción y las notas del proveedor se guardan como HTML y se editan como texto plano.**
   El alta usa `RichTextEditor` (`nuevo/NuevoProveedorForm.tsx:417 · 674`) y la edición usa
   `Textarea` (`editar/EditarProveedorForm.tsx:225 · 482`): al abrir «Editar» se ven las
   etiquetas `<p>` en crudo y al guardar se escapan.
4. **Se puede crear un ciclo en el árbol de categorías.** El desplegable «Categoría Padre» excluye
   solo la propia categoría (`CategoryForm.tsx:70`) y no sus descendientes: asignar a un padre una
   de sus hijas deja ambas fuera del árbol, porque `buildCategoryTree` solo mete en `roots` lo que
   tiene `parent_id === null` o un padre que no está en el mapa (`categoryService.ts:97-109`).
   `QuickCategoryForm` tampoco valida. El arrastre del árbol **sí** lo comprueba
   (`CategoriesTreeTable.tsx:95-105 · 132`), pero solo sobre las filas visibles de la página
   actual.
5. **El árbol de categorías se parte en la paginación.** `DataTablePagination` corta el array ya
   aplanado (`app/app/inventario/categorias/page.tsx:50-53 · 151-159`): un padre puede quedar en
   la página 1 y sus hijas en la 2, y entonces `isDescendant` del arrastre (que solo mira
   `filtered`, `CategoriesTreeTable.tsx:96 · 101`) **deja de detectar descendientes** y permite
   crear el ciclo del punto anterior.

### G.2 Controles y props sin efecto

6. **`BranchSelectorField` `required` del importador de categorías no hace nada.**
   `ImportCategoriesDialog.tsx:148 · 248-252` guarda `branchId` en el estado y `handleImport`
   (`:194-221`) nunca lo usa; `categoryService.importCategories` no recibe sucursal y
   **`categories.branch_id` no se escribe en ningún punto de la aplicación** (verificado:
   `grep` de `branch_id` en `categoryService.ts` y en `components/inventario/categorias` no
   devuelve nada). El campo está marcado obligatorio y es decorativo.
7. **«Activo» y «Rating» del importador de proveedores se leen y se tiran.**
   `importar/ImportarProveedores.tsx:133 · 130-131` los parsea y los descarta explícitamente con
   `void isActive; void rating;` (`:192-193`); `supplierService.importSuppliers` tampoco los
   inserta (`:579-612`). La plantilla los pide y el exportador los emite.
8. **`isProcessing` no se renderiza.** `ImportarProveedores.tsx:303 · 338` lo activa y lo apaga y
   **no aparece en el JSX**: al cargar un Excel grande la pantalla no da ninguna señal.
9. **Las zonas de «arrastra un archivo» no aceptan archivos arrastrados.** Ni
   `ImportarProveedores.tsx:462-499` («Arrastra un archivo o haz clic para seleccionar») ni
   `ImportCategoriesDialog.tsx:266-279` tienen `onDrop`/`onDragOver`.
10. **`getSupplierStats` es código muerto.** `supplierService.ts:445-469` calcula total, con
    email, con teléfono y añadidos en 30 días; **ningún archivo la llama**. La pantalla de
    proveedores no tiene KPIs.
11. **Dos formularios de categoría huérfanos.** `categorias/nuevo/NuevaCategoriaForm.tsx` (391
    líneas, con su propio `generateSlug` en `:70`) y `categorias/editar/EditarCategoriaForm.tsx`
    (279 líneas) no los importa nadie.
12. **Dos componentes de proveedores huérfanos.** `proveedores/DetalleProveedor.tsx` (436 líneas)
    y `proveedores/FormularioProveedor.tsx` (509 líneas): `grep` no encuentra un solo import.
13. **Filtros declarados sin control.** `FiltrosProveedores` declara `estado` y `ordenarPor`
    (`proveedores/types.ts:450-454`) y no los expone; el propio componente lo reconoce con el
    comentario «Aquí se pueden agregar más filtros como estado, fecha de creación, etc»
    (`FiltrosProveedores.tsx:152`). El botón «Limpiar filtros» se deshabilita mirando `estado`
    (`:158`), que nunca cambia.
14. **Campos consultados y nunca pintados**: `lead_time_days` y `min_order_qty`
    (`ProveedorDetalle.tsx:66 · 76-77`), `discount_amount` de CxP y de pagos
    (`supplierService.ts:672 · 747`), `branches_with_stock` (`:848`), `issue_date` de las facturas
    (`:511`, se pinta `created_at`), `withChildren` de las estadísticas de categorías
    (`categoryService.ts:128`), `description` en `CategoryProductsCard.tsx:44`, y
    `subtitle`/`sublabel` en los combos de proveedor, que el servicio nunca rellena.
15. **`onProductsAssigned` recibe un conteo que se ignora.** `CategoryRulesCard.tsx:45 · 276`
    entrega `result.assigned`; la página lo descarta con `() => loadData()`
    (`categorias/[id]/page.tsx:161`), así que el usuario nunca sabe cuántos productos se movieron.
16. **`suppliers.color` y `suppliers.rating` no se escriben ni se leen** en ninguna pantalla,
    pese a tener default e índice.

### G.3 Sin retroalimentación

17. **Las tres acciones de las reglas de categoría fallan en silencio.** «Guardar reglas»,
    «Vista previa» y «Aplicar y asignar» solo hacen `console.error`
    (`CategoryRulesCard.tsx:223-227 · 254-258 · 278-282`): **ni un toast de éxito ni de error**.
    Es la única zona de las dos pantallas sin ningún aviso.
18. **`QuickCategoryForm` silencia el error de carga de padres** con un `catch {}` vacío
    (`productos/nuevo/QuickCategoryForm.tsx:59-61`); `EntityField.tsx:142-143` hace lo mismo.
19. **Diálogo de borrado sin contexto.** Ni el de proveedor (`CatalogoProveedores.tsx:374-376`)
    ni los dos de categoría (`DeleteCategoryDialog.tsx:243-245` y `categorias/[id]/page.tsx:183-185`)
    nombran el registro ni avisan de las consecuencias reales (cascada de órdenes y facturas de
    compra en proveedores; productos sin categoría en categorías, §F).

### G.4 Rutas y navegación

20. **La búsqueda global lleva a un 404 en todos los proveedores.**
    `components/app-layout/Header/GlobalSearch.tsx:150` genera
    `/app/proveedores/{proveedor.id}`: esa ruta **no existe** (`src/app/app/proveedores` no está
    en el árbol) y, aunque existiera, la página del detalle espera un **uuid**
    (`app/app/inventario/proveedores/[id]/page.tsx:8-9`), no el `id` entero. Las categorías del
    mismo buscador sí usan el uuid y la ruta correcta (`GlobalSearch.tsx:159`).
21. **Botón «Proveedores» a una ruta inexistente** en facturas de compra:
    `components/finanzas/facturas-compra/FacturasCompraPage.tsx:86` enlaza a
    `/app/finanzas/proveedores`, que no existe.
22. **Duplicados de navegación**: «Editar Proveedor» aparece dos veces en el detalle
    (`ProveedorDetalle.tsx:200-202` y `:668-672`) y «← Inventario» dos veces en el árbol de
    categorías (`CategoriesPageHeader.tsx:41-47` y `categorias/page.tsx:163`).
23. **El detalle de proveedor tiene un estado «Proveedor no encontrado» inalcanzable**: los dos
    caminos que dejan `supplier` en `null` hacen `router.push` antes
    (`ProveedorDetalle.tsx:75 · 115` vs `:168-175`).

### G.5 Consultas y rendimiento

24. **El listado de proveedores no pagina en el servidor**: `select('*')` sin `range` ni `limit`
    (`CatalogoProveedores.tsx:64-77`) y el corte de 10 se hace en memoria
    (`ProveedoresTable.tsx:215-220`). `supplierService.getSuppliers` sí tiene paginación real y
    **nadie la usa** (`supplierService.ts:170-203`).
25. **El buscador del listado consulta en cada tecla**: no hay debounce, el `useEffect` depende
    del objeto `filters` completo (`CatalogoProveedores.tsx:161`), y cada consulta arrastra
    además **todas las órdenes de compra** de todos los proveedores para recalcular el
    cumplimiento (`:93-98`).
26. **El historial de pagos descarga todos los pagos de la organización** y los filtra en el
    navegador (`supplierService.ts:734-766`).
27. **El conteo de productos por categoría descarga una fila por producto**
    (`categoryService.ts:191-205`) y lo hace **dos veces** en el detalle (una en `loadData`, otra
    en `CategoryProductsCard`).
28. **12 consultas de proveedor sin límite** y 19 de categoría (§C.3 y §D), varias con
    `select('*')` para pintar solo el nombre.
29. **Falta de escapado en los `ilike`**: `CatalogoProveedores.tsx:71`, `supplierService.ts:182`,
    `SupplierSelector.tsx:85`, `ProviderSelector.tsx:120` y `searchService.ts:57` interpolan el
    término sin escapar: una coma rompe el `or()` de PostgREST (HTTP 400) y `%`/`_` actúan como
    comodines. Solo `lib/ai/agent/tools/consulta.ts:272-274` escapa.
30. **`searchService.ts:57` mete espacios tras las comas** del `or()`, que pasan a formar parte
    del patrón del segundo y tercer filtro.
31. **Consultas sin `organization_id`** (dependen solo de RLS): `productos/id/tabs/ProveedoresTab.tsx:100-108`,
    `pms/espacios/id/AddConsumptionDialog.tsx:101-105`, `promotionsService.ts:132-137`,
    `categoryService.getById`/`getByUuid`/`update`/`delete`/`move`/`toggleActive`
    (`categoryService.ts:167-190 · 237-328 · 377-403`) y
    `CategoryRulesCard.tsx:203` (`delete().eq('category_id', …)`).
32. **`api/categorias/reglas/route.ts` lee la organización del body y del query string**
    (`:14 · 96`) sin `getServerOrgContext()`. Está en la `ALLOWLIST` de
    `src/__tests__/guardrails.test.ts:272` como deuda anterior a F0 — y además **ningún
    componente lo llama**: `CategoryRulesCard` va directo a Supabase desde el navegador.

### G.6 Fechas, moneda y textos

33. **`toISOString().split('T')[0]` prohibido, tres veces**: `CatalogoProveedores.tsx:247 · 285 ·
    323` lo usa para el nombre de los archivos exportados. Regla 1 de
    `docs/reglas-fechas-timezone.md`: hay que usar `todayInTz(tz)`. No lo cubre ninguna regla de
    `guardrails.test.ts` porque ese archivo no está en su barrido.
34. **`toLocaleDateString('es-CO')`** en el CSV de proveedores (`supplierService.ts:902`): usa la
    zona del navegador, no la de la organización.
35. **Moneda cableada**: `formatCurrency` de `@/utils/Utils` tiene `currency = "COP"` y locale
    `es-CO` por defecto (`src/utils/Utils.ts:69-89`), y el detalle del proveedor la llama **sin
    argumento** en las cinco tablas y en los ocho KPIs (`ProveedorDetalle.tsx:357 · 396 · 433 ·
    482-483 · 524 · 563-567 · 601-666`). Una organización que factura en otra moneda ve pesos
    colombianos.
36. **El placeholder miente**: «Buscar por nombre, NIT, contacto...»
    (`FiltrosProveedores.tsx:144`) y el `or()` no incluye `contact`
    (`CatalogoProveedores.tsx:71`). El placeholder de la búsqueda global dice «Buscar
    organizaciones, clientes, productos...» y también busca proveedores y categorías
    (`GlobalSearch.tsx:368`).
37. **`console.log` de depuración en producción**: `CatalogoProveedores.tsx:61 · 79 · 80`
    («🔍 Buscando proveedores para organization_id:», «📦 Proveedores encontrados:»,
    «🔍 Datos recibidos:» — este último vuelca **todas las filas** a la consola).
38. **Etiquetas divergentes entre alta y edición del mismo proveedor**: «Razón Social *» /
    «Nombre completo *» con placeholder «Empresa S.A.S.» / «Juan Pérez»
    (`nuevo/NuevoProveedorForm.tsx:344-345`) frente a «Nombre / Razón Social *» con placeholder
    «Nombre del proveedor» (`editar/EditarProveedorForm.tsx:192-193`); «Número de Documento»
    frente a «NIT / Identificación» (`:360` vs `:197`).
39. **El `Select` de padre del importador de categorías resuelve por nombre en minúsculas**
    (`categoryService.ts:534-535 · 558-560`): dos categorías homónimas en ramas distintas se
    confunden en silencio.

### G.7 Datos que el formulario no puede producir

40. **La plantilla de importación de categorías propone estaciones inválidas.** El ejemplo usa
    «Bebidas» en la columna «Estación» (`ImportCategoriesDialog.tsx:28-30`), pero
    `categories.station` tiene `CHECK IN ('hot_kitchen','cold_kitchen','bar','cashier','all')`
    (§F.2): **todas las filas del ejemplo fallan** con el error crudo de Postgres, que se muestra
    tal cual en «Fila {n}: {error}» (`categoryService.ts:596-598`).
41. **El exportador de categorías escribe la estación en crudo** (`hot_kitchen`) mientras el
    formulario muestra «Cocina Caliente» (`categoryService.ts:436` vs `printersService.ts:56-62`).
42. **El importador de productos crea categorías incompletas**: solo `{organization_id, name,
    slug}` (`app/app/inventario/productos/importar/page.tsx:1123-1130`), sin `color`, `icon`,
    `rank` ni `display_order`, y ante colisión de slug reintenta con
    `` `${slug}-${Date.now()}` `` (`:1132-1141`), generando slugs impronunciables que luego son
    la URL pública de la categoría.
43. **El importador de productos crea proveedores con solo `name`**
    (`importar/page.tsx:1166-1181`), sin NIT ni datos fiscales, y sin confirmación.
44. **Colisión de slug sin manejar en los dos formularios**: ni `CategoryForm` ni
    `QuickCategoryForm` comprueban `(organization_id, slug)` antes de insertar; el usuario recibe
    el mensaje de Postgres. El único que lo hace bien es el asistente de IA
    (`lib/services/aiActionsService.ts:614-633`, sufijos `-2`, `-3`, `-4`).
45. **`duplicate` de categoría genera slugs con epoch**: `{slug}-copia-{Date.now()}`
    (`categoryService.ts:336 · 359`).

---

## H. Conteo de controles por pantalla

«Filas» = controles inventariados (incluye textos, badges y estados); «interactivos» = botones,
menús, campos, toggles, chips, atajos y paginación.

### H.1 Proveedores

| Pantalla | Filas | Interactivos | Diálogos |
|---|---|---|---|
| A.1 Listado — cabecera | 9 | 6 (botón + 3 ítems de menú + importar + trigger) | 0 |
| A.2 Listado — filtros | 3 | 2 | 0 |
| A.3 Listado — tabla + paginación | 16 | 4 por fila + 3 de paginación | 0 |
| A.4 Listado — diálogo eliminar | 7 | 2 | 1 |
| A.5 Detalle (cabecera + 8 tarjetas + lateral + estados) | 71 | 6 + 1 por fila de 5 tablas | 0 |
| A.6 Nuevo proveedor | 41 | 33 | 0 |
| A.7 Editar proveedor | 10 (+28 heredados) | 28 | 0 |
| A.8 Importar | 16 | 6 | 0 |
| **Total proveedores** | **173** | **≈90 fijos** | **1** |

### H.2 Categorías

| Pantalla | Filas | Interactivos | Diálogos |
|---|---|---|---|
| B.1 Árbol — cabecera | 8 | 7 | 0 |
| B.2 Árbol — KPIs | 4 | 0 (**ninguno filtra**) | 0 |
| B.3 Árbol — barra | 3 | 3 | 0 |
| B.4 Árbol — tabla | 27 | 3 + 5 ítems de menú + arrastre, por fila | 0 |
| B.5 Paginación y navegación | 3 | 4 | 0 |
| B.6 Diálogo eliminar | 4 | 2 | 1 |
| B.7 Diálogo importar | 12 | 7 | 1 |
| B.8.1-3 Detalle (cabecera + 6 tarjetas + estados) | 30 | 6 + 1 por subcategoría y por producto | 1 |
| B.8.4 Reglas de auto-asignación | 15 | 6 + 4 por regla | 0 |
| B.9 Formulario (alta y edición) | 21 | 17 | 0 |
| **Total categorías** | **127** | **≈60 fijos** | **3** (dos de ellos idénticos) |

### H.3 Selectores compartidos

| Bloque | Implementaciones | Notas |
|---|---|---|
| C. Selectores de proveedor | 15 con interfaz + 7 resolutores | 4 patrones de contenedor, 5 alturas de trigger, 8 conjuntos de campos de búsqueda, 7 contratos de salida |
| D. Selectores de categoría | 22 (2 de ellos código muerto) | 5 sentinelas de «ninguno», 7 contratos de salida, **0 con árbol real** |

**Total inventariado: ≈300 filas / ≈150 controles interactivos fijos** en las nueve pantallas,
más 37 selectores repartidos por el resto de la aplicación.

---

## I. Recomendación de rediseño

### I.1 Qué se reutiliza del kit existente

| Componente del kit | Dónde aplicarlo | Qué sustituye |
|---|---|---|
| `PageHeader` (patrón de `CategoriesPageHeader`) | Listado de proveedores | La cabecera a medida de `ProveedoresPageHeader.tsx`, que no tiene botón «Volver» ni «Actualizar» |
| `DataTable` + `DataTablePagination` (`components/ui/DataTablePagination`) | Tabla de proveedores | La paginación manual de 10 en 10 de `ProveedoresTable.tsx:215-220`, sin selector de tamaño |
| `FilterPanel` | Filtros de proveedores y barra de categorías | El panel de un solo campo de `FiltrosProveedores.tsx` y los dos filtros declarados sin control |
| `BulkActionBar` + checkbox de fila | **Falta en las dos pantallas** | Nada: hoy no hay selección múltiple ni en proveedores ni en categorías, aunque sí la hay en el catálogo de productos |
| `ConfirmDialog` | Los tres diálogos de borrado | `CatalogoProveedores.tsx:370-390`, `DeleteCategoryDialog.tsx` y su copia literal en `categorias/[id]/page.tsx:179-196` |
| `Badge` (`docs/design/SISTEMA-BADGES.md`) | Estado de OC, facturas, CxP, «Activa/Inactiva», «Válido/con errores» | Los seis mapas de colores escritos a mano en `ProveedorDetalle.tsx:121-132 · 473-480`, `CategoriesTreeTable.tsx:298-308`, `ImportarProveedores.tsx:552-563` |
| `ImageUploader` | Logo de proveedor e imagen de categoría | Ya se usa en los dos (`supplier-logos` y `categories`); solo falta en el formulario de edición de categoría el mismo recorte |
| `BranchBadge` | Detalle de proveedor (stock por sucursal) y árbol de categorías si se activa `branch_id` | Hoy el stock del proveedor suma todas las sucursales sin decirlo (`supplierService.ts:821-833`) |
| `CopyableId` | Ya usado en las dos tablas | — |
| `EmptyState` (patrón de `CategoriesTreeTable.tsx:162-181`) | Proveedores | El `colSpan={9}` con «No hay proveedores registrados» sin icono ni acción |

### I.2 Qué falta crear

1. **`SupplierPicker`** con el contrato de §C.4: sustituye 15 componentes y unifica 4 contenedores,
   5 alturas y 7 contratos de salida.
2. **`CategoryPicker`** con el contrato de §D.3.9, **con árbol real y conteo de productos**:
   sustituye 20 componentes vivos.
3. **`QuickSupplierForm`** (7 campos) y reutilización del `QuickCategoryForm` existente, con
   validación de slug y de ciclos, para que crear desde un selector no abra un formulario de
   `max-w-7xl` con 40 campos.
4. **`SupplierCard` / `CategoryCard`** para el estado «seleccionado», con acciones «Cambiar»,
   «Ver», «Editar», «Quitar» — hoy ninguna existe.
5. **`SupplierKpiRow`** para el listado (hay servicio y no hay pantalla:
   `supplierService.getSupplierStats`), con las tarjetas clicables que filtren, a diferencia de
   los KPIs de categorías que no hacen nada.
6. **`ImportWizard`** compartido (paso 1 archivo · 2 mapeo de columnas · 3 vista previa con
   errores · 4 resultado), con soporte de arrastre real, barra de progreso y política de
   duplicados (crear / actualizar / omitir). Reemplaza la pantalla de proveedores y el diálogo de
   categorías, que hoy divergen en contenedor, textos y capacidades.
7. **`TreeTable`** reutilizable: sangría, expandir/colapsar, arrastre para reparentar con
   validación de descendencia **sobre el árbol completo**, y búsqueda que entre en ramas
   colapsadas. Hoy esa lógica vive entera en `CategoriesTreeTable.tsx` y se rompe con la
   paginación.
8. **Vista o RPC de agregados**, para dejar de calcular en el navegador: conteo de productos por
   categoría, número real de órdenes y facturas por proveedor, saldo de cartera y % de
   cumplimiento de entregas (§E).

### I.3 Decisiones de producto que el rediseño debe resolver

- **`is_active` y `rating` de proveedores**: o se exponen (toggle de estado en el formulario,
  estrellas en el detalle y filtro «Solo activos» en los selectores) o se documentan como muertos.
  Hoy la BD los tiene, los índices los soportan y la interfaz los ignora.
- **`suppliers.parent_supplier_id`**: existe una jerarquía de proveedores que solo se puede crear
  (en el alta) y nunca se ve ni se edita. Decidir si el listado pasa a ser un árbol como el de
  categorías o si se elimina.
- **`categories.branch_id`** y sus tres índices únicos contradictorios (§F.2): decidir si las
  categorías son por sucursal antes de dibujar el selector de sucursal del importador.
- **`rank` vs `display_order`**: dos campos de orden, ambos visibles en el detalle, ninguno
  editable. Dejar uno.
- **Proveedores sin acciones masivas ni KPIs y categorías sin acciones masivas**: si el rediseño
  las añade, hay que diseñar también el estado de selección y la barra flotante, que hoy no
  existen en ninguna de las dos pantallas.

---

## J. Adenda 2026-09-23 — diseño en Figma y novedades del código

Esta adenda se añade al final; no reescribe nada de lo anterior. El detalle está en `AUDITORIA-CATALOGO-PRODUCCION.md` y `PARIDAD-CATALOGO-PRODUCCION.md`.

- **Ya están diseñadas en Figma.** Hasta hoy no existían: solo había la pestaña «Proveedores y etiquetas» del producto, el `SupplierPicker` y el `QuickCategoryForm`.
  - Página `04 Inventario`, sección «Categorías — árbol, detalle y formularios (Nuevo)» (`586:290667`).
  - Página `04 Inventario`, sección «Proveedores — listado, detalle, formulario y diálogos (Nuevo)» (`589:311642`).
  - Las dos están en el carril x = 62.000.
- **Corregido desde la auditoría anterior:**
  - `supplierService.updateSupplier` ya es parcial (`setIfPresent`, `supplierService.ts:330-374`). Queda sin efecto el punto G.1.1 en lo que toca al servicio.
  - `CategoryForm` ya no regenera `slug` ni `meta_title` al editar (`CategoryForm.tsx:105-118`). Queda sin efecto G.1.2 en esos dos campos.
- **Sigue abierto:**
  - `EditarProveedorForm` inicializa y envía `identification_document_code '31'` y `legal_organization_code '1'` cuando vienen vacíos (`EditarProveedorForm.tsx:35-36 · 85-87`). Una persona natural queda con el código DIAN de empresa.
  - `CategoryForm` sigue pisando `meta_description` al escribir el nombre o la descripción (`:117 · 125`).
- **Nuevo hallazgo:** la tarjeta «Productos vinculados» del detalle de proveedor siempre sale vacía. Pide `products(..., is_active)` y esa columna no existe (`ProveedorDetalle.tsx:96`).
- **Cifras de BD (2026-09-23):**
  - 1.604 proveedores en 21 organizaciones: 0 inactivos, 0 con `rating`, 0 personas naturales.
  - 11.863 `product_suppliers`.
  - 1.113 categorías en 24 organizaciones: 4 con padre, 0 con `branch_id`, 0 reglas de categoría.
  - 35.087 de 53.319 productos sin categoría.
- **RLS:**
  - `categories` conserva «Allow anon select categories» con `USING (true)`.
  - `suppliers` ya **no** tiene la política anónima que figura en el baseline.
