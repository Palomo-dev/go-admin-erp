# ADR-001 — La zona horaria va por organización y por sucursal

- **Estado:** aceptada e implementada (fase A1)
- **Fecha:** 2026-09-23
- **Decisor:** el dueño del producto (decisión D1 del prompt de misión multi-país)
- **Implementa:** `supabase/migrations/20260923200000_zona_horaria_por_sucursal.sql`
- **Reversión:** `supabase/rollbacks/20260923200000_zona_horaria_por_sucursal_rollback.sql`
- **Red:** `src/__tests__/timezone/zonaHorariaPorSucursal.test.ts`
- **Contexto mayor:** `docs/PROGRESO-zonas-horarias.md`, `docs/reglas-fechas-timezone.md`

## Contexto

La zona horaria vivía en un solo sitio: `organizations.timezone`
(`text NOT NULL DEFAULT 'America/Bogota'`). Las 85 organizaciones están hoy en
`America/Bogota` y las 90 sucursales no tienen zona propia.

Eso deja dos problemas, uno visible y otro no:

1. **Visible:** una organización con sedes en husos distintos —una cadena con
   tienda en Bogotá y tienda en Ciudad de México— no se puede representar. El
   cierre de caja de la sede mexicana se calcularía con el día de Bogotá.

2. **No visible, y peor:** mientras todas las organizaciones estén en Bogotá,
   el fallback `America/Bogota` acierta por casualidad. Cualquier error de esta
   capa —una consulta que devuelve NULL porque RLS oculta la fila, una zona mal
   escrita, una cascada al revés— produce exactamente el mismo resultado que el
   camino correcto. No hay forma de notarlo hasta que entre el primer cliente
   fuera de Colombia, y entonces se nota como «la fecha se muestra un día
   corrido» en su contabilidad.

Ya existían `fn_today_for_org(org)` y `fn_today_system()`, pero
`fn_today_for_org` resolvía la zona *dentro de sí misma*: la lógica de
resolución y el cálculo del día estaban pegados. Cualquier función nueva que
necesitara la zona (y no el día) habría tenido que copiar la cascada.

## Opciones consideradas

### A. Dejarlo como está y resolver la zona solo en el cliente

Coste cero hoy. Pero los triggers de la base (`fn_set_task_date_tz`,
`fn_set_quotation_issue_date_tz`, `fn_set_manifest_date_tz`,
`fn_set_valid_from_tz`, `calculate_days_overdue`) escriben días calendario sin
pasar por Node. Si la base no sabe la zona, escribe el día equivocado y el
cliente solo puede mostrarlo mal. Descartada.

### B. Zona solo por organización, como hoy, pero bien validada

Resuelve el problema 2 y no el 1. Y cuando aparezca el primer cliente con sedes
en dos husos habría que migrar otra vez, con datos dentro. Descartada.

### C. Zona por sucursal **obligatoria** (`NOT NULL`, poblada con la de su organización)

Sin ambigüedad al leer: la sucursal siempre manda. Pero exige un `UPDATE` sobre
las 90 filas existentes, y sobre todo *duplica el dato*: cambiar la zona de una
organización dejaría de propagarse a sus sedes, y quien la cambie desde la
pantalla de la organización vería que no pasa nada. Descartada.

### D. Zona por sucursal **opcional** (`NULL` = heredar) + una sola función de resolución — **elegida**

`branches.timezone text NULL`. NULL significa «hereda de la organización», que
es el estado de las 90 sucursales de hoy: no se escribe ni una fila. La lectura
pasa siempre por `fn_timezone_for(organization_id, branch_id)`, que aplica la
cascada. Cambiar la zona de la organización sigue propagándose a todas las
sedes que no la hayan sobreescrito.

## Decisión

1. **`branches.timezone text NULL`.** NULL = heredar. Migración aditiva, sin
   `UPDATE` de datos históricos.

2. **Validación al escribir, no al leer.** Trigger
   `trg_validate_branch_timezone` (BEFORE INSERT OR UPDATE OF timezone): la
   zona debe existir en `pg_timezone_names`; se canoniza el uso de mayúsculas
   (`america/bogota` → `America/Bogota`); vacío o espacios → NULL; cualquier
   otra cosa → error `22023` **en el momento de escribir**. Es el mismo patrón
   que `trg_validate_org_timezone` (migración `20260915235500`).

   Se usa trigger y no `CHECK` porque `pg_timezone_names` es un catálogo y una
   `CHECK` solo admite expresiones `IMMUTABLE`; marcar como `IMMUTABLE` una
   función que lee el catálogo sería mentirle al planificador.

3. **Una sola función de resolución:**
   `fn_timezone_for(p_organization_id integer, p_branch_id integer default null) returns text`.

   Cascada: `branches.timezone` → `organizations.timezone` → (fallback legado
   `organization_settings` con `key='calendar'`, que ya tenía
   `fn_today_for_org` y se conserva para no cambiar el resultado de ninguna
   fila) → `'America/Bogota'`.

   `STABLE`, `SECURITY DEFINER`, `SET search_path = public`.

