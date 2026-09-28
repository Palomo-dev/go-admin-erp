# Auditoría control por control — Perfil de usuario y Cajas del POS

Insumo para que el diseñador **calque la realidad** en Figma («GO Admin — Sistema de diseño»,
`EAvjINVRnlzFM70GVoWXgl`). Mismo formato y leyenda que
`docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md`: aquí va **cada control** —botón, menú,
pestaña, campo, toggle, chip, badge, tabla, diálogo, tooltip, atajo, estado— con su etiqueta
exacta, lo que hace, cuándo aparece y `archivo:línea`.

Fecha: 2026-09-22. Solo lectura de código; el esquema de `profiles`, `user_devices`,
`organization_members`, `member_branches`, `user_notification_preferences`, `cash_sessions`,
`cash_movements`, `cash_counts`, `job_positions` y `roles`, las políticas RLS, los índices y la
publicación `supabase_realtime` se verificaron con `SELECT` por el MCP de Supabase
(`jgmgphmzusbluqhuqihj`). Sin nombres de organizaciones cliente: se usan «org 120» y
«Mi empresa S.A.S.». Rutas relativas a `src/` salvo que se indique.

Leyenda de **Tipo**: botón · menú (trigger o ítem) · pestaña · campo · toggle (switch/checkbox/
radio/segmento) · chip (píldora clicable) · badge (solo lectura) · tabla · diálogo · tooltip ·
atajo · estado (vacío/cargando/error/aviso) · texto · stat (KPI) · paginación · toast ·
cálculo (regla sin control visible). **Etiqueta exacta** es el literal del código con su
acentuación (o su falta). **Cuándo aparece**: «Siempre» = incondicional dentro de su pantalla;
breakpoints Tailwind (`sm` 640 · `md` 768 · `lg` 1024); «Desktop» = Go Admin Desktop (Electron).

Índice: **A. Perfil de usuario** (contenedor + 8 secciones + menú de sesión del header +
lo roto + campos de BD no expuestos) · **B. Cajas del POS** (listado, detalle, arqueo,
movimiento, los tres diálogos, modelo de datos, cierre ciego, permisos, `cashMode`,
multi-sucursal, sin conexión, reportes, lo roto) · **C. Conteo de controles** ·
**D. Recomendación de rediseño**.

---

## A. Perfil de usuario `/app/perfil`

Ningún texto de esta pantalla pasa por `messages/es.json`: todo está literal en el código.
El contenedor es `app/app/perfil/page.tsx` (621 líneas) y monta siete componentes de
`components/profile/` más un bloque de vendedor declarado en el propio archivo.

### A.0 Contenedor — `app/app/perfil/page.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Skeleton de barra lateral + panel | Esqueleto a mano (avatar 80 px, 7 filas, 4 bloques) | Mientras `loading` | page.tsx:319-351 |
| 2 | texto | — (avatar 80 px) | Foto del perfil o inicial del nombre sobre círculo azul | Siempre | page.tsx:360-376 |
| 3 | texto | `{full_name}` o `{first_name} {last_name}` | Nombre del usuario | Siempre | page.tsx:377-379 |
| 4 | texto | `{user.email}` | Correo de la sesión de Auth | Siempre | page.tsx:380 |
| 5 | botón | `Datos personales` | Cambia a la sección; en móvil oculta la lista | Siempre | page.tsx:309, 384-401 |
| 6 | botón | `Seguridad` | ídem | Siempre | page.tsx:310 |
| 7 | botón | `Sesiones y dispositivos` | ídem | Siempre | page.tsx:311 |
| 8 | botón | `Organización por defecto` | ídem | Siempre | page.tsx:312 |
| 9 | botón | `Preferencias de notificación` | ídem | Siempre | page.tsx:313 |
| 10 | botón | `Roles asignados` | ídem | Siempre | page.tsx:314 |
| 11 | botón | `Panel de Vendedor` | ídem | Siempre | page.tsx:315 |
| 12 | botón | `Eliminar cuenta` | ídem | Siempre | page.tsx:316 |
| 13 | botón | `Volver` | Vuelve a la lista de secciones | `< lg` y con sección abierta | page.tsx:409-416 |
| 14 | toast | `No se encontró sesión de usuario` | Error de arranque | Sin sesión | page.tsx:103 |
| 15 | toast | `Error al cargar datos de perfil` | Falla el `select` de `profiles` | Error | page.tsx:118 |
| 16 | toast | `Error al cargar datos del usuario` | Error general del `useEffect` | Error | page.tsx:288 |

Lee: `profiles` (`select *`, page.tsx:110-114) · `user_devices` (124-129, **resultado nunca
usado**) · `organization_members` + `roles` + `organizations` (152-167) · `organization_members`
+ `member_branches` + `branches` (194-206) · `organization_members` + `organizations` (228-236) ·
`supabase.auth.mfa.listFactors()` (256-268) · `sellers` (276-281). No escribe nada.

**No hay cabecera de página.** No existe `PageHeader`, ni breadcrumbs, ni título «Mi perfil»:
la pantalla arranca directamente con la barra lateral. Tampoco hay ningún dato de la
organización activa ni de las sucursales en la cabecera (las sucursales están enterradas
dentro de «Roles asignados», §A.6).

### A.1 Datos personales — `components/profile/DatosPersonalesSection.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Datos personales` | Título de la sección | Siempre | :320-322 |
| 2 | botón | `Editar` | Habilita los campos | Solo en lectura | :324-330 |
| 3 | texto | — (avatar 96 px) | Vista previa: archivo elegido, avatar guardado o inicial | Siempre | :337-358 |
| 4 | botón | — (overlay con icono `Upload`) | Abre el selector de archivo al tocar la foto | Editando, **solo si NO hay avatar**, y **solo con el puntero encima** | :350-355 |
| 5 | campo | — (`input type=file`, `accept="image/png, image/jpeg"`) | Selector oculto | Editando | :363-371 |
| 6 | botón | `Subir foto` | Abre el selector | Editando | :372-380 |
| 7 | botón | `Eliminar` | Borra el avatar del storage y de `profiles` **al instante** | Editando y con avatar | :381-391 |
| 8 | texto | `PNG o JPG. Máximo 2MB.` | Ayuda del avatar | Editando | :393-395 |
| 9 | campo | `Nombre completo` (`Nombre y Apellido`) | Un solo input que luego se parte en dos columnas | Siempre (deshabilitado en lectura) | :402-415 |
| 10 | campo | `Correo electrónico` | Solo lectura, valor de Auth | Siempre | :417-428 |
| 11 | botón | `Cambiar` | Abre el diálogo de cambio de correo | Siempre (también en lectura) | :429-436 |
| 12 | campo | `Teléfono` (`PhoneInput`) | Teléfono con indicativo | Siempre | :440-451 |
| 13 | campo | `Idioma preferido` (`Español` · `English` · `Português` · `Français`) | Escribe `preferred_language` y cambia el idioma en caliente | Siempre | :453-470, :51-56, :207-209 |
| 14 | botón | `Cancelar` | Descarta y restaura el estado inicial | Editando | :475-482 |
| 15 | botón | `Guardar cambios` / `Guardando...` | `update` de `profiles` + subida del avatar | Editando | :483-499 |
| 16 | diálogo | `Cambiar correo electrónico` | Pide el nuevo correo dos veces | Tras el control 11 | :505-580 |
| 17 | texto | `Correo actual` | Muestra `user.email` | En el diálogo | :515-522 |
| 18 | campo | `Nuevo correo` (`nuevo@correo.com`) | Correo destino | En el diálogo | :523-535 |
| 19 | campo | `Confirma el nuevo correo` (`repite el nuevo correo`) | Confirmación; `Enter` envía | En el diálogo | :536-557 |
| 20 | estado | `Los correos no coinciden` | Error inline bajo el campo | Cuando difieren | :558-560 |
| 21 | botón | `Cancelar` | Cierra el diálogo | En el diálogo | :564-570 |
| 22 | botón | `Enviar confirmación` | Valida y abre la confirmación | En el diálogo | :571-577 |
| 23 | diálogo | `¿Estás seguro de cambiar tu correo?` | `AlertDialog` de confirmación con ambos correos | Tras el control 22 | :583-611 |
| 24 | botón | `Cancelar` | Cierra la confirmación | En el `AlertDialog` | :594 |
| 25 | botón | `Sí, cambiar mi correo` / `Enviando...` | `auth.updateUser({ email })` | En el `AlertDialog` | :595-608 |
| 26 | toast | `La imagen es demasiado grande. El tamaño máximo permitido es 2MB.` | Validación de tamaño | Archivo > 2 MB | :104 |
| 27 | toast | `Formato de archivo no permitido. Use JPG, PNG o WEBP.` | Validación de formato | Extensión no admitida | :110 |
| 28 | toast | `Subiendo imagen...` → `Imagen subida correctamente` | Progreso de la subida | Al guardar con archivo | :133, :156 |
| 29 | toast | `Información actualizada correctamente` / `Error al actualizar la información` | Resultado del guardado | Al guardar | :210, :216 |
| 30 | toast | `Avatar eliminado correctamente` / `Error al eliminar avatar` | Resultado del borrado | Control 7 | :253, :259 |
| 31 | toast | `Ingresa un correo electrónico válido` · `El nuevo correo debe ser diferente al actual` · `Los correos no coinciden. Verifica que estén escritos igual.` | Validaciones del diálogo | Control 22 | :277, :282, :285 |
| 32 | toast | `Correo de confirmación enviado a {correo}. Revisa tu bandeja de entrada…` (6 s) | Éxito del cambio de correo | Control 25 | :304-307 |

Escribe: `profiles.first_name`, `.last_name`, `.phone`, `.avatar_url`, `.preferred_language`,
`.updated_at` (:190-202) · storage `profiles/avatars/*` (subida :146-151, borrado :233-235) ·
`auth.users.email` vía `auth.updateUser` (:294-296).

### A.2 Seguridad — `components/profile/SeguridadSection.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Seguridad` + `Administre su contraseña y configure la autenticación de dos factores para proteger su cuenta.` | Cabecera | Siempre | :200-207 |
| 2 | texto | `Contraseña` + `Cambie su contraseña regularmente para mayor seguridad` | Bloque 1 | Siempre | :212-219 |
| 3 | botón | `Cambiar` | Abre el modal de contraseña (dentro de `EmailConfirmedGate`) | Siempre; el gate lo oculta si el correo no está confirmado | :221-228 |
| 4 | diálogo | `Cambiar contraseña` | Modal **a mano** (`fixed inset-0`), no el `Dialog` del kit | Control 3 | :232-368 |
| 5 | estado | `Debes confirmar tu correo electrónico para cambiar la contraseña.` | Aviso dentro del modal | Correo sin confirmar | :238 |
| 6 | campo | `Contraseña actual` + botón ojo | Se valida con `signInWithPassword` | En el modal | :241-262 |
| 7 | campo | `Nueva contraseña` + botón ojo | Mínimo 8 caracteres | En el modal | :264-288 |
| 8 | texto | `La contraseña debe tener al menos 8 caracteres` | Ayuda | En el modal | :289 |
| 9 | estado | `Faltan {n} caracteres` | Contador de faltantes | Menos de 8 caracteres | :290-292 |
| 10 | campo | `Confirmar nueva contraseña` + botón ojo | Confirmación | En el modal | :295-319 |
| 11 | estado | `Las contraseñas no coinciden` / `Las contraseñas coinciden` | Validación inline (roja/verde) | Según coincidencia | :320-325 |
| 12 | estado | `{passwordError}` (`Contraseña actual incorrecta`, `Las contraseñas nuevas no coinciden`…) | Error del formulario | Error | :328-332, :43, :48, :62 |
| 13 | botón | `Cancelar` | Cierra y limpia | En el modal | :335-351 |
| 14 | botón | `Guardar cambios` / `Guardando...` | `auth.updateUser({ password })` | En el modal | :352-363 |
| 15 | texto | `Autenticación de dos factores (2FA)` + `Añada una capa adicional de seguridad a su cuenta` | Bloque 2 | Siempre | :374-383 |
| 16 | botón | `Desactivar` | `mfa.unenroll` — **sin confirmación** | Con factor MFA | :386-392 |
| 17 | botón | `Configurar` | `mfa.enroll({ factorType: 'totp' })` y abre el modal de QR | Sin factor MFA | :394-400 |
| 18 | estado | `La autenticación de dos factores está activada` | Aviso verde | Con factor MFA | :404-412 |
| 19 | estado | `La autenticación de dos factores no está configurada. Recomendamos activarla para mayor seguridad.` | Aviso amarillo | Sin factor MFA | :413-422 |
| 20 | texto | `Códigos de respaldo` + `Úselos para acceder a su cuenta si pierde acceso al dispositivo de autenticación` | Bloque 3 | Con factor MFA | :425-438 |
| 21 | botón | `Regenerar` | Genera 10 códigos y abre el modal | Con factor MFA | :439-446 |
| 22 | diálogo | `Códigos de respaldo` | Modal a mano con rejilla de 10 códigos monoespaciados | Control 21 | :453-479 |
| 23 | botón | `Cerrar` | Cierra el modal | En el modal | :470-475 |
| 24 | diálogo | `Configurar autenticación de dos factores` | Modal a mano con QR y código | Control 17 | :482-521 |
| 25 | texto | `Escanea el código QR con tu aplicación de autenticación (Google Authenticator, Authy, etc.)` | Instrucción | En el modal | :486-488 |
| 26 | estado | `QR Code Placeholder (Se generaría con datos reales de Supabase)` | **Recuadro gris, no hay QR** | En el modal | :490-498 |
| 27 | campo | `Ingresa el código de verificación` (`000000`) | Input **sin estado ni `onChange`** | En el modal | :500-503 |
| 28 | botón | `Cancelar` | Cierra el modal | En el modal | :506-511 |
| 29 | botón | `Verificar` | **Sin `onClick`: no hace nada** | En el modal | :512-517 |
| 30 | toast | `Contraseña actualizada correctamente` | Éxito | Control 14 | :74 |
| 31 | toast | `Autenticación de dos factores configurada correctamente` / `Error al configurar la autenticación de dos factores` | Resultado del alta | Control 17 | :119, :122 |
| 32 | toast | `Autenticación de dos factores desactivada correctamente` / `Error al desactivar la autenticación de dos factores` | Resultado de la baja | Control 16 | :151, :154 |
| 33 | toast | `Códigos de respaldo generados correctamente` / `No se encontró un factor MFA activo` | Resultado | Control 21 | :189, :175 |

