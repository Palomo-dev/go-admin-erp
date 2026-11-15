# ADR-001 · Recursos humanos, fase 0: modelo de fundaciones

- **Fecha:** 2026-11-14.
- **Estado:** aceptado. El dueño aprobó el plan (`PLAN-GESTION-HUMANA.md`) con todas sus recomendaciones el 2026-11-14.
- **Alcance:** solo backend: esquema, funciones, RLS, bucket, servicios y route handlers. **No hay pantallas nuevas.** La UI se está diseñando en Figma y entra cuando el dueño la apruebe.
- **Insumos:**
  - `AUDITORIA-HRM-2026-11-14.md`, §3 a §6 y riesgos R2, R4, R5, R6, R7, R10, R14 y R15;
  - `INVESTIGACION-NORMATIVA-CO-2026-11-14.md`, §12;
  - el esquema real, consultado por el MCP en el proyecto `taqjemqjtumhwptchcxk` el mismo día.

## 0. Lo que encontré en la base antes de diseñar

| Hecho | Consecuencia para el diseño |
|---|---|
| `employments` tiene 107 filas en 40 organizaciones. Ninguna tiene salario, banco, EPS, AFP, ARL ni cesantías (conteo = 0). Todas tienen un miembro válido. | Se puede congelar el uso de las columnas sensibles heredadas sin migrar datos. |
| `employments` no tiene `organization_id`. Su FK a `organization_members` es `ON DELETE CASCADE` (R5). Diez tablas apuntan a `employments` sin `ON DELETE`, salvo `driver_credentials`, que tiene `CASCADE`. | Hoy, borrar un miembro sin historial borra su vínculo laboral en silencio. Si tiene historial, falla por FK. |
| Las 4 organizaciones con HRM activo (135, 137, 374 y 375) tienen 1 o 2 miembros activos cada una, y **todos son rol 1 (Super Admin) o rol 2 (Admin de organización)**. Ninguno tiene cargo. Tienen 6 vínculos laborales en total, todos sin jefe. | Si los permisos nuevos se le dan a los roles 1 y 2 como datos, ninguna de las 4 organizaciones pierde acceso. |
| `organizations.country_code` usa `COL` en 37 de 40 organizaciones, igual que `fiscal_uvt` y `fn_auto_journal_payroll`. Solo `country_payroll_rules` usa `CO`. | El código canónico es **`COL`** (ISO 3166-1 alfa-3). |
| `fiscal_uvt` tiene COL 2024, 2025 y 2026 (52.374, Resolución DIAN 000238 de 2025). `fn_uvt` la lee y `fn_retencion_art383(base, uvt)` recibe la UVT por argumento. | La UVT se queda en `fiscal_uvt`. No se duplica. |
| `role_permissions.scope` existe, pero `check_user_permission` lo ignora. `job_position_permissions` no tiene scope, y `fn_cargo_guardar_permisos` borra y reinserta filas, así que un scope por fila se perdería. | El alcance «solo su equipo» se modela como un **código de permiso** aparte (`*.view_team`). Así funciona en las pantallas de roles y cargos que ya existen, sin tocar `check_user_permission`. |
| Todas las RLS de HRM son `to public`, con membresía anidada sin `(select auth.uid())`, y casi ninguna exige `is_active`. `job_position_module_access` y `_page_access` dejan que cualquier miembro **se dé acceso a sí mismo** a módulos y páginas. | Se reescriben todas en esta fase (§9). |
| El trigger `hrm_process_attendance_event` es `SECURITY INVOKER` y escribe en `timesheets` como el empleado que marca. | Si `timesheets` se cierra, la marcación se cae. El trigger pasa a `SECURITY DEFINER` en la misma migración. |
| `/marcar` (`qrAttendanceService.ts`) lee `time_clocks` con `select('*')`, incluido `current_qr_token`, y valida el QR **en el navegador**. | Se mantiene la lectura de `time_clocks` para miembros para no romper `/marcar`. Rehacer la validación del QR en el servidor queda para la fase 2 (§11). |
| `HRMAlerts`, `HRMKPICards`, `HRMPayrollStatus`, `HRMQuickActions` y `components/hrm/index.ts` los importa `components/inicio/sections/HrmSection.tsx`. `components/hrm/configuracion/*` lo importa `HRMConfigPanel.tsx`. `ShiftCreateForm.tsx` enlaza a `turnos/tipos/nuevo`. | **No es código muerto.** La auditoría (§5, Rehacer, punto 8) se equivocó en esto, y no se borra nada (§11). |
| No están `btree_gist` ni restricciones de exclusión. Sí está `pg_cron`. | El no solapamiento de vigencias se valida con un trigger. Los eventos con fecha futura se aplican con un job diario. |

## 1. Las cinco decisiones principales

1. **La persona (`hr_people`) existe sin usuario, y `employments` pasa a ser su vínculo laboral.**
   - `employments` gana `organization_id` y `person_id`.
   - `organization_member_id` se vuelve opcional, y su FK pasa de `CASCADE` a `SET NULL`.
   - Las 107 filas se conservan. A cada una se le crea su persona a partir de `profiles`.
2. **Los datos sensibles salen de las tablas que se leen con RLS.**
   - Viven en tablas sin política para `authenticated`: identificación, beneficiarios, contactos de emergencia y cuentas bancarias.
   - El salario vive en el historial y no se ve por RLS.
   - Todo eso se lee y se escribe **solo por RPC**, que comprueba el permiso del grupo y deja el registro de acceso en la misma transacción.
   - Las columnas sensibles heredadas de `employments` (`base_salary`, `bank_*`, `eps_code`, `afp_code`, `arl_code`, `arl_risk_level` y `severance_fund_code`) quedan **congeladas**: un trigger rechaza cualquier valor no nulo.
3. **Los permisos van por grupo de datos y con código propio para el equipo.**
   - Cada grupo tiene `hr.data.<grupo>.view`, `.view_team` y `.edit`. Además están `hr.employees.view` / `.view_team` y los de asistencia, ausencias, aprobaciones, parámetros y registro.
   - Todo se resuelve con `check_user_permission`, que mira rol y cargo con precedencia del cargo. Ninguna regla de HRM compara `role_id` ni nombres de rol.
   - Los roles 1 y 2 reciben los códigos como **datos** de `role_permissions`, y cada organización puede quitárselos desde el cargo.
