# F0-DB — Informe del tester — Ronda 4 (R1–R3 del constructor, corta)

Fecha: 2026-09-15 · Proyecto Supabase `jgmgphmzusbluqhuqihj` · Insumos: `rondas/F0-DB-builder-r4.md`, `rondas/F0-DB-qa-r3.md`, `rondas/F0-DB-tester-r3.md`, `docs/POLITICA-MIGRACIONES.md`.
Método: solo `SELECT` vía MCP; los dry-run se ejecutaron **dentro de un bloque `DO` que termina en `RAISE EXCEPTION`** (la excepción devuelve las mediciones y aborta la transacción). Para probar que lo ejecutado es el archivo y no una transcripción, el bloque devuelve el sha256 del texto que ejecutó y se compara con el sha256 local del archivo (sin sus líneas `begin;`/`commit;`). El barrido de nombres de organizaciones se hizo **dentro de la base** (el texto de los 5 archivos viaja como literal y solo vuelven ids): ningún nombre de cliente tocó disco ni transcripción. Las organizaciones se citan solo por id. **Nada se aplicó**: estado final = estado previo (§5).

## Resumen de pruebas
- Casos ejecutados: 26
- Pasaron: 24
- Fallaron: 2 (ambos bajos; 1 fuera del perímetro del constructor)

## 1. R1 — Rollback de `crm_v4_f00_30`

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Cabecera del archivo vs `schema_migrations` versión `20260901202059` (`f2_fn_sync_status_from_stage`, `array_length(statements,1)=1`): 1 282 caracteres / 1 284 bytes UTF-8, md5 `3fa918f68f5a41b73b98186322d6de9a`, sha256 `9c969708fd3079bf5eeac9775b7e6bf86024fcab18948e0c7635e0223a5e0d86` | PASA: los tres valores coinciden con la base |
| 2 | `tail -n +28 <archivo> \| sha256sum` (instrucción de la cabecera) y `md5sum`, 1 284 bytes, sin salto final | **PASA: byte a byte** (`9c969708…5e0d86`, `3fa918f6…de9a`) |
| 3 | Archivo UTF-8 con LF puro (0 bytes `0x0D`); el cuerpo empieza en la línea 28 como dice la cabecera | PASA |
| 4 | Cadena de `CREATE OR REPLACE FUNCTION fn_sync_status_from_stage` en `schema_migrations`: `20260823023649` → `20260901202059` → `20260909045035` (f00_30) → `20260909052947` | PASA: `20260901202059` es la anterior inmediata; `052947` es la única redefinición posterior (confirma el matiz del QA) |
| 5 | Versión viva = `20260909052947`: md5 de `pg_get_functiondef` hoy (`343cd565fae6dc68cf07fc81d8a9ab17`) vs md5 tras re-ejecutar `statements[1]` de `052947` en transacción abortada | PASA: **iguales** (la viva es la de F9-31: `win_data`, sin cierre por `probability`) |
| 6 | Misma transacción abortada: ejecutar el cuerpo del rollback sobre la viva → aplica limpio, md5 pasa a `ca050ef316b11496dba7450251f90027`, la función vuelve a contener `probability` y pierde la guarda `win_data`; `pg_get_triggerdef(trg_sync_status_from_stage)` idéntico antes/después | PASA: la advertencia de orden es correcta y necesaria; recrear el trigger es inocuo, como dice la cabecera |
| 7 | Desviación respecto a la instrucción del QA («solo el CREATE OR REPLACE FUNCTION, sin el DROP/CREATE TRIGGER») | PASA con nota: el constructor copió `statements[1]` completo para que `md5(cuerpo) = md5(statements[1])` sea comprobable; lo justifica en cabecera y el trigger es idéntico (caso 6). Es la lectura correcta de la comprobación pedida |
| 8 | Texto de la cabecera L24–25: «(hallazgo crítico del tester r4)» | **FALLA (bajo)**: el hallazgo es del tester **r3** (`F0-DB-tester-r3.md`, fallo 1) y su severidad fue **medio**, no crítico. Cosmético; corregir a «tester r3» |

## 2. R2 — Rollback de `crm_v4_f00_29` y `POLITICA-MIGRACIONES.md`

