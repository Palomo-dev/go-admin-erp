# Nómina · Preguntas para el Contador (2026-11-16)

Esta nota abre la ronda de la **nómina** (fase 3 de Recursos humanos). Explica, sin términos de programación, cómo
calcula el sistema, le muestra casos con sus números para que los verifique con calculadora y le pide que confirme
las cuentas contables.

**Estado:** el cálculo, el cierre, el pago y la contabilización están construidos y probados, pero **la nómina está
apagada en todas las empresas**. Hoy una empresa solo puede **preliquidar**: ver cuánto daría la nómina, sin cerrarla,
sin pagarla y sin que se cree ningún asiento. La encenderemos empresa por empresa **después de sus respuestas**.

**Cómo responder:** cada pregunta trae lo que hicimos («Lo que hace hoy»). Basta con «De acuerdo» o con la corrección.
Si una respuesta cambia un número, volvemos a correr todos los casos de la sección 3 y le mandamos los nuevos.

Valores usados en todos los ejemplos (año 2026): salario mínimo **$1.750.905**, auxilio de transporte **$249.095**,
UVT **$52.374**. Todos los meses se cuentan de 30 días.

---

## 1. Cómo funciona, en una página

1. **Preliquidar.** El sistema toma, para cada empleado: su salario (si cambió a mitad de mes, cada día con el suyo),
   las horas extra y los recargos **ya aprobados** en Asistencia, las vacaciones, incapacidades y licencias aprobadas,
   las novedades de nómina (bonos, auxilios, descuentos autorizados), las comisiones, las cuotas de préstamos y los
   embargos. Con eso arma la colilla. Si algo está pendiente de aprobar, la colilla sale pero **el cierre se bloquea**.
2. **Revisar.** Alguien revisa y, si la empresa lo configuró, aprueba (por ejemplo, la gerencia).
3. **Cerrar.** Al cerrar se crea el **asiento de causación** de cada empleado. Desde ese momento la colilla **no se
   puede modificar**. Si hubo un error, se hace un **ajuste con motivo**, que se calcula con las mismas reglas del mes
   cerrado (aunque después haya cambiado una tarifa) y genera su propio asiento.
4. **Pagar.** Se registra **un solo egreso** en Tesorería por todo el período (comprobante de egreso, «CE»), desde la
   cuenta bancaria que se elija, y se genera el archivo para el banco. Al pagar se crea el asiento de pago de cada
   empleado.
5. **Contabilizado.** El período queda «contabilizado» solo cuando cada empleado tiene sus dos asientos (causación y
   pago). Si una cuenta no existe en el plan de la empresa, el asiento **no se hace a medias**: queda en la bandeja de
   rechazos contables para corregirlo.

Los valores legales (salario mínimo, auxilio, UVT, tarifas, tablas) no están escritos en el programa: se leen de la
tabla de parámetros **con su fecha de vigencia**. El salario mínimo de 2027 todavía no tiene valor: una nómina de
enero de 2027 se puede preliquidar, pero no cerrar, hasta que se cargue.

---

## 2. Decisiones de cálculo que debe confirmar

### Devengados

**P1. Horas ordinarias del salario mensual.** Lo que hace hoy: al empleado con salario mensual las horas ordinarias
ya le pagan con el salario; si caen de noche o en domingo/festivo solo se le paga **el recargo** (35 %, 90 %, etc.).
Las horas extra se pagan completas (hora + recargo). Al que gana por hora se le paga cada hora más su recargo.
¿De acuerdo?

**P2. Valor de la hora.** Salario mensual ÷ el divisor de la fecha de la hora: **220** hasta el 14-jul-2026 y **210**
desde el 15-jul-2026 (jornada de 44 h y luego 42 h). ¿De acuerdo, o prefiere un divisor fijo de 240 o 230?

**P3. Auxilio de transporte.** Se paga si el **salario** del contrato (no el total devengado) no pasa de 2 salarios
mínimos, y solo por los días **efectivamente trabajados** (no por días de vacaciones, incapacidad ni licencia). ¿De
acuerdo con las dos cosas?

**P4. Salario integral.** No paga recargos ni horas extra, no tiene auxilio, no provisiona prima ni cesantías, sí
vacaciones. Si es menor de 13 salarios mínimos la colilla se bloquea. ¿De acuerdo?

**P5. Incapacidades.** Días 1 y 2 de origen común a cargo del empleador al 66,67 %; desde el día 3, de la EPS al
66,67 % (hasta el 90) y al 50 % (91 a 180); nunca menos del salario mínimo diario. Se muestran en líneas separadas para
saber cuánto se recobra a la EPS. El empleador las paga en la nómina y luego recobra. ¿De acuerdo? ¿Algunas empresas
pagan los días 1 y 2 al 100 %?