Lee/escribe: `auth.mfa.enroll` / `unenroll` / `listFactors` (:97-99, :138, :171) ·
`auth.updateUser({ password })` (:68) · **`public.mfa_factors`** (:111-114, :143-146) —
tabla que **no existe** (§A.10.1).

### A.3 Sesiones y dispositivos — `components/profile/DeviceSessions.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Sesiones de dispositivos` + `Gestiona los dispositivos desde los cuales has iniciado sesión en tu cuenta` | Cabecera de la tarjeta | Siempre | :336-342 |
| 2 | estado | 3 filas de esqueleto a mano | Carga | `loading` | :346-366 |
| 3 | estado | `No hay sesiones activas` + `No se encontraron sesiones activas para tu cuenta` | Vacío (`Alert`, no `EmptyState`) | 0 dispositivos | :370-376 |
| 4 | badge | — (icono por tipo: portátil, móvil, tableta, monitor, globo) | Tipo de dispositivo; fondo verde si es de confianza | Por fila | :262-284, :390-391 |
| 5 | texto | `{device_name}` | Nombre del dispositivo | Por fila | :396 |
| 6 | badge | `Actual` | Dispositivo desde el que se navega (por huella digital) | Fila actual | :397-401 |
| 7 | badge | `Confiable` | Dispositivo marcado de confianza | Si `is_trusted` | :402-406 |
| 8 | texto | `{device_type} • {ubicación o IP o «Ubicación desconocida»}` | Contexto | Por fila | :409-411, :321-331 |
| 9 | texto | `Última actividad: {fecha}` | Relativa («Hoy, 14:32», «Ayer…», día de la semana) o completa | Por fila | :413-415, :287-318 |
| 10 | botón | `Renombrar` | Abre el diálogo de renombrado | Por fila | :420-431 |
| 11 | botón | `Confiar` / `Quitar confianza` | Alterna `is_trusted` | Por fila | :433-446 |
| 12 | botón | `Desconectar` | Abre la confirmación | Por fila, **salvo la actual** | :448-460 |
| 13 | paginación | `Mostrando {a} a {b} de {n} dispositivos` + `Anterior` + números + `Siguiente` | Paginación **propia**, 5 por página | Más de 5 dispositivos | :467-502 |
| 14 | estado | `Múltiples sesiones activas` + `Tienes {n} sesiones activas en distintos dispositivos. Por seguridad, considera desconectar los dispositivos que no estés utilizando.` | Aviso ámbar | Más de 1 dispositivo | :504-513 |
| 15 | botón | `Desconectar todos los otros dispositivos` | Desconecta todo salvo el actual — **sin confirmación** | Más de 1 dispositivo | :514-521 |
| 16 | diálogo | `Desconectar dispositivo` + `¿Estás seguro que deseas desconectar este dispositivo? Perderá acceso inmediatamente y deberá iniciar sesión nuevamente.` | Confirmación | Control 12 | :531-564 |
| 17 | botón | `Cancelar` | Cierra | En el diálogo | :541-547 |
| 18 | botón | `Desconectar dispositivo` / `Desconectando...` | `update is_active=false, revoked_at` | En el diálogo | :548-561 |
| 19 | diálogo | `Renombrar dispositivo` + `Asigna un nombre personalizado para identificar más fácilmente este dispositivo.` | Renombrado | Control 10 | :567-611 |
| 20 | campo | `Nombre del dispositivo` (`Ej: Mi laptop personal`) | Nuevo nombre | En el diálogo | :577-585 |
| 21 | botón | `Cancelar` / `Guardar` / `Guardando...` | Cierra o guarda | En el diálogo | :589-608 |
| 22 | toast | `Dispositivo desconectado` · `Dispositivo renombrado` · `Dispositivo confiable` / `Dispositivo estándar` · `Todos los otros dispositivos han sido desconectados` · `No se pudieron cargar las sesiones` | Resultados | Según acción | :171, :198, :224, :254, :119 |

Lee/escribe: `user_devices` (select :111-117; update `is_active`/`revoked_at` :161-164 y
:242-247; update `device_name` :188-190; update `is_trusted` :214-216). La huella digital del
dispositivo se calcula en el navegador con `userAgent`, idioma, profundidad de color,
resolución, `getTimezoneOffset` y disponibilidad de storages (:69-98).

### A.4 Organización por defecto — `components/profile/OrganizacionDefaultSection.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Organización predeterminada` + `Seleccione la organización con la que desea iniciar su sesión por defecto` | Cabecera | Siempre | :90-97 |
| 2 | chip | — (tarjeta de organización, toda clicable) | **Guarda al primer clic**, sin confirmar | Por organización | :105-113, :52-86 |
| 3 | texto | — (logo 40 px o icono `Building`) | Logo desde el bucket `organizations` | Por organización | :116-129, :34-50 |
| 4 | texto | `{org.name}` | Nombre | Por organización | :131-133 |
| 5 | texto | `{org.slug}` | Identificador — **siempre vacío** (§A.10.22) | Por organización | :134-136 |
| 6 | badge | — (`CheckCircle2` azul) | Marca la seleccionada | La activa | :140-142 |
| 7 | estado | `No pertenece a ninguna organización actualmente. Contacte con un administrador para unirse a una organización.` | Vacío | 0 organizaciones | :148-154 |
| 8 | toast | `Organización predeterminada actualizada correctamente` / `Error al actualizar la organización predeterminada` | Resultado | Control 2 | :79, :82 |

Escribe: `profiles.last_org_id` y `.updated_at` (:65-73).

### A.5 Preferencias de notificación — `components/profile/NotificacionesSection.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | Esqueleto a mano (título + 3 filas) | Carga | `initialLoading` | :127-150 |
| 2 | texto | `Preferencias de notificación` + `Configure cómo y cuándo desea recibir notificaciones de la plataforma` | Cabecera | Siempre | :154-161 |
| 3 | texto | `Canales de notificación` | Bloque 1 | Siempre | :166-169 |
| 4 | toggle | `Correo electrónico` + `Recibir notificaciones por correo electrónico` | `mute` del canal `email` (invertido) | Siempre | :173-181 |
| 5 | toggle | `Notificaciones push` + `Notificaciones en el navegador o aplicación` | `mute` del canal `push` | Siempre | :184-192 |
| 6 | toggle | `WhatsApp` + `Recibir notificaciones importantes por WhatsApp` | `mute` del canal `whatsapp` | Siempre | :195-203 |
| 7 | texto | `Modo No molestar` | Bloque 2 | Siempre | :209-212 |
| 8 | toggle | `Activar modo No molestar` + `Pausar notificaciones durante horarios específicos` | Muestra u oculta el horario | Siempre | :215-223 |
| 9 | campo | `Hora de inicio` (`time`, por defecto `22:00`) + texto en 12 h | Inicio del silencio | Con No molestar activo | :227-244 |
| 10 | campo | `Hora de fin` (`time`, por defecto `08:00`) + texto en 12 h | Fin del silencio | Con No molestar activo | :246-263 |
| 11 | botón | `Guardar preferencias` / `Guardando...` | Guarda `mute` de los 3 canales y el No molestar global | Siempre | :271-287 |
| 12 | toast | `Preferencias de notificación actualizadas correctamente` / `Error al guardar las preferencias de notificación` | Resultado | Control 11 | :89, :92 |

Lee/escribe: `user_notification_preferences` vía `PreferenciasService.ensureAllChannels`,
`.updatePreference` y `.setGlobalDND` (:34, :77-87).

### A.6 Roles asignados — `components/profile/RolesSection.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Roles asignados` + `Estos son los roles que tiene asignados en diferentes organizaciones y sucursales` | Cabecera | Siempre | :90-97 |
| 2 | texto | — (logo 32 px o icono) + `{organization.name}` + `{slug o id}` | Cabecera de cada organización | Por organización | :106-132 |
| 3 | botón | — (icono `ExternalLink`) | Enlace a `/org/{slug}` | Con slug | :133-140 |
| 4 | texto | `{role_name}` + descripción | Fila de rol con icono `UserCheck` verde | Por rol | :144-166 |
| 5 | badge | `{branch.name}` | Sucursal del rol — **nunca se pinta** (§A.10.19) | Si `role.branch` | :153-157 |
| 6 | estado | `No tiene roles asignados actualmente. Contacte con un administrador para solicitar roles en alguna organización.` | Vacío | 0 roles | :172-178 |
| 7 | texto | `Sucursales asignadas` + `Sucursales donde tienes acceso dentro de tus organizaciones` | Bloque 2 | Siempre | :182-190 |
| 8 | texto | `{branch.name}` + `Org. ID: {organization_id}` | Fila de sucursal | Por sucursal | :194-207 |
| 9 | badge | `Activa` / `Inactiva` | Estado de la sucursal (verde/gris) | Por sucursal | :208-210 |
| 10 | estado | `No tienes sucursales asignadas. Contacta al administrador de tu organización para que te asigne una.` | Vacío con icono | 0 sucursales | :214-219 |
| 11 | botón | `Gestionar sucursales` | Enlace a `/app/organizacion/sucursales` | Vacío **y** rol con «admin»/«super» en el nombre | :220-228 |

No escribe nada. **No muestra el cargo** (`organization_members.job_position_id` →
`job_positions.name`), que sí existe en la BD.

### A.7 Panel de Vendedor — `app/app/perfil/page.tsx:468-621`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Panel de Vendedor` + `Vende con nosotros y genera comisiones por cada referencia.` | Cabecera | Siempre | page.tsx:470-473 |
| 2 | estado | `Ya eres vendedor` + `Tu cuenta está vinculada al panel de vendedores. Accede para ver tus comisiones, pagos y referidos.` | Aviso verde | Si existe fila en `sellers` | page.tsx:475-487 |
| 3 | botón | `Abrir Panel de Vendedor` | Refresca la sesión y abre `sellers.goadmin.io/auth/bridge` en otra pestaña | Si es vendedor | page.tsx:488-514 |
| 4 | estado | `Conviértete en vendedor` + `Activa tu cuenta de vendedor y empieza a generar comisiones por cada cliente que refieras. Usarás las mismas credenciales, mismo correo y mismo avatar que en el ERP.` | Aviso azul | Si no es vendedor | page.tsx:581-593 |
| 5 | estado | `{error}` | Error inline | Falla la activación | page.tsx:594-596 |
| 6 | botón | `Activar cuenta de vendedor` / `Activando...` | `POST /api/become-seller` | Si no es vendedor | page.tsx:597-616 |
| 7 | toast | `¡Ya eres vendedor! Tu cuenta ha sido vinculada.` / `Error al convertirse en vendedor` | Resultado | Control 6 | page.tsx:568, :575 |

