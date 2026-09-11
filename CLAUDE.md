# Go Admin ERP — instrucciones para Claude Code

ERP multi-tenant y multi-sucursal. Next.js 15 (App Router) + TypeScript estricto
+ Tailwind + shadcn/ui + Supabase (Postgres 15). Español de Colombia en código,
comentarios, commits y UI.

## Reglas duras

1. **La base de datos se toca SOLO por el MCP de Supabase** (`apply_migration`,
   `execute_sql`, `list_tables`, `get_advisors`). Proyecto: `jgmgphmzusbluqhuqihj`.
   Cada migración deja además su `.sql` en `supabase/migrations/` y su reversión
   en `supabase/rollbacks/`, en el mismo commit: ver `docs/POLITICA-MIGRACIONES.md`.
   Nunca credenciales dentro de un `.sql` — el repositorio es público. Los `.sql`
   de prueba que generes, bórralos.
2. **El repositorio es público: nunca escribas el nombre de una organización
   cliente.** Ni en comentarios, ni en `comment on`, ni en docs, ni en fixtures
   de tests. Usa el id (`org 120`) o una descripción (`una tienda de calzado`).
   La evidencia —porcentajes, conteos, importes— se conserva; la identidad no.
   Aplica igual a los comentarios de esquema: viajan al repositorio en cada
   migración y en los tipos generados.
3. **Verifica tablas y columnas con el MCP ANTES de escribir cualquier query.**
   No asumas que una tabla existe porque el código actual la usa: `inventory`,
   `orders` y `order_items` aparecían en el código y nunca existieron.
4. **`git push` y abrir PRs requieren autorización explícita** en la conversación.
   `git commit` local, solo si se pide.
5. **La organización sale de la sesión, nunca del body.** Todo route handler
   empieza por `getServerOrgContext()` (o `withOrg`). Si el body trae una
   organización distinta: 403 y se registra.
6. **Los permisos se resuelven en el servidor.** Nunca a partir del nombre de un
   rol, y nunca con un valor que venga del cliente.
7. **Nada de lógica de negocio duplicada.** Si `posService` sabe crear una venta
   con impuestos y caja, se llama a `posService`. Una segunda implementación
   diverge en semanas.

## Convenciones

- Commits: `feat(GO-<id>): <desc>` · PR: `GO-<id> – <título>` · revisores
  @santycano y @Palomo-dev.
- Servicios en `src/lib/services/`, uno por dominio. Los que tocan varias tablas
  lo hacen en una RPC transaccional, no en N llamadas desde Node.
- Clientes Supabase:
  - `@/lib/supabase/config` → **solo navegador**.
  - `getServerUserClient()` → sesión del usuario, con RLS. El default en servidor.
  - `getServiceClient()` → service role. Solo donde esté justificado y con la
    organización ya validada.
- Multi-tenant: toda tabla de negocio lleva `organization_id` y RLS por
  pertenencia. Muchas llevan además `branch_id`.
- Migraciones: aditivas. Columnas nuevas `NULL`-ables o con `DEFAULT`. Sin `DROP`
  ni cambios de tipo en tablas con datos de clientes.

## Fechas y zona horaria — reglas canónicas

El bug "la fecha se muestra un día corrido" fue sistémico. Para evitar
reincidir, ver `docs/reglas-fechas-timezone.md` (resumen aquí):

1. **`toISOString().split('T')[0]` está prohibido** para derivar un día
   calendario. Usar `todayInTz(tz)` o `toPlainDate(date, tz)` de
   `src/lib/utils/dateDisplay.ts`.
2. **`.split('T')[0]` sobre un valor de la BD está prohibido** — descarta
   el offset del timestamptz y se queda con el día UTC.
3. **Todo renderizado de fecha pasa por el timezone de la organización.**
   Usar `useFormatDate()` (hook de `@/lib/context/OrganizationTimezoneContext`)
   en componentes cliente, o `formatDateInTz(value, tz)` en servidor.
4. **`formatDate` y `parseLocalDate` de `@/utils/Utils` están deprecated.**
   ESLint avisa al importarlas. Usar las de `dateDisplay.ts`.
5. **Distinción crítica:** valor de `timestamptz` → `formatDateInTz`
   (convierte); valor de `date` → `formatPlainDate` (no convierte).
6. **La zona horaria nunca se hardcodea.** Sale de
   `getOrganizationTimezone(orgId)`. `America/Bogota` solo como fallback.
7. **Tests con `TZ=UTC` y `TZ=America/Bogota`:** `npm run test:tz-all`.

## Verificación antes de cerrar cualquier tarea

```bash
npx jest
npx tsc --noEmit -p tsconfig.json
npx next build
```

