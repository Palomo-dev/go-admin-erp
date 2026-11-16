# ADR-003 · Recursos humanos, fase 3: nómina

- **Fecha:** 2026-11-16.
- **Estado:** backend aplicado y probado. **La nómina queda apagada en todas las organizaciones** (`hr_payroll_enabled = false`): se puede preliquidar, no cerrar ni pagar. Se enciende después de la ronda del Contador (`docs/contador/PREGUNTAS-CONTADOR-NOMINA-2026-11-16.md`).
- **Alcance:** solo backend: esquema, funciones, RLS, motor, servicios, route handlers y pruebas. **No hay pantallas nuevas**: el diseño va por Figma y entra cuando el dueño lo apruebe.
- **Insumos:** `AUDITORIA-HRM-2026-11-14.md` (§1.7, §2, §3, §5; riesgos R1, R3, R8, R11), `INVESTIGACION-NORMATIVA-CO-2026-11-14.md` (§2, §3, §4, §11, §12), ADR-001, ADR-002 y el esquema real consultado por el MCP en `taqjemqjtumhwptchcxk` el mismo día.

## 0. Lo que encontré en la base antes de diseñar

| Hecho | Consecuencia |
|---|---|
| `payroll_periods`, `payroll_runs`, `payroll_slips` y `payroll_items` tienen **0 filas**. `payroll_periods.status` ya admite `open`, `calculating`, `calculated`, `reviewing`, `approved`, `paying`, `paid`, `closed`, `cancelled`. | Se reutilizan. Los seis estados pedidos se mapean a los existentes (§1), sin tocar el `CHECK`. |
| `payroll_runs` tiene `run_number`, `is_final` y `superseded_by`; `fn_nomina_run_vigente(periodo)` elige la versión por `is_final` y luego `run_number`. | Cada cálculo es un run inmutable; recalcular crea otro y reemplaza al anterior (`superseded_by`). Al cerrar, el run queda `is_final`. |
| `fn_trg_nomina_colilla_deducciones` y `fn_trg_nomina_periodo_bloquear_cierre` exigen retención y préstamo no nulos para aprobar; `fn_nomina_fijar_deduccion` los fija a mano. | Se conservan. El motor siempre los llena (0 si no hay), así que no bloquean. Las colillas del motor no se editan (§3). |
| `fn_auto_journal_payroll` asienta al aprobar y al pagar con `fact_key` y bandeja de fallos, pero con **`min(branch_id)`** (R8), todo el devengo a una sola cuenta de gasto y todo el crédito a «nómina por pagar» (incluidos aportes y provisiones). | Se corrige la sede y, para las colillas del motor, el asiento sale **por concepto** con su cuenta (§5). Las colillas viejas siguen igual, salvo la sede. |
| La cuota de préstamo pagada se asienta como recaudo en caja (`installment/paid`: 1105 contra 1365). | Descontada por nómina, la contaría dos veces. El trigger ahora la salta cuando la cuota trae `payroll_slip_id` (la asienta la colilla). |
| `payments` lo lee **cualquier miembro** de la organización. | Un pago por colilla expondría el neto de cada empleado. Se registra **un egreso por período** (§5). |
| `fn_retencion_art383` tiene la tabla escrita en el SQL y redondea al peso; `fiscal_uvt` tiene la UVT de 2026. `retencion_art383_tabla` está cargada como parámetro por vigencia. | La retención la calcula el motor con la tabla del parámetro y la UVT de `fn_hr_parametro_tramos` (§2.6). `fn_retencion_art383` no se usa ni se toca. |
| `fn_comisiones_pagar_por_nomina` exige `auth.uid()` y lee `metadata->'commission_ids'`. | El motor guarda los ids en `metadata.comision_ids`; la migración 04 hace que la función lea las dos claves. El servicio la llama con la sesión del usuario después de pagar (§5). |
| `fn_hr_jornada_para_nomina` agrupa las horas por categoría, recargo y divisor, **sin fecha**. | Se le agrega la clave `horas_dia` (aditiva): cada hora se valora con el salario de su día. |
| El SMMLV de 2026 tiene dos tramos (`suspendido` hasta el 18-feb y `transitorio` desde el 19-feb) y el de 2027 está `por_confirmar`. | El motor usa ambos tramos de 2026 y falla con lo `por_confirmar`: la colilla queda bloqueada, nunca con un valor inventado. |

## 1. Las cinco decisiones principales

