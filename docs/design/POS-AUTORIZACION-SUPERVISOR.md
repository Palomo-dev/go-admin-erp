# POS — Autorización de supervisor para eliminar o anular (análisis + especificación, 2026-09-24)

Pedido del dueño: «Vi en el POS en Figma un letrero que pedía una credencial para hacer devolución o
cancelación de un producto. Me encantaría aplicarlo: que en Configuración del POS haya un switch para que sea
obligatorio o no, para que no puedan eliminar productos registrados en algunos casos; en otros negocios más
informales necesitan eliminarlos rápido.»

Alcance: configuración, quién autoriza y cómo, el flujo en el momento, la auditoría, el funcionamiento sin
conexión y los cambios de backend. **Nada de código ni de esquema se tocó.** Fuentes: código de `main`, base
`jgmgphmzusbluqhuqihj` (solo `SELECT`, conteos) y el archivo de Figma. La base de la propuesta es la
recomendación que ya se le dio al dueño; donde hay un problema con evidencia, está señalado (§8).

---

## 1. Lo que ya existe

### 1.1 En Figma (se parte de aquí)

| Pieza | Node id | Qué pasa con ella |
|---|---|---|
| Diálogo «Autorización de un supervisor» (límite de descuento superado) | `285:35588` (sección «Descuentos») | Es el «letrero» que vio el dueño: usuario o PIN del supervisor, motivo y el aviso «queda registrado quién autorizó». Pasa a ser el componente compartido **`AutorizacionSupervisor`** (§7) |
| Configuración › POS «Límite de descuento sin autorización», apagado | `290:35582` | Se clonó y pasó a llamarse **«Autorizaciones del POS»** (apagado) |
| Ídem, activo, con la tabla de límites por rol y «Pedir motivo obligatorio» | `290:35598` | Se clonó y se le añadieron el método, la lista de acciones, quién autoriza y las excepciones por sucursal. La tabla de límites se conserva como parte de la acción «descuento por encima del límite» |
| Bloque «Autoriza un supervisor» del diálogo «Quitar el cargo por servicio (sin permiso)» | `880:112376` en `880:112312` | Lo reemplaza el mismo componente (decisión 5 de cargos de servicio) |

`POS-UX-V2.md` §7.4 y la fila D.17 describían el diálogo y la tarjeta, pero solo para descuentos.

### 1.2 En el código y en la base

Resumen: **no existe nada de autorización de supervisor.** No hay PIN, ni `approved_by`, ni límite de
descuento por rol. Casi ninguna acción del POS comprueba un permiso.

| Acción | Dónde vive hoy | Permiso que se comprueba | Motivo | Registro |
|---|---|---|---|---|
| Quitar una línea del carrito | `CartView.tsx:290` → `posService.removeItemFromCart` (`posService.ts:991`): el carrito está en `localStorage` | Ninguno | No | No |
| Bajar la cantidad | `CartView.tsx:280` → `updateCartItemQuantity` (`posService.ts:1016`); con cantidad 0 o menos, quita la línea | Ninguno | No | No |
| Anular o bajar un plato ya enviado (mostrador) | `POST /api/pos/cocina/ronda` → RPC `pos_cocina_enviar_ronda`: compara con lo enviado y saca la comanda de ajuste (`ticket_type = 'adjustment'`) | Solo pertenencia | El sobre admite `void_reason` (`rutasCocina.ts:40`), pero el POS no lo manda: queda «Retirado del carrito» | En la comanda |
| Ídem en mesa | `pedidosService.eliminarItem` / `actualizarCantidadItem` (`:545`, `:566`) → RPC `pos_cocina_ajustar_linea_mesa` | Solo pertenencia | **Sí, obligatorio** (`CampoMotivo`, `OrderItemCard.tsx:27-160`; error `motivo_requerido`) | `ops_audit_log` + `adjustment_reason` / `cancel_reason` |
| Liberar o anular una mesa | `LiberarMesaDialog.tsx`, ruta `api/pos/mesas/[id]/liberar` → RPC `pos_mesa_liberar` | **`pos.void` en el servidor** (`route.ts:39,60`) | Sí, texto libre de 3 a 500 caracteres | `ops_audit_log` (`RELEASE`, `metadata.motivo`). **Es el patrón a copiar** |
| Anular una venta | `VentasService.cancelSale` (`VentasService.ts:640`), con `confirm`/`prompt` del navegador | Ninguno (solo RLS) | Sí, en `sales.notes` | `// TODO: Registrar en audit_log` (`:675`). No revierte pagos, cartera, inventario ni asiento |
| Devolución | `devolucionesService.procesarDevolucion` (`:619`), desde el navegador | Ninguno (`pos.refund` no se usa) | Sí (`return_reasons`) | En `returns` |
| Anular una deuda | `POSService.cancelDebtWithCreditNote` (`posService.ts:2681`), botón «Anular» en `CartView.tsx:1257` | Ninguno | **No** | No. Ni siquiera pide confirmación |
| Descuento | `CartView.tsx:376` → `updateCartItemDiscount` (`posService.ts:1050`): solo lo limita a cantidad × precio | Ninguno (`pos.discount` no se usa) | No | No |
| Abrir el cajón sin venta | **No existe.** El cajón se abre solo tras un cobro en efectivo (`CheckoutDialog.tsx:1269`) y en la prueba del agente de impresión | — | — | — |
| Quitar un cargo de servicio | No existe (propuesta en `POS-CARGOS-SERVICIO-EN-VENTAS.md`) | Propuesto: `pos.service_charge.waive` | Propuesto | Propuesto |

