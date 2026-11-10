# IVA y perfil tributario · Ronda 4 (2026-11-09)

Responde a `RESPUESTAS-CONTADOR-RONDA-4-2026-11-09.md`, secciones «IVA» y «Perfil y documentos históricos». Anticipos y
consignación los atiende otra nota.

**Estado:** todo está escrito y **SIN aplicar** en la base. No se reclasificó ningún histórico, no se presentó ninguna
declaración y no se hizo ningún pago. Cada cambio queda en la migración correspondiente, que sigue sin aplicar, y en su
reversión.

**Lo que cambia respecto de la ronda 3 en la evidencia:** esta vez las pruebas en seco **sí se ejecutaron**, con los
archivos exactos. Las de IVA de la ronda 3 (10 y 17) no se habían podido correr completas, y ahora sí están en verde.
Cómo se corrieron y qué dio cada una está en la sección 4.

---

## 1. IVA

### 1.1 IVA no descontable: inconsistencias y cuenta de cabecera (su punto IVA·1)

**Qué cambió**

- **El IVA no descontable de las líneas supera el IVA (o el total) del documento.** El documento queda **pendiente de
  corregir** y **no se publica el asiento**. Ya no se manda todo el IVA a la 2408.
  - Compra por líneas y documento soporte: el pendiente aparece en la bandeja de pendientes contables con el motivo.
  - Compra de cabecera: el pendiente se registra como «IVA no descontable por corregir».
- **Ya no hay cuenta única de cabecera cuando las líneas son de naturaleza distinta.** Si la compra no tiene cuenta propia
  por línea y lleva IVA no descontable, el documento queda pendiente de corregir en dos casos:
  - las líneas son de distinta naturaleza (bienes y servicios, o líneas sin tipo de operación);
  - hay servicios cuya cuenta de cabecera es de inventarios (14…).

  Se pide asignar la cuenta de cada línea. Con cuenta por línea, el IVA no descontable va a la cuenta de **cada línea**.
- **Lo que se conserva:** si todas las líneas son de la misma naturaleza y la cuenta de cabecera es la suya, el IVA no
  descontable sigue yendo a esa cuenta. Es su ejemplo de la ronda 3: $34.200 al costo y $27.800 descontables.

**Dónde:** `supabase/migrations/20261108152000_iva_no_descontable_al_costo.sql`, con su reversión.

**Prueba:**

| Prueba | Filas | Qué se comprueba |
|---|---|---|
| 18 | 42 a 46 | Cabecera inconsistente, bien con servicio, servicio hacia inventario y documento soporte inconsistente: los cuatro sin asiento y con el motivo. Control con solo bienes: D compra 219.000 · D 24081001 19.000 · C 238.000 |
| 17 | 23 | Su ejemplo de la ronda 3, sin cambios |

### 1.2 Devolución de compra (su punto IVA·2)

**Qué cambió**

- **Se documenta sobre el asiento que ya existe.** No se crea ninguna nota crédito interna adicional. Lo que se exige:
  - **Compra:** la nota crédito del proveedor. Un comprobante interno se rechaza.
  - **Documento soporte electrónico:** su nota de ajuste, como ya estaba.
- **Para no duplicar:**
  - la misma nota del proveedor no se puede registrar sobre dos asientos;
  - lo devuelto de una línea, sumando todos los registros, no puede superar su base ni su IVA.
- **En el formulario:** la base va a la casilla 56 y el impuesto recuperado a la 66, por separado. Esto ya funcionaba así.

**Dónde:** `20261108150500_iva_naturaleza_movimientos_y_declaraciones.sql`.

**Prueba:** 18, filas 5 a 9 y 50. La 50 muestra la base de 100.000 en la casilla 56 y los 19.000 en la 66.

### 1.3 Casilla 47: importación no gravada (su punto IVA·3)

**Qué cambió**

- **Cada línea de importación lleva un soporte aduanero estructurado, no un texto libre.** Son siete datos, y cada uno se
  valida por su forma:
  1. tipo de documento: declaración de importación, declaración simplificada, guía de tráfico postal o envío urgente, u otro documento aduanero;
  2. número;
  3. fecha;
  4. copia: la referencia al archivo adjunto;
  5. valor;
  6. fundamento de la exclusión;
  7. modalidad: ordinaria, temporal, tráfico postal o envío urgente, franquicia u otra.
