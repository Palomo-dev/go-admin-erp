# Fase 3, parte A — decisiones: rutas de servidor, tokens y Realtime

Ronda 1 (2026-09-22), ronda 2 y ronda 3 (misma fecha, secciones finales). Complementa PLAN §3.3, §7 y §11; no los sustituye.

## Qué se investigó en el proyecto Supabase

- `realtime.messages` tiene RLS activa pero **ninguna política**: el proyecto
  no usa canales privados. Ningún `.sql` de `supabase/migrations/` toca
  `realtime.channel` ni `realtime.messages`; los únicos usos de Realtime en
  `src/lib` son Broadcast público (`activityService`, `useActivityRealtime`) y
  la publicación `supabase_realtime` de la tabla `notes`.
- `public.pos_terminal_secrets`: RLS activa, sin políticas y sin `GRANT` para
  `anon` ni `authenticated` (solo `postgres` y `service_role`). CHECK
  `pairing_code ~ '^[0-9]{6}$'`, índice parcial por `pairing_code`, FK con
  `ON DELETE CASCADE` a `pos_terminals` y `organizations`. No hay índice por
  `display_token_hash` (una fila por terminal: hoy es irrelevante).

## Decisión: cómo se une la pantalla remota al canal

`/api/pos/display/bootstrap` entrega un **JWT HS256 de corta vida** (~~1 h~~
→ **5 min desde la ronda 3**, renovado en cada `/heartbeat`; ver «Ronda 3 · 2»)
firmado con el secreto JWT del proyecto (`SUPABASE_JWT_SECRET`, nueva variable
en `.env.example`). La pantalla lo pasa a `supabase.realtime.setAuth(token)`
antes de `channel('pos-display:<terminalId>').subscribe()` (parte B).

- Claims: `role: 'anon'` (menor privilegio; **nunca** `authenticated`, que en
  PostgREST abriría las políticas `to authenticated`), `aud: 'pos-display'`,
  `sub: 'pos-display:<terminalId>'`, `pos_terminal_id`, ~~`organization_id`~~,
  `iat`, `exp`. **Corregido en la ronda 3 · 1**: `organization_id` era un
  claim de confianza en políticas `to public` y se retiró; el conjunto exacto
  de claves está fijado por `REALTIME_JWT_PAYLOAD_KEYS` y un test guardarraíl.
- ~~Con canales públicos el JWT no restringe más que la clave anon; la
  política de canales privados queda pendiente~~ → **corregido en la ronda
  2**: las políticas sobre `realtime.messages` ya están aplicadas (ver «Ronda
  2 · 1») y el canal privado es criterio de aceptación de la parte B, no un
  pendiente.
- Sin secreto, o con uno de relleno/corto (`readRealSecret`, mín. 32), la
  ruta responde **503 `REALTIME_NOT_CONFIGURED`**: nunca se degrada en
  silencio a un acceso sin firmar.
- Se firma a mano con `node:crypto` (cabecera + payload + HMAC-SHA256):
  `jose` solo llega al repositorio de forma transitiva.

## Token de la pantalla y código de emparejamiento

- Código: 6 dígitos de `randomInt`, 5 min, un solo código vigente por
  terminal (`upsert` por `terminal_id`); si coincide con otro vigente se
  regenera (hasta 5 veces) porque `/pair` solo recibe el código.
- Token: 32 bytes de `randomBytes` en base64url (43 caracteres). Se devuelve
  **una vez** al canjear; en la base solo su sha256 hex. Canje atómico: el
  `UPDATE` que guarda el hash exige `pairing_code = <código>` en el `WHERE`, y
  borra el código.
- Autenticación (`displayAuth.ts`): `Authorization: Bearer <token>` → forma
  válida → lookup por hash con service-role → recomparación en tiempo
  constante → terminal activa y organización coherente entre las dos tablas.
  Cualquier fallo → **401 uniforme** `DISPLAY_UNAUTHORIZED`; base caída → 503.
- Rate limit de `/pair`: 10 / 15 min por IP con la infraestructura del repo
  (`checkRateLimit` + `getRateLimitStore`); sin cabecera de IP el cubo
  compartido admite 5 (`unknownClientLimit`).

## Rutas y sesión