Otros hechos:

- **Permisos del POS en la base:** `pos_access`, `pos.view`, `pos.create` y `pos.discount` están asignados a
  2-3 roles. `pos.refund`, `pos.void` y `pos.propinas.liquidar`, a 1-2 roles. Ninguna migración ni semilla
  del repo los crea. `permissions.ts:308-309` define `pos.access` y `pos.manage`, que **no** son los códigos
  de la base (`pos_access`; `pos.manage` no existe).
- **Resolución en el servidor:** `hasOrgAdminOrPermission(ctx, code)` (`orgContext.ts:317`) y
  `requireOrgAdminOrPermission` (`:343`). En SQL, `fn_tiene_permiso(org, code)` con `auth.uid()`.
- **Configuración del POS:** filas de `organization_settings` (clave única por organización + `key`,
  `settings jsonb`). Claves de hoy: `pos_categories_display`, `pos_require_cash_session`,
  `pos_blind_cash_count`, `pos_cash_session_mode`, `pos_customer_display`. **No hay** configuración del POS
  por sucursal.
- **Auditoría:** `ops_audit_log` (2,7 millones de filas), escrita por disparadores y por las RPC nuevas. No
  hay ayudante en TypeScript para escribirla.
- **Sin conexión:** el carrito vive en `localStorage`; el cobro va a una cola (`salesOutbox.ts`, IndexedDB) y
  se reenvía a `pos_checkout_v1`. La réplica local copia `organization_members` y `roles`, pero **no**
  `role_permissions` ni `permissions`.
- **`pos_checkout_v1`:** el sobre no tiene campo de autorización. La RPC solo verifica pertenencia.
- **Volumen hoy** (conteos): 4 ventas anuladas en 3 organizaciones, 7 devoluciones, 0 comandas de ajuste.

---

## 2. Configuración

### 2.1 Tarjeta «Autorizaciones del POS» (Configuración › POS)

Nace de «Límite de descuento sin autorización». Un solo sitio para todo lo que pide autorización:

| Control | Valor por defecto | Notas |
|---|---|---|
| Interruptor general «Autorizaciones del POS» | **Apagado** | Apagado, el POS funciona como hoy (negocios informales). Excepción: quitar un cargo de servicio obligatorio (§2.2) |
| Cómo se autoriza | **PIN de supervisor** (recomendado) · Correo y contraseña | §4 |
| Acciones que piden autorización | Al encender: ver §2.2 | Casillas por acción |
| Límites de descuento por rol (% por línea y por venta) | Cajero 10 % · otros roles sin límite configurado | La tabla de `290:35598`. «Sin límite» para el administrador. El rol se resuelve en el servidor |
| Motivo obligatorio | **Sí** | Si se apaga, el motivo queda opcional salvo donde ya es obligatorio hoy (plato enviado de mesa, liberar mesa) |
| Quién autoriza | Informativo | Roles con `pos.authorize`; cuántos autorizadores hay en la sucursal y cuántos tienen PIN. Enlace a Roles y permisos |
| Excepciones por sucursal | — | **Fase 2** |

**Dónde se guarda.** Fase 1: `organization_settings` con la clave `pos_authorizations` (el mismo patrón de las
demás claves del POS; sin tabla nueva):