4. **`fn_today_for_org` pasa a ser un caso particular de ella**, con la misma
   firma pública (`integer` → `date`) y el mismo resultado; y se añade
   `fn_today_for(p_organization_id, p_branch_id default null)`. Ninguna
   sobrecarga nueva: `CREATE OR REPLACE` conserva firma y nombre de parámetro,
   así que no hace falta ningún `DROP` (la lección de `fn_pipeline_funnel`).

5. **Permisos:** `REVOKE EXECUTE ... FROM PUBLIC, anon` y
   `GRANT EXECUTE ... TO authenticated, service_role` en las tres funciones,
   el mismo criterio que la tanda de `fn_reporte_*` (`20260922233000`).

## Consecuencias

### Lo que mejora

- Una organización puede tener sedes en husos distintos. Comprobado en seco:
  con la organización en `Europe/Madrid` y una sucursal en `Pacific/Kiritimati`
  (UTC+14), `fn_today_for` devolvió días calendario distintos para la misma
  organización.
- **Se cierra un fallo latente.** `fn_today_for_org` no era `SECURITY DEFINER`:
  se ejecutaba con el rol de quien escribía (`authenticated`) y su
  `SELECT ... FROM organizations` pasaba por RLS. Cuando RLS ocultaba la fila,
  devolvía el default en silencio. Hoy es invisible porque el default acierta;
  el día que una organización no esté en Bogotá habría sido un error de un día
  en el `task_date` o el `issue_date` de sus documentos. Al centralizar la
  lectura en una función `SECURITY DEFINER`, deja de depender de RLS.
- `fn_today_for_org` deja de tener `EXECUTE` para `anon`, que nunca necesitó.
- La resolución está en un solo sitio: la fase B (escritura) y la fase D
  (funciones con `CURRENT_DATE`) tienen a qué llamar en lugar de reimplementarla.

### Lo que cuesta

- **`fn_timezone_for` es `SECURITY DEFINER` y `authenticated` puede llamarla
  vía `/rest/v1/rpc/fn_timezone_for` con cualquier `organization_id`.** Es
  deliberado: tiene que funcionar desde triggers que corren con el rol de quien
  escribe. Lo único que devuelve es el nombre de una zona horaria — no hay
  datos de negocio, ni conteos, ni importes—, así que no se le pone guarda de
  pertenencia: una guarda obligaría a consultar `organization_members` en cada
  INSERT que dispare un trigger de fecha. El aviso del linter de Supabase sobre
  esta función es esperado.

- **Una zona inválida devuelve el default, no la de la organización.** La
  función **nunca lanza**: si la zona guardada no la reconoce Postgres, o si la
  consulta falla, devuelve `'America/Bogota'`. Se eligió el default y no
  «seguir bajando por la cascada» para que el modo de fallo sea uno solo y
  reconocible. El camino solo es alcanzable saltándose el trigger (por ejemplo
  con `service_role` y el trigger deshabilitado); si se alcanza, es preferible
  un día del sistema a un día de un vecino plausible.

  La razón de no lanzar es concreta: la función se llama desde triggers
  `BEFORE INSERT`. Una zona mal escrita en la ficha de una sucursal no puede
  impedir registrar una cotización, una tarea o una venta.

- **Coste por escritura:** una lectura más de `branches` (por clave primaria)
  en cada llamada con sucursal. Despreciable frente al `INSERT` que la dispara.

- El fallback legado a `organization_settings` sobrevive un tiempo más. Se
  conserva para que `fn_today_for_org` devuelva exactamente lo mismo que antes;
  retirarlo es trabajo de la fase E.

### Lo que queda pendiente

- **Nadie escribe todavía `branches.timezone`.** No hay UI ni servicio que lo
  fije: la columna existe, se valida y se lee, pero por ahora todas las
  sucursales heredan. La pantalla de sucursales es fase A (UI).
- **Nadie llama todavía a `fn_timezone_for` desde la aplicación.** Los
  consumidores (`getOrganizationTimezone`, el contexto de React, los servicios)
  siguen leyendo `organizations.timezone`. Engancharlos es la fase siguiente;
  hasta entonces la sucursal no cambia nada de lo que se ve.
- **`fn_today_system()` no se tocó.** Es el `DEFAULT` de
  `currency_rates.rate_date` y de `provider_pricing.valid_from`, y un `DEFAULT`
  sí se comprueba contra el rol que inserta: retirarle el `EXECUTE` a `anon` a
  ciegas podría romper una escritura. Su ACL queda para la tanda de seguridad.
- **`organizations.timezone` no admite NULL** y mantiene su default. No se
  cambió: es la raíz de la cascada y tiene su propio trigger de validación.
