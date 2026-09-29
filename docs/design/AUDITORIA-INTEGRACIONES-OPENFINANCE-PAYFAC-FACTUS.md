# Auditoría de integraciones: Open Finance, PayFac y Factus

- **Fecha:** 2026-09-23
- **Alcance:** solo lectura. Código en `main` (HEAD `157426c1`), BD de producción (`jgmgphmzusbluqhuqihj`, solo `SELECT`: conteos y estados), variables de entorno por nombre (sin valores) y documentación oficial de cada proveedor.
- **No se llamó a ninguna API de proveedor**, ni siquiera en sandbox.
- **Pregunta del dueño:** «¿Está completa, en este momento, la integración con Open Finance y con PayFac? ¿Y Factus consume toda la documentación y las APIs, está bien conectado y funciona todo bien?»
- **Premisa de negocio:** las tres son servicios que GO Admin presta con credenciales de la **plataforma**. El cliente no integra nada: solo activa y consume.
- **Aviso:** otra sesión está arreglando ahora la cola de facturación electrónica de Factus. Lo que aquí se dice de la cola describe el estado de `main` y de la BD a esta fecha.

## Veredicto en una línea

| Integración | ¿Completa? | ¿Funciona hoy? | Riesgo de seguridad abierto |
|---|---|---|---|
| **Open Finance (Prometeo)** | No: un 25-30 % de la superficie, y mal cableada | **No.** Cero cuentas, cero movimientos, cero enlaces en BD. El cliente HTTP no calza con la API de Prometeo. | **Crítico.** 27 de 36 rutas sin organización de sesión (IDOR con service role). `POST /transfer` inicia pagos con la llave de la plataforma para cualquier usuario. El webhook está abierto (falta un `await`). |
| **PayFac (Modelo B)** | No: es un cascarón | **No.** Las dispersiones se **simulan**. Las credenciales maestras no las lee nadie. La UI no puede crear nada (400). Cero payouts, cuentas y tarifas en BD. | **Crítico.** Cualquier usuario con sesión crea payouts de cualquier organización, lee o registra cuentas bancarias de otra, y lee payouts ajenos. La verificación de admin de plataforma **nunca pasa** (RLS sin políticas). |
| **Factus** | No: unas 14 de ~45 operaciones documentadas tienen código, y ninguna cierra el ciclo | **No.** 0 de 3.525 facturas con CUFE. El resultado de Factus no se puede guardar (CHECK de `invoice_sales.status`). La nota crédito y el documento soporte fallan antes de llegar a Factus. La cola no tiene cron (8 jobs `pending` sin payload desde agosto). **Y con credenciales de plataforma se emitiría a nombre del NIT de GO Admin, no del cliente.** | **Crítico.** `GET`/`DELETE /api/factus/support-document?ref=` sin autenticación contra la cuenta de la plataforma. `jobs` y `support-document` POST toman la organización del cliente. Lo de hoy (07cb7c0e) sí quedó bien. |

---

## 1. Open Finance

### 1.1 Proveedor real

- **Prometeo** es el único con código: Banking API, llave `X-API-Key`.
  - Sandbox: `banking.sandbox.prometeoapi.com`. Producción: `banking.prometeoapi.net`.
  - Configuración en `src/lib/services/integrations/openFinance/openFinanceConfig.ts:38-44`.
- **Belvo** solo aparece como configuración (`openFinanceConfig.ts:45-53`): no hay ninguna llamada.

Documentación oficial:

- Prometeo: <https://docs.prometeoapi.com/> (la referencia está tras contraseña; la guía pública está en <https://docs.prometeoapi.com/docs/3-acceso-a-los-datos>).
- Perfil de la superficie pública: <https://github.com/api-evangelist/prometeo>.
- Belvo: <https://developers.belvo.com/>.

Productos de Prometeo y sus hosts:

| Producto | Host de producción | Qué hace |
|---|---|---|
| Banking API | `banking.prometeoapi.net` | Sesión por usuario bancario (`/login/` → `key`, MFA con `/login-procedure/`), cuentas, movimientos, tarjetas, transferencias en dos pasos |
| Account Validation | `account-validation.prometeoapi.net` | Validar titularidad de cuentas |
| Payment | `payment.prometeoapi.net` | Iniciación de pagos |
| Cross-Border | `crossborder.secure.prometeoapi.net` | Pay-in, payout, FX |

### 1.2 Matriz de cobertura

Leyenda: **UI** = implementado y usado desde la UI · **sin uso** = implementado sin consumidor · **roto** = parcial o roto · **no** = no implementado.

