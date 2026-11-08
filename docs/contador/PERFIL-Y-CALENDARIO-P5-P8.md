# Perfil tributario y calendario · Respuesta a P5, P8 y a las condiciones «Perfil» y «Calendario»

> **Ronda 2 (al final del documento) manda sobre las secciones 1 a 6** donde difieran: catálogo oficial, nuevos bloqueos,
> cambio de periodicidad pendiente de soporte, decisiones de período y reimpresión fiel.

Fecha: 7 de noviembre de 2026 · Base de datos: proyecto `taqjemqjtumhwptchcxk` · Organización de pruebas: **org 374**.
Responde a `RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md` (P5, P8 y las condiciones de cierre «Perfil» y «Calendario»).

**Estado:** las dos migraciones están **escritas y probadas en seco, pero NO aplicadas**. Se aplican cuando el dueño lo
ordene, después de que usted revise este documento. Hoy la base tiene **0 vigencias de perfil** en las 35 organizaciones,
así que la migración de datos no cambia nada existente; queda escrita para lo que exista el día de aplicarla.
Nada de esto presenta declaraciones, cambia documentos expedidos ni toca el envío a la DIAN.

---

## 1. Qué cambió

### 1.1 Renta e IVA en campos separados (P5)

Antes había un solo campo con cuatro opciones excluyentes: ordinario, SIMPLE, especial, no responsable de IVA. Ahora cada
vigencia tiene:

| Campo | Valores | Fuente de la lista |
|---|---|---|
| **Régimen de renta** | Ordinario · SIMPLE · Régimen tributario especial (ESAL) · No contribuyente declarante de ingresos y patrimonio · No contribuyente no declarante | RUT casilla 53: códigos 05, 47, 04 y 06; ET arts. 19, 22, 23, 240 y 903 |
| **Condición frente al IVA** | Responsable · No responsable | RUT códigos 48 y 49 (53 para persona jurídica no responsable); ET art. 437 |
| Periodicidad del IVA | Bimestral · Cuatrimestral · Anual · No aplica | ET arts. 600 y 915 |
| Calidades (casillas propias) | Gran contribuyente · Autorretenedor · Agente de retención de IVA · Agente de retención en la fuente (renta) · Responsable del impuesto al consumo | RUT 13, 15, 23, 07 y 33 |
| Códigos del documento electrónico | O-13, O-15, O-23, O-47, R-99-PN (y O-48/O-49, ver 1.3) | Anexo técnico de FE |
| Responsabilidades del RUT (opcional) | Los 51 códigos de la casilla 53 | Ver 1.3 |

Un dato sin definir queda **vacío**, no se supone. Una vigencia con renta o IVA vacíos queda marcada **«Revisar perfil»**,
no se puede guardar así, y el Centro tributario la muestra con la nota «perfil por revisar» sin quitar ninguna obligación.

### 1.2 Migración del campo combinado (conservadora)

Solo se llena lo inequívoco; todo lo demás queda vacío y la vigencia queda «Revisar perfil» hasta que alguien la confirme.

| Valor anterior | Régimen de renta | Condición IVA | Por qué |
|---|---|---|---|
| SIMPLE | SIMPLE | Responsable si tenía O-48 (sin O-49); no responsable si O-49 (sin O-48); si no, vacío | El SIMPLE es un régimen de renta |
| Especial | Especial | Igual que arriba | Régimen tributario especial de renta |
| Ordinario | **vacío** | Igual que arriba | Era el valor por defecto del formulario: no prueba nada sobre renta |
| No responsable de IVA | **vacío** | No responsable (vacío si además tenía O-48: contradicción) | No dice nada de renta |
| Cualquiera con O-13 / O-15 / O-23 | — | — | Gran contribuyente / autorretenedor / agente de IVA = sí; sin el código, vacío (la ausencia no prueba que no lo sea) |

R-99-PN **no** se traduce a «no responsable de IVA». El valor anterior queda guardado aparte para trazabilidad.

### 1.3 Catálogo del RUT separado de los códigos del documento electrónico (P5)

- **Tabla nueva `rut_responsabilidades`:** los 51 códigos de la casilla 53 (01 a 66, sin los suprimidos), cada uno con su
  nombre. 11 «Ventas régimen común» y 12 «Ventas régimen simplificado» se cargan como **no vigentes** (reemplazados por 48
  y 49) porque todavía aparecen en RUT sin actualizar. **Fuente:** listado público de códigos del RUT (Gerencie.com,
  modificado el 23-sep-2026, que cita ET arts. 555-2 y 658-3 y DUR 1625 de 2016 art. 1.2.6.6) y la página de trámites de la
  DIAN para el código 05. **No es la transcripción del formulario oficial:** cada código nace **«pendiente de validación»**.
- **La tabla que ya existía** (`dian_fiscal_responsibilities`, la que usan clientes, proveedores y el emisor) queda como
  la de **códigos del documento electrónico**. No se cambió ningún código ni descripción ni el envío a Factus; se le agregó
  el estado de validación:
  - O-13, O-15, O-23, O-47 y R-99-PN: **pendiente de validación**. Según las preguntas frecuentes de reglas de validación de
    la DIAN (Resolución 000042 de 2020) son los cinco vigentes; falta confirmar contra el anexo 1.9 (Resolución 000165 de 2023).
  - O-48 y O-49: **no vigente, por confirmar**: no figuran entre los cinco. Se conservan porque hay terceros guardados con ellos.
  - R-99-PN queda con la nota: «Significa que no aplica ninguna de las otras responsabilidades del documento. NO equivale a
    "no responsable de IVA"». El nombre del anexo («No aplica – Otros») está por confirmar.
