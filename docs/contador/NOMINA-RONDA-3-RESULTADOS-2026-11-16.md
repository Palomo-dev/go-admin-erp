# Nómina · Ronda 3: correcciones aplicadas y casos afectados (2026-11-16)

Respuesta a «Nómina · Respuestas del Contador, Ronda 2 (16-nov-2026)»
([RESPUESTAS-CONTADOR-NOMINA-RONDA-2-2026-11-16.md](RESPUESTAS-CONTADOR-NOMINA-RONDA-2-2026-11-16.md)).
**La nómina sigue apagada en todas las empresas.**

Valores 2026: salario mínimo $1.750.905, auxilio $249.095, UVT $52.374. Julio de 2026, mes completo, empleador
exonerado, salvo donde se indica.

## 1. Qué corregimos

| Pedido | Qué hace ahora el sistema |
|---|---|
| **IBC de las vacaciones** (pregunta 4) | Los días de vacaciones disfrutadas y de licencias remuneradas (luto, calamidad y otras) cotizan salud y pensión con el **último IBC reportado** (el del mes anterior), en proporción a los días. Lo pagado por vacaciones sigue siendo base de parafiscales y no es base de ARL. Si la empresa no tiene un mes anterior liquidado en el sistema, usa el salario del día en que empiezan, nunca menos del mínimo. |
| **Regla del 40 %** (P7, de paso) | La remuneración total de la regla del 40 % ya no incluye vacaciones, incapacidades ni licencias. Antes las contaba. |
| **Fondo en dos campos** (pregunta 2) | Solidaridad (0,5 % del IBC) y subsistencia (el resto) se aproximan cada una al múltiplo de $100 superior. Al trabajador se le descuenta su porcentaje exacto. La diferencia la asume el empleador, con la pensión (510570 contra 238030, fondo de pensiones como tercero). |
| **Tramos de 17 a 20 exactos** (pregunta 6) | 2026: 1 % desde 4 y menos de 16; 1,2 % desde 16 hasta 17 inclusive; 1,4 % más de 17 hasta 18; 1,6 % más de 18 hasta 19; 1,8 % más de 19 hasta 20; 2 % más de 20. |
| **Bonificación salarial habitual** (pregunta 5) | Entra al salario ordinario de las vacaciones, al promedio del último año y a la provisión de vacaciones. La ocasional de mera liberalidad o la pactada como no salarial se registra como bonificación no salarial y no entra. |
| **Caso de P6** | El caso tenía el variable de 300.000 del caso 16 y el documento no lo decía. Ahora están los dos: con el variable da 1.100.000 y sin él, 1.000.000. |
| **510569 en el asiento** | El sistema sí registra la salud del empleador. Al asiento de ejemplo le faltó porque la prueba usó una colilla armada a mano. El asiento corregido está en la sección 3. |

## 2. Casos afectados

| # | Resultado |
|---|---|
| 1 | Sin cambio: salud 70.036 (empleador 64), pensión 70.036 (empleador 210.164), ARL 9.200, caja 70.100, neto 1.859.928. Costo del empleador 2.715.816. |
| 4 | Fondo al trabajador 159.332. En la PILA, 79.700 + 79.700 = 159.400; el empleador asume 68 con la pensión, que queda en 1.912.139. |
| 6 | Fondo 875.453. En la PILA, 218.900 + 656.600 = 875.500; el empleador asume 47. |
| 7 | Fondo 70.036. En la PILA, 35.100 + 35.100 = **70.200** (antes 70.100); el empleador asume **164**, y su pensión queda en **840.619** (antes 840.519). |
| 8 | 150.000 + 270.000 = 420.000; sin diferencia. |
| 20 salarios exactos | IBC 35.018.100 × **1,8 %** = 630.325,8 → 630.326 al trabajador. En la PILA, 175.100 + 455.300 = 630.400; el empleador asume 74. |
| 16 | Vacaciones 1.100.000, salario 2.000.000, auxilio 166.063. **Con IBC de junio de 3.300.000: IBC 3.100.000**, salud 124.000. **Con IBC de junio de 3.000.000: IBC 3.000.000**, salud 120.000. Parafiscales sobre 3.100.000 y ARL sobre 2.000.000 en los dos. |
| P6, con variable de 300.000 | Vacaciones (3.000.000 + 300.000) ÷ 30 × 10 = 1.100.000; salario 2.150.000. |
| P6, sin variable | Vacaciones 3.000.000 ÷ 30 × 10 = **1.000.000**; salario 2.150.000. |
| 20 (ajuste) | Pensión +12.000, caja +4.000, ARL +500 (el total nuevo redondeado menos lo ya liquidado), cesantías +8.333, intereses +1.000, prima +8.333 y **vacaciones +4.167** (el bono salarial habitual). Neto 92.000. |
| Regla del 40 % sin vacaciones | Salario 3.000.000 con 10 días de vacaciones y bono no salarial 1.500.000: total 3.500.000, 40 % = 1.400.000, exceso 100.000. IBC 2.000.000 + 100.000 + 1.000.000 = 3.100.000. |

