# Auditoría y propuesta de estructura — tesorería y contabilidad

Insumo para **reestructurar** ingresos, egresos, bancos, conciliaciones, transferencias y
contabilidad, y para que encajen con el POS, con las cajas y entre sí. El dueño lo planteó así:
«ingresos, egresos, bancos, conciliaciones y transferencias no están bien estructurados; ayúdame a
estructurarlos para que coincidan con contabilidad y con los demás módulos, por ejemplo con el POS
y con cajas, porque hay cajas por cajero y cajas por sucursal».

Este encargo es **de análisis y arquitectura**. El diseño en Figma viene después y solo de lo que
el análisis justifique; ver §Q al final.

Fecha: 2026-09-22. Código leído en `C:\Users\USUARIO\CascadeProjects\go-admin-erp`; rutas relativas
a `src/` salvo que se indique. **Todo lo que dice «verificado» se comprobó con el MCP de Supabase
sobre el proyecto `jgmgphmzusbluqhuqihj` en modo solo lectura** (`information_schema`, `pg_proc`,
`pg_trigger`, `pg_policies`, `pg_indexes`, `pg_constraint` y `SELECT` de conteo sobre tablas de
negocio). No se escribió una sola fila. Sin nombres de organizaciones cliente: las cifras se
conservan, la identidad no.

Leyenda de **Tipo** (igual que `AUDITORIA-CONTROLES-PRODUCTOS-POS.md`): botón · menú · pestaña ·
campo · toggle · chip · badge · tabla · diálogo · tooltip · atajo · estado · texto · stat · paginación ·
toast · cálculo (regla sin control visible) · **trigger** (efecto de base de datos sin control
visible) · **RPC**.

Leyenda de **severidad**: 🔴 crítico (el número contable o el saldo está mal en producción) ·
🟠 alto (se pierde información o el aislamiento entre inquilinos depende de un solo mecanismo) ·
🟡 medio (funcionalidad rota o muerta, sin daño contable) · ⚪ observación.

---

## Qué NO se repite aquí

`docs/design/AUDITORIA-CONTROLES-FINANZAS.md` (3.554 líneas) ya inventaría **control por control**
las 64 rutas de Finanzas. Este documento **no repite esa lista**: cita sus secciones. En concreto:

| Lo que ya está escrito | Dónde |
|---|---|
| Controles de ingresos, egresos, transferencias, métodos de pago, QR, saldos a favor, comisiones | `AUDITORIA-CONTROLES-FINANZAS.md` §C.6–C.15 |
| Controles de bancos, cuentas, movimientos, tesorería, anomalías, conciliación, Open Finance, PayFac | §D.1–D.13 |
| Controles de contabilidad, asientos, plan de cuentas, los 4 informes, periodos, reglas, centro de costos, activos fijos, presupuestos | §E.1–E.15 |
| Controles de impuestos, monedas, informes | §F.1–F.3 |
| Esquema tabla por tabla, columnas y trampas | §I.1–I.5 |
| Lista de triggers sobre `payments` e `invoice_sales` | §I.6 |
| Lo roto: saldos que no cuadran, botones muertos, rutas huérfanas | §H.1–H.9 |
| Documentos soporte, facturación electrónica, mapeo DIAN de impuestos | `AUDITORIA-DOCUMENTOS-PDF-IMPRESION.md` §D.2, §E.6 |
| **Cajas del POS: controles, tablas, `cashMode`, cierre ciego, permisos, alcance multi-sucursal, modo sin conexión** | `AUDITORIA-CONTROLES-PERFIL-CAJAS.md` §B.1–B.14 |

**Lo que aporta este documento y no existía:**

1. La **matriz de trazabilidad contable completa**: qué origina cada hecho económico, qué tabla lo
   registra, qué asiento genera, contra qué cuentas y quién lo dispara (§D).
2. La **evidencia cuantitativa en producción** de la duplicación de ingresos y del IVA al revés (§E).
3. La **cadena caja del POS → tesorería → contabilidad** (§F). `AUDITORIA-CONTROLES-PERFIL-CAJAS.md`
   §B ya describe la caja **por dentro** —controles, tablas, `cashMode`, cierre ciego, permisos— y
   ya señala que `payments` no tiene `cash_session_id`. Lo que falta, y es lo que se añade aquí, es
   **la caja vista desde la contabilidad y desde tesorería**: qué asiento genera (y cuál no), la
   evidencia en producción de las cajas simultáneas y de los arqueos que no se guardan, quién
   escribe en la caja desde fuera del POS, y el eslabón que falta entre la caja y el banco.
4. Por cada pantalla, **qué tablas lee y escribe, qué RPC llama, qué triggers dispara y qué RLS la
   gobierna** (§H a §K).
5. La **propuesta de estructura** (Parte 2, §O a §S).

Correcciones a lo ya escrito: `AUDITORIA-CONTROLES-FINANZAS.md` §I.7 afirma que ninguna tabla del
módulo tiene política abierta a `anon`. **Verificado: sí las hay** — `payment_methods` tiene
`Allow anon select payment_methods` con `qual = true` para el rol `public`, y `organization_taxes`
tiene `temp_allow_all_taxes` **PERMISSIVE / ALL / public / `qual = true`**, que al combinarse con OR
anula sus otras tres políticas. Ver §M.

---

## Decisiones (delegadas por el dueño, 2026-09-22)

El dueño delegó las tres decisiones abiertas de la primera versión de este documento. Quedan
cerradas así, y **el resto del documento está escrito sobre ellas**: no se reabren.

### Decisión 1 — El asiento se ancla al PAGO

La regla, en tres líneas, es la norma del sistema a partir de ahora:

1. **La venta o la factura genera el asiento de DEVENGO**: ingreso + IVA por pagar + cuenta por
   cobrar; y aparte, el costo con su salida de inventario. **Un solo asiento por documento, nunca
   dos por el mismo hecho.**
2. **El pago genera el asiento de COBRO**: entra dinero en la cuenta donde realmente entró —la caja
   de esa sesión o la cuenta bancaria concreta— y baja la cuenta por cobrar. **Aquí no se toca
   ingresos.**
3. **La cuenta contable del dinero sale del sitio donde está el dinero**, no de una regla genérica.

Consecuencia obligada: hay que **retirar uno de los dos caminos que hoy contabilizan lo mismo**, y
**la idempotencia deja de depender del `source`** y pasa a apoyarse en la clave natural del hecho.
Se detalla en §P.3; las migraciones, en §S bloque 1.

### Decisión 2 — Corte por fecha con saldo de apertura, no saneamiento uno a uno

No se van a revertir los 2.319 asientos duplicados con contrasientos: son semanas de trabajo y cada
contrasiento es otra ocasión de equivocarse. Además, el comparativo con el año anterior está
construido sobre números falsos, así que conservarlo no aporta.

En su lugar: fecha de corte, saldo real por cuenta calculado **desde los documentos, no desde el
libro**, un **asiento de apertura** por organización, y todo lo anterior marcado como **periodo
histórico no conciliado** —visible, pero excluido de los informes por defecto y con aviso en
pantalla—. Procedimiento completo en §R.

**Este documento no ejecuta nada de eso.** La migración de datos la aplicará el coordinador cuando
el dueño fije la fecha de corte.

### Decisión 3 — Las cajas abiertas simultáneas son un error, no un caso de uso

Verificado (§F.4): las tres sesiones abiertas de la misma sucursal son de **tres cajeros
distintos**, llevan entre 239 y 488 horas abiertas y **ninguna tiene arqueo**. No son turnos
solapados: son cierres que nunca se hicieron. En consecuencia el diseño **impide** el solapamiento
en vez de tolerarlo:

- índice único parcial que prohíbe dos sesiones abiertas del mismo cajero, y en modo `branch`, dos
  abiertas en la misma sucursal;
- **cierre asistido o forzado** de sesiones abandonadas, con aviso a partir de N horas, arqueo
  obligatorio y registro de quién lo forzó;
- **`payments.cash_session_id`**, para que un pago pertenezca a una caja de verdad y no se deduzca
  por rango de fechas;
- y una pantalla de **«Cajas abandonadas»** para que un administrador las cierre (§P.5).

---

## Índice

**Parte 1 — Análisis**
· A. El resumen en una página
· B. El mapa real del dinero: siete puertas, ninguna tabla común
· C. El único motor de asientos: `fn_create_journal_entry`
· D. Matriz de trazabilidad contable (el eje del documento)
· E. Lo que no se contabiliza, lo que se contabiliza dos veces y el IVA
· F. Cajas del POS: `cashMode`, arqueos y la frontera con tesorería
· G. Bancos: el saldo que nunca se mueve
· H. Bloque A — ingresos, egresos, transferencias, métodos de pago, monedas
· I. Bloque B — bancos, conciliación, Open Finance, PayFac
· J. Bloque C — contabilidad
· K. Bloque D — fiscal e integraciones
· M. Seguridad, multi-tenant y RLS
· N. Lo muerto y lo decorativo

**Parte 2 — Propuesta de estructura**
· O. Un solo modelo de movimiento de dinero
· P. La cadena caja → banco → contabilidad (incluye el anclaje al pago y las cajas abandonadas)
· Q. Conciliación que cuadre con movimientos y asientos
· R. Corte de saldos y periodo histórico
· S. Migraciones propuestas, una por línea
· T. Prioridades por riesgo contable

**Parte 3**
· U. Diseño: qué queda para la siguiente tanda
· V. Qué quedó fuera de este documento

---

# PARTE 1 — ANÁLISIS

## A. El resumen en una página

El diagnóstico del dueño es correcto, y el problema de fondo es más simple de enunciar de lo que
parece:

> **No existe un concepto de «movimiento de dinero» en el sistema.** Hay siete tablas que registran
> movimientos de dinero, ninguna sabe de las otras, y la contabilidad las escucha a todas a la vez
> mediante 44 triggers independientes que no se coordinan entre sí.

De ahí salen, en cascada, los ocho hallazgos que importan:

| # | Hallazgo | Sev. | Evidencia |
|---|---|---|---|
| 1 | **Una venta del POS genera hasta cuatro asientos por el mismo hecho.** De 2.394 ventas POS con asiento, **2.319 (96,9 %) tienen además el asiento de su factura**, y ambos acreditan la cuenta de ingresos por el mismo importe. 1.980 tienen además el asiento del pago | 🔴 | §E.2, verificado |
| 2 | **El ingreso del libro es 2,07× las ventas reales.** Créditos netos a cuentas `4x`: **791.571.971**. Suma de `sales.total`: **381.589.285**. Solo los asientos duplicados de factura añaden **89.403.570** de ingreso inexistente y **86.347.634** de activo inexistente | 🔴 | §E.2, verificado |
| 3 | **El IVA de las ventas se contabiliza al revés.** De las líneas sobre `2405` en asientos de venta, **382 van al débito y 3 al crédito**. Un IVA generado debe acreditar el pasivo; aquí lo reduce | 🔴 | §E.4, verificado |
| 4 | **Los saldos bancarios nunca se mueven.** Las 3 cuentas bancarias existentes tienen `balance` **exactamente igual** a `initial_balance`. La RPC `update_bank_balance` **no existe** (verificado en `pg_proc`) y el camino alternativo construye el `update` sin `await` | 🔴 | §G.1, verificado |
| 5 | **El asiento de una transferencia entre bancos es nulo por construcción**: `fn_auto_journal_bank_transfer` pasa `v_rule.debit_account_code` **tanto al débito como al crédito**. Dos líneas sobre la misma cuenta que se anulan | 🔴 | §D.11, verificado |
| 6 | **`payments` no tiene `cash_session_id`** (verificado: 17 columnas, ninguna). La pertenencia de un pago a una caja se deduce por `created_at` entre apertura y cierre + sucursal + cajero. Y **no hay índice único que impida dos cajas abiertas a la vez**: hoy hay **15 sesiones abiertas, y una sucursal con 3 simultáneas** | 🔴 | §F.3–F.4, verificado |
| 7 | **El cierre de caja solo contabiliza el descuadre**, no el efectivo. 81 sesiones cerradas, 22 con diferencia, 22 asientos `source='cash_sessions'`. Y **`cash_counts` tiene 0 filas**: el arqueo por denominación no se guarda nunca | 🟠 | §F.5, verificado |
| 8 | **`payment_methods` es un catálogo global sin `organization_id`.** El código `wompi` (`is_system = false`) lo comparten **61 organizaciones**, y la política RLS de borrado permite que cualquiera de ellas elimine la fila global | 🔴 | §M.2, verificado |

Y dos de contexto que condicionan cualquier rediseño:

- **Toda la tesorería se escribe desde el navegador con la clave anónima.** Ni un solo
  `getServerUserClient()` ni `getServiceClient()` en los bloques A, B y C. El `organization_id` de
  cada `insert` sale de `localStorage`. El aislamiento entre inquilinos depende al 100 % de RLS.
  Esto contradice la regla 5 de `CLAUDE.md`.
- **Nadie ha cerrado nunca un periodo contable.** 1.090 filas en `fiscal_periods`, **todas con
  `status = 'open'`**. Y `fn_is_period_open` devuelve `true` cuando no encuentra periodo, y solo
  mira `period_type = 'monthly'`.

---

## B. El mapa real del dinero: siete puertas, ninguna tabla común

### B.1 No existe una tabla de movimientos de tesorería

Verificado con `information_schema.tables`: **no existen** `expenses`, `incomes`,
`treasury_movements`, `cash_flow` ni equivalente. Las pantallas «Ingresos» y «Egresos» no tienen
tabla propia: son una **vista fusionada en el navegador** de `cash_movements` y `bank_transactions`
(`lib/services/movimientosService.ts:543-572`, une los dos `select` y ordena en JS).

Las siete puertas por las que el dinero entra o sale, y dónde acaba cada una:

| # | Puerta | Tabla que lo registra | Columnas de dinero | Moneda | ¿Sucursal? | ¿Sesión de caja? |
|---|---|---|---|---|---|---|
| 1 | Cobro de una venta, factura, abono o pedido web | `payments` | `amount`, `discount_amount`, `change_amount` | `currency` bpchar NN | `branch_id` NULL-able | **no existe la columna** |
| 2 | Entrada/salida manual de caja (POS y Finanzas) | `cash_movements` | `amount` (siempre positivo; el sentido va en `type` `in`/`out`) | — | `branch_id` NULL-able | `cash_session_id` NN |
| 3 | Movimiento bancario manual o importado | `bank_transactions` | `amount` (negativo = salida) | — | `branch_id` NULL-able | — |
| 4 | Transferencia entre cuentas propias | `bank_transfers` | `amount` | — | `branch_id` NULL-able | — |
| 5 | Descuadre de un cierre de caja | `cash_sessions.difference` | `initial_amount`, `final_amount`, `difference` | — | `branch_id` NULL-able | es la sesión |
| 6 | Dispersión del procesador de pagos hacia la organización | `organization_payouts` + `payout_items` | `total_amount`, `commission_amount`, `net_amount` | `currency` | — | — |
| 7 | Reembolso de una devolución del POS | `returns` **+** `cash_movements` **+** `payments` (con importe negativo) | tres veces el mismo importe | — | — | indirecta |

**Las siete son islas.** No hay clave foránea entre ellas, ni un identificador común, ni un estado
compartido. Consecuencias directas y verificadas:

- Una transferencia bancaria **no aparece** en Ingresos ni en Egresos (son `cash_movements` +
  `bank_transactions`, y la transferencia vive en `bank_transfers`), ni en conciliación bancaria
  (que lee `bank_transactions`). Es invisible desde las tres pantallas que deberían verla.
- Un cobro del POS **no aparece** en Ingresos: `payments` no se consulta en esas pantallas.
- Un reembolso del POS se resta **tres veces** del esperado del arqueo: por su `cash_movements`
  (`type='out'`), por su `payments` con `amount` negativo —que el resumen no filtra por `source`— y
  por la fila de `returns` (`components/pos/cajas/CajasService.ts:811`;
  `lib/services/devolucionesService.ts:590, 637-659, 681-703, 713-731`). 🔴

### B.2 El signo del importe es incoherente entre tablas

Esto es la causa raíz de dos asientos invertidos y de varios KPI inflados:

