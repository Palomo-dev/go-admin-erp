# Producto — Recetas en «Opciones avanzadas» y subsecciones de producción

Propuesta de diseño, 2026-09-28. Estado: **en Figma para aprobación del dueño; nada en código ni en la base**.

Alcance acordado con el dueño (tres correcciones sobre el encargo original):

1. «Opciones avanzadas» del formulario de nuevo y editar producto lleva **toda la lógica de recetas**, con el mismo editor de receta que el detalle, y la receta se puede vincular a un producto que aún no existe o a sus variantes.
2. En el detalle de producto: crear, ver y operar **Receta, Costo de receta, Producción, Distribución y Unidades y conversión**.
3. **Seriales queda fuera**: el dueño dice que su estructura actual está bien. No se dibujó ni se propone nada de seriales.

Paso previo hecho en Figma: la sección vieja de Mesas pasó a la página nueva `99 Archivo — versiones anteriores` y la propuesta nueva quedó en la página 05, justo debajo de «Componentes — Mesas y promociones» (ver §8).

---

## 1. Qué hay hoy

### 1.1 Base de datos (verificado con el MCP, 2026-09-28)

| Tabla | Columnas relevantes | Datos |
|---|---|---|
| `product_recipes` | `product_id`, `name`, `yield_qty` (def. 1), `yield_unit_code`, `is_active`, `version` (def. 1), `notes`. UNIQUE parcial `(product_id) where is_active` | 57 recetas (55 activas) en 3 organizaciones. **31 cuelgan de una variante** (producto hijo) y ninguna de un padre con variantes. Todas con `yield_qty = 1` y `version = 1` |
| `recipe_ingredients` | `recipe_id`, `ingredient_product_id`, `quantity`, `unit_code` (char), `is_optional`, `notes`, `sort_order`. **Sin `organization_id` y sin merma** | 137 ingredientes. Ninguno con unidad distinta a la del producto ingrediente |
| `unit_conversions` | `from_unit_code`, `to_unit_code`, `factor`, `organization_id` (NULL = global). **Sin UNIQUE y sin `product_id`** | 10 globales (GR↔KG, ML↔LT, UN↔PAQ=10, UN↔CAJ=25, CM↔MT), 0 por organización |
| `units` | `code` (char, PK), `name`, `unit_type` (weight/volume/count/length/area) | 13 unidades globales |
| `production_orders` | `branch_id`, `recipe_id`, `product_id`, `qty_to_produce`, `status` (draft, confirmed, in_progress, completed, cancelled), `produced_qty` | 1 orden, `completed`, **sin consumos** |
| `production_order_consumptions` | `ingredient_product_id`, `quantity_consumed`, `unit_code`, `stock_movement_id` | 0 |
| `inventory_transfers` / `transfer_items` | origen, destino, `status` (pending, in_transit, received, cancelled); ítem con `quantity`, `received_qty`, `lot_id` | 5 traslados. **Sin vínculo a la orden de producción** |
| `products` | `is_composite`, `production_type` (CHECK: simple, composite, preparation), `parent_product_id`, `unit_code` | 61 compuestos; `preparation` no se usa. 42.938 variantes (hijos) |

Costos: `stock_levels.avg_cost` y `product_costs.cost` son `numeric(12,2)`. Un costo por gramo se redondea a 0,00.

Permisos que existen: `inventory.view/create/edit/delete/adjust/transfer`, `inventory_management`, `product_management`, `reports.inventory`. **No hay permiso de costos.**

### 1.2 Lógica de receta, repartida en cinco sitios

La misma pregunta, «¿cuál es la receta de este producto y cuánto se descuenta?», se responde en cinco lugares distintos:

| Dónde | Qué hace | Problema |
|---|---|---|
| `decrement_stock_with_recipe` (SQL, última versión en `supabase/migrations/20260923224359_f68_receta_autorreferida.sql:23`) | Venta: receta activa **del mismo `product_id`**, cantidad × qty, conversión recipe→producto | Ignora `yield_qty` y `is_optional`. Si no hay conversión, descuenta sin convertir. **Una variante no hereda la receta del padre** |
| `complete_production_order` (SQL) | Producción | Reutiliza `v_conv_factor` para la proporción y para la conversión (bug ya auditado en `AUDITORIA-CATALOGO-PRODUCCION.md` §8). El producto terminado entra a costo 0. Escribe `stock_levels` sin pasar por el kardex común |
| `src/lib/services/stockMovementService.ts:29` | Lee la receta desde el navegador para el descuento del cliente | Duplica la búsqueda |
| `src/lib/services/compositeStockValidation.ts:32` | Validación de stock previa al cobro en el POS | N+1: una receta y un stock por ítem. Ignora conversión y rendimiento |
| `src/components/inventario/reportes/costo-recetas/CostoRecetasService.ts:17` | Costo | Compara códigos `char` con `===` y nunca encuentra la conversión. Toma el máximo `avg_cost` |

El guardado de recetas (`src/lib/services/recipeService.ts:176-224`) usa el cliente del navegador en 4 llamadas sin transacción, con `version: 1` fijo. Editar borra e inserta los ingredientes, y el diálogo `src/components/inventario/recetas/RecipeDialog.tsx:132,167` fija `'UN  '`.

### 1.3 Formulario de producto

