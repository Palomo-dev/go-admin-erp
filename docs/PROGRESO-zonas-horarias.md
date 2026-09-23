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
