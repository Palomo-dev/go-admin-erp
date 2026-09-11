# PROMPT PARA AGENTE — Corrección integral de fechas y zona horaria en Go Admin ERP

> Pega este documento completo como primer mensaje al agente que va a ejecutar la corrección.
> Fue construido a partir de una auditoría real del repo `Palomo-dev/go-admin-erp` (rama `main`)
> y del proyecto Supabase `jgmgphmzusbluqhuqihj` (Go Admin ERP), el 2026-09-11.

---

## 0. Rol y objetivo

Eres un ingeniero senior full-stack trabajando en **Go Admin ERP** (Next.js App Router + TypeScript +
Supabase/PostgreSQL, multi-tenant por `organization_id`, operando principalmente en Colombia,
`America/Bogota`, UTC-5 sin DST).

**Objetivo:** eliminar por completo la clase de bug "la fecha se muestra/guarda un día corrido",
dejando una única fuente de verdad para fechas en toda la aplicación, sin migrar ni tocar los datos
históricos (los datos están correctos; lo que está mal es la presentación y el cálculo de "hoy").

**Restricción dura:** NO ejecutes un `UPDATE` masivo sobre `sale_date`, `issue_date`, `payment_date`
ni ninguna columna `timestamptz`. Ver §2 — los instantes almacenados son correctos.

---

## 1. Síntomas reportados por el usuario (producción)

1. Una venta hecha el **10/09/2026** aparece listada como **11/09/2026** (POS y Facturas de venta).
2. El calendario del formulario "Nueva factura" está **atrasado un día**.
3. El formulario dice que hoy es **jueves** cuando en realidad es **viernes**.
4. "Han habido varias fallas con el tiempo y los calendarios" — es decir, es sistémico, no puntual.

---

## 2. Diagnóstico ya confirmado — NO vuelvas a investigar desde cero

Todo lo siguiente está **verificado contra el código y contra la base de datos de producción**.
Úsalo como punto de partida.

### 2.1 Los datos en la BD están BIEN

```
sales.sale_date           -> timestamp with time zone, default now()
invoice_sales.issue_date  -> timestamp with time zone, default now()
invoice_sales.due_date    -> timestamp with time zone
payments.payment_date     -> timestamp with time zone, default now()
cash_sessions.opened_at   -> timestamp with time zone, default now()
```

El instante guardado es el correcto. **El bug es de renderizado y de cálculo de "día calendario".**
Por eso está prohibido "corregir" datos con un UPDATE: duplicarías el error.

### 2.2 BUG #1 (raíz del 90% del problema) — `parseLocalDate` destruye la zona horaria

`src/utils/Utils.ts:39-53`

```ts
export function parseLocalDate(dateString: string): Date {
  if (!dateString) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return new Date(dateString + 'T00:00:00');
  const dateOnly = dateString.split('T')[0];          // <-- AQUÍ ESTÁ EL BUG
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return new Date(dateOnly + 'T00:00:00');
  return new Date(dateString);
}
```

Cuando recibe un `timestamptz` de Supabase como `2026-09-11T01:30:00+00:00` (una venta hecha el
**10/09 a las 20:30 en Bogotá**), hace `split('T')[0]` y se queda con el **día calendario UTC**,
`2026-09-11`. Descarta el offset en lugar de convertirlo.

`formatDate()` (`src/utils/Utils.ts:93`) delega en `parseLocalDate`, y `formatDate` se usa en
**345 lugares** del código. Por eso toda venta/factura/pago hecho **después de las 19:00 hora Bogotá**
se muestra con la fecha del día siguiente.

**Evidencia cuantitativa (consulta real a producción, últimos 90 días):**

| tabla.columna              | registros | muestran día equivocado | %     |
|----------------------------|-----------|-------------------------|-------|
| `sales.sale_date`          | 1386      | 381                     | 27.5% |
| `invoice_sales.issue_date` | 1338      | 684                     | 51.1% |
| `payments.payment_date`    | 1666      | 403                     | 24.2% |
| `cash_sessions.opened_at`  | 58        | 9                       | 15.5% |

