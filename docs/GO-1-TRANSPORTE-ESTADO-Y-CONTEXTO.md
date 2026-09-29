# GO-1 · Transportadoras externas — estado y contexto

> **Para qué sirve este archivo.** Poner al día a cualquier sesión que retome la épica sin
> leerse el hilo entero. Dice qué está hecho, qué se verificó contra producción, en qué se
> equivocaba el plan original y qué falta.
>
> Última actualización: **2026-09-29**. Documento rector:
> `docs/PROMPT-CLAUDE-CODE-GO-1-transporte.md`. Seguimiento por rondas: `PROGRESS.md` (raíz).
>
> **Repositorio público**: aquí nunca van nombres de organizaciones cliente. Se usa el id
> (`org 113`) o una descripción (`una tienda de e-commerce`).

---

## 1. Qué problema resuelve la épica

Dos repos, una sola base:

- **`go-admin-erp`** — el ERP. Módulos `transporte`, `pos`, `inventario`, `finanzas`.
- **`goadmin-websites`** — los sitios públicos multi-tenant. **Ahí nace el 99 % de los
  envíos y de los cobros reales.**

Proyecto Supabase compartido: **`jgmgphmzusbluqhuqihj`**.

Hoy, cuando alguien compra en una tienda y paga, se crea un envío y **ahí se acaba todo**:
nadie le asigna transportadora, nadie genera guía, el estado nunca avanza y el comprador no
puede rastrear nada. La épica conecta Coordinadora, Envía, Servientrega e Interrapidísimo
para cerrar ese hueco.

**Corrección importante al encuadre del documento rector** (la hizo el dueño el 2026-09-14 y
cambia el objetivo): los $10.000 de flete plano **son la tarifa de envío propio**, no un
precio mal puesto de transportadora. Verificado: de los ~4.500 pedidos históricos, **ni uno
solo** se hizo con `delivery_third_party`. Así que la épica **no viene a arreglar un precio:
viene a añadir un método de entrega que hoy no existe**. El envío propio a $10.000 se queda
exactamente como está y la transportadora aparece al lado, sólo donde el comerciante la
active.

---

## 2. Estado verificado contra producción (2026-09-29)

| Métrica | Valor |
|---|---|
| Envíos totales | 745 (699 de pedido web) |
| Envíos con transportadora asignada | **0** |
| Envíos web que avanzaron de `pending` | **0** |
| Transportadoras sembradas (inactivas) | 8 (4 × org 113 y 135) |
| Transportadoras con credenciales | **0** |
| Credenciales de la pasarela rotadas | **0** |
| Productos con peso declarado | **0** de ~28.000 |
| Tarifas de envío | 23, todas de una organización de restaurante |
| Tablas de Fase 1 / GO-5 / GO-6 | **0 de 4** |

Es decir: **los cimientos están puestos y el flujo está entero por construir.**

---

## 3. Fase 0 — CERRADA

Todo aplicado y desplegado. Commits en `main` del ERP: `9b2a0ee2`, `2fce2916`, `76cc658c`,
`ae165037`, `6e19c72e`. En el sitio: el arreglo de la firma y el de `/tracking`, más
`CLAUDE.md` y los tipos de transporte.

### Lo que la Fase 0 dejó hecho

1. **SEC-0.a — la firma de los webhooks de la pasarela no se verificaba.** El código buscaba
   el secreto por `credential_type` cuando ese valor vive en `purpose`; no lo encontraba
   nunca y, en vez de rechazar, **procesaba el webhook igual**. Cualquiera con el endpoint y
   una referencia de pedido podía marcarlo como pagado. Arreglado, desplegado y con
   interruptor `WOMPI_WEBHOOK_ENFORCE_SIGNATURE`.
2. **SEC-0.b — credenciales de cobro legibles con la anon key.** Cuatro tablas
   (`integration_credentials`, `integration_connections`, `integration_connectors`,
   `organization_payment_methods`) tenían `FOR SELECT TO public USING (true)`. La anon key
   viaja en el bundle de 83 sitios. Cerradas las cuatro.
3. **0.1 — RLS de transporte.** `shipments`, `transport_carriers`, `delivery_attempts` y
   `proof_of_delivery` ya no se leen con la anon key (verificado: `42501`). De paso, las
   políticas de pertenencia se reescribieron con `(select auth.uid())` y JOIN.
4. **0.2 — `/tracking` del sitio.** Devolvía "envío no encontrado" para **cualquier** guía
   porque pedía nueve columnas inexistentes. Arreglado, más el filtro por organización que
   faltaba (un sitio podía rastrear guías de otra organización).
5. **0.3 — credenciales a Vault.** `fn_set_provider_secret` / `fn_get_provider_secret`
   (SECURITY DEFINER, sólo `service_role`), servicio server-only, endpoint
   `/api/transport/carriers/[id]/credentials` y diálogo reescrito. **Ya no se escribe ningún
   secreto en `transport_carriers.metadata`.**