- **A la casilla 47 solo llega** la línea de una compra que reúne las tres condiciones:
  - es una importación no gravada;
  - tiene los siete datos;
  - **no es de un servicio**.
- **Lo demás queda pendiente:**
  - si falta el soporte aduanero, «importación sin soporte aduanero»;
  - si es un servicio adquirido en el exterior, o viene en un documento soporte, «no va a la 47».
- **Los límites:**
  - El sistema comprueba que los datos estén y tengan forma válida. Si el documento es el que exige cada modalidad, eso lo
    juzga usted.
  - Por ahora el soporte aduanero se registra por la vía de datos. La pantalla de clasificación todavía no tiene los campos
    (ver la sección 3).

**Dónde:** `20261108150000_iva_clasificacion_por_linea.sql` (columna y validación) y `20261108151000_tributario_borrador_iva_300.sql`
(casilla 47).

**Prueba:** 18, filas 1 a 4 (validaciones) y 47 a 49. La casilla 47 suma 300.000, que es solo la importación con soporte
completo.

### 1.4 Operación inexistente: expediente y decisión (su punto IVA·4)

**Expediente.** La corrección de error se registra sobre la reversa. Además del soporte que acredita el error, guarda:

- **Explicación del error.**
- **Factura** de referencia.
- **Estado electrónico**, con cinco opciones:
  - validada por la DIAN;
  - rechazada en la **validación** de la DIAN;
  - **rechazo comercial** del comprador;
  - nunca transmitida;
  - expedida en contingencia.

  El rechazo comercial y el rechazo de validación son opciones distintas. Un rechazo comercial registrado como «anulación
  ante la DIAN» se rechaza.
- **«Nunca transmitida» exige verificar la contingencia**, con su nota: no la descarta por sí sola.
- **Entrega o prestación**, con su soporte.
- **Cobro**, con su soporte.
- **Nota crédito electrónica** cuando el documento era válido (validado, rechazo solo comercial o contingencia).
- **Resolución del documento electrónico:** tipo, referencia y fecha.
- **Si corresponde corregir una declaración anterior.**

El sistema informa qué le falta al expediente. Se puede guardar a medias.

**Completar el expediente no retira la venta.** Hace falta una **decisión explícita** de tratamiento fiscal y período, con
su fundamento:

| Decisión | Efecto | Se impide si… |
|---|---|---|
| Retirar la venta | La venta sale de las casillas **del período de la venta** y la reversa no afecta el suyo | hay nota crédito (no se descuenta una nota y además se elimina la venta) · el documento era válido · hubo entrega · hubo un cobro sin devolver · «nunca transmitida» sin descartar la contingencia · el período no contiene la venta |
| Nota crédito | La venta se queda en sus casillas. La reversa contable queda pendiente porque no sustituye la nota | falta la nota crédito electrónica en el expediente, o su fecha está fuera del período |
| Mantener la venta | La operación existió: la venta se queda y la reversa queda pendiente | — |

**Los períodos no se neutralizan como uno solo:**

- El período decidido tiene que ser un período fiscal del IVA: un bimestre, un cuatrimestre o el año, sin cruzar de un año
  a otro. Si no, se rechaza.
- Si el período de la venta ya se declaró:
  - el período decidido debe ser **exactamente** el declarado;
  - se exige marcar la corrección de esa declaración.
- Cuando la venta y su reversa son de períodos distintos, cada una se ubica en el suyo. En la prueba, la venta de octubre
  sale de septiembre–octubre y la reversa de noviembre no resta nada en noviembre.
- Si se vuelve a guardar el expediente, la decisión se borra y hay que decidir otra vez.

**Dónde:** `20261108150500_…` (expediente, faltantes y decisión) y `20261108151000_…` (efecto en el borrador).

**Prueba:**

- 18, filas 10 a 40 y 51 a 62:
  - con el expediente completo y sin decisión, la venta sigue en la 59;
  - con la decisión, sale;
  - venta de octubre y reversa de noviembre en su bimestre declarado.
- 10, POS5: ahora lleva el expediente completo y la decisión. Las cifras no cambian.

