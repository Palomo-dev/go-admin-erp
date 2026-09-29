# Productos por peso con báscula — lógica y Figma (propuesta 2026-09-28)

Pedido del dueño (2026-09-28): «Necesito que los productos puedan usar báscula, o sea que los puedan pesar,
y ponerle precio al peso cada tanto, y que lo puedan vender en el POS. Ayúdame a construir la lógica, y en
Figma la UI y los componentes que toca actualizar para yo revisarlos y aprobarlos.»

Alcance de esta entrega: análisis del estado actual, diseño de la lógica (base de datos, backend, POS,
hardware) y la propuesta en Figma. **No se aplicó ninguna migración ni se cambió código de la app**: todo lo
de las secciones 2 a 5 queda propuesto para aprobación. Fuentes: código de `main`, base
`jgmgphmzusbluqhuqihj` (solo `SELECT` y `pg_get_functiondef`) y el archivo de Figma
`EAvjINVRnlzFM70GVoWXgl`.

---

## 0. Resumen

- Un producto pasa a tener **«Cómo se vende: Por unidad · Por peso · Por medida»**. Por peso usa kg o lb;
  por medida, metro o litro. Todo lo demás del producto (impuestos, categorías, variantes, recetas) no cambia.
- **El precio se guarda siempre por unidad de venta** (por kg) en `product_prices`, con la misma vigencia y el
  mismo «Actualizar precio» programable de hoy. «Cada tanto» (por cada 100 g, 250 g, 500 g…) es solo cómo se
  escribe y se muestra el precio: $ 1.890 cada 100 g se guarda como $ 18.900 / kg. No hay un segundo sistema
  de precios.
- **Stock, costo y kardex quedan en kg** con 3 decimales (gramos). La base ya lo soporta: `sale_items`,
  `stock_levels`, `stock_movements` e `invoice_items` son `numeric(12,3)`. Las recetas ya convierten gramos a
  kg (`fn_receta_int_factor`).
- **En el POS**, tocar un producto por peso abre **«Pesar»**: lectura en vivo de la báscula (estable o
  inestable), Cero, Tara, tara de la bandeja, peso a mano si hay permiso, y el importe calculado en vivo. La
  línea del carrito muestra «0,735 kg × $ 18.900 / kg» y el chip de peso reabre «Pesar» para cambiarlo.
- **La venta sigue saliendo por `pos_checkout_v1`** sin cambiar su contrato: la cantidad ya es `numeric`. Se
  agrega el origen del peso en `notes.pesaje` (báscula, manual o etiqueta) para auditoría.
- **Etiquetas de balanza**: el mismo escáner lee los EAN-13 de peso variable (prefijos 20–29 de uso interno
  GS1). El formato se configura por organización. Ojo: el generador interno ya usa el prefijo 20 en 744
  productos, así que el prefijo de peso no puede ser 20 y el código exacto siempre se busca primero.
- **Hardware**: en Go Admin Desktop, el proceso principal abre el puerto serie/USB y entrega bytes al POS por
  un puente nuevo `scale:*`; en Chrome/Edge sin Desktop se usa Web Serial; en celular, peso a mano o etiqueta
  leída con la cámara. Un único intérprete de protocolos (continuo ST,GS, Toledo 8217, SICS, CAS, Dibal,
  expresión propia) vive en el código web y lo usan todos los transportes.
- Hay que corregir antes, sí o sí: la factura electrónica envía la cantidad con 2 decimales (0,735 → 0,74) y
  toda línea sale como «Unidad»; el carrito solo acepta enteros y funde líneas iguales.

---

## 1. Estado actual verificado

### 1.1 Base de datos (verificado con el MCP)

| Objeto | Tipo real | Qué significa para el peso |
|---|---|---|
| `sale_items.quantity` | `numeric(12,3)`, `unit_price numeric(12,2)`, `total numeric(12,2)` | Ya guarda 0,735 y $ 18.900 por kg. En 70.000+ productos nunca se vendió una cantidad fraccionaria (0 filas) |
| `stock_levels.qty_on_hand` / `qty_reserved` | `numeric(12,3)`; `avg_cost numeric(12,2)` | Stock en gramos si la unidad es kg. El costo promedio por kg cabe; por gramo perdería precisión (2 decimales) |
| `stock_movements.qty` | `numeric(12,3)`, `unit_cost numeric(12,2)` | Kardex con decimales |
| `invoice_items.qty` | `numeric(12,3)`; `unit_measure_id integer default 70` | 70 = «Unidad» en `dian_unit_measures` (70 Unidad, 71 KGM, 72 LTR, 73 MTR; 10 filas en total) |
| `return_lines.quantity` | `numeric` | Devolución parcial por peso posible |
| `recipe_ingredients.quantity` | `numeric` + `unit_code` | Recetas en gramos ya existen |
| `products.unit_code` | `character(4)`, FK a `units(code)` | 70.037 productos en UN, 261 sin unidad, 7 en GR, 3 en LT |
| `products.weight_kg` | `numeric` | **Es peso de envío** (sección Avanzado), no la unidad de venta. No se reutiliza |
| `units` | 13 filas: UN, KG, GR, LT, ML, MT, CM, M2, M3, CAJ, PAQ, PR, SV; `unit_type` weight/volume/count/length/area | **No hay libra (LB)** |
| `unit_conversions` | globales KG↔GR, LT↔ML, MT↔CM, PAQ/CAJ↔UN; `from/to_unit_code character(3)` | La conversión de gramos a kg ya está |
| `product_prices` | `price numeric(12,2)`, `effective_from`, `effective_to`, `compare_price` | Precio con vigencia; `fn_producto_fijar_precio(org, producto, precio, comparacion, desde)` programa |
| `currencies.decimals` | COP 0, CLP 0, USD/EUR/MXN 2 | El redondeo de pantalla sale de aquí |
| `organization_barcode_settings` | `format` ean13/code128, `prefix` default **'20'**, `next_number`, `code_length`; 7 filas | El generador interno ya ocupa el prefijo 20 |
| Códigos existentes | 744 productos con EAN-13 que empieza por 20 (6 organizaciones); 1 por 26 y 1 por 27 | El prefijo de peso no puede ser 20 |
| `printers` / `print_agents` / `printer_station_assignments` / `print_jobs` | Impresoras por sucursal y estación; agente por equipo (`agent_name`) | Modelo a imitar para las básculas |
| `pos_terminals` | `id uuid`, sucursal, `code`; 0 filas | Existe pero casi no se usa (pantalla del cliente) |
| `organization_settings` | `key` + `settings jsonb`; claves `pos_*` | Lugar para la regla de peso manual |
| `permissions` | códigos `pos.discount`, `pos.void`, `pos.refund`, `pos.cajas.*`… | Se agregan `pos.peso_manual` y `pos.basculas.configurar` |

### 1.2 Funciones que intervienen (con `pg_get_functiondef`)

| Función | Qué hace hoy con la cantidad |
|---|---|
| `pos_checkout_v1(p_envelope jsonb)` | `v_qty := (item->>'quantity')::numeric`; exige `> 0`; inserta `sale_items` con `::numeric`; copia `notes` si es objeto; descuenta stock con `decrement_stock_with_recipe(..., si.quantity, ...)`; inserta `invoice_items.qty = si.quantity` **sin `unit_measure_id`** (queda 70) |
| `fn_pos_validar_linea_venta` | El `unit_price` debe ser el precio vigente + modificadores (±0,01) en `now()`, en la hora de la venta o en `priced_at` (hasta 30 días atrás). Total esperado `qty × precio − descuento` sin redondear y el impuesto a 2 decimales, con tolerancia 0,05 |
| `fn_pos_precio_base_vigente(producto, momento)` | La fila de `product_prices` vigente en ese momento |
| `decrement_stock_with_recipe` → `fn_receta_int_expandir` | `p_qty numeric`; si hay receta, expande en la unidad de cada ingrediente con `fn_receta_int_factor` |
| `fn_receta_int_factor(org, de, a)` | Factor directo o inverso de `unit_conversions`, la de la organización primero |
| `procesar_devolucion` | Cantidad `numeric`, reintegro `round(total / cantidad × devuelto, 2)`; nota crédito proporcional |
| `fn_producto_guardar(org, payload)` | Guarda el producto en una operación; `unit_code` por defecto 'UN'; no conoce campos de peso |
| `fn_producto_fijar_precio` → `fn_producto_int_fijar_precio` | Cancela lo programado, cierra la fila vigente e inserta la nueva con `effective_from = desde` |
| `fn_pos_autorizar_descuento` | Hoy es un `return` vacío: la autorización de supervisor está solo propuesta (`POS-AUTORIZACION-SUPERVISOR.md`) |

### 1.3 Qué impide hoy vender 0,735 kg (código)

| Dónde | Problema |
|---|---|
| `src/components/kit/cartLineLogica.ts:104` `cantidadDesdeTexto` | `Number.parseInt`: 0,735 se vuelve 0 |
| `src/components/kit/CartLine.tsx:184, 194, 173/207, 203` | `inputMode="numeric"`, regex `^\d+$`, botones ±1, campo `w-8` |
| `src/components/pos/venta/carrito/LineasCarrito.tsx:190` | Atajos de teclado ±1 |
| `src/lib/pos/venta/catalogoGrilla.ts:74` `interpretarBuscador` | Cantidad rápida «3*» solo enteros 1–999 |
| `src/lib/services/posService.ts:979-987` `addItemToCart` | Funde el mismo producto en una línea (`quantity += quantity`): dos pesadas se sumarían |
| `src/lib/pos/lineaVenta.ts:33` `calcularLineaVenta` | `Number(quantity) \|\| 1`: una cantidad 0 o NaN se vuelve 1 |
| `src/components/pos/mesas/id/AddProductDialog.tsx:728-750`, `OrderItemCard.tsx:282`, `TransferItemDialog.tsx:127`, `SplitBillDialog.tsx:279,292` | `parseInt` en mesas |
| `src/components/pos/devoluciones/ReturnForm.tsx:118-161, 398-402`; `devolucionesService.ts:270` | Devoluciones con `parseInt` (0,375 → 0) |
| `src/lib/services/promotionEngine.ts:268-277` | «Lleve X pague Y» con `Math.floor` de la cantidad: mezclaría kg con unidades |
| `print-agent/src/printing/renderHtml.ts:306, 309, 276/410` y `electron/src/agent/printing/renderEscpos.ts:411-412, 520/602, 911/988` | Imprimen «`${quantity}x`», «c/u» y «(N unidades)»; no hay formateador de cantidad |
| `src/lib/services/einvoicing/payloadsFactus.ts:131` `mapearLinea` | `quantity: fijo(cantidad)` con 2 decimales: **0,735 kg viaja como 0.74 a la DIAN** |
| `src/lib/services/factusService.ts:747` `mapUnitMeasure` | Conoce los ids internos 1–10 (7 = kilogramos); `invoice_items.unit_measure_id` vale 70, no mapea y cae en '94' Unidad. Dos catálogos que no coinciden |
| `src/lib/pos/display/projection.ts:147-160` | Pantalla del cliente: «1,5» se vuelve NaN/0 (`PROGRESS.md`) |
| `detalle/inventario/stock/useFormatoInventario.ts` | El kardex muestra máximo 2 decimales (la base guarda 3) |
| `electron/src/main/permissions.ts:191` | `setDevicePermissionHandler(() => false)` bloquea WebSerial/WebUSB/WebHID dentro del Desktop (a propósito) |
| Desktop y `package.json` | No hay `serialport`, `usb` ni `node-hid`; no existe transporte serie |

### 1.4 Qué ya lo permite

- Base de datos completa en decimales (ventas, stock, kardex, facturas, devoluciones, recetas).
- `pos_checkout_v1` y la venta offline (outbox `goadmin-outbox` en IndexedDB, `salesSync.replayOne`,
  `FASE-4B/4E`) no asumen enteros: pasan la cantidad tal cual.
- `CartLine.tsx:138` ya muestra hasta 3 decimales con `Intl.NumberFormat` y la línea ya admite unidad
  («× precio / unidad»).
- `CampoNumero` (kit, Figma `NumberInput`) acepta coma o punto, decimales y sufijo.
- El motor de documentos (`src/lib/documents/render/formato.ts:70-75`) formatea hasta 4 decimales.
- `src/lib/utils/codigoBarras.ts` ya tiene `digitoControlGs1` y validación EAN-13.
- El lector de códigos (`barcodeWedge.ts`, `useHardwareBarcodeScanner.ts`) funciona igual para etiquetas de
  peso; solo falta el decodificador.
- El puente del Desktop ya tiene el patrón de un subsistema de hardware (`posDisplay`, con `subscribe` en el
  preload y verificación de origen en `posDisplayIpc.ts:106-112`).

### 1.5 Hallazgos que conviene corregir aunque no se apruebe el peso

1. **Factura electrónica con 2 decimales de cantidad** (`payloadsFactus.ts:131`). Hoy no pasa porque nunca
   hubo cantidades fraccionarias, pero cualquier venta por peso saldría mal ante la DIAN.
2. **Unidad de medida DIAN**: `pos_checkout_v1` no llena `invoice_items.unit_measure_id` y
   `mapUnitMeasure` no conoce el 70. Todas las líneas salen «94 Unidad». Hay que unificar el catálogo
   (`dian_unit_measures` 70–73 frente al mapa 1–10) y confirmar contra la documentación de Factus el código
   de kilogramo antes de la fase 2.
3. **Cantidades con más de 3 decimales**: el cliente puede mandar 0,7354; Postgres guarda 0,735 pero el
   validador comparó con 0,7354. Hay que redondear la cantidad a `qty_decimals` antes de calcular la línea.
4. **Prefijo 20 compartido**: el generador interno usa 20; los códigos de balanza usan 20–29. El POS debe
   buscar primero el código exacto y el prefijo de peso no puede coincidir con el del generador.
5. **Servidor local de impresión con `Access-Control-Allow-Origin: *`** (`discoveryServer.ts:527`): cualquier
   página abierta en ese equipo puede llamarlo. La báscula **no** debe ir por ahí.

