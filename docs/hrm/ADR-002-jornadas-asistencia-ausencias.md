# ADR-002 · Recursos humanos, fase 2: jornadas, asistencia y ausencias

- **Fecha:** 2026-11-15.
- **Estado:** propuesto al dueño con el diseño de Figma; el backend se implementa ya (§11).
- **Alcance:** solo backend: esquema, funciones, RLS, servicios, route handlers y pruebas. **No hay pantallas nuevas.** La interfaz entra cuando el dueño apruebe el diseño.
- **Insumos:**
  - `PLAN-GESTION-HUMANA.md` (fase 2) y el brief del 2026-11-15;
  - `INVESTIGACION-NORMATIVA-CO-2026-11-14.md`, §1, §2, §3, §11 y §12;
  - `ADR-001-modelo-fundaciones.md` (permisos, parámetros, festivos, aprobaciones, registro de accesos, bucket);
  - el esquema real, consultado por el MCP en `taqjemqjtumhwptchcxk` el mismo día.

## 0. Lo que encontré en la base antes de diseñar

| Hecho | Consecuencia para el diseño |
|---|---|
| `shift_templates`, `shift_rotations`, `shift_assignments`, `time_clocks`, `attendance_events`, `timesheets`, `timesheet_adjustments`, `leave_types`, `leave_requests` y `leave_balances` tienen **0 filas**. | Se pueden agregar columnas con `DEFAULT` y cambiar políticas sin migrar datos. No se toca ningún `CHECK` existente (el guardarraíl 9 compara los `CHECK` con `enums.ts`). |
| `shift_assignments` es único por `(employment_id, work_date)` y guarda solo `time` (sin zona). | Un turno nocturno no se puede comparar con el del día siguiente. Se agregan `start_at` y `end_at` (`timestamptz`) calculados en la zona de la sede. |
| `shift_templates.overtime_multiplier = 1.25` y `night_multiplier = 1.35` son **constantes** de recargo. | No se usan. El motor lee los recargos con `fn_hr_parametro` por fecha (§3). Las columnas quedan como legado (`comment on`). |
| `hrm_process_attendance_event` agrupa por el día local **de cada marcación**. | Un turno de 22:00 a 06:00 se partía en dos timesheets. Ahora cada marcación lleva `work_date`: la salida pertenece al día de su entrada (§2). |
| Los descansos (`break_start` / `break_end`) no se restaban. | Se restan al consolidar (pendiente de la fase 0, §11). |
| `time_clocks` lo lee cualquier miembro, con `current_qr_token`; `/marcar` compara el token **en el navegador**. | El token deja de llegar al empleado: la validación pasa a `fn_hr_marcar` en el servidor y la lectura de `time_clocks` queda para quien supervisa asistencia (§2). |
| `leave_requests` la lee el jefe (`view_team`) con su tipo y su `reason`. | Con una incapacidad, el jefe leía el motivo. Las ausencias de salud salen de su RLS y el detalle médico va a una tabla sin acceso directo (§6). |
| `hrm_update_leave_balance_on_request` descuenta `total_days` (días calendario). | Las vacaciones se cuentan en días hábiles: el trigger usa `business_days` cuando el tipo cuenta hábiles (§5). |
| Parámetros de jornada ya cargados: nocturno desde las 19 (25-dic-2025), dominical 0,80 → 0,90 → 1,00, jornada 44 → 42 el 15-jul-2026, divisor 220 → 210, extras 2/12 h. Faltan la jornada diaria, la tolerancia de tardanza, las vacaciones por año y quién paga cada licencia. | Se agregan con su vigencia (§3, §5, §6). El de luto queda `por_confirmar`: no está en la investigación. |
| El motor de aprobaciones usa `ausencia` y `horas_extra` como tipos, y `fn_hr_aprobacion_al_cerrar` solo conoce el historial y el banco. | Se reutilizan esos tipos; se agregan `novedad_asistencia` y `cambio_turno` y la consecuencia de cada uno en `al_cerrar` (§4). |

## 1. Las cinco decisiones principales