**P6. Vacaciones.** Disfrutadas: (salario + promedio de lo variable del último año) ÷ 30 × días calendario; son base de
salud, pensión y parafiscales. Compensadas en dinero: lo mismo por los días pactados; **no** son base de salud ni
pensión, **sí** de parafiscales. ¿De acuerdo?

### Seguridad social y parafiscales

**P7. Regla del 40 %.** Los pagos no salariales (bonificaciones y auxilios no salariales) que pasen del 40 % del total
de la remuneración entran al IBC. **No cuentan** para el 40 %: el auxilio de transporte, las vacaciones ni las
prestaciones. ¿De acuerdo?

**P8. Topes del IBC.** Mínimo un salario mínimo y máximo 25, **proporcionales a los días cotizados** del período (una
licencia no remunerada no se cotiza ni cuenta para el mínimo). El IBC se redondea **al peso superior**. ¿De acuerdo?

**P9. Base de caja, ICBF y SENA.** Lo salarial del mes (en el integral, el 70 %), **sin** el tope de 25 salarios y sin
la regla del 40 %. ¿De acuerdo?

**P10. Exoneración del art. 114-1.** Cada empresa marca si tiene derecho (persona jurídica, o persona natural con dos
o más empleados). Si lo tiene, no paga salud del empleador, ICBF ni SENA por quien **devengue en el mes** menos de 10
salarios mínimos, contando todo lo devengado (salarial y no salarial). Nunca al integral. Si la empresa no lo ha
marcado, el sistema **no exonera** y avisa. ¿Se mide con el devengado total o solo con el salario?

**P11. Fondo de solidaridad.** Desde **4 salarios mínimos exactos** paga el 1 %; la tabla escalonada (1,2 % a 2 %)
desde 16. Se mide con el IBC del mes. ¿De acuerdo? La tabla de la reforma pensional (desde el 1-abr-2027) está
cargada pero **no se usa** hasta que usted la confirme.

**P12. ARL.** Tarifa **inicial** de la clase del cargo o de la sede (clase I por defecto). ¿Se cotiza ARL sobre los
días de vacaciones, incapacidad o licencia? Hoy el sistema la calcula sobre todo el IBC del mes.

**P13. Licencia no remunerada.** Hoy esos días no se pagan ni se cotizan. ¿El empleador debe seguir cotizando pensión
sobre el último IBC durante la licencia?

**P14. Redondeo de los aportes.** Hoy cada aporte se redondea **al peso**. La PILA aproxima cada cotización al
múltiplo de 100 superior, así que puede haber diferencias de unos pesos entre la nómina y la planilla. ¿Prefiere que la
nómina redondee como la PILA desde ya?

### Retención en la fuente

**P15. Cuándo se calcula.** Es mensual: en nómina quincenal, la primera quincena no retiene y la segunda calcula con
todo el mes y resta lo ya retenido. ¿De acuerdo?

**P16. Depuración.** Orden: ingresos laborales del mes → menos salud, pensión y fondo de solidaridad del trabajador →
menos dependientes (10 % con tope de 32 UVT), medicina prepagada (16 UVT) e intereses de vivienda (100 UVT) → menos
aportes voluntarios AFC/FVP (30 % y 3.800 UVT al año) → menos 25 % exento (790 UVT al año) → todo eso limitado al 40 %
del ingreso neto y a 1.340 UVT al año. El auxilio de transporte se cuenta como ingreso laboral. ¿De acuerdo? Las 72 UVT
por dependiente del art. 336 **no** se aplican en la retención mensual (solo en la declaración). ¿De acuerdo?

**P17. Redondeo de la retención.** Hoy se aproxima al **múltiplo de $1.000** más cercano. ¿Se redondea la retención
de cada mes o solo el formulario 350?

**P18. Prima y cesantías.** La retención de la prima se calcula **sobre la prima sola**, en su propio período (junio y
diciembre), no sumada al salario del mes. Las cesantías y sus intereses son exentos según el salario promedio (tabla
del art. 206 num. 4: 100 % hasta 350 UVT, y baja hasta 0 % sobre 650 UVT). ¿De acuerdo con las dos?

**P19. Procedimiento 2.** El porcentaje fijo lo calcula el sistema en junio y diciembre con los 12 meses anteriores
(base depurada ÷ 13), pero hoy se guarda a mano por empleado. Si un empleado está en procedimiento 2 sin porcentaje,
la colilla se bloquea. ¿De acuerdo?