---

## 2. Diseño de la lógica

### 2.1 «Cómo se vende» — el modelo

**Recomendación: tres modos en el propio producto** (`products.sale_mode`):

| Modo | Unidad (`unit_code`) | Decimales de cantidad | Báscula |
|---|---|---|---|
| `unit` (hoy) | UN, CAJ, PAQ, PR, SV… | 0 | No |
| `weight` | KG o LB | 3 (gramos o milésimas de libra) | Sí: lectura, a mano o etiqueta |
| `measure` | MT, LT (y M2 si se pide) | 2 | No: cantidad escrita con decimales |

«Por medida» sale gratis del mismo diseño: es el mismo camino sin «Pesar», con un campo de cantidad decimal
(tela, cable, manguera, combustible a granel).

Alternativas descartadas:
- *Un booleano `is_weighable`*: no cubre metros y litros y obliga a otro flag después.
- *Una tabla aparte `product_weighing`*: agrega un JOIN en el catálogo del POS, en la réplica offline y en
  cada lectura, para 6 columnas que son del producto.
- *Variantes («Al peso» y «Bloque 500 g»)*: ya funcionan hoy porque cada variante es un producto; sirven para
  la **presentación fija** (ver 2.2), no para el peso en sí.

### 2.2 Unidad y precio «cada tanto»

- **El precio se guarda por unidad de venta** (por kg) en `product_prices.price`. Así `fn_pos_validar_linea_venta`,
  `fn_pos_precio_base_vigente`, el catálogo de Meta (`trg_meta_price_sync`), las listas y los reportes siguen
  igual.
- «Cada tanto» es presentación: `products.price_ref_qty` + `price_ref_unit_code` (por ejemplo 100 + GR). El
  formulario deja escribir el precio «cada 100 g» y guarda `precio_escrito ÷ (100 × factor(GR→KG))`.
- Solo se permiten referencias que dan un precio por kg **exacto** en la moneda: 1 kg, 500 g, 250 g, 100 g y
  50 g (×1, ×2, ×4, ×10, ×20). Con «cada 300 g» el precio por kg tendría decimales periódicos: el formulario lo
  rechaza (frame P3). En libras, solo «por lb».
- La libra se agrega como unidad global `LB` con sus conversiones (`LB→KG 0,45359237`). Un producto se vende
  en kg **o** en lb; no se mezclan en la misma línea.
- **Presentación fija** (bandeja de 500 g a precio fijo): es otro producto «por unidad» con una receta que
  consume 0,5 kg del producto a granel. Reutiliza recetas; no crea un segundo precio en el mismo producto.

### 2.3 Precio por peso con vigencia

- «Actualizar precio» ya programa con `fn_producto_fijar_precio(..., p_desde)`; solo cambia la etiqueta
  («Nuevo precio cada 100 g» / «por kg») y la conversión antes de llamar. El historial muestra «/ kg».
- El POS offline elige la fila vigente en el momento de la venta (`precioVigente.ts`); un cambio programado
  para las 06:00 entra solo, también sin conexión, si la réplica ya tiene la fila futura.
- Balanzas etiquetadoras: el precio impreso por la balanza no manda (ver 2.7). Para que la etiqueta coincida,
  «Exportar PLU» genera el archivo para cargar la balanza después de un cambio.

### 2.4 Stock, costo, kardex y recetas

- Stock y costo en la unidad del producto (kg). Compras por kg: la orden de compra usa la misma unidad; si el
  proveedor factura por bulto de 25 kg, se usa una conversión propia de la organización (ya existe
  `ConversionesPage`).
- **Recomendación firme: kg y no gramos como unidad** de productos por peso. `avg_cost` y
  `product_costs.cost` tienen 2 decimales: por gramo, un costo de $ 12,4 por kg se volvería $ 0,01 por gramo.
- Recetas: un plato que usa «150 GR» de un producto en kg descuenta 0,150 kg con `fn_receta_int_factor`
  (ya funciona). Un producto por peso también puede **tener** receta (por ejemplo carne molida hecha de
  carne en trozo): `decrement_stock_with_recipe` recibe 0,735 y expande proporcional.
- Kardex y existencias muestran la cantidad con los decimales del producto y su unidad («12,400 kg»), no
  «uds»: cambiar `useFormatoInventario`, `KardexTable`, `MovimientosTable` y la tarjeta de stock.

### 2.5 Importe de la línea y redondeo

Ejemplo: 0,735 kg × $ 18.900 / kg = **$ 13.891,50**; la organización usa COP (0 decimales).

| | A · redondear la línea a la moneda | **B · línea exacta, redondeo al mostrar y al cobrar (recomendada)** |
|---|---|---|
| `sale_items.total` | 13.892 | 13.891,50 |
| Validador del checkout | Cambia: `round(qty × precio, decimales_moneda)` solo para productos no `unit` | No cambia (ya compara el valor exacto) |
| Factura electrónica | Factus calcula 0,735 × 18.900 = 13.891,50: **no cuadra** con la venta sin un ajuste por línea | Cuadra al centavo con el XML |
| Pantalla, tiquete, PDF | $ 13.892 | $ 13.892 (el formateador de moneda ya redondea) |
| Efectivo | Exacto | El total a cobrar se muestra redondeado; el cambio se redondea hacia abajo a la moneda y la diferencia menor de un peso queda como redondeo de caja (el cierre ya tolera menos de medio peso, `historialCajas.ts:26`) |

B no toca el servidor y deja la DIAN coherente; por eso se recomienda. Si el dueño prefiere A, el cambio es
una línea en `fn_pos_validar_linea_venta` y un ajuste en `mapearLinea` (pregunta 3).

Reglas comunes a A y B:
- La cantidad se redondea a `qty_decimals` **antes** de calcular (0,7354 → 0,735).
- El descuento de línea sigue topado en `qty × precio`.
- Los modificadores con precio en un producto por peso suman al precio por kg (mismo cálculo del servidor);
  el formulario avisa si un producto por peso tiene modificadores con precio.
- Promociones «lleve X pague Y» no aplican a productos por peso (por cantidad no tiene sentido); los
  descuentos por porcentaje o valor sí.

### 2.6 POS

**Agregar.** Tocar la tarjeta (o Enter con foco, o el resultado del buscador) de un producto `weight` abre
«Pesar» en lugar de sumar 1. Un producto `measure` abre el mismo diálogo sin lectura: solo la cantidad.

**«Pesar»** (`DialogoPesar`, escritorio 520 px u hoja móvil):
1. Título con el producto; subtítulo con precio por kg, existencias y PLU.
2. `LecturaBascula`: estados *conectando*, *estable*, *inestable*, *fuera de rango* (negativo o sobrecarga),
   *error* (sin lectura del puerto) y *manual*.
3. Controles: **Cero (Z)**, **Tara (T)** (toma la lectura actual como tara), tara predefinida del producto
   («Bandeja 15 g»), **Peso a mano (M)** si la regla y el permiso lo permiten.
4. Cálculo en vivo «0,735 kg × $ 18.900 / kg» y el importe; «Mínimo 0,050 kg».
5. **Enter** agrega solo con lectura estable (≥ `stable_ms`, 500 ms por defecto), neto > 0, ≥ peso mínimo y
   ≤ capacidad. Opción de la organización: agregar solo al estabilizar, sin Enter.
6. **Esc** cancela. Si el producto «exige báscula», no aparece «Peso a mano».

**Carrito.** Cada pesada es **una línea propia** (no se funde con otra del mismo producto). En la línea, el
chip «⚖ 0,735 kg» reemplaza a «− 1 +» y el detalle dice «× $ 18.900 / kg». Tocar el chip (o F2 con la línea
enfocada) reabre «Pesar» en modo **cambiar peso**; notas, descuento y modificadores se conservan. Los atajos
±1 no aplican a líneas por peso. La cantidad rápida «3*» tampoco.

**Checkout.** Sin cambio de contrato en `pos_checkout_v1`:
- `quantity` decimal (redondeada a `qty_decimals`), `unit_price` por kg, `total` exacto.
- `notes.pesaje` (objeto jsonb que el checkout ya copia): `{ "origen": "bascula" | "manual" | "etiqueta",
  "bruto": 0.750, "tara": 0.015, "neto": 0.735, "unidad": "KG", "estable": true, "bascula_id": "…",
  "leido_en": "…", "codigo_etiqueta": "2700104007353", "autorizado_por": "…" }`.
- El servidor valida (en `fn_pos_validar_linea_venta`, parche aditivo): decimales de la cantidad ≤
  `qty_decimals` del producto; cantidad ≥ `min_sale_qty` si existe; si `origen = 'manual'`, que la regla de la
  organización lo permita y que el actor tenga `pos.peso_manual` o venga `autorizado_por`; si el producto
  exige báscula, que el origen no sea manual. Productos `unit` no cambian de comportamiento.
- `invoice_items.unit_measure_id` sale de la unidad del producto (nueva columna `units.dian_unit_measure_id`).

**Tiquete y factura.** Un formateador único `formatoCantidad(cantidad, unidad, decimales)` en
`print-agent/src/printing` (compartido por HTML, ESC/POS, texto plano, móvil y factura electrónica HTML):
«0,735 kg x $ 18.900/kg» con el importe a la derecha; se quitan «c/u» y «(N unidades)» cuando hay líneas por
peso («4 líneas · 3,235 kg»). La factura agrega la columna «Unidad». Factus: cantidad con 3 decimales y la
unidad correcta.

**Devoluciones.** `ReturnForm` acepta decimales hasta lo vendido (máximo 0,735 kg), con la misma unidad; el
servidor ya prorratea. La devolución de un producto por peso vuelve al stock solo si se marca «reingresa»
(producto fresco muchas veces no se reintegra).

**Pantalla del cliente.** Muestra «Pesando: 0,735 kg × $ 18.900 / kg = $ 13.892» mientras el diálogo está
abierto (opción de la organización, activa por defecto). Corrige de paso el NaN de `projection.ts`.

**Mesas.** El mismo diálogo en `AddProductDialog` de mesas (comida por peso: buffet, carnes). Las comandas
muestran «0,500 kg».

### 2.7 Etiquetas de peso variable (balanzas etiquetadoras)

Formato EAN-13 de uso interno GS1: `PP` prefijo (21–29, configurable) + PLU (4–6 dígitos) + [dígito de
control del valor opcional] + valor (4–6 dígitos) + dígito de control EAN. La suma debe dar 13.

| Formato | Ejemplo | Lectura |
|---|---|---|
| Peso embebido (recomendado) | `27 00104 00735 3` | PLU 104, 0,735 kg; el precio sale de `product_prices` |
| Precio embebido | `28 00104 13892 4` | PLU 104, $ 13.892; cantidad = 13.892 ÷ precio vigente, redondeada a 3 decimales; aviso si el importe recalculado difiere de la etiqueta |

Algoritmo del POS (función pura `decodificarEtiquetaPeso(codigo, formato)` en `src/lib/pos/`, compartida por
web, Desktop y móvil):
1. Buscar el código **exacto** en `products.barcode` (en línea o en la réplica offline `by_org_barcode`). Si
   existe, es un producto normal y termina.
2. Si no existe, es EAN-13 válido y su prefijo está en `weight_label_prefixes`: separar PLU y valor,
   verificar el dígito de control (y el del valor si el formato lo tiene).
3. Buscar el producto por `(organization_id, scale_plu)`; debe ser `sale_mode <> 'unit'`.
4. Agregar la línea con origen «etiqueta» y el código en `notes.pesaje`; sin abrir «Pesar».
5. PLU inexistente, dígito malo o producto por unidad: toast de error y no se agrega nada.

Configuración (organización): activo, prefijos (el 20 bloqueado si coincide con el generador), contenido
peso/precio, dígitos de PLU y de valor, dígito de control del valor. Al guardar se avisa cuántos productos
tienen un código propio que empieza por ese prefijo (hoy 1 con 27). El generador de códigos
(`codigos_barras_reservar`) no puede usar un prefijo de peso.

PLU: `products.scale_plu` (1–99.999, único por organización). **Exportar PLU** genera un CSV «PLU; nombre;
precio por kg; tara; días de vida» para cargar la balanza con su software. La sincronización directa con cada
marca (Dibal, CAS, Mettler, Bizerba) queda para una fase posterior y por marca.

Etiquetas impresas desde Go Admin (sin balanza etiquetadora): variante nueva «Precio=peso-variable» de
`Doc/Etiqueta de producto`: se pesa en «Pesar», y en lugar de agregar al carrito se imprime la etiqueta 2x
para la vitrina (fase 4).

### 2.8 Hardware: cómo se lee la báscula

**Arquitectura.** Transporte → bytes → intérprete único → lectura normalizada.

```
Báscula ──serie/USB──► (a) Desktop: proceso principal (serialport) ──IPC scale:data──┐
        ──serie/USB──► (b) Chrome/Edge: navigator.serial ───────────────────────────┤──► intérprete (src/lib/pos/bascula)
        ──BLE────────► (d) móvil, fase posterior: @capacitor-community/bluetooth-le ─┘        │
                                                                                            ▼
                                                  LecturaBascula { neto, bruto, tara, unidad, estable, estado }
```

El Desktop **solo entrega bytes y escribe comandos**: el intérprete de protocolos vive una sola vez en el
código web y lo usan Desktop, Web Serial y BLE. Así no se duplica lógica entre `electron/` y `src/`.

**(a) Go Admin Desktop.**
- Dependencia `serialport` en `electron/package.json` (tiene binarios precompilados para Electron 33;
  `asarUnpack` para su `.node` y `@electron/rebuild` como respaldo; `HARDENING-2026-09-21.md` §5 registra que
  un módulo nativo ya dio problemas: probar el instalador NSIS en Windows limpio).
- Módulo nuevo `electron/src/main/scale/` (proceso principal, no `src/agent`, que es código generado, ni el
  servidor local de impresión, que responde a cualquier origen).
