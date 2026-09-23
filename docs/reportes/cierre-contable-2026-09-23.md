# Cierre del núcleo contable — reporte final

**Fecha:** 2026-09-23 · **Proyecto Supabase:** `jgmgphmzusbluqhuqihj`
**Org de prueba:** **149** «TEST cierre contable E2E» (la 148 del mandato no existe; ADR-CC-003).
**Progreso detallado:** `docs/progreso-cierre-contable.md` · **Decisiones:** `docs/decisiones/ADR-CC-001…008`.

---

## 1. Criterios del objetivo

| # | Criterio | Estado | Prueba |
|---|---|---|---|
| 1 | Un asiento por hecho económico | **Cumplido** para venta, factura, pago y compra | §4 casos (a)–(j); en producción, 0 duplicados desde 03:33 UTC del 23-sep (3 facturas con venta → 3 devengos). Tras la reversión queda 1 hecho con dos devengos vivos (org 2, venta con dos facturas de importes distintos): F-57 |
| 2 | Cuentas correctas; IVA de ventas al crédito y de compras al débito | **Cumplido** | Caso (a): `1305 D 1.190.000 / 2405 C 190.000 / 4105 C 1.000.000` + cobro `1105 D / 1305 C`. Caso (g): `1405 D 100.000 / 2405 D 19.000 / 2105 C 119.000`. Contado/crédito se cumple **en saldo**: el devengo va a 1305 y el cobro lo lleva a 1105/1110 (ADR-CC-001) |
| 3 | `tax_rate`, `tax_code`, `tax_included`, `total_line` en toda línea con impuesto, por cualquier ruta | **Cumplido** | Disparador en `invoice_items`: 283 líneas con tarifa 19 → `IVA_19`; 0 líneas con tarifa > 0 y código NULL salvo 7 tarifas inválidas, que quedan auditadas. Casos (a)–(e), (g) |
| 4 | Aviso visible cuando una línea no tiene impuesto | **Cumplido en código**; verificación visual pendiente de una persona | Factura, cotización y POS (`AvisoSinImpuesto`); caso (f) en SQL: `tax_rate 0`, `tax_code NULL` |
| 5 | Borrador sin asiento; al emitirse, con asiento | **Cumplido** | Caso (i): 0 asientos en borrador, 1 al emitir; anular un borrador → 0 asientos. 0 borradores con asiento vivo en toda la base |
| 6 | Históricos neutralizados; balance de prueba cuadrado | **Cumplido** con remanente documentado | §5: 5.810 contra-asientos y 2.154 devengos corregidos en 19 organizaciones (37 restaurados por falta de documento); 0 organizaciones descuadradas, 0 pares que no neutralizan |
| 7 | `docs/hallazgos/` refleja la base | **Cumplido** | F-01, F-29, F-42…F-51 actualizados; F-53 añadido al índice; F-54…F-58 nuevos |
| 8 | Reporte con evidencia | Este documento | — |

## 2. Migraciones y commits

| Versión | Nombre | Cierra |
|---|---|---|
| `20260923080135` | `devengo_de_venta_contra_la_cuenta_que_salda_el_cobro` | F-48 (remanente), F-55 |
| `20260923081427` | `impuesto_de_linea_normalizado_en_la_base` | F-42, F-50, F-51 |
| `20260923081953` | `higiene_contable_f44_f47_f49` | F-49, F-44, F-47, F-43 |
| `20260923082133` | `devengo_de_compra_contra_la_cuenta_que_salda_el_pago` | F-55 (compras) |
| `20260923082445` | `nota_credito_conserva_su_iva` | F-56 |
| `20260923083206` | `reversion_historica_infraestructura` | Bloque 5 |
| `20260923083545` | `reversion_historica_restaura_sin_documento` | Bloque 5 (F-57) |
| `20260923083714` | `reversion_historica_f01_cartera` | F-01 |
| `20260923083859` | `reversion_historica_devengo_caja_con_saldo` | F-29 / F-55 |
| `20260923131009` | `disparadores_contables_invoker_a_definer` | F-47 (comisión y folio quedaban INVOKER) |
| `20260923131133` | `vista_cartera_vs_documentos` | control de cartera, solo `service_role` |

Cada una con su reversión en `supabase/rollbacks/`. Ninguna cambió la firma de
una función existente. `fn_create_journal_entry`, `fn_auto_journal_sale`,
`fn_recalc_invoice_totals` y `fn_sync_invoice_items_from_sale` tienen una sola
fila en `pg_proc` cada una. `fn_recalc_invoice_totals` conserva
`SECURITY DEFINER`.

