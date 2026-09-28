# Auditoría control por control — cartera y órdenes de compra

Insumo para que el diseñador **calque la realidad** en Figma («GO Admin — Sistema de diseño»,
`EAvjINVRnlzFM70GVoWXgl`). Cubre las tres pantallas que cierran el ciclo del dinero pendiente:
**cuentas por cobrar**, **cuentas por pagar** y **órdenes de compra**. La auditoría de Finanzas
(`AUDITORIA-CONTROLES-FINANZAS.md`, §C.1–C.5) ya inventarió los controles visibles de cartera; este
documento **no los repite**: baja al nivel de **qué consulta cada servicio, qué trae de otras
tablas, qué escribe y con qué consecuencia**, y añade órdenes de compra, que hasta ahora solo
aparecía de refilón en `AUDITORIA-CONTROLES-PROVEEDORES-CATEGORIAS.md` §C y en
`INVENTARIO-PRODUCTOS-Y-POS.md`.

Fecha: 2026-09-22. Lectura de código y **verificación en la base de datos por el MCP de Supabase**
(proyecto `jgmgphmzusbluqhuqihj`, **solo lectura**): columnas, `CHECK`, triggers, funciones, RLS y
recuentos de filas. Sin nombres de organizaciones cliente. Rutas relativas a `src/` salvo que se
indique.

Leyenda de **Tipo**: botón · menú (trigger o ítem) · pestaña · campo · toggle (switch/checkbox/
segmento) · chip (píldora clicable) · badge (solo lectura) · tabla · diálogo · tooltip · atajo ·
estado (vacío/cargando/error/aviso) · texto · stat (KPI) · paginación · toast · cálculo (regla sin
control visible) · escritura (efecto en base de datos sin control propio). **Etiqueta exacta** es el
literal del código con su acentuación (o su falta). **Cuándo aparece**: «Siempre» = incondicional
dentro de su pantalla; breakpoints Tailwind (`sm` 640 · `md` 768 · `lg` 1024).

Índice: A. Cuentas por cobrar · B. Cuentas por pagar · C. Órdenes de compra · D. Lo que dice la base
de datos · E. Quién escribe la cartera a mano · F. Lo roto o sin efecto · G. Qué falta ·
H. Recomendación de rediseño.

---

## A. Cuentas por cobrar

### A.0 Dos rutas, una sola pantalla

| Ruta | Archivo | Qué renderiza |
|---|---|---|
| `/app/finanzas/cuentas-por-cobrar` | `app/app/finanzas/cuentas-por-cobrar/page.tsx:3-5` | `<CuentasPorCobrarPage />` (server component) |
| `/app/finanzas/cuentas-por-cobrar/[id]` | `app/app/finanzas/cuentas-por-cobrar/[id]/page.tsx:4-7` | `<CuentaPorCobrarDetailPage accountId={id} />` |
| `/app/pos/cuentas-por-cobrar` | `app/app/pos/cuentas-por-cobrar/page.tsx:6-8` | **el mismo** `<CuentasPorCobrarPage />`, 7 líneas |

La ruta del POS hereda la miga `Finanzas / Cuentas por Cobrar` (`CuentasPorCobrarPage.tsx:147-149`),
la flecha atrás a `/app/finanzas` (`:135-139`), los enlaces de fila a
`/app/finanzas/cuentas-por-cobrar/{id}` (`CuentasPorCobrarTable.tsx:138`, `:410-414`) y el regreso
del detalle a `/app/finanzas/cuentas-por-cobrar` (`CuentaPorCobrarDetailPage.tsx:64`). **Desde el POS
no hay vuelta al POS**: quien entra se queda en Finanzas.

`components/finanzas/cuentas-por-cobrar/id/index.ts:1-6` **no exporta `InstallmentsCard`** aunque el
archivo existe y la pantalla lo usa.

### A.1 Qué consulta el servicio del listado — `cuentas-por-cobrar/service.ts` (522 líneas)

Cliente de **navegador** (`import { supabase } from '@/lib/supabase/config'`, `:1`). No hay Server
Action ni route handler para cartera: toda la seguridad depende de RLS.

| Función | Tabla o RPC | Qué trae | Filtros | Paginación | Línea |
|---|---|---|---|---|---|
| `obtenerCuentasPorCobrarPaginadas` | **RPC `get_accounts_receivable_paginated`** | `{data, total_count, page_size, page_number, total_pages}`; los joins a `customers` e `invoice_sales` viven en SQL | `org_id`, `search_term`, `status_filter`, `aging_filter`, `customer_id_filter`, `date_from`, `date_to`, `branch_id_filter` | `page_size` / `page_number` | `:33-86` |
| `obtenerCuentasPorCobrar` | el mismo RPC en bucle | todas las páginas | los mismos | **itera hasta agotar**, `pageSize = filtros.pageSize ?? 100` | `:94-125` |
| `obtenerReporteAging` | el mismo RPC con `status_filter:'todos'` | todas las páginas para agregar en JS | `branch_id_filter` | bucle de 100 en 100 | `:128-218` |
| `obtenerCuentasParaRecordatorio` | tabla **`accounts_receivable`** | `*` + **`customers!inner(full_name, email, phone)`** | `organization_id`, `status='overdue'`, `balance > 0`, `last_reminder_date` nulo o de hace más de 3 días | **ninguna**, y **sin filtro de sucursal** | `:221-257` |
| `aplicarAbono` | RPC `get_account_receivable_detail` + **INSERT en `payments`** | — | — | — | `:260-310` |
| `actualizarFechaRecordatorio` | **UPDATE `accounts_receivable`** | `last_reminder_date`, `updated_at` | `id` + `organization_id` | — | `:313-329` |
| `obtenerEstadisticas` (fallback) | tabla **`accounts_receivable`** | `amount, balance, status, days_overdue` | `organization_id` (+ `branch_id`) | **ninguna → se trunca al límite por defecto de PostgREST** | `:332-404` |
| `exportarCSV` | vía `obtenerCuentasPorCobrar` | 11 columnas | los filtros activos | todas las páginas | `:407-442` |
| `obtenerBalancesClientes` | RPC `get_accounts_receivable_for_customers` | `customer_id, balance, days_overdue, status, due_date` | `customer_ids[]`, `org_id` | — | `:445-473` |
| `obtenerEstadisticasOptimizadas` | RPC `get_accounts_receivable_stats` | 8 agregados | `org_id`, `branch_id_filter` | — | `:476-521` |

Dos detalles con consecuencia de diseño:

1. **El listado no toca `customers` desde el navegador**: el nombre, el correo y el teléfono del
   cliente vienen resueltos dentro del RPC. La pantalla **no puede** enseñar nada más del cliente
   (documento, dirección, temperatura CRM) sin cambiar el RPC.
2. **El fallback pierde la sucursal**: el `catch` de `obtenerEstadisticasOptimizadas` llama a
   `this.obtenerEstadisticas()` **sin `branchId`** (`:519`), mientras la rama de error de Supabase sí
   lo pasa (`:491`). Un fallo puntual del RPC convierte los KPI de una sucursal en los de toda la
   organización, sin avisar.

### A.2 Qué consulta el servicio del detalle — `cuentas-por-cobrar/id/service.ts` (510 líneas)

| Función | Tabla o RPC | Qué trae | Línea |
|---|---|---|---|
| `obtenerDetallesCuentaPorCobrar` | **RPC `get_account_receivable_detail`** + lectura extra de **`invoice_sales`** (`number, issue_date`) | la cuenta, el cliente y `payment_history` embebido | `:36-112` (RPC `:41-45`, factura `:65-76`) |
| `obtenerPagosFiltrados` | **RPC `get_payments_filtered`** | `id, amount, method, reference, status, created_at, invoice_number, total_count` | `:169-224` |
| `aplicarPago` | **INSERT `payments`** | `source:'account_receivable'`, `source_id`, `amount`, `method`, `reference`, `status:'completed'`, `currency:'COP'`, `payment_date` | `:227-264` |
| `obtenerCuotas` | **SELECT `ar_installments`** | `*` | `:267-285` |
| `crearCuotas` | **DELETE + INSERT `ar_installments`** | borra el plan entero y reinserta | `:288-342` |
| `pagarCuota` | **SELECT + UPDATE `ar_installments`** y luego `aplicarPago` | — | `:381-439` |
| `eliminarCuotas` | **DELETE `ar_installments`** | — | `:442-457` |
| `obtenerMetodosPago` | **`organization_payment_methods`** + embed `payment_method:payment_method_code(code,name,requires_reference)` | — | `:345-378` |
| `enviarRecordatorio` | `NotificationService.sendPaymentReminder` + **UPDATE `accounts_receivable`** | — | `:460-509` |

**Ninguna de las seis consultas a `ar_installments` filtra por `organization_id`**
(`:270`, `:297`, `:329`, `:391`, `:412`, `:445`), ni la lectura extra de `invoice_sales`
(`:66-70`). La tabla no tiene columna de organización (§D.1): el aislamiento depende enteramente de
la política RLS `can_access_account_receivable`.

### A.3 El aging — cuatro escalas distintas para el mismo concepto

| # | Dónde | Cómo se calcula | Tramos y etiquetas | Archivo:línea |
|---|---|---|---|---|
| 1 | Pestaña «Aging» | **en JS**, sobre todas las páginas del RPC; `daysDiff = floor((hoy − parseLocalDate(due_date)) / 86400000)` | `0-30 días` (verde) · `31-60 días` (ámbar) · `61-90 días` (naranja) · `+90 días` (rojo) | `service.ts:174-211`; etiquetas `AgingReport.tsx:184-205` |
| 2 | Columna «Aging» del listado | color en cliente sobre el `days_overdue` del RPC | ≤30 verde · ≤60 ámbar · ≤90 naranja · >90 rojo | `CuentasPorCobrarTable.tsx:108-113` |
| 3 | KPI «Días de Atraso» del detalle | `getAgingInfo` en cliente | `Al día` (verde) · `1-30 días` (amarillo) · `31-60 días` (naranja) · `61-90 días` (rojo) · `Más de 90 días` (rojo oscuro) | `id/service.ts:115-152` |
| 4 | Badge de severidad del panel de acciones | en cliente | `Atención requerida` (1-30) · `Urgente` (31-60) · `Crítico` (>60) | `id/AccountActionsCard.tsx:195-217` |
| 5 | Urgencia del panel de recordatorios | en cliente | `Crítico` (≥90) · `Urgente` (≥60) · `Importante` (≥30) · `Normal` | `RecordatoriosPanel.tsx:104-113` |
| 6 | Filtro «Aging» del listado | **en SQL**, dentro del RPC | `0-30` · `31-60` · `61-90` · `90+` | `CuentasPorCobrarFiltros.tsx:124-128` → `service.ts:42` |

Tres consecuencias concretas:

- **El tramo 1 miente.** `daysDiff` negativo (factura aún no vencida) cae en `<= 30`
  (`service.ts:202`), así que «0-30 días» mezcla lo vigente con lo vencido hace tres semanas. Ese
  mismo importe vuelve a contarse en el KPI «Vigentes» (`EstadisticasCards.tsx:25-32`).
- **El mismo tramo tiene dos colores.** «0-30 días» es verde en el reporte y en la tabla, pero
  «1-30 días» es amarillo en el detalle, donde el verde se reserva para «Al día».
- **El color de celda del reporte no mide antigüedad, mide peso.** `getAgingColor(amount, total)`
  (`AgingReport.tsx:96-102`) pinta en rojo cualquier celda que sea ≥50 % del total del cliente: un
  cliente con el 60 % de su cartera **al corriente** ve ese importe en rojo.

### A.4 Recordatorios — dos de los tres caminos no envían nada

| Camino | Qué hace de verdad | Archivo:línea |
|---|---|---|
| **Panel «Recordatorios» → «Enviar (N)»** | Filtra los que tienen correo y, por cada uno, llama **solo** a `actualizarFechaRecordatorio` — un `UPDATE last_reminder_date`. Sin plantilla, sin canal, sin registro del mensaje. El toast dice «{N} recordatorios enviados exitosamente» | `RecordatoriosPanel.tsx:58-102`, `:88` → `service.ts:313-329` |
| **Diálogo «Enviar Recordatorio» del listado** | `actualizarFechaRecordatorio` + `console.log`. El propio código lo admite: «Aquí se podría integrar con un servicio de email / Por ahora solo simulamos el envío» | `EnviarRecordatorioModal.tsx:54-64` |
| **Panel de acciones del detalle** | **Este sí persiste**: `NotificationService.sendPaymentReminder` inserta filas en **`notifications`** con `channel:'email'` si hay correo y `channel:'whatsapp'` si hay teléfono, `status:'pending'`; el envío real lo haría `/api/notifications/process` | `id/service.ts:460-509` → `lib/services/notificationService.ts:63-117` |

Y conviven **dos plantillas** distintas, ambas cableadas en el código:
`EnviarRecordatorioModal.tsx:27-40` («Estimado(a) …», firma «Equipo de Cobranzas», fechas en `es-ES`)
y `AccountActionsCard.tsx:183-193` («Estimado/a …», «Saludos cordiales.», fechas en `es-CO`).
**El mensaje que escribe la persona no se guarda en ninguna tabla en ninguno de los tres caminos.**