Estado conocido a 2026-09-09, **no lo cuentes como regresión tuya**:
- `npm run lint` NO está verde: miles de `@typescript-eslint/no-explicit-any`
  preexistentes. Deja limpios los archivos que toques.
- `tsc` reporta ~190 errores preexistentes en archivos no relacionados.
- `src/lib/services/website/__tests__/sectionContract.test.ts` falla en 2 tests
  (plan del editor web, fase F2.6 pendiente).

`src/__tests__/guardrails.test.ts` es el archivo que impide reincidir en bugs ya
corregidos. Si tu cambio lo rompe, el problema casi siempre es tu cambio. Si de
verdad hay que ampliar una allow-list, documenta por qué en el propio test.

## Mapa de módulos

19 módulos sobre 7 verticales. Qué ve cada organización depende de su plan
(`organization_modules` + `moduleManagementService.ts`). **Nunca cablees una
lista de módulos ni de rutas**: consúltala.

Núcleo: inventario (`products`, `product_prices`, `product_costs`,
`stock_levels`, `categories`, `suppliers`), POS y ventas (`sales`, `sale_items`,
`invoice_sales`), compras (`purchase_orders`, `invoice_purchase`), finanzas
(`payments`, `cash_movements`, `accounts_receivable/payable`,
`chart_of_accounts`), CRM (`customers`, oportunidades, llamadas), HRM, PMS,
sitios web.

Trampas de esquema verificadas (hay más: comprueba siempre):
- `products` NO tiene `price`, `cost` ni `is_active`. Precios en
  `product_prices` y costos en `product_costs`, ambos con vigencia
  (`effective_from`/`effective_to`). El estado es `products.status`.
- `categories.slug` es NOT NULL sin default, único por organización.
- `suppliers` tiene `contact`, no `contact_name`.
- `customers.full_name`, `.doc_type` y `.doc_number` son `GENERATED ALWAYS`:
  se escriben `first_name`/`last_name` e `identification_*`.
- `stock_levels.branch_id` es NOT NULL, y su UNIQUE incluye `lot_id`, que admite
  NULL: un `upsert` con `onConflict` **no** deduplica ahí.

## IA: dos productos distintos que comparten núcleo

- **GO Assistant** (asistente del header, para las organizaciones clientes):
  `src/app/api/ai-assistant/**`, `src/lib/ai/assistant/**`, panel en
  `src/components/app-layout/Header/`.
  Plan: `docs/PROMPT-CLAUDE-CODE-ASISTENTE-AGENTE.md`. Decisiones:
  `docs/ia-chat/ADR-002-go-assistant-fase0.md`.
- **Chat de atención al cliente final** (WhatsApp/Instagram/Facebook/widget):
  Edge Function `ai-auto-response`. Decisiones:
  `docs/ia-chat/ADR-001-fase0-correcciones-criticas.md`.

No los mezcles. Comparten cobro de créditos y resolución de organización; no
comparten catálogo de acciones, prompt ni política de confirmación.

Créditos: punto único de cobro en `chargeAiCredits` / `refundAiCredits`
(`src/lib/services/crm/aiCostService.ts`), atómico vía `decrement_ai_credits`.
Se comprueba saldo **antes** de llamar al proveedor y se cobra **después** de que
la respuesta llegue: nunca se cobra una generación fallida.

Modelos: nunca cableados. `ai_settings` de la organización → variable de entorno
→ default. Ver `.env.example`.

## Skills

En `.agents/skills/` y `.devin/skills/`. Usa `nextjs-supabase-postgres` siempre;
`security-review` en cualquier código que toque autenticación, permisos, dinero o
datos de otros tenants; `database-migrations` al tocar el esquema;
`code-review-checklist` antes de cerrar una fase.

## Ciclo /loop

`PROGRESS.md` en la raíz es la fuente de verdad de fases y calificaciones. Se
actualiza al final de cada ronda **añadiendo**, nunca reescribiendo.
Reparado el 2026-09-10: ya no tiene bytes NUL ni mojibake, y `grep` vuelve a
tratarlo como texto. La causa **no era corrupción aleatoria**: el contenido pasó
por una cadena entre comillas dobles de PowerShell, donde el backtick es el
carácter de escape. Los backticks de markdown se comieron el carácter siguiente:
`` `0 `` quedó en NUL, `` `v `` en tabulador vertical y `` `a `` en BEL; el
backtick suelto ante espacio o punto desapareció sin dejar rastro. Además, un
tramo del archivo quedó doblemente codificado (`ó` como `Ã³`).

Para que no vuelva a pasar: **nunca escribas markdown con backticks desde una
cadena entre comillas dobles de PowerShell**. Usa una cadena literal (`@'...'@`)
o escribe el archivo con UTF-8 explícito desde otra herramienta. Y anexa,
nunca reescribas.