```json
{
  "enabled": false,
  "method": "pin",
  "require_reason": true,
  "actions": {
    "kitchen_void": true, "sale_void": true, "refund": true, "debt_void": true,
    "discount_over_limit": true,
    "cart_line_remove": false, "cart_qty_decrease": false, "drawer_open": false
  },
  "discount_limits": { "<role_id>": { "line_pct": 10, "sale_pct": 10 } },
  "offline": { "allowed_actions": ["kitchen_void", "discount_over_limit", "cart_line_remove", "cart_qty_decrease", "drawer_open"] }
}
```

Fase 2: tabla `pos_authorization_branch_settings (organization_id, branch_id, settings jsonb)` que **pisa** a
la de la organización clave por clave. Los límites se guardan por `role_id`, nunca por nombre de rol.

### 2.2 Acciones protegidas

| Acción (clave) | Marcada al encender | Dónde se valida (fase de llegada) | Qué se ata al comprobante |
|---|---|---|---|
| Anular un plato ya enviado a cocina (`kitchen_void`) | Sí | RPC de cocina: `pos_cocina_enviar_ronda` y `pos_cocina_ajustar_linea_mesa` (b) | Venta o mesa, línea, cantidad, importe |
| Anular una venta (`sale_void`) | Sí | RPC nueva de anulación que **sustituye** a `cancelSale` desde el navegador (b) | Venta, total |
| Hacer una devolución (`refund`) | Sí | RPC de devolución (b) | Venta, líneas, importe |
| Anular una deuda (`debt_void`) | Sí | RPC que sustituye a `cancelDebtWithCreditNote` (b) | Venta, factura, saldo |
| Descuento por encima del límite del rol (`discount_over_limit`) | Sí, límite del Cajero 10 % | En `pos_checkout_v1` (y en la ronda de cocina, si el descuento viaja ahí) (b) | Venta, línea o «toda la venta», porcentaje, importe |
| Quitar una línea no enviada (`cart_line_remove`) | No | En la pantalla + registro (c): el carrito vive en el navegador. La garantía total llega cuando el carrito se guarde en el servidor | Carrito, producto, cantidad, importe |
| Bajar la cantidad (`cart_qty_decrease`) | No | Ídem (c) | Ídem |
| Abrir el cajón sin venta (`drawer_open`) | No | Ruta nueva «Abrir cajón» con registro (c). Botón nuevo en la cabecera de caja | Caja, sesión de caja |
| Quitar un cargo de servicio obligatorio (`service_charge_waive`) | **Siempre**, aunque el interruptor esté apagado (decisión 5 de cargos) | `pos_checkout_v1` con `sale_service_charges.approved_by` (c) | Venta, cargo, importe |

La casilla del cargo de servicio se muestra marcada y bloqueada, con la nota «Siempre activo».

---

## 3. Quién autoriza

- Permiso nuevo **`pos.authorize`** («Autorizar operaciones del POS»), asignable por rol en Roles y permisos.
  Por defecto, en los roles de sistema de administrador y gerente. Se asigna por `role_id` en la semilla,
  **nunca** comparando nombres de rol (regla 6 de `CLAUDE.md`).
- **El propio cajero**, si su rol tiene `pos.authorize`, no necesita PIN: solo el motivo (si es obligatorio), y
  queda registrado como `method = 'self'`.
- Para el cargo de servicio vale además el permiso específico `pos.service_charge.waive` (quien lo tenga lo
  quita sin PIN). Para autorizar a otro se exige `pos.authorize`.
- La lista de supervisores del diálogo sale del servidor: miembros activos de la organización, con
  `pos.authorize`, con acceso a la sucursal de la venta y con PIN creado. Nunca se arma en el navegador con
  la lista de roles.

---

## 4. Cómo se autoriza

### 4.1 PIN o correo y contraseña

| | PIN de supervisor (4-6 dígitos) — **recomendado** | Correo y contraseña |
|---|---|---|
| Rapidez en caja | Segundos, con teclado numérico | Lento; el supervisor escribe su correo en la caja del cajero |
| Riesgo de exponer la contraseña de la cuenta | Ninguno: el PIN solo sirve para autorizar en el POS | El supervisor teclea la contraseña de su cuenta en una terminal ajena |
| Fuerza | Baja por sí sola (10⁴-10⁶ combinaciones) → exige límite de intentos y bloqueo | Alta |
| Sin conexión | Posible con reservas (§6) | No |

Correo y contraseña queda como alternativa para quien no quiera gestionar PIN. Se verifica en el servidor, en
una ruta que **no** crea sesión ni cambia el usuario del POS.

### 4.2 El PIN

