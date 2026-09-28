# Facturas de venta y cuentas por cobrar: plan de implementación del rediseño

Fecha: 2026-09-24 · Fase de **análisis** (solo lectura: código, capturas y `SELECT` por el MCP de Supabase,
proyecto `jgmgphmzusbluqhuqihj`). Etiqueta de respaldo: `backup/antes-rediseno-pos-finanzas-2026-09-24`
(apunta a `24b2b5d7`). Figma: «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`), página
`07 Finanzas` (`264:98915`) y `02 Componentes` (`3:2`). **No se usó el MCP de Figma**: se trabajó con los
documentos de diseño y las capturas de `docs/design/figma/`. Donde falta un id va anotado para leerlo con
`get_metadata` cuando haya cupo.

Encargo del dueño: construir en código el rediseño de **facturas de venta** y **cuentas por cobrar** (Finanzas
y POS), con los componentes del kit reutilizados al máximo, en 4 idiomas, completamente funcional, sin romper
nada y **con los PDF**.

Evidencia en conteos; ninguna organización se nombra. Planes hermanos que este documento respeta y con los que
comparte piezas: `docs/implementacion/FACTURAS-COMPRA-CXP-PLAN.md` (compras y CxP),
`CAJAS-VENTAS-PLAN.md` (cajas y ventas del POS) y `POS-PLAN.md` (pantalla principal del POS).

---

## 0. Resumen: lo que hay que saber antes de tocar nada

1. **Nada de esta zona está en el kit, en i18n ni con permisos.** 0 imports de `@/components/kit`, 0
   `useTranslations`, 0 comprobaciones de permiso en `src/components/finanzas/{facturas-venta,cuentas-por-cobrar,notas-credito}/**`
   (verificado con `grep`). Todo lee y escribe desde el navegador con `@/lib/supabase/config`; la organización
   sale de `localStorage` (`getOrganizationId()` / `obtenerOrganizacionActiva()`).
2. **Cinco caminos escriben saldos o cartera a mano**, contra la regla «los disparadores mandan»:
   - «Marcar pagada»: pone la factura `paid` con saldo 0 **antes** de insertar el pago, y si no hay venta crea
     una fila en `sales` (`DetalleFactura.tsx:338-445`).
   - `RegistrarPagoDialog`: inserta el pago, **además** hace `update invoice_sales` y llama a
     `create_account_receivable` (`id/RegistrarPagoDialog.tsx:186-239`).
   - `AnularFacturaDialog`: `update accounts_receivable set balance 0, status 'paid'` (`:100-107`).
   - `NotaCreditoDialog`: seis escrituras sueltas, dos de ellas a `accounts_receivable` (`:425-448`, `:601-621`).
   - (Fuera de mi zona, contrato del agente del cobro) `posService.ts:2874-2881` al anular una deuda.
3. **No existe ningún componente de documento del diseño** (`DocumentLinesTable`, `DocumentTotals`,
   `RegistrarPagoDialog` único, `CustomerPicker`, `CadenaDocumento`, `DocumentoImpreso`…). Hay dos agentes
   corriendo ahora mismo que los construyen: «Construir componentes compartidos del kit» y «Motor único de
   documentos y PDFs». **Este plan los consume; no los reescribe** (§3.1).
4. **No existe el pago único** (`fn_registrar_pago`, `registrar_cobro_cxc`, `POST /api/pagos`: 0 en la base y
   en el código). Es la pieza central de CxC, de la ficha del cliente, de facturas de venta y de compra, del POS
   y de cajas: la construye **la primera sesión que llegue** (el plan de compras lo dice igual, F1.7).
5. **Anular un abono de cartera no devuelve el saldo.** `fn_recalc_invoice_balance_from_payments` no mira
   `source='account_receivable'` y `update_accounts_receivable_on_payment` solo corre en `INSERT` y **resta**
   (no recalcula). 63 pagos reales usan esa fuente. Hay que arreglarlo antes de ofrecer «Anular abono» (§4 P1.1).
6. **Huecos de datos medidos hoy (H1, H2)** — ver §5.2: los asientos de venta se fijan con el total de la
   cabecera antes de que existan las líneas; la cartera conserva un `amount` viejo en 233 cuentas. Ninguno
   se corrige desde la interfaz; los dos tienen solución en la base, uno de ellos fuera de este plan.
7. **Facturación electrónica ya funciona por cola de servidor** (`90082b83`, `d0b5e948`): la interfaz solo lee
   `invoice_sales.einvoice_status` y el job, y encola con `POST /api/factus/invoice`. Hay 8 envíos retenidos
   con motivo escrito (ninguno aceptado aún).
8. El listado de facturas de hoy baja **todas** las facturas y **todos** los clientes de la organización al
   navegador (35.225 clientes en la base) y pagina en cliente (`FacturasTable.tsx:284-327`). El rediseño pasa a
   consulta paginada en servidor.

---

## 1. Inventario actual

### 1.1 Rutas

| URL | Archivo | Monta | Notas |
|---|---|---|---|
| `/app/finanzas/facturas-venta` | `src/app/app/finanzas/facturas-venta/page.tsx` (6 líneas) | `FacturasVentaPage` (37) → `PageHeader` propio (117), `FacturasProximasVencer` (247), `FacturasFiltros` (385), `FacturasTable` (815), `ImportarCSVDialog` (407) | «Exportar» sin `onClick` (`facturas-venta/PageHeader.tsx:64-78`, auditoría H.3) |
| `/app/finanzas/facturas-venta/nuevo` | `…/nuevo/page.tsx` (22) | `NuevaFacturaForm` (1.622) + `ClienteSelector` (360), `ItemsFactura` (415), `ImpuestosFactura` (558), `FormaPagoSelector` (142), `PageBackHeader` (38) | acepta `?duplicar=` (`DetalleFactura.tsx:682-701`) |
| `/app/finanzas/facturas-venta/[id]` | `…/[id]/page.tsx` (152) | carga `invoice_sales` + `customers`, `invoice_items` + `products`, `payments` y `profiles` desde el navegador (`:39-91`) → `DetalleFactura` (1.205) | «no encontrada» propia (`:126-145`) |
| `/app/finanzas/facturas-venta/[id]/editar` | `…/[id]/editar/page.tsx` | `EditarFacturaVenta` (345) → reutiliza `NuevaFacturaForm` | |
| `/app/finanzas/notas-credito` · `/[id]` | `…/notas-credito/page.tsx`, `/[id]/page.tsx` | `NotasCreditoPage` (413), `NotaCreditoDetalle` (525) | no hay `/nuevo` (el botón lleva a facturas); «Descargar PDF» solo avisa |
| `/app/finanzas/facturacion-electronica` · `/configuracion` | `page.tsx` (381), `configuracion/page.tsx` (9) | `JobsTable`, `StatsCards`, `JobDetailDialog`, `ConfiguracionServicioFE` (357) | bandeja; la configuración ya existe (`2ee27a2b`) |
| `/app/finanzas/cuentas-por-cobrar` | `…/cuentas-por-cobrar/page.tsx` (4) | `CuentasPorCobrarPage` (264): pestañas Cuentas · Aging · Recordatorios · Estadísticas (`:173-187`), `CuentasPorCobrarFiltros` (215), `CuentasPorCobrarTable` (489), `EstadisticasCards` (152), `AgingReport` (316), `RecordatoriosPanel` (354), `AplicarAbonoModal` (424), `EnviarRecordatorioModal` (244) | «volver» a `/app/finanzas` (`:135`) |
| `/app/finanzas/cuentas-por-cobrar/[id]` | `…/[id]/page.tsx` (7) | `CuentaPorCobrarDetailPage` (451), `AccountActionsCard` (556), `InstallmentsCard` (477), `PaymentHistoryCard` (260), `AccountStatusBadge` (49) | estado de cuenta en `.txt` (`:126-130`) |
| `/app/pos/cuentas-por-cobrar` | `src/app/app/pos/cuentas-por-cobrar/page.tsx` (8) | **monta el mismo `CuentasPorCobrarPage` de Finanzas** | no hay `/[id]` en el POS: la fila lleva a Finanzas (`CuentasPorCobrarTable.tsx:139`); sin el módulo `finance` el middleware lo bloquea (POS-PARIDAD §2.6, L3) |
| `/app/finanzas/saldos-a-favor` | `SaldosAFavorPage` (181) + `saldosAFavorService.ts` (138) | `fn_create_customer_credit`, `fn_apply_customer_credit` | servicio fuera de `lib/services` |
| `/app/finanzas/cotizaciones/**` | `DetalleCotizacion`, `NuevaCotizacionForm` | comparten `ItemsFactura` y `PDFService.printInvoiceHTML` (`DetalleCotizacion.tsx:169`) | fuera de alcance salvo componentes compartidos |
| Ficha del cliente, pestaña Cuentas | `src/components/clientes/id/CuentasTab.tsx` | lista la cartera sin acciones | **tiene cambios sin commitear de otra sesión** |

### 1.2 Componentes de hoy: qué leen y qué escriben

Cliente: todos con `@/lib/supabase/config` (navegador).

| Componente | Lee | Escribe | Problema |
|---|---|---|---|
| `FacturasTable.tsx` | `invoice_sales` completas de la org (`:286-309`), **todos** los `customers` de la org (`:312-315`), `payment_methods` global (`:318-320`), `sales` con reserva **sin filtro de organización** (`:323-326`) | — | paginación y búsqueda en cliente; mezcla notas crédito con facturas (no filtra `document_type`); `fechaStr.split('T')[0]` (`:29`, regla 2 de fechas) |
| `FacturasProximasVencer.tsx` | `invoice_sales` (`:74`) | — | el diseño lo sustituye por KPI (D3 de PARIDAD-FACTURAS) |
| `ImportarCSVDialog.tsx` | — | `invoice_sales.insert` (`:209`, `status 'draft'`), `invoice_items.insert` (`:246`) | número libre del CSV |
| `PagosFactura.tsx` | `invoice_sales` (`:66`), RPC `get_invoice_payments` (`:87`) | — | fila expandida del listado |
| `DetalleFactura.tsx` | `profiles` (`:171`), `organizations` (`:192`), NC y `credit_note_applications` (`:227-237`), job de FE (`:249`, `electronicInvoicingService`), `invoice_sales` + RPC `get_invoice_payments` (`:265-285`), RPC `fn_invoice_stock_shortages` (`:533`), `stock_levels` (`:556`), `invoice_items` (`:582`), `stock_movements` (`:598`) | «Marcar pagada»: `sales.insert` (`:350`), `invoice_sales.update balance 0 / paid` (`:373`, `:385`), `payments.insert method 'cash'` (`:397`). «Emitir»: RPC `issue_invoice` (`:653`) + `stockMovementService.decrementOnSale` **desde el navegador** (`:579-633`) | email y WhatsApp son un `toastInfo` (`:450-456`); badges con `dark:` y colores fijos (`:78-85`); PDF por `PDFService.printInvoiceHTML` (`:500`) |
| `id/RegistrarPagoDialog.tsx` | `organization_payment_methods` (`:91`) | `payments.insert` (`:186`), **`invoice_sales.update`** (`:219`), **RPC `create_account_receivable`** (`:239`) | pisa el saldo que ya recalculó el disparador (CLIENTE-PAGO E-5) |
| `id/NotaCreditoDialog.tsx` | factura (`:137`), consecutivo leyendo facturas (`:320`) | `invoice_sales.insert` NC (`:341`), `invoice_items.insert` (`:395`, `:548`), **`invoice_sales.update`** de la NC y de la factura (`:426`, `:434`, `:568`, `:602`), **`accounts_receivable.update`** (`:448`, `:621`), `invoice_applied_taxes` (`:580-592`) | no es atómica; «por valor» con impuesto 0 |
| `id/AnularFacturaDialog.tsx` | `stock_movements` (`:123`), `invoice_items` (`:131`) | `invoice_sales.update status 'void'` (`:88`), **`accounts_receivable.update`** (`:101`), stock de vuelta por `incrementOnPurchase` (`:138`) | bloquea si hay pagos (`:74`) — lógica a preservar |
| `editar/EditarFacturaVenta.tsx` | factura, líneas, impuestos (`:43-67`) | `invoice_sales.update` (`:112`), `invoice_items` delete/update/insert (`:151-206`), `invoice_applied_taxes` (`:215-229`), **`sales.update`** (`:236`) | varios pasos sin transacción |
| `nueva-factura/NuevaFacturaForm.tsx` | monedas (`:269-279`), vendedores (`:339-346`), oportunidad y productos (`:373-404`), duplicado de número (`:531-566`) | **`sales.insert` + `sale_items.insert`** (`:870-881`), `invoice_sales.insert status 'draft'` (`:973`), seriales (`:999`), `invoice_items.insert` o RPC `fn_sync_invoice_items_from_sale` (`:1045-1063`), `invoice_applied_taxes` (`:1078`), **`commissions.insert`** (`:1094`), RPC `fn_invoice_stock_shortages` (`:1129`) | número `FACT-` por `generateInvoiceNumberUtil` leyendo la última (`:589-593`); la comisión también la crea el disparador `trg_create_commission_on_invoice_sale` (riesgo de doble: §5.1) |
| `ClienteSelector.tsx` | `customers` (`:76`, `:159`, `:189`), `customer_company_links` (`:91`) | alta rápida | uno de 3 selectores de cliente (POS-PLAN §3.3) |
| `cuentas-por-cobrar/service.ts` | RPC `get_accounts_receivable_paginated` con `customer_search` y `branch_id_filter` (`:137-150`, arreglado en `24b2b5d7`), `get_account_receivable_detail` (`:93`, `:366`), `invoice_sales` (`:103-111`), `get_accounts_receivable_for_customers` (`:559`), `get_accounts_receivable_stats` (`:590`); estadísticas leyendo **toda** la tabla (`:442-459`) | `payments.insert source 'account_receivable'` con `created_by`, moneda de la factura y día en la zona de la sucursal (`:391-408`); `accounts_receivable.update last_reminder_date` (`:423-430`, única escritura admisible) | aging en el navegador recorriendo todas las páginas (`:228-318`); estado vivo de `@/lib/finanzas/cxcFiltros` (`estadoVivoCxC`) |
| `cuentas-por-cobrar/id/service.ts` | detalle, pagos (`get_payments_filtered` `:231`), cuotas | `payments.insert` (`:284`); `ar_installments` insert/delete/update (`:354-386`, `:473-483`, `:508-511`) **y luego** `aplicarPago` (`:491`): la cuota queda pagada si el pago falla (H.1 #15); `accounts_receivable.update last_reminder_date` + notificación interna (`:549-563`) | no valida caja abierta |
| `AplicarAbonoModal.tsx` | `organization_payment_methods` (`:97`) | vía `aplicarAbono` | sin caja; notas no se envían (H.3) |
| `EnviarRecordatorioModal.tsx` / `RecordatoriosPanel.tsx` | — | solo `last_reminder_date` (`:77`) | **el envío es simulado** |
| `CuentaPorCobrarDetailPage.tsx` | detalle | `.txt` de estado de cuenta con el nombre del cliente en el archivo (`:126-130`) | `parseLocalDate` deprecada (`:17`) |
| Fechas deprecadas | — | — | `parseLocalDate` en `RecordatoriosPanel:11`, `EnviarRecordatorioModal:13`, `CuentaPorCobrarDetailPage:17`, `InstallmentsCard:8`; `toISOString().split` en `CuentasPorCobrarFiltros.tsx:58` |

### 1.3 Servicios, route handlers y PDF

| Pieza | Archivo | Qué hace | Estado |
|---|---|---|---|
| Encolar FE | `POST /api/factus/invoice` (`src/app/api/factus/invoice/route.ts:21-55`) | `withOrg`; verifica que la factura sea de la org; `encolarDocumento` + `procesarAhora` (`@/lib/services/einvoicing/colaFacturacion.server`) | **bien**: la interfaz solo llama aquí |
| Cola FE | `GET/POST /api/factus/process-pending` + cron `*/2` en `vercel.json` | procesa la cola | 8 jobs `pending`, 0 intentos, **retenidos** (`hold_reason`: «Factus emite con la fecha del día de envío… requiere confirmación») |
| NC electrónica | `POST /api/factus/credit-note` (59 líneas) · `debit-note` (24) | por la misma cola | 0 NC enviadas a la DIAN |
| Estado FE en UI | `FactusStatusBadge.tsx` (108), `ElectronicInvoiceStatus.tsx` (80), `SendToFactusButton.tsx` (177), `JobEventsTimeline.tsx` (94) | leen el job y `invoice_sales.einvoice_status` (CHECK `pending/processing/sent/accepted/rejected/failed/cancelled`, **separado de `status`**) | reutilizables |
| PDF factura | `POST /api/facturas-venta/[id]/pdf` (`route.ts`, 295 líneas): `getServerOrgContext` (`:49`), relee la factura de la base (`:28-41`), moneda con `resolverContextoMoneda` (`:71`), puppeteer (`:264-273`), sube a **bucket `invoices` público** y devuelve `getPublicUrl` (`:291-304`) | lo dispara `PDFService.printInvoiceHTML` en segundo plano mientras abre `window.print` con HTML armado **en el navegador** (`pdfService.ts:354-377`) | el bucket sigue público (6 objetos); el body aún se esparce (`...body`, `:75`) aunque los importes se releen |
| PDF HTML genérico | `POST /api/pdf/invoice` (209) | `getServerOrgContext`; lo usan compra y propuestas CRM | — |
| Ruta pública borrada | `src/app/api/facturas-venta/[id]/route.ts` | **borrada sin commitear** por la sesión que cierra rutas públicas | no se recrea un `GET` público |
| Correo | `src/lib/services/crm/email/sendService.ts:160` (`sendEmail`, Resend, adjuntos, `email_messages` con `related_type/related_id`, idempotencia) | canal transaccional ya existente | **se reutiliza** (regla 7) para factura, estado de cuenta y recordatorios |
| Cola genérica | tabla `outbound_jobs` (`kind`, `payload`, `run_at`, `attempts`, `dedupe_key`) + `GET /api/crm/jobs/run` (cron) | ya procesa `crm_event`, grabaciones | base para recordatorios programados |
| Permisos | `usePermission` (`src/hooks/usePermissionContext.ts:176`), patrón servidor `usePermisosCaja` + `GET /api/pos/cajas/permisos`, `exigirPermiso` (`src/lib/services/integrations/accesoIntegraciones.ts:73`), RPC `fn_tiene_permiso(org, code)` | — | 0 usos en esta zona |
| Offline Desktop | `src/lib/offline/replicationManifest.ts`, `rpcLocal.ts`, `offlineCache.ts` | replica `accounts_receivable` y resuelve RPC de lectura localmente | las pantallas nuevas deben seguir leyendo por la misma vía (§2 L16) |

### 1.4 Base de datos (verificada hoy)

**Tablas.** `invoice_sales` (ahora con `einvoice_status`, `einvoice_number`, `einvoice_qr`; `status` CHECK
`draft/issued/paid/partial/void`; `document_type` CHECK `invoice/credit_note/debit_note/proforma/recurring`),
`invoice_items`, `invoice_applied_taxes`, `accounts_receivable` (sin CHECK de `status`), `ar_installments`
(`due_date` es `date`), `payments` (`currency` NN; `bank_account_id` existe, 0 filas lo usan; **no** hay
`payment_group_id` ni `cash_session_id`), `credit_notes` (= saldos a favor), `credit_note_applications`,
`electronic_invoicing_jobs`, `cash_sessions`, `organization_settings` (`key` + `settings jsonb`),
`email_messages`, `outbound_jobs`. Vista `v_cartera_vs_documentos`.

**Disparadores relevantes** (`information_schema.triggers`):

| Tabla | Disparador | Efecto |
|---|---|---|
| `invoice_items` | `trg_normalizar_impuesto_linea` (BEFORE) · `trg_recalc_invoice_totals_{ins,upd,del}` | recalcula `subtotal/tax_total/total/balance` de la factura **solo desde las líneas** (ignora `allowance_charges`) |
| `invoice_sales` | `trg_00_moneda_base_por_defecto` (BEFORE INSERT) | moneda base de la org (ya no `USD`) |
| `invoice_sales` | `tr_create_account_receivable` (INSERT) · `tr_update_account_receivable` (UPDATE) | `create_account_receivable(id)`: crea o sincroniza `amount`, `balance`, `status` (si no es borrador) |
| `invoice_sales` | `trg_auto_journal_sale` (INSERT, UPDATE) | asiento de devengo con `NEW.total` **al pasar a issued/paid/partial**; en UPDATE sale si `OLD.status` ya estaba emitido (H1) |
| `invoice_sales` | `trg_auto_journal_credit_note`, `trg_auto_journal_void`, `trg_create_commission_on_invoice_sale`, `audit_invoice_sales_trigger` | NC, anulación, comisión, auditoría |
| `payments` | `trg_recalc_invoice_balance_from_payments` (INS/UPD/DEL) | recalcula facturas de venta para fuentes `invoice_sales` y `sale` (**no** `account_receivable`) |
| `payments` | `tr_update_accounts_receivable_on_payment` (**solo INSERT**) | `invoice_sales` → copia el saldo a la cartera; `account_receivable` → **resta** y propaga a la factura |
| `payments` | `trg_auto_journal_payment` (INS/UPD), `trg_notify_payment_registered`, `audit_payments_trigger`, `trg_normalize_payment_status` | el asiento del pago no trata anulaciones |
| `accounts_receivable` | `tr_update_days_overdue` (BEFORE UPDATE), `trg_auto_journal_ar`, `trg_ar_mark_customer_purchased` | — |

**Funciones que usa o usará esta zona:** `issue_invoice(uuid)` (pasa a `issued` y llama a
`create_account_receivable`; no toca stock ni numeración), `fn_invoice_sales_paid(uuid)` (suma pagos
`completed` de `invoice_sales`, `sale` **y** `account_receivable`; no resta `change_amount`),
`fn_invoice_stock_shortages`, `fn_sync_invoice_items_from_sale`, `get_invoice_payments`,
`get_accounts_receivable_paginated` (dos firmas), `get_accounts_receivable_stats`, `get_account_receivable_detail`,
`get_payments_filtered`, `fn_cxc_estado_vivo` (nuevo, `24b2b5d7`), `fn_reporte_cxc_aging`,
`fn_create_customer_credit`, `fn_apply_customer_credit`, `fn_register_crm_payment` (la base del pago único),
`fn_get_next_invoice_number` (nadie la llama), `procesar_devolucion` (crea la NC y el saldo a favor de una
devolución), `fn_revertir_asiento*`, `fn_tiene_permiso`, `pos_caja_esperado`. **No existen**
`fn_registrar_pago`, `registrar_cobro_cxc`, `fn_emitir_nota_credito`, `fn_estado_cuenta_cliente`,
`fn_anular_factura`, `anular_venta`.

**Seguridad a anotar (fuera de alcance, se avisa):** `assistant_void_sales_invoice` es ejecutable por `anon`
(`SECURITY INVOKER`, así que RLS lo frena, pero conviene revocar); `payments` admite `DELETE` a cualquier
miembro de la organización (`payments_delete_policy`): el rediseño nunca borra pagos, los anula por RPC.

**Conteos (2026-09-24):**

| Qué | Valor |
|---|---|
| Facturas de venta (`document_type` nulo o `invoice`) | 36 borrador · 761 emitidas · 2.628 pagadas · 56 parciales · 20 anuladas |
| Notas crédito (en `invoice_sales`) | 26 emitidas · 2 anuladas · 0 notas débito |
| Moneda de las facturas | 3.529 en COP (100 %) |
| Cuentas por cobrar | 532 al día · 215 vencidas · 71 parciales · 2.697 pagadas |
| Cuentas con saldo y fecha vencida que la columna `status` no marca | 262 (las corrige `fn_cxc_estado_vivo` al leer) |
| Clientes con más de una CxC abierta (candidatos al pago único) | 124 |
| Cuotas (`ar_installments`) | 3 |
| Saldos a favor activos | 4 |
| Pagos `completed` con `source='account_receivable'` | 63 |
| Jobs de FE | 8 `invoice/pending`, retenidos |
| Organizaciones con «exigir caja abierta» en el POS | 1 |
| Bucket `invoices` | público, 6 objetos |

### 1.5 Permisos

Catálogo `permissions` hoy: `finance.view`, `finance.create`, `finance.void`, `finance.approve`,
`accounting.reverse`, `pos.view`, `pos.create`, `pos.void`, `pos.refund`, `pos_access`,
`crm.customers.{view,create,edit,delete}`. Ninguna pantalla de esta zona los consulta: la única barrera es
el módulo en el middleware y RLS.

---

## 2. Lógicas que hay que preservar, y la prueba de caracterización que va antes

El repo corre jest en `node` sin testing-library. Las pruebas cubren **módulos puros** extraídos sin cambiar
resultados, **guardarraíles de fuente** (patrón `src/__tests__/guardrails.test.ts`) y **SQL en transacción
que se deshace** (`DO … RAISE` por el MCP; el resultado se anota en el propio archivo de prueba). Carpeta:
`src/__tests__/finanzas/ventas/` (nueva).

| # | Lógica | Hoy vive en | Prueba que se escribe ANTES |
|---|---|---|---|
| L1 | Un pago solo inserta en `payments`; saldo de factura = `total − fn_invoice_sales_paid`, con piso 0; la cartera sigue a la factura | disparadores | SQL: pago a una factura emitida y a una parcial → saldo y CxC esperados. Guardarraíl: ningún archivo nuevo contiene `.from('invoice_sales').update(` con `balance`/`status`, ni `.from('accounts_receivable').update(` salvo `last_reminder_date` |
| L2 | Borrador no crea cartera ni asiento; al emitir (`issue_invoice`) nacen la CxC y el asiento **con el total final** porque las líneas ya existen | `create_account_receivable_on_invoice`, `fn_auto_journal_sale` | SQL: borrador + líneas + `issue_invoice` → CxC con `amount = total` y asiento con débito = total |
| L3 | Emisión: bloquea si `fn_invoice_stock_shortages` devuelve faltantes; descuenta stock **una sola vez** (no si la venta del POS ya lo movió: `sale`/`mesa_sale`/`web_sale`) | `DetalleFactura.tsx:529-633` | extraer `debeDescontarStock(factura, movimientosPrevios)` a `src/lib/finanzas/ventas/emision.ts`; casos: factura manual, factura de POS con movimientos, sin productos |
| L4 | Anular: prohibido si hay pagos (total > 0 y saldo < total); motivo obligatorio; devuelve stock si hubo salida; asiento de anulación por disparador | `AnularFacturaDialog.tsx:64-149` | extraer `puedeAnular(factura, pagos)`; SQL: anular una emitida sin pagos → `trg_auto_journal_void` crea el contra-asiento |
| L5 | Abono de cartera: `source='account_receivable'`, `created_by`, moneda de la factura, día en la zona de la **sucursal** | `service.ts:361-417` | ya cubierto en parte por `carteraVencimientos.test.ts`; se añade prueba de contrato del payload |
| L6 | Estado vivo y días vencidos en la zona de la sucursal; parciales vencidas cuentan como vencidas | `fn_cxc_estado_vivo`, `estadoVivoCxC` | ya cubierto (`cxcFiltroClienteYVencidas.test.ts`); se añade `tramoAntiguedad(dias)` (5 tramos: al día · 1-30 · 31-60 · 61-90 · > 90) en `src/lib/finanzas/cartera/antiguedad.ts` **compartido con CxP** |
| L7 | Filtro «Cliente»: uuid → id, texto → nombre | `filtroClienteCxC` | ya cubierto |
| L8 | Recordatorio: cada cuánto toca | `tocaRecordatorio` | ya cubierto |
| L9 | Reparto FIFO: por `due_date` ascendente, desempate por emisión e id; monto por fila ≤ saldo; sobrante **solo** a saldo a favor con casilla | — (nuevo, decisión del dueño) | `repartirFifo(monto, facturas)` en `src/lib/finanzas/pagos/reparto.ts`: una, varias, sobrante, excede, moneda distinta (bloquea) |
| L10 | Nota crédito: cada línea con **su** impuesto; tope = facturado − ya acreditado; excedente sobre factura pagada → saldo a favor (ADR-CC-008); IVA negativo conservado | `NotaCreditoDialog.tsx`, migraciones `…082445`, `…133707`, `notaCreditoExcedente.test.ts` | extraer `lineasAcreditables(factura, ncPrevias)` y `totalesNota(lineas)`; SQL de `fn_recalc_invoice_totals` con una NC mixta 19 % + 8 % |
| L11 | Número de factura único por organización; alerta de duplicado | `NuevaFacturaForm.tsx:531-593` | prueba del contrato actual; el cambio a numeración por sucursal es decisión D9 |
| L12 | Crear una factura manual también crea su `sales` y `sale_items` (lo leen reportes y comisiones) | `NuevaFacturaForm.tsx:870-881` | SQL: contar lo que deja hoy un alta completa (sales, items, impuestos, comisión) para que la RPC nueva deje **lo mismo**; si la comisión sale dos veces, se documenta (§5.1) |
| L13 | FE: la interfaz no escribe `electronic_invoicing_jobs` ni `einvoice_status` | `d0b5e948` | ya cubierto (`src/__tests__/einvoicing/*`); guardarraíl ampliado a los componentes nuevos |
| L14 | Moneda: todo importe con la moneda del documento (`crearFormateadorMoneda`, `useMonedaOrganizacion().paraDocumento`) | varios | guardarraíl: ningún archivo nuevo de esta zona contiene `'COP'` literal ni `toLocaleString` de moneda |
| L15 | Fechas: `timestamptz` con `formatDateInTz`; `ar_installments.due_date` con `formatPlainDate`; día de pago con `instantForDayInTz` | `useFormatDate` | guardarraíl: sin `toISOString().split`, `.split('T')[0]`, `parseLocalDate` ni `formatDate` de `@/utils/Utils` en archivos nuevos; `npm run test:tz-all` |
| L16 | Desktop sin red lee la cartera desde la réplica local | `replicationManifest`, `rpcLocal`, `screensOffline.test.ts` | prueba: el servicio de lectura nuevo de CxC pasa por `offlineCache` igual que el de hoy (o se declara la pantalla solo en línea y se actualiza el manifiesto con su prueba) |
| L17 | Caja: un cobro en efectivo cae en la caja por ventana de tiempo, sucursal y `created_by` (`pos_caja_esperado` separa «abonos» `account_receivable`) | `pos_caja_esperado` | SQL: un abono en efectivo aparece en la línea de abonos de la caja abierta del cajero; efectivo sin caja → error `sin_caja_abierta` (decisión del dueño) |
| L18 | PDF: el contenido sale de la base, nunca del cuerpo; moneda del documento | `api/facturas-venta/[id]/pdf/route.ts` | prueba de ruta: un cuerpo con otro total no cambia el PDF; otra organización → 404 |
| L19 | Permisos resueltos en servidor | — | prueba de cada route handler nuevo: sin permiso → 403 con clave i18n |

---

## 3. Mapa diseño → código

### 3.1 Componentes compartidos: se construyen UNA vez

Hay **dos sesiones trabajando ahora** en el kit compartido y en el motor de documentos, y dos planes
hermanos que ya reservaron nombres. Este plan adopta sus nombres y **no crea duplicados**. Ubicación
propuesta por el plan de compras: `src/components/kit/documento/`, textos en `kit.documento`. El plan de
cajas propone `src/components/shared/pagos/` y `shared/documentos/` para las piezas con dominio: **hay que
decidir una sola** (D1). Donde dice «dueño», es la sesión que lo construye; las demás lo importan.

| Componente (Figma) | Id | Código | Dueño probable | Uso en este plan | Sustituye |
|---|---|---|---|---|---|
| `PageHeader` | `109:4573` | `kit/PageHeader.tsx` (existe) | — | todos los listados y detalles (`variante` list · detail · form; `badge`; `debajo` con `BranchBadgeActiva` o `TabBar`) | `facturas-venta/PageHeader.tsx`, `PageBackHeader.tsx`, cabeceras de `DetalleFactura` y `CuentaPorCobrarDetailPage` |
| `DocumentHeader` | set en `02 › Finanzas` (id sin anotar) | `kit/documento/DocumentHeader.tsx` = `PageHeader` + badges de estado y DIAN | kit | detalle y formulario de factura; detalle de CxC | ídem |
| `DocumentStatusBadge` | ídem | **no se crea**: `kit/StatusBadge` + `kit/estadoTono.ts`, ampliando con «Al día» (`current`), «Emitida», «Convertida», «Pago parcial» | kit (primero en `SISTEMA-BADGES.md`) | estado de factura y de cartera | `estadoColors` (`DetalleFactura.tsx:78-85`), `getStatusColor` (`FacturasTable.tsx:79-104`), `AccountStatusBadge.tsx` |
| `FactusStatusBadge` / estado DIAN | `729:18575` (`DianPanel`), `729:18030` (`DianTimeline`) | se conserva `finanzas/facturacion-electronica/FactusStatusBadge.tsx` pasado a la escala de `Badge`; `DianPanel` nuevo en la misma carpeta | sesión de facturación electrónica (si no hay, este plan) | columna «Fact. electrónica», tarjeta DIAN del detalle | badge propio |
| `DocumentLinesTable` (lectura · edición × table · cards) | set en `02 › Finanzas` | `kit/documento/DocumentLinesTable.tsx` | kit / compras | líneas del detalle y del formulario; NC por líneas | `ItemsDetalle.tsx` (180), `ItemsFactura.tsx` (415) |
| `DocumentTotals` (venta · compra · cotización) | ídem | `kit/documento/DocumentTotals.tsx` + lógica pura; **debe apoyarse en `FilaDato`/`ResumenTotales`** del POS (no dos bloques de totales) | kit / compras | resumen del detalle y del formulario, con base por impuesto y retenciones informativas | resumen de `DetalleFactura`, `ImpuestosFactura` (558) |
| `CustomerPicker` | `849:558484…` | `kit/CustomerPicker.tsx` (POS-PLAN §3.3) | sesión del POS | cliente de la nueva factura; filtro «Cliente» de facturas y de CxC | `ClienteSelector.tsx` (360) |
| `ProductPicker` | `161:8041` | `shared/product-search/ProductSearchDialog` (existe) | — | «Buscar producto» en líneas | `ItemsFactura` (búsqueda) |
| `RegistrarPagoDialog` + `RepartoPago` | `730:20644`, `730:19157`; Sección `741:53717` (P1 `741:53911` … P6 sin caja `741:54971` … M1 `741:55995`) | `kit/documento/RegistrarPagoDialog.tsx` sobre `kit/PanelAdaptable` + `POST /api/pagos` | **la primera sesión que llegue** (compras F1.7 lo dice igual) | registrar pago en factura, abono en CxC (con cuota), pago del cliente con reparto FIFO + sobrante, cobro en CxC del POS | `id/RegistrarPagoDialog.tsx` (399), `AplicarAbonoModal.tsx` (424), pagos de `AccountActionsCard`/`InstallmentsCard`, «Marcar pagada» |
| `CadenaDocumento` / `ChipDocumento` / `RelatedLinkCard` | `680:409052`, `680:406423` (+5 tipos `729:18827…18863`), `580:277907` | `RelatedLinkCard` existe; cadena en `kit/documento/EnlacesDocumento.tsx` o `shared/documentos/` (D1) | cajas-ventas (detalle de venta) | «Enlaces del documento» (CxC, asiento, reserva PMS, comisión), columna «Documento» de CxC, «Cadena» del detalle de CxC | — |
| `HistorialDocumento` | captura `20-facturas-venta-detalle.png` | `kit/documento/HistorialDocumento.tsx` (lee `finance_audit_log` por route handler) | compras | «Historial» de la factura | — |
| `BandaAntiguedad` | `26-cartera-01-cobrar-listado.png` | `kit/documento/BandaAntiguedad.tsx` + `src/lib/finanzas/cartera/antiguedad.ts` | compras (CxP) | CxC Finanzas, CxC POS, cartera del cliente | pestaña «Aging» (`AgingReport.tsx`) |
| `PlanCuotas` | `740:49675` (X1), `740:51002` (X1b) | `kit/documento/PlanCuotas.tsx` | compras | detalle de CxC | `InstallmentsCard.tsx` (477) |
| `EstadoCuentaDialog` | `740:52422` (X3) | `kit/documento/EstadoCuentaDialog.tsx` | compras | cartera del cliente, detalle de CxC, ficha del cliente | `.txt` |
| `AnularDocumentoDialog` / `DialogoMotivo` | `331:54986` | uno solo sobre `kit/Dialogo` (cajas lo llama `DialogoMotivo`, compras `AnularDocumentoDialog`: D1) | cajas-ventas | anular factura, anular abono | `AnularFacturaDialog.tsx` (199) |
| `SeleccionLineasNota` | `730:18795` | `finanzas/notas/SeleccionLineasNota.tsx` (compuesto con `DocumentLinesTable` modo selección) | **este plan** | NC por líneas (N3 `738:43675`, N4 excede `738:44016`) | tabla de `NotaCreditoDialog` |
| `DocumentoImpreso` (factura · NC · recibo · estado de cuenta × carta · ticket-80 × normal · borrador · anulado) | `731:21879`; instancias D1–D10 en `741:55997` | plantillas en el servidor del motor (`src/lib/documentos/` o `src/lib/documents/`, lo fija la sesión del motor) | **sesión «Motor único de documentos y PDFs»** | PDF de factura, NC, recibo de pago y estado de cuenta | `pdfService.generateInvoiceHTML` / `printInvoiceHTML`, `.txt` |
| `Tarjeta`, `FilaDato`, `KpiCompacto` | `680:406329`, `680:406357`, `680:406370` | kit | cajas-ventas | tarjetas del detalle, KPIs móviles | `Card` sueltas |
| Del kit, tal cual | — | `DataTable`, `ListToolbar`, `SearchInput`, `FilterButton`, `FilterPanel`, `FilterChips`, `Pagination`, `PaginationCompact`, `BulkActionBar`, `RowActionsMenu`, `ActionSheet`, `ListCard`, `EmptyState`, `KpiStrip`, `StatCard`, `BranchBadgeActiva`, `DateRangeButton`, `AccionRapida`, `FormSection`, `FormField`, `CampoNumero`, `SegmentedControl`, `TabBar`, `Dialogo`, `PanelAdaptable`, `MultiSelect`, `useListadoServidor` | — | — | — |

**No se crean:** `ViewToggle` (los listados son `DataTable` en escritorio y `ListCard` en móvil; POS-UX-V2 §7.5
aplica a la rejilla del POS, no a documentos), `SortMenu`.

### 3.2 Pantallas: frame → composición → qué sustituye

| Pantalla | Frames / capturas | Composición nueva | Viejo que desaparece |
|---|---|---|---|
| **Facturas de venta — listado** | `421:167503` listo · `421:168188` cargando · `421:168577`, `421:168957`, `421:169277`, `421:170009`, `421:170742` (vacío, error, selección, filtros, menú: el orden exacto no está anotado) · móvil `421:171523`; `55-coherencia-facturas-venta-listo.png`, `20-facturas-venta-listado.png`, `20-facturas-movil-listado.png`, `22-patrones-finanzas-facturas.png`. Faltan en Figma: sin resultados y sin permiso (escritorio), cargando y vacío (móvil) | `PageHeader` (migas Finanzas › Facturación › Facturas de venta; subtítulo «organización · sucursal · periodo»; Importar CSV · **Nueva factura** · «⋯» con Exportar) + `BranchBadgeActiva` + `KpiStrip` (Facturado en el periodo · Por cobrar · **Vencido, que filtra** · Vence en 15 días) + `ListToolbar` (buscador por número, cliente o referencia; `FilterPanel`: estado del documento, estado de pago, moneda, periodo con `DateRangeButton`, cliente con `CustomerPicker`, rango de monto; `FilterChips`) + `DataTable` (casilla · Número · Cliente + documento · Emitida · Vencimiento (rojo si vencida) · Total · Saldo · Método · Estado (`StatusBadge`, «Vencida 12 d») · Fact. electrónica · PMS · acciones rápidas «Registrar pago» e «Imprimir» · «⋯») + `Pagination` + `BulkActionBar` (Exportar, Imprimir, Enviar). Móvil: `ListCard` | `FacturasVentaPage`, `PageHeader` propio, `FacturasFiltros`, `FacturasTable` (paginación a mano, fila expandible, `PagosFactura`), `FacturasProximasVencer` |
| **Detalle** | Sección B.2 (`421:*`, ids por frame sin anotar): listo · cargando · no encontrada · anulada y sin pagos + 4 diálogos + móvil; `20-facturas-venta-detalle.png`, `20-facturas-movil-detalle.png` | `DocumentHeader detalle` («Factura FV-00042», cliente · fecha, `StatusBadge` + estado DIAN; Imprimir · PDF · **Enviar** · **Registrar pago** · «⋯» con Duplicar, Nota crédito, PDF/XML DIAN, Enviar a la DIAN, Anular) + `DocumentLinesTable lectura` (SKU, seriales, nota, impuesto `{nombre} {tasa}` «Incluido/Adicional») + «Emisor y receptor» + «Pagos aplicados» (tabla con «⋯» por pago: Ver recibo, **Anular pago**) + `DocumentTotals venta` (base por impuesto, retenciones informativas) + `EnlacesDocumento` (CxC, asiento, reserva PMS, comisión) + `DianPanel` + `HistorialDocumento` | `DetalleFactura` (1.205), `ItemsDetalle`, `PagosDetalle`, `[id]/page.tsx` (carga en el navegador) |
| Diálogo registrar pago | P1–P9 (`741:53911`…), `20-facturas-dialogo-pago.png`, `52-documentos-registrar-pago-componente.png` | `RegistrarPagoDialog destino=factura` (atajos Saldo total · 50 % · Exacto; efectivo con «Recibido» y «Cambio»; sin caja → «Abrir caja», P6) | `id/RegistrarPagoDialog.tsx`, **«Marcar pagada»** (desaparece: D2 de PARIDAD-FACTURAS) |
| Diálogo anular | «Diálogo / Anular factura (motivo)» · N5 anular con nota `738:44234` | `DialogoMotivo`; con pagos, «Anular» deshabilitado con motivo y oferta «Generar nota crédito»; con FE aceptada, **anular con NC** (motivo 2) | `AnularFacturaDialog.tsx` |
| Nota crédito | Sección 17 `738:41958`: N2 elegir factura `738:43325`, N3 por líneas `738:43675`, N4 excede `738:44016`, N7 aceptada `738:44455`, N8 rechazada `738:45447`, estados N9–N13, M1 `738:48204`, M2 `738:48462`; `52-documentos-nota-credito-por-lineas.png`, `-nota-credito-detalle.png` | `PanelAdaptable` en dos pasos: motivo DIAN + descripción, `SegmentedControl` Toda la factura · Por líneas · Por valor, `SeleccionLineasNota`, «Qué pasa al emitir», «Reingresar mercancía», Guardar borrador · Emitir y enviar a la DIAN → `POST /api/facturas-venta/[id]/nota-credito` | `NotaCreditoDialog.tsx` (845); `NotaCreditoDetalle` gana `DocumentHeader`, `DianPanel` y PDF real |
| **Nueva / editar** | Sección B.3/B.4: nueva listo · nueva vacía · editar cargando · editar no editable + `CustomerPicker` · `ProductPicker` · salir sin guardar + móvil; `20-facturas-venta-nueva.png` | `DocumentHeader formulario` (Cancelar · **Guardar borrador** · **Emitir factura**) + «Datos del documento» (prefijo + consecutivo de la resolución, fechas, términos, vencimiento, sucursal, moneda, forma de pago, vendedor, interruptor FE «Global», «Incluir en el arqueo») + tarjeta «Cliente» (`CustomerPicker` con Cambiar · Ver · Quitar) + `DocumentLinesTable edición` (Buscar producto · Agregar ítem manual; impuesto por línea con `MultiSelect`) + «Notas y términos» + «Comisión del vendedor» + `DocumentTotals venta` + «Impuestos de la organización»; salir con cambios → `ui/confirm-dialog` | `NuevaFacturaForm` (1.622), `ClienteSelector`, `ItemsFactura`, `ImpuestosFactura`, `FormaPagoSelector`, `PageBackHeader`, `EditarFacturaVenta` |
| PDF de la factura | `21-documento-factura-venta-p1.png`, `-p2.png`, `-venta-usd.png`, `-estado-{borrador,anulada,pagada,saldo-pendiente,sin-logo}.png`, `-media-carta.png`, `-ticket-80mm.png`; `DocumentoImpreso` `731:21879` | `GET /api/facturas-venta/[id]/pdf?formato=carta|media-carta|ticket-80` → plantilla `factura` del motor (payload en servidor, moneda del documento, QR local, sin «IVA» cableado) | `pdfService.printInvoiceHTML` + `window.print`; `POST …/pdf` queda como compatibilidad hasta retirar su llamador |
| Enviar | `20-facturas-venta-detalle.png` («Enviar»); C10 de cotizaciones `739:50870` como referencia de diálogo | `Dialogo` Correo · WhatsApp: correo por `sendEmail` del CRM con el PDF adjunto; WhatsApp según D6 | `toastInfo` de `DetalleFactura.tsx:450-456` y `FacturasTable.tsx:642-669` |
| **CxC — listado (Finanzas)** | `448:201605` listo · `448:209446`, `448:210159`, `448:210800` (cargando, vacío, error) · `448:211447` selección · `448:219087`, `449:207127` · móvil `449:214437`; `26-cartera-01…06`. Faltan: sin resultados y sin permiso (escritorio), cargando y vacío (móvil) | `PageHeader` (migas Finanzas › Cartera › Cuentas por cobrar; Exportar CSV · Actualizar) + `BranchBadgeActiva` + `KpiStrip` (Total por cobrar · Al día · Vencida · Promedio de cobro) + `BandaAntiguedad` (filtra) + `ListToolbar` + `DataTable` (Cliente + documento · Documento (factura o venta POS) · Vencimiento + «vencida hace n d» · Monto · Saldo · **Cuotas** · Antigüedad · Estado · acciones rápidas «Registrar abono» y «Enviar recordatorio» · «⋯») + `BulkActionBar` (Enviar recordatorio · Registrar abono · Exportar · «⋯» Dar de baja) | `CuentasPorCobrarPage` y sus 4 pestañas, `CuentasPorCobrarFiltros`, `CuentasPorCobrarTable`, `EstadisticasCards`, `AgingReport`, `RecordatoriosPanel` |
| **CxC — detalle** | X1 con cuotas `740:49675`, X1b pago de cuota `740:51002`, X5 sin permiso `740:52867`, X6 móvil `740:53238`; Cartera `445:1950xx` (listo · cargando · no encontrada · pagada); `52-documentos-cxc-detalle-cuotas.png`, `26-cartera-07-cobrar-detalle.png` | `DocumentHeader detalle` («Cuenta por cobrar · FV-1038», badge; Estado de cuenta · Enviar recordatorio · **Registrar pago** · «⋯» Ajustar saldo, Actualizar) + `KpiStrip` (Monto original · Pagado · Saldo · Próxima cuota) + `PlanCuotas` («Pagar cuota») + «Pagos recibidos» (recibo, método, referencia, aplicado, «⋯» Anular pago) + tarjeta «Cliente» (cartera total, «Ver cartera del cliente») + «Cadena» (factura → CxC → pagos → asiento) | `CuentaPorCobrarDetailPage`, `AccountActionsCard`, `InstallmentsCard`, `PaymentHistoryCard`, `AccountStatusBadge` |
| **Cartera del cliente** (Nuevo) | X2 `740:51004`, X2b pago a varias con sobrante `740:52151`, X4 sin resultados `740:52424`; `52-documentos-cartera-cliente.png`, `52-documentos-registrar-pago-sobrante.png` | ruta nueva `/app/finanzas/cuentas-por-cobrar/cliente/[customerId]`: `PageHeader` (Estado de cuenta · **Registrar pago**) + `KpiStrip` (Saldo total · Vencido · Saldo a favor · Paga en promedio) + franja de antigüedad + `DataTable` de facturas abiertas con casilla → `RegistrarPagoDialog destino=tercero` (FIFO + sobrante) | — (no existe) |
| Estado de cuenta | X3 `740:52422`; `52-documentos-estado-de-cuenta-dialogo.png` | `EstadoCuentaDialog` (Desde · Hasta (corte, día de la org) · incluir pagadas · PDF/Excel · Correo/WhatsApp con `PhoneInput` · mensaje · vista previa) → `GET /api/clientes/[id]/estado-cuenta` | `.txt` de `CuentaPorCobrarDetailPage.tsx:126-130` |
| Recordatorio | `26-cartera-12-dialogo-recordatorio.png` | `Dialogo` con canal y plantilla; historial en el detalle | `EnviarRecordatorioModal` (simulado) |
| Ajustar saldo (Nuevo) | `26-cartera-11-dialogo-ajuste.png` | `Dialogo` con motivo obligatorio → RPC (D12) | «Marcar como cobrada» |
| **CxC del POS** | **no dibujado**: P-C de POS-PARIDAD §7 («Cuentas por cobrar — POS», pendiente por cupo); base `448:201605` y `413:13096` | mismas piezas que Finanzas con migas «POS › Cuentas por cobrar», filtro por ventas del POS (D3), detalle propio `/app/pos/cuentas-por-cobrar/[id]` y cobro con caja; los frames se anotan como pendientes | la página de 8 líneas que monta la de Finanzas |

### 3.3 Qué se comparte con compras, ventas, cajas y POS (no duplicar)

- **Pago único**: `RegistrarPagoDialog` + `POST /api/pagos` + `fn_registrar_pago` sirven para factura de venta,
  CxC, ficha del cliente, CxC del POS, «Registrar cobro» del detalle de venta (cajas-ventas §3.3), factura de
  compra y CxP. Una implementación.
- **Caja**: el diálogo lee la caja abierta con `CajasService.getActiveSession()` (`CajasService.ts:133`) o su
  equivalente de servidor; la validación dura va en la RPC. El recibo de 80 mm es la variante `ticket-80` del motor
  (plantilla del agente de impresión, zona de cajas).
- **Nota crédito**: `procesar_devolucion` (devoluciones, `a98961ea`) ya crea NC y saldo a favor. La RPC nueva de
  NC desde Finanzas debe **compartir la función interna** que arma la NC (misma numeración, mismo impuesto por
  línea, mismo excedente), no copiarla (regla 7). Se acuerda con la sesión de devoluciones.
- **Anulación de venta del POS**: si la factura tiene `sale_id` de una venta del POS, «Anular» en Finanzas llama a
  la RPC de anulación del agente del cobro (`anular_venta` o el nombre que fije). Finanzas solo implementa la
  anulación de facturas manuales (sin venta del POS) o delega también en esa RPC si su contrato lo admite.
- **Antigüedad, plan de cuotas, estado de cuenta, historial, enlaces**: mismos componentes que CxP.
- **Motor de documentos**: plantillas `factura`, `nota_credito`, `recibo`, `estado_cuenta`; la de cierre de caja es
  de cajas; la de compra y OC, de compras.

### 3.4 Estados: una tabla, sin escribir estados a mano

| Concepto | Fuente de verdad | Se muestra |
|---|---|---|
| Documento | `invoice_sales.status` (`draft` → `issued` → `void`) | Borrador · Emitida · Anulada |
| Pago | **derivado** de `balance`, `total` y `due_date` (los estados `paid`/`partial` los pone el disparador) | Pendiente · Pago parcial · Pagada · Vencida n d |
| DIAN | `einvoice_status` + job | Sin FE · En cola · Enviada · Aceptada · Rechazada · Error · Cancelada |
| Cartera | `status` + `fn_cxc_estado_vivo` (estado efectivo con días en la zona de la sucursal) | Al día · Pago parcial · Vencida n d · Pagada · Anulada |
| Cuota | `ar_installments.status` (CHECK `pending/partial/paid/overdue/written_off`) | Pendiente · Parcial · Pagada · Vencida · Castigada |

---

## 4. Plan por pasos pequeños y verificables

Reglas de todos los pasos:

- Commits directo en `main` (`feat(GO-<id>): …`); **sin push** sin autorización. `git status -sb` y
  `git diff --cached` antes de cada commit: el árbol y el índice se comparten con otras sesiones.
- Migraciones solo por el MCP, con `.sql` en `supabase/migrations/` y reversión en `supabase/rollbacks/` en el
  mismo commit; aditivas; sin nombres de organizaciones en `comment on`.
- Cada paso cierra con `npx jest`, `npm run test:tz-all` si hay fechas, `npx tsc --noEmit -p tsconfig.json`
  (con más heap), `npx next build` y **navegador**: `preview_start` con la organización de pruebas, a 1440,
  1024 y 390, claro y oscuro (tokens, sin `dark:`), revisando consola y red.
- La URL no cambia; cambia el componente que monta la página. La pantalla vieja sigue hasta verificar la nueva.
- i18n: namespaces nuevos `facturasVenta`, `cartera` (compartido por Finanzas y POS), `pagos` (si no lo creó
  otra sesión) y `documentos` (rótulos del PDF, leídos en servidor), más las claves que falten en `kit.documento`
  y `kit.estados`. Toda clave entra a la vez en `es`, `en`, `fr` y `pt` (`traduccionesModulos.test.ts`).
  Edición cuidadosa de `messages/*.json`: otras sesiones los editan en paralelo.

### P0 · Red de seguridad y coordinación (sin cambio visible)

1. Leer los contratos que hayan aterrizado de: kit compartido, motor de documentos, cobro del POS (anulación,
   deuda, flete) y devoluciones. Confirmar nombres y ubicación (D1). Si `fn_registrar_pago` ya existe, se usa.
2. Pruebas L1–L19 (§2), contra el código de hoy.
3. Extraer sin cambiar resultados: `debeDescontarStock`, `puedeAnular`, `lineasAcreditables`, `totalesNota`,
   `repartirFifo`, `tramoAntiguedad`, `accionesFactura(estado, saldo, fe, permisos)`.
4. Esqueleto de namespaces en los 4 idiomas.

- Archivos: `src/__tests__/finanzas/ventas/*.test.ts`, `src/lib/finanzas/ventas/*.ts`,
  `src/lib/finanzas/pagos/reparto.ts`, `src/lib/finanzas/cartera/antiguedad.ts`, `messages/*.json`.
- Verificación: jest en verde; ninguna pantalla cambia.

### P1 · Base de datos (migraciones aditivas; dry-run con `DO … RAISE` antes de aplicar)

1. **P1.1 Pagos de cartera simétricos.** `fn_recalc_invoice_balance_from_payments` incluye
   `source='account_receivable'` para ventas (como ya hace con `account_payable`), y
   `update_accounts_receivable_on_payment` deja de restar: recalcula con `fn_invoice_sales_paid`. Resultado:
   anular o corregir un abono devuelve el saldo solo. Dry-run sobre los 63 pagos de esa fuente: ningún saldo
   vigente cambia (listar los que sí).
2. **P1.2 Pago único** `fn_registrar_pago(p_direccion, p_aplicaciones jsonb, p_metodo, p_moneda, p_fecha date,
   p_referencia, p_cuenta_bancaria, p_recibido, p_anticipo, p_cuota_ids, p_clave_idempotencia)` según
   CLIENTE-PAGO §A.4 y sobre `fn_register_crm_payment`: autor de `auth.uid()`, `FOR UPDATE` por id, monto ≤ saldo,
   misma moneda, **efectivo sin caja abierta → error `sin_caja_abierta`** (según el modo de caja de la
   organización), un `payments` por aplicación con la convención de fuente de D2, `change_amount` solo en la
   primera fila, cuotas en la misma transacción, anticipo con `fn_create_customer_credit`. Columna
   `payments.payment_group_id uuid NULL` + índice. Recibo según D5. Nunca escribe saldos.
3. **P1.3 Anular pago** `fn_anular_pago(p_payment_id, p_motivo)`: `status='void'` (los disparadores recalculan),
   contra-asiento con `fn_revertir_asiento` del asiento del pago (hoy `fn_auto_journal_payment` no trata
   anulaciones), motivo en `finance_audit_log`; permiso `finance.void`.
4. **P1.4 Factura de venta en una transacción**: `fn_factura_venta_guardar(p_payload)` (borrador: cabecera,
   líneas, impuestos, seriales, comisión y la `sales` que hoy crea el formulario, L12) y
   `fn_factura_venta_emitir(p_id)` (`issue_invoice` + faltantes de stock + salida de kardex en la base, una sola
   vez, L3 + numeración según D9). La FE se encola después por la ruta existente, fuera de la transacción.
5. **P1.5 Anular factura** `fn_factura_venta_anular(p_id, p_motivo)`: las reglas de L4 en servidor; stock de
   vuelta; `create_account_receivable` gana la rama `void` → cartera `cancelled` (hoy la deja `paid`). Si la
   factura viene de una venta del POS, delega en la RPC de anulación del agente del cobro.
6. **P1.6 Nota crédito** `fn_emitir_nota_credito(p_invoice_id, p_lineas jsonb, p_motivo_dian, p_descripcion,
   p_reingresar bool, p_modo)` compartiendo la función interna con `procesar_devolucion`; valida el tope por línea;
   excedente a saldo a favor; los disparadores mueven saldo, cartera y asiento.
7. **P1.7 Listado y KPIs en servidor**: `fn_facturas_venta_listado(p_org, p_filtros jsonb, p_orden, p_pagina,
   p_tamano)` (cliente y documento, método, FE, PMS, sin NC por defecto) y `fn_facturas_venta_kpis(p_org, p_desde,
   p_hasta, p_branch)`; para CxC, una RPC de KPIs y de tramos (`fn_cxc_resumen`) que use `fn_cxc_estado_vivo`
   y el `total` de la factura, no `accounts_receivable.amount` (H2).
8. **P1.8 Estado de cuenta** `fn_estado_cuenta_cliente(p_customer_id, p_desde date, p_hasta date)` (bloques de
   CLIENTE-PAGO §B.3; pagos como `amount − change_amount`). Texto legal en `organization_settings`
   (`key='finanzas_estado_cuenta'`) con texto por defecto (decisión del dueño 6).
9. **P1.9 Recordatorios**: tabla `ar_reminders (id, organization_id, account_receivable_id, channel, template,
   status, sent_at, email_message_id, created_by, created_at)` con RLS por pertenencia; `last_reminder_date` se
   sigue escribiendo por la RPC que registra el envío.
10. **P1.10 H2** (decisión D10): resincronizar las 233 carteras con `amount` viejo llamando a la función canónica
    `create_account_receivable(id)` (no se escribe la cartera a mano). Dry-run primero.
11. **P1.11 Ajustar saldo** (D12): `fn_cxc_ajustar_saldo(p_ar_id, p_monto, p_motivo)` con asiento de castigo y
    permiso `finance.approve`, solo si el dueño lo aprueba.

- Verificación: `get_advisors` sin avisos nuevos; `list_tables` confirma columnas; cada RPC con dry-run anotado;
  `REVOKE` de `anon` en todas.

### P2 · Route handlers (servidor, `getServerOrgContext`/`withOrg`, permiso con `fn_tiene_permiso`)

`POST /api/pagos` · `POST /api/pagos/[id]/anular` · `GET /api/facturas-venta` (listado + KPIs) ·
`POST /api/facturas-venta` (guardar) · `GET /api/facturas-venta/[id]` (detalle agregado: factura, líneas, pagos,
NC, enlaces, asiento, job FE, historial) · `POST …/[id]/emitir` · `POST …/[id]/anular` · `POST …/[id]/nota-credito`
· `POST …/[id]/enviar` (correo con `sendEmail` del CRM y el PDF adjunto) · `GET …/[id]/pdf` (motor) ·
`GET /api/cartera` (listado, KPIs, tramos; parámetro `origen=pos`) · `GET /api/cartera/[id]` ·
`POST /api/cartera/[id]/recordatorio` · `GET /api/clientes/[id]/cartera` · `GET /api/clientes/[id]/estado-cuenta`
(`formato=pdf|xlsx`, `enviar=correo|whatsapp`) · `GET /api/finanzas/permisos` (qué acciones puede hacer el
usuario, al estilo de `usePermisosCaja`). Servicios de servidor en `src/lib/services/ventas/facturasVenta.server.ts`
y `src/lib/services/cartera/cuentasPorCobrar.server.ts`, que solo llaman RPC. Organización del body distinta →
403 y registro. **No se recrea** el `GET` público que borró la sesión de seguridad.

- Verificación: pruebas de ruta (L18, L19) con el patrón de `rutasSinPuertaGoSec.test.ts`.

### P3 · Componentes compartidos (§3.1)

Solo los que falten cuando se llegue aquí, con su línea en `KIT-CODIGO.md` y prueba de lógica en
`kit/__tests__/`. Propios de este plan: `SeleccionLineasNota`, `DianPanel` (si nadie lo tomó) y el hook
`usePermisosFinanzas`.

### P4 · Facturas de venta: listado

Archivos: `src/components/finanzas/facturas-venta/listado/*` (nuevo), `src/app/app/finanzas/facturas-venta/page.tsx`.
Navegador: `/app/finanzas/facturas-venta` con filtros en la URL, orden por columna, KPI «Vencido» que filtra,
selección + `BulkActionBar`, menú de fila, vacío, sin resultados, error (cortar red), sin permiso, móvil 390.

### P5 · Detalle

Archivos: `…/facturas-venta/detalle/*`, `[id]/page.tsx` (pasa a leer `GET /api/facturas-venta/[id]`).
Navegador: factura emitida con pagos, borrador (Editar · Emitir), anulada, con NC, con FE aceptada y en cola,
con reserva PMS; «no encontrada» de otra organización.

### P6 · Registrar pago en la factura y anular pago

`RegistrarPagoDialog destino=factura` + «Anular pago» en «Pagos aplicados». Se retira «Marcar pagada».
Navegador: pago parcial, saldo total, excede (bloquea), efectivo con caja (cambio), efectivo sin caja (P6 con
«Abrir caja»), transferencia con referencia obligatoria y cuenta de destino; anular un pago y ver el saldo
volver, la cartera y la caja cuadrar.

### P7 · Emitir, anular y nota crédito

Emisión por `POST …/emitir` (faltantes de stock en el diálogo, no en un toast), anular con `DialogoMotivo`, NC en
dos pasos. Navegador: los tres modos de NC, tope excedido (N4), NC sobre factura pagada (saldo a favor),
reingreso de mercancía y encolado DIAN.

### P8 · Nueva y editar

Mismo formulario para las dos; «Guardar borrador» y «Emitir factura»; salir con cambios. Navegador: alta con
cliente nuevo, ítem manual, varios impuestos por línea, «Impuestos incluidos», comisión, duplicar, editar un
borrador y la pantalla «no editable» de una emitida.

### P9 · PDF y envío

Plantilla `factura` del motor (carta por defecto, media carta y ticket 80 mm; estados borrador, anulada,
pagada, saldo pendiente, sin logo; moneda extranjera declarada). «Enviar» por correo con adjunto y registro en
`email_messages`; WhatsApp según D6. Navegador: descargar, imprimir, abrir el QR, enviar a una casilla de
prueba; comparar contra `21-documento-*.png`.

### P10 · CxC Finanzas: listado

Archivos: `src/components/finanzas/cuentas-por-cobrar/listado/*`. Navegador: banda de antigüedad que filtra,
KPIs, filtros con `CustomerPicker`, selección y acciones en lote, exportar CSV con BOM y sucursal, estados,
móvil; Desktop sin red (L16).

### P11 · CxC Finanzas: detalle

`PlanCuotas`, «Pagos recibidos» con «Aplicado a» y anular, cadena, estado de cuenta, recordatorio, ajustar
saldo (si D12). Navegador: pagar una cuota (una transacción), abono sin cuota, cuenta pagada, «no encontrada».

### P12 · Cartera del cliente y pago con reparto

Ruta `…/cuentas-por-cobrar/cliente/[customerId]`, entrada también desde la ficha del cliente («Registrar pago» y
«Estado de cuenta» en el «⋯»; coordinar con la sesión que tenga `CuentasTab.tsx` abierto). Navegador: X2, X2b con
sobrante a saldo a favor (casilla marcada y desmarcada), estado de cuenta PDF y envío.

### P13 · CxC del POS

`/app/pos/cuentas-por-cobrar` deja de montar la página de Finanzas y compone las mismas piezas con migas del POS y
`origen=pos` (D3); detalle propio `/app/pos/cuentas-por-cobrar/[id]`; cobro con la caja abierta del cajero.
Navegador: sin el módulo `finance`, todo funciona dentro del POS; el abono en efectivo aparece en «abonos» de la
caja (L17).

### P14 · Recordatorios

Envío real por correo (`sendEmail`) y registro en `ar_reminders`; acción masiva; historial en el detalle; filtro
«Sin recordatorio reciente». Programados por `outbound_jobs` solo si el dueño lo pide.

### P15 · Limpieza

Borrar los componentes viejos sin importadores, retirar `POST /api/facturas-venta/[id]/pdf` si ya nadie lo llama,
activar los guardarraíles de L1, L14 y L15 sobre las carpetas nuevas y actualizar `PROGRESS.md` (anexando).

**Orden y dependencias:** P0 → P1.1 → P1.2 → P2 (pagos) → P6 y P11 pueden ir antes que P4/P5 si el dueño
prioriza la cartera. P4 y P10 dependen de P1.7. P7 depende de P1.5/P1.6 y del contrato de devoluciones. P9 y
el estado de cuenta dependen del motor de documentos. P13 depende de P10–P11 y del contrato de cajas.

---

## 5. Riesgos, huecos y decisiones del dueño

### 5.1 Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Varias sesiones tocan el mismo árbol: kit, motor de documentos, cobro del POS, devoluciones, rutas públicas, cajas, compras; `kit/index.ts`, `KIT-CODIGO.md`, `CuentasTab.tsx` y `messages/*.json` ya tienen cambios ajenos sin commitear | P0 relee contratos; nunca commitear un archivo que importe otro sin commitear; `git diff --cached` antes de cada commit |
| R2 | Archivos grandes con lógica mezclada (`NuevaFacturaForm` 1.622, `DetalleFactura` 1.205, `NotaCreditoDialog` 845) | extraer lógica con prueba antes de cambiar la piel (P0) |
| R3 | La factura manual crea `sales` y además `commissions` a mano; el disparador de comisión corre en UPDATE: posible comisión doble | L12 lo mide; la RPC de guardado conserva lo que hoy queda bien y no duplica |
| R4 | `payments.amount` del POS guarda lo recibido y el cambio va aparte; `fn_invoice_sales_paid` no resta el cambio (el `GREATEST` lo esconde) | el pago único guarda el monto **aplicado**; el estado de cuenta usa `amount − change_amount`; no se toca el cálculo del POS en este plan |
| R5 | La cartera del POS se lee sin red en Desktop | L16 antes de cambiar el servicio |
| R6 | Bucket `invoices` público y el QR impreso apunta a su URL | D7; coordinar con la sesión de rutas públicas y la del motor |
| R7 | La CxC del POS hoy depende del módulo `finance` para el detalle | P13 con detalle dentro del POS |
| R8 | Numeración: dos resoluciones activas por organización y tipo en 2 organizaciones (FINANZAS-DOCUMENTOS §1.1) | D9 antes de P1.4 |

### 5.2 Huecos de datos (medidos hoy) y cómo se resuelven

| Hueco | Medición | Causa verificada | Cómo se resuelve | ¿En este plan? |
|---|---|---|---|---|
| **H1 · Asiento de venta ≠ factura** | Con asientos `invoice_sales` vivos (sin reversión) contra `invoice_sales.total`, tolerancia $1: **69 facturas del POS y 18 manuales** difieren (el coordinador midió 82 del POS con otro criterio; conviene fijar uno). En 85 de las 87 el asiento es **mayor** que la factura; de 2025-07 a 2026-09 | `fn_auto_journal_sale` crea el asiento al **INSERT** con `status` emitido y usa `NEW.total` (el de la cabecera); después `fn_recalc_invoice_totals` rehace el total **solo desde las líneas** (ignora `allowance_charges`, donde vive el flete) y el UPDATE ya no genera asiento porque `OLD.status` era emitido | Prevención: la venta se inserta como borrador y pasa a emitida **después** de las líneas (dentro de `pos_checkout_v1`, zona del agente del cobro), o el asiento se difiere al final de la transacción releyendo la fila. Corrección de lo existente: contra-asiento con `fn_revertir_asiento` + reemisión (el bucle `:reemision:n` de `fn_auto_journal_sale` ya lo soporta), fechado en el periodo abierto si el original está cerrado. Nunca se edita un asiento publicado | **Aparte** (contabilidad + cobro). Este plan: la tarjeta «Asiento» del detalle muestra el importe del asiento y un aviso «no cuadra con la factura» de solo lectura |
| **H2 · Cartera con `amount` ≠ factura** | **233** cuentas (227 del POS, 6 manuales); el **saldo** cuadra en el 100 %; **0 están abiertas**; la última creada el 2026-09-05; en 227 la cartera se actualizó antes que la factura | la cartera toma `amount` al crearse; la factura cambió después por un camino que no resincronizó (actualizaciones con disparadores apagados o anteriores a la sincronización) | Lectura: KPIs y «Monto» salen de `invoice_sales.total`, no de `accounts_receivable.amount` (P1.7). Dato: resincronizar con `create_account_receivable(id)` (P1.10, D10) | **Sí** (lectura) · dato con D10 |
| Flete por debajo de la venta | 33 facturas (medido por el coordinador) | el flete no es línea: `fn_recalc_invoice_totals` lo descarta | lo arregla el agente del cobro en el origen; es la misma raíz que H1 | **No** |
| Vencidas no marcadas | 262 cuentas con saldo y fecha pasada sin `status='overdue'` | `days_overdue`/`status` solo cambian en UPDATE | ya resuelto al leer (`fn_cxc_estado_vivo`); un cron de cartera (POS-PARIDAD C-2) queda opcional | ya hecho |
| Abono anulado no devuelve saldo | 63 pagos de esa fuente | recálculo que ignora `account_receivable` y resta solo en INSERT | P1.1 | **Sí** |
| Envío de factura, recordatorio y estado de cuenta simulados o inexistentes | — | toasts | P9, P12, P14 | **Sí** |

**Huecos del diseño:** faltan frames de sin resultados y sin permiso en los listados de escritorio, y de
cargando y vacío en móvil (AUDITORIA-COHERENCIA §5.1): se construyen con `EmptyState` y se anotan. La CxC del
POS (P-C) no está dibujada. Los ids por frame de las Secciones B.2–B.4 (`421:*`) y los de cartera `445:1950xx`
no están anotados: `get_metadata` sobre esas Secciones cuando haya cupo. `AplicarPagoDialog` (`413:13096`) sigue
instanciado en frames viejos: el código usa `RegistrarPagoDialog` (FINANZAS-DOCUMENTOS pregunta 10).

### 5.3 Decisiones ya tomadas que este plan aplica

- Pago único con reparto de la más antigua a la más nueva y sobrante a saldo a favor, solo con casilla.
- Efectivo sin caja abierta: **se bloquea**.
- Texto legal del estado de cuenta configurable por organización, con texto por defecto.
- «Marcar pagada» desaparece; su atajo es «Saldo total».
- Un asiento contabilizado nunca se edita ni se borra: se revierte anulando el documento de origen.
- Retenciones de la venta: informativas, no restan.
- Moneda: la del documento; por defecto la base de la organización.

### 5.4 Decisiones pendientes del dueño (con recomendación)

| # | Pregunta | Recomendación |
|---|---|---|
| D1 | Dónde viven las piezas compartidas: `kit/documento/` (plan de compras) o `shared/pagos` + `shared/documentos` (plan de cajas); y un solo nombre para el diálogo de motivo | `kit/documento/` para todo lo de documentos y pagos, textos en `kit.documento`; el diálogo se llama `DialogoMotivo`. Que lo fije la sesión que construye el kit y las demás lo sigan |
| D2 | Fuente del pago posterior a la venta (desde CxC, factura o ficha) | `source='account_receivable'` con la cuenta de la factura: la caja ya lo cuenta como «abono» y `fn_invoice_sales_paid` lo suma. Requiere P1.1 |
| D3 | CxC dentro del POS | vista filtrada por ventas del POS, con detalle y cobro propios, sin salir a Finanzas |
| D4 | Permisos | usar los que existen: `finance.view` (ver), `finance.create` (crear, emitir, registrar pago), `finance.void` (anular factura, NC, anular pago), `finance.approve` (ajustar saldo); en el POS, `pos.view` y `pos.create`. Solo uno nuevo si se quiere separar el envío a la DIAN (`finance.einvoicing.send`) |
| D5 | Número de recibo de pago | consecutivo `RC-` por sucursal como tipo `receipt` en `invoice_sequences` (sin resolución), impreso en carta o ticket 80 mm |
| D6 | Factura y estado de cuenta por WhatsApp | enlace de descarga firmado y con vencimiento, abierto con `wa.me` (sin costo por mensaje); el canal de WhatsApp de la organización, más adelante |
| D7 | Bucket `invoices` público | privado; el QR apunta a una ruta del ERP con token firmado que sirve el PDF |
| D8 | Nota débito en la interfaz | fase 2 (0 notas débito hoy) |
| D9 | Numeración | borrador sin número; al emitir, `fn_get_next_invoice_number(org, sucursal, 'invoice')` con el prefijo de la resolución; antes, resolver las 2 organizaciones con dos rangos activos |
| D10 | Resincronizar las 233 carteras (H2) | sí, con la función canónica y dry-run; todas están cerradas, no cambia ningún saldo |
| D11 | H1 | corrección por contra-asiento y reemisión, a cargo de contabilidad y del agente del cobro, antes del cierre del periodo; este plan solo lo muestra |
| D12 | «Ajustar saldo» (castigo de cartera) | entra con `finance.approve`, motivo obligatorio y asiento contra la cuenta de castigo que fije el contador; si no hay cuenta definida, fase 2 |
| D13 | Retenciones informativas de la venta: dónde se guardan | tabla `invoice_sales_withholdings`, simétrica a la de compras (compras F1.5), en vez del `jsonb` por línea que nadie escribe |
| D14 | Los 8 envíos DIAN retenidos | ya preguntado en FINANZAS-DOCUMENTOS (pregunta 2); la interfaz muestra el motivo y la acción, sin decidir por el dueño |

---

## 6. Contrato del pago único (listo desde 2026-09-24 — para cajas, compras, CxP y POS)

**Migraciones aplicadas:** `20260924071946_cartera_abonos_simetricos` (P1.1) y
`20260924072939_pago_unico_registrar_y_anular` (P1.2, P1.3). Pruebas:
`src/__tests__/finanzas/ventas/{sqlCaracterizacion,rutasPagos,reglasPuras}.test.ts`.

### 6.1 RPC

```
fn_registrar_pago(
  p_direccion text,              -- 'cobro' (cliente) | 'pago' (proveedor)
  p_aplicaciones jsonb,          -- [{documento, id, cuota_id?, monto}] 1..200
                                 --   cobro: documento 'invoice_sales' | 'account_receivable'
                                 --   pago:  documento 'invoice_purchase' | 'account_payable'
  p_metodo text,                 -- payment_methods.code (requires_reference ⇒ p_referencia)
  p_moneda text,                 -- ISO; igual a la de cada documento o 'moneda_distinta'
  p_fecha date,                  -- día calendario; la RPC le pone la hora de pared de la sucursal
  p_referencia text, p_cuenta_bancaria integer, p_recibido numeric (efectivo),
  p_anticipo numeric,            -- sobrante a saldo a favor (solo cobro, solo con casilla)
  p_clave_idempotencia text,     -- obligatoria; misma clave ⇒ mismo resultado (repetida=true)
  p_notas text, p_origen text,   -- factura_venta · cxc · pos_cxc · venta_pos · ficha_cliente · factura_compra · cxp
  p_organization_id integer      -- la de la SESIÓN, como guarda (la pone el servidor)
) RETURNS jsonb {grupo_id, recibo 'RC-000001', repetida, total_aplicado, anticipo, cambio,
                 credito_id, caja_id, pagos:[{payment_id, documento, id, cuenta_id, cuota_id, monto, saldo_nuevo}]}

fn_anular_pago(p_payment_id uuid, p_motivo text) RETURNS jsonb
  {payment_id, source, source_id, asiento_revertido, contra_asiento, saldo_nuevo}
```

- Un `payments` por aplicación con `source = 'account_receivable'` (cobro) o `'account_payable'` (pago)
  sobre la cuenta del documento (D2), `payment_group_id` = recibo (`payment_groups`), `installment_id` si
  paga una cuota, `change_amount` solo en la primera fila, `created_by = auth.uid()`.
- Nunca escribe saldos: `fn_recalc_invoice_balance_from_payments`, `update_accounts_receivable_on_payment`
  y `fn_recalc_accounts_payable_from_payments` los recalculan (también al anular).
- Efectivo: exige caja abierta según `organization_settings.pos_cash_session_mode` (`fn_caja_abierta_para`);
  si no, `sin_caja_abierta`. `pos_caja_esperado` cuenta el cobro como «abonos» y el pago a proveedor como
  «compras en efectivo». El sobrante cobrado va como fila `source='customer_credit'` (la caja lo cuenta;
  su asiento lo hace `fn_create_customer_credit`).
- Anular: `status='void'` + `voided_at/by` + `void_reason`, cuota de vuelta, contra-asiento con
  `fn_revertir_asiento_en_fecha`. Un pago en efectivo de una caja cerrada no se anula (`pago_en_caja_cerrada`).
- Permisos en la base: cobro `finance.create` o `pos.create`; pago `finance.create`; anular `finance.void` o
  `pos.void` (admin pasa). El route handler exige el del origen (POS ⇒ `pos.*`).
- Errores (mensaje = código; textos en `pagos.errores.<código>`): `ERRORES_PAGO` en
  `src/lib/finanzas/pagos/contrato.ts`.

### 6.2 HTTP

| Ruta | Cuerpo / query | Respuesta |
|---|---|---|
| `POST /api/pagos` | `SolicitudPago` (`solicitudPagoSchema`) | 201 `{resultado}` · 200 si repetida · 400 `datos_invalidos` · 403 `sin_permiso`/`FOREIGN_ORGANIZATION` · 404/409/422 con `codigo` |
| `POST /api/pagos/[id]/anular` | `{motivo, origen?}` | 200 `{resultado}` · 400 · 403 · 404 · 409 |
| `GET /api/pagos/contexto` | `direccion=cobro` + `documento`/`id`, o `cliente` | documentos abiertos con cuotas, métodos, cuentas bancarias, caja abierta, `hoy` en la zona de la sucursal |
| `GET /api/finanzas/permisos` | — | `{ver, crear, anular, aprobar, posVer, posCrear, posAnular}` (hook `usePermisosFinanzas`) |

`GET /api/pagos/contexto` solo arma el cobro. Para `direccion=pago` la sesión de compras/CxP añade su
rama en `contextoPago` (`src/lib/services/pagos/pagos.server.ts`) o pasa los documentos por props.

### 6.3 Diálogo

`src/components/kit/documento/RegistrarPagoDialog.tsx` (D1): destino factura · cuenta (con cuota) ·
tercero (reparto FIFO con `repartirFifo` y sobrante con casilla), atajos Saldo total · 50 % · Exacto,
efectivo con Recibido y Cambio, «Abrir caja» si no hay caja. No escribe nada: llama a `POST /api/pagos`
con una clave de idempotencia por intento.

## 7. Decisiones aplicadas en la implementación (2026-09-24)

- **D1** `src/components/kit/documento/` para documentos y pagos; textos en `pagos`, `facturasVenta` y
  `cartera`. El diálogo de motivo es `kit/DialogoMotivo` (publicado por la sesión del kit).
- **D2** aplicada en `fn_registrar_pago`.
- **D3** CxC del POS con detalle y cobro propios (`origen=pos_cxc`, permisos `pos.*`).
- **D4** permisos existentes; sin permiso nuevo para la DIAN.
- **D5 ajustada** recibo `RC-000001` por organización en `payment_groups`, no en `invoice_sequences`
  (esa tabla es de resoluciones DIAN, con rango obligatorio y CHECK de tipo).
- **D6** WhatsApp: enlace firmado con vencimiento, abierto con `wa.me`.
- **D7** bucket `invoices` privado, coordinado con la sesión del motor de documentos.
- **D8** nota débito: fase 2.
- **D9** borrador sin número; numeración al emitir con `fn_get_next_invoice_number`, con respaldo al
  consecutivo actual cuando la sucursal no tiene resolución.
- **D10** resincronizar las 233 carteras con `create_account_receivable(id)`: con dry-run antes.
- **D11** H1 solo se muestra.
- **D12** «Ajustar saldo» a fase 2 hasta que el contador fije la cuenta de castigo.
- **D13** `invoice_sales_withholdings`: fase 2 (las retenciones de venta son informativas).
- **D14** los 8 envíos DIAN retenidos: la interfaz muestra el motivo, no decide.
- La política `UPDATE` de `payments` sigue abierta: tiene 10 escritores legítimos (web, parqueadero, QR,
  Wompi, CxP). Cerrarla exige pasarlos a RPC; queda anotado como pendiente.

## 8. Estado al cierre de la fase 2 (2026-09-28)

### 8.1 Pasos

| Paso | Estado | Dónde |
|---|---|---|
| P0 caracterización L1–L19 | hecho | `src/__tests__/finanzas/ventas/*` (reglas puras, SQL, rutas, guardarraíles) |
| P1.1 abonos simétricos · anon · DELETE de `payments` | hecho | `20260924071946` |
| P1.2 / P1.3 pago único y anulación | hecho | `20260924072939` |
| P1.4 guardar borrador en una transacción | hecho | `20260924104430` (`fn_factura_venta_guardar`, `fn_seriales_vender`) |
| P1.5 emitir y anular | hecho | `20260924075934` (+ seriales en `20260924104430`) |
| P1.6 nota crédito | hecho | `20260924093524` (`fn_nota_credito_emitir`, saldo = total − pagado − notas) |
| P1.7 listados y KPIs | hecho | `20260924081336` |
| P1.8 estado de cuenta | hecho, sin RPC | cargador del motor (`cargarEstadoCuenta`), reutilizado por `GET /api/clientes/[id]/estado-cuenta` |
| P1.9 recordatorios | hecho | `20260924082450` (`ar_reminders`, cuotas) |
| P1.10 resincronizar 233 carteras (D10) | pendiente | ver 8.3 |
| P1.11 ajustar saldo (D12) | fase 2 | decisión del dueño |
| P2 route handlers | hecho | `/api/pagos`, `/api/facturas-venta/**`, `/api/cartera/**`, `/api/clientes/[id]/**` |
| P4–P7 facturas: listado, detalle, pago, emitir, anular, nota crédito | hecho | `components/finanzas/facturas-venta/{listado,detalle}` |
| P8 nueva y editar | hecho en el servidor | el formulario viejo llama a `POST/PUT /api/facturas-venta`; su rediseño visual (kit) queda para la siguiente ronda |
| P9 PDF y envío | hecho | motor de documentos + `sendEmail` del CRM |
| P10–P13 CxC Finanzas y POS, cartera del cliente | hecho | `components/finanzas/cuentas-por-cobrar/{listado,detalle,cliente}` con `BandaAntiguedad`, `PlanCuotasDialog` y `EstadoCuentaDialog` del kit |
| P14 recordatorios | hecho (envío manual y registro); programados: solo si el dueño lo pide | |
| P15 limpieza | hecho, salvo `id/DetalleFactura` | ver 8.3 |

### 8.2 Hallazgos que cambiaron el plan

- **El saldo ignoraba las notas crédito.** Los disparadores calculaban `total − pagado`; el diálogo viejo
  restaba la nota escribiendo el saldo desde el navegador y el siguiente recálculo lo borraba. 7 facturas
  vivas mostraban un saldo que su nota ya había cancelado. Ahora hay UNA regla
  (`fn_factura_venta_recalcular_saldo`) que usan los disparadores de pagos, de líneas y de notas.
- **Cada nota crédito crea una cartera con monto negativo** (28 de 28, todas `paid` o con saldo 0) por
  `tr_create_account_receivable`. No afecta saldos ni listados (saldo 0); queda anotado para cuando se
  toque ese disparador.
- **Los seriales se «vendían» al guardar el borrador** y su número se buscaba en `product_serials`, que
  no existe. Ahora se venden al emitir (`fn_seriales_vender`, misma regla que `pos_checkout_v1`) y vuelven a
  stock al anular.
- **El borrador ya contabiliza CMV y comisión** al crear `sale_items` y `commissions`
  (`trg_auto_journal_sale_item_cogs`, `trg_auto_journal_commission`), como antes. Por eso la edición del
  borrador no rehace `sale_items` ni la comisión (tampoco lo hacía el formulario). Corregirlo exige mover
  esas líneas a la emisión y revertir los asientos ya hechos: decisión contable pendiente.
- **Numeración de migraciones:** las mías se renombraron a la versión registrada en
  `supabase_migrations` (el prefijo `20260926…` chocaba con otras sesiones en `supabase db push`).

### 8.3 Pendiente y por qué

- **`id/DetalleFactura` (detalle viejo) sigue** porque el POS lo monta en `CartView` (zona del agente del
  POS). Sus diálogos de nota crédito, pago y anulación ya delegan en el servidor; «Marcar pagada» y su
  emisión propia (`issue_invoice`) todavía escriben desde el navegador. Cuando el POS monte
  `DetalleFacturaVenta`, se borra la carpeta `id/` entera.
- **D10** (233 carteras con `amount` viejo): no se resincronizaron. El listado nuevo usa el total de la
  factura, así que no se ven; la resincronización es un backfill con dry-run que conviene hacer en una
  ventana acordada.
- **Política `UPDATE` de `payments`**: sigue abierta (10 escritores legítimos; ver §7).
- **`procesar_devolucion`** (sesión de devoluciones) arma su nota crédito con su propio bloque. Comparte con
  `fn_nota_credito_emitir` la numeración (`fn_pos_numero_nota_credito`), la convención de signos y el
  cálculo de base; unificar el bloque de inserción en una función interna se acuerda con esa sesión.
- **Formulario de factura con el kit** (P8 visual): el comportamiento ya es del servidor; la pantalla sigue
  con los componentes viejos.
- **WhatsApp (D6)**: el enlace firmado del motor aún no existe; el envío es por correo.
