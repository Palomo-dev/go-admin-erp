# Ficha de llamadas: Figma, flujo y comprobaciones

Referencia: GO Admin, escritorio [`1363:20`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl?node-id=1363-20) y móvil [`1368:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl?node-id=1368-17). Se leyeron el contexto y las capturas de ambos nodos, el manual del kit y los patrones transversales.

La lista abre `/app/crm/llamadas/[id]`; los contextos embebidos conservan el diálogo y los enlaces con `start_ms`. Ambos reutilizan la misma ficha, lector, reproductor y acciones existentes.

- Escritorio: cabecera del kit, grabación/transcripción a la izquierda y tarjetas de resumen, conversación, objeciones, tareas y vínculos en una columna de 400 px.
- Móvil: grabación, resumen, objeciones, vista previa de transcripción y acciones de tareas/devolver llamada. La transcripción completa y el resto de controles siguen accesibles.
- Se reutilizan Inter, tokens semánticos, iconos Lucide y componentes del kit. Los cambios compartidos son optativos: sección compacta, contenido móvil sin tarjeta, avatar de 28 px y botón de llamada con diseño del kit.
- Los vínculos usan las rutas nativas de cliente y oportunidad. La ficha consulta referencias sólo cuando faltan en la respuesta y conserva un título genérico si no puede leerlas.

## Coherencia del flujo

Las tareas, etapa, etiquetas, discovery y objeciones usan el escritor original de análisis; «Aplicar todo» conserva sus acciones. La selección de tareas se reinicia al recibir otro análisis. El gate guarda la identidad de llamada y análisis: una confirmación o respuesta 409 tardía no aplica el análisis siguiente.

El lector trata cada endpoint por separado: una transcripción disponible no oculta un 403 del análisis. Al cambiar de llamada u organización aborta las lecturas anteriores y retira sus resultados. Un 404 sin trabajo activo muestra ausencia; sólo un job `transcribe` queued/running activa el estado pendiente. Un último job fallido mantiene el fallo y el reintento, sin polling infinito.

El audio usa el stream privado y un único reproductor. Los saltos a segmentos conservan milisegundos exactos; una grabación lista reutiliza el GET del detalle. La descarga utiliza la ruta privada existente. La forma de onda se calcula del audio real cuando se solicita su reproducción; antes de decodificarlo se muestra progreso, sin simular picos.

Los indicadores proceden del DTO nativo. `questions_asked` se presenta como preguntas totales; no se inventan preguntas abiertas ni comparaciones temporales. Las fechas de tarea sin hora conservan el día con `formatPlainDate`; los instantes usan la zona horaria de la organización. La presentación nueva está traducida a los cuatro idiomas.

## Verificación de este cierre

99 pruebas en ocho suites pasan tanto en UTC como en America/Bogota: composición, idiomas, rutas, selección de tareas, gate, errores parciales, abortos, estados/job reales, reintentos nativos, deep links, seek, idempotencia y contratos existentes de transcripción/análisis. Lint focal: cero errores y cero warnings.

Evidencia local privada:

- `/tmp/crm83-detail-freeze-utc.log`
- `/tmp/crm83-detail-freeze-bogota.log`
- `/tmp/crm83-detail-lint-freeze.log`
- `/tmp/crm83-call-detail-visual/evidence.json`
- `/tmp/crm83-call-detail-visual/after-{ready,mobile,norecording,pending,failed,loading,error,forbidden}.png`

Las ocho capturas finales usan la página y el kit reales con respuestas GET sintéticas. Todas muestran Inter y carecen de desbordamiento horizontal o excepciones de ejecución. Los mensajes de consola HTTP 500/403 corresponden a las respuestas simuladas de esos dos estados. La ficha lista hace un GET de detalle y los dos GET de inteligencia, sin duplicar el detalle.

Límite de la evidencia: **RendererSimulado**, sin sesión autenticada disponible. El contenedor y el proveedor de telefonía se sustituyen en el harness privado; no se ejecutaron llamadas, envíos, proveedores de IA ni escrituras externas. Los handlers se comprobaron mediante sus contratos nativos en pruebas locales. El build y la verificación global del PR corresponden al cierre integrado.
