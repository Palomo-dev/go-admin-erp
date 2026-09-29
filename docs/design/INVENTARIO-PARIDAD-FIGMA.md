# Inventario — paridad código ↔ Figma y variantes (tipos y valores)

Auditoría del 2026-09-28. Archivo de Figma `EAvjINVRnlzFM70GVoWXgl`, página `04 Inventario`
(`264:98912`). Base de datos consultada solo con `SELECT` (proyecto `jgmgphmzusbluqhuqihj`),
con conteos y sin datos personales. Las organizaciones se nombran por id.

Enlaces: `https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=<id con guion>`.

Contenido:

1. Paridad por área (qué hay en código y si tiene frame)
2. Variantes: tipos y valores. Cómo funcionan hoy y veredicto
3. Propuesta: página «Variantes» y cambios de BD y backend
4. Qué se dibujó en Figma y verificación
5. Pendiente

---

## 1. Paridad por área

**Prioridad.** ALTA: la pantalla o el diálogo existe en código y no tiene frame, y es un flujo
de trabajo real. MEDIA: estado o diálogo secundario, o tableta. BAJA: variante de un estado ya
dibujado.

**Hallazgo transversal: no hay ningún frame de tableta en Inventario.** La única excepción es el
`F6 · Tablet 834` de la propuesta de recetas (`963:171748`), que hace otro agente. El patrón está
definido: 834 de ancho, `Sidebar Mode=rail` de 72 y contenido de 762. En esta ronda se dibujaron
dos tabletas para Variantes. Para el resto de áreas queda como MEDIA.

**Hallazgo transversal en código: ninguna ruta de Existencias comprueba permisos.** No hay 403
en stock, movimientos, ajustes, traslados, seriales, garantías ni trazabilidad. En catálogo solo
lo hace Categorías (`useArbolCategorias.ts:107`). Figma sí dibuja «sin permiso» en todas: aquí
Figma va por delante del código.

### 1.1 Movimientos y stock

| Pantalla u opción | Código | Figma | Prioridad |
|---|---|---|---|
| Stock · listado, cargando, vacío/sin resultados (hoy un solo texto) | `components/inventario/stock/StockTable.tsx:219-236` | `582:277572` y 6 estados · móvil `585:284626` | ✔ |
| Stock · filtros (sucursal, categoría, estado) | `StockFilters.tsx:57-118` | `584:281252` | ✔ |
| Stock · ⋯ de fila (Ver producto, Crear ajuste, Crear transferencia) | `StockTable.tsx:367-385` | `584:281747` | ✔ · **bug de código:** «Crear transferencia» no hace nada porque `stock/page.tsx:252` no pasa `onCreateTransfer` |
| Stock · Exportar CSV | `stock/page.tsx:163` | acción de cabecera, sin frame propio | BAJA |
| Stock · tableta | — | falta | MEDIA |
| Movimientos · listado y estados | `movimientos/MovimientosTable.tsx:91-108` | `586:286575` y 6 estados · móvil `586:295537` | ✔ |
| Movimientos · filtros (fechas, origen, dirección, «solo ingredientes») | `MovimientosFilters.tsx:77-190` | `586:294524` | ✔ |
| Movimientos · ⋯ (Ver producto, Ver documento) | `MovimientosTable.tsx:236-247` | `586:295053` | ✔ |
| Movimientos · tableta | — | falta | MEDIA |

### 1.2 Ajustes

| Pantalla u opción | Código | Figma | Prioridad |
|---|---|---|---|
| Listado y estados | `ajustes/AjustesTable.tsx:84-105` | `586:303291` y 5 estados | ✔ |
| ⋯ de fila (ver, editar, aplicar, cancelar, eliminar) | `AjustesTable.tsx:196-234` | `586:306452` | ✔ · **bug de código:** «Editar» lleva a `/ajustes/[id]/editar`, ruta que no existe (`AjustesTable.tsx:205`, `AjusteDetalle.tsx:304`) |
| Confirmar aplicar / cancelar / eliminar | `ajustes/page.tsx:336, 359, 382` | `586:310249` · `586:310283` | ✔ |
| Nuevo ajuste · escritorio | `ajustes/nuevo/NuevoAjusteForm.tsx:653-950` | `586:312944` | ✔ |
| **Nuevo ajuste · móvil** (conteo con escáner) | ídem | faltaba → **dibujado `975:186644`** | ALTA |
| Detalle borrador y aplicado | `ajustes/detalle/AjusteDetalle.tsx:237-615` | `586:308354` · `586:309538` · móvil `587:305277` | ✔ |
| Captura de seriales | `NuevoAjusteForm.tsx:854` | componente `SerialCapture` `580:276137` | ✔ |
| Tableta | — | falta | MEDIA |

