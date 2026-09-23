# Zonas horarias multi-país — bitácora

> Para quien llega nuevo: el objetivo es que la fecha y la hora que ve, guarda e imprime cada
> organización sean las de su propio país, sin depender del navegador, del servidor ni de la
> impresora. Hoy las 85 organizaciones están en `America/Bogota`, así que casi todos los errores
> son invisibles: el fallback acierta por casualidad. Esto los cierra antes de que entre un
> cliente en México, España o Chile.
>
> Documento de misión: prompt del dueño (2026-09-23). Reglas vigentes: `docs/reglas-fechas-timezone.md`.

## Línea base — 2026-09-23, HEAD `db6511d5`

| Métrica | Valor medido | Comando/consulta |
|---|---|---|
| Escritura de día en UTC (`toISOString().split('T')` / `.slice(0,10)`) | **291** | `grep -rn "toISOString()\.split('T')\|toISOString()\.slice(0, *10)" src --include=*.ts --include=*.tsx \| wc -l` |
| Formateo sin `timeZone` (`toLocaleDateString`/`toLocaleTimeString`) | **156** | `grep -rn "toLocaleDateString(\|toLocaleTimeString(" src ... \| grep -v timeZone \| wc -l` |
| `parseLocalDate` (helper deprecado) | **68** | `grep -rn "parseLocalDate" src ... \| wc -l` |
| Imports de `formatDate`/`parseLocalDate` desde `@/utils/Utils` | **60** | `grep -rn "from '@/utils/Utils'" src ... \| grep -c "formatDate\|parseLocalDate"` |
| Archivos que ya usan `useFormatDate` | 83 | `grep -rln "useFormatDate" src ... \| wc -l` |
| Funciones de Postgres con `CURRENT_DATE` | **21** | `pg_proc.prosrc ~* '\mCURRENT_DATE\M'` |
| Columnas con `DEFAULT CURRENT_DATE` | **0** | `information_schema.columns` |
| Organizaciones / con zona distinta de Bogotá | 85 / **0** | `public.organizations` |
| Sucursales / columna `branches.timezone` | 90 / **no existe** | `information_schema.columns` |

Las cifras de escritura y formateo son algo menores que las del documento de misión (291 vs 309,
156 vs ~165) porque el árbol avanzó desde `70677e58`; el orden de magnitud es el mismo.

## Fases

| Fase | Estado | Cierre |
|---|---|---|
| A — Cimientos multi-país (sucursal, resolución única, DST, matriz CI, UI, observabilidad) | en curso | — |
| B — Escritura (291 ocurrencias) | pendiente | — |
| C — Presentación (156 + 68 + 60) | pendiente | — |
| D — Base de datos (21 funciones con `CURRENT_DATE`) | pendiente | — |
| E — Cierre (lint bloqueante, borrado de deprecados, inventario de opcionales, pruebas end-to-end) | pendiente | — |

## Historial

### 2026-09-23 — arranque
- Métricas de la línea base medidas y pegadas arriba.
- Creados `docs/PROGRESO-zonas-horarias.md` y `docs/adr/`.
- D1 (zona por sucursal) viene decidido por el dueño: `branches.timezone` nullable + cascada
  sucursal → organización → `America/Bogota`, con una sola función de resolución en base y cliente.

### 2026-09-23 — A1: zona horaria por sucursal en la base de datos

Migración `20260923200000_zona_horaria_por_sucursal` (aplicada por MCP; reversión en
`supabase/rollbacks/`). Decisión y alternativas descartadas en
`docs/adr/ADR-001-timezone-por-sucursal.md`.

- `branches.timezone text NULL` — NULL = «hereda de la organización». **Cero filas escritas**:
  las 90 sucursales siguen heredando y resolviendo lo mismo que antes.
- Trigger `trg_validate_branch_timezone`: una zona IANA inválida se rechaza **al escribir**
  (errcode `22023`), no al leer; se canonizan las mayúsculas; vacío → NULL. Mismo patrón que
  `trg_validate_org_timezone` (`20260915235500`). Se usa trigger y no `CHECK` porque
  `pg_timezone_names` es un catálogo y una `CHECK` exige `IMMUTABLE`.
- **Una sola función de resolución:** `fn_timezone_for(p_organization_id, p_branch_id default null)`,
  cascada sucursal → organización → (legado `organization_settings.calendar`) → `America/Bogota`.
  `STABLE`, `SECURITY DEFINER`, `search_path` fijado, y **nunca lanza**: se la llama desde triggers
  `BEFORE INSERT` y una zona mal escrita no puede tumbar una venta.
- `fn_today_for_org(integer)` pasa a ser un caso particular de ella, **misma firma** (sin `DROP`, sin
  sobrecargas) y **mismo resultado**: comparación fila a fila sobre las 85 organizaciones, 0 diferencias.
  Se añade `fn_today_for(organization_id, branch_id default null)`.
- Permisos: `REVOKE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated, service_role` en las tres.
  `fn_today_for_org` tenía `EXECUTE` para `anon`; se le retiró. `fn_today_system()` **no se tocó**: es
  el `DEFAULT` de `currency_rates.rate_date` y `provider_pricing.valid_from`, y un `DEFAULT` sí se
  comprueba contra el rol que inserta.

Hallazgo de paso: `fn_today_for_org` **no era** `SECURITY DEFINER`, así que su lectura de
`organizations` pasaba por RLS; cuando RLS ocultaba la fila devolvía el default en silencio. Invisible
mientras todos estén en Bogotá, error de un día en cuanto no lo estén. Queda cerrado.

Prueba en seco (dos `DO ... RAISE EXCEPTION 'DRYRUN'`, ambas abortadas, nada persistido): sucursal sin
override hereda · con override manda la sucursal · organización inexistente y NULL → default ·
sucursal de otro inquilino ignorada · zona inválida escrita a mano → default **sin excepción** ·
escritura inválida rechazada al escribir · `fn_today_for_org` idéntico para las 85 organizaciones.
La segunda ronda repitió la cascada con la organización en `Europe/Madrid` y la sucursal en
`Pacific/Kiritimati` para demostrar que **hereda de verdad y no acierta por coincidir con el default**:
días calendario distintos para la misma organización.

Red: `src/__tests__/timezone/zonaHorariaPorSucursal.test.ts` (25 casos, verde) — lee los `.sql` y exige
la cascada en orden, el default como último eslabón, `STABLE`/`SECURITY DEFINER`/`search_path`, que
nunca lance, el revoke a `anon`, la validación al escribir, que **no haya dos funciones de resolución**
y que no haya sobrecargas ambiguas. 9 mutaciones sobre el `.sql` real (cascada invertida, sin default,
excepción en vez de fallback, trigger borrado, grant a `anon`, resolutora duplicada, sobrecarga sin
`DROP`, `SECURITY INVOKER`, columna `NOT NULL DEFAULT`): **9 muertas, 0 supervivientes**, md5 del
archivo idéntico antes y después.

Pendiente de A1, para que nadie lo dé por hecho: **nadie escribe todavía `branches.timezone`** (no hay
UI) y **nadie llama todavía a `fn_timezone_for` desde la aplicación** — los consumidores siguen leyendo
`organizations.timezone`. La columna existe, se valida y se resuelve; enganchar la UI y el cliente es
la fase siguiente.

NO VERIFICADO: no se ejecutó `npx tsc --noEmit` completo ni `next build` (fuera del encargo).
`src/__tests__/timezone/dstEdgeCases.test.ts` falla (14 casos) — es el archivo de otro constructor que
trabaja en paralelo sobre `src/lib/utils/`, no de esta fase.

### 2026-09-23 — B0: el resolutor de zona de la capa de servicios

Cierra la tanda 0 del inventario de la Fase B. Decision y alternativas descartadas en
`docs/adr/ADR-003-como-entra-la-zona-en-los-servicios.md`: los servicios reciben **identidad**
(`organizationId`, y `branchId` cuando el dato tiene sucursal), nunca la zona ya resuelta.

Nuevo: `src/lib/services/timezoneResolver.ts`, con el contrato exacto del ADR-003:

```ts
resolveTimezone(organizationId: number, branchId?: number | null): Promise<string>
invalidateResolvedTimezone(organizationId?: number): void
```

- **No reimplementa la cascada.** Delega en `resolveTimezoneForBranch`
  (`@/lib/utils/branchTimezoneCascade`), que es el gemelo ya probado de `fn_timezone_for`, y en
  las dos lecturas cacheadas que ya existian (`getOrganizationTimezone`, `getBranchTimezones`).
  Una segunda cascada divergiria en semanas.
- **Nunca lanza**, igual que `fn_timezone_for`: se llama justo antes de guardar dinero y una
  lectura que falle por RLS no puede tumbar el guardado. El default no se cachea, para que un
  fallo puntual de red no congele la zona.
- **Sin sucursal no consulta el mapa de sucursales**: la cascada no podria dar otra cosa.
- **Invalidacion por tres caminos, y los tres hacen falta:** la llamada explicita (que limpia
  ademas los dos caches de debajo — invalidar solo la capa de arriba seria peor que no invalidar,
  porque la siguiente lectura recachearia el valor viejo como si fuera fresco), el evento
  `TIMEZONES_UPDATED_EVENT` que ya emiten `timezoneSettingsService` y `branchService`, y el
  arranque en frio. No se toco `timezoneSettingsService`: el evento ya lo cubre y ese archivo es
  de la Fase A.
- Prohibido, y no se introdujo, ningun parametro `timezone?: string` opcional nuevo.

Red: `src/__tests__/timezone/timezoneResolver.test.ts` (32 casos, verde en `TZ=UTC` y en
`TZ=America/Mexico_City`). Como se compara con la base:

1. **Datos reales leidos por MCP en solo lectura**: 40 parejas (organizacion, sucursal) con su
   `fn_timezone_for`, mas `(999999,null)`, `(null,null)`, `(2,999999)` y una sucursal de otro
   inquilino. Son honestos pero **no discriminan**: las 85 organizaciones y las 90 sucursales
   estan en `America/Bogota` y ninguna sucursal tiene override, asi que hasta una cascada
   invertida pasaria. Quedan como ancla de regresion, con la nota puesta en el propio test para
   que nadie confunda «verde» con «probado».
2. **Matriz sintetica contra un oraculo transcrito del `.sql` real** (`fnTimezoneForSQL`), con
   Madrid, Kiritimati, Mexico_City y Kathmandu para que el resultado no pueda acertar por
   coincidir con el default colombiano. Para que la transcripcion no envejezca en silencio, el
   test **lee la migracion** `20260923200000` y exige que sigan ahi los cuatro pasos en los que
   se apoya; si alguien cambia el SQL, estos casos caen.

9 mutaciones sobre el `.ts` real (cascada invertida, zona del navegador en vez de la de la
organizacion, invalidar sin limpiar la cache propia, invalidar sin bajar a los caches de debajo,
cache que ignora la sucursal, excepcion en vez de fallback, sin enganche al evento, sin consultar
el mapa de sucursales, aceptar ids inutiles como `0` o `NaN`): **9 muertas, 0 supervivientes**,
md5 del archivo identico antes y despues (`8e941fd7a86e5f95df180a2a27ca3e1f`). Script en
`tz-b012/mutaciones-tanda0.sh`.

Metrica 1 (escritura de dia en UTC), tanda 0: **292 antes / 292 despues**. El resolutor no quita
ocurrencias; es el desbloqueo de las tandas que si las quitan.

Divergencia conocida y hoy inalcanzable, para que no sorprenda: si `organizations.timezone`
tuviera un valor **presente pero ilegible**, `fn_timezone_for` devuelve el default mientras
`getOrganizationTimezone` bajaria al legado `organization_settings.calendar`. No puede pasar
porque `trg_validate_org_timezone` (migracion 20260915235500) rechaza esos valores al escribir;
el test lo deja anotado.

NO VERIFICADO: no se ejecuto `npx tsc --noEmit` completo ni `next build` (fuera del encargo);
`tsc` acotado a los dos archivos nuevos, 0 errores propios. `npx jest` completo tampoco: las
suites de `src/__tests__/timezone` traen 14 fallos de la Fase D (`CURRENT_DATE` en funciones de
Postgres) y `guardrails` 2 fallos de allow-lists de `integrations/booking` y `integrations/expedia`;
ninguno de los dos grupos toca este trabajo ni cambio con el.


### 2026-09-23 — Fase D: las funciones de Postgres dejan de decidir el dia en UTC

**Estado: cerrada.** La fila «D» de la tabla de fases sigue diciendo «pendiente» porque este
documento se anexa y no se reescribe (hay varias sesiones escribiendo a la vez); quien pase
despues puede marcarla.

Tres migraciones, aplicadas por MCP, cada una con su reversion en `supabase/rollbacks/`:

| Migracion | Grupo |
|---|---|
| `20260923210000_fase_d_dia_de_la_organizacion_en_triggers` | 7 triggers |
| `20260923210500_fase_d_dia_de_la_organizacion_en_numeracion` | 2 de numeracion de documentos |
| `20260923211000_fase_d_dia_de_la_organizacion_en_el_resto` | 5 del resto |

Todo sale de `fn_timezone_for` / `fn_today_for` / `fn_today_for_org` (fase A). **No se creo
ninguna resolucion nueva.** Se conservaron firma, volatilidad, `SECURITY DEFINER`/`INVOKER`,
`search_path`, owner y ACL de las 14 funciones: comprobado con `pg_proc` antes y despues.
Ningun `DROP`, ninguna sobrecarga, **cero `UPDATE` sobre datos historicos**, y no se toco el
`TimeZone` de la base.

#### De 21 a 7

Las 21 de la linea base se descomponen asi:

- **1 falso positivo.** `calculate_days_overdue` ya usaba `fn_today_for_org` desde una ronda
  anterior; lo que casaba con la expresion regular era su **comentario**
  «(no CURRENT_DATE que es UTC)». Reescrito el comentario, y de paso la funcion sube a
  `fn_today_for(org, branch)` porque `accounts_receivable` si tiene `branch_id`.
- **13 arregladas.**
- **7 que se quedan en UTC a proposito**, justificadas en
  `docs/adr/ADR-004-dia-utc-en-el-catalogo-global-de-tasas.md`: escriben en `currency_rates`,
  que **no tiene `organization_id`** (verificado en `information_schema.columns`). Es un
  catalogo global; darle a cada organizacion su propio dia partiria la clave `(code, rate_date)`
  en dos verdades para el mismo instante. `currency_rates.rate_date` ya tenia
  `DEFAULT fn_today_system()`, que la fase A dejo intacta por lo mismo.

**Siete es el suelo esperado, no una tarea pendiente.**

#### Que decide cada funcion y de donde sale su zona

| Funcion | Que decide el dia | Zona de | Arreglo |
|---|---|---|---|
| `calculate_days_overdue` | dias de atraso y estado de una cuenta por cobrar | `accounts_receivable.organization_id` + `.branch_id` | `fn_today_for(org, branch)` |
| `fn_ar_installments_before_save` | atraso y estado de cada cuota | la cuenta padre (`ar_installments` **no tiene** `organization_id`) | busqueda a `accounts_receivable` + `fn_today_for(org, branch)` |
| `hrm_generate_loan_installments` | fecha de la 1a cuota del prestamo | `employee_loans.organization_id` + `employments.branch_id` | `fn_today_for(org, branch)` |
| `hrm_update_loan_on_installment_payment` | `last_payment_date` del prestamo | `loan_installments` a `employee_loans` a `employments` | busqueda + `fn_today_for(org, branch)` |
| `create_employment_for_new_member` | `hire_date` del nuevo empleado | `organization_members.organization_id` + la sede que ya resolvia | `fn_today_for(org, branch)` |
| `fn_create_default_branch_and_period` | anio de los periodos fiscales | `NEW.id` (la organizacion) | `fn_today_for_org(NEW.id)` |
| `fn_create_default_org_structure` | anio del salario minimo de los cargos | `NEW.id` | `fn_today_for_org(NEW.id)` |
| `fn_get_next_invoice_number` | vigencia de la resolucion DIAN | parametros; `invoice_sequences` es por (org, sucursal) | `fn_today_for(p_org_id, p_branch_id)` |
| `fn_get_next_sale_number` | reinicio diario/mensual/anual del consecutivo | parametros; `sale_sequences` es por (org, sucursal) | `fn_timezone_for` + `fn_today_for` |
| `get_restaurant_availability` | si la fecha pedida es «hoy» y que franjas ya pasaron | `p_organization_id` + `restaurant_booking_settings.branch_id` | `fn_today_for` + `AT TIME ZONE` |
| `get_ai_tokens_usage` | corte del mes de consumo de creditos | parametro `org_id` | inicio de mes **en la zona**, no 00:00 UTC |
| `complete_invitation_registration` | `hire_date` del alta por invitacion | `invitations.organization_id` | `fn_today_for_org` |
| `fn_reschedule_overdue_tasks` | dia destino, ventana de capacidad y hora de vencimiento | `tasks.organization_id`, por tarea | `fn_today_for_org` + `AT TIME ZONE` |
| `fn_daily_task_agent` | las 21 tareas del dia | `organizations.id`, por organizacion | `fn_today_for_org` + `AT TIME ZONE` |
| **las 7 de tasas de cambio** | dia de la tasa en un catalogo global | **ninguna**: `currency_rates` no tiene organizacion | **se quedan en UTC** (ADR-004) |

#### El mismo fallo escrito de otra forma

Tres funciones no solo tenian `CURRENT_DATE`. Tambien comparaban `timestamptz` contra
`date_trunc('day', now())` —medianoche UTC— o sacaban la hora con `EXTRACT(... FROM now())`,
que en una sesion en UTC da la hora UTC. Se corrigio en el mismo sitio porque es el mismo error:

- `get_restaurant_availability` calculaba «que hora es» en UTC. Un restaurante a las 19:00 en
  Bogota calculaba las 14:00 y ofrecia como reservables mesas de hacia cinco horas.
- `fn_reschedule_overdue_tasks` reprogramaba «a las 18:00 de ese dia» = 18:00 UTC = 13:00 en
  Bogota, y contaba la carga de 8h/dia de cada responsable de medianoche UTC a medianoche UTC.
- `fn_daily_task_agent` miraba cajas abiertas, parqueaderos y eventos «de hoy» con el dia UTC.

#### Pruebas: INSERT y rollback, con la organizacion movida de huso

Todas en un `DO ... RAISE EXCEPTION` que aborta la transaccion; **nada persistido**. En el
momento de la prueba eran las 14:3x UTC del 2026-09-23, asi que `Pacific/Kiritimati` (UTC+14)
ya estaba en el **24** y `Pacific/Niue` (UTC-11) y `America/Bogota` en el **23**. Sin ese
desplazamiento la prueba habria acertado por casualidad, porque las 85 organizaciones estan en
Bogota.