- **Uno por usuario y organización.** Lo crea cada autorizador en **Mi perfil › PIN de supervisor**. Esa
  tarjeta solo se ve con `pos.authorize`. Crear o cambiar el PIN **pide la contraseña de la cuenta**
  (reautenticación). Reglas: solo dígitos, de 4 a 6; no se aceptan secuencias (1234, 4321) ni repetidos
  (1111), ni el PIN anterior.
- **Se guarda con hash en el servidor:** `crypt(pin, gen_salt('bf', 10))` de `pgcrypto`, que ya está
  instalado en el esquema `extensions`. Nunca en texto plano, nunca en el navegador, nunca en `localStorage`,
  nunca en registros ni en `ops_audit_log`. Viaja una vez, por TLS, en el cuerpo de la RPC.
- **Límite de intentos:** 5 fallos seguidos → bloqueado **15 minutos** (`locked_until`). El contador se
  guarda **sin** abortar la transacción (la RPC devuelve `{ok:false, remaining}`; si lanzara un error, el
  `ROLLBACK` borraría el intento). Hay además un tope por quien pide (por ejemplo, 10 fallos en 15 minutos
  contra cualquier supervisor), para que no se pueda ir probando un supervisor tras otro.
- **Mensajes:** «PIN incorrecto. Quedan N intentos». Nunca se dice si el supervisor existe o si tiene PIN.
- **Restablecer:** el administrador, desde Miembros, con «Restablecer PIN». Borra el hash, desbloquea y deja
  registro (`reset_by`). El autorizador crea uno nuevo.

---

## 5. Flujo en el momento

1. El cajero toca la acción (anular el plato, bajar la cantidad, «Anular» la deuda…).
2. El POS pregunta al servidor si la acción requiere autorización: configuración + permisos de la sesión.
   - Si **no** la requiere, sigue como hoy.
   - Si la requiere y el cajero **tiene** `pos.authorize`, solo pide el motivo (si es obligatorio) → estado
     «solo motivo».
   - Si no lo tiene, abre **«Autorización requerida»**: qué se autoriza (acción, detalle, importe, quién pide),
     supervisor, PIN y motivo.
3. El servidor verifica el PIN y devuelve un **comprobante de un solo uso**: válido 2 minutos, atado a la
   acción, al objeto (venta, línea, carrito) y al importe. Se guarda solo su hash.
4. La acción se ejecuta **en el servidor** presentando el comprobante. La RPC de la acción lo consume en la
   misma transacción: si no coincide, está vencido o ya se usó, no hace nada.
5. Queda el registro (§7). En las acciones del carrito (c), que siguen en el navegador, el comprobante se
   consume con una RPC de «confirmación». La protección real ahí es el registro, hasta que el carrito viva en
   el servidor.

Estados del diálogo (todos dibujados): PIN · correo y contraseña · solo motivo · PIN incorrecto (con los
intentos que quedan) · bloqueado (hasta qué hora; se puede elegir a otro supervisor) · sin autorizadores
(botón deshabilitado; el enlace a Configuración solo lo ve un administrador).

**Motivo.** Obligatorio si la casilla está marcada (y siempre donde ya lo es hoy). Chips por acción más un
detalle opcional de 140 caracteres:

| Acción | Motivos (chips) |
|---|---|
| Plato enviado · línea · cantidad | Error al registrar · El cliente cambió de opinión · Producto con defecto · Otro |
| Anular venta | Error al registrar · Cobro duplicado · El cliente no pagó · Otro |
| Devolución | Los de `return_reasons` de la organización (ya existen) |
| Anular deuda | Deuda incobrable · Error al registrar · Acuerdo con el cliente · Otro |
| Descuento sobre el límite | Cliente frecuente · Producto con avería · Compensación · Otro |
| Abrir cajón | Cambio para un cliente · Retiro autorizado · Otro |
| Quitar cargo de servicio | Los de §2.3 de `POS-CARGOS-SERVICIO-EN-VENTAS.md` |

---

## 6. Sin conexión (Desktop)

Propuesta de base: validar contra el hash del PIN guardado en caché local, marcar la autorización «sin
conexión» y sincronizar el registro; si nunca hubo caché, bloquear.

**Problema, con evidencia:** un PIN de 4 a 6 dígitos tiene entre 10⁴ y 10⁶ combinaciones. Con el hash en el
disco del equipo, quien tenga acceso a ese equipo (o a las herramientas de desarrollo de la app) puede
probarlas todas **fuera de línea**, sin límite de intentos. Con bcrypt de coste 10 (unos 100 ms por intento en
una CPU), un PIN de 4 dígitos sale en unos 17 minutos y uno de 6 en poco más de un día; con GPU, mucho menos. Y
el PIN recuperado sirve también en línea.

