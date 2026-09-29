# Acceso (auth) v2 — con el viajero: análisis y propuesta

Encargo del dueño (2026-09-28): «Quiero que mejores acceso y organización de las páginas con ruta
auth; las quiero con el Principito así como la página web, pero solo esa parte: el manejo que él
hace al light y al dark.»

Alcance: **análisis + diseño en Figma**. No se cambió código de la app; el dueño aprueba primero en
Figma. Del sitio web se toma **únicamente** la ilustración del personaje y su manejo claro/oscuro;
el resto sigue el manual de marca y el kit del ERP.

Antecedentes que este documento no repite (siguen vigentes):
`docs/design/AUDITORIA-CONTROLES-ACCESO-ORGANIZACION.md` (auditoría control por control del
2026-09-22) y `docs/design/PARIDAD-ACCESO-ORGANIZACION.md` (secciones 1 a 6 de la página
`08 Acceso y organización`). Aquí se re-verificó el código actual (hubo cambios desde entonces:
«Recordarme» ya solo guarda el correo, `/auth/login` recupera la sesión con `?reason=expired`) y
se añade lo que faltaba: rutas, redirecciones, enumeración de cuentas, bloqueo por intentos, 2FA y
la propuesta de organización.

Sin nombres de organizaciones cliente: los ejemplos son «Mi empresa S.A.S.», «Distribuidora del
Norte», «Café de la Esquina» y «Taller Los Andes». Rutas relativas a `src/`.

---

## 0. En una página

- **El «Principito» del sitio es un personaje propio**: un viajero de abrigo claro y bufanda Azul
  GO, *inspirado* en El Principito y dibujado desde cero. El propio archivo del sitio lo advierte:
  la obra original y sus dibujos están protegidos; no se usan la rosa, el zorro, la boa ni citas.
  Se trajo ese viajero al ERP, no el dibujo de Saint-Exupéry.
- **El sitio no tiene modo oscuro de sistema**: su «claro/oscuro» es un **día y una noche**. El
  hero es cielo de día (degradado Azul GO, nubes, planeta, cohete) con el viajero de pie; el cierre
  y la 404 son cielo de noche (degradado tinta, luna, estrellas de trazo) con el viajero sentado
  mirando las estrellas, y el trazo del dibujo pasa de tinta oscura a `#E3E8FF`. En el ERP eso se
  mapea así: **modo claro = día, modo oscuro = noche**, con variables `auth/*` de modo Light/Dark.
- **Figma**: sección nueva `17. Acceso (auth) v2 — con el viajero` en `08 Acceso y organización`
  ([node 1073:675594](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1073-675594)),
  enlazada en el Índice. **84 frames** (escritorio 1440, tableta 1024 y móvil 390, claro y
  oscuro). Componentes nuevos en `02 Componentes › Acceso v2 — El viajero y su cielo (Nuevo)`.
  Chequeo por script: 0 solapes, 0 instancias rotas, 0 textos desbordados, 0 colores sin variable,
  solo nombres genéricos.
- **Lo más grave del acceso hoy** (no se arregla aquí, se dejó una tarea aparte): con solo conocer
  el correo de alguien que tiene una **invitación pendiente**, un tercero obtiene el código real de
  la invitación desde `/auth/verify` y puede crear esa cuenta con su propia contraseña y entrar a la
  organización (§4.1).
- Además: **6 caminos para saber si un correo tiene cuenta**, **no hay bloqueo por intentos**,
  **3 políticas de contraseña distintas**, **2FA se puede activar pero el login nunca lo pide**,
  Microsoft en web termina en un login vacío, dos selectores de organización distintos, una ruta
  sin enlaces (`/auth/session-expired`), 7 pantallas sin traducir y **ninguna** con selector de
  idioma ni de tema.

---

## 1. Inventario de rutas

| Ruta | Archivo | Tipo | Propósito | Quién enlaza | i18n | Fondo |
|---|---|---|---|---|---|---|
| `/auth/login` | `app/auth/login/page.tsx` (889) | página | Entrar con correo, Google, Microsoft, biometría (app) | middleware, `/`, AppLayout (cerrar sesión), AuthGuard, SessionContext, PanelSesion (`?addAccount=1`), `/marcar`, cuenta congelada, plan/billing, callback, verify, todas las de auth | `auth.login` + textos fijos en `lib/auth/emailAuth.ts` | degradado + `AuthSceneBackground` |
| `/auth/signup` | `app/auth/signup/page.tsx` (1021) + `components/auth/*Step.tsx` | página, 6 pasos | Crear cuenta, organización, sucursal, plan y pago | login, select-organization | mixto; BranchForm, PriceSummary y cupón fijos | ídem |
| `/auth/forgot-password` | `app/auth/forgot-password/page.tsx` (234) | página | Pedir enlace de restablecimiento | login, reset-password | mixto | ídem, sin logo |
| `/auth/reset-password` | `app/auth/reset-password/page.tsx` (352) | página | Crear contraseña nueva | correo de recuperación (`lib/supabase/config.ts` L1098), verify | `auth.resetPassword` | ídem |
| `/auth/verify` | `app/auth/verify/route.ts` (444) | ruta de servidor | Canjear token de signup, recovery, email_change, magiclink, invite | enlaces de correo | — | — |
| `/auth/verify/failed` | `app/auth/verify/failed/page.tsx` (157) | página | El enlace falló: reenviar | verify | **fijo en español** | ídem |
| `/auth/verify/resent` | `app/auth/verify/resent/page.tsx` (76) | página | Enlace reenviado | verify | **fijo en español** | ídem |
| `/auth/callback` | `app/auth/callback/route.ts` (535) | ruta de servidor | Intercambio OAuth / confirmación | Google, correos | — | — |
| `/auth/select-organization` | `app/auth/select-organization/page.tsx` (466) | página | Elegir organización | callback de Google (`?dest=`), cuenta congelada, ManageOrganizationsTab | mixto | **gris plano, sin escena** |
| `/auth/invite` | `app/auth/invite/page.tsx` (210) + `InvitationWizard.tsx` (750) | página, 3 pasos | Aceptar invitación | correo, verify | asistente **100 % fijo en español** | degradado + escena |
| `/auth/session-expired` | `app/auth/session-expired/page.tsx` (104) | página | Limpia almacenamiento y cierra sesión | **nadie** (solo un comentario en `SessionContext.tsx` L19) | `auth.sessionExpired` | **azul plano, sin `dark:`** |
| `/auth/super-admin-access` | `app/auth/super-admin-access/page.tsx` (136) | página | Suplantación desde el panel externo con token de un uso | sistema externo | fijo | gris plano |
| `/auth/logout` | — | **no existe** | Aparece en la lista de excepciones del middleware | — | — | — |
| `/app/cuenta-congelada` | `app/app/cuenta-congelada/page.tsx` (467) | página con sesión | Cuenta suspendida, cancelada, pago fallido, prueba vencida | middleware (`?reason=`) | **fijo en español** | degradado propio |
| `/` | `app/page.tsx` | página | Arranque: decide en el navegador (PWA iOS) | — | — | pantalla de arranque |

