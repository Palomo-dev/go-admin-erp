# Paridad control → frame — Perfil de usuario y Cajas del POS

Acompaña a `docs/design/AUDITORIA-CONTROLES-PERFIL-CAJAS.md`. Una fila por control de la
auditoría, con el frame de Figma donde aparece y su estado: **calcado** (existe hoy y se dibuja
igual o con la corrección de acentuación que señala la auditoría), **Nuevo** (no existe en el
código; en Figma lleva el badge `Marca/Nuevo`), **sustituido por …** (existe y se cambia por el
componente correcto del kit, con motivo) u **omitido: …** (con motivo). Cero «omitido» sin
motivo.

Archivo Figma: «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`).
Fecha: 2026-09-22. Sin nombres de organizaciones cliente.

## Dónde vive cada cosa

| Página | Sección | Id | Tamaño | Frames |
|---|---|---|---|---|
| `03 Navegación y shell` | **Perfil de usuario** | `344:9278` | 6440 × 4008 (y 10156) | 23 |
| `05 POS y ventas` | **Cajas — listado** | `351:48911` | 6440 × 3204 (y 61690) | 14 |
| `05 POS y ventas` | **Cajas — detalle** | `355:53496` | 6440 × 4056 (y 65294) | 13 |
| `05 POS y ventas` | **Cajas — arqueo y movimiento** | `359:57133` | 6440 × 3204 (y 69750) | 12 |

### Abreviaturas de frame

**Perfil** · `P-Listo` Escritorio / Perfil — listo (Datos personales) · `P-Carg` cargando ·
`P-Vacío` vacío (sin organización) · `P-Error` error · `P-Seg` Seguridad · `P-Pref`
Preferencias (Nuevo) · `P-Ses` Sesiones y dispositivos · `P-Org` Organización y roles ·
`D-Pass` Diálogo — Cambiar contraseña · `D-Foto` Diálogo — Cambiar foto de perfil ·
`D-Correo` Diálogo — Cambiar correo electrónico · `D-2FA` Diálogo — Autenticación en dos pasos ·
`D-Códigos` Diálogo — Códigos de respaldo · `C-Otras` ConfirmDialog — Cerrar sesión en los demás
dispositivos · `C-2FA` ConfirmDialog — Desactivar la autenticación en dos pasos · `C-Foto`
ConfirmDialog — Quitar la foto de perfil · `T-Perfil` Toasts del perfil · `M-Listo` / `M-Carg` /
`M-Vacío` / `M-Error` / `M-Seg` / `M-Pass` los seis frames móviles de 390.

**Cajas — listado** · `CL-Listo` · `CL-Carg` · `CL-Vacío` · `CL-Error` · `CL-Ciego` (cierre
ciego) · `CL-Otro` (no puedes cerrar la caja de otro) · `CL-Filtros` · `CL-Offline` ·
`CLM-Listo` / `CLM-Vacío` / `CLM-Ciego` / `CLM-Filtros` (móvil) · `CL-Confirm` ConfirmDialog —
Cerrar la caja de otro cajero · `CL-Toasts`.

**Cajas — detalle** · `CD-Resumen` · `CD-Carg` · `CD-NoExiste` · `CD-Error` · `CD-Ciego` ·
`CD-Movs` · `CD-Arq` · `CD-Ventas` · `CDM-Listo` / `CDM-Movs` (móvil) · `I-Apertura` /
`I-Cierre` / `I-CierreCiego` (instancias de los diálogos de «Cabecera y caja»).

**Cajas — arqueo y movimiento** · `CA-Arqueo` · `CA-ArqCiego` · `CA-ArqCerrada` · `CA-ArqCarg` ·
`CA-Mov` · `CA-MovError` · `I-AperturaUser` · `CAM-Arqueo` / `CAM-Mov` (móvil) · `D-Movimiento`
Diálogo — Registrar movimiento · `C-ArqueoDif` ConfirmDialog — Guardar arqueo con diferencia ·
`T-Arqueo` Toasts de arqueo y movimiento.

---

## A. Perfil de usuario

### A.0 Contenedor — 16 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| A.0-1 | Skeleton de barra lateral + panel | `P-Carg`, `M-Carg` | sustituido por `Skeleton` del kit (hoy se dibuja a mano con divs) |
| A.0-2 | Avatar 80 px | `P-Listo`, `M-Listo` | calcado (sube a 72 px en la cabecera nueva) |
| A.0-3 | Nombre del usuario | todas las de perfil | calcado |
| A.0-4 | Correo de la sesión | todas las de perfil | calcado |
| A.0-5 | `Datos personales` | `P-Listo` y 7 más | calcado |
| A.0-6 | `Seguridad` | `P-Seg` | calcado |
| A.0-7 | `Sesiones y dispositivos` | `P-Ses` | calcado |
| A.0-8 | `Organización por defecto` | `P-Org` | sustituido por «Organización y roles» (funde A.4 y A.6 en un bloque) |
| A.0-9 | `Preferencias de notificación` | `P-Pref` | sustituido por «Preferencias» (tema + idioma + zona horaria + notificaciones) |
| A.0-10 | `Roles asignados` | `P-Org` | sustituido: se funde con la organización por defecto |
| A.0-11 | `Panel de Vendedor` | `P-Listo` (navegación), `M-Listo` | calcado como ítem de navegación; su contenido se omite: el flujo es del portal de vendedores y no cambia |
| A.0-12 | `Eliminar cuenta` | `P-Listo` (navegación), `M-Listo` | calcado |
| A.0-13 | `Volver` (móvil) | `M-Seg` (flecha del `MobileHeader Mode=page`) | sustituido por la flecha atrás del `MobileHeader` |
| A.0-14 | Toast `No se encontró sesión de usuario` | `P-Error` | sustituido por `EmptyState Variant=error` |
| A.0-15 | Toast `Error al cargar datos de perfil` | `T-Perfil` #5 | calcado (Toast del kit) |
| A.0-16 | Toast `Error al cargar datos del usuario` | `P-Error`, `M-Error` | sustituido por `EmptyState Variant=error` con «Reintentar» |

Además, **Nuevo** en `P-Listo` y `M-Listo`: cabecera de perfil con avatar, cargo
(`job_positions.name`), organización y `BranchBadge` de cada sucursal; botón `Cerrar sesión`.

### A.1 Datos personales — 32 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| A.1-1 | `Datos personales` (título) | `P-Listo` | calcado (como `FormSection`) |
| A.1-2 | `Editar` | `P-Listo` (cabecera) | calcado |
| A.1-3 | Avatar 96 px | `D-Foto` | calcado (88 px en el diálogo) |
| A.1-4 | Overlay hover con `Upload` | `D-Foto` | sustituido por `ImageUploader` del kit: el overlay es hover-only y no existe en táctil |
| A.1-5 | `input type=file` | `D-Foto` | sustituido por `ImageUploader State=empty` |
| A.1-6 | `Subir foto` | `D-Foto` | calcado |
| A.1-7 | `Eliminar` (avatar) | `C-Foto` | sustituido por `ConfirmDialog Variant=destructive`: hoy borra sin preguntar |
| A.1-8 | `PNG o JPG. Máximo 2MB.` | `D-Foto` | sustituido por «PNG, JPG o WEBP. Máximo 2 MB.» (el código admite webp) |
| A.1-9 | `Nombre completo` | `P-Listo` | sustituido por dos campos, `Nombre` y `Apellidos` |
| A.1-10 | `Correo electrónico` (solo lectura) | `P-Listo` | calcado |
| A.1-11 | `Cambiar` (correo) | `P-Listo`, `M-Seg` | calcado |
| A.1-12 | `Teléfono` (`PhoneInput`) | `P-Listo` | calcado |
| A.1-13 | `Idioma preferido` | `P-Pref` | calcado, movido al bloque «Preferencias» |
| A.1-14 | `Cancelar` | `P-Listo` | calcado |
| A.1-15 | `Guardar cambios` | `P-Listo` | calcado |
| A.1-16 | Diálogo `Cambiar correo electrónico` | `D-Correo` | calcado |
| A.1-17 | `Correo actual` | `D-Correo` | calcado + badge `Sin confirmar` |
| A.1-18 | `Nuevo correo` | `D-Correo` | calcado |
| A.1-19 | `Confirma el nuevo correo` | `D-Correo` | calcado |
| A.1-20 | `Los correos no coinciden` | `D-Correo` | omitido como estado dibujado: es la variante `FormField State=error`, ya en el kit |
| A.1-21 | `Cancelar` | `D-Correo` | calcado |
| A.1-22 | `Enviar confirmación` | `D-Correo` | calcado |
| A.1-23 | `¿Estás seguro de cambiar tu correo?` | `D-Correo` | sustituido: la advertencia se integra en el diálogo y se suprime el segundo paso |
| A.1-24 | `Cancelar` (confirmación) | `D-Correo` | ídem |
| A.1-25 | `Sí, cambiar mi correo` | `D-Correo` | ídem |
| A.1-26 | Toast tamaño de imagen | `D-Foto` (ayuda) | sustituido por validación inline en el `ImageUploader` |
| A.1-27 | Toast formato de imagen | `D-Foto` (ayuda) | ídem |
| A.1-28 | Toasts `Subiendo imagen…` / `Imagen subida` | `T-Perfil` | omitido en el frame: el progreso es un estado del `ImageUploader`, no un toast |
| A.1-29 | Toast `Información actualizada` | `T-Perfil` #1 | calcado |
| A.1-30 | Toast avatar eliminado / error | `T-Perfil` | omitido: mismo patrón que #29, sin variante propia |
| A.1-31 | Toasts de validación del correo | `D-Correo` | sustituido por errores inline en los campos |
| A.1-32 | Toast `Correo de confirmación enviado a {correo}` | `T-Perfil` #2 | calcado, con acción `Reenviar` |

**Nuevo**: chip `Correo sin confirmar · Reenviar` dentro del perfil (hoy solo en el header) y el
campo `Cargo`.

### A.2 Seguridad — 33 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| A.2-1 | Cabecera `Seguridad` | `P-Seg`, `M-Seg` | calcado |
| A.2-2 | Bloque `Contraseña` | `P-Seg` | calcado |
| A.2-3 | `Cambiar` | `P-Seg`, `M-Seg` | calcado |
| A.2-4 | Modal `Cambiar contraseña` | `D-Pass`, `M-Pass` | sustituido por `Dialog` del kit / `BottomSheet` en móvil (hoy es `fixed inset-0` sin Esc ni foco atrapado) |
| A.2-5 | Aviso de correo sin confirmar | `P-Seg` (fila `Correo electrónico`) | sustituido: el aviso pasa a la fila del correo, con `Reenviar` |
| A.2-6 | `Contraseña actual` + ojo | `D-Pass` | calcado |
| A.2-7 | `Nueva contraseña` + ojo | `D-Pass` | calcado |
| A.2-8 | `La contraseña debe tener al menos 8 caracteres` | `D-Pass` | calcado como ayuda del `FormField` |
| A.2-9 | `Faltan {n} caracteres` | `D-Pass` | sustituido por el medidor de fuerza (**Nuevo**) |
| A.2-10 | `Confirmar nueva contraseña` + ojo | `D-Pass` | calcado |
| A.2-11 | `Las contraseñas no coinciden` / `coinciden` | `D-Pass` | calcado (mensaje verde) |
| A.2-12 | Error del formulario | `D-Pass` | omitido como frame propio: es `FormField State=error`, ya en el kit |
| A.2-13 | `Cancelar` | `D-Pass` | calcado |
| A.2-14 | `Guardar cambios` | `D-Pass` | sustituido por `Guardar contraseña` (la etiqueta genérica no dice qué se guarda) |
| A.2-15 | Bloque `Autenticación de dos factores (2FA)` | `P-Seg`, `M-Seg` | sustituido por `Autenticación en dos pasos` (castellano, sin la sigla) |
| A.2-16 | `Desactivar` | `C-2FA` | sustituido por `ConfirmDialog Variant=destructive`: hoy se ejecuta sin confirmar |
| A.2-17 | `Configurar` | `D-2FA` | calcado (abre el diálogo real) |
| A.2-18 | Aviso verde «está activada» | `P-Seg` | sustituido por el badge `Activa` en la fila |
| A.2-19 | Aviso amarillo «no está configurada» | `P-Seg` | sustituido por el badge `Inactiva` + botón `Activar` en la fila |
| A.2-20 | Bloque `Códigos de respaldo` | `P-Seg`, `M-Seg`, `D-Códigos` | calcado + «Quedan 7 sin usar» (**Nuevo**) |
| A.2-21 | `Regenerar` | `P-Seg`, `D-Códigos` | calcado |
| A.2-22 | Modal `Códigos de respaldo` | `D-Códigos` | sustituido por `Dialog` del kit; los códigos son reales y guardados, no `Math.random()` |
| A.2-23 | `Cerrar` | `D-Códigos` | sustituido por `Listo` + `Copiar` y `Descargar` (**Nuevo**) |
| A.2-24 | Modal `Configurar autenticación de dos factores` | `D-2FA` | sustituido por `Dialog` del kit |
| A.2-25 | Instrucción del QR | `D-2FA` | calcado, ampliada con 1Password |
| A.2-26 | `QR Code Placeholder` | `D-2FA` | **no se calca**: se dibuja el QR real de Supabase Auth + la clave en texto |
| A.2-27 | Campo `Ingresa el código de verificación` | `D-2FA` | sustituido por seis casillas de un dígito |
| A.2-28 | `Cancelar` | `D-2FA` | calcado |
| A.2-29 | `Verificar` (sin `onClick`) | `D-2FA` | **no se calca**: se dibuja `Verificar y activar` funcional |
| A.2-30 | Toast contraseña actualizada | `T-Perfil` #3 | calcado |
| A.2-31 | Toasts de alta de 2FA | `T-Perfil` #6 | calcado |
| A.2-32 | Toasts de baja de 2FA | `T-Perfil` | omitido: misma plantilla que #31, sin variante propia |
| A.2-33 | Toasts de códigos de respaldo | `D-Códigos` | sustituido: el resultado se ve en el propio diálogo |

### A.3 Sesiones y dispositivos — 22 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| A.3-1 | Cabecera `Sesiones de dispositivos` | `P-Ses` | calcado como `FormSection` |
| A.3-2 | Esqueleto de 3 filas | `P-Carg` | sustituido por `Skeleton` del kit |
| A.3-3 | `No hay sesiones activas` | `P-Vacío` (patrón) | sustituido por `EmptyState Variant=empty` (hoy es un `Alert`) |
| A.3-4 | Icono por tipo de dispositivo | `P-Ses` | calcado |
| A.3-5 | Nombre del dispositivo | `P-Ses` | calcado |
| A.3-6 | Badge `Actual` | `P-Ses` | sustituido por `Este dispositivo` (marca · contorno), más claro |
| A.3-7 | Badge `Confiable` | `P-Ses` | calcado (éxito · suave, según `SISTEMA-BADGES.md`) |
| A.3-8 | `{device_type} • ubicación` | `P-Ses` | sustituido: se añaden navegador y sistema operativo, que ya están en `user_devices` |
| A.3-9 | `Última actividad: {fecha}` | `P-Ses` | calcado, con la zona horaria de la organización |
| A.3-10 | `Renombrar` | `P-Ses` | calcado |
| A.3-11 | `Confiar` / `Quitar confianza` | `P-Ses` | calcado |
| A.3-12 | `Desconectar` | `P-Ses` | calcado |
| A.3-13 | Paginación propia de 5 en 5 | `P-Ses` | sustituido por la paginación única del kit (`Pagination Layout=full`) |
| A.3-14 | Aviso `Múltiples sesiones activas` | `P-Ses` | calcado, con el texto corregido: desconectar cierra la sesión de Auth |
| A.3-15 | `Desconectar todos los otros dispositivos` | `C-Otras` | sustituido por `Cerrar las demás` + `ConfirmDialog` (hoy no confirma) |
| A.3-16 | Diálogo `Desconectar dispositivo` | `C-Otras` (misma plantilla) | omitido como frame aparte: es el mismo `ConfirmDialog` con otro texto |
| A.3-17 | `Cancelar` | `C-Otras` | calcado |
| A.3-18 | `Desconectar dispositivo` | `C-Otras` | calcado |
| A.3-19 | Diálogo `Renombrar dispositivo` | — | omitido: `QuickCreateDialog` del kit con un `FormField`; no aporta nada dibujarlo |
| A.3-20 | `Nombre del dispositivo` | — | ídem #19 |
| A.3-21 | `Cancelar` / `Guardar` | — | ídem #19 |
| A.3-22 | Toasts de dispositivo | `T-Perfil` #4 | calcado, con acción `Deshacer` (**Nuevo**) |

### A.4 Organización por defecto — 8 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| A.4-1 | Cabecera | `P-Org` | calcado |
| A.4-2 | Tarjeta de organización clicable | `P-Org` | sustituido: la tarjeta deja de guardar al primer clic; hay un botón `Usar por defecto` |
| A.4-3 | Logo / icono | `P-Org` | calcado (`OrgAvatar` del kit) |
| A.4-4 | Nombre de la organización | `P-Org` | calcado |
| A.4-5 | `{org.slug}` | `P-Org` | sustituido por el rol y las sucursales: el slug llega vacío (page.tsx:239-242) |
| A.4-6 | Check de la seleccionada | `P-Org` | sustituido por el badge `Predeterminada` |
| A.4-7 | Vacío «No pertenece a ninguna organización» | `P-Vacío`, `M-Vacío` | sustituido por `EmptyState` con acción |
| A.4-8 | Toasts del cambio | `T-Perfil` | omitido: misma plantilla de éxito/error ya dibujada |

### A.5 Preferencias de notificación — 12 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| A.5-1 | Esqueleto | `P-Carg` | sustituido por `Skeleton` del kit |
| A.5-2 | Cabecera | `P-Pref` | calcado dentro del bloque «Preferencias» |
| A.5-3 | `Canales de notificación` | `P-Pref` | calcado |
| A.5-4 | Toggle `Correo electrónico` | `P-Pref` | calcado (`Switch` del kit) |
| A.5-5 | Toggle `Notificaciones push` | `P-Pref` | calcado |
| A.5-6 | Toggle `WhatsApp` | `P-Pref` | calcado |
| A.5-7 | `Modo No molestar` | `P-Pref` | calcado |
| A.5-8 | Toggle `Activar modo No molestar` | `P-Pref` | calcado, con el horario resumido en la descripción |
| A.5-9 | `Hora de inicio` | `P-Pref` | sustituido: el horario se muestra en la fila y se edita al desplegarla |
| A.5-10 | `Hora de fin` | `P-Pref` | ídem #9 |
| A.5-11 | `Guardar preferencias` | `P-Pref` | omitido: los interruptores guardan al cambiar, con toast; no hay botón |
| A.5-12 | Toasts de preferencias | `T-Perfil` | omitido: misma plantilla de éxito/error ya dibujada |

**Nuevo** en el mismo bloque: `Tema` (Claro/Oscuro/Sistema) y `Zona horaria`.

### A.6 Roles asignados — 11 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| A.6-1 | Cabecera `Roles asignados` | `P-Org` | calcado, fundida con la organización por defecto |
| A.6-2 | Cabecera de organización con logo | `P-Org` | calcado |
| A.6-3 | Enlace a `/org/{slug}` | — | omitido: el slug llega vacío (§A.10.24); el enlace no funciona hoy |
| A.6-4 | Fila de rol | `P-Org` | sustituido por el badge del rol dentro de la tarjeta de organización |
| A.6-5 | Badge de sucursal por rol | `P-Org` | sustituido por `BranchBadge`: hoy nunca se pinta (page.tsx:185-186) |
| A.6-6 | Vacío de roles | `P-Vacío` | sustituido por `EmptyState` con acción |
| A.6-7 | `Sucursales asignadas` | `P-Org` y la cabecera de perfil | sustituido: las sucursales suben a la cabecera y se repiten por organización |
| A.6-8 | Fila de sucursal + `Org. ID: {id}` | `P-Org` | sustituido por `BranchBadge`; el id crudo no se muestra |
| A.6-9 | Badge `Activa` / `Inactiva` | `P-Org` | calcado (éxito / neutro) |
| A.6-10 | Vacío de sucursales | `P-Vacío` | sustituido por `EmptyState` |
| A.6-11 | `Gestionar sucursales` (solo admin) | — | omitido: hoy el rol se deduce del nombre (§A.10.20); el enlace vive en Organización |

**Nuevo**: bloque `Permisos efectivos` con los permisos resueltos en el servidor.

### A.7 Panel de Vendedor — 7 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| A.7-1 a A.7-7 | Cabecera, avisos `Ya eres vendedor` / `Conviértete en vendedor`, `Abrir Panel de Vendedor`, `Activar cuenta de vendedor`, error inline y toasts | `P-Listo` (ítem de navegación), `M-Listo` | omitido: el flujo es del portal de vendedores, no cambia en esta tanda y su único problema (tokens en la URL, §A.10.27) es de código, no de diseño. El ítem de navegación sí se calca |

### A.8 Eliminar cuenta — 12 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| A.8-1 | Cabecera | `P-Listo` (navegación) | calcado como ítem de navegación en rojo |
| A.8-2 | Bloque `Zona de peligro` + 4 consecuencias | — | omitido: no cambia respecto a hoy; el flujo ya usa `AlertDialog` del kit y cuatro llaves |
| A.8-3 a A.8-11 | `Eliminar mi cuenta`, diálogo de confirmación, `Contraseña`, nombre del perfil, nombre de la organización, `ELIMINAR`, error, `Cancelar`, `Eliminar permanentemente` | — | omitido con el mismo motivo. Lo que hay que arreglar es de código: `deletion_requested_at` no existe (§A.10.8) |
| A.8-12 | Toast de solicitud registrada | `T-Perfil` | omitido: misma plantilla de éxito ya dibujada |

### A.9 Bloque de sesión del header — 24 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| A.9-1 a A.9-7 | Menú móvil, `BranchSelectorWrapper`, `GlobalSearch`, botón de GO Assistant, botón de tema, campana, `TrialBanner` y `EmailVerificationBanner` | `AppHeader` (instancia del kit en las 8 pantallas de escritorio) | calcado por instancia. El **botón de tema baja al perfil** (`P-Pref`), según la decisión de fidelidad «AppHeader sin perfil ni tema» |
| A.9-8 | Disparador del menú de cuenta | Sección «Sesión» de `02 Componentes` | omitido: ya diseñado; aquí solo se instancia el `AppHeader` |
| A.9-9 | Nombre · rol · correo del menú | `P-Listo` (cabecera) | sustituido: el perfil ahora muestra lo mismo en grande, con cargo y sucursales |
| A.9-10 | `Correo sin confirmar · Reenviar` | `P-Listo` (aviso ámbar) | **duplicado a propósito**: se mantiene en el header y se añade al perfil, junto al campo de correo |
| A.9-11 | `Facturación` | — | omitido: es de la organización, se queda en el header |
| A.9-12 | `Ver perfil` | — | omitido: es el enlace a esta pantalla |
| A.9-13 | `Configuración` | — | omitido del diseño, **anotado como defecto**: lleva a `/app/configuracion` en escritorio y a `/app/organizacion/informacion` en móvil (§A.10.28) |
| A.9-14 | `Notificaciones` | — | omitido: es de la organización, se queda en el header |
| A.9-15 | `Cerrar sesión` | `P-Listo`, `M-Listo` | **duplicado a propósito**: se añade al perfil, en la cabecera y al pie de la lista móvil |
| A.9-16 a A.9-23 | Hoja `Mi cuenta` de móvil y sus seis ítems | Sección «Móvil — sesión» de `03` | omitido: ya diseñado en esa sección; no se redibuja |
| A.9-24 | Tooltip del usuario con la barra lateral contraída | Sección «Escritorio — sesión» de `03` | omitido: ya diseñado |

---

## B. Cajas del POS

### B.1 Listado — 36 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| B.1-1 | Skeleton de carga | `CL-Carg` | sustituido por `Skeleton` + `DataTable State=loading` del kit |
| B.1-2 | `Cajas POS` + icono | `CL-Listo` y las 7 restantes | sustituido por `PageHeader Variant=list` (hoy es una cabecera a medida) |
| B.1-3 | Nombre de la organización | `CL-Listo` | calcado como subtítulo del `PageHeader` |
| B.1-4 | Reloj de la última recarga | `CL-Listo` | calcado como «Actualizado hace 1 min», con la zona horaria de la organización |
| B.1-5 | Badge `🟢 Mi Caja Abierta` / `🔴 Sin Caja` | `CL-Listo` (abierta), `CL-Vacío` (sin caja) | sustituido por `Badge` del kit con punto: los emojis quedan fuera del sistema |
| B.1-6 | `{n} abiertas` | `CL-Listo` | sustituido por el `StatCard` «Cajas abiertas» |
| B.1-7 | Botón de recargar | `CL-Listo` | calcado en el `PageHeader` |
| B.1-8 | `BranchBadge` | las 8 de escritorio y las 4 móviles | sustituido por el `BranchBadge` nuevo (el del inventario es fucsia, fuera del manual) |
| B.1-9 | Alerta de error | `CL-Error` | sustituido por `EmptyState Variant=error` con «Reintentar» |
| B.1-10 | Pestaña `Mi Caja` | `CL-Listo` (`SegmentedControl`) | calcado |
| B.1-11 | Pestaña `Cajas Abiertas` + conteo | `CL-Listo` | calcado |
| B.1-12 | Pestaña `Historial` | `CL-Listo` | calcado |
| B.1-13 | Vacío `No tienes caja abierta` | `CL-Vacío`, `CLM-Vacío` | sustituido por `EmptyState` con acción y atajo `F9` |
| B.1-14 | `Abrir Caja` | `CL-Vacío`, `I-Apertura` | calcado; el diálogo se instancia de «Cabecera y caja» |
| B.1-15 | `Registrar Movimiento` | `D-Movimiento` | calcado, con chips de conceptos frecuentes |
| B.1-16 | `Cerrar Caja` habilitado | `CL-Listo` (`PageHeader`), `I-Cierre` | calcado; el diálogo se instancia |
| B.1-17 | `Cerrar Caja` deshabilitado + tooltip | `CL-Otro` | **no se calca**: se sustituye por un estado con acción («Ver detalle» + «Avisar a Ana Ríos») |
| B.1-18 | Texto `Solo {cajero} o un administrador…` | `CL-Otro` | sustituido: pasa a ser el cuerpo del estado con acción |
| B.1-19 | `CashSummaryCard` | `CD-Resumen` | sustituido por los 4 `StatCard` + la tarjeta «Desglose de caja» del detalle |
| B.1-20 | `ReportGenerator` | `CD-Resumen` (botón `Reporte`) | sustituido: el reporte se lanza desde la cabecera, también en el detalle |
| B.1-21 | `MovimientosList` | `CD-Movs` | sustituido por la pestaña «Movimientos» del detalle, con paginación |
| B.1-22 | Vacío `No hay cajas abiertas en esta sucursal` | `CL-Vacío` | sustituido: el texto decía «esta sucursal» y la consulta es de toda la organización |
| B.1-23 | Tarjeta de caja abierta (cajero + badge) | `CLM-Listo` | sustituido por `DataTable Layout=cards` en móvil; en escritorio va como fila de tabla |
| B.1-24 | Cuatro datos de la tarjeta | `CLM-Listo` | calcado |
| B.1-25 | `Ver detalle` | `CL-Listo` (icono de ojo), `CLM-Listo` | calcado |
| B.1-26 | `Ver detalle` bloqueado por cierre ciego | `CL-Ciego`, `CLM-Ciego` | **no se calca**: el detalle se abre y solo se ocultan los tres importes |
| B.1-27 | `Historial de Sesiones` | `CL-Listo` | calcado como la tabla principal |
| B.1-28 | `TableSkeleton` | `CL-Carg` | sustituido por `DataTable State=loading` |
| B.1-29 | Vacío `No hay sesiones registradas` | `CL-Vacío` | sustituido por `EmptyState` con acción |
| B.1-30 | Tabla de 10 columnas | `CL-Listo` | calcado con la retícula del kit. **Sustituido el set `DataTable Layout=table, State=ready`**: sus celdas son de producto (miniatura, precio, stock) y no admiten texto de caja |
| B.1-31 | Badge `Abierta` / `Cerrada` | `CL-Listo` | calcado (éxito / neutro) |
| B.1-32 | `***` en cierre ciego | `CL-Ciego` | sustituido por el badge `Oculto`: `***` se lee como un error de renderizado |
| B.1-33 | Ojo / candado por fila | `CL-Ciego` | sustituido: el candado desaparece; el aviso de cierre ciego explica el modo |
| B.1-34 | `SessionsPagination` | las 8 tablas de cajas | sustituido por la paginación única del kit (`Pagination Layout=full`) |
| B.1-35 | Toast de caja abierta | `CL-Toasts` #1 | calcado |
| B.1-36 | Toast de caja cerrada | `CL-Toasts` #2 | calcado, con acción `Ver reporte` (**Nuevo**) |

**Nuevo** en el listado: 4 `StatCard`, `SearchBar`, `FilterButton` + `FilterPanel`
(`CL-Filtros`, `CLM-Filtros`), badge `Pendiente de sincronizar` y aviso de resumen parcial
(`CL-Offline`), y `ConfirmDialog` al cerrar la caja de otro siendo administrador (`CL-Confirm`).

### B.2 Detalle — 37 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| B.2-1 | `UUID de sesión inválido` | `CD-NoExiste` | sustituido por `EmptyState`: hoy es un texto rojo suelto |
| B.2-2 | Skeleton de carga | `CD-Carg` | sustituido por `Skeleton` del kit |
| B.2-3 | Vacío `Sesión no encontrada` | `CD-NoExiste` | sustituido por `EmptyState` con acción |
| B.2-4 | Botón atrás | `CD-Resumen` | sustituido por las migas de pan del `PageHeader` |
| B.2-5 | `Sesión #{id}` | `CD-Resumen` y las 7 restantes | calcado |
| B.2-6 | Badge `Abierta` / `Cerrada` | `CD-Resumen` | calcado |
| B.2-7 | `Abierta: … \| Cerrada: …` | `CD-Resumen` | calcado como subtítulo |
| B.2-8 | `Actualizar` | `CD-Resumen` | calcado |
| B.2-9 | `Arqueo` | `CD-Arq` (botón `Nuevo arqueo`) | calcado, con atajo |
| B.2-10 | `Movimiento` | `CD-Movs` (botón `Nuevo movimiento`) | calcado, con atajo |
| B.2-11 | `Cerrar Caja` (sin comprobar permiso) | `CD-Movs`, `CD-Arq` | sustituido: un solo botón y solo cuando el permiso lo permite; el disparador del diálogo desaparece |
| B.2-12 | `Monto Inicial` | `CD-Resumen` | calcado (`StatCard`) |
| B.2-13 | `Ventas Efectivo` | `CD-Resumen` | calcado |
| B.2-14 | `Monto Esperado` | `CD-Resumen` | calcado |
| B.2-15 | `Cierre Ciego` + `No visible para cajeros` | `CD-Ciego` | sustituido por `StatCard` con valor `Oculto` + un aviso con salida |
| B.2-16 | `Diferencia` | `CD-Resumen` | calcado |
| B.2-17 | `Diferencia` oculta | `CD-Ciego` | sustituido como #15 |
| B.2-18 | 4 pestañas con conteo | `CD-Resumen` y las 3 de pestaña | calcado. **Nuevo en el kit**: `SegmentedControl` solo tiene `Items=2` y `Items=3`; hace falta `Items=4` |
| B.2-19 | `Información de la Sesión` | `CD-Resumen` | calcado + `Cajero que cerró` y `Modo de cajas` (**Nuevos**) |
| B.2-20 | `Desglose de Caja` (12 filas) | `CD-Resumen` | calcado, con la cascada completa |
| B.2-21 | Aviso de cierre ciego en el desglose | `CD-Ciego` | sustituido por el badge `Oculto` en las tres filas |
| B.2-22 | `Monto Contado` + `Diferencia` | `CD-Resumen` | calcado |
| B.2-23 | `Pagos por Método` + `Total` | `CD-Resumen` | calcado, con la nota del defecto de la caja global (§B.14.4) |
| B.2-24 | Vacío `No hay pagos registrados` | `CD-Resumen` (nota) | sustituido por la anotación: hoy sale siempre con caja global |
| B.2-25 | `Nuevo Movimiento` | `CD-Movs` | calcado |
| B.2-26 | Tabla de movimientos | `CD-Movs` | calcado + columna `Registró` (**Nuevo**) y paginación del kit |
| B.2-27 | Vacío de movimientos | `CL-Vacío` (patrón) | omitido como frame propio: mismo `EmptyState` ya dibujado |
| B.2-28 | `Nuevo Arqueo` | `CD-Arq` | calcado |
| B.2-29 | Tabla de arqueos | `CD-Arq` | calcado + columnas `Contó` y `Verificó` (**Nuevo**) |
| B.2-30 | Badges `Apertura` / `Parcial` / `Cierre` | `CD-Arq` | calcado, con los tonos de `SISTEMA-BADGES.md` |
| B.2-31 | Vacío de arqueos | `CL-Vacío` (patrón) | omitido: mismo `EmptyState` |
| B.2-32 | Tabla de ventas | `CD-Ventas` | calcado + columnas `Cliente` y `Método` (**Nuevo**: ya vienen en la consulta) |
| B.2-33 | Badges de estado y de pago de la venta | `CD-Ventas` | calcado, con los tonos del sistema |
| B.2-34 | Icono de recibo por fila | `CD-Ventas` | calcado |
| B.2-35 | Vacío de ventas | `CL-Vacío` (patrón) | omitido: mismo `EmptyState` |
| B.2-36 | `CierreCajaDialog` controlado | `I-Cierre`, `I-CierreCiego` | calcado por **instancia** de «Cabecera y caja»; el segundo botón desaparece |
| B.2-37 | Toasts del detalle | `CL-Toasts` | calcado |