- IPC con el patrón `dominio:acción` y verificación de origen `isInternalUrl` como `posDisplayIpc.ts`:
  `scale:list-ports`, `scale:open`, `scale:close`, `scale:write`, `scale:status` y los eventos `scale:data`,
  `scale:state`.
- La política de dispositivos del Desktop (`setDevicePermissionHandler(() => false)`) **no cambia**: dentro del
  Desktop no se usa Web Serial.
- La báscula elegida para «este equipo» se guarda en `DesktopConfig` (`store.ts`, como `posDisplay`) y en
  `pos_scales.print_agent_id`. Con varias cajas por equipo, `pos_terminal_id`.

**(b) Navegador con Web Serial.** Chrome/Edge 89+ en computador, HTTPS (ya se cumple). La primera vez el
usuario elige el puerto (`requestPort` con gesto del usuario); después `getPorts()` lo recuerda en ese
navegador. No funciona en Safari, Firefox, iPad ni celulares: el diálogo lo dice (frame K3).

**(c) Sin báscula.** Peso a mano según la regla de la organización (2.11) o etiqueta de balanza con el
lector USB o la cámara del POS móvil.

**Protocolos del intérprete** (configurables por báscula: baudios, bits, paridad, parada, unidad, decimales,
capacidad, división, tiempo de estabilidad):

| Protocolo | Trama típica | Modo |
|---|---|---|
| Continuo «ST,GS» (A&D, CAS, muchos indicadores genéricos) | `ST,GS,+00.735kg\r\n`; `US` = inestable, `OL` = sobrecarga, `NT` = neto | La báscula manda sola |
| Mettler Toledo 8217 | petición `W` → `STX 0.735 CR`; `S` → estado (movimiento, bajo cero, sobrecarga) | Petición cada 200 ms |
| Mettler SICS | `S` → `S S     0.735 kg`; `SI` inmediato; `S D` = dinámico | Petición |
| CAS PD-II | `ENQ` → `ACK`, `DC1` → trama con estado y peso | Petición |
| Dibal | trama de petición del modelo (se valida con el equipo antes de la fase 3) | Petición |
| Propio | expresión regular con grupos `estado`, `signo`, `peso`, `unidad` | Cualquiera |

La prueba de lectura (frame K4) muestra los bytes crudos cuando la trama no se reconoce y sugiere el
protocolo que sí la entiende.

**Configuración.** Tabla nueva `pos_scales` por sucursal, igual que `printers`: nombre, transporte, protocolo,
parámetros, equipo (`print_agent_id`) o caja (`pos_terminal_id`), última prueba. Se configura en
**Configuración › POS › Básculas**, junto a Impresoras (no hay una sección «Dispositivos» para el POS).

### 2.9 Reglas de negocio y control

| Caso | Regla |
|---|---|
| Peso negativo | No se agrega; «Pon en cero sin nada encima» |
| Sobrecarga o más que la capacidad | No se agrega; «Sobrecarga (máx. 15 kg)» |
| Inestable | «Agregar» deshabilitado hasta `stable_ms` de lectura igual (tolerancia de 1 división) |
| Por debajo del mínimo | No se agrega; muestra el mínimo |
| Sin lectura 3 s | Estado error; «Reintentar» y, si aplica, «Pesar a mano» |
| Tara | Se resta en el POS (bruto − tara); si la báscula ya manda neto (`NT`), no se resta dos veces |
| Tara obligatoria (opcional por producto) | Si el producto tiene tara por defecto y está marcada como obligatoria, no se agrega sin tara |
| Peso manual | Según la regla: no permitido · con permiso `pos.peso_manual` · con supervisor. Siempre queda `origen = manual`, usuario, hora y, si hubo, supervisor |
| Producto «exige báscula» | Nunca manual; sin báscula no se vende (salvo etiqueta) |
| Etiqueta con precio distinto al vigente | Se usa el precio vigente y se avisa; reporte de etiquetas desactualizadas |
| Stock insuficiente | Igual que hoy (el POS avisa; el checkout no bloquea) |
| Auditoría | Reporte «Pesos manuales» por cajero y día desde `sale_items.notes->'pesaje'` (índice parcial por `origen`) |

### 2.10 Venta offline

- La lectura de la báscula es local: funciona sin internet en Desktop y en Web Serial.
- La réplica del catálogo (`catalogReplicator.ts`, `catalogStore.ts`, `posOfflineReads.ts`) debe incluir
  `sale_mode`, `qty_decimals`, `price_ref_*`, `min_sale_qty`, `default_tare_qty`, `scale_plu`, `require_scale`
  y un índice local por `scale_plu`; también el formato de etiqueta de la organización y la báscula del equipo.
- El sobre del outbox ya lleva `quantity` decimal y `notes`; `pos_checkout_v1` lo reproduce igual (idempotente).
- Peso manual con supervisor offline: se valida el PIN contra la réplica local como proponga
  `POS-AUTORIZACION-SUPERVISOR.md` y el servidor revalida al sincronizar.

### 2.11 Permisos y regla de la organización

- `pos.peso_manual` — «Pesar a mano en el POS».
- `pos.basculas.configurar` — «Configurar básculas y etiquetas de peso».
- Regla en `organization_settings` clave `pos_pesaje`: `{ "manual": "no" | "permiso" | "supervisor",
  "agregar_al_estabilizar": false, "peso_en_pantalla_cliente": true }`. Los permisos se resuelven en el
  servidor (regla 6 de `CLAUDE.md`), nunca por el nombre del rol.
- «Con supervisor» depende de la propuesta de autorización de supervisor (hoy `fn_pos_autorizar_descuento`
  está vacía). Mientras no exista, las opciones son «no» y «permiso».

---

## 3. Migraciones propuestas (no aplicadas)

Todas aditivas, con su reversión. Se aplican por el MCP y cada una deja su `.sql` en `supabase/migrations/` y
su reversión en `supabase/rollbacks/` en el mismo commit (`docs/POLITICA-MIGRACIONES.md`).

### M1 · Libra, unidad DIAN y conversiones

```sql
insert into public.units (code, name, conversion_factor, unit_type)
values ('LB', 'Libra', 1, 'weight') on conflict (code) do nothing;

insert into public.unit_conversions (from_unit_code, to_unit_code, factor, organization_id)
select v.de, v.a, v.f, null
from (values ('LB', 'KG', 0.45359237), ('KG', 'LB', 2.2046226218),
             ('LB', 'GR', 453.59237),  ('GR', 'LB', 0.0022046226)) v(de, a, f)
where not exists (select 1 from public.unit_conversions uc
                  where uc.organization_id is null
                    and btrim(uc.from_unit_code) = v.de and btrim(uc.to_unit_code) = v.a);

alter table public.units add column if not exists dian_unit_measure_id integer
  references public.dian_unit_measures(id);
update public.units set dian_unit_measure_id = case btrim(code)
  when 'UN' then 70 when 'KG' then 71 when 'LT' then 72 when 'MT' then 73 end
where btrim(code) in ('UN', 'KG', 'LT', 'MT');
-- LB, GR, ML, CM: se agregan a dian_unit_measures cuando se confirme el código de Factus (pregunta 8).
```

Reversión: `alter table public.units drop column dian_unit_measure_id;` y borrar las 4 conversiones y la unidad
LB **solo si** ningún producto la usa (`not exists (select 1 from products where unit_code = 'LB')`).

### M2 · Producto por peso o por medida

```sql
alter table public.products
  add column if not exists sale_mode text not null default 'unit',
  add column if not exists qty_decimals smallint not null default 0,
  add column if not exists price_ref_qty numeric(12,3),
  add column if not exists price_ref_unit_code character(4) references public.units(code),
  add column if not exists min_sale_qty numeric(12,3),
  add column if not exists default_tare_qty numeric(12,3),
  add column if not exists tare_required boolean not null default false,
  add column if not exists require_scale boolean not null default false,
  add column if not exists scale_plu integer;

alter table public.products
  add constraint products_sale_mode_check check (sale_mode in ('unit', 'weight', 'measure')),
  add constraint products_qty_decimals_check
    check (qty_decimals between 0 and 3 and (sale_mode <> 'unit' or qty_decimals = 0)),
  add constraint products_peso_valores_check check (
    (min_sale_qty is null or min_sale_qty > 0)
    and (default_tare_qty is null or default_tare_qty >= 0)
    and (price_ref_qty is null or price_ref_qty > 0)
    and (scale_plu is null or scale_plu between 1 and 99999));

create unique index if not exists products_org_scale_plu_uq
  on public.products (organization_id, scale_plu) where scale_plu is not null;

comment on column public.products.sale_mode is
  'Cómo se vende: unit (entero), weight (kg/lb con báscula), measure (metro/litro con decimales).';
comment on column public.products.price_ref_qty is
  'Presentación del precio («cada 100 g»). El precio en product_prices es siempre por unit_code.';
```

70.315 filas con `DEFAULT` constante: Postgres 15 no reescribe la tabla. Reversión: `drop index`,
`drop constraint` y `drop column` de las 9 columnas (antes de que haya productos por peso; después, exportar).

### M3 · Formato de etiqueta de peso variable

```sql
alter table public.organization_barcode_settings
  add column if not exists weight_label_enabled boolean not null default false,
  add column if not exists weight_label_prefixes text[] not null default '{}',
  add column if not exists weight_label_content text not null default 'weight',
  add column if not exists weight_label_plu_digits smallint not null default 5,
  add column if not exists weight_label_value_digits smallint not null default 5,
  add column if not exists weight_label_value_check boolean not null default false;

alter table public.organization_barcode_settings
  add constraint obs_weight_label_check check (
    weight_label_content in ('weight', 'price')
    and weight_label_plu_digits between 4 and 6
    and weight_label_value_digits between 4 and 6
    and 2 + weight_label_plu_digits + weight_label_value_digits
        + case when weight_label_value_check then 1 else 0 end = 12
    and weight_label_prefixes <@ array['21','22','23','24','25','26','27','28','29']::text[]);
```

Solo hay 7 filas: la configuración se guarda con una RPC `codigos_barras_configurar_peso` (upsert, permiso
`pos.basculas.configurar`) que además rechaza un prefijo igual al del generador. Reversión: `drop constraint`
y `drop column` de las 6.

### M4 · Básculas

```sql
create table if not exists public.pos_scales (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer not null references public.branches(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  transport text not null check (transport in ('desktop_serial', 'web_serial', 'desktop_tcp', 'bluetooth_le')),
  protocol text not null check (protocol in ('continuous_st_gs', 'toledo_8217', 'mettler_sics', 'cas_pd2', 'dibal', 'custom_regex')),
  custom_pattern text,
  device_hint text,
  print_agent_id uuid references public.print_agents(id) on delete set null,
  pos_terminal_id uuid references public.pos_terminals(id) on delete set null,
  baud_rate integer not null default 9600 check (baud_rate in (1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200)),
  data_bits smallint not null default 8 check (data_bits in (7, 8)),
  parity text not null default 'none' check (parity in ('none', 'even', 'odd')),
  stop_bits smallint not null default 1 check (stop_bits in (1, 2)),
  unit_code character(4) not null default 'KG' references public.units(code),
  decimals smallint not null default 3 check (decimals between 0 and 4),
  capacity_max numeric(12,3) check (capacity_max is null or capacity_max > 0),
  min_division numeric(12,4) check (min_division is null or min_division > 0),
  stable_ms integer not null default 500 check (stable_ms between 0 and 5000),
  is_active boolean not null default true,
  last_test_at timestamptz,
  last_test_ok boolean,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pos_scales_org_branch_idx on public.pos_scales (organization_id, branch_id);

alter table public.pos_scales enable row level security;
create policy pos_scales_select on public.pos_scales for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                             where om.user_id = (select auth.uid()) and om.is_active));
-- Sin políticas de escritura: se escribe solo por RPC SECURITY DEFINER (pos_basculas_guardar /
-- pos_basculas_archivar) que valida pertenencia, sucursal y pos.basculas.configurar.
revoke all on public.pos_scales from anon;
```

Reversión: `drop table public.pos_scales;` (y las dos RPC).

### M5 · Permisos y regla

```sql
insert into public.permissions (code, name, module, category, description)
values ('pos.peso_manual', 'Pesar a mano en el POS', 'pos', 'pos', 'Escribir el peso sin báscula'),
       ('pos.basculas.configurar', 'Configurar básculas', 'pos', 'configuracion', 'Básculas y etiquetas de peso')
on conflict do nothing;
```

La regla `pos_pesaje` es una fila de `organization_settings` (sin DDL); por defecto, si no existe:
`manual = 'permiso'`. Reversión: borrar los dos códigos y sus `role_permissions`.

### M6 · Funciones que se tocan (patrón `pg_get_functiondef` + `replace` + `execute`, como
`20260925140300_pos_mesa_cobra_con_pos_checkout.sql`)

| Función | Cambio |
|---|---|
| `fn_pos_validar_linea_venta` | Lee `sale_mode, qty_decimals, min_sale_qty, require_scale` del producto; si no es `unit`: `scale(qty) <= qty_decimals`, mínimo, reglas de `notes.pesaje` (manual, exige báscula, autorizado). Productos `unit`: sin cambios. Opción A de redondeo: `round(qty × precio, decimales_moneda)` solo aquí |
| `pos_checkout_v1` | En el `insert into invoice_items` agrega `unit_measure_id = coalesce(u.dian_unit_measure_id, 70)` desde la unidad del producto |
| `fn_producto_guardar` | Acepta y valida `sale_mode`, `qty_decimals`, `price_ref_*`, `min_sale_qty`, `default_tare_qty`, `tare_required`, `require_scale`, `scale_plu` (PLU único → error `plu_duplicado`) |
| `codigos_barras_reservar` / `_generar_faltantes` | Rechazan un prefijo que esté en `weight_label_prefixes` |
| `procesar_devolucion` | Sin cambio de lógica (ya decimal); solo el cliente |
| Nuevas | `pos_basculas_guardar`, `pos_basculas_archivar`, `pos_basculas_registrar_prueba`, `codigos_barras_configurar_peso`, `fn_productos_exportar_plu` |

