# Retenciones en compras — flujo completo (Figma, base de datos y documentos)

> 2026-09-30. Cierra la fase 2 de la decisión D4 de
> [`FACTURAS-COMPRA-CXP-PLAN.md`](../implementacion/FACTURAS-COMPRA-CXP-PLAN.md):
> la cuenta por pagar ya era por el neto; ahora también el asiento.
> Archivo de Figma `EAvjINVRnlzFM70GVoWXgl`.

## 1. El problema

Una retención (en la fuente, de IVA o de ICA) la practica el comprador: no se le paga al
proveedor y queda como deuda con la DIAN o con el municipio hasta declararla.

| Pieza | Antes | Ahora |
|---|---|---|
| Cuenta por pagar (`accounts_payable.amount`) | neto (`fn_invoice_purchase_neto`) | neto (sin cambio) |
| Asiento de la factura (`fn_auto_journal_purchase`) | 2105 acreditada por el **total** | 2105 por el **neto** + una línea por retención (2365 / 2367 / 2368) |
| Pago al proveedor | debita 2105 por el neto → quedaba un saldo fantasma en 2105 | salda 2105 exactamente |
| Pasivo con la DIAN / municipio | no aparecía en ninguna cuenta | 2365, 2367 y 2368 |
| Comprobante de egreso | solo «Valor pagado» | total de la factura, cada retención, neto a pagar y valor pagado |

## 2. El flujo, de punta a punta

1. **Configuración** (Tesorería › Impuestos, clase `withholding`): la organización activa sus
   retenciones desde las plantillas `RETE_4`, `RETE_11`, `ICA_0.966` y, desde esta fase,
   `RETEIVA_15`.
2. **Factura de compra** (`fn_factura_compra_guardar` → `fn_fc_guardar_int`): cada retención se
   guarda en `invoice_purchase_withholdings` con su `tax_code`, **en borrador**, antes de las
   líneas.
3. **Confirmar** (`fn_fc_confirmar_int`): el estado pasa a `received` y dispara el devengo:
   - `fn_create_journal_entry` crea el asiento como siempre (validaciones, periodo abierto,
     sucursal, idempotencia por `accrual:purchase:{id}`);
   - `fn_asiento_compra_aplicar_retenciones` lo completa en la misma transacción: baja la línea
     del proveedor al neto y acredita cada retención a su cuenta. Verifica que el asiento cuadre;
   - la cuenta por pagar nace por el neto (`fn_cxp_asegurar_de_factura`).
4. **Pago** (regla `purchase_payment`): debita 2105 por lo pagado. Pagar el neto la salda.
5. **Anular** (`fn_void_purchase_invoice`): el contra-asiento espeja todas las líneas del
   original, retenciones incluidas. Sin cambios.
6. **Documentos**: la factura de compra ya pintaba las retenciones y el «Neto a pagar al
   proveedor»; el comprobante de egreso ahora también (§5).
7. **Cierre y reportes**: los saldos de 2365/2367/2368 son los que se declaran (formulario 350 y
   declaración de ICA). Las retenciones no cambian las sumas del balance de prueba: el crédito al
   proveedor se reparte entre 2105 y 23xx, ambos pasivo.

## 3. Base de datos

Migraciones (aplicadas por MCP, dry-run en transacción que se deshace, md5 del archivo igual al de
`schema_migrations`):

| Versión | Qué hace | Rollback |
|---|---|---|
| `20260930073908_compras_asiento_con_retenciones` | Cuentas 2365/2367/2368 en los 89 planes (+ disparador en `organizations`), plantilla `RETEIVA_15`, `fn_cuenta_retencion_compra`, `fn_asiento_compra_aplicar_retenciones`, y la llamada en `fn_auto_journal_purchase` y `fn_retro_journal_purchases` | restaura ambos cuerpos; borra cuentas y plantilla solo si nada las usa |
| `20260930074406_compras_cuenta_retencion_por_clase` | Clasificación con marcadores inequívocos antes que palabras sueltas | restaura la de la versión anterior |

### 3.1 Cuenta de cada retención

`fn_cuenta_retencion_compra(org, tax_code, concept)`:

1. `tax_account_mapping` activo de la plantilla (o del impuesto de la organización) con ese
   código, si la cuenta existe en el plan. Manda sobre todo lo demás.
2. Si no hay mapeo, por clase — primero el código y luego el concepto:

| Orden | Coincide con | Cuenta |
|---|---|---|
| 1 | `RETEICA`, «industria y comercio» | 2368 Impuesto de industria y comercio retenido |
| 2 | `RETEIVA`, «impuesto a las ventas» | 2367 Impuesto a las ventas retenido |
| 3 | `RETEFUENTE`, «en la fuente», `RETE_<n>` | 2365 Retención en la fuente |
| 4 | la palabra `ICA` | 2368 |
| 5 | la palabra `IVA` | 2367 |
| — | nada | 2365 |

«ReteICA sobre base sin IVA» es 2368; «Servicios de música» no es ICA (la palabra debe ir sola).