### 1.3 Traslados

| Pantalla u opción | Código | Figma | Prioridad |
|---|---|---|---|
| Listado y estados | `transferencias/TransferenciasTable.tsx:50-150` | `589:304084` y 5 estados · móvil `589:325777` | ✔ |
| Confirmar envío y cancelar (hoy `window.confirm`) | `TransferenciasPage.tsx:68, 90` | `589:320633` · `589:320667` | ✔ |
| Nuevo traslado · escritorio | `transferencias/nuevo/NuevaTransferenciaForm.tsx:260-485` | `589:322911` | ✔ |
| **Nuevo traslado · móvil** | ídem | faltaba → **dibujado `975:186790`** | ALTA |
| Detalle y «Recibir» | `transferencias/id/TransferenciaDetalle.tsx:470-553` | `831:535830` · `589:320397` · móvil `589:326053` | ✔ |
| Tableta | — | falta | MEDIA |

### 1.4 Seriales (sin rediseño; solo se reporta)

| Pantalla u opción | Código | Figma | Prioridad |
|---|---|---|---|
| Listado, detalle y móvil | `seriales/SerialesPage.tsx:205-359` · `SerialDetailPage.tsx:208-372` | `590:319445` y estados · `591:112363` · móvil `831:533562` | ✔ |
| Diálogo «Transferir serial» | `SerialDetailPage.tsx:422` | falta | MEDIA |
| Diálogo «Cambiar estado» | `SerialDetailPage.tsx:486` | falta | MEDIA |
| «Marcar como dañado» | `SerialDetailPage.tsx:456` | en el menú `590:322891` (sin diálogo propio) | BAJA |

### 1.5 Garantías

| Pantalla u opción | Código | Figma | Prioridad |
|---|---|---|---|
| Listado y estados | `garantias/GarantiasPage.tsx:198-361` | `592:329723` y 4 estados · móvil `593:122134` | ✔ |
| Sin resultados (hoy mismo texto que vacío) | `GarantiasPage.tsx:289` | falta | BAJA |
| Filtros (estado, resolución, fechas) | `GarantiasPage.tsx:224-269` | falta el FilterPanel abierto | MEDIA |
| Nuevo reclamo | `CreateClaimDialog.tsx:221` | `592:332573` (+ variantes en `187:51217`) | ✔ |
| Detalle y Resolver | `GarantiaDetailPage.tsx:231-507` | `593:121183` · `592:332635` | ✔ |
| **Enviar al proveedor (RMA)** | `GarantiaDetailPage.tsx:318, 580` | solo el ítem de menú → **diálogo dibujado `973:186133`** | ALTA |
| Móvil · hoja de acciones y nuevo reclamo en hoja | — | falta | MEDIA |

### 1.6 Trazabilidad

`reportes/trazabilidad/TrazabilidadPage.tsx:179-382` → `594:126325` (lote), `594:127772` (serial),
inicial, 5 estados y 7 móviles. Completo. Falta tableta (MEDIA).

### 1.7 Categorías

| Pantalla u opción | Código | Figma | Prioridad |
|---|---|---|---|
| Árbol, estados, menús, filtros y selección | `categorias/ArbolCategorias.tsx:366-709` | `586:290670` y 10 frames · 7 móviles | ✔ |
| **Importar categorías** | `ImportCategoriesDialog.tsx:241` (montado en `ArbolCategorias.tsx:709`) | faltaba → **dibujado `973:186211`** | ALTA |
| Eliminar con destino para los productos | `EliminarCategoriaDialog.tsx:76` | `586:312189` (ConfirmDialog; no muestra el selector de destino) | MEDIA |
| Mover a… | `MoverCategoriaDialog.tsx:85-100` | `586:312245` | ✔ |
| Formulario nuevo/editar | `CategoryForm.tsx:338-619` | `586:313786` | ✔ |
| Detalle | `DetalleCategoria.tsx:236-546` | `586:302540` | ✔ |
| Detalle y formulario en móvil | ídem | falta | MEDIA |

### 1.8 Proveedores

| Pantalla u opción | Código | Figma | Prioridad |
|---|---|---|---|
| Listado, estados, menú, filtros y selección | `proveedores/CatalogoProveedores.tsx:347-619` | `589:311645` y 8 frames · 7 móviles | ✔ |
| Formulario nuevo/editar | `ProveedorForm.tsx:460-912` | `589:325055` | ✔ |
| Detalle · Resumen y Productos que surte | `proveedores/detalle/ProveedorDetalle.tsx:457-463, 535` | `589:323766` · `589:324486` · móvil `590:108940` | ✔ |
| Detalle · pestañas Órdenes, Facturas, Cuentas por pagar, Pagos | ídem | solo los rótulos | MEDIA |
| Eliminar / desactivar | `DialogoEliminarProveedor.tsx:115` | `590:107076` · `590:107117` | ✔ |
| **Importar proveedores** (página completa) | `proveedores/importar/ImportarProveedores.tsx:454-672` | faltaba → **dibujado `973:185225` y móvil `975:185874`** | ALTA |
| Código muerto | `proveedores/DetalleProveedor.tsx`, `FormularioProveedor.tsx` (no se importan) | — | — |

