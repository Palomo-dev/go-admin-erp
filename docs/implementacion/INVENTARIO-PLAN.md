# Inventario — análisis completo y plan de implementación del módulo

Fecha: 2026-09-28. Encargo del dueño: «analiza primero todo y, con base en el contexto de UI, BD,
backend y flujo, aplica todo el módulo de inventario; deja el flujo completo, todo conectado y
todo funcionando». Este documento es **solo análisis y plan**: no se cambió código ni se aplicó
ninguna migración. La base se leyó con `SELECT` por el MCP de Supabase (proyecto
`jgmgphmzusbluqhuqihj`); Figma, con lecturas de estructura (archivo `EAvjINVRnlzFM70GVoWXgl`,
página `04 Inventario`, `264:98912`). Las organizaciones se nombran por id.

Documentos previos que este plan **consolida y verifica contra el estado de hoy** (muchos de sus
hallazgos ya se corrigieron entre el 24 y el 28 de septiembre; aquí solo queda lo que sigue
abierto, con evidencia de hoy):

- `docs/design/INVENTARIO-PARIDAD-FIGMA.md` (paridad por pantalla y variantes, 09-28)
- `docs/design/PRODUCTO-RECETAS-Y-SUBSECCIONES.md` (recetas en el formulario: **hecho** el 09-28;
  pestaña «Producción» del detalle: pendiente)
- `docs/design/AUDITORIA-EXISTENCIAS.md` y `PARIDAD-EXISTENCIAS.md` (09-23)
- `docs/design/AUDITORIA-KARDEX-LOTES.md` y `PARIDAD-KARDEX-LOTES.md` (09-22/23)
- `docs/design/AUDITORIA-CATALOGO-PRODUCCION.md` y `PARIDAD-CATALOGO-PRODUCCION.md` (09-23)
- `docs/design/AUDITORIA-CARTERA-ORDENES-COMPRA.md` (§C.3 y §I, recepción de OC, 09-22/23)
- `docs/implementacion/FACTURAS-COMPRA-CXP-PLAN.md` y `KIT-COMPARTIDO.md`
- Hallazgos F-36, F-37, F-38, F-41, F-61, F-67, F-72, F-73

Contenido:

0. Resumen ejecutivo
1. Mapa pantalla por pantalla (Figma → código → BD → backend → estado → brechas)
2. Flujos de extremo a extremo
3. Lógica duplicada y fuente única de stock y costo
4. Datos: conteos e inconsistencias
5. Plan de implementación en bloques paralelos
6. Preguntas para el dueño

---

## 0. Resumen ejecutivo

**Estado general.** El inventario tiene dos mitades muy distintas:

- **Catálogo de producto: bien.** Formulario, detalle, catálogo, importación (CSV y web),
  códigos de barras, etiquetas impresas, categorías, proveedores y etiquetas de producto están en
  Figma y en código, en 4 idiomas, con guardado por RPC transaccional (`fn_producto_guardar`,
  que ya crea variantes, precio y costo con vigencia, stock inicial con kardex y recetas).
- **Existencias y operación: rota o desconectada.** Stock, movimientos, kardex, lotes, ajustes,
  traslados, seriales, garantías, trazabilidad, producción, distribución, variantes (catálogo) y
  unidades tienen Figma completo, pero en código son pantallas viejas, en español cableado
  (0 `useTranslations` en 13 carpetas), sin permisos, sin móvil, y **escriben stock desde el
  navegador en N llamadas sin transacción**.

**Los cinco problemas más graves (con evidencia en §2 y §4):**

1. **Los traslados no mueven existencias.** `TransferenciasService.ts:260,352` llama a la RPC
   `update_stock_level`, que no existe; el respaldo filtra `stock_levels` por una columna
   `organization_id` que la tabla no tiene (`:274,369`) y escribe estados `complete`/`partial` que
   el `CHECK` rechaza (`:330,417`). Distribución usa el mismo servicio y además toma la
   organización de `localStorage` (`CrearTransferenciaDialog.tsx:72`).
2. **No hay una sola fuente de verdad del stock.** Hay **quince** funciones SQL (siete del
   núcleo, dos de reserva web y seis del GO Assistant) y **más de diez** servicios o route
   handlers TypeScript que escriben
   `stock_levels`/`stock_movements`, con **cuatro** reglas distintas de costo promedio (ponderado,
   «último costo», «no cambia» y «el precio de venta» en la reversión del folio del PMS). La RLS
   deja a cualquier miembro activo insertar, cambiar y **borrar** filas del kardex desde el
   navegador. Resultado medido: 4.899 pares producto-sucursal donde el kardex no cuadra con el
   saldo, 45.219 filas de stock sin ningún movimiento que las explique, y los consumos de
   habitación del PMS que descuentan dos veces.
3. **Ajustes no atómicos y contabilizados dos veces.** `adjustmentService.applyAdjustment`
   (`:398-580`) mezcla RPC y escrituras directas desde el navegador; 81 ajustes tienen **dos
   asientos** (el de `inventory_adjustments` y uno por cada `stock_movements` de origen
   `adjustment`).
4. **Recepción de órdenes de compra en el navegador.** `purchaseOrderService.receiveItems`
   (`:552-670`) hace ≈4+5N llamadas, suma stock con una copia en TypeScript del kardex de compra
   (`stockMovementService.incrementOnPurchase:290-404`), crea seriales uno a uno tragándose los
   errores, no captura lotes y «el stock no bloquea la recepción» (`:629-639`).
5. **Lotes, seriales y garantías a medias.** `lots` no tiene `organization_id`, sucursal ni
   unicidad; la venta solo descuenta la fila sin lote (`decrement_stock_on_sale`), no hay selector
   de lote en el POS; `serial_numbers.serial` es único **en todo el sistema**; el detalle de
   garantía no carga porque pide relaciones con nombres que no existen
   (`warrantyClaimsService.ts:175`) y hay 0 reclamos.

**Lo que sí está bien y se reutiliza:** la entrada por compra (`fn_kardex_entrada_compra_int`:
bloqueo, promedio ponderado, `product_costs` con vigencia, idempotencia), la factura de compra
(`fn_factura_compra_*`), el descuento por venta con receta (`decrement_stock_with_recipe` y el
resolutor único de recetas del 09-28), las devoluciones y anulaciones (`fn_stock_entrada*`), la
reserva web en SQL (`reserve_stock_for_web_order`), el stock inicial y masivo del producto
(`fn_producto_int_stock_inicial`, `fn_productos_ajuste_masivo_stock`), el kit (`DataTable`,
`FilterPanel`, `BulkActionBar`, `Dialogo`, `DialogoMotivo`, `SupplierPicker`,
`kit/documento/*`, `kit/receta/*`, `CodigoBarras`, `HojaEtiquetas`).

**El plan (§5)**: un bloque 0 de núcleo (una primitiva SQL única de movimiento de stock y los
contratos compartidos), siete bloques paralelos con propiedad de archivos disjunta y un bloque
final de cierre (RLS de solo lectura sobre el kardex, datos y verificación integral).

---

## 1. Mapa pantalla por pantalla

Convenciones de estado: **Igual** = hecho igual a Figma y funcionando · **Parcial** = existe y
funciona pero con brechas · **Viejo** = pantalla anterior al rediseño (sin kit, sin i18n) ·
**Roto** = la acción principal falla · **No existe**.

Brechas transversales que aplican a **todas** las filas marcadas Viejo (no se repiten en cada
fila):

- **i18n**: 0 archivos con `useTranslations` en `ajustes`, `dashboard`, `distribucion`,
  `imagenes`, `kardex`, `lotes`, `movimientos`, `produccion`, `recetas`, `reportes`, `seriales`,
  `stock`, `transferencias`, `unidades`, `variantes` (y `ordenes-compra`, de otro agente).
  Namespaces que ya existen: `productos`, `productoForm`, `productoDetalle`, `productosImportar`,
  `productosFacebook`, `categorias`, `proveedores`, `inventarioEtiquetas`, `receta`, `kit`.
- **Permisos**: ninguna ruta de Existencias ni de Producción los comprueba (Figma dibuja «sin
  permiso» en todas). Solo Categorías (`useArbolCategorias.ts:107`) y el producto
  (`fn_productos_permisos`). La RLS de `stock_levels`, `stock_movements`, `lots`,
  `inventory_adjustments`, `inventory_transfers`, `transfer_items`, `production_orders`,
  `warranty_claims` y `serial_tracking_events` es `FOR ALL` por pertenencia: cualquier miembro
  activo escribe.
- **Móvil**: sin vista de tarjetas (`ListCard`) ni hojas; Figma tiene móvil de todo.
- **Tableta**: sin frames en Figma salvo Variantes y recetas (MEDIA, no bloquea).
- **Confirmaciones nativas**: `window.confirm`/`prompt` en traslados, distribución, producción y
  conversiones.
- **Fechas**: filtros `yyyy-MM-dd`/`T23:59:59` evaluados en UTC; `formatDate` sobre columnas
  `date`; moneda `COP` cableada (`formatCurrency`).

### 1.1 Productos — catálogo, formulario, detalle, importación, códigos y etiquetas

| Pantalla / diálogo | Figma | Ruta y componentes | BD / backend | Estado | Brechas |
|---|---|---|---|---|---|
| Catálogo (lista, cuadrícula, filtros, selección, menús) | sección `166:38188` (`117:8746` listo … `120:14472`), menús `200:20850`, móvil `166:38196` | `/app/inventario/productos` → `productos/CatalogoProductos.tsx`, `ProductosTable`, `FiltrosProductos`, `bulk/AccionesMasivas.tsx` | `get_catalogo_productos`, `catalogo_productos_lote`, `buscar_productos`; masivo por `fn_productos_ajuste_masivo_stock`, `fn_producto_cambiar_estado` | Igual | Estado y Categoría masivos no expanden a variantes; `bulkDelete` es N RPC en bucle (AUDITORIA-CONTROLES C.16; sin verificar hoy) |
| Nuevo / editar / duplicar | `126:16063`, `130:20628`, `130:22941`; móvil `133:22262…22911`; recetas `957:583021` (F1–F9) | `productos/nuevo`, `[id]/editar`, `[id]/duplicar` → `productos/formulario/**` | `fn_producto_guardar` (precio y costo con vigencia, impuestos, variantes, stock inicial, recetas, idempotencia `product_save_requests`) | Igual | `SeccionPrecios.tsx` y `detalle/precios/CampoVigencia.tsx` tienen cambios sin commit de otra sesión: **no tocar** |
| Detalle — cabecera, resumen, precios, variantes, imágenes, proveedores, notas, historial | `188:53240`, `191:9368`, `199:16901`, `180:742`, `194:10370`, `196:13752` | `productos/[id]` → `productos/detalle/DetalleProducto.tsx` y subcarpetas | `fn_producto_resumen`, `fn_producto_historial`, `fn_producto_fijar_precio/costo`, `fn_producto_variante_*`, `fn_producto_imagenes_ordenar` | Igual | Pestaña **Producción** (`968:175070…180119`) no existe (ver 1.6) |
| Detalle › Inventario › Stock | `199:16902…19740` | `detalle/inventario/StockSucursales.tsx`, `stock/**` | `fn_producto_resumen`; enlaces a `/ajustes/nuevo?producto_id&type&branchId` y `/transferencias/nuevo?producto_id&origen` (los dos formularios ya leen esos parámetros; el comentario de `logicaInventario.ts:32` que dice lo contrario está desactualizado) | Parcial | El traslado al que lleva «Transferir» no mueve stock (1.4). `DesgloseVariantes.tsx:57` lee `stock_levels` directo |
| Detalle › Inventario › Kardex y Lotes | `525:64176`, `525:65157`, móvil `525:65718/65947` | `detalle/inventario/KardexProducto.tsx`, `LotesProducto.tsx` | `fn_producto_kardex`, `fn_producto_lotes` | Parcial | Sin saldo corrido paginado en servidor; lotes sin sucursal ni cantidad propia (depende de §5 B1) |
| Detalle › Inventario › Seriales | `187:49748` (generar `187:51058`, reclamo `187:51217…51424`) | `detalle/inventario/SerialesProducto.tsx`, `seriales/**` | `fn_producto_generar_seriales`, `fn_producto_serial_cambiar_estado` | Parcial | «Nuevo reclamo» usa el servicio de garantías roto (1.5) |
| Importar CSV / lote | `158:30771`, `158:31580` | `productos/importar` → `importar/ImportarProductosAsistente.tsx` y pasos | `POST /api/inventario/productos/importar/lote` → `fn_importar_productos_lote` → `fn_register_stock_entry` | Igual | Recuento D5 (importados/omitidos/fallidos/no intentados) sin verificar |
| Importar desde la web (IA) | sección `415:163965` (`426:193034…196066`, móvil `427:43933…44178`) | mismo asistente, `?origen=web`, `PasoSeleccionWeb.tsx` | `POST /api/inventario/productos/importar-web` → Edge Function `product-scraper` + `chargeAiCredits` | Parcial | Sucursal destino, impuesto y costo explícitos (PARIDAD-ORGANIZACION-COMPRAS-IMPORT D4/D5) |
| Generar códigos de barras | sección `518:273568` (`517:269277…269621`, móvil `518:273348`) | `productos/etiquetas/GenerarCodigosDialog.tsx` (catálogo `:721`, detalle `:388`) | `organization_barcode_settings` (7 filas) vía `codigosBarrasService.ts:48` | Igual | — |
| Imprimir etiquetas | sección `516:274675` (`513:262688…268063`); entradas `516:268810` | `productos/etiquetas/ImprimirEtiquetasDialog.tsx` → `window.open('/app/imprimir/etiquetas')` → `kit/HojaEtiquetas` → `EtiquetaProducto` → `CodigoBarras` | `print_jobs` (0 trabajos de etiqueta hasta hoy) | Igual | Etiquetas de lote y de lo recibido (§5 B8) |
| Alta rápida de producto | `QuickCreateDialog` del kit de Figma (`590:107156`, `592:117624`) | dentro de inventario **no existe**: `productos/nuevo/QuickCreateDialog.tsx` es un modal genérico (solo lo usa la OC para dar de alta un proveedor); «Crear ingrediente» abre el formulario completo en diálogo. El alta rápida real está en `kit/documento/FormularioRapidoProducto.tsx` (documentos de finanzas y `AgregarProductosDialog`) | `crearProductoRapido` → `fn_producto_guardar` | Parcial | Reutilizar `FormularioRapidoProducto` donde inventario necesite crear un producto al vuelo (ajuste, traslado, receta); no crear otro |
| Escáner de cámara (POS) | — | `components/ui/barcode-scanner.tsx:50-58` **simula** un código fijo a los 3 s; lo usa `pos/ProductSearch.tsx:9`, montado en `app/app/pos/page.tsx:9` | — | Roto | Fuera de inventario: se avisa al agente del POS (§5 B9) |

