# Anticipos y consignación — correcciones de la ronda 5 del Contador (2026-11-09)

Respuestas 9 a 13 de `RESPUESTAS-CONTADOR-RONDA-5-2026-11-09.md`, las cuatro citas que corrige y el pendiente «aplicar
la retención de la operación a la cartera». Las respuestas 1 a 8 (IVA y perfil) las trabaja el otro equipo en su
informe.

**Nada se aplicó.** Las dos migraciones de este frente siguen **ESCRITAS, NO APLICADAS** («SIN APLICAR»), con su
reversión. Todo lo de abajo se comprobó en pruebas en seco: una transacción que termina con una excepción (= rollback),
con las migraciones cargadas completas y exactas (md5 comprobado dentro de la corrida).

| Archivo | md5 final |
|---|---|
| `supabase/migrations/20261108121000_consignaciones.sql` | `f52c0de6f53856fc9dd38bb5b3403809` |
| `supabase/migrations/20261108170000_anticipos_proveedores_contador.sql` | `0c5079355e6c5ab55dd6b14e1e484cea` |
| `supabase/rollbacks/20261108121000_consignaciones_rollback.sql` | `4e4b6c2d27994770ce62d9be7ba25176` |
| `supabase/rollbacks/20261108170000_anticipos_proveedores_contador_rollback.sql` | `8fdcd3ad82ac3be2c87742ce3e47d398` |

Las corridas cargaron además, sin cambios de este frente: 20261108120500 `6a5a3ead2fe311fdde4b7d5c0376c12b`,
140500 `4b00bf10bf99ff2a97e2e89ff0480811`, 160000 `85fd17321a7e85d85a58916cb2f84c95`, 160500
`1d80345bde9c6d9fd378bc10e8c43a5e` y 165000 `1ec6641bdf74dfc15163d0753982309f` (las dos últimas, en la versión que
el otro equipo tenía en disco a la hora de la corrida).

## Evidencia

Corridas del 2026-11-09 entre las 23:00 y las 23:59 de Bogotá (2026-11-10 UTC). Escrituras solo en la org 374
(sucursal 585) y, en los casos entre dos organizaciones de la prueba 14, en la org 138 (sucursal 113).

| Prueba (`docs/contador/pruebas/`) | md5 del archivo | Resultado | md5 del `.resultado.txt` |
|---|---|---|---|
| `20_anticipos_consignacion_integrada_completa.sql` — **integrada**, archivos completos y exactos | `9f59f8e190e09203b1f564c9e248c0e5` | **288/288** + 7/7 de carga (11: 53 · 15: 73 · 20: 21 · 21: 54 · 22: 39 · 25: 25 · 26: 23) | `3ecfc0071e89c74e09ba2bb1c89cb28c` |
| `25_anticipos_ronda5_contador.sql` — **nueva** | `cc9171429ec7b29a1dca4ed663fe9899` | 25/25 + 7/7 | `d730eb469b5464fa2618c6f91361f778` |
| `26_consignacion_ronda5_contador.sql` — **nueva** | `3b162b02651222fb161868e30946aecd` | 23/23 + 7/7 | `382d67ab572e6153d7dc452b1de37411` |
| `14_consignaciones_ronda2_punta_a_punta.sql` (con I1–I6 entre dos organizaciones) | `afe51b4f4d24f11f48d4b9560704ee28` | 64/64 + 7/7 | `ca2682bc6bf0cbd043a3954a59bcbf9e` |
| `11_anticipos_correcciones_contador.sql` | `8633b2c9e5e1412ac2b62583e48fd560` | 53/53 + 7/7 | `df6c2d631222b0fe15917d5119009e48` |
| `15_consignaciones_ronda3_comision_y_retenciones.sql` | `718c23c813091681b110690b129f5f77` | 73/73 + 7/7 | `8fc05cd62ca8d2042bda6b57c4f5176d` |
| `21_anticipos_ronda4_aiu_ica_devoluciones.sql` | `2950749a3850cf963e8a10857b6f7661` | 54/54 + 7/7 | `1c89e70631f51fc328e168fddd1717b5` |
| `22_consignacion_ronda4_retenciones_y_comision.sql` | `5c45db099e1b3f36d92a60ca2a51b59d` | 39/39 + 7/7 | `015580821db3eaec613886591eb9dc3d` |