### 1.9 Etiquetas

`etiquetas/EtiquetasPage.tsx:239-569` → sección `591:325136`: seis estados, menú, filtros,
selección, nueva, nombre repetido, fusionar, eliminar y siete móviles. Completo.

### 1.10 Unidades y conversión

| Pantalla u opción | Código | Figma | Prioridad |
|---|---|---|---|
| Unidades (hoy solo lectura) | `unidades/UnidadesPage.tsx:101-180` | `593:333689` y 8 frames (Figma va por delante) | ✔ |
| Conversiones · listado, nueva y eliminar (hoy `confirm()`) | `unidades/ConversionesPage.tsx:143, 279` | `594:339276` · `595:345330` · `595:345517` | ✔ |
| Conversiones · estados en móvil | — | solo `595:346655` (listo) | BAJA |

### 1.11 Imágenes

`imagenes/ImagenesPage.tsx:259-592` → sección `596:345914`: seis estados, menú, filtros,
selección, detalle lateral, subir, asignar a productos y siete móviles. «Editar imagen»
(`:505`) queda cubierto por el panel de detalle `596:351201`. Completo.

### 1.12 Recetas, costo de recetas y distribución (otro agente; no se dibuja aquí)

| Área | Código | Figma | Qué falta |
|---|---|---|---|
| Recetas | `recetas/RecetasPage.tsx`, `RecipeDialog.tsx:243`, detalle `:435`, eliminar `:538` | `598:142703` (17 frames) + propuesta `957:583021` | Tableta del listado. Desactivar sin confirmación en código (`:138`) |
| Costo de recetas | `reportes/costo-recetas/CostoRecetasPage.tsx:42-189` | `601:148806` (16 frames) | Tableta |
| Distribución | `distribucion/DistribucionPage.tsx:65-77`, `CrearTransferenciaDialog.tsx:168` | `606:159579` (22 frames) | Tableta. PNG pendientes de `606:159582` y `607:163711` (PARIDAD-CATALOGO-PRODUCCION §6) |

### 1.13 Variantes (tipos y valores)

| Pantalla | Código | Figma antes | Figma ahora |
|---|---|---|---|
| `/app/inventario/variantes/tipos` | `components/inventario/variantes/tipos/VariantTypesPage.tsx` | falta | sección `969:595070` |
| `/app/inventario/variantes/valores` | `components/inventario/variantes/valores/VariantValuesPage.tsx` | falta | ídem |

Las dos rutas existen y están en el menú (`lib/navigation/catalog.ts:350-351`) y en accesos
rápidos (`inventario/dashboard/AccesosRapidos.tsx:83`). Lo que sí estaba en Figma es la pestaña
Variantes del **producto** (`180:742`).

---

## 2. Variantes: tipos y valores

### 2.1 Modelo de datos (verificado con SQL)

| Pieza | Qué es | Detalle |
|---|---|---|
| `products.parent_product_id` + `is_parent` | Una variante es un producto hijo | No existe `product_variants` |
| `products.variant_data jsonb` (default `{}`) | Los atributos de la variante: `{"Talla":"M","Color":"Negro"}` | **Es lo que leen el POS, la tienda, Facebook y las páginas de variantes.** Las claves son texto libre: no hay FK al catálogo |
| `variant_types (id, organization_id, name, created_at)` | Catálogo de tipos por organización | `UNIQUE (organization_id, name)` **exacto** (distingue mayúsculas y espacios). Sin orden, sin activo, sin estilo, sin traducciones, sin `updated_at`, sin FK a `organizations`. `organization_id = 0` es el catálogo global (4 tipos, 38 valores) |
| `variant_values (id, variant_type_id, value, display_order, created_at)` | Valores del tipo | `UNIQUE (variant_type_id, value)` exacto. FK a `variant_types` con `ON DELETE CASCADE`. **Sin hex, sin imagen, sin código para SKU, sin activo, sin traducciones** |
| `product_variant_relations (product_id, variant_type_id, variant_value_id)` | Tercera fuente: relación por ids | 62.712 filas en 10 organizaciones. Solo la escribe la importación (`fn_importar_productos_lote`). FK en cascada a tipos y valores. **470 relaciones no coinciden con `variant_data`** (299 sin la clave, 171 con otro valor) |
| RLS | `variant_types_miembros` / `variant_values_miembros` (FOR ALL a miembros activos) y `*_globales_lectura` (lectura de la org 0) | Cualquier miembro activo puede renombrar o borrar el catálogo por API, sin permiso de rol |
| Triggers | Ninguno en `variant_types` ni `variant_values` | Renombrar un tipo no se propaga a `variant_data` |
| RPC | `fn_producto_int_asegurar_atributos` (crea tipo y valor sin distinguir mayúsculas; la llama `fn_producto_int_variante_guardar`) · `fn_importar_productos_lote` (igual, más relaciones) · `crear_tipo_variante` · `get_product_variations` · `variantes_de_productos` | Ver 2.5 |