1. **Modelo: se reutiliza el esqueleto y se agrega lo que faltaba.** Estados del período sobre el `CHECK` existente: abierto = `open`; preliquidado = `calculated`; en revisión = `reviewing`; cerrado = `approved`; pagado = `paid`; contabilizado = `closed`. Cada cálculo es un `payroll_run` **inmutable** con `engine_version`, `input_hash` y `parameters_snapshot` (los parámetros y conceptos con que se calculó). Se agregan el catálogo de conceptos, los ajustes de nómina por vínculo, las novedades de nómina, los embargos y la bandera por organización.
2. **Motor en TypeScript puro + RPC transaccional que guarda**, como `motorHoras` de la fase 2 (§2).
3. **Nada se edita después de calcular.** Un trigger rechaza cambios a colillas, ítems y runs del motor fuera de las RPC. Antes del cierre se corrige **recalculando** (nueva versión que reemplaza a la anterior); después, con un **ajuste con motivo** que se calcula con las reglas del cierre (§4).
4. **Pago y contabilidad por los caminos que ya existen.** Un egreso por período en `payments` (Tesorería) y los asientos por los triggers `fn_auto_journal_payroll*`, ahora en la sede del empleado y por concepto (§5).
5. **Bandera `hr_payroll_enabled` por organización, apagada.** Con ella apagada la base solo deja preliquidar; cerrar, pagar y ajustar responden 55000 `nomina_no_habilitada`. Solo la service role la enciende (`fn_hr_nomina_habilitar`), después de la ronda del Contador.

## 2. El motor

### Por qué TypeScript y no SQL

- **Pruebas en el repositorio**, con casos que un contador puede verificar a mano, en las seis zonas de `test:tz-all` (`src/__tests__/timezone/motorNominaHrm.test.ts`). En SQL solo existirían como bloques que se deshacen en el MCP.
- **Un solo código** para preliquidar, ajustar y, después, simular en la pantalla.
- **Es puro de verdad:** no lee la base, el reloj ni el TZ del proceso. Opera días calendario (`date`) con aritmética en UTC. Ningún valor legal está escrito en el código: todo llega por tramos de vigencia.
- **Lo que se pierde** (un trigger no puede llamarlo) se compensa con la RPC que guarda: revisa el cuadre de cada colilla (neto = devengado − deducciones, ítem por ítem, todo en pesos enteros), la organización de cada vínculo y la sede.

### Entradas (`fn_hr_nomina_insumos`, solo `service_role`, exige `hr.payroll.process`)

- **Salario por tramos** del historial con fecha de efecto (`fn_hr_nomina_salario_tramos`, sin depender de la sesión) y su periodicidad.
- **Horas por día**, descuentos de tiempo, ausencias con sus tramos de pago (`fn_hr_jornada_para_nomina`).
- **Parámetros por tramos** de los 38 códigos que usa el motor (`fn_hr_parametro_tramos`), incluida la UVT por año gravable.
- Catálogo de conceptos resuelto (`fn_hr_nomina_conceptos`: la fila de la organización gana a la de plataforma).
- Novedades aprobadas, comisiones causadas (sin las que ya están en otro período sin pagar), cuotas de préstamo vencidas, embargos activos, lo ya liquidado en el mes (quincena anterior), el período anterior y el promedio variable de 12 meses.
- **Registro de accesos:** una fila por vínculo en `hr_access_log` (grupo `salario_pago`).

### Qué calcula (`src/lib/hrm/nomina/motorNomina.ts`)

1. **Devengados, día por día** con el salario de cada fecha, en base 360 (el 31 no cuenta; el último día de febrero completa el mes). Vacaciones, incapacidades y licencias pagan sus días con su fracción y su piso (SMMLV diario), separadas por quién paga (para el recobro).
2. **Horas:** la ordinaria va con el salario y solo se paga su recargo; la extra se paga completa (1 + recargo); el valor hora es el salario del día ÷ el divisor del día. Con salario por hora se paga toda hora. El salario integral no paga recargos (CST 132).
3. **Auxilio de transporte** por días trabajados si el salario no pasa de 2 SMMLV; fuera del IBC.
4. **IBC:** base salarial (× 70 % en el integral) + el exceso de lo no salarial sobre el 40 % de la remuneración (Ley 1393, art. 30); piso de 1 SMMLV y techo de 25 SMMLV prorrateados por los días cotizados (sin las licencias no remuneradas), con el SMMLV de cada día; al peso superior.
5. **Aportes:** salud y pensión del trabajador y del empleador, **FSP** por la tabla vigente al corte (≥ 4 SMMLV), **ARL** por la clase del cargo o sede (`fn_hr_clase_arl`), **caja, ICBF y SENA** sobre la «nómina de salarios» (sin tope de 25 SMMLV ni regla del 40 %). **Exoneración 114-1:** bandera de la empresa (`exoneracion_114_1_aplica`) y devengado del mes < 10 SMMLV; nunca al integral. Sin bandera configurada no se exonera y se avisa.
6. **Retención en la fuente** (`retencion.ts`): mensual, en el período que cierra el mes y con lo de todo el mes. Depuración: INCR → dependientes, medicina prepagada, intereses de vivienda → AFC/FVP (30 % y 3.800 UVT/12) → 25 % exento (790 UVT/12) → límite del 40 % y 1.340 UVT/12. Procedimiento 1 (tabla del art. 383) o 2 (porcentaje fijo; `porcentajeFijoProcedimiento2` lo calcula). Redondeo con `retencion_redondeo_cop`.
7. **Embargos y préstamos** (`deducciones.ts`): alimentos → cooperativas → ordinarios por fecha de recibo; todos juntos hasta el 50 % del salario menos deducciones de ley, y los ordinarios además hasta 1/5 del excedente del SMMLV; préstamos con su `max_deduction_pct` y el piso de libranza (el trabajador conserva el 50 %). Lo que no cabe queda en alerta.
8. **Provisiones:** cesantías y prima (1/12 de la base prestacional, con auxilio), intereses (12 % de la provisión de cesantías) y vacaciones (15/360 del salario ordinario). El integral solo provisiona vacaciones.
9. **Prima y cesantías** (períodos de tipo `prima` y `cesantias`): base = salario (promedio si cambió en los últimos 3 meses) + promedio variable + auxilio; × días / 360. Las cesantías quedan como ítem informativo «por consignar al fondo» y los intereses se pagan al trabajador; su parte exenta sale de `cesantias_exenta_tabla` (art. 206 num. 4).
10. **Alertas** contra el período anterior con el umbral `nomina_alerta_variacion_pct` (10 % por defecto, la empresa lo cambia), y **bloqueos**: novedades pendientes, días no listos, parámetro faltante, integral por debajo de 13 SMMLV, procedimiento 2 sin porcentaje, neto negativo.

