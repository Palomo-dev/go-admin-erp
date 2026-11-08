# IVA · Clasificación por línea, procedencia del descontable y borrador del formulario 300 por casillas

Fecha: 7 de noviembre de 2026 · Base de datos: proyecto `taqjemqjtumhwptchcxk` · Organización de pruebas: **org 374**.
Responde a sus respuestas P2, P3, P4 y P9 y a las «Condiciones para cerrar su visto bueno · IVA»
(`RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md`). Complementa la nota técnica y el anexo H1/H2 del mismo día.

**Estado:** escrito y probado en seco, **NO aplicado** en la base. Se aplica cuando el dueño lo ordene. Ningún documento,
asiento ni importe existente se modifica. El borrador anterior (`fn_tributario_borrador_iva`) sigue funcionando; la versión
por casillas es una función nueva.

**Lo que este borrador NO es:** no es una declaración, no se presenta ante la DIAN y el sistema **nunca** lo marca «aprobado
fiscalmente». «Conciliado» solo dice que cuadra con la cuenta 2408. La pantalla lo dice en una banda fija: *«Borrador
conciliado con libros — no es una declaración ni está aprobado fiscalmente»*.

---

## 1. Qué cambió

### 1.1 Clasificación de IVA guardada en cada línea (P3)

Cada línea de documento guarda su propia clasificación: factura de venta, venta de caja (POS), nota crédito y nota débito de
venta, factura de compra y documento soporte.

| Dato | Valores |
|---|---|
| Tratamiento | gravada · exenta · excluida · no sujeta |
| Tarifa | la de la línea (0 para exenta, excluida y no sujeta) |
| Tipo de operación | bienes · servicios · importación · AIU · licores · retiro de inventario · otra especial |
| Fundamento | norma o soporte (texto) |
| Origen | *sugerida* (al crear la línea) · *heredada* (nota crédito: de la línea que acredita) · *manual* (la fijó una persona) |

- **El producto solo sugiere.** Al crear la línea, la base guarda una sugerencia tomada del impuesto de la línea (IVA 19 %,
  IVA 5 %, «Exento de IVA», «Excluido de IVA») y, si la línea no lo dice, de los impuestos del producto; el tipo bienes o
  servicios sale de si el producto es «producto» o «servicio». **Cambiar después el producto no cambia las líneas ya
  guardadas** (prueba 10, fila 54).
- **No se inventa.** Si no hay de dónde sugerir (línea sin producto ni impuesto, o con impuesto al consumo, que no es IVA), la
  línea queda **«sin clasificar»** y el borrador la muestra como pendiente.
- **Líneas históricas:** no se rellenan. Quedan «sin clasificar» hasta que alguien las clasifique.
- **Nota crédito:** cada línea hereda la clasificación de la línea de la factura que acredita (fila 15).
- **Un solo punto de escritura.** La sugerencia la pone un disparador de la base sobre las líneas. Eso cubre las 16 funciones
  que hoy crean líneas (POS, factura de venta, compra, soporte, notas crédito y débito, devoluciones, pedidos web, asistente)
  sin copiar la lógica en cada una. El disparador no toca cantidades, precios, impuestos ni totales (fila 10), y si falla deja
  la línea como venía: nunca bloquea una venta.
- **Corrección por una persona:** desde el detalle de cada documento, en el panel **«Datos fiscales de la línea»**, con permiso
  de creación en Finanzas. Cada cambio queda en una bitácora (antes, después, quién y cuándo).

### 1.2 Procedencia del IVA descontable (P9; ET arts. 485, 488, 490 y 496)

Cada línea de compra y de documento soporte guarda:

| Estado | Efecto en el borrador |
|---|---|
| **Por evaluar** (por defecto) | Pendiente. **Nunca se marca descontable automáticamente.** |
| Descontable | Va a su casilla (71/72/74/75) en el período que se indique (si no se indica, el del documento) |
| No descontable (al costo o gasto) | Pendiente: «marcado no descontable pero contabilizado en 2408». Pide un ajuste contable, que el sistema no hace solo |
| Proporcional (con %) | El % va a la casilla; el resto, pendiente como «no descontable» |

