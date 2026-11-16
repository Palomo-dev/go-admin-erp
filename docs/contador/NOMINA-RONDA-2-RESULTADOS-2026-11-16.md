# Nómina · Ronda 2: correcciones aplicadas y los 20 casos de nuevo (2026-11-16)

Respuesta a «Nómina · Respuestas del Contador (16-nov-2026)»
([RESPUESTAS-CONTADOR-NOMINA-2026-11-16.md](RESPUESTAS-CONTADOR-NOMINA-2026-11-16.md)).

**Estado:** apliqué las correcciones del cálculo y volví a correr los 20 casos. **La nómina sigue apagada en todas
las empresas**: solo se puede preliquidar. Usted dará la aprobación para encenderla empresa por empresa, por escrito.

Valores usados en todos los ejemplos (2026): salario mínimo **$1.750.905**, auxilio de transporte **$249.095**,
UVT **$52.374**. Mes de 30 días. Empleador con exoneración 114-1, salvo donde se indica.

---

## 1. Qué cambió en el cálculo

| Punto | Qué hace ahora el sistema |
|---|---|
| **P1** Hora extra en domingo o festivo | Suma los dos recargos. La extra nocturna en festivo paga 1 + 0,75 + 0,90 = **2,65**. El motor de horas ya los sumaba cuando el día está en el calendario de festivos (el 20-jul-2026 lo está); el error estaba en el dato de prueba del caso 13, que trataba ese día como ordinario. Agregué una prueba con el turno real del 20 de julio. |
| **P2** Jornada pactada | Si el contrato pacta menos horas semanales que la jornada máxima legal, el divisor sale de la pactada (horas × 5; 24 h → 120). Una jornada pactada mayor que la legal no cambia nada. |
| **P3** Tope del auxilio | El tope de 2 salarios mínimos se mide **cada mes** con el sueldo básico (si cambió a mitad de mes, cada día con el suyo, llevado a 30 días), las comisiones y el recargo nocturno ordinario. No cuentan las horas extra, los domingos y festivos ni lo no salarial. Si un mes se pasa, ese mes no hay auxilio y la colilla lo avisa. Se sigue pagando solo por días trabajados. |
| **P5** Incapacidad días 1 y 2 al 100 % | Nueva opción por empresa. Si no la define, rigen los 2/3 con el piso del mínimo diario. Esa diferencia no se recobra. |
| **P6** Vacaciones | El promedio de lo variable ya **no** incluye horas extra ni trabajo en domingos y festivos: solo comisiones, recargo nocturno ordinario, retroactivos y, para quien gana por hora, sus horas ordinarias. El salario fijo es el del **día en que empiezan**, aunque cambie durante el disfrute. |
| **P10** Exoneración 114-1 | Se mide solo con lo salarial. Un pago no salarial bien pactado no la quita. |
| **P12** ARL | Solo sobre los días trabajados y lo devengado en ellos. No se cotiza por vacaciones, incapacidades ni licencias, remuneradas o no. La colilla guarda el IBC de la ARL aparte del de salud y pensión. |
| **P13** Licencia no remunerada | El empleador paga su 8,5 % de salud sobre el **último IBC** (el del mes anterior; si no lo hay, el salario) por los días de licencia, salvo que esté exonerado. El trabajador no aporta. Pensión: por defecto no se cotiza. Opción por empleado, si se pactó por escrito: «el empleador paga el 16 %», o «compartida», en la que el trabajador autorizó por escrito su 4 % y el empleador paga su 12 %. |
| **P14** Redondeo como la PILA | El aporte de cada subsistema por empleado (trabajador más empleador) se aproxima al múltiplo de $100 superior. Al trabajador se le descuenta su porcentaje exacto al peso y el empleador asume la diferencia. El neto del trabajador no cambia. |
| **P17** Redondeo de la retención | Cada mes y por empleado: más de $10.000, al millar más cercano; de $100 a $10.000, a la centena; hasta $100, al peso. Los cortes quedaron como parámetro con su vigencia. |
| **P20** Embargo sobre prestaciones | Cada oficio de alimentos o de cooperativa tiene una casilla: «la base incluye las prestaciones». Si la tiene, el embargo también toma la prima y los intereses de cesantías, hasta el 50 %. Un embargo ordinario no puede tenerla. |
| **P21** Libranzas | El 50 % se mide sobre el salario neto de ley, sin auxilio. La libranza sale de lo que queda después de los embargos, y el trabajador conserva ese 50 % **más el auxilio completo**. |
| **P22** Provisión de vacaciones | La base incluye las comisiones y el recargo nocturno ordinario. Siguen fuera las horas extra, los domingos y el auxilio. |
| **P23** Prima | Ya no usa la regla de los 3 meses. Si el salario cambió en cualquier momento del semestre, usa el promedio del semestre. Las cesantías siguen con su regla: el promedio si cambió en los últimos 3 meses o si hay pagos variables. |
| **P11** Fondo de solidaridad desde el 1-abr-2027 | Cargado con esa fecha. Verifiqué los valores contra el texto del art. 20 de la Ley 2381 de 2024 en la publicación de la Rama Judicial: 1,5 % (4 a <7), 1,8 % (7 a <11), 2,5 % (11 a <19), **2,8 % (19 a 20 incluidos)** y 3 % (más de 20). La tabla cargada mandaba los 20 salarios exactos al 3 %; ya está corregido. |
| **Luto** | 5 días hábiles a cargo del empleador (Ley 1280 de 2009), ya confirmado y en uso. |
| **Intereses de cesantías** | No se ofrece el pago mensual del 1 %. |

