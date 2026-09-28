# ADR-004 — El catálogo global de tasas decide el día con `fn_today_system()`

- **Estado:** aceptada — **sustituye a la versión anterior de este mismo ADR**
  («Las tasas de cambio se quedan con el día UTC, a propósito», 2026-09-23,
  fase D). El nombre del archivo se conserva a propósito para no romper los
  enlaces que ya apuntan aquí; el título sí cambió, porque la decisión cambió.
- **Fecha:** 2026-09-23 (reescritura del mismo día, tras las tandas 9-10)
- **Fase:** D — funciones de Postgres que deciden el día en UTC
- **Contexto mayor:** `docs/PROGRESO-zonas-horarias.md`, `docs/reglas-fechas-timezone.md`
- **Depende de:** `ADR-001-timezone-por-sucursal.md` (`fn_timezone_for`, `fn_today_for`)
- **Relacionada:** `ADR-005-inventario-de-current-date-contra-la-base-viva.md`
- **Migración:** `supabase/migrations/20260923235500_tasas_catalogo_dia_del_sistema.sql`
  · reversión en `supabase/rollbacks/`

## Por qué se reescribe: la premisa anterior era falsa

La versión anterior decidía dejar siete funciones con `CURRENT_DATE` y lo
justificaba así: «el catálogo global de tasas se queda con el día UTC». Suena
coherente. No era cierto.

`public.currency_rates` **nunca tuvo el día UTC**. Tenía **dos criterios de día
a la vez, dentro de la misma tabla**:

| Quién escribe | Qué día usa |
|---|---|
| `currency_rates.rate_date` — su `DEFAULT` | `fn_today_system()` |
| Las 7 funciones de `public` de este ADR | `CURRENT_DATE` |

Y `fn_today_system()` **no devuelve el día UTC**. Su cuerpo, verificado en
`pg_get_functiondef` el 2026-09-23, es:

```sql
RETURN (now() AT TIME ZONE 'America/Bogota')::date;
```

Es el día del SaaS, que es colombiano. `CURRENT_DATE`, en cambio, es el día de
la zona de **sesión**, y este servidor tiene `TimeZone = UTC` (verificado con
`current_setting('TimeZone')`). Los dos criterios apuntan al mismo día 19 horas
de cada 24 y a días distintos las otras 5.

La versión anterior de este ADR llegó a escribir el argumento correcto —«la
columna ya está alineada con esa idea… cambiar el cuerpo de estas funciones y no
la columna dejaría dos criterios distintos dentro de la misma tabla»— y sacó la
conclusión contraria a la que exigía: no vio que los dos criterios **ya estaban
puestos**, cada uno en un sitio.

## La ventana de desacuerdo, medida

Con el servidor en UTC y `fn_today_system()` en `America/Bogota` (UTC−5, sin
horario de verano), los dos criterios discrepan **de 00:00 a 04:59 UTC**: 5 horas
de cada 24, el **20,8 %** del día. En esa franja `CURRENT_DATE` va un día **por
delante** de `fn_today_system()`.

No es un borde teórico. **Los dos cron diarios de tasas corren a las 02:00 UTC**,
dentro de la ventana:

| Programador | Entrada | Hora |
|---|---|---|
| `cron.job` 4 | `select public.fn_cron_actualizar_tasas();` | `0 2 * * 1-6` |
| `cron.job` 5 | `SELECT public.auto_update_exchange_rates();` | `0 2 * * *` |
| Vercel (`vercel.json`) | `/api/cron/update-exchange-rates` | `0 2 * * *` |

02:00 UTC son las 21:00 del día **anterior** en Bogotá. Es decir: el camino
diario del catálogo pasa **siempre** por la franja en la que los dos criterios
no coinciden. Lo raro no habría sido que fallara, sino que acertara.

## Las siete funciones

Todas escriben (o mandan escribir) en `public.currency_rates`.

