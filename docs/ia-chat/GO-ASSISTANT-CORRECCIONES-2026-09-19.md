# GO Assistant: correcciones de creación, adjuntos e historial

## Alcance y decisión

Corrección de los fallos reportados en el asistente del header. No equivale a
certificar todas las fases del plan ni todos los flujos contables en producción.

Por solicitud explícita del propietario, el nivel predeterminado pasa a
`write_full` para todas las organizaciones. No concede permisos ni módulos:
se siguen comprobando en servidor y toda escritura requiere confirmación.
Un administrador puede restringir su organización desde
`/app/configuracion/asistente`; ya no necesita SQL para cambiar el nivel.

La migración `20260919010000_go_assistant_todas_organizaciones.sql` se aplicó
por MCP, con su rollback versionado. La comprobación posterior encontró las
84 organizaciones existentes habilitadas. Las organizaciones nuevas usan el
mismo default. Un fallo al resolver permisos o módulos NO habilita escritura.

## Cambios

- Tarjeta de confirmación de solo lectura: sin formulario paralelo de clientes.
  Corregir cancela la propuesta y genera otra por conversación. Confirmar
  acepta exclusivamente `actionId`; no campos editables, rol ni argumentos.
- Persona, empresa, software actual y notas tienen campos separados. No se
  inventan datos fiscales ni se obliga a completar campos opcionales.
- Confirmación conectada al registro completo de herramientas, no únicamente
  al catálogo antiguo. Se reevalúan permisos y módulos antes de ejecutar.
- Las propuestas se escriben con cliente de servidor, acotadas a sesión,
  autor y organización. Las operaciones de negocio conservan sesión/RLS.
- Subida `prepare → PUT firmado → finalize` a Storage privado, hasta 20 MB.
  Los binarios grandes no atraviesan el servidor Next. Finalización idempotente
  y reintentos que conservan las subidas exitosas. Multipart sigue compatible.
- Lectura de capturas además de facturas: descripción visual y texto visible.
  Autorización separada para conciliar catálogo y consultar documentos fiscales.
- Modelo de visión de la organización primero; ante 429/5xx/timeout, un único
  respaldo Google desde entorno/default, mismas credenciales. No se cambia
  de proveedor ni se cobra una extracción fallida. Se registra el modelo real.
- Historial carga los mensajes recientes, restaura propuestas y resultados.
  El fallback de texto también conserva el hilo. Se bloquea cambiar de hilo
  durante operaciones y se reinicia el estado al cambiar de organización.
- Un stream sin `done` no se considera exitoso. Conserva el texto parcial y
  adjuntos; no autoriza un reintento automático con consumo incierto. El id del
  hilo se emite antes de comenzar la generación.
- Cobro y evento `usage` también se emiten cuando el agente pausa para confirmar.
  El panel muestra el modelo que efectivamente respondió.

## Evidencia real, no mocks

Pruebas locales HTTP con sesión real en org 120, usando datos sintéticos:

| Caso | Resultado |
| --- | --- |
| Consultar configuración | HTTP 200, `write_full`, administración autorizada |
| Preparar cliente con persona/empresa/software separados | Tarjeta emitida |
| Confirmar cliente | HTTP 200, `success:true`, `historySaved:true` |
| Repetir confirmación | HTTP 200, `alreadyExecuted:true`, mismo id |
| Deshacer cliente de prueba | HTTP 200; MCP verificó cero filas restantes para ese id |
| PNG sintético de 6.411.311 bytes | Prepare 200, Storage PUT 200, finalize 201 |
| Repetir finalize | HTTP 200, mismo id de adjunto |
| Lectura inicial con modelo org antiguo | 503 de Google; se corrigió el mensaje engañoso de foto borrosa |
| Lectura posterior sin volver a subir | `leer_documento.ok:true`; respondió correctamente el número 4821 |
| Persistencia de la extracción | MCP: `extraction_model=gemini-3.8-flash`, texto contiene 4821 |

El turno de lectura usó `gpt-5.6-luna` para conversación. No se enviaron datos
personales a proveedores en estas pruebas. El cliente sintético se eliminó
mediante Deshacer; permanecen conversación, auditoría y adjunto sintético.

Verificación automatizada al cierre de los cambios:

- 605/605 pruebas focalizadas del asistente y guardrails, 29 suites.
- Suite completa: 6.663 pasan, 2 fallan, 1 omitida; 356 suites aprobadas.
  Los dos fallos son los conocidos de `website/sectionContract.test.ts`, fuera
  del alcance. No se alteraron esas pruebas para obtener un resultado verde.
- ESLint limpio en los archivos productivos modificados del asistente.
- `npx tsc --noEmit -p tsconfig.json`: salida 0 después de corregir los mocks
  de pruebas y tipar explícitamente el contexto del chat. Última regresión de
  confirmación: 39/39 pruebas y lint limpio.
- `next build` completó con código de salida 0, 334 páginas generadas; se usó
  salida aislada `.next-assistant-check` para no alterar el servidor de desarrollo.
  El repositorio omite tipos/lint dentro del build: no equivale al chequeo de tipos.
- QA independiente: 9,5/10 para los bugs de esta ronda, no el plan global.

## Despliegue y pendientes explícitos

**Los cambios de código no están publicados por esta tarea.** No se hizo
commit, push ni despliegue. Hay trabajo ajeno en el mismo árbol que no debe
incluirse al publicar el asistente.

La migración `20260919020000_go_assistant_actions_server_only.sql` está
preparada, **NO aplicada**. Revoca escrituras directas de clientes sobre las
propuestas. Aplicarla antes de actualizar los escritores antiguos rompería
el runtime desplegado. Seguir [el orden coordinado](GO-ASSISTANT-ACTIONS-SERVER-ONLY.md).
La protección de esta tabla no se considera cerrada hasta aplicarla y verificarla.

No se certifican en esta ronda: pruebas manuales visuales de todos los tamaños
de pantalla, todas las operaciones contables reales, voz en vivo, ni limpieza
programada de archivos abandonados entre prepare y finalize. La prueba de
cliente no sustituye esas pruebas. Los resultados de compilación y suites se
registran al cerrar la ronda en `PROGRESS.md`, con sus fallos y límites reales.