### 1.2 Existencias — Stock, Movimientos, Kardex, Lotes

| Pantalla / diálogo | Figma | Código | BD / backend | Estado | Brechas |
|---|---|---|---|---|---|
| Stock (listo, estados, filtros, ⋯, «Nuevo movimiento», selección) | sección `581:276750`: `582:277572` … `584:282661`, móvil `585:284626…285835` | `/app/inventario/stock` → `stock/page.tsx` (258), `StockTable` (500), `StockFilters`, `StockHeader`, `StockStats`; `lib/services/stockService.ts` | lectura directa de `stock_levels` + `products` | Viejo | «Crear transferencia» no hace nada (`StockTable.tsx:381`, la página no pasa `onCreateTransfer`); «Disponible» = `qty_on_hand` sin restar reservado (`StockTable.tsx:333`); variantes sin agrupar por padre; lote invisible; KPI cuentan filas; select de sucursal propio que duplica el del header; exportar con `toISOString` |
| Diálogos «Registrar entrada», «Registrar salida», «Definir stock mínimo» | `586:73716`, `586:73820`, `586:73911` | **No existen** | `update_product_min_stock` existe (DEFINER); entrada/salida no tienen RPC propia | No existe | Necesitan las RPC de §5 B0/B1 |
| Movimientos (bitácora) | sección `586:286574`: `586:286575` … `586:296753` | `/movimientos` → `movimientos/page.tsx` (333), `MovimientosTable` (263), `MovimientosFilters` | `stock_movements` directo | Viejo | Filtro «Origen» ofrece `waste`/`recipe_consumption` que la BD no acepta y omite 15 de 22 (`stockService.ts:506-507`, `MovimientosTable.tsx:50`); «Ver documento» con rutas 404 (`MovimientosTable.tsx:69-81`); «solo ingredientes» nunca coincide; sin lote, autor ni enlace legible |
| Kardex | sección `516:270497`: `516:270498` … `597:352293` (export `522:71579`, descuadre `522:71624`) | `/kardex` → `kardex/page.tsx` exige `?producto=` (`:33`); `kardex/*`; `lib/services/kardexService.ts` | `stock_movements` sin `.range()` (el saldo miente pasadas 1.000 filas); saldo calculado en el navegador | Viejo | No está en el menú (`lib/navigation/catalog.ts:355-361`); `waste` en `KardexTable.tsx:37`; falta `fn_kardex_saldo_corrido` y `fn_kardex_descuadres` |
| Lotes | sección `518:59165`: `518:59166` … `597:352129`; nuevo lote `522:62899`; ajustar cantidad `522:63102` | `/lotes` → `lotes/LotesPage.tsx` (909 líneas en total), `LotesService.ts` | `lots` (3 filas, org 2) | Viejo | `stock_quantity: 0` cableado (`LotesService.ts:60`); `lots` sin `organization_id`, sucursal ni UNIQUE `(product_id, lot_code)`; alta sin cantidad, sucursal ni costo |
| POS — elegir lote al vender | sección `530:65098` (`530:65099`, móvil `530:65161`, avisos `530:65210`, vencido `530:68427`) | **No existe** (ningún `lot_id` en `components/pos/**` ni `lib/pos/**`) | `decrement_stock_on_sale` solo descuenta `lot_id IS NULL` | No existe | FEFO en SQL (§5 B0) y selector en el POS (§5 B9, coordinado con el POS) |

### 1.3 Existencias — Ajustes y conteo físico

| Pantalla / diálogo | Figma | Código | BD / backend | Estado | Brechas |
|---|---|---|---|---|---|
| Ajustes (lista, ⋯, selección, confirmar aplicar/descartar) | sección `586:303290`: `586:303291`, `586:306452`, `586:306911`, `586:310249`, `586:310283`; móvil `587:305001…306460` | `/ajustes` → `ajustes/page.tsx` (402), `AjustesTable` (254) | `inventory_adjustments` (140), `adjustment_items` | Viejo | Paginación sin efecto (`page.tsx:141-153`); «Cancelar» **borra** (`adjustmentService.ts:604-608`); «Editar» a `/ajustes/[id]/editar`, **ruta inexistente** (`AjustesTable.tsx:205`, `AjusteDetalle.tsx:304`) |
| Nuevo ajuste (escritorio y móvil con escáner) | `586:312944`; móvil conteo `975:186644`; `SerialCapture` `580:276137` | `/ajustes/nuevo` → `ajustes/nuevo/NuevoAjusteForm.tsx` (955); lee `?producto_id&type&branchId` (`:87-89`) | lee `stock_levels` directo (`:422`) | Viejo | Sin lote por renglón; mismo producto dos veces; costo de solo lectura (si es 0, aplicar falla sin salida) |
| Detalle borrador / aplicado | `586:308354`, `586:309538`, móvil `587:305277` | `/ajustes/[id]` → `ajustes/detalle/AjusteDetalle.tsx` (633) | — | Viejo | «Sistema» se recalcula contra el stock actual (en un aplicado las diferencias salen 0); notas en HTML crudo |
| Aplicar | — | `adjustmentService.applyAdjustment:398-580` | entradas por `fn_register_stock_entry` (`:437`, que **sobrescribe** `avg_cost`), salidas con INSERT/UPDATE directos (`:456-491`), seriales a `defective` (`:529-544`) | Roto (no atómico) | Un fallo a mitad deja stock parcial y reaplicar duplica; doble asiento (§4) |
| Conteo físico / cíclico | solo como «ajuste por conteo» (`975:186644`) | **No existe** | `cycle_counts` y `cycle_count_lines` existen con RLS y **0 filas** | No existe | Ver pregunta P3 |

### 1.4 Existencias — Traslados y Distribución

| Pantalla / diálogo | Figma | Código | BD / backend | Estado | Brechas |
|---|---|---|---|---|---|
| Traslados (lista, ⋯ por estado, selección, confirmar despachar/cancelar/devolver) | sección `589:304083`: `589:304084` … `589:320707`; móvil `589:325777…327256` | `/transferencias` → `transferencias/TransferenciasPage.tsx` (186), `TransferenciasTable` | `inventory_transfers` (5, todos de julio de 2025, org 2) | Roto | `confirm()` (`TransferenciasPage.tsx:68,90`); estados `partial`/`complete` que la BD rechaza (`types.ts:41,54`) |
| Nuevo traslado (escritorio y móvil) | `589:322911`, móvil `975:186790` | `/transferencias/nuevo` → `nuevo/NuevaTransferenciaForm.tsx` (499); lee `?producto_id&origen` (`:63-65`) | «disponible» consulta `stock_levels` filtrando por `organization_id`, que no existe: siempre 0 | Roto | «Agotado» y «Stock insuficiente» que no bloquean; sin lote ni seriales; si fallan los ítems borra la cabecera (`TransferenciasService.ts:182`) |
| Detalle y «Recibir» | `831:535830`, `831:536248`, `589:320397`, móvil `589:326053` | `/transferencias/[id]` → `id/TransferenciaDetalle.tsx` (556) | `TransferenciasService.ts:189-430` | Roto | `update_stock_level` inexistente (`:260,352`); respaldo con `organization_id` inexistente (`:274,369`) y `Math.max(0,…)`; movimientos sin `unit_cost` ni lote; «Recibir» siempre disponible; «Creado por» muestra el UUID |
| Distribución (lista, asistente 3 pasos, recibir) | sección `606:159579`: `606:159582`, `607:163577/163711/163905`, `607:164032`, móvil `608:163816…164971` | `/distribucion` → `distribucion/DistribucionPage.tsx`, `CrearTransferenciaDialog.tsx` (288) | mismo servicio de traslados | Roto | `localStorage('currentOrgId')` (`CrearTransferenciaDialog.tsx:72`); `confirm()` (`DistribucionPage.tsx:65,77`); KPI con estados inexistentes (`DistribucionStats.tsx:17-18`); sin vínculo con la orden de producción |
| Contabilidad del traslado | — | — | `fn_auto_journal_inventory_transfer` busca `source='transfer'` (hoy se escribe `transfer_out`/`transfer_in`) y toma `avg_cost` de cualquier producto de la sucursal | Roto | Nunca asienta; `fn_notify_transfer_status` notifica estados que no existen |

### 1.5 Existencias — Seriales, Garantías, Trazabilidad

| Pantalla / diálogo | Figma | Código | BD / backend | Estado | Brechas |
|---|---|---|---|---|---|
| Seriales (lista, ⋯ vendido/en stock, selección, detalle) | sección `590:319444`: `590:319445` … `591:113637`, móvil `831:533562/535144` | `/seriales`, `/seriales/[id]` → `seriales/SerialesPage.tsx` (387), `SerialDetailPage.tsx` (541); `lib/services/serialTrackingService.ts` (1.200) | `serial_numbers` (102), `serial_tracking_events`; `CHECK` de estado ya ampliado a 11 valores | Viejo | Garantía fijada **al recibir** (`serialTrackingService.ts:190-192`): 98 unidades en bodega con garantía corriendo; `formatDate` sobre `date`; «Sucursal venta» muestra la actual; sin enlaces; diálogos «Transferir serial» y «Cambiar estado» sin frame (MEDIA) |
| Garantías (lista, ⋯, nuevo reclamo, resolver, RMA) | sección `592:329722`: `592:329723`, `592:332573`, `592:332635`, `593:121183`, RMA `973:186133`, móvil `593:122134/122402` | `/garantias`, `/garantias/[id]` → `garantias/GarantiasPage.tsx` (395), `GarantiaDetailPage.tsx` (660), `CreateClaimDialog.tsx` (441); `lib/services/warrantyClaimsService.ts` | `warranty_claims` (**0 filas**, sin `CHECK` de estado) | Roto | Relaciones `serial_numbers_current_branch_id_fkey`/`…sold_to_customer_id_fkey` **no existen** (las reales: `fk_serial_current_branch`, `fk_serial_customer`) en `warrantyClaimsService.ts:175` y `reportes/modulos/serialTrackingReports.ts:82`: el detalle no carga; RMA y respuesta del proveedor solo se guardan al resolver; el serial de reemplazo sigue `in_stock` |
| Trazabilidad (lote, serial, inicial) | sección `594:126324`: `594:126325`, `594:127772`, `594:128377`, móvil `595:133576/133838` | `/reportes/trazabilidad` → `reportes/trazabilidad/TrazabilidadPage.tsx` (396), `TrazabilidadService.ts` | lista plana de `stock_movements` | Viejo | No encadena lote → ventas → clientes ni serial → venta → garantía; busca solo en `note`/`source_id` sin escapar; CSV cortado a 1.000; depende de que haya lotes (1 movimiento con lote en toda la base) |

### 1.6 Producción — Recetas, Costo de recetas, Producción, pestaña Producción del producto

| Pantalla / diálogo | Figma | Código | BD / backend | Estado | Brechas |
|---|---|---|---|---|---|
| Recetas (lista, ⋯, filtros, selección, editar versión) | sección `598:142703`: `598:142706` … `600:149001`, editar `599:147018` | `/recetas` → `recetas/RecetasPage.tsx`, `RecipeDialog.tsx` (interfaz vieja; guarda ya por `fn_receta_guardar`) | `product_recipes` (57, 55 activas, 3 orgs), `recipe_ingredients` | Parcial | Sustituir `RecipeDialog` por `kit/receta/EditorReceta`; desactivar sin confirmación (`:138`); versiones y «Reactivar» |
| Costo de recetas | sección `601:148806`: `601:148809`, `601:152291`, `601:153198`, móvil `602:152547/153410` | `/reportes/costo-recetas` → `reportes/costo-recetas/CostoRecetasPage.tsx`, `CostoRecetasService.ts` | cálculo propio en TS (máximo `avg_cost` entre sucursales, no encuentra conversiones) | Parcial | Pasar a `fn_receta_costo` por sucursal (duplicado de lógica, §3) |
| Producción (lista, ⋯, filtros, selección, detalle, nueva, completar) | sección `603:153432`: `603:153435` … `605:159913`; nueva `604:158714`; completar `604:158843` | `/produccion` → `produccion/ProduccionPage.tsx` (8 archivos, 1.081 líneas); `lib/services/productionOrderService.ts` | `production_orders` (1, org 142, `completed` sin consumos), `production_order_consumptions` (0); `complete_production_order` | Roto | `prompt()` para la cantidad (`ProduccionPage.tsx:93`); si la RPC falla, el servicio marca `completed` sin mover stock (`productionOrderService.ts:213-221`); crear/confirmar/iniciar/cancelar son `UPDATE` directos; el terminado entra a costo 0 y sin bloqueo (`complete_production_order`) |
| Detalle de producto › Producción (Receta · Costo · Órdenes · Distribución · Unidades) | `968:175070`, `968:176149`, `968:177163`, `968:178151`, `968:179187`, `968:180119`; diálogos `970:177054…177494`; móvil `972:178990…179875`; tableta `972:180183` | **No existe** | `fn_receta_efectiva`, `fn_receta_costo`, `fn_receta_necesidades`, `fn_receta_guardar` (ya aplicadas) | No existe | Componentes `TablaSubseccion` y `HojaDetalle` (Figma `959:168129`, `959:168240`, `959:168241`) no existen en código |

