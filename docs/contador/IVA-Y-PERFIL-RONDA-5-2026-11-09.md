# IVA y perfil tributario · Ronda 5 (2026-11-09)

Responde a `RESPUESTAS-CONTADOR-RONDA-5-2026-11-09.md`, respuestas 1 a 8, y a lo de «Aún sin confirmar» que toca el IVA
(el instructivo del 300 que cita el Decreto 390 de 2016). Las respuestas 9 a 13 y las cuatro citas corregidas, de
anticipos y consignación, las atiende otra nota.

**Estado:** todo está escrito y **SIN aplicar** en la base. No se reclasificó ningún histórico, no se presentó ninguna
declaración y no se hizo ningún pago. Cada cambio queda en su migración, que sigue sin aplicar, y en su reversión. Como
usted indicó, **nada de esto debe usarse para declarar** mientras las pantallas no pidan los datos nuevos (sección 5).

**Evidencia:** las pruebas en seco se corrieron con los archivos exactos, como en la ronda 4. Ocho pruebas anteriores
siguen en verde y hay dos nuevas, la 23 y la 24. Los `.resultado.txt` de todas van en `docs/contador/pruebas/`. Usted
anotó que en la ronda 4 no le llegaron adjuntos: esta vez **hay que enviárselos junto con esta nota** (sección 7).

---

## 1. IVA

### 1.1 Casilla 47: documento según la modalidad, norma, base (su respuesta 1)

**Qué cambió**

- **El documento depende de la modalidad** (Decreto 1165 de 2019, arts. 253 y 262):

  | Modalidad | Documento que se acepta |
  |---|---|
  | Importación ordinaria, temporal y franquicia | Declaración de importación |
  | Tráfico postal y envío urgente | La guía firmada, que es la declaración simplificada |
  | Otra modalidad | Cualquiera de los tres tipos; «otro documento aduanero» solo cabe aquí |

  - La ronda 4 tenía un tipo aparte, «guía de tráfico postal o envío urgente». Se quitó porque nombraba el mismo
    documento que la declaración simplificada.
  - Una combinación distinta se rechaza al guardar (`SOPORTE_ADUANERO_DOCUMENTO_NO_CORRESPONDE`). Si llega a la línea
    por otra vía, el borrador la deja pendiente: «importacion_documento_no_corresponde».
- **«Otro documento aduanero» exige una explicación** (20 a 1.000 caracteres). Sin ella, la línea no llega a la 47.
- **La norma de exclusión es un dato propio y obligatorio** (`norma_exclusion`), aparte del fundamento.
  - Tiene que citar un artículo, por ejemplo «ET art. 424 num. 1».
  - Un texto sin artículo se rechaza (`SOPORTE_ADUANERO_NORMA_INVALIDA`).
- **Base = valor en aduana + aranceles.**
  - Se guardan los dos componentes, `valor_aduana` y `aranceles`.
  - Si además viene el valor, tiene que ser su suma (`SOPORTE_ADUANERO_BASE_NO_SUMA`).
  - El borrador compara la base de la línea con esa suma (± $1). Si no coinciden: «importacion_base_no_coincide».
- **La 47 es solo para la importación EXCLUIDA.** Una importación exenta o no sujeta queda pendiente:
  «importacion_no_excluida_no_va_47».
- **Lo que no cambió:** un servicio adquirido en el exterior no va a la 47, y lo que falte del soporte deja la línea
  pendiente («importacion_sin_soporte_aduanero»).
- Una función nueva, `fn_iva_soporte_aduanero_faltantes`, dice qué le falta a cada soporte.

**Dónde:** `20261108150000_iva_clasificacion_por_linea.sql` (validación y faltantes) y `20261108151000_tributario_borrador_iva_300.sql` (casilla 47 y motivos).

**Prueba:**

| Prueba | Filas | Qué se comprueba |
|---|---|---|
| 23 | 1 a 8 | Validaciones: documento que no corresponde (tres casos), tipo viejo, norma sin artículo, base que no suma, aranceles negativos, faltantes |
| 23 | 73 a 78 | La 47 suma 370.000 (ordinaria 300.000 + guía firmada 50.000 + otro documento con explicación 20.000). Quedan pendientes la base que no coincide, la que no tiene norma, el otro documento sin explicación, la importación exenta y el documento que no corresponde |
| 18 | 48 a 50 | El caso de la ronda 4 con sus datos completados: la 47 sigue en 300.000 |

