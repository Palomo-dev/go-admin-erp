# POS de doble pantalla — Plan

> Hardware objetivo: un equipo POS con dos pantallas. La **pantalla del cajero**
> es la que ya existe (`/app/pos`). La **pantalla del cliente** es nueva: mira
> hacia el comprador y muestra el resumen del pedido, el estado del pago, la
> propina y, cuando no hay venta en curso, contenido de marca.
>
> Alcance: web (navegador) y escritorio (Electron). Mismo código de pantalla en
> ambos; cambia solo cómo se abre y se coloca.

---

## 1. Resumen ejecutivo

**Qué se construye.** Una ruta pública `/pos-display` que refleja en tiempo real
lo que pasa en la caja, y la infraestructura para abrirla en la segunda
pantalla: una ventana kiosco en Electron, una ventana emergente en web.

**La decisión que lo define todo.** La caja es la **única fuente de verdad**.
La pantalla del cliente es un **espejo**: no calcula, no persiste, no llama a
la base de datos por la venta. Recibe una proyección del carrito y la pinta.
Hacia arriba solo devuelve tres cosas, todas iniciadas por el cliente y
confirmadas en la caja: propina elegida, calificación y "listo" en un QR.

**Por qué así.** El carrito del POS vive en `localStorage` del navegador de la
caja (`posService.saveCartsToStorage`, `pos_carts_<org>`), no en la base.
Cualquier diseño que haga a la pantalla leer la venta de Supabase obliga a
persistir el carrito en cada tecla, mete latencia, rompe el modo sin conexión
y añade carga a una base que ya se ha caído dos veces por tráfico. El espejo
local evita todo eso: cero latencia, cero tráfico, funciona sin internet.

**Transporte.** `BroadcastChannel` del navegador entre las dos ventanas (misma
máquina, mismo origen: cubre Electron y web). Para una pantalla en **otro
dispositivo** (una tableta), Supabase Realtime *Broadcast* con emparejamiento
por token. Misma interfaz, dos implementaciones; la pantalla no sabe cuál usa.

---

## 2. Lo que ya existe (verificado en código y base)

| Pieza | Dónde | Cómo se aprovecha |
|---|---|---|
| Carrito del POS | `src/components/pos/types.ts` (`Cart`, `CartItem`, `CartItemModifier`), `src/lib/services/posService.ts` | Es lo que se proyecta a la pantalla. Se toca `posService` solo para **emitir** tras cada cambio; no se cambia cómo guarda. |
| Precedente de pantalla propia | `src/app/qr-display/[deviceId]/page.tsx`, `src/app/gym-display/[deviceId]/page.tsx`, tabla `gym_access_devices` | Patrón de ruta fuera de `/app` (sin sidebar) identificada por dispositivo, con token rotatorio. `/pos-display` sigue el mismo molde. |
| Electron multi-monitor | `electron/src/main/windows/mainWindow.ts` (`screen.getAllDisplays()`, `isPositionVisible`) | Ya detecta monitores y evita ventanas fuera de pantalla. Se añade una segunda ventana con la misma disciplina. |
| Electron carga la web remota | `WEB_APP_URL` en `electron/src/main/constants.ts` | La ventana del cliente carga `/pos-display` del **mismo origen** → comparte sesión, `localStorage` y `BroadcastChannel` con la caja. |
| IPC | `electron/src/main/ipc.ts` (24 handlers), `electron/src/preload/index.ts` | Se añaden 4 canales `pos-display:*`. |
| Sesión de caja | `cash_sessions` (`branch_id`, `opened_by`, `status`) | Nombre del cajero en pantalla; sin sesión abierta la pantalla queda en modo reposo. |
| Medios de pago | `payment_methods.code`: `cash`, `card`, `nequi`, `daviplata`, `breb_qr`, `bold_qr`, `bancolombia_qr`, `redeban_qr`, `wompi`, `transfer`… | Estados de pago de la pantalla: efectivo (recibido/cambio), tarjeta (siga instrucciones del datáfono), **QR (mostrar el código al cliente)**. |
| Propinas | tabla `tips` (`sale_id`, `payment_id`, `amount`, `tip_type`) | La propina elegida en pantalla se registra por el flujo que ya existe. |
| Marca | `organizations.logo_url`, `primary_color`, `secondary_color`, `timezone`; `branches.website_logo_url` | Pantalla con la identidad del comercio sin configuración extra. |
| Estaciones de impresión | `print_jobs.station`, `printer_station_assignments` | Concepto de "puesto físico" ya existe para impresoras; `pos_terminals` lo formaliza para la caja completa. |
| i18n | `next-intl` (`useTranslations`, `useLocale`) | La pantalla del cliente se traduce igual que el resto. |

**Lo que NO existe** y hay que crear: identidad de terminal/caja física
(`pos_terminals`), la ruta `/pos-display`, el protocolo de mensajes, la
ventana Electron secundaria, y la configuración de la pantalla.

---

## 3. Decisiones de arquitectura

### 3.1 La caja manda; la pantalla refleja

```
   ┌──────────────────────┐   proyección (1 → N)   ┌──────────────────────┐
   │  Pantalla del cajero │ ─────────────────────▶ │ Pantalla del cliente │
   │  /app/pos            │                        │ /pos-display         │
   │  (fuente de verdad)  │ ◀───────────────────── │ (espejo)             │
   └──────────────────────┘   eventos acotados      └──────────────────────┘
                              (propina, calificación,
                               "ya escaneé")
```