Recomendación para que siga siendo útil sin abrir ese hueco:

1. La caché existe **solo en Desktop** (no en el navegador), cifrada con el almacén del sistema operativo
   (`safeStorage` de Electron), y es **por dispositivo**.
2. Se guarda un verificador **distinto** del hash del servidor: argon2id de coste alto (≥ 250 ms), con una sal
   de dispositivo. Caduca a las **72 horas** sin sincronizar, y se invalida si el PIN cambia o si se quita el
   permiso.
3. El límite de intentos también existe localmente (5 → 15 minutos). El bloqueo se sube al volver la conexión.
4. Sin conexión solo se autorizan las acciones de `offline.allowed_actions`: plato enviado, descuento, línea,
   cantidad, cajón. **Anular venta, devolución y anular deuda no se autorizan sin conexión**: son acciones del
   servidor y hoy tampoco funcionan sin él.
5. Cada autorización sin conexión llega al registro con `offline = true`. En el registro y en el cierre de caja
   se ve con el badge «Autorizada sin conexión», para que se revise.
6. Si nunca hubo caché en ese equipo: bloqueado, con el mensaje «Sin conexión: pide autorización cuando
   vuelva la red».

---

## 7. Auditoría

**Tabla `pos_authorizations`**, una fila por **intento**, también los fallidos:

| Columna | Qué guarda |
|---|---|
| `id uuid`, `organization_id int`, `branch_id int` | — |
| `action text` | Clave de §2.2 (`CHECK`) |
| `target_type text`, `target_id text`, `target_snapshot jsonb` | Venta, línea, carrito; producto, cantidad y nombre en el momento |
| `amount numeric` | Importe afectado |
| `requested_by uuid`, `approved_by uuid NULL` | Quién pidió y quién autorizó |
| `method text` | `pin` · `password` · `self` · `offline_pin` |
| `result text` | `approved` · `rejected_pin` · `locked` · `no_approvers` · `expired` · `cancelled` |
| `reason_code text`, `reason_text text` | Motivo |
| `terminal_id text`, `cash_session_id uuid NULL` | Caja o dispositivo; sesión de caja, para el cierre |
| `offline boolean`, `synced_at timestamptz` | Sin conexión |
| `token_hash text`, `expires_at`, `consumed_at`, `consumed_by_entity text` | Comprobante de un solo uso |
| `created_at timestamptz` | Hora; se **muestra** en la zona horaria de la organización (`formatDateInTz`) |

RLS: lectura por pertenencia, solo con `pos.authorize` o administración (patrón `IN (SELECT … JOIN)` con
`(select auth.uid())`). **Sin políticas de escritura**: solo escriben las funciones `SECURITY DEFINER`. Cada fila
aprobada deja además su entrada en `ops_audit_log`, como hace hoy `pos_mesa_liberar`.

**Dónde se consulta:**

- **POS › Registro de autorizaciones.** Filtros por fecha, acción, cajero, supervisor, resultado y sucursal.
  Exportación a CSV.
- **Cierre o arqueo de caja:** bloque «Autorizaciones del turno», por ejemplo «2 anulaciones de platos ·
  $ 45.000», «1 devolución», «2 intentos rechazados», con enlace al registro.
- **Detalle de la venta:** las autorizaciones de esa venta en su historial.

---

## 8. Problemas y decisiones que conviene revisar

1. **Caché del PIN sin conexión** (§6): se puede atacar por fuerza bruta. Se propone verificador propio,
   cifrado por el sistema operativo, con caducidad y solo para las acciones de riesgo bajo.
2. **Quitar el cargo de servicio no es opcional.** La recomendación base lo dejaba desmarcado, pero la
   decisión 5 del dueño (2026-09-24) lo protege siempre. Queda marcado y bloqueado.
3. **Quitar líneas del carrito no enviado** solo se puede proteger en la pantalla mientras el carrito viva en
   `localStorage`. Alguien con las herramientas del navegador puede saltárselo. El registro sí queda si se
   usa el flujo normal.
4. **Permisos inconsistentes hoy:** `pos.access` y `pos.manage` en `permissions.ts` no existen en la base, y
   `pos.void` solo lo tiene 1 rol. Antes de encender nada, hay que sembrar `pos.authorize` por `role_id` y
   corregir esas constantes.
5. **Retención del registro:** se propone 5 años (como los documentos contables). Falta confirmarlo.

---

## 9. Cambios de backend necesarios (no aplicados)