4. **Parámetros por vigencia de plataforma y de organización, con escala única (fracción) y país `COL`.**
   - `fn_hr_parametro(org, code, fecha)` toma primero el valor de la organización y luego el de la plataforma.
   - Un parámetro `por_confirmar` **no se usa para calcular**: la función lo rechaza.
   - `country_payroll_rules` queda como legado de solo lectura. `fiscal_uvt` sigue siendo la fuente de la UVT.
5. **Un motor de aprobaciones genérico, con decisiones solo por RPC transaccional.**
   - Reglas con condiciones, cadena de aprobadores (jefe directo, jefe del área, rol o persona), delegaciones con fechas, e instancias con pasos y decisiones de solo inserción.
   - Lo estrena el **historial con fecha de efecto**: un cambio de salario, cargo, sede o jornada es un evento que pasa por aprobación si hay una regla que le aplique.

## 2. Persona-empleado (R4, R5)

### Tablas

| Tabla | Grupo | Contenido | Acceso |
|---|---|---|---|
| `hr_people` | básico | `organization_id`, nombres y apellidos, correo y teléfono laborales, `user_id` (FK `auth.users`, `SET NULL`) y `organization_member_id` (FK `SET NULL`), ambos opcionales; `status` | RLS: la propia persona, su equipo (`hr.employees.view_team`) o toda la organización (`hr.employees.view`). Escritura con `hr.employees.create` / `.edit`. Sin `DELETE`. |
| `hr_people_identification` | identificación | tipo y número de documento (**únicos por organización**), expedición, nacimiento, sexo, nacionalidad, estado civil, correo y teléfono personales, dirección, municipio, nivel educativo | **Sin acceso directo** (RLS sin políticas; `anon` y `authenticated` sin privilegios). Solo por RPC. |
| `hr_person_beneficiaries` | identificación | parentesco, documento, nacimiento, dependiente para retención, beneficiario de caja o de salud | Solo por RPC |
| `hr_person_emergency_contacts` | identificación | nombre, parentesco, teléfonos, prioridad | Solo por RPC |
| `hr_person_bank_accounts` | banco | banco, tipo, número, titular, principal, vigencia | Solo por RPC |

El tipo de documento sigue los códigos de la DIAN y la PILA: `CC`, `CE`, `TI`, `RC`, `PA`, `PEP`, `PPT`, `NIT`, `NUIP` y `DIE`.

### Cómo convive con `employments`

- `employments` **es el vínculo laboral** de una persona. Una persona puede tener varios vínculos en el tiempo, por ejemplo si se reintegra.
- Columnas nuevas, ambas `NULL`-ables:
  - `organization_id`, rellenada desde el miembro. Un `CHECK` validado impide que quede vacía.
  - `person_id` → `hr_people`.
- El trigger `trg_000_employments_organizacion` (corre antes que `trg_00_moneda_base_por_defecto`, que ya lee `organization_id`) hace tres cosas:
  1. deriva `organization_id` del miembro;
  2. exige que la organización del miembro, la del vínculo y la de la persona coincidan;
  3. si falta la persona y hay miembro, la busca o la crea desde `profiles`.
  Por eso **`create_employment_for_new_member` no cambia**: cada miembro nuevo sigue naciendo como empleado y ahora con su persona.
- **R5:** `organization_member_id` deja de ser `NOT NULL` y su FK pasa a `ON DELETE SET NULL`. Lo mismo `hr_people.organization_member_id`. Borrar un usuario deja vivos el vínculo, la persona y su historial; solo se pierde el enlace a la cuenta.
- **Columnas sensibles heredadas:** `trg_employments_campos_sensibles_legados` rechaza (42501, `hr_campo_legado_congelado`) cualquier `INSERT` o `UPDATE` que ponga un valor no nulo en ellas. Ponerlas en nulo sí se permite. No se borran columnas (regla de migraciones aditivas).
- **El trigger de alta que convierte a cada miembro en empleado** se conserva. Quitarlo cambiaría `TurnoInicio` y el panel del empleado para las 4 organizaciones, y la separación «usuario de la app ≠ trabajador» ya la resuelve la persona. Si se apaga, lo decide la fase 1 con su UI.

### Visibilidad de `employments`

`employments` queda **visible para todo miembro activo de la organización**, que es lo que hacía antes, ahora con `is_active` y `(select auth.uid())`. Sin eso se rompen Transporte (conductores), Domicilios, Gimnasio (entrenadores), Envíos, los agentes del Chat, Roles y el detalle de departamentos, que leen `employments` con el cliente del navegador. Lo que la hacía peligrosa eran las columnas sensibles, y quedan congeladas y vacías. La escritura sí se cierra: ver §9.

## 3. Historial con fecha de efecto («un solo dato, varios procesos»)

**`hr_employment_events`:**
- **Qué guarda:** `employment_id`, `field`, `effective_from`, `old_value` y `new_value` (jsonb), `reason`, `status` (`pendiente`, `aprobado`, `rechazado` o `anulado`), `approval_instance_id`, `requested_by`, `approved_by`, `approved_at` y `applied_at`.
- **Campos:** `salario`, `periodo_salario`, `cargo`, `sede`, `area`, `jefe`, `jornada_horas_semana`, `tipo_contrato`, `fin_contrato`, `centro_costo` y `tipo_vinculacion`.
- **Grupo:** `salario` y `periodo_salario` son del grupo `salario_pago`; los demás son básicos.
- **Inmutable:** un trigger impide cambiar los valores y borrar filas. Solo cambian el estado y los campos de aprobación y aplicación, y únicamente desde las funciones.
- **RLS:** los eventos básicos los ven la persona misma, su jefe (`view_team`) y quien tenga `hr.employees.view`. Los de salario **no salen por RLS**: se leen con `fn_hr_datos_sensibles_leer` (grupo `salario_pago`), que deja registro.

**Funciones:**
- `fn_hr_valor_vigente(employment, campo, fecha) → jsonb`
  - Devuelve el último evento aprobado con `effective_from <= fecha`. Si no hay ninguno, devuelve la columna actual de `employments`, que es el estado inicial; para el salario devuelve nulo.
  - Para el salario exige permiso o ser la propia persona, y deja registro.
- `fn_hr_valor_tramos(employment, campo, desde, hasta)`: los tramos del período con su valor, para cuando un período cruza un cambio.
- `fn_hr_registrar_cambio(employment, campo, efectivo, valor, motivo, contexto)`. Hay dos caminos:
  - **Quien tiene el permiso `edit` del grupo:** si una regla de aprobación le aplica, el evento queda `pendiente` con su instancia. Si no, queda `aprobado` de inmediato.
  - **Un jefe sobre alguien de su equipo, sin permiso `edit`:** solo puede **proponer**, y la propuesta exige que exista una regla (`requiere_regla_de_aprobacion` si no la hay).
  En ambos casos valida el valor según el campo y que pertenezca a la organización: cargo, sede, área, jefe y centro de costo.