6. **0.4 — seed.** 4 proveedores, 4 connectors y 8 transportadoras **inactivas**.
7. **0.5 — una sola ruta de creación de envío** + índice único parcial.
8. **0.6 — peso y dimensiones en `products`** + sección "Envío" en el formulario.

### Evidencia de que 0.5 funciona en producción

207 envíos web creados desde el despliegue · **201 con sus líneas** (`shipment_items`, que
antes no creaba ninguna de las dos rutas) · **0 duplicados**.

---

## 4. Correcciones al documento rector

El plan original traía una auditoría con 24 hallazgos. Al verificarla contra la base, varias
cosas resultaron distintas. **Si vas a seguir el documento rector, lee esto primero:**

| El documento dice | La realidad |
|---|---|
| "`providerCredentials.server.ts` es el patrón canónico para `integration_*`" | **Falso.** Ese módulo opera sobre `provider_configs`. Son dos backbones distintos: uno server-only sin grant a `anon`, el otro escrito **desde el navegador**. El lector de credenciales de integración se hizo en su propio módulo |
| "`integration_providers.category` no admite logística" | **Falso para esa tabla**: el CHECK ya admite `'delivery'`. (Sí es cierto para `provider_configs`) |
| "24 tarifas del restaurante" | Son **23** |
| "409 shipments" | Eran 459 entonces; hoy 745. El número crece: no lo cites de memoria |
| "las dos rutas de shipment están duplicadas" | Cierto, **y peor**: formatos de guía incompatibles, clientes distintos y una carrera real sin constraint único |
| "`npm test` pasa" como compuerta | **Vacío.** Ver §6 |

---

## 5. Trampas del proyecto (esto es lo que más tiempo ahorra)

Descubiertas a base de romperse. Ninguna es obvia leyendo el código.

**Base de datos**
- `integration_events`: `connection_id` es **NOT NULL**, `status` sólo admite
  `received|processed|error`, y `event_time` es `GENERATED ALWAYS`. Violar cualquiera hace
  que el insert falle **en silencio** si no compruebas `error`. Pasó dos veces: un rastro de
  auditoría estuvo meses sin escribirse y nadie se enteró.
- `idx_integration_events_dedupe` es UNIQUE `(connection_id, external_event_id)`. Un registro
  auxiliar de la misma transacción va con `external_event_id` en null.
- El secreto de eventos vive en `purpose`, **no** en `credential_type` (que vale `'secret'`).
- Quitar una política `USING (true)` **destapa el coste** de la que queda debajo. Usa
  `(select auth.uid())` y JOIN en vez de subconsulta anidada, o llegan los timeouts.
- `service_role` **se salta RLS**. Si unas peticiones fallan y todas son service_role, un
  cambio de políticas no puede ser la causa.

**Repos**
- `next build` del ERP **no valida tipos ni lintea** (`ignoreBuildErrors` +
  `ignoreDuringBuilds`). El gate real es `npx tsc --noEmit -p tsconfig.json` aparte.
- `tsc` necesita más heap: sin `NODE_OPTIONS=--max-old-space-size=8192` se queda sin memoria
  y reporta **un falso "0 errores"**.
- En el sitio, `npm run lint` **no lintea nada**: `next lint` no está configurado, abre el
  prompt interactivo y sale 0.
- El sitio **no tiene tests**. "npm test pasa" ahí no verifica nada.
- **`types/database.ts` del sitio nunca ha protegido nada**: está declarado como `interface`
  (sin firma de índice) y ninguna tabla lleva `Relationships`, las dos cosas que supabase-js
  2.107 exige. El `Database` entero resuelve a `never`. Es la razón de los ~70 `as any` y de
  que el bug de `/tracking` compilara. Al corregirlo aparecen **202 errores de tipo**. Es un
  proyecto aparte, no de GO-1.
- El árbol de ambos repos está **compartido con muchas sesiones en paralelo**: `git add` de
  rutas explícitas, nunca `git add -A`, y `git status -sb` antes de cada commit.

---

## 6. Compuertas reales

| Repo | Qué correr |
|---|---|
| `go-admin-erp` | `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` · `npx jest` · `npx next build` · `npx next lint --file <los que tocaste>` |
| `goadmin-websites` | `npm run typecheck` · `npx next build` · `npm run verify:tracking` |

`npm test` del ERP ya venía con tests rojos de otras líneas de trabajo: **toma tu línea base
antes de empezar** o atribuirás a tu cambio fallos ajenos. Pasó, y se evitó justo por eso.

---

## 7. Lo que falta

### 7.1 Acciones del dueño (nada de esto lo desbloquea el código)

1. **Activar `WOMPI_WEBHOOK_ENFORCE_SIGNATURE=true`.** Ya hay evidencia: **386 veredictos
   registrados entre el 15 y el 29 de septiembre, todos `match`, cero `mismatch`**, en las
   organizaciones 135, 137 y 145. El secreto guardado coincide con el de la pasarela.
   *Salvedad honesta*: la **org 113 no ha producido ni un veredicto** en 14 días. O no ha
   tenido tráfico, o su conexión no resuelve. Conviene mirarlo antes de bloquear, porque si
   es lo segundo, al activar el bloqueo esa organización deja de confirmar pedidos.
