---
name: observability-logging
description: Usar SIEMPRE al agregar logs, métricas, tracing, o integrar herramientas de monitoreo de errores (ej. Sentry) en backend (FastAPI, Node) o frontend (Next.js, apps móviles). También usar al diagnosticar problemas en producción que requieren instrumentación.
---

# Observabilidad y logging

## Logging estructurado
- Logs en formato JSON estructurado en backend (no strings libres concatenados),
  con campos consistentes: `timestamp`, `level`, `tenant_id` (si aplica),
  `request_id`, `message`, contexto relevante.
- Nunca loguees datos sensibles: contraseñas, tokens completos, números de
  tarjeta, datos personales completos (enmascara: últimos 4 dígitos, etc.).
- Niveles de log con propósito claro: `debug` (desarrollo), `info` (eventos de
  negocio normales), `warning` (algo raro pero no roto), `error` (falló algo que
  requiere atención).

## Request ID / Tracing
- Genera un `request_id` único por request y propágalo a través de todas las
  capas (API → servicio → llamadas a proveedores externos) para poder seguir
  un flujo completo en los logs, especialmente crítico en operaciones
  financieras multi-paso (Temporal workflows, llamadas a Provider Router).
- Para microservicios/múltiples backends, considera tracing distribuido
  (OpenTelemetry) si el sistema crece más allá de un backend monolítico.

## Monitoreo de errores (Sentry u otro)
- Captura excepciones no manejadas automáticamente, pero también reporta
  explícitamente errores de negocio importantes que no son excepciones
  (ej. "webhook de Stripe recibido pero tenant no encontrado").
- Agrupa por tenant/contexto cuando sea posible para poder responder "¿cuántos
  tenants afectados tiene este bug?".
- Configura alertas para errores críticos (fallos en procesamiento de pagos,
  errores 500 en endpoints financieros) — no dependas de revisar el dashboard
  manualmente.

## Métricas de negocio vs. técnicas
- Técnicas: latencia de endpoints, tasa de error, uso de CPU/memoria.
- De negocio: transacciones procesadas, tasa de éxito de pagos por proveedor
  (útil para el patrón Provider Router — saber si Mono está fallando más que
  Rapyd, por ejemplo), tenants activos.

## Qué evitar
- `print()`/`console.log()` sueltos en código de producción sin pasar por el
  logger configurado — se pierden o no tienen el formato estructurado.
- Loguear en un loop sin límite (puede saturar el sistema de logs y encarecer
  costos de la herramienta de observabilidad).