### 1.7 Catálogo maestro — Categorías, Proveedores, Etiquetas, Unidades, Imágenes, Variantes

| Pantalla / diálogo | Figma | Código | BD / backend | Estado | Brechas |
|---|---|---|---|---|---|
| Categorías (árbol, detalle, formulario, mover, eliminar, importar) | sección `586:290667` (`586:290670` … `586:313786`); importar `973:186211` | `/categorias/**` → `categorias/ArbolCategorias.tsx`, `CategoryForm`, `DetalleCategoria`, `ImportCategoriesDialog` | `categorias_listado`, `categoria_conexiones`, `mover_categorias`, `eliminar_categoria`; 1.351 categorías en 28 orgs | Igual | Eliminar con selector de destino no dibujado (`586:312189`); detalle y formulario móvil (MEDIA) |
| Proveedores (lista, detalle, formulario, importar) | sección `589:311642` (`589:311645` … `590:108940`); importar `973:185225`, móvil `975:185874` | `/proveedores/**` → `proveedores/CatalogoProveedores.tsx`, `ProveedorForm`, `detalle/ProveedorDetalle.tsx`, `importar/ImportarProveedores.tsx` | `proveedores_listado`, `proveedores_resumen`, `proveedor_resumen`; 1.679 proveedores | Igual | Pestañas Órdenes, Facturas, CxP y Pagos del detalle solo con rótulo (MEDIA); código muerto `DetalleProveedor.tsx`, `FormularioProveedor.tsx` |
| Etiquetas de producto | sección `591:325136` | `/etiquetas` → `etiquetas/EtiquetasPage.tsx` | `etiquetas_producto_*`; 783 etiquetas | Igual | UNIQUE sobre `lower(name)` pendiente |
| Unidades | sección `593:333686` (`593:333689` … `595:346267`) | `/unidades` → `unidades/UnidadesPage.tsx` (solo lectura) | `units` (13 globales, RLS solo lectura) | Viejo | Figma va por delante (alta, edición, filtros); `units.organization_id` no existe (pregunta abierta en AUDITORIA-CATALOGO §13) |
| Conversiones | `594:339276`, `595:345330`, `595:345423`, `595:345517`, móvil `595:346655` | `/conversiones` → `unidades/ConversionesPage.tsx` (usa `confirm()` `:279`) | `unit_conversions` (10 globales, 0 por organización, sin UNIQUE ni `product_id`) | Viejo | `kit/receta/DialogoConversion` ya existe y debe reemplazar el diálogo propio; conversión por producto (B2 de recetas) |
| Imágenes | sección `596:345914` | `/imagenes` → `imagenes/ImagenesPage.tsx` (945) | `shared_images` (92), `product_images` (220.180) | Viejo | Ids falsos `+100000`; sin paginar; filtros que se anulan (AUDITORIA-CATALOGO; sin verificar hoy) |
| Variantes: tipos y valores | sección `969:595070` (`969:595073` … `972:610426`) | `/variantes/tipos`, `/variantes/valores` → `variantes/tipos/VariantTypesPage.tsx`, `valores/VariantValuesPage.tsx` y sus servicios | `variant_types` (129 en 21 orgs), `variant_values`, `products.variant_data`, `product_variant_relations` | Roto | 12 defectos en `INVENTARIO-PARIDAD-FIGMA.md` §2.4 (ids inventados, 5 de 8 acciones fallan o fingen éxito); `crear_tipo_variante` escribe en la org 0 |

### 1.8 Tablero, reportes y navegación

| Pantalla | Figma | Código | BD / backend | Estado | Brechas |
|---|---|---|---|---|---|
| `/app/inventario` | «Índice» `264:98918` | `app/app/inventario/page.tsx` solo redirige (`ModuleRootRedirect`); el tablero está en `inicio/sections/InventarioSection.tsx:102` | `inventoryDashboardService.ts:105-655`: 10 tablas leídas desde el navegador | Parcial | Sin RPC de resumen; `dashboard/AccesosRapidos.tsx` sin uso |
| `/reportes` | — | `reportes/ReportesPage.tsx` (tercer kardex, `:294-497`) | `ReportesService.ts` | Viejo | Kardex duplicado |
| Menú | «Cómo se conecta» `597:141264`, `609:164810` | `lib/navigation/catalog.ts:341-368` (22 entradas, todas existen) | — | Parcial | Faltan `/kardex`, `/reportes` y `/facturas-compra`; iconos de AUDITORIA-EXISTENCIAS §J (`Boxes`, `History`, `ClipboardCheck`, `Layers`, `ScanBarcode`, `GitBranch`, `CookingPot`, `Route`, `Ruler`, `Calculator`) |

**Enlaces rotos** (comprobados contra los `page.tsx`): `/ajustes/[id]/editar`
(`AjusteDetalle.tsx:304`, `AjustesTable.tsx:205`); `/inventario/compras/[id]` y
`/pos/devoluciones/[id]` (`MovimientosTable.tsx:74,77`); `/ordenes-compra/importar`
(`OrdenesCompraHeader.tsx:24`, de otro agente); `/ordenes-compra/nuevo?supplier=` existe pero
ignora el parámetro (`useAccionesProveedor.ts:15`, de otro agente).

**Código muerto** (nadie lo importa): `components/inventario/{FiltrosInventario,KPICard,RotacionProductosChart,TopSKUTable}.tsx`,
`productos/NuevoProductoForm.tsx`, `productos/facebookCatalogExport.ts` (625 líneas),
`productos/scraping/` (vacía), `proveedores/{DetalleProveedor,FormularioProveedor}.tsx`,
`dashboard/AccesosRapidos.tsx`, y los métodos vacíos `VariantValuesService.eliminarValor`,
`duplicarValor`, `reordenarValores`.

**Route handlers**: solo existen para productos (`api/inventario/productos/importar/{contexto,lote}`,
`importar-web`, `facebook`) y compras (`api/facturas-compra/**`). No hay ninguno para stock,
lotes, seriales, traslados, ajustes, producción ni garantías: todo va del navegador a las tablas.

### 1.9 Órdenes y facturas de compra (de otro agente; solo los puntos de contacto)

| Pieza | Figma | Código | Nota |
|---|---|---|---|
| Órdenes de compra: listado, detalle, nueva/editar, selectores | `445:195319`, `445:195320`, `445:195321`, `586:293332` | `app/app/inventario/ordenes-compra/**`, `components/inventario/ordenes-compra/**`, `lib/services/purchaseOrderService.ts` | **No se tocan.** El agente de compras está migrando a los diálogos del kit (Elegir proveedor, Agregar productos, ítem manual) |
| Recepción completa (variantes, seriales, lotes, confirmar) | sección `583:67712` (`583:67713` … `586:286443`) | recepción actual en `purchaseOrderService.ts:552-818` | Inventario aporta la **RPC** `fn_oc_recepcionar` (§5 B8); la UI la cablea el dueño de esos archivos |
| Facturas de compra | página 07 | `app/app/inventario/facturas-compra/**`, `components/finanzas/facturas-compra/**` | La recepción ya va por `fn_factura_compra_recepcionar` → `fn_kardex_entrada_compra_int`. `FacturasCompraService.ts` aún llama a `incrementOnPurchase` |

---

## 2. Flujos de extremo a extremo

Cada paso con su evidencia. ✔ conectado y en una transacción · ◐ funciona con defectos ·
✖ roto o no existe.

### F1. Alta de producto (con variantes, precio/costo con vigencia, stock inicial y receta)

1. ✔ Formulario → `fn_producto_guardar(p_organization_id, p_payload)` (DEFINER, permiso en
   servidor con `fn_productos_exigir_permiso`, idempotente con `product_save_requests`).
2. ✔ Precio y costo con vigencia: `fn_producto_int_fijar_precio`, `fn_producto_int_fijar_costo`.
3. ✔ Variantes: `fn_producto_int_variante_guardar` → `fn_producto_int_asegurar_atributos`.
4. ◐ Stock inicial: `fn_producto_int_stock_inicial` → `fn_register_stock_entry` (kardex
   `initial`). Defecto: `fn_register_stock_entry` **no bloquea la fila** (`SELECT … LIMIT 1` sin
   `FOR UPDATE`) y **sobrescribe `avg_cost` con el último costo** en vez de promediar. En el alta no
   importa (no hay saldo previo); en ajustes y en la importación sobre productos existentes, sí.
5. ✔ Receta (compartida o por variante) en la misma transacción (`fn_receta_int_guardar_version`).
6. ◐ Consumidores: POS, tienda y Facebook leen `variant_data`; el catálogo de tipos y valores no
   se administra (1.7).

**Importación** (CSV, lote, web): `fn_importar_productos_lote` → `fn_register_stock_entry`
(misma regla de costo). Histórico: 45.219 filas de stock con cantidad y sin ningún movimiento.

### F2. Compra: orden de compra → recepción → factura de compra → kardex y costo

1. ◐ OC: `purchaseOrderService.createPurchaseOrder` (navegador; de otro agente).
2. ✖ **Recepción de OC**: `purchaseOrderService.receiveItems:552-670` y
   `receiveItemsWithSerials:675-818`.
   - `received_quantity` por `UPDATE` directo, una llamada por línea, sin transacción.
   - Stock por `stockMovementService.incrementOnPurchase:290-404`: **copia en TypeScript** de
     `fn_kardex_entrada_compra_int` (lee, calcula el promedio en el cliente y escribe), sin
     bloqueo, sin `product_costs`, sin lote.
   - Errores de stock en `console.warn`: «no bloquea la recepción» (`:629-639`).
   - Seriales uno a uno con `serialTrackingService.createSerial`, errores solo en consola
     (`:774-787`); captura muerta si `track_serial` no se mapea (AUDITORIA-CARTERA C4/C5).
   - Sin lote ni vencimiento en ninguna parte del flujo.
3. ✔ Factura desde la OC recibida: `fn_factura_compra_desde_oc` (una RPC, idempotente, sin
   kardex porque ya entró con la OC).
4. ✔ **Factura de compra directa**: `fn_factura_compra_confirmar(p_id, p_recepcionar, …)` /
   `fn_factura_compra_recepcionar` → `fn_fc_recepcionar_int` → `fn_kardex_entrada_compra_int`
   (bloqueo por `pg_advisory_xact_lock`, `FOR UPDATE`, promedio ponderado, cierra y abre
   vigencia en `product_costs`, costo neto de descuento e IVA según responsabilidad fiscal).
   Este es el **modelo** para toda entrada.
5. ◐ Seriales de la factura: se crean al **guardar** la factura (`fn_fc_guardar_int`), no al
   recibir; quedan `in_stock` antes de que la mercancía entre.
6. ◐ Anular factura de compra: `fn_void_purchase_invoice` revierte las cantidades con su lote,
   pero no el `avg_cost` ni la vigencia de `product_costs`, ni lo que entró por la OC.
   `assistant_void_purchase_invoice` lo hace a mano con el origen `return` (que el disparador
   contabiliza como ajuste).
7. Datos: de 93 facturas de compra, **0** tienen `stock_received_at`; hay 54 movimientos
   `purchase` en 4 orgs (132, 134, 144, 2). El código viejo `FacturasCompraService.recepcionarInventario`
   y `actualizarEstadoFactura` sigue en el repositorio sin que ninguna página lo importe.

### F3. Venta (POS, factura, pedido web, mesa, folio) → descuento de stock y de receta

1. ✔ POS: `pos_checkout_v1` → `decrement_stock_with_recipe` → `fn_receta_int_expandir` +
   `decrement_stock_on_sale`; seriales en la misma RPC.
2. ✔ Factura de venta: `fn_factura_venta_emitir` → `decrement_stock_with_recipe` +
   `fn_seriales_vender`.
3. ◐ Pedido web: reserva con `stockMovementService.reserveStock:149-221` (**navegador**,
   leer-sumar-escribir sin bloqueo, sin kardex) aunque existe la RPC `reserve_stock_for_web_order`;
   confirmación → `decrementOnSale` → RPC; liberación `releaseStockReservation:226-277`
   (navegador). Resultado: 619 de 622 filas con `qty_reserved > 0` no tienen un pedido web
   pendiente que las explique (1.690 unidades; orgs 113, 135, 137, 145).
4. ◐ `decrement_stock_on_sale`: sin `FOR UPDATE` (dos ventas simultáneas pierden una resta),
   permite negativo (28 filas negativas hoy), solo la fila sin lote, costo desde
   `fn_costo_unitario_producto`.
5. ✖ PMS: `spaceConsumptionService.addConsumptions` llama a `FoliosService.addFolioItem` (que ya
   descuenta como `folio_item`) **y** después a `decrementOnSale('room_consumption')`
   (`spaceConsumptionService.ts:227-255`): cada consumo de habitación sale dos veces. Borrar el
   ítem del folio lo devuelve con `incrementOnPurchase` al precio de venta (`foliosService.ts:373`).
6. ◐ Reembolso web: `api/web-orders/[id]/refund/route.ts:244-280` escribe stock y kardex a mano
   (0 casos hasta hoy).
7. ✔ Devolución (`procesar_devolucion`), anulación POS (`pos_anular_venta_v1`) →
   `fn_stock_entrada_devolucion`; nota crédito → `fn_stock_entrada`; anular factura →
   `fn_stock_entrada`. Estas entradas **no recalculan** `avg_cost` (correcto para devoluciones
   al mismo costo; no hay una regla explícita).