Y para el caso exacto que reportó el usuario:

```
día mostrado (UTC) | día real (Bogotá) | ventas
2026-09-11         | 2026-09-10        | 117    <-- las ventas de "ayer" que salen como hoy
2026-09-11         | 2026-09-11        | 22
2026-09-10         | 2026-09-09        | 45
```

Agravante visual: en `src/components/pos/ventas/VentasTable.tsx:184-187` la **fecha** se pinta con
`formatDate()` (día UTC) y la **hora** justo al lado con `toLocaleTimeString()` (hora local correcta).
El resultado en pantalla es literalmente `11/09/2026 — 8:30 p. m.` para una venta de la noche del 10.

### 2.3 BUG #2 — El calendario tiene el encabezado desalineado con la grilla

`src/components/ui/calendar.tsx`

- Línea 99: la grilla arranca en `startOfWeek(startOfMonth(month), { locale })` con `locale = es`.
- El locale `es` de date-fns define `options.weekStartsOn: 1` (**lunes**). Verificado en
  `node_modules/date-fns/locale/es.cjs:28`.
- Línea 169: el encabezado está **hardcodeado empezando en domingo**:
  `["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"]`.

Resultado: la grilla empieza en lunes pero el encabezado dice domingo → **cada día aparece una columna
antes de la que le corresponde**, es decir, un día de la semana "atrasado". Hoy viernes 11/09 cae bajo
la columna rotulada "Ju". Esto explica exactamente los síntomas 2 y 3.

Este `Calendar` es el que usa `src/components/ui/date-picker.tsx`, que a su vez usa
`NuevaFacturaForm.tsx:1062,1080`. **El bug afecta a todo formulario que use `<DatePicker />`.**

### 2.4 BUG #3 — "Hoy" se calcula en UTC en todo el código

`new Date().toISOString().split('T')[0]` y variantes: **372 ocurrencias** en `src/`.

Entre las 19:00 y las 23:59 hora Bogotá eso devuelve **mañana**. Impacto directo:
filtros "ventas de hoy", valores por defecto de formularios, cierres de caja, cortes de reportes.

Casos concretos ya localizados escribiendo a columnas `date`:

```
src/components/pms/housekeeping/TaskDialog.tsx:101      task_date
src/components/transporte/manifiestos/ManifestDialog.tsx:73,101  manifest_date
src/components/crm/pipeline/hooks/usePipeline.ts:136    expected_close_date
src/components/pos/promociones/nuevo/PromotionWizard.tsx:80      start_date
src/components/finanzas/periodos-contables/*            start_date / end_date
src/components/finanzas/cuentas-por-cobrar/id/service.ts:316     due_date
src/components/finanzas/cuentas-por-pagar/**            due_date
src/lib/services/checkoutService.ts:442,579             checkout / hoy
```

### 2.5 BUG #4 — La base de datos corre en UTC y hay defaults `CURRENT_DATE`

```
current_setting('TimeZone') = 'UTC'
```

Columnas `date` con `DEFAULT CURRENT_DATE` — después de las 19:00 Bogotá insertan **mañana**:

```
quotations.issue_date        date DEFAULT CURRENT_DATE
housekeeping_tasks.task_date date DEFAULT CURRENT_DATE
dispatch_manifests.manifest_date date DEFAULT CURRENT_DATE
currency_rates.rate_date     date DEFAULT CURRENT_DATE
```

### 2.6 BUG #5 — Factus / facturación electrónica DIAN

`src/app/api/factus/invoice/route.ts:176`

```ts
due_date: invoice.due_date?.split('T')[0],
```

Mismo patrón: se envía a la DIAN el **día UTC**, no el día colombiano. Tiene implicación fiscal,
no solo cosmética. Revisar también `issue_date` en el payload y en notas crédito/débito y documentos
soporte (`src/app/api/factus/credit-note/`, `debit-note/`, `support-document/`).

