# IVA y perfil tributario · Ronda 6 (2026-11-10)

Responde a `RESPUESTAS-CONTADOR-RONDA-6-2026-11-10.md`: el **hallazgo del reparto de la base** y las respuestas **1 a 8**.
Las respuestas 9 a 13, de anticipos y consignación, las atiende otra nota.

**Estado:** todo está escrito y **SIN aplicar** en la base. No se reclasificó ningún histórico, no se presentó ninguna
declaración y no se hizo ningún pago. Cada cambio queda en su migración, que sigue sin aplicar, y en su reversión. Como
usted indicó, **nada de esto debe usarse para declarar** mientras las pantallas no pidan los datos nuevos (sección 10).

**Evidencia:** las pruebas en seco se corrieron con los archivos exactos, como en la ronda 5. Las diez pruebas anteriores
siguen en verde y hay dos nuevas, la 27 y la 28. Los `.resultado.txt` de todas van en `docs/contador/pruebas/` y hay que
enviárselos junto con esta nota (sección 12).

---

## 0. Hallazgo: el reparto de la base en el asiento por líneas

**Qué pidió.** El asiento de compra por líneas repartía la base entre las cuentas según el total con IVA de cada línea.
En la prueba 23 (fila 103 de la ronda 5), la línea del 5 % recibía 90.909 y no 100.000. El reparto correcto es 100.000,
215.200 y 119.000.

**Dónde estaba el error.** Lo verificamos en la base, leyendo la definición aplicada de la función:

- Es `fn_armar_asiento_documento`, aplicada desde las migraciones `20261022020351` y `20261023043016`, anteriores a las
  rondas con usted. Su definición actual mide 14.792 caracteres y su md5 es `a4e14cbc23142d9f46c25145faa49642`.
- Reparte la parte del documento que no es impuesto entre las cuentas de las líneas en proporción a `total_line`, que es
  el total CON IVA de la línea.
- Arma el asiento por líneas de compras, documentos soporte, ventas y notas con cuenta propia por línea. El error, por
  eso, no era solo de compras.

**Qué cambió.** Como la función ya está aplicada, la corrección va en una **migración nueva**,
`20261110150000_asiento_por_lineas_reparto_por_base.sql`, marcada «ESCRITA, NO APLICADA».

- Cambia una sola línea de la función: el peso de cada línea pasa a ser su **base antes de IVA**. La calcula
  `fn_asiento_peso_reparto_linea`, con la misma fórmula del recálculo de totales: cantidad × precio − descuento. Si el
  precio incluye el impuesto, se divide por (1 + tarifa).
- El impuesto de la línea solo entra en el peso cuando se queda en el neto del asiento:
  - si el documento no separa el impuesto (por ejemplo, una regla que no usa el impuesto del documento), el peso es
    base × (1 + tarifa), como antes;
  - en compras y documento soporte, el INC de la línea va al costo, así que pesa con su INC;
  - el IVA nunca pesa. Va a la 2408 o, con la migración `20261108152000`, a la cuenta de **su** línea.
- Funciona igual con las migraciones de IVA sin aplicar o sin ellas: el texto que cambia no lo tocan.
- **Reversión:** `20261110150000_asiento_por_lineas_reparto_por_base_rollback.sql` deshace el cambio y borra la función
  del peso. Si no se aplicó ninguna otra migración que modifique la función, la definición vuelve **byte a byte** a la de
  hoy (md5 `a4e14cbc…`). La prueba 27 lo comprueba aplicando la migración sola y su reversión.

**Redondeo: a qué línea va el ajuste de centavos.** El algoritmo de reparto no cambia.

- Cada línea, salvo la última, recibe su parte redondeada a centavos: neto × peso ÷ suma de pesos.
- La **última línea del documento**, en el orden del asiento (fecha de creación y luego identificador), recibe lo que
  falta.
