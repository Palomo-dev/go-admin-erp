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