### 1.2 «Nunca transmitida»: contingencia, CUFE/CUDE y 48 horas (su respuesta 2)

**Qué cambió**

- **La marca «contingencia verificada» ya no basta.** La columna se conserva, pero no cuenta. El expediente pide:
  - **La consulta del CUFE/CUDE**, con resultado, fecha y hora (no futura) y soporte.
    - Si la consulta encuentra el documento, no es «nunca transmitida»: se rechaza (`DOCUMENTO_ENCONTRADO_EN_DIAN`).
  - **La verificación de la contingencia**, con una de dos cosas:
    - el aviso de la DIAN, el aviso del proveedor tecnológico o el soporte de la falla del facturador, con referencia,
      fecha y fin de la falla;
    - o la constancia de que no hay ninguno de esos soportes, con la nota de lo que se revisó.
- **Regla de las 48 horas** (Res. 227 de 2025, art. 1.5.1.5.7.1):
  - La contingencia solo se da por descartada si la consulta del CUFE/CUDE se hizo después de las 48 horas.
  - Se cuentan desde el fin de la falla o desde la venta, lo que sea posterior.
  - Antes de eso, retirar la venta se rechaza: `CONTINGENCIA_SIN_DESCARTAR`, con el detalle «plazo_48_horas».
- **Sin soporte de contingencia, la factura se trata como no expedida.** El expediente y el borrador lo informan
  («tratada como no expedida»).
- Sigue igual: completar el expediente no retira la venta. Hace falta la decisión.

**Cómo lo interpretamos (vea la pregunta 1).** Con el soporte de una falla y la consulta sin resultado pasadas las 48
horas, el sistema da la contingencia por descartada y permite retirar la venta. Sin ningún soporte, la trata como no
expedida y también lo permite. Su frase admite otra lectura: que con soporte de falla la factura se tenga por expedida en
contingencia y vaya por nota crédito. Si es así, se cambia una sola regla.

**Dónde:** `20261108150500_iva_naturaleza_movimientos_y_declaraciones.sql`: columnas del expediente, faltantes, `fn_iva_contingencia_descartada` y la decisión.

**Prueba:** 23, filas 28 a 45 y 79 a 84.

- Q1, con solo la marca: el expediente queda incompleto («contingencia, consulta_cufe»).
- Q2, con la consulta dentro de las 48 horas: se rechaza el retiro y la venta sigue en la 59.
- Q3, con soporte de la falla, y Q4, sin soporte («no expedida»): se retiran.

En las pruebas 10 y 18, los expedientes de la ronda 4 se completaron con estos datos y sus cifras no cambian.

### 1.3 Retirar la venta: corrección todavía posible, devolución del cobro, nota crédito (su respuesta 3)

**Qué cambió**

- **El período declarado registra el vencimiento y la firmeza.** Son dos datos nuevos de la declaración: la fecha de
  vencimiento del plazo para declarar y si está en firme, con una nota de dónde se sabe.
  - Los registra una persona. El sistema no tiene calendario ni calcula la firmeza, y no presume ninguna de las dos.
- **Al decidir retirar una venta de un período declarado:**

  | Situación | Resultado |
  |---|---|
  | Sin vencimiento registrado | `DECLARACION_SIN_VENCIMIENTO` |
  | Sin firmeza registrada | `FIRMEZA_SIN_DETERMINAR` |
  | En firme (art. 714 ET) | `DECLARACION_EN_FIRME` |
  | Pasado el año siguiente al vencimiento (art. 589 ET) | `CORRECCION_FUERA_DE_TERMINO` |
  | Sin marcar la corrección de esa declaración | `DEBE_CORREGIR_DECLARACION` (como en la ronda 4) |

- **Se vuelve a revisar al calcular, no solo al decidir.** Si después de decidir se registra que la declaración quedó
  en firme o venció el término:
  - la venta vuelve a sus casillas;
  - la reversa queda pendiente, «correccion_declaracion_no_corregible»;
  - la alerta de correcciones muestra el vencimiento y la firmeza.