### Redondeo explícito

Cada valor en pesos se redondea **al crearse**: al peso (mitad hacia arriba); el IBC al peso superior; la retención al múltiplo de 1.000. Los totales son sumas de valores ya redondeados, así que colilla, asiento y nómina electrónica cuadran.

### Idempotencia y vigencias

- La huella de la entrada (FNV de 64 bits sobre la entrada estable + versión del motor) es la versión. La RPC devuelve el run existente si la huella no cambió (`reutilizado`), con un índice único parcial que lo garantiza.
- Un período que cruza un cambio de vigencia usa el valor de cada fecha: tarifas ponderadas por días, SMMLV día por día en los topes, salario y divisor por día en las horas.

## 3. Preliquidación y control

- **Preliquidar** (`fn_hr_nomina_guardar`): período `open`, `calculated` o `reviewing`; si estaba en revisión, cancela la aprobación en curso y vuelve a «preliquidado».
- **Bloqueos de cierre** (`fn_hr_nomina_bloqueos`, en la base, no en el TS): sin preliquidación; bloqueos del motor; novedades de nómina pendientes; novedades aprobadas o anuladas **después** del cálculo (hay que recalcular); novedades de asistencia pendientes; días no listos; revisión sin aprobar; SMMLV o UVT del año sin confirmar.
- **Revisión** (`fn_hr_nomina_enviar_revision`): con una regla `cierre_nomina` activa, el motor de aprobaciones de la fase 0 decide; la aprobación solo marca el período («la decisión no mueve dinero ni asientos») y el cierre es un paso explícito. Rechazada, vuelve a «preliquidado».
- **Cierre** (`fn_hr_nomina_cerrar`, `hr.payroll.close` y bandera encendida): marca el run `is_final`, aprueba las colillas (asiento de devengo), paga las cuotas de préstamo descontadas y suma lo aplicado a cada embargo.
- **Inmutable:** `trg_hr_nomina_inmutable` en `payroll_slips`, `payroll_items` y `payroll_runs` rechaza (42501) todo cambio a lo del motor fuera de las RPC (`app.nomina_motor`).
- **Ajuste** (`fn_hr_nomina_ajuste_insumos` → motor → `fn_hr_nomina_ajuste_guardar`): solo en períodos cerrados, con motivo obligatorio. El TS recalcula la colilla con su **entrada guardada** y los **parámetros del cierre** más las novedades del ajuste y guarda la diferencia por concepto en un run `ajuste` que copia el `parameters_snapshot` del run final **en la base** (no confía en el que manda el cliente). Se cierra con `fn_hr_nomina_ajuste_cerrar` y se paga con el período.

## 4. Novedades, embargos y datos por vínculo

- **`hr_payroll_novelties`:** bonos, auxilios, retroactivos, vacaciones compensadas (por días), libranzas y otros descuentos. Los conceptos que calcula el motor se rechazan. Con regla `novedad_nomina`, quedan pendientes en el motor de aprobaciones; sin regla, las registra aprobadas quien procesa la nómina (como el historial de la fase 0).
- **`hr_garnishments`** y **`hr_payroll_employee_settings`** (salario integral, procedimiento, porcentaje fijo y depuración, con fecha de efecto): grupo `salario_pago`, **sin políticas**; se escriben solo por RPC con registro de accesos.
- **`hr_payroll_concepts`:** catálogo de plataforma (47 conceptos) + conceptos propios de la organización. La organización no puede cambiar la naturaleza (salarial, IBC, 40 %, prestacional, retención, parafiscales) de un concepto de sistema: solo sus cuentas (`trg_hr_payroll_concepts_validar`).