Migraciones ajenas reconciliadas durante la sesión: las 10 del 23-sep (03:31–04:04
UTC, commits `d8090114`, `9dc89ebd`, `250aeec7`) y `20260923081833
reportes_de_problema_desde_el_header`, que no toca nada contable.

Commits en `main` (sin push): `eb8c97ee` (Bloque 1), `7c44694a` (Bloque 2),
`56f76ffe` (Bloque 3), `140e0957` (Bloque 4: F-55 compras y F-56),
`fe8439c6` (Bloque 5), `f0063cbf` (Bloque 6) y el de los ajustes previos al push
(F-47, F-58, vista de control).

## 3. Decisiones tomadas por cuenta propia

| ADR | Decisión |
|---|---|
| [ADR-CC-001](../decisiones/ADR-CC-001-devengo-contra-cuenta-por-cobrar.md) | El devengo de venta siempre debita la cuenta que salda el cobro. Sin esto, toda venta de contado con cobro duplicaba el activo |
| [ADR-CC-002](../decisiones/ADR-CC-002-venta-pos-solo-por-rpc.md) | Venta POS nueva solo por `pos_checkout_v1`; sin RPC, error visible. Las orgs 137 y 145 no «caían al respaldo»: eran pedidos web |
| [ADR-CC-003](../decisiones/ADR-CC-003-org-de-prueba-y-verificacion-sin-ui.md) | Org de prueba 149; ninguna cuenta de acceso creada; E2E por SQL |
| [ADR-CC-004](../decisiones/ADR-CC-004-impuesto-de-linea-en-la-base.md) | Normalización del impuesto en la base. Tarifa 0 sin relación explícita → `tax_code` NULL, no `IVA_0` (se aparta del mandato: «exento» es una afirmación fiscal) |
| [ADR-CC-005](../decisiones/ADR-CC-005-permisos-de-funciones-contables.md) | `authenticated` se mantiene en las RPC INVOKER del asistente y en `fn_sync_invoice_items_from_sale`, esta última con guarda de pertenencia (se aparta del mandato: el asistente usa la sesión por diseño) |
| [ADR-CC-006](../decisiones/ADR-CC-006-devengo-de-compra.md) | Espejo de ADR-CC-001 en compras |
| [ADR-CC-007](../decisiones/ADR-CC-007-reversion-historica.md) | Alcance de la reversión ampliado a CC-001 y F-01, fecha contable del original, rollback por balance de prueba |

Otras decisiones menores: el tramo de N inserts de `posService` queda solo para
el cobro de deudas; la nota de reembolso parcial por valor lleva una línea de
concepto; los pedidos web sin impuesto toman el IVA configurado del producto o de
la organización, extraído del precio ya cobrado.

## 4. Casos E2E (org 149, por SQL)

Cada caso replica las escrituras de su ruta. Consulta de asientos:

```sql
SELECT je.id, je.source, je.fact_key,
  string_agg(jl.account_code || CASE WHEN jl.debit>0 THEN ' D '||jl.debit ELSE ' C '||jl.credit END, ' / ')
FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id = je.id
WHERE je.organization_id = 149 GROUP BY je.id ORDER BY je.id;
```

