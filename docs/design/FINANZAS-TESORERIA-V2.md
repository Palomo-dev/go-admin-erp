# Finanzas — Tesorería y configuración financiera v2: análisis y propuesta

Fecha: 2026-09-28 · Grupo: **Movimientos** (ingresos, egresos, transferencias), **Cuentas de dinero**
(bancos + cajas), **Métodos de pago**, **Monedas**, **Comisiones** e **Impuestos**.

- Base, **no repetida aquí**: `FINANZAS-TESORERIA-FIGMA.md` (estado al 23-sep, estructura aprobada,
  componentes propuestos). Este documento re-verifica contra el código y la BD **de hoy** —incluidas
  las correcciones que otras sesiones confirmaron o dejaron aplicadas hoy— y lo lleva a especificación
  por página.
- Código leído en `src/` (rutas relativas a `src/`), HEAD `c895e6dc` más el árbol de trabajo. Sin
  editar código ni hacer commits.
- BD: solo `SELECT` por el MCP de Supabase (proyecto `jgmgphmzusbluqhuqihj`): conteos, catálogo
  (`pg_proc`, `pg_policies`, `pg_constraint`, `information_schema`). Sin datos personales; las
  organizaciones se citan por id.
- Kit: `KIT-CODIGO.md`, `implementacion/KIT-COMPARTIDO.md`; coherencia: `AUDITORIA-COHERENCIA-FIGMA.md`;
  patrones ya construidos: `implementacion/CAJAS-VENTAS-PLAN.md` §7 y `FACTURAS-COMPRA-CXP-PLAN.md` §6.

Decisiones aprobadas que este documento aplica (23-sep): (a) Ingresos, Egresos y Transferencias se
unen en **Movimientos** con tres altas; (b) **Cuentas de dinero** = cajas (según el modo de caja de la
organización: por cajero o por sucursal) + cuentas bancarias; (c) Open Finance y PayFac son **servicios
propios de GO Admin**: el cliente activa y autoriza, nunca pega credenciales de proveedor.

---

## 0. Qué cambió desde el 23-sep (lógica corregida que el diseño asume)

| Tema | Hoy | Dónde |
|---|---|---|
| Saldo bancario | **Un solo escritor**: `fn_saldo_bancario_ajustar`, disparadores en `bank_transactions` y `bank_transfers`; una guarda rechaza cualquier `UPDATE` directo de `balance`; la cuenta del movimiento debe ser de la misma organización. Saldo histórico desviado **medido y no reescrito** (F-79) | migración `20260928160000_finanzas_saldo_bancario_por_movimientos` (aplicada, `.sql` sin confirmar) |
| Transferencias | RPC `fn_transferencia_registrar` (permiso `finance.create`, misma organización y moneda, saldo suficiente con bloqueo, fecha del día de la organización, idempotente) y `fn_transferencia_anular` (`finance.void`, contra-asiento). `fn_movimiento_banco_anular` = reverso de un ingreso/egreso por banco | `20260928161000_…_rpc` (aplicada). **El código aún llama `rpc('update_bank_balance')`** (`lib/services/transferenciasService.ts:190,213`): la sesión de tesorería está cambiando `BancosService.ts`, `CuentaDetailPage.tsx`, `MovimientosPage.tsx` (sin confirmar) |
| Movimiento de caja | RPC única `pos_caja_registrar_movimiento` (idempotente por uuid; autor = quien llama). RLS: INSERT solo en caja **abierta**, UPDATE del autor o con `pos.cajas.cerrar_ajenas`, sin DELETE. Finanzas ya la usa (`movimientosService.ts:282, 395`) y «Anular» dejó de fallar | `aa9faee4`, migración `20260928100000` |
| Monedas | Una sola moneda base por organización (índice único parcial); escrituras por RPC con permiso (admin, `billing_management` u `organization_settings`); `set_organization_base_currency` ya no deja a la org sin base | `20260928145431_gosec_monedas_…` |
| Catálogo global de tasas | Solo lo escribe la plataforma (service role / pg_cron); se retiraron las políticas que dejaban a un rol 2 de cualquier org insertar, editar o **borrar** tasas globales | `20260928150534_gosec_catalogo_tasas_solo_plataforma` |
| Comisiones | Se devengan una sola vez y con su método (porcentaje / monto fijo); el disparador de la venta, que **tumbaba todo cobro del POS con vendedor** (`payee_id` text→uuid), pasa a respaldo diferido. Cancelar revierte el asiento; pagar registra quién y **desde qué cuenta de dinero**. Tasas por vendedor por RPC | `f0c92b14`, `3a570e11`, `c895e6dc`; `docs/hallazgos/comisiones-e-impuestos-2026-09-28.md` |
| Impuestos | **Sin cambios hoy** en el cálculo: siguen los tres motores y el exento que cae a la tarifa por defecto | — |

---

## 1. Movimientos (Ingresos · Egresos · Transferencias)

### 1.1 Inventario actual

**Rutas** (todas `page.tsx` de 5–15 líneas que montan un componente cliente):
`app/app/finanzas/ingresos/page.tsx` + `[id]`, `egresos/page.tsx` + `[id]`, `transferencias/page.tsx` +
`[id]`. No hay «nuevo» ni «editar» (el alta es un diálogo; editar no existe). No existe ninguna ruta
`tesoreria/movimientos` (solo en docs). Menú: `lib/navigation/catalog.ts:385-387`, grupo «Tesorería».

| Pieza | Líneas | Qué hace |
|---|---:|---|
| `components/finanzas/ingresos/IngresosPage.tsx` | 376 | Lista de caja + banco mezclada en el navegador, KPIs, filtros. «Importar» sin `onClick` (`:177-180`); «Editar» del menú sin `onClick` (`:333-336`) |
| `components/finanzas/egresos/EgresosPage.tsx` | 376 | Copia de la anterior con `'expense'` |
| `NuevoIngresoDialog` / `NuevoEgresoDialog` | 271 c/u | Origen «Caja» o «Banco», sucursal, concepto, importe |
| `IngresoDetalle` / `EgresoDetalle` | 302 / 301 | Anular (`window.prompt`), duplicar |
| `components/finanzas/transferencias/TransferenciasPage.tsx` | 389 | Lista + KPIs «Hoy / Este mes» |
| `NuevaTransferenciaDialog` | 320 | Solo cuentas bancarias; valida contra un saldo que nunca se movía |
| `TransferenciaDetalle` | 328 | Anular |
| `lib/services/movimientosService.ts` | 605 | Caja: `pos_caja_registrar_movimiento`. Banco: `INSERT` directo en `bank_transactions` |
| `lib/services/transferenciasService.ts` | 332 | `INSERT` en `bank_transfers` + `rpc('update_bank_balance')` inexistente |

**Flujo de punta a punta hoy (ingreso por caja):** diálogo → `movimientosService.getActiveSession`
(`:215-226`) toma **la última caja abierta de toda la organización** (la sucursal del diálogo se
ignora) → `pos_caja_registrar_movimiento` → `cash_movements` → disparador
`trg_auto_journal_cash_movement` (regla `cash_movement:created`) → asiento. **Por banco:** `INSERT`
en `bank_transactions` (desde el navegador) → `trg_auto_journal_bank` (regla `bank:adjusted`
1110/5105) → asiento; desde hoy también `trg_bank_tx_saldo` mueve el saldo. **Transferencia:**
`INSERT` en `bank_transfers` desde el navegador (hoy la RLS de la migración 161000 lo cierra: la
pantalla **deja de funcionar hasta que el código pase a la RPC**) → `trg_auto_journal_bank_transfer`.

**Escritura y permisos:** todo desde el navegador (`@/lib/supabase/config`); la UI no comprueba
permisos (solo el middleware por módulo `finance`, `middleware.ts:422`). Catálogo de permisos:
`finance.view/create/approve/void`. Sin kit, sin i18n. Fechas: listas con `useFormatDate`; detalles con
el `formatDate` deprecado; «Hoy / Este mes» con la medianoche **del navegador**
(`movimientosService.ts:451-453`, `transferenciasService.ts:292-294`).

**Datos reales (BD hoy):**

| Dato | Valor |
|---|---|
| `cash_movements` | **5** filas (3 `out`, 2 `in`), 0 con `reference`, 0 con `concept_code` |
| Asientos `source='cash_movements'` | **109**, en 5 orgs; **104 apuntan a movimientos que ya no existen** (FK `cash_movements → cash_sessions ON DELETE CASCADE`: se borraron sesiones y sus movimientos; los asientos quedaron) |
| Regla `cash_movement:created` | en **31 de 89** organizaciones: en 58, un movimiento de caja no genera asiento (queda en `journal_entry_failures` como `no_rule`) |
| `bank_transactions` | 2 (1 `deposit`, 1 `withdrawal`, ambas `unmatched`) |
| `bank_transfers` | 1 (`completed`), **0 asientos** |
| Sesiones de caja | 110 (14 abiertas en 11 orgs; **12 abiertas hace más de 24 h**) |
| `payments` (el dinero real que entra) | 4.036; `bank_account_id` en **0 de 4.036** |