Cada `.sql` de función guarda la definición anterior en su reversión (`pg_get_functiondef` antes del cambio).

---

## 4. Contrato del puente del Desktop (propuesto)

Se agrega un subsistema `scale` a `GoAdminDesktopBridge` (`src/lib/utils/desktop.ts`), opcional como todos,
con `desktopSupports` para versiones viejas del `.exe`:

```ts
export interface DesktopSerialPortInfo {
  path: string;            // 'COM3'
  manufacturer?: string;   // 'Prolific'
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
}

export interface DesktopScaleOpenConfig {
  scaleId: string;         // pos_scales.id
  path: string;
  baudRate: number;
  dataBits: 7 | 8;
  parity: 'none' | 'even' | 'odd';
  stopBits: 1 | 2;
}

export interface DesktopScaleState {
  scaleId: string | null;
  status: 'closed' | 'opening' | 'open' | 'error';
  error?: 'port_not_found' | 'port_busy' | 'permission' | 'io';
  bytesPerSecond?: number;
}

export interface DesktopScaleBridge {
  listPorts(): Promise<DesktopSerialPortInfo[]>;
  open(config: DesktopScaleOpenConfig): Promise<DesktopScaleState>;
  close(): Promise<DesktopScaleState>;
  status(): Promise<DesktopScaleState>;
  /** Comandos de protocolos por petición (Toledo 'W', SICS 'S', CAS ENQ…). */
  write(bytes: Uint8Array): Promise<void>;
  /** Bytes crudos; el intérprete vive en la web. Devuelve la baja. */
  onData(handler: (chunk: Uint8Array) => void): () => void;
  onState(handler: (state: DesktopScaleState) => void): () => void;
}
// GoAdminDesktopBridge: scale?: DesktopScaleBridge
```

Canales IPC: `scale:list-ports`, `scale:open`, `scale:close`, `scale:status`, `scale:write` (invoke) y
`scale:data`, `scale:state` (eventos por `subscribe`). Seguridad: el proceso principal atiende solo a la
ventana interna (`isInternalUrl`), abre un único puerto por equipo, cierra al cerrar la ventana del POS y
limita `write` a 64 bytes. Nada de esto pasa por el servidor local `:3456`.

En la web, un adaptador común:

```ts
interface TransporteBascula {
  abrir(cfg: ConfigBascula): Promise<void>;
  cerrar(): Promise<void>;
  escribir(bytes: Uint8Array): Promise<void>;
  alRecibir(cb: (chunk: Uint8Array) => void): () => void;
}
// transporteDesktop (bridge.scale), transporteWebSerial (navigator.serial), transporteManual (sin bytes)
// interpretarTrama(protocolo, buffer) → { neto, bruto, tara, unidad, estable, estado } | null
```

---

## 5. Plan de implementación por fases

| Fase | Contenido | Pruebas |
|---|---|---|
| F0 · Caracterización | Tests que fijan hoy: validador de línea, `pos_checkout_v1` con cantidad decimal (dry-run con `DO` + `RAISE`), tiquete, Factus `mapearLinea`, devolución proporcional | Jest + SQL dry-run; `npm run test:tz-all` sin cambios |
| F1 · Corregir lo roto | Factus con 3 decimales y unidad correcta; `unit_measure_id` desde la unidad; redondear cantidad a 3 decimales en el cliente; kardex con 3 decimales | Unitarios de `mapearLinea`, `formatoCantidad`; guardarraíl: prohibido `toFixed(2)` sobre cantidades |
| F2 · Producto y POS sin hardware | M1, M2, M5 y `fn_producto_guardar`; formulario «Cómo se vende»; «Actualizar precio» por kg; «Pesar» con peso a mano y «Por medida»; carrito (sin fusión, chip, cambiar peso); checkout con `notes.pesaje`; validador; tiquete, factura y devoluciones; mesas; pantalla del cliente; réplica offline; 4 idiomas | Unitarios de cálculo y redondeo (propiedades: `round(qty,3)`, total, descuento), validador en SQL, e2e de venta por peso offline y reproducción del outbox |
| F3 · Básculas | M4; intérprete de protocolos con tramas grabadas; transporte Web Serial; puente `scale:*` en el Desktop con `serialport`; Configuración › POS › Básculas; prueba de lectura | Tramas reales de cada protocolo como fixtures; pruebas del Desktop en Windows limpio con adaptador USB-serie; instalador firmado |
| F4 · Etiquetas | M3; decodificador; lectura en el POS (lector y cámara); PLU en el formulario; exportar PLU; etiqueta «peso-variable» desde Go Admin | Decodificador con los 2 formatos, dígitos malos, prefijo 20, código exacto primero |
| F5 · Operación | Reporte de pesos manuales y etiquetas desactualizadas; BLE en tableta; sincronización directa por marca de balanza | Según marca |

F2 ya sirve sin báscula (peso a mano, metros y litros); F3 y F4 son independientes entre sí.

---

## 6. Figma

### 6.1 Dónde verlo

| Página | Sección | Id | Enlace |
|---|---|---|---|
| 04 Inventario | «Productos por peso y báscula (propuesta)» (x = 88.000, y = 0) | `1087:705206` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1087-705206 |
| 05 POS y ventas | «Productos por peso y báscula (propuesta)» (x = 0, y = 172.200) | `1089:149558` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1089-149558 |
| 09 Documentos | «Productos por peso y báscula — tiquete, factura y etiqueta (propuesta)» (x = 0, y = 27.000) | `1092:7628` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1092-7628 |
| 02 Componentes | «Productos por peso y báscula (Nuevo · propuesta)» (x = 92.000, y = 0) | `1078:703030` | https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1078-703030 |

Enlazadas en los índices: 04 Inventario `264:98919` (entrada 16), 05 POS y ventas `460:241391` (entrada 27) y
09 Documentos `405:19` (entrada 16), cada una con hipervínculo a su sección. Los subtítulos de cada sección
apuntan a las otras tres.

### 6.2 Componentes

| Componente | Id | Qué se hizo | Dónde se usa |
|---|---|---|---|
| `LecturaBascula` (Nuevo) | set `1078:702560` | Estado = estable `1078:702458` · inestable `1078:702474` · manual `1078:702490` (NumberInput con sufijo kg) · error `1078:702512` · fuera-de-rango `1078:702528` · conectando `1078:702544` | Dentro de `DialogoPesar`; K2, K3, K4 |
| `DialogoPesar` (Nuevo) | set `1078:702729` | Layout = escritorio `1078:702561` (520) · hoja `1078:702642` (390) | Q2–Q7, Q9, Q11, Q13 |
| `FilaBascula` (Nuevo) | set `1078:702805` | Estado = conectada · sin-conexion · sin-probar | K1 |
| `ProductCard` (existente `115:5080`) | variante nueva `1078:702806` | «Variant=pos, Size=md, State=por-peso»: insignia «Por kg», «/ kg» junto al precio, stock en kg, botón «Pesar». Las 10 variantes anteriores no se tocaron | Grilla del POS (Q1–Q9), vista previa del formulario (P1, P3) |
| `ProductCardMovil` (existente `270:9913`) | variante nueva `1078:702858` | «Variant=tarjeta, State=por-peso». El set pasó de 1.284 a 1.368 px de ancho para no crecer en alto | Q10, Q11, Q13 |
| `CartLine` (kit implementado `241:9682`) | variantes nuevas `1088:174139` (desktop) · `1088:174209` (mobile) | «State=por-peso»: chip «⚖ 2,500 kg» en lugar de − 1 +, «× $ 18.000 / kg». Para no solapar, los 8 nodos de la sección «POS v2» que estaban debajo bajaron 134 px (CheckoutAccordion, CobrarButton, ProductCardMovil, DensidadSelector y sus etiquetas) y la sección creció lo mismo | Carrito del POS (Q1–Q9, Q12) |
| `CartLine v3` (propuesta `846:87947`) | variantes nuevas `1078:702891` · `1078:702963` | «State=por-peso,Layout=desktop/mobile», para cuando se apruebe la v3; la sección «POS — Carrito: líneas y notas» creció en alto | Vista previa del formulario (P1, P3) |
| `Doc/Etiqueta de producto` (existente `511:251419`) | variante nueva `1092:8047` | «Formato=63×34 mm, Precio=peso-variable»: nombre, «0,735 kg × $ 18.900/kg», total y código 2x | D4 |

Reutilizados tal cual: `Sidebar`, `AppHeader`, `PageHeader`, `FormSection` (con su slot), `FormField`,
`NumberInput` (Affix = suffix «kg»; no necesitó variante), `SegmentedControl`, `Switch`, `Button`,
`IconButton`, `Badge`, `Toast`, `EmptyState`, `Skeleton`, `MobileHeader`, `Marca/Nuevo`, `Icon/Scale`,
`PosProductSearch`, `CobrarButton`, `Doc/Código de barras`, `Doc/QR DIAN`.

### 6.3 Frames

**04 Inventario** (`1087:705206`)

| Frame | Id |
|---|---|
| P1 · Nuevo producto — Precios y costos › Se vende por peso (vista previa en el POS incluida) | `1087:705209` |
| P2 · Nuevo producto — Códigos › PLU de balanza y etiqueta de peso | `1087:707723` |
| P3 · Nuevo producto — venta por peso con errores («cada 300 g», peso mínimo 0) | `1087:706469` |
| P4 · Detalle — Precios y costos de un producto por peso | `1087:708800` |
| P5 · Diálogo «Actualizar precio» por peso con vigencia programada | `1087:709348` |
| P5b · «Actualizar precio» sin permiso | `1087:709425` |
| P6 · Móvil 390 — Nuevo producto, paso 2 por peso | `1087:709448` |

**05 POS y ventas** (`1089:149558`)

| Frame | Id |
|---|---|
| Q1 · Escritorio — producto «por kg» en la grilla y línea pesada en el carrito | `1089:149561` |
| Q2 · Pesar — báscula conectada, estable | `1089:150593` |
| Q3 · Pesar — inestable (Agregar espera) | `1089:151645` |
| Q4 · Pesar sin báscula — peso a mano con permiso | `1089:152748` |
| Q5 · Pesar — báscula desconectada | `1089:153813` |
| Q6 · Peso a mano sin permiso — autorización de supervisor | `1089:154872` |
| Q7 · Cambiar el peso de una línea | `1089:155947` |
| Q8 · Etiqueta de peso variable leída con el escáner (éxito y PLU inexistente) | `1089:156987` |
| Q9 · Tableta 1024 — Pesar | `1089:157976` |
| Q10 · Móvil 390 — grilla con producto por kg | `1089:158139` |
| Q11 · Móvil 390 — Pesar en hoja, sin báscula | `1089:158411` |
| Q12 · Móvil 390 — carrito con línea por peso | `1089:158573` |
| Q13 · Móvil 390 — Pesar, báscula desconectada | `1089:158896` |
| K1 · Configuración › POS — tarjeta «Básculas» (listo: 3 básculas, regla de peso manual, etiquetas) | `1090:728550` |
| K1b · Básculas — vacío | `1090:728674` |
| K1c · Básculas — cargando | `1090:728712` |
| K1d · Básculas — error | `1090:728759` |
| K7 · Básculas — sin permiso | `1090:728791` |
| K2 · «Nueva báscula» — Go Admin Desktop (puerto, protocolo, prueba de lectura) | `1090:728827` |
| K3 · «Nueva báscula» — navegador con Web Serial | `1090:728990` |
| K4 · Probar lectura — trama no reconocida | `1090:729067` |
| K5 · «Etiquetas de peso variable» — formato de la organización | `1090:729118` |
| K8 · Móvil 390 — Configuración › POS › Básculas | `1090:729208` |

**09 Documentos** (`1092:7628`)

| Frame | Id |
|---|---|
| D1 · Tiquete 80 mm — venta con líneas por peso | `1092:7631` |
| D2 · Tiquete en texto plano (ESC/POS), regla de columnas | `1092:7986` |
| D3 · Factura carta — líneas con cantidad decimal y unidad | `1092:7997` |
| D4 · Etiqueta de producto «peso-variable» (muestra) | `1092:8095` |

Estados cubiertos: cargando (K1c, «conectando»), vacío (K1b), error (Q5, Q13, K1d, K4, P3), sin permiso (P5b,
K7, Q6), inestable (Q3), fuera de rango (componente), éxito (Q2, Q8).

### 6.4 Chequeo por script (use_figma, 2026-09-28)

| Comprobación | Resultado |
|---|---|
| Solapes entre nodos de primer nivel de cada sección nueva (04, 05, 09, 02) | **0** |
| Secciones nuevas contra el resto de su página | **0** |
| Secciones con componentes modificados (Productos y POS, POS v2, POS — Carrito: líneas y notas, Componentes — Etiquetas) | **0** |
| Nodos fuera de su sección | **0** |
| Instancias rotas (02: 145 · 04: 483 · 05: 2.304 · 09: 3) | **0** |
| Textos desbordados — 04 (496 textos), 09 (126), 02 (130) | 5 ayudas de campo al primer paso → **0** tras acortarlas |
| Textos desbordados — 05 (1.819 textos) | 2 ayudas acortadas → **0 nuevos**. Quedan 20 truncados con «…» **heredados** de los frames base aprobados (correo del cliente en la cabecera del carrito y «Zapatilla urbana Nova 42 · Talla 40 · Negro»), idénticos en `244:63910` |
| Nombres reales de organizaciones (contra los 37 nombres de negocio de `organizations`; se omitieron los de prueba, en textos y capas) | **0** |

### 6.5 Capturas

