# POS — Cargos de servicio en las ventas (análisis + especificación, 2026-09-24)

Pedido del dueño: «Deberíamos aplicar los cargos de servicio en las ventas. ¿Cómo sería en Figma, cómo se
vería y cómo funcionaría, para después pasarlo a la realidad?»

Alcance: **cómo se aplica** un cargo configurado en `/app/pos/cargos-servicio` a una venta (carrito, cobro,
mesa y pre-cuenta, pedido web, ticket, factura electrónica, contabilidad, devoluciones, pantalla del
cliente). **No** cubre los errores de la página de configuración (`'fixed'` vs `'fixed_amount'`, permisos,
filtro de sucursal): otro agente los está corrigiendo. Nada de código ni de esquema se tocó: esto es
propuesta para aprobar en Figma.

> **Actualización 2026-09-24.** El dueño respondió las 9 preguntas de §8: ver **§9 «Decisiones del dueño —
> 2026-09-24»**, que manda sobre lo anterior donde difiera, y la confirmación del flujo de datos hasta la
> contabilidad (§9.2) con sus huecos (§9.3). La fila del cargo en el resumen se realineó en Figma (§7.6).

Antecedentes que se dan por leídos: `PATRONES-TRANSVERSALES.md` §13 #6 (decisión cerrada: «el cargo de
servicio se cobra como **línea propia de la factura, antes de impuestos**; **no** es propina»),
`PARIDAD-MESAS-PROMOCIONES.md` §G (Sección 24 «Cargos de servicio» de Figma),
`POS-PROMOCIONES-CUPONES-CARGOS-PROPINAS.md` (#10 y #20) y `POS-CARRITO-LINEAS-NOTAS.md` §7 (controles de
impuesto C1-C4). Este documento **baja al detalle** lo que la decisión #6 dejó en principio: estados,
permisos, cálculo, redondeo, casos borde y cambios de backend.

Fuentes: código de `main` y base `jgmgphmzusbluqhuqihj` (solo `SELECT`: esquema, `CHECK`, funciones,
conteos agregados; sin datos personales ni nombres de organizaciones).

---

## 1. Análisis

### 1.1 Estado de hoy en una frase

`service_charges` se configura pero **ningún flujo de venta lo lee**. `CargosServicioService.calculateCharge`
(`src/components/pos/cargos-servicio/cargosServicioService.ts:297-316`) no tiene llamadores; además calcula
sobre un `subtotal` sin decir cuál (antes o después de descuentos, con o sin impuesto), trata cualquier tipo
distinto de `percentage` como fijo y no mira `applies_to`, sucursal, `is_optional` ni `is_taxable`.

### 1.2 Dónde se enchufaría (punto por punto)

| Punto | Archivo:línea | Qué hace hoy | Qué cambia |
|---|---|---|---|
| Resumen del carrito (mostrador) | `src/components/pos/TaxSummary.tsx:345-500` (Subtotal → Total impuestos → Descuento → Total Final), montado en `CartView.tsx` | No hay fila de cargo | Fila `CargoServicioFila` entre «Descuento» y los impuestos; su importe entra en «Total». Lo calcula el servidor (§6, RPC de vista previa), no el navegador |
| Totales del carrito guardado | `posService.ts:2312-2422` (`calculateCartTotals`) | `cart.total` = líneas ± impuestos | `cart.total` incluye los cargos en estado *aplicado*; lo usan el botón «Cobrar», la deuda y la pantalla del cliente |
| Diálogo de cobro | `CheckoutDialog.tsx:234-244` (`baseTotal`, `cartTotal = baseTotal + tipAmount + shippingFee`), `:906-1002` (`calculateCartTotals`), `:1909-1945` (bloque de totales), `:2324-2420` (Propina) | Subtotal · Impuestos · Propina · Flete · Total | `cartTotal = baseTotal(con cargos) + propina + flete`. Fila del cargo en «Totales a pagar» y acordeón «Cargo de servicio · Alt+C» (ya dibujado en Figma, Sección 24) |
| Base de la propina | `CheckoutDialog.tsx:353-359` (`setTipBase(baseTotal)`) y `:714-737`; `src/lib/pos/display/tip.ts:15-18, 76-80` | La propina sugerida se calcula sobre el **total con impuestos** | Se calcula sobre la **base del cargo** (subtotal después de descuentos, antes de impuestos, sin cargos). Ver §1.6 |
| Sobre de la venta | `src/lib/offline/checkoutRpc.ts:77-89` (tipo) y `:119-178` (armado) | `totals.{subtotal, tax_total, discount_total, total, shipping_fee, tip_amount}` | Clave nueva `service_charges: [{charge_id, decision, reason_code, reason_text}]` + `service_mode` + `guests`. **Sin importes**: el servidor los recalcula |
| RPC `pos_checkout_v1(p_envelope jsonb)` | Base de datos (22 477 caracteres) | §3 valida `Σ items.total + flete + propina = total` (±0,05); §4 inserta `sales`; §7 `sale_items`; §9 `invoice_sales` con `total = v_total`; §11 `invoice_items` solo de productos; §12 `tips` | Recalcula los cargos con la función única, amplía la validación a `ítems + cargos + flete + propina = total`, inserta `sale_service_charges` y **una línea de `invoice_items` por cargo aplicado**. Sin la clave, se comporta como hoy (sobres viejos del outbox siguen entrando) |
| Mesa: pre-cuenta | `mesas/id/pedidosService.ts:662-693` (`generarPreCuenta`) y `mesas/id/PreCuentaDialog.tsx:137-167` | Subtotal · Descuentos · Impuestos · Total | Muestra el cargo con su estado y la **propina sugerida voluntaria** con el aviso de la Ley 1935 |
| Mesa: cobro | `pedidosService.ts:886-1037` (`completarVentaMesa`) | Segunda implementación del cobro: `UPDATE sales` + `payments` + `invoice_sales` en N llamadas desde el navegador | Debe pasar por la misma RPC (regla 7 de `CLAUDE.md`; ya decidido en `POS-MESAS-COMANDAS-RESERVAS.md`). Si no, el cargo se implementaría dos veces |
| Pedidos web | `src/lib/services/webOrderTotals.ts:130-202` (envío y propina como líneas), `webOrderConfirmationService.ts` | `web_orders` guarda `delivery_fee` y `tip_amount`; no hay cargos | Fase 2: el sitio (`goadmin-websites`) pide la vista previa al servidor antes de pagar; `web_orders.service_charge_total`; la confirmación lo lleva a la venta como línea |
| Facturas de venta manuales | `components/finanzas/facturas-venta/nueva-factura/NuevaFacturaForm.tsx` | — | **No se aplican solos.** Botón «Agregar cargo de servicio» que inserta la línea desde el catálogo (mismo cálculo) |
| Cotizaciones | `lib/services/cotizacionesService.ts`, tabla `quotations` (7 filas) | — | Igual que la factura manual: opcional y visible como línea; al convertir en factura se conserva |
| Pantalla del cliente | `src/components/pos-display/OrderView.tsx:233-255`; `src/lib/pos/display/protocol.ts:80-96` (`DisplayCart`) | Subtotal · Descuento · Impuestos · TOTAL | `DisplayCart.charges[]` (etiqueta, importe, estado). El cargo opcional se pregunta en la pantalla, igual que la propina |
| Devoluciones | `components/pos/devoluciones/devolucionesService.ts:642-672, 1210-1240` | Reembolso por ítems con impuesto proporcional | Devuelve la parte proporcional del cargo porcentual (§4) |

### 1.3 `applies_to`: valores reales y cómo sabe hoy una venta de qué tipo es

`CHECK service_charges_applies_to_check`: **`all`, `dine_in`, `delivery`, `takeout`** (coincide con
`cargos-servicio/types.ts:4`).

La venta **no guarda** su tipo de servicio: `sales` no tiene columna de modo. Hoy solo se puede inferir:

| Valor | Qué venta es | Cómo se infiere hoy | Fiabilidad |
|---|---|---|---|
| `dine_in` (En mesa) | Cuenta de mesa | `sales.table_session_id IS NOT NULL` (52 ventas) | Buena |
| `delivery` (Domicilio) | Cobro del POS con «Domicilio propio» / «Domicilio tercero» (`CheckoutDialog.tsx:148, 1976-2005`, estado `deliveryType`); pedido web con `delivery_type` `delivery_own`/`delivery_third_party` (6 312 pedidos) | `deliveryType` vive solo en el diálogo; en la venta queda como `delivery_fee > 0` o `driver_id` | Mala en POS (el tipo no se persiste) |
| `takeout` (Para llevar) | «Recoger» en el cobro del POS; pedido web `pickup` (11 pedidos) | Ídem | Mala |
| — | Venta de mostrador de un restaurante que se consume **en el local** | **No existe**: el POS de mostrador no pregunta «¿Para comer aquí o para llevar?» | — |