El panel de recordatorios **ignora la sucursal**: su `useEffect` tiene dependencias `[]`
(`RecordatoriosPanel.tsx:23-25`) y `obtenerCuentasParaRecordatorio` no recibe `branchId`
(`service.ts:221`). El `BranchBadge` de la cabecera dice una sucursal y el panel lista todas.

### A.5 Cuotas — generación, pago y su coste

- **Tabla `ar_installments`** (§D.1). Se generan **en el navegador**, sin RPC ni trigger:
  `crearCuotas` (`id/service.ts:288-342`) **borra todas las cuotas existentes** (`:296-299`),
  reparte `round(total / n, 2)` (`:301`), genera vencimientos mensuales con
  `setMonth(+i-1)` (`:305-306`) y ajusta el redondeo en la última (`:309-311`).
- **No inserta `principal` ni `interest`**, aunque las columnas existen y la versión de cuentas por
  pagar sí las rellena. El campo «Tasa de interés mensual (%)» del diálogo
  (`InstallmentsCard.tsx:256-266`) **no se pasa a `crearCuotas`** (`:91-96`) y la «Cuota estimada»
  (`:270`) lo ignora: es decorativo.
- **El plan se arma sobre el saldo, no sobre el monto**: el detalle pasa
  `totalAmount={account.balance}` (`CuentaPorCobrarDetailPage.tsx:439`).
- **Un cobro general genera N pagos.** Cuando no se elige cuota, `AccountActionsCard.tsx:122-137`
  recorre las cuotas pendientes llamando a `pagarCuota` una vez por cuota; cada llamada inserta su
  propia fila en `payments` (`id/service.ts:391-398`). Un abono de una persona se convierte en cinco
  pagos en el historial y en cinco asientos contables (§D.3).
- `pagarCuota` calcula `newBalance = installment.amount − newPaidAmount` (`id/service.ts:405`):
  usa `amount`, **no** `balance`, e ignora `interest`.
- El `max=60` del input contradice la validación `2..36` del handler
  (`InstallmentsCard.tsx:249` vs `:84-85`).
- El ternario del botón es `installments.length === 0 && accountStatus !== 'paid' ? Crear : Eliminar`
  (`:227`): una cuenta **pagada y sin cuotas** muestra «Eliminar Plan».

---

## B. Cuentas por pagar

### B.0 Tres rutas, una de ellas huérfana

| Ruta | Archivo | Nota |
|---|---|---|
| `/app/finanzas/cuentas-por-pagar` | `app/app/finanzas/cuentas-por-pagar/page.tsx:4-6` | — |
| `/app/finanzas/cuentas-por-pagar/[id]` | `.../[id]/page.tsx:10-14` | — |
| `/app/finanzas/cuentas-por-pagar/[id]/cuotas` | `.../[id]/cuotas/page.tsx:10-14` | **Nadie enlaza a esta ruta**: la única referencia en `src/` es su propio import. Y es el **único sitio del módulo donde se puede editar una cuota** |

### B.1 La asimetría de fondo: cobrar tiene triggers, pagar no

Verificado en la base de datos (§D.3): `payments` tiene el trigger
`tr_update_accounts_receivable_on_payment`, que actualiza `accounts_receivable` al insertar un pago
con `source='account_receivable'` o `source='invoice_sales'`. **No existe su equivalente para
`accounts_payable`.** De ahí que todo el módulo de cuentas por pagar escriba el saldo a mano, y que
lo haga de **tres maneras distintas**:

| Camino | Qué hace | Archivo:línea |
|---|---|---|
| `RegistrarPagoModal` del listado | SELECT saldo → INSERT `payments` → `actualizarBalancesDespuesDePago`: segundo SELECT, `UPDATE accounts_payable.balance = balanceAnterior − amount` y `UPDATE invoice_purchase.balance` con **el saldo de la cuenta, no el de la factura** | `CuentasPorPagarService.ts:436-499` y `:597-652` |
| `AccountActionsCard` del detalle | INSERT `payments` (**con `payment_date` y con `bank_account_id`**) → `UPDATE accounts_payable` → `UPDATE invoice_purchase` | `id/service.ts:277-353` |
| Open Finance | INSERT `payments` con `source:'accounts_payable'` (**en plural**) → `UPDATE accounts_payable` con `balance = 0` **fijo** y `status = 'paid'`; **no toca `invoice_purchase`** | `lib/services/integrations/openFinance/paymentInitiationService.ts:370-414` |

Riesgos que esto deja, todos verificables en el código:

- **Condición de carrera.** Dos pagos simultáneos leen el mismo `balance` y el segundo pisa al
  primero. El saldo queda inflado.
- **Sin atomicidad y con el error silenciado.** Si el `UPDATE` falla, el `INSERT` en `payments` ya
  está hecho, y `actualizarBalancesDespuesDePago` **se traga el error** con `console.error` sin
  relanzarlo (`CuentasPorPagarService.ts:625-627`, `:643-644`, `:649-651`). `registrarPago` devuelve
  éxito y el diálogo muestra «Pago registrado» aunque el saldo no se haya movido.
- **Saldo negativo.** El camino del listado no aplica `Math.max(0, …)` (`:617`); el del detalle sí
  (`id/service.ts:332`).
- **Una cuenta por pagar = una factura.** El paso final copia el saldo de la cuenta al de la
  factura. Con varias cuentas o cuotas sobre una factura, el saldo de la factura queda mal.
- **Campos que se pierden.** El camino del listado **no envía `payment_date` ni `notes`**: el pago se
  fecha con el `created_at` del INSERT, y el select «Cuenta Bancaria (Opcional)» es **decorativo**
  (`RegistrarPagoModal.tsx:421-456`, `:74`, `:428`; el objeto insertado es `:466-477`).
- **Y el camino del detalle falla cuando se usa la cuenta bancaria.** `id/service.ts:307-309` añade
  `paymentData.bank_account_id = bankAccountId`, pero **`payments` no tiene esa columna**
  (verificado por MCP, §D.1). Elegir una cuenta bancaria en el diálogo del detalle rompe el
  `INSERT`.

### B.2 Qué consulta el servicio — `CuentasPorPagarService.ts` (1.032 líneas)

Cliente de navegador, todo `static`. Lo esencial:

| Función | Tabla | Qué trae de otras tablas | Orden / paginación | Línea |
|---|---|---|---|---|
| `obtenerCuentasPorPagar` | `accounts_payable` | embeds `supplier:suppliers(id,name,nit,contact,phone,email)` y `invoice_purchase:invoice_purchase(id,number_ext,issue_date,currency)`, `{count:'exact'}` | `due_date` asc + `.range()` | `:68-204` |
| — subconsulta de búsqueda | `accounts_payable` | `.or('supplier.name.ilike…,invoice_purchase.number_ext.ilike…')` **sobre recursos embebidos sin `!inner`**: PostgREST no filtra y además no hay `range`, así que trae toda la organización en cada pulsación de tecla | — | `:123-136` |
| `obtenerResumen` | `accounts_payable` ×3 | agrega en JS | la tercera con `limit(1)` | `:209-322` |
| `obtenerPagosProgramados` | `payments` | **`*` sin ningún embed** | `.limit(10)` **duro, sin paginación** | `:539-592` |
| `obtenerProveedoresConSaldo` | `suppliers` | join **`accounts_payable!inner(balance)`** | dedup en cliente | `:755-800` |
| `exportarParaBancaOnline` | `accounts_payable` → INSERT en `bank_files` | `supplier:suppliers(name,nit,email)`, `invoice_purchase:invoice_purchase(number_ext)` | — | `:882-935` |

**Cinco funciones del servicio no se invocan desde ningún componente**: `obtenerCuentaPorId`
(`:327-361`), `obtenerHistorialPagos` (`:504-534`), `obtenerMonedas` (`:840-877`), `obtenerCuotas`
(`:968-986`) y `crearCuotas` (`:989-1031`). Esta última es además una **segunda implementación
divergente**: sin borrado previo, sin interés y sin `principal`.

El servicio del detalle (`id/service.ts`, 555 líneas) mezcla los pagos de la cuenta
(`source='account_payable'`) con los de la factura (`source='invoice_purchase'`) y los ordena en
cliente **sin deduplicar** (`:96-106`): un pago presente en ambos orígenes se cuenta dos veces.

### B.3 Cuotas de cuentas por pagar

- **Tabla `ap_installments`** (§D.1). `crearCuotas` (`id/service.ts:221-274`) **sí** desglosa
  `principal` e `interest` y usa `toPlainDate(dueDate, timezone)`. El interés es **plano por cuota**
  (`principal + principal × tasa/100`), no amortizado, y la cifra mostrada como «Cuota estimada» en
  los dos diálogos (`InstallmentsCard.tsx:290-293`, `CuotasPage.tsx:555-558`) usa
  `(total/n) × (1 + i/100)`: **la previsualización no coincide con lo que se genera**.
- Igual que en cobrar, **borra todas las cuotas antes de insertar** (`:231-234`) sin avisarlo en el
  diálogo de creación.
- `pagarCuota` (`:356-403`) actualiza `ap_installments` y **después** llama a `registrarPago`, que
  vuelve a descontar el saldo de la cuenta y de la factura. Sin transacción: si el segundo paso
  falla, la cuota ya quedó marcada como pagada.
- El auto-aplicado del panel de acciones (`id/AccountActionsCard.tsx:108-124`) recorre las cuotas
  pendientes llamando a `pagarCuota` una vez por cuota: **N filas en `payments` por un solo pago**,
  cada una descontando de nuevo el saldo.
- La pantalla `/[id]/cuotas` **borra el plan sin confirmación** (`CuotasPage.tsx:342-349`,
  `:171-180`), mientras el mismo botón del detalle sí confirma (`InstallmentsCard.tsx:312-334`).

### B.4 Programación, aprobación y banca

- **Programar** (`CuentasPorPagarService.ts:366-431`) inserta en `payments` con `status:'pending'`.
  **La fecha programada no tiene columna propia**: si no hay referencia, se escribe el literal
  `Pago programado para {fecha}` dentro de `payments.reference`. Y `notes` se descarta. No existe
  tabla `scheduled_payments`, pese a que `types.ts:28-53` define `ScheduledPayment`.
- **Aprobar** (`:657-710`) pone `status='completed'` y, si hay comentario, **sobrescribe
  `reference` con el HTML del editor**, destruyendo la fecha programada del paso anterior. Luego
  descuenta saldos. **Rechazar** (`:715-750`) hace lo mismo con `status='cancelled'`.
- El diálogo de aprobación muestra siempre «Pago #xxxxxxxx» y «Sin fecha» porque
  `obtenerPagosProgramados` selecciona `*` **sin embeds** y el componente lee
  `pago.account_payable?.supplier?.name` (`AprobacionPagosModal.tsx:273`, `:410`, `:445`).
- **Exportar a banca**: los cuatro formatos del select (`bancolombia_txt`, `davivienda_csv`,
  `bbva_excel`, `generic_csv`) **no coinciden con ninguna rama del `switch`**
  (`ExportarBancaModal.tsx:59-88` vs `:149-154`): siempre sale el CSV genérico. «BBVA Excel»
  descarga un `.xlsx` cuyo contenido es CSV de texto plano (`Blob type 'text/plain'`, `:232`).
  `bank_files` guarda siempre `.csv` y `file_type:'csv'` y queda en `status:'pending'` para siempre;
  **el contenido del archivo no se persiste**.
- **Conciliar** es una simulación declarada: `setTimeout(1000)` + `console.log('Conciliación
  simulada de', n, 'registros')` (`:132-140`), con toast de éxito.
- **Open Finance sí es una integración real** (`/api/integrations/open-finance/validate-supplier` y
  `/pay-supplier` → `paymentInitiationService.ts`), pero desde el listado **nunca funciona**:
  `CuentasPorPagarPage.tsx:523` pasa `accountPayableId={Number(cuentaSeleccionada.id)}` sobre un
  **UUID** → `NaN` → `.eq('id','NaN')` (`paymentInitiationService.ts:172`) → «Cuenta por pagar no
  encontrada».

---

## C. Órdenes de compra

### C.0 No existe una ruta equivalente en Finanzas

**Respuesta directa al dueño: no.** Bajo `src/app/app/finanzas/` no hay ninguna ruta de órdenes de
compra. Se comprobaron y **no existen**: `/app/finanzas/compras`, `/app/finanzas/ordenes-compra`,
`/app/finanzas/purchase-orders`, `/app/finanzas/oc`.

Lo que sí hay en Finanzas del lado de compras: `facturas-compra` (`/`, `/nuevo`, `/[id]`),
`cuentas-por-pagar` (`/`, `/[id]`, `/[id]/cuotas`), `egresos` y `documentos-soporte`.

La ruta de órdenes de compra está registrada **solo bajo Inventario**, en tres sitios cableados:

| Fuente | Entrada | Módulo | Línea |
|---|---|---|---|
| `components/app-layout/Sidebar/SidebarNavigation.tsx` | `{ name: "Órdenes de Compra", href: "/app/inventario/ordenes-compra", icon: <ClipboardList size={16} /> }` | Inventario | `:221` |
| `components/app-layout/AppLayout.tsx` | idéntica | Inventario | `:236` |
| `lib/config/modulePages.ts` | `{ name: 'Órdenes de Compra', href: '/app/inventario/ordenes-compra' }` dentro de `MODULE_PAGES.inventory` | `inventory` | `:89` |

