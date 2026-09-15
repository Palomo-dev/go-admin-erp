# F12 — Referidos y partners — constructor, ronda 1

Fecha: 2026-09-15. Proyecto Supabase `jgmgphmzusbluqhuqihj` (solo lectura por MCP).

Contexto de la ronda: el constructor anterior fue interrumpido por un apagado del
equipo con el árbol sin commit. Esta ronda **inspeccionó y completó**, no rehízo.

## Qué se hizo en esta ronda

- Inventario completo del árbol de F12 contra `FASE-12-REFERIDOS-PARTNERS.md`
  (tabla al final). El grueso del trabajo ya estaba hecho y sin commit:
  6 módulos puros, 2 servicios, 3 módulos de soporte (`f12Errors`,
  `f12Validation`, `f12RouteSupport`), 15 route handlers, 2 páginas,
  22 componentes, 6 suites de unidad y 2 de contrato (120 + 60 casos).
- Reparación de `src/lib/services/crm/referralsService.ts`: el apagado dejó
  tres líneas huérfanas **encima** del primer `import` (la verificación del
  referidor y el rollback de la conversión), lo que rompía la carga del módulo
  (`await` fuera de función) y con ella la suite `referrals.contract.test.ts`.
  Quedaron en su sitio: `assertCustomerInOrg` al inicio de `createReferral`, y
  el rollback (borrar la oportunidad + `rollbackCustomer`) en `convertReferral`
  cuando el enlace del referido pierde la carrera. Se añadió el registro del
  fallo del borrado de la oportunidad (mejor esfuerzo, sin ocultarlo).
- Verificación por MCP (solo lectura) de columnas, CHECK, FK, UNIQUE y RLS de
  `partners`, `partner_tiers`, `partner_deals`, `referrals`, `referral_programs`,
  más `opportunities_deal_type_check`, `tasks_status_check` y los conteos
  (0 / 159 / 0 / 0 / 53). Todo coincide con lo que asume el código; **no hace
  falta esquema nuevo** → no hay migración en esta ronda.
- Navegación: `src/config/crmNav.ts` gana `referidos` (icono `Gift`) y
  `partners` (icono `Handshake`), `enabled: true`, `phase: 'F12'`. El contrato
  de nav de objeciones (`sourceContract.test.ts`) sigue verde.
- Confirmado que `getReferralRequests` consulta exactamente lo que F10 crea al
  ganar (`wonCloseSteps.ts:193` → `tasks.type='referido'`, `status='open'`).

## Feedback de la ronda anterior que se atendió

Primera ronda: no hay feedback previo de tester ni de qa-reviewer.

## Decisiones de diseño relevantes

- **Reutilización del alta de leads (regla dura 7).** La conversión de un
  referido usa `leadCreateService.createLeadWithCustomer`, extraído de
  `POST /api/crm/leads` sin cambiar su contrato; la ruta de leads ahora lo
  llama. `deal_type` se añadió como campo opcional validado contra el CHECK.
- **Máquinas de estado puras** (`referralStateMachine`, `partnerCommission`)
  con guarda optimista `.eq('status', from)` en la escritura: dos peticiones
  concurrentes no aplican la misma transición dos veces (409 `CONCURRENT_CHANGE`).
- **`converted` exige enlace** (oportunidad o cliente). Por `/status` no se
  puede llegar a `converted` sin enlace; el camino real es `/convert`.
- **Nada de dinero real.** `reward_paid`/`reward_paid_at` y
  `commission_status`/`commission_paid_at` son registros. La comisión la
  calcula el servidor (monto de la oportunidad × tasa efectiva); del body se
  ignora cualquier `commission_amount`.
- **Tasa efectiva**: la propia del partner si > 0; si es 0 («hereda»), la del
  tier; sin tier, 0. **Promoción de tier**: al registrar un deal, sube al tier
  más alto cuyos dos umbrales cumple con los deals no rechazados; nunca degrada.
- **Permisos en servidor por id de rol** (`STAGE_MANAGER_ROLE_IDS`, misma
  lista que F2/F13) para aprobar/pagar/rechazar comisiones y borrar partners;
  `can_manage` viaja al cliente solo para ocultar botones, no como barrera.
- **Organización ajena** en body o query → 403 + `console.warn`, con el helper
  único `foreignOrganizationInBody` (`src/lib/security/organizationBody.ts`).
- **Moneda nunca cableada**: `GET /referrals/programs` devuelve `currency` de
  `getOrgBaseCurrency` (helper de F13) o `null`; la interfaz lo dice. En
  partners, si los deals mezclan monedas, no se suma (`currency_mixed`).
- **Sin FK `partners.tier_id`** y **sin UNIQUE `(organization_id, email)`** en
  `partners`: se verifican a mano (404 / 409). Queda una ventana de carrera en
  el correo; la propuesta de índice se anota como pendiente, sin migración.
- `partner_deals` y `referrals` no tienen DELETE en RLS: un deal se rechaza y
  un referido se rechaza, no se borran. Sin ruta DELETE para ninguno.
- Fechas: la interfaz usa `useFormatDate()`; `reward_paid_at` y
  `commission_paid_at` se escriben con `toISOString()` (instante, no día).

## Pendientes que dejo explícitamente para revisión