**Propuesta:** `sales.service_mode text NULL CHECK (service_mode IN ('dine_in','takeout','delivery'))`,
escrito por la RPC: mesa → `dine_in`; mostrador → el selector de entrega del cobro («Recoger» = `takeout`,
domicilio = `delivery`) y, **solo si la organización tiene el módulo de mesas**, un control «Comer aquí ·
Para llevar» en el carrito (por defecto «Para llevar»); web → según `web_orders.delivery_type`.

### 1.4 Dónde se guarda: opciones

| Opción | A favor | En contra |
|---|---|---|
| A. Solo columnas en `sales` (`service_charge_total`) | Mínimo | No sirve para dos cargos, ni para auditar quién quitó cuál y por qué, ni para devolver la parte proporcional. `sales`/`invoice_sales` **no tienen hoy** ninguna columna de cargos (verificado); `invoice_sales.allowance_charges jsonb` existe pero está **vacía en las 3 500+ facturas** y ningún código la llena |
| B. Línea especial en `sale_items` (`product_id NULL`) | Viaja «gratis» a reportes de líneas | Contamina lo que asume que una línea es un producto: stock y recetas (§8 de la RPC), costo de venta (`fn_auto_journal_sale_item_cogs`), comandas, ranking de productos, devoluciones por ítem. Pierde el *snapshot* (tipo, valor, base) |
| **C. Tabla `sale_service_charges` + `sales.service_charge_total` + línea en `invoice_items`** (recomendada) | Snapshot inmutable del cargo aplicado (si mañana cambian el 10 % por 12 %, la venta de ayer no cambia); guarda los tres estados de decisión y su auditoría; la factura lo trae como línea, que es lo que exige la decisión #6 y lo único que sobrevive al trigger `fn_recalc_invoice_totals` | Una tabla más |

Por qué la línea en `invoice_items` **no es opcional**: `fn_recalc_invoice_totals` (trigger de
`invoice_items`) **pisa `invoice_sales.total` con `SUM(total_line)`**. Lo que no es una línea desaparece de
la factura. Evidencia de hoy: las **31 de 31** ventas de POS con flete tienen la factura por
`total − flete` (el flete no se factura), y las 2 con propina, por `total − propina`. Un cargo que no sea
línea sufriría lo mismo.

### 1.5 Impuestos del cargo y los controles C1-C4

- **Qué impuesto lleva.** `is_taxable` es un booleano sin tarifa. No sirve «el impuesto por defecto de la
  organización»: solo **1** organización tiene un impuesto con `is_default = true`, y **ninguna** tiene
  Impoconsumo creado en `organization_taxes` (los restaurantes lo necesitan). Propuesta:
  `service_charges.tax_id uuid NULL` (FK a `organization_taxes.id`), elegido en el formulario con el
  `TaxMultiSelect` del kit (una sola opción). `is_taxable` queda derivado (`tax_id IS NOT NULL`) por
  compatibilidad. Si el cargo está gravado y no hay impuesto elegido, el formulario no deja guardar.
- **Regla fiscal a validar con el contador:** un cargo **obligatorio** es parte del precio del servicio y
  va gravado con el mismo impuesto que el consumo (Impoconsumo 8 % en restaurantes, impuesto general 19 % en
  otros servicios). La propina voluntaria no.
- **C3/C4 «Impuestos incluidos» (cómo está expresado el precio).** El cargo **sigue el modo de la venta**:
  - Siempre se calcula sobre la base **neta** (sin impuestos) de los productos.
  - Con precios **sin** impuesto (C4 apagado): la fila muestra el neto y su impuesto se suma en la fila de
    impuestos.
  - Con precios **con** impuesto incluido (C4 encendido): la fila muestra el importe **con** su impuesto
    dentro (como las líneas de producto) y el impuesto se desglosa igual que hoy.
  - El dinero es el mismo en los dos modos (ejemplos 1 y 2 de §3). Un cargo **fijo** se interpreta en el modo
    de la venta: con impuesto incluido, `$ 1.500` es lo que paga el cliente.
- **C1 «Excluir impuesto» y C2 «Incluido» de una línea** afectan solo a esa línea de producto. La base del
  cargo usa el neto de la línea tal como lo calcula el cobro (c) de `POS-CARRITO-LINEAS-NOTAS.md` §7.2, y el
  impuesto del cargo es **el suyo** (`tax_id`), nunca el de la línea. Así no se toca ninguna de las
  semánticas que ese documento congeló en tests.

### 1.6 Cargo obligatorio, cargo opcional y propina: la frontera

| Concepto | Quién decide | ¿Es ingreso del negocio? | ¿Gravado? | ¿En la factura? | Dónde vive |
|---|---|---|---|---|---|
| **Cargo obligatorio** (`is_optional = false`) | El negocio; se informa antes (carta, aviso) | Sí | Según `tax_id` | Sí, como línea | `service_charges` → `sale_service_charges` |
| **Cargo opcional** (`is_optional = true`) | El cliente lo acepta o lo rechaza | Sí | Según `tax_id` | Solo si se acepta | Ídem, estado «opcional pendiente» hasta decidir |
| **Propina** | El cliente, voluntaria | **No**: es de los trabajadores (Ley 1935 de 2018) | No | **No** | `tips` (y `sales.tip_amount`) |

Hechos que obligan a separar:
- **Las 15 filas «Propina sugerida 10 %» son una propina disfrazada**: `percentage`, `dine_in`,
  `is_optional = true`, `is_taxable = false`. Si se aplicaran como cargo entrarían a la factura y al ingreso
  del restaurante. Propuesta: desactivarlas (no borrarlas) y llevar su porcentaje a los **porcentajes
  sugeridos de propina** de Configuración › POS (los que ya usa la pantalla del cliente). Y en el formulario,
  si alguien crea un cargo opcional porcentual sin impuesto para mesa: aviso «Esto parece una propina
  sugerida» con el botón «Configurarla en Propinas».
- **Un cargo opcional legítimo** es un servicio que el cliente puede no tomar (empaque para llevar, cubierto,
  servicio de descorche). Es ingreso y se factura si se acepta.
- **Ley 1935 de 2018 y la instrucción de la SIC** (a validar con el asesor legal): la propina debe
  informarse como voluntaria, se pregunta al cliente si la acepta y la sugerencia **no puede superar el 10 %
  del valor de la cuenta antes de impuestos**. Hoy el cobro la sugiere sobre el **total con impuestos**
  (`tip.ts:15-18`, `CheckoutDialog.tsx:353-359`): un 10 % sugerido supera ese tope. Propuesta: base de la
  propina = subtotal después de descuentos, sin impuestos y **sin** cargos.
- **Contabilidad de la propina hoy** (hallazgo colateral, no se corrige aquí): la regla `tip` de **85**
  organizaciones es débito `5105` (gasto de personal) / crédito `1105` (caja) al crear la propina, y el
  asiento de la venta (`fn_auto_journal_sale_pos`) acredita ingreso por `sales.total`, **que incluye la
  propina**. La propina entra como ingreso y sale como gasto. Lo correcto es un pasivo (propinas por pagar a
  los trabajadores). Va a la tarea de Propinas.

### 1.7 Factura electrónica (Factus)

- `construirFactura` (`src/lib/services/einvoicing/payloadsFactus.ts:266-302`) arma el documento **solo con
  `invoice_items`** y paga por la suma de líneas; **no envía `allowance_charges`**, aunque el tipo existe
  (`factusService.ts:134-140, 164`).
- **Recomendación: el cargo viaja como línea** (`code_reference = 'CARGO-SERV'`, nombre del cargo, cantidad 1,
  `price` sin impuesto, `taxes` con el código y la tarifa de su `tax_id`: `01` impuesto general, `04`
  Impoconsumo, vía `mapTaxCode`). En el anexo técnico DIAN los cargos globales (`AllowanceCharge` de
  documento) **no afectan la base gravable**, así que un cargo gravado **no puede** ir ahí. Un cargo no
  gravado también va como línea, con tarifa 0 y el tratamiento que defina el contador (excluido o no causa),
  por uniformidad.
- Consecuencia buena: **`payloadsFactus.ts` no cambia**; basta con que la RPC inserte la línea en
  `invoice_items`. La nota crédito de una devolución copia la línea (proporcional si es parcial).
