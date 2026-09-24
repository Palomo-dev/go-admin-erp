# POS — el cobro se decide en el servidor (2026-09-24)

Tarea: que precios, descuentos, flete, deudas, anulaciones y el cobro de mesas pasen por
`pos_checkout_v1` y RPC transaccionales, sin lógica duplicada en el navegador. Base:
`POS-PARIDAD-PANTALLA-PRINCIPAL.md` §6 (BE3, BE4), `POS-CARRITO-LINEAS-NOTAS.md` §7-8 y
`POS-CARGOS-SERVICIO-EN-VENTAS.md` §6 (lo que `pos_checkout_v1` necesitará después: no se
implementa aquí). Fuera de alcance, por decisión pendiente del dueño: unificar los tres motores
de impuestos y la semántica de «Excluir impuesto», y los cargos de servicio.

Datos: conteos por MCP, sin datos personales; organizaciones solo por id.

---

## 2. Venta duplicada al reintentar (punto 2)

- **Antes:** en el navegador `POSService.checkout` generaba el `sale_id` en cada llamada (el
  escritorio, en cada clic). Si el primer «Completar venta» llegaba a la base y la respuesta se
  perdía, el reintento creaba otra venta.
- **Ahora:** `CheckoutDialog` crea el *intento de cobro* (id + fecha) al primer clic y lo reutiliza
  en todos los reintentos de esa apertura; se reinicia al abrir el cobro de nuevo. El mismo id viaja
  como `CheckoutData.attemptId`: en el cobro de una venta que ya existe (mesa, deuda) es la llave de
  idempotencia de los pagos (§1, §6).

## 3. Precios y descuentos validados en el servidor (punto 3)

`pos_checkout_v1` guardaba `unit_price`, `discount_amount`, `tax_amount` y `total` tal como llegaban.
Migración `20260925140000_pos_checkout_v1_valida_precios`. En una venta **nueva**, por línea
(`fn_pos_validar_linea_venta`):

| Regla | Error |
|---|---|
| El producto existe y es de la organización | `producto_invalido` |
| Precio = `product_prices` vigente en *t* + extras de los modificadores configurados del producto o de su padre (tolerancia 0,01). *t* = ahora, la fecha de la venta o el momento en que la línea entró al carrito (`priced_at`); estas dos solo en los últimos 30 días | `precio_no_vigente` / `precio_no_coincide` / `modificador_invalido` |
| Descuento ≤ cantidad × precio | `descuento_excede_linea` |
| Total e impuesto de la línea coherentes con la regla única (neto = cantidad × precio − descuento; incluido: total = neto; si no, total = neto + round(neto × tasa / 100, 2)), tolerancia 0,05; descuento total = suma de líneas | `linea_incoherente` |

- **Precio manual:** no existe ningún flujo en el POS (carrito, mesa y «Nueva venta» toman el
  precio del catálogo). Un precio distinto se rechaza siempre; si algún día existe, irá con permiso.
- **Enganche** para el límite de descuento por rol / autorización de supervisor:
  `fn_pos_autorizar_descuento(org, actor, línea, sobre.discount_authorization)`, llamado por cada
  línea con descuento. Hoy no rechaza nada (`POS-AUTORIZACION-SUPERVISOR.md` aún no existe).
- **Factura y stock desde `sale_items`:** repetir un `sale_id` existente con un sobre fabricado ya no
  mete líneas inventadas en la factura. `sale_items.tax_included` (NULL-able) guarda el modo de
  impuesto de cada línea para la factura.
- **No validado (decisión del dueño):** la *tasa* de impuesto de cada línea sigue viniendo del
  navegador (depende de unificar los motores de impuestos). Se valida que el total cuadre con la
  tasa enviada y que esté entre 0 y 100.
- **Ventana de transición:** hasta desplegar el front nuevo, un carrito armado antes de un cambio de
  precio se rechaza (el front viejo no manda `priced_at`); hay que quitar y volver a agregar la línea.

Prueba en transacción deshecha (org de prueba 120): venta legítima pagada; reintento idempotente
(1 venta, 1 pago); sobre fabricado sobre venta existente sin efecto en la factura; precio
manipulado, descuento mayor que la línea, producto de otra organización, modificador de otro
producto, total incoherente y precio vencido rechazados; carrito armado antes del cambio aceptado;
`priced_at` de 40 días rechazado; producto sin precio vigente rechazado; `anon` rechazado.