- `src/components/inventario/productos/formulario/secciones/SeccionAvanzado.tsx:281-296`: la sección «Avanzado» solo tiene un switch `is_composite` y un enlace «Ir a recetas» a `/app/inventario/recetas`. La receta **no se puede definir en el formulario**.
- El guardado ya es **una sola RPC transaccional**: `fn_producto_guardar(p_organization_id, p_payload)` (`supabase/migrations/20260924110000_producto_formulario_transaccional.sql:119`). Crea el producto, el precio, el costo, los impuestos, las variantes (`fn_producto_int_variante_guardar`), los modificadores y las imágenes. Exige permiso en el servidor (`fn_productos_exigir_permiso`). Es `SECURITY DEFINER` y no está abierta a anon.
- Cada variante del formulario tiene una clave de cliente estable, `VarianteForm.clave` (`src/components/inventario/productos/logica/formularioProducto.ts:134-135`), generada con `nuevaClave('v')` (`:415`). **Es la llave que permite vincular una receta a una variante que todavía no tiene id.**
- No hay borrador persistente del formulario ni clave de idempotencia. Un doble envío lo frena solo `sku_duplicado`.
- Permisos para la UI: `fn_productos_permisos(p_org)` devuelve crear, editar, eliminar y ajustar.

### 1.4 Detalle de producto

`src/components/inventario/productos/detalle/DetalleProducto.tsx:235-259`: pestañas Resumen · Inventario (Stock, Lotes, Kardex, Seriales) · Precios · Variantes (Variantes, Modificadores) · Imágenes · Proveedores (Proveedores, Etiquetas) · Notas · Historial.

**No hay nada de receta, producción, distribución ni unidades.** `ResumenProducto.tsx:359-366` muestra «Compuesto: Sí» y un enlace suelto a `/app/inventario/recetas`. En Figma, las tablas de esos temas existen como **pantallas de módulo**: `598:142703` Recetas, `601:148806` Costo, `603:153432` Producción, `606:159579` Distribución y `593:333686` Unidades. Ninguna está dentro del detalle de producto.

---

## 2. Receta en «Opciones avanzadas» del formulario

### 2.1 Qué ve el usuario

Dentro de «Avanzado» aparece un bloque **Receta**, debajo de Envío y Nota. Es el último bloque de la sección.

1. **Interruptor** «Este producto se arma con una receta». Apagado: nada más. Es el mismo `is_composite`.
2. **Cómo se descuenta el inventario**, con un control segmentado:
   - **Al vender**: la venta descuenta los ingredientes. Hoy es `production_type = composite`.
   - **Al producir**: los ingredientes salen al completar una orden de producción; la venta descuenta solo el producto terminado.

   Un texto de ayuda deja claro que nunca se descuentan las dos cosas.
3. **Alcance**. Solo aparece si «Tiene variantes» está activo:
   - **Una receta para todas las variantes** (compartida, en el padre).
   - **Una receta por variante**. Cada variante muestra «Usa la compartida» o «Propia», y tiene la acción «Copiar de…» otra variante o de la compartida.

   Chips con el estado de cada variante: sin receta, compartida, propia, con errores.
4. **Rinde**: cantidad y unidad (por ejemplo, 12 UN o 1 porción). Por defecto, 1 y la unidad del producto.
5. **Editor de ingredientes**: el componente compartido `EditorReceta`, descrito en §4. Cada fila tiene:
   - producto (buscador de producto que excluye servicios, el propio producto y sus variantes);
   - cantidad y unidad (solo unidades del mismo `unit_type`, con la conversión a la unidad del ingrediente visible: «= 0,2 KG»);
   - merma %;
   - opcional;
   - costo de la línea;
   - quitar;
   - arrastrar para ordenar.
6. **Panel de costo en vivo**. Muestra el costo de la tanda y el costo por unidad producida. Si el precio de venta ya está en «Precios y costos», agrega el margen. Indica la fuente del costo y avisa si el costo está incompleto, con la línea exacta que falta. Se calcula para la sucursal activa del header.
7. **Validaciones en línea**:
   - cantidad > 0;
   - merma entre 0 y 99,99;
   - el mismo ingrediente y unidad repetidos se ofrecen para fusionar;
   - si falta la conversión, la fila queda en error con la acción «Crear conversión», que abre el diálogo compartido de §5.5;
   - si falta el costo, es un aviso que no bloquea;
   - un ingrediente sin inventario es un aviso («no descuenta stock»).

   Con «Al producir» y el producto sin «Rastrear inventario», el formulario obliga a activarlo: si no, lo producido no entra a ninguna parte.
8. **En editar**:
   - Encabezado «Versión 3 activa · al guardar se crea la versión 4».
   - Aviso de cuántas órdenes de producción abiertas usan la versión actual. **No cambian**, porque siguen apuntando a su `recipe_id`.
   - Si la receta no cambió, no se crea versión.

### 2.2 Vincular la receta a un producto (o variante) que aún no existe

**Principio: la receta capturada vive en el estado del formulario hasta el guardado, y una sola RPC crea producto, variantes y recetas juntos.** No hay filas «huérfanas» en la base ni tablas de borrador.

Estado del formulario (se agrega a `EstadoFormularioProducto`):

```ts
receta: {
  activa: boolean;                       // = is_composite
  modo: 'al_vender' | 'al_producir';     // → production_type
  alcance: 'compartida' | 'por_variante';
  compartida: RecetaBorrador | null;     // destino: el producto (padre)
  porVariante: Record<string /* VarianteForm.clave */, RecetaBorrador | 'usa_compartida'>;
}
RecetaBorrador = {
  id?: number;                 // editar: receta activa que se reemplaza
  version?: number;
  nombre: string | null;
  rinde: number; unidadRinde: string;
  notas: string | null;
  ingredientes: {
    clave: string; ingredientProductId: number; cantidad: number;
    unidad: string; mermaPct: number; opcional: boolean; notas: string | null;
  }[];
}
```