| Ruta | Auth | Organización |
|---|---|---|
| `POST /api/pos/terminals/[id]/pairing-code` | sesión, admin/manager (mismo gate que el PATCH) | de la sesión; `readOrgBody` → 403 ante ajena |
| `POST /api/pos/display/pair` | ninguna (rate limit) | de la fila de secretos |
| `GET /api/pos/display/bootstrap` | token | de la terminal |
| `POST /api/pos/display/heartbeat` | token | de la terminal |
| `POST /api/pos/display/revoke` | sesión, admin/manager | de la sesión; `readOrgBody` → 403 ante ajena |

`/api/pos/display/*` está excluido del middleware (`skipPatterns` y
`matcher`): fail-closed por token o, en `/revoke`, por `getServerOrgContext`
(401 JSON, no redirect). `/api/pos/terminals/**` sigue pasando por él.

## Cambio colateral

El esquema zod de `pos_customer_display` se movió a
`src/lib/pos/display/settingsSchema.ts` (módulo puro); `settings.ts` lo
re-exporta entero, así ningún consumidor cambió su import. Motivo:
`bootstrap` valida los ajustes en el servidor con el MISMO esquema que la
caja (regla 7) y `settings.ts` importa el cliente de navegador
(`@/lib/supabase/config`), que un route handler no debe arrastrar.

---

## Ronda 2 — correcciones del QA y del tester

### 1. Canal privado por terminal (alto): aplicado, y bloqueante para la parte B

Hallazgo: con canales públicos, cualquier portador de la clave anon (pública
en el bundle) que conozca el UUID de la terminal podía suscribirse y **emitir**
en `pos-display:<terminalId>` (totales o QR falsos). El JWT de `/bootstrap` era
decorativo.

Decisión y estado:

- **Migración `20260922130000_pos_display_realtime_privado.sql`, aplicada por
  MCP** (rollback en `supabase/rollbacks/`). Cuatro políticas sobre
  `realtime.messages`, todas con `extension = 'broadcast'`:

  | Política | Rol | Regla |
  |---|---|---|
  | `pos_display_pantalla_recibe` (SELECT) | anon, authenticated | `realtime.topic() = 'pos-display:' \|\| (auth.jwt() ->> 'pos_terminal_id')` |
  | `pos_display_pantalla_envia` (INSERT) | anon, authenticated | ídem (la pantalla emite `UpMessage`: `tip_selected`, `need_snapshot`, `display_alive`…) |
  | `pos_display_caja_recibe` (SELECT) | authenticated | `EXISTS (pos_terminals t WHERE t.id = <uuid extraído del topic>)`: la RLS de `pos_terminals` (miembro activo de la organización) decide |
  | `pos_display_caja_envia` (INSERT) | authenticated | ídem |

  La política de la pantalla no toca tablas, así que vale para `anon` sin
  ningún `GRANT`. La de la caja extrae el UUID del topic con una expresión
  regular estricta para que el cast nunca falle. Verificadas en
  `begin … rollback` simulando `realtime.topic` y `request.jwt.claims` como
  `anon` (con claim propio, sin claim, con claim de otra terminal) y como
  `authenticated` (miembro de la organización sí; ajeno no).
- Es **aditiva e inocua** hoy: las políticas solo se evalúan en canales
  suscritos con `config: { private: true }`; los canales públicos que ya usa
  la app (actividad) no cambian. Hasta hoy la tabla tenía RLS y cero
  políticas: ningún canal privado era accesible.
- **Criterio de aceptación de la parte B** (también en PLAN §11):
  `SupabaseBroadcastTransport` y el receptor remoto se suscriben con
  `private: true`; la pantalla llama `supabase.realtime.setAuth(<JWT de
  /bootstrap>)` antes de `subscribe()`; la caja usa su sesión. La parte B no
  puede cerrarse con canal público. Además, la caja solo consume eventos `up`
  y la pantalla solo `down` (el emisor ya lo hace por tipo de mensaje), así
  que aunque una pantalla emparejada emitiera un `down` falso solo se
  engañaría a sí misma.
- Firma HMAC por mensaje: descartada por ahora; la política de canal ya
  restringe quién emite, y añadir firma exigiría repartir un secreto a la caja
  (navegador).