## 4. Precio gratis y precio vencido (punto 4)

- `getProductPrice` devolvía 0 si la consulta fallaba o no había fila: el producto entraba **gratis**
  sin aviso. Ahora lanza `ProductoSinPrecioError` y el POS lo dice en es/en/fr/pt.
- Una sola regla de vigencia (`src/lib/pos/precioVigente.ts`, la misma que
  `fn_pos_precio_base_vigente`): `effective_from <= ahora < coalesce(effective_to, ∞)`, la más
  reciente. La usan el catálogo del POS (antes tomaba el último registrado aunque estuviera vencido o
  programado), las variantes (ordenaban por una columna que no pedían), `getProductById` (el
  `.eq('effective_to', null)` es `= null` y nunca coincidía), el carrito y el catálogo local del
  escritorio.

## 5. Flete en la factura (punto 5)

El total de la factura sale de sus líneas (`fn_recalc_invoice_totals`: `SUM(total_line)`) y
`pos_checkout_v1` no escribía el flete como línea. Migración
`20260925140100_pos_checkout_v1_flete_en_factura`: al crear las líneas, si la venta tiene
`delivery_fee` se añade «Envío (Delivery)» (sin producto, cantidad 1, tarifa 0, en el modo de la
factura), la misma forma que ya usan los pedidos web desde que `webOrderTotals.ts` lo hace.
Probado en transacción deshecha: venta 39.000 + flete 5.000 → factura 44.000 pagada con 2 líneas;
el reintento no duplica el flete; con impuesto incluido la base y el IVA no cambian.

### Daño en datos (medido el 2026-09-24, NO corregido)

| Origen | Organización | Facturas | Flete no facturado | Última |
|---|---|---|---|---|
| POS | 120 | 31 | $118.000 | 2026-08-20 |
| Sitio web (antes de la línea de flete web) | 113 | 2 | $4.275 | 2026-08-27 |
| **Total** | 2 | **33 de 531** | **$122.275** | 2026-08-27 |

Las 33 están `paid` y ninguna tiene factura electrónica (`einvoice_status` NULL). Desde el
2026-08-20 ninguna venta del POS con flete volvió a pasar por el camino defectuoso (el cobro por
`pos_checkout_v1` no había facturado aún ventas con flete), así que el defecto estaba latente.
Nota: el pedido de la tarea hablaba de 5 organizaciones y la última de hoy; la medición actual da 2
organizaciones y la última del 2026-08-27 (las facturas web con flete de hoy sí traen su línea).

**Propuesta de corrección (decide el dueño con su contador):**

1. **Nota débito por el flete** (recomendada): un documento `invoice_sales` con
   `document_type = 'debit_note'`, `related_invoice_id` = la factura original y una línea
   «Envío (Delivery)» por el valor del flete. No toca documentos emitidos y, si la organización
   factura electrónicamente, es el documento que la DIAN espera para aumentar el valor de una
   factura. El cobro ya está registrado: la nota nace pagada con el excedente de los pagos de la
   factura (hoy la factura está sobrepagada por el flete).
2. **Ajuste de la factura original** (añadirle la línea): más simple, pero modifica un documento ya
   emitido; solo admisible porque ninguna de las 33 salió a la DIAN.

En ambos casos hay que revisar con el contador el asiento: la venta del POS devengó el total de la
venta (con flete) y la factura, sin él.

## 6. Deuda, cobro de deuda y anulaciones (punto 6)

Migración `20260925140200_pos_deuda_cobro_y_anulacion` (parche sobre la definición viva de
`pos_checkout_v1` + tabla `pos_cobros` + `pos_anular_venta_v1`).