No existen `app/login`, `app/register` ni un grupo `(auth)`. El callback móvil es
`/api/auth/native-callback` → `goadmin://auth-callback`.

**Componentes de `components/auth` que nadie importa**: `InvitationForm` (el único con
`autocomplete` correcto), `OrganizationSelector`, `PasswordField`, `PasswordStrengthIndicator`,
`EmailResendComponent`, `PermissionGuard`. `EnterpriseConfigSelector` solo lo usa
`EnterpriseConfigModal`, que tampoco se importa: **no hay selección de módulos en el registro**.

---

## 2. Pantalla por pantalla

### 2.1 `/auth/login`

- **Controles**: correo (solo placeholder, sin `<label>`, `autoComplete=email`); contraseña
  (`current-password`, ojo con `title` pero sin `aria-label`); «Recordarme» (hoy guarda **solo el
  correo**, ofuscado); «¿Olvidaste?»; Entrar; «Crear cuenta»; Google; Microsoft (texto fijo
  «Microsoft»); biometría solo en la app con credenciales. Al salir del campo correo se consulta
  el proveedor y se avisa «cuenta registrada con Google».
- **Estados**: cargando (el *fallback* de Suspense dice «Loading...» en inglés); errores en caja
  roja con `role="alert"`: «Demasiados intentos…» (429), «El usuario no existe o las credenciales
  son incorrectas…», «Tu cuenta aún no ha sido verificada», «El usuario no existe. ¿Quieres crear
  una cuenta nueva?», o el mensaje **crudo de Supabase en inglés** (`emailAuth.ts` L211-252). El
  enlace «Crear cuenta» aparece si el texto contiene «El usuario no existe», que está en los dos
  mensajes: **sale también cuando solo falla la contraseña**.
- **`?error=`**: solo `corrupted-session`, `auth-failed` y dos que nadie genera tienen mensaje;
  `google-session-expired`, `session-failed`, `redirect-failed`, `invalid-verification-link`,
  `email-verification-failed`, `verification-failed`, `callback-processing-failed`,
  `native-callback-invalid-params` y `access_denied` caen en «Error al iniciar sesión».
- **`?success=`**: `email-confirmed` pinta el texto que venga en `message` (texto arbitrario desde
  la URL); `email-changed` (lo envía verify L327) **no se muestra nunca**.
- **Bloqueo por intentos**: **no existe**. Solo 3 s de espera en el navegador por correo
  (`lib/supabase/config.ts` L738-760) y el 429 de Supabase. Cada intento con correo sin verificar
  **reenvía** el correo de verificación.
- **Sesión vencida** (`?reason=expired`): intenta renovar con `getSession()` (máx. 1 vez cada 30 s)
  y vuelve a `destinoInternoSeguro(redirectTo)`. **No muestra ningún mensaje**.
  `?reason=session-invalidated` (SessionContext L317) no tiene tratamiento.
- **Después de entrar**: con 1 o más organizaciones abre **siempre** un popup para elegir
  (`emailAuth.ts` L158-161), también con una sola. Sin organizaciones: si hay invitación va a
  `/auth/invite`, si no entra a `/app/inicio`. `proceedWithLogin` va a `sessionStorage.redirectTo`
  **sin validarlo** (posible redirección abierta, `organizationAuth.ts` L411-418).
- **Accesibilidad**: popup sin `role="dialog"`, sin trampa de foco ni `Esc`, filas `div` con
  `onClick`; `GeolocationModal` se abre sola al segundo de cargar.
- **Visual**: dividido (panel de marca 2/5 desde `lg` + tarjeta 3/5); degradado azul-índigo, en
  oscuro gris-negro, más la escena animada (sin `prefers-reduced-motion` y también en móvil).

### 2.2 `/auth/signup` — 6 pasos

| Paso | Componente | Campos | Problemas |
|---|---|---|---|
| 1 Datos personales | `PersonalInfoStep` → `RegistrationForm` | Nombre, Apellido, Correo (comprobado en vivo), Teléfono, Contraseña + confirmación, foto (2 MB), idioma preferido (**es, en, pt, fr, de, it**: de e it no existen) | Contraseña solo 8 caracteres; **«Correo disponible / ya registrado» = enumeración**; error pintado dos veces; sin `autocomplete`; sin términos |
| 2 Organización | `OrganizationStep` → `CreateOrganizationForm` (modo signup, 2 subpasos) | Crear: logo, nombre, razón social, tipo, correo, NIT (marcado obligatorio y **no validado**), DV, teléfono, colores · descripción, dirección, país/depto/ciudad, CP, subdominio (verifica disponibilidad), web, impuesto por defecto. Unirse: código | **«Unirse con código» guarda el código y nunca lo usa**: el usuario termina sin organización. Sin `dark:` |
| 3 Sucursal | `BranchStep` → `BranchForm` | Nombre, código, dirección, contacto, horarios 7 días, 6 características | Textos fijos, labels sin `htmlFor` |
| 4 Plan | `SubscriptionStep` + `PriceSummary` + cupón | Planes activos de `plans` (Pro, Business, Ultimate), mensual/anual, prueba o pagar ahora | Resumen y cupón fijos en español; **no hay paso de módulos** |
| 5 Pago | `PaymentMethodStep` | Stripe `CardElement` + SetupIntent | **Si Stripe falla el usuario no se entera** (L568-573) |
| 6 Verificación | `VerificationStep` | Reenviar correo | Llega al final, después de pedir la tarjeta |

Con confirmación de correo activa, todo el formulario viaja en `signup_data` y se materializa en
`/auth/callback?complete_signup=true`. La tabla de planes está duplicada entre callback (L353) y
signup (L309) con correspondencias distintas.

### 2.3 `/auth/forgot-password`

Correo con label oculto, «Enviar», volver, reenvío con cuenta atrás de 60 s. **Revela la cuenta**:
«Esta cuenta está registrada con Google…» y «cuenta no verificada». Con sesión abierta el
middleware lo manda a `/app/inicio` (no está en su lista de excepciones).

### 2.4 `/auth/reset-password`

Contraseña + confirmación con chips (8 + mayúscula + minúscula + número + especial), **sin
`autocomplete="new-password"`**. Éxito: al login a los 2 s, pero con la sesión aún abierta el
middleware lo manda a `/app/inicio`. **Con cualquier sesión normal abierta muestra el formulario**:
se puede cambiar la contraseña sin la actual (`isPasswordRecovery` no protege).

### 2.5 Verificación (`/auth/verify` + `failed` + `resent`)

`verify` canjea el token según `type` y redirige (signup → inicio o login; recovery → invite o
reset; email_change → login con un aviso que no se muestra; magiclink/invite → invite). Si falla:
magiclink reenvía (5 por IP, 3 por correo, en memoria) y va a `resent` o `failed`; invite con
`email` **busca la invitación con permisos de administrador y redirige con el código real** (§4.1).
`failed` y `resent` están **en español fijo**; `resent` muestra el correo de la URL.

### 2.6 `/auth/callback`