- **Variantes sin id**: la receta de una variante se indexa por `VarianteForm.clave`, que ya existe y es estable mientras dura el formulario. Si se regenera la matriz de variantes y una clave desaparece, su receta se descarta con un aviso: «2 recetas de variantes que ya no existen se quitaron».
- **Borrador local** (opcional, recomendado): el estado completo del formulario se guarda en `sessionStorage` bajo `producto-borrador:<org>:<modo>:<id|nuevo>`. Así, cerrar la pestaña por error o renovar la sesión no pierde 15 ingredientes. Se borra al guardar. Solo es comodidad del navegador: no toca la base.
- **Ingrediente que tampoco existe**: el buscador ofrece «Crear ingrediente» con el alta rápida de producto (`QuickCreateDialog`). Ese producto sí se crea al momento, porque es otro producto independiente. El producto que se está creando **no** puede ser ingrediente de su propia receta; esto lo impide también el disparador `trg_receta_sin_autorreferencia`.

### 2.3 Guardado: una RPC, transaccional e idempotente

Se extiende `fn_producto_guardar` (no se crea una segunda implementación, por la regla 7) con dos claves nuevas del payload:

```jsonc
{
  "modo": "crear",
  "clave_idempotencia": "3f0c…-uuid",   // generada al abrir el formulario, una por intento de guardado lógico
  "producto": { …, "is_composite": true, "production_type": "composite" },
  "tiene_variantes": true,
  "variantes": [ { "clave": "v_1", "sku": "HAM-SEN", … }, { "clave": "v_2", … } ],
  "recetas": [
    { "destino": "producto", "rinde": 1, "unidad_rinde": "UN", "ingredientes": [ … ] },
    { "destino": { "variante": "v_2" }, "rinde": 1, "ingredientes": [ … ] }
  ]
}
```

Orden dentro de la transacción:

1. Permiso y validaciones actuales.
2. **Idempotencia.** Se busca `(organization_id, clave_idempotencia)` en la tabla nueva `product_save_requests`. Si ya existe, se devuelve el resultado guardado y no se hace nada más. Si no existe, se inserta la fila al final, en la misma transacción.
3. Producto, precio, costo, impuestos, variantes, etc. (igual que hoy). **El `v_vars` devuelto agrega `clave`** para mapear variante → id.
4. **Recetas**. Para cada `recetas[]`:
   - `destino = producto` → `v_id`; `destino.variante = clave` → el id de `v_vars` con esa clave; si no existe → `receta_variante_desconocida`.
   - Se valida cada ingrediente:
     - de la misma organización y no borrado;
     - no es el producto, ni una de sus variantes, ni su padre (`receta_autorreferida`);
     - `cantidad > 0`;
     - `0 ≤ merma < 100`;
     - la unidad es del mismo `unit_type` que la del ingrediente y existe una conversión (producto → organización → global) (`conversion_faltante`, con detalle `ingrediente_id`, `de`, `a`);
     - no se repite el mismo ingrediente con la misma unidad.
   - Comparación con la versión activa: si es idéntica, no pasa nada. Si cambió, se llama a la interna nueva `fn_receta_int_guardar_version(org, product_id, receta)`. Esa función desactiva la activa, inserta la nueva con `version = max + 1` e inserta los ingredientes. Es la **misma interna** que usará «Editar receta» en el detalle.
   - Si el alcance es `usa_compartida` y la variante tenía receta propia, esa receta se desactiva. No se borra.
5. `is_composite` y `production_type` según `receta.activa` y `receta.modo`. Apagar la receta desactiva las recetas del producto y de sus variantes, sin borrarlas; se pueden recuperar desde Versiones.
6. Se devuelve `{ id, uuid, variantes:[{id, sku, clave}], recetas:[{destino, recipe_id, version}] }`.

Cualquier error revierte todo. La interfaz ya traduce los códigos de error (`productoForm.errores.*`) y lleva al campo con el error: el paso del stepper móvil lo resuelve `PASO_DE_CAMPO`, que suma `receta: 'detalles'`.

### 2.4 Cómo se usa la receta después (un solo resolutor)

Una función nueva, **`fn_receta_efectiva(p_product_id) → (recipe_id, yield_qty, …)`**. Busca la receta activa del producto; si no hay y el producto es una variante, la receta activa del padre. La usan **todas** las rutas:

- `decrement_stock_with_recipe`:
  - usa el resolutor, de modo que una variante hereda la receta compartida;
  - aplica `qty / yield_qty` y `cantidad / (1 − merma)`;
  - omite `is_optional`, salvo que la línea de venta lo pida (modificador «con X»; fuera de esta fase);
  - con `production_type` «al producir», **no descuenta ingredientes**: solo el producto terminado;
  - si falta la conversión, falla en vez de descontar sin convertir.
- `complete_production_order`: el resolutor, más la corrección del bug de `v_conv_factor`, el costo real del terminado (Σ consumos ÷ producido) y el paso por el kardex común.
- `stockMovementService.ts:29` y `compositeStockValidation.ts:32` dejan de leer la receta: llaman a una RPC de lectura, `fn_receta_necesidades(org, branch, items[])`, que devuelve lo que falta. Sirve también para el POS y quita el N+1.
- El costo (formulario, detalle y reporte) sale de `fn_receta_costo(org, branch, receta jsonb | recipe_id)`, que devuelve por línea la cantidad convertida, el costo unitario, la fuente (`avg_cost` de la sucursal → `product_costs` vigente → sin costo), el costo de la línea y los avisos. **El formulario la llama con el borrador en jsonb** (debounce de 400 ms): es el mismo cálculo que el reporte, no una copia en TypeScript.

### 2.5 Cambios de base y de backend (propuestos, NO aplicados)

