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