`docs/design/figma/79-peso-*.png` (27): `componentes`, `formulario-precios`, `formulario-codigos-plu`,
`formulario-errores`, `detalle-precios`, `actualizar-precio`, `movil-formulario`, `pos-grilla-carrito`,
`pos-pesar-estable`, `pos-pesar-inestable`, `pos-pesar-manual`, `pos-bascula-desconectada`,
`pos-supervisor`, `pos-cambiar-peso`, `pos-etiqueta-escaneada`, `pos-tableta`, `pos-movil-grilla`,
`pos-movil-pesar`, `pos-movil-carrito`, `pos-movil-error`, `config-basculas`, `config-vacio`,
`config-nueva-bascula-desktop`, `config-web-serial`, `config-trama-no-reconocida`,
`config-etiquetas-formato`, `documentos-tiquete-factura-etiqueta`. No se versionan (el commit lleva solo
este documento).

---

## 7. Preguntas para el dueño

| # | Pregunta | Recomendación |
|---|---|---|
| 1 | ¿Unidad de peso por defecto y libra? | kg por defecto; libra disponible por producto (no se mezclan en la misma línea) |
| 2 | ¿Cómo se escribe el precio por defecto: por kg o «cada 100 g»? | Por kg, con «cada 100/250/500/50 g» como opción del producto; se guarda siempre por kg |
| 3 | Redondeo: ¿la línea se redondea a pesos (A) o se guarda exacta y se redondea al mostrar y al cobrar (B)? | B: cuadra con la factura electrónica y no cambia la validación del servidor |
| 4 | ¿Se permite peso a mano y quién? | «Con permiso» (`pos.peso_manual`) por defecto; «con supervisor» cuando exista la autorización de supervisor; «exigir báscula» por producto para carnes o productos caros |
| 5 | Formato de etiqueta de balanza | Peso embebido, prefijo 27, PLU 5 dígitos, peso 5 dígitos en gramos. Nunca prefijo 20 (lo usa el generador en 744 productos) |
| 6 | ¿Qué básculas tienen o van a vender los clientes? | Empezar con continuo «ST,GS» y Toledo 8217 (los más comunes en Colombia); pedir una báscula real de cada tipo para grabar tramas antes de la fase 3 |
| 7 | ¿Agregar la línea sola al estabilizar el peso? | No por defecto (Enter confirma); opción por organización para filas rápidas |
| 8 | Factura electrónica: confirmar con Factus el código de unidad de kilogramo y libra | Hacerlo en la fase 1: hoy toda línea sale «Unidad» y la cantidad con 2 decimales |
| 9 | ¿Se vende también por medida (metros, litros) en esta misma entrega? | Sí: sale del mismo diseño, sin báscula |
| 10 | Presentación fija (bandeja 500 g a precio fijo) | Otro producto por unidad con receta de 0,5 kg del producto a granel, no un segundo precio |
| 11 | ¿Imprimir etiquetas de peso desde Go Admin (sin balanza etiquetadora)? | Sí, fase 4, con la variante «peso-variable» de la etiqueta |
| 12 | Devolución de producto por peso: ¿vuelve al inventario? | No por defecto (perecedero); casilla «reingresa» en la devolución |
| 13 | ¿Mostrar el peso en la pantalla del cliente? | Sí por defecto; es lo que exige la buena práctica metrológica de que el cliente vea la pesada (confirmar con la regulación de la SIC para balanzas comerciales) |

---

## 8. Estado de implementación — fases 1 y 2 (2026-09-29)

Aprobado por el dueño el 2026-09-29 con todas las recomendaciones de la sección 7 (kg por defecto y libra
por producto; precio por kg con «cada 100 g» como opción; importe exacto y redondeo solo al mostrar y al
cobrar; peso a mano solo con permiso y «exigir báscula» por producto; bandeja a precio fijo = otro producto
con receta; devoluciones por peso sin reingreso por defecto). Las fases 3 (básculas) y 4 (etiquetas) **no**
se tocaron.

### 8.1 Migraciones aplicadas (MCP, con su reversión en `supabase/rollbacks/`)

| Migración | Qué hace |
|---|---|
| `20260929120000_peso_f1_unidades_dian` | M1: unidad LB con sus conversiones (LB↔KG, LB↔GR), `dian_unit_measures` 80 = LBR, `units.dian_unit_measure_id` (UN 70, KG 71, LT 72, MT 73, LB 80) y trigger `trg_invoice_items_unidad_dian`: la línea de factura toma la unidad DIAN del producto cuando llega con el 70 por defecto. Cubre `pos_checkout_v1`, mesas, pedidos web y notas crédito sin tocar esas funciones |
| `20260929120100_peso_f2_producto_permisos_validacion` | M2 + M5 + M6: las 9 columnas de «Cómo se vende» en `products` (70.319 productos quedan `unit`), permisos `pos.peso_manual` y `pos.basculas.configurar` (Admin de organización y Manager), `fn_producto_decimales_cantidad`, `fn_pos_puede_pesar_a_mano`, `fn_pos_validar_pesaje` (llamada desde `fn_pos_validar_linea_venta`, parche sobre la definición viva) y `pos_pesaje_contexto(org)` para el POS |
| `20260929120200_peso_f2_producto_guardar_modo_venta` | `fn_producto_int_modo_venta` y un bloque en `fn_producto_guardar` (definición viva; se conservan recetas y membresías) |
| `20260929120300_peso_f2_devolucion_reingresa` | `procesar_devolucion`: decimales de la cantidad devuelta y casilla «Reingresa» para productos por peso |

`pos_checkout_v1` **no se modificó**: su contrato ya admitía la cantidad decimal y `notes` como objeto. La
decisión de redondeo (B) quedó en el cliente (ver 8.3). Tras aplicar se comprobó que los parches de hoy de
membresías y de la cuenta dividida siguen en las definiciones vivas.

### 8.2 Qué puede hacer ya el dueño

- En **Inventario › Productos › Nuevo / Editar › Precios y costos**: «Cómo se vende: Por unidad · Por peso ·
  Por medida». Por peso: kg o lb, precio escrito por kg o «cada 500/250/100/50 g» (se guarda por kg; la
  vista dice «Se guarda como $ 18.900 / kg»), venta mínima y «Exigir báscula». Por medida: metro o litro.
  Un producto por peso no lleva variantes (cada presentación es otro producto) ni puede ser servicio.
- En el **detalle del producto**: «Actualizar precio» en la referencia del producto con la vigencia de
  siempre; precio, costo e historial con «/ kg»; existencias, lotes y kardex del detalle con 3 decimales y
  la unidad («12,400 kg»).
- En el **POS**: la tarjeta dice «Por kg» y «/ kg», con stock en kg y botón «Pesar». Tocarla, buscarla o
  escanearla abre «Pesar» con el peso a mano («Sin báscula · peso a mano»), el cálculo en vivo
  «0,735 kg × $ 18.900 / kg» y «Agregar $ 13.892 · Enter». Sin el permiso «Pesar a mano en el POS» el
  diálogo lo dice y no agrega; un producto que exige báscula dice que en este equipo aún no se puede vender.
  Cada pesada es una línea; el chip «⚖ 0,735 kg» (o **P** con la línea enfocada — F2 ya era «Cliente»)
  reabre «Pesar» para cambiar el peso. Un producto por medida abre «Cantidad».
- **Cobro**: se cobra el total redondeado a la moneda ($ 13.892) y la venta guarda el exacto ($ 13.891,50).
  Si lo recibido queda por debajo del exacto por el redondeo ($ 9.185 de $ 9.185,40), el sobre registra el
  pago por el exacto: sin esto la venta, la factura y la cartera quedaban pendientes por $ 0,40 (medido con
  `pos_checkout_v1` en una transacción deshecha).
- **Tiquete 80 mm, texto plano, móvil y factura electrónica impresa**: «Queso campesino» y debajo
  «0,735 kg x $ 18.900/kg», importe a la derecha; resumen «2 líneas · 3 unidades · 0,735 kg»; comanda
  «0,500 kg Carne». **Factura carta**: columna «Unidad» (kg / und), «0,735» y «2,500».
- **Factura electrónica (Factus)**: cantidad con 3 decimales («0.735», antes «0.74») y la unidad del
  producto (KGM) en vez de «94 Unidad».
- **Devoluciones**: cantidad decimal (antes `parseInt`: 0,375 → 0) y casilla «Reingresa al inventario» en
  productos por peso (por defecto no reingresan).
- **Sin conexión**: la réplica del catálogo trae las columnas de «Cómo se vende»; el permiso de peso a mano
  se guarda en el navegador y el servidor lo revalida al sincronizar.

### 8.3 Verificación

- SQL en transacciones deshechas (organizaciones 142 y 144): venta de 0,735 kg (pagada, `invoice_items.qty`
  0,735 con unidad 71, stock 5 → 4,265, `notes.pesaje` guardado); reintento del mismo sobre
  (`replayed`, un solo pago, una sola línea); 0,7354 kg → `cantidad_decimales`; «exige báscula» a mano →
  `peso_exige_bascula`; origen «bascula» → `origen_peso_no_disponible`; empleado sin permiso →
  `sin_permiso_peso_manual` (`pos_pesaje_contexto`: false para el empleado, true para el dueño);
  devolución de 0,375 kg sin reingreso (reintegro $ 7.087,50, stock igual) y de 0,2 kg con «Reingresa»
  (stock 4,465); 0,0005 kg → `cantidad_decimales`; más de lo vendido → `cantidad_excede_disponible`; nota
  crédito con `qty` −0,375 y unidad 71. `fn_producto_guardar`: por peso con «cada 100 g» guarda el precio
  18.900 por kg; «cada 300 g» → `referencia_precio_invalida`; unidad UN → `unidad_peso_invalida`.
- Jest (`TZ=UTC` y `TZ=America/Bogota`): `src/__tests__/pos/peso/` (lógica, impresión, documentos, venta y
  devolución), `src/__tests__/einvoicing/payloadsFactus.test.ts`, suites del POS y `pos-display`.
- `get_advisors`: el único aviso nuevo es el de siempre para una RPC `SECURITY DEFINER` ejecutable por
  `authenticated` (`pos_pesaje_contexto`, con `fn_assert_acceso_org`); ninguna función nueva queda para `anon`.

### 8.4 Datos afectados

- Ningún producto cambió: los 70.319 quedan `sale_mode = 'unit'`. Las facturas **nuevas** de productos en
  KG, LB, LT o MT salen con su unidad DIAN (hoy 0 productos en KG y 3 en LT); las líneas existentes no se
  tocaron.

### 8.5 Pendientes

- **Verificación con Factus (pregunta 7)**: que la API v2 acepte `KGM` y `LBR` en `unit_measure_code`. El
  mapa vive en un solo lugar configurable, `dian_unit_measures.code` (y `units.dian_unit_measure_id`); si
  Factus pide otro código se corrige la fila, sin tocar código.
- **No incluidos en esta entrega** (siguen la sección 2): «Pesar» en `AddProductDialog` de mesas y la unidad
  en sus comandas; pantalla del cliente «Pesando…» y el NaN de `projection.ts`; reporte de pesos manuales;
  «Lleve X pague Y» excluyendo productos por peso (`promotionEngine`); unidad y decimales en las páginas
  generales de Stock y Kardex, que la sesión B1 del núcleo reescribió hoy.
- **Fase 3**: `pos_scales`, intérprete de protocolos, Web Serial y puente `scale:*` del Desktop; al llegar,
  `fn_pos_validar_pesaje` debe aceptar el origen `bascula` con `bascula_id` válido.
- **Fase 4**: formato de etiqueta (prefijo 27), `decodificarEtiquetaPeso`, PLU en el formulario, exportar PLU
  y la etiqueta «peso-variable»; `fn_pos_validar_pesaje` debe aceptar el origen `etiqueta`. El lector ya
  busca primero el código exacto (y, si no viene en la primera página, en una más amplia).

## 9. Finanzas e inventario con peso (2026-09-29)

Los productos por peso o medida (`sale_mode` `weight`/`measure`, `qty_decimals`, `unit_code`) funcionan de
punta a punta fuera del POS: factura de venta, factura de compra, orden de compra y su recepción, PDF,
recetas y ajustes de inventario. Los módulos del POS, básculas, etiquetas y `electron/` no se tocaron.

### 9.1 Regla única: cada línea lleva sus decimales y su unidad

- `src/lib/services/documentos/cantidadLinea.ts` adapta `modoVenta.ts` (espejo de
  `fn_producto_decimales_cantidad`) a la línea de un documento, sin reglas nuevas:
  `cantidadLineaDeProducto` (kg y 3 decimales, m/L y 2; por unidad **sin regla**, la línea se comporta como
  antes), `cantidadInicialLinea`, `redondearCantidadLinea`, `sumaCantidades` y `COLUMNAS_CANTIDAD_PRODUCTO`
  para los `select`. Lo usan los formularios, los lectores de detalle, el PDF (`lineaDeItem`, que antes lo
  hacía en línea) y la cotización.
- Kit `DocumentoLineas`: `LineaDocumento.decimalesCantidad` (nuevo) y `unidad`. La cantidad de una línea
  por kg admite 0,735 aunque las demás sean enteras (antes `decimalesCantidad(lineas)` deducía los
  decimales de los VALORES: una línea nueva valía 1 y no se podía escribir 0,735), el campo muestra «kg»
  y el precio «/ kg» (sufijo en edición, «$ 18.900 / kg» en lectura y en tarjetas). Las líneas sin regla
  (ítems manuales, productos por unidad) siguen deduciendo sus decimales de sus propios valores, así que
  una línea por kg ya no obliga a mostrar «2,000» en las demás; nunca se muestran menos decimales que los
  del valor guardado. Recepción: pedida, pendiente y «Recibida» con la unidad y sus decimales.
- «Agregar productos» (`buscarProductosDocumento`, `productosPorId`): trae `sale_mode`, `qty_decimals` y
  `unit_code`; el diálogo dice «Por kg», el precio o costo «/ kg» y el stock «12,400 kg».