Verificación al terminar (solo lectura): las tablas y funciones de las dos migraciones siguen sin existir en la base;
en las orgs 374 y 138 no quedó ningún proveedor, cliente, producto, factura, pago, asiento ni anticipo de las pruebas; la
374 sigue con 1 miembro; los objetos grandes usados para subir los archivos se borraron.

Cada `.resultado.txt` trae la fecha, el md5 de cada migración, el md5 de lo ejecutado y las corridas que fallaron
antes de la que vale. La integrada corre en una sola transacción, sobre el mismo estado: 11 → 21 → 25 → 15 → 22 → 26 →
20. En la salida de la herramienta se recortó el detalle intermedio de la 11 y de la 20 (su resumen es completo); el
detalle de cada cuerpo está en su propio resultado.

**Esperados que cambiaron, y por qué** (ningún cálculo cambió):

- 21 · B4d: decía «retefuente:DUR 1.2.4.17»; ahora «DUR 1.2.4.8» (la cita que el Contador corrige). Mismo período.
- 14 · Z1 14 → 18, Z8 9 → 12 y Z10 ×9 → ×12: los casos entre dos organizaciones (I1–I6) no corrían en la ronda 4 y
  ahora sí; suman sus 4 asientos y las 3 retenciones pendientes de la liquidación entre organizaciones.
- Todas las pruebas fijan al empezar `set local timezone to 'America/Bogota'`: la primera corrida de la 22 se detuvo en
  `fecha_futura` porque a las 23:20 de Bogotá el `current_date` de la sesión (UTC) ya era del día siguiente.
- 26 · C5: compara la cartera con la cuenta deudora con que se causó **esa** factura (en la integrada es el auxiliar
  13050501, que crea la 22; sola, 1305).

## Anticipos

### Respuesta 9 y primera cita: período de la reversión por impuesto

| Qué pidió | Qué cambió | Dónde | Prueba |
|---|---|---|---|
| reteIVA en reversiones: art. 1.3.2.3.1 del DUR 1625/2016 — el período de la anulación y el saldo en los **dos** siguientes | `fn_retencion_periodo_descuento` devuelve, además del período y la regla, **dónde va el saldo**: `dos_siguientes` con los dos únicos períodos admitidos (`periodos_saldo`). El pendiente `descuento_retencion_siguientes_periodos` guarda `saldo`, `periodos_saldo` y `limite_periodos = 2` | 170000 · `fn_retencion_periodo_descuento`, `fn_retencion_saldo_pendiente_detalle` | 25 P3, P4 (cruza de año: 2027-01 y 2027-02), D3 |
| reteIVA en exceso: reintegro con **solicitud escrita** y **manifestación escrita de no imputación** del retenido | `fn_anticipo_retencion_exceso_reintegrar` exige los dos soportes para reteIVA (`soporte_procedimiento_obligatorio`, detalle `manifestacion_no_imputacion`); el ajuste los guarda. Período: el del reintegro | 170000 · reintegro de exceso | 25 E1–E3 |
| Renta: anulación art. **1.2.4.8**, exceso art. **1.2.4.16**; reemplazar el 1.2.4.17 | Las reglas escritas en cada ajuste citan 1.2.4.8 (anulación, rescisión o resolución; el saldo en los siguientes) y 1.2.4.16 (exceso). Ninguna función cargada cita el artículo retirado | 170000 | 25 P1, P2, P8, D2; 21 B4d |