1. **El motor de clasificación de horas es una función pura en TypeScript compartido** (`src/lib/hrm/jornada/motorHoras.ts`), no en SQL. Recibe las marcaciones o el turno, la zona, los festivos y los **tramos de vigencia** de cada parámetro, y devuelve minutos por categoría y por recargo. La base le entrega los insumos (`fn_hr_jornada_insumos`) y guarda su salida en `timesheets` y `hr_timesheet_lines` (`fn_hr_jornada_guardar`), con control de versión para que sea idempotente. Justificación en §3.
2. **La marcación se hace solo por el servidor.** `fn_hr_marcar` (solo `service_role`) valida el QR contra la base, pone la hora del servidor, guarda la ubicación solo si hay consentimiento vigente y decide entrada o salida. El token del QR no vuelve a llegar al navegador del empleado. La hora manual es exclusiva de `hr.attendance.manage` (`fn_hr_marcacion_manual`).
3. **Todo lo que llega a nómina pasa por una novedad aprobada.** Horas extra, tardanzas, salidas tempranas, ausencias y cambios de turno son filas de `hr_attendance_novelties` con su instancia del motor de la fase 0. **Las horas extra no aprobadas no van a nómina.** El día queda «lista para nómina» (`timesheets.status = 'approved'`) solo si está clasificado con la última versión de sus marcaciones y no tiene novedades pendientes. La fase 3 consume `fn_hr_jornada_para_nomina`.
4. **Las vacaciones se causan a 15 días hábiles por año de servicio, en base 360**, y se descuentan en días hábiles **sin contar festivos de ley ni días propios de la empresa**. Los días propios se excluyen porque son un descanso remunerado que la empresa da a todos: si cayeran dentro de unas vacaciones y se descontaran, quien está de vacaciones lo perdería. Es la lectura más favorable al trabajador (CST 21).
5. **Salud es un grupo sensible también en ausencias.** El tipo de ausencia tiene `data_group = 'salud'` para las incapacidades. El jefe ve «ausente por incapacidad» por `fn_hr_ausencias_equipo`; nunca el tipo exacto, el diagnóstico ni el soporte. El diagnóstico vive en `hr_leave_health_details` (sin políticas, solo por RPC con registro de acceso) y el soporte en `hr-documentos`, grupo `salud`.

## 2. Turnos y marcación

### Turnos

- **Plantillas** (`shift_templates`) y **rotaciones** (`shift_rotations`) se reutilizan. La rotación es `pattern`: un arreglo de `cycle_days` posiciones con el id de una plantilla o `null` (descanso); un trigger lo valida contra la organización.
- **Asignaciones** (`shift_assignments`), columnas nuevas:
  - `start_at` y `end_at` (`timestamptz`), `planned_minutes` y `break_minutes`, calculadas por el trigger `trg_shift_assignments_calcular` en la zona de la sede (`fn_timezone_for`). Un turno cuya hora de fin es menor o igual a la de inicio termina al día siguiente.
  - `is_rest_day`: el día de descanso se planea como una fila sin plantilla.
  - `is_draft`, `published_at` y `published_by`: el planificador trabaja en borrador y publica. Lo que crean las pantallas viejas nace publicado (`is_draft = false`), así que `TurnoInicio` no cambia.
- **Cruces del mismo empleado:** el trigger rechaza (23P01 `turno_cruzado`) un turno que se solapa con otro del mismo vínculo, incluido el nocturno contra el del día siguiente.
- **Antes de publicar**, `fn_hr_turnos_validar` devuelve:
  - **bloqueos:** cruces y turnos sobre una ausencia aprobada o solicitada;
  - **alertas:** semana por encima de la jornada máxima (la menor que rija en la semana, a favor del trabajador), extra planeada por encima de 2 h/día o 12 h/semana, semana sin día de descanso y trabajo en el día de descanso (con el conteo del mes para distinguir ocasional de habitual, §1.3).
- `fn_hr_turnos_publicar` no publica con bloqueos y pide `aceptar_alertas` si hay alertas. Al publicar se notifica al empleado (el trigger de notificación ya no avisa por borradores).
- `fn_hr_rotacion_aplicar` genera borradores desde una rotación, con desfase por empleado, sin pisar lo que ya existe.
- **Ajustes de asistencia por vínculo** (`hr_attendance_settings`): modalidad (`presencial`, `remoto`, `hibrido`), mecanismos permitidos (`app`, `qr`, `sin_marcacion`), día de descanso pactado (por defecto el domingo, CST 179), días laborables (por defecto lunes a sábado), jornada flexible y exento de horas extra (dirección, confianza y manejo, CST 162). Sin fila, rigen los valores por defecto.

### Marcación

