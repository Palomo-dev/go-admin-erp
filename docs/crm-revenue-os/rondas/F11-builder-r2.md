# F11 — Post-venta: onboarding, health, renovación — Constructor, ronda 2

Fecha: 2026-09-15. Referencia: `PROGRESS.md` → «F11 — Ronda 1 evaluada» (8,3/10, siete puntos).

> **Nota de reanudación.** Esta ronda se lanzó dos veces por el apagado del equipo.
> Al entrar el segundo constructor (17:19), el primero ya estaba **vivo y en fase de
> mutaciones** sobre `onboardingService.ts`, `renewalMilestones.ts`, `healthScoreServer.ts`
> y compañía (mutantes observados y restaurados cada ~20 s: `isUniqueViolation → !!error`,
> `toPlainDate → toISOString().slice(0,10)`). Para no corromper su línea base ni pisar sus
> restauraciones, el segundo constructor **no editó ningún archivo de código de F11**:
> inspeccionó lo hecho, verificó por MCP, y añadió solo lo que faltaba y no chocaba
> (migración de eliminación de la MV + rollback, este documento). Si el primer constructor
> escribe su propio `F11-builder-r2.md`, prevalece el suyo para el detalle de mutaciones.

## Qué se hizo en esta ronda

Estado del árbol de trabajo verificado a las 17:20–17:30 (todo sin commit, como manda el ciclo):

- **Un solo score** (`healthScoreServer.ts`): `scoreOf(row, config)` = `config.indicators` sobre la
  fila de `fn_customer_health`; sin indicadores, el score de la RPC. Lo usan la lista y el detalle
  (`composeHealthResult`), el cron (`recalculateOrgHealth`), «Recalcular»
  (`POST /api/crm/health/refresh`, nueva) y «Medir ahora»
  (`POST /api/crm/health/[customerId]/snapshot`, nueva; `snapshotCustomerHealth`). Los snapshots
  pasan siempre por `shouldWriteSnapshot` (solo si cambió o venció el intervalo).
  `healthScoreService.ts` (navegador) queda como **fachada por `fetch`** a esas rutas: 0 llamadas
  a Supabase desde el cliente; `countInvoices` va a `invoice_sales` filtrando por organización.
  **`mv_customer_health` ya no tiene ningún lector** en `src/` ni en los otros tres repos.
- **Cron que cabe** (`src/lib/jobs/scheduled/healthRecalculate.ts`): configs de todas las orgs en
  una consulta; por org, RPC + snapshots de la ventana + `customers.health_score` **en paralelo**
  (1 ida y vuelta en vez de 3); snapshots en lotes de 200 solo si procede; `customers.health_score`
  por **una sentencia por valor distinto** (`applyHealthScores`, `id IN (...)` + `organization_id`)
  y solo si cambió; orden «menos recientemente procesada» (`orderOrgsByLeastRecentlyProcessed`,
  último snapshot por org en 7 días, sin snapshot primero); presupuesto propio (`budgetMs`, reloj
  inyectable) además del `AbortSignal`; al abortar, **`pending_org_ids`** con lo que quedó.
  `runScheduledKinds` pasa `taskBudgetMs` propio a las tareas F11. Con el doble a 70 ms por
  llamada: 219 clientes / 3 cambios → 2 inserts + 1 update (≤ 8 llamadas), no 219.
- **Regla 5** en las tres rutas de escritura de onboarding (`POST /instances`,
  `PATCH /instances/[id]`, `PATCH /instances/[id]/steps/[stepId]`) y en las dos nuevas de salud,
  con el helper compartido `foreignOrganizationInBody` de `src/lib/security/organizationBody.ts`:
  body con otra organización → 403 «Organización no permitida» + `console.warn` con
  `{ session, body }`, sin escrituras. La misma organización en el body no es ataque.
- **Foco accesible** (`OnboardingChecklist.tsx` + `checklistStepControl` en
  `onboardingProgress.ts`): la casilla que se guarda **no se desmonta ni recibe `disabled`** del
  DOM (perdería el foco); lleva `aria-busy`/`aria-disabled` y handler inerte; las demás sí se
  deshabilitan mientras hay una en vuelo. Tras «Completar onboarding» el botón desaparece y el
  foco va al mensaje `role="status"` (`tabIndex=-1`); si falló, se queda en el botón
  (`focusTargetAfterComplete`).
- **23505 = `already_existed`** (`isUniqueViolation` en `onboardingService.ts`, y en
  `renewalService.ts` línea ~284): sobre `uq_opportunities_one_renewal_per_parent`,
  `uq_opportunities_one_onboarding_child_per_parent` y `uq_onboarding_instances_org_opportunity`
  la llamada perdedora relee la fila ganadora y responde `already_existed: true` sin crear tareas
  ni pasos; cualquier otro código de error sigue lanzando. El doble de pruebas
  (`f11FakeSupabase.ts`) simula los tres índices reales y registra los inserts rechazados.
- **Meses en la zona de la organización** (`renewalMilestones.computeExpiryDate`):
  `toPlainDate(closedAt, tz)` → suma de meses sin desbordar → `plainDateToInstant` con la misma
  hora local (conserva s/ms). 31 ene 04:30Z (30 ene 23:30 Bogotá) + 1 mes = 28 feb 23:30 Bogotá;
  Nueva York con cambio de horario mantiene la hora local.