**Verificación del JWT (pendiente de entorno, no de código).** Realtime
valida el token de conexión con el secreto JWT del proyecto (HS256) y exige
los claims `role` y `exp`; el nuestro los lleva (`role: anon`). Evidencia de
que este proyecto sigue en HS256 con secreto legado: la propia clave anon de
`.env.local` es un JWT `{"alg":"HS256"}` sin `kid` con claims
`iss/ref/role/iat/exp`, y con ella Realtime ya funciona en la app. Lo que
**no** se pudo hacer: una conexión real con un JWT firmado por `/bootstrap`,
porque `SUPABASE_JWT_SECRET` no está en ningún `.env` local ni en Vercel (el
QA lo confirmó). Hasta que se provisione (Dashboard → Project Settings → API
→ JWT Settings → JWT Secret), `/bootstrap` responde **503
`REALTIME_NOT_CONFIGURED`** (fail-closed, nunca un 200 con un token que
Realtime rechazaría). Procedimiento de verificación para la parte B, con el
secreto en el entorno:

```
1. POST /api/pos/terminals/<id>/pairing-code (sesión admin) → code
2. POST /api/pos/display/pair {code}            → token
3. GET  /api/pos/display/bootstrap (Bearer token) → realtime.token
4. createClient(URL, ANON_KEY).realtime.setAuth(realtime.token);
   channel('pos-display:<id>', { config: { private: true } }).subscribe(cb)
   → cb('SUBSCRIBED'). Con la clave anon sin setAuth, o con el JWT de otra
   terminal → cb('CHANNEL_ERROR') / 'Unauthorized'.
```

### 2. tsc (medio): corregido

El helper `bearer` de `f3a-display-routes.test.ts` devuelve ahora
`Record<string, string>`. `NODE_OPTIONS=--max-old-space-size=8192 npx tsc
--noEmit -p tsconfig.json | grep 'error TS'` no imprime nada (ver «Cierre»).

### 3. Rate limit de fallos en `/bootstrap` y `/heartbeat` (bajo): aplicado

`displayAuth.ts` registra cada **401** en el cubo `pos-display:auth:ip:<ip>`
(60 por minuto; sin cabecera de IP, cubo `unknown` de 10) y, **antes** de
tocar la base, comprueba si el cubo está agotado (`isRateLimitExhausted`,
nuevo en `rateLimit.ts`, solo memoria, no registra) → 429 `RATE_LIMITED` con
`Retry-After` sin consulta. Los aciertos no consumen cupo: N tabletas
legítimas tras el mismo NAT no se bloquean entre sí. El registro del fallo sí
pasa por el store persistente (`RATE_LIMIT_STORE=db`) cuando está activo. Y
la migración añade el índice parcial `pos_terminal_secrets_display_token_hash_idx`.

### 4. Matcher del middleware (bajo): `api/pos/display/` con barra

Igual que el `skipPattern`. Una futura `/api/pos/displays-x` o
`/api/pos/display-x` pasa por el middleware; el tester r1 lo prueba con el
matcher real convertido a regex.

### 5. Quién genera el código (bajo): admin/manager, documentado

PLAN §7 dice «Cajero»; la implementación exige admin/manager (el mismo gate
que el PATCH de la terminal). Se mantiene así, a propósito:

- Emparejar una tableta es **configurar la terminal**, no operarla. El token
  vive en la tableta y no caduca; re-emparejar solo ocurre al cambiar de
  tableta, tras revocar o tras borrar los datos del navegador. No es una
  tarea de apertura de caja.
- El código de 6 dígitos vale 5 minutos y da acceso al carrito en vivo de
  esa terminal (y a emitir intenciones hacia la caja). Quien lo genera decide
  qué dispositivo ve la venta; eso es lo mismo que decide quién edita la
  terminal.
- `/revoke` queda como admin/manager en cualquier caso.

Si producto prefiere que lo haga el cajero, el cambio es local: sustituir
el gate de `pairing-code/route.ts` por «miembro activo con acceso a la
sucursal de la terminal» (la RLS de `pos_terminals` ya limita la lectura a
miembros activos de la organización) y actualizar `f3a-pairing-code-route.test.ts`.

### 6. Oráculo de tiempo en `/pair` (bajo): una sola consulta

El lookup es ahora **una** consulta con la terminal embebida
(`pos_terminals!inner(id, organization_id, is_active)` filtrada por
`pos_terminals.is_active = true`, sintaxis verificada contra la API real): un
código inexistente, vencido, ya canjeado o de una terminal inactiva cuestan
lo mismo. La coherencia de organización entre las dos filas se comprueba en
memoria sobre esa misma respuesta. El `UPDATE` del canje repite
`pairing_code = <código>` **y** `pairing_code_expires_at > now()` en el
`WHERE`: sin ventana entre el SELECT y el UPDATE. Se descartó la RPC
`SECURITY DEFINER`: no aporta nada que el embed + el UPDATE condicionado no
den, y evita otra función elevada.

