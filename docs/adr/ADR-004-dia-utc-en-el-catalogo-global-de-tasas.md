# ADR-004 — Las tasas de cambio se quedan con el día UTC, a propósito

- **Estado:** aceptada
- **Fecha:** 2026-09-23
- **Fase:** D — funciones de Postgres que deciden el día en UTC
- **Contexto mayor:** `docs/PROGRESO-zonas-horarias.md`, `docs/reglas-fechas-timezone.md`
- **Depende de:** `ADR-001-timezone-por-sucursal.md` (`fn_timezone_for`, `fn_today_for`)

## Contexto

La fase D partió de **21 funciones** de `public` cuyo cuerpo contenía
`CURRENT_DATE`, que en este servidor (`TimeZone = UTC`) es el día UTC.

De esas 21:

- **1** era un falso positivo: `calculate_days_overdue` ya usaba
  `fn_today_for_org`; lo que casaba con la expresión era el **comentario**
  «(no CURRENT_DATE que es UTC)». Se reescribió el comentario para que el
  inventario no la siga contando.
- **13** sí decidían un día calendario y tenían de dónde sacar la zona
  (organización, sucursal, o una tabla padre que las lleva). Arregladas en
  las tres migraciones de la fase D.
- **7** son las de este ADR.

## Las siete

| Función | Qué hace |
|---|---|
| `auto_generate_missing_rates()` | rellena huecos de los últimos 15 días |
| `fill_missing_currency_dates()` | rellena huecos de los últimos 30 días |
| `fill_historical_rates_real_api()` | rellena huecos de los últimos 15 días |
| `insert_fallback_rates()` | inserta tasas de respaldo del día |
| `save_exchange_rates(org_id, base_currency_id, rates, source)` | guarda una tanda de tasas |
| `save_exchange_rates(org_id, base_currency_id, rates, source, api_timestamp)` | ídem, con marca del proveedor |
| `update_global_exchange_rates(rates, source, api_timestamp, rate_date, base_currency_code)` | actualiza el catálogo global |

## Decisión

**Se quedan con `CURRENT_DATE`. No se les fuerza ninguna zona horaria.**

## Por qué

1. **El dato no es de nadie.** Las siete escriben en una sola tabla:
   `public.currency_rates`. Verificado en `information_schema.columns`:
   `currency_rates` **no tiene `organization_id` ni `branch_id`**. Sus columnas
   son `id, code, rate_date, rate, source, created_at, updated_at, api_data,
   base_currency_code`. Es un catálogo global compartido por todas las
   organizaciones. No hay una organización a la que preguntarle la zona.

2. **El `org_id` de `save_exchange_rates` no acota la escritura.** Recibe el
   parámetro pero la fila que inserta no lo lleva: dos organizaciones en husos
   distintos que llamen a la misma función el mismo instante tienen que
   producir **la misma fila**. Si cada una escribiera su propio día, la clave
   `(code, rate_date)` del catálogo tendría dos verdades para el mismo
   instante, y la última en escribir ganaría. El defecto sería peor que el que
   se intenta corregir.

3. **La columna ya está alineada con esa idea.** `currency_rates.rate_date`
   tiene `DEFAULT fn_today_system()` — el día del sistema, no el de ninguna
   organización. La fase A dejó `fn_today_system()` intacta justamente por
   esto, y anotó por qué: es el `DEFAULT` de `currency_rates.rate_date` y de
   `provider_pricing.valid_from`, y un `DEFAULT` se comprueba contra el rol que
   inserta. Cambiar el cuerpo de estas funciones y no la columna dejaría dos
   criterios distintos dentro de la misma tabla.

4. **El proveedor ya publica en UTC.** Las tasas llegan de una API externa que
   fecha sus cierres en UTC. Reetiquetarlas con el día de Bogotá no las hace
   más ciertas: las desalinea del origen.

5. **El daño posible es acotado y de otro tipo.** Lo peor que produce un día
   UTC aquí es que la tasa del día se publique unas horas antes o después de lo
   que a una organización le parecería «hoy». Eso se resuelve en la capa de
   consulta —eligiendo la tasa vigente con `rate_date <= día de la
   organización`, que es asunto de quien lee— y no reescribiendo el catálogo.

## Lo que esto NO autoriza

- **No autoriza `CURRENT_DATE` en ninguna función que tenga organización.** Si
  mañana aparece una tabla `organization_currency_rates` con tasas propias por
  inquilino, sus funciones **sí** tienen que usar `fn_today_for` /
  `fn_today_for_org`.
- **No autoriza leer el catálogo con el día UTC.** Quien consulte una tasa
  «de hoy» para una organización debe resolver su día con
  `fn_today_for(org, branch)` y buscar la vigente. Esa es la capa de lectura,
  fuera del alcance de esta fase.

## Consecuencias

- La consulta de inventario de la fase D
  (`pg_proc.prosrc ~* '\mCURRENT_DATE\M'`) **no puede bajar de 7** mientras
  estas funciones existan. Siete es el suelo esperado, no una tarea pendiente.
- El test `src/__tests__/timezone/diaDeLaOrganizacionEnPostgres.test.ts`
  mantiene la lista de las siete como **lista blanca explícita**: si alguien
  añade una octava función con `CURRENT_DATE`, o mete una de estas siete en una
  migración con organización, el test falla y obliga a volver aquí.