### 2.7 BUG #6 — El runtime del servidor corre en UTC

No hay variable `TZ` en `next.config.js`, `vercel.json`, `railway.toml` ni `.env.example`.
Cualquier `new Date()` ejecutado en un Route Handler, Server Component o cron corre en UTC.
**No lo resuelvas poniendo `TZ=America/Bogota`** — eso rompe el multi-tenant (una organización
en México quedaría mal). La zona horaria debe venir siempre de la organización. Ver §3.

### 2.8 Lo que YA ESTÁ BIEN — no lo rompas, apóyate en ello

Ya existe infraestructura correcta y bien documentada. **Reutilízala, no la reescribas:**

- `src/lib/utils/timezone.ts` — `getDayRange`, `getDateRange`, `getToday`, `getOperatingToday`,
  `getOrgDayRange`, `getOrgDateRange`. Maneja offsets vía `Intl`, soporta DST y "días operativos"
  que cruzan medianoche (ej. bar de 20:00 a 03:00). Está bien hecho.
- `src/lib/services/organizationTimezoneService.ts` — `getOrganizationTimezone(orgId)` con caché en
  memoria y deduplicación de peticiones en vuelo. Lee de `organization_settings` (keys `pms_settings`,
  `calendar_settings`), con fallback a `America/Bogota`.
- RPCs en Postgres que ya reciben `p_timezone`: `get_sales_by_day`, `get_invoice_sales_by_day`,
  `get_products_by_day`, `get_customers_by_day`, `get_accounts_receivable_by_day`, `get_reservations_by_day`,
  `get_org_members_by_day`, `get_web_orders_*`, `get_website_visits_by_day`.
- `src/components/pos/ventas/VentasService.ts` — el **filtrado** por rango ya usa `getDateRange(...)`
  con el timezone de la organización. Es el patrón a replicar.

**Conclusión del diagnóstico:** alguien ya arregló bien la capa de *filtrado*, pero nunca se arregló
la capa de *presentación* ni el cálculo de *"hoy"*. Ese es exactamente el trabajo pendiente.

---

## 3. Reglas canónicas que debe cumplir el código después del arreglo

Escríbelas en `docs/` y hazlas cumplir con lint (§5, Fase 5).

1. **Un instante se guarda siempre como `timestamptz`.** Nunca como `date` ni como texto.
2. **Un día calendario del negocio (fecha de vencimiento, fecha de turno, período contable) se guarda
   como `date`** y se construye **siempre** en la zona horaria de la organización, nunca con `toISOString()`.
3. **`toISOString()` está prohibido para derivar una fecha.** Solo se permite para serializar un
   instante completo que se va a guardar en un `timestamptz`.
4. **`.split('T')[0]` sobre un valor que viene de la BD está prohibido.**
5. **Todo renderizado de fecha pasa por el timezone de la organización.** Cero excepciones.
   Nada de `new Date(x).toLocaleDateString()` suelto.
6. **La zona horaria nunca se hardcodea.** Sale de `getOrganizationTimezone(organizationId)`.
   `America/Bogota` solo como fallback dentro de `DEFAULT_TIMEZONE`.
7. **El servidor no asume zona horaria.** No se define `TZ` global.
8. **Los datos históricos no se tocan.** Son correctos.

---

## 4. Contrato de la nueva capa de fechas

Crea `src/lib/utils/dateDisplay.ts`. Es la **única** API de formateo permitida en la app.
Instala `@date-fns/tz` (o `date-fns-tz`; hoy **no hay ninguna instalada**) o resuélvelo con `Intl` puro
reutilizando el enfoque que ya usa `src/lib/utils/timezone.ts`.