**Su puente:** $147.500 − $380.315 − $157.850 − $30.000 = −$420.665. Se vuelve a obtener exacto en la prueba 10, con
diferencia 0.

### 1.5 Dos límites que usted mantiene (su punto IVA·4, final)

**Tarifa inferida en el POS**

- Cuando la caja guarda el IVA con tarifa 0 y la tarifa se deduce porque el IVA coincide con **una** tarifa configurada,
  la línea queda con el origen **«inferida»**, no «sugerida».
- En el borrador lleva la señal «tarifa inferida» y una alerta que cuenta esas líneas, con su base y su IVA.
- No se saca de su casilla: se marca como no probada.

**Prueba:** 18, filas 63 y 64.

**«Cierre» no se excluye solo**

- El asiento de cierre de ejercicio ya no pasa automáticamente a «no afecta». Aparece como «sugerido: cierre · por
  confirmar» y queda pendiente.
- Para excluirlo hay que registrarlo con soporte y con una **explicación** de por qué ese movimiento de la 2408 no es un
  ajuste fiscal.

**Prueba:** 18, filas 20, 21, 41, 65 y 66.

---

## 2. Perfil y documentos históricos

### 2.1 Catálogo del RUT (su punto 1)

- **El catálogo ya no se declara exhaustivo.** Cada código dice de dónde sale:
  - **instructivo:** los 48 del IN-CAC-0237 v3;
  - **norma;**
  - **histórico.**
- **Código 67 (CARF):** se agrega con fuente «Resolución DIAN 000227 de 2025, artículo 1.6.11.5», pendiente de validación.
  El nombre se cotejará con el texto de la norma.
- **Un código del RUT que el catálogo no tenga ya no se rechaza.** Se guarda y la vigencia queda «para aclaración».
- **11 y 12 quedan como histórico:** solo evidencia, no son responsabilidades actuales. Si aparecen en un RUT, la vigencia
  queda para aclaración. Ningún documento cambia.

**Prueba:** 19, filas 1 a 4, 8 a 10, 17 y 18; 13, fila 1.

### 2.2 Códigos de factura electrónica (su punto 2)

- **Cotejados con la tabla 13.2.6.1 del anexo 1.9:** O-13, O-15, O-23, O-47 y R-99-PN.
- **R-99-PN se llama «No aplica – Otros».** Se cambió también su descripción visible, que decía «No responsable (persona
  natural)». El código que se envía no cambia.
- **O-48 y O-49 no pertenecen a la tabla.** Siguen sin poder usarse como códigos de factura electrónica en el perfil.

**Prueba:** 19, filas 5 a 7; 13, fila 3.

### 2.3 SIMPLE y autorretención (su punto 3)

- **La autorretención de renta sigue bloqueada en el SIMPLE**, tanto la ordinaria (15) como la especial (59), cada una en
  su campo.
- **15 y 59 no se tratan como equivalentes.** Por ejemplo, un ordinario con solo la autorretención especial no se vuelve
  autorretenedor ordinario.
- **Un RUT del SIMPLE con 15 o 59** se guarda «para aclaración»: no se borra el código y no se obliga a marcar una
  autorretención.
- Las operaciones por mandato no entran en esta regla y se examinan aparte.

**Prueba:** 19, filas 11 a 16 y 19 a 21.

### 2.4 Gran contribuyente (su punto 4)

- **El perfil pide la calificación (ordinaria o excepcional) y la fecha del acto.**
  - **Ordinaria:** efectos desde el 1 de enero siguiente a la resolución, con el primer bimestre enero–febrero.
  - **Excepcional:** desde la fecha expresa del acto, nunca antes.
- **Bloqueos:**
  - una vigencia de gran contribuyente que empiece antes de los efectos;
  - ya exigible la bimestral, declarar **cuatrimestral**. Antes era una advertencia; ahora es un bloqueo.
- **Transición:** una calificación excepcional con efectos a mitad de un bimestre deja la vigencia «para aclaración».
  - La vigencia anterior termina el día antes, sin solapes.
  - El período se resuelve con una decisión sustentada; el sistema no inventa cortes.
- **SIMPLE anual:** no se bloquea la periodicidad anual del SIMPLE, para no deducir incompatibilidades automáticas (ronda 2).

**Prueba:** 19, filas 22 a 31; 13, filas 8, 11 y 24.