- **Hacia abajo** viaja un `DisplayState` completo (no deltas). Es pequeño
  (una venta tiene decenas de líneas, no miles) y hace trivial la
  recuperación: la pantalla que se conecta tarde pide `snapshot` y recibe
  todo. Sin deltas no hay estado divergente que reconciliar.
- **Hacia arriba** viajan **intenciones**, nunca hechos. La pantalla dice
  "el cliente eligió 10 %"; la caja decide, aplica y vuelve a proyectar. Así
  la pantalla no puede corromper una venta ni aunque la manipulen.
- Cada mensaje lleva `seq` creciente y `terminalId`. La pantalla descarta lo
  que llegue fuera de orden o de otra terminal.

### 3.2 Transporte: local primero, remoto como extensión

```ts
// Firma real (src/lib/pos/display/transport.ts). El transporte es dueño del
// sobre: publish() recibe un borrador y él añade v, seq, terminalId, instanceId.
interface DisplayTransport {
  publish(msg: DownMessageDraft): void;
  announce(hello: HelloDraft, state: DisplayState): void; // hello y luego state, misma vuelta
  onUp(handler: (msg: UpMessage) => void): () => void;
  startHeartbeat(): void;
  stopHeartbeat(): void;
  close(): void;
}
interface DisplayReceiver {
  send(msg: UpMessageDraft): void;
  onDown(handler: (msg: DownMessage) => void): () => void;
  releaseActiveInstance(): void;
  close(): void;
  // getters: activeInstanceId, lastSeq, lastReceivedAt, lastByeAt, lastStaleAt,
  //          incompatibleVersionAt, incompatibleVersionCount
}
```

| Implementación | Cuándo | Latencia | Sin internet | Coste servidor |
|---|---|---|---|---|
| `BroadcastChannelTransport` | Dos ventanas en la misma máquina (Electron o web) | ~0 ms | Sí | Ninguno |
| `SupabaseBroadcastTransport` | Pantalla en otro dispositivo (tableta) | 50–200 ms | No | Un canal Realtime por terminal, sin escrituras en BD |

`BroadcastChannel` es de la plataforma web, mismo origen, sin servidor. Las
dos ventanas de Electron y las dos ventanas del navegador comparten origen,
así que es la opción por defecto. Supabase *Broadcast* (no *Postgres
Changes*) **no escribe en la base**, así que no añade carga como la que tumbó
el servicio el 14 de septiembre; se usa solo cuando la pantalla vive en otro
aparato.

### 3.3 Identidad: la terminal

Hoy el POS no sabe "en qué caja física estoy". Las impresoras lo resuelven con
`station` (texto). Para la pantalla hace falta una identidad estable que
sobreviva a recargas y que una tableta remota pueda emparejar. De ahí
`pos_terminals` (§6).

- **Misma máquina:** la caja guarda `terminalId` en `localStorage`; la ventana
  de la pantalla lo lee del mismo `localStorage` (mismo origen). Sin
  emparejamiento.
- **Otro dispositivo:** la pantalla abre `/pos-display?pair=<código de 6
  dígitos>`, canjea el código por un token de larga duración vinculado a la
  terminal, y lo guarda localmente. El código caduca en 5 minutos.

### 3.4 Un solo código de pantalla

`/pos-display` es la misma página en web y en Electron. Electron solo aporta
**dónde** se abre (monitor secundario, kiosco, recuperación al desconectar
monitor). No hay lógica de negocio en Electron.

### 3.5 Sin conexión

La caja ya opera sin internet en escritorio. Con `BroadcastChannel` la
pantalla también. El único punto que necesita red es la imagen de un QR de
pago dinámico (Bold, Wompi, Bre-B con importe): si no hay red, la pantalla
muestra el estado "pago con QR: siga las instrucciones del cajero" y no un
código roto.

---

## 4. Pantalla del cliente — experiencia

### 4.1 Principios

1. **Legible a 1,5 metros.** Total en ≥ 96 px, líneas en ≥ 28 px, contraste
   AA sobre el color de marca. Sin scroll: si la venta no cabe, se muestran las
   últimas líneas y un contador "y 12 más".
2. **Cada cambio se nota, ninguno distrae.** La línea que acaba de entrar se
   resalta 600 ms y el total hace un *tick* numérico. Nada parpadea, nada
   rota, nada suena.
3. **Nunca miente.** Si la pantalla pierde a la caja más de 3 s, deja de
   mostrar importes y pasa a "Conectando…". Un total desactualizado frente a
   un cliente es peor que no mostrar nada.
4. **Cero navegación.** No hay menús. La pantalla solo reacciona a la caja y,
   si es táctil, a tres gestos: elegir propina, calificar, cerrar un QR.
5. **Marca del comercio, no de GO Admin.** Logo, colores y nombre de la
   organización (§2). GO Admin aparece en el pie, pequeño.

### 4.2 Estados

**Por defecto la pantalla solo muestra el resumen** (reposo, pedido, cobro,
gracias). Propina y calificación **no aparecen** hasta que la organización
las activa en Configuración › POS › *Pantalla del cliente* (§5.2). Así una
pantalla recién instalada nunca sorprende al cliente con preguntas que el
comercio no ha decidido hacer.