### 2.2 Uso real (conteos)

- 20 organizaciones tienen catálogo propio; una más (org 133) tiene 80 variantes y **ningún tipo
  en el catálogo**.
- 3.605 pares tipo-valor en uso en `variant_data`. **215 no están en el catálogo** (133 si se
  ignoran mayúsculas y espacios).
- **112 valores del catálogo no los usa ninguna variante**, y **20 tipos** tampoco. Esos 20 no se
  ven en la página de tipos (ver 2.4), así que no se pueden borrar desde ahí.
- **Orden: en 17 de las 20 organizaciones, todos los valores tienen `display_order = 0`.** Solo la
  org 0, la 2, la 112 y parte de la 137 tienen orden.
- Duplicados por nombre, con evidencia:
  - Org 132: seis tipos para lo mismo en `variant_data` — «Talla» (491 variantes), «talla» (349),
    «Tallaje» (118), «talla.» (35), «Tallas» (21), «Tallaje Americano» (11).
  - Org 128: «ML», «ml» y «Mililitros»; «Presentacion» y «Presentación»; y «5 ml» y «10 ml»
    usados como **tipos**, cuando son valores.
  - Orgs 135 y 145: «Diseño» y «Diseño » (con espacio al final) son dos tipos. Hay 2 tipos con
    espacios sobrantes y **2 choques** que impedirían hoy un índice único sin distinguir
    mayúsculas.
  - Org 198: «Size», «Talla» y «Tamaño» a la vez.
  - 14 valores en uso repetidos por mayúsculas o espacios.
- Usos que no son variantes:
  - Org 197 usa «Referencia» como eje de variante: 1.825 valores y 11.377 variantes, más
    «REFERENCIA» con 253.
  - Org 144 usa «Fruta 1/2/3», «Granos 2» y «Liquidos» como variantes: 216 combinaciones que en
    realidad son modificadores. Además tiene 220 hijos sin atributos.
- Hay un tipo «Bebida (copia)» sin valores en la org 120: lo dejó el botón «Duplicar» de la página
  de tipos.
- 11 hijos cuelgan de un padre sin `is_parent = true`.
- Hay 0 combinaciones repetidas dentro de un mismo padre: el generador sí deduplica.

### 2.3 Dónde se definen y administran hoy

| Lugar | Qué hace | Archivo |
|---|---|---|
| Formulario del producto › Variantes | Tipos y valores con sugerencias del catálogo, generador cartesiano y combinaciones nuevas sin repetir. El guardado va por RPC y crea tipos y valores nuevos | `productos/formulario/secciones/SeccionVariantes.tsx:103`, `productos/logica/variantes.ts:29-41, 87-88`, `productos/formulario/cargarCatalogos.ts:55-87` |
| Detalle del producto › Variantes | Diálogo de variante, editor de atributos con «Guardar este valor en el catálogo» y «Crear tipo», y «Generar combinaciones» | `productos/detalle/variantes/DialogoVariante.tsx`, `EditorAtributos.tsx:72-124`, `GeneradorVariantes.tsx:78`, `catalogoAtributos.ts:84-182` |
| **/variantes/tipos** y **/variantes/valores** | Las dos «páginas de catálogo» | `variantes/tipos/*`, `variantes/valores/*` |
| Importación | Crea tipos y valores sin distinguir mayúsculas, más `product_variant_relations` | `fn_importar_productos_lote` |

### 2.4 Veredicto de funcionalidad

**Funciona de punta a punta:**

- **Crear y editar variantes desde el producto** (formulario y detalle). Las combinaciones no se
  repiten (0 en BD) y el guardado es transaccional por RPC (`fn_producto_int_variante_guardar` →
  `fn_producto_int_asegurar_atributos`). Esta RPC trata «talla» y «Talla» como el mismo tipo.
