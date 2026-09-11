# PROMPT RONDA 2 — Cerrar las brechas de la corrección de fechas y zona horaria

> Pega este documento completo como primer mensaje al agente.
> Es la continuación de `docs/PROMPT-fix-fechas-timezone.md` (Ronda 1).
> Todo lo que sigue fue **verificado** el 2026-09-11 contra la base de datos de producción
> (`jgmgphmzusbluqhuqihj`) y contra los archivos en el disco del usuario. No es especulación.

---

## 0. Contexto: qué pasó en la Ronda 1

Se ejecutó la Ronda 1 y se reportaron 6 fases completas. Una auditoría posterior encontró que
**3 de las 6 fases están marcadas como completas sin estarlo**, y que existe un defecto anterior
al trabajo que anula el propósito de toda la arquitectura multi-tenant de zona horaria.

Tu trabajo es cerrar esas brechas. **No rehagas lo que ya funciona.**

### Verificado como CORRECTO — no lo toques, apóyate en ello

- `src/components/ui/calendar.tsx` — el encabezado ya se deriva de la misma `startOfWeek` que genera
  la grilla (líneas 100-106). El bug del "calendario atrasado un día" está resuelto.
- `src/lib/utils/dateDisplay.ts` — API completa y correcta: `formatDateInTz`, `formatDateTimeInTz`,
  `formatTimeInTz`, `formatPlainDate`, `todayInTz`, `toPlainDate`, `plainDateToInstant`.
- `src/lib/context/OrganizationTimezoneContext.tsx` — provider + `useOrgTimezone()` + `useFormatDate()`.
  Bien diseñado: arranca con el fallback, así que no hay parpadeo de fechas.
- `src/lib/utils/timezone.ts` y `organizationOperatingHoursService` — infraestructura previa, correcta.
- `package.json` — `cross-env` en devDependencies y scripts `test:tz-utc` / `test:tz-bogota` / `test:tz-all`.
- Los 32 tests de `src/__tests__/timezone/` pasan con ambas zonas horarias.
- En la BD existen y funcionan: `fn_today_for_org`, y `calculate_days_overdue`,
  `daily_update_overdue_accounts`, `update_all_days_overdue`, `update_expired_parking_passes`
  ya usan la zona horaria de la organización en vez de `CURRENT_DATE`.

---

## P0 — Bloqueantes. Resolver primero, en este orden.

### P0-1. El timezone se lee de una clave que NO EXISTE en los datos

**Este es el hallazgo más importante del informe. Anula el propósito de todo el trabajo de la Ronda 1.**

`src/lib/services/organizationTimezoneService.ts:25`

```ts
const SETTING_KEYS = ['pms_settings', 'calendar_settings'] as const;
```

Evidencia contra producción:

```sql
select key, count(*) as orgs, count(*) filter (where settings ? 'timezone') as con_timezone
from organization_settings group by key order by 2 desc;
```

```
key                        orgs  con_timezone
pos_categories_display     8     0
pos_blind_cash_count       3     0
pos_cash_session_mode      2     0
calendar                   1     1     <-- la ÚNICA org con timezone usa la clave 'calendar'
pos_require_cash_session   1     0
```

**Cero filas** con `pms_settings` o `calendar_settings`. La única organización que tiene timezone
configurado lo guarda bajo la clave **`calendar`**, con valor `America/Bogota`.

Consecuencias:

1. `getOrganizationTimezone()` **siempre** devuelve el fallback `DEFAULT_TIMEZONE`.
2. `fn_today_for_org` (creada en la Ronda 1) **copió la misma lista de claves equivocada** a la base
   de datos, así que arrastra el mismo defecto.
3. Todo funciona hoy **por casualidad**, porque el fallback es `America/Bogota` y todos los clientes
   están en Colombia. El día que entre un cliente en México o España, todo vuelve a estar mal —
   en silencio, sin error, sin log. Es el peor modo de falla posible.
4. Tampoco existe (aparentemente) una pantalla de configuración donde una organización defina su
   zona horaria. Confírmalo.

**Qué hacer:**

1. **Investiga primero, no asumas.** Encuentra qué código escribe la clave `calendar` en
   `organization_settings` y si hay alguna UI de configuración de zona horaria. Busca en
   `src/components/configuracion/` y en `src/components/calendario/configuracion/`.
2. **Decide y documenta una única fuente de verdad.** La recomendación es añadir una columna
   `organizations.timezone text` (con `CHECK` de validez o validación en la app):
   - una sola lectura, sin buscar en jsonb;
   - barata de consultar desde SQL, lo que importa porque `fn_today_for_org` se ejecuta **por fila**
     dentro de triggers;
   - inequívoca — no hay 5 claves candidatas donde pueda estar.
   Si prefieres mantenerlo en `organization_settings`, entonces fija **una** clave canónica y
   documéntala; pero justifica la decisión.
