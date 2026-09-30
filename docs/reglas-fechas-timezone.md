# Reglas canonicas de fechas y zona horaria

> Aplicar a TODO el codigo de Go Admin ERP. El no cumplimiento produce
> el bug "la fecha se muestra/guarda un dia corrido".

## 1. Un instante se guarda siempre como timestamptz

Nunca como date ni como texto. Los instantes (momentos exactos en el
tiempo) van en columnas `timestamp with time zone`.

## 2. Un dia calendario del negocio se guarda como date

Fechas de vencimiento, fechas de turno, periodos contables: se guardan
como `date` y se construyen SIEMPRE en la zona horaria de la organizacion,
nunca con `toISOString()`.

## 3. toISOString() esta prohibido para derivar una fecha

Solo se permite para serializar un instante completo que se va a guardar
en un timestamptz. Nunca para obtener un "dia calendario" (YYYY-MM-DD).

Prohibido: `new Date().toISOString().split('T')[0]`
Prohibido: `new Date().toISOString().slice(0, 10)`

Usar en su lugar: `todayInTz(timezone)` o `toPlainDate(date, timezone)`
de `src/lib/utils/dateDisplay.ts`.

## 4. .split('T')[0] sobre un valor que viene de la BD esta prohibido

Un timestamptz de Supabase como `2026-09-11T01:30:00+00:00` (una venta
hecha el 10/09 a las 20:30 en Bogota) al hacer `split('T')[0]` se queda
con `2026-09-11` (el dia UTC), no con el dia calendario de la organizacion.

## 5. Todo renderizado de fecha pasa por el timezone de la organizacion

Cero excepciones. Nada de `new Date(x).toLocaleDateString()` suelto.

Usar: `useFormatDate()` hook en componentes cliente, o
`formatDateInTz(value, timezone)` en codigo servidor.

## 6. La zona horaria nunca se hardcodea

Sale de `getOrganizationTimezone(organizationId)`.
`America/Bogota` solo como fallback dentro de `DEFAULT_TIMEZONE`.

## 7. El servidor no asume zona horaria

No se define `TZ` global. Cada organizacion tiene la suya.

## 8. Los datos historicos no se tocan

Son correctos. El bug es de presentacion y calculo de "hoy", no de datos.

## Capa de fechas: src/lib/utils/dateDisplay.ts

Funciones disponibles:

- `formatDateInTz(value, timezone)` — formatea un timestamptz como dd/MM/yyyy
- `formatDateTimeInTz(value, timezone)` — formatea un timestamptz como dd/MM/yyyy HH:mm
- `formatTimeInTz(value, timezone)` — formatea un timestamptz como HH:mm
- `formatPlainDate(value)` — formatea un date puro (YYYY-MM-DD) como dd/MM/yyyy (sin convertir)
- `todayInTz(timezone)` — dia calendario actual en la zona de la org (YYYY-MM-DD)
- `toPlainDate(date, timezone)` — Date del navegador a YYYY-MM-DD en la zona de la org
- `plainDateToInstant(plain, timezone, time?)` — YYYY-MM-DD + HH:mm a ISO con offset

## Hook para componentes cliente: useFormatDate()

Importar de `@/lib/context/OrganizationTimezoneContext`.

Devuelve funciones ya "curried" con el timezone de la organizacion:

```tsx
const { formatDate, formatDateTime, formatTime, formatPlain, getToday, toDate, toInstant } = useFormatDate();
// formatDate(sale.sale_date)     -> timestamptz -> dd/MM/yyyy en zona de la org
// formatPlain(cuenta.due_date)   -> date puro -> dd/MM/yyyy (sin convertir)
// getToday()                     -> YYYY-MM-DD en zona de la org
```

## Distincion critica: timestamptz vs date

- Valor que viene de un `timestamptz` -> `formatDate` (convierte a la zona de la org)
- Valor que viene de un `date` -> `formatPlain` (NO convierte, ya es un dia calendario)