`code`, `error`, `next`, `redirect_to`. Google → guarda perfil y cookie → select-organization.
**Cualquier otro proveedor se trata como confirmación de correo**: cierra sesión y va al login con
`success=email-confirmed`. Por eso **Microsoft en web termina en un login vacío** (no probado en
vivo; el código lo indica así). El usuario no ve nada mientras se procesa.

### 2.7 `/auth/select-organization`

Esqueleto de carga; sin sesión → login; sin organizaciones → `/auth/signup?step=organization&
google=true` **aunque no sea de Google**. Lee `?_oauth=` (tokens por URL que nadie genera). Al
elegir hay dos redirecciones compitiendo (`proceedWithLogin` y `router.push(next)`). Filas `div`
sin `tabIndex`. **Duplica** el popup del login con otros textos.

### 2.8 `/auth/invite` + `InvitationWizard`

Estados de página: sin código, inválida/vencida, error (con Reintentar e Ir al login). Estado de
cuenta decidido en el servidor (`nueva`, `huerfana`, `existente`). Pasos: datos (nombre, apellido,
teléfono) → contraseña (8 + mayúscula, minúscula, número) → listo. Cuenta existente: «Ya tienes
cuenta» → login con `redirectTo` de vuelta. **Todo el asistente en español fijo**, botones fuera
de un `<form>` (Enter no envía), sin `autocomplete`.

### 2.9 `/auth/session-expired`, `/auth/super-admin-access`, `/app/cuenta-congelada`

- `session-expired`: sin enlaces; limpia almacenamiento; sus dos botones usan la misma clave
  `t('login')` y el segundo lleva a `/`. La inactividad está desactivada (`INACTIVITY_THRESHOLD =
  Infinity`).
- `super-admin-access`: canje atómico de token, estilo plano, errores fijos. Fuera del flujo.
- `cuenta-congelada`: 5 variantes por `reason`, cupón, checkout, cambiar de organización. Todo fijo
  en español; es la única con modo oscuro completo.

### 2.10 2FA

Se puede activar y desactivar en `components/profile/SeguridadSection.tsx` L97-154, pero **ningún
paso del login pide el código** (el propio comentario L108-109 dice que el flujo está incompleto).
El usuario cree estar protegido y no lo está.

---

## 3. Middleware (`middleware.ts`) y redirecciones

| Caso | Hoy | Línea |
|---|---|---|
| Rutas públicas | `/auth/*`, `/pos-display*`, `/auth/v1/`; el matcher excluye todo `api/auth` (check-email, accept-invitation, invite/context no pasan por el middleware) | L898-909, L158-225, L1067 |
| Sin sesión, página | `/auth/login?redirectTo=<ruta>` **solo si empieza por `/app/`** y **sin la query** (`/marcar`, `/privacy` pierden el regreso) | L949-958 |
| Sin sesión, API | 401 JSON `SESSION_EXPIRED` / `UNAUTHENTICATED` | L924-929 |
| Sesión vencida | `/auth/login?redirectTo=…&reason=expired` (no renueva) | L933-941 |
| Cookie corrupta | `/auth/login?error=corrupted-session` y borra cookies | L337-362 |
| Con sesión en `/auth/login` | → `/app/inicio` salvo `?addAccount=1` | L969-976 |
| Con sesión en otra `/auth/*` | → `/app/inicio` salvo logout (no existe), session-expired, invite, verify, select-organization, signup, reset-password, super-admin-access. **forgot-password no está** | L978-992 |
| Sin organización | **no hace nada**: entra a `/app/inicio` con solo «Inicio» | — |
| Cuenta congelada | `/app/cuenta-congelada?reason=suspended|deleted|canceled|payment_failed|trial_expired` | L694-796 |

---

## 4. Problemas de acceso

### 4.1 Crítico — la invitación se puede tomar con solo el correo

`/auth/verify?type=invite&token=<cualquiera>&email=<correo invitado>`: `verifyOtp` falla y la
ruta busca con el cliente administrador la invitación `pending` más reciente de ese correo (sin
filtrar vencimiento) y redirige a `/auth/invite?invite_code=<código real>`
(`app/auth/verify/route.ts` L157-183, verificado). Con ese código, `POST /api/auth/accept-invitation`
—sin límite de peticiones y fuera del middleware— crea la cuenta con la contraseña de quien llama
si el estado es `nueva` o `huerfana`, y la une a la organización con el rol invitado. **Se dejó una
tarea aparte para corregirlo** (no forma parte de este encargo de diseño).

### 4.2 Enumeración de cuentas (6 caminos)

1. `/api/auth/check-email` responde `{exists}` (20 por IP cada 15 min, **en memoria** por
   instancia); las RPC `check_email_exists` y `get_auth_provider_by_email` están concedidas a
   `anon` y permiten saltarse el límite.
2. Login al salir del correo y forgot-password: «registrada con Google/Microsoft».
3. Login y forgot distinguen «cuenta no verificada»; el login además reenvía el correo.
4. `/auth/verify?type=magiclink&email=X` → `resent` o `failed` según haya invitación.
5. §4.1.
6. `/api/auth/invite/context` devuelve `account_state` a quien tenga el código.

Solo `/api/auth/invite/resend` responde siempre igual.

### 4.3 Resto

- **Sin bloqueo por intentos** en servidor (§2.1).
- **Políticas de contraseña**: 8 (signup, perfil, API de invitación) · 8+3 (invitación) · 8+4
  (reset).
- **Mensajes**: seis estilos de error distintos (`bg-red-100`, `bg-red-50 border-l-4`, con icono,
  `rounded-lg`, texto suelto, página completa) y mensajes crudos de Supabase en inglés.
- **Redirecciones**: `redirectTo` de `sessionStorage` sin validar; `?message=` pinta texto de la URL.
- **Reset sin contraseña actual** con una sesión normal abierta (§2.4).
- **Teclado y lectores**: campos sin `<label>`, ojos sin `aria-label`, sin `aria-invalid` ni
  `aria-describedby`, sin autofocus, popups sin semántica de diálogo, invitación fuera de `<form>`.
- **Móvil**: la escena animada (33 animaciones) se pinta también en 390 px; no respeta
  `prefers-reduced-motion`.
- **Idioma y tema**: ninguna pantalla de auth tiene selector de idioma ni de tema; el registro
  ofrece 6 idiomas y la app tiene 4.

---

## 5. Problemas de organización

- **Dos selectores de organización** (popup del login y `/auth/select-organization`) con textos,
  favoritos y comportamiento distintos; el popup aparece aunque haya una sola organización.
- **Ruta sin enlaces**: `/auth/session-expired`; **ruta fantasma**: `/auth/logout`; parámetros
  muertos: `?_oauth=`, `?fromExpired=true`, `auth-callback-failed`, `session-parse-error`.
- **Tres familias visuales**: degradado con escena · gris/azul plano (select-organization,
  session-expired, super-admin) · degradado propio (cuenta congelada). El logo solo aparece en
  login y signup.
- **El registro pide todo antes de verificar el correo**: tarjeta incluida. Si el correo no se
  confirma, organización, sucursal y plan quedan en `signup_data` sin materializar.
