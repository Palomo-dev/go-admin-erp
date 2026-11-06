# Auditoría de reglas contables: cuentas inexistentes y de título

Fecha de corte: 2026-11-06, sobre producción, solo lectura. Las empresas se identifican por su id.

Fuente: `fn_reglas_cuentas_invalidas(org)` (migración `20261107100000`), la misma lógica que muestra la pantalla
Reglas contables. Huella de las 452 filas: `4ea89c0c266bab7e2dc60a8f8a187b0c`.

**Ninguna regla existente se modificó.** La propuesta es información para el Contador, no un cambio aplicado.

## Resumen

| Medida | Valor |
|---|---|
| Reglas en total | 1.635 (1.632 activas, 3 inactivas) |
| Empresas con reglas | 33 |
| Reglas activas con cuenta inexistente | 377, en 29 empresas |
| Reglas activas con cuenta de título | 72, en 30 empresas |
| Reglas activas con propuesta respaldada por evidencia | 420 |
| Reglas activas pendientes del Contador | 29 |
| Reglas inactivas con cuenta de título | 3 (fuera de las cifras anteriores) |
| Registros en `journal_entry_failures` | 0 |

Cada regla tiene una sola cuenta inválida; ninguna inválida está en impuesto ni descuento.

## Origen: es la semilla, no errores de cada empresa

Las 449 referencias salen de cuatro códigos:

| Cuenta | Estado | Reglas | Causa |
|---|---|---|---|
| `14350101` | inexistente | 377 | `fn_create_default_accounting_rules` la fija siempre, y corre antes de que exista el plan (`tr_auto_create_accounting_rules` ordena antes que `tr_auto_create_chart_of_accounts`). Esas empresas tienen `14350501` o `1435`. |
| `4155` | título | 29 | Con el plan vacío, la semilla se queda en el grupo. `fn_sembrar_configuracion_contable` corrige ventas, pero no `folio_item`. |
| `4135` | título | 25 | Misma causa. |
| `414015` | título | 18 | Misma causa, en 3 restaurantes (120, 140, 368). |

Desde `20261107100000`, una empresa nueva corrige estas reglas al final del alta si hay evidencia en su plan
(`trg_zzzzz_reglas_saneadas`). Las 33 empresas existentes no pasan por ahí.

## Qué pasa hoy con estas reglas

Leído de las funciones en producción (`pg_get_functiondef`), no probado documento por documento:

- **`4135` y `414015`:** `fn_create_journal_entry` encuentra la cuenta y `fn_aplicar_configuracion_contable` la cambia por la
  configurada para `ventas_productos`. El asiento sale en la cuenta correcta. Son las mismas de la propuesta.
- **`4155`:** la misma ruta la cambia por `ventas_servicios`, que hoy es `4235`. El asiento sale, pero en `4235`.
- **`14350101` en movimientos de stock y ventas:** `fn_cuenta_configurada_de_sede` la cambia por el auxiliar de la sede.
- **`14350101` en compras:** `fn_regla_devengo_compra` la entrega tal cual, y `fn_create_journal_entry` registra
  `debit_account_missing` si llega así. Es el riesgo real: esa compra no entraría al mayor.

`fn_cuenta_auxiliar_de_titulo` no interviene: su lista fija no incluye `4135`, `4155`, `414015` ni `14350101`.

No hay fallos registrados porque esas 29 empresas no tienen líneas en cuentas `143x`. La ausencia de fallos no prueba
que el flujo de compras funcione en ellas.

## Criterio de la propuesta

1. **Configuración:** la cuenta válida que `configuracion_contable` fija para ese concepto. Para `1435…` se usa la clave `inventario`.
2. **Plan:** la cuenta de título tiene un único auxiliar de movimiento activo. Nunca en `24xx`.
3. **Uso real:** una sola cuenta de movimiento con ese prefijo en asientos publicados.

Si configuración y plan dicen cosas distintas, o no hay evidencia, queda **Pendiente del Contador**.

## Decisiones del Contador

1. **`4155` en `folio_item` (29 reglas, 27 empresas).** La configuración dice `4235` y el plan tiene un único auxiliar,
   `41559501`. Hoy el asiento iría a `4235`. El comentario de la semilla reserva `4235` para servicios ocasionales.
   ¿Los cargos a folio van a `41559501` o a `4235`?
