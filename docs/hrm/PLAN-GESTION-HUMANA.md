# Plan: Gestión humana completa en el módulo Recursos humanos

Fecha: 2026-11-14. Estado: **propuesta para aprobación del dueño.**

Insumos:
- [AUDITORIA-HRM-2026-11-14.md](AUDITORIA-HRM-2026-11-14.md): qué existe hoy, qué se reutiliza y 15 riesgos.
- [INVESTIGACION-NORMATIVA-CO-2026-11-14.md](INVESTIGACION-NORMATIVA-CO-2026-11-14.md): normas colombianas con fuente y vigencia, más 35 parámetros por vigencia.

Método, el mismo del Chat: **Figma por fase → aprobación del dueño → código → verificación**. Cada fase se puede usar sola. Ninguna espera a que termine todo el plan.

## Punto de partida

- **Mucho código y casi ningún dato:**
  - 50 páginas y unas 7.250 líneas de servicios;
  - ninguna nómina corrida;
  - ningún empleado con salario, cuenta bancaria ni EPS.
  - **Se puede rehacer sin migrar datos de clientes.**
- **El cálculo de nómina actual no se corrige: se reemplaza.**
  - Divide dos veces por 100, así que salud y pensión salen 100 veces más bajas.
  - Corre en el navegador, sin transacción.
  - Marca la noche desde las 21:00 y los festivos valen 0.
- **Cualquier miembro puede leer y cambiar salarios, cuentas y colillas.** Hoy no hay datos, pero se cierra antes de que alguien los cargue (fase 0).
- **El empleado cuelga del usuario de la app:**
  - un operario sin cuenta no puede ser empleado;
  - borrar el usuario borra el historial laboral;
  - no hay documento de identidad.
- **Lo que sirve:**
  - contabilización de nómina por trigger, sin duplicados;
  - bloqueos de cierre y `fn_nomina_fijar_deduccion`;
  - `fn_retencion_art383` y `fiscal_uvt`;
  - tablas de turnos, marcación, ausencias y préstamos;
  - el cliente de Factus;
  - la firma electrónica del CRM (Documenso);
  - el panel y la marcación del empleado en Inicio;
  - la app Capacitor.

## Principios: aplican en todas las fases

| Principio | Cómo se cumple |
|---|---|
| **Un solo dato, varios procesos** | Todo cambio de un empleado (salario, cargo, sede, jornada, contrato) es un **evento con fecha de efecto** en un historial único. La nómina, la ficha, los reportes y la PILA leen «el valor vigente en la fecha X». Nadie edita cinco pantallas. |
| **Aprobaciones configurables** | Un **motor de aprobaciones** compartido por vacantes, ofertas, ausencias, horas extra, novedades, cambios salariales, liquidaciones y préstamos. Las reglas van por sede, área, monto o tipo, con delegaciones y reemplazos por ausencia. |
| **Trazabilidad completa** | Cada lectura de un dato sensible y cada cambio, aprobación o pago queda registrado: quién, cuándo, valor anterior, valor nuevo y motivo. Las versiones no se borran. |
| **Seguridad y privacidad** | Permisos por rol **y por grupo de campos**: identificación, salario, banco, salud, disciplinario y SST. Se resuelven en el servidor. RLS por pertenencia y permiso. Bucket privado para documentos, con URLs firmadas de corta vida. Cada organización ve solo lo suyo. |
| **Nómina confiable** | Preliquidación, alertas de diferencias contra el mes anterior, revisión, cierre y **bloqueo del período**. Las correcciones se hacen con un nuevo cálculo o una nota de ajuste, nunca editando. Un período cerrado no se recalcula con reglas nuevas. |
| **Parámetros por vigencia** | Los 35 parámetros de la investigación (SMMLV, recargos, jornada, UVT, tablas, festivos…) viven en una tabla con fecha de inicio y de fin, fuente legal y estado (vigente, transitorio, en litigio). Se consultan **por la fecha del hecho**. Ninguno queda como constante en el código. |
| **Integraciones sin duplicados** | Toda salida externa (DIAN, PILA, banco, firma, contabilidad) tiene clave de idempotencia, cola, reintentos y una bandeja de errores visible. |
| **IA supervisada** | La IA lee documentos, detecta faltantes, resume candidatos y explica variaciones de nómina. **Nunca** rechaza candidatos, cambia salarios ni toma decisiones laborales: siempre propone y una persona decide. Va con el GO Assistant, el cobro de créditos y la confirmación de siempre. |
| **Fechas** | Zona horaria de la organización (CLAUDE.md). Esto incluye corregir el trigger de marcación, que tiene `America/Bogota` fijo. |
| **Contador** | Las reglas de cálculo y la contabilización pasan por una ronda del Contador (`docs/contador/`) antes de activarse. |
| **4 idiomas y kit nuevo** | Toda pantalla en es/en/fr/pt, con `@/components/kit` y tokens. |

