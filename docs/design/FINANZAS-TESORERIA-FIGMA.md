# Finanzas — Tesorería: estado real, propuesta de diseño y lo que falta para que funcione

Fecha: 2026-09-23. Bloque **Tesorería** del encargo «analiza todas las páginas de Finanzas y
dibújalas en Figma»: ingresos, egresos, transferencias, bancos (cuentas, movimientos, tesorería
consolidada, anomalías), conciliación bancaria, Open Finance, PayFac, saldos a favor, métodos de
pago (y sesiones QR) y monedas.

- Código leído en `C:\Users\USUARIO\CascadeProjects\go-admin-erp` (rutas relativas a `src/`).
  No se tocó código, esquema ni se hizo commit.
- BD: solo `SELECT` de conteos y catálogo (`pg_proc`, `pg_policies`, `pg_constraint`,
  `information_schema`) por el MCP de Supabase, proyecto `jgmgphmzusbluqhuqihj`. Sin datos
  personales ni nombres de organización.
- Punto de partida, **no repetido aquí**: `AUDITORIA-TESORERIA-CONTABILIDAD.md` (arquitectura §O–§Q,
  pendientes §U) y `AUDITORIA-CONTROLES-FINANZAS.md` §C.6–C.15, §D.1–D.13, §F.2 (control por
  control). Este documento solo **re-verifica contra el código y la BD de hoy** y convierte la
  propuesta en una especificación de pantallas.

> ## ⚠ Figma: no se dibujó nada en esta ronda
>
> La primera llamada al MCP de Figma de esta sesión (`get_metadata` del archivo, y a continuación
> un `use_figma` de solo lectura) devolvió **«You've reached the Figma MCP tool call limit for your
> Full seat on the Professional plan»**. El cupo ya estaba agotado cuando empezó este agente.
> **Cero llamadas de escritura, cero nodos creados o modificados, cero capturas.** El archivo
> `EAvjINVRnlzFM70GVoWXgl` queda exactamente como estaba; no hay nada a medias que limpiar.
>
> Para no perder la ronda, §4 deja la **especificación de construcción completa** (secciones,
> frames, estados, componentes a instanciar, datos ficticios y orden de llamadas) para que la
> siguiente sesión con cupo la ejecute en ~8 llamadas grandes sin volver a analizar.

---

## 1. Estado real por página (verificado hoy)

Leyenda: **Funciona** · **A medias** (se usa, pero algo importante falla o miente) · **Roto** (la
acción principal falla siempre) · **Inerte** (la pantalla carga, pero no hay con qué operarla).

### 1.1 Tabla resumen