### A.8 Eliminar cuenta — `components/profile/EliminarCuentaSection.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `Eliminar cuenta` + `Una vez eliminada su cuenta, todos sus datos personales serán eliminados permanentemente` | Cabecera | Siempre | :136-143 |
| 2 | estado | `Zona de peligro` + lista de 4 consecuencias | Bloque rojo | Siempre | :145-164 |
| 3 | botón | `Eliminar mi cuenta` | Abre el `AlertDialog` | Siempre | :167-174 |
| 4 | diálogo | `Confirmar eliminación de cuenta` + `Esta acción es irreversible. Para confirmar debe ingresar su contraseña, escribir el nombre de su perfil, el nombre de su organización y la palabra ELIMINAR.` | Confirmación de cuatro llaves | Control 3 | :175-264 |
| 5 | campo | `Contraseña` | Se valida con `signInWithPassword` | En el diálogo | :187-198 |
| 6 | campo | `Escriba el nombre de su perfil: {nombre}` | Debe coincidir exacto | En el diálogo | :200-211 |
| 7 | campo | `Escriba el nombre de su organización: {organización}` | Debe coincidir exacto | Si hay organización | :213-226 |
| 8 | campo | `Escriba "ELIMINAR" para confirmar` | Literal `ELIMINAR` | En el diálogo | :228-239 |
| 9 | estado | `{error}` (`Contraseña incorrecta`, `Debe escribir "X" exactamente…`) | Error inline | Error | :241-243, :72-88, :102 |
| 10 | botón | `Cancelar` | Cierra y limpia | En el diálogo | :247 |
| 11 | botón | `Eliminar permanentemente` / `Procesando...` | Marca `profiles.status='pending_deletion'` y cierra sesión | En el diálogo (deshabilitado hasta que las 4 llaves cuadren) | :248-262 |
| 12 | toast | `Su solicitud de eliminación de cuenta ha sido registrada. Su cuenta será eliminada en los próximos días.` | Éxito | Control 11 | :124 |

### A.9 Bloque de sesión del header — `components/app-layout/Header/AppHeader.tsx` y `components/app-layout/ProfileDropdownMenu.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | — (icono `Menu`, azul sólido) | Abre la barra lateral | `< lg` | AppHeader.tsx:40-47 |
| 2 | menú | — (`BranchSelectorWrapper`) | Selector de sucursal | `< lg` a la izquierda, `≥ lg` a la derecha | AppHeader.tsx:49-51, 64-67 |
| 3 | campo | — (`GlobalSearch`) | Buscador global | Centro en escritorio, barra completa bajo la cabecera en móvil | AppHeader.tsx:55-61, 109-113 |
| 4 | botón | — (icono `Bot`) | Abre el panel de GO Assistant | Siempre | AppHeader.tsx:69-80 |
| 5 | botón | — (icono `Moon` / `Sun`) | **Cambia el tema** | Siempre | AppHeader.tsx:83-94 |
| 6 | menú | — (`NotificationsMenu`) | Campana de notificaciones | Siempre | AppHeader.tsx:97 |
| 7 | estado | — (`TrialBanner`, `EmailVerificationBanner`) | Franjas bajo la cabecera | Según plan y verificación | AppHeader.tsx:114-115 |
| 8 | menú | — (avatar 32 px + nombre + rol + chevron) | Disparador del menú de cuenta | `≥ lg` | ProfileDropdownMenu.tsx:459-481 |
| 9 | texto | `{userData.name}` · `{userData.role}` · `{userData.email}` | Cabecera del menú | Al abrir | ProfileDropdownMenu.tsx:505-513 |
| 10 | botón | `Correo sin confirmar · Reenviar` / `Enviando...` / `{n}s` | Reenvía el correo de confirmación, con contador de 60 s | Correo sin confirmar | ProfileDropdownMenu.tsx:514-527, :55-86 |
| 11 | menú | `Facturación` (`nav.billing`) | Enlace a `/app/plan`, en azul sólido | Al abrir | ProfileDropdownMenu.tsx:532-537 |
| 12 | menú | `Ver perfil` (`nav.viewProfile`) | Enlace a `/app/perfil` | Al abrir | ProfileDropdownMenu.tsx:543-548 |
| 13 | menú | `Configuración` (`nav.settings`) | Enlace a `/app/configuracion` | Al abrir, escritorio | ProfileDropdownMenu.tsx:550-555 |
| 14 | menú | `Notificaciones` (`nav.notifications`) | Enlace a `/app/notificaciones` | Al abrir | ProfileDropdownMenu.tsx:557-562 |
| 15 | menú | `Cerrar sesión` / `Cerrando sesión...` | `handleSignOut` | Al abrir | ProfileDropdownMenu.tsx:568-575 |
| 16 | diálogo | `Mi cuenta` (`nav.myAccount`) | Hoja inferior a pantalla completa (portal, `z-index` 9999) | `< lg` | ProfileDropdownMenu.tsx:114-287 |
| 17 | texto | — (avatar 64 px, nombre, rol, correo) | Cabecera de la hoja | `< lg` | ProfileDropdownMenu.tsx:163-209 |
| 18 | badge | `{planName}` con icono `CreditCard` | Plan de la suscripción activa | Si hay suscripción `active`/`trialing` | ProfileDropdownMenu.tsx:202-207, :89-111 |
| 19 | botón | `Facturación` | Enlace a `/app/plan`, 56 px | `< lg` | ProfileDropdownMenu.tsx:214-224 |
| 20 | botón | `Ver perfil` | Enlace a `/app/perfil` | `< lg` | ProfileDropdownMenu.tsx:229-239 |
| 21 | botón | `Configuración` | Enlace a **`/app/organizacion/informacion`** (distinto del escritorio) | `< lg` | ProfileDropdownMenu.tsx:241-251 |
| 22 | botón | `Notificaciones` | Enlace a `/app/notificaciones` | `< lg` | ProfileDropdownMenu.tsx:253-263 |
| 23 | botón | `Cerrar sesión` | Rojo, 56 px | `< lg` | ProfileDropdownMenu.tsx:266-278 |
| 24 | tooltip | — (nombre, rol, correo, plan) | Ficha flotante del usuario | Barra lateral contraída, al pasar el puntero | ProfileDropdownMenu.tsx:384-402 |

**Qué se duplica y qué debería vivir en cada sitio**

| Dato o acción | Header | Perfil | Dónde debería estar |
|---|---|---|---|
| Avatar, nombre, correo | Sí (505-513) | Sí (page.tsx:360-380) | Identidad resumida en el header; edición y detalle en el perfil. Es la única duplicación sana. |
| Rol | Sí (508-510) | Solo dentro de «Roles asignados» | En la **cabecera del perfil**, junto al nombre |
| Cargo (`job_positions`) | No | No | En la cabecera del perfil (**Nuevo**) |
| Organización activa | En el `OrgSwitcher` | No aparece | En la cabecera del perfil, como contexto de solo lectura |
| Sucursales del usuario | No | Enterradas en «Roles asignados» (:192-212) | En la **cabecera del perfil**, como `BranchBadge` |
| Plan de suscripción | Sí (202-207, 376-378) | No | Se queda en el header: es de la organización, no del usuario |
| `Correo sin confirmar · Reenviar` | Sí (514-527) | No | **También en el perfil**, junto al campo de correo |
| Tema (claro/oscuro) | Sí (AppHeader.tsx:83-94) | No | **Al perfil** (decisión de fidelidad: «AppHeader sin perfil ni tema») |
| Idioma | No | Sí (:453-470) | Se queda en el perfil |
| Zona horaria | No | No | **Al perfil** (**Nuevo**): hoy sale solo de `getOrganizationTimezone(orgId)` |
| `Cerrar sesión` | Sí (568-575) | No | En ambos: el perfil debe poder cerrar esta sesión y las demás |
| `Facturación`, `Configuración`, `Notificaciones` | Sí | No | Se quedan en el header (son de la organización) |

### A.10 Lo roto o sin efecto — Perfil

1. **2FA no funciona.** `SeguridadSection.tsx:111-114` y `:143-146` consultan
   `supabase.from('mfa_factors')`. Esa tabla **no existe en `public`** (verificado por MCP:
   solo hay `auth.mfa_factors`, inaccesible desde PostgREST). Activar y desactivar 2FA
   terminan siempre en `Error al configurar…` / `Error al desactivar…` aunque la llamada de
   Auth haya funcionado, y la lista de factores nunca se refresca.
2. `SeguridadSection.tsx:490-498` — el QR es un recuadro gris con el texto
   `QR Code Placeholder (Se generaría con datos reales de Supabase)`. **No se calca.**
3. `SeguridadSection.tsx:512-517` — el botón `Verificar` del modal de MFA **no tiene `onClick`**.
4. `SeguridadSection.tsx:179-187` — los `Códigos de respaldo` son diez cadenas de
   `Math.random().toString(36)`; el comentario del propio código dice que «en un entorno real
   deberían guardarse en la base de datos». No se guardan en ningún sitio: al cerrar el modal
   se pierden y no sirven para entrar.
5. `SeguridadSection.tsx:386-392` — `Desactivar` 2FA se ejecuta sin `ConfirmDialog`.
6. `SeguridadSection.tsx:232`, `:453`, `:482` — tres modales dibujados a mano
   (`fixed inset-0 bg-black/50`) en lugar del `Dialog` del kit: sin cierre con `Esc`, sin
   trampa de foco, sin `role="dialog"`, sin `aria-labelledby`.
7. `SeguridadSection.tsx:56-59` y `EliminarCuentaSection.tsx:96-99` — la contraseña actual se
   verifica con `signInWithPassword`, que **rota la sesión** y, según la memoria del proyecto,
   invalida el refresh token compartido con el Desktop.
8. **Eliminar cuenta nunca se registra.** `EliminarCuentaSection.tsx:109-116` escribe
   `deletion_requested_at`, columna que **no existe** en `profiles` (verificado por MCP).
   PostgREST devuelve error, el `catch` lo convierte en
   `Ha ocurrido un error al procesar su solicitud. Por favor, intente nuevamente.` (:128) y la
   cuenta sigue activa. El usuario ya ha escrito su contraseña, su nombre, el de la
   organización y la palabra `ELIMINAR` para nada.
9. **El idioma guardado no se lee.** `page.tsx:32` declara `lang` y
   `DatosPersonalesSection.tsx:65` hace `profile?.lang`, pero la columna real es
   `preferred_language` (verificado por MCP) y es la que se escribe (:197). El selector
   `Idioma preferido` arranca siempre en `Español`, aunque el usuario tenga `en` guardado.
10. **`full_name` no existe.** `page.tsx:27`, `:371`, `:378`, `:464` y `:555` leen
    `profile.full_name`; la columna no está en `profiles` (verificado por MCP). Siempre cae al
    `first_name + last_name`, con un espacio sobrante cuando falta el apellido (`:378`).
11. `DatosPersonalesSection.tsx:186-188` — `Nombre completo` se parte por el **primer** espacio:
    «Juan Carlos Pérez» guarda `first_name='Juan'`, `last_name='Carlos Pérez'`.
12. `DatosPersonalesSection.tsx:381-391` — `Eliminar` borra el avatar del storage **y** de
    `profiles` en el acto, sin confirmación; después, `Cancelar` (:475-482) no lo recupera.
13. `DatosPersonalesSection.tsx:366` — el `accept` del selector es
    `"image/png, image/jpeg"`, pero la validación admite además `webp` (:109, :141). Un `.webp`
    no se puede ni elegir.
