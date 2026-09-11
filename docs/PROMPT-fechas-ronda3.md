# PROMPT RONDA 3 — Reparar la regresión en producción y terminar la migración de fechas

> Pega este documento completo como primer mensaje al agente.
> Todo lo que sigue fue **verificado contra la base de datos de producción**
> (proyecto Supabase `jgmgphmzusbluqhuqihj`) y contra los archivos en disco, el 2026-09-11.
> Documentos previos en el repo: `docs/PROMPT-fix-fechas-timezone.md` (ronda 1) y
> `docs/PROMPT-fechas-ronda2-correcciones.md` (ronda 2). Léelos para contexto, pero
> **este documento manda** donde haya discrepancia.

---

## 0. Dónde estamos

Go Admin ERP (Next.js App Router + Supabase, multi-tenant por `organization_id`, clientes en
Colombia / `America/Bogota`, UTC-5 sin DST) tenía un bug sistémico de fechas: las ventas hechas
después de las 19:00 hora Colombia se mostraban con la fecha del día siguiente. Se ejecutaron dos
rondas de corrección.

### Ya está hecho y verificado — NO lo rehagas

- `src/components/ui/calendar.tsx` — encabezado derivado de la misma `startOfWeek` que la grilla.
- `src/lib/utils/dateDisplay.ts` — `formatDateInTz`, `formatDateTimeInTz`, `formatTimeInTz`,
  `formatPlainDate`, `todayInTz`, `toPlainDate`, `plainDateToInstant`.
- `src/lib/utils/timezone.ts` — `getDayRange`, `getDateRange`, `getToday`, `getOrgDayRange`,
  `getOffsetMinutesForTimezone`, `offsetMinutesToISO`. Base de todo.
- `src/lib/context/OrganizationTimezoneContext.tsx` — provider, `useOrgTimezone()`, `useFormatDate()`,
  reacciona al cambio de organización.
- `organizations.timezone` — columna canónica de zona horaria.
- `fn_today_for_org(p_org_id)` en Postgres — lee esa columna, con `search_path = public, pg_temp`
  y manejo de excepción ante timezone inválido.
- `.eslintrc.json` — sin BOM, reglas en `error`, con `overrides` que ponen `warn` en lo no migrado.
- Migraciones registradas y versionadas: `20260911120000_timezone_aware_date_functions.sql`,
  `20260911130000_replace_current_date_defaults.sql`.
- 9 pantallas ya migradas a `useFormatDate()`: POS ventas, POS cajas, facturas de venta,
  cuentas por cobrar (tabla), y `src/app/api/factus/invoice/route.ts`.

**Los datos históricos son correctos.** Las columnas son `timestamptz` y el instante guardado está
bien. Nunca ejecutes un `UPDATE` masivo sobre columnas de fecha.

---

## P0 — URGENTE. Hay una regresión viva en producción. Empieza por aquí.

### P0-1. Tres triggers rompen los INSERT: referencian una columna que no existe

La ronda 2 eliminó los `DEFAULT CURRENT_DATE` de 9 columnas y los sustituyó por triggers
`BEFORE INSERT` que llaman a `fn_today_for_org(NEW.organization_id)`.

**Tres de esas tablas no tienen columna `organization_id`:**

| tabla | columna | acepta NULL | trigger creado |
|---|---|---|---|
| `currency_rates` | `rate_date` | NO | `trg_set_rate_date_tz` |
| `housekeeping_tasks` | `task_date` | NO | `trg_set_task_date_tz` |
| `provider_pricing` | `valid_from` | NO | `trg_set_valid_from_tz` |

Reproducción real en producción (dentro de una transacción abortada, no se persistió nada):

```sql
DO $$
DECLARE v_err text; v_code text;
BEGIN
  SELECT code INTO v_code FROM public.currencies LIMIT 1;
  BEGIN
    INSERT INTO public.currency_rates (code, rate, source) VALUES (v_code, 1.0, 'prueba');
    v_err := 'INSERT OK';
  EXCEPTION WHEN others THEN v_err := SQLERRM;
  END;
  RAISE EXCEPTION '>>> % <<<', v_err;   -- aborta siempre
END $$;
```

```
>>> record "new" has no field "organization_id" <<<   (SQLSTATE 42703)
```

Antes de la ronda 2 ese INSERT funcionaba gracias al `DEFAULT CURRENT_DATE`. Ahora el default no
existe, la columna es `NOT NULL`, y el trigger lanza excepción. **Se quitó la red y se abrió un
agujero en el mismo movimiento.**