### Descuentos

**P20. Embargos.** Orden: alimentos, luego cooperativas, luego ordinarios por la fecha en que llegó el oficio. Base:
salario devengado del período menos salud, pensión, fondo y retención. Todos los embargos juntos hasta el **50 %** de
esa base; los ordinarios además solo hasta **1/5 de lo que el salario excede al mínimo**. Lo que no cabe queda en
alerta y no se descuenta. ¿De acuerdo? ¿Hay algún caso en que el embargo de alimentos deba tomarse sobre el total
devengado y no sobre el salario?

**P21. Préstamos y libranzas.** Después de los embargos. Cada cuota hasta el porcentaje máximo pactado en el préstamo
(30 % por defecto) y el empleado siempre conserva al menos el **50 %** de su salario neto (Ley 1527). ¿De acuerdo?

### Prestaciones

**P22. Provisiones mensuales.** Cesantías y prima: 1/12 (8,33 %) de lo salarial prestacional **más** el auxilio de
transporte. Intereses: 12 % de la provisión de cesantías. Vacaciones: 15/360 (4,17 %) del salario ordinario, sin
auxilio ni horas extra. ¿De acuerdo?

**P23. Prima y cesantías con salario que cambió.** Si el salario cambió en los últimos 3 meses, se usa el promedio del
semestre (o del año); si no, el último. Lo variable se promedia en el período. ¿De acuerdo, también para la prima?

**P24. Días que cuentan.** Las licencias no remuneradas descuentan días de prima y cesantías; las incapacidades y
vacaciones **no** descuentan. ¿De acuerdo?

**P25. Cesantías al fondo.** El período anual de cesantías deja las cesantías «por consignar al fondo» (no van en el
neto del empleado) y paga los intereses al empleado antes del 31 de enero. ¿De acuerdo? El pago al fondo (antes del 14
de febrero) se hará desde Tesorería en una fase siguiente.

---

## 3. Casos para verificar a mano

Todos son de **julio de 2026, mes completo**, salvo donde se indica. Empleador con exoneración 114-1, salvo el caso 2.