8. ✖ Lote al vender: no existe (ni FEFO en SQL ni selector en el POS).

### F4. Ajuste de inventario (y conteo físico)

1. ◐ Crear borrador: `adjustmentService.createAdjustment` (navegador, dos inserts).
2. ✖ Aplicar: `applyAdjustment:398-580`, no atómico ni idempotente (ver 1.3).
3. ✖ Contabilidad: doble asiento. `fn_auto_journal_inventory_adjustment` (al pasar a `posted`)
   **y** `fn_auto_journal_stock_movement` (por cada movimiento `adjustment`, que no está en su
   lista de exclusión). 81 ajustes en 7 orgs (115, 129, 132, 134, 143, 144, 199) tienen los dos.
4. ✖ Conteo físico: `cycle_counts`/`cycle_count_lines` sin interfaz (0 filas).
5. ◐ `assistant_create_adjustment` (GO Assistant) es una **cuarta** implementación: guarda la
   diferencia con estado `posted`, invocador, ejecutable por `anon`.

### F5. Traslado entre sucursales

✖ Roto de punta a punta (1.4). Datos: 5 traslados de julio de 2025 (org 2): 2 `pending`,
1 `in_transit`, 2 `received` con `received_qty = 0`; 8 salidas `transfer` y 2 entradas.
`assistant_create_transfer` escribe `stock_levels` **sin kardex**.

### F6. Lotes y vencimientos

✖ Solo existen como tabla: 3 lotes (org 2), 0 filas de stock con lote, 1 movimiento con lote.
Ninguna entrada captura lote (OC, factura, ajuste en el formulario, traslado), la venta no lo
descuenta y el POS no lo elige. La factura de compra ya propaga `lot_id` si viene en la línea
(`fn_kardex_entrada_compra_int`), pero ninguna interfaz lo envía.

### F7. Seriales y garantías

1. ◐ Alta: OC (navegador, errores tragados), factura de compra (RPC al guardar), generar desde el
   producto (`fn_producto_generar_seriales`), ajuste (navegador).
2. ✔ Venta: POS y factura marcan `sold` (`fn_seriales_vender`, `pos_checkout_v1`).
3. ✖ Garantía: arranca al recibir, no al vender (93 de 93 seriales en stock de la org 133 y 5 de
   la 143 ya tienen `warranty_end`).
4. ✖ Reclamos: el detalle no carga (relaciones con nombre equivocado); 0 reclamos.
5. ◐ Unicidad: `serial_numbers_serial_key UNIQUE (serial)` global entre organizaciones.
6. ◐ Cuadre serial ↔ stock: producto 78 (org 2) con stock 30 y 1 serial en stock; producto
   62772 (org 143) con stock 0 y 5 seriales en stock.

### F8. Producción: orden → consumo de ingredientes → producto terminado y costo

1. ✖ Crear, confirmar, iniciar, cancelar: `UPDATE` directos desde el navegador
   (`productionOrderService.ts:135-200`), sin permiso.
2. ◐ Completar: `complete_production_order` (invocador, sin `anon`) con el resolutor único de
   recetas. Defectos: sin `FOR UPDATE` en las filas de stock, el terminado entra a costo 0 y no
   actualiza `avg_cost`, sin comprobar pertenencia (depende de la RLS). Si la RPC falla, el
   servicio igual marca `completed` (`:213-221`).
3. ✖ `prompt()` para la cantidad producida.
4. Datos: 1 orden en toda la base (org 142), `completed` y **sin consumos**: entró por el
   respaldo que no mueve stock.

### F9. Distribución (producción → sucursales)

✖ Usa el servicio de traslados (roto) y toma la organización de `localStorage`. No hay
`inventory_transfers.production_order_id`.

### F10. Etiquetas y códigos de barras

✔ Generar códigos (`GenerarCodigosDialog` + `organization_barcode_settings`), imprimir etiquetas
(`ImprimirEtiquetasDialog` → `/app/imprimir/etiquetas` → `HojaEtiquetas`), campo de código en
producto y variante. ◐ El escáner de cámara del POS es simulado.

### F11. Contabilidad del inventario (lo que sale de cada movimiento)

| Origen | Asiento | Estado |
|---|---|---|
| `initial`, `purchase*`, `purchase_void` | excluidos en `fn_auto_journal_stock_movement`; la compra la asienta la factura | ✔ |
| `sale`, `web_sale`, `invoice_sale`, `mesa_sale`, `folio_item`, `room_consumption` | `fn_auto_journal_stock_movement` con la regla `inventory/adjusted` (costo de venta) | ◐ 801 salidas `sale` sin `unit_cost` no asientan |
| `adjustment` | **dos** asientos (movimiento + documento de ajuste) | ✖ |
| `transfer_out`/`transfer_in` | excluidos del movimiento; `fn_auto_journal_inventory_transfer` busca `transfer` | ✖ nunca asienta |
| `production` | asiento de «ajuste» por cada consumo y por el terminado (a costo 0) | ✖ |

### F12. Cómo se conectan las pantallas (lo que el usuario debe poder recorrer)

Producto → Stock por sucursal → Kardex del producto → documento de cada movimiento (venta,
factura, OC, ajuste, traslado, orden de producción) y de vuelta; Stock → Registrar entrada /
salida / trasladar / ajuste por conteo con el producto y la sucursal ya elegidos; Lote → ventas y
clientes (trazabilidad); Serial → venta → cliente → reclamo; Receta → orden de producción →
distribución → recepción. Hoy **ninguna venta, factura ni compra enlaza a sus movimientos**,
`getSourceRoute` tiene rutas 404, y el kardex solo se abre desde el producto.

---

## 3. Lógica duplicada y fuente única de stock y costo (regla dura 7)

### 3.1 Quién escribe `stock_levels` / `stock_movements` hoy

| # | Escritor | Dónde | Bloqueo | Kardex | Regla de `avg_cost` | Lote |
|---|---|---|---|---|---|---|
| 1 | `fn_kardex_entrada_compra_int` | SQL (compras) | advisory + `FOR UPDATE` | sí | **ponderado** + `product_costs` | sí |
| 2 | `fn_register_stock_entry` | SQL (alta, importación, ajustes +) | no | sí | **último costo** | no |
| 3 | `fn_stock_entrada` / `fn_stock_entrada_devolucion` | SQL (NC, anulaciones, devoluciones) | `FOR UPDATE` | sí | **no cambia** | no |
| 4 | `decrement_stock_on_sale` (vía `decrement_stock_with_recipe`) | SQL (todas las ventas) | no | sí | — (costo de `fn_costo_unitario_producto`) | solo sin lote |
| 5 | `fn_producto_int_ajustar_stock` | SQL (stock masivo, variantes) | `FOR UPDATE` | sí | no cambia | no |
| 6 | `complete_production_order` | SQL | no | sí | terminado a costo 0 | no |
| 7 | `reserve_stock_for_web_order` / `release_stock_for_order` | SQL | — | no (solo reserva) | — | no |
| 8 | `assistant_create_adjustment`, `assistant_create_transfer`, `assistant_register_sale`, `assistant_bulk_load_products`, `assistant_create_product` (+ `assistant_void_purchase_invoice`, DEFINER, que revierte con origen `return`) | SQL (GO Assistant), los cinco primeros **invocador, 4 de 5 ejecutables por `anon`** | no | 2 de 5 | propia | no |
| 9 | `stockMovementService.incrementOnPurchase` | TS navegador (OC, `FacturasCompraService`, `foliosService`) | no | sí | ponderado **en TS** | no |
| 10 | `stockMovementService.reserveStock` / `releaseStockReservation` | TS navegador (web, CRM) | no | no | — | no |
| 11 | `adjustmentService.applyAdjustment` | TS navegador | no | sí | mixto | parcial |
| 12 | `TransferenciasService` (traslados y distribución) | TS navegador | no | sí (sin costo) | — | no |
| 13 | `productionOrderService` (estados) | TS navegador | no | no | — | — |
| 14 | `webOrderServerConfirmation.ts:478-522, 547, 671` (service role) y `webOrderConfirmationService.ts:98-116` (navegador): la misma confirmación copiada dos veces (una tercera, `webOrdersService.convertToSale`, sin uso) | TS | no | vía RPC de venta | — | no; libera la reserva **sin** expandir receta en la versión de servidor |
| 15 | `app/api/web-orders/[id]/refund/route.ts:244-280` | TS servidor (service role) | no | sí (`web_refund`, `unit_cost` 0) | — | no |
| 16 | `foliosService.ts:314, 373` y `spaceConsumptionService.ts:227+250` (PMS) | TS navegador | no | sí | la reversión del folio entra con el **precio de venta** como costo (corrompe `avg_cost`) | no; los consumos de habitación **descuentan dos veces** (`folio_item` + `room_consumption`) |
| 17 | `aiActionsService.ts:578-585` y `ai/assistant/undoService.ts:261-264, 334` | TS servidor (sesión) | no | **no** | — | fija la existencia a un valor absoluto sin kardex; el «deshacer» borra `stock_levels`, `product_costs` y `product_prices` |
| 18 | `productos/bulk/bulkService.ts:291-330, 391-406, 637-653, 786-800, 869-883` | TS navegador | no | — | escribe `product_costs`/`product_prices` y fija `stock_levels.avg_cost = costo` en todas las sucursales | — |

Además, la RLS `FOR ALL` deja que cualquier código del navegador haga lo mismo. Y en sentido
contrario: `product_costs` y `product_prices` solo tienen políticas de `INSERT` y `SELECT`, así que
el `UPDATE effective_to` que hacen `bulkService` y otros desde el navegador **no cierra la
vigencia anterior** (afecta 0 filas sin error): hoy hay 59 productos con más de un costo vigente y
**16.359 productos con más de un precio vigente** (§4, D19–D20). Las RPC `fn_producto_fijar_costo`
y `fn_producto_fijar_precio` ya hacen esto bien y deben ser el único camino.

### 3.2 Unificación propuesta

**Una primitiva interna** (no invocable desde el navegador) por la que pasa todo:

```text
fn_inv_int_mover(p_org, p_branch, p_product, p_lot, p_direction, p_qty, p_unit_cost,
                 p_source, p_source_id, p_note, p_user, p_opciones jsonb) → movement_id
```

- Valida producto y sucursal de la organización; salta `track_stock = false` con motivo.
- `SELECT … FOR UPDATE` de la fila `(product, branch, lot)`; la crea si no existe (sin
  `onConflict`, por la trampa del UNIQUE con `lot_id` NULL).
- Entradas: promedio ponderado cuando `p_opciones.recalcular_costo` (compra, producción, entrada
  manual); costo del origen en `transfer_in`; sin recalcular en devoluciones.
- Salidas: `unit_cost` = `avg_cost` de la fila si no llega; FEFO cuando el producto lleva lotes y
  no se indica uno; política de negativos (hoy se permiten; ver P5).
- Escribe `stock_movements` con `created_by` y `avg_cost_after` (columnas nuevas, `NULL`-ables).

Se **conservan las firmas** de las funciones públicas y se reescriben por dentro para llamar a la
primitiva: `decrement_stock_on_sale`, `fn_stock_entrada`, `fn_stock_entrada_devolucion`,
`fn_register_stock_entry`, `fn_kardex_entrada_compra_int`, `fn_producto_int_ajustar_stock`,
`complete_production_order`. Así POS, facturas, pedidos web, PMS y compras no cambian de código.

**RPC públicas nuevas** (DEFINER, `fn_assert_acceso_org` + permiso en servidor, `REVOKE … FROM
anon, public`), cada una dueña de un documento:

| RPC | Sustituye a | Bloque |
|---|---|---|
| `fn_stock_registrar_movimiento(org, branch, product, lot, direccion, qty, costo, motivo)` | diálogos «Registrar entrada/salida» (no existen) | B1 |
| `fn_lote_guardar`, `fn_lote_ajustar` | `LotesService` | B1 |
| `fn_ajuste_guardar`, `fn_ajuste_aplicar` (idempotente), `fn_ajuste_descartar` | #11 y `assistant_create_adjustment` | B2 |
| `fn_traslado_guardar`, `fn_traslado_despachar`, `fn_traslado_recibir`, `fn_traslado_cancelar` | #12, `update_stock_level` inexistente y `assistant_create_transfer` | B3 |
| `fn_produccion_guardar`, `fn_produccion_cambiar_estado`, `complete_production_order` v2 | #13 y el respaldo silencioso | B5 |
| `fn_oc_recepcionar(po_uuid, lineas jsonb, clave_idempotencia)` | #9 en la OC | B8 |
| `reserve_stock_for_web_order` / `release_stock_for_order` (ya existen; se les añade la expansión de receta con `fn_receta_int_expandir`) | #10 | B0 |
| `fn_pedido_web_confirmar_stock(p_order_id)` | #14 | B9 |
| `fn_stock_entrada` / `fn_stock_entrada_devolucion` (ya existen) | #15 y la reversión del folio de #16 | B9 |
| `fn_producto_fijar_costo` / `fn_producto_fijar_precio` (ya existen) | #18 | B7 |
| `fn_producto_int_ajustar_stock` (ya existe) | #17 | B9 |

**Costo**: `fn_receta_costo` es la única fuente de costo de receta (el reporte
`CostoRecetasService.ts` deja de calcular). `fn_costo_unitario_producto` es la única fuente del
costo de una salida.

**Cierre**: cuando todos los escritores pasen por RPC, la RLS de `stock_levels`,
`stock_movements`, `lots`, `serial_numbers`, `serial_tracking_events`, `inventory_adjustments`,
`adjustment_items`, `inventory_transfers`, `transfer_items`, `production_orders` y
`production_order_consumptions` queda en **solo lectura** para `authenticated` (§5 B10), y un
guardarraíl en `src/__tests__/guardrails.test.ts` impide volver a escribir esas tablas desde
`src/**`.