```ts
/** Formatea un instante (timestamptz) como día calendario en la zona de la org. */
export function formatDateInTz(value: string | Date | null | undefined, timezone: string, opts?): string;

/** Formatea instante -> "dd/MM/yyyy HH:mm" en la zona de la org. */
export function formatDateTimeInTz(value: string | Date | null | undefined, timezone: string, opts?): string;

/** Formatea solo la hora en la zona de la org. */
export function formatTimeInTz(value: string | Date | null | undefined, timezone: string): string;

/** Para columnas `date` puras (YYYY-MM-DD): las renderiza SIN convertir nada. */
export function formatPlainDate(value: string | null | undefined, opts?): string;

/** Día calendario actual en la zona de la org. Reexporta getToday de timezone.ts. */
export function todayInTz(timezone: string): string;   // 'YYYY-MM-DD'

/** Date local del navegador (de un <DatePicker/>) -> 'YYYY-MM-DD' en la zona de la org. */
export function toPlainDate(date: Date, timezone: string): string;

/** 'YYYY-MM-DD' + 'HH:mm' en la zona de la org -> ISO con offset, listo para timestamptz. */
export function plainDateToInstant(plain: string, timezone: string, time?: string): string;
```

**Distinción crítica que debe quedar explícita en el código y en los tipos:**

- valor que viene de un `timestamptz` → `formatDateInTz` (convierte)
- valor que viene de un `date` → `formatPlainDate` (NO convierte, ya es un día calendario)

Confundir estos dos casos es exactamente lo que produjo el bug original. Si es viable, usa
*branded types* (`type PlainDate = string & { __brand: 'PlainDate' }`) para que el compilador
lo impida.

### Acceso al timezone desde componentes cliente

Crea un `OrganizationTimezoneProvider` + hook `useOrgTimezone()` que exponga
`{ timezone, operatingHours, isLoading }`, montado en el layout de `/app`, alimentado por
`getOrganizationTimezone` + `getOperatingHours`. Los componentes de presentación **no** deben hacer
`await` por el timezone en cada render.

Provee además un helper `useFormatDate()` que devuelva las funciones ya "curried" con el timezone,
para que el call-site quede `const { formatDate } = useFormatDate(); ... formatDate(sale.sale_date)`
— así el codemod de §5 Fase 3 es casi mecánico.

---

## 5. Plan de ejecución por fases

Trabaja en una rama `fix/timezone-fechas`. Un PR por fase, cada uno independientemente desplegable.
No mezcles fases.

### Fase 0 — Red de seguridad (hacer PRIMERO)

- Tests unitarios con `TZ=UTC` **y** `TZ=America/Bogota` en `jest.config.js` (hoy no se fija `TZ`,
  lo que hace que los tests pasen en local y fallen en Vercel, o al revés).
- Casos de prueba obligatorios, cada uno con el resultado esperado escrito a mano:
  - venta a las `2026-09-10T20:30:00-05:00` → debe mostrar `10/09/2026`
  - venta a las `2026-09-11T01:30:00Z` → debe mostrar `10/09/2026` (mismo instante)
  - venta a las `2026-09-10T23:59:00-05:00` → `10/09/2026`
  - venta a las `2026-09-11T00:01:00-05:00` → `11/09/2026`
  - `todayInTz('America/Bogota')` a las `2026-09-12T02:00:00Z` → `2026-09-11`
  - una org con `America/Mexico_City` y otra con `Europe/Madrid` (DST) sobre el mismo instante
- Un test que renderice `<Calendar/>` de septiembre 2026 y afirme que la celda "11" está bajo la
  columna "Vi". **Debe fallar antes del arreglo.**

### Fase 1 — Calendario (impacto visual inmediato, riesgo bajo)

`src/components/ui/calendar.tsx`:

- Derivar el encabezado de la misma semana que genera la grilla:
  `Array.from({length:7}, (_,i) => format(addDays(startOfWeek(new Date(), { locale }), i), 'EEEEEE', { locale }))`.
  Nunca vuelvas a hardcodear el array.