- Así, la suma de las bases por cuenta es **exactamente** la base del documento.
- Al publicar el asiento, cada línea se lleva a pesos y la diferencia va a la línea de redondeo propia del asiento, como ya
  se hacía. Nunca se carga a otra cuenta.

**Asientos históricos con el reparto viejo: 0.** Contamos en la base, con SELECT:

| Origen | Asientos | Armados por líneas con más de una cuenta |
|---|---|---|
| Facturas de compra y documentos soporte | 0 | 0 |
| Facturas de venta y notas (`invoice_sales`) | 72 | 0 (todos son de cabecera) |

No hay pendientes contables ni redondeos pendientes armados con el reparto viejo. No hay nada que reclasificar y no se tocó
nada.

**Prueba:**

| Prueba | Filas | Qué se comprueba |
|---|---|---|
| 27 | 1 a 4 | La definición de hoy, la migración sola y su reversión: la definición vuelve con el mismo md5 |
| 27 | 129 a 131 | Su ejemplo: **14350101 D 100.000 · 513595 D 215.200 · 519525 D 119.000 · C 462.000**. La 2408 no cambia (22.800 + 5.000). Las cuentas menos el IVA no descontable suman la base, 400.000,00 |
| 27 | 132 a 134 | Tres líneas con el IVA incluido y una cabecera con 1 centavo más de IVA que sus líneas. Las cuentas suman exactamente 279.271,70. Las dos primeras llevan su parte redondeada y la última absorbe −0,01 |
| 27 | 135 y 136 | El peso con el impuesto dentro del neto y con INC |
| 23 | 105 y 106 | La fila del hallazgo ahora da el reparto correcto |
| 07 | 29 | El documento soporte de 100.000 al 5 % y 300.000 al 19 % pasa de 90.909 y 309.091 a 100.000 y 300.000. Solo se compara el cuadre, que no cambia |

**Prefijo.** El otro frente usa `20261110100000` para su migración de cartera. Para no repetir el prefijo, esta va en
`20261110150000`.

---

## 1. «Nunca transmitida» con soporte de falla (su respuesta 1, cambio obligatorio)

**Qué cambió**

- **La falla registra su inicio**, además del fin: columna nueva `contingencia_inicio_en`.
  - Sin el inicio, el expediente queda incompleto («contingencia»), porque no se sabe si la falla cubre la venta.
  - Una falla que empieza después de terminar se rechaza (`CONTINGENCIA_INVALIDA`).
- **Si el aviso de la DIAN, el aviso del proveedor tecnológico o el soporte de la falla del facturador cubre la fecha de
  la venta, la factura se tiene por expedida en contingencia:**
  - el expediente pide la **nota crédito electrónica**, igual que una factura válida;
  - retirarla como no expedida se rechaza: `DOCUMENTO_VALIDO_REQUIERE_NOTA_CREDITO`, detalle «expedida_en_contingencia»;
  - la decisión «nota crédito», en el período de la nota, sí procede.
  - La función `fn_iva_contingencia_cubre_venta` lo calcula.
- **«Cubre la fecha de la venta»** = el día de la venta está entre el día del inicio y el del fin de la falla, en la zona
  horaria de la organización. Se compara por día, no por hora (vea la pregunta 2).
- **Solo se retira como no expedida** con constancia de que no hubo contingencia, con lo revisado, **y** la consulta del
  CUFE/CUDE sin resultado. Hay dos formas:
  - «No hay soporte de contingencia», con la nota de lo revisado;
  - o una falla registrada que **no** cubre la venta, con la nota de lo revisado. Sin esa nota: `CONTINGENCIA_SIN_DESCARTAR`,
    detalle «constancia_sin_contingencia».
- La respuesta al guardar y el detalle del borrador dicen «tenida por expedida en contingencia» o «tratada como no
  expedida». La segunda ahora solo aparece con la contingencia descartada.

**Dónde:** `20261108150500_iva_naturaleza_movimientos_y_declaraciones.sql` (columna, `fn_iva_correccion_venta_en`,
`fn_iva_contingencia_cubre_venta`, faltantes, `fn_iva_contingencia_descartada` y la decisión) y
`20261108151000_tributario_borrador_iva_300.sql` (detalle de la corrección).