1. `referrals_referrer_customer_id_fkey` es `ON DELETE SET NULL` sobre una
   columna NOT NULL: borrar un cliente que refirió fallará por FK. No es de
   esta fase; anotar para una migración futura (`ON DELETE RESTRICT` explícito
   o permitir NULL).
2. Propuesta de índice UNIQUE `(organization_id, lower(email))` en `partners`
   para cerrar la carrera de `assertEmailFree`. No se escribió migración: el
   alcance de la ronda no exige esquema nuevo y la tabla está en 0 filas.
3. `src/__tests__/guardrails.test.ts` falla en «el inicio espera sucursal y
   permisos…» por `src/app/app/inicio/page.tsx`, modificado por otro agente
   durante esta ronda (17:22). Ajeno a F12; no se tocó.
4. Los hooks `useCustomerSearch` y `useOpportunitySearch` (búsqueda de
   cliente/oportunidad en los diálogos) leen con el cliente de navegador bajo
   RLS. Solo lectura; toda escritura pasa por las rutas.

## Verificación

- `npx jest src/lib/services/crm/__tests__/partner* …referral* src/app/api/crm/partners src/app/api/crm/referrals`
  → 8 suites, 180 tests, verde (tras la reparación de `referralsService.ts`).
- `npx jest src/__tests__/guardrails.test.ts` → 1 fallo ajeno (ver pendiente 3).
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`
  → terminó sin OOM con 6 errores en total, **0 en F12** (los 6 son ajenos:
  `FormularioEdicionProducto.tsx`, `f10Round2Tester.test.ts`,
  `f13Round3Tester.test.ts`, `deliveryIntegrationService.ts`).

## Requisito → estado

| Requisito (FASE-12 / lanzamiento Oleada C) | Estado | Dónde |
|---|---|---|
| Tablas con RLS (5) | hecho (preexistente, verificado por MCP) | BD |
| `referralsService`: CRUD programas + referidos + estado + recompensa | hecho | `src/lib/services/crm/referralsService.ts` |
| `partnerService`: CRUD partners, tiers, deals, comisiones | hecho | `src/lib/services/crm/partnerService.ts` |
| Máquina de estado pura de referidos | hecho + tests | `referralStateMachine.ts` |
| Máquina de estado pura de comisiones | hecho + tests | `partnerCommission.ts` |
| Recompensa como registro (nada de dinero) | hecho + tests | `referralReward.ts`, `/[id]/reward` |
| Comisión como registro, calculada en servidor | hecho + tests | `partnerCommission.ts`, `/[id]/deals` |
| Promoción de tier (nunca degrada) | hecho + tests | `partnerTierFor.ts` |
| Conversión referido → lead con el mismo alta que `/api/crm/leads` | hecho + tests | `leadCreateService.ts`, `/[id]/convert` |
| Rollback si el enlace del referido no cuaja | hecho (recolocado en esta ronda) | `convertReferral` |
| Consumo de tareas `referido` de F10 | hecho + test | `/api/crm/referrals/requests`, `ReferralRequestsSection` |
| Helper único de organización ajena → 403 | hecho + tests en todas las rutas de escritura | `f12RouteSupport.rejectForeignOrganization` |
| Permisos por id de rol en comisiones y borrado | hecho + tests | `requirePartnerManager` |
| `/api/crm/referrals` + `[id]` + `[id]/status` + `[id]/reward` + `[id]/convert` + `programs` + `programs/[id]` + `requests` | hecho | `src/app/api/crm/referrals/**` |
| `/api/crm/partners` + `[id]` + `[id]/deals` + `[id]/deals/[dealId]` + `tiers` + `tiers/[id]` | hecho | `src/app/api/crm/partners/**` |
| Página `/app/crm/referidos` | hecho | `src/app/app/crm/referidos/page.tsx` → `ReferidosPage` |
| Página `/app/crm/partners` | hecho | `src/app/app/crm/partners/page.tsx` → `PartnersPage` |
| `ReferralProgramEditor` (§4.2) | hecho como `ReferralProgramsSheet` + `ReferralProgramForm` | `src/components/crm/referidos/` |
| `ReferralList` (§4.2) | hecho como `ReferidosPage` + `ReferralCard` + `ReferralToolbar` | `src/components/crm/referidos/` |
| `PartnerList`, `PartnerEditor`, `PartnerDealList`, `TierEditor` (§4.2) | hecho | `src/components/crm/partners/` |
| `ReferralsProgramCard` de configuración reutiliza F12 | hecho (sin escritura directa a Supabase) | `configuracion/panels/crm/sections/ReferralsProgramCard.tsx` |
| Navegación en el nav del CRM | hecho en esta ronda | `src/config/crmNav.ts` |
| Tests de unidad (6 módulos puros) | hecho, 120 casos verdes | `src/lib/services/crm/__tests__/{partner,referral}*.test.ts` |
| Tests de contrato con organización doblada | hecho, 60 casos verdes | `src/app/api/crm/{partners,referrals}/__tests__/` |
| Seeds de `partner_tiers` / `referral_programs` | hecho (preexistente: 159 / 53) | BD |
| `partner_id`/`referral_id` en `opportunities` | no aplica: se usan `source='referral'` y `deal_type` | decisión de la Oleada C |
| Migración nueva | no necesaria | — |
| `npm run lint` limpio en archivos tocados | parcial: no se ejecutó lint global (estado conocido rojo); los archivos de F12 no usan `any` | — |
