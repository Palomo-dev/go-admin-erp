# Paridad: catálogo y producción de Inventario en Figma

- **Fecha:** 2026-09-23.
- **Archivo:** «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`).
- **Páginas tocadas:**
  - `04 Inventario`: diez secciones nuevas, **todas en el carril x = 62.000 … 71.760**, con y ≥ 0.
  - `02 Componentes`: una sección nueva en x = 62.000 y siete iconos en `Fundamentos › Iconos`.
- **Qué no se hizo:** no se tocó código ni la base de datos y no hubo commits. No se borró, movió ni revirtió ningún nodo ajeno.
- **Datos de ejemplo:** Mi empresa S.A.S., Comercial Andina S.A.S., Distribuidora del Norte, Calzado Mayorista S.A.S., Sucursal Principal, Sucursal Norte y Sucursal Sur. Los demás proveedores de ejemplo tienen nombres genéricos de oficio («Insumos Panaderos S.A.S.», «Proveedora de Empaques S.A.S.»).
- **Norma:** `PATRONES-TRANSVERSALES.md` (todos sus apartados), `SISTEMA-BADGES.md` y `CATALOGO-ICONOS.md`.
- **Evidencia:** `AUDITORIA-CATALOGO-PRODUCCION.md` y `AUDITORIA-CONTROLES-PROVEEDORES-CATEGORIAS.md`.

---

## 1. Dónde estaban Categorías y Proveedores

**No existían como pantallas.** Se revisaron las páginas `02`–`10` y `99` por nombre de sección, de frame y por texto. Solo aparecieron piezas satélite:

| Pieza | Dónde estaba | Qué se hizo |
|---|---|---|
| Pestaña «Proveedores y etiquetas» del detalle de producto | `04` › «Producto — Imágenes · Proveedores y etiquetas» (x=0, y≈40.582), `194:12856` | **Clonada** a la sección de Proveedores como «cómo se llega desde el producto». El original sigue en su sitio |
| «Diálogo · Agregar Proveedor» / «Diálogo · Editar Proveedor» (vínculo producto ↔ proveedor) | Misma sección, `194:13794` y `194:13908` | Clonados |
| `SupplierPicker` | `02 Componentes › Finanzas`, `415:160070` | Se instancia (popover con resultados) en Proveedores |
| `QuickCategoryForm` y alta rápida de categoría | `04`, x=13.000 (`513:259550`, sección `520:61612`) | Se instancia en Categorías («Nueva categoría» y «slug duplicado») |
| «Registrar pago a proveedor» | `07 Finanzas` | Queda como destino del menú «⋯ › Registrar pago» |

Las clones y las instancias no alteran los originales.

---

## 2. Secciones creadas en `04 Inventario`

Todas con título, anotaciones **fuera** de los frames, escritorio 1440 y móvil 390.

| # | Sección (node) | y | Contenido |
|---|---|---|---|
| 1 | Categorías — árbol, detalle y formularios (`586:290667`) | 0 | Árbol en seis estados: listo, cargando, vacío, sin resultados, error y sin permiso. Menús «⋯» de fila y de cabecera abiertos, FilterPanel y selección múltiple con BulkActionBar. Detalle con «Cómo se conecta» y reglas con feedback. Formulario completo de edición. Siete móviles (listo, cargando, vacío, error, sin permiso, hoja de acciones y selección). QuickCategoryForm en estado listo y duplicado. ConfirmDialog de eliminar y de desactivar en lote. Diálogo «Mover a…» con descendientes deshabilitados |
| 2 | Proveedores — listado, detalle, formulario y diálogos (`589:311642`) | 7.072 | Listado en seis estados, menú, filtros y selección. Detalle con pestañas: «Resumen» (KPIs reales, datos, fiscal/bancario enmascarado, últimos documentos, «Cómo se conecta») y «Productos que surte». Formulario único para nuevo y editar. Eliminar sin documentos y desactivar cuando tiene documentos. Alta rápida (QuickCreateDialog), SupplierPicker y toasts. Ocho móviles, entre ellos el detalle. Clones del producto |
| 3 | Etiquetas de producto — listado y diálogos (`591:325136`) | 15.452 | Listado en seis estados, menú, filtros y selección. Nueva etiqueta y nombre repetido. Fusionar. Eliminar y eliminar 158 sin usar. Siete móviles |
| 4 | Unidades y conversiones — listados y diálogos (`593:333686`) | 20.524 | **Dos bloques unidos por pestañas** (Unidades · Conversiones), cada uno con seis estados, menú, filtros y selección. Nueva unidad. Nueva conversión y su error de tipos. Eliminar unidad. Siete móviles |
| 5 | Imágenes — biblioteca, detalle y diálogos (`596:345914`) | 28.563 | Galería de ImageCard en seis estados, menú, filtros y selección. Panel lateral de detalle con «Usada en». Subir con progreso. Asignar a productos (ProductPicker). Eliminar imagen en uso. Siete móviles |
| 6 | Recetas — listado, editor y diálogos (`598:142703`) | 33.835 | Listado en seis estados, menú, filtros y selección. **Editor** con versión, «cómo descuenta», renglones RecipeIngredientRow (sin conversión y sin costo), costo, versiones y conexiones. Desactivar, eliminar y toast. Siete móviles |
| 7 | Costo de recetas — reporte (`601:148806`) | 40.214 | Reporte con fila expandida por ingrediente, fuente del costo, BranchBadge y siete estados (incluye sin sucursal). Menú y filtros. Siete móviles |
| 8 | Producción — órdenes, detalle y diálogos (`603:153432`) | 44.541 | Listado en siete estados (incluye sin sucursal), menú, filtros y selección. Detalle **en proceso** (ProductionStepper, disponibilidad y faltante con traslado o compra) y **completado** (consumos con su movimiento de kardex y costo real). Nueva orden con disponibilidad, completar (sustituye `prompt()`), toast de error de la RPC y cancelar. Nueve móviles |
| 9 | Distribución — envíos, asistente y recepción (`606:159579`) | 50.710 | Listado en siete estados, menú, filtros y selección. **Asistente de tres pasos** (qué distribuir, reparto por sucursal con validación, revisar y crear). Recibir con diferencias. Ocho móviles |
| 10 | Catálogo y producción — cómo se conecta todo (`609:164810`) | 55.606 | Seis cadenas de navegación: compras, catálogo, medidas y recetas, producción, existencias y medios. Tabla de 24 enlaces con «dónde se pulsa», la relación en la BD y el estado de hoy (existe, roto o nuevo) |

En total son 186 frames de pantalla o diálogo, más instancias sueltas de diálogos del kit (ConfirmDialog, QuickCreateDialog, QuickCategoryForm, SupplierPicker y Toast).

---

## 3. Componentes nuevos en `02 Componentes`

Sección «Inventario — Catálogo y producción (Nuevo)» (`580:277799`, x = 62.000, y = 0). Cada set lleva la marca `Marca/Nuevo` como anotación. Colores, radios y espacios usan variables (colección Color, Light/Dark; Radius; Spacing).

| Componente | Variantes | Para qué |
|---|---|---|
| `ListCard` (`580:277858`) | Selección = no / sí | Tarjeta de listado móvil: icono por INSTANCE_SWAP, título, subtítulo, meta, valor y badge de estado. Con «⋯» |
| `RelatedLinkCard` (`580:277907`) | Tono = neutral / warning / danger | Bloque «Cómo se conecta»: entidad destino, conteo real y «Ver ›» |
| `TreeCell` (`580:278007`) | Nivel 0/1/2 × Rama abierta/cerrada/hoja | Celda de árbol con sangría real y slug (categorías) |
| `ImageCard` (`580:278659`) | Estado = default / seleccionada | Tarjeta de la biblioteca de imágenes |
| `ProductionStepper` (`580:278776`) | borrador · confirmada · en-proceso · completada · cancelada | Progreso de la orden de producción. También se usa como pasos del asistente de distribución |
| `RecipeIngredientRow` (`580:278944`) | normal · sin-conversion · sin-costo | Renglón del editor de recetas |
| `TabItem` (`581:277913`) | State = default / active | Pestaña con contador. El kit solo tenía `Tabs` con dos opciones fijas |

**Iconos lucide nuevos** en `Fundamentos › Iconos` (trazo 1,5 y variable `text/secondary`): `Icon/Factory`, `Icon/Route`, `Icon/CookingPot`, `Icon/Scale`, `Icon/Images`, `Icon/Merge` e `Icon/FolderPlus`. Van en la fila libre y = 904 de la sección `4:136`.

---

## 4. Iconos por concepto

Propuesta de adenda a `CATALOGO-ICONOS.md`, ver §2 de ese documento.

| Concepto | Icono | Motivo |
|---|---|---|
| Categoría | `Tags` | Ya fijado en el catálogo |
| Etiqueta de producto (tag) | `Tag` | Distinto de `Tags`: una etiqueta frente a un grupo |
| Proveedor | `Truck` | Ya fijado |
| Unidad de medida | `Ruler` | Hoy el menú usa `Hash` |
| Conversión | `Scale` (nuevo) | `ArrowLeftRight` queda para Traslado |
| Imagen / biblioteca | `Images` (nuevo) | El marcador `Image` está prohibido como icono de pantalla |
| Receta | `CookingPot` (nuevo) | `ChefHat` es Comanda de cocina, y hoy el menú lo usa para las dos |
| Costo de recetas | `Calculator` | Hoy el menú usa `DollarSign` |
| Producción | `Factory` (nuevo) | — |
| Distribución | `Route` (nuevo) | Hoy el menú usa `Truck`, igual que Proveedor |
| Traslado | `ArrowLeftRight` | — |

Ningún menú usa `Icon/Monitor`. Lo confirma el chequeo de §7.

---

## 5. Qué resuelve el diseño

Lo que hoy no funciona y cómo queda. Las referencias `archivo:línea` y las cifras están en la auditoría.

| Hoy | En el diseño |
|---|---|
| Sin estado «sin permiso» en las 10 rutas | `EmptyState Variant=forbidden` en todas, escritorio y móvil |
| Producción, Distribución y Costo sin estado «sin sucursal» | `EmptyStateSinSucursal` + `BranchBadge Scope=sin-asignar` |
| Árbol de categorías paginado por filas, búsqueda ciega a ramas cerradas, ciclos posibles | Paginación por categorías principales, búsqueda que entra en ramas y «Mover a…» con descendientes deshabilitados y su motivo |
| Columna «Productos» sin enlace; 66 % de productos sin categoría | Enlace al catálogo filtrado y KPI «Productos sin categoría» |
| Reglas de categoría sin retroalimentación | Toast «12 productos asignados…» con acción «Ver productos» |
| Slug editable sin aviso | Slug bloqueado con el motivo y un aviso de enlaces de la tienda web |
| Proveedor: 8 tarjetas apiladas, conteos de solo 10 filas y «Productos vinculados» siempre vacío | Pestañas, KPIs con conteos reales, pestaña «Productos que surte» y «Vincular producto» |
| Editar proveedor con otro formulario que reescribe datos DIAN | Un formulario único para nuevo y editar, con estado activo editable |
| Borrar un proveedor arrastra órdenes y facturas | Con documentos se ofrece desactivar; sin documentos, ConfirmDialog con el nombre |
| Etiquetas: N+1, duplicar que falla y 725 sin usar | Conteos en una consulta, «Fusionar», eliminar en lote las sin usar y validación sin distinguir mayúsculas |
| Unidades globales editables por cualquier administrador y factor que no sirve | «Del sistema» en solo lectura, unidades propias y columna de conversiones |
| Conversiones sin inversa ni validación de tipo; PAQ y CAJ globales | Inversa automática, error de tipo, «Por revisar» y «Definir por producto» |
| Imágenes: ids falsos, filtros que se anulan y hover que no existe en móvil | Pestañas Biblioteca · De productos, filtros combinables, «⋯» visible, «Usada en» y «Asignar a productos» |
| Receta: editar borra ingredientes, versión fija y doble consumo | Editor con versión N+1, carga de ingredientes, «Descuenta: al vender · al producir» y renglones que bloquean guardar sin conversión |
| Costo: máximo entre sucursales, sin respaldo, sin enlaces | Costo de la sucursal del header, fuente por fila, fila expandida y «⋯» hacia receta, producción y kardex |
| Producción: `prompt()`, fallback que marca completada sin mover stock, costo 0 | Diálogo «Completar» con motivo de diferencia y bloqueo por faltante; toast de error sin cambio de estado; costo real; consumos enlazados al kardex |
| Distribución: botón roto, stock que no se mueve y estados inválidos | Asistente de tres pasos, reparto validado, recepción con diferencias y estados reales de la BD |

---

## 6. Patrones cumplidos

- **§1 BulkActionBar.**
  - Flotante al pie y centrada en la columna.
  - El frame de escritorio crece 88 px para no tapar la paginación.
  - En móvil sustituye al MobileTabBar.
  - Los contadores coinciden con las casillas marcadas, y la casilla de cabecera queda en estado indeterminado.
- **§2 Paginación.** Una sola: `full` en escritorio y `compact` en móvil y dentro de tarjetas. El tamaño de página coincide con las filas dibujadas.
- **§3 Buscador y filtros.** Un solo SearchBar con FilterButton y chips debajo. El FilterPanel se ancla al borde izquierdo del botón, 8 px por debajo, y el botón pasa a `State=open`.
- **§4 PageHeader.** Una sola acción primaria y migas. Sin cabecera esqueletizada. El icono se sobrescribe según §4 de este documento. El `Icon/Loader` heredado del subtítulo va oculto.
- **§6 Acciones por fila.**
  - La fila abre el detalle.
  - Como máximo un icono no destructivo, más «⋯» siempre en la última columna.
  - Lo destructivo va al final, tras un divisor, y pasa por ConfirmDialog.
- **§7 Estados.** Cada uno usa su componente del kit y tiene una salida.
- **§8 Diálogos.** Anchos de 440, 520, 560, 672 y 1024 px.
  - «Cancelar» a la izquierda y el primario a la derecha.
  - El primario responde al título: «¿Desactivar…?» → «Desactivar»; «¿Cancelar OP-0014?» → «Cancelar orden».
- **§9 y §10 Sucursal.**
  - Catálogos: ámbito de organización, sin BranchBadge.
  - Producción, Distribución y Costo de recetas: ámbito de sucursal, con BranchBadge y el estado «sin sucursal».
- **§11 Capas flotantes.** Los menús se anclan al borde derecho del disparador, 4 px por debajo, con 8 entradas como máximo. Si no caben, el frame crece.
- **§12.1** Ninguna anotación dentro de un frame.

---

## 7. Verificación por script

Se ejecutó el 2026-09-23 sobre las 10 secciones de `04` y la de `02`.

| Chequeo | Resultado |
|---|---|
| Solapes entre secciones del carril y con secciones ajenas | 0. Tras volver a apilar mis secciones: la de Proveedores creció al añadir los clones y se desplazaron hacia abajo las siguientes |
| Solapes entre nodos de primer nivel dentro de cada sección | 0 |
| Nodos fuera de su sección | 0 |
| Instancias rotas (`getMainComponentAsync` nulo) | 0 |
| Textos truncados (medición del texto frente al ancho o alto disponible) y textos que desbordan su contenedor | Salieron 7 y se corrigieron. Rechequeo: 0 |
| `Icon/Monitor` en menús o en cualquier parte | 0 |
| Anotaciones dentro de frames | 0 |

La anotación del formulario de edición de categoría se corrigió después del chequeo. Ahora dice que `slug` y `meta_title` ya no se regeneran (`CategoryForm.tsx:105-118`) y que lo que sigue roto es `meta_description` (`:117 · :125`).

---

## 8. Capturas

Guardadas en `docs/design/figma/`:

- `35-catalogo-00-conexiones.png`: mapa y tabla de enlaces.
- `35-catalogo-01-categorias-arbol.png`, `…-02-categoria-detalle.png` y `…-03-categoria-editar.png`.
- `35-catalogo-04-proveedores-listado.png`, `…-05-proveedor-detalle.png` y `…-06-proveedor-formulario.png`.
- `35-catalogo-07-etiquetas.png`, `…-08-unidades.png` y `…-09-conversiones.png`.
- `35-catalogo-10-imagenes.png` y `…-11-recetas.png`.
- `35-catalogo-12-receta-editor.png` y `…-13-costo-recetas.png`.
- `35-catalogo-14-produccion.png` y `…-15-orden-produccion.png`.

Faltan dos, porque se alcanzó el límite de llamadas del MCP de Figma: el listado de distribución (`606:159582`) y el paso 2 del asistente (`607:163711`). Se exportan con `get_screenshot` cuando se renueve el cupo.

---

## 9. Cambios de backend y base de datos

La lista completa está en `AUDITORIA-CATALOGO-PRODUCCION.md` §13. Lo imprescindible para que el diseño funcione:

1. **RLS** de `units`, `unit_conversions` globales, `shared_images`, y la lectura anónima de `categories` y `product_tags`.
2. **RPC transaccionales:**
   - `complete_production_order` corregida y sin fallback.
   - `save_recipe_version`.
   - `create_distribution`, `ship_transfer` y `receive_transfer`, que sustituyen la inexistente `update_stock_level`.
3. **Columnas nuevas:**
   - `units.organization_id` y `unit_conversions.product_id`.
   - Vínculo `production_orders` ↔ traslados.
   - UNIQUE en `unit_conversions` y en `lower(product_tags.name)`.
4. **Vistas de agregados** para los conteos que hoy se calculan en el navegador: categorías, proveedores, etiquetas, unidades, imágenes y costo por sucursal.
5. **Rutas que deben leer sus parámetros:** `?supplier=`, `?categoria=` y `?etiqueta=`. Además, arreglar la ruta de proveedor de la búsqueda global y resolver los permisos en el servidor.

---

## 10. Dudas para el dueño (máximo 5)

1. **Unidades propias:**
   - ¿Se permite que cada organización cree unidades (bulto, atado)? Requiere `units.organization_id`.
   - ¿O el sistema mantiene la lista cerrada de 13 y solo se añaden conversiones?
2. **Conversiones por producto:** PAQ = 10 UN y CAJ = 25 UN hoy valen para todos los productos. ¿Se pasan a conversión por producto y se retiran las globales?
3. **Recetas:** cuando un producto se produce por orden y además se vende, ¿el descuento es siempre «al producir»? El diseño obliga a elegir uno de los dos modos por receta.
4. **Proveedores:**
   - ¿Se usan la jerarquía `parent_supplier_id` (persona vinculada a una empresa) y el `rating`, o se retiran?
   - Hoy hay 0 filas con cualquiera de los dos.
5. **Etiquetas:** hay 725 sin usar. ¿Se autoriza una limpieza de datos con el script de fusión y borrado, organización por organización, o se deja a cada cliente?