### 3.3 Otros duplicados

- Tres kardex: `/kardex`, `/movimientos` y la pestaña de `ReportesPage.tsx:294-497` (más
  `fn_producto_kardex` en el detalle, que es el bueno).
- Dos mapas de orígenes: `lib/inventario/origenesMovimientoStock.ts` (el que vigila el
  guardarraíl 23) y los mapas locales de `KardexTable.tsx:37` y `MovimientosTable.tsx:50`.
- Receta leída en cinco sitios: ya unificado el 09-28 salvo `CostoRecetasService.ts`.
- Variantes: `variant_data`, `variant_types/values` y `product_variant_relations` (tres fuentes;
  ver `INVENTARIO-PARIDAD-FIGMA.md` §2).
- Tablero: `inventoryDashboardService.ts` calcula en el navegador lo que deberían ser agregados
  SQL.

---

## 4. Datos (2026-09-28, solo lectura)

### 4.1 Volumen por organización (las que tienen ≥ 20 productos o movimientos)

| Org | Productos | Variantes | Filas de stock | Negativas | Movimientos | Ajustes | Traslados | Seriales | Lotes | Órd. prod. | OC | FC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 137 | 2.636 | 21.142 | 23.644 | 0 | 7.413 | — | — | — | — | — | — | — |
| 197 | 2.122 | 11.646 | 8.186 | 0 | — | — | — | — | — | — | — | — |
| 135 | 4.368 | 1.607 | 6.088 | 0 | 542 | — | — | — | — | — | — | — |
| 145 | 4.368 | 1.607 | 6.088 | 0 | 230 | — | — | — | — | — | — | — |
| 198 | 542 | 2.198 | 2.288 | 0 | — | — | — | — | — | — | — | — |
| 139 | 349 | 2.254 | 1.697 | 0 | — | — | — | — | — | — | — | — |
| 132 | 1.359 | 1.033 | 3.252 | 11 | 585 | 24 | — | — | — | — | — | 2 |
| 134 | 958 | 34 | 983 | 1 | 152 | 5 | — | — | — | — | — | 6 |
| 144 | 290 | 490 | 498 | 11 | 3.299 | 57 | — | — | — | — | — | 62 |
| 128 | 423 | 303 | 688 | 0 | — | — | — | — | — | — | — | — |
| 199 | 439 | 0 | 442 | 0 | 441 | 1 | — | — | — | — | — | — |
| 129 | 359 | 40 | 386 | 2 | 433 | 14 | — | — | — | — | — | — |
| 113 | 257 | 0 | 258 | 0 | 564 | 7 | — | — | — | — | — | 7 |
| 142 | 62 | 16 | 152 | 2 | 837 | 21 | — | — | — | 1 | — | — |
| 133 | 88 | 80 | 12 | 0 | 9 | 1 | — | 95 | — | — | — | — |
| 2 | 22 | 14 | 78 | 0 | 50 | — | 5 | 2 | 3 | — | 30 | 5 |
| 143 | 2 | 1 | 2 | 0 | 3 | 1 | — | 5 | — | — | — | — |

Productos con receta: orgs 134 (6 compuestos), 144 (26), 142 (27); 55 recetas activas. Ninguna
organización usa conteos (`cycle_counts` = 0) ni reclamos de garantía (0).

**Prioridad que sugieren los datos:** el grueso es catálogo y stock por variantes (orgs 137, 197,
135, 145, 198, 139); la operación diaria de ajustes y ventas con receta está en 144, 142, 132,
129; traslados, lotes y OC solo en la org 2 (pruebas). Arreglar la **fuente única** y el
**listado de stock paginado y agrupado por padre** beneficia a todos; traslados, lotes y
producción son funcionalidad que hoy nadie puede usar.

### 4.2 Inconsistencias (solo reportadas; nada se corrigió)

| # | Qué | Cuántas | Orgs | Consulta |
|---|---|---|---|---|
| D1 | Filas de stock con `qty_on_hand < 0` | 28 | 132, 144, 142, 129, 134, 112… | `stock_levels where qty_on_hand < 0` |
| D2 | Pares producto-sucursal cuyo saldo no coincide con la suma del kardex | 4.899 | 16 orgs | `stock_levels` vs `sum(in − out)` por `(product, branch)` sin lote |
| D3 | Filas con cantidad y **ningún** movimiento | 45.219 | 19 orgs | importaciones y escrituras sin kardex anteriores a F-38 |
| D4 | **Padres con variantes que tienen stock propio** (≠ 0) | 8.630 | 17 orgs | en 137, 197, 198, 139 casi nunca coincide con la suma de sus hijos (2.546 de 2.590 en la 137); en 135/145 coincide en ≈ 95 % |
| D5 | Filas con stock > 0 y `avg_cost = 0` y sin costo vigente en `product_costs` | 50.000+ (137: 21.544; 197: 8.186; 135/145: 6.050 c/u; 198: 2.288; 139: 1.697) | 20 orgs | F-36 |
| D6 | Stock de productos `deleted` con cantidad | 2.047 | — | `products.status = 'deleted'` |
| D7 | Stock de productos con `track_stock = false` con cantidad | 47 | — | — |
| D8 | Reservas sin pedido web pendiente | 619 filas / 1.690 uds | 113, 135, 137, 145 | `qty_reserved > 0` sin `web_orders.status = 'pending'` (la 113 puede ser reserva de CRM) |
| D9 | Ajustes con doble asiento | 81 | 115, 129, 132, 134, 143, 144, 199 | `journal_entries` `inventory_adjustment` + `stock_movements` del mismo ajuste |
| D10 | Ajustes `posted` sin movimientos | 3 | 120 | — |
| D11 | Movimientos `adjustment` sin `source_id` | 39 | 115, 120, 132, 137, 144 | — |
| D12 | Salidas de venta sin costo | 801 (`sale`) | 9 orgs | `unit_cost` 0 o nulo |
| D13 | Traslados abiertos desde julio de 2025 y recibidos sin cantidad | 3 abiertos, 2 `received` con `received_qty = 0` | 2 | — |
| D14 | Seriales en stock con garantía ya corriendo | 98 | 133, 143 | `status = 'in_stock' and warranty_end is not null` |
| D15 | Seriales que no cuadran con el stock | 2 productos | 2, 143 | producto 78 (30 vs 1), 62772 (0 vs 5) |
| D16 | Orden de producción completada sin consumos | 1 | 142 | — |
| D17 | Facturas de compra sin `stock_received_at` | 93 de 93 | 8 orgs | incluidas 60 en estado `received` |
| D18 | OC recibidas sin factura ni CxP | 7 `received`, 1 `partial` | 2, 120, 130 | FACTURAS-COMPRA-CXP-PLAN §5.2 |
| D19 | Productos con **más de un costo vigente** (`product_costs.effective_to is null`) | 59 | — | el `UPDATE` de cierre desde el navegador no tiene política RLS |
| D20 | Productos con **más de un precio vigente** (`product_prices.effective_to is null`) | 16.359 | — | ídem; cada lector elige «el último» por su cuenta |

Sin duplicados en `stock_levels` sin lote (el índice parcial lo impide), sin seriales repetidos
por organización y sin stock en sucursales de otra organización.

---

## 5. Plan de implementación en bloques paralelos

### 5.0 Reglas para todos los bloques

- Todo sobre `main`, sin ramas; `git status -sb` y `git diff --cached` antes de cada commit; commit
  con índice privado solo de los archivos del bloque (el árbol es compartido).
- Migraciones solo por el MCP, cada una con su `.sql` en `supabase/migrations/` y su rollback en
  `supabase/rollbacks/` en el mismo commit; aditivas; DEFINER con `fn_assert_acceso_org`, permiso
  en servidor y `REVOKE … FROM anon, public` en la misma migración. Prefijo de nombre por bloque:
  `…_inv_b<N>_<tema>.sql`.
- Verificar tablas y columnas con el MCP **antes** de cada consulta.
- UI nueva en es/en/fr/pt con next-intl, **namespace propio por bloque** (tabla 5.9); editar
  `messages/*.json` solo añadiendo tu namespace.
- Kit primero: `DataTable`, `ListCard`, `FilterPanel`, `FilterChips`, `BulkActionBar`,
  `RowActionsMenu`, `ActionSheet`, `PanelAdaptable`, `Dialogo`, `DialogoMotivo`, `EmptyState`,
  `StatusBadge`, `KpiStrip`, `PageHeader`, `TabBar`, `CampoNumero`, `CampoFecha`,
  `SupplierPicker`, `kit/documento/*`, `kit/receta/*`. **No** crear un segundo buscador de
  productos ni un segundo alta rápida: se reutilizan `kit/documento/AgregarProductosDialog.tsx`
  («Agregar productos», con filtros; Figma `586:293333…293829`) y
  `kit/documento/FormularioRapidoProducto.tsx` (alta rápida por `fn_producto_guardar`), que son
  del agente de compras y facturas: se **importan**, no se editan. Si a inventario le falta una
  prop (p. ej. mostrar existencias de una sucursal o filtrar por `track_lots`), se pide a ese
  agente o se añade en B10 cuando haya terminado.
- Fechas por `useFormatDate`/`formatDateInTz`/`formatPlainDate`; día por `todayInTz`; moneda por
  `useMonedaOrganizacion`.
- Permisos: la UI oculta o deshabilita con `fn_inventario_permisos`; la RPC vuelve a exigir.
- Verificación de cierre de cada bloque: `npx jest`, `npx tsc --noEmit -p tsconfig.json` (con más
  memoria: un OOM da un falso «0 errores»), `npx next build`, y la prueba de aceptación del bloque.

**No se tocan** (de otros agentes): `app/app/inventario/ordenes-compra/**`,
`components/inventario/ordenes-compra/**`, `lib/services/purchaseOrderService.ts`,
`app/app/inventario/facturas-compra/**`, `components/finanzas/facturas-compra/**`,
`components/kit/documento/**`, `components/pos/**`, `lib/pos/**`, `app/app/pos/**`,
`productos/formulario/secciones/SeccionPrecios.tsx`, `productos/detalle/precios/CampoVigencia.tsx`.

### 5.1 Bloque 0 — Núcleo de existencias (primero, secuencial)

**Objetivo:** una sola forma de mover stock y los contratos que usan los demás bloques.

Propiedad:
- `supabase/migrations/*_inv_b0_*.sql` y sus rollbacks.
- `src/lib/inventario/**` (salvo `importacion/**`): `nucleo/tipos.ts` (contratos TS de las RPC de
  §3.2), `permisos.ts` + `usePermisosInventario.ts`, `origenesMovimientoStock.ts` (ya existe; pasa
  a ser el único mapa, con etiqueta y tono), `documentoMovimiento.ts`.
- `src/lib/services/stockMovementService.ts` (queda como fachada de RPC; sus llamadores externos
  no cambian).
- `src/components/kit/inventario/**` (nuevo): `BadgeOrigenMovimiento` (22 orígenes; Figma
  `530:65022`), `EnlaceDocumento`, `LotPicker` (popover · hoja · en línea), `BadgeVencimiento`,
  `SaldoCorridoCell`, `EstadoSinPermiso` si el `EmptyState` del kit no lo cubre.
- `messages/*.json` → namespace `inventario` (común: orígenes, estados, permisos, errores de RPC).
- `src/__tests__/db/inventarioNucleo.test.ts` y el guardarraíl nuevo en
  `src/__tests__/guardrails.test.ts` (solo este bloque y B10 editan ese archivo).

Migraciones:
1. `stock_movements`: `created_by uuid default auth.uid()`, `avg_cost_after numeric`, índice
   `(organization_id, product_id, branch_id, created_at, id)` `concurrently`.
2. `lots`: `organization_id` (NULL-able + backfill desde el producto), `branch_id`,
   `notes`, `created_by`; UNIQUE `(organization_id, product_id, lot_code)` (0 choques hoy).
   `products.track_lots boolean not null default false`.
3. `fn_inv_int_mover` (§3.2) y reescritura por dentro, con la misma firma, de
   `decrement_stock_on_sale` (con `FOR UPDATE` y FEFO si `track_lots`), `fn_stock_entrada`,
   `fn_stock_entrada_devolucion`, `fn_register_stock_entry` (promedio ponderado), 
   `fn_kardex_entrada_compra_int` y `fn_producto_int_ajustar_stock`.
4. `fn_inventario_permisos(p_org)` → `{ ver, ajustar, trasladar, recibir, producir, garantias,
   costos, editar_catalogo }` y `fn_inventario_exigir_permiso(p_org, p_codigos text[])`, sobre
   los permisos que ya existen (`inventory.view/create/edit/delete/adjust/transfer`,
   `inventory.costs.view`, `inventory_management`, `product_management`) + dueño de la
   organización. Sin permisos nuevos salvo que el dueño lo pida (P6).
5. `fn_documento_de_movimiento(p_source, p_source_id)` (número legible, tipo y ruta) para
   `EnlaceDocumento`.
6. `fn_auto_journal_stock_movement`: excluir `adjustment` (el asiento lo hace el documento) — solo
   si el dueño aprueba P4.
7. `reserve_stock_for_web_order` / `release_stock_for_order` expanden la receta (hoy no; la
   versión TS sí) y registran la reserva por pedido para poder liberarla exacta;
   `stockMovementService.reserveStock/releaseStockReservation` pasan a llamarlas.
   `incrementOnPurchase` pasa a `fn_kardex_entrada_compra`, que solo admite orígenes de compra: la
   reversión del folio (`folio_item_reversal`) tiene que haber pasado antes a
   `fn_stock_entrada_devolucion` (B9) o esa ruta empieza a fallar. Orden: B9-PMS antes que este
   punto, o este punto deja un camino temporal para `folio_item_reversal`.

