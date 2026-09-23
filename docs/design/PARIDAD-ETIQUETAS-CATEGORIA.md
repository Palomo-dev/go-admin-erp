# Paridad — Imprimir etiquetas, códigos de barras y alta rápida de categoría

Fecha: 2026-09-22 · Archivo Figma: «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`)
Páginas tocadas: **`04 Inventario`** (cinco Secciones nuevas) y **`09 Documentos`** (dos Secciones nuevas).
Solo diseño: no se tocó código, ni base de datos, ni se hicieron commits.
Sin nombres de organizaciones cliente: «Mi empresa S.A.S.», «Sucursal Principal», «Sucursal Norte».

Norma que aplica: `PATRONES-TRANSVERSALES.md` (§1 barra masiva, §5 tablas, §6 acciones por fila,
§7 estados, §8 diálogos, §11 capas flotantes, §12 «al instanciar, sobrescribir», §13 iconos).
Motor de impresión: `DOCUMENTOS-PDF.md` §5 — **no se inventa un motor nuevo**.

---

## 0. Resumen en cinco frases

1. **Nada de esto existe hoy en el código.** Ni «Imprimir etiquetas», ni «Códigos de barras», ni
   el menú «…» del detalle de producto. Todo va marcado **Nuevo**.
2. **«Etiquetas» en Inventario hoy significa *tags***, no etiquetas de papel
   (`src/app/app/inventario/etiquetas/`, `types.ts:1` → `ProductTag`). Las únicas etiquetas
   imprimibles reales del sistema están en Transporte (`shipping_labels`). El diseño usa
   **«Imprimir etiquetas»** para el papel y deja «Etiquetas» como tags: hay que resolver esa
   colisión de nombre antes de implementar (duda 1).
3. **Sí existe a medias la generación de código de barras**, y es un problema: hay **dos copias**
   del mismo generador (`nuevo/InformacionBasica.tsx:177-182` y `id/tabs/DetallesTab.tsx:142-150`)
   que producen **12 dígitos al azar + dígito de control**. Eso fabrica un EAN-13 formalmente
   válido **dentro del rango GS1 de otro fabricante**, y no comprueba unicidad.
4. **La variante ya puede tener su propio código**: no existe tabla `product_variants`; la variante
   es una fila de `products` con `parent_product_id`, así que hereda la columna `barcode`. **No hace
   falta columna nueva.** Lo que falta es dejar de heredar el código del padre, un índice único, y
   que el índice de búsqueda deje de excluir a las variantes.
5. **El alta rápida de categoría existe en un solo sitio** (`nuevo/InformacionBasica.tsx:583-593`)
   y le faltan slug, color e icono. Se rediseña completa y se lleva a los cinco sitios donde debe
   estar.

---

## 1. Secciones y frames creados

### `09 Documentos`

| Sección | Node | Frames | Contenido |
|---|---|---|---|
| Componentes — Etiquetas (Nuevo) | `511:257339` | 2 sets | `Doc/Código de barras` (Formato × Estado, 4 variantes) · `Doc/Etiqueta de producto` (Formato × Precio, 6 variantes) |
| Etiquetas de producto (Nuevo) | `511:257344` | 6 | Hoja carta 3 × 8 · hoja A4 3 × 8 · rollo 50 × 25 mm · etiqueta ampliada con zonas · etiqueta sin precio (vitrina) · tabla «de dónde sale cada dato» |

### `04 Inventario`

| Sección | Node | Frames | Contenido |
|---|---|---|---|
| Componentes — Etiquetas y categoría (Nuevo) | `513:262594` | 1 set | `QuickCategoryForm` — Layout (desktop · hoja) × Estado (listo · validando · duplicado · guardando · error) = 10 variantes |
| Etiquetas y códigos — cómo se llega (Nuevo) | `516:268810` | 3 | Detalle › menú «…» (escritorio y móvil) · Catálogo › barra masiva con su «⋯» abierto |
| Imprimir etiquetas (Nuevo) | `516:274675` | 5 | Diálogo 1.024: listo · sin código · generando · error · hoja móvil |
| Códigos de barras (Nuevo) | `518:273568` | 7 | Diálogo 880: listo · sin pendientes · generando · error parcial · hoja móvil · campo en el formulario · campo en la variante |
| Alta rápida de categoría — completa | `520:61612` | 9 | SearchSelect abierto · 5 estados escritorio · 2 estados móvil · tabla «dónde aplica» |

Las cinco Secciones de `04` se colocaron en un **carril propio a la derecha** (`x = 13.000`), fuera
de la columna `x = 0…11.750` que usan las Secciones existentes, porque hay otros agentes añadiendo
Secciones al pie de esa página al mismo tiempo.

> **Incidente que hay que reparar.** Mientras trabajaba al pie de la página apareció una Sección
> nueva llamada **«Kardex»** (`y = 124.300`, 1.400 px de alto, `node 513:267059`), creada por otro
> agente. Al limpiar restos de un intento fallido mío la borré por error, y el API de Figma **no
> permite deshacer** (`triggerUndo` no está disponible). Estaba recién creada y probablemente vacía
> o casi, pero **hay que comprobarlo en el historial de versiones de Figma y restaurarla**. De ahí
> el cambio a un carril propio: no volver a tocar el pie de la página mientras haya otros agentes.

Capturas: `docs/design/figma/31-etiquetas-componentes.png`, `31-etiquetas-plantilla.png`,
`31-etiquetas-entradas.png`, `31-etiquetas-dialogo.png`, `31-etiquetas-codigos.png`,
`31-categoria-componente.png`, `31-categoria-estados.png`.

---

## 2. Paridad — A. Imprimir etiquetas

Ninguna fila es «calcado»: el control no existe. La columna «# auditoría» apunta a la sección de
`AUDITORIA-CONTROLES-PRODUCTOS-POS.md` donde consta la **ausencia**, o al archivo:línea cuando la
auditoría no lo cubre.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.2 (l.82: «no existe botón «…»») | Entrada «Imprimir etiquetas» en el menú «…» del detalle | `Escritorio / Detalle de producto — menú «…»` | **Nuevo** · el producto y sus variantes llegan precargados |
| A.2 | Entrada «Imprimir etiquetas» en la hoja «…» móvil | `Móvil / Detalle de producto — hoja «…»` | **Nuevo** |
| C.7 (`AccionesMasivas.tsx:246-318`) | Acción «Imprimir etiquetas» para la selección | `Escritorio / Catálogo — barra masiva · menú «⋯»` | **Nuevo** · entra por el «⋯», no como sexto botón (patrón 1) |
| — | Lista de productos seleccionados con su variante | `Diálogo · Imprimir etiquetas — listo` | **Nuevo** |
| — | Cantidad de etiquetas editable por fila | idem · `NumberInput` del kit | **Nuevo** |
| — | «Aplicar a todos» con su cantidad | idem | **Nuevo** |
| — | Contador «24 etiquetas en total» | idem | **Nuevo** |
| — | Formato: papel (hoja troquelada / rollo) | idem · `Select` del kit | **Nuevo** |
| — | Formato: tamaño en mm y cuántas por hoja | idem · `Select` | **Nuevo** · carta 63,5 × 33,9 (24/hoja), A4 70 × 37 (24/hoja), rollo 50 × 25 |
| — | «Empezar en la casilla» (hoja ya empezada) | idem · `NumberInput` | **Nuevo** · no estaba pedido; sin él se desperdicia media hoja |
| — | Qué se imprime: nombre, precio, código, SKU, variante, sucursal, fecha, logo | idem · 8 `Switch` del kit | **Nuevo** |
| — | Origen del código: el del producto, y si no, generar | idem · dos opciones excluyentes | **Nuevo** |
| — | «Generar ahora» en línea para la fila sin código | idem · fila 2 de la lista | **Nuevo** · enlaza con el diálogo de códigos |
| — | Vista previa de la hoja | idem · columna derecha, instancias de `Doc/Etiqueta de producto` | **Nuevo** |
| — | Botón «Imprimir» | idem · pie | **Nuevo** |
| — | Botón «Vista previa PDF» | idem · pie | **Nuevo** |
| — | Estado «listo» | `Diálogo · Imprimir etiquetas — listo` | **Nuevo** |
| — | Estado «sin productos con código» | `… — sin-código` | **Nuevo** · aviso + «Generar códigos ahora» + primario deshabilitado con la razón visible (patrón 6.6) |
| — | Estado «generando» | `… — generando` | **Nuevo** · `Progress` del kit, nunca un spinner dibujado a mano |
| — | Estado «error» | `… — error` | **Nuevo** · banda de peligro + «Reintentar»; la selección se conserva (patrón 7) |
| — | Móvil | `Móvil / Imprimir etiquetas — hoja` | **Nuevo** · tarjetas en vez de tabla (patrón 5), pie fijo |
| — | Plantilla imprimible carta | `Carta 216 × 279 mm — rejilla 3 × 8` (`09`) | **Nuevo** |
| — | Plantilla imprimible A4 | `A4 210 × 297 mm — rejilla 3 × 8` (`09`) | **Nuevo** |
| — | Plantilla rollo de impresora de etiquetas | `Rollo 50 × 25 mm` (`09`) | **Nuevo** |
| — | Etiqueta individual con sus zonas | `Etiqueta individual — zonas` (`09`) | **Nuevo** |
| — | Variante sin precio para vitrina | `Etiqueta sin precio — vitrina` (`09`) | **Nuevo** |
| A.11 | Pestaña «Etiquetas» del detalle (tags) | — | **Omitido con motivo**: son *tags* de clasificación, no etiquetas de papel. Ya está dibujada en «Producto — Imágenes · Proveedores y etiquetas». No se toca. |
| — | Etiqueta de envío (`shipping_labels`) | — | **Omitido con motivo**: es otro dominio (Transporte) y ya tiene su propio flujo. Solo se reutiliza su patrón técnico. |

**Sustituciones (lo roto que no se calca).** El único impresor de códigos de barras que existe hoy
(`shipmentLabelPrinter.ts:500-549` y `usePrintPreview.ts:88-99`) **inyecta JsBarcode desde un CDN**
(`cdn.jsdelivr.net/npm/jsbarcode@3.11.6`) aunque `jsbarcode@3.12.3` está instalado en
`package.json:80` y **nunca se importa**. En el diseño el código de barras es el componente
`Doc/Código de barras` del kit y en la implementación debe salir del paquete instalado: una
etiqueta que necesita internet para imprimirse no sirve en una caja sin red.

---

## 3. Paridad — B. Códigos de barras

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.7 | Acción masiva «Generar códigos de barras» | `Escritorio / Catálogo — barra masiva · menú «⋯»` | **Nuevo** |
| A.2 | Entrada «Códigos de barras» en el menú «…» del detalle | `Escritorio / Detalle de producto — menú «…»` | **Nuevo** |
| A.2 | La misma entrada en la hoja móvil | `Móvil / Detalle de producto — hoja «…»` | **Nuevo** |
| — | Contador y lista de productos y variantes sin código | `Diálogo · Generar códigos de barras — listo` | **Nuevo** |
| — | Formato EAN-13 | idem · opción con su advertencia | **Nuevo** |
| — | Formato Code128 interno (opción por defecto) | idem | **Nuevo** |
| — | Prefijo de la organización | idem · `FormField` | **Nuevo** · **no existe la columna** (§5) |
| — | Numeración correlativa («Empezar en») | idem · `NumberInput` | **Nuevo** · **no existe la tabla** (§5) |
| — | Longitud del código | idem · `Select` | **Nuevo** |
| — | Vista previa de los primeros códigos | idem · 3 instancias de `Doc/Código de barras` | **Nuevo** |
| — | Estado «listo» | `… — listo` | **Nuevo** |
| — | Estado «sin productos sin código» | `… — sin-pendientes` | **Nuevo** · `EmptyState Variant=empty` del kit |
| — | Estado «generando con progreso» | `… — generando` | **Nuevo** · `Progress` con «5 de 7» |
| — | Estado «error parcial con los que fallaron» | `… — error-parcial` | **Nuevo** · los 5 correctos quedan guardados; «Reintentar los 2», no los 7 |
| — | Móvil | `Móvil / Generar códigos de barras — hoja` | **Nuevo** |
| A.3 (`DetallesTab.tsx:303-324`) | Campo «Código de Barras» en el detalle | `Formulario de producto — campo «Código de barras»` | **Sustituido**: el campo se calca, el **botón se rehace**. Hoy `generateBarcode()` inventa un EAN-13 al azar (`DetallesTab.tsx:142-150`); pasa a generar Code128 con prefijo y correlativo, y a validar el dígito de control cuando el formato lo exige. |
| — (`nuevo/InformacionBasica.tsx:256-280`) | El mismo campo en «Nuevo producto» | idem | **Sustituido** · y se **deduplica**: hoy el generador está copiado en dos archivos |
| A.4 (`VariantesTab.tsx:1058-1065`) | «Código de Barras (opcional)» de la variante | `Variante — campo «Código de barras» propio` | **Sustituido**: se calca el campo y **se elimina la herencia**. Hoy, si se deja vacío, la variante hereda el del padre (`nuevo/Variantes.tsx:793-799`, `NuevoProductoForm.tsx:508`): dos tallas acaban con el mismo código y la caja cobra la primera que encuentra. |
| B.2 (`ProductSearch.tsx:231-239`) | Escaneo por cámara en el POS | — | **Omitido con motivo**: fuera de alcance de esta tanda. Queda registrado que `src/components/ui/barcode-scanner.tsx:55` devuelve `"7501234567890"` fijo a los 3 s — **la cámara es simulada**. Sin lector real, la etiqueta solo sirve con lector físico (`barcodeWedge.ts`, que sí funciona). |
| — | Reemplazar un código ya existente | — | **Omitido con motivo**: el diálogo masivo solo rellena huecos. Reemplazar un código es una decisión por producto y se hace desde el propio producto; hacerlo en masa rompe etiquetas ya impresas. |

---

## 4. Paridad — C. Alta rápida de categoría

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| — (`InformacionBasica.tsx:364-379`) | Botón «+ Nueva» junto al selector de categoría | `SearchSelect de categoría — abierto con «Crear categoría»` | **Sustituido**: la creación entra **dentro** del `SearchSelect`, como la última fila del desplegable. Hoy es un botón aparte, y el `SearchSelect` del código (`src/components/ui/search-select.tsx`) **no acepta `onCreate`**: hay que añadirle esa ranura. En el kit de Figma el componente ya publica la propiedad «Mostrar crear». |
| — (`QuickCategoryForm.tsx:128-140`) | Campo «Nombre» | `QuickCategoryForm · listo` | **Calcado** |
| — (`QuickCategoryForm.tsx:142-160`) | «Categoría Padre» | idem | **Sustituido**: hoy es un `Select` plano con los hijos prefijados por `└ `; pasa a `SearchSelect` sobre el árbol real, como pidió el dueño |
| — | **Slug** prefijado y editable | idem | **Nuevo** · hoy el slug se genera en silencio (`handleNameChange`, `QuickCategoryForm.tsx:64-73`) y no se ve |
| — | Aviso de que el slug es la dirección pública | idem · nota bajo el campo | **Nuevo** |
| — | Estado «validando slug» | `QuickCategoryForm · validando` | **Nuevo** |
| — | Estado «slug duplicado» con alternativa concreta | `QuickCategoryForm · duplicado` | **Nuevo** |
| — (`CategoryForm.tsx:372-374`) | **Color** | `QuickCategoryForm · listo` | **Nuevo en el alta rápida** (existe en el formulario completo). `categories.color` existe, con `DEFAULT '#6366f1'` |
| — (`CategoryForm.tsx:376-382`) | **Icono** | idem | **Nuevo en el alta rápida**. `categories.icon` existe |
| — | Aviso «imagen, SEO y orden se completan después» + enlace | idem | **Nuevo** |
| — (`QuickCategoryForm.tsx:232-250`) | Botones «Cancelar» y «Crear Categoría» | idem · pie | **Sustituido**: el primario pasa a **«Crear y seleccionar»**, que es lo que de verdad hace |
| — (`QuickCategoryForm.tsx:240-250`) | Estado «Guardando...» | `QuickCategoryForm · guardando` | **Calcado** (ya existía) |
| — | Estado «error al guardar» | `QuickCategoryForm · error` | **Nuevo** · hoy solo hay un toast y el formulario no dice nada |
| — | Móvil | `QuickCategoryForm móvil · listo` y `· duplicado` | **Nuevo** · hoy el diálogo es `max-w-4xl` sin variante móvil |
| — (`QuickCreateDialog.tsx`) | El panel que lo envuelve | — | **Omitido a propósito**: el componente **ya trae cabecera y pie**, así que no se envuelve en otro panel. Es el error que ya se corrigió en el alta rápida de cliente (`shared/form-dialogs/ClienteFormDialog.tsx`, que pasa `embedded` al formulario interior). |
| — (`QuickCategoryForm.tsx:162-177`) | Campo «Descripción» | — | **Omitido con motivo**: en el alta rápida ocupa sitio y no decide nada; se completa después. El campo sigue existiendo en el formulario completo. |
| — (`QuickCategoryForm.tsx:179-213`) | «Estación de cocina/bar» y «Requiere preparación» | — | **Omitido con motivo**: solo aplican a restaurantes y no bloquean el alta. Se dejan al formulario completo. Si el dueño lo prefiere, vuelven detrás de un «Más opciones» (duda 4). |
| — (`QuickCategoryForm.tsx:215-226`) | Interruptor «Estado (activa/inactiva)» | — | **Omitido con motivo**: una categoría recién creada para asignarla a un producto nace activa por definición. |

### Dónde se aplica

| Dónde | Hoy | Con el cambio |
|---|---|---|
| Producto nuevo › Información básica | `QuickCategoryForm` dentro de `QuickCreateDialog` (`InformacionBasica.tsx:583-593`) | La hoja completa, **sin envolver** |
| Editar producto › pestaña Detalles | `SearchSelect` **sin** opción de crear (`DetallesTab.tsx:329`) | La misma hoja, desde el propio `SearchSelect` |
| Formulario de edición completo | No hay alta rápida (`FormularioEdicionProducto.tsx`) | La misma hoja |
| Acciones masivas › «Categoría» | Solo un `Select` de las existentes (`AccionesMasivas.tsx:496`) | La misma hoja, para no salir del flujo masivo |
| Importar productos (CSV) | Crea categorías por nombre, sin interfaz ni slug revisable (`importar/page.tsx`) | La misma hoja para cada categoría nueva detectada en el mapeo |
| POS › barra de categorías | Solo filtra (`CategoryFilterBar.tsx:95`) | **No aplica**: el POS no crea catálogo |
| Catálogo › filtros | Solo filtra (`FiltrosProductos.tsx:147`) | **No aplica** |

---

## 5. Qué falta en la base de datos

Comprobado con el MCP de Supabase el 2026-09-22, **solo lectura**. Nada de esto se aplicó.

### 5.1 Lo que ya existe y solo hay que consultar

| Dato | Dónde vive |
|---|---|
| Código de barras del producto **y de la variante** | `products.barcode` — la variante es una fila de `products` con `parent_product_id`; no existe tabla `product_variants` |
| Variante legible | `products.variant_data` (jsonb) y `variant_values.value` vía `product_variant_relations` |
| SKU | `products.sku`, único por organización (`idx_products_org_sku_unique`) |
| Precio | `product_prices` vigente por `effective_from` / `effective_to` |
| Moneda y decimales | `organization_currencies.is_base` |
| Color e icono de categoría | `categories.color` (`DEFAULT '#6366f1'`) y `categories.icon` |
| Unicidad del slug | `categories_organization_id_slug_key` sobre `(organization_id, slug)` |

### 5.2 Lo que falta — migraciones aditivas propuestas (sin aplicar)

1. **`organization_barcode_settings`** — prefijo interno de la organización, formato por defecto
   (`code128` / `ean13`), longitud y prefijo GS1 si lo tiene. Hoy **no existe ninguna columna
   `prefix` fuera de `invoice_sequences` y `sale_sequences`**.
2. **`barcode_sequences`** — correlativo por organización, a imagen de `invoice_sequences`
   (`prefix`, `range_start`, `range_end`, `current_number`, `is_active`). Sin correlativo, la
   única alternativa es el azar, que es lo que hace el código de hoy.
3. **Índice único parcial sobre `products (organization_id, barcode)`** donde `barcode` no sea nulo
   ni vacío. Hoy **no hay ninguno**: medido, hay **176 códigos repetidos dentro de su propia
   organización**. Antes de crearlo hay que limpiar esos 176.
4. **Ampliar `idx_products_barcode_trgm`**, que hoy es
   `... WHERE (parent_product_id IS NULL)`: **el índice de búsqueda por código excluye a las
   variantes**, que es justo donde vive el caso real de dos tallas con códigos distintos.
5. **Ampliar el `CHECK` de `print_jobs.job_type`** con `'product_label'`. De paso: el código ya
   inserta `'shipment_guide'` (`printJobsService.ts:860`) y **ese valor tampoco está en el CHECK**
   del esquema; es un error aparte que conviene arreglar en la misma migración.

### 5.3 Cobertura medida (2026-09-22)

| Medida | Valor |
|---|---|
| Productos | 53.319 |
| Con código de barras | 2.996 (**5,6 %**) |
| Con 13 dígitos (plausible EAN-13) | 482 |
| Variantes (filas con `parent_product_id`) | 29.094 |
| Variantes con código propio | 1.103 (**3,8 %**) |
| Productos padre | 7.469 · con código: 360 |
| Códigos repetidos dentro de su organización | **176** |
| Categorías | 1.113 · sin slug: 0 |

---

## 6. Chequeo por script

Ejecutado sobre las siete Secciones nuevas con el MCP de Figma.

| Criterio | `04 Inventario` | `09 Documentos` |
|---|---|---|
| Secciones que se solapan entre sí | **0** (sobre las 22 Secciones de la página) | **0** (sobre las 7) |
| Frames de primer nivel que se solapan dentro de su Sección | **0** (25 frames) | **0** (8 frames) |
| Nodos que se salen de su Sección | **0** | **0** |
| Instancias rotas (`getMainComponentAsync` = null) | **0** de 936 | **0** de 118 |
| Anotaciones dentro de frames | **0** — todas son hijas directas de la Sección | **0** |
| Anotaciones que solapan un frame | **0** (se recolocaron 24) | **0** |
| Contenido que desborda su frame | **9**, todos **heredados** de los frames aprobados que se clonaron | **0** |
| Textos truncados | **0** introducidos | **0** |

**Sobre los 9 desbordes heredados.** Salen de los tres frames aprobados que se clonaron como
contexto, y están **idénticos en el original**: `188:53241` (1: `Pestañas ← Rect`), `120:12741`
(7: `TableCell` sobresaliendo de su fila) y `188:55285` (1: `Frame ← Contador`). No se corrigen
aquí porque el original pertenece a otra Sección y a otra tanda; queda anotado para quien la
mantenga.

**Sobre los textos truncados.** Los únicos nodos con recorte activo son (a) el nombre del producto
dentro de `Doc/Etiqueta de producto`, que **debe** recortarse a dos líneas porque la etiqueta mide
63,5 mm, y (b) las etiquetas de la barra lateral dentro de los frames clonados, que ya venían así.
En las etiquetas a tamaño real de `09` el nombre entra completo.

**Instancias del kit por debajo de su ancho publicado.** Medido: de **564** instancias en mis
Secciones de `04`, 385 son más estrechas que su componente publicado; **105 por `FILL`** dentro de
una auto-layout (el uso previsto) y **280 por tamaño explícito**. Ese segundo grupo es, casi todo,
**iconos**: el kit los publica a 24 y el patrón 13 los exige a **20 en cabecera y 16 en menús,
filas y botones**, así que salen contados aunque sean correctos. Lo que queda son botones que se
ajustan a su texto (`Cancelar` 94 de 118), los `NumberInput` de columna (96–110 de 200) y las 72
miniaturas de etiqueta de la vista previa (90 de 240), que son miniaturas a propósito.

Para que el número signifique algo, la misma medida sobre una Sección ya aprobada —«Escritorio —
productos»— da **1.998 de 3.246** instancias más estrechas sin `FILL`, con `TableCell` a 44–130 de
160 y `NumberInput` a 100–130 de 200. Es decir: **el criterio tal cual no se cumple en ninguna
Sección del archivo, ni en las aprobadas**, porque el kit publica los iconos a 24 y los
contenedores a su ancho de exhibición. Mis Secciones están dentro de esa misma convención y, en
proporción, algo por debajo (50 % frente a 61 %). **Ninguna instancia se estrechó por debajo de un
ancho en el que deje de leerse**; conviene redefinir el criterio antes de la próxima tanda
(duda 6, si el dueño quiere una sexta).

---

## 7. Dudas abiertas para el dueño

1. **«Etiquetas» ya significa otra cosa.** En Inventario, «Etiquetas» son *tags* de clasificación
   (`/app/inventario/etiquetas`, pestaña «Etiquetas» del detalle). El menú nuevo dice «Imprimir
   etiquetas», que se lee distinto, pero en el listado lateral van a convivir. ¿Renombramos los
   tags a «Marcas» o «Clasificación», o aceptamos los dos sentidos?
2. **El escáner de cámara del POS es simulado.** `src/components/ui/barcode-scanner.tsx:55`
   devuelve `"7501234567890"` fijo. Con lector físico sí funciona (`barcodeWedge.ts`). ¿Entra el
   lector de cámara real en esta cadena o se deja para otra tanda?
3. **Prefijo GS1.** El diseño propone Code128 interno por defecto y EAN-13 solo con prefijo GS1
   propio. ¿La empresa tiene prefijo GS1 asignado, o damos por hecho que no y dejamos EAN-13 como
   opción avanzada con advertencia?
4. **Estación de cocina en el alta rápida.** El alta rápida actual pregunta «Estación
   (cocina/bar)» y «Requiere preparación». Las he dejado fuera para no alargar la hoja. ¿Las
   devolvemos detrás de un «Más opciones» para las organizaciones de restaurante?
5. **Los 176 códigos repetidos.** El índice único no se puede crear sin limpiarlos antes.
   ¿Los renumeramos automáticamente con el correlativo nuevo (y se reimprimen sus etiquetas), o
   se listan para que alguien decida uno por uno?

---

## Adenda 2026-09-23 — «Etiquetas» (tags) y la pantalla de categorías

Esta adenda se añade al final, sin reescribir lo anterior.

**Colisión de nombre (duda 1).** Se resolvió en el diseño:

- La pantalla de tags se titula **«Etiquetas de producto»** y usa el icono `Tag`. Está en la sección `591:325136`.
- «Imprimir etiquetas» (x = 13.000) sigue siendo el papel y no se tocó.

**Uso de las secciones de esta tanda:**

- El `QuickCategoryForm` completo de esta tanda (`513:259550`) se **instancia** en la sección de Categorías (`586:290667`), en sus estados «listo» y «duplicado».
- Esa sección añade:
  - el árbol con `TreeCell` (Nuevo);
  - el detalle;
  - el formulario completo de edición, con el slug bloqueado;
  - el diálogo «Mover a…», que deshabilita los descendientes.

**Cifras de la base de datos sobre los tags:**

- 729 etiquetas en total. Solo 4 tienen uso, con 163 relaciones.
- Hay 4 pares con el mismo nombre en distinta mayúscula.

El diseño añade «Fusionar» y «Eliminar sin usar».