- **Cobro devuelto:** exige el soporte de la devolución del dinero y su fecha. Sin ellos, el expediente está incompleto
  («devolucion_del_cobro»).
- **Venta válida:** la nota crédito baja el IVA en el bimestre de la nota (Oficio DIAN 902997 de 2021; art. 484 ET).
  - Verificamos la numeración en el código: base en la **42** e IVA en la **79**, como usted cita.
  - La decisión «nota crédito» exige que el período decidido contenga la fecha de la nota; si no, se rechaza.

**Dónde:** `20261108150500_…` (declaraciones, expediente y decisión) y `20261108151000_…` (revisión al calcular y alerta).

**Prueba:** 23, filas 46 a 63 y 85 a 90.

- Los cinco rechazos.
- Una venta de marzo de 2025 fuera de término.
- La venta de octubre que sale de su bimestre y vuelve cuando la declaración queda en firme.
- La nota crédito en su período.

### 1.4 Cierre: aprobación de un segundo usuario (su respuesta 4)

**Qué cambió**

- Además del soporte y la explicación, el cierre necesita la **aprobación de un segundo usuario**
  (`fn_iva_naturaleza_asiento_aprobar`).
  - Tiene que ser otra persona, distinta de quien lo registró, con permiso de aprobar en Finanzas.
  - Quien lo registró no puede aprobarlo (`APROBACION_MISMO_USUARIO`).
  - Solo el cierre se aprueba así (`APROBACION_SOLO_CIERRE` para las demás naturalezas).
- **Sin la aprobación, el cierre que mueve la 2408 queda pendiente** («cierre_sin_aprobacion»).
- **Volver a guardar el registro borra la aprobación:** hay que aprobarlo otra vez.

**Dónde:** `20261108150500_…` (columnas y función) y `20261108151000_…` (efecto en el borrador).

**Prueba:**

- 23, filas 64 a 71 y 91 a 93: registrado, propio, otra naturaleza, aprobado, borrado al volver a guardar y anon.
- 18, filas 42 y 67: el cierre de la ronda 4, ahora aprobado por el segundo usuario, sigue «no afecta».

### 1.5 Cuenta por línea: más casos (su respuesta 5)

**Qué cambió.** Con IVA no descontable y sin cuenta propia por línea, el documento queda pendiente de corregir, sin
asiento, también cuando las líneas mezclan:

- **Tratamientos de IVA distintos:** gravado, excluido, exento o sin clasificar.
- **IVA con deducibilidad distinta:** descontable, no descontable, o proporcional con otro porcentaje.
- **Activos fijos con gastos o inventarios.** El activo fijo se reconoce por la cuenta de cabecera 15…; se marca la
  mezcla cuando hay servicios o productos inventariables.
  - **Límite:** sin cuenta por línea, el sistema no tiene cómo saber que una línea suelta es de activo fijo. Vea la
    pregunta 5.

**Lo que esto cambia en lo ya visto:**

- **Su ejemplo de la ronda 3** (compra FCH: una línea no descontable, una proporcional y una descontable) tiene IVA de
  deducibilidad distinta.
  - Con cuenta de cabecera ya no se contabiliza: queda pendiente (prueba 17, filas 1 y 8).
  - Con cuenta por línea da lo mismo que usted validó: 2408 por 22.800 + 5.000, y el IVA no descontable a la cuenta de
    su línea (19.000 y 15.200; prueba 23, filas 101 y 102).
- **El control de la ronda 4** (FCB: una línea no descontable y otra descontable) queda pendiente por la misma razón
  (prueba 18, fila 47).
  - El control positivo de cuenta de cabecera pasa a la prueba 23, fila 96: dos bienes no descontables, D 238.000, sin
    2408.

**Dónde:** `20261108152000_iva_no_descontable_al_costo.sql`.

**Prueba:** 23, filas 94 a 103; 17; 18, fila 47.

**Hallazgo previo, no corregido aquí.** El asiento por líneas reparte la base del documento entre las cuentas según el
total con IVA de cada línea.