- **Mapeo explícito RUT ↔ FE** (`rut_fe_responsabilidad_mapeo`): 13↔O-13, 15↔O-15, 23↔O-23, 47↔O-47 «equivalente»;
  48↔O-48 y 49↔O-49 «por confirmar». **R-99-PN no tiene equivalente** y el RUT 53 no tiene código FE propio.

### 1.4 H2 y vigencias (P5, P8)

- **Documentos nuevos con los datos de su fecha:** la representación gráfica (PDF) de la factura de venta, la nota crédito,
  la nota débito y el documento soporte toma las responsabilidades de la **vigencia que rige en la fecha del documento**
  (`fn_responsabilidades_fiscales_en`, migración H2 del anexo del 7-nov, también sin aplicar). En esta ronda se sumaron la
  cotización y los recibos/comprobantes de pago. Los documentos expedidos **no guardan** las responsabilidades del emisor
  (verificado: ninguna columna de `invoice_sales`, `support_documents` ni `sales`), así que no hay nada que reescribir: un
  PDF de un documento viejo se vuelve a armar con la vigencia de **su** fecha, no con la de hoy.
- **Un período con más de una vigencia** (p. ej. un cuatrimestre que cruza un cambio de perfil): el Centro tributario ya
  **no** usa el perfil del último día. Mira todas las vigencias que tocan cada período y, si hay más de una, marca la
  obligación **«Cambio de vigencia dentro del período: revisar procedencia»**, **no calcula su valor** y lleva al perfil. El
  borrador del IVA muestra el mismo aviso con la lista de vigencias. Si parte del período no tiene perfil, también lo dice.
- **Periodicidad del IVA por año:** ver regla B22 y advertencias A12–A14.
- **SIMPLE:** el Centro muestra tres obligaciones separadas: declaración anual del SIMPLE (formulario 260), **anticipo
  bimestral** (2593) y, si es responsable de IVA, el **IVA anual consolidado** (300, nota «separado de los anticipos
  bimestrales», ET art. 915).

### 1.5 Calendario vacío (condición «Calendario»)

Con cero fechas cargadas (el estado real hoy), cada obligación nacional dice **«Calendario {año} incompleto: no se pueden
determinar vencimientos»** y arriba aparece el mismo aviso con la aclaración: *«Esto no significa que la empresa no tenga
obligaciones: las de abajo siguen vigentes y su vencimiento queda por determinar»*. Si el año tiene fechas pero falta la de
una obligación, esa fila dice **«Calendario {año} incompleto: falta esta fecha»**. Si no se puede derivar ninguna
obligación, la pantalla dice «No se pudieron derivar obligaciones. Esto no significa que la empresa no tenga obligaciones».
Nunca se muestra «sin obligaciones».

---

## 2. Reglas de combinación de una misma vigencia

**Bloqueo** = contradicción clara: la vigencia no se guarda (se valida en la pantalla, en el servidor y otra vez en la base).
**Advertencia** = dudoso: se guarda solo si la persona la acepta expresamente; queda registrada en la vigencia y se la
preguntamos a usted (sección 5).

### 2.1 Bloqueos

| # | Regla | Fundamento |
|---|---|---|
| B1–B2 | Falta el régimen de renta o la condición frente al IVA | P5: son datos independientes y obligatorios |
| B3 | No responsable de IVA con periodicidad distinta de «No aplica» | ET art. 437 par. 3 (el no responsable no declara IVA) |
| B4 | Responsable de IVA sin periodicidad | ET art. 600 |
| B5 | Periodicidad anual fuera del SIMPLE | ET art. 600 (Ley 1819 de 2016: bimestral o cuatrimestral); la anual es la del SIMPLE, art. 915 |
| B6 | SIMPLE responsable de IVA con periodicidad bimestral o cuatrimestral | ET art. 915: declaración anual consolidada del IVA |
| B7 | O-48 y O-49 a la vez | Excluyentes |
| B8–B9 | O-48 con «No responsable»; O-49 con «Responsable» | Un código presente es una afirmación |
| B10 | O-47 sin régimen SIMPLE | O-47 = régimen simple (equivalente al RUT 47) |
| B11–B13 | O-13 / O-15 / O-23 sin marcar gran contribuyente / autorretenedor / agente de IVA | Equivalentes RUT 13, 15, 23 |
| B14 | El RUT trae más de un régimen de renta (04, 05, 06, 47) | Excluyentes; ET art. 903 (el SIMPLE sustituye la renta) |
| B15 | El régimen de renta no coincide con el del RUT (05 ordinario, 04 especial, 47 SIMPLE, 06 ingresos y patrimonio) | Casilla 53 |
| B16 | IVA contradictorio con el RUT (48 con 49/53; 48 con «No responsable»; 49/53 con «Responsable») | Casilla 53 |
| B17–B21 | RUT 13, 15, 23, 07 o 33 sin la calidad correspondiente marcada | Casilla 53 |
| B22 | Cambio de periodicidad del IVA respecto de la vigencia anterior, que no empieza el 1 de enero, entre dos periodicidades declarables, sin entrar ni salir del SIMPLE, **sin motivo** | ET art. 600: la periodicidad se fija con los ingresos brutos del año anterior |

Con motivo (inicio de actividades, ingreso al SIMPLE, salida del SIMPLE u otro), B22 pasa a advertencia A12.
Pasar de «No aplica» a una periodicidad (empezar a ser responsable) no cuenta como cambio.

### 2.2 Advertencias (no bloquean; se preguntan)

