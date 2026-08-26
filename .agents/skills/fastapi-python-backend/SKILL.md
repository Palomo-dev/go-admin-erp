---
name: fastapi-python-backend
description: Usar SIEMPRE que se trabaje en un backend Python con FastAPI — endpoints, modelos Pydantic, validaciones, integración con Temporal.io para workflows, lógica de ledger/contabilidad con doble partida, o llamadas a proveedores externos (Mono, Pomelo, Rapyd, Bancolombia API, Bre-B). Aplica a tareas de diseño de API, no solo escritura de código.
---

# FastAPI + Python (backend financiero/ERP)

## Estructura de API

- Modelos de request/response con Pydantic (`BaseModel`), nunca dicts sueltos sin
  tipado en los endpoints públicos.
- Separa capas: `routers/` (endpoints) → `services/` (lógica de negocio) →
  `repositories/` o `db/` (acceso a datos). No metas lógica de negocio directamente
  en el handler del endpoint.
- Usa `Depends()` para inyectar sesión de DB, usuario autenticado, y tenant actual
  — nunca los saques de variables globales.

## Reglas para lógica financiera (ledger / doble partida)

- Todo movimiento de dinero se registra como **mínimo dos asientos** (débito y
  crédito) dentro de la misma transacción de base de datos. Si falla uno, fallan
  ambos (rollback completo).
- Nunca calcules saldos sumando manualmente en el código de la API para mostrar al
  usuario si existe una vista materializada o función SQL para eso — evita
  inconsistencias entre "lo que muestra la UI" y "lo que dice el ledger real".
- Idempotencia: cualquier endpoint que mueva dinero (pagos, transferencias, cargos)
  debe aceptar una `idempotency_key` y rechazar duplicados — especialmente crítico
  al integrar proveedores externos vía webhooks que pueden reenviar eventos.

## Proveedores externos (patrón Provider Router)

- Si el proyecto usa un patrón de Provider Router (abstracción sobre Mono, Pomelo,
  Rapyd, BaaS locales), toda integración nueva de proveedor va detrás de la misma
  interfaz común — no llames al SDK de un proveedor específico directamente desde
  un router de FastAPI.
- Maneja explícitamente: timeouts, reintentos con backoff, y diferenciación entre
  "el proveedor rechazó la operación" vs "el proveedor no respondió" (esto último
  requiere reconciliación posterior, no asumir éxito ni fallo).

## Temporal.io (si aplica)

- Operaciones multi-paso con posibilidad de fallo parcial (ej. onboarding con KYC,
  transferencias entre proveedores) van como Workflow de Temporal, no como una
  función síncrona larga en el endpoint.
- Activities deben ser idempotentes y de un solo efecto secundario claro cada una.

## Validaciones y errores

- Usa `HTTPException` con códigos de estado correctos y mensajes claros — evita
  devolver 500 genérico para errores de validación de negocio (usa 400/422).
- Toda validación de negocio (NIT válido, monto positivo, tenant correcto) va en
  la capa de servicio o en validadores de Pydantic, no dispersa en los endpoints.

## Testing
- Usa `pytest` + `httpx.AsyncClient` para tests de integración de endpoints.
- Para lógica de ledger, escribe tests que verifiquen que la suma de débitos
  siempre sea igual a la suma de créditos después de cada operación.