### 2.5 Cooperativas del RTE (su punto 5)

- **Para la cooperativa, la actualización del registro web es obligatoria.** Ya no aparece como «confirme si aplica».
  Muestra:
  - los formatos 5245, 2530 y 2531;
  - el 2532 cuando corresponda, con las adaptaciones de cooperativas;
  - la nota de que no se le exige la información de asignaciones permanentes propia de las ESAL.
- **La memoria económica** se muestra «en PDF firmado, según corresponda; no es un formato numerado» cuando los ingresos del
  año anterior superan 160.000 UVT. Si no se conoce el dato, queda «por confirmar».

**Dónde:** `src/lib/finanzas/tributario/obligaciones.ts` (lista de obligaciones del Centro tributario), con sus textos en
cuatro idiomas.

**Prueba:** pruebas unitarias de `combinaciones.test.ts`.

### 2.6 Motivos de cambio de periodicidad (su punto 6)

- **Ningún motivo autoriza el cambio.** Se agregaron «corrección de clasificación» y «acto especial» solo como
  descripción. Todos exigen hecho, norma y fecha.
- **«Documentado» no es «procedente».**
  - La procedencia es un dato aparte: por evaluar, procedente o no procedente.
  - La registra una persona con fundamento y queda constancia de quién y cuándo.
  - Mientras no conste «procedente», el Centro tributario sigue marcando el cambio como pendiente.
  - Si se cambian el hecho, la norma, la fecha o la periodicidad, la evaluación vuelve a «por evaluar».

**Prueba:** 19, filas 32 a 41; prueba unitaria «documentado no es procedente».

### 2.7 Reimpresiones sin instantánea (su punto 7)

**Conteo, verificado hoy con SELECT**

| Documento | Cantidad |
|---|---|
| Facturas de venta expedidas | 210 (158 hasta el 7 de noviembre; las 153 que se informaron eran las de ese momento) |
| Recibos de pago | 210 |
| Envíos electrónicos aceptados | 0 |

Ninguno de esos documentos tiene instantánea, porque la tabla de instantáneas todavía no existe en la base. Todo documento
que se expida hasta aplicar la migración quedará en la misma situación.

**Qué cambió en el PDF.** Una reimpresión reconstruida se puede consultar, con bandas visibles y precisas:

1. «Reimpresión reconstruida: **NO es una copia idéntica** del documento expedido… el documento válido es el original
   expedido (XML y representación aceptados).»
2. Emisor reconstruido: el nombre, el NIT, la dirección y el contacto salen de la ficha actual de la empresa; las
   responsabilidades, de la vigencia del perfil en la fecha del documento.
3. Receptor reconstruido: los datos salen de la ficha actual del cliente o del proveedor, que pudo cambiar. Esta banda
   solo aparece cuando aplica: un recibo de pago no tiene receptor.
4. Líneas, impuestos y totales: son los guardados en el documento. **No se recalculan** con tarifas ni datos actuales.

Con instantánea, o con el envío aceptado que trae los dos datos, no aparece ninguna banda. Los originales no se tocan.

**Dónde:** `src/lib/documents/server/instantanea.ts` y `base.ts`; los textos en `messages/*` (es, en, fr, pt).

**Prueba:** pruebas unitarias de `instantanea.test.ts` (7 de 7).

**Siguen pendientes, como usted indicó:**

- las tirillas del POS;
- la correspondencia del emisor registrado en Factus.

---

## 3. Lo que NO se hizo y queda pendiente

- **No se aplicó ninguna migración.** Tampoco se reclasificó nada histórico, no se presentó ninguna declaración y no se
  hizo ningún pago.
- **Pantallas pendientes.** La base ya valida y guarda estos datos, pero la pantalla todavía no los pide:
  - el soporte aduanero de la casilla 47;
  - el expediente completo y la decisión de la corrección de error;
  - el registro de la procedencia de un cambio de periodicidad.

  Hoy esos datos solo se registran por la vía de datos. Además, si alguien vuelve a guardar una corrección de error desde
  la pantalla actual, se borran los campos del expediente que la pantalla no envía, y la decisión con ellos. Eso **nunca
  saca una venta de las casillas**: el efecto es el contrario, la venta se queda.