- Añadir `aria-label` y `role="grid"` correctos (aprovecha para pasar la skill `accessibility-a11y`).
- Revisar la misma clase de desalineación en los otros calendarios:
  `src/components/pm/views/CalendarView.tsx:45,102`, `src/components/calendario/MonthView.tsx:21,47`,
  `src/components/hrm/turnos/ShiftCalendar.tsx:281`, `src/components/pms/calendario/TapeChartGrid.tsx`,
  `src/components/gym/horarios/DroppableTimeSlot.tsx`, `src/components/calendario/WeekView.tsx`.
  Regla: **encabezado y grilla deben derivarse de la misma llamada a `startOfWeek`**.
- Verificar también que el "día de hoy" resaltado use el día de la org, no `new Date()` del navegador.

### Fase 2 — Nueva capa de fechas

- Implementar `src/lib/utils/dateDisplay.ts` según §4, con tests.
- Implementar `OrganizationTimezoneProvider` / `useOrgTimezone` / `useFormatDate`.
- **Deprecar sin borrar todavía:** marcar `parseLocalDate` y `formatDate` de `src/utils/Utils.ts`
  con `@deprecated` y un comentario que apunte a este documento.

### Fase 3 — Migración de los call-sites de presentación

Orden por criticidad de negocio (no alfabético):

1. `src/components/pos/ventas/**` — VentasTable, VentaDetalle
2. `src/components/finanzas/facturas-venta/**` — FacturasTable, DetalleFactura, PagosFactura, editar
3. `src/components/pos/cajas/**` — arqueos y movimientos (afecta cuadre de caja)
4. `src/lib/services/printService.ts` y plantillas de tickets/comandas — el cliente se lleva el papel
5. `src/components/finanzas/cuentas-por-cobrar/**` y `cuentas-por-pagar/**` — vencimientos y mora
6. `src/components/inicio/**` y dashboards
7. El resto

Método: por cada archivo, sustituir `formatDate(x)` por el helper del hook, decidiendo caso por caso
si la columna origen es `timestamptz` (convertir) o `date` (no convertir). **Consulta el esquema real,
no adivines** — usa el MCP de Supabase o `information_schema.columns`.

No hagas un find-and-replace ciego sobre las 345 ocurrencias: la decisión `timestamptz` vs `date`
requiere criterio en cada punto.

### Fase 4 — "Hoy" y escrituras

- Reemplazar las 372 ocurrencias de `toISOString().split('T')[0]` / `.slice(0,10)` por
  `todayInTz(timezone)` o `toPlainDate(date, timezone)`.
- `NuevaFacturaForm.tsx:111-117,671-672,719,801-802`: el default de `issueDate`/`dueDate` debe ser el
  día de la organización, y al guardar debe usar `plainDateToInstant`, no `toISOString()` del "ahora".
- `src/app/api/factus/**`: reemplazar `?.split('T')[0]` por conversión a día colombiano.
  **Validar contra la documentación de Factus qué zona horaria espera la DIAN.**
- Revisar los otros Route Handlers y crons (`src/app/api/cron/**`) — corren en UTC en Vercel.

### Fase 5 — Blindaje anti-regresión

- Regla ESLint `no-restricted-syntax` que falle el build ante:
  - `.toISOString().split('T')` y `.toISOString().slice(0, 10)`
  - `new Date(...).toLocaleDateString(...)` fuera de `src/lib/utils/`
  - import de `formatDate`/`parseLocalDate` desde `src/utils/Utils`
- Añadir el lint al workflow de CI (`.github/workflows/`).
- Documentar las reglas de §3 en `docs/` (usa la skill `technical-writing-docs`) y añadir la sección
  correspondiente a `CLAUDE.md` para que futuros agentes no reintroduzcan el patrón.
- Una vez migrado todo, **eliminar** `parseLocalDate` y el `formatDate` viejo.

### Fase 6 — Base de datos (migración, con la skill `database-migrations`)

- Reemplazar los defaults `CURRENT_DATE` de `quotations.issue_date`, `housekeeping_tasks.task_date`,
  `dispatch_manifests.manifest_date`, `currency_rates.rate_date` por una función que resuelva el día
  en la zona de la organización (o eliminar el default y exigir que la app lo envíe explícitamente —
  preferible, porque el default no conoce el `organization_id`).
