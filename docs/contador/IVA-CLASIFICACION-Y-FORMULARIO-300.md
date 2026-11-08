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

## 5. Preguntas abiertas (ronda 1, ya respondidas)

Usted las respondió en `RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md`. Lo que se hizo con cada respuesta está en la
sección 7, «Ronda 2». Las secciones 1 a 4 se conservan como registro de la ronda 1.

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
| `pruebas/10_iva_clasificacion_y_300.sql` · `.resultado.txt` | Prueba en seco (reescrita en la ronda 2: 70 de 70) |

---

## 7. Ronda 2

Responde a las secciones «Cuentas de IVA…» e «IVA: B1–B7» de `RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md`.

**Estado:** las cuatro migraciones (H1 y las tres de esta nota) se **reescribieron** y siguen **SIN aplicar**. Ningún
documento, asiento ni importe existente cambia.

### 7.1 A1 y A2 · Tarifa no identificada y nota crédito parcial (B7)

Detalle y prueba en el anexo H1/H2 (prueba 12, **20 de 20**).

- **A1:** si no se sabe la tarifa, ya no se asume el 19 %. El documento queda **sin asiento** y aparece en Pendientes
  contables con «Tarifa de IVA no identificada…».
- **A2:** una nota crédito armada antes de sus líneas sigue estas reglas:
  - Si es **total**, reproduce la composición de la factura.
  - Si la factura tiene **una sola tarifa**, usa esa tarifa.
  - En cualquier otro caso queda **pendiente**. Nunca se reparte por la mezcla de tarifas de la factura.

### 7.2 B1 · Casillas sin IVA, con sus condiciones

| Concepto | Casilla | Condición para entrar; si no, pendiente |
|---|---|---|
| Exportación de bienes | 30 | Exenta y con **soporte estructurado**: tipo, número y fecha. Sin soporte → «Exportación sin soporte» |
| Exportación de servicios | 31 | Igual que 30 |
| Exentas nacionales | 35 | Fundamento escrito; si falta → «Exenta sin fundamento» |
| Excluidas | 39 | Fundamento; si falta → «Sin fundamento» |
| Ingresos no gravados (no sujetas) | 40 | Fundamento |
| Importaciones no gravadas | 47 | Compra no gravada con tipo de operación «importación» y fundamento |
| Compras nacionales excluidas, exentas y no gravadas | 54 | Fundamento |

- **Exportaciones:** escribir «exenta» y un texto no basta. El tipo de operación «exportación» exige tratamiento exento.
  Si se clasifica gravada, la clasificación se rechaza (`EXPORTACION_DEBE_SER_EXENTA`).
- **Validación del soporte:** el sistema solo comprueba que el soporte esté registrado. La validez del documento
  (declaración de exportación u otro) la juzga usted.

### 7.3 B2 · Notas débito

- Una nota débito de una venta gravada va a **27/58 o 28/59** según la tarifa, como venta del período en que se
  contabiliza.
- Si la factura que corrige es de **otro período**, el origen lleva la señal **«Nota débito de otro período · factura
  …»**. Además, el borrador muestra una alerta: «si corrigen una omisión, evalúe la declaración del período afectado».
- Con la señal, usted decide si se evalúa la declaración del período afectado. El sistema no decide ni mueve valores
  entre períodos.

### 7.4 B3 · Proporcionalidad (art. 490)

- La **base va completa** a la casilla de compras (51, 52…).
- Solo el IVA se limita: a 72/75 va el porcentaje registrado. El resto queda pendiente «IVA marcado no descontable
  pero contabilizado en 2408».
- El porcentaje exige un motivo escrito (el sustento del art. 490).

Ejemplo de la prueba, compra FCP de 200.000 al 19 % y 60 %:

| Concepto | Valor |
|---|---|
| Base en la casilla 51 | 200.000 |
| IVA en la casilla 72 | 22.800 (60 % de 38.000) |
| IVA pendiente | 15.200 |