Aceptación (en la base, dentro de `begin … rollback`, y como prueba de contrato en jest):
- Dos `decrement_stock_on_sale` concurrentes sobre la misma fila dejan el saldo exacto.
- Una entrada de 10 a 1.000 sobre 10 a 500 deja `avg_cost` 750 y `avg_cost_after` 750.
- Venta de un producto con 2 lotes descuenta primero el que vence antes.
- Las mismas ventas, devoluciones, NC y recepciones de factura dan el mismo saldo y costo que
  antes (se reutiliza `recepcionKardex.test.ts` contra la RPC).
- `fn_inventario_permisos` de un cajero sin `inventory.adjust` devuelve `ajustar = false`.

Tamaño: **L** (3–4 días-agente). Dependencias: ninguna. Bloquea el backend de B1, B2, B3, B5, B8,
B9 (la UI de esos bloques puede empezar en paralelo contra los tipos de `nucleo/tipos.ts`).

### 5.2 Bloque 1 — Stock, Movimientos, Kardex y Lotes

Propiedad:
- `app/app/inventario/{stock,movimientos,kardex,lotes}/**`
- `components/inventario/{stock,movimientos,kardex,lotes}/**`
- `components/inventario/productos/detalle/inventario/{StockSucursales.tsx,KardexProducto.tsx,LotesProducto.tsx,stock/**}`
- `lib/services/{stockService,kardexService}.ts`
- `components/inventario/reportes/ReportesPage.tsx`, `ReportesService.ts`, `ReportesPagination.tsx`
  (se retira el tercer kardex)
- namespaces `inventarioStock`, `inventarioMovimientos`, `inventarioKardex`, `inventarioLotes`

Migraciones: `fn_stock_listado` (paginado en servidor, agrupado por padre, «Disponible» =
existencia − reservado, lote, filtros, KPI reales), `fn_movimientos_listado`,
`fn_kardex_saldo_corrido`, `fn_kardex_descuadres`, `fn_stock_registrar_movimiento`,
`fn_lote_guardar`, `fn_lote_ajustar`, `fn_lote_eliminar` (solo sin stock ni movimientos);
reutiliza `update_product_min_stock`.

Pantallas: Stock `581:276750` completo (incluidos «Registrar entrada/salida/mínimo» y «Nuevo
movimiento»), Movimientos `586:286574`, Kardex `516:270497` (listado con buscador de producto,
sin exigir `?producto=`), Lotes `518:59165`, sub-pestañas Kardex y Lotes del producto
(`525:64175`). Escritorio y móvil, estados vacío/sin resultados/error/sin permiso/sin sucursal.

Aceptación: desde Stock, «Registrar entrada» de 5 uds a costo X → aparece en Movimientos con
`BadgeOrigenMovimiento` y en el Kardex con el saldo corrido y el nuevo costo promedio; «Crear
transferencia» abre B3 con producto y sucursal elegidos; un lote nuevo con 12 uds aparece en
Stock y en el detalle del producto; `fn_kardex_descuadres` devuelve los 4.899 pares de D2 (la
pantalla los muestra, no los corrige).

Tamaño: **XL** (5 días-agente). Dependencias: B0.

### 5.3 Bloque 2 — Ajustes y ajuste por conteo

Propiedad: `app/app/inventario/ajustes/**` (incluida la ruta nueva `[id]/editar`),
`components/inventario/ajustes/**`, `lib/services/adjustmentService.ts`, namespace
`inventarioAjustes`.

Migraciones: `inventory_adjustments.code`, `posted_at`, `posted_by`; `adjustment_items.system_qty`,
`difference`; `fn_ajuste_guardar`, `fn_ajuste_aplicar` (idempotente, congela «sistema al
contar», entradas y salidas por `fn_inv_int_mover`, seriales por
`fn_producto_serial_cambiar_estado`), `fn_ajuste_descartar`; disparador que impide `UPDATE` y
`DELETE` de ajustes `posted`. `assistant_create_adjustment` delega en `fn_ajuste_*` (coordinado
con B9).

Pantallas: `586:303290` completa, nuevo ajuste escritorio `586:312944` y móvil con escáner
`975:186644` (con `LotPicker` y `SerialCapture`), detalle borrador y aplicado, editar borrador.
Conteo físico = ajuste de tipo «conteo» (P3).

Aceptación: ajuste de 3 renglones (uno con lote, uno con 2 seriales) → aplicar dos veces seguidas
genera **un** juego de movimientos; el detalle aplicado muestra «sistema al contar» congelado y
enlaza a los movimientos; un solo asiento por ajuste (si P4 se aprueba).

Tamaño: **L**. Dependencias: B0.

### 5.4 Bloque 3 — Traslados y distribución

Propiedad: `app/app/inventario/{transferencias,distribucion}/**`,
`components/inventario/{transferencias,distribucion}/**`, namespaces `inventarioTraslados`,
`inventarioDistribucion`.

Migraciones: `inventory_transfers.code`, `shipped_at`, `shipped_by`, `received_at`,
`received_by`, `production_order_id` (FK NULL-able); `transfer_items.unit_cost`,
`difference_reason`; `fn_traslado_guardar`, `fn_traslado_despachar` (sale del origen con
`transfer_out` al costo promedio del origen, lote y seriales a `in_transit`),
`fn_traslado_recibir` (entra con `transfer_in` al mismo costo, recibido ≤ enviado, diferencia con
motivo), `fn_traslado_cancelar`, `fn_traslado_devolver`; `fn_auto_journal_inventory_transfer` con
los orígenes reales y el costo del producto; `fn_notify_transfer_status` con los estados reales;
`assistant_create_transfer` delega (coordinado con B9). Distribución = varios traslados desde un
origen con `production_order_id` opcional.

Pantallas: `589:304083` completa (con «Recibir» `589:320397` y los tres `ConfirmDialog`), nuevo
traslado escritorio y móvil (`975:186790`) conservando la lectura de `?producto_id&origen`,
detalle con seguimiento, Distribución `606:159579` con su asistente de 3 pasos.

Aceptación: traslado de 10 uds de A a B → despachar baja A en 10 y deja 10 en tránsito; recibir 8
con «faltante en el transporte» sube B en 8, deja la diferencia registrada, el kardex de A y B
enlaza al traslado y hay **un** asiento entre sucursales (si tienen subcuentas distintas).
Recibir dos veces no duplica. Los 5 traslados viejos de la org 2 se muestran con su aviso (no se
tocan sin P7).

Tamaño: **L**. Dependencias: B0.

### 5.5 Bloque 4 — Seriales, garantías y trazabilidad

Propiedad: `app/app/inventario/{seriales,garantias,reportes/trazabilidad}/**`,
`components/inventario/{seriales,garantias}/**`,
`components/inventario/reportes/trazabilidad/**`,
`components/inventario/productos/detalle/inventario/{SerialesProducto.tsx,seriales/**}`,
`lib/services/{serialTrackingService,warrantyClaimsService}.ts`,
`lib/services/reportes/modulos/serialTrackingReports.ts`, namespaces `inventarioSeriales`,
`inventarioGarantias`, `inventarioTrazabilidad`.

Migraciones: índice único `(organization_id, serial)` `concurrently` (fase 1; el global se retira
en B10 tras P8); `warranty_claims` `CHECK` de estado y `code`; `fn_garantia_crear`,
`fn_garantia_cambiar_estado`, `fn_garantia_enviar_rma`, `fn_garantia_resolver` (mueve el serial de
reemplazo y deja evento); `fn_seriales_vender` fija la garantía desde la venta; `fn_trazabilidad
(p_codigo)` (lote, serial o documento).

Pantallas: `590:319444`, `592:329722` (con RMA `973:186133`), `594:126324`, y la sub-pestaña
Seriales del producto.

Aceptación: serial comprado → vendido en el POS → reclamo → RMA → resuelto con reemplazo: el
detalle carga, el reemplazo queda `sold` al cliente, la garantía arranca en la fecha de venta, y la
trazabilidad del serial muestra los 5 eventos con enlaces.

Tamaño: **L**. Dependencias: B0 (solo para `fn_seriales_vender` si toca stock; el resto puede ir
en paralelo desde el día 1).

### 5.6 Bloque 5 — Recetas, costo de recetas, producción y pestaña Producción del producto

Propiedad: `app/app/inventario/{recetas,produccion,reportes/costo-recetas}/**`,
`components/inventario/{recetas,produccion}/**`, `components/inventario/reportes/costo-recetas/**`,
`components/inventario/productos/detalle/produccion/**` (nuevo), `components/kit/receta/**`,
`components/kit/{TablaSubseccion,HojaDetalle}.tsx` (nuevos), `components/inventario/dashboard/ProduccionKPIs.tsx`,
`lib/services/{productionOrderService,recipeService}.ts`, namespaces `receta` (existe),
`subseccion`, `inventarioProduccion`, `inventarioRecetas`.

Migraciones: `complete_production_order` v2 por `fn_inv_int_mover` (costo real del terminado =
Σ consumos ÷ producido, `FOR UPDATE`, pertenencia, sin `anon`), `fn_produccion_guardar`,
`fn_produccion_cambiar_estado` (confirmar, iniciar, cancelar con motivo). La distribución desde la
orden llama a `fn_traslado_guardar` de B3.

Pantallas: Recetas `598:142703` con `EditorReceta` en lugar de `RecipeDialog`; Costo `601:148806`
sobre `fn_receta_costo`; Producción `603:153432` (sin `prompt()`, «Completar» `604:158843`); pestaña
Producción del producto D1–D6, G1–G6, M1–M3 (`957:583021`). El montaje de la pestaña en
`DetalleProducto.tsx` lo hace B7 con el contrato
`<PestanaProduccion producto={…} permisos={…} />` exportado desde `detalle/produccion/index.ts`.

Aceptación: receta de 2 ingredientes con merma → orden de 10 → completar 10 → los ingredientes
bajan lo calculado por `fn_receta_int_calcular`, el terminado sube 10 con costo = consumos ÷ 10,
hay 2 consumos enlazados al kardex; «Distribuir» crea un traslado con `production_order_id`; si la
RPC falla, la orden **no** queda completada.

Tamaño: **XL**. Dependencias: B0; B3 para «Distribuir»; B6 para conversiones por producto.

### 5.7 Bloque 6 — Catálogo maestro: variantes, unidades y conversiones, imágenes, categorías, proveedores, etiquetas

Se puede partir en dos agentes (6a variantes + unidades/conversiones; 6b el resto).

Propiedad: `app/app/inventario/{variantes,unidades,conversiones,imagenes,categorias,proveedores,etiquetas}/**`,
`components/inventario/{variantes,unidades,imagenes,categorias,proveedores,etiquetas}/**` y sus
servicios; namespaces `inventarioVariantes`, `inventarioUnidades`, `inventarioImagenes` (los de
categorías, proveedores y etiquetas ya existen).

Migraciones: las de `INVENTARIO-PARIDAD-FIGMA.md` §3.2–3.3 (columnas de `variant_types` y
`variant_values`, `variantes_resumen`, renombrar, fusionar, reordenar, desactivar, eliminar;
`REVOKE` de `crear_tipo_variante`); `unit_conversions.product_id` + UNIQUE + validación de
`unit_type` (B2 de recetas) y `fn_conversion_guardar`; imágenes paginadas en servidor.

Pantallas: Variantes `969:595070` (una página con pestañas Tipos · Valores; las rutas viejas
redirigen), Unidades y Conversiones `593:333686` con `kit/receta/DialogoConversion`, Imágenes
`596:345914`, faltantes de Categorías (eliminar con destino, móvil, importar `973:186211`) y
Proveedores (importar `973:185225`, pestañas del detalle), borrar el código muerto de proveedores.

Aceptación: renombrar «talla» → «Talla» en la org 132 actualiza las variantes en una sola RPC y
el POS las ordena por `display_order`; una conversión «solo este producto» PAQ = 6 UN la usa la
receta y la recepción de ese producto y no otras.

Tamaño: **XL** (6a L, 6b M). Dependencias: ninguna para 6b; 6a usa B0 solo para permisos.

### 5.8 Bloque 7 — Productos (catálogo, detalle, formulario, importación, códigos)

Propiedad: `app/app/inventario/productos/**`, `components/inventario/productos/**` **excepto**
lo asignado a B1, B4 y B5 y los dos archivos con cambios de otra sesión; `messages` → namespaces
`productos*` y `productoDetalle` (existen).

Trabajo: montar la pestaña Producción (contrato de B5); «Transferir» y «Crear ajuste» con
preselección (contrato de B2/B3); cabecera sin precio; impuestos N:M en la interfaz; expandir a
variantes Estado y Categoría masivos; `bulkDelete` en una RPC; **costo y precio masivos por
`fn_producto_fijar_costo`/`fn_producto_fijar_precio`** en lugar de las escrituras directas de
`bulk/bulkService.ts:291-330, 391-406, 637-653, 786-800, 869-883` (que dejan vigencias abiertas y
pisan `avg_cost` en todas las sucursales); recuento D5 de la importación y sucursal/impuesto/costo
explícitos en la importación web; `LotPicker` en «Stock inicial» cuando `track_lots`; borrar
`NuevoProductoForm.tsx`, `facebookCatalogExport.ts` y la carpeta vacía `scraping/`.

Aceptación: desde el detalle de un producto compuesto se recorre Producción › Receta → Órdenes →
Nueva orden → Completar → Distribución, y desde Inventario › Stock → Transferir llega al traslado
con todo elegido.

Tamaño: **M**. Dependencias: contratos de B2, B3 y B5 (se pueden montar tras sus primeros commits).

### 5.9 Bloque 8 — Compras ↔ inventario (backend de recepción) · después del agente de compras