Todo estado distinto de «por evaluar» exige **motivo** (soporte, destinación, proporcionalidad u oportunidad). El período de
descuento permite el art. 496: la compra de octubre marcada para descontarse en noviembre sale en noviembre, señalada «de
otro período», y en el borrador de octubre aparece como «se descuenta en otro período».

### 1.3 Naturaleza de los otros movimientos de la 2408 (P4)

Los asientos que mueven la 2408 sin ser de un documento con líneas se clasifican **por su naturaleza**:

| Naturaleza | Cómo se sabe | Efecto |
|---|---|---|
| Pago a la DIAN | La registra una persona, o el asiento viene de caja o bancos y todas sus otras líneas son de disponible (11) | No crea IVA generado ni descontable |
| Traslado entre auxiliares | La registra una persona, o el neto del asiento en la 2408 es cero | No crea IVA generado ni descontable |
| Cierre | Asiento de cierre de ejercicio | No crea IVA generado ni descontable |
| Devolución de compra | La registra una persona, con la factura de compra y la base | Casillas 56/66 **solo** si el IVA de esa compra se evaluó descontable; si no, pendiente |
| Ajuste procedente | La registra una persona, **con soporte** | «Por diligenciar · ajustes», con su valor |
| Reversa contable de un documento | El asiento revierte el de una venta o compra | Pendiente: «reversa contable sin nota crédito». La venta original se conserva en su casilla |
| Importación, otro, o sin registro | — | Pendiente con su valor |

**GO Admin no tiene un documento «nota crédito de compra».** Hoy la devolución a un proveedor se contabiliza con un asiento
y se registra su naturaleza como «devolución de compra». Ver pregunta B4.

### 1.4 Períodos declarados y operaciones entre períodos

Una persona registra que el IVA de un período **ya se presentó** (formulario y fecha). El sistema nunca lo marca solo. Con
ese registro:

- el borrador de ese período dice «Período registrado como declarado»;
- todo asiento fechado en un período declarado y grabado **después** de la fecha de presentación se señala en cualquier
  borrador (filas 50 y 51);
- una nota crédito de una factura de un período anterior va a devoluciones (42/79) **en el período de la nota** y se señala
  «entre períodos», con el número de la factura de origen (fila 34).

---

## 2. Cómo se llena cada casilla

Se toman los asientos publicados del período (días de la organización, hora de Colombia). Para cada documento se compara el
IVA de sus asientos en la 2408 con el IVA de sus líneas (±$1):

- si **coincide**, cada línea va a su casilla según su clasificación guardada;
- si **no coincide**, no tiene líneas o ya tenía asiento en un período anterior, el documento entero queda **pendiente** con
  el valor de los libros.

Nunca se reparte por adivinación.

| Casilla base / IVA | Qué entra |
|---|---|
| 27 / 58 | Líneas de venta (factura, POS, nota débito) **gravadas al 5 %**, de bienes o servicios |
| 28 / 59 | Ídem **a tarifa general (19 %)** |
| 42 / 79 | Líneas gravadas de **notas crédito de venta**, en el período de la nota |
| 50 / 71 | Compras y soporte de **bienes** al 5 % con IVA **descontable** |
| 51 / 72 | Ídem bienes a tarifa general |
| 52 / 74 | Compras y soporte de **servicios** al 5 % con IVA descontable |
| 53 / 75 | Ídem servicios a tarifa general |
| 56 / 66 | Devoluciones de compra registradas, solo si el IVA de la compra devuelta se evaluó descontable |

Quedan **pendientes**, con su base y su IVA y nunca omitidas: las líneas sin clasificar; las que no tienen tipo de operación;
las operaciones especiales (licores, AIU, importación, retiro de inventario, otra); las tarifas distintas de 5 y 19 %; las
líneas cuya tarifa clasificada no coincide con su IVA; las exentas sin fundamento; el IVA de compras por evaluar, no
descontable o que se descuenta en otro período; y los movimientos de la 2408 sin soporte.