### 7. `updated_at` y el latido (bajo): trigger condicionado

La misma migración recrea `pos_terminals_set_updated_at` con
`WHEN (old.display_last_seen_at IS NOT DISTINCT FROM new.display_last_seen_at)`:
el latido de la pantalla ya no cuenta como edición. Limitación documentada en
el `.sql`: un UPDATE que cambie a la vez el latido y otra columna no bumpea
`updated_at`; hoy el único escritor del latido es `/heartbeat` y solo escribe
esa columna.

---

## Ronda 3 — correcciones del QA y del tester

### 1. El JWT de la pantalla era una credencial de PostgREST (crítico): corregido

Hallazgo del QA: el JWT de `/bootstrap` va firmado con el **mismo** secreto
que valida PostgREST, con `role: anon` y el claim `organization_id`. En este
proyecto hay políticas `to public` (que incluye a `anon`) cuyo qual es
`organization_id = (auth.jwt() ->> 'organization_id')::integer` —`carts`
(ALL) y `organization_images` (las cuatro operaciones), además de
`organization_taxes`— y funciones SECURITY DEFINER que leen ese claim
(`current_org_id`, `deactivate_product`, `create_product_with_images`,
`register_shared_image`, `associate_image_to_product`). Con la clave anon el
claim es NULL y esas políticas no dan nada; con el JWT de la pantalla daban
lectura y escritura de esas tablas para la organización entera a quien
tuviera la tableta, un token robado o un código adivinado. `carts` guarda
`cart_data`: justo los datos de ventas que PLAN §7 prohíbe a la pantalla. La
decisión de la ronda 1 miró el rol y no los claims.

Lo hecho:

- `organization_id` **fuera del payload**. Las políticas
  `pos_display_pantalla_*` solo usan `pos_terminal_id`; la organización no
  hace falta en el canal. `RealtimeJwtClaims` ya no admite `organizationId`.
- **Regla explícita** en `displayTokens.ts` (`REALTIME_JWT_PAYLOAD_KEYS`,
  `REALTIME_JWT_FORBIDDEN_CLAIMS`): el JWT de la pantalla NUNCA lleva un
  claim que una política RLS `to public/anon` o una función SECURITY DEFINER
  trate como confianza (`organization_id`, `org_id`, `app_role`, `email`, ni
  un `sub` con forma de uuid). Si la parte B necesitara la organización, será
  un claim con prefijo propio (`pos_display_org`) que ninguna política lea.
  **Cualquier claim nuevo pasa antes por un grep de `pg_policies` y
  `pg_proc`.** Inventario hecho por MCP en esta ronda (claims que alguna
  política o función lee con `auth.jwt() ->> …`): `organization_id` (11
  políticas + 6 funciones), `app_role` (6 políticas: countries,
  country_payment_methods), `email` (2: invitations), `org_id` (2:
  product_note_files, products_audit_log), `pos_terminal_id` (solo las 2 de
  la pantalla). `sub` lo lee `auth.uid()` en cientos de políticas: por eso
  `sub` es `pos-display:<uuid>`, que no castea a uuid.
- **Guardarraíl**: `f3a-display-auth.test.ts › GUARDARRAÍL` fija el conjunto
  EXACTO de claves del payload (`role, aud, sub, pos_terminal_id, iat, exp`),
  comprueba que ningún claim prohibido aparece y que ni pasando argumentos de
  más se cuelan; `f3a-display-routes.test.ts` lo repite sobre la respuesta
  real de `/bootstrap` y de `/heartbeat`.
- Verificación en vivo (GET `/rest/v1/carts` con el JWT → 401/vacío): sigue
  **pendiente de entorno**, `SUPABASE_JWT_SECRET` no está provisionado (ver
  «Ronda 2 · 1»). Con el payload actual no hay claim que ninguna política
  lea, así que el resultado esperado es el mismo que con la clave anon.

### 2. Revocar no cortaba el canal en 1 h (alto): TTL 5 min + renovación en el latido

Las políticas de `realtime.messages` solo se evalúan al unirse al canal o al
renovar el token, y el servidor no puede retirar un JWT ya emitido: una
tableta revocada o robada seguía recibiendo el carrito hasta `exp`.