Todos aditivos. Cada uno lleva su `.sql` y su rollback, según `docs/POLITICA-MIGRACIONES.md`.

| # | Cambio | Tipo |
|---|---|---|
| B1 | `recipe_ingredients.waste_pct numeric(5,2) not null default 0 check (waste_pct >= 0 and waste_pct < 100)` | columna con default |
| B2 | `unit_conversions.product_id integer null references products(id)` + UNIQUE parcial `(coalesce(organization_id,0), coalesce(product_id,0), from_unit_code, to_unit_code)` + CHECK de mismo `unit_type` por disparador | columna NULL-able, índice |
| B3 | Tabla `product_save_requests(organization_id, clave uuid, product_id, resultado jsonb, created_at, primary key (organization_id, clave))` con RLS por pertenencia; limpieza a 30 días | tabla nueva |
| B4 | `fn_receta_efectiva`, `fn_receta_int_guardar_version`, `fn_receta_costo`, `fn_receta_necesidades` (SECURITY DEFINER, `fn_assert_acceso_org`, sin anon) | funciones nuevas |
| B5 | `fn_producto_guardar`: claves `clave_idempotencia` y `recetas`; `v_vars` con `clave` | reemplazo de función |
| B6 | `decrement_stock_with_recipe` y `complete_production_order` con el resolutor, rendimiento, merma, modo y conversión obligatoria; revocar `anon` en las dos | reemplazo de función |
| B7 | RPC `fn_receta_guardar(org, product_id, receta jsonb, clave_idempotencia)` para el detalle: envoltorio de B4 con permiso `inventory.edit` | función nueva |
| B8 | Sustituir `recipeService.createRecipe/updateRecipe` (4 llamadas desde el navegador) por B7 | servicio |
| B9 | Permiso nuevo `inventory.costs.view` para ver costos y márgenes (hoy cualquiera con acceso los ve) | fila en `permissions` |
| B10 | `inventory_transfers.production_order_id integer null` (FK) y RPC `fn_distribucion_crear/enviar/recibir` que sustituyen `update_stock_level`, que no existe | columna NULL-able + RPC |

`production_type` «al producir»: se propone **reutilizar el valor `preparation`**, que ya está en el CHECK y tiene 0 filas, en vez de ampliar el CHECK. Queda como pregunta (§9).

---

## 3. Detalle de producto — pestaña nueva «Producción»

Solo se muestra si el producto es compuesto, si se usa como ingrediente en alguna receta o si tiene órdenes o traslados. Tiene sub-pestañas, con el mismo patrón de `TabBar` y sub-pestaña que Inventario:

**Receta · Costo · Órdenes · Distribución · Unidades**

Cada sub-pestaña es una **tabla de subsección** (componente `TablaSubseccion`) con título, contador, filtros mínimos y la acción **«Nuevo …»** a la derecha. El detalle de una fila se abre en una **hoja lateral** (`HojaDetalle`) en escritorio y tablet, y en una hoja inferior en móvil.

### 3.1 Receta

- **Hoy en BD**: `product_recipes` + `recipe_ingredients` (§1.1).
- **Vista**:
  - tarjeta de la versión activa: nombre, rinde, modo, n.º de ingredientes, costo por unidad y margen;
  - tabla de ingredientes en solo lectura;
  - si hay variantes, un selector «Receta de: Compartida | Sencilla | Doble…» con insignias Propia o Compartida;
  - «Usado en»: recetas donde este producto es ingrediente, con enlace a cada una.
- **Nuevo**: «Crear receta» abre el mismo `EditorReceta` en página. Con variantes, pregunta primero «¿Compartida o para una variante?».
- **Editar**: «Editar receta» abre el mismo editor y crea la versión N+1 (B7).
- **Opciones** (menú ⋯):
  - Duplicar a otras variantes;
  - Comparar con la versión anterior;
  - Ver versiones (la lista, con la posibilidad de **Reactivar** una versión anterior, que crea una versión nueva con su contenido);
  - Desactivar receta (con `ConfirmDialog`: deja de descontar ingredientes; las órdenes abiertas siguen);
  - Crear orden de producción (solo en modo «Al producir»).
- **Estados**: activa · sin receta (EmptyState con «Crear receta») · receta desactivada · con errores (una conversión o un costo que falta) · sin permiso (solo lectura, sin acciones).
- **Validaciones**: las de §2.3 paso 4.

### 3.2 Costo de receta

- **Hoy en BD**: no se guarda. Se calcula (`CostoRecetasService.ts`, con los errores de §1.2).
- **Vista**:
  - por sucursal (`BranchBadge`): costo de la tanda, costo por unidad, precio vigente, margen y fuente del costo por ingrediente;
  - fila expandible por ingrediente: cantidad neta, merma, cantidad bruta, conversión, costo unitario y fuente;
  - gráfico mínimo de costo por unidad por versión.
- **Nuevo**: no aplica. La acción primaria es **«Registrar costo faltante»**: abre `DialogoCosto`, que ya existe en precios, para el ingrediente sin costo.
- **Opciones**: Cambiar sucursal · Exportar CSV (nombre con `todayInTz`) · Ir al reporte de costo de recetas · Recalcular.
- **Estados**: completo · incompleto (aviso con las líneas) · sin sucursal asignada · sin permiso de costos (B9: se ocultan importes).

### 3.3 Órdenes de producción

- **Hoy en BD**: `production_orders` y `production_order_consumptions`. Estados: draft, confirmed, in_progress, completed, cancelled.
- **Tabla**: número, sucursal, versión de receta, a producir, producido, estado (`ProductionStepper` / badge) y fecha en la zona de la organización.
- **Nueva orden** (diálogo):
  - sucursal y cantidad;
  - la receta es la activa y se puede elegir la versión;
  - vista previa de necesidades por ingrediente: necesario, disponible y faltante (`fn_receta_necesidades`);
  - si falta stock: aviso, y «Crear de todos modos» exige confirmación.