### B.3 Nuevo arqueo — 20 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| B.3-1 | Skeleton | `CA-ArqCarg` | sustituido por `Skeleton` del kit |
| B.3-2 | Vacío `Sesión cerrada` | `CA-ArqCerrada` | sustituido por `EmptyState Variant=forbidden` con dos salidas |
| B.3-3 | Botón atrás | `CA-Arqueo` | sustituido por las migas del `PageHeader` |
| B.3-4 | `Nuevo Arqueo` + `Sesión #{id}` | `CA-Arqueo`, `CAM-Arqueo` | calcado |
| B.3-5 | Badge `Cierre Ciego` | `CA-ArqCiego` | calcado |
| B.3-6 | Select `Tipo de Arqueo` | `CA-Arqueo` | sustituido por `SegmentedControl Items=3`: son tres opciones fijas |
| B.3-7 | `Limpiar` | `CA-Arqueo` | sustituido por `Limpiar todo` (borra billetes, monedas y métodos, no solo billetes) |
| B.3-8 | 7 campos de billetes + subtotal | `CA-Arqueo`, `CAM-Arqueo` | calcado; las denominaciones salen de la moneda de la organización |
| B.3-9 | 5 campos de monedas + subtotal | `CA-Arqueo` | calcado, con el mismo criterio |
| B.3-10 | `Total Efectivo` | `CA-Arqueo` | calcado en el panel de resumen |
| B.3-11 | `Otros Métodos de Pago` | `CA-Arqueo` | calcado |
| B.3-12 | Un importe por método + `Esperado:` | `CA-Arqueo`, `CA-ArqCiego` | calcado; en cierre ciego el esperado no aparece |
| B.3-13 | `Total Otros Métodos` | `CA-Arqueo` | calcado en el resumen |
| B.3-14 | `Notas` | `CA-Arqueo` | calcado; obligatorio cuando hay diferencia (**Nuevo**) |
| B.3-15 | Panel `Resumen` | `CA-Arqueo`, `CAM-Arqueo` | calcado |
| B.3-16 | `Diferencia` + `Sobrante` / `Faltante` | `CA-Arqueo` | calcado |
| B.3-17 | Aviso de cierre ciego | `CA-ArqCiego` | calcado |
| B.3-18 | Esperado oculto | `CA-ArqCiego` | sustituido por el badge `Oculto` |
| B.3-19 | `Guardar Arqueo` | `CA-Arqueo`, `C-ArqueoDif` | calcado + `ConfirmDialog` cuando la diferencia no es cero (**Nuevo**) |
| B.3-20 | Toasts del arqueo | `T-Arqueo` #1 y #2 | calcado; el segundo es el del cierre ciego, sin diferencia |

