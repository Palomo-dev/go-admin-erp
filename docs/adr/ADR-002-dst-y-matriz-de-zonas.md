# ADR-002 — Horas de pared con DST: medianoche inexistente, hora repetida y matriz de CI

- **Estado:** aceptada e implementada (fase A2)
- **Fecha:** 2026-09-23
- **Implementa:** `src/lib/utils/dateCore.ts`, `src/lib/utils/dateRanges.ts`,
  `src/lib/utils/timezone.ts` (fachada), `src/lib/utils/timezoneFallback.ts`
- **Red:** `src/__tests__/timezone/dstEdgeCases.test.ts`,
  `src/__tests__/timezone/timezoneFallback.test.ts`
- **Contexto mayor:** `docs/PROGRESO-zonas-horarias.md`, `docs/reglas-fechas-timezone.md`,
  `docs/adr/ADR-001-timezone-por-sucursal.md`

## Contexto

`timezone.ts` calculaba el offset de una zona **una sola vez por día**, tomando
como referencia las 12:00 UTC de ese día, y lo pegaba a las dos puntas del rango:

```ts
const refDate = new Date(`${dateString}T12:00:00Z`);        // antes
const offsetISO = offsetMinutesToISO(getOffsetMinutesForTimezone(timezone, refDate));
const start = `${dateString}T00:00:00.000${offsetISO}`;
const end   = `${dateString}T23:59:59.999${offsetISO}`;
```

Eso supone que el offset es constante dentro del día. Con DST no lo es, y
mientras las 85 organizaciones estén en `America/Bogota` (sin DST desde 1993) el
error es invisible. Medido sobre el código anterior:

| Caso | Antes | Debía ser |
|---|---|---|
| `plainDateToInstant('2026-09-06', 'America/Santiago', '00:00')` | `2026-09-06T03:00Z` = **23:00 del 05/09** | `2026-09-06T04:00Z` = 01:00 del 06/09 |
| `getDayRange('2026-09-06', 'America/Santiago')` | empieza a las 23:00 del día anterior, 24 h | empieza a la 01:00, **23 h** |
| `getDayRange('2026-04-04', 'America/Santiago')` | 24 h (se pierde la hora repetida) | **25 h** |
| `getDayRange('2026-03-29' / '2026-10-25', 'Europe/Madrid')` | 24 h y 24 h | 23 h y 25 h |
| `plainDateToInstant('2026-10-04', 'Australia/Lord_Howe', '02:00')` | 01:30 (hora anterior) | 02:30 |
| `getOffsetMinutesForTimezone(tz, ...T12:00:00.500Z)` | `344.99…` → `"+05:44.9916…"` | `345` → `"+05:45"` |
| `offsetMinutesToISO(0)` | `"-00:00"` | `"+00:00"` |

La consecuencia de negocio no es estética: el día del salto de primavera el
rango incluía una hora del día anterior (ventas ajenas en el cierre de caja) y
el día de la vuelta al horario estándar se dejaba fuera la última hora del día
(ventas propias perdidas).

## Decisión

### 1. Una hora de pared se resuelve contra la zona, no contra un offset fijo

`wallTimeToInstant(dia, hora, zona)` prueba los offsets vigentes alrededor de
esa hora y se queda con los que, al volver a convertirse a la zona, dan
exactamente la hora pedida. De ahí salen las tres reglas:

- **Hora normal:** un solo candidato válido.
- **Hora repetida** (vuelta al horario estándar; en `America/Santiago` las 23:00
  del 04/04/2026 se viven dos veces): dos candidatos válidos, se devuelve **la
  primera ocurrencia**. Es lo que hace `Temporal` con `disambiguation:
  'compatible'` y lo que espera un cajero: la primera vez que el reloj marcó esa
  hora.
- **Hora inexistente** (salto de primavera; `America/Santiago` pasa de 23:59 del
  05/09/2026 a 01:00 del 06/09): ningún candidato válido. Se interpreta con el
  **offset anterior al cambio**, lo que desplaza el instante a la primera hora
  que sí existe (00:00 → 01:00). También es `'compatible'` de `Temporal`.

**Alternativa descartada:** devolver `null` o lanzar cuando la hora no existe.
Un `plainDateToInstant` que lanza rompe un cierre de caja una vez al año en
Chile, en la peor noche posible. Se prefiere una respuesta definida y
documentada; el ADR y el test dicen cuál es y por qué.

**Alternativa descartada:** adoptar `Temporal` o `date-fns-tz`. `Temporal` no
está en el runtime (Node 20/22 sin flag) y meter `date-fns-tz` por seis
funciones añade dependencia y una segunda forma de hacer lo mismo justo cuando
esta fase existe para tener **una sola**.

### 2. Un día termina donde empieza el siguiente

`fin = primer instante del día siguiente − 1 ms`. Es la única definición que
cubre a la vez el día de 23 h, el de 25 h, el de 23.5 h y el de 24.5 h
(`Australia/Lord_Howe` tiene DST de **30 minutos**). Escribir `23:59:59.999` con
el offset del comienzo del día es precisamente la mutación que se probó y mata
el test.