- **`fn_hr_marcar(actor, org, datos, ip, ua)`**, solo `service_role`, llamada por `POST /api/hrm/marcacion`:
  - el vínculo es siempre el del actor en la organización de la sesión;
  - **QR:** el reloj debe ser de la organización, estar activo y ser de tipo QR; el token debe coincidir y no estar vencido. Si no: `qr_invalido` o `qr_vencido`;
  - **app:** solo si el vínculo la tiene entre sus mecanismos; marcar remoto solo con modalidad `remoto` o `hibrido`;
  - **hora:** `now()` del servidor, siempre;
  - **ubicación:** se guarda solo si viene en la marcación **y** el empleado tiene un consentimiento vigente en `hr_geo_consents`. Sin consentimiento se descarta. Si el reloj exige cerca virtual, sin consentimiento responde `ubicacion_requiere_consentimiento`;
  - **tipo:** si no se indica, alterna con la última marcación de las 24 h anteriores; un doble toque del mismo tipo en menos de 60 s responde `marcacion_duplicada`.
- **`hr_geo_consents`:** solo inserción (otorga o retira, versión del texto, IP y agente). El vigente es el último.
- **`fn_hr_marcacion_manual`:** hora elegida y motivo obligatorio, solo con `hr.attendance.manage`. Queda `is_manual_entry = true`.
- **`fn_hr_reloj_qr_rotar`:** genera el token en la base (dos `gen_random_uuid`, 244 bits aleatorios) con vencimiento según `settings.qr_ttl_segundos` (300 s por defecto). Solo `hr.attendance.manage`.
- **`time_clocks`:** la leen `hr.attendance.view` y `hr.attendance.manage`. El empleado ya no la necesita.
- **Trabajo remoto:** `attendance_events.work_mode` (`presencial` o `remoto`) queda en cada marcación para la nómina (auxilio de conectividad, §1.7) y la auditoría.
- **Día de trabajo de cada marcación** (`attendance_events.work_date`): la entrada toma el día del turno que la contiene (hasta 3 h antes de su inicio) o su día local; la salida y los descansos toman el día de la última entrada de las 24 h anteriores.

## 3. El motor de clasificación de horas

### Por qué TypeScript y no SQL

- **Pruebas en las zonas que exige el repositorio.** El motor se prueba con Jest en `src/__tests__/timezone/`, que `npm run test:tz-all` corre con `TZ=UTC`, `America/Bogota` y cuatro zonas más. En SQL las pruebas solo existirían como bloques que se deshacen en el MCP, sin quedar en el repositorio.
- **Un solo código para tres usos:** el cálculo que se guarda, la vista previa del planificador (cuánto recargo tendrá un turno antes de publicarlo) y el escritorio sin conexión.
- **Es puro de verdad:** no lee la base ni el reloj, recibe todos los insumos y su resultado depende solo de ellos. La conversión de zona usa `wallTimeToInstant` y `toPlainDate` de `dateCore.ts`, que no dependen del `TZ` del proceso.
- **Lo que se pierde:** un trigger no puede llamarlo. Se compensa con la versión: cada cambio de marcaciones sube `timesheets.input_version`, y un día solo pasa a «lista para nómina» si `classified_version = input_version`. `/marcar` reclasifica el día en cada salida.

### Entradas y salidas

- **Entradas:** intervalos trabajados (de las marcaciones, con los descansos restados; o del turno publicado para quien no marca), zona, día de trabajo, festivos de ley, día de descanso pactado, tope diario (el turno pactado, con el máximo de `jornada_max_diaria` o de `jornada_flexible_max_diaria`), horas de contrato, exento, minutos ordinarios y extra que ya lleva la semana, y los **tramos** de cada parámetro (`fn_hr_parametro_tramos`).
- **Salida:** minutos por categoría (8), líneas agrupadas por categoría, día local, recargo y divisor, los tramos con los parámetros que usó cada uno, alertas y una huella de la entrada.

### Reglas