**Nuevo**: aviso de que un arqueo de tipo «Cierre» no cierra la caja (§B.14.28).

### B.4 Nuevo movimiento — 13 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| B.4-1 | Skeleton | `CA-ArqCarg` (patrón) | omitido como frame propio: mismo esqueleto ya dibujado |
| B.4-2 | Vacío `Sesión cerrada` | `CA-ArqCerrada` (patrón) | omitido: mismo `EmptyState` con otro texto |
| B.4-3 | Botón atrás | `CA-Mov` | sustituido por las migas del `PageHeader` |
| B.4-4 | `Nuevo Movimiento` + `Sesión #{id}` | `CA-Mov`, `CAM-Mov` | calcado |
| B.4-5 | Radio `Ingreso` / `Egreso` | `CA-Mov`, `CAM-Mov`, `D-Movimiento` | calcado como dos tarjetas grandes |
| B.4-6 | Select `Concepto` (5 o 6 opciones) | `CA-Mov`, `D-Movimiento` | sustituido: un solo catálogo para toda la app; en el diálogo son chips |
| B.4-7 | `Especificar concepto` | `D-Movimiento` (`Otro…`) | sustituido: el campo libre solo aparece al elegir `Otro…` |
| B.4-8 | `Monto` con `$` cableado | `CA-Mov`, `CAM-Mov` | sustituido por `NumberInput Affix=prefix` con la moneda de la organización |
| B.4-9 | Vista previa `+{x}` / `−{x}` | `CA-Mov` | sustituido por el bloque `Efecto en la caja` (**Nuevo**) |
| B.4-10 | `Notas (opcional)` | `CA-Mov`, `D-Movimiento` | calcado |
| B.4-11 | `Cancelar` | `CA-Mov` | calcado |
| B.4-12 | `Guardar Movimiento` | `CA-Mov` | calcado |
| B.4-13 | Toasts de validación y resultado | `CA-MovError`, `T-Arqueo` #3 a #5 | sustituido: la validación pasa a los campos (`FormField State=error`) y a un resumen arriba |