- La propina **nunca** va a la factura electrónica. Hoy el POS ya la deja fuera por accidente (§1.4) y los
  pedidos web la meterían como línea «Propina» (`webOrderTotals.ts:191-202`; 0 casos hasta hoy): corregir en
  la tarea de Propinas.

### 1.8 Contabilidad

- `fn_auto_journal_sale_pos` (trigger de `sales`) y `fn_auto_journal_sale` (trigger de `invoice_sales`)
  hacen **un** asiento: débito caja/cartera por `total`, crédito ingreso (`4105` en 73 organizaciones) por
  `total − impuesto`, impuesto por `tax_total` si `use_tax_from_document`. `fn_create_journal_entry` admite
  una sola cuenta de crédito.
- **Fase 1 (sin tocar asientos):** el cargo entra al ingreso de la regla de venta y al impuesto del documento;
  los reportes de cargos se sacan de `sale_service_charges`. Cuadra porque el cargo está en `total` y en
  `tax_total`.
- **Fase 2:** `accounting_rules.service_charge_account_code text NULL` (en la regla `sale`/`created`; si es
  nulo, se usa la de ingreso) y el asiento de venta separa el crédito en dos líneas cuando
  `sales.service_charge_total > 0`. Exige una variante multilínea de `fn_create_journal_entry`.

### 1.9 Datos reales (conteos, 2026-09-24)

| Dato | Valor |
|---|---|
| Cargos configurados | **45** en **13** organizaciones (una tiene 9, repartidos en 3 sucursales) |
| Todos activos / todos con sucursal / todos de la semilla | Sí / sí (ninguno global) / sí: los 45 son de antes de 2026-02; **nadie ha creado un cargo propio** |
| Por tipo | 15 «Propina sugerida 10 %» (`percentage`, `dine_in`, opcional, sin impuesto) · 15 «Cargo de servicio mesa grande» (10 %, `dine_in`, gravado, **mínimo 8 comensales**) · 15 «Cargo por delivery» (`fixed_amount` $ 5.000, `delivery`, gravado) |
| `min_amount` usado | 0 cargos |
| Organizaciones con mesas | 9 (162 sesiones de mesa; 4 con 8 o más comensales). **Ninguna** de las 13 con cargos tiene ventas de mesa |
| Ventas por origen | 2 250 POS · 644 web · 675 factura manual; 52 de mesa; 544 con flete; 2 con propina |
| Propinas en `tips` | 8 |

Lectura: activar hoy la aplicación automática no cobraría nada a nadie (ninguna organización con cargos
vende en mesa), pero el «Cargo por delivery» de $ 5.000 **se sumaría al flete** en domicilios: ver pregunta 3.

### 1.10 Hallazgos colaterales (no se corrigen aquí)

1. Las facturas de POS **no incluyen el flete** (31/31) porque no es una línea de `invoice_items`.
2. La propina se contabiliza como ingreso en el asiento de la venta y como gasto en el de la propina (§1.6).
3. La propina sugerida puede superar el 10 % antes de impuestos (§1.6).
4. El acordeón aprobado en Figma (`460:236603`) dice «La propina se calcula sobre el total de la factura» y
   el del cobro (`505:87853`) rotula el cargo «… · opcional»: esta propuesta los corrige en su propia
   sección, sin tocar los frames aprobados.

---

## 2. Reglas propuestas

### 2.1 Cuándo se aplica solo

Un cargo entra en la venta si **todas** se cumplen:
1. `is_active`.
2. Sucursal: `branch_id IS NULL` (global) **o** igual a la sucursal de la venta.
3. Tipo de servicio: `applies_to = 'all'` o igual a `sales.service_mode` (§1.3).
4. Monto mínimo: `min_amount IS NULL` o **base del cargo ≥ `min_amount`** (base = subtotal después de
   descuentos, antes de impuestos).
5. Comensales: `min_guests IS NULL` o comensales ≥ `min_guests`. En mesa, `table_sessions.customers`; en
   mostrador «Comer aquí», el número que se pida en el carrito; si no se conoce, el cargo con mínimo de
   comensales **no aplica** (nunca se supone).
6. Varios cargos que aplican se suman, **cada uno sobre la misma base** (no hay cargo sobre cargo).

El cálculo lo hace **una sola función en la base** (§6) que usan la vista previa del carrito, la pre-cuenta,
el cobro, la mesa y el pedido web. El navegador pinta lo que devuelve; nunca manda importes.

### 2.2 Estados de un cargo en una venta

| Estado | Cuándo | Cómo se ve | Suma al total |
|---|---|---|---|
| **Aplicado automático** | Cumple 2.1 y es obligatorio | Fila con chip «Automático · mesa de 8+» e icono «Quitar» | Sí |
| **Quitado por el cajero** | Alguien con permiso lo quitó, con motivo | Fila tachada, chip «Quitado · Cortesía», acción «Restaurar» | No |
| **No aplica** | Falla un mínimo (comensales o monto) | Fila atenuada, chip «No aplica · mínimo 8 comensales», icono de información | No |
| **Opcional pendiente de aceptar** | Cumple 2.1 y `is_optional` | Fila con chip «Opcional · por aceptar» y botones «Aceptar» / «Rechazar»; la pantalla del cliente lo pregunta | No, hasta aceptarlo |
| (Opcional rechazado) | El cliente o el cajero lo rechazó | Como «Quitado», motivo «El cliente no lo aceptó» | No |

Un cargo **no aplica** por sucursal o por tipo de servicio **no se muestra** (sería ruido). Se muestran los que
fallan por mínimo porque el cajero puede explicarlo al cliente («si llegan los otros dos, se cobra el
servicio»).

**No se puede cobrar** con un cargo opcional pendiente: el botón «Cobrar» pide decidir primero (o la pantalla
del cliente lo resuelve).

### 2.3 Quitar un cargo obligatorio

- Permiso nuevo **`pos.service_charge.waive`**, resuelto en el servidor (regla 6), nunca por el nombre del
  rol. Sin el permiso, el mismo diálogo pide que un supervisor con el permiso se identifique; la RPC valida
  quién autorizó.
- Motivo **obligatorio**: «El cliente no lo acepta» · «Cortesía de la casa» · «Error de configuración» ·
  «Otro» (texto libre, 140 caracteres). Queda en `sale_service_charges` (quién, cuándo, motivo, quién
  autorizó) y en `ops_audit_log`.
- Un cargo **opcional** se rechaza sin permiso (es decisión del cliente), con motivo «El cliente no lo
  aceptó» por defecto.
- «Restaurar» vuelve al estado aplicado sin permiso.
- Cambiar el carrito (agregar, quitar, descontar) **recalcula** el cargo pero **conserva** la decisión de
  quitar o rechazar.

### 2.4 Cómo se ve para el cliente

| Superficie | Qué muestra |
|---|---|
| Carrito (cajero) | Subtotal · Descuento · **Cargo por servicio 10 %** (con estado) · Impuestos · Total |
| Cobro | «Totales a pagar»: Subtotal de productos · Cargo · Base gravable · Impuesto · **Total de la factura** · Propina (voluntaria, fuera de la factura) · Flete · **Total a cobrar**. Acordeón «Cargo de servicio · Alt+C» con el detalle y «Quitar» |
| Pre-cuenta de mesa | El cargo como línea con su condición («Mesa de 8 o más comensales»), el texto para el cliente del cargo y, aparte, **la propina sugerida voluntaria** con el aviso de la Ley 1935 y los importes 5 / 10 % calculados antes de impuestos |
| Ticket 80 mm | El cargo entre subtotal y base gravable; si se quitó, no aparece; la propina después del total, marcada «voluntaria» |
| Factura electrónica | El cargo como línea (código `CARGO-SERV`); la propina no aparece |
| Pantalla del cliente | Fila del cargo entre descuento e impuestos. Si es opcional, una vista «¿Desea agregar el empaque para llevar? $ 1.500 · Sí · No», como la de propina |

Todo texto nuevo va en el namespace `posServiceCharges` de `messages/{es,en,fr,pt}.json` (§5).

---

## 3. Cálculo paso a paso

Orden (el mismo en todas las superficies):

