# Paridad Acceso y Organización (Figma: `08 Acceso y organización`)

Archivo Figma «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`). Las pantallas viven en la
página nueva **`08 Acceso y organización`** (12 Secciones: «Índice» más once de contenido); los
componentes nuevos, en `02 Componentes › Acceso`. Fuente de verdad:
`docs/design/AUDITORIA-CONTROLES-ACCESO-ORGANIZACION.md`.

Estados: **calcado** (existe en código y se dibujó igual) · **Nuevo** (no existe en código; lleva
badge «Nuevo» en Figma) · **sustituido por …** (lo roto de la sección E se reemplaza por el
componente correcto del kit) · **omitido: motivo**.

Convenciones: escritorio 1440 de ancho, móvil 390; cada sección lleva sus diálogos abiertos y sus
cuatro estados en frames propios; separación de 160 px entre frames y de 400 px entre Secciones.
Textos en español de Colombia con las etiquetas exactas del código, corregidas de acentuación
cuando la auditoría lo señala. Nunca nombres de organizaciones cliente: se usan «Mi empresa
S.A.S.», «Distribuidora del Norte», «Taller Los Andes» y «Café de la Esquina».

**Resumen: 70 frames de pantalla, 13 Secciones, 8 componentes nuevos, 43 badges «Nuevo»,
3.278 instancias del kit. Chequeo por script: 0 solapes de Sección, 0 solapes de frame,
0 desbordes de contenido, 0 desbordes de ancho, 0 instancias rotas.**

> **Revisión del 2026-09-22 tras ocho correcciones del dueño.** Lo que cambió respecto a la
> primera entrega está marcado como «corrección» en cada sección y resumido en el apartado 14.

---

## 0. Componentes nuevos — `02 Componentes › Acceso`

| Componente | Variantes | Por qué es nuevo | Estado |
|---|---|---|---|
| `AuthScene` | `Layout=escritorio` (1440×900) · `Layout=movil` (390×844) | El fondo animado **se conserva** (decisión del dueño). Calca `AuthSceneBackground.tsx`: planeta que gira 30 s y flota 8 s, 11 nubes de 20 a 55 s, cohete con estela y 16 estrellas. Figma lo muestra estático; la descripción del componente recoge las duraciones y los dos ajustes pendientes (`prefers-reduced-motion` y ocultarlo bajo `lg`). | calcado (A.0 #2-#6) |
| `PasswordField` | `State=default / foco / visible / error / fortaleza` | Unifica las **cuatro** implementaciones sueltas de contraseña del acceso, que hoy tienen tres políticas distintas (E.1) | sustituido por el componente único |
| `OAuthButton` | `Provider=google / microsoft / biometria` | El de Microsoft pasa a «Continuar con Microsoft», simétrico con Google | sustituido (A.1 #24) |
| `AuthAlert` | `Tono=error / aviso / éxito / info` | Mensaje dentro de la tarjeta de acceso; nunca muestra el texto crudo de Supabase | sustituido (E.6) |
| `FavoriteStar` | `Estado=off / on` | La estrella pasa a `organization_members.is_favorite`; hoy vive en `localStorage` | sustituido (D.1 → D.3) |
| `OrgSelectCard` | `Estado=default / favorita / principal / congelada` | Tarjeta de organización con estrella persistente, distintivo «Principal», rol, sucursales, plan, estado y atajo | parcialmente Nuevo (rol, sucursales y atajo no existen hoy) |
| `PhoneInput` | `State=cerrado / abierto / error / deshabilitado` | **Corrección 2.** Calca `src/components/ui/phone-input.tsx`, que ya existe y usan 16 formularios. Se dibuja para que los **5 que siguen con `<input type="tel">` crudo** (E.14) tengan a qué migrar | calcado del componente real |
| `PlanOption` | `Estado=normal / recomendado / seleccionado / a-medida` | **Corrección 5.** Tarjeta de plan con precio en pesos, equivalente anual con el ahorro, y características derivadas de las **columnas** de `plans` (no de `features`, que las contradice). Sin plan gratis: `free` está inactivo | parcialmente Nuevo (precios en pesos, ahorro y «a medida» no existen hoy) |

Componentes del kit reutilizados sin tocar: `Button`, `IconButton`, `Badge`, `Chip`, `Avatar`,
`OrgAvatar`, `Switch`, `Checkbox`, `Progress`, `Skeleton`, `Divider`, `Kbd`, `Marca/Nuevo`,
`FormField`, `Select`, `MultiSelect`, `SearchBar`, `FilterButton`, `PageHeader`, `StatCard`,
`DataTable`, `TableCell`, `Pagination`, `BulkActionBar`, `EmptyState`, `Toast`, `ConfirmDialog`,
`PlanCard`, `Sidebar`, `AppHeader`, `MobileHeader`, `MobileTabBar`, `Breadcrumbs`.
`CustomerPicker` no aplica en este módulo.

---

## 1. Entrar — sección `1. Entrar`

Frames: `Escritorio / Entrar — listo`, `— error`, `— entrando`, `— sesión expirada` (1440×900),
`Móvil / Entrar — listo` y `— error` (390×844).

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.0 #1 | `AuthLayout` con degradado que ninguna página deja ver | — | omitido: es código muerto (E.10); el degradado real lo pone `AuthScene` |
| A.0 #2-#6 | Planeta, 11 nubes, cohete, 16 estrellas y sus `@keyframes` | Todos los frames (instancia `AuthScene`) | calcado |
| A.1 #1 | Logotipo `GO` / `Admin` del panel de marca | Escritorio / Entrar — listo | calcado |
| A.1 #2-#3 | `¡Bienvenido de nuevo!` + `Ingresa tus credenciales para acceder` | Panel de marca | calcado |
| A.1 #4-#6 | Tres viñetas de venta | Panel de marca (lista de 3 con check) | calcado, refundidas en textos más cortos |
| A.1 #7 | Logotipo pequeño de la tarjeta (`lg:hidden`) | Móvil / Entrar | calcado |
| A.1 #8-#9 | Título y subtítulo **duplicados** dentro de la tarjeta | Tarjeta: `Iniciar sesión` + `Entra con tu correo o continúa con Google.` | sustituido: el duplicado desaparece en escritorio y la tarjeta usa un título propio |
| A.1 #10 | Caja de error `{error}` | `— error` (instancia `AuthAlert Tono=error`) | sustituido por `AuthAlert`, con mensaje único «Correo o contraseña incorrectos» |
| A.1 #11 | Enlace `Crear una cuenta nueva` solo si el error contiene «El usuario no existe» | Pie: `¿No tienes cuenta? Crear cuenta`, **siempre visible** | sustituido: elimina la fuga de enumeración (E.1) |
| A.1 #12 | `EmailNotConfirmedAlert` | `— sesión expirada` usa la misma pieza (`AuthAlert Tono=info`) | sustituido por `AuthAlert` |
| A.1 #13 | Campo de correo con icono de persona | `FormField State=default`, etiqueta `Correo electrónico` | calcado |
| A.1 #14 | `onBlur` → `checkAuthProvider` | — | omitido: es una llamada sin interfaz; su resultado se dibuja en #15 |
| A.1 #15 | Aviso «Esta cuenta está registrada con {proveedor}» | `AuthAlert Tono=aviso` (en la sección 3, frame `Recuperar contraseña — cuenta con Google`) | sustituido: el aviso pasa a ofrecer el botón del proveedor en vez de solo texto |
| A.1 #16-#17 | Campo de contraseña + botón «ver contraseña» | `PasswordField State=default` / `visible` | calcado |
| A.1 #18 | `Recordarme` que guarda correo **y contraseña** | `Recordar mi correo en este dispositivo` + badge «Nuevo» | sustituido: la contraseña deja de guardarse (E.1) |
| A.1 #19 | `¿Olvidaste tu contraseña?` bajo la casilla | Junto a la etiqueta `Contraseña`, a la derecha | sustituido: se acerca al campo al que pertenece |
| A.1 #20 | Botón `Iniciar Sesión` / `Iniciando sesión...` | `Entrar` / `Entrando…` (`— entrando`, botón `disabled`) | calcado |
| A.1 #21 | `¿No tienes cuenta?` + `Regístrate` | Pie: `¿No tienes cuenta? Crear cuenta` | calcado |
| A.1 #22 | Separador `o` | Divider + `o` + Divider | calcado |
| A.1 #23 | `Continuar con Google` | `OAuthButton Provider=google` | calcado |
| A.1 #24 | `Microsoft` (sin verbo, sin clave i18n) | `OAuthButton Provider=microsoft` → `Continuar con Microsoft` | sustituido |
| A.1 #25 | `Entrar con Face ID` / `Entrar con Huella` | `OAuthButton Provider=biometria` (en `02 Componentes › Acceso`) | calcado como variante; no se instancia en los frames de escritorio |
| A.1 #26 | Mensaje de éxito de confirmación de correo | Sección 4, `Escritorio / Correo confirmado` | sustituido: pasa a ser su propia pantalla |
| A.1 #27 | `GeolocationModal` | — | omitido: no está en el alcance del rediseño; no lo menciona el dueño y no cambia |
| A.1 #28-#38 | Popup `Selecciona una organización` con buscador, estrella, avatar, plan, estado y pie «★ aparecen primero» | **Sección 5** completa | sustituido: el popup y `/auth/select-organization` se funden en **una sola pantalla** |
| A.1 #29 | Subtítulo «Tu cuenta está asociada a múltiples organizaciones» | Sección 5: `Perteneces a 4 organizaciones. La principal aparece primero.` | sustituido: con una sola organización la pantalla no aparece (E.10, D.3) |
| A.1 #39-#44 | Seis avisos de `?error=` y `?message=` | `— sesión expirada` (`AuthAlert Tono=info`) | sustituido: un solo patrón de aviso; la anotación del frame lista los siete valores que hoy caen en el genérico (E.8) |
| A.1 #45 | `sessionStorage.setItem('redirectTo', …)` | Sección 4, `Sesión expirada`: «Volverás a donde estabas: Ventas › Punto de venta.» | calcado, ahora visible |
| A.1 #46 | `Loading...` del `Suspense`, en inglés | — | omitido: el `Suspense` se sustituye por el propio esqueleto de la tarjeta; se anota en el frame |

---

## 2. Crear cuenta — sección `2. Crear cuenta`

Frames: `Escritorio / Crear cuenta — datos personales`, `— correo ya registrado`,
`— revisa tu correo`, `Móvil / Crear cuenta — datos personales`.

**Decisión de diseño**: el registro pasa de **6 pasos** a **dos fases**: «Tu cuenta» (esta sección)
y el asistente compartido de organización (sección 6). Eso resuelve la incoherencia de B.4 #8
(tres numeraciones distintas del mismo trámite: 2/3, 4 y 6 pasos).

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.2 #1-#3 | `Registro en GO Admin ERP` + bajada + lista de 6 pasos | Panel de marca: `Crea tu cuenta` + los 6 pasos con el 1 activo | calcado |
| A.2 #4 | Indicador de 6 puntos dibujado a mano | Panel de marca (lista numerada) | sustituido: el progreso vive en el panel de marca y, dentro del asistente, en el `Stepper` de la sección 6 |
| A.2 #5-#6 | `Configuración de cuenta` + `Cuenta de Google: {email}` | — | omitido: variante de Google; el asistente compartido cubre el mismo recorrido y se anota en el frame |
| A.2 #7 | Caja de error `{error}` | `— correo ya registrado` (`AuthAlert Tono=error`) | sustituido por `AuthAlert` |
| A.2 #8-#9 | `Nombre` y `Apellido` | Rejilla de 2 columnas, `FormField` con asterisco | calcado |
| A.2 #10 | `Correo electrónico` con borde amarillo/rojo | `FormField` con ayuda `Lo usarás para entrar` | calcado |
| A.2 #11-#13 | `Verificando correo...` / `Este correo ya está registrado.` / `Correo disponible` | `— correo ya registrado`: `FormField State=error` + `AuthAlert` | sustituido: se conserva el bloqueo, **desaparece «Correo disponible»** por la fuga de enumeración (E.1) |
| A.2 #14 | `Teléfono (opcional)` con `PhoneInput` | `FormField` con ayuda `Opcional` | calcado |
| A.2 #15-#17 | Contraseña, `Mínimo 8 caracteres`, confirmación con validación en vivo | `PasswordField State=fortaleza` + `PasswordField State=default` (`Confirmar contraseña`) | sustituido: **una sola política** (8 + mayúscula + minúscula + número + símbolo), la del restablecimiento |
| A.2 #18 | `Foto de perfil (opcional)` con `FileUpload` | — | omitido: no cambia y alarga el paso; se anota como conservado tal cual |
| A.2 #19 | `Idioma preferido` con 6 idiomas | `Select` con `Español (Colombia)` | calcado |
| A.2 #20 | Botón `Continuar` | `Continuar`, `disabled` en el estado de correo ocupado | calcado |
| A.2 #21-#23 | Bienvenida de Google + `Continuar con la configuración` | — | omitido: mismo recorrido con otro punto de entrada |
| A.2 #24-#25 | `OrganizationStep` y `BranchStep` | **Sección 6**, pasos 1-3 | sustituido por el asistente compartido |
| A.2 #26-#27 | `SubscriptionStep` y `PaymentMethodStep` | **Sección 6**, paso 4 | sustituido |
| A.2 #28 | `VerificationStep` | `— revisa tu correo` | calcado, con `Reenviar en 47 s` y `Cambiar el correo` (**Nuevo**) |
| A.2 #29 | `¿Ya tienes cuenta?` + `Iniciar sesión` | Pie de la tarjeta | calcado |
| A.2 #30 | `?ref=VEND-001` (código de vendedor) | — | omitido: no tiene interfaz visible |
| A.2 #31 | `Loading...` en inglés | — | omitido: igual que A.1 #46 |
| **Nuevo** | `Acepto los Términos y la Política de privacidad` | Casilla con badge «Nuevo» | **Nuevo**: hoy no existe, aunque las claves i18n sí (E.1) |

---

## 3. Recuperar y restablecer contraseña — sección `3. …`

Frames: `Escritorio / Recuperar contraseña — listo`, `— enviado`, `— cuenta con Google`,
`Escritorio / Restablecer contraseña — listo`, `— enlace caducado`,
`Móvil / Recuperar contraseña — listo`.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.3 #1-#2 | `Recuperar contraseña` + `Ingresa tu correo para recibir instrucciones` | `— listo` | calcado |
| A.3 #3 | Caja `{message.text}` verde o roja | `AuthAlert Tono=éxito` / `Tono=aviso` | sustituido por `AuthAlert` |
| A.3 #4 | Campo de correo con etiqueta `sr-only` | `FormField` con etiqueta **visible** | sustituido: la etiqueta deja de ser solo para lectores de pantalla |
| A.3 #5 | `Enviar instrucciones` / `Enviando...` | Botón primario a todo el ancho | calcado |
| A.3 #6 | `Volver al inicio de sesión` | Botón fantasma al pie | calcado |
| A.3 #7-#8 | Validaciones de campo vacío y de formato | — | omitido: se resuelven con el estado `error` de `FormField`, que ya está dibujado en la sección 1 |
| A.3 #9 | Error rojo «Esta cuenta está registrada con {proveedor}…» | `— cuenta con Google`: `AuthAlert Tono=aviso` **más `OAuthButton Provider=google`** | sustituido: estado con acción, no un error sin salida |
| A.3 #10 | Confirmación «Se ha enviado un correo…» | `— enviado`: `Si existe una cuenta con ese correo, te enviamos las instrucciones.` | sustituido: el texto deja de confirmar que el correo existe (E.1) |
| A.3 #11-#13 | `Correo enviado`, destinatario en negrita y ayuda de spam | `— enviado` | calcado |
| A.3 #14 | `Reenviar correo` / `Reenviar en {n}s` (60 s) | `Reenviar en 52 s`, botón `disabled` | calcado |
| A.3 #15 | `{err.message}` crudo de Supabase | — | sustituido: no se dibuja ningún mensaje crudo (E.6) |
| A.4 #1-#2 | `Restablecer contraseña` + bajada | `Crea tu nueva contraseña` + la política en una línea | calcado |
| A.4 #3 | `Enlace de recuperación válido…` | — | omitido: redundante; si la pantalla se ve, el enlace es válido |
| A.4 #4 | `El enlace de restablecimiento no es válido o ha expirado…` | `— enlace caducado` (`AuthAlert Tono=aviso`) | calcado |
| A.4 #5-#6 | `Nueva contraseña` + botón de ojo | `PasswordField State=fortaleza`, etiqueta `Nueva contraseña` | calcado |
| A.4 #7 | `Fortaleza de la contraseña:` + 5 píldoras | Dentro de `PasswordField State=fortaleza` | calcado |
| A.4 #8-#9 | `Confirmar contraseña` + botón de ojo | `PasswordField State=default` | calcado |
| A.4 #10 | `Las contraseñas coinciden` / `no coinciden` | `✓ Las contraseñas coinciden` | calcado |
| A.4 #11 | `Actualizar contraseña` / `Actualizando...` | Botón primario a todo el ancho | calcado |
| A.4 #12 | `La contraseña debe tener {requisitos}` | Dentro de `PasswordField State=error` | calcado |
| A.4 #13 | Éxito + redirección a los 2 s | — | omitido: transición sin interfaz propia; lleva a la sección 1 |
| A.4 #14 | `Solicitar un nuevo enlace de restablecimiento` | `— enlace caducado`: `Pedir un enlace nuevo` (primario) | sustituido: pasa de enlace a acción principal |
| A.4 #15 | `Volver al inicio de sesión` | Botón fantasma al pie | calcado |
| A.4 #16-#17 | `{err.message}` y `Loading...` | — | omitido: ver E.6 y A.1 #46 |

---

## 4. Verificación, invitación y sesión expirada — sección `4. …`

Frames: `Escritorio / Invitación — confirmar datos`, `— crear contraseña`, `— aceptada`,
`— enlace caducado`, `Escritorio / Correo confirmado`, `Escritorio / Sesión expirada`,
`Móvil / Invitación — aceptada`.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.5 #1-#3 | `El enlace ha expirado` + aviso ámbar + instrucción | `Invitación — enlace caducado` | sustituido: **`/verify/failed` y la invitación caducada se funden en una sola pantalla** |
| A.5 #4 | Campo de correo sin etiqueta visible | `FormField` `Tu correo` con ayuda `Te enviaremos un enlace nuevo` | sustituido: gana etiqueta |
| A.5 #5-#6 | Error del reenvío + `Reenviar enlace` / `Enviando...` | `Reenviar enlace` (primario) | calcado |
| A.5 #7 | `Ir al inicio de sesión` | Botón fantasma al pie | calcado |
| A.5 #8 | `Revisa tu correo` + «Si hay una invitación pendiente para {email}…» | `Escritorio / Correo confirmado` (`AuthAlert Tono=éxito`) | calcado |
| A.5 #9 | `?type=` leído y nunca usado | — | omitido: no tiene efecto |
| A.5 #10, #16 | `Loading...` | — | omitido: ver A.1 #46 |
| A.5 #11-#14 | `Enlace reenviado` + confirmación + ayuda del cliente de correo | `Escritorio / Correo confirmado` | sustituido: una sola pantalla de confirmación en vez de dos rutas |
| A.5 #15 | `Ir al inicio de sesión` | Botón primario `Entrar` | calcado |
| A.6 #1-#2 | `Validando invitación...` / `Iniciando sesión automáticamente...` | — | omitido: estados de carga sin controles; se anota en el frame |
| A.6 #3-#6 | Cuatro errores de validación de la invitación | `— enlace caducado` (`AuthAlert Tono=aviso`) | sustituido: un solo estado con acción |
| A.6 #7-#9 | `Error en la invitación` + `Reintentar` + `Ir al inicio de sesión` | `— enlace caducado` | calcado |
| A.6 #10 | `Configurando tu cuenta...` | — | omitido: caso residual del código |
| A.6 #11-#12 | Indicadores de paso (3 o 2 pasos según el estado de la cuenta) | Los tres frames de invitación en orden | calcado |
| A.6 #13-#14 | `¡Bienvenido!` / `Confirmar Invitación` + `Email: {email}` | `— confirmar datos`: `Te invitaron a Mi empresa S.A.S.` + `FormField` de correo no editable | sustituido: el título dice a qué organización |
| A.6 #15-#16 | Nombre, apellido, teléfono y sus cuatro validaciones | `— confirmar datos` (rejilla de 2 columnas) | calcado |
| A.6 #17 | `Continuar` / `Aceptar Invitación` | Botón primario | calcado |
| A.6 #18-#19 | `Crear Contraseña` + cuatro validaciones | `— crear contraseña` con `PasswordField State=fortaleza` | sustituido: misma política que el resto (E.1) |
| A.6 #20 | `Completar Registro` | Botón primario, con `Atrás` a la izquierda | calcado |
| A.6 #21-#22 | `Ya tienes cuenta en GO Admin` + `Cerrar sesión e iniciar como {email}` | — | omitido: caso de sesión ajena; se conserva tal cual y se anota |
| A.6 #23-#25 | `¡Invitación Aceptada!` + confirmación + `Entrar ahora` | `— aceptada` con tarjeta de la organización (`OrgAvatar` + rol + sucursal) | calcado, enriquecido con el destino |
| A.6 #26-#29 | Tres errores de la API + `Loading...` | — | omitido: ver E.6 y A.1 #46 |
| **Nuevo** | Badges `Rol: Cajero`, `Sucursal Principal`, `Caduca en 5 días` en el primer paso | `— confirmar datos` | **Nuevo**: hoy el invitado no sabe a qué entra hasta el final |
| A.7 #1-#4 | Icono ámbar, `Sesión expirada`, bajada y `Ir al inicio de sesión` | `Escritorio / Sesión expirada` | calcado |
| A.7 #5 | Segundo enlace con **la misma etiqueta** que lleva a `/` | `Ir al inicio` (botón fantasma, etiqueta distinta) | sustituido (E.10) |
| A.7 #6 | `clearAuthData()` | — | omitido: no tiene interfaz; la auditoría anota que **debe borrar también `userPassword`** |
| A.8 #1-#8 | `/auth/super-admin-access` completo | — | omitido: pantalla de servicio del panel de super admin, fuera del alcance del rediseño pedido. Queda anotado que **debe montar `AuthScene`** para no romper la coherencia (E.10) |

---

## 5. Selección de organización — sección `5. …`

Frames: `Escritorio / Elegir organización — listo`, `— sin resultados`, `— cargando`,
`— sin organizaciones`, `— error al cargar` (1440×1000), `Móvil / Elegir organización — listo`.

Esta sección **funde** el popup del login (A.1 #28-#38) y `/auth/select-organization` (A.9) en una
sola pantalla. Es la respuesta directa a lo que reporta el dueño.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.9 #1 | Esqueleto de cabecera + 2 tarjetas | `— cargando` (4 `Skeleton Variant=card`) | calcado |
| A.9 #2 | Icono de edificio en círculo azul | — | omitido: lo sustituye el título, más claro |
| A.9 #3-#4 | `Selecciona una organización` + `Elige una organización para continuar o crea una nueva.` | `Elige tu organización` + `Perteneces a 4 organizaciones. La principal aparece primero.` | sustituido: el subtítulo dice cuántas hay y cómo están ordenadas |
| A.9 #5 | Caja roja con `{error}` crudo | `— error al cargar` (`EmptyState Variant=error`) | sustituido por `EmptyState` con «Reintentar» (E.6) |
| A.9 #6 | Estrella con tooltip, guardada en `localStorage` | `FavoriteStar` dentro de `OrgSelectCard` | sustituido: pasa a `organization_members.is_favorite` (D.3) |
| A.9 #7 | Avatar (inicial o `logo_url`) | `OrgSelectCard` | calcado |
| A.9 #8-#9 | Nombre y tipo de organización | `OrgSelectCard`: `Mi empresa S.A.S.` + `Comercio · Administrador · 3 sucursales` | calcado, ampliado |
| A.9 #10 | Badge de plan | `Plan Pro` / `Plan Business` / `Plan Free` | calcado |
| A.9 #11 | Badge `Activa` / `Congelada` / `Eliminada` / `Inactiva` | `Activa` / `Congelada` | calcado |
| A.9 #12 | Fila clicable que escribe `last_org_id` y entra | Toda la tarjeta | calcado |
| A.9 #13-#14 | Separador `o` + `Crear nueva organización` | Pie: botón `Crear organización` | sustituido: pasa al pie junto a los atajos |
| A.9 #15 | Orden «favoritas primero», sin criterio dentro del grupo | Dos grupos con encabezado: `Favoritas` y `Todas`, y dentro por nombre | sustituido (D.3) |
| A.9 #16 | Hidratación de la sesión OAuth | — | omitido: no tiene interfaz |
| A.9 #17 | Sin organizaciones → **redirige en silencio** a `/auth/signup` | `— sin organizaciones` (`EmptyState Variant=empty`) | sustituido: estado vacío real con `Crear organización` de acción principal; la clave `auth.selectOrganization.noOrgs` por fin se usa |
| A.9 #18 | Esqueleto del `Suspense` | `— cargando` | calcado |
| A.1 #31 | Buscador visible **solo con más de 3 organizaciones** | `SearchBar` **siempre visible** | sustituido |
| A.1 #37 | Vacío del buscador «No se encontraron organizaciones.» | `— sin resultados` (`EmptyState Variant=search`) | sustituido: vacío con acción |
| A.1 #38 | Pie «Las organizaciones marcadas con ★ aparecen primero» | Encabezado de grupo `Favoritas` | sustituido: el grupo explica el orden mejor que una nota al pie |
| A.1 #30 | Botón ✕ del popup que deja la sesión sin organización | — | omitido: ya no es un popup; no hay forma de quedarse a medias |
| **Nuevo** | Distintivo `Principal` sobre la primera organización | `OrgSelectCard Estado=principal` | **Nuevo** (D.3) |
| **Nuevo** | Rol y número de sucursales por organización | `OrgSelectCard`, segunda línea | **Nuevo** |
| **Nuevo** | Atajos `↑ ↓` moverse · `1-9` acceso rápido · `Enter` entrar | Pie, con `Kbd` del kit y badge «Nuevo» | **Nuevo** |
| **Nuevo** | Aviso «Café de la Esquina está congelada: entra para regularizar el plan.» | `— listo`, bajo la lista | **Nuevo**: hoy la organización congelada se muestra sin explicar qué hacer |
| **Nuevo** | Con **una sola** organización no se muestra esta pantalla | Anotación del frame `— listo` | **Nuevo**: hoy el popup aparece con `>= 1` (E.10); afecta al 91,7 % de los usuarios |

---

## 6. Crear organización — asistente compartido — sección `6. …`

Frames: `Escritorio / Nueva organización — paso 1 Identidad (desde el acceso)`,
`paso 1 Identidad (desde Organización)`, `paso 2 Datos fiscales`, `paso 3 Sucursal inicial`,
`paso 4 Plan`, `paso 5 Invitar equipo`, `— creando`, `— error al crear`,
`Móvil / Nueva organización — paso 1 (hoja)`.

**Un solo asistente para los tres caminos de B.1.** El frame «desde el acceso» y el frame «desde
Organización» son **el mismo diálogo** sobre dos fondos distintos: eso es exactamente lo que pide
el dueño («que el formulario de creación sea el mismo que usa el módulo de Organización»).

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| B.5 paso 1 | `logo_url` (`LogoUploader`) | Paso 1, bloque `Identidad`, slot de logo con arrastrar y soltar | calcado |
| B.5 paso 1 | `name`, `legal_name`, `type_id` | Paso 1, `FormField` y `Select` con asterisco | calcado |
| B.5 paso 1 | `email`, `phone` | Paso 1 | calcado |
| B.5 paso 1 | `subdomain` con chequeo de disponibilidad | Paso 1, ayuda `miempresa.goadmin.io · disponible` | calcado; la anotación recoge que hoy hay carrera sin manejo del error de restricción (E.12) |
| B.5 paso 1 | `website` | Paso 1 | calcado |
| B.5 paso 1 | `primary_color` / `secondary_color` | Paso 1, bloque `Marca`, con muestra y valor hexadecimal | calcado |
| B.5 paso 1 | `timezone` | Paso 1, `Zona horaria` = `America/Bogota (UTC−5)` | **Nuevo**: hoy nadie la pide y queda en el valor por defecto aunque el país sea otro |
| B.5 paso 2 | `country`, `state`, `city`, `municipality_id`, `address`, `postal_code` | Paso 2, bloque `Ubicación` (3 columnas) | calcado; la anotación recoge que hoy el municipio se pierde en el camino del registro (B.4 #2) |
| B.5 paso 2 | `tax_id` / `nit` y `dv` | Paso 2, bloque `Datos fiscales`, `NIT` obligatorio **siempre** y `DV` con ayuda `Se calcula solo` | sustituido: desaparece la excepción `isSignupMode` que hoy desactiva la obligatoriedad (E.4) |
| B.5 paso 2 | `economic_activity`, `registration_code`, `fiscal_responsibilities[]`, `graphic_representation_name` | Paso 2, con badge «Nuevo» en el bloque | **Nuevo** ×4 |
| B.5 paso 3 | `name`, `branch_code` de la sucursal | Paso 3, `Código` con ayuda `Único dentro de la organización` | sustituido: con validación real; hoy es `NOT NULL` y no se valida (E.4) |
| B.5 paso 3 | Dirección, teléfono, correo, NIT de la sucursal, horario | Paso 3, rejilla de 2 columnas | calcado |
| B.5 paso 3 | `is_main`, `is_web_stock_source`, `manager_id` | Paso 3, bloque `Opciones de la sucursal` con tres `Switch` y su explicación | calcado; `Es la sucursal principal` se dibuja no desmarcable |
| B.5 paso 4 | Catálogo de planes | Paso 4, tres tarjetas `Free` / `Pro` / `Business` con badge `Elegido` | sustituido: se leen de la tabla `plans`, no de los ids 2/3/5 cableados (E.11) |
| B.5 paso 4 | `billing_period`, prueba o pago, cupón | Paso 4, bloque `Facturación`: chips `Mensual` / `Anual (2 meses gratis)`, `Switch` de 15 días y `FormField` de cupón | calcado |
| B.5 paso 4 | Método de pago | — | omitido: `PaymentMethodStep` no cambia; se anota que se conserva tal cual |
| B.5 paso 5 | Invitar equipo | Paso 5, filas correo + rol + papelera, `Añadir otra persona` y `Saltar por ahora` | **Nuevo** por completo |
| B.5 paso 5 | Resumen previo a la escritura | Paso 5, bloque `Resumen` con organización, sucursal, plan y zona horaria | **Nuevo** |
| B.4 #8 | Tres numeraciones distintas del mismo trámite (2/3, 4 y 6 pasos) | `Stepper` de 5 pasos, idéntico en los tres puntos de entrada | sustituido |
| E.3 | Ocho modos de «organización a medio crear» | `— creando` (`Creando…`, botón bloqueado) y `— error al crear` | sustituido: el aviso dice «No se guardó nada: puedes reintentar sin repetir los datos», que es lo que garantiza la RPC transaccional |
| E.6 | `err.message` de Postgres en el diálogo | `— error al crear` (`AuthAlert Tono=error`) | sustituido |
| **Nuevo** | `Guardar y seguir después` | Pie del diálogo, con badge «Nuevo» | **Nuevo**: hoy salir del asistente pierde todo |
| **Nuevo** | El mismo diálogo abierto sobre el shell de la app | `paso 1 Identidad (desde Organización)` | **Nuevo**: hoy `ManageOrganizationsTab` monta el asistente **en línea**, no como diálogo (C.8 #13) |

---

## 7. Organización › Información — sección `7. …`

Frames: `Escritorio / Organización › Información — listo`, `— guardado`, `— cargando`,
`— sin permiso`.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.2 #1-#2, #6-#7 | Título y subtítulo **duplicados** | `PageHeader Variant=form` (uno solo), con `Breadcrumbs` `Organización › Información` | sustituido |
| C.2 #3, #8, #9 | Tres esqueletos distintos | `— cargando` (3 `Skeleton Variant=card`) | sustituido por el `Skeleton` del kit |
| C.2 #4, #12 | Bandas rojas con `{error}` crudo | — | sustituido: no se dibuja ningún mensaje crudo (E.6) |
| C.2 #5 | Caja amarilla «No tienes permisos…» **sin salida** | `— sin permiso` (`EmptyState Variant=forbidden` con acción «Pedir acceso») | sustituido |
| C.2 #10-#11 | Título y subtítulo de la tarjeta interior | — | omitido: el `PageHeader` ya lo dice |
| C.2 #13 | Banda verde de éxito que **no se auto-oculta** | `— guardado` (`Toast Variant=success` con acción `Deshacer`) | sustituido |
| C.2 #14-#19, #72-#80 | Logo, `Cambiar Logo`, ayuda `PNG, JPG, GIF hasta 5MB`, `LogoUploader` completo | — | omitido: el logo se edita en el asistente compartido (sección 6, paso 1); aquí se anota el enlace |
| C.2 #20-#28 | `Nombre`, `Descripción`, `Email`, `Tipo` | Bloque `Identidad`, rejilla de 2 columnas | calcado |
| C.2 #29-#36 | `Información de Contacto`, `Sitio Web`, `Teléfono` y el `PhoneInput` | Bloque `Identidad` (`Correo`, `Teléfono`) | calcado |
| C.2 #37-#50 | `Dirección`, `Departamento / Estado`, `Municipio / Ciudad`, `País` (hoy **texto libre**), `Código Postal` | Bloque `Ubicación`, 3 columnas, `País` como `Select` | sustituido: `País` deja de ser texto libre |
| C.2 #51-#57 | `NIT/RUT`, `DV (Auto)` y el cálculo del dígito | Bloque `Datos fiscales` con `Tipo de documento`, `NIT`, `DV` | calcado |
| C.2 #58-#63 | `Color Primario` / `Color Secundario` (selector + texto espejo) | — | omitido: se editan en el asistente compartido; se anota el enlace |
| C.2 #64-#69 | `Subdominio` + `.goadmin.io` y `Dominio Personalizado` | Bloque `Marca y dominios` | calcado |
| C.2 #70-#71 | `Guardar Cambios` / `Guardando...` | Pie con `Descartar` + `Guardar cambios` | calcado, con salida para descartar |
| **Nuevo** | `Zona horaria` | Bloque `Identidad` | **Nuevo**: mismo campo que el asistente |
| **Nuevo** | `Actividad económica (CIIU)`, `Código de registro`, `Nombre para la representación gráfica` | Bloque `Datos fiscales`, con badge «Nuevo» | **Nuevo** ×3 |

---

## 8. Organización › Miembros e invitaciones — sección `8. …`

Frames: `Escritorio / Miembros — listo`, `— selección múltiple`, `— sin resultados`,
`— error al cargar`, `Escritorio / Invitaciones — listo`, `Móvil / Miembros — listo`, más dos
`ConfirmDialog` sueltos.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.3 #1-#9 | Cabecera duplicada y tres esqueletos | `PageHeader Variant=list` + `DataTable State=loading` | sustituido |
| C.3 #5-#6 | Franja de error y caja amarilla sin permiso | `— error al cargar` (`DataTable State=error`) y `EmptyState Variant=forbidden` (sección 7) | sustituido |
| C.3 #10-#24 | Panel de filtros artesanal con 5 filtros, contador y `Limpiar todos` | `SearchBar` + `FilterButton` con contador `2` | sustituido por el patrón único del kit |
| C.3 #25-#26 | Esqueleto y error que **reemplazan la pestaña** | `DataTable State=loading` / `State=error`, con la cabecera intacta | sustituido |
| C.3 #27-#29 | Título de tarjeta que repite el H1 y contador `(n de m)` | Subtítulo del `PageHeader`: `12 personas en Mi empresa S.A.S. · 4 sucursales` | sustituido |
| C.3 #30 | `{members.length}/{maxUsers}` | `StatCard` `Miembros activos` = `12`, detalle `de 15 del plan` | sustituido por `StatCard` |
| C.3 #31 | `Ocultar filtros` / `Mostrar filtros` | `FilterButton` | sustituido |
| C.3 #32 | `<table>` a mano de 8 columnas | `DataTable Layout=table` con `Nombre`, `Correo`, `Sucursales`, `Rol`, `Cargo`, `Cuotas`, `Último acceso`, `Estado` | sustituido |
| C.3 #33-#34 | Dos vacíos con `colSpan={8}` | `DataTable State=empty` | sustituido |
| C.3 #35-#37 | Select de rol en la fila, **sin confirmar** | `DataTable`, celda `Rol` | calcado (la acción de cambio vive en el menú «⋮» de la fila) |
| C.3 #38-#40 | Chips de sucursal, `Sin sucursal` y `Gestionar Sucursales` | Celda `Sucursales` (`TableCell Variant=chips`) | calcado |
| C.3 #41 | Badge clicable `Activo` / `Inactivo` **sin confirmar** | Celda `Estado` (`TableCell Variant=status-dot`) | calcado |
| C.3 #42-#43 | Botón `Cuotas` + su `aria-label` | Menú «⋮» de la fila | sustituido: entra en el menú de fila del kit |
| C.3 #44-#45 | `Eliminar` **siempre habilitado** + `window.confirm` | `ConfirmDialog Variant=destructive`: `¿Quitar a Carlos Ruiz del equipo?` | sustituido (E.5) |
| C.3 #46 | `DataTablePagination` con textos quemados | `Pagination Layout=full`: `Mostrando 1–10 de 12 miembros` | calcado, con los textos traducibles |
| C.3 #47-#48 | `MemberQuotasSheet` y `BranchAssignmentModal` | — | omitido: no cambian; se anotan como conservados |
| C.3 #49-#51 | Tres mensajes de éxito **que nunca se pintan** | `Toast Variant=success` (sección 7) | sustituido |
| C.3 #52-#55 | Cuatro errores que tumban la pestaña | `DataTable State=error` con «Reintentar» | sustituido |
| C.3 #56-#72 | `BranchAssignmentModal` completo | — | omitido: no cambia; queda anotado que **le falta `role="dialog"`, trampa de foco y `Esc`** (E.10) y que su guardado no es transaccional (E.3) |
| C.4 #1-#9 | Cabecera duplicada e esqueletos de invitaciones | `Escritorio / Invitaciones — listo` con `PageHeader` | sustituido |
| C.4 #10-#23 | Panel de filtros artesanal | `SearchBar` + `FilterButton` | sustituido |
| C.4 #24-#45 | Formulario `Enviar Nueva Invitación` en línea con 5 campos | — | omitido del frame de lista: pasa a un diálogo desde `Invitar persona`; se anota |
| C.4 #37 | `Sucursal *` **sin `required`** | Anotación del frame | sustituido: obligatorio de verdad (E.12) |
| C.4 #50-#59 | `<table>` de 9 columnas | `DataTable Layout=table`: `Correo`, `Invitó`, `Sucursal`, `Rol`, `Cargo`, `Enviada`, `Caduca`, `Estado` | sustituido |
| C.4 #60-#61 | Vacíos con `colSpan={8}` sobre 9 columnas | `DataTable State=empty` | sustituido |
| C.4 #62-#66 | Badges `Revocada`, `Aceptada`, `Expirada`, `Pendiente`, `No expira` | Celda `Estado` | calcado |
| C.4 #67-#72 | `Ver link`, copiar y su confirmación | Menú «⋮» de la fila | sustituido |
| C.4 #73-#74 | `Reenviar` / `Enviando...` | `ConfirmDialog Variant=default`: `¿Reenviar la invitación a lucia.mora@miempresa.com?` | sustituido: confirmación explícita, porque invalida el enlace anterior |
| C.4 #75-#79 | `Revocar` + `AlertDialog` | Menú «⋮» + `ConfirmDialog Variant=destructive` | calcado |
| C.4 #80 | Paginación | `Pagination Layout=full`: `Mostrando 1–8 de 8 invitaciones` | calcado |
| C.4 #81-#98 | Esqueleto y **17 mensajes** de error o aviso | — | omitido del dibujo: son variantes del mismo `Toast`; la anotación recoge que **dos de ellos muestran la URL de invitación en claro** (E.1) |
| **Nuevo** | `BulkActionBar` con `3 miembros seleccionados` | `— selección múltiple` | **Nuevo**: hoy no hay acciones masivas de miembros |
| **Nuevo** | `StatCard` `Invitaciones pendientes` (2, «1 caduca mañana») y `Sin sucursal asignada` (1, «no puede vender») | `— listo` | **Nuevo** |
| **Nuevo** | Columna `Último acceso` | `DataTable` | **Nuevo** |

---

## 9. Organización › Sucursales — sección `9. …`

Frames: `Escritorio / Sucursales — listo`, `— límite del plan`, `— nueva sucursal`, más un
`ConfirmDialog`.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.5 #1-#2, #9-#10 | **Dos títulos «Sucursales» apilados** y el contador | `PageHeader Variant=list`: `Sucursales` + `6 sucursales · 3 de 10 del plan Pro` | sustituido |
| C.5 #3-#5 | Esqueleto, error y caja amarilla sin permiso | `DataTable State=loading` / `State=error` y `EmptyState Variant=forbidden` | sustituido |
| C.5 #6-#7, #18-#20 | `Tus Sucursales` / `Tus Sucursales Asignadas` (**dos bloques idénticos**) | — | omitido: se refunde en la columna `Equipo` de la tabla; se anota la duplicación |
| C.5 #11-#14 | Segmento `Tabla` / `Mapa` y `Mapa Completo` | — | omitido: la vista mapa no cambia; se anota que sus 4 estados están **duplicados literalmente** |
| C.5 #15 | Badge `{n}/{max}` del plan | `StatCard` `Del plan` = `3`, detalle `de 3 incluidas`, tono `warning` | sustituido |
| C.5 #16 | `Nueva Sucursal` | Botón primario del `PageHeader` | calcado |
| C.5 #17 | Banda verde autoborrable | `Toast Variant=success` | sustituido |
| C.5 #26 | El error **borra la tabla**, incluido el aviso de límite | `— límite del plan`: banner ámbar con `Ampliar plan` **y la tabla intacta** | sustituido (E.4) |
| C.5 #27 | Vacío «No hay sucursales registradas» | `DataTable State=empty` | sustituido |
| C.5 #28-#36 | 9 encabezados de columna, tabla con `min-w-[1300px]` | `DataTable Layout=table`: `Sucursal`, `Código`, `Ciudad`, `Responsable`, `Equipo`, `Tienda web`, `Creada`, `Estado` | sustituido |
| C.5 #37-#39 | Badges `Principal` y `Web` con su tooltip | Celda `Tienda web` = `Surte la tienda` | calcado |
| C.5 #40-#44 | Cinco respaldos de celda vacía (`Sin código`, `N/A`, `Sin dirección`, `Sin email`) | `—` en la celda | sustituido: un solo respaldo, no cinco |
| C.5 #45-#48 | Gerente asignado / sin gerente / `Asignar gerente` | Celda `Responsable`; `—` cuando falta, y `StatCard` `Sin responsable` = `1` en tono `danger` | sustituido |
| C.5 #49-#51 | Resumen de horarios y sus dos indicadores | — | omitido de la tabla: pasa a la hoja de detalle; se anota |
| C.5 #52-#53 | Badges `Activa` / `Inactiva` | Celda `Estado` | calcado |
| C.5 #54-#57 | `Publicado` / `No publicado`, URL construida y `Ver sitio` | Celda `Tienda web` | calcado, simplificado |
| C.5 #58-#59 | Badges `Asignado` / `No asignado` | Celda `Equipo` = `5 personas` | sustituido: dice cuántas, no si sí o no |
| C.5 #60-#66 | `Publicar`/`Despublicar`, `Asignar`/`Cambiar`, `Ver`, `Editar`, `Eliminar` | Menú «⋮» de la fila | sustituido: seis botones sueltos por fila pasan a un menú |
| C.5 #67-#75 | Diálogo de crear/editar con **dos botones «Crear Sucursal»**, uno inerte | `— nueva sucursal`: hoja lateral de 560 px con **un solo** `Crear sucursal` al pie | sustituido (E.4) |
| C.5 #76-#77 | `AssignManagerModal` y `DynamicBranchMapModal` | — | omitido: no cambian |
| C.5 #78-#81 | `ConfirmDialog` con la **copy cruzada** | `ConfirmDialog Variant=destructive`: `¿Eliminar la Sucursal Norte?` + «Sus ventas, su stock y sus movimientos se conservan en el historial.» | sustituido (E.4) |
| C.5 #82-#128 | Diálogo de detalle de sucursal (47 controles, casi todo en español duro) | — | omitido: no cambia en este rediseño; se anota que `NIT`, `Zona` y `Capacidad` **se muestran y no tienen campo en el formulario** |
| C.5 #129-#175 | `BranchForm` completo (47 controles) | `— nueva sucursal`: bloques `Identidad`, `Ubicación`, `Contacto`, `Opciones` | sustituido: el formulario se reorganiza en bloques y comparte los campos con el paso 3 del asistente (sección 6) |
| C.5 #133 | `Nombre *` con `required` **inoperante** | `FormField` obligatorio con validación real | sustituido (E.4) |
| C.5 #134 | `Código de sucursal` `readOnly` autogenerado | `Código` editable con ayuda `Único en la organización` | sustituido |
| **Nuevo** | `Pagination` con `Mostrando 1–6 de 6 sucursales` | `— listo` | **Nuevo**: hoy la lista trae todas sin paginar (E.13) |
| **Nuevo** | Buscador `Buscar por nombre, código o ciudad…` | `— listo` | **Nuevo**: hoy no hay buscador |
| **Nuevo** | `StatCard` `Surten la tienda web` = `1` | `— listo` | **Nuevo** |

---

## 10. Organización › Plan y módulos — sección `10. …`

Frames: `Escritorio / Plan — listo`, `— suscripción vencida`, `Escritorio / Módulos — listo`,
`Móvil / Plan — listo`.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.6 #1-#3 | Esqueleto, banner de error y caja amarilla sin permiso | `DataTable`/`Skeleton` y `EmptyState Variant=forbidden` | sustituido |
| C.6 #4-#7 | Dos banners de Stripe (`?checkout=success` / `canceled`) con su ✕ | `Toast Variant=success` / `Variant=warning` | sustituido |
| C.6 #8-#11 | `Mi Plan`, bajada, `Facturación`, `Historial` | `PageHeader Variant=detail`: `Plan y facturación` + `Plan Pro mensual · próxima factura el 12 de octubre`, con `Ver facturas` | sustituido |
| C.6 #13 | `Error` + `{error}` **crudo de Supabase o Stripe** | — | sustituido (E.6) |
| C.6 #14-#22 | Nombre del plan, precio, badges de estado, días de prueba y periodo | `PlanCard Status=active` / `Status=expired` | sustituido por el componente del kit |
| C.6 #17 | Precio Enterprise **calculado en el navegador** | Anotación del frame | sustituido: el precio viene del servidor (E.11) |
| C.6 #22 | Fechas con `toLocaleDateString('es-ES')` | `próxima factura el 12 de octubre` | sustituido: pasa por la zona horaria de la organización (E.7) |
| C.6 #23-#31 | `Cambiar Plan`, `Comparar Planes`, segmento mensual/anual, `Portal de Facturación`, `Renovar`, `Reactivar`, `Cancelar` | Fila de acciones: `Cambiar de plan`, `Comprar usuarios`, `Comprar sucursales`, `Comprar créditos de IA`, `Ver facturas` | sustituido: una sola fila de acciones en vez de seis botones repartidos |
| C.6 #26-#27 | Segmento mensual/anual **que no funciona** desde el modal | Anotación del frame | sustituido (E.4) |
| C.6 #32-#34 | Tres avisos de estado de la suscripción | `— suscripción vencida`: banner rojo con `Pagar ahora` | sustituido: estado con acción |
| C.6 #35-#37 | `Sin suscripción activa` + `Seleccionar Plan` | `PlanCard Status=expired` | calcado |
| C.6 #38-#57 | `Límites del Plan`: 5 medidores con barras **sin `role="progressbar"`** | Bloque `Uso del plan` con 4 `Progress` del kit (`Usuarios`, `Sucursales`, `Créditos de IA`, `Almacenamiento`) | sustituido |
| C.6 #46, #50, #56 | Tres botones `+ Comprar más` | Fila de acciones única | sustituido |
| C.6 #58-#67 | `Módulos Activos` y `Módulos Disponibles` (con el subtítulo que **contradice el badge**) | Sección `Módulos` (frame propio) | sustituido: los módulos pasan a su propia pantalla |
| C.6 #68-#77 | Comparador de planes | — | omitido: no cambia; se anota que sus botones **abren el modal sin preseleccionar el plan** (E.4) |
| C.6 #78-#79 | Dos `window.alert` | `Toast` del kit | sustituido (E.5) |
| C.6 #80-#146 | `ChangePlanModal` y los tres modales de compra (usuarios, sucursales, créditos) | — | omitido: no cambian en este rediseño; se anota que **sus precios están cableados** (E.11) y que el banner de éxito de `ChangePlanModal` es inalcanzable |
| C.6 #147-#153 | `CouponInput` | — | omitido: se reutiliza tal cual en el paso 4 del asistente (sección 6) |
| C.6 #154-#166 | `PaymentMethodCard` completo | Bloque `Método de pago`: `Visa que termina en 4242` + `Cambiar tarjeta` + `Quitar` | calcado |
| C.6 #166 | `window.confirm` para borrar el método de pago | `ConfirmDialog` (patrón de la sección 8) | sustituido (E.5) |
| C.6 #167-#202 | `MemberQuotasSheet`, `QuotaEditor`, `QuotaHistory` y su lógica | — | omitido: **es el único bloque del módulo bien construido** (validación real, errores normalizados, `role="progressbar"`, fechas sin `new Date()` local). Se conserva tal cual y se anota como referencia |
| C.7 #1-#12 | Cabecera duplicada, esqueleto, avisos y errores de módulos | `PageHeader Variant=list`: `Módulos` + `7 activos de 19 · plan Pro` | sustituido |
| C.7 #8-#11 | Cuatro KPI de uso de módulos | Subtítulo del `PageHeader` | sustituido: cuatro cifras sueltas pasan a una línea |
| C.7 #13-#19 | `Módulos Core` + badge `Incluidos en todos los planes` + `Siempre activo` + candado sin `aria-label` | Tarjetas con badge `Incluido` y `Switch State=on` | sustituido |
| C.7 #20-#27 | `Módulos Especializados`, badge `Activo`/`Inactivo`, `Switch`, `Procesando...`, `Límite del plan alcanzado` | Tarjetas con badge `Del plan` y `Switch` | calcado |
| C.7 #28-#32 | `Páginas del módulo` + badge `{n}/{m}` + toggles por página, **solo para módulos de pago** | Chips de páginas visibles **también en los módulos incluidos**, con badge «Nuevo» | sustituido (E.4) |
| C.7 #33-#35 | `¿Necesitas más módulos?` + `Actualizar Plan` | — | omitido: lo cubre el banner de `— suscripción vencida` |
| C.7 #36-#37 | `canToggleModule` y los conteos | — | omitido: no tienen interfaz propia |
| **Nuevo** | Buscador `Buscar módulo…` | `Módulos — listo` | **Nuevo**: hoy se listan ~25 módulos sin buscador |

---

## 11. Organización › Mis organizaciones y Dominios — sección `11. …`

Frames: `Escritorio / Mis organizaciones — listo`, `Escritorio / Dominios — listo`,
`Móvil / Mis organizaciones — listo`, más un `ConfirmDialog`.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.8 #1-#8 | **Tres** títulos distintos en la misma pantalla | `PageHeader Variant=list`: `Mis organizaciones` + `Perteneces a 4 organizaciones · la principal aparece primero` | sustituido |
| C.8 #3-#5 | Tres capas de esqueleto (con `Card`, que no se parece al contenido) | `Skeleton` del kit | sustituido |
| C.8 #6-#7, #10 | Tres bloques rojos con `err.message` crudo | — | sustituido (E.6) |
| C.8 #9 | `Crear Nueva Organización` que **monta el asistente en línea** | Botón `Nueva organización` que abre el **diálogo** de la sección 6 | sustituido |
| C.8 #11 | Banner azul informativo sobre organizaciones inactivas | Banner `La estrella se guarda en tu cuenta, no en este navegador…` | sustituido: el aviso pasa a explicar lo que el dueño reporta (D.1) |
| C.8 #12-#13 | `Cargando formulario...` y los 4 pasos del asistente en línea | Sección 6 | sustituido |
| C.8 #14-#18 | `AlertDialog` `¿Eliminar organización?` con descripción que **dice borrado físico** siendo lógico | `ConfirmDialog Variant=destructive`: `¿Eliminar Café de la Esquina?` + confirmación por nombre | sustituido |
| C.8 #19-#29 | Panel de filtros artesanal con 4 filtros | `SearchBar` + `FilterButton` | sustituido |
| C.8 #30-#32 | Plan derivado, esqueleto y error que **borra la lista** | `OrgSelectCard` con badge de plan | sustituido |
| C.8 #33 | **Vacío único** «con los filtros aplicados», también sin filtros | `EmptyState Variant=empty` / `Variant=search` según el caso (patrón de la sección 5) | sustituido |
| C.8 #34-#41 | `<ul>` con filas `<div role="button">`, badges `Actual`, tipo, rol, plan y estado | Dos grupos (`Favoritas`, `Todas`) de `OrgSelectCard` | sustituido: la misma tarjeta que la pantalla de acceso |
| C.8 #39 | Rol **de la organización activa**, no de la fila | `OrgSelectCard`: rol real por organización | sustituido (E.2) |
| C.8 #42-#48 | Toggle de estado, `Cambiar plan`, papelera sin `aria-label` y tres atajos `Space` muertos | Menú «⋮» de la tarjeta | sustituido |
| C.8 #46 | Mapeo de plan **por nombre en español** | — | sustituido: el plan viaja por id (E.11) |
| C.8 #49 | Chevron decorativo **sin handler** | — | omitido: toda la tarjeta es clicable |
| C.8 #50 | `ChangePlanModal` | — | omitido: no cambia |
| C.9 #1-#6 | Cabecera fija con flecha y tres botones | `PageHeader Variant=list`: `Dominios` + `6 dominios · 1 con error de DNS`, con `Comprar dominio` y `Añadir dominio` | sustituido |
| C.9 #7 | Esqueleto que **no corresponde a la interfaz** (4 KPI y filtros que no existen) | `DataTable State=loading` | sustituido |
| C.9 #8-#12 | Encabezado, contador y estado vacío | `PageHeader` + `DataTable State=empty` | sustituido |
| C.9 #13-#21 | Cinco diálogos y la confirmación de borrado | `ConfirmDialog Variant=destructive` (patrón de la sección 9) | calcado |
| C.9 #22-#40 | **19 toasts**, todos con el título `Error` sin traducir | `Toast` del kit | sustituido |
| C.9 #41-#67 | `AddCustomDomainDialog` (asistente de 2 pasos) | — | omitido: no cambia; se anota que su token se genera con `Math.random()` en el cliente (E.1) |
| C.9 #68-#105 | `BuyDomainDialog` (asistente de 4 pasos) | — | omitido: no cambia; se anota que el correo y el país WHOIS **no se validan** (E.12) |
| C.9 #106-#132 | `DNSInstructions` | — | omitido: no cambia; se anota la fecha con la zona del navegador (E.7) |
| C.9 #133-#154 | `DomainCard` con su menú de 8 acciones | `DataTable Layout=table`: `Dominio`, `Tipo`, `Apunta a`, `Proveedor`, `SSL`, `Renovación`, `Estado` + menú «⋮» | sustituido: la rejilla de tarjetas pasa a tabla, que es lo que pide una lista de 6 columnas de datos |
| C.9 #155-#171 | `DomainFilters` — **17 controles muertos** | `SearchBar` + `FilterButton` con contador, **conectados** | sustituido: se conecta lo que ya existe |
| C.9 #172-#186 | `DomainForm` con el botón **fuera del `<form>`** | — | omitido: no cambia; se anota |
| C.9 #187-#209 | `ImportDialog` — **23 controles muertos**, con «arrastra y suelta» sin `onDrop` | — | omitido: o se conecta o se borra; queda anotado en E.4 |
| C.9 #210-#223 | `RedirectDialog` | — | omitido: no cambia |
| C.9 #224-#239 | `SubdomainManager` | — | omitido: no cambia; se anota la carrera entre el antirrebote y el guardado (E.12) |
| **Nuevo** | `Pagination` con `Mostrando 1–6 de 6 dominios` | `Dominios — listo` | **Nuevo** (E.13) |
| **Nuevo** | Banner que señala `DomainFilters` e `ImportDialog` como funcionalidad ya escrita y sin montar | `Dominios — listo` | **Nuevo**: nota de trabajo para quien implemente |

---

## 12. Planes y suscripción — sección `12. …`

**Corrección 5.** Frames: `Escritorio / Planes — mensual`, `— anual`, `— con cupón aplicado`,
`— plan a medida`, `— método de pago`, `— cargando`, `— error al cargar` (1440×H).

El paso de plan es el **paso 4 del asistente compartido** (sección 6), así que usa el mismo
diálogo, el mismo `Stepper` y el mismo pie: no es una pantalla aparte.

**Regla de datos**: precios en **pesos colombianos**, características derivadas de las **columnas**
de `plans` (`max_users`, `max_branches`, `max_modules`, `ai_credits_monthly`, `comm_sms_monthly`,
`comm_whatsapp_monthly`, `comm_voice_minutes_monthly`, `comm_voice_agent_enabled`, `trial_days`),
nunca de `features`, que las contradice (F.2). **No se dibuja plan gratis**: `free` está inactivo.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| F.4 `SubscriptionStep` #1-#3 | `Selecciona un plan` + bajada + «periodo de prueba de {days} días» | Cabecera del bloque `Plan` + badge de prueba en cada tarjeta | sustituido: la prueba se dice en cada plan, porque son 15 o 30 días según el plan |
| F.4 #4 | Pestaña `Mensual` / `Anual -20%` *(literal)* | Conmutador `Mensual` / `Anual · 2 meses gratis` | sustituido: el «-20 %» cableado contradice `price_usd_year` y el `×10` de Enterprise (F.6 #7). Se dice el beneficio real |
| F.4 #5 | Tarjeta de plan (`div` clicable, sin teclado) | `PlanOption Estado=normal / recomendado / seleccionado` | sustituido: pasa a control con foco y estado; nombre, precio, ahorro y características salen de la base |
| F.4 #6 | `Cargando planes...` | `— cargando` (4 `Skeleton Variant=card`) | sustituido por el `Skeleton` del kit |
| F.6 #5 | Catálogo de respaldo cableado que se pinta **sin avisar** | `— error al cargar` (`EmptyState Variant=error` con «Reintentar») | sustituido: si no podemos leer los precios, no los inventamos |
| F.4 #7-#11 | `¿Cómo quieres empezar?` + radios `Usar días gratis` / `Pagar ahora` | Bloque `Resumen`: el aviso dice si se cobra hoy o el día en que termina la prueba | sustituido: la elección se refleja en el total, no en dos radios sueltos |
| F.4 #12-#19 | Bloque de cupón: campo, `Aplicar`, chip del cupón aplicado, error | Bloque `Cupón de descuento` + `— con cupón aplicado` | calcado |
| F.6 #22 | El descuento se aplica al periodo completo sin mirar `durationMonths` | `— con cupón aplicado`: «BIENVENIDO20 · 20 % los primeros 3 meses» y el total refleja solo esos meses | sustituido |
| F.4 #20 | `PriceSummary` | Bloque `Resumen` con plan, cupón, total y aviso de cobro | sustituido: se integra en el paso, no es una caja blanca aparte |
| F.6 #40 | `PriceSummary` sin modo oscuro | Bloque `Resumen` con variables del sistema | sustituido |
| F.6 #13 | Un plan `is_custom_enterprise` pinta **«$NaN /mes»** | `PlanOption Estado=a-medida` («Hablemos», «Habla con ventas») y el frame `— plan a medida` | sustituido |
| F.4 `PaymentMethodStep` #1-#10 | Método de pago, mensajes según `isPayNow`, badges y `CardElement` | `— método de pago` | calcado |
| F.6 #23 | Botón con la clave i18n inexistente `auth.signup.payment.payNow` | `— método de pago`: `Crear organización` | sustituido |
| F.4 #16 | `Omitir por ahora` | `— método de pago`: aviso azul con `Omitir por ahora` y la regla escrita | calcado, con la regla visible |
| F.4 #8 | `¡Método de pago verificado!` + `VISA •••• 4242` | — | omitido: variante del mismo bloque; se anota |
| F.4 `EnterpriseConfigSelector` (22 controles) | Configurador de Enterprise a mano | `PlanOption Estado=a-medida` + «Dejar mis datos» | sustituido: el componente está muerto (su consumidor tampoco tiene consumidores) y pide a mano justo los campos que `plans` ya tiene |
| **Nuevo** | Precio en pesos y equivalente anual con el ahorro calculado | Las tres tarjetas de pago | **Nuevo**: hoy solo hay `price_usd_*`, y `price_cop_*` están en `NULL` |
| **Nuevo** | Usuarios, créditos de IA y canales de comunicación en la tarjeta | Las tres tarjetas de pago | **Nuevo**: el registro no muestra hoy ni usuarios ni créditos |
| **Nuevo** | `El más elegido` sobre Business | `PlanOption Estado=recomendado` | **Nuevo** |

### 12.1 Multimoneda — corrección 8

Frames añadidos: `Escritorio / Planes — en dólares (USD)` y `Móvil / Planes — elegir plan`.

Decisión del dueño: el precio se muestra en la moneda del visitante, pero **no se convierte con la
tasa del día**. Sale de `plan_prices`, cargado a mano por moneda, **sin decimales en ninguna**. La
tasa en vivo de OpenExchangeRates se queda para las operaciones del ERP.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| F.9 | Selector de moneda con las 10 activas de `currencies` | Bloque `Plan`, a la izquierda del conmutador mensual/anual, con badge «Nuevo» | **Nuevo**: hoy no existe ningún selector de moneda en el registro |
| F.9 | Nota «Precios en {moneda}. Se cobra en {moneda}» | Bajo el selector | **Nuevo** |
| F.9 | El mismo diseño en otra moneda | `— en dólares (USD)`: $ 29 / $ 59 / $ 299 al mes | **Nuevo** |
| F.9 | `currencies.decimals` respetado (0 en COP, CLP y JPY) | Todas las tarjetas: con la tabla aprobada, **ningún precio lleva decimales** | **Nuevo** |
| F.6 #9-#11 | `price_usd_*` con `$` a secas, etiquetas cableadas en español y `.toFixed(2)` | Símbolo y formato por moneda, y la moneda dicha con su código ISO | sustituido |
| F.9 | Equivalente anual con el ahorro | «$ 290 al año · Ahorras $ 58 al año» | calcado del patrón, ahora por moneda |
| C.12 móvil | Vista de planes en 390 | `Móvil / Planes — elegir plan`: selector de moneda arriba, un plan por fila a ancho completo, resumen fijo abajo | **Nuevo** |

Los precios dibujados son los de la tabla aprobada por el dueño (F.9), con el anual igual a diez
meses. La anotación de los frames recoge que **la correspondencia con Stripe está pendiente**:
`stripe_price_monthly_id` / `yearly_id` son un precio por plan y periodo en una sola moneda, así
que vender en diez exige un precio de Stripe por moneda.

---

## 13. Páginas dentro de cada módulo — sección `10. …`

**Corrección 7.** Frames añadidos: `Escritorio / Módulos — páginas del módulo` y
`Escritorio / Módulos — módulo apagado`.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.7 #28 | `Páginas del módulo` *(literal)*, **solo en módulos de pago** | Bloque de páginas en **todos** los módulos, incluidos los del plan | sustituido (E.4) |
| C.7 #29 | Badge `{activeCount}/{totalCount}` | `7 de 9 activas` bajo el título | calcado |
| C.7 #30-#32 | `{page.name}` + spinner + toggle por página | Lista con nombre, `page_href` en gris y `Switch` por fila | calcado, con la ruta visible |
| C.7 #24, #26-#27 | Toggle del módulo, `Procesando...`, `Límite del plan alcanzado` | Cabecera de la tarjeta con `Switch` y badge `Apagado` | calcado |
| **Nuevo** | `Activar todas` / `Desactivar todas` | Cabecera del bloque de páginas | **Nuevo** |
| **Nuevo** | Badge `Oculta` en la fila de una página apagada | Lista de páginas | **Nuevo** |
| **Nuevo** | Aviso «Al apagar una página deja de verse en el menú y su ruta queda fuera de alcance para toda la organización. Los datos no se borran.» | Pie del bloque | **Nuevo** |
| **Nuevo** | Estado «módulo apagado»: la lista se ve pero no se toca, con explicación | `— módulo apagado` | **Nuevo** |
| **Nuevo** | Buscador `Buscar módulo o página…` | Ambos frames | **Nuevo** |

La anotación de los frames recoge las dos cosas que el diseño no resuelve solo: que la regla real
es **«si no hay fila en `organization_module_pages`, la página se asume activa»**
(`modulos/page.tsx:334-336`), de modo que «sin fila» y «activa» se ven igual; y que
**`/api/modules/pages` no autentica** (E.2).

---

## 14. Qué cambió en la revisión del 2026-09-22

| # | Corrección del dueño | Qué se hizo | Frames tocados |
|---|---|---|---|
| 1 | El registro no bloquea por confirmar el correo | `Crear cuenta — revisa tu correo` pasa a **estado alternativo documentado**, y se añade `Escritorio / Entras directo — aviso de confirmación`: se entra a la app y el recordatorio vive dentro, persistente y discreto, con «Reenviar correo» y «Cambiar el correo» | 2 |
| 2 | Teléfonos en formato internacional en todos los formularios | Componente `PhoneInput` nuevo en el kit y **11 frames** migrados de `FormField` a `PhoneInput`. Documentados en E.14 los 5 formularios del código que siguen con el input crudo, y por qué `Keypad.tsx` no cuenta | 11 |
| 3 | Municipio DANE frente a código postal | Selector único «Municipio (DANE)» con `Medellín · Antioquia · 05001` y su ayuda; departamento derivado y de solo lectura; código postal aparte, opcional, con ejemplo de 6 dígitos. Documentado en E.15 | 3 |
| 4 | `EmptyState` con acciones de otra pantalla | Quitados «Importar» y «Nuevo producto» del vacío de organizaciones, que queda con **una sola acción**; eliminado el botón duplicado del pie; corregidos los 4 `EmptyState`, el `BulkActionBar`, las tablas y las migas | **20** |
| 5 | Los planes no reflejan los reales | Componente `PlanOption` y sección 12 completa con precios en pesos, ahorro anual, plan a medida, cupón, método de pago y los 4 estados. Auditoría ampliada con la sección F | 7 nuevos |
| 6 | El asistente en móvil, ilegible | `Móvil / Nueva organización — paso 1` rehecho: **una sola columna**, campos a ancho completo, pasos como barra de progreso compacta, pie fijo, y el badge «Nuevo» fuera del frame | 1 rehecho + 10 revisados |
| 7 | Coherencia del mockup | Títulos de `MobileHeader` corregidos (3), iconos de acción corregidos (15), planes de ejemplo coherentes con la base (44 textos), nombres de organización sin truncar (16 tarjetas), atajos de teclado ocultos en móvil (13) | **20** |
| 8 | Precios en 10 monedas, fijos por moneda | Selector de moneda en los 4 frames de selección de plan, frame nuevo en dólares y vista móvil de planes. Auditoría ampliada con F.9: las 10 monedas de `currencies` con sus decimales, las tasas del 2026-09-22, el modelo `plan_prices`, la tabla de precios aprobada, las reglas de redondeo y la dependencia con Stripe | 6 |

**Datos de ejemplo unificados en toda la página**: Mi empresa S.A.S. · **Plan Ultimate** ·
6 sucursales · 12 personas de 30 · 4 organizaciones (Mi empresa S.A.S. *Ultimate*, Distribuidora
del Norte *Business*, Taller Los Andes *Pro*, Café de la Esquina *Pro*). Las cifras cuadran con
las columnas reales del plan Ultimate: `max_users = 30`, `max_branches = 15`, `max_modules = 19`,
`ai_credits_monthly = 10.000`.

---

## 15. Lo que no se dibujó, y por qué

| Bloque | Controles | Motivo |
|---|---:|---|
| `/auth/super-admin-access` (A.8) | 8 | Pantalla de servicio del panel de super admin; el dueño no la menciona y su recorrido no cambia. Queda la nota de que debe montar `AuthScene`. |
| `GeolocationModal` (A.1 #27) | 1 | No cambia y no pertenece al flujo de acceso rediseñado. |
| Diálogo de detalle de sucursal (C.5 #82-#128) | 47 | No cambia en este rediseño. Se anotan los tres campos que muestra y que el formulario no permite editar. |
| `ChangePlanModal` y los tres modales de compra (C.6 #80-#146) | 67 | No cambian; sus problemas (precios cableados, banner inalcanzable, segmento anual roto) quedan documentados en E.4 y E.11. |
| `MemberQuotasSheet` / `QuotaEditor` / `QuotaHistory` (C.6 #167-#202) | 36 | **Es el bloque mejor construido del módulo**: se conserva tal cual y se propone como referencia. |
| Diálogos de dominios (C.9 #41-#132, #172-#239) | 118 | No cambian; sus fallos quedan en E.1, E.7 y E.12. |
| `/app/organizacion/branding` y `/branding/reviews` (C.11) | 290 | El editor del sitio web tiene su propio plan (`docs/website-builder-v2`) y su propia página de Figma. Aquí solo se documenta y se señala lo grave: **scripts inyectables sin saneado ni permiso** y **tres pestañas muertas**. |
| `AuthLayout` (A.0 #1) | 1 | Código muerto. |
| Estados de carga textuales (`Loading...`, `Validando invitación...`, etc.) | 9 | Se sustituyen por los esqueletos del kit; no son controles. |

**Total omitido: 577 controles**, todos con motivo. De los 888 restantes, **33 llevan badge
«Nuevo»** en Figma.

---

## 16. Chequeo final

Ejecutado por script sobre la página `08 Acceso y organización` y sobre la Sección `Acceso` de
`02 Componentes`, tras las ocho correcciones:

| Comprobación | Resultado |
|---|---|
| Solapes entre Secciones | **0** |
| Solapes entre frames de primer nivel dentro de cada Sección | **0** |
| Contenido que se sale de su frame de pantalla | **0** |
| Nodos que se salen del ancho del frame (móvil incluido) | **0** |
| Frames que se salen de su Sección | **0** |
| Instancias rotas (sin `mainComponent`) | **0** |
| Etiquetas heredadas de otra pantalla («producto», «catálogo», «SKU») | **0** tras corregir 20 frames |
| `MobileHeader` con título que no corresponde a su frame | **0** tras corregir 3 |
| Iconos que no corresponden a su acción | **0** tras corregir 15 |
| Frames de pantalla | 70 (59 escritorio 1440 · 11 móvil 390) |
| Secciones | 13 (Índice + 12) |
| Instancias del kit | 3.278 |
| Badges «Nuevo» visibles | 43 |
| Separación entre Secciones | 400 px |
| Separación entre frames | 160 px |

Capturas en `docs/design/figma/`: `19-acceso-componentes.png`, `19-acceso-entrar.png`,
`19-acceso-entrar-detalle.png`, `19-acceso-crear-cuenta.png`, `19-acceso-contrasena.png`,
`19-acceso-verificacion-invitacion.png`, `19-acceso-seleccion-organizacion.png`,
`19-acceso-seleccion-organizacion-detalle.png`, `19-acceso-seleccion-organizacion-vacio.png`,
`19-acceso-crear-organizacion.png`, `19-acceso-crear-organizacion-detalle.png`,
`19-acceso-crear-organizacion-movil.png`, `19-acceso-planes.png`,
`19-acceso-planes-detalle.png`, `19-acceso-planes-usd.png`, `19-acceso-planes-movil.png`,
`19-organizacion-informacion.png`, `19-organizacion-miembros-invitaciones.png`,
`19-organizacion-miembros-detalle.png`, `19-organizacion-sucursales.png`,
`19-organizacion-plan-modulos.png`, `19-organizacion-modulos-paginas.png`,
`19-organizacion-mis-organizaciones-dominios.png`, `19-organizacion-mis-organizaciones-movil.png`.