Grupo 1 — organizacion de prueba en `Pacific/Kiritimati`, misma sonda antes y despues:

| Senal | Antes | Despues | Control en `Pacific/Niue` |
|---|---|---|---|
| cuenta por cobrar que vence el dia UTC, `days_overdue` | 1 (ya correcta) | 1, estado `overdue` | 0 |
| cuota con el mismo vencimiento, `days_overdue` | **0**, sigue `pending` | **1**, pasa a `overdue` | 0 |
| `employments.hire_date` del nuevo miembro | **2026-09-23** | **2026-09-24** | — |
| 1a cuota del prestamo sin `first_payment_date` | **2026-10-23** | **2026-10-24** | — |
| `employee_loans.last_payment_date` | **2026-09-23** | **2026-09-24** | — |

Grupo 2 — el mas caro de los dos defectos:

| Senal | Antes | Despues |
|---|---|---|
| resolucion DIAN con `valid_from` = hoy-de-la-org | **`No existe secuencia fiscal activa y vigente`** | `FE1` |
| resolucion con `valid_from` = manana (control) | rechazada | rechazada, correcto |
| consecutivo diario desde 42, con el dia del negocio ya cambiado | **`V-000043`** (no reinicio) | **`V-000001`** |

Cuatro controles mas sobre el consecutivo, todos correctos despues: reinicio hace un minuto,
`V-000043` (no reinicia); sin `reset_period`, `T-000100`; `reset_period='daily'` con
`last_reset_at` NULL, `N-000008` (no revienta ni reinicia); reinicio anual de hace un ano,
`A-000001`. Y con una sucursal en `Pacific/Niue` dentro de una organizacion en
`Pacific/Kiritimati`, `fn_today_for` devolvio dias distintos: la cascada llega hasta la sede.

Grupo 3:

| Senal | Antes | Despues |
|---|---|---|
| agenda de restaurante, org en `Asia/Tokyo` a las 23:36 locales, dia de hoy | **7 franjas ofrecidas** | **0** |
| la misma, dia de manana (control) | 11 | 11 |
| creditos IA de un consumo del dia 1 del mes en hora local | **0** | **777** |
| el mismo tras anadir un consumo de hace 5 dias del mes pasado (control) | — | **777** |
| `complete_invitation_registration`, `hire_date` | — | `success: true`, **2026-09-24** |
| `fn_daily_task_agent`, contrato que vence el dia 30 contado desde el dia de la org | **0 tareas** | **1 tarea** |
| `fn_reschedule_overdue_tasks`, hora local del nuevo vencimiento | 18:00 **UTC** = 08:00 local | **18:00 locales** (`2026-09-25 04:00+00`) |

`fn_daily_task_agent()` completo, recorriendo las organizaciones activas, tarda **0,94 s**.

#### Criterio 6 — `pg_proc.prosrc` contra la expresion de `CURRENT_DATE`, salida real

```
auto_generate_missing_rates     |
fill_historical_rates_real_api  |
fill_missing_currency_dates     |
insert_fallback_rates           |
save_exchange_rates             | org_id integer, base_currency_id uuid, rates jsonb, source text
save_exchange_rates             | org_id integer, base_currency_id uuid, rates jsonb, source text, api_timestamp bigint
update_global_exchange_rates    | rates jsonb, source text, api_timestamp bigint, rate_date text, base_currency_code text
```

**21 a 7**, y las 7 son exactamente las del ADR-004.

#### Criterio 7 — `information_schema.columns` con `column_default ilike '%CURRENT_DATE%'`

```
(0 filas)
```

#### Red

`src/__tests__/timezone/diaDeLaOrganizacionEnPostgres.test.ts` — **113 casos, verde**. Lee los
`.sql` y exige, sobre la ultima definicion vigente de cada una de las 14 funciones: que no
conserve `CURRENT_DATE`, que resuelva con las funciones de la fase A, que las que tienen
sucursal a mano usen la **forma de dos argumentos**, que conserven firma exacta y modo de
seguridad, que no vuelvan a `date_trunc('day', now())`, que las 18:00 sean locales, que cada
migracion tenga reversion **real** (que devuelva `CURRENT_DATE`, no un archivo vacio), que
ninguna lleve `DROP FUNCTION` ni `UPDATE`/`DELETE` de primer nivel, que no se toque
`fn_today_system`, y que el ADR-004 **nombre una por una** las 7 de tasas. La lista de las 7 es
una **lista blanca cerrada**: una octava funcion con `CURRENT_DATE` no esta cubierta.

Reutiliza `sqlDeMigraciones` y `definiciones` del test de la fase A en vez de copiarlos.

13 mutaciones sobre los `.sql` y el `.md` **reales** (`CURRENT_DATE` reintroducido en un trigger;
perder la sucursal y quedarse en la organizacion; el anio fiscal de vuelta a UTC; cambiar
`INVOKER` a `DEFINER`; la vigencia DIAN de vuelta a UTC; renombrar un parametro para crear una
sobrecarga; el consecutivo perdiendo la sucursal; las 18:00 de vuelta a UTC; el agente diario de
vuelta a medianoche UTC; quitar `SECURITY DEFINER`; vaciar una reversion; borrar el ADR;
reescribir una funcion de tasas dentro de la fase): **13 muertas, 0 supervivientes**. md5 de los
cinco archivos identico antes y despues, restauracion verificada y test verde al final. Script en
`tz-d/mutaciones.py`.

#### Hallazgos de paso

1. **`fn_notify_shift_assigned` esta rota hoy, en produccion.** Al intentar insertar en
   `shift_assignments` para la prueba:
   `ERROR 42703: column e.organization_id does not exist`. El trigger hace
   `SELECT e.organization_id ... FROM employments e LEFT JOIN organization_members om ON
   om.organization_id = e.organization_id`, y `employments` **no tiene** `organization_id`: la
   organizacion esta en `organization_members`. **Nadie puede crear un turno.** Es exactamente
   la clase de fallo que la regla dura 3 previene. Fuera del alcance de esta fase; queda
   anotado para que alguien lo tome.
2. **Permisos: dos funciones perdieron `anon` y `PUBLIC` mientras se trabajaba, y no fue esta
   fase.** `get_restaurant_availability` y `complete_invitation_registration` pasaron de
   `{=X, postgres, anon, authenticated, service_role}` a `{postgres, authenticated,
   service_role}`. Lo hicieron las migraciones `gosec_lote5_lectura_abierta` y
   `gosec_lote7_funciones_anon` de otra sesion, que corrieron entre los grupos 2 y 3.
   Comprobado: `save_exchange_rates`, que esta fase **no toca**, tambien lo perdio, y de las 429
   funciones `SECURITY DEFINER` solo quedan 16 con `anon`. `CREATE OR REPLACE` conserva la ACL
   —los grupos 1 y 2 la conservaron intacta— asi que no es efecto de este trabajo.
3. **`fn_get_next_invoice_number` y `fn_get_next_sale_number` son `SECURITY INVOKER` y siguen
   con `EXECUTE` para `anon`, pero ahora llaman a `fn_today_for`, que no lo tiene.** Un `anon`
   que las invocara fallaria con permiso denegado antes de llegar al `UPDATE`. No es una
   regresion practica: ninguna politica RLS de `sale_sequences` ni de `invoice_sequences`
   concede a `anon` (0 politicas para ese rol), asi que ese camino ya estaba cerrado; y el mismo
   patron lo estreno `calculate_days_overdue` en una ronda anterior. Ningun codigo de `src/` ni
   de `goadmin-websites` llama a estas dos funciones: solo aparecen en el baseline del esquema.

#### NO VERIFICADO

- No se ejecuto `npx tsc --noEmit` completo ni `next build`: fuera del encargo.
- `fn_create_default_branch_and_period` y `fn_create_default_org_structure` **no se pudieron
  distinguir por resultado**: solo deciden un *anio*, y el 23 de septiembre el anio es 2026 en
  los dos husos. La sonda lo deja registrado (`anioUTC=2026 anioORG=2026`). La diferencia solo
  se ve alrededor del 31 de diciembre. Se verificaron por forma (el test) y por ejecucion real
  del trigger dentro de la transaccion abortada.
- `fn_daily_task_agent` se comprobo end-to-end con **una** de sus 21 senales (contratos por
  vencer). Las otras veinte se cambiaron de forma mecanica y estan cubiertas por el test
  estatico, no por una sonda propia.
- `npx jest` completo no se ejecuto. Si se ejecutaron `src/__tests__/timezone` (10 suites) y
  `guardrails`: **360 pasan, 2 fallan**, los dos de allow-lists obsoletas de
  `integrations/booking` e `integrations/expedia` y de imports de `@/lib/supabase/config`.
  Ficheros que esta fase no abrio; ya estaban anotados como ajenos en la entrada anterior de
  este documento. Los 14 fallos de la fase D que menciona esa entrada eran este test en un
  estado intermedio: ahora esta verde.
- Los efectos se comprobaron con organizaciones creadas dentro de transacciones abortadas. **No
  se toco ni una fila de datos de clientes.**

### 2026-09-23 - cierre de fase A (auditoria + lo que faltaba de UI)

Ronda de cierre sobre A1 (base de datos), A2 (DST y matriz) y A3 (cliente).
**No se rehizo nada: se audito, y la auditoria encontro cosas.**

#### Lo que estaba mal

**1. La cascada del cliente y `fn_timezone_for` NO decian lo mismo.** Es el
fallo grave de la ronda. `resolveTimezoneCascade` trataba una zona ilegible
como «este nivel no aporta» y bajaba al siguiente; la funcion de la base, no.
Su paso 2 solo consulta la organizacion cuando la sucursal no aporto **nada**:

```sql
if v_tz is null or btrim(v_tz) = '' then   -- una zona rota NO entra aqui
  select o.timezone into v_tz ...
...
begin v_prueba := (now() at time zone v_tz)::date;
exception when others then return 'America/Bogota'; end;
```

Con `branches.timezone = 'Marte/Olympus'` y `organizations.timezone =
'Europe/Madrid'`, el navegador mostraba Madrid y la base escribia el dia de
Bogota: **el mismo dato con dos dias distintos segun quien lo calculara**, que
es exactamente el bug que esta fase existe para cerrar.

Manda la base, porque ademas es lo decidido y razonado en ADR-001 («un solo
modo de fallo, reconocible»). Corregido `branchTimezoneCascade.ts`: un valor
presente pero ilegible corta la cascada y devuelve el default.

**2. El test que debia detectarlo daba el visto bueno.**
`branchTimezoneCascade.test.ts` comparaba el cliente contra un doble escrito a
mano (`limpio(branch) ?? limpio(org) ?? default`) que **no era** lo que hace el
SQL, y su comentario decia «si la fase A1 cambia la funcion, este doble cambia
con ella» sin que nada lo obligara. Reescrito el doble a partir del cuerpo
real, y anadidas tres aserciones que leen
`supabase/migrations/20260923200000_zona_horaria_por_sucursal.sql` y caen si
alguien reescribe `fn_timezone_for` como un `coalesce` de niveles validos.
Contrastado ademas contra la funcion **real** por MCP (mas abajo).

**3. `npm run test:tz-all` no corria las seis zonas.** Sus dos primeras patas
(`test:tz-utc`, `test:tz-bogota`) invocaban `jest` **sin ruta**, es decir la
suite completa (514 ficheros, ~10 min) y, como la suite tiene rojos
preexistentes ajenos, el `&&` abortaba ahi: **Mexico, Madrid, Santiago y
Katmandu no llegaban a ejecutarse nunca**. El workflow de CI si estaba bien (su
job de zonas usa `npm run test:tz`); lo que no coincidia era el script local y
lo que dice ADR-002 seccion 6. Las seis patas usan ahora `test:tz`; la suite
completa en dos zonas queda en `test:full-utc` / `test:full-bogota`, que es lo
que el job informativo de CI ya hacia con `npx jest`.

**4. Dos politicas de aviso de fallback (D7).** `OrganizationTimezoneContext`
tenia su propio `Set` y su propio texto, con un comentario que decia
«sustituir por el reportador compartido cuando exista». Existe desde A2
(`timezoneFallback.ts`), y ADR-002 seccion 5 dejo el enganche pendiente «para
quien cierre A3». Enganchado: el contexto llama a
`avisarResolucionZonaHoraria`, una sola politica, una vez por clave y con miga
de Sentry. Tambien se unifico `isUsableTimezone`, implementado dos veces (en la
cascada y dentro de `resolverZonaHoraria`): vive ahora en `dateCore.ts`.

**5. No habia forma de fijar la zona de la organizacion sin el modulo de
calendario.** `organizations.timezone` solo se editaba en Configuracion ->
Calendario, cuyo `moduleCode` es `calendar` y por tanto depende del plan
(`configModulesRegistry`). Una organizacion sin ese modulo -una tienda de
calzado con POS e inventario- **no tenia ninguna pantalla** para cambiar su
zona: se quedaba con el default y todas sus fechas salian en hora de Bogota,
que es justo el escenario que la fase queria cerrar.

#### Lo que se completo

- **`OrganizationTimezoneCard`**, montada en Configuracion -> General (panel
  `isCore: true`) y en `/app/organizacion/informacion`. Dice que hora es con la
  zona elegida **antes** de guardar.
- **`PUT /api/organization/timezone`** (`withOrg(..., { admin: true })`):
  **unico** escritor de `organizations.timezone` y `branches.timezone` con
  permiso comprobado en servidor por id de rol y organizacion de la sesion
  (reglas duras 5 y 6). La sucursal se comprueba por pertenencia -> 404. Antes
  cada pantalla hacia su `supabase.from(...).update({ timezone })` desde el
  navegador y el permiso lo decidia un booleano de React mas RLS.
  `useCalendarSettings` y `branchService.updateBranch` pasan ahora por ahi;
  `createBranch` mantiene la columna en el INSERT porque la sucursal todavia no
  tiene id (documentado en el codigo).
- **Invalidacion de cache en los dos niveles**, con red: el escritor invalida
  organizacion y sucursales y emite `TIMEZONES_UPDATED_EVENT`, y **no invalida
  nada si el servidor rechazo** (el `throw` va antes; hay un test que fija ese
  orden). La invalidacion del contexto paso de `require()` a import estatico
  **sincrono**: con un `import()` dinamico, `setOrgVersion` disparaba la
  recarga y podia leerse la cache vieja antes de que llegara el modulo.
- **Catalogo de zonas** movido a `src/lib/utils/timezoneCatalog.ts`: la ficha de
  sucursal y la pantalla General son de nucleo y estaban importando de la
  carpeta del modulo de calendario. `types.ts` lo reexporta.
- Tests nuevos: `timezoneSettingsService.test.ts` (7),
  `src/app/api/organization/timezone/__tests__/timezoneRoute.test.ts` (15), y
  `timezoneForContract.test.ts` ampliado a 25.

#### Contraste contra la funcion real (MCP, prueba en seco)

`DO ... RAISE EXCEPTION 'DRYRUN'`: se escribieron zonas en la organizacion 2 y
su sucursal 2, se llamo a `fn_timezone_for` y se aborto. Comprobado despues:
`sucursales_con_zona = 0`, `orgs_fuera_de_bogota = 0`. **Nada persistio.**

```
c1  branch=Europe/Madrid  org=America/Bogota       -> Europe/Madrid
c1b fn_today_for(2,2)=2026-09-23  fn_today_for_org(2)=2026-09-23
c2  branch=null           org=America/Mexico_City  -> America/Mexico_City
c3  branch='   ' (blanco) org=America/Mexico_City  -> America/Mexico_City
c4  fn_timezone_for(999999, 2)  organizacion ajena -> America/Bogota
c5  sin sucursal          org=America/Mexico_City  -> America/Mexico_City
c6  branch=null           org=Europe/Madrid        -> Europe/Madrid
c7  sucursal inexistente  org=Europe/Madrid        -> Europe/Madrid
```

Coincide con el cliente en los ocho casos **despues** de la correccion del
punto 1; antes, el caso «zona rota en la sucursal» discrepaba.

#### Verificacion en navegador

Arnes `src/app/auth/verify-tz-cierre/page.tsx` sobre `dev-3002` (reutilizado),
datos dobles, sin sesion; **borrado al terminar**, junto con
`.next/types/app/auth/verify-tz-cierre`. Detalle en
`tz-a-cierre/VERIFICACION.md`.

- (i) Venta con `branch_id` de la sucursal en `Europe/Madrid`: se muestra
  `16/01/2026 05:30` **con el selector de la barra en Bogota y tambien en
  Madrid**. Con la zona de la organizacion seria `15/01/2026 23:30`: dia
  distinto. La zona sale del dato.
- (ii) El campo de sucursal trae `Heredar de la organizacion (America/Bogota)`
  como primera opcion y seleccionada; su valor es la cadena vacia, que se
  guarda como `null`. El texto de ayuda dice que zona se aplica y de donde
  viene, y cambia a «propia de la sucursal» al elegir Madrid.
- (iii) 375 px: sin desbordamiento horizontal (`scrollWidth == innerWidth`),
  selector y boton apilados a ancho completo.

#### Metricas del criterio 3, recalculadas con los comandos tal cual

| Metrica | Linea base | Ahora |
|---|---|---|
| Escritura de dia en UTC | 291 | **292** |
| Formateo sin `timeZone` | 156 | **156** |
| `parseLocalDate` | 68 | **68** |
| Imports de `formatDate`/`parseLocalDate` desde `@/utils/Utils` | 60 | **60** |
| Archivos que usan `useFormatDate` | 83 | **84** |

Comandos, tal cual se ejecutaron (copia en `tz-a-cierre/metricas.txt`):

```bash
grep -rn "toISOString()\.split('T')\|toISOString()\.slice(0, *10)" src --include=*.ts --include=*.tsx | wc -l
grep -rn "toLocaleDateString(\|toLocaleTimeString(" src --include=*.ts --include=*.tsx | grep -v timeZone | wc -l
grep -rn "parseLocalDate" src --include=*.ts --include=*.tsx | wc -l
grep -rn "from '@/utils/Utils'" src --include=*.ts --include=*.tsx | grep -c "formatDate\|parseLocalDate"
grep -rln "useFormatDate" src --include=*.ts --include=*.tsx | wc -l
```

La fase A es de cimientos, no de migracion: que las cuatro primeras no bajen es
lo esperado (bajarlas es B y C). El +1 de la primera y el +1 de la ultima salen
de archivos nuevos de esta ronda y de las sesiones en paralelo, no de una
regresion: ningun archivo de esta fase usa `toISOString().split('T')`.

#### Salidas reales