## 5. Pago, archivo del banco y contabilidad

- **Pagar** (`fn_hr_nomina_pagar`, `hr.payroll.pay` y bandera): un registro en `payments` por período (`source = 'payroll_period'`, método transferencia, cuenta bancaria de la organización, clave de idempotencia por colillas). `fn_auto_journal_payment` no lo asienta (fuente desconocida para él) y `fn_recibo_serie_pago` le da comprobante de egreso (**CE**), como al pago a proveedores. Las colillas pasan a `paid` y su trigger asienta nómina por pagar contra el banco (`fn_money_account_code_pago`). No se escribe ningún saldo a mano.
- **Comisiones:** después de pagar, el servicio llama `fn_comisiones_pagar_por_nomina` por colilla con la sesión del usuario; si una falla se informa y se reintenta (solo pasa de `accrued` a `paid`).
- **Archivo del banco** (`src/lib/hrm/nomina/archivoBanco.ts`): interfaz `AdaptadorBanco` y el formato `csv_generico` validado (cuenta, tipo de cuenta, documento, valor entero; protección contra fórmulas). Con una fila mala no hay archivo. Los datos los da `fn_hr_nomina_archivo_banco`, que exige ver cuentas bancarias y deja una fila `exportar` por persona.
- **Asiento por concepto** (`fn_hr_nomina_asentar`, llamado por `fn_auto_journal_payroll` para las colillas del motor): cada devengado al débito de su cuenta; cada deducción al crédito de la suya; aportes y provisiones débito-gasto y crédito-pasivo; el neto a nómina por pagar (`fn_cuenta_por_clave('nomina_por_pagar')`). Cuentas inexistentes o de título, descuadre o período contable cerrado van a la bandeja de fallos, sin asiento parcial. Fecha del devengo: el último día del período a mediodía en la zona de la organización. Centro de costo del vínculo en las líneas de gasto.
- **R8:** la sede del asiento es la de la colilla (sede del empleado al corte) → la del vínculo → la sede principal; ya no la de menor id. También en `fn_auto_journal_payroll_period`, que además no asienta nada para los períodos del motor (lo hacen las colillas; los aportes se pagan por la PILA en la fase 4).
- **Contabilizado** (`fn_hr_nomina_contabilizar`): pasa a `closed` solo si cada colilla tiene sus asientos de devengo y de pago; si no, devuelve cuáles faltan y el motivo de la bandeja. **No se toca ningún asiento publicado.**

### Cuentas del Contador (C1–C6, respuesta del 2026-11-16)

Migraciones `20261116223758_hrm_f3_05_nomina_cuentas_contador`, `20261116223844_hrm_f3_06_nomina_embargo_fusion` y
`20261116224159_hrm_f3_07_nomina_preparar_plan_areas` (reversiones en `supabase/rollbacks/`). Prueba:
`src/__tests__/timezone/nominaCatalogoConceptos.test.ts`.

- **C1 · Cuentas por concepto** (semilla de plataforma = `conceptos.ts`; las filas de una empresa no se tocan):
  sueldos, horas ordinarias, retroactivo y licencia remunerada 510506 (la licencia remunerada es tiempo pagado por el
  empleador: sueldo); salario integral 510503; horas extra y recargos 510515; comisiones 510518; bonificaciones
  510548; auxilio de transporte 510527; auxilios no salariales 510545; incapacidad a cargo del empleador 510524;
  maternidad y paternidad, la parte que no paga la EPS, 510595 (otros: no es incapacidad ni sueldo). Lo que paga la
  EPS, la ARL o el fondo (ítem con `detalle.paga` = eps, arl o fondo_pensiones, también licencias) va a 138095 con la
  entidad (concepto `INCAPACIDAD_POR_COBRAR`, informativo, sobrescribible). Salud 237005; pensión del trabajador y del
  empleador y fondo de solidaridad 238030; ARL 237006; caja, ICBF y SENA 237010; retención 236505; embargos 237025;
  libranzas 237030; sindicato 237035; cooperativa 237040; fondo de empleados 237045; otros 237095 (conceptos nuevos
  `CUOTA_SINDICAL` «Sindicatos», `APORTE_COOPERATIVA` «Cooperativa», `FONDO_EMPLEADOS` sin elemento DIAN); préstamos
  136595, o por `employee_loans.loan_type`: housing 136505, vehicle 136510, education 136515, calamity 136525 (no hay
  tipo «salud»: 136520 queda sin uso). Aportes 510568–510578; provisiones 510530/33/36/39 contra 2510–2525 cada mes.
  Cesantías del año (`CESANTIAS_CONSIGNAR`): 2510 del empleado a 2510 del fondo de cesantías. Neto: la clave
  `nomina_por_pagar` o, sin ella, la cuenta de movimiento bajo 2505 (hoy 25050501).