- **Aplicación:**
  - Un evento aprobado con fecha de hoy o anterior se copia a la columna actual de `employments` (cargo, sede, área, jefe, jornada, contrato…), que es lo que leen las pantallas de hoy.
  - El salario **no** se copia, porque su columna está congelada.
  - Los eventos con fecha futura los aplica `fn_hr_aplicar_eventos_vigentes()`, un job diario de `pg_cron` (`hrm-aplicar-eventos`).
- **Cambios directos:** si una pantalla vieja cambia `position_id`, `branch_id`, etc. directamente, un trigger `AFTER UPDATE` lo registra como evento `aprobado` con el motivo «Cambio directo». Así el historial no tiene huecos mientras llega la UI nueva.

## 4. Parámetros legales por vigencia (R6, R14)

### Tablas

- **`hr_parameter_catalog`:** `code`, nombre, unidad (`fraccion`, `cop`, `smmlv`, `uvt`, `horas`, `hora_del_dia`, `dias`, `semanas`, `entero`, `tabla`, `texto` o `booleano`), referencia a la §12 y **regla de sobrescritura por organización**:
  - `no`;
  - `libre`;
  - `no_mayor`: la organización puede bajar el valor, no subirlo, como la jornada;
  - `no_menor`: puede subirlo, no bajarlo, como el recargo dominical.
- **`hr_legal_parameters`** (plataforma):
  - **Columnas:** `country_code` (`COL`), `code`, `value` (numeric) o `value_json` (tablas), `effective_from` y `effective_to`, `status`, `verificacion`, `legal_source`, `source_url` y `notes`.
  - **`status`:** `vigente`, `transitorio`, `litigio` o `por_confirmar`.
  - **`verificacion`:** `V`, `S` o `NC`, la misma marca de la investigación.
  - **Validaciones:** un trigger impide vigencias solapadas por país y código. Un `CHECK` exige valor salvo en `por_confirmar`.
  - **RLS:** lectura para `authenticated`. Escritura solo por migración o con la service role.
- **`hr_org_parameters`** (organización):
  - **Columnas:** `organization_id`, `code`, valor, vigencia, motivo y autor.
  - **Validaciones:**
    - el código debe permitir la sobrescritura;
    - se respeta la regla `no_mayor` / `no_menor` frente al valor de plataforma en la misma fecha;
    - no se admiten vigencias solapadas.
  - **RLS:** la leen los miembros; la escribe quien tenga `hr.parameters.manage`.

### Qué puede fijar la organización

Primero, lo que la §12-E permite:
- la periodicidad de pago (32);
- el tamaño de la empresa y los estándares del SG-SST (33);
- la retención documental y el plazo del banco de hojas de vida (34);
- los mecanismos de marcación (35).

Además, tres opciones por empresa que la investigación pide de forma expresa, siempre en el sentido más favorable al trabajador:
- adoptar antes la jornada menor (B-9, `no_mayor`);
- adoptar antes el 100 % dominical (B-11, `no_menor`);
- la bandera de exoneración del art. 114-1 del empleador (C-19, `libre`).

Nada más es sobrescribible. Las tarifas de aportes, el SMMLV y las tablas son de la plataforma.

### Funciones

- **`fn_hr_parametro(org, code, fecha) → numeric`**:
  - toma primero el valor de la organización y luego el de la plataforma del país de la organización;
  - falla con `parametro_no_configurado` (P0002) si no hay valor;
  - falla con `parametro_por_confirmar` si el que aplica está por confirmar;
  - falla con `parametro_es_tabla` si el parámetro es una tabla.
- **`fn_hr_parametro_json(...)`:** el mismo comportamiento, para las tablas (FSP, ARL, art. 383, incapacidades, indemnización).
- **`fn_hr_parametro_detalle(...) → jsonb`:** valor, origen, estado, verificación, fuente y vigencia. Sirve para que la UI muestre de dónde sale cada número y **no** falla con lo que está por confirmar.
- **`fn_hr_parametro_tramos(org, code, desde, hasta)`:** parte un período en los tramos en que cambia el valor (§12: «un período puede necesitar dos valores»). Ejemplo: julio de 2026, jornada de 44 h hasta el 14 y de 42 h desde el 15.
- **`fn_hr_pais(org)`:** normaliza `CO`, `COL` o la falta de código a `COL`.

### Escala y país

- **Escala:** todo porcentaje va en **fracción** (`0.04`, `0.085`, `0.90`). Las horas del día van en horas (`19`). Los múltiplos del SMMLV o de la UVT van en su unidad (`25`, `32`).
- **País:** `COL`, ya usado en las organizaciones, en `fiscal_uvt` y en `fn_auto_journal_payroll`.

### `country_payroll_rules` y `fiscal_uvt`

- **`country_payroll_rules` no se toca.**
  - Solo la leen el cálculo viejo en el navegador (`payrollCalculationService.ts`, que se reemplaza en la fase 3) y la página de solo lectura `reglas-pais`.
  - `fn_auto_journal_payroll` no la usa.
  - Se le agrega un `comment on` que la marca como legado. Corregirle la escala no arregla R1, porque el error está en el TypeScript.
- **`fiscal_uvt` sigue siendo la fuente de la UVT.**
  - `fn_hr_parametro(org, 'uvt', fecha)` la lee por año gravable.
  - `fn_uvt` y `fn_retencion_art383` no cambian.
  - La UVT de 2027 **no se inserta**: la DIAN no la ha publicado, y el «$55.684» de la prensa es una estimación (NC). Mientras no esté, `fn_hr_parametro` falla con `parametro_no_configurado`.

### Carga de valores

- **Qué se carga:** los valores de 2026 y los ya programados para 2027, con su norma y su URL, tal como los trae la investigación.
- **Lo que está vigente el 1-ene-2026 aunque empezó en 2025** también se carga desde su fecha real, porque sin eso no se puede calcular el primer semestre de 2026:
  - jornada de 44 h desde el 15-jul-2025;
  - recargo dominical del 80 % desde el 1-jul-2025;
  - nocturno desde las 19:00, a partir del 25-dic-2025.