| Estado | Qué ve el cliente | Entra cuando | Sale cuando |
|---|---|---|---|
| **Reposo** | Logo, promociones configuradas o reloj + "Bienvenido". | Sin carrito activo, o 90 s sin actividad tras una venta. | Entra la primera línea. |
| **Pedido** | Líneas (nombre, cantidad, precio, modificadores), descuentos, impuestos según configuración, **total**. Cajero atendiendo. | Carrito con ≥ 1 línea. | Se inicia el cobro. |
| **Cobro · efectivo** | Total, **recibido** y **cambio** en grande. | Cajero abre el cobro en efectivo. | Se confirma la venta. |
| **Cobro · tarjeta** | Total y "Siga las instrucciones del datáfono". | Método `card`, `bold_card`. | Se confirma la venta. |
| **Cobro · QR** | Total y **el QR a pantalla completa** con el nombre del medio (Bre-B, Nequi, Bold…). Botón táctil "Ya pagué" que solo avisa al cajero. | Métodos `*_qr`, `nequi`, `daviplata`, `transfer` con QR. | Se confirma la venta o el cajero cambia de método. |
| **Propina** *(solo si está activada)* | "¿Desea dejar propina?" con 3 porcentajes configurables + "Otro" + "Sin propina". Importe calculado en vivo. **Táctil:** el cliente pulsa. **No táctil:** se muestran los importes como información y el cajero registra lo que el cliente diga, en la caja. | Antes del cobro, si `tips.enabled`. | El cliente elige, o el cajero omite. |
| **Gracias** | "Gracias por su compra" y total pagado. **Si la calificación está activada y la pantalla es táctil:** además, 1–5 con una sola pulsación. Sin táctil no se pide (pedirle al cajero que la teclee la invalida). | Venta confirmada. | 8 s, o siguiente venta. |
| **Conectando** | Marca en gris + "Conectando con la caja…". | Sin latido de la caja durante 3 s. | Vuelve el latido. |
| **Cerrado** | Marca + "Caja cerrada". | Sin `cash_session` abierta. | Se abre la caja. |

Transición visual entre estados: fundido de 200 ms. Ninguna animación de
entrada mayor de 300 ms.

### 4.3 Diseño de la vista "Pedido" (la que más tiempo se ve)

```
┌────────────────────────────────────────────────────────────────────┐
│ [logo]  NOMBRE DEL COMERCIO                      Caja 1 · Andrea   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  2 × Café americano                                     $ 9.000    │
│      ▸ Leche de almendras  (+$1.500)                               │
│  1 × Croissant de jamón                                 $ 7.500    │
│  1 × Jugo de naranja                     ▌resaltado▐    $ 6.000    │
│                                                                    │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│  Subtotal                                              $ 22.500    │
│  Descuento (cupón BIENVENIDO)                          −$ 2.250    │
│  IVA incluido                                           $ 3.234    │
│                                                                    │
│  TOTAL                                          $ 20.250           │
│                                                 ▲ 96 px, color de  │
│                                                   marca            │
└────────────────────────────────────────────────────────────────────┘
```

- Impuestos: se muestran como "IVA incluido" o desglosados según
  `Cart.tax_included`, igual que en el recibo. Nunca una cifra que el recibo
  no vaya a repetir.
- Descuentos por línea y por carrito visibles con su motivo si lo hay
  (nombre de promoción o cupón). Es el momento en que el cliente los ve.
- Precios con el formato y moneda de la organización, mismo helper que el
  recibo.

### 4.4 Táctil o no

El mismo modelo de hardware a veces trae pantalla del cliente táctil y a
veces no. La pantalla declara `capabilities.touch` al conectar (detección
por `navigator.maxTouchPoints > 0`, con posibilidad de forzarlo en ajustes
si el hardware miente) y se adapta sola:

| Función | Activada + táctil | Activada + no táctil | Desactivada |
|---|---|---|---|
| Propina | El cliente elige en pantalla; la caja confirma. | Se muestran los importes sugeridos; el cajero registra la elección en la caja. | No aparece. |
| Calificación | El cliente pulsa 1–5. | No aparece. | No aparece. |
| "Ya pagué" en QR | Botón táctil que avisa al cajero. | No aparece; el cajero confirma al ver el pago. | — |

Regla: la pantalla nunca muestra un control que no pueda usarse, y nunca
pregunta lo que el comercio no ha activado.

### 4.5 Accesibilidad e idioma

- Idioma de la organización (`next-intl`); opción por terminal de fijar otro.
- Números y moneda con `Intl.NumberFormat` según `locale` y moneda de la
  organización.
- Contraste: el color de marca se usa en el total y acentos; el texto corre
  sobre fondo neutro. Si el color de marca no alcanza AA sobre blanco, se
  oscurece automáticamente (mismo criterio que el editor web).
- Sin dependencia del color para el significado: el descuento lleva el signo
  "−" y la palabra, no solo color.

---

## 5. Pantalla del cajero — qué cambia

Muy poco, a propósito. Un cajero no debe aprender nada nuevo para vender.

1. **Indicador de pantalla del cliente** en la cabecera del POS: punto verde
   "Pantalla del cliente conectada" / gris "Sin pantalla". Al pulsarlo:
   abrir, cerrar, "mostrar QR de emparejamiento" (para tableta), vista previa
   en miniatura.
2. **Botón "Abrir pantalla del cliente"** en el propio indicador y en la
   tarjeta de configuración (§5.2). En Electron abre la ventana en el monitor
   secundario; en web abre una ventana emergente e indica arrastrarla a la
   otra pantalla.
