---
name: stripe-billing
description: Usar SIEMPRE que se trabaje con Stripe — suscripciones/billing del SaaS, webhooks, checkout, facturación, reconciliación de pagos, o manejo de eventos de Stripe. Aplica tanto para el billing del propio SaaS (Go Admin) como para flujos de pago dentro del producto si aplica.
---

# Integración con Stripe

## Webhooks (lo más propenso a errores)

- **Siempre** verifica la firma del webhook (`stripe.webhooks.constructEvent` con
  el `webhook secret`) antes de procesar el evento — nunca confíes en el payload
  sin verificar.
- Procesa eventos de forma idempotente: guarda el `event.id` procesado y descarta
  duplicados (Stripe puede reenviar el mismo evento más de una vez).
- Responde `200` rápido al webhook y procesa la lógica pesada de forma asíncrona
  (cola/job) si toma tiempo — Stripe reintenta si no responde a tiempo, lo que
  puede duplicar procesamiento si no eres idempotente.
- Nunca actualices el estado de una suscripción/pago solo desde el frontend
  (ej. tras un `redirect` de Checkout) — la fuente de verdad es el webhook, el
  frontend puede mostrar estado optimista pero debe reconciliarse con el evento.

## Suscripciones / billing SaaS multi-tenant
- Un `customer` de Stripe por tenant/organización, no por usuario individual, si
  el modelo es "una empresa paga por su cuenta".
- Guarda el mapeo `tenant_id ↔ stripe_customer_id ↔ stripe_subscription_id` en tu
  propia base de datos — no dependas solo de metadata de Stripe como fuente
  primaria de verdad para lógica de acceso.
- Maneja explícitamente los estados: `trialing`, `active`, `past_due`, `canceled`,
  `unpaid` — decide y documenta qué acceso tiene el tenant en cada uno (ej. modo
  solo lectura en `past_due` antes de cancelar acceso completo).

## Seguridad
- Claves secretas (`sk_...`) solo en backend/servidor — nunca en código de cliente
  ni en apps móviles/Electron empaquetadas.
- Usa Stripe Checkout o Elements para capturar datos de tarjeta — nunca manejes
  números de tarjeta directamente en tu backend (alcance de PCI compliance).

## Testing
- Usa el CLI de Stripe (`stripe listen --forward-to`) para probar webhooks en
  local antes de desplegar.
- Prueba explícitamente el caso de pago fallido y de reintento, no solo el camino
  feliz de suscripción exitosa.