- **Lo marcado [NC]:**
  - va como `por_confirmar` y no recibe ningún valor inventado: el SMMLV y el auxilio de transporte de 2027 van sin valor;
  - la tabla del FSP de la Ley 2381 se carga con los valores que da la investigación, pero en `por_confirmar` y con `verificacion = NC`, así que nadie la usa para calcular hasta que se confirme.
- **Lo marcado [S]:** el SMMLV y el auxilio de 2026, el divisor de hora, la tabla del art. 383 y algunos topes de depuración. Se cargan con su estado jurídico (por ejemplo, el SMMLV 2026 en `transitorio`, Decreto 0159, con el litigio en `notes`) y con `verificacion = S`. **El Contador los revisa antes de la fase 3.** Esta lectura sale de la leyenda de la investigación: [NC] es lo «no confirmado»; [S] está respaldado por fuentes secundarias que coinciden entre sí.

## 5. Festivos

- **`hr_holidays`:** los festivos de la plataforma por país y fecha, con nombre, clase (`fijo`, `trasladable`, `pascua` o `pascua_trasladable`) y fuente (Ley 51 de 1983 y Ley 37 de 1905).
  - Los calcula `fn_hr_festivos_calcular(anio)`, con la Pascua por el algoritmo gregoriano anónimo y el traslado al lunes siguiente.
  - Se cargan 2026 y 2027, 18 por año, comprobados contra el calendario publicado de 2026.
  - `fn_hr_festivos_cargar(anio)` (solo con la service role) carga años futuros.
- **`hr_org_holidays`:** los días propios de la organización, opcionalmente por sede, como el aniversario o un día cívico local. Los leen los miembros y los escribe `hr.parameters.manage`.
- **Funciones:**
  - `fn_hr_es_festivo(org, fecha, sede)`;
  - `fn_hr_festivos(org, desde, hasta, sede)`.

## 6. Permisos por grupo de datos (R10)

### Códigos nuevos

Todos van en el módulo `hr`.

| Código | Para qué |
|---|---|
| `hr.employees.view` / `.view_team` / `.create` / `.edit` | Datos básicos del empleado y su vínculo. `view_team` = solo su equipo. **Cierra R10**: `hr.employees.view` ya lo usaba `fn_inicio_modulos_resumen` y no existía. |
| `hr.data.<grupo>.view` / `.view_team` / `.edit` | Para cada grupo: `identificacion`, `salario_pago`, `banco`, `salud`, `disciplinario` y `sst`. |
| `hr.data.export` | Exportar datos sensibles; la acción también queda en el registro. |
| `hr.attendance.view` / `.manage` | Turnos, marcaciones y timesheets de toda la organización, y su gestión. |
| `hr.leaves.view` | Ver las ausencias de toda la organización. `hr.leaves.approve` ya existía. |
| `hr.departments.manage` | Crear y editar áreas. |
| `hr.approvals.manage` | Configurar reglas de aprobación y actuar como aprobador de respaldo. |
| `hr.parameters.manage` | Parámetros y festivos propios de la organización. |
| `hr.access_log.view` | Consultar el registro de accesos. |

### Equipo

El «equipo» de una persona son los empleados que:
- dependen de alguno de sus vínculos por `manager_id`, en cualquier nivel;
- o están en un área (o subárea) cuyo `manager_employment_id` es suyo.

Lo calcula `fn_hr_equipo_empleos(code)`, solo en las organizaciones donde quien pregunta tiene ese código `*.view_team`.

### Funciones de resolución

Son `SECURITY DEFINER`, sin `EXECUTE` para `anon` ni `public`.

| Función | Uso |
|---|---|
| `fn_hr_puede(org, code)` / `fn_hr_puede_actor(actor, org, code)` | Miembro activo + `check_user_permission`. La versión con actor solo la ejecuta `service_role`. |
| `fn_hr_orgs_con_permiso(code) → setof int` | Para las RLS: subconsulta no correlacionada que se evalúa una vez (`hashed SubPlan`, `loops = 1`). |
| `fn_hr_mis_empleos() → setof uuid` | Los vínculos propios en organizaciones donde la persona es miembro activo. |
| `fn_hr_equipo_empleos(code) → setof uuid` | El equipo, como se definió arriba. |
| `fn_hr_mis_permisos(org) → jsonb` | Qué grupos puede ver, ver de su equipo o editar el usuario de la sesión. La UI lo pide para mostrar u ocultar, pero quien decide es la base. |

### A quién se le dan

Los códigos se dan, como datos de `role_permissions`:
- todos, a los roles 1 y 2;
- `hr.employees.view_team`, al rol 5 (Manager);
- nada, al rol 4 (Empleado): lo suyo lo ve sin permiso.

El cargo sigue teniendo precedencia: una organización puede quitarle `hr.data.salud.view` a un administrador si le marca el permiso como no permitido en su cargo.

## 7. Registro de accesos a datos sensibles

- **`hr_access_log`:**
  - **Qué guarda:** `organization_id`, `actor_user_id`, `person_id`, `employment_id`, `data_group`, `action` (`ver`, `editar` o `exportar`), `occurred_at`, `ip` (inet), `user_agent`, `route` y `detail`. El detalle solo lleva los nombres de los campos tocados, nunca los valores.
  - **Inmutable:** solo admite inserción. Un trigger rechaza `UPDATE` y `DELETE` para cualquier rol, incluida la service role. Además se revocan `update`, `delete` y `truncate`.
  - **Quién lo lee:** quien tenga `hr.access_log.view`.
  - **Quién escribe:** solo las funciones de HRM.
- **De dónde sale la IP:**
  - Por el camino canónico, el route handler pasa la IP y el agente de la petición original y llama la RPC con la service role, con el actor que sale de `getServerOrgContext()`.
  - Si la RPC se llama directamente con la sesión del usuario (`fn_hr_registrar_cambio`, `fn_hr_valor_vigente`), se toman `cf-connecting-ip`, `x-forwarded-for` o `x-real-ip` de `request.headers`, y `detail.ip_origen` lo dice.
- **Funciones de datos sensibles:** `fn_hr_datos_sensibles_leer` y `fn_hr_datos_sensibles_guardar`, más `fn_hr_persona_crear`, `fn_hr_registrar_acceso` y `fn_hr_actor_puede_grupo`.
  - **Solo las ejecuta `service_role`**, con `p_actor`.
  - **El navegador no puede llamarlas.**
  - Así el permiso se resuelve en el servidor y la IP es la verdadera.
  - **Qué permite cada una:**
    - Leer exige `hr.data.<grupo>.view`, o `.view_team` si la persona es de su equipo, o ser la propia persona (derecho del titular a conocer sus datos, Ley 1581).
    - Guardar exige `.edit`. La persona no edita sus propios datos sensibles directamente: lo hará por una solicitud `actualizacion_datos` con aprobación, en la fase 5.