3. **Backfill:** poblar el timezone de todas las organizaciones existentes con `America/Bogota`
   (es correcto para ellas hoy) leyendo lo que ya exista en la clave `calendar`.
4. **Alinear las tres lecturas** para que usen la misma fuente:
   - `organizationTimezoneService.getOrganizationTimezone()`
   - `fn_today_for_org` en la BD
   - cualquier lectura directa que encuentres
5. **Construir la UI de configuración** si no existe: un selector de zona horaria IANA en la
   configuración de la organización, que invalide el caché (`invalidateTimezoneCache`) al guardar.
6. **Instrumentar:** cuando `getOrganizationTimezone` caiga al fallback, emitir un `console.warn`
   y un breadcrumb de Sentry. Hoy el fallback es invisible; ese silencio es lo que permitió que
   esto pasara desapercibido.

**Criterio de aceptación:** cambiar el timezone de una organización a `America/Mexico_City` cambia
lo que ve esa organización en la UI **y** lo que devuelve `fn_today_for_org(orgId)` en SQL, y no
afecta a ninguna otra organización.

---

### P0-2. Los cambios de base de datos no existen como migración

Los 5 objetos SQL de la Ronda 1 se aplicaron con `execute_sql` directo contra producción.

Evidencia: la última migración registrada es `20260911100000_f10_credit_note_applications_rls.sql`,
sin relación con fechas. En `supabase/migrations/` no hay **ningún** archivo que cree
`fn_today_for_org` ni que modifique las 4 funciones.

Resultado: los cambios existen **solo en el servidor de producción**. No están versionados, no son
reproducibles en otro entorno, no son revisables en un PR, y desaparecen en cuanto alguien
reconstruya la base desde migraciones.

**Qué hacer:**

1. Extraer la definición actual de los 5 objetos desde producción:
   ```sql
   select pg_get_functiondef(p.oid)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('fn_today_for_org','calculate_days_overdue',
                       'daily_update_overdue_accounts','update_all_days_overdue',
                       'update_expired_parking_passes');
   ```
2. Escribir un archivo de migración idempotente en `supabase/migrations/` (usa la skill
   `database-migrations`), con el `fn_today_for_org` ya **corregido** según P0-1 y P1-4 — no
   congeles la versión defectuosa.
3. Añadir el rollback correspondiente en `supabase/rollbacks/` (el repo ya tiene esa carpeta).
4. Registrar la migración con `apply_migration` para que quede en el historial, no con `execute_sql`.

**Regla para el resto de este trabajo: todo DDL va por `apply_migration` con su archivo en el repo.
Nunca más `execute_sql` para cambios de esquema.**

---

### P0-3. El archivo de ESLint tiene BOM y las reglas no bloquean nada

`.eslintrc.json` fue escrito con PowerShell y quedó con un BOM (`U+FEFF`) al inicio.
`JSON.parse()` lo rechaza — comprobado:

```
primer codepoint: feff
JSON.parse(raw)     -> FALLA: Unexpected token '﻿' ... is not valid JSON
JSON.parse(sin BOM) -> OK
```

Además, aunque el cargador de ESLint tolerara el BOM, las reglas están en `"warn"`, no `"error"`,
así que `next lint` termina con código 0 y CI nunca falla. **El blindaje anti-regresión no blinda.**

**Qué hacer:**

1. Reescribir `.eslintrc.json` en UTF-8 **sin BOM**. Verifica con
   `node -e "JSON.parse(require('fs').readFileSync('.eslintrc.json','utf8'))"` — debe salir sin error.
2. Ejecutar `npm run lint` y confirmar que el archivo carga y que las reglas se aplican.
3. Cambiar `"warn"` → `"error"` en `no-restricted-syntax` y `no-restricted-imports`.
4. Como el código todavía tiene ~372 violaciones (ver P2-7), no puedes poner `error` global de golpe
   sin romper el build. Opciones, en orden de preferencia:
   - `error` global + `eslint-disable-next-line` con un comentario `TODO(fechas)` en cada violación
     pendiente, para que la deuda sea visible y contable; o
   - `error` solo en los directorios ya migrados vía `overrides`, e ir ampliando el alcance a medida
     que avanza P2-7.
   Elige una y déjala explicada en `docs/reglas-fechas-timezone.md`.