- **Venderlas en el POS.** `components/pos/VariantSelectorDialog.tsx:91-104` agrupa por
  `variant_data` y elige la variante. Tiene prueba en `__tests__/pos/venta/varianteElegida.test.ts`.
- **Venderlas en la tienda.** `goadmin-websites/components/site/VariantSelector.tsx`.
- **Importarlas por CSV o lote**, que alimenta el catálogo sin duplicar por mayúsculas. **Exportarlas**
  como JSON (`productos/importar/exportarCatalogoCsv.ts:83`).
- **Mandarlas a Facebook.** `lib/services/facebookCatalog/formatoMeta.ts:150-159` mapea por el nombre
  del tipo (color, talla/tamaño/size, material, género, edad, patrón).

**A medias:**

- **Orden.** POS, tienda y Facebook ordenan los valores **alfabéticamente**
  (`lib/pos/venta/modificadores.ts:138`, `VariantSelector.tsx:74`). Resultado: «L, M, S, XL, XS».
  `display_order` no se usa en la venta, y además vale 0 en casi todo.
- **Colores.** No hay hex ni imagen por valor en ningún sitio. El POS y la tienda muestran texto.
- **Idiomas.** Los nombres de tipos y valores no se traducen (no hay columna). Las páginas de
  variantes tienen los textos en duro: 0 `useTranslations`. Solo existen las claves del menú
  (`nav.paginas.inventario_variantes_*`).
- **Tres fuentes de verdad** (`variant_data`, catálogo y `product_variant_relations`) que ya no
  coinciden: 215 pares en uso fuera del catálogo y 470 relaciones divergentes.
- **Sugerencias truncadas.** `catalogoAtributos.ts:96` lee como máximo 2.000 variantes, y la org
  137 tiene 21.142.
- **Facebook.** Los tipos que no calzan con la heurística se pierden: «Referencia»,
  «Presentación», «Sabor».
- **Tienda de restaurante.** Muestra `variant_types` como «modificadores legacy»
  (`goadmin-websites/lib/supabase/queries.ts:2020-2044`, `components/site/MenuView.tsx:649`).
  Mezcla los dos conceptos.
- **Permisos.** Las páginas no comprueban permisos, y la RLS deja escribir el catálogo a cualquier
  miembro activo.

**Roto (las dos páginas):**

| # | Qué falla | Evidencia |
|---|---|---|
| 1 | La lista de tipos **no lee el catálogo**. Sale de las claves de `products.variant_data`, leídas en el navegador. Un tipo creado desde la página no aparece nunca, y los 20 tipos sin uso son invisibles | `VariantTypesService.ts:14-58`; crear inserta en `variant_types` (`:75-89`) pero la lista no lo lee |
| 2 | **Los ids son índices** de la lista (1..N), no ids reales. «Editar» y «Eliminar» buscan por índice | `VariantTypesService.ts:47-49, 98-99` |
| 3 | El enlace «Valores → ?tipo=N» de la página de tipos **apunta a otro tipo** cuando hay mayúsculas o tildes. Tipos ordena con `localeCompare`; valores, con `.sort()` por código de carácter | `VariantTypesService.ts:55` vs `VariantValuesService.ts:105-107`; `VariantTypesPage.tsx:330` (org 132: «talla» / «Talla» / «Tallaje») |
| 4 | **Renombrar un tipo** hace un `UPDATE` por variante desde el navegador, sin transacción y sin mirar el error de cada uno. En la org 137 serían 11.551 escrituras | `VariantTypesService.ts:117-128` |
| 5 | **Crear un valor** manda como `variant_type_id` el índice inventado. Cae en el tipo de otra organización (y la RLS lo rechaza) o en un tipo equivocado | `VariantValuesService.ts:131-144`; página `VariantValuesPage.tsx:141, 174` |
| 6 | **Editar un valor no guarda nada y avisa «Valor actualizado».** La página no pasa `oldValue` ni `typeName` | `VariantValuesPage.tsx:171` → `VariantValuesService.ts:149-180` |
| 7 | **Eliminar un valor siempre falla** con «Se requiere el tipo y valor» | `VariantValuesPage.tsx:204` → `VariantValuesService.ts:185-188` |
| 8 | **Duplicar un valor no hace nada** (devuelve un objeto falso). Duplicar un tipo crea un «(copia)» vacío, y quedó uno en la BD | `VariantValuesService.ts:212-220`, `VariantTypesService.ts:165-171` |
| 9 | **Arrastrar para ordenar no guarda** y avisa «Orden actualizado» | `VariantValuesPage.tsx:283-284` → `VariantValuesService.ts:222-224` |
| 10 | Todos los valores se agrupan **bajo el nombre del primer tipo**, porque `variant_type_id` siempre vale 0 | `VariantValuesService.ts:65`, `VariantValuesPage.tsx:237-245` |
| 11 | Las páginas leen todas las variantes hijas sin paginar. Si `max_rows` es el valor por defecto de PostgREST (1.000; no se verificó en la configuración), los conteos salen truncados en 7 organizaciones con más de 1.000 variantes | `VariantTypesService.ts:18-23`, `VariantValuesService.ts:18-23` |
| 12 | Eliminar un tipo «sin uso» borra la fila del catálogo, y la cascada borra sus `product_variant_relations` | `VariantTypesService.ts:155-159` + FK `ON DELETE CASCADE` |