1. **Partición por tramos.** Cada intervalo se corta en la medianoche local, en la hora de inicio del nocturno y en la de fin del nocturno, **con los valores vigentes ese día local**. Así un turno que cruza la medianoche, un cambio de vigencia (1-jul, 15-jul) o un festivo queda en tramos con su propio parámetro.
2. **Nocturno:** de `nocturno_hora_inicio` (19:00) a `nocturno_hora_fin` (06:00).
3. **Dominical o festivo:** el tramo cae en el día de descanso pactado (domingo por defecto) o en un festivo de `hr_holidays`. **Los días propios de la empresa no generan recargo** (decisión del dueño, ADR-001 §14).
4. **Ordinaria o extra:** en orden cronológico, un minuto es ordinario mientras no se pase el tope del día ni el semanal; el resto es extra. El tope semanal de cada tramo es el menor entre la jornada vigente **ese día** y la del contrato. En la semana del 13 al 19 de julio de 2026, el lunes y el martes se miden contra 44 h y desde el miércoles contra 42 h. Quien está exento no genera extra.
5. **Recargo** (fracción, con los valores del día del tramo):

   | Categoría | Recargo |
   |---|---|
   | ordinaria diurna | 0 |
   | ordinaria nocturna | nocturno |
   | dominical o festiva diurna | dominical |
   | dominical o festiva nocturna | dominical + nocturno |
   | extra diurna | extra diurna |
   | extra nocturna | extra nocturna |
   | extra dominical o festiva diurna | dominical + extra diurna |
   | extra dominical o festiva nocturna | dominical + extra nocturna |

   La extra nocturna (75 %) ya incluye lo nocturno: no se suma el 35 % (CST 168, «no se acumulan»). El recargo dominical sí se suma, como hace la práctica contable. Si las horas ordinarias van con el salario o se pagan aparte lo decide la nómina (fase 3); el motor solo entrega el recargo y el divisor de cada tramo.
6. **Alertas** (no bloquean): extra del día por encima de `horas_extra_max_dia`, extra de la semana por encima de `horas_extra_max_semana` y marcación sin salida.
7. **Parámetro faltante o por confirmar:** el motor falla con `parametro_no_configurado` y el día no se clasifica. Nunca usa un valor inventado. Hoy eso pasa antes del 25-dic-2025 (nocturno) y del 1-ene-2026 (recargos).
8. **Idempotente:** la misma entrada da la misma salida y la misma huella. Guardar dos veces reemplaza las líneas, no las duplica.

### Persistencia

- `timesheets`: `input_version`, `classified_version`, `classified_at`, `classification` (minutos, alertas, tramos y huella), `classification_source` y los totales de siempre (`overtime_minutes`, `night_minutes`, `holiday_minutes`).
- `hr_timesheet_lines`: una fila por categoría, día local, recargo y divisor. Es lo que consume la nómina. Solo la escribe `fn_hr_jornada_guardar`.

## 4. Novedades y «lista para nómina»

- **`hr_attendance_novelties`:** `kind` (`horas_extra`, `tardanza`, `salida_temprana`, `ausencia`, `cambio_turno`), minutos, estado (`esperando_contraparte`, `pendiente`, `aprobada`, `rechazada`, `anulada`), origen, justificación, detalle e instancia de aprobación.
- **Qué significa aprobar:**
  - horas extra: se pagan;
  - tardanza, salida temprana o ausencia: queda justificada y no se descuenta; rechazada, se descuenta;
  - cambio de turno: se aplica (intercambio del mismo día o cesión a quien no tiene turno ese día).
- **Tipos del motor:** `horas_extra`, `ausencia` (vacaciones, licencias e incapacidades), `novedad_asistencia` (tardanza, salida temprana, ausencia sin permiso) y `cambio_turno`. Mientras no haya reglas, rige el plan por defecto de la fase 0: jefe directo y, si no hay, RR. HH. Si no hay nadie, la novedad queda pendiente: **nunca se aprueba por omisión**.
- **Cómo nacen:** `fn_hr_jornada_guardar` crea o ajusta la de horas extra (solo por la diferencia con lo ya aprobado), la de tardanza (por encima de `tardanza_tolerancia_minutos`) y la de salida temprana. El job diario `hrm-detectar-ausencias` crea la ausencia de un turno publicado sin marcaciones ni ausencia aprobada. El empleado justifica y pide cambios de turno con `fn_hr_novedad_registrar`.
- **«Lista para nómina»:** `fn_hr_jornada_lista_nomina` pasa a `approved` los días clasificados con la última versión y sin novedades pendientes, y devuelve los que no pudo con su motivo. `fn_hr_jornada_reabrir` lo deshace mientras no esté `locked`.
- **Consumo de la fase 3:** `fn_hr_jornada_para_nomina(actor, org, desde, hasta)` devuelve por vínculo:
  - horas por categoría, recargo y divisor, de días listos; las extra, limitadas a lo aprobado;
  - tardanzas, salidas y ausencias sin justificar;
  - ausencias aprobadas por tipo, con los tramos de pago de las incapacidades;
  - días de descanso trabajados por mes, con la marca de habitual (`dominical_habitual_umbral_dias`).

