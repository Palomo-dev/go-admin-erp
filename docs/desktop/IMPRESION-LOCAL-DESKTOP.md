# Impresión local-first en Go Admin Desktop

Estado: implementado (ROADMAP-DESKTOP §Fase 4, punto 1). Cierra el hallazgo 1.7
de `docs/AUDITORIA-DESKTOP-OFFLINE-UI-INSTALADOR.md` ("impresión offline:
imposible hoy").

## Problema

El POS insertaba cada ticket en `print_jobs` (Supabase) y el agente embebido
del Desktop lo leía de ahí por Realtime. Sin internet no salía el recibo,
aunque el camino local ya existía: IPC `printing:print-raw` → discovery server
`POST /print` → `printToDevice()`.

## Qué cambia

Dentro de Go Admin Desktop el POS **imprime primero por el agente local** y
`print_jobs` pasa a ser **registro de auditoría** que se sincroniza después y
nunca bloquea la impresión. Fuera del Desktop no cambia nada.

```
POS (renderer)                      main (Electron)               agente embebido
──────────────                      ───────────────               ───────────────
PrintJobsService.enqueue*()
  └ dispatchPrintJobs(rows, printers)
      ├ window.goAdminDesktop.printRaw(printer.id, sobre)
      │      → ipc 'printing:print-raw' ─→ POST 127.0.0.1:3456/print ─→ printToDevice(printer, jobType, payload)
      │                                                                  (mismo código que para un print_job)
      └ supabase.from('print_jobs').insert(auditoría)   (status 'printed', sin await)
```

### Sobre `LocalPrintRequest`

`print-agent/src/printing/types.ts` (compartido con el ERP vía `@printing`):

```ts
interface LocalPrintRequest<TPrinter, TPayload> {
  jobType: PrintJobType;   // kitchen_ticket | pre_cuenta | sale_ticket | shipment_guide | electronic_invoice | open_cash_drawer
  printer: TPrinter;       // la fila completa de `printers` que el POS ya resolvió
  payload: TPayload;       // el mismo JSON que iría en print_jobs.payload
}
```

Viaja la fila completa de `printers` porque, sin internet, el agente no puede
consultarla en Supabase. El agente sigue siendo quien da formato al ticket:
no hay una segunda implementación del render en el POS (regla 7 de CLAUDE.md).

## Piezas

| Capa | Archivo | Papel |
|---|---|---|
| POS | `src/lib/services/printJobsService.ts` | `dispatchPrintJobs()` es el transporte único de todos los `enqueue*`. `EnqueueResult = { enqueued, printedLocally }`. `isAgentOnline()` devuelve `true` en Desktop si el agente embebido corre, sin consultar `print_agents`. |
| POS | `src/lib/services/cashDrawerService.ts` | Estrategia 1a: cajón por la impresora `cashier` configurada vía `enqueueOpenCashDrawer` (→ `printRaw`). 1b: `bridge.openCashDrawer()` (impresora por defecto de Windows). Si 1a dejó el job `pending`, no se encola un segundo `open_cash_drawer`. |
| POS | `src/components/pos/configuracion/printersService.ts` | `getPrintersByStation()` guarda la última respuesta buena por `org:sucursal:estación` y la sirve cuando el Desktop informa que no hay red o la consulta falla. |
| POS | `src/lib/utils/desktopLocalCache.ts` | Caché "última respuesta buena" en `localStorage`, solo activa en Desktop. Claves: `printers-by-station:*`, `print-business-header:*`, `org-timezone:*`. |
| POS | `src/lib/utils/desktop.ts` | `isDesktopOnline()`: conectividad real del proceso main (`connectivity.ts`, health-check con histéresis), no `navigator.onLine`. |
| main | `electron/src/main/ipc.ts` | `printing:print-raw` reenvía a `/print` y conserva el `error` JSON del agente en 400/500. |
| agente | `print-agent/src/discoveryServer.ts` | `POST /print`: valida el sobre (`jobType` soportado, `printer.id` = `printerId`, `connection_type`, `is_active`) y llama a `printToDevice`. Espejo generado en `electron/src/agent/**` (`cd electron && npm run sync:agent`). |

## Matriz de comportamiento

| Contexto | `printRaw` | Fila en `print_jobs` | Resultado |
|---|---|---|---|
| Navegador / Desktop antiguo sin `printRaw` | no se llama | `pending` (await; lanza si falla) | como siempre: el agente imprime |
| Desktop con red, agente responde | `success: true` | `printed` + `printed_at`, sin await | `printedLocally = n` |
| Desktop sin red, agente responde | `success: true` | intento de insert; con `navigator.onLine === false` el interceptor de `config.ts` lo encola y lo sincroniza al volver | el ticket sale igual; cabecera, timezone e impresoras desde la caché |
| Desktop, agente caído (`success: false` o lanza) | falla | `pending` (await) | el agente lo imprime cuando vuelva; el `enqueue*` no lanza |
| Varias impresoras | se decide por fila | mezcla de `printed` y `pending` | `printedLocally` cuenta solo las locales |

Los `enqueue*` conservan su contrato: solo lanzan si **ninguna** fila salió
localmente **y** la inserción falló.

## Límites conocidos

- **WiFi con enlace pero sin internet** (`navigator.onLine === true`): el
  ticket sale por el agente local, pero el insert de auditoría no pasa por la
  cola offline de `config.ts` (que solo encola con `onLine === false`); si
  falla, queda un `console.warn` y no hay fila en `print_jobs`. Se resuelve
  con el outbox por operación de negocio (Fase 4, punto 4), no con un segundo
  mecanismo de cola aquí.
- La caché de impresoras/cabecera es "última respuesta buena": si nunca se
  imprimió con red en esa sucursal y estación, sin internet no hay nada que
  servir y se intenta la consulta (el interceptor sirve IndexedDB si la URL se
  pidió antes).
- `open_cash_drawer` por `printRaw` necesita una impresora asignada a
  `cashier`; sin ella se cae a la impresora por defecto de Windows (1b).

## Verificación

```bash
TZ=UTC            npx jest src/lib/services/__tests__/printJobsService
TZ=America/Bogota npx jest src/lib/services/__tests__/printJobsService
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json | grep -E "printJobsService|cashDrawerService|printersService|desktop.ts"
cd print-agent && npx tsc -p . --noEmit
cd electron && npm run sync:agent && npx tsc -p .
```

`src/lib/services/__tests__/printJobsService.desktop.test.ts` cubre navegador,
Desktop online, Desktop offline (cabecera e impresoras desde caché, auditoría
que falla sin bloquear), IPC caído (fallback a `pending`, varias impresoras,
comanda con estación sin impresora) y el cajón (estrategia 1a y no duplicar el
`pending`). Datos inventados: org 120, sucursal 7.

`jest.config.js` mapea ahora `@printing` → `print-agent/src/printing` para
que los tests puedan cargar `printJobsService`.

## Prueba manual en el Desktop

1. Con red, asignar una impresora a `cashier` y cobrar una venta: el ticket sale
   y en Configuración → Impresoras → Trabajos aparece como `printed`.
2. Desconectar el router (o la WiFi) y cobrar otra venta: el ticket sale igual.
   Al volver la red, la fila aparece en `print_jobs` con `status: 'printed'`.
3. Detener el agente embebido y cobrar: la fila queda `pending` y se imprime
   al arrancarlo de nuevo.