| # | Caso | Línea | Cabecera | Asientos | Resultado |
|---|---|---|---|---|---|
| a | Factura IVA 19% no incluido, 1.000.000, contado | `19 · IVA_19 · false · 1.190.000` | `1.000.000 / 190.000 / 1.190.000` | `accrual:invoice:…0a` `1305 D 1.190.000 / 2405 C 190.000 / 4105 C 1.000.000`; cobro `1105 D / 1305 C 1.190.000` | ✔ (neto = lo esperado) |
| b | Factura IVA 19% incluido, 1.190.000 | `19 · IVA_19 · true · 1.190.000` | `1.000.000 / 190.000 / 1.190.000` | mismo devengo; cobro por transferencia `1110 D / 1305 C` | ✔ |
| c | Cotización IVA 5% → factura | `5 · IVA_5 · 105.000` | cotización `100.000/5.000/105.000` = factura `100.000/5.000/105.000` | `1305 D 105.000 / 2405 C 5.000 / 4105 C 100.000` | ✔ |
| d | POS contado con IVA (una transacción) | `19 · IVA_19` y `0 · NULL` | `25.000 / 3.800 / 28.800` | **un** devengo `accrual:sale:…d0` (gana la factura) + cobro `1105` | ✔ |
| e | POS a crédito, abono 10.000 | `19 · IVA_19` | `partial`, saldo 49.500 | un devengo `accrual:sale:…e0` `1305 D 59.500 / 2405 C 9.500 / 4105 C 50.000`; cobro 10.000 | ✔ |
| f | Producto sin impuesto ni tarifa por defecto | `0 · NULL` | — | incluido en (d) | ✔ en SQL; aviso visual pendiente de persona |
| g | Factura de compra IVA 19% | `19 · IVA_19` | recalculada `100.000 / 19.000 / 119.000` | `accrual:purchase:…0f` `1405 D 100.000 / 2405 D 19.000 / 2105 C 119.000` | ✔ IVA al **débito** |
| h | Nota crédito sobre venta con IVA | `-1 · IVA_19` | `-1.000.000 / -190.000 / -1.190.000` (tras F-56) | `4105 D 1.000.000 / 2405 D 190.000 / 1305 C 1.190.000` | ✔ (encontró F-56) |
| i | Borrador → emitida | `19 · IVA_19` | 238.000 en borrador | 0 en borrador; al emitir `accrual:invoice:…11` | ✔ |
| j | Pago de factura a crédito | — | `paid`, saldo 0 | `1110 D 238.000 / 1305 C 238.000` | ✔ |

Balance de prueba de la org 149: D = C = 7.253.100. 4105 = ingreso neto de los
documentos (1.425.000). 2405 = IVA de ventas − IVA de compras (236.800).

**1305 no cuadra con las facturas abiertas** (`v_cartera_vs_documentos`):

| Concepto | Importe |
|---|---:|
| 1305 en el libro | −1.154.500 |
| Facturas abiertas (E2E-C 105.000 + E2E-E 49.500) | 154.500 |
| Diferencia | **−1.309.000** |
| NC-E2E-H (−1.190.000) + NC-E2E-H2 (−119.000), sobre facturas ya pagadas | −1.309.000 |

Toda la diferencia es el saldo a favor que dejan las dos notas crédito sobre
facturas pagadas, sin documento de devolución ni de saldo a favor: hallazgo
**F-58**, solución propuesta en ADR-CC-008 (sin implementar). La vista marca
además 1 factura «pagada sin pago» (59.500): es el fixture del camino B del
Bloque 1, cuyo pago de prueba usa `source='web_order'` con un id inventado que
no enlaza con la factura.

Tests: `taxResolver.test.ts` (17), `taxResolverCore.test.ts` (9),
`taxCoverage.test.ts` (16), `webOrderTotals.test.ts` (+7), contratos del
checkout sin respaldo (`checkoutRpc`, `checkoutIdempotente`).

## 5. Reversión histórica

Procedimiento: `docs/procedimientos/reversion-asientos-duplicados.md`. Bitácoras:
`journal_reversals`, `journal_reversal_runs`.

| Categoría | Contra-asientos | Devengo corregido | Restaurados | Importe neutralizado (débito) |
|---|---:|---:|---:|---:|
| F-48 duplicado POS | 2.310 | — | 0 | 86.309.804 |
| F-49 borrador | 31 | — | 0 | 8.452.500 |
| F-45 IVA al débito | 249 | 213 | 36 | 42.285.395 (sin restaurados) |
| CC-001 devengo contra Caja | 1.564 + 378 | 1.563 + 378 | 1 | 45.382.180 + 165.319.984 |
| F-01 cartera duplicada | 1.278 | — | 0 | 204.212.056 |

Verificación:

```
orgs con D ≠ C .................................. 0
pares original + contra-asiento que no neutralizan  0
reversiones F-45/CC-001 sin reemplazo ni restauración 0
borradores con devengo vivo ..................... 0
fallos nuevos en journal_entry_failures ......... 0
```

Diferencia libro − documentos por organización (antes → después; fuente
`fn_cuadre_contable_org`):

