---
trigger: always_on
---

# Reglas de Git y Base de Datos

## Git / GitHub — NO subir sin autorización explícita

**NUNCA ejecutes `git push`, `git commit` + push, ni crees/merges PRs sin que el
usuario te lo pida explícitamente.**

- `git commit` local está permitido solo cuando el usuario lo solicite.
- `git push` a cualquier remoto (`origin`, `upstream`, etc.) está **prohibido**
  salvo autorización explícita y verbal del usuario en esa conversación.
- Crear PRs (`gh pr create`) requiere autorización explícita del usuario.
- Una autorización previa en una sesión anterior **no cuenta** para la sesión
  actual — vuelve a pedir confirmación cada vez.
- Si el usuario dice "sube esto" / "push" / "sube a github" → entonces sí.
- Si el usuario dice "commitea" pero no menciona push → commitea local, NO pushees.
- Nunca fuerces push (`git push --force` / `--force-with-lease`) ni reescribas
  historia sin confirmación explícita para esa operación destructiva.

## Base de Datos — NO crear archivos SQL, usar MCP de Supabase

**NUNCA crees, modifiques ni escribas archivos `.sql` (migraciones, seeds,
scripts, dumps) en el repositorio.**

- Los cambios de esquema (tablas, columnas, índices, constraints, RLS) se
  aplican **siempre** vía el MCP de Supabase (`apply_migration`,
  `execute_sql`, etc.) sobre el proyecto `jgmgphmzusbluqhuqihj`.
- No generes archivos `supabase/migrations/*.sql`, ni `db/*.sql`, ni scripts
  SQL sueltos en ninguna ruta del repo.
- Si el usuario pide un cambio de esquema, úsalo vía MCP directamente.
- Si el usuario pide explícitamente "crea el archivo SQL" → entonces sí, pero
  confirma primero porque la regla por defecto es MCP.
- Consultas de lectura (ver tablas, columnas, tipos) → usa `list_tables` u
  otras herramientas de lectura del MCP de Supabase.

**Razón:** el esquema vivo está en Supabase; los archivos SQL en el repo se
desincronizan rápido y generan drift. Aplicar vía MCP garantiza que el cambio
queda reflejado en la BD real inmediatamente.