El texto que se devuelve sigue teniendo la misma forma que antes
(`2026-08-15T23:59:59.999-05:00`) y en las zonas sin DST el resultado es
**idéntico byte a byte**: no hay que tocar ningún llamador.

### 3. Los offsets no son horas enteras

`offsetMinutesToISO` conserva los minutos (`+05:45` Katmandu, `+10:30` Lord
Howe) y `getOffsetMinutesForTimezone` **redondea a minuto entero**: ninguna zona
IANA tiene fracción de minuto, y sin redondeo los milisegundos del instante se
colaban en la cadena (`"+05:44.9916666"`). El cero se escribe `+00:00`: ISO 8601
no admite `-00:00` (RFC 3339 lo reserva para «offset desconocido»). Dos tests
ajenos comentan el viejo `-00:00`; ambos comparan con `[+-]00:00`, así que
siguen en verde — su comentario es ahora historia, no comportamiento.

### 4. Una sola superficie pública (D7)

| Archivo | Qué contiene | Líneas |
|---|---|---|
| `dateCore.ts` | offsets, horas de pared ↔ instantes, día calendario | 249 |
| `dateRanges.ts` | `getDayRange`, `getDateRange`, día operativo, helpers de org | 205 |
| `dateDisplay.ts` | solo formateo para pantalla | 186 |
| `timezoneFallback.ts` | aviso del fallback | 137 |
| `timezone.ts` | **fachada**: reexporta todo + `isSupportedTimeZone` | 137 |

Ningún archivo pasa de 300 líneas y **ninguna función está implementada dos
veces**. `getToday` era un duplicado de `todayInTz`: ahora es una línea que la
llama, conservada porque nueve módulos la importan. `timezone.ts` no implementa
nada salvo `isSupportedTimeZone` (validación estricta para **escribir** una zona
en la base, distinta de la laxa para **leerla**) y lleva en la cabecera la tabla
de «qué función uso para qué». Todas las rutas de import anteriores
(`@/lib/utils/timezone`, `@/lib/utils/dateDisplay`) siguen funcionando.

### 5. El fallback deja de ser silencioso

`resolverZonaHoraria(valor, contexto)` devuelve la zona si venía y, si no,
`America/Bogota` avisando **una sola vez por clave**
(`donde|organización|sucursal|motivo`), con miga de Sentry cuando el SDK está
cargado (import dinámico, y no se intenta siquiera en servidor). Se avisa una
vez porque el caso real es un render que llama mil veces a lo mismo: un
`console.warn` por llamada es ruido que nadie lee, y por tanto equivale a no
avisar. Enganchado ya en `getOrganizationTimezone` (motivos `sin-dato` y
`error`).

Queda un solapamiento anotado a propósito: `branchTimezoneCascade.ts` (fase A3,
otro constructor) devuelve `source: 'fallback'` e `invalid[]`, que es
exactamente lo que hay que pasarle a `avisarFallbackZonaHoraria`. Se deja el
enganche para quien cierre A3, para no editar un archivo en vuelo.

### 6. La matriz de CI: seis zonas para lo que depende de la zona, dos para todo

`npm run test:tz-all` y el workflow corren en **`UTC`, `America/Bogota`,
`America/Mexico_City`, `Europe/Madrid`, `America/Santiago` y `Asia/Kathmandu`**.
Cada una aporta algo distinto: UTC es el runtime de Vercel; Bogotá, el de hoy;
Ciudad de México, otro offset sin DST (no lo tiene desde 2022); Madrid, el DST
del hemisferio norte; Santiago, el del hemisferio sur **con medianoche
inexistente**; Katmandú, el offset de 45 minutos.

Lo que corre en las seis es `src/__tests__/timezone/` + `guardrails`
(`npm run test:tz`). La **suite completa** corre en dos (UTC y Bogotá) y, de
momento, sin bloquear.

**Por qué el recorte:** la suite completa son 509 ficheros y 9 411 tests, 159 s
en local; el subconjunto de zonas son 6 ficheros. Correr la suite entera seis
veces no añade **ni un solo caso** de zona horaria —los tests que dependen del
`TZ` del runtime están todos en `src/__tests__/timezone/`— y sí añade cuatro
ejecuciones más de suites ajenas, una de las cuales (`pos-display/integracion`)
asegura una latencia por debajo de 100 ms y se cae sola en cuanto el runner va
cargado. Multiplicar por tres el tiempo de CI a cambio de flakiness no compensa.
El job de la suite completa lleva `continue-on-error` mientras sigan rojos los
dos preexistentes (`sectionContract`, fase F2.6 del editor web, y la latencia de
`pos-display`); el job de las seis zonas **sí bloquea desde ya**.

## Consecuencias

- Una organización en Chile, España o Lord Howe obtiene el día correcto en el
  cierre de caja, incluido el día del cambio de hora.
- En zonas sin DST no cambia ni un carácter de lo que se devolvía.
- Quien añada una función de fecha tiene un sitio donde ponerla y una tabla que
  dice cuál usar; si la duplica, se ve.
- Falta (no es de esta fase): que los ~291 sitios que escriben el día con
  `toISOString().split('T')` pasen por estas funciones. Fase B.