- **Detalle** (hoja):
  - datos;
  - necesidades y consumos reales, con el enlace al movimiento del kardex;
  - costo real del terminado;
  - el traslado de distribución que salió de la orden.
- **Opciones por estado**:
  - Borrador: Confirmar · Editar · Eliminar.
  - Confirmada: Iniciar · Cancelar.
  - En proceso: Completar, con un diálogo de cantidad producida (`NumberInput`, > 0 y ≤ 150 % de lo planeado; ya no `prompt()`) · Cancelar, con motivo.
  - Completada: Distribuir · Ver kardex.
  - Cancelada: solo ver.
- **Validaciones**: orden y receta de la misma organización; la receta sigue activa, o su versión, al completar; sin fallback silencioso (`productionOrderService.ts:213-221`); el producto terminado debe llevar inventario.

### 3.4 Distribución

- **Hoy en BD**: `inventory_transfers` y `transfer_items`. Estados: pending, in_transit, received, cancelled. Sin vínculo a producción (B10).
- **Tabla**: traslados que incluyen este producto: origen → destino, cantidad enviada y recibida, estado (`BadgeEstadoTraslado`), orden de origen.
- **Nueva distribución** (diálogo):
  - sucursal de origen, con el disponible de ese producto;
  - una fila por sucursal de destino con cantidad; «Repartir en partes iguales»;
  - total ≤ disponible en el origen, que no es lo producido;
  - opcional: «Desde la orden de producción #…».
- **Detalle** (hoja): ítems, lotes y cantidades por destino; línea de tiempo (creado, enviado, recibido); diferencias en la recepción.
- **Opciones por estado**:
  - Pendiente: Enviar (descuenta el origen con `transfer_out`) · Editar · Cancelar.
  - En tránsito: Recibir (diálogo por ítem con cantidad recibida y motivo de diferencia; entra con `transfer_in` y el mismo costo).
  - Recibido: ver asiento contable.
  - Cancelado: solo ver.
- **Validaciones**: origen ≠ destino; permiso `inventory.transfer`; sucursales de la organización; recibido ≤ enviado.

### 3.5 Unidades y conversión

- **Hoy en BD**: `products.unit_code` y `unit_conversions` globales o de la organización. No hay conversiones por producto (B2).
- **Vista**:
  - unidad base del producto;
  - tabla de **conversiones que aplican a este producto**, con su origen (del producto, de la organización o global);
  - «Presentaciones» del producto (por ejemplo, PAQ = 6 UN solo para este producto);
  - dónde se usa cada conversión: recetas y órdenes de compra.
- **Nueva conversión** (diálogo compartido `DialogoConversion`):
  - de, a y factor;
  - alcance: «Solo este producto» (por defecto) o «Toda la organización»;
  - casilla «Crear también la inversa» (marcada por defecto);
  - vista previa «1 PAQ = 6 UN · 1 UN = 0,1667 PAQ».
- **Opciones**: Editar factor (aviso: afecta a las recetas que la usan, que se listan) · Eliminar (bloqueado si una receta activa la necesita) · Las globales son de solo lectura.
- **Validaciones**:
  - mismo `unit_type`;
  - factor > 0;
  - de ≠ a;
  - sin duplicado en el mismo alcance;
  - cambiar la unidad base del producto con recetas o stock exige confirmación y muestra el impacto.

---

## 4. Componentes compartidos (kit)

| Componente | Dónde se usa | Nuevo o existe |
|---|---|---|
| **`EditorReceta`** | Formulario › Avanzado › Receta **y** Detalle › Producción › Receta › Crear/Editar **y** la página Recetas (sustituye a `RecipeDialog.tsx`). Estados: vacío · con ingredientes · con errores · solo lectura. Layout: escritorio · móvil. Props: `valor: RecetaBorrador`, `onCambio`, `productoId?` (para excluir), `variantes?`, `sucursalId`, `soloLectura` | **Nuevo** |
| **`FilaIngrediente`** | Dentro de `EditorReceta` y en la vista de lectura. Estados: normal · sin conversión · sin costo · duplicado · no descuenta stock. Layout: fila · tarjeta (móvil) | **Nuevo**: sustituye a `RecipeIngredientRow` (`580:278944`) y le agrega merma |
| **`ResumenCostoReceta`** | Formulario, detalle y editor. Estados: completo · incompleto · sin permiso | **Nuevo** |
| **`SelectorAlcanceReceta`** | Formulario y detalle con variantes. Compartida · Por variante, con chips por variante | **Nuevo** |
| **`TablaSubseccion`** | Las cinco sub-pestañas de §3. Encabezado con contador y «Nuevo …», tabla, estados vacío, cargando, error y sin permiso | **Nuevo** (compone `DataTable`) |
| **`HojaDetalle`** | Detalle de orden, de traslado y de conversión. Layout: panel lateral · hoja inferior | **Nuevo** (compone `BottomSheet` en móvil) |
| `DialogoConversion` | Formulario («Crear conversión» desde una fila), Unidades del detalle y la pantalla de Conversiones | **Nuevo**: reemplaza al diálogo de `ConversionesPage.tsx` |
| `ProductPicker` (`161:8041`) | Buscador de ingrediente | Existe |
| `ProductionStepper`, `BadgeEstadoTraslado`, `BranchBadge`, `DataTable`, `NumberInput`, `Select`, `SegmentedControl`, `Switch`, `ConfirmDialog`, `EmptyState`, `EmptyStateSinSucursal`, `FilaDato`, `RelatedLinkCard` | Todas las pantallas | Existen |