| Org | CxC | IVA | Ingreso |
|---:|---|---|---|
| 2 | 13.313.228 → 7.683.082 | 1.724.236 → 2.613.665 | 16.430.039 → 9.910.464 |
| 112 | 1.314.000 → 438.000 | 0 → 0 | 2.190.000 → 438.000 |
| 113 | 16.243.732 → 2.003.225 | −221.558 → −16 | 30.271.633 → 2.657.040 |
| 115 | −52.522.179 → −2.757.500 | −128.843 → 0 | 169.848.708 → 34.755.860 |
| 120 | 9.939.475 → 1.602.500 | −19.735 → 0 | 11.165.210 → 2.808.500 |
| 125 | −2.133.782 → **0** | −359.244 → **0** | 1.300.000 → **0** |
| 129 | 5.391.840 → 4.108.440 | 0 → 0 | 8.825.360 → 7.504.560 |
| 130 | 28.586.100 → 28.086.100 | −2.433.900 → −2.433.900 | 30.500.000 → 30.000.000 |
| 131 | 18.450 → −89.750 | 0 → 0 | 108.200 → **0** |
| 132 | 57.373.685 → 16.279.149 | −10.631.060 → −1.725.679 | 78.945.135 → 28.945.218 |
| 133 | 1.623.887 → 489.687 | −32.984 → **0** | 1.236.392 → 69.208 |
| 134 | 8.328.292 → −449.200 | −98.907 → **0** | 9.094.249 → −184.300 |
| 135 | 38.680.100 → 8.823.900 | 0 → 0 | 30.180.200 → 324.000 |
| 137 | 2.311.490 → **0** | 0 → 0 | 4.245.070 → **0** |
| 140 | 0 → 0 | 8.622 → **0** | 266.378 → **0** |
| 142 | −357.000 → −2.956.000 | 0 → 0 | 10.141.647 → −1.939.853 |
| 143 | −5.000.000 → **0** | −1.596.639 → **0** | 798.319 → **0** |
| 144 | −3.427.800 → −677.900 | 0 → 0 | 7.791.100 → 38.800 |
| 145 | 8.372.100 → 5.438.500 | 0 → 0 | 2.933.600 → **0** |
| **Σ\|dif\|** | **254.937.140 → 81.882.933** | **17.255.728 → 6.773.260** | **416.271.240 → 119.575.803** |

Balance de prueba: cuadra en las 19 antes y después.

## 6. Lo que quedó abierto

| Hallazgo | Qué | Por qué no se cerró |
|---|---|---|
| F-57 | 36 devengos de ventas borradas, 26 de facturas borradas, 48 asientos de cartera de CxC borradas, 11 facturas con total 0 (org 130), 1 venta con dos facturas (org 2) | El documento no permite decidir si el hecho ocurrió: auditoría manual con cada cliente |
| F-55 (compras) | Compras históricas de contado con pago registrado conservan el doble descuento del banco | Fuera del alcance autorizado de la reversión |
| — | Cobros históricos en efectivo registrados en 1110 (antes del 23-sep todos los cobros iban a Bancos) | Reclasificación Caja/Bancos no autorizada; no afecta 1305/2405/4105 |
| — | Diferencias de ingreso restantes: ventas POS sin factura (no cuentan en «documentos»), `cash_movements` con ingreso, org 2 (datos de demostración con doble facturación) | Parte no es error (ventas sin factura) y parte es F-57 |
| — | `parkingFinanceService` nunca escribe sus líneas de factura (columnas inexistentes) | Arreglarlo crearía cartera fantasma: primero hay que vincular el pago de parqueadero a la factura |
| — | Respaldo de `NuevaFacturaForm` a `fn_sync_invoice_items_from_sale` sigue en el navegador | Protegido con guarda de pertenencia (ADR-CC-005); moverlo a servidor queda como deuda |
| — | `cotizacionesService.convertToInvoice` deriva `issue_date` con `toISOString().split('T')[0]` | Regla de fechas del repo; fuera del alcance contable |
| F-54 | Organizaciones que venden gravado sin tarifa configurada | Decisión de cada cliente; no se siembra |
| F-58 | Nota crédito sobre factura pagada deja saldo a favor sin documento (org 149: −1.309.000; org 2: −303.331) | Propuesta en ADR-CC-008; requiere UI + RPC y sembrar la cuenta 2805, que falta en 84 de 85 planes |
| — | `temp_audit_amount_validation` | Código muerto (sin disparador ni llamador); marcado en su comentario, no se borró |

## 7. Requiere acción humana

1. **Crear un usuario de prueba miembro solo de la org 149** y recorrer los casos por la interfaz: en especial el aviso de «producto sin impuesto» (caso f) y la llamada real a `pos_checkout_v1`, que exige un miembro activo.
2. **Auditoría F-57** con cada cliente afectado.
3. **Desplegar** el código de este cierre (web y build del Desktop, que carga la web): el aviso de impuesto, la tarifa por defecto, el checkout sin respaldo y las rutas migradas al resolver solo existen en `main`. `git push` no se hizo: requiere autorización.