- **«Unirse con código»** en el registro no hace nada.
- **Sin organización** el middleware deja entrar a una app vacía.
- **Seis componentes huérfanos** en `components/auth` (§1) y lógica de reenvío duplicada.

---

## 6. Propuesta de organización de rutas — cada fila para aprobación

Principio: **ningún enlace existente se rompe**; lo que desaparece redirige.

| # | Ruta | Propuesta | Enlaces viejos | Aprobación |
|---|---|---|---|---|
| R1 | `/auth/login` | Se queda. Absorbe la sesión vencida (aviso con `reason=expired`), muestra los `?error=` con un catálogo único de mensajes, un solo mensaje de credenciales, bloqueo por intentos y selector de idioma/tema | — | [ ] |
| R2 | `/auth/session-expired` | Deja de ser pantalla: **308 → `/auth/login?reason=expired`**. Su limpieza de almacenamiento pasa a R3 | redirige | [ ] |
| R3 | `/auth/logout` | Se crea de verdad (ruta de servidor que cierra sesión, limpia y va a login). Ya figura en el middleware | — | [ ] |
| R4 | `/auth/select-organization` | **Único selector**. El popup del login desaparece. Con una sola organización se salta. Favorita y principal persistentes | el popup deja de existir | [ ] |
| R5 | `/auth/signup` | **Opción A** (dibujada): 6 pasos actuales con el nuevo sistema. **Opción B** (recomendada): `/auth/signup` = cuenta + verificación; organización, sucursal, plan y pago pasan al asistente compartido de creación de organización (decisión del 2026-09-22) al volver verificado | `?step=organization&google=true` redirige al asistente | [ ] A · [ ] B |
| R6 | Registro «Unirme con un código» | Lleva a `/auth/invite?invite_code=…` | — | [ ] |
| R7 | `/auth/forgot-password` | Se queda; añadir al middleware como excepción con sesión (o mandar a Perfil › Seguridad) | — | [ ] |
| R8 | `/auth/reset-password` | Solo con sesión de recuperación; cerrar las otras sesiones al guardar; botón explícito «Ir a iniciar sesión» | — | [ ] |
| R9 | `/auth/verify/failed` + `/resent` | Una sola pantalla neutra con dos estados; `resent` redirige a `failed?estado=reenviado` | redirige | [ ] |
| R10 | `/auth/callback` | Sigue siendo ruta de servidor; mientras procesa se ve la pantalla «Entrando…» (frame 2) y reconoce Microsoft o se quita Microsoft de la web | — | [ ] |
| R11 | `/auth/invite` | Se queda; asistente traducido y dentro de `<form>`; al aceptar entra directo a la organización | — | [ ] |
| R12 | Sin organización | El middleware manda a `/auth/select-organization` (estado vacío) en vez de a una app vacía | — | [ ] |
| R13 | `/auth/super-admin-access` | Se queda fuera del flujo; solo adopta el sistema visual | — | [ ] |
| R14 | `/app/cuenta-congelada` | Se queda bajo `/app` (necesita sesión); adopta el sistema visual y se traduce | — | [ ] |
| R15 | `redirectTo` | Siempre validado con `destinoInternoSeguro`; el middleware conserva la query y no solo `/app/*` | — | [ ] |

Flujo propuesto (opción B):

```
/ → sin sesión → /auth/login ─┬─ correo+contraseña ─┐
                              ├─ Google → /auth/callback (Entrando…) ─┤
                              └─ ¿Olvidaste? → forgot → correo → reset → login
                                                     │
                        0 organizaciones ── select-organization (vacío) → crear / código
                        1 organización  ── /app/inicio (o redirectTo validado)
                        2 o más         ── select-organization → /app/…
/auth/signup → cuenta → «Revisa tu correo» → verify → asistente de organización → /app/inicio
/auth/invite → datos → contraseña → /app/inicio de esa organización
```

---

## 7. El viajero del sitio web y su manejo claro/oscuro

Archivo `4EZbbgItq1AK5IhS81LwRL` «GO Admin — Sitio web» (solo referencia, no se tocó).

| Qué | Dónde (node-id) |
|---|---|
| Manual del personaje | `01 Sistema › Ilustración · El viajero` **16:226** |
| Paleta nocturna | `01 Sistema › Color` **14:154** (`night/900 #0B1024`, `night/800 #121A36`, `night/700 #1B2540`, `night/line #E3E8FF`, `bg/night`, `bg/night-surface`, `text/on-night-muted`) |
| Movimiento | `01 Sistema › Movimiento` **16:358** |
| Viajero de pie | `02 Componentes › Fundamentos` **6:133** (Fondo=Claro 6:7 · Azul 6:49 · Tinta 6:91) |
| Viajero sentado | **6:224** (Claro 6:134 · Azul 6:164 · Tinta 6:194) |
| Cohete · Planeta · Luna · Estrella · Nube | **6:264** · **6:292** · **6:305** · **6:315** · **6:316** |
| Cielo | `02 Componentes › Organismos web › Fondo/Cielo` **13:315** (Momento=Día 13:172 · Noche 13:235) |
| Uso de día | Inicio escritorio 17:252 › hero 17:253 (Cielo Día 17:254 + Viajero de pie Azul 17:530) |
| Uso de noche | Cierre nocturno 19:1256 (Cielo Noche 19:1257 + Viajero sentado Tinta 19:1357); 404 22:2037 (Noche + Viajero de pie Tinta 22:2163); móvil 22:1408 |

**Qué cambia entre día y noche**

| Elemento | Día (hero) | Noche (cierre, 404) |
|---|---|---|
| Fondo | degradado vertical `#3651D4 → #4361EE (55 %) → #6A82F1` | `#0B1024 → #121A36 (60 %) → #1F2E7D` |
| Estrellas pequeñas | 26, blancas al 42 % | 70, blancas al 72 %, titilan |
| Decorado | 8 nubes al 35 %, planeta, cohete | luna y 3 estrellas de trazo |
| Viajero | de pie, variante **Azul**: trazo `#0F172A`, relleno blanco, acento Azul profundo `#2A3EA8` | sentado mirando las estrellas, variante **Tinta**: trazo `#E3E8FF`, relleno `#1B2540`, acento Azul GO `#4361EE` |
| Regla | «un solo acento; sobre azul el acento baja a Azul profundo; sobre noche la línea se vuelve #E3E8FF» | |
| Movimiento | nubes en tres capas de parallax, planeta flota 8 s, cohete despega al hacer scroll, bufanda ondea 4 s | el cielo pasa de día a noche con el scroll, las estrellas titilan, el viajero se sienta |
| Reducción de movimiento | con `prefers-reduced-motion` todo estático | ídem |

El archivo del sitio tiene **un solo modo de variables («Light»)**: no hay modo oscuro de sistema.
El «oscuro» del sitio es la escena nocturna. En el ERP se traduce a **tema**: claro = día, oscuro =
noche.

---

## 8. Figma — lo que se hizo (archivo del ERP `EAvjINVRnlzFM70GVoWXgl`)

### 8.1 Variables nuevas (colección `Color`, modos Light/Dark; solo se añadió)