**Prueba:** 27, filas 23 a 51 y 94 a 102.

- W1: aviso de la DIAN de 8:00 a 12:00, venta a las 10:00.
  - Le falta la nota crédito.
  - Retirarla con la nota crédito se rechaza («expedida_en_contingencia»).
  - Por nota crédito: OK.
- W7: falla de 15:00 a 17:00 del día de la venta, que fue a las 9:00. W5: falla que empieza el día de la venta a las
  20:00. Las dos cubren la **fecha** de la venta.
- W6: falla que no cubre la venta y sin nota: «constancia_sin_contingencia».

En la prueba 23, Q3 (falla que terminó 1 hora después de la venta) ya no se retira: le falta la nota crédito y la venta
sigue en la 59 (filas 38, 41 y 84). Es el cambio que usted pidió.

## 2. Desde cuándo corren las 48 horas (su respuesta 2)

**Qué cambió**

| Situación | Desde cuándo vale la consulta del CUFE/CUDE |
|---|---|
| Falla registrada y venta anterior a su fin | 48 horas después del **fin de la falla** |
| Falla registrada y venta posterior a su fin | 48 horas después de la **venta** |
| **Sin falla registrada** | La regla no aplica: la consulta vale **desde la fecha y hora de la venta** |

- Antes de ese momento: `CONTINGENCIA_SIN_DESCARTAR`, detalle «plazo_48_horas».
- Sin falla y con la consulta anterior a la venta: detalle «consulta_antes_de_la_venta».
- En la ronda 5 también exigíamos 48 horas desde la venta cuando no había falla. Ya no.

**Dónde:** `20261108150500_…` (`fn_iva_contingencia_descartada` y la decisión).

**Prueba:** 27.

- W2: sin falla, consulta 1 hora después de la venta. Se retira (fila 44).
- W3: sin falla, consulta anterior a la venta. Se rechaza (fila 45).
- W4: falla del día anterior. Con la consulta a las 24 horas de la venta se rechaza; a las 49 horas, se retira (filas 46,
  48 y 49).
- W3, segunda parte: falla posterior a la venta. Las 48 horas corren desde el fin de la falla (fila 51).

En la prueba 18, PE ahora lleva una falla del día siguiente a la venta. Así sigue probando «contingencia sin descartar»:
sin falla, la consulta de 1 hora después de la venta ya valdría.

## 3. Firmeza (su respuesta 3)

**Qué cambió**

- Se mantiene el registro manual con su nota.
- La declaración devuelve, **como referencia que no decide**, el término general del art. 714 ET: tres años desde el
  vencimiento del plazo, o desde la presentación si fue extemporánea (`firmeza_referencia_714`).
- El texto dice que hay términos especiales y que la firmeza la registra una persona.
- Se muestra en tres lugares:
  - en la respuesta al registrar la declaración;
  - en la alerta «correcciones de una declaración anterior» del borrador;
  - en el texto de la pantalla actual, en cuatro idiomas: el motivo «declaración no corregible» y la línea de la alerta.

**Dónde:** `20261108150500_…` (respuesta de `fn_tributario_iva_declaracion_guardar`), `20261108151000_…` (alerta),
`src/lib/finanzas/tributario/formulario300.ts` (`firmezaReferencia714`, lectura de la alerta) y
`Formulario300Seccion.tsx`.

**Prueba:**

- 27, filas 75 a 77 y 115:
  - vence el 12-11-2026: referencia 2029-11-12;
  - extemporánea: cuenta desde la presentación;
  - la firmeza registrada no cambia.
- La prueba unitaria «firmeza: referencia del art. 714», incluido el 29 de febrero.

## 4. Art. 589: la solicitud ante la DIAN (su respuesta 4)

