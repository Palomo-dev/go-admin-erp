# Auditoría del módulo HRM: qué hay hoy (2026-11-14)

Este informe es solo de lectura. La base se consultó por el MCP (proyecto `taqjemqjtumhwptchcxk`), únicamente con `information_schema`, `pg_policies`, `pg_proc`, `pg_trigger` y conteos. No se editó ningún archivo del repositorio.

## 0. Resumen ejecutivo

- **Hay mucho código y casi nada de datos.** El módulo tiene 50 páginas, 124 componentes y unas 7.250 líneas de servicios. En la base, en cambio, solo tienen filas `departments` (240), `job_positions` (840), `employments` (107) y `job_position_permissions` (240). Las cuatro las siembran triggers.
  - Ningún empleado tiene salario, cuenta bancaria, EPS ni cargo.
  - Nunca se ha corrido una nómina: `payroll_periods` tiene 0 filas.
  - Turnos, marcaciones, timesheets, ausencias y préstamos también están en 0.
  - El módulo `hrm` está activo en 4 organizaciones (135, 137, 374 y 375).
  - **Consecuencia:** se puede rehacer sin migrar datos de clientes.
- **La nómina se calcula en el navegador y tiene un error de escala.** `payrollCalculationService.ts` es `'use client'`. Lee `country_payroll_rules`, donde los porcentajes están en fracción (`0.0400`), y los divide otra vez por 100. El resultado: salud, pensión, aportes patronales y parafiscales quedan 100 veces por debajo. Además no redondea, cablea 240 h/mes y la jornada nocturna empieza a las 21:00.
- **Lo más sólido está en la base de datos:**
  - los asientos contables de nómina por trigger;
  - los bloqueos de cierre cuando hay deducciones sin calcular;
  - la RPC `fn_nomina_fijar_deduccion`;
  - la función de retención `fn_retencion_art383`;
  - la tabla `fiscal_uvt`.
- **Los permisos solo llegan al módulo, no a los campos.** El middleware decide si se entra a HRM y a cada página. Adentro, solo la página de Cargos revisa permisos, y las RLS se limitan a comprobar que el usuario pertenece a la organización. Cualquier miembro, un cajero por ejemplo, puede leer y modificar salarios, cuentas bancarias y colillas.
- **El modelo de "empleado" no sirve para una nómina colombiana.** `employments` cuelga de `organization_members`, es decir, de un usuario con cuenta, y no tiene `organization_id` propio. Ni `employments` ni `profiles` guardan el documento de identidad, y no hay campo de caja de compensación. Un operario sin acceso a la app no puede existir como empleado.
- **Nada del aspecto visual está en el kit nuevo.** Las 50 páginas usan el aspecto viejo: shadcn con `dark:` y colores fijos. Ninguna página usa next-intl; solo lo usa el componente `DeduccionesPeriodo`.

---

## 1. Inventario por área

Estados posibles: **funciona**, **parcial**, **maqueta** o **no existe**. "Funciona" quiere decir que lee y escribe datos reales; no garantiza que el cálculo sea correcto.

### 1.1 Estructura organizacional

| Qué existe | Estado | Archivos | Tablas |
|---|---|---|---|
| Árbol de departamentos: CRUD, importación CSV, responsable y centro de costo en texto | funciona | `hrm/departamentos/**`, `departmentsService.ts`, `departmentDetailService.ts`, `components/hrm/departamentos/**` | `departments` (240 filas en 40 orgs; trigger `updated_at`; FK a `parent_id`, `manager_employment_id`) |
| Detalle de departamento con enlaces a reportes | parcial | `DepartmentReports.tsx:34,42,50,58` enlaza a 4 rutas `/app/hrm/reportes/*` que no existen | — |
| Cargos: CRUD, rango salarial, nivel, requisitos (jsonb) | funciona | `hrm/cargos/**`, `jobPositionsService.ts` | `job_positions` (840 filas; triggers `fn_job_positions_permisos_por_defecto` y `auto_assign_base_permissions_to_job_position`) |
| Permisos y acceso a módulos y páginas por cargo | funciona | `JobPositionPermissionsManager.tsx` (824 líneas), `jobPositionPermissionsService.ts`, `jobPositionModuleAccessService.ts` | `job_position_permissions` (240), `job_position_module_access` (0), `job_position_page_access` (0) |
| Sucursal y centro de costo del empleado | funciona (FK) | — | `employments.branch_id → branches`, `employments.cost_center_id → cost_centers` (trigger `fn_centro_misma_org`) |
| Organigrama visual, posiciones o plazas (headcount aprobado), historial de cargos | no existe | — | — |

### 1.2 Reclutamiento y selección

| Qué existe | Estado | Notas |
|---|---|---|
| Vacantes, candidatos, pipeline, entrevistas, pruebas | no existe | No hay tablas ni páginas |
| Portal de empleo en el sitio web | no existe | `src/lib/website/**` y `goadmin-websites` solo tienen las secciones genéricas `team` y `contacto` |
| Base reutilizable | — | El pipeline de oportunidades del CRM (etapas, tarjetas, `quick actions`) puede servir de patrón de UI, no de tablas. El website builder sirve para agregar una sección "Trabaja con nosotros". |