14. `DatosPersonalesSection.tsx:350-355` — el overlay de «tocar la foto para cambiarla» es
    **hover-only** (`opacity-0 hover:opacity-100`) y además solo existe cuando **no** hay
    avatar. En táctil no existe.
15. `DatosPersonalesSection.tsx:429-436` — el botón `Cambiar` del correo está activo también en
    modo lectura, mientras el resto de campos están deshabilitados: dos modos a la vez.
16. `DeviceSessions.tsx:287-318` — las fechas se formatean con `toLocaleDateString` /
    `toLocaleTimeString` del navegador: **no pasan por el timezone de la organización**
    (regla 3 de `docs/reglas-fechas-timezone.md`). En esta pantalla no se usa `useFormatDate()`.
17. `DeviceSessions.tsx:467-502` — paginación dibujada a mano (5 por página, todos los números
    sin elipsis), distinta de la del kit y distinta de `SessionsPagination` de cajas.
18. `DeviceSessions.tsx:514-521` — `Desconectar todos los otros dispositivos` se ejecuta sin
    confirmación, siendo la acción más destructiva de la sección.
19. `DeviceSessions.tsx:161-164` y `:242-247` — desconectar solo pone `is_active=false` en
    `user_devices`; **no revoca la sesión de Supabase Auth**. El dispositivo desconectado sigue
    autenticado hasta que caduque su token.
20. `RolesSection.tsx:48-52` — `isAdmin` se deduce de que el **nombre** del rol contenga
    «admin» o «super». Viola la regla 6 del proyecto (permisos nunca por nombre de rol).
21. `RolesSection.tsx:153-157` — el badge de sucursal por rol **nunca se pinta**, porque
    `page.tsx:185-186` fija `branch_id: null` y `branch: null` al mapear.
22. `RolesSection.tsx:205` — `Org. ID: {organization_id}` muestra el identificador crudo de la
    organización en la interfaz del usuario final.
23. `OrganizacionDefaultSection.tsx:107` — la organización por defecto se guarda **al primer
    clic** sobre la tarjeta, sin confirmación ni botón de guardar.
24. `OrganizacionDefaultSection.tsx:135` y `RolesSection.tsx:130` — pintan `org.slug`, que llega
    `undefined` porque `page.tsx:239-242` solo mapea `id` y `name`. Se ve el hueco (o el id).
25. `page.tsx:124-149` — consulta completa a `user_devices`, mapeo a `UserSession[]` y
    `setUserSessions`… **que nunca se renderiza**: la sección de sesiones monta
    `DeviceSessions`, que vuelve a consultar lo mismo (`DeviceSessions.tsx:111-117`). Consulta
    duplicada y muerta.
26. `page.tsx:244` — `console.log(orgsData)` en producción.
27. `page.tsx:489-508` — el enlace al panel de vendedor construye
    `?at={access_token}&rt={refresh_token}&dest=/dashboard`: **credenciales en la barra de
    direcciones**, en el historial y en los logs del servidor de destino.
28. `ProfileDropdownMenu.tsx:551` vs `:241-251` — el ítem `Configuración` lleva a
    `/app/configuracion` en escritorio y a `/app/organizacion/informacion` en móvil.
29. `SeguridadSection.tsx:5` — `updatePassword` se importa y no se usa.
30. `components/profile/SesionesSection.tsx` (279 líneas) está **huérfano**: nadie lo importa
    (la única referencia es un comentario en `page.tsx:134`). El mapeo de `page.tsx:135-146` se
    hace para alimentarlo.
31. `page.tsx:307-317` — la sección `panel-vendedor` está en la lista de navegación pero no
    tiene su propio componente: se resuelve con un bloque inline de 58 líneas (`:468-526`).
32. No hay ninguna confirmación de «tienes cambios sin guardar» al cambiar de sección con el
    formulario de datos personales en edición (`page.tsx:297-301`).

### A.11 Campos de la BD que existen y el perfil no expone

Verificado por MCP (`information_schema.columns`, esquema `public`):

| Tabla | Columna | Qué es | Estado hoy |
|---|---|---|---|
| `profiles` | `department` | Departamento del usuario | No se lee ni se escribe |
| `profiles` | `metadata` (jsonb) | Metadatos libres | No se expone |
| `profiles` | `auth_provider` | `email`, `google`… | No se muestra (útil: explica por qué no hay contraseña que cambiar) |
| `profiles` | `status` | `active` / `pending_deletion` | Solo se escribe al eliminar; nunca se muestra |
| `profiles` | `created_at` | Alta de la cuenta | Declarado en la interfaz (`page.tsx:34`) y nunca pintado |
| `organization_members` | `job_position_id` → `job_positions.name` | **Cargo** | No se lee: el perfil muestra el rol, no el cargo |
| `organization_members` | `is_super_admin` | Superadmin de la organización | Solo se usa en cajas, no en el perfil |
| `organization_members` | `is_temporary` | Miembro temporal | No se expone |
| `user_devices` | `browser`, `browser_version`, `os`, `os_version` | Navegador y sistema del dispositivo | No se muestran: la fila solo dice `{device_type}` |
| `user_devices` | `session_id` | Sesión de Auth asociada | No se usa (por eso desconectar no revoca nada, §A.10.19) |
| `user_devices` | `first_seen_at`, `revoked_at` | Primera vez visto / revocado | `first_seen_at` se mapea a `created_at` y no se pinta |
| `user_notification_preferences` | `allowed_types` (text[]) | Tipos de notificación permitidos por canal | No se expone: solo se puede silenciar el canal entero |
| `cash_counts` | `verified_by` | Quién verificó el arqueo | Ni en perfil ni en cajas (§B.12.8) |

Y lo que **no existe** y el código da por hecho: `profiles.full_name`, `profiles.lang`,
`profiles.deletion_requested_at`, `public.mfa_factors`.

---

## B. Cajas del POS

Cuatro rutas: `/app/pos/cajas`, `/app/pos/cajas/[id]`, `/app/pos/cajas/[id]/arqueos/nuevo` y
`/app/pos/cajas/[id]/movimientos/nuevo`. El listado ya está resumido en §D.4 de
`AUDITORIA-CONTROLES-PRODUCTOS-POS.md` y los diálogos de apertura, arqueo y cierre en §B.1a-b;
aquí se profundiza y **no se repite** lo que allí está.

### B.1 Listado `/app/pos/cajas` — `app/app/pos/cajas/page.tsx` (587 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(4)` | Carga inicial | `orgLoading \|\| branchLoading \|\| (isLoading && sin sesiones)` | :237-245 |
| 2 | texto | `Cajas POS` + icono `Wallet` en cuadro azul | Título (no usa `PageHeader` del kit) | Siempre | :252-256 |
| 3 | texto | `{organization.name}` o `Organización` | Subtítulo | Siempre | :257-259 |
| 4 | texto | `{dd/mm/aaaa hh:mm}` con icono `Clock` | Marca de la última recarga | Siempre | :264-270, :225-233 |
| 5 | badge | `🟢 Mi Caja Abierta` / `🔴 Sin Caja` | Estado de la caja propia, con emoji | Siempre | :272-281 |
| 6 | texto | `{n} abierta` / `{n} abiertas` con icono `Store` | Cajas abiertas en toda la organización | Si `> 0` | :282-287 |
| 7 | botón | — (icono `RefreshCw`, gira mientras refresca) | Recarga sesión activa + sesiones abiertas | Siempre | :291-293 |
| 8 | badge | — (`BranchBadge` del inventario) | Sucursal activa o «Todas» | Siempre | :297 |
| 9 | estado | `{error}` | Alerta roja de error de carga | Error | :300-305 |
| 10 | pestaña | `Mi Caja` | Caja del usuario | Siempre | :310-313 |
| 11 | pestaña | `Cajas Abiertas` + badge con el conteo | Todas las cajas abiertas | Siempre | :314-322 |
| 12 | pestaña | `Historial` | Sesiones pasadas | Siempre | :323-326 |
| 13 | estado | `No tienes caja abierta` + `Abre una caja para comenzar a registrar ventas y movimientos.` | Vacío con acción | Sin sesión activa | :331-348 |
| 14 | botón | `Abrir Caja` (`AperturaCajaDialog`) | Abre el diálogo de apertura | Sin sesión, o con sesión cerrada | :344, :387 |
| 15 | botón | `Registrar Movimiento` (`MovimientosDialog`) | Abre el diálogo de movimiento | Con sesión activa | :354-357 |
| 16 | botón | `Cerrar Caja` (`CierreCajaDialog`) | Abre el arqueo y cierre | Sesión abierta **y** (admin o quien la abrió) | :378-383 |
| 17 | botón | `Cerrar Caja` **deshabilitado** con icono `Lock` + tooltip `Solo el cajero que abrió la caja o un administrador puede cerrarla` | Bloqueo visual | Sesión abierta de otro cajero | :362-376 |
| 18 | texto | `Solo {cajero} o un administrador pueden cerrar esta caja.` | Explicación gris bajo el botón | ídem | :372-374 |
| 19 | stat | `CashSummaryCard` | Resumen de la caja (§B.5) | Con sesión activa | :394 |
| 20 | botón | `ReportGenerator` | Tarjeta de reportes (§B.11) | Con sesión activa | :395 |
| 21 | tabla | `MovimientosList` | Lista de ingresos y egresos con totales | Con sesión activa | :398 |
| 22 | estado | `No hay cajas abiertas en esta sucursal` | Vacío de la pestaña 2 — **texto engañoso** (§B.12.24) | 0 cajas abiertas | :407-417 |
| 23 | texto | `{cajero}` + badge `Abierta` | Cabecera de la tarjeta de caja abierta | Por caja | :424-430 |
| 24 | texto | `Caja #` · `Sucursal` · `Apertura` · `Monto inicial` | Cuatro filas de datos | Por caja | :434-449 |
| 25 | botón | `Ver detalle` | Enlace a `/app/pos/cajas/{uuid}` | Por caja, **si `showExpected`** | :451-457 |
| 26 | botón | `Ver detalle` **deshabilitado** con icono `Lock` + tooltip `Cierre ciego activo: no puedes ver el detalle de esta caja` | Bloqueo | Por caja, en cierre ciego | :458-463 |
| 27 | texto | `Historial de Sesiones` | Título de la pestaña 3 | Siempre | :475-478 |
| 28 | estado | `TableSkeleton(5×8)` | Carga del historial | `historyLoading` | :482 |
| 29 | estado | `No hay sesiones registradas` | Vacío (texto suelto, no `EmptyState`) | 0 sesiones | :483-486 |
| 30 | tabla | `ID` · `Sucursal` · `Cajero` · `Apertura` · `Cierre` · `Estado` · `Inicial` · `Final` · `Diferencia` · (acciones) | Historial paginado | Con sesiones | :490-564 |
| 31 | badge | `Abierta` / `Cerrada` | Estado de la fila | Por fila | :519-527 |
| 32 | texto | `***` | Enmascarado de `Final` y `Diferencia` | En cierre ciego | :529-547 |
| 33 | botón | — (icono `Eye`) / — (icono `Lock`, deshabilitado) | Ver detalle de la fila | Por fila, según cierre ciego | :548-560 |
| 34 | paginación | `Mostrar {10\|20\|50\|100} por página` + `Mostrando {a} a {b} de {n} sesiones` + `«` `‹` números `›` `»` | `SessionsPagination`, **propia del módulo** | Con sesiones | :568-578 |
| 35 | toast | `Caja abierta exitosamente` + `Monto inicial: {x}` | Éxito de apertura | Tras abrir | :196-198 |
| 36 | toast | `Caja cerrada exitosamente` + `Diferencia: {x}` o `Caja cerrada` | Éxito de cierre (la descripción depende del cierre ciego) | Tras cerrar | :209-211 |

**Lo que no hay:** ni buscador, ni botón de filtros, ni filtro por fecha, por cajero o por
estado, aunque `CajasService.getSessionHistoryPaginated` acepta `{ status, branchId }`
(CajasService.ts:359-362) y `CashSessionFilter` declara además `date_from` y `date_to`
(types.ts:173-178). La página siempre llama con `{ status: 'all' }` (:173).

