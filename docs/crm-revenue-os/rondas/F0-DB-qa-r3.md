# F0-DB — Veredicto del qa-reviewer — Ronda 3

Fecha: 2026-09-15 · Insumos: `rondas/F0-DB-tester-r3.md` (9,0/10; 50 casos, 43 pasan), `rondas/F0-DB-builder-r3.md`, `rondas/F0-DB-qa-r2.md` (B1–B7), `docs/POLITICA-MIGRACIONES.md`.
Comprobaciones propias: solo `SELECT` vía MCP sobre `jgmgphmzusbluqhuqihj` (`supabase_migrations.schema_migrations`, `pg_get_functiondef`) y lectura del repositorio. Nada aplicado. Las organizaciones se citan solo por id.

## Calificación: 9,3/10

Desglose por dimensión (2 puntos cada una):

| Dimensión | Nota | Por qué |
|---|---|---|
| 1. Funcionalidad completa | 1,8 | B1–B7 cerrados: 56 pares `.sql` + rollback, tres migraciones nuevas con su reversión, docs y comentario de la org 2. Lo que falta es una parte de B1 tal como se pidió («los rollbacks de f00_29/30/32/33 deben restaurar la versión anterior»): el de f00_30 restaura una versión que **no es** la anterior y el de f00_29 es no-op, ambos con la premisa «texto no recuperable» cuando la fuente estaba en la misma tabla de la que el builder leyó las 56. |
| 2. Robustez | 1,9 | Migraciones idempotentes (aplicadas dos veces sin cambio de md5), rollbacks de f00_36/f00_37 que restauran byte a byte, tope de liberaciones con backoff 30→900 s y `dead` en la 10.ª, guarda de pertenencia y normalización de canal probadas con dos usuarios de organizaciones distintas. Resta la dependencia de `auth.role()` en claims (no explotable por PostgREST, sin documentar). |
| 3. Consistencia con el sistema | 1,9 | Sigue `POLITICA-MIGRACIONES` (MCP + `.sql` + rollback), el patrón `(select auth.uid())` de f00_13, `search_path` fijo, ACL intactas; el fallback del runner replica la regla SQL. `REVOKE ALL ON call_recordings FROM anon` va más allá del texto del QA pero es coherente con «anon fuera del todo». |
| 4. Resultados del tester | 1,8 | 43/50; 0 críticos, 0 altos; 3 de los 7 fallos son ajenos a F0-DB (`commCreditsService`, suites JOBS no deterministas, referencias REG). Verificación independiente (sha256 + longitud, no el md5 del builder). |
| 5. Documentación / trazabilidad | 1,7 | Informe del builder con tabla 56/56 y decisiones explicadas; FASE-00 y POLITICA-MIGRACIONES actualizadas. Pero dos rollbacks y la política heredan una afirmación falsa («no recuperable»), el de f00_30 no advierte que pisa un arreglo crítico posterior, y PROGRESS.md tiene la entrada de la ronda duplicada (L59 y L99) con contenido distinto. |

### Verificación propia de la afirmación del tester sobre 29/30

- `select version, name, length(...) from supabase_migrations.schema_migrations where version in ('20260110211238','20260901202059')` → ambas filas existen: `trigger_customer_channel_identities_omnicanal` (2 296 caracteres, con el `CREATE OR REPLACE FUNCTION fn_update_customer_channel_identity()` anterior) y `f2_fn_sync_status_from_stage` (1 282 caracteres, con el `fn_sync_status_from_stage` anterior: `closed_at = now()` sin `COALESCE`, `WHERE id = NEW.id` sin guarda `IS DISTINCT FROM`). **El tester tiene razón: el texto exacto sí está en la base.**
- Cadena de redefiniciones (`CREATE OR REPLACE FUNCTION`) por versión: `fn_update_customer_channel_identity` → `20260110211238`, luego `f00_29`; nada después salvo el `REVOKE EXECUTE` de `f00_35`. `fn_sync_status_from_stage` → `20260823023649`, `20260901202059`, `f00_30`, `20260909052947`. Por tanto las dos versiones citadas son la **anterior inmediata** y el rollback exacto de f00_29 y f00_30 es un `SELECT` de la base, no un PITR.
- **Matiz al tester** (fallo 1): tras f00_30 solo **una** migración redefine la función, `20260909052947_fn_sync_status_from_stage_requiere_datos_de_cierre`; `crm_v4_f09_stage_write_hardening` y `crm_customer_lifecycle_ladder` solo la mencionan en comentarios. El riesgo es igual de real: la función viva es la de 052947 (arreglo F9-31 «crítico»: la etapa no cierra sola para no crear comisiones con `win_data = NULL`), y ejecutar hoy el rollback de f00_30 la pisaría y reabriría ese bug sin que el archivo lo diga.
- Hallazgo colateral: `20260909052947` es posterior a la política y **no tiene `.sql` ni rollback en el repo** (no es `crm_v4_*`, así que no entraba en B1). Zona F9, no F0-DB; se anota, no se califica aquí.