**`npx tsc --noEmit -p tsconfig.json`** con `NODE_OPTIONS=--max-old-space-size=8192`:

```
exit=0
```

Cero errores y sin salida. No es un falso cero por OOM (un OOM sale con codigo
distinto de 0 y mensaje de heap). Para llegar aqui hubo que borrar
`tsconfig.tsbuildinfo`: con `incremental: true` estaba obsoleto y `tsc` fallaba
con `TS6053: File '.next-build-rls/types/app/app/organizacion/informacion/page.ts'
not found` por ficheros de un build viejo.

**`npx eslint`** sobre los 20 archivos tocados: salida **vacia**, 0 problemas.
Antes de arreglarlos habia 6 errores propios: dos `prefer-const` en
`branchService`, dos `no-require-imports` en el contexto y dos en el test de la
ruta.

**`npm run test:tz-all`** (las seis zonas, cada pata lanzada por separado para
que el `&&` no oculte las cuatro ultimas):

```
########## TZ=UTC ##########
FAIL src/__tests__/timezone/diaDeLaOrganizacionEnPostgres.test.ts (16.301 s)
FAIL src/__tests__/guardrails.test.ts (108.228 s)
Test Suites: 2 failed, 8 passed, 10 total
Tests:       5 failed, 357 passed, 362 total
########## TZ=America/Bogota ##########
FAIL src/__tests__/timezone/diaDeLaOrganizacionEnPostgres.test.ts (24.195 s)
FAIL src/__tests__/guardrails.test.ts (63.74 s)
Test Suites: 2 failed, 8 passed, 10 total
Tests:       3 failed, 359 passed, 362 total
########## TZ=America/Mexico_City ##########
FAIL src/__tests__/timezone/diaDeLaOrganizacionEnPostgres.test.ts (14.639 s)
FAIL src/__tests__/guardrails.test.ts (43.959 s)
Test Suites: 2 failed, 8 passed, 10 total
Tests:       3 failed, 359 passed, 362 total
########## TZ=Europe/Madrid ##########
FAIL src/__tests__/timezone/diaDeLaOrganizacionEnPostgres.test.ts (14.458 s)
FAIL src/__tests__/guardrails.test.ts (44.037 s)
Test Suites: 2 failed, 8 passed, 10 total
Tests:       3 failed, 359 passed, 362 total
########## TZ=America/Santiago ##########
FAIL src/__tests__/guardrails.test.ts (61.613 s)
Test Suites: 1 failed, 9 passed, 10 total
Tests:       2 failed, 360 passed, 362 total
########## TZ=Asia/Kathmandu ##########
FAIL src/__tests__/guardrails.test.ts (58.595 s)
Test Suites: 1 failed, 9 passed, 10 total
Tests:       2 failed, 360 passed, 362 total
```

Los dos ficheros que fallan son de otras sesiones (ver abajo); **las ocho
suites restantes, incluidas todas las de esta fase, estan en verde en las seis
zonas**.

**`npx jest src/__tests__/timezone src/lib/utils/__tests__ src/lib/context/__tests__
src/__tests__/guardrails.test.ts`** (mas los dos ficheros nuevos de servicios y
la ruta):

```
Test Suites: 3 failed, 15 passed, 18 total
Tests:       5 failed, 463 passed, 468 total
```

Los 5 fallos son los mismos dos ficheros ajenos mas `timezoneResolver.test.ts`,
que **pasa en verde por separado** (32/32): se estaba escribiendo mientras
corria la suite.

Copias integras en `tz-a-cierre/`: `salida-tsc.txt`, `salida-eslint.txt`,
`salida-seis-zonas.txt`, `salida-jest-dirigido.txt`, `metricas.txt`,
`VERIFICACION.md`.

#### Rojos que NO son de esta fase

Tres sesiones trabajan en paralelo sobre el mismo arbol (fase D en la base,
ADR-004 del resolutor de servicios, y una migracion de rutas de integraciones).
Sus archivos aparecieron **durante** esta ronda:

- `guardrails.test.ts`, 2 tests: «la allow-list no contiene entradas obsoletas»
  lista `dian`, `factus`, `stripe`, `booking`, `expedia`. Esas ~30 rutas se
  migraron hoy entre las 09:25 y las 09:39, despues de que la primera ejecucion
  de esta ronda diera guardrails **en verde** (14 suites, 289 tests). Es
  limpieza de quien las migro: quitar sus entradas mientras siguen en vuelo
  seria pisarles el trabajo.
- `src/__tests__/timezone/diaDeLaOrganizacionEnPostgres.test.ts` (fase D, creado
  a las 10:02) y `timezoneResolver.test.ts` (ADR-004, 10:04): el segundo pasa en
  verde por separado; el primero consulta la base real y es sensible a lo que la
  otra sesion este aplicando en ese momento.
- Preexistentes ya inventariados: `sectionContract` (F2.6 del editor web),
  latencia de `pos-display`, `svixReal`.

#### Deuda que deja esta ronda

- `tsconfig.json` llega modificado en el arbol de trabajo por una compilacion
  ajena: anade `.next-build-rls/types/**/*.ts` y reformatea el archivo entero.
  No es de esta fase; conviene decidir si se revierte antes del commit.
- `branchService.updateBranch` llama a la ruta de zona en **cada** guardado de
  sucursal, aunque la zona no haya cambiado, porque el formulario siempre envia
  el campo. Es una peticion de mas por guardado; evitarla exige que el
  formulario sepa el valor original.
- Sigue pendiente lo que ADR-001 dejo anotado: el fallback legado a
  `organization_settings` dentro de `fn_timezone_for` (retirarlo es fase E).

#### Que sigue

Fase B (las 292 escrituras de dia en UTC) y fase C (156 + 68 + 60 de
presentacion). Las dos tienen ya a que llamar: `todayInTz` / `toPlainDate` /
`plainDateToInstant` en el cliente y `fn_timezone_for` / `fn_today_for` en la
base, con la garantia -ahora si comprobada- de que ambos dan el mismo dia.

#### Addendum (misma ronda, minutos despues): ya hay una octava

Al repetir la consulta del criterio 6 para el informe final aparecio
`fn_emitir_acciones(p_subscription_id uuid, p_admin_user_id uuid, p_referencia_tecleada text)`,
que **no existia** cuando empezo esta fase: la creo otra sesion en paralelo. Usa `current_date`
en dos sitios, y en los dos decide un dia contable:

```
if not public.fn_is_period_open(v_org, current_date) then
...
current_date, v_cert, v_sub.id, 'Emision por suscripcion ' || v_sub.payment_reference, ...
```

Tiene la organizacion a mano (`v_org`), asi que le corresponde `fn_today_for_org(v_org)`.
**No se toca aqui**: pertenece al trabajo en vuelo de otra sesion y reescribirla ahora provocaria
que una de las dos migraciones pise a la otra. Queda anotada.

Por eso el criterio 6 da **8** en el momento de cerrar, no 7: las 7 del ADR-004 mas esta. El
suelo sigue siendo 7.

Leccion para la fase E: la consulta `pg_proc.prosrc ~* '\mCURRENT_DATE\M'` **tiene que estar en
CI**, no ejecutarse una vez. Un test que lee los `.sql` del repositorio no ve una funcion que
otra sesion aplica por MCP; solo una comprobacion contra la base viva la detecta.

### 2026-09-23 - B1: contabilidad y periodos contables/fiscales

Tanda 1 del inventario de la Fase B (P0). 11 archivos, escritura y presentacion en el MISMO
cambio, porque `journal_entries.entry_date` es **timestamptz** (verificado por MCP en
`information_schema.columns`) y arreglar un solo lado corre la fecha un dia en produccion.

Tabla de decisiones (call-site -> tipo real de la columna -> arreglo):

| Sitio | Columna - tipo | Arreglo |
|---|---|---|
| `PeriodosFiscalesService.generarPeriodosMensuales` | `fiscal_periods.start_date`/`.end_date` - **date** | `rangoDelMes(year, mes)` |
| `PeriodosContablesService.generarPeriodosAnuales` | idem | `rangoDelMes` |
| `PeriodosContablesPage.handleCreatePeriodo` | idem (via servicio) | `rangoDelMes` |
| `AsientosPage` formulario y `resetForm` | `journal_entries.entry_date` - **timestamptz** | `getToday()` de la zona de la sucursal |
| `AsientosPage.handleSave` | idem | `toInstant(dia)` = `plainDateToInstant` |
| `AsientosPage` lista + `AsientoDetailPage` | idem (lectura) | `formatDate` / `useFormatDateFor(asiento.branch_id)` |
| `ContabilidadService.crearAsiento` (tasa del dia) | `currency_rates.rate_date` - date | `toPlainDate(instante, tz)` en vez de `.split('T')[0]` |
| `ContabilidadService.duplicarAsiento` | `entry_date` - timestamptz | `plainDateToInstant(todayInTz(tz), tz)` |
| `ReportesContablesService.getTrialBalance` / `.getIncomeStatement` / `.getLedger` | filtro sobre `entry_date` - timestamptz | `getDateRange(desde, hasta, tz)` |
| `ReportesContablesService.getBalanceSheet` | corte sobre `entry_date` - timestamptz | `getDayRange(asOfDate, tz).end` |
| `BalanceComprobacionPage`, `BalanceGeneralPage`, `EstadoResultadosPage`, `MayorContablePage` | dias por defecto | `getToday()` + `primerDiaDelMesDe` / `primerDiaDelAnioDe` |
| `MayorContablePage` (columna Fecha) | `entry_date` - timestamptz (lectura) | `formatDate` |
| `ActivosFijosPage` | `fixed_assets.acquisition_date` - **date** | `getToday()` |

Dos decisiones que merece la pena escribir:

1. **Los limites de un mes no necesitan zona horaria; necesitan no pasar por un `Date` local.**
   `new Date(year, i, 1).toISOString().split('T')[0]` es medianoche del NAVEGADOR leida en UTC:
   con offset positivo (Madrid, +01:00) el periodo de enero empezaba el **31 de diciembre**. Con
   offset negativo (Bogota, Mexico) acertaba por casualidad, y por eso llevaba años invisible.
   Nuevo `src/lib/services/fiscalCalendar.ts`: aritmetica de cadena, el unico `Date` que aparece
   es `Date.UTC` para contar los dias del mes. El test lo demuestra reproduciendo la version
   vieja a cinco offsets distintos.
2. **Los dias por defecto de las pantallas se ponen cuando el contexto ya sabe la zona.**
   `OrganizationTimezoneContext` arranca en `America/Bogota` y solo despues resuelve la real, asi
   que calcular «hoy» en el primer render daria Bogota para todas las organizaciones. Todas las
   pantallas de la tanda esperan a `!isLoading` con una guarda `useRef` para no recargar en cada
   pulsacion del selector de fechas.

La conversion a instantes vive en el SERVICIO, no en las pantallas: `ReportesContablesService`
resuelve la zona con `resolveTimezone(organizationId)` (tanda 0, ADR-003) y convierte los
extremos. Cuatro metodos, cuatro resoluciones; las pantallas solo mandan dias calendario.

Red: `src/__tests__/timezone/contabilidadPeriodos.test.ts` (29 casos, verde en `TZ=UTC`,
`TZ=America/Mexico_City` y `TZ=Europe/Madrid`). Cubre los limites de mes y año (bisiestos, 2000
vs 2100), «hoy» con reloj falso a las 00:30 de Madrid (UTC sigue en el dia anterior) y a las
23:30 de Bogota (UTC ya esta en el siguiente), la ida y vuelta de `entry_date` en cuatro zonas y
cruzando el cambio de horario de Madrid, y guardas estaticas sobre los 11 archivos.

10 mutaciones sobre los `.ts`/`.tsx` reales (vuelta al `Date` local + `toISOString`, ultimo dia
del mes = primero del siguiente, sin `padStart`, asiento guardado como `'YYYY-MM-DD'` en una
columna timestamptz, lista y detalle del asiento con la zona del navegador, filtro y corte de los
informes contra el dia suelto, dia de la tasa por `.split('T')[0]`, y dia por defecto calculado
antes de conocer la zona): **10 muertas, 0 supervivientes**, md5 de los 8 archivos identico antes
y despues. Scripts en `tz-b012/mutaciones-tanda1.sh` y `tz-b012/mutar.py`.

Metrica 1 (escritura de dia en UTC): **292 antes / 281 despues**. En los archivos de la tanda:
17 -> 0. La diferencia con el −17 puro: los tests nuevos reproducen el patron viejo a proposito
5 veces (para demostrar que fallaba), y el arbol es compartido con otras sesiones, que movieron
el contador en +1 mientras corria esta tanda.

Quedan 2 ocurrencias en `ReportesContablesService.getExchangeRate` (lineas 85 y 88): son el
catalogo global `currency_rates`, sin `organization_id`. Es la decision de diseño del §5 del
inventario y pertenece a la tanda 10; no se toca aqui.

De paso, en los archivos tocados: se quitaron importaciones y variables sin usar y se tiparon las
16 filas `any` de `ReportesContablesService` (`FilaCuenta`, `FilaAsiento`, `FilaLinea`). Quedan
solo dos avisos `react-hooks/exhaustive-deps` preexistentes.

NO VERIFICADO: `npx tsc --noEmit` completo y `next build` siguen sin ejecutarse (fuera del
encargo); `tsc` acotado a los archivos de la tanda da 0 errores propios (el unico que sale es
`src/lib/utils/desktop.ts(237)`, de otra sesion). Tampoco se ha probado en navegador que el dia
por defecto aparezca sin parpadeo mientras el contexto resuelve la zona.

### 2026-09-23 - B2: cartera (cuentas por cobrar, por pagar y facturas)

Tanda 2 del inventario de la Fase B (P0, marcada «ida y vuelta»). 10 archivos de produccion mas
dos modulos nuevos. Escritura y presentacion en el mismo cambio, sin excepcion: aqui casi todas
las columnas que el codigo trataba como dia son **timestamptz** (verificado por MCP en
`information_schema.columns`), y los dos errores se cancelaban entre si.

Los dos errores, para que quede escrito:

- **Escritura.** `new Date(dia + 'T' + new Date().toTimeString().split(' ')[0]).toISOString()`
  compone el instante con la hora Y la zona del NAVEGADOR. Desde Madrid, un abono de una tienda
  de Bogota se guardaba siete horas antes de lo debido; en la franja de la noche, un dia entero.
  Estaba copiado en cinco sitios.
- **Lectura.** `new Date(valorDeBD).toISOString().split('T')[0]` se queda con el dia UTC del
  instante. Los `min` de los `<input type="date">` y las comparaciones contra la fecha de emision
  iban un dia corridas, y eso deshabilitaba el boton «Marcar pagada» de facturas legitimas.

Tabla de decisiones (call-site -> tipo real -> arreglo):

| Sitio | Columna - tipo | Arreglo |
|---|---|---|
| `CuentasPorCobrarService.aplicarAbono` | `payments.payment_date` - **timestamptz** | `resolveTimezone(org, branch)` + `instantForDayInTz` |
| `CuentaPorCobrarDetailService.aplicarPago` | idem | idem |
| `CuentaPorCobrarDetailService.pagarCuota` | `ar_installments.paid_at` - timestamptz | idem |
| `CuentaPorCobrarDetailService.crearCuotas` | `ar_installments.due_date` - **date** | `toPlainDate(inicio, tz)` + `sumarMesesAlDia` |
| `CuentasPorCobrarService.obtenerCuentasParaRecordatorio` | dia derivado | `todayInTz(tz)` + `sumarDiasAlDia` |
| `AplicarAbonoModal` | formulario + `accounts_receivable.due_date` (lectura) | `getToday()` + `formatDate` |
| `AccountActionsCard` | formulario, `min`/`max`, `due_date`, `last_reminder_date` | `getToday()`, `plainDayOfInstant`, `formatDate` |
| `FacturasCompraService.registrarPago` | `payments.payment_date` - timestamptz | `resolveTimezone` + `instantForDayInTz` |
| `RegistrarPagoModal` (compra) | formulario + `invoice_purchase.issue_date` | `getToday()` + `plainDayOfInstant` |
| `RegistrarPagoDialog` (venta) | `payments.payment_date` + `invoice_sales.issue_date` | `instantForDayInTz` + `plainDayOfInstant`, zona de `factura.branch_id` |
| `DetalleFactura` («marcar pagada») | idem | idem |
| `ImportarCSVDialog` | `invoice_sales.issue_date` / `.due_date` - timestamptz | dia del CSV -> `plainDateToInstant`; defecto `getToday()` + `sumarDiasAlDia(.., 30)` |
| `FacturasProximasVencer` | filtro sobre `invoice_sales.due_date` - timestamptz | `getDateRange(hoy, limite, tz)` + `diasEntreDias` |

Modulos nuevos, los dos pequeños y con una sola responsabilidad:

- `src/lib/services/businessInstant.ts` — `instantForDayInTz(dia, tz)` (dia elegido + hora de
  pared de la organizacion -> instante con su offset real, DST incluido) y `plainDayOfInstant`
  (dia de un timestamptz en esa zona, con `''` cuando el valor falta, para no romper un `min`).
- Ampliado `src/lib/services/fiscalCalendar.ts` con `sumarMesesAlDia`, `sumarDiasAlDia` y
  `diasEntreDias`.

Dos correcciones de semantica que van mas alla de la zona horaria, y que merecen revision:

1. **`sumarMesesAlDia` recorta al ultimo dia del mes.** `Date.setMonth` desborda: un plan de
   cuotas que empieza el 31 de enero ponia la segunda cuota el 3 de marzo, es decir DOS cuotas en
   marzo y ninguna en febrero. Ahora vence el 28 (o el 29). El test lo fija con un plan de 12.
2. **`diasEntreDias` cuenta dias calendario, no bloques de 24 h.** `differenceInDays` sobre dos
   instantes devuelve un dia de menos cuando el rango cruza un dia de 23 h.

Limitacion conocida, anotada en el propio archivo: `AccountActionsCard` formatea con la zona de
la ORGANIZACION y no con la de la sucursal, porque el RPC `get_account_receivable_detail` no
devuelve `branch_id` (comprobado con `pg_get_function_result`) aunque la columna exista en
`accounts_receivable`. Anadirlo al RPC es cambio de esquema y corresponde a la fase D. Mientras
tanto la cascada cae en la organizacion, que es exactamente el comportamiento de hoy.

Otro hallazgo de paso, para quien haga la tanda de nomina: `CuentasPorPagarService.crearCuotas`
ya tiene un parametro `timezone: string = DEFAULT_TIMEZONE` **opcional** — justo la forma que el
ADR-003 descarta. Ningun llamador lo rellena (los tres pasan por `CuentaPorPagarDetailService`),
asi que hoy siempre resuelve Bogota. No se toca en esta tanda; queda apuntado.