3. **Propina desde pantalla:** cuando el cliente elige en la pantalla táctil,
   en la caja aparece un aviso no bloqueante "Cliente eligió 10 % ($2.025)"
   con *Aplicar* / *Cambiar*. El cajero confirma; nada se aplica solo.
4. **Cobro con QR:** el modal de pago ya existente gana un botón "Mostrar en
   pantalla del cliente" que envía el QR. Si hay pantalla conectada, va marcado
   por defecto.
5. **Recuperación silenciosa:** si la pantalla se desconecta, el POS sigue
   vendiendo exactamente igual. Nunca un error modal por la pantalla.

### 5.2 Dónde se configura: Configuración › POS › "Pantalla del cliente"

La pestaña POS de `/app/configuracion` renderiza
`src/components/pos/configuracion/ConfiguracionPage.tsx` (vía
`POSConfigPanel`), que ya tiene tarjetas para Consecutivos, Propinas, Cargos
de servicio, Impresión, métodos de pago y horas de operación. Se añade **una
tarjeta más, "Pantalla del cliente"**, al mismo nivel y con el mismo patrón
(tarjeta + modal `ConfigModal`). Nada de una sección nueva en otro sitio.

Ajustes de la tarjeta:

| Ajuste | Por defecto | Notas |
|---|---|---|
| Pantalla del cliente | Desactivada | Interruptor maestro. Apagado = el POS no emite nada. |
| Propina en pantalla | Desactivada | Al activarla aparecen: porcentajes sugeridos (3, editables; por defecto 5/10/15), permitir "Otro". |
| Calificación al final | Desactivada | Solo actúa en pantallas táctiles (§4.4). |
| Desglose de impuestos | Desactivado | Apagado muestra "IVA incluido"; encendido, desglosado como en el recibo. |
| Mostrar nombre del cliente | Desactivado | Privacidad primero. |
| Modo reposo | Marca | Marca / promociones activas / imágenes propias. Tiempo hasta reposo: 90 s. |
| Idioma | El de la organización | Por si la pantalla debe ir en otro idioma que el ERP. |
| Forzar táctil / no táctil | Automático | Solo si la detección se equivoca con el hardware. |
| Abrir pantalla ahora | — | Botón. En Electron, además: elegir monitor. |
| Emparejar otro dispositivo | — | Genera el código de 6 dígitos (fase 3). |

**Persistencia:** en `organization_settings` con clave `pos_customer_display`,
que es la convención que ya usa esta misma página (`pos_categories_display`,
`pos_blind_cash_count`, `pos_cash_session_mode`, `pos_require_cash_session`,
`operating_hours`). Mismo `upsert` con `onConflict: 'organization_id,key'`,
misma RLS, sin ruta de API nueva. Al guardar, la caja vuelve a emitir `hello`
para que la pantalla aplique los cambios sin recargar.

Es configuración **de la organización**, no de cada caja: el comercio decide
una vez si pregunta propina, y todas sus cajas lo hacen igual. Lo único por
caja es la identidad y el emparejamiento (`pos_terminals`, §6.1).

---

## 6. Base de datos

Todo por el MCP de Supabase, con `.sql` en `supabase/migrations/` y su
reversión en `supabase/rollbacks/` en el mismo commit
(`docs/POLITICA-MIGRACIONES.md`). Migraciones aditivas; nada de `DROP` sobre
tablas con datos.

### 6.1 Ajustes de la pantalla: `organization_settings`, clave `pos_customer_display`

**Sin migración.** La tabla ya existe y es la convención de esta misma
pantalla de configuración (§5.2). Una fila por organización:

```json
{
  "enabled": false,
  "tips":    { "enabled": false, "presets": [5, 10, 15], "allowCustom": true },
  "rating":  { "enabled": false },
  "showTaxBreakdown": false,
  "showCustomerName": false,
  "idle":    { "mode": "brand", "mediaUrls": [], "idleAfterSeconds": 90 },
  "locale":  null,
  "touch":   "auto"
}
```

Se valida en el cliente con un esquema (`zod`) antes del `upsert`, y la
pantalla vuelve a validar lo que recibe: un JSON malformado degrada a los
valores por defecto, nunca a una pantalla rota.

### 6.2 `pos_terminals` — la caja física (fase 2)

Solo identidad y emparejamiento. Ningún ajuste de presentación aquí.

```sql
create table public.pos_terminals (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           integer not null references public.organizations(id),
  branch_id                 integer not null references public.branches(id),
  name                      text not null,                 -- "Caja 1"
  code                      text not null,                 -- corto, para el pie de pantalla y recibos
  is_active                 boolean not null default true,
  -- Emparejamiento de una pantalla en otro dispositivo (fase 3)
  pairing_code              text,                          -- 6 dígitos, corta vida
  pairing_code_expires_at   timestamptz,
  display_token_hash        text,                          -- sha256 del token de larga duración
  display_last_seen_at      timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (organization_id, branch_id, code)
);
create index pos_terminals_org_branch_idx on public.pos_terminals (organization_id, branch_id);
```

¿Por qué separar identidad (tabla) de ajustes (`organization_settings`)? Los
ajustes son de la organización: el comercio decide una vez si pregunta
propina y todas sus cajas lo hacen igual. La identidad es por caja porque
una tableta se empareja con **una** caja concreta. Mezclarlo obligaría a
repetir la configuración en cada terminal.