| # | Caso | Datos | Resultado del sistema | Cuenta a mano |
|---|---|---|---|---|
| 1 | Salario mínimo con auxilio | Salario 1.750.905 | Devengado **2.000.000**; salud 70.036; pensión 70.036; **neto 1.859.928**. Empleador: pensión 210.109; ARL I 9.140; caja 70.036. Provisiones: cesantías 166.667; intereses 20.000; prima 166.667; vacaciones 72.954 | 1.750.905 × 4 % = 70.036,2; × 12 % = 210.108,6; × 0,522 % = 9.139,7; 2.000.000 ÷ 12 = 166.666,7; × 12 % = 20.000; 1.750.905 × 15 ÷ 360 = 72.954,4 |
| 2 | Mismo empleado, **sin** exoneración | — | Salud empleador **148.827**; ICBF 52.527; SENA 35.018; el neto no cambia | 1.750.905 × 8,5 %, × 3 %, × 2 % |
| 3 | Salario variable con comisiones | Salario 2.000.000 + comisiones 1.500.000 | IBC **3.500.000**; salud 140.000; auxilio 249.095 (el salario no pasa de 2 mínimos); cesantías 312.425; neto 3.469.095 | (2.000.000 + 1.500.000 + 249.095) ÷ 12 |
| 4 | Salario integral | 13 mínimos = 22.761.765 | IBC **15.933.236** (70 %); salud 637.329; fondo de solidaridad 159.332 (1 %); salud empleador 1.354.325; ICBF 477.997; SENA 318.665; sin prima ni cesantías; vacaciones 948.407; **retención 3.330.000** | Retención: 22.761.765 − 1.433.990 = 21.327.775; 25 % exento con tope 3.447.955; base 17.879.820 = 341,38 UVT; (341,38 − 150) × 28 % + 10 = 63,59 UVT × 52.374 = 3.330.317 → 3.330.000 |
| 5 | Bono no salarial que pasa el 40 % | Salario 2.000.000 + bono no salarial 2.000.000 | IBC **2.400.000**; salud 96.000; caja 80.000 (sobre el salario) | 40 % de 4.000.000 = 1.600.000; exceso 400.000 |
| 6 | Tope de 25 salarios | Salario 50.000.000 | IBC **43.772.625**; salud 1.750.905; fondo 2 % = 875.453; caja sobre 50.000.000 = 2.000.000 | 25 × 1.750.905 |
| 7 | Fondo de solidaridad en 4 salarios | Salario 7.003.620 | Fondo **70.036** (1 %). Con un peso menos, no hay fondo | 4 × 1.750.905 |
| 8 | Fondo de solidaridad en 17,1 salarios | Salario 30.000.000 | Fondo **420.000** (1,4 %) | 30.000.000 ÷ 1.750.905 = 17,13 |
| 9 | Retención con dependientes | Salario 10.000.000, con dependiente | Dependientes 1.000.000; base 6.075.000; **retención 209.000**. Sin dependiente: **351.000** | Neto 10.000.000 − 900.000 = 9.100.000; − 1.000.000; 25 % de 8.100.000 = 2.025.000; base 6.075.000 = 115,99 UVT; (115,99 − 95) × 19 % × 52.374 = 208.880 |
| 10 | Embargo por alimentos y préstamo | Salario 3.000.000; embargo 30 %; cuota de préstamo 1.000.000 con tope 30 % | Embargo **828.000**; préstamo **801.095** (no cabe completo); **neto 1.380.000** | Base 3.000.000 − 240.000 = 2.760.000; 30 % = 828.000; el empleado conserva 50 % = 1.380.000 |
| 11 | Embargo ordinario sin alimentos | Salario 3.000.000; oficio por 900.000 | Se descuentan **249.819** | (3.000.000 − 1.750.905) ÷ 5 |
| 12 | Incapacidad común de 5 días | Salario 2.500.000; del 6 al 10 de julio | Salario 25 días 2.083.333; incapacidad empleador 2 días **116.727**; EPS 3 días **175.091**; auxilio 25 días 207.579; IBC 2.375.151 | 2/3 del diario = 55.558 < mínimo diario 58.363,5 → se paga el mínimo diario |
| 13 | Horas extra | Salario mínimo; 2 h extra diurnas el 10-jul; 1 h extra nocturna el 20-jul; 8 h ordinarias el domingo 5-jul | Extra diurna **19.897**; extra nocturna **14.591**; recargo dominical **57.302**; IBC 1.842.695 | 1.750.905 ÷ 220 × 1,25 × 2; ÷ 210 × 1,75; ÷ 220 × 0,90 × 8 |
| 14 | Semana que cruza el 1 de julio | Lunes 29-jun (festivo) a domingo 5-jul; salario sube de 2.000.000 a 2.200.000 el 1-jul; 8 h el 29-jun y 8 h el 5-jul | Salario **500.000**; recargos **130.182** | 2 días × 66.667 + 5 × 73.333; 8 × 9.091 × 0,80 + 8 × 10.000 × 0,90 |
| 15 | Licencia no remunerada | Salario mínimo; 10 días de licencia | Salario 20 días **1.167.270**; IBC igual | 1.750.905 × 20 ÷ 30 |
| 16 | Vacaciones disfrutadas | Salario 3.000.000, variable promedio 300.000; 10 días (6 al 15 de julio) | Vacaciones **1.100.000**; salario 20 días 2.000.000; auxilio 20 días 166.063 | 3.300.000 ÷ 30 × 10 |
| 17 | Prima del primer semestre | Salario 2.000.000; variables del semestre 600.000 | **1.174.548** | (2.000.000 + 100.000 + 249.095) × 180 ÷ 360 |
| 18 | Prima con aumento | 1.800.000 de enero a abril y 2.100.000 en mayo y junio | **1.074.548** | Promedio 1.900.000 + 249.095, × 180 ÷ 360 |
| 19 | Cesantías de 2026 | Salario 2.000.000 todo el año | Al fondo **2.249.095**; intereses al empleado **269.891** | (2.000.000 + 249.095) × 360 ÷ 360; × 12 % |
| 20 | Ajuste de un mes cerrado | Se olvidó un bono salarial de 100.000 | El ajuste paga 100.000 y descuenta 4.000 de salud y 4.000 de pensión: **neto 92.000**. Se calcula con las tarifas del mes cerrado | — |

---

## 4. Cuentas contables

Hoy el sistema usa las cuentas que **ya existen** en los planes de cuentas de las empresas. Le proponemos las
subcuentas del PUC de la derecha. Una empresa puede cambiar las cuentas de cada concepto (no su naturaleza).

### Asiento de causación (al cerrar), por empleado