### Fortalezas
- Reconstrucción B1 verificada dos veces con métodos independientes (md5 del builder, sha256 + longitud del tester): 56/56 idénticas, cabecera uniforme, 0 credenciales y 0 nombres de organizaciones cliente en 171 archivos.
- Las tres migraciones pendientes hacen exactamente lo que dicen y **sus rollbacks restauran el estado exacto** (md5 de políticas+grants y de `pg_get_functiondef`+ACL igual al baseline dentro de la misma transacción). Es la primera ronda de F0-DB en la que «verificado en rollback» lo puede repetir cualquiera.
- `fn_can_contact` deja de ser oráculo entre organizaciones para `authenticated` sin tocar la ACL ni romper a los tres llamadores; `service_role` sigue sin guarda, como se pidió.
- Tope de liberaciones elegido con criterio (columna `releases`, porque `attempts` vuelve a 0 en cada liberación) y cubierto tanto en SQL como en el fallback del runner con test de 12 liberaciones.
- Los 15 escritores de `*_usage_logs` rastreados hasta la ruta antes de revocar INSERT a `authenticated`; la retención de `failed|dead` que el QA dio por ausente se demostró existente y se fijó con test.
- Sin nombres de clientes ni credenciales en ningún artefacto de la ronda; el barrido se hizo antes y después.

### Problemas encontrados (ordenados por severidad)
1. **[medio] Rollback de `crm_v4_f00_30` no restaura la versión anterior y no advierte que pisa un arreglo crítico posterior.** Verificado: el cuerpo anterior exacto es `statements[1]` de `schema_migrations` versión `20260901202059`; la reconstrucción del archivo difiere (`COALESCE(closed_at, now())` y guarda `status IS DISTINCT FROM v_target` que la original no tenía). Y la función viva hoy es la de `20260909052947` (F9-31): ejecutar este rollback la reemplazaría y volvería a crear comisiones sobre ventas sin datos de cierre. Esperado: cuerpo exacto de `20260901202059` y una advertencia en cabecera «solo válido tras revertir 20260909052947; sobre la versión viva reintroduce F9-31».
2. **[bajo] Rollback de `crm_v4_f00_29` y `POLITICA-MIGRACIONES.md` «Deuda actual» afirman que la versión anterior «no está en el repositorio / no es recuperable».** Está en `schema_migrations` versión `20260110211238`. La decisión de no-op es defendible (esa versión revertía todo INSERT entrante en `messages`), pero la justificación debe ser la real y citar la fuente para que quien lo necesite pueda reconstruirla con criterio.
3. **[bajo] Guarda de `fn_can_contact` por `auth.role()` sin el supuesto documentado.** Medido por el tester: rol `authenticated` sin `request.jwt.claims` → guarda inactiva. No explotable vía PostgREST (los claims siempre viajan), pero el `comment on function` de f00_37 debe decirlo, porque una futura conexión directa con ese rol lo cambiaría.
4. **[bajo] `docs/crm-revenue-os/PROGRESS.md` tiene dos entradas «F0-DB — Ronda 3 construida — 2026-09-15» (L59 y L99) con contenido distinto.** El archivo se anexa, no se reescribe: basta una nota en la segunda que remita a la primera o viceversa, sin borrar.
5. **[bajo, fuera de F0-DB] `commCreditsService.ts` importa el cliente de navegador en el servidor**; `/api/integrations/twilio/credits` ya responde 404 hoy. No es regresión de f00_36 (confirmado por el tester). Va a la zona Twilio/F16 con el pendiente de que el guardrail 6 no lo detecta.
6. **[bajo, fuera de F0-DB] `20260909052947_fn_sync_status_from_stage_requiere_datos_de_cierre` aplicada sin `.sql` ni rollback**, siendo posterior a la política. Zona F9.
7. **[bajo, fuera de F0-DB] Referencias rotas en `FASE-00` L1408 y L1472** (zonas REG/JOBS) y suites de `src/lib/jobs` no deterministas en paralelo (zona JOBS).