**Seguridad.** `crear_tipo_variante(p_name, p_organization_id, p_values)` es `SECURITY DEFINER`,
ejecutable por `authenticated`, y **deja escribir en la organización 0** (el catálogo global que
leen todas las organizaciones) sin comprobar pertenencia. Tampoco mira `is_active`. No la llama el
código de este repositorio. Recomendación: revocar `EXECUTE` o eliminarla.

**En una frase:** las variantes **se crean, se venden y se exportan bien desde el producto**, pero
**el catálogo de tipos y valores no se puede administrar**. Las dos páginas muestran datos
derivados, con ids inventados, y 5 de sus 8 acciones fallan o fingen éxito. Además no existen
orden efectivo, color, traducciones, activo/inactivo ni fusión de repetidos.

---

## 3. Propuesta

### 3.1 UX: una página con dos pestañas (recomendado)

**`/app/inventario/variantes`**, con las pestañas **Tipos · Valores**. Es el mismo patrón ya
aprobado para Unidades y conversiones (`593:333686`). Las rutas actuales redirigen:
`/variantes/tipos` → `?tab=tipos` y `/variantes/valores?tipo=<id>` → `?tab=valores&tipo=<id>`.

¿Por qué una sola página y no dos?

- El valor no existe sin su tipo. En la práctica se trabaja en un tipo y se ordenan o fusionan sus
  valores.
- «Ver sus 12 valores» desde un tipo es un cambio de pestaña con filtro, no una navegación.
- El buscador cubre tipos y valores a la vez.

| Función | Tipos | Valores |
|---|---|---|
| Listado | Orden · Tipo (con vista de valores) · Se muestra como · Estado · N.º de valores · N.º de variantes · ⋯ | Orden (arrastrable) · Valor (con código SKU) · Muestra (hex) · Estado · Variantes · Traducciones · ⋯ |
| Vistas | Tabla ↔ tarjetas (`ViewToggle`) | Tabla (filtrada por tipo) |
| KPIs | Tipos activos · Valores · Nombres repetidos · Sin usar | Valores · Con muestra · Repetidos · Sin usar |
| Crear y editar | Nombre (único sin mayúsculas, tildes ni espacios) · Cómo se muestra (Texto / Muestra de color / Imagen) · Atributo de Facebook · Traducciones en/fr/pt · Activo | Tipo · Valor · Hex (si el tipo es color) · Código para SKU · Traducciones · Posición |
| Orden | Orden de tipos: cuál sale primero en el POS | Arrastrar ⠿. En táctil, mantener pulsado o ↑ ↓ desde ⋯ |
| Uso | Conteo real de variantes, calculado en el servidor | Ídem |
| ⋯ | Editar · Ver valores · Ordenar valores · Cómo se muestra · Fusionar con… · Copiar ID · Desactivar · Eliminar (solo sin uso, con motivo) | Editar · Fusionar con… · Desactivar · Eliminar (solo sin uso) |
| Masivo (barra flotante) | Fusionar en uno · Cómo se muestra · Exportar · Desactivar | Fusionar · Desactivar · Exportar |
| Renombrar | ConfirmDialog con el impacto («se actualiza en 48 variantes; los SKU no cambian») | Ídem |
| Estados | Cargando · vacío (con «usar sugeridos» de la org 0) · sin resultados · error con reintentar · sin permiso | Ídem |
| Permisos | Ver: permiso de productos «ver». Crear, renombrar, fusionar, desactivar: «editar». Eliminar: «eliminar». Se resuelven en el servidor | |
| Idiomas | Toda la UI en es/en/fr/pt con next-intl, en un namespace propio (`inventarioVariantes`) | |

### 3.2 Cambios de BD (propuestos, sin aplicar)

Todos aditivos: columnas `NULL`-ables o con `DEFAULT`. Van en `supabase/migrations/` con su
reversión en `supabase/rollbacks/`.