| Variable | Light | Dark |
|---|---|---|
| `night/900`, `night/800`, `night/700`, `night/line` | `#0B1024`, `#121A36`, `#1B2540`, `#E3E8FF` | iguales |
| `auth/cielo-alto` | → `blue/600` | → `night/900` |
| `auth/cielo-medio` | → `blue/500` | → `night/800` |
| `auth/cielo-bajo` | → `blue/400` | → `blue/800` |
| `auth/ilus-linea` | → `slate/900` | → `night/line` |
| `auth/ilus-relleno` | → `white` | → `night/700` |
| `auth/ilus-acento` | → `blue/700` | → `blue/500` |
| `auth/ilus-acento-suave` | → `blue/50` | → `blue/700` |
| `auth/ilus-rubor` | → `blue/200` (el sitio usa `#AFC0FB`, sin equivalente exacto) | → `blue/400` |
| `auth/estrella` | → `white` | → `white` |

### 8.2 Componentes nuevos — `02 Componentes › Acceso v2 — El viajero y su cielo (Nuevo)` [1069:665482](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1069-665482)

| Componente | Variantes | Nota |
|---|---|---|
| `Ilustración/Viajero` **1069:665554** | `Pose=De pie` 1069:665528 · `Pose=Sentado` 1069:665553 | SVG exportado del sitio y recoloreado a `auth/ilus-*`: toma el modo del frame |
| `Auth/Cielo` **1069:665724** | `Tema=Claro` 1069:665586 · `Tema=Oscuro` 1069:665644 | Degradado con paradas enlazadas a `auth/cielo-*`; cada variante fija su modo (Claro→Light, Oscuro→Dark). Estrellas y nubes escalan; planeta y luna se anclan arriba a la derecha, cohete abajo a la derecha |
| `Ilustración/Planeta` 1069:665563 · `Cohete` 1069:665575 · `Nube` 1069:665578 · `Luna` 1069:665582 · `Estrella` 1069:665585 | — | Piezas del cielo |

Reemplaza a `AuthScene` (352:137811) **cuando el dueño apruebe**; `AuthScene` no se tocó. Los
componentes existentes del kit no se modificaron: solo se instanciaron.

### 8.3 Sección `17. Acceso (auth) v2 — con el viajero` — [1073:675594](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1073-675594)

Página `08 Acceso y organización`, debajo de la sección 16 (x 0, y 44302, 6668 × 28105), enlazada
desde el Índice (354:19, con hipervínculo al nodo). Columnas: escritorio 1440 claro · oscuro,
tableta 1024 claro · oscuro, móvil 390 claro · oscuro.

**Composición**: escritorio y tableta en dos mitades —panel de ilustración (600 / 380 px) con
logo, lema y viajero sobre `Auth/Cielo`, y formulario de 400 px (560 en organización y selección,
932 en planes) sobre `bg/surface`—; móvil con banda de cielo de 196 px, viajero pequeño y el
formulario debajo. **Idioma y tema** arriba a la derecha en todas (Button ghost con globo +
`ThemeToggle`). Pie con Términos, Privacidad y Ayuda. Kit usado: `FormField`, `PasswordField`,
`Button`, `OAuthButton`, `AuthAlert`, `Checkbox`, `SegmentedControl`, `PhoneInput`,
`PlanOption`, `OrgSelectCard`, `OrgAvatar`, `SearchInput`, `Skeleton`, `Divider`, `ThemeToggle`,
`Marca/Nuevo`, iconos.

| Fila | Pantalla | Frames | Primer frame (escritorio claro) |
|---|---|---|---|
| 1 | Iniciar sesión — listo | 6 | 1073:675612 |
| 1b | Iniciar sesión — error de credenciales | 4 (escritorio + móvil) | 1073:676704 |
| 1c | Iniciar sesión — bloqueado por intentos (Nuevo) | 2 | 1073:677460 |
| 1d | Iniciar sesión — sesión vencida | 2 | 1073:677860 |
| 2 | Callback de Google / cargando (Nuevo) | 6 | 1073:678238 |
| 3 | Registro 1 · Tu cuenta | 6 | 1075:683905 |
| 3b | Registro 2 · Tu organización | 2 | 1075:685409 |
| 3c | Registro 3 · Sucursal principal | 2 | 1075:685895 |
| 3d | Registro 4 · Plan y suscripción | 2 | 1075:686367 |
| 3e | Registro 5 · Método de pago | 2 | 1075:687007 |
| 3f | Registro 6 · Revisa tu correo | 4 | 1075:687385 |
| 4 | Olvidé mi contraseña | 6 | 1077:692688 |
| 4b | Olvidé mi contraseña — enviado | 4 | 1077:693576 |
| 5 | Restablecer — con fortaleza | 6 | 1077:694208 |
| 5b | Restablecer — éxito | 2 | 1077:695318 |
| 5c | Restablecer — enlace vencido | 2 | 1077:695606 |
| 6 | Verificar correo — el enlace falló | 6 | 1077:695916 |
| 6b | Verificar correo — enlace reenviado | 2 | 1077:696840 |
| 7 | Aceptar invitación — tus datos | 6 | 1077:697132 |
| 7b | Aceptar invitación — tu contraseña | 2 | 1077:698295 |
| 7c | Aceptar invitación — ya tienes cuenta | 2 | 1077:698675 |
| 8 | Selección de organización | 6 | 1077:698985 |
| 8b | Selección — sin organizaciones | 2 | 1077:700297 |

Qué se dibujó distinto a hoy (todo lleva la marca «Nuevo» o una nota en la fila): un único
mensaje de credenciales; bloqueo por intentos con hora de desbloqueo; aviso de sesión vencida;
pantalla «Entrando…»; política única de contraseña con medidor (10+ caracteres, no filtrada,
distinta del correo); aceptar Términos y Privacidad; respuestas neutras en olvidé, verificación y
reenvío; «Cerrar la sesión en mis otros dispositivos»; subpaso B de organización plegado en «Más
datos (opcional)»; horarios de la sucursal fuera del registro; error de Stripe en línea; selector
único de organización con principal primero. Microsoft no se dibuja en web (pregunta 4). Precios
de planes: los del componente `PlanOption`, pendientes de aprobación (auditoría F.9).

Capturas: `docs/design/figma/77-auth-*.png` (14).

### 8.4 Chequeo por script (2026-09-28)

| Comprobación | Resultado |
|---|---|
| Frames de pantalla | 84 |
| Instancias en la sección | 1.627 · **0 rotas** (y 0 en la sección de componentes) |
| Solapes entre frames y textos de la sección | **0** |
| Solape con otras secciones de la página | **0** |
| Textos fuera de su frame o de su contenedor | **0** |
| Contenido que se sale del frame | **0** |
| Pinturas sin variable en nodos propios | **0** (todo con variables; los hex solo viven en la tabla de §8.1) |
| Marcas «Nuevo» | 27 |
| Nombres de organización | solo genéricos: «Mi empresa S.A.S.», «Distribuidora del Norte», «Café de la Esquina», «Taller Los Andes» |

