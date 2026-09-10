# Propuesta de `CLAUDE.md` para la raíz del repositorio

> Entregable de la Fase 0 del plan del GO Assistant (§0.4).
> **No se ha creado `CLAUDE.md` en la raíz**: el plan pide proponerlo, no
> crearlo sin aprobación. Si el contenido de abajo te parece bien, se mueve tal
> cual a `CLAUDE.md`.
>
> Por qué importa: sin este archivo, cada sesión de Claude Code redescubre las
> reglas del repo, y las que no redescubre las incumple. Esta fase existe en
> buena parte porque no se siguió la regla "verifica el esquema antes de escribir
> una query": el asistente llevaba meses escribiendo en tablas inexistentes.

---

```markdown
# Go Admin ERP — instrucciones para Claude Code

ERP multi-tenant y multi-sucursal. Next.js 15 (App Router) + TypeScript estricto
+ Tailwind + shadcn/ui + Supabase (Postgres 15). Español de Colombia en código,
comentarios, commits y UI.

## Reglas duras

1. **La base de datos se toca SOLO por el MCP de Supabase** (`apply_migration`,
   `execute_sql`, `list_tables`, `get_advisors`). **No crees archivos `.sql`** en
   el repositorio, y borra los de prueba si los generas.
   Proyecto: `jgmgphmzusbluqhuqihj`.
2. **Verifica tablas y columnas con el MCP ANTES de escribir cualquier query.**
   No asumas que una tabla existe porque el código actual la usa: `inventory`,
   `orders` y `order_items` aparecían en el código y nunca existieron.
3. **`git push` y abrir PRs requieren autorización explícita** en la conversación.
   `git commit` local, solo si se pide.
4. **La organización sale de la sesión, nunca del body.** Todo route handler
   empieza por `getServerOrgContext()` (o `withOrg`). Si el body trae una
   organización distinta: 403 y se registra.
5. **Los permisos se resuelven en el servidor.** Nunca a partir del nombre de un
   rol, y nunca con un valor que venga del cliente.
6. **Nada de lógica de negocio duplicada.** Si `posService` sabe crear una venta
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
Aviso: el archivo tiene corrupción previa (bytes NUL, mojibake de un `Out-File`
de PowerShell). `grep` lo trata como binario. Está anotado para repararse aparte;
mientras tanto, anexa con UTF-8 explícito.
```