P24 ya estaba como usted lo indica: el saldo de vacaciones ya descontaba las licencias no remuneradas.

---

## 2. Los 20 casos, otra vez

Todos son de julio de 2026, mes completo, salvo donde se indica. En **negrita**, lo que cambió.

| # | Caso | Resultado del sistema |
|---|---|---|
| 1 | Salario mínimo con auxilio | Devengado 2.000.000; salud 70.036; pensión 70.036; neto 1.859.928. Empleador: **salud 64** (solo el redondeo: 70.036,2 → 70.100); **pensión 210.164** (280.144,8 → 280.200 − 70.036); **ARL 9.200**; **caja 70.100**. Provisiones: 166.667 / 20.000 / 166.667 / 72.954 |
| 2 | Mismo, sin exoneración | **Salud del empleador 148.864** (70.036,2 + 148.826,9 = 218.863,1 → 218.900 − 70.036); **ICBF 52.600**; **SENA 35.100**; el neto no cambia |
| 3 | Salario + comisiones | IBC 3.500.000; salud 140.000; auxilio 249.095 (3.500.000 ≤ 3.501.810); cesantías 312.425; neto 3.469.095. **Provisión de vacaciones 145.833** (3.500.000 × 15 ÷ 360; antes solo sobre el salario) |
| 4 | Salario integral | IBC 15.933.236; salud 637.329; fondo 159.332; **salud del empleador 1.354.371**; **ICBF 478.000**; **SENA 318.700**; vacaciones 948.407; retención 3.330.000 |
| 5 | Bono no salarial sobre el 40 % | IBC 2.400.000; salud 96.000; caja 80.000 |
| 6 | Tope de 25 salarios | IBC 43.772.625; salud 1.750.905; fondo 875.453; caja 2.000.000 |
| 7 | Fondo en 4 salarios | Fondo 70.036 |
| 8 | Fondo en 17,13 salarios | Fondo 420.000 (1,4 %) |
| 9 | Retención con dependiente | 209.000; sin dependiente, 351.000. Con P17 el redondeo da igual (más de $10.000 → al millar) |
| 10 | Embargo de alimentos + préstamo | Embargo 828.000; **préstamo 552.000**; **neto 1.629.095**: el 50 % del salario neto (1.380.000) más el auxilio completo (249.095) |
| 11 | Embargo ordinario | 249.819 |
| 12 | Incapacidad de 5 días | 2.083.333 / 116.727 / 175.091 / 207.579; IBC de salud y pensión 2.375.151. **ARL sobre 2.083.333: 10.900**. Caja sobre 2.083.333: **83.400** |
| 13 | Horas extra | Extra diurna 19.897; **extra nocturna en festivo 22.095** (8.337,64 × 2,65); recargo dominical 57.302; **IBC 1.850.199** |
| 14 | Semana que cruza el 1-jul | Salario 500.000; recargos 130.182 |
| 15 | Licencia no remunerada de 10 días | Salario 1.167.270; IBC 1.167.270; **base de la licencia 583.635**. Exonerado: no paga salud por la licencia. **Sin exoneración: salud de la licencia 49.609**; el subsistema de salud queda en 1.167.270 × 12,5 % + 49.609 = 195.517,7 → 195.600, y el empleador paga 148.909. Sin pensión por defecto |
| 16 | Vacaciones de 10 días | Vacaciones 1.100.000; salario 2.000.000; auxilio 166.063. **ARL solo sobre los 20 días: 10.500** |
| 17 | Prima con variable | 1.174.548 |
| 18 | Prima con aumento | 1.074.548 |
| 19 | Cesantías de 2026 | Al fondo 2.249.095; intereses 269.891 |
| 20 | Ajuste de un mes cerrado | Bono 100.000; salud 4.000; pensión 4.000; **neto 92.000**. El ajuste también recalcula los aportes del empleador (**pensión +12.000, caja +4.000, ARL +500**) y las provisiones (**cesantías +8.333, intereses +1.000, prima +8.333**). La retención del mes se recalcula igual. La PILA de corrección entra con la fase de PILA |