Observaciones del chequeo visual (no son desbordes, pero hay que decidirlas):
- En móvil, `OrgSelectCard` trunca nombre y subtítulo aun ocultando el plan y el atajo de teclado:
  hace falta una variante móvil del componente (no se modificó el existente).
- `PhoneInput` (724:18240) **no respeta el modo oscuro**: el campo del número queda blanco
  (se ve en los frames oscuros de registro e invitación).
- El logo es un isotipo provisional («GO» sobre blanco); en código se usa el de marca.

---

## 9. Preguntas para el dueño (con recomendación)

1. **Personaje.** ¿Confirmas usar el viajero propio del sitio (inspirado en El Principito) y no
   los dibujos originales del libro? *Recomendación: sí; el original tiene derechos de autor y
   marca, y el sitio ya lo resolvió así.*
2. **Claro/oscuro.** ¿El día/noche sigue el tema elegido (claro = día, oscuro = noche) y, en
   automático, el del sistema operativo? ¿O prefieres que siga la hora local? *Recomendación: por
   tema, como pediste; la hora local confundiría a quien trabaja de noche con tema claro.*
3. **Fondo animado.** El 2026-09-22 pediste conservar el fondo con nubes. ¿Reemplazamos
   `AuthSceneBackground` por el cielo del viajero? *Recomendación: sí; de día conserva nubes,
   planeta y cohete animados, y en móvil y con reducción de movimiento queda estático.*
4. **Microsoft en web.** Hoy termina en un login vacío. ¿Lo quitamos de la web hasta arreglar el
   callback, o se arregla ya? *Recomendación: quitarlo en web ahora y dejarlo en la app.*
5. **Contraseña única.** Mínimo 10 caracteres, sin reglas de mayúsculas/símbolos, bloquear
   contraseñas filtradas (protección de Supabase) y distinta del correo, igual en registro,
   invitación, restablecer y perfil. *Recomendación: sí.*
6. **Enumeración.** Quitar el «Correo disponible» en vivo del registro y dar respuestas neutras
   en olvidé y verificación (si el correo ya existe, se avisa por correo). Cuesta un poco de
   inmediatez. *Recomendación: sí.*
7. **Bloqueo por intentos.** 5 fallos en 15 min por cuenta + IP → pausa de 15 min, contada en el
   servidor. *Recomendación: sí.*
8. **Registro: opción A o B** (§6 R5). *Recomendación: B — cuenta y verificación primero; la
   organización con el asistente compartido. No se pide tarjeta antes de confirmar el correo.*
9. **Selector de organización único** y saltarlo con una sola organización. *Recomendación: sí.*
10. **`/auth/session-expired`** pasa a redirección hacia el login con aviso. *Recomendación: sí.*
11. **Términos y privacidad** obligatorios al registrarse. *Recomendación: sí (tratamiento de
    datos personales); falta que existan las páginas de Términos y Privacidad enlazables.*
12. **2FA.** Hoy se activa y no se pide. ¿Implementamos el paso del código (TOTP de Supabase) o
    ocultamos el interruptor mientras tanto? *Recomendación: ocultarlo ya y diseñar el paso de
    código en una fase siguiente.*
13. **Tableta.** ¿Dividida (panel de 380 + formulario, dibujada) o banda arriba como en móvil?
    *Recomendación: dividida; en 1024 cabe y conserva la escena.*

---

## 10. Fuera de alcance (anotado para otras sesiones)

- **§4.1 invitación**: se dejó una tarea aparte para corregirla con test.
- `PhoneInput` sin modo oscuro y `OrgSelectCard` sin variante móvil (§8.4).
- Mensajes crudos de Supabase, catálogo de `?error=`, `redirectTo` sin validar, texto de
  `?message=` en pantalla, reset sin contraseña actual: van con la implementación, tras aprobar.
- La implementación en código (Next.js) empieza solo cuando el dueño apruebe en Figma.

---

## 11. v3 — V1 con el viajero (2026-09-29)

Comentario del dueño sobre la v2: «Lo que hiciste del auth V2 no me gustó. Yo quería como la V1 pero
con el Principito: estructúralo bien, me gusta así el formulario como flotando. […] que compartan
estructura con los otros componentes […] que reutilices componentes, que tengan una sincronía». Luego
precisó: «que sea una mezcla de v1 y v2 en auth».

Alcance: **solo Figma y este documento**; no se tocó código de la app. La v2 no se borró: quedó
marcada como descartada.

### 11.1 Qué viene de la V1 y qué de la v2

| De la V1 (secciones 1 a 5 de `08 Acceso y organización`) | De la v2 (sección 17, descartada) |
|---|---|
| Fondo a pantalla completa (antes `AuthScene` 352:137811) | El viajero y su cielo: día en tema claro, noche en tema oscuro |
| Marca a la izquierda con lema, descripción y tres viñetas con check | Selector de idioma y de tema arriba a la derecha |
| **El formulario en una tarjeta flotante centrada** (radio xl, `bg/surface`, `shadow/lg`, 32 px de relleno, 20 px entre bloques) | Pie con © · Términos · Privacidad · Ayuda |
| Orden de los campos y jerarquía título → descripción → campos → acción → «o» → Google → pie | Contenido y estados: mensaje único de credenciales, bloqueo por intentos, sesión vencida, «Entrando…», medidor de contraseña, registro por pasos, respuestas neutras, invitación en dos pasos, selector único de organización, sin Microsoft en la web |

V1 de referencia (node-ids):

| Sección V1 | Sección | Frames principales |
|---|---|---|
| 1. Entrar | 354:20 | listo 354:21 · error 354:171 · entrando 354:318 · sesión expirada 354:462 · móvil 354:608 y 354:742 |
| 2. Crear cuenta | 359:144425 | datos personales 359:144426 · correo ya registrado 359:144618 · revisa tu correo 359:144820 · móvil 359:144939 · aviso de confirmación 398:15951 |
| 3. Recuperar y restablecer | 359:145100 | recuperar 359:145101 · enviado 359:145187 · cuenta con Google 359:145276 · restablecer 359:145369 · enlace caducado 359:145475 · móvil 359:145559 |
| 4. Verificación, invitación y sesión expirada | 359:145645 | invitación datos 359:145646 · contraseña 359:145771 · aceptada 359:145884 · enlace caducado 359:145967 · correo confirmado 359:146059 · sesión expirada 359:146136 · móvil 359:146220 |
| 5. Selección de organización | 360:145468 | listo 360:145469 · sin resultados 360:145660 · cargando 360:145780 · sin organizaciones 360:145902 · error 360:146002 · móvil 360:146096 |

Estructura V1 medida en 354:21: `AuthScene` a sangre + `Marca` (56 px del borde, 493 px de ancho) +
`AuthCard` de 440 px centrada. La v3 conserva eso y corrige el único defecto visible de la V1: el texto
de la marca pasaba por debajo de la tarjeta (ahora la marca mide 360 px).

### 11.2 Figma — sección `18. Acceso v3 — V1 con el viajero (propuesta)`