**Qué cambió.** La declaración registra la **solicitud de corrección presentada ante la DIAN**: número, fecha, resultado,
fecha del resultado y soporte (columnas `correccion_dian_*`).

- Se registra por la misma vía que la declaración, con la clave `correccion_dian`. Si la clave no viene, se conserva lo
  registrado; si viene en null, se quita.
- La fecha de la solicitud no puede ser anterior a la presentación ni futura. La del resultado no puede ser anterior a la
  solicitud: `CORRECCION_DIAN_FECHA_INVALIDA`.

**Qué resultado permite retirar la venta, y por qué.** Retirar una venta de un período declarado disminuye el impuesto de
esa declaración. Solo procede cuando la disminución ya produjo efecto:

| Resultado | ¿Permite retirar la venta? | Por qué |
|---|---|---|
| Sin registro | No: `CORRECCION_DIAN_SIN_REGISTRO` | No basta marcar la corrección en el sistema |
| En trámite | No: `CORRECCION_DIAN_SIN_RESULTADO` | La disminución todavía no produce efecto |
| Rechazada | No: `CORRECCION_DIAN_RECHAZADA` | La declaración inicial sigue vigente |
| **Aceptada** | **Sí** | La DIAN practicó la liquidación oficial de corrección |
| **Vencido el término** | **Sí** | La DIAN no se pronunció en los seis meses siguientes a la solicitud y el proyecto de corrección sustituyó la declaración inicial (art. 589 ET). Se exige que el resultado se registre al menos seis meses después de la solicitud (`CORRECCION_DIAN_TERMINO_NO_VENCIDO`) |

- **El término de un año del art. 589** se mide con la fecha de la solicitud cuando está registrada. Antes se medía con la
  de hoy. Una solicitud presentada a tiempo no se vuelve extemporánea porque la respuesta llegue después.
- **Se revisa también al calcular el borrador.** Si después del retiro se registra que la DIAN rechazó la corrección:
  - la venta vuelve a sus casillas;
  - la reversa queda pendiente («correccion_dian_sin_efecto»);
  - la alerta muestra la solicitud y su resultado.
- Sigue igual lo de la ronda 5: vencimiento, firmeza y la marca «corrige la declaración».

**Dónde:** `20261108150500_…` (columnas, validación y decisión) y `20261108151000_…` (borrador y alerta); en el código,
`validarDeclaracion` y `SolicitudDeclaracion`.

**Prueba:**

- 27, filas 59 a 74 y 110 a 116:
  - sin registro, inválida, fecha inválida, en trámite, rechazada, aceptada;
  - «vencido el término» antes de seis meses (rechazo) y después (retiro);
  - el rechazo posterior devuelve la venta a la 59.
- 23, fila 60, y 18: los retiros de R1 y PO llevan ahora la solicitud aceptada (datos de prueba).

## 5. Cuenta por línea (su respuesta 5)

**Qué cambió.** **Toda compra con IVA no descontable y más de una línea exige cuenta por línea.**

- **Asiento de cabecera:** con más de una línea ya no se acepta ninguna cuenta única. Tampoco la 15… de un activo fijo.
  El documento queda pendiente de corregir («IVA no descontable en una compra de más de una línea…»).
  - Los motivos de las rondas 4 y 5 para varias líneas (activos, costos o gastos distintos, tratamientos o deducibilidad
    distintos) quedaron absorbidos por esta regla. La función se simplificó.
  - La compra de **una** línea sigue como en la ronda 5.
- **Asiento por líneas:** si el IVA no descontable es mayor que cero, hay más de una línea y alguna cae en la cuenta de la
  regla por no tener cuenta propia, el asiento no se publica: pendiente «cuenta_linea», «cada línea debe tener su propia
  cuenta». Antes bastaba con que una línea tuviera cuenta.

**Efecto en las pruebas, y por qué cambian sus esperados:**