### 1.3 Ingreso (onboarding) y contratación

| Qué existe | Estado | Archivos / tablas |
|---|---|---|
| Alta de empleado con un formulario de 847 líneas | funciona | `empleados/nuevo`, `EmployeeCreateForm.tsx`. Exige elegir un **miembro existente** de la organización (`organization_member_id`) |
| Alta automática | funciona | Trigger `trg_create_employment_for_new_member` en `organization_members`: cada miembro nuevo queda como empleado `active`, contrato `indefinite`, 48 h/semana, sin salario |
| Importación de empleados por CSV | funciona | `empleados/importar`, `EmployeeImporter`. Importa salario y cuenta bancaria sin revisar permisos |
| Datos de contratación | parcial | `employments`: `contract_type`, `contract_end_date`, `probation_end_date`, `employment_type` y `work_hours_per_week`, todos en texto libre y sin catálogos |
| Contrato laboral generado, firmado y versionado (otrosíes) | no existe | La firma electrónica solo existe en el CRM con Documenso (`src/lib/services/crm/esignAdapter.ts`, `contract_signatures` atada a `opportunity_id`). El adaptador es reutilizable, la tabla no. |
| Checklist de ingreso, afiliaciones, exámenes de ingreso | no existe | — |

### 1.4 Expediente del empleado

| Qué existe | Estado | Notas |
|---|---|---|
| Ficha con pestañas: turnos, marcaciones, ausencias, colillas y préstamos | funciona | `empleados/[id]`, `components/hrm/empleados/detail/*`. `new Date('YYYY-MM-DD')` en L437, 570 y 571 resta un día |
| Edición del empleado (635 líneas inline) | funciona | `empleados/[id]/editar`. Muestra completo el número de cuenta bancaria |
| Seguridad social | parcial | `eps_code`, `afp_code`, `arl_code`, `arl_risk_level` y `severance_fund_code` son texto libre, sin catálogo de entidades. **No hay caja de compensación (CCF).** |
| Datos bancarios | parcial | `bank_name`, `bank_account_type` y `bank_account_number` en claro. Se enmascaran solo al pintar (`EmployeeSocialSecurity.tsx:141`) |
| Documento de identidad, tipo de documento, fecha de nacimiento, sexo, dirección, contacto de emergencia, beneficiarios, nivel educativo | **no existe** | Ni `employments` ni `profiles` lo tienen. `profiles` solo guarda nombre, email, teléfono y avatar. |
| Documentos y archivos del empleado | no existe | No hay bucket de RR. HH. Los campos `leave_requests.document_path`, `attendance_events.photo_path` y `timesheet_adjustments.supporting_document_path` existen, pero el TODO de `asistencia/ajustes/page.tsx:148` abre `/api/storage/...`, una ruta que no existe |
| Historial de cambios (salario, cargo, sede) | no existe | `employment_compensation` tiene vigencias (`effective_from`/`to`), pero está vacía y no alimenta la nómina |

### 1.5 Tiempo y asistencia (turnos, marcación, timesheets)

| Qué existe | Estado | Archivos | Tablas |
|---|---|---|---|
| Plantillas de turno | funciona | `plantillas-turno` (fuera del menú), `shiftTemplatesService.ts` | `shift_templates` (0) |
| Crear un tipo de turno | funciona, pero duplica la anterior | `turnos/tipos/nuevo`: `insert` directo con `...formData` desde la página (L86) | `shift_templates` |
| Rotaciones | funciona | `rotaciones` (fuera del menú), `shiftRotationsService.ts` | `shift_rotations` (0) |
| Calendario y asignación de turnos, conflictos, cambios, importación CSV | funciona | `turnos/**`, `shiftsService.ts` (723 líneas) | `shift_assignments` (0; trigger `fn_notify_shift_assigned`) |
| Relojes y dispositivos con QR rotativo y geocerca | funciona | `marcacion/dispositivos/**`, `timeClocksService.ts` | `time_clocks` (0) |
| Marcación: manual, NFC y QR (`/marcar`) | funciona | `marcacion`, `attendanceService.ts`, `qrAttendanceService.ts`, `src/app/marcar/page.tsx` | `attendance_events` (0; trigger `hrm_process_attendance_event`) |
| Paso de marcación a timesheet en la base | parcial | Trigger con `'America/Bogota'` **fijo** y descansos en 0 (`-- TODO: Calcular breaks`) | `timesheets` (0) |
| Consolidación de timesheets: extras, nocturnas, tardanzas | parcial, en el navegador | `timesheetConsolidationService.ts` (742 líneas): jornada nocturna de **21:00 a 06:00** fija (L87-88), `holiday_minutes: 0 // TODO festivo` (L297), horas leídas con `getHours()` del navegador | — |
| Aprobación, rechazo y bloqueo de timesheets, ajustes con aprobación | funciona / parcial | `asistencia/timesheets`, `asistencia/ajustes` | `timesheet_adjustments` (0) |
| Índice de asistencia | maqueta | `asistencia/page.tsx`: KPIs fijos en 0 y botón de refrescar sin acción | — |
| Calendario de festivos de Colombia | **no existe** | No hay tabla ni función de festivos | — |
| Turno del empleado en Inicio | funciona | `components/inicio/TurnoInicio.tsx`, `src/lib/dashboard/turno.ts`, `/api/inicio/turno` (diseño `37-turno-empleado.png`) | — |