### Respuesta 12: excedentes de ReteICA

| Qué pidió | Qué cambió | Prueba |
|---|---|---|
| Pendiente en los períodos siguientes, con la **solicitud escrita guardada**, **sin límite de períodos** | El pendiente de ReteICA queda `siguientes_sin_limite`, sin `limite_periodos`, y guarda `soporte_solicitud`. Sin la solicitud escrita no nace (`reteica_solicitud_escrita_obligatoria`). Ningún límite de períodos en el código ni en los datos (no existía; se verificó) | 25 D5, D6; P6 |

### Respuesta 13: piso del 10 % del AIU por operación y acumulado del contrato

| Qué pidió | Qué cambió | Prueba |
|---|---|---|
| Controlar en **ambos**: por factura (operación) y acumulado del contrato | Nueva `fn_aiu_contrato_acumulado` (operaciones vigentes del contrato, netas de devoluciones por línea; sin anuladas). El evaluador aplica el piso por operación y, si el acumulado previo más la operación quedara por debajo del 10 %, sube la base (`minimo_10_contrato_aplicado`). Una operación que llevaría el acumulado por encima del valor del contrato deja las retenciones **pendientes** (`aiu_excede_valor_contrato`). Nueva `fn_aiu_contrato_exigir_minimo`: una devolución que rompa el piso de la operación (`aiu_minimo_10_operacion`) o del contrato (`aiu_minimo_10_contrato`) se rechaza | 25 A1–A5 |

Nota para el Contador: con el piso aplicado en **cada** operación, el acumulado cumple siempre (la suma de bases de al
menos el 10 % es al menos el 10 % de la suma). El control acumulado hace diferencia en dos casos: las **devoluciones**
de líneas de AIU (25 A3) y un contrato que se **excede** de su valor (25 A5). Ver la pregunta 3.

## Consignación

### Respuesta 10: retención de la operación con el cobro, sin inflar la cartera

| Qué pidió | Qué cambió (20261108121000) | Prueba |
|---|---|---|
| Mantener D 281510 del dueño / C cartera del cliente (Concepto DIAN 13277/2025) | Igual que en la ronda 4 | 22 R6; 26 C5; 20 C1 |
| **Abono a la factura en el mismo momento del cobro** | `fn_consignacion_retencion_practicada` (de la operación) exige el **cobro**: `p_pago`, un pago **completado de esa factura** (`cobro_obligatorio`, `cobro_de_otra_factura`) y **en su misma fecha** (`fecha_distinta_del_cobro`). En la misma transacción deja el abono en la tabla nueva `consignment_withholding_receivable_applications` (retención, factura, cobro, valor, fecha, asiento; estado `por_aplicar`) | 26 C1–C3, C6 |
| La cartera **no puede quedar inflada** | El abono por retención, sumado a los demás abonos por retención de esa factura, no puede superar lo que la factura todavía debe después del cobro (`retencion_excede_saldo_factura`). Nueva lectura `fn_consignacion_cartera_retenciones`: **saldo real exigible** = saldo de la factura − abonos por retención por aplicar | 26 C4, C5, C7, C10 |
| El certificado como **pendiente de soporte** | La practicada deja `consignacion_retencion_certificado_pendiente` con el texto «pendiente de soporte»; conciliar sigue sin crear el hecho | 26 C9; 22 R4, R8 |
| No escribir la cartera a mano | La cartera operativa (`invoice_sales.balance`, `accounts_receivable`) sigue a los disparadores de `payments`; la migración no la escribe | 26 C8; jest |

**Lo que falta para cerrar el abono en la cartera operativa** (no se hizo, ver «Lo que NO se hizo»): el saldo de la
factura lo calcula `fn_invoice_sales_paid` (pagos + notas crédito aplicadas), que es del módulo de cartera, fuera de
este frente. Mientras no cuente estos abonos, la factura del ejemplo muestra saldo 1.710 y el **saldo real exigible**
0; el pendiente `consignacion_cartera_retencion_por_aplicar` queda visible con la factura y el cobro.