El bloque `MODULE_PAGES.finance` (`modulePages.ts:42-71`, 28 entradas) y el submenú de Finanzas
(`SidebarNavigation.tsx:164-196`, 28 entradas) **no contienen ninguna referencia a órdenes de
compra**. La entrada más cercana es «Facturas de compra».

**Desde dónde se llega a compras desde Finanzas, hoy:**

- **Finanzas → Órdenes de compra: por ningún sitio.** `grep -rn "po_id"` sobre `src/` devuelve 5
  coincidencias y ninguna pinta un enlace: `facturas-compra/types.ts:26` (campo declarado y nunca
  usado en la interfaz), `OrdenCompraDetalle.tsx:123` (lectura) y tres del manifiesto offline.
  `DetalleFacturaCompra.tsx` **no muestra el origen** «generada desde OC-N», aunque el servicio lo
  escribe en `notes` (`purchaseOrderService.ts:872`).
- **Inventario → Finanzas: tres enlaces, todos en el detalle de la orden.**
  `/app/finanzas/facturas-compra/{id}` (`OrdenCompraDetalle.tsx:502`, **condicionado a un campo que
  nunca se llena**, §F.C1) y `/app/finanzas/cuentas-por-pagar` (`:513`, al **listado genérico**, no
  al registro: `linkedPayable.id` se carga y no se usa en la URL).
- **El detalle del proveedor** sí ofrece «Nueva Orden de Compra» →
  `/app/inventario/ordenes-compra/nuevo?supplier={id}` (`ProveedorDetalle.tsx:203-205`), pero
  `NuevaOrdenCompraForm` **no lee `useSearchParams`**: el proveedor no se preselecciona.
- **Finanzas crea compras por una vía paralela.** `FacturasCompraService.ts:1209+`
  (`recepcionarInventario`) llama al mismo `stockMovementService` **sin pasar por
  `purchase_orders`**, con un comentario que lo admite (`:1289-1293`).

**Conclusión de ámbito:** el ciclo de compra está partido en dos módulos sin puente bidireccional.
Órdenes de compra vive en Inventario; Finanzas solo ve el resultado (factura + cuenta por pagar) y no
puede navegar de vuelta a la orden que lo originó.

### C.1 Qué consulta — `lib/services/purchaseOrderService.ts` (1.151 líneas)

| # | Método | `.from()` | Qué trae | Orden / límite | Línea |
|---|---|---|---|---|---|
| 1 | `getPurchaseOrders` | `purchase_orders` | `*, suppliers:supplier_id (id,name,uuid), branches:branch_id (id,name)` | `created_at` desc — **sin `range()` ni `limit()`** | `:106-132` |
| 2 | `getPurchaseOrderByUuid` | `purchase_orders` | `*, suppliers:supplier_id (id,name,uuid,email,phone,contact), branches:branch_id (id,name)` | `.single()` | `:158-167` |
| 3 | ídem, líneas | `purchase_order_items` | `*, products:product_id (id,uuid,sku,name,unit_code)` — **sin `track_serial`** | `id` asc | `:177-184` |
| 4 | `updatePurchaseOrder` | `purchase_order_items` | **`DELETE` de todas las líneas** y reinserción | — | `:295-314` |
| 5 | `receiveItems` | `purchase_order_items` | **un `UPDATE` por línea, en bucle `for`** | — | `:550-561` |
| 6 | `generateInvoiceFromPurchaseOrder` | `invoice_purchase` INSERT | `number_ext` `COMP-{año}-{NNNN}`, `currency:'COP'`, `tax_total: 0`, `payment_terms: 30`, `status:'received'` — **nunca escribe `po_id`** | — | `:857-877` |
| 7 | ídem | `invoice_items` INSERT | una fila por línea, `tax_rate: 0` | — | `:884-902` |
| 8 | ídem | `accounts_payable` INSERT | `amount`, `balance`, `due_date` hoy+30 d, `status:'pending'` | — | `:923-933` |
| 9 | `getStats` | `purchase_orders` | `status, total` de **toda** la organización; agrega en el navegador | — | `:947-969` |
| 10 | `getProducts` | `products` + `product_costs` + `product_images` | bucle `while(true)` de páginas de 1.000, más una consulta de imágenes por cada 300 productos | — | `:1023-1101` |

El detalle además consulta **directamente desde el componente de presentación**, saltándose el
servicio: `invoice_purchase` por `po_id` (`OrdenCompraDetalle.tsx:120-124`) y `accounts_payable` por
`invoice_id` (`:128-132`), las dos con `.single()` donde correspondería `.maybeSingle()` — error
`PGRST116` en cada carga, descartado porque no se lee el `error`.

### C.2 Ciclo de estados

Literales en base de datos (`purchase_orders_status_check`, verificado por MCP):
`draft` · `sent` · `partial` · `received` · `closed` · `cancelled`.
Literales en TypeScript (`purchaseOrderService.ts:12`): los mismos **menos `closed`**.

| Desde | Hacia | Disparador | Quién escribe | Archivo:línea |
|---|---|---|---|---|
| — | `draft` | «Guardar Borrador» | `createPurchaseOrder` | `NuevaOrdenCompraForm.tsx:590-602` → service `:220` |
| — | `sent` | «Guardar y Enviar» | `createPurchaseOrder` | `NuevaOrdenCompraForm.tsx:603-614` → service `:250` |
| `draft` | `sent` | «Enviar a Proveedor» (fila) / «Enviar» (detalle) | `updateStatus` → `setStatus` | `OrdenesCompraTable.tsx:159-164` · `OrdenCompraDetalle.tsx:293-302` |
| `sent`/`partial` | `partial` o `received` | «Registrar Recepción» → «Guardar Recepción» | `receiveItems` — el estado se **deriva** de las cantidades | `OrdenCompraDetalle.tsx:690-697` → service `:613-619` |
| `sent`/`partial` | `received` | «Marcar Recibida» (menú de fila) | `receiveAllPending` | `OrdenesCompraTable.tsx:166-171` → service `:398-436` |
| `draft`/`sent`/`partial` | `cancelled` | «Cancelar» — **sin confirmación** | `updateStatus` | `OrdenesCompraTable.tsx:173-181` · `OrdenCompraDetalle.tsx:330-341` |
| `draft` | borrado | «Eliminar» — con `AlertDialog` | `deletePurchaseOrder` | `OrdenesCompraTable.tsx:183-194` |
| `received` | `closed` | **no existe ninguna transición** | — | — |

Mapa estado → color, **duplicado literalmente** en `OrdenesCompraTable.tsx:48-54` y
`OrdenCompraDetalle.tsx:61-67`: `Borrador` gris · `Enviada` amarillo · `Parcial` naranja ·
`Recibida` verde · `Cancelada` rojo; cualquier otro valor (incluido `closed`) cae al fallback y **se
pinta como «Borrador»**.

Hay una guarda defensiva que conviene respetar en el diseño: `updateStatus`
(`purchaseOrderService.ts:373-389`) **rechaza en tiempo de ejecución** `received` y `partial` con el
mensaje «Para recibir una orden usa receiveItems/receiveAllPending, que si registran el stock». El
estado de recepción **no es editable a mano**, y así debe presentarse.

### C.3 La recepción — qué escribe en inventario

**Existe recepción parcial en la interfaz**: el diálogo «Registrar Recepción de Mercancía»
(`OrdenCompraDetalle.tsx:567-700`) trae un campo numérico por línea (`min=0`, `max={item.quantity}`),
color tri-estado y barra de progreso por línea, con el texto «Puedes hacer recepciones parciales»
(`:579`). La vía rápida «Marcar Recibida» del listado completa todas las líneas al pedido.

**No hay ningún RPC.** Una recepción de N líneas son **≈ 4 + 5N consultas desde el navegador**, sin
transacción:

1. SELECT `purchase_orders` (`id, branch_id`) — `:525`
2. SELECT `purchase_order_items` — `:541`
3. **N** UPDATE a `purchase_order_items` en bucle `for` — `:550-561`
4. Por línea con `delta > 0`, dentro de `incrementOnPurchase`: SELECT `products`, SELECT
   `stock_levels`, UPDATE o INSERT `stock_levels`, INSERT `stock_movements`
   (`stockMovementService.ts:383-465`)
5. SELECT `purchase_order_items` para recalcular el estado — `:608`
6. UPDATE `purchase_orders` — `:619`
7. Si queda completa: `generateInvoiceFromPurchaseOrder` → **8 consultas más**

Lo que escribe:

| Destino | Qué escribe | Archivo:línea |
|---|---|---|
| `purchase_order_items.received_quantity` | el valor **absoluto** del campo, no un incremento | service `:553` |
| `purchase_order_items.serials_received` | array de seriales (solo la ruta con seriales) | service `:680` |
| `stock_levels.qty_on_hand` | `+= delta` | `stockMovementService.ts:422` |
| `stock_levels.avg_cost` | **costo promedio ponderado**: `(qty×avg + delta×unitCost) / (qty + delta)`; si `qty = 0`, `unitCost` | `:415-417` |
| `stock_levels` (fila nueva) | `qty_on_hand = delta, qty_reserved = 0, avg_cost = unitCost, min_level = 0, lot_id = null` | `:433-443` |
| `stock_movements` | `direction:'in'`, `qty: delta`, `unit_cost`, `source:'purchase_order'`, **`source_id` = id de la ORDEN, no de la línea**, `updated_by: null` | `:452-465` |
| `serial_numbers` | una fila por serial, solo el `delta` | service `:727-755` |
| `invoice_purchase` + `invoice_items` + `accounts_payable` | factura automática y cuenta por pagar si la recepción queda completa | service `:857-933` |
| **`product_costs`** | **nada**. La recepción **nunca** escribe en `product_costs`; el costo nuevo vive solo en `stock_levels.avg_cost` | — |

**Qué no se traza:**

- **No existe tabla de recepciones.** Verificado por MCP: en el esquema `public` no hay
  `purchase_receipts`, `goods_receipts` ni equivalente (§D.1). No hay número de recepción, ni fecha,
  ni quién recibió: `updated_by` se inserta siempre como `null` porque `purchaseOrderService` nunca
  pasa el parámetro (`:583-589`, `:708-714`).
- `stock_movements.source_id` guarda el id de la **orden**. Con dos líneas del mismo producto en la
  misma orden no se puede reconstruir qué línea aportó qué.
- **Recepciones parciales sucesivas pisan el rastro**: `received_quantity` se sobrescribe con el
  valor absoluto; solo el `delta` calculado en memoria mueve stock.
- **Sin guarda de sobre-recepción en el servicio**: el `max` es solo HTML; `receiveItems` acepta
  cualquier cantidad.
- **El delta negativo se descarta en silencio** (`if (delta <= 0) return null`, `:573`, `:698`):
  bajar la cantidad recibida reduce `received_quantity` pero **no devuelve stock**.
- **Los fallos de stock no bloquean ni revierten**: `try/catch` con `console.warn` y un
  `stockResult` degradado (`:595-605`). La orden puede quedar `received` sin que haya entrado nada.
  Lo mismo con el fallo de la factura automática (`:625-627`) y el de `accounts_payable` (`:936`),
  que ni siquiera muestran toast.

### C.4 Los dos selectores de producto

| Aspecto | `ProductSearchCombobox` (órdenes de compra) | `ProductSearchDialog` (facturas) |
|---|---|---|
| Archivo | `components/inventario/ordenes-compra/ProductSearchCombobox.tsx` (29-35 props) | `components/shared/product-search/ProductSearchDialog.tsx` (1.059 líneas) |
| Patrón | combobox en línea con desplegable propio | **diálogo** abierto por «Buscar Productos» |
| Datos | array en memoria por props; carga previa de **todo el catálogo** (`getProducts`, bucle de páginas de 1.000 + imágenes por lotes de 300) | **1 RPC por modo**: `get_products_with_latest_prices` (venta) / **`get_products_with_latest_costs`** (compra), más 7 consultas auxiliares en paralelo |
| Debounce | **ninguno** | **250 ms** |
| Paginación | **ninguna**: pinta todos los resultados | `pageSize = 20`, «Página X de Y» |
| Campos de búsqueda | `name`, `sku`, `category`, `parent_name`, valores de `variant_data` | `name`, `sku`, `description` y **`search_terms`** precomputado (SKU y nombre de variantes hijas, grupos y opciones de modificadores) |
| Costo / precio visible | **no** | sí, con `formatCurrency` y su moneda |
| Stock visible | no | sí (`stock_qty`, `is_out_of_stock`) en modo venta con sucursal |
| Impuestos | no | sí (`tax_code`, `tax_name`, `tax_rate`) |
| Crear producto | no | sí, «Crear Producto» |
| Variantes y modificadores | agrupación visual plana | `VariantSelectorDialog` con modificadores |
| Favoritos y ranking | no | `is_favorite` + `sales_count_90d` con iconos |
| Filtro por proveedor | sí, pero implementado **en el formulario padre**, duplicado en «nuevo» y «editar» | sí, **dentro del propio componente** (`supplierId`) |
| Teclado | **ninguno**: sin flechas, sin Enter, sin Escape, sin `role`/`aria-*`. Cierra solo con `mousedown` global | parcial (autofoco + gestión nativa del diálogo) |