| Prueba | Fila | Cambio |
|---|---|---|
| 17 | 8 | FCH (tres líneas, cabecera) sigue sin asiento. El motivo pasa de «deducibilidad distinta» a «más de una línea» |
| 18 | 46 y 49 | FCM y FCB, igual: ahora «más de una línea» |
| 23 | 97 a 99 | FTR, FDX y FDD, igual. FDD (dos bienes no descontables) **deja de ser el control positivo** de la cuenta de cabecera: queda sin asiento |
| 23 | 102 | La función de la cuenta única da «más de una línea» para FDD también con la cabecera 152405 |
| 27 | 124 a 128 | Una sola línea con cabecera se contabiliza (el IVA al costo). Dos líneas con cabecera quedan pendientes. Tres líneas con una sin cuenta propia: «cuenta_linea» |

Su ejemplo de la ronda 3 con cuenta por línea no cambia en lo que usted validó. Sí cambia la base de cada cuenta, por el
hallazgo de la sección 0.

**Dónde:** `20261108152000_iva_no_descontable_al_costo.sql` (`fn_iva_no_descontable_cuenta_unica_fallo` y el reemplazo en
`fn_armar_asiento_documento`) y su reversión.

## 6. Formato 2532 por año gravable (su respuesta 6)

**Qué cambió**

- Las dos columnas de la ronda 5 en el perfil **se quitaron** de la migración, que nunca se aplicó. El dato pasa a una
  tabla por **año gravable**, `tributario_rte_2532_anio`: una fila por organización y año. La escribe solo
  `fn_tributario_2532_registrar`.
  - «Recibió» → el 2532 aplica.
  - «No recibió» exige la constancia de lo verificado (`CONSTANCIA_2532_REQUERIDA`).
  - Sin fila → «por confirmar».
  - Registrar otra vez el mismo año reemplaza el dato; null lo quita.
- La función pide permiso de aprobar en Finanzas y comprueba la pertenencia a la organización. Lectura por RLS para los
  miembros. Sin anon ni public.
- Guardar la vigencia del perfil ya no lee ese dato: si llega la clave vieja, se ignora.
- **En el Centro tributario**, la actualización del registro web de la cooperativa usa el dato del **año gravable del
  periodo anual**. Con corte en octubre de 2026, es el año 2025. El dato de otro año no sirve.
  - Las notas dicen ahora «para este año gravable», en cuatro idiomas.

**Dónde:** `20261108160500_tributario_perfil_renta_iva.sql` (tabla, RLS y función) y su reversión;
`src/lib/finanzas/tributario/obligaciones.ts` (`Dato2532`, `leerFormato2532`, `nota2532`), `perfil.ts`, `combinaciones.ts` y
`src/lib/services/tributario/tributario.server.ts` (lee la tabla; sin la tabla, todo queda «por confirmar»).

**Prueba:**

- 28, 20 de 20: permisos, validaciones, una fila por año, quitar, RLS, la vigencia ya no lo lee, restricción de la tabla,
  privilegios.
- 24, filas 22 a 29: lo mismo que la ronda 5 sobre la tabla por año.
- Las pruebas unitarias «formato 2532… por año gravable», incluido que el dato de otro año no sirve.

## 7. Importación exenta (su respuesta 7)

**Cómo están numeradas las casillas en el código.** Lo verificamos antes de cambiar nada:

| Casilla | Concepto en el código |
|---|---|
| 47 | `importaciones_no_gravadas` |
| 54 | `compras_no_gravadas` (compras nacionales) |
| 48 | No existía |

Coincide con su cita. Se agrega la **48**, `importaciones_zona_franca_no_gravadas`, al catálogo del borrador, a
`CASILLAS_300` y a `FILAS_300`.

**Qué cambió**

- **Exenta de zona franca → casilla 48. Exenta sin zona franca → 47.** Nunca a la 54: la importación siempre va a la 47 o
  a la 48.