| # | Caso | Por qué no lo bloqueamos |
|---|---|---|
| A1 | SIMPLE + autorretenedor | ET art. 911: el SIMPLE no está obligado a autorretener salvo excepciones; no tenemos certeza de que sea imposible |
| A2 | SIMPLE + gran contribuyente | ET arts. 905 y 906: requisitos del SIMPLE; no hallamos una exclusión expresa |
| A3 | SIMPLE + impuesto al consumo | ET arts. 908 y 915: el INC de restaurantes y bares tiene tratamiento propio |
| A4–A7 | SIMPLE / gran contribuyente / autorretenedor / agente de IVA sin su código FE (O-47, O-13, O-15, O-23) | La tabla FE está por validar: la ausencia del código no prueba nada |
| A8 | R-99-PN junto con otros códigos FE | «No aplica – Otros» junto a otros es dudoso, no contradictorio con certeza |
| A9 | Se usa O-48 u O-49 | No figuran entre los códigos vigentes del documento electrónico (por confirmar) |
| A10 | Los campos afirman algo que el RUT marcado no trae | El RUT puede estar incompleto |
| A11 | El RUT marcado usa 11 o 12 | Códigos reemplazados |
| A12 | Cambio de periodicidad a mitad de año **con** motivo | La procedencia la decide usted (P8) |
| A13 | Cambio de periodicidad por entrar o salir del SIMPLE | Tratamiento específico (P8) |
| A14 | La vigencia siguiente cambia la periodicidad a mitad de año | Se avisa al corregir la anterior |

### 2.3 Ejemplos

| Vigencia | Resultado |
|---|---|
| Ordinario · responsable · bimestral · gran contribuyente y agente de IVA · O-13, O-23 · RUT 05, 13, 23, 48 | Se guarda |
| SIMPLE · no responsable · No aplica · O-47 | Se guarda (renta e IVA independientes) |
| ESAL (especial) · responsable · cuatrimestral | Se guarda |
| Ordinario · responsable · cuatrimestral · **R-99-PN** | Se guarda: R-99-PN no equivale a no responsable |
| Ordinario · no responsable · bimestral | **B3** |
| SIMPLE · responsable · bimestral | **B6** |
| Ordinario · responsable · anual | **B5** |
| Ordinario · O-47 | **B10** |
| SIMPLE · RUT 05 y 47 | **B14 + B15** |
| 2026-01-01 bimestral → 2026-07-01 cuatrimestral sin motivo | **B22**; con motivo «otro»: se guarda con A12 aceptada |
| 2027-01-01 cuatrimestral → bimestral | Se guarda (1 de enero) |
| Ordinario bimestral → SIMPLE anual desde 2027-05-01 | Se guarda con A13 |
| SIMPLE · anual · autorretenedor · O-47, O-15 | Pide aceptar A1 |

---

## 3. Pruebas

| Prueba | Qué cubre | Resultado |
|---|---|---|
| `pruebas/09_perfil_renta_iva_y_vigencias.sql` y `.resultado.txt` (en seco, org 374, usuario miembro simulado, todo revertido) | Catálogo RUT y estados FE; migración del campo combinado (5 casos) e idempotencia; 6 combinaciones contradictorias y 2 válidas (incluida R-99-PN con responsable); código RUT inexistente; cambio de periodicidad sin motivo / con motivo / 1 de enero / ingreso al SIMPLE; encadenamiento de vigencias; períodos con 1 y 2 vigencias; vigencia futura que rige desde su fecha sin volver a guardar y sin cambiar la ficha; documentos sin columnas que reescribir; calendario 2026–2027 vacío; la vía vieja cerrada; no miembro; clave pública | **39 de 39** (ronda 1; archivo retirado en la ronda 2, ver R2.10) |
| Reversión de las dos migraciones (en seco) | Columnas y permisos vuelven a ser los de hoy | OK |
| jest `combinaciones.test.ts` | Todas las reglas B y A, R-99-PN, cambio de periodicidad, migración del campo combinado, **los bloqueos de la base son los mismos de la pantalla**, períodos con dos vigencias y sin perfil | 14 de 14 |
| jest `tributario.server.test.ts` | Bloqueo antes de llegar a la base; advertencias que exigen aceptación; Centro con calendario vacío («incompleto» en cada obligación); período con dos vigencias → «revisar procedencia» sin calcular el borrador | 18 de 18 |

---

## 4. Lo que no se cambió y lo que queda pendiente

- **El envío a Factus no cambia.** El documento enviado no lleva las responsabilidades del emisor.
- **Tirillas del POS:** se imprimen con la ficha de la empresa del día de impresión, y la ficha solo se actualiza al guardar la
  vigencia que rige ese día. Si una vigencia empieza en una fecha futura y nadie vuelve a guardar el perfil, las tirillas
  desde ese día salen con los códigos anteriores. **No se cambió en esta ronda** (es del POS y de la impresión fuera de
  línea); propuesta: que la impresión consulte la vigencia de la fecha de la venta. Las facturas electrónicas (PDF) no tienen
  este problema.
- El borrador del IVA, su clasificación por línea y el formulario 300 son de otro equipo: aquí solo se agregó el aviso de
  vigencias.
- El calendario sigue vacío: la carga del decreto es de la plataforma.

## 5. Preguntas abiertas

1. **Catálogo del RUT:** ¿puede cotejar los 51 nombres y su vigencia contra el formulario RUT vigente? Mientras tanto todos
   quedan «pendiente de validación».
2. **Códigos FE:** ¿confirma que en el anexo vigente (1.9) solo O-13, O-15, O-23, O-47 y R-99-PN son válidos, que O-48/O-49
   ya no, y el nombre exacto de R-99-PN?
3. **A1–A3 (SIMPLE con autorretención, gran contribuyente o INC):** ¿alguno debe ser bloqueo?
4. **A8 (R-99-PN con otros códigos):** ¿es contradicción (bloqueo) o puede coexistir?
5. **B22:** ¿la lista de motivos (inicio de actividades, entrada o salida del SIMPLE, otro) es suficiente? ¿Hay otros
   cambios de periodicidad en el año que sean procedentes (p. ej. designación como gran contribuyente)?