Red: `src/__tests__/timezone/carteraVencimientos.test.ts` (32 casos, verde en `TZ=UTC`,
`TZ=America/Mexico_City` y `TZ=Europe/Madrid`). Incluye el caso que pedia el encargo: con reloj
falso a las **23:30 de Madrid** el vencimiento guarda el dia de Madrid y su hora de pared (23:30),
no la del reloj UTC (22:30); y el espejo, **23:30 en Bogota**, donde UTC ya esta en el dia
siguiente. Ademas: el caso de las 00:30 de Madrid, donde el dia de la organizacion y el de UTC
caen en **años distintos**; la ida y vuelta en cinco zonas incluida una hora de pared que no
existe (29/03/2026 en Madrid); `plainDayOfInstant` con valores nulos e ilegibles; el plan de 12
cuotas desde el 31 de enero; y guardas estaticas sobre los 10 archivos.

14 mutaciones sobre los `.ts`/`.tsx` reales (instante compuesto con la hora y la zona del
navegador, dia de un timestamptz por `toISOString().split`, hora de pared tomada en UTC, suma de
meses que desborda, suma de dias en bloques de 24 h, todas las cuotas el mismo dia, y los seis
puntos de escritura/lectura de pagos y facturas devueltos al dia suelto): **14 muertas, 0
supervivientes**, md5 de los 9 archivos identico antes y despues. Scripts en el scratchpad de
sesion (`.../scratchpad/tz-b012/mutaciones-tanda2.sh` y `mutar2.py`).

La primera pasada dejo **una superviviente**: la guarda estatica comprobaba que
`instantForDayInTz(` aparecia en `cuentas-por-cobrar/id/service.ts`, y ese archivo tiene DOS
puntos de escritura; devolver uno de los dos al dia suelto pasaba desapercibido. La guarda ahora
nombra los cuatro puntos uno por uno. Es la leccion de siempre: una guarda «contiene el helper»
no prueba que el helper se use donde hace falta.

Metrica 1 (escritura de dia en UTC): **281 antes / 256 despues**. En los archivos de la tanda:
30 -> 0. La diferencia con el −30: el test nuevo reproduce el patron viejo a proposito 4 veces, y
el arbol es compartido (otras sesiones movieron el contador en +1 durante la tanda).

Quedan en estos modulos 3 ocurrencias, todas nombres de archivo de descarga (`AgingReport`,
`CuentasPorCobrarFiltros`, `CuentaPorCobrarDetailPage`): son P3 y pertenecen a las tandas 12 y 13.

NO VERIFICADO: `npx tsc --noEmit` completo y `next build` siguen sin ejecutarse (fuera del
encargo); `tsc` acotado a los arboles de cartera y facturas da 0 errores propios (solo salen
`src/lib/utils/desktop.ts(237)` y `src/lib/pos/display/desktopChannel.ts(49)`, de otras sesiones).
ESLint: los archivos nuevos y los tests estan limpios; en los archivos tocados quedan errores
**preexistentes** de `no-explicit-any` y de variables e importaciones sin usar
(`DetalleFactura`, `RegistrarPagoDialog`, `ImportarCSVDialog`, los dos `service.ts` de cartera)
que no se han limpiado en esta tanda. Nada se ha probado en navegador.

---

## Fase B — tandas 3, 4 y 5 (nomina/HRM y vigencias que cortan servicio) · 2026-09-23

Encargo: las tandas 3 (nomina y HRM), 4 (vigencias que cortan servicio) y el arreglo de
`crearCuotas` de cuentas por pagar. Sin commit: los cambios quedan en el arbol.

### Correccion al inventario

El inventario da por hecho que `employeeLoansService`, `employmentCompensationService`,
`payrollService`, `attendanceService`, `timesheetConsolidationService` y `hrmDashboardService`
«no reciben la organizacion en ninguna firma». **No es asi**: los seis son clases con
`constructor(organizationId)` y ya la guardan en `this.organizationId`. No hubo que cambiar
ninguna firma en nomina; basto llamar a `resolveTimezone(this.organizationId, ...)`. Quien
planifique las tandas 7, 9 y 11 deberia comprobarlo antes de presupuestar cambios de firma.

Tambien: el inventario dice que `membership_freezes` no tiene `branch_id`. Si lo tiene
(`bigint`, nullable); lo que no tiene es `organization_id`. Verificado por MCP.

### Tanda 3 — nomina y HRM

| Call-site | Columna destino · tipo | Arreglo | Zona |
|---|---|---|---|
| `payrollService.ts:getCountryRules` | filtro `country_payroll_rules.valid_from` · **date** | `todayInTz` | organizacion |
| `employeeLoansService.ts:approve` | `employee_loans.disbursement_date` · **date** | `todayInTz` | organizacion (la tabla no tiene `branch_id`) |
| `employeeLoansService.ts:registerPayment` | `employee_loans.last_payment_date` · **date** | `todayInTz` | organizacion |
| `employeeLoansService.ts:generateInstallments` | `loan_installments.due_date` · **date** | `sumarMesesAlDia` sobre el dia, sin `Date` | no hace falta: aritmetica de dia |
| `employeeLoansService.ts:getStats` | comparacion de mora | `todayInTz` | organizacion |
| `employmentCompensationService.ts:144,223` | vigencia `effective_from`/`effective_to` · **date** | `todayInTz` | organizacion |
| `employmentsService.ts:updateStatus` | `employments.termination_date` · **date** | `todayInTz` + `zonaDelContrato(id)` | **sucursal del contrato** |
| `employmentsService.ts:duplicate` | `employments.hire_date` · **date** | `todayInTz` | sucursal del contrato original |
| `attendanceService.ts:getEvents` | filtro sobre `attendance_events.event_at` · **timestamptz** | `getDateRange` | sucursal filtrada, si la hay |
| `attendanceService.ts:getTodayEvents/getAnomalies/getStats` | dia objetivo | `todayInTz` | sucursal / organizacion |
| `timesheetConsolidationService.ts:consolidateDay` | filtro sobre `event_at` · **timestamptz** | `getDayRange` | sucursal |
| `timesheetConsolidationService.ts:consolidateDateRange` | iteracion dia a dia | `diasEntreDias` + `nextPlainDay` | — |
| `timesheetConsolidationService.ts:getPendingConsolidation` | dia y filtro de `event_at` | `todayInTz` + `getDayRange` | organizacion |
| `hrmDashboardService.ts:getKPIs/getAlerts` | `timesheets`/`shift_assignments`/`employments` · **date** | `todayInTz` + `sumarDiasAlDia` | sucursal del filtro |
| `hrm/compensacion/asignaciones/page.tsx:56,173` | `employment_compensation.effective_to` · **date** | `getToday()` | contexto |
| `hrm/prestamos/[id]/page.tsx:219` | mora de `loan_installments.due_date` | `getToday()` | contexto |
| `hrm/asistencia/timesheets/page.tsx:82` | dia a consolidar | `getToday()` | contexto |
| `hrm/reportes/page.tsx:43,44` | rango del mes en curso | `getToday()` + `primerDiaDelMes`/`ultimoDiaDelMes` | contexto |

El que mas consecuencias tiene es `getCountryRules`: el dia elige **que tabla de retenciones**
se aplica. Con el dia UTC, una nomina liquidada el 31 de diciembre a las 20:00 en Bogota ya es
1 de enero en UTC y cogia la norma del ano siguiente; y una liquidada a las 00:30 del 1 de enero
en Madrid cogia la del anterior. Los dos casos estan en la red.

Tambien se quito un `const currentYear = new Date().getFullYear()` que no se usaba en la consulta.

### Tanda 4 — vigencias que cortan servicio

Aqui la columna manda, y en gimnasio, promociones y cupones es **timestamptz**. La regla que se
adopta, escrita en los tres servicios: **el dia de inicio empieza a las 00:00 de la zona de la
organizacion y el dia de fin termina a las 23:59:59.999 de esa misma zona**. Una vigencia «hasta
el dia X» cubre el dia X entero, que es lo que entiende quien paga. Antes se mandaba
`'YYYY-MM-DD'` a un `timestamptz`, o sea medianoche UTC: en Madrid la membresia caducaba a las
02:00 del ultimo dia y el socio perdia la jornada que habia pagado.

| Call-site | Columna destino · tipo | Arreglo | Zona |
|---|---|---|---|
| `gymService.createMembership` | `memberships.start_date`/`.end_date` · **timestamptz** ⚠ | `plainDateToInstant` 00:00 / `getDayRange().end` | organizacion |
| `gymService.renewMembership` | idem | `sumarDiasAlDia` + los dos helpers | organizacion de la membresia |
| `gymService.freezeMembership` | `membership_freezes.start_date` · **date** | `todayInTz` | organizacion, via `memberships.organization_id` |
| `gymService.unfreezeMembership` | `membership_freezes.end_date` · **date** y `memberships.end_date` · **timestamptz** | `todayInTz`, `diasEntreDias`, `sumarDiasAlDia` | idem |
| `gymService.getDaysRemaining` | lectura ⚠ | dias calendario en la zona; **firma nueva** `(endDate, timezone)` | del llamador |
| `gymService.getGymStats` / `getTodayCheckins` | cortes del dia sobre `checkin_at`, `created_at`, `end_date` | `getDayRange` | organizacion/sucursal |
| `MembershipDialog.tsx` | fin de vigencia del formulario | `sumarDiasAlDia` | contexto |
| `parkingService.getStats` | `parking_sessions.exit_at` · **timestamptz** ⚠ | `getDayRange` y comparacion de instantes | organizacion/sucursal |
| `parkingService.checkPlateHasActivePass` | `parking_passes.end_date` · **date** | `todayInTz` | organizacion (la tabla no tiene `branch_id`) |
| `parking/abonados/page.tsx:148,150,195,197` | `parking_passes.start_date`/`.end_date` · **date** | `getToday()` + `sumarDiasAlDia` | contexto |
| `parking/operacion/page.tsx:168` | filtro `parking_passes.end_date` · **date** | `getToday()` | contexto |
| `promotionsService.create/update` | `promotions.start_date`/`.end_date` · **timestamptz** ⚠ | `vigenciaEnInstantes` | organizacion |
| `PromotionWizard.tsx:80,497,506` | lectura y valor por defecto ⚠ | `getToday()` + `plainDayOfInstant` una sola vez al sembrar el estado | contexto |
| `couponsService.create/update` | `coupons.start_date`/`.end_date` · **timestamptz** ⚠ | `vigenciaEnInstantes` | organizacion |
| `CouponForm.tsx:60,61` | lectura ⚠ (`.split('T')[0]` sobre timestamptz) | `plainDayOfInstant` | contexto |

**Escritura y lectura en el mismo commit**, como exige la regla de oro del inventario: las cinco
columnas ⚠ de arriba tienen aqui los dos lados. Para `memberships` eso obligo a cambiar la firma
de `getDaysRemaining` y a tocar sus 8 llamadores (`CheckinResult`, `ExpiringMemberships`,
`MembershipHeader`, `MembershipSummary`, `MembershipCard`, `MembershipExpiringSection`,
`MembershipStats`, `GymSection`): todos ya usaban `useFormatDate()`, asi que basto con sacar
`timezone` del hook. Si solo se hubiera arreglado la escritura, todas esas pantallas habrian
empezado a decir «1 dia restante» a una membresia que muere esta noche.

**Por que gimnasio no cambia de firma.** `freezeMembership` y compania ya cargan la membresia, y
`memberships.organization_id` es la identidad de la fila que se esta tocando. Anadir un parametro
`organizationId` habria permitido que el llamador pasara una organizacion distinta de la duena del
dato, que es peor que no tenerlo. `membership_freezes` no tiene `organization_id`: se llega por
`membership_id`, el salto de un nivel que el encargo autoriza y que queda documentado en el propio
archivo. Para `parking_passes` (sin `branch_id`) y `promotions`/`coupons` (sin `branch_id`) la zona
es la de la organizacion, tambien anotado en el codigo.

### Tanda 5 — `crearCuotas` de cuentas por pagar

El `timezone?: string = DEFAULT_TIMEZONE` que el anexo de la tanda 2 dejo apuntado **ya no existe**.
Las dos `crearCuotas` (`CuentasPorPagarService` y `CuentaPorPagarDetailService`) piden ahora
identidad obligatoria y resuelven la zona dentro:

```
crearCuotas(accountId, totalAmount, numberOfInstallments,
            primerVencimiento: Date, organizationId: number, branchId: number | null,
            interestRate = 0)
```

Los parametros nuevos van **antes** de `interestRate` a proposito: asi el compilador senala a todos
los llamadores en vez de dejar pasar una llamada con un argumento de menos. Llamadores
actualizados: `CuotasPage.tsx` (tiene `account` cargado) e `InstallmentsCard.tsx`, al que se le
anadieron las props `organizationId` y `branchId`, que le pasa `CuentaPorPagarDetailPage.tsx`.
`CuentaPorPagarDetalle` gana `branch_id` (la consulta ya lo traia con `select('*')`, pero el tipo
no lo declaraba y por eso nadie podia usarlo). `ap_installments.due_date` es `date`, asi que se
escribe el dia; el bucle pasa de `Date.setMonth` a `sumarMesesAlDia`, con lo que una cuenta creada
el 31 de enero vence el 28 de febrero y no el 3 de marzo.

`CuentasPorPagarService.crearCuotas` **no tiene ningun llamador** (los tres pasan por
`CuentaPorPagarDetailService`). Se arreglo igualmente para que nadie la use manana con la firma
vieja; si se decide borrarla, es candidata.

### Red

- `src/__tests__/timezone/nominaHrm.test.ts` — 12 casos.
- `src/__tests__/timezone/vigenciasQueCortanServicio.test.ts` — 13 casos.
- `src/__tests__/timezone/dobleSupabase.ts` — doble encadenable del cliente de PostgREST que
  **registra tabla, operacion, payload y filtros**. Sin el no se puede afirmar «que valor se
  escribe»; un mock que solo devuelve datos deja pasar exactamente el bug que se persigue.

Todos con reloj falso (`jest.setSystemTime`). Los casos que pedia el encargo:

- Una membresia «hasta el 30» en una organizacion de Madrid guarda
  `2026-09-30T23:59:59.999+02:00` y a las 23:30 de ese dia sigue viva. `getDaysRemaining` devuelve
  **0** a las 09:00 y a las 23:30 del mismo dia, y **-1** a las 00:30 del dia siguiente en Madrid
  aunque en UTC siga siendo el 30.
- Un prestamo cuya primera cuota cae el **31 de enero**: 31/01, 28/02, 31/03, 30/04. Y el bisiesto:
  31/01/2028 -> 29/02/2028.
- Renovacion de 30 dias que cruza el cambio de horario de Madrid (25/10): da el 14 de noviembre,
  no el 13.
- La caja del dia de parqueadero con dos sesiones cuyo `exit_at` esta al otro lado de medianoche
  UTC: la del dia entra, la de la vispera no.

Verde en `TZ=UTC` y `TZ=America/Mexico_City`, tanto los dos archivos nuevos como
`src/__tests__/timezone` completo mas `guardrails.test.ts` (**14 suites, 448 pruebas**), y
`src/__tests__/pos` mas `promotionEngine.clienteReal` (**130 suites, 3048 pruebas**).

### Mutaciones

**22 mutaciones, 22 muertas, 0 supervivientes**, md5 de cada archivo identico antes y despues
(script y resultados en el scratchpad de sesion, `.../scratchpad/tz-b345/mutar.py`,
`mutaciones-t3.json`, `mutaciones-t45.json` y sus `-resultado.json`).

Tanda 3 (9): volver a `toISOString().split`, zona del navegador en vez de la de la organizacion,
`Date.setMonth` que desborda febrero, desembolso con el dia UTC, cadena sin offset contra un
`timestamptz`, ignorar la sucursal del filtro, offset cableado a `America/Bogota`, alta de contrato
con el dia UTC, retiro con la zona de la organizacion en vez de la de la sede.

Tandas 4 y 5 (13): fin de vigencia a las 00:00, dia calendario sin zona, congelamiento con el dia
UTC, renovacion en bloques de 24 h, dias restantes por resta de instantes, dias restantes en la
zona del navegador, prefijo de cadena sobre `exit_at`, pase vigente contra el dia UTC, dia en crudo
a una columna `timestamptz`, fin de promocion a medianoche, `Date.setMonth` en las cuotas, ignorar
la sucursal de la cuenta, primer vencimiento por `toISOString`.

La primera pasada de las tandas 4 y 5 dejo **tres supervivientes**, y las tres por lo mismo: el
caso de prueba estaba elegido en un instante en el que el error y el acierto coinciden. La
renovacion arrancaba a las 09:00, donde `+30 x 24 h` y `+30 dias` caen el mismo dia; el conteo de
dias restantes se medía en una hora en la que el dia de Madrid y el del proceso de pruebas son el
mismo; y el primer vencimiento se pedia en un instante cuyo dia UTC coincidia con el de la
organizacion. Corregidos los tres instantes (00:30 de Madrid, 22:30Z, 02:00Z), las tres mueren.
Es la leccion de la tanda 2 otra vez, en otra forma: **una prueba de zona horaria que no elige el
instante a proposito no prueba nada**.

### Metrica

Metrica 1 (escritura de dia en UTC): **256 antes / 222 despues**, −34, que es exactamente el
numero de ocurrencias de estas tres tandas. En los archivos tocados: 34 -> 0.

Lo que queda en estos modulos son 23 ocurrencias que **no** pertenecen a este encargo:
`parkingDashboardService`, `parkingReportService`, `ReportesFilters` y `parking/reportes/page.tsx`
son la tanda 8; `gym/clases/page.tsx` es la tanda 11; el resto son nombres de archivo de descarga
(tandas 12 y 13).

### NO VERIFICADO

- `npx tsc --noEmit` **completo** y `next build`: no se ejecutan (el encargo los excluye por el
  arbol compartido). El `tsc` acotado a los 37 archivos tocados da **0 errores propios**; el unico
  que sale es `src/lib/utils/desktop.ts(237)`, y es artefacto del `tsconfig` acotado, que no incluye
  `src/types/go-admin-desktop.d.ts`. Aviso para quien repita la medicion: el `tsc` completo de este
  repositorio termino con codigo 0 y **sin imprimir nada**, que es el falso «0 errores» por falta de
  heap ya anotado en las notas de sesion; el acotado si encontro un error real
  (`getToday` sin declarar en `hrm/prestamos/[id]/page.tsx`).
- ESLint: **0 problemas nuevos en las lineas tocadas** (medido cruzando `eslint --format json` con
  las lineas anadidas segun `git diff -U0`). En los archivos siguen los errores **preexistentes**
  de `no-explicit-any` y de variables sin usar de `gymService`, `parkingService`, `payrollService`
  y `timesheetConsolidationService`, que no se han limpiado en estas tandas.