## 5. Vacaciones

- **Tipos:** `fn_hr_tipos_ausencia_asegurar(org)` siembra los tipos de sistema (`VAC`, `INC_EG`, `INC_AT`, `LMA`, `LPA`, `LUT`, `CAL`, `LRE`, `LNR`) sin pisar los de la organización.
- **Días hábiles:** `fn_hr_dias_habiles(org, desde, hasta, sede, dias_laborables)` cuenta los días laborables del vínculo (lunes a sábado por defecto) y quita festivos de ley y días propios (medio día propio cuenta 0,5).
- **Causación:** `fn_hr_vacaciones_saldo` = `vacaciones_dias_habiles_anio` × días de servicio en base 360 / 360, menos los días de licencia no remunerada (suspenden el contrato, CST 51), menos lo disfrutado y lo programado. Se informa con dos decimales.
- **Solicitud** (`fn_hr_ausencia_solicitar`): valida saldo, cruce con otras ausencias del mismo vínculo y preaviso del tipo, calcula días calendario y hábiles, y devuelve los **cruces del equipo** (mismo jefe o misma área con vacaciones en las mismas fechas), que también viajan en el contexto de la aprobación.
- **Aprobación:** tipo `ausencia` con `dias` en el contexto. Así la regla «por encima de N días, también RR. HH.» se configura con `dias_gt` en el motor de la fase 0.
- `leave_balances` se sigue llenando por trigger para las pantallas viejas, ahora en días hábiles cuando el tipo los cuenta.

## 6. Incapacidades y licencias

- **Clase legal** (`leave_types.legal_class`): `vacaciones`, `incapacidad_comun`, `incapacidad_laboral`, `maternidad`, `paternidad`, `luto`, `calamidad`, `licencia_remunerada` (CST 57 num. 6) y `licencia_no_remunerada`.
- **Tramos de pago como parámetros por vigencia, nada fijo:**
  - incapacidades: `incapacidad_tramos` (ya cargado: empresa días 1 y 2, EPS 3 a 180, fondo de pensiones 181 a 540, EPS desde 541; laboral 100 % por la ARL desde el día 2);
  - licencias: `licencias_pago` (nuevo): quién paga y qué fracción por clase;
  - duración: `licencia_maternidad_semanas`, `licencia_paternidad_semanas` y `licencia_luto_dias_habiles` (este último `por_confirmar`, así que no limita hasta que el Contador lo confirme).
- **Prórroga:** `leave_requests.prorroga_de` encadena incapacidades contiguas; el conteo de días para los tramos sigue la cadena (`fn_hr_ausencia_tramos_pago`).
- **Soporte:** `leave_requests.document_id` apunta a `hr_documents` del grupo `salud` de la misma persona. `document_path` y `reason` quedan vacíos en los tipos de salud: un trigger los rechaza (`motivo_va_en_salud`).
- **Quién ve qué:**
  - el empleado ve lo suyo, incluido su diagnóstico;
  - el jefe ve «ausente por incapacidad» (`fn_hr_ausencias_equipo`) y no ve las filas de salud de `leave_requests` por RLS;
  - el detalle médico lo lee `fn_hr_ausencia_detalle_salud`, que exige `hr.data.salud.view` de toda la organización (el alcance de equipo está bloqueado para salud desde la fase 0) y deja la fila en `hr_access_log`.

## 7. RLS y permisos

- Todas las políticas nuevas son `to authenticated`, con `organization_id IN (SELECT fn_hr_orgs_con_permiso(...))`, `employment_id IN (SELECT fn_hr_mis_empleos())` o `IN (SELECT fn_hr_equipo_empleos('hr.employees.view_team'))`. Ninguna usa `EXISTS` anidado.
- **Tablas nuevas:**

  | Tabla | Leer | Escribir |
  |---|---|---|
  | `hr_attendance_settings` | lo propio, el equipo o `hr.attendance.view` | `hr.attendance.manage` |
  | `hr_geo_consents` | lo propio o `hr.attendance.view` | solo por RPC; solo inserción |
  | `hr_timesheet_lines` | lo propio, el equipo o `hr.attendance.view` | solo por RPC |
  | `hr_attendance_novelties` | lo propio, el equipo o `hr.attendance.view` | solo por RPC |
  | `hr_leave_health_details` | nadie por RLS | solo por RPC, con registro |