Confundir estos dos casos es exactamente lo que produjo el bug original.

## ESLint

Las reglas `no-restricted-syntax` y `no-restricted-imports` en
`.eslintrc.json` bloquean:

- `toISOString().split('T')` o `toISOString().slice(0, 10)`
- Importar `formatDate` o `parseLocalDate` desde `@/utils/Utils`

### Estrategia de aplicacion

El codigo tiene ~372 violaciones preexistentes (P2-7). No se puede poner
`error` global de golpe sin romper el build. Se usa `overrides`:

- **`error`** en los directorios ya migrados (lista en `.eslintrc.json` > `overrides`).
  Cualquier nueva violacion en estos archivos rompe el build.
- **`warn`** en el resto de `src/**`. Las violaciones son visibles pero no bloquean.

A medida que P2-7 migra cada modulo, se anade su ruta al bloque `overrides`
con `error`, ampliando el alcance progresivamente. El objetivo es llegar a
`error` global cuando el inventario de call-sites llegue a cero.

### CI

`npm run lint` debe estar en el workflow de CI. Si no lo esta, anadelo.

## Tests

Los tests en `src/__tests__/timezone/` validan que las funciones de
dateDisplay.ts producen el resultado correcto sin importar el TZ del
runtime (TZ=UTC y TZ=America/Bogota).

Ejecutar: `npm run test:tz-all`

## 9. Regla única de zona: sucursal → organización → fallback (2026-09-30)

Decisión del dueño. **No existe zona horaria por persona**: ni columna en
`profiles` ni preferencia del usuario. La zona de una fecha es:

1. la de la **sucursal**, si `branches.timezone` tiene valor;
2. si no, la de la **organización** (`organizations.timezone`,
   `getOrganizationTimezone`);
3. `America/Bogota` (`DEFAULT_TIMEZONE`) solo como último recurso.

Qué sucursal cuenta:

| Caso | Sucursal |
|---|---|
| El dato tiene `branch_id` y el llamador lo pasa (`useFormatDate(row.branch_id)`) | la del dato (gana siempre) |
| El dato no tiene sucursal (`useFormatDate(null)`) | ninguna → organización |
| El llamador no pasa nada (`useFormatDate()`) | la **sucursal activa del header**; con «Todas» → organización |

- **Mostrar** y **calcular** usan la misma zona. `getToday`, `toDate` y
  `toInstant` de `useFormatDate` cortan el día con la zona de la sucursal de
  la operación; los reportes por día de «Todas las sucursales» y las
  operaciones sin sucursal, con la de la organización.
- **Punto único en cliente**: `useTimezoneFor` / `useFormatDate`
  (`OrganizationTimezoneContext`), que eligen la sucursal con
  `sucursalParaZona` (`src/lib/utils/sucursalParaZona.ts`) y aplican la
  cascada `resolveTimezoneForBranch`, gemela de `fn_timezone_for`.
- **Punto único en servidor**: `zonaHorariaEnServidor(ctx, branchId?)`
  (`src/lib/utils/zonaHorariaServidor.ts`), que delega en
  `fn_timezone_for(p_organization_id, p_branch_id)`. El servidor no ve el
  header: la sucursal la aporta el llamador (la del dato o la de la petición,
  validada contra la organización de la sesión). En SQL, las RPC usan
  `fn_timezone_for(org, sucursal)`, nunca una zona escrita.
- **Edición**: la zona de una sucursal se cambia en Organización › Sucursales
  (`BranchTimezoneField`), por `PUT /api/organization/timezone`, que valida el
  permiso en el servidor. Por defecto la sucursal hereda (`NULL`).
- **Perfil › Preferencias** muestra la zona efectiva en solo lectura y de dónde
  viene («De la sucursal X» / «De la organización»).
- A 2026-09-30 las 94 sucursales tienen `timezone` vacío: todo se resuelve con
  la zona de la organización, exactamente igual que antes del cambio.

