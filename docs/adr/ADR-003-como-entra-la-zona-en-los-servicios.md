# ADR-003 — Cómo entra la zona horaria en `src/lib/services/**`

- Fecha: 2026-09-23
- Estado: aceptada
- Contexto previo: [ADR-001](ADR-001-timezone-por-sucursal.md) (cascada sucursal → organización →
  `America/Bogota`), inventarios `docs/inventario-fase-B-escrituras.md` y
  `docs/inventario-fase-C-presentacion.md`.

## Contexto

El inventario de la Fase B encontró que **ningún servicio llama todavía** a `fn_timezone_for` ni a
`getOrganizationTimezone`: hay ~90 call-sites cuyo arreglo depende de una sola decisión previa —
cómo llega la zona horaria a una función de `src/lib/services/**`. Sin esa decisión no se pueden
cerrar las tandas de cartera, nómina, PMS ni parking.

Además, varios servicios (`employeeLoansService`, `payrollService`, `taskService`, `gymService`,
`housekeepingService`, `propinasService`, `reservasMesasService`, `pmsCrmLink`) **no reciben la
organización en ninguna firma**: hoy la deducen del cliente de Supabase con sesión.

## Opciones

1. **Parámetro `timezone?: string` opcional en cada servicio.** Coste bajo de escritura, pero es
   exactamente la forma del bug de impresión de la ronda 4: un campo opcional que nadie rellena no
   arregla nada y no falla de forma visible. Descartada.
2. **Parámetro `timezone: string` obligatorio.** Explícito y trivial de probar, pero obliga a que
   cada llamador resuelva la zona por su cuenta: multiplica los caminos de resolución (justo lo que
   ADR-001 quiso evitar) y toca cientos de llamadores, muchos de los cuales tampoco tienen la
   organización a mano.
3. **El servicio recibe identidad (`organizationId`, y `branchId` cuando el dato tiene sucursal) y
   resuelve la zona internamente con un único helper cacheado.** Un solo camino de resolución,
   misma cascada que la base, y la identidad ya está disponible (o es fácil de añadir) en casi todas
   las firmas. Coste: una consulta por organización/sucursal, amortizada por caché.
4. Contexto implícito por `AsyncLocalStorage` en servidor. Resuelve la ergonomía, pero no funciona
   en los servicios que corren en el navegador (la mayoría aquí) y añade un mecanismo que nadie más
   en el repositorio usa.

## Decisión

**Opción 3.** Los servicios reciben **identidad, no zona**:

```ts
// src/lib/services/timezoneResolver.ts  (Tanda 0)
export async function resolveTimezone(
  organizationId: number,
  branchId?: number | null,
): Promise<string>;           // cascada sucursal → organización → 'America/Bogota'
export function invalidateResolvedTimezone(organizationId?: number): void;
```

- Se apoya en `getOrganizationTimezone` y `getBranchTimezones` (ya existen y cachean) y en
  `resolveTimezoneCascade` de `src/lib/utils/branchTimezoneCascade.ts`, que es **la misma cascada**
  que `fn_timezone_for` en Postgres. Un único test compara ambas con los mismos datos.
- Un servicio que hoy no recibe la organización **cambia su firma para recibirla** (no para recibir
  la zona). Es un cambio mecánico y el compilador señala a todos los llamadores.
- Cuando el dato tiene `branch_id`, se pasa: la zona es la de la sucursal **dueña del dato**, nunca
  la de la sucursal seleccionada en la barra superior.
- Prohibido el parámetro `timezone?: string` opcional nuevo. Si una función necesita la zona y no
  puede obtener la identidad, eso es un problema de diseño de esa función y se resuelve, no se tapa
  con un opcional.

## Consecuencias

**Buenas:** un solo camino de resolución en el cliente, idéntico al de la base; las firmas dicen la
verdad sobre lo que el servicio necesita; el compilador encuentra a los llamadores; la caché evita
consultas repetidas y se invalida al guardar la configuración.

**Malas:** hay que tocar las firmas de ~9 servicios y sus llamadores, y las funciones pasan a ser
`async` donde no lo eran. En los pocos sitios sin identidad posible (catálogo global de
`currency_rates`) se mantiene el día del sistema (`fn_today_system`), documentado en ADR-004.