Propiedad: `supabase/migrations/*_inv_b8_*`, `src/lib/services/inventario/recepcionOrdenCompra.ts`
(nuevo), `src/app/api/inventario/ordenes-compra/[id]/recepcionar/route.ts` (nuevo, con
`getServerOrgContext`). **La UI de la recepción** (Figma `583:67712`) vive en
`components/inventario/ordenes-compra/**`: la hace el agente de compras, o este bloque cuando ese
agente libere la carpeta.

Migraciones: `purchase_receipts` y `purchase_receipt_items` (RLS por pertenencia, lectura),
`fn_oc_recepcionar(p_po_uuid, p_lineas, p_clave_idempotencia)` (cantidades con guarda de
sobre-recepción, variantes, lotes con vencimiento, seriales con unicidad por organización, todo por
`fn_inv_int_mover` / `fn_kardex_entrada_compra_int`, estado de la OC y factura con
`fn_factura_compra_desde_oc` en la misma transacción); lotes y seriales en la recepción de la
factura de compra (`fn_fc_recepcionar_int` con `lot_code`/`expiry_date`/seriales por línea, y los
seriales de la factura pasan a crearse al **recibir**).

Aceptación: recepción parcial de 3 líneas (una con 2 lotes, una con 4 seriales) → un solo
documento de recepción, kardex con lote, `product_costs` con vigencia, seriales `in_stock`; la
segunda recepción no reutiliza seriales; recibir de más falla con un error legible; al completar,
factura y CxP en la misma transacción.

Tamaño: **L**. Dependencias: B0; que el agente de compras cierre su trabajo en la OC.

### 5.10 Bloque 9 — Consumidores externos del stock (coordinado)

- **POS** (con su agente): selector de lote `530:65098` usando `kit/inventario/LotPicker`; cambiar
  el escáner simulado (`ui/barcode-scanner.tsx`) por uno real; `pos_checkout_v1` pasa `lot_id` si
  la línea lo trae.
- **GO Assistant** (con su dueño): `assistant_create_adjustment`, `assistant_create_transfer`,
  `assistant_register_sale`, `assistant_bulk_load_products`, `assistant_create_product` delegan en
  las RPC de B0/B2/B3 y se revoca `anon` (4 de 5 hoy lo permiten).
- **Pedidos web**: `webOrderServerConfirmation.ts` y `webOrderConfirmationService.ts` (la misma
  confirmación copiada; la de servidor libera la reserva sin expandir la receta y vende seriales a
  mano) pasan a **una** RPC `fn_pedido_web_confirmar_stock(p_order_id)` que descuenta con receta,
  libera la reserva expandida y vende los seriales; `webOrdersService.convertToSale` (sin uso) se
  borra; el reembolso `api/web-orders/[id]/refund/route.ts:244-280` pasa a `fn_stock_entrada`.
- **PMS**: quitar el segundo descuento de `spaceConsumptionService.ts:250` (el folio ya
  descuenta) y que la reversión del folio (`foliosService.ts:373`) use `fn_stock_entrada_devolucion`
  al costo de la salida, no `incrementOnPurchase` al precio de venta.
- **Acciones de IA fuera de las RPC**: `aiActionsService.ts:578-585` («actualizar stock») y
  `ai/assistant/undoService.ts:261-264, 334` pasan por `fn_producto_int_ajustar_stock` (con kardex).
- **CRM**: `crm/inventoryCrmLink.ts` y `crm/posCrmLink.ts` solo exportan; sin cambios.

Propiedad (en coordinación con el dueño de cada área): los archivos nombrados arriba y las
migraciones `*_inv_b9_*`.

Tamaño: **L**. Dependencias: B0, B2, B3.

### 5.11 Bloque 10 — Cierre: navegación, tablero, RLS, datos y verificación integral (último)

Propiedad: `lib/navigation/catalog.ts` (entradas de inventario: Kardex, Reportes, iconos),
`components/inicio/sections/InventarioSection.tsx`, `lib/services/inventoryDashboardService.ts`,
`components/inventario/dashboard/{AccesosRapidos,AlertasInventario,MovimientosRecientes,ResumenSucursales}.tsx`,
`components/inventario/{FiltrosInventario,KPICard,RotacionProductosChart,TopSKUTable}.tsx` (a
borrar), `src/__tests__/guardrails.test.ts` (guardarraíl de escritura), migraciones `*_inv_b10_*`.

Trabajo:
1. `fn_inventario_resumen(p_org, p_branch)` para el tablero; borrar `AccesosRapidos.tsx` y los
   cuatro componentes muertos de la raíz de `components/inventario`.
2. **RLS de solo lectura** en las tablas de §3.2 (cierre) y guardarraíl que prohíbe
   `from('<tabla>').insert/update/delete/upsert` sobre ellas en `src/**`.
3. Retirar el índice global de seriales (P8).
4. Reparación de datos **solo con aprobación** (P1, P2, P7, P9, P10, P11): reservas huérfanas
   (D8), stock de padres (D4), traslados de 2025 (D13), garantías corriendo en bodega (D14), costo
   cero (D5), vigencias duplicadas de costo y precio (D19, D20).
5. Prueba integral (abajo) en el navegador con una organización de prueba y en la base con
   `begin … rollback`.

**Prueba de aceptación integral** (todo el módulo conectado):

1. Crear producto con 2 variantes, costo, stock inicial en la sucursal A y receta compartida.
2. OC de 20 uds de una variante → recepción parcial de 12 con un lote → factura y CxP.
3. Vender 3 en el POS (FEFO del lote) y 1 por factura de venta.
4. Ajuste por conteo: −1 por merma.
5. Traslado de 5 de A a B → despachar → recibir 5.
6. Orden de producción del compuesto → completar → distribuir a B.
7. Kardex de la variante en A y en B: cada fila enlaza a su documento; `fn_kardex_descuadres` = 0
   para esos productos; costo promedio esperado; asientos: uno por documento, ninguno duplicado.
8. Trazabilidad del lote: recibido 12, vendido 3, en existencias el resto, con el cliente de la
   venta.
9. Con un usuario sin `inventory.adjust` ni `inventory.transfer`: botones ocultos y la RPC
   responde 42501.
10. Las 10 pantallas principales en móvil (390) sin desbordes y en los 4 idiomas.

Tamaño: **L**. Dependencias: todos.

### 5.12 Orden y paralelismo

```text
Día 1–3   B0 (núcleo)                      │ B6b (categorías, proveedores, etiquetas, imágenes)
                                           │ B4 (UI y garantías; sin tocar stock)
Día 3–8   B1   B2   B3   B5   B6a   B7     │ (en paralelo, archivos disjuntos)
Día 6–9   B8 (cuando el agente de compras libere la OC)   B9 (con POS y GO Assistant)
Día 9–11  B10 (cierre y verificación integral)
```

Capacidad sugerida: 6 agentes a la vez como máximo (B1, B2, B3, B5, B6a, B7 tras B0).

### 5.13 Namespaces de i18n por bloque

| Bloque | Namespaces |
|---|---|
| B0 | `inventario` |
| B1 | `inventarioStock`, `inventarioMovimientos`, `inventarioKardex`, `inventarioLotes` |
| B2 | `inventarioAjustes` |
| B3 | `inventarioTraslados`, `inventarioDistribucion` |
| B4 | `inventarioSeriales`, `inventarioGarantias`, `inventarioTrazabilidad` |
| B5 | `receta`, `subseccion`, `inventarioRecetas`, `inventarioProduccion` |
| B6 | `inventarioVariantes`, `inventarioUnidades`, `inventarioImagenes` (+ los existentes) |
| B7 | `productos`, `productoForm`, `productoDetalle`, `productosImportar` (existentes) |
| B10 | `inventarioTablero` |

---

## 6. Preguntas para el dueño (solo las que bloquean)

| # | Pregunta | Bloquea | Recomendación |
|---|---|---|---|
| P1 | **Stock propio de los productos padre** (8.630 filas en 17 orgs; en la 137 casi nunca coincide con la suma de las variantes). ¿El stock vive solo en las variantes? | B1 (listado agrupado), B10 | Sí: el padre muestra la suma de sus hijos y su fila propia se muestra aparte como «sin asignar a variante» hasta que cada organización la reparta; no se borra nada sin tu visto bueno |
| P2 | **Kardex que no cuadra** (4.899 pares) y **stock sin historia** (45.219 filas). ¿Se crea un movimiento de apertura que explique el saldo actual? | B10 | Sí: un movimiento `initial` de «saldo de apertura al 2026-09-30» por la diferencia, sin tocar cantidades; el asiento de apertura (F-36) queda para el contador |
| P3 | **Conteo físico**: ¿pantalla propia sobre `cycle_counts` o «ajuste por conteo»? | B2 | Ajuste por conteo (es lo que dibuja Figma `975:186644`); `cycle_counts` queda sin usar |
| P4 | **Doble asiento de los ajustes** (81 ajustes). ¿Queda solo el asiento del documento de ajuste? | B0, B2 | Sí, hacia adelante; los 81 históricos se listan para que el contador los reverse |
| P5 | **Stock negativo**: ¿se sigue permitiendo vender sin existencias? | B0 | Permitir por defecto (como hoy) con un ajuste por organización «bloquear venta sin stock»; el traslado y el ajuste de salida sí bloquean |
| P6 | **Permiso de recepción**: ¿`inventory.create` (como hoy en compras) o uno nuevo `inventory.receive`? | B8 | Reusar `inventory.create`; no crear permisos nuevos |
| P7 | **Traslados abiertos de julio de 2025** (org 2) y diferencias al recibir. ¿Despachar descuenta el origen y quien recibe decide la diferencia («faltante en el transporte» o «sigue en camino»)? | B3 | Sí; los 3 abiertos de 2025 se cancelan con motivo, sin mover stock |
| P8 | **Seriales únicos por organización** en lugar de en todo el sistema (0 choques hoy). | B4, B10 | Sí, en dos fases |
| P9 | **98 garantías corriendo en bodega** (orgs 133, 143). ¿Se reinician para que arranquen al vender? | B4 | Sí: se borra `warranty_start/end` de los seriales `in_stock`; los vendidos no se tocan |
| P10 | **Reservas huérfanas** (1.690 uds en 4 orgs). ¿Se liberan? | B10 | Sí, las que no tengan pedido web pendiente ni oportunidad de CRM abierta |
| P11 | **Precios y costos con varias vigencias abiertas** (16.359 productos con más de un precio vigente, 59 con más de un costo). ¿Se cierran las viejas? | B7, B10 | Sí: por producto queda abierta la de `effective_from` más reciente que ya empezó; las anteriores se cierran en el `effective_from` de la siguiente. Antes se comprueba que el POS, la tienda y la factura ya leen esa misma (si alguno lee otra, el precio que ve el cliente cambiaría) |

---

## Anexo B0 — Núcleo de existencias: estado al 2026-09-29 (hecho)

Bloque 0 aplicado con las decisiones del dueño del 2026-09-28 (P1–P11 con la recomendación de §6).
Todo por el MCP, cada migración con su rollback y probada antes con `begin … rollback` / `DO … RAISE`.

### B0.1 Migraciones (`supabase/migrations/` + `supabase/rollbacks/`)

| Archivo | Qué hace |
|---|---|
| `20260929020000_inv_b0_1_esquema` | `stock_movements.created_by` (default `auth.uid()`) y `avg_cost_after`; índice de kardex `(organization_id, product_id, branch_id, created_at, id)`; `lots.organization_id` (relleno: 3 lotes, 0 choques), `branch_id`, `notes`, `created_by`, UNIQUE `(organization_id, product_id, lot_code)` y disparador que completa la organización; `products.track_lots` (default false) |
| `20260929020100_inv_b0_2_permisos` | `fn_inventario_permisos(org)` → `{ver, crear, editar_catalogo, eliminar, ajustar, trasladar, recibir, producir, garantias, costos, configurar}`; `fn_inventario_exigir_permiso(org, acciones[])` (42501 `sin_permiso`); `fn_inventario_config` / `fn_inventario_config_guardar` con `bloquear_venta_sin_stock` (P5, false por defecto) en `organization_settings` key `inventario` |
| `20260929020200_inv_b0_3_primitiva` | `fn_inv_int_mover` (la primitiva), `fn_inv_int_mover_fila`, `fn_inv_int_fila`, `fn_inv_int_costo_promedio` (la regla única). Sin EXECUTE para `anon` ni `authenticated` |
| `20260929020300_inv_b0_4_escritores_por_la_primitiva` | Misma firma, por dentro la primitiva: `decrement_stock_on_sale`, `fn_stock_entrada`, `fn_stock_entrada_devolucion`, `fn_register_stock_entry`, `fn_producto_int_ajustar_stock` (reescritas) y `fn_kardex_entrada_compra_int`, `fn_void_purchase_invoice` (parche sobre la definición viva, md5 comprobado y marcador único). Respaldo exacto en `private.respaldo_funciones` |
| `20260929020400_inv_b0_5_reservas` | `stock_reservations` (RLS solo lectura) + `fn_inv_int_reservar` / `fn_inv_int_liberar` (receta expandida con el resolutor único, bloqueo en orden de producto, liberación exacta); `reserve_stock_for_web_order` y `release_stock_for_order` con la misma firma (la segunda ahora exige pertenencia y fija `search_path`); `fn_stock_reservar`, `fn_stock_liberar_reserva` (fachada TS); `fn_inv_reversion_entrada` (camino temporal de `folio_item_reversal`) |
| `20260929020500_inv_b0_6_documento_de_movimiento` | `fn_inv_documentos(org, refs[])` en lote (máx. 500) y `fn_documento_de_movimiento`: tipo, número legible y ruta para los 24 orígenes, solo documentos de la organización |
| `20260929020600_inv_b0_7_asiento_unico_ajuste` | P4: el movimiento de un documento de ajuste `gain`/`loss` ya no asienta (lo hace el documento). Los `adjustment` sin documento siguen asentando |
| `20260929020700_inv_b0_8_primitiva_escala` | La primitiva redondea la cantidad a 3 decimales antes de mover y guarda en `avg_cost_after` el promedio tal como queda en la fila (numeric(12,2)): kardex y saldo no se separan en milésimas |