## 8. Motor de aprobaciones

### Tablas

| Tabla | Qué guarda | Acceso |
|---|---|---|
| `hr_approval_rules` | Organización, `request_type`, nombre, prioridad y condiciones en jsonb: `branch_ids`, `department_ids`, `monto_min`, `monto_max`, `dias_min` y `dias_max` | La leen los miembros; la escribe `hr.approvals.manage` |
| `hr_approval_rule_steps` | Orden y `approver_type` (`jefe_directo`, `jefe_area`, `rol` con `approver_role_id` o `persona` con `approver_user_id`) | Igual |
| `hr_approval_delegations` | Quién delega, en quién, tipo de solicitud (o todas), `starts_on`, `ends_on`, motivo y activa | La ven quien delega, el delegado y `hr.approvals.manage`. La crea quien delega (para sí) o el gestor |
| `hr_approval_instances` | Tipo, tabla y registro, vínculo, quién solicita, regla, estado (`pendiente`, `aprobada`, `rechazada` o `cancelada`), paso actual y contexto | Las ven quien solicita, los aprobadores de cualquier paso y `hr.approvals.manage`. **Sin escritura directa** |
| `hr_approval_steps` | Paso, tipo, `approver_user_ids uuid[]` resueltos al iniciar, estado, quién decidió y en nombre de quién | Igual |
| `hr_approval_decisions` | Solo inserción: actor, en nombre de quién, decisión, comentario y fecha | Igual |

### RPC

Todas son transaccionales.

- **`fn_hr_aprobacion_iniciar`** (solo servidor y otras funciones, no `authenticated`):
  - toma la primera regla activa que aplique, por prioridad;
  - crea la instancia y sus pasos con los aprobadores resueltos;
  - **sin regla**, devuelve `null` y decide quien la llamó.
  - Si un paso queda sin aprobador, por ejemplo un empleado sin jefe, cae en quienes tengan `hr.approvals.manage` (sin contar al solicitante). Si tampoco hay ninguno, falla con `aprobacion_sin_aprobador`: nunca se aprueba por omisión.
- **`fn_hr_aprobacion_decidir(instancia, 'aprobar' | 'rechazar', comentario)`** (sesión del usuario):
  - bloquea la instancia con `FOR UPDATE` y verifica que siga pendiente;
  - el actor debe ser aprobador del paso actual, o delegado vigente (`starts_on <= hoy <= ends_on` en la zona de la organización) de uno de sus aprobadores, para ese tipo o para todos;
  - **nadie aprueba lo propio**;
  - registra la decisión, avanza o cierra, y ejecuta la consecuencia: hoy, aprobar o rechazar el evento del historial y aplicarlo.
- **`fn_hr_aprobacion_cancelar`:** la cancela quien solicitó o `hr.approvals.manage`.
- **`fn_hr_mis_aprobaciones_pendientes(org)`:** incluye las que le llegan por delegación.

## 9. RLS nuevas de todas las tablas de HRM (R2, R15)

### Forma de las políticas

Todas son `to authenticated`. Las de membresía son `organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = (select auth.uid()) AND om.is_active)`. Las de permiso son `organization_id IN (SELECT fn_hr_orgs_con_permiso('…'))`. Ninguna usa `EXISTS` anidado.

### Tabla por tabla

| Tabla | Leer | Escribir |
|---|---|---|
| `employments` | miembros activos (directorio, ver §2) | insertar `hr.employees.create`; editar `hr.employees.edit`; **sin `DELETE`** |
| `departments` | miembros | `hr.departments.manage` |
| `job_positions` | miembros | `hr.positions.create` / `.edit` / `.delete` |
| `job_position_module_access`, `_page_access` | miembros (el middleware las lee) | `hr.positions.edit` (antes cualquier miembro podía darse acceso) |
| `compensation_packages`, `_components`, `employment_compensation` | `hr.data.salario_pago.view` | `hr.data.salario_pago.edit` |
| `payroll_periods`, `payroll_runs` | `hr.payroll.view` | `hr.payroll.process` |
| `payroll_slips`, `payroll_items` | `hr.payroll.view`, o **la propia colilla** si está `approved` o `paid` | `hr.payroll.process` |
| `employee_loans`, `loan_installments` | `hr.payroll.view` o el préstamo propio | `hr.payroll.process` |
| `attendance_events` | lo propio, el equipo (`hr.employees.view_team`) o `hr.attendance.view` | **insertar lo propio** (para `/marcar`) o con `hr.attendance.manage`; editar y borrar con `.manage` |
| `timesheets`, `shift_assignments` | lo propio, el equipo o `hr.attendance.view` | `hr.attendance.manage` (los triggers son `SECURITY DEFINER`) |
| `timesheet_adjustments` | según su timesheet | insertar lo propio (`created_by` = yo) o con `.manage`; editar con `.manage` |
| `shift_templates`, `shift_rotations`, `time_clocks` | miembros (`/marcar` lee `time_clocks`) | `hr.attendance.manage` |
| `leave_types` | miembros | `hr.leaves.approve` |
| `leave_requests` | lo propio, el equipo, `hr.leaves.view` o `.approve` | insertar lo propio o `approve`; editar lo propio mientras esté `requested` (solo a `requested` o `cancelled`), o con `approve`; borrar con `approve` |
| `leave_balances` | lo propio, el equipo, `view` o `approve` | `hr.leaves.approve` |
| Tablas nuevas | ver §2 a §8 | |

### Cuidados

- **Triggers:**
  - `hrm_process_attendance_event` y `hrm_update_leave_balance_on_request` pasan a `SECURITY DEFINER`, para que el empleado que marca o solicita no necesite escribir en `timesheets` ni en `leave_balances`.
  - Un trigger nuevo en `attendance_events` obliga a que `organization_id` sea el del vínculo. Si quien marca no tiene `hr.attendance.manage`, fija `event_at = now()` y `is_manual_entry = false`: el empleado ya no puede marcar con una hora del pasado ni del futuro.