`SearchSelectCombobox` (el de proveedor en «nuevo») tiene los mismos problemas de teclado y además
**trunca a 30 resultados sin avisar** (`:131`): con más de 30 proveedores coincidentes, el resto es
invisible.

La lógica de «productos de este proveedor» está **triplicada** con el mismo cuerpo:
`ProductSearchDialog.tsx:71-84`, `NuevaOrdenCompraForm.tsx:119-139` y
`EditarOrdenCompraForm.tsx:145-163`, todas llamando a `supplierService.getProductsBySupplier`
(`supplierService.ts:647-650`, **sin filtro de organización**).

### C.5 Proveedor: tres selectores para el mismo dato

| Pantalla | Componente | Búsqueda | Alta rápida | Archivo:línea |
|---|---|---|---|---|
| Nueva orden | `SearchSelectCombobox` con icono `Truck`, placeholder «Buscar proveedor...» | sí, en memoria | **sí**: botón «Nuevo» → `QuickCreateDialog` con `NuevoProveedorForm` y autoselección | `NuevaOrdenCompraForm.tsx:337-356`, `:622-634` |
| Editar orden | **`Select` plano de shadcn**, placeholder «Seleccionar proveedor» | **no** | no | `EditarOrdenCompraForm.tsx:314-326` |
| Filtro del listado | `Select` plano, placeholder «Proveedor» | no | no | `OrdenesCompraFilters.tsx:67-79` |

Ninguno muestra `subtitle` (NIT, correo, teléfono) aunque el tipo lo soporta y el detalle sí trae
esos campos. Al cambiar de proveedor, los formularios recargan `product_suppliers` y resetean el
alcance del buscador, pero **no revalidan las líneas ya añadidas**, que pueden no pertenecer al nuevo
proveedor.

---

## D. Lo que dice la base de datos

Todo lo de esta sección se verificó con el MCP de Supabase el 2026-09-22, en solo lectura.

### D.1 Columnas que importan

| Tabla | Hallazgo |
|---|---|
| `accounts_receivable` | `id uuid`, `organization_id int NOT NULL`, `customer_id uuid`, `invoice_id uuid`, **`sale_id uuid`** (la venta del POS a crédito), `amount`, `balance`, `due_date **timestamptz**`, `status text`, `days_overdue int`, `last_reminder_date timestamptz`, `branch_id int`, `discount_amount numeric NOT NULL DEFAULT 0` |
| `accounts_payable` | las mismas menos `sale_id` y `last_reminder_date`; `supplier_id int NOT NULL`; `due_date **timestamptz**` |
| `ar_installments` | `account_receivable_id uuid NOT NULL`, `installment_number smallint`, `due_date **date**`, `amount`, `principal`, `interest DEFAULT 0`, `balance`, `status DEFAULT 'pending'`, `paid_amount DEFAULT 0`, `paid_at`, `days_overdue DEFAULT 0`, `discount_amount`. **Sin `organization_id`, sin `branch_id` y sin `notes`** |
| `ap_installments` | idénticas **más `notes text`**. Sin `organization_id` ni `branch_id` |
| `purchase_orders` | `id int` (secuencia) + **`uuid` NOT NULL** (la ruta usa el uuid), `organization_id`, **`branch_id int NOT NULL`**, `supplier_id int NOT NULL`, `status text NOT NULL`, `expected_date **date**`, `total`, `created_by uuid`, `notes text` |
| `purchase_order_items` | `purchase_order_id int`, `product_id int`, `quantity`, `unit_cost`, `subtotal` (generada), **`received_quantity numeric NOT NULL DEFAULT 0`**, `notes`, **`requires_serial boolean DEFAULT false`**, **`serials_received text[] DEFAULT '{}'`** |
| `payments` | `id, organization_id, branch_id, source, source_id **text**, method, amount, currency, reference, processor_response jsonb, status, created_by, created_at, updated_at, payment_date, discount_amount, change_amount`. **No existe `bank_account_id`** |
| **Recepciones** | **No existe ninguna tabla de recepciones** en `public`: la búsqueda de `%purchase%`, `%receipt%`, `%recep%` y `%goods%` solo devuelve `invoice_purchase`, `invoice_purchase_applied_taxes`, `purchase_orders` y `purchase_order_items` (más dos ajenas: `ai_credit_purchases`, `domain_purchases`) |

**Distinción de fechas, crítica para el renderizado** (regla 5 de `docs/reglas-fechas-timezone.md`):
`accounts_receivable.due_date` y `accounts_payable.due_date` son **`timestamptz` → `formatDateInTz`**;
`ar_installments.due_date`, `ap_installments.due_date` y `purchase_orders.expected_date` son
**`date` → `formatPlainDate`**. Hoy el código mezcla `useFormatDate()`, `parseLocalDate(...)` con
`es-ES`, `toLocaleDateString('es-CO')` y `new Date()` en la misma pantalla (§F.A11).

### D.2 Restricciones `CHECK`

| Tabla | Restricción |
|---|---|
| `purchase_orders` | `status IN ('draft','sent','partial','received','closed','cancelled')` |
| `ar_installments` | `status IN ('pending','partial','paid','overdue','written_off')` + `chk_ar_installments_amounts`: `paid_amount >= 0 AND balance >= 0` |
| `ap_installments` | `status IN ('pending','partial','paid','overdue','cancelled')` |
| `invoice_sales` | `status IN ('draft','issued','paid','partial','void')` |
| `invoice_purchase` | `status IN ('draft','received','paid','partial','void')` |
| **`accounts_receivable`** | **ninguna sobre `status`** |
| **`accounts_payable`** | **ninguna sobre `status`** |

Que no haya `CHECK` en las dos tablas de cartera es exactamente lo que permite que el código haya
escrito `'active'` (`app/api/web-orders/[id]/refund/route.ts:271`) y `'cancelled'`
(`lib/services/posService.ts:3181`), valores que ningún badge conoce (§F.A8).

Y **las dos escalas de estado de cuota no coinciden**: cobrar admite `written_off` y pagar admite
`cancelled`. Ninguna de las dos está mapeada en la interfaz.

### D.3 Triggers — quién recalcula qué

**Sobre `payments`** (se disparan en orden alfabético de nombre de trigger):

| Trigger | Cuándo | Qué hace |
|---|---|---|
| `tr_update_accounts_receivable_on_payment` | AFTER INSERT | Con `source='invoice_sales'`: si no hay cuenta para esa factura llama a `create_account_receivable(invoice_id)`, y si la hay copia `invoice_sales.balance` a `accounts_receivable.balance`. Con **`source='account_receivable'`**: resta `amount + discount_amount` del saldo de la cuenta, deriva `status` (`paid`/`partial`) **y actualiza además `invoice_sales.balance` y `invoice_sales.status`** |
| `trg_recalc_invoice_balance_from_payments` | AFTER INSERT/UPDATE/DELETE | Recalcula `invoice_sales.balance` (y `status` solo si hay dinero recibido) y `invoice_purchase.balance` **sumando los pagos completados**, que es la vía correcta |
| `trg_auto_journal_payment` | AFTER INSERT | Asiento contable del pago |
| `trg_normalize_payment_status` | BEFORE INSERT/UPDATE | Normaliza `status` |
| `trg_notify_payment_registered`, `audit_payments_trigger`, `trg_branch_default` | — | Notificación, auditoría, sucursal por defecto |

**Detalle que explica un desfase real:** `tr_update_accounts_receivable_on_payment` se ejecuta
**antes** que `trg_recalc_invoice_balance_from_payments` (`tr_` < `trg_` alfabéticamente). Para un
pago con `source='invoice_sales'`, la cuenta por cobrar se actualiza con el saldo **anterior** de la
factura, y solo se pone al día en el siguiente pago. Para `source='account_receivable'` no ocurre,
porque ese camino escribe los dos.

**Sobre `invoice_sales`:** `tr_create_account_receivable` (AFTER INSERT, `status <> 'draft'`) y
`tr_update_account_receivable` (AFTER UPDATE, cuando cambian `status` o `balance`), ambos llamando a
`create_account_receivable(NEW.id::text)`, que **crea la cuenta o la actualiza** con `amount`,
`balance`, `status` y `due_date` de la factura.

**Sobre las cuotas:** `trg_ar_installments_before_save` (BEFORE INSERT/UPDATE) recalcula
`days_overdue`, `status` y `balance` de cada cuota — **usando `CURRENT_DATE`, que es UTC**, mientras
`calculate_days_overdue` de `accounts_receivable` sí usa `fn_today_for_org(organization_id)`. Dos
relojes distintos para el mismo vencimiento. `ap_installments` solo tiene `updated_at` y el asiento
contable: **su `status` y su `balance` los escribe el navegador**.

**Sobre `purchase_orders`:** `trg_auto_journal_purchase_order` (AFTER UPDATE OF status) genera el
asiento **solo cuando `status = 'received'` y solo si el estado cambió**, por `COALESCE(NEW.total,0)`
completo, resolviendo la subcuenta de inventario por sucursal en `branch_account_mappings` y el
tipo de evento (`received_cash` / `received`) según `suppliers.credit_days`.
**Consecuencia: una recepción parcial no genera ningún asiento**, y cuando la orden pasa de
`partial` a `received` el asiento se hace por el total de la orden, no por lo recibido en ese
momento.

**No existe ningún trigger sobre `accounts_payable` que reaccione a `payments`.** Es la raíz de §B.1.

### D.4 RLS

| Tabla | Políticas |
|---|---|
| `accounts_receivable` | `accounts_receivable_organization_access` (permisiva, `authenticated`, pertenencia por `organization_members`) + **`branch_access_restrictive`** sobre `app_branch_access(branch_id)` |
| `accounts_payable` | las dos equivalentes |
| `ar_installments` | cuatro políticas separadas (select/insert/update/delete) sobre `can_access_account_receivable(account_receivable_id)` |
| `ap_installments` | **una sola** política para todos los comandos, por pertenencia a través de `accounts_payable` |
| `purchase_orders` | `purchase_orders_select_policy` y `purchase_orders_insert_update_delete_policy`, ambas por pertenencia a la organización. **No hay política restrictiva de sucursal**, pese a que `branch_id` es `NOT NULL` |
| `purchase_order_items` | `purchase_order_items_org_access` vía `EXISTS` sobre `purchase_orders` + `organization_members` |

`app_branch_access` (SECURITY DEFINER) permite si: no hay sucursal; o la persona es super admin o
tiene el rol «Super Admin» / «Admin de organización»; o tiene la sucursal asignada en
`member_branches`; **o es miembro de la organización y no tiene ninguna sucursal asignada** (regla 4,
*fail-open*). Esto es coherente con lo que `PATRONES-TRANSVERSALES.md` §9 documenta sobre
`branchService`, y explica el estado «sin sucursal asignada» del patrón 10.

**Asimetría a documentar:** cartera filtra por sucursal en la base de datos; **órdenes de compra
no**. En el diseño, el `BranchBadge` de órdenes de compra describe un filtro de aplicación, no una
frontera de seguridad.

### D.5 Los datos de hoy

| Medida | Valor |
|---|---|
| `accounts_receivable` por estado | `paid` 2.448 · `current` 500 · `overdue` 215 · `partial` 69 |
| `accounts_receivable` sin factura (`invoice_id IS NULL`) | 22 — ventas a crédito del POS, vinculadas por `sale_id` |
| `accounts_payable` por estado | `pending` 49 · `partial` 6. **Nunca `paid`, nunca `overdue`** |
| `ar_installments` / `ap_installments` | 3 filas cada una |
| `payments` por origen | `invoice_sales` 2.371 · `web_order` 762 · `sale` 64 · **`account_receivable` 55** · `pms` 15 · **`account_payable` 5** · `invoice_purchase` 4 · `folio` 2 · `parking_session` 1 |
| `purchase_orders` | 33 (`draft` 18 · `received` 7 · `sent` 5 · `cancelled` 2 · `partial` 1) |
| `purchase_order_items` | **5 líneas en total**; 1 con recepción parcial |
| `invoice_purchase` | 56 filas, **`po_id` no nulo en 0** |
| `stock_movements` con `source='purchase_order'` | **0** |

Dos lecturas de diseño:

- **El aging de cuentas por pagar no existe en los datos**: el estado `overdue` nunca se escribe. El
  vencimiento se deduce en cliente comparando `due_date` con hoy. Cualquier pantalla que ofrezca
  «filtrar por Vencida» sobre `status` no devolverá nunca nada (§F.B1).
- **La recepción nunca ha movido inventario por esta vía**: cero filas en `stock_movements` con
  `source='purchase_order'`, y las siete órdenes `received` tampoco dejaron `po_id` en ninguna
  factura. El módulo está, en la práctica, sin estrenar — lo que da libertad para rediseñar la
  recepción sin romper histórico.

---

## E. Quién escribe la cartera a mano

Resultado de recorrer `src/` entero. **Corrección al supuesto de partida**: el diálogo que escribe
el saldo tres veces **no es** `AplicarAbonoModal` de cuentas por cobrar, sino `RegistrarPagoDialog`
de facturas de venta.

