# Secuencias y Partners: alcance verificable del PR 280

## Cambios de Secuencias en este cierre

El editor y el servidor comparten las capacidades de `src/lib/crm/sequenceCapabilities.ts`. Los pasos nuevos admiten correo, WhatsApp, tareas de llamada, tareas internas, esperas y condiciones. SMS permanece legible en registros históricos, pero aparece deshabilitado al crear un paso y la API rechaza su creación con 400. No hay proveedor SMS conectado.

Las condiciones de salida aceptadas son `won_lost` y `opted_out`, como texto o como el objeto nativo `{ "type": "…" }`. Otras condiciones o valores malformados reciben 400 antes de escribir. Cambiar sólo los metadatos de una secuencia antigua conserva sus pasos y condiciones históricas; enviar `steps` en PATCH recibe 400 explícito porque el motor no ofrece edición versionada de pasos.

La creación usa una sola llamada a `fn_crm_create_sequence(p_org, p_input)`, que devuelve padre y pasos; ya no publica el padre y compensa después un fallo de los pasos. El borrado usa `fn_crm_delete_sequence(p_org, p_sequence_id)`. Cualquier inscripción, activa, pausada o terminada, bloquea la eliminación con `409 secuencia_con_historial`: conserva toda la historia. Una configuración sin inscripciones sí se puede eliminar; repetir un borrado ya confirmado mantiene su resultado idempotente.

La alternativa para conservar una secuencia usada es desactivarla, lo que impide nuevas inscripciones. **Desactivar no cancela los pasos de las inscripciones existentes.** Retirar un inscrito usa la RPC atómica de salida y detiene sus pasos pendientes; no rescinde un efecto externo que otro worker ya hubiera empezado.

## Protección y publicación

Las rutas resuelven organización y permisos en el servidor. Gestión admite administración canónica o `crm.campaigns.manage`; el actor se deriva de la sesión. Las RPC de inscripción, reanudación y salida conservan sus guardas de organización y sucursales.

Las nuevas RPC de configuración requieren su migración compatible antes de publicar Next. La evidencia PostgreSQL y su versión aplicada se registran junto a esa migración; las pruebas de transporte con un doble de base de datos no sustituyen ese gate. Las 15 políticas restrictivas de `docs/crm/propuestas/secuencias_permiso_sucursal.rls.sql` siguen sujetas a publicar los escritores compatibles y retirar las versiones anteriores. Los permisos de las rutas no sustituyen estas restricciones frente a escrituras directas por la API de datos.

No se ofrece planificación por días hábiles, ramas alternativas ni salidas automáticas por reunión o cambio de etapa: esas capacidades requieren ampliar el motor. Responder por correo o WhatsApp pausa una inscripción si `pause_on_reply` está activo; no se convierte en una condición de salida inexistente.

## Partners

`/app/crm/partners` y `/app/crm/partners/[id]` son vistas internas del ERP: directorio, datos del partner, oportunidades, deals, tiers y comisiones. Registrar un deal resuelve permiso y sucursal de la oportunidad en el servidor; ajustar una comisión exige administración y deja recibo idempotente auditable. Registrar una comisión pagada no ejecuta una transferencia.

El **portal externo del partner no está implementado**. No hay ruta pública, API de portal ni enlace revocable. Completarlo requiere un mecanismo de acceso ligado a un partner y organización, vencimiento y revocación, respuestas que sólo expongan los registros de ese partner y un flujo de acceso externo comprobado. El directorio interno y sus pruebas no acreditan esa función.

## Verificación local

Se ejecutaron las rutas reales de creación, edición y borrado contra el doble existente de transporte PostgreSQL y los componentes de Secuencias con el proveedor Intl real en español, inglés, francés y portugués. Las regresiones verifican el rechazo antes de mutar, una sola RPC por efecto, preservación del historial, permisos del servidor y lectura de registros antiguos. Las suites existentes de Secuencias y Partners se ejecutaron sin llamadas a proveedores ni escrituras de producción.
