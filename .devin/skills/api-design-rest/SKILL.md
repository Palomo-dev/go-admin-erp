---
name: api-design-rest
description: Usar SIEMPRE al diseñar nuevos endpoints de API (FastAPI, Next.js Route Handlers), definir contratos entre frontend/backend o entre servicios, versionar una API existente, o documentar endpoints (OpenAPI/Swagger). Aplica antes de implementar, no solo al escribir el código.
---

# Diseño de APIs REST

## Convenciones de recursos
- Sustantivos en plural para colecciones: `/clients`, `/invoices`, no verbos
  (`/getClients`). Los verbos van en el método HTTP (`GET`, `POST`, `PATCH`,
  `DELETE`).
- Anidamiento razonable para relaciones claras: `/clients/{id}/invoices`, pero
  evita anidar más de 2 niveles — considera un endpoint plano con filtros en su
  lugar (`/invoices?client_id=...`).
- Consistencia de nombres entre endpoints (si uno usa `client_id`, todos deben
  usar `client_id`, no mezclar con `customerId` en otro lado).

## Respuestas y códigos de estado
- `200` éxito con contenido, `201` creado, `204` éxito sin contenido, `400` 
  request inválido, `401` no autenticado, `403` autenticado pero sin permiso,
  `404` no existe (o no visible para este tenant — no reveles si existe en otro
  tenant), `409` conflicto (ej. duplicado), `422` validación fallida, `500` error
  del servidor no esperado.
- Formato de error consistente en toda la API:
  `{ "error": { "code": "...", "message": "...", "details": {...} } }` — no
  mezclar formatos de error entre endpoints distintos.

## Paginación, filtros, ordenamiento
- Paginación basada en cursor para datasets grandes/que crecen rápido
  (transacciones, logs); offset/limit está bien para datasets acotados.
- Filtros y ordenamiento vía query params documentados explícitamente, con
  valores por defecto sensatos (ej. orden por fecha descendente).

## Versionado
- Si necesitas un breaking change, versiona (`/v2/...`) en vez de romper el
  contrato existente para consumidores actuales (apps móviles con versiones
  viejas instaladas no pueden actualizarse instantáneamente).
- Cambios no rompientes (agregar un campo opcional nuevo) no requieren nueva
  versión.

## Documentación
- FastAPI genera OpenAPI automáticamente desde los modelos Pydantic — mantén los
  modelos bien tipados y con descripciones (`Field(..., description="...")`) para
  que la documentación generada sea útil, no solo nombres de campos sin contexto.
- Documenta explícitamente qué campos son requeridos vs. opcionales, y ejemplos
  de request/response para casos no obvios.

## Idempotencia y seguridad
- Endpoints `POST` que crean recursos con efectos monetarios deben soportar
  `idempotency_key` (ver skill de Stripe/fastapi-python-backend).
- Nunca expongas más datos de los necesarios en una respuesta (ej. no devuelvas
  el objeto completo de "usuario" con hash de contraseña aunque esté hasheado).