[node 1131:44810](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1131-44810), página
`08 Acceso y organización`, debajo de la 17 (x 0, y 72807, 6668 de ancho). En el Índice (354:19) es la
línea 18 con hipervínculo; la línea 17 dice ahora «descartada por el dueño (2026-09-29)» y la sección
1073:675594 pasó a llamarse `17. Acceso (auth) v2 — con el viajero · DESCARTADA por el dueño`.

**Cada pantalla es un frame con solo dos instancias**: `EscenaAcceso` (fondo, en posición absoluta y
estirado) + `TarjetaAcceso` (centrada por auto-layout). Todo el contenido del formulario va dentro del
slot `Cuerpo` de la tarjeta y son instancias del kit. El frame fija el modo de variables (Claro → Light,
Oscuro → Dark) y crece si la tarjeta es más alta que 900 / 768 / 844.

| Fila | Pantalla | Frames | Primer frame (escritorio claro) |
|---|---|---|---|
| 1 | Iniciar sesión — listo | 6 | 1134:730116 |
| 1b | Iniciar sesión — error de credenciales | 4 (escritorio + móvil) | 1134:731646 |
| 1c | Iniciar sesión — bloqueado por intentos | 2 | 1134:732652 |
| 1d | Iniciar sesión — sesión vencida | 2 | 1134:733190 |
| 2 | Callback de Google — entrando | 6 | 1137:48524 |
| 3 | Registro 1 de 6 · Tu cuenta | 6 | 1137:49745 |
| 3b | Registro 2 de 6 · Tu organización (Ancha) | 2 | 1137:51660 |
| 3c | Registro 3 de 6 · Sucursal principal (Ancha) | 2 | 1137:52351 |
| 3d | Registro 4 de 6 · Plan (Plan, sin marca ni viajero) | 2 | 1138:52188 |
| 3e | Registro 5 de 6 · Método de pago | 2 | 1138:53081 |
| 3f | Registro 6 de 6 · Revisa tu correo | 4 | 1138:53600 |
| 4 | Olvidé mi contraseña | 6 | 1138:54493 |
| 4b | Olvidé mi contraseña — enviado | 4 | 1138:55715 |
| 5 | Restablecer contraseña — con fortaleza | 6 | 1138:741028 |
| 5b | Restablecer — éxito | 2 | 1138:742556 |
| 5c | Restablecer — enlace vencido | 2 | 1138:742994 |
| 6 | Verificar correo — el enlace falló | 6 | 1138:743452 |
| 6b | Verificar correo — enlace reenviado | 2 | 1138:744722 |
| 7 | Aceptar invitación — tus datos | 6 | 1139:747992 |
| 7b | Aceptar invitación — tu contraseña | 2 | 1139:749496 |
| 7c | Aceptar invitación — ya tienes cuenta | 2 | 1139:750078 |
| 8 | Selección de organización (Ancha) | 6 | 1139:750538 |
| 8b | Selección — sin organizaciones | 2 | 1139:752204 |

Composición por dispositivo (vive en `EscenaAcceso`, no en cada pantalla):
- **Escritorio 1440**: Firma arriba a la izquierda; marca con lema y viñetas (V1) en la columna
  izquierda; viajero abajo a la izquierda; planeta/luna y cohete del cielo a la derecha; idioma y tema
  en una píldora `bg/surface` arriba a la derecha; pie abajo al centro.
- **Tableta 1024**: Firma, píldora, viajero pequeño abajo a la izquierda y pie; sin lema (no cabe junto
  a la tarjeta).
- **Móvil 390**: Firma y píldora arriba, tarjeta de 358 px, viajero pequeño abajo al centro sobre el pie.

Las anotaciones «Nuevo» ya no van dentro de las pantallas: cada fila tiene su nota encima, con la
ruta, qué viene de la V1 (con su node-id) y qué de la v2.

### 11.3 Componentes — reutilizados, creados y ajustados

**Por qué la v2 se sentía suelta**: sus componentes vivían en una sección aparte
`Acceso v2 — El viajero y su cielo (Nuevo)` (1069:665482, en x 86000 de `02 Componentes`, lejos de
todo) y las pantallas tenían marcos sueltos con aspecto de componente: logo, «Idioma y tema», lema,
pie, barra de pasos, enlaces y el separador «o» eran frames y textos, no instancias. En la v3 no queda
ningún nodo suelto dentro de las pantallas (ver chequeo).

**Reutilizados sin cambios**: `Button` 9:343, `Checkbox` 50:2695, `SegmentedControl` 103:3064,
`Badge` 7:70, `SearchInput` 42:1191 (el buscador de organización es el mismo del resto del ERP: 40 px,
radio md, `Icon/Search`), `PlanOption` 395:10775, `ThemeToggle` 45:2067, `Divider` 7:71, `OAuthButton`
351:137865, `Isotipo` 5:10 e iconos de `Fundamentos › Iconos`.

**Reorganizados** (la sección suelta 1069:665482 quedó vacía y se eliminó; los componentes no se
duplicaron, se movieron con sus mismos ids y la v2 los sigue usando):

| Componente | Ubicación nueva | Cambio |
|---|---|---|
| `Ilustración/Viajero` 1069:665554 | `02 Componentes › Fundamentos › Ilustración · El viajero y su cielo` | Variantes `Pose=De pie/Sentado × Tema=Día/Noche`: Día 1069:665528 y 1069:665553 (modo Light fijo), Noche 1124:35281 y 1124:35317 (modo Dark fijo) |
| `Ilustración/Cielo` 1069:665724 (antes `Auth/Cielo`) | ídem | `Tema=Día` 1069:665586 · `Tema=Noche` 1069:665644; planeta y luna bajan 64 px para no quedar bajo la píldora; una estrella nocturna se movió para no pisar el lema |
| `Ilustración/Planeta` 1069:665563 · `Cohete` 1069:665575 · `Nube` 1069:665578 · `Luna` 1069:665582 · `Estrella` 1069:665585 | ídem | solo se movieron |
| `Firma` 5:19 | `Fundamentos` | nueva propiedad `Sobre=Superficie/Cielo` (1124:35341, 1124:35345): isotipo blanco y texto blanco sobre el cielo, en lugar del logo dibujado a mano de la v2 |

**Creados** (todos con variantes y propiedades, en la sección de su familia):