`get_advisors` (security): ningún aviso nuevo en `anon_security_definer_function_executable`,
`function_search_path_mutable` ni `rls_*` por objetos de B0 (`release_stock_for_order` sale de
`function_search_path_mutable`). Las RPC públicas nuevas aparecen, como todas las del repositorio,
en `authenticated_security_definer_function_executable`: es su diseño (validan organización y
permiso dentro).

### B0.2 Qué pasa ya por la primitiva

| Flujo | Función (misma firma) | Cambio observable |
|---|---|---|
| POS, mesa, pedido web, folio PMS | `decrement_stock_with_recipe` → `decrement_stock_on_sale` | Bloqueo de la fila (dos ventas simultáneas ya no pierden una resta); FEFO si `track_lots` (hoy 0 productos); rechaza producto o sucursal de otra organización (0 casos históricos); cantidad 0 se omite |
| Factura de venta, anulación, nota crédito | `decrement_stock_with_recipe`, `fn_stock_entrada` | `fn_stock_entrada` salta productos con `track_stock = false` (antes les creaba fila; 0 movimientos históricos de NC/anulación sobre ellos) |
| Devolución, anulación POS | `fn_stock_entrada_devolucion` | Ninguno (entra al costo de la salida, sin mover el promedio) |
| Alta de producto, importación, entrada de ajuste | `fn_register_stock_entry` | **Promedio ponderado** en vez de «último costo» (§2 F1.4); exige permiso de inventario (`crear`, `editar_catalogo` o `ajustar`), no solo pertenencia; bloqueo de la fila. En 90 días hubo entradas de ajuste en las orgs 142 (103), 144 (29), 132 (21), 129 (10), 120 (5), 115 y 134 (2), 130, 143 y 199 (1): esas son las que desde hoy promedian |
| Stock masivo, variantes | `fn_producto_int_ajustar_stock` | Bloqueo antes de calcular la diferencia; mismo costo |
| Compra (factura y recepción) | `fn_kardex_entrada_compra_int` | El lote de la línea debe ser del producto y de la organización |
| Anulación de factura de compra | `fn_void_purchase_invoice` | Si no había fila, se crea (en negativo) en vez de dejar un movimiento que el saldo no refleja |
| Reservas web (tienda y panel) y CRM | `reserve_stock_for_web_order`, `release_stock_for_order`, `fn_stock_reservar`, `fn_stock_liberar_reserva` | Receta expandida en SQL; lo reservado queda registrado por documento y se libera exacto; reservar dos veces no duplica; liberar un pedido ajeno → 42501 |
| Borrar consumo del folio (PMS) | `fn_inv_reversion_entrada` | Entra al costo con que salió, ya no al **precio de venta** |

Escenario comparado en la base (org 2, producto de prueba, `begin … rollback`) antes y después:
apertura 10×500, compra 10×1.000, venta 4, NC 1, devolución 2, stock masivo a 25, entrada de ajuste
5×1.250, venta 40 y variante nueva 7×900 → mismas cantidades y mismos costos en todos los pasos
salvo la entrada de ajuste (antes 1.250 «último costo», ahora 833,33 ponderado) y la venta siguiente
(sale a 833,33). Venta con receta como cajero de la org 142 y anulación real de una factura de compra
de la org 132: correctas; el cajero (solo `inventory.view`) ya no puede llamar
`fn_register_stock_entry` (42501).

### B0.3 Qué NO pasa todavía por la primitiva (dueño y bloque)

SQL: `complete_production_order` (B5, v2 con costo real; hoy es invocador y la primitiva no se
le expone), `assistant_create_adjustment`, `assistant_register_sale`,
`assistant_void_purchase_invoice` (B9). `fn_importar_productos_lote`,
`fn_producto_int_stock_inicial`, `fn_producto_int_variante_guardar` y `update_product_min_stock`
solo escriben `min_level` o filas en 0 (no mueven stock).

TS (guardarraíl 33 de `src/__tests__/guardrails.test.ts`, la lista solo puede achicarse):
`app/api/web-orders/[id]/refund/route.ts` (B9), `components/inventario/lotes/LotesService.ts` (B1),
`components/inventario/productos/bulk/bulkService.ts` (B7),
`components/inventario/transferencias/TransferenciasService.ts` (B3), `lib/ai/assistant/undoService.ts`
(B9), `lib/services/adjustmentService.ts` (B2), `lib/services/aiActionsService.ts` (B9),
`lib/services/webOrderServerConfirmation.ts` (B9). `stockMovementService.ts` ya salió: es fachada de RPC.

### B0.4 Contratos para B1–B10

- **Tipos**: `src/lib/inventario/nucleo/tipos.ts` (primitiva, opciones, errores, permisos, config,
  documentos, reservas, entrada de compra, lotes y las firmas acordadas de `fn_stock_registrar_movimiento`,
  `fn_lote_guardar`, `fn_ajuste_aplicar`, `fn_traslado_recibir`, `complete_production_order` v2,
  `fn_oc_recepcionar`, `fn_pedido_web_confirmar_stock`). Punto de entrada `@/lib/inventario/nucleo`.
- **Regla para toda RPC nueva que mueva stock**: SECURITY DEFINER, `fn_inventario_exigir_permiso(org,
  array['<acción>'])` (o `fn_assert_acceso_org` + permiso de su dominio), el movimiento SOLO con
  `public.fn_inv_int_mover(...)`, `REVOKE … FROM anon, public` en la misma migración. Opciones de la
  primitiva: `recalcular_costo`, `costo_fijo`, `permitir_negativo`, `fefo`, `incluir_vencidos`,
  `forzar`, `seriales`, `estado_serial`. Traslado (B3): salida `transfer_out` con
  `estado_serial: 'in_transit'` y entrada `transfer_in` con `unit_cost` = costo de la salida (recalcula
  en destino). Ajuste (B2): el movimiento con `source_id` = id del ajuste; el asiento lo hace el
  documento (P4). Producción (B5): consumos `out` y terminado `in` con `recalcular_costo` y costo =
  Σ consumos ÷ producido.
- **Permisos en la UI**: `usePermisosInventario()` (`@/lib/inventario/usePermisosInventario`);
  pantalla sin permiso = `EmptyState variante="forbidden"` con `inventario.permisos.*`.
  `components/inventario/categorias/usePermisosCatalogo.ts` (B6b) puede pasar a leer
  `editar_catalogo` de aquí.
- **Errores**: `claveErrorInventario(error)` → `inventario.errores.<clave>`;
  `detalleStockInsuficiente(error)` para «disponible X, solicitado Y».
- **Kit** (`@/components/kit/inventario`): `BadgeOrigenMovimiento` (Figma 530:65022, 24 orígenes, el
  ÚNICO mapa está en `lib/inventario/origenesMovimientoStock.ts` → `META_ORIGEN`),
  `EnlaceDocumento` + `useDocumentosMovimiento(org, filas)` (una llamada por página),
  `LotPicker` en línea y `DialogoLotes` (diálogo en escritorio, hoja en móvil; Figma 530:65092,
  530:65099, 530:65161), `BadgeVencimiento` + `useTextoVencimiento`, `SaldoCorridoCell`.
  `hoy` siempre `todayInTz(zonaDeLaOrganizacion)`.
- **i18n**: namespace `inventario` (orígenes, documentos, vencimiento, lotes, saldo, errores,
  permisos) en es/en/fr/pt; los bloques usan su propio namespace (§5.13).
- **Costo en pantalla**: `costoPromedioTrasEntrada` (`nucleo/costo.ts`) es el espejo de la regla SQL,
  solo para mostrar; nunca se escribe `avg_cost` desde el navegador.

### B0.5 Avisos para otros bloques

- **B9 / POS**: `pos_checkout_v1` captura cualquier error de stock y lo deja como advertencia. Si una
  organización activa `bloquear_venta_sin_stock`, la factura de venta sí falla con
  `stock_insuficiente`, pero el POS vendería sin descontar: B9 tiene que hacer que el POS respete
  ese error antes de ofrecer el ajuste en la interfaz (hoy ninguna organización lo tiene activo).
- **B9 / PMS**: el doble descuento de los consumos de habitación sigue (`spaceConsumptionService.ts:250`);
  la reversión del folio ya no corrompe el costo. Cuando B9 pase la reversión a
  `fn_stock_entrada_devolucion`, `fn_inv_reversion_entrada` puede retirarse.
- **B1**: `fn_inv_documentos` resuelve el número; cuando B2/B3/B5 añadan `code`, se actualiza allí
  (hoy `AJ-<id>`, `TR-<id>`, `OP-<id>`). Hay 620 filas con `qty_reserved > 0` (orgs 113: 139,
  135: 228, 137: 14, 145: 240) sin registro en `stock_reservations`: se liberan con la regla
  anterior hasta que B10 las limpie (P10).
- **B10**: 28 filas negativas (orgs 132 y 144: 11 cada una; 129 y 142: 2; 112 y 134: 1). Las filas de
  `private.respaldo_funciones` sirven para los rollbacks de B0: no borrarlas.

### B0.6 Ajustes con doble asiento (P4) — para el contador

Hacia adelante hay un solo asiento por ajuste. Los históricos (documento `inventory_adjustment` +
asiento por movimiento `stock_movements`), por organización y id de ajuste:

| Org | Ajustes | Ids |
|---|---|---|
| 115 | 2 | 34, 35 |
| 129 | 12 | 20, 21, 22, 23, 25, 26, 27, 28, 31, 32, 33, 45 |
| 132 | 23 | 29, 36–44, 46–58 |
| 134 | 3 | 60, 61, 63 |
| 143 | 1 | 77 |
| 144 | 39 | 80–89, 91, 92, 98, 99, 101, 102, 104–111, 113, 114, 115, 120–123, 126, 127, 130–135 |
| 199 | 1 | 147 |

(81 ajustes; el contador reversa el asiento por movimiento o el del documento, no ambos.)

---

## Anexo B6b — Catálogo maestro: imágenes, categorías, proveedores y etiquetas (2026-09-29)

Commits: `77d0a418` imágenes · `7eb020d0` etiquetas · `7c48ec91` categorías · `17d3e786`
proveedores. Solo archivos de B6b (§5.7) y los namespaces `inventarioImagenes`, `categorias`,
`proveedores` e `inventarioEtiquetas` en es/en/fr/pt.

**Migraciones** (aplicadas por el MCP, `.sql` y rollback en el repo):

| Archivo | Qué hace |
|---|---|
| `20260929020000_inv_b6_imagenes` | `shared_images.alt_text` y `created_by`, índices; retira `trigger_update_image_url` (asignaba `image_url`, columna inexistente: «Hacer pública» fallaba siempre con 42703); RPC `fn_imagenes_resumen`, `fn_imagenes_listado` (paginado, dos orígenes), `fn_imagen_detalle`, `fn_imagen_registrar`, `fn_imagen_actualizar`, `fn_imagenes_visibilidad`, `fn_imagen_asignar_productos`, `fn_imagenes_eliminar` (reasigna la principal) |
| `20260929021000_inv_b6_catalogo_permisos` | `mover_categorias`, `eliminar_categoria`, `etiquetas_producto_eliminar/fusionar` exigen permiso de catálogo (antes solo pertenencia); `fn_etiqueta_guardar`; disparador de nombre de etiqueta único sin mayúsculas hacia adelante (los 4 grupos repetidos de hoy no se tocan) |
| `20260929022000_inv_b6_importar_catalogo` | `fn_categorias_importar` y `fn_proveedores_importar`: revisar y aplicar con la misma función, una transacción, tope 2.000 filas (aplicada en dos pasos; el segundo, `…_duplicados`) |

Todas DEFINER con `fn_assert_acceso_org` o `fn_productos_exigir_permiso` y `REVOKE … FROM
public, anon`. Probado en la base con `DO … RAISE`: usuario sin permisos de catálogo → 42501 al
escribir, otra organización → 42501, anon → 42501; nombre de etiqueta repetido → 23505.

**Pantallas**: Imágenes `596:345914` rehecha (galería, pestañas, KPI, filtros, selección, panel
«Usada en», subir con avance, asignar a productos, eliminar); Importar categorías `973:186211`;
Importar proveedores `973:185225` / `975:185874` (4 pasos, crear o actualizar por documento);
permisos en la interfaz y estado «sin permiso» en categorías, proveedores, etiquetas e imágenes;
el detalle del proveedor enlaza Facturas y CxP filtradas por el proveedor; borrado el código
muerto `DetalleProveedor.tsx` y `FormularioProveedor.tsx`.

**Permisos**: la interfaz usa `fn_productos_permisos` (hook `categorias/usePermisosCatalogo.ts`,
en lugar de duplicar lo de B0); cuando B0 publique `fn_inventario_permisos.editar_catalogo`, se
cambia solo ese hook.

**Pendiente** (fuera de B6b o con dueño):
- Alta y edición de categorías, proveedores y el alta directa de etiquetas desde el producto
  siguen escribiendo tablas por RLS de pertenencia: el permiso de servidor completo llega con la
  RLS por permiso de B10.
- Storage: las políticas de `organization_images` y `product-images` no filtran por organización
  (B10 / seguridad).
- El catálogo de productos (B7) aún no lee `?etiqueta=` ni `?proveedor=`; Órdenes de compra no
  filtra por `?proveedor=` (agente de compras).
- Tableta sin frames en Figma; categorías móviles de detalle y formulario sin frame (se usan los
  responsivos actuales).