**Cantidad inicial (decisión).** Un producto por unidad nace con 1 (o el mínimo del proveedor en la orden
de compra), como siempre. Uno por peso o medida nace **vacío (0)** con el ejemplo «0,000» y la unidad en el
campo, o con el mínimo del proveedor redondeado a sus decimales si lo hay: «1 kg» por defecto no es una
cantidad real y se colaría en facturas y órdenes sin que nadie lo pesara. Guardar exige cantidad mayor que
0: la factura de venta y la de compra ya lo validaban; la orden de compra (nueva y edición) ahora avisa
«Falta la cantidad · Escribe la cantidad de «…»».

### 9.2 Pantallas

- **Factura de venta** (`FormularioFacturaVenta`, detalle y vista no editable): la línea toma unidad y
  decimales del producto al agregarla y al cargar un borrador, un duplicado o una oportunidad; `lineaAItem`
  redondea la cantidad a los decimales del producto y calcula `total_line` con esa cantidad (0,735 ×
  18.900 = 13.891,50 exacto, decisión B de §2.5). Faltantes y «Ajustar y emitir» pasan de 2 a 3 decimales
  (antes 1 kg pedido con 0,735 disponible quedaba en 0,73).
- **Factura de compra** (formulario, desde una orden, edición y detalle): igual; `qty` redondeada al guardar.
- **Orden de compra**: nueva y edición con la cantidad por línea, validación de cantidad y total de
  unidades sin ruido binario; el detalle muestra «1,250 kg» y la recepción acepta 0,500 de 1,250 kg con el
  paso del producto (`fn_oc_recepcionar` ya redondeaba a 3 y solo exige enteros con seriales).
- **PDF/impresión**: ya pintaba «0,735 kg», la columna Unidad y «/ kg» (fase 1); ahora con el helper único
  y también en la cotización (su `select` no traía el modo de venta). La orden de compra no tiene PDF.
- **Recetas**: nada que corregir en la base (ver 9.4); el costo por unidad del insumo dice «$ 24.000 / kg»
  en vez de «/ KG». La cantidad ya admitía 4 decimales y las unidades compatibles (GR con KG).
- **Ajustes de inventario**: decimales por producto (0 por unidad, 3 por peso, 2 por medida) con la unidad
  en el campo, en «Sistema», «Diferencia» y «Queda», y en el diálogo de productos. Se comprobó antes que
  ningún producto por unidad tiene existencias fraccionarias (0 de 55.556 filas de `stock_levels`, 0
  movimientos fraccionarios en 90 días), así que exigir enteros por unidad no rompe datos. Si la base no
  manda los decimales, 3 como antes.
- **Traslados**: no usan este editor y ya admitían 3 decimales (0 con seriales); no se tocaron.
- **Producción**: `fn_produccion_guardar` y `complete_production_order` ya validan con
  `fn_producto_decimales_cantidad`; sin cambios.

### 9.3 Migración aplicada (MCP, con su reversión)

| Migración | Qué hace |
|---|---|
| `20260929224000_peso_f5_ajuste_productos_decimales` | `fn_ajuste_productos` devuelve además `modo_venta` y `decimales_cantidad` (`fn_producto_decimales_cantidad`). Parche sobre la definición viva, un solo fragmento comprobado, marcador para no aplicarse dos veces. Probada antes en transacción deshecha (org 142: producto por kg → `{modo_venta: weight, decimales_cantidad: 3}`, por unidad → 0) y verificado que la reversión deja la definición idéntica |

No hizo falta tocar ninguna RPC de documentos: ninguna redondea ni castea la cantidad a entero.

### 9.4 Verificación en la base (transacciones deshechas, org 142)

- `fn_factura_venta_guardar` con 0,735 kg → `invoice_items.qty` 0,735, unidad DIAN 71 (trigger
  `trg_invoice_items_unidad_dian`), `total_line` 13.891,50; `fn_factura_venta_emitir` → emitida y stock
  5 → 4,265.
- `fn_factura_compra_guardar` con 2,5 kg → `qty` 2,500, unidad 71; `fn_factura_compra_confirmar` con
  recepción → stock 2,500.
- Orden de 1,25 kg: `fn_oc_recepcionar` 0,5 → `partial`, pendiente 0,75; 0,75 → `received`, factura de
  compra automática con `qty` 1,250 y unidad 71; stock final 3,750.
- Recetas: `fn_receta_costo` con 150 GR de un insumo en KG → cantidad 0,150 kg, costo $ 3.600 con
  promedio $ 24.000 / kg; un producto POR PESO con receta (1 kg de molida = 1 kg de trozo con 5 % de merma)
  se guarda con `fn_receta_guardar`, y `decrement_stock_with_recipe` de 0,735 kg descuenta 0,774 kg del
  insumo (10 → 9,226); un plato por unidad con 150 GR descuenta 0,300 kg por 2 platos.
- Columnas: `invoice_items.qty` y `quotation_items.qty` numeric(12,3); `purchase_order_items.quantity` y
  `received_quantity` numeric(12,4); `stock_levels.qty_on_hand` numeric(12,3).

Jest: `src/__tests__/finanzas/documentosPesoLineas.test.ts` (regla por línea, cantidad inicial, redondeo,
payload de venta, faltantes a 3 decimales, `lineaDeItem`, ajustes) y
`src/components/kit/__tests__/documentoLineasPeso.test.tsx` (lectura, edición y recepción en es, en, fr y
pt). Pasan también las suites existentes del kit, finanzas, documentos, inventario y
`src/__tests__/pos/peso/documentosPeso.test.ts`.

### 9.5 Pendientes

- **Validación en el servidor** de los decimales por producto en `fn_factura_venta_guardar` y
  `fn_fc_guardar_int` (hoy la pantalla redondea; una llamada directa con 0,7354 guardaría `qty` 0,735 con
  `total_line` calculado sobre 0,7354). Parche aditivo como el de `procesar_devolucion`, solo para `weight`
  y `measure`.
- **Detalle del ajuste** (`AjusteDetalle`) y listados de órdenes y facturas: la cantidad sin unidad.
- **Orden de compra**: el detalle y la recepción siguen con textos cableados en español (deuda anterior);
  «Unidades total» suma kg y unidades.
- **Cotizaciones**: el formulario no se revisó (solo su PDF).

---

## 12. Fase 4 — etiquetas de balanza (2026-09-29)

Con las decisiones del dueño (§7, pregunta 5): peso embebido, prefijo 27 recomendado, PLU de 5 dígitos y
peso de 5 dígitos en gramos; el 20 nunca, porque lo usa el generador interno. La etiqueta impresa desde Go
Admin (variante «peso-variable» de `Doc/Etiqueta de producto`) y la lectura con la cámara del POS móvil
**no** entran en esta entrega (ver 12.6).

### 12.1 Migraciones aplicadas (MCP, con su reversión en `supabase/rollbacks/`)

| Migración | Qué hace |
|---|---|
| `20260929230000_peso_f4_formato_etiqueta` | M3: 6 columnas `weight_label_*` en `organization_barcode_settings` (apagado, sin prefijos, peso, PLU 5, valor 5, sin dígito del valor) y `obs_weight_label_check`: contenido `weight`/`price`, dígitos 4–6, 2 + PLU + valor (+1) = 12, prefijos ⊂ 21–29 y activo ⇒ al menos un prefijo |
| `20260929230100_peso_f4_configurar_peso` | `fn_codigo_barras_choca_con_peso` (pura: ¿la numeración interna puede producir un código con ese prefijo? prefijo de 2+ dígitos, de 1 dígito o vacío) y la RPC `codigos_barras_configurar_peso(org, activo, prefijos, contenido, dígitos PLU, dígitos valor, dígito del valor)`: upsert, `pos.basculas.configurar` con `fn_tiene_permiso`, rechaza el prefijo del generador (`prefijo_del_generador`) y devuelve cuántos productos tienen un EAN-13 propio con ese prefijo y cuántos PLU no caben en los dígitos |
| `20260929230200_peso_f4_generador_sin_prefijo_peso` | `fn_codigos_barras_assert_sin_prefijo_peso` y parche de `codigos_barras_reservar` y `codigos_barras_generar_faltantes` sobre su definición viva (ancla `fn_assert_acceso_org`, exactamente una aparición): con etiquetas activas, el generador falla con `prefijo_de_peso` en vez de producir un código de peso |
| `20260929230300_peso_f4_plu_producto` | `fn_producto_int_plu` y dos reemplazos en `fn_producto_int_modo_venta` (definición viva): por peso o medida guarda `producto.scale_plu` si viene en el payload (1–99.999 → `plu_invalido`; otro producto con ese PLU → `plu_duplicado`); por unidad lo borra. `fn_producto_guardar` no se tocó: ya delega en esa función |
| `20260929230400_peso_f4_exportar_plu` | `fn_productos_exportar_plu(org)`: PLU, nombre, precio vigente por kg (`fn_pos_precio_base_vigente`), unidad, tara y días de vida, con `pos.basculas.configurar` |

`fn_pos_validar_pesaje` no se tocó aquí: la sesión de básculas lo parcheó para aceptar `origen = 'etiqueta'`
con `codigo_etiqueta` (verificado en la definición viva).

### 12.2 Código

- `src/lib/pos/etiquetaPeso.ts` (puro): `decodificarEtiquetaPeso(codigo, formato)` (EAN-13 con
  `esEan13Valido`/`digitoControlGs1` de `codigoBarras.ts`; dígito de control del valor GS1 de 4 y 5 dígitos),
  `lineaDesdeEtiqueta` (peso: valor ÷ 1000; precio: importe ÷ precio vigente redondeado a `qty_decimals`,
  aviso si el importe recalculado difiere; reutiliza `validarPesada` para decimales y mínimo),
  `formatoDesdeFila` y `csvExportarPlu`.
- **POS**: `ProductSearch` busca primero el código **exacto** (como antes); si no existe y encaja en el
  formato, busca el producto por PLU (`POSService.getProductByScalePlu`; sin conexión, índice local
  `by_org_scale_plu`, `catalogStore` versión 2, `scale_plu` replicado) y la página agrega la línea con
  `notes.pesaje { origen: 'etiqueta', neto, unidad, estable, codigo_etiqueta, leido_en[, importe_etiqueta] }`
  sin abrir «Pesar». Dígito malo, PLU inexistente, producto por unidad, sin precio o bajo el mínimo: toast y
  nada se agrega. El formato se lee de `organization_barcode_settings` (RLS de miembros) y se guarda en el
  navegador para leer etiquetas sin conexión (`useFormatoEtiquetaPeso`); no pasa por `pos_pesaje_contexto`.
- **Formulario del producto › Códigos**: «PLU de balanza» en productos por peso o medida; «PLU duplicado» del
  servidor cae en ese campo. Duplicar no copia el PLU.
- **Configuración › POS**: tarjeta «Etiquetas de peso variable» (K5): activar, prefijo, peso o precio,
  dígitos, dígito de control del valor, «Probar un código» (decodifica y busca el PLU), aviso en vivo de
  productos con código propio en ese prefijo, «Guardar formato» y «Exportar PLU» (CSV `;` con coma
  decimal y BOM: PLU; nombre; precio por kg; tara; días de vida). Sin el permiso, solo lectura.
- El generador de códigos traduce `prefijo_de_peso` (`inventarioEtiquetas.codigos.errores.prefijoDePeso`).
- i18n: `posPeso.etiqueta`, `posEtiquetasPeso`, `productoForm.codigos.plu*`, `productoForm.errores.plu_*`
  en es/en/fr/pt.

### 12.3 Verificación

- SQL en una transacción deshecha (organización 132, dueño con permiso y empleado sin él): guardar 27 →
  `productos_con_prefijo` 0; 20 → `prefijo_peso_invalido`; 5 + 6 → `formato_invalido`; activo sin prefijos
  → `prefijos_requeridos`; reservar con generador 20 y peso 27 → código 20…; generador 27 → reservar y
  generar faltantes fallan con `prefijo_de_peso` y configurar con `prefijo_del_generador`; generador «2» y
  peso 28 → `prefijo_del_generador`; empleado → `sin_permiso` (configurar y exportar); PLU 104 guardado,
  repetido en otro producto → `plu_duplicado`, 100000 → `plu_invalido`, sin la clave se conserva, por
  unidad se borra; exportar devuelve 1 fila con el precio vigente. Después de aplicar, lo mismo por
  `fn_producto_guardar` completo (guarda 104; el segundo producto → `plu_duplicado`). Las reversiones de
  los parches devuelven las definiciones con el mismo md5 que antes.
- Jest: `src/__tests__/pos/peso/etiquetaPeso.test.ts` (los 2 formatos, dígito EAN malo, dígito del valor
  malo, prefijo 20, PLU inexistente, producto por unidad, precio distinto con aviso, mínimo, libras, CSV),
  `etiquetaPesoOffline.test.ts` (índice local por PLU) y `pluFormulario.test.ts`; `ventaPeso.test.ts`
  actualizado (`camposModoVenta` incluye `scale_plu`). ESLint limpio en los archivos tocados.
- `get_advisors`: solo el aviso habitual de RPC `SECURITY DEFINER` ejecutable por `authenticated`
  (`codigos_barras_configurar_peso`, `fn_productos_exportar_plu`, con `fn_assert_acceso_org` y permiso);
  ninguna para `anon`.

### 12.4 Datos afectados

- Las 7 filas de `organization_barcode_settings` quedan con etiquetas **apagadas**: ninguna organización
  cambia hasta que active el formato. Ningún producto tiene PLU todavía.

### 12.5 Decisiones

- El PLU vive en el paso de «Cómo se vende» (`fn_producto_int_modo_venta`) y no en un bloque nuevo de
  `fn_producto_guardar`: un producto por unidad nunca debe tener PLU y así se garantiza en el mismo lugar.
- El precio impreso no manda (§2.3): con precio embebido la línea usa el precio vigente y se avisa.
- Una etiqueta sí vende un producto que «exige báscula» (el peso viene de una balanza, no a mano).
- La existencia no bloquea la etiqueta (igual que una pesada: el POS avisa, el checkout no bloquea).

### 12.6 Pendientes

