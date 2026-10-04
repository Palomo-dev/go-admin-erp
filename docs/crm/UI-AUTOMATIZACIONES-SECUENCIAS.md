# Automatizaciones y Secuencias: presentación y flujos CRM

Referencias Figma: Automatizaciones `1373:17`, `1375:17`, `1379:776`; Secuencias `1406:117444`, `1406:118109`, `1407:17`, `1408:117970`, `1408:118427`, `1408:118914`.

## Automatizaciones

- Tabla en escritorio y tarjetas en móvil, con los estados de carga, error, vacío y filtrado existentes. Cabecera y cifras usan el kit y los tokens del sistema.
- La capacidad `can_manage` proviene del GET canónico; crear, modificar, activar, eliminar y probar quedan deshabilitados para lectores. El servidor resuelve cada permiso.
- Los KPI usan `summary` del servidor para siete días. El contador individual de la regla sigue siendo el acumulado guardado; no se suma para calcular el KPI.
- «Probar» invoca exclusivamente `POST /api/crm/automations/{id}/dry-run/bulk` con `{}`. Evalúa todos los disparadores capturados en los últimos treinta días sobre los datos actuales. La ventana, los totales y la muestra son reales; no ejecuta acciones ni modifica historial.
- El constructor requiere guardar los cambios antes de simular: evita probar inadvertidamente una versión distinta de la que aparece en pantalla.
- «Iniciar agente IA» selecciona un agente activo real de la organización y envía `voice_agent_id`; el motor deriva actor, cliente y destinatario de los registros guardados. Las acciones que siguen sin implementación se identifican como no disponibles.
- Guardar, cambiar estado y borrar tienen protección contra clics repetidos. Un rechazo al borrar conserva la confirmación abierta y muestra el error del servidor.

## Secuencias

- Lista con tabla de escritorio y tarjetas de móvil, línea de tiempo y panel de inscritos; cabecera y KPI del kit.
- `can_manage` y `summary` vienen de `GET /api/crm/sequences`. Activas, pausadas y pausadas por respuesta son categorías separadas. Respuesta significa la pausa persistida `customer_replied_*`, no una tasa histórica inferida.
- `meetings_available=false` presenta «—»: el esquema y los escritores actuales no atribuyen una reunión a una inscripción. La explicación aparece junto a los KPI. No se usan reuniones generales de la organización para fabricar esa cifra.
- El cambio de organización limpia filas, cifras, capacidad, filtros y diálogos; una respuesta atrasada del ámbito anterior se descarta. Una respuesta confirmada de mutación actualiza la fila incluso si falla la recarga posterior.
- El formulario conserva la validación y la línea de tiempo canónicas. Guardar bloquea los campos y despacha una única mutación.
- Inscribir requiere un preview actual, una oportunidad seleccionada y, para canales que llegan al cliente, una confirmación explícita de envíos reales. Durante carga/error no se permite confirmar. Un resultado omitido nunca se presenta como inscripción exitosa.
- La condición nativa continúa si se cumple y corta la secuencia si no se cumple o no se puede evaluar. Los pasos de una secuencia existente permanecen de solo lectura para preservar las inscripciones en curso. El diseño de ramas alternativas, horarios de contacto y edición versionada requiere soporte adicional del motor; no se ofrecen controles que prometan esas operaciones.

## Idiomas y comprobación

La presentación usa `next-intl` en español, inglés, francés y portugués. Los catálogos, nombres de registros, identificadores y DSL conservan su contrato; los helpers de texto aceptan un traductor opcional y mantienen el resultado español por defecto. Las fechas de inscripciones usan la zona horaria de la organización.

Las pruebas focales ejecutan el proveedor Intl real, los helpers canónicos y los flujos de permisos, simulación, guardado, confirmación, aislamiento de organización y respuestas de error. No realizan llamadas telefónicas, envíos, push a dispositivos ni despliegues. La comprobación integrada del navegador está documentada separadamente por el cierre del CRM.