- Con tarifas distintas, la base de cada cuenta se desvía. En la prueba, la línea del 5 % recibe 90.909 y no 100.000.
- El total, la 2408 y el IVA no descontable de cada línea sí son correctos (prueba 23, fila 103).
- Es una función ya aplicada y anterior a esta ronda. Queda propuesta como tarea aparte.

---

## 2. Perfil y documentos

### 2.1 Gran contribuyente a mitad de bimestre (su respuesta 6)

La norma no regula el caso (Res. 227 de 2025, art. 1.1.4.3), así que la decisión deja escrito lo que se resolvió.

**Qué cambió.** Una decisión estructurada, `fn_tributario_transicion_gc_registrar`, exige todo lo que usted pidió:

- **La resolución, su fecha y la fecha de efectos.** Tienen que ser las del perfil de esa vigencia; si no, se rechaza.
- **Los períodos de IVA afectados.** Cada uno es un bimestre, cuatrimestre o año, sin cruzar años.
- **Los períodos de retención afectados.** Cada uno es un mes.
  - Al menos un período de cada clase debe contener la fecha de efectos.
- **Qué se hace con el tramo anterior y con el posterior.**
- **El responsable y el soporte**, con referencia y fecha, y el fundamento.

**Efecto:**

- La aclaración «transición por resolver» de la vigencia se cierra.
- Vuelve a abrirse si después cambian la fecha de la resolución o la de efectos.
- La decisión queda en la historia, con quién y cuándo.
- El sistema no decide el corte: lo registra.

**Dónde:** `20261108161000_tributario_decisiones_periodo.sql` (función y columna `detalle`) y `20261108160500_tributario_perfil_renta_iva.sql` (cierre y reapertura de la aclaración).

**Prueba:** 24, filas 1 a 21 y 34, 36, 39 y 40 (permisos).

### 2.2 Formato 2532 (su respuesta 7)

**Qué cambió**

- **La vigencia de la cooperativa registra si recibió donaciones o cooperación internacional no reembolsable.** Puede
  ser sí, no, o sin dato.
  - Si no las recibió, se exige la constancia de lo verificado (`CONSTANCIA_2532_REQUERIDA`).
- **En el Centro tributario:**

  | Dato | Formatos | Nota |
  |---|---|---|
  | Recibió | 5245, 2530, 2531 y 2532 | El 2532 aplica |
  | No recibió, con constancia | 5245, 2530, 2531 | El 2532 no aplica |
  | Sin dato, o «no» sin constancia | 5245, 2530, 2531 | El 2532, por confirmar |

- **La pantalla actual no envía este dato, y al guardar no lo borra.** Hoy se registra por la vía de datos.

**Dónde:** `20261108160500_…` (dos columnas y la validación), `src/lib/finanzas/tributario/obligaciones.ts` y `perfil.ts`, con textos en cuatro idiomas.

**Prueba:** 24, filas 22 a 29, y las pruebas unitarias «formato 2532» de `combinaciones.test.ts`.

### 2.3 Bandas de reimpresión: fecha de la reconstrucción (su respuesta 8)

**Qué cambió**

- La reimpresión reconstruida lleva una banda más, debajo de la primera: «Fecha de la reconstrucción: {fecha} ({zona}).
  Los datos de las partes que se reconstruyeron son los de esa fecha, no los del día de la expedición.»
- La fecha y la hora van en la zona horaria del documento.
- Las otras bandas no cambian.

**Dónde:** `src/lib/documents/server/base.ts`.

- El texto está en el namespace nuevo `finanzasTributarioR5.bandas`, en español, inglés, francés y portugués.
- `src/lib/documents/textos.ts` lo suma a las bandas de los documentos sin pisar ninguna.

**Prueba:** pruebas unitarias de `instantanea.test.ts`, 10 de 10: fecha en la zona y no en UTC, mezcla de textos y los
cuatro idiomas.

---

## 3. Seguridad: tarifa exacta (pendiente de la ronda 4)

**Qué cambió**

- `fn_tarifa_exacta_impuesto` sigue siendo SECURITY DEFINER, porque la llaman funciones del servidor.
- Ahora comprueba que quien la llama pertenece a la organización del impuesto (`fn_assert_acceso_org`):

  | Quién llama | Resultado |
  |---|---|
  | Usuario con sesión que no es miembro | 42501 |
  | anon | Sin permiso de ejecución |
  | Sin sesión (funciones del servidor, service_role) | Lee la tarifa |

