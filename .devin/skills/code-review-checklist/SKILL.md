---
name: code-review-checklist
description: Usar SIEMPRE al revisar un pull request, un diff de código, o cuando el usuario pide "revisa este código"/"dame feedback de este PR". Va más allá de estilo — busca bugs, problemas de seguridad y consistencia arquitectónica.
---

# Checklist de Code Review

## Orden de prioridad al revisar
1. **¿Rompe algo existente?** — busca efectos secundarios en otras partes del
   sistema que dependan de lo que se cambió.
2. **¿Maneja errores y edge cases?** — inputs vacíos/nulos, límites, fallas de red,
   respuestas de terceros con error.
3. **¿Es seguro?** — inyección, datos de un tenant filtrados a otro, secrets
   expuestos, validación de input del usuario ausente.
4. **¿Es consistente con los patrones ya usados en el repo?** — mismo estilo de
   manejo de errores, misma estructura de capas, mismas convenciones de nombres.
5. **Estilo/legibilidad** — lo menos importante, no bloquees un PR por preferencia
   de estilo si lo demás está bien, a menos que el repo tenga linter/formatter
   que ya debería haberlo atrapado.

## Preguntas específicas para este tipo de stack
- Si toca la base de datos: ¿la migración es reversible? ¿Tiene índices para las
  queries nuevas que introduce?
- Si toca RLS/multi-tenancy: ¿se probó que un usuario de otro tenant no puede ver
  estos datos?
- Si toca dinero (ledger, Stripe, proveedores de pago): ¿es idempotente? ¿Usa
  transacción atómica?
- Si agrega una dependencia nueva: ¿es necesaria o ya existe algo similar en el
  proyecto? ¿Tiene mantenimiento activo?
- Si toca UI: ¿maneja estados de loading/error/vacío, no solo el caso feliz?

## Cómo dar feedback
- Sé específico: señala la línea y por qué es un problema, no solo "esto está mal".
- Distingue bloqueante ("esto puede perder datos de un tenant") de sugerencia
  ("esto se podría simplificar, no bloquea el merge").
- Si el PR es demasiado grande para revisar bien, dilo explícitamente y sugiere
  dividirlo — no apruebes por cansancio.

## Señales de alerta que ameritan revisión más profunda
- `try/except`/`catch` vacío o que solo hace `console.log` del error.
- Lógica de permisos/tenant duplicada en varios lugares en vez de centralizada.
- Números mágicos o strings repetidos sin constante/config.
- Comentarios tipo `// TODO fix later` en código que toca dinero o seguridad.