### 6.3 `pos_display_feedback` — calificaciones (fase 4, opcional)

```sql
create table public.pos_display_feedback (
  id               uuid primary key default gen_random_uuid(),
  organization_id  integer not null,
  branch_id        integer not null,
  terminal_id      uuid not null references public.pos_terminals(id),
  sale_id          uuid,                     -- puede ser null si calificó y la venta se anuló
  rating           smallint not null check (rating between 1 and 5),
  created_at       timestamptz not null default now()
);
```

Sin datos personales del cliente. Solo el número.

### 6.4 Lo que NO se crea

- **No** se persiste el carrito del POS en la base para la pantalla (§3.1).
- **No** se crea tabla de "eventos de pantalla" en el MVP: el tráfico va por
  `BroadcastChannel`/Realtime *Broadcast* y no toca Postgres.

### 6.5 RLS

- `pos_terminals`: `select/insert/update` para miembros de la organización
  (patrón de pertenencia con `IN (SELECT … JOIN)` y `(select auth.uid())`, no
  `EXISTS` anidado — ver lo aprendido en `rls-quitar-qual-true-destapa-el-coste`).
  Nada para `anon`.
  - F2-A ronda 3 (migración `20260921150000`): `update` exige además el mismo
    criterio que la ruta de §7 — membresía activa con `role_id in (1, 2, 5)`
    (ids, nunca nombres) o `is_super_admin`, O
    `check_user_permission(uid, organization_id, 'admin.full_access')` para los
    cargos con permiso. Un cajero que salte la ruta con PostgREST obtiene 0
    filas (el `using` filtra; el `with_check` daría 42501). Defensa en
    profundidad: la ruta sigue siendo quien responde `ADMIN_REQUIRED`.
  - F2-A ronda 3 (migración `20260921150100`): el código es único sin
    distinguir mayúsculas en la base (índice único sobre `upper(code)`, 23505)
    y se exige en mayúsculas (CHECK `code = upper(code)`, 23514): la regla ya
    no depende de que el cliente normalice.
- `pos_display_feedback`: `insert` solo desde servidor (`service_role` tras
  validar el token de la pantalla); `select` para miembros.
- La pantalla remota **nunca** consulta tablas directamente: pasa por las
  rutas de §7 que validan su token.

---

## 7. Backend

Toda ruta empieza por `getServerOrgContext()`; la organización sale de la
sesión, nunca del body (regla 5 del `CLAUDE.md`). Las rutas de la pantalla
remota, que no tiene sesión, autentican por token y resuelven la organización
**desde la terminal**, no desde la petición.

| Ruta | Método | Quién | Qué hace |
|---|---|---|---|
| `/api/pos/terminals` | GET, POST | Cajero con sesión | Lista y crea terminales de la sucursal. |
| `/api/pos/terminals/[id]` | PATCH | Admin/manager | Nombre, código, activo. Los ajustes de la pantalla NO van aquí: viven en `organization_settings` (§6.1) y se guardan desde el cliente con RLS, como el resto de ajustes del POS. |
| `/api/pos/terminals/[id]/pairing-code` | POST | Cajero | Genera código de 6 dígitos, 5 min. Invalida el anterior. |
| `/api/pos/display/pair` | POST | Pantalla remota (sin sesión) | Canjea código → token largo (solo se devuelve una vez; se guarda su hash). Limitado por IP: 10 intentos/15 min. |
| `/api/pos/display/bootstrap` | GET | Pantalla remota (token) | Marca, `pos_customer_display` de la organización de la terminal, locale, moneda. Sin datos de ventas. |
| `/api/pos/display/heartbeat` | POST | Pantalla remota (token) | Actualiza `display_last_seen_at`. Cada 60 s. |
| `/api/pos/display/feedback` | POST | Pantalla remota (token) | Registra calificación (fase 4). |
| `/api/pos/display/revoke` | POST | Admin | Borra el hash: la tableta queda desemparejada. |

Estas rutas se añaden a la lista de exclusión del middleware igual que `/u/`
(fail-closed por token, no por sesión).

**Canal Realtime remoto:** `pos-display:<terminalId>`. La caja publica con su
sesión; la pantalla se une con el token canjeado por un JWT de Realtime de
corta vida que emite `/bootstrap`. Sin *Postgres Changes*: nada de esto
escribe en la base.

---

## 8. Protocolo de mensajes

Versionado desde el día uno (`v: 1`). La pantalla ignora versiones que no
conoce y muestra "Actualice la pantalla".