Casos nuevos que agregamos para las correcciones:

| Corrección | Caso | Resultado |
|---|---|---|
| P3 | Salario 2.000.000 + comisiones 1.600.000 | 3.600.000 > 3.501.810: ese mes no hay auxilio |
| P3 | Salario 3.400.000 + 20 h extra | Sigue con auxilio: las extras no cuentan |
| P3 | Salario 3.400.000 + 20 h de recargo nocturno ordinario (113.333) | 3.513.333 > tope: no hay auxilio |
| P5 | Caso 12, empresa que paga los días 1 y 2 al 100 % | Empleador 166.667 (2 × 83.333,33); EPS 175.091 |
| P6 | Vacaciones del 6 al 15-jul; aumento de 3.000.000 a 3.300.000 el 10-jul | Vacaciones 1.100.000 (con el salario del 6-jul); salario de los otros días 2.150.000 |
| P10 | Salario 17.000.000 + bono no salarial 1.000.000 | Exonerado: lo salarial no llega a 10 salarios (17.509.050) |
| P13 | Licencia, pensión «compartida» | Pensión del trabajador 46.690,8 + 23.345,4 = 70.036 |
| P13 | Licencia, pensión «el empleador paga el 16 %» | Trabajador 46.691; empleador 280.144,8 → 280.200 − 46.691 = 233.509 |
| P13 | Último IBC 1.900.000, licencia de 10 días | Base 633.334; salud del empleador por la licencia 53.833 |
| P2 | Jornada pactada de 24 h, 2 h extra diurnas | 1.750.905 ÷ 120 × 1,25 × 2 = 36.477 |
| P17 | Redondeos | 3.330.382 → 3.330.000; 10.500 → 11.000; 10.000 → 10.000; 4.349 → 4.300; 150 → 200; 87,4 → 87 |
| P20 | Prima 1.174.548 con oficio de alimentos del 30 % que incluye prestaciones | Embargo 352.364. Sin la casilla, no se embarga la prima |
| P23 | Aumento el 1-feb (1.800.000 → 2.100.000) | Promedio 2.050.000; prima 1.149.548 (antes daba 1.174.548) |
| P11 | Abril de 2027 | 4 salarios → 1,5 %; 7 → 1,8 %; 11 → 2,5 %; 19 y 20 → 2,8 %; 21 → 3 % |

---

## 3. Lo que necesito que confirme

1. **Redondeo PILA con el empleador exonerado (P14).** El trabajador aporta su 4 % exacto (70.036). La planilla aproxima la salud a 70.100. Los $64 de diferencia los asume el empleador aunque esté exonerado, y aparecen como «salud del empleador». ¿De acuerdo?
2. **Redondeo del fondo de solidaridad.** El fondo se aproxima aparte, al múltiplo de $100 superior. Esa diferencia (por ejemplo, $68 en el caso 4) va con la pensión del empleador, porque las dos van al fondo de pensiones (238030). ¿De acuerdo, o la planilla de su operador redondea el fondo de otra forma (solidaridad y subsistencia por separado)?
3. **Pensión en la licencia, pactada pero sin autorización del trabajador (P13).** Entendí que el empleador asume el 16 % completo. ¿Es así?
4. **IBC de las vacaciones disfrutadas (P6).** Hoy entran a salud y pensión **por lo que se pagan** (en el caso 16, 1.100.000), que es lo que usted verificó. Su respuesta dice «con el último IBC». ¿Debe ser el IBC del mes anterior a las vacaciones en lugar del valor pagado?
5. **Bonificación salarial habitual en la base de vacaciones (P6 y P22).** Hoy no la incluimos, porque su respuesta nombra solo las comisiones y el recargo nocturno. ¿Debe entrar si es habitual?
6. **Fondo de solidaridad de 2026 en exactamente 20 salarios.** La tabla de hoy (Ley 797) lo cobra al 2 %. El texto dice «superiores a 20» para el 2 %, así que 20 exactos irían al 1,8 %. ¿Lo cambiamos? Solo afecta a quien gane exactamente 20 salarios mínimos.

## 4. Lo que sigue

- **Cuentas contables (C1 a C6):** se están aplicando en paralelo. Le mando el detalle y un asiento de ejemplo en cuanto estén.
- **P19, porcentaje fijo automático:** el sistema todavía no calcula ni guarda solo el porcentaje de junio y diciembre. Hoy se carga a mano por empleado, y sin porcentaje la colilla se bloquea. Es lo siguiente que haremos.
- **Pantallas:** la opción de incapacidad al 100 %, la casilla del embargo y la opción de pensión en la licencia ya funcionan en el servidor. Sus pantallas pasan primero por diseño.
- **Cesantías consignadas al fondo:** no se les aplica retención, como usted indicó, hasta confirmar si el empleador debe retener al consignar.
