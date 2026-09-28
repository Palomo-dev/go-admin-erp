# Comisiones e impuestos — hallazgos y correcciones (2026-09-28)

Verificados leyendo el código y por MCP contra la base (`jgmgphmzusbluqhuqihj`).
Conteos sin datos personales; las organizaciones se nombran por id.

## A. Comisiones

### A1 · El disparador de la venta rompía el cobro y no conocía el método

- `fn_create_commission_on_sale` insertaba `payee_id = salesperson_id::text` en
  una columna `uuid`. Reproducido llamando a `pos_checkout_v1` con un vendedor en
  un `DO … RAISE EXCEPTION`: **el cobro entero fallaba** (42804). El mismo cast
  estaba en `fn_create_commission_on_invoice_sale`.
- Calculaba siempre `subtotal × tasa / 100`. Con monto fijo (el POS guarda el
  monto en `commission_rate` y `commission_method = 'fixed_amount'`), 5.000 se
  habría devengado como 5.000 %. Disparaba antes del paso 6 de la RPC, que
  omitía la suya.
- El disparador de la factura solo deduplicaba contra `invoice_sale`: la deuda
  del POS (comisión `sale`) se habría devengado otra vez al cobrarse la factura.
- **Daño en datos: 0.** 232 comisiones; las 228 `invoice_sale` (orgs 113, 115,
  125, 132) las escribió el cliente/la RPC con el método correcto (71 de monto
  fijo con monto = tasa, 157 de porcentaje con monto = base × tasa); la única
  `sale` es de porcentaje y cuadra. Ninguna venta pasó por el disparador roto
  porque ninguna pudo terminar. Una factura emitida con vendedor y sin comisión
  (1) habría fallado al registrar su pago.
- Corrección: `20260928170000_comisiones_una_sola_fuente_por_venta`. La RPC que
  conoce el método es la fuente; el disparador de la venta es un respaldo
  diferido al commit que solo actúa si nadie devengó.

### A3 · Cancelar no revertía el asiento; pagar no sabía de qué cuenta salía

- `fn_auto_journal_commission` ignoraba `cancelled`: rechazo, clawback y la
  anulación del POS (`pos_anular_venta_v1`) dejaban vivo el devengo (y el pago).
- El pago acreditaba la cuenta fija de la regla (1110 en 77 organizaciones,
  1101 en 12) y `buildTransitionPatch('pay')` no guardaba quién pagó.
- **Daño en datos: 0.** Las 232 comisiones están `accrued` con su asiento de
  devengo; no hay canceladas ni pagadas.
- Corrección: `20260928171000_comisiones_contra_asiento_y_pago_con_cuenta`
  (contra-asiento con `fn_revertir_asiento_en_fecha`, ADR-CC-012; pago contra la
  cuenta elegida; `paid_by` / `cancelled_by`). Probado en transacción deshecha:
  pago en efectivo → 2370 D / 1105 C; clawback → dos contra-asientos exactos;
  segunda cancelación → sin duplicar.

#### Por qué el pago aún no crea un egreso en tesorería

Se evaluó y **no se hace ahora**:

1. `payments` no tiene dirección. Los lectores separan salidas por lista fija de
   orígenes de compra y todo lo demás lo cuentan como ingreso:
   `CajasService.ts` (efectivo de ventas: `PURCHASE_SOURCES = ['invoice_purchase',
   'account_payable']`), `reportesService.getPaymentMethodsReport` (sin filtro de
   origen) y `revenueOs/kpiCards.ts` (sin filtro). Un pago con origen
   `commission` inflaría ventas en caja, métodos de pago y KPI.
2. `bank_transactions` y `cash_movements` generan su propio asiento con la regla
   genérica (`fn_auto_journal_bank`, `fn_auto_journal_cash_movement`): sumado al
   asiento del pago de la comisión, la cuenta de dinero se acreditaría dos veces.
3. La sesión de tesorería está rehaciendo el saldo bancario por movimientos
   (`20260928160000`, `20260928161000`). Encadenar ahí un tercer escritor antes de
   cerrar ese diseño es la receta del doble conteo.

Hoy el asiento del pago ya refleja la salida real (cuenta elegida) y la comisión
guarda `payment_method`, `bank_account_id`, `payment_reference` y `paid_by`, que
bastan para generar el movimiento cuando tesorería defina el egreso a terceros.

### Otros hallazgos vistos al pasar (no corregidos aquí)

- `commissions` tiene la política `commissions_org_member_all` (ALL para
  cualquier miembro): un vendedor puede, por API, cambiar el estado o el importe
  de sus comisiones. Las rutas exigen admin/manager, pero la tabla no.
- `fn_factura_venta_anular` no cancela la comisión de la factura: hay 2 facturas
  anuladas con su comisión devengada.
- `crm/paymentService.ts` devenga una comisión de oportunidad al pagar la
  factura, sobre el total CON impuestos y siempre por porcentaje; si la factura
  también tiene vendedor, son dos comisiones por la misma venta.

## B. Impuestos

### B7 · Producto exento cobrado con la tarifa por defecto

- `taxResolverCore.ts`, paso 3: un producto relacionado con un impuesto activo de
  tarifa 0 caía al paso 4 (tarifa por defecto). `tax_templates!inner` descartaba
  los impuestos personalizados (`template_id` NULL) en los pasos 3 y 4.
- `posService.ts` (cobro): una línea con tasa 0 —la que ya calculó el carrito—
  volvía a consultar el resolver sin `itemTaxIsFinal`; un carrito todo exento se
  cobraba al 19 % en una organización con tarifa por defecto.
- **Daño en datos: 0.** Solo la organización 2 tiene tarifa por defecto activa
  (IVA 19 %); solo un producto (organización 120) está relacionado con un
  impuesto de tarifa 0 y no tiene líneas vendidas. No hay impuestos
  personalizados hoy (0 filas con `template_id` NULL).
- Corrección: relación explícita a impuestos activos ⇒ su suma, también 0 (sin
  advertir); join izquierdo con la plantilla; el cobro marca como definitiva la
  tarifa que ya decidió el carrito (`tax_rate` y `tax_amount` presentes).
- **«Sin relación» no cambia:** un producto sin impuesto configurado toma la
  tarifa por defecto de la organización. Evidencia: `TarifaPorDefectoCard.tsx`
  y `defaultTaxService.ts` documentan la tarifa por defecto exactamente para eso
  («productos sin impuesto configurado»), y `taxCoverage.ts` no advierte en ese
  caso. Queda fijado en `taxResolverExento.test.ts`.
- La semántica de «Excluir impuesto», «Incluido» e «Impuestos incluidos» no se
  tocó: `impuestosLineaCarrito.test.ts` e `impuestosCobroSobre.test.ts` pasan
  igual.
- Visto al pasar: el paso 3 SUMA todas las tarifas relacionadas; si alguien
  relaciona un producto con RETE_4/RETE_11 o ICA (hoy 0 relaciones), la
  retención se sumaría como impuesto de la línea.