Todos aditivos, por el MCP de Supabase, con su `.sql` en `supabase/migrations/` y su reversión en
`supabase/rollbacks/` (`docs/POLITICA-MIGRACIONES.md`). Orden de entrega:

**(a) Base**

1. `permissions`: `pos.authorize` (y `pos.service_charge.waive` de cargos). Semilla en los roles de sistema de
   administrador y gerente **por `role_id`**.
2. `organization_settings`, clave `pos_authorizations` (§2.1). Esquema validado con zod en el servicio. Solo la
   escribe el administrador.
3. Tabla `pos_supervisor_pins`: `organization_id int`, `user_id uuid`, `pin_hash text NOT NULL`,
   `failed_attempts smallint NOT NULL DEFAULT 0`, `locked_until timestamptz NULL`,
   `last_used_at timestamptz NULL`, `reset_by uuid NULL`, `reset_at timestamptz NULL`, `created_at`,
   `updated_at`, `PRIMARY KEY (organization_id, user_id)`. RLS **activa sin políticas**, `REVOKE ALL` a `anon`
   y `authenticated`. Nadie la lee: solo las funciones.
4. Tabla `pos_authorizations` (§7).
5. Funciones `SECURITY DEFINER`, con la organización tomada de la sesión (miembro activo con `auth.uid()`,
   nunca del cuerpo) y `REVOKE … FROM anon`:
   - `pos_pin_estado()` → `{has_pin, locked_until, last_used_at}` del usuario actual.
   - `pos_pin_guardar(p_pin text)`: valida las reglas y guarda el hash. La llama la ruta
     `POST /api/pos/pin` **después** de reautenticar la contraseña (`getServerOrgContext()` primero).
   - `pos_pin_restablecer(p_user_id uuid)`: solo administración.
   - `pos_autorizaciones_config(p_branch_id)` → configuración efectiva + si el usuario tiene `pos.authorize` +
     supervisores disponibles (id y nombre; sin datos del PIN).
   - `pos_autorizacion_solicitar(p_branch_id, p_action, p_target jsonb, p_amount, p_approver_id, p_secret,
     p_reason_code, p_reason_text, p_terminal_id)` → `{ok, token, expires_at}` o
     `{ok:false, reason, remaining, locked_until}`. Aplica el límite de intentos, **registra cada intento** y
     no aborta en el fallo.
   - `fn_autorizacion_consumir(p_token, p_action, p_target, p_amount)`: **no** se expone a los clientes. La
     llaman las RPC de cada acción. Marca `consumed_at` y devuelve el id de la autorización.
   - `pos_autorizacion_confirmar_cliente(p_token, p_snapshot)`: consume el comprobante de las acciones que
     siguen en el navegador (c).
6. Pantallas: la tarjeta de Configuración, Mi perfil › PIN, Miembros › «Restablecer PIN», el registro y el
   bloque del cierre de caja.

**(b) Acciones que ya pasan a RPC** (cada una llama a `fn_autorizacion_consumir` cuando la configuración lo
pide):

7. Plato enviado: `pos_cocina_enviar_ronda` y `pos_cocina_ajustar_linea_mesa` (y el POS por fin manda
   `void_reason`).
8. Devolución: la RPC de devolución que se está haciendo.
9. Anular venta: RPC nueva que **reemplaza** a `VentasService.cancelSale` (hoy no revierte pagos, cartera,
   inventario ni asiento: `POS-CARGOS-SERVICIO-EN-VENTAS.md` §9.3 H6).
10. Anular deuda: RPC que reemplaza a `cancelDebtWithCreditNote`.
11. Descuento: `pos_checkout_v1` comprueba el límite del rol **resuelto en el servidor** y exige
    `authorization_token` en el sobre si se supera. Los sobres viejos del outbox sin la clave siguen entrando
    (el límite solo aplica si la configuración está encendida y la venta se creó después).

**(c) Carrito, cajón y cargo**

12. Quitar línea y bajar cantidad: diálogo + `pos_autorizacion_confirmar_cliente`. La garantía llega cuando el
    carrito se guarde en el servidor.
13. «Abrir cajón»: botón nuevo; ruta con `getServerOrgContext()` que consume el comprobante, registra y abre el
    cajón por el agente.
14. Quitar cargo de servicio: en `pos_checkout_v1` (`sale_service_charges.approved_by`), siempre protegido.

**Offline (Desktop):** `replicationManifest.ts` añade el verificador cifrado del §6 por dispositivo, **no**
`pos_supervisor_pins`; la cola de autorizaciones sin conexión sube a `pos_authorizations` al sincronizar.

