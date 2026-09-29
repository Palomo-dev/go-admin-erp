# Finanzas · Contabilidad — estado real, propuesta de diseño y lo que falta para que funcione

Fecha: 2026-09-23. Bloque «Contabilidad» del pedido del dueño («analiza todas las páginas del
módulo de Finanzas y dibújalas en Figma… estados mayores, reglas contables, impuestos, cómo sería
el detalle, todo»).

> **Estado de esta tanda: análisis verificado y especificación completa; Figma SIN dibujar.**
> El cupo del MCP de Figma estaba agotado desde la primera llamada (`use_figma` y `get_metadata`
> devolvieron «You've reached the Figma MCP tool call limit»). No se escribió ni un nodo en el
> archivo `EAvjINVRnlzFM70GVoWXgl`, no hay capturas `51-contabilidad-*.png` y el «Índice» de
> `07 Finanzas` no se tocó. Este documento deja **cada Sección especificada frame por frame** para
> que la próxima tanda sea solo de dibujo (§6 trae el orden y el presupuesto de llamadas).

Fuentes: código en `src/` (solo lectura), BD `jgmgphmzusbluqhuqihj` con `SELECT` de conteos y
catálogo (`information_schema`, `pg_proc`, `pg_trigger`, `pg_policies`), y el progreso del núcleo
contable (`docs/progreso-cierre-contable.md`, `docs/decisiones/ADR-CC-001…010`,
`docs/hallazgos/F-*.md`). No se repite el inventario de controles de
`AUDITORIA-CONTROLES-FINANZAS.md` §E.1–E.15 y §F ni el análisis de
`AUDITORIA-TESORERIA-CONTABILIDAD.md` §C–E y §J: se citan. Sin nombres de organizaciones.

---

## 0. Qué cambió desde las auditorías del 22 (y qué no)

**Cambió mucho la base; casi nada la interfaz.** Desde el 22-sep, los commits contables
(`d8090114`, `eb8c97ee`, `56f76ffe`, `fe8439c6`, `27dcec66`, `ac19309a`, `199fe604`…) rehicieron
el motor: asiento único por hecho (`fact_key`), contra-asientos en `journal_reversals`, rechazos
registrados en `journal_entry_failures`, costo de ventas solo por el kardex. En
`src/components/finanzas/contabilidad/**` y satélites solo entraron arreglos de fechas
(`027940f8`, `939deac2`) y la tarjeta de tarifa por defecto de Impuestos (`7c44694a`).
`ReportesContablesService.ts` tiene además cambios **sin commit de otra sesión** (fechas y tasa de
cambio): los números de línea de abajo son los del árbol de trabajo de hoy.

Medido hoy en la BD:

| Medida | Valor hoy | Nota |
|---|---|---|
| Asientos | 22.130 en 21 orgs | eran 13.511 el 22; la diferencia son sobre todo contra-asientos |
| Contra-asientos (`source='reversal'`) | **5.901** (5.864 enlazados en `journal_reversals`) | categorías F-48 2.310 · CC-001 1.942 · F-01 1.278 · F-45 249 · CC-009 52 · F-49 31 · F-63 2 |
| Memo del contra-asiento | «REVERSION F-48 \| cierre-contable-2026-09-23 \| asiento 201 \| Venta POS …» | la UI lo mostraría crudo |
| Asientos manuales | **0** | nadie ha usado el alta manual |
| Borradores (`posted=false`) | **0** | |
| Asientos sin líneas | 1 | el huérfano ya citado |
| Asientos descuadrados | 0 | |
| Máximo de líneas por asiento | 3 | el motor sigue sin asientos de N líneas |
| `journal_lines.currency_code` NULL | 45.139 de 45.139 | los informes usan `debit`/`credit` crudos |
| `journal_lines.cost_center_id` | 0 | |
| Rechazos en `journal_entry_failures` | 102, **0 abiertos** | 99 `no_rule` (resueltos con el kardex, ADR-CC-010) + 3 sondas |
| `v_salud_contable` | 21 orgs, **0 con balance descuadrado**, **16 con diferencia de cartera** libro≠documentos | solo `service_role` |
| Periodos | 1.020 mensuales + 83 anuales, **todos `open`**, 0 duplicados | nadie ha cerrado nunca |
| Reglas contables | 3.594, todas activas; **32 orígenes, 24 eventos** en uso | la UI ofrece 13 y 8 |
| Cuentas | 85 planes, ~47 cuentas promedio | |
| Cuentas padre con movimiento directo | **8 cuentas, 124 líneas** | desaparecen de los informes de árbol (ver E-3) |
| Centros de costo · activos · depreciaciones · presupuestos · líneas | **0 · 0 · 0 · 0 · 0** | |
| Comisiones | 231, todas `accrued`, 231 asientos | |
| Impuestos por organización | 432; plantillas `IVA_19`, `IVA_5`, `IVA_0`, **`RETE_4`, `RETE_11`, `ICA_0.966`** activas en 72 orgs | las retenciones existen como «impuesto» y nadie las usa (0 líneas, 0 productos) |
| `dian_tributes` tipo `withholding` | 3 | antes 0 |

---

## 1. Estado real por página

Leyenda: ✅ funciona · 🟡 funciona a medias · 🔴 roto o engañoso · ⚫ no existe.

| Página (ruta) | Estado | Qué funciona | Qué está roto o falta (verificado hoy) |
|---|---|---|---|
| Hub `/contabilidad` | 🟡 | KPIs y accesos | Cuenta los 5.901 contra-asientos como «asientos»; no hay salud contable (rechazos, cuadre, cartera); «Nueva cuenta» lleva `?action=new` y el destino no lo lee |
| Plan de cuentas `/contabilidad/plan-cuentas` | 🟡 | Árbol, búsqueda, alta/edición | Borrado **físico** aun con hijos o movimientos (lo frena la FK solo a veces); `is_active` no se puede cambiar; `BranchBadge` decorativo; descripción guarda HTML; al filtrar, el hijo se promueve a raíz; sin saldo por cuenta, sin importar PUC |
| Libro diario `/contabilidad/asientos` | 🔴 | Lista, filtros en cliente, alta con partida doble validada en cliente | **Alta manual = dos `insert` desde el navegador** (`ContabilidadService.ts:295-338`), sin transacción y **sin `fn_is_period_open`**: graba en periodo cerrado; `eliminarAsiento` borra físicamente (`:361`); sin paginación (22.130 filas al navegador); origen crudo (`reversal`, `invoice_sales`…); no distingue contra-asiento ni corregido |
| Detalle `/contabilidad/asientos/[id]` | 🔴 | Líneas y totales | Origen como texto, no enlace; no muestra `fact_key`, contra-asiento, quién creó, moneda ni centro de costo; **no hay «Revertir»**: la única salida es borrar. `fn_revertir_asiento(id, categoria, lote)` existe pero es solo `service_role` y pide un lote técnico |
| Mayor `/contabilidad/mayor-contable` | 🟡 | Saldo inicial, corrido y final por cuenta | Sin `range`: PostgREST corta y **el saldo final puede quedar truncado sin avisar**; muestra el memo del asiento y no la descripción de la línea; «#id» no enlaza; sin sucursal ni origen; sin exportar |
| Balance de comprobación | 🔴 | Consulta por rango, CSV | **Saldo final mal calculado** (`ReportesContablesService.ts:237-260`: saldo inicial neto + movimientos brutos); sin estado vacío ni de error; cabeceras sin tildes; sucursal decorativa |
| Estado de resultados | 🔴 | Árbol ingresos/gastos, utilidad | **Cuenta padre con hijos descarta su saldo propio** (`:339-341`); sin costo de ventas separado ni márgenes; sin exportar |
| Balance general | 🔴 | Árbol A/P/Pt, franja de cuadre | Mismo defecto de padres (`:435-437`) y **no arrastra el resultado del ejercicio** → siempre «descuadrado» por el importe de la utilidad |
| Informes financieros `/finanzas/reportes` | 🟡 | 6 tarjetas (P&G, flujo, cartera, impuestos, caja, bancos) con RPC `fn_reporte_*` ya cerradas a anon (F-53) | Tarjeta «IVA y retenciones» sin retenciones (R8); P&G distinto del de `/contabilidad` (dos cálculos) |
| Periodos `/contabilidad/periodos-fiscales` | 🔴 | Generar 12 meses, cerrar | «Bloquear» y «Anual» fallan siempre (CHECK); reabrir sin confirmación; cerrar no valida nada ni genera asiento de cierre |
| Periodos `/periodos-contables` (huérfana) | 🟡 | Tabla con KPIs y filtro por año, enum correcto | No está en el catálogo de navegación (`src/lib/navigation/catalog.ts:389-404`); «Cerrado por» muestra fecha |
| Cierre real de periodo | ⚫ | — | `fn_is_period_open` solo mira `monthly`, devuelve `true` si no hay periodo; solo lo consulta `fn_create_journal_entry` (automáticos) |
| Reglas contables `/reglas-contables` | 🔴 | CRUD y activar | Update/delete **sin filtro de organización** en el servicio; UI con 13 de 32 orígenes y 8 de 24 eventos (al editar una regla PMS/nómina **se pierde el valor**); duplicar falla siempre (UNIQUE con prioridad); `conditions` y `discount_account_code` sin UI; **sin vista previa**: una errata apaga un hecho entero (ahora al menos queda en `journal_entry_failures`, F-60) |
| Fallos de contabilización | ⚫ | La tabla `journal_entry_failures` y la vista `v_salud_contable` existen | No hay bandeja en la UI; `v_salud_contable` es solo `service_role` |
| Impuestos `/impuestos` | 🟡 | Lista, alta, tarifa por defecto (F-46) | Sin «tipo de tributo» ni cuenta contable por impuesto (`organization_taxes` no tiene columnas contables; `tax_account_mapping` sigue muerta, F-43); **`RETE_4`/`RETE_11`/`ICA_0.966` aparecen como impuestos normales y nada impide asignarlos a un producto, donde sumarían en vez de restar** |
| Retenciones (fuente, IVA, ICA) | ⚫ | `invoice_items.withholding_taxes` y `dian_tributes` `withholding` | Ningún documento las captura, ni resta del total, ni asiento, ni certificado (G.3) |
| Centros de costo | 🟡 | CRUD plano | `parent_id` sin selector; ningún formulario captura `cost_center_id`; 0 centros |
| Activos fijos | 🔴 | Alta y lista | Depreciación inexistente (`asset_depreciations` vacía, 2 de 3 métodos dan 0); cuentas del activo sin campos; baja/venta inalcanzables; 0 activos |
| Presupuestos | 🔴 | Crear cabecera | **No se pueden cargar líneas** (`upsertLine` sin UI); estados crudos; `fn_reporte_presupuesto_vs_real` existe y la pantalla no la usa; 0 presupuestos |
| Comisiones `/comisiones` | ✅ | Route handler + `getServerOrgContext`, estados, pago, clawback, accesibilidad | Anular una comisión `accrued` **no revierte su asiento** (`fn_auto_journal_commission` solo trata `accrued` y `paid`); sin paginación ni exportar |

---

## 2. Reglas contables que el diseño da por sentadas (del núcleo contable)

El diseño no inventa lógica: dibuja la vigente.

1. **Un asiento por hecho económico** (`journal_entries.fact_key`, p. ej. `accrual:sale:{id}`,
   `reversal:{id}`). La venta devenga contra la cuenta que salda el cobro (ADR-CC-001); el cobro
   mueve dinero y cartera, no ingresos.
2. **Nada se borra: se revierte.** Un asiento publicado se corrige con un contra-asiento
   (`fn_revertir_asiento`: mismas cuentas, débito↔crédito, misma fecha contable) y, si aplica, un
   asiento corregido. El detalle debe mostrar el trío original → contra-asiento → corregido.
3. **Costo de ventas por un solo camino, el kardex** (ADR-CC-010): el P&G separa «Costo de ventas»
   (cuentas 6) de «Gastos» (5).
4. **Día contable de la organización** (`todayInTz`, `formatDateInTz` para `timestamptz`,
   `formatPlainDate` para `date`). `entry_date` es `timestamptz`; `fiscal_periods.start_date` es
   `date`.
5. **Ningún rechazo es silencioso** (F-60): si no hay regla, cuenta o periodo abierto, el hecho
   queda en `journal_entry_failures` con su motivo.
6. **Nota crédito sobre factura pagada → saldo a favor en 2805** (ADR-CC-008).
7. **Compra: un solo asiento, con la factura** (ADR-CC-009).

---

## 3. Propuesta de diseño — `07 Finanzas`, una Sección por página

Convenciones comunes (todas las Secciones):

- **Shell nuevo** en cada frame: escritorio `AppHeader` + `Sidebar` (grupo «Contabilidad» activo);
  móvil `MobileHeader` + `MobileTabBar`. Escritorio 1440 × auto, móvil 390 × auto.
- **Kit**: `DataTable`/`TableCell`, `FilterPanel`, `Chip`, `Badge` (tonos de `SISTEMA-BADGES.md`),
  `EmptyState`, `Skeleton`, `Pagination`, diálogos `Layout=desktop|sheet`, tarjeta móvil de
  «Móvil · Proveedores — listo», y de `02 Componentes › Finanzas`: `DocumentHeader`,
  `DocumentStatusBadge`, `ChipDocumento` (`680:406423`), `CadenaDocumento` (`680:409052`).
- **Estados obligatorios por página**: listo · cargando (`Skeleton`) · vacío (`EmptyState` con
  acción) · sin resultados (filtros activos + «Limpiar filtros») · error (con «Reintentar» y
  detalle técnico plegado) · sin permiso (`EmptyState` candado, «Pide acceso a un administrador»)
  · **periodo cerrado** (banner ámbar «Marzo 2026 está cerrado: no se pueden registrar ni revertir
  asientos con esa fecha. Reábrelo o usa una fecha de un periodo abierto.»).
- **Móvil**: informes en **acordeón por grupo de cuentas** (Activo › Corriente › Caja y bancos…)
  con importe alineado a la derecha y total fijo abajo; listas en tarjeta; nunca tabla con scroll
  horizontal.
- Datos ficticios, pesos colombianos (`$ 1.250.000`), PUC colombiano.

### Componentes nuevos o variantes a crear en `02 Componentes › Finanzas`

| Componente | Ejes | Uso |
|---|---|---|
| `AccountPicker` | `State` cerrado · abierto · con búsqueda · error; `Layout` popover · sheet | Buscar cuenta por código o nombre, árbol con padres deshabilitados si la org exige cuentas de detalle. Sustituye los Select planos sin búsqueda de asientos, reglas, activos y mayor |
| `JournalLinesTable` | `Mode` lectura · edición; `Layout` table · cards | Líneas del asiento: cuenta (código + nombre), descripción, centro de costo, débito, crédito; pie con Σ débito, Σ crédito y diferencia |
| `JournalBalanceBar` | `Estado` cuadra · no cuadra · vacío | «Débitos $ 1.190.000 · Créditos $ 1.190.000 · Cuadra» verde / «Diferencia $ 19.000» rojo; habilita o bloquea «Publicar» |
| `EntryOriginBadge` | `Origen` venta · factura venta · cobro · compra · pago · kardex · caja · banco · comisión · nómina · manual · contra-asiento · apertura · cierre | Traduce `source` crudo; el contra-asiento lleva icono de flecha circular y tono neutro |
| `ReversalMark` | `Rol` original revertido · contra-asiento · corregido | Franja en el detalle: «Revertido por #8.231 el 23 sep 2026 · Motivo: IVA al débito» con enlaces |
| `PeriodStatusBadge` | `Estado` abierto · cerrando · cerrado | Tonos success · warning · neutral |
| `ReportTreeRow` | `Nivel` 1–4 × `Tipo` grupo · cuenta · total; `Layout` desktop · acordeón | Filas de balance/P&G; el grupo muestra **saldo propio + hijos** (ver E-3) |
| `LedgerRow` | `Layout` table · card | Fila del mayor: fecha, asiento (enlace), `ChipDocumento`, descripción, débito, crédito, saldo corrido |
| `CloseChecklistItem` | `Estado` ok · aviso · bloquea | Ítem del checklist de cierre con conteo y enlace |
| `RulePreview` | `Estado` cuadra · cuenta inexistente · sin datos | Asiento resultante simulado de una regla, con `JournalLinesTable` en lectura |

### 3.1 «Contabilidad — Plan de cuentas»

- Escritorio **listo**: `PageHeader` («Plan de cuentas», «Importar PUC», «Exportar», «Nueva
  cuenta»); `FilterPanel` (tipo, estado activa/inactiva, «con movimiento»); árbol en `DataTable`
  con columnas Código · Nombre · Tipo (`Badge`) · Naturaleza (Débito/Crédito) · Saldo al día ·
  Estado · «…» (Editar · Ver en el mayor · Desactivar). 5 KPI por tipo.
- Estados: cargando · vacío («Tu organización no tiene plan de cuentas» + «Cargar PUC
  colombiano») · sin resultados · error · sin permiso.
- Diálogos: «Nueva cuenta» (código, nombre, tipo, **cuenta padre con `AccountPicker`**, validación
  «El padre debe ser del mismo tipo», «Solo cuentas de detalle reciben movimientos»); **«No se
  puede eliminar»** (la cuenta tiene 124 movimientos o 3 subcuentas → «Desactivar en su lugar»).
- Móvil: lista en acordeón por clase (1 Activo… 6 Costos) con tarjeta por cuenta; alta en sheet.

### 3.2 «Contabilidad — Libro diario»

- Escritorio **listo**: tabla paginada en servidor: N.º · Fecha (día de la organización) ·
  Descripción · Origen (`EntryOriginBadge` + `ChipDocumento`) · Débitos · Estado (`Publicado`,
  `Borrador`, `Revertido`, `Contra-asiento`) · «…». Filtros: rango de fechas, periodo, origen,
  estado, cuenta, sucursal, «ocultar contra-asientos y revertidos» (activado por defecto, con
  contador «5.901 ocultos»).
- Estados: cargando · vacío · sin resultados · error · sin permiso · **periodo cerrado** (banner).
- Diálogo **«Nuevo asiento»** (`Layout=desktop` ancho 960): fecha (con aviso si el periodo está
  cerrado), sucursal, descripción, `JournalLinesTable` edición con `AccountPicker` por línea,
  centro de costo opcional, `JournalBalanceBar`. Tres variantes: vacío · cuadra (habilita
  «Guardar borrador» y «Publicar») · **no cuadra** (diferencia en rojo, «Publicar» deshabilitado
  con tooltip «Débitos y créditos deben ser iguales») · periodo cerrado (fecha en error).
- Móvil: tarjetas por asiento; «Nuevo asiento» en sheet a pantalla completa con líneas como
  tarjetas y barra de cuadre fija abajo.

### 3.3 «Contabilidad — Detalle de asiento y reversión»

- **Asiento automático** (venta): `DocumentHeader` «Asiento #7.412 · Publicado»,
  `CadenaDocumento` (Venta → Factura FV-1043 → Cobro) y `ChipDocumento` del origen; metadatos:
  fecha contable, sucursal, creado por (usuario o «Automático · regla Venta de contado»), clave del
  hecho `accrual:sale:…` (plegada), moneda; `JournalLinesTable` lectura (1305 D 119.000 / 4105 C
  100.000 / 2405 C 19.000).
- **Asiento revertido**: `ReversalMark` «Revertido por #20.113 · 23 sep 2026 · Motivo: devengo
  duplicado» + enlace al corregido.
- **Contra-asiento**: `ReversalMark` rol contra-asiento («Neutraliza el #7.412»), líneas espejo;
  el memo técnico se muestra como «Motivo» legible y el lote queda en «Detalles técnicos».
- **Manual en borrador**: acciones «Editar», «Publicar», «Descartar» (el borrador sí se descarta).
- Diálogo **«Revertir asiento»**: resumen del original, fecha del contra-asiento (por defecto la
  del original si su periodo está abierto; si no, el primer día del periodo abierto, con
  explicación), **motivo obligatorio** (texto ≥ 10 caracteres), casilla «Crear asiento corregido
  después» y vista previa del contra-asiento. Variante error: «Este asiento ya tiene
  contra-asiento» · «El periodo de febrero está cerrado».
- Estados: cargando · no encontrado · sin permiso.
- Móvil: cabecera, cadena vertical, líneas como tarjetas, acciones en sheet.

### 3.4 «Contabilidad — Libro mayor» (los «estados mayores»)

- Escritorio: selector de cuenta (`AccountPicker`, también rango «de 1105 a 1120»), rango de
  fechas o periodo, sucursal, origen. KPIs: Saldo inicial · Débitos · Créditos · Saldo final
  (con naturaleza). Tabla `LedgerRow` paginada con **fila fija de saldo inicial** y saldo corrido;
  el N.º enlaza al detalle; `ChipDocumento` enlaza al origen; contra-asientos atenuados con su
  marca. «Exportar Excel/PDF».
- Variante «mayor de varias cuentas»: agrupado por cuenta con subtotal.
- Estados: sin cuenta elegida · cargando · sin movimientos en el periodo · error · **aviso de
  truncado imposible** (el saldo sale del servidor, ver B-5).
- Móvil: KPIs en 2×2, movimientos en tarjeta con saldo corrido a la derecha.

### 3.5 «Contabilidad — Balance de prueba»

- Escritorio: periodo o rango, nivel del PUC (clase, grupo, cuenta, subcuenta), sucursal,
  «ocultar cuentas sin movimiento». Columnas: Código · Cuenta · Saldo inicial (D/C) · Movimientos
  (D/C) · Saldo final (D/C). Pie con totales y `JournalBalanceBar` («Σ débitos = Σ créditos»).
- Estados: listo · cargando · vacío · error · periodo sin cerrar (nota informativa).
- Móvil: acordeón por clase; por cuenta, tarjeta con tres pares D/C.

### 3.6 «Contabilidad — Estados financieros»

- **Balance general** a una fecha: Activo corriente/no corriente, Pasivo, Patrimonio con línea
  **«Resultado del ejercicio»** calculada; franja «Activo = Pasivo + Patrimonio ✓». Columna
  comparativa opcional (mismo corte año anterior).
- **Estado de resultados** por periodo: Ingresos operacionales − Devoluciones = Ingresos netos −
  **Costo de ventas** = **Utilidad bruta** (margen %) − Gastos de administración − Gastos de
  ventas = **Utilidad operacional** ± No operacionales − Impuesto de renta = **Utilidad neta**.
  Comparativo con periodo anterior y con presupuesto (si existe).
- Pestañas «Balance general · Estado de resultados · Flujo de efectivo (próximamente)» y
  «Exportar PDF».
- Estados: listo · cargando · vacío · error · **cuadre fallido** (banner rojo con la diferencia y
  enlace al balance de prueba).
- Móvil: acordeón por bloque con totales fijos.

### 3.7 «Contabilidad — Periodos contables y cierre»

- Una sola pantalla (se retira `periodos-fiscales` o `periodos-contables`, ver pregunta 3):
  selector de año, rejilla de 12 meses (`PeriodStatusBadge`, asientos del mes, rechazos, «Cerrado
  por Ana Gómez · 5 abr 2026»), KPIs.
- Diálogo **«Cerrar marzo 2026»** con checklist (`CloseChecklistItem`): balance de prueba cuadra
  ✓ · 0 fallos de contabilización abiertos ✓/✗ · 0 borradores ✓ · cartera libro = documentos
  (aviso, no bloquea) · cajas del mes cerradas (aviso) · conciliaciones bancarias (aviso).
  Notas, «Cerrar periodo». Variante bloqueada («Resuelve 3 fallos antes de cerrar»).
- Diálogo **«Reabrir»** con motivo obligatorio y aviso de auditoría.
- **Cierre anual**: asistente que muestra el asiento de cierre (ingresos y gastos contra 3605
  Utilidad del ejercicio) y el de apertura.
- Estados: listo · vacío («Genera los periodos de 2026») · cargando · error · sin permiso.
- Móvil: lista de meses en tarjetas; checklist en sheet.

### 3.8 «Contabilidad — Reglas contables»

- Escritorio: agrupadas por módulo (Ventas, Compras, Tesorería, Inventario, POS, PMS, Nómina,
  Parqueadero, Transporte…) con los **32 orígenes y 24 eventos reales**, cada fila «Cuando
  **una venta de contado** se **crea** → Débito 1105 Caja · Crédito 4135 Comercio · IVA 2408»,
  prioridad, condiciones como chips («a crédito»), asientos generados este mes, rechazos,
  estado.
- Drawer **«Editar regla»** con `AccountPicker` por cuenta, condiciones, cuenta de descuento, y
  **`RulePreview`** a la derecha: «Con la última venta (FV-1043, $ 119.000) esta regla generaría:»
  + líneas. Variantes: cuadra · **cuenta 4175 no existe en tu plan** (bloquea guardar) · regla
  solapada («Ya hay una regla con esta prioridad») · sin documentos de muestra.
- Estados: listo · cargando · vacío («Cargar reglas por defecto») · error · sin permiso.
- Móvil: tarjetas por regla; edición en sheet con vista previa debajo.

### 3.9 «Contabilidad — Fallos de contabilización» (bandeja nueva)

- Escritorio: KPIs (abiertos, últimos 7 días, por motivo), tabla de `journal_entry_failures`:
  fecha · documento (`ChipDocumento`) · motivo legible («No hay regla para *pago de folio*»,
  «La cuenta 2408 no existe», «Periodo cerrado», «Importe inválido») · importe · estado ·
  acción («Crear regla», «Crear cuenta», «Reintentar», «Marcar resuelto con asiento #…»).
- Tarjeta **«Salud contable»** (de `v_salud_contable`): balance cuadra · diferencia de cartera
  libro vs documentos · notas crédito sobre pagadas.
- Estados: **vacío feliz** («Todo contabilizado: 0 hechos sin asiento») · cargando · error · sin
  permiso.
- Móvil: tarjetas por fallo con acción principal.

### 3.10 «Contabilidad — Impuestos (completar)»

La Sección «Impuestos» ya existe (ver `PARIDAD-POS-FIDELIDAD.md` §5: lista, `TaxForm` ×4,
estados, móvil). **No se duplica: se le añaden frames.**

- `TaxForm` con **«Tipo de tributo»** (IVA · INC · ICA · Retención en la fuente · ReteIVA ·
  ReteICA · Otro), **naturaleza** (se cobra / se descuenta / se retiene) y **cuentas contables**
  (generado 2408, descontable 2408/1355, retención 2365/2367/2368/1355).
- Lista con pestañas «Impuestos · Retenciones»: las `RETE_*`/`ICA_*` pasan a Retenciones con base
  mínima (UVT), tarifa y ciudad (ICA).
- Frame «Retenciones en un documento»: `DocumentTotals` con líneas negativas «ReteFuente 2,5 %
  − $ 25.000» y total a pagar.
- Frame «Informe de IVA del bimestre»: generado − descontable = a pagar; retenciones practicadas
  y sufridas; enlace a los asientos.
- Estado de aviso: «Este impuesto es una retención: no se puede asignar a un producto».

### 3.11 «Contabilidad — Centros de costo»

- Árbol (padre/hijo) con gasto del mes por centro, presupuesto y % ejecutado; alta con padre;
  desactivar en vez de borrar si tiene movimientos. Frame «Informe por centro de costo» (P&G
  filtrado). Estados completos. Móvil en tarjetas.

### 3.12 «Contabilidad — Activos fijos»

- Lista con KPIs (costo, depreciación acumulada, valor en libros), filtros por tipo/estado.
- **Detalle del activo**: datos, cuentas contables (activo 1524, depreciación acumulada 1592,
  gasto 5160), centro de costo, calendario de depreciación (mes, cuota, acumulado, valor en
  libros, asiento enlazado).
- Diálogo **«Depreciar periodo»**: mes, activos incluidos, total, vista previa del asiento
  (5160 D / 1592 C) y «Contabilizar». Diálogos «Dar de baja» y «Vender» (con utilidad o pérdida).
- Estados completos; móvil en tarjetas.

### 3.13 «Contabilidad — Presupuestos»

- Lista de presupuestos (estado Borrador · Aprobado · Vigente · Cerrado en español), editor de
  líneas: cuenta × 12 meses (o total anual repartido), centro de costo opcional.
- Vista **«Presupuesto vs real»** (de `fn_reporte_presupuesto_vs_real`): por cuenta, planeado,
  real, variación y % con barra; semáforo.
- Diálogos: «Nuevo presupuesto» (copiar del año anterior), «Aprobar».
- Estados completos; móvil en tarjetas con barra de ejecución.

### 3.14 «Contabilidad — Comisiones»

La pantalla ya funciona y es el modelo a seguir. Se dibuja **la actual** con el kit nuevo más dos
añadidos: columna «Asiento» (enlace al devengo y al pago) y diálogo «Anular» que avisa «Se
generará un contra-asiento del devengo» (requiere B-9). Estados que ya tiene: listo · cargando ·
vacío · error · sin permiso · otras monedas.

### 3.15 Hub «Contabilidad» (actualizar la tarjeta del Índice)

KPIs: asientos del mes (sin contra-asientos), periodo abierto actual, fallos abiertos, cuadre;
accesos a las 13 páginas; banner de salud si hay fallos.

---

## 4. Cambios de backend y BD para que funcione completo (sin aplicar)

Coordinación: todo lo que toque `fn_create_journal_entry`, `journal_*`, `accounting_rules` o
`fiscal_periods` debe pasar por la sesión del núcleo contable (reglas: releer la función de la
base antes de reemplazarla; el siguiente ADR libre hoy es ADR-CC-012). Migraciones aditivas, con rollback.

| # | Cambio | Por qué | Prioridad |
|---|---|---|---|
| B-1 | **RPC `fn_crear_asiento_manual(p_fecha, p_branch_id, p_memo, p_lineas jsonb, p_publicar)`** SECURITY DEFINER con guarda de pertenencia y permiso: valida N líneas, cuentas de detalle existentes, Σ D = Σ C, `fn_is_period_open`, `fact_key = manual:{uuid}`, una transacción. Route handler `POST /api/finanzas/contabilidad/asientos` con `getServerOrgContext()` | Hoy dos `insert` desde el navegador sin periodo ni transacción | 🔴 |
| B-2 | **RPC `fn_revertir_asiento_usuario(p_entry_id, p_motivo, p_fecha)`** que envuelve `fn_revertir_asiento` (categoría `manual`, lote = usuario + fecha), valida periodo de la fecha del contra-asiento y registra `created_by` y motivo en `journal_reversals` (columna `motivo text NULL` nueva) | La única salida hoy es el borrado físico | 🔴 |
| B-3 | **Inmutabilidad**: trigger `BEFORE UPDATE OR DELETE ON journal_entries/journal_lines` que rechace si `posted = true` (salvo `service_role`); quitar `eliminarAsiento` para publicados | La RLS `ALL authenticated` permite hoy borrar o editar asientos publicados y contra-asientos por API | 🔴 |
| B-4 | **Informes en el servidor**: `fn_balance_prueba(org, desde, hasta, branch, nivel)`, `fn_libro_mayor(org, cuentas[], desde, hasta, branch, limit, offset)` con saldo inicial y corrido calculados en SQL, `fn_estado_resultados`, `fn_balance_general` (con resultado del ejercicio). Todas con guarda de pertenencia y sin `anon` | Corrige E-1…E-4 de raíz y quita las 45.139 líneas del navegador (F-19) | 🔴 |
| B-5 | Mientras B-4 no exista: corregir `ReportesContablesService.ts` — saldo final = neto inicial + neto del periodo; el padre suma **saldo propio + hijos**; balance general con utilidad del ejercicio; mayor paginado | Números mal hoy | 🟠 |
| B-6 | **Cierre de periodo**: `fn_cerrar_periodo(p_period_id, p_notas)` con checklist en servidor (cuadre, `journal_entry_failures` abiertos, borradores) y `fn_reabrir_periodo(id, motivo)` con bitácora; `fn_is_period_open` que devuelva `false` también si el `yearly` está cerrado; asiento manual valida periodo (B-1). Retirar `locked`/`annual` del código | Nadie ha cerrado nunca; el cierre no protege | 🟠 |
| B-7 | **Cierre anual**: `fn_asiento_cierre_ejercicio(org, año)` (ingresos/gastos → 3605) y apertura | El balance general lo necesita | 🟡 |
| B-8 | **Reglas**: filtro de organización en `actualizarRegla`/`eliminarRegla`/`toggle`; catálogo de orígenes y eventos desde el CHECK (32/24) en vez de listas cableadas; validación de cuentas contra `chart_of_accounts` al guardar; RPC `fn_simular_regla(regla, source_id)` que devuelva las líneas sin escribir | C-7: una errata apaga un hecho | 🟠 |
| B-9 | `fn_auto_journal_commission`: al pasar a `cancelled` una comisión `accrued` con asiento, **contra-asiento** del devengo | Hoy queda el gasto devengado | 🟡 |
| B-10 | Bandeja de fallos: vista `v_journal_failures_org` con `security_invoker` y RLS por pertenencia (lectura), acción «marcar resuelto» por RPC; `v_salud_contable` filtrada por org para `authenticated` | La bandeja no existe; la vista es solo `service_role` | 🟡 |
| B-11 | **Impuestos**: columnas nuevas NULL-ables en `organization_taxes`: `tributo_tipo` (iva/inc/ica/retefuente/reteiva/reteica/otro), `naturaleza` (cobra/descuenta/retiene), `cuenta_generado`, `cuenta_descontable`; el motor lee la cuenta del impuesto antes que `accounting_rules.tax_account_code`. Guarda: una retención no se asigna a `product_tax_relations` | IVA generado y descontable en la misma cuenta; retenciones presentes como impuestos | 🟠 |
| B-12 | **Retenciones**: tabla `document_withholdings` (documento, concepto, base, tarifa, valor, cuenta), resta en `fn_recalc_invoice_totals`, y asientos de N líneas en el motor (hoy máximo 3) | G.3; requiere que el motor soporte N líneas | 🟡 |
| B-13 | **Activos**: `fn_depreciar_periodo(org, mes)` que escribe `asset_depreciations` + asiento (`fact_key = depreciation:{asset}:{mes}`) y actualiza acumulado; campos de cuentas en el formulario | Depreciación inexistente | 🟡 |
| B-14 | **Presupuestos**: UI de líneas con `upsertLine`; la vista usa `fn_reporte_presupuesto_vs_real`; filtro de organización en el servicio | Hoy no se pueden cargar líneas | 🟡 |
| B-15 | **Centros de costo**: `cost_center_id` en el alta manual (B-1) y en reglas (`accounting_rules.cost_center_id NULL`) | 0 líneas con centro | ⚪ |
| B-16 | Rellenar `currency_code`/`debit_base`/`credit_base` en `fn_create_journal_entry` (moneda base de la org) | Multimoneda en informes | ⚪ |
| B-17 | Higiene: `REVOKE ALL ON journal_entries, journal_lines FROM anon` (la RLS ya lo frena, pero el `GRANT` sobra) | Defensa en profundidad | ⚪ |

---

## 5. Preguntas para el dueño

1. **Contra-asientos en el libro diario**: ¿ocultos por defecto (con contador y filtro para
   verlos) o visibles siempre? Son 5.901 de 22.130.
2. **¿Se permite «Revertir» a cualquier usuario con acceso a Finanzas** o solo a un rol
   contable? (Hoy no hay separación de funciones, §M.4 de la auditoría de tesorería.)
3. **Periodos**: ¿se queda la pantalla `/contabilidad/periodos-fiscales` (la del menú) con el
   diseño de §3.7 y se retira `/periodos-contables`? Propuesta: sí.
4. **Cerrar un periodo con diferencia de cartera** (16 orgs la tienen hoy, F-57/F-62): ¿aviso
   que no bloquea, o bloqueo?
5. **Asientos manuales como borrador**: ¿se permite guardar borradores o solo publicar? (Hoy hay
   0 manuales y 0 borradores.)
6. **Retenciones**: ¿entran en esta fase (B-11/B-12, requiere asientos de N líneas) o se deja
   solo la tipificación y la guarda para que no se asignen a productos?
7. **F-65** (comisión OTA llama a la función con la firma equivocada, reservas de Booking/Expedia
   abortan): sigue abierto a la espera de tu decisión contable.
8. **PUC por defecto**: ¿se ofrece «Cargar PUC colombiano completo» o se mantiene el plan corto
   (~47 cuentas) que hoy siembra el alta de organización?

---

## 6. Qué faltó y cómo terminarlo

**Faltó todo lo de Figma**: las 15 Secciones de §3, los ~10 componentes nuevos, el Índice, el
chequeo por script (solapes, nodos fuera de sección, instancias rotas, textos truncados,
anotaciones dentro de frames) y las capturas `docs/design/figma/51-contabilidad-*.png`. Motivo:
cupo del MCP de Figma agotado antes de la primera llamada de esta tanda.

Plan para la próxima tanda (≈ 25 llamadas):

1. 1 lectura: páginas, Secciones de `07 Finanzas` (posición libre, Índice, Sección «Impuestos»),
   componentes de `02 Componentes` (shell, DataTable, FilterPanel, Badge, EmptyState, Skeleton,
   Pagination, diálogos, `Finanzas`) y variables Light/Dark.
2. 2 escrituras: los 10 componentes de la tabla de §3 en `02 Componentes › Finanzas`.
3. 15 escrituras: una por Sección (escritorio + móvil + estados + diálogos), clonando los frames
   base propios para los estados.
4. 1 escritura: Índice.
5. 1 lectura: chequeo por script.
6. ~5 `get_screenshot` + `curl` a `docs/design/figma/51-contabilidad-*.png`.
7. Actualizar este documento con los node ids.

## Decisiones del dueño (2026-09-23, con la recomendación contable aceptada)

- **Quién revierte:** no cualquiera. Hay un permiso propio «Revertir asientos», resuelto en el servidor y nunca por nombre de rol. Viene activo por defecto para administrador y contador.
- **Cómo se revierte:**
  - Un asiento publicado nunca se edita ni se borra: se revierte con un contra-asiento y un motivo obligatorio.
  - Si el periodo del original está cerrado, el contra-asiento se fecha en el periodo abierto.
  - Los asientos automáticos se revierten anulando su documento de origen (factura, pago, etc.), que genera el contra-asiento. Solo los asientos manuales se revierten directamente.
- **Contra-asientos en el libro diario:** siempre visibles, porque el libro diario debe estar completo. Original y reversión quedan enlazados: el original lleva el chip «Revertido» y la reversión el chip «Reversión de #N». Hay un filtro «Ocultar pares revertidos», apagado por defecto. En los informes y balances se anulan solos.