**Nuevo**: `Número de soporte` y `Efecto en la caja`.

### B.5 Los tres diálogos y las dos tarjetas — 64 controles

| # | Control | Frame | Estado |
|---|---|---|---|
| B.5-A1 a B.5-A13 | `AperturaCajaDialog`: disparador, modal, sucursal, cajero, fecha y hora, alcance `Esta sucursal` / `Todas las sucursales`, aviso de caja global, tarjeta `Mi caja en {sucursal}`, `Monto Inicial *`, equivalencia, `Notas (Opcional)`, aviso `Importante`, `Cancelar`, `Abrir Caja` | `I-Apertura`, `I-AperturaUser` | calcado por **instancia** de la Sección «Cabecera y caja». Los tres frames se convirtieron en componentes para poder instanciarlos sin redibujarlos |
| B.5-C1 a B.5-C20 | `CierreCajaDialog`: disparador, modal, esqueleto, `Resumen de Movimientos`, ingresos/ventas/recibos/egresos por método, `Monto esperado`, `Movimientos de la Sesion`, `Arqueo por Método de Pago`, `Contado real`, `Diferencia`, totales, `Observaciones del Cierre`, aviso ámbar, `Cancelar`, `Cerrar Caja` | `I-Cierre`, `I-CierreCiego` | calcado por **instancia**. El disparador propio (§B.14.1) se omite: el botón vive en la cabecera |
| B.5-M1 a B.5-M12 | `MovimientosDialog`: disparador, modal, pestañas `Ingreso`/`Egreso`, 6 conceptos por pestaña, campo libre, `Monto *`, equivalencia, `Observaciones (Opcional)`, `Cancelar`, `Registrar Ingreso/Egreso` | `D-Movimiento` | sustituido: los seis botones pasan a `Chip Variant=filter` y el campo libre solo aparece con `Otro…` (hoy aparece siempre, §B.14.21) |
| B.5-S1 a B.5-S14 | `CashSummaryCard`: `Resumen de Caja`, badge, fechas, fichas de cajero y sucursal, 9 KPI, desgloses por método, `Total Esperado`, `Monto Contado`, `Diferencia`, `📈 Sobrante` / `📉 Faltante`, `Observaciones` | `CD-Resumen`, `CDM-Listo` | sustituido por los 4 `StatCard` + `Desglose de caja` + `Pagos por método` del detalle; los emojis salen del sistema de badges |
| B.5-L1 a B.5-L4 | `MovimientosList`: cabecera con totales, esqueleto, vacío, fila de movimiento | `CD-Movs`, `CDM-Movs` | sustituido por la pestaña «Movimientos» con tabla y paginación |
| B.5-R1 a B.5-R5 | `ReportGenerator`: `Generar Reporte`, texto, `Reporte Hoja Carta`, `Reporte POS 80mm`, consejo | `CD-Resumen` (botón `Reporte`), `CDM-Listo` | sustituido por un solo botón con menú, disponible también en el detalle (hoy solo en «Mi Caja») |