## 3. Cuentas

**Asiento del caso 1, con la colilla real del sistema** (cuadra en 2.715.816):

| Cuenta | Débito | Crédito | Tercero |
|---|---|---|---|
| 510506 sueldos | 1.750.905 | | empleado |
| 510527 auxilio de transporte | 249.095 | | empleado |
| **510569 salud del empleador (redondeo PILA)** | **64** | | empleado |
| 510570 pensión · 510568 ARL · 510572 caja | 210.164 · 9.200 · 70.100 | | empleado |
| 510530 · 510533 · 510536 · 510539 | 166.667 · 20.000 · 166.667 · 72.954 | | empleado |
| **237005 salud** | | **70.100** | EPS |
| 238030 pensión | | 280.200 | fondo de pensiones |
| 237006 ARL · 237010 caja | | 9.200 · 70.100 | ARL · caja |
| 2510 · 2515 · 2520 · 2525 | | 166.667 · 20.000 · 166.667 · 72.954 | empleado |
| 2505 neto | | 1.859.928 | empleado |

Todas las líneas de gasto (5105, 5205 o 7205 según el área) llevan al empleado como tercero, además del centro de costo.

- **Diferencia del fondo:** va con la pensión del empleador, 510570 contra 238030, con el fondo de pensiones como tercero.
- **Incapacidad laboral:** todos sus días van a 138095 con la ARL como tercero. Corregimos también el parámetro: decía que el día 1 lo pagaba el empleador y ahora dice que la ARL paga desde el día 1, así que la colilla y el asiento coinciden.
- **Cesantías al fondo:** la línea de 2510 del fondo conserva en el detalle el nombre y el documento del empleado.
- **Subcuentas que se crean solas,** con sus condiciones:
  - Solo se crean las subcuentas de 6 dígitos que falten, con el código, el nombre y la naturaleza del PUC, y solo si la cuenta de 4 dígitos ya existe.
  - Nunca se sobrescribe nada. Si la empresa ya tiene la cuenta, una auxiliar de movimiento o su propia cuenta para el concepto, se usa la suya.
  - Antes de encender, el sistema prepara una **vista previa**: la lista de cuentas a crear y los terceros incompletos, con quién la preparó y cuándo. La empresa y usted la aprueban por escrito, y queda el registro de quién aprobó.
  - Al encender, las cuentas se crean en el mismo paso, solo si la lista no cambió desde la aprobación y no falta ningún NIT. Crearlas por fuera del encendido está bloqueado.
- **NIT de las entidades:** no cargamos ninguno de memoria. Documentamos las fuentes que usted indicó. El sistema no deja encender una empresa mientras falte el NIT de un tercero.
- **Ajuste anual de provisiones:** ya existe. Es un asiento al 31 de diciembre, por empleado:
  - Lo que sobra en 2510, 2515 y 2520 después de liquidar el año vuelve al gasto.
  - La 2525 se ajusta al valor real de las vacaciones pendientes.
  - Para hacerlo, el período de cesantías del año tiene que estar cerrado.
  - Mientras falte el ajuste, no se puede cerrar ningún período del año siguiente.
  - Prueba: prima con provisión de más, 2520 débito 496.465 contra 510536; vacaciones con saldo 220.555 y valor real 500.000, 510539 débito 279.445 contra 2525.
  - Falta que el sistema calcule solo el valor de las vacaciones pendientes; hoy lo entrega quien hace el ajuste.

## 4. Preguntas

1. **Mes del último IBC en vacaciones largas.** Usamos el IBC del mes anterior al período que se liquida. Si las vacaciones empezaron el mes anterior y siguen en este, la norma pide el IBC del mes anterior al **inicio** del disfrute, que sería dos meses atrás. ¿Basta con avisar en la colilla, o debe tomarse ese mes exacto?
2. **Fondo desde abril de 2027.** La Ley 2381 cambia las tarifas. Para el reparto entre los campos 51 y 52, ¿la solidaridad sigue siendo el 0,5 % y la subsistencia el resto? Mientras usted lo confirma, la tabla de 2027 se redondea como un solo valor.
3. **Jornada parcial con cotización por semanas (P2, Decreto 2616 de 2013).** Queda fuera de la regla del divisor. Hoy el sistema no tiene esa modalidad: esos empleados no se pueden liquidar todavía. ¿Basta con que lo digamos así, o necesita que lo bloqueemos explícitamente?

## 5. Antes de encender

- **Cargar los NIT de las entidades** desde las fuentes oficiales que usted indicó, con el RUT como fuente definitiva. No pondremos ninguno de memoria. Es bloqueante.
- **El ajuste anual de provisiones** debe estar listo antes del primer cierre anual de cualquier empresa encendida.
- **P19** (el porcentaje fijo automático): sigue el bloqueo de la colilla mientras tanto.