- Se revocan anon y public.

**Dónde:** `20261108165000_tarifas_precision_exacta.sql`.

**Prueba:** 24, filas 30 a 33, 35, 37 y 38.

## 4. «Aún sin confirmar» que toca el IVA

- **El instructivo del 300 todavía cita el Decreto 390 de 2016.** Nuestro código no lo cita en ningún lugar. Las
  referencias a modalidades y documentos aduaneros citan el **Decreto 1165 de 2019**, con la nota de que el instructivo
  sigue citando el 390.
- **No hay doctrina DIAN sobre el bimestre partido.** Por eso la transición del gran contribuyente se resuelve con la
  decisión registrada de la sección 2.1, no con una regla automática.

## 5. Lo que NO se hizo y queda pendiente

- **No se aplicó ninguna migración**, no se reclasificó nada histórico, no se declaró ni se pagó.
- **Las pantallas no piden aún los datos nuevos.** Van primero a Figma. Faltan:
  - el soporte aduanero completo;
  - la contingencia y la consulta del CUFE/CUDE;
  - la devolución del cobro;
  - el vencimiento y la firmeza de la declaración;
  - la aprobación del cierre;
  - la decisión de la transición del gran contribuyente;
  - el dato del 2532.

  Hoy se registran por la vía de datos. Las validaciones del servidor (`validarNaturaleza`, `validarDeclaracion`) ya
  aceptan los campos nuevos. No hay todavía una ruta para aprobar el cierre ni para registrar la transición: las
  funciones de la base están listas.
- **Se mantiene el aviso de la ronda 4:** si alguien vuelve a guardar una corrección de error desde la pantalla actual,
  se borran los campos que esa pantalla no envía, y la decisión con ellos. Eso nunca saca una venta de las casillas.
  Volver a guardar un cierre borra también su aprobación, a propósito.
- **Firmeza y vencimiento:** el sistema no los calcula. Sin el dato registrado, retirar la venta se bloquea; no se
  presume.
- **Activos fijos:** sin cuenta por línea solo se reconocen por la cuenta de cabecera 15… (sección 1.5).
- **Reparto de la base en el asiento por líneas:** es el hallazgo previo de la sección 1.5.
- **2532:** el dato es de la vigencia del perfil, no de cada año gravable (vea la pregunta 6).
- **Formato de la fecha en la banda:** sale como día/mes/año y hora:minuto en todos los idiomas.

## 6. Preguntas para su criterio

1. **«Nunca transmitida» con soporte de falla.** Hoy, con el aviso o el soporte de la falla y la consulta sin resultado
   pasadas las 48 horas, el sistema da la contingencia por descartada y permite retirar la venta. ¿Es su lectura, o con
   soporte de falla la factura debe tenerse por expedida en contingencia y tratarse con nota crédito?
2. **Desde cuándo corren las 48 horas.** Hoy se cuentan desde el fin de la falla o desde la venta, lo que sea posterior.
   Sin falla registrada, desde la venta. ¿Es correcto?
3. **Firmeza.** ¿Basta con que una persona registre si la declaración está en firme, con su nota? ¿O quiere que el
   sistema muestre como referencia el término general del art. 714 ET, sin decidir por él?
4. **Art. 589.** Hoy el término se toma como el año siguiente a la fecha de vencimiento registrada, inclusive. ¿Hay que
   registrar también la solicitud de corrección ante la DIAN y su respuesta?
5. **Activos fijos sin cuenta por línea.** ¿Basta reconocerlos por la cuenta de cabecera 15…, o quiere que toda compra con
   IVA no descontable y más de una línea exija la cuenta por línea?
6. **Formato 2532.** ¿El dato debe ser por año gravable, recibió o no ese año, en lugar de por vigencia del perfil?
7. **Importación exenta.** Hoy queda pendiente, porque la 47 es solo para la excluida. ¿A qué casilla debe ir?
8. **Aprobación del segundo usuario.** ¿Basta para el cierre, o la quiere también para otras naturalezas que mueven la
   2408, como el traslado entre auxiliares?

## 7. Evidencia: pruebas en seco con los archivos exactos