**Tests que deben existir antes de encender:** límite de intentos y bloqueo (incluido que el fallo **persiste**
tras el error), comprobante vencido, reutilizado o atado a otra acción u otro importe, organización del cuerpo
distinta de la sesión (403 y registro), cajero con permiso (`self`) y caché sin conexión vencida.

---

## 10. Textos (4 idiomas)

Namespace `posAuthorization`. En Figma los frames están en español; esta tabla es la fuente para
`messages/{es,en,fr,pt}.json`.

| Clave | es | en | fr | pt |
|---|---|---|---|---|
| `settingsTitle` | Autorizaciones del POS | POS approvals | Autorisations du PDV | Autorizações do PDV |
| `settingsHelp` | Cuando está activo, las acciones marcadas piden la autorización de alguien con permiso. | When on, the checked actions need approval from someone with permission. | Activé, les actions cochées exigent l'accord d'une personne habilitée. | Quando ativo, as ações marcadas pedem a autorização de alguém com permissão. |
| `methodPin` | PIN de supervisor (recomendado) | Supervisor PIN (recommended) | Code PIN du responsable (recommandé) | PIN do supervisor (recomendado) |
| `methodPassword` | Correo y contraseña | Email and password | E-mail et mot de passe | E-mail e senha |
| `actionKitchenVoid` | Anular un plato ya enviado a cocina | Void an item already sent to the kitchen | Annuler un plat déjà envoyé en cuisine | Cancelar um item já enviado à cozinha |
| `actionSaleVoid` | Anular una venta | Void a sale | Annuler une vente | Cancelar uma venda |
| `actionRefund` | Hacer una devolución | Process a return | Effectuer un retour | Fazer uma devolução |
| `actionDebtVoid` | Anular una deuda | Void a debt | Annuler une dette | Cancelar uma dívida |
| `actionDiscount` | Dar un descuento por encima del límite del rol | Give a discount above the role limit | Accorder une remise au-delà de la limite du rôle | Dar um desconto acima do limite da função |
| `actionLineRemove` | Quitar una línea del carrito (aún no enviada a cocina) | Remove a cart line (not yet sent to the kitchen) | Retirer une ligne du panier (pas encore envoyée en cuisine) | Remover uma linha do carrinho (ainda não enviada à cozinha) |
| `actionQtyDecrease` | Bajar la cantidad de una línea | Lower a line's quantity | Réduire la quantité d'une ligne | Diminuir a quantidade de uma linha |
| `actionDrawerOpen` | Abrir el cajón sin venta | Open the drawer without a sale | Ouvrir le tiroir sans vente | Abrir a gaveta sem venda |
| `actionServiceChargeWaive` | Quitar un cargo de servicio obligatorio | Remove a mandatory service charge | Retirer des frais de service obligatoires | Remover uma taxa de serviço obrigatória |
| `alwaysOn` | Siempre activo | Always on | Toujours actif | Sempre ativo |
| `requireReason` | Pedir motivo obligatorio en todas las autorizaciones | Require a reason for every approval | Exiger un motif pour chaque autorisation | Exigir motivo em todas as autorizações |
| `dialogTitle` | Autorización requerida | Approval required | Autorisation requise | Autorização necessária |
| `noPermission` | Tu usuario no tiene el permiso para esta acción | Your user doesn't have permission for this action | Votre utilisateur n'a pas l'autorisation pour cette action | Seu usuário não tem permissão para esta ação |
| `selfApprove` | Tienes el permiso: solo falta el motivo | You have permission: just add a reason | Vous avez l'autorisation : indiquez seulement le motif | Você tem permissão: falta só o motivo |
| `supervisor` | Supervisor | Supervisor | Responsable | Supervisor |
| `pin` | PIN del supervisor | Supervisor PIN | Code PIN du responsable | PIN do supervisor |
| `reason` | Motivo | Reason | Motif | Motivo |
| `pinWrong` | PIN incorrecto. Quedan {n} intentos. | Wrong PIN. {n} attempts left. | Code PIN incorrect. Il reste {n} essais. | PIN incorreto. Restam {n} tentativas. |
| `pinLocked` | PIN bloqueado hasta las {time}. Elige otro supervisor. | PIN locked until {time}. Choose another supervisor. | Code PIN bloqué jusqu'à {time}. Choisissez un autre responsable. | PIN bloqueado até {time}. Escolha outro supervisor. |
| `noApprovers` | Nadie en esta sucursal puede autorizar todavía | No one at this branch can approve yet | Personne dans cette boutique ne peut encore autoriser | Ninguém nesta filial pode autorizar ainda |
| `authorize` | Autorizar y {action} | Approve and {action} | Autoriser et {action} | Autorizar e {action} |
| `logged` | Queda registrado quién pidió, quién autorizó, la acción, el importe, el motivo y la hora. | Who asked, who approved, the action, the amount, the reason and the time are logged. | La demande, l'approbation, l'action, le montant, le motif et l'heure sont enregistrés. | Ficam registrados quem pediu, quem autorizou, a ação, o valor, o motivo e a hora. |
| `offlineApproved` | Autorizada sin conexión | Approved offline | Autorisée hors ligne | Autorizada offline |
| `pinCardTitle` | PIN de supervisor | Supervisor PIN | Code PIN du responsable | PIN do supervisor |
| `pinCreate` | Crear PIN | Create PIN | Créer le code PIN | Criar PIN |
| `pinChange` | Cambiar PIN | Change PIN | Modifier le code PIN | Alterar PIN |
| `pinRules` | De 4 a 6 dígitos, sin secuencias ni repetidos | 4 to 6 digits, no sequences or repeats | 4 à 6 chiffres, sans suite ni répétition | De 4 a 6 dígitos, sem sequências nem repetições |
| `pinReset` | Restablecer PIN | Reset PIN | Réinitialiser le code PIN | Redefinir PIN |
| `logTitle` | Registro de autorizaciones | Approval log | Journal des autorisations | Registro de autorizações |
| `shiftSummary` | Autorizaciones del turno | Approvals this shift | Autorisations de la session | Autorizações do turno |