- **Etiquetas honestas y moneda**: `honestIndicatorLabel` etiqueta `frequency`/`ltv`/`recency`/
  `avg_ticket` por lo que la RPC mide de verdad («Facturas (12 m)», «Ingresos (12 m)», «Días desde
  la última factura», «Ticket promedio (12 m)»); claves desconocidas conservan la etiqueta de la
  config. La hija de onboarding toma la **moneda del padre**, si no la **base de la organización**
  (`organization_currencies.is_base`), y si no hay ninguna **no cablea `'COP'`** (deja el default
  de la tabla y avisa).
- **Completar no miente**: si mover la oportunidad a la etapa `is_won` falla, la instancia vuelve
  a `active`/`completed_at=null` y se lanza el error.
- **Guardarraíles**: `onboardingService.ts` ya no importa `@/lib/supabase/config` (sale de la
  allow-list); las rutas usan el cliente de sesión de `getServerOrgContext()`.
- **BD (segundo constructor, SIN aplicar)**:
  `supabase/migrations/20260915210000_f11_eliminar_mv_customer_health.sql` +
  `supabase/rollbacks/20260915210000_f11_eliminar_mv_customer_health_rollback.sql`.
  Elimina `refresh_mv_customer_health()` (SECURITY DEFINER con EXECUTE para `anon`) y la MV
  (arrastra `idx_mvh_customer` y `mv_customer_health_customer_id_idx`). Verificado por MCP:
  0 dependientes en `pg_depend`, 0 `cron.job`, 0 lectores en código. El rollback recrea la vista
  con la definición literal de producción, `WITH NO DATA` + `REFRESH`, y privilegios solo para
  `service_role`.

## Feedback de la ronda anterior que se atendió

| # | Punto del tester r1 | Cómo se resolvió |
|---|---|---|
| 1 | [alto] Tres scores por cliente; «Medir ahora» leía `mv_customer_health` | Config sobre RPC en lista/detalle/cron/Recalcular/Medir ahora (`scoreOf`); dos rutas nuevas con sesión; fachada de navegador por `fetch`; 0 lectores de la MV; migración de eliminación **pendiente de aplicar** por el orquestador |
| 2 | [alto] Cron ≈ 23 s frente a 10 s, sin rotación | Lecturas en paralelo, snapshots por lotes, updates agrupados por valor, orden por antigüedad, presupuesto propio, `pending_org_ids` |
| 3 | [medio] Regla 5 en 3 rutas de onboarding | `foreignOrganizationInBody` → 403 + warn, sin escrituras (también en las 2 rutas nuevas de salud) |
| 4 | [medio] Foco al `body` al marcar un paso y tras completar | Casilla montada y sin `disabled` mientras guarda (`aria-busy`); tras completar, foco al `role="status"`; si falla, al botón |
| 5 | [medio] Concurrencia duplica renovación/instancia | `isUniqueViolation` → releer y `already_existed`; doble con los 3 índices reales |
| 6 | [medio] Suma de meses en UTC | `toPlainDate` + suma calendario + `plainDateToInstant` en la zona de la organización |
| 7 | [medio] «compras 90d» decía `invoices_12m`; hija con `'COP'` | `honestIndicatorLabel`; moneda del padre → base de la org → sin cablear |

## Decisiones de diseño relevantes

- El score de salud tiene **un solo punto de cálculo** (`scoreOf`) y **un solo punto de
  persistencia** (`applyHealthScores` + `shouldWriteSnapshot`); las rutas y el cron son
  envoltorios. Nada del navegador toca Supabase para salud.
- `pending_org_ids` sale en el resultado del cron y en el log (`health_recalculate_aborted`), y la
  rotación se deriva del **último snapshot por organización** en vez de guardar estado nuevo en BD:
  sin migración, y una org que nunca se procesó va siempre primero.
- El 23505 se trata **solo** para los índices de la migración `20260915150000`; otros códigos
  siguen fallando alto para no ocultar errores reales.
- La MV **no se elimina desde el código**: la migración queda escrita y sin aplicar para que el
  orquestador la ejecute cuando confirme el despliegue de los lectores nuevos.

## Pendientes que dejo explícitamente para revisión

- **Aplicar `20260915210000_f11_eliminar_mv_customer_health.sql`** (orquestador, por MCP) una vez
  desplegado el código sin lectores. Hasta entonces `authenticated` sigue pudiendo leer la MV.
- **Verificación (segundo constructor, con el harness del primero aún cíclico)**:
  - `npx jest src/lib/services/crm/__tests__/f11 src/app/api/crm/health src/app/api/crm/onboarding`
    → **10 suites, 166/166 verdes** (17:43, ventana sin mutante vivo).
  - Una pasada anterior (17:26) con `guardrails` incluido dio 224/232: 7 rojos eran exactamente
    los tests que matan los mutantes vivos en ese instante (`f11RenewalMilestones` ×3,
    `f11Round2` §6 ×2, `f11Round1Tester` ×2) y el octavo es **ajeno a F11**
    (`guardrails` › «el inicio espera sucursal y permisos…», por un cambio en
    `src/app/app/inicio/page.tsx` de otra fase; `onboardingService.ts` ya no está en la
    allow-list y esa comprobación pasa).
  - `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json | grep -E
    "health|onboarding|renewal|postventa"` → **0 líneas**.
  - El tester debe repetir la suite con el harness parado; el informe de mutaciones lo entrega el
    primer constructor.
- No se tocaron archivos compartidos (kit de UI, `orgContext`). `foreignOrganizationInBody` ya
  existía en `src/lib/security/organizationBody.ts` (F13).