| Función | `CURRENT_DATE` | Para qué lo usaba |
|---|---|---|
| `auto_generate_missing_rates()` | 3 | inicio y fin de la ventana de 15 días, y el `end_date` que informa |
| `fill_historical_rates_real_api()` | 3 | inicio y fin de la ventana de 15 días |
| `fill_missing_currency_dates()` | 3 | inicio y fin de la ventana de 30 días |
| `insert_fallback_rates()` | 1 | **el día que escribe** en `rate_date` |
| `save_exchange_rates(integer,uuid,jsonb,text)` | 1 | **el día que escribe** |
| `save_exchange_rates(integer,uuid,jsonb,text,bigint)` | 1 | **el día que escribe** |
| `update_global_exchange_rates(jsonb,text,bigint,text,text)` | 1 | respaldo del `rate_date` que no llega por parámetro |

**Comprobado ocurrencia por ocurrencia antes de tocar nada:** ninguna de las 13
usa `CURRENT_DATE` para algo que no sea «hoy». No hay ni una comparación contra
una columna `timestamptz`, ni una marca de tiempo, ni un rango ajeno al día
calendario del catálogo. Los seis usos que son extremos de rango
(`CURRENT_DATE - INTERVAL '15 days'`, `<= CURRENT_DATE`) son ventanas ancladas a
ese mismo «hoy», y en `auto_generate_missing_rates` el extremo superior de la
ventana **es** el `rate_date` que se acaba escribiendo. Por eso la sustitución es
uniforme y no hay ninguna ocurrencia que mereciera otro trato.

## Decisión

1. **Las siete pasan a `public.fn_today_system()`.** `CURRENT_DATE` desaparece
   de las siete.
2. **`fn_today_system()` no se toca.** Se llama «del sistema» a propósito y
   tiene otros dos consumidores: el respaldo de `fn_set_task_date_tz` y el
   `DEFAULT` de `provider_pricing.valid_from`. Se arreglan las llamadoras, no la
   llamada.
3. **La lista blanca de `scripts/lista-blanca-current-date.json` queda vacía.**
   De 7 firmas a cero.

## Por qué así y no al revés

La alternativa era dejar las siete en UTC y cambiar el `DEFAULT` de la columna a
`(now() AT TIME ZONE 'UTC')::date`. Se descarta con datos:

1. **El resto del sistema ya eligió el día del SaaS, y está desplegado.** El
   commit `784d5e74` (fase B, tandas 9-10) dejó en `src/lib/services/openexchangerates.ts`
   la constante `ZONA_DEL_CATALOGO_GLOBAL = 'America/Bogota'`, documentada como
   «gemelo en el cliente de `fn_today_system()`», y los dos llamadores de
   `update_global_exchange_rates` pasan ya un `rate_date` resuelto con ella.
   Flipar el `DEFAULT` a UTC obligaría además a revertir código ya entregado.
2. **`fn_today_system()` es la respuesta a la pregunta que plantea este dato.**
   El argumento fuerte de la versión anterior sigue en pie: `currency_rates`
   **no tiene `organization_id` ni `branch_id`** (verificado en
   `information_schema.columns`; sus columnas son `id, code, rate_date, rate,
   source, created_at, updated_at, api_data, base_currency_code`), así que no hay
   organización a la que preguntarle la zona, y dos organizaciones en husos
   distintos tienen que producir la misma fila. Ese argumento descarta
   `fn_today_for` / `fn_today_for_org`; **no** descarta `fn_today_system()`, que
   existe exactamente para el dato que no es de nadie.
3. **Cambiar un `DEFAULT` no arregla nada que se escriba explícitamente.** Todos
   los caminos vivos pasan `rate_date` a mano. El `DEFAULT` es la pieza pasiva;
   las funciones son las activas. Mover la pasiva habría dejado el criterio
   escrito en el sitio que casi nunca se ejecuta.
4. **Cero pasa a ser una afirmación, no una excepción.** Con la lista vacía, el
   inventario de CI del ADR-005 afirma «ninguna función de `public` decide un día
   con `CURRENT_DATE`». Una lista blanca de siete entradas hay que mantenerla, y
   una lista blanca que se mantiene es una lista blanca que algún día crece.

### El argumento que se pierde, y por qué se acepta perderlo