- **Cambios:**
  - `shift_assignments`: el empleado y el jefe ven solo lo publicado; `hr.attendance.view`, también los borradores;
  - `time_clocks`: solo `hr.attendance.view` (lo usan las pantallas de dispositivos y `qr-display`, que son de quien gestiona);
  - `leave_requests`: el equipo ya no ve las filas de tipos de salud.
- **Funciones nuevas:** todas `SECURITY DEFINER`, con `search_path` fijo, sin `EXECUTE` para `anon` ni `public`. Las que reciben `p_actor` solo las ejecuta `service_role`; el route handler pasa el actor que sale de `getServerOrgContext()`.
- **Sigue funcionando:** el panel del empleado y `TurnoInicio` (leen su vínculo, su turno publicado y sus marcaciones) y `/marcar` (ahora por `POST /api/hrm/marcacion`).

## 8. Parámetros que se agregan

| Código | Valor | Desde | Estado | Fuente |
|---|---|---|---|---|
| `jornada_max_diaria` | 8 h | 2023-07-15 | vigente, V | CST 161 |
| `jornada_flexible_max_diaria` | 9 h | 2023-07-15 | vigente, V | CST 161 lit. c |
| `tardanza_tolerancia_minutos` | 0 | 2023-07-15 | vigente; la empresa lo cambia (`libre`) | §12-E |
| `vacaciones_dias_habiles_anio` | 15 | 2023-07-15 | vigente, V (`no_menor`) | CST 186 |
| `licencia_luto_dias_habiles` | 5 | 2023-07-15 | **por confirmar**, NC | Ley 1280 de 2009, fuera de la investigación |
| `licencias_pago` | tabla | 2026-01-01 | vigente, S | CST 57 num. 6; CST 236 |

## 9. Lo que queda fuera

- **Pantallas:** planificador, marcación con consentimiento, bandejas de novedades, calendario de ausencias, saldo y la vista del jefe. Entran tras Figma.
- **Etiquetas de los tipos nuevos** (`novedad_asistencia`, `cambio_turno`) en el editor de reglas: se agregan con su UI en los 4 idiomas. Mientras tanto rige el plan por defecto.
- **Biometría:** fase posterior.
- **El valor en pesos de las horas:** fase 3, con el salario vigente de cada tramo.

## 10. Verificación

- **Motor de horas (Jest, `src/__tests__/timezone/motorHorasHrm.test.ts`, en todas las zonas de `test:tz-all`):** turno nocturno de domingo a lunes festivo, cruce del 1-jul-2026 y del 1-jul-2027, semana del 15-jul-2026, extra por encima del tope, día de descanso pactado distinto del domingo, día propio sin recargo, exento, descansos, marcación incompleta, parámetro faltante e idempotencia.
- **Base (MCP, dentro de transacciones que se deshacen):** otra organización, jefe sin salud, vacaciones con festivos, marcación propia y QR validado en el servidor, aprobación de horas extra y «lista para nómina».
- **Servicios y rutas (Jest):** la organización y el actor salen de la sesión, el QR y la ubicación viajan a la RPC sin hora del cliente, y los errores de la base se traducen a HTTP.

## 11. Resultado de la ejecución (2026-11-15)

### Migraciones aplicadas por el MCP

Cada una pasó antes por una prueba en seco (un `DO` que aplica el cuerpo, prueba y termina en `raise` para deshacer). Tienen su `.sql` en `supabase/migrations/` y su reversión en `supabase/rollbacks/`; el md5 del archivo coincide con el de `schema_migrations`.