**Cómo se corrieron:**

1. Cada archivo, migraciones y pruebas, se subió completo a la base por trozos. Cada trozo midió como máximo 38 KB y se
   cortó en un fin de línea. El md5 de cada trozo y del archivo entero se comprobó contra el disco.
2. Las migraciones se pegaron **completas y en orden de prefijo** en el marcador de cada prueba.
3. Todo corrió en una sola transacción que terminó en excepción, es decir, en rollback.
4. Cuando una prueba se corrigió entre corridas, la versión nueva se armó en la base aplicando el mismo cambio, y su md5
   completo se comprobó contra el disco antes de volver a correr.
5. Al final se borraron los objetos grandes de la prueba. Se comprobó que la base no quedó con ninguna tabla, función,
   columna, proveedor, producto, venta, compra, miembro ni cuenta de las pruebas.
6. Organización de pruebas: 374.

Las migraciones de anticipos y consignación (120500, 121000, 170000) no se cargaron: estas pruebas no dependen de ellas.

**Migraciones:**

| Migración | md5 | ¿Cambió en la ronda 5? |
|---|---|---|
| 20261108140000 | `47486ffab373921553fdcd99d2f56ad0` | No |
| 20261108140500 | `4b00bf10bf99ff2a97e2e89ff0480811` | No |
| 20261108150000 | `746ccbabbb6f05b8b22a043b4314b777` | Sí |
| 20261108150500 | `53bfcba981ac8811b57ac97e86120cad` | Sí |
| 20261108151000 | `69666ff755350aaa4bf0a678cbf42a65` | Sí |
| 20261108152000 | `b038410fb5539296fd40877f07888c79` | Sí |
| 20261108160000 | `85fd17321a7e85d85a58916cb2f84c95` | No |
| 20261108160500 | `1d80345bde9c6d9fd378bc10e8c43a5e` | Sí |
| 20261108161000 | `2153ce37f896697ed3c6b2e506d84db0` | Sí |
| 20261108161500 | `5ea9208264ed61f452be374617f55e60` | No |
| 20261108165000 | `1ec6641bdf74dfc15163d0753982309f` | Sí |

**Pruebas:**

| Prueba (md5) | Migraciones | Resultado |
|---|---|---|
| 07 `cecaaf3c…` | 140000 | **31 de 31** |
| 08 `36ca2b8e…` | 140500 | **12 de 12** |
| 10 `83919376…` | 150000 · 150500 · 151000 | **76 de 76**. Se completaron los datos de POS5; no cambia ningún esperado |
| 12 `ebe12150…` | 140000 | **20 de 20** |
| 13 `a6d16eeb…` | 140500 · 160000 · 160500 · 161000 · 161500 | **44 de 44** |
| 17 `9df272fd…` | 140000 · 150000 · 152000 | **22 de 22**. Cambia FCH, por la respuesta 5 (sección 1.5) |
| 18 `8fa1e33b…` | 140000 · 150000 · 150500 · 151000 · 152000 | **76 de 76**. Versión 6 del borrador, detalle de PE y FCB, por la respuesta 5 |
| 23 `d030cb47…` (nueva) | 140000 · 150000 · 150500 · 151000 · 152000 | **105 de 105** |
| 24 `8983a4da…` (nueva) | 140500 · 160000 · 160500 · 161000 · 161500 · 165000 | **40 de 40** |
| 19 `e5e1a306…` | 140500 · 160000 · 160500 · 161000 · 161500 · 165000 | **46 de 46** |

**Fallas de las primeras corridas.** Todas fueron de las pruebas o de esperados que la ronda 5 cambió, no de las
migraciones:

- En la 23, un nombre de variable ambiguo en un ayudante de la prueba, y la fila del reparto (el hallazgo de la sección
  1.5).
- En la 24, una búsqueda hecha con RLS dentro de la sesión del miembro.
- En la 18, la versión del borrador, que pasó de 5 a 6.

El md5 completo y el detalle de cada fila están en cada `.resultado.txt`.

**Pruebas unitarias:**

- `src/lib/finanzas/tributario`, `src/lib/documents` y `src/lib/services/tributario`: 14 suites, 244 de 244.
- Sin errores de lint en los archivos tocados.