- `products` no tiene vida útil: la columna «días de vida» del CSV sale vacía hasta que exista.
- `codigos_barras_configurar` (numeración interna) no rechaza todavía un prefijo de peso: el choque se
  detiene al generar (`prefijo_de_peso`) y al guardar el formato de etiquetas, no al cambiar la numeración.
- Etiqueta «peso-variable» impresa desde Go Admin, lectura con la cámara del POS móvil (hoy la cámara llena
  el buscador), etiquetas en mesas (`AddProductDialog`) y reporte de etiquetas desactualizadas (F5).


---

## 10. POS: mesas, pantalla del cliente, promociones y existencias (2026-09-29)

Cierra los pendientes del POS de §8.5 y §2.6 (mesas, pantalla del cliente, «Lleve X pague Y», unidades en
Stock/Movimientos/Kardex/Lotes y el reporte de pesos manuales de §2.9), más el pedido del dueño del mismo día:
«al marcar con código de barras, que el producto aparezca de una en el carrito», en mesas y en el POS.

### 10.1 Qué puede hacer ya el dueño

- **Mesas › Agregar productos**: tocar (o escanear) un producto por peso abre el mismo «Pesar» del POS
  (`DialogoPesar`, con la báscula de este equipo si la hay: lectura en vivo y Enter). Cada pesada es su
  propia línea (el carrito de la mesa ya no se indexa por producto: clave por línea en `cantidadMesa.ts`); la
  línea muestra el chip «⚖ 0,735 kg», que reabre «Pesar» para cambiar el peso, y no tiene ±1. La tarjeta dice
  «/ kg» y «Por kg», y su insignia suma las pesadas («1,235 kg»). La línea guarda `notes.pesaje` (origen
  manual, báscula o etiqueta), así que entra al reporte de pesos manuales.
- **Mesas › plato ya pedido** (`OrderItemCard`): «Cant: 0,735 kg» y «$ 18.900 / kg»; editar la cantidad
  acepta coma y los decimales del producto (antes `parseInt`).
- **Traslado de ítems**: «0,25» de 0,735 kg, con «Se transferirán 0,250 kg de 0,735 kg»; lo que queda en la
  mesa origen se redondea a 3 decimales (0,235 y no 0,23499…).
- **Cuenta dividida por ítems**: asignar 0,5 kg a un comensal y 0,235 al otro; las sumas usan los decimales
  de la línea (0,1 + 0,2 = 0,3). De paso: reasignar a la MISMA parte ya no descontaba su propia asignación
  anterior del disponible.
- **Comandas y cocina**: la comanda impresa (física o de navegador, y su reimpresión desde el KDS) dice
  «0,500 kg Carne» y el KDS muestra «0,500 kg». La unidad sale del producto de la línea de la venta
  (`sale_items → products`); las comandas del mostrador no tienen `sale_items` y siguen con el número
  («0,5x», ya con coma).
- **Lector de códigos en mesas** (nuevo; antes la mesa no escuchaba el lector) y **código escrito + Enter**
  en el buscador de la mesa y del POS (solo dígitos, 6 a 14): producto por unidad o variante exacta →
  directo a la mesa/carrito; etiqueta de balanza → directo con su peso (origen «etiqueta»); producto por peso
  con código normal → «Pesar» (en el POS, además, el flujo de un paso de la báscula, §11). Con «Pesar»
  abierto, otro código cancela la pesada pendiente (nunca la confirma) y el mismo se ignora
  (`decidirEscaneoConPesarAbierto`, la misma regla del POS). La cámara del POS también va directo al carrito
  (antes solo llenaba el buscador).
- **Pantalla del cliente**: mientras «Pesar» está abierto en la caja, «Pesando: 0,735 kg × $ 18.900 / kg =
  $ 13.892» (franja sobre el pedido o vista propia si el carrito está vacío), con los decimales de la moneda
  de la organización. Regla `organization_settings.pos_pesaje.peso_en_pantalla_cliente` (activa si no existe;
  solo `false` la apaga); nunca sale encima de un cobro, una propina o «Gracias». Una cantidad «1,5» ya no se
  proyecta como 0 (NaN).
- **Promociones**: «Lleve X pague Y» no aplica a productos por peso ni por medida (antes 2,5 kg contaban como
  «2» y regalaban kilos); porcentaje y monto fijo sí. El motor devuelve además el descuento por línea
  (`lineDiscounts`): con dos pesadas del mismo producto, cada línea lleva el suyo (antes cada una llevaba el
  de las dos). Si el llamador no manda `sale_mode` y hay un «Lleve X pague Y», el motor lo consulta.
- **Existencias › Stock, Movimientos, Kardex y Lotes**: un producto por peso o medida se lee «12,400 kg» (y
  «+0,735 kg» en entradas y salidas) en vez de «12,4 uds». En el kardex de un producto, también sus KPIs y el
  cuadre. Una lectura de `products` (con RLS) por página de resultados.
- **Reportes › POS › Pesos manuales** (`/app/pos/reportes/pesos-manuales`, enlace en Reportes POS): líneas
  con el peso escrito a mano por día (zona horaria de la organización) y cajero: líneas, peso por unidad,
  importe y cuántas tuvieron supervisor. Por defecto los últimos 7 días; sucursal del selector del encabezado.

### 10.2 Migraciones aplicadas (MCP, con su reversión en `supabase/rollbacks/`)

| Migración | Qué hace |
|---|---|
| `20260929225000_peso_pos_reporte_pesos_manuales` | RPC `pos_reporte_pesos_manuales(org, desde, hasta, sucursal)` `SECURITY DEFINER` con `fn_assert_acceso_org` y permiso resuelto en el servidor (dueño, `reports.sales` o `pos.basculas.configurar`); días de la organización con `fn_timezone_for`; excluye ventas anuladas; rango ≤ 367 días. `revoke` de `public` y `anon`. Índice parcial `idx_sale_items_pesaje_manual (sale_id) where notes->'pesaje'->>'origen' = 'manual'` |
| `20260929225100_peso_pos_pesaje_contexto_pantalla` | `pos_pesaje_contexto` devuelve `peso_en_pantalla_cliente` (parche sobre la definición viva, idempotente; falla si el ancla cambió) |

Probadas antes de aplicar en transacciones deshechas (organización 142): venta pagada con 2 líneas manuales
a las 23:30 hora de la organización (cuenta en su día, no en el UTC siguiente), una anulada (no cuenta) y una
sin `pesaje` (no cuenta) → 2 líneas, 1,235 kg, $ 23.341,50, 1 con supervisor; otro día → vacío; otra
sucursal → vacío; rango al revés → `rango_invalido`; empleado sin permiso → `sin_permiso_reporte_pesos`
(42501); dueño de otra organización → «Acceso denegado» (42501); `anon` sin `execute`. `pos_pesaje_contexto`:
sin fila → `true`; `false` → `false`; regla sin la clave → `true`; la reversión quita la clave. Nada quedó
escrito (verificado después).

### 10.3 Archivos compartidos que se tocaron (para los otros frentes)

- `src/components/pos/venta/peso/DialogoPesar.tsx`: solo la prop opcional `onCantidadEnVivo` y su efecto
  (la cantidad que se agregaría, para la pantalla del cliente); el frente de básculas ya la alimenta también
  con la lectura estable. La mesa usa el diálogo tal cual (con `bascula` del equipo).
- `src/components/pos/ProductSearch.tsx`: `handleHardwareScan` usa `resolverEscaneo`
  (`src/lib/pos/venta/escaneo.ts`, compartido con la mesa; misma secuencia de antes: código exacto, página
  amplia, etiqueta, `resolverCodigo`); la cámara y el código escrito + Enter pasan por ahí.
- `src/components/kit/SearchInput.tsx`: prop opcional `onEnter` (si devuelve `true`, no busca).
  `GrillaProductos`: prop opcional `onCodigo`.
- `src/lib/services/posService.ts`: manda `sale_mode` al motor de promociones y usa `lineDiscounts` solo en
  líneas por peso o medida (las demás, igual que antes).
- Impresión de comandas (`printJobsService`, `printService`): pasan `unit`/`qtyDecimals` que el agente ya
  sabía imprimir.

### 10.4 Verificación

- Jest (`TZ=UTC` y `TZ=America/Bogota`): `src/__tests__/pos/peso/mesasPantallaPeso.test.ts` (carrito de la
  mesa, decimales, traslado, cuenta dividida, comanda impresa, proyección «1,5», emisor con pesada, saneado,
  regla de pantalla, promociones, existencias, reporte, `resolverEscaneo` y `pareceCodigoDeBarras`) y
  `mesasPantallaPesoRender.test.tsx` (render con los textos reales: «Pesar» en la mesa con dos pesadas,
  código + Enter y etiqueta directo a la mesa, lector con «Pesar» abierto, traslado, tarjeta del plato,
  franja «Pesando…» en 4 idiomas, comanda del KDS y reporte en 4 idiomas); `productSearch.test.tsx` (código +
  Enter en el POS). Suites vecinas: `pos-display`, `pos`, `inventario`, guardarraíles (4.408 pruebas).
- `projection.test.ts` fijaba el comportamiento viejo («1,5» → 0): se actualizó a «1,5» → 1,5 con un texto
  ambiguo («1.500,5») que sigue dando 0.
- Revisión de tipos acotada a los archivos tocados (con sus dependencias): 0 errores. ESLint de los
  archivos tocados sin errores; quedan los avisos `exhaustive-deps` previos de `AddProductDialog`,
  `TransferItemDialog` y la exportación anónima de `kitchenService`. `posService.ts`, `printJobsService.ts` y
  `printService.ts` conservan sus errores `no-explicit-any` previos (las líneas nuevas no agregan ninguno).

### 10.5 No verificado / pendiente

- Nada se probó en un navegador real ni con una báscula o un lector físicos (el lector se simuló con la
  ráfaga de teclas). La pantalla del cliente con «Pesando…» no se vio en un segundo monitor.
- La mesa aún no tiene el flujo de UN paso con báscula estable (agregar al estabilizar, «Deshacer»): vive en
  `usePesarPos`, atado al carrito del POS. Para reutilizarlo sin duplicar, conviene que ese hook reciba un
  «agregar(producto, cantidad, pesaje)» en vez del `cartId`; mientras tanto la mesa usa la báscula dentro de
  «Pesar» con Enter.
- Comandas del mostrador en el KDS sin unidad (no hay `sale_items`): haría falta copiar la unidad en
  `kitchen_ticket_items` desde `pos_cocina_enviar_ronda`.
- Web y finanzas llaman al motor de promociones sin `sale_mode`: el motor lo consulta solo si hay un «Lleve X
  pague Y» elegible; no usan `lineDiscounts`.
- Líneas de mesa con origen «báscula» o «etiqueta»: la definición viva de `fn_pos_validar_pesaje` ya acepta
  esos orígenes (frentes de las fases 3 y 4; comprobado por MCP), pero no se cobró una mesa de punta a punta.

---

## 11. Fase 3 — básculas (2026-09-29)

Implementa §2.8, §2.9, §3 M4 y §4, más el pedido del dueño del mismo día: «mejorar por completo la
experiencia de venta por peso en el POS; al marcar con código de barras, que el producto aparezca de una en el
carrito» (11.4). Las etiquetas de balanza son de la fase 4 (§12); aquí solo se habilitó su origen en el
servidor.

### 11.1 Migraciones aplicadas (MCP, con su reversión en `supabase/rollbacks/`)

| Migración | Qué hace |
|---|---|
| `20260929220000_peso_f3_pos_scales` | M4: tabla `pos_scales` por sucursal (transporte `desktop_serial`/`web_serial`, TCP y BLE reservados; protocolo; parámetros del puerto y de la lectura; caja `pos_terminal_id` o equipo `print_agent_id`; última prueba). RLS de lectura para miembros activos; **sin políticas de escritura** (revocado `insert/update/delete` a `authenticated`, todo a `anon`). Nombre único por sucursal entre las activas |
| `20260929220100_peso_f3_pos_basculas_rpc` | RPC `SECURITY DEFINER` con `fn_assert_acceso_org` y revoke de `anon/public`: `pos_basculas_listar` (dice si la persona puede configurar; sin permiso devuelve la lista vacía), `pos_basculas_guardar`, `pos_basculas_archivar` (archivar/reactivar, nunca borra), `pos_basculas_registrar_prueba` y la lectura del POS `pos_basculas_para_pos(org, sucursal, caja, equipo)` (activas de la sucursal, primero las de esta caja o equipo). El permiso `pos.basculas.configurar` se resuelve en el servidor (`check_user_permission` o dueño). Errores estables: `sin_permiso`, `bascula_no_encontrada`, `sucursal_invalida`, `transporte_no_disponible`, `equipo_invalido`, `caja_invalida`, `unidad_invalida`, `nombre_duplicado`, `datos_invalidos` |
| `20260929220200_peso_f3_validar_pesaje_bascula_etiqueta` | `fn_pos_validar_pesaje` (definición viva, fragmento único): origen `bascula` exige `bascula_id` de una báscula **activa** de la organización, `estable = true` y, si viene, `neto` = cantidad (±0,0005); origen `etiqueta` exige `codigo_etiqueta` no vacío (≤ 64). Errores `bascula_invalida`, `peso_inestable`, `pesaje_no_coincide`, `etiqueta_invalida` (agregados a `erroresCobro.ts` y a los 4 idiomas). Ni báscula ni etiqueta pasan por la regla de peso manual. La reversión deja la definición **idéntica** (md5 comprobado) |
| `20260929220300_peso_f3_contexto_agregar_al_estabilizar` | `pos_pesaje_contexto` (definición viva, después del parche de pantalla del cliente) devuelve `agregar_al_estabilizar` (ver 11.4) |

