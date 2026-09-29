# HANDOFF — 2026-09-29 (sesión «CRM módulo completo con llamadas, correos y WhatsApp»)

Documento de relevo para la sesión **«Desarrollo»**. Léelo entero antes de tocar nada.
Complementa —no reemplaza— `CLAUDE.md`, `docs/HANDOFF-2026-09-29.md` (sesión «Figma e interfaz»,
con las reglas de trabajo en el árbol compartido) y `docs/hallazgos/README.md`.

Esta sesión llevó cuatro frentes: la misión de **zonas horarias** (fases A, B y D), el **CRM** (ronda de
oportunidades, captación web, aprovisionamiento de embudos), **seguridad multi-tenant** (rutas de
módulos) y el **agente de voz** (disparo de campañas, servidor en Railway).

---

## 0. LO PRIMERO: hay trabajo de esta sesión SIN COMMIT

«Desarrollo» corre en la nube y trabaja sobre `origin/main`. **Nada de esta sección está en
`origin/main`**: vive solo en el árbol local del dueño. Hasta que el dueño autorice commit y push,
no lo verás y no puedes continuarlo. No lo reconstruyas a partir de esta descripción: pide que se suba.

Son cinco bloques, todos verificados antes del corte (ver cada ficha):

| Bloque | Archivos | Estado | Ficha |
|---|---|---|---|
| **A. F-76 corregido** — rutas de módulos | `src/lib/security/modulosObjetivo.ts` (nuevo), `src/app/api/modules/route.ts`, `src/app/api/modules/pages/route.ts`, `src/app/api/modules/__tests__/{modulosTenant,guardarrailServiceRoleModulos}.test.ts`, `src/__tests__/guardrails.test.ts`, `docs/hallazgos/F-76.md`, `docs/hallazgos/README.md` | 195/195 tests, `tsc` 0, 9/9 mutaciones | F-76 |
| **B. F-78 servidor de voz** | `ws-server/` (nuevo), `ws-server.Dockerfile`, `scripts/ws-server-cierre-dependencias.mjs`, `src/__tests__/infra/` | 0 críticos/altos, arranque real verificado en copia del contenedor | F-78 |
| **C. Banca online** — exportación y conciliación falsa | `src/components/finanzas/cuentas-por-pagar/{CuentasPorPagarService.ts,ExportarBancaModal.tsx,formatosBanca.ts}`, `supabase/migrations/20260924170000_bank_files_rastro_de_exportacion_a_banca.sql` + rollback | ⚠️ **la migración YA ESTÁ APLICADA en la base** sin su `.sql` commiteado | F-69 |
| **D. Columnas inexistentes** — vehículos, tracking, saldos | `src/components/transporte/vehiculos/*` (6 archivos), `src/app/app/transporte/{horarios,vehiculos}/page.tsx`, `src/lib/services/{transportService,trackingService}.ts`, `src/lib/services/integrations/openFinance/balanceService.ts`, `src/__tests__/services/columnasFantasma.test.ts`, `src/__tests__/timezone/openFinanceYMonedas.test.ts` | tests verdes y `tsc` 0 al cierre | — |
| **E. F-65 comisión OTA** | `supabase/migrations/20260924180000_comision_ota_llamada_con_parametros_con_nombre.sql` + rollback, `src/__tests__/db/comisionOtaAsientoContable.test.ts`, `src/__tests__/timezone/guardarrail16Descargas.test.ts` | ⚠️ migración **aplicada**; la función viva la reescribió después la sesión «Finanzas» (ADR-CC-013) | F-65 |

**Los bloques C y E incumplen la regla dura 1** (cada migración con su `.sql` en el mismo commit):
están en la base de producción y no en el repositorio. Si alguien reconstruye el esquema desde el
repositorio, `bank_files` no existirá. Es lo primero que hay que cerrar en cuanto se autorice el commit.
Para E: el `.sql` del repositorio no es la versión vigente; manda la función viva (ADR-CC-013). Comprueba
con `pg_get_functiondef` antes de tocarla y no la reconstruyas desde ese archivo.

Para commitear en el árbol compartido, usa el método de índice privado de
`docs/HANDOFF-2026-09-29.md` §1: hay cientos de archivos de otras sesiones sin commit y el índice
compartido suele traer archivos ajenos ya preparados.

---

## 1. Riesgos abiertos en producción

### 1.1 F-76 — cualquier usuario puede apagar módulos de otra empresa (CRÍTICO)

- **`origin/master` (producción)** tiene la ruta original: `/api/modules` y `/api/modules/pages` toman
  la organización del body o del query y consultan con `service_role` sin comprobar pertenencia ni
  permiso. **Abierto en producción ahora mismo.**