1. **Línea**: cantidad × precio. Si el precio incluye impuesto, se extrae (regla única `splitGrossLine`).
2. **Descuentos de línea** (manual o promoción; gana el mayor, §13 #7).
3. **Descuentos de pedido** (cupón) prorrateados por línea, como `prorratearCentavos` de `webOrderTotals.ts`.
4. **Base del cargo** = Σ netos de línea después de 1-3. Sin impuestos, sin flete, sin propina, sin otros
   cargos.
5. **Elegibilidad** (§2.1) contra esa base y los comensales.
6. **Importe**: porcentaje × base, o el valor fijo.
7. **Redondeo**: se redondea a la unidad de la moneda (COP: peso entero, mitad hacia arriba) **el importe que
   se muestra en la fila**: el neto si la venta es sin impuesto incluido, el bruto si es con impuesto
   incluido. El impuesto se reparte con la regla única de 2 decimales (`splitGrossLine`/F-51).
8. **Impuesto del cargo** con su `tax_id`.
9. **Total de la factura** = productos + cargos (con impuestos).
10. **Flete** (Entrega): aparte, no es cargo de servicio.
11. **Propina sugerida** = porcentaje × base del paso 4. Voluntaria, fuera de la factura.

### Ejemplo 1 — porcentaje, gravado, precios **sin** impuesto (mesa de 8, Impoconsumo 8 %)

Cargo «Servicio mesa grande»: 10 %, `dine_in`, mínimo 8 comensales, Impoconsumo 8 %, obligatorio.

| Concepto | Valor |
|---|---|
| 4 × Bandeja paisa $ 32.000 | $ 128.000 |
| 4 × Limonada de coco $ 9.000 | $ 36.000 |
| Subtotal | $ 164.000 |
| Cupón MESA-14K (prorrateado: $ 10.926,83 + $ 3.073,17) | − $ 14.000 |
| **Base del cargo** | **$ 150.000** |
| Cargo por servicio 10 % (aplicado · mesa de 8+) | $ 15.000 |
| Base gravable | $ 165.000 |
| Impoconsumo 8 % (productos $ 12.000 + cargo $ 1.200) | $ 13.200 |
| **Total de la factura** | **$ 178.200** |
| Propina voluntaria sugerida 10 % sobre $ 150.000 | $ 15.000 (fuera de la factura) |
| Total a cobrar si acepta la propina | $ 193.200 |

Hoy el cobro sugeriría 10 % de $ 178.200 = $ 17.820.

### Ejemplo 2 — el mismo, precios **con** impuesto incluido (C4 encendido)

Bandeja $ 34.560 y limonada $ 9.720 (= los netos anteriores + 8 %). 4 × 34.560 + 4 × 9.720 = $ 177.120;
cupón − $ 15.120 (bruto) → $ 162.000 con impuesto → neto **$ 150.000**. Cargo 10 % del neto = $ 15.000 +
Impoconsumo $ 1.200 → la fila muestra **$ 16.200 (incluye Impoconsumo)**. Total $ 162.000 + $ 16.200 =
**$ 178.200**: el mismo dinero que en el ejemplo 1.

### Ejemplo 3 — redondeo con precios con impuesto incluido

Cargo «Servicio a la mesa» 10 % sin mínimos, Impoconsumo 8 %. 2 × Ajiaco $ 28.000 (con impuesto) =
$ 56.000 → neto $ 51.851,85. Importe mostrado (bruto) = redondeo(51.851,85 × 10 % × 1,08) = redondeo(5.600,00)
= **$ 5.600** → neto $ 5.185,19 + Impoconsumo $ 414,81. Total **$ 61.600**.
Sin impuesto incluido, con precio neto $ 25.926: base $ 51.852 → cargo redondeo(5.185,2) = **$ 5.185**,
impuesto $ 414,80.

### Ejemplo 4 — fijo, gravado, domicilio

Cargo «Empaque para domicilio» $ 1.500 fijo, `delivery`, IVA 19 %, venta con impuesto incluido. Productos
$ 40.000 · Empaque **$ 1.500** (neto $ 1.260,50 + IVA $ 239,50) · Flete $ 5.000 (Entrega, aparte) →
cobrado **$ 46.500**. La factura lleva productos + empaque ($ 41.500) y, cuando se corrija §1.10 #1, el flete.

### Ejemplo 5 — no aplica por mínimo

Mesa de 6 con el cargo del ejemplo 1: fila «Cargo por servicio 10 % · No aplica · mínimo 8 comensales ·
$ 0». Total = $ 150.000 + $ 12.000 = **$ 162.000**.

### Ejemplo 6 — quitado por el cajero

Ejemplo 1 con el cargo quitado («Cortesía de la casa», autorizó la administradora): total **$ 162.000**. En
`sale_service_charges` queda la fila con estado `waived`, importe calculado $ 15.000, motivo y quién.

### Ejemplo 7 — «Excluir impuesto» (C1) en una línea

Ejemplo 1 con C1 en las limonadas: la base del cargo sigue siendo $ 150.000 y el impuesto del cargo sigue
siendo $ 1.200. C1 solo cambia el impuesto de las limonadas (con las discrepancias ya documentadas en
`POS-CARRITO-LINEAS-NOTAS.md` §7.5, que esta propuesta no toca).

### Ejemplo 8 — cuenta dividida

Ejemplo 1 dividido en dos cuentas con bases $ 90.000 y $ 60.000: el mínimo de comensales se evalúa sobre la
mesa entera (8); el cargo se reparte por base: $ 9.000 y $ 6.000. Cuenta A $ 90.000 + $ 9.000 + Impoconsumo
$ 7.920 = **$ 106.920**; cuenta B $ 60.000 + $ 6.000 + $ 5.280 = **$ 71.280**; suma $ 178.200. El residuo del
redondeo va a la última cuenta.

### Ejemplo 9 — devolución parcial

Del ejemplo 1 se devuelve 1 bandeja: neto devuelto $ 32.000 − $ 2.731,71 (su parte del cupón) = $ 29.268,29;
Impoconsumo $ 2.341,46; parte del cargo 15.000 × 29.268,29 / 150.000 = $ 2.926,83 + Impoconsumo $ 234,15.
**Reembolso $ 34.770,73.** La nota crédito lleva dos líneas: la bandeja y «Devolución: Cargo por servicio».

---

## 4. Casos borde

| Caso | Regla |
|---|---|
| Devolución parcial | Cargo **porcentual**: se devuelve la parte proporcional a la base devuelta (ejemplo 9). Cargo **fijo**: solo en devolución total. `sale_service_charges.refunded_amount` acumula lo devuelto |
| Devolución total / anulación | Se devuelve todo el cargo; la nota crédito copia la línea |
| Venta a crédito o con saldo | El cargo es parte del total y de la cartera; no cambia nada (`accounts_receivable` sale de la factura por trigger) |
| Mesas divididas | Mínimos sobre la mesa entera; reparto por base (ejemplo 8). Un cargo fijo va entero a la primera cuenta |
| Mesas combinadas | Comensales = suma de las mesas combinadas |
| Cambio de comensales después de pedir | Se recalcula; si baja del mínimo, pasa a «No aplica» |
| Pedido web | Fase 2. El sitio pide la vista previa al servidor y muestra el cargo antes de pagar; la pasarela cobra ese total; la confirmación no recalcula (manda lo cobrado, como con los impuestos de `webOrderTotals.ts`) |
| Sin conexión (escritorio) | El carrito usa la última copia del catálogo de cargos para la vista previa; la RPC recalcula al sincronizar. Si difiere, gana el servidor y queda aviso en `warnings` |
| Cargo cambiado a mitad de una cuenta de mesa | Se usa el valor vigente al **cobrar** (snapshot en `sale_service_charges`); la pre-cuenta impresa antes lo advierte («valores sujetos a cambio hasta el cobro») |
| Descuento que deja la base en 0 | Cargo porcentual 0; el fijo aplica salvo `min_amount` |
| Cortesía total (venta a $ 0) | No aplica ningún cargo |
| Factura manual y cotización | Nunca automático; «Agregar cargo de servicio» inserta la línea con el mismo cálculo |
| Promoción que excluye el cargo | No existe: las promociones y cupones solo descuentan productos |

---

## 5. Textos (4 idiomas)

Namespace `posServiceCharges`. En Figma los frames están en español; esta tabla es la fuente para
`messages/{es,en,fr,pt}.json`.

| Clave | es | en | fr | pt |
|---|---|---|---|---|
| `row` | Cargo por servicio {rate} % | Service charge {rate}% | Frais de service {rate} % | Taxa de serviço {rate}% |
| `stateApplied` | Automático · {reason} | Automatic · {reason} | Automatique · {reason} | Automática · {reason} |
| `stateWaived` | Quitado · {reason} | Removed · {reason} | Retiré · {reason} | Removida · {reason} |
| `stateNotApplicable` | No aplica · {reason} | Doesn't apply · {reason} | Non applicable · {reason} | Não se aplica · {reason} |
| `stateOptional` | Opcional · por aceptar | Optional · awaiting answer | Facultatif · à accepter | Opcional · aguardando resposta |
| `reasonMinGuests` | mínimo {n} comensales | minimum {n} guests | minimum {n} couverts | mínimo {n} pessoas |
| `reasonMinAmount` | compra mínima {amount} | minimum spend {amount} | achat minimum {amount} | compra mínima {amount} |
| `reasonTableOf` | mesa de {n}+ | table of {n}+ | table de {n}+ | mesa de {n}+ |
| `remove` | Quitar | Remove | Retirer | Remover |
| `restore` | Restaurar | Restore | Rétablir | Restaurar |
| `accept` | Aceptar | Accept | Accepter | Aceitar |
| `decline` | Rechazar | Decline | Refuser | Recusar |
| `waiveTitle` | Quitar el cargo por servicio | Remove the service charge | Retirer les frais de service | Remover a taxa de serviço |
| `waiveReasonDeclined` | El cliente no lo acepta | The customer doesn't accept it | Le client ne l'accepte pas | O cliente não aceita |
| `waiveReasonCourtesy` | Cortesía de la casa | On the house | Offert par la maison | Cortesia da casa |
| `waiveReasonConfig` | Error de configuración | Setup error | Erreur de configuration | Erro de configuração |
| `waiveReasonOther` | Otro | Other | Autre | Outro |
| `waiveNeedsApproval` | Necesitas la autorización de un supervisor | A supervisor must approve this | L'accord d'un responsable est requis | É preciso a autorização de um supervisor |
| `tipSuggested` | Propina voluntaria sugerida | Suggested voluntary tip | Pourboire facultatif suggéré | Gorjeta voluntária sugerida |
| `tipLaw` | La propina es voluntaria y es de los trabajadores. Puede aceptarla, cambiarla o no darla. | Tipping is voluntary and goes to the staff. You can accept, change or decline it. | Le pourboire est facultatif et revient au personnel. Vous pouvez l'accepter, le modifier ou le refuser. | A gorjeta é voluntária e vai para a equipe. Você pode aceitá-la, alterá-la ou recusá-la. |
| `outsideInvoice` | fuera de la factura | not on the invoice | hors facture | fora da nota fiscal |
| `displayOptionalQuestion` | ¿Desea agregar {name}? | Would you like to add {name}? | Souhaitez-vous ajouter {name} ? | Deseja adicionar {name}? |
| `previewTitle` | Así se verá en la venta | How it will look on a sale | Aperçu dans une vente | Como ficará na venda |
| `looksLikeTip` | Esto parece una propina sugerida. Las propinas no son ingreso del negocio: configúrala en Propinas. | This looks like a suggested tip. Tips aren't business income: set it up in Tips. | Cela ressemble à un pourboire suggéré. Les pourboires ne sont pas un revenu : configurez-le dans Pourboires. | Isto parece uma gorjeta sugerida. Gorjetas não são receita: configure em Gorjetas. |
| `payBlockedOptional` | Decide el cargo opcional antes de cobrar | Decide on the optional charge before charging | Décidez des frais facultatifs avant d'encaisser | Decida a taxa opcional antes de cobrar |

---

## 6. Cambios de backend necesarios (no aplicados)

Todos aditivos, por el MCP de Supabase, con su `.sql` en `supabase/migrations/` y su reversión en
`supabase/rollbacks/` (`docs/POLITICA-MIGRACIONES.md`).

**Esquema**
1. `service_charges`: `tax_id uuid NULL REFERENCES organization_taxes(id)`, `customer_text text NULL`
   (texto para la carta y la pre-cuenta, 140 caracteres), `display_order smallint NOT NULL DEFAULT 0`.
   `is_taxable` se mantiene y se sincroniza con `tax_id`.
2. `sales`: `service_mode text NULL CHECK (service_mode IN ('dine_in','takeout','delivery'))`,
   `guests smallint NULL`, `service_charge_total numeric NOT NULL DEFAULT 0` (neto, sin impuesto).
3. Tabla **`sale_service_charges`**: `id uuid pk`, `organization_id int NOT NULL`, `branch_id int NOT NULL`,
   `sale_id uuid NOT NULL REFERENCES sales ON DELETE CASCADE`, `service_charge_id int NULL REFERENCES
   service_charges ON DELETE SET NULL`, snapshot (`name`, `charge_type`, `charge_value`, `applies_to`,
   `is_optional`), `base_amount`, `amount` (neto), `tax_id uuid NULL`, `tax_name`, `tax_rate`, `tax_amount`,
   `total`, `status text NOT NULL CHECK (status IN ('applied','waived','declined'))`, `reason_code text NULL`,
   `reason_text text NULL`, `decided_by uuid NULL`, `approved_by uuid NULL`, `decided_via text NULL CHECK
   (decided_via IN ('cashier','customer_display','web'))`, `invoice_item_id uuid NULL`,
   `refunded_amount numeric NOT NULL DEFAULT 0`, `created_at timestamptz DEFAULT now()`. `UNIQUE (sale_id,
   service_charge_id)`. RLS de lectura por pertenencia (patrón `IN (SELECT … JOIN)` con
   `(select auth.uid())`); **sin** políticas de escritura: solo escribe la RPC (`SECURITY DEFINER`).
4. `web_orders.service_charge_total numeric NOT NULL DEFAULT 0` (fase 2).
5. `permissions`: `pos.service_charge.waive` y `pos.service_charge.manage` (hoy solo existen `pos_access`,
   `pos.create`, `pos.discount`, `pos.refund`, `pos.view`, `pos.void`).
6. Fase 2: `accounting_rules.service_charge_account_code text NULL`.

**Funciones**
7. `fn_calcular_cargos_servicio(p_org, p_branch, p_service_mode, p_guests, p_lines jsonb, p_tax_included,
   p_decisions jsonb) returns jsonb` — **la única implementación** (§3). `STABLE`, sin escrituras.
8. RPC `pos_service_charges_preview(p_branch_id, p_service_mode, p_guests, p_lines, p_tax_included,
   p_decisions)` — organización desde la sesión (`auth.uid()` miembro activo), nunca del body; devuelve cada
   cargo con estado, motivo, base, importe, impuesto y total. La usan carrito, cobro, pre-cuenta y pantalla
   del cliente. `REVOKE … FROM anon`.
9. `pos_checkout_v1`: clave opcional `service_charges` + `service_mode` + `guests`; recalcula con (7); exige
   `pos.service_charge.waive` para `waived` (del actor o de `approved_by`); valida `ítems + cargos(con
   impuesto) + flete + propina = total`; escribe `sales.service_charge_total`/`service_mode`/`guests`,
   `sale_service_charges` y una línea de `invoice_items` por cargo aplicado (`product_id NULL`,
   `code_reference 'CARGO-SERV'`, `tax_rate`/`tax_code` del cargo); `tax_total` del sobre ya lo incluye.
   Idempotente como el resto de la función (no reinserta si ya existen).
10. Mesas: `completarVentaMesa` deja de escribir en N llamadas y usa la RPC (regla 7).
11. Devoluciones: la RPC/servicio de devolución calcula la parte proporcional (§4) y escribe
    `refunded_amount`; la nota crédito copia la línea.
12. Factus: **sin cambios** en `payloadsFactus.ts` (el cargo ya es una línea). Solo mapear `tax_code` del
    cargo (`01`/`04`).
13. Pantalla del cliente: `DisplayCart.charges: {id, label, amount, state}[]` y el mensaje
    `service_charge_decision` (subida) análogo a `tip_selected`.
14. Semilla y datos: desactivar las 15 «Propina sugerida 10 %» y llevar el 10 % a los porcentajes de
    propina; revisar las 15 «Cargo por delivery» frente al flete (pregunta 3); la semilla de organizaciones
    nuevas deja de crearlas.
15. Base de la propina = base del cargo (§1.6), en `CheckoutDialog` y `tip.ts` (una sola función).

**Tests que deben existir antes del cambio:** los 9 ejemplos de §3 como casos de la función (7), con
`TZ=UTC` y `TZ=America/Bogota` irrelevantes aquí pero con las dos configuraciones de C4; y que
`impuestosLineaCarrito.test.ts` e `impuestosCobroSobre.test.ts` sigan pasando sin cambios.

---

## 7. Figma

Página `05 POS y ventas`, sección nueva **«POS — Cargos de servicio en la venta (propuesta)»** debajo de
«Devoluciones — listado…» (x = 0, y = 141 700). Componentes nuevos en `02 Componentes`. Regla aplicada: lo
aprobado **se clona y solo se le cambia la pieza nueva** (carrito, carrito móvil, cobro, acordeón y
formulario de configuración); lo que no existía se montó con instancias del kit y variables del archivo.

### 7.1 Componentes (`02 Componentes` › sección `878:32062`, x = 66 200, y = 110 000)

| Componente | Node id | Variantes / propiedades |
|---|---|---|
| `CargoServicioFila` | `878:32064` | `Estado=aplicado/quitado/no-aplica/opcional-pendiente` × `Layout=desktop/mobile` (8) · `Mostrar detalle`. Usa `Badge` (tono por estado), `IconButton` (× quitar, ⓘ por qué), `Button` (Restaurar, Rechazar, Aceptar), `Icon/Receipt` |
| `AvisoPropinaVoluntaria` | `878:32120` | `Formato=pantalla/ticket`. Usa `Chip Variant=toggle` (Sin propina · 5 % · 10 % · Otro valor) e `Icon/HandCoins` |

Nota del kit: una propiedad de texto enlazada comparte el valor por defecto entre variantes; por eso
Concepto, Importe y Detalle **no** son propiedades (se sobrescriben en la instancia) y cada variante lleva su
texto de ejemplo.

### 7.2 Pantallas (`05 POS y ventas` › sección `879:110764`, 4 950 × 4 210)

| Frame | Node id | Qué es |
|---|---|---|
| Escritorio / POS — carrito con cargo · aplicado automático | `879:110766` | Clon del aprobado `504:86567`; la fila del cargo pasa a ser `CargoServicioFila` |
| Detalle — Resumen del carrito · Aplicado automático | `879:111806` | Ejemplo 1 ($ 178.200) |
| Detalle — Resumen del carrito · Quitado por el cajero | `879:111854` | Ejemplo 6 ($ 162.000) |
| Detalle — Resumen del carrito · No aplica por mínimo | `879:111909` | Ejemplo 5 ($ 162.000) |
| Detalle — Resumen del carrito · Opcional pendiente | `879:111970` | Empaque para llevar; «Cobrar» bloqueado |
| Móvil / POS v2 — carrito con cargo · aplicado | `879:112023` | Clon del aprobado `250:81432` (+104 px de alto por la fila) |
| Diálogo — Quitar el cargo (obligatorio · con permiso) | `880:112201` | Motivo en chips, detalle, efecto en el total |
| Diálogo — Quitar el cargo (sin permiso · autoriza un supervisor) | `880:112312` | Persona + clave; `decided_by` / `approved_by` |
| Móvil / POS v2 — hoja «Quitar el cargo por servicio» | `880:112435` | Hoja desde abajo, botones a ancho completo |
| Escritorio / POS — cobro con cargo · textos corregidos | `880:112543` | Clon del aprobado `505:86668`: acordeón sin «opcional» y propina «voluntaria (fuera de la factura)» |
| Acordeón «Cargo de servicio» · base de la propina corregida | `880:113910` | Clon de `460:236603`: la propina ya no se calcula «sobre el total de la factura» |
| Documento — Pre-cuenta 80 mm con cargo y propina sugerida | `880:113991` | `LineaRecibo` + `AvisoPropinaVoluntaria Formato=ticket` |
| Diálogo — Pre-cuenta con cargo y propina sugerida | `880:114048` | `CargoServicioFila` + `AvisoPropinaVoluntaria Formato=pantalla` |
| Documento — Ticket 80 mm con cargo (propina aceptada) | `880:114185` | Ejemplo 1 con propina: $ 193.200 pagado |
| Pantalla del cliente — Pedido con cargo (1280 × 800) | `881:113592` | Fila del cargo entre descuento e impuesto |
| Pantalla del cliente — Pregunta del cargo opcional | `881:113631` | «¿Desea agregar el empaque para llevar?» Sí / No |
| Configuración — Nuevo cargo con vista previa «Así se verá en la venta» | `881:113673` | Clon del formulario aprobado `460:236065` (+ `Select` «Impuesto del cargo») y vista previa por escenario |
| Aviso del formulario — el cargo parece una propina | `881:113837` | Para las 15 «Propina sugerida 10 %» |

Cada frame lleva su nota (gris, 12 px) **fuera** del frame, encima.

### 7.3 Chequeo por script

| Comprobación | Resultado |
|---|---|
| Frames y notas de primer nivel que se solapan (34 hijos) | **0** (3 notas multilínea invadían su frame; se subieron) |
| Nodos fuera de la sección · secciones de la página que se solapan con la nueva | **0** · **0** |
| Instancias rotas (`getMainComponentAsync` nulo) | **0** de 780 |
| Textos recortados en piezas nuevas | **0** (la hoja móvil y el formulario clonado recortaban; se pusieron en «abrazar contenido») |
| Textos recortados o truncados en los clones | **Iguales al original aprobado**: carrito y cobro 13 recortes y 21 truncados cada uno (la cuadrícula de productos que sigue bajo el borde, heredada); móvil 0 y 5; acordeón 0 y 0. Ningún recorte nuevo |
| Notas dentro de frames | **0** |

### 7.4 Capturas (`docs/design/figma/`)

| Archivo | Qué muestra |
|---|---|
| `63-pos-cargos-servicio-01-componentes.png` | `CargoServicioFila` (8 variantes) y `AvisoPropinaVoluntaria` |
| `63-pos-cargos-servicio-02-seccion.png` | La sección completa (18 frames) |
| `63-pos-cargos-servicio-03-carrito-escritorio.png` | Carrito aprobado con la fila del cargo |
| `63-pos-cargos-servicio-04-resumen-aplicado.png` | Resumen, estado aplicado (ejemplo 1) |
| `63-pos-cargos-servicio-05-resumen-opcional-pendiente.png` | Resumen, opcional pendiente con «Cobrar» bloqueado |

### 7.5 Pendiente — **se agotó el cupo del MCP de Figma**

1. Capturas individuales que no salieron (los frames sí están hechos y se ven en la `02-seccion`): móvil
   `879:112023`, quitar sin permiso `880:112312`, cobro `880:112543`, pre-cuenta `880:114048`, ticket
   `880:114185`, pantalla del cliente `881:113592` y `881:113631`, configuración `881:113673`.
2. **(Resuelto el 2026-09-24, ver §7.6.)** En el clon del carrito de escritorio (`879:110766`) el carrito heredado es una venta de mostrador de una
   tienda (zapatillas); la nota de la fila dice «Mesa 4 · 8 comensales». Para que cuadre: cambiar el detalle
   a «Comer aquí · 8 comensales» o clonar el carrito de mesa cuando se apruebe la cuenta de mesa sobre
   `CartPanel` (`POS-CARRITO-LINEAS-NOTAS.md`). El orden heredado del resumen (el descuento debajo de los
   impuestos) es el del frame aprobado; los detalles de estado (`879:111806`…) ya muestran el orden propuesto.
3. Traducciones: los frames están en español; la tabla de §5 es la fuente de los cuatro idiomas.

### 7.6 Alineación de la fila del cargo en el resumen (pedido del dueño, 2026-09-24)

El dueño señaló (con captura) que, en el carrito con el cargo aplicado, la fila del cargo no seguía la
retícula del resumen. Lo que había (medido en `879:110833`):

| | Filas del resumen aprobado (Subtotal, Impuestos, Descuento) | Fila del cargo (antes) |
|---|---|---|
| Alto | 16 px, separación 4 px | 50 px (fila de 32 px + detalle de 12 px + relleno) |
| Etiqueta | 12 Regular, color de etiqueta, empieza en x = 0 | 12 Semi Bold azul, precedida de un icono de recibo (empezaba en x = 20) |
| Importe | 12 Medium, alineado a la derecha en x = 535 | 12 Semi Bold azul, empujado 32 px a la izquierda por el botón «×» |
| Fondo | ninguno | caja tintada con radio |
| Estado | — | badge de 22 px con el motivo largo («Automático · mesa de 8+») |
| «Nuevo» | — | badge suelto entre «Base gravable» e «Impuesto general» |

Arreglo, **en el componente** `CargoServicioFila` (`878:32064`, las 8 variantes), para que se propague a
todas las instancias:

- Misma retícula que las demás filas: etiqueta 12 Regular con el color de etiqueta en x = 0, importe 12
  Medium alineado a la derecha en el mismo borde, **16 px de alto** y la separación de 4 px del resumen. Sin
  fondo ni icono inicial.
- Estado en `Badge` del kit (`Size=sm`, tono por estado) compactado a 16 px, con una sola palabra:
  «Automático» · «Quitado» · «No aplica» · «Opcional». El porqué pasó al **tooltip del icono ⓘ** (`Tooltip`
  del kit, `32:1050`), que va pegado a la etiqueta.
- «×» de quitar pegada a la etiqueta, con el mismo patrón que el «Descuento general ✕» aprobado (`283:35573`),
  en gris neutro (no rojo: no es un descuento). «Restaurar» (quitado) y «Rechazar · Aceptar» (opcional, en
  escritorio) son enlaces de 12 px en ese mismo sitio; en móvil los botones de decidir van en una segunda
  línea, porque son táctiles.
- Detalle: propiedad «Mostrar detalle» con valor por defecto **apagado**. Encendida, es una segunda línea
  11/14 en texto secundario, alineada con la etiqueta, sin huecos. Se deja encendida donde el texto le sirve
  al que lee: pre-cuenta (la lee el cliente), los cuatro detalles de estado y los diálogos de quitar.
- Badge «Nuevo» suelto: **se quitó** del resumen (la nota del frame ya dice que la fila es nueva).
- Ejemplo coherente: el carrito clonado es una venta **de mostrador** de una tienda. La fila ya no dice
  «Mesa 4 · 8 comensales»: el tooltip dice «Ventas de mostrador desde $ 300.000 · 10 % antes de impuestos ·
  Impuesto general 19 %» (`applies_to = all` con `min_amount`, que la regla de §2.1 admite). Como el cargo
  obligatorio va gravado (§1.5), se corrigieron los importes que no lo sumaban: IVA del cargo $ 7.820 →
  Impuesto general $ 84.123, Total impuestos $ 86.023, **Total $ 528.780** (escritorio y móvil; la pestaña
  pasa a $ 529k). En el móvil el cargo decía $ 15.000 y el total no lo sumaba; ahora son $ 41.160 y
  $ 528.780. En el cobro (`880:112543`), la fila del cargo ya estaba en la retícula pero en negrita azul:
  pasa al estilo de las demás, y el impuesto y el total a pagar suben igual ($ 595.760).
- Lo heredado del frame aprobado que **no** se tocó: el orden «Descuento» debajo de los impuestos y que el
  cobro no reste el descuento (los dos vienen del aprobado `504:86567` / `505:86668`).

Comparación en Figma, dentro de la sección `879:110764`: **«Comparación — fila del cargo en el resumen ·
antes / después»** (`886:140214`). «Antes» es una copia congelada (instancias desancladas) de los resúmenes
de escritorio, móvil, cobro y pre-cuenta. «Después» son copias vivas y el tooltip del ⓘ.

| Pieza | Node id |
|---|---|
| Componente `CargoServicioFila` (8 variantes, 16 px) | `878:32064` |
| Resumen del carrito de escritorio (corregido) | `879:110833` (frame `879:110766`) |
| Resumen del carrito móvil (corregido) | `879:112058` (frame `879:112023`) |
| Totales a pagar del cobro (corregido) | `880:112666` (frame `880:112543`) |
| Resumen de la pre-cuenta (por el componente) | `880:114059` (frame `880:114048`) |
| Comparación antes/después | `886:140214` (Antes `886:140215`, Después `886:140461`) |

**Pendiente por cupo del MCP de Figma:** las capturas `63-pos-cargos-servicio-alineado-*.png` (antes/después
`886:140214` y componente `878:32064`) y el chequeo por script de esta sección.

---

## 8. Preguntas para el dueño (con recomendación)

> **Respondidas el 2026-09-24:** las 9 se aprobaron como se recomendaba. Ver §9. La 10 (validación legal y
> contable) sigue abierta.

1. **¿Las 15 «Propina sugerida 10 %» se desactivan y pasan a porcentajes de propina?** Recomiendo **sí**: si
   se aplicaran como cargo, una propina entraría como ingreso gravado del restaurante.
2. **Cargo opcional: ¿lo dejamos existir?** Recomiendo **sí, pero solo para servicios reales** (empaque,
   descorche) y con el aviso «parece una propina» en el formulario.
3. **«Cargo por delivery» ($ 5.000) y el flete:** hoy el flete ya cobra el domicilio (544 ventas). ¿El cargo
   se suma al flete o lo reemplaza? Recomiendo **que el domicilio se cobre solo como flete** y desactivar esos
   15 cargos; `applies_to = delivery` queda para cosas como el empaque.
4. **Mostrador de restaurante: ¿preguntamos «Comer aquí / Para llevar»?** Recomiendo **sí, solo a
   organizaciones con el módulo de mesas**, por defecto «Para llevar» (así no se cobra servicio a quien no
   se sienta).
5. **¿Quién puede quitar un cargo obligatorio?** Recomiendo el permiso nuevo `pos.service_charge.waive`
   (administrador y supervisor por defecto) y, sin él, autorización de un supervisor en el mismo diálogo.
6. **Base de la propina sugerida:** recomiendo **antes de impuestos y sin el cargo** (tope del 10 % de la SIC).
   Hoy es el total con impuestos.
7. **Devolución parcial:** recomiendo devolver la parte proporcional del cargo porcentual y el fijo solo en
   devolución total.
8. **Contabilidad:** ¿basta en la fase 1 con que el cargo entre al ingreso de ventas y se reporte aparte, o se
   necesita cuenta propia desde el día uno? Recomiendo **fase 1 en la misma cuenta**; la cuenta propia exige
   asientos multilínea.
9. **Pedidos web:** ¿entran en la primera entrega? Recomiendo **fase 2**: primero POS y mesas, que es donde
   está el caso de uso (mesa grande).
10. **Validación legal y contable:** el trato del cargo obligatorio (gravado con Impoconsumo) y el aviso de la
    Ley 1935 conviene revisarlos con el contador y el asesor legal antes de salir a producción.

---

## 9. Decisiones del dueño — 2026-09-24

### 9.1 Las nueve decisiones y qué cambia en la especificación

| # | Decisión | Estado en la base (verificado con `SELECT` el 2026-09-24) | Qué cambia en este documento |
|---|---|---|---|
| 1 | Se desactivan las 15 «Propina sugerida 10 %» y su 10 % pasa a la propina sugerida del cobro | **Hecho**: las 15 están `is_active = false` | §6 #14, parte 1, queda hecha. El 10 % ya está en los porcentajes por defecto de propina (`settingsSchema.ts:69`, `[5, 10, 15]`; el cobro usa `[5, 10, 15, 20]`, `CheckoutDialog.tsx:2359`). No hay que migrar datos, pero **15 % y 20 % superan el tope de la decisión 6** (hueco H9). La semilla de organizaciones nuevas debe dejar de crearlas |
| 2 | El cargo opcional existe solo para servicios reales (empaque, descorche) y el formulario avisa si parece propina | Sin cargos opcionales activos | El aviso `looksLikeTip` (§5, frame `881:113837`) es **obligatorio** en el formulario, no una sugerencia. Regla del aviso: opcional + porcentual + sin impuesto, o nombre que contenga «propina» o «tip» |
| 3 | El domicilio se cobra solo como flete | **Hecho**: los 15 «Cargo por delivery» están `is_active = false` | `applies_to = delivery` queda solo para cosas como el empaque (ejemplo 4). El formulario avisa si se crea un cargo fijo de domicilio sin impuesto («¿Es el flete? El domicilio se cobra en Entrega») |
| 4 | El mostrador pregunta «Comer aquí / Para llevar» solo en organizaciones con mesas, «Para llevar» por defecto | — | Sin cambios frente a §1.3 (ya lo proponía). «Tiene mesas» = módulo de mesas activo en `organization_modules`; no se cablea por tipo de negocio |
| 5 | Quitar un cargo obligatorio pide el permiso nuevo (administrador y supervisor por defecto) o la autorización de un supervisor en el mismo diálogo | — | §2.3 se mantiene. El «mismo diálogo» es ahora el componente compartido **AutorizacionSupervisor** (`893:582887`) de `POS-AUTORIZACION-SUPERVISOR.md`. Esta acción queda **siempre protegida**, aunque el interruptor general «Autorizaciones del POS» esté apagado |
| 6 | Propina sugerida antes de impuestos y sin el cargo | — | §3 paso 11 y §6 #15 quedan como regla. Además, los porcentajes que se ofrecen no pueden pasar del 10 % (H9) |
| 7 | Devolución parcial: parte proporcional del cargo porcentual; el fijo, solo en devolución total | — | Sin cambios frente a §4 y el ejemplo 9 |
| 8 | Fase 1 en la misma cuenta de ingreso; cuenta propia después | — | §1.8 fase 1 es lo aprobado. `accounting_rules.service_charge_account_code` pasa a fase 2 |
| 9 | Pedidos web en fase 2 | — | `web_orders.service_charge_total` y la vista previa en el sitio salen de la primera entrega |

### 9.2 ¿Queda registrado en todo? Flujo de datos, paso a paso

**Sí: con la especificación de §6 el cargo llega al cobro, a la factura, a la cartera y a la contabilidad.**
Pero dos de esos pasos no leen las líneas, sino los totales que la RPC escribe al insertar (H1 y H2 en §9.3).
Por eso la RPC tiene que calcular los totales **con el cargo incluido antes** de insertar `sales` e
`invoice_sales`; no le basta con insertar la línea al final. Orden real de `pos_checkout_v1` (leído en la
base) y qué pasa con el cargo en cada paso:

| Paso de la RPC | Qué se escribe | Cómo entra el cargo | Disparadores que se ejecutan |
|---|---|---|---|
| §3 Validación | — | `ítems + cargos (con impuesto) + flete + propina = total`, con los cargos recalculados por `fn_calcular_cargos_servicio` (nunca los importes del navegador) | — |
| §4 Venta | `sales` | `total` incluye el cargo con su impuesto; `tax_total` incluye el impuesto del cargo; `service_charge_total` = neto del cargo. **`subtotal` sin el cargo** (ver H4) | `trg_auto_journal_sale_pos` (diferido al final de la transacción) · `trg_create_commission_on_sale` |
| (nuevo) Cargos | `sale_service_charges` | Snapshot: estado, base, importe, impuesto, motivo, quién decidió y quién autorizó | — |
| §9 Factura | `invoice_sales` | `total = v_total` y `tax_total = v_tax_total`, **ya con el cargo** | `tr_create_account_receivable` → **cartera** con `amount = total` y `balance`. `trg_auto_journal_sale` → **asiento de la venta**, clave `accrual:sale:<id>` |
| §10 Cobro | `payments` (uno por medio de pago) | El cliente paga el total que incluye el cargo. En efectivo, el cargo entra al cuadre de caja | `fn_recalc_invoice_balance_from_payments` → saldo de la factura · `update_accounts_receivable_on_payment` → saldo de la cartera · `trg_auto_journal_payment` → asiento del cobro |
| §11 Líneas | `invoice_items`: las de productos **+ una por cargo aplicado** (`product_id NULL`, `code_reference 'CARGO-SERV'`, `tax_rate` y **`tax_code` explícitos** del `tax_id` del cargo) | Es lo que manda en la factura | `trg_normalizar_impuesto_linea` (audita la coherencia de la línea) · `fn_recalc_invoice_totals` → **pisa `invoice_sales.subtotal/tax_total/total/balance` con la suma de líneas**. Si el saldo cambia, `tr_update_account_receivable` actualiza la cartera |
| Factura electrónica | `payloadsFactus.construirFactura` | La arma solo con `invoice_items`: el cargo viaja como línea, con su impuesto (`01` o `04`) | — |
| Fin de la transacción | — | — | `trg_auto_journal_sale_pos` encuentra la clave `accrual:sale:<id>` ya creada y **no** hace otro asiento |

Resultado por destino:

| Destino | ¿Registra el cargo? | Dónde se ve |
|---|---|---|
| Cobro | Sí | `payments` suma el total con el cargo; el cierre de caja lo cuadra con el efectivo. Detalle en `sale_service_charges` |
| Factura de venta | Sí, como línea | `invoice_items` (`CARGO-SERV`); `invoice_sales.total` lo incluye por el trigger |
| Factura electrónica | Sí, como línea con su impuesto | Sin cambios en `payloadsFactus.ts` |
| Cuentas por cobrar (venta a crédito o con saldo) | Sí | `accounts_receivable.amount` y `balance` salen de la factura por trigger. Hoy, en 844 facturas de POS con saldo, **0** tienen la cartera descuadrada con la factura |
| Contabilidad | Sí, dentro del ingreso de ventas (decisión 8) | Asiento `accrual:sale:<id>`: débito a la cuenta de cartera de la regla `sale_payment` por el total, crédito a ingresos por `total − impuesto`, crédito al impuesto por `tax_total` (si la regla usa el impuesto del documento). Luego el asiento del cobro mueve la cartera a caja o banco. Los reportes del cargo salen de `sale_service_charges` |
| Comisiones | **No debe entrar** | `fn_create_commission_on_sale` usa `sales.subtotal` (H4) |
| Devolución / nota crédito | Sí, si se implementa §6 #11 | Línea «Devolución: Cargo por servicio» en la nota; el asiento de la nota (`fn_auto_journal_credit_note`) toma el total de la nota al insertarla (H5) |

### 9.3 Huecos encontrados (con evidencia; ninguno se corrigió aquí)

| # | Hueco | Evidencia | Qué exige a la implementación |
|---|---|---|---|
| H1 | El asiento de la venta se crea en el **INSERT de la factura** (§9 de la RPC) con `NEW.total` y `NEW.tax_total`, **antes** de que existan las líneas (§11). El recálculo posterior de la factura por trigger **no** corrige el asiento, y el asiento diferido de `sales` no crea otro porque la clave ya existe | Hoy el asiento coincide con `sales.total` en 2 564 de 2 567 ventas de POS con asiento, pero **no** con la factura en 82 (flete y propina) | La RPC recalcula `v_total` y `v_tax_total` **con el cargo antes de §4**. Si solo añade la línea en §11, el asiento se queda sin el cargo o con su impuesto contado como ingreso |
| H2 | La cartera copia `invoice_sales.total` **al insertar** y solo se actualiza si cambia el saldo o el estado. En una venta pagada (saldo 0 antes y después), si el recálculo por líneas cambia el total, la cartera se queda con el importe viejo | **224** de 3 427 carteras de POS tienen `amount` distinto del total de su factura; 215 de ellas son ventas con flete o propina | Mismo remedio que H1: `v_total` = suma exacta de las líneas que se van a insertar (productos + cargos). Con eso no se desalinea. Arreglar las 224 y el flete es otra tarea (§1.10 #1) |
| H3 | Con `product_id NULL`, `fn_normalizar_impuesto_linea` deduce el código del impuesto **por la tarifa** (primera plantilla del país con esa tarifa) | `fn_codigo_impuesto_linea`: sin producto busca por `tax_templates.rate` | La RPC escribe `tax_code` explícito, sacado del `tax_id` del cargo (`01` impuesto general, `04` Impoconsumo) |
| H4 | La comisión del vendedor se calcula sobre `sales.subtotal` | `fn_create_commission_on_sale`: `ROUND(COALESCE(NEW.subtotal, NEW.total) × rate)` | `sales.subtotal` **sin** el cargo (el cargo va en `service_charge_total`). Si el dueño quiere comisión sobre el cargo, es una decisión aparte |
| H5 | Las devoluciones arman la nota crédito desde `sale_items` en el navegador (`devolucionesService.ts:619`, `:1282`, `:1343`). El cargo no es un `sale_item`: sin cambios, **no se devuelve** | Código | La devolución (que ya está pasando a RPC) añade la línea proporcional del cargo, escribe `refunded_amount` e inserta la nota con el total que ya la incluye (mismo patrón que H1) |
| H6 | «Anular venta» (`VentasService.cancelSale`, `VentasService.ts:640`) solo pone `status = 'void'` desde el navegador: no revierte pagos, cartera, inventario ni asiento | Código; `// TODO: Registrar en audit_log` en `:675` | Preexistente, con o sin cargo. Lo cubre la tarea de anulación (ver `POS-AUTORIZACION-SUPERVISOR.md`) |
| H7 | «Anular deuda» (`POSService.cancelDebtWithCreditNote`, `posService.ts:2681`) crea la nota crédito desde el navegador | Código | La nota debe copiar la línea del cargo |
| H8 | El cobro de mesa (`completarVentaMesa`) es una segunda implementación en N llamadas desde el navegador | §1.2 | Sin pasarlo a la RPC, el cargo de mesa (el caso de uso principal) no llega de forma consistente a factura ni a asiento |
| H9 | Los porcentajes de propina que se ofrecen pasan del 10 %: el cobro ofrece `[5, 10, 15, 20]` (`CheckoutDialog.tsx:2359`) y la pantalla del cliente usa por defecto `[5, 10, 15]` (`settingsSchema.ts:69`) | Código | Con la decisión 6, tope de 10 % en los porcentajes sugeridos (el cliente puede escribir otro valor si quiere) |
| H10 | Los pedidos web meterían la propina como línea de la factura (`webOrderTotals.ts:191-202`) | 0 casos hasta hoy | Fase 2 (decisión 9), junto con el cargo |

### 9.4 Figma

- Realineación de la fila del cargo: §7.6.
- Quitar el cargo sin permiso: el bloque «Autoriza un supervisor» del diálogo `880:112312` queda
  **reemplazado** por el componente compartido `AutorizacionSupervisor` (`893:582887`). En la sección de
  autorizaciones, la instancia «bloqueado» (`896:114530`) usa esta acción de ejemplo.
