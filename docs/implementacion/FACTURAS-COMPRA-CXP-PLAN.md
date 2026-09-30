# Facturas de compra y cuentas por pagar: plan de implementación del rediseño

Fecha: 2026-09-24 · Fase de **análisis** (solo lectura: código, capturas y `SELECT` por el MCP de Supabase).
Etiqueta de respaldo, ya creada: `backup/antes-rediseno-pos-finanzas-2026-09-24`.
Figma: «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`). No se usó el MCP de Figma: se trabajó
con los documentos de diseño y las capturas PNG de `docs/design/figma/`. Donde falta un id, va anotado.

Encargo del dueño: construir en código el rediseño de **facturas de compra** y **cuentas por pagar**, con
componentes del kit reutilizados al máximo, en 4 idiomas, completamente funcional, **sin romper nada** y
con los PDF incluidos.

La evidencia se da en conteos. Las organizaciones se nombran por id, nunca por nombre.

---

## 0. Resumen: lo que hay que saber antes de tocar nada

1. **«Confirmar factura» no mete inventario.**
   - El botón de borrador (`DetalleFacturaCompra.tsx:491-497`) llama a la RPC `confirm_purchase_invoice`.
   - Esa RPC pasa la factura a `received` sin tocar el kardex.
   - Con la factura en `received`, el botón «Recepcionar» deja de verse (`:434`): **esa mercancía no entra nunca**.
   - En la base, **2 facturas recibidas con productos no tienen movimientos de kardex**.
2. **El impuesto de la compra se pierde al guardar.**
   - El formulario escribe `total_line` **sin impuesto** (`FacturasCompraService.ts:318,331`).
   - El disparador `fn_recalc_invoice_totals` recalcula la cabecera con `SUM(total_line)`: `tax_total` queda en 0 y el total queda sin IVA.
   - `fn_normalizar_impuesto_linea` ya registra ese caso en `invoice_item_tax_audit`, como `total_line_incoherente`.
   - Caso real, org 134: línea gravada al 19 %, total guardado sin IVA y cuenta por pagar en **$0**.
3. **La cuenta por pagar se crea a mano desde el navegador, y si falla no se avisa** (`FacturasCompraService.ts:396-412`).
   - Ningún disparador la crea.
   - 1 factura recibida del 2026-09-23 (org 149) **no tiene cuenta por pagar**. Otras 2 facturas tampoco.
4. **CxP y factura no cuadran:**
   - **20 de 57** cuentas tienen `amount` distinto del total de su factura.
   - **14** tienen un saldo distinto al de la factura.
   - Diferencia acumulada: **$1.535.635**.
   - Hay **23 facturas sin líneas**; 22 de ellas con total 0 y una cuenta por pagar con importe real.
5. **Asientos contra factura:**
   - **18** asientos de devengo no cuadran con el total de su factura.
   - **8 facturas en borrador tienen un asiento de compra contabilizado.**
   - Ningún asiento se toca a mano. La corrección se hace por reversión (`FINANZAS-CONTABILIDAD-FIGMA.md` §2): ver §5.3.
6. **Costos:**
   - La recepción de una factura **no escribe `product_costs`**: 19 de los 21 productos recibidos por factura no tienen un costo nuevo.
   - Además, `product_costs` **no tiene política de UPDATE**: desde el navegador no se puede cerrar una vigencia.
   - El costo solo puede ir en una RPC.
7. **Hay tres implementaciones de «registrar factura de compra» que divergen**, en contra de la regla 7:
   - El formulario, escrito desde el navegador.
   - `assistant_register_purchase_invoice`, la RPC del GO Assistant: moneda por defecto `USD`, sin costo, sin `unit_cost` en kardex.
   - `generateInvoiceFromPurchaseOrder` de órdenes de compra: sin `po_id` e impuesto 0. **0 facturas tienen `po_id`.**
8. **El bug conocido de aprobación sigue vivo.**
   - `aprobarPago` y `rechazarPago` escriben el comentario del supervisor **sobre `payments.reference`** (`CuentasPorPagarService.ts:669-672` y `:725-728`).
   - Ahí mismo vive la fecha programada, porque no tiene columna propia (`:454`).
   - Además aprueba cualquiera: no hay permiso ni segregación de funciones.
9. **No existe ninguna comprobación de permisos** en estas pantallas ni en sus servicios, y no hay *route handlers*: todo va desde el navegador con `@/lib/supabase/config`.
10. **El PDF de compra no es un PDF.**
    - `downloadPurchaseInvoicePDF` descarga un `.html`.
    - No hay estado de cuenta del proveedor, ni comprobante de egreso, ni recibo de pago en PDF.
11. **Ninguno de los componentes de documento del diseño existe todavía en código**: `DocumentHeader`, `DocumentLinesTable`, `DocumentTotals`, `RegistrarPagoDialog`, `SupplierPicker`, `DocumentoImpreso` y `ViewToggle`.
    - Son compartidos con facturas de venta, CxC, órdenes de compra, cotizaciones, documento soporte y cajas.
    - Hay que construirlos **una vez**, coordinando con la sesión que haga venta y CxC (§3.1).

---

## 1. Inventario actual

### 1.1 Rutas

| Ruta | Archivo | Monta |
|---|---|---|
| `/app/finanzas/facturas-compra` | `src/app/app/finanzas/facturas-compra/page.tsx` | `FacturasCompraPage` |
| `/app/finanzas/facturas-compra/nuevo` | `…/nuevo/page.tsx` | `NuevaFacturaForm` |
| `/app/finanzas/facturas-compra/[id]` | `…/[id]/page.tsx` | `DetalleFacturaCompra` |
| `/app/finanzas/facturas-compra/[id]/editar` | `…/[id]/editar/page.tsx` | `EditarFacturaCompra` |
| `/app/inventario/facturas-compra/**` | `src/app/app/inventario/facturas-compra/**` (4 páginas) | **los mismos componentes**; `basePath` se deduce de la URL |
| `/app/finanzas/cuentas-por-pagar` | `src/app/app/finanzas/cuentas-por-pagar/page.tsx` | `CuentasPorPagarPage` |
| `/app/finanzas/cuentas-por-pagar/[id]` | `…/[id]/page.tsx` | `CuentaPorPagarDetailPage` |
| `/app/finanzas/cuentas-por-pagar/[id]/cuotas` | `…/[id]/cuotas/page.tsx` | `CuotasPage`: ruta huérfana, nadie la enlaza (PARIDAD-CARTERA §5 C.5) |
| `/app/finanzas/documentos-soporte/**` | `src/app/app/finanzas/documentos-soporte/**` | documento soporte (§1.7) |
| `/app/inventario/ordenes-compra/**` | `src/app/app/inventario/ordenes-compra/**` | órdenes de compra (origen de facturas, §1.3.5) |
| `/app/inventario/proveedores/[id]` | `src/app/app/inventario/proveedores/[id]/page.tsx` | ficha del proveedor, con sus facturas y su CxP |

Enlaces rotos que salen de estas pantallas, verificados en disco:

- `/app/inventario/entradas/nueva?factura_id=`: el «Recepcionar» del menú de fila (`FacturasCompraTable.tsx:113`). La ruta no existe.
- `/app/finanzas/proveedores`: el botón «Proveedores» (`FacturasCompraPage.tsx:86`). La ruta no existe. Según la decisión D4 de PARIDAD-FACTURAS, los proveedores viven en Inventario.

### 1.2 Componentes de hoy: qué leen y qué escriben

Todo es `'use client'`. Ningún texto pasa por next-intl: `useTranslations` no aparece en ninguno de los dos directorios.

**Facturas de compra** (`src/components/finanzas/facturas-compra/`)

| Archivo (líneas) | Lee | Escribe / llama |
|---|---|---|
| `FacturasCompraPage.tsx` (87) | — | enlaces; `:86` enlace roto |
| `PageHeader.tsx` (95) | — | `router.push(nuevo)` |
| `FacturasCompraFiltros.tsx` (231) | `obtenerProveedores` (todos los proveedores, sin límite) | filtros: estado, proveedor, fechas y búsqueda |
| `FacturasCompraTable.tsx` (415) | `obtenerFacturas` (`:69`), paginación fija de 10 | `eliminarFactura` (`:98`, con `alert` en `:102`); «Recepcionar» apunta a una ruta rota (`:113`); fechas con `parseLocalDate` sobre `timestamptz` (`:139,265,279,282`) |
| `FacturasProximasVencer.tsx` (287) | `obtenerFacturasProximasVencer` (`:48`; `fechaLimite.toISOString()`, día UTC) | botón de pago sin `onClick` |
| `nueva-factura/NuevaFacturaForm.tsx` (≈790) | proveedores, métodos de pago y monedas (`:215-217`) | `crearFactura` (`:497`); `.split('T')[0]` sobre `timestamptz` (`:113-114`) |
| `nueva-factura/InformacionBasicaForm.tsx` (359) | — | número `COMP-AAAA-NNNN`, fechas (`parseLocalDate` en `:193`) |
| `nueva-factura/ItemsListForm.tsx`, `SelectedProductsTable.tsx`, `ManualItemDialog.tsx` | `ProductSearchDialog` modo compra (`src/components/shared/product-search/`) | líneas y seriales |
| `nueva-factura/ImpuestosFacturaCompra.tsx` (266) | impuestos de la organización | `appliedTaxes`, que se guarda con `tax_rate: 0` (0 filas en la base) |
| `nueva-factura/SupplierSelector.tsx` (301) | proveedores | alta rápida de proveedor (`crearProveedor`) |
| `nueva-factura/ResumenFactura.tsx`, `FormActions.tsx` | — | totales calculados en el cliente (`_calculatedTotals`) |
| `editar/EditarFacturaCompra.tsx` (165) | `obtenerFacturaPorId` | `actualizarFactura` (`:70`) |
| `id/DetalleFacturaCompra.tsx` (≈730) | factura, CxP y pagos (`:142,160,173`) | `recepcionarInventario` (`:201`); `confirmarFactura` (`:295`, solo cambia el estado); PDF (`:218-289`, payload duplicado); `alert` en `:305`; «Registrar pago» **de pruebas** en borrador (`:475-487`); «Recepcionar» también en `partial` (`:434`) |
| `id/AnularFacturaCompraDialog.tsx` (122) | — | `anularFactura` → RPC `fn_void_purchase_invoice` |
| `id/CuentaPorPagarInfo.tsx`, `HistorialPagos.tsx`, `ResumenTotalesFactura.tsx`, `InfoProveedorFactura.tsx` | — | fechas con `parseLocalDate`, que está deprecada; `InfoProveedorFactura.tsx:85` → `/app/inventario/proveedores/{uuid}` |
| `RegistrarPagoModal.tsx` (349) | `obtenerMetodosPago` | `registrarPago` (`:190`); 6 validaciones con `alert` (`:161-207`) |

**Servicio de facturas de compra**: `FacturasCompraService.ts`. Clase estática, cliente del navegador. El número de línea es el que da `Read`.

| Método | Línea | Tablas / RPC | Nota |
|---|---|---|---|
| `obtenerFacturas` | 68 | `invoice_purchase` + `suppliers` | `.or()` con el texto del usuario interpolado (`:104`) |
| `obtenerFacturaPorId` | 148 | `invoice_purchase` + `suppliers` + `accounts_payable`, `invoice_items`, `invoice_purchase_applied_taxes`, `profiles` | 4 consultas |
| `crearFactura` | 245 | INSERT en `invoice_purchase` → `invoice_items` → `invoice_purchase_applied_taxes` → `serial_numbers` (vía `serialTrackingService`) → **`accounts_payable`** → `commissions` | **6 escrituras sin transacción**. `total_line` sin impuesto (`:331`); si la CxP falla, se traga el error (`:409-412`) |
| `actualizarFactura` | 478 | UPDATE en la cabecera; DELETE e INSERT de líneas; DELETE e INSERT de seriales e impuestos; UPDATE en `accounts_payable` | balance calculado en el cliente (`:533-534`); **UPDATE de CxP a mano** (`:673-684`) |
| `obtenerCuentaPorPagar` | 702 | `accounts_payable` por `invoice_id` | `.single()`: fallaría con dos |
| `obtenerPagosFactura` | 741 | `payments` con `source` en (`invoice_purchase`, `account_payable`) | ya une los dos orígenes |
| `registrarPago` | 858 | INSERT en `payments` (`source='invoice_purchase'`) | **correcto**: solo inserta; el saldo lo recalculan los disparadores (`:914-925`) |
| `actualizarInventarioPorCompra` | 938 | `stockMovementService.incrementOnPurchase(..., 'purchase_invoice')` | solo lo usa `actualizarEstadoFactura` |
| `obtenerProveedores`, `crearProveedor`, `obtenerTasasCambio`, `obtenerMonedas`, `obtenerMetodosPago` | 980–1106 | lecturas + INSERT en `suppliers` | duplican lo de `supplierService` y `monedaOrganizacion` |
| `obtenerFacturasProximasVencer` | 1113 | `invoice_purchase` | día UTC |
| `confirmarFactura` | 1150 | RPC `confirm_purchase_invoice` | **sin inventario** (§0.1) |
| `actualizarEstadoFactura` | 1174 | UPDATE del estado a cualquier valor + inventario si pasa de `draft` a `received` | sin llamadores en la UI actual (grep); es otra vía de estado a mano |
| `recepcionarInventario` | 1244 | `incrementOnPurchase(..., 'purchase')` + UPDATE del estado a `received` | no bloquea `partial`: **podría meter el stock dos veces** |
| `eliminarFactura` | 1370 | DELETE de `invoice_items`, `accounts_payable` e `invoice_purchase` | solo en borrador; **borra la CxP a mano** |
| `anularFactura` | 1422 | RPC `fn_void_purchase_invoice` | ver §1.4.3 |

**Cuentas por pagar** (`src/components/finanzas/cuentas-por-pagar/`)

| Archivo (líneas) | Lee | Escribe / llama |
|---|---|---|
| `CuentasPorPagarPage.tsx` (456) | `obtenerCuentasPorPagar` (`:100`), `obtenerResumen` (`:124`), `obtenerPagosProgramados` (`:133`) | Open Finance con `Number(cuenta.id)` sobre un uuid → `NaN` (`:472`) |
| `CuentasPorPagarFiltros.tsx` (319) | `obtenerProveedoresConSaldo` (`:56`) | el filtro de estado usa valores en español contra la BD en inglés (ACF H.2 #23) |
| `CuentasPorPagarTable.tsx` (387) | — | enlaces a la factura (`:171`) y al detalle; `tel:` y `mailto:` |
| `ResumenCuentasPorPagar.tsx` (244) | resumen | 7 KPI |
| `RegistrarPagoModal.tsx` (518) | cuentas bancarias y métodos (`:122,132`) | `registrarPago` (`:218`) |
| `ProgramarPagoModal.tsx` (520) | métodos (`:116`) | `programarPago` (`:201`); `.split('T')[0]` sobre `due_date timestamptz` (`:99,429`) |
| `AprobacionPagosModal.tsx` (468) | `obtenerPagosProgramados` (`:78`) | `aprobarPago` (`:98`) y `rechazarPago` (`:137`); el comentario pisa `reference` |
| `ExportarBancaModal.tsx` (525) + `formatosBanca.ts` (95) | `obtenerCuentasPorPagar` (`:147`) | genera el archivo y **después** `exportarParaBancaOnline` (`:215`) → INSERT en `bank_files` (0 filas hoy) |
| `PayWithOpenFinanceDialog.tsx` (367) | — | pago iniciado por Open Finance (`paymentInitiationService`) |
| `id/CuentaPorPagarDetailPage.tsx` (434) | `obtenerDetalleCuentaPorPagar` (`:52`) | enlace a la factura (`:83`) y al proveedor por uuid (`:380`) |
| `id/AccountActionsCard.tsx` (487) | métodos, bancos y cuotas (`:74-76`) | `pagarCuota` (`:118,133`), `registrarPago` (`:145,170`), `generarEstadoCuenta` → `.txt` (`:189`) |
| `id/InstallmentsCard.tsx` (495) | `obtenerCuotas` (`:99`) | `crearCuotas` (`:128`), `eliminarCuotas` (`:152`), `pagarCuota` (`:205`) |
| `id/PaymentHistoryCard.tsx` (150) | detalle (`:58`) | — |
| `id/cuotas/CuotasPage.tsx` (685) | detalle, cuotas, métodos y bancos (`:103-106`) | crear, eliminar, pagar y actualizar cuota (`:152,175,204,227`) |

**Servicios de cuentas por pagar**

| Método | Archivo:línea | Tablas | Nota |
|---|---|---|---|
| `obtenerCuentasPorPagar` | `CuentasPorPagarService.ts:116` | `accounts_payable` + `suppliers` + `invoice_purchase` | «vencidas» con `new Date().toISOString()` (`:159`); la búsqueda hace una segunda consulta con `.or()` sobre embebidos (`:171-184`) |
| `obtenerResumen` | `:257` | `accounts_payable` (3 consultas) | «hoy» en UTC (`:262`) |
| `programarPago` | `:414` | INSERT en `payments` con `status='pending'` | la **fecha programada va dentro de `reference`** (`:454`); `notes` se pierde |
| `registrarPago` | `:484` | INSERT en `payments` con `status='completed'` | correcto: el disparador recalcula (`:538-541`); no envía `payment_date` ni `bank_account_id` |
| `obtenerPagosProgramados` | `:589` | `payments` `pending` | `limit(10)` (`:619`) |
| `aprobarPago` | `:655` | UPDATE `payments.status='completed'` y **`reference = comments`** (`:669-672`) | **bug conocido** (ACF:2905) |
| `rechazarPago` | `:711` | UPDATE `status='cancelled'`, `reference = comments` (`:725-728`) | mismo bug |
| `exportarParaBancaOnline` | `:888` | INSERT en `bank_files` | no lanza nunca (a propósito) |
| `crearCuotas` | `:1031` | INSERT en `ap_installments` | **duplicado** del de `id/service.ts:242` |
| `obtenerDetalleCuentaPorPagar` | `id/service.ts:19` | `accounts_payable` + pagos de los dos orígenes | — |
| `getAgingInfo` | `id/service.ts:151` | — | 4 tramos (CxC usa 5); textos en español cableados |
| `crearCuotas` | `id/service.ts:242` | DELETE e INSERT en `ap_installments` | borra el plan antes de insertar |
| `registrarPago` | `id/service.ts:305` | INSERT en `payments` | `payment_date` con la hora del **navegador** (`:345`, `toTimeString`) |
| `pagarCuota` | `id/service.ts:370` | UPDATE en `ap_installments` y después INSERT en `payments` | **no es atómico**: si falla el pago, la cuota ya quedó abonada |
| `generarEstadoCuenta` | `id/service.ts:515` | — | texto plano `.txt` |

### 1.3 Otros servicios que escriben compras

1. **Kardex**: `stockMovementService.incrementOnPurchase`, en `src/lib/services/stockMovementService.ts:362-476`.
   - Por cada línea:
     - Lee `products.track_stock`.
     - Busca `stock_levels` con `lot_id IS NULL` (`:403-410`).
     - Recalcula `avg_cost` ponderado en el navegador (`:418-420`).
     - Hace UPDATE o INSERT de `stock_levels`.
     - Inserta en `stock_movements` (`direction='in'`, `unit_cost=unit_price`, `source` según quien llama).
   - Sin transacción ni bloqueo: dos recepciones simultáneas del mismo producto pierden una suma.
   - **No escribe `product_costs`.**
2. **Anulación**: la RPC `fn_void_purchase_invoice` (§1.4.3).
3. **GO Assistant**: la RPC `assistant_register_purchase_invoice`.
   - Crea factura, líneas, kardex (`source='purchase'`), `stock_levels` y CxP en una transacción.
   - `currency` por defecto `'USD'`.
   - Sin `unit_cost` en el movimiento y sin `avg_cost` ni `product_costs`.
   - `SECURITY INVOKER`. Zona de la sesión del GO Assistant.
4. **Órdenes de compra**: `purchaseOrderService.ts`.
   - La recepción suma stock con `incrementOnPurchase` (`:627` y `:752`).
   - En la base esos movimientos quedan con `source='purchase'` y `source_id` = id entero de la orden: 4 movimientos de 3 órdenes.
   - Después llama a `generateInvoiceFromPurchaseOrder` (`:668` y `:816`), definida en `:833-987`. Esa función:
     - Inserta la factura **directamente en `received`** (`:918`). El asiento de devengo sale en ese INSERT, antes de las líneas.
     - Le pone `tax_total: 0` y líneas con `tax_rate: 0`.
     - Calcula `issue_date` y `due_date` con `toISOString().split('T')[0]`, en UTC (`:878-881`), algo prohibido.
     - Saca el número `COMP-AAAA-NNNN` leyendo la última factura (`:884-895`), con riesgo de choque.
     - Deduplica por notas `%OC-{id}%` (`:850-858`) y **no escribe `po_id`**.
     - Si fallan las líneas o la CxP, solo deja un `console.warn` (`:951-953`, `:982-984`).
   - En la base: 7 órdenes recibidas y **0 facturas** generadas desde una orden (ni por `po_id` ni por la nota).
5. **Seriales**: `serialTrackingService.createSerials`, llamado desde `crearFactura` y `actualizarFactura`. Hay 0 seriales de compra en la base.
6. **Open Finance**: `src/lib/services/integrations/openFinance/paymentInitiationService.ts:371-414` y `:554`.
   - Inserta el pago con **`source: 'accounts_payable'` (en plural)**. Ningún disparador reconoce ese origen, así que el pago no recalcula ni la CxP ni la factura, y no sale en ningún historial.
   - Moneda **`'COP'` fija** (`:363`, `:379`), aunque el guardarraíl de moneda no la vigila en ese archivo.
   - Después hace **UPDATE a mano** de `accounts_payable` a saldo 0 y `paid` (`:399-414`), incluso si la transferencia quedó `pending`.
   - En la base: 0 pagos con ese origen. Se corrige antes de exponerlo en la UI (F11).
7. **Otros escritores de `product_costs`**:
   - `components/inventario/productos/bulk/bulkService.ts:274,760` (INSERT masivo).
   - `lib/ai/assistant/undoService.ts:262` (DELETE al deshacer). Con la RLS actual, ese DELETE no tiene política: comprobar si falla en silencio.
   - Ninguno está en la zona de compras, pero la RPC de costo de F1.3 debe convivir con ellos: solo cierra la vigencia abierta y abre una nueva.

### 1.4 Base de datos (verificada con el MCP, 2026-09-24)

#### 1.4.1 Tablas y columnas que importan

| Tabla | Columnas clave | Observación |
|---|---|---|
| `invoice_purchase` | `id uuid`, `organization_id`, `branch_id` NOT NULL, `supplier_id` NOT NULL, `po_id integer`, `number_ext` NOT NULL, `issue_date` y `due_date` **timestamptz**, `currency`, `subtotal`, `tax_total`, `total`, `balance`, `status` NOT NULL, `payment_terms`, `payment_method`, `payment_terms_id`, `tax_included` NOT NULL, `salesperson_id`, `commission_*` | CHECK `status IN (draft, received, paid, partial, void)`. **Sin UNIQUE** de número por proveedor. **Sin columnas de retención** ni de «recibido en inventario» |
| `invoice_items` | `invoice_id` NOT NULL, `invoice_type`, `invoice_purchase_id`, `product_id`, `qty`, `unit_price`, `tax_code`, `tax_rate`, `total_line` NOT NULL, `discount_amount`, `tax_included` NOT NULL, `withholding_taxes jsonb`, `serial_numbers[]`, `support_document_id` | se comparte con venta y documento soporte |
| `invoice_purchase_applied_taxes` | `invoice_id`, `tax_code`, `tax_rate`, `is_applied` | 0 filas |
| `accounts_payable` | `id uuid`, `organization_id`, `supplier_id` NOT NULL, `invoice_id uuid` (NULL-able), `amount`, `balance`, `due_date timestamptz`, `status text`, `days_overdue`, `branch_id`, `discount_amount` NOT NULL | **sin CHECK de estado, sin UNIQUE por `invoice_id`** |
| `ap_installments` | `account_payable_id`, `installment_number` (UNIQUE con la cuenta), `due_date date`, `amount`, `principal`, `interest`, `balance`, `status`, `paid_amount`, `paid_at` | CHECK `status IN (pending, partial, paid, overdue, cancelled)` |
| `payments` | `source text`, `source_id text`, `method`, `amount`, `currency` NOT NULL, `reference`, `status`, `payment_date timestamptz`, `discount_amount`, `change_amount`, `bank_account_id integer` | **sin columna de fecha programada, aprobador ni grupo de pago** |
| `product_costs` | `product_id`, `cost`, `effective_from` NOT NULL, `effective_to`, `supplier_id` | **sin `organization_id`**; RLS con solo SELECT e INSERT (**no hay UPDATE**) |
| `stock_movements` | `branch_id`, `product_id`, `lot_id`, `direction`, `qty`, `unit_cost`, `source`, `source_id text`, `updated_by` | — |
| `purchase_orders` / `purchase_order_items` | `id integer`, `uuid`; líneas con `received_quantity`, `requires_serial`, `serials_received[]` | también existe `po_items`, tabla vieja: comprobar si alguien la usa antes de tocarla |
| `support_documents` | `invoice_purchase_id`, `provider jsonb` NOT NULL, `status`, `cufe`, `qr_*`, `factus_response` | **0 filas** |
| `bank_files` | lote de exportación a banca | 0 filas |

#### 1.4.2 Disparadores (activos = `O`; `D` = deshabilitado)

| Tabla | Disparador | Qué hace | Consecuencia para el plan |
|---|---|---|---|
| `payments` | `tr_update_accounts_payable_on_payment` → `fn_recalc_accounts_payable_from_payments` (INS/UPD/DEL) | Recalcula `accounts_payable.balance` y su estado (`partial`/`paid`) con la suma de los pagos `completed` de los dos orígenes (`invoice_purchase` y `account_payable`), **sumando `discount_amount`** | **La CxP no se escribe a mano cuando hay un pago**: se inserta en `payments` y nada más |
| `payments` | `trg_recalc_invoice_balance_from_payments` (INS/UPD/DEL) | Recalcula `invoice_purchase.balance` con los dos orígenes, **sin `discount_amount`**. Ignora las facturas `draft` y `void`. **No toca el estado** de la compra | Las dos funciones difieren en el descuento: a unificar (§4, F1.1) |
| `payments` | `trg_auto_journal_payment` (INS/UPD) | asiento del pago | no se crea `cash_movement` aparte (ya comentado en `:921-925`) |
| `payments` | `trg_normalize_payment_status`, `audit_payments_trigger`, `trg_notify_payment_registered`, `trg_branch_default` | normaliza, audita, notifica y pone sucursal por defecto | — |
| `invoice_items` | `trg_recalc_invoice_totals_{ins,upd,del}` → `fn_recalc_invoice_totals` | Compra: `subtotal = Σ(qty·precio − dcto)`, `total = Σ total_line`, `tax_total = total − subtotal`, `balance = total − pagos` **solo de `source='invoice_purchase'`** | Quien escribe líneas **debe escribir `total_line` bruto** (con impuesto). Y el saldo ignora los pagos hechos desde la CxP (bug) |
| `invoice_items` | `trg_normalizar_impuesto_linea` (BEFORE) | Rellena `tax_code` según la tarifa; audita `total_line_incoherente` | ya detecta el bug del formulario (1 fila en la auditoría) |
| `invoice_purchase` | `trg_auto_journal_purchase` → `fn_auto_journal_purchase` (INS/UPD) | Asiento «Compra …» al pasar a `received`, con `NEW.total` y `NEW.tax_total`; idempotente por `memo LIKE 'Compra %'` | Editar el total después de recibida descuadra el asiento: **una factura recibida no se edita**, se anula |
| `invoice_purchase` | `trg_create_commission_on_invoice_purchase` (UPD a `paid`) | comisión | ningún camino pone la compra en `paid`; el formulario ya inserta la comisión al crear (`:423-466`) |
| `invoice_purchase` | `trg_00_moneda_base_por_defecto`, `trg_notify_purchase_invoice` | moneda base; notificación | — |
| `accounts_payable` | `trg_auto_journal_ap` (**D**), `trg_branch_default`, `trg_branch_audit` | — | el asiento de la CxP está apagado (bien: sería un doble devengo, ADR-CC-009) |
| `ap_installments` | `trg_auto_journal_ap_installment` (**D**), `updated_at` | — | — |
| `stock_movements` | `trg_auto_journal_stock_movement` | Asiento de ajuste por movimiento. Excluye `initial`, `purchase`, `purchase_order`, `purchase_invoice`, `transfer`, `transfer_out` y `transfer_in` | la compra se contabiliza por la factura (ADR-CC-009); **`purchase_void` no está excluido**: la anulación genera un asiento de ajuste **además** del contra-asiento espejo (ver §5.1 R7) |
| `purchase_orders` | `trg_auto_journal_purchase_order` (**D**) | — | — |

**No existe ningún disparador que cree o mantenga la cuenta por pagar desde la factura.** Hoy la crean tres caminos: el formulario, la RPC del asistente y el generador de órdenes de compra.

#### 1.4.3 RPC existentes

| RPC | Seguridad | Qué hace | Problema |
|---|---|---|---|
| `confirm_purchase_invoice(invoice_id_param)` | DEFINER + `fn_assert_acceso_org` | `draft → received`; la CxP pasa a `pending` | **no recepciona inventario** |
| `fn_void_purchase_invoice(p_invoice_id, p_reason, p_user)` | DEFINER + `fn_assert_acceso_org` | bloquea si hay pagos; revierte stock si está `received`; CxP a saldo 0; contra-asiento **espejo**; `status='void'` y el motivo en `notes` | cuenta pagos **de cualquier estado** (uno rechazado bloquea para siempre); busca `stock_levels` **sin filtrar `lot_id`**; deja la CxP en `pending` con saldo 0 (4 filas `pending`/`partial` con saldo 0 hoy) |
| `assistant_register_purchase_invoice` | INVOKER | registro completo en una transacción | tercera implementación (§0.7) |
| `proveedor_resumen(org, supplier)` | DEFINER | saldo, vencido, mora y compras en 12 meses | reutilizable en `SupplierPicker` y en la ficha |
| `fn_revertir_asiento_manual`, `fn_revertir_asiento_en_fecha` | — | reversión de asientos | la usará la reparación de datos (§5.3) |
| `fn_regla_devengo_compra` | DEFINER STABLE | regla contable de la compra | — |

**No existen**: `fn_registrar_pago` (el pago único del diseño), `fn_estado_cuenta_proveedor`, `payments.payment_group_id`, una tabla de programaciones de pago ni una tabla de retenciones.

#### 1.4.4 RLS

- `invoice_purchase`, `accounts_payable` y `support_documents`: política permisiva por pertenencia, más **`branch_access_restrictive`** (`app_branch_access(branch_id)`).
- `invoice_items`: por tipo de documento y pertenencia.
- `ap_installments`: por la cuenta de la organización.
- `product_costs`: SELECT e INSERT por pertenencia vía `products`. **Sin UPDATE ni DELETE**.
- Por eso, un *route handler* que use `getServerUserClient()` hereda la restricción por sucursal. Es lo deseado.

### 1.5 Permisos

- **Ninguna pantalla ni servicio de compras o CxP comprueba permisos.** Solo existe la compuerta de módulo del middleware (FDF §1.3; ACF H.7 #29).
- Catálogo real en `permissions`:
  - `finance.view`, `finance.create`, `finance.approve` y `finance.void`: cada uno asignado a 1 rol.
  - `inventory.view`, `.create`, `.edit`, `.adjust`, `.transfer` y `.delete`.
  - `finance.edit` y `finance.manage` aparecen en tests, pero **no existen en la BD**.
- **Guarda canónica, que se reutiliza sin crear otra**: `src/lib/security/orgGuards.ts`.
  - `PERMISOS_FINANZAS` (`:20-25`): `VER`, `CREAR`, `APROBAR` y `ANULAR`.
  - `requireOrgPermission(ctx, codigo, ruta)` (`:32`): 403 `PERMISSION_REQUIRED` con registro, sobre `hasOrgAdminOrPermission`.
  - `assertRecordOfOrg` (`:49`): 404 si el recurso no es de la organización de la sesión.
  - Ya la usa `api/factus/support-document/route.ts:94`, con `withOrg` y `readOrgBody` (organización del body → 403).
  - Para la recepción, el permiso de inventario se resuelve con `hasOrgAdminOrPermission(ctx, 'inventory.create')`.

### 1.6 PDF y documentos impresos

| Documento | Hoy | Archivo |
|---|---|---|
| Factura de compra, «Imprimir» | HTML en ventana + `window.print()` | `pdfService.ts` (`printPurchaseInvoiceHTML`); payload armado dos veces en `DetalleFacturaCompra.tsx:218-289` |
| Factura de compra, «PDF» | **descarga un `.html`**; el toast dice «PDF generado» | `pdfService.ts` (`downloadPurchaseInvoicePDF`), ADPI:200-204 |
| Factura de venta, PDF de verdad | Puppeteer en el servidor, con `getServerOrgContext` y los datos releídos de la BD | `src/app/api/facturas-venta/[id]/pdf/route.ts` (295 líneas). **Es el motor a generalizar** |
| Estado de cuenta del proveedor | `.txt` | `id/service.ts:515` |
| Recibo o comprobante de pago a proveedor | no existe | — |
| Documento soporte | solo el PDF del proveedor electrónico, si fue aceptado | `src/app/api/factus/support-document/download/route.ts` |

Guardarraíl que se rompe al mover archivos: `src/__tests__/guardrails.test.ts:2245-2299` (§28, «Generadores de documentos: sin moneda fija»).

- Enumera por ruta `components/finanzas/facturas-compra/id/DetalleFacturaCompra.tsx`, `components/finanzas/cuentas-por-pagar/id/service.ts` y `…/id/CuentaPorPagarDetailPage.tsx`.
- El test «la lista de generadores existe» falla si se mueven o se borran sin actualizar la lista.
- Las rutas de PDF nuevas **se añaden** a esa lista.

### 1.7 Documento soporte DIAN

- **Tabla**: `support_documents`, con 0 filas. Tiene `invoice_purchase_id` y `branch_id`. Las líneas van en `invoice_items.support_document_id`.
- **Emisión**: `src/app/api/factus/support-document/route.ts` (205 líneas); descarga en `…/download/route.ts`.
  - El commit `9dbc3c10` ya exige sesión, organización de la sesión y pertenencia.
  - **La cola de Factus ya es solo del servidor** (`src/lib/services/einvoicing/colaFacturacion.server.ts`, test `src/__tests__/einvoicing/colaSoloServidor.test.ts`).
- **UI**: `src/components/finanzas/documentos-soporte/**`.
  - `SupportDocumentForm.tsx:128` usa `toISOString().split('T')[0]`, que está prohibido.
  - El detalle guarda el id de la compra pero no la enlaza (ACF §B.13-B.15).
- **Relación con la compra en el diseño**: `20-facturas-compra-nueva.png` trae el interruptor «Generar documento soporte · No obligado a facturar», tipo y concepto DIAN. `20-facturas-compra-detalle.png` muestra el chip `DS-00014` y el enlace en «Enlaces del documento».
- **Alcance aquí**: *crear el borrador de documento soporte enlazado* y *ver su estado*. La emisión sigue siendo de la cola del servidor.

### 1.8 Navegación

- **Menú**: `src/lib/navigation/catalog.ts:381` («Facturas de compra», grupo Documentos) y `:391` («Cuentas por pagar», grupo Tesorería).
- **Enlaces que entran desde otros módulos. Las URL no se pueden cambiar**:

| Desde | Archivo:línea | URL |
|---|---|---|
| Ficha del proveedor | `inventario/proveedores/detalle/ProveedorDetalle.tsx:244,276,287,868,874,888` | `/app/finanzas/facturas-compra/{id}`, `/app/finanzas/cuentas-por-pagar/{id}` |
| Orden de compra | `inventario/ordenes-compra/detalle/OrdenCompraDetalle.tsx:527,538` | factura; CxP (al listado, sin id) |
| Kardex, historial, seriales y compras del producto | `logicaInventario.ts:242`, `ItemHistorial.tsx:212`, `TrazabilidadSerialSheet.tsx:210`, `HistorialComprasProducto.tsx:72` | `/app/inventario/facturas-compra/{id}` |
| Notificaciones | `notificaciones/NotificationDetailSheet.tsx:101,103` | CxP e factura por id |
| Comisiones | `finanzas/comisiones/comisionesModel.ts:42` | factura |
| Reportes | `finanzas/reportes/ReportesPage.tsx:470,494` | listados |
| GO Assistant (sugerencias por ruta) | `lib/services/aiAssistantService.ts:202,204` | listados |

- **Enlaces internos**:
  - Detalle de CxP → factura (`CuentaPorPagarDetailPage.tsx:83`).
  - Tabla de CxP → factura (`CuentasPorPagarTable.tsx:171`).
  - Factura → proveedor (`InfoProveedorFactura.tsx:85`).
  - Detalle de CxP → proveedor (`:380`).
- **Enlaces que faltan en el diseño**: factura ↔ orden de compra (`po_id`), factura → entrada de inventario (kardex), factura → asiento, factura → documento soporte, CxP → orden de compra.

### 1.9 Pruebas existentes que tocan estas zonas

| Test | Qué fija |
|---|---|
| `src/__tests__/finanzas/bancaOnlineCuentasPorPagar.test.ts` | formatos de banca y el registro de `bank_files` después de la descarga |
| `src/__tests__/timezone/carteraVencimientos.test.ts` | vencimientos de cartera por día de la organización |
| `src/__tests__/timezone/guardarrail16Descargas.test.ts` | nombres de archivo de descargas con día de la organización |
| `src/__tests__/timezone/openFinanceYMonedas.test.ts` | moneda y fechas del pago por Open Finance |
| `src/__tests__/timezone/vigenciasQueCortanServicio.test.ts` | vigencias |
| `src/__tests__/guardrails.test.ts:1863-1867` | **ningún servicio de compras inserta en `journal_entries`/`journal_lines`** |
| `src/__tests__/guardrails.test.ts:2245+` | generadores de documentos sin `COP` fijo (§1.6) |
| `src/__tests__/einvoicing/colaSoloServidor.test.ts` | la cola DIAN solo en el servidor; permisos `finance.*` |
| `src/__tests__/services/goAssistantF2compras.test.ts`, `goAssistantClientesYFacturas.test.ts`, `goAssistantF3.test.ts` | contrato del asistente con compras |

### 1.10 i18n

- `messages/*.json` tiene `kit`, con `kit.estados` para las etiquetas de estado, y `proveedores`.
- **No hay namespace** de facturas de compra, CxP ni documentos.
- Todos los textos de las ≈45 piezas de §1.2 están cableados en español.

---

## 2. Lógicas que hay que preservar, y la prueba de caracterización que va antes

Regla: cada fila tiene su test **en verde contra el código de hoy** antes de tocar el archivo. Donde el
comportamiento de hoy es un bug, el test lo fija con `test.failing` o con un nombre «HOY: …» y se invierte en
el paso que lo corrige. El repo corre jest en `node`, sin testing-library: se prueban funciones puras y
contratos (argumentos de Supabase simulados), igual que `bancaOnlineCuentasPorPagar.test.ts`.

Todos los archivos nuevos van en `src/__tests__/finanzas/compras/`.

| # | Lógica | Dónde vive hoy | Prueba de caracterización (archivo nuevo) |
|---|---|---|---|
| L1 | Registrar un pago **solo inserta en `payments`**, con la moneda de la factura o la base de la organización y `payment_date` = día elegido a la hora de la sucursal | `FacturasCompraService.ts:858-933`, `CuentasPorPagarService.ts:484-549` | `pagoSoloInserta.test.ts`: con Supabase simulado, `registrarPago` hace exactamente 1 `insert` en `payments` y 0 `update` en `accounts_payable` o `invoice_purchase`; moneda `normalizarCodigoMoneda(factura.currency) ?? base` |
| L2 | El monto no puede superar el saldo | los mismos + los modales | `pagoTope.test.ts`: la función pura `validarMontoPago(saldo, monto)`, extraída en el paso F1 con el mismo resultado |
| L3 | Solo se edita en `draft` (y `pending`); solo se elimina en `draft` | `:500`, `:1384` | `estadosEditables.test.ts`: tabla de estados → acción permitida (§3.4); fija también que hoy `partial` deja recepcionar (**HOY: bug**) |
| L4 | La anulación la hace la RPC: bloquea con pagos, revierte stock y contra-asiento espejo, sin borrar asientos | `fn_void_purchase_invoice` | `anulacionCompra.contract.test.ts`: el servicio llama `rpc('fn_void_purchase_invoice', {p_invoice_id, p_reason, p_user})` y nada más. Más un dry-run SQL documentado (`DO … RAISE`, ver la memoria de pagos) en el PR de F1 |
| L5 | La moneda de la factura se respeta; sin moneda, la pone el disparador de la base | `:291-292`, `:545` | `monedaCompra.test.ts`: el payload no manda `currency` si el usuario no eligió |
| L6 | Recepción: `track_stock=false` se salta y se informa (`describeSkippedItems`); promedio ponderado; `lot_id IS NULL` | `stockMovementService.ts:362-476` | `recepcionKardex.test.ts`: casos con stock previo 0 y > 0, con producto no inventariable y con cantidad ≤ 0. **Se reutiliza igual** contra la RPC nueva (mismo resultado numérico) |
| L7 | Los asientos los hacen los disparadores; ningún servicio de compras los inserta | guardrail `:1863` | ya existe; se amplía a los archivos nuevos (`src/lib/services/compras/**`, `src/app/api/facturas-compra/**`) |
| L8 | Cuotas: reparto con redondeo a centavos y la última absorbe la diferencia; vencimientos por mes calendario recortados al último día del mes; zona de la sucursal | `id/service.ts:242-302`, `CuentasPorPagarService.ts:1031-1079` | `planCuotas.test.ts`: 31-ene + 1 mes = 28/29-feb; 3 cuotas de 100 = 33,33 · 33,33 · 33,34; interés por cuota |
| L9 | Antigüedad por días de mora con el día de la organización | `id/service.ts:112-118,151-181`; `CuentasPorPagarService.ts:204-239` | `antiguedadCxp.test.ts`: frontera 0/1/30/31/60/61/90/91 con `TZ=UTC` y `TZ=America/Bogota` (`npm run test:tz-all`) |
| L10 | Exportación a banca: el archivo se descarga aunque falle el registro en `bank_files`; nombre con el día de la organización; extensión real | `CuentasPorPagarService.ts:888-960`, `formatosBanca.ts` | ya existe (`bancaOnlineCuentasPorPagar.test.ts`); correrlo antes y después |
| L11 | Pagos de una factura = los directos + los de su CxP, ordenados por fecha | `FacturasCompraService.ts:741-822`, `id/service.ts:54-110` | `historialPagosCompra.test.ts`: fusión y orden, **sin duplicados** |
| L12 | Comisión de compra: se registra al crear si hay comisionista; el disparador no duplica | `:422-466` + `fn_create_commission_on_invoice_purchase` | `comisionCompra.test.ts`: mismos campos (`source_type='invoice_purchase'`, moneda de la factura) |
| L13 | Número del proveedor: se detectan duplicados; se sugiere `COMP-AAAA-NNNN` | `InformacionBasicaForm.tsx` | `numeroCompra.test.ts`: la sugerencia sigue igual; el duplicado se valida en el servidor (F1) |
| L14 | Seriales: se crean `in_stock` con proveedor, factura y costo; al editar se reemplazan solo los `in_stock` | `:366-394`, `:612-648` | `serialesCompra.test.ts` |
| L15 | Fechas: `issue_date` y `due_date` son `timestamptz` → se pintan con `formatDateInTz`; `ap_installments.due_date` es `date` → `formatPlainDate` | todo el módulo | `fechasCompra.test.ts`: una factura emitida a las 20:00 de Bogotá se pinta con **ese** día |

---

## 3. Mapa diseño → código

### 3.1 Componentes compartidos: se construyen UNA vez

Todos van al kit (`src/components/kit/documento/`, exportados desde `@/components/kit`). Es la regla de
KIT-CODIGO («si falta algo, se agrega al kit»). Cada uno con su línea en `KIT-CODIGO.md` y textos del
namespace `kit.documento`, en 4 idiomas. **La primera sesión que llegue lo construye; la otra lo importa.**
Hay que avisarlo a la sesión que haga facturas de venta y CxC antes de empezar (§5.4 D1).

| Componente (Figma) | Id | Nuevo en código | Lo usan también | Sustituye (viejo) |
|---|---|---|---|---|
| `PageHeader` | `109:4573` | existe (`kit/PageHeader.tsx`) | todos | `facturas-compra/PageHeader.tsx`, cabeceras sueltas |
| `DocumentHeader` (Variant detalle · formulario × Layout desktop · mobile) | set en `02 Componentes › Finanzas` (id no anotado; leer con `get_metadata` sobre `3:2`) | `kit/documento/DocumentHeader.tsx`, que compone `PageHeader variante detail/form` + chips | venta, cotización, nota crédito, DS, CxC, **orden de compra** | cabecera de `DetalleFacturaCompra.tsx:388-522`, `CuentaPorPagarDetailPage` |
| `DocumentStatusBadge` (11 estados) | ídem | **no se crea**: `kit/StatusBadge` + `kit/estadoTono.ts`, ampliando la tabla con «Por recibir», «Recibido» y «Al día» | todos | `getEstadoBadge` (`DetalleFacturaCompra.tsx:309-325`), `AccountStatusBadge.tsx`, badges de `CuentaPorPagarInfo` |
| `DocumentLinesTable` (Mode lectura · edición · recepción × Layout table · cards) | ídem | `kit/documento/DocumentLinesTable.tsx` | venta, cotización, NC, DS, **recepción de OC** | `ItemsListForm`, `SelectedProductsTable`, tabla de líneas del detalle |
| `DocumentTotals` (Variant venta · compra · cotización, con retenciones) | ídem | `kit/documento/DocumentTotals.tsx` + `documentoTotales.ts` (lógica pura) | venta, cotización, DS, OC | `ResumenFactura.tsx`, `ResumenTotalesFactura.tsx` |
| `RegistrarPagoDialog` (Destino factura · cuenta · tercero × Layout × State, 9 variantes) + `RepartoPago` | `730:20644`, `730:19157`; Sección `741:53717` (P1 `741:53911` … M1 `741:55995`) | `kit/documento/RegistrarPagoDialog.tsx` sobre `kit/PanelAdaptable` (hoja en móvil) | **CxC, facturas de venta, cajas** (efectivo sin caja → «Abrir caja», P6) | los 7 diálogos de compra de ACF J.2: `facturas-compra/RegistrarPagoModal`, `cuentas-por-pagar/RegistrarPagoModal`, `AccountActionsCard`, `InstallmentsCard`, `CuotasPage`, `ProgramarPagoModal` (parcial) y `PayWithOpenFinanceDialog` (se conserva aparte, §4 F11) |
| `SupplierPicker` (Layout popover · dialog · inline · field · sheet × State) | set en `02 Componentes › Finanzas` (id no anotado) | `kit/documento/SupplierPicker.tsx`, con búsqueda en servidor y chip de saldo por pagar (`proveedor_resumen`) | **órdenes de compra, DS, lotes** | `SupplierSelector.tsx`, `ProviderSelector` de DS, el filtro de proveedor |
| `ProductPicker` modo compra | `161:8041` | existe: `shared/product-search/ProductSearchDialog` | OC, venta | — |
| `CadenaDocumento` / `ChipDocumento` / `RelatedLinkCard` | `680:409052`, `680:406423`, `580:277907` | `kit/RelatedLinkCard` existe; `kit/documento/EnlacesDocumento.tsx` (lista) | venta, CxC, OC, contabilidad | — (hoy no hay enlaces) |
| Historial del documento (línea de tiempo) | en `20-facturas-compra-detalle.png` («Historial», badge Nuevo) | `kit/documento/HistorialDocumento.tsx` | venta, OC | — |
| `DocumentoImpreso` (Tipo × Formato carta · ticket-80 × Estado) | `731:21879`; instancias `741:55997` | plantilla HTML en el servidor: `src/lib/documentos/plantillas/` (motor de DOCUMENTOS-PDF §5) | venta, NC, DS, cotización, **recibo (cajas/POS)**, estado de cuenta | `pdfService.generatePurchaseInvoiceHTML`. **Hueco del diseño**: el set no tiene `Tipo=factura-compra` ni `comprobante-egreso`; se usa la captura `21-documento-factura-compra.png` (DOCUMENTOS-PDF §4.2) |
| Banda de antigüedad (5 tramos que filtran) | `26-cartera-08-pagar-listado.png` | `kit/documento/BandaAntiguedad.tsx` + `antiguedad.ts` | **CxC** | 7 KPI + pestañas de `CuentasPorPagarPage`, `getAgingInfo` |
| Plan de cuotas (tabla) + «Crear plan» | `26-cartera-09-pagar-detalle.png` | `kit/documento/PlanCuotas.tsx` | CxC | `InstallmentsCard`, `CuotasPage` |
| Estado de cuenta (diálogo: descargar o enviar) | Sección 19 X3 `740:52422` (CxC); 20 Y3 (CxP, sin id) | `kit/documento/EstadoCuentaDialog.tsx` | CxC | `.txt` de `generarEstadoCuenta` |
| Anular con motivo | ídem venta | `kit/documento/AnularDocumentoDialog.tsx` sobre `kit/Dialogo` | venta, egresos | `AnularFacturaCompraDialog.tsx` |
| Salir sin guardar | PARIDAD-FACTURAS §10 #41 | `ui/confirm-dialog` (existe) + hook `useSalirSinGuardar` | venta, OC | `NuevaFacturaForm.tsx:514,778` |
| `ViewToggle` (Tarjetas · Lista) | `103:3095` (POS-UX-V2 §7.5, decisión final) | pendiente en el kit (KIT-CODIGO:64). **Aquí no hace falta**: los listados usan `DataTable` (tabla ≥ lg, `ListCard` < lg). Si el dueño lo pide también en listados de documentos, se usa el que construya la sesión del POS (§5.4 D8) | POS, mesas | — |
| Del kit, tal cual | — | `DataTable`, `ListToolbar`, `SearchInput`, `FilterButton`, `FilterPanel`, `FilterChips`, `Pagination`, `BulkActionBar`, `RowActionsMenu`, `ActionSheet`, `ListCard`, `EmptyState`, `KpiStrip`, `StatCard`, `BranchBadgeActiva`, `DateRangeButton`, `AccionRapida`, `FormSection`, `FormField`, `CampoNumero`, `SegmentedControl`, `TabBar`, `Dialogo`, `PanelAdaptable`, `useListadoServidor` | — | — |

### 3.2 Pantallas: frame → composición → qué sustituye

Ids de frame: las Secciones de facturas de compra están en `421:*`, `424:*` y `425:*` de `07 Finanzas`
(`264:98915`), sin ids por frame en los documentos. Las de cartera son `445:195059` … `445:195063`, y el
orden por Sección no está anotado. Para el detalle de CxP del bloque Documentos, Sección 20 `740:53505`,
los frames Y1–Y6 tampoco tienen id. **Pendiente de Figma**: `get_metadata` sobre esos padres cuando haya cupo.
Mientras tanto, las capturas mandan.

| Pantalla | Frame / captura | Composición nueva | Viejo que desaparece |
|---|---|---|---|
| **Facturas de compra: listado** | `421/424/425:*` «Facturas de compra — listo · cargando · vacío · error · filtros y menú» + móvil; `20-facturas-compra-listado.png`, `20-facturas-movil-listado.png`, `22-patrones-finanzas-facturas.png` | `PageHeader` (migas Finanzas › Facturación › Facturas de compra; Exportar · Importar · **Nueva factura**) + `BranchBadgeActiva` + `KpiStrip` (Total por pagar · Vencidas, que filtra · Críticas ≤3 d · Próximas ≤7 d) + `ListToolbar` (buscador por número, proveedor, NIT o notas; `FilterPanel`: estado, recepción, proveedor con `SupplierPicker`, rango de fechas; `FilterChips`) + `DataTable` (Número · Proveedor+NIT · Emitida · Vencimiento · Total+moneda · Saldo · **Recepción** · Estado · **Doc. soporte** · acciones rápidas «Registrar pago» e «Imprimir» · «⋯») + `Pagination` + `BulkActionBar` (Exportar, Imprimir). Móvil: `ListCard` | `FacturasCompraPage`, `PageHeader` propio, `FacturasCompraFiltros`, `FacturasCompraTable`, `FacturasProximasVencer` (D3: el KPI lo sustituye) |
| **Detalle** | «Detalle factura de compra — listo · por recibir y sin pagos · cargando · no encontrada» + 3 diálogos + móvil; `20-facturas-compra-detalle.png`, `20-facturas-movil-detalle.png` | `DocumentHeader detalle` (migas; «Factura {n}»; proveedor · fecha; `StatusBadge` + chip DS; Imprimir · PDF · **Recibir** · **Registrar pago** · «⋯») + `DocumentLinesTable lectura` (con descuento por línea, impuesto «Incluido/Adicional», SKU, seriales y nota) + tarjeta «Proveedor y documento» + `EnlacesDocumento` (CxP · OC · entrada ENT · asiento · DS) + tabla «Pagos aplicados» (Programar pago · Registrar pago) + `DocumentTotals compra` (bases por impuesto y retenciones) + `HistorialDocumento` | `DetalleFacturaCompra`, `CuentaPorPagarInfo`, `HistorialPagos`, `ResumenTotalesFactura`, `InfoProveedorFactura` |
| Diálogo: recepcionar a inventario | «Diálogo / recepcionar a inventario» (PARIDAD-FACTURAS §1 #6) | `Dialogo` con el resumen de lo que entra (por producto: cantidad, costo, nuevo promedio) → `POST /api/facturas-compra/[id]/recepcionar` | botón directo sin confirmar |
| Diálogo: registrar pago | P1–P9 (`741:53911`…), `20-facturas-dialogo-pago.png`, `52-documentos-registrar-pago-*.png` | `RegistrarPagoDialog destino=factura` | `RegistrarPagoModal` (compra) |
| Diálogo: anular | «Diálogo / Anular factura de compra» | `AnularDocumentoDialog` → `POST …/anular` | `AnularFacturaCompraDialog` |
| **Nueva / editar** | «Nueva factura de compra — listo · vacía · **desde orden de compra** · editar cargando · no editable» + 4 diálogos + móvil; `20-facturas-compra-nueva.png`, `20-facturas-movil-compra-nueva.png`, `20-facturas-supplierpicker.png` | `DocumentHeader formulario` (Cancelar · **Guardar borrador** · **Confirmar factura**) + `FormSection` «Datos del documento» (número del proveedor con sugerencia; fechas; términos; vencimiento; sucursal; moneda; **orden de compra**; comisionista; interruptores «Generar documento soporte» y «Recepcionar al confirmar») + `SupplierPicker field` + `DocumentLinesTable edición` (buscar producto con `ProductSearchDialog`, ítem manual) + «Notas y documento soporte» + `DocumentTotals compra` + «Impuestos y retenciones» | `NuevaFacturaForm`, `InformacionBasicaForm`, `ItemsListForm`, `SelectedProductsTable`, `ManualItemDialog`, `ImpuestosFacturaCompra`, `ResumenFactura`, `FormActions`, `SupplierSelector`, `EditarFacturaCompra` |
| PDF de la factura de compra | `21-documento-factura-compra.png` (+ estados `21-documento-estado-*.png`) | `GET /api/facturas-compra/[id]/pdf` → plantilla `compra` del motor | `pdfService` (compra) |
| **CxP: listado** | Cartera `445:1950xx` «cuentas por pagar — listo · cargando · vacío · error · selección · menú» + móvil; `26-cartera-08-pagar-listado.png`, `26-cartera-13-pagar-movil.png`, `26-cartera-seccion-03-cuentas-por-pagar.png` | `PageHeader` (Exportar a banca · **Aprobaciones (n)**) + `BranchBadgeActiva` + `KpiStrip` (Total por pagar · Al día · Vencida · Próximo vencimiento) + `BandaAntiguedad` + `ListToolbar` + `DataTable` (Proveedor+NIT · Documento (factura/OC) · Vencimiento + «vencida hace n d» · Monto · Saldo · **Cuotas** · **Antigüedad** · Estado · acciones rápidas Pagar y Programar · «⋯») + `BulkActionBar` (Exportar a banca, con importe) | `CuentasPorPagarPage`, `ResumenCuentasPorPagar`, `CuentasPorPagarFiltros`, `CuentasPorPagarTable` |
| **CxP: detalle** | «Detalle cuenta por pagar — listo · cargando · no encontrada · sin plan» + móvil; Sección 20 Y1–Y6 (`740:53505`); `26-cartera-09-pagar-detalle.png`, `26-cartera-seccion-04-detalle-pagar.png` | `DocumentHeader detalle` (Estado de cuenta · Programar pago · Registrar pago) + `KpiStrip` (Monto original · Saldo · Vence · Antigüedad) + «Documento de origen» (Ver factura · asiento · OC) + `PlanCuotas` (Abonar por cuota) + «Historial de pagos» (con «Aplicado a») + tarjeta «Proveedor» + «Programación y aprobación» (Registrar pago · Programar pago · **Ajustar saldo**, Nuevo) | `CuentaPorPagarDetailPage`, `AccountActionsCard`, `InstallmentsCard`, `PaymentHistoryCard`, `AccountStatusBadge`; **`/[id]/cuotas` se absorbe** (redirección al detalle) |
| Diálogos de CxP | `26-cartera-10-dialogo-abono.png`, `-11-dialogo-ajuste.png`, `26-cartera-seccion-05-dialogos.png` | `RegistrarPagoDialog destino=cuenta` con cuota; «Crear plan de cuotas»; «Programar pago» (fecha propia + justificación); «Ajustar saldo» | `RegistrarPagoModal` (CxP), `ProgramarPagoModal` |
| Aprobaciones | **no dibujado** (PARIDAD-CARTERA §4 #61-68: «siguiente pantalla a dibujar») | `PanelAdaptable` con `DataTable` compacta (proveedor, documento, fecha programada, monto, solicitante, comentario) y aprobar o rechazar con motivo; sin frame, se construye con el kit y se anota | `AprobacionPagosModal` |
| Exportar a banca | **omitido en el diseño** (duda 2) | se conserva la lógica de `formatosBanca.ts` detrás de la `BulkActionBar`; diálogo mínimo con `Dialogo` | `ExportarBancaModal` (UI) |
| Estado de cuenta del proveedor | Y3 (sin id); `52-documentos-estado-de-cuenta-dialogo.png` | `EstadoCuentaDialog` + `GET /api/proveedores/[id]/estado-cuenta?formato=pdf` | `.txt` |

### 3.3 Qué se comparte con ventas, cajas y POS (no duplicar)

- **Cajas / POS**:
  - `RegistrarPagoDialog` en efectivo necesita la caja abierta de la sucursal (P5 y P6). Se lee con el servicio de cajas existente, sin reescribirlo.
  - El recibo en ticket de 80 mm es la variante `ticket-80` de `DocumentoImpreso`: plantilla del agente de impresión, zona de cajas.
- **Ventas / CxC**: `RegistrarPagoDialog`, `RepartoPago`, `BandaAntiguedad`, `PlanCuotas`, `EstadoCuentaDialog`, `DocumentHeader`, `DocumentLinesTable`, `DocumentTotals`, el motor PDF y el futuro `fn_registrar_pago`/`POST /api/pagos`.
- **Órdenes de compra**:
  - `DocumentLinesTable Mode=recepción` y `SupplierPicker`.
  - La RPC de kardex de compra (F1.3), que debe usar también la recepción de OC.
  - La factura desde la OC (F6).

### 3.4 Estados: una tabla, sin escribir estados a mano

| Concepto | Fuente de verdad | Valores que se muestran |
|---|---|---|
| Ciclo del documento | `invoice_purchase.status`: `draft` → `received` (confirmada) → `void` | Borrador · Confirmada/Recibida · Anulada |
| Pago | **derivado** de `balance` y `total` (disparadores) | Pendiente · Pago parcial · Pagada · Vencida n d |
| Recepción | **derivado** de que existan `stock_movements` `source='purchase'` y `source_id` = factura, o de la columna nueva `stock_received_at` (F1.5) | Por recibir · Recibido · No aplica (sin productos) |
| CxP | `accounts_payable.status` + `balance` (disparador) | Pendiente · Pago parcial · Pagada · Anulada |

Los estados `paid` y `partial` de `invoice_purchase` quedan como históricos. Hay 4 facturas `partial`, todas sin
líneas, y el CHECK los admite. Ninguna pantalla nueva los escribe.

---

## 4. Plan por pasos pequeños y verificables

Reglas en todos los pasos:

- Commits directo en `main` (`feat(GO-<id>): …`), sin push sin autorización.
- `git status -sb` y `git diff --cached` antes de cada commit: el árbol se comparte.
- Migraciones solo por el MCP, cada una con su `.sql` en `supabase/migrations/` y su reversión en `supabase/rollbacks/`, aditivas y sin nombres de organizaciones.
- Textos en `es/en/fr/pt`.
- Cierre de cada paso:
  - `npx jest` (más `npm run test:tz-all` cuando hay fechas).
  - `npx tsc --noEmit -p tsconfig.json` (con más heap, ver la memoria de tsc).
  - `npx next build`.
  - Verificación en el navegador con `preview_start`.
- La ruta vieja sigue funcionando hasta que su sustituta está verificada. Se cambia **el componente que monta la página**, no la URL.

### F0 · Red de seguridad (sin cambio de comportamiento)

1. Escribir los tests de caracterización L1–L15 (§2) contra el código de hoy.
2. Extraer a funciones puras, sin cambiar resultados:
   - `validarMontoPago`, `calcularTotalesCompra` (misma regla que `splitGrossLine`, F-51), `tramoAntiguedad`.
   - `accionesPermitidas(estado, recepción, saldo)`.
   - Van en `src/lib/services/compras/logica.ts` y `src/lib/services/cartera/antiguedad.ts`.
3. Namespaces i18n vacíos con su esqueleto en los 4 archivos: `facturasCompra`, `cuentasPorPagar` y `kit.documento`. Si la sesión de venta aún no lo creó, también `pagos`.

- **Archivos**: `src/__tests__/finanzas/compras/*.test.ts`, `src/lib/services/compras/logica.ts`, `messages/{es,en,fr,pt}.json`.
- **Verificación**: jest en verde; sin cambios visibles.

### F1 · Base de datos y RPC (migraciones aditivas)

**F1.1 · Un solo «pagado» por factura de compra.**

- `fn_invoice_purchase_paid(uuid)`: pagos `completed` de los dos orígenes, con una sola regla para `discount_amount` (decisión D5).
- Usarla en `fn_recalc_invoice_totals` (rama de compra), `fn_recalc_invoice_balance_from_payments` y `fn_recalc_accounts_payable_from_payments`.
- **Verificación**: dry-run `DO … RAISE` sobre las 9 facturas con pagos; ningún saldo cambia salvo los que hoy están mal (listarlos).

**F1.2 · La CxP con un solo escritor.**

1. Índice único parcial `accounts_payable (invoice_id) WHERE invoice_id IS NOT NULL`. Hoy hay 0 duplicados.
2. `fn_cxp_asegurar_de_factura(p_invoice_id)`: crea o sincroniza el `amount` con el neto a pagar (total − retenciones, D4), `due_date` y `branch_id`.
3. La llaman la RPC de confirmación, el generador de OC y, previo acuerdo, la RPC del asistente.
4. Disparador `AFTER UPDATE OF total, due_date ON invoice_purchase` que la llama si la factura no está `void`.

**F1.3 · Kardex de compra en la base: `fn_kardex_entrada_compra(p_org, p_branch, p_source, p_source_id, p_lineas jsonb, p_user)`.**

- `SECURITY DEFINER` + `fn_assert_acceso_org`.
- Por línea:
  - `track_stock`.
  - `SELECT … FOR UPDATE` del `stock_levels` con `lot_id IS NULL` (o del lote), y después `UPDATE` o `INSERT`. **Nunca `upsert onConflict`**, por el NULL del UNIQUE.
  - `avg_cost` ponderado.
  - `stock_movements` con `unit_cost` = costo neto (precio − descuento; el IVA descontable no va al costo, D6).
  - `product_costs`: cierra la vigencia abierta (`effective_to = now()`) e inserta la nueva con `supplier_id`, solo si el costo cambió.
- Devuelve las líneas saltadas con su motivo (el mismo contrato que `describeSkippedItems`).
- Idempotente por `(p_source, p_source_id)`.

**F1.4 · RPC de factura:**

- `fn_factura_compra_guardar(p_payload jsonb)`:
  - Borrador nuevo o edición en `draft`.
  - Cabecera, líneas con `total_line` **bruto**, impuestos aplicados, retenciones y seriales, en una transacción.
  - Valida número duplicado por proveedor (sin tocar los 8 grupos duplicados de hoy: la validación aplica a lo nuevo).
- `fn_factura_compra_confirmar(p_id, p_recepcionar bool, p_generar_ds bool)`:
  - `received` + CxP (F1.2) + kardex (F1.3) si se pide + borrador de documento soporte enlazado si se pide.
  - El asiento lo hace el disparador.
- `fn_factura_compra_recepcionar(p_id)`: para las confirmadas sin recepción. Idempotente.
- `fn_void_purchase_invoice` v2, con la misma firma:
  - Contar solo pagos `completed`.
  - Revertir stock con lote.
  - CxP a `status='void'`.
  - Poner `stock_received_at` en NULL.
  - Mantener el contra-asiento espejo.
- `confirm_purchase_invoice` queda como envoltorio de `fn_factura_compra_confirmar(p_id, true, false)`, para que ningún llamador viejo deje mercancía fuera.

**F1.5 · Columnas.**

- `invoice_purchase.stock_received_at timestamptz NULL`, rellenada desde el kardex.
- Tabla `invoice_purchase_withholdings (id, invoice_id, concept, base, rate, amount, tax_code NULL, created_at)` con RLS por la factura.

**F1.6 · Programación y aprobación de pagos.**

- Tabla `ap_payment_schedules`:
  - Columnas: `id, organization_id, branch_id, account_payable_id, installment_id NULL, amount, scheduled_date date, method, bank_account_id, reference, notes, status (pending/approved/rejected/cancelled), requested_by, decided_by, decided_at, decision_comment, payment_id NULL, created_at`.
  - RLS por pertenencia + sucursal.
- `fn_programar_pago`, `fn_aprobar_pago_programado` y `fn_rechazar_pago_programado`:
  - Aprobar crea el pago `completed` **con la `reference` original**; el comentario va a `decision_comment`.
  - Quien aprueba debe tener `finance.approve` y no ser quien programó (D7).
- Migración de datos: hoy hay **0 pagos `pending`** de CxP, y el único programado ya está completado. No hay nada que mover.

**F1.7 · `fn_registrar_pago` + `payments.payment_group_id`.**

- Contrato de CLIENTE-PAGO-ESTADO-CUENTA-UNIFICAR §A.4.
- **Si la sesión de CxC ya la hizo, se reutiliza.** Si no, se hace aquí, genérica: destino factura, cuenta o tercero.
- Idempotente por clave.

**F1.8 · `fn_estado_cuenta_proveedor(p_org, p_supplier, p_desde, p_hasta)`.**

**Verificación de F1**: `get_advisors` sin nuevos avisos de seguridad; dry-run de cada RPC con `DO … RAISE` y `ROLLBACK`; `list_tables` confirma las columnas; los tests de contrato (L4, L6) pasan contra la RPC simulada.

### F2 · Route handlers y servicio de servidor

- `src/lib/services/compras/facturasCompra.server.ts` y `src/lib/services/cartera/cuentasPorPagar.server.ts`: solo llaman a las RPC.
- Rutas, todas con el patrón de `api/factus/support-document/route.ts`:
  - `withOrg` + `readOrgBody` (organización del body distinta → 403 registrado).
  - `requireOrgPermission` y `assertRecordOfOrg` de `src/lib/security/orgGuards.ts` (§1.5).
  - `POST /api/facturas-compra` (guardar)
  - `POST /api/facturas-compra/[id]/confirmar` · `/recepcionar` · `/anular`
  - `GET /api/facturas-compra/[id]/pdf`
  - `POST /api/cuentas-por-pagar/[id]/programaciones` · `POST /api/programaciones-pago/[id]/{aprobar,rechazar}`
  - `POST /api/cuentas-por-pagar/[id]/cuotas` · `POST /api/cuentas-por-pagar/[id]/ajuste`
  - `POST /api/pagos` (compartida)
  - `GET /api/proveedores/[id]/estado-cuenta`
- Permisos: ver `finance.view`; crear, guardar y registrar pago con `finance.create`; recepcionar con `finance.create` + `inventory.create`; anular y ajustar con `finance.void`; aprobar con `finance.approve`.
- Las lecturas de listado siguen en el cliente con RLS (`useListadoServidor`), igual que el resto del kit.
- **Archivos**: los de arriba + `src/__tests__/finanzas/compras/rutas.contract.test.ts` (sesión, organización del body → 403, permiso → 403).
- **Verificación**: jest; `curl` autenticado en el navegador de vista previa.

### F3 · Componentes compartidos del kit (§3.1)

- Uno por commit: `estadoTono` ampliado → `DocumentTotals` (+ `documentoTotales.ts` con tests) → `DocumentLinesTable` → `DocumentHeader` → `SupplierPicker` → `RegistrarPagoDialog` + `RepartoPago` → `EnlacesDocumento` / `HistorialDocumento` → `BandaAntiguedad` → `PlanCuotas` → `AnularDocumentoDialog` → `EstadoCuentaDialog`.
- **Verificación**: `kitLogica.test.ts` ampliado con la lógica pura de cada uno; una página de prueba temporal **no** se deja en el repo. Se verifican al montarse en F4 a F9.

### F4 · Listado de facturas de compra

- **Archivo nuevo**: `src/components/finanzas/facturas-compra/listado/FacturasCompraListado.tsx`, con su hook `useFacturasCompraListado.ts`.
- Las dos `page.tsx` (finanzas e inventario) montan el nuevo. Se mantiene el `basePath`.
- Se quitan los enlaces rotos: «Recepcionar» abre el diálogo y «Proveedores» va a `/app/inventario/proveedores`.
- **Navegador**:
  - Filtros por estado, recepción y proveedor.
  - El KPI «Vencidas» filtra.
  - Paginación 25/50.
  - Selección + barra masiva.
  - Móvil a 375 px, estados vacío y error, y sucursal «Todas».

### F5 · Detalle de factura de compra

- `…/detalle/DetalleFacturaCompraV2.tsx`: acciones según `accionesPermitidas`; recepcionar, anular y pagar por las rutas de F2.
- Se elimina el «Registrar pago» de pruebas en borrador.
- **Navegador**:
  - Borrador → confirmar con «Recepcionar al confirmar» → el kardex muestra la entrada, el costo cambia y aparece la CxP.
  - Pago parcial → los saldos de la factura y de la CxP coinciden.
  - Anular sin pagos → stock revertido y contra-asiento visible.
  - Anular con pagos → bloqueado con motivo.

### F6 · Nueva y editar (y desde orden de compra)

- `…/formulario/FormularioFacturaCompra.tsx`: guarda por `POST /api/facturas-compra`, con «Guardar borrador» y «Confirmar factura».
- Con `?orden=<uuid>` precarga las líneas recibidas pendientes de facturar y escribe `po_id`.
- `generateInvoiceFromPurchaseOrder` pasa a llamar a la misma RPC. Es zona de órdenes de compra: coordinar.
- **Navegador**:
  - IVA 19 % no incluido → el total guardado **lleva** el IVA.
  - Retención 4 % → neto a pagar = total − retención = monto de la CxP.
  - Número duplicado → error en línea.
  - Salir con cambios → confirmación.

### F7 · PDF

- Motor común `src/lib/documentos/` (plantilla HTML de `DocumentoImpreso` + Puppeteer, extraído de `api/facturas-venta/[id]/pdf/route.ts` **sin cambiar su salida**; test de instantánea del HTML de venta antes y después).
- Plantillas: `compra` (según `21-documento-factura-compra.png`), `estado-cuenta-proveedor` y `comprobante-egreso` (recibo del pago a proveedor).
- Añadir las rutas nuevas a la lista del guardarraíl §28.
- **Navegador**: se descarga un `.pdf` real, con moneda de la factura, sin «IVA» cableado, «Documento interno — sin CUFE», marca de agua «Borrador» y «Anulada».

### F8 · Listado de CxP

- `…/cuentas-por-pagar/listado/CuentasPorPagarListado.tsx`: banda de antigüedad con el día de la organización; filtros con valores de la BD.
- Open Finance recibe el uuid (se corrige `Number(uuid)`).
- **Navegador**: filtros por tramo, «Vencida», proveedor y monto; exportar a banca con selección (el test L10 en verde).

### F9 · Detalle de CxP + plan de cuotas

- `…/cuentas-por-pagar/detalle/CuentaPorPagarDetalle.tsx`; `/[id]/cuotas` redirige a `/[id]#cuotas`.
- `pagarCuota` pasa a `POST /api/pagos` con `installment_id`, atómico.
- **Navegador**: crear plan de 3 cuotas → pagar la cuota 2 → el historial dice «Aplicado a cuota 2»; estado de cuenta en PDF.

### F10 · Programar y aprobar

- Diálogo «Programar pago» (fecha y justificación propias) y panel «Aprobaciones».
- **Navegador**:
  - Programar con usuario A → aprobar con A: bloqueado con motivo.
  - Aprobar con B → pago creado con la referencia intacta y el comentario en su columna.
  - Rechazar → la factura se puede anular (ya no la bloquea un pago cancelado).

### F11 · Exportar a banca y Open Finance

- UI mínima sobre `formatosBanca.ts` sin cambiar formatos (duda de ACF abierta).
- `PayWithOpenFinanceDialog` recibe el uuid (`CuentasPorPagarPage.tsx:472`).
- `paymentInitiationService` inserta con `source='account_payable'`, con la moneda de la factura y el `status` real de la transferencia, y **quita el UPDATE manual de la CxP** (`:399-414`). Así su pago sale en el historial y el disparador ajusta los saldos.
- Añadir el archivo al guardarraíl §28 (moneda) y al guardarraíl nuevo de «nadie escribe `accounts_payable`».

### F12 · Documento soporte desde la compra

- Interruptor del formulario → borrador `support_documents` enlazado (F1.4).
- Chip de estado en el listado y el detalle.
- «Ver documento soporte» → `/app/finanzas/documentos-soporte/[id]`.
- Emisión: la cola del servidor, sin tocarla.

### F13 · Limpieza

- Borrar los componentes viejos de §3.2 cuando ninguna ruta los importe (grep).
- Métodos muertos de `FacturasCompraService` y `CuentasPorPagarService`.
- `pdfService` (compra).
- Actualizar el guardarraíl §28.
- Añadir guardarraíles nuevos:
  - Nadie hace `from('accounts_payable').insert|update|delete` fuera de migraciones.
  - Nadie escribe `invoice_purchase.status` desde el cliente.
  - Nadie escribe `product_costs` desde el cliente.
- Entrada en `KIT-CODIGO.md` y en `PROGRESS.md` (anexando).

---

## 5. Riesgos, huecos de datos y decisiones del dueño

### 5.1 Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Cambiar `fn_recalc_invoice_totals` toca también **venta** | La rama de venta no se modifica; test de dry-run con facturas de venta de muestra antes y después (saldos iguales) |
| R2 | Los componentes compartidos se construyen en paralelo por dos sesiones y divergen | Acordar dueño de cada componente antes de F3 (§5.4 D1); nombres y rutas fijados en este documento |
| R3 | El índice único de CxP falla si alguien crea un duplicado entre el análisis y la migración | Consulta de verificación justo antes de aplicar la migración |
| R4 | `fn_kardex_entrada_compra` cambia la recepción de las órdenes de compra | Mismo resultado numérico que `incrementOnPurchase` (test L6), migración de un llamador a la vez |
| R5 | El asistente (otra zona) sigue con su RPC propia | Pedir a la sesión del GO Assistant que llame a `fn_factura_compra_*`; hasta entonces el guardarraíl lo anota como excepción documentada |
| R6 | Editar una factura recibida descuadra el asiento | Solo se edita en `draft`; recibida → anular y rehacer (el diseño ya lo dibuja: «editar no editable») |
| R7 | La anulación genera **dos** efectos contables: el contra-asiento espejo (incluye inventario) **y** el asiento de ajuste de `stock_movements` `purchase_void` (el disparador no excluye `purchase_void`) | Verificar con dry-run; si duplica, excluir `purchase_void` en `fn_auto_journal_stock_movement` (migración con su reversión) |
| R8 | Guardarraíl §28 y los tests de zona horaria enumeran rutas | Actualizarlos en el mismo commit que mueve archivos |
| R9 | `tsc` sin heap da un falso «0 errores» | `NODE_OPTIONS=--max-old-space-size=8192` |

### 5.2 Huecos de datos medidos (2026-09-24, 8 organizaciones con compras)

| Hueco | Conteo | Causa probable |
|---|---|---|
| Facturas de compra por estado | 21 `draft` · 34 `received` · 4 `partial` · 0 `void` | — |
| Facturas **sin líneas** | **23** (5 orgs; 22 con total 0; 21 con asiento de compra; 0 con kardex; 19 editadas después de crearse) | líneas perdidas o nunca guardadas. **La causa no está determinada**; hipótesis: edición que borra e inserta con un fallo en el INSERT, o recálculo con cero líneas |
| CxP con `amount` ≠ total de la factura | **20** (19 con total de factura 0) + 1 con IVA perdido | §0.2 y la fila anterior |
| CxP con saldo ≠ saldo de la factura (no borrador) | **14** | ídem |
| Facturas sin CxP | **2** (1 recibida el 2026-09-23 en org 149) | INSERT de la CxP fallido y silenciado |
| CxP `pending`/`partial` con saldo 0 | **4** | la anulación y los caminos viejos no ajustan el estado |
| Recibidas sin kardex | 15 (13 sin líneas + **2 con productos**) | «Confirmar factura» (§0.1) |
| Asiento de compra ≠ total | **18** (todas con total 0) | ídem, sin líneas |
| Borradores con asiento de compra contabilizado | **8** (ninguno creado al crear la factura; sin `fact_key`) | **`fn_retro_journal_purchases`**: la contabilización retroactiva recorre **todas** las facturas sin asiento, **sin filtrar el estado**, y contabilizó borradores. No se volvió a llamar desde el código (`actualizarEstadoFactura` no tiene llamadores), pero sigue ejecutable: revocar `EXECUTE` o filtrar `status='received'` (migración con reversión) |
| Productos recibidos sin costo nuevo en `product_costs` | 19 de 21 | la recepción no escribe costo |
| Números repetidos por proveedor (sin anular) | 8 grupos | sin UNIQUE |
| Números autogenerados `COMP-…` | 55 de 59 | el formulario sugiere el número y no pide el del proveedor |
| Facturas con `po_id` | 0; y 0 facturas «generada automáticamente desde OC» aunque hay 7 OC `received` y 1 `partial` | el generador de OC no escribe `po_id`; esas recepciones no dejaron factura ni CxP. 3 órdenes sí tienen kardex (4 movimientos): mercancía que entró sin deuda registrada. Revisar con el cliente |
| Pagos a proveedores | 9 (5 `account_payable`, 4 `invoice_purchase`), todos `completed` | — |
| Planes de cuotas | 1 CxP, 3 cuotas; **no suman el monto de la cuenta** | cuotas creadas antes de un cambio de monto |
| Documentos soporte | 0 | — |
| Auditoría de impuesto de línea en compras | 1 `total_line_incoherente` | §0.2 |
| `stock_levels` duplicados con `lot_id` NULL | 0 | — |

### 5.3 Reparación de datos (propuesta, no aplicada)

Se hace por RPC o migración de datos con su reversión. **Ningún asiento contabilizado se edita ni se borra.**

1. **Facturas sin líneas con total 0 y CxP con importe (19)**. El importe verdadero es el de la CxP y el del asiento. Opciones:
   - (a) Restaurar el total de la cabecera desde la CxP, con una línea «Importe sin detalle (recuperado)». El asiento ya existe y queda cuadrado.
   - (b) Anular (contra-asiento espejo) y pedir al cliente que las registre de nuevo.
   - **Recomendación: (a)**, porque conserva lo contabilizado y lo pagado (4 de ellas son `partial`, con pagos).
2. **Borradores con asiento contabilizado (8)**: revertir el asiento con `fn_revertir_asiento_manual` y el motivo «Factura en borrador: el devengo se registrará al confirmar».
   - **Cuidado**: la guarda de `fn_auto_journal_purchase` busca cualquier asiento `memo LIKE 'Compra %'` de la factura. Seguiría encontrando el original revertido y **no crearía el devengo al confirmar**.
   - Antes de revertir, la guarda debe ignorar los asientos que tengan contra-asiento (misma `source_id`, memo de reversión) o usar `fact_key` (`accrual:purchase:<id>`, que estos 8 no tienen). Es una migración con su reversión y su dry-run.
   - Alternativa: si el cliente va a confirmar esos borradores con el mismo total, no revertir y dejar que la confirmación reutilice el asiento existente.
3. **Factura con IVA perdido (1, org 134)**: reescribir `total_line` bruto por RPC; el disparador recalcula; la CxP se sincroniza (F1.2). El asiento no cuadra (se contabilizó sin IVA): reversión y asiento nuevo. Decisión del dueño.
4. **Facturas sin CxP (2)**: `fn_cxp_asegurar_de_factura`.
5. **Recibidas con productos sin kardex (2)**: `fn_factura_compra_recepcionar` **solo si el cliente confirma que la mercancía llegó**. Si no, se deja como está y se marca «Por recibir».
6. **CxP con saldo 0 en `pending`**: estado derivado (`paid` o `void`) por la misma función del disparador.

### 5.4 Decisiones del dueño (con recomendación)

| # | Pregunta | Recomendación |
|---|---|---|
| D1 | ¿Quién construye los componentes compartidos de documento (§3.1) si la sesión de venta/CxC trabaja a la vez? | Esta sesión construye `SupplierPicker`, `DocumentTotals` (con retenciones) y `DocumentLinesTable` (tiene los modos de compra y recepción); la de venta, `DocumentHeader` y `RegistrarPagoDialog`. El motor PDF, quien llegue primero. Todo en `src/components/kit/documento/` |
| D2 | ¿La CxP nace al **guardar el borrador** (hoy) o al **confirmar**? | **Al confirmar.** Un borrador no es una deuda. Hoy hay 20 CxP de borradores: se dejan y se ocultan del listado con el filtro «factura confirmada» (sin borrar nada) |
| D3 | ¿Programación de pagos en tabla propia (`ap_payment_schedules`) o en columnas de `payments`? | **Tabla propia.** Un pago programado no es un pago: hoy cuenta para bloquear la anulación y ensucia historiales y conciliación |
| D4 | ¿La CxP es por el **total** o por el **neto a pagar** (total − retenciones)? | **Neto a pagar**: es lo que se le debe al proveedor; las retenciones son un pasivo con la DIAN (asiento en su cuenta: requiere su regla contable, fase 2 si no existe) |
| D5 | ¿`discount_amount` de un pago cuenta como pagado? (la CxP sí, la factura no) | **Sí en las dos**: un descuento por pronto pago reduce la deuda |
| D6 | Costo en `product_costs`: ¿neto de descuento y sin IVA descontable? | **Sí** (norma contable colombiana para responsables de IVA). Para no responsables, el IVA va al costo: se lee de la configuración fiscal de la organización |
| D7 | ¿Segregación: quien programa no aprueba? | **Sí**, salvo que la organización tenga un solo usuario con `finance.approve` (aviso visible) |
| D8 | ¿`ViewToggle` Tabla · Tarjetas en los listados de documentos? | **No por ahora**: tabla en escritorio y tarjetas en móvil, como el resto del kit. Si se quiere, se reutiliza el del POS |
| D9 | Reparación de datos §5.3 (1 y 3) | (a) restaurar desde la CxP; la org 134, reversión y asiento nuevo |
| D10 | ¿Se exige UNIQUE de número por proveedor? Hay 8 grupos repetidos | Validar en la RPC para lo nuevo ya; índice único cuando el cliente resuelva los 8 grupos |
| D11 | ¿El número sugerido `COMP-AAAA-NNNN` se sigue ofreciendo? | Que el campo pida el **número del proveedor** (obligatorio) y ofrezca el consecutivo interno solo con un botón |
| D12 | ¿El asistente adopta las RPC nuevas? | Sí; pedírselo a su sesión en F1.4 (regla 7) |
| D13 | Anticipos o sobrante al proveedor (FDF pregunta 3) | Sin sobrante en CxP (así está dibujado) |
| D14 | Exportar a banca: ¿qué formatos se soportan de verdad? | Mantener los de `formatosBanca.ts` con sus tests; rediseño cuando se decidan los bancos |

---

## 6. Estado de la implementación (2026-09-24)

### 6.1 Commits en `main` (sin push)

| Paso | Commit | Qué entra |
|---|---|---|
| F0 | `f1ac674c` | 15 pruebas de caracterización (`src/__tests__/finanzas/compras/`) y `lib/services/compras/logica.ts` |
| F1 | `9f1babc4` | 5 migraciones con rollback (ver 6.2): saldos y CxP por el neto, kardex con costo, programación y cuotas, RPC únicas de la factura |
| F2 | `29479229` | Rutas del servidor (`/api/facturas-compra/**`, `/api/cuentas-por-pagar/[id]/**`, `/api/programaciones-pago/[id]/**`, `/api/proveedores/[id]/estado-cuenta`), contrato zod, guardarraíles 23 y 26 |
| F4–F7, F11 | `951b8086` | Listado, detalle y formulario de facturas de compra; migración de listados; OC por la RPC única; Open Finance corregido; pago a proveedor sobre el diálogo único |
| F8–F10, F13 | `698f9cde` | Listado y detalle de CxP, plan de cuotas, estado de cuenta, aprobaciones; guardarraíl 26b |

### 6.2 Migraciones aplicadas por MCP (proyecto `jgmgphmzusbluqhuqihj`)

Todas aditivas, con su `.sql` en `supabase/migrations/` y su reversión en `supabase/rollbacks/`, probadas antes en una transacción que se deshace (dry-run con usuarios de la org 2 y de la org 130 suplantados con `request.jwt.claims`).

1. `20260926100000_compras_f1_saldos_cxp_retenciones` — `stock_received_at`, `invoice_purchase_withholdings`, saldo de CxP y factura recalculado por disparador con el neto, índice único de CxP por factura, `trg_cxp_desde_factura`.
2. `20260926110000_compras_f1_kardex_y_costo` — `fn_kardex_entrada_compra` (candado, `lot_id is not distinct from`, promedio ponderado, `product_costs` con vigencia).
3. `20260926115000_compras_f1_concilia_con_pago_unico` — devuelve a la sesión de ventas su `fn_finanzas_exigir_permiso` y su rama de venta de `fn_recalc_invoice_balance_from_payments` (colisión de F1 corregida).
4. `20260926120000_cxp_f1_programacion_cuotas_estado_cuenta` — `ap_payment_schedules` con RLS, programar/aprobar/rechazar/cancelar (aprobar = `fn_registrar_pago`), plan de cuotas, estado de cuenta del proveedor.
5. `20260926130000_compras_f1_rpc_factura` — `fn_factura_compra_guardar/confirmar/recepcionar/eliminar_borrador/desde_oc`, anulación v2, `purchase_void` en el CHECK, el GO Assistant delega en la RPC y `fn_retro_journal_purchases` filtra y queda revocada.
6. `20260926140000_compras_f4_listados_y_resumenes` — `fn_facturas_compra_listado/resumen`, `fn_cxp_listado/resumen` (INVOKER, RLS de la sesión).

> Aviso para quien despliegue con `supabase db push`: la sesión de ventas dejó migraciones con el **mismo prefijo** `20260926120000` y `20260926130000` que las 4 y 5 (nombres distintos). Por MCP no choca; con la CLI, sí. Renombrar las suyas es cosa de esa sesión.

### 6.3 Decisiones aplicadas (§5.4)

- D1: se consumieron `kit/documento` y los selectores del kit; lo que faltaba se construyó local y se pide en 6.5.
- D2: la CxP nace al confirmar. Las 20 CxP de borradores de los caminos viejos no se tocan; el listado las oculta (`p_incluir_borradores`).
- D3/D7: `ap_payment_schedules`; aprobar registra el pago por el pago único sin tocar `payments.reference`; quien programa no aprueba (la base lo exige).
- D4: CxP por el neto (total − retenciones); el IVA queda en la factura y en su asiento.
- D5: el descuento del pago cuenta como pagado en la CxP y en la factura.
- D6: costo neto de descuento; IVA al costo solo para no responsables (`fiscal_responsibilities` R-99-PN).
- D8: sin `ViewToggle`: tabla en escritorio y tarjetas en móvil.
- D10: número duplicado por proveedor validado en la RPC (sin índice único hasta que se resuelvan los 8 grupos).
- D11: el campo pide el número del proveedor; el consecutivo interno es un botón.
- D12: el GO Assistant ya delega (`assistant_register_purchase_invoice` → RPC única, misma forma de respuesta).
- D13: sin sobrante en CxP.
- D14: `formatosBanca.ts` sin cambios; «Exportar a banca» reutiliza `ExportarBancaModal`.
- Open Finance (la ruta sigue en 501): solo corrección de datos (source `account_payable`, método `transfer`, moneda de la factura, sin saldo a mano, uuid).

### 6.4 Datos históricos: consulta y propuesta (NO aplicada)

El dueño las revisará con su contador. Las cifras siguen iguales tras las migraciones (medidas de nuevo el 2026-09-24):

```sql
with sin_lineas as (
  select ip.id from public.invoice_purchase ip
  where not exists (select 1 from public.invoice_items ii where ii.invoice_purchase_id = ip.id)
),
borradores_con_asiento as (
  select distinct ip.id from public.invoice_purchase ip
  join public.journal_entries je on je.organization_id = ip.organization_id
   and je.source_id = ip.id::text and je.memo like 'Compra %'
  where ip.status = 'draft'
),
cxp_descuadradas as (
  select ap.id from public.accounts_payable ap
  join public.invoice_purchase ip on ip.id = ap.invoice_id
  where ip.status <> 'void'
    and round(ap.amount::numeric, 2) <> round(public.fn_invoice_purchase_neto(ip.id)::numeric, 2)
)
select (select count(*) from sin_lineas)             as sin_lineas,              -- 23
       (select count(*) from borradores_con_asiento) as borradores_con_asiento,  -- 8
       (select count(*) from cxp_descuadradas)       as cxp_descuadradas;        -- 20
```

Para ver el detalle por organización, cambiar cada `select count(*)` por `select ip.organization_id, ip.id, ip.number_ext, ip.status, ip.total` sobre el CTE. La propuesta de reparación es la de §5.3 (restaurar desde la CxP con línea «Importe sin detalle (recuperado)»; revertir los asientos de borrador solo tras ajustar la guarda de `fn_auto_journal_purchase`; `fn_cxp_asegurar_de_factura` para las 2 sin CxP). Nada de esto se ejecutó.

### 6.5 Pedidos a otras sesiones

- **Kit**: reexportar `CampoNumero` desde `@/components/kit` (hoy se importa de `@/components/kit/CampoNumero`); adoptar `BandaAntiguedad`, `PlanCuotasDialog` y `EstadoCuentaProveedorDialog` (hoy en `components/finanzas/cuentas-por-pagar/`) para que CxC y CxP compartan la misma pieza; entrada en `KIT-CODIGO.md`.
- **Motor de documentos**: la `factura-compra` no pinta retenciones ni el neto a pagar (`invoice_purchase_withholdings`); falta el tipo `estado-cuenta-proveedor` (hoy el diálogo descarga CSV).
- **Ventas/CxC**: nada pendiente; CxP usa `RegistrarPagoDialog` + `/api/pagos` con dirección `pago`.

### 6.6 Pendiente y por qué

- **F13, borrar los componentes viejos** (`FacturasCompraPage`, `nueva-factura/*`, `editar/*`, `id/*`, `CuentasPorPagarPage`, `id/*` de CxP) y los métodos muertos de `FacturasCompraService`/`CuentasPorPagarService`: ya no los monta ninguna página (lo fija el guardarraíl 26b), pero los importan las pruebas de caracterización de F0, el guardarraíl 28 y la prueba de banca online de otra sesión, que además está editando `CuentasPorPagarService.ts` y `ExportarBancaModal.tsx` ahora mismo. Se borran cuando esas pruebas apunten a las RPC y esa sesión termine.
- **F7 PDF**: depende del motor (6.5).
- **Verificación en navegador**: el preview activo pide iniciar sesión y las credenciales no se escriben desde el agente; quedan por recorrer en escritorio, tableta y móvil los recorridos de F4–F10.

## 7. Retenciones en el asiento (D4 fase 2) — 2026-09-30

D4 dejó la CxP por el neto (total − retenciones), pero el asiento de la compra seguía acreditando al proveedor por el total y la retención no aparecía como pasivo con la DIAN: la 2105 quedaba mayor que la CxP y el cierre no cuadraba. Esta fase lo resuelve. Detalle completo, clasificación y nodos de Figma en `docs/design/RETENCIONES-COMPRAS.md`.

### 7.1 Migraciones aplicadas por MCP (con rollback; dry-run en transacción que se deshace)

| Versión | Qué hace |
|---|---|
| `20260930073908_compras_asiento_con_retenciones` | Cuentas 2365/2367/2368 bajo el grupo 21 en todas las organizaciones (y en las nuevas, por trigger), plantilla `RETEIVA_15`, `fn_asiento_compra_aplicar_retenciones` y su llamada en `fn_auto_journal_purchase` y `fn_retro_journal_purchases` |
| `20260930074406_compras_cuenta_retencion_por_clase` | `fn_cuenta_retencion_compra`: primero `tax_account_mapping`; si no hay, clase por código o concepto (ReteFuente → 2365, ReteIVA → 2367, ReteICA → 2368) |

### 7.2 Resultado

- Asiento de la compra: débito inventario + IVA; crédito proveedor por el **neto**; una línea de crédito por cada retención en su cuenta. Se valida que cuadre (`ASIENTO_DESCUADRADO`) y, si la retención iguala o supera el total, no se toca el asiento y se registra `withholding_exceeds_total`.
- La línea del proveedor se ajusta solo en el asiento recién creado en la misma transacción, con el permiso de mantenimiento que se restaura al terminar; los asientos ya publicados no se reescriben. Había 0 retenciones históricas: no hizo falta reprocesar.
- Comprobante de egreso: si el pago es de una factura de compra con retenciones, muestra total de la factura, cada retención y el neto a pagar antes del valor pagado (`cargadores/pagos.ts`, reutiliza `filasRetencion` de `cargadores/compras.ts`).
- La nota de §6.5 sobre el motor («la `factura-compra` no pinta retenciones ni el neto») quedó resuelta antes de esta fase; sigue pendiente `estado-cuenta-proveedor`.

### 7.3 Pendiente

- Tipo de documento «Certificado de retenciones» y visor «Retenciones practicadas» (diseñados en Figma, sin código).
- Configuración: mostrar y editar la cuenta de cada retención (`tax_account_mapping`) y la base mínima en UVT.
- Facturas insertadas directamente como `received` (sin pasar por `fn_fc_confirmar_int`) crean el asiento antes de guardar las retenciones y quedan sin sus líneas.

## 8. Retenciones: pantallas de Figma en código (D4 fase 3) — 2026-09-30

Resuelve lo pendiente de §7.3 salvo lo que se lista al final. Detalle por pantalla, nodos de Figma y decisiones en `docs/design/RETENCIONES-COMPRAS.md` §6.

### 8.1 Migraciones aplicadas por MCP (con rollback; registradas en `schema_migrations`)

| Versión | Qué hace |
|---|---|
| `20260930085700_compras_retenciones_configuracion` | UVT por país y año (`fiscal_uvt`), base mínima en UVT (`organization_taxes.min_base_uvt`), una sola clasificación (`fn_clase_retencion`), leer y fijar cuenta y base mínima, cargar la plantilla del país; `tax_account_mapping` ya no se escribe desde el cliente |
| `20260930085948_compras_asiento_previo` | `fn_factura_compra_asiento_previo`: el asiento real de la confirmación dentro de un bloque que siempre se deshace |
| `20260930090435_compras_retenciones_reporte_certificado` | `fn_reporte_retenciones_practicadas` (reporte por rango y sucursal) y `fn_certificado_retenciones_proveedor` (certificado por proveedor y periodo) sobre una sola lectura interna |

### 8.2 Resultado

- Configuración: tipo, cuenta contable (propia o la automática de su clase) y base mínima en UVT y en pesos del año de cada retención; «Cargar plantilla» con las que falten del país.
- Factura: aviso cuando la base no llega a la base mínima (solo avisa) y, al confirmar, el asiento que se va a generar con sumas, cuadre y neto a pagar.
- CxP y pago: documento de origen con retenciones y neto; el pago se registra sobre el neto.
- Asiento: aviso de que al proveedor se le acredita el neto, cadena OC → factura → pagos → retenciones, datos del asiento (fecha, sucursal, origen, moneda, clave del hecho, creado por y cuándo) y centro de costo solo si alguna línea lo tiene.
- Certificado de retenciones (`certificado-retenciones` en el motor de documentos): desde la CxP, la factura, el asiento y el proveedor; periodo elegible, carta, texto del artículo 381 del E.T.
- Reportes «Retenciones practicadas» y «Retenciones por proveedor» en Finanzas, con la sucursal activa.
- Corrección: la moneda de la UVT sale de `countries.default_currency_code` (guardarraíl 28b).

### 8.3 Pruebas

`retencionesUi.test.ts` (15), `retencionesReportes.test.ts` (8), casos nuevos en `rpcBranchId.test.ts` y `migracionBranchId.test.ts` (la RPC nueva se verifica contra su propia migración) y 5 del certificado en `motor.test.ts`.

### 8.4 Pendiente

- El visor genérico de reportes no tiene pestañas, notas ni acciones por fila: la pestaña «Certificados» del diseño se cubre con el certificado desde el proveedor y la CxP; la «Lectura rápida» no se pinta.
- «Regla» en el detalle del asiento: `journal_entries` no guarda la regla que lo armó.
- Facturas insertadas directamente como `received` (sin `fn_fc_confirmar_int`): sigue igual que en §7.3; hoy ningún camino lo hace.
- Recorrido en navegador con sesión real.