```sql
-- variant_types
alter table public.variant_types
  add column if not exists display_order  integer     not null default 0,
  add column if not exists is_active      boolean     not null default true,
  add column if not exists display_style  text        not null default 'texto'
      check (display_style in ('texto','color','imagen')),
  add column if not exists meta_attribute text
      check (meta_attribute in ('color','size','material','pattern','gender','age_group')),
  add column if not exists translations   jsonb       not null default '{}'::jsonb,
  add column if not exists updated_at     timestamptz not null default now();

-- variant_values
alter table public.variant_values
  add column if not exists hex_color    text check (hex_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists image_url    text,
  add column if not exists sku_code     text,
  add column if not exists is_active    boolean     not null default true,
  add column if not exists translations jsonb       not null default '{}'::jsonb,
  add column if not exists updated_at   timestamptz not null default now();

-- Unicidad sin distinguir mayúsculas ni espacios: SOLO después de fusionar los 2 choques
-- actuales («Diseño» / «Diseño » en dos organizaciones).
-- create unique index concurrently variant_types_org_nombre_ci
--   on public.variant_types (organization_id, lower(btrim(name)));
-- create unique index concurrently variant_values_tipo_valor_ci
--   on public.variant_values (variant_type_id, lower(btrim(value)));
```

Datos iniciales, en una migración aparte:

- `display_order` de tipos por uso.
- `display_order` de valores con un orden de tallas conocido (XS < S < M < L < XL < XXL) y
  numérico si todos son números.
- `display_style = 'color'` y `meta_attribute = 'color'` en los tipos que se llamen color o
  colores.
- Backfill del catálogo con los 215 pares en uso que faltan, reutilizando
  `fn_producto_int_asegurar_atributos`.

### 3.3 Backend: RPC transaccionales (sin aplicar)

Todas son `SECURITY DEFINER`, validan la pertenencia y el permiso en el servidor con la
organización de la sesión, y tienen `REVOKE EXECUTE` a `anon`.

| RPC | Qué hace |
|---|---|
| `variantes_resumen(p_org)` | Tipos y valores con su conteo de variantes, agrupados en SQL (sin traer 21.000 filas al navegador) |
| `variantes_renombrar_tipo(p_tipo_id, p_nombre)` | Actualiza el catálogo y reescribe la clave en `products.variant_data` con un solo `UPDATE … set variant_data = variant_data - viejo \|\| jsonb_build_object(nuevo, variant_data->viejo)` |
| `variantes_renombrar_valor(p_valor_id, p_valor)` | Ídem con el valor. `product_variant_relations` se mantiene porque va por id |
| `variantes_fusionar_tipos(p_origen int[], p_destino)` | Mueve las claves y resuelve el choque: si una variante tiene las dos claves, se conserva la de destino. Une valores iguales sin distinguir mayúsculas, reapunta las relaciones y borra los tipos de origen. Deja historial |
| `variantes_fusionar_valores(p_origen int[], p_destino)` | Ídem con valores |
| `variantes_reordenar(p_tipo_id, p_ids int[])` | Escribe `display_order` 0..n |
| `variantes_desactivar(...)` / `variantes_eliminar(...)` | Eliminar solo si el uso es 0 en `variant_data` **y** en las relaciones |

Seguridad:

- `REVOKE EXECUTE ON FUNCTION crear_tipo_variante FROM authenticated`, o eliminarla (hoy permite
  escribir en la org 0).
- Mantener la RLS por pertenencia para lectura. Mover la escritura del catálogo a las RPC y dejar la
  RLS de escritura solo para `service_role`, o condicionada a un permiso.

### 3.4 Consumidores a ajustar

- **POS.** `agruparAtributos` (`lib/pos/venta/modificadores.ts:124-141`) ordena por
  `display_order` del catálogo y pinta la muestra si `display_style = 'color'`.
- **Tienda.** `VariantSelector.tsx:74`, igual que el POS. Separar los «modificadores legacy» de
  `MenuView.tsx:649`.
- **Facebook.** `formatoMeta.ts:150` usa `meta_attribute` antes que la heurística por nombre.
- **Generador de SKU.** `skuVariante` (`productos/logica/variantes.ts`) usa `sku_code` del valor.
- **Sugerencias del producto.** `catalogoAtributos.ts:84-135` lee `variantes_resumen` en lugar de
  2.000 filas.
- **Borrar las páginas viejas** y sus servicios, que leen `variant_data` en el navegador.

---

## 4. Qué se dibujó en Figma

### 4.1 Sección «Inventario — Variantes: tipos y valores (propuesta)» · `969:595070`

x = 76.000, y = 0. Clonada del kit y de los patrones de Unidades y Etiquetas. Cada frame lleva
su nota encima.