Las líneas **exentas con fundamento, excluidas o no sujetas** aparecen como «casilla por confirmar», con su base: usted no fijó
todavía esas casillas (pregunta B1).

**Valores del formulario:** cada casilla muestra el valor exacto y el valor **redondeado a miles**, con la diferencia de
redondeo.

**Resumen preliminar:**

> IVA generado (58 + 59 + 66) − IVA descontable (71 + 72 + 74 + 75 + 79)

Se muestra con la nota de que **no es el saldo a pagar**.

**Por diligenciar** (el sistema no las calcula, y por eso el borrador nunca es una liquidación completa):

- saldo a favor del período anterior;
- retenciones de IVA que le practicaron a la empresa;
- ajustes (con el valor de los ajustes procedentes registrados);
- sanciones.

**Conciliación:**

> neto de la 2408 del período = efecto de casillas + pendientes + otros movimientos + redondeo entre líneas y libros

La diferencia debe ser 0 (tolerancia de $1). «Conciliado» no es «aprobado».

---

## 3. Ejemplo numérico: la prueba en seco (noviembre de 2026, org 374)

### Documentos

- **FV1**, factura de venta: 2 × 150.000 de un bien al 19 % · 100.000 de un servicio al 5 % · 50.000 de un bien excluido.
- **FVX**, exportación: 400.000 exenta, sin fundamento.
- **POS1 y POS2**, ventas de caja: 100.000 + IVA 19.000 cada una (la caja guarda tarifa 0). El asiento de POS2 se revirtió en
  el mes.
- **POS3**, venta de caja: 30.000 sin producto ni IVA.
- **FVOCT**, factura de venta de octubre: 200.000 al 19 %, con nota crédito total emitida en noviembre.
- **FCB**, compra de bienes: 1.000.000 al 19 % y 200.000 al 5 %, evaluada descontable.
- **FCS**, compra de servicios: 500.000 al 19 % y 300.300 al 5 %, evaluada descontable.
- **FCND**, compra: 100.000 al 19 % evaluada no descontable · 50.000 al 19 % sin evaluar.
- **DS**, documento soporte: 100.000 de un servicio de aseo al 19 %, clasificado a mano como servicio descontable.
- **FCOCT**, compra de octubre: 100.000 al 19 %, descontable en noviembre.
- **NCC1**, devolución de FCB: base 100.000, IVA 19.000.
- **NCC2**, devolución de FCND: base 10.000, IVA 1.900.
- **AJ**, asiento manual: D 2408 10.000, sin soporte.
- **PAGO**, pago a la DIAN desde bancos: 50.000.

### Casillas

| Casilla | Valor | Formulario | De dónde sale |
|---|---|---|---|
| 27 / 58 | 100.000 / 5.000 | 100.000 / 5.000 | FV1, servicio al 5 % |
| 28 / 59 | 500.000 / 95.000 | 500.000 / 95.000 | FV1 300.000 + POS1 100.000 + POS2 100.000 (la venta revertida se conserva) |
| 42 / 79 | 200.000 / 38.000 | 200.000 / 38.000 | Nota crédito de FVOCT, señalada «entre períodos» |
| 50 / 71 | 200.000 / 10.000 | 200.000 / 10.000 | FCB, bien al 5 % |
| 51 / 72 | 1.100.000 / 209.000 | 1.100.000 / 209.000 | FCB + FCOCT (de octubre, señalada «de otro período») |
| 52 / 74 | 300.300 / 15.015 | **300.000 / 15.000** | FCS; diferencia de redondeo −300 / −15 |
| 53 / 75 | 600.000 / 114.000 | 600.000 / 114.000 | FCS 500.000 + DS 100.000 |
| 56 / 66 | 100.000 / 19.000 | 100.000 / 19.000 | NCC1 (FCB se evaluó descontable) |

### Pendientes

| Pendiente | Base | IVA |
|---|---|---|
| FV1, línea excluida (casilla por confirmar) | 50.000 | 0 |
| FVX, exenta sin soporte | 400.000 | 0 |
| POS3, sin clasificar | 30.000 | 0 |
| FCND, no descontable contabilizado en 2408 | 100.000 | 19.000 |
| FCND, por evaluar | 50.000 | 9.500 |
| AJ, manual sin soporte | — | −10.000 |
| Reversa de POS2 | — | −19.000 |
| NCC2, devolución cuyo IVA no se descontó | — | 1.900 |