| Concepto | Débito hoy | Crédito hoy | Propuesta PUC |
|---|---|---|---|
| Salario, horas extra y recargos, comisiones, bonos, licencias, incapacidades, auxilio de transporte | 5105 | — | 510506 sueldos, 510515 horas extra y recargos, 510518 comisiones, 510548 bonificaciones, 510527 auxilio de transporte, 510524 incapacidades. **En producción, 7205xx** |
| Vacaciones disfrutadas o compensadas | 2525 (consume la provisión) | — | 2525 |
| Prima pagada | 2520 | — | 2520 |
| Intereses de cesantías pagados | 2515 | — | 2515 |
| Salud, pensión y fondo de solidaridad del trabajador | — | 2370 | 237005 salud, 238030 fondos de pensiones |
| Retención en la fuente | — | 23650501 | 236505 |
| Embargos, libranzas, otros descuentos | — | 2380 | 2380xx (acreedores varios, por tercero) |
| Préstamos al empleado | — | 1365 | 136525 |
| Aportes del empleador: salud, pensión, ARL, caja, ICBF, SENA | 5105 | 2370 | 510569 / 510570 / 510568 / 510572 / 510575 / 510578 contra 237005, 238030, 237006, 237010 |
| Provisiones: cesantías, intereses, prima, vacaciones | 5105 | 2510, 2515, 2520, 2525 | 510530 / 510533 / 510536 / 510539 contra las mismas. ¿Prefiere 2610 (obligaciones laborales estimadas) mes a mes y consolidar al cierre del año? |
| Cesantías por consignar (período anual) | 2510 | 2380 | 2510 contra la cuenta por pagar al fondo |
| **Neto a pagar** | — | 25050501 | 250505 salarios por pagar |

### Asiento de pago

| Concepto | Débito | Crédito |
|---|---|---|
| Neto pagado | 25050501 | La cuenta contable de la cuenta bancaria elegida (si no tiene, 1110) |

**Preguntas de esta sección:**

- **C1.** ¿Confirma la tabla, o qué subcuentas quiere por defecto?
- **C2.** ¿El gasto debe separarse en 5105 (administración), 5205 (ventas) y 7205 (producción) según el **área** del
  empleado? Hoy todo va a 5105 y lleva el centro de costo del empleado.
- **C3.** ¿Cada línea de 2370 y 2380 debe llevar el **tercero** (la EPS, el fondo, el juzgado)? Hoy no lo lleva; las
  entidades de cada empleado ya están en su ficha.
- **C4.** El asiento de causación lleva la fecha del **último día del período** y la **sede del empleado** (antes iba a
  la sede de menor número). ¿De acuerdo?
- **C5.** Si la provisión mensual no alcanza al liquidar la prima o las vacaciones, la diferencia queda en el pasivo.
  ¿Debe ir al gasto en el mismo asiento?
- **C6.** El pago de los aportes (PILA) y su asiento entran en la fase siguiente. Mientras tanto quedan en 2370.
  ¿De acuerdo?

---

## 5. Lo que sigue pendiente de confirmar de la investigación

| Tema | Estado | Qué necesitamos |
|---|---|---|
| Salario mínimo 2026 ($1.750.905): decreto suspendido y transitorio con demanda | [S] | Confirmar que se sigue liquidando con ese valor |
| Auxilio de transporte 2026 ($249.095) | [S] | Confirmar |
| Salario mínimo, auxilio y UVT de 2027 | Sin valor | Se cargan cuando salgan; sin ellos no se cierra enero de 2027 |
| Divisor de la hora (235, 230, 220, 210) | [S] | P2 |
| Tabla de retención del art. 383 | [S] | Confirmar la tabla cargada (sección 4.1 de la investigación) |
| Tope de 100 UVT de intereses de vivienda | [S] | Confirmar |
| AFC/FVP: 30 % y 3.800 UVT al año | [S] | Confirmar |
| Tabla de exención de cesantías (art. 206 num. 4) | [S] | P18 |
| Redondeo de la retención a $1.000 | [S] | P17 |
| Tramos de incapacidad y el piso del mínimo diario | [S] | P5 |
| Quién paga cada licencia (luto, calamidad, maternidad, paternidad) | [S] | Confirmar; el luto está «por confirmar» (5 días hábiles) y no limita |
| Fondo de solidaridad de la reforma pensional (desde el 1-abr-2027) | [NC] | Confirmar cuando la Corte decida la fecha |
| Concurrencia de embargos | [S/NC] | P20 (con abogado laboral si hace falta) |
| Intereses de cesantías: 12 % y el pago mensual del 1 % por acuerdo | [S] | ¿Lo ofrecemos ya como opción por empleado? |

---

## 6. Qué haremos con sus respuestas

1. Ajustar el cálculo o los parámetros donde usted lo indique y volver a correr los 20 casos.
2. Cargar las cuentas que confirme como las de la plataforma.
3. Encender la nómina, empresa por empresa, solo cuando usted lo apruebe.