- **Quién lee y escribe desde el navegador (revisado con grep):**
  - `inicio.server.ts` (`turnoDeHoy`) lee lo propio de `employments`, `shift_assignments` y `attendance_events` con el cliente del usuario. **Sigue funcionando.**
  - `qrAttendanceService.ts` (`/marcar`) lee `organization_members` → `employments` lo propio, `time_clocks` y su último `attendance_events`, e inserta su marcación. **Sigue funcionando.**
  - `EmployeeDashboard` solo lee `tasks`.
  - Transporte, Domicilios, Gimnasio, Envíos, Chat y Roles leen `employments`. **Siguen funcionando.**
  - `HrmSection` (Inicio del administrador) lee nómina con el cliente del navegador. Los administradores tienen los permisos, así que sigue funcionando.
- **Pantallas viejas de `/app/hrm` que dejan de funcionar a propósito:**
  - **Crear o editar un empleado con salario, banco o seguridad social** (`EmployeeCreateForm.tsx`, `empleados/[id]/editar`, `EmployeeImporter`): responden `hr_campo_legado_congelado`. Sin esos campos, siguen guardando.
  - **Borrar un empleado** (`employmentsService.ts:602`): ya no hay `DELETE`. El retiro se hace por estado.
  - **Todas las pantallas de HRM, para miembros sin permiso:** quien no es administrador ni tiene los códigos ve listas vacías. Es el cierre de R2. Hoy no le pasa a nadie, porque las 4 organizaciones solo tienen administradores.
  - **Nómina, préstamos y paquetes salariales:** los escribe solo quien tiene `hr.payroll.process` o `hr.data.salario_pago.edit`.

## 10. Bucket privado de documentos

- **Bucket:** `hr-documentos`, privado, 10 MB, PDF, JPEG, PNG, WebP y HEIC.
- **Ruta:** `{org}/{grupo}/{person_id}/{uuid}.{ext}`.
- **`hr_documents`:** organización, persona, vínculo, grupo, categoría, ruta, nombre, tipo, tamaño, sha256, `valid_until`, `retention_until`, estado (`activo`, `reemplazado` o `anulado`) y `replaced_by`. **Sin acceso directo:** se lista dentro de `fn_hr_datos_sensibles_leer`.
- **Políticas de `storage.objects`:**
  - `INSERT` para `authenticated`, solo si la ruta es de su organización, el grupo es válido, la persona es de esa organización y tiene `hr.data.<grupo>.edit` (`fn_hr_storage_puede_subir`).
  - **Ni `SELECT`, ni `UPDATE`, ni `DELETE`** para `authenticated`. Descargar es siempre una URL firmada de 60 s que crea el servidor después de comprobar el permiso y escribir el registro (`documentosService.urlDescarga`). Los documentos no se borran: se reemplazan.
- **Lo que nunca se guarda:** la historia clínica. Del examen ocupacional solo se guarda el concepto (Resolución 1843 de 2025).

## 11. Zona horaria y lo que queda fuera

- **R7:**
  - `hrm_process_attendance_event` toma la zona de la sede y, si no tiene, la de la organización.
  - `America/Bogota` solo es el último recurso, como en `fn_timezone_for`.
  - Si la zona guardada no es válida, cae a ese mismo recurso sin tumbar la marcación.
- **Código muerto:** no se borra nada, porque todo lo que la auditoría lista se importa (§0).
- **Mover `/app/hrm/reportes` a `/app/reportes`:** es UI y queda pendiente para la fase 1, con su diseño. Incluye arreglar los 4 enlaces rotos de `DepartmentReports.tsx`.
- **Fase 2:**
  - validación del QR de `/marcar` en el servidor (hoy el token viaja al navegador);
  - descansos en el timesheet;
  - festivos en la consolidación.
- **Fase 1:**
  - afiliaciones (EPS, AFP, ARL, CCF y cesantías) con catálogo de entidades y vigencia;
  - datos de salud, SST y disciplinarios con tablas propias (hoy esos grupos ya tienen permiso, documentos y registro).

## 12. Verificación

Las pruebas se corrieron por el MCP, cada una dentro de una transacción que se deshace al final. No queda ningún `.sql` de prueba en el repositorio.

1. **Permisos:**
   - un usuario de otra organización no ve ninguna fila de las tablas nuevas ni de las reescritas;
   - un jefe con `hr.employees.view_team`, sin permisos de salario, ve a su equipo, no ve a nadie más, no ve el salario por RLS y recibe `sin_permiso` al pedirlo por RPC.
2. **`fn_hr_parametro` con un período que cruza dos vigencias:**
   - julio de 2026: 44 h hasta el 14 y 42 h desde el 15;
   - junio-julio de 2026: recargo dominical de 0,80 y luego de 0,90;
   - el valor propio de la organización (jornada de 42 desde antes) gana dentro de su vigencia;
   - lo que está `por_confirmar` falla.
3. **Motor de aprobaciones con delegación:**
   - regla de dos pasos (jefe directo → persona);
   - el jefe delega en otra persona, y la delegada aprueba el paso 1 en su nombre;
   - el solicitante no puede aprobar;
   - una delegación vencida no sirve;
   - al final el evento queda aprobado y aplicado a `employments`.
4. **El empleado marca solo lo suyo:**
   - inserta su marcación y se genera su timesheet;
   - no puede insertar una marcación de otro;
   - no ve las marcaciones de otros;
   - la hora la fija el servidor.

Los resultados están en §13.

## 13. Resultado de la ejecución (2026-11-14)

### Migraciones aplicadas por el MCP

Cada una tiene su `.sql` en `supabase/migrations/` y su reversión en `supabase/rollbacks/`. El md5 del archivo coincide con el de `supabase_migrations.schema_migrations`.