- `REALTIME_JWT_TTL_SECONDS = 300`. `/heartbeat` (que ya autentica por token
  cada 60 s) devuelve ahora `realtime: { channel, token, expiresAt }` con un
  JWT nuevo en cada latido; el helper compartido es
  `src/lib/pos/display/server/displayRealtime.ts`
  (`issueDisplayRealtimeCredential`), el mismo que usa `/bootstrap`. Sin
  secreto JWT, `/heartbeat` responde 503 `REALTIME_NOT_CONFIGURED` como
  `/bootstrap` y no registra el latido (una pantalla sin canal no está viva).
- Tras `/revoke`, el latido da 401, no hay JWT nuevo y el canal muere en
  **<= 5 min** sin ninguna pieza nueva. Esa es la **ventana residual**, y es
  la única: acotada por el TTL, no por la vida del token largo.
- **Criterio de la parte B** (a incorporar también en PLAN §11, ver
  «Pendiente PLAN §11»): el receptor remoto llama `supabase.realtime.setAuth`
  con CADA token que llega (bootstrap y cada latido) y **sale del canal** en
  cuanto `/heartbeat` o `/bootstrap` responden 401; la caja, al revocar, no
  necesita hacer nada más.
- Test del tester convertido: `tester-f3a-r2 › CORREGIDO (ronda 3): revocar…`
  afirma ahora que `exp` está a <= 5 min y que el latido renovaba.

### 3. Fuerza bruta del código en `/pair` (medio): cubo global de respaldo

El espacio del código es global (`/pair` no recibe terminal) y el cubo por IP
toma la PRIMERA entrada de `x-forwarded-for`: en un despliegue cuyo proxy no
sobreescriba la cabecera, rotarla abría un cubo por valor.

- `PAIR_GLOBAL_RATE_LIMIT = 120/min`, clave `pos-display:pair:global`,
  evaluada con `checkRateLimits` junto al cubo de IP (todo cabe o nada se
  registra: un bloqueo por IP no consume el global). Peor caso: de
  «ilimitado» a ~600 intentos por código vigente (0,06 % del espacio en 5
  min). Pasa por el store persistente cuando `RATE_LIMIT_STORE=db` está
  activo; en memoria es por instancia.
- **Dependencia documentada**: todos los cubos por IP del repo (`rateLimit.ts`,
  patrón preexistente) suponen que el proxy sobreescribe `x-forwarded-for`.
  Vercel lo hace. En cualquier otro despliegue hay que verificarlo antes de
  exponer `/api/pos/display/pair`; el cubo global es el respaldo mientras
  tanto.
- Tests: `f3a-display-routes › cubo GLOBAL de respaldo` (121.º con IP nueva y
  código bueno → 429 sin tocar la base) y `los dos cubos se evalúan juntos`.

### 4. Cubo de fallos de `displayAuth` bloquea un token válido desde la misma IP (bajo): decisión documentada + límite 300

El corte por IP va ANTES de mirar el token; con el cubo agotado por un vecino
hostil en la wifi de la tienda, la tableta legítima también recibe 429
durante esa ventana de 60 s (y no renovaría su JWT en ese minuto).

- **Decisión: se acepta.** El riesgo queda acotado a la LAN de la tienda, a
  60 s por ráfaga y a un latido perdido; el JWT vive 5 min, así que una
  ráfaga de un minuto no deja caer el canal. La alternativa (mirar el token
  antes del cubo) devolvería el SELECT a cada petición basura, que es lo que
  el cubo evita.
- El límite sube de 60 a **300/min** (el objetivo es el coste del SELECT por
  hash, no la fuerza bruta: 256 bits); el cubo `unknown` sigue en 10. El
  comentario del módulo ya dice exactamente qué protege y qué no («N tabletas
  legítimas tras el mismo NAT no se bloquean entre sí, pero SÍ las bloquea un
  tercero hostil en esa red»).

### 5. Latido sin tope de escrituras (bajo): condición en el WHERE