- **No** cambies `current_setting('TimeZone')` de la base a `America/Bogota`: rompería el multi-tenant
  y el comportamiento de las RPC ya existentes que reciben `p_timezone`.
- Auditar las funciones que usan `CURRENT_DATE` internamente y no reciben timezone:
  `calculate_days_overdue`, `daily_update_overdue_accounts`, `update_all_days_overdue`,
  `update_expired_parking_passes`, `fn_reschedule_overdue_tasks`, `fn_daily_task_agent`,
  `auto_generate_missing_rates`, `fill_missing_currency_dates`. Todas deciden mora / vencimiento /
  expiración con el día UTC. Añádeles un parámetro de timezone por organización.

---

## 6. Criterios de aceptación

El trabajo está terminado cuando **todo** lo siguiente es cierto:

- [ ] Una venta registrada a las 20:30 hora Colombia se muestra con la fecha de **ese** día en el
      listado de ventas, en el detalle, en el ticket impreso y en cualquier reporte.
- [ ] El calendario del `<DatePicker/>` muestra el 11/09/2026 bajo la columna "Vi".
- [ ] El valor por defecto de "fecha de emisión" en Nueva Factura, a las 22:00 hora Colombia,
      es el día de hoy en Colombia y no el de mañana.
- [ ] Esta consulta, corrida después del arreglo, coincide con lo que muestra la UI para cualquier día:
      ```sql
      select (sale_date at time zone 'America/Bogota')::date, count(*)
      from sales where organization_id = :org group by 1 order by 1 desc;
      ```
- [ ] Cambiar el timezone de una organización a `America/Mexico_City` cambia lo que ve esa organización
      y **no** afecta a las demás.
- [ ] `grep -rn "toISOString().split('T')" src/` devuelve **0** resultados.
- [ ] `npm run lint` y `npm test` pasan con `TZ=UTC` y con `TZ=America/Bogota`.
- [ ] Cero `UPDATE` sobre columnas de fecha de datos históricos en todo el PR.

---

## 7. Herramientas y contexto disponible

- **MCP de Supabase** conectado. Proyecto: `jgmgphmzusbluqhuqihj` ("Go Admin ERP", Postgres 15, us-west-1).
  Úsalo para verificar tipos de columna antes de decidir `timestamptz` vs `date`, y para validar los
  criterios de aceptación con datos reales. **Consulta primero, migra después.**
- Repos conectados: `go-admin-erp`, `go-admin-super`, `go-admin-investors`, `go-admin-sellers`,
  `goadmin-websites`. Si `go-admin-sellers` o `goadmin-websites` consumen `sales`/`invoice_sales`,
  audítalos con los mismos criterios — el bug se propaga.
- Skills relevantes ya disponibles: `debugging-systematic`, `nextjs-supabase-postgres`,
  `database-migrations`, `testing-tdd`, `code-review-checklist`, `technical-writing-docs`,
  `accessibility-a11y`, `observability-logging`.
- Sentry está integrado (`sentry.client.config.ts`, `sentry.server.config.ts`) — considera instrumentar
  una alerta si alguna fecha calculada difiere del día de la organización.

---

## 8. Cómo empezar

1. Lee `src/lib/utils/timezone.ts` completo antes de escribir una línea. Es bueno; es tu base.
2. Escribe la Fase 0 (los tests que fallan) **antes** de tocar código de producción.
3. Entrega la Fase 1 sola, en su propio PR — es la que el usuario ve de inmediato y la de menor riesgo.
4. Antes de la Fase 3, publica la lista de los call-sites que vas a migrar y en qué orden,
   para revisión.

---

## Nota de alcance

Esta auditoría se hizo sobre la rama `main` de GitHub. La copia local del usuario tiene ramas
adicionales (`feature/pos-integration`, `feature/twilio-conversation-relay`) que pueden diferir.
Confirma contra el working tree local antes de aplicar los cambios.