En código van a `src/components/kit/receta/` (`EditorReceta`, `FilaIngrediente`, `ResumenCostoReceta`, `SelectorAlcanceReceta`) y `src/components/kit/` (`TablaSubseccion`, `HojaDetalle`), con textos en es/en/fr/pt bajo el namespace `receta` y `subseccion`.

---

## 5. Permisos (resueltos en el servidor)

| Acción | Permiso |
|---|---|
| Ver pestaña Producción | `inventory.view` |
| Crear o editar receta (formulario o detalle) | crear: `inventory.create`; editar: `inventory.edit` (o `product_management`/`inventory_management`) |
| Ver costos y márgenes | **`inventory.costs.view`** (nuevo, B9). Sin él, `ResumenCostoReceta` muestra «Sin permiso para ver costos» |
| Crear, confirmar, completar o cancelar orden | `inventory.adjust` |
| Distribuir, enviar o recibir | `inventory.transfer` |
| Conversiones del producto | `inventory.edit`; de la organización: `inventory_management` |

`fn_productos_permisos` suma `costos`, `producir` y `trasladar` para que la UI oculte o deshabilite. La RPC vuelve a comprobar el permiso.

---

## 6. Estados que se dibujaron

Formulario:
- receta apagada;
- receta encendida vacía;
- compartida con ingredientes y costo en vivo;
- por variante (una propia y otra que usa la compartida);
- con errores (sin conversión, cantidad 0, duplicado) y el error al guardar;
- editar con versión y órdenes abiertas.

En tablet y móvil (stepper «Más detalles» › Avanzado › Receta, más la hoja «Agregar ingrediente»).

Detalle:
- Receta (lectura y menú);
- Costo;
- Órdenes (tabla, nueva orden y detalle);
- Distribución (tabla, nueva y detalle);
- Unidades (tabla y nueva conversión);
- móvil de la pestaña.

---

## 7. Riesgos y decisiones abiertas

- **Rendimiento (`yield_qty`) al vender.** Hoy se ignora. Las 57 recetas tienen 1, así que corregirlo no cambia nada de lo existente. Desde que se permita «Rinde 12» en la interfaz, es obligatorio que el descuento lo respete (B6).
- **Herencia de receta compartida.** Hoy ninguna variante hereda. Con `fn_receta_efectiva`, una variante sin receta propia cuyo padre tenga receta empezará a descontar ingredientes. Hoy ningún padre con variantes tiene receta (0 filas), así que **no cambia nada existente**.
- **Conversión obligatoria.** Hoy, sin conversión, se descuenta sin convertir. Pasar a error puede bloquear una venta. Hoy no hay ingredientes con unidad distinta (0 filas), así que el riesgo inmediato es nulo.
- **`avg_cost numeric(12,2)`.** El costo por gramo se redondea. Cambiar el tipo está fuera de política (tabla con datos). Alternativa aditiva: guardar el costo por unidad base en una columna nueva `avg_cost_precise numeric(18,6)`, o calcular siempre desde el costo del empaque. Pregunta abierta.

---

## 8. Figma

Enlaces y node-ids en §10.

Paso 0:
- Página nueva **`99 Archivo — versiones anteriores`** (`948:113654`), con la sección vieja «Mesas — plano y detalle (versión anterior)» (`445:194860`) y su aviso.
- La propuesta nueva «POS — Mesas: cuadrícula y plano (propuesta)» (`870:98618`) quedó en la página 05, en x = 0, y = 112.291: el lugar que dejó la vieja, debajo de «Componentes — Mesas y promociones» y antes de «Reservas de mesas». Sin solapes.

---

## 9. Preguntas para el dueño (con recomendación)

1. **Modo «Al producir»: ¿reusar `production_type = 'preparation'` o agregar un valor nuevo?** Recomiendo reusar `preparation` (0 filas, ya está en el CHECK) y documentarlo.
2. **Receta compartida con variante «Doble»: ¿multiplicador por variante o copia editable?** Recomiendo copia editable, «Copiar de la compartida y ajustar». Un multiplicador no sirve cuando la doble cambia un ingrediente y no solo la cantidad.
3. **Merma: ¿sobre la cantidad neta (bruta = neta ÷ (1 − merma)) o sumada (neta × (1 + merma))?** Recomiendo la primera, que es el estándar de costeo de cocina.
4. **Costos: ¿permiso propio `inventory.costs.view`?** Recomiendo sí: hoy un cajero con `inventory.view` ve costos y márgenes.
5. **Borrador del formulario en `sessionStorage`: ¿lo quieres?** Recomiendo sí. Es barato, no toca la base y evita perder una receta larga.
6. **Opcionales al vender: ¿siempre se omiten o se enlazan a un modificador («con queso extra»)?** Recomiendo omitirlos en esta fase y enlazarlos a modificadores en una fase posterior.

---

## 10. Frames en Figma

Archivo `EAvjINVRnlzFM70GVoWXgl`. Enlace base: `https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=` seguido del id con guion.

Página 04 Inventario, dos secciones nuevas debajo de «Catálogo y producción — cómo se conecta todo»:

- **Componentes — Recetas y subsecciones (Nuevo)**: `957-583020`.
  - `FilaIngrediente` (`957-583384`)
  - `ResumenCostoReceta` (`957-583458`)
  - `SelectorAlcanceReceta` (`957-583482`)
  - `EditorReceta` (`957-584183`)
  - `EncabezadoSubseccion` (`959-168129`)
  - `FilaSubseccion` (`959-168240`)
  - `HojaDetalleEncabezado` (`959-168241`)
  - `DialogoConversion` (`959-168518`)