La conclusión de uso: el dinero de las organizaciones entra casi todo por **pagos** (1.727 en
efectivo, 835 transferencia, 590 Nequi, 487 Wompi en 90 días) y **nunca** queda asociado a una cuenta
de dinero. Ingresos/Egresos manuales casi no se usan (5 movimientos en toda la base).

### 1.2 Problemas

UX
1. Tres pantallas gemelas para lo que es una sola lista; el usuario no ve en un solo lugar «qué entró y
   salió hoy de mi dinero». Ventas, pagos de facturas y consignaciones —el 99 % del flujo— no aparecen.
2. El origen «Caja / Banco» es un `<span>` crudo; no se sabe **qué** caja ni **qué** banco.
3. Anular con `window.prompt`; sin motivo obligatorio ni «qué se revierte».
4. «Importar», «Editar» y «Exportar» muertos (`IngresosPage.tsx:177-180, 333-336`).
5. Error de carga = lista vacía (los servicios tragan el error). Sin estado «sin permiso».

Lógica
6. **Caja equivocada**: la última abierta de la organización (`movimientosService.ts:215-226`); en modo
   por cajero se escribe en la caja de otra persona. En 11 orgs hay cajas abiertas, en varias más de una.
7. **Duplicar un ingreso crea un egreso** (`movimientosService.ts:427` + `:276`).
8. Anular/duplicar desde el detalle de un movimiento de **banco** usa el id de `bank_transactions` contra
   `cash_movements` (`IngresoDetalle.tsx:65,80`): puede tocar un movimiento de caja ajeno con el mismo
   número. Tras duplicar navega con el id numérico en lugar del uuid (`:83`) → «no encontrado».
9. Transferencias: el código sigue en `update_bank_balance` (inexistente); solo entre bancos (no hay
   «consignar caja → banco», D9 de Cajas); `transfer_date` va como `'YYYY-MM-DD'` a un `timestamptz`
   (medianoche UTC = día anterior en Bogotá).
10. Sin validación de saldo disponible en egresos de caja (el esperado de `pos_caja_esperado` no se
    consulta).

Datos
11. 104 asientos huérfanos de movimientos de caja borrados por cascada (F-57 lo cubre en genérico).
12. 58 orgs sin regla contable de movimiento de caja.
13. `payments.bank_account_id` vacío en el 100 %: la conciliación y el saldo por cuenta no tienen de
    dónde salir para ventas y cobros.

### 1.3 Propuesta: una pantalla «Movimientos»

Ruta `/app/finanzas/tesoreria/movimientos` (las tres viejas redirigen con `?tipo=ingreso|egreso|traslado`).

**Estructura (escritorio 1440)**
- `PageHeader` list: migas «Finanzas › Tesorería › Movimientos», icono `ArrowLeftRight`, subtítulo
  «Entradas y salidas de tus cajas y bancos», acción primaria **«Nuevo ▾»** (menú: Ingreso · Egreso ·
  Traslado entre cuentas · Consignar caja a banco) + «⋯» (Exportar, Importar extracto).
- `debajo`: `BranchBadgeActiva` (es de ámbito sucursal) + `SegmentedControl` de tipo **Todos · Entradas ·
  Salidas · Traslados** (patrón aprobado de Cajas en la fila de pestañas, no en la del buscador).
- `KpiStrip` (4 `StatCard`, del día de la organización): **Entradas** del periodo · **Salidas** · **Neto**
  · **Por conciliar** (n y $, solo bancos). Clic = lista filtrada.
- `ListToolbar`: `SearchInput` («Buscar concepto, referencia o tercero») + `FilterButton` →
  `FilterPanel` (Cuenta de dinero, Origen [manual · venta · cobro · pago a proveedor · traslado ·
  comisión · ajuste], Estado [vigente · anulado], Conciliación, rango con `DateRangeButton`).