```ts
// src/lib/pos/display/protocol.ts

export type DownMessage =
  | { v: 1; t: 'hello';    seq: number; terminalId: string; cashier: { name: string } | null; sessionOpen: boolean }
  //   F2 (aditivo): `hello` lleva además `currency: string` (F0) y `settings?: DisplayPresentationSettings`
  //   (propina {enabled, presets, allowCustom}, rating {enabled}, showTaxBreakdown, showCustomerName,
  //   locale, touch). Opcional: un emisor sin ajustes (o con un getSettings que no devuelve un objeto)
  //   manda el hello sin el campo y la pantalla se queda en «solo resumen». Nunca viajan `enabled` ni `idle`.
  | { v: 1; t: 'state';    seq: number; terminalId: string; state: DisplayState }
  | { v: 1; t: 'heartbeat';seq: number; terminalId: string; at: number }
  | { v: 1; t: 'bye';      seq: number; terminalId: string };

export type UpMessage =
  | { v: 1; t: 'need_snapshot'; terminalId: string; capabilities: { touch: boolean; width: number; height: number } }
  | { v: 1; t: 'tip_selected';  terminalId: string; cartId: string; kind: 'percent' | 'amount' | 'none'; value: number }
  | { v: 1; t: 'qr_paid_claim'; terminalId: string; cartId: string }      // solo avisa; no confirma nada
  | { v: 1; t: 'rating';        terminalId: string; saleId: string | null; rating: 1 | 2 | 3 | 4 | 5 };

export interface DisplayState {
  mode: 'idle' | 'order' | 'payment' | 'tip' | 'thanks' | 'closed';
  cart: DisplayCart | null;
  payment: DisplayPayment | null;
  tip: { presets: number[]; allowCustom: boolean; selected: UpMessage & { t: 'tip_selected' } | null } | null;
  thanks: { total: number; askRating: boolean } | null;
}

/** Proyección del Cart: lo que la pantalla necesita, nada más. Sin `product` completo. */
export interface DisplayCart {
  id: string;
  currency: string;
  lines: Array<{
    id: string; name: string; qty: number; unitPrice: number; total: number;
    modifiers: Array<{ name: string; extraPrice: number }>;
    discount: number | null; note: string | null;
  }>;
  subtotal: number; discountTotal: number; discountLabel: string | null;
  taxTotal: number; taxIncluded: boolean; total: number;
  lastChangedLineId: string | null;   // para el resaltado de 600 ms
}

export type DisplayPayment =
  | { method: 'cash'; total: number; received: number | null; change: number | null }
  | { method: 'card'; total: number; provider: string | null }
  | { method: 'qr';   total: number; provider: string; qr: { kind: 'image' | 'text'; value: string } | null; expiresAt: number | null };
```

**Lo que la implementación de la Parte A cambió respecto al borrador de arriba**
(`src/lib/pos/display/protocol.ts` y `transport.ts` son la fuente de verdad;
esto es el resumen para quien construya B, C y D):

- **Sobre de bajada con `instanceId`.** Dos pestañas de `/app/pos` en el mismo
  navegador comparten `terminalId` pero cada una tiene su propio `instanceId`
  (generado una vez por `BroadcastChannelTransport`) y su propio `seq`. La
  pantalla sigue a **una** instancia: adopta la primera que le habla (o la del
  `hello`), descarta `seq` no crecientes de esa instancia, y **reinicia la marca
  de `seq` al cambiar de instancia** (adopción y liberación por `bye`).
- **Sobre de subida con `toInstanceId` opcional.** El receptor dirige sus
  intenciones a la instancia activa; sin instancia activa van a todas. El
  transporte solo entrega a su propia instancia las subidas dirigidas a ella o
  sin destinatario.
- **`publish()` recibe un `DownMessageDraft`**, no un `DownMessage`: el
  transporte es dueño del sobre (`v`, `seq`, `terminalId`, `instanceId`) y lo
  escribe él, con el spread invertido para que un draft nunca pise esos campos.
  Igual `send()` recibe `UpMessageDraft`.
- **La interfaz `DisplayTransport` expone `startHeartbeat()` / `stopHeartbeat()`**
  (idempotentes, `HEARTBEAT_INTERVAL_MS = 1000`). `DisplayReceiver` expone
  `send`, `onDown`, `close`, y los getters `activeInstanceId`, `lastSeq`,
  `lastReceivedAt`.
- **Nada lanza.** `publish`/`send` capturan `DataCloneError` y avisan por
  `console.warn`; el flujo de venta nunca depende de la pantalla.
- **`isDownMessage` / `isUpMessage`** validan forma y versión: `seq` entero ≥ 0,
  `instanceId`/`terminalId` string no vacío, `cart.lines` array,
  `payment.method` conocido, bloques de estado objeto o `null`. Cada bloque
  (`cart`, `payment`, `tip`, `thanks`) es **opcional** para la UI: si el bloque
  que el `mode` necesita viene `null`, la pantalla degrada al estado neutro.
- **Identidad local** en `terminal.ts`: `getOrCreateLocalTerminalId()` guarda un
  UUID en `localStorage` (`pos_terminal_id`). F2 lo formaliza en `pos_terminals`.
- `DisplayLine.total` es `qty × unitPrice` **bruto** (antes de descuento), sin
  redondeo por línea, para que las líneas sumen exactamente el `subtotal`. Los
  `modifiers[].extraPrice` son informativos: ya van dentro de `unitPrice`.
- **Totales: la fuente de verdad es el motor que ve el cajero.** En el POS
  conviven tres cálculos (`posService.calculateCartTotals`, `TaxSummary` con
  `calculateCartTaxes`, y `CheckoutDialog`), y el cajero mira `TaxSummary`, que
  honra `item.tax_excluded` (botón "Excluir impuesto") y el override de
  `organization_taxes`. Por eso `DisplayCart.subtotal` es siempre Σ de líneas
  brutas, y la Parte B pasa `{ discountTotal, taxTotal, total }` calculados con
  `calculateCartTaxes` como *override* a `projectCartForDisplay`. Sin override
  se usan los campos del `Cart`. Cada `DisplayLine` lleva `taxExcluded` y
  `taxIncluded`; `DisplayCart.taxIncluded` es "alguna línea incluida" y con
  carrito mixto la pantalla mira las líneas.