| Componente | Sección | Variantes · propiedades |
|---|---|---|
| `TarjetaAcceso` 1129:35496 | `Acceso` | `Ancho=Normal (440) / Ancha (560) / Plan (1000) / Móvil (358)` · Título, Descripción, Mostrar descripción, Mostrar pasos, Mostrar icono, Mostrar aviso, Mostrar pie · **slot `Cuerpo`** · instancias anidadas expuestas: `Pasos` (ProgresoPasos), `Icono` (IconoDestacado), `Aviso` (AuthAlert), `Pie` (PieEnlace) |
| `EscenaAcceso` 1129:36409 | `Acceso` | `Tema=Día/Noche × Dispositivo=Escritorio/Tableta/Móvil` (cada variante fija su modo) · Lema, Descripción, Mostrar marca, Mostrar viajero. Contiene Ilustración/Cielo, Ilustración/Viajero, Firma, LanguagePicker trigger, ThemeToggle y Enlace |
| `Enlace` 1125:35312 | `Átomos` | `Tono=marca/neutro/sobre-color × Tamaño=sm/md` · Texto, Icono, Icono (swap) |
| `DividerTexto` 1125:35314 | `Átomos` | Texto («o») entre dos `Divider` |
| `IconoDestacado` 1125:35346 | `Átomos` | `Tono=marca/éxito/advertencia/peligro/neutro` · Icono (swap) |
| `PieEnlace` 1125:35348 | `Átomos` | Pregunta, Mostrar pregunta · `Enlace` anidado expuesto |
| `ProgresoPasos` 1126:35349 | `Formularios` | `Actual=1…6` · Etiqueta, Seis pasos (apagado = dos pasos, para la invitación) |
| `MedidorFortaleza` 1126:35448 | `Formularios` | `Nivel=Vacía/Débil/Aceptable/Fuerte` · Requisito 1, 2 y 3 |
| `PhoneField` 1126:35450 | `Formularios` | Etiqueta (misma tipografía que `FormField`) · `PhoneInput` anidado expuesto |
| `LanguagePicker` `Layout=trigger` 1126:35468 | `Sesión` (en el set 78:3173) | Idioma; 32 px de alto, globo + idioma + chevron |

**Ajustados en el kit** (aditivo; se verificó que V1 y v2 siguen con 0 instancias rotas):
- `AuthAlert` 351:137890: propiedad `Mensaje`. Efecto secundario: las cuatro variantes muestran ahora
  el mismo texto por defecto; ninguna instancia existente dependía del texto por defecto (revisado en
  todo el archivo).
- `PasswordField` 351:137843: propiedades `Etiqueta` y `Mensaje`; el mensaje de error llena el ancho.
- `OrgSelectCard` 351:137970: propiedades `Inicial`, `Nombre`, `Detalle`, `Mostrar estrella`,
  `Mostrar distintivos`, `Mostrar atajo`; el bloque de texto crece y trunca con puntos suspensivos.
  Resuelve la falta de variante móvil anotada en §8.4.
- `PhoneInput` 724:18240: el campo del número usaba blanco fijo; ahora `bg/surface` (arregla el modo
  oscuro anotado en §8.4). El mensaje llena el ancho.
- `FormField` 50:2685 (texto de ayuda) y `Skeleton` 106:3394 (la barra) llenan el ancho.
- `OAuthButton`: se probó una propiedad de texto y se revirtió, porque el texto depende del proveedor.

Pendiente de aprobación (no se hizo): reemplazar `AuthScene` 352:137811 por `EscenaAcceso` en las
secciones V1, y `PasswordField State=fortaleza` (política vieja de 8 + 4 reglas) por
`PasswordField` + `MedidorFortaleza`.

### 11.4 Chequeo por script (2026-09-29)

| Comprobación | Resultado |
|---|---|
| Frames de pantalla | **84** (escritorio 1440, tableta 1024, móvil 390; claro y oscuro) |
| Instancias en la sección (incluido el contenido de los slots) | 2.716 · **0 rotas** |
| Raíz de cada pantalla | 84 de 84 con exactamente 2 instancias (`EscenaAcceso` + `TarjetaAcceso`) |
| Nodos sueltos dentro de los slots (texto, vector, rectángulo, grupo) | **0** · grupos 0 |
| Frames con nombre de un componente (señal de desanclado) | **0** · los 64 frames internos son contenedores de disposición (filas y columnas de instancias) |
| Marcas «Nuevo» dentro de las pantallas | **0** |
| Textos desbordados (fuera de su contenedor o de la tarjeta) | **0** (dos del móvil con error se corrigieron en `PasswordField`) |
| Textos con puntos suspensivos a propósito | 84 (nombre y detalle de `OrgSelectCard`; en móvil sí truncan) |
| Solapes entre frames y notas de la sección / con otras secciones | **0 / 0** |
| Tarjeta sobre marca, viajero, firma, preferencias o pie | **0** |
| Pinturas sin variable en los componentes nuevos | **0** |
| Componentes nuevos bloqueados u ocultos | 0 |
| V1 (217 instancias) y v2 (787) tras mover componentes | 0 rotas |
| Nombres de organización | solo genéricos: «Mi empresa S.A.S.», «Distribuidora del Norte», «Café de la Esquina», «Taller Los Andes». Cotejados contra la tabla `organizations` por SQL (sin traer nombres): ninguna coincidencia exacta; la frase genérica «mi empresa» aparece dentro del nombre de una organización, pero «Mi empresa S.A.S.» no coincide con ninguna |

Nota técnica para quien edite: en instancias dentro de un slot, Figma a veces no repinta el ancho
«rellenar» de los hijos hasta que se vuelve a tocar el tamaño; se hizo una pasada de refresco. Y la
opacidad de una pintura enlazada a variable no se propagaba a las instancias de `EscenaAcceso`: se usa
opacidad de capa.

Capturas: `docs/design/figma/81-auth-v3-*.png` (15: login escritorio claro y oscuro, tableta, móvil
oscuro, error en móvil, bloqueado, callback oscuro, registro 1, plan oscuro, restablecer en móvil,
invitación en tableta oscura, selección en móvil, sin organizaciones, `EscenaAcceso` y
`TarjetaAcceso`).

### 11.5 Preguntas para el dueño (con recomendación)

1. **Composición.** ¿Apruebas la estructura V1 con el viajero: marca a la izquierda, tarjeta flotante
   centrada, viajero abajo a la izquierda y planeta/cohete (o luna) a la derecha? *Recomendación: sí.*
2. **Pose de noche.** En oscuro el viajero va sentado mirando las estrellas (como en el sitio). ¿O de
   pie en ambos temas? *Recomendación: sentado; es la diferencia más clara entre día y noche.*
3. **Tableta.** Sin lema ni viñetas (no caben junto a la tarjeta de 440). ¿De acuerdo, o prefieres el
   lema arriba de la tarjeta? *Recomendación: sin lema.*
4. **Paso de plan.** Con la tarjeta de 1000 px la escena oculta marca y viajero. ¿De acuerdo?
   *Recomendación: sí; el plan necesita el ancho.*
5. **Móvil.** Viajero pequeño abajo, sobre el pie. ¿Lo dejamos o lo quitamos en móvil?
   *Recomendación: dejarlo; es estático y no estorba.*
6. **Reemplazos en el kit.** Al aprobar: `EscenaAcceso` sustituye a `AuthScene` y `MedidorFortaleza`
   sustituye a `PasswordField State=fortaleza`. *Recomendación: sí, en la misma aprobación.*
7. **Numeración.** La sección se llama `18. Acceso v3 — V1 con el viajero (propuesta)` para seguir la
   numeración del Índice. ¿Qué hacemos con la 17 cuando apruebes la 18? *Recomendación: moverla a
   `99 Archivo — versiones anteriores` en lugar de borrarla.*
8. Siguen abiertas las preguntas 1 a 13 de §9 (Microsoft en web, contraseña única, enumeración,
   bloqueo, registro A o B, selector único, sesión vencida, Términos, 2FA…): la v3 las dibuja con las
   mismas recomendaciones.