### 1.6 Ausencias, vacaciones e incapacidades

| Qué existe | Estado | Archivos | Tablas |
|---|---|---|---|
| Tipos de ausencia: pagada, requiere soporte o aprobación, acumulación mensual, arrastre | funciona | `ausencias/tipos`, `leaveTypesService.ts` | `leave_types` (0; ninguna organización tiene tipos sembrados) |
| Solicitudes: validación de saldo y traslape, aprobar, rechazar, cancelar | funciona | `ausencias`, `ausencias/nuevo`, `leaveRequestsService.ts`. No revisa `hr.leaves.approve` en la UI. La consulta de `ausencias/nuevo:35-39` está rota y su resultado no se usa | `leave_requests` (0; trigger `hrm_update_leave_balance_on_request`) |
| Saldos y ajuste manual | parcial | `ausencias/saldos`: el botón "Recalcular" no recalcula (TODO L149) | `leave_balances` (0; `available` es GENERATED) |
| Vacaciones según ley (15 días hábiles, causación, festivos, compensación en dinero) | no existe | Es un tipo de ausencia genérico más | — |
| Incapacidades: EPS/ARL, días a cargo del empleador, prórrogas, recobro | no existe | — | — |
| Licencias de maternidad, paternidad y luto, con su efecto en la nómina | no existe | La nómina no lee `leave_requests` | — |

### 1.7 Nómina

| Qué existe | Estado | Archivos | Tablas |
|---|---|---|---|
| Paquetes salariales y componentes, con fórmula libre (`base_salary * 0.1`) | funciona (UI), no se usa | `compensacion/paquetes/**`, `compensationPackagesService.ts`. **La nómina no lee paquetes**: usa `employments.base_salary` | `compensation_packages`, `compensation_components` (0) |
| Asignación de paquetes a empleados | funciona (UI), no se usa | `compensacion/asignaciones`, `employmentCompensationService.ts` | `employment_compensation` (0) |
| Índice de compensación | cascarón | `compensacion/page.tsx` | — |
| Reglas por país (solo lectura) | funciona | `reglas-pais`, `hrmConfigService.ts` | `country_payroll_rules`: 3 filas `CO` de 2024 a 2026 con SMMLV, auxilio, %, recargos y tasas de prestaciones. `tax_brackets` en NULL. RLS `SELECT true` (catálogo global) |
| Periodos y ejecuciones (runs) | funciona | `nomina`, `nomina/periodos/**`, `payrollService.ts` (735 líneas) | `payroll_periods` (0; triggers de asiento, bloqueo de cierre y notificación), `payroll_runs` (0) |
| **Cálculo de la nómina** | funciona con errores graves | `payrollCalculationService.ts` (730 líneas, `'use client'`), llamado desde `nomina/page.tsx:184` y `periodos/[id]/page.tsx:147`. Detalle en §2 | `payroll_slips` (44 columnas), `payroll_items` (0; el cálculo **no** escribe ítems, solo columnas fijas de la colilla) |
| Colillas: lista, detalle, CRUD de ítems, aprobar | funciona | `nomina/colillas/**`. `approveSlips` es un `update` directo (`payrollService.ts:516`); las sumas se hacen en el cliente | — |
| Retención en la fuente y préstamos de la colilla | funciona, en la base | `fn_nomina_fijar_deduccion` (SECURITY DEFINER, exige `hr.payroll.process`), triggers `fn_trg_nomina_colilla_deducciones` y `fn_trg_nomina_periodo_bloquear_cierre`, `nominaDeducciones.ts`, `DeduccionesPeriodo.tsx` (kit e i18n, con test). La retención **se digita a mano**: el cálculo deja `tax_withholding = NULL` | — |
| Procedimiento 1 de retención (art. 383 ET) | existe sin usar | `fn_retencion_art383(base, uvt)` con la tabla de UVT; `fiscal_uvt` tiene COL 2024-2026. Sin depuración (rentas exentas, 25 %, deducibles, límite 40 %) | — |
| Comisiones pagadas por nómina | funciona | Lee `commissions` accrued y las paga con `fn_comisiones_pagar_por_nomina` (tests en `src/__tests__/finanzas/nominaPagaComisiones.test.ts`) | `commissions` |
| Préstamos a empleados, con cuotas y descuento automático | funciona | `prestamos/**`, `employeeLoansService.ts`: interés y cuotas en el cliente, la última cuota sin ajuste de redondeo y `setMonth` que se salta un mes cuando la fecha es 29-31 | `employee_loans`, `loan_installments` (0; triggers que generan cuotas, aplican pagos y asientan: `fn_auto_journal_employee_loan`, `fn_auto_journal_loan_installment`) |
| **Contabilización** | funciona (en la base) | `fn_auto_journal_payroll` al aprobar o pagar la colilla. En Colombia separa varias líneas de gasto contra nómina por pagar; usa `fact_key` idempotente y deja una bandeja de fallos (`fn_log_journal_failure`). Hay `fn_auto_journal_payroll_period`. Las claves `nomina` 5105, `nomina_por_pagar` 25050501 y `nomina_aportes` 2370 están en `src/lib/finanzas/configuracionContable.ts`. Hay 120 reglas `accounting_rules` de `payroll`. **Usa `min(branch_id)` de la organización, no la sede del empleado.** Lo pendiente del Contador está en `docs/design/AUDITORIA-CONTADOR-MATRIZ-2026-11-07.md` | `accounting_rules`, `journal_entries` |
| Pago de la nómina (tesorería o dispersión bancaria) | no existe | `payroll_slips.payment_id` existe sin uso | — |
| PILA (planilla de aportes) | no existe | — | — |
| **Nómina electrónica DIAN** (documento soporte de pago de nómina y notas de ajuste) | **no existe** | El cliente de Factus (`src/lib/services/factusService.ts`, `factusTokenManager.ts`, `einvoicing/*` con cola, reintentos y credenciales en Vault) es reutilizable. Hay que agregar el documento de nómina. | — |
| Prima, cesantías e intereses, vacaciones: liquidación real | no existe | Solo hay **provisiones** mensuales (`employer_severance`, etc.); no se liquidan ni se pagan | — |
| Novedades de nómina (horas extras manuales, bonificaciones, auxilios no salariales, embargos, libranzas) | parcial | Ítems manuales en la colilla (`payroll_items`), sin catálogo de conceptos ni carácter salarial o prestacional configurable | — |