- **Variantes:** `DisplayLine.variant` trae los pares de `product.variant_data`
  (Talla: M, Color: Azul) para pintarlos como badges igual que `CartView`.
- **Presencia pantalla → caja:** la pantalla emite `display_alive` (cada 1 s,
  con `capabilities`) y `display_bye` al cerrar; el transporte de la caja
  expone `lastDisplaySeenAt` y de ahí sale el indicador verde/gris de §5.1.
  Limitación de F0: una pantalla por terminal (con dos, el `bye` de una deja
  el indicador en gris ≤ 1 s).
- **Adopción de instancia:** la pantalla sigue a una instancia. Ventana de
  elección de 500 ms tras `need_snapshot`: releva un `hello` solo si es
  estrictamente mejor (`sessionOpen` primero, luego `seq` mayor). Watchdog de
  3 s sin mensajes: suelta la instancia (`lastStaleAt`) para que el siguiente
  `need_snapshot` no vaya a una pestaña muerta; `releaseActiveInstance()` lo
  hace a demanda al entrar en *Conectando*.
- **Versión incompatible:** un sobre con `v ≠ 1` se descarta pero deja
  `incompatibleVersionAt`; la pantalla muestra "Actualice la pantalla" si es
  reciente y no llegan mensajes válidos.
- **`hello → state` es un contrato:** tras relevar a otra instancia se usa
  `announce(hello, state)` para que el receptor no descarte el primer `state`.

Reglas:
- `state` se emite **coalescido**: los cambios en una misma vuelta de eventos
  se agrupan (`requestAnimationFrame`), así teclear cantidad "12" no emite
  dos estados.
- `heartbeat` cada 1 s desde la caja. La pantalla entra en *Conectando* a los
  3 s sin latido.
- Al recibir `need_snapshot`, la caja responde `hello` + `state` completo.
- `DisplayCart` se construye en un único sitio (`projectCartForDisplay(cart)`)
  con test unitario: es el contrato que ve el cliente y no puede divergir del
  recibo.

---

## 9. Electron

Archivo nuevo: `electron/src/main/windows/displayWindow.ts`.

- **Colocación:** `screen.getAllDisplays()`; se elige el monitor que no es el
  primario (`display.id !== screen.getPrimaryDisplay().id`). Si hay más de
  uno secundario, el usuario elige una vez y se recuerda (`store`).
- **Ventana:** `fullscreen: true`, `frame: false`, `autoHideMenuBar: true`,
  `backgroundColor` del color de marca (evita el flash blanco al abrir),
  `webPreferences` idénticas a `mainWindow` (mismo `preload`, misma
  `partition` → misma sesión y `localStorage`).
- **Carga:** `${WEB_APP_URL}/pos-display` (mismo origen que la caja).
  Mismos `allowedHosts` que `mainWindow`.
- **Monitores que van y vienen:** `screen.on('display-removed')` cierra la
  ventana si su monitor desaparece (reutiliza la lógica de
  `isPositionVisible`); `screen.on('display-added')` la reabre si estaba
  activada. Nunca deja una ventana kiosco invisible que bloquee la caja.
- **Persistencia:** `store.posDisplay = { enabled, displayId }`. Al arrancar
  la app, si `enabled` y el monitor existe, abre sola.
- **IPC** (`ipc.ts` + `preload`):
  - `pos-display:open` / `pos-display:close` / `pos-display:status`
  - `pos-display:list-displays` (para elegir monitor en configuración)
- **Salida de emergencia:** `Ctrl+Shift+D` cierra la ventana del cliente desde
  cualquier ventana. Un kiosco sin salida es un ticket de soporte.
- **Sin lógica de negocio.** Electron abre y coloca. Todo lo demás es la web.

---

## 10. Web (navegador)

- **Abrir:** `window.open('/pos-display', 'pos-display', 'popup,width=1280,height=800')`.
  Con nombre fijo, pulsar de nuevo enfoca la existente en vez de duplicarla.
- **Colocar:** el navegador no puede mover una ventana a otro monitor sin
  permiso. Se muestra una vez: "Arrastre esta ventana a la pantalla del
  cliente y pulse F11". Se recuerda que ya se explicó.
- **Mejora progresiva:** si el navegador soporta la *Window Management API*
  (`window.getScreenDetails`, Chrome/Edge) y el usuario concede permiso, la
  ventana se abre directamente en el monitor secundario y en pantalla
  completa. Sin permiso, el flujo manual. Nunca se bloquea por esto.
- **Pantalla completa:** botón discreto en la esquina de `/pos-display` que
  pide `requestFullscreen()`; se oculta en Electron.
- **Cierre por `beforeunload` de la caja:** al cerrar la pestaña del POS, la
  pantalla recibe `bye` y pasa a *Conectando*; si no vuelve nadie en 60 s,
  pasa a *Reposo*.

---

## 11. Seguridad

- La pantalla **no puede alterar una venta**: solo envía intenciones que la
  caja confirma (§3.1).
- La pantalla remota nunca lee tablas: token → rutas de §7 → datos mínimos
  (marca y ajustes). Ni una línea de venta sale de la base hacia ella; le
  llega por Broadcast desde la caja.
- El token de emparejamiento se devuelve una vez, se guarda su **hash**, y se
  puede revocar. El código de 6 dígitos caduca en 5 minutos y está limitado
  por IP.
- `BroadcastChannel` es de mismo origen: otra web no puede escuchar. En
  Electron, `contextIsolation` sigue activo; el `preload` solo expone los 4
  canales.