### 3.2 Por qué se ajusta una línea recién creada

Las líneas de un asiento publicado son inmutables (`fn_asiento_publicado_inmutable`). Para no
duplicar las validaciones de `fn_create_journal_entry` (regla 7), el asiento se crea con ella y
`fn_asiento_compra_aplicar_retenciones` corrige **solo** la línea del proveedor de un asiento
creado en esta misma transacción (`created_at = now()` y crédito todavía igual al total). La
bandera `app.contabilidad_mantenimiento` se enciende únicamente para ese `UPDATE` y vuelve a su
valor anterior. Un asiento publicado antes no se toca: se corrige con contra-asiento.

Si las retenciones igualan o superan el total, no se ajusta: queda registrado en
`journal_entry_failures` (`withholding_exceeds_total`).

### 3.3 Verificación (org 2, transacción revertida)

Factura de 5.891.600 + IVA 19 % con ReteFuente 2,5 % y ReteICA 9,66 ‰ — el mismo ejemplo de
Figma (FE-88213):

| Cuenta | Débito | Crédito |
|---|---:|---:|
| 1405 Inventarios | 5.891.600 | |
| 2405 IVA descontable | 1.119.404 | |
| 2105 Proveedores (neto) | | 6.806.801,14 |
| 2365 Retención en la fuente | | 147.290 |
| 2368 ReteICA | | 56.912,86 |
| **Sumas** | **7.011.004** | **7.011.004** |

Confirmar dos veces deja un solo asiento; al anular, las cinco cuentas vuelven a cero. Con
ReteIVA 15 % (167.910,60 a 2367) el asiento también cuadra y la cuenta por pagar nace por
6.638.890,54. Al aplicar había 0 retenciones guardadas: no hay asientos históricos que corregir.

## 4. Figma — pantallas y componentes conectados

| Página | Nodo | Qué muestra |
|---|---|---|
| 02 Componentes | `978:605473` `TablaContable` | propiedad `Líneas 4 y 5` para asientos de 5 líneas (reutilizada en 07) |
| 07 Finanzas | `1012:87208` | tabla de retenciones con **Cuenta contable** (2365/2367/2368) y nota `1012:87757` |
| 07 Finanzas | `1069:113139` / `1476:117637` | confirmar factura FE-88213: CxP por el neto y el asiento que se genera (cuadra en 7.011.004) |
| 07 Finanzas | `452:26278` | detalle de CxP FC-2291: «Totales de la factura» con retenciones |
| 07 Finanzas | `424:177444`, `424:178751` | saldo y `AplicarPagoDialog` sobre el neto |
| 07 Finanzas | `1485:117655` | detalle de asiento — compra con retenciones (5 líneas) |
| 09 Documentos | `1055:7087` | comprobante de egreso CE-0001: total, retenciones, neto, descuento y valor pagado |
| 09 Documentos | `1491:126182` | **certificado de retenciones** (tipo propuesto, §6) |
| 09 Documentos | `1265:9236`, `1315:8494` | cierre: páginas 3 y 4 cuadradas; retenciones en el pasivo hasta declararlas |
| 14 Reportes | `1360:23377`, `1353:12139` | visor «Retenciones practicadas» (propuesta, §6) |

## 5. Código

- `src/lib/documents/server/cargadores/compras.ts`: exporta `retencionesDeCompra` y
  `filasRetencion` (una fila restada por retención).
- `src/lib/documents/server/cargadores/pagos.ts`: el comprobante de egreso de una factura de
  compra con retenciones pinta `totalFactura`, cada `retencion`, `netoPagar` y luego el
  `valorPagado` (el único con estilo total). Sin retenciones, igual que antes. Las mismas claves
  de `documentos.totales` que la factura de compra: no hay textos nuevos.
- Pruebas: `src/__tests__/finanzas/compras/asientoRetenciones.contract.test.ts` (lee la última
  definición de cada función en las migraciones; la clasificación usa las expresiones del SQL) y
  dos casos nuevos en `src/lib/documents/__tests__/motor.test.ts`.

## 6. Pendiente (siguiente fase)

- **Certificado de retenciones** (`certificado-retenciones`, 09 · `1491:126182`): nuevo tipo en el
  motor de documentos, por proveedor y periodo, agrupado por concepto y cuenta, desde
  `invoice_purchase_withholdings` de facturas no anuladas.
- **Visor «Retenciones practicadas»** (14 · `1360:23377`): reporte por periodo y sucursal con los
  saldos de 2365/2367/2368 y el vencimiento de la declaración.
- **Configuración** (07 · `1012:87208`): mostrar la cuenta contable de cada retención y permitir
  cambiarla (escribe `tax_account_mapping`, que `fn_cuenta_retencion_compra` ya respeta), y la
  base mínima en UVT.
- Una factura insertada directamente en `received` por un camino que no sea
  `fn_fc_guardar_int` + `fn_fc_confirmar_int` graba las retenciones después del asiento y este
  queda por el total. Hoy ningún camino lo hace.