## Fases

| Fase | Contenido | Por qué en este orden |
|---|---|---|
| **0. Fundaciones** | Modelo nuevo de **persona-empleado**: independiente del usuario, con documento, datos personales, beneficiarios y contacto de emergencia. Historial con fecha de efecto. Permisos por grupo de campos y RLS nuevas. Registro de accesos. Motor de aprobaciones. Tabla de parámetros por vigencia con los valores de 2026 y 2027. Festivos de Colombia. Bucket privado de documentos. Mover `/app/hrm/reportes` a `/app/reportes` y retirar el código muerto. | Todo lo demás se apoya aquí, y cierra el riesgo de privacidad. |
| **1. Estructura y expediente** | Empresas y sedes (las de la organización), áreas, organigrama, cargos con perfil y competencias, escalas salariales, presupuesto de plazas. **Ficha única** del empleado: datos, cargo, jefe, salario, contrato, historial, documentos, certificaciones y vencimientos con alertas. | Sin expediente no hay nómina ni PILA. |
| **2. Jornadas, asistencia y ausencias** | Turnos y plantillas, marcación (geolocalización solo al marcar y con autorización; biometría opcional con alternativa), descansos, trabajo remoto, horas extra y recargos de la Ley 2466 (nocturno desde las 19:00, dominical al 90 % y luego al 100 %), detección de cruces y topes. **Novedades con aprobación antes de la nómina.** Vacaciones con saldo, incapacidades (quién paga cada tramo), licencias y permisos, calendario del equipo. Todo pasa solo a la nómina. | Es el insumo diario de la nómina. |
| **3. Nómina** | Motor nuevo en el servidor, en RPC transaccional, idempotente y **con pruebas**:<br>• devengados, salariales y no salariales, con la regla del 40 %;<br>• IBC con topes, seguridad social y parafiscales con la exoneración del art. 114-1, fondo de solidaridad;<br>• retención en la fuente, procedimientos 1 y 2;<br>• comisiones (ya existe), bonos, préstamos, embargos (límites legales), retroactivos;<br>• provisiones y pago de prima, cesantías e intereses, vacaciones;<br>• preliquidación, alertas, revisión, cierre y bloqueo;<br>• comprobantes, archivo de pago al banco y contabilización (corrigiendo la sede del asiento);<br>• conciliación con Tesorería. | El corazón. Pasa por el Contador antes de activarse. |
| **4. Nómina electrónica DIAN y PILA** | Documento soporte mensual con notas de ajuste, por el proveedor elegido (decisión 1), como servicio de la plataforma. **PILA** como archivo plano del Anexo 2 de la Resolución 2388, versionado, que el cliente carga en su operador (decisión 2). | La obligación legal, encima de una nómina ya confiable. |
| **5. Portal del empleado y del jefe** | Para el celular, en la misma app (decisión 4):<br>• **empleado:** desprendibles y certificados, solicitar vacaciones y permisos, ver turnos, actualizar datos (con aprobación), firmar documentos, marcar;<br>• **jefe:** aprobar y ver los pendientes de su equipo, sin salarios ni datos de salud de nadie. | Baja la carga de RR. HH. apenas hay nómina. |
| **6. Contratación, ingreso y retiro** | **Ingreso:**<br>• contrato y anexos desde plantillas, firma electrónica (decisión 3);<br>• documentos pendientes, afiliaciones (EPS, AFP, ARL, CCF);<br>• examen de ingreso (solo el concepto médico, no la historia clínica);<br>• entrega de equipos, creación de accesos a la app, inducción, seguimiento del período de prueba.<br>**Retiro:**<br>• renuncia o terminación con indemnización del CST 64;<br>• liquidación con revisión y aprobación, paz y salvo, devolución de activos;<br>• revocación de accesos, entrevista de salida;<br>• conservación de documentos (nómina 10 años, SG-SST 20 años). | Cierra el ciclo de vida con la nómina ya lista. |
| **7. Reclutamiento y selección** | Vacantes con aprobación y contra el presupuesto de plazas, **portal de empleo** (decisión 5), recepción de hojas de vida con lectura por IA, candidatos por etapas, entrevistas, pruebas, evaluaciones con la misma rúbrica para comparar, referencias, ofertas con aprobación. Detección de duplicados. **Autorización de datos y plazo de conservación**, con borrado al vencer. | Valor alto, pero no bloquea la operación diaria. |
| **8. Desempeño y desarrollo** | Objetivos, evaluaciones (jefe, autoevaluación, 360 opcional), seguimiento y retroalimentación, competencias del cargo, planes de mejora, formación y certificaciones con vencimiento, planes de carrera y sucesión. | |
| **9. Bienestar, relaciones laborales y SST** | Encuestas de clima anónimas, reconocimientos, beneficios, solicitudes, **canal de quejas confidencial** y procesos disciplinarios (debido proceso, acceso restringido). **SG-SST** según el tamaño de la empresa (7, 21 o 60 estándares): matriz de peligros, reporte de accidentes (FURAT, 2 días hábiles), COPASST o vigía, capacitaciones y acciones preventivas. La información médica queda protegida. | |
| **10. Analítica y costos** | En **/app/reportes**, la regla del proyecto: plantilla, vacantes, rotación, ausentismo, tiempo de contratación, formación y **costo laboral** por sede, área y centro de costos. Presupuesto contra ejecución. **Simulador**: cuánto cuesta contratar, subir salarios o cambiar turnos, con las reglas vigentes de la fecha simulada. | Necesita los datos de las fases anteriores. |