- La exenta lleva **el mismo soporte aduanero** que la excluida (documento según la modalidad, número, fecha, copia, valor
  en aduana, aranceles, explicación del otro documento) y además:
  - **el artículo de la exención** (`norma_exencion`, debe citar un artículo, por ejemplo «ET art. 477»;
    `SOPORTE_ADUANERO_NORMA_INVALIDA`);
  - **si viene de zona franca** (`zona_franca`, sí o no).
- La exenta no pide la norma ni el fundamento de la exclusión. Sin lo suyo queda pendiente
  «importacion_sin_soporte_aduanero». La función `fn_iva_soporte_aduanero_faltantes` recibe ahora el tratamiento.
- La no sujeta sigue pendiente («importacion_no_excluida_no_va_47»).
- La **excluida** que viene de zona franca queda pendiente «importacion_zona_franca_excluida_por_confirmar» (vea la
  pregunta 1).

**Dónde:** `20261108150000_iva_clasificacion_por_linea.sql` (faltantes y validación) y `20261108151000_…` (casillas 47 y
48, motivos y catálogo).

**Prueba:**

- 27, filas 5 a 13 y 117 a 123:
  - la 48 suma 100.000;
  - la 47 suma 70.000 (exenta sin zona franca 60.000 + excluida 10.000);
  - la exenta sin el dato de zona franca y la excluida de zona franca quedan pendientes;
  - ninguna importación va a la 54.
- 23, fila 80: la importación exenta de la ronda 5, sin el artículo ni la zona franca, queda pendiente por falta de soporte.

## 8. Segundo usuario (su respuesta 8)

**Qué cambió.** La aprobación de otra persona ya no es solo del cierre. La exige **toda naturaleza que mueve la 2408 y se
propone «no afecta»**:

- pago a la DIAN;
- traslado entre auxiliares;
- cierre;
- la **corrección de error con la decisión «retirar_venta»**, porque su reversa y la venta salen de las casillas.

**Reglas:**

- Quien aprueba no es quien registró ni, en la corrección, quien decidió (`APROBACION_MISMO_USUARIO`).
- Las demás naturalezas: `APROBACION_NO_REQUERIDA`. Antes el código era `APROBACION_SOLO_CIERRE`. Esto incluye la
  devolución de compra, el ajuste, la corrección sin decisión de retiro y la nota crédito.
- Volver a guardar el registro, decidir otra vez o quitar la decisión borra la aprobación.
- Sin la aprobación:
  - el pago y el traslado quedan pendientes «no_afecta_sin_aprobacion»;
  - el cierre, «cierre_sin_aprobacion»;
  - el retiro, «correccion_sin_aprobacion». La venta no sale.

**Dónde:** `20261108150500_…` (`fn_iva_naturaleza_asiento_aprobar`, guardar y decidir) y `20261108151000_…` (borrador).

**Prueba:**

- 27, filas 52 a 58, 78 a 92 y 103 a 109: propio, no requerida, quien decidió, decidir otra vez borra, aprobado, anon.
- Datos nuevos en las pruebas 10, 18 y 23: el segundo usuario aprueba los pagos y retiros que ya estaban en ellas. Sus
  cifras no cambian.

**Corrección hecha durante las pruebas.** En la primera corrida de la 27, el segundo usuario pudo aprobar una corrección
sin decisión (fila 83). La condición daba NULL con la decisión vacía y no rechazaba. Se corrigió en la migración antes de
correr las demás pruebas.

---

## 9. Textos y código

- **Namespace nuevo `finanzasTributarioR6`** en `messages/{es,en,fr,pt}.json`:
  - motivos nuevos;
  - errores nuevos;
  - el concepto de la casilla 48;
  - las notas del 2532 por año;
  - la referencia del art. 714.
  - Se insertó como un bloque, sin reescribir el resto del archivo. Una prueba unitaria comprueba que esté completo en los
    cuatro idiomas.
- `Formulario300Seccion.tsx` y `CentroTributarioPage.tsx` buscan primero en la ronda 6, luego en la 5 y luego en el
  namespace de siempre. No hay pantallas nuevas: solo textos.
