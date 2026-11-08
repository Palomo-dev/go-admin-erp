# Perfil tributario y calendario · Respuesta a P5, P8 y a las condiciones «Perfil» y «Calendario»

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
| `pruebas/09_perfil_renta_iva_y_vigencias.sql` y `.resultado.txt` (en seco, org 374, usuario miembro simulado, todo revertido) | Catálogo RUT y estados FE; migración del campo combinado (5 casos) e idempotencia; 6 combinaciones contradictorias y 2 válidas (incluida R-99-PN con responsable); código RUT inexistente; cambio de periodicidad sin motivo / con motivo / 1 de enero / ingreso al SIMPLE; encadenamiento de vigencias; períodos con 1 y 2 vigencias; vigencia futura que rige desde su fecha sin volver a guardar y sin cambiar la ficha; documentos sin columnas que reescribir; calendario 2026–2027 vacío; la vía vieja cerrada; no miembro; clave pública | **39 de 39** |
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
| `docs/contador/pruebas/09_perfil_renta_iva_y_vigencias.sql` · `.resultado.txt` | Prueba en seco (39 de 39) |

Orden para aplicar: H2 (`20261108140500`), luego `20261108160000`, luego `20261108160500`. Las rondas anteriores siguen
vigentes en lo que este documento no cambia.