| Capacidad (API de Prometeo) | Estado | Evidencia y motivo |
|---|---|---|
| Login bancario (`POST /login/`) | **roto**, sin UI | `openFinanceService.ts:109-133`. Envía JSON y lee `data.session_key`, pero Prometeo responde `key`: la sesión **nunca se guarda**. No maneja `interaction_required` (OTP) ni `select_client`. La ruta `links/[id]/login` no tiene pantalla. |
| Logout | **no** | — |
| Selección de cliente (`/client/`) | **no** | — |
| Listado de cuentas (`/account/`) | **roto** | `openFinanceService.ts:181`. Envía la sesión en el header `X-Session-Key` cuando Prometeo la espera por query `?key=`. Descarta el `balance`. Se traga los 401 (`:188`, `:215`). |
| Saldos | **roto** | `openFinanceService.ts:241` llama `GET /balance/`, **que no existe** en la Banking API: el saldo viene en `/account/`. Además `balanceService.ts:173` pasa los argumentos corridos y marca `last_balance_at = now()` aunque el proveedor falle (`:185-192`). |
| Movimientos (`/account/{n}/movement/`) | **roto** | `openFinanceService.ts:285` usa `/movement/?account_id=&date_from=` con fechas `YYYY-MM-DD`. Prometeo espera `date_start=dd/mm/yyyy` y responde `debit`/`credit`/`detail`, no `amount`. |
| Sincronización a `bank_transactions` | **roto** (3 bugs) | (1) `transactionSyncService.ts:150` llama a `saveTransactions` con los argumentos corridos: siempre sale «Link no encontrado». (2) `openFinanceService.ts:438` inserta `is_imported: true` y la importación solo toma `false` (`transactionSyncService.ts:163`). (3) Escribe `transaction_type` 'credit'/'debit', que el CHECK de `bank_transactions` rechaza (`:295`, `:307`). |
| Tarjetas de crédito | **no** | — |
| Transferencias (`/transfer/preprocess` + `/transfer/confirm`) | **no**; hay un sustituto inventado | `openFinanceService.ts:341` hace `POST /payout/` en el host *banking*, sin cuenta origen ni sesión. Ese endpoint no es de la Banking API. |
| Cuentas destino (`/transfer/destinations`) | **no** | — |
| Validación de cuentas | **roto** | `openFinanceService.ts:315` llama `POST {banking}/validate_account/`: host y ruta equivocados, es otro producto. Se usa en `/app/finanzas/cuentas-por-pagar`. |
| Proveedores / bancos (`/provider/`) | **no** | Seis bancos quemados en el código (`openFinanceService.ts:25-32`), sin verificar contra el catálogo. |
| Identidad (`/info/`) | **no** | — |
| Webhooks | **roto** y abierto | Ver §1.4. El procesamiento es un `TODO` sin efecto (`openFinanceService.ts:704-712`). |
| Consentimientos | Solo registros en BD, con **UI** | `/app/finanzas/open-finance/consents`. Nada exige un consentimiento vigente antes de leer o pagar (`verifyConsent` no tiene llamadores). Renovar no toca al proveedor. |
| Renovación de sesión | **no** | La sesión de Prometeo es corta y no se guardan credenciales: los crons de sincronización **no pueden funcionar con este diseño**. |
| Pago a proveedores | **roto y peligroso**, con **UI** | `CuentasPorPagarPage.tsx:472` hace `Number(uuid)`, que da `NaN` y la ruta responde 400 antes de llegar al proveedor. Si pasara: sin idempotencia, marca la cuenta por pagar `paid` con la transferencia `pending` (`paymentInitiationService.ts:400-410`) y escribe `accounts_payable` a mano, fuera de una RPC. |
| Pagos programados | **roto** | `cronJobs.ts:275` hace `Number(uuid)` y `created_by: 'system-cron'` no es un uuid (`:293`). `schedulePayment` no tiene llamadores. |
| Sandbox o producción | **roto** | `openFinanceConfig.ts:64`: `environment \|\| NODE_ENV === 'production' ? 'production' : 'sandbox'`. Por precedencia de operadores, pasar `'sandbox'` da producción, y en Vercel (también en preview) siempre es producción. |
| Tesorería, anomalías y *matching* | Cálculo local, con **UI** | `/app/finanzas/bancos/tesoreria`, `/anomalias` y `/conciliacion-bancaria/[id]`. Dependen de datos que la sincronización nunca trae. `markAnomalyResolved` no guarda nada (`anomalyDetectionService.ts:630-646`). El «matching con IA» es un puntaje heurístico. |
| Belvo | **no** | Solo configuración. |

### 1.3 Conexión real

| Aspecto | Estado |
|---|---|
| Variables que necesita | `PROMETEO_API_KEY`, `PROMETEO_WEBHOOK_VERIFY_TOKEN`, `PROMETEO_SANDBOX_URL`/`PROMETEO_PRODUCTION_URL` (opcionales), `OPEN_FINANCE_CRON_SECRET`, `BELVO_*` (futuro). **Ninguna está en `.env.example`**. |
| Variables definidas | Ninguna `PROMETEO_*` ni `OPEN_FINANCE_*` en `.env.local`. En Vercel, la herramienta devolvió 37 de 57 nombres; entre esos 37 no está ninguna. Los otros 20 llegaron truncados y no pude verificarlos. |
| Activación del cliente | **No existe.** Prometeo no está en `integration_providers` (27 proveedores, ninguno de open finance) ni en `organization_modules`. No hay pantalla para conectar un banco. |
| Crons | Hay cinco en `vercel.json:24-43`, y **ninguno se ha ejecutado nunca**. Fallan por tres motivos acumulados: (1) `/api/integrations/open-finance/**` no está excluido del middleware, y los logs de producción de los últimos 3 días muestran 28 invocaciones de cron, **todas con 307** (redirección a login); (2) las rutas solo exportan `POST`, y Vercel llama con `GET`; (3) comparan contra `OPEN_FINANCE_CRON_SECRET`, mientras Vercel envía `CRON_SECRET`. No hay pg_cron para Open Finance. |
| Webhook del proveedor | Por la misma razón, una llamada de Prometeo sin cookie recibe 307: **el webhook no puede recibir nada** del proveedor. |
| Reintentos, rate limit, idempotencia | Ninguno en todo el módulo. |
| Estado en BD (hoy) | `open_finance_links` 0 · `open_finance_consents` 0 · `open_finance_accounts` 0 · `open_finance_transactions` 0. **Nunca se ha usado.** |

### 1.4 Seguridad multi-tenant

Patrón común a todas las rutas:

- `createRouteHandlerClient` + `auth.getSession()`: lee la cookie sin validar el JWT contra Auth.
- **Ninguna** ruta usa `getServerOrgContext`/`withOrg`, y ninguna valida permisos `finance.*`.
- Los servicios trabajan con `getSupabaseAdmin()` (service role), así que la RLS no protege.

La RLS de las tablas `open_finance_*` sí está bien: pertenencia más `check_user_permission(..., 'finance.*')`. Pero las rutas no pasan por ella.