| Tabla | Cómo se expresa una salida | Quién lo escribe | Quién lo lee mal |
|---|---|---|---|
| `cash_movements` | `type = 'out'`, **`amount` positivo** (CHECK `type IN ('in','out')`; verificado: 0 filas con importe negativo) | `movimientosService.ts:285`, `CajasService.ts:638` | `fn_auto_journal_cash_movement` decide el sentido con `CASE WHEN NEW.amount > 0`, que **siempre es cierto**, e **ignora `NEW.type`** 🔴 |
| `bank_transactions` | `amount` **negativo** + `transaction_type = 'withdrawal'` | `movimientosService.ts:326` | `anomalyDetectionService.ts:526` suma `amount` a pelo; `BancosService.ts:319-321` **resta** cuando es débito. Los dos caminos de saldo son incompatibles |
| `payments` (reembolso) | `amount` **negativo**, `source = 'sale'` | `devolucionesService.ts:713-731` | `CajasService.getCashSummary:727-740` no filtra por `source`: el negativo entra en `salesCash` |

---

## C. El único motor de asientos: `fn_create_journal_entry`

Toda la contabilidad automática pasa por una sola función. Verificada en `pg_proc`:

```
fn_create_journal_entry(p_organization_id int, p_branch_id int, p_entry_date timestamptz,
  p_memo text, p_source text, p_source_id text, p_debit_account text, p_credit_account text,
  p_amount numeric, p_tax_account text = NULL, p_tax_amount numeric = 0,
  p_created_by uuid = NULL, p_tax_is_credit boolean = false) RETURNS integer
  SECURITY DEFINER
```

Y su hermana `fn_create_journal_entry_with_discount(...)`, que añade una línea de descuento.

**Lo que hace bien.** Valida que el importe sea `> 0`, que las dos cuentas existan en
`chart_of_accounts` de esa organización, que la cuenta de impuesto exista, que el periodo esté
abierto, y corrige `branch_id` cuando es nulo, cero o de otra organización (cae a la sucursal
principal). Inserta la cabecera con `posted = true` y dos o tres líneas.

**Lo que hace mal, y es estructural:**

| # | Hallazgo | Sev. |
|---|---|---|
| C-1 | **Fracasa en silencio.** Los seis motivos de rechazo hacen `RAISE NOTICE` y `RETURN NULL`. Los 44 triggers **ignoran el valor devuelto** y hacen `RETURN NEW`. El dinero se guarda, la interfaz dice «registrado correctamente», y **no hay asiento**. Un `NOTICE` de Postgres no llega al cliente de PostgREST | 🔴 |
| C-2 | **Solo sabe hacer asientos de dos o tres líneas.** Verificado: el máximo de líneas por asiento en toda la base es **3**, el promedio **2,03**, y hay **0 asientos con más de 3 líneas**. Una venta con dos impuestos distintos, o un cobro con retención, **no se puede representar** | 🔴 |
| C-3 | **No valida que débito ≠ crédito.** Por eso el asiento de transferencia (§D.11) se crea con la misma cuenta a los dos lados | 🔴 |
| C-4 | **No rellena `debit_base` / `credit_base` ni `currency_code`.** Verificado: **27.409 líneas con `currency_code` NULL**, sobre 27.409 totales. Los informes que leen las columnas base (`lib/services/reportes/modulos/finanzasReports.ts:539-544`) dan **cero** para todo lo automático | 🟠 |
| C-5 | **No rellena `cost_center_id`.** Verificado: **0 líneas** de `journal_lines` con centro de costo, sobre 27.409 | 🟡 |
| C-6 | **No rellena `created_by`** salvo en la variante con descuento | 🟡 |

**El alta manual de asientos no usa esta función.** `components/finanzas/contabilidad/
ContabilidadService.ts:288-336` hace dos `insert` sucesivos desde el navegador —cabecera y luego
líneas— sin transacción y sin comprobar periodo ni cuentas. Si el segundo falla (por ejemplo por el
CHECK `check_debit_credit`, que prohíbe débito y crédito en la misma línea), **queda la cabecera
huérfana**. Verificado: hay **1 asiento sin líneas** en producción. Y como `fn_is_period_open` solo
corre dentro de la RPC, **el asiento manual se puede grabar en un periodo cerrado**, justo lo
contrario de lo que promete el diálogo de cierre
(`contabilidad/periodos-fiscales/PeriodosFiscalesPage.tsx:275-276`). 🔴

**Cuadre.** Verificado que **0 asientos están descuadrados** (suma de débitos ≠ suma de créditos).
Eso no es mérito de una validación: es consecuencia de que la función solo sabe hacer asientos
simétricos. El cuadre no garantiza que el asiento sea correcto —los duplicados de §E.2 cuadran
perfectamente y son falsos—.

---

## D. Matriz de trazabilidad contable

**Esta es la sección que el encargo pide como eje.** Cada fila es un hecho económico: qué lo
origina, qué tabla lo registra, qué asiento genera, contra qué cuentas y quién lo dispara.

Verificado en `pg_trigger`: hay **44 triggers `trg_auto_journal_*`** sobre 41 tablas, de los cuales
**2 están desactivados** (`tgenabled = 'D'`): `trg_auto_journal_ar` sobre `accounts_receivable` y
`trg_auto_journal_ap_installment` sobre `ap_installments`. Los 42 activos leen `accounting_rules`
para decidir las cuentas.

### D.1 Los hechos del núcleo (venta, cobro, caja, banco)

| Hecho | Origen (código) | Tabla | Asiento | `source` | Cuentas (semilla) | Quién lo dispara |
|---|---|---|---|---|---|---|
| **Venta del POS** | `posService.checkout` → RPC `pos_checkout_v1` (`supabase/migrations/20260921100000_pos_checkout_v1_rpc_atomica.sql:261`) | `sales` | **sí** | `sales` | `1105` o `1305` D · `2405` IVA · `4105` C | trigger `trg_auto_journal_sale_pos` → `fn_auto_journal_sale_pos` |
| **Costo de la venta** | mismo checkout, `sale_items` | `sale_items` | **sí** | (COGS) | `6135` D · `1435` C | trigger `trg_auto_journal_sale_item_cogs` |
| **Factura de la venta** | mismo checkout (`:424`) | `invoice_sales` | **sí, un SEGUNDO asiento del mismo importe** 🔴 | `invoice_sales` | las mismas cuentas, misma regla `source_type='sale'` | trigger `trg_auto_journal_sale` → `fn_auto_journal_sale` |
| **Cuenta por cobrar** | trigger sobre la factura | `accounts_receivable` | **no** (trigger `trg_auto_journal_ar` **desactivado**) | — | — | `tr_create_account_receivable` crea la cartera; el asiento está apagado a propósito, era un cuarto duplicado |
| **Cobro del cliente** | mismo checkout (`:457`) o `RegistrarPagoDialog` | `payments` | **sí, un TERCER asiento** 🔴 | `payments` | `1110` D · `1305` C | trigger `trg_auto_journal_payment` → `fn_create_journal_entry_with_discount` |
| **Entrada manual de caja** | `movimientosService.createCashMovement:277-290` o `CajasService.addMovement:605-653` | `cash_movements` | **sí** | `cash_movements` | regla `cash_movement/created` | trigger `trg_auto_journal_cash_movement` |
| **Salida manual de caja** | igual | `cash_movements` | **sí, pero INVERTIDO** 🔴 | `cash_movements` | las de una entrada | mismo trigger: decide por `amount > 0`, que siempre es cierto, e ignora `type` |
| **Cierre de caja** | `CajasService.closeSession:541-600` | `cash_sessions` | **solo si `difference ≠ 0`** | `cash_sessions` | regla `cash_movement` (sin `event_type`), invertida si el descuadre es negativo | trigger `trg_auto_journal_cash_session` |
| **Arqueo por denominación** | `arqueos/NuevoArqueoPage.tsx:146-169` | `cash_counts` | **no** | — | — | nadie. Verificado: **0 filas** en la tabla |
| **Movimiento bancario** | `BancosService.createBankTransaction:275-290` o importación Open Finance | `bank_transactions` | **sí** | `bank_transactions` | regla `bank/adjusted`, invertida si `amount < 0` | trigger `trg_auto_journal_bank` |
| **Transferencia entre cuentas** | `transferenciasService.createTransfer:149-179` | `bank_transfers` | **sí, pero NULO** 🔴 | `bank_transfers` | **la misma cuenta a débito y a crédito** | trigger `trg_auto_journal_bank_transfer` |
| **Anulación de transferencia** | `transferenciasService.cancelTransfer:239-276` | `bank_transfers` (`status='cancelled'`) | **no** | — | — | el trigger corta con `status NOT IN ('completed','confirmed')` |
| **Conciliación de un movimiento** | `BancosService.matchTransaccion:501-521` | `bank_reconciliation_items` + `bank_transactions.status='matched'` | **no** | — | — | nadie. Cerrar una conciliación tampoco genera asiento |
| **Depreciación de un activo** | — | `asset_depreciations` (con FK a `journal_entries`) | **no** | — | — | **nadie**. Verificado: 0 filas, 0 triggers sobre `fixed_assets`. Solo existe `FixedAssetService.calculateMonthlyDepreciation:110-115`, función pura que pinta una celda |
| **Documento soporte DIAN** | `SupportDocumentForm:307` | `support_documents` | **no** | — | — | **nadie**. Verificado: 0 triggers sobre la tabla 🟠 |
| **Dispersión del procesador** | `payoutService.create` | `organization_payouts` + `payout_items` | **no** | — | — | nadie |
| **Reembolso del POS** | `devolucionesService.procesarDevolucion:590` | `returns` (`status='processed'`) | **no** | — | — | `fn_auto_journal_refund` exige `status IN ('confirmed','completed','approved')` 🔴 |

### D.2 Distribución real de asientos por origen (verificado)

13.511 asientos en producción, 20 organizaciones con contabilidad, 12 con más de 100 asientos:

| `source` | Asientos | Orgs |
|---|---|---|
| `stock_movements` | 3.630 | 15 |
| `invoice_sales` | 3.298 | 19 |
| `sales` | 2.394 | 16 |
| `payments` | 2.140 | 17 |
| `accounts_receivable` | 1.462 | 14 |
| `commissions` | 230 | 4 |
| `cash_movements` | 109 | 5 |
| `inventory_adjustment` | 80 | 6 |
| `accounts_payable` | 52 | 7 |
| `invoice_purchase` | 45 | 7 |
| `cash_sessions` | 22 | 4 |
| `folio_items` | 22 | 2 |
| `tips` | 9 | 4 |
| `purchase_orders` | 7 | 1 |
| `reservation`, `trip_tickets` | 3 c/u | 1 |
| `bank_transactions` | **2** | 1 |
| `folio_payment`, `parking_passes`, `sale` | 1 c/u | 1 |

Léase: **`invoice_sales` + `sales` + `payments` + `accounts_receivable` = 9.294 asientos para lo que
son, como mucho, 2.394 ventas.** Y `bank_transactions` tiene **2** asientos en toda la base: el
módulo de bancos no está en uso real.

### D.3 Asientos huérfanos (verificado)

**235 asientos cuya fila de origen ya no existe**: 104 de `cash_movements` (sobre 5 filas vivas),
62 de `invoice_sales`, 36 de `sales`, 33 de `payments`. Al borrarse el origen, el asiento se queda.
No hay `ON DELETE` ni contrasiento. Contabilidad sin soporte documental. 🟠

### D.4 El índice que impone la idempotencia

Verificado: `idx_journal_entries_unique_source` es `UNIQUE (source, source_id) WHERE source IS NOT
NULL AND source_id IS NOT NULL`, **sin `organization_id`**. Es lo único que evita que un mismo
origen genere dos asientos —por eso el máximo de asientos por venta desde `source='sales'` es 1—.
Pero es un índice **cross-tenant**: si dos organizaciones llegaran a compartir un par
`(source, source_id)`, la segunda perdería su asiento en silencio. Hoy no ocurre porque los ids son
secuencias globales o UUID, pero es un cerrojo compartido entre inquilinos. ⚪

---

## E. Lo que no se contabiliza, lo que se contabiliza dos veces y el IVA

### E.1 Hechos económicos que NO generan asiento