| # | Comprobación | Resultado |
|---|---|---|
| 9 | Cabecera cita `20260110211238` (`trigger_customer_channel_identities_omnicanal`): 2 296 caracteres, md5 `331454f6319a2d32234a551e34140f76`, sha256 `ab8b175c1debe069a70501c5fbf22911986ad0349927c2f74bd907620cd53c61` | PASA: coinciden con la base (2 305 bytes UTF-8) |
| 10 | «Entre esa versión y f00_29 nadie más redefinió la función; después solo el REVOKE de f00_35»: `CREATE OR REPLACE FUNCTION fn_update_customer_channel_identity` solo en `20260110211238` y `20260909044626`; `20260909050212` (f00_35) solo la menciona | PASA |
| 11 | «Era defectuosa»: la versión antigua hace `SELECT type INTO v_channel_type FROM channels` e inserta `v_channel_type` como `identity_type` y `NEW.external_message_id` como identidad; el CHECK vivo admite solo `widget_anon, widget_identified, whatsapp_phone, instagram_user, facebook_psid` y `channels.type` en la base es `website`/`whatsapp` | PASA: el CHECK rechazaría todo INSERT del trigger `AFTER INSERT ON messages`, como dice el archivo |
| 12 | Cuerpo sin comentarios = `select 1;` (no-op intacto), LF puro | PASA |
| 13 | `grep -i -E "no recuperable\|no est[aá] en el repositorio"` en `*f00_29*`, `*f00_30*` (migraciones y rollbacks) y `POLITICA-MIGRACIONES.md`; además `PITR\|backup` en los 5 archivos | PASA: 0 y 0 |
| 14 | `POLITICA-MIGRACIONES.md`: `git diff --numstat` = 15 adiciones / 0 borrados; el párrafo «Saldado el 2026-09-15» cita `20260110211238` (2 296 caracteres), `20260901202059` y la advertencia de orden respecto a `20260909052947` | PASA |

## 3. R3 — `comment on function` en `crm_v4_f00_37` (dry-run en transacción abortada)

| # | Comprobación | Resultado |
|---|---|---|
| 15 | L101–102 del `.sql`: `comment on function public.fn_can_contact(integer, uuid, text, text)` con el SUPUESTO (`request.jwt.claims`/`auth.role()`, rol `authenticated` sin JWT no pasa por la guarda, válido bajo PostgREST/Supabase, no aplica a `service_role`/`pg_cron`/sesión directa) | PASA |
| 16 | El texto ejecutado es el archivo: sha256 del literal dentro del `DO` = sha256 local del `.sql` sin `begin;`/`commit;` (`63307477…c2b48d21`, 8 327 bytes con el LF inicial); ídem rollback (`f7af5247…380c0399`, 3 243 bytes) | PASA |
| 17 | Migración aplica limpia sobre el estado actual | PASA |
| 18 | `obj_description(fn_can_contact)` tras aplicar = el comentario completo con el SUPUESTO | PASA |
| 19 | Idempotencia: segunda ejecución → mismo snapshot (`pg_get_functiondef`+ACL+comment) de las dos funciones | PASA |
| 20 | Rollback en la misma transacción → snapshot de `fn_can_contact` (`3edf38fa378f7ebbc3cd1a5e3e78d6eb`) y `fn_release_job` (`478307a4918b7375ceb6edf3a1d41e04`) **iguales al baseline**; comment `NULL`; columna `outbound_jobs.releases` presente tras la migración (1) y ausente tras el rollback (0) | PASA: restaura exactamente |
| 21 | Rollback de f00_37 sin cambios respecto a r3 (`comment … is null` en L54) | PASA |

## 4. Credenciales, nombres de organizaciones y estado final

| # | Comprobación | Resultado |
|---|---|---|
| 22 | 12 patrones de credencial (JWT, `sk-`, `sk_live/test`, `re_`, SID Twilio con `\b`, DSN con password, `*key/secret/password/token = '…'`, `vault.create_secret`, `Bearer`, AKIA, `ghp_`) en los 5 archivos | PASA: 0 (con `\b` desaparece el falso positivo `AC…` del sha256 que citó el constructor) |
| 23 | `organizations.name` con ≥ 6 caracteres (81 orgs) contra las líneas únicas de los 5 archivos, evaluado dentro de la base | PASA: solo **org 6** (palabra genérica «organizaciones», 3 apariciones; falso positivo ya documentado) |
| 24 | Estado final = previo: md5 de `pg_get_functiondef`+ACL+comment de `fn_can_contact`, `fn_release_job`, `fn_sync_status_from_stage` (`343cd565…`) y `fn_update_customer_channel_identity` (`0dae9f14…`) idénticos antes y después de los 3 dry-run; sin columna `releases`; 0 sesiones `idle in transaction`; trigger `trg_sync_status_from_stage` intacto | PASA |
| 25 | `docs/crm-revenue-os/PROGRESS.md`: los 3 borrados del diff son las filas de la tabla de fases (permitido por `loop.md` paso 5); el historial solo se anexa | PASA |
| 26 | R4 (orquestador): nota de duplicado bajo la entrada «F0-DB — Ronda 3 construida» de L99 (o L59) | **FALLA (bajo, fuera del constructor)**: no existe ninguna nota en L59–62 ni en L99–102; solo L115 dice «R4 entrada duplicada (ya resuelta por el orquestador)». Las dos entradas siguen sin remitirse entre sí |