- **Productos — Recetas y subsecciones (propuesta)**: `957-583021`.

| # | Frame | node-id |
|---|---|---|
| F1 | Nuevo producto · receta apagada | `959-585580` |
| F2 | Nuevo · receta compartida y costo en vivo | `962-168756` |
| F3 | Nuevo · una receta por variante | `962-171090` |
| F4 | Nuevo · errores y guardado rechazado | `962-173471` |
| F5 | Editar · receta con versión (al producir) | `962-175880` |
| F6 | Tablet 834 · formulario | `963-171748` |
| F7 | Móvil · paso 3 › Avanzado › Receta | `963-173170` |
| F8 | Móvil · por variante con errores | `963-173599` |
| F9 | Móvil · hoja «Agregar ingrediente» | `963-174038` |
| D1 | Detalle › Producción › Receta (lectura y menú ⋯) | `968-175070` |
| D2 | Detalle › Editar receta (mismo EditorReceta) | `968-176149` |
| D3 | Detalle › Costo de receta | `968-177163` |
| D4 | Detalle › Órdenes + hoja de detalle | `968-178151` |
| D5 | Detalle › Distribución + hoja de detalle | `968-179187` |
| D6 | Detalle › Unidades y conversión + «Nueva conversión» | `968-180119` |
| G1–G6 | Nueva orden · Completar orden · Nueva distribución · Recibir traslado · Desactivar receta · Versiones | `970-177054`, `970-177176`, `970-177244`, `970-177365`, `970-177429`, `970-177494` |
| M1–M3 | Móvil · Receta · Órdenes · hoja de la orden | `972-178990`, `972-179280`, `972-179875` |
| T1 | Tablet 834 · Detalle › Receta | `972-180183` |
| A1 | Cómo funciona (guardado, resolutor, backend, manual de marca) | `972-602332` |

Capturas: `docs/design/figma/68-00` … `68-27` (`68-27` es la sección de Mesas en su sitio nuevo).

Chequeo por script al cerrar:
- 0 solapes (dentro de las secciones y entre secciones de la página 04);
- 0 nodos fuera de sección;
- 0 instancias rotas;
- 0 textos colapsados.

Los únicos textos recortados son intencionales: las barras de pestañas con desplazamiento horizontal del móvil y de la tablet.

---

## 11. Implementación de §2 (2026-09-28)

Estado: **§2 en código y en la base**. El formulario de nuevo, editar y duplicar producto ya no tiene el interruptor viejo «Compuesto o receta» con el enlace a Recetas: «Avanzado › Receta» trae el editor completo.

### 11.1 Decisiones del dueño aplicadas (§9)

| # | Pregunta | Aplicado |
|---|---|---|
| 1 | Modo «Al producir» | Reusa `production_type = 'preparation'` (ya estaba en el CHECK; 0 filas). «Al vender» = `composite` |
| 2 | Variante «Doble» | Copia editable: «Copiar de la compartida y ajustar» y «Copiar de…» otra variante |
| 3 | Merma | Sobre la neta: bruta = neta ÷ (1 − merma). Columna `recipe_ingredients.waste_pct` (default 0, rango 0 ≤ merma < 100) |
| 4 | Costos | Permiso nuevo `inventory.costs.view`, resuelto en el servidor. Sembrado aditivo en los roles con `inventory_management` (Super Admin, Admin de organización, Manager) y en los 3 cargos que lo tienen. El dueño de la organización y el super admin lo ven siempre. Sin el permiso, `fn_receta_costo` devuelve las líneas sin importes y el panel dice «Sin permiso para ver costos» |
| 5 | Borrador | sessionStorage, clave `producto-borrador:<org>:<modo>:<uuid o nuevo>`, solo en la página (no en el diálogo de alta rápida). Aviso «Recuperamos cambios sin guardar» con «Descartar borrador». Se borra al guardar. Las fotos por subir (File) no se guardan en el borrador |
| 6 | Opcionales al vender | Se omiten. Medido: 2 ingredientes opcionales, ambos de la receta del producto 51669, dejan de descontarse |
| — | `avg_cost numeric(12,2)` | Sin cambiar tipos: el costo se calcula con el costo de la unidad del ingrediente (el empaque: KG, LT, PAQ) × la cantidad convertida. Un costo por gramo no se redondea. Las cantidades del kardex siguen en `numeric(12,3)` (1 g de un ingrediente en KG) |

### 11.2 Base de datos (tres migraciones, cada una con su rollback)

1. `20260928230000_receta_resolutor_unico.sql`
   - B1 merma; B9 permiso de costos y `fn_productos_permisos` con `costos`.
   - Un solo cálculo: `fn_receta_int_factor` (organización → global → inversa), `fn_receta_efectiva` (propia; si es variante sin propia, la del padre), `fn_receta_int_a_jsonb`, `fn_receta_int_calcular` (cantidad × producido ÷ rinde ÷ (1 − merma) × conversión) y `fn_receta_int_expandir` (qué sale al vender).
   - B6: `decrement_stock_with_recipe` (POS, factura de venta, pedidos web, PMS) y `complete_production_order` usan ese cálculo. En producción se corrigió que `v_conv_factor` pisaba la proporción y que `record IS NOT NULL` duplicaba la fila de stock. Las dos quedan sin `anon`.
   - Medido antes de aplicar, fila a fila sobre las 55 recetas activas: 118 de 120 filas expanden igual que antes; las 2 que faltan son los opcionales (decisión 6). Rinde (todas en 1), herencia (0 padres con receta), conversión obligatoria (0 unidades distintas) y «al producir» (0 productos) no cambian nada existente. Un compuesto «al vender» con inventario propio sigue descontando ingredientes y producto, como hoy (3 productos).