### 7.5 B4 · Devolución de compra: asiento y naturaleza ya no bastan

Registrar un movimiento de la 2408 como «devolución de compra» exige ahora todo esto:

- el vínculo con la **compra** (o con el documento soporte);
- las **líneas** devueltas de ese documento, con base e IVA de cada una, que deben sumar los totales;
- la **base** y el **IVA**, que deben coincidir (±$1) con el movimiento de la 2408;
- el **tipo de soporte**:
  - «nota crédito del proveedor» para una compra;
  - **«nota de ajuste del documento soporte»** para un documento soporte electrónico;
- el número y la fecha del soporte.

Si falta algo, el registro se rechaza:

| Código | Qué falta |
|---|---|
| `DEVOLUCION_INCOMPLETA` | Algún dato obligatorio |
| `DEVOLUCION_DS_SIN_NOTA_AJUSTE` | El soporte de un documento soporte no es su nota de ajuste |
| `DEVOLUCION_LINEAS_AJENAS` | Líneas que no son del documento vinculado |
| `DEVOLUCION_LINEAS_NO_SUMAN` | Las líneas no suman la base o el IVA |
| `DEVOLUCION_IVA_NO_CUADRA` | El IVA no coincide con el movimiento |

Si el registro no se completa, el movimiento queda pendiente.

En el formulario, con la corrección (a):

- la base va a la **casilla 56**;
- a la **66** va solo el IVA que en su momento se descontó;
- el resto del IVA queda pendiente «Devolución de compra: IVA que no se había descontado».

**Pendiente de diseño (pregunta 7.11):** por ahora la devolución se documenta sobre el asiento que ya existe. Una nota
crédito de compra como documento propio, con su asiento automático, no existe en el sistema.

### 7.6 B5 · IVA no descontable conocido antes de contabilizar: propuesta, no implementada

*(Ronda 3: aprobada e implementada; ver la sección 8.1.)*

**Situación actual:** la contabilización de la compra (`fn_auto_journal_purchase` y `fn_armar_asiento_documento`)
lleva **todo** el IVA a la 2408, a través de `fn_iva_reparto` (H1). Hoy no hay forma de que una línea evaluada «no
descontable» antes de contabilizar mande su IVA al costo. Mientras tanto, el borrador lo deja pendiente «IVA marcado
no descontable pero contabilizado en 2408 (requiere ajuste)».

**Propuesta para una migración posterior a H1 y a 20261108150000:**

1. `fn_iva_pesos_por_tarifa` excluye, en compras y documento soporte, el IVA de las líneas «no descontable» y la parte no
   procedente de las «proporcional».
2. `fn_armar_asiento_documento` suma ese IVA a la cuenta de la línea (inventario, activo, costo o gasto). Así queda
   como mayor valor, como usted indicó.
3. El borrador acepta una 2408 reducida en esas líneas sin dejarlas pendientes. Eso solo vale si la evaluación es
   anterior al asiento. Si es posterior, sigue el pendiente actual.
4. La deducibilidad en renta queda fuera, como usted indicó.

Necesita su visto bueno y la orden del dueño. Toca el asiento de compras de todas las organizaciones.

### 7.7 B6 · Venta revertida sin nota crédito y corrección de error

- **Control provisional** (sin cambios en la regla):
  - la venta se conserva en 28/59;
  - la reversa contable queda pendiente «Reversa contable sin nota crédito», hasta que se emita la nota crédito
    electrónica. La reversa no la sustituye.
- **Corrección de error** (nuevo): si se prueba que la operación **nunca existió**, se registra la naturaleza
  «corrección de error» sobre la **reversa**, con su soporte.
  - Solo se acepta sobre un asiento que revierte a otro (`CORRECCION_SOLO_REVERSAS`).
  - El efecto: la venta original **sale de 28/59** y los dos movimientos (venta y reversa) quedan en «no afecta».