- **Cuentas que no existen.** En la base, 0 de 40 planes tienen las subcuentas (todas tienen 5105, 2370, 2380, 1365 y
  1380 de movimiento; 2365/236505 y 2505/250505 de título con auxiliar). `fn_hr_nomina_cuenta` resuelve cada código a
  su cuenta de movimiento (la misma, la sucesora del plan o la primera de movimiento por debajo: 236505 → 23650501,
  510506 → 51050601); si no hay, el asiento entero va a rechazos, sin bajar a la cuenta de arriba.
  Las que faltan se crean solo al encender, con las condiciones del Contador (ronda 3, migración
  `20261116232134_hrm_f3_09_nomina_ronda3_cuentas`):
  (a) solo subcuentas PUC de 6 dígitos que falten, con el código y el nombre de `puc_catalogo` (5205xx y 7205xx con el
  nombre de la 5105xx homóloga), de movimiento, debajo de la cuenta de 4 dígitos que ya existe y con la naturaleza de
  su clase (`fn_puc_asegurar_cuenta`; 5105 sigue siendo de movimiento). Sin la cuenta de 4 dígitos no se crea nada
  (`falta_cuenta_mayor`). (b) Nunca se sobrescribe ni se duplica: si el código existe, o tiene una auxiliar de
  movimiento, o la empresa puso su propia cuenta en el concepto (fila suya en `hr_payroll_concepts`), se usa la suya;
  un código que existe sin cuenta de movimiento queda `no_se_crea` y bloquea. (c) La plataforma registra la vista
  previa (`fn_hr_nomina_plan_vista_previa(org, preparada_por)` → `hr_payroll_enablement_reviews`: lista de cuentas a
  crear, terceros incompletos, quién y cuándo), la empresa la ve con `hr.payroll.view`, y se aprueba con
  `fn_hr_nomina_plan_aprobar(vista, empresa_por, contador_por, referencia_de_la_aprobacion_escrita)`. (d)
  `fn_hr_nomina_habilitar(org, true, motivo)` exige esa aprobación, la misma lista (huella), cero bloqueos y cero
  terceros incompletos, y en la misma transacción crea las cuentas, marca la vista `aplicada` y enciende.
  `fn_hr_nomina_preparar_plan(org, true)` fuera de `fn_hr_nomina_habilitar` falla (`plan_solo_al_encender`). Vista
  previa hoy: 35 cuentas por empresa.
- **C2 · Área.** Sale de `cost_centers.type` (administracion, ventas, operacion; la siembra de centros ya lo trae) del
  centro de costo vigente del empleado al corte (evento «centro_costo»), o del de su área (departamento), o del padre
  del centro. Sin nada: administración. 5105xx → 5205xx (ventas) o 7205xx (operación o producción), con el centro de
  costo en la línea. Sin columnas nuevas. La preparación del plan crea las variantes de todas las áreas en uso.
- **C3 · Terceros.** Cada línea de 1365, 1380, 2365, 2370, 2380, 2505 y 2510–2525 lleva `tercero_nit` y
  `tercero_nombre`: entidad vigente de la ficha (eps, afp, arl, ccf, cesantías en `hr_employment_events` →
  `hr_ss_entities`), ICBF, SENA y DIAN (NIT sin dígito de verificación), demandante o juzgado
  (`hr_garnishments.beneficiary_doc` nueva, `beneficiary`, `court_reference`), entidad del descuento
  (`hr_payroll_novelties.tercero_nit` / `tercero_nombre` nuevas; `fn_hr_nomina_novedad_tercero` las completa aun con el
  período cerrado) o el empleado (documento de `hr_people_identification`). **Criterio:** si falta el tercero o su NIT,
  el asiento entero va a rechazos (`tercero_requerido`), no se asienta con aviso: una línea publicada es inmutable y
  una línea sin NIT no concilia con la PILA ni sirve para la exógena. El rechazo se reintenta en
  `fn_hr_nomina_contabilizar`. Las líneas de gasto (5105, 5205, 7205) llevan al empleado de tercero (ronda 3), y la
  línea de 2510 del fondo de cesantías lleva en su detalle el nombre y el documento del empleado.