---

## 11. Figma

Página `05 POS y ventas`, sección nueva **«POS — Autorización de supervisor para eliminar o anular (propuesta
2026-09-24)»** (`896:113792`, x = 0, y = 147 800). El componente vive en `02 Componentes`, sección
`893:582886`.

### 11.1 Hecho

| Pieza | Node id | Nota |
|---|---|---|
| Componente **`AutorizacionSupervisor`** | `893:582887` | 8 variantes: `Estado = pin / usuario-contraseña / solo-motivo / pin-incorrecto / bloqueado / sin-autorizadores` × `Layout = dialogo` (480), más `pin` y `solo-motivo` en `Layout = hoja` (390). Propiedad de texto «Acción». Construido con el estilo de `285:35588` (colores, radio, sombra, avisos) y con `Select`, `FormField`, `Chip`, `KbdButton`, `Badge` e iconos del kit |
| Variantes | `893:582193` pin · `893:582290` usuario-contraseña · `893:582383` solo-motivo · `893:582466` pin-incorrecto · `893:582557` bloqueado · `893:582645` sin-autorizadores · `893:582704` hoja pin · `893:582802` hoja solo-motivo | — |
| Configuración › POS «Autorizaciones del POS», apagado | `896:113795` | Clon de `290:35582` |
| Ídem, activo | `896:113806` | Clon de `290:35598` + método, lista de acciones, quién autoriza, excepciones por sucursal (fase 2) |
| Diálogo por acción (6) | `896:113988` plato enviado (PIN) · `896:114129` anular venta (correo y contraseña) · `896:114275` devolución (solo motivo) · `896:114399` descuento (PIN incorrecto) · `896:114530` quitar cargo (bloqueado) · `896:114658` abrir cajón (sin autorizadores) | Instancias del componente |
| Móvil: hoja sobre el POS (2) | `896:114742` PIN · `896:114957` solo motivo | Instancias `Layout = hoja` sobre el carrito móvil, con velo |

### 11.2 Pendiente — **se agotó el cupo del MCP de Figma**

1. **Arreglo visual en `896:113806`**: el `Checkbox` del kit trae su propio texto («Sucursal principal»), que
   quedó visible junto a cada acción. Hay que ocultarlo.
2. **Solape**: la tarjeta activa mide 1 518 px de alto y se monta sobre la fila de diálogos (y = 1 100). Hay
   que bajar los diálogos y las hojas.
3. **No dibujados:** Mi perfil › PIN de supervisor (sin PIN · crear o cambiar · con PIN), el Registro de
   autorizaciones (escritorio) y el bloque «Autorizaciones del turno» del cierre de caja.
4. Comprobar el espacio en blanco bajo el pie de las variantes del componente (visto en la primera captura;
   puede ser la sombra).
5. El chequeo por script (solapes, nodos fuera de la sección, instancias rotas, textos truncados) y las
   capturas `64-pos-autorizacion-*.png`.

El guion `use_figma` que hace los puntos 1, 2 y 3 quedó escrito y listo para reintentar (ver el informe de la
sesión).