- `formulario300.ts`:
  - lee la casilla 48, los motivos nuevos, la aprobación, el detalle de la corrección y la alerta con la solicitud ante la
    DIAN;
  - valida el inicio de la falla y la solicitud de corrección.

## 10. Lo que NO se hizo y queda pendiente

- **No se aplicó ninguna migración**, no se reclasificó nada histórico, no se declaró ni se pagó.
- **Las pantallas no piden aún los datos nuevos.** Van primero a Figma. Faltan:
  - el inicio de la falla;
  - la solicitud de corrección ante la DIAN;
  - el artículo de la exención y la zona franca;
  - el 2532 por año;
  - la aprobación del segundo usuario para el pago, el traslado y el retiro;
  - y lo pendiente de la ronda 5.

  Hoy se registran por la vía de datos. No hay ruta para aprobar ni para el 2532 por año: las funciones de la base están
  listas.
- **Se mantiene el aviso de la ronda 5:** si alguien vuelve a guardar una corrección de error desde la pantalla actual,
  se borran los campos que esa pantalla no envía, y con ellos la decisión y la aprobación. Eso nunca saca una venta de las
  casillas.
- **El camino de la nota crédito con líneas explícitas** (la nota crédito parcial que se arma con líneas que no traen
  cantidad ni precio) sigue repartiendo por su total. No tiene base propia que leer. Es el pendiente de la nota crédito
  parcial sobre una factura de varias tarifas.
- **Firmeza y vencimiento:** el sistema sigue sin calcularlos. La referencia del art. 714 no decide.

## 11. Preguntas nuevas para su criterio

1. **Importación excluida que viene de zona franca.** Su respuesta ubica en la 48 la **exenta** de zona franca. ¿La
   excluida de zona franca va también a la 48, o a la 47? Hoy queda pendiente.
2. **«Cubre la fecha de la venta».** Lo tomamos por día calendario, en la zona horaria de la organización. Una falla de
   15:00 a 17:00 cubre una venta de las 9:00 del mismo día. ¿Es su lectura, o debe ser por hora?
3. **Falla registrada que no cubre la venta.** Para retirarla como no expedida pedimos, además de la consulta, la nota de
   lo revisado como constancia de que no hubo contingencia para esa venta. ¿Basta esa nota?
4. **«Vencido el término» del art. 589.** Lo exigimos registrado al menos seis meses después de la solicitud y lo tratamos
   como corrección con efecto, igual que «aceptada». ¿Es correcto?
5. **Segundo usuario en la corrección de error.** Lo pedimos para el retiro de la venta, porque se propone «no afecta», y
   quien decidió tampoco aprueba. ¿De acuerdo?
6. **INC en el reparto de la base.** En compras, la línea con INC pesa con su INC, porque el INC va al costo. ¿De acuerdo?

## 12. Evidencia: pruebas en seco con los archivos exactos

**Cómo se corrieron:**

1. Cada archivo, migraciones y pruebas, se subió completo a la base por trozos. Cada trozo midió como máximo 24 KB y se
   cortó en un fin de línea. El md5 de cada trozo y del archivo entero se comprobó contra el disco.
2. Las migraciones se pegaron **completas y en orden de prefijo** en el marcador de cada prueba. La 13 tiene un marcador
   por migración.
3. La prueba 27, además, pega antes la migración del reparto sola y su reversión.
4. Todo corrió en una sola transacción que terminó en excepción, es decir, en rollback, con la zona `America/Bogota`.
5. La corrección de `20261108150500` durante las pruebas se aplicó al objeto ya subido, y su md5 completo se comprobó
   contra el disco antes de volver a correr.
6. Al final se borraron los objetos grandes y se comprobó que la base no quedó con ninguna tabla, función, columna,
   proveedor, producto, compra, venta, miembro, asiento ni cuenta de las pruebas. `fn_armar_asiento_documento` conserva su
   md5 aplicado.
7. Organización de pruebas: 374.