- **NIT de las entidades: bloqueante para encender.** Hoy ninguna fila de `hr_ss_entities` tiene NIT, y no se cargan
  ni se infieren desde el código: los carga la plataforma, verificados, con la fuente en `verificacion`/`notes`.
  Fuentes oficiales: los códigos de administradoras de la PILA del Ministerio de Salud y Protección Social (EPS, AFP,
  ARL, CCF y fondos de cesantías, con su NIT); Superintendencia Nacional de Salud (EPS); Superintendencia Financiera
  (AFP, fondos de cesantías y ARL); Superintendencia del Subsidio Familiar (cajas de compensación); y como fuente
  definitiva el RUT de la DIAN (consulta del estado del RUT con el NIT y el dígito de verificación). Mientras falte el
  NIT de una entidad que tenga un empleado activo, `fn_hr_nomina_habilitar` no enciende (`terceros_incompletos`) y el
  asiento iría a rechazos.
- **Incapacidad laboral (ronda 3):** la paga la ARL desde el día 1: todo ítem `INCAPACIDAD_LABORAL` va a 138095 con
  la ARL, diga lo que diga `detalle.paga`. Ojo: el parámetro `incapacidad_tramos` (2026) trae para `laboral` el día 1
  con `paga = 'empleador'` y del día 2 en adelante `arl`; el motor paga igual (fracción 1), así que el valor no cambia,
  pero el parámetro debe corregirse para que la colilla y la PILA digan lo mismo (lo decide quien lleva el motor).
- **C4** sin cambios. **C6:** `fn_auto_journal_payroll_period` ya no deja el rechazo `criterio_contador`.
- **C5 · Provisión que no alcanza.** Saldo de la cuenta de la provisión con el NIT del empleado hasta la fecha del
  asiento (`journal_lines`), más lo que provisiona el mismo asiento; el faltante va al gasto de la provisión (por área)
  y solo el resto consume el pasivo. Fuente contable y no la suma de colillas: recoge ajustes manuales y reversiones.
  Requiere cerrar el período ordinario antes que el de prima del mismo mes.
- **C5 · Ajuste anual (ronda 3).** `fn_hr_nomina_ajuste_anual_provisiones(actor, org, año, vacaciones)` asienta al
  31-dic (23:00 de la zona de la empresa) un solo asiento por empresa y año, registrado en
  `hr_payroll_year_adjustments`. Exige el período de cesantías del año cerrado y ningún período del año abierto. Con el
  año liquidado (cesantías pasadas al fondo, intereses y prima de diciembre pagados, y el faltante ya llevado al gasto
  por C5), el valor real de 2510, 2515 y 2520 del empleado es 0: lo que quede con su NIT es provisión de más y vuelve
  al gasto del mismo año. 2525 se ajusta al valor de las vacaciones pendientes que manda quien llama
  (`{vinculo_id: valor}`, obligatorio para todo vínculo activo o con saldo); ese valor lo debe calcular el motor (días
  pendientes × base de P6/P22). **Bloqueo:** `trg_hr_nomina_exigir_ajuste_anual` impide cerrar cualquier período que
  termine en el año siguiente de una empresa encendida que tuvo nómina cerrada ese año, si no hay ajuste.
- **Pendiente:** el cálculo del valor de las vacaciones pendientes al 31-dic en el motor y su paso a la RPC del
  ajuste; la liquidación de contrato (un retiro sin liquidar dejaría su saldo en el ajuste); pérdida de la incapacidad
  que la EPS no reconoce (138095 → gasto, manual); carga de los NIT; pantallas de la vista previa del encendido y del
  tercero de descuentos y embargos (Figma primero); tipo de préstamo «salud» (136520).

## 6. Permisos y RLS

- Códigos: `hr.payroll.view` y `.process` existían; se crean **`hr.payroll.close`** y **`hr.payroll.pay`** (roles 1 y 2, como datos). Los datos por vínculo, embargos y la lectura del período exigen además el grupo `salario_pago`; el archivo del banco, el grupo `banco`.
- Todas las RPC con `p_actor` son `SECURITY DEFINER`, `search_path` fijo y **solo `service_role`**. Las rutas pasan el actor de `getServerOrgContext()` (`withOrg` + `readOrgBody`; un body con otra organización responde 403).
- **El empleado ve SOLO sus colillas cerradas:** las políticas de `payroll_slips` y `payroll_items` usan `IN (SELECT fn_hr_nomina_mis_colillas())` (colilla propia, aprobada o pagada, de un período cerrado y de la versión final o un ajuste). Ya no ve una colilla aprobada a mano de un período abierto.
- Políticas con `IN (SELECT …)` y `(select auth.uid())` dentro de las funciones; ningún `EXISTS` anidado.

## 7. Lo que se retira

- **`payrollCalculationService.ts`** (navegador, error ×100): queda sin uso y marcado `@deprecated`. Lo usaban `src/app/app/hrm/nomina/page.tsx` y `src/app/app/hrm/nomina/periodos/[id]/page.tsx`; su botón «Calcular» ahora preliquida en el servidor (`preliquidarCliente.ts`). Esas pantallas se reemplazan con el diseño nuevo.
- `fn_retencion_art383` y `country_payroll_rules`: no se usan en la nómina nueva; no se tocan.