### 1.8 Desempeño y desarrollo

| Qué existe | Estado |
|---|---|
| Evaluaciones, objetivos (OKR o KPI), 360, planes de carrera, capacitación | no existe |
| Productividad y comisiones como reporte | existe en `/app/reportes` (`hrm-productividad`, `hrm-comisiones` en `src/lib/services/reportes/modulos/hrmReports.ts`) |

### 1.9 Bienestar y SST (seguridad y salud en el trabajo)

| Qué existe | Estado |
|---|---|
| SG-SST: matriz de peligros, accidentes, exámenes médicos, EPP, COPASST, capacitaciones | no existe |
| Nivel de riesgo ARL del empleado | existe (`employments.arl_risk_level`, tasas cableadas en `payrollCalculationService.ts:592`) |
| Credenciales de conductor (Transporte) | `driver_credentials` tiene FK a `employments`: el módulo de Transporte ya cuelga de HRM |

### 1.10 Portal del empleado y app móvil

| Qué existe | Estado | Archivos |
|---|---|---|
| Panel del empleado en Inicio: «Mi día», tareas, notificaciones, accesos según el cargo | funciona | `components/inicio/EmployeeDashboard.tsx` (montado en `app/inicio/page.tsx:548`), diseño `25-inicio-05-panel-empleado.png` |
| Tarjeta de turno y botón para marcar entrada o salida | funciona | `TurnoInicio.tsx`, `BotonTurno`, `/api/inicio/turno` |
| Marcación por QR | funciona | `src/app/marcar/page.tsx`, `components/marcar` |
| App móvil con Capacitor 8: contenedor que carga la web | existe | `mobile/` (`capacitor.config.ts`, `android/`, `ios/`), `docs/PLAN_CAPACITOR_MOVIL.md` (contempla biometría y NFC para HRM) |
| Autoservicio: mis colillas, certificados laborales, vacaciones, solicitudes, actualizar datos | **no existe** | No hay rutas `/portal`, `/mi-*` ni de autoservicio |
| GO Assistant con acciones de HRM | no existe | `src/lib/ai/agent/tools/` no tiene herramientas de HRM; la de reportes puede llegar a `hrm-*` por el catálogo |

### 1.11 Retiro

| Qué existe | Estado |
|---|---|
| Fecha, motivo y tipo de terminación | parcial (`termination_date`, `termination_reason`, `termination_type` en `employments`; sin flujo) |
| Liquidación de contrato (prestaciones, vacaciones pendientes, indemnización art. 64), paz y salvo, certificado laboral, retiro de la PILA | no existe |
| Contratos por vencer | parcial: `fn_daily_task_agent` crea tareas de "contratos por vencer" |

### 1.12 Analítica y reportes