5. Añadir `npm run lint` al workflow de CI en `.github/workflows/` si todavía no está.

---

## P1 — Importantes

### P1-4. `fn_today_for_org` tiene dos defectos que pueden romper INSERTs

```sql
SELECT settings INTO v_settings
FROM organization_settings
WHERE organization_id = p_org_id
  AND key IN ('pms_settings', 'calendar_settings')
ORDER BY CASE key WHEN 'pms_settings' THEN 1 WHEN 'calendar_settings' THEN 2 END
LIMIT 1;
```

1. **`LIMIT 1` toma la primera fila aunque no tenga `timezone`** y entonces cae al default, en vez de
   probar la siguiente clave. El servicio TypeScript sí itera sobre todas y toma la primera *válida*.
   Las dos implementaciones pueden dar respuestas distintas para la misma organización.
   → Filtra por `settings ? 'timezone'` dentro del `WHERE`.
2. **No valida que el string sea un timezone IANA real.** `(now() AT TIME ZONE 'basura')::date` lanza
   excepción. Como la función se llama desde los triggers `calculate_days_overdue` y
   `update_expired_parking_passes`, **un timezone mal escrito rompe todo INSERT/UPDATE** en
   `accounts_receivable` y `parking_passes`. El servicio TypeScript sí valida con `Intl`.
   → Envuelve la conversión en un bloque `EXCEPTION WHEN others THEN` que caiga al default, o valida
   contra `pg_timezone_names`.
3. La función no fija `search_path`. No es SECURITY DEFINER, así que no hay escalada de privilegios,
   pero el linter de Supabase lo marca. Añade `SET search_path = public, pg_temp`.
4. **Rendimiento:** se ejecuta una vez por fila dentro de triggers. Si P0-1 termina con una columna
   en `organizations`, la lectura es directa. Si se queda en `organization_settings`, mide el impacto
   en un UPDATE masivo de `accounts_receivable` antes de dar el tema por cerrado.

Todo esto va en la misma migración de P0-2.

---

### P1-5. Los 9 defaults `CURRENT_DATE` siguen intactos

La Fase 6 de la Ronda 1 se marcó completa sin hacer esto. Verificado contra producción:

```
currency_rates.rate_date              CURRENT_DATE
dispatch_manifests.manifest_date      CURRENT_DATE
housekeeping_tasks.task_date          CURRENT_DATE
provider_pricing.valid_from           CURRENT_DATE
quotations.issue_date                 CURRENT_DATE
route_schedules.valid_from            CURRENT_DATE
shipping_rates.valid_from             CURRENT_DATE
transport_fares.valid_from            CURRENT_DATE
vendor_commission_rates.valid_from    CURRENT_DATE
```

Con la base en `TimeZone = UTC`, después de las 19:00 hora Colombia todas insertan **mañana**.
Nota que son 9, no 4 — la Ronda 1 solo había identificado 4.

**Qué hacer:** para cada una, eliminar el `DEFAULT CURRENT_DATE` y exigir que la app envíe el día
explícitamente (preferible: el default no conoce el `organization_id`), o sustituirlo por un trigger
`BEFORE INSERT` que use `fn_today_for_org(NEW.organization_id)` cuando el valor venga `NULL`.

Antes de quitar un default, **verifica qué código inserta en esa tabla sin pasar la columna** — si
quitas el default y hay un `INSERT` que lo omite, rompes producción. Migración + rollback, tabla por
tabla, no todas de golpe.

---

### P1-6. El provider no reacciona al cambio de organización

`src/lib/context/OrganizationTimezoneContext.tsx` lee `getOrganizationId()` una sola vez, dentro de
un `useEffect` con dependencias `[]`. En una app multi-tenant donde el usuario puede cambiar de
organización (`/auth/select-organization`), la zona horaria se queda en la de la organización anterior.

**Qué hacer:** que el efecto dependa del `organizationId` activo, tomándolo del mismo contexto/hook
que usa el resto de la app para saber la organización actual. Llama a `invalidateTimezoneCache()`
cuando corresponda.

---

## P2 — Deuda pendiente. Es el grueso del trabajo real que falta.

### P2-7. ~300 de 345 call-sites sin migrar y 372 `toISOString().split('T')[0]` intactos

La Ronda 1 migró 9 pantallas. El criterio de aceptación era
`grep -rn "toISOString().split('T')" src/` → **0 resultados**. Hoy no se cumple ni de cerca.

El bug sigue vivo en todo lo que no se tocó: reportes, dashboards, `inicio`, PMS, gym, transporte,
HRM, CRM, inventario, cuentas por pagar.

**Qué hacer:**