## 8. Migraciones aplicadas por el MCP

Cada una con su `.sql` (md5 igual al de `schema_migrations`) y su reversión en `supabase/rollbacks/`. Antes de aplicar hubo prueba en seco en un `DO` que termina en `raise` (la 01 y la 02 con sus funciones nuevas; la 03 con los cuerpos que mueven dinero y asientos; la 04 completa). La 01 se aplicó con el sello provisional 20261116100000 en el comentario de reversión; el archivo conserva ese texto para que el md5 coincida.

| Versión | Nombre | Qué hace |
|---|---|---|
| 20261116072851 | `hrm_f3_01_nomina_modelo` | Permisos `close`/`pay`; 4 parámetros; `hr_payroll_settings` + `fn_hr_nomina_habilitar`; catálogo de conceptos (47) y su validación; ajustes por vínculo; novedades; embargos; columnas nuevas de `payroll_*`; índice de idempotencia |
| 20261116073811 | `hrm_f3_02_nomina_motor` | `horas_dia` en la jornada; salario por tramos; insumos con registro; inmutabilidad; guardar idempotente; crear período; datos por vínculo; embargos; novedades; lectura del período |
| 20261116074847 | `hrm_f3_03_nomina_cierre_pago` | Consecuencias en el motor de aprobaciones; bloqueos; revisión; cierre; pago y serie CE; asiento por concepto y R8; cuota de préstamo sin doble asiento; contabilizado; ajustes; archivo del banco; colillas del empleado |
| 20261116140433 | `hrm_f3_04_nomina_comisiones` | `fn_comisiones_pagar_por_nomina` lee también `metadata.comision_ids` (probado: la comisión pasa a pagada); `fn_hr_nomina_habilitada` sale de `authenticated` |

## 9. Verificación

- **Motor (Jest, 34 casos, seis zonas):** mínimo con auxilio (neto 1.859.928), comisiones (IBC 3.500.000), integral (IBC 15.933.236, retención 3.330.000), no salarial sobre el 40 % (IBC 2.400.000), tope de 25 SMMLV (43.772.625; FSP 2 %), FSP en 4 SMMLV exactos (70.036) y en 17,1 SMMLV (1,4 %), exoneración sí y no (salud empleador 148.827), retención con dependientes (209.000; sin ellos 351.000), límite del 40 %, procedimiento 2, embargo por alimentos + préstamo (828.000 + 801.095, neto 1.380.000), embargo ordinario (1/5 del excedente = 249.819), incapacidad por tramos (116.727 + 175.091), horas extra con divisor 220 y 210, período que cruza el 1-jul-2026 (500.000 de salario y 130.182 de recargos), SMMLV 2027 por confirmar, retención quincenal, prima (1.174.548; con aumento 1.074.548), cesantías e intereses (2.249.095 y 269.891), vacaciones disfrutadas y compensadas, idempotencia, ajuste y catálogo = semilla de la migración.
- **Servicios y rutas (Jest, 15 casos):** actor y organización de la sesión, body ajeno → 403 sin tocar la base, período cerrado → 409, bandera apagada → 409, pago con comisiones, ajuste con las reglas del cierre aunque cambien las de hoy, archivo del banco.
- **Base (MCP, transacciones que se deshacen, organización de prueba con dos vínculos):** idempotencia (`reutilizado`), versión reemplazada, colilla e ítems inmutables (42501), descuadre rechazado, período cerrado no recalcula (55000), otra organización 42501, concepto calculado rechazado como novedad, cierre sin bandera 55000, revisión pendiente bloquea y aprobada deja cerrar, asiento en la sede del empleado y cuadrado (5105 2.376.776 = 2370 350.181 + 2520 166.667 + 25050501 1.859.928), cuota de préstamo pagada por la nómina sin asiento de caja y con crédito 1365, ajuste con motivo y con el snapshot del cierre, pago CE-0001 por el total, contabilizado, el empleado ve solo su colilla cerrada.
- **Advisors:** ninguna función nueva ejecutable por `anon`. `rls_enabled_no_policy` en `hr_garnishments` y `hr_payroll_employee_settings` es a propósito (solo RPC). `authenticated_security_definer_function_executable` en `fn_hr_nomina_mis_colillas` es a propósito (la usan las políticas). `fn_hr_nomina_habilitada` salió de `authenticated` en la migración 04.
- `CURRENT_DATE`: 0 funciones (`scripts/verificar-current-date-en-postgres.mjs`).

## 10. Pendiente