| Qué existe | Estado | Archivos |
|---|---|---|
| Reportes en `/app/reportes`, grupo `personas` | funciona | `hrm-nomina`, `hrm-productividad` y `hrm-comisiones` en `src/lib/services/reportes/modulos/hrmReports.ts`, registrados en `src/lib/reportes/reportesCatalogo.ts` |
| Página de reportes **dentro de HRM** (asistencia, ausencias, nómina, préstamos y CSV) | funciona, pero rompe la regla | `hrm/reportes/page.tsx`, `hrmReportsService.ts`, `components/hrm/reportes/*`. Corre en el navegador, está fuera del menú y no pasa por el catálogo |
| Bloque de RR. HH. en el Inicio del administrador | funciona | `components/inicio/sections/HrmSection.tsx`, `hrmDashboardService.ts` (diseño `38-modulos-escritorio-transporte-rrhh.png`) |
| Dashboard propio de HRM | cascarón | `hrm/page.tsx` = `ModuleRootRedirect`. Los widgets `HRMAlerts`, `HRMKPICards`, `HRMPayrollStatus` y `HRMQuickActions` son código muerto |
| Rotación, ausentismo, costo laboral por sede o centro de costo | no existe | — |

---

## 2. El cálculo de la nómina hoy (`payrollCalculationService.ts`)

**Flujo:** el navegador crea el `payroll_run`. Por cada empleado `active` de la organización lee los timesheets del periodo, calcula y hace `insert` en `payroll_slips`. Al final actualiza los totales del periodo. No hay transacción: si falla a mitad, queda un run a medias.

| Concepto | Cómo lo hace | Problema |
|---|---|---|
| Reglas | `country_payroll_rules` con `country_code='CO'`, **la del año más reciente**, sin mirar las fechas del periodo. Si falla, usa valores por defecto de 2024 escritos en el código (L446-466) | El país está cableado. El fallback usa porcentajes en enteros (4, 8.5) y la base en fracciones (0.04): son dos escalas |
| Salario básico | Proporcional a los días con timesheet, sobre 30 días (L562) | Un empleado de salario fijo sin marcaciones queda en 0. No descuenta ausencias no pagadas ni suma licencias pagadas |
| Valor hora | `base / 240` (L537); para `daily`, `/8`; para `weekly`, `/48` | 240 h corresponde a 48 h semanales. La jornada legal bajó con la Ley 2101 (44 h desde julio de 2025 y 42 h desde julio de 2026: hay que validarlo con el Contador) |
| Extras y recargos | Multiplicadores de la regla; nocturno de 21:00 a 06:00 en la consolidación | Festivos en 0 (TODO). La hora nocturna y el recargo dominical cambiaron con la Ley 2466 de 2025 (validar con el Contador). Las extras nocturnas se suman como extra y otra vez como recargo nocturno (L294-297): posible doble cobro |
| Auxilio de transporte | Si `base <= umbral o 2 SMMLV`, proporcional a los días | `transport_allowance_threshold` no existe en la regla 2026 (columna vacía), así que cae a `minimum_wage * 2`. Bien en concepto |
| Salud y pensión del empleado | `basic * (health_employee_pct / 100)` | **Error de escala: con 0.04 en la base queda en 0,04 %.** El IBC excluye extras, recargos y comisiones (deberían entrar). No aplica tope de 25 SMMLV ni piso |
| Fondo de solidaridad | 1 % fijo si gana más de 4 SMMLV (L321) | La tarifa es escalonada (1 % a 2 %) |
| Aportes del empleador | Salud, pensión, ARL y parafiscales `/100` | El mismo error de escala en salud, pensión y parafiscales. ARL sí está bien (`0.522/100`). No aplica la exoneración del art. 114-1 ET (salud, SENA e ICBF para quienes ganan menos de 10 SMMLV). Parafiscales al 9 % sin desglosar caja, ICBF y SENA |
| Provisiones | Cesantías `(básico + transporte) * 0.0833`, intereses, vacaciones y prima | Base incompleta (sin extras ni comisiones); solo provisiona, no liquida |
| Retención | Deja `NULL` a propósito para que se digite a mano | Está la función `fn_retencion_art383` y no se usa |
| Préstamos | Cuotas con `auto_deduct` y vencimiento dentro del periodo | Bien; se fijan con RPC. No aplica el tope de `max_deduction_pct` |
| Redondeo | Ninguno | Las colillas quedan con decimales; el asiento y la nómina electrónica exigen pesos |
| Estimación del periodo | `deductions = basic * 0.08` (L715) | Atajo fijo |

**Tests:** no hay pruebas del cálculo. Las que existen cubren deducciones (`nominaDeducciones.test.ts`, `DeduccionesPeriodo.render.test.tsx`), estados del periodo (`nominaEstadosPeriodo.test.ts`), comisiones y zona horaria (`src/__tests__/timezone/nominaHrm.test.ts`).

---

## 3. Base de datos: resumen por tabla