### B.2 Detalle `/app/pos/cajas/[id]` — `components/pos/cajas/detalle/CajaDetallePage.tsx` (701 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `UUID de sesión inválido` | Texto rojo suelto (no `EmptyState`) | El segmento de ruta no es un UUID | `[id]/page.tsx`:15-23 |
| 2 | estado | `PageHeaderSkeleton` + `StatsSkeleton(4)` + `CardListSkeleton(4)` | Carga | `orgLoading \|\| isLoading` | :127-135 |
| 3 | estado | `Sesión no encontrada` + `La sesión de caja solicitada no existe.` + `Volver a Cajas` | Vacío con acción | Sin sesión | :137-155 |
| 4 | botón | — (flecha atrás) | Vuelve a `/app/pos/cajas` | Siempre | :162-166 |
| 5 | texto | `Sesión #{id}` | Título | Siempre | :169 |
| 6 | badge | `Abierta` / `Cerrada` | Estado de la sesión | Siempre | :170-176 |
| 7 | texto | `Abierta: {fecha} \| Cerrada: {fecha}` | Fechas en el timezone de la organización (`useFormatDate`) | Siempre | :178-181, :57 |
| 8 | botón | `Actualizar` | Recarga detalle, ventas y pagos | Siempre | :186-189 |
| 9 | botón | `Arqueo` | Enlace a `…/arqueos/nuevo` | Sesión abierta | :192-197 |
| 10 | botón | `Movimiento` | Enlace a `…/movimientos/nuevo` | Sesión abierta | :198-203 |
| 11 | botón | `Cerrar Caja` | Abre el `CierreCajaDialog` — **sin comprobar permiso** | Sesión abierta | :204-207 |
| 12 | stat | `Monto Inicial` | KPI azul | Siempre | :215-229 |
| 13 | stat | `Ventas Efectivo` | KPI verde | Siempre | :231-245 |
| 14 | stat | `Monto Esperado` | KPI morado | Si `showExpected` | :247-262 |
| 15 | estado | `Cierre Ciego` + `No visible para cajeros` | Sustituye al KPI 14 | En cierre ciego | :263-273 |
| 16 | stat | `Diferencia` | KPI verde o rojo con icono | Si `showExpected` | :275-303 |
| 17 | estado | `Diferencia` + `Visible solo para administradores` | Sustituye al KPI 16 | En cierre ciego | :304-314 |
| 18 | pestaña | `Resumen` · `Movimientos ({n})` · `Arqueos ({n})` · `Ventas ({n})` | Cuatro pestañas con conteo | Siempre | :319-324 |
| 19 | texto | `Información de la Sesión`: `Cajero` · `Sucursal` · `Apertura` · `Cierre` · `Notas` | Ficha de la sesión | Resumen | :330-360 |
| 20 | texto | `Desglose de Caja`: `Monto Inicial`, `+ Ventas en {método}` (una fila por método), `+ Ingresos`, `- Egresos`, `- Vuelto Entregado`, `- Devoluciones`, `Consumos de Habitaciones`, `Recibos de Caja (Abonos CxC)`, `Pagos a Proveedores (CxP)`, `= Monto Esperado` | La cascada completa del cálculo | Resumen (cada fila, si su importe `> 0`) | :363-443 |
| 21 | estado | `Cierre ciego: monto esperado no visible` | Sustituye a `= Monto Esperado` | En cierre ciego | :438-443 |
| 22 | texto | `Monto Contado` + `Diferencia` | Cierre del desglose | Sesión cerrada y `showExpected` | :444-460 |
| 23 | texto | `Pagos por Método` + `Total` | Una fila por método con icono coloreado | Resumen | :465-507 |
| 24 | estado | `No hay pagos registrados` | Vacío del bloque anterior | Sin pagos (**y siempre con caja global**, §B.12.4) | :470-471 |
| 25 | botón | `Nuevo Movimiento` | Enlace a `…/movimientos/nuevo` | Pestaña Movimientos, sesión abierta | :516-523 |
| 26 | tabla | `Fecha` · `Tipo` · `Concepto` · `Notas` · `Monto` | Movimientos, con badge `Ingreso`/`Egreso` | Pestaña Movimientos | :529-563 |
| 27 | estado | `No hay movimientos registrados` | Vacío | 0 movimientos | :526-527 |
| 28 | botón | `Nuevo Arqueo` | Enlace a `…/arqueos/nuevo` | Pestaña Arqueos, sesión abierta | :574-581 |
| 29 | tabla | `Fecha` · `Tipo` · `Contado` · `Esperado` · `Diferencia` · `Notas` | Arqueos; `Esperado` y `Diferencia` desaparecen en cierre ciego | Pestaña Arqueos | :587-623 |
| 30 | badge | `Apertura` (azul) / `Parcial` (amarillo) / `Cierre` (verde) | Tipo de arqueo | Por fila | :114-125 |
| 31 | estado | `No hay arqueos registrados` | Vacío | 0 arqueos | :584-585 |
| 32 | tabla | `Fecha` · `ID` · `Estado` · `Pago` · `Total` · (recibo) | Ventas del turno | Pestaña Ventas | :639-683 |
| 33 | badge | `Completada` / `{status}` · `Pagado` / `{payment_status}` | Estado de la venta y del pago | Por fila | :655-668 |
| 34 | botón | — (icono `Receipt`) | Enlace a `/app/pos/ventas/{id}` | Por fila | :672-678 |
| 35 | estado | `No hay ventas en este turno` | Vacío | 0 ventas | :636-637 |
| 36 | diálogo | `CierreCajaDialog` controlado | Arqueo y cierre | Sesión abierta | :691-698 |
| 37 | toast | `Error al cargar datos de la sesión` · `Caja cerrada exitosamente` | Resultados | Según acción | :92, :102 |