| Flujo | Antes (navegador, N escrituras) | Ahora (una RPC, una transacción) |
|---|---|---|
| «Deuda» (`holdCartWithDebt`) | `sales`, `invoice_sales`, `invoice_items`, `sale_items` y stock con la sucursal del usuario; sin idempotencia; totales de un cuarto motor (`calculateCartTaxesComplete`) distintos de las líneas | `pos_checkout_v1` modo `debt`: misma validación de precios del §3, cliente obligatorio (regla existente; no exige caja), sin pagos, venta `pending`, factura `issued` a crédito con vencimiento = fecha + plazo; cartera por el disparador. Id de la venta guardado en el carrito antes de llamar (`debt_attempt_id`): el reintento no crea otra deuda. Sucursal del carrito. La línea usa la tasa y el modo que ya traía (sin resolver impuestos por defecto: no cambia el cálculo); la cabecera de la venta ahora es la suma de las líneas, igual que la factura |
| Cobrar la deuda | update de venta y factura, pagos, comisión y propina; un reintento duplicaba pagos | `pos_checkout_v1` modo `settle`: idempotente por la llave del intento (`payment_key` → `pos_cobros`); suma propina y flete (línea de flete si la factura ya existía); saldo y estado desde los pagos; rechaza venta anulada o ya pagada |
| «Anular deuda» (`cancelDebtWithCreditNote`) | NC, factura, venta y `accounts_receivable` a mano; sin permiso | `pos_anular_venta_v1` |
| «Anular venta» (`VentasService.cancelSale`) | solo `status = 'void'` | `pos_anular_venta_v1` |

`pos_anular_venta_v1(sale_id, motivo)`: permiso `pos.void` en el servidor (`fn_tiene_permiso`;
hoy solo lo tiene el rol de administrador de la organización), motivo ≥ 3 caracteres, bloquea si hay
devoluciones procesadas (→ Devoluciones) o la mesa sigue abierta (→ «Liberar mesa»). Anula los
pagos **solo si su caja sigue abierta** (misma regla de alcance que `pos_caja_esperado`; si no:
`caja_cerrada` → registrar una devolución), cada uno con `fn_anular_pago` — la anulación única de
pagos que otra sesión publicó el mismo día (estado `void`, contra-asiento, cuotas, recibo y
auditoría financiera; migración `20260925140250`) —; anula propinas con
`fn_propina_anular`; cancela comisiones devengadas; devuelve el stock del kardex
(`fn_stock_entrada_devolucion`, reutilizada de devoluciones) y los seriales; emite la nota
crédito por lo facturado y anula la factura. La cartera la ajustan los disparadores. Idempotente
(`ya_anulada`). Auditoría en `ops_audit_log` (`VOID`).

**Factura electrónica:** la nota crédito ELECTRÓNICA no se envía a Factus todavía. Si la factura
ya salió a la DIAN (`einvoice_status` pending/processing/sent/accepted) la anulación se hace igual
y devuelve el aviso `factura_electronica_sin_nota_credito_dian`, que la pantalla muestra; la NC
electrónica queda pendiente de enviar a mano hasta que se decida el enganche (el mismo pendiente de
`procesar_devolucion`).

**Cartera de una factura anulada:** el disparador `create_account_receivable` deja la cuenta con
saldo 0 y estado `paid` (no `cancelled`): es el comportamiento de siempre del disparador; el
navegador intentaba escribir `cancelled` a mano (en la base hay 0 filas `cancelled`). Si se quiere
`cancelled`, se cambia el disparador (decisión del área de CxC).

**Ventas `pending` huérfanas:** el flujo de deuda no las deja: las 284 ventas «Venta con deuda»
pendientes tienen factura y líneas. La del 2026-09-16 en la org 140 es una **mesa abierta**
(sesión `active`, sin factura ni pagos). Además hay 44 ventas de mesa `pending` cuya sesión quedó
`completed` (3 organizaciones, la última del 2026-08-04, $1.924.550): anteriores a
`pos_mesa_liberar` (que ya no suelta una mesa con saldo). Se reportan, no se tocan.

Pruebas en transacción deshecha (org de prueba 120): deuda sin cliente y deuda con precio
manipulado rechazadas; deuda válida (venta pending, factura issued a crédito con vencimiento a 15
días, cartera creada); abono parcial (venta y cartera con saldo); reintento del mismo intento sin
duplicar pagos; saldo con flete y propina (venta pagada, línea de flete, propina, cartera en 0);
cobrar de nuevo una venta pagada rechazado; anular sin permiso y sin motivo rechazados; anular la
deuda cobrada (2 pagos y 2 asientos revertidos, propina anulada, NC por −44.000, factura anulada);
anular dos veces → `ya_anulada`; cobrar una venta anulada rechazado; venta de mostrador anulada
(stock 100 → 97 → 100 con kardex de entrada); pago en caja cerrada → `caja_cerrada`.