La versión anterior alegaba (§4) que «el proveedor ya publica en UTC» y que
reetiquetar con el día de Bogotá desalinea del origen. Es verdad, y sigue
siéndolo. Pero ese argumento no defiende `CURRENT_DATE`: defiende fechar cada
fila **con la fecha del propio proveedor**, que viaja en
`api_data->>'timestamp'` y que hoy **no se usa para nada**. `CURRENT_DATE` no es
«la fecha del proveedor»: es la hora a la que casualmente corrió el cron. Si
algún día se quiere de verdad el día del origen, el arreglo es derivar
`rate_date` de ese `timestamp`, y es otra decisión, más grande que esta.

## Lo que esto NO autoriza

- **No autoriza `fn_today_system()` en ninguna función que tenga organización.**
  Si mañana aparece una tabla de tasas por inquilino, sus funciones usan
  `fn_today_for_org(org)` o `fn_today_for(org, sucursal)`. `fn_today_system()` es
  solo para el dato global.
- **No autoriza leer el catálogo con un día cualquiera.** Quien consulte la tasa
  «de hoy» para una organización resuelve su día con `fn_today_for(org, sucursal)`
  y busca la vigente con `rate_date <= ese día`. Sigue siendo la capa de lectura.
- **No autoriza cablear `'America/Bogota'` en ningún otro sitio.** La regla 6 de
  `docs/reglas-fechas-timezone.md` sigue vigente; `fn_today_system()` es la única
  excepción, y es una función con nombre, no una cadena suelta.

## Lo que esta decisión NO arregla (importante)

**El escritor real del catálogo sigue fechando en UTC, y está fuera del
repositorio.** La Edge Function `actualizar-tasas-cambio` (versión 19 desplegada,
no versionada en `supabase/functions/`) es la que los dos cron de `pg_cron`
invocan a las 02:00 UTC, y calcula su día así:

```ts
const today = new Date().toISOString().split('T')[0]
```

Eso es el día UTC, y además es exactamente la forma que la regla 1 de
`docs/reglas-fechas-timezone.md` prohíbe. Es el origen del 85 % de las filas de
la tabla. **Esta migración no lo toca** —es un despliegue de Edge Function, no
una migración— y por tanto, hasta que se cambie, el catálogo seguirá recibiendo
filas con el día UTC por ese camino.

El arreglo pendiente es sustituir esa línea por el día de la zona del catálogo
(`America/Bogota`), como ya hace el gemelo de TypeScript. Queda anotado como
deuda; no se ha hecho aquí.

## Las filas históricas: medidas, no reparadas

Medido el 2026-09-23 sobre las **2 810** filas de `currency_rates`, clasificando
cada fila por si su `rate_date` coincide con el día UTC o con el día del sistema
de su propio `created_at`:

| Clase | Filas |
|---|---|
| `rate_date` = día del sistema de su `created_at` (correctas) | **140** |
| `rate_date` = día **UTC** y **no** el del sistema (desfase puro) | **2 400** |
| `rate_date` no coincide con ninguno de los dos (relleno histórico deliberado) | **270** |
| **Total** | **2 810** |

Las 2 400 del desfase abarcan **240 días distintos**, de **2026-01-26** a
**2026-09-23** — es decir, desde que el cron de las 02:00 UTC empezó a escribir.

**No se ha ejecutado ningún `UPDATE`.** El arreglo aparente sería:

```sql
-- PROPUESTA. NO EJECUTADA. Requiere decisión del dueño y, tal como está, FALLA.
update public.currency_rates cr
   set rate_date = rate_date - 1
 where cr.rate_date = (cr.created_at at time zone 'UTC')::date
   and cr.rate_date <> (cr.created_at at time zone 'America/Bogota')::date;
```

Y no se ejecuta por tres razones, la primera de ellas dirimente:

1. **Choca con el índice único.** `idx_currency_rates_code_date (code, rate_date)`
   es `UNIQUE`. De las 2 400 filas, **2 380** ya tienen una fila hermana con el
   mismo `code` en `rate_date - 1`: el desplazamiento es una cadena, no un
   puñado de filas sueltas. Un `UPDATE` de una sola sentencia sobre un índice
   único **no diferible** no puede hacerlo. Haría falta o bien recrear la
   restricción como `UNIQUE ... DEFERRABLE INITIALLY DEFERRED`, o bien un paso
   intermedio (desplazar a un rango libre y volver), y eso ya no es «una
   corrección de fecha»: es una reescritura del catálogo entero.