- **Prueba POS4:** venta de 100.000 + 19.000 y su reversa, registrada como corrección de error. No aparece en 59. Los
  movimientos +19.000 y −19.000 quedan como «no afecta», con efecto neto 0.

### 7.8 Correcciones indispensables

**(a) Las bases de compra no dependen del descontable.**

- Una compra gravada **no descontable** o **por evaluar** conserva su base en 50 a 53. Solo su IVA queda fuera de
  71 a 75, como pendiente.
- La devolución lleva su base a la 56 aunque la 66 quede en 0 (prueba NCC2: base 10.000, IVA 0 en la 66).

**(b) No hay selector de «período del descuento».**

- Se eliminaron la columna, el campo del diálogo y el motivo «se descuenta en otro período».
- La compra se descuenta en el período que contiene su **fecha de contabilización**. Una compra de octubre se queda en
  octubre (prueba: FCOCT en 51/72 de octubre).
- Cada origen muestra dos fechas distintas:
  - la **fecha de contabilización**, que decide el período;
  - la **fecha del documento**.
- El **período fiscal** es el rango que se elige en la pantalla del borrador: bimestral, cuatrimestral o anual. No es
  el mes calendario de la fecha.
- Una compra con fecha de documento anterior al período, pero contabilizada en él, lleva la señal «causada en un
  período anterior». Usted evalúa la oportunidad del art. 496; el sistema no la decide.

**(c) El documento soporte no genera IVA descontable por una marca.**

- Una línea gravada de documento soporte **no puede** marcarse «descontable» (`SOPORTE_NO_DESCONTABLE`). La excepción
  es un supuesto especial: tipo «otra operación especial» o «importación», con fundamento.
- Aun en ese caso, en el borrador queda pendiente «Documento soporte con IVA: supuesto especial por revisar», con su
  base y su IVA. Nunca llega solo a 74/75.
- En la prueba, el DS ya no está en la 75: la casilla bajó de 600.000/114.000 a 500.000/95.000.

### 7.9 Otros movimientos: señales, no clasificación

- Ya **no** se clasifica nada automáticamente:
  - un pago con contrapartida en bancos o caja **no** se toma como pago a la DIAN;
  - un asiento que suma cero en la 2408 **no** se toma como traslado.
- El borrador muestra **«sugerido: pago a la DIAN · por confirmar»** o «sugerido: traslado · por confirmar». El
  movimiento sigue **pendiente** («Movimiento con naturaleza sugerida por confirmar») hasta que alguien registre su
  naturaleza.
- Registrar la naturaleza exige soporte (tipo, número y fecha). La única excepción es el cierre del ejercicio, que se
  reconoce por su origen.
- Solo después de registrarla, el pago o el traslado pasan a «no afecta».

### 7.10 El puente de −$31.000 de la ronda 1, componente por componente

En la ronda 1 la conciliación decía:

> libro 2408 −353.615 = casillas −267.015 + pendientes −55.600 + otros −31.000 + redondeo 0

**El total cuadraba, pero la composición tenía dos errores de 19.000 que se anulaban entre sí.**

| Componente | Valor | Dónde estaba | Comentario |
|---|---|---|---|
| PAGO: pago a la DIAN desde bancos (D 2408) | −50.000 | «Otros», como «no afecta» | Única pieza correcta del puente. Su naturaleza se dedujo por la contrapartida en bancos; en la ronda 2 eso es solo una señal |
| NCC1: devolución de la compra FCB (C 2408) | +19.000 | «Otros» **y además** en la casilla 66 | **Contada dos veces** |
| FCOCT: compra de octubre arrastrada a noviembre | −19.000 | Casilla 72 de noviembre | Su asiento es de **octubre**: no está en la 2408 de noviembre. La prueba decía «efecto 0», y no era así |
| **Total «otros»** | **−31.000** | | = −50.000 + 19.000 |

Puente correcto de la ronda 1, con los mismos documentos:

| Componente | Valor |
|---|---|
| Casillas sin FCOCT (NCC1 una sola vez, en la 66) | −248.015 |
| Pendientes | −55.600 |
| Otros: solo el PAGO | −50.000 |
| **Libro 2408 de noviembre** | **−353.615** |

**Ubicación fiscal de cada pieza:**

| Pieza | Ubicación |
|---|---|
| Pago a la DIAN | No afecta el formulario: paga una declaración anterior. Se ve con su recibo en «otros movimientos» |
| Devolución de compra | Casilla 56 la base, 66 el IVA recuperado, una sola vez |
| Compra de octubre | Pertenece a octubre (corrección b) |

**Qué cambió en la ronda 2 para que no vuelva a pasar:**

- La conciliación suma en «otros» **solo** los movimientos en «no afecta» o «por diligenciar». Las devoluciones
  registradas van a casillas y no se repiten en «otros».
- Las compras de otro período ya no se traen.
- Los movimientos sin registro, aunque tengan señal, van a pendientes.

Puente de la ronda 2 (prueba 10, noviembre):

| Componente | Valor | Detalle |
|---|---|---|
| Casillas | −242.315 | Generado 128.500 − descontable 370.815 |
| Pendientes de líneas | −60.800 | No descontable en la 2408 −34.200 · por evaluar −9.500 · supuesto especial del DS −19.000 · IVA de devolución no descontado +1.900 |
| Pendientes de otros movimientos | −78.050 | PAGO sin registro −50.000 (sugerido pago a la DIAN) · AJ −10.000 · reversa de POS2 −19.000 · NCC3 rechazada +950 · traslado 0 |
| Otros que no afectan | −30.000 | PAGO2 con su recibo −30.000 · POS4 y su reversa (corrección de error) +19.000 − 19.000 |
| Redondeo | 0 | |
| **Libro 2408 (SELECT directo)** | **−411.165** | **Diferencia 0** |

La prueba verificó el libro y la diferencia. Las cifras por componente salen de la composición de la prueba, no de
una aserción separada para cada una.

### 7.11 Preguntas para su criterio

1. **B5:** ¿aprueba la propuesta de 7.6 (el IVA no descontable conocido antes de contabilizar va a la cuenta de la línea)?
2. **B4:** ¿basta documentar la devolución sobre el asiento que ya existe, o pide una nota crédito de compra como
   documento propio antes de aplicar?
3. **B1, casilla 47:** ¿la importación no gravada necesita un soporte estructurado (declaración de importación), como la
   exportación? Hoy basta el fundamento.
4. **Corrección de error:** ¿qué soporte considera suficiente para dar por probada una operación inexistente? Hoy se
   exige tipo, número y fecha, y el sistema no valida su contenido.

### 7.12 Resultados

| Verificación | Resultado |
|---|---|
| Prueba 10, reescrita (org 374, todo revertido) | **70 de 70** |
| Prueba 12, H1 ronda 2 | **20 de 20** |
| Pruebas unitarias del borrador y del contrato de H1 (jest) | **31 de 31** |

La prueba 10 cubre:

- exportación con y sin soporte;
- exentas, excluidas y no sujetas con fundamento;
- compra excluida;
- nota débito de otro período;
- proporcional;
- devoluciones completas, sin IVA descontado y rechazadas;
- documento soporte marcado a mano;
- pago con y sin registro, y traslado;
- corrección de error;
- octubre declarado;
- permisos.

**Archivos nuevos o reescritos en la ronda 2:**

| Archivo | Cambio |
|---|---|
| Las tres migraciones de esta nota y H1 | Reescritas, sin aplicar |
| `pruebas/12_h1_ronda2_tarifa_no_identificada.sql` · `.resultado.txt` | Nueva |
| `src/lib/finanzas/tributario/formulario300.ts` | Casillas, filas, motivos y validaciones de la ronda 2 |
| Pantalla del borrador, diálogo de la línea y diálogo de naturaleza | Soporte estructurado, líneas de la devolución, señales «sugerido», dos fechas |
| `messages/*.json` | Namespace `finanzasIva300`, 4 idiomas |