| Tabla | Filas | Columnas | `organization_id` | RLS | Triggers |
|---|---|---|---|---|---|
| `employments` | 107 (40 orgs) | 33 | **no** (por `organization_member_id`) | membresía doble anidada, rol `public`, CRUD | moneda por defecto, centro misma org, `updated_at` |
| `departments` | 240 | 12 | sí | membresía, CRUD | `updated_at` |
| `job_positions` | 840 | 13 | sí | membresía, CRUD | permisos por defecto ×2, `updated_at` |
| `job_position_permissions` | 240 | 6 | por cargo | **la única bien hecha**: escritura con `fn_roles_puede(org,'hr.positions.edit')` y `(select auth.uid())` | `log_role_changes` |
| `job_position_module_access` / `_page_access` | 0 / 0 | 7 / 8 | por cargo | ALL por membresía | — |
| `compensation_packages` / `_components` | 0 / 0 | 16 / 17 | sí / por paquete | membresía, CRUD | `updated_at` |
| `employment_compensation` | 0 | 13 | por empleo | membresía (join con `employments`) | `updated_at` |
| `country_payroll_rules` | 3 (`CO`) | 31 | global | `SELECT true` | `updated_at` |
| `fiscal_uvt` | 3 (`COL`) | 5 | global | `SELECT true` (authenticated) | — |
| `payroll_periods` | 0 | 19 | sí | membresía, CRUD | asiento del periodo, bloqueo de cierre, notificación, `updated_at` |
| `payroll_runs` | 0 | 12 | por periodo | membresía | `updated_at` |
| `payroll_slips` | 0 | 44 | por run → periodo | membresía (join de 2 niveles) | **asiento**, guarda de deducciones, `updated_at` |
| `payroll_items` | 0 | 17 | por colilla | membresía (join de 3 niveles) | — |
| `employee_loans` / `loan_installments` | 0 / 0 | 32 / 15 | sí / por préstamo | membresía | generar cuotas, asientos, aplicar pago |
| `leave_types` / `leave_requests` / `leave_balances` | 0 / 0 / 0 | 20 / 23 / 15 | sí | membresía | saldo al cambiar la solicitud |
| `attendance_events` | 0 | 18 | sí | membresía | `hrm_process_attendance_event` (zona fija `America/Bogota`) |
| `timesheets` / `timesheet_adjustments` | 0 / 0 | 24 / 13 | sí / por timesheet | membresía | `updated_at` |
| `shift_templates` / `shift_rotations` / `shift_assignments` | 0 / 0 / 0 | 17 / 9 / 16 | sí | membresía | notificar turno asignado |
| `time_clocks` | 0 | 15 | sí | membresía | `updated_at` |

- **Vínculos:**
  - `employments → organization_members` (CASCADE), `→ branches`, `→ departments`, `→ job_positions`, `→ cost_centers` y `→ employments` (jefe).
  - No hay vínculo directo con `chart_of_accounts`: va por `accounting_rules` y las claves de `configuracionContable.ts`.
  - Apuntan a `employments`: `attendance_events`, `departments`, `driver_credentials`, `employee_loans`, `employment_compensation`, `leave_balances`, `leave_requests`, `payroll_slips`, `shift_assignments` y `timesheets`.
- **Catálogo de permisos `hr.*` en la base:** solo siete códigos: `hr.leaves.approve`, `hr.payroll.process`, `hr.payroll.view` y `hr.positions.create`, `.delete`, `.edit` y `.view`. El código referencia `hr.employees.view` (migración `20260930170300`), que **no está en `permissions`**. Las constantes `hrm.access` y `hrm.manage` de `src/lib/middleware/permissions.ts:314` no se usan.
- **Storage:** no hay bucket de RR. HH.
- **Funciones relevantes:**
  - `fn_nomina_fijar_deduccion`, `fn_nomina_run_vigente`, `fn_retencion_art383` y `fn_uvt`;
  - `fn_auto_journal_payroll`, `fn_auto_journal_payroll_period`, `fn_auto_journal_employee_loan` y `fn_auto_journal_loan_installment`;
  - `fn_comisiones_pagar_por_nomina`, `fn_notify_payroll_approved`, `fn_notify_shift_assigned` y `create_employment_for_new_member`;
  - `fn_daily_task_agent`, que genera tareas de nómina vencida, turnos, ausencias y contratos.
- **No hay RPC de cálculo de nómina.**

---

## 4. Permisos y acceso

- **Cómo se entra:**
  1. `src/middleware.ts` (`checkModuleAccess`, ~L683-790) revisa, en este orden: `organization_modules` (hrm activo), `modules.is_core` (hrm es de pago, rango 700), las páginas apagadas en `organization_module_pages` y el acceso por cargo en `job_position_module_access` y `_page_access`.
  2. **Si la consulta falla, deja pasar** (comentarios en L755 y L763).
- **Menú:** sale de `src/lib/navigation/catalog.ts:539-559` (Personas / Tiempo / Pagos) y `rutasModulos.ts:265-280`, filtrados por la base. No está cableado en la UI.
  - Fuera del catálogo: `reportes`, `plantillas-turno`, `rotaciones` y `turnos/tipos/nuevo`.
- **Habilitación:** `moduleManagementService.ts:112-210`. El plan limita la cantidad de módulos opcionales (`plans.max_modules`); `hrm` cuenta como opcional.
- **Dentro del módulo:**
  - Solo `cargos/page.tsx:64-72` usa `useUserPermissions`, y lo hace en el cliente.
  - Ninguna ruta `/api/**` de HRM pasa por `getServerOrgContext()`. Solo existen `/api/inicio/turno` y `/api/crm/roles/job-positions`; todo lo demás va del navegador directo a PostgREST.