### Respuesta 11: saldo exigible, orden de aplicación y liquidación por escrito

| Qué pidió | Qué cambió | Prueba |
|---|---|---|
| Excluir lo facturado y no cobrado del saldo exigible | Se mantiene; el comentario de `fn_consignacion_saldo_dueno` cita el C.Co. art. **1277** | 22 Z0, C9 |
| El contrato debe fijar el **orden de aplicación** | Término obligatorio de la recibida en mandato: `orden_aplicacion` (remuneración, gastos reembolsables, anticipos, derechos frente al dueño), sin repetidos; con compensación pactada, la remuneración debe estar en el orden. Se guarda en `consignment_notes.settlement_terms` | 26 N1–N4, N8 |
| …y la **liquidación por escrito** | Término obligatorio `liquidacion_escrita` {medio: documento compartido, correo o documento físico; plazo de 1 a 90 días}. La liquidación lo lleva en su salida y en el documento compartido con el dueño (`terminos_liquidacion`) | 26 N5–N7, N10; 14 I4b |
| — (hallazgo de esta ronda) | **Aceptar una nota de otra organización estaba roto desde la ronda 4**: la copia del dueño no trae la compensación (ni ahora el orden ni la liquidación) y la aceptación la exigía. `fn_consignacion_recibida_aceptar` recibe `p_terminos_contrato`, que declara quien recibe; si la copia ya los trae, deben coincidir (`terminos_distintos_del_documento`) | 14 I3a, I3b, I3, I3c |
| La entregada (lado del mandante) no cambia | No exige estos términos | 26 N9 |

### Cuarta cita: C.Co. art. 1281 → 1277

No había uso del 1281 en el repositorio; las referencias nuevas citan el 1277.

## Las cuatro citas que corrige: dónde se usaban

| Cita | Uso en este frente | Uso fuera de este frente (no se tocó) |
|---|---|---|
| DUR art. 1.2.4.17 | Migración 170000 (regla del período, comentarios) y prueba 21 B4d: **reemplazados**. La prueba 25 · P8 comprueba que ninguna función cargada lo cite | `docs/contador/ANTICIPOS-Y-CONSIGNACION-RONDA-4-2026-11-09.md` línea 70 (informe de la ronda 4; no se reescribe, lo corrige este informe) y la propia respuesta del Contador |
| Decreto 271/2002 de Bogotá | Ninguno | Ninguno (solo la respuesta del Contador) |
| «Límite de 6 períodos» de ReteICA | Ninguno (no había límite en código ni datos) | Ninguno |
| C.Co. art. 1281 | Ninguno | Ninguno |

Búsqueda en `src/`, `supabase/`, `docs/` y `messages/`.

## Pantallas y código (`src/`)

Sin pantallas nuevas (Figma primero). Solo los campos que la base ahora exige, en los formularios que ya existían:

- **Recibir mercancía en consignación** (condiciones del contrato, solo recibida en mandato): orden de aplicación (tres
  órdenes completos para elegir) y liquidación por escrito (medio y plazo). Pieza nueva
  `src/components/inventario/consignaciones/TerminosLiquidacionCampos.tsx`, usada dentro de
  `CondicionesContratoCampos.tsx`.
- **Aceptar una nota que llegó de otra organización** (`DocumentoPorAceptarPagina.tsx`): la misma pieza, más la
  pregunta de la compensación. «Aceptar» se habilita cuando están completos; viajan como `terminos_contrato`.
- **Reintegro de retención en exceso** (`ExcesoRetencionDialog.tsx`): con reteIVA, campo obligatorio «Manifestación
  escrita de no imputación»; el texto del período explica la regla de cada impuesto.