Guardarraíl: `src/__tests__/timezone/guardarrailZonaUnica.test.ts` impide
(1) cualquier zona por persona en `src/` o en las migraciones, y (2) escribir
`'America/Bogota'` a mano en un archivo nuevo (trinquete con la deuda
congelada; se usa `DEFAULT_TIMEZONE`). Pruebas de la regla, con una sucursal
en `America/Mexico_City`, en
`src/__tests__/timezone/zonaUnicaSucursalOrganizacion.test.tsx`.

## Hora oficial de las operaciones de dinero e inventario (2026-09-30)

La **hora del hecho** (cuándo ocurrió la venta, el pago, la apertura o el cierre
de caja, el movimiento de inventario) la pone el **servidor**, nunca el reloj del
equipo. Un equipo con la hora mal puesta dañaba ventas, cierres, reportes por día,
contabilidad y facturación. Análisis y cifras: `docs/design/HORA-SERVIDOR-ANALISIS.md`.

| Es | Ejemplos | Quién la pone |
|---|---|---|
| Marca de tiempo del hecho | `sales.sale_date`, `created_at`, `cash_sessions.opened_at`/`closed_at`, `table_sessions.*_at`, `returns.return_date`, `stock_movements.created_at` | La base (`now()`/default) o una RPC |
| Fecha elegida por el usuario (dato) | `due_date`, `issue_date` tecleada, `payment_date` elegida, fecha contable | El usuario (día) + zona de la org (`instantForDayInTz`, `fn_registrar_pago`) |

Reglas:

1. **En el navegador no se escribe una marca de tiempo del hecho.** Se omite la
   columna (default `now()`) o, para marcar un cierre, se envía
   `HORA_DEL_SERVIDOR` (`'now'`, que Postgres resuelve con su reloj;
   `src/lib/pos/reloj/horaOficial.ts`).
2. **La base lo impone**: el trigger `trg_00_hora_oficial` (`fn_trg_hora_oficial`,
   `fn_trg_caja_hora_oficial`) reemplaza por `now()` esas columnas cuando quien
   escribe es `anon`/`authenticated` directamente, y no deja reescribirlas. Las
   RPC `SECURITY DEFINER` y `service_role` (importaciones con fechas históricas)
   no se tocan: una carga masiva legítima va por servicio o por RPC con su
   parámetro documentado.
3. **`pos_checkout_v1` usa `now()`**. La hora que manda el POS es la del equipo:
   se guarda en `sales.device_created_at` y su desfase en `clock_skew_seconds`.
4. **Sin conexión** (venta o apertura de caja reproducida desde el outbox): la hora
   del equipo es la oficial **solo** si el desfase del reloj, medido contra el
   servidor antes de quedarse sin red, era conocido y **≤ 10 min**, y la hora cae
   en `[ahora − 30 días, ahora + 5 min]`. Así la venta de las 11:50 p. m.
   sincronizada al día siguiente queda en su día contable y en su caja (sus pagos
   toman la misma hora). Si no se cumple, se usa la hora del servidor y la
   operación queda marcada en `time_review_reason` (no se bloquea); se consultan
   con `pos_hora_en_revision(org, desde, hasta)`. Regla única en SQL:
   `fn_hora_oficial_resolver`; espejo en TS: `resolverHoraOficial`.
5. **Aviso**: al abrir el POS y la caja se mide el desfase
   (`GET /api/pos/hora-servidor`); si pasa de **2 min**, `AvisoRelojDesfasado`
   lo dice («La hora de este equipo está desfasada N minutos; las ventas usan la
   hora del servidor»). No bloquea. La medición queda guardada para las
   operaciones sin conexión.
6. **Los datos históricos no se tocan**: las columnas nuevas nacen nulas.

Guardarraíl 37: `src/__tests__/timezone/horaOficialGuardrails.test.ts` (allow-list
con motivo por archivo). Pruebas: `src/__tests__/timezone/horaOficial.test.ts`
(UTC y Bogotá).