- `DataTable`: Fecha · Número (`MOV-000123`; para los que nacen de un documento, su `ChipDocumento`) ·
  Tipo (`MovimientoTipoBadge` **Nuevo**) · Concepto y tercero · Cuenta de dinero (icono caja/banco +
  «Caja Centro · turno #482» / «Banco ··4321») · Importe (derecha, verde/rojo con signo, moneda) ·
  Conciliación (`StatusBadge`) · Asiento (`ChipDocumento tipo=asiento` o «—») · «⋯».
- `Pagination` («Mostrando 1–25 de 312 movimientos»).

**Qué se lista (decisión clave, ver §8 P1):** fase 1 = movimientos manuales de caja + movimientos
bancarios + traslados (lo que hoy existe, unificado en el servidor). Fase 2 = también los `payments`
(ventas, cobros, pagos a proveedor), cuando `payments` lleve cuenta de dinero y dirección.

**Detalle** (hoja lateral `PanelAdaptable` 560 en escritorio; página en móvil): `PageHeader detail`
con número, `StatusBadge` (Vigente/Anulado) e importe; `ListaDatos` + `FilaDato` (fecha contable,
cuenta, tercero, concepto, referencia, autor, creado); **`AsientoEnlazado` (Nuevo)**: asiento, fecha y
2–4 líneas D/C con «Ver asiento» (o «Sin regla contable: configúrala» con enlace a Reglas); **`CadenaDocumento`**
(turno de caja → movimiento → asiento → conciliación); acciones «Anular» (`DialogoMotivo` con
consecuencias: «Se crea un contra-movimiento y un contra-asiento; el saldo de Caja Centro vuelve a
$ 2.360.400») y «Duplicar».

**Altas** (`MovimientoForm` **Nuevo**, `PanelAdaptable` 560 / hoja en móvil; mismo esqueleto):
- *Ingreso / Egreso*: **Cuenta de dinero** (selector `SelectorCuentaDinero` **Nuevo**: «Mi caja
  abierta» primero, luego cajas de la sucursal según el modo, luego bancos; deshabilitadas con motivo
  «Caja de otro cajero», «Caja cerrada»), fecha contable (hoy de la organización; no futura), concepto
  (catálogo único de conceptos de caja, el mismo de `MovimientoCajaForm`), tercero opcional
  (`CustomerPicker` / `SupplierPicker` / «Interno»), importe (`CampoNumero` con la moneda de la cuenta),
  referencia, notas, soporte. Bloque lateral **«Efecto en la cuenta»** (patrón de `18-cajas-10`):
  saldo ahora → este movimiento → saldo después; si la caja tiene cierre ciego y el usuario no tiene
  `pos.cajas.ver_esperado`, el bloque dice «Oculto por cierre ciego». Egreso mayor al disponible:
  aviso (o bloqueo, pregunta §8 P3).
- *Traslado* (incluye «Consignar caja a banco»): Origen → Destino (cajas y bancos), saldo disponible
  **real** del origen, importe, comisión/GMF opcional (cuenta de gasto), fecha, referencia. Resumen:
  «Sale $ 1.004.000 de Caja Centro · entra $ 1.000.000 en Banco ··4321 · comisión $ 4.000». Misma
  moneda obligatoria (la RPC lo exige); si difieren, aviso «Traslados entre monedas: próximamente».
- Estado **«sin caja abierta»** con «Abrir caja» (enlace al POS) y la opción de elegir un banco.

**Estados** (todos): listo · cargando (`Skeleton` en tabla y valor de KPI) · vacío con primer paso
(«Aún no hay movimientos. Registra un ingreso, un egreso o consigna tu caja al banco» + «Nuevo») · sin
resultados · error (banner + «Reintentar», nunca $0) · sin permiso (`EmptyState forbidden`: «Pide a un
administrador el permiso Finanzas · ver») · sin sucursal asignada (`EmptyStateSinSucursal`).
**Móvil** (< lg): `MobileHeader` con «+» (abre `ActionSheet` con los 4 tipos), buscador + «Filtros»,
`KpiCompacto` (Entradas · Salidas · Neto), `ListCard` (icono tipo, concepto, cuenta, fecha; importe con
signo; badge), `PaginationCompact`. **Tableta** 1024: tabla con columnas Conciliación y Asiento ocultas
(`ocultarDebajo='xl'`), KPIs 2×2.

**Coherencia:** mismo patrón de lista que Proveedores/Cajas/Libro diario v2 (`PageHeader` + KPIs +
`ListToolbar` + `DataTable` + `Pagination`); `AsientoEnlazado` y `ChipDocumento tipo=asiento` enlazan con
Contabilidad v2 (`OrigenAsiento`, `MarcaReversion` del kit de contabilidad en Figma).

### 1.4 Backend necesario (no aplicado)

| # | Cambio | Tipo |
|---|---|---|
| M1 | Route handlers `POST /api/tesoreria/movimientos` (ingreso/egreso) y `/traslados` con `withOrg` + `finance.create`; sesión de caja resuelta **en el servidor** por sucursal y cajero (modo de caja), `pos_caja_registrar_movimiento` para caja y RPC nueva `fn_movimiento_banco_registrar` para banco (el `INSERT` directo desde el navegador desaparece) | código + migración |
| M2 | Traslado caja ↔ banco: extender `fn_transferencia_registrar` o RPC `fn_traslado_registrar` que en una transacción crea el egreso de caja (`cash_movements`, concepto «Consignación») y el ingreso bancario, con un `transfer_id` que los enlace; un solo asiento 1110 D / 1105 C | migración |
| M3 | Lectura unificada `fn_tesoreria_movimientos(org, filtros, página)` (INVOKER, RLS de la sesión) sobre `cash_movements` + `bank_transactions` + `bank_transfers` (fase 1) y `payments` (fase 2); y `fn_tesoreria_resumen` para los KPIs con el día de la organización | migración |
| M4 | Arreglar en código: duplicar (`movimientosService.ts:427`), ids caja/banco del detalle (`IngresoDetalle.tsx:65,80,83`), fechas «Hoy/Mes» con `todayInTz` | código |
| M5 | Fase 2: `payments.direction` (`in`/`out`) y `payments.money_account` (`cash_session_id` —D5 de Cajas— o `bank_account_id`) escritos por `fn_registrar_pago` y `pos_checkout_v1`. Sin esto la lista no puede mostrar ventas ni el egreso de una comisión pagada (el hallazgo del 28-sep lo explica) | migración (compartida con cobro y CxP) |
| M6 | Siembra de la regla `cash_movement:created` en las 58 orgs sin ella (o que el asiento use la cuenta de la caja) | migración de datos |
| M7 | Cambiar la FK `cash_movements → cash_sessions` de `CASCADE` a `RESTRICT` (una sesión con movimientos no se borra); los 104 huérfanos se revisan con F-57 | migración |

---

## 2. Cuentas de dinero (bancos + cajas)

### 2.1 Inventario actual

**Rutas:** `finanzas/bancos/page.tsx` (lista), `bancos/cuentas/nuevo`, `bancos/cuentas/[id]`,
`bancos/cuentas/[id]/movimientos`, `bancos/tesoreria` (consolidada), `bancos/anomalias`.

| Pieza | Líneas | Notas |
|---|---:|---|
| `components/finanzas/bancos/BancosPage.tsx` | 145 | Tarjetas `BankAccountCard`; «Exportar» sin `onClick` (`BancosPageHeader:50-56`) |
| `bancos/cuentas/NuevaCuentaForm.tsx` | 281 | Catálogo de bancos cableado; no pide `account_code` |
| `bancos/cuentas/CuentaDetailPage.tsx` | 463 | «Importar extracto» sin `onClick` (`:365-371`); `?edit=true` generado (`:213`, `BankAccountCard:71`) y no leído; `open_finance_accounts` sin filtro de organización (`:65-70`); fechas `toLocaleDateString('es-CO')` (`:136`) |
| `bancos/cuentas/MovimientosPage.tsx` | 399 | Alta manual con `credit/debit` (`:41, 216`) → el CHECK solo acepta `deposit/withdrawal/transfer/fee/interest/other`: **nunca se guarda**; pinta todo como débito (`:347-387`); filtro «pending» imposible (`:310`) |
| `BancosService.ts` | 659 | `status:'pending'` (`:288, :545`), `UPDATE` de cuentas sin filtro de organización (`:200, :217`) — **en edición por la sesión de tesorería** |
| `bancos/tesoreria/TesoreriaPage.tsx` | 652 | Solo `bank_accounts` + `open_finance_accounts`; errores de la API ignorados |
| `bancos/anomalias/AnomalyPanel.tsx` | 661 | «Resolver» no persiste (`anomalyDetectionService.ts:630-640`) |
| `lib/pos/cajas/cuentasDeDinero.ts` | 78 | `cajasComoCuentasDeDinero(ctx)` (commit `1cc1bf63`): cajas abiertas con alcance (`sucursal · todas · usuario`), responsable, saldo = esperado de `pos_caja_esperado` (null con cierre ciego). **No la llama nadie** salvo un test |

Modo de caja: `organization_settings` clave `pos_cash_session_mode` (`branch` | `user`), leído por
`modoCajaOrganizacion` (`lib/pos/cajas/resumenServidor.ts:138-146`).

**Datos:** `bank_accounts` **3** (3 `savings`, COP, `account_code` vacío en 3/3; saldo = saldo inicial
en 3/3 hasta hoy); `bank_files` 0; `bank_reconciliations` 0. CHECK de `account_type`: `checking ·
savings · cash · credit_card · other`. RLS de `bank_accounts`: ALL por pertenencia + restrictiva por
sucursal (`app_branch_access`); cualquier miembro puede crear o editar una cuenta bancaria.
Cajas: 14 abiertas (11 orgs), 12 de ellas «vencidas» (> 24 h).

### 2.2 Problemas

1. Las cajas —donde está casi todo el efectivo— no aparecen en Finanzas; el contrato de servidor
   existe y está sin usar.
2. Tres pantallas (lista, tesorería consolidada, anomalías) con tres formas distintas de ver el saldo.
3. `account_code` vacío: el asiento de banco cae a la regla genérica 1110; con dos bancos, ambos van a
   la misma cuenta contable.
4. Sin editar cuenta; sin inactivar con motivo; número de cuenta completo a cualquiera.
5. Movimiento manual bancario roto (CHECK); importar extracto muerto.
6. Cualquier miembro (un cajero) puede crear/editar cuentas bancarias por API (RLS sin permiso).

### 2.3 Propuesta: «Cuentas de dinero»

Ruta `/app/finanzas/tesoreria/cuentas` (redirige `bancos`, `bancos/tesoreria` → pestaña «Posición»,
`bancos/anomalias` → «Alertas»).

- `PageHeader` list «Cuentas de dinero», icono `Wallet`, acciones «Nueva cuenta bancaria» + «⋯»
  (Exportar saldos). `debajo`: `TabBar` **Cuentas · Posición · Alertas (n)**.
- `KpiStrip`: **Disponible total** (por moneda base) · **En bancos** · **En cajas** («3 cajas
  abiertas»; con cierre ciego sin permiso: «Oculto») · **Por conciliar**.
- Pestaña **Cuentas**: dos grupos con título: «Cajas (modo: por cajero | por sucursal)» y «Bancos».
  Rejilla de **`CuentaDineroCard` (Nuevo)**: `Tipo` caja · banco × `Estado` activa · inactiva · vencida ×
  `Layout` desktop · mobile. Caja: sucursal, responsable, «abierta desde 07:58», saldo esperado,
  acciones «Ver turno» · «Consignar a banco»; **vencida** (> 24 h) con tono advertencia y «Cerrar con
  arqueo» (solo con `pos.cajas.cerrar_ajenas`). Banco: nombre, banco ··4321 (enmascarado), tipo,
  moneda, saldo en libros, cuenta contable (o aviso «Sin cuenta contable»), «Por conciliar 3».
- Pestaña **Posición**: saldo por día (línea), concentración por banco, proyección (lo de
  `TesoreriaPage`, con errores visibles).
- Pestaña **Alertas**: lista de anomalías con «Marcar revisada» (con motivo, persistido).
- **Detalle de cuenta bancaria** (`PageHeader detail`): saldo en libros · (si hay «Conectar banco») saldo
  según banco y diferencia; `TabBar` **Movimientos · Extractos · Conciliaciones · Datos**; tabla de
  movimientos con conciliación y asiento; acciones «Movimiento manual» (comisión, GMF, rendimiento,
  con cuenta contable), «Importar extracto» (`Stepper` 3 pasos: archivo → mapeo → resultado), «Editar»,
  «Inactivar» (`DialogoMotivo`; bloqueado con saldo ≠ 0).
- **Detalle de caja**: no se duplica: `CuentaDineroCard` lleva a `/app/pos/cajas/[uuid]` (ya rediseñado).
- **Nueva / editar cuenta bancaria** (`PanelAdaptable` 560): nombre, banco (catálogo), tipo, número
  (enmascarado al mostrar), moneda (de las de la organización), **cuenta contable** (`SelectorCuenta` del
  kit de contabilidad, filtrado a 1110xx/1120xx), sucursal, saldo inicial **con fecha de corte**.
- «Conectar banco» (Open Finance, servicio de la plataforma): tarjeta `RelatedLinkCard` en el detalle
  «Conecta este banco para traer el extracto solo» → flujo de consentimiento; si la plataforma no lo
  tiene activo para el país, la tarjeta no se muestra (nunca pide credenciales).

Estados: listo · cargando · vacío («Registra tu primera cuenta bancaria; tus cajas aparecen aquí al
abrirlas en el POS») · error · sin permiso · cierre ciego (saldos de caja «Oculto») · móvil (tarjetas
apiladas, `KpiCompacto`, «+» en la cabecera).

### 2.4 Backend (no aplicado)

| # | Cambio |
|---|---|
| C1 | `GET /api/tesoreria/cuentas` (withOrg, `finance.view`) = bancos + `cajasComoCuentasDeDinero` + estado «vencida» (> 24 h o de otro día de la organización) |
| C2 | Alta/edición de cuenta bancaria por route handler con `finance.approve` (o `billing_management`); RLS de `bank_accounts` de escritura solo por RPC/servidor |
| C3 | `account_code` obligatorio al crear (NULL-able en la tabla; la pantalla lo exige) y usado por `fn_auto_journal_bank*` en vez de la regla genérica |
| C4 | `bank_transactions` manual por RPC con `transaction_type` válido (la sesión de tesorería lo está corrigiendo) |
| C5 | Importador de extractos (CSV/OFX/XLSX) por route handler, dedupe por (cuenta, fecha, importe, referencia) en `bank_files` |
| C6 | `treasury_alert_resolutions` para «Marcar revisada» |

---

## 3. Métodos de pago

### 3.1 Inventario actual

**Ruta:** `finanzas/metodos-pago/page.tsx` (11 líneas) → `components/finanzas/metodos-pago/PaymentMethodsPage.tsx`;
`metodos-pago/qr-sessions`. Piezas: `PaymentMethodsList`, `PaymentMethodForm`, `AccountMappingForm`,
`PaymentGatewaysSection`, `PaymentMethodGatewayConfig`, `gateways/`, `payment-method-types.ts`.
Consumidores: el POS (`SelectorMetodoPago` del kit + `kit/metodosPago.ts`, «los de la organización»),
`RegistrarPagoDialog`, tienda web (`show_on_website`, `website_*`).

**Código (verificado hoy; sin commits ni cambios pendientes en esta zona):**
`PaymentMethodsPage.tsx` (301) lee `payment_methods` + `country_payment_methods` (`:87-100`, filtra el
país en el cliente `:121-128`), `organization_payment_methods` (`:132-148`) y la RPC
`get_recommended_payment_methods` (`:156`). `PaymentMethodsList.tsx` (725): «Eliminar» borra la fila
**global** (`:524-531`, el error solo va a `console.warn`); activo, web y reorden sin comprobar filas
afectadas (`:369-372`, `:417-420`, `:477-484`, un `UPDATE` por fila). `PaymentMethodForm.tsx` (718):
renombra el global (`:303-310`); en `cash/transfer/card` nada persiste (`:529-547`); «Código interno»
muerto (`:401-414`); UUID de integraciones cableados (`:58-70`). `AccountMappingForm.tsx` (359): escribe
`settings.account_mapping` (`PaymentMethodForm.tsx:269`) que **nadie lee** (0 lectores en `src/`,
funciones ni migraciones) y `integrationsService.ts:736-747` pisa `settings` con `{gateway}`.
Caja obligatoria: **no es por método**, es la opción de organización `pos_require_cash_session`
(`components/pos/configuracion/configuracionService.ts:104-110`, `CheckoutDialog.tsx:436-454`).
Orden: el POS **no ordena** (`posService.ts:1809-1827` sin `.order`, respaldo fijo cash/card
`:1835-1838`) pese a `kit/metodosPago.ts:33`. Nombres cableados en Configuración › POS
(`ConfiguracionPage.tsx:816-860`, `getPaymentMethodName :324-337`). QR: el POS enruta por código cableado
(`CheckoutDialog.tsx:811-835`); `qr-sessions/page.tsx` (313) lee desde el navegador con una política que
depende de `app.current_organization_id`, que nadie fija. Todo escribe desde el navegador; sin kit, sin
i18n, sin control de permisos en la UI (solo la puerta del módulo, `middleware.ts:422`).

**Modelo en BD:**
- `payment_methods` (catálogo **global**, sin `organization_id`): 30 códigos; `is_system` en 17.
- `organization_payment_methods` (por org): 292 filas en 89 orgs, 235 activas; `settings` jsonb (solo
  clave `gateway`, en 10 filas); `show_on_website` en 177; `integration_connection_id` en 7; **sin
  columna de orden** para el POS (solo `website_display_order`), **sin cuenta de dinero, sin cuenta
  contable, sin «requiere caja»**.
- `country_payment_methods` (86, plantilla por país) y `dian_payment_methods` (10, códigos DIAN).
- `payment_qr_sessions`: 0.

**Políticas (verificadas):**
- `payment_methods_insert_policy`: **cualquier miembro** de cualquier org inserta códigos globales no
  del sistema.
- `payment_methods_update_policy` / `_delete_policy`: cualquier miembro de una org que **use** ese
  código puede renombrarlo o **borrarlo para todos**; la FK `organization_payment_methods →
  payment_methods ON DELETE CASCADE` borra además la fila de **todas** las orgs que lo usan.
- `organization_payment_methods`: escritura con `billing_management` (bien).

**Datos de uso (90 días, `payments`):** cash 1.727 · transfer 835 · **nequi 590** · wompi 487 ·
card 72 · **daviplata 66** · **pse 28** · QR 16 · «002» 7.

### 3.2 Problemas

1. **Borrado/renombrado global**: `wompi` (no del sistema) está en 61 orgs; un miembro de cualquiera de
   ellas puede borrarlo y la cascada lo quita de las 61. Ya hay basura global creada por orgs:
   `001` «sistecredito», `002` «p. QR», `qr` «pago QR», `QR` «QR.», `SQS` «SQq».
2. **Pagos con métodos que la org no tiene configurados**: 590 Nequi, 66 Daviplata y 28 PSE en 4 orgs
   **sin fila** en `organization_payment_methods` (vienen de la tienda web y de facturas) y con el código
   global **inactivo**. La pantalla no los muestra; los reportes por método sí.
3. 13 orgs solo tienen `wompi` (sin efectivo, tarjeta ni transferencia).
4. «Cuenta contable» (`AccountMappingForm`) no la lee nadie: los asientos salen de `accounting_rules`.
5. No existe «a qué cuenta de dinero entra» ni «requiere caja abierta» por método: el POS lo decide por
   código fijo (`codigosEfectivo`).
6. Sin orden propio para el POS; el `SelectorMetodoPago` muestra 4 botones + «Otro» en el orden que llegue.
7. La conexión de pago (pasarela/QR) se configura en la misma pantalla con credenciales del cliente:
   contradice la decisión «servicio de la plataforma».

### 3.3 Propuesta: «Métodos de pago»

Ruta `/app/finanzas/configuracion/metodos-pago` (se mantiene `metodos-pago`). Ámbito organización (sin
`BranchBadge`).

- `PageHeader` «Métodos de pago», icono `CreditCard`, acción «Agregar método» + «⋯» (Restablecer
  plantilla de Colombia). Subtítulo: «5 activos · se ven en el POS en este orden».
- `TabBar` **Métodos · Cobros QR**.
- **Métodos**: lista ordenable (asa de arrastre + «Subir/Bajar» accesibles), `DataTable` con: Orden ·
  Método (icono + nombre visible) · Tipo (`Badge`: Efectivo · Tarjeta · Transferencia · Billetera ·
  Pasarela · Crédito) · **Entra a** (cuenta de dinero: «Caja del turno» / «Banco ··4321» / «Según la
  pasarela») · Requiere caja (Sí/No) · Referencia (Obligatoria/Opcional) · POS (`Switch`) · Tienda web
  (`Switch`) · «⋯» (Editar · Duplicar · Quitar de mi organización). Filas con aviso: «Usado en 590 pagos
  y no configurado» (los códigos huérfanos del punto 2) con «Agregar».
- **Agregar método** (`PanelAdaptable` 560): elegir del **catálogo de la plataforma** (tarjetas con
  icono; los recomendados del país arriba) o «Personalizado» (nombre; el código lo genera el servidor,
  **nunca** escribe el catálogo global). Campos: nombre visible, tipo, **cuenta de dinero destino**
  (`SelectorCuentaDinero`), requiere caja abierta, referencia obligatoria, comisión estimada (% + fijo,
  informativa), visible en POS / web, **código DIAN** (medio de pago de la factura electrónica).
- **Conexión de pago** (Wompi, Bold, QR Bancolombia/Redeban/Bre-B): **no** pide llaves. Tarjeta
  «Cobros con QR y pasarela · servicio de GO Admin» con estado (Disponible · Activado · En revisión ·
  No disponible en tu plan) y «Activar» (acepta condiciones; la plataforma asigna la conexión).
  Credenciales propias del cliente: solo como «Opción avanzada» colapsada, cifrada, para
  administradores (mismo criterio que la facturación electrónica).
- **Cobros QR**: lista de sesiones QR (estado, importe, venta, expira), vacía con «Activa Cobros QR».

Estados: listo · cargando · vacío (primer paso «Cargar métodos de Colombia») · error · sin permiso
(`billing_management`) · método en uso que no se puede quitar (motivo «Tiene 1.727 pagos; puedes
desactivarlo») · móvil (`ListCard` con `Switch`, orden con «Subir/Bajar» en el `ActionSheet`).

### 3.4 Backend (no aplicado)

| # | Cambio |
|---|---|
| P1 | Quitar INSERT/UPDATE/DELETE de `payment_methods` para `authenticated` (solo plataforma); FK de `organization_payment_methods` a `RESTRICT` |
| P2 | Métodos personalizados por organización: columnas en `organization_payment_methods` (`display_name`, `kind`, `pos_order`, `requires_cash_session`, `requires_reference`, `money_account` —`bank_account_id` o «caja del turno»—, `dian_code`, `fee_pct`, `fee_fixed`), todas NULL-ables; «personalizado» = código `org{id}_{slug}` creado por RPC |
| P3 | Sembrar filas en `organization_payment_methods` para los códigos ya usados en `payments` por cada org (Nequi, Daviplata, PSE) —inactivas en POS, activas donde hay uso web— tras revisión del dueño |
| P4 | Limpiar los 5 códigos basura (`001`, `002`, `qr`, `QR`, `SQS`) migrándolos a métodos por organización (7 y 16 pagos los usan) |
| P5 | Asiento del cobro por la cuenta de dinero del método (en vez de la regla fija 1101/1102 · 1110/1305) |

---

## 4. Monedas y tasas

### 4.1 Inventario actual

**Ruta:** `finanzas/monedas/page.tsx` (136 líneas, pestañas) → `components/finanzas/monedas/`:
`CurrencyTable`, `CurrencySelector`, `CurrencyPreferences`, `ExchangeRatesTable`, `ExchangeRatesChart`,
`ExchangeRateHistory` (+ `Pagination`), `CurrencyConverter`, `erroresMonedas.ts`. Hook de uso transversal:
`useMonedaOrganizacion()` (`lib/hooks/useOrgCurrency`), `fn_moneda_base_organizacion(org)` en la BD.
Escritura por RPC: `get_organization_currencies`, `set_organization_base_currency`,
`add/remove_organization_currency`, `set_currency_auto_update` (con permiso desde hoy).

**Datos:** `currencies` 10 (COP, USD, EUR, GBP, JPY, MXN, CAD, AUD, BRL, CLP); `organization_currencies`
79 filas: **77 orgs con base COP**, **12 orgs sin fila** (para ellas la base sale del respaldo de
`fn_moneda_base_organizacion`), **1 org con más de una moneda**. `currency_rates` 2.860 filas, base
USD, última `2026-09-28`, fuentes `openexchangerates` e `-historical`; `exchange_rates_logs` sin fallos
en 7 días. `exchange_rates` (por org) 28 filas en 7 orgs, fuente `default`, **última 2025-07-15** (muerta).

### 4.2 Problemas

1. Para 88 de 89 orgs la moneda es una sola: la pantalla con 4 pestañas (Monedas, Tasas, Histórico,
   Preferencias) es sobre-diseño para el caso real, y esconde lo único que importa: **la moneda base
   no se debería cambiar con datos** (cambia el significado de todos los importes).
2. No hay tasa manual por organización (la TRM del día del contador) ni se ve de dónde sale la tasa.
3. `exchange_rates` por organización está abandonada desde jul-2025 y convive con el catálogo global.
4. El día de la tasa: la Edge Function aún escribe con el día UTC (ADR-004, deuda 1).
5. `currencyService.getBaseCurrency` ya no devuelve `'USD'` (usa `resolveOrgCurrency`, `:48-50`). La
   clave de OpenExchangeRates **deja de viajar al navegador** en un refactor **sin commit** de otra
   sesión (`lib/services/tasasCambio.server.ts`, `tasasCambioCliente.ts` →
   `POST /api/finanzas/tasas-cambio/sincronizar`); la clave real ya estuvo expuesta y **hay que rotarla**.
6. Código muerto en la pantalla: `auto_sync_exchange_rates` de Preferencias (nadie lo lee),
   `ExchangeRatesTable` (1.127 líneas) con `handleFillRealData`, `syncRatesLegacy`, texto «Sincronizar
   Ahora» sin botón; sin UI de tasa manual (`currencyService.updateExchangeRate:231` solo lo usan tests);
   fechas con `format(new Date())` del navegador (`ExchangeRatesTable.tsx:502-547`, `ExchangeRatesChart.tsx:188`).

### 4.3 Propuesta: «Monedas y tasas»

- `PageHeader` «Monedas y tasas», icono `Coins`, acción «Agregar moneda».
- Tarjeta **Moneda base** (`Tarjeta`): «Peso colombiano (COP) · todos tus importes y la contabilidad
  están en esta moneda»; «Cambiar» deshabilitado con motivo si hay documentos («Tienes 3.569 ventas en
  COP; cambiar la base exige una migración asistida»).
- Tabla **Monedas adicionales** (vacío = estado primario para la mayoría: «Solo trabajas en COP. Agrega
  una moneda si facturas o compras en otra»): Moneda · Tasa del día (1 USD = 3.912,40 COP) · Fuente
  (`Badge`: Automática · Manual) · Fecha (día de la organización) · Actualización automática (`Switch`) · «⋯».
- **`TasaDelDiaRow` (Nuevo)** y diálogo **Registrar tasa manual** (par, tasa, fecha, motivo): prevalece
  sobre la automática ese día, con autor.
- Pestañas **Tasas · Histórico** (gráfico + tabla paginada con `DateRangeButton`) · **Conversor**
  (tarjeta lateral en escritorio).

Estados: listo · una sola moneda (vacío feliz) · cargando · error (sin tasa del día: «Última tasa del
27 sep; la actualización automática falló») · sin permiso · móvil.

### 4.4 Backend (no aplicado)

| # | Cambio |
|---|---|
| T1 | `organization_exchange_rates` (o reutilizar `exchange_rates` con `source` `manual`, `created_by`, `reason`) y `fn_tasa_vigente(org, moneda, día)` = manual del día → catálogo → anterior |
| T2 | Sembrar `organization_currencies` (base) para las 12 orgs sin fila, con la moneda de su país |
| T3 | Edge Function `actualizar-tasas-cambio` con el día de la zona del catálogo (ADR-004 deuda 1) |
| T4 | Bloqueo de cambio de base con documentos (la RPC ya valida pertenencia y permiso; falta la regla) |

---

## 5. Comisiones

### 5.1 Inventario actual

**Ruta:** `finanzas/comisiones/page.tsx` (136 líneas) → `components/finanzas/comisiones/`:
`ComisionesHeader`, `ComisionesSummary`, `ComisionesToolbar`, `ComisionesFilters`, `ComisionesList`,
`ClawbackDialog`, `ReasonDialog`, `CuentaPagoComision` (nuevo, hoy), `useComisiones`, `comisionesModel`.
Servicios: `lib/services/crm/commissionAdminService.ts` (lista, API corta en 200 en `:100`),
`commissionTransitions.ts`, `commissionService.ts` (tasas, por RPC desde hoy),
`commissionRatesServer.ts`. Rutas: `api/crm/commissions/[id]/pay`, `bulk-pay`, `money-accounts`,
`api/crm/commission-rates`. Configuración de tasas: **Configuración › CRM › Vendedores y comisiones**
(`CommissionsPanel.tsx`). En el POS: `CheckoutDialog.tsx:2215-2268` (vendedor, tipo y valor, sin permiso).
`lib/services/commissionsService.ts` huérfano (sus pagos no filtran por organización, `:143-176`).

**Cómo se calcula (hoy, corregido):** el documento lleva `salesperson_id`, `commission_type`,
`commission_rate` y método (`percentage` | `fixed_amount`). `pos_checkout_v1` / `fn_factura_venta_guardar`
devengan; `trg_create_commission_on_sale` (diferido) y `trg_create_commission_on_invoice_sale` son
respaldo; `trg_create_commission_on_invoice_purchase` y `…_on_opportunity_won` para los otros orígenes.
Asiento: `fn_auto_journal_commission` (regla `commission:accrued` 5235 D / 2370 o 2104 C; `paid`:
2370/2104 D / cuenta de dinero elegida C; `cancelled` → contra-asientos).

**Tablas:** `commissions` (231–232 filas), `vendor_commission_rates` (0), `organization_commission_rates`
(0; de proveedores de pago), `seller_commissions` (0; de la plataforma, no de este módulo).

**Datos:** 228 de facturas de venta (4 orgs), 2 de factura de compra, 1 de venta POS; 71 de monto
fijo, 157 por porcentaje; **todas `accrued`, 0 pagadas, 0 canceladas**; $ 7,7 M devengados; 231 asientos
de devengo. `sales.commission_type='salesperson'` en 1.823 ventas pero solo **3** con vendedor (el
tipo es un valor por defecto, no una decisión). 2 facturas anuladas con su comisión viva.

### 5.2 Problemas

1. La pantalla es de «liquidar», pero **no hay dónde configurar reglas** en Finanzas (vive en CRM) ni
   un concepto de periodo de liquidación: se paga comisión por comisión o en lote sin «corte».
2. Pagar no crea un egreso en Tesorería (decisión consciente del 28-sep hasta que `payments` tenga
   dirección, M5): el dinero sale en contabilidad y no en la cuenta de dinero.
3. Lista sin paginar (corte silencioso en 200).
4. Política `commissions_org_member_all`: cualquier miembro puede cambiar estado o importe por API.
5. Anular factura no cancela su comisión; oportunidad ganada puede duplicar comisión.
6. En el POS cualquiera fija la comisión (sin permiso) y el tipo no es visible.
7. Icono `HandCoins` compartido con Cuentas por pagar en el menú.

### 5.3 Propuesta: «Comisiones» (liquidación + reglas)

`PageHeader` «Comisiones», icono `BadgePercent` (**nuevo en el catálogo de iconos**), acción
«Liquidar periodo»; `TabBar` **Por pagar · Pagadas · Reglas**.
- **Por pagar**: `KpiStrip` (Devengado del periodo · Por pagar · Pagado · Vendedores); agrupación por
  vendedor (fila resumen expandible: vendedor, n comisiones, base, comisión, «Pagar») y detalle por
  documento (`ChipDocumento`, base, método —«5 %» / «$ 5.000 fijo»—, comisión, estado, asiento). Selección
  múltiple con `BulkActionBar` (Pagar · Rechazar · ⋯ Exportar).
- **Diálogo «Pagar comisiones»** (`RegistrarPagoDialog destino=tercero` en su variante de egreso):
  vendedor, periodo, total, **cuenta de dinero de salida** (`SelectorCuentaDinero`), fecha, referencia;
  resumen «Sale $ 1.240.000 de Banco ··4321 · asiento 2370 D / 1110 C». Resultado con
  `ResultadoOperacion`.
- **Rechazar / Clawback**: `DialogoMotivo` con consecuencias («se revierte el asiento de devengo»).
- **Reglas**: tasa general de la organización y tasas por vendedor con vigencia (lo de
  `CommissionsPanel`, movido o enlazado aquí), base de cálculo (**subtotal antes de impuestos**, fijo),
  quién puede fijar comisión en el POS.

Estados: listo · vacío («Aún no hay comisiones. Asigna un vendedor al cobrar o en la factura») ·
cargando · error · sin permiso (`finance.approve`) · móvil (agrupado por vendedor en `ListCard`).

### 5.4 Backend (no aplicado)

| # | Cambio |
|---|---|
| K1 | Paginación en servidor (`count` + rango) en `commissionAdminService` |
| K2 | RLS de `commissions`: SELECT por pertenencia; escritura solo por las rutas/RPC (`finance.approve`) |
| K3 | `fn_factura_venta_anular` y el camino de oportunidad cancelan/deduplican la comisión |
| K4 | Egreso en Tesorería al pagar, cuando exista M5 (`payments.direction`) |
| K5 | Permiso para fijar comisión en el POS (`pos.comision.fijar`) |

---

## 6. Impuestos

### 6.1 Inventario actual

**Ruta:** `finanzas/impuestos/page.tsx` (14) → `components/finanzas/impuestos/TaxesIndexPage.tsx` (43),
`TaxesTable.tsx` (500), `TaxForm.tsx` (436), `DeleteTaxDialog.tsx` (155), `TarifaPorDefectoCard.tsx`
(124, F-46). Escritura por RPC `manage_organization_tax` (solo exige ser miembro) salvo el `Switch`
«Activo», que hace `UPDATE` directo sin filtro de organización (`TaxesTable.tsx:141-144`). Error de carga
= «No hay impuestos» (`:294-309`); `TaxForm` nunca activa su `loading` (`:159-221`); código muerto
(`TaxForm.tsx:224-244`, `DeleteTaxDialog.tsx:38-52`). UI vieja, sin i18n, sin permisos.
Impuestos por producto: `product_tax_relations` (desde el formulario de producto, `TaxMultiSelect`).
Figma ya tiene la lista rehecha (`07 › Impuestos 195:12716`, captura
`55-coherencia-impuestos-escritorio-listo.png`).

**Los tres motores del POS (sin cambios; no se toca la semántica):**
(a) `posService.calculateCartTotals` (`lib/services/posService.ts:2057-2164`), (b) `TaxSummary.tsx:117-240`,
(c) `CheckoutDialog.tsx:938-1000` con reparto por peso (`:1135-1150`) + la mesa (`hooks/useMesaTaxes.ts:100`).
Análisis completo en `POS-CARRITO-LINEAS-NOTAS.md` §7. Resolución de la tasa de la línea:
`lib/services/taxResolverCore.ts` (4 pasos: línea → `appliedTaxes` → `product_tax_relations` →
`is_default`).

**Hallazgo «exento cae a la tarifa por defecto» (vigente):** `taxResolverCore.ts:148`
`if (itemRate > 0 || itemTaxIsFinal)` no respeta una tasa 0; una relación a IVA 0 % da `rate=0` y cae
al paso 4 (`:194-198` → `:206-219`); `posService.ts:1598-1601` vuelve a resolver sin `itemTaxIsFinal`.
`taxCoverage.ts:14-16` afirma lo contrario («tarifa 0 relacionada es a propósito»).

**Datos:**

| Dato | Valor |
|---|---|
| `organization_taxes` | 456 filas en 76 orgs; **6 por org, todas copiadas de la plantilla CO**: IVA 19, IVA 5, IVA 0, **RETE 4, RETE 11, ICA 0,97** — las tres retenciones están **activas como si fueran impuestos de venta** |
| Tarifa por defecto (`is_default`) | **1 org** de 76 (la org 2); 75 sin defecto (F-46: decisión explícita por org) |
| `rate` | `numeric(5,2)` en `organization_taxes` y `tax_templates`: el ICA 9,66 ‰ (0,966 %) queda **0,97 %** |
| `tax_included` en `organization_taxes` | `false` en todas; sin efecto en el POS (§7.1 del doc del POS) |
| Productos | 62.344 no borrados; **3.548 (5,7 %) con impuesto asignado** (3.545 IVA 19, 2 IVA 5, **1 IVA 0**) |
| En la org con defecto | 31 productos sin impuesto → caen al 19 % |
| Líneas de venta (90 días) | 5.555 con tasa 0, 147 con 19 %, **6 con tasas 0,8407 y 1,4179** (el «reparto por peso» del motor (c) escrito en la línea) |
| Ventas con precios «IVA incluido» | 21 de 3.997 |
| `tax_account_mapping` | 288 filas en 48 orgs, **tabla muerta** (F-43) |
| Retenciones en ventas | no existen; en compras `invoice_purchase_withholdings` 0 filas |

### 6.2 Problemas

1. **Retenciones mezcladas con impuestos**: RETE 4 %, RETE 11 % e ICA aparecen en el selector de
   impuestos del producto y del POS como si fueran tarifas de venta (el diseño de Figma los muestra en la
   misma tabla con «Tipo: Retención»).
2. **Exento ≠ sin impuesto**: el sistema no distingue «este producto está exento/excluido (0 %)» de «no
   configuré el impuesto». Con tarifa por defecto, el exento cobra 19 %; sin ella, el no configurado
   cobra 0 %.
3. 94 % de los productos sin impuesto: el aviso de F-54 existe en factura/POS, pero la pantalla de
   Impuestos no dice cuántos productos dependen del defecto.
4. `numeric(5,2)` no guarda el ICA (por mil) — el diseño promete «0,966 %» y la BD no lo puede guardar.
5. «Incluido en precio» por impuesto (`tax_included`) se ofrece y no hace nada.
6. Tasas repartidas (0,8407 %) en `sale_items.tax_rate`: el reporte de impuestos por tarifa las verá
   como tarifas nuevas.
7. Escritura sin permiso y con `UPDATE` directo; error = vacío.

### 6.3 Propuesta: «Impuestos» (configuración, sin cambiar semántica del cálculo)

Se parte del frame aprobado `830:526193` (lista) y se amplía:
- `PageHeader` «Impuestos», icono `Percent`, acción «Nuevo impuesto» + «⋯» (Cargar plantilla de
  Colombia · Exportar). `TabBar` **Impuestos de venta y compra · Retenciones · Por producto**.
- **Tarjeta «Tarifa para productos sin impuesto»** arriba (`Tarjeta` tono advertencia si aplica): «3.548
  de 62.344 productos tienen impuesto. Los otros 58.796 usan: **Ninguna (0 %)** · Cambiar». Con enlace
  «Ver productos sin impuesto» (catálogo filtrado). Nota explícita: «Un producto **exento** o **excluido**
  se marca así en el producto; no usa esta tarifa» (diseño de la distinción; ver B-I1).
- Tabla **Impuestos**: Nombre · Tipo (`Badge` IVA · INC · Otro) · Tarifa (con 3 decimales cuando aplica;
  «por mil» para ICA) · Código DIAN (01 IVA, 04 INC…) · Productos (n, enlace) · Estado (`Switch`) · «⋯»
  (Editar · Duplicar · Hacer predeterminado · Desactivar · divisor · Eliminar —bloqueado con motivo si
  tiene productos o documentos).
- Pestaña **Retenciones**: ReteFuente, ReteIVA, ReteICA (tipo, tarifa, base mínima en UVT, aplica a
  compras/ventas). Estado «Próximamente en ventas» (hoy solo compras las usa).
- Pestaña **Por producto**: cobertura por categoría (barra «con impuesto / sin impuesto / exento») y
  asignación masiva (elegir categoría → impuesto) con vista previa del número de productos.
- **Diálogo Nuevo/Editar impuesto** (`PanelAdaptable` 560): nombre, tipo, tarifa (`CampoNumero` 3
  decimales, sufijo %), código DIAN, cuentas contables (IVA generado / descontable; `SelectorCuenta`),
  «Predeterminado». Sin «Incluido en precio» (no tiene efecto: se quita del formulario; la expresión del
  precio se decide en el POS con C3/C4).

Estados: los 6 de lista (ya dibujados para la lista) + «plantilla sin cargar» + sin permiso
(`finance.approve`) + móvil (ya dibujado `830:534553`, se amplía con la tarjeta de tarifa).

**Nada cambia en el POS**: el diseño no toca C1–C4 ni los tres motores; la decisión sobre «Excluir
impuesto» sigue pendiente (§7.5 del doc del POS).

### 6.4 Backend (no aplicado)

| # | Cambio |
|---|---|
| B-I1 | `products.tax_treatment` (`gravado` · `exento` · `excluido` · NULL = sin configurar) o `is_tax_exempt`; el resolutor respeta 0 cuando es exento y solo usa el defecto cuando es NULL. **Cambia cálculo → tarea propia con los tests de `impuestosLineaCarrito`** |
| B-I2 | `organization_taxes.kind` (`tax` · `withholding`); los selectores de venta filtran `tax`; las 3×76 retenciones se reclasifican |
| B-I3 | `rate` a `numeric(7,4)` (cambio de tipo en tabla con datos: requiere excepción a la política de migraciones; alternativa `rate_per_mille` aditiva) |
| B-I4 | `organization_taxes.dian_code` (hoy `INC_8` cae a IVA `01`, `factusService.ts:777-796`) |
| B-I5 | Escritura por RPC con permiso (`finance.approve`); el `Switch` pasa por la RPC |
| B-I6 | `fn_impuestos_cobertura(org)` para la tarjeta y la pestaña «Por producto» |

---

## 7. Componentes: reutilizados y nuevos

Reutilizados del kit (código y Figma): `PageHeader`, `Breadcrumbs`, `KpiStrip`/`StatCard`, `KpiCompacto`,
`ListToolbar`, `SearchInput`/`SearchBar`, `FilterButton`, `FilterPanel`, `FilterChips`, `DataTable`,
`ListCard`, `Pagination`/`PaginationCompact`, `RowActionsMenu`/`ActionSheet`, `BulkActionBar`,
`EmptyState` (5 variantes), `Skeleton`, `StatusBadge`/`Badge`, `BranchBadgeActiva`, `TabBar`,
`SegmentedControl`, `DateRangeButton`, `FormSection`/`FormField`, `CampoNumero`, `Switch`, `Dialogo`,
`PanelAdaptable`, `DialogoMotivo`, `ResultadoOperacion`, `FilaDato`/`ListaDatos`, `Tarjeta`,
`RelatedLinkCard`, `ChipDocumento`, `CadenaDocumento`, `CustomerPicker`, `SupplierPicker`,
`RegistrarPagoDialog`, `Stepper`, `AccionRapida`. De Contabilidad v2 (Figma): `SelectorCuenta`,
`OrigenAsiento`, `MarcaReversion`, `Aviso`, `TablaContable`.

Nuevos (marcados «Nuevo» en Figma; en código irían a `src/components/kit/`):

| Componente | Ejes | Uso |
|---|---|---|
| `MovimientoTipoBadge` | Tipo: entrada · salida · traslado · anulado | Movimientos (sustituye «Caja/Banco» crudo) |
| `CuentaDineroCard` | Tipo caja · banco × Estado activa · inactiva · vencida × Layout desktop · mobile | Cuentas de dinero |
| `SelectorCuentaDinero` | Estado cerrado · abierto · con deshabilitadas | Altas de movimiento, métodos de pago, pagar comisiones |
| `AsientoEnlazado` | Estado generado · sin regla · falló · no aplica | Detalle de movimiento, transferencia, pago de comisión |
| `EfectoEnCuenta` | Tipo entrada · salida · traslado × Oculto (cierre ciego) | Altas (generaliza «Efecto en la caja» de Cajas) |
| `TasaDelDiaRow` | Fuente automática · manual × Estado vigente · vencida | Monedas |
| `CoberturaImpuestos` | barra con/sin/exento | Impuestos |

## 8. Frames a dibujar (priorizados)

Sección nueva «Finanzas — Tesorería v2 (propuesta)» en `07 Finanzas`, debajo de Contabilidad v2.

| Prio | Frame | Escritorio 1440 | Tableta 1024 | Móvil 390 |
|---|---|---|---|---|
| **P0** | Mapa: menú Tesorería + ruta vieja → nueva | 1 | — | — |
| **P0** | Movimientos — lista: listo · cargando · vacío · error · sin permiso · filtros abiertos | 6 | 1 | listo · vacío |
| **P0** | Movimientos — Nuevo ingreso (caja, con efecto) · Nuevo egreso (supera disponible) · Traslado caja → banco · sin caja abierta | 4 (diálogo) | — | 1 (hoja) |
| **P0** | Movimientos — detalle con asiento y cadena · Anular (`DialogoMotivo`) | 2 | — | 1 |
| **P0** | Cuentas de dinero — cuentas (cajas + bancos, una vencida) · cierre ciego · vacío | 3 | 1 | 1 |
| **P0** | Cuentas de dinero — nueva cuenta bancaria · detalle de banco (movimientos) | 2 | — | — |
| **P1** | Métodos de pago — lista ordenable (con huérfano «usado y no configurado») · agregar método · conexión de pago como servicio | 3 | — | 1 |
| **P1** | Impuestos — lista con tarjeta de tarifa + pestaña Retenciones · editar impuesto | 2 | — | — |
| **P1** | Comisiones — por pagar agrupado · pagar comisiones (cuenta de salida) | 2 | — | 1 |
| **P2** | Monedas — una moneda (vacío feliz) · con USD y tasa manual | 2 | — | 1 |
| **P2** | Cuentas de dinero — Posición y Alertas; Importar extracto (3 pasos) | 3 | — | — |

## 9. Preguntas para el dueño (con recomendación)

1. **¿Movimientos incluye ventas y cobros (`payments`)?** Recomendación: **sí, en fase 2**, cuando
   `payments` guarde dirección y cuenta de dinero (M5); en fase 1 solo manuales, bancarios y traslados,
   con un aviso «Las ventas y cobros llegarán aquí».
2. **Cajas vencidas (12 abiertas > 24 h):** ¿se muestran como alerta en Cuentas de dinero con «Cerrar con
   arqueo»? Recomendación: sí, solo con `pos.cajas.cerrar_ajenas`.
3. **Egreso mayor al disponible:** ¿bloquear o avisar? Recomendación: **bloquear en bancos** (la RPC de
   traslado ya lo hace) y **avisar en caja** (el esperado puede estar desfasado por ventas sin sincronizar).
4. **Métodos de pago huérfanos** (Nequi, Daviplata, PSE usados en 684 pagos sin estar configurados):
   ¿se siembran por organización? Recomendación: sí, desactivados en POS y activos en web donde ya hay uso.
5. **Métodos personalizados**: ¿se permiten por organización (sin tocar el catálogo global)?
   Recomendación: sí (P2), con código generado por el servidor.
6. **Retenciones fuera de «Impuestos de venta»** (RETE 4/11 e ICA hoy activas como impuestos en 76 orgs):
   ¿se reclasifican? Recomendación: sí (B-I2), sin borrar filas.
7. **Exento vs. sin configurar**: ¿se agrega el tratamiento tributario del producto (B-I1)? Es un cambio de
   cálculo: recomendación sí, en su propia tarea con los tests del POS; el diseño ya lo muestra.
8. **Tarifa ICA por mil**: ¿se amplía la precisión de la tasa (cambio de tipo) o se agrega columna?
   Recomendación: columna aditiva `rate_per_mille`, sin cambio de tipo.
9. **Comisiones: ¿liquidación por periodo** (corte mensual por vendedor) o pago por comisión suelta?
   Recomendación: por periodo, con el pago de comisión suelta como excepción.
10. **Reglas de comisión**: ¿se mudan de Configuración › CRM a Finanzas › Comisiones › Reglas?
    Recomendación: sí, con un enlace desde CRM.
11. **Moneda base con datos**: ¿se bloquea el cambio? Recomendación: sí (T4).
12. **Tasa manual por organización**: ¿prevalece sobre la automática del día? Recomendación: sí, con autor
    y motivo.
13. **Borrar sesiones de caja** (hoy borra en cascada sus movimientos y deja 104 asientos huérfanos):
    ¿se prohíbe (M7)? Recomendación: sí.

## 10. Estado de esta entrega

- Análisis: hecho (este documento).
- Figma: dibujado el 2026-09-28 (§11).

## 11. Dibujo en Figma (2026-09-28)

Archivo `EAvjINVRnlzFM70GVoWXgl`, página `07 Finanzas`, sección **«Finanzas — Tesorería v2
(propuesta)»** `1000:79660` (x 0, y 41.800, debajo de Contabilidad v2), enlazada en el Índice
`264:98924`. Enlace: https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1000-79660

Componentes nuevos (marca «Nuevo»), en `02 Componentes › Finanzas — kit/tesorería (Nuevo)` `997:32520`:
`MovimientoTipoBadge` `997:32549` (entrada · salida · traslado · anulado), `CuentaDineroCard` `997:32768`
(caja activa · vencida · oculta × banco activa · sin cuenta contable · inactiva; propiedades Nombre,
Detalle, Saldo), `EfectoEnCuenta` `997:32857` (entrada · salida · traslado · oculto · supera disponible;
sobre `FilaDato`), `AsientoEnlazado` `997:32917` (generado · sin regla · no aplica; con `ChipDocumento
Asiento`), `SelectorCuentaDinero` `997:32996` (cerrado · abierto con opciones deshabilitadas con motivo).
Todo con variables de color del archivo (sin hex), Inter, instancias del kit (`Badge`, `Button`,
`FilaDato`, `ChipDocumento`).

Frames (todos construidos sobre la plantilla aprobada de Contabilidad v2: `Sidebar`, `AppHeader`,
`Breadcrumbs`, `PageHeader`, `StatCard`, `TabItem`, `SearchBar`, `DateRange`, `FilterButton`, `Pagination`,
`EmptyState`, `Skeleton`, `FormField`, `Switch`, `ListCard`, `KpiCompacto`, `MobileHeader`, `MobileTabBar`,
`CadenaDocumento`, `SelectorCuenta`, `RelatedLinkCard`):

| Prio | Frame | Id |
|---|---|---|
| P0 | Mapa de navegación | `1009:86249` |
| P0 | Movimientos — listo · cargando · vacío · sin resultados · error · sin permiso | `1000:79670` · `1000:80874` · `1000:81586` · `1000:82159` · `1000:82820` · `1000:83460` |
| P0 | Nuevo movimiento — ingreso en caja · egreso que supera el disponible · consignar caja a banco · sin caja abierta | `1004:82085` · `1004:82267` · `1004:82448` · `1004:82618` |
| P0 | Anular movimiento (`DialogoMotivo`) | `1004:82759` |
| P0 | Movimiento — detalle (asiento + cadena) | `1006:82454` |
| P0 | Movimientos — tableta 1024 (riel, KPIs 2×2, columnas ocultas) | `1006:83228` |
| P0 | Móvil — Movimientos listo · vacío · alta en hoja | `1006:84021` · `1006:84803` · `1006:84983` |
| P0 | Cuentas de dinero — listo · cierre ciego · vacío · móvil | `1007:83724` · `1007:84611` · `1007:85454` · `1007:86159` |
| P0 | Nueva cuenta bancaria · detalle de cuenta bancaria | `1009:85183` · `1009:85377` |
| P1 | Métodos de pago — listo · agregar método · móvil | `1010:85721` · `1010:86654` · `1010:86844` |
| P1 | Impuestos — listo con tarifa para productos sin impuesto · retenciones · editar impuesto | `1012:86383` · `1012:87187` · `1012:87865` |
| P1 | Comisiones — por pagar agrupado · pagar comisiones | `1012:87993` · `1012:89017` |
| P2 | Monedas — una sola moneda · con monedas adicionales | `1013:87674` · `1013:88302` |

Chequeo por script (sobre la sección): 33 frames, 0 solapes entre frames, 0 anotaciones encima de un
frame (las 33 etiquetas se subieron por encima de su frame), 0 instancias rotas, 0 nodos sueltos de la
página encima de la sección; los 6 textos que desbordaban la columna «Entra a» de Métodos de pago se
ajustaron a 148 px con salto de línea.

Capturas: `docs/design/figma/72-tesoreria-00-seccion.png` … `72-tesoreria-21-componentes-nuevos.png`
(22 archivos).

**Pendiente del dibujo:**
- P2 no dibujado: Cuentas de dinero › Posición y Alertas; «Importar extracto» (3 pasos); Comisiones ›
  Reglas; Métodos de pago › Cobros QR; móvil de Impuestos (existe el aprobado `830:534553`),
  Comisiones y Monedas; tableta de Cuentas de dinero.
- Filtros abiertos (`FilterPanel`) de Movimientos: no se dibujó; se usa el patrón de Libro diario v2.
- `CuentaDineroCard`: las propiedades de texto solo están enlazadas en las variantes de caja
  (las de banco se sobrescriben a mano en la instancia).
- Icono `BadgePercent` para Comisiones: pendiente de anotar en `CATALOGO-ICONOS.md`.

## 12. Respuestas del dueño (2026-09-28)

| # | Respuesta |
|---|---|
| 1 | **Sí**: Movimientos muestra también ventas y cobros, como se recomendó (fase 2, cuando `payments` guarde dirección y cuenta de dinero; en fase 1 el aviso). |
| 2 | **Sí**, como se recomendó: alerta de cajas vencidas con «Cerrar con arqueo», solo con `pos.cajas.cerrar_ajenas`. |
| 3 | **Bloquear en bancos y avisar en caja.** |
| 4 | **Sí** a sembrar por organización los métodos que ya se usan sin estar configurados. Matiz del dueño: **PSE va ligado a una integración** (pasarela con conexión), no como método manual suelto. Nequi y Daviplata: duda de si son un método propio o caen en «transferencia» genérica / pasarelas. Propuesta para cerrar la duda: Nequi y Daviplata como métodos propios de tipo billetera (la conciliación los separa y ya hay pagos con ese código); PSE solo aparece activo cuando hay una pasarela conectada. |
| 5 | Implícito en la 4: la organización crea sus propios métodos (sin tocar el catálogo global). |
| 6 | Sin respuesta explícita (reclasificar RETE/ICA fuera de «Impuestos de venta»). Queda pendiente de confirmar; recomendación sin cambios. |
| 7 | **Sí**, el producto tiene su propio tratamiento tributario (exento vs. sin configurar), **en una tarea aparte** porque cambia el cálculo. |
| 8 | **Sí**: columna aditiva `rate_per_mille` para la tarifa ICA por mil. |
| 9 | **Sí**: las comisiones se liquidan por periodo. |
| 10 | **Sí**: las reglas de comisión pasan de Configuración › CRM a Finanzas. |
| 11 | **Sí**: se bloquea cambiar la moneda base cuando ya hay documentos. |
| 12 | **Sí** a la tasa manual. El dueño prefiere la integración que actualiza la tasa constantemente (Open Exchange Rates) y pide ver las dos opciones: automática por defecto y manual con autor y motivo que prevalece. |
| 13 | **Sí**: se prohíbe borrar sesiones de caja con movimientos (evita asientos huérfanos). |