## 5. Estado de la base al terminar (nada aplicado)

Los tres dry-run (re-ejecución de `052947` + cuerpo del rollback f00_30; migración f00_37 ×2 + rollback) terminaron en `RAISE EXCEPTION` (`P0001`). Comprobación posterior: los cuatro snapshots de funciones son los del baseline tomado antes (§4 caso 24), `has_column(outbound_jobs.releases) = 0`, 0 sesiones en transacción. No se creó ningún archivo en el repositorio salvo este informe; los auxiliares (`mig37.sql`, `rb37.sql`, `dry37.sql`, `cred.re`, `orgscan*.sql`) vivieron en el scratchpad de la sesión y se borraron.

## Fallos encontrados
1. **[bajo] Cabecera del rollback de `crm_v4_f00_30` atribuye el hallazgo al «tester r4» y lo llama «crítico».** Reproducir: `sed -n '24,25p' supabase/rollbacks/20260909045035_crm_v4_f00_30_*_rollback.sql`. Esperado: «hallazgo del tester r3 (medio)». Obtenido: «hallazgo crítico del tester r4». No afecta al cuerpo (el sha256 se calcula desde la línea 28): corregir la cabecera no rompe la comprobación byte a byte.
2. **[bajo, fuera del constructor] R4 no está hecha en `docs/crm-revenue-os/PROGRESS.md`.** Reproducir: `grep -n -E "L ?59|L ?99|vale la primera|solo anexar" docs/crm-revenue-os/PROGRESS.md` → 0 líneas; `sed -n '99,102p'` no contiene ninguna nota. Esperado (QA r3, R4): una línea bajo L99 que remita a L59 (o viceversa) sin borrar nada. Obtenido: solo la mención en L115 «ya resuelta por el orquestador».

## Cobertura no probada / riesgos pendientes
- `f00_36` y `limpieza_jobs_huerfanos` no se volvieron a ejecutar en dry-run: el constructor declara que no las tocó y R3 solo cambia el `comment on` de f00_37; siguen valiendo las mediciones de la ronda 3.
- La medición «rol `authenticated` sin claims → guarda inactiva» no se repitió; el SUPUESTO del comentario describe exactamente lo medido en r3 (fallo 4 de aquel informe).
- `20260909052947` sigue sin `.sql` ni rollback en el repo (zona F9): mientras no exista, la advertencia de orden del rollback de f00_30 remite a una versión que solo vive en `schema_migrations`. No se califica aquí.
- Los rollbacks de f00_32/f00_33 siguen sin advertencia de orden respecto a f00_35 (pendiente del QA para el 10, no pedido en esta ronda).
- Sigue pendiente la puerta humana: aplicar por MCP `f00_36` → `f00_37` → limpieza y pasar `get_advisors(performance)`.

## Calificación de robustez (1-10, opinión técnica)
9,6/10 — Las tres correcciones hacen exactamente lo que pidió el QA y se pueden repetir con los hashes de las cabeceras: el rollback de f00_30 es byte a byte la versión `20260901202059` y su advertencia de orden es correcta (la viva es `052947`, y el dry-run demuestra que el rollback la pisaría reintroduciendo el cierre por `probability` sin guarda `win_data`); la justificación del no-op de f00_29 es ahora la real y verificable contra el CHECK vivo; el `comment on` de f00_37 se ve en `obj_description` y el rollback deja el baseline exacto. 0 credenciales y 0 nombres de cliente. Lo que resta es cosmético: una atribución equivocada en una cabecera y la nota de duplicado en PROGRESS.md que quedó sin escribir.