Alcance: PL/pgSQL evalúa `NEW.organization_id` solo dentro del `IF NEW.x IS NULL`, así que solo
falla cuando el INSERT omite la columna. Revisé las 9 funciones de BD que insertan en
`currency_rates` y todas pasan `rate_date` explícitamente. Pero queda expuesto todo lo demás,
y cualquier código futuro que omita la columna falla con un mensaje incomprensible.

**Debajo hay un error de diseño, no solo un descuido.** Estas tres tablas no son multi-tenant:

- `currency_rates (id, code, rate_date, rate, source, created_at, updated_at, api_data,
  base_currency_code)` — catálogo **global** de tasas de cambio. No pertenece a ninguna organización.
- `provider_pricing (id, provider, sku, unit, unit_cost_usd, credits_per_unit, currency, valid_from,
  verified, source_url, notes, created_at, valid_to)` — catálogo **global** de precios de proveedores
  de IA. Tampoco pertenece a ninguna organización.
- `housekeeping_tasks (id, space_id, task_date, status, notes, assigned_to, created_at, updated_at)` —
  sí es de una organización, pero la alcanza indirectamente vía `space_id`.

**Qué hacer:**

1. **`currency_rates` y `provider_pricing`:** "hoy según la organización" no significa nada en un
   catálogo global. Elimina esos dos triggers y restaura un default determinista. Crea una función
   `fn_today_system()` que resuelva el día en una zona horaria de sistema configurable
   (`America/Bogota` por ahora) y úsala como `DEFAULT`, en vez de repetir un literal por la base.
   No dejes `CURRENT_DATE`: ese era el bug original.
2. **`housekeeping_tasks`:** resuelve la organización vía `space_id`. Confirma primero la ruta real
   (`spaces` → `branch_id`/`organization_id`) consultando el esquema; si no se puede resolver, el
   trigger debe caer a `fn_today_system()` en vez de lanzar excepción.
3. **Regla general para el resto:** ningún trigger puede asumir que `NEW.organization_id` existe.
   Verifica columna por columna antes de escribir el trigger:
   ```sql
   select table_name from information_schema.columns
   where table_schema='public' and column_name='organization_id'
     and table_name in ('dispatch_manifests','quotations','route_schedules',
                        'shipping_rates','transport_fares','vendor_commission_rates');
   ```
   (esas 6 sí la tienen; sus triggers están bien — no los toques)
4. **Verifica las otras dos tablas del mismo lote** con la misma prueba de INSERT-con-rollback:
   `housekeeping_tasks` y `provider_pricing`. No asumas: demuéstralo.
5. **Auditar la Edge Function `actualizar-tasas-cambio`** (cron `mantener-datos-reales-diarios`,
   `0 2 * * 1-6`): inserta en `currency_rates` por REST y no se pudo auditar desde SQL. Si omite
   `rate_date`, ese cron está fallando cada madrugada desde que se aplicó la ronda 2.
   Revisa también los logs de los últimos días.

Todo esto va en una **migración nueva** con su rollback, no en un `execute_sql`.

---

### P0-2. El backfill de timezone cubrió 1 de 83 organizaciones

```sql
select count(*) as total, count(timezone) as con_timezone from organizations;
-- total = 83, con_timezone = 1
```

La ronda 2 solo copió el valor de la única organización que ya tenía la clave `calendar` en
`organization_settings`. Las otras 82 quedaron en `NULL` y dependen del fallback.

Funciona hoy porque el fallback es `America/Bogota`, pero la "fuente de verdad" está vacía para el
99% de los clientes — que es exactamente la condición que causó el problema que la ronda 2 vino a
arreglar.

**Qué hacer:** poblar `organizations.timezone` para todas las organizaciones, tomando el valor de
`organization_settings` con clave `calendar` cuando exista y `America/Bogota` en los demás casos.
Migración + rollback. Considera además un `NOT NULL DEFAULT 'America/Bogota'` para que ninguna
organización nueva nazca sin zona horaria.

---

## P1 — La deuda real que sigue abierta

### P1-3. Migrar los call-sites. Esto es el grueso del trabajo y sigue sin hacerse.

Las rondas 1 y 2 migraron 9 pantallas y publicaron un inventario
(`docs/inventario-call-sites-fechas.md`: **1082 matches en 475 archivos, 34 módulos**).
Publicar el inventario no es migrar. El bug original sigue vivo en todo lo no tocado: reportes,
dashboards, `inicio`, inventario, PMS, HRM, CRM, transporte, gym, cuentas por pagar.

**Qué hacer — un PR por módulo, en este orden de impacto de negocio:**

1. POS reportes (`src/components/pos/reportes/`)
2. Finanzas dashboards (`src/components/finanzas/dashboard/`, `src/lib/services/reportes/`)
3. `src/components/inicio/`
4. Inventario (`src/components/inventario/`)
5. Cuentas por pagar (`src/components/finanzas/cuentas-por-pagar/`)
6. PMS → HRM → CRM → transporte → gym