- Nada probado en navegador.
- `src/__tests__/pos-display/tester-f2c-r10.test.ts` fallo **una vez** con 12 pruebas en rojo al
  correr en lote con `TZ=UTC`, y paso en solitario y en la repeticion del mismo lote. Parece
  inestabilidad propia de esa suite (arbol compartido, varias sesiones escribiendo), no del cambio:
  no toca ninguno de los archivos de estas tandas. Queda anotado por si reaparece.
- Cero escrituras en la base de datos. Ninguna migracion: las tres tandas se resuelven en codigo.
- Sin `git add`, `commit`, `push` ni cambio de rama. El arbol sigue en `gosec/bloque-a`.

## Anexo 2026-09-23 — hallazgo ajeno a la fase D, visto al recorrer los disparadores

Al inventariar los disparadores de Postgres para la fase D apareció un defecto
**crítico y sin relación con zonas horarias**: nadie podía crear turnos.
`public.fn_notify_shift_assigned()` (disparador `trg_notify_shift_assigned`,
`AFTER INSERT ON shift_assignments`) abortaba todo `INSERT` con
`42703: column e.organization_id does not exist`, porque `employments` no tiene
`organization_id` — la organización vive en `organization_members` y la unión va
por `employments.organization_member_id = organization_members.id`. En el mismo
cuerpo había una segunda referencia rota, `NEW.date`, cuando la columna se llama
`work_date`.

**No forma parte de la fase D** y no se contabiliza en ella: la función no decide
ningún día calendario. `work_date` es una columna `date`, un día ya fijado, así
que no se convierte de zona (regla 5) y aquí NO intervienen `fn_today_for` ni
`fn_today_for_org`.

Corregido y verificado el mismo día en
`supabase/migrations/20260923231500_fn_notify_shift_assigned_organizacion_por_membresia.sql`.
Detalle completo, evidencia y pendientes: `docs/hallazgos/F-63.md`.

---

## Fase D — addendum resuelto: `fn_emitir_acciones`, y el inventario a CI · 2026-09-23

Dos encargos. El primero cierra el addendum que la fase D dejo anotado; el segundo es el que
evita que vuelva a pasar.

### Encargo 1 — `fn_emitir_acciones` deja de decidir el dia en UTC

`public.fn_emitir_acciones(p_subscription_id uuid, p_admin_user_id uuid, p_referencia_tecleada text)`
tenia dos `current_date`, y los dos deciden un dia contable:

| Sitio | Que decide | Columna · tipo | Arreglo |
|---|---|---|---|
| `fn_is_period_open(v_org, current_date)` | si el periodo contable esta abierto | `fiscal_periods.start_date`/`.end_date` · **date** | `fn_today_for_org(v_org)` |
| `insert into cap_transactions (... effective_date ...)` | fecha efectiva del certificado de acciones | `cap_transactions.effective_date` · **date** | `fn_today_for_org(v_org)` |

**Por organizacion y no por sucursal**, comprobado por MCP antes de escribir nada:

- `fn_is_period_open(p_organization_id integer, p_date date)` resuelve contra `fiscal_periods`,
  que es por organizacion. La sucursal no entra en la decision. Ademas, en ese punto del cuerpo
  `v_branch` **todavia no esta asignada**: se calcula tres lineas mas abajo.
- `cap_transactions` **no tiene `branch_id`** (verificado en `information_schema.columns`). El
  libro de accionistas es de la sociedad entera, no de una sede.
- La `v_branch` que la funcion calcula existe solo para rellenar `journal_entries.branch_id`, y
  se elige con `order by (is_main and is_active) desc, is_active desc, id limit 1`. Es un
  relleno; fechar un certificado con la zona de una sucursal elegida asi seria peor que no
  hacerlo.

El dia se resuelve **una sola vez** (`v_dia_contable := public.fn_today_for_org(v_org)`) y se usa
en los dos sitios: si se resolviera dos veces, una emision que cruce la medianoche local podria
comprobar un periodo y fechar el certificado en dias distintos.

**Lo que NO se toco**: `journal_entries.entry_date` es `timestamptz` y se escribe con `now()`.
Igual `issued_at` y `updated_at`. Convertirlos a un dia seria el error contrario (regla 5 de
`docs/reglas-fechas-timezone.md`).

Migracion `supabase/migrations/20260923233000_fn_emitir_acciones_dia_de_la_organizacion.sql`,
aplicada por `apply_migration`, con reversion real en `supabase/rollbacks/`.

**Invariantes, antes y despues** (`pg_proc`):

```
firma          fn_emitir_acciones(uuid,uuid,text)      -> igual
owner          postgres                                 -> igual
provolatile    v (volatile)                             -> igual
prosecdef      true (SECURITY DEFINER)                  -> igual
proconfig      search_path=public, pg_temp              -> igual
proparallel    u   procost 100   prorows 1000           -> igual
acl            postgres=X/postgres | service_role=X/postgres  -> igual
sobrecargas    1                                        -> 1 (ninguna nueva)
current_date en el cuerpo     2                         -> 0
fn_today_for_org en el cuerpo 0                         -> 1
```

`anon` y `authenticated` siguen sin privilegio de ejecucion, antes y despues.

#### Las dos pruebas en seco

Ambas con `DO ... RAISE EXCEPTION`, que aborta la transaccion: **nada se commitea**. Cada una
crea una organizacion SINTETICA dentro de la propia transaccion (cero `UPDATE` sobre datos
reales) y le monta dos periodos contables: `2026-09-01..09-23` abierto y `2026-09-24..09-30`
cerrado. Servidor en `TimeZone = UTC`, hora de la prueba `2026-09-23 17:36Z`.

**Con UTC+14** (`Pacific/Kiritimati`), antes de la migracion:

```
current_date (dia UTC)                        = 2026-09-23
fn_today_for_org(v_org)                       = 2026-09-24
fn_is_period_open(org, current_date)          = t   <-- lo que decidia
fn_is_period_open(org, fn_today_for_org(org)) = f   <-- lo que deberia
effective_date que se escribiria: 2026-09-23  vs  2026-09-24
ocurrencias de current_date en el cuerpo VIVO = 2
```

Es decir: la emision pasaba el control **aunque el periodo contable de la organizacion estuviera
cerrado**, y fechaba el certificado un dia antes de lo que dice su calendario.

**Con UTC+14**, despues:

```
cuerpo VIVO: current_date=0   fn_today_for_org(v_org)=1
dia UTC=2026-09-23   dia contable (organizacion)=2026-09-24
fn_is_period_open(org, v_dia_contable) = f  -> la emision se BLOQUEA
effective_date que se escribiria = 2026-09-24  (antes: 2026-09-23)
```

**Sin UTC+14** (la organizacion de prueba en `America/Bogota`, como las 85 reales):

```
current_date=2026-09-23   fn_today_for_org=2026-09-23   iguales=t
periodo(UTC)=t  periodo(org)=t  -> la prueba NO distingue nada
```

Esa tercera ejecucion es la que justifica las otras dos: **sin mover la organizacion a un huso al
este de Greenwich, la prueba acierta por casualidad**. A las 17:36Z, Bogota y UTC estan en el
mismo dia y cualquiera de las dos versiones de la funcion pasa.

Comprobado despues: `select count(*) from organizations where id in (169,170) or name like 'ZZ dry-run%'`
da **0**. Lo unico que sobrevive a las tres pruebas es el avance de `organizations_id_seq`, que no
es transaccional; un hueco en los ids, nada mas.

#### Inventario

```
antes:   8 filas   (las 7 del ADR-004 + fn_emitir_acciones)
despues: 7 filas   (exactamente las 7 del ADR-004)
```

### Encargo 2 — el inventario corre contra la base viva, en CI

La leccion que la fase D dejo escrita: **un test que lee los `.sql` del repositorio no ve una
funcion que otra sesion aplica por MCP**. Asi se colo esta. Ahora hay una red que si la ve.

Tres piezas y un ADR (`docs/adr/ADR-005-inventario-de-current-date-contra-la-base-viva.md`):

1. **`public.fn_inventario_current_date()`** — migracion
   `20260923234000_fn_inventario_current_date.sql`. Devuelve `(firma, proname)` de las funciones
   de `public` cuyo `prosrc` casa con `\mCURRENT_DATE\M`. `LANGUAGE sql`, `STABLE`,
   **`SECURITY INVOKER`** (los catalogos `pg_proc`/`pg_namespace` son legibles por cualquier rol:
   no hay que elevar privilegios ni engordar el inventario de `SECURITY DEFINER`). Permisos:
   `execute` solo a `service_role`; `revoke all` a `public`, `anon` y `authenticated`. ACL
   resultante: `postgres=X/postgres | service_role=X/postgres`.
2. **`scripts/verificar-current-date-en-postgres.mjs`** — Node, sin dependencias nuevas: usa
   `@supabase/supabase-js`, que ya estaba en `package.json`. Compara el resultado de la RPC con
   `scripts/lista-blanca-current-date.json` y sale 1 si sobra o falta alguna, con un mensaje que
   **nombra la funcion intrusa** y explica el arreglo (`fn_today_for_org` / `fn_today_for`, o
   justificarla primero en el ADR-004).
3. **`.github/workflows/inventario-postgres.yml`** — job propio, no dentro de `ci-web.yml`.

Decisiones que no son obvias, todas razonadas en el ADR-005:

- **RPC por HTTPS y no conexion `pg` directa.** El repositorio no depende de `pg`; si depende de
  `@supabase/supabase-js`. Y el secreto que necesita CI es la clave de `service_role`, no la
  contrasena de la base. Ademas, las conexiones directas de Supabase van por IPv6 y el runner de
  GitHub no tiene IPv6: habria que mantener la URL del pooler.
- **Workflow aparte.** El disparador que de verdad importa es `schedule` (diario, 13:00 UTC):
  una funcion aplicada por MCP **no deja cambio en el repositorio**, asi que ningun `push` ni
  `PR` la delataria. Un `schedule` dentro de `ci-web.yml` arrastraria cada dia al `typecheck` y a
  las dos matrices de zonas horarias. Tampoco lleva filtro `paths`, por lo mismo.
- **Sin secretos: se salta, no falla.** Un `pull_request` desde un fork no recibe `secrets`. El
  script sale 0 imprimiendo por que se salto y que variables faltan. Ruidoso a proposito, para
  que nadie lo confunda con un verde.
- **La lista blanca vive en un solo archivo.** `scripts/lista-blanca-current-date.json` lo leen
  **tanto** el script de CI **como** `diaDeLaOrganizacionEnPostgres.test.ts`. Dos copias de una
  lista blanca divergen, y la que divergiera seria justo la que deja pasar la intrusa. Guarda
  **firmas completas**, no nombres: `save_exchange_rates` tiene dos sobrecargas (por nombre serian
  6 entradas para 7 filas) y una sobrecarga nueva con `CURRENT_DATE` pasaria inadvertida.

#### Como se corre en local

```bash
node scripts/verificar-current-date-en-postgres.mjs
```

Lee `.env.local` (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) si existe; si no, se
salta con aviso y sale 0. No escribe nada: la RPC es `stable` y solo lee catalogos.

**Salida real, con las credenciales de `.env.local`:**

```
  Inventario CURRENT_DATE: OK - 7 funciones, las 7 del ADR-004.
    . auto_generate_missing_rates()
    . fill_historical_rates_real_api()
    . fill_missing_currency_dates()
    . insert_fallback_rates()
    . save_exchange_rates(integer,uuid,jsonb,text)
    . save_exchange_rates(integer,uuid,jsonb,text,bigint)
    . update_global_exchange_rates(jsonb,text,bigint,text,text)

exit=0
```

**Salida real simulando un fork** (copia del script en un arbol sin `.env.local` y sin variables
de entorno):

```
  Inventario CURRENT_DATE: SALTADO
  Faltan credenciales: SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.
  No es un fallo. Un fork no tiene los secretos del proyecto ...

exit=0
```

### Red

`src/__tests__/timezone/diaDeLaOrganizacionEnPostgres.test.ts`:

- `fn_emitir_acciones` entra en el mapa `CONTRATOS` (firma exacta, `SECURITY DEFINER`,
  `porSucursal: false` con el porque escrito al lado).
- La migracion nueva entra en `MIGRACIONES_FASE_D`: se le exige reversion real y que no lleve
  `DROP FUNCTION` ni `UPDATE`/`DELETE` de primer nivel.
- `TASAS_EN_UTC_A_PROPOSITO` deja de estar escrita en el test y sale del JSON compartido. Tres
  casos nuevos: la lista tiene exactamente 7 firmas sin repetidas, guarda firmas y no nombres
  (`save_exchange_rates` dos veces), y apunta al ADR-004.
- Bloque nuevo «la comprobacion contra la base viva sigue en pie»: el script existe y consulta la
  RPC, se salta si faltan credenciales, no lleva ninguna credencial escrita (ni un JWT ni una URL
  de proyecto), el workflow corre el script y conserva el `schedule`/`cron`, las credenciales
  llegan por `secrets`, y la migracion de la RPC tiene reversion y concede `execute` solo a
  `service_role`.

`npx jest src/__tests__/timezone`: **14 suites, 368 pruebas, todo en verde.**

### Mutaciones

**8 mutaciones, 8 detectadas, 0 supervivientes.** md5 de los 6 archivos identico antes y despues
(copias y `mutar.mjs` en el scratchpad de sesion, `emitir-acciones/`).

| # | Mutacion | Quien la mata | Veredicto |
|---|---|---|---|
| M1 | quitar `insert_fallback_rates()` de la lista blanca | el script sale **1** nombrando `public.insert_fallback_rates()` como intrusa; jest falla («exactamente 7 firmas») | muerta |
| M2 | anadir a la lista blanca una firma que no existe | el script sale **1** («la lista blanca nombra 1 funcion que ya NO esta»); jest falla en 2 casos | muerta |
| M3 | en el script, que la lista de intrusas sea siempre vacia | con el escenario de M1 el script pasa de **1** a **0**: un rojo se vuelve verde falso | muerta |
| M4 | `~` (sensible a mayusculas) en vez de `~*` en la consulta | la linea real que tenia la funcion, `if not public.fn_is_period_open(v_org, current_date) then`, **no** casa con el regex sensible y si con el insensible. Las 7 de tasas escriben `CURRENT_DATE` en mayusculas, asi que el conteo hoy no cambiaria: la mutacion se habria comido **justo la intrusa de esta ronda** | muerta |
| M5 | que la falta de secretos falle en vez de saltarse | la corrida tipo fork pasa de **0** a **1**; jest falla («el script se SALTA si faltan credenciales») | muerta |
| M6 | quitar el `schedule`/`cron` del workflow | jest falla («el workflow ... tiene disparador programado») | muerta |
| M7 | pegar una credencial (falsa) dentro del script | jest falla («el script no lleva ninguna credencial escrita») | muerta |
| M8 | devolver `current_date` al cuerpo de `fn_emitir_acciones` en el `.sql` | jest falla en 2 casos («su definicion vigente no conserva CURRENT_DATE» y «resuelve el dia con las funciones de la fase A») | muerta |

Matiz honesto sobre **M3**: con la lista blanca intacta, esa mutacion **no** se nota — no hay
intrusa que reportar. Solo se nota en el escenario que el job existe para cubrir. Es la misma
leccion de las tandas 4 y 5 de la fase B: una prueba que no elige el escenario a proposito no
prueba nada.

Matiz sobre **M4**: es la unica que no se aplico tocando un archivo, sino evaluando las dos
formas del regex en la base (solo lectura), porque mutarla de verdad habria exigido DDL sobre la
funcion viva.

### NO VERIFICADO

- `npx tsc --noEmit` **completo** y `next build`: no se ejecutan (el encargo los excluye por el
  arbol compartido). El `tsc` **acotado** a los dos archivos de test tocados da **0 errores**.
  Aviso para quien repita la medicion: un `tsconfig` acotado que viva fuera del repositorio
  necesita `typeRoots` explicito, o `tsc` inventa 20 errores de «Cannot find name 'describe'» que
  no existen.
- ESLint sobre los archivos tocados: **salida vacia**. Se quito de paso un `readdirSync`
  importado y no usado que ya estaba ahi. (`scripts/lista-blanca-current-date.json` no se pasa por
  ESLint: es JSON y el parser de TS lo rechaza.)
- El job de CI **no se ha ejecutado en GitHub Actions**: no hay push. Lo que si se ejecuto de
  verdad, en local y contra la base real, son las dos rutas del script: con credenciales
  (salida OK, exit 0) y sin ellas simulando un fork (salida SALTADO, exit 0). La ruta de fallo se
  ejecuto ocho veces durante las mutaciones.