| Hecho | Por qué | Sev. |
|---|---|---|
| Arqueo de caja (`cash_counts`) | ninguna función lo lee | 🟡 |
| Conciliación bancaria | el esquema tiene `bank_reconciliation_items.matched_journal_line_id` y `match_type='journal'`, pero **ninguna interfaz puede producir un match de tipo `journal`**: el manual manda `'manual'` (`ConciliacionDetailPage.tsx:82`) y la IA manda `'payment'` (`AIMatchingPanel.tsx:115`) | 🟠 |
| Depreciación | no está implementada; `asset_depreciations` vacía | 🟠 |
| Documento soporte DIAN | sin triggers, sin cuenta por pagar, sin `payments`. **Un gasto declarado ante la autoridad fiscal que en el libro no existe** | 🟠 |
| Reembolso del POS | `returns.status = 'processed'` no está en la lista que espera `fn_auto_journal_refund` | 🔴 |
| Pago con `source = 'sale'` | `fn_auto_journal_payment` solo trata `invoice_sales`, `account_receivable`, `invoice_purchase`, `account_payable`; el resto devuelve `NEW` sin más. Verificado: **64 pagos con `source='sale'`** | 🟠 |
| Pago de pedido web (`source = 'web_order'`) | mismo motivo. Verificado: **762 pagos**. El asiento del pedido web lo hace `fn_auto_journal_web_order` sobre `web_orders`, no el pago | 🟠 |
| Dispersiones y comisiones del procesador | ninguna referencia a `journal*` en `api/integrations/payfac/**` | 🟡 |
| Aplicación de un saldo a favor | no pasa por `payments` (ya documentado en `AUDITORIA-CONTROLES-FINANZAS.md` §H.1 #4) | 🟠 |

### E.2 El hecho que se contabiliza dos y tres veces 🔴

**Mecanismo.** Dos funciones distintas leen **la misma familia de reglas** (`accounting_rules` con
`source_type = 'sale'`) y contabilizan **el mismo importe** (`NEW.total`), pero con `source`
distinto, así que la idempotencia de `idx_journal_entries_unique_source` **no las ve**:

- `fn_auto_journal_sale_pos` sobre `sales` → `source = 'sales'`
- `fn_auto_journal_sale` sobre `invoice_sales` → `source = 'invoice_sales'`

Y el POS **siempre** crea factura (`pos_checkout_v1` línea 424). Así que toda venta del POS produce
los dos. Encima, el cobro produce el tercero.

**Evidencia en producción (verificada):**

| Medida | Valor |
|---|---|
| Ventas POS con asiento `source='sales'` | 2.394 |
| …que **además** tienen el asiento de su factura | **2.319 (96,9 %)** |
| …que además tienen el asiento de su pago | **1.980 (82,7 %)** |
| Ingreso `4x` duplicado solo por los asientos de factura de esos 2.319 pares | **89.403.570** |
| Ingreso `4x` de los asientos de venta POS de esos mismos pares | 89.080.315 |
| Activo `1x` duplicado por esos asientos de factura | **86.347.634** |
| Créditos netos a `4x` en toda la base | **791.571.971** |
| Suma de `sales.total` (bruto, con impuesto) | **381.589.285** |

**Ejemplo real, una venta de 71.400 (misma venta, tres asientos):**

| Asiento | `source` | Memo | Cuenta | Débito | Crédito |
|---|---|---|---|---|---|
| 211 | `sales` | «Venta POS …» | `1305` Clientes | 60.000 | |
| 211 | | | `2405` Impuestos por pagar | **11.400** | |
| 211 | | | `4105` Ventas de mercancías | | **71.400** |
| 6438 | `invoice_sales` | «BACKFILL-… factura FACT-0070» | `1105` Caja | 71.400 | |
| 6438 | | | `4105` Ventas de mercancías | | **71.400** |
| 59 | `payments` | «Cobro recibido - Ref: …» | `1110` Bancos | 71.400 | |
| 59 | | | `1305` Clientes | | 71.400 |

Tres defectos en siete líneas: la cuenta de ingresos recibe **142.800 por una venta de 60.000**; el
IVA está **al débito**; y los 71.400 entran una vez en `1105` Caja y otra en `1110` Bancos.

**Agravante — la carga retroactiva.** Verificado: hay **162 asientos con memo `BACKFILL…`**,
generados por las funciones `fn_retro_journal_sales`, `_invoices`, `_payments`, `_purchases`, `_ar`
y `_ap`. Es decir, ya se hizo al menos una pasada de contabilización retroactiva **sobre datos que
los triggers ya habían contabilizado**.

**Segundo agravante — el agente de IA.** `supabase/functions/ai-accounting-agent/index.ts:85-138`
escribe asientos con `source: "sale"` y `"purchase"`, mientras los triggers usan `'invoice_sales'` y
`'invoice_purchase'`. Su comprobación de idempotencia busca `source='sale'` y por tanto **no ve los
asientos de los triggers**. Además inserta con `branch_id: 0`, saltándose `fn_create_journal_entry`
y su validación. Verificado: existe 1 asiento con `source='sale'` en producción. 🔴

### E.3 Cuándo el asiento de la venta POS desaparece

`fn_auto_journal_sale_pos` exige, en sus tres consultas —la principal y los dos respaldos—, que la
regla cumpla `(conditions->>'is_credit')::boolean = v_is_credit`. Si `conditions` es NULL, la
expresión es NULL y la fila no entra. Verificado: de 250 reglas `source_type='sale'`, **164 tienen
`conditions.is_credit` y 86 no**, y **2 organizaciones no tienen ninguna regla de venta con esa
condición**. Para esas dos, el asiento de la venta POS **no se crea nunca** —mientras que el de la
factura sí, porque `fn_auto_journal_sale` tiene un respaldo sin condiciones—. 🟠

### E.4 El IVA: una sola cuenta, del lado equivocado

Se confirma lo que el encargo daba por sabido, y se añade precisión:

1. **La cuenta del impuesto sale solo de `accounting_rules.tax_account_code`.** Verificado:
   `organization_taxes` tiene 11 columnas y **ninguna contable** —no hay `account_code`, ni tipo
   generado/descontable, ni naturaleza—. La pantalla de Impuestos no ofrece ningún control contable.
2. **Es una cuenta por regla, no por impuesto.** Con IVA 19 % e INC 8 % en la misma factura, los dos
   van a la misma cuenta. La única interfaz que la configura es el campo «Cuenta IVA (opcional)» de
   `reglas-contables/ReglasContablesPage.tsx:434-451`.
3. **`2405` domina.** Verificado sobre 3.553 reglas: `tax_account_code = '2405'` en **456**, `'2102'`
   en 55, `'135517'` en 1, `'240805'` en 1, y **NULL en 3.041**. La semilla
   `fn_create_default_accounting_rules` pone `2405` en venta a crédito, venta de contado, compra a
   crédito, compra de contado, devolución, anulación y recepción de orden de compra. **IVA generado
   e IVA descontable caen en la misma cuenta**: su saldo es una diferencia neta, no conciliable
   contra la declaración bimestral. No existe `2408` ni retenciones `2365/2367/2368` en ningún sitio.
4. **`tax_account_mapping` está muerta y confirmada como tal.** Verificado: la tabla tiene **288
   filas** —alguien la pobló—, UNIQUE por `(organization_id, organization_tax_id)` y por
   `(organization_id, tax_template_id)`, 2 índices, 4 políticas RLS… y **la única función de toda la
   base que la menciona es su propio trigger de `updated_at`**. Cero lecturas en `src/`, cero en
   `supabase/functions/`. El mapeo contable por impuesto está diseñado, migrado, poblado y
   desconectado. 🟠
5. **El IVA de las ventas está al revés en producción.** Verificado: sobre `2405`, hay **386 líneas
   al débito y 6 al crédito**; de esas 386, **382 están en asientos con `source IN ('sales',
   'invoice_sales')`**. Y **5.307 asientos de venta tienen solo 2 líneas**, es decir sin línea de
   impuesto ninguna: todo el bruto se acredita a la cuenta de ingresos. 🔴
   La corrección de raíz ya existe —`fn_create_journal_entry` acepta `p_tax_is_credit` y las dos
   funciones de venta le pasan `true`—, pero los datos históricos están escritos con la versión
   anterior y nadie los ha rehecho.

### E.5 Periodos contables: el cerrojo que no cierra

| Hallazgo | Evidencia | Sev. |
|---|---|---|
| **Nadie ha cerrado nunca un periodo.** 1.008 periodos `monthly` + 82 `yearly`, **los 1.090 en `status='open'`**, en 84 organizaciones | verificado | 🟠 |
| `fn_is_period_open` **devuelve `true` si no encuentra periodo** y solo mira `period_type='monthly'`. Cerrar un `yearly` no impide nada | verificado en `pg_proc` | 🟠 |
| El asiento **manual** esquiva la validación por completo: no pasa por la RPC | `ContabilidadService.ts:288-336` | 🔴 |
| **Dos pantallas sobre la misma tabla** `fiscal_periods`, con modelos de estado incompatibles: `periodos-contables` usa `open/closing/closed` (correcto) y `contabilidad/periodos-fiscales` usa `open/closed/locked`. `'locked'` no existe en el CHECK, así que «Bloquear» **falla siempre**; `'annual'` tampoco, así que «Anual (1 período)» **falla siempre** | verificado: CHECK `status IN ('open','closing','closed')` y `period_type IN ('monthly','quarterly','yearly')` | 🟡 |
| Ninguna de las dos comprueba duplicados al generar el año. Con dos periodos que contengan la misma fecha, `fn_is_period_open` hace `LIMIT 1`: el resultado es no determinista | | 🟠 |

---

## F. Cajas del POS: `cashMode`, arqueos y la frontera con tesorería

Es lo que más interesa al dueño. Los controles y el funcionamiento interno de la caja están en
`AUDITORIA-CONTROLES-PERFIL-CAJAS.md` §B.1–B.14 y no se repiten; aquí va **la caja como pieza de
tesorería y de contabilidad**, con la evidencia de producción.

### F.1 `cashMode`: qué es y dónde vive

`components/pos/configuracion/configuracionService.ts:123-135`:

- `'branch'` — **una sola caja compartida por sucursal**. Es el valor por defecto y el
  comportamiento histórico.
- `'user'` — **cada cajero abre y gestiona su propia caja dentro de la sucursal**.

Se guarda en `organization_settings` con `key = 'pos_cash_session_mode'` y la forma
`{"mode": "branch"|"user"}` (`:443-483`). **Es configuración por organización, no por sucursal**
—pese a que el comentario del código hable de «una sucursal»—. Se lee con caché en memoria de 30 s
(`components/pos/cajas/CajasService.ts:68-94`) y ante cualquier error devuelve `'branch'`.

Verificado en producción: **solo 2 organizaciones tienen la fila, y ambas en `'user'`**. Las otras
82 operan en `'branch'` por defecto implícito, sin fila.

Qué cambia el modo, todo en `CajasService.ts`:

| Punto | Línea | En modo `user` |
|---|---|---|
| Buscar la caja activa | `:133-156` | filtra `.eq('opened_by', userId)` y **no cae** a la caja global |
| Alcance de apertura | `:454` | ignora `scope:'global'`, siempre sucursal |
| Unicidad al abrir | `:473-475` | añade `.eq('opened_by', userId)` |
| Mensaje de error | `:480-483` | «Ya **tienes** una caja abierta…» vs «Ya **hay**…» |
| Resumen de efectivo | `:723-724, 739, 782, 825` | filtra `payments.created_by` y `returns.user_id` por `session.opened_by` |
| Ventas de la sesión | `:1304-1318` | filtra `sales.user_id` |
| Detalle de pagos y pagos por método | `:1340-1352`, `:1512-1525` | filtra `payments.created_by` |
| Informe de cierre | `:1071-1087` | filtra `payments.created_by` |

### F.2 Qué escribe cada acción de caja

| Acción | Tablas escritas | Archivo:línea | Asiento |
|---|---|---|---|
| Abrir caja | `cash_sessions` (insert) — **y nada más**; no crea `cash_counts` de apertura | `CajasService.ts:515-526` | no |
| Movimiento de caja | `cash_movements` (insert) | `:605-653`, `:1177-1206` | sí, por trigger — **invertido si es salida** 🔴 |
| Arqueo | `cash_counts` (insert) con `denominations` jsonb, `counted_amount`, `expected_amount`, `difference` | `:1138-1172`; UI en `arqueos/NuevoArqueoPage.tsx:105-169` | no |
| Cerrar caja | `cash_sessions` (update `closed_at`, `closed_by`, `final_amount`, `difference`, `status='closed'`) — **no inserta `cash_counts` de cierre** | `:541-600` | solo el descuadre |
| Venta del POS | `sales`, `sale_items`, `payments`, `invoice_sales`, `invoice_items`, `stock_levels`, `stock_movements`, `commissions`, `tips`, seriales — **nunca `cash_movements`** | RPC `pos_checkout_v1` | sí, hasta cuatro |

Sobre esto último, el comentario es explícito y **la decisión es correcta**
(`lib/services/posService.ts:2418-2419`):

> «Los pagos de ventas POS se registran en la tabla payments. No se crean cash_movements para evitar
> doble conteo en el cierre de caja.»

El problema no es esa decisión, es que **nada más la sostiene**: si el efectivo de las ventas no
pasa por `cash_movements`, la única forma de saber qué efectivo pertenece a qué caja es deducirlo.

### F.3 `payments` no tiene `cash_session_id`: cómo se deduce la pertenencia 🔴

Verificado: `payments` tiene 17 columnas —`id, organization_id, branch_id, source, source_id,
method, amount, currency, reference, processor_response, status, created_by, created_at, updated_at,
payment_date, discount_amount, change_amount`—. **No hay `cash_session_id`.** Las únicas tablas con
esa columna son `cash_movements`, `cash_counts` y `folio_items`.

La deducción, en `CajasService.getCashSummary:727-740`:

```
.eq('organization_id', …)
.eq('method','cash').eq('status','completed')
.gte('created_at', session.opened_at)                        ← rango de fechas
.lte('created_at', session.closed_at || new Date())          ← sesión abierta = «hasta ahora»
[.eq('branch_id', session.branch_id)]   solo si no es NULL   ← sucursal
[.eq('created_by', session.opened_by)]  solo en modo 'user'  ← cajero
```

El mismo patrón se repite en **cinco sitios más**: `:814-826`, `:1075-1087`, `:1307-1318`,
`:1343-1353`, `:1515-1525`, y sobre `returns` en `:771-783`.

Riesgos que esto produce, todos verificables en el código citado:

1. **Caja global (`branch_id IS NULL`): dos verdades opuestas.** `getCashSummary` **no filtra**
   sucursal cuando es nula (el filtro es condicional, `:735`), así que absorbe los pagos de todas
   las sucursales. `getSessionSales:1311` sí aplica `.eq('branch_id', null)`, que en PostgREST se
   traduce a `IS NULL` y **no devuelve nada**. La misma sesión da dos cifras distintas.
2. **Solapamiento temporal**: dos sesiones de la misma sucursal cuyos rangos se pisen cuentan los
   mismos pagos las dos veces.
3. **Reescritura del pasado**: un pago insertado o corregido con `created_at` dentro del rango entra
   en una sesión **ya cerrada**, cuyo `difference` ya está escrito y contabilizado.
4. **En modo `user`, el filtro es `created_by = session.opened_by`**: un cobro registrado por otra
   persona en esa misma caja no cuenta, y un cobro de ese cajero desde otra pantalla sí.
5. **No hay índice que sostenga la consulta.** Verificado: los únicos índices de `payments` son la
   PK, `idx_payments_org` y un único parcial sobre referencias de un proveedor. No hay índice por
   `(organization_id, branch_id, method, created_at)`.

### F.4 No hay unicidad de caja abierta 🔴

Verificado. Índices de `cash_sessions`: `cash_sessions_pkey` y `idx_cash_sessions_uuid`. CHECK:
`status IN ('open','closed')`. **No existe ningún índice único parcial** del tipo
`UNIQUE (organization_id, branch_id) WHERE status = 'open'`.

El control existe **solo en el navegador** (`CajasService.openSession:461-491`): un `SELECT` y luego
un `INSERT`, es decir un TOCTOU de libro. Dos pestañas, dos terminales o el modo offline bastan.

**Y ya ocurrió.** Verificado en producción: **15 sesiones abiertas**, de las cuales **13 llevan más
de 24 horas**, **11 más de 7 días** y **2 abiertas desde 2025** (426 y 460 días). **Ninguna de las
15 tiene un solo arqueo.** Y la duración media de las 81 sesiones que sí se cerraron es de **46
horas**: ni siquiera las cerradas son diarias.

El caso de la sucursal con tres cajas abiertas, que es el que cierra la discusión:

| Org | Sucursal | Sesión | Abierta desde | Horas abierta | Pagos en su rango | Arqueos |
|---|---|---|---|---|---|---|
| 142 | 117 | 44 | 2026-09-02 17:08 | 488 | **74** | 0 |
| 142 | 117 | 76 | 2026-09-13 00:13 | 241 | 6 | 0 |
| 142 | 117 | 77 | 2026-09-13 02:38 | 239 | 6 | 0 |

**Son tres cajeros distintos** (verificado: 3 `opened_by` distintos). No es un turno solapado: son
tres cierres que nunca se hicieron.

Y ahí está la prueba concreta del triple conteo: como la sesión 44 lleva abierta desde el 2 de
septiembre y su rango no tiene fin, **sus 74 pagos incluyen los 6 de la sesión 76 y los 6 de la 77**.
El mismo efectivo está en el esperado de las tres. Cuando se cierren, producirán tres descuadres,
cada uno con su asiento.

Otros casos del mismo patrón, con actividad real atrapada dentro: org 113 sucursal 83 (**212 pagos**,
1.823 h), org 137 sucursal 112 (137 pagos, 292 h), org 142 sucursal 121 (56 pagos, 262 h), org 2
sucursal 2 (37 pagos, **10.226 h**).

**Esto es lo que fundamenta la decisión 3**: el sistema no necesita tolerar sesiones solapadas,
necesita impedirlas y ofrecer una forma de cerrar las que ya están abandonadas.

### F.5 El cierre de caja contabiliza el descuadre, no el efectivo

`fn_auto_journal_cash_session`, verificada en `pg_proc`:

1. solo corre cuando `NEW.status = 'closed'` y el anterior no lo era;
2. `v_diff := COALESCE(NEW.difference, final_amount - initial_amount)`;
3. **si `v_diff = 0`, no hace nada**;
4. busca una regla con `source_type = 'cash_movement'` —**sin filtrar `event_type`**, así que toma
   la primera por prioridad, que puede ser cualquiera—;
5. crea el asiento por `ABS(v_diff)`, invirtiendo las cuentas si el descuadre es negativo.

Verificado: **81 sesiones cerradas, 22 con descuadre, 22 asientos `source='cash_sessions'`**. Encaja
exactamente. El efectivo de la jornada no se contabiliza aquí —lo hacen los asientos de venta y de
pago, con la duplicación de §E.2—, y **la consignación del efectivo al banco no existe como
concepto** en ninguna parte del sistema.

### F.6 «Ingresos» y «Egresos» de Finanzas escriben en la caja del POS, y eligen mal cuál 🔴

Cuando en `/app/finanzas/ingresos` se elige origen «Caja», el servicio busca la sesión así
(`lib/services/movimientosService.ts:212-231`):

```
.from('cash_sessions').select('*')
.eq('organization_id', organizationId)
.eq('status', 'open')
.order('opened_at', { ascending: false })
.limit(1).single()
```

**No filtra por sucursal ni por usuario.** Con 15 sesiones abiertas en la base, un ingreso
registrado desde Finanzas cae en **la caja abierta más reciente de toda la organización**, que
puede ser la de otro cajero en otra sucursal. Ese movimiento entra en el esperado de esa caja y
descuadra su arqueo. Y el diálogo de alta no muestra en ningún momento en qué caja va a caer
(`NuevoIngresoDialog.tsx:137-265`: concepto, monto, origen Caja/Banco, cuenta bancaria, notas; sin
sesión, sin fecha, sin moneda).

### F.7 Dos calculadoras de caja que no coinciden

`components/pos/ventas/VentasService.ts:533-630` define `openCashSession` y `closeCashSession`,
**que nadie llama**. Calculan el esperado **solo con `initial_amount ± cash_movements`**, ignorando
`payments`, `returns` y `folio_items` —justo lo contrario de `getCashSummary`—. Son además los
únicos que crean `cash_counts` de apertura y cierre, lo que explica por qué esa tabla está vacía. Si
alguien los conectara, **todos los cierres darían un faltante igual al 100 % de las ventas**. 🟡

### F.8 Otros

- **El tiempo real de cajas es un no-op**: `CajasService.subscribeToCashSessions:1549-1598` devuelve
  una función vacía porque `cash_sessions` no está en la publicación `supabase_realtime`. La lista
  de cajas abiertas no refleja lo que hacen otros terminales — lo que agrava §F.4. 🟡
- **`cash_registers` no existe como tabla.** Solo aparece fabricada en memoria en
  `components/pos/reportes/reportesService.ts:497`. No hay concepto de terminal. ⚪
- El diálogo de cierre (`CierreCajaDialog.tsx:87-100, 191`) **no guarda denominaciones**: solo un
  importe contado por método. Las denominaciones únicamente se capturan en la pantalla de arqueo
  aparte, que casi nadie visita — de ahí las 0 filas.

---

## G. Bancos: el saldo que nunca se mueve

### G.1 `bank_accounts.balance` es un número almacenado que nadie mantiene 🔴

**Evidencia definitiva, verificada:** las **3** cuentas bancarias de la base tienen
`balance` **exactamente igual** a `initial_balance`. Cero desviación en cero cuentas.
Y en `pg_proc` **no existe ninguna función llamada `update_bank_balance`** ni ninguna otra que
actualice `bank_accounts.balance`; lo único que toca la tabla es el trigger de `updated_at`.

Los tres únicos caminos que pretenden moverlo:

1. **Alta de cuenta** — `balance = initial_balance` (`BancosService.ts:172-173`). Correcto.
2. **Movimiento manual** — lectura y escritura desde el navegador sin bloqueo
   (`BancosService.ts:310-331`): condición de carrera clásica, y si el `insert` en
   `bank_transactions` funciona y este `update` falla, no hay reversión.
3. **Transferencias** — `lib/services/transferenciasService.ts:184-234`:

```ts
await supabase.rpc('update_bank_balance', { p_account_id: fromAccountId, p_amount: -amount })
  .then(({ error }) => {
    if (error) {
      // Si no existe el RPC, actualizar directamente
      supabase.from('bank_accounts').select('balance').eq('id', fromAccountId).single()
        .then(({ data }) => {
          if (data) {
            supabase.from('bank_accounts')
              .update({ balance: (data.balance || 0) - amount })
              .eq('id', fromAccountId);          // ← sin await, sin .then(): nunca se envía
          }
        });
    }
  });
```

La RPC no existe, así que siempre se entra al camino alternativo; y en supabase-js 2.x el
constructor de consultas es perezoso: **sin `await` ni `.then()` la petición nunca sale**. El
`UPDATE` se construye y se descarta. Ni al crear ni al anular.

En cadena: la validación «Saldo insuficiente» (`NuevaTransferenciaDialog.tsx:105-112`) compara
contra un saldo congelado, así que se pueden crear transferencias ilimitadas desde una cuenta a
cero; el mensaje «Se revertirán los saldos» es falso; y los `select`/`update` sobre `bank_accounts`
**no llevan filtro de `organization_id`** (`:199, 206, 222, 229`), igual que `cancelTransfer:261`.

**Y la importación de Open Finance tampoco lo actualiza**: inserta en `bank_transactions`
(`transactionSyncService.ts:277-292`) y no toca el saldo. Cada sincronización agranda la deriva.

**El sistema ya sabe que el saldo está mal y no lo corrige.**
`anomalyDetectionService.detectBalanceDiscrepancies:519-531` recalcula
`initial_balance + Σ bank_transactions.amount`, lo compara con `bank_accounts.balance` y lo muestra
como «Saldo Local vs Saldo Calculado» en la pestaña Saldos del panel de anomalías. El botón
«Resolver» de esa pantalla **solo hace `console.log`** (`:613-625`) y ni siquiera recarga la lista.
Además, ese recálculo suma `amount` a pelo mientras la escritura manual resta cuando es débito: los
dos criterios son incompatibles, así que la pestaña produce falsos positivos sistemáticos en cuanto
hay un solo débito manual.

### G.2 El asiento de la transferencia es nulo 🔴

`fn_auto_journal_bank_transfer`, verificada. Lee las dos cuentas bancarias… y solo usa su
`branch_id`; los números de cuenta se descartan. Y después:

```
p_debit_account  := v_rule.debit_account_code,
p_credit_account := v_rule.debit_account_code,
```

**La misma cuenta a los dos lados.** Como `fn_create_journal_entry` no valida que débito ≠ crédito,
el asiento se crea: dos líneas sobre el mismo `account_code` que se anulan. El comentario justo
encima dice «débito cuenta destino, crédito cuenta origen». Contablemente la transferencia no
existe, y la cuenta de origen y la de destino no aparecen por ninguna parte.

Anular tampoco genera contrasiento: el guard corta todo lo que no sea `completed`/`confirmed`. Y
como no hay comprobación de `source`+`source_id` previo, un `UPDATE` que devuelva el estado a
`completed` **crea un asiento duplicado**.

### G.3 El módulo de bancos no está en uso real

Verificado: **3 cuentas bancarias, 2 transacciones (las dos `unmatched`, ninguna con
`import_source`), 1 transferencia, 0 conciliaciones, 0 items de conciliación, 0 sesiones QR**. El
esquema es mucho mejor que la interfaz —`bank_transactions.status` ya admite
`unmatched/matched/reconciled`, y `bank_reconciliation_items` ya tiene `matched_payment_id`,
`matched_journal_line_id` e `is_matched`—, pero la interfaz no usa ni la mitad.

Esto es una **buena noticia para el rediseño**: se puede reestructurar bancos casi sin migración de
datos.

---

## H. Bloque A — ingresos, egresos, transferencias, métodos de pago, monedas

Controles: `AUDITORIA-CONTROLES-FINANZAS.md` §C.6–C.13 y §F.2. Aquí, la capa de datos.

| Pantalla | Lee | Escribe | RPC | Triggers que dispara | RLS que la gobierna |
|---|---|---|---|---|---|
| Ingresos / Egresos (lista) `movimientosService.ts:463-478, 543-572` | `cash_movements`, `bank_transactions` + `bank_accounts` | — | — | — | `cash_movements_select_policy` (pertenencia) + `branch_access_restrictive` RESTRICTIVE sobre `branch_id`; ídem `bank_transactions` |
| Nuevo ingreso/egreso — origen Caja `:277-290` | `cash_sessions` (`status='open'`, **sin filtrar sucursal ni usuario**), `bank_accounts` | `cash_movements` | — | `trg_branch_default`, `trg_branch_audit`, **`trg_auto_journal_cash_movement`** → `journal_entries` + `journal_lines` | `cash_movements_insert_update_delete_policy` (ALL, cualquier miembro) |
| Nuevo ingreso/egreso — origen Banco `:318-331` | `bank_accounts` | `bank_transactions` (egreso con importe negativo, `status:'unmatched'`) | — | `trg_branch_default`, `trg_branch_audit`, **`trg_auto_journal_bank`** | `bank_transactions_insert_update_delete_policy` |
| Detalle de ingreso/egreso `:159-193` | `cash_movements` o `bank_transactions` | `cash_movements` (duplicar/anular) | — | los mismos | ídem |
| Transferencias (lista/detalle) `transferenciasService.ts:58-94, 296-321` | `bank_transfers` + doble join a `bank_accounts` | — | — | — | `Users can access their organization transfers` + `branch_access_restrictive` |
| Nueva transferencia `:149-234` | `bank_accounts` (saldo, **congelado**) | `bank_transfers`; **intento fallido** sobre `bank_accounts.balance` | **`update_bank_balance` — no existe** | `trg_branch_default`, **`trg_auto_journal_bank_transfer`** (asiento nulo) | ídem |
| Anular transferencia `:239-276` | — | `bank_transfers.status='cancelled'` (**sin filtro de organización**, `:261`) | — | el trigger corta: sin contrasiento | ídem |
| Métodos de pago `PaymentMethodsPage/List/Form` | `payment_methods` (global), `country_payment_methods`, `organization_payment_methods`, `organizations.country_code`, `chart_of_accounts`, `bank_accounts` | `organization_payment_methods` (activo, web, orden, borrar) **y `payment_methods` global** (nombre, requiere referencia, borrar) | `get_recommended_payment_methods` | ninguno | `payment_methods`: **`Allow anon select` con `qual=true`** + políticas por código; ver §M.2 |
| Mapeo contable del método `AccountMappingForm` | `chart_of_accounts`, `bank_accounts` | `organization_payment_methods.settings.account_mapping` | — | ninguno | — |
| Sesiones QR | `payment_qr_sessions` (`.limit(100)`) | — | — | — | por organización ✅ |
| Monedas (4 pestañas) | `currencies`, `currency_rates`, `organization_currencies`, `organization_preferences`, `exchange_rates_logs`, `exchange_rates` | `organization_preferences`, `organization_currencies`, `currency_rates` (upsert desde el navegador), `exchange_rates` | `get_organization_currencies`, `set_organization_base_currency`, `set_currency_auto_update`, `remove_organization_currency`, `get_currency_templates`, `add_organization_currency`, `update_global_exchange_rates`, `log_exchange_rates_execution`, `update_exchange_rates` | ninguno | `exchange_rates` tiene 1 política con `qual=true` |

**Hallazgos propios del bloque A que no estaban documentados:**

| # | Hallazgo | Sev. |
|---|---|---|
| A-1 | **El mapeo contable de los métodos de pago no lo lee nadie.** `AccountMappingForm` guarda cuenta bancaria, cuenta de ingresos, cuenta por cobrar y cuenta de caja en `organization_payment_methods.settings.account_mapping`; los triggers leen `accounting_rules`. **Son dos almacenes distintos** y configurar el primero no cambia ni un asiento | 🟠 |
| A-2 | **El mapeo contable no existe por método de pago en el modelo real.** Es decir: no hay forma de decir «lo cobrado con tarjeta va a `1110` y lo cobrado en efectivo a `1105`». Los 2.140 asientos de pago usan la misma regla | 🔴 |
| A-3 | **Ningún movimiento guarda moneda ni tasa.** Ni `cash_movements`, ni `bank_transactions`, ni `bank_transfers` tienen `currency` ni `exchange_rate`. Transferir entre cuentas de distinta divisa registra el mismo importe en las dos | 🟠 |
| A-4 | **Tres fuentes de verdad para la moneda base**: `currencyService.getBaseCurrency:29-62` devuelve `'USD'` cableado; `organization_currencies.is_base`; y `organization_preferences.settings.default_currency_code` | 🟠 |
| A-5 | **Dos sistemas de tasas incompatibles**: `exchange_rates` (por organización, lo usa solo `currencyService`) y `currency_rates` (**global, sin `organization_id`**, lo usa toda la pantalla de Monedas y la contabilidad en `ContabilidadService.ts:277`) | 🟠 |
| A-6 | **`convertAmount` devuelve el importe sin convertir** si no encuentra tasa, avisando solo por consola (`currencyService.ts:215-238`) | 🟠 |
| A-7 | **Anular un ingreso o egreso no anula nada**: inserta una contrapartida «ANULACIÓN: …» que ni `getAllMovements` ni `getStats` excluyen, y `getStats` usa `Math.abs`, así que **suma**. Además el `insert` usa `type: 'income'/'expense'` contra un CHECK `('in','out')`: **falla siempre** (`movimientosService.ts:401`) | 🟠 |
| A-8 | `NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY` viaja en el paquete del navegador (`openexchangerates.ts:99, 206, 434, 566`) | 🟠 |
| A-9 | **Conectar una integración de pago altera el catálogo de tesorería sin pasar por la pantalla de métodos de pago**: `integrationsService.saveCredentials:655` → `syncPaymentMethodFromConnection:680` escribe en `payment_methods:726` y `organization_payment_methods:736` | 🟡 |
| A-10 | Las **39 pantallas de configuración de pasarela** (`metodos-pago/gateways/*`, ~1.250 líneas que recogen claves secretas) son código muerto: nadie las renderiza | 🟡 |

---

## I. Bloque B — bancos, conciliación, Open Finance, PayFac

Controles: `AUDITORIA-CONTROLES-FINANZAS.md` §D.1–D.13.

| Pantalla | Lee | Escribe | Endpoint / RPC | Triggers | Cliente Supabase |
|---|---|---|---|---|---|
| Bancos (lista) | `bank_accounts`, `bank_reconciliations` (conteo) | `bank_accounts.is_active` | `GET /api/integrations/open-finance/real-balance` **una vez por tarjeta** (N+1 contra el proveedor externo) | — | navegador |
| Cuenta (detalle) | `bank_accounts`, `bank_transactions` (10), `open_finance_accounts` (**sin filtrar organización**) | — | `POST …/open-finance/sync` | — | navegador |
| Movimientos de cuenta | `bank_accounts`, `bank_transactions` | `bank_transactions`, `bank_accounts.balance` (lectura-escritura sin bloqueo) | — | `trg_auto_journal_bank` | navegador |
| Nueva cuenta | `organization_currencies`, `currencies` | `bank_accounts` | — | — | navegador |
| Tesorería consolidada | `bank_accounts`, `open_finance_accounts`, `accounts_receivable`, `accounts_payable`, `payments`, `suppliers` | — | 4 endpoints `…/treasury*` | — | **service role** en el servidor |
| Anomalías | `bank_transactions`, `open_finance_transactions`, `bank_accounts`, `open_finance_accounts` | **nada** | `…/anomalies` | — | **service role** |
| Conciliación (lista) | `bank_reconciliations` + `bank_accounts` | — | — | — | navegador |
| Nueva conciliación | `bank_accounts` (**sin filtro de sucursal**, a diferencia del resto) | `bank_reconciliations` | — | `fn_bank_reconciliations_updated_at` | navegador |
| Conciliación (detalle) | `bank_reconciliations`, `bank_reconciliation_items`, `bank_transactions`, `payments` | `bank_reconciliation_items`, `bank_transactions.status`, `bank_reconciliations.status='closed'` | — | ninguno contable | navegador |
| Sugerencias «IA» | `bank_transactions`, `payments` | `bank_reconciliation_items`, `bank_transactions.status` | `…/suggest-matches` | — | **service role** |
| Open Finance (panel y consentimientos) | `open_finance_links/accounts/transactions/consents` | vía endpoints | `…/health`, `/sync`, `/refresh-balances`, `/consents*` | — | mixto |
| PayFac cuentas / dispersiones | `organization_payout_accounts`, `organization_payouts`, `payout_items`, `payments` | las mismas | `…/payfac/*` | — | **service role** |

**Hallazgos propios del bloque B:**

| # | Hallazgo | Sev. |
|---|---|---|
| B-1 | **Las «sugerencias de IA» no son IA.** `aiMatchingService.ts:122-129` es una tabla de umbrales fija (monto 0-40, fecha 0-30, referencia 0-20, descripción 0-10) y el «NLP» es intersección de tokens (`:167-183`). **No llama a ningún proveedor y no cobra créditos**: cero ocurrencias de `chargeAiCredits` en el módulo. El nombre de la pestaña es engañoso | 🟡 |
| B-2 | **La conciliación no toca contabilidad.** Cero referencias a `journal*` en `components/finanzas/bancos`, `conciliacion-bancaria`, `lib/services/integrations/openFinance` y `api/integrations/open-finance`. El campo `match_type='journal'` existe y **ninguna interfaz puede producirlo** | 🟠 |
| B-3 | **`difference` y `closing_balance` de la conciliación nunca se persisten.** Se recalculan en el navegador (`ConciliacionDetailPage.tsx:164-165`) pero `ConciliacionService.recalcularDiferencia:223-250` **no se llama desde ningún sitio**. En la base quedan con los valores del alta, así que la lista muestra siempre diferencia 0 en verde aunque el detalle diga otra cosa | 🟠 |
| B-4 | El estado `in_progress` **es inalcanzable**: se crea en `draft` y se cierra a `closed`; nada escribe el intermedio, pese a tener KPI, filtro y badge | 🟡 |
| B-5 | `opening_balance` se toma del **saldo actual** de la cuenta, no del saldo a `period_start` (`NuevaConciliacionForm.tsx:71`). Error conceptual si el periodo es pasado | 🟠 |
| B-6 | El filtro «Pendientes» compara `status === 'pending'`, valor que **el CHECK ni siquiera admite** (`unmatched/matched/reconciled`). Las transacciones importadas nunca salen en ese filtro | 🟡 |
| B-7 | **`markAnomalyResolved` solo hace `console.log`** (`anomalyDetectionService.ts:613-625`). El botón «Resolver» dice «Anomalía marcada como resuelta» y no persiste nada ni recarga | 🟡 |
| B-8 | **IDOR cross-tenant en 10 endpoints.** Ver §M.1 | 🔴 |
| B-9 | `payfac/dispersiones` está **rota en tiempo de ejecución**: las rutas devuelven `{success, data}` y la página hace `const data: Payout[] = await res.json()`. `payouts.length` es `undefined`, no entra en el estado vacío y llega a `.map()` → `TypeError`. La página hermana lo hace bien (`json.data ?? json`) | 🟡 |
| B-10 | Badge «Verificada» de PayFac: la página lee `account.verified` y la columna es `is_verified`. Todas salen «Pendiente» para siempre | 🟡 |
| B-11 | `matchTransaccion` **no valida `organization_id`** ni que la transacción pertenezca a esa conciliación | 🟠 |
| B-12 | `ConsentBanner.tsx` (78 líneas, interfaz completa de autorización) **es huérfano**: nadie lo importa. El alta de consentimiento no tiene interfaz | 🟡 |

---

## J. Bloque C — contabilidad

Controles: `AUDITORIA-CONTROLES-FINANZAS.md` §E.1–E.15.

**Hecho transversal verificado:** no existe `src/app/api/**/contabilidad/**`. Todo el bloque accede
a PostgREST **desde el navegador** con el cliente anónimo, y el `organization_id` sale de
`obtenerOrganizacionActiva()` con **respaldo silencioso a `0`** en siete de los ocho servicios
(solo `PeriodosFiscalesService` valida). Una organización mal resuelta consulta con
`organization_id = 0` y devuelve vacío sin avisar.

| Pantalla | Lee | Escribe | RPC | Triggers |
|---|---|---|---|---|
| Contabilidad (hub) | `journal_entries` (conteo), `chart_of_accounts`, `fiscal_periods`, `folios`, `folio_items` | — | — | — |
| Asientos (lista y alta) | `journal_entries`, `chart_of_accounts` | `journal_entries` + `journal_lines` en **dos `insert` sin transacción** | **ninguna** | `tr_set_journal_line_org_id` |
| Asiento (detalle) | `journal_entries`, `journal_lines` + `chart_of_accounts` — **ambas sin filtro de organización** | `posted=true`; borrado físico en dos pasos | — | — |
| Plan de cuentas | `chart_of_accounts` | `chart_of_accounts` (insert/update/**delete físico**) | — | — |
| Balance de comprobación · Estado de resultados · Balance general · Mayor | `chart_of_accounts` + `journal_lines` con `journal_entries!inner` y `posted=true` | — | **ninguna: todo se calcula en el navegador** | — |
| Periodos fiscales / Periodos contables | `fiscal_periods` | `fiscal_periods` | — | `fn_fiscal_periods_updated_at` |
| Reglas contables | `accounting_rules`, `chart_of_accounts` | `accounting_rules` (**sin filtro de organización** en update/delete/toggle) | — | `fn_accounting_rules_updated_at` |
| Centro de costos / Presupuestos / Activos fijos | `cost_centers` / `budgets`+`budget_lines` / `fixed_assets` | las mismas (**sin filtro de organización**) | — | ninguno |

**Hallazgos propios del bloque C:**

| # | Hallazgo | Sev. |
|---|---|---|
| C-7 | **La pantalla de reglas contables es el único editor de una tabla de la que dependen 44 triggers**, y no valida nada: no comprueba que las cuentas existan en `chart_of_accounts` (la comprobación ocurre después, dentro de `fn_create_journal_entry`, que simplemente **no crea el asiento**), no impide reglas solapadas y **no tiene simulador**. Una errata en un código de cuenta apaga la contabilidad de un hecho económico entero, en silencio | 🔴 |
| C-8 | **El balance general nunca cuadrará**: solo suma cuentas `asset`/`liability`/`equity` y **no incorpora el resultado del ejercicio** (`ReportesContablesService.ts:306-312, 395`). El banner «Balance descuadrado» saldrá por el importe exacto de la utilidad | 🟠 |
| C-9 | **Los cuatro informes ignoran `debit_base`/`credit_base`** y usan `debit`/`credit` crudos. Con 27.409 líneas sin `currency_code`, en multimoneda se suman importes de divisas distintas | 🟠 |
| C-10 | **Los informes se calculan enteros en el navegador**, sin agregación ni paginación en servidor: todas las líneas del periodo viajan al cliente | 🟠 |
| C-11 | **No se puede editar, anular ni reversar un asiento.** Solo publicar, duplicar y **borrado físico** en dos pasos sin transacción, cuyo primer `delete` ni siquiera comprueba su error. `posted` es un booleano, no un estado: **no existe «anulado»**. La pista de auditoría desaparece | 🔴 |
| C-12 | `publicarAsiento` y `eliminarAsiento` filtran solo por `id`, **nunca por `organization_id`**, y no revalidan `posted` | 🟠 |
| C-13 | Varios `update` hacen spread del objeto recibido del formulario sin lista blanca (`actualizarRegla:131-134`, `actualizarCuenta`, `crearPeriodo`) | 🟠 |
| C-14 | **Presupuestos es una maqueta parcial**: `BudgetService.upsertLine` y `deleteLine` están implementados y **nunca se invocan**, así que el panel de líneas siempre está vacío. `actual_amount` y `variance` no los calcula nada. Verificado: **0 presupuestos, 0 líneas** | 🟡 |
| C-15 | **Centro de costos es un maestro inerte**: el CRUD funciona, `parent_id` no tiene selector, y `cost_center_id` **no se captura en ningún formulario** de asientos, presupuestos ni activos. Ningún informe agrupa por él. Verificado: **0 centros de costo, 0 líneas con centro** | 🟡 |
| C-16b | **El saldo final del balance de comprobación está mal calculado.** `ReportesContablesService.ts:180-200` obtiene `initialDebit` ya **neto** (`debit − credit`) y luego le suma los movimientos **brutos** del periodo: `finalDebit = initialDebit + period.debit`, `finalCredit = initialCredit + period.credit`, y después `Math.max(0, finalDebit − finalCredit)`. Para una cuenta de activo con saldo inicial deudor, `initialCredit` se fuerza a 0 y el crédito del periodo acaba restándose dos veces. **La fila de totales no cuadra contra el mayor de la misma cuenta** | 🔴 |
| C-16c | **En los tres informes de árbol, una cuenta padre con hijos descarta su propio saldo**: `node.amount = node.children.length > 0 ? childrenSum : ownAmount` (`ReportesContablesService.ts:372`, y equivalente en `:275-282`). Un movimiento cargado directamente a una cuenta padre **desaparece del informe** sin dejar rastro | 🟠 |
| C-16d | **Los cuatro informes ignoran la sucursal** pese a dibujar `BranchBadge` (`MayorContablePage.tsx:89`). En una organización multi-sucursal, el badge de la cabecera dice una cosa y los números son de todas | 🟠 |
| C-16 | **Activos fijos: registro maestro sin contabilidad.** `accumulated_depreciation` y `current_value` se fijan en el alta y no se vuelven a tocar; dos de los tres métodos de depreciación devuelven 0; las cuatro columnas de cuentas contables del activo no se capturan; `asset_depreciations` —con FK a `journal_entries`— está vacía. Verificado: **0 activos** | 🟡 |

---

## K. Bloque D — fiscal e integraciones

Controles: `AUDITORIA-CONTROLES-FINANZAS.md` §B.13–B.16 y §F.1;
`AUDITORIA-DOCUMENTOS-PDF-IMPRESION.md` §D.

| Pantalla | Lee | Escribe | Endpoint | ¿Asiento? |
|---|---|---|---|---|
| Facturación electrónica | `electronic_invoicing_jobs`, `electronic_invoicing_events` | vía API | `/api/factus/jobs`, `/download` | **no**. Cero referencias a `journal*` o `accounting_rules` en `api/factus/**` |
| Documentos soporte (3 vistas) | `support_documents`, `invoice_items`, `suppliers`, `invoice_purchase`, `organization_currencies`, `currencies` | `support_documents`, `invoice_items` | `/api/factus/support-document` | **no**. 0 triggers sobre la tabla |
| Impuestos | `organization_taxes`, `tax_templates`, `product_tax_relations` | `organization_taxes` | — | **no directamente**; ver §E.4 |
| Conexiones de integración | `integration_*`, `channels`, `payment_methods`, `organization_payment_methods` | las mismas | health-checks por proveedor | no |
| PayFac comisiones / dispersiones | `organization_commission_rates`, `organization_payouts`, `payout_items`, `payments`, `platform_admins` | las mismas | `/api/integrations/payfac/*` | **no** |

**Hallazgos propios del bloque D:**

| # | Hallazgo | Sev. |
|---|---|---|
| D-1 | **El alta de un documento soporte deja filas huérfanas.** `SupportDocumentForm:341-343` inserta en `invoice_items` con `invoice_type: 'support_document'`, valor que **dos CHECK prohíben** (verificado: `invoice_items_invoice_type_check` admite solo `sale`/`purchase`, y `chk_invoice_items_type_sales` exige además la FK correspondiente). El documento ya se insertó antes y **no hay transacción**: queda con totales y **cero ítems**, contado como «Borrador» y enviable a la DIAN | 🔴 |
| D-2 | **El documento soporte no existe contablemente**: sin asiento, sin cuenta por pagar, sin `payments`. Un gasto declarado ante la autoridad fiscal que el libro no registra. Verificado: 0 filas hoy, así que el daño es potencial, no realizado | 🟠 |
| D-3 | **Una factura rechazada por la DIAN sigue contabilizada como venta válida**: la validación electrónica no toca el asiento en ningún estado | 🟠 |
| D-4 | **Una sola cuenta del proveedor de facturación electrónica para todos los inquilinos**: `factusTokenManager.ts:17-21` lee `process.env`. Mientras tanto, `electronic_invoicing_config` guarda `client_secret` y `password` **en texto plano por organización** y **nunca se usan**. El botón «Probar conexión» autentica contra `process.env`, así que **da verde aunque las credenciales tecleadas sean basura** | 🔴 |
| D-5 | `POST /api/integrations/payfac/payouts` **no verifica `platform_admin`.** La función `verifyPlatformAdmin` está definida y se usa en el GET —y solo cuando falta `organizationId`—, pero el POST solo comprueba que haya sesión. Cualquier usuario autenticado puede **crear una dispersión de fondos contra cualquier organización** escribiendo su id en un `<input type="number">`. Agravante: `payoutService.create` lee `payments` de esa organización ajena para armar los ítems | 🔴 |
| D-6 | El botón «Configuración» de facturación electrónica apunta a `/app/finanzas/facturacion-electronica/configuracion`, **que no existe** → 404. La configuración real vive en `/app/configuracion?modulo=facturacion` | 🟡 |
| D-7 | **No existe ningún panel de configuración contable**: ni plan de cuentas por defecto, ni mapeo de cuentas de impuesto, ni cuentas de caja/banco por sucursal. Todo se configura en `/app/finanzas/reglas-contables`, fuera de Configuración | 🟠 |

---

## M. Seguridad, multi-tenant y RLS

### M.1 IDOR cross-tenant con service role 🔴

Diez endpoints toman `organizationId` de la **cadena de consulta del cliente**, solo comprueban que
exista sesión, y después consultan con **service role** (`getSupabaseAdmin()`), que **ignora RLS**:

`…/open-finance/treasury`, `/treasury/projection`, `/treasury/alerts`, `/treasury/concentration`,
`/anomalies`, `/real-balance`, `…/payfac/payouts`, `/payouts/summary`, `/payouts/[id]`,
`/payout-accounts/[id]` (DELETE, con `.eq('id', id)` y sin filtro de organización).

Cualquier usuario autenticado puede leer saldos bancarios, cartera por pagar, pagos, proveedores y
dispersiones de **cualquier organización** cambiando un número en la URL, y desactivar la cuenta de
cobro de cualquier organización conociendo su UUID. Esto viola directamente la regla 5 de
`CLAUDE.md`. Las rutas bien hechas existen y sirven de modelo: `suggest-matches`, `consents`,
`consents/stats` y `payout-accounts` resuelven la organización desde `organization_members`.

### M.2 `payment_methods`: catálogo global editable por cualquiera 🔴

Verificado. La tabla **no tiene `organization_id`** (7 columnas: `code`, `name`,
`requires_reference`, `is_active`, `created_at`, `updated_at`, `is_system`), y sus políticas son:

| Política | Permisiva | Comando | Roles | Condición |
|---|---|---|---|---|
| `Allow anon select payment_methods` | PERMISSIVE | SELECT | **public** | **`true`** |
| `payment_methods_select_policy_v2` | PERMISSIVE | SELECT | public | `is_system = true` OR el código está en tus `organization_payment_methods` |
| `payment_methods_insert_policy` | PERMISSIVE | INSERT | public | `is_system = false` y ser miembro de **alguna** organización |
| `payment_methods_update_policy` | PERMISSIVE | UPDATE | public | `is_system = false` y el código está en tus `organization_payment_methods` |
| `payment_methods_delete_policy` | PERMISSIVE | DELETE | public | igual |

**El daño concreto, cuantificado.** 30 filas, 16 de ellas `is_system = false`. El código `wompi`
—`is_system = false`— lo comparten **61 organizaciones**. La política de borrado permite a
**cualquiera de esas 61** eliminar la fila global, porque el código está en sus propios
`organization_payment_methods`. Y el código lo hace sin filtro:

- `PaymentMethodsList.tsx:527-529` — `delete().eq('code', deleteTarget.payment_method_code)`, con el
  fallo degradado a `console.warn` y la interfaz declarando éxito;
- `PaymentMethodForm.tsx:304-309` — `update({name, requires_reference}).eq('code', …)`: **renombrar
  un método renombra la fila global para los 61 inquilinos**, con el error tragado por
  `console.error` y un toast que dice «guardado».

### M.3 `organization_taxes`: aislamiento anulado 🔴

Verificado, cuatro políticas PERMISSIVE que se combinan con OR:

| Política | Comando | Roles | Condición |
|---|---|---|---|
| `temp_allow_all_taxes` | **ALL** | **public** | **`true`** |
| `Allow anon select organization_taxes` | SELECT | public | **`true`** |
| `org_admins_manage_taxes` | ALL | public | `organization_id = auth.jwt()->>'organization_id'` |
| `org_users_view_taxes` | SELECT | public | ídem |

`temp_allow_all_taxes` anula las otras dos: cualquiera —incluido `anon`— puede **leer y escribir**
las tasas de impuesto de cualquier organización. Y las dos políticas «buenas» leen
`auth.jwt()->>'organization_id'`, mientras el frontend toma la organización de `localStorage`: dos
fuentes de verdad distintas para el mismo concepto.

### M.4 Sin separación de funciones en contabilidad 🟠

Verificado: las políticas de `journal_entries`, `journal_lines`, `chart_of_accounts`,
`accounting_rules` y `payments` son de tipo `ALL` con la sola condición de **pertenecer a la
organización**. No hay comprobación de rol ni de cargo en la base. Es decir: **cualquier miembro
activo de la organización —un cajero, un vendedor— puede insertar, modificar y borrar asientos
contables, editar el plan de cuentas, cambiar las reglas de contabilización y borrar pagos.**
La regla 6 de `CLAUDE.md` («los permisos se resuelven en el servidor») no se está cumpliendo en la
capa que de verdad manda.

### M.5 `app_branch_access`: fail-open doble y rol por nombre 🟠

Las políticas RESTRICTIVE de sucursal sobre `payments`, `cash_sessions`, `cash_movements`,
`cash_counts`, `bank_accounts`, `bank_transactions`, `bank_transfers`, `journal_entries` y
`support_documents` llaman a `app_branch_access(branch_id)`. Verificada en `pg_proc`, esa función:

1. **permite si `p_branch_id IS NULL`** — y `payments.branch_id` es NULL-able (verificado: 6 filas
   hoy), igual que `cash_movements`, `bank_transactions` y `bank_transfers`;
2. identifica al administrador **por el nombre del rol** (`r.name = ANY (ARRAY['Super Admin','Admin
   de organización'])`), exactamente lo que prohíbe la regla 6 de `CLAUDE.md` —y el mismo defecto ya
   señalado en `PATRONES-TRANSVERSALES.md` §9 para `branchService`—;
3. **permite todo** a quien es miembro de la organización y no tiene ninguna sucursal asignada.

### M.6 Otras

- **Todo el dinero se escribe desde el navegador con la clave anónima.** Ni un `getServerUserClient`
  ni un `getServiceClient` en los bloques A, B y C. 🟠
- Varias mutaciones no filtran `organization_id` y confían solo en RLS: `bank_accounts` en
  transferencias, `bank_transfers.cancelTransfer`, `journal_entries` publicar y eliminar,
  `journal_lines` leer, `accounting_rules` actualizar/eliminar/alternar, `fiscal_periods`
  cerrar/reabrir, `cost_centers`, `budgets` y `fixed_assets` actualizar/eliminar. 🟠
- Positivo: las credenciales de integración guardan **referencias, no secretos**
  (`integrationsService.ts:646`). El contraejemplo es `electronic_invoicing_config`, que guarda el
  secreto en claro.

---

## N. Lo muerto y lo decorativo

Verificado por conteo directo, para que el rediseño no dibuje pantallas de nada:

| Tabla | Filas | Veredicto |
|---|---|---|
| `cash_counts` | **0** | el arqueo por denominación no se guarda nunca |
| `cost_centers` | **0** | maestro inerte |
| `budgets` / `budget_lines` | **0 / 0** | sin interfaz para llenar las líneas |
| `fixed_assets` / `asset_depreciations` | **0 / 0** | sin devengo ni asiento |
| `support_documents` | **0** | y su alta rompe un CHECK |
| `payment_qr_sessions` | **0** | |
| `bank_reconciliations` / `_items` | **0 / 0** | |
| `bank_transactions` | **2** | ambas `unmatched` |
| `bank_transfers` | **1** | |
| `bank_accounts` | **3** | las tres con saldo = saldo inicial |
| `cash_movements` | **5** | frente a 109 asientos de esa fuente |
| `tax_account_mapping` | **288** | poblada y **sin un solo lector** |

Y código muerto relevante: `VentasService.openCashSession/closeCashSession` (calculadora de caja
divergente, §F.7), `ConciliacionService.recalcularDiferencia`, `BudgetService.upsertLine/deleteLine`,
`ConsentBanner.tsx`, las 39 pantallas de pasarela, `PeriodosContablesService.eliminarPeriodo/
actualizarPeriodo`, `checkTaxUsage`, `updateDefaultTax`, `movimientosService.updateMovement`.

---

# PARTE 2 — PROPUESTA DE ESTRUCTURA

## O. Un solo modelo de movimiento de dinero

### O.1 Las cuatro cosas que hoy se confunden

El sistema mezcla cuatro conceptos que no son el mismo, y por eso conviven caminos distintos para lo
mismo. La distinción propuesta:

| Concepto | Definición | Contrapartida | Ejemplo | Hoy vive en |
|---|---|---|---|---|
| **Pago de un documento** | Liquida total o parcialmente una obligación **que ya existe** | una cuenta por cobrar o por pagar | cobro de una factura, abono de cartera, pago a proveedor | `payments` |
| **Ingreso** | Entra dinero **sin documento previo** que lo respalde | una cuenta de ingreso, de patrimonio o de pasivo | aporte de socio, préstamo recibido, sobrante de caja | `cash_movements` / `bank_transactions` |
| **Egreso** | Sale dinero **sin documento previo** | una cuenta de gasto, de activo o de pasivo | servicios públicos pagados de la caja chica, retiro de socio | ídem |
| **Traslado** | El dinero **cambia de sitio, no de dueño**. El patrimonio no varía | otra cuenta de efectivo propia | caja → banco (consignación), banco → banco, caja → caja | `bank_transfers` (solo banco↔banco) |

**La regla que ordena todo:** un ingreso o un egreso **siempre** afecta a una cuenta de resultado,
patrimonio o pasivo. Un traslado **nunca**. Un pago de documento **nunca** afecta a resultado: solo
mueve efectivo contra cartera. Si una pantalla permite las tres cosas con el mismo formulario —como
hoy—, el usuario no puede saber qué está haciendo y la contabilidad tampoco.

### O.2 La tabla que falta: `treasury_movements`

**Propuesta: una sola tabla de movimientos de tesorería**, aditiva, que no sustituye a las
existentes sino que las **unifica como libro de efectivo**.

```
treasury_movements
  id                uuid
  organization_id   int NOT NULL
  branch_id         int NOT NULL
  kind              text  -- 'income' | 'expense' | 'transfer_out' | 'transfer_in' | 'document_payment'
  account_kind      text  -- 'cash' | 'bank'
  cash_session_id   int   NULL    -- obligatorio si account_kind='cash'
  bank_account_id   int   NULL    -- obligatorio si account_kind='bank'
  amount            numeric NOT NULL CHECK (amount > 0)   -- SIEMPRE positivo; el sentido va en kind
  currency          char(3) NOT NULL
  exchange_rate     numeric NOT NULL DEFAULT 1
  amount_base       numeric NOT NULL          -- amount * exchange_rate, congelado
  movement_date     timestamptz NOT NULL
  concept           text NOT NULL
  counterparty_type text NULL   -- 'customer' | 'supplier' | 'employee' | 'internal'
  counterparty_id   uuid NULL
  transfer_group_id uuid NULL   -- une las dos patas de un traslado
  payment_id        uuid NULL   -- si kind='document_payment', apunta a payments
  source_table      text NULL   -- trazabilidad hacia el origen que lo creó
  source_id         text NULL
  status            text NOT NULL DEFAULT 'posted'  -- 'posted' | 'voided'
  voided_by_id      uuid NULL   -- el movimiento que lo anula
  journal_entry_id  int NULL    -- el asiento que generó, o NULL si no generó
  reconciliation_status text NOT NULL DEFAULT 'unreconciled'
  created_by        uuid
```

Cuatro decisiones de diseño que resuelven defectos concretos del análisis:

1. **El importe siempre positivo y el sentido en `kind`.** Elimina de raíz la incoherencia de signo
   entre `cash_movements` y `bank_transactions` (§B.2) y el asiento invertido de los egresos (§D.1).
2. **`amount_base` congelado al momento.** Resuelve A-3, A-5 y C-9: el informe nunca tendrá que
   volver a buscar una tasa histórica.
3. **La anulación es un estado más un movimiento que apunta al anulado**, no una contrapartida
   suelta. Resuelve A-7.
4. **`transfer_group_id` hace del traslado una sola operación de dos patas**, que se crean o no se
   crean juntas. Resuelve §G.2.

**Cómo convive con lo existente (todo aditivo, nada se borra):**

- `payments` sigue siendo la fuente de verdad de la liquidación de documentos, con sus triggers de
  cartera intactos. Un trigger nuevo proyecta cada `payments` a un `treasury_movements` con
  `kind='document_payment'`.
- `cash_movements` y `bank_transactions` se mantienen como están —tienen triggers de contabilidad
  activos— y se proyectan igual. A medio plazo, las pantallas escriben solo a
  `treasury_movements` y esas dos quedan como vistas.
- `bank_transfers` se sustituye por dos filas con el mismo `transfer_group_id`.

### O.3 La jerarquía de pantallas propuesta

Hoy son 28 entradas de menú en una columna de 224 px (ver `AUDITORIA-CONTROLES-FINANZAS.md` §F.0,
defecto N-h), con rutas existentes sin entrada ni enlace (`/reportes`, `/periodos-contables`,
`/open-finance`, `/payfac/*`) y dos pantallas de periodos duplicadas.

Propuesta: **cinco grupos, catorce entradas**.

| Grupo | Entradas | Qué se fusiona o desaparece |
|---|---|---|
| **Documentos** | Facturas de venta · Facturas de compra · Cotizaciones · Notas de crédito · Documentos soporte | sin cambio |
| **Cartera** | Cuentas por cobrar · Cuentas por pagar | «Saldos a favor» pasa a ser una **pestaña** de cuentas por cobrar |
| **Tesorería** | **Movimientos** · **Cuentas de dinero** · **Conciliación** | «Ingresos», «Egresos» y «Transferencias» **se fusionan en una sola pantalla «Movimientos»** con un filtro de tipo y **tres botones de alta distintos**. «Bancos» pasa a llamarse «Cuentas de dinero» e incluye **las cajas** junto a las cuentas bancarias. «Tesorería consolidada» y «Anomalías» pasan a ser **pestañas** de esa pantalla. Open Finance y PayFac salen del menú de Finanzas a Integraciones |
| **Contabilidad** | Asientos · Plan de cuentas · Informes · Periodos · Reglas | los **cuatro informes** (comprobación, resultados, general, mayor) se unifican en **una pantalla «Informes» con selector**: comparten filtros, exportación y estructura. Las **dos pantallas de periodos se fusionan en una**, con el modelo de estado correcto (`open/closing/closed`) |
| **Configuración** | Impuestos · Monedas · Métodos de pago | «Centro de costos» pasa a ser una **pestaña** de plan de cuentas (es una dimensión del mismo eje). «Activos fijos» y «Presupuestos» **salen del menú** hasta que tengan devengo y líneas: hoy son pantallas de nada (§N) |

Resultado: de 28 a 14 entradas, 6 pantallas fusionadas, 4 salidas del menú, 0 funcionalidad perdida.

**Por qué «Movimientos» en singular y no tres pantallas.** Ingresos, egresos y transferencias son la
misma tabla con distinto `kind`. Tres pantallas idénticas obligan a mantener tres listas, tres
exportaciones, tres paginaciones y tres filtros —y hoy ninguna de las tres tiene paginación—. Una
sola pantalla con chips de tipo, y **tres altas distintas** porque los tres formularios sí son
distintos, es menos código y más claro. La distinción que importa al usuario está en el alta, no en
la lista.

**Lo que se gana con «Cuentas de dinero».** Hoy una caja y una cuenta bancaria son cosas
incomparables: la caja vive en el POS y la cuenta en Finanzas, y no hay ninguna pantalla donde se
vea «cuánto dinero tengo y dónde». Con las dos en la misma lista, la consignación (§P.2) se vuelve
una operación obvia entre dos filas de la misma tabla.

---

## P. La cadena caja → banco → contabilidad

### P.1 Cómo debería fluir el efectivo del POS

```
  VENTA EN EFECTIVO
  └─ payments (method='cash', cash_session_id ← NUEVO)
     ├─ trigger cartera: recalcula invoice_sales y accounts_receivable   [ya existe]
     ├─ proyección: treasury_movements kind='document_payment', account_kind='cash'
     └─ asiento: 1105 Caja  D  /  1305 Clientes  C                        [un solo asiento]

  ARQUEO Y CIERRE DE CAJA
  └─ cash_counts (denominaciones, contado, esperado, diferencia)          [hoy 0 filas]
     └─ cash_sessions.status='closed', difference
        └─ asiento SOLO del descuadre: 5305 Gastos diversos D / 1105 C   [ya existe]

  CONSIGNACIÓN  ← NO EXISTE HOY, ES EL ESLABÓN QUE FALTA
  └─ treasury_movements × 2 con el mismo transfer_group_id
     ├─ pata de salida:  kind='transfer_out', account_kind='cash', cash_session_id
     ├─ pata de entrada: kind='transfer_in',  account_kind='bank', bank_account_id
     └─ asiento: 1110 Bancos D / 1105 Caja C
        └─ la pata de entrada nace con reconciliation_status='unreconciled'

  EXTRACTO BANCARIO
  └─ bank_transactions (importado o manual)
     └─ conciliación: empareja la pata de entrada con el movimiento del extracto
        └─ reconciliation_status='reconciled' en ambos lados
```

**El eslabón que falta es la consignación.** Hoy el efectivo del POS **nunca llega al banco** en el
sistema: la caja se cierra, el dinero físico va al banco, y en el ERP no queda rastro. Por eso
`1105` Caja crece indefinidamente en el libro mientras el saldo real es cero. Es, junto con la
duplicación de asientos, la razón por la que el libro no se parece a la realidad.

### P.2 Las tres reglas de la cadena (decisión 1)

1. **Devengo y cobro son dos asientos distintos, y cada hecho genera exactamente uno.**
   - La **venta o la factura** genera el asiento de **devengo**: ingreso + IVA por pagar + cuenta
     por cobrar, y aparte el costo con su salida de inventario. **Un solo asiento por documento.**
   - El **pago** genera el asiento de **cobro**: entra dinero donde realmente entró y baja la
     cuenta por cobrar. **Aquí no se toca ingresos.**
   Hoy los cuatro caminos compiten y tres de ellos acreditan ingresos (§E.2).
2. **La cuenta contable del efectivo sale del sitio donde está el dinero, no de una regla
   genérica.** Cada caja y cada cuenta bancaria lleva su `account_code`; el asiento del cobro usa la
   cuenta del sitio de destino. Hoy los 2.140 asientos de pago usan la misma regla y por eso el
   efectivo del POS acaba en `1110 Bancos` (§E.2, ejemplo).
3. **Toda diferencia de caja tiene dueño y motivo.** El asiento del descuadre hoy usa «la primera
   regla `cash_movement` por prioridad», sin distinguir sobrante de faltante ni exigir motivo.
   Debería usar reglas propias (`cash_session/overage`, `cash_session/shortage`) y el cierre debería
   exigir una nota cuando la diferencia supere un umbral configurable.

### P.3 Qué disparador se retira, cuál se conserva y cómo se evita el doble asiento

**Se conserva `fn_auto_journal_sale` sobre `invoice_sales`. Se retira `fn_auto_journal_sale_pos`
sobre `sales`.**

Es la elección menos intuitiva de las dos, y por eso conviene el razonamiento explícito:

| Criterio | `sales` (`fn_auto_journal_sale_pos`) | `invoice_sales` (`fn_auto_journal_sale`) |
|---|---|---|
| ¿Existe siempre? | solo si la venta viene del POS | **sí**: toda venta POS crea factura (`pos_checkout_v1:424`), y además existen las facturas nacidas fuera del POS |
| ¿Cubre el canal web, PMS, parqueaderos? | no | **sí**, todos desembocan en factura |
| ¿Es el documento que sustenta fiscalmente el ingreso? | no | **sí**: es el que lleva número, resolución y CUFE |
| ¿Tiene el desglose de impuestos del documento? | `tax_total` agregado | **sí**, con `invoice_applied_taxes` por código |
| Robustez hoy | **falla en silencio** si la regla no trae `conditions.is_credit` — 2 organizaciones sin asiento de venta (§E.3) | tiene respaldo sin condiciones |
| Asientos en producción | 2.394 | 3.298, en 19 organizaciones frente a 16 |

Retirar el del POS deja **un único asiento de devengo por documento** y, de paso, elimina el defecto
de §E.3. A cambio hay que asegurar que el asiento de la factura reciba la información que hoy solo
tenía el del POS: la **condición contado/crédito**, que en `fn_auto_journal_sale` se deduce hoy de
`payment_method = 'credit'` y debe pasar a deducirse del saldo real (`COALESCE(balance,0) > 0`),
igual que hace la versión F-52 del trigger del POS.

**Cómo se evita el doble asiento a futuro: clave natural del hecho, no el origen.**

El problema de raíz es que la idempotencia se apoya hoy en `(source, source_id)`, es decir **en la
tabla que disparó el trigger**. Dos tablas distintas que describen el mismo hecho económico producen
dos claves distintas, y el índice no las ve. La corrección es anclar la clave a **lo que pasó**, no
a **quién avisó**:

```
journal_entries.fact_key  text   -- clave natural del hecho económico
UNIQUE (organization_id, fact_key) WHERE fact_key IS NOT NULL
```

con una convención estable y derivable desde cualquier disparador:

| Hecho | `fact_key` | Lo generen `sales`, `invoice_sales` o un reproceso |
|---|---|---|
| Devengo de una venta | `accrual:sale:{sale_id}` — y si la factura no nace de una venta, `accrual:invoice:{invoice_id}` | la misma clave por los dos caminos |
| Costo de la venta | `cogs:sale:{sale_id}` | |
| Cobro | `settlement:payment:{payment_id}` | |
| Descuadre de caja | `cash_diff:session:{cash_session_id}` | |
| Traslado de dinero | `transfer:{transfer_group_id}` | |
| Depreciación | `depreciation:{asset_id}:{periodo}` | |

Con esa clave, **el segundo intento de contabilizar el mismo hecho choca contra el índice y no
inserta**, venga del trigger que venga, de una carga retroactiva (`fn_retro_journal_*`) o del agente
de IA —que hoy usa `source='sale'` y por eso no ve los asientos de los triggers (§E.2)—. Y el índice
pasa a llevar `organization_id`, con lo que deja de ser el cerrojo cross-tenant de §D.4.

`source` y `source_id` **se conservan** como trazabilidad hacia el origen; simplemente dejan de ser
la clave de unicidad.

### P.4 Cajas por cajero y cajas por sucursal: qué cambia

El modelo `cashMode` es correcto conceptualmente. Lo que falla es que **no está sostenido por el
esquema**. Con `payments.cash_session_id` y el índice único, los dos modos se vuelven exactos:

| | Modo `branch` | Modo `user` |
|---|---|---|
| Hoy: quién pertenece a la caja | pagos del rango de fechas y sucursal | …y del cajero que abrió |
| Hoy: cuántas cajas abiertas | **sin límite** (3 vistas en una sucursal) | sin límite |
| Propuesto: pertenencia | **`payments.cash_session_id`**, escrito por el POS al cobrar | igual |
| Propuesto: unicidad | `UNIQUE (organization_id, branch_id) WHERE status='open'` | `UNIQUE (organization_id, branch_id, opened_by) WHERE status='open'` |
| Propuesto: qué caja usa una pantalla ajena al POS | se elige **explícitamente** en el formulario, con la lista de cajas abiertas de la sucursal activa | igual |

El índice único **tiene que ser distinto por modo**, y los dos se pueden crear hoy con distinto
coste: el de cajero (`organization_id, branch_id, opened_by`) **no lo viola ninguna de las 15
sesiones abiertas** —las tres de la sucursal 117 son de tres cajeros distintos—, así que entra de
inmediato; el de sucursal sí se viola y exige cerrar antes esas tres sesiones (§S, migraciones 11 y 14).

**Además, el modo debería poder ser por sucursal, no solo por organización.** Hoy vive en
`organization_settings` y una cadena con una sucursal de mostrador único y otra con cuatro cajeros
no puede configurarse bien. Es un cambio pequeño y aditivo (§S, migración 18).

### P.5 Cajas abandonadas: aviso, cierre asistido y cierre forzado (decisión 3)

El índice único impide **abrir** una segunda caja, pero no resuelve las que ya llevan meses
abiertas: si nadie puede cerrar la sesión 44, el cajero tampoco podrá abrir la suya. Hacen falta las
tres piezas, en este orden.

**1. Aviso.** Umbral configurable por organización —propuesta: `cash_session_stale_hours`, por
defecto 18 h, que cubre la jornada más larga sin ser molesto—. Al superarlo, la caja pasa a estado
visual «Vencida» en el listado de cajas y se notifica a quien la abrió y al administrador de la
sucursal. Hoy, con 13 de 15 sesiones por encima de 24 h, el aviso sería inmediato.

**2. Cierre asistido.** Quien abrió la caja puede cerrarla tarde, pero **con arqueo obligatorio**:
las 15 sesiones abiertas tienen cero arqueos, así que no hay ninguna cifra contada con la que
cuadrar. El diálogo muestra el esperado calculado, pide el contado y exige nota si la diferencia
supera el umbral (§P.2 regla 3).

**3. Cierre forzado, por un administrador.** Para las sesiones cuyo cajero ya no está disponible.
Requiere permiso explícito, arqueo obligatorio y deja rastro: quién la forzó, cuándo y por qué.
Propuesta de columnas, todas aditivas y NULL-ables:

```
cash_sessions.closed_reason     text   -- 'normal' | 'assisted' | 'forced' | 'auto'
cash_sessions.forced_by         uuid
cash_sessions.forced_reason     text
```

**Nueva pantalla: «Cajas abandonadas»**, dentro de «Cuentas de dinero» (§O.3) y visible solo con
permiso de administración de caja. Una fila por sesión vencida, con sucursal, cajero, horas
abiertas, pagos atrapados en su rango y acción «Cerrar con arqueo». Es la pantalla que hoy no existe
y por la que 11 sesiones llevan más de una semana abiertas. Con los datos de hoy tendría 13 filas.

**Sobre el cierre automático.** Se propone **no cerrar solo** por defecto: una caja que se cierra
sola con el esperado como contado escribe un descuadre de cero que es mentira, y genera —o no— un
asiento que nadie ha revisado. La opción se deja configurable (`cash_session_auto_close_hours`,
apagada por defecto) y, si se activa, la sesión se cierra con `closed_reason='auto'`,
`final_amount = NULL` y **sin asiento de descuadre**, quedando marcada para arqueo posterior. Cerrar
la caja es un acto de control interno: el sistema puede recordarlo y facilitarlo, no suplantarlo.

**Y la pieza que evita que vuelva a pasar** es `payments.cash_session_id` (§S, migración 9): con
ella, una sesión abandonada deja de contaminar a las demás, porque los pagos ya no pertenecen «al
rango de fechas» sino a una caja concreta.

---

## Q. Conciliación que cuadre con movimientos y con asientos

### Q.1 El problema conceptual

Hoy la conciliación empareja `bank_transactions` con `payments` (o nada). Pero `payments` es la
liquidación de un documento, no un movimiento bancario: un pago con tarjeta llega al banco días
después, agrupado con otros y **neto de comisión**. Emparejarlos uno a uno no puede funcionar.

### Q.2 El modelo propuesto

**Se concilia el libro de efectivo contra el extracto**, no los pagos contra el extracto:

```
   bank_transactions (extracto)  ←→  treasury_movements (libro)  →  journal_lines (asiento)
            │                                  │                           │
            └──── bank_reconciliation_items ───┴───────────────────────────┘
                  (ya tiene matched_payment_id y matched_journal_line_id)
```

**El estado vive en el movimiento, no solo en la conciliación.** `treasury_movements.
reconciliation_status` con cuatro valores: `unreconciled` · `matched` (emparejado, conciliación
abierta) · `reconciled` (conciliación cerrada) · `disputed`. Y `bank_transactions.status` ya tiene
exactamente esos tres primeros valores en su CHECK: **no hace falta migración ahí**.

**Los cuatro tipos de emparejamiento** que el esquema ya admite y la interfaz no produce:

| Tipo | Caso | Contrapartida |
|---|---|---|
| `movement` | consignación, transferencia, movimiento manual | un `treasury_movements` |
| `payment` | cobro directo a la cuenta bancaria | un `payments` |
| `journal` | comisión bancaria, rendimiento, gravamen — **no hay movimiento previo** | un `journal_lines`, creado **desde la conciliación** |
| `group` | liquidación del procesador: N pagos + comisión = 1 abono | N movimientos y 1 asiento de comisión |

El tipo `journal` es el que hace que la conciliación **cierre de verdad**: hoy una comisión bancaria
del extracto no tiene con qué emparejarse, y la diferencia queda para siempre. Con él, conciliar una
comisión **crea el asiento que faltaba** y cierra la partida. Es la única forma de que el saldo del
extracto y el saldo del libro converjan.

### Q.3 Reglas de cierre

1. Una conciliación **no se puede cerrar con diferencia distinta de cero** salvo que se registre una
   partida de ajuste explícita, con motivo y asiento. Hoy avisa y deja cerrar igual.
2. `difference` y `closing_balance` **se recalculan en la base** —trigger sobre
   `bank_reconciliation_items`—, no en el navegador. Resuelve B-3, y de paso elimina el código
   muerto `recalcularDiferencia`.
3. Al cerrar, **todos los ítems pasan a `reconciled`** y quedan bloqueados; desconciliar exige
   reabrir la conciliación.
4. `opening_balance` se calcula **a `period_start`**, no con el saldo actual (B-5).

---

## R. Corte de saldos y periodo histórico (decisión 2)

**Este documento describe el procedimiento; no lo ejecuta.** La migración de datos la aplicará el
coordinador cuando el dueño fije la fecha de corte.

### R.1 Por qué corte y no saneamiento

Revertir con contrasientos los 2.319 asientos duplicados, más los 382 de IVA invertido y los 235
huérfanos, son semanas de trabajo, y cada contrasiento es una escritura más que puede salir mal
sobre un libro que ya está mal. Conservar el histórico tampoco compra nada: el comparativo con el
año anterior está construido sobre un ingreso inflado al doble, así que **no es una referencia, es
una trampa**. El corte es más barato, más rápido y deja un punto de partida auditable.

### R.2 El procedimiento, en seis pasos

1. **Fijar la fecha de corte** (la fija el dueño; lo natural es el cierre de un mes). Antes de
   fijarla deben estar aplicadas las migraciones del bloque 1 de §S: **si el doble asiento sigue
   generándose, el corte nace sucio al día siguiente**.
2. **Calcular el saldo real por cuenta a esa fecha desde los documentos, no desde el libro.** Es el
   punto clave de la decisión. El origen de cada saldo:

   | Cuenta | Se calcula desde | No desde |
   |---|---|---|
   | Clientes (`1305`) | `accounts_receivable.balance` de las facturas vivas | el mayor |
   | Proveedores (`2105`) | `accounts_payable.balance` | el mayor |
   | Caja (`1105`) | arqueo físico por caja a la fecha de corte | `cash_sessions` |
   | Bancos (`1110`) | **extracto bancario**, no `bank_accounts.balance`, que nunca se movió (§G.1) | la tabla |
   | Inventario (`1435`) | valorización de `stock_levels` × costo vigente en `product_costs` | el mayor |
   | IVA por pagar (`2405`) | recálculo desde `invoice_applied_taxes` del periodo abierto | el mayor, que lo tiene invertido |
   | Ingresos y gastos (`4x`, `5x`, `6x`) | **no se arrastran**: el corte los deja en cero | — |
   | Patrimonio | por diferencia, contra una cuenta de **«Ajuste por corte de saldos»** creada al efecto | — |

3. **Registrar un asiento de apertura por organización**, con `fact_key = 'opening:{fecha_corte}'`,
   fecha igual a la del corte, `source = 'opening_balance'` y una línea por cuenta con saldo. Es el
   único asiento del sistema que puede tener N líneas, así que depende de la RPC de §S migración 27.
4. **Marcar todo lo anterior como periodo histórico.** Propuesta, aditiva:
   `journal_entries.ledger_scope text NOT NULL DEFAULT 'current'` con valores `historical` y
   `current`. El corte hace un `UPDATE` masivo a `historical` de todo lo anterior a la fecha. **No
   se borra ni se modifica ni un asiento**: se etiqueta.
5. **Cerrar los periodos anteriores al corte.** Hoy los 1.090 están abiertos (§E.5). Con
   `fn_is_period_open` corregida (§S, migración 28), eso impide de verdad escribir hacia atrás.
6. **Excluir el histórico de los informes por defecto**, con interruptor para verlo.

### R.3 Qué se conserva y qué se explica al usuario

**Se conserva todo**: los 13.511 asientos siguen ahí, consultables, exportables y auditables. El
mayor, el balance de comprobación y el estado de resultados ganan un selector con tres opciones:
«Desde el corte» (por defecto), «Histórico» y «Todo (no conciliado)».

**El aviso al usuario** —en la cabecera de los cuatro informes y del libro mayor cuando el rango
seleccionado toca el periodo histórico, como `Alert` del kit, no como texto suelto—:

> **Este informe incluye el periodo anterior al corte de saldos del {fecha}.** Los asientos
> anteriores a esa fecha proceden de una contabilización automática con errores conocidos —ingresos
> duplicados e impuestos invertidos— y **no son comparables** con los posteriores. Se conservan para
> consulta y auditoría. Para cifras contables, usa «Desde el corte».

Tres cosas que el aviso hace a propósito: **dice la fecha**, **dice qué estaba mal** —no «hubo
inconsistencias», sino ingresos duplicados e impuestos invertidos— y **ofrece la salida** en la
misma frase, según el patrón 7 de `PATRONES-TRANSVERSALES.md` («todo estado lleva una acción»).

### R.4 Lo que el corte no arregla

El corte deja el **saldo** correcto, no el **detalle**. Sigue sin haber trazabilidad documental para
los 235 asientos huérfanos, y el histórico seguirá sin cuadrar contra los documentos de su época.
Es el precio aceptado de la decisión 2, y conviene que conste por escrito para que nadie lo
descubra dentro de un año.

---

## S. Migraciones propuestas

Todas **aditivas**: columnas NULL-ables o con `DEFAULT`, tablas nuevas, índices nuevos, funciones
nuevas o reemplazadas. Ningún `DROP`, ningún cambio de tipo, ninguna pérdida de dato de cliente.
Cada una con su `.sql` en `supabase/migrations/` y su reversión en `supabase/rollbacks/`, según
`docs/POLITICA-MIGRACIONES.md`.

El orden de los bloques es el que fijó el coordinador el 2026-09-22: **primero parar el doble
asiento, después la caja, luego el modelo unificado y por último el saneamiento con corte.** La
seguridad multi-inquilino va en paralelo al bloque 2 porque no admite espera (§T).

**Bloque 1 — parar el doble asiento (decisión 1)**

| # | Migración | Por qué |
|---|---|---|
| 1 | **Añadir `journal_entries.fact_key text NULL`** + `UNIQUE (organization_id, fact_key) WHERE fact_key IS NOT NULL`, y backfill del `fact_key` de los asientos vivos según la convención de §P.3 | La idempotencia deja de depender del `source`. Es la pieza que impide el doble asiento a futuro **venga de donde venga**, incluidas las cargas retroactivas y el agente de IA. §P.3 |
| 2 | **Retirar el trigger `trg_auto_journal_sale_pos` sobre `sales`**, dejando `fn_auto_journal_sale` sobre `invoice_sales` como **único** origen del asiento de devengo de venta | Elimina la segunda contabilización de ingreso. 2.319 ventas afectadas; 89.403.570 de ingreso inexistente. §E.2, §P.3 |
| 3 | Reescribir `fn_auto_journal_sale` para deducir contado/crédito del **saldo real** (`COALESCE(balance,0) > 0`) en vez de `payment_method = 'credit'`, con respaldo cuando la regla no trae `conditions`, y emitir `fact_key = 'accrual:sale:{sale_id}'` o `'accrual:invoice:{invoice_id}'` | Que el trigger que se conserva no pierda lo que sabía el que se retira, y que no vuelva a fallar en silencio por falta de `conditions`. §E.3, §P.3 |
| 4 | Reescribir `fn_auto_journal_payment` para que el asiento de **cobro** use la **cuenta del sitio donde entró el dinero** y **no toque ingresos**, con `fact_key = 'settlement:payment:{id}'`; y ampliarlo a los `source` hoy ignorados (`sale`, `web_order`) | Elimina la tercera contabilización y recupera 826 pagos que hoy no generan asiento. §E.1, §E.2, decisión 1 regla 2 |
| 5 | Reescribir `fn_auto_journal_cash_movement` para decidir el sentido por **`NEW.type`** y no por el signo del importe | Todo egreso de caja está contabilizado al revés. §D.1 |
| 6 | Reescribir `fn_auto_journal_bank_transfer` para usar `credit_account_code` en el crédito y resolver la cuenta de cada lado desde la cuenta bancaria; añadir contrasiento al anular | El asiento de transferencia es nulo por construcción y la anulación no revierte. §G.2 |
| 7 | Añadir a `fn_create_journal_entry` la validación `p_debit_account <> p_credit_account` y **registrar los rechazos** en una tabla `journal_entry_failures` en lugar de `RAISE NOTICE` | La contabilidad falla hoy en silencio. §C, C-1 |
| 8 | Retirar `idx_journal_entries_unique_source`, sustituido por el índice de `fact_key` de la migración 1 | Hoy es un cerrojo cross-tenant y no evita el duplicado real. §D.4 |

**Bloque 2 — la caja: sesión, índice y cierre forzado (decisión 3)**

| # | Migración | Por qué |
|---|---|---|
| 9 | **`payments.cash_session_id integer NULL`** con FK a `cash_sessions` e índice `(cash_session_id)` | Hoy la pertenencia se deduce por rango de fechas. Es lo que evita que una sesión abandonada contamine a las demás. §F.3 |
| 10 | Backfill de `payments.cash_session_id` por el criterio actual (fechas + sucursal + cajero), **registrando los ambiguos** en lugar de adivinar. Los 74 pagos de la sesión 44 que solapan con las sesiones 76 y 77 son exactamente el caso ambiguo | Que la columna nazca útil sin inventar datos. §F.4 |
| 11 | **`CREATE UNIQUE INDEX CONCURRENTLY uq_cash_sessions_abierta_cajero ON cash_sessions (organization_id, branch_id, opened_by) WHERE status = 'open'`** | Prohíbe dos cajas del mismo cajero. **Se puede crear ya**: verificado que ninguna de las 15 sesiones abiertas lo viola. §F.4 |
| 12 | **`cash_sessions.closed_reason text`** (`normal`/`assisted`/`forced`/`auto`), **`forced_by uuid`**, **`forced_reason text`**, todas NULL-ables | Cierre asistido y forzado con rastro de quién y por qué. §P.5 |
| 13 | Ajustes de organización `cash_session_stale_hours` (por defecto 18) y `cash_session_auto_close_hours` (apagado) en `organization_settings` | Umbral del aviso de caja vencida y del cierre automático opcional. §P.5 |
| 14 | **`CREATE UNIQUE INDEX uq_cash_sessions_abierta_sucursal ON cash_sessions (organization_id, branch_id) WHERE status='open'`**, para las organizaciones en modo `branch` y **después** de cerrar las tres sesiones de la sucursal 117 desde la pantalla de cajas abandonadas | El de modo `branch` es más estricto y hoy ya se viola. §F.4, §P.5 |
| 15 | Índice `payments (organization_id, branch_id, method, created_at)` | La consulta del resumen de caja no tiene índice que la sostenga. §F.3 |
| 16 | **`cash_sessions.account_code text NULL`** y **`bank_accounts.account_code text NULL`**, con FK lógica a `chart_of_accounts` | Para que el asiento de cobro use la cuenta del sitio donde está el dinero. Decisión 1 regla 3 |
| 17 | Reglas contables nuevas `cash_session/overage` y `cash_session/shortage` en `fn_create_default_accounting_rules`, y usarlas en `fn_auto_journal_cash_session` con `fact_key = 'cash_diff:session:{id}'` | Hoy toma «la primera regla `cash_movement` por prioridad», sin distinguir sobrante de faltante. §F.5 |
| 18 | **`branches.cash_session_mode text NULL`** (NULL = heredar de la organización) | Permite mostrador único y sala de cajeros en la misma organización. §P.4 |
| 19 | Añadir `cash_sessions` a la publicación `supabase_realtime` | El tiempo real de cajas es un no-op, lo que agrava el solapamiento. §F.8 |

**Bloque 3 — el modelo unificado**

| # | Migración | Por qué |
|---|---|---|
| 20 | **Tabla `treasury_movements`** con el esquema de §O.2, su RLS por pertenencia + sucursal, e índices por `(organization_id, branch_id, movement_date)` y por `transfer_group_id` | El concepto que falta. §O.2 |
| 21 | Triggers de proyección desde `payments`, `cash_movements` y `bank_transactions` hacia `treasury_movements` | Migración sin corte: las pantallas viejas siguen funcionando |
| 22 | **`treasury_movements.reconciliation_status`** y trigger que lo sincronice con `bank_reconciliation_items` | El estado por movimiento que pide el encargo. §Q.2 |
| 23 | Función `fn_register_transfer(...)` que cree las dos patas y el asiento en **una transacción**, con `fact_key = 'transfer:{transfer_group_id}'` | Hoy el traslado no es atómico y no tiene rollback. §G.1 |
| 24 | **Función `fn_bank_account_balance(p_bank_account_id)`** que derive el saldo de `initial_balance + Σ movimientos`, más trigger que mantenga la columna | `update_bank_balance` **no existe** y `balance` nunca se mueve. §G.1 |
| 25 | Backfill de `bank_accounts.balance` desde esa función | Las 3 cuentas tienen saldo congelado |
| 26 | **`journal_entries.status text NOT NULL DEFAULT 'posted'`** (`draft`/`posted`/`voided`) y `reversal_of_id` | Hoy `posted` es booleano y **no existe «anulado»**: solo borrado físico. §J, C-11 |
| 27 | **RPC transaccional `fn_create_manual_journal_entry(jsonb)`** con N líneas, validación de cuadre, de cuentas y de periodo | El alta manual son dos `insert` sin transacción y esquiva la validación de periodo. Es también la que registra el asiento de apertura del corte (§R.2 paso 3) |
| 28 | Reescribir `fn_is_period_open` para que **falle cerrado** cuando no encuentra periodo y considere todos los `period_type` | Hoy permite todo, y sin esto el paso 5 del corte no sirve de nada. §E.5, §R.2 |
| 29 | Índice de exclusión por **solapamiento de fechas** en `fiscal_periods` | Con periodos solapados, `fn_is_period_open` es no determinista. §E.5 |

**Bloque 3 bis — seguridad multi-inquilino (en paralelo al bloque 2; no espera al rediseño)**

| # | Migración | Por qué |
|---|---|---|
| 30 | **`payment_methods.organization_id integer NULL`** (NULL = catálogo del sistema), backfill de las 16 filas no-sistema a su organización, y políticas RLS que exijan coincidencia | 61 organizaciones comparten `wompi` y cualquiera puede borrarlo. §M.2 |
| 31 | **Eliminar `temp_allow_all_taxes` y `Allow anon select organization_taxes`**, y reescribir las otras dos para que usen `organization_members` en vez de `auth.jwt()->>'organization_id'` | Aislamiento anulado. §M.3 |
| 32 | **Eliminar `Allow anon select payment_methods`** (`qual = true`, rol `public`) | §M.2 |
| 33 | Políticas RLS por **cargo** sobre `journal_entries`, `journal_lines`, `chart_of_accounts` y `accounting_rules`: escritura solo para quien tenga el permiso contable | Hoy cualquier miembro puede borrar asientos. §M.4 |
| 34 | Reescribir `app_branch_access` para que no falle-abierto con `branch_id IS NULL` ni con miembro sin asignaciones, y **resolver el rol por permiso, no por nombre** | Regla 6 de `CLAUDE.md`. §M.5 |

**Bloque 4 — impuestos**

| # | Migración | Por qué |
|---|---|---|
| 35 | **Conectar `tax_account_mapping`**: leerla en la generación del asiento con prioridad sobre `accounting_rules.tax_account_code`, respetando `account_type` (`tax_payable` / `tax_receivable`) | 288 filas pobladas y ningún lector. §E.4 |
| 36 | **`organization_taxes.tax_kind text NULL`** (`generated`/`deductible`/`withholding`) y `account_code` | Hoy IVA generado y descontable caen en la misma cuenta. §E.4 |
| 37 | Ampliar la generación de asientos a **N líneas de impuesto** (vía la RPC de la migración 27) | Máximo real hoy: 3 líneas por asiento, 0 con más. §C-2 |
| 38 | Cuentas `2408` y `2365/2367/2368` en `fn_create_default_chart_of_accounts` | No existen en el plan sembrado. §E.4 |

**Bloque 5 — el corte de saldos (decisión 2; la aplica el coordinador con la fecha del dueño)**

| # | Migración | Por qué |
|---|---|---|
| 39 | **`journal_entries.ledger_scope text NOT NULL DEFAULT 'current'`** (`current`/`historical`) con índice `(organization_id, ledger_scope, entry_date)` | Etiquetar el periodo histórico sin borrar ni modificar un solo asiento. §R.2 paso 4 |
| 40 | Cuenta **«Ajuste por corte de saldos»** en `fn_create_default_chart_of_accounts` y en las 84 organizaciones existentes | Contrapartida por diferencia del asiento de apertura. §R.2 paso 2 |
| 41 | Función `fn_compute_opening_balances(p_organization_id, p_cutoff_date)` que calcule el saldo por cuenta **desde los documentos**, y devuelva el resultado **sin escribir** | Que el corte sea revisable antes de aplicarse. §R.2 paso 2 |
| 42 | Migración de datos del corte: asiento de apertura por organización con `fact_key='opening:{fecha}'`, `UPDATE` masivo a `ledger_scope='historical'` y cierre de los periodos anteriores | **No se ejecuta en esta tanda.** Requiere la fecha del dueño y los bloques 1 y 2 aplicados. §R.2 |

**Bloque 6 — saneamiento y deuda**

| # | Migración | Por qué |
|---|---|---|
| 43 | Corregir el CHECK de `invoice_items` para admitir `invoice_type='support_document'` con `support_document_id NOT NULL` | El alta de documento soporte rompe el CHECK y deja huérfanos. §K, D-1 |
| 44 | Triggers de contabilidad para `support_documents` (asiento + cuenta por pagar) | Un gasto declarado que el libro no registra. §K, D-2 |
| 45 | Ampliar `fn_auto_journal_refund` a `status='processed'` | Los reembolsos del POS no generan asiento. §E.1 |
| 46 | Índices `journal_entries (organization_id, entry_date)` y `journal_lines (organization_id, account_code)` | Los cuatro informes traen todas las líneas al navegador. §J, C-10 |

---

## T. Prioridades por riesgo contable

Orden fijado por el coordinador el 2026-09-22, sobre las tres decisiones.

**Prioridad 1 — parar el doble asiento.** Migraciones 1-8. Dentro del bloque, el orden importa:
primero la **clave natural** (migración 1), porque sin ella retirar un trigger solo tapa el síntoma
y cualquier reproceso vuelve a duplicar; después la retirada del trigger del POS y el traspaso de lo
que sabía (2, 3); después el cobro (4), que es donde aterriza la decisión 1; y por último los
asientos invertidos y el fallo silencioso (5-7). Aquí entra también, aunque sea corrección de código
y no migración, **el saldo final del balance de comprobación** (§J, C-16b), que resta dos veces el
crédito del periodo en las cuentas de activo.

**Hasta que esto se cierre, ningún informe financiero de GO Admin es utilizable**: el estado de
resultados sobreestima el ingreso en más del doble, el IVA por pagar está subestimado por el mismo
importe que se contabilizó al revés, y el balance de comprobación tiene un error de cálculo propio
encima. **Y mientras no se cierre, no tiene sentido fijar la fecha de corte** (§R.2 paso 1): el
corte nacería sucio al día siguiente.

**Prioridad 2 — la caja, y la seguridad en paralelo.**

- *Caja*: migraciones 9-19, en ese orden. Primero `cash_session_id` y su relleno, que es lo que hace
  que una sesión abandonada deje de contaminar a las demás; después el índice de cajero (11), que
  **se puede crear hoy mismo sin romper nada**; después el cierre forzado y su pantalla (12-13, más
  §P.5); y solo al final el índice de sucursal (14), que exige haber cerrado antes las tres sesiones
  de la sucursal 117. Sin esto, cada arqueo es una aproximación y hay sesiones de hace 426 días
  contando pagos que no son suyos.
- *Seguridad*: migraciones 30-34, más las correcciones de código de §M.1 (IDOR con service role en
  10 endpoints) y §M.2 (borrado global de métodos de pago). Son **fugas entre inquilinos en una base
  con 84 organizaciones**; no admiten esperar detrás de una reestructuración de producto, y no
  dependen de ninguna de las tres decisiones.

**Prioridad 3 — el modelo unificado y la estructura que pide el encargo.** Migraciones 20-29 y
35-38, más la jerarquía de pantallas de §O.3 y la conciliación de §Q. Es el trabajo grande y el que
de verdad resuelve «ingresos, egresos, bancos, conciliaciones y transferencias no están bien
estructurados». Se puede hacer sin prisa **porque las prioridades 1 y 2 ya habrán detenido el
daño**.

**Prioridad 4 — el corte, y solo entonces.** Migraciones 39-42. El corte es lo **último**, no lo
primero, y es deliberado: necesita que el doble asiento esté parado (prioridad 1), que la caja
tenga cifras fiables para arquear (prioridad 2) y que exista la RPC de asiento con N líneas
(migración 27, prioridad 3). Aplicarlo antes sería fijar un saldo de apertura calculado sobre un
sistema que sigue escribiendo mal.

**Prioridad 5 — saneamiento y deuda.** Migraciones 43-46, retirada del código muerto de §N, y la
decisión sobre activos fijos, presupuestos y centro de costos: o se completan, o salen del menú. Hoy
prometen una funcionalidad que no existe.

**Una nota sobre el orden.** La tentación será empezar por el rediseño de pantallas, que es lo
visible. Sería un error: las pantallas nuevas leerían los mismos números falsos. El orden correcto
es *parar el doble asiento → sostener la caja → reestructurar → cortar → dibujar*.

---

# PARTE 3

## U. Diseño: qué queda para la siguiente tanda

**No se diseñó nada en Figma en esta tanda, y es deliberado.** El análisis ocupó el presupuesto
completo, y dibujar «Ingresos», «Egresos» y «Transferencias» como tres pantallas separadas —que es
lo que existe hoy— habría consolidado en el sistema de diseño justo la estructura que este documento
propone fusionar. Dibujar antes de decidir habría sido trabajo para tirar.

**Lo que queda pendiente, con su dependencia:**

| Entregable | Depende de |
|---|---|
| `07 Finanzas` › «Movimientos» (lista unificada + 3 altas) con sus 4 estados y sus diálogos | que el dueño acepte la fusión de §O.3 |
| `07 Finanzas` › «Cuentas de dinero» (cajas + bancos en una lista) | que el dueño acepte incluir cajas |
| `07 Finanzas` › «Conciliación» (detalle con estado por movimiento y los 4 tipos de emparejamiento) | §Q.2 |
| `docs/design/PARIDAD-TESORERIA.md` | los tres anteriores |
| Capturas `docs/design/figma/28-tesoreria-*.png` | ídem |

Los componentes que reutilizarían —`DocumentHeader`, `DocumentStatusBadge`, `DocumentLinesTable`,
`DocumentTotals`, `AplicarPagoDialog`, `SupplierPicker`, `CustomerPicker`— y la norma de
`PATRONES-TRANSVERSALES.md` (patrones 1 a 12, todos aplican a `07 Finanzas`) siguen vigentes sin
cambios.

## V. Qué quedó fuera de este documento

Por el orden de prioridad que fijaba el encargo, y para que conste:

1. **La lista control por control** de las 43 pantallas de los bloques A a D: ya está en
   `AUDITORIA-CONTROLES-FINANZAS.md` §C, §D, §E y §F, y repetirla habría duplicado 1.400 líneas.
   Aquí se citan.
2. **Comisiones, saldos a favor, cotizaciones y notas de crédito**: quedan fuera del recorte de
   tesorería y contabilidad que pedía el encargo, aunque `commissions` tiene 230 asientos y
   `fn_auto_journal_commission` es de las pocas funciones **sin** `SECURITY DEFINER` —conviene
   mirarlo en la siguiente tanda—.
3. **Los verticales que también contabilizan**: PMS (folios), parqueaderos, membresías, nómina,
   transporte y envíos suman 14 de los 44 triggers `trg_auto_journal_*`. Se listan en §D pero no se
   auditaron: cada uno merece su propia revisión, y varios comparten el patrón de duplicación de
   §E.2 (`fn_auto_journal_folio_item` + `fn_auto_journal_folio_close` + `fn_auto_journal_folio_payment`
   sobre el mismo folio).
4. **El detalle de Open Finance y PayFac como producto**: se auditó su capa de datos y su seguridad
   (§I, §M.1), no su propuesta de valor ni su encaje en el plan.
5. **`stock_movements`**, que con 3.630 asientos es el mayor generador de contabilidad del sistema y
   pertenece a inventario, no a tesorería.