| Versión | Nombre | Qué hace |
|---|---|---|
| 20261115041017 | `hrm_f0_01_permisos_y_registro` | 30 códigos `hr.*`, roles 1, 2 y 5, `fn_hr_puede*`, `fn_hr_orgs_con_permiso` y `hr_access_log` |
| 20261115041141 | `hrm_f0_02_personas` | `hr_people` y sus 4 tablas sensibles; `employments.organization_id` y `person_id`; FK `SET NULL`; columnas heredadas congeladas; 107 personas creadas |
| 20261115041403 | `hrm_f0_03_aprobaciones` | Motor de aprobaciones |
| 20261115041538 | `hrm_f0_04_historial` | `hr_employment_events`, valor vigente, registrar cambio, cambios directos y el job `hrm-aplicar-eventos` |
| 20261115041759 | `hrm_f0_05_parametros` | Catálogo (56), valores de plataforma de COL (56 filas, 3 por confirmar) y `fn_hr_parametro*` |
| 20261115041852 | `hrm_f0_06_festivos` | Festivos de 2026 y 2027 (36) y días propios de la organización |
| 20261115042030 | `hrm_f0_07_datos_sensibles` | RPC de lectura y escritura con registro, `hr_documents` y `fn_hr_mis_permisos` |
| 20261115042055 | `hrm_f0_08_bucket_documentos` | Bucket privado `hr-documentos` y su política de subida |
| 20261115042215 | `hrm_f0_09_rls_tablas_hrm` | RLS nuevas de las 24 tablas de HRM |
| 20261115042303 | `hrm_f0_10_marcacion_zona_horaria` | Zona de la sede o de la organización en la marcación, y la marcación propia con la hora del servidor |
| 20261115042831 | `hrm_f0_11_valor_vigente_antes_del_primer_cambio` | Corrige el valor vigente para fechas anteriores al primer evento. La prueba del motor de aprobaciones lo destapó: devolvía el valor nuevo |

### Pruebas

Se corrieron por el MCP, todas dentro de transacciones que se deshacen: **53 casos y luego 7 más** después del paso 11. Pasan todos. Comprobado después: no quedó ninguna fila de prueba.

- **Otra organización:**
  - 0 filas de `hr_people`, `employments`, marcaciones e historial;
  - `fn_hr_valor_vigente`, `fn_hr_parametro` y `fn_hr_registrar_cambio` rechazados;
  - `hr_people_identification` responde 42501 por acceso directo.
- **Jefe con `view_team`, sin salario:**
  - ve 2 personas (él y su reporte);
  - 0 eventos de salario por RLS;
  - `fn_hr_valor_vigente(salario)` y `fn_hr_datos_sensibles_leer(salario_pago)` responden `sin_permiso`;
  - sí ve el dato básico de su equipo y las marcaciones de su equipo.
- **Datos sensibles:**
  - el administrador lee el salario por el servidor y queda una fila en `hr_access_log` con la IP de la petición;
  - el registro no se puede editar;
  - el empleado ve su propia identificación.
- **Marcación:**
  - `TurnoInicio` lee el vínculo propio;
  - el empleado marca lo suyo y la hora la pone el servidor (`event_at` enviado: 2020);
  - se crea su timesheet en la zona de la organización;
  - no puede marcar por otro y solo ve lo suyo.
- **Aprobaciones con delegación:**
  - el cambio de cargo queda pendiente;
  - el solicitante no aprueba y quien no es aprobador tampoco;
  - la delegada ve la pendiente y aprueba el paso 1 en nombre del jefe;
  - una delegación vencida no sirve;
  - RR. HH. aprueba el paso 2, el evento queda aprobado y aplicado a `employments`, y las 2 decisiones quedan trazadas;
  - el valor de ayer sigue siendo el anterior.
- **Parámetros:**
  - julio de 2026: 44 → 42 el 15;
  - recargo dominical de junio a julio de 2026: 0,80 → 0,90;
  - UVT 2026 desde `fiscal_uvt`;
  - el SMMLV de 2027 por confirmar falla y la UVT de 2027 sin configurar falla;
  - el valor propio de la organización gana dentro de su vigencia;
  - la organización no puede subir la jornada ni fijar el SMMLV.
- **Festivos:** el 12-ene-2026 es festivo (Reyes trasladado) y el 6-ene-2026 no.
- **R5:** al borrar el miembro, el vínculo y la persona sobreviven.
- **Congelamiento:** escribir `base_salary` responde 42501.
- **Rendimiento de RLS:** `EXPLAIN ANALYZE` como empleado, en `employments` y `attendance_events`, da `hashed SubPlan` con `loops = 1`, en 0,25 ms.

### Advisors de seguridad

- **Ninguna función nueva de HRM es ejecutable por `anon`.** Las únicas tres funciones `hrm_*` con `EXECUTE` para `anon` son triggers viejos, `SECURITY INVOKER` y que no se pueden llamar como RPC.
- **`rls_enabled_no_policy` en las 5 tablas sensibles** (`hr_people_identification`, `hr_person_beneficiaries`, `hr_person_emergency_contacts`, `hr_person_bank_accounts` y `hr_documents`): es a propósito. Solo se leen por RPC, con registro.
- **`authenticated_security_definer_function_executable` en 23 `fn_hr_*`:** también es a propósito. Cada una comprueba la membresía y el permiso por dentro, y las de datos sensibles solo las ejecuta `service_role`.
- **`function_search_path_mutable`** en `fn_notify_shift_assigned`, `fn_notify_payroll_approved`, `hrm_generate_loan_installments`, `hrm_update_loan_on_installment_payment` y `hrm_update_updated_at`: es anterior a esta fase. Queda anotado.

### Qué puede cambiar para las organizaciones 135, 137, 374 y 375

- **Hoy no pierden acceso.** Sus 6 miembros activos son rol 1 o 2 y reciben todos los códigos nuevos.
- **Si agregan un miembro con rol Empleado (4) o con un cargo propio:**
  - verá solo lo suyo en HRM: su vínculo, sus marcaciones, sus ausencias y sus colillas aprobadas;
  - además verá el directorio de vínculos, cargos y áreas.
- **Pantallas viejas que cambian de comportamiento:**
  - guardar salario, banco o seguridad social desde las pantallas viejas responde `hr_campo_legado_congelado`;
  - borrar un empleado ya no es posible;
  - marcar con una hora distinta de la actual, sin `hr.attendance.manage`, ya no es posible.
- **Datos nuevos:** cada vínculo tiene ahora su persona (`hr_people`), y cada cambio directo de cargo, sede, jornada, etc. queda en el historial.
- **Fuera de HRM** (Transporte, Domicilios, Gimnasio, Envíos, Chat y Roles) siguen leyendo `employments` igual.

### Pendiente para la UI (después de Figma y de la aprobación del dueño)

- **Pantallas:**
  - ficha única: datos básicos, identificación, beneficiarios, contactos, banco, salario con historial y documentos;
  - configuración de reglas de aprobación y delegaciones;
  - bandeja «Mis aprobaciones»;
  - parámetros y festivos de la organización;
  - consulta del registro de accesos.
- **Pantallas viejas por reemplazar:** las de alta, edición e importación de empleados, que escriben salario y banco en `employments`.
- **Reportes:** mover `/app/hrm/reportes` a `/app/reportes` y arreglar los 4 enlaces rotos de `DepartmentReports.tsx`.
- **Módulos que deben llamar al motor de aprobaciones:** ausencias, horas extra, préstamos y vacantes. Hoy solo lo usa el historial.

