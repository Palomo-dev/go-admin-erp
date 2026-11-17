# Nómina · Ronda 4: lo que cambió (2026-11-16)

Respuesta a «Nómina · Respuestas del Contador, Ronda 3 (16-nov-2026)»
([RESPUESTAS-CONTADOR-NOMINA-RONDA-3-2026-11-16.md](RESPUESTAS-CONTADOR-NOMINA-RONDA-3-2026-11-16.md)).
**La nómina sigue apagada en todas las empresas.**

## 1. Sus tres preguntas

1. **Vacaciones que cruzan de mes.** Corregido. Cada ausencia cotiza con el IBC del mes anterior a **su inicio**,
   aunque sea de dos meses atrás. Aplica a vacaciones y licencias, remuneradas o no. El sistema guarda el IBC de cada
   mes con nómina cerrada.
   - **Ejemplo:** vacaciones del 20-jul al 10-ago. En agosto, los 10 días cotizan con el IBC de **junio**
     (3.300.000 × 10 ÷ 30 = 1.100.000), no con el de julio.
   - **Si la empresa no tiene ese mes en el sistema** (por ejemplo, porque empezó a liquidar aquí después), usa el
     salario del primer día y lo deja advertido en la colilla. Es el único caso en que la colilla solo avisa.
2. **Fondo desde abril de 2027.** Mientras no se cargue el reparto entre los campos 51 y 52 del anexo técnico, el
   fondo se redondea como un solo valor y **el cierre queda bloqueado**. Así nadie liquida abril de 2027 sin revisarlo.
3. **Jornada parcial con cotización por semanas.** Se marca en los datos de nómina del empleado. La colilla sale con
   el aviso «cotización por semanas no soportada» y **no se puede cerrar**.

## 2. Ajuste anual de provisiones

- **Año abierto o cerrado.** Lo decide el período contable del 31 de diciembre de ese año.
  - Si está abierto, el ajuste se fecha el 31-dic y el sobrante vuelve al gasto de ese año.
  - Si está cerrado, el ajuste se fecha el día en que se hace, y el sobrante va a **425050** «Reintegro de otros costos
    y gastos». Un faltante de un año cerrado va al gasto del año en curso.
  - El saldo de la provisión siempre se mide hasta el 31-dic.
  - Usamos el período contable y no la fecha en que se hace el ajuste porque el ajuste siempre se hace después del
    31-dic: es cuando se cierra el período de cesantías. Con la fecha al pie de la letra, el sobrante casi nunca
    volvería al gasto del año.
- **La 425050** entra a la vista previa del plan de cuentas como las demás: se crea al encender si falta.
- **Soporte de las vacaciones.** Por cada empleado, el ajuste exige los días pendientes, el salario usado y el valor.
  - Si falta un dato, se rechaza.
  - También se rechaza si el valor no coincide con días × salario ÷ 30.
  - Todo queda guardado para auditoría.
- **Prueba de 2025** (provisiones del caso 1 más un período de cesantías de prueba; 10 días pendientes = 583.635,
  contra una provisión de 72.954):

| Escenario | Fecha | Sobrantes de cesantías, intereses y prima | Faltante de vacaciones (510.681) |
|---|---|---|---|
| Año abierto | 31-dic-2025 | Vuelven al gasto: 510530, 510533, 510536 | 510539 contra 2525 |
| Año cerrado | Fecha del ajuste | A **425050** | 510539 contra 2525 |

## 3. Siguiente paso

Quedan los tres bloqueantes que usted confirmó:

1. Cargar los NIT de las entidades desde las fuentes oficiales.
2. La vista previa de cuentas de cada empresa.
3. Su visto bueno por escrito, empresa por empresa.

Además, haremos que el sistema calcule solo las vacaciones pendientes al 31-dic (días y salario) y P19.