### Instrucciones para el builder (ronda 4, solo archivos; no toca la base)
- **R1** — `supabase/rollbacks/20260909045035_crm_v4_f00_30_..._rollback.sql`: sustituir el cuerpo por el de `select statements[1] from supabase_migrations.schema_migrations where version='20260901202059'` (solo el `CREATE OR REPLACE FUNCTION`, sin el `DROP/CREATE TRIGGER`, que f00_30 no tocó), y cabecera: «Cuerpo exacto de la versión 20260901202059. ORDEN: solo válido si antes se revirtió 20260909052947 (F9-31); sobre la versión viva reintroduce comisiones con win_data NULL». Comprobación: md5 del cuerpo del archivo = `md5(statements[1])` de esa versión.
- **R2** — `supabase/rollbacks/20260909044626_crm_v4_f00_29_..._rollback.sql`: mantener el no-op, pero cambiar la justificación: «la versión anterior está en schema_migrations versión 20260110211238 (2 296 caracteres) y se deja fuera a propósito porque revertía todo INSERT entrante; reconstruir desde ahí solo con criterio». Mismo ajuste en el párrafo «Saldado el 2026-09-15» de `docs/POLITICA-MIGRACIONES.md`.
- **R3** — `supabase/migrations/20260915231000_crm_v4_f00_37_...sql` L101 (`comment on function public.fn_can_contact`): añadir «la guarda depende de request.jwt.claims (auth.role()); una sesión con rol authenticated sin JWT no pasa por ella. Supuesto válido bajo PostgREST/Supabase». El rollback no cambia (deja el comment en NULL, como está verificado).
- **R4** — `docs/crm-revenue-os/PROGRESS.md`: bajo la entrada de L99 añadir una línea «(entrada duplicada de L59; vale la primera; se conserva por la regla de solo anexar)» o fusionar el contenido no repetido en una nota. No borrar líneas.
- Comprobación de cierre de la ronda 4: `md5` de los cuerpos de los rollbacks 29 (no-op) y 30 (= `20260901202059`), grep de «no recuperable|no está en el repositorio» en `supabase/rollbacks/*f00_29*`, `*f00_30*` y `POLITICA-MIGRACIONES.md` = 0, y las tres migraciones pendientes siguen byte a byte (el tester ya las validó; R3 solo cambia el `comment on`).

### Nota sobre la regla de tres rondas
Esta es la tercera ronda de F0-DB por debajo de 9,5. No hay bloqueo raíz técnico: los cuatro puntos son ediciones de texto en archivos del repositorio, sin base de datos, y caben en una ronda de minutos. La puerta humana real es la que ya existía: el dueño debe aplicar por MCP `f00_36` → `f00_37` → limpieza (orden recomendado por el tester; independientes entre sí) y pasar `get_advisors(performance)` sobre `ai_usage_logs`, `comm_usage_logs` y `call_recordings`. Se pide ese input y, en paralelo, la ronda 4 del builder.

### Qué falta para el 10 (además de la ronda 4)
- Rollbacks exactos de f00_29 y f00_30 tomados de la base (R1/R2), y versionar `20260909052947` con su rollback en la zona F9.
- Test de contrato en `npx jest` que lea `supabase/migrations/*.sql` y `supabase/rollbacks/*.sql` y falle ante un nombre de `organizations.name` o un patrón de credencial (el barrido sigue siendo manual, ronda tras ronda).
- Ejecutar en transacción abortada los 56 rollbacks de B1 (hoy solo se revisaron por lectura los de 29/30/32/33/35 y seeds) y añadir a los de f00_32/f00_33 la advertencia de orden respecto a f00_35.
- Concurrencia real de `fn_claim_jobs` con dos workers (`SKIP LOCKED`) y `contact_consents` con un `opted_out` real para `fn_can_contact`; pendientes desde la ronda 1.
- Cosmética de `fn_release_job`: al morir por tope deja `run_at = now() + 900 s` en el job `dead`; inocuo, pero confunde en `v_outbound_jobs_failed`.

### Veredicto
requiere-nueva-ronda