- **Datos sensibles: no hay protección por campo.** Salario, cuenta bancaria, EPS, colillas y préstamos llegan completos a cualquier miembro, porque las RLS solo exigen membresía en la organización y ni siquiera `is_active`. Esos miembros también pueden escribir: `UPDATE` y `DELETE` sobre `payroll_slips` y `employments`.
- **Como referencia:** `src/lib/services/integrations/payfac/enmascarar.ts` enmascara en el servidor; `fn_roles_puede` y `fn_finanzas_exigir_permiso` sirven para las guardas en SQL.

---

## 5. Qué reutilizar y qué rehacer

### Reutilizar (construir encima)
1. **Tablas del núcleo de tiempo:** `shift_templates`, `shift_rotations`, `shift_assignments`, `time_clocks`, `attendance_events`, `timesheets` y `timesheet_adjustments`. El esquema es razonable, tienen `organization_id` y `branch_id`, y están vacías. Solo hay que corregir el trigger de zona horaria y los descansos.
2. **Ausencias:** `leave_types`, `leave_requests` y `leave_balances`, con su trigger. Hay que extenderlas con la clase legal (vacaciones, incapacidad EPS/ARL, licencias) y el efecto en la nómina.
3. **Préstamos:** `employee_loans` y `loan_installments`, con sus triggers de cuotas y asientos.
4. **Esqueleto de nómina:** `payroll_periods`, `payroll_runs`, `payroll_slips` y `payroll_items` (con estados, `is_final`, `superseded_by`), los triggers de bloqueo y de deducciones, `fn_nomina_fijar_deduccion`, `nominaDeducciones.ts` y `DeduccionesPeriodo.tsx`. Este último ya está en el kit, con i18n y test.
5. **Contabilización por trigger:** `fn_auto_journal_payroll*`, con `fact_key` y la bandeja de fallos, más `configuracionContable.ts`. Hay que corregir la sede y cerrar con el Contador la separación de aportes, prestaciones y retención.
6. **Retención:** `fn_retencion_art383` + `fiscal_uvt`. Falta completar la depuración de la base.
7. **Parámetros legales:** `country_payroll_rules` con vigencia. Hay que unificar la escala (fracción) y el código de país (`CO` en la regla, `COL` en `fiscal_uvt` y `organizations`).
8. **Estructura y acceso:** `departments`, `job_positions`, `job_position_*` (permisos y acceso a módulos y páginas), el middleware de módulo y el catálogo de navegación.
9. **Integraciones:**
   - el cliente de Factus y su cola (`src/lib/services/einvoicing/*`), para la nómina electrónica;
   - el adaptador de firma `EsignAdapter` (Documenso) del CRM, para los contratos laborales;
   - el registro de reportes de `/app/reportes` (`reportesCatalogo.ts` + `modulos/hrmReports.ts`);
   - `EmployeeDashboard`, `TurnoInicio` y `/marcar`, como base del portal;
   - la app Capacitor de `mobile/`.
10. **Comisiones → nómina:** `fn_comisiones_pagar_por_nomina`, ya probado.

### Rehacer
1. **El motor de cálculo de nómina** debe pasar a una RPC transaccional en Postgres, o a un servicio de servidor más una RPC de escritura. Debe ser idempotente por run, con conceptos parametrizados (salarial / no salarial / prestacional), IBC correcto, topes, exoneración del art. 114-1, solidaridad escalonada, redondeo, festivos y reglas según la fecha del periodo, y **con pruebas**. El `payrollCalculationService.ts` actual no se debe corregir: se reemplaza.
2. **El modelo de empleado** debe permitir personas sin cuenta de usuario. Hacen falta:
   - un `organization_id` propio y un `user_id` / `organization_member_id` opcional;
   - documento de identidad, datos personales, beneficiarios y contacto de emergencia;
   - CCF y entidades de seguridad social con catálogo;
   - historial de contratos y cambios salariales.

   El trigger `create_employment_for_new_member`, que convierte en empleado a cada miembro, hay que revisarlo, porque mezcla "usuario de la app" con "trabajador".
3. **RLS de todas las tablas de HRM:** pasar a permisos (`hr.employees.view`, `hr.payroll.view` y `.process`, `hr.leaves.approve`, `hr.attendance.*`) con `(select auth.uid())` y `IN (SELECT ... JOIN)`, como recomienda la memoria del proyecto. Además, separar los campos sensibles (salario, banco, documento) en una tabla o vista con su propio permiso.
4. **La capa de acceso:** route handlers con `getServerOrgContext()` / `withOrg` para todo lo que escribe dinero. Hoy son 11 páginas con el cliente `@/lib/supabase/config` y `insert` directos.
5. **La UI completa:** las 50 páginas al kit nuevo, con tokens, sin `dark:` y en cuatro idiomas (es/en/fr/pt). Según la memoria del proyecto, primero se diseña en Figma y se pasa a código con aprobación.
6. **Compensación:** decidir si los paquetes y componentes con fórmula libre se conservan o se reemplazan por un catálogo de conceptos de nómina. Hoy nada los consume.
7. **Reportes:** mover asistencia, ausencias y préstamos de `/app/hrm/reportes` a `/app/reportes` (grupo `personas`) y borrar la página.
8. **Código muerto:** borrar `HRMAlerts`, `HRMKPICards`, `HRMPayrollStatus`, `HRMQuickActions`, `components/hrm/index.ts`, `components/hrm/configuracion/*` y `turnos/tipos/nuevo`, que duplica las plantillas.