| Versión | Nombre | Qué hace |
|---|---|---|
| 20261116021918 | `hrm_f2_01_parametros_jornada_ausencias` | Jornada diaria (8 h) y flexible (9 h), tolerancia de tardanza, vacaciones por año (15), luto (por confirmar) y quién paga cada licencia |
| 20261116022548 | `hrm_f2_02_turnos` | `hr_attendance_settings`; `start_at`/`end_at`, borrador y descanso en `shift_assignments`; cruces rechazados; validar, publicar y aplicar rotaciones; notificación solo al publicar |
| 20261116023042 | `hrm_f2_03_marcacion` | `hr_geo_consents`; `work_date` y `work_mode` de cada marcación; consolidación con descansos y turnos nocturnos; `fn_hr_marcar`, manual, estado, consentimiento y rotación del QR; `time_clocks` solo para quien supervisa |
| 20261116023833 | `hrm_f2_04_jornada_novedades` | `hr_timesheet_lines`, `hr_attendance_novelties`, insumos y guardado del motor, novedades con aprobación, cambio de turno, «lista para nómina» y reapertura |
| 20261116025305 | `hrm_f2_05_ausencias` | Clase legal y grupo de salud en `leave_types`; `hr_leave_health_details`; días hábiles, base 360, saldo, solicitar y cancelar; calendario del equipo; detalle de salud con registro; tramos de pago; `fn_hr_jornada_para_nomina`; job `hrm-detectar-ausencias` |

### Pruebas

- **Motor de horas (Jest, 38 casos, en las seis zonas de `test:tz-all`):**
  - domingo 28 → lunes 29-jun-2026 (San Pedro): 120 min dominicales del domingo y 360 festivos del lunes, ambos al 1,15 (80 % + 35 %), divisor 220;
  - domingo 4 → lunes 5-jul-2027: los mismos tramos al 1,35 (100 % + 35 %), divisor 210;
  - cruce del 1-jul-2026 con descanso pactado el miércoles: el martes va como nocturna (0,35) y el miércoles como dominical nocturna al 1,25; la misma noche una semana antes, al 1,15;
  - cruce del 1-jul-2027 con descanso el jueves: el jueves al 1,35;
  - semana del 13 al 18-jul-2026 con 8 h diarias: lunes y martes contra 44 h, desde el miércoles contra 42 h; el sábado da 2 h ordinarias y 6 extra, con la alerta de tope diario; la semana anterior da 4 y 4;
  - 11 h en un día: 3 h extra diurnas y alerta; de 12:00 a 22:00 la extra cae de noche al 75 % sin sumar el 35 %; con 11 h extra previas en la semana, la alerta de 12 h;
  - Katmandú, Santiago con cambio de hora y Ciudad de México: el resultado depende de la zona de la sede, no del proceso;
  - parámetro faltante o por confirmar: el día no se clasifica; misma entrada, misma huella.
- **Servicios y rutas (Jest, 22 casos):** actor y organización de la sesión, QR de otra organización y organización ajena en el body → 403 sin tocar la base, la hora del cliente se descarta, la clasificación se guarda con su versión y reintenta si llegan marcaciones, el intento sin permiso sobre salud queda registrado.
- **Base (MCP, transacciones que se deshacen):**
  - **Otra organización:** 0 filas en las ocho tablas; marcar, insumos, calendario y consumo de nómina responden 42501.
  - **Jefe sin salud (rol 5):** ve las vacaciones de su reporte y no la incapacidad; `hr_leave_health_details` responde 42501 por acceso directo; el calendario muestra «Ausente por incapacidad» sin tipo; el detalle de salud responde 42501; el titular sí ve su tipo; el jefe directo aprueba las vacaciones; no ve `time_clocks`.
  - **Marcación propia y QR:** token malo y QR de otra organización → `qr_invalido`; vencido → `qr_vencido`; con el token vigente marca con la hora del servidor; sin consentimiento la ubicación no se guarda y con consentimiento sí; doble toque → 55000; remoto con modalidad presencial → rechazado; no puede marcar por otro; una inserción directa con fecha de 2020 queda con la hora del servidor; ve su turno publicado y no el borrador.
  - **Vacaciones con festivos:** del 21-dic-2026 al 12-ene-2027 son 23 días calendario y 16 hábiles (sin domingos, el 25-dic, el 1-ene, el 11-ene y un día propio el 31-dic); saldo causado de 23,38 al 21-dic con ingreso el 1-jun-2025; cruce con otra ausencia → 23P01; saldo insuficiente → rechazo.
  - **Incapacidad con prórroga:** días 3 a 90 por la EPS al 66,67 % y 91 a 122 al 50 %.
  - **Horas extra:** la novedad nace pendiente, el titular no puede aprobarla, RR. HH. la aprueba y el día pasa a «lista para nómina»; guardar dos veces la misma clasificación no duplica la novedad.
  - **Turnos:** el nocturno del domingo se cruza con un turno del lunes a las 05:00 → 23P01; una semana de 63 h planeadas da `extra_semanal_supera_tope`, `semana_sin_descanso` y el domingo trabajado.
