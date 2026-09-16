# F0-DB — Informe del builder — Ronda 4

Fecha: 2026-09-15 · Insumos: `rondas/F0-DB-qa-r3.md` (9,3/10, R1–R4) y `rondas/F0-DB-tester-r3.md`, `docs/POLITICA-MIGRACIONES.md`.
Ronda corta, **solo archivos**. Proyecto Supabase `jgmgphmzusbluqhuqihj` en **solo lectura** (4 `SELECT` vía MCP sobre `supabase_migrations.schema_migrations`, `pg_trigger` y `organizations.name` para el barrido). Nada aplicado, ningún commit. R4 (nota de duplicado en `PROGRESS.md`) la hizo el orquestador. Las organizaciones se citan solo por id.

## Qué se hizo en esta ronda

1. **R1 — `supabase/rollbacks/20260909045035_crm_v4_f00_30_sync_status_from_stage_por_is_won_is_lost_rollback.sql`**: se sustituyó la reconstrucción semántica por el **cuerpo exacto** de `schema_migrations` versión `20260901202059` (`f2_fn_sync_status_from_stage`, `statements[1]`, 1 282 caracteres, md5 `3fa918f68f5a41b73b98186322d6de9a`, sha256 `9c969708fd3079bf5eeac9775b7e6bf86024fcab18948e0c7635e0223a5e0d86`). El cuerpo se leyó como base64 (`encode(convert_to(statements[1],'UTF8'),'base64')`) para no depender de escapes, y se escribió sin `begin/commit` ni salto final para que la comparación sea byte a byte. Cabecera de 27 líneas con la fuente, los hashes, la instrucción de comprobación (`tail -n +28 <archivo> | sha256sum`) y la advertencia de **ORDEN**: solo válido si antes se revierte `20260909052947_fn_sync_status_from_stage_requiere_datos_de_cierre` (F9-31), que es la versión viva; sobre ella reintroduce comisiones con `win_data = NULL`, además de volver a cerrar por probability y estampar `closed_at = now()` sin `COALESCE`.
2. **R2 — `supabase/rollbacks/20260909044626_crm_v4_f00_29_fix_customer_channel_identity_trigger_rollback.sql`**: sigue siendo no-op (`select 1;`), pero la justificación ya es la real: la versión anterior **sí es recuperable** (`schema_migrations` versión `20260110211238`, `trigger_customer_channel_identities_omnicanal`, 2 296 caracteres, md5 `331454f6319a2d32234a551e34140f76`, sha256 `ab8b175c…`), nadie la redefinió entre esa versión y f00_29, y se omite **a propósito** porque revertía todo INSERT entrante en `messages`. El archivo cita el `SELECT` para reconstruirla con criterio. Desaparece el «solo desde un backup PITR». Mismo ajuste en el párrafo «Saldado el 2026-09-15» de `docs/POLITICA-MIGRACIONES.md` (solo se amplió ese párrafo; el resto del archivo intacto).
3. **R3 — `supabase/migrations/20260915231000_crm_v4_f00_37_can_contact_guarda_y_release_job_tope.sql` L101–102**: el `comment on function public.fn_can_contact(...)` añade el supuesto: la guarda de pertenencia depende de `request.jwt.claims` (`auth.role()`), no del rol de sesión; una conexión con rol `authenticated` sin JWT no pasa por ella; válido bajo PostgREST/Supabase y no aplicable a conexiones sin claims (`service_role`, `pg_cron`, sesión directa). Es el único cambio en las tres migraciones pendientes: no toca el cuerpo de la función, la ACL ni `fn_release_job`. El rollback no cambia: deja el comment en `NULL`, que es el baseline verificado por el tester.

## Feedback de la ronda anterior que se atendió

- [medio] R1 rollback f00_30 no exacto y sin advertencia de orden → cuerpo exacto de `20260901202059` verificado por sha256 + advertencia de orden respecto a `20260909052947`.
- [bajo] R2 f00_29 y política con «no recuperable» → justificación real con la cita de `20260110211238`; `grep -i -E "no recuperable|no est[aá] en el repositorio"` sobre `*f00_29*`, `*f00_30*` y `POLITICA-MIGRACIONES.md` = 0.
- [bajo] R3 guarda por `auth.role()` sin supuesto documentado → en el `comment on function` de f00_37.

## Decisiones de diseño relevantes

- **El rollback de f00_30 copia `statements[1]` completo, con su `DROP/CREATE TRIGGER`**, aunque f00_30 no tocó el trigger. Motivo: el QA pide `md5(cuerpo) = md5(statements[1])`, y recortar el trigger rompería esa igualdad. Es inocuo: `pg_get_triggerdef` del trigger vivo es idéntico (`AFTER UPDATE OF stage_id ON public.opportunities FOR EACH ROW EXECUTE FUNCTION fn_sync_status_from_stage()`), así que recrearlo no cambia nada. Queda dicho en la cabecera.
- Sin `begin;`/`commit;` en el rollback de f00_30 (los otros rollbacks de B1 los llevan): el `apply_migration`/`execute_sql` del MCP ya envuelve en transacción, y añadirlos impediría la comprobación byte a byte.
- Los hashes de verificación (md5 y sha256) van en las cabeceras para que el tester los repita sin leer este informe.

## Verificación

| Comprobación | Resultado |
|---|---|
| `tail -n +28 rollback_f00_30 \| sha256sum` vs `sha256(convert_to(statements[1],'UTF8'))` de `20260901202059` | **igual**: `9c969708fd30…5e0d86`; md5 `3fa918f68f5a…de9a`; 1 282 caracteres |
| Trigger vivo `trg_sync_status_from_stage` = el `CREATE TRIGGER` del cuerpo copiado | igual (`pg_get_triggerdef`) |
| Rollback f00_29 sin comentarios | `select 1;` (no-op intacto) |
| `grep -i -E "no recuperable\|no est[aá] en el repositorio"` en `*f00_29*`, `*f00_30*`, `POLITICA-MIGRACIONES.md` | 0 |
| Credenciales (JWT, `sk-`, `sk_live/test`, `re_…`, SID Twilio, DSN con password, `*_key/secret/password/token = '…'`, `vault.create_secret`, `Bearer`) en los 5 archivos tocados | 0 (una coincidencia de `-i` con `AC[0-9a-f]{32}` dentro del sha256 de la cabecera de f00_30: falso positivo, es el hash) |
| Nombres de `organizations.name` ≥ 6 caracteres (81, leídos por MCP y no persistidos) en los 5 archivos | 3 coincidencias, todas la palabra genérica «organizaciones» (org 6, falso positivo documentado) |
| f00_36 y limpieza | sin cambios (`git status`: mismos archivos untracked, no tocados) |

No se ejecutó `npx jest`/`tsc`/`next build`: la ronda no toca código TypeScript.

## Pendientes que dejo explícitamente para revisión

- `20260909052947_fn_sync_status_from_stage_requiere_datos_de_cierre` sigue sin `.sql` ni rollback en el repo (zona F9, fuera de F0-DB; el QA ya lo anotó). Hasta que exista, la advertencia de orden del rollback de f00_30 remite a una versión que solo vive en `schema_migrations`.
- Sigue pendiente la puerta humana: aplicar por MCP `f00_36` → `f00_37` → limpieza y pasar `get_advisors(performance)`.