**Método por archivo, sin atajos:**

- Para cada valor de fecha, determina si la columna de origen es `timestamptz` o `date`
  **consultando `information_schema.columns`**. No lo adivines por el nombre.
  `timestamptz` → `formatDate()` del hook (convierte). `date` → `formatPlain()` (no convierte).
  Confundir los dos casos es exactamente lo que produjo el bug original.
- Sustituye `formatDate`/`parseLocalDate` de `@/utils/Utils` por `useFormatDate()`.
- Sustituye `toISOString().split('T')[0]` por `todayInTz()` / `toPlainDate()`.
- Al terminar cada módulo, **muévelo del bloque `warn` al bloque `error`** en los `overrides` de
  `.eslintrc.json`. Así la deuda baja de forma medible y no se puede reintroducir.
- Añade al menos un test por módulo que corra con `TZ=UTC` y con `TZ=America/Bogota`.

Nada de find-and-replace ciego.

### P1-4. Agente de impresión — verificar lo que la ronda 2 dice haber hecho

La ronda 2 reporta haber añadido `timezone?: string` a los payloads de `print-agent/src/printing/`
y haber actualizado `formatDateParts` y sus call-sites. **No lo pude verificar.** Confirma que:

- `formatDateParts` recibe y usa el timezone (antes hacía `toLocaleDateString('es-CO')` sin
  `timeZone`, o sea el reloj del PC de la impresora);
- los 7 call-sites de `renderEscpos.ts` y los bloques de `renderHtml.ts` lo pasan;
- **quien construye el payload efectivamente rellena el campo** — un campo opcional que nadie llena
  no arregla nada. Revisa `src/lib/services/printService.ts`.

Es el papel que se lleva el cliente; vale la pena cerrarlo bien.

### P1-5. CI

No existe workflow de CI para el web (solo `mobile-build`). Las reglas de ESLint no se ejecutan en
ningún pipeline, así que hoy dependen de que alguien corra `npm run lint` a mano.
Propón un workflow con `npm run lint` y `npm run test:tz-all`, y **pregunta antes de crearlo**.

---

## Criterios de aceptación

- [ ] La prueba de INSERT-con-rollback pasa sin error en `currency_rates`, `housekeeping_tasks` y
      `provider_pricing`, omitiendo la columna de fecha.
- [ ] Ningún trigger de la base referencia `NEW.organization_id` en una tabla que no tenga esa columna.
- [ ] `select count(*) from organizations where timezone is null` → **0**.
- [ ] Ninguna columna tiene `DEFAULT CURRENT_DATE` (verificar con
      `select ... where column_default ilike '%CURRENT_DATE%'` → 0 filas).
- [ ] Cada objeto SQL creado o modificado tiene archivo en `supabase/migrations/`, rollback en
      `supabase/rollbacks/`, y aparece en `supabase_migrations.schema_migrations`.
- [ ] El conteo de `toISOString().split('T')` baja de forma medible por módulo, y cada módulo migrado
      quedó en el bloque `error` de `.eslintrc.json`.
- [ ] `npm run test:tz-all` pasa.
- [ ] Cero `UPDATE` sobre datos históricos de fechas.

---

## Reglas de trabajo — léelas, importan más que de costumbre

Las dos rondas anteriores declararon como completos puntos que no lo estaban: la ronda 1 marcó
completas las fases 5 y 6 sin hacerlas, y la ronda 2 marcó "P2-7 completo" habiendo hecho solo el
primero de cuatro pasos. Eso es lo que permitió que una regresión llegara a producción sin que nadie
la viera.

1. **No marques nada como completo sin el comando o la consulta que lo demuestra.** "Los tests pasan"
   no demuestra que el `grep` devuelva 0. "Creé el trigger" no demuestra que el INSERT funcione.
2. **Si haces una parte, dilo como una parte.** "Inventario publicado, migración pendiente" es una
   respuesta perfectamente buena. "Completo" cuando no lo está, no.
3. **Antes de escribir un trigger o una función que lea una columna, verifica que la columna existe**
   en esa tabla. Esta ronda existe por no haberlo hecho.
4. **Prueba las rutas de escritura, no solo las de lectura.** El bug de la ronda 2 era invisible para
   cualquier `SELECT`; solo aparecía al insertar.
5. **Todo DDL por `apply_migration`, con archivo en el repo y rollback.** Nunca `execute_sql` para
   cambios de esquema.
6. **Un PR por punto.** P0-1 y P0-2 son independientes y se revisan por separado.
7. Si algo en este documento contradice lo que encuentres en el código o en la base, **dilo** —
   se escribió con la información disponible el 2026-09-11.