### Construir desde cero
Hay que construir desde cero:
- reclutamiento y la sección de empleo del sitio web;
- ingreso con checklist y contrato firmado;
- expediente documental con su bucket privado;
- vacaciones e incapacidades legales;
- liquidación de prima, cesantías e intereses y vacaciones;
- liquidación de contrato y retiro;
- PILA;
- nómina electrónica DIAN por Factus;
- pago y dispersión, enlazado a tesorería con `payment_id`;
- desempeño;
- SG-SST;
- portal de autoservicio (colillas, certificados, solicitudes);
- herramientas del GO Assistant para HRM;
- calendario de festivos;
- analítica (rotación, ausentismo, costo laboral por sede o centro de costo).

---

## 6. Riesgos

| # | Riesgo | Severidad | Dónde |
|---|---|---|---|
| R1 | **Las deducciones y aportes salen 100 veces menores** (porcentaje en fracción dividido por 100). Una nómina corrida hoy descontaría casi nada de salud y pensión | crítica | `payrollCalculationService.ts:315-331` frente a `country_payroll_rules` |
| R2 | Cualquier miembro de la organización lee y **modifica** salarios, cuentas bancarias y colillas | crítica | RLS de `employments`, `payroll_*`, `employee_loans`, `compensation_*` |
| R3 | El cálculo y la escritura de la nómina ocurren en el navegador, sin transacción ni redondeo; la aprobación de colillas es un `update` directo | alta | `payrollCalculationService.ts` (`'use client'`), `payrollService.ts:516` |
| R4 | No hay documento de identidad del empleado: sin él no se puede hacer PILA, nómina electrónica ni certificados | alta | `employments`, `profiles` |
| R5 | El empleado depende de que exista un usuario (`organization_members`, ON DELETE CASCADE): **borrar al miembro borra el historial laboral** | alta | FK `employments.organization_member_id` |
| R6 | Parámetros legales desactualizados o cableados: 240 h, nocturno desde las 21:00, solidaridad al 1 %, tasas ARL en el código, regla del "año más reciente" y no del periodo, fallback 2024 en enteros | alta | `payrollCalculationService.ts:446-466,537,592`, `timesheetConsolidationService.ts:87-88` |
| R7 | Zona horaria: el trigger de marcación tiene `America/Bogota` fijo (viola la regla 6 de fechas); hay `new Date('YYYY-MM-DD')` en la ficha, los turnos y la marcación; "hoy" y la hora salen del navegador | media | `hrm_process_attendance_event`, `empleados/[id]/page.tsx:437,570,571`, `turnos/[id]/page.tsx:267,341`, `marcacion/page.tsx:62,202,223,244`, `ManualEntryForm.tsx:62-63,99-100`, `asistencia/comparacion/page.tsx:51,70,81` |
| R8 | El asiento de nómina va siempre a la sucursal con menor id (`min(branch_id)`), no a la del empleado | media | `fn_auto_journal_payroll` |
| R9 | El middleware deja pasar si falla la consulta de acceso | media | `src/middleware.ts` ~L755, L763 |
| R10 | El permiso `hr.employees.view` se referencia pero no existe en `permissions`; `hrm.access` y `hrm.manage` no se usan | media | migración `20260930170300`, `permissions.ts:314` |
| R11 | Préstamos: cuotas calculadas en el cliente, la última sin ajuste, `setMonth` que salta meses y `max_deduction_pct` sin aplicar | media | `employeeLoansService.ts:191-219,415-430`, `LoanForm.tsx:81-97` |
| R12 | Los soportes (incapacidades, ajustes) apuntan a una ruta de storage que no existe y no hay bucket privado de RR. HH. | media | `asistencia/ajustes/page.tsx:148` |
| R13 | Hay 4 enlaces rotos a reportes y 4 páginas fuera del menú. La página de reportes de HRM viola la regla de que los reportes viven solo en `/app/reportes` | baja | `DepartmentReports.tsx`, `hrm/reportes` |
| R14 | Código de país inconsistente (`CO` frente a `COL`): `fn_auto_journal_payroll` compara con `'COL'`, mientras el cálculo busca reglas `'CO'` | baja-media | `country_payroll_rules`, `fiscal_uvt`, `organizations.country_code` |
| R15 | RLS con `EXISTS` / `IN` anidados de 2 o 3 niveles sin `(select auth.uid())`: riesgo de timeouts cuando haya volumen (ya pasó en otras tablas) | baja hoy | `payroll_items`, `payroll_slips`, `employments` |

**Nota legal:** los valores 2026 (SMMLV 1.750.905 y auxilio 249.095), la jornada de las leyes 2101 y 2466, los recargos y la tabla del art. 383 deben pasar por el Contador antes de fijarse como regla. Este informe no los da por verificados.