2. **Rotar las credenciales de la pasarela.** Siguen en `rotated_at = null` desde junio, tras
   haber estado legibles ~3 meses. Se rotan en el panel de cada comercio, coordinado con
   ellos, actualizando la base en la misma ventana.
3. **Cruzar pedidos pagados contra las transacciones reales** de la pasarela para descartar
   abuso durante esos 3 meses. Un pedido pagado sin transacción correspondiente es la huella
   de un webhook forjado.
4. **Pedir acceso de API a las cuatro transportadoras.** Es el trámite con el plazo más largo
   de toda la épica y **no empieza hasta que alguien lo pida**. Sin contrato y credenciales
   no hay guía real, por mucho código que se escriba.

### 7.2 El bloqueante que no se resuelve con código

Para generar una guía de verdad hacen falta **contrato comercial + credenciales + la
documentación oficial vigente** de cada transportadora. Por eso el seed dejó `docs_url` y
`tracking_url_template` en **NULL** en vez de inventárselos: una URL de rastreo inventada
manda a compradores reales a un 404.

**Nunca mockees un adaptador para que "pase" un criterio de aceptación.** Un adaptador que
lanza `CarrierUnavailableError` documentado es un resultado válido; uno que devuelve datos
falsos es deuda disfrazada de verde.

### 7.3 Fases pendientes, por orden de dependencia

- **Fase 1 — checkout web y tarifas.** Es la siguiente y **la única que aporta valor sin
  depender de las transportadoras**: estructurar zonas y tarifas ya mejora el envío propio de
  hoy. Incluye `shipping_zones` + `shipping_zone_locations` + columnas en `shipping_rates` +
  el flag `website_settings.shipping_engine`, la pantalla de zonas en el ERP, separar los
  tres conceptos del checkout (modo de pedido / método de entrega / tarifa), mandar el
  `shippingRateId` al servidor, y que `/api/orders` **recalcule los importes** (hoy un cliente
  puede mandar `shipping: 0`).
- **GO-2 — adaptadores** (requiere 7.2).
- **GO-3 — POS**: `sales.delivery_type` y `carrier_id`, que `posService` los persista (hoy los
  recibe y los descarta), y el refactor previo de `CheckoutDialog` (2.312 líneas, es el cobro).
- **GO-4 — pedidos web**: resolver transportadora y generar guía. Requiere Fase 1 + GO-2.
- **GO-5 — trazabilidad**: `carrier_tracking_status`, webhook entrante, cron de polling y la
  línea de tiempo. Es lo que hace que un envío deje de estar clavado en `pending`.
- **GO-6 — costo real y contabilidad**: `shipment_costs`, línea en factura, asiento y CxP, y
  el reporte de margen.

---

## 8. Reglas que gobiernan cualquier trabajo en esta épica

1. **Contrato de no regresión.** 83 sitios en producción y ventas reales. Todo cambio de
   esquema es aditivo; la rama por defecto es el comportamiento de hoy; el motor nuevo se
   activa por organización con un flag, nunca de golpe. Si hay que elegir entre elegancia y
   no romper producción, se elige no romper producción y se anota la deuda.
2. **El módulo de transporte de pasajeros no se toca.** `transport_fares`, `transport_routes`,
   `transport_stops`, `route_schedules`, `vehicles`, `manifest_shipments`… son otro dominio.
3. **La organización de restaurante (org 120) no es el objetivo.** Entrega con moto propia,
   tarifa plana por barrio, tiempos en minutos. GO-1 no aplica ahí: no lo rompas.
4. **Migraciones**: se aplican por MCP y se versionan con su `.sql` y su rollback en el mismo
   commit (`docs/POLITICA-MIGRACIONES.md`). Ensáyalas en `begin … rollback` antes.
5. **Parar y preguntar** si: la documentación de una API no está clara, hay que migrar datos
   históricos, hay que mapear las tarifas del restaurante a zonas, o un hallazgo nuevo
   invalida parte del plan.

---

## 9. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Plan completo de la épica | `docs/PROMPT-CLAUDE-CODE-GO-1-transporte.md` |
| Historial ronda a ronda | `PROGRESS.md` (raíz del ERP) |
| Credenciales de transportadora | `src/lib/services/integrations/carriers/carrierCredentials.server.ts` |
| Endpoint de credenciales | `src/app/api/transport/carriers/[id]/credentials/route.ts` |
| Creación de envíos (ruta única) | `src/lib/services/deliveryIntegrationService.ts` |
| Tests del contrato de envíos | `src/lib/services/__tests__/deliveryIntegration.webOrderShipment.test.ts` |
| Migraciones de la fase 0 | `supabase/migrations/2026091*_fase0_*` y `20260909230000_sec0b_*` |
| Webhook de la pasarela (sitio) | `goadmin-websites/app/api/webhooks/wompi_co/route.ts` |
| Verificación de `/tracking` (sitio) | `goadmin-websites/scripts/verify-tracking.mjs` |