## 14. Fase 2: Configuración de RR. HH. y grupos de datos en el editor de rol (2026-11-15)

El dueño aprobó los diseños 10.RH.1 a 10.RH.5 (Figma `EAvjINVRnlzFM70GVoWXgl`). Esta fase los pasa a código y agrega lo que la base necesitaba para sus decisiones.

### Migraciones aplicadas por el MCP

Las cinco siguen las mismas reglas: aditivas, con su reversión en `supabase/rollbacks/`, prueba en seco antes de aplicar y md5 igual al de `schema_migrations`.

| Versión | Nombre | Qué hace |
|---|---|---|
| 20261115160841 | `hrm_f0_12_alcance_sedes_y_bloqueos` | Alcance «sus sedes» (`*.view_branch`, 7 códigos), `hr.requests.approve` («Aprobar solicitudes de RR. HH.»), `fn_hr_grupos_bloqueados_equipo` y la resolución de alcance con el bloqueo |
| 20261115160931 | `hrm_f0_13_registro_accesos_consulta` | IP parcial, intento sin permiso registrado por el servidor, consulta paginada con conteos, detalle y «Mostrar valores» (que también queda registrado) |
| 20261115161006 | `hrm_f0_14_festivos_dias_propios` | Fecha original del festivo trasladado; días propios con sedes, medio día y revisión del Contador; `fn_hr_es_dia_propio` |
| 20261115161205 | `hrm_f0_15_aprobaciones_config` | Pasos RR. HH. y cargo, casos especiales, delegación por tipos y motivo, plan compartido por «iniciar» y «probar», reglas recomendadas y reemplazo sugerido |
| 20261115161247 | `hrm_f0_16_parametros_empresa_arl` | Estado `suspendido` del SMMLV, jornadas 2023 y 2024, guardado de lo que define la empresa, clase ARL por sede o cargo y bloqueo de cierre de nómina sin parámetros |

### Decisiones del dueño y dónde viven

| Decisión | Dónde se impone |
|---|---|
| El registro de accesos es una pestaña propia de RR. HH. | Sección `hrm.registro-accesos` (permiso `hr.access_log.view`) |
| Con «Solo su equipo», salario, cuenta bancaria y salud quedan bloqueados aunque se marquen | `fn_hr_grupos_bloqueados_equipo` en la base; el editor de rol los muestra «Bloqueado» y los quita de la selección |
| «Su equipo» incluye reportes directos e indirectos | `fn_hr_equipo_empleos_actor` |
| Los valores del registro quedan ocultos hasta «Mostrar valores», y ese clic se registra; la IP sale parcial | `fn_hr_registro_mostrar_valores`, `fn_hr_ip_parcial` |
| Los intentos sin permiso también se registran | `fn_hr_registrar_intento`, llamado por el servidor después del 42501 |
| Sin reglas: jefe directo y, si no hay, RR. HH.; nadie aprueba lo suyo; un paso sin persona va a RR. HH. | `fn_hr_aprobacion_plan` |
| Un día propio se paga como día ordinario, sin recargo festivo, y queda para revisión del Contador | `fn_hr_es_festivo` cuenta solo los de ley; `hr_org_holidays.contador_review` |
| Clase ARL: cargo en sede › cargo › sede › por defecto | `fn_hr_clase_arl` |
| Una nómina de 2027 no cierra sin el SMMLV y la UVT de 2027, pero se preliquida | `trg_payroll_periods_parametros_cierre` (55000 `parametros_pendientes`) |
| Al aprobar vacaciones de alguien que aprueba, se sugiere un reemplazo sin obligar | `fn_hr_sugerir_reemplazo` |
| Los valores [S] se cargan con su valor y su estado | Filas de `hr_legal_parameters` con `verificacion = 'S'` y su `status` |

### Código

- **Rutas** `src/app/api/hrm/configuracion/**`: `parametros`, `arl`, `festivos`, `festivos/[id]`, `aprobaciones`, `accesos`, `accesos/[id]`, `accesos/[id]/valores`. Todas empiezan por `withOrg`; las de escritura llaman a `readOrgBody`. El permiso lo resuelve la base.
- **Servicios** `src/lib/services/hrm/configuracion/`. La lógica pura (vigencias, presentación de valores de ley, condiciones de reglas, agente del registro) está en `src/lib/hrm/configuracion/` y tiene pruebas.
- **Las rutas sensibles de la fase 1** (datos por grupo, valor del historial y documento) registran el intento cuando la base responde «sin permiso».
- **Configuración › Recursos humanos**: cuatro secciones en el diálogo (`hrm.general` conserva su id para la redirección de `/app/hrm/configuracion`, más `hrm.festivos`, `hrm.aprobaciones` y `hrm.registro-accesos`). Llevan `estadosPropios`: cada panel pinta su solo lectura y su «sin acceso», porque sus rutas los resuelven. El icono del módulo pasa a `Briefcase` (CATALOGO-ICONOS.md).
- **Se retira** el panel viejo «Configuración general y monedas» (`HRMConfigPanel` y `components/hrm/configuracion`). Las monedas siguen en Finanzas › Monedas, y la periodicidad de pago pasa a «Lo que define tu empresa».
- **Editor de rol**: dentro del módulo Recursos humanos, «Ver empleados de su alcance», el alcance (toda la organización, sus sedes, solo su equipo) y Ver/Editar por grupo, con el aviso de qué ve un jefe. La matriz trata `view_team` y `view_branch` como «Ver» y marca los grupos como «Sensible · datos».
- **Kit**: filas con `FilaDato`, buscador con `FilterPanel` y chips, menús con `RowActionsMenu`, resultados con `Toast` y estados con `EmptyState` (corrección del coordinador sobre el Figma, `docs/design/AUDITORIA-HRM-FIGMA-2026-11-15.md`).
- **Textos** en es, en, fr y pt, en el namespace `hrmConfig`.

### Desvíos del Figma

- En el celular se usan las pestañas del diálogo, como en Integraciones, en vez del índice propio del diseño.
- Las reglas se reordenan con «Subir» y «Bajar» del menú «⋯», no arrastrando: `FilaDato` no tiene arrastre y así también funciona con teclado.
- El filtro «Empleado» del registro sale al tocar «Ver sus registros» en un detalle, como chip; no hay un desplegable con todos los empleados.