- **Lo que sí ya se puede hacer desde la pantalla:** registrar el cierre, que ahora pide la explicación, y elegir el cierre
  como naturaleza.
- **Nota crédito parcial sobre una factura de varias tarifas (efecto de la ronda 2, regla A2).** Aunque la emita la
  aplicación con sus líneas, queda pendiente hasta reintentarla desde la bandeja. Su asiento se arma al crear la cabecera,
  antes de las líneas. La prueba 07 lo muestra (fila «ncp»).
- **Operaciones por mandato en el SIMPLE:** solo se dejan fuera de la regla. No se modelaron.
- **Nombre exacto del código 67:** pendiente de cotejar con el texto de la Resolución 227.

## 4. Evidencia: pruebas en seco con los archivos exactos

**Cómo se corrieron:**

1. Cada archivo (migración y prueba) se subió completo a la base por trozos, comprobando el md5 de cada trozo y del archivo
   entero contra el disco.
2. Las migraciones se pegaron **completas y en orden de prefijo** en el marcador de cada prueba.
3. Todo corrió en una sola transacción, que terminó en rollback.
4. Al final se borraron los objetos de apoyo y se comprobó que la base no quedó con ninguna tabla, función, perfil ni
   documento de las pruebas.
5. Organización de pruebas: 374.

Las migraciones de consignación (120500 y 121000) no se cargaron porque estas no dependen de ellas.

| Prueba | Migraciones (md5) | Resultado |
|---|---|---|
| 07 · subcuenta de IVA por tarifa | 140000 `47486ffa…` | **31 de 31**. Tres esperados de la ronda 1 se actualizaron a las reglas A1 y A2 de la ronda 2 |
| 08 · responsabilidades por vigencia | 140500 `4b00bf10…` | **12 de 12** |
| 10 · clasificación y formulario 300 | 150000 `096608e6…` · 150500 `e9be46c5…` · 151000 `d455eb50…` | **76 de 76** |
| 12 · tarifa no identificada | 140000 | **20 de 20** |
| 13 · perfil, decisiones e instantáneas | 140500 · 160000 `85fd1732…` · 160500 `c83b8a50…` · 161000 `a289e35a…` · 161500 `5ea92082…` | **44 de 44** |
| 17 · IVA no descontable al costo | 140000 · 150000 · 152000 `6493828a…` | **23 de 23** |
| 18 · IVA, ronda 4 (nueva) | 140000 · 150000 · 150500 · 151000 · 152000 | **75 de 75** |
| 19 · perfil, ronda 4 (nueva) | 140500 · 160000 · 160500 · 161000 · 161500 · 165000 `28e47f63…` | **46 de 46** |

**Fallas de las primeras corridas, todas de las pruebas y no de las migraciones:**

- En la 18 y la 19, una fila leía en la misma sentencia lo que acababa de guardar. Se separó en dos sentencias.
- En la 07, los tres esperados de la ronda 1 ya mencionados.

Los md5 completos y el detalle de cada fila están en cada archivo `.resultado.txt`.

## 5. Preguntas para su criterio

1. **Casilla 47.** ¿Le sirven los cuatro tipos de documento y las cinco modalidades? ¿Qué documento exige para cada
   modalidad?
2. **«Nunca transmitida».** ¿Qué soporte considera suficiente para descartar una expedición válida en contingencia?
3. **Decisión «retirar la venta».** Hoy exige el período de la venta y, si ese período ya se declaró, marcar la corrección
   de esa declaración. ¿Falta alguna condición? ¿El cobro devuelto basta, o pide su soporte específico?
4. **Cierre.** ¿Basta el soporte con la explicación, o prefiere que un cierre que mueva la 2408 quede siempre pendiente?
5. **Cuenta de cabecera.** ¿Basta el criterio de distinta naturaleza (bienes y servicios, o servicios hacia inventarios), o
   hay otros casos en que deba exigirse la cuenta por línea?
6. **Gran contribuyente excepcional a mitad de bimestre.** ¿Qué debe decir la decisión del período de transición?
7. **Cooperativas.** ¿En qué casos corresponde el formato 2532?
8. **Reimpresiones.** ¿Son suficientes los textos de las bandas? ¿Quiere añadir la fecha de la reconstrucción?