### E.1 El caso correcto, que es el contrato del diseño

`AplicarAbonoModal.tsx:141-147` → `CuentasPorCobrarService.aplicarAbono` (`service.ts:260-310`):
calcula `newBalance` en JS (`:279`) **y nunca lo usa**; solo hace `INSERT` en `payments`
(`:286-301`) y delega en el trigger, con el comentario explícito en `:308-309`:

> «El trigger update_accounts_receivable_on_payment se encarga automáticamente de actualizar el
> balance y estado».

Lo mismo en `id/service.ts:236-258`. **Este es el contrato que el `AplicarPagoDialog` único impone a
todas las pantallas: solo insertar en `payments`.** Sus dos defectos residuales: `currency:'COP'`
cableado (`service.ts:294`, `id/service.ts:248`) y el campo «Notas» capturado en la interfaz y
descartado en el insert.

### E.2 El caso que sí escribe tres veces

`components/finanzas/facturas-venta/id/RegistrarPagoDialog.tsx`:

1. `:204-219` — `UPDATE invoice_sales` con `nuevoSaldo = factura.balance − montoNumerico` y `status`
   derivado, calculado en el navegador.
2. Inserta el pago en `payments` — lo que ya dispara
   `trg_recalc_invoice_balance_from_payments` y `tr_update_accounts_receivable_on_payment`.
3. `:230-236` — `.rpc('create_account_receivable', { invoice_id_param })`, dentro de un `try/catch`
   que **silencia el error** (`:239-241`, `:243-245`).

Además, el `UPDATE` del paso 1 dispara por sí mismo `tr_update_account_receivable`. Son **cuatro
caminos de escritura sobre la misma cartera** por un solo cobro.

### E.3 INSERT directo en `accounts_receivable`

| Archivo:línea | Qué escribe |
|---|---|
| `lib/services/posService.ts:2373-2382` | `organization_id, customer_id, sale_id, amount, balance, due_date` hoy+30 d, `status:'partial'` — **sin `branch_id` y sin `invoice_id`** |
| `components/pos/mesas/id/pedidosService.ts:1105-1114` | con `branch_id` e `invoice_id` |
| `lib/services/webOrderConfirmationService.ts:629-638` | `balance: 0`, `status:'paid'` — **crea una cuenta ya saldada** |
| `lib/services/webOrderServerConfirmation.ts:733-742` | idéntico |
| `lib/services/parkingFinanceService.ts:183-186` | `insert(receivableData)` |

### E.4 UPDATE directo en `accounts_receivable`

| Archivo:línea | Qué escribe | Nota |
|---|---|---|
| `app/api/web-orders/[id]/refund/route.ts:268-274` | `balance + refund`, `status: 'active'` o `'partial'` | **`'active'` no existe** en el tipo ni en el badge |
| `components/finanzas/facturas-venta/id/NotaCreditoDialog.tsx:323-325` y `:488-493` | `balance` recalculado, `status: 'current'` o `'overdue'` | estado por saldo, no por fecha |
| `components/finanzas/facturas-venta/id/AnularFacturaDialog.tsx:78-84` | `balance: 0, status:'paid'` | anular no es pagar |
| `lib/services/posService.ts:3178-3184` | `balance: 0, status:'cancelled'` | **`'cancelled'` tampoco existe** en el tipo |
| `components/pos/devoluciones/devolucionesService.ts:1475-1481` y `:1553-1559` | `balance: 0, status:'paid'` / recálculo en JS | |
| `service.ts:317-323`, `id/service.ts:493-499`, `lib/services/notificationService.ts:102-108` | `last_reminder_date` | benignos, pero **tres sitios distintos para lo mismo** |

### E.5 INSERT / UPDATE / DELETE directos en `accounts_payable`

| Archivo:línea | Qué escribe |
|---|---|
| `components/finanzas/facturas-compra/FacturasCompraService.ts:356-364` | INSERT `amount, balance, status:'pending'` |
| `FacturasCompraService.ts:631-638` | UPDATE `amount, balance, due_date` por `invoice_purchase_id` |
| `FacturasCompraService.ts:879-884` | UPDATE `balance, status` por `invoice_id` |
| `FacturasCompraService.ts:1366-1368` | **DELETE** por `invoice_id` |
| `lib/services/purchaseOrderService.ts:924-932` | INSERT al recibir una orden completa |
| `CuentasPorPagarService.ts:617-623` | UPDATE tras un pago |
| `cuentas-por-pagar/id/service.ts:330-336` | UPDATE tras un pago (segunda implementación) |
| `paymentInitiationService.ts:404-410` y `:699-705` | UPDATE de pago y de reversión |

### E.6 `invoice_sales.balance` / `invoice_purchase.balance` calculados en el navegador

Catorce sitios: `RegistrarPagoDialog.tsx:204-219` · `NotaCreditoDialog.tsx:301-311` y `:435-474` ·
`AnularFacturaDialog.tsx:65-72` · `DetalleFactura.tsx:363-380` · `EditarFacturaVenta.tsx:111-126`,
`:222` · `lib/services/notasCreditoService.ts:295-316` · `lib/stripe/paymentService.ts:255-273`
(**con clave de service role**, `:238-247`) · `app/api/web-orders/[id]/refund/route.ts:282-295` ·
`devolucionesService.ts:993-998`, `:1018-1023`, `:1455-1461`, `:1531-1537` ·
`posService.ts:2150-2157` · `FacturasCompraService.ts:865-870` ·
`CuentasPorPagarService.ts:635-641` · `cuentas-por-pagar/id/service.ts:341-347`.

Todos compiten con `trg_recalc_invoice_balance_from_payments`, que ya calcula el saldo desde la suma
de los pagos completados.

### E.7 `ar_installments` y `ap_installments` escritos desde el navegador

Cobrar: `id/service.ts:296-299` (DELETE), `:328-330` (INSERT masivo), `:411-419` (UPDATE de
`paid_amount`, `balance`, `status`, `paid_at`), `:444-447` (DELETE).
Pagar: `cuentas-por-pagar/id/service.ts:367-430` y el generador muerto de
`CuentasPorPagarService.ts:971-1020`.
Y `CuotasPage.tsx:221-239` deja cambiar el `amount` de una cuota **sin recalcular su `balance`**;
`id/service.ts:406-424` hace *spread* directo de `updates` en el `UPDATE`, **sin lista blanca de
campos**.

---

## F. Lo roto o sin efecto

### F.A Cuentas por cobrar

| # | Qué pasa | Archivo:línea |
|---|---|---|
| A1 | **`handleExportCSV` solo hace `console.log` y su prop está muerta.** Se declara en la interfaz (`CuentasPorCobrarFiltros.tsx:17`), se desestructura (`:25`) y **nunca se invoca**: el botón «Exportar CSV» llama a la función local `exportarCSV` (`:51-68`) | `CuentasPorCobrarPage.tsx:124-127`, `:198` |
| A2 | **`/app/pos/cuentas-por-cobrar` muestra migas de Finanzas** y no ofrece vuelta al POS (§A.0) | `app/app/pos/cuentas-por-cobrar/page.tsx:6-8` · `CuentasPorCobrarPage.tsx:135-149` |
| A3 | **`Riesgo Bajo` gris (≥25 %) y `Bajo Riesgo` verde (<25 %)**: dos etiquetas casi idénticas para tramos distintos | `AgingReport.tsx:113` y `:115` |
| A4 | **El campo «Cliente» es inutilizable**: acepta «Nombre del cliente» pero su valor viaja como `customer_id_filter` (un UUID) al RPC | `CuentasPorCobrarFiltros.tsx:137-143` → `service.ts:43` |
| A5 | **«Tasa de interés mensual (%)» no se usa**: no llega a `crearCuotas` ni entra en la «Cuota estimada» | `InstallmentsCard.tsx:256-266`, `:91-96`, `:270` |
| A6 | **El campo «Notas» del abono no se guarda**: llega a `aplicarAbono` y el insert en `payments` no lo incluye | `AplicarAbonoModal.tsx:363-369` → `service.ts:288-301` |
| A7 | **El textarea del recordatorio del detalle no se puede vaciar, y el botón falla en el caso normal**: `value={reminderMessage \|\| getDefaultReminderMessage()}` pinta la plantilla con el estado vacío, así que «Enviar» sin tocar nada corta con «Por favor ingresa un mensaje» **con el campo visiblemente lleno** | `AccountActionsCard.tsx:270`, `:63-66` |
| A8 | **Estados escritos fuera del tipo**: `'active'` y `'cancelled'` caen en el badge de código crudo o en «Desconocido» | `refund/route.ts:271` · `posService.ts:3181` · `CuentasPorCobrarTable.tsx:104` · `AccountStatusBadge.tsx:37` |
| A9 | **«Marcar como Cobrada» (cabecera) vs «Marcar como Pagada» (panel y diálogo)**: el mismo botón con dos nombres. Y los dos botones de cabecera funcionan con `document.getElementById(...).click()` | `CuentaPorCobrarDetailPage.tsx:212`, `:223`, `:225` · `AccountActionsCard.tsx:472`, `:482` |
| A10 | **`canApplyPayment` y `canMarkAsPaid` son la misma expresión** (`hasBalance && !isPaid`): los dos botones aparecen y desaparecen siempre juntos | `id/service.ts:162-163` |
| A11 | **Tres formatos de fecha en la misma pantalla**: `useFormatDate()` con el huso de la organización en la lista, `parseLocalDate(...).toLocaleDateString('es-ES')` en los diálogos y `'es-CO'` en el detalle. Dentro de `RecordatoriosPanel`, **la misma columna** usa `parseLocalDate` en móvil (`:265`) y `new Date` en escritorio (`:350`). Y `parseLocalDate` se aplica sobre `last_reminder_date`, que es un ISO | `CuentasPorCobrarTable.tsx:68` · `AplicarAbonoModal.tsx:251` · `CuentaPorCobrarDetailPage.tsx:118` · `EnviarRecordatorioModal.tsx:135` |
| A12 | **Botones deshabilitados sin explicación**: «Abono» con `balance <= 0` y «Recordar» con `status !== 'overdue'`, sin `title`, sin tooltip, sin texto | `CuentasPorCobrarTable.tsx:277`, `:287`, `:395`, `:403` |
| A13 | **Badge «Vencida» cableado** en el diálogo de recordatorio, sin mirar `cuenta.status`; y «Estado resultante» del abono **siempre en verde**, incluso diciendo «Parcial» | `EnviarRecordatorioModal.tsx:157-160` · `AplicarAbonoModal.tsx:386-389` |
| A14 | **El KPI «cuentas activas» cuenta también las pagadas** (`total_cuentas` incluye `status='paid'`) | `service.ts:355` · `EstadisticasCards.tsx:23`, `:147` |
| A15 | **«Promedio Días Cobro» divide entre todas las cuentas, no entre las vencidas** | `service.ts:374-376`, `:391` |
| A16 | **«Eficiencia de Cobro» mezcla magnitudes**: `paid_amount` solo acumula el `amount` de las cuentas con `status='paid'`, y se divide por el `total_amount` de todas. Se pinta **dos veces** en la misma pestaña | `service.ts:366-367` · `EstadisticasCards.tsx:135-138` · `CuentasPorCobrarPage.tsx:231-245` |
| A17 | **«{N} pagos registrados · Total pagado: {X}» usa solo la página visible**, mientras la paginación de abajo usa el total | `PaymentHistoryCard.tsx:59`, `:124`, `:237` |
| A18 | **`obtenerEstadisticas` sin paginación ni `limit`**: en organizaciones grandes se trunca al límite por defecto de PostgREST y devuelve totales falsos | `service.ts:335-344` |
| A19 | **CSV sin escapar y sin BOM**: solo `customer_name` va entre comillas; correo, teléfono, estado y fechas van crudos. Una coma rompe el archivo. Igual en el CSV de aging | `service.ts:410-442` · `AgingReport.tsx:43-66` |
| A20 | **«Exportar Estado» produce un `.txt`** con el estado **crudo en inglés** y sin los pagos | `CuentaPorCobrarDetailPage.tsx:73-112`, `:91` |
| A21 | **Sin debounce en ninguna búsqueda**: una consulta por tecla en los filtros del listado y en el buscador del historial | `CuentasPorCobrarPage.tsx:56-60` · `PaymentHistoryCard.tsx:57` |
| A22 | **El estado de carga tapa toda la tabla**, incluidos el selector de tamaño y la paginación: parpadeo en cada recarga | `CuentasPorCobrarTable.tsx:141-163` |
| A23 | **Iconos sin etiqueta accesible**: el toggle de filtros avanzados y el refresco de la barra de filtros no tienen `aria-label` ni `title` | `CuentasPorCobrarFiltros.tsx:151-167` |
| A24 | **`fechaError` no bloquea el envío**: se pinta el mensaje y el botón solo se deshabilita por `isLoading` | `AccountActionsCard.tsx:415-417`, `:450` |
| A25 | **«Marcar como Pagada» inventa el método**: `aplicarPago(balance, 'efectivo', 'Marcado como pagado')`, sin preguntar método ni fecha, y `'efectivo'` puede no existir en los métodos de la organización | `AccountActionsCard.tsx:166-171` |
| A26 | **`crearCuotas` borra sin avisar** y el diálogo de creación no lo menciona; `min=2 max=60` contra una validación `2..36`; «Eliminar Plan» visible en una cuenta pagada sin plan | `id/service.ts:296-299` · `InstallmentsCard.tsx:249` vs `:84-85` · `:227` |
| A27 | **Trazas de depuración en producción**: `console.log('🏢 DEBUG getOrganizationId', …)` en **cada** llamada, `'💰 DEBUG aplicarPago'`, `'📋 Creando cuotas'`, el `console.log` del recordatorio y el del CSV | `id/service.ts:29`, `:232`, `:326` · `EnviarRecordatorioModal.tsx:58-62` · `CuentasPorCobrarPage.tsx:126` |
| A28 | **Props y elementos muertos**: `onUpdate` de `PaymentHistoryCard`, `canEdit`, la interfaz `PaymentMethod`, `PaginationEllipsis` importado y no usado | `PaymentHistoryCard.tsx:18` · `id/service.ts:164` · `AplicarAbonoModal.tsx:31-35` · `CuentasPorCobrarTable.tsx:30` |