- Nada de datos personales en la pantalla salvo el nombre del cajero (que ya
  va en el recibo). Si hay cliente asociado a la venta, se muestra solo su
  nombre, y solo si la organización lo activa.
- El repositorio es público: ningún nombre de organización cliente en
  fixtures, docs ni comentarios.

---

## 12. Fases

Cada fase se cierra con `npx jest`, `npx tsc --noEmit`, `npx next build`
verdes en lo que toca, y se anota en `PROGRESS.md` **añadiendo**.

### Fase 0 — Espejo local (web y Electron como ventana normal) · tamaño M

- `protocol.ts`, `projectCartForDisplay()` con tests, `BroadcastChannelTransport`.
- Emisión desde `posService` tras cada mutación del carrito (coalescida) y
  desde el modal de pago (estados efectivo/tarjeta/QR sin imagen aún).
- Ruta `/pos-display` con estados *Reposo*, *Pedido*, *Cobro·efectivo*,
  *Cobro·tarjeta*, *Gracias*, *Conectando*. Marca de la organización.
- Indicador y botón en el POS. En web abre emergente; en Electron, de
  momento, una ventana normal.
- Tarjeta "Pantalla del cliente" en Configuración › POS con solo el
  interruptor maestro y "Abrir ahora" (`pos_customer_display.enabled`). El
  resto de ajustes llega en fase 2.
- **Aceptación:** con dos ventanas en un portátil, teclear una venta se
  refleja en < 100 ms; cerrar la caja deja la pantalla en *Conectando* en
  ≤ 3 s; recargar la pantalla recupera la venta completa.

### Fase 1 — Electron en la segunda pantalla · tamaño S

- `displayWindow.ts`, IPC, persistencia, monitor que va y viene, atajo de
  salida. Selección de monitor en Configuración › POS.
- **Aceptación:** al arrancar la app con la pantalla activada, la ventana
  aparece sola en el monitor del cliente a pantalla completa; desconectar y
  reconectar el monitor no deja ventanas perdidas; la caja nunca pierde el
  foco por culpa de la pantalla.

### Fase 2 — Terminal, ajustes, propina y QR · tamaño M

- Migración `pos_terminals` (+ rollback), solo identidad. Alta de terminales
  en la tarjeta de §5.2. `terminalId` en `localStorage` de la caja.
- Tarjeta "Pantalla del cliente" en Configuración › POS con todos los
  ajustes de §5.2, persistidos en `organization_settings` /
  `pos_customer_display` (sin migración).
- Estado *Propina* con confirmación en caja (táctil: el cliente pulsa; no
  táctil: informativo); se registra por el flujo de `tips` existente.
- Estado *Cobro·QR* con imagen a pantalla completa y "Ya pagué".
- **Aceptación:** una organización activa propinas, el cliente elige 10 % en
  pantalla, el cajero confirma y la propina queda en `tips` con el `sale_id`
  correcto; un cobro Bre-B muestra el QR al cliente y se cierra al confirmar.

### Fase 3 — Pantalla en otro dispositivo · tamaño M

- `SupabaseBroadcastTransport`, código de emparejamiento, rutas
  `/api/pos/display/*`, revocación, heartbeat, exclusión en middleware.
- **Aceptación:** una tableta se empareja con un código de 6 dígitos en
  < 30 s, refleja la venta con < 300 ms de retraso, y al revocarla deja de
  recibir en el siguiente mensaje.

### Fase 4 — Calificación y reposo con promociones · tamaño S

- `pos_display_feedback` (+ rollback), calificación en *Gracias*, informe
  simple en Reportes › POS.
- Modo reposo con promociones activas del módulo de promociones o medios
  subidos por la organización.

---

## 13. Riesgos y decisiones abiertas

| Riesgo / decisión | Postura propuesta |
|---|---|
| El POS no tiene noción de terminal y hoy funciona sin ella. | Fase 0 funciona **sin** `pos_terminals` (un `terminalId` local generado). La tabla llega en fase 2 sin romper lo anterior. |
| ¿La propina se aplica antes o después de impuestos? | Como lo haga ya el flujo de `tips`. La pantalla no introduce una regla nueva. |
| Pantalla táctil vs. no táctil en el mismo modelo de hardware. | `capabilities.touch` en `need_snapshot`; la pantalla se adapta sola. Hay que **probar en el hardware real** en fase 0: es el único punto que no se puede validar en un portátil. |
| Rendimiento con ventas de 200+ líneas. | `DisplayCart` no lleva `product`; con 200 líneas son ~30 KB. Se muestran las últimas N y un contador. |
| ¿Mostrar el nombre del cliente? | Desactivado por defecto; opción por organización. Privacidad primero. |
| Segundo monitor con otra resolución/escala en Windows. | Diseño fluido con `clamp()` en tipografías y prueba en 1024×768, 1366×768 y 1920×1080. |
| Realtime de Supabase (fase 3) compite con la carga que ya causó incidentes. | Solo *Broadcast*, sin escrituras; un canal por terminal; se puede desactivar por organización. |

---

## 14. Fuera de alcance (a propósito)

- Cobro iniciado desde la pantalla del cliente (la caja cobra; la pantalla muestra).
- Firma digital o captura de datos del cliente en pantalla.
- Publicidad de terceros en modo reposo.
- Sincronización del carrito entre varias cajas (es otro problema, con otra
  arquitectura).