La **IA supervisada** entra en la fase donde sirve:
- **fase 1:** leer documentos y detectar faltantes;
- **fase 3:** explicar variaciones de nómina;
- **fase 7:** resumir candidatos.

Además, las herramientas del GO Assistant para RR. HH. se agregan solo en modo consulta y propuesta.

## Decisiones del dueño (con recomendación)

1. **Proveedor de nómina electrónica.** Factus documenta la nómina en su API v2, pero su glosario la marca «en desarrollo» y no publica precios. MATIAS API sí publica precios (desde $196.000 al año). Alegra, Siigo y los demás no tienen API pública para emitir desde otro software.
   **Recomendación:** preguntarle a Factus si ya funciona en producción y cuánto cuesta, y usarlo como servicio de la plataforma, igual que la facturación. MATIAS queda como respaldo detrás del mismo adaptador. La fase 4 no arranca sin esa respuesta.
2. **PILA.** Ningún operador (SOI, Aportes en Línea, Mi Planilla) tiene API pública.
   **Recomendación:** generar el archivo plano validado para que el cliente lo cargue en su operador. Más adelante, si algún operador da convenio, se integra.
3. **Firma electrónica de contratos.** El Decreto 526 de 2021 permite firmar el contrato de trabajo con firma electrónica simple confiable. **Recomendación:** reutilizar la del CRM (Documenso), con OTP, registro de evidencia y hash del documento. No hace falta firma digital certificada.
4. **Portal del empleado.** **Recomendación:** la misma app de GO Admin (web y Capacitor) con un perfil «empleado», que ya existe en Inicio. El que no tenga usuario recibe una invitación al portal. Sin app aparte.
5. **Portal de empleo.** **Recomendación:** una página pública propia de cada organización con sus vacantes, más una sección «Trabaja con nosotros» que se pone en el sitio web desde el editor. Las hojas de vida llegan al mismo lugar.
6. **Validación del Contador.** **Recomendación:** antes de activar la fase 3, una ronda con el Contador sobre conceptos, IBC, provisiones, retención y cuentas contables, como se hizo con Finanzas.
7. **Orden de fases.** **Recomendación:** el de la tabla. Es la ruta más corta hacia una nómina real y legal. Reclutamiento, desempeño y bienestar vienen después porque no bloquean la operación.

## Riesgos y cuidados

- **SMMLV 2026:** el decreto está suspendido por el Consejo de Estado y hoy rige el Decreto transitorio 0159 de 2026. Por eso el parámetro lleva estado y fuente, y un cambio se aplica desde su fecha sin tocar períodos cerrados.
- **Reforma pensional (Ley 2381):** está anunciada para el 1-abr-2027 y puede aplazarse. Se carga como parámetro con vigencia, no como código.
- **Factus:** si no confirma que la nómina electrónica funciona en producción, la fase 4 se hace con MATIAS. El adaptador es el mismo.
- **Biometría y geolocalización:** solo con autorización expresa y con una alternativa para quien no la dé.
- **Historia clínica:** nunca se guarda. Solo el concepto de aptitud que entrega el prestador.

## Entregables por fase

1. Diseño en Figma, en una página nueva «20 Recursos humanos» del archivo `EAvjINVRnlzFM70GVoWXgl`, con escritorio, celular, estados (vacío, error, cargando) y componentes.
2. Tu aprobación.
3. Migraciones aditivas por el MCP, con su reversión.
4. RPC transaccionales.
5. Route handlers con `getServerOrgContext()`.
6. Pantallas en 4 idiomas.
7. Pruebas: cálculo de nómina con casos del Contador, permisos con un usuario de otra organización y con un jefe sin permiso de salario, y fechas con `TZ=UTC` y `TZ=America/Bogota`.
8. Verificación: jest, tsc, build y revisión en el navegador.