**Lo que no hay:** ninguna de las tres tablas pagina (movimientos, arqueos y ventas se pintan
enteras) y **no hay botón de reporte** en el detalle, que es justo donde se consulta una caja
ya cerrada (el `ReportGenerator` solo vive en la pestaña «Mi Caja» del listado, §B.1 #20).

### B.3 Nuevo arqueo `/app/pos/cajas/[id]/arqueos/nuevo` — `components/pos/cajas/arqueos/NuevoArqueoPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `DetailSkeleton` | Carga | `orgLoading \|\| isLoading` | :196-203 |
| 2 | estado | `Sesión no encontrada` / `Sesión cerrada` + `No se pueden registrar arqueos en una sesión cerrada.` + `Volver a Cajas` | Vacío con acción | Sin sesión o cerrada | :205-232 |
| 3 | botón | — (flecha atrás) | Vuelve al detalle | Siempre | :259-263 |
| 4 | texto | `Nuevo Arqueo` + `Sesión #{id} - Registrar conteo de caja` | Cabecera | Siempre | :264-277 |
| 5 | badge | `Cierre Ciego` con icono `EyeOff` | Aviso del modo | `isBlindMode && !isOrgAdmin` | :267-272 |
| 6 | campo | `Tipo de Arqueo`: `Apertura` · `Parcial` · `Cierre` | Select (por defecto `Parcial`) | Siempre | :290-299 |
| 7 | texto | `Efectivo - Billetes` | Bloque de billetes | Siempre | :306-309 |
| 8 | botón | `Limpiar` | Vacía billetes, monedas **y métodos** (la etiqueta está solo en billetes) | Siempre | :310-312, :190-194 |
| 9 | campo | 7 cantidades: `$100.000` · `$50.000` · `$20.000` · `$10.000` · `$5.000` · `$2.000` · `$1.000` | Conteo por denominación, con subtotal `= {x}` bajo cada una | Siempre | :316-337, :49 |
| 10 | campo | 5 cantidades: `$1.000` · `$500` · `$200` · `$100` · `$50` | Monedas, con subtotal | Siempre | :349-370, :50 |
| 11 | texto | `Total Efectivo` | Suma de billetes y monedas | Si `> 0` | :372-377 |
| 12 | texto | `Otros Métodos de Pago` + `Registra el monto recibido en cada método de pago` | Bloque de métodos | Si hay métodos activos distintos de efectivo | :382-389 |
| 13 | campo | `{nombre del método}` + `Esperado: {x}` | Un importe por método activo de la organización | Por método; el «Esperado» solo si `showExpected` | :391-418 |
| 14 | texto | `Total Otros Métodos` | Suma de los métodos | Si `> 0` | :419-424 |
| 15 | campo | `Notas` (`Observaciones del arqueo...`) | `RichTextEditor` | Siempre | :430-442 |
| 16 | texto | `Resumen`: `Monto Esperado` · `Efectivo Contado` · `Otros Métodos` · `Total Contado` | Panel lateral pegajoso | Siempre (`Monto Esperado` solo si `showExpected`) | :447-477 |
| 17 | texto | `Diferencia` + `Sobrante de {x}` / `Faltante de {x}` | Resultado con icono verde o rojo | Si `showExpected` y `≠ 0` | :479-513 |
| 18 | estado | `Cierre ciego activo. Los montos esperados y diferencias son visibles solo para administradores.` | Aviso morado | En cierre ciego | :517-524 |
| 19 | botón | `Guardar Arqueo` / `Guardando...` | Inserta en `cash_counts` y vuelve al detalle | Siempre (deshabilitado si el total contado es 0) | :527-543 |
| 20 | toast | `Arqueo registrado exitosamente` + `Diferencia: {x}` o `Arqueo registrado` / `Error al registrar arqueo` | Resultado | Control 19 | :175-177, :182-184 |

### B.4 Nuevo movimiento `/app/pos/cajas/[id]/movimientos/nuevo` — `components/pos/cajas/movimientos/NuevoMovimientoPage.tsx`

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `DetailSkeleton` | Carga | `orgLoading \|\| isLoading` | :83-90 |
| 2 | estado | `Sesión no encontrada` / `Sesión cerrada` + `No se pueden registrar movimientos en una sesión cerrada.` + `Volver a Cajas` | Vacío con acción | Sin sesión o cerrada | :92-107 |
| 3 | botón | — (flecha atrás) | Vuelve al detalle | Siempre | :113 |
| 4 | texto | `Nuevo Movimiento` + `Sesión #{id} - Registrar ingreso o egreso` | Cabecera | Siempre | :114-117 |
| 5 | toggle | `Ingreso` / `Egreso` | Radio en dos tarjetas grandes con icono | Siempre | :124-139 |
| 6 | campo | `Concepto` (`Seleccionar concepto`) | Select: ingresos → `Cambio de efectivo`, `Depósito bancario`, `Préstamo interno`, `Fondo adicional`, `Otro ingreso`; egresos → `Compra de insumos`, `Pago a proveedor`, `Retiro para depósito`, `Gasto operativo`, `Devolución cliente`, `Otro egreso`; más `Otro (especificar)` | Siempre | :146-155, :25-26 |
| 7 | campo | `Especificar concepto` (`Ingrese el concepto...`) | Concepto libre | Con `Otro (especificar)` | :156-161 |
| 8 | campo | `Monto` con prefijo `$` **cableado** | Importe, paso 100 | Siempre | :162-169 |
| 9 | texto | `+{x}` / `-{x}` | Vista previa con el signo y color del tipo | Con importe `> 0` | :168 |
| 10 | campo | `Notas (opcional)` (`Observaciones adicionales...`) | `RichTextEditor` | Siempre | :170-173 |
| 11 | botón | `Cancelar` | Vuelve al detalle | Siempre | :178 |
| 12 | botón | `Guardar Movimiento` / `Guardando...` | Inserta en `cash_movements` y vuelve al detalle | Siempre (deshabilitado sin concepto o sin importe) | :179-181 |
| 13 | toast | `Por favor ingrese un concepto` · `Por favor ingrese un monto válido` · `Movimiento registrado` + `Ingreso/Egreso: {x}` · `Error al registrar movimiento` | Validación y resultado | Control 12 | :66-67, :73, :77 |

Los conceptos de esta página **no coinciden** con los del `MovimientosDialog` del listado
(§B.5): dos catálogos distintos para el mismo campo de la misma tabla.

### B.5 Los tres diálogos y las dos tarjetas

**`AperturaCajaDialog.tsx`** (323 líneas) — 13 controles.
Disparador `Abrir Caja` verde con icono `Lock` (:111-119) · modal **a mano** por `createPortal`
(:120-320) con botón de cierre en aspa (:129-133) · tarjetas `Sucursal` (:141-147), `Cajero`
(:148-154) y `Fecha y hora` (:156-164, con `toLocaleString('es-CO')` cableado) ·
`Alcance de la Caja` con dos tarjetas-toggle `Esta sucursal` / `Todas las sucursales`
(`Caja global`) (:170-211) y la nota `Todos los usuarios de todas las sucursales registrarán
ventas en esta caja.` (:205-209) · en modo `user`, el bloque se sustituye por
`Mi caja en {sucursal}` + `Cada cajero abre y gestiona su propia caja de forma independiente.`
+ `Esta caja registrará únicamente tus ventas y movimientos. Otros cajeros de la sucursal
tendrán sus propias cajas.` (:214-230) · `Detalles de Apertura` (:236-238) con
`Monto Inicial *` (:243-255, por defecto **100.000 cableado**, :32) y su equivalencia
`Equivale a: {x}` (:256-260) · `Notas (Opcional)` (`Observaciones de apertura...`, :264-275) ·
aviso azul `Importante: Una vez abierta la caja, podrás registrar ventas, ingresos y egresos
hasta el momento del cierre.` (:280-285) · `Cancelar` (:289-297) · `Abrir Caja` / `Abriendo...`
(:298-311) · toasts `Caja abierta exitosamente` / `Caja abierta sin conexión` +
`Monto inicial: {x} · pendiente de sincronizar` (:86-88), `El monto inicial no puede ser
negativo` (:79), `Error al abrir caja` (:101-103).

**`CierreCajaDialog.tsx`** (648 líneas) — 20 controles.
Disparador propio `Cerrar Caja` rojo (:211-218) **que se pinta siempre, también en modo
controlado** (§B.12.1) · modal a mano (:219-645) titulado `Arqueo y Cierre de Caja` (:224-227) ·
esqueleto de carga (:236-241) · `Resumen de Movimientos` (:245-250) con `Monto inicial:`,
`Ventas en efectivo:`, `Ventas totales:`, `Ingresos:`, `Egresos:`, `Vuelto entregado:`,
`Devoluciones:` (:252-299) · `Ingresos por metodo de pago:` (:304-323, **sin tilde**) ·
`Ventas por metodo de pago:` + `Total ventas:` (:326-353, sin tilde) ·
`Recibos de Caja (Abonos a Cuentas por Cobrar):` + `Total recibido:` (:356-379) ·
`Egresos por metodo de pago (compras):` + `Total Pagos a Proveedores:` (:382-409, sin tilde) ·
`Monto esperado:` (:413-425; `****` en cierre ciego) ·
`Movimientos de la Sesion ({n})` (:430-471, sin tilde) con una fila por pago: etiqueta,
referencia, contraparte, badge de método e importe con signo ·
`Arqueo por Método de Pago` (:474-479) con, por método, `Esperado: {x}` (o `****`),
`Contado real` y `Diferencia` (:484-538) · `Total esperado (todos los métodos):`,
`Total contado (todos los métodos):`, `Diferencia total:` y `Sobrante`/`Faltante en el arqueo
total` (:544-583) · `Observaciones del Cierre (Opcional)` (:586-597) · aviso ámbar
`⚠️ Atención: Hay una diferencia total de {x} (sobrante)/(faltante) en el arqueo.` (:602-609) ·
`Cancelar` (:613-621) · `Cerrar Caja` / `Cerrando...` (:622-635) · toasts
`Caja cerrada exitosamente` / `Caja cerrada sin conexión` + `Diferencia total: {x} · pendiente
de sincronizar (totales con las ventas locales)` (:192-195), `El monto final no puede ser
negativo` (:185), `Error al cargar resumen de caja` (:120), `Error al cerrar caja` (:201-203).

**`MovimientosDialog.tsx`** (319 líneas) — 12 controles.
Disparador `Registrar Movimiento` (:119-128) · modal a mano (:129-316) ·
pestañas `Ingreso` / `Egreso` (:147-162) · `Ingreso de Efectivo` / `Egreso de Efectivo`
(:168-170, :207-209) · 6 botones de concepto por pestaña: ingresos `Fondo adicional`,
`Préstamo`, `Devolución`, `Cambio de billetes`, `Venta contado especial`, `Otro ingreso`;
egresos `Gastos menores`, `Retiro de efectivo`, `Compra insumos`, `Cambio de billetes`,
`Préstamo a empleado`, `Otro egreso` (:22-38, :177-189, :216-228) ·
campo libre `Especificar otro concepto...` (:190-198, :229-237) ·
`Monto *` + `Equivale a: {x}` (:244-265) · `Observaciones (Opcional)`
(`Detalles adicionales...`, :267-280) · `Cancelar` (:284-292) ·
`Registrar Ingreso` / `Registrar Egreso` / `Registrando...` (:293-306) · toasts
`El concepto es requerido` (:80), `El monto debe ser mayor a cero` (:85),
`Ingreso/Egreso registrado` (` sin conexión`) + `{concepto}: {x}` (:92-94),
`Error al registrar movimiento` (:109-111).

**`CashSummaryCard.tsx`** (423 líneas) — tarjeta del listado.
`Resumen de Caja` + badge `Caja Abierta`/`Caja Cerrada` (:62-77) · `Abierta:` / `Cerrada:`
(:81-96) · fichas `Cajero` y `Sucursal` (:99-122) · ocho KPI: `Inicial`,
`Ventas en efectivo`, `Ventas totales`, `Ingresos`, `Egresos`, `Vuelto`, `Recibos de Caja`,
`Pagos a Proveedores`, `Devoluciones` (:129-254; los cinco últimos solo si `> 0`) ·
`Pagos por método:` (:257-280) · `Ventas por método:` + `Total ventas:` (:283-312) ·
`Pagos a proveedores por método:` (:315-336) · `Total Esperado:` o el aviso morado de cierre
ciego (:341-359) · `Monto Contado:` + `Diferencia:` + `📈 Sobrante` / `📉 Faltante de efectivo`
(:362-402) · `Observaciones:` (:405-417).

**`MovimientosList.tsx`** (165 líneas).
`Movimientos de Caja` con dos totales, `Ingresos` y `Egresos` (:70-89) · esqueleto (:48-64) ·
vacío `No hay movimientos registrados` + `Los ingresos y egresos aparecerán aquí` (:95-104) ·
una fila por movimiento con icono, concepto, fecha, notas y badge de importe (:106-152).

### B.6 Qué tablas alimentan la caja (verificado por MCP)

| Tabla | Columnas que usa el módulo | Quién la lee o la escribe |
|---|---|---|
| `cash_sessions` | `id`, `uuid`, `organization_id`, `branch_id` (**NULL = caja global**), `opened_by`, `opened_at`, `initial_amount`, `closed_at`, `closed_by`, `final_amount`, `difference`, `status`, `notes` | `openSession` (CajasService.ts:515-526), `closeSession` (:573-585), todas las consultas de listado y detalle |
| `cash_movements` | `id`, `uuid`, `organization_id`, `cash_session_id`, `type`, `concept`, `amount`, `user_id`, `notes`, `created_at`; **`branch_id` existe y no se escribe** | `addMovement` (:631-643), `addMovementToSession` (:1184-1195), `getSessionMovements` (:665-669) |
| `cash_counts` | `id`, `organization_id`, `cash_session_id`, `count_type`, `counted_amount`, `expected_amount`, `difference`, `denominations` (jsonb), `counted_by`, `notes`; **`verified_by` y `branch_id` existen y no se escriben** | `createCashCount` (:1148-1162), `getSessionCounts` (:1120-1124) |
| `payments` | `amount`, `method`, `source`, `change_amount`, `status`, `branch_id`, `created_by`, `created_at` | `getCashSummary` (:727-741, :814-827), `generateSessionReport` (:1075-1088), `getSessionPaymentsByMethod` (:1515-1526), `getSessionPaymentsDetail` (:1335+) |
| `returns` | `total_refund`, `status`, `branch_id`, `user_id`, `created_at` | `getCashSummary` (:771-784) |
| `folio_items` | `amount`, **`cash_session_id`** | `getCashSummary` (:792-795) — la **única** tabla que sí enlaza con la sesión |
| `sales` | `id`, `total`, `status`, `payment_status`, `created_at`, `customer_id`, `source` | `getSessionSales` (:1299+) |
| `profiles` | `first_name`, `last_name` | Nombre del cajero (:243-254, :313-324, :1037-1049) |
| `branches` | `name` | Nombre de la sucursal (:257-268, :329-341) |
| `organization_settings` | `key` = `pos_blind_cash_count` · `pos_cash_session_mode` | `configuracionService.ts:404-420`, `:443-462` |

**El agujero del modelo:** `payments` **no tiene `cash_session_id`**. La pertenencia de un pago
a una caja se deduce por **rango de fechas + sucursal (+ cajero en modo `user`)`**
(CajasService.ts:733-740). Si dos cajas de la misma sucursal se solapan en el tiempo —cosa que
nada impide, §B.12.6—, los mismos pagos se cuentan en las dos. `folio_items` demuestra que la
columna era posible: es la única que la tiene.

### B.7 Qué se calcula en el navegador

**Todo.** No hay RPC ni vista: `getCashSummary` (CajasService.ts:714-906) lanza cinco consultas
sueltas (`payments` en efectivo, `returns`, `folio_items`, `payments` de todos los métodos,
`cash_movements`) y hace las restas en JavaScript:

```
expected_amount = initial_amount
                + salesCash          (efectivo de ventas, ya restado el vuelto)
                + cashReceiptsCash   (abonos a cuentas por cobrar en efectivo)
                + cashIn             (ingresos manuales)
                − cashOut            (egresos manuales)
                − purchasesCash      (pagos a proveedores en efectivo)
                − returnsTotal       (devoluciones)
```
— CajasService.ts:811.

También en el navegador: `difference = final_amount − expected_amount` (:555), los totales por
método (:841-861), el total de ventas neto de vuelto (:864-867), el total contado del arqueo
por método (`CierreCajaDialog.tsx:160-179`) y el total del arqueo por denominaciones
(`NuevoArqueoPage.tsx:120-138`). Consecuencia directa: el cierre ciego es cosmético (§B.8), la
diferencia depende de la hora del reloj del cliente (`new Date().toISOString()` como límite
superior, :734) y un recálculo posterior puede dar otro número.

### B.8 Cierre ciego

`useBlindCloseMode.ts:15-63` lee `pos_blind_cash_count` de `organization_settings` y si el
usuario es administrador; expone `showExpected = !isBlindMode || isOrgAdmin` (:60).
Se consume en siete sitios: listado (page.tsx:34, :210, :451-463, :530-559), detalle
(:67, :247-314, :433-443, :593-618), `CashSummaryCard` (:25, :341-359, :362),
`CierreCajaDialog` (:63, :86-116, :155-158, :415-424, :497, :519-533, :548, :562-576, :602-609),
`NuevoArqueoPage` (:59, :176, :267-272, :400-404, :456-461, :479-524) y
`ReportGenerator` (:25, :59-62, :141, :233, :253-256, :312, :360).

Qué hace de verdad:
- En el cierre, los importes esperados se sustituyen por `****` y los campos `Contado real`
  arrancan en **0** en lugar de prellenarse con el esperado (`CierreCajaDialog.tsx:102-116`).
  Ese es el único efecto funcional real: obliga a contar.
- En el listado, `Final` y `Diferencia` se sustituyen por `***` (page.tsx:529-547).
- En el detalle, dos de los cuatro KPI se sustituyen por avisos (:263-273, :304-314).
- En los reportes, `mask()` imprime `***` (`ReportGenerator.tsx:62`, `:256`).

Qué **no** hace: `getCashSummary` devuelve los importes reales al navegador siempre
(CajasService.ts:869-889) y `summary` vive en el estado de React. Cualquiera con las
herramientas del navegador ve el monto esperado. **El cierre ciego de hoy es una cortina, no un
control de acceso.**

Y un efecto colateral: en cierre ciego el listado bloquea `Ver detalle` de **todas** las cajas
(page.tsx:451-463, :548-559), incluida la propia. El cajero no puede revisar sus propios
movimientos ni sus ventas del turno.

### B.9 Permisos: quién puede cerrar la caja de otro

Tres capas, y solo la primera existe:

1. **Cliente (listado).** `page.tsx:360` decide `canClose = isOrgAdmin || activeSession.opened_by
   === currentUserId`. Si no, pinta el botón gris (#17 de §B.1).
2. **Cliente (detalle).** `CajaDetallePage.tsx:204-207` **no comprueba nada**: el botón
   `Cerrar Caja` se pinta para cualquiera que abra la URL de la sesión.
3. **Servidor.** Ninguna. La política RLS `cash_sessions_insert_update_delete_policy` es
   `FOR ALL` con `USING (organization_id IN (SELECT organization_id FROM organization_members
   WHERE user_id = auth.uid()))` y **sin `WITH CHECK`** (verificado por MCP). Cualquier miembro
   de la organización puede actualizar cualquier sesión de caja de la organización, incluidos
   `final_amount`, `difference` y `status`. La única restricción adicional es la política
   `RESTRICTIVE branch_access_restrictive` con `app_branch_access(branch_id)`, que limita por
   sucursal, no por autoría.

Además, `isOrgAdmin` se resuelve **por el nombre del rol**:

```
roleName.includes('admin') || roleName.includes('owner') || memberData.role_id === 2
```
— `page.tsx:72-76` y, copiado, `useBlindCloseMode.ts:40-44`. Viola la regla 6 del proyecto
(«los permisos se resuelven en el servidor, nunca a partir del nombre de un rol»), y además
cablea `role_id === 2` como «admin de organización».

### B.10 El modo `cashMode`

`organization_settings.key = 'pos_cash_session_mode'`, con dos valores
(`configuracionService.ts:129-139`): **no hay un tercer modo «global»**. Lo global es el
*alcance de cada sesión* (`branch_id = NULL`), que se elige en la apertura y solo cuando el
modo es `branch`.

| Modo | Qué es la «caja activa» | Alcance elegible en la apertura | Resumen |
|---|---|---|---|
| `branch` (default) | La caja abierta de la sucursal actual; si no hay, la **global** (`branch_id IS NULL`) — CajasService.ts:158-198 | `Esta sucursal` o `Todas las sucursales` (AperturaCajaDialog.tsx:170-211) | Filtra `payments`/`returns` por `branch_id` **solo si la sesión tiene sucursal** (:735-737, :778-780). La caja global suma todas las sucursales. |
| `user` | La caja abierta **del usuario actual** en la sucursal actual; no cae a global ni a la de otro cajero (:133-156) | Ninguno: siempre la sucursal actual (:454) | Filtra además por `payments.created_by` y `returns.user_id` = `opened_by` (:738-740, :781-783), y lo mismo en el reporte (:1085-1087) y en `getSessionPaymentsByMethod` (:1523-1525) |

El modo se cachea 30 s en memoria (`CajasService.ts:68-89`) y se invalida con
`invalidateCashSessionModeCache()` (:92-94). La unicidad al abrir cambia con el modo: por
sucursal en `branch`, por sucursal **y cajero** en `user` (:461-476).

### B.11 Alcance multi-sucursal

- `getActiveSessions` (:295-354) trae **todas** las sesiones abiertas de la organización, sin
  filtrar por sucursal — pero el estado vacío de la pestaña dice `No hay cajas abiertas en esta
  sucursal` (page.tsx:413). El texto miente en las dos direcciones.
- `getOpenSessionsCount` (:276-290) cuenta toda la organización; el chip `{n} abiertas` (#6 de
  §B.1) es, pues, de organización, no de sucursal.
- El historial sí filtra: `branch_id.eq.{X},branch_id.is.null` (:374), es decir, la sucursal
  activa **más** las cajas globales, sin distinguirlas en la tabla salvo por la columna
  `Sucursal`.
- `cash_movements.branch_id` y `cash_counts.branch_id` existen en la BD, tienen índice
  (`idx_cash_movements_branch_id`, `idx_cash_counts_branch_id`, verificado por MCP) y **el
  código nunca los escribe**: quedan `NULL`, la política `app_branch_access(NULL)` los deja
  pasar y ningún informe por sucursal puede apoyarse en ellos.
- El `BranchBadge` del listado (page.tsx:297) es el del inventario, el de la píldora fucsia
  fuera del manual (`docs/design/SISTEMA-BADGES.md` §6). En el diseño se sustituye por el
  `BranchBadge` nuevo.

### B.12 Sin conexión (Desktop, fase 4F)

`shouldOperateCashOffline()` (de `lib/offline/cashOutbox`) decide. Con esa bandera:

| Acción | Qué pasa | Archivo:línea |
|---|---|---|
| Abrir caja | `enqueueCashSessionOpen`: sesión en el outbox con **id negativo** y `pending_sync: true` | CajasService.ts:493-513 |
| Cerrar caja | `enqueueCashSessionClose` con el resumen ya calculado y la marca `summaryPartial` | :557-571 |
| Movimiento | `enqueueCashMovement` con `uuid` del cliente e id negativo | :617-629 |
| Caja activa | Primero la réplica local, salvo que ya se haya cerrado sin red; luego el estado local | :211-238 |
| Resumen | Suma las ventas del outbox que aún no tienen `payments` en Supabase | :893-901 |
| Resumen parcial | Si ni la réplica de `payments` responde, `lastSummaryWasPartial = true` y solo cuenta el outbox | :745-750, :831-835 |

**En pantalla no se ve nada de esto.** Lo único que lo dice son tres toasts:
`Caja abierta sin conexión` (`AperturaCajaDialog.tsx:86-88`), `Caja cerrada sin conexión … ·
pendiente de sincronizar (totales con las ventas locales)` (`CierreCajaDialog.tsx:192-195`) e
`Ingreso registrado sin conexión` (`MovimientosDialog.tsx:92-94`). Ninguna tarjeta, fila de
tabla ni badge muestra `pending_sync` (declarado en `types.ts:23` y `:40`), ni se avisa de que
el resumen es parcial. Un toast dura tres segundos; el turno, ocho horas.

### B.13 Reportes

`ReportGenerator.tsx` genera dos HTML y los imprime abriendo una ventana nueva
(`window.open('', '_blank')` + `document.write` + `print()` a 500 ms, :36-44).

| Formato | Botón | Secciones | Archivo:línea |
|---|---|---|---|
| Hoja carta | `Reporte Hoja Carta` | `REPORTE DE ARQUEO DE CAJA` · `INFORMACION DE LA SESION` (cajero, estado, apertura, cierre, sucursal, id, observaciones) · `RESUMEN FINANCIERO` (10 filas + `EFECTIVO ESPERADO EN CAJA`; con `Monto Contado` y `DIFERENCIA` si está cerrada) · `PAGOS POR METODO` (ingresos y egresos) · `RECIBOS DE CAJA (ABONOS A CUENTAS POR COBRAR)` · `PAGOS A PROVEEDORES (CUENTAS POR PAGAR)` · `RESUMEN DE VENTAS` · `MOVIMIENTOS DE CAJA` (ingresos y egresos con totales) · caja `EFECTIVO ESPERADO EN CAJA` · firmas `Cajero: {nombre}` y `Supervisor` · pie `GO Admin ERP - Reporte generado automaticamente` | :55-247 |
| Térmica 80 mm | `Reporte POS 80mm` | `REPORTE DE CAJA` · datos de la sesión · `RESUMEN FINANCIERO` · `PAGOS POR METODO` · `RECIBOS DE CAJA` · `PAGOS A PROVEEDORES` · `VENTAS` · caja `EFECTIVO ESPERADO` · pie con cajero y fecha | :249-370 |

Ambos son monoespaciados en blanco y negro, respetan el cierre ciego con `mask()` (:62, :256) y
formatean las fechas con `formatDateTimeInTz(valor, timezone)` (:64, :258) — esta es la única
parte del módulo que aplica bien la regla de zona horaria. El consejo azul dice
`Use formato hoja para archivo/auditoria, y POS 80mm para impresora termica.` (:418).

### B.14 Lo roto o sin efecto — Cajas

1. **Dos botones `Cerrar Caja` en el detalle.** `CierreCajaDialog.tsx:211-218` renderiza su
   disparador **siempre**, aunque se le pasen `open` y `onOpenChange`. El detalle ya pinta el
   suyo (`CajaDetallePage.tsx:204-207`) y además monta el diálogo controlado (:691-698): se ven
   dos botones rojos idénticos.
2. **El detalle no comprueba permisos.** `CajaDetallePage.tsx:204-207` muestra `Cerrar Caja` a
   cualquiera, mientras el listado sí filtra (`page.tsx:360`). Basta con abrir la URL de la
   sesión de otro cajero.
3. **Y el servidor tampoco.** La política RLS de `cash_sessions` permite `UPDATE` a cualquier
   miembro activo de la organización, sin `WITH CHECK` de autoría (verificado por MCP, §B.9).
   El botón gris **es** el control de acceso.
4. **La caja global no muestra pagos.** `CajasService.ts:1519` hace
   `.eq('branch_id', session.branch_id)` sin la guarda `if (session.branch_id)` que sí tienen
   las demás consultas (:735-737, :778-780, :1082-1084). Con una caja global (`branch_id`
   `NULL`), PostgREST genera `branch_id=eq.null`, que no casa con nada: el bloque
   `Pagos por Método` del detalle dice siempre `No hay pagos registrados` (:470-471).
5. **La suscripción realtime no existe.** `CajasService.ts:1549-1557` devuelve una función
   vacía si la tabla no está publicada, y **ni `cash_sessions` ni `cash_movements` están en
   `supabase_realtime`** (verificado por MCP). La «recarga silenciosa» del listado
   (`page.tsx:99-128`) y el `debounce` de 300 ms nunca se ejecutan: el usuario solo ve datos
   frescos si pulsa el botón de recargar o cambia de sucursal.
6. **Nada impide dos cajas abiertas.** La unicidad se comprueba en el cliente antes de insertar
   (`CajasService.ts:461-491`) y **no hay índice único** en `cash_sessions` (verificado por MCP:
   solo `cash_sessions_pkey` e `idx_cash_sessions_uuid`). Dos cajeros pulsando `Abrir Caja` a la
   vez abren dos cajas de la misma sucursal, y entonces los pagos del solapamiento se cuentan en
   las dos (§B.6).
7. `CajasService.ts:631-643` y `:1184-1195` — los movimientos no escriben `branch_id` pese a que
   la columna y su índice existen.
8. `CajasService.ts:1148-1162` — los arqueos no escriben `branch_id` ni usan `verified_by`: no
   hay flujo de verificación de arqueo por un supervisor, aunque la columna existe y el reporte
   imprime una línea de firma `Supervisor` (`ReportGenerator.tsx:238`).
9. **Moneda cableada.** `$` literal en `NuevoMovimientoPage.tsx:165`; denominaciones colombianas
   fijas en `NuevoArqueoPage.tsx:49-50`; `initial_amount: 100000` por defecto en
   `AperturaCajaDialog.tsx:32` con el comentario «COP 100,000 por defecto».
10. **Fechas fuera del timezone de la organización.** `page.tsx:225-233` (`toLocaleString('es-CO',
    …)` cableado, usado en el reloj de la cabecera, en las tarjetas de cajas abiertas y en las
    columnas `Apertura` y `Cierre` del historial) y `AperturaCajaDialog.tsx:161`. El detalle,
    `CashSummaryCard`, `MovimientosList` y los reportes sí usan `useFormatDate()` /
    `formatDateTimeInTz`: la misma fecha se formatea de dos maneras en dos pantallas.
11. **Permisos por nombre de rol** en `page.tsx:72-76` y `useBlindCloseMode.ts:40-44` (duplicado
    literal), con `role_id === 2` cableado.
12. **Emojis como estado**: `page.tsx:280` (`🟢 Mi Caja Abierta` / `🔴 Sin Caja`),
    `CashSummaryCard.tsx:397` (`📈 Sobrante` / `📉 Faltante de efectivo`),
    `CierreCajaDialog.tsx:605` (`⚠️ Atención`). Fuera del sistema de badges.
13. **Tres diálogos a mano** con `createPortal` en lugar del `Dialog` del kit:
    `AperturaCajaDialog.tsx:120-320`, `CierreCajaDialog.tsx:219-645`,
    `MovimientosDialog.tsx:129-316`. Sin cierre con `Esc`, sin trampa de foco, sin `role`
    ni etiquetado accesible, y con el aspa dibujada como `<svg>` inline.
14. **Paginación propia**: `SessionsPagination.tsx` (113 líneas) — mismo trabajo que la
    paginación única del kit, con otro aspecto y hasta 7 botones numerados sin elipsis.
15. **Estados sin acción.** El botón gris + párrafo de `page.tsx:362-376` («no puedes cerrar la
    caja de otro») y el `Ver detalle` bloqueado de `:458-463` y `:556-559` son callejones sin
    salida: no ofrecen «Avisar al administrador» ni «Ver solo mis movimientos».
16. **Sin filtros ni buscador** en el listado, aunque el servicio y los tipos los soportan
    (`CajasService.ts:359-362`, `types.ts:173-178`). El historial siempre se pide con
    `{ status: 'all' }` (`page.tsx:173`).
17. **Sin paginación** en el detalle: movimientos, arqueos y ventas se pintan enteros
    (`CajaDetallePage.tsx:529-563`, `:587-623`, `:639-683`).
18. **Sin reportes en el detalle**: el `ReportGenerator` solo existe en «Mi Caja»
    (`page.tsx:395`), no en la sesión cerrada que se está auditando.
19. `ReportGenerator.tsx:36-44` — `window.open('', '_blank')` + `document.write` + `print()` a
    500 ms. Si el navegador bloquea la ventana emergente, `printWindow` es `null`, el `if` lo
    ignora y **aun así se muestra el toast de éxito** (:46). Tampoco usa el sistema de
    impresión del Desktop (`print_jobs`).
20. `ReportGenerator.tsx:323-325` — el reporte de 80 mm itera sobre las claves de ingresos **y**
    egresos pero imprime solo `incomeMethods[method] || 0`: un método que solo tuvo egresos sale
    en `$0`.
21. `MovimientosDialog.tsx:69-74` y `:190`, `:229` — el campo libre `Especificar otro
    concepto...` aparece **también al abrir el diálogo** (porque `concept === ''`), no solo al
    pulsar `Otro ingreso`/`Otro egreso`. Hay un input suelto bajo los seis botones desde el
    primer segundo.
22. `NuevoMovimientoPage.tsx:25-26` vs `MovimientosDialog.tsx:22-38` — **dos catálogos de
    conceptos distintos** para la misma columna `cash_movements.concept`.
23. `NuevoArqueoPage.tsx:310-312` — el botón `Limpiar` está en la tarjeta de billetes pero borra
    billetes, monedas y métodos (`clearDenominations`, :190-194).
24. `page.tsx:413` — `No hay cajas abiertas en esta sucursal`, cuando `getActiveSessions`
    consulta toda la organización (§B.11).
25. `CajaDetallePage.tsx:8-24` — `Clock`, `FileText`, `TrendingDown`, `Download` y `Printer` se
    importan y no se usan.
26. `types.ts:20` declara `closed_by_name` y **nadie lo rellena**: en ninguna pantalla se ve
    quién cerró la caja, aunque `cash_sessions.closed_by` existe y se escribe (:577).
27. `CierreCajaDialog.tsx:307`, `:329`, `:385`, `:434` — `metodo` y `Sesion` sin tilde, en un
    diálogo que el cajero ve en cada cierre.
28. **El arqueo parcial no cierra nada ni bloquea nada.** `NuevoArqueoPage` inserta en
    `cash_counts` y vuelve al detalle; el cierre (`CierreCajaDialog`) vuelve a pedir el conteo
    desde cero y **no lee los arqueos previos**. Un arqueo de tipo `Cierre` hecho por esa página
    no cierra la sesión.
29. **El cierre ciego se enmascara en el cliente** con los importes reales ya cargados (§B.8).
30. `useBlindCloseMode.ts:20-55` — el hook se monta en seis componentes a la vez (listado,
    detalle, `CashSummaryCard`, `CierreCajaDialog`, `NuevoArqueoPage`, `ReportGenerator`) y cada
    uno lanza su propio `organization_settings` + `organization_members`: hasta seis pares de
    consultas por pantalla, sin caché.

---

## C. Conteo de controles

| Sección | Controles |
|---|---|
| A.0 Contenedor del perfil | 16 |
| A.1 Datos personales | 32 |
| A.2 Seguridad | 33 |
| A.3 Sesiones y dispositivos | 22 |
| A.4 Organización por defecto | 8 |
| A.5 Preferencias de notificación | 12 |
| A.6 Roles asignados | 11 |
| A.7 Panel de Vendedor | 7 |
| A.8 Eliminar cuenta | 12 |
| A.9 Bloque de sesión del header | 24 |
| **Total Perfil** | **177** |
| B.1 Cajas — listado | 36 |
| B.2 Cajas — detalle | 37 |
| B.3 Nuevo arqueo | 20 |
| B.4 Nuevo movimiento | 13 |
| B.5 `AperturaCajaDialog` | 13 |
| B.5 `CierreCajaDialog` | 20 |
| B.5 `MovimientosDialog` | 12 |
| B.5 `CashSummaryCard` + `MovimientosList` + `ReportGenerator` | 19 |
| **Total Cajas** | **170** |
| **Total general** | **347** |

De ellos: **32 rotos o sin efecto en Perfil** (§A.10) y **30 en Cajas** (§B.14). Cuatro
referencias a esquema inexistente (`profiles.full_name`, `profiles.lang`,
`profiles.deletion_requested_at`, `public.mfa_factors`) y **13 columnas reales que existen y
ninguna pantalla expone** (§A.11).

---

## D. Recomendación de rediseño

### D.1 Perfil

1. **Dar cabecera a la pantalla.** Hoy no hay ni título. Un `PageHeader` con avatar, nombre,
   **cargo** (`job_positions.name`, hoy invisible), organización activa y los `BranchBadge` de
   las sucursales del usuario resuelve de un golpe la queja de «no sé dónde estoy» y saca las
   sucursales del fondo de «Roles asignados».
2. **Bajar el tema al perfil** (decisión de fidelidad: «AppHeader sin perfil ni tema») y
   añadir **zona horaria**, que hoy no existe a nivel de usuario. Tema + idioma + zona horaria
   forman un bloque «Preferencias» que hoy está partido entre el header y «Datos personales».
3. **Subir al perfil lo que solo vive en el header**: `Correo sin confirmar · Reenviar` (junto
   al campo de correo, donde tiene sentido) y `Cerrar sesión` (al bloque de sesiones, como
   «Cerrar esta sesión» frente a «Cerrar las demás»).
4. **Nombre en dos campos.** `Nombre` y `Apellidos`, no un `Nombre completo` que se parte por el
   primer espacio (§A.10.11). La BD ya tiene `first_name` y `last_name`.
5. **No calcar lo roto.** El modal de MFA con el QR de mentira, el botón `Verificar` sin
   `onClick` y los códigos de respaldo aleatorios (§A.10.2-4) se dibujan **como deben ser**:
   QR real, campo de 6 dígitos con verificación, y códigos con `Copiar` y `Descargar`, marcados
   **Nuevo**. Los tres modales a mano se sustituyen por `ConfirmDialog` / `Sheet` del kit.
6. **Confirmar lo destructivo y solo lo destructivo.** Hoy es al revés: `Desactivar` 2FA
   (§A.10.5), `Eliminar` avatar (§A.10.12), `Desconectar todos los otros dispositivos`
   (§A.10.18) y el cambio de organización por defecto (§A.10.23) no confirman nada, mientras
   `Eliminar cuenta` pide cuatro llaves. Un `ConfirmDialog` para los tres primeros; el cambio de
   organización pasa a un botón `Guardar` explícito.
7. **Sesiones con la información que ya está en la BD**: `browser`, `os`, `first_seen_at`
   (§A.11). Y paginación única del kit, no la de cinco en cinco dibujada a mano.
8. **Un solo destino para `Configuración`** en el menú del header (§A.10.28).

### D.2 Cajas

1. **El listado necesita `PageHeader` + `StatCard` + `FilterPanel` + `DataTable`.** Hoy es una
   cabecera a medida, tres pestañas y una tabla sin un solo filtro pese a que el servicio los
   soporta (§B.14.16). Cuatro `StatCard` en la parte superior (cajas abiertas, efectivo
   esperado de la sucursal, diferencia acumulada del día, movimientos del turno) y un
   `FilterPanel` con sucursal, cajero, estado y rango de fechas.
2. **«No puedes cerrar la caja de otro» es un estado con acción, no un botón gris.** Un
   `EmptyState` en línea: «Esta caja la abrió Ana Gómez · Solo ella o un administrador pueden
   cerrarla» con `Avisar al administrador` como acción primaria y `Ver detalle` como
   secundaria. Y lo mismo con el `Ver detalle` bloqueado por cierre ciego: «Cierre ciego
   activo» + `Ver solo mis movimientos`.
3. **Cierre ciego: importes ocultos, no importes tachados.** En Figma se dibuja la variante
   `Cierre ciego` de cada frame con los campos `Contado real` vacíos y el esperado sustituido
   por un `Badge` «Oculto», nunca por `****` (que hoy se lee como un error de renderizado). Y se
   anota que **en código el enmascarado debe hacerse en el servidor** (§B.8).
4. **Un solo botón `Cerrar Caja`.** El disparador propio del `CierreCajaDialog` (§B.14.1) no se
   calca: en Figma el diálogo se instancia desde la Sección «Cabecera y caja», y las pantallas
   nuevas solo pintan su botón.
5. **El estado sin conexión se ve, no se avisa con un toast.** Badge `Pendiente de sincronizar`
   (ámbar, contorno, con punto) en la fila de la sesión, en la del movimiento y en el `StatCard`
   del esperado, más el aviso «Resumen parcial: faltan las ventas que aún no han sincronizado»
   cuando `lastSummaryWasPartial` (§B.12).
6. **Paginación única del kit** en el historial (sustituye a `SessionsPagination`) y también en
   las tres tablas del detalle, que hoy no paginan (§B.14.17).
7. **Reporte desde el detalle**, no solo desde «Mi Caja» (§B.14.18), y con los dos formatos ya
   existentes (hoja carta y 80 mm) como un único botón con menú.
8. **Textos honestos**: `No hay cajas abiertas en esta organización` (§B.14.24), `metodo` →
   `método`, `Sesion` → `Sesión`, y los emojis de estado sustituidos por los badges de
   `docs/design/SISTEMA-BADGES.md`.
9. **Un solo catálogo de conceptos** de movimiento (§B.14.22) y un solo componente de
   movimiento: hoy hay un diálogo y una página con el mismo formulario y distintos datos.

### D.3 Lo que el diseño debe marcar como «Nuevo»

Perfil: cabecera con avatar, cargo, organización y sucursales · selector de tema · selector de
zona horaria · `Correo sin confirmar · Reenviar` dentro del perfil · `Cerrar sesión` y
`Cerrar las demás sesiones` desde el bloque de sesiones · campos `Nombre` y `Apellidos`
separados · navegador y sistema operativo en la fila del dispositivo · `Copiar` y `Descargar`
los códigos de respaldo · QR real de MFA.

Cajas: `StatCard` del listado · `FilterPanel` (sucursal, cajero, estado, fechas) · estado con
acción «no puedes cerrar la caja de otro» · badge `Pendiente de sincronizar` · aviso de resumen
parcial · paginación del kit en el detalle · botón de reporte en el detalle · verificación de
arqueo por un supervisor (`cash_counts.verified_by`, columna que ya existe).

### D.4 Deuda que el diseño no puede resolver sola

Queda anotada aquí porque condiciona lo que se dibuja:

1. `payments` sin `cash_session_id`: mientras la pertenencia se deduzca por fechas, ningún
   diseño puede prometer que el arqueo cuadra (§B.6).
2. Sin índice único en `cash_sessions`: dos cajas abiertas a la vez son posibles (§B.14.6).
3. RLS de `cash_sessions` sin guarda de autoría: el permiso de cierre es solo visual (§B.9).
4. `cash_sessions` y `cash_movements` fuera de `supabase_realtime`: el listado no se actualiza
   solo (§B.14.5).
5. `getCashSummary` en el navegador: el cierre ciego no es un control y el esperado depende del
   reloj del cliente (§B.7).
6. `profiles.deletion_requested_at` y `public.mfa_factors` no existen: dos flujos completos del
   perfil están muertos (§A.10.1 y §A.10.8).