---

## Resumen

| | Perfil | Cajas | Total |
|---|---|---|---|
| Controles de la auditoría | 177 | 170 | **347** |
| Calcados | 72 | 74 | **146** |
| Sustituidos por un componente del kit o por un estado con acción | 57 | 71 | **128** |
| Omitidos con motivo | 48 | 25 | **73** |
| Elementos **Nuevos** añadidos | 14 | 17 | **31** |
| Frames dibujados | 23 | 39 | **62** |

Los 73 «omitidos» se reparten en tres motivos, todos anotados fila a fila: ya están diseñados en
otra Sección del archivo (24), son la misma plantilla de un frame ya dibujado y no aportan una
variante distinta (33), o el control no cambia en esta tanda y su problema es de código, no de
diseño (16).

## Verificación

- Solapes entre frames de primer nivel dentro de las 4 secciones nuevas: **0**.
- Solapes entre secciones en `03 Navegación y shell` y `05 POS y ventas`: **0**.
- Desbordes (hijos fuera de su frame de 1440 o de 390): **0**.
- Instancias rotas en las 4 secciones nuevas: **0** de 3.231 (830 en «Perfil de usuario» y
  2.401 en las tres de cajas).
- Todos los colores y espaciados salen de las variables de `01 Sistema`; ningún hex suelto.
- Tipografía: Inter 400 / 500 / 600 en todos los textos.

## Capturas

`docs/design/figma/18-perfil-00-seccion.png` · `18-perfil-01-datos-personales.png` ·
`18-perfil-02-seguridad.png` · `18-perfil-03-preferencias.png` · `18-perfil-04-sesiones.png` ·
`18-perfil-05-organizacion-roles.png` · `18-perfil-06-dialogo-2fa.png` ·
`18-perfil-07-movil.png` · `18-cajas-00-listado-seccion.png` · `18-cajas-01-listado.png` ·
`18-cajas-02-listado-cierre-ciego.png` · `18-cajas-03-listado-caja-de-otro.png` ·
`18-cajas-04-listado-movil.png` · `18-cajas-05-detalle-seccion.png` ·
`18-cajas-06-detalle-resumen.png` · `18-cajas-07-detalle-movimientos.png` ·
`18-cajas-08-arqueo-seccion.png` · `18-cajas-09-arqueo.png` · `18-cajas-10-movimiento.png` ·
`18-cajas-11-arqueo-movil.png`