| # | Página (ruta `/app/finanzas/…`) | Estado | Lo que falla hoy (archivo:línea) | BD hoy |
|---|---|---|---|---|
| 1 | `ingresos` (lista, alta, detalle) | **A medias** | Alta desde **Caja** usa *la última sesión abierta de toda la organización*, sin sucursal ni cajero (`lib/services/movimientosService.ts:214-225`). **Anular** inserta `type:'expense'/'income'` contra el CHECK `('in','out')` → falla siempre (`movimientosService.ts:401`). «Importar» sin `onClick` (`components/finanzas/ingresos/IngresosPage.tsx:184-187`). Detalle: «Origen» siempre «Caja» y badge «Confirmado» fijo. Alta desde **Banco** inserta y contabiliza, pero **no mueve el saldo** de la cuenta | `cash_movements` 5 filas; 15 sesiones de caja abiertas; `bank_transactions` 2 |
| 2 | `egresos` (lista, alta, detalle) | **A medias** | Gemela de ingresos: mismos defectos. Sin validación de saldo disponible | ídem |
| 3 | `transferencias` (lista, alta, detalle) | **A medias** | El saldo **nunca se mueve**: llama a la RPC `update_bank_balance`, que **no existe**, y el camino alternativo no se envía (`lib/services/transferenciasService.ts:190`, `:213`). La validación «Saldo insuficiente» compara contra un saldo congelado. Anular: `update` sin filtro de organización (`:253-263`). **Corregido desde la auditoría:** el asiento ya no es nulo — `fn_auto_journal_bank_transfer` usa débito destino / crédito origen y la anulación genera contra-asiento con `fact_key 'transfer:bank:{id}:void'` | `bank_transfers` 1 fila, 0 asientos con `source='bank_transfers'` |
| 4 | `bancos` (lista de cuentas) | **A medias** | Los saldos son `initial_balance` para siempre: **3 de 3 cuentas con `balance = initial_balance`**. «Exportar» sin `onClick`. Widget «Saldo real» hace una llamada por tarjeta a `/real-balance` (IDOR, ver #9) | `bank_accounts` 3 filas en 2 organizaciones; `account_code` existe y está vacío en las 3 |
| 5 | `bancos/cuentas/nuevo` | **Funciona** | Catálogo de bancos cableado en el archivo; «investment» sin etiqueta en el resto | — |
| 6 | `bancos/cuentas/[id]` (detalle) | **A medias** | «Editar» (`?edit=true`) no lo lee nadie; «Importar extracto» sin `onClick` (`components/finanzas/bancos/cuentas/CuentaDetailPage.tsx:362-368`); número de cuenta completo sin permiso; «Nueva conciliación» no preselecciona la cuenta | — |
| 7 | `bancos/cuentas/[id]/movimientos` | **Roto** (alta) | «Nuevo movimiento» inserta `status:'pending'` y el CHECK solo admite `unmatched/matched/reconciled` → **falla siempre** (`components/finanzas/bancos/BancosService.ts:285`). «Importar CSV» y «Exportar» sin `onClick` (`MovimientosPage.tsx:178-185`). Filtro «Pendientes» compara un valor que el CHECK no admite | CHECK verificado en `pg_constraint` |
| 8 | `bancos/tesoreria` (consolidada) | **A medias** | Muestra saldos congelados; solo COP y USD cableados; **IDOR**: `?organizationId=` del cliente + service role (`app/api/integrations/open-finance/treasury/route.ts:22-40`, y `/projection`, `/alerts`, `/concentration`). Hay cambios sin commitear de otra sesión (fechas) en `TesoreriaPage.tsx` | — |
| 9 | `bancos/anomalias` | **A medias** | «Resolver» solo hace `console.log` (`lib/services/integrations/openFinance/anomalyDetectionService.ts:614-624`); IDOR en `/anomalies` | — |
| 10 | `conciliacion-bancaria` (lista, nueva, detalle) | **A medias** | Crear y emparejar funcionan. **Deshacer un emparejamiento** borra el ítem y luego pone la transacción en `'pending'` (CHECK) sin revisar el error → queda `matched` sin ítem (`BancosService.ts:540-543`). `difference`/`closing_balance` nunca se persisten (`ConciliacionService.recalcularDiferencia:223` sin llamadas). `opening_balance` = saldo actual, no al inicio del periodo (`NuevaConciliacionForm.tsx:71`). Cierra con diferencia ≠ 0. No toca contabilidad. «Sugerencias IA» es una tabla de umbrales, no IA | `bank_reconciliations` 0 · ítems 0 |
| 11 | `open-finance` y `open-finance/consents` | **Inerte** | No existe interfaz para **conectar un banco** ni para dar un consentimiento (`ConsentBanner.tsx` huérfano). IDOR en `/real-balance`, `/anomalies`, `/treasury*`, `/payment-history`. Cambios sin commitear de otra sesión en `open-finance/page.tsx` | `open_finance_links` 0 · `accounts` 0 · `transactions` 0 · `consents` 0 |
| 12 | `payfac/cuentas` | **Roto** (alta) | El formulario envía `bank_name`, `account_number`… en snake_case y la API exige `bankName`, `accountNumber`… (`app/app/finanzas/payfac/cuentas/page.tsx:98-113` vs `app/api/integrations/payfac/payout-accounts/route.ts:81-110`) → **alta falla siempre**. Badge lee `account.verified` y la columna es `is_verified` (`cuentas/page.tsx:434`). Eliminar sin confirmación y `DELETE /payout-accounts/[id]` sin guarda de organización | `organization_payout_accounts` 0 |
| 13 | `payfac/dispersiones` | **Roto** | Asigna `await res.json()` directo cuando la API responde `{success, data}` (`dispersiones/page.tsx:147, 170, 187`) → KPIs en 0 y `payouts.map is not a function` con datos. `POST /payfac/payouts` sin `verifyPlatformAdmin` | `organization_payouts` 0 |
| 14 | `saldos-a-favor` | **Funciona** | Crear (`fn_create_customer_credit`) y aplicar (`fn_apply_customer_credit`) van por RPC con asiento (2805, ya presente en los 85 planes). Falta: buscador de cliente (select sin límite), detalle del saldo, historial, filtros, exportación; el diálogo expone «(1110)/(1105)» | `credit_notes` 4 activas · aplicaciones 0 |
| 15 | `metodos-pago` | **A medias** | Listar, activar, visibilidad web y orden funcionan. **Eliminar borra la fila global** de `payment_methods` para todas las organizaciones (`components/finanzas/metodos-pago/PaymentMethodsList.tsx:527-529`); editar renombra la global (`PaymentMethodForm.tsx:304-309`). El **mapeo contable no lo lee nadie**: 0 de 280 filas lo tienen y los triggers usan `accounting_rules` | `payment_methods` 30 (sin `organization_id`) · `organization_payment_methods` 280 en 85 orgs. **Corregido:** la política `Allow anon select` ya no existe |
| 16 | `metodos-pago/qr-sessions` | **Inerte** | Pantalla correcta, sin datos; única entrada es una notificación | `payment_qr_sessions` 0 |
| 17 | `monedas` | **A medias** | Tasas al día (cron global funciona). `currencyService.getBaseCurrency` devuelve **`'USD'` cableado** (`lib/services/currencyService.ts:44-75`) y lo usan el CRM (`ForecastView.tsx:86`, `MonthlyForecastView.tsx:58`). Clave `NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY` en el paquete del navegador (`lib/services/openexchangerates.ts:137, 244, 609`). No hay forma de corregir una tasa a mano. Cambios sin commitear de otra sesión en 3 componentes de monedas | `currency_rates` 2.810 filas, última `2026-09-23` · `exchange_rates` 28 · `organization_currencies` 75. **Corregido:** `exchange_rates` ya tiene políticas por pertenencia |

**Recuento:** 2 funcionan · 10 a medias · 3 rotas · 2 inertes.

### 1.2 Qué cambió desde las auditorías del 22-sep (para no repetir hallazgos cerrados)

| Hallazgo de la auditoría | Hoy |
|---|---|
| §G.2 asiento de transferencia nulo (misma cuenta a los dos lados) | **Corregido** en la función: débito destino, crédito origen, contra-asiento al anular con `fact_key` |
| §B.2 `fn_auto_journal_cash_movement` ignora `NEW.type` | **Corregido**: decide `v_debito/v_credito` por tipo y usa `fact_key 'cash_move:{id}'` |
| §M.2 `Allow anon select payment_methods` con `qual=true` | **Retirada**. Siguen las políticas de UPDATE/DELETE por código compartido: el borrado global sigue siendo posible |
| §M.3 `organization_taxes` con `temp_allow_all_taxes` | **Corregido**: una sola política `organization_taxes_miembros` por pertenencia |
| §H.2 #28 «`deposit` y `unmatched` fuera del CHECK» (Ingresos → Banco) | **Era incorrecto**: ambos valores están en el CHECK; el alta bancaria de Ingresos/Egresos funciona. El que viola el CHECK es `'pending'` (Bancos › Movimientos y deshacer conciliación) |
| `bank_accounts.account_code` | **Nuevo**: la columna existe (base de la regla 3 de §P.2 «la cuenta contable sale del sitio del dinero»), vacía en las 3 cuentas |
| Todo lo demás de §G.1, §I (B-1…B-12), §M.1 (IDOR), A-1…A-10 | **Sigue igual**, verificado arriba |
| `journal_entry_failures` | 102 filas registradas hoy (no auditadas en este bloque; son de contabilidad) |

---

## 2. Decisión de estructura para el diseño

La auditoría §O.3 propone **fusionar** Ingresos, Egresos y Transferencias en «Movimientos», renombrar
Bancos a «Cuentas de dinero» con cajas y bancos juntos, llevar Open Finance y PayFac a Integraciones y
Saldos a favor a una pestaña de Cuentas por cobrar. El dueño pidió **una Sección por página**. Las dos
cosas son compatibles y así se especifica:

- Las Secciones «Tesorería — Ingresos / Egresos / Transferencias» dibujan **la misma pantalla
  «Movimientos»** con el chip de tipo preseleccionado, más **su alta propia** (los tres formularios sí
  son distintos). Así la ruta vieja sigue teniendo su diseño y el código implementa una sola lista.
- Se dibuja un **mapa de navegación** con el menú propuesto (§4.0).

Menú propuesto del grupo **Tesorería** (sale del catálogo único de navegación; no se cablea):

| Entrada | Ruta nueva | Rutas actuales que absorbe |
|---|---|---|
| Movimientos | `/app/finanzas/tesoreria/movimientos` | `ingresos`, `egresos`, `transferencias` (redirigen con `?tipo=`) |
| Cuentas de dinero | `/app/finanzas/tesoreria/cuentas` | `bancos`, `bancos/cuentas/*`, `bancos/tesoreria` (pestaña «Posición»), `bancos/anomalias` (pestaña «Alertas»), y las cajas del POS en lectura |
| Conciliación | `/app/finanzas/tesoreria/conciliacion` | `conciliacion-bancaria/*` |
| Configuración › Métodos de pago | `/app/finanzas/metodos-pago` | + `qr-sessions` como pestaña «Cobros QR» |
| Configuración › Monedas y tasas | `/app/finanzas/monedas` | 4 pestañas → 3 (Monedas · Tasas · Histórico); «Preferencias» se funde en Monedas |
| Integraciones › Open Finance | `/app/integraciones/open-finance` | `open-finance`, `open-finance/consents` |
| Integraciones › PayFac | `/app/integraciones/payfac` | `payfac/cuentas`, `payfac/dispersiones` |
| Cartera › Cuentas por cobrar › pestaña «Saldos a favor» | — | `saldos-a-favor` |

---

## 3. Componentes: qué se reutiliza y qué hay que crear

Reutilizar tal cual (instancias, nunca desacopladas): shell nuevo (`AppHeader`, `Sidebar`,
`MobileHeader`, `MobileTabBar`), `DataTable`/`TableCell`, `FilterPanel`, `Chip`, `Badge` (tonos de
`SISTEMA-BADGES.md`), `EmptyState`, `Skeleton`, `Pagination`, `BulkActionBar`, diálogos
`Layout=desktop|sheet`, tarjeta móvil de «Móvil · Proveedores — listo», y de `02 Componentes ›
Finanzas`: `DocumentHeader`, `DocumentStatusBadge`, `AplicarPagoDialog` (para «pago de documento»),
`SupplierPicker`, `CustomerPicker`. Cadena de documentos: `CadenaDocumento` / `ChipDocumento` de
`02 Componentes › POS — Ventas (Nuevo)` (existencia por confirmar en la próxima lectura del archivo).

Crear en `02 Componentes › Finanzas` (variantes, no copias):

| Componente nuevo | Ejes | Para qué |
|---|---|---|
| `MovimientoTipoBadge` | `Tipo` ingreso · egreso · traslado salida · traslado entrada · pago de documento | Tono: éxito · peligro · info · info · neutro. Sustituye los `<span>` crudos «Caja/Banco» |
| `ConciliacionEstadoBadge` | `Estado` sin conciliar · emparejado · conciliado · en disputa | Los 4 valores de §Q.2 |
| `CuentaDineroCard` | `Tipo` banco · caja × `Estado` activa · inactiva · vencida (caja abandonada) × `Layout` desktop · mobile | Una tarjeta para bancos y cajas en «Cuentas de dinero» |
| `AsientoEnlazado` | `Estado` generado · pendiente · falló · no aplica | Bloque de detalle: número de asiento, fecha contable, 2–4 líneas D/C y enlace «Ver asiento». «Falló» enlaza a `journal_entry_failures` |
| `MovimientoForm` | `Tipo` ingreso · egreso · traslado × `Layout` desktop · sheet × `State` default · error · sin caja abierta | Las tres altas, con el mismo esqueleto |
| `EmparejarPanel` | `Tipo` movimiento · pago · asiento · grupo × `State` sugerido · seleccionado | Los 4 tipos de emparejamiento de §Q.2 |
| `TasaDelDiaRow` | `Fuente` API · manual × `Estado` vigente · vencida | Fila de tasa con fuente, fecha contable y autor |

---

## 4. Especificación de construcción (lista para ejecutar con cupo)

Todas las Secciones en `07 Finanzas`, a la derecha de las existentes; escritorio 1440 × auto y móvil
390 × auto; tokens Light/Dark del archivo; Inter. Anotaciones **fuera** de los frames, dentro de la
Sección. Datos ficticios (organización «Tienda Demo», sucursal «Centro», COP).

Estados estándar por lista: **listo · cargando (Skeleton) · vacío con primer paso (EmptyState + CTA)
· sin resultados (EmptyState + «Limpiar filtros») · error (banner no bloqueante + «Reintentar», nunca
$0) · sin permiso (EmptyState candado, «Pide a un administrador el permiso Tesorería»)**.

### 4.0 Sección «Tesorería — Mapa de navegación»
1 frame 1440: el `Sidebar` con el grupo Tesorería propuesto (§2) a la izquierda y un diagrama de
cajas: Movimientos ↔ Cuentas de dinero ↔ Conciliación ↔ Contabilidad (asiento), con la cadena
`caja → consignación → banco → extracto → conciliación → asiento`, y tabla «ruta vieja → ruta nueva».

### 4.1 «Tesorería — Ingresos» (= Movimientos, chip «Ingresos»)
- Escritorio: listo · cargando · vacío («Registra tu primer ingreso: aportes, préstamos, sobrantes de
  caja» + botón «Nuevo ingreso») · sin resultados · error · sin permiso · `FilterPanel` abierto
  (Tipo, Cuenta de dinero, Sucursal, Fecha contable desde/hasta, Estado de conciliación, Estado).
- Columnas `DataTable`: Fecha · Número (`ING-000123`) · Tipo (`MovimientoTipoBadge`) · Concepto y
  contraparte · Cuenta de dinero (Caja «Centro · sesión 482» / «Bancolombia ··4321») · Importe
  (derecha, con moneda) · Conciliación (`ConciliacionEstadoBadge`) · Asiento (`CE-004512` o «—») · ⋯
- KPIs (4): Entradas del mes · Salidas del mes · Neto · Por conciliar (n y $).
- Detalle (hoja lateral desktop / página móvil): cabecera con número, badge de estado, importe;
  datos; **`AsientoEnlazado`** (1105 Caja D / 4295 Otros ingresos C); **`CadenaDocumento`**
  (sesión de caja → movimiento → asiento → conciliación); historial; acciones «Anular con motivo»
  (diálogo, no `window.prompt`) y «Duplicar».
- Diálogo **Nuevo ingreso** (`MovimientoForm Tipo=ingreso`): Sucursal · Cuenta de dinero (caja
  abierta **de esta sucursal y de este cajero** o cuenta bancaria) · Fecha contable (día de la
  organización) · Concepto · Contraparte opcional (`CustomerPicker`/`SupplierPicker`/interno) ·
  Cuenta contable de contrapartida (solo resultado/patrimonio/pasivo; nunca 1305) · Importe ·
  Soporte adjunto · Notas. Estado «sin caja abierta» con enlace «Abrir caja».
- Móvil 390: lista en tarjetas (patrón Proveedores), filtros en sheet, detalle, diálogo en sheet.

### 4.2 «Tesorería — Egresos»
Igual a 4.1 con chip «Egresos» y `MovimientoForm Tipo=egreso`: añade **validación de saldo
disponible** (aviso «El egreso supera el efectivo esperado de la caja: $ 180.000») y proveedor o
empleado como contraparte. Asiento de ejemplo: 5195 Diversos D / 1105 Caja C.

### 4.3 «Tesorería — Transferencias» (traslados)
Lista con chip «Traslados» y columnas Origen → Destino. Diálogo **Transferencia entre cuentas**
(`MovimientoForm Tipo=traslado`): Origen y destino entre **cajas y bancos** (incluye «Consignación de
caja a banco»), saldo disponible **real** del origen, importe, **comisión o GMF** (con cuenta de
gasto 5305), moneda y tasa si difieren, fecha contable, referencia, soporte. Resumen: «Sale $ 1.004.000
de Caja Centro · entra $ 1.000.000 en Bancolombia ··4321 · comisión $ 4.000». Detalle con las dos
patas, `AsientoEnlazado` (1110 D 1.000.000 · 5305 D 4.000 / 1105 C 1.004.000) y anulación con
contra-asiento.

### 4.4 «Tesorería — Bancos y cuentas» (= Cuentas de dinero)
Rejilla de `CuentaDineroCard` (bancos + cajas), KPIs (Disponible total por moneda · En bancos · En
cajas · Por conciliar), pestañas **Cuentas · Posición (tesorería consolidada) · Alertas (anomalías con
resolución persistida)**. Estados completos + caja «Vencida 239 h» con acción «Cerrar con arqueo».
Diálogo **Nueva cuenta bancaria**: nombre, banco (catálogo), tipo, número (enmascarado), moneda,
**cuenta contable** (`account_code`, 1110xx), sucursal, saldo inicial **con fecha de corte**.
Móvil: tarjetas apiladas.

### 4.5 «Tesorería — Detalle de cuenta bancaria y movimientos»
Cabecera con saldo en libro, saldo según banco (si hay Open Finance) y diferencia; tabs
**Movimientos · Extractos · Conciliaciones · Datos**. Tabla de movimientos con estado de conciliación
y asiento; filtros; paginación. Diálogo **Importar extracto** en 3 pasos (archivo CSV/OFX/XLSX →
mapeo de columnas con vista previa → resultado «48 importados · 3 duplicados omitidos»). Diálogo
**Movimiento bancario manual** (comisión, rendimiento, GMF) con cuenta contable. Estados y móvil.

### 4.6 «Tesorería — Conciliación bancaria»
Lista (cuenta, periodo, saldo extracto, diferencia **persistida**, estado Borrador · En curso ·
Cerrada). Nueva conciliación: cuenta, periodo, **saldo de apertura calculado a la fecha de inicio**,
saldo del extracto. Detalle a dos columnas: extracto (izquierda) ↔ libro (derecha), barra superior
«Apertura · Extracto · Conciliado · Diferencia», **`EmparejarPanel`** con los 4 tipos (movimiento ·
pago · asiento nuevo desde la conciliación · grupo N pagos + comisión = 1 abono), sugerencias
(«Coincidencia por monto, fecha y referencia», sin la palabra IA), deshacer con confirmación, y
**Cerrar** bloqueado si la diferencia ≠ 0 salvo «Partida de ajuste» con motivo y asiento. Móvil:
lista y detalle en una columna con conmutador Extracto/Libro.

### 4.7 «Tesorería — Open Finance»
Estado del servicio, **alta de conexión bancaria** (elegir institución → consentimiento con
propósito, alcance y 90 días → redirección → cuentas encontradas → vincular a una cuenta de dinero),
lista de consentimientos con renovar/revocar (diálogo con motivo), registro de auditoría. Estados:
no configurado (a nivel plataforma), sin conexiones con CTA, sincronizando, error del proveedor.

### 4.8 «Tesorería — PayFac»
Pestañas **Cuentas de dispersión · Dispersiones**. Alta de cuenta (vincular cuenta bancaria existente
o manual, titular con `PhoneInput` si aplica, documento, llave Bre-B), badge Verificada/Pendiente
(`is_verified`), eliminar con confirmación. Dispersiones: KPIs, chips de estado, tabla, detalle en
hoja con ítems (pago, bruto, comisión, neto) y `AsientoEnlazado` (1110 D neto · 5305 D comisión /
1305 C bruto).

### 4.9 «Tesorería — Saldos a favor»
Lista con buscador de cliente, filtros (estado, vence), KPIs; detalle con aplicaciones y asiento
(1110/1105 D / 2805 C al crear; 2805 D / 1305 C al aplicar); diálogos **Nuevo saldo a favor**
(`CustomerPicker`, cuenta de dinero de origen **por nombre**, no por código PUC) y **Aplicar a
factura** (lista de facturas abiertas del cliente, reparto). Se dibuja también como pestaña de CxC.

### 4.10 «Tesorería — Métodos de pago»
Lista (orden arrastrable, activo, web), pestaña «Cobros QR». Diálogo **Configurar método**: nombre
visible, **cuenta de dinero destino** (caja o banco), **cuenta contable** (se lee de la cuenta de
dinero), **comisión** (% + fijo, cuenta de gasto), días de liquidación, requiere referencia, web.
«Eliminar» = **quitar de mi organización** (nunca borra el catálogo). Estados + móvil.

### 4.11 «Tesorería — Monedas y tasas»
Monedas de la organización (base única, auto-actualizar), **Tasa del día** con fuente (API/manual),
fecha contable de la organización, autor, y diálogo **Registrar tasa manual** (par, tasa, fecha,
motivo); histórico paginado con filtros; conversor. Estados + móvil.

### 4.12 Índice de `07 Finanzas`
Añadir las 12 Secciones anteriores con su node id al marco «Índice».

### 4.13 Plan de llamadas (para ahorrar cupo)
1. Lectura: páginas, componentes de `02 Componentes` (Finanzas, POS — Ventas (Nuevo), shell),
   variables y posición libre en `07 Finanzas` — 2 llamadas.
2. Crear los 7 componentes de §3 — 1 llamada.
3. Secciones 4.0–4.3 (comparten plantilla: construir 4.1 y clonar) — 2 llamadas.
4. 4.4–4.6 — 1 llamada; 4.7–4.11 — 1 llamada; Índice + chequeo por script — 1 llamada.
5. Capturas `get_screenshot` por Sección → `docs/design/figma/50-tesoreria-*.png` — 12 llamadas
   (o una por Sección padre si el cupo aprieta).

---

## 5. Cambios de backend y BD para que funcione completo (no aplicados)

Ordenados por riesgo; los números de migración remiten a `AUDITORIA-TESORERIA-CONTABILIDAD.md` §S.

| # | Cambio | Resuelve | Tipo |
|---|---|---|---|
| 1 | **IDOR**: los 10+ endpoints de `api/integrations/open-finance/*` y `payfac/*` que leen `?organizationId=` pasan a `getServerOrgContext()`; `POST /payfac/payouts` exige `verifyPlatformAdmin`; `DELETE /payout-accounts/[id]` filtra por organización | Fuga entre inquilinos (§M.1) | código |
| 2 | `payment_methods`: quitar políticas UPDATE/DELETE para no administradores de plataforma; «Eliminar» borra solo `organization_payment_methods`; `name/requires_reference` por organización en `organization_payment_methods` | Borrado/renombrado global (§M.2) | migración + código |
| 3 | RPC transaccional **`fn_movimiento_tesoreria`** (alta de ingreso/egreso/traslado) que valida sesión de caja **de la sucursal y del cajero**, saldo disponible, y **recalcula `bank_accounts.balance`** en la misma transacción; o bien trigger sobre `bank_transactions`/`bank_transfers` que mantenga el saldo | Saldos congelados (§G.1), sesión equivocada | migración |
| 4 | Sustituir `'pending'` por `'unmatched'` en `BancosService.ts:285` y `:542`, y revisar el error del `update` | Alta de movimiento bancario y deshacer conciliación | código |
| 5 | Anular = estado + contra-movimiento enlazado (`voided_by_id`), no una contrapartida suelta con tipo inválido | Anular roto (`movimientosService.ts:401`) | migración + código |
| 6 | Tabla **`treasury_movements`** (§O.2) con proyección de `payments`, `cash_movements`, `bank_transactions` y `bank_transfers`; `payments.cash_session_id` (§S 9) | Lista unificada, consignación, conciliación contra el libro | migración |
| 7 | Rellenar y exigir `bank_accounts.account_code`; cuenta contable por caja; el mapeo del método de pago escribe `accounting_rules` o los triggers leen `account_mapping` | Regla 3 de §P.2; A-1, A-2 | migración + código |
| 8 | Conciliación: trigger que recalcula `difference`/`closing_balance`; `opening_balance` a `period_start`; emparejamiento `journal` que crea el asiento; cierre bloqueado con diferencia ≠ 0 | B-2, B-3, B-5, §Q.3 | migración |
| 9 | Importador de extractos (CSV/OFX) por route handler con deduplicación por (cuenta, fecha, importe, referencia) | «Importar» muerto en 3 pantallas | código |
| 10 | Anomalías: tabla `treasury_alert_resolutions` y `markAnomalyResolved` que persista | B-7 | migración + código |
| 11 | PayFac: `camelCase` en el body de `cuentas/page.tsx`, `is_verified`, `json.data ?? json` en dispersiones | Altas y listas rotas | código |
| 12 | Monedas: `getBaseCurrency` desde `organization_currencies.is_base`; clave de OpenExchangeRates solo en servidor; tasa manual por organización con fuente y autor; moneda y tasa en cada movimiento | A-3…A-6, A-8 | código + migración |
| 13 | Open Finance: flujo de alta de conexión y consentimiento (hoy no hay interfaz) | Pantalla inerte | código |

Todas las escrituras de dinero deben pasar a route handler + `getServerUserClient()` (regla 5 de
`CLAUDE.md`); hoy toda la tesorería escribe desde el navegador.

---

## 6. Preguntas para el dueño

1. **¿Se acepta la fusión** de Ingresos, Egresos y Transferencias en una sola lista «Movimientos» con
   tres altas distintas? (El diseño de §4 dibuja las tres Secciones igual, pero el código sería uno.)
2. **¿«Cuentas de dinero» incluye las cajas del POS** en la misma lista que los bancos, con la acción
   «Consignar a banco»?
3. **¿Open Finance y PayFac salen de Finanzas a Integraciones?** Ninguna de las dos tiene hoy una sola
   organización operándola (0 conexiones, 0 cuentas de dispersión).
4. Para la comisión de un método de pago (tarjeta, pasarela), **¿se contabiliza al cobrar (estimada) o
   al conciliar la liquidación del procesador (real)?** Recomendación: al conciliar, con el
   emparejamiento de tipo «grupo».
5. Un egreso que supera el saldo de la caja o del banco: **¿se bloquea o solo se avisa?**
6. **¿Se permiten tasas de cambio manuales por organización** que prevalezcan sobre la del día?
7. ¿Se habilita otra ventana de cupo de Figma (o un asiento con más cupo) para ejecutar §4.13?

---

## 7. Qué se hizo y qué faltó

| Entregable del encargo | Estado |
|---|---|
| 1. Estado real por página verificado contra código y BD | **Hecho** (§1) |
| 2. Diseño en `07 Finanzas`, 11 Secciones + mapa + Índice | **No hecho**: cupo del MCP de Figma agotado antes de la primera llamada. Especificación lista en §3–§4 |
| 3. Chequeo por script (solapes, nodos fuera de sección, instancias rotas, textos truncados, anotaciones) | **No hecho** (depende de 2) |
| 3. Capturas `docs/design/figma/50-tesoreria-*.png` | **No hecho** (depende de 2) |
| 3. Este documento | **Hecho** |

Node ids: **ninguno** — no se creó ningún nodo.

## Decisiones del dueño (2026-09-23)

- **Movimientos:** ingresos, egresos y transferencias se unen en una sola lista «Movimientos», con tres formularios de creación.
- **Cuentas de dinero:** las cajas del POS aparecen junto a las cuentas bancarias, respetando el modo de caja de la organización (por cajero o por sucursal), que ya existe como configuración.
- **Open Finance y PayFac:** son integraciones propias de GO Admin que se ofrecen a los clientes; el cliente no las integra. Se quedan en Finanzas como funciones nativas («Conectar banco», «Cobros y dispersiones»): el cliente solo activa y autoriza. Las credenciales del proveedor las maneja la plataforma (super admin), nunca la organización.
