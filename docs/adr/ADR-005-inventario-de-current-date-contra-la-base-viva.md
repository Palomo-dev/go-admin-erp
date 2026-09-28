# ADR-005 — El inventario de `CURRENT_DATE` corre contra la base viva, por RPC

- **Estado:** aceptada
- **Fecha:** 2026-09-23
- **Fase:** D (addendum) — funciones de Postgres que deciden el día en UTC
- **Contexto mayor:** `docs/PROGRESO-zonas-horarias.md`
- **Depende de:** `ADR-004-dia-utc-en-el-catalogo-global-de-tasas.md` (la lista blanca de 7)

## Contexto

La fase D cerró con el inventario en **8** en vez de 7: apareció
`fn_emitir_acciones`, creada por otra sesión **mientras la fase corría** y
aplicada por MCP.

Eso destapa un agujero en la red que ya existía:
`src/__tests__/timezone/diaDeLaOrganizacionEnPostgres.test.ts` lee los `.sql` de
`supabase/migrations/`. Es una red buena para lo que sabe ver —fija la *forma* de
las funciones que el repositorio conoce— pero **no ve una función que se aplica
por MCP**. Y por la regla dura 1 del proyecto, toda la base se toca por MCP. El
`.sql` llega al repositorio en el mismo commit, sí, pero entre que se aplica y
que se commitea hay una ventana, y en esa ventana la base y el repositorio
discrepan. `fn_emitir_acciones` vivió en esa ventana.

La consulta que hay que vigilar es una sola:

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosrc ~* '\mCURRENT_DATE\M';
```

Su resultado tiene que ser exactamente las 7 firmas del ADR-004.

## Decisión

1. La comprobación corre **contra la base viva**, desde GitHub Actions, en su
   propio workflow (`.github/workflows/inventario-postgres.yml`).
2. El acceso a la base se hace por **RPC de PostgREST**
   (`public.fn_inventario_current_date()`), no por conexión directa a Postgres.
3. Si faltan las credenciales, la comprobación **se salta con aviso y sale 0**;
   no falla.
4. La lista blanca vive en **un solo archivo legible por máquina**,
   `scripts/lista-blanca-current-date.json`, que leen tanto el script de CI como
   el test de jest.

## Por qué una RPC y no `pg` directo

| | RPC por HTTPS | Conexión `pg` al 5432 |
|---|---|---|
| Dependencia | `@supabase/supabase-js`, **ya está** en `package.json` | habría que añadir `pg` |
| Secreto que necesita CI | la clave `service_role` | la **contraseña de la base** |
| Red | HTTPS, que el runner ya sabe hacer | puerto 5432 abierto al runner; Supabase enruta las conexiones directas por IPv6 y el runner de GitHub no tiene IPv6, así que habría que pasar por el pooler y mantener esa URL |
| Alcance de lo que se expone | una función `stable` que solo lee `pg_proc` | toda la base |

El criterio del encargo era «sin añadir dependencias sin justificarlo». No se
añade ninguna.

La función es **`SECURITY INVOKER`** a propósito: `pg_proc` y `pg_namespace` son
catálogos legibles por cualquier rol, así que no hace falta elevar privilegios y
no se engorda el inventario de funciones `SECURITY DEFINER` que hay que revisar.
Sus permisos quedan en `service_role` únicamente: `anon` y `authenticated` no la
ejecutan. No devuelve datos de ningún inquilino —solo nombres de funciones del
esquema `public`— pero tampoco hay razón para publicar la forma interna del
esquema.

## Por qué un workflow aparte y no un job dentro de `ci-web.yml`

Porque el disparador que de verdad importa es `schedule`. Un `push` o un `PR`
**no** delatan una función aplicada por MCP sin commit: no hay cambio en el
repositorio que dispare nada. Hace falta que la comprobación corra sola, y un
`schedule` dentro de `ci-web.yml` arrastraría todos los días al `typecheck` y a
las dos matrices de zonas horarias, que no tienen nada que ver.

El workflow nuevo se dispara en `pull_request`, `push` a `main`, `schedule`
diario (13:00 UTC = 08:00 en Bogotá) y `workflow_dispatch`. Tampoco lleva filtro
`paths`, por lo mismo: el cambio que busca puede no estar en ningún archivo.

## Por qué se salta en vez de fallar cuando no hay secretos

Un `pull_request` desde un fork no recibe `secrets` en GitHub Actions. Si el
script fallara, cualquier contribución externa vería un rojo que no puede
arreglar y que no dice nada sobre su cambio. La comprobación real la hace el CI
del repositorio principal, que sí tiene las credenciales.

El salto es ruidoso a propósito: imprime por qué se saltó y qué variables
faltan, para que nadie lo confunda con un verde.

## Por qué la lista blanca sale de un JSON y no está escrita dos veces

Había dos copias potenciales —la del script de CI y la del test de jest— y dos
copias de una lista blanca divergen. `scripts/lista-blanca-current-date.json` es
la única fuente legible por máquina; el test de jest sigue además comprobando
que **el ADR-004 nombra una por una** cada entrada del JSON. Así la cadena queda
cerrada: JSON ↔ ADR ↔ base viva.

La lista guarda **firmas completas** (`save_exchange_rates(integer,uuid,jsonb,text)`)
y no solo nombres. `save_exchange_rates` tiene dos sobrecargas, así que por
nombre serían 6 entradas para 7 filas; y una sobrecarga nueva con
`CURRENT_DATE` pasaría desapercibida si solo se comparasen nombres.

## Consecuencias

- Una función nueva con `CURRENT_DATE` aplicada por MCP se detecta, como muy
  tarde, en la ejecución programada del día siguiente, y el mensaje nombra la
  función intrusa y dice cómo arreglarla.
- Quitar una de las 7 obliga a tocar el JSON **y** el ADR-004: el script también
  falla si la lista blanca nombra una función que ya no existe, para que no
  queden entradas muertas que justifiquen de antemano una reintroducción.
- CI depende de que la base esté disponible. Una caída de Supabase pone este job
  en rojo. Es aceptable: es un job aparte y no bloquea el resto del CI web.
- Hay un secreto más que mantener en el repositorio (`SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`). No se escriben en ningún archivo del
  repositorio; llegan al job por `secrets`.

## Cómo se corre en local

```bash
node scripts/verificar-current-date-en-postgres.mjs
```

Lee `.env.local` (`NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`) si
existe. Sin esas dos variables se salta con aviso y sale 0. No escribe nada: la
RPC es `stable` y solo lee catálogos.