`/heartbeat` solo escribe si `display_last_seen_at` es nulo o más viejo que
`HEARTBEAT_WRITE_INTERVAL_MS` (30 s), con la condición en el WHERE del
UPDATE (`.or('display_last_seen_at.is.null,display_last_seen_at.lt.<hace 30 s>')`):
sin lectura extra y sin un 429 que dejaría a una pantalla legítima sin
renovar el JWT. 500 latidos = 500 × 200 y **una** escritura efectiva
(`tester-f3a-r2 › CORREGIDO (ronda 3): 500 latidos…`). Una tableta
comprometida puede seguir pidiendo JWT (HMAC, barato) y UPDATEs de 0 filas;
el volumen de peticiones lo acota el mismo límite que cualquier ruta.

### 6. Política de la caja: `is_active` y mayúsculas (bajo): migración aplicada

`20260922180000_pos_display_caja_solo_terminal_activa.sql` (aplicada por MCP;
rollback en `supabase/rollbacks/`) recrea `pos_display_caja_recibe/envia`
con `t.is_active` y la expresión regular `[0-9a-fA-F]`. Verificado: basura,
sufijo o vacío → `substring` NULL → cast NULL → EXISTS false (nunca 22P02);
un UUID en mayúsculas castea al mismo uuid.

- **`displayChannelName` NO se cambia.** El contrato de Fase 0 (`terminal.ts`
  y `terminal.test.ts › reutiliza un id existente válido, incluso en
  mayúsculas, tal cual (no normaliza)`) es deliberado para el canal LOCAL
  (`BroadcastChannel`), donde caja y pantalla comparten el id de
  localStorage. Para el canal REMOTO el id sale siempre de `pos_terminals.id`
  (uuid de Postgres, minúsculas); el servidor normaliza además a minúsculas
  el claim `pos_terminal_id`, `sub` y el `realtime.channel` que devuelve.
  **Criterio de la parte B**: la caja construye el canal remoto con el id de
  `pos_terminals` tal como lo devuelve la base (o el `realtime.channel` del
  bootstrap en la pantalla), nunca con un id de localStorage.
- `sub` no es uuid a propósito: cualquier política con `auth.uid()` falla
  con 22P02 ante este JWT en vez de evaluar a true; es inocuo (Realtime solo
  evalúa las políticas de `realtime.messages`, que no usan `auth.uid()`) y
  preferible a un `sub` que un `auth.uid() = user_id` pudiera casar.

### 7. `npx next build`

Ver «Cierre (ronda 3)».

### Pendiente PLAN §11 (el builder no edita PLAN.md en esta ronda, por regla)

Texto propuesto para añadir a PLAN §11 como viñetas nuevas:

- *El JWT de la pantalla remota (`/bootstrap`, `/heartbeat`) lleva
  EXACTAMENTE `role, aud, sub, pos_terminal_id, iat, exp`. Nunca un claim
  que una política RLS `to public/anon` o una función SECURITY DEFINER lea
  como confianza (`organization_id`, `org_id`, `app_role`, `email`, `sub`
  con forma de uuid): va firmado con el secreto del proyecto y PostgREST lo
  aceptaría. Cualquier claim nuevo pasa antes por grep de `pg_policies` y
  `pg_proc`; el test guardarraíl fija el conjunto.*
- *Ventana residual tras revocar: el JWT de Realtime vive 5 min y solo lo
  renueva `/heartbeat`; tras `/revoke` el latido da 401 y el canal muere en
  <= 5 min. El receptor hace `realtime.setAuth` con cada token nuevo y sale
  del canal ante un 401 (criterio de la parte B).*
- *Los límites por IP dependen de que el proxy sobreescriba
  `x-forwarded-for` (Vercel sí; otros, verificar). `/pair` tiene además un
  cubo global de 120/min.*

### Cierre (ronda 3)

- `npx eslint` sobre `src/lib/pos/display/server`, `src/app/api/pos/display`,
  `src/app/api/pos/terminals/[id]/pairing-code` y los tests `f3a-*` /
  `tester-f3a-*`: sin avisos.
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json |
  grep -E 'pos/display|api/pos|pos-display'`: nada (y 0 `error TS` en total
  en esta ejecución).
- `npx jest src/__tests__/pos-display`: 89 suites, 2353 tests, todo en verde.
  `src/__tests__/guardrails.test.ts`: 91/91.
- **`NODE_OPTIONS=--max-old-space-size=8192 npx next build`: exit 0**,
  «Compiled successfully in 4.1min»; en el listado de rutas aparecen
  `ƒ /api/pos/display/bootstrap|heartbeat|pair|revoke` y
  `ƒ /api/pos/terminals/[id]/pairing-code`, y el middleware compila (37,5 kB).