El **PAGO** (−50.000) va a «no afecta».

### Resultado

- **Resumen preliminar:** generado 119.000 − descontable 386.015 = **−267.015**. En el formulario: 119.000 − 386.000 =
  −267.000.
- **Conciliación:** libro 2408 **−353.615** = casillas −267.015 + pendientes −55.600 + otros −31.000 + redondeo 0.
  **Diferencia 0.**

---

## 4. Resultados de las pruebas

Prueba en seco: `pruebas/10_iva_clasificacion_y_300.sql` y su `.resultado.txt`. **Corrida final: 60 de 60**
(org 374, todo revertido, migraciones pegadas en la misma transacción).

En una corrida anterior, 6 filas salieron «false» por un formato de texto **de la prueba** («300300» frente a «300300.00»);
los valores eran los mismos. Se corrigió el script y se volvió a correr.

Casos que pidió:

| Caso | Resultado |
|---|---|
| Venta 19/5 | ok |
| Venta excluida | ok |
| Exportación exenta sin soporte (pendiente) | ok |
| Compra de bienes y de servicios 19/5 | ok |
| Compra con IVA no descontable | ok |
| Nota crédito de venta de otro período | ok |
| Nota crédito de compra (las dos variantes) | ok |
| Asiento manual a 2408 sin soporte | ok |
| Pago a la DIAN | ok |

Además se probó:

- la herencia de la nota crédito;
- que cambiar el producto no altera las líneas;
- las validaciones (descontable en una venta, sin motivo, exenta con tarifa);
- los permisos: sin permiso, otra organización y clave pública rechazados.

---

## 5. Preguntas abiertas

- **B1.** ¿A qué casillas del formulario 2026 van las ventas **exentas** (con sus condiciones), **excluidas** y **no
  sujetas**, y las compras no gravadas? Hoy quedan «casilla por confirmar» con su base.
- **B2.** **Nota débito de venta:** hoy va a 27/28 como venta del período de la nota. ¿Lo confirma?
- **B3.** **Proporcional:** hoy la base completa va a la casilla de compras y solo el % del IVA a la de descontable; el resto
  queda pendiente. ¿La base también debe prorratearse?
- **B4.** **Devolución de compra:** hoy se registra con un asiento más su naturaleza. ¿Hace falta un documento propio (nota
  crédito de compra) antes de su visto bueno?
- **B5.** **No descontable contabilizado en 2408:** el borrador lo deja pendiente y pide un ajuste contable. ¿Prefiere que la
  contabilización de la compra lo lleve directo al costo o gasto cuando la línea ya se evaluó no descontable antes de
  contabilizar?
- **B6.** **Venta revertida sin nota crédito:** la venta queda en 28/59 y la reversa, pendiente. ¿Es el tratamiento que
  espera mientras se emite la nota crédito electrónica?
- **B7.** Las respuestas A1/A2 del anexo H1 siguen abiertas. No cambian este borrador, que lee toda la 2408 por documento.

## 6. Archivos

| Archivo | Qué es |
|---|---|
| `supabase/migrations/20261108150000_iva_clasificacion_por_linea.sql` | Columnas, sugerencia, disparador, lectura y clasificación con bitácora |
| `supabase/migrations/20261108150500_iva_naturaleza_movimientos_y_declaraciones.sql` | Naturaleza de los movimientos de la 2408 y períodos declarados |
| `supabase/migrations/20261108151000_tributario_borrador_iva_300.sql` | Borrador por casillas (`fn_tributario_borrador_iva_300`) |
| `supabase/rollbacks/20261108150000…`, `…150500…`, `…151000…` | Reversiones. Las dos primeras advierten que no restauran lo que las personas hayan clasificado o registrado |
| `pruebas/10_iva_clasificacion_y_300.sql` · `.resultado.txt` | Prueba en seco |