- **Devolución de un anticipo** (`SeccionRetencionesDevolucion.tsx`): el texto del período dice 1.2.4.8, 1.3.2.3.1 (dos
  períodos) y ReteICA sin límite con la solicitud escrita.
- Contratos y servidor: `src/lib/inventario/consignaciones/recibidas.ts` (términos, validación, esquemas y códigos
  nuevos), `src/lib/services/consignaciones/recibidas.server.ts` (`p_pago`, `p_terminos_contrato`),
  `src/lib/finanzas/anticiposProveedor/contrato.ts` (manifestación obligatoria con reteIVA). Rutas: las de siempre, con
  `withOrg` y la organización de la sesión; no hay rutas nuevas.
- Textos en es/en/fr/pt: namespaces nuevos `finanzasTercerosR5` y `consignacionesR5`. Los errores nuevos se leen en
  `consignacionesR5.errores` (`textoErrorConsignacion.ts`).
- Jest: `src/__tests__/finanzas/tercerosR5/anticiposRonda5.test.ts` y
  `src/__tests__/inventario/consignaciones/recibidasRonda5.test.ts` (nuevos), además de los de las rondas 3 y 4.

## Lo que NO se hizo o sigue pendiente

1. **Ninguna migración aplicada.** El conjunto sigue sin activar.
2. **Cerrar el abono por retención en la cartera operativa.** El abono queda registrado con su cobro y su fecha
   (`por_aplicar`) y el saldo real exigible lo descuenta, pero el saldo de la factura no lo cuenta: hace falta que
   `fn_invoice_sales_paid` (módulo de cartera, fuera de este frente) sume los abonos por retención y que la fila pase a
   `aplicada`. No se hizo sin una decisión del dueño sobre ese cambio, porque toca el saldo de todas las facturas.
3. **La pantalla para registrar la retención de la operación no pide la factura ni el cobro.** «Registrar practicada»
   sirve hoy para la de la remuneración; para la de la operación, la base exige factura y cobro y la pantalla todavía no
   los ofrece (ya pasaba en la ronda 4 con la factura). Va primero a Figma.
4. **Constancia de entrega de la liquidación por escrito**: se fijan el medio y el plazo; no se registra todavía cuándo
   se entregó ni se avisa si vence el plazo.
5. **El orden de aplicación se guarda y viaja con la liquidación, pero el motor no lo usa para decidir qué se descuenta
   primero**: la liquidación sigue aplicando la remuneración y los derechos frente al dueño como en la ronda 4.
6. **Lado del mandante** de la consignación: sigue sin diseñar.
7. **reteIVA en exceso, saldo que no alcance**: el período es el del reintegro; dónde va el saldo queda «por confirmar»
   (pregunta 1).
8. Las pantallas de contratos AIU, procedimientos de ReteICA y conversión de financiación siguen sin construir (se
   operan por las RPC).

## Preguntas para el Contador

1. **reteIVA en exceso**: si el reintegro no alcanza a descontarse en el período en que se hace, ¿el saldo va a los dos
   períodos siguientes, como en la anulación, o a los siguientes sin límite?
2. **Abono por retención en la cartera**: ¿confirma que el abono cuente en el saldo de la factura igual que un pago (es
   decir, que la factura del ejemplo quede saldada con el cobro de 69.690 más la retención de 1.710)?
3. **Piso del AIU acumulado**: con el piso aplicado en cada operación, el acumulado solo cambia el resultado en
   devoluciones y en contratos que se exceden de su valor. ¿Hay otro caso que quiera que controle (por ejemplo, un
   anticipo de AIU sin costo directo)?
4. **Orden de aplicación**: ¿el motor debe aplicar lo recaudado en ese orden al liquidar (hoy solo se guarda y se informa
   en la liquidación), y qué hace si el contrato no pacta la compensación pero el orden incluye la remuneración?
5. **Liquidación por escrito**: ¿el plazo se cuenta desde el corte del período liquidado o desde la última venta?