2. **Cambiaría el significado de una serie que alguien ya consultó.** Cada tasa
   ha podido usarse para convertir importes en documentos ya emitidos. Mover la
   serie un día mueve, hacia atrás, qué tasa era «la vigente» en cada fecha.
3. **No hay una única verdad que restaurar.** La fila creada a las 02:00 UTC del
   día D lleva la tanda que el proveedor publicó en ese instante. Llamarla D
   (UTC), D−1 (Bogotá) o la fecha que el propio proveedor le puso son tres
   respuestas defendibles, y elegir entre ellas es decisión del dueño del dato,
   no de la migración que unifica el criterio hacia adelante.

**Recomendación:** no reparar. Dejar la serie histórica como está, documentar el
corte y ordenar primero el escritor que falta (la Edge Function). Si aun así se
quiere reparar, hacerlo **después** de que todos los escritores coincidan, en una
migración propia, con copia de la tabla antes y la restricción única tratada
explícitamente.

## Consecuencias

- La consulta de inventario de la fase D
  (`pg_proc.prosrc ~* '\mCURRENT_DATE\M'` sobre `public`) devuelve **0**. Ese es
  el suelo **y** el techo: cualquier resultado distinto de cero es un fallo.
- `scripts/lista-blanca-current-date.json` tiene `"firmas": []`. El script de CI
  (`scripts/verificar-current-date-en-postgres.mjs`) sale en verde con cero y en
  rojo con una intrusa, sin cambios en su lógica.
- `src/__tests__/timezone/diaDeLaOrganizacionEnPostgres.test.ts` ya no exige que
  las siete conserven `CURRENT_DATE`: exige lo contrario, y exige además que este
  ADR marque que sustituye a su versión anterior y que diga qué pasa con las
  filas históricas.
- Un detalle de implementación que no era opcional: la sobrecarga
  `save_exchange_rates(integer,uuid,jsonb,text,bigint)` declaraba una variable
  local llamada `current_date`, y ese **nombre** casa con la expresión del
  inventario. Se renombró a `v_rate_date`. Sin eso, el inventario nunca habría
  podido bajar de 1.
- Firmas, volatilidad, `SECURITY DEFINER`, `search_path` (ninguna de las siete
  tiene `proconfig`), owner y ACL: idénticos antes y después, comprobado en
  `pg_proc`. `CREATE OR REPLACE`, sin `DROP`, sin sobrecargas nuevas.

## Deuda que este ADR deja anotada y no resuelve

1. **La Edge Function `actualizar-tasas-cambio` sigue en día UTC** (arriba). Es
   lo que de verdad falta para que el catálogo tenga un solo criterio.
2. **Las dos sobrecargas de `save_exchange_rates` que este ADR nombra están
   muertas.** Sus `INSERT` nombran `organization_id` y `currency_id`, y
   `currency_rates` **no tiene** ninguna de las dos columnas; la de 5 argumentos
   añade un `ON CONFLICT (organization_id, code, rate_date)` que tampoco existe.
   La de 4 argumentos se traga el error con `EXCEPTION WHEN OTHERS` y lo cuenta
   como «saltada». Se han corregido **solo** en la fecha, a propósito: arreglarlas
   o borrarlas es otra decisión. Es el caso de la regla 3 de `CLAUDE.md`.
3. **`fill_missing_currency_dates` y `fill_historical_rates_real_api` mandan un
   `target_date` que nadie lee.** La Edge Function ignora el cuerpo de la
   petición y siempre escribe «hoy». Como rellenadores de huecos, hoy no
   rellenan el hueco que se les pide.
4. **Ninguna de las siete tiene `SET search_path`**, y dos son `SECURITY DEFINER`.
   Se ha conservado tal cual porque el encargo era de fechas y cambiar el
   `search_path` de una `SECURITY DEFINER` puede cambiar a qué objetos resuelve.
   Queda anotado para una ronda de seguridad.
5. **`update_global_exchange_rates` e `insert_fallback_rates` conceden `EXECUTE`
   a `anon`** (y `auto_generate_missing_rates` también). Escriben en un catálogo
   global desde un rol anónimo. No se ha tocado —cambiar una ACL no es una
   corrección de fecha— pero es exactamente el patrón del que avisa la memoria
   del proyecto sobre RPC abiertas a `anon`.