- Falta dar de alta los `secrets` `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en el repositorio
  de GitHub. **Mientras no esten, el job se saltara con aviso en cada ejecucion** — verde, pero
  sin comprobar nada. Es el unico paso pendiente para que la red del encargo 2 este viva.
- `get_advisors` (security): ni `fn_emitir_acciones` ni `fn_inventario_current_date` aparecen en
  ningun aviso. Los 8 WARN y 1 INFO que hay son preexistentes y ajenos.
- Nada probado en navegador. Ninguna escritura de datos: las tres pruebas en seco se abortan y no
  hubo ni un `UPDATE` sobre datos reales.
- Sin `git add`, `commit`, `push` ni cambio de rama.

#### Nota de cierre (minutos despues, mismo encargo)

Al repetir la ultima corrida, `npx jest src/__tests__/timezone` pasa de **14 suites / 368
pruebas en verde** a **16 suites / 432 pruebas con 3 rojas**. Los tres fallos estan en
`openFinanceYMonedas.test.ts`, un archivo que **no existia** al empezar la corrida anterior: lo
creo otra sesion en paralelo mientras esta cerraba, junto con `pmsParkingReportes.test.ts` y
`transporte.test.ts`. Es el mismo patron que produjo el addendum de la fase D.

`diaDeLaOrganizacionEnPostgres.test.ts`, el archivo de este encargo, da **127 pruebas en verde**
por separado y dentro del lote. Ningun rojo es de esta ronda.

---

## Fase B — tanda 7 (transporte) · 2026-09-23

Viajes, manifiestos, envíos, tiquetes, tracking, rutas, `transportService` y `mis-envios`.
Transporte es el módulo donde la cascada de ADR-001 más importa: un viaje sale de **una**
sucursal, y esa sucursal puede estar en otra zona que la sede. Por eso aquí se pasa el
`branch_id` del dato siempre que el dato lo tenga, y se anota como deuda cuando no lo tiene.

### Recuento

| | Antes | Después |
|---|---:|---:|
| Ocurrencias en las 11 rutas de la tanda | 27 | 0 |

El inventario listaba 26 en 11 archivos. El barrido sobre las mismas rutas encontró **27**:
las dos que faltaban son `tripsService.ts:511` (el «hoy» por defecto de `getTripStats`) y
`mis-envios/page.tsx:330` (`created_at.split('T')[0]` sobre un **timestamptz**, que además
es una de las idas y vueltas por cadena del §4 y no estaba anotada como tal). Las dos se
arreglan en esta tanda.

Lo que queda en estas rutas: cero. Fuera de ellas y dentro de transporte queda
`src/components/transporte/incidentes/IncidentDialog.tsx:49`
(`new Date().toISOString().slice(0, 16)` como valor por defecto de un
`<input type="datetime-local">` para `transport_incidents.occurred_at`). **No pertenece a
ninguna tanda del inventario** — se le escapó al barrido original, que buscaba
`.split('T')[0]` — y por eso `src/components/transporte/**` no entra entero en el
`overrides` de ESLint: solo `src/components/transporte/horarios/**`.

### Tabla fila por fila

| Archivo:línea | Destino real (tabla.columna · tipo) | Arreglo aplicado | Zona |
|---|---|---|---|
| `manifestsService.ts:294` | `dispatch_manifests.manifest_date` · **date** | `todayInTz(resolveTimezone(org, branch))` al duplicar | sucursal del manifiesto original |
| `tripsService.ts:199` | `trips.trip_date` · **date**, y el `trip_code` que sale de él | `todayInTz(...)`; el código deja de contradecir su propia fecha | `trip.branch_id` |
| `tripsService.ts:511` | filtro `trips.trip_date = hoy` · date | `todayInTz(...)` | `branchId` de la firma |
| `shipmentsService.ts:424` | `shipments.created_at` · **timestamptz** ⚠ | `getDayRange` + comparación de instantes, en vez de `created_at.startsWith(díaUTC)` | `branchId` de la firma |
| `shipmentsService.ts:463` | filtro `trips.trip_date >= hoy` · date | `todayInTz(...)` | organización (**deuda**) |
| `ticketsService.ts:208` | `trip_tickets.created_at` · **timestamptz** ⚠ | `getDayRange`: `gte`/`lte` con offset real, antes `día + 'T00:00:00'` sin offset y sin cerrar por arriba | organización (**deuda**) |
| `ticketsService.ts:231` | filtro `trips.trip_date >= hoy` · date | `todayInTz(...)` | organización (**deuda**) |
| `trackingService.ts:147` | `transport_events.event_time` · **timestamptz** ⚠ | `getDayRange`; antes era una cadena de día contra un instante | organización |
| `transportRoutesService.ts:661` | generación de `trips` desde `route_schedules` | iteración por `sumarDiasAlDia` y día de la semana por `diaDeLaSemanaDelDia` | ninguna (días calendario puros) |
| `transportService.ts:216-220` | rango del tablero sobre `trip_date` · date y `created_at` · **timestamptz** ⚠ | `toPlainDate(fecha, zona)` / `todayInTz`, y `getDateRange` para los `created_at` de `shipments` y `trip_tickets` | sucursal del filtro |
| `transportService.ts:333` | filtro `trips.trip_date >= hoy` · date | `todayInTz(...)` | `branchId` de la firma |
| `transportService.ts:577` | `vehicles.*_expiry <= hoy + N` · date | `sumarDiasAlDia(todayInTz(zona), N)` | organización |
| `transportService.ts:720` | `driver_credentials.license_expiry` / `.medical_certificate_expiry <= hoy + N` · date | ídem | organización (la tabla no tiene organización propia) |
| `viajes/page.tsx:99` | filtro `trip_date` desde el datepicker | `toPlainDate(fecha, zonaDelFiltro)` | sucursal seleccionada en el filtro |
| `viajes/page.tsx:193` | `trips.trip_date` de mañana (duplicar viaje) | `sumarDiasAlDia(todayInTz(zonaDelViaje), 1)` | `trip.branch_id` |
| `GenerateTripsDialog.tsx:44` | fin del rango de generación | `sumarDiasAlDia(hoy, 7)` | contexto de la organización |
| `mis-envios/page.tsx:286-312` | rangos del filtro (hoy, ayer, 7/15/30 días, personalizado) | aritmética de día calendario sobre `todayInTz(timezone)` | organización |
| `mis-envios/page.tsx:330` | `shipments.created_at` · **timestamptz** ⚠ | `plainDayOfInstant(created_at, zonaDeSuSucursal)` | `shipment.branch_id`, fila a fila |
| `tracking/page.tsx:103` | nombre del CSV de descarga | `getToday()` | contexto de la organización |

Columnas `timestamptz` de esta tanda (las marcadas ⚠): en las cinco se arregla **escritura y
lectura en el mismo cambio**, como manda la regla de oro del §6 del inventario. Ninguna es
una escritura de dato: son filtros y conteos, así que la «ida» es el filtro y la «vuelta» es
la comparación del resultado. En `mis-envios` las dos mitades estaban en la misma función y
se cancelaban entre sí; arreglar solo una habría corrido el filtro un día.

### Verificación del esquema por MCP (antes de tocar una sola consulta)

- `trips.trip_date` y `dispatch_manifests.manifest_date`: `date`. Ambas tablas tienen
  `branch_id`.
- `shipments`: `branch_id` sí; `created_at` **timestamptz**; `expected_pickup_date` y
  `expected_delivery_date` `date`.
- `trip_tickets`: tiene `organization_id`, **no** tiene `branch_id`. La sucursal está en el
  viaje. `created_at` es **timestamptz**.
- `transport_events`: tiene `organization_id`, **no** `branch_id`; `event_time` es
  **timestamptz**.
- `route_schedules`: `organization_id`, sin `branch_id`; `valid_from`/`valid_until` `date`;
  `departure_time`/`arrival_time` son `time without time zone`.
- `driver_credentials`: **no tiene ni `organization_id` ni `branch_id`**. Se llega a la
  organización por `employment_id → employments → organization_members`, que es justo lo
  que hace la política RLS de la tabla y el filtro en Node de `getDriversWithExpiringDocs`.
- `drivers`: **confirmado que no existe**, como decía el inventario. Ningún archivo de esta
  tanda la consulta; el servicio de transporte usa `driver_credentials`.
- `vehicles`: `branch_id` sí; columnas de vencimiento `soat_expiry`, `techno_expiry`,
  `insurance_expiry`, `operating_card_expiry`, todas `date`.

### Deuda anotada

1. **`vehicles.tech_review_expiry` no existe.**
   `transportService.getVehiclesWithExpiringDocs` construye
   `.or('soat_expiry.lte.X,tech_review_expiry.lte.X,insurance_expiry.lte.X')`. La columna
   real es **`techno_expiry`**. PostgREST rechaza la consulta entera, así que la función
   **lanza siempre**: hoy no vigila ningún documento de vehículo. No se corrige aquí porque
   cambia qué documentos se vigilan y eso no es zona horaria; queda el aviso en el propio
   archivo, junto a la línea. Es el mismo patrón que `drivers` y `space_blocks`: código que
   apunta a un esquema que no está.
2. **Tres «hoy» que no pueden usar la sucursal.** `shipmentsService.getTrips`,
   `ticketsService.getTrips` y `ticketsService.getTicketStats` listan o cuentan de toda la
   organización: no hay `branch_id` que pasar (en `trip_tickets` ni siquiera existe la
   columna). La zona es la de la organización. Si algún día el selector de viajes filtra
   por sucursal, esos tres «hoy» deben pasar a la sucursal.
3. **`trackingService.getTrackingStats` no filtra por `organization_id`** en las cuatro
   consultas a `transport_events` (total, de hoy, por tipo). La RLS de la tabla acota por
   pertenencia, así que no hay fuga a otro inquilino, pero un usuario que pertenezca a dos
   organizaciones ve la suma de las dos. Fuera del alcance de la fase; anotado.
4. **`mis-envios`, presets de 7/15/30 días.** El rango es `[hoy − N, hoy)`: **excluye hoy**.
   Se ha conservado la semántica exacta al migrar (la tanda arregla la zona, no el rango),
   pero «últimos 7 días» sin el día de hoy parece un error de producto, no de zona.
5. **`IncidentDialog.tsx:49`**, ya descrito arriba: `toISOString().slice(0, 16)` para el
   valor por defecto de `transport_incidents.occurred_at`. No está en ninguna tanda.

### Dos defectos del propio guardarraíl de ESLint, encontrados al añadir las rutas

Al añadir las rutas de la tanda con `error` y comprobar que la regla saltaba, resultó que
**no saltaba nunca, en ningún archivo del repositorio**:

1. **Los selectores no casaban con el AST.** Eran
   `CallExpression[callee.object.property.name='toISOString'][callee.property.name='split']`.
   En `new Date().toISOString().split('T')`, el `callee.object` es la **llamada**
   `new Date().toISOString()`, que no tiene `.property`: tiene `.callee.property`. El
   selector correcto es
   `CallExpression[callee.property.name='split'][callee.object.callee.property.name='toISOString']`.
   Comprobado con un archivo de sonda: con el selector viejo, 0 avisos; con el nuevo, 2.
2. **El bloque `src/**` con `warn` está declarado DESPUÉS del bloque con `error`.** En
   ESLint gana el último `override` que casa, así que ese `warn` pisaba el `error` de todos
   los directorios ya migrados. Es decir: aunque los selectores hubieran funcionado, todo
   habría sido `warn`.

Arreglado el (1), que es condición necesaria para que cualquier ruta en `error` signifique
algo. Para el (2) **no se ha reordenado el bloque histórico**: hacerlo pondría en `error`
de golpe unas 16 violaciones que siguen vivas dentro de esos directorios (nombres de
descarga de las tandas 12 y 13, sobre todo) y rompería el `lint` de módulos que no son de
esta tanda. En su lugar, las rutas de la tanda 7 van en un **bloque propio al final**, que
por orden gana al `src/**`. Verificado inyectando una violación en `trackingService.ts`:
sale como `error`. Cuando las tandas 12 y 13 cierren los nombres de descarga, el bloque
histórico se puede mover detrás del `src/**` y fundirse con este.

Rutas añadidas (bloque nuevo, `no-restricted-syntax` y `no-restricted-imports` en `error`):
`src/app/app/transporte/**`, `src/components/transporte/horarios/**`,
`src/lib/services/fiscalCalendar.ts`, `manifestsService.ts`, `shipmentsService.ts`,
`ticketsService.ts`, `trackingService.ts`, `transportRoutesService.ts`,
`transportService.ts`, `tripsService.ts`.

### El bug de la recurrencia semanal

`getScheduleDates` no era un caso de zona de organización: era un caso de mezclar dos
relojes en la misma función. `new Date('2026-09-23')` se interpreta como medianoche **UTC**,
pero `current.getDay()` devuelve el día de la semana **local**. En cualquier navegador al
oeste de Greenwich esos dos no son el mismo día, así que un horario «los miércoles»
generaba los viajes del **martes**. Un día de la semana de un día calendario no depende de
ninguna zona, así que el arreglo no mete zona: mete `diaDeLaSemanaDelDia(plainDate)` en
`fiscalCalendar.ts`, aritmética entera sobre `Date.UTC`, hermana de `sumarDiasAlDia`. La
iteración y el recorte por vigencia pasan igualmente a comparación de cadenas `YYYY-MM-DD`.

### Red

`src/__tests__/timezone/transporte.test.ts` — 19 casos, con el doble de PostgREST
(`dobleSupabase.ts`) que registra tabla, operación, payload y filtros: sin eso no se puede
afirmar *qué valor se escribe* ni *con qué extremos se filtra*. Reloj falso en todos.

Casos que cubren lo que pedía el encargo:

- **UTC**: el runtime por defecto de `npm run test:tz-utc`.
- **`America/Bogota`**: el mismo instante que da el día 24 en Katmandú sigue siendo el 23 en
  Bogotá.
- **DST (`Europe/Madrid`)**: la jornada del **25 de octubre de 2026** dura 25 horas y sus
  dos extremos llevan offsets **distintos** — `2026-10-25T00:00:00.000+02:00` y
  `2026-10-25T23:59:59.999+01:00` —; y un rango del 20 al 30 de octubre empieza en `+02:00`
  y termina en `+01:00`. También el horizonte de 30 días que cruza el cambio: sumar
  30 × 24 h desde el 20 de octubre a las 23:30 UTC cae el 19 de noviembre, no el 20.
- **Offset no entero (`Asia/Kathmandu`, +05:45)**: el manifiesto duplicado a las 19:00 UTC
  se fecha el **24**, y el rango del día lleva `+05:45`, no `+06:00` ni `Z`. Es el único
  caso que descarta una implementación «por horas enteras».
- **La sucursal manda**: el mismo envío cuenta como de hoy o de mañana según esté su
  sucursal en Bogotá o en Katmandú, y las pruebas comprueban además **con qué identidad** se
  llamó a `resolveTimezone` (organización *y* `branch_id`), que es el contrato de ADR-003.
- **Prefijo de cadena contra instante**: tres envíos alrededor de la medianoche de Bogotá.
  El criterio viejo contaba 1 (el de ayer, porque su cadena UTC empieza por el día de hoy);
  el nuevo cuenta 2 (los dos que de verdad son de hoy).

`npx jest src/__tests__/timezone` verde. El archivo nuevo pasa en las **seis** zonas del
`test:tz-all` (UTC, Bogotá, Madrid, Katmandú, Santiago, Ciudad de México): 526 pruebas, 16
suites, verde en las seis.

### Mutaciones

**12 mutaciones, 12 muertas, 0 supervivientes**, y el md5 de cada uno de los ocho archivos
de servicio idéntico antes y después (script y resultados en el scratchpad de sesión,
`.../scratchpad/tz-t7/mutar.py` y `mutaciones.json`; `restauracion_ok: true`).

Volver al día UTC del manifiesto · ignorar la sucursal al duplicar el manifiesto · código de
viaje con el día UTC · estadísticas de viajes que ignoran la sucursal · envíos de hoy por
prefijo de cadena · tiquetes filtrados con una cadena sin offset · tracking filtrado con un
día en crudo contra un `timestamptz` · datepicker leído en UTC · horizonte de vencimientos
en bloques de 24 h · recurrencia semanal con `new Date(dia).getDay()` · tablero que ignora
la sucursal seleccionada · vigencia del horario recortada con `Date` en vez de con días.

Once mueren con `TZ=UTC`. La duodécima —la del `getDay()` local— **solo muere con
`TZ=America/Bogota`**, y es lógico: bajo `TZ=UTC` el código viejo acierta por casualidad,
porque el reloj del proceso coincide con el reloj en el que se interpretó la cadena. Es la
misma lección de las tandas 2 y 4 en otra forma: **una prueba de zona horaria que no elige
el instante —o la zona del proceso— a propósito no prueba nada.** Queda anotado en la
propia prueba y en el guion de mutaciones, que declara para cada mutación en qué zona debe
morir.

### NO VERIFICADO

- `npx tsc --noEmit` **completo** y `next build`: no se ejecutan (el encargo los excluye).
  El `tsc` acotado a los 12 archivos tocados más la prueba nueva da **0 errores**.
  Comprobado que ese `tsc` acotado sí detecta errores —se le inyectó uno a propósito y lo
  reportó—, para descartar el falso «0 errores» por falta de heap ya anotado en sesiones
  anteriores.
- ESLint: **0 problemas nuevos**. En los archivos siguen los 51 errores **preexistentes**
  de `no-explicit-any`, `no-unused-vars` y un `prefer-const` en `manifestsService`, y un
  aviso de `react-hooks/exhaustive-deps` en `GenerateTripsDialog` que ya estaba. El recuento
  total de problemas sobre estas rutas es el mismo antes y después: 52.
- **Las cuatro páginas cliente no tienen prueba unitaria.** El proyecto no tiene
  `@testing-library` ni entorno `jsdom` (`jest.config.js` usa `testEnvironment: 'node'`), y
  montar uno para esta tanda es más cambio que la tanda. `viajes/page.tsx`,
  `mis-envios/page.tsx`, `tracking/page.tsx` y `GenerateTripsDialog.tsx` quedan cubiertos
  solo por `tsc`, por el `error` de ESLint y por las pruebas de los helpers que ahora usan
  (`sumarDiasAlDia`, `toPlainDate`, `plainDayOfInstant`, `getDayRange`). Es la mayor
  debilidad de esta tanda y conviene decirlo así.
- Nada probado en navegador.
- **Ninguna escritura en la base de datos y ninguna migración**: la tanda se resuelve en
  código. Del MCP solo se usó `execute_sql` contra `information_schema` y `pg_policies`,
  en lectura.
- **Rojos ajenos en el árbol compartido.** `npm run test:tz-all` no llega al final por
  `src/__tests__/timezone/openFinanceYMonedas.test.ts` (1 caso, año de la concentración de
  pagos), que es trabajo **sin commitear de otra sesión** (tandas 9 y 10: el archivo de
  prueba está sin rastrear y `treasuryService`/`balanceService`/`transactionSyncService`
  aparecen modificados). En una segunda pasada con `TZ=America/Bogota` cayó además un caso
  de `pmsParkingReportes.test.ts` (tandas 6 y 8) que en la pasada anterior estaba verde, y
  `timezoneFallback.test.ts` falló una vez en lote y pasó en solitario. Ninguno toca
  archivos de esta tanda. Excluyendo `openFinanceYMonedas`, las seis zonas dan verde.
- Sin `git add`, `commit`, `push`, `stash` ni cambio de rama.

---

## Fase B — tandas 6 y 8 (PMS presentacion/tape chart y parking reportes/tablero) · 2026-09-23

Encargo: las tandas 6 (PMS: `pmsDashboardService`, `tapeChartService`, calendario, reservas,
`pmsCrmLink`) y 8 (parking: `parkingDashboardService`, `parkingReportService`, filtros y pagina
de reportes). Sin commit: los cambios quedan en el arbol.

### Correcciones al inventario

1. **La tanda 6 son 18 ocurrencias, no 21.** Contando las lineas que el propio inventario
   nombra: `pmsDashboardService` 128,129,205,206,263,264,318,319,414,415 (10),
   `tapeChartService` 296,310,379 (3), `pms/calendario/page.tsx` 66,78 (2),
   `pms/reservas/page.tsx` 355 (1), `pmsCrmLink` 119,120 (2). La tanda 8 si son 11.
   Medido sobre `HEAD`: 29 en los dos lotes juntos.

2. **`parkingReportService` tiene mucho mas que las dos lineas del inventario.** El inventario
   solo apunta 167 y 171 (la clave de agrupacion). Lo gordo estaba en las consultas: **los ocho
   metodos** que filtran por fecha comparaban `parking_sessions.entry_at` y
   `payments.created_at` —los dos **timestamptz**— contra los dias sueltos del filtro:

   ```
   .gte('entry_at', '2026-09-01').lte('entry_at', '2026-09-23')
   ```

   Postgres lee esas cadenas como medianoche UTC, asi que **el ultimo dia del informe no
   entraba** (solo su primera hora en Bogota) y el corte iba desplazado el offset entero. Un
   informe «del 1 al 23» perdia casi todas las sesiones del 23 y se comia las de la tarde del
   31 del mes anterior. Eso no aparece en el recuento del inventario porque no usa
   `toISOString()`: es el mismo bug por el otro lado.

3. **Dos lecturas mas que el inventario no lista y que van en el mismo commit**, por la regla
   de oro (columna `timestamptz` = ida y vuelta):
   `pmsDashboardService:518` hacia `m.created_at?.split('T')[0]` sobre
   `maintenance_orders.created_at`, y `parkingReportService.exportToCSV` imprimia
   `new Date(entry_at).toLocaleString('es-CO')` **sin `timeZone`**.

4. **`parking_passes` no tiene `branch_id`** (confirmado por MCP; solo `organization_id`), asi
   que ahi la zona es la de la organizacion. `parking_sessions` si tiene las dos.

### Tipos verificados por MCP (`information_schema.columns`, `jgmgphmzusbluqhuqihj`)

| Tabla.columna | Tipo | Consecuencia |
|---|---|---|
| `reservations.checkin` / `.checkout` | **date** | dia calendario; basta `todayInTz` / `toPlainDate` |
| `reservation_blocks.date_from` / `.date_to` | **date** | idem |
| `opportunity_spaces.checkin_date` / `.checkout_date` | **date** | idem |
| `parking_passes.start_date` / `.end_date` | **date** | idem; la tabla **no** tiene `branch_id` |
| `maintenance_orders.created_at` | **timestamptz** | ida y vuelta: `plainDayOfInstant` |
| `parking_sessions.entry_at` / `.exit_at` / `.created_at` | **timestamptz** | ida y vuelta: `getDayRange` / `getDateRange` |
| `payments.created_at` | **timestamptz** | idem |

Cero escrituras y cero DDL: las dos tandas se resuelven en codigo.

### Tanda 6 — fila por fila

| Call-site (inventario) | Destino · tipo | Arreglo | Zona |
|---|---|---|---|
| `pmsDashboardService:128,129` (`getDashboardStats`) | `reservations.checkin`/`.checkout` · **date** | `todayInTz(tz)` / `toPlainDate(d, tz)` | sucursal del filtro, si la hay |
| `pmsDashboardService:205,206` (`getArrivals`) | idem | idem | idem |
| `pmsDashboardService:263,264` (`getDepartures`) | idem | idem | idem |
| `pmsDashboardService:318,319` (`getAlerts`) | `checkin`, `reservation_blocks.date_from` · date | `todayInTz` + `sumarDiasAlDia(hoy, 1)` | idem |
| `pmsDashboardService:414,415` (`getWeekCalendarEvents`) | idem | `todayInTz` + `sumarDiasAlDia(hoy, 7)` | idem |
| `pmsDashboardService:518` **(no estaba en el inventario)** | `maintenance_orders.created_at` · **timestamptz** ⚠ | `plainDayOfInstant(created_at, tz)` | idem |
| `tapeChartService:296` (`getOccupancyData`, init del mapa) | dias del rango | `diasEntreDias` + `sumarDiasAlDia` | no hace falta: entrada ya es dia |
| `tapeChartService:310` (bucle de ocupacion) | `checkin`/`checkout` · date | `nextPlainDay` sobre cadenas, sin `Date` | idem |
| `tapeChartService:379` (`generateDateRange`) | dias del tape chart | `sumarDiasAlDia(startDate, i)` | idem |
| `pms/calendario/page.tsx:66,78` | dia inicial del tape chart | el estado pasa a ser el dia `YYYY-MM-DD`; `getToday()` tras `tzLoading`, `sumarDiasAlDia` para navegar | `useFormatDate(branchFilter)` |
| `components/pms/calendario/TapeChartHeader.tsx` **(arrastrado)** | props del encabezado | `startDay: string` / `onStartDayChange` | — |
| `pms/reservas/page.tsx:355` | `CheckoutService.getDepartures(org, hoy)` sobre `checkout` · date | `getToday()` | `useFormatDate(branchFilter)` |
| `crm/pmsCrmLink.ts:119,120` | `reservations.checkin`/`.checkout` · date (respaldo) | `todayInTz` + `sumarDiasAlDia(hoy, 1)` | `resolveTimezone(orgId, branchId)` |

**El inventario decia que `pmsCrmLink` necesita cambio de firma. No lo necesita:** la funcion ya
resolvia `getOrganizationId()` y `getCurrentBranchIdWithFallback()` en sus primeras lineas. La
identidad estaba ahi; lo unico que faltaba era usarla.

**Por que el calendario cambia de tipo de estado.** Guardaba un `Date` puesto a medianoche
**local del navegador** y lo convertia con `toISOString()` cada vez que hablaba con el servicio.
Eso es el dia UTC: en un hotel de Bogota, a partir de las 19:00 el tape chart arrancaba en el dia
siguiente. Convertir el `Date` con `toPlainDate` no arregla el problema de raiz, porque la ida y
la vuelta (el `Date` local del datepicker -> dia de la organizacion -> `Date` local otra vez) no
es estable cuando el navegador y la organizacion estan en husos distintos. El estado pasa a ser
el valor de negocio —`YYYY-MM-DD`— y el `Date` solo existe dentro del encabezado, al mediodia
local, para que `date-fns` y el widget pinten el numero correcto.

### Tanda 8 — fila por fila

| Call-site (inventario) | Destino · tipo | Arreglo | Zona |
|---|---|---|---|
| `parkingDashboardService:68` (`getDashboardStats`) | `parking_sessions.created_at` · **timestamptz** ⚠ | `getDayRange(todayInTz(tz), tz)` y `gte`/`lte` sobre instantes | sucursal si la hay |
| `parkingDashboardService:251,252` (`getExpiringPasses`) | `parking_passes.end_date` · **date** | `todayInTz` + `sumarDiasAlDia(hoy, N)` | organizacion (la tabla no tiene sucursal) |
| `parkingDashboardService:326` (`getHourlyStats`) | `entry_at` · **timestamptz** ⚠ | `getDayRange`; **firma nueva** `(branchId, organizationId, date?)` | sucursal |
| `parkingDashboardService:421` (`getDailySummary`) | dia objetivo | `todayInTz(tz)` | sucursal |
| `parkingReportService:167,171` (`getRevenueByPeriod`) | clave de agrupacion desde `entry_at` · timestamptz ⚠ | `toPlainDate(instante, tz)`; semana con `diaDeLaSemanaDelDia` + `sumarDiasAlDia`; mes por `dia.slice(0,7)` | sucursal del filtro |
| `parkingReportService` × 8 metodos **(no estaba en el inventario)** | filtros sobre `entry_at` / `payments.created_at` · **timestamptz** ⚠ | `getDateRange(desde, hasta, tz)` en un unico helper privado `rangoDeInstantes` | sucursal del filtro |
| `parkingReportService.getOccupancyByHour` **(idem)** | hora de `entry_at` | hora de pared en la zona, no `getHours()` | idem |
| `parkingReportService.exportToCSV` **(idem)** | impresion de `entry_at`/`exit_at` ⚠ | `formatDateTimeInTz` | idem |
| `parkingDashboardService.getDaysRemaining` **(idem)** | dias restantes de un pase | `diasEntreDias(hoy, end_date)`; **firma nueva** `(endDate, hoy)` | del llamador |
| `parkingDashboardService.getHourlyStats` (contador) **(idem)** | hora de `entry_at`/`exit_at` | hora de pared en la zona | sucursal |
| `components/parking/reportes/ReportesFilters.tsx:53,54` | rango rapido del informe | `getToday()` + `sumarDiasAlDia` / `sumarMesesAlDia` | contexto |
| `app/parking/reportes/page.tsx:35,36` | rango por defecto (30 dias) | `getToday()` dentro de un efecto que espera a `tzLoading` | contexto |

**Dos correcciones de semantica** que van mas alla de la zona y que conviene revisar:

1. **El corte de `getHourlyStats` perdia el ultimo segundo del dia** (`< ${dia}T23:59:59`).
   `getDayRange` llega hasta `23:59:59.999`.
2. **«Un mes atras» en el filtro rapido ya no son 30 dias.** Usa `sumarMesesAlDia`, que recorta
   al ultimo dia del mes en vez de desbordar; el boton «1A» pasa a ser `-12` meses.

Y una de comportamiento, para que nadie la descubra en produccion: el rango por defecto de
`app/parking/reportes` **ya no pisa el que el usuario tenga guardado en `localStorage`**. Antes
el `useState` inicial se calculaba siempre y el efecto de `localStorage` lo sobreescribia; ahora
el defecto se calcula despues (hay que esperar a la zona), asi que solo rellena si el hueco sigue
vacio.

### Deuda anotada

1. **Tablero de PMS consolidado.** Sin sucursal elegida, `pmsDashboardService` usa la zona de la
   organizacion. Un consolidado sobre sucursales en husos distintos **no tiene un unico «hoy»**:
   las llegadas de la sede de Madrid y las de la de Bogota no empiezan el mismo instante. Queda
   escrito en la cabecera del servicio. Resolverlo bien es agrupar por sucursal, y eso es un
   cambio de producto, no de zona horaria.
2. **`pms/reservas/page.tsx`.** `ReservationListItem` no trae `branch_id` (comprobado en
   `reservationListService`), asi que «las salidas de hoy» usan la zona de la sucursal del filtro
   de la barra superior, no la de la reserva. Es la misma forma de deuda que `AccountActionsCard`
   en la tanda 2: la cascada cae un nivel y da exactamente el comportamiento de hoy. Se cierra
   anadiendo `branch_id` al `select` de la lista.
3. **`ReportesFilters` y la pagina de reportes de parking no fijan sucursal.** `ReportFilters`
   tiene `branchId?`, el servicio ya lo usa para resolver la zona, pero la pagina nunca lo
   rellena: hoy todos los informes de parqueadero salen en la zona de la organizacion. En cuanto
   la pagina ofrezca el selector de sucursal, la zona correcta viene sola.
4. **`parking_passes` sin `branch_id`.** Un parqueadero con sedes en husos distintos calcularia
   la vigencia de sus abonos con la zona de la organizacion. Anadir la columna es fase D.
5. **`tapeChartService.checkConflicts`** sigue comparando con `new Date(dia)`. No se toco: los
   dos lados de cada comparacion se interpretan como medianoche UTC, asi que el resultado es
   correcto y el inventario no lo lista. Queda apuntado por si alguien mete ahi un `timestamptz`.

### Red

`src/__tests__/timezone/pmsParkingReportes.test.ts` — **45 casos**, verde en las **seis** zonas de
`test:tz-all` (`UTC`, `America/Bogota`, `America/Mexico_City`, `Europe/Madrid`,
`America/Santiago`, `Asia/Kathmandu`). Reutiliza `dobleSupabase.ts` de la tanda 3, que registra
tabla, operacion, payload y filtros: sin eso no se puede afirmar «con que extremos se filtra».

Los cuatro instantes del reloj falso estan elegidos para que el dia de la organizacion y el de
UTC **no** coincidan; si coincidieran, la prueba pasaria tambien con el codigo viejo (leccion de
la tanda 5, escrita en la cabecera del archivo):

- `2026-09-24T01:00Z` — Bogota sigue en el 23 a las 20:00, UTC ya esta en el 24.
- `2026-09-22T22:30Z` — Madrid ya esta en el 23 a las 00:30, UTC sigue en el 22.
- `2026-10-24T22:30Z` — Madrid esta en el 25 **y ese dia dura 25 h**: `Date.now() + 86400000`
  sigue cayendo en el 25, o sea «manana» seria «hoy». Es el caso que mata la version con 24 h.
- `2026-09-23T19:00Z` — Katmandu (**+05:45**, offset no entero) esta en el 24 a las 00:45.

Ademas: el dia de 25 h de Madrid empieza en `+02:00` y termina en `+01:00` en el mismo rango;
una sesion del 31 de enero a las 23:00 en Bogota se agrupa en enero y no en febrero (dia, semana
y mes); el mapa de ocupacion del tape chart cuenta desde el check-in y **no** cuenta la noche de
salida, con el 29 de febrero bisiesto y el cruce de ano; y un pase que vence hoy dice 0 dias, no 1.

### Mutaciones

**24 mutaciones, 24 muertas, 0 supervivientes**, md5 de los 10 archivos identico antes y despues
(`.../scratchpad/tz-t68/mutar.py`, `mutaciones.json`, `mutaciones-resultado.json`).

Cubren: volver al dia UTC en el tablero de PMS, ignorar la sucursal del filtro, «manana» como
24 h, la semana como 7×24 h, el dia de la orden de mantenimiento por el dia UTC, el tape chart
de vuelta a `Date` + `setDate`, contar la noche de salida, el respaldo de CRM→PMS en UTC, la
jornada del parqueadero como cadena sin offset, los pases por vencer en bloques de 24 h, los
dias restantes desde el dia UTC, la hora pico con `getHours()`, el corte que pierde el final del
dia, el rango del informe comparado contra dias sueltos, el rango resuelto en UTC, la zona que
ignora la sucursal, el agrupador por dia UTC, el CSV con hora ajena, los rangos rapidos y el dia
inicial del calendario calculados con el reloj del navegador, y el encabezado del tape chart de
vuelta a un `Date`.

**La primera pasada dejo una superviviente, y por la razon de siempre.** La guarda estatica de la
pagina de reportes comprobaba `expect(fuente).toContain('tzLoading')`, y la mutacion que quitaba
la GUARDA (`if (tzLoading || arrancado.current) return;` → `if (arrancado.current) return;`)
dejaba intacta la **declaracion** `const { isLoading: tzLoading } = useOrgTimezone();`. El token
seguia ahi y la guarda pasaba. Ahora exige el corto-circuito completo, literal. Es la leccion de
la tanda 2 en otra forma: **una guarda que comprueba que aparece un nombre no prueba que ese
nombre se use donde hace falta.**

### Metrica

Metrica 1 (escritura de dia en UTC), medida sobre el arbol de trabajo:
**161 antes / 132 despues**, −29, que es exactamente el numero de ocurrencias de los dos lotes
(10 + 3 + 2 + 1 + 2 en la tanda 6; 5 + 2 + 2 + 2 en la tanda 8). En los 10 archivos tocados:
**29 → 0**, y los comentarios que describen el patron viejo estan redactados para **no**
reproducirlo, de modo que no inflan el contador.

Los ocho filtros de `parkingReportService` y las tres lecturas en zona ajena
(`maintenance_orders.created_at`, `getHours()`, `toLocaleString` del CSV) **no aparecen en esta
metrica**: son el mismo bug por el lado que el `grep` no ve.

Rutas anadidas al bloque `overrides` de `.eslintrc.json` con la regla en `error`:
`src/lib/services/pmsDashboardService.ts`, `src/lib/services/tapeChartService.ts`,
`src/lib/services/crm/pmsCrmLink.ts`, `src/app/app/pms/calendario/**`,
`src/app/app/pms/reservas/**`, `src/lib/services/parkingDashboardService.ts`,
`src/lib/services/parkingReportService.ts`, `src/components/parking/reportes/**`,
`src/app/app/parking/reportes/**`. (`src/components/pms/**` ya estaba.) Los cuatro directorios
quedan a cero ocurrencias, comprobado antes de subir la regla a `error`.

### NO VERIFICADO

- `npx tsc --noEmit` **completo** y `next build`: no se ejecutan (el encargo los excluye por el
  arbol compartido). El `tsc` acotado a los 10 archivos tocados da **0 errores**, y se comprobo
  que ese `tsc` acotado **esta vivo**: con un `const _prueba: number = 'cadena'` inyectado a
  proposito lo detecta (`TS2322`), asi que el silencio no es el falso «0 errores» por falta de
  heap ya anotado en las notas de sesion.
- ESLint: **0 problemas en las lineas nuevas** (medido cruzando `eslint --format json` con las
  lineas anadidas segun `git diff -U0`); el archivo de pruebas esta limpio. En los archivos
  tocados siguen los errores **preexistentes** de `no-explicit-any` (`tapeChartService`,
  `parkingDashboardService`, `pmsCrmLink`) y dos avisos de `import/no-anonymous-default-export`,
  que no se han limpiado en estas tandas. Si se tipo la unica fila `any` que se reescribio
  (`FilaOcupacion` en `tapeChartService`).
- **Nada probado en navegador.** En particular no se ha visto que el tape chart y la pagina de
  reportes no parpadeen mientras el contexto resuelve la zona: ambas arrancan con el dia vacio a
  proposito, y el encabezado del tape chart pinta `--/--/----` en ese hueco.
- `src/__tests__/timezone` completo mas `guardrails.test.ts`: **548 de 549** en `TZ=UTC` y en
  `TZ=America/Bogota`. El unico fallo es
  `src/__tests__/timezone/openFinanceYMonedas.test.ts` (`transactionSyncService`), un archivo
  **sin seguimiento en git** que pertenece a otra sesion trabajando en paralelo en las tandas 9 y
  10; no toca ninguno de los archivos de este encargo. `guardrails.test.ts` en solitario: 116 de
  116.
- Cero escrituras en la base de datos. Ninguna migracion: no hizo falta DDL.
- Sin `git add`, `commit`, `push`, `stash` ni cambio de rama.


---

## Fase B — tandas 9 y 10: open finance, tesoreria y monedas (2026-09-23)

Dos tandas en un mismo modulo (finanzas) que **no comparten regla**, y esa distincion es lo
principal que deja escrito este commit:

- **Tanda 9** filtra tablas que llevan organizacion y cuyas columnas de fecha son
  `timestamptz`. Ahi el dia es el de la organizacion (o el de la sucursal duena del dato) y
  ademas hay que convertirlo a instantes antes de tocar la consulta.
- **Tanda 10** escribe y lee `currency_rates`, un catalogo **global sin organizacion**.
  [ADR-004](adr/ADR-004-dia-utc-en-el-catalogo-global-de-tasas.md) decide que su dia es el del
  sistema y que **no** se le fuerza la zona de ninguna organizacion. Lo que si lleva la zona de
  la organizacion es **leer** ese catalogo para un informe contable.

### Lo que el inventario no contaba, y aparecio al abrir los archivos

`accounts_receivable.due_date`, `accounts_payable.due_date`, `payments.payment_date`,
`bank_transactions.trans_date` y `open_finance_transactions.transaction_date` son **todas
`timestamp with time zone`** (comprobado por MCP en `information_schema.columns`). El servicio
de tesoreria las filtraba con una cadena `'YYYY-MM-DD'`. Eso son **dos errores encadenados**, no
uno: primero el dia se derivaba en UTC, y segundo, Postgres lee esa cadena como la medianoche
UTC. En Bogota el corte de «hoy» caia a las 19:00 del dia anterior. Una factura que vence hoy a
las 20:00 entraba en el flujo de caja de manana y, peor, salia en la lista de **vencidas**.

Por eso la tanda 9 toco tres sitios mas de los que el inventario listaba:
`detectInterAccountTransfers` y `getPaymentConcentration` (mismos filtros de dia contra
`timestamptz`) y `anomalyDetectionService`, que mete el **dia** dentro de la clave con la que
agrupa duplicados: dos cargos identicos a las 18:00 y a las 20:00 en Bogota caian en grupos
distintos —un dia UTC cada uno— y el duplicado no se detectaba. Eso es pagar dos veces la
misma factura.

### Como se aplico ADR-004, literal

**Escribir el catalogo:** `src/lib/services/openexchangerates.ts` no resuelve ninguna zona de
organizacion. Se introdujo una constante con nombre, `ZONA_DEL_CATALOGO_GLOBAL`, gemela en el
cliente de `fn_today_system()` en Postgres, y una prueba comprueba que `guardarTasasDeCambio`
**no llama a `resolveTimezone` ni una vez**, aunque la organizacion activa este en Katmandu.
Lo que si desaparecio es que el dia saliera del reloj del navegador: la version anterior hacia
`date.getTime() - date.getTimezoneOffset() * 60000` y luego recortaba el ISO, asi que dos
administradores en husos distintos guardaban la misma tanda de tasas bajo dos `rate_date`
diferentes. Las tres fechas que vienen del proveedor (`fecha_api`, `actual_date`) quedan en la
zona del proveedor, `UTC`, con su constante y su motivo escrito (ADR-004 §4).

**Leer el catalogo:** ADR-004 dice tambien que eso «no autoriza leer el catalogo con el dia
UTC». Ahi si entra la organizacion, en tres sitios:

- `ReportesContablesService.getExchangeRate` — el dia contable sale de
  `resolveTimezone(this.getOrganizationId())`, y la busqueda sigue siendo
  `rate_date <= dia` ordenada hacia atras: **la vigente**, que es lo unico que tiene sentido
  cuando el catalogo puede ir un dia por detras del negocio.
- `CurrencyConverter` y `ExchangeRatesTable` — `useFormatDate()`, conservando el respaldo que
  ya tenian (si no hay filas para ese dia, la fecha mas reciente disponible).

Y `exchange_rates` —que **si** lleva `organization_id`— pasa a escribir su `effective_date` con
el dia de esa organizacion. La misma llamada desde una organizacion en Bogota y otra en Katmandu
escribe dias distintos, y eso es lo correcto: es la diferencia exacta con `currency_rates`.

### Tabla fila por fila

Zona: `org` = organizacion · `branch` = sucursal duena del dato · `ctx` = contexto de React ·
`sistema` = zona del SaaS (ADR-004) · `proveedor` = UTC del proveedor.

| Archivo:linea (antes) | Destino real (tabla.columna · tipo) | Arreglo | Zona |
|---|---|---|---|
| `treasuryService.ts:268,269` | `accounts_receivable/payable.due_date` · **timestamptz** (filtro) | `todayInTz` + `addPlainDays` + `getDateRange` | org |
| `treasuryService.ts:311,318` | idem (lectura) | `plainDayOfInstant` | org |
| `treasuryService.ts:331` | iteracion dia a dia de la proyeccion | dias planos + `nextPlainDay` | org |
| `treasuryService.ts:418` *(no inventariado)* | `bank_transactions.trans_date` · **timestamptz** (filtro) | `getDateRange` | org |
| `treasuryService.ts:524` *(no inventariado)* | `payments.payment_date` · **timestamptz** (filtro) | `getDateRange` | org |
| `treasuryService.ts:652,655` | `accounts_payable.due_date` · timestamptz (vencidas / proximas) | `todayInTz` + `getDayRange().start` + `getDateRange` | org |
| `treasuryService.ts:700` | texto de la alerta | `plainDayOfInstant` | org |
| `treasuryService.ts:707,710` | inicio de anio de la concentracion | `todayStr.slice(0,4)` | org |
| `balanceService.ts:383,384` | `open_finance_transactions.transaction_date` · **timestamptz** | `todayInTz` + `addPlainDays` + `getDateRange` | **branch** |
| `balanceService.ts:404` | idem (agrupacion diaria) | `plainDayOfInstant` | branch |
| `balanceService.ts:419` | curva diaria de saldo | dias planos + `nextPlainDay` | branch |
| `transactionSyncService.ts:62,63` | ventana por defecto que se pide al proveedor | `todayInTz` + `addPlainDays` | org del link |
| `transactionSyncService.ts:401,403,404` | `open_finance_links.last_sync_at` · **timestamptz** | `plainDayOfInstant` + `addPlainDays` | org del link |
| `anomalyDetectionService.ts:158,175,218` *(arrastre)* | `bank_transactions.trans_date`, `open_finance_transactions.transaction_date` · timestamptz | `plainDayOfInstant` | org |
| `TesoreriaPage.tsx:145,146` | rango «anio actual hasta hoy» del endpoint | `getToday()` + `slice(0,4)` | ctx |
| `open-finance/page.tsx:143` | `open_finance_transactions.transaction_date` · timestamptz (conteo 30 dias) | `addPlainDays` + `getDayRange().start` | ctx |
| `openexchangerates.ts:146,155,187` | `fecha_api` / `actual_date` del proveedor | `toPlainDate(x, 'UTC')` + constante con motivo | **proveedor** |
| `openexchangerates.ts:340-342,347` | `currency_rates.rate_date` · **date** (upsert) | `toPlainDate(date, ZONA_DEL_CATALOGO_GLOBAL)` / `todayInTz(...)` | **sistema** |
| `openexchangerates.ts:501` | parametro `rate_date` de la RPC `update_global_exchange_rates` | `todayInTz(ZONA_DEL_CATALOGO_GLOBAL)` | sistema |
| `openexchangerates.ts:603` | solo `console.log` | `toPlainDate(..., ZONA_...)` | sistema |
| `openexchangerates.ts:687` | variable muerta (`formattedDate` que no usaba nadie) | borrada | — |
| `openexchangerates.ts:1161` | lista de dias habiles a consultar al proveedor | `todayInTz` + `addPlainDays` + `nextPlainDay`; dia de la semana leido del propio dia plano | sistema |
| `currencyService.ts:184` | `exchange_rates.effective_date` · **date** (entrada de cache) | `todayInTz(await resolveTimezone(organizationId))` | org |
| `currencyService.ts:249` | `exchange_rates.effective_date` · date (filtro + insert) | idem; **muere el valor por defecto de la firma** | org |
| `CurrencyConverter.tsx:101` | filtro `currency_rates.rate_date` · date | `toDate(date)` / `getToday()` | ctx |
| `CurrencyConverter.tsx:210,211,231` | `console.log` y una variable muerta | borrados; `loadPreviousRate` pasa a recibir un **dia plano**, no un `Date` | ctx |
| `CurrencyConverter.tsx:267` | filtro `rate_date` de «ayer» | `previousPlainDay(getToday())` | ctx |
| `ExchangeRatesTable.tsx:43` | filtro `rate_date >= hoy-5` · date | `addPlainDays(getToday(), -5)` | ctx |
| `ExchangeRatesTable.tsx:259` *(no inventariado)* | «hay datos de hoy» → `format(new Date(), 'yyyy-MM-dd')` | `getToday()` | ctx |
| `ExchangeRatesTable.tsx:719` | `.split('T')[0]` sobre una columna **date** | quitado el no-op, con el motivo escrito | — |
| `ExchangeRateHistory.tsx:181` *(no inventariado)* | nombre del CSV descargado | `getToday()` | ctx |
| `ReportesContablesService.ts:115,118` | filtro `currency_rates.rate_date` · date (tasa vigente) | `todayInTz(await resolveTimezone(getOrganizationId()))` | **org** |

Cambios de contrato, para que nadie los descubra por sorpresa:

- `currencyService.updateExchangeRate` **pierde** el valor por defecto que derivaba el dia en
  UTC dentro de la propia firma y pasa a `effectiveDate?: string`, resuelto dentro. Un `default`
  en la firma no puede esperar a `resolveTimezone`.
- `CurrencyConverter.loadPreviousRate(previousDate)` recibe ahora un `YYYY-MM-DD`, no un `Date`.
  Pasar un `Date` obligaba a decidir otra vez dentro en que zona se lee, y ese era el punto por
  el que se colaba el dia UTC.
- `BalanceService.getBalanceHistory` **no cambia de firma**: la identidad sale de la fila que ya
  consultaba (`bank_accounts.organization_id` y `.branch_id`). Es lo que pide ADR-003 —
  identidad, no zona— sin tocar a ningun llamador y sin colar un `timezone?: string`.
- `TransactionSyncService.syncTransactions` consulta el link **antes** que nada, porque de el
  sale la organizacion y de la organizacion la zona de las fechas por defecto.

### Nuevo en la capa compartida

`addPlainDays(dia, n)` en `src/lib/utils/dateCore.ts`, reexportada por `utils/timezone.ts` y
`utils/dateDisplay.ts`. Generaliza `nextPlainDay`/`previousPlainDay` y existe porque «hoy + 90
dias» y «hoy - 30 dias» aparecian en seis servicios resueltos con
`const d = new Date(); d.setDate(d.getDate() + n)`, que trabaja sobre la hora de pared del
navegador. Es aritmetica de dias **calendario**: sumar 1 avanza un dia tambien en los dias de
23 h y 25 h del cambio de hora, donde sumar `24 * 60 * 60 * 1000` a un instante no lo hace.
Otras sesiones que toquen `dateCore.ts` deben contar con esta funcion.

### Recuento

Metrica 1 (el `grep` del inventario), en **mis rutas**:

| Archivo | Antes | Despues |
|---|---:|---:|
| `treasuryService.ts` | 6 | 0 |
| `balanceService.ts` | 3 | 0 |
| `transactionSyncService.ts` | 5 | 0 |
| `TesoreriaPage.tsx` | 2 | 0 |
| `app/finanzas/open-finance/page.tsx` | 1 | 0 |
| **Tanda 9** | **17** | **0** |
| `openexchangerates.ts` | 8 | 0 |
| `currencyService.ts` | 2 | 0 |
| `CurrencyConverter.tsx` | 6 | 0 |
| `ExchangeRatesTable.tsx` | 1 | 0 |
| `ReportesContablesService.ts` | 2 | 0 |
| **Tanda 10** | **19** | **0** |
| `ExchangeRateHistory.tsx` (para poder subir `monedas/**` a `error`) | 1 | 0 |
| **Total** | **37** | **0** |

Ademas, **4** ocurrencias de `.split('T')[0]` sobre valores de la BD (regla 2) en
`anomalyDetectionService.ts` (3, sobre `timestamptz`) y `ExchangeRatesTable.tsx` (1, sobre una
columna `date`, inofensiva pero quitada). El `grep` de la metrica 1 **no las ve**: son el mismo
bug por el lado que el contador no mide.

El total global del repositorio no se atribuye aqui: el arbol es compartido y otras sesiones
estan reduciendolo en paralelo durante las mismas horas.

Rutas anadidas al bloque `overrides` de `.eslintrc.json` con la regla en `error`:
`src/lib/services/integrations/openFinance/**`,
`src/components/finanzas/bancos/TesoreriaPage.tsx`, `src/app/app/finanzas/open-finance/**`,
`src/lib/services/openexchangerates.ts`, `src/lib/services/currencyService.ts`,
`src/components/finanzas/monedas/**`,
`src/components/finanzas/contabilidad/ReportesContablesService.ts` y
`src/lib/utils/dateCore.ts`. Los globs quedan a **cero** ocurrencias antes de subir la regla;
por eso se arreglaron tambien `anomalyDetectionService.ts` y `ExchangeRateHistory.tsx`, que
caen dentro de ellos sin estar en el encargo.

### Pruebas

`src/__tests__/timezone/openFinanceYMonedas.test.ts`, **23 casos**, verde en `TZ=UTC`,
`TZ=America/Bogota`, `TZ=Europe/Madrid`, `TZ=Asia/Kathmandu` y `TZ=America/Santiago`. El reloj
es falso en todos: sin eso cada caso solo fallaria unas horas al dia.

Los instantes estan elegidos para que las tres lecturas posibles den **dias distintos**:

- `2026-03-28T23:30:00Z` — en Madrid ya es el 29, y el 29 es el dia en que el reloj salta de
  +01:00 a +02:00. El rango de la proyeccion sale con **un offset en cada extremo**
  (`...+01:00` la salida, `...+02:00` la llegada): el cambio de hora ocurre *dentro* del rango.
- `2026-06-15T18:30:00Z` — Katmandu (+05:45) ya esta en el dia siguiente. El filtro lleva
  `+05:45`, no `+06:00` ni `Z`.
- `2026-06-16T02:00:00Z` — UTC dice 16, el sistema (Bogota) dice 15 y Katmandu dice 16. Es el
  instante que separa ADR-004 de lo demas.
- `2026-01-01T02:00:00Z` — en Bogota siguen siendo las 21:00 del 31 de diciembre de 2025, asi
  que el «anio actual hasta hoy» tiene que ser el 2025 entero.

**Mutaciones: 15 aplicadas, 15 muertas.** Cada una devuelve una linea al codigo viejo (el dia a
UTC, el filtro a cadena de dia, la agrupacion al dia UTC del `timestamptz`, la zona de la
sucursal a la de la organizacion, `addPlainDays` a `days - 1`, y `ZONA_DEL_CATALOGO_GLOBAL` a
`'UTC'`). Dos sobrevivieron en la primera pasada —las de `anomalyDetectionService`— porque el
par de transacciones de prueba estaba elegido donde el dia UTC y el dia de Bogota coinciden; se
reescribio el caso para que los dos cargos queden a caballo de la medianoche UTC **y** el
primero del grupo tenga el dia UTC distinto del suyo de negocio. Copia de ruta completa y `md5`
de los 8 archivos antes y despues: los 8 coinciden tras restaurar.

### Deuda anotada

1. **`fn_today_system()` no es el dia UTC.** ADR-004 se titula «el dia UTC» y razona sobre
   `CURRENT_DATE` (UTC en este servidor), pero su §3 se apoya en que
   `currency_rates.rate_date` tiene `DEFAULT fn_today_system()`. Comprobado por MCP:
   `fn_today_system()` es `(now() AT TIME ZONE 'America/Bogota')::date`. O sea que **la propia
   tabla ya tiene dos criterios de dia**: el `DEFAULT` escribe el dia de Bogota y las siete
   funciones de la lista blanca escriben el dia UTC; entre las 00:00 y las 05:00 UTC discrepan.
   El cliente se ha alineado con `fn_today_system()`, que es lo que pedia el encargo.
   Reconciliarlos es DDL y **no se ha tocado**.
2. **`balanceService.getBalanceHistory` filtra por una columna que nunca casa.** Usa
   `.eq('account_id', String(bankAccountId))` contra `open_finance_transactions.account_id`, que
   es un **uuid** que referencia `open_finance_accounts.id`, mientras que `bankAccountId` es el
   entero de `bank_accounts.id`. Bug preexistente y ajeno a las fechas; no se ha tocado, pero
   significa que esa curva de saldo hoy sale plana en produccion.
3. **Fase C en los mismos archivos.** `ExchangeRatesTable` compara `date > new Date()` y
   `date.getDate() === today.getDate()` con el reloj del navegador (lineas ~484 y ~521), y pinta
   `new Date(rate.rate_date).toLocaleDateString('es')` sobre una columna **date** (~944, ~951),
   que es justamente el caso que `formatPlainDate` existe para evitar.
   `app/finanzas/open-finance/page.tsx:82` formatea un `timestamptz` con
   `toLocaleString('es-CO')` sin zona.
4. **El contrato de `getPaymentConcentration` / `detectInterAccountTransfers`** es ahora
   «`dateFrom` y `dateTo` son dias calendario de la organizacion». El route handler
   `/api/integrations/open-finance/treasury/concentration` los toma del query string y solo
   comprueba que existan: no valida el formato. `TesoreriaPage` ya manda `YYYY-MM-DD`.
5. Los ~250 `toLocaleString` de importes y numeros siguen intactos, como manda el inventario.

### NO VERIFICADO

- `next build`: **no se ejecuta** (lo excluye el encargo). `npx tsc --noEmit -p tsconfig.json`
  completo, con `--max-old-space-size=8192` para que no sea el falso «0 errores» por falta de
  heap: **5 errores, todos en `src/__tests__/services/crmOportunidadesRonda.test.ts`**, un
  archivo ajeno a este encargo. **Cero** en los archivos tocados.
- ESLint sobre los archivos tocados: **cero** `no-restricted-syntax` y cero
  `no-restricted-imports`. Siguen los errores **preexistentes** de `no-explicit-any` y
  `no-unused-vars` de `CurrencyConverter.tsx`, `ExchangeRatesTable.tsx` y
  `ExchangeRateHistory.tsx`, que no se han limpiado: son de antes y limpiarlos es reescribir
  1.100 lineas de un componente que esta fuera del alcance de la fecha.
- **Nada probado en navegador.** No se ha visto la pantalla de tesoreria ni la de monedas.
- `src/__tests__/timezone` completo mas `guardrails.test.ts`: **548/548** en `TZ=UTC` y en
  `TZ=America/Bogota`. En `TZ=Asia/Kathmandu` fallan 3 casos de
  `src/__tests__/timezone/pmsParkingReportes.test.ts` y, en una de las pasadas, 3 de
  `src/__tests__/timezone/transporte.test.ts`: **ambos son archivos sin seguimiento en git** de
  otras sesiones trabajando en paralelo en este mismo arbol, y ninguno toca archivos de este
  encargo. La suite de estas dos tandas pasa sola en las cinco zonas. Los fallos aparecen y
  desaparecen entre pasadas porque esos archivos se estan editando mientras corren.
- Cero escrituras en la base de datos. **Ninguna migracion**: el esquema se consulto por MCP
  (`information_schema.columns` y `pg_get_functiondef`) y no hizo falta DDL.
- Sin `git add`, `commit`, `push`, `stash` ni cambio de rama.