| Hallazgo | Severidad | Evidencia |
|---|---|---|
| `POST /transfer` inicia un pago con la **llave de la plataforma** para cualquier usuario autenticado, sin organización, registro ni idempotencia | **Crítica** | `src/app/api/integrations/open-finance/transfer/route.ts` (todo el handler) |
| `POST /pay-supplier`: ids en el body, sin organización: IDOR sobre dinero | **Crítica** | `pay-supplier/route.ts` |
| El webhook llama `verifyWebhookSignature` (async) **sin `await`**: la promesa siempre es verdadera y la verificación nunca rechaza. Además registra el body crudo en logs (`:28`). Hoy solo lo alcanza quien tiene sesión (el middleware redirige al resto), y el procesamiento es un TODO; en cuanto se excluya del middleware para que Prometeo llegue, queda abierto a internet | **Alta** (latente) | `webhook/route.ts:38`; `openFinanceService.ts:697-700` |
| `GET /links` devuelve `select *` de otra organización, **`session_key` incluida** (texto plano) | **Alta** | `links/route.ts`; columna `open_finance_links.session_key text` |
| `POST /sync` sin `linkId` ni `organizationId` sincroniza **todos los tenants** | **Alta** | `sync/route.ts:52` |
| `GET /health` expone conteos globales de todos los tenants y qué variables están definidas | Media | `health/route.ts:22-25` |
| `validate-account` sirve de oráculo de titulares (datos personales) y consume la cuota de la plataforma sin límite | Media | `validate-account/route.ts` |
| IDOR de lectura o escritura en `accounts`, `balances`, `movements`, `consents/[id]` (revocar uno ajeno revoca también su link), `consents/[id]/renew`, `payment-history`, `real-balance`, `refresh-balances`, `sync-status`, `treasury/*`, `anomalies/*`, `validate-balance` y `validate-supplier` | **Alta** | Tabla por ruta en el anexo A |
| El guardarraíl solo detecta la organización cuando viene en el body. Las rutas que la leen de la query pasan sin alarma, y cuatro están en la allow-list legacy | Media | `src/__tests__/guardrails.test.ts:285-288` |

**Corregido hoy:** nada de Open Finance. El commit `784d5e74` solo tocó fechas y zona horaria.

### 1.5 Qué falta para que un cliente la use de punta a punta

| # | Tarea | Prioridad | Tamaño |
|---|---|---|---|
| 1 | Cerrar o desactivar `transfer` y `pay-supplier` hasta definir el producto de pagos | **Bloqueante** (seguridad) | S |
| 2 | Pasar las 36 rutas a `withOrg`/`getServerOrgContext` con permisos `finance.*`, y usar el service role solo con la organización ya validada. Añadir el `await` y la verificación del webhook. Quitar `session_key` de toda lectura | **Bloqueante** | M |
| 3 | Decisión de producto y legal: con credenciales de plataforma, ¿cómo se mantiene la sesión bancaria del cliente? Opción A: cifrar las credenciales (Vault/pgsodium) y volver a hacer login en el cron. Opción B: sincronizar solo con el usuario presente. Opción C: un proveedor con consentimiento y token de larga vida (esquema de Finanzas Abiertas de la SFC, o Belvo con *links* recurrentes) | **Bloqueante** | decisión |
| 4 | Reescribir el cliente HTTP contra la API real de Prometeo: form-urlencoded, `key` por query, rutas de cuentas y movimientos, formato de fecha, mapeo `debit`/`credit`, MFA y `select_client`, catálogo `/provider/` | **Bloqueante** | L |
| 5 | Arreglar la cadena de sincronización (tres bugs) y el vínculo `open_finance_accounts.bank_account_id` | **Bloqueante** | M |
| 6 | Crons y webhook: excluirlos del middleware (el webhook con verificación *fail-closed*), exportar `GET` y aceptar `CRON_SECRET` | **Bloqueante** | S |
| 7 | Arreglar el ambiente (`openFinanceConfig.ts:64`) y añadir las variables a `.env.example` | Importante | S |
| 8 | UI de activación: alta en `integration_providers`/módulo, pantalla para conectar un banco con OTP y consentimiento explícito | Importante | M |
| 9 | Pagos (preprocess/confirm con OTP del cliente, desde **su** cuenta) mediante una RPC transaccional para `payments` + `accounts_payable` + idempotencia | Importante | L |
| 10 | Tests de rutas, del cliente HTTP (fixtures de Prometeo), del webhook y de la configuración | Mejora | M |

---

## 2. PayFac (Modelo B: GO Admin como agregador)

### 2.1 Proveedor real

**No hay ninguno operando.** `masterCredentialsService.ts:50-55` declara la intención de usar como cuenta maestra:

- Wompi (<https://docs.wompi.co/>)
- Bancolombia (<https://developer.bancolombia.com/>)
- Bre-B vía Mono (<https://docs.mono.la/docs/guides>; dispersiones en lote de hasta 1.000, en <https://www.mono.la/dispersiones>)
- Redeban

Pero:

- `masterCredentialsService` **no tiene ni un consumidor** en `src/`: solo lo reexporta `payfac/index.ts`. `getActiveProviderForOrganization` (`:193`) nunca se llama.
- Todos los rieles de cobro (Wompi, Bre-B, Bancolombia, Redeban) funcionan en **Modelo A**, con credenciales de la organización en `integration_credentials`. El dinero cae en la cuenta de cada cliente, no en la de GO Admin.
- Las dispersiones son **simuladas** (`payoutService.ts:305-343`):
  - Bre-B/Mono responde `{ simulated: true, message: 'Dispersion simulada via Mono' }` y marca `completed`.
  - `manual` marca `completed` sin evidencia.
  - `ach` queda en `processing` para siempre.
  - No hay un solo `fetch` a un proveedor.
- La propia documentación interna (`docs/integraciones/bancolombia-breb-redeban-qr-pagos.md` §1.3.2 y §14) advierte que el Modelo B exige licencia ante la Superfinanciera, SARLAFT y contratos de dispersión con cada organización.

### 2.2 Matriz de cobertura

| Capacidad | Estado | Evidencia y motivo |
|---|---|---|
| Onboarding de submerchants / KYC | **no** | Sin código. `organization_payout_accounts.is_verified` nunca cambia a `true`. |
| Cuentas de dispersión: alta | **roto** | La UI envía snake_case (`finanzas/payfac/cuentas/page.tsx:212-224`) y la API espera camelCase (`payout-accounts/route.ts:79-89`): siempre 400. |
| Cuentas de dispersión: listado y baja | UI | `/app/finanzas/payfac/cuentas`. La UI lee `account.verified`, pero la columna es `is_verified`. |
| Validación de titularidad y llave Bre-B | **no** | Solo campos no vacíos (`payout-accounts/route.ts:105-113`). |
| Vínculo payout ↔ cuenta destino | **roto** | `organization_payouts.bank_account_id` es `bigint` y la cuenta de dispersión es `uuid`. `processPayout` no lee ninguna cuenta: **un payout no tiene destino**. |
| Comisiones: cálculo | sin uso real | `commissionService.ts:98-128`. Usa `number` de JS y redondea a 2 decimales por ítem, cuando COP no tiene decimales. El mínimo y el monto fijo se aplican por pago. Con montos negativos la comisión sale negativa. |
| Comisiones: configuración | **roto** | Contrato UI↔API roto (400). Además, `UNIQUE (organization_id, provider_code)` más «cerrar la vigente y luego insertar» dejan a la organización **sin tarifa** al segundo cambio (`commissionService.ts:158-185`). |
| Comisiones: resumen | **roto** | Hace un *embed* sin FK (PGRST200) y trata un join muchos-a-uno como array, así que el total recaudado siempre es 0 (`commissionService.ts:238-279`). |
| Cobros (QR, links, checkout) | Modelo A, **sin PayFac** | `breb`, `bancolombia` y `redeban` `create-qr` y `wompi/create-transaction` usan la conexión de la organización. El `connectionId` y la organización vienen del body. |
| Payouts: creación | **roto** y mal definido | 400 desde la UI. Además `createPayout` barre **todos** los `payments completed` del periodo, **efectivo y tarjeta del POS incluidos** (`payoutService.ts:102-109`). |
| Payouts: aprobación | **no** | De `pending` se pasa directo a procesar, sin doble control. |
| Payouts: ejecución | **simulada** | Ver §2.1. |
| Payouts: listado de la organización | **roto** | `/app/finanzas/payfac/dispersiones` hace `payouts.map` sobre `{success,data}`, así que **la página revienta** (`:170-171`, `:403`). Las columnas que usa la UI admin no existen. |
| Conciliación de dispersiones | **no** | — |
| Reembolsos y contracargos | **no** | Nada descuenta un reembolso de un payout. |
| Webhooks de dispersión | **no** | Tampoco hay cron de payouts. |
| Webhooks de cobro | **fail-open** | Wompi verifica solo si hay secreto (`wompi/webhook/route.ts:68`). Bre-B procesa aunque falte la firma (`breb/webhook/route.ts:36-74`). Redeban no verifica nada (`redeban/webhook/route.ts:12-35`). Un «pagado» falso crea un `payment completed` (`qrShared/paymentConfirmation.ts:128-139`), que entraría a un payout. **Aparte, y conviene revisarlo:** según el `matcher` de `src/middleware.ts`, `/api/integrations/{wompi,breb,redeban,bancolombia}/webhook` no están excluidos, así que una llamada sin cookie de un proveedor recibiría 307. En los logs de producción de los últimos 3 días no hay ni una petición a esos webhooks. Queda fuera del alcance de esta auditoría. |
| Menú | **huérfano** | Ningún enlace a `payfac` en la navegación ni en `messages/*.json`. |
| Tests | **no** | — |

### 2.3 Conexión real

| Aspecto | Estado |
|---|---|
| Credenciales maestras | Variables `WOMPI_*`, `BANCOLOMBIA_*`, `BREB_MONO_*` y `REDEBAN_*`, todas definidas en `.env.local`. En Vercel no aparecen entre los 37 nombres visibles; los otros 20 llegaron truncados. **No están en `.env.example`**. Da igual por ahora: nadie las lee. |
| Ambiente | `detectEnvironment` usa `NODE_ENV`, así que en Vercel (producción **y preview**) siempre es producción. `resolveEnvKeys` inserta `_SANDBOX_` tras el primer `_` y, si no existe, **cae en silencio a la llave de producción**. En sandbox la clave del `secretRef` queda mal nombrada (`masterCredentialsService.ts:58-90`). |
| Riesgo latente | `getActiveProviderForOrganization` pasa a **todas** las organizaciones a Modelo B en cuanto existan las variables de producción, sin opt-in, contrato ni tarifa. Hoy no se dispara porque no tiene llamadores. **No lo conecten sin rediseñarlo.** |
| Idempotencia | Ninguna. Doble payout posible: consulta y luego inserción sin lock, y el UNIQUE es `(payout_id, payment_id)`. `processPayout` hace UPDATE sin `.eq('status', …)`. Un payout cancelado deja sus pagos bloqueados para siempre. |
| Estado en BD (hoy) | `organization_payouts` 0 · `payout_items` 0 · `organization_payout_accounts` 0 · `organization_commission_rates` 0. **Nunca se ha usado.** |

### 2.4 Seguridad multi-tenant

Ninguna ruta usa `getServerOrgContext`/`withOrg`, y todas trabajan con **service role**.

| Hallazgo | Severidad | Evidencia |
|---|---|---|
| `POST /payfac/payouts`: **sin ninguna verificación de rol**, con la organización tomada del body. Cualquier usuario con sesión crea payouts para cualquier organización y así ve montos y referencias de sus pagos. El guardarraíl lo deja pasar por un comentario | **Crítica** | `payouts/route.ts:73-116`; `guardrails.test.ts:275` |
| `POST /payfac/payout-accounts`: organización del body, sin permiso. **Un atacante registra su propia cuenta bancaria como destino de dispersión de otra organización** | **Crítica** | `payout-accounts/route.ts:92` |
| `GET /payfac/payout-accounts`: número de cuenta y documento del titular de cualquier organización, en texto plano | **Crítica** | `payout-accounts/route.ts:15-49` |
| `GET /payfac/payouts/[id]`, `GET /payouts?organizationId=`, `/payouts/pending`, `/payouts/summary`: lectura cruzada. El control de admin solo se aplica **si no** viene `organizationId` | **Alta** | `payouts/route.ts:48-56`; `[id]/route.ts:31-60` |
| `DELETE /payfac/payout-accounts/[id]` desactiva la cuenta de cualquier organización | **Alta** | `payout-accounts/[id]/route.ts:13-35` |
| `verifyPlatformAdmin` consulta `platform_admins` con el **cliente del usuario**. En BD esa tabla tiene RLS activa y **0 políticas**, así que la verificación **siempre da falso**: las funciones de admin (procesar, cancelar, tarifas) responden 403, mientras las rutas sin verificación siguen abiertas | **Alta** (funcional y de diseño) | Seis rutas `payfac/**`; `pg_policies` sin filas para `platform_admins` |
| **RLS de tablas de la plataforma escribibles por el tenant:** `organization_commission_rates` y `organization_payouts` aceptan `ALL` a cualquier miembro con `finance.approve`. Un cliente podría ponerse a sí mismo comisión 0 o marcar sus payouts como `completed` por PostgREST, sin pasar por ninguna ruta | **Alta** | Políticas `commission_rates_escritura` y `payouts_escritura` |
| Datos bancarios (`account_number`, `account_holder_id`, `breb_key_value`) en **texto plano** | Media | `organization_payout_accounts` |
| Las rutas devuelven `success:true` aunque el servicio falle | Media | `payouts/route.ts:116`, `[id]/route.ts:111`, `commission/route.ts:108`, `payout-accounts/route.ts:131` |

`payout_items` tiene RLS activa y 0 políticas. Para `anon` y `authenticated` eso es un «denegar todo», correcto; el baseline del repo mostraba `USING (true)`, pero ya no es así en la BD.

**Corregido hoy:** nada de PayFac. El commit `6c7961d3` (web-orders) y el de Meta/TikTok (`157426c1`) no lo tocan.

### 2.5 Qué falta para que un cliente la use de punta a punta

| # | Tarea | Prioridad | Tamaño |
|---|---|---|---|
| 1 | Cerrar ya las rutas `payfac/**`: organización de sesión, admin de plataforma verificado con service role y fuera del alcance del tenant. Quitar la escritura del tenant sobre `organization_commission_rates` y `organization_payouts` | **Bloqueante** (seguridad) | S-M |
| 2 | Requisito no técnico: licencia o figura legal (agregador o PSP aliado), SARLAFT y contrato de dispersión. Sin eso el Modelo B no puede operar | **Bloqueante** | decisión |
| 3 | Elegir el riel real: **cobro** en cuenta maestra (Wompi agregador o Mono) y **dispersión** (Mono, transferencias en lote). Implementar la ejecución real con webhooks firmados, idempotency key y estados del proveedor | **Bloqueante** | L |
| 4 | Onboarding y KYC del submerchant, y validación de titularidad de la cuenta destino (Prometeo Account Validation o la del riel) | **Bloqueante** | L |
| 5 | Rehacer `createPayout` como RPC transaccional: solo pagos cobrados por el riel maestro, lock por pago, montos en enteros o `numeric` con la moneda de la organización, fechas en la zona de la organización | **Bloqueante** | M |
| 6 | Arreglar los contratos UI↔API de las cuatro páginas y ponerlas en el menú según el plan | Importante | M |
| 7 | Conciliación de dispersiones, reembolsos y contracargos descontables | Importante | L |
| 8 | Cifrar los datos bancarios (Vault/pgsodium) y enmascararlos en la UI | Importante | M |
| 9 | Webhooks de cobro con firma obligatoria: Bre-B, Redeban y Wompi *fail-closed* | Importante | S |
| 10 | Tests de comisiones, payouts y rutas | Mejora | M |

---

## 3. Factus (facturación electrónica DIAN)

### 3.1 Proveedor y documentación

**Factus** (factus.com.co), API REST **v2**. El código usa `/v2/...` de forma consistente (`src/lib/services/factusService.ts:7-10`).

| Ambiente | Host |
|---|---|
| Sandbox | `https://api-sandbox.factus.com.co` |
| Producción | `https://api.factus.com.co` |

Autenticación: OAuth2 *password grant* en `/oauth/token`, con `refresh_token`.

Documentación oficial:

- Introducción: <https://developers.factus.com.co/>
- Colección de endpoints: <https://developers.factus.com.co/coleccion>
- Factura, crear y validar: <https://developers.factus.com.co/facturas/crear-y-validar/>
- Ver factura: <https://developers.factus.com.co/facturas/ver/>
- Ver y filtrar: <https://developers.factus.com.co/facturas/ver-y-filtrar/>
- Eventos RADIAN: <https://developers.factus.com.co/facturas/eventos-de-facturas/> (`GET /v2/bills/:number/radian/events`)
- Aceptación tácita: <https://developers.factus.com.co/facturas/aceptacion-tacita/>
- Nota crédito: <https://developers.factus.com.co/notas-credito/crear-y-validar/> (`POST /v2/credit-notes/validate`)
- Nota de ajuste al documento soporte: <https://developers.factus.com.co/notas-ajuste-documentos-soporte/crear-validar/>
- Recepción RADIAN: <https://developers.factus.com.co/recepcion-de-documentos/emitir-evento/>
- Adquiriente: <https://developers.factus.com.co/informacion-adquirientes/obtener-datos-adquiriente/>
- Suscripción del plan (cuota de documentos): <https://developers.factus.com.co/suscripciones/suscripciones> (`GET /v2/subscriptions`)

Dos precisiones sobre la documentación:

- **No documenta webhooks salientes.** «Suscripciones» es el plan y la cuota de documentos, no una suscripción de eventos. El estado de un documento se consulta; no llega empujado.
- Hay un SDK comunitario con la superficie completa: <https://github.com/sbetav/factus-js>.

### 3.2 Matriz de cobertura

| Capacidad de Factus | Estado | Evidencia y motivo |
|---|---|---|
| OAuth `password` + `refresh_token` | UI (solo «Probar conexión») | `factusService.ts:227-294`; `factusTokenManager.ts:37-86`. Coincide con la documentación. Token **global de la plataforma** en memoria, uno por instancia serverless. **No reintenta ante un 401**: `clearTokenCache` no tiene llamadores y el error se traga (`:81-85`). |
| Rangos: listar | **roto** | `numbering-ranges/route.ts:38`. La UI (`FacturacionConfigPanel.tsx:127-171`) copia **todos los rangos de la cuenta de la plataforma** a `invoice_sequences` de la organización, desde el navegador, con la sucursal `'2'` cableada, y mapea la nota de ajuste a un `document_type` que el CHECK rechaza. **En BD, las 2 organizaciones con rangos comparten los mismos 5 `factus_numbering_range_id`.** |
| Rangos: crear, actualizar, eliminar, rangos DIAN | **no** | — |
| Factura: crear y validar | **roto**; UI (POS, nueva factura, detalle) | `invoice/route.ts:175-297`. La llamada sale, pero el resultado **no se puede guardar**: escribe `invoice_sales.status = 'validated'/'sent'`, que `invoice_sales_status_check` (draft, issued, paid, partial, void) rechaza. El UPDATE entero falla y `xml_uuid` (CUFE) y `validated_at` se pierden (**0 de 3.525 facturas tienen `xml_uuid`**). El número DIAN y el QR tampoco se guardan. |
| Factura: ver por `reference_code` | sin uso | `factusService.ts:410`. Es justo lo que haría falta para reconciliar. |
| Factura: listar y filtrar | **no** | — |
| Factura: PDF / XML | parcial, con UI | `download/route.ts`. Si falta el número DIAN (siempre falta), usa el consecutivo interno. |
| Factura: XML AttachedDocument, enviar correo, representación gráfica | **no** (el correo solo por el flag `send_email`) | — |
| Factura: eliminar una no validada | **no** | Con una cuenta compartida, una factura atascada de un cliente puede bloquear a todos. |
| Eventos RADIAN, aceptación tácita, recepción de facturas de proveedores | **no** | Ni código ni tablas. |
| Nota crédito | **roto**; UI | `credit-note/route.ts`. Exige el CUFE de la factura, que nunca se guarda: siempre responde 400. El payload no calza con v2: no envía `correction_concept_code`, `customer`, `payment_details` ni `customization_id`/`billing_period`; los ítems van en formato v1 (`:90-98`). Escribe `einvoice_number`/`einvoice_qr`, columnas que no existen. |
| Nota débito | sin UI | `debit-note/route.ts`. Pasa los `items` crudos del body y `cufe: ''` si falta. |
| Documento soporte: crear | **roto**; UI | `support-document/route.ts:206`. Inserta el job con `invoice_id = supportDocumentId`, y `invoice_id` es FK a `invoice_sales`: **falla siempre antes de llamar a Factus**. `support_documents` tiene 0 filas. |
| Documento soporte: ver, eliminar, PDF/XML | implementado; **ver y eliminar sin autenticación** | Ver §3.4. |
| Nota de ajuste al documento soporte | **no** | Solo una etiqueta en la UI. |
| Adquiriente | UI (vía `/api/dian/lookup`) | `factusService.ts:597`; `dianLookupService.ts:392-415`. Es el último respaldo de la búsqueda por documento. |
| Municipios, unidades | sin uso | Mapas cableados (`factusService.ts:679-693`; municipio `'05001'` de respaldo en `invoice/route.ts:143,154`). |
| Países, tributos, monedas, empresa, suscripción/cuota | **no** | Los impuestos se envían siempre como IVA `'01'`: no hay INC. `mapTribute` y `mapIdentificationType` no calzan con los ids guardados en BD. |
| Consulta de estado / polling | **no** | Un job en `sent` se queda así para siempre. |
| Anulación | **no** | La DIAN anula por nota crédito, y no hay enlace entre «anular factura» y la nota crédito. |
| Nómina electrónica | **no** | Fuera del alcance del ERP hoy; Factus la ofrece. |
| Webhook entrante | **roto** e innecesario | `webhook/route.ts:61-67` busca `electronic_invoicing_jobs.reference_code`, columna que **no existe**. Factus no documenta webhooks. |

**Cobertura aproximada:** de unas 45 operaciones documentadas, 14 tienen código, 4 se usan desde la UI y **ninguna completa el ciclo** (emitir → guardar CUFE/número/QR → PDF → nota crédito).

### 3.3 Conexión real

| Aspecto | Estado |
|---|---|
| Credenciales | `FACTUS_CLIENT_ID`, `FACTUS_CLIENT_SECRET`, `FACTUS_USERNAME`, `FACTUS_PASSWORD`, `FACTUS_ENVIRONMENT`, y opcionales `FACTUS_WEBHOOK_SECRET` y `FACTUS_CRON_API_KEY`. En `.env.local` están las cinco primeras, con **`FACTUS_ENVIRONMENT=sandbox`**. **Ninguna está en `.env.example`.** En Vercel no aparecen entre los 37 nombres visibles; los otros 20 llegaron truncados y no pude verificarlos. |
| Configuración por organización | La tabla `electronic_invoicing_config` guarda `client_secret` y `password` **en texto plano**, se escribe desde el navegador y tiene `GRANT ALL` a `anon` (la RLS por membresía la protege). **Ningún código de servidor la lee**: es decorativa y contradice el modelo de plataforma. Tiene 0 filas. |
| **Modelo fiscal (emisor)** | **Bloqueante de negocio.** Ningún payload lleva el NIT de la organización: Factus emite a nombre de la **empresa dueña del token**. Con credenciales de plataforma, toda factura de un cliente saldría **a nombre del NIT y con las resoluciones de la cuenta de GO Admin**. Para emitir a nombre de cada cliente, cada NIT tiene que existir como empresa propia en Factus, con sus resoluciones DIAN y su habilitación como facturador. Hay que confirmar con Factus si ofrece un esquema de integrador o multiempresa y con qué credenciales. El código no modela nada de esto. |
| Cola | Estado en BD: `electronic_invoicing_jobs` tiene **8 jobs**, todos `pending`, **0 intentos, 0 con payload** (el doble job de `sendToFactus` los crea sin `request_payload`). Son de 2 organizaciones y el último es del 2026-09-04. `electronic_invoicing_events` 0 · `support_documents` 0. |
| Cron | **No existe.** `process-pending` no está en `vercel.json` ni en pg_cron, y solo exporta `POST`. Además: sin backoff (ignora `next_retry_at`), sin bloqueo de filas (dos ejecuciones pueden emitir dos veces), todo va a `/v2/bills/validate` sin importar el tipo, y no recupera jobs atascados en `processing`. **Otra sesión trabaja esto ahora.** |
| Idempotencia | `reference_code` = `INV-` más los 8 primeros hex del uuid, y `DS-0001` es único **solo por organización**. En una cuenta Factus compartida, los `DS-000N` de dos organizaciones chocan, y los `INV-xxxxxxxx` tienen riesgo de colisión. Si Factus validó y la respuesta se perdió, el reintento choca por duplicado y queda `failed`: no se reconcilia con `show-by-reference-code`. |
| Errores | Los 422 se concatenan en el mensaje en factura y documento soporte, y se pierden en notas. `error_code` nunca se escribe. No se distinguen 409/422 (no reintentar) de 5xx (reintentar). |
| Límite de tasa | Una sola cuenta: el límite de Factus se comparte entre todos los clientes, sin cola ni *throttling*. |
| Uso real | Sin tráfico a `/api/factus/**` en los logs de producción disponibles. **Nunca se ha emitido un documento válido desde el ERP** (0 CUFE en BD). |

### 3.4 Seguridad multi-tenant

`/api/factus/**` está **fuera del middleware** (`src/middleware.ts:155`), así que cada ruta se defiende sola.

| Ruta | Estado | Detalle |
|---|---|---|
| `acquirer`, `numbering-ranges`, `support-document/download` | **Corregido hoy** (07cb7c0e) | Exigen `getServerOrgContext`; la descarga verifica que el documento sea de la organización. |
| `auth`, `download` | Corregido antes (85c14e23) | Sesión más `belongsToOrg`. |
| `invoice`, `credit-note`, `debit-note`, `process-pending`, `webhook` | Corregido antes (a31e81aa) | `withOrg` + `readOrgBody`; cron *fail-closed*; webhook HMAC con `safeEqual` y 503 en producción si falta el secreto. |
| **`support-document` GET `?ref=` y DELETE** | **Pendiente, crítico** | **Sin ninguna autenticación** (`support-document/route.ts:345-381` y `:435-483`). Cualquiera en internet puede consultar y **borrar en Factus**, con el token de la plataforma, el documento soporte `DS-000N` de cualquier organización. |
| `support-document` POST | Pendiente | Organización del body (`:32`). La RLS del cliente de usuario evita hoy el cruce, pero incumple la regla 5. Está en la allow-list de `guardrails.test.ts:277`. |
| `jobs` GET/POST/DELETE | Pendiente | `organizationId` sale de la query (`jobs/route.ts:15`). Hoy la RLS evita el cruce, pero incumple la regla 5. Cualquier miembro puede reintentar o cancelar jobs, incluso `accepted`. |
| `download` (respaldo por `invoice_sales.number`) | Pendiente, medio | Como los rangos son compartidos, el consecutivo interno de una organización puede coincidir con el número DIAN de un documento de otra y bajar su PDF/XML (`download/route.ts:38-45`). |
| `numbering-ranges` | Pendiente, bajo | Devuelve los rangos de **toda la cuenta** de la plataforma (y el `raw`) a cualquier miembro. |
| `invoice`, `credit-note` | Pendiente, bajo | Sin permiso por rol: cualquier miembro emite. Los `items` del body llegan crudos al proveedor. |
| `electronic_invoicing_config` | Pendiente, medio | Secretos en texto plano, legibles por cualquier miembro de la organización. Sin filas hoy. |
| Logs | Pendiente, medio | El payload completo, con datos personales del adquiriente, va a los logs (`invoice/route.ts:269`, `support-document/route.ts:237`). |

### 3.5 Qué falta para que un cliente la use de punta a punta

| # | Tarea | Prioridad | Tamaño |
|---|---|---|---|
| 1 | **Decidir el modelo fiscal con Factus**: cada cliente debe emitir con su propio NIT y sus resoluciones. Opciones: cuenta de integrador/multiempresa en Factus, o credenciales por organización guardadas cifradas en el servidor (la tabla ya existe, pero en claro y decorativa). **Sin esto, emitir en producción con la cuenta de plataforma factura a nombre de GO Admin.** | **Bloqueante** | decisión + M |
| 2 | Autenticar `support-document` GET/DELETE ya, y pasar `support-document` POST y `jobs` a `withOrg` | **Bloqueante** (seguridad) | S |
| 3 | Guardar el resultado: estado electrónico en su propia columna (no en `invoice_sales.status`), CUFE, número DIAN, QR, `validated_at` de Factus y URL de PDF. Hacerlo en una RPC con el cambio de estado del job | **Bloqueante** | M |
| 4 | Cola (la otra sesión): cron `GET` con `CRON_SECRET`, un solo job por documento con su payload, `FOR UPDATE SKIP LOCKED`, backoff con `next_retry_at`, despacho por `document_type`, recuperación de `processing`, reconciliación con `show-by-reference-code` ante un duplicado, y 4xx/5xx diferenciados | **Bloqueante** | M |
| 5 | Documento soporte: arreglar el FK (usar `support_document_id`) y hacer `reference_code` único global | **Bloqueante** | S |
| 6 | Nota crédito con el payload v2 completo (`correction_concept_code`, `customer`, `payment_details`, `numbering_range_id`, `billing_period` si aplica), ítems v2 y enlace con «anular factura» | **Bloqueante** | M |
| 7 | Numeración: rangos por organización y sucursal verificados en el servidor (no copiar los de la cuenta desde el navegador), sin la sucursal `'2'` cableada, y usar `fn_get_next_invoice_number` | **Bloqueante** | M |
| 8 | Mapeos fiscales correctos: tributos (IVA/INC/exento), tipo de documento, organización jurídica, unidades y municipios desde los catálogos de Factus o DIAN, consumidor final `222222222222`, `tax_included` | **Bloqueante** | M |
| 9 | Estado por polling (quitar o reescribir el webhook) y eventos RADIAN y aceptación tácita | Importante | M |
| 10 | PDF/XML de notas y documento soporte, reenvío de correo, eliminar factura no validada, nota de ajuste al documento soporte, nota débito con UI | Importante | M |
| 11 | Reintento ante 401 en el token manager, cuota del plan (`/v2/subscriptions`) visible para la plataforma, variables en `.env.example`, logs sin datos personales | Mejora | S |
| 12 | Tests: payload contra fixtures de la documentación, cola, rutas y guardarraíl de organización | Mejora | M |

---

## 4. Hallazgos de seguridad no corregidos, en orden

| # | Hallazgo | Integración | Severidad |
|---|---|---|---|
| 1 | `POST /api/integrations/open-finance/transfer`: cualquier usuario con sesión inicia una transferencia con la llave de la plataforma | Open Finance | Crítica |
| 2 | `GET`/`DELETE /api/factus/support-document?ref=` **sin autenticación**, contra la cuenta Factus de la plataforma | Factus | Crítica |
| 3 | `POST /api/integrations/payfac/payout-accounts` con la organización del body: registrar una cuenta bancaria propia como destino de dispersión de otra organización | PayFac | Crítica |
| 4 | `POST /api/integrations/payfac/payouts` sin verificación de rol y con la organización del body | PayFac | Crítica |
| 5 | Lectura cruzada de cuentas bancarias y payouts (`payout-accounts` GET, `payouts/[id]`, `payouts?organizationId=`, `pending`, `summary`) | PayFac | Alta |
| 6 | 27 rutas de Open Finance con service role y organización del body o la query, o sin organización (IDOR), incluidas `pay-supplier` (dinero), `links` (devuelve `session_key`) y `sync` (todos los tenants) | Open Finance | Alta |
| 7 | RLS: el tenant con `finance.approve` puede escribir `organization_commission_rates` y `organization_payouts` (ponerse comisión 0, marcar payouts `completed`) | PayFac | Alta |
| 8 | `verifyPlatformAdmin` con el cliente del usuario sobre `platform_admins` (RLS sin políticas): nunca autoriza | PayFac | Alta (funcional) |
| 9 | Webhook de Open Finance sin `await` en la verificación (latente: hoy lo tapa el middleware) | Open Finance | Alta (latente) |
| 10 | Secretos y datos bancarios en texto plano: `open_finance_links.session_key`, `organization_payout_accounts.account_number/account_holder_id/breb_key_value`, `electronic_invoicing_config.client_secret/password` | las tres | Media |
| 11 | `jobs` y `support-document` POST de Factus con la organización de la query o el body (hoy la RLS evita el cruce) | Factus | Media |
| 12 | `download` de Factus: el respaldo por consecutivo interno puede servir el PDF/XML de otra organización (rangos compartidos) | Factus | Media |
| 13 | `health` de Open Finance expone conteos globales y qué variables están definidas; `validate-account` sirve de oráculo de titulares | Open Finance | Media |
| 14 | Payload con datos personales en los logs (Factus, webhook de Open Finance) | Factus, Open Finance | Media |
| 15 | Ambiente mal resuelto: Open Finance y PayFac caen a **producción** en cualquier despliegue de Vercel, preview incluido | Open Finance, PayFac | Media |

**Corregido hoy y verificado:** 07cb7c0e (Factus: `acquirer`, `numbering-ranges`, `support-document/download`). Los commits 6c7961d3 (web-orders) y 157426c1 (Meta/TikTok) no tocan estas tres integraciones. En Open Finance y PayFac **no hay nada corregido**.

---

## Anexo A. Rutas de Open Finance

La organización sale de:

- **—**: de ningún lado; solo un id de recurso.
- **query/body**: parámetro del cliente.
- **membresía**: la membresía activa más reciente.

Todas usan `auth.getSession()` más service role, salvo las indicadas.

| Ruta | Métodos | Organización | Nota |
|---|---|---|---|
| `accounts` | GET | — (`linkId`) | Llama al proveedor con la sesión de otro. |
| `anomalies`, `anomalies/duplicates` | GET | query | — |
| `anomalies/resolve` | POST | — | No hace nada. |
| `balances` | GET | — (`linkId`) | — |
| `consents` | GET/POST | query/body o membresía | — |
| `consents/stats` | GET | query o membresía | — |
| `consents/[id]`, `consents/[id]/renew` | GET/DELETE, POST | — | Revocar uno ajeno revoca su link. |
| `cron/*` (5) | POST | todas | 307 por middleware; POST y variable equivocadas. |
| `health` | GET | — | Datos globales. |
| `institutions` | GET | — | Lista estática. |
| `links` | GET/POST | query/body o membresía | Devuelve `session_key`. |
| `links/[id]/login` | POST | RLS del usuario | La única con RLS efectiva. |
| `movements` | GET | — | Escribe transacciones. |
| `pay-supplier` | POST | — | Dinero. |
| `payment-history` | GET | query | — |
| `real-balance` | GET | query | Escribe `last_balance`. |
| `refresh-balances` | POST | body | — |
| `suggest-matches`, `suggest-matches/[id]` | GET/POST | membresía, con comprobación en el servicio | Aceptable. |
| `sync` | POST | body; sin él, **todos** | — |
| `sync-status` | GET | — | — |
| `transfer` | POST | — | Llave de la plataforma. |
| `treasury/*` (4) | GET | query | — |
| `validate-account` | POST | — | Oráculo de titular. |
| `validate-balance`, `validate-supplier` | POST | — | — |
| `webhook` | POST | — | Sin `await`; 307 por middleware. |

## Anexo B. Evidencia de BD (2026-09-23, conteos)

| Tabla | Filas | Nota |
|---|---|---|
| `open_finance_links` / `_consents` / `_accounts` / `_transactions` | 0 / 0 / 0 / 0 | — |
| `organization_payouts` / `payout_items` / `organization_payout_accounts` / `organization_commission_rates` | 0 / 0 / 0 / 0 | — |
| `electronic_invoicing_jobs` | 8 | Todos `pending`/`invoice`, 0 intentos, 0 con payload, 0 CUFE; 2 organizaciones; último del 2026-09-04. |
| `electronic_invoicing_events` / `electronic_invoicing_config` / `support_documents` | 0 / 0 / 0 | — |
| `invoice_sales` | 3.525 | 0 con `xml_uuid` (CUFE). |
| `invoice_sequences` | 10 | 2 organizaciones, 5 rangos Factus, **cada rango usado por las 2**. |
| `integration_providers` | 27 | Ni Prometeo, ni Belvo, ni Factus. |
| `platform_admins` | — | RLS activa y 0 políticas. |
| `payout_items` | — | RLS activa y 0 políticas: denegado a `anon`/`authenticated`, correcto. |

Logs de Vercel en producción, últimos 3 días: 28 invocaciones de `/api/integrations/open-finance/cron/*`, todas con 307. Ninguna petición a `/api/factus/**` ni a `payfac`.