- **`origin/main`** tiene el **primer** arreglo (`6e5596bd`, 24-sep), que **rompe los módulos** al
  operar como administrador de plataforma: quitó `service_role` del todo, el plan se lee con la sesión,
  `get_current_plan` empieza por `fn_assert_acceso_org` y rechaza a quien no es miembro → el plan llega
  `null` y solo quedan los 4 módulos del núcleo. El dueño lo sufrió el 28-sep.
- **El arreglo correcto es el bloque A de la sección 0, sin commitear.**
- ⚠️ **Si se fusiona `main` en `master` antes de subir el bloque A**, producción pasa de «agujero
  abierto» a «agujero cerrado pero módulos rotos para el super admin». Avísale al dueño antes de
  cualquier PR `main → master`.

Diseño del arreglo correcto (detalle en F-76 §«Corrección aplicada»): un resolutor único,
`resolverObjetivoModulos`, con dos caminos explícitos — **miembro** (organización de la sesión; otra en
body/query → 403 `FOREIGN_ORGANIZATION` registrado; escribir exige `requireOrgAdminOrPermission`) y
**plataforma** (`fn_is_platform_admin()`; organización nombrada, única y existente; acceso registrado).
`service_role` solo al final, con la organización validada. Registrado como **puerta** en el
guardarraíl 31.

Verificado el 28-sep contra el repositorio local de `go-admin-super`: el panel **no** llama a estas
rutas (su única escritura de módulos es `activate-subscription`, con su propio cliente), así que el
arreglo no lo rompe.

### 1.2 F-78 — el servidor de voz lleva caído desde el 18 de marzo

Railway bloquea la imagen («3 known security advisories») porque el Dockerfile instalaba las
dependencias de toda la web (2 críticos y 18 altos). El bloque B lo resuelve con dependencias propias
(60 MB, 0 críticos, 0 altos). **Railway construye desde `master`**: no se levantará hasta el paso
`main → master`, que es decisión del dueño. Sin este servidor el agente marca pero no puede conversar.

La variable de Railway `TWILIO_MASTER_ACCOUNT_SID` tenía un tabulador al final del nombre; **el dueño
la corrigió el 28-sep** (verificado: 15 variables, nombre limpio). No bloqueaba el servidor de voz,
que no la lee.

---

## 2. Hecho y en `origin/main`

| Commit | Qué | Ficha / doc |
|---|---|---|
| `e1b68aee` | Crear turnos volvía a fallar: el trigger buscaba la organización en una columna inexistente de `employments` | F-63 |
| `d8a46e07` | `fn_emitir_acciones` usa el día de la organización; inventario de `CURRENT_DATE` contra la base viva en CI | ADR-005 |
| `3e0344cd` | Las 7 funciones del catálogo de tasas pasan a `fn_today_system()`: **lista blanca vacía**, 0 funciones con `CURRENT_DATE` | ADR-004 reescrito |
| `307e92cc` | Comisión de oportunidad ganada ya no cae en «la sucursal 1»; `web_capture_lead` exige embudo de ventas | F-64, F-66 |
| `b6277d04` | Editar una oportunidad borraba sus líneas (`total_price` es `GENERATED ALWAYS`); fechas, ganada/perdida, KPI ×100, permisos por nombre de rol, selector de clientes | — |
| `197b6594`, `2081d932`, `784d5e74` | Fase B de zonas horarias: tandas 6 a 10 (PMS, parking, transporte, tesorería, monedas) | `docs/PROGRESO-zonas-horarias.md` |
| `3e5dc46e` | El guardarraíl de ESLint de fechas **nunca había funcionado** (orden de los `overrides`); encendido y 16 violaciones cerradas | — |
| `0dd63b9e` | Organización nueva nace con embudo de ventas (disparadores en la base); semántica única de páginas de módulo | F-74, F-77 |
| `b68f5cfd` | Agente de voz: interruptor que no existía, cola enganchada al cron `*/5`, diagnóstico de por qué no marca | — |
| `6e5596bd` | **Primer** arreglo de F-76 — **superado por el bloque A**, ver §1.1 | F-76 |

---

## 3. Pendientes y decisiones del dueño

1. **Autorizar commit y push de la sección 0.** Sin eso nada de lo de arriba avanza.
2. **PR `main → master`**: solo con orden explícita del dueño (memoria «master no se toca sin orden
   explícita»). Recomendado cuanto antes por F-76, pero **después** de subir el bloque A.