| Frame | Node | Enlace |
|---|---|---|
| Escritorio · Tipos — listo (tabla) | `969:595073` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=969-595073 |
| Escritorio · Tipos — tarjetas (ViewToggle) | `971:593241` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=971-593241 |
| Escritorio · Tipos — menú «⋯» de fila | `971:594169` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=971-594169 |
| Escritorio · Tipos — selección + barra masiva | `971:594795` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=971-594795 |
| Escritorio · Valores — «Talla» con orden arrastrable | `972:600617` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-600617 |
| Escritorio · Valores — «Color» con muestras hex | `972:601473` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-601473 |
| Cargando · vacío · sin resultados · error · sin permiso | `972:602397` · `972:603218` · `972:603975` · `972:604739` · `972:605490` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-603218 |
| Tablet 834 · Tipos en tarjetas | `972:606273` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-606273 |
| Tablet 834 · Valores de «Talla» | `972:606680` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-606680 |
| Diálogo · Nuevo tipo | `972:607461` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-607461 |
| Diálogo · Nuevo valor de «Color» | `972:607554` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-607554 |
| Diálogo · Fusionar tipos | `972:607660` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-607660 |
| ConfirmDialog · Renombrar con impacto · Eliminar sin uso | `972:607716` · `972:607750` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-607716 |
| Móvil · Tipos | `972:607790` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-607790 |
| Móvil · Valores de «Talla» (ordenar) | `972:608438` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-608438 |
| Móvil · Hoja de acciones | `972:610078` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-610078 |
| Móvil · Selección múltiple | `972:609100` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-609100 |
| Móvil · Nuevo valor (hoja) | `972:610426` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=972-610426 |

### 4.2 Sección «Inventario — Faltantes de paridad, prioridad alta (propuesta)» · `973:185222`

x = 76.000, y = 4.700.

| Frame | Node | Enlace |
|---|---|---|
| Escritorio · Proveedores › Importar — paso 3 «Revisar» | `973:185225` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=973-185225 |
| Diálogo · Garantías › Enviar al proveedor (RMA) | `973:186133` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=973-186133 |
| Diálogo · Categorías › Importar categorías | `973:186211` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=973-186211 |
| Móvil · Proveedores › Importar | `975:185874` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=975-185874 |
| Móvil · Ajustes › Nuevo ajuste (conteo) | `975:186644` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=975-186644 |
| Móvil · Traslados › Nuevo traslado | `975:186790` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=975-186790 |

### 4.3 Verificación por script

Recorrido de las dos secciones: 29 frames y 29 notas.

- **Solapes:** 0 entre hijos de cada sección y 0 con otras secciones de la página.
- **Nodos fuera de su sección:** 0.
- **Instancias rotas:** 0 (se comprobó `getMainComponentAsync` en todas).
- **Textos recortados:** 0. Se midió cada texto con truncado del kit contra su ancho natural. Los
  dos recortes que aparecieron (el botón «GO Asistente» en la cabecera de las tabletas) se
  corrigieron ocultando el buscador compacto del `AppHeader` a 762 px.

Capturas en `docs/design/figma/69-*.png`: 26 archivos, con las dos secciones completas.

Limitaciones conocidas del dibujo:

- En la tableta, el `Sidebar Mode=rail` marca como activo el ítem por defecto del componente, no
  Inventario.
- Algunos conteos de la columna «Valores» salen en color de texto normal en vez de enlace: el
  componente clonado no respeta la variable `text/link`.

---

## 5. Pendiente

- **Tableta** (MEDIA) en Stock, Movimientos, Ajustes, Traslados, Garantías, Trazabilidad,
  Categorías, Proveedores, Etiquetas, Unidades, Imágenes, Recetas, Costo de recetas y
  Distribución.
- **Garantías** (MEDIA): FilterPanel abierto, hoja de acciones móvil, nuevo reclamo en hoja móvil.
  «Sin resultados» (BAJA).
- **Seriales** (MEDIA, sin rediseño): diálogos «Transferir serial» y «Cambiar estado».
- **Proveedores** (MEDIA): contenido de las pestañas Órdenes, Facturas, Cuentas por pagar y Pagos
  del detalle.
- **Categorías** (MEDIA): eliminar con selector de destino para los productos; detalle y
  formulario en móvil.
- **Conversiones** (BAJA): estados en móvil.
- **Variantes:** detalle de un valor (traducciones e imagen) y el aviso de choque al fusionar
  valores. Están descritos; no se dibujaron.
- **Bugs de código vistos de paso**, sin tocar:
  - «Crear transferencia» de Stock no hace nada.
  - «Editar ajuste» apunta a una ruta inexistente.
  - `window.confirm` en traslados, distribución y conversiones.
  - Código muerto en proveedores.
  - `crear_tipo_variante` abierto a la org 0.