Probadas antes de aplicar en transacciones deshechas (`DO … RAISE EXCEPTION`, organizaciones 142 y 144):
dueño crea/edita/prueba/archiva/reactiva; nombre duplicado, sucursal ajena, unidad UN, baudios 1234,
transporte BLE y texto en un número → su error; empleado sin permiso: `listar` sin filas y `guardar`/`archivar`
→ `sin_permiso`, pero `para_pos` sí lee; dueño de otra organización: `bascula_no_encontrada` y 0 filas por RLS;
`update` directo → `permission denied`. Validador: báscula activa OK (también en un producto que «exige
báscula»), archivada / de otra organización / id basura → `bascula_invalida`, `estable` falso o ausente →
`peso_inestable`, neto distinto → `pesaje_no_coincide`, 0,7354 → `cantidad_decimales`, etiqueta vacía →
`etiqueta_invalida`; manual y por unidad sin cambios. `get_advisors`: solo el aviso esperado de RPC
`SECURITY DEFINER` ejecutable por `authenticated`; ninguna para `anon`.

### 11.2 Código

- **Intérprete único** `src/lib/pos/bascula/` (puro): `interpretarTrama(protocolo, trama)` →
  `{ neto, bruto, tara, unidad, estable, estado, netoDeBascula }`; `DivisorTramas` (fin de línea, STX…CR,
  SOH…EOT, ACK suelto, desborde de 256 bytes); continuo ST,GS (ST/US/OL, GS/NT/TR), Mettler Toledo 8217
  (petición `W` cada 200 ms, byte de estado), Mettler SICS (petición `SI`, `S S`/`S D`/`S +`/`S -`/`S I`/`E*`),
  CAS PD-II (ENQ → ACK → DC1; el BCC no se verifica) y propio por expresión regular con grupos `peso`, `signo`,
  `estado`, `unidad`. **Dibal queda pendiente**: sin trama documentada y validada con un equipo; se puede
  guardar y la prueba muestra los bytes crudos, pero no se interpreta. `DetectorEstabilidad` (stable_ms con
  tolerancia de una división), `LectorBascula` (peticiones, DC1, «sin lectura 3 s», cero por comando —Toledo
  `Z`, SICS `Z`— o en el POS), `vistaLectura` (conversión kg/lb/g, tara del POS salvo `NT`, bajo cero,
  sobrecarga por bandera o capacidad, mínimo, tara obligatoria) y `pesajeBascula` para `notes.pesaje`.
- **Transportes** (`transportes.ts`, adaptador común de §4): `transporteDesktop` (`bridge.scale`),
  `transporteWebSerial` (`requestPort` con gesto, `getPorts()` y pista `usb:vid:pid`), `transporteManual`.
  Dentro del Desktop nunca se usa Web Serial (`setDevicePermissionHandler` no cambió).
- **Desktop** `electron/src/main/scale/`: `serialport@13` (N-API con prebuilds, `win32-x64` incluido) detrás de
  un `require` dinámico (`serialLoader.ts`): si el binario no carga, el Desktop arranca igual y la báscula
  responde `unavailable` con un mensaje claro. `scaleManager.ts`: un puerto por equipo, bytes **solo** al
  webContents que abrió, cierre al destruirse o recargar esa ventana, `write` ≤ 64 bytes y solo del dueño,
  bytes/s, la última báscula en `DesktopConfig.scale`. `scaleIpc.ts`: `scale:list-ports|open|close|status|write`
  con verificación de origen `isInternalUrl` en cada llamada; eventos `scale:data`/`scale:state`. Preload
  expone `scale`; `electron-builder.yml` desempaqueta `node_modules/@serialport/bindings-cpp/**`. En la web,
  `desktop.ts` tipa `DesktopScaleBridge`, `desktopScaleBridge()` y `desktopSupports('scale')`.
- **Configuración › POS › «Básculas»** (`src/components/pos/configuracion/basculas/`, kit: `Tarjeta`,
  `EmptyState`, `StatusBadge`, `Dialogo`, `FormField`, `SegmentedControl`, `CampoNumero`): K1 lista con
  «Probada / Falló la prueba / Sin probar / Archivada» y «En este equipo», K1b vacío, K1c cargando, K1d error,
  K7 sin permiso, K2 Desktop (lista de puertos del equipo), K3 Web Serial (elegir puerto; aviso en
  Safari/Firefox/móvil y dentro del Desktop), K4 «Probar lectura» con bytes crudos (texto y hexadecimal) y
  «Usar ‹protocolo›» sugerido. «Usar en este equipo» guarda la elección en el navegador. El resultado de la
  prueba se registra al guardar. Montada junto a Impresoras.
- **«Pesar»** (`DialogoPesar` + `LecturaBascula` + `usePesadaBascula`): estados conectando / estable /
  inestable / fuera de rango / error / manual; Cero (Z), Tara (T) / Quitar tara, tara del producto, «Peso a mano»
  (M) solo con permiso y si el producto no exige báscula, «Conectar báscula» (Web Serial) y «Reintentar».
  Agregar solo con lectura estable; la línea lleva `notes.pesaje` `{origen:'bascula', bruto, tara, neto,
  unidad, estable:true, bascula_id, leido_en}`. **Sin báscula el diálogo es el de la fase 2** (probado).

### 11.3 Cómo probar con una báscula real

1. Configuración › POS › Básculas › «Nueva báscula»: en Go Admin Desktop elegir «Go Admin Desktop» y el
   puerto (COM3…); en Chrome/Edge sin Desktop, «Navegador (Web Serial)» y «Elegir puerto». Baudios, bits,
   paridad y parada del manual del indicador (típico 9600 8N1). Unidad kg, decimales 3, capacidad y división
   de la placa.
2. «Probar lectura» con algo encima. Si dice «Llegan datos, pero no se reconocen», mirar los bytes crudos:
   la sugerencia ofrece el protocolo que sí los entiende. Si no llegan bytes: cable (serie cruzado / USB-serie),
   puerto y baudios; con protocolos por petición (Toledo, SICS, CAS) la báscula debe estar en modo petición.
3. Guardar, «Usar en este equipo» y en el POS tocar o escanear un producto por peso.
4. **Grabar fixtures**: copiar el texto hexadecimal de la prueba a
   `src/lib/pos/bascula/__tests__/fixtures/tramas.ts` con el modelo en el nombre (hoy las tramas son de la
   documentación de cada fabricante, no grabadas) y correr `npx jest src/lib/pos/bascula`.
5. Desktop: `cd electron && npm ci && npm run package` e instalar el NSIS en un Windows limpio con un
   adaptador USB-serie (Prolific/CH340/FTDI); abrir el POS y ver «Estable». Aquí (Linux, sin Electron) solo se
   comprobó que el binario N-API carga en Node; no se armó el instalador.

### 11.4 Venta por peso en un paso (pedido del dueño)

Decisiones puras en `src/lib/pos/bascula/flujoPesada.ts` (probadas) y ejecutadas por `usePesarPos`:

- **El lector del equipo queda abierto mientras la caja está en pantalla** (no solo con «Pesar» abierto): así
  se conoce la lectura en el instante del escaneo. Sin báscula configurada no se abre nada.
- `decidirPesada`: con báscula y la regla `agregar_al_estabilizar` (**activa por defecto**; solo un `false`
  explícito en `organization_settings` `pos_pesaje` la apaga, migración 220300): lectura estable, válida (neto >
  0, ≥ mínimo, ≤ capacidad, con tara si la exige) y **nueva** → directo al carrito sin diálogo; si no, «Pesar»
  abre con «Esperando peso estable… se agrega solo · Esc cancela» y agrega en cuanto se estabiliza (una vez).
  Regla apagada → «Pesar» con Enter. Sin báscula o por medida → el flujo de siempre. La §7 pregunta 7
  recomendaba «no» por defecto; el pedido del dueño lo cambia, y sin báscula la regla no aplica.
- **Lectura nueva** (`ArmadoBascula`): tras agregar, la siguiente pesada automática exige que la báscula cambie
  más de una división (se retiró el producto o se puso otro). Sin esto, escanear el jamón con el queso aún
  encima lo agregaba con el peso del queso. En ese caso «Pesar» dice «La báscula aún tiene la pesada
  anterior». Enter a mano (confirmación explícita) no lo exige.
- **Escaneo con «Pesar» abierto**: antes se descartaba («cierra el diálogo»). Ahora «Pesar» lleva la clase
  `pos-acepta-escaneo` y `dialogOpen` la excluye. Decisión (`decidirEscaneoConPesarAbierto`): **nunca se
  confirma la pesada pendiente de forma implícita** —el peso de la báscula puede ser ya del producto nuevo—;
  se cancela con aviso «Se canceló la pesada de ‹X›: no estaba confirmada» y se sigue con el nuevo. El mismo
  producto dos veces (doble lectura del código) se ignora. Un producto por unidad escaneado con «Pesar» abierto
  va al carrito como siempre y el diálogo sigue.
- Tras agregar con báscula: toast «Agregado: 0,735 kg · Queso campesino · $ 13.892» con «Deshacer» (quita esa
  línea). El POS no tiene sonido de escaneo hoy (solo pedidos en línea); no se agregó uno.
- **Tara recordada por producto en la sesión** (`taraSesion.ts`, `sessionStorage`): la siguiente pesada del
  mismo producto abre con la tara usada; si no hay, la predefinida del producto. Atajos visibles: Z, T, M en
  los botones; «Agregar … · Enter» y «Cancelar · Esc». Con báscula el foco va a la lectura al abrir (antes lo
  tomaba la «×» del diálogo y Enter cerraba).

### 11.5 Pruebas

`src/lib/pos/bascula/__tests__/` (tramas de los 5 protocolos como fixtures, divisor, sugerencia, estabilidad,
lector con reloj manual, transportes Web Serial y Desktop con dobles, vista y pesada, flujo en un paso, tara
de sesión), `src/components/pos/venta/peso/__tests__/lecturaBasculaRender.test.tsx` y
`pesarUnPaso.test.tsx` (4 idiomas; auto-agregar; peso anterior; escaneo con el diálogo abierto; sin báscula),
`src/components/pos/configuracion/basculas/__tests__/basculasRender.test.tsx` (4 idiomas; K1–K7; formulario;
«Probar lectura» con bytes crudos) y `src/__tests__/electron/scale.test.ts` (validación IPC, errores de
serialport, dueño único, origen). Pasan con `TZ=UTC` y `TZ=America/Bogota`, junto con `src/__tests__/pos`,
guardarraíles, i18n y electron. `tsc` acotado a los archivos tocados sin errores; `electron` compila.

### 11.6 Pendientes

- **Grabar tramas reales** de cada protocolo (A&D/CAS ST,GS, Toledo 8217, SICS, CAS PD-II) y validar Dibal con
  un equipo (hoy pendiente). Confirmar si el 8217 del modelo usado pide `W` o `W\r`.
- **Instalador NSIS en Windows limpio** con adaptador USB-serie y firma (`HARDENING-2026-09-21.md` §5).
- Una venta con `origen = 'bascula'` archivada la báscula antes de sincronizar (venta offline) sería rechazada
  (`bascula_invalida`): se pidió «báscula activa». Si pasa en la práctica, aceptar también las archivadas
  después de `leido_en`.
- `print_agent_id` no se asigna desde la UI (la web no conoce el id del agente del equipo); la elección «de este
  equipo» vive en el navegador y la caja por `pos_terminal_id`.
- BLE en tableta (`bluetooth_le`) y TCP (`desktop_tcp`) siguen reservados.
- Si otra sesión recrea `pos_pesaje_contexto` desde su archivo sin el parche 220300, la clave
  `agregar_al_estabilizar` desaparece; el cliente la toma como `true`, así que la regla por defecto se mantiene
  pero un `false` explícito dejaría de respetarse.
- Mesas (`AddProductDialog`) usa «Pesar» sin báscula; conectarla es pasarle `bascula` y `lector`.

### 11.7 Venta en un paso también en la mesa (2026-09-29)

Pedido de seguimiento: la mesa («Agregar productos», `src/components/pos/mesas/id/AddProductDialog.tsx`)
abría «Pesar» y leía la báscula, pero no agregaba sola ni ofrecía «Deshacer», porque `usePesarPos` estaba atado
al `cartId` del carrito del POS.

- **Una sola lógica, dos destinos**: `src/components/pos/venta/peso/usePesarConBascula.tsx` recibe
  `{ agregar(linea) → id, deshacer(id), cambiar(id, cantidad, pesaje) }` y hace todo lo de 11.4 (lector del
  equipo abierto, lectura nueva, directo o esperar a estabilizar con la regla `agregar_al_estabilizar`, escaneo
  con «Pesar» abierto, toast «Agregado … · Deshacer», tara recordada, pantalla del cliente opcional).
  `usePesarPos` quedó como envoltura con el carrito del POS (`addItemToCart` → id de la última línea,
  `removeItemFromCart`, `updateCartItemPesaje`) y la misma API: el POS no cambió (sus pruebas pasan sin tocarlas).
- **La mesa** usa el mismo hook con sus líneas: `agregar` crea la línea con clave por secuencia
  (`clavePesada`) y la devuelve para «Deshacer»; `deshacer` la quita; `cambiar` ajusta cantidad y pesaje. Tocar o
  escanear un producto por peso con la báscula estable lo agrega de una con origen «bascula»; si no, «Pesar»
  espera y agrega al estabilizar; con la regla apagada, Enter. La pantalla del cliente sigue solo en el POS.
- El escaneo sigue por la secuencia compartida `src/lib/pos/venta/escaneo.ts` (`resolverEscaneo`); la mesa
  conserva su `seguirTrasPesarAbierto` (cancela la pesada pendiente también ante un producto por unidad) usando
  `pendiente`/`cancelar` del hook, que lee el estado sin esperar al render para no avisar dos veces.
- Pruebas: `src/__tests__/pos/peso/mesaBasculaUnPaso.test.tsx` (estable → directo con origen báscula,
  «Deshacer» quita la línea y `onAddProducts` recibe `pesaje.origen = 'bascula'`; inestable → agrega al
  estabilizar; regla apagada → Enter). Las de la mesa del frente del POS
  (`mesasPantallaPesoRender.test.tsx`) y `pesarUnPaso.test.tsx` pasan sin cambios.
- Con esto queda resuelto el último punto de 11.6 («Mesas usa “Pesar” sin báscula»).