3. **Secrets de GitHub** `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`: el workflow
   `.github/workflows/inventario-postgres.yml` (inventario diario de `CURRENT_DATE` contra la base viva)
   se salta con aviso mientras falten.
4. **Rol del administrador de plataforma**: ni `fn_is_platform_admin()` ni `getAuthenticatedAdmin` del
   panel miran el rol; `/api/super-admin-access` sí exige `super_admin`. Hoy hay un solo administrador
   de plataforma y es `super_admin`, así que no hay diferencia real. Decidir antes de dar de alta otro rol.
5. **Siembra retroactiva del embudo de ventas** en 43 organizaciones con CRM activo: SQL escrito en
   F-74, sin ejecutar.
6. **Reparaciones de datos históricos, sin ejecutar**: 18 filas de `commissions` con sucursal de otra
   organización (F-64); 23 leads web de la org 145 en el embudo de onboarding (F-66, procedimiento de
   tres pasos; esa organización tiene el CRM **apagado**).
7. **Permisos de etapa por catálogo**: crear `crm.stages.manage` y `crm.stages.override_gate` (SQL
   propuesto en la ronda de oportunidades, sin aplicar).
8. **RPC transaccional `crm_replace_opportunity_lines`** para que editar líneas sea atómico (hoy hay
   foto y restauración compensatoria desde el navegador).

---

## 4. Abiertos y documentados

- **F-75** — `web_capture_lead` no mira si el módulo CRM está activo. La org 137 acumula contactos web
  solo en `customers.notes`, con cero leads. Tres salidas propuestas en la ficha.
- **Punto 5 de F-76 no hecho a propósito**: mover los embudos de onboarding y renovación a la base
  crearía una tercera copia de las plantillas (`pipelineTemplates.ts` lo usa también `PipelineHeader`, y
  `fn_crm_seed_pipeline_ventas` ya copió a mano la de ventas). Lo correcto es una fuente única de
  plantillas.
- **Fase C de zonas horarias y tandas 11 a 13**: 170 avisos del guardarraíl de fechas, trabajo conocido.
- **Tablero consolidado de PMS**: sobre husos distintos no hay un único «hoy»; decisión de diseño.
- `get_account_receivable_detail` no devuelve `branch_id` (deuda de zona horaria en cartera por cobrar).
- La conciliación de banca online es un simulacro retirado (bloque C); construirla de verdad está
  descrito en F-69, incluida la trampa de los disparadores de `payments`.

---

## 5. Cómo probar la llamada del agente de voz (lo que el dueño quiere probar)

El 28-sep el dueño movió una oportunidad y no llamó. Causa verificada en `crm_events` /
`outbound_jobs`: el listener respondió `sin_agente_en_la_etapa` — la org 125 tiene **cero filas en
`stage_agents`**. Todo lo demás está listo en esa organización (agente de voz activo, interruptor
encendido, minutos).

1. En el embudo, la etapa donde debe llamar → pestaña **«Agente IA»** → elegir el agente → cambiar el
   disparador a **«Al entrar en la etapa»** (viene en «manual» por defecto: guardar sin cambiarlo deja el
   agente asignado pero sin llamar nunca) → «Guardar agente de la etapa».
2. **Esperar a que Railway esté arriba** (§1.2): sin el servidor de voz el teléfono suena y el agente no
   habla.
3. Mover una oportunidad **abierta**, cuyo cliente tenga teléfono con indicativo, **hacia** esa etapa.
   Solo marca de 08:00 a 20:00 en la zona del cliente, nunca en domingo.

---

## 6. Lecciones de esta sesión (para no repetirlas)

- **Un test puede blindar un defecto.** El test «ningún cliente `service_role` llega al servicio» fijaba
  exactamente la regresión de F-76. Al arreglar seguridad, añade también el caso del usuario legítimo que
  debe seguir funcionando (aquí: un administrador de plataforma ve los módulos de su plan).
- **«Quitar `service_role`» no es sinónimo de seguridad.** La regla es `service_role` solo **después** de
  validar la organización.
- **Verifica contra el esquema y la base viva**, no contra el código: tres funcionalidades estaban
  muertas por columnas que nunca existieron (`tech_review_expiry` y `plate_number` en `vehicles`,
  `bank_files`), y el guardarraíl de ESLint llevaba meses sin disparar.
- **Los agentes largos se cortan** (token expirado, límite de sesión): cuando pasa, revisa qué quedó
  aplicado en la base y qué quedó a medias en el árbol antes de relanzar.
- **Nada de cadenas en línea para escribir archivos**: bytes de control entraron por comillas dobles de
  PowerShell y por `python -c`. Scripts en archivo con UTF-8 explícito.