---

## 8. Ronda 3

Responde a `RESPUESTAS-CONTADOR-RONDA-3-2026-11-08.md`: IVA no descontable, nota crédito sin líneas y venta
inexistente.

**Estado:** escrito y **SIN aplicar**. Hay una migración nueva y tres reescritas; ningún asiento ni documento existente
cambia. **Las pruebas en seco de esta ronda (10 y 14) están escritas pero todavía no se han corrido** (ver 8.5).

### 8.1 IVA no descontable al activo, costo o gasto (B5, aprobado)

Migración nueva `20261108152000_iva_no_descontable_al_costo.sql`. Se aplica después de H1 y de `20261108150000`.

- **Cuándo aplica:** una línea de compra o de documento soporte evaluada «no descontable», o la parte no procedente de
  una «proporcional», **antes** de contabilizar el documento.
- **Qué hace el asiento de compra:** ese IVA no va a la 2408 descontable.
  - Asiento por líneas (compras con cuenta propia y documento soporte): se suma a la línea del documento a la que
    pertenece, en su cuenta de inventario, activo, costo o gasto.
  - Asiento de cabecera (compra sin cuenta propia por línea): queda en la cuenta débito de la compra, que es la de
    todas sus líneas, igual que ya se hace con el INC.
  - La 2408 que queda se reparte por tarifa solo con la parte descontable.
- **Históricos:** no se tocan. La evaluación solo cuenta si es anterior al primer asiento del documento. Recontabilizar
  un documento ya contabilizado no lo reescribe con una evaluación posterior. La migración no hace UPDATE ni DELETE
  sobre asientos.
- **Datos inconsistentes:** si el IVA no descontable de las líneas supera el IVA del documento, no se adivina. Todo
  queda en la 2408 y el borrador deja el pendiente de siempre.
- **Borrador del 300:** reconoce la compra contabilizada así. Si la 2408 del documento es el IVA de sus líneas menos
  el no descontable, ese IVA no queda pendiente; las bases siguen en 50 a 53 (corrección a). El total se informa en
  el resumen: «IVA no descontable llevado al costo».
- **Renta:** la deducibilidad se evalúa aparte, como usted indicó.

Ejemplo de la prueba 14, compra con asiento de cabecera:

| Línea | Base | IVA | Evaluación | A la 2408 | Al costo |
|---|---|---|---|---|---|
| Bien 19 % | 100.000 | 19.000 | No descontable | 0 | 19.000 |
| Bien 19 % | 200.000 | 38.000 | Proporcional 60 % | 22.800 | 15.200 |
| Bien 5 % | 100.000 | 5.000 | Descontable | 5.000 | 0 |

Asiento esperado: D cuenta de la compra 434.200 · D 24081001 22.800 · D 24081002 5.000 · C proveedor 462.000.

**Limitación:** la evaluación tiene que existir antes de contabilizar. Una compra que se graba ya recibida se
contabiliza con «por evaluar», y su IVA no descontable sigue el camino de antes: pendiente y ajuste.

### 8.2 Nota crédito sin líneas: una sola tarifa no basta

En H1 (`20261108140000`, reescrita): la nota crédito armada antes de sus líneas solo usa «la única tarifa de la
factura» si la factura **no** tiene además conceptos excluidos, exentos, no gravados (tarifa 0) o de INC. Si los tiene,
no se sabe qué conceptos ni qué bases afecta la nota. Queda sin asiento y pendiente, con «Tarifa de IVA no
identificada…», hasta identificarlos.

La devolución total sigue reproduciendo la composición de la factura. La nota emitida desde la aplicación se arma por
sus líneas y no pasa por aquí.

### 8.3 Venta inexistente: «corrección de error» ya no basta

Para retirar la venta de sus casillas hace falta **todo** esto, registrado sobre la reversa:

1. **Acreditar el error:** soporte con su tipo, número y fecha.
2. **Resolver el documento electrónico:** nota crédito electrónica, anulación o rechazo ante la DIAN, o constancia
   de que nunca se transmitió, con su referencia (número o CUFE) y su fecha.
3. **Decir si corresponde corregir una declaración anterior:** sí o no.

Mientras falte algo:

- la venta **sigue en sus casillas**;
- la reversa queda pendiente «Corrección de error incompleta»;
- se puede guardar el avance, porque el registro incompleto no saca nada de las casillas.

**Alerta:** si la venta es de un período ya declarado, o la marca dice que sí corresponde corregir una declaración,
el borrador lo avisa con «correcciones de error sobre una declaración anterior».

En la prueba 10:

| Venta | Registro | Resultado esperado |
|---|---|---|
| POS4 | Solo el soporte (incompleta) | Sigue en 28/59; reversa pendiente |
| POS5 | Completa, marcada «sí corresponde» | Sale de 28/59; los dos movimientos «no afecta»; alerta |

### 8.4 Cifras esperadas de la prueba 10 (ronda 3)

| Concepto | Valor esperado |
|---|---|
| Casilla 28 | 650.000 (se suma POS4) |
| Casilla 59 | 123.500 (124.000 en el formulario) |
| Casilla 51 | 1.500.000 (se suman las bases de FCAC) |
| Casilla 72 | 222.300 (222.000 en el formulario) |
| Generado / descontable | 147.500 / 380.315 |
| IVA no descontable llevado al costo | 19.000 (FCAC) |

Conciliación esperada:

| Componente | Valor |
|---|---|
| Casillas | −232.815 |
| Pendientes | −157.850 |
| Otros que no afectan | −30.000 |
| **Libro 2408** | **−420.665** · diferencia 0 |

### 8.5 Pruebas

| Verificación | Resultado |
|---|---|
| Pruebas unitarias (jest): borrador, contrato de H1 y B5, tributario | **96 de 96** |
| Verificación estática de los reemplazos de B5 (cada texto aparece una vez después de H1; la reversión deja las funciones idénticas) | Todo ok |
| Prueba 14 (`pruebas/17_iva_no_descontable_al_costo.sql`: B5 por cabecera, por líneas, documento soporte, evaluación posterior, ventas sin cambio, nota crédito con conceptos sin IVA) | **Escrita, sin correr** |
| Prueba 10 reescrita (POS4, POS5, FCAC y dos validaciones nuevas; 76 verificaciones) | **Escrita, sin correr** |

Las dos pruebas en seco no se corrieron en esta sesión: el envío del script completo a la base se detuvo antes de
llegar a ella. Ninguna se envió a medias y la base no cambió. Se corren pegando las migraciones exactas donde dice
«MIGRACIONES».

- Prueba 14: H1, 150000 y 152000.
- Prueba 10: 150000, 150500 y 151000.

Las dos terminan en `rollback`.

### 8.6 Archivos de la ronda 3

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20261108152000_iva_no_descontable_al_costo.sql` · su reversión | Nueva (B5) |
| `supabase/migrations/20261108140000_iva_subcuenta_por_tarifa_y_lado.sql` | Nota crédito: conceptos sin IVA |
| `supabase/migrations/20261108150500_…` | Campos de la corrección de error |
| `supabase/migrations/20261108151000_…` | Corrección completa, alerta y compras con el IVA en el costo (versión 4) |
| `supabase/rollbacks/20261108150000_…` | Se detiene si 152000 sigue aplicada |
| `pruebas/17_iva_no_descontable_al_costo.sql` | Nueva |
| `pruebas/10_iva_clasificacion_y_300.sql` | Casos de la ronda 3 |
| `formulario300.ts`, pantalla del borrador y `messages/*.json` | Diálogo de la corrección, alerta e IVA llevado al costo, en 4 idiomas |