1. Publica primero el inventario completo, agrupado por módulo, con el conteo por archivo y una
   marca de si el valor de origen es `timestamptz` o `date`. **Consulta `information_schema.columns`
   para cada columna — no adivines.** Confundir los dos casos es exactamente lo que produjo el bug
   original.
2. Migra por módulo, un PR por módulo, en orden de impacto de negocio. Sugerido:
   POS reportes → finanzas dashboards → inicio → inventario → PMS → HRM → CRM → transporte → gym.
3. Con cada módulo migrado, amplía el alcance de la regla ESLint en `error` (ver P0-3.4).
4. Añade un test por módulo migrado, con `TZ=UTC` y `TZ=America/Bogota`.

**No hagas un find-and-replace ciego.** La decisión `timestamptz` (convertir) vs `date` (no convertir)
requiere criterio en cada punto.

---

### P2-8. El agente de impresión nunca se auditó

La Ronda 1 concluyó que `printService.ts` "no tiene call-sites de formato de fecha". Es cierto para
ese archivo, pero **el formateo sí existe** — en el agente de impresión, que quedó completamente
fuera del alcance:

`print-agent/src/printing/renderEscpos.ts:154`

```ts
function formatDateParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('es-CO'),   // <-- sin timeZone: usa el reloj del PC de la impresora
    time: d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}
```

Se usa en 7 sitios del mismo archivo (líneas 173, 260, 314, 520, 664, 799, 912) y también en
`renderHtml.ts`. Hoy imprime bien en Colombia **por accidente**, porque el PC de la impresora está en
hora colombiana. Es el papel que se lleva el cliente, así que vale la pena cerrarlo bien:
el payload debería llevar el timezone de la organización y `formatDateParts` debería recibirlo.

Audita también `print-agent/src/printing/types.ts` y `renderHtml.ts` con el mismo criterio.

---

### P2-9. Duplicación del cálculo de offset

`plainDateToInstant` en `dateDisplay.ts` reimplementa línea por línea el cálculo de offset que ya
existe en `timezone.ts` (`getOffsetMinutesForTimezone` + `offsetMinutesToISO`). Dos implementaciones
del mismo algoritmo que van a divergir con el tiempo.

Exporta las funciones de `timezone.ts` y haz que `dateDisplay.ts` las consuma. Una sola implementación.

Aprovecha para cerrar un detalle menor: existe el tipo `PlainDate` con marca (`__brand`), pero
`toPlainDate()` devuelve `string`, así que la marca no protege de nada. O la aplicas de verdad en las
firmas, o la quitas.

---

## Criterios de aceptación de esta ronda

- [ ] `select public.fn_today_for_org(:org)` y `getOrganizationTimezone(:org)` en TS devuelven la
      **misma** zona horaria para toda organización, leída de la fuente de verdad canónica.
- [ ] Cambiar una organización a `America/Mexico_City` cambia sus fechas en UI y en SQL, y no afecta
      a las demás.
- [ ] Un timezone inválido en la configuración **no** rompe ningún INSERT — cae al default.
- [ ] Existe archivo de migración + rollback en el repo para cada objeto SQL creado o modificado,
      y aparece en `list_migrations`.
- [ ] `node -e "JSON.parse(require('fs').readFileSync('.eslintrc.json','utf8'))"` sale sin error,
      y `npm run lint` aplica las reglas.
- [ ] Ninguna columna conserva `DEFAULT CURRENT_DATE`, o cada una que lo conserve tiene justificación
      escrita.
- [ ] El inventario completo de los 372 call-sites está publicado, con el plan por módulo.
- [ ] `npm run test:tz-all` pasa.
- [ ] Cero `UPDATE` sobre datos históricos de fechas. Siguen siendo correctos.

---

## Reglas de trabajo

1. **No marques una fase como completa si no lo está.** En la Ronda 1 se declararon completas tres
   fases que no lo estaban (Fase 5, Fase 6 y el criterio de aceptación de la Fase 4). Si algo queda
   a medias, dilo explícitamente y deja el pendiente escrito.
2. **Verifica antes de afirmar.** Cada "está hecho" debe venir con el comando o la consulta que lo
   demuestra. "Los tests pasan" no demuestra que el `grep` devuelva 0.
3. **Todo DDL por `apply_migration` con archivo en el repo.** Nunca `execute_sql`.
4. **Un PR por punto.** P0-1, P0-2 y P0-3 son independientes entre sí y se pueden revisar por separado.
5. Si un hallazgo contradice este documento, dilo — el documento se escribió con la información
   disponible el 2026-09-11 y puede estar desactualizado.
