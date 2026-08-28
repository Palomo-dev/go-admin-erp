---
name: ci-cd-pipelines
description: Usar SIEMPRE al diseñar o modificar pipelines de integración/despliegue continuo (GitHub Actions u otro sistema), configurar ambientes de deploy, o definir estrategias de release. Complementa a github-workflow, pero enfocado en la mecánica del pipeline, no en convenciones de PR/commits.
---

# CI/CD Pipelines

## Estructura recomendada de un pipeline
1. **Lint + type-check** — falla rápido, es lo más barato de correr.
2. **Tests** (unitarios → integración → e2e, en ese orden de velocidad).
3. **Build** — solo si los pasos anteriores pasan.
4. **Deploy** — a staging automático en cada merge a `develop`/`main`; a
   producción manual (approval gate) o automático solo si hay alta confianza
   en la suite de tests.

## Monorepo (Next.js + FastAPI + apps móviles)
- Usa path filtering para correr solo los jobs relevantes al código que cambió
  (no rebuildear el backend Python si solo cambió el frontend).
- Cachea dependencias (`node_modules`, `pip cache`, `.next/cache`) entre runs
  para acelerar el pipeline.

## Estrategias de despliegue
- **Zero-downtime**: rolling deploy o blue-green, especialmente crítico si hay
  transacciones de dinero en curso — nunca matar el proceso a mitad de una
  transacción financiera.
- Migraciones de base de datos van **antes** del deploy del código nuevo, y deben
  ser compatibles con el código viejo durante la ventana de transición (evita
  romper la versión anterior mientras se despliega).
- Feature flags para features grandes/riesgosas, en vez de un big-bang release —
  permite activar/desactivar sin rollback de código.

## Rollback
- Todo deploy debe ser reversible rápidamente (versión anterior taggeada,
  migraciones con `down` cuando sea posible).
- Ten un plan claro de qué hacer si un deploy falla a mitad de camino, no
  improvisar en el momento.

## Secrets y ambientes
- Secrets del pipeline (claves de deploy, tokens de Stripe/Supabase) van en el
  gestor de secrets del CI (GitHub Actions secrets), nunca en el YAML del workflow.
- Ambientes separados con sus propias credenciales — nunca reusar credenciales
  de producción en staging/CI.

## Notificaciones
- Falla de pipeline en `main` debe notificar inmediatamente (Slack, email) — un
  pipeline roto en la rama principal bloquea a todo el equipo.