6. **B5:** ¿hay algún caso fuera del SIMPLE con IVA anual que debamos permitir?
7. **Régimen especial (ESAL):** hoy el Centro muestra renta (110) con la nota «confirme formularios y anexos», sin conciliación
   fiscal. ¿Qué obligaciones propias (memoria económica, actualización del registro web) quiere que aparezcan?
8. **No contribuyentes:** ¿la lista (declarante de ingresos y patrimonio / no declarante) le sirve?
9. **Período con dos vigencias:** cuando usted determine qué vigencia procede, ¿quiere poder dejarlo anotado en el período
   para que el Centro deje de marcarlo, o prefiere que siga marcado y solo se documente?

## 6. Archivos

| Archivo | Qué es |
|---|---|
| `supabase/migrations/20261108160000_tributario_catalogo_rut_y_codigos_fe.sql` · rollback en `supabase/rollbacks/` | Catálogo RUT, estado de validación de los códigos FE, mapeo |
| `supabase/migrations/20261108160500_tributario_perfil_renta_iva.sql` · rollback en `supabase/rollbacks/` | Campos separados, migración de datos, bloqueos y guardado v2 |
| `src/lib/finanzas/tributario/combinaciones.ts` | Reglas B y A (una sola lista; la base repite los bloqueos) |
| `src/lib/finanzas/tributario/vigenciasPeriodo.ts` · `obligaciones.ts` | Vigencias por período, obligaciones con varias vigencias, SIMPLE y calendario incompleto |
| `docs/contador/pruebas/09_perfil_renta_iva_y_vigencias.sql` · `.resultado.txt` | Prueba en seco de la ronda 1 (retirada; la reemplaza la 13) |

Orden para aplicar: H2 (`20261108140500`), luego `20261108160000`, luego `20261108160500`. Las rondas anteriores siguen
vigentes en lo que este documento no cambia.

---

# Ronda 2 (7 de noviembre de 2026)

Responde a `RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md` («Cuentas de IVA y responsabilidades históricas» y «Perfil y
calendario»). **Donde esta sección difiere de las anteriores, manda esta.** Las migraciones de la ronda 1 nunca se
aplicaron y se reescribieron; se agregaron dos. Todo sigue **escrito, probado en seco y SIN aplicar**.

| Migración | Qué hace |
|---|---|
| `20261108160000_tributario_catalogo_rut_y_codigos_fe.sql` (reescrita) | Catálogo del RUT cotejado con la fuente oficial; códigos FE separados |
| `20261108160500_tributario_perfil_renta_iva.sql` (reescrita) | Calidades con acto y vigencia, RTE, no contribuyentes, INC, cambio de periodicidad pendiente, nuevos bloqueos |
| `20261108161000_tributario_decisiones_periodo.sql` (nueva) | Decisiones sustentadas que cierran la alerta de varias vigencias, con historia |
| `20261108161500_documentos_instantanea_partes.sql` (nueva) | Instantánea del emisor y del receptor al expedir (reimpresión fiel) |

Orden para aplicar: `20261108140500` (H2) → `160000` → `160500` → `161000` → `161500`. Cada una tiene su reversión en
`supabase/rollbacks/` (probadas en seco: dejan columnas, permisos y disparadores como hoy).

## R2.1 Catálogo del RUT cotejado con fuente oficial

Fuente: **DIAN, «IN-CAC-0237 · Instructivo de calidad del Registro Único Tributario RUT», versión 3** (PDF publicado en
dian.gov.co, archivo del 4 de marzo de 2026), numeral 31 «Casilla 53. Códigos». De cada código se tomó el nombre exacto,
el numeral, la página y el marco normativo que cita el propio instructivo.

- **48 códigos** figuran en el instructivo → estado **«cotejado con la fuente oficial»** (no es su visto bueno: «validado»
  solo lo asigna usted).
- **11 y 12** (ventas régimen común / simplificado) **no** figuran en el instructivo vigente: se cargan como **no
  vigentes** y **«pendiente de validación»** (la DIAN los reemplazó por 48 y 49 en la actualización masiva de 2019).
- **51** (que traía la fuente secundaria de la ronda 1, «agente de retención impoconsumo de bienes inmuebles») **no figura**
  en el instructivo oficial: **se retiró** del catálogo.
- Reglas que el instructivo dice expresamente y que ahora se aplican: «La responsabilidad 47 es excluyente con la 5»
  (numeral 31.31); el 53 es solo para personas jurídicas del SIMPLE con actividades del grupo 1 (31.36); «Las entidades a
  que hace referencia el artículo 22 del Estatuto Tributario no deben tener registradas las responsabilidades 4, 5 o 6»
  (31.4 a 31.6); gran contribuyente y autorretenedor se registran por acto de la DIAN (31.11 y 31.13); la autorretención
  especial (59) es distinta del autorretenedor (15) y «no excluye» que les practiquen retención (31.41).

**Códigos del documento electrónico:** siguen en su propia tabla. O-13, O-15, O-23, O-47 y R-99-PN: identificados en la
documentación oficial de la DIAN (preguntas frecuentes de reglas de validación); cotejo íntegro del anexo vigente
pendiente → «pendiente de validación». **O-48 y O-49: «no validado como código de FE»**; elegirlos en el perfil es un
bloqueo. El mapeo RUT ↔ FE queda solo en 13, 15, 23 y 47 (sin 48/49 y sin R-99-PN).

