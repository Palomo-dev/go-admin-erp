# Auditoría control por control — acceso, selección de organización y módulo Organización

Insumo para que el diseñador **calque la realidad** en Figma («GO Admin — Sistema de diseño»,
`EAvjINVRnlzFM70GVoWXgl`, página `08 Acceso y organización`). El dueño reporta (2026-09-22):
«Del login me gusta el fondo con las nubes y su animación, eso se conserva. Quiero organizar el
formulario del login, el de registro y el de crear organización. Y la selección de organización:
los favoritos casi no funcionan, marcas una favorita y al abrir en otro computador no aparece, ni
sale la principal arriba. Que el formulario de creación de organización sea el mismo que usa el
módulo de Organización, compartido.» Este documento baja al nivel de **cada control** —botón,
menú, pestaña, campo, toggle, chip, badge, tabla, diálogo, tooltip, atajo, estado— con su etiqueta
exacta, lo que hace, cuándo aparece y `archivo:línea`.

Fecha: 2026-09-22. Solo lectura de código; verificación del esquema (`organizations`, `branches`,
`organization_members`, `profiles`) y de los privilegios de `get_auth_provider_by_email` con
`SELECT` por el MCP de Supabase (`jgmgphmzusbluqhuqihj`). Sin nombres de organizaciones cliente:
los ejemplos son «Mi empresa S.A.S.» y «Distribuidora del Norte». Rutas relativas a `src/` salvo
que se indique.