2. **Inventario en 4 empresas (333, 335, 338, 339).** Tienen `14350101` en reglas y en el mapeo de sede, y todos sus
   asientos están ahí (0 líneas en `14350501`), pero `configuracion_contable.inventario` dice `14350501`. No están en este
   inventario porque sus reglas son válidas. ¿Se ajusta la configuración a `14350101`?
3. **Aprobar el mapeo de las 420 reglas con propuesta.** Es por regla, en pantalla, con «Corregir cuenta». No se hizo masivo.

## Inventario por empresa

`Activa = no` marca las 3 reglas inactivas.

### Empresa 1

13 inexistentes, 0 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| reservation | confirmed | Reserva Confirmada | crédito | `2805` | título | 28050501 | configuración = único auxiliar | no |

### Empresa 113

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 120

13 inexistentes, 6 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| cash_movement | created | Movimiento de Caja | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Alimentos | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 1435 | configuración | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 1435 | configuración | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 1435 | configuración | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 1435 | configuración | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 1435 | configuración | sí |
| reservation | no_show | Reserva no presentada | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| sale | created | Venta a Credito | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| sale | created | Venta de Contado | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| trip | created | Viaje | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |

### Empresa 131

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 135

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 137

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 138

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 139

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 140

13 inexistentes, 6 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| cash_movement | created | Movimiento de Caja | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Alimentos | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 1435 | configuración | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 1435 | configuración | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 1435 | configuración | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 1435 | configuración | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 1435 | configuración | sí |
| reservation | no_show | Reserva no presentada | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| sale | created | Venta a Credito | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| sale | created | Venta de Contado | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| trip | created | Viaje | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |

### Empresa 144

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 145

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 197

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 198

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 333

0 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar = uso | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |

### Empresa 335

0 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar = uso | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |

### Empresa 337

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 338

0 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar = uso | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |

### Empresa 339

0 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar = uso | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |

### Empresa 340

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 341

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 342

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 345

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 346

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 347

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 348

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 349

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 358

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 368

13 inexistentes, 6 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| cash_movement | created | Movimiento de Caja | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Alimentos | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 1435 | configuración | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 1435 | configuración | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 1435 | configuración | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 1435 | configuración | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 1435 | configuración | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 1435 | configuración | sí |
| reservation | no_show | Reserva no presentada | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| sale | created | Venta a Credito | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| sale | created | Venta de Contado | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |
| trip | created | Viaje | crédito | `414015` | título | 41401501 | configuración = único auxiliar | sí |

### Empresa 369

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4135` | título | 41359501 | configuración = único auxiliar | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 370

13 inexistentes, 0 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| reservation | confirmed | Reserva Confirmada | crédito | `2805` | título | 28050501 | configuración = único auxiliar | no |

### Empresa 371

13 inexistentes, 0 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| reservation | confirmed | Reserva Confirmada | crédito | `2805` | título | 28050501 | configuración = único auxiliar | no |

### Empresa 372

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |

### Empresa 373

13 inexistentes, 2 de título.

| Origen | Evento | Regla | Lado | Cuenta | Estado | Propuesta | Evidencia | Activa |
|---|---|---|---|---|---|---|---|---|
| folio_item | created | Cargo Folio Alimentos | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| folio_item | created | Cargo Folio Servicios | crédito | `4155` | título | Pendiente del Contador | conflicto: 4235 / 41559501 | sí |
| inventory | adjusted | Salida de inventario | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | gain | Inventario sobrante | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | loss | Inventario faltante | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | opening | Inventario apertura | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | purchase | Inventario compra | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | return | Inventario devolucion | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory | sale | Inventario venta | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | gain | Ajuste Inventario Ganancia | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| inventory_adjustment | loss | Ajuste Inventario Perdida | crédito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| manifest | created | Manifiesto Despacho | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra a Credito | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase | created | Compra de Contado | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
| purchase_order | received | Orden de Compra Recibida | débito | `14350101` | inexistente | 14350501 | configuración + mapeo de sede | sí |