### F.B Cuentas por pagar

| # | Qué pasa | Archivo:línea |
|---|---|---|
| B1 | **El filtro «Estado» no devuelve nunca una fila**: emite `pendiente`/`vencida`/`parcial`/`pagada` contra valores reales `pending`/`partial`/`paid`. El propio tipo los declara en inglés | `CuentasPorPagarFiltros.tsx:175-178` · `CuentasPorPagarService.ts:113` · `types.ts:116` |
| B2 | **Tres de las cinco opciones de «Vencimiento» no hacen nada**: `hoy`, `proximos_7`, `proximos_30` no están en el `switch` del servicio | `CuentasPorPagarFiltros.tsx:192-194` vs `CuentasPorPagarService.ts:160-170` |
| B3 | **La búsqueda no busca y además trae toda la tabla**: `.or()` sobre recursos embebidos sin `!inner`, sin `range` y sin debounce | `CuentasPorPagarService.ts:123-136` · `CuentasPorPagarFiltros.tsx:157-163` |
| B4 | **Las tres pestañas filtran en cliente sobre la página actual** (10 filas) mientras la paginación sigue con los totales sin filtrar; `getFiltrosPorTab` existe y **nunca se llama** | `CuentasPorPagarPage.tsx:375`, `:402-409`, `:436`, `:222-235` |
| B5 | **El badge de «Aprobaciones» arranca en 0**: `cargarPagosProgramados` no se ejecuta al montar, solo al pulsar «Actualizar» | `CuentasPorPagarPage.tsx:90-96`, `:139-148`, `:291-295` |
| B6 | **El diálogo de aprobación siempre dice «Pago #xxxxxxxx» y «Sin fecha»** (§B.4) | `CuentasPorPagarService.ts:549-551` · `AprobacionPagosModal.tsx:273`, `:410` |
| B7 | **Los cuatro formatos bancarios generan el mismo CSV**; «BBVA Excel» descarga un `.xlsx` con contenido de texto plano; `bank_files` guarda siempre `.csv` y queda en `pending` | `ExportarBancaModal.tsx:59-88` vs `:149-154`, `:232` · `CuentasPorPagarService.ts:909-913` |
| B8 | **«Conciliar Pagos» es una simulación declarada** con toast de éxito | `ExportarBancaModal.tsx:131-140` |
| B9 | **Open Finance del listado nunca funciona**: `Number(uuid)` → `NaN` | `CuentasPorPagarPage.tsx:523` · `paymentInitiationService.ts:172` |
| B10 | **Los pagos de Open Finance no salen en ningún historial**: se insertan con `source:'accounts_payable'` (plural) frente al `'account_payable'` del resto; y marcan `balance = 0` fijo sin tocar `invoice_purchase` | `paymentInitiationService.ts:373`, `:400` |
| B11 | **El diálogo de pago del detalle escribe `bank_account_id`, columna que no existe** en `payments` (§D.1): elegir cuenta bancaria rompe el insert | `cuentas-por-pagar/id/service.ts:307-309` |
| B12 | **El select de cuenta bancaria del listado es decorativo**: no se envía. Tampoco `payment_date` ni `notes` | `RegistrarPagoModal.tsx:421-456`, `:480-491` vs `CuentasPorPagarService.ts:466-477` |
| B13 | **«Cancelar» del diálogo «Marcar como Pagada» no cierra nada**: botón sin `onClick` ni `DialogClose` | `cuentas-por-pagar/id/AccountActionsCard.tsx:442-444` |
| B14 | **Dos botones «Exportar Estado» en la misma pantalla**, con generadores y contenidos distintos (uno sin el plan de cuotas) | `CuentaPorPagarDetailPage.tsx:219-227` vs `id/AccountActionsCard.tsx:460-467` |
| B15 | **Desde `/[id]/cuotas` no se puede pagar**: el select lee `method.payment_methods?.code` y el servicio del detalle devuelve `payment_method` en singular → todos los `SelectItem` valen `''`, que Radix no admite | `CuotasPage.tsx:620-621` vs `id/service.ts:442-478` |
| B16 | **«Eliminar Plan» borra sin confirmación** en `/[id]/cuotas`, mientras el mismo botón del detalle sí confirma | `CuotasPage.tsx:342-349` vs `InstallmentsCard.tsx:312-334` |
| B17 | **«Editar Cuota» permite cambiar el monto sin recalcular el saldo**, y el `UPDATE` hace *spread* sin lista blanca | `CuotasPage.tsx:221-239` · `id/service.ts:406-424` |
| B18 | **El badge «Vencida ({d}d)» de la tabla tiene prioridad sobre el estado**: una cuenta `paid` con fecha pasada se pinta como vencida, porque `days_overdue` se recalcula sin mirar el saldo | `CuentasPorPagarTable.tsx:89-96` · `CuentasPorPagarService.ts:186-191` |
| B19 | **«Registrar Pago» y «Programar Pago» se ofrecen en cuentas ya pagadas** desde el listado; el detalle sí lo impide. Reglas distintas para la misma acción | `CuentasPorPagarTable.tsx:352-359` vs `id/service.ts:179-190` |
| B20 | **Estados de badge inalcanzables**: `approved`/`rejected`/`processed` no existen en `payments.status`; `overdue` no se escribe nunca en `accounts_payable` (§D.5); `cancelled` de `ap_installments` no está mapeado | `AprobacionPagosModal.tsx:171-176` · `id/AccountStatusBadge.tsx:22-25` · `InstallmentsCard.tsx:26-47` |
| B21 | **El aprobador destruye la fecha programada** al sobrescribir `reference` con el HTML del comentario | `CuentasPorPagarService.ts:672-674` |
| B22 | **El modal de exportación puede generar un CSV vacío y decir que exportó N pagos**: recarga con `pageSize 1000` **sin `branchId`** y filtra en cliente | `ExportarBancaModal.tsx:181-210`, `:249-252` |
| B23 | **`AprobacionPagosModal` está truncado a 10 registros sin paginación**: el pago número 11 es invisible y tampoco se cuenta en el badge | `CuentasPorPagarService.ts:569` |
| B24 | **Aprobar y rechazar son iconos sin texto ni `aria-label`**, verde y rojo, con efecto irreversible | `AprobacionPagosModal.tsx:338-363` |
| B25 | **La selección sobrevive al cambio de página y de pestaña sin avisar**: se pueden exportar filas que ya no se ven; `selectAll` es estado local de cada una de las cuatro instancias de la tabla | `CuentasPorPagarTable.tsx:84`, `:130-137` |
| B26 | **Cinco funciones de servicio muertas** y una segunda implementación divergente de `crearCuotas` (§B.2) | `CuentasPorPagarService.ts:327-361`, `:504-534`, `:840-877`, `:968-986`, `:989-1031` |
| B27 | **`DEBUG` en producción** con `organizationId`, `userId` y el formulario completo volcados | `CuentasPorPagarService.ts:390-395`, `:411`, `:425`, `:493`, `:646`, `:705`, `:745`, `:929` |
| B28 | **Sin `organization_id` en varios `UPDATE`/`DELETE`** de `accounts_payable`, `invoice_purchase` y `ap_installments` | `CuentasPorPagarService.ts:623`, `:641` · `id/service.ts:199`, `:233`, `:321`, `:336`, `:347`, `:371`, `:388`, `:417`, `:432` |
| B29 | **El detalle no tiene migas de pan** y la ruta `/cuotas` no tiene regreso al listado | `CuentaPorPagarDetailPage.tsx:191-193` · `CuotasPage.tsx:307-322` |
| B30 | **El `CopyableId` del número de factura navega a la cuenta por pagar**, no a la factura | `CuentasPorPagarTable.tsx:284-289` |

### F.C Órdenes de compra

| # | Qué pasa | Archivo:línea |
|---|---|---|
| C1 | **«Documentos Vinculados» no aparece nunca**: la consulta filtra por `po_id` y `generateInvoiceFromPurchaseOrder` **nunca lo escribe** (usa `notes` con «OC-{id}»). Verificado en datos: `po_id` es nulo en las 56 facturas de compra (§D.5). La factura y la cuenta por pagar que la propia recepción genera quedan **invisibles desde la orden** | `OrdenCompraDetalle.tsx:120-124` vs `purchaseOrderService.ts:857-877` |
| C2 | **El botón «Importar» va a un 404**: `/app/inventario/ordenes-compra/importar` no existe | `OrdenesCompraHeader.tsx:24-29` |
| C3 | **El botón «Exportar» nunca se renderiza**: está tras `{onExport && …}` y la página monta la cabecera sin esa prop. No hay exportación de órdenes | `OrdenesCompraHeader.tsx:9`, `:30-35` · `page.tsx:206` |
| C4 | **Todo el flujo de seriales de la creación está muerto**: `getProducts` selecciona `track_serial` pero **no lo mapea** en el objeto devuelto, así que `item.track_serial` es siempre `undefined` → `requires_serial: false` → la sección de captura nunca se muestra y la validación «Seriales incompletos» nunca dispara | `purchaseOrderService.ts:1026` vs `:1127-1142` · `NuevaOrdenCompraForm.tsx:173-174`, `:534` |
| C5 | **Y la captura de seriales al recibir es inalcanzable**: el embed de líneas no trae `track_serial`, y `requires_serial` está en `false` por C4. Con ella, las ~145 líneas de `receiveItemsWithSerials` | `purchaseOrderService.ts:181` · `OrdenCompraDetalle.tsx:110`, `:116`, `:663` · service `:641-784` |
| C6 | **El enlace desde el detalle del proveedor está roto**: navega con el **id numérico** donde la ruta espera el **uuid**; el servicio valida con regex y devuelve «UUID de orden inválido» | `ProveedorDetalle.tsx:392` · `supplierService.ts:493-499` · `purchaseOrderService.ts:152-155` |
| C7 | **`?supplier=` se ignora**: el formulario de alta no lee `useSearchParams` | `ProveedorDetalle.tsx:203` |
| C8 | **Las notas se escriben en HTML y se leen en texto plano**: el detalle pinta `{order.notes}` dentro de un `<p>`, así que se ven las etiquetas crudas. Ese HTML además se busca en el filtro del listado y se concatena en las notas de la factura automática | `NuevaOrdenCompraForm.tsx:371-377` · `OrdenCompraDetalle.tsx:410-424` · `purchaseOrderService.ts:872` |
| C9 | **Editar destruye datos**: `updatePurchaseOrder` borra todas las líneas y reinserta con `requires_serial: false` y `serials_received: null`, y el formulario solo envía `{product_id, quantity, unit_cost}` → se pierden las notas de línea, los seriales y los ids de las líneas | `purchaseOrderService.ts:295-314` · `EditarOrdenCompraForm.tsx:251-255` |
| C10 | **El número de página no se reinicia al filtrar**: `page` es estado interno de la tabla. Desde la página 5, un filtro con un resultado deja la tabla en blanco con «No hay órdenes de compra» **y sin controles para volver** (el bloque solo se pinta si `totalPages > 1`) | `OrdenesCompraTable.tsx:64-70`, `:205` |
| C11 | **El listado trae todas las órdenes de la organización** (sin `range` ni `limit`) y pagina en el navegador de 10 en 10, con tamaño **cableado**; `getStats` repite la carga completa para agregar en cliente | `purchaseOrderService.ts:106-132`, `:947-969` · `OrdenesCompraTable.tsx:65` |
| C12 | **La búsqueda solo filtra la página cargada**: el filtro `search` existe en la firma del servicio y **nunca se implementa** ni se pasa | `page.tsx:97-105` vs `purchaseOrderService.ts:100` |
| C13 | **«Cancelar» no pide confirmación**, ni en la fila ni en el detalle, mientras «Eliminar» sí | `OrdenesCompraTable.tsx:173-181` · `OrdenCompraDetalle.tsx:330-341` |
| C14 | **El estado `closed` es inalcanzable y se pintaría como «Borrador»** (§C.2) | `purchaseOrderService.ts:12` · `OrdenesCompraTable.tsx:73` |
| C15 | **El KPI de canceladas se calcula y no se muestra**: hay 6 tarjetas y `stats.cancelled` no es ninguna | `purchaseOrderService.ts:968` · `OrdenesCompraStats.tsx:30-74` |
| C16 | **Numerador de factura con carrera y sin reinicio anual**: lee la última `number_ext` y hace `parseInt(...) + 1` sin bloqueo ni secuencia; el contador no vuelve a empezar al cambiar de año | `purchaseOrderService.ts:840-851` |
| C17 | **La deduplicación de factura es frágil**: `total` + `issue_date = hoy` + `notes ILIKE '%OC-{id}%'`. Una recepción a caballo de medianoche duplica factura y cuenta por pagar | `purchaseOrderService.ts:806-814` |
| C18 | **La factura automática nunca lleva impuestos** y cablea `currency:'COP'` y `payment_terms: 30` | `purchaseOrderService.ts:866-893` |
| C19 | **Fallos silenciados**: la factura automática, sus líneas, la cuenta por pagar y el vínculo de seriales fallan con `console.warn` y **sin toast**. La persona cree que se generó todo | `purchaseOrderService.ts:625-627`, `:905`, `:916`, `:936` |
| C20 | **`.single()` donde debería ir `.maybeSingle()`**: error `PGRST116` en cada carga del detalle, descartado sin leerlo | `OrdenCompraDetalle.tsx:123`, `:131` |
| C21 | **El `disabled` de los dos comboboxes está incompleto**: `onFocus` sigue abriendo el desplegable y los botones de la lista no reciben `disabled` → se puede seleccionar con el control deshabilitado | `ProductSearchCombobox.tsx:165`, `:188`, `:232` · `SearchSelectCombobox.tsx:93`, `:116`, `:132` |
| C22 | **Clase de Tailwind inexistente**: `dark:bg-gray-750` deja la cabecera de grupo pegajosa sin fondo en modo oscuro, y el texto se solapa al desplazar | `ProductSearchCombobox.tsx:215` |
| C23 | **Rejilla del detalle mal configurada**: contenedor `grid-cols-1 sm:grid-cols-2 md:grid-cols-3` con un hijo `lg:col-span-2` que nunca se activa; el reparto 2/3 + 1/3 no se aplica | `OrdenCompraDetalle.tsx:345`, `:347` |
| C24 | **La tabla de productos del detalle no tiene estado vacío**: cabeceras y cuerpo vacío | `OrdenCompraDetalle.tsx:368-403` |
| C25 | **El diálogo de recepción envía todas las líneas siempre**, incluidas las que no cambiaron: N `UPDATE` redundantes por recepción parcial | `OrdenCompraDetalle.tsx:204-208` |
| C26 | **Sin guardia anti-doble-envío en «editar»** (solo `disabled={isSaving}`, sin `hasSaved`): un doble clic rápido puede disparar dos ciclos de borrado y reinserción | `NuevaOrdenCompraForm.tsx:65`, `:592` vs `EditarOrdenCompraForm.tsx:559` |
| C27 | **`updated_by` siempre `null` en `stock_movements`**: el parámetro existe y el servicio nunca lo pasa. Movimientos de inventario sin autoría | `purchaseOrderService.ts:583-589`, `:708-714` · `stockMovementService.ts:464` |
| C28 | **Duplicaciones literales**: el mapa de estados en dos archivos, el filtro por proveedor en tres, el nombre con variante en tres | `OrdenesCompraTable.tsx:48-54` / `OrdenCompraDetalle.tsx:61-67` · §C.4 |
| C29 | **Consultas a la base de datos desde el componente de presentación**, saltándose el servicio | `OrdenCompraDetalle.tsx:10`, `:120-134` |
| C30 | **`console.log` decorativos con emoji en producción**, en la ruta de recepción y de facturación automática | `purchaseOrderService.ts:593`, `:817`, `:939` |
| C31 | **`getProductsBySupplier` sin filtro de organización** | `supplierService.ts:647-650` |
| C32 | **En el flujo adyacente**: «entrada de inventario» de facturas de compra navega a `/app/inventario/entradas/nueva?factura_id=…`, ruta que **tampoco existe**, con el `TODO` justo encima | `FacturasCompraTable.tsx:108-109` |