Leyenda de **Tipo**: botón · menú (trigger o ítem) · pestaña · campo · toggle (switch/checkbox/
segmento) · chip (píldora clicable) · badge (solo lectura) · tabla · diálogo · tooltip · atajo ·
estado (vacío/cargando/error/aviso) · texto · stat (KPI) · paginación · toast · cálculo (regla sin
control visible). **Etiqueta exacta** es el literal del código con su acentuación (o su falta); el
acceso sí usa `messages/es.json` (espacio `auth.*`) y el módulo Organización usa `org.*`, así que
donde el texto viene de i18n se cita el texto español resuelto y la clave entre paréntesis.
**Cuándo aparece**: «Siempre» = incondicional dentro de su pantalla; breakpoints Tailwind
(`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280).

Índice: A. Acceso (`app/auth/**`: fondo animado, login, registro, recuperar, restablecer,
verificación, invitación, sesión expirada, acceso de super admin, selección de organización) ·
B. Los tres caminos de creación de organización comparados campo a campo · C. Módulo Organización
(`app/app/organizacion/**`) · D. Favoritos y organización principal (modelo persistente propuesto) ·
E. Lo roto o sin efecto · F. Planes y suscripción · G. Conteo de controles · H. Recomendación de
rediseño.

---

## A. Acceso — `app/auth/**`

### A.0 Capa compartida: layout, fondo animado y coste

El **fondo animado se conserva** por decisión del dueño. Vive en un único componente cliente,
`components/auth/AuthSceneBackground.tsx` (283 líneas), que se monta dentro de cada página de
`auth` (no en el layout) y dibuja SVG en línea sobre el degradado azul del contenedor.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | (sin texto) `AuthLayout` | Envuelve `/auth/**` con `bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100` | Siempre… pero **nunca se ve**: cada página pinta su propio `min-h-screen bg-gradient-…` encima | `app/auth/layout.tsx:1-11` |
| 2 | texto | (decorativo) Planeta con anillo y continentes | SVG 140×140, `opacity .25`; flota con `auth-float 8s` y los continentes giran con `auth-spin 30s` | Siempre, esquina superior derecha | `AuthSceneBackground.tsx:14-61` |
| 3 | texto | (decorativo) 11 nubes | 11 SVG de nube de 40 a 150 px de ancho, opacidad 0,10–0,25, cada una con `auth-cloud-drift` de 20 s a 55 s y `animationDelay` negativo para escalonarlas | Siempre; se desplazan de `translateX(-30px)` a `calc(100vw + 30px)` | `AuthSceneBackground.tsx:63-172` (grande 65-72 · mediana 74-82 · pequeña 84-92 · grande lenta 94-102 · mediana 104-112 · pequeña 114-122 · mini 124-132 · grande 134-142 · mediana 144-152 · pequeña 154-162 · mini 164-172) |
| 4 | texto | (decorativo) Cohete con estela | SVG 70×120 con tres llamas que parpadean (`auth-flicker` 0,25–0,3 s) y recorrido `auth-rocket-travel 12s` | Siempre, abajo a la derecha | `AuthSceneBackground.tsx:174-214` |
| 5 | texto | (decorativo) 16 estrellas | `div` redondos de 2–3 px con `auth-twinkle 3s` y retardos de 0 a 3 s | Siempre, repartidas por toda la pantalla | `AuthSceneBackground.tsx:216-250` |
| 6 | cálculo | `@keyframes` en `<style jsx>` | Define `auth-spin`, `auth-float`, `auth-cloud-drift`, `auth-rocket-travel`, `auth-twinkle`, `auth-flicker` | Siempre | `AuthSceneBackground.tsx:252-279` |

**Coste.** 29 elementos animados simultáneos (1 planeta + 1 grupo de continentes + 11 nubes +
3 llamas + 1 cohete + 16 estrellas = 33 animaciones CSS). Las nubes y el cohete animan `transform`
(compositable en GPU); el parpadeo de llamas y estrellas anima `opacity` (también compositable).
No hay `will-change`, no hay `@media (prefers-reduced-motion: reduce)` y no hay pausa cuando la
pestaña está oculta. El contenedor es `pointer-events-none` y `aria-hidden="true"`, así que no
interfiere con el teclado ni con los lectores de pantalla. El comentario de cabecera dice «Solo
visible en desktop (>= lg)» (`AuthSceneBackground.tsx:7`) pero **no hay ninguna clase que lo
oculte en móvil**: se pinta igual en 390 px, donde las 11 nubes cruzan un viewport estrecho y el
coste por píxel es mayor.

Páginas que montan el fondo: login (`app/auth/login/page.tsx:416`), signup
(`app/auth/signup/page.tsx:798`), forgot-password (`forgot-password/page.tsx:132`),
reset-password (`reset-password/page.tsx:156`), invite (`invite/page.tsx:113,125,187`),
verify/failed (`verify/failed/page.tsx:52,85`), verify/resent (`verify/resent/page.tsx:15`).
**No lo montan**: `select-organization` (fondo `bg-gray-50` plano,
`select-organization/page.tsx:311`), `session-expired` (`bg-blue-50`,
`session-expired/page.tsx:56`) ni `super-admin-access` (`bg-gray-50`,
`super-admin-access/page.tsx:92,103`). Es la incoherencia visual más visible del acceso.

### A.1 `/auth/login` — `app/auth/login/page.tsx` (880 líneas)

Cabecera: no usa `PageHeader`; es un panel partido 2/5 + 3/5 sobre el degradado. Estados: no hay
skeleton (el `Suspense` de nivel de página muestra un `<p>Loading...</p>` en inglés,
`login/page.tsx:870-876`).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `GO` / `Admin` | Logotipo grande del panel de marca | `lg` en adelante | 422-429 |
| 2 | texto | `¡Bienvenido de nuevo!` (`auth.login.welcomeBack`) | Título del panel de marca | `lg` en adelante | 430-432 |
| 3 | texto | `Ingresa tus credenciales para acceder` (`auth.login.subtitle`) | Subtítulo del panel de marca | `lg` en adelante | 433-435 |
| 4 | texto | `Gestiona tu negocio en un solo lugar` | Viñeta 1 de venta | `lg` en adelante | 438-445 |
| 5 | texto | `POS, inventario, CRM y más en una sola plataforma` | Viñeta 2 | `lg` en adelante | 446-453 |
| 6 | texto | `Reportes y analítica en tiempo real` | Viñeta 3 | `lg` en adelante | 454-461 |
| 7 | texto | `GO` / `Admin` (tarjeta) | Logotipo pequeño dentro de la tarjeta, con halo `animate-pulse` | Solo por debajo de `lg` (`lg:hidden`) | 471-490 |
| 8 | texto | `¡Bienvenido de nuevo!` (`auth.login.welcomeBack`) | Título de la tarjeta — **duplica el #2 en escritorio** | Siempre | 493-495 |
| 9 | texto | `Ingresa tus credenciales para acceder` | Subtítulo de la tarjeta — duplica el #3 | Siempre | 496-498 |
| 10 | estado | `{error}` en caja roja (`role="alert"`) | Muestra el error de acceso | Si `error && !emailNotConfirmed` | 503-514 |
| 11 | botón | `Crear una cuenta nueva` | Enlace a `/auth/signup` dentro del error | Solo si el texto del error **contiene** la cadena `El usuario no existe` | 506-512 |
| 12 | estado | `EmailNotConfirmedAlert` | Bloque de «cuenta sin verificar» con reenvío | Si `emailNotConfirmed` | 517-525 |
| 13 | campo | placeholder `tu@email.com` (`auth.login.emailPlaceholder`) | Correo, `type=email`, `autoComplete=email`, `required`, icono de persona a la izquierda | Siempre | 695-706 |
| 14 | cálculo | `onBlur` → `checkAuthProvider(email)` | Consulta la RPC `get_auth_provider_by_email` al salir del campo de correo | Si el correo pasa el regex | 210-217, `lib/auth/checkProvider.ts:7-22` |
| 15 | estado | `Esta cuenta está registrada con **{Google\|Microsoft}**. Usa el botón de {…} para iniciar sesión.` | Aviso ámbar bajo el correo | Si `oauthProvider` | 709-716 |
| 16 | campo | placeholder `Tu contraseña` (`auth.login.passwordPlaceholder`) | Contraseña, `autoComplete=current-password`, `required`, icono de candado | Siempre | 724-734 |
| 17 | botón | tooltip `Mostrar contraseña` / `Ocultar contraseña` | Alterna `type` entre `password` y `text` | Siempre | 735-753 |
| 18 | toggle | `Recordarme` (`auth.login.rememberMe`) | Checkbox; al enviar guarda correo **y contraseña** en `localStorage` ofuscados con `btoa().split('').reverse().join('')` | Siempre | 760-770 · escritura en 231-239 · lectura en 374-396 |
| 19 | botón | `¿Olvidaste tu contraseña?` (`auth.login.forgotPassword`) | Enlace a `/auth/forgot-password` | Siempre | 773-777 |
| 20 | botón | `Iniciar Sesión` / `Iniciando sesión...` (`auth.login.submit` / `submitting`) | Envía el formulario; `disabled` mientras `loading` | Siempre | 781-787 |
| 21 | texto | `¿No tienes cuenta?` + `Regístrate` (`auth.login.noAccount` / `signUp`) | Enlace a `/auth/signup` | Siempre | 790-797 |
| 22 | texto | `o` (`common.or`) | Separador con dos reglas | Siempre | 801-805 |
| 23 | botón | `Continuar con Google` (`auth.login.googleLogin`) | OAuth Google; `disabled` mientras `loading` | Siempre | 808-822 |
| 24 | botón | `Microsoft` | OAuth Microsoft — **etiqueta sin verbo y sin clave i18n**, asimétrica con el #23 | Siempre | 823-837 |
| 25 | botón | `Entrar con Face ID` / `Entrar con Huella` | Acceso biométrico con credenciales guardadas | Solo app móvil Capacitor con hardware y `canUseBiometricLogin()` | 840-852 · lógica 165-206 |
| 26 | estado | `{successMessage}` en caja verde + botón `Cerrar` | Mensaje de éxito (confirmación de correo) | Si `?success=email-confirmed&message=…` | 656-685 |
| 27 | diálogo | `GeolocationModal` | Pide preferencia de geolocalización 1 s después de cargar | Si no hay preferencia guardada en cookie | 858-863 · disparo 119-125 |
| 28 | diálogo | `Selecciona una organización` | Popup de elección de organización tras autenticarse | Si el usuario tiene **1 o más** organizaciones (`organizations.length >= 1`) | 528-652 · disparo `lib/auth/emailAuth.ts:116-119` y `158-161` |
| 29 | texto | `Tu cuenta está asociada a múltiples organizaciones.` | Subtítulo del popup — **miente cuando solo hay una** | Con el popup abierto | 537-539 |
| 30 | botón | (icono ✕) | Cierra el popup sin elegir; deja la sesión abierta sin organización | Con el popup abierto | 541-549 |
| 31 | campo | placeholder `Buscar organización...` | Filtra la lista por nombre (`includes`, minúsculas) | Solo si `userOrganizations.length > 3` | 553-568 · filtro 312-322 |
| 32 | botón | tooltip `Marcar como favorita` / `Quitar de favoritas` | Estrella; escribe `favoriteOrgIds` en `localStorage` | Por fila | 587-602 · lógica 286-295 |
| 33 | badge | Inicial del nombre o `logo_url` | Avatar de la organización | Por fila | 604-617 |
| 34 | texto | `{org.name}` + tipo de organización | Nombre y tipo traducido (`getOrgTypeLabel`) | Por fila | 620-627 |
| 35 | badge | `{plan}` o `Free` | Plan de la organización, píldora morada | Por fila | 631-633 |
| 36 | badge | `Activa` / `Congelada` / `Eliminada` / `Inactiva` | Estado de la organización | Por fila | 634-636 · mapeo 298-309 |
| 37 | estado | `No se encontraron organizaciones.` | Vacío del buscador — **sin acción** | Si el filtro no devuelve nada | 572-575 |
| 38 | texto | `Las organizaciones marcadas con ★ aparecen primero` | Pie del popup | Con el popup abierto | 645-649 |
| 39 | estado | `Tu sesión anterior ha expirado. Por favor, inicia sesión nuevamente.` | Aviso al venir de `?fromExpired=true`; además borra `rememberMe`, `userEmail` y `userPassword` | Con `?fromExpired=true` | 87-99 |
| 40 | estado | `Tu sesión estaba corrupta y ha sido limpiada. …` | Aviso con `?error=corrupted-session` | — | 110-111 |
| 41 | estado | `Hubo un problema con tu sesión anterior. …` | Aviso con `?error=session-parse-error` | — | 112-113 |
| 42 | estado | `Error en la autenticación: {details}` | Aviso con `?error=auth-failed&details=…` | — | 114-117 |
| 43 | estado | `Error al iniciar sesión con proveedor externo` | Aviso con `?error=auth-callback-failed` | — | 63-70 |
| 44 | estado | `Tu cuenta aún no ha sido verificada.` | Aviso con `?message=email-not-confirmed` | — | 72-77 |
| 45 | cálculo | `sessionStorage.setItem('redirectTo', …)` | Guarda el destino de `?redirectTo=` para después del acceso | Si viene el parámetro | 79-84 |
| 46 | estado | `Loading...` | *Fallback* del `Suspense` — **en inglés y sin marca** | Durante la hidratación | 870-876 |

**Mensajes de error que no se dibujan.** `lib/auth/emailAuth.ts` produce cuatro textos que el
formulario muestra tal cual: `Demasiados intentos. Espera unos minutos antes de volver a
intentar.` (211-215), `El usuario no existe o las credenciales son incorrectas. Por favor verifica
tu email y contraseña.` (218-223), `Tu cuenta aún no ha sido verificada.` (225-231) y `El usuario
no existe. ¿Quieres crear una cuenta nueva?` (233-238). Cualquier otro error de Supabase se
imprime crudo (`emailAuth.ts:240-243`), en inglés.

### A.2 `/auth/signup` — `app/auth/signup/page.tsx` (1.031 líneas) + `components/auth/RegistrationForm.tsx`

Asistente de **6 pasos** con un indicador de puntos dibujado a mano (no usa el `Stepper` del kit).
Los pasos 2 (Organización) y 3 (Sucursal) se comparan en la sección B.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Registro en GO Admin ERP` (`auth.signup.pageTitle`) | Título del panel de marca y de la tarjeta | Siempre | `signup/page.tsx:812-814`, `876-878` |
| 2 | texto | `Crea tu cuenta y la de tu organización en pocos minutos.` | Subtítulo del panel de marca | `lg` en adelante | 815-817 |
| 3 | texto | `1 Datos personales` … `6 Verificación de email` | Lista de los 6 pasos en el panel de marca | `lg` en adelante | 819-844 |
| 4 | estado | Indicador de 6 puntos numerados con conectores | Progreso del asistente, pintado a mano | Siempre | 886-912 |
| 5 | estado | `Configuración de cuenta` (`auth.signup.googleAccountSetup`) | Sustituye al título cuando se llega desde Google | `?google=true` | 876-878 |
| 6 | texto | `Cuenta de Google: {email}` (`auth.signup.googleAccount`) | Correo de la cuenta vinculada | `?google=true` | 879-883 |
| 7 | estado | `{error}` en caja roja | Error del paso actual | Si `error` | 915-919 |
| 8 | campo | `Nombre` (`auth.signup.firstName`) | Texto, `required` | Paso 1 | `RegistrationForm.tsx:188-199` |
| 9 | campo | `Apellido` (`auth.signup.lastName`) | Texto, `required` | Paso 1 | 202-213 |
| 10 | campo | `Correo electrónico` (`auth.signup.email`) | Correo, `required`; borde amarillo mientras comprueba, rojo si existe | Paso 1 | 218-234 |
| 11 | estado | `Verificando correo...` (`auth.signup.checkingEmail`) | Aviso durante el `POST /api/auth/check-email` (antirrebote 600 ms) | Al teclear un correo válido | 235-240 · lógica 62-90 |
| 12 | estado | `Este correo ya está registrado. Intenta iniciar sesión.` (`auth.errors.emailAlreadyExists`) | Bloquea el envío | Si la API responde `exists` | 241-246 |
| 13 | estado | `Correo disponible` (`auth.signup.emailAvailable`) | Confirmación verde | Correo válido y libre | 247-252 |
| 14 | campo | `Teléfono (opcional)` (`auth.signup.phone` + `common.optional`) | `PhoneInput` con prefijo de país | Paso 1 | 258-274 |
| 15 | campo | `Contraseña` (`auth.signup.password`) | Contraseña con botón de ojo | Paso 1 | 276-306 |
| 16 | texto | `Mínimo 8 caracteres` (`auth.signup.passwordRequirements`) | Única regla declarada | Paso 1 | 305 |
| 17 | campo | `Confirmar contraseña` (`auth.signup.confirmPassword`) | Contraseña con botón de ojo; valida coincidencia en vivo | Paso 1 | 308-337 · validación 106-125 |
| 18 | campo | `Foto de perfil (opcional)` (`auth.signup.profilePhoto`) | `FileUpload` al bucket `profiles`, máx. 2 MB, con previsualización | Paso 1 | 339-365 |
| 19 | campo | `Idioma preferido` (`auth.signup.preferredLanguage`) | `select` con 6 idiomas: `🇪🇸 es - Español`, `🇺🇸 en - English`, `🇧🇷 pt - Português`, `🇫🇷 fr - Français`, `🇩🇪 de - Deutsch`, `🇮🇹 it - Italiano` | Paso 1 | 367-385 |
| 20 | botón | `Continuar` (`common.continue`) / `Aceptar invitación` (`auth.signup.acceptInvitation`) | Envía el paso 1; `disabled` si `isLoading \|\| emailExists \|\| emailChecking` | Paso 1 | 402-410 |
| 21 | estado | `¡Bienvenido, {nombre}!` (`auth.signup.googleWelcome`) | Pantalla de bienvenida para cuentas de Google | Paso 1 con `?google=true` | `signup/page.tsx:933-955` |
| 22 | texto | `Tu cuenta de Google ha sido vinculada exitosamente. Ahora necesitas configurar tu organización.` | Explicación del caso Google | Paso 1 con `?google=true` | 944-946 |
| 23 | botón | `Continuar con la configuración` (`auth.signup.continueSetup`) | Avanza al paso 2 | Paso 1 con `?google=true` | 948-953 |
| 24 | pestaña | `OrganizationStep` | Paso 2 — ver sección B | Paso 2 | 957-965 |
| 25 | pestaña | `BranchStep` | Paso 3 — ver sección B | Paso 3 | 967-975 |
| 26 | pestaña | `SubscriptionStep` | Paso 4 — plan, periodo, `Usar días gratis` / `Pagar ahora`, cupón | Paso 4 | 977-985 |
| 27 | pestaña | `PaymentMethodStep` | Paso 5 — tarjeta Stripe, `Verificar Tarjeta`, `Omitir por ahora` | Paso 5 | 987-996 |
| 28 | pestaña | `VerificationStep` | Paso 6 — «¡Registro completado!», reenvío, próximos pasos. **Solo se alcanza si «Confirm email» estuviera activo en Supabase** | Paso 6 (hoy inalcanzable) | 998-1002 · condición en 744, 770-772 |
| 29 | texto | `¿Ya tienes cuenta?` + `Iniciar sesión` | Enlace a `/auth/login` | Siempre | 1005-1012 |
| 30 | cálculo | `?ref=VEND-001` | Guarda el código de vendedor para `seller_referrals` | Si viene el parámetro | 162-170 · uso 369-394 |
| 31 | estado | `Loading...` | *Fallback* del `Suspense`, en inglés | Hidratación | 1021-1027 |

**No existe ninguna casilla ni texto de aceptación de términos.** Las claves
`auth.signup.termsAgree`, `auth.signup.terms` y `auth.signup.privacy` están en `messages/es.json`
pero **ningún componente las usa** (verificado por `grep` en `src/`).

**El registro NO bloquea por confirmar el correo, y así debe quedar** (decisión del dueño, ya
tomada). El código contempla los dos caminos y hoy corre el segundo: si `authData.user
.email_confirmed_at` o `authData.session` existen —que es lo que ocurre con «Confirm email»
desactivado en Supabase—, `handleAuthSignup` crea los datos, **dispara el correo de confirmación
aparte y sin bloquear** (`supabase.auth.resend({type:'signup'})`, `signup/page.tsx:753-757`) y
redirige directo a `/app/inicio?welcome=true` (`:762`). El paso 6 (`VerificationStep`) solo se
alcanza por la rama residual de `:770-772`.

Lo que **falta** es la otra mitad: una vez dentro, **nada le recuerda al usuario que confirme el
correo**. No hay banner en el shell, ni aviso en el bloque de sesión, ni ningún punto donde
reenviarlo. `EmailConfirmedGate` existe pero solo se usa para **bloquear** el envío de
invitaciones (`InvitationsTab.tsx:936`) y el portal de facturación (`PlanTab.tsx:672`), con el
texto `Debes confirmar tu correo electrónico para invitar nuevos usuarios.` (`:835`): el usuario se
entera de que no confirmó el correo cuando ya está intentando hacer otra cosa.

### A.3 `/auth/forgot-password` — `app/auth/forgot-password/page.tsx` (234 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Recuperar contraseña` (`auth.forgotPassword.title`) | Título | Siempre | 135-137 |
| 2 | texto | `Ingresa tu correo para recibir instrucciones` (`auth.forgotPassword.subtitle`) | Subtítulo | Siempre | 138-140 |
| 3 | estado | `{message.text}` verde o rojo (`role="alert"`) | Resultado del envío | Tras enviar | 143-147 |
| 4 | campo | placeholder `Correo electrónico` (`auth.forgotPassword.email`), etiqueta `sr-only` | Correo, `required` | Siempre | 151-170 |
| 5 | botón | `Enviar instrucciones` / `Enviando...` (`submit` / `submitting`) | Envía; **no se deshabilita visualmente al margen de `disabled`** | Siempre | 174-181 |
| 6 | botón | `Volver al inicio de sesión` (`backToLogin`) | Enlace a `/auth/login` | Siempre | 183-187 |
| 7 | estado | `Por favor ingresa tu correo electrónico` | Validación de campo vacío | Al enviar sin correo | 44-50 |
| 8 | estado | `Por favor ingresa un correo electrónico válido` | Validación de regex | Al enviar con correo inválido | 52-58 |
| 9 | estado | `Esta cuenta está registrada con {proveedor}. No puedes restablecer la contraseña. Por favor, inicia sesión con {proveedor}.` | Bloquea el envío para cuentas OAuth | Si `checkAuthProvider` devuelve proveedor | 64-73 |
| 10 | estado | `Se ha enviado un correo con instrucciones para restablecer tu contraseña. Revisa tu bandeja de entrada y la carpeta de spam.` | Confirmación | Envío correcto | 81-85 |
| 11 | estado | `Correo enviado` (`successTitle`) + icono de sobre | Bloque de confirmación | Tras el primer envío | 192-204 |
| 12 | texto | `Hemos enviado las instrucciones a **{email}**` | Confirma el destinatario | Tras el primer envío | 202-204 |
| 13 | texto | `¿No recibiste el correo? Revisa tu carpeta de spam o correo no deseado.` | Ayuda | Tras el primer envío | 207-209 |
| 14 | botón | `Reenviar correo` / `Reenviando...` / `Reenviar en {n}s` | Reenvía con cuenta atrás de 60 s | Tras el primer envío | 211-226 · temporizador 25-39 |
| 15 | estado | `{err.message}` de Supabase | Error crudo del proveedor, en inglés | Si `resetPassword` falla | 90-94, 120-124 |

### A.4 `/auth/reset-password` — `app/auth/reset-password/page.tsx` (352 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Restablecer contraseña` (`auth.resetPassword.title`) | Título | Siempre | 159-161 |
| 2 | texto | `Ingresa tu nueva contraseña` (`subtitle`) | Subtítulo | Siempre | 162-164 |
| 3 | estado | `Enlace de recuperación válido. Puedes establecer tu nueva contraseña.` (`linkValid`) | Confirma el enlace | Al recibir `PASSWORD_RECOVERY` | 48-55 · caja 167-171 |
| 4 | estado | `El enlace de restablecimiento no es válido o ha expirado. Por favor solicita un nuevo enlace.` (`linkExpired`) | Bloquea el formulario | Sin sesión de recuperación | 34-38 |
| 5 | campo | `Nueva contraseña` (`newPassword`) | Contraseña con etiqueta y placeholder iguales | Con sesión | 177-214 |
| 6 | botón | (icono de ojo) | Muestra/oculta la nueva contraseña | Con sesión | 195-212 |
| 7 | estado | `Fortaleza de la contraseña:` + 5 píldoras `8+ caracteres`, `Mayúscula`, `Minúscula`, `Número`, `Especial` | Indicador en vivo; verde al cumplirse | Al escribir | 216-241 |
| 8 | campo | `Confirmar contraseña` (`confirmPassword`) | Contraseña con etiqueta y placeholder iguales | Con sesión | 243-281 |
| 9 | botón | (icono de ojo) | Muestra/oculta la confirmación | Con sesión | 262-279 |
| 10 | estado | `Las contraseñas coinciden` / `Las contraseñas no coinciden` | Indicador en vivo verde o rojo | Al escribir la confirmación | 283-308 |
| 11 | botón | `Actualizar contraseña` / `Actualizando...` (`submit` / `submitting`) | Envía | Con sesión | 313-319 |
| 12 | estado | `La contraseña debe tener {requisitos}` (`passwordMustHave`) | Error al no cumplir la política | Al enviar | 116-123 · reglas 80-100 |
| 13 | estado | `Tu contraseña ha sido actualizada correctamente` (`successMessage`) | Éxito; redirige a `/auth/login` a los 2 s | Tras actualizar | 135-143 |
| 14 | botón | `Solicitar un nuevo enlace de restablecimiento` (`requestNewLink`) | Enlace a `/auth/forgot-password` | **Sin** sesión | 322-327 |
| 15 | botón | `Volver al inicio de sesión` (`backToLogin`) | Enlace a `/auth/login` | Siempre | 330-334 |
| 16 | estado | `{err.message}` de Supabase o `Error al actualizar la contraseña` | Error | Si falla `updatePassword` | 144-148 |
| 17 | estado | `Loading...` | *Fallback* del `Suspense`, en inglés | Hidratación | 342-348 |

**La política de contraseña de esta pantalla (8 + mayúscula + minúscula + número + especial,
líneas 80-100) no es la del registro (solo `length < 8`, `RegistrationForm.tsx:167-173`) ni la de
la invitación (solo 8, `InvitationWizard.tsx:100-102`).** Tres políticas distintas para la misma
cuenta.

### A.5 Verificación — `app/auth/verify/failed/page.tsx` (157) y `app/auth/verify/resent/page.tsx` (76)

`verify/failed`:

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `El enlace ha expirado` | Título de la tarjeta | Estado `idle` / `error` | 87-91 |
| 2 | estado | `El enlace de acceso ya fue utilizado o ha expirado. Esto puede ocurrir cuando tu cliente de correo (Gmail, Outlook) abre el enlace automáticamente por seguridad antes de que hagas clic.` | Aviso ámbar | Estado `idle` / `error` | 93-99 |
| 3 | texto | `Ingresa tu correo y te enviaremos un nuevo enlace para aceptar la invitación:` | Instrucción | Estado `idle` / `error` | 101-104 |
| 4 | campo | placeholder `tu@correo.com` | Correo, `required`, sin etiqueta visible | Estado `idle` / `error` | 107-115 |
| 5 | estado | `{errorMsg}` o `Error de conexión. Intenta nuevamente.` | Error del reenvío | Estado `error` | 117-121 · 42-45 |
| 6 | botón | `Reenviar enlace` / `Enviando...` | `POST /api/auth/invite/resend` | Estado `idle` / `error` | 123-129 |
| 7 | botón | `Ir al inicio de sesión` | Enlace `<a>` a `/auth/login` | Siempre | 133-138, 70-75 |
| 8 | estado | `Revisa tu correo` + `Si hay una invitación pendiente para **{email}**, acabamos de enviar un nuevo enlace. Revisa tu correo (y spam) y haz clic en "Acceder a mi cuenta".` | Confirmación verde | Estado `sent` | 49-79 |
| 9 | cálculo | `?type=` | Se lee en `searchParams` pero **no se usa en ninguna parte del render** | — | 11 |
| 10 | estado | `Loading...` | *Fallback* del `Suspense`, en inglés | Hidratación | 147-153 |

`verify/resent`:

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 11 | texto | `Enlace reenviado` | Título | Siempre | 17-21 |
| 12 | estado | `Hemos enviado un nuevo enlace de acceso a tu correo` + `{email}` | Confirmación verde | Siempre; el correo solo si viene `?email=` | 23-39 |
| 13 | texto | `Revisa tu bandeja de entrada (y la carpeta de spam) y haz clic en el botón **"Acceder a mi cuenta"** del nuevo correo.` | Instrucción | Siempre | 40-43 |
| 14 | texto | `Si el enlace no funciona nuevamente, es posible que tu cliente de correo (Gmail, Outlook) lo esté abriendo automáticamente por seguridad. En ese caso, copia el enlace del correo y pégalo directamente en tu navegador.` | Ayuda | Siempre | 44-49 |
| 15 | botón | `Ir al inicio de sesión` | Enlace `<a>` a `/auth/login` | Siempre | 52-57 |
| 16 | estado | `Loading...` | *Fallback* del `Suspense`, en inglés | Hidratación | 66-72 |

Ninguna de las dos usa `auth.verify.*` de `messages/es.json`: las seis claves
(`title`, `subtitle`, `resend`, `resending`, `checkInbox`, `didntReceive`) están **muertas**.

### A.6 `/auth/invite` — `app/auth/invite/page.tsx` (210) + `components/auth/InvitationWizard.tsx` (749)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `Validando invitación...` (`auth.invite.validating`) | Spinner mientras valida el código | Carga | `invite/page.tsx:110-120` · 73 |
| 2 | estado | `Iniciando sesión automáticamente...` (`autoSignIn`) | Segundo mensaje de carga | Tras validar | 94 |
| 3 | estado | `Código de invitación no proporcionado` (`noCode`) | Error sin `?invite_code` | — | 49-54 |
| 4 | estado | `La invitación no es válida, ha expirado o ya fue utilizada` (`invalidOrExpired`) | Error 404 de `/api/auth/invite/context` | — | 79-83 |
| 5 | estado | `Error al validar la invitación: {message}` (`errorValidating`) | Error de la API, con el mensaje crudo | — | 84-88 |
| 6 | estado | `Error al procesar la invitación` (`errorProcessing`) | Error inesperado | — | 103-107 |
| 7 | texto | `Error en la invitación` (`errorTitle`) | Título de la tarjeta de error | Con error | 128 |
| 8 | botón | `Reintentar` (`common.retry`) | `window.location.reload()` | Con error | 145-150 |
| 9 | botón | `Ir al inicio de sesión` (`goToLogin`) | Navega a `/auth/login` | Con error | 151-156 |
| 10 | estado | `Configurando tu cuenta...` (`settingUp`) | Caso residual sin datos ni error | Raro | 185-192 |
| 11 | estado | Indicador de pasos `Datos Personales` · `Contraseña` · `Completado` | Progreso del asistente para cuenta nueva | `accountState === 'nueva'` | `InvitationWizard.tsx:690-692` |
| 12 | estado | Indicador de pasos `Confirmar Datos` · `Completado` | Progreso para cuenta existente | Cuenta existente | 686-687 |
| 13 | texto | `¡Bienvenido!` / `Confirmar Invitación` | Título del paso 1 | Paso 1 | 375 |
| 14 | texto | `**Email:** {email}` | Correo invitado, no editable | Paso 1 | 407 |
| 15 | campo | (nombre, apellido, teléfono) | Datos personales de la invitación | Paso 1 | validación 79-89 |
| 16 | estado | `El nombre es obligatorio` / `El apellido es obligatorio` / `El teléfono es obligatorio` / `Formato de teléfono inválido` | Validaciones del paso 1 | Al continuar | 79-89 |
| 17 | botón | `Continuar` / `Aceptar Invitación` | Avanza o acepta según el estado de cuenta | Paso 1 | 494 |
| 18 | texto | `Crear Contraseña` | Título del paso 2 | Paso 2 (cuenta nueva) | 503 |
| 19 | estado | `La contraseña es obligatoria` / `La contraseña debe tener al menos 8 caracteres` / `Confirma tu contraseña` / `Las contraseñas no coinciden` | Validaciones del paso 2 | Al enviar | 100-110 |
| 20 | botón | `Completar Registro` | Crea la cuenta y acepta la invitación | Paso 2 | 611 |
| 21 | texto | `Ya tienes cuenta en GO Admin` | Pantalla para sesión de otro usuario | Sesión ajena | 621 |
| 22 | botón | `Cerrar sesión e iniciar como {email}` / `Iniciar sesión para aceptar` / `Un momento…` | Cambia de cuenta para aceptar | Sesión ajena | 648 |
| 23 | texto | `¡Invitación Aceptada!` / `¡Registro Completado!` | Paso final | Paso 3 | 660 |
| 24 | texto | `Te has unido a **{organización}** exitosamente` / `Tu cuenta ha sido creada exitosamente en **{organización}**` | Confirmación | Paso 3 | 664-665 |
| 25 | botón | `Entrar ahora` / `Abriendo la organización…` | `window.location.assign('/app/inicio')` | Paso 3 | 678 · 173-179 |
| 26 | estado | `Error del servidor. Intenta recargar la página.` | Error 5xx de `/api/auth/accept-invitation` | — | 320 |
| 27 | estado | `No se pudo completar el registro` / `{result.error}` | Error de negocio de la API | — | 335 |
| 28 | estado | `Error inesperado al procesar la invitación` | Captura general | — | 292 |
| 29 | estado | `Loading...` | *Fallback* del `Suspense`, en inglés | Hidratación | `invite/page.tsx:200-206` |

### A.7 `/auth/session-expired` — `app/auth/session-expired/page.tsx` (100 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | badge | (icono ✕ ámbar en círculo) | Marca visual del estado | Siempre | 59-65 |
| 2 | texto | `Sesión expirada` (`auth.sessionExpired.title`) | Título | Siempre | 66-68 |
| 3 | texto | `Tu sesión ha expirado. Por favor, inicia sesión nuevamente.` (`subtitle`) | Subtítulo | Siempre | 69-71 |
| 4 | botón | `Ir al inicio de sesión` (`login`) | Navega a `/auth/login?fromExpired=true`, con spinner | Siempre | 75-89 |
| 5 | botón | `Ir al inicio de sesión` (`login`) — **misma clave, segundo enlace** | Enlace a `/` (la raíz), no al login | Siempre | 91-95 |
| 6 | cálculo | `clearAuthData()` | Borra `rememberMe`, `userEmail`, `currentOrganizationId`, `currentOrganizationType`, la cookie `sb-…-auth-token` y `go-admin-user-id`, y hace `signOut({scope:'local'})` | Al montar | 20-47 |

La pantalla **no monta `AuthSceneBackground`** (fondo `bg-blue-50` plano, línea 56) y
`clearAuthData()` **no borra `userPassword`**, que sí se escribió al entrar con «Recordarme»
(`login/page.tsx:233`).

### A.8 `/auth/super-admin-access` — `app/auth/super-admin-access/page.tsx` (136 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `Accediendo a la organización...` | Spinner mientras canjea el token | Carga | 90-98 |
| 2 | estado | `Token no proporcionado` | Error sin `?token=` | — | 19-23 |
| 3 | estado | `Acceso denegado` + `{error}` | Tarjeta de error | Con error | 101-118 |
| 4 | estado | `Error al establecer la sesión` | Fallo de `setSession` | — | 47-52 |
| 5 | estado | `Error inesperado al procesar el acceso` | Captura general | — | 80-84 |
| 6 | botón | `Volver al panel de administración` | Enlace externo a `https://admin.goadmin.io` | Con error | 112-114 |
| 7 | cálculo | `superAdminImpersonating`, `superAdminName`, `superAdminUserId`, `superAdminOrgId` en `localStorage` + `profiles.last_org_id` | Marca la suplantación y fija la organización | Éxito | 57-70 |
| 8 | estado | `Cargando...` | *Fallback* del `Suspense` | Hidratación | 126-131 |

### A.9 `/auth/select-organization` — `app/auth/select-organization/page.tsx` (466 líneas)

Es la pantalla del enunciado del dueño. **No comparte nada con el popup del login** (A.1 #28-#38):
son dos listas distintas, con datos distintos, orden distinto y sin buscador aquí.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Skeleton de cabecera + 2 tarjetas + botón | Carga | `loading` | 273-308 |
| 2 | badge | (icono de edificio azul en círculo) | Marca visual | Listo | 314-318 |
| 3 | texto | `Selecciona una organización` (`auth.selectOrganization.title`) | Título | Listo | 319-321 |
| 4 | texto | `Elige una organización para continuar o crea una nueva.` (`subtitle`) | Subtítulo | Listo | 322-324 |
| 5 | estado | `{error}` en caja roja | Error de carga o de selección, con el mensaje crudo de Supabase | Si `error` | 327-340 |
| 6 | botón | tooltip / `aria-label` `Marcar como favorita` / `Quitar de favoritas` | Estrella; escribe `favoriteOrgIds` en `localStorage` | Por fila | 357-373 · lógica 48-58 |
| 7 | badge | Inicial o `logo_url` | Avatar de la organización | Por fila | 376-388 |
| 8 | texto | `{org.name}` | Nombre | Por fila | 392 |
| 9 | texto | `{type_name}` | Tipo traducido | Por fila | 393 |
| 10 | badge | `{plan_name}` o `Free` | Plan de la suscripción activa | Por fila | 398-400 |
| 11 | badge | `Activa` / `Congelada` / `Eliminada` / `Inactiva` | Estado | Por fila | 401-403 · mapeo 61-72 |
| 12 | botón | (toda la fila) | Selecciona la organización: escribe `profiles.last_org_id`, `guardarOrganizacionActiva` y `proceedWithLogin` | Por fila | 347-355 · lógica 224-267 |
| 13 | texto | `o` (`common.or`) | Separador | Listo | 410-418 |
| 14 | botón | `Crear nueva organización` (`createNew`) | Navega a `/auth/signup?step=organization&google=true` | Listo | 420-431 · 269-271 |
| 15 | cálculo | Orden: favoritas primero | `sort` por pertenencia a `favoriteOrgIds` | Siempre | 75-81 |
| 16 | cálculo | Hidratación de sesión OAuth | Lee `?_oauth=`, luego la cookie `go-admin-oauth-session` (hasta 3 `decodeURIComponent`), luego `getSession()`; borra siempre la cookie para evitar el HTTP 431 | Al cargar y al seleccionar | 88-151 |
| 17 | cálculo | Redirección sin organizaciones | Si `memberData` está vacío, **redirige a `/auth/signup?step=organization&google=true`** sin mostrar nada | Sin organizaciones | 191-195 |
| 18 | estado | Skeleton del `Suspense` | Carga previa a la hidratación | Hidratación | 440-462 |

**Lo que esta pantalla no tiene y el popup del login sí:** buscador (`login/page.tsx:553-568`),
pie «Las organizaciones marcadas con ★ aparecen primero» (`login/page.tsx:645-649`) y botón de
cierre. **Lo que ninguna de las dos tiene:** rol del usuario en cada organización, distintivo de
«principal», sucursales, atajos de teclado, y un estado vacío real («no perteneces a ninguna
organización»). Las claves `auth.selectOrganization.noOrgs` («No tienes organizaciones
asignadas»), `loadingOrgs` y `selecting` existen en `messages/es.json` y **no se usan**.

---

## B. Los tres caminos de creación de organización, campo a campo

El dueño pide **un único formulario compartido**. Hoy hay **tres caminos vivos en el navegador**,
más un cuarto en el servidor y un quinto muerto:

| Camino | Punto de entrada | Cadena de componentes |
|---|---|---|
| 1. Diálogo del selector | Cabecera / `OrganizationSelector` | `components/common/OrganizationSelector.tsx:274` y `:360` → `CreateOrganizationDialog` → `CreateOrganizationWizard` |
| 2. Pestaña de gestión | `/app/organizacion/mis-organizaciones` | `components/organization/ManageOrganizationsTab.tsx:142` → `CreateOrganizationWizard` |
| 3. Registro | `/auth/signup` paso 2 | `app/auth/signup/page.tsx:958` → `components/auth/OrganizationStep.tsx:167` → `CreateOrganizationForm` |
| 4. Servidor (duplicado) | `/auth/callback` tras verificar el correo | `app/auth/callback/route.ts:357-509` — repite el mismo código con **otro orden** de escritura |
| 5. Muerto | — | `lib/services/organizationService.ts:217-251` (`createOrganization`, sin consumidores) |

**`CreateOrganizationForm` nunca crea nada.** Sus dos únicos consumidores le pasan
`isSignupMode={true}` (`CreateOrganizationWizard.tsx:375`, `OrganizationStep.tsx:202`), así que
sus líneas 361-411 —el `insert` de la organización, la membresía y `last_org_id`— son **código
inalcanzable**. Con ellas mueren `fetchPlans` (225-243), el paso 3 de plan (1055-1101), la
validación de plan (304-306) y, lo más grave, **la obligatoriedad del NIT** (289-291).

**No existe `app/api/organizations/**` ni ninguna RPC de creación.** Los tres caminos escriben en
`organizations`, `organization_members`, `branches`, `member_branches`, `subscriptions` y
`profiles` **desde el navegador, en 3 a 12 llamadas sueltas sin transacción**.

### B.1 Qué pide cada camino

`CreateOrganizationForm` es el formulario de captura; las columnas «Wizard» y «OrganizationStep»
indican si el campo **sobrevive** hasta el `insert` de cada camino.

| Campo (columna de BD) | CreateOrganizationForm (captura) | CreateOrganizationWizard | OrganizationStep → signup | ¿Obligatorio en BD? |
|---|---|---|---|---|
| `name` | Sí, requerido (`:598`) | Sí (`:350` → insert `:130`) | Sí (`OrganizationStep:173` → `signup:311`) | **Sí** (NOT NULL) |
| `legal_name` | Sí, requerido (`:599`) | Sí, fallback `name` (`:131`) | Sí, fallback `name` (`signup:312`) | **Sí** (NOT NULL) |
| `type_id` | Sí, requerido, `select` (`:601-630`) | Sí, fallback `2` (`:132`) | Sí, fallback `2` (`signup:313`) | No |
| `email` | Sí, requerido + regex (`:633-673`) | Sí, fallback correo del usuario (`:134`) | Sí, fallback correo (`signup:314`) | No |
| `tax_id` | Sí, requerido **solo si no es signup** (`:675-714`) | Sí (`:137`) | Sí (`signup:316`) | No |
| `nit` | No se pide: se copia de `tax_id` (`:689`) | Sí (`:138`) | Sí (`signup:317`) | No |
| `dv` | Sí, autocalculado y editable (`:716-736`) | **—** se pierde (no está en `WizardData` ni en el insert) | Sí (`OrganizationStep:186` → `signup:318`) | No |
| `phone` | Sí (`:738`) | Sí (`:135`) | Sí (`signup:319`) | No |
| `description` | Sí (`:876-888`) | Sí (`:133`) | Sí (`signup:315`) | No |
| `address` | Sí (`:892`) | Sí (`:139`) | Sí (`signup:320`) | No |
| `country` / `country_code` | Sí, `select` de `countries` (`:895-920`) | Sí, fallback Colombia/COL (`:142-143`) | Sí, mismos fallbacks (`signup:323-324`) | No (default `'Colombia'`) |
| `state` | Sí, derivado del municipio (`:923-948`) | Sí (`:141`) | Sí (`signup:322`) | No |
| `city` | Sí, derivado del municipio (`:951-968`) | Sí (`:140`) | Sí (`signup:321`) | No |
| `municipality_id` | Sí (`:956`, payload `:345`) | Sí (`:144`) | **—** `OrganizationStep:171-192` no lo mapea → siempre `null` (`signup:325`) | No |
| `postal_code` | Sí (`:970`) | Sí (`:145`) | Sí (`signup:326`) | No |
| `website` | Sí (`:1049`) | Sí (`:136`) | Sí (`signup:336`) | No |
| `subdomain` | Sí, autogenerado + chequeo de disponibilidad (`:974-1047`) | Sí (`:148`) | Sí (`signup:330`) | No |
| `primary_color` / `secondary_color` | Sí, paleta + selector (`:741-863`) | Sí, fallbacks `#3B82F6` / `#F59E0B` (`:146-147`) | Sí, mismos fallbacks (`signup:328-329`) | No |
| `logo_url` | Sí, `LogoUploader` (`:590-594`) | Sí (`:149`) | Sí (`signup:331`) | No |
| `plan_id` (en `organizations`) | Paso 3 con planes reales (`:1055-1101`) — **inalcanzable** | **—** no lo escribe; solo toca `subscriptions` (`:291-301`) | Sí (`signup:313` y otra vez `:607-610`) | No |
| `status` | No se pide; se fija `'active'` (`:375`) | No se pide; `'active'` (`:152`) | No se pide; `'active'` (`signup:333`) | No (default) |
| `owner_user_id` / `created_by` | De la sesión (`:374`, `:376`) | De la sesión (`:150-151`) | Del usuario recién creado (`signup:332`) | No |
| `timezone` | **—** | **—** | **—** | **Sí** (NOT NULL, default `America/Bogota`) |
| `custom_domain` | **—** | **—** | **—** | No |
| `registration_code` | **—** | **—** | **—** | No |
| `economic_activity` | **—** | **—** | **—** | No |
| `fiscal_responsibilities[]` | **—** | **—** | **—** | No |
| `graphic_representation_name` | **—** | **—** | **—** | No |
| Sucursal inicial | **—** (no toca `branches`) | Sí, `BranchStep` (`:379-387`) | Sí, `BranchStep` (`signup:966-973`) | `branches.name`, `branch_code`, `organization_id` NOT NULL |
| Plan / suscripción | Paso 3 inalcanzable | `SubscriptionStep` (`:389-397`) | `SubscriptionStep` (`signup:985`) | — |
| Método de pago | **—** | `PaymentMethodStep` (`:399-416`) | `PaymentMethodStep` (`signup:996`) | — |
| Invitar equipo | **—** | **—** | **—** | — |

Los campos fiscales colombianos que la facturación electrónica necesita (`economic_activity`,
`fiscal_responsibilities`, `registration_code`, `graphic_representation_name`) **no los pide
ningún camino**, y `timezone` tampoco, aunque el selector de país sí permite elegir un país
distinto de Colombia.

### B.2 Qué valida cada camino

| Campo | CreateOrganizationForm | Wizard | OrganizationStep / signup |
|---|---|---|---|
| `name` | Requerido, `trim()` — `CreateOrganizationForm.tsx:281` | Hereda | Hereda |
| `legal_name` | Requerido, `trim()` — `:282` | Hereda | Hereda |
| `type_id` | Requerido — `:283` | Fallback silencioso a `2` — `CreateOrganizationWizard.tsx:132` | Fallback silencioso a `2` — `signup/page.tsx:313` |
| `email` (organización) | Requerido + regex — `:284-287` | Ninguna | Ninguna |
| `tax_id` | Requerido **solo si `!isSignupMode`** — `:289-291`; como ambos consumidores pasan `true`, **nunca se exige** | Ninguna | Ninguna |
| `dv` | `maxLength={1}`, sin validar el dígito — `:724` | No lo transporta | `parseInt(..., 10)` sin validar — `signup:318` |
| `subdomain` | Disponibilidad contra la BD `:125-151`; «ya está en uso» `:296-298`; mínimo 3 `:299-301`; botón bloqueado `:1136` | Ninguna | Ninguna |
| `website` | `type="url"` **sin efecto** (ver B.4) — `:1049` | Ninguna | Ninguna |
| `phone` | Ninguna — `:738` | Ninguna | Ninguna |
| Colores | Ninguna (solo el selector) — `:741-863` | Fallback | Fallback |
| Plan | Requerido en el paso 3 — `:304-306` (inalcanzable) | Ninguna: se infiere del *string* — `:237-246` | Ninguna: se infiere igual — `signup:509-517` |
| `branch.name` | — | `required` en `BranchForm.tsx:323`, **sin efecto** (sin `<form>`, `BranchForm.tsx:901-902`) | Ídem |
| `branch_code` (NOT NULL) | — | **Sin `required` ni validación** — `BranchForm.tsx:332`; solo lo salva el fallback `'MAIN-001'` (`CreateOrganizationWizard.tsx:193`) | Fallback `'MAIN-001'` (`signup:428`) |
| Dominios de la sucursal | — | Sí, `BranchForm.tsx:217-245` | Las mismas |
| `invitationCode` | — | — | Requerido — `OrganizationStep.tsx:89-92` |
| Correo del usuario | — | — | Duplicado contra `/api/auth/check-email` — `signup:231-256` |
| `timezone` | — | — | — |

### B.3 Qué escribe cada camino

| | CreateOrganizationForm (muerto) | CreateOrganizationWizard | signup (OrganizationStep) |
|---|---|---|---|
| `organizations` INSERT | `:369-379`, payload `:333-355` | `:127-155` — 20 columnas, **sin `dv` ni `plan_id`** | `signup:308-334` — 24 columnas, con `dv` y `plan_id` |
| `organization_members` INSERT | `:386-394` (`role_id: 2`, `is_super_admin: true`, `is_active: true`) | `:161-169` (idéntico) | `signup:352-364` (idéntico), **antes** de tocar `branches` por RLS |
| `branches` UPDATE (la crea un trigger) | **No la toca** | `:189-213`, con `manager_id`, `is_main`, `is_active`; **sin** `is_web_stock_source` | `signup:425-450` (con `is_web_stock_source: true`) **más un segundo UPDATE** solo para `manager_id` (`signup:461-465`) |
| `member_branches` INSERT | **No** | `:219-231` (falla en silencio) | `signup:475-495` (falla en silencio) |
| `subscriptions` UPDATE (la crea un trigger) | **No** | `:291-301` | `signup:594-598` |
| `organizations.plan_id` (segunda pasada) | — | **No** | `signup:607-610` |
| `profiles.last_org_id` | `:401-404` (solo advertencia) | `:173` (**sin comprobar el error**) | `signup:402-404` **y otra vez** `:616-619` |
| `sellers` / `seller_referrals` | — | — | `signup:367-397` |
| Llamada a Stripe | — | `POST /api/stripe/create-subscription` `:259-284`, **no bloqueante** | Ídem `signup:531-560` |
| Organización activa en el cliente | — | `guardarOrganizacionActiva` `:172` | `guardarOrganizacionActiva` `signup:401` |
| **¿Transaccional?** | **No** — 3 llamadas | **No** — 8 llamadas + 1 `fetch` a Stripe | **No** — 12 llamadas + 1 `fetch` a Stripe |
| **Cliente** | Navegador (`@/lib/supabase/config`) | Navegador | Navegador (`signup:15`) |

### B.4 En qué se contradicen

1. **El DV se calcula y se pierde.** `CreateOrganizationForm.tsx:39-50` lo calcula y `:716-736` lo muestra; `signup/page.tsx:318` lo guarda, pero `CreateOrganizationWizard.tsx:349-369` no lo mapea y `:127-153` no lo inserta. Crear desde el diálogo deja la organización sin dígito de verificación.
2. **El municipio se pierde en el camino inverso.** `CreateOrganizationForm.tsx:345` lo emite y `CreateOrganizationWizard.tsx:144` lo guarda, pero `OrganizationStep.tsx:171-192` no lo mapea: `signup/page.tsx:325` inserta siempre `null`.
3. **`plan_id` en `organizations`.** `signup/page.tsx:313` y `:607-610` lo escriben; `CreateOrganizationWizard.tsx:127-153` no. El panel de super admin ve `plan_id` vacío en las organizaciones creadas desde el diálogo.
4. **`is_web_stock_source`.** `signup/page.tsx:443` lo pone en `true` en la sucursal principal; `CreateOrganizationWizard.tsx:189-210` no lo toca.
5. **`state_code` de la sucursal.** Lo escriben `CreateOrganizationWizard.tsx:199` y `signup/page.tsx:435`, pero no `auth/callback/route.ts:394-415`.
6. **Los identificadores de plan están cableados y con tres reglas distintas.** `CreateOrganizationWizard.tsx:237-246` usa `includes` → 5/3/2; `signup/page.tsx:300-301` usa `includes` → 5/3/2; `auth/callback/route.ts:351` usa `startsWith` → 5/3/2/**1**.
7. **Orden de escritura distinto (riesgo de RLS).** `signup/page.tsx:352-364` inserta la membresía **antes** de tocar `branches`, con un comentario explícito sobre RLS; `auth/callback/route.ts:430` actualiza la sucursal **antes** de crear la membresía.
8. **Número de pasos incoherente.** `CreateOrganizationForm.tsx:94` declara 2 pasos en modo registro y 3 en modo directo; el diálogo muestra 4 (`CreateOrganizationWizard.tsx:311`) y el registro 6 (`signup/page.tsx:957-1002`). El usuario ve tres numeraciones del mismo trámite.
9. **El paso «Plan» existe dos veces con datos distintos.** `CreateOrganizationForm.tsx:225-243` lee `plans` de la BD; `SubscriptionStep` trabaja con un *string*. Prevalece el *string*.
10. **La sucursal solo se crea en dos de los tres caminos.** `CreateOrganizationForm` en modo directo (`:369-411`) no toca `branches`.
11. **`last_org_id` se escribe una vez en el diálogo (`:173`) y dos en el registro (`:402-404`, `:616-619`)**, y solo el camino muerto comprueba el error (`CreateOrganizationForm.tsx:406-408`).

### B.5 Propuesta: un solo asistente compartido

`OrganizationOnboarding`, cinco pasos, consumido por los tres puntos de entrada. El registro pasa
`mode="signup"` para diferir la escritura hasta que exista el usuario; todo lo demás es idéntico.
**La escritura completa pasa a una RPC transaccional** (`crear_organizacion_completa(p_payload
jsonb)`, `SECURITY DEFINER`, con `revoke … from anon`), invocada desde un route handler nuevo
`POST /api/organizations` que resuelve el usuario en el servidor. Eso elimina los siete modos de
«organización a medio crear» de E.3 y saca de manos del navegador la asignación de `role_id: 2` e
`is_super_admin: true`, que hoy el cliente se auto-concede.

| Paso | Campos | De dónde viene |
|---|---|---|
| 1. Identidad | `logo_url`, `name`, `legal_name`, `type_id`, `description`, `email`, `phone`, colores, `subdomain`, `website` | `CreateOrganizationForm.tsx:590-594`, `:598`, `:599`, `:601-630`, `:876-888`, `:633-673`, `:738`, `:741-863`, `:974-1047`, `:1049` |
| 1. Identidad | `timezone` | **Nuevo** — preseleccionado por `country_code`, editable. Hoy nadie lo pide |
| 2. Datos fiscales y ubicación | `country`/`country_code`, `state`, `city`, `municipality_id`, `address`, `postal_code` | `CreateOrganizationForm.tsx:895-920`, `:923-968`, `:892`, `:970` |
| 2. Datos fiscales | `tax_id` / `nit` separados y **obligatorios siempre**, `dv` | `CreateOrganizationForm.tsx:675-714` (sin la excepción de `:289-291`, y sin copiar `nit` de `tax_id` como en `:689`), `:716-736` |
| 2. Datos fiscales | `economic_activity`, `fiscal_responsibilities[]`, `registration_code`, `graphic_representation_name` | **Nuevos**, opcionales con «completar después» |
| 3. Sucursal inicial | `name`, `branch_code` (con validación real), dirección, teléfono, correo, `tax_identification`, `opening_hours`, `features`, `manager_id`, `is_main`, `is_active`, `is_web_stock_source` | `BranchForm.tsx:320-335`, `BranchStep.tsx:88-120`, `CreateOrganizationWizard.tsx:207`, `signup/page.tsx:443` |
| 4. Plan | Catálogo real de `plans`, `billing_period`, prueba o pago, cupón, método de pago, `organizations.plan_id` | `CreateOrganizationForm.tsx:225-243` (no los ids cableados), `SubscriptionStep`, `PaymentMethodStep`, `signup/page.tsx:313` |
| 4. Plan | Aviso visible si falla Stripe | **Nuevo** — hoy el fallo es silencioso en los dos caminos |
| 5. Invitar equipo | Correos + rol, saltable | **Nuevo por completo**: ninguno de los tres caminos lo ofrece; reutiliza `InvitationsTab` |



---

## C. Módulo Organización — `app/app/organizacion/**`

**En esta sección las rutas van desde la raíz del repositorio** (`src/…`), porque muchos controles
viven en `src/components/` y en `src/lib/`.

Diez páginas más la navegación. Ninguna usa `PageHeader` del kit: todas dibujan su `<h1>` a mano,
y **ocho de las diez lo duplican** (una vez en la rama de carga y otra en la de contenido, más un
tercer título dentro del propio tab en sucursales y mis organizaciones). Ninguna usa `DataTable`;
las que listan lo hacen con `<table>` crudo o con un `<ul>`. Solo dos (`/miembros`,
`/invitaciones`) paginan, y lo hacen con `DataTablePagination` sobre datos ya traídos enteros:
**ocho de diez piden la colección completa sin `limit` ni `range`**.

### C.1 `/app/organizacion` (índice)

Cabecera con esqueletos del kit (`PageHeaderSkeleton` + `DetailSkeleton`); sin filtros, sin tabla,
sin paginación; de los 4 estados solo existe *cargando*; **sin comprobación de permisos**.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | *(`PageHeaderSkeleton`)* | Esqueleto de cabecera | Siempre | src/app/app/organizacion/page.tsx:19 |
| 2 | estado | *(`DetailSkeleton`)* | Esqueleto de detalle | Siempre | src/app/app/organizacion/page.tsx:20 |
| 3 | texto | `Redirigiendo...` (`org.common.redirecting`) | Aviso de redirección | Siempre | src/app/app/organizacion/page.tsx:21 |
| 4 | cálculo | `router.replace('/app/organizacion/miembros')` | Redirige a miembros al montar | `useEffect` inicial | src/app/app/organizacion/page.tsx:14 |

### C.2 `/app/organizacion/informacion`

Cabecera **a mano duplicada** (:21-22 y :53-54); sin filtros ni buscador; **sin tabla** (formulario
`<dl>/<dt>/<dd>` crudo; el único componente del kit es `PhoneInput`); sin paginación; estados
*cargando* (`OrganizationInfoSkeleton` en :24, :58, :320), *error* (:33, :331), *aviso sin permiso*
(:43) y *listo*, sin estado vacío; permisos por `useOrgAdmin.ts` (`userRole === 2 || userRole === 1`,
línea 121) que **oculta el formulario entero**, sin granularidad.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Información de la Organización` (`org.info.title`) | Título H1 | Mientras `loading` | src/app/app/organizacion/informacion/page.tsx:21 |
| 2 | texto | `Gestiona la información y configuración de tu organización` (`org.info.description`) | Subtítulo | Mientras `loading` | src/app/app/organizacion/informacion/page.tsx:22 |
| 3 | estado | *(skeleton)* | Esqueleto de detalle | `loading === true` | src/app/app/organizacion/informacion/page.tsx:24 |
| 4 | estado | `{error}` | Banda roja con el error del hook | `error !== null` | src/app/app/organizacion/informacion/page.tsx:33 |
| 5 | estado | `No tienes permisos para administrar la organización. Contacta a un administrador.` (`org.common.noPermissions`) | Banda amarilla; reemplaza el formulario | `!isOrgAdmin` | src/app/app/organizacion/informacion/page.tsx:43 |
| 6 | texto | `Información de la Organización` (`org.info.title`) | Título H1 real | Con permiso | src/app/app/organizacion/informacion/page.tsx:53 |
| 7 | texto | `Gestiona la información y configuración de tu organización` | Subtítulo real | Con permiso | src/app/app/organizacion/informacion/page.tsx:54 |
| 8 | estado | *(skeleton)* | Fallback de `Suspense` y `dynamic()` | Cargando el chunk | src/app/app/organizacion/informacion/page.tsx:58 (y :10) |
| 9 | estado | *(skeleton)* | Esqueleto interno del tab | `loading === true` | src/components/organization/OrganizationInfoTab.tsx:320 |
| 10 | texto | `Información de la Organización` (`org.orgInfo.title`) | Título H3 de la tarjeta | Tras cargar | src/components/organization/OrganizationInfoTab.tsx:326 |
| 11 | texto | `Detalles y configuración de la organización` (`org.orgInfo.subtitle`) | Subtítulo de la tarjeta | Siempre | src/components/organization/OrganizationInfoTab.tsx:327 |
| 12 | estado | `{error}` *(puede ser `err.message` crudo)* | Banda roja con icono X | Falla carga, guardado o logo | src/components/organization/OrganizationInfoTab.tsx:331-339 |
| 13 | estado | `Información de la organización actualizada correctamente` (`org.orgInfo.successUpdate`) | Banda verde; **no se auto-oculta** | Tras guardar | src/components/organization/OrganizationInfoTab.tsx:346-354 |
| 14 | texto | `Logo` (`org.orgInfo.logo`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:365 |
| 15 | texto | `Logo` *(atributo `alt`)* | Previsualiza el logo actual | `logo_url` no vacío | src/components/organization/OrganizationInfoTab.tsx:369-372 |
| 16 | estado | *(icono cuadrado gris)* | Marcador sin logo | `logo_url` vacío | src/components/organization/OrganizationInfoTab.tsx:375-379 |
| 17 | botón | `Cambiar Logo` (`org.orgInfo.changeLogo`) | Abre el selector de archivos | Siempre | src/components/organization/OrganizationInfoTab.tsx:383 |
| 18 | campo | *(input file, `accept="image/*"`, `sr-only`)* | Sube al bucket `logos` | Siempre (oculto) | src/components/organization/OrganizationInfoTab.tsx:384-390 |
| 19 | texto | `PNG, JPG, GIF hasta 5MB` (`org.orgInfo.logoHint`) | Ayuda del uploader | Siempre | src/components/organization/OrganizationInfoTab.tsx:392 |
| 20 | texto | `Nombre` (`org.orgInfo.name`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:400 |
| 21 | campo | placeholder `Nombre de la organización` | Input texto, `required` | Siempre | src/components/organization/OrganizationInfoTab.tsx:402-411 |
| 22 | texto | `Descripción` (`org.orgInfo.description`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:417 |
| 23 | campo | placeholder `Descripción de la organización` | Textarea de 3 filas | Siempre | src/components/organization/OrganizationInfoTab.tsx:419-427 |
| 24 | texto | `Email` (`org.orgInfo.email`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:433 |
| 25 | campo | placeholder `email@organizacion.com` *(literal)* | Input `type="email"` | Siempre | src/components/organization/OrganizationInfoTab.tsx:435-443 |
| 26 | texto | `Tipo` (`org.orgInfo.type`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:449 |
| 27 | campo | *(select `type`, `required`)* | Resuelve a `type_id` al guardar | Siempre | src/components/organization/OrganizationInfoTab.tsx:451-465 |
| 28 | menú | `Selecciona un tipo` (`org.orgInfo.selectType`) | Opción `disabled` por defecto | Sin tipo elegido | src/components/organization/OrganizationInfoTab.tsx:459 |
| 29 | texto | `Información de Contacto` (`org.orgInfo.contactInfo`) | Encabezado de sección | Siempre | src/components/organization/OrganizationInfoTab.tsx:471 |
| 30 | texto | `Sitio Web` (`org.orgInfo.website`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:476 |
| 31 | campo | placeholder `https://ejemplo.com` *(literal)* | Input `type="url"` | Siempre | src/components/organization/OrganizationInfoTab.tsx:478-486 |
| 32 | texto | `Teléfono` (`org.orgInfo.phone`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:492 |
| 33 | campo | *(PhoneInput, placeholder `300 123 4567`)* | Teléfono con código de país | Siempre | src/components/organization/OrganizationInfoTab.tsx:494-500 |
| 34 | botón | `Seleccionar código de país` *(`aria-label`)* | Abre el popover de países | En el campo teléfono | src/components/ui/phone-input.tsx:116-126 |
| 35 | campo | placeholder `Buscar país o código...` | Filtra la lista de países | Popover abierto | src/components/ui/phone-input.tsx:135-141 |
| 36 | estado | `No se encontraron resultados` | Búsqueda de país sin coincidencias | Popover abierto | src/components/ui/phone-input.tsx:146-148 |
| 37 | texto | `Dirección` (`org.orgInfo.addressSection`) | Encabezado de sección | Siempre | src/components/organization/OrganizationInfoTab.tsx:506 |
| 38 | texto | `Calle y Número` (`org.orgInfo.street`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:511 |
| 39 | campo | placeholder `Calle Principal #123` | Input `address` | Siempre | src/components/organization/OrganizationInfoTab.tsx:513-521 |
| 40 | texto | `Departamento / Estado` *(literal)* | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:527 |
| 41 | campo | placeholder `Ej: Antioquia, Cundinamarca...` *(literal)* | Reconsulta municipios por departamento | Siempre | src/components/organization/OrganizationInfoTab.tsx:529-537 |
| 42 | texto | `Al cambiar el departamento, se cargan los municipios de DIAN correspondientes` *(literal)* | Ayuda del campo | Siempre | src/components/organization/OrganizationInfoTab.tsx:538 |
| 43 | texto | `Municipio / Ciudad` *(literal)* | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:544 |
| 44 | campo | *(select `municipality_id`)* | Autorrellena ciudad y departamento | Siempre | src/components/organization/OrganizationInfoTab.tsx:546-559 |
| 45 | menú | `-- Seleccione municipio --` *(literal)* | Opción vacía por defecto | Sin municipio | src/components/organization/OrganizationInfoTab.tsx:553 |
| 46 | texto | `Municipio registrado ante DIAN. Se actualiza automáticamente la ciudad y departamento.` | Ayuda del select | Siempre | src/components/organization/OrganizationInfoTab.tsx:560 |
| 47 | texto | `País` (`org.orgInfo.country`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:566 |
| 48 | campo | placeholder `País` | **Texto libre, no es un select** | Siempre | src/components/organization/OrganizationInfoTab.tsx:568-576 |
| 49 | texto | `Código Postal` (`org.orgInfo.postalCode`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:582 |
| 50 | campo | placeholder `12345` *(literal)* | Input `postal_code` | Siempre | src/components/organization/OrganizationInfoTab.tsx:584-592 |
| 51 | texto | `NIT/RUT` (`org.orgInfo.taxId`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:598 |
| 52 | campo | placeholder `NIT o RUT` | Dispara el cálculo del DV | Siempre | src/components/organization/OrganizationInfoTab.tsx:600-608 |
| 53 | texto | `NIT sin guión. El DV se calcula automáticamente.` *(literal)* | Ayuda del NIT | Siempre | src/components/organization/OrganizationInfoTab.tsx:609 |
| 54 | texto | `DV (Auto)` *(literal)* | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:615 |
| 55 | campo | placeholder `Auto` | Input `readOnly`, `maxLength=1` | Siempre | src/components/organization/OrganizationInfoTab.tsx:617-627 |
| 56 | cálculo | `calcularDV(nit)` | Dígito de verificación DIAN | Al escribir `tax_id` | src/components/organization/OrganizationInfoTab.tsx:46-57 (uso :184-187) |
| 57 | texto | `Calculado automáticamente desde el NIT` *(literal)* | Ayuda del DV | Siempre | src/components/organization/OrganizationInfoTab.tsx:628 |
| 58 | texto | `Color Primario` (`org.orgInfo.primaryColor`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:634 |
| 59 | campo | *(input `type="color"`, default `#3B82F6`)* | Selector visual de color | Siempre | src/components/organization/OrganizationInfoTab.tsx:636-643 |
| 60 | campo | placeholder `#3B82F6` | Input texto espejo del color | Siempre | src/components/organization/OrganizationInfoTab.tsx:644-651 |
| 61 | texto | `Color Secundario` (`org.orgInfo.secondaryColor`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:657 |
| 62 | campo | *(input `type="color"`, default `#1E40AF`)* | Selector visual de color | Siempre | src/components/organization/OrganizationInfoTab.tsx:659-666 |
| 63 | campo | placeholder `#1E40AF` | Input texto espejo del color | Siempre | src/components/organization/OrganizationInfoTab.tsx:667-674 |
| 64 | texto | `Subdominio` (`org.orgInfo.subdomain`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:680 |
| 65 | campo | placeholder `miorganizacion` | Input `subdomain` | Siempre | src/components/organization/OrganizationInfoTab.tsx:682-690 |
| 66 | texto | `.goadmin.io` *(literal)* | Sufijo fijo del subdominio | Siempre | src/components/organization/OrganizationInfoTab.tsx:691 |
| 67 | texto | `Dominio Personalizado` (`org.orgInfo.customDomain`) | Etiqueta de la fila | Siempre | src/components/organization/OrganizationInfoTab.tsx:697 |
| 68 | campo | placeholder `www.miorganizacion.com` | Input `custom_domain` | Siempre | src/components/organization/OrganizationInfoTab.tsx:699-707 |
| 69 | texto | `Requiere configuración DNS adicional` (`org.orgInfo.customDomainHint`) | Ayuda del dominio | Siempre | src/components/organization/OrganizationInfoTab.tsx:708 |
| 70 | botón | `Guardar Cambios` (`org.orgInfo.saveChanges`) | `update` sobre `organizations` | Al pie del formulario | src/components/organization/OrganizationInfoTab.tsx:715-721 |
| 71 | estado | `Guardando...` (`org.orgInfo.saving`) | Texto del botón; queda `disabled` | Durante el guardado | src/components/organization/OrganizationInfoTab.tsx:717-720 |
| 72 | texto | `Logo de la organización` (`org.logoUploader.label`) | Título del uploader | Solo en `CreateOrganizationForm` | src/components/organization/LogoUploader.tsx:97 |
| 73 | botón | *(área circular clicable, sin texto)* | Abre el selector de archivos | Siempre | src/components/organization/LogoUploader.tsx:99-102 |
| 74 | texto | `Logo de la organización` (`org.logoUploader.altText`) | `alt` de `StorageImage` | Hay logo cargado | src/components/organization/LogoUploader.tsx:105-112 |
| 75 | tooltip | `Cambiar` (`org.logoUploader.change`) | Superposición al pasar el ratón | Hover sobre el logo | src/components/organization/LogoUploader.tsx:114 |
| 76 | estado | `Subir logo` (`org.logoUploader.upload`) | Círculo punteado con «+» | Sin logo | src/components/organization/LogoUploader.tsx:118-123 |
| 77 | estado | *(spinner, sin texto)* | Superposición giratoria | `uploading === true` | src/components/organization/LogoUploader.tsx:126-130 |
| 78 | botón | `Eliminar logo` (`org.logoUploader.remove`) | Borra de Storage **sin confirmar** | Hay logo cargado | src/components/organization/LogoUploader.tsx:134-140 |
| 79 | campo | *(input file oculto, `accept="image/*"`)* | Valida tipo y tamaño (máx. 2 MB) | Siempre (oculto) | src/components/organization/LogoUploader.tsx:143-149 |
| 80 | estado | `Por favor selecciona una imagen válida` / `La imagen no debe exceder 2MB` / `Error al subir la imagen. Intenta nuevamente.` | Párrafo rojo bajo el avatar | Falla validación o subida | src/components/organization/LogoUploader.tsx:151-153 |

### C.3 `/app/organizacion/miembros`

Cabecera **a mano duplicada** (:21-22 y :53-54); filtros artesanales en una tarjeta con degradado
(5 controles, `renderFilters()` :374-552); **tabla `<table>` a mano** de 8 columnas (:622-650), sin
ordenamiento ni selección; **paginación del kit** (`DataTablePagination`, :755, con los textos
quemados en español); estados *listo*, *cargando* (`MembersSkeleton` ×3), *vacío* (dos variantes en
:655) y *error* (franja roja que reemplaza toda la pestaña, sin reintentar); permisos por
`useOrgAdmin.ts`, más una capa por fila con `member.is_admin` que deshabilita rol, sucursales y
estado **pero no «Eliminar»**.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | *(`MembersSkeleton`)* | Esqueleto del chunk dinámico | Bajando el bundle | src/app/app/organizacion/miembros/page.tsx:10 |
| 2 | texto | `Miembros de la Organización` (`org.members.title`) | Título (versión cargando) | `loading === true` | src/app/app/organizacion/miembros/page.tsx:21 |
| 3 | texto | `Gestiona los miembros de tu organización` | Subtítulo (versión cargando) | `loading === true` | src/app/app/organizacion/miembros/page.tsx:22 |
| 4 | estado | *(`MembersSkeleton`)* | Esqueleto de lista | `loading === true` | src/app/app/organizacion/miembros/page.tsx:24 |
| 5 | estado | `{error}` | Franja roja con el error del hook | `error !== null` | src/app/app/organizacion/miembros/page.tsx:33 |
| 6 | estado | `No tienes permisos para administrar la organización. Contacta a un administrador.` | Bloquea toda la pantalla | `!isOrgAdmin` | src/app/app/organizacion/miembros/page.tsx:43 |
| 7 | texto | `Miembros de la Organización` | Título real de la página | Estado listo | src/app/app/organizacion/miembros/page.tsx:53 |
| 8 | texto | `Gestiona los miembros de tu organización` | Subtítulo real | Estado listo | src/app/app/organizacion/miembros/page.tsx:54 |
| 9 | estado | *(`MembersSkeleton`)* | Fallback del `Suspense` | Suspendiendo | src/app/app/organizacion/miembros/page.tsx:59 |
| 10 | texto | `Filtrar miembros` (`org.membersTab.filterMembers`) | Encabezado del panel de filtros | `showFilters === true` | src/components/organization/MembersTab.tsx:382 |
| 11 | badge | `{n} filtro activo` / `{n} filtros activos` | Cuenta filtros aplicados | `activeFiltersCount > 0` | src/components/organization/MembersTab.tsx:385 |
| 12 | botón | `Limpiar todos` (`clearAll`) | Resetea los 5 filtros | `activeFiltersCount > 0` | src/components/organization/MembersTab.tsx:392-407 |
| 13 | campo | `Nombre` / placeholder `Buscar por nombre...` | Filtra en memoria por nombre | Panel abierto | src/components/organization/MembersTab.tsx:416-430 |
| 14 | botón | *(icono X)* | Limpia el filtro de nombre | `nameFilter !== ''` | src/components/organization/MembersTab.tsx:433-440 |
| 15 | campo | `Email` / placeholder `Buscar por email...` | Filtra en memoria por correo | Panel abierto | src/components/organization/MembersTab.tsx:448-461 |
| 16 | botón | *(icono X)* | Limpia el filtro de correo | `emailFilter !== ''` | src/components/organization/MembersTab.tsx:465-472 |
| 17 | campo | `Rol` — `<select>` | Filtra por nombre de rol | Panel abierto | src/components/organization/MembersTab.tsx:480-497 |
| 18 | menú | `Todos los roles` (`allRoles`) | Opción por defecto de rol | Siempre | src/components/organization/MembersTab.tsx:493 |
| 19 | campo | `Sucursal` — `<select>` | Filtra y sincroniza `useBranch` | Panel abierto | src/components/organization/MembersTab.tsx:503-523 |
| 20 | menú | `Todas las sucursales` (`allBranches`) | Opción por defecto de sucursal | Siempre | src/components/organization/MembersTab.tsx:519 |
| 21 | campo | `Estado` — `<select>` | Filtra activos o inactivos | Panel abierto | src/components/organization/MembersTab.tsx:529-545 |
| 22 | menú | `Todos` (`allStatuses`) | Sin filtro de estado | Siempre | src/components/organization/MembersTab.tsx:542 |
| 23 | menú | `Activos` (`activeStatus`) | Filtra solo activos | Siempre | src/components/organization/MembersTab.tsx:543 |
| 24 | menú | `Inactivos` (`inactiveStatus`) | Filtra solo inactivos | Siempre | src/components/organization/MembersTab.tsx:544 |
| 25 | estado | *(`MembersSkeleton`)* | Reemplaza toda la pestaña | `loading === true` | src/components/organization/MembersTab.tsx:555 |
| 26 | estado | `{error}` | Franja roja; **reemplaza la pestaña** | `error !== null` | src/components/organization/MembersTab.tsx:558-572 |
| 27 | texto | `Miembros de la Organización` (`title`) | Título de tarjeta; repite el H1 | Estado listo | src/components/organization/MembersTab.tsx:583 |
| 28 | texto | `Lista de miembros actuales` (`currentList`) | Bajada de la tarjeta | Estado listo | src/components/organization/MembersTab.tsx:585 |
| 29 | cálculo | `(${filteredMembers.length} de ${members.length})` | Filtrados vs total *(« de » sin i18n)* | Filtros que reducen | src/components/organization/MembersTab.tsx:585 |
| 30 | stat | `{members.length}/{maxUsers} {t('users')}` | Cupo del plan más complementos | `maxUsers !== null` | src/components/organization/MembersTab.tsx:586-594 |
| 31 | botón | `Ocultar filtros` / `Mostrar filtros` | Muestra u oculta el panel | Siempre | src/components/organization/MembersTab.tsx:599-618 |
| 32 | tabla | `Nombre`, `Email`, `Rol`, `Cargo`, `Sucursal`, `Estado`, `Fecha de Registro`, `Acciones` | `<table>` a mano de 8 columnas | Estado listo | src/components/organization/MembersTab.tsx:622-650 |
| 33 | estado | `No hay miembros registrados` (`noMembers`) | Celda `colSpan={8}` | `members.length === 0` | src/components/organization/MembersTab.tsx:655 |
| 34 | estado | `No se encontraron miembros con los filtros aplicados` (`noResults`) | Celda `colSpan={8}` | Filtros sin resultados | src/components/organization/MembersTab.tsx:655 |
| 35 | campo | *(`<select>` de rol de la fila)* | Cambia el rol **sin confirmar** | Por fila; `disabled` si `is_admin` | src/components/organization/MembersTab.tsx:668-685 |
| 36 | menú | `Seleccionar rol` (`selectRole`) | Opción vacía del select | Por fila | src/components/organization/MembersTab.tsx:674 |
| 37 | menú | `Administrador` / `Gerente` / `Empleado` / `Cliente` | Opciones de rol, excluye `id = 1` | Por fila | src/components/organization/MembersTab.tsx:675-684 |
| 38 | chip | *(nombre de cada sucursal)* | Píldora azul por sucursal asignada | `branch_names.length > 0` | src/components/organization/MembersTab.tsx:693-700 |
| 39 | texto | `Sin sucursal` (`noBranch`) | Texto gris de la celda | `branch_names` vacío | src/components/organization/MembersTab.tsx:703 |
| 40 | botón | `Gestionar Sucursales` / `Asignar Sucursales` | Abre `BranchAssignmentModal` | Por fila; `disabled` si `is_admin` | src/components/organization/MembersTab.tsx:705-714 |
| 41 | toggle | `Activo` / `Inactivo` | Alterna `is_active` **sin confirmar** | Por fila; `disabled` si `is_admin` | src/components/organization/MembersTab.tsx:717-725 |
| 42 | botón | `Cuotas` *(literal, sin i18n)* | Abre `MemberQuotasSheet` | Por fila, siempre | src/components/organization/MembersTab.tsx:731-738 |
| 43 | tooltip | `Cuotas de {member.full_name}` *(`aria-label`)* | Etiqueta accesible del botón | Por fila | src/components/organization/MembersTab.tsx:735 |
| 44 | botón | `Eliminar` (`remove`) | **Borrado físico** de la membresía | Por fila, **siempre habilitado** | src/components/organization/MembersTab.tsx:739-744 |
| 45 | diálogo | `¿Estás seguro de que deseas eliminar este miembro de la organización?` | **`window.confirm` nativo** | Al pulsar «Eliminar» | src/components/organization/MembersTab.tsx:301 |
| 46 | paginación | `Mostrando X a Y de Z registros` · `Filas` | `DataTablePagination` del kit | `filteredMembers.length > 0` | src/components/organization/MembersTab.tsx:753-764 |
| 47 | diálogo | *(`MemberQuotasSheet`)* | Hoja lateral de cuotas | `quotasMember !== null` | src/components/organization/MembersTab.tsx:766 |
| 48 | diálogo | *(`BranchAssignmentModal`)* | Modal de asignación de sucursales | `isBranchModalOpen && selectedMember` | src/components/organization/MembersTab.tsx:768-776 |
| 49 | toast | `Rol actualizado correctamente` | **Nunca se renderiza** | Nunca | src/components/organization/MembersTab.tsx:244 |
| 50 | toast | `Usuario activado/desactivado correctamente` | **Nunca se renderiza** | Nunca | src/components/organization/MembersTab.tsx:291 |
| 51 | toast | `Miembro eliminado correctamente` | **Nunca se renderiza** | Nunca | src/components/organization/MembersTab.tsx:316 |
| 52 | estado | `Error al cargar los miembros` o `err.message` | Tumba toda la pestaña | Falla la RPC de perfiles | src/components/organization/MembersTab.tsx:170 |
| 53 | estado | `Error al actualizar el rol del miembro` o `err.message` | Tumba toda la pestaña | Falla el `update` de rol | src/components/organization/MembersTab.tsx:247 |
| 54 | estado | `Error al actualizar el estado del miembro` o `err.message` | Error al alternar estado | Falla el `update` | src/components/organization/MembersTab.tsx:294 |
| 55 | estado | `Error al eliminar el miembro` o `err.message` | Error al eliminar | Falla el `delete` | src/components/organization/MembersTab.tsx:322 |
| 56 | diálogo | `Asignación de Sucursales` (`org.branchAssignment.title`) | Modal a mano, **sin foco atrapado ni Esc** | `isOpen === true` | src/components/organization/BranchAssignmentModal.tsx:187-190 |
| 57 | texto | `{memberName}` | Subtítulo del modal | Modal abierto | src/components/organization/BranchAssignmentModal.tsx:191-193 |
| 58 | estado | `{error}` | Caja roja dentro del modal | `error !== null` | src/components/organization/BranchAssignmentModal.tsx:195-199 |
| 59 | estado | `Asignaciones actualizadas correctamente` | Caja verde; cierra tras 1 s | Tras guardar bien | src/components/organization/BranchAssignmentModal.tsx:201-205 |
| 60 | estado | *(spinner DaisyUI, no shadcn)* | Indicador de carga del modal | `loading === true` | src/components/organization/BranchAssignmentModal.tsx:207-210 |
| 61 | estado | `No hay sucursales disponibles` (`noBranches`) | Sin sucursales en la organización | `branches.length === 0` | src/components/organization/BranchAssignmentModal.tsx:214 |
| 62 | toggle | `Todas las sucursales` (`selectAll`) | Marca o desmarca todas | Si hay sucursales | src/components/organization/BranchAssignmentModal.tsx:217-228 |
| 63 | toggle | `{branch.name}` | Marca una sucursal, solo local | Una por sucursal | src/components/organization/BranchAssignmentModal.tsx:229-242 |
| 64 | botón | `Cancelar` (`cancel`) | Cierra el modal y refresca | Siempre; `disabled` al guardar | src/components/organization/BranchAssignmentModal.tsx:249-256 |
| 65 | botón | `Guardar` / `Guardando...` | **Borra todas y reinserta** las marcadas | Siempre | src/components/organization/BranchAssignmentModal.tsx:257-264 |
| 66 | estado | `No se pudieron cargar las sucursales` | Falla el select de sucursales | Al abrir | src/components/organization/BranchAssignmentModal.tsx:53 |
| 67 | estado | `El ID del miembro no es válido` | Validación del id del miembro | `memberId` vacío | src/components/organization/BranchAssignmentModal.tsx:66 |
| 68 | estado | `No se pudieron cargar las asignaciones de sucursales` | Falla leer `member_branches` | Al abrir | src/components/organization/BranchAssignmentModal.tsx:87 |
| 69 | estado | `No tienes permisos para asignar sucursales en esta organización` | Corta el guardado sin membresía | Al guardar | src/components/organization/BranchAssignmentModal.tsx:134 |
| 70 | estado | `Error al actualizar las asignaciones de sucursales` o `err.message` | Falla el `delete` o el `insert` | Al guardar | src/components/organization/BranchAssignmentModal.tsx:178 |
| 71 | cálculo | `allSelected` | Estado del checkbox maestro | Siempre | src/components/organization/BranchAssignmentModal.tsx:93 |
| 72 | cálculo | `setTimeout(onClose, 1000)` | Autocierre **sin `clearTimeout`** | Tras guardar bien | src/components/organization/BranchAssignmentModal.tsx:164-166 |

### C.4 `/app/organizacion/invitaciones`

Cabecera **a mano duplicada** (:21-22 y :53-54); filtros artesanales (`renderFilters` :624-752:
buscador de correo sin antirrebote y dos selects), filtrado 100 % en cliente; **tabla `<table>`
cruda** de 9 columnas (:989); **paginación del kit** (`DataTablePagination`, :1144) en memoria;
estados *listo*, *cargando* (`InvitationsSkeleton` ×4), *vacío* (dos variantes en :1029-1030) y
*error* (banner rojo :33 y :814); permisos por `useOrgAdmin.ts`, más `EmailConfirmedGate` (:936)
que deshabilita el envío si el correo del administrador no está confirmado.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Invitaciones` (`org.invitations.title`) | Título (versión cargando) | `loading` | src/app/app/organizacion/invitaciones/page.tsx:21 |
| 2 | texto | `Gestiona las invitaciones de tu organización` | Subtítulo (versión cargando) | `loading` | src/app/app/organizacion/invitaciones/page.tsx:22 |
| 3 | estado | *(`InvitationsSkeleton`)* | Esqueleto de lista | `loading` | src/app/app/organizacion/invitaciones/page.tsx:24 |
| 4 | estado | `{error}` | Banner rojo, sin reintento | Falla `useOrgAdmin` | src/app/app/organizacion/invitaciones/page.tsx:33 |
| 5 | estado | `No tienes permisos para administrar la organización. Contacta a un administrador.` | Bloquea toda la pantalla | `!isOrgAdmin` | src/app/app/organizacion/invitaciones/page.tsx:43 |
| 6 | texto | `Invitaciones` | Título real de la página | Estado listo | src/app/app/organizacion/invitaciones/page.tsx:53 |
| 7 | texto | `Gestiona las invitaciones de tu organización` | Subtítulo real | Estado listo | src/app/app/organizacion/invitaciones/page.tsx:54 |
| 8 | estado | *(`InvitationsSkeleton`)* | Fallback del `dynamic()` | Bajando el chunk | src/app/app/organizacion/invitaciones/page.tsx:10 |
| 9 | estado | *(`InvitationsSkeleton`)* | Fallback del `Suspense` | Al montar el tab | src/app/app/organizacion/invitaciones/page.tsx:59 |
| 10 | texto | `Filtrar invitaciones` | Encabezado del panel de filtros | `showFilters` | src/components/organization/InvitationsTab.tsx:642 |
| 11 | badge | `{n} filtro activo` / `{n} filtros activos` | Cuenta filtros aplicados | ≥1 filtro | src/components/organization/InvitationsTab.tsx:645 |
| 12 | botón | `Limpiar todos` | Resetea correo, rol y estado | ≥1 filtro | src/components/organization/InvitationsTab.tsx:663 |
| 13 | campo | `Email` | Etiqueta del buscador | `showFilters` | src/components/organization/InvitationsTab.tsx:673 |
| 14 | campo | placeholder `Buscar por email...` | Filtra por subcadena, **sin antirrebote** | `showFilters` | src/components/organization/InvitationsTab.tsx:685 |
| 15 | botón | *(icono X, sin `aria-label`)* | Limpia el campo de correo | `emailFilter` no vacío | src/components/organization/InvitationsTab.tsx:690 |
| 16 | campo | `Rol` | Etiqueta del select de rol | `showFilters` | src/components/organization/InvitationsTab.tsx:705 |
| 17 | menú | `Todos los roles` | Opción por defecto de rol | Siempre | src/components/organization/InvitationsTab.tsx:718 |
| 18 | menú | *(nombre de rol traducido)* | Filtra por `role_name` **ya traducido** | Por rol presente | src/components/organization/InvitationsTab.tsx:720 |
| 19 | campo | `Estado` | Etiqueta del select de estado | `showFilters` | src/components/organization/InvitationsTab.tsx:728 |
| 20 | menú | `Todos` | Sin filtro de estado | Siempre | src/components/organization/InvitationsTab.tsx:741 |
| 21 | menú | `Pendientes` | Filtra no usadas ni revocadas | Siempre | src/components/organization/InvitationsTab.tsx:742 |
| 22 | menú | `Aceptadas` | Filtra las usadas | Siempre | src/components/organization/InvitationsTab.tsx:743 |
| 23 | menú | `Revocadas` | Filtra las revocadas | Siempre | src/components/organization/InvitationsTab.tsx:744 |
| 24 | texto | `Enviar Nueva Invitación` | Título del formulario | Siempre | src/components/organization/InvitationsTab.tsx:766 |
| 25 | stat | `Usuarios: {current}/{max}` | Miembros activos vs tope del plan | `maxUsers` no nulo | src/components/organization/InvitationsTab.tsx:781 |
| 26 | texto | `(+{count} invitaciones pendientes)` | Suma pendientes al KPI | Hay pendientes | src/components/organization/InvitationsTab.tsx:784 |
| 27 | botón | `Actualizar plan` | Enlaza a `/app/organizacion/plan` | Al alcanzar el tope | src/components/organization/InvitationsTab.tsx:789-794 |
| 28 | estado | `Has alcanzado el límite de usuarios de tu plan. Actualiza tu plan para invitar más miembros.` | Explica el bloqueo del formulario | Al tope | src/components/organization/InvitationsTab.tsx:799 |
| 29 | estado | `{error}` | Banner rojo con icono | `error !== null` | src/components/organization/InvitationsTab.tsx:806-817 |
| 30 | estado | `{success}` | Banner verde con icono | `success !== null` | src/components/organization/InvitationsTab.tsx:820-833 |
| 31 | estado | `Debes confirmar tu correo electrónico para invitar nuevos usuarios.` *(literal)* | Aviso ámbar sobre el formulario | Correo sin confirmar | src/components/organization/InvitationsTab.tsx:835 |
| 32 | campo | `Correo Electrónico` | Input `type="email" required` | Siempre | src/components/organization/InvitationsTab.tsx:838-851 |
| 33 | texto | `ejemplo@correo.com` | Placeholder del input | Siempre | src/components/organization/InvitationsTab.tsx:849 |
| 34 | campo | `Rol` | Select obligatorio de rol | Siempre | src/components/organization/InvitationsTab.tsx:855-878 |
| 35 | menú | `Selecciona un rol` | Opción vacía `disabled` | Siempre | src/components/organization/InvitationsTab.tsx:867 |
| 36 | menú | `Administrador` / `Gerente` / `Empleado` / `Cliente` | Opciones traducidas de rol | Roles sin `id=1` | src/components/organization/InvitationsTab.tsx:868-877 |
| 37 | campo | `Sucursal *` *(literal)* | Select de sucursal, **sin `required`** | Con sucursales activas | src/components/organization/InvitationsTab.tsx:883-885 |
| 38 | menú | `Selecciona una sucursal` *(literal)* | Opción vacía `disabled` | Con sucursales | src/components/organization/InvitationsTab.tsx:894-896 |
| 39 | texto | `El empleado será asignado automáticamente a esta sucursal al aceptar la invitación.` | Ayuda del campo | Con sucursales | src/components/organization/InvitationsTab.tsx:903-905 |
| 40 | campo | `Cargo` *(literal)* | Select opcional de cargo | Con cargos activos | src/components/organization/InvitationsTab.tsx:911-913 |
| 41 | menú | `Sin cargo específico` *(literal)* | Deja `job_position_id` nulo | Con cargos | src/components/organization/InvitationsTab.tsx:922 |
| 42 | texto | `El cargo determina los permisos de visualización del usuario en el sistema.` | Ayuda del campo | Con cargos | src/components/organization/InvitationsTab.tsx:929-931 |
| 43 | botón | `Enviar Invitación` | Inserta y llama `/api/auth/invite` | Siempre; `disabled` al tope | src/components/organization/InvitationsTab.tsx:942 |
| 44 | estado | `Enviando...` | Texto del botón durante el envío | Mientras envía | src/components/organization/InvitationsTab.tsx:942 |
| 45 | tooltip | `Confirma tu correo electrónico para usar esta función` | `title` del envoltorio que anula clics | Correo sin confirmar | src/components/organization/InvitationsTab.tsx:936 |
| 46 | texto | `Invitaciones` | Título de la tarjeta de lista | Siempre | src/components/organization/InvitationsTab.tsx:955 |
| 47 | texto | `Envía invitaciones a nuevos miembros para tu organización` | Subtítulo de la lista | Siempre | src/components/organization/InvitationsTab.tsx:958 |
| 48 | cálculo | `(${filteredInvitations.length} de ${invitations.length})` | Filtradas vs totales *(sin i18n)* | Filtro que reduce | src/components/organization/InvitationsTab.tsx:959-960 |
| 49 | toggle | `Ocultar filtros` / `Mostrar filtros` | Muestra u oculta los filtros | Siempre | src/components/organization/InvitationsTab.tsx:965-985 |
| 50 | tabla | *(`<table>` a mano, 9 columnas)* | Lista paginada de invitaciones | Siempre | src/components/organization/InvitationsTab.tsx:989 |
| 51 | texto | `Email` | Encabezado de columna | Siempre | src/components/organization/InvitationsTab.tsx:993 |
| 52 | texto | `Rol` | Encabezado de columna | Siempre | src/components/organization/InvitationsTab.tsx:996 |
| 53 | texto | `Sucursal` | Encabezado de columna | Siempre | src/components/organization/InvitationsTab.tsx:999 |
| 54 | texto | `Cargo` | Encabezado de columna | Siempre | src/components/organization/InvitationsTab.tsx:1002 |
| 55 | texto | `Estado` | Encabezado de columna | Siempre | src/components/organization/InvitationsTab.tsx:1005 |
| 56 | texto | `Fecha de Envío` | Encabezado de columna | Siempre | src/components/organization/InvitationsTab.tsx:1008 |
| 57 | texto | `Fecha de Expiración` | Encabezado de columna | Siempre | src/components/organization/InvitationsTab.tsx:1011 |
| 58 | texto | `Link` | Encabezado de columna | Siempre | src/components/organization/InvitationsTab.tsx:1014 |
| 59 | texto | `Acciones` | Encabezado de columna | Siempre | src/components/organization/InvitationsTab.tsx:1017 |
| 60 | estado | `No hay invitaciones pendientes` | Fila única *(`colSpan={8}` sobre 9 columnas)* | Sin invitaciones | src/components/organization/InvitationsTab.tsx:1029 |
| 61 | estado | `No se encontraron invitaciones con los filtros aplicados` | Fila única centrada | Filtro sin resultados | src/components/organization/InvitationsTab.tsx:1030 |
| 62 | badge | `Revocada` | Píldora roja de estado | `status === 'revoked'` | src/components/organization/InvitationsTab.tsx:563 |
| 63 | badge | `Aceptada` | Píldora verde de estado | `status === 'used'` | src/components/organization/InvitationsTab.tsx:570 |
| 64 | badge | `Expirada` | Píldora gris, recalculada cada 60 s | Fecha de expiración pasada | src/components/organization/InvitationsTab.tsx:576 |
| 65 | badge | `Pendiente` | Píldora azul de estado | Resto de los casos | src/components/organization/InvitationsTab.tsx:582 |
| 66 | texto | `No expira` | Valor de la celda de expiración | `expires_at` nulo | src/components/organization/InvitationsTab.tsx:216 |
| 67 | botón | `Ver link` | Abre `/auth/invite?invite_code=…` | Fila pendiente con código | src/components/organization/InvitationsTab.tsx:1060-1069 |
| 68 | tooltip | `Abrir link de invitación` | `title` del enlace anterior | Igual que #67 | src/components/organization/InvitationsTab.tsx:1065 |
| 69 | botón | *(icono `Copy`)* | Copia el enlace al portapapeles | Igual que #67 | src/components/organization/InvitationsTab.tsx:1070-1081 |
| 70 | tooltip | `Copiar link` | `title` y `aria-label` del botón | Igual que #67 | src/components/organization/InvitationsTab.tsx:1073-1074 |
| 71 | estado | *(icono `Check` verde, sin texto)* | Confirma el copiado durante 2 s | Tras copiar | src/components/organization/InvitationsTab.tsx:1076-1077 |
| 72 | texto | `—` | Celda de enlace vacía | Filas usadas o revocadas | src/components/organization/InvitationsTab.tsx:1084 |
| 73 | botón | `Reenviar` | Extiende 30 días y reenvía | Fila no usada ni revocada | src/components/organization/InvitationsTab.tsx:1090-1103 |
| 74 | estado | `Enviando...` | Spinner en el botón de la fila | Reenviando esa fila | src/components/organization/InvitationsTab.tsx:1095-1099 |
| 75 | botón | `Revocar` | Abre el `AlertDialog` de confirmación | Fila no usada ni revocada | src/components/organization/InvitationsTab.tsx:1106-1110 |
| 76 | diálogo | `¿Estás seguro de que deseas revocar esta invitación?` | Título del `AlertDialog` | Al pulsar «Revocar» | src/components/organization/InvitationsTab.tsx:1114 |
| 77 | texto | `La invitación a {email} será cancelada y el enlace dejará de funcionar. Esta acción no se puede deshacer.` | Descripción del diálogo | Diálogo abierto | src/components/organization/InvitationsTab.tsx:1116 |
| 78 | botón | `Cancelar` | Cierra el diálogo sin cambios | Diálogo abierto | src/components/organization/InvitationsTab.tsx:1121 |
| 79 | botón | `Revocar` | Marca la invitación como revocada | Diálogo abierto | src/components/organization/InvitationsTab.tsx:1123-1128 |
| 80 | paginación | `Mostrando {start} a {end} de {total} registros` · `Filas` | `DataTablePagination` del kit | ≥1 fila filtrada | src/components/organization/InvitationsTab.tsx:1142-1153 |
| 81 | estado | *(`InvitationsSkeleton`)* | Esqueleto interno del tab | Cargando y lista vacía | src/components/organization/InvitationsTab.tsx:754-756 |
| 82 | estado | `Error al cargar invitaciones` o `err.message` | Respaldo de la carga | Falla `fetchInvitations` | src/components/organization/InvitationsTab.tsx:227 |
| 83 | estado | `Por favor completa todos los campos obligatorios` | Valida correo y rol | Al enviar incompleto | src/components/organization/InvitationsTab.tsx:280 |
| 84 | estado | `Por favor completa todos los campos obligatorios` | Valida sucursal obligatoria | Sin sucursal elegida | src/components/organization/InvitationsTab.tsx:287 |
| 85 | estado | `Has alcanzado el límite de {max} usuarios de tu plan. …` | Bloquea el envío | Miembros más pendientes al tope | src/components/organization/InvitationsTab.tsx:292 |
| 86 | estado | `Ya existe una invitación activa para este correo electrónico` | Corta el envío duplicado | Invitación pendiente existente | src/components/organization/InvitationsTab.tsx:305 |
| 87 | estado | `Este usuario ya es miembro de la organización` | Corta el envío | Perfil ya miembro activo | src/components/organization/InvitationsTab.tsx:327 |
| 88 | estado | `No se pudo obtener la información del usuario actual` | Corta el envío | Sin sesión | src/components/organization/InvitationsTab.tsx:342 |
| 89 | estado | `No se pudo obtener la información de la organización` | Corta el envío | Falla la consulta de organización | src/components/organization/InvitationsTab.tsx:353 |
| 90 | estado | `Invitación creada para {email}. Envía esta URL manualmente: {url}` | **Entrega la URL cruda al administrador** | Falla el envío por API | src/components/organization/InvitationsTab.tsx:407 y :414 |
| 91 | estado | `Invitación enviada exitosamente a {email}` | Confirma el envío del correo | API responde bien | src/components/organization/InvitationsTab.tsx:409 |
| 92 | estado | `Error al enviar la invitación` o `err.message` | Respaldo del `catch` de envío | Falla el `insert` | src/components/organization/InvitationsTab.tsx:432 |
| 93 | estado | `Invitación revocada correctamente` | Confirma la revocación | Tras revocar | src/components/organization/InvitationsTab.tsx:457 |
| 94 | estado | `Error al revocar la invitación` o `err.message` | Respaldo del `catch` de revocar | Falla el `update` | src/components/organization/InvitationsTab.tsx:460 |
| 95 | estado | `No se pudo obtener la información de la invitación` | Lanza excepción en el reenvío | No recupera la fila | src/components/organization/InvitationsTab.tsx:496 |
| 96 | estado | `Invitación actualizada para {email}. URL: {url}` | Entrega la URL cruda al administrador | Falla el reenvío por API | src/components/organization/InvitationsTab.tsx:527 y :534 |
| 97 | estado | `Invitación reenviada exitosamente a {email}` | Confirma el reenvío | API responde bien | src/components/organization/InvitationsTab.tsx:529 |
| 98 | estado | `Error al reenviar la invitación` o `err.message` | Respaldo del `catch` de reenvío | Falla el reenvío | src/components/organization/InvitationsTab.tsx:541 |

### C.5 `/app/organizacion/sucursales`

Cabecera **a mano** en la página (:59-64) **y otra dentro del tab** (:423-499) —dos títulos
«Sucursales» apilados, más un tercero en el formulario—; **sin buscador ni filtros**; **tabla
`<table>` cruda** de 9 columnas con `min-w-[1300px]` (:601), **sin variante móvil**; **sin
paginación** y sin `limit`/`range`; los 4 estados existen pero **duplicados literalmente** para la
vista mapa (:537-573) y la vista tabla (:574-897); permisos por `useOrgAdmin.ts` **solo en la
página** —`BranchesTab` no comprueba nada.

Por extensión, esta tabla agrupa los 175 controles en bloques; cada fila conserva su etiqueta
exacta y su `archivo:línea`.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Sucursales` (`org.branches.title`) | Título H1 de la página | Siempre | src/app/app/organizacion/sucursales/page.tsx:61 |
| 2 | texto | `Gestiona las sucursales de tu organización` | Subtítulo de la página | Siempre | src/app/app/organizacion/sucursales/page.tsx:62 |
| 3 | estado | *(`BranchesSkeleton`)* | Esqueleto mientras resuelve permisos | `loading === true` | src/app/app/organizacion/sucursales/page.tsx:32 |
| 4 | estado | `{error}` | Banda roja con el error del hook | `error !== null` | src/app/app/organizacion/sucursales/page.tsx:41 |
| 5 | estado | `No tienes permisos para administrar la organización. Contacta a un administrador.` | Bloquea toda la pantalla | `!isOrgAdmin` | src/app/app/organizacion/sucursales/page.tsx:51 |
| 6 | texto | `Tus Sucursales` (`org.branches.yourBranches`) | Encabezado de la rejilla propia | `userBranches.length > 0` | src/app/app/organizacion/sucursales/page.tsx:68 |
| 7 | chip | `{branch_name}` o `Sucursal #{id}` | Tarjeta por sucursal asignada | `userBranches.length > 0` | src/app/app/organizacion/sucursales/page.tsx:73 |
| 8 | estado | *(`BranchesSkeleton`)* | Fallback de `Suspense` y `dynamic()` | Cargando el chunk | src/app/app/organizacion/sucursales/page.tsx:11, 82 |
| 9 | texto | `Sucursales` (`org.branchesTab.title`) | **Segundo título H2**, duplica el H1 | Siempre | src/components/organization/BranchesTab.tsx:425 |
| 10 | stat | `{n} sucursal/sucursales registradas` | Conteo de sucursales cargadas | Siempre | src/components/organization/BranchesTab.tsx:426 |
| 11 | toggle | `Tabla` (`tableView`) | Cambia la vista a tabla | Siempre | src/components/organization/BranchesTab.tsx:431-443 |
| 12 | toggle | `Mapa` (`mapView`) | Cambia la vista a mapa | Siempre | src/components/organization/BranchesTab.tsx:444-457 |
| 13 | botón | `Mapa Completo` (`fullMap`) | Abre el mapa a pantalla completa | Siempre | src/components/organization/BranchesTab.tsx:461-470 |
| 14 | tooltip | `Ver mapa en pantalla completa` | `title` del botón anterior | Hover | src/components/organization/BranchesTab.tsx:464 |
| 15 | badge | `{branches.length}/{maxBranches}` | Consumo del plan, rojo al tope | `maxBranches` truthy | src/components/organization/BranchesTab.tsx:472-480 |
| 16 | botón | `Nueva Sucursal` (`newBranch`) | Genera código y abre el diálogo | Siempre | src/components/organization/BranchesTab.tsx:482-498 |
| 17 | estado | `Sucursal creada exitosamente.` y variantes | Banda verde, se autoborra | Tras crear, editar o asignar | src/components/organization/BranchesTab.tsx:502-509 |
| 18 | texto | `Tus Sucursales Asignadas` | Encabezado, duplica el de la página | `userBranches.length > 0` | src/components/organization/BranchesTab.tsx:513 |
| 19 | chip | `{branch_name}` o `Sucursal #{branch_id}` | Tarjeta con iniciales | Ídem | src/components/organization/BranchesTab.tsx:516-524 |
| 20 | texto | `Miembro asignado` | Etiqueta de la tarjeta | Ídem | src/components/organization/BranchesTab.tsx:526 |
| 21 | estado | *(`BranchesSkeleton`)* | Esqueleto de la vista mapa | Mapa cargando | src/components/organization/BranchesTab.tsx:539-542 |
| 22 | estado | `{error}` | Error de carga en vista mapa | Mapa con error | src/components/organization/BranchesTab.tsx:543-551 |
| 23 | estado | `No hay sucursales registradas` + `Crea una nueva sucursal para comenzar` | Vacío de la vista mapa | Mapa con cero sucursales | src/components/organization/BranchesTab.tsx:552-561 |
| 24 | tabla | *(`DynamicBranchesMap`)* | Mapa embebido de 500 px con pines | Mapa con datos | src/components/organization/BranchesTab.tsx:564-570 |
| 25 | estado | *(`BranchesSkeleton`)* | Esqueleto de la vista tabla | `loading` | src/components/organization/BranchesTab.tsx:576-579 |
| 26 | estado | `{error}` | Error de carga, límite o borrado | `error !== null` | src/components/organization/BranchesTab.tsx:580-588 |
| 27 | estado | `No hay sucursales registradas` + `Crea una nueva sucursal para comenzar` | Vacío de la vista tabla | Cero sucursales | src/components/organization/BranchesTab.tsx:589-598 |
| 28-36 | tabla | `Sucursal`, `Ubicación`, `Contacto`, `Gerente`, `Horarios`, `Estado`, `Sitio Web` *(literal)*, `Asignación`, `Acciones` | Encabezados de las 9 columnas | Vista tabla | src/components/organization/BranchesTab.tsx:604-612 |
| 37 | badge | `Principal` (`main`) | Marca la sucursal principal | `branch.is_main` | src/components/organization/BranchesTab.tsx:626-630 |
| 38 | badge | `Web` *(literal)* | Marca la que surte la tienda web | `is_web_stock_source` | src/components/organization/BranchesTab.tsx:631-638 |
| 39 | tooltip | `El sitio web usa el inventario de esta sucursal` | `title` del badge anterior | Hover | src/components/organization/BranchesTab.tsx:634 |
| 40-44 | texto | `Sin código`, `N/A`, `Sin dirección`, `N/A`, `Sin email` | Respaldos de celda vacía | Según el dato | src/components/organization/BranchesTab.tsx:640, 646, 647, 652, 653 |
| 45 | texto | `Gerente asignado` | Subtítulo bajo el nombre | Gerente con perfil | src/components/organization/BranchesTab.tsx:678 |
| 46 | botón | `Asignar gerente` | Abre el modal de gerente | `manager_id` sin join | src/components/organization/BranchesTab.tsx:693-698 |
| 47 | texto | `Sin gerente` | Estado sin gerente | Sin `manager_id` | src/components/organization/BranchesTab.tsx:710 |
| 48 | botón | `Asignar gerente` | Abre el modal de gerente | Sin gerente | src/components/organization/BranchesTab.tsx:712-717 |
| 49 | cálculo | `Lun-Vie: 09:00-18:00, Sáb: …` / `Sin horarios` / `Cerrado` | Resume el JSON de horarios | Siempre | src/components/organization/BranchesTab.tsx:42-108, 726 |
| 50 | texto | `Horarios definidos` | Indicador con reloj verde | Hay horarios | src/components/organization/BranchesTab.tsx:734 |
| 51 | texto | `Sin horarios` | Indicador con reloj gris | Sin horarios | src/components/organization/BranchesTab.tsx:741 |
| 52 | badge | `Activa` (`active`) | Estado activo de la sucursal | `is_active` | src/components/organization/BranchesTab.tsx:749-754 |
| 53 | badge | `Inactiva` (`inactive`) | Estado inactivo de la sucursal | `!is_active` | src/components/organization/BranchesTab.tsx:756-761 |
| 54 | badge | `Publicado` *(literal)* | Marca sitio web publicado | `is_web_published` | src/components/organization/BranchesTab.tsx:768-773 |
| 55 | cálculo | `https://{dominio}` / `https://{sub}.goadmin.io` / `https://{org}/{slug}` / `Sin URL` | Construye la URL pública por cascada | `is_web_published` | src/components/organization/BranchesTab.tsx:774-786 |
| 56 | botón | `Ver sitio` *(literal)* | Abre el sitio público del punto | Hay URL real | src/components/organization/BranchesTab.tsx:789-807 |
| 57 | badge | `No publicado` *(literal)* | Marca sitio no publicado | `!is_web_published` | src/components/organization/BranchesTab.tsx:811-813 |
| 58 | badge | `Asignado` | Tiene gerente o está asignada | Condición cumplida | src/components/organization/BranchesTab.tsx:819-824 |
| 59 | badge | `No asignado` | Sin ninguna asignación | Caso contrario | src/components/organization/BranchesTab.tsx:826-828 |
| 60 | botón | `Publicar` / `Despublicar` *(literales)* | Publica o despublica y recarga | Por fila | src/components/organization/BranchesTab.tsx:834-848 |
| 61 | tooltip | `Publicar sitio` / `Despublicar sitio` | `title` del botón anterior | Hover | src/components/organization/BranchesTab.tsx:842 |
| 62 | botón | `Asignar` / `Cambiar` | Abre el modal de gerente | Por fila | src/components/organization/BranchesTab.tsx:849-858 |
| 63 | tooltip | `Asignar gerente` / `Cambiar gerente` | `title` del botón anterior | Hover | src/components/organization/BranchesTab.tsx:852 |
| 64 | botón | `Ver` *(literal)* | Abre el detalle y carga miembros | Por fila | src/components/organization/BranchesTab.tsx:859-868 |
| 65 | botón | `Editar` | Abre el diálogo en modo edición | Por fila | src/components/organization/BranchesTab.tsx:869-877 |
| 66 | botón | `Eliminar` | Abre el `ConfirmDialog` de borrado | Por fila | src/components/organization/BranchesTab.tsx:878-887 |
| 67 | diálogo | *(modal crear/editar, superposición a mano)* | Contiene el formulario de sucursal | `showForm` | src/components/organization/BranchesTab.tsx:899-978 |
| 68 | texto | `Editar Sucursal` / `Nueva Sucursal` | Título del diálogo | `showForm` | src/components/organization/BranchesTab.tsx:907 |
| 69 | texto | `Modifica la información de la sucursal` / `Completa la información para crear una nueva sucursal` | Subtítulo del diálogo | `showForm` | src/components/organization/BranchesTab.tsx:910 |
| 70 | botón | *(icono ✕, sin `aria-label`)* | Cierra el diálogo | `showForm` | src/components/organization/BranchesTab.tsx:913-921 |
| 71 | estado | `{error}` | Error de guardado dentro del diálogo | `showForm && error` | src/components/organization/BranchesTab.tsx:925-933 |
| 72 | campo | *(`BranchForm`, `noFormWrapper={true}`)* | Monta el formulario de sucursal | `showForm` | src/components/organization/BranchesTab.tsx:938-945 |
| 73 | botón | `Cancelar` | Cierra el diálogo sin guardar | Pie del diálogo | src/components/organization/BranchesTab.tsx:950-957 |
| 74 | estado | `Guardando...` | Spinner y texto en el pie | `formLoading` | src/components/organization/BranchesTab.tsx:959-963 |
| 75 | botón | `Actualizar Sucursal` / `Crear Sucursal` | Invoca el envío del formulario | Pie del diálogo | src/components/organization/BranchesTab.tsx:965-972 |
| 76 | diálogo | *(`AssignManagerModal`)* | Selecciona y asigna gerente | `selectedBranchForManager` | src/components/organization/BranchesTab.tsx:981-989 |
| 77 | diálogo | *(`DynamicBranchMapModal`)* | Mapa completo, permite mover pines | `showMapModal` | src/components/organization/BranchesTab.tsx:992-999 |
| 78 | diálogo | `¿Eliminar esta sucursal?` | `ConfirmDialog` del kit | `branchToDelete !== null` | src/components/organization/BranchesTab.tsx:1002-1012 |
| 79 | texto | `Error al eliminar sucursal` | Descripción del diálogo — **copy equivocada** | Diálogo abierto | src/components/organization/BranchesTab.tsx:1006 |
| 80 | botón | `¿Eliminar esta sucursal?` | **La pregunta usada como etiqueta del botón** | Diálogo abierto | src/components/organization/BranchesTab.tsx:1007 |
| 81 | botón | `Cancelar` | Cancela el borrado | Diálogo abierto | src/components/organization/BranchesTab.tsx:1008 |
| 82 | diálogo | *(detalle de sucursal, superposición a mano)* | Ficha completa de la sucursal | `detailBranch !== null` | src/components/organization/BranchesTab.tsx:1015-1411 |
| 83 | texto | `{detailBranch.name}` + `{branch_code}` | Cabecera del detalle | Detalle abierto | src/components/organization/BranchesTab.tsx:1022-1027 |
| 84 | botón | *(icono ✕, sin `aria-label`)* | Cierra el detalle | Detalle abierto | src/components/organization/BranchesTab.tsx:1029-1036 |
| 85-88 | badge | `Principal`, `Activa`/`Inactiva`, `Web`, `Fuente Web` *(literales)* | Distintivos del detalle | Según banderas | src/components/organization/BranchesTab.tsx:1043-1064 |
| 89-95 | texto | `Información general`, `Nombre`, `Código de sucursal`, `NIT / Identificación fiscal`, `Tipo de negocio`, `Zona`, `Capacidad` | Datos del detalle; **`NIT`, `Zona` y `Capacidad` no tienen campo en el formulario** | Detalle | src/components/organization/BranchesTab.tsx:1071-1105 |
| 96-102 | texto | `Ubicación`, `Dirección`, `Ciudad`, `Departamento / Estado`, `País`, `Código postal`, `Coordenadas` | Datos de ubicación del detalle | Detalle | src/components/organization/BranchesTab.tsx:1115-1153 |
| 103-106 | texto | `Contacto`, `Teléfono`, `Email`, `Sin información de contacto` | Datos de contacto del detalle | Detalle | src/components/organization/BranchesTab.tsx:1163-1179 |
| 107 | texto | `Horarios` + resumen | Sección de horarios del detalle | Detalle | src/components/organization/BranchesTab.tsx:1188-1192 |
| 108-117 | texto | `Identidad Web`, `Tipo de negocio`, `Sitio web publicado`, `Slug (URL path)`, `Subdominio`, `Dominio personalizado`, `URL pública`, `Logo web`, `Imagen de portada`, `Sin identidad web configurada` | Bloque de identidad web del detalle | Detalle | src/components/organization/BranchesTab.tsx:1199-1303 |
| 118-120 | texto | `Gerente`, `{nombre}` + correo, `Sin gerente asignado` | Ficha del gerente | Detalle | src/components/organization/BranchesTab.tsx:1311-1338 |
| 121 | stat | `Miembros asignados ({branchMembers.length})` | Conteo de miembros de la sucursal | Detalle | src/components/organization/BranchesTab.tsx:1347 |
| 122 | botón | `Asignar miembros` *(literal)* | Abre `AssignMembersModal` | Detalle | src/components/organization/BranchesTab.tsx:1349-1355 |
| 123 | estado | `Cargando miembros...` *(literal)* | Spinner de la lista de miembros | `loadingMembers` | src/components/organization/BranchesTab.tsx:1357-1361 |
| 124 | estado | `No hay miembros asignados a esta sucursal` *(literal)* | Vacío de la lista de miembros | Cero miembros | src/components/organization/BranchesTab.tsx:1362-1363 |
| 125 | texto | `{full_name}` + `{email}` | Fila de miembro con iniciales | Hay miembros | src/components/organization/BranchesTab.tsx:1366-1391 |
| 126 | badge | `Admin` *(literal)* | Marca super admin de la organización | `is_super_admin` | src/components/organization/BranchesTab.tsx:1392-1396 |
| 127 | badge | `Gerente` *(literal)* | Marca al gerente en la lista | `manager_id === user_id` | src/components/organization/BranchesTab.tsx:1397-1401 |
| 128 | diálogo | *(`AssignMembersModal`)* | Asigna miembros y recarga todo | `showAssignMembers` | src/components/organization/BranchesTab.tsx:1414-1428 |
| 129 | texto | `Nueva Sucursal` / `Editar Sucursal` *(literales)* | **Tercer título** en la misma pantalla | Diálogo de formulario | src/components/branches/BranchForm.tsx:280 |
| 130 | botón | `Crear Sucursal` / `Actualizar Sucursal` | `type="submit"` **inerte: no hace nada** | Diálogo de formulario | src/components/branches/BranchForm.tsx:285-303 |
| 131 | estado | `Guardando...` | Spinner dentro del botón inerte | `isLoading` | src/components/branches/BranchForm.tsx:290-293 |
| 132 | texto | `Información básica` | Encabezado de sección | Formulario | src/components/branches/BranchForm.tsx:313 |
| 133 | campo | `Nombre *` / placeholder `Nombre de la sucursal` | Texto, `required` **inoperante** | Formulario | src/components/branches/BranchForm.tsx:317-326 |
| 134 | campo | `Código de sucursal` + `Asignado automáticamente` | `readOnly`, autogenerado | Formulario | src/components/branches/BranchForm.tsx:329-337 |
| 135 | texto | `Ubicación` | Encabezado de sección | Formulario | src/components/branches/BranchForm.tsx:346 |
| 136 | campo | `Dirección` / placeholder `Dirección completa` | Texto libre | Formulario | src/components/branches/BranchForm.tsx:350-358 |
| 137 | campo | *(`LocationSelector`: País / Departamento / Ciudad)* | Selects encadenados de ubicación | Formulario | src/components/branches/BranchForm.tsx:360-379 |
| 138 | campo | `Código Postal` | Texto libre | Formulario | src/components/branches/BranchForm.tsx:382-390 |
| 139 | texto | `Información de contacto` | Encabezado de sección | Formulario | src/components/branches/BranchForm.tsx:400 |
| 140 | campo | `Teléfono` / placeholder `300 123 4567` | `PhoneInput` con indicativo | Formulario | src/components/branches/BranchForm.tsx:404-411 |
| 141 | campo | `Email` / placeholder `sucursal@empresa.com` | Input `type="email"` | Formulario | src/components/branches/BranchForm.tsx:414-426 |
| 142 | texto | `Gerente de sucursal` | Encabezado de sección | Formulario, no en registro | src/components/branches/BranchForm.tsx:437 |
| 143 | campo | `Asignar Gerente` + `El gerente tendrá permisos administrativos sobre esta sucursal.` | `ManagerSelector` con su ayuda | Formulario | src/components/branches/BranchForm.tsx:441-454 |
| 144 | texto | `Horarios de apertura` | Encabezado de sección | Formulario | src/components/branches/BranchForm.tsx:466 |
| 145 | tabla | `Día` · `Abierto` · `Hora apertura` · `Hora cierre` | Rejilla de siete días | Formulario | src/components/branches/BranchForm.tsx:473-489 |
| 146 | toggle | `Sí` / `No` | Abre o cierra ese día | Por día | src/components/branches/BranchForm.tsx:498-506 |
| 147 | campo | *(`type="time"`, apertura)* | Hora de apertura del día | Por día, si abierto | src/components/branches/BranchForm.tsx:509-515 |
| 148 | campo | *(`type="time"`, cierre)* | Hora de cierre del día | Por día, si abierto | src/components/branches/BranchForm.tsx:518-524 |
| 149 | texto | `Características` | Encabezado de sección | Formulario | src/components/branches/BranchForm.tsx:540 |
| 150-155 | toggle | `WiFi`, `Estacionamiento`, `Delivery`, `Área exterior`, `Accesible para sillas de ruedas`, `Aire acondicionado` | Banderas de `features` | Formulario | src/components/branches/BranchForm.tsx:545-607 |
| 156 | texto | `Identidad Web` | Encabezado de sección | Formulario, no en registro | src/components/branches/BranchForm.tsx:619 |
| 157 | campo | `Tipo de negocio` + `Determina las secciones disponibles en el editor de branding.` | Select de `branch_type` | Formulario | src/components/branches/BranchForm.tsx:625-641 |
| 158 | campo | `Slug (URL path)` / placeholder `hotel, restaurante-1` | Texto autonormalizado a slug | Formulario | src/components/branches/BranchForm.tsx:646-670 |
| 159 | estado | `⚠️ El slug "{slug}" está reservado para el router público (menu, categorias, productos, checkout, etc.)…` | Alerta de slug reservado | Slug en la lista reservada | src/components/branches/BranchForm.tsx:672-678 |
| 160 | estado | `⚠️ Cambiar el slug romperá las URLs existentes ({antes} → {después})…` | Alerta al cambiar slug publicado | Edición con slug cambiado | src/components/branches/BranchForm.tsx:680-686 |
| 161 | campo | `Subdominio` / placeholder `hotel` | Texto normalizado a minúsculas | Formulario | src/components/branches/BranchForm.tsx:691-707 |
| 162 | campo | `Dominio personalizado` / placeholder `miempresa.com` | Texto normalizado de dominio | Formulario | src/components/branches/BranchForm.tsx:712-747 |
| 163 | botón | `Conectar` *(tooltip `Conectar un dominio que ya compraste`)* | Abre `AddCustomDomainDialog` | Formulario | src/components/branches/BranchForm.tsx:725-733 |
| 164 | botón | `Comprar` *(tooltip `Comprar un dominio nuevo`)* | Abre `BuyDomainDialog` | Formulario | src/components/branches/BranchForm.tsx:734-742 |
| 165 | campo | `Logo del sitio web` + `Reemplaza el logo de la organización para este outlet.` | `ImageUploader`, bucket `logos`, 2 MB | Formulario | src/components/branches/BranchForm.tsx:752-765 |
| 166 | campo | `Imagen de portada` | `ImageUploader`, `organization_images`, 5 MB | Formulario | src/components/branches/BranchForm.tsx:767-778 |
| 167 | toggle | `Sitio web publicado` + explicación | Bandera `is_web_published` | Formulario | src/components/branches/BranchForm.tsx:784-801 |
| 168 | cálculo | `URL pública del outlet:` → URL o `— configura slug, subdominio o dominio para ver la URL` | Previsualiza la URL en vivo | `is_web_published` | src/components/branches/BranchForm.tsx:807-826 |
| 169 | texto | `Estado` | Encabezado de sección | Formulario, no en registro | src/components/branches/BranchForm.tsx:837 |
| 170 | toggle | `Sucursal principal` | Bandera `is_main` | Formulario | src/components/branches/BranchForm.tsx:841-850 |
| 171 | toggle | `Sucursal activa` | Bandera `is_active` | Formulario | src/components/branches/BranchForm.tsx:853-862 |
| 172 | toggle | `Surte la tienda web` + `El sitio web usa el inventario de esta sucursal` | Bandera `is_web_stock_source` | Formulario | src/components/branches/BranchForm.tsx:865-877 |
| 173 | estado | `{error}` — p. ej. `El tipo de negocio (branch_type) es obligatorio para publicar el outlet en la web` | Errores de validación del formulario | Validación fallida | src/components/branches/BranchForm.tsx:885-894 |
| 174 | diálogo | *(`BuyDomainDialog`)* | Compra dominio y autorrellena el campo | `buyDomainOpen` | src/components/branches/BranchForm.tsx:909-919 |
| 175 | diálogo | *(`AddCustomDomainDialog`)* | Conecta dominio y autorrellena el campo | `connectDomainOpen` | src/components/branches/BranchForm.tsx:920-930 |

### C.6 `/app/organizacion/plan`

Cabecera **a mano** (:198-219) con dos enlaces a `/app/plan/billing` y `/app/plan/historial`; **sin
filtros, sin tabla, sin paginación** (pila de tarjetas y rejillas); estados *cargando*
(`PlanSkeleton` ×2), *error* (:128-145 y el bloque `Error` :491-505 que pinta `err.message` crudo),
*vacío* («Sin suscripción activa», :739-755) y *listo*; **los permisos no usan `useOrgAdmin.ts`**:
la página duplica la consulta y cablea `userRole === 2 || userRole === 1` con un comentario
«Assuming…» (:63-114).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `Mi Plan` + *(`PlanSkeleton`)* | Cabecera real más esqueleto | `loading === true` | src/app/app/organizacion/plan/page.tsx:116-126 |
| 2 | estado | `No se encontró sesión de usuario` / `Error al cargar datos de la organización` / `No perteneces a ninguna organización` / `Error inesperado al cargar datos` | Banner rojo que corta el render | `error !== null` | src/app/app/organizacion/plan/page.tsx:128-145 |
| 3 | estado | `No tienes permisos para administrar la organización. Contacta a un administrador.` | Oculta toda la pestaña de plan | Rol distinto de 1 o 2 | src/app/app/organizacion/plan/page.tsx:147-164 |
| 4 | toast | `¡Pago completado exitosamente! Tu plan ha sido actualizado.` | Banner verde al volver de Stripe | `?checkout=success` | src/app/app/organizacion/plan/page.tsx:31, 169-181 |
| 5 | botón | *(icono `XMarkIcon`, sin `aria-label`)* | Cierra el banner de éxito | Con el banner visible | src/app/app/organizacion/plan/page.tsx:176-178 |
| 6 | toast | `El pago fue cancelado. Tu plan no ha sido modificado.` | Banner amarillo tras cancelar | `?checkout=canceled` | src/app/app/organizacion/plan/page.tsx:35, 184-196 |
| 7 | botón | *(icono `XMarkIcon`, sin `aria-label`)* | Cierra el banner de cancelación | Con el banner visible | src/app/app/organizacion/plan/page.tsx:191-193 |
| 8 | texto | `Mi Plan` (`org.plan.title`) | Título H1 de la página | Estado listo | src/app/app/organizacion/plan/page.tsx:200 |
| 9 | texto | `Gestiona tu plan de suscripción y módulos disponibles` | Subtítulo de la página | Estado listo | src/app/app/organizacion/plan/page.tsx:201 |
| 10 | botón | `Facturación` *(literal)* | Enlaza a `/app/plan/billing` | Estado listo | src/app/app/organizacion/plan/page.tsx:204-210 |
| 11 | botón | `Historial` *(literal)* | Enlaza a `/app/plan/historial` | Estado listo | src/app/app/organizacion/plan/page.tsx:211-217 |
| 12 | estado | *(`PlanSkeleton`)* | Esqueleto de toda la pestaña | `loading === true` | src/components/organization/PlanTab.tsx:487-489 |
| 13 | estado | `Error` + `{error}` | **Mensaje crudo de Supabase o Stripe** | `error !== null` | src/components/organization/PlanTab.tsx:491-505 |
| 14 | texto | `Mi Plan` (`myPlan`) | Título de la tarjeta principal | Siempre | src/components/organization/PlanTab.tsx:524 |
| 15 | texto | `Gestiona tu suscripción y módulos activos` | Subtítulo de la tarjeta | Siempre | src/components/organization/PlanTab.tsx:525-527 |
| 16 | texto | `{currentPlan?.name}` | Nombre del plan vigente | Hay suscripción | src/components/organization/PlanTab.tsx:541-543 |
| 17 | cálculo | base `199` + `(mods−6)×49` + `sucursales×59` + `usuarios×19` + `créditos×0.01`, anual `×10` | **Precio Enterprise calculado en el navegador** | Plan `enterprise` con configuración | src/components/organization/PlanTab.tsx:552-568 |
| 18 | stat | `{precio} / mes` · `{precio} / año` | Precio vigente con `Intl` es-ES | Hay suscripción | src/components/organization/PlanTab.tsx:572-574 |
| 19 | badge | `Ahorras 2 meses al año` | Distintivo de facturación anual | Periodo anual | src/components/organization/PlanTab.tsx:576-578 |
| 20 | badge | `Activa` / `Período de prueba` / `Cancelada` / `Pago pendiente` | Estado de la suscripción con color | Hay suscripción | src/components/organization/PlanTab.tsx:587-598 |
| 21 | texto | `{days} días de prueba restantes` | Días de prueba restantes | `trial_end` futuro | src/components/organization/PlanTab.tsx:600-604 |
| 22 | texto | `Período actual:` + fechas | Rango del ciclo, **locale cableado `es-ES`** | Hay suscripción | src/components/organization/PlanTab.tsx:608-613, 459-465 |
| 23 | botón | `Cambiar Plan` | Abre `ChangePlanModal` | Hay suscripción | src/components/organization/PlanTab.tsx:619-625 |
| 24 | botón | `Comparar Planes` | Alterna la tarjeta de comparación | Hay suscripción | src/components/organization/PlanTab.tsx:626-631 |
| 25 | texto | `Ciclo de facturación:` | Rótulo del segmento | Plan distinto de `free` | src/components/organization/PlanTab.tsx:641 |
| 26 | toggle | `Mensual` / `Cambiando...` | Cambia el ciclo a mensual | Plan de pago | src/components/organization/PlanTab.tsx:643-653 |
| 27 | toggle | `Anual` / `Cambiando...` | Cambia el ciclo a anual | Plan de pago | src/components/organization/PlanTab.tsx:654-664 |
| 28 | botón | `Portal de Facturación` | Abre el portal Stripe | Con cliente Stripe | src/components/organization/PlanTab.tsx:672-682 |
| 29 | botón | `Renovar Plan` | Abre `ChangePlanModal` | Suscripción cancelada | src/components/organization/PlanTab.tsx:683-690 |
| 30 | botón | `Reactivar Suscripción` / `Reactivando...` | Reactiva la suscripción pendiente | `cancel_at_period_end` | src/components/organization/PlanTab.tsx:691-699 |
| 31 | botón | `Cancelar Suscripción` | Abre `CancelSubscriptionModal` | Resto de los casos | src/components/organization/PlanTab.tsx:700-708 |
| 32 | estado | `Tu suscripción está cancelada. Selecciona un plan para recuperar el acceso completo a la plataforma.` | Aviso rojo | `status === 'canceled'` | src/components/organization/PlanTab.tsx:712-718 |
| 33 | estado | `Tu último pago falló. Actualiza tu método de pago en el Portal de Facturación para evitar la suspensión.` | Aviso naranja | `status === 'past_due'` | src/components/organization/PlanTab.tsx:721-727 |
| 34 | estado | `Tu suscripción se cancelará al final del período actual. Puedes reactivarla antes de esa fecha.` | Aviso amarillo | `cancel_at_period_end` | src/components/organization/PlanTab.tsx:730-736 |
| 35 | estado | `Sin suscripción activa` | Vacío con icono de tarjeta | `subscription === null` | src/components/organization/PlanTab.tsx:740-742 |
| 36 | texto | `Actualmente estás usando el plan gratuito` | Explicación del estado vacío | `subscription === null` | src/components/organization/PlanTab.tsx:743-745 |
| 37 | botón | `Seleccionar Plan` | Abre `ChangePlanModal` | `subscription === null` | src/components/organization/PlanTab.tsx:747-752 |
| 38 | texto | `Límites del Plan` | Título de la tarjeta de cuotas | Hay plan actual | src/components/organization/PlanTab.tsx:763 |
| 39 | cálculo | Límites de `custom_config` más complementos | Resuelve topes y porcentajes | Hay plan actual | src/components/organization/PlanTab.tsx:766-804 |
| 40-42 | stat | `{totalActiveModules}/{maxModules}` + `Módulos activos` + `({core} core + {additional} adicionales)` + barra azul **sin `role="progressbar"`** | Consumo de módulos | Hay plan actual | src/components/organization/PlanTab.tsx:809-827 |
| 43-46 | stat / botón | `{branchCount}/{maxBranches}` + `Sucursales` + `+{n} addon` + barra verde + `+ Comprar más` | Consumo de sucursales | Hay plan actual | src/components/organization/PlanTab.tsx:831-858 |
| 47-50 | stat / botón | `{memberCount}/{maxUsers}` + `Usuarios` + `+{n} addon` + barra índigo + `+ Comprar más` | Consumo de usuarios | Hay plan actual | src/components/organization/PlanTab.tsx:862-889 |
| 51 | stat | `{n} GB` / `∞` + `Almacenamiento` | Cupo, **sin consumo real** | Hay plan actual | src/components/organization/PlanTab.tsx:893-898 |
| 52-56 | stat / botón | `{usados}/{límite}` + `Créditos IA` + `{n} disponibles` + `+{n} comprados` + barra ámbar + `+ Comprar más` | Consumo de créditos de IA | Hay plan actual | src/components/organization/PlanTab.tsx:901-933 |
| 57 | cálculo | `Math.max(disponible+usado, mensual+comprados)` | Techo de la barra de IA | Hay plan actual | src/components/organization/PlanTab.tsx:795-798 |
| 58 | texto | `Módulos Activos` | Título de la tarjeta de módulos | Siempre | src/components/organization/PlanTab.tsx:955 |
| 59 | texto | `Módulos disponibles en tu plan actual ({core} core + {additional} adicionales)` | Subtítulo de la tarjeta | Siempre | src/components/organization/PlanTab.tsx:956-958 |
| 60 | texto | `Módulos Core (incluidos en tu plan)` | Encabezado de la rejilla core | Siempre | src/components/organization/PlanTab.tsx:963-966 |
| 61 | badge | `Core` | Distintivo en cada tarjeta core | Por módulo core | src/components/organization/PlanTab.tsx:985-987 |
| 62 | texto | `Módulos Adicionales Activos` | Encabezado de la rejilla de pago | Hay módulos de pago activos | src/components/organization/PlanTab.tsx:1000-1003 |
| 63 | badge | `Activo` | Distintivo en módulo adicional | Por módulo no core activo | src/components/organization/PlanTab.tsx:1022-1024 |
| 64 | texto | `Módulo sin nombre` / `Sin descripción` | Respaldo si falta el join | Datos incompletos | src/components/organization/PlanTab.tsx:1017, 1020 |
| 65 | texto | `Módulos Disponibles` | Título de la tarjeta | Hay módulos disponibles | src/components/organization/PlanTab.tsx:1041 |
| 66 | texto | `Módulos que puedes activar con tu plan actual` | Subtítulo — **contradice el badge #67** | Ídem | src/components/organization/PlanTab.tsx:1042-1044 |
| 67 | badge | `No disponible` | Distintivo gris del módulo | Por módulo disponible | src/components/organization/PlanTab.tsx:1065-1067 |
| 68 | texto | `Comparación de Planes` | Título del comparador | `showPlanComparison` | src/components/organization/PlanTab.tsx:1083 |
| 69 | texto | `Compara las características de todos los planes disponibles` | Subtítulo del comparador | Ídem | src/components/organization/PlanTab.tsx:1084-1086 |
| 70 | badge | `Plan Actual` | Cinta sobre el plan vigente | Código igual al actual | src/components/organization/PlanTab.tsx:1101-1106 |
| 71-73 | stat / cálculo | `{precio}` + `/mes` · `{precio}` + `/año` · `Ahorra {amount}` | Precios del comparador desde `plans` | Por plan activo | src/components/organization/PlanTab.tsx:1112-1125 |
| 74 | texto | `Características:` | Encabezado de la lista | Por plan | src/components/organization/PlanTab.tsx:1131 |
| 75 | texto | `{count} módulos`, `{count} sucursales`, `{count} GB almacenamiento`, `Análisis avanzados`, `Reportes personalizados`, `Soporte de comunidad` / `Soporte por email` / `Soporte prioritario 24/7`, `{days} días de prueba gratis` | Lista de características con check | Según banderas del plan | src/components/organization/PlanTab.tsx:1132-1173 |
| 76 | chip | `Plan Actual` | Bloque inerte en lugar del botón | Plan vigente | src/components/organization/PlanTab.tsx:1177-1180 |
| 77 | botón | `Upgrade` / `Downgrade` / `Seleccionar` | Abre el modal **sin preseleccionar el plan** | Plan distinto al vigente | src/components/organization/PlanTab.tsx:1182-1199 |
| 78 | toast | `Suscripción reactivada exitosamente` | **`window.alert` nativo** | Tras reactivar con éxito | src/components/organization/PlanTab.tsx:383 |
| 79 | toast | `{result.message}` *(texto crudo del API)* | **`window.alert` nativo** | Tras cambiar el ciclo | src/components/organization/PlanTab.tsx:446 |
| 80-84 | diálogo | `ChangePlanModal`, `BuyAiCreditsModal`, `BuyUsersModal`, `BuyBranchesModal`, `CancelSubscriptionModal` | Cinco diálogos de la pestaña | Según el estado | src/components/organization/PlanTab.tsx:1210-1265 |
| 85-95 | diálogo | `Cambiar Plan de Suscripción` + `Estás cambiando el plan de suscripción para {organizationName}` + errores + `SubscriptionPlanSelector` + segmento mensual/anual + `CouponInput` + `Cancelar` + `Cambiar Plan`/`Procesando...` | `ChangePlanModal` completo; el banner de éxito (:157-170) es **inalcanzable** y el segmento anual **nunca cambia el periodo** (:29-31, :55-60) | `isOpen` | src/components/organization/ChangePlanModal.tsx:103-197 |
| 96-112 | diálogo | `Comprar Usuarios Extra` + `Agrega usuarios adicionales a tu plan. Se cobran mensualmente.` + `Límite actual: {n} usuarios · Usados: {n}` + 4 paquetes (`5`, `10`, `25`, `50 usuarios extra`) + badge `Popular` + `Cantidad personalizada` + `Mínimo: 1 usuario` + resumen + `Cancelar` + `Suscribir`/`Procesando...` | Compra de usuarios; **precio `1000` centavos cableado** | `isOpen` | src/components/organization/BuyUsersModal.tsx:103-253 |
| 113-129 | diálogo | `Comprar Sucursales Extra` + los mismos bloques con paquetes `1`, `3`, `5`, `10 sucursales extra` y `Mínimo: 1 sucursal` | Compra de sucursales; **precio `800` centavos cableado** | `isOpen` | src/components/organization/BuyBranchesModal.tsx:103-253 |
| 130-146 | diálogo | `Comprar Créditos de IA` + `Los créditos comprados no expiran…` + paquetes `5,000`, `15,000`, `50,000`, `100,000 créditos` + bonos `+10%`/`+15%`/`+20%` + `Mínimo: 100 créditos` + resumen + `Comprar ahora` | Compra de créditos; **precio `4` centavos y bonos cableados** | `isOpen` | src/components/organization/BuyAiCreditsModal.tsx:101-259 |
| 147-153 | campo / botón | `¿Tienes un código de descuento?` + placeholder `Ingresa tu código` + atajo `Enter` + `Aplicar` + chip `{code} — {name}` + botón de quitar + `Cupón no válido` | `CouponInput` completo | Siempre | src/components/organization/CouponInput.tsx:67-132 |
| 154-166 | tarjeta | `Método de Pago` + `Sin método de pago` + `Gestionar Facturación` + `Agregar Método de Pago` + `💳 Visa •••• {last4}` + `Expira {MM}/{AAAA}` + badge `Predeterminada` + papelera + tooltip `No puedes eliminar el único método de pago` | `PaymentMethodCard` completo | Según cliente Stripe | src/components/organization/PaymentMethodCard.tsx:155-271 |
| 166 | diálogo | `¿Estás seguro de eliminar este método de pago?` | **`window.confirm` nativo** | Antes de borrar | src/components/organization/PaymentMethodCard.tsx:83 |
| 167-174 | diálogo | `Cuotas de {member.name}` + `Metas por periodo y cumplimiento real…` + `No se pudieron cargar las cuotas` + `Reintentar` + toasts `Cuota guardada` / `Cuota eliminada` / `No se pudo eliminar` | `MemberQuotasSheet`; **único bloque con errores normalizados (`describeError`)** | Desde el botón «Cuotas» | src/components/organization/quotas/MemberQuotasSheet.tsx:32-67 |
| 175-184 | campo / botón | `Nueva cuota` + `Periodo` (`Mensual`/`Trimestral`/`Anual`) + `Tipo de meta` (`Ingresos`/`Negocios ganados`/`Actividades`/`Llamadas`) + `Un día del periodo` + `Meta ({currency})` + errores con `role="alert"` + `Guardar cuota` | `QuotaEditor`, **el único formulario del módulo con validación real** | `q.canManage` | src/components/organization/quotas/QuotaEditor.tsx:77-151 |
| 185-195 | estado / botón | `Cargando cuotas` + vacío «Este miembro aún no tiene cuotas…» + etiqueta de periodo + badge `Cuota cumplida` / `Por debajo del ritmo` / `Periodo cerrado sin cumplir` + `QuotaProgressBar` con `role="progressbar"` + `ConfirmDialog` `¿Eliminar la cuota de {periodo}?` + `Sí, eliminar` | `QuotaHistory` completo | Siempre | src/components/organization/quotas/QuotaHistory.tsx:50-137 |
| 196-202 | cálculo | `parseAmount`, `validateQuotaForm`, `periodLabelFor`, `loading`, `describeError`, `run()`/`busy`/`reload()` | Lógica de cuotas **sin `new Date()` local** | Siempre | src/components/organization/quotas/quotaForm.ts:29-71 · useMemberQuotas.ts:42-80 |

*(Los 8 controles de `EnterpriseConfigModal` quedan fuera: el componente no tiene consumidores.
Con ellos el total de la página es 210.)*

### C.7 `/app/organizacion/modulos`

Cabecera **a mano** (:406-416) y otra distinta en la rama de carga (:369-376); **sin filtros ni
buscador** pese a listar ~25 módulos; **sin tabla** (rejilla de `Card` de tres columnas); **sin
paginación**; estados *cargando*, *error*, *aviso sin organización* y *listo*; **no hay ninguna
comprobación de permisos**: cualquier miembro que llegue a la ruta activa o desactiva módulos de
toda la organización.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Marketplace de Módulos` (`org.modules.title`) | Título H1 de la rama cargando | `showInitialLoader` | src/app/app/organizacion/modulos/page.tsx:371 |
| 2 | texto | `Activa y desactiva módulos según las necesidades de tu negocio` | Subtítulo de la rama cargando | `showInitialLoader` | src/app/app/organizacion/modulos/page.tsx:372 |
| 3 | estado | *(`ModulesSkeleton`)* | Esqueleto de la rejilla | `showInitialLoader` | src/app/app/organizacion/modulos/page.tsx:374 |
| 4 | estado | `No se pudo cargar la información de la organización. Por favor, recarga la página.` | Alerta que reemplaza la pantalla | Sin `organizationId` | src/app/app/organizacion/modulos/page.tsx:385 |
| 5 | texto | `Marketplace de Módulos` | Título H1 real | Estado listo | src/app/app/organizacion/modulos/page.tsx:411 |
| 6 | texto | `Activa y desactiva módulos según las necesidades de tu negocio` | Subtítulo real | Estado listo | src/app/app/organizacion/modulos/page.tsx:413 |
| 7 | texto | `{plan.name}` | Nombre del plan en la tarjeta | Hay plan | src/app/app/organizacion/modulos/page.tsx:424 |
| 8 | stat | `Uso de módulos: {total} de {max} ({core} core + {additional} adicionales)` | Consumo de módulos del plan | Hay plan | src/app/app/organizacion/modulos/page.tsx:427 |
| 9 | stat | *(`Progress` del kit, sin etiqueta)* | Porcentaje de módulos usados | Hay plan | src/app/app/organizacion/modulos/page.tsx:432-435 |
| 10 | stat | `{count} módulos activos ({core} core)` | Conteo a la izquierda de la barra | Hay plan | src/app/app/organizacion/modulos/page.tsx:437 |
| 11 | stat | `{count} adicionales disponibles` | Cupo restante a la derecha | Hay plan | src/app/app/organizacion/modulos/page.tsx:438 |
| 12 | estado | `Error al cargar módulos disponibles` / `Error al modificar el módulo` / `Error de conexión al modificar el módulo` / `Error al cambiar página` / `Error de conexión al cambiar página` | Alerta destructiva de la página | `error !== null` | src/app/app/organizacion/modulos/page.tsx:446-451 |
| 13 | texto | `Módulos Core` | Encabezado H2 de la sección | Siempre | src/app/app/organizacion/modulos/page.tsx:457 |
| 14 | badge | `Incluidos en todos los planes` | Distintivo de la sección core | Siempre | src/app/app/organizacion/modulos/page.tsx:458 |
| 15 | texto | `{module.name}` | Nombre del módulo core | Por módulo core | src/app/app/organizacion/modulos/page.tsx:475 |
| 16 | badge | `Core` | Distintivo de la tarjeta core | Por módulo core | src/app/app/organizacion/modulos/page.tsx:477 |
| 17 | texto | `{module.description}` | Descripción del módulo core | Por módulo core | src/app/app/organizacion/modulos/page.tsx:486 |
| 18 | texto | `Siempre activo` | Estado fijo del módulo core | Por módulo core | src/app/app/organizacion/modulos/page.tsx:490 |
| 19 | tooltip | *(icono `Lock`, **sin `title` ni `aria-label`**)* | Indica que no se puede desactivar | Por módulo core | src/app/app/organizacion/modulos/page.tsx:492 |
| 20 | texto | `Módulos Especializados` | Encabezado H2 de la sección | Siempre | src/app/app/organizacion/modulos/page.tsx:507 |
| 21 | badge | `Según tu plan` | Distintivo de la sección de pago | Siempre | src/app/app/organizacion/modulos/page.tsx:508 |
| 22 | texto | `{module.name}` | Nombre del módulo de pago | Por módulo no core | src/app/app/organizacion/modulos/page.tsx:526 |
| 23 | badge | `Activo` / `Inactivo` | Estado del módulo de pago | Por módulo no core | src/app/app/organizacion/modulos/page.tsx:528 |
| 24 | toggle | *(sin etiqueta ni `aria-label`)* | Activa o desactiva el módulo, optimista | `disabled` si no se puede | src/app/app/organizacion/modulos/page.tsx:532-536 |
| 25 | texto | `{module.description}` | Descripción del módulo de pago | Por módulo no core | src/app/app/organizacion/modulos/page.tsx:541 |
| 26 | estado | `Procesando...` | Spinner dentro de la tarjeta | Módulo en curso | src/app/app/organizacion/modulos/page.tsx:547 |
| 27 | estado | `Límite del plan alcanzado` | Explica el toggle deshabilitado | Sin cupo y módulo inactivo | src/app/app/organizacion/modulos/page.tsx:554 |
| 28 | botón | `Páginas del módulo` *(literal, sin i18n)* | Expande o contrae la lista de páginas | **Solo módulos de pago activos** | src/app/app/organizacion/modulos/page.tsx:561-571 |
| 29 | badge | `{activeCount}/{totalCount}` | Páginas activas sobre el total | Ídem | src/app/app/organizacion/modulos/page.tsx:579-581 |
| 30 | texto | `{page.name}` | Nombre de la página o submódulo | Sección expandida | src/app/app/organizacion/modulos/page.tsx:612 |
| 31 | estado | *(spinner `Loader2`, sin texto)* | Indicador por página individual | Página en curso | src/app/app/organizacion/modulos/page.tsx:615 |
| 32 | toggle | *(sin etiqueta ni `aria-label`)* | Activa o desactiva esa página | Sección expandida | src/app/app/organizacion/modulos/page.tsx:618-622 |
| 33 | texto | `¿Necesitas más módulos?` | Título del aviso de ampliación | Al tope con módulos pendientes | src/app/app/organizacion/modulos/page.tsx:644 |
| 34 | texto | `Has alcanzado el límite de tu plan actual. Actualiza para acceder a más módulos.` | Bajada del aviso | Ídem | src/app/app/organizacion/modulos/page.tsx:647 |
| 35 | botón | `Actualizar Plan` | Enlaza a `/app/plan` | Ídem | src/app/app/organizacion/modulos/page.tsx:651-655 |
| 36 | cálculo | `canToggleModule(module)` | Bloquea activar si se alcanzó el tope | Por módulo no core | src/app/app/organizacion/modulos/page.tsx:344-361 |
| 37 | cálculo | `totalActiveCount` / `additionalActiveCount` | Conteos sobre el estado optimista | Siempre | src/app/app/organizacion/modulos/page.tsx:397-401 |

**El segundo nivel: activar y apagar páginas dentro de cada módulo.** No es un detalle, es la
mitad de lo que hace esta pantalla, y conviene dejarlo escrito porque el diseño lo ignoraba.

La tabla es **`organization_module_pages`** (verificada por MCP):

| Columna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | `integer` | NO | secuencia |
| `organization_id` | `integer` | NO | — |
| `module_code` | `text` | NO | — |
| `page_href` | `text` | NO | — |
| `page_name` | `text` | NO | — |
| `is_active` | `boolean` | **NO** | `true` |
| `enabled_at` | `timestamptz` | SÍ | `now()` |
| `disabled_at` | `timestamptz` | SÍ | — |
| `created_at` / `updated_at` | `timestamptz` | SÍ | `now()` |

Cómo se consume:

| Paso | Archivo:línea |
|---|---|
| Carga inicial en paralelo con los módulos: `moduleManagementService.getActiveModulePages(orgId)` | `modulos/page.tsx:133-140` |
| Alternar una página: `POST /api/modules/pages` con `{organizationId, moduleCode, pageHref, pageName, isActive}`, con estado optimista y evento `modules-updated` | `modulos/page.tsx:275-290` |
| **Regla por defecto**: `isPageActive(moduleCode, pageHref)` → si `activeModulePages[moduleCode]` es `undefined`, **se asume activa** | `modulos/page.tsx:334-336` |

Esa regla por defecto es correcta —una organización nueva no tiene filas y debe ver todo— pero
tiene una consecuencia que el diseño debe reflejar: **«sin fila» y «activa» se ven igual**, así que
el contador «N de M activas» cuenta páginas que quizá nunca se han tocado.

El catálogo de páginas por módulo sale de `MODULE_PAGES` (`src/lib/config/modulePages.ts`), y el
sidebar filtra por él (`SidebarNavigation.tsx:504-515`): si solo queda una página activa, el
submenú se convierte en enlace directo.

**Dos fallos ya reportados que aquí se juntan**: la sección de páginas solo se dibuja dentro del
`map` de `paidModules`, así que **las 9 páginas del propio módulo `organizations` no tienen
interfaz** (E.4, `modulos/page.tsx:462-497` vs `:559`); y **`/api/modules/pages` es una de las
cuatro rutas sin autenticar y con service role** (E.2), de modo que hoy cualquiera puede apagar
páginas de cualquier organización pasando su `organizationId` en el cuerpo.

### C.8 `/app/organizacion/mis-organizaciones`

Cabecera **a mano duplicada** (:21-22 y :53-54) **más un tercer título H2 redundante** en el tab
(:116); filtros artesanales (buscador por nombre y tres `<select>` nativos), filtrado 100 % en
cliente; **no hay tabla**: es un `<ul className="divide-y">` con filas `<div role="button">` —y el
esqueleto usa `Card`, así que no se parece al contenido—; **sin paginación** ni `range`/`limit`;
estados *listo*, *cargando* (cuatro capas), *vacío* (**solo la variante «con filtros»**, aunque no
haya filtro) y *error* (tres bloques rojos sin reintentar); permisos por `useOrgAdmin.ts` en la
página, más una capa por fila (`showActions && org.role_id === 2`) **defectuosa**: el `role_id`
viene de la organización **activa** con respaldo a administrador.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Mis Organizaciones` (`org.myOrgs.title`) | Título H1, duplicado en :21 | Siempre | src/app/app/organizacion/mis-organizaciones/page.tsx:53 |
| 2 | texto | `Gestiona todas las organizaciones de las que eres propietario` | Subtítulo, duplicado en :22 | Siempre | src/app/app/organizacion/mis-organizaciones/page.tsx:54 |
| 3 | estado | *(`OrganizationListSkeleton`)* | Esqueleto mientras resuelve permisos | `loading === true` | src/app/app/organizacion/mis-organizaciones/page.tsx:24 |
| 4 | estado | *(`OrganizationListSkeleton`)* | Fallback del `dynamic()` | Bajando el chunk | src/app/app/organizacion/mis-organizaciones/page.tsx:10 |
| 5 | estado | *(`OrganizationListSkeleton`)* | Fallback del `Suspense` | Suspendiendo | src/app/app/organizacion/mis-organizaciones/page.tsx:58 |
| 6 | estado | `{error}` | Bloque rojo con el error del hook | `error !== null` | src/app/app/organizacion/mis-organizaciones/page.tsx:33 |
| 7 | estado | `No tienes permisos para administrar organizaciones. Contacta a un administrador.` | Reemplaza toda la pantalla | `!isOrgAdmin` | src/app/app/organizacion/mis-organizaciones/page.tsx:43 |
| 8 | texto | `Administrar Organizaciones` (`org.manageOrgs.title`) | **Tercer título H2**, redundante | Dentro del tab | src/components/organization/ManageOrganizationsTab.tsx:116 |
| 9 | botón | `Crear Nueva Organización` | Oculta la lista y monta el asistente | Dentro del tab | src/components/organization/ManageOrganizationsTab.tsx:117 |
| 10 | estado | `{error}` | Bloque rojo con `err.message` crudo | Tras fallar el borrado | src/components/organization/ManageOrganizationsTab.tsx:125 |
| 11 | texto | `Aquí puedes gestionar todas tus organizaciones. Las organizaciones inactivas no aparecerán en el selector de organizaciones durante el inicio de sesión.` | Banner azul informativo | Cuando no se está creando | src/components/organization/ManageOrganizationsTab.tsx:149 |
| 12 | estado | `Cargando formulario...` | Fallback del asistente, texto plano | Al abrir el asistente | src/components/organization/ManageOrganizationsTab.tsx:141 |
| 13 | campo | pasos `['Organización', 'Sucursal', 'Plan', 'Pago']` | Asistente **en línea**, no modal | `showCreateForm === true` | src/components/organization/ManageOrganizationsTab.tsx:142 (pasos en CreateOrganizationWizard.tsx:311) |
| 14 | diálogo | `¿Eliminar organización?` | `AlertDialog` de confirmación | `orgToDelete !== null` | src/components/organization/ManageOrganizationsTab.tsx:165 |
| 15 | texto | `Esta acción eliminará la organización, sus sucursales y todos los datos asociados. No se puede deshacer.` | Descripción — **el código hace borrado lógico** | Diálogo abierto | src/components/organization/ManageOrganizationsTab.tsx:173 |
| 16 | botón | `Cancelar` | Cierra el diálogo sin borrar | Diálogo abierto | src/components/organization/ManageOrganizationsTab.tsx:177 |
| 17 | botón | `Eliminar` | Marca inactiva y reubica la activa | Diálogo abierto | src/components/organization/ManageOrganizationsTab.tsx:180 |
| 18 | estado | `Eliminando...` | Spinner dentro del botón | `deleting === true` | src/components/organization/ManageOrganizationsTab.tsx:188 |
| 19 | texto | `Filtros` (`org.orgList.filters`) | Encabezado H3 de la tarjeta | `showFilters === true` | src/components/organization/OrganizationList.tsx:301 |
| 20 | badge | `{n} filtro activo` / `{n} filtros activos` | Chip azul con el conteo | `activeFiltersCount > 0` | src/components/organization/OrganizationList.tsx:303 |
| 21 | botón | `Limpiar todos` | Resetea los cuatro filtros | `activeFiltersCount > 0` | src/components/organization/OrganizationList.tsx:311 |
| 22 | campo | `Nombre` / placeholder `Buscar por nombre...` | Filtra en cliente por subcadena | Con filtros visibles | src/components/organization/OrganizationList.tsx:340 |
| 23 | botón | *(icono ✕)* | Limpia solo el filtro de nombre | `nameFilter !== ''` | src/components/organization/OrganizationList.tsx:350 |
| 24 | campo | `Tipo de organización` / `Todos los tipos` | Select derivado de los datos | Con filtros visibles | src/components/organization/OrganizationList.tsx:372 |
| 25 | campo | `Plan de suscripción` / `Todos los planes` | Select derivado de los datos | Con filtros visibles | src/components/organization/OrganizationList.tsx:395 |
| 26 | campo | `Estado` / `Todos`, `Activos`, `Inactivos` | Select por estado de la organización | Con filtros visibles | src/components/organization/OrganizationList.tsx:418 |
| 27 | cálculo | `uniqueTypes` / `uniquePlans` | Deriva las opciones de los combos | Siempre | src/components/organization/OrganizationList.tsx:64 |
| 28 | cálculo | `filteredOrganizations` | Aplica los cuatro filtros en memoria | Siempre | src/components/organization/OrganizationList.tsx:75 |
| 29 | cálculo | `activeFiltersCount` | Cuenta filtros distintos del defecto | Con filtros visibles | src/components/organization/OrganizationList.tsx:286 |
| 30 | cálculo | `planName = 'Free'` + busca suscripción activa | Deriva el plan mostrado en la fila | Por fila | src/components/organization/OrganizationList.tsx:164 |
| 31 | estado | *(`OrganizationListSkeleton`)* | Esqueleto durante la propia consulta | `loading === true` | src/components/organization/OrganizationList.tsx:261 |
| 32 | estado | `{error}` | Bloque rojo; **reemplaza la lista entera** | `error !== ''` | src/components/organization/OrganizationList.tsx:264 |
| 33 | estado | `No se encontraron organizaciones con los filtros aplicados` | **Vacío único**, también sin filtros | `filteredOrganizations.length === 0` | src/components/organization/OrganizationList.tsx:442 |
| 34 | tabla | *(`<ul className="divide-y divide-gray-200">`)* | Listado a mano, sin orden ni cabeceras | Hay resultados | src/components/organization/OrganizationList.tsx:447 |
| 35 | botón | `{org.name}` | La fila cambia la organización activa | Por fila | src/components/organization/OrganizationList.tsx:450 |
| 36 | atajo | `Enter` | Activa la fila con el teclado | Fila enfocada | src/components/organization/OrganizationList.tsx:455 |
| 37 | badge | `Actual` | Chip verde de organización activa | `org.is_current` | src/components/organization/OrganizationList.tsx:462 |
| 38 | badge | `{org.type_id.name}` (o `Unknown`) | Chip azul con el tipo | Por fila | src/components/organization/OrganizationList.tsx:469 |
| 39 | texto | `Administrador` / `Miembro` | Rol **de la organización activa**, no de la fila | Por fila | src/components/organization/OrganizationList.tsx:476 |
| 40 | texto | `Plan:` + `{org.plan_name}` | Plan derivado de suscripciones | Por fila | src/components/organization/OrganizationList.tsx:479 |
| 41 | badge | `Activo` / `Inactivo` | Chip de estado de la organización | Por fila | src/components/organization/OrganizationList.tsx:483 |
| 42 | toggle | `Desactivar organización` / `Activar organización` | Cambia el estado de la organización | `showActions` y rol admin | src/components/organization/OrganizationList.tsx:492 |
| 43 | atajo | `Enter` / `Space` *(**`Space` nunca dispara**)* | Activa el toggle con el teclado | Icono enfocado | src/components/organization/OrganizationList.tsx:499 |
| 44 | botón | `Cambiar plan` / `Cambiar plan de suscripción` | Abre `ChangePlanModal` para esa fila | `showActions` y rol admin | src/components/organization/OrganizationList.tsx:518 |
| 45 | atajo | `Enter` / `Space` *(**`Space` nunca dispara**)* | Abre el modal con el teclado | Icono enfocado | src/components/organization/OrganizationList.tsx:535 |
| 46 | cálculo | `'free'` / `'básico' → 'basic'` / `'profesional' → 'pro'`, si no `'free'` | Traduce el nombre del plan al id | Al abrir «Cambiar plan» | src/components/organization/OrganizationList.tsx:524 |
| 47 | botón | *(icono papelera, **sin `aria-label` ni `title`**)* | Abre el diálogo de borrado | `showActions` y rol admin | src/components/organization/OrganizationList.tsx:556 |
| 48 | atajo | `Enter` / `Space` *(**`Space` nunca dispara**)* | Dispara el borrado con el teclado | Icono enfocado | src/components/organization/OrganizationList.tsx:564 |
| 49 | texto | *(chevron `›`, decorativo, sin `aria-hidden`)* | Sugiere navegación, **sin handler** | Por fila | src/components/organization/OrganizationList.tsx:577 |
| 50 | diálogo | *(`ChangePlanModal`)* | Cambia el plan y recarga la lista | `selectedOrgForPlan !== null` | src/components/organization/OrganizationList.tsx:589 |

### C.9 `/app/organizacion/dominios`

Cabecera **a mano** fija (:326-375) con flecha a `/app/organizacion` y tres botones; **sin filtros
ni buscador** (existe `DomainFilters.tsx`, pero **nadie lo importa**); **sin tabla**: rejilla de
tarjetas `DomainCard` (la única `<table>` a mano está en `ImportDialog.tsx`, **también muerto**);
**sin paginación**; de los 4 estados hay *cargando* (un esqueleto que dibuja 4 KPI y una barra de
filtros **que nunca existen**), *listo* y *vacío*, pero **no existe estado de error en pantalla**:
todo error cae solo en un toast, así que un fallo de carga muestra el vacío «No tienes dominios
personalizados»; **los permisos no se resuelven en absoluto** (solo `useOrganization()` y
`useSession()`), de modo que comprar con cargo a tarjeta, borrar y cambiar el dominio principal
quedan abiertos a cualquier miembro. Proveedores: **Vercel** para DNS, **Stripe** para el pago.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | *(icono `ArrowLeft`)* | Enlaza a `/app/organizacion` | Siempre | src/app/app/organizacion/dominios/page.tsx:327 |
| 2 | texto | `Dominios` (`org.domains.title`) | Título de la página | Siempre | src/app/app/organizacion/dominios/page.tsx:338 |
| 3 | texto | `Gestiona los dominios y subdominios de tu organización` | Subtítulo de la página | Siempre | src/app/app/organizacion/dominios/page.tsx:341 |
| 4 | botón | `Actualizar` | Recarga dominios; el icono gira | Siempre | src/app/app/organizacion/dominios/page.tsx:354 |
| 5 | botón | `Agregar Existente` | Abre el diálogo de dominio propio | Siempre | src/app/app/organizacion/dominios/page.tsx:363 |
| 6 | botón | `Comprar Dominio` | Abre el asistente de compra | Siempre | src/app/app/organizacion/dominios/page.tsx:371 |
| 7 | estado | *(11 `Skeleton`: 4 KPI, filtros, 6 tarjetas)* | Esqueleto que **no corresponde a la UI** | `isLoading` | src/app/app/organizacion/dominios/page.tsx:381-396 |
| 8 | texto | `Dominios Personalizados` | Encabezado de la sección | Cargado | src/app/app/organizacion/dominios/page.tsx:416 |
| 9 | stat | `{count} dominio(s)` | Conteo de dominios cargados | `domains.length > 0` | src/app/app/organizacion/dominios/page.tsx:420 |
| 10 | estado | `No tienes dominios personalizados` | Título del estado vacío | `domains.length === 0` | src/app/app/organizacion/dominios/page.tsx:430 |
| 11 | texto | `Conecta un dominio que ya tengas registrado para usarlo con tu sitio` | Descripción del estado vacío | `domains.length === 0` | src/app/app/organizacion/dominios/page.tsx:433 |
| 12 | botón | `Agregar Dominio Personalizado` | Abre el diálogo de dominio propio | Estado vacío | src/app/app/organizacion/dominios/page.tsx:440 |
| 13-17 | diálogo | `DomainForm`, `DNSInstructions`, `RedirectDialog`, `AddCustomDomainDialog`, `BuyDomainDialog` | Los cinco diálogos de la página | Según el estado | src/app/app/organizacion/dominios/page.tsx:470-509 |
| 18 | diálogo | `¿Eliminar dominio?` | Confirmación de borrado | `deleteDialogOpen` | src/app/app/organizacion/dominios/page.tsx:528 |
| 19 | texto | `Esta acción no se puede deshacer. El dominio "{host}" será eliminado permanentemente.` | Advertencia del diálogo | Diálogo de borrado | src/app/app/organizacion/dominios/page.tsx:530 |
| 20 | botón | `Cancelar` | Cierra la confirmación | Diálogo de borrado | src/app/app/organizacion/dominios/page.tsx:535 |
| 21 | botón | `Eliminar` | Borra el dominio | Diálogo de borrado | src/app/app/organizacion/dominios/page.tsx:538 |
| 22-40 | toast | `Error` *(título sin traducir, 19 veces)*, `Dominio actualizado`, `Dominio creado`, `Dominio eliminado`, `Verificación exitosa` / `Verificación pendiente`, `Dominio principal actualizado`, `Dominio activado` / `Dominio desactivado`, `Redirección configurada` / `La redirección ha sido eliminada`, `Sincronización exitosa` / `Error de sincronización`, `Dominio duplicado`, `Subdominio actualizado`, `Dominio agregado`, `¡Dominio comprado!` | **19 toasts**; los de error muestran el texto crudo del servicio | Según la acción | src/app/app/organizacion/dominios/page.tsx:104-519 |
| 41-67 | diálogo | `Agregar Dominio Personalizado` → `Configurar DNS`: campo `Dominio` (placeholder `www.miempresa.com`), `Requisitos:` con tres viñetas, aviso `Los cambios de DNS pueden tardar hasta 48 horas en propagarse.`, registros `CNAME` y `TXT` con `Nombre / Host` y `Valor / Destino` y sus botones de copiar, enlaces a `Google Domains`, `GoDaddy`, `Namecheap`, y los botones `Cancelar`, `Continuar`/`Verificando...`, `Atrás`, `Guardar Dominio`/`Guardando...` | Asistente de dos pasos para conectar un dominio propio | `open` | src/components/organization/dominios/AddCustomDomainDialog.tsx:177-370 |
| 68-105 | diálogo | `Comprar Dominio` en cuatro pasos: `Busca un dominio disponible` (campo `Buscar Dominio`, sugerencias `.com` `.io` `.co` `.app`, badges `¡Disponible!` / `TLD no disponible para compra directa` / `No disponible`, precio `${price} USD/año`), `Información de contacto para el registro` (`Nombre *`, `Apellido *`, `Email *`, `Teléfono * (E.164)`, `Dirección *`, `Ciudad *`, `Estado/Depto *`, `Código Postal *`, `País (código) *`), `Completa el pago` (`Tarjeta de Crédito/Débito` con `CardElement`, aviso `El pago se procesará de forma segura con Stripe. El dominio se registrará a través de Vercel.`) y `¡Compra completada!`; botones `Cancelar`, `Continuar`, `Atrás`, `Pagar ${price}` / `Procesando...`, `Cerrar` | Compra de dominio con Stripe; **el precio se formatea con `toFixed(2)`, sin `Intl`** | `open` | src/components/organization/dominios/BuyDomainDialog.tsx:265-525 |
| 106-132 | diálogo | `Instrucciones de Verificación DNS`: `Estado actual:` con badge `Verificado`/`Pendiente`/`Fallido`, `Método de Verificación: TXT`, registros de verificación y `CNAME` con `Host / Name`, `Tipo`, `Valor`, `TTL (Time To Live)` = `3600 (o el mínimo permitido por tu proveedor)` y sus botones de copiar, `Intentos de verificación:`, `Último intento:` *(fecha con la zona del navegador)*, nota de 48 horas, enlace a `whatsmydns.net`, y los botones `Cerrar` y `Verificar Ahora`/`Verificando...` | Diálogo de instrucciones DNS | `open` | src/components/organization/dominios/DNSInstructions.tsx:65-246 |
| 133-154 | tarjeta / menú | `DomainCard`: badges `Verificado`/`Pendiente`/`Fallido` y `Subdominio`/`Dominio Personalizado`, `{domain.host}`, tooltip `Dominio Principal`, toggle de actividad, y el menú «⋮» con `Editar`, `Duplicar`, `Ver Instrucciones DNS`, `Verificar Dominio`, `Marcar como Principal`, `Configurar Redirección`, `Sincronizar con Vercel`, `Eliminar`; pie con `Verificado:`, `Intentos verificación:`, código de redirección, `Última sync Vercel:` y `Visitar sitio` | Tarjeta de dominio completa | Por dominio | src/components/organization/dominios/DomainCard.tsx:85-287 |
| 155-171 | campo / menú | `DomainFilters`: buscador `Buscar por dominio...` y tres selects (`Estado`, `Tipo`, `Actividad`) con sus opciones, botón `Limpiar`, contador `Mostrando {n} de {total} dominios` y badge `Filtros activos` | **17 controles MUERTOS**: el componente existe y nadie lo monta | Nunca | src/components/organization/dominios/DomainFilters.tsx:58-129 |
| 172-186 | diálogo | `Editar Dominio` / `Nuevo Dominio`: `Tipo de Dominio` (`Subdominio (*.goadmin.io)` / `Dominio Personalizado`), campo `Dominio`, aviso DNS, toggles `Dominio Principal` y `Activo` con sus ayudas, y los botones `Cancelar` y `Guardando...`/`Guardar Cambios`/`Crear Dominio` **fuera del `<form>`** | Formulario de dominio | `open` | src/components/organization/dominios/DomainForm.tsx:122-243 |
| 187-209 | diálogo | `Importar Dominios`: zona de archivo CSV con `Haz clic para seleccionar un archivo CSV` y `o arrastra y suelta aquí` **sin `onDrop`**, formato esperado, `Vista Previa` con badges `{n} válidos` / `{n} inválidos`, `<table>` a mano de 3 columnas, y los botones `Cerrar`/`Cancelar` e `Importar {count} dominio(s)` | **23 controles MUERTOS**: sin consumidores | Nunca | src/components/organization/dominios/ImportDialog.tsx:124-300 |
| 210-223 | diálogo | `Configurar Redirección`: `Redirigir {host} a otro dominio`, select `Redirigir a` con `Sin redirección` y los dominios verificados, select `Código de Estado HTTP` (`301 - Redirección Permanente`, `302 - Redirección Temporal`, `307 …`, `308 …`), aviso de impacto en SEO, y los botones `Cancelar` y `Guardar`/`Guardando...` | Diálogo de redirección | `open` con dominio | src/components/organization/dominios/RedirectDialog.tsx:78-173 |
| 224-239 | tarjeta | `Subdominio del Sistema`: `Tu URL gratuita en goadmin.io`, badge `Gratuito`, campo `Subdominio` + sufijo `.goadmin.io`, `No configurado`, botón `Editar`, estados `Verificando...` / `¡Disponible!` / `Ya está en uso` / `Mínimo 3 caracteres`, botones `Cancelar` y `Guardar`/`Guardando...` **sin RPC**, y el enlace `https://{subdominio}.goadmin.io` | Gestor del subdominio del sistema | Siempre | src/components/organization/dominios/SubdomainManager.tsx:250-365 |

**199 controles alcanzables** de 239; los 40 restantes están en `DomainFilters` (17) e
`ImportDialog` (23), ambos sin consumidores.

### C.10 Navegación del módulo

El submenú de `/app/organizacion` está definido **cuatro veces** en el repositorio, con contenidos
distintos entre sí; el sidebar lo filtra por `activeModulePages['organizations']` y, si solo queda
una página activa, lo convierte en enlace directo (`SidebarNavigation.tsx:504-515`).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | menú | `Mi Organización` (`nav.myOrganization`) | Ítem padre del sidebar | Módulo `organizations` activo | src/components/app-layout/Sidebar/SidebarNavigation.tsx:386-390 |
| 2 | menú | `Información` | Enlaza a `/app/organizacion/informacion` | Página activa en BD | src/components/app-layout/Sidebar/SidebarNavigation.tsx:391 |
| 3 | menú | `Sitio Web` | Enlaza a `/app/organizacion/branding` | Página activa en BD | src/components/app-layout/Sidebar/SidebarNavigation.tsx:392 |
| 4 | menú | `Dominios` | Enlaza a `/app/organizacion/dominios` | Página activa en BD | src/components/app-layout/Sidebar/SidebarNavigation.tsx:393 |
| 5 | menú | `Miembros` | Enlaza a `/app/organizacion/miembros` | Página activa en BD | src/components/app-layout/Sidebar/SidebarNavigation.tsx:394 |
| 6 | menú | `Invitaciones` | Enlaza a `/app/organizacion/invitaciones` | Página activa en BD | src/components/app-layout/Sidebar/SidebarNavigation.tsx:395 |
| 7 | menú | `Sucursales` | Enlaza a `/app/organizacion/sucursales` | Página activa en BD | src/components/app-layout/Sidebar/SidebarNavigation.tsx:396 |
| 8 | menú | `Módulos` | Enlaza a `/app/organizacion/modulos` | Página activa en BD | src/components/app-layout/Sidebar/SidebarNavigation.tsx:397 |
| 9 | menú | `Mi Plan` | Enlaza a `/app/organizacion/plan` | Página activa en BD | src/components/app-layout/Sidebar/SidebarNavigation.tsx:398 |
| 10 | menú | `Mis Organizaciones` | Enlaza a `/app/organizacion/mis-organizaciones` | Página activa en BD | src/components/app-layout/Sidebar/SidebarNavigation.tsx:399 |
| 11 | menú | `Organización` *(literal, difiere de #1)* | **Copia del submenú con los mismos 9 ítems** | Fuente alterna del layout | src/components/app-layout/AppLayout.tsx:323-337 |
| 12 | menú | `Información` | Enlace del menú de perfil | Menú de perfil abierto | src/components/app-layout/ProfileDropdownMenu.tsx:242 |
| 13 | cálculo | `MODULE_PAGES.organizations` *(9 entradas)* | Catálogo que filtra el sidebar | Siempre | src/lib/config/modulePages.ts:150-160 |
| 14 | cálculo | `moduleSubroutes.organizations` *(solo 5 entradas)* | **Tercera definición, desincronizada** | Siempre | src/config/moduleConfig.ts:87-93 |
| 15 | cálculo | `moduleSubroutes.branches` *(3 entradas)* | **Cuarta definición; 2 rutas no existen** | Siempre | src/config/moduleConfig.ts:98-102 |
| 16 | cálculo | `moduleRoutes.organizations` → `/app/organizacion` | Ruta raíz del módulo | Siempre | src/config/moduleConfig.ts:57 |
| 17 | cálculo | `routeToModule['/app/organizacion'] → 'organizations'` | Mapa inverso de ruta a módulo | Siempre | src/lib/config/modulePages.ts:248 |
| 18 | cálculo | `allowedPaths = ['/app/organizacion/plan', '/app/plan', '/app/organizacion']` | Rutas permitidas con la suscripción vencida | Suscripción vencida | src/components/app-layout/AppLayout.tsx:757, 769 |

### C.11 `/app/organizacion/branding` y `/branding/reviews` — resumen

**`/branding`**: cabecera **a mano** fija (:232-279) con flecha a
`/app/organizacion/informacion`, botón «Actualizar» y chip «Publicado»/«Borrador»; sin filtros ni
buscador a nivel de página; **sin tabla** ni `DataTable` (tarjetas y listas dentro de un `<Tabs>` de
siete pestañas); **sin paginación**; de los 4 estados, *cargando* dibuja **8 pestañas fantasma
cuando solo hay 7** (:283-295) y *vacío* y *error* **son el mismo estado** (:375-384); **permisos:
ninguno** —no importa `PermissionGuard` ni `usePermissionContext`—, así que quien vea el menú puede
inyectar CSS y scripts en el sitio público.

**`/branding/reviews`**: cabecera **a mano y sin i18n** (:21-24); filtro de estado en el panel hijo
y filtro de producto que **nunca se renderiza** (depende de `/api/products`, endpoint inexistente,
con el fallo tragado por `.catch(() => {})`); sin buscador, **sin tabla** (tarjetas apiladas), **sin
paginación**; el *error* solo existe como toast; **permisos: ninguno**, y **la ruta es huérfana**:
ningún enlace del repositorio apunta a ella.

| # | Tipo | Etiqueta exacta | Qué agrupa | Controles | Archivo:línea de montaje |
|---|---|---|---|---|---|
| 1 | *(contenedor)* | `Sitio Web` (`org.branding.title`) | Cabecera, «Actualizar», chip de estado, esqueleto, vacío/error, «Reintentar», 10 toasts y el enrutador de guardado | 27 | src/app/app/organizacion/branding/page.tsx:232-384 |
| 2 | pestaña | `Tema` | Vista previa en iframe, filtro de tipo de negocio, presets, modo claro/oscuro, 5 selectores de color, tipografía, control de tamaño de logo | 35 | src/app/app/organizacion/branding/page.tsx:321-330 |
| 3 | pestaña | `Páginas` | Gestor de menús, lista de páginas con publicar/eliminar/editar, diálogo de creación, renombrar y dos `ConfirmDialog` | 44 | src/app/app/organizacion/branding/page.tsx:315-319 |
| 4 | pestaña | `Checkout` | Modo de pago, 3 tipos de entrega, tarifa plana de envío, sellos de confianza, logos de pago — **sin i18n en absoluto** | 26 | src/app/app/organizacion/branding/page.tsx:332-334 |
| 5 | pestaña | `SEO` | Favicon, palabras clave con «Sugerir con IA», dominio y subdominio, URL canónica, verificaciones de Google y Bing | 29 | src/app/app/organizacion/branding/page.tsx:336-343 |
| 6 | pestaña | `Contenido` | Tres sub-pestañas: 6 redes sociales, 7 días de horario, texto y enlaces del pie | 21 | src/app/app/organizacion/branding/page.tsx:345-352 |
| 7 | pestaña | `Avanzado` | Id de Google Analytics, CSS propio y **scripts inyectables sin saneado**, más 3 KPI de conteo | 15 | src/app/app/organizacion/branding/page.tsx:354-360 |
| 8 | pestaña | `Publicación` | Estado del sitio, URL con copiar y abrir, publicar/despublicar, lista de 5 comprobaciones, restablecer plantilla, 4 KPI | 25 | src/app/app/organizacion/branding/page.tsx:362-372 |
| 9 | *(página)* | `Moderación de Reseñas` *(literal, sin i18n)* | Cabecera y spinner de la página de reseñas | 3 | src/app/app/organizacion/branding/reviews/page.tsx:10-24 |
| 10 | *(panel)* | `ReviewsModerationPanel` | Filtros de estado y producto, tarjetas de reseña con estrellas y badges, aprobar/rechazar/desaprobar/responder, 6 toasts — **todo en español duro** | 35 | src/components/organization/reviews/ReviewsModerationPanel.tsx:133-333 |
| 11 | *(editor)* | `Redirigiendo al editor...` | **Puente de redirección** que saca el editor visual del `AppLayout`; el editor real vive en `src/app/organizacion/branding/editor/[pageId]/page.tsx` y `src/components/organization/branding/editor/**` | 1 | src/app/app/organizacion/branding/editor/[pageId]/page.tsx:13-19 |
| 12 | pestaña | `BrandingHeroTab` — **MUERTA** | Textos del hero, imagen o vídeo de fondo, llamada a la acción; exportada en `index.ts:2` pero **nunca montada** | 15 | src/components/organization/branding/index.ts:2 *(sin montaje)* |
| 13 | pestaña | `BrandingSectionsTab` — **MUERTA** | 10 interruptores de secciones del sitio y una lista de orden no reordenable | 6 | src/components/organization/branding/index.ts:3 *(sin montaje)* |
| 14 | pestaña | `BrandingFeaturesTab` — **MUERTA** | 6 interruptores de funcionalidades con badge «Módulo requerido» y resumen | 8 | src/components/organization/branding/index.ts:4 *(sin montaje)* |

**290 controles**: 247 alcanzables, 29 en las tres pestañas muertas y 14 montados pero sin efecto.

---

## D. Favoritos y «organización principal»

### D.1 Qué pasa hoy

**Los favoritos viven solo en `localStorage`.** La clave es `favoriteOrgIds`, un array JSON de
enteros:

| Dónde | Lectura | Escritura | Uso |
|---|---|---|---|
| `/auth/select-organization` | `select-organization/page.tsx:36-45` | `:48-58` (`localStorage.setItem('favoriteOrgIds', …)`) | Orden (`:75-81`) y borde ámbar de la tarjeta (`:350-354`) |
| Popup del login | `login/page.tsx:274-283` | `:286-295` | Orden (`:312-322`) y estrella rellena (`:593-601`) |

Consecuencia directa de lo que reporta el dueño: **`localStorage` es por navegador y por
dispositivo**. Marcar una favorita en el portátil no la marca en el computador de la tienda, ni en
la app móvil, ni en una ventana de incógnito, ni tras limpiar los datos del sitio. Nada de esto se
sincroniza y no hay ninguna columna en la base de datos que lo guarde.

Hay además dos defectos menores en la misma función:

- El orden es un `sort` estable por «es favorita o no» (`select-organization/page.tsx:75-81`,
  `login/page.tsx:317-321`). **Dentro del grupo de favoritas no hay criterio**, y el grupo de no
  favoritas conserva el orden en que llegó de la consulta, que no está ordenada (`:166-185`).
- En `select-organization` el `id` viaja como `string` (`interface Organization`,
  `select-organization/page.tsx:15`) y se compara con `Number(org.id)` contra un array de números
  (`:77-78`, `:344`, `:359`). Funciona, pero el popup del login usa `number` directo
  (`login/page.tsx:318`), así que las dos pantallas escriben en la misma clave con dos tipos
  distintos de origen. Basta un `JSON.parse` de un valor escrito por la otra pantalla con ids como
  cadena para que la comparación falle en silencio.

**«Principal» no existe como concepto.** Lo más parecido es `profiles.last_org_id`, que es
«la última usada»:

| Dónde | Qué hace | Archivo:línea |
|---|---|---|
| Al elegir organización | `update({ last_org_id })` | `select-organization/page.tsx:238-246` |
| Tras el acceso | Fallback si no hay organización en `localStorage` | `lib/auth/organizationAuth.ts:198-224` |
| Al montar la app | Fallback en el `AppLayout` | `components/app-layout/AppLayout.tsx:923-933` |
| Al cambiar de organización | `guardarLastOrgId` | `lib/hooks/useOrganization.ts:229-248` |
| Acceso de super admin | `update({ last_org_id })` | `app/auth/super-admin-access/page.tsx:63-70` |
| Registro | `update({ last_org_id })` ×2 | `app/auth/signup/page.tsx:402-404`, `:616-619` |

**Ninguna de las dos listas usa `last_org_id` para ordenar ni para marcar nada.** Ni el popup del
login (`login/page.tsx:312-322`) ni la pantalla de selección (`select-organization/page.tsx:75-81`)
lo consultan siquiera. Por eso «no sale la principal arriba»: no hay nada que la ponga arriba.

### D.2 Lo que dice la base de datos (verificado por MCP, solo lectura)

`organization_members` — columnas actuales:

| Columna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | `bigint` | NO | — |
| `organization_id` | `integer` | NO | — |
| `user_id` | `uuid` | NO | — |
| `created_at` | `timestamptz` | NO | `now()` |
| `is_super_admin` | `boolean` | SÍ | `false` |
| `is_active` | `boolean` | SÍ | `true` |
| `role_id` | `integer` | NO | — |
| `job_position_id` | `uuid` | SÍ | — |
| `is_temporary` | `boolean` | SÍ | `false` |

`profiles` — columnas actuales: `id` (uuid, NOT NULL), `email` (NOT NULL), `first_name`,
`last_name`, `avatar_url`, `created_at`, `updated_at`, `department`, `status` (default `'active'`),
`phone`, `metadata` (jsonb, default `'{}'`), `preferred_language` (default `'es'`),
**`last_org_id` (integer, nulo permitido, sin default)**, `auth_provider` (default `'email'`).

Restricciones de `organization_members`: `PRIMARY KEY (id)` y cinco claves foráneas
(`organization_id`, `user_id` ×2 —a `auth.users` y a `profiles`—, `role_id`, `job_position_id`).
**No hay `UNIQUE (organization_id, user_id)`.** Hoy no hay pares duplicados (0 en la consulta),
pero nada lo impide.

Tamaño real del problema (mismo día):

| Métrica | Valor |
|---|---|
| Usuarios con membresía | 121 |
| …con exactamente 1 organización | 111 (91,7 %) |
| …con 2 a 4 organizaciones | 9 |
| …con 5 o más | 1 (máximo: 7) |
| Perfiles totales | 131 |
| Perfiles con `last_org_id` nulo | 16 |
| Membresías | 138 (0 inactivas) |

### D.3 Modelo persistente propuesto

**Aditivo, sin `DROP` ni cambios de tipo**, como exige la política de migraciones.

1. **`organization_members.is_favorite boolean not null default false`.** Es el sitio correcto: el
   favorito es una propiedad de la relación usuario↔organización, no del usuario ni de la
   organización. Viaja con la membresía, muere con ella (`ON DELETE CASCADE` ya existente) y RLS lo
   protege con la misma política de pertenencia que ya cubre la tabla. Escribir un favorito pasa a
   ser un `update` de una fila que el propio usuario ya puede ver.
   - Antes de añadir la columna hace falta **`create unique index concurrently … on
     organization_members (organization_id, user_id)`**, porque hoy no existe y sin ella un
     `upsert` de favorito no tiene `onConflict` seguro (la misma trampa documentada para
     `stock_levels`). Hoy hay 0 duplicados, así que el índice entra limpio.
   - Migración con su `.sql` en `supabase/migrations/` y su reversión en `supabase/rollbacks/`.
2. **`profiles.last_org_id` se conserva tal cual**, con su significado actual: **«la última
   usada»**. Es lo que necesita el arranque de la app y ya lo escriben seis sitios. No se toca.
3. **¿Hace falta además una «principal» explícita, distinta de la última usada?** Sí, pero **no
   como columna nueva**: se deriva. La regla propuesta, en este orden:
   1. Si el usuario tiene **exactamente una** organización (111 de 121 usuarios hoy), no hay
      pantalla de selección: se entra directo. Con eso se elimina la fricción del popup que hoy
      aparece con `organizations.length >= 1` (`lib/auth/emailAuth.ts:116`, `:158`) para el 91,7 %
      de los usuarios.
   2. Si tiene varias, la lista se ordena: **favoritas** (`is_favorite`) → **última usada**
      (`profiles.last_org_id`) → resto, y dentro de cada grupo por nombre.
   3. La que encabeza la lista lleva el distintivo **«Principal»** (badge `Tono=marca,
      Variant=suave`) y el foco inicial del teclado. Si el usuario marca una favorita, esa manda
      sobre la última usada; si no hay ninguna favorita, manda la última usada.

   Una columna `is_primary` separada obligaría a garantizar «una sola por usuario» con un índice
   parcial único y a resolver qué pasa cuando el usuario pierde esa membresía. Derivarla de
   `is_favorite` + `last_org_id` da el mismo resultado visible sin estado nuevo que mantener.
   Si más adelante el dueño quiere fijar una principal que **no** sea favorita, la columna
   `is_favorite` ya sirve: «principal» sería sencillamente «la única favorita», y el caso de varias
   favoritas se resuelve con el orden del punto 2.
4. **Usuarios con muchas organizaciones.** El caso real máximo es 7, y solo un usuario. Con 7
   tarjetas la rejilla cabe sin paginar, pero el diseño debe aguantar más: buscador siempre visible
   (hoy solo aparece con más de 3 en el popup del login, `login/page.tsx:553`), favoritas fijadas
   arriba en su propio grupo con encabezado, y **paginación única del kit** a partir de 12
   organizaciones. El atajo de teclado `1`–`9` selecciona la enésima de la lista visible y
   `↑ ↓ Enter` navegan; ambos son **Nuevos**.
5. **Migración de los favoritos que ya existen en `localStorage`.** Al entrar por primera vez tras
   el cambio, si hay `favoriteOrgIds` en `localStorage` y el usuario es miembro de esas
   organizaciones, se escriben como `is_favorite = true` y se borra la clave. Es un efecto único y
   sin pérdida. Es **Nuevo**.



---

## E. Lo roto o sin efecto

### E.1 Seguridad del acceso

| Hallazgo | Archivo:línea |
|---|---|
| **La contraseña en claro se guarda en `localStorage`.** «Recordarme» escribe `userPassword` ofuscado con `btoa(pw).split('').reverse().join('')`, que es reversible en una línea, y la relee al montar el formulario. Cualquier XSS en el dominio, o cualquiera con acceso al equipo, se lleva la contraseña. | `app/auth/login/page.tsx:232-233` (escritura) · `:388-396` (lectura) |
| `clearAuthData()` de la sesión expirada borra `rememberMe`, `userEmail`, `currentOrganizationId` y `currentOrganizationType`, **pero no `userPassword`**: tras «cerrar» la sesión la contraseña sigue en el navegador. | `app/auth/session-expired/page.tsx:23-26` vs `app/auth/login/page.tsx:233` |
| El acceso biométrico lee esa misma contraseña guardada y hace `signInWithPassword` con ella. | `app/auth/login/page.tsx:179-196` |
| **La RPC `get_auth_provider_by_email` es `SECURITY DEFINER` y está concedida a `anon`** (verificado por MCP: `anon_execute = true`). Cualquiera, sin sesión, puede preguntar si un correo existe y con qué proveedor entra: es un oráculo de enumeración de cuentas. | `lib/auth/checkProvider.ts:9-10`, invocado en `app/auth/login/page.tsx:210-217` y `app/auth/forgot-password/page.tsx:64-73` |
| **Los mensajes de error distinguen «usuario no existe» de «contraseña incorrecta»**: `El usuario no existe o las credenciales son incorrectas…` y `El usuario no existe. ¿Quieres crear una cuenta nueva?`. Además el formulario enseña «Crear una cuenta nueva» **solo cuando el texto contiene la cadena `El usuario no existe`**, lo que confirma al atacante que el correo no está registrado. | `lib/auth/emailAuth.ts:218-238` · `app/auth/login/page.tsx:506-512` |
| `POST /api/auth/check-email` se llama con antirrebote al teclear el correo en el registro, y pinta `Correo disponible` o `Este correo ya está registrado`: segundo oráculo de enumeración, esta vez en la propia interfaz. | `components/auth/RegistrationForm.tsx:62-90`, `:241-252` |
| **Tres políticas de contraseña distintas para la misma cuenta**: registro exige solo 8 caracteres; la invitación, solo 8; restablecer exige 8 + mayúscula + minúscula + número + símbolo. | `components/auth/RegistrationForm.tsx:167-173` · `components/auth/InvitationWizard.tsx:100-102` · `app/auth/reset-password/page.tsx:80-100` |
| **No existe aceptación de términos ni de política de privacidad** en el registro. Las claves `auth.signup.termsAgree`, `auth.signup.terms` y `auth.signup.privacy` están en `messages/es.json` y ningún componente las usa. | `messages/es.json` (sin consumidores en `src/`) |
| El código de invitación se genera con `Math.random().toString(36).substring(2, 10)`: 8 caracteres no criptográficos para la llave de entrada a la organización. | `components/organization/InvitationsTab.tsx:358` |
| El token de verificación de dominio se genera con `Math.random()` **en el cliente** y se inserta tal cual, sin validación en servidor de pertenencia. | `components/organization/dominios/AddCustomDomainDialog.tsx:39-41` |
| Cuando el envío del correo de invitación falla, la interfaz **muestra la URL de invitación en claro** al administrador para que la reenvíe a mano. | `components/organization/InvitationsTab.tsx:407`, `:414`, `:527`, `:534` |

### E.2 Seguridad del módulo Organización

| Hallazgo | Archivo:línea |
|---|---|
| **`GET`/`POST /api/modules` usan el cliente *service role* y toman `organizationId` del query o del body sin verificar sesión ni pertenencia.** Cualquiera activa o desactiva módulos de cualquier organización. Incumple la regla 5 de `CLAUDE.md`. | `src/app/api/modules/route.ts:25, 28, 38, 65, 68, 81` |
| **`GET`/`POST /api/modules/pages`: mismo patrón.** | `src/app/api/modules/pages/route.ts:23, 26, 35, 60, 63, 72` |
| **`/api/product-reviews` usa `getSupabaseAdmin()` sin autenticar**: el `GET` lista reseñas de cualquier `organizationId` y el `PATCH` aprueba, rechaza o responde cualquier `reviewId` sin comprobar a qué organización pertenece. | `src/app/api/product-reviews/route.ts:12-19, 41, 74-106` |
| Ninguna de esas cuatro rutas usa `getServerOrgContext()` ni `withOrg`. | *(grep vacío en `src/app/api/modules/`)* |
| `useOrgAdmin` decide con **ids de rol cableados** (`userRole === 2 \|\| userRole === 1`) y lee la organización de `localStorage.currentOrganizationId`. Incumple la regla 6. | `src/components/organization/useOrgAdmin.ts:44, 121` |
| `/plan` **duplica** esa lógica en vez de reutilizar el hook, con un comentario «Assuming…». | `src/app/app/organizacion/plan/page.tsx:63-114` |
| **`/modulos`, `/dominios`, `/branding` y `/branding/reviews` no comprueban permisos en absoluto.** | `modulos/page.tsx` *(sin `useOrgAdmin`)* · `dominios/page.tsx:44` · `branding/page.tsx:44` |
| `OrganizationList` copia el `role_id` de la organización **activa** a todas las filas con respaldo `\|\| 2` (administrador), así que `showActions && org.role_id === 2` es casi siempre cierto y muestra desactivar, cambiar plan y eliminar donde no corresponde. | `src/components/organization/OrganizationList.tsx:178, 489, 195, 518` |
| `BranchesTab` no tiene **ni una** comprobación de permiso: crear, editar, eliminar, publicar el sitio y asignar gerente se pintan siempre. | `src/components/organization/BranchesTab.tsx` *(todo el archivo)* |
| El sidebar deriva permisos **del nombre del rol** contra una lista cableada. | `src/components/app-layout/Sidebar/SidebarNavigation.tsx:421` |
| `custom_scripts` —HTML y JavaScript arbitrarios que se cargan al final del `body` del sitio público— se guarda **sin saneado ni comprobación de rol**. | `src/components/organization/branding/BrandingAdvancedTab.tsx:142-157` |
| El cliente se auto-concede `role_id: 2` e `is_super_admin: true` al crear una organización, en los tres caminos. | `CreateOrganizationWizard.tsx:161-169` · `signup/page.tsx:352-364` · `CreateOrganizationForm.tsx:386-394` |
| `console.log` en producción con datos de la organización, de los miembros y correos, incluido `session.user.id`. | `OrganizationInfoTab.tsx:80, 90, 232` · `MembersTab.tsx:109` · `BranchAssignmentModal.tsx:137` · `InvitationsTab.tsx:333, 410, 530` · `OrganizationList.tsx:204-206, 214-215` · `api/modules/route.ts:70, 83, 88, 104, 121, 131` |

### E.3 Escrituras no transaccionales al crear una organización

Ningún camino tiene reversión. Casos concretos, todos en el navegador:

| Hallazgo | Archivo:línea |
|---|---|
| Si falla la membresía, la organización **ya existe** y el usuario **no es miembro de ella**: queda huérfana y ni siquiera la ve para borrarla. | `CreateOrganizationWizard.tsx:157, 170` |
| Si falla el `UPDATE` de la sucursal, la organización y la membresía ya están escritas; el `throw` deja un error crudo y una organización a medias. | `CreateOrganizationWizard.tsx:215` · `signup/page.tsx:450` |
| `profiles.last_org_id` se escribe **sin comprobar el error**; si falla, el servidor sigue resolviendo otra organización. | `CreateOrganizationWizard.tsx:173` |
| `member_branches` falla **en silencio**: el creador no aparece asignado a su propia sucursal. | `CreateOrganizationWizard.tsx:227-231` · `signup/page.tsx:487-495` |
| El fallo de Stripe es explícitamente «no bloqueante»: la organización queda en `trialing` sin suscripción en Stripe y **nadie se entera**. | `CreateOrganizationWizard.tsx:282-284` · `signup/page.tsx:557-559` |
| En el camino de éxito **no se hace `setLoading(false)`**, así que el botón queda bloqueado tras crear. | `CreateOrganizationWizard.tsx:303` vs `:304-308` |
| Tras crear, se disparan `fetchOrganizations` y `handleSelectOrganization` **en paralelo**; el primero puede sobrescribir la organización activa recién elegida. | `OrganizationSelector.tsx:277-284`, `:363-370` vs `:116-121` |
| `BranchAssignmentModal` hace `delete` de todas las asignaciones y luego `insert`; si el `insert` falla, el miembro queda **sin ninguna sucursal**. | `BranchAssignmentModal.tsx:140-156` |

### E.4 Botones y controles que no hacen nada

| Hallazgo | Archivo:línea |
|---|---|
| **`BranchForm` se monta con `noFormWrapper={true}`**, así que se renderiza como `<div id="branch-form">` y no como `<form>`. El botón `type="submit"` del encabezado **no hace nada**, y como `hideSubmitButton` usa su valor por defecto `false`, el usuario ve **dos botones «Crear Sucursal»** y el de arriba es inerte. | `BranchesTab.tsx:944` · `BranchForm.tsx:58, 285-303, 903` |
| Consecuencia: el `required` de `Nombre *` **nunca se evalúa** y `handleSubmit` tampoco valida el nombre. Se puede enviar una sucursal sin nombre y el error llega como excepción cruda de Postgres. | `BranchForm.tsx:323, 205-260` |
| **«Publicar Sitio» está permanentemente deshabilitado**: `checkMetaTitle` y `checkMetaDesc` exigen `settings.meta_title` y `meta_description`, campos que **la pestaña SEO ya no tiene**. | `BrandingPublishTab.tsx:61-62, 67-68, 169` vs `BrandingSEOTab.tsx:186-189` |
| **Desde `ChangePlanModal` no se puede pasar de mensual a anual**: `currentPlanId` es el *código* del plan (`'pro'`) y nunca contiene `'yearly'`, así que el periodo arranca siempre en `monthly`; si el usuario solo cambia a anual, responde «Ya tienes este plan seleccionado.» | `ChangePlanModal.tsx:29-31, 55-60` |
| **Filtro de sucursal que nunca filtra**: `member.branch_id === localBranchFilter` compara un número contra el `value` de un `<select>` (texto) con `===`, siempre `false`; la lista queda vacía al elegir una sucursal. | `MembersTab.tsx:335` vs `:511` |
| `BrandingCheckoutTab` hace `.update()` sin `upsert` ni comprobar filas afectadas: si la organización no tiene fila, **no guarda nada y aun así dice «Configuración guardada»**. | `BrandingCheckoutTab.tsx:100-119` |
| `update()` sin `.select()` en el toggle de estado y en el borrado lógico: con 0 filas afectadas por RLS no hay error, y el estado optimista muestra el cambio aunque en la base no haya pasado nada. | `OrganizationList.tsx:209-212` · `ManageOrganizationsTab.tsx:66-69` |
| `e.key === 'Space'` nunca dispara (para la barra, `key` es `' '`): la rama de Espacio está muerta en 3 controles. | `OrganizationList.tsx:500, 536, 565` |
| **Las páginas de los módulos incluidos no se pueden gestionar**: la sección de submódulos solo se pinta dentro del `map` de `paidModules`, así que las 9 páginas de `organizations` por las que el sidebar filtra **no tienen interfaz**. | `modulos/page.tsx:462-497` vs `:559` · `modulePages.ts:150-160` |
| La paginación no se reinicia al filtrar: desde la página 3, filtrar deja la tabla en blanco sin mostrar siquiera el vacío. | `MembersTab.tsx:351-353` · `InvitationsTab.tsx:613-615` |
| `colSpan={8}` en la fila de estado vacío sobre una tabla de **9** columnas. | `InvitationsTab.tsx:1025` vs `:992-1018` |
| Carga de municipios rota: `if (!data.state \|\| municipalities.length === 0)` lee `municipalities` del *closure* inicial, siempre `[]`, así que la consulta filtrada por departamento **queda pisada** por la genérica `.limit(500)`. | `OrganizationInfoTab.tsx:146` vs `:138-152` |
| `ConfirmDialog` de sucursales mal cableado: usa «Error al eliminar sucursal» como descripción y **la pregunta como etiqueta del botón rojo**. | `BranchesTab.tsx:1006-1007` |
| El aviso de límite de plan se inyecta en el `error` global, y ese `error` gobierna el render de la tabla: **al llegar al tope la tabla desaparece**. | `BranchesTab.tsx:198-201` vs `:580-588` |
| `onChange={handleChange}` sobre un input `readOnly`: nunca dispara. | `OrganizationInfoTab.tsx:622` |
| `onSelectMenu={() => {}}` — único handler vacío del módulo. | `BrandingPagesTab.tsx:597` |
| Tres mensajes de éxito que **nunca se renderizan** (`success` se asigna y no se pinta). | `MembersTab.tsx:37, 244, 291, 316` |
| `updatingRole`/`updatingStatus` se asignan y no se leen: los controles no se deshabilitan mientras guardan. | `MembersTab.tsx:38-39` |
| `ManageOrganizationsTab.tsx:44` usa `if (!orgToDelete) return;`: un id `0` cancelaría en silencio. | `ManageOrganizationsTab.tsx:44` |

**Componentes enteros sin consumidor** (95 controles inalcanzables en total):
`EnterpriseConfigModal.tsx` (8) · `dominios/DomainFilters.tsx` (17) · `dominios/ImportDialog.tsx`
(23) · `branding/BrandingHeroTab.tsx` (15) · `BrandingSectionsTab.tsx` (6) ·
`BrandingFeaturesTab.tsx` (8). En el acceso: `CreateOrganizationForm.tsx:361-411` (el `insert`
completo) y `lib/services/organizationService.ts:217-251`.

### E.5 `alert()` y `confirm()` nativos

| Literal | Archivo:línea |
|---|---|
| `if (confirm(t('confirmRemove')))` — borrado **físico** de una membresía | `components/organization/MembersTab.tsx:301` |
| `if (!confirm(t('confirmDelete')))` — borrado de método de pago | `components/organization/PaymentMethodCard.tsx:83` |
| `alert(t('reactivated'))` | `components/organization/PlanTab.tsx:383` |
| `alert(result.message)` — mensaje crudo del API dentro de un `alert` | `components/organization/PlanTab.tsx:446` |
| `if (!confirm('¿Eliminar este menú y todos sus items?'))` | `components/organization/branding/editor/MenuGroupManager.tsx:92` |

En el acceso y en los tres caminos de creación **no hay ninguno**. El repositorio ya tiene
`ConfirmDialog` y `AlertDialog`, bien usados en `BranchesTab.tsx:1002`,
`InvitationsTab.tsx:1114`, `ManageOrganizationsTab.tsx:165`, `BrandingPagesTab.tsx:615` y
`quotas/QuotaHistory.tsx:125`.

### E.6 Mensajes crudos de Supabase y Stripe mostrados al usuario

**En el acceso**: `emailAuth.ts:240-243` (cualquier error no contemplado, en inglés) ·
`forgot-password/page.tsx:90-94` y `:120-124` · `reset-password/page.tsx:144-148` ·
`select-organization/page.tsx:216-221` y `:261-266` · `login/page.tsx:193` (biometría) ·
`signup/page.tsx:776` · `InvitationWizard.tsx:292`.

**En la creación de organización**: `CreateOrganizationWizard.tsx:157` → `:306` → `:341-343` ·
`CreateOrganizationForm.tsx:382` → `:413` → `:1118` · `ManageOrganizationsTab.tsx:59`/`:71` →
`:106` → `:134`.

**En el módulo Organización**: 35 sitios con el patrón `setError(err.message || t('...'))`, que
solo usa la traducción cuando el mensaje viene vacío. `OrganizationInfoTab.tsx:156, 270, 315` ·
`MembersTab.tsx:170, 247, 294, 322` · `BranchAssignmentModal.tsx:178` · `InvitationsTab.tsx:227,
432, 460, 541` · `BranchesTab.tsx:171, 231, 321, 338` · `BranchForm.tsx:258` · `PlanTab.tsx:347,
387, 410, 453` · `ChangePlanModal.tsx:97` · `BuyUsersModal.tsx:69, 79` · `BuyBranchesModal.tsx:69,
79` · `BuyAiCreditsModal.tsx:77, 87` · `PaymentMethodCard.tsx:76, 112, 145` ·
`EnterpriseConfigModal.tsx:100` · `OrganizationList.tsx:188, 228, 256` · `dominios/page.tsx:154` ·
`AddCustomDomainDialog.tsx:103, 136` · `SubdomainManager.tsx:188` · `DomainForm.tsx:108` ·
`BuyDomainDialog.tsx:245`.

**Agravante**: en `MembersTab` (:558), `BranchesTab` (:580) y `OrganizationList` (:264) el error
**reemplaza toda la vista**, no hay botón de reintentar y nunca se limpia. Un fallo de RLS al
cambiar un rol deja una pantalla roja con jerga de Postgres y la lista desaparecida.

El contraejemplo correcto es `quotas/useMemberQuotas.ts:57` y `quotas/QuotaEditor.tsx:71`, que
normalizan con `describeError`.

### E.7 Reglas de fechas del proyecto

- **`.split('T')[0]` sobre valores de la base de datos: cero ocurrencias**, ni en el acceso, ni en
  los tres caminos de creación, ni en el módulo Organización. Limpio.
- **`formatDate` / `parseLocalDate` de `@/utils/Utils`: cero importaciones.** De ese módulo solo se
  trae `cn` (25 archivos) y `formatCurrency` (`quotas/QuotaHistory.tsx:19`).
- **Pero sí está el equivalente funcional que la regla 3 prohíbe**: formatear con la zona del
  navegador en vez de con `formatDateInTz` / `useFormatDate`.

| Patrón | Archivo:línea |
|---|---|
| `new Date(member.created_at).toLocaleDateString()` — además guarda la fecha **ya formateada** en el estado, así que la columna no se puede ordenar | `MembersTab.tsx:146` |
| `toLocaleDateString()` sobre fechas de invitación | `InvitationsTab.tsx:215-216` |
| `current_period_start`/`end` (timestamptz) con `toLocaleDateString('es-ES')`, **locale cableado** | `PlanTab.tsx:459-465` |
| `toLocaleDateString()` / `toLocaleString()` sobre fechas de dominio | `dominios/DomainCard.tsx:249, 271` · `DNSInstructions.tsx:211` |
| `toLocaleDateString()` sobre `updated_at` / `published_at` / `created_at` | `branding/BrandingThemeTab.tsx:142` · `BrandingPublishTab.tsx:126, 299` · `reviews/ReviewsModerationPanel.tsx:211` |

`quotas/quotaForm.ts:59-71` es el contraejemplo correcto: deriva las etiquetas de periodo **sin
`new Date()` local**.

### E.8 Rutas que no existen y rutas huérfanas

| Enlace | Estado | Archivo:línea |
|---|---|---|
| `/app/organizacion/${org.id}` — no existe ningún segmento dinámico bajo `organizacion` | **404** | `app-layout/Header/GlobalSearch.tsx:109` |
| `/app/organizacion/sucursales/${branch.id}` — bajo `sucursales/` solo hay `page.tsx` | **404** | `app-layout/Header/GlobalSearch.tsx:118` |
| `/app/organizacion/sucursales/configuracion` | **404** | `config/moduleConfig.ts:100` |
| `/app/organizacion/sucursales/empleados` | **404** | `config/moduleConfig.ts:101` |
| `/app/branding` (`moduleRoutes.branding`) — la ruta real es `/app/organizacion/branding` | **404** | `config/moduleConfig.ts:58` |
| `/app/roles/configuracion` | **404** | `config/moduleConfig.ts:56` |
| `/api/products` — el fallo se traga con `.catch(() => {})`, por eso el filtro de producto nunca se ve | **endpoint inexistente** | `reviews/ReviewsModerationPanel.tsx:84` |
| `/app/organizacion/branding/reviews` | **huérfana**: no está enlazada desde ningún sitio | *(sin enlaces en `src/`)* |

Verificadas como correctas: `/app/organizacion/plan`, `/app/plan`, `/app/plan/billing`,
`/app/plan/historial`, `/app/organizacion/informacion`, `/app/organizacion/dominios`,
`/auth/invite`, `/auth/select-organization`, `/app/inicio`.

**En el acceso**, el problema es el simétrico: el formulario de entrada solo interpreta cuatro
valores de `?error=` (`auth-callback-failed`, `corrupted-session`, `session-parse-error`,
`auth-failed`, `login/page.tsx:63-117`), pero `callback/route.ts` y `verify/route.ts` envían
además `email-verification-failed`, `verification-failed`, `email-verification-error`,
`invalid-verification-link`, `callback-processing-failed`, `email-changed` y
`google-session-expired`. Todos esos caen en el genérico **«Error al iniciar sesión»**, y el
parámetro `details` se descarta salvo en `auth-failed`.

### E.9 Claves de traducción muertas y textos en español duro

**Claves definidas y nunca usadas** (verificado por `grep` en `src/`):
`auth.signup.termsAgree`, `auth.signup.terms`, `auth.signup.privacy` ·
`auth.selectOrganization.noOrgs` («No tienes organizaciones asignadas»), `.loadingOrgs`,
`.selecting` · **todo el espacio `auth.verify.*`** (`title`, `subtitle`, `resend`, `resending`,
`checkInbox`, `didntReceive`) · `org.orgInfo.city`, `.cityPlaceholder`, `.emailPlaceholder`,
`.websitePlaceholder`, `.phonePlaceholder`, `.postalCodePlaceholder` ·
`org.invitationsTab.alreadyRegistered`, `.inviteUpdatedManual` · `org.branchesTab.loadingMap`,
`.loadingBranches`, `.noScheduleFormat`, `.closed` · `org.planTab.available` ·
`org.domains.errorSavingDomain`, `org.domains.subdomainMgr.placeholder`.
Y `org.branding.errorLoadingConfig` / `.errorLoadingConfigEmpty` tienen **exactamente el mismo
texto** (`messages/es.json:642` y `:655`).

**Español duro dentro de componentes que sí usan next-intl**: `BrandingCheckoutTab.tsx` y
`ReviewsModerationPanel.tsx` **enteros** · `reviews/page.tsx:21,23` · todo `BranchForm.tsx` · todo
el diálogo de detalle de sucursal (`BranchesTab.tsx:1043-1400`) · `formatOpeningHours`
(`BranchesTab.tsx:42-108`) · las carpetas `quotas/**` y los tres modales de compra ·
`dominios/page.tsx` (el título `'Error'` de 19 toasts) · `plan/page.tsx:209,216` ·
`PlanTab.tsx:841,857,872,888,912,916,932` ·
`InvitationsTab.tsx:835,884,895,904,912,922,930,960` · `MembersTab.tsx:731,735` ·
`modulos/page.tsx:571` · `OrganizationInfoTab.tsx:442,485,527,544,591,615,628`.
En el acceso, los cuatro *fallback* de `Suspense` dicen **`Loading...` en inglés**
(`login/page.tsx:873`, `signup/page.tsx:1024`, `reset-password/page.tsx:345`,
`invite/page.tsx:203`, `verify/failed/page.tsx:150`, `verify/resent/page.tsx:69`).

### E.10 Accesibilidad e inconsistencias visuales

- **El fondo animado no respeta `prefers-reduced-motion`** y, pese al comentario «Solo visible en
  desktop (>= lg)» (`AuthSceneBackground.tsx:7`), **se pinta igual en móvil**: 33 animaciones CSS
  simultáneas en 390 px.
- `auth/layout.tsx:1-11` pinta un degradado que **ninguna página deja ver**, porque todas ponen el
  suyo encima. Es código muerto.
- `select-organization`, `session-expired` y `super-admin-access` **no montan el fondo animado**:
  tres pantallas del mismo flujo con otro aspecto.
- `session-expired/page.tsx:88` y `:93` usan **la misma clave `t('login')`** para dos botones
  distintos, y el segundo lleva a `/` en vez de al formulario de entrada.
- El popup de organizaciones del login aparece con `organizations.length >= 1`
  (`emailAuth.ts:116`, `:158`) y su subtítulo dice «Tu cuenta está asociada a múltiples
  organizaciones» (`login/page.tsx:538`). **Con una sola organización el texto miente y el paso
  sobra**: hoy le pasa al 91,7 % de los usuarios (D.2).
- Botones solo con icono **sin `aria-label` ni `title`**: `OrganizationList.tsx:556` ·
  `BranchesTab.tsx:913, 1029` · `plan/page.tsx:176, 191` · `CouponInput.tsx:117-123` ·
  `EnterpriseConfigModal.tsx:125-130` · `InvitationsTab.tsx:690` ·
  `BrandingContentTab.tsx:250` · `BrandingCheckoutTab.tsx:422` · `modulos/page.tsx:532, 618`.
- Diálogos montados a mano **sin `role="dialog"`, sin trampa de foco y sin cierre con `Esc`**:
  `BranchAssignmentModal.tsx:187` · `BranchesTab.tsx:899, 1015` ·
  `EnterpriseConfigModal.tsx:109-118`. También el popup de organizaciones del login
  (`login/page.tsx:528-652`).
- Controles interactivos anidados: tres `<div role="button">` dentro de otro
  (`OrganizationList.tsx:450, 492, 518, 556`).
- Las 5 barras de «Límites del Plan» son `div` decorativos **sin `role="progressbar"`**
  (`PlanTab.tsx:820-926`), a diferencia de `QuotaProgressBar`, que lo hace bien.
- Tres sistemas de retroalimentación conviven en el mismo módulo: `useToast` solo en `/dominios` y
  `/branding`; bandas inline con `setError`/`setSuccess` en `/informacion`, `/miembros`,
  `/invitaciones`, `/sucursales`, `/plan`; `window.alert` en `PlanTab`. En
  `/mis-organizaciones` **no hay ninguno**: activar, cambiar de organización y eliminar no
  confirman nada.

### E.11 Precios y límites cableados en el cliente

| Valor | Archivo:línea |
|---|---|
| Enterprise: base `199`, módulo extra `49`, sucursal `59`, usuario `19`, crédito `0.01`, anual `×10` | `PlanTab.tsx:556-567` |
| Usuario extra `FALLBACK_UNIT_PRICE = 1000` centavos (y `setUnitPrice` nunca se llama) | `BuyUsersModal.tsx:24, 36` |
| Sucursal extra `FALLBACK_UNIT_PRICE = 800` centavos | `BuyBranchesModal.tsx:24, 36` |
| Crédito de IA `UNIT_PRICE_CENTS = 4`, bonos 10/15/20 %, paquetes fijos | `BuyAiCreditsModal.tsx:23-28, 30, 35-37` |
| Respaldo de `10000` créditos mensuales; `coreModulesCount` con respaldo `6`; defaults Enterprise `6/5/10/10000` | `PlanTab.tsx:327, 510` · `EnterpriseConfigModal.tsx:26-32` |
| Mapeo de plan **por nombre en español** (`'free'`/`'básico'`/`'profesional'`), duplicado entre `onClick` y `onKeyDown`; cualquier otro nombre cae a `'free'` | `OrganizationList.tsx:524-526, 541-543` |
| Ids de plan `5/3/2` en la creación, con **tres reglas distintas** (`includes` ×2, `startsWith` ×1) | `CreateOrganizationWizard.tsx:237-246` · `signup/page.tsx:300-301` · `auth/callback/route.ts:351` |

Contradice la regla del mapa de módulos: «Nunca cablees una lista de módulos ni de rutas:
consúltala». Aquí se cablean además los planes y sus precios.

### E.12 `any` y validaciones ausentes

**≈160 `any`** en el módulo Organización. Los peores, porque tiran el tipado de un payload entero:
`const safeData = data as any` antes de enrutar el guardado de branding (`branding/page.tsx:123`,
con `eslint-disable`) · `const d = data as any` y `} as any)` en el `update` de checkout
(`BrandingCheckoutTab.tsx:71, 113`) · `(branch as any).manager` repetido 7 veces porque el tipo
`Branch` no declara `manager` (`BranchesTab.tsx:658-1333`) · `(org as any).subscriptions`
(`OrganizationList.tsx:165`) · `t(roleTranslationKey as any)` para saltarse el tipado de claves de
next-intl (`MembersTab.tsx:677`).

**Ni un solo formulario del acceso ni del módulo usa un esquema** (Zod / react-hook-form), pese a
que `src/components/ui/form.tsx` existe. El único bien validado es el de cuotas
(`quotas/quotaForm.ts:48-57` + foco al primer error en `QuotaEditor.tsx:41-45`).

| Campo | Qué falta | Archivo:línea |
|---|---|---|
| `subdomain` de la organización | Sin formato de slug, sin unicidad, sin minúsculas | `OrganizationInfoTab.tsx:682` |
| `custom_domain` | Sin validación de dominio | `OrganizationInfoTab.tsx:699` |
| `primary_color` / `secondary_color` (texto) | Sin validación de hexadecimal | `OrganizationInfoTab.tsx:644, 667` |
| `dv` | `parseInt` sin comprobar que sea válido | `OrganizationInfoTab.tsx:249` |
| Sucursal del formulario de invitación | La etiqueta dice `Sucursal *` pero **no lleva `required`** | `InvitationsTab.tsx:886-893` |
| Filtro de rol de invitaciones | Compara contra `role_name` **ya traducido**: cambiar de idioma lo rompe | `InvitationsTab.tsx:591` |
| Filtro de estado de miembros | Compara contra `t('active')`/`t('inactive')` en vez del booleano, y `t` no está en las dependencias del `useMemo` | `MembersTab.tsx:330-342` |
| `name` de sucursal | Obligatorio en la base, sin validar (ver E.4) | `BranchForm.tsx:205-260` |
| Horarios de sucursal y de contenido web | No valida que el cierre sea posterior a la apertura | `BranchForm.tsx:509-524` · `BrandingContentTab.tsx:149-165` |
| Campos de compra de complementos | Solo `min` en HTML; `parseInt` puede dejar `NaN` en el estado | `BuyUsersModal.tsx:206-210` · `BuyBranchesModal.tsx:206-210` · `BuyAiCreditsModal.tsx:204-208` |
| `Email *` del contacto WHOIS | Solo `type="email"` sin `<form>`; `isContactValid()` solo comprueba que no esté vacío | `BuyDomainDialog.tsx:391-393, 185-191` |
| `País (código)` WHOIS | `/^[A-Z]{2}$/` sin lista ISO-3166 real | `BuyDomainDialog.tsx:437-439` |
| `analytics_id` | Acepta cualquier texto, no exige `G-XXXXXXXXXX` | `BrandingAdvancedTab.tsx:57-62` |
| `canonical_url`, URLs del pie, 6 redes sociales, verificaciones Google y Bing | Sin validación de URL | `BrandingSEOTab.tsx:440, 457, 469` · `BrandingContentTab.tsx:101, 240` |
| `shipping_flat_rate`, `free_shipping_threshold` | `type="number"` **sin `min`**: admiten negativos | `BrandingCheckoutTab.tsx:329-344` |
| Slug de página | Se sanea al crear pero **no al teclear**; sin unicidad ni longitud | `BrandingPagesTab.tsx:126` vs `:537` |
| Subdominio del sitio | Validación solo en cliente + `update` directo sin RPC: **carrera** entre el antirrebote y el guardado | `SubdomainManager.tsx:126-134` |
| `subdomain` en la creación | Se comprueba contra la base pero **sin unicidad garantizada**: hay ventana de carrera y nadie maneja el error de restricción | `CreateOrganizationForm.tsx:125-151` |
| `website`, `email`, `dv`, `phone` en la creación | **Todos los `required` y los `type="url"`/`type="email"` son decorativos**: el botón es `type="button"` y llama a `handleSubmit` a mano | `CreateOrganizationForm.tsx:1133-1135` |

### E.13 Paginación

**No hay ninguna paginación dibujada a mano.** El problema es el contrario: **ocho de diez páginas
no paginan nada** y traen la colección completa sin `limit`/`range`:

`OrganizationList.tsx:131-152` (organizaciones) · `BranchesTab.tsx:164-175, 616` (sucursales) ·
`dominios/page.tsx:444-462` (dominios) · `BrandingPagesTab.tsx:314, 425` (menús y páginas) ·
`BrandingThemeTab.tsx:200` (presets) · `ReviewsModerationPanel.tsx:188-333` + el `GET` de
`/api/product-reviews` sin `limit` (reseñas) · `PlanTab` (módulos, planes, métodos de pago,
historial de cuotas) · `modulos/page.tsx:461, 511` (módulos).

Y `DataTablePagination`, el componente del kit, trae **sus textos quemados en español sin i18n**:
`Mostrando {startItem} a {endItem} de {totalItems} registros` (`src/components/ui/DataTablePagination.tsx:77`)
y `Filas` (`:85`).

### E.14 Teléfonos: 5 formularios siguen con el input crudo

El componente correcto **ya existe**: `src/components/ui/phone-input.tsx` (selector de país con
bandera, `+57` por defecto, buscador, y `countryPhoneCodes` / `parsePhoneString` /
`formatPhoneForStorage` en `src/lib/data/countryPhoneCodes.ts`). Lo usan **16 formularios**:
`auth/InvitationForm`, `auth/InvitationWizard`, `auth/RegistrationForm`, `branches/BranchForm`,
`chat/conversations/nuevo/QuickCustomerDialog`, `clientes/CompanyContactsManager`,
`clientes/new/ClientForm`, `inventario/proveedores/FormularioProveedor`,
`organization/OrganizationInfoTab`, `organization/dominios/BuyDomainDialog`,
`profile/DatosPersonalesSection`, `transporte/boletos/TicketDialog`,
`transporte/direcciones-clientes/AddressDialog`, `transporte/envios/ShipmentDialog`,
`transporte/paradas/StopDialog`, `transporte/transportadoras/CarrierDialog`.

Quedan **cinco** con `<input type="tel">` crudo, sin prefijo de país ni normalización:

| Formulario | Campo | Archivo:línea |
|---|---|---|
| Configuración › CRM › Telefonía | `tel-mobile`, placeholder `+57 310 123 4567` escrito a mano | `src/components/configuracion/crm/telefonia/MyMobileSection.tsx:100` |
| Convertir referido | `convert-phone` | `src/components/crm/referidos/ConvertReferralDialog.tsx:126` |
| Datos de la persona referida | `referral-referred_phone` | `src/components/crm/referidos/ReferredPersonFields.tsx:46` |
| Selector de cliente del POS | teléfono del cliente rápido | `src/components/pos/customer-selector.tsx:178` |
| Cliente sin conexión | `offline-customer-phone` | `src/components/pos/OfflineCustomerDialog.tsx:147` |

**`src/components/voice/dock/Keypad.tsx:171` no cuenta**: es el teclado de marcación del módulo de
voz, donde `type="tel"` es lo correcto —se marca un número, no se captura un contacto— y no debe
migrarse.

Consecuencia: un teléfono guardado desde el POS entra sin `+57` y `parsePhoneString` no lo
reconoce, así que ese mismo contacto se ve distinto en el CRM y en la facturación.

### E.15 Municipio DANE y código postal están confundidos

Verificado por MCP. La tabla `municipalities` tiene:

| Columna | Tipo | Nulo |
|---|---|---|
| `id` | `uuid` | NO |
| `code` | `varchar` | NO |
| `name` | `text` | NO |
| `state_id` | `integer` | NO |
| `state_code` | `varchar` | NO |
| `state_name` | `text` | NO |
| `country_code` | `varchar` | NO |

**`code` es el código DANE**, de 5 dígitos, y `state_code` son sus dos primeros:

| `code` | `name` | `state_code` | `state_name` |
|---|---|---|---|
| `05001` | Medellín | `05` | Antioquia |
| `05079` | Bello | `05` | Antioquia |
| `05240` | Envigado | `05` | Antioquia |
| `76001` | Cali | `76` | Valle del Cauca |

Es el código que exige la DIAN en la facturación electrónica y el que viaja en
`fiscal_municipality_id` (lo consumen `api/factus/invoice/route.ts`, `clientes/new/ClientForm.tsx`,
`pos/CheckoutDialog.tsx`, `lib/offline/catalogReplicator.ts`, entre otros).

El **código postal** es otra cosa: en Colombia son **6 dígitos** (Medellín `050001`…). Hoy se
guarda como texto libre justo al lado del municipio, sin ninguna ayuda que los distinga
(`CreateOrganizationForm.tsx:970`, `OrganizationInfoTab.tsx:584-592`, `BranchForm.tsx:382-390`).

Y el departamento **no se lee de `state_code`, se recorta del `code` a mano**:

| Problema | Archivo:línea |
|---|---|
| `municipalities.find(m => m.code?.substring(0, 2) === e.target.value)` | `CreateOrganizationForm.tsx:930` |
| `<option value={m.code?.substring(0, 2) \|\| m.state_name}>` | `CreateOrganizationForm.tsx:945` |
| `.filter(m => !formData.stateCode \|\| m.code?.substring(0, 2) === formData.stateCode)` | `CreateOrganizationForm.tsx:963` |

Funciona por casualidad mientras todos los códigos tengan 5 dígitos y empiecen por el
departamento. `state_code` existe justo para eso y no se usa. A esto se suma que la carga de
municipios de `OrganizationInfoTab.tsx:146` está rota (E.4), así que el selector muestra siempre
los primeros 500 municipios del país.

---

## F. Planes y suscripción

### F.1 Qué hay hoy en la tabla `plans` (verificado por MCP)

Cinco filas. **`price_cop_month` y `price_cop_year` están en `NULL` en las cinco**, así que los
precios en pesos con los que se vende el producto **no están cargados**.

| id | code | name | activo | a medida | USD/mes | USD/año | usuarios | sucursales | módulos | créditos IA/mes | prueba |
|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | `free` | Plan Free | **No** | No | 0 | 0 | 2 | 1 | 2 | 0 | 0 |
| 2 | `pro` | Plan Pro | Sí | No | 20 | 199 | 3 | 1 | 12 | 500 | 15 |
| 3 | `business` | Plan Business | Sí | No | 49 | 490 | 10 | 5 | 16 | 2.000 | 30 |
| 4 | `enterprise` | Plan Enterprise | **No** | **Sí** | — | — | — | — | — | — | 30 |
| 5 | `ultimate` | Plan Ultimate | Sí | No | 199 | 1.990 | 30 | 15 | 19 | 10.000 | 30 |

Columnas de comunicación y de IA:

| code | SMS/mes | WhatsApp/mes | Minutos de voz | Agente de voz | `ai_model` | `ai_max_tokens` | Acumulado máx. de créditos |
|---|---:|---:|---:|---|---|---:|---:|
| `free` | 0 | 0 | 0 | No | `gpt-5.6-luna` | 2.000 | 0 |
| `pro` | 50 | 50 | 0 | No | `gpt-5.6-luna` | 4.000 | 500 |
| `business` | 200 | 200 | 30 | No | `gpt-5.6-luna` | 8.000 | 2.000 |
| `enterprise` | — | — | — | **Sí** | `gpt-5.6-luna` | 16.000 | 50.000 |
| `ultimate` | 1.000 | 1.000 | 200 | **Sí** | `gpt-5.6-luna` | 16.000 | 20.000 |

`module_config` (jsonb) por plan: `pro` → 3 core + 2 adicionales (`pos`, `inventory`),
`total_max_modules` 11; `business` → 3 core + 8 adicionales, 16; `ultimate` → 3 core + 15
adicionales, 18; `enterprise` → 6 core + 15 adicionales, 21; `free` → 6 core + 0, 6.

Identificadores de Stripe: `pro`, `business` y `ultimate` tienen `stripe_product_id` y los dos
`stripe_price_*_id`. `free` y `enterprise` los tienen en `NULL`.

### F.2 La contradicción: `features` (jsonb) frente a las columnas

Dentro de `features` hay llaves que **dicen otra cosa** que las columnas del mismo registro:

| Plan | `max_users` (columna) | `features.max_users` | `ai_credits_monthly` (columna) | `features.ai_credits_month` | `max_modules` | `module_config.total_max_modules` |
|---|---:|---:|---:|---:|---:|---:|
| `free` | 2 | 1 | 0 | 1.000 | 2 | 6 |
| `pro` | 3 | **10** | 500 | **5.000** | 12 | 11 |
| `business` | 10 | **20** | 2.000 | **10.000** | 16 | 16 |
| `ultimate` | 30 | 30 | 10.000 | 10.000 | 19 | 18 |

Dónde se vuelve visible:

- **En el registro, casi no se nota**, porque las viñetas que arma `getFeaturesForPlan`
  (`SubscriptionPlanSelector.tsx:333-383`) leen `max_modules` y `max_branches` **de columna** y de
  `features` solo `storage_gb`, `analytics`, `custom_reports`, `support` y `dedicated_manager`.
  **Ni el número de usuarios ni los créditos de IA se muestran en ninguna parte del registro.**
- **Salvo si falla la consulta**: el catálogo de respaldo cableado
  (`SubscriptionPlanSelector.tsx:224-321`) dice para Pro «3 usuarios» y «500 créditos IA» —los
  valores de columna— y se pinta **sin avisar de que son de respaldo**.
- **Explota después de contratar**: `PlanTab.tsx:322-327` calcula los créditos como
  `metadata.custom_config ?? plans.ai_credits_monthly ?? features.ai_credits_month ?? 10000`. Con
  la columna presente muestra 500; si llegara `NULL`, mostraría 5.000 mientras el servicio de
  créditos sigue otorgando lo de la columna. El tope de usuarios sí usa siempre la columna
  (`organizationLimitsService.ts:24, 39-40`, `InvitationsTab.tsx:113-118`, `MembersTab.tsx:84`):
  quien leyó «10 usuarios» se topa con el bloqueo al invitar al cuarto.

**Conclusión para el diseño**: la única fuente de verdad son las columnas. `features.max_users` y
`features.ai_credits_month` deberían borrarse o convertirse en vista derivada, y
`PlanTab.tsx:326` dejar de usarlas como respaldo.

### F.3 Qué planes usa realmente cada pantalla

| Pantalla | Qué planes ve el usuario | Filtro |
|---|---|---|
| Registro › paso 4 (`SubscriptionPlanSelector`) | `pro`, `business`, `ultimate` | `is_active = true` (`:44`) |
| Registro › `PriceSummary` | El que quedó en `formData`, **sin filtrar `is_active`** | `code` (`:41`) |
| Registro › `SubscriptionStep` (solo `trial_days`) | Ídem, **sin filtrar `is_active`** | `code` (`:71`) |
| `EnterpriseConfigSelector` | **Ninguno**: no consulta `plans`; cotiza con `/api/pricing/enterprise` | — |
| Panel › `PlanTab` comparador | Los activos | `is_active` |

**La contradicción de nombres**: los tres planes de pago **activos** son **Pro, Business y
Ultimate**. `enterprise` está **inactivo**, es `is_custom_enterprise` y lleva
`features.hidden_from_public = true`; `free` está **inactivo**. Es decir, hablar de «Enterprise,
Business y Pro» no corresponde con la base de datos: el plan alto que hoy se vende y se cobra por
Stripe se llama **Ultimate**, y «Enterprise» es el plan a medida, apagado. **Queda como pregunta
abierta nº 1 para el dueño** (ver J): si el plan alto debe llamarse Enterprise, hay que renombrar
`ultimate` o activar `enterprise` y migrar las suscripciones; el diseño se dibuja mientras tanto
con **Ultimate**, que es el nombre que ya aparece en el distintivo del encabezado de la app.

### F.4 El flujo de suscripción del registro, control por control

Cuatro componentes. Ninguno lee `price_cop_*`.

#### `components/auth/SubscriptionStep.tsx` (324 líneas)

Consulta `plans` **una sola vez y solo para `trial_days`** (`select('trial_days').eq('code',
planCode).single()`, :68-72), con `planCode = selectedPlan.replace('-yearly','')`. El precio y las
tarjetas los delega en `SubscriptionPlanSelector`; el cupón, en `POST /api/coupons/validate`. El
error de esa consulta **ni se captura** (:68 desestructura solo `data`).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Selecciona un plan` (`auth.signup.subscription.selectPlan`) | Título del paso | Siempre | SubscriptionStep.tsx:157 |
| 2 | texto | `Elige el plan que mejor se adapte a las necesidades de tu organización.` | Subtítulo | Siempre | SubscriptionStep.tsx:159 |
| 3 | cálculo | `Los planes incluyen un periodo de prueba de {days} días.` | Interpola `trial_days` | Siempre | SubscriptionStep.tsx:160 |
| 4 | pestaña | `Mensual` / `Anual -20%` *(literal, sin i18n)* | Cambia el periodo y reconstruye el id | Siempre | SubscriptionPlanSelector.tsx:127-148 |
| 5 | tabla | Nombre, precio, `Popular`, `✓ Seleccionado` / `Seleccionar` | **`div` clicable** que selecciona el plan | Una por plan activo | SubscriptionPlanSelector.tsx:156-216 |
| 6 | estado | `Cargando planes...` | Spinner mientras consulta `plans` | Al montar | SubscriptionPlanSelector.tsx:112-119 |
| 7 | texto | `¿Cómo quieres empezar?` | Encabeza el bloque de prueba | Siempre | SubscriptionStep.tsx:174-176 |
| 8 | campo | `Usar días gratis` | Pone `skipTrial = false` | Siempre | SubscriptionStep.tsx:185-195 |
| 9 | texto | `Prueba {days} días gratis sin cobro. Se cobrará al finalizar el período.` | Explica la prueba | Siempre | SubscriptionStep.tsx:196-198 |
| 10 | campo | `Pagar ahora` | Pone `skipTrial = true` | Siempre | SubscriptionStep.tsx:208-217 |
| 11 | texto | `Paga hoy y comienza tu suscripción inmediatamente, sin período de prueba.` | Explica el cobro inmediato | Siempre | SubscriptionStep.tsx:219-221 |
| 12 | texto | `¿Tienes un cupón de descuento?` | Encabeza el cupón | Siempre | SubscriptionStep.tsx:229-232 |
| 13 | campo | placeholder `Ingresa tu código` | Captura el código en mayúsculas | Sin cupón validado | SubscriptionStep.tsx:236-252 |
| 14 | atajo | `Enter` | Valida el cupón | Foco en el campo | SubscriptionStep.tsx:243-248 |
| 15 | botón | `Aplicar` | Llama a `/api/coupons/validate` | Sin cupón validado | SubscriptionStep.tsx:253-264 |
| 16 | estado | *(`Loader2` girando, sin texto)* | Validación en curso | `couponLoading` | SubscriptionStep.tsx:259-261 |
| 17 | chip | `{code} — {name}` + descripción | Cupón aplicado | Cupón válido | SubscriptionStep.tsx:267-278 |
| 18 | botón | *(icono `XCircle`, sin `aria-label`)* | Quita el cupón | Cupón válido | SubscriptionStep.tsx:279-285 |
| 19 | estado | Texto del endpoint / `Cupón no válido` / `Error al validar el cupón` | Fallo del cupón | `couponError` | SubscriptionStep.tsx:289-294 |
| 20 | cálculo | *(bloque `PriceSummary`)* | Resumen con descuento | Siempre | SubscriptionStep.tsx:298-303 |
| 21 | botón | `Volver` | Retrocede de paso | Siempre | SubscriptionStep.tsx:306-312 |
| 22 | botón | `Continuar` / `Cargando...` | Envía el paso | Siempre | SubscriptionStep.tsx:313-319 |

#### `components/auth/PriceSummary.tsx` (127 líneas)

`select('name, price_usd_month, price_usd_year').eq('code', planCode).single()` (:38-42), **sin
filtrar `is_active` ni mirar `is_custom_enterprise`**. No tiene estado de carga ni de error: si la
consulta falla, `planPrice` queda en `null` y **el componente no renderiza nada** (:55).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | *(render `null`)* | Oculta todo el resumen | `planPrice === null` | PriceSummary.tsx:55 |
| 2 | texto | `Resumen de pago` *(literal)* | Título del bloque | Con precio | PriceSummary.tsx:78-81 |
| 3 | texto | `Plan {planName} (mensual\|anual)` *(literal)* | Nombre y periodicidad | Con precio | PriceSummary.tsx:85 |
| 4 | cálculo | `${planPrice} /mes\|/año` | Precio de lista | Con precio | PriceSummary.tsx:86 |
| 5 | cálculo | `Descuento ({coupon.code})` · `-$X.XX` | Resta porcentaje o monto fijo | Descuento > 0 | PriceSummary.tsx:89-97 |
| 6 | texto | `{coupon.durationDescription}` | Vigencia del cupón | Con `durationMonths` | PriceSummary.tsx:99-103 |
| 7 | stat | `Total a pagar` · `${finalPrice}` | Total tras descuento | Con precio | PriceSummary.tsx:105-112 |
| 8 | estado | `Se cobrará ahora al verificar la tarjeta` *(literal)* | Advierte cobro inmediato | `skipTrial` | PriceSummary.tsx:115-118 |
| 9 | estado | `No se cobrará hasta que termine el período de prueba` *(literal)* | Tranquiliza | `!skipTrial` | PriceSummary.tsx:119-124 |

#### `components/auth/PaymentMethodStep.tsx` (341 líneas)

**No toca `plans`.** Al montar hace `POST /api/stripe/setup-intent` (:71-102) y tras confirmar
`GET /api/stripe/setup-intent?setupIntentId=…` (:151). La tarjeta la maneja Stripe Elements.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Método de Pago` | Título del paso | Siempre | PaymentMethodStep.tsx:187-189 |
| 2 | texto | `Ingresa tu método de pago. Se realizará el cobro hoy mismo.` | Cobro inmediato | `isPaidPlan && isPayNow` | PaymentMethodStep.tsx:191-193 |
| 3 | texto | `Agrega un método de pago para cuando termine tu período de prueba.` | Mensaje de prueba | `isPaidPlan && !isPayNow` | PaymentMethodStep.tsx:194 |
| 4 | texto | `Puedes agregar un método de pago ahora o más tarde.` | **Inalcanzable** (ver F.6) | `!isPaidPlan` | PaymentMethodStep.tsx:195 |
| 5 | badge | `No se realizará ningún cobro ahora` | Píldora verde | Plan de pago sin cobro ya | PaymentMethodStep.tsx:198-203 |
| 6 | badge | `Se cobrará hoy` | Píldora ámbar | `isPayNow` | PaymentMethodStep.tsx:204-209 |
| 7 | cálculo | *(`PriceSummary compact`)* | Repite el resumen | `isPaidPlan` | PaymentMethodStep.tsx:213-221 |
| 8 | estado | `¡Método de pago verificado!` + `VISA •••• 4242 - Exp. 12/2030` | Confirma la tarjeta | `paymentVerified` | PaymentMethodStep.tsx:224-237 |
| 9 | campo | `Información de la tarjeta` + `CardElement` | Captura en iframe de Stripe | Sin verificar | PaymentMethodStep.tsx:240-250 |
| 10 | texto | `Se realizará el cobro de tu primer período…` / `Solo verificamos que la tarjeta sea válida…` | Aclara qué pasa al enviar | Según `isPayNow` | PaymentMethodStep.tsx:251-253 |
| 11 | estado | `{error}` *(mensaje crudo de Stripe)* | Banner rojo | Hay `error` | PaymentMethodStep.tsx:256-261 |
| 12 | botón | `auth.signup.payment.payNow` *(**clave inexistente**)* / `Verificar Tarjeta` | Confirma el SetupIntent | Sin verificar | PaymentMethodStep.tsx:263-282 |
| 13 | estado | `Verificando...` + spinner | Bloquea el botón | `isProcessing` | PaymentMethodStep.tsx:268-275 |
| 14 | texto | `Pago seguro con Stripe` + `Tus datos están protegidos con encriptación de nivel bancario.` | Sello de confianza | Siempre | PaymentMethodStep.tsx:287-297 |
| 15 | botón | `Anterior` | Retrocede | Siempre | PaymentMethodStep.tsx:301-308 |
| 16 | botón | `Omitir por ahora` | Salta el paso; `disabled` si `isPayNow` | Siempre | PaymentMethodStep.tsx:310-317 |
| 17 | botón | `Continuar` | Avanza tras verificar | `paymentVerified` | PaymentMethodStep.tsx:319-329 |

#### `components/auth/EnterpriseConfigSelector.tsx` (313 líneas)

**No consulta `plans` en absoluto.** Módulos de `GET /api/modules/public` (:62) y precios unitarios
de `getEnterprisePricing()` → `GET /api/pricing/enterprise`, con **respaldo cableado** 199/49/59/19/3 USD
(`pricingService.ts:49-57`). Ambos `catch` solo hacen `console.error`. **Su único consumidor es
`organization/EnterpriseConfigModal.tsx:139`, que a su vez no tiene consumidores** (E.4): todo el
componente está muerto.

Resumen de sus 22 controles: estado `Cargando configuración...` (:127-134); resumen con
`Configuración Enterprise`, KPI de `Módulos`, `Sucursales`, `Usuarios`, `Precio estimado:` y
`(ahorras 2 meses)` (:142-170); desglose «Base $X + N módulos ($Yc/u) + …» (:174-182); campos
numéricos `Sucursales` (1-50), `Usuarios` (1-200) y `Créditos IA` (:191-235); rejilla
`Módulos Core (Incluidos)` (:242-255) y `Módulos Adicionales (Máx. 15)` con su contador
(:261-295); y el aviso `Nota: El precio final se calculará y confirmará antes de completar la
suscripción...` (:305-308).

### F.5 Lógica: qué está bien pensado

- **El cupón aplica bien porcentaje y monto fijo, y nunca deja el total en negativo.**
  `PriceSummary.tsx:63-70`: `fixed` → `Math.min(discountValue, planPrice)` y
  `finalPrice = Math.max(planPrice - discountAmount, 0)`.
- **La duración del cupón viaja como dato, no como cálculo del cliente.** El endpoint arma
  `durationDescription` tratando `0` y `null` como perpetuo (`coupons/validate/route.ts:75-82`) y el
  cliente solo lo pinta.
- **La validación del cupón está en el servidor y es completa**: existencia, `is_active`, ventana
  `valid_from`/`valid_until` y tope de redenciones (`route.ts:29-65`), devolviendo
  `200 {valid:false}` en vez de un 4xx: el cliente distingue «inválido» de «se cayó».
- **El código se normaliza en los dos lados** (`SubscriptionStep.tsx:240` y `route.ts:20`).
- **`skipTrial` se decide con radios excluyentes y un solo handler** (`SubscriptionStep.tsx:97-100`),
  y la regla dura «sin prueba ⇒ tarjeta obligatoria» **se hace cumplir en el servidor**
  (`create-subscription/route.ts:116-121`), no en el botón.
- **El sufijo `-yearly` se construye siempre desde la base**, nunca se acumula
  (`SubscriptionStep.tsx:91-94`), y se quita antes de consultar `plans.code` (`:67`,
  `PriceSummary.tsx:37`): el sufijo es un id de interfaz, no un `code` de base de datos.
- **`trial_days` se lee de la base por plan** y el mismo número se interpola en los tres textos que
  el usuario lee: no hay dos cifras distintas en la misma pantalla.
- **`PaymentMethodStep` separa «verificar» de «cobrar»**: usa SetupIntent, no PaymentIntent
  (:132-143), y deshabilita «Omitir por ahora» justo cuando el usuario eligió pagar hoy (:313).
- **El botón de verificar exige las tres condiciones reales** antes de habilitarse: Stripe cargado,
  tarjeta completa según Elements y SetupIntent creado (:265).
- **`PriceSummary` es un solo componente reutilizado en los dos pasos**: el resumen del paso 5 no
  puede divergir del paso 4.

### F.6 Lógica: qué falla

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | **`plan_id` numérico cableado**: `includes('ultimate') ? 5 : (includes('business') ? 3 : 2)` | `signup/page.tsx:305-306`, uso en `:575` |
| 2 | **`planCode` se deriva con `includes` y `else → 'pro'`**: un `code` nuevo se registra silenciosamente como Pro | `signup/page.tsx:507-512` |
| 3 | Plan por defecto `'pro'` cableado en tres sitios | `SubscriptionStep.tsx:51`, `:67`, `PriceSummary.tsx:37` |
| 4 | `trialDays` arranca en `15` cableado y `if (data?.trial_days)` **no resetea**: un plan con `0` o `null` deja los días del plan anterior | `SubscriptionStep.tsx:56, 73`; se repite en `signup/page.tsx:526` |
| 5 | **Catálogo de planes cableado como respaldo silencioso**: si falla la consulta se pintan precios y límites inventados **sin avisar** | `SubscriptionPlanSelector.tsx:86-89, 224-321` |
| 6 | Precios unitarios Enterprise cableados en el respaldo; el `catch` solo hace `console.error` | `pricingService.ts:49-57` · `EnterpriseConfigSelector.tsx:55-57` |
| 7 | **Tres definiciones distintas de «descuento anual»**: `-20 %` en la pestaña, `× 10` en Enterprise y `price_usd_year` en la tabla | `SubscriptionPlanSelector.tsx:147` · `EnterpriseConfigSelector.tsx:82-84` · `plans` |
| 8 | Lista de módulos core cableada y tope de 15 cableado, contra la regla «nunca cablees una lista de módulos» | `EnterpriseConfigSelector.tsx:35, 263, 272` |
| 9 | Se muestra `price_usd_*` con `$` a secas y etiquetas en español cableadas: en un registro en inglés el resumen sale en español, y `$` sin ISO es ambiguo en un producto que factura en Colombia | `PriceSummary.tsx:57-58, 80, 85, 93, 107, 117, 122` |
| 10 | **`price_cop_month` y `price_cop_year` no se consultan en ningún punto** del flujo, ni hay selector de moneda | — |
| 11 | Formateo sin `Intl`: `.toFixed(2)` produce «$1234.50» | `PriceSummary.tsx:86, 95, 109` · `EnterpriseConfigSelector.tsx:164, 181, 236` |
| 12 | `PriceSummary` y `SubscriptionStep` consultan `plans` **sin filtrar `is_active`**: un plan desactivado a mitad de registro sigue mostrando precio y prueba | `PriceSummary.tsx:38-42` · `SubscriptionStep.tsx:68-72` |
| 13 | **Un plan `is_custom_enterprise` rompe el resumen**: `parseFloat(null) → NaN`, la guarda `planPrice === null` no lo atrapa y se pinta literalmente **«$NaN /mes»** y «Total a pagar $NaN» | `PriceSummary.tsx:46-49, 55` |
| 14 | El mismo `NaN` con cualquier plan que tenga `price_usd_year` en `NULL` al pasar a Anual | `PriceSummary.tsx:46-49` |
| 15 | El error de Supabase se descarta en los tres `select`: el resumen «simplemente no aparece», sin estado de error ni reintento | `PriceSummary.tsx:38` · `SubscriptionStep.tsx:68` |
| 16 | **El error de Stripe llega crudo a la pantalla** | `PaymentMethodStep.tsx:146 → 166 → 259` |
| 17 | El endpoint de cupones devuelve `error.message` crudo en el 500 y se muestra tal cual | `coupons/validate/route.ts:98-104` → `SubscriptionStep.tsx:131, 292` |
| 18 | **`organizationId` sale del body y la comprobación de pertenencia se salta sin sesión** («Skip verificación membresía (signup sin sesión)»): cualquiera puede crear una suscripción sobre una organización ajena. Incumple la regla 5 | `create-subscription/route.ts:100, 125-142` |
| 19 | Respaldo de service role a la clave anónima en vez de fallar en el arranque | `create-subscription/route.ts:32` |
| 20 | `/api/coupons/validate` **sin autenticación ni límite de intentos**, con service role: permite enumerar cupones por fuerza bruta | `coupons/validate/route.ts:22-27` |
| 21 | El endpoint de cupones **no recibe el plan ni el periodo**: no puede haber cupones restringidos por plan, y el cupón nunca se revalida al cambiar de plan | `SubscriptionStep.tsx:102-140` |
| 22 | **El descuento mostrado puede no ser el que cobra Stripe**: se aplica al periodo completo sin mirar `durationMonths`, así que «30 % por 3 meses» sobre un plan anual muestra −30 % de los 12 meses | `PriceSummary.tsx:63-70` · `signup/page.tsx:546` |
| 23 | **Clave i18n inexistente**: `t('payNow')` en `auth.signup.payment` no existe en es, en, fr ni pt; quien elige «Pagar ahora» ve la ruta cruda de la traducción como etiqueta del botón principal | `PaymentMethodStep.tsx:279` |
| 24 | **`isPaidPlan` es siempre verdadero** (`!== 'free'`, y ningún id es `'free'`): el mensaje de plan gratis es texto inalcanzable y `'free-yearly'` también se consideraría de pago | `PaymentMethodStep.tsx:176, 195` |
| 25 | `billingPeriod` no se infiere del sufijo al montar: volver al paso con `pro-yearly` muestra las tarjetas mensuales y el precio mensual. La lógica existe, pero en `signup/page.tsx:516` | `SubscriptionStep.tsx:52-54` |
| 26 | `any` en `SubscriptionStep.tsx:36`, `PaymentMethodStep.tsx:29, 66, 104, 164`, `SubscriptionPlanSelector.tsx:333`, `create-subscription/route.ts:186` | — |
| 27 | `handleContinue` es un envoltorio vacío | `PaymentMethodStep.tsx:172-174` |
| 28 | **Rama muerta**: si `verifyData.success` es falso no se hace nada —ni error ni reintento— y el usuario ve el spinner apagarse sin explicación | `PaymentMethodStep.tsx:154-162` |
| 29 | `useEffect` con dependencias incompletas | `PaymentMethodStep.tsx:71-102` · `EnterpriseConfigSelector.tsx:46-49` |
| 30 | Los campos numéricos de Enterprise no se saturan: escribiendo «999» el precio sube sin tope | `EnterpriseConfigSelector.tsx:200, 216, 232` |
| 31 | Sin estado vacío en las rejillas de módulos: si la API falla se ven dos títulos y nada debajo | `EnterpriseConfigSelector.tsx:246-297` |
| 32 | `console.log` de diagnóstico en el camino caliente del selector | `SubscriptionPlanSelector.tsx:53, 66, 80, 84, 105, 106, 110` |
| 33 | **Las tarjetas de plan son `div` clicables sin rol ni teclado**: el control principal de la pantalla **no se puede usar con el teclado** | `SubscriptionPlanSelector.tsx:156-164, 205-213` |
| 34 | Botón de quitar cupón sin `aria-label` | `SubscriptionStep.tsx:279-285` |
| 35 | Campo de cupón sin `<label>` | `SubscriptionStep.tsx:236-252` |
| 36 | Mensajes de error sin `role="alert"` ni `aria-live` | `SubscriptionStep.tsx:289-294` · `PaymentMethodStep.tsx:256-261` |
| 37 | Spinners sin `role="status"` | `SubscriptionStep.tsx:259` · `SubscriptionPlanSelector.tsx:115` · `EnterpriseConfigSelector.tsx:130` · `PaymentMethodStep.tsx:270` |
| 38 | `<label>` sin `htmlFor` | `EnterpriseConfigSelector.tsx:191-235` · `PaymentMethodStep.tsx:242-244` |
| 39 | Toggles de módulo sin `aria-pressed`; contador «N/15» sin `aria-live` | `EnterpriseConfigSelector.tsx:275-295, 264-266` |
| 40 | **`PriceSummary` no tiene modo oscuro** mientras su hermano sí: en tema oscuro queda un bloque blanco | `PriceSummary.tsx:77-124` |
| 41 | `create-subscription` registra en claro correo, nombre, `userId` y el objeto completo en cada llamada | `create-subscription/route.ts:67-70, 76, 82, 89, 108, 161-163, 174, 184` |

### F.7 Qué columnas de `plans` usa cada componente

| Componente | Usa | No usa, existiendo |
|---|---|---|
| `SubscriptionStep` | `code` (filtro), `trial_days` | Todas las demás, incluidas `is_active` e `is_custom_enterprise` |
| `PriceSummary` | `code` (filtro), `name`, `price_usd_month`, `price_usd_year` | `price_cop_*`, `trial_days`, `max_*`, `ai_*`, `comm_*`, `module_config`, `features`, `is_active`, `is_custom_enterprise`, `stripe_price_*` |
| `PaymentMethodStep` | **Ninguna** | Todas; en particular `stripe_price_monthly_id`/`stripe_price_yearly_id`, que es justo lo que este paso necesitaría |
| `EnterpriseConfigSelector` | **Ninguna** | Todas; sobre todo `is_custom_enterprise`, `max_*`, `ai_credits_monthly` y `module_config`, que son los campos que pide al usuario a mano |
| `SubscriptionPlanSelector` | `code`, `name`, `price_usd_month`, `price_usd_year`, `trial_days`, `max_modules`, `max_branches`, `is_active`, y de `features`: `storage_gb`, `analytics`, `custom_reports`, `support`, `dedicated_manager` | `price_cop_*`, `max_users`, `ai_*`, `comm_*`, `module_config`, `is_custom_enterprise`, `stripe_*` |

**Columnas que no toca ningún punto del registro**: `price_cop_month`, `price_cop_year`,
`max_users`, `ai_credits_monthly`, `ai_credits_max_rollover`, `ai_model`, `ai_max_tokens`,
`comm_sms_monthly`, `comm_whatsapp_monthly`, `comm_voice_minutes_monthly`,
`comm_voice_agent_enabled`, `module_config`, `is_custom_enterprise`, `stripe_product_id`,
`stripe_price_monthly_id`, `stripe_price_yearly_id`.

### F.8 Lo que hace falta en la base de datos (no se toca aquí)

Si el dueño confirma precios y nombres, queda pendiente **una migración aparte**, fuera del alcance
de este documento:

1. **Cargar `price_cop_month` y `price_cop_year`** en las tres filas activas. Los precios que
   indica el dueño: 99.000 / 990.000, 189.000 / 1.890.000 y 990.000 / 9.990.000.
2. **Decidir el nombre del plan alto**: activar `enterprise` (hoy inactivo y `is_custom_enterprise`)
   o renombrar `ultimate`. Si se renombra, hay que migrar las suscripciones vivas que apunten al
   `code` antiguo y los `stripe_price_*`.
3. **Confirmar que `free` (id 1) sigue inactivo** y quitar de una vez el literal `'free'` del
   cliente (F.6 #24).
4. **Reconciliar `features` con las columnas** (F.2): borrar `features.max_users` y
   `features.ai_credits_month` o convertirlas en vista derivada.

### F.9 Precios en varias monedas, fijos por moneda

Decisión del dueño: los planes se venderán fuera de Colombia, así que **el precio se muestra en la
moneda del visitante**, pero **no se recalcula con la tasa del día**. Quiere precios estables y
redondos, que solo cambien cuando él los cambie. La tasa en vivo de OpenExchangeRates se sigue
usando para las operaciones del ERP —conversión de ventas, compras y cartera—, **nunca para
tarifar los planes**.

#### Qué hay hoy (verificado por MCP)

`currencies` tiene **10 monedas activas**, y sus decimales importan porque tres de ellas no
admiten céntimos:

| `code` | `name` | `symbol` | `decimals` |
|---|---|---|---:|
| `COP` | Peso colombiano | `$` | **0** |
| `USD` | Dólar estadounidense | `$` | 2 |
| `EUR` | Euro | `€` | 2 |
| `MXN` | Peso mexicano | `$` | 2 |
| `CLP` | Peso chileno | `$` | **0** |
| `BRL` | Real brasileño | `R$` | 2 |
| `GBP` | Libra esterlina | `£` | 2 |
| `CAD` | Dólar canadiense | `$` | 2 |
| `AUD` | Dólar australiano | `$` | 2 |
| `JPY` | Yen japonés | `¥` | **0** |

`currency_rates` (`id`, `code`, `rate_date`, `rate`, `source`, `api_data`, `base_currency_code`)
está al día: última fecha **2026-09-22**, origen `openexchangerates`, base `USD`. Tasas de ese día:

| Moneda | Tasa por 1 USD |
|---|---:|
| COP | 3.168,547766 |
| EUR | 0,872341 |
| MXN | 17,234202 |
| CLP | 947,400000 |
| BRL | 5,110700 |
| GBP | 0,748257 |
| CAD | 1,404174 |
| AUD | 1,407547 |
| JPY | 157,529250 |

**`plans` no tiene precios por moneda**: solo `price_usd_month` / `price_usd_year` y
`price_cop_month` / `price_cop_year`, y estas dos últimas están en `NULL` en las cinco filas (F.1).

#### Modelo propuesto (lo aplica el dueño en una migración aparte; aquí solo se documenta)

Tabla nueva **`plan_prices`**:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `bigint` | clave primaria |
| `plan_id` | `integer` | → `plans(id)`, `ON DELETE CASCADE` |
| `currency_code` | `varchar` | → `currencies(code)` |
| `price_month` | `numeric` | precio fijo, cargado a mano |
| `price_year` | `numeric` | precio fijo, cargado a mano |
| `is_active` | `boolean` | `not null default true` |
| `updated_at` | `timestamptz` | `default now()` |

Con **`unique (plan_id, currency_code)`**. Los precios **se cargan a mano por moneda y no se tocan
con la tasa**. `plans.price_usd_*` y `plans.price_cop_*` quedan como respaldo heredado, para no
romper lo que hoy los lee (`PriceSummary.tsx:40`, `SubscriptionPlanSelector.tsx`).

Regla de lectura para el diseño: **`plan_prices` manda**; si no hay fila para la moneda pedida, se
cae a la moneda por defecto del producto y **se dice**, en vez de convertir en vivo.

#### Precios de referencia — PENDIENTE DE APROBACIÓN DEL DUEÑO

Anclaje: los tres precios en pesos colombianos (99.000 / 189.000 / 990.000 al mes). El anual son
**diez meses**, es decir dos meses gratis, igual que el ancla en pesos. **Sin decimales en ninguna
moneda.**

| Plan | COP | USD | EUR | MXN | CLP | BRL | GBP | CAD | AUD | JPY |
|---|---|---|---|---|---|---|---|---|---|---|
| **Pro** mes | 99.000 | 29 | 25 | 499 | 29.000 | 149 | 23 | 39 | 45 | 4.500 |
| **Pro** año | 990.000 | 290 | 250 | 4.990 | 290.000 | 1.490 | 230 | 390 | 450 | 45.000 |
| **Business** mes | 189.000 | 59 | 49 | 999 | 57.000 | 299 | 45 | 79 | 89 | 9.000 |
| **Business** año | 1.890.000 | 590 | 490 | 9.990 | 570.000 | 2.990 | 450 | 790 | 890 | 90.000 |
| **Alto** mes | 990.000 | 299 | 259 | 5.200 | 299.000 | 1.590 | 229 | 419 | 459 | 46.000 |
| **Alto** año | 9.990.000 | 2.990 | 2.590 | 52.000 | 2.990.000 | 15.900 | 2.290 | 4.190 | 4.590 | 460.000 |

**Reglas de redondeo aplicadas**, por moneda:

| Moneda | Múltiplo | Decimales |
|---|---|---:|
| USD, EUR, GBP | 5 o 10 | 0 |
| CAD, AUD | 5 o 10 | 0 |
| MXN | 50 o 100 | 0 |
| BRL | 10 o 50 | 0 |
| CLP | 1.000 o 10.000 | 0 |
| JPY | 500 o 1.000 | 0 |
| COP | ancla, sin redondear | 0 |

**Por qué no cuadran al céntimo con la conversión.** Convertir el ancla en pesos a la tasa del
2026-09-22 da cifras como 31,24 USD o 43,87 CAD; redondearlas a precio de catálogo desvía el
importe. La desviación de esta tabla frente a la conversión exacta va de **−11 % a +6 %**: el
extremo bajo es el dólar canadiense del plan Pro (43,87 convertido frente a 39 de catálogo,
−11,1 %) y el alto es el dólar australiano del plan Business (83,97 frente a 89, +6,0 %). Es una
desviación normal en precios de catálogo y **es la razón de ser del modelo**: si el precio se
convirtiera en vivo, cambiaría cada día y nunca sería una cifra memorizable.

#### Lo que esto implica en la interfaz

- **Selector de moneda** en la vista de planes: por defecto la de la organización, o la del país
  del visitante cuando todavía no hay organización; el resto disponibles en la lista.
- **Nota bajo el selector**: «Precios en {moneda}. Se cobra en {moneda}». Si la moneda de cobro
  real difiere de la mostrada, hay que decirlo **ahí mismo**, no en letra pequeña.
- **`PlanOption` respeta `currencies.decimals`**: nunca se pintan céntimos en COP, CLP ni JPY. Con
  esta tabla no se pintan en ninguna, porque todos los precios son enteros.
- El **equivalente anual** se muestra con el ahorro en importe y en porcentaje, calculado sobre la
  misma moneda: nunca se mezclan monedas en una resta.

#### Dependencia con Stripe (no se diseña aquí)

El cobro va por Stripe con `plans.stripe_price_monthly_id` / `stripe_price_yearly_id`, que son
**un precio por plan y periodo, en una sola moneda**. Vender en diez monedas exige **un precio de
Stripe por moneda** (o precios multidivisa del mismo producto) y guardar esa correspondencia, muy
probablemente como dos columnas más en `plan_prices`. Queda anotado como dependencia técnica; no
forma parte de este diseño.

---

## G. Conteo de controles

### G.1 Acceso

| Pantalla | Controles |
|---|---:|
| A.0 Capa compartida y fondo animado | 6 |
| A.1 `/auth/login` | 46 |
| A.2 `/auth/signup` (contenedor + paso 1) | 31 |
| A.3 `/auth/forgot-password` | 15 |
| A.4 `/auth/reset-password` | 17 |
| A.5 `/auth/verify/failed` + `/verify/resent` | 16 |
| A.6 `/auth/invite` + `InvitationWizard` | 29 |
| A.7 `/auth/session-expired` | 6 |
| A.8 `/auth/super-admin-access` | 8 |
| A.9 `/auth/select-organization` | 18 |
| **Total acceso** | **192** |

### G.2 Creación de organización

| Camino | Campos que pide | Escrituras | Transaccional |
|---|---:|---:|---|
| `CreateOrganizationForm` (captura; escritura **muerta**) | 22 | 3 llamadas | No |
| `CreateOrganizationWizard` (diálogo) | 20 | 8 llamadas + Stripe | No |
| `OrganizationStep` → `signup` | 21 | 12 llamadas + Stripe | No |
| `auth/callback/route.ts` (duplicado en servidor) | — | 9 llamadas | No |
| `organizationService.createOrganization` (muerto) | — | — | — |

### G.3 Módulo Organización

| Página | Controles | Alcanzables |
|---|---:|---:|
| `/app/organizacion` (índice) | 4 | 4 |
| `/app/organizacion/informacion` | 80 | 80 |
| `/app/organizacion/miembros` | 72 | 69 |
| `/app/organizacion/invitaciones` | 98 | 98 |
| `/app/organizacion/sucursales` | 175 | 174 |
| `/app/organizacion/plan` | 210 | 202 |
| `/app/organizacion/modulos` | 37 | 37 |
| `/app/organizacion/mis-organizaciones` | 50 | 50 |
| `/app/organizacion/dominios` | 239 | 199 |
| `/app/organizacion/branding` (+ `/reviews`) | 290 | 247 |
| Navegación del módulo | 18 | 18 |
| **Total módulo** | **1.273** | **1.178** |

**Total general: 1.465 controles** (192 de acceso + 1.273 del módulo), de los cuales **95 son
inalcanzables** en el módulo: 6 componentes muertos, 14 montados sin efecto y 3 mensajes de éxito
que nunca se pintan.

---

## H. Recomendación de rediseño

Por orden de daño, no de esfuerzo.

**1. La contraseña deja de guardarse en el navegador.** «Recordarme» pasa a significar «recuerda
mi correo» y nada más (`login/page.tsx:232-233`). El acceso biométrico se apoya en el
almacenamiento seguro del dispositivo, no en `localStorage`. Es un cambio de una tarde y quita el
peor riesgo del producto.

**2. El acceso deja de decir si una cuenta existe.** Un solo mensaje —«Correo o contraseña
incorrectos»— para credenciales inválidas y para usuario inexistente; el enlace «Crear cuenta»
siempre visible en el pie, no condicionado al error. `get_auth_provider_by_email` se revoca a
`anon` y se consulta solo con sesión o desde un route handler con límite de intentos; lo mismo
`/api/auth/check-email`.

**3. Cuatro *route handlers* sin autenticar.** `/api/modules`, `/api/modules/pages` y
`/api/product-reviews` usan *service role* y toman la organización del cliente. Cada uno empieza
por `getServerOrgContext()`, como manda la regla 5.

**4. Un solo asistente de organización, y una sola escritura.** `OrganizationOnboarding` con los
cinco pasos de B.5, consumido desde el acceso y desde Organización › Mis organizaciones, con la
escritura completa en una RPC transaccional `crear_organizacion_completa(p_payload jsonb)` detrás
de `POST /api/organizations`. Elimina de golpe los ocho modos de «organización a medio crear» de
E.3, mata `CreateOrganizationWizard`, el bloque muerto de `CreateOrganizationForm`, el duplicado de
`auth/callback/route.ts` y `organizationService.createOrganization`, y saca de manos del navegador
la auto-concesión de `role_id: 2` e `is_super_admin: true`.

**5. Los favoritos viajan con la cuenta.** `organization_members.is_favorite boolean not null
default false`, precedida del índice único `(organization_id, user_id)` que hoy no existe.
`profiles.last_org_id` se queda como «última usada». «Principal» se deriva: favorita → última usada
→ resto (D.3). Y **con una sola organización no hay pantalla de selección**: se entra directo, lo
que le ahorra un clic a 111 de 121 usuarios.

**6. Una sola pantalla de selección.** El popup del login y `/auth/select-organization` se funden
en la misma: buscador siempre visible, favoritas arriba con su grupo, «Principal» con distintivo,
rol y sucursales por organización, atajos `1`–`9` y `↑ ↓ Enter`, estado vacío con acción («No
perteneces a ninguna organización · Crear organización») y el fondo animado, que hoy solo tiene una
de las dos.

**7. El módulo adopta el kit.** `PageHeader` en las diez páginas (y se borra el título duplicado, y
el tercero de sucursales y mis organizaciones); `DataTable` con sus cuatro estados en lugar de los
`<table>` a mano y del `<ul>`; un solo buscador más `FilterButton`/`FilterPanel` en lugar de los
paneles de filtros artesanales; **la paginación única del kit en las ocho páginas que hoy traen la
colección entera**; `Toast` en lugar de los tres sistemas de retroalimentación que conviven;
`ConfirmDialog` en lugar de los cinco `alert()`/`confirm()`; `EmptyState` variante `forbidden` en
lugar de las cajas amarillas sin salida.

**8. Ningún mensaje de Postgres llega al usuario.** Un `describeError` como el de `quotas/` para
los 35 sitios de E.6, y el error deja de reemplazar la vista: banner con «Reintentar» y la tabla
intacta.

**9. Las fechas pasan por la zona horaria de la organización.** Los 11 sitios de E.7 cambian
`toLocaleDateString()` por `useFormatDate()` / `formatDateInTz`. Y el asistente **pide la zona
horaria**, que hoy nadie pide y queda en `America/Bogota` aunque el país sea otro.

**10. Se limpia lo muerto.** Seis componentes sin consumidor (95 controles), cuatro definiciones
distintas del mismo submenú, seis rutas 404 y la ruta huérfana `/branding/reviews`. O se conectan
—`DomainFilters` e `ImportDialog` son funcionalidad terminada— o se borran.

**11. Los planes se leen de la base, y en la moneda del visitante.** Cargar `price_cop_month` / `price_cop_year`,
borrar el catálogo de respaldo cableado (F.6 #5), quitar los `plan_id` 2/3/5 y el
`includes`/`else → 'pro'` (F.6 #1-#2), filtrar `is_active` también en `PriceSummary` y
`SubscriptionStep`, y tratar `is_custom_enterprise` como «habla con ventas» en vez de pintar
«$NaN» (F.6 #12-#13). Y arreglar la clave i18n inexistente `auth.signup.payment.payNow`, que hoy
pinta la ruta de la traducción como etiqueta del botón principal (F.6 #23). Los precios pasan a
`plan_prices`, **fijos por moneda y sin decimales** (F.9): la tasa en vivo se queda para las
operaciones del ERP, no para tarifar.

**12. Teléfonos y municipios, de una vez.** Los cinco formularios de E.14 pasan a `PhoneInput`; el
municipio pasa a un selector único «Municipio (DANE)» que muestra el código, el departamento se
deriva de `state_code` en vez de recortar el `code` a mano, y el código postal queda aparte con su
propia ayuda (E.15).

**13. El fondo animado se conserva, con dos ajustes.** `@media (prefers-reduced-motion: reduce)`
para detener las 33 animaciones, y ocultarlo por debajo de `lg`, que es lo que su propio comentario
dice y el CSS no hace. Y se monta también en `select-organization`, `session-expired` y
`super-admin-access`, que hoy son las tres pantallas feas del flujo.