- **Ronda del Contador** antes de encender la bandera: decisiones de §2, cuentas PUC (hoy van a las cuentas que existen en los planes: 5105, 2370, 2380, 23650501, 25050501, 2510–2525, 1365) y los valores [S].
- **Interfaz** (después de Figma): períodos y su ciclo, colilla con sus ítems y alertas, novedades, embargos y datos por vínculo, revisión, pago con elección de cuenta y archivo del banco, colillas del empleado en el portal, conceptos propios y sus cuentas, umbral de alertas en «Lo que define tu empresa», etiquetas de los tipos de aprobación `novedad_nomina` y `cierre_nomina` en los 4 idiomas.
- **Fase 4:** nómina electrónica (el catálogo ya trae el elemento DIAN de cada concepto) y PILA (pago de aportes y su asiento; hoy los aportes quedan en 2370).
- Liquidación de contrato (indemnización, CST 64) y auxilio de conectividad de teletrabajo como concepto propio: fases siguientes.

## 11. Ronda del Contador (2026-11-16)

Respuestas en `docs/contador/RESPUESTAS-CONTADOR-NOMINA-2026-11-16.md`; correcciones y casos de nuevo en
`docs/contador/NOMINA-RONDA-2-RESULTADOS-2026-11-16.md`. El motor pasa a `hrm-nomina-2`. La bandera sigue apagada:
el Contador aprueba encenderla empresa por empresa, por escrito.

- **Cálculo** (`motorNomina.ts`, `deducciones.ts`, `retencion.ts`): extra en festivo con los dos recargos (P1; el motor
  de horas ya los sumaba), divisor de la jornada pactada (P2), tope del auxilio medido cada mes con sueldo, comisiones y
  recargo nocturno (P3), incapacidad al 100 % como opción de empresa (P5, `incapacidad_empleador_fraccion`), vacaciones
  con el salario del día en que empiezan y promedio sin extras ni dominicales (P6, `fn_hr_nomina_variables_vacaciones`),
  exoneración medida con lo salarial (P10), ARL solo por días trabajados (P12, `bases.ibc_arl`), salud del empleador en
  la licencia no remunerada y opción de pensión (P13, `bases.ibc_licencia`,
  `hr_payroll_employee_settings.pension_en_licencia`), redondeo PILA por subsistema (P14), redondeo de la retención del
  art. 868 (P17, `retencion_redondeo_tabla`), embargo sobre prestaciones por oficio (P20,
  `hr_garnishments.base_incluye_prestaciones`), libranza sobre el salario neto sin auxilio (P21), provisión de vacaciones
  con comisiones y recargo nocturno (P22) y prima con promedio si cambió en el semestre (P23).
- **Parámetros:** FSP de la Ley 2381 vigente desde el 2027-04-01, con el tramo del 2,8 % hasta 20 SMMLV incluidos
  (`hasta_incluido`); luto de 5 días hábiles confirmado.
- **Migración:** `20261116223357_hrm_f3_05_nomina_ronda_contador` (reversión en `supabase/rollbacks/`).
- **Pruebas:** `motorNominaHrm.test.ts` (los 20 casos con los números nuevos y uno por corrección),
  `nominaRondaContador.test.ts` (insumos nuevos y FSP 2027), `motorHorasHrm.test.ts` (extra nocturna del 20-jul).
- **Pendiente:** P19 (porcentaje fijo calculado y guardado por el sistema en junio y diciembre), pantallas de las
  opciones nuevas (Figma primero) y las seis preguntas de la §3 del documento de la ronda 2.

### 11.1 Ronda 3 del Contador (2026-11-16)

Respuestas en `docs/contador/RESPUESTAS-CONTADOR-NOMINA-RONDA-2-2026-11-16.md`; resultados en
`docs/contador/NOMINA-RONDA-3-RESULTADOS-2026-11-16.md`. Motor `hrm-nomina-3`.

- Vacaciones y licencias remuneradas cotizan salud y pensión con el último IBC por sus días (Decreto 780, art.
  3.2.5.1); lo pagado queda en parafiscales. La regla del 40 % excluye vacaciones, incapacidades y licencias (P7).
- Fondo de solidaridad redondeado por campo de la PILA (`fsp_tabla[].solidaridad`); tabla 2026 con 17 a 20 SMMLV
  exactos al tramo de abajo (`hasta_incluido`). Bonificación salarial habitual en vacaciones y su provisión.
- Incapacidad laboral a cargo de la ARL desde el día 1 (`incapacidad_tramos.laboral`).
- Migraciones: `20261116231731_hrm_f3_08_nomina_ronda3_contador`, `20261116232134_hrm_f3_09_nomina_ronda3_cuentas`
  (tercero en gasto, vista previa y aprobación del plan de cuentas, ajuste anual de provisiones) y
  `20261116232859_hrm_f3_10_incapacidad_laboral_arl`.
- **Pendiente:** cargar los NIT de las entidades (bloqueante), que el motor calcule el valor de las vacaciones
  pendientes al 31-dic para el ajuste anual, liquidación de contrato, P19 y las pantallas (Figma primero).