### Lista completa con fuente por código
| Código | Nombre (exacto, IN-CAC-0237) | Numeral · página | Marco normativo citado por la DIAN |
|---|---|---|---|
| 01 | Aporte especial para la administración de justicia | 31.1 · p. 45 | Artículo 131 de la Constitución Política, Artículo 135 de la Ley 6 de 1992, Artículo 363 de la Ley 1819 de 2016, Decreto 1890 de 1999. |
| 02 | Gravamen a los movimientos financieros | 31.2 · p. 46 | Artículos 870 a 881 del Estatuto Tributario. |
| 03 | Impuesto al patrimonio | 31.3 · p. 46 | Artículos 292-3, 294-2, 295-2, 296-2, 298, 298-1, 298-2, 298-6 y 298-8 del Estatuto Tributario |
| 04 | Impuesto sobre la renta y complementario régimen tributario especial | 31.4 · p. 47 | Artículos 19 a 19-5, 356, 356-1, 356-2, 356-3, 357, 358, 359, 361, 362,363, 334,364-1, 364-2, 364-3, 364-4, 364-5 y 364-6 del Estatuto Tributario, Artículos 1.2.1.5.1.3, al 1.2.1.5.1.19 del Decreto 1625 de 2016, Resol... |
| 05 | Impuesto sobre la renta y complementario régimen ordinario | 31.5 · p. 48 | Libro Primero del Estatuto Tributario |
| 06 | Declaración de Ingresos y patrimonio | 31.6 · p. 49 | Artículos 23 y 598 del Estatuto Tributario |
| 07 | Retención en la fuente a título de renta | 31.7 · p. 50 | Artículo 368, 368-2, 383, 392, 395, 401 y 406 del Estatuto Tributario, numeral 2.11 del concepto General unificado 912 de 2018. |
| 08 | Retención Impuesto de timbre nacional | 31.8 · p. 51 | Libro Cuarto del Estatuto Tributario, Decreto 175 de 2025. |
| 09 | Retención en la fuente en el impuesto sobre las ventas | 31.9 · p. 51 | Artículos 437-1, 437-2, 437-3, 437-4 y 437-5 del Estatuto Tributario |
| 10 | Obligado aduanero | 31.10 · p. 53 | Parágrafo 1 del Artículo 1.6.1.2.1. del Decreto 1625 de 2016, Decreto 1165 de 2019. |
| 13 | Gran contribuyente | 31.11 · p. 54 | Resolución DIAN 001253 de 2022, Resolución DIAN 000191 de 2024 y Artículo 562 del Estatuto Tributario. |
| 14 | Informante de Exógena | 31.12 · p. 54 | Artículos 623, 623-1, 623-2, 623-2 (sic), 623-3, 624, 625, 626, 627, 628,629, 629-1, 630, 631, 631-1, 631-2, 631-3, 631-4, 631-5, 631-6 y 633 del Estatuto Tributario, Artículo 58 de la Ley 863 de 2003 y Artículo 23 de... |
| 15 | Autoretenedor | 31.13 · p. 55 | Parágrafo 1 del artículo 368 del Estatuto Tributario, Resolución DIAN 005707 de 2019, Resolución DIAN 000026 de 2024, Resolución 211 de 15 de mayo de 2025 y Artículos 1.2.6.2, 1.2.6.6, 1.2.6.8 de Decreto Único Reglame... |
| 16 | Obligación facturar por ingresos bienes y/o servicios excluidos | 31.14 · p. 56 | Artículos 424,439, 476 del Estatuto Tributario; Artículos 1.6.1.4.1, 1.6.1.4.2, 1.6.1.4.3, 1.3.1.12.24, 1.3.1.13.1 y 1.3.1.13.17 del Decreto 1625 de 2016. |
| 17 | Profesionales de compra y venta de divisas | 31.15 · p. 56 | Resolución DIAN 210 de 2025, Resolución Externa 1 de 2018 de la Junta Directiva del Banco de la República. |
| 18 | Precios de transferencia | 31.16 · p. 57 | Artículos 260-1, 260-2, 260-3, 260-4, 260-5, 260-6, 260-7, 260-8, 260-9, 260-10 y 260- 11 del Estatuto Tributario. Decreto 2120 de 2017. |
| 19 | Productor de bienes y/o servicios exentos (incluye exportadores) | 31.17 · p. 58 | Artículos 477,478, 479 480 y 481 del Estatuto Tributario, Concepto DIAN 008660 int 987 de 2024. |
| 20 | Obtención NIT | 31.18 · p. 58 | Artículos 177-2 y 771-2 del Estatuto Tributario, Artículos 1.6.1.4.3 y 1.6.1.4.12 numeral 7 Decreto 1625 de 2016, Resolución 167 de 2021 Artículo 1 y 4, Dto. 3050 de 1997 Artículo 3 |
| 21 | Declarar ingreso o salida del país de divisas o moneda legal | 31.19 · p. 59 | Artículo 1 Resolución DIAN 1767 de 2006, artículo 82 de la Resolución Externa Banco de la República número 8 de 2000, Resolución DIAN 000063 de 2016. |
| 22 | Obligado a cumplir deberes formales a nombre de terceros | 31.20 · p. 59 | Artículo 2 Resolución 1767 de 2006, Artículo 572 del Estatuto Tributario. |
| 23 | Agente de retención en ventas | 31.21 · p. 60 | Numeral 2 del Artículo 437-2, 437-4 y 437-5 del Estatuto Tributario, artículos 1.3.2.1.15, y 3.2.1.1 del Decreto Único Reglamentario 1625 de 2016, Resolución 000051 de 2019. |
| 26 | Declaración Individual Precios de Transferencia | 31.22 · p. 60 | Artículo 1.2.2.1.2. del Decreto 1625 de 2016, Artículos 260-1, 260-2, 260-5, 260-7 y 260-9 del Estatuto Tributario. |
| 32 | Impuesto Nacional a la gasolina y al ACPM | 31.23 · p. 61 | Artículos 174 y 175 de la Ley 1607 de 2012, Artículos 218 y 2019 de la Ley 1819 de 2016, Parágrafo del Artículo 1.5.2.4.1. del Decreto 1625 de 2016, Artículos 47 y 48 de la Ley 2277 de 2022, Resolución 000007de 2024. |
| 33 | Impuesto Nacional al Consumo | 31.24 · p. 61 | Artículos 1.5.6.1.1 al 1.5.6.3.2. Título 6 del Decreto 1625 de 2016, Artículos 512-1, 512- 2, 512-3, 512-4, 512-5, 512-6, 512-7, 512-8, 512-9, 512-10, 512-11, 512-12, 512-13, 512-14, 512-5, 512-16, 512-17, 512-18, 512... |
| 36 | Establecimiento Permanente | 31.25 · p. 62 | Artículos 20-1 y 20-2 del Estatuto Tributario, Artículos 1.2.1.1.4, 1.2.1.1.5, 1.2.1.3.6, 1.2.1.3.7, 1.6.1.2.1 numeral 1, 1.6.1.2.5 numeral 1, 1.6.1.2.11 numeral 8.1 y 8.2 del Decreto único reglamentario 1625 de 2016. |
| 39 | Proveedor de Servicios Tecnológicos PST | 31.26 · p. 64 | Artículos 616-4, 684-4 del Estatuto Tributario y Capítulo 4 del Título 1 de laParte 6 del Libro 1 del Decreto 1625 de 2016 Único Reglamentario en Materia Tributaria especialmente Artículos 1.6.1.4.1 numeral 10 y 1.6.1... |
| 41 | Declaración anual de activos en el exterior | 31.27 · p. 65 | Artículos 574 numeral 5 y 607 del Estatuto Tributario, Ley 1739 de 2014 |
| 42 | Obligado a llevar contabilidad | 31.28 · p. 66 | Artículos 10, 19, 20, 21, 23, 28 numeral 7 del Código de Comercio, Capítulo I, II y III del Título IV del Código de Comercio. Artículos 364, 654, 655, 772, 773, 774, 775, 776, 777, 780, 781 y 782 del Estatuto Tributar... |
| 45 | Autorretenedor de rendimientos financieros | 31.29 · p. 66 | Resolución DIAN 55 de 2017, Artículos 365, 368-2, 369, 370, 371, 372, 395, 396, 397-1 del Estatuto Tributario y artículos 1.2.4.2.9 al 1.2.4.2.49 del Decreto 1625 de 2016. |
| 46 | IVA Prestadores de Servicios desde el Exterior | 31.30 · p. 67 | Estatuto Tributario, Literal c) y parágrafo 3 Artículo 420, Parágrafo 2 Artículo 437, numerales 3 y 8 y parágrafo 3 del Artículo 437-2, Resolución 51 de 2018, numeral 3 del Artículo 1.6.1.2.1 y parágrafo 3 del Artícul... |
| 47 | Régimen Simple de Tributación - SIMPLE | 31.31 · p. 68 | Artículos 903 al 916 del Estatuto Tributario, Titulo 8 Artículo 1.5.8.1.1 y siguientes, artículos 1.5.8.4.1 al 1.5.8.4.6. y Parágrafo 3 del Artículo 1.6.1.2.10. del Decreto Único Reglamentario 1625 de 2016, Decreto 67... |
| 48 | Impuesto sobre las ventas - IVA | 31.32 · p. 70 | Artículos 420 y siguientes del Estatuto Tributario, Capítulo I (Hecho Generador y Base Gravable) Capítulo II (Bienes y Servicios Gravados, Exentos y Excluidos) y Capítulo IV (Tarifas del Impuesto sobre las Ventas) del... |
| 49 | No responsable de IVA | 31.33 · p. 71 | Artículo 437 del Estatuto Tributario especialmente Parágrafos 3, 4 y 5. |
| 50 | No responsable de Consumo restaurantes y bares | 31.34 · p. 72 | Artículo 512-13 del Estatuto Tributario |
| 52 | Facturador electrónico | 31.35 · p. 72 | Estatuto Tributario Artículos 511, 615, 616-1, 616-2, 617, 618, 652, 652-1 ,684-2, Ley 962 de 2005, en su artículo 26, Decreto Único Tributario 1625 de 2016, Sección 1 Factura Electrónica Artículos 1.6.1.4.1.1. hasta ... |
| 53 | Persona Jurídica No Responsable de IVA | 31.36 · p. 73 | Parágrafo 4 del Artículo 437 del Estatuto Tributario. Título III Impuesto Unificado bajo el Régimen Simple de Tributación Ley 2277 de 2022, Estatuto Tributario Artículos 903 ­ 916, Decreto 001091 de 2020, Decreto 1847... |
| 54 | Intercambio automático de Información CRS | 31.37 · p. 73 | Ley 1661 de 2013, Resolución 078 de 2020, Resolución 44 de 2021, Anexo I, II y III, Esquema XSD, Estándar para el Intercambio Automático de Información, Manual de Implementación, Jurisdicciones Participantes (MCAA - C... |
| 55 | Informante de Beneficiarios Finales | 31.38 · p. 73 | Artículos 631-5 y 631-6 del Estatuto Tributario, Artículo 1.6.1.2.4 numeral 6, del Decreto 1625 de 2016, Artículo 16 y 17 de la Ley 2155 de 2021, Artículo 12 y 13 de la Ley 2195 de 2022, Resolución DIAN 6 de 2025, Res... |
| 56 | Impuesto Nacional al Carbono | 31.39 · p. 74 | Artículos 221, 222 y 223 de la Ley 1819 de 2016, Artículos 47, 48 y 49 de la Ley 2277 de 2022, Artículos 1.5.5.1. al 1.5.5.9. del Decreto Único Reglamentario 1625 de 2016. Resoluciones DIAN 08 de 2025 y 07 de 2024. |
| 58 | Intercambio Automático de Información FATCA | 31.40 · p. 74 | Artículo 4 de la Ley 1666 de 2013, Artículo 631-4 del Estatuto Tributario, Resolución 60 de 2015, Anexo I y II, Resolución 0003 de 2016 y Resolución 086 de 2016. |
| 59 | Autorretención especial renta | 31.41 · p. 75 | Parágrafo 2 del Artículo 365 del Estatuto Tributario y el Artículo 1.2.6.6.del Decreto 1625 de 2016, el Artículo 114-1 del Estatuto Tributario adicionado por el Artículo 65 de la Ley 1819 de 2016 |
| 60 | Autorretención por concepto de intereses y rendimientos financieros de entidades vigiladas por la Superintendencia Financiera de Colombia | 31.42 · p. 76 | Artículo 1.2.4.2.43, numeral 1 del Artículo 1.2.4.2.84. y parágrafo 2 del Artículo 1.2.4.2.85 del Decreto 1625 de 2016. |
| 61 | Autorretención por concepto de comisiones de entidades vigiladas por la Superintendencia Financiera de Colombia | 31.43 · p. 77 | Artículo 1.2.4.3.3. del Decreto 1625 de 2016 |
| 62 | Impuesto nacional sobre productos plásticos de un solo uso utilizados para envasar, embalar o empacar bienes | 31.44 · p. 77 | Artículos 50, 51, 52 y 53 de la Ley 2277 de 2022. |
| 63 | Impuesto a las bebidas ultraprocesadas azucaradas | 31.45 · p. 77 | Artículo 513-1, 513-2, 513-3, 513-4, 513-5 del Estatuto Tributario, Ley 2277 de 2022 Artículo 54, Resolución 158 del 25 de 2023, Resolución DIAN 11336 de 2023 Artículos 2 y 4. Concepto DIAN 019339 - interno 1124 de 2023. |
| 64 | Impuesto a los productos comestibles ultraprocesados industrialmente y/o con alto contenido de azúcares añadidos, sodio o grasas saturadas | 31.46 · p. 78 | Artículos 513-6, 513-7, 513-8, 513-9, 513-10 del Estatuto Tributario, Ley 2277 de 2022 el Artículo 54 Capitulo II, Resolución 158 del 25 de 2023, Decreto 1625 de 2016 Artículo 1.6.1.13.2.55. |
| 65 | Renta Presencia económica significativa en Colombia -PES | 31.47 · p. 79 | Ley 2277 de 2022 Artículo 57, Decreto 2039 de 2023, Artículo 20-3 del Estatuto Tributario, Decreto 1625 de 2016 sección 4 Artículos 1.2.1.28.4.1 al 1.2.1.28.4.11. |
| 66 | Intercambio Automático de Información DPI | 31.48 · p. 80 | Ley 1661 de 2013, Artículo 15 de la Ley 2155 de 2021 y el Artículo 631-4 del Estatuto Tributario, Resolución DIAN 199 de 2024. |

Además, sin fuente oficial vigente: **11** Ventas régimen común y **12** Ventas régimen simplificado (no vigentes,
pendientes de validación). La ruta del PDF y la versión se citan en cada fila de `rut_responsabilidades.fuente`.

## R2.2 Calidades y SIMPLE

| Tema | Ronda 1 | Ronda 2 |
|---|---|---|
| SIMPLE con autorretención activa | Advertencia | **Bloqueo** `simple_con_autorretencion` (ET art. 911: el SIMPLE no practica retenciones ni autorretenciones, salvo pagos laborales). Aplica a la ordinaria (RUT 15) y a la especial (RUT 59) |
| Autorretenedor general vs especial | Una casilla | **Dos**: autorretenedor (15, con resolución y fecha obligatorias) y autorretención especial a título de renta (59) |
| Gran contribuyente | Casilla | Casilla + **resolución que lo califica y fecha desde** (obligatorias). **Sin incompatibilidad automática** con el SIMPLE (se quitó la advertencia). Si declara IVA cuatrimestral: advertencia (ET art. 600 num. 1) |
| INC | Advertencia en el SIMPLE | **Actividad obligatoria** (ET art. 512-1: restaurantes y bares, telefonía/datos, vehículos y bienes, bolsas, cannabis, otra). En el SIMPLE la fila del INC lleva «confirmar» |

## R2.3 R-99-PN residual

Bloqueos nuevos: `fe_r99_con_otros` (R-99-PN junto con cualquier otro código FE) y `fe_r99_con_calidades` (R-99-PN con
SIMPLE, gran contribuyente, autorretenedor o agente de retención de IVA). Nunca se traduce a «no responsable de IVA»
(probado: responsable de IVA con R-99-PN se guarda).

## R2.4 Cambio de periodicidad

Ya no hay «motivo otro + aceptación». Un cambio de periodicidad del IVA respecto de la vigencia anterior que no empieza el
1 de enero (incluida la entrada o salida del SIMPLE) se guarda con estado **«pendiente de soporte»** hasta que se
documenten **motivo, hecho, norma y fecha efectiva** (la fecha debe ser el inicio de la vigencia: si no, bloqueo
`cambio_fecha_efectiva_distinta`). Completo pasa a **«documentado»**, que sigue siendo una advertencia para que usted
confirme la procedencia. Mientras esté pendiente, el Centro marca el IVA del período y no calcula su valor. Motivo
«designación como gran contribuyente» solo admite periodicidad **bimestral** (bloqueo
`cambio_gran_contribuyente_no_bimestral`); no habilita otro cambio.

## R2.5 IVA anual

Solo para el SIMPLE (bloqueo `periodicidad_anual_fuera_de_simple`, sin excepción configurable). Si usted identifica otro
supuesto legal, se agrega como opción documentada.

## R2.6 Régimen tributario especial

El perfil pide el **tipo de entidad** (ESAL calificada art. 19 · cooperativa o sector solidario art. 19-4 · otra) y si los
**ingresos del año anterior superan 160.000 UVT**. El Centro muestra:

| Obligación | Regla |
|---|---|
| Renta, formulario **110** | Siempre en el RTE (nota «régimen tributario especial») |
| Conciliación fiscal | **Se muestra** con la nota «evalúe si está obligada»; no se excluye por ser RTE |
| Actualización anual del registro web | Siempre (ET art. 364-5); para cooperativas o tipo sin definir, nota «confirme si aplica» |
| Memoria económica | Si ingresos > 160.000 UVT (ET art. 356-3); sin el dato, se muestra con «dato pendiente»; con «no», no aparece |

## R2.7 No contribuyentes

Dos clasificaciones iniciales: **art. 23** (declarante de ingresos y patrimonio, formulario 110) y **art. 22** (no
declarante). Exigen la **naturaleza jurídica** que las sustenta (bloqueo `no_contribuyente_sin_naturaleza`) y siempre
llevan la advertencia «clasificación inicial: confírmela». El art. 22 con 04, 05 o 06 en el RUT es bloqueo (IN-CAC-0237).
El Centro nunca queda «sin obligaciones»: el art. 22 muestra una fila «no declarante» con la nota de clasificación inicial,
además de IVA, retención y exógena si corresponden.

**B14 revisado:** el único bloqueo entre códigos de renta del RUT es **47 + 05** (excluyentes según la DIAN). Las demás
combinaciones (por ejemplo, una ESAL con 05 hasta su calificación, o 04 + 05) y un régimen elegido distinto del que sugiere
el RUT son **advertencias**: una obligación en el RUT no define el régimen sin examinar al sujeto.

## R2.8 Varias vigencias en un período: decisión sustentada

En el Centro, la obligación marcada «cambio de vigencia dentro del período» ofrece **«Registrar decisión»** (permiso de
aprobación financiera) con: vigencia que aplica (opcional), **decisión, fundamento y alcance** (obligatorios). Queda quién
y cuándo. Nada se edita ni se borra; una decisión nueva sobre el mismo período queda encima y apunta a la anterior.
Al registrarla, el servidor guarda una **huella** de las vigencias que tocan el período (identificador, fechas y última
modificación). Si después alguien crea, corrige o mueve una de esas vigencias, la huella cambia y la alerta se **reabre**
(«decisión reabierta»), conservando la historia. Con decisión vigente el Centro sí calcula el valor.

## R2.9 Reimpresión fiel

Tabla nueva `document_party_snapshots`: al **expedir** (factura, nota crédito, nota débito, documento soporte, cotización,
recibo o comprobante de pago) un disparador guarda el **emisor** (ficha de la empresa con las responsabilidades de la
vigencia de la fecha del documento) y el **receptor** (cliente o proveedor) tal como estaban. Es **inmutable** (ni con
privilegios: error `INSTANTANEA_INMUTABLE`). Cuando el envío electrónico queda **aceptado**, se guarda una sola vez el
receptor **tal como viajó** en el documento electrónico, y el PDF lo prefiere.

El motor de PDF usa, en este orden: (1) la instantánea; (2) si el documento es anterior a la migración, el envío aceptado
guardado (receptor del pedido y, si la respuesta de Factus la trae, la empresa emisora); (3) si no hay nada, la vigencia de
la fecha del documento, y el PDF lleva la banda **«Datos del emisor reconstruidos según la vigencia de la fecha del
documento: no se encontró la instantánea de expedición»**. No se rellenan instantáneas hacia atrás (no se fabrica una
«expedición» que no se capturó). Hoy hay 153 facturas de venta sin envío electrónico: si se reimprimen después de aplicar,
saldrán marcadas «reconstruido». El logo y el color siguen siendo los actuales.

**Pendientes expresos:** (a) **POS**: las tirillas siguen usando la ficha del día de impresión (y la caché del escritorio);
no se tocaron. (b) **Lo registrado en Factus**: el emisor que Factus imprime y envía sale de la empresa registrada en su
cuenta, fuera de GO Admin; no se verificó que la respuesta de Factus traiga la empresa (el lector es defensivo).

## R2.10 Pruebas de la ronda 2

| Prueba | Resultado |
|---|---|
| `pruebas/13_perfil_ronda2_decisiones_y_reimpresion.sql` y `.resultado.txt` (en seco, org 374, miembro simulado, todo revertido) | **44 de 44** (la fila 12 se corrigió en el esperado: la base devuelve dos bloqueos correctos) |
| Reversión de `160500`, `161000` y `161500` (en seco) | Columnas, disparadores y permisos iguales a hoy |
| jest: `combinaciones.test.ts`, `tributario.test.ts`, `tributario.server.test.ts`, `documents/server/__tests__/instantanea.test.ts` | Todas pasan; incluye la prueba de que los bloqueos de la base son los mismos de la pantalla |

La prueba 09 de la ronda 1 se retiró: probaba funciones que se reescribieron.

## R2.11 Preguntas abiertas

1. ¿Coteja usted los 48 códigos con el formulario y marca «validado»? ¿Qué hacemos con 11 y 12 si aparecen en un RUT?
2. Anexo de FE vigente: ¿confirma O-13, O-15, O-23, O-47 y R-99-PN y el nombre exacto de R-99-PN?
3. Autorretención especial (59) en el SIMPLE: ¿el art. 911 la cubre igual que la ordinaria (hoy, bloqueo)?
4. Gran contribuyente que declara cuatrimestral: hoy advertencia. ¿Desde qué período exige bimestral la designación?
5. RTE: ¿la actualización del registro web aplica a cooperativas? ¿Qué formatos quiere ver en el registro web y la memoria?
6. ¿Qué otros motivos de cambio de periodicidad a mitad de año considera procedentes, además de los cinco de la lista?
7. Reimpresión de los 153 documentos actuales sin instantánea: ¿basta la marca «reconstruido» o prefiere bloquear su
   reimpresión hasta revisarlos?