2. `20260928231000_producto_guardar_con_recetas.sql`
   - B3 `product_save_requests` (idempotencia, RLS de lectura por pertenencia, sin escritura desde el navegador, limpieza a 30 días).
   - B4 `fn_receta_int_guardar_version` (valida y crea la versión N+1, o nada si no cambió; no invocable desde el navegador), `fn_receta_costo`, `fn_receta_necesidades`, `fn_receta_expandir`, `fn_producto_recetas_para_formulario`.
   - B5 `fn_producto_guardar`: la idempotencia va después del permiso y antes de validar (un reintento de un «crear» ya guardado no choca con `sku_duplicado`); `variantes[].clave` va y vuelve; bloque de recetas tras las variantes. Sin la clave `receta` no se tocan recetas (compatibilidad).
   - B7 `fn_receta_guardar` (permiso `inventory.edit`, `product_management` o `inventory_management`).
3. `20260928232000_receta_permisos_revoke_explicito.sql`: el revoke explícito de `fn_productos_permisos` que la política pide junto a la función (la ACL ya estaba bien).

Pruebas en la base, todas dentro de `begin … rollback`: crear producto con receta compartida y receta de variante nueva; idempotencia (el reintento devuelve el mismo id y no duplica); herencia padre → variante; venta con y sin merma (0,3 KG y 0,3 ÷ 0,9 KG); ingrediente sin inventario no se mueve; sin cambios no crea versión y con cambios crea la 2; rinde 12 (6 unidades = la mitad); `conversion_faltante`, `receta_autorreferida`, `receta_ingrediente_repetido`, `receta_merma_invalida`, `receta_al_producir_sin_inventario`; costo del borrador (tanda 5.100 con una línea sin costo y una sin conversión); necesidades de un carrito; apagar desactiva sin borrar; ida y vuelta de un producto real con 5 recetas de variantes sin crear versiones; el payload anterior sin `receta` funciona igual; 52 de las 55 recetas activas vuelven a guardarse sin crear versión.

**Ojo con 3 productos (63907, 64014, 64054):** son los de F-68, ingrediente de su propia receta. Al editarlos, la fila del propio producto sale marcada («Es el propio producto… quítalo») y hay que quitarla para guardar. Ya no descontaba nada; es solo limpieza.

### 11.3 Código

- Kit `src/components/kit/receta/`: `EditorReceta`, `FilaIngrediente` (fila y tarjeta, arrastrar y ↑/↓ en el asa), `ResumenCostoReceta`, `SelectorAlcanceReceta`, `DialogoConversion` (se guarda para la organización; la conversión solo para un producto espera a B2), `useCostoReceta` (debounce de 400 ms contra `fn_receta_costo`) y `recetaLogica.ts` (estado, validación, payload; sin cálculo de costos en TypeScript). Namespace i18n `receta` en es/en/fr/pt.
- Formulario: `SeccionReceta` dentro de `SeccionAvanzado`; estado `receta` (reemplaza `is_composite`), validación del campo `receta` (sección Avanzado, paso «Más detalles» en móvil), payload con `receta` y `variantes[].clave`, clave de idempotencia estable mientras el formulario no cambie, borrador local, recetas cargadas con `fn_producto_recetas_para_formulario` (si no cargan, el formulario no abre: guardar sin ellas las desactivaría). «Crear ingrediente» abre el mismo formulario de producto en diálogo.
- Los cinco sitios de §1.2: venta y producción en SQL con el resolutor; `stockMovementService` (reservas web) llama a `fn_receta_expandir`; `compositeStockValidation` (aviso del POS) hace una sola llamada a `fn_receta_necesidades` (sin N+1, con conversión y rinde); `recipeService.createRecipe/updateRecipe` (pantalla Recetas) van por `fn_receta_guardar` (B8).
- Pruebas: `recetaLogica.test.ts`, `recetaRender.test.tsx` (4 idiomas), `formularioReceta.test.ts`, `recetaRpc.test.ts` (dobles de `supabase.rpc`) y `src/__tests__/db/recetaResolutorUnico.test.ts` (contrato de las migraciones).

### 11.4 Pendiente

- §3 pestaña «Producción» del detalle (Receta, Costo, Órdenes, Distribución, Unidades), `TablaSubseccion`, `HojaDetalle`, versiones y «Reactivar».
- `complete_production_order`: costo real del terminado (hoy entra a costo 0) y paso por el kardex común (§3.3).
- B2 conversiones por producto y su alcance «Solo este producto» en `DialogoConversion`.
- B10 distribución desde la orden de producción.
- `CostoRecetasService` (reporte): sigue con su cálculo propio (máximo `avg_cost` entre sucursales y sin encontrar conversiones). Pasarlo a `fn_receta_costo` necesita elegir sucursal en el reporte: va con §3.2.
- `RecipeDialog.tsx` sigue con su interfaz vieja (ya guarda por `fn_receta_guardar`); sustituirlo por `EditorReceta` va con la pantalla Recetas.
- Opcionales enlazados a modificadores («con queso extra»): fase posterior.
- «Registrar costo faltante» desde la fila sin costo (§3.2): hoy solo avisa.
- Adenda del kit en `docs/design/KIT-CODIGO.md`: ese archivo tiene cambios sin commit de otra sesión; se deja para no mezclarlos.
- Verificación visual en el navegador: el agente no pudo abrir una sesión; las pruebas de render cubren los estados en los 4 idiomas, falta la revisión del dueño en pantalla.