Nada de `window.alert` ni `confirm()` en el módulo de órdenes de compra (verificado con `grep`);
los que sí existen están en facturas de compra y ya los recoge la auditoría de Finanzas.

---

## G. Qué falta

Cinco huecos funcionales que el rediseño debe abrir, marcados «Nuevo» en Figma porque **no existen en
el código**.

### G.1 Conciliación de abonos

Hoy no hay forma de responder «¿este abono a qué factura se aplicó y qué queda pendiente?». Falta:

- **Anular un pago registrado.** No existe en ninguna de las dos carteras (ni en el detalle, ni en el
  historial, ni en el listado). Un pago mal cargado solo se corrige por base de datos. El trigger
  `trg_recalc_invoice_balance_from_payments` **ya contempla `DELETE` y `UPDATE`** (§D.3), así que la
  base está preparada; falta la pantalla y la política.
- **Ver el comprobante** y **exportar el historial** de pagos.
- **Deduplicar los pagos del detalle de cuentas por pagar**, que hoy suma dos orígenes sin comparar
  (§B.2).
- **Un pago repartido entre varias cuentas o varias facturas.** Hoy cada pago apunta a un único
  `source_id` de texto, y el reparto entre cuotas se resuelve generando N pagos (§A.5, §B.3).

### G.2 Nota de ajuste

No existe ningún documento que corrija una cuenta por cobrar o por pagar sin fingir un cobro. Las
correcciones se hacen hoy **escribiendo el estado a mano**: «Marcar como Pagada» inventa un pago en
efectivo por el saldo (`AccountActionsCard.tsx:166-171`), anular una factura pone `balance: 0,
status:'paid'` (`AnularFacturaDialog.tsx:78-84`), y una devolución hace lo mismo
(`devolucionesService.ts:1475-1481`). Falta:

- **«Ajustar saldo»** con motivo obligatorio, importe con signo y asiento contable asociado, que
  distinga **condonación**, **corrección de digitación**, **descuento por pronto pago** (la columna
  `discount_amount` ya existe en las cuatro tablas y solo la usa el trigger de cobrar) y **castigo de
  cartera** (el `CHECK` de `ar_installments` ya admite `written_off`).
- Con eso, «Marcar como Pagada» desaparece del diseño: su lugar lo ocupan «Saldo total» dentro del
  diálogo de abono y «Ajustar saldo» para lo que no es cobro.

### G.3 Plan de pagos

El plan de cuotas existe a medias y de dos maneras incompatibles (§A.5, §B.3). Falta:

- **Generación transaccional en una RPC**, no un bucle en el navegador que borra y reinserta.
- **Interés real en cobrar**: hoy el campo se pinta y se descarta.
- **Una sola previsualización** que coincida con lo que se genera.
- **Reprogramar una cuota** y **reprogramar el plan entero** sin destruir lo pagado; hoy `crearCuotas`
  borra el plan incluso si hay cuotas pagadas, dejando los `payments` huérfanos.
- **Editar una cuota desde el detalle**: hoy solo se puede desde la ruta huérfana `/[id]/cuotas`, y
  allí sin recalcular el saldo (§F.B17).
- **Cuotas en la cartera por cobrar dentro del listado**: «vence la cuota 3 de 6» no aparece por
  ningún lado fuera del detalle.

### G.4 Recordatorios automáticos

Hoy son manuales, y dos de los tres caminos no envían nada (§A.4). Falta:

- **Reglas**: «a los 3 días de vencer», «a los 15», «a los 30», por tramo de aging o por importe.
- **Plantillas editables por la organización**, con sus variables, en lugar de dos plantillas
  cableadas en dos componentes distintos.
- **Canal elegible** (correo, WhatsApp, ambos): `notificationService` ya inserta en `notifications`
  con `channel`, pero la interfaz no lo ofrece.
- **Historial de recordatorios**: hoy solo queda `last_reminder_date`, un único `timestamptz`. No se
  sabe cuántos se enviaron, con qué texto ni si llegaron.
- **Y el panel de recordatorios debe respetar la sucursal**, que hoy ignora (§A.4).

### G.5 Recepción parcial trazable

La recepción parcial se puede teclear pero **no deja rastro** (§C.3). Falta:

- **Una tabla de recepciones** (cabecera con número, fecha, sucursal, quién recibió, nota y
  documento del proveedor; líneas con la cantidad recibida en **esa** recepción y sus seriales).
  Hoy no existe ninguna (§D.1) y `received_quantity` se sobrescribe con el acumulado.
- **`stock_movements.source_id` apuntando a la línea de recepción**, no a la orden, para poder
  reconstruir qué entró por dónde.
- **Autoría**: `updated_by` real en lugar de `null`.
- **Recepción transaccional en una RPC**, en lugar de 4 + 5N llamadas sin transacción.
- **Devolución al proveedor**: hoy bajar la cantidad recibida reduce el campo pero **no devuelve
  stock** (§F.C, delta negativo).
- **Guardia de sobre-recepción en el servidor**, no solo el `max` del HTML.
- **Y el vínculo de vuelta**: escribir `po_id` en `invoice_purchase` al generar la factura, que es lo
  único que separa a Finanzas de poder navegar a la orden que originó la compra (§C.0, §F.C1).

---

## H. Recomendación de rediseño

El detalle frame a frame está en `docs/design/PARIDAD-CARTERA-ORDENES-COMPRA.md`. Los cinco
principios que lo gobiernan:

1. **Un solo diálogo de pago.** Cartera por cobrar, cartera por pagar, cuotas y facturas usan la
   misma instancia de `AplicarPagoDialog` (`02 Componentes › Finanzas`), con el contrato «solo
   inserta en `payments`». Se le añadió la propiedad booleana **`Mostrar cuota`** para el campo
   «Aplicar a cuota (opcional)», que cartera necesita y facturas no: es una ampliación del
   componente existente, no un componente paralelo.
2. **Una sola escala de aging**, la de `SISTEMA-BADGES.md`: `Al día` · `1-30 días` · `31-60 días` ·
   `61-90 días` · `Más de 90 días`, con los tonos éxito / advertencia / advertencia / peligro /
   peligro sólido. Las cuatro escalas de hoy (§A.3) se colapsan en esa. El número de días va **dentro
   de la etiqueta**, nunca en un segundo badge.
3. **Nada escribe el estado a mano.** «Marcar como Pagada» desaparece en favor de «Saldo total»
   dentro del diálogo de abono; lo que no es un cobro pasa por «Ajustar saldo» (§G.2, marcado
   «Nuevo»).
4. **La recepción es un documento, no un campo.** El diálogo de recepción produce una recepción con
   su número, su fecha y su autor, y el detalle de la orden muestra el historial de recepciones, no
   solo el acumulado (§G.5, marcado «Nuevo»).
5. **Un solo selector de producto en toda la aplicación.** `ProductPicker` de
   `02 Componentes › Productos y POS`, en su variante `Mode=purchase`, sustituye a
   `ProductSearchCombobox`; `SupplierPicker` de `02 Componentes › Finanzas` sustituye a
   `SearchSelectCombobox` y a los dos `Select` planos de «editar» y del filtro. Es el encargo
   explícito del dueño: el mismo buscador de productos en finanzas, compras e inventario.

---

## I. Ampliación 2026-09-23 — recepción con variantes, seriales y lotes; PDF; selectores; conexiones

Segunda pasada sobre órdenes de compra, pedida por el dueño («¿cómo es la recepción cuando hay
seriales, lotes o kardex?, ¿tiene en cuenta las variantes?, ¿y el PDF de la orden?»). Lectura de
código en el commit `6ac64b9a` y **verificación por el MCP de Supabase en solo lectura** el
2026-09-23. No repite §C–§H: solo añade lo que no estaba o lo que cambió desde el 2026-09-22.
El diseño resultante está en `PARIDAD-CARTERA-ORDENES-COMPRA.md` §11.

### I.1 Lo que cambió en la base desde §D

| Hecho | Estado hoy | Fuente |
|---|---|---|
| `stock_movements_source_check` admite `purchase_order` y `purchase_invoice` | **Sí**, desde el commit `6904f6e7` (22 orígenes). Antes la recepción subía `stock_levels` y el movimiento de kardex se rechazaba en silencio | `pg_constraint` |
| Recepciones de orden registradas desde el arreglo | **0**. `stock_movements` con `source='purchase_order'`: 0 filas; `journal_entries` con `source='purchase_order'`: 0 | recuento |
| `fn_create_journal_entry` acepta clave del hecho | Sí: firma de 14 argumentos con `p_fact_key` (commit `d8090114`). **Ninguna función de compras la pasa** | `pg_proc` |
| Órdenes y renglones | 33 órdenes (`draft` 18 · `received` 7 · `sent` 5 · `cancelled` 2 · `partial` 1) y **5 renglones en total**: casi todas las órdenes no tienen renglones | recuento |

### I.2 Hallazgo nuevo y grave: una recepción completa generaría hasta cuatro asientos

Con el `CHECK` ya corregido, la **primera** recepción que se registre dispara, sin clave común:

| # | Disparador | Qué asienta | Regla (organizaciones con la regla activa) |
|---|---|---|---|
| 1 | `trg_auto_journal_stock_movement` por **cada** movimiento `direction='in'` | «Entrada Ajuste»: débito **1405** / crédito **6105**, por renglón. `fn_auto_journal_stock_movement` solo excluye `initial`, `purchase` y `transfer`: **no excluye `purchase_order` ni `purchase_invoice`**, así que trata la compra como un ajuste y **abona al costo de ventas** | `inventory/adjusted` 6105 ↔ 1405 (84) |
| 2 | `trg_auto_journal_purchase_order` al pasar a `received` | «Recepción OC-N»: débito 1405 / crédito 2105 por `purchase_orders.total` completo | `purchase_order/received` 1405/2105 (84) · `received_cash` 1405/1105 (1) |
| 3 | `trg_auto_journal_purchase` al insertar la factura automática con `status='received'` (`purchaseOrderService.ts:857-877`) | «Compra COMP-…»: débito 1405 / crédito 2105 o 1110 | `purchase/created` (156) |
| 4 | `trg_auto_journal_ap` al insertar la cuenta por pagar (`purchaseOrderService.ts:923-933`) | «CxP - …»: la misma regla `purchase/created` otra vez | `purchase/created` |

Resultado para una compra de $ 7.905.000: el inventario (1405) se debita **tres veces** más un
abono a 6105 por renglón. Es exactamente el patrón que el bloque 1 contable cerró para ventas
(«un solo asiento por hecho económico») y que en compras sigue abierto. **Debe corregirse antes de
que alguien reciba una orden** (cambios B1–B3 de §I.9). La misma exclusión falta para
`purchase_invoice` (recepción desde factura de compra, `FacturasCompraService.ts:929`).

### I.3 Variantes: existen en datos y la recepción no las muestra

- Las variantes son filas de `products` con `parent_product_id`: **29.094 variantes y 7.469
  padres**. Los atributos viven en `products.variant_data` (`jsonb`, p. ej. `{"color":"Negro","talla":"S"}`).
- El detalle y la recepción traen el renglón con `products:product_id (id, uuid, sku, name, unit_code)`
  (`purchaseOrderService.ts:181`): **ni `variant_data` ni el padre**. Dos renglones del mismo
  producto en talla M y L se ven como dos «Guante de nitrilo» idénticos; solo el SKU los separa.
- `getProducts` sí trae `variant_data` y `parent_product_id` (`:1026`) y arma `parent_name`
  (`:1103-1125`), pero **solo alimenta el combobox de alta**; lo que se guarda en la orden es el
  `product_id` de la variante y ese contexto se pierde al volver a leerla.

### I.4 Seriales: cuatro defectos que se suman a §F.C4–C5

| # | Qué pasa | Dónde |
|---|---|---|
| S1 | **Unicidad global**: `serial_numbers_serial_key UNIQUE (serial)` sin `organization_id` ni `product_id`. Un serial ya registrado por **otra organización** impide registrarlo aquí | índice verificado por MCP |
| S2 | La validación de pantalla filtra por organización (`validateSerialExists(trimmed, organizationId)`) y responde «libre»; el `INSERT` choca con el índice global y el error muere en un `console.warn` | `SerialCaptureSection.tsx:60` · `purchaseOrderService.ts:751-753` |
| S3 | **Segunda recepción parcial de un producto con serial**: el diálogo precarga `serials_received` (`OrdenCompraDetalle.tsx:109`) y el servicio crea `item.serials.slice(0, delta)` (`purchaseOrderService.ts:738`): toma los **primeros** —ya creados— y los nuevos no se crean nunca; `serials_received` se sobrescribe (`:680`) | servicio |
| S4 | Datos: 4 productos con `track_serial`, 3 con `auto_generate_serial`, 102 seriales y **0 con `purchase_order_id`**; `products.serial_pattern` existe y ninguna pantalla de compras lo usa para «Generar» | recuento |

### I.5 Lotes: la recepción no puede capturarlos

- `products` **no tiene marca de lote** (columnas de seguimiento: `track_stock`, `track_serial`,
  `serial_pattern`, `auto_generate_serial`). No hay forma de saber qué producto exige lote.
- `lots` (3 filas, 1 con vencimiento) **no tiene `organization_id` ni índice único
  `(product_id, lot_code)`**: solo `lots_pkey`. `purchase_order_items` no tiene lote ni
  vencimiento. `stock_levels`: **0 de 44.627** filas con lote.
- `incrementOnPurchase` cablea `lot_id` nulo en la búsqueda, en el alta de existencias y en el
  movimiento (`stockMovementService.ts:405`, `:438`, `:458`). Cualquier implementación con lotes
  debe seguir el patrón `SELECT … FOR UPDATE` + `UPDATE`/`INSERT`, nunca `upsert` con
  `onConflict` (trampa del índice con `lot_id` nulo, `AUDITORIA-KARDEX-LOTES.md` §G.4).

### I.6 Factura automática: tres defectos más

| # | Qué pasa | Dónde |
|---|---|---|
| F1 | Fechas con `new Date().toISOString().split('T')[0]`, **prohibido** por la regla 1 de fechas: toma el día UTC, no el de la organización. Entre las 19:00 y las 24:00 de Colombia la factura y su deduplicación caen en el día siguiente | `purchaseOrderService.ts:812`, `:834`, `:837` |
| F2 | `invoice_purchase.currency` tiene **default `'USD'`**; el código cablea `'COP'`. Sin el cableado, la factura saldría en dólares | columna · `:866` |
| F3 | La cuenta por pagar se inserta **sin `branch_id`** (lo pone `trg_branch_default`, que no es la sucursal de la orden) y la escribe la pantalla: no hay disparador que cree la cuenta por pagar al insertar la factura, como sí existe para ventas (`create_account_receivable`) | `:923-933` · triggers de `invoice_purchase` |

### I.7 El PDF de la orden de compra no existe

`grep` sobre `src/`: ninguna ruta, servicio ni componente genera o imprime una orden de compra.
El botón «Descargar PDF» del detalle solo existía en Figma y el motor de documentos
(`DOCUMENTOS-PDF.md` §5) no tenía la variante. La orden tampoco tiene **consecutivo propio**:
«OC-129» es `purchase_orders.id`, una secuencia global de todas las organizaciones, no un número
por organización.

### I.8 Permisos, selectores y conexiones

- **Permiso de recepción**: `permissions` tiene `inventory.view/create/edit/delete/adjust/transfer`;
  **no existe uno para recibir mercancía**. Hoy recibe cualquiera que pueda abrir la orden.
- **Selectores**: el diálogo de producto y el de proveedor mostraban chips de filtro («Solo del
  proveedor», «Con stock», «Solo activos», «Empresa»…) sin `FilterButton` ni `FilterPanel` que los
  expliquen; en «Nueva», el `SupplierPicker` se dibujaba como su popover de recientes metido en el
  flujo del formulario. Resuelto en el diseño (PARIDAD §11.3).
- **Conexiones**: 9 entradas y 10 salidas inventariadas en Figma («cómo se llega y a dónde
  lleva»); hoy funcionan 2 de 19 (ficha del proveedor y GO Assistant). Rotas: proveedor → nueva
  (`?supplier=` ignorado, C7), proveedor → detalle (id numérico, C6), factura de compra → orden
  (`po_id` nulo en 56 de 56), orden → cuenta por pagar (va al listado). Inexistentes: producto,
  stock bajo mínimo, kardex, serial, lote, asiento, PDF y etiquetas.
- **GO Assistant**: `assistant_create_purchase_order(integer, integer, uuid, jsonb)` existe (no es
  `SECURITY DEFINER`) y crea borradores.

### I.9 Cambios de backend y base de datos que exige el diseño (no aplicados)

**Base de datos — aditivos** (cada uno con su `.sql` y su reversión, `POLITICA-MIGRACIONES.md`):

| # | Cambio | Para qué |
|---|---|---|
| D1 | `purchase_receipts` (uuid, `organization_id`, `branch_id` NOT NULL, `purchase_order_id`, `number` por organización, `received_at timestamptz`, `received_by uuid`, `supplier_document text`, `notes text`, `status` `posted`/`reversed`) con RLS por pertenencia **y** restrictiva `app_branch_access(branch_id)` | La recepción es un documento (REC-0053) con autor y fecha |
| D2 | `purchase_receipt_items` (`receipt_id`, `purchase_order_item_id`, `product_id`, `qty > 0`, `unit_cost`, `lot_id` nulo, `condition` `available`/`damaged`, `stock_movement_id`): una fila por renglón **y por lote** | Varios lotes por renglón; averías que no entran como disponibles |
| D3 | `serial_numbers.purchase_receipt_item_id` (nulo) | Trazar cada serial a su recepción |
| D4 | `products.track_lots boolean default false` | Saber qué producto exige lote y vencimiento |
| D5 | `lots.organization_id` (nulo, se rellena desde `products`) e índice único `(product_id, lot_code)` creado `concurrently` | Tenencia propia y no repetir lotes (KARDEX-LOTES §K.3) |
| D6 | `purchase_order_items`: `tax_rate numeric`, `tax_code text`, `discount_amount numeric default 0`, `supplier_sku text` | Impuestos y referencia del proveedor en la orden, el PDF y la factura |
| D7 | `purchase_orders`: `number integer` (consecutivo por organización), `sent_at`, `closed_at`, `cancelled_reason` | «OC-131» propio de la organización; estado `closed` alcanzable |
| D8 | Permiso `inventory.receive` en `permissions` | Recepción con permiso propio, resuelto en servidor |
| D9 | `stock_movements.created_by` y `avg_cost_after` (KARDEX-LOTES §K.3) | Autor y costo promedio tras cada entrada |

**Base de datos — cambios de comportamiento** (requieren decisión, ver dudas del informe):

| # | Cambio |
|---|---|
| B1 | `fn_auto_journal_stock_movement`: excluir `purchase_order` y `purchase_invoice`, igual que `purchase` |
| B2 | Un asiento por hecho de compra con `p_fact_key` (`purchase:receipt:{id}` o `accrual:invoice_purchase:{id}`): `fn_auto_journal_purchase_order`, `fn_auto_journal_purchase` y `fn_auto_journal_ap` dejan de duplicarse |
| B3 | Disparador `AFTER INSERT` en `invoice_purchase` que cree la cuenta por pagar (paridad con `create_account_receivable`); la aplicación deja de insertar en `accounts_payable` |
| B4 | Unicidad de seriales por `(organization_id, product_id, serial)` en lugar de global. Toca un índice de una tabla con datos (102 filas): el nuevo se crea `concurrently` y el viejo solo se retira con autorización |

**RPC** (todas `SECURITY DEFINER`, organización tomada de la sesión, `REVOKE … FROM anon`):

| # | Función | Qué hace en una sola transacción |
|---|---|---|
| R1 | `receive_purchase_order(p_order uuid, p_payload jsonb)` | Valida `inventory.receive` y `app_branch_access`; bloquea los renglones (`FOR UPDATE`); **cantidades incrementales** con guarda de sobre-recepción; cuadre de lotes; seriales únicos; decisión sobre vencidos; crea `purchase_receipts` e `items`; suma `received_quantity`; `stock_levels` por lote con `SELECT … FOR UPDATE` (sin `onConflict`); un `stock_movements` por renglón y lote con `source_id` = renglón de recepción, autor y `avg_cost_after`; crea los seriales; deriva el estado; opcionalmente crea la factura (R3). Devuelve el resumen del toast |
| R2 | `preview_purchase_receipt(p_order uuid, p_payload jsonb)` (solo lectura) | Lo que pinta `ReceiptImpact`: movimientos, costo promedio antes → después y estado resultante |
| R3 | `create_invoice_from_purchase_order(p_order uuid, p_supplier_number text, p_issue_date date, p_due_date date)` | Factura con `po_id`, `number_ext` = número real del proveedor, moneda de la organización, impuestos por renglón y fechas con `fn_today_for_org`; la cuenta por pagar la crea B3 |
| R4 | `next_purchase_order_number(p_org integer)` | Consecutivo por organización para D7, sin carrera |

**Aplicación**:

- `purchaseOrderService`: `receiveItems`, `receiveItemsWithSerials` y `receiveAllPending` pasan a
  llamar a R1 (desaparecen las ≈4+5N consultas); el embed de renglones trae `variant_data`,
  `parent_product_id`, `track_serial`, `track_lots` y el nombre del padre (C4, C5, §I.3);
  `getProducts` mapea `track_serial`; `.single()` → `.maybeSingle()`; fuera
  `toISOString().split('T')[0]`.
- `NuevaOrdenCompraForm`: lee `?supplier=` y `?product=`; `SupplierPicker Layout=field`;
  `ProductPicker Mode=purchase` con `FilterButton`, `FilterPanel` y `FilterChips`.
- Enlaces: `ProveedorDetalle.tsx:392` por uuid (C6); `DetalleFacturaCompra` muestra «OC-N» por
  `po_id`; `OrdenCompraDetalle` enlaza la cuenta por pagar por id; kardex, serial y lote enlazan
  a la orden a través de la recepción.
- PDF: variante «orden de compra» del motor único (`DOCUMENTOS-PDF.md` §10) y ruta
  `GET /api/inventario/ordenes-compra/[uuid]/pdf` que empieza por `getServerOrgContext()`.
