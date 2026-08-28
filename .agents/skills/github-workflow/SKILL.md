---
name: github-workflow
description: Usar SIEMPRE al crear pull requests, escribir mensajes de commit, revisar código en GitHub, configurar GitHub Actions/CI, o gestionar issues/branches. Aplica a cualquier tarea que toque el repositorio Git más allá de solo escribir código de la aplicación.
---

# Flujo de trabajo con GitHub

## Commits
- Mensajes de commit en formato Conventional Commits (`feat:`, `fix:`, `refactor:`,
  `chore:`, `docs:`, `test:`) — facilita changelog automático y claridad de
  historial en un repo con múltiples proyectos (Go Admin, Go Chat).
- Commits atómicos: un cambio lógico por commit, no mezclar refactor + feature
  nueva en el mismo commit.

## Pull Requests
- Título claro y descriptivo, cuerpo con: qué cambia, por qué, cómo probarlo.
- Si el cambio toca lógica financiera/ledger o RLS de Supabase, márcalo
  explícitamente en la descripción del PR para que el reviewer le preste
  atención extra (estos son los puntos de mayor riesgo del stack).
- Vincula el issue relacionado (`Closes #123`) cuando exista.
- PRs pequeños y enfocados sobre PRs gigantes que mezclan varias features —
  más fácil de revisar y de hacer rollback si algo falla.

## GitHub Actions / CI
- Todo PR a `main`/`develop` corre: lint, type-check, tests. No mergear con CI
  en rojo salvo excepción explícita y justificada.
- Secrets (claves de Stripe, Supabase service role, etc.) siempre vía
  `secrets.*` de GitHub Actions, nunca hardcodeados en el workflow YAML.
- Si hay múltiples apps en el mismo monorepo (web, backend FastAPI, mobile),
  usa paths filtering para que el CI solo corra los jobs relevantes al código
  que cambió, no todo el pipeline en cada PR.

## Branches
- Convención simple: `main` (producción), `develop` (si aplica), y branches de
  feature con prefijo (`feat/`, `fix/`, `chore/`) + descripción corta.
- Nunca commitear directo a `main` en proyectos con más de una persona tocando
  código — siempre vía PR, incluso para cambios pequeños, para mantener CI como
  gate.

## Code review (cuando actúes como reviewer)
- Prioriza: ¿rompe algo existente?, ¿maneja errores/edge cases?, ¿es consistente
  con los patrones ya establecidos en el repo? por encima de preferencias de
  estilo menores.
- En código que toca dinero (ledger, Stripe, proveedores de pago) o seguridad
  (RLS, auth), sé más estricto — pide tests explícitos si no los hay.