Las migraciones de anticipos y consignación no se cargaron: estas pruebas no dependen de ellas.

**Migraciones:**

| Migración | md5 | ¿Cambió en la ronda 6? |
|---|---|---|
| 20261108140000 | `47486ffab373921553fdcd99d2f56ad0` | No |
| 20261108140500 | `4b00bf10bf99ff2a97e2e89ff0480811` | No |
| 20261108150000 | `83e79e4ecaf01b8cbfa945cb207c1290` | Sí |
| 20261108150500 | `f05449117c12cf04af6812ff404a49f3` | Sí |
| 20261108151000 | `a91fa17e57a06af04c914dc45286d7d8` | Sí |
| 20261108152000 | `2922316e3deca529ebbc1d232e883e9d` | Sí |
| 20261108160000 | `85fd17321a7e85d85a58916cb2f84c95` | No |
| 20261108160500 | `a3e330a9cf7b01c6da242b7d3f3a2b8c` | Sí |
| 20261108161000 | `2153ce37f896697ed3c6b2e506d84db0` | No |
| 20261108161500 | `5ea9208264ed61f452be374617f55e60` | No |
| 20261108165000 | `1ec6641bdf74dfc15163d0753982309f` | No |
| **20261110150000** (nueva) | `f19d51b97cea4c56a57ae96279a49a7d` | Nueva |
| 20261110150000, reversión | `a9634f1def22e3be099f0f054f20a075` | Nueva |

**Pruebas:**

| Prueba (md5) | Migraciones | Resultado |
|---|---|---|
| 07 `cecaaf3c…` | 140000 · 20261110150000 | **31 de 31**. El documento soporte ya reparte por la base |
| 08 `36ca2b8e…` | 140500 | **12 de 12** |
| 10 `4dd29abd…` | 150000 · 150500 · 151000 | **76 de 76**. El segundo usuario aprueba el pago y el retiro; no cambia ningún esperado |
| 12 `ebe12150…` | 140000 | **20 de 20** |
| 13 `a6d16eeb…` | 140500 · 160000 · 160500 · 161000 · 161500 | **44 de 44** |
| 17 `1fb97ec4…` | 140000 · 150000 · 152000 · 20261110150000 | **22 de 22**. Cambia el motivo de FCH, por la respuesta 5 |
| 18 `ef281530…` | 140000 · 150000 · 150500 · 151000 · 152000 · 20261110150000 | **78 de 78** (+2 aprobaciones). Versión 7; FCM y FCB, «más de una línea» |
| 19 `e5e1a306…` | 140500 · 160000 · 160500 · 161000 · 161500 · 165000 | **46 de 46** |
| 23 `0e285ebe…` | 140000 · 150000 · 150500 · 151000 · 152000 · 20261110150000 | **108 de 108** (+3 aprobaciones). Q3, I7, cuenta por línea y reparto, por las respuestas 1, 5 y 7 y el hallazgo |
| 24 `0eff7da4…` | 140500 · 160000 · 160500 · 161000 · 161500 · 165000 | **40 de 40**. La sección C pasa al 2532 por año |
| **27** `e0472646…` (nueva) | 20261110150000 sola y su reversión; luego 140000 · 150000 · 150500 · 151000 · 152000 · 20261110150000 | **139 de 139** (segunda corrida; la primera, 138, encontró la falla de la sección 8) |
| **28** `9b125a67…` (nueva) | 140500 · 160000 · 160500 · 161000 · 161500 · 165000 | **20 de 20** |

El md5 completo, la fecha y el detalle de cada fila están en cada `.resultado.txt`. Las pruebas que se repiten llevan el bloque de la ronda 6 arriba y las corridas
anteriores debajo.

**Pruebas unitarias:**

- `src/lib/finanzas/tributario`, `src/lib/documents` y `src/lib/services/tributario`: 14 suites, 251 de 251.
- Sin errores de lint en los archivos tocados.
- `tsc --noEmit` del proyecto: 0 errores.
