# Plan · Marcación con varios métodos y dispositivos

- **Fecha:** 2026-11-16.
- **Estado:** **aprobado por el dueño el 2026-11-16, con los ajustes de §12** (decisiones D1–D14 y reglas R1–R3). La fase M0 se puede empezar a codificar con este documento. El diseño sigue en Figma.
- **Encargo del dueño (2026-11-16):** «Quiero que mejoremos esa página vieja [Marcación de RR. HH.] con el nuevo diseño en Figma y le demos completamente funcionamiento. La marcación no siempre se va a poder manual, debería manejar diferentes dispositivos: huella, QR, reconocimiento facial, NFC, etc.»
- **Pedido adicional del mismo día:** «Contextualizar asistencia con la página de marcación: si la marcación el admin la puso por QR, que aparezca así, como aparece en /app/inicio. No quiero que dañes lo que ya tenemos construido.»
- **Diseño:** Figma `EAvjINVRnlzFM70GVoWXgl`, página «20 Recursos humanos», secciones 20.26 a 20.32 (x = 24000). Capturas en `docs/design/figma/98-hrm-marcacion-*.png`.
- **Parte de:** `PLAN-GESTION-HUMANA.md` (fase 2) y `ADR-002-jornadas-asistencia-ausencias.md` §2, que dejó la biometría «para una fase posterior».

---

## 1. En una página

1. **Hoy se marca de dos formas, las dos por el servidor:** desde el celular con la ubicación de la sede y con el QR de la sede. Todo entra por `fn_hr_marcar` a `attendance_events`, y de ahí lo leen Asistencia, las novedades y la nómina. Eso **no cambia**.
2. **Se suman:** etiqueta NFC en la sede (el celular la lee), kiosco en una tablet (QR que cambia cada 30 s y es de un solo uso, PIN, carné NFC; la tablet **solo toma la foto de evidencia**), lector de carnés en un computador con GO Admin Escritorio, y relojes comerciales de huella o rostro (ZKTeco y Hikvision primero, por adaptadores para sumar otras marcas). **El rostro y la huella los compara el reloj, nunca la tablet ni GO Admin.** La marca manual con motivo y aprobación sigue siendo la salida de emergencia.
3. **Un solo camino.** Todas las formas terminan en el mismo núcleo que hoy usa `fn_hr_marcar` (se extrae a una función interna). Los relojes dejan cada evento en una bandeja (`hr_clock_raw_events`) que lo deduplica, lo enlaza con la persona y lo pasa al núcleo. Marcación no guarda marcas propias: **Asistencia lee las mismas filas de `attendance_events`** (regla 7 de `CLAUDE.md`).
4. **La marca original nunca se edita (R1).** Toda corrección es un ajuste aparte, con motivo y aprobación, como ya hace Asistencia › Ajustes.
5. **La biometría no entra a nuestra base (Ley 1581).** GO Admin recibe solo «usuario 3 del reloj X marcó a las 6:02». Se pide autorización expresa, voluntaria y revocable, siempre con alternativa (PIN, carné, QR).
6. **La sede manda, con excepciones temporales.** Cada sede activa sus métodos. A una persona se le pueden quitar métodos, y RR. HH. puede darle otro por un rango de fechas con motivo y registro de quién lo aprobó.
7. **El empleado ve y reclama (R2).** En Mi asistencia ve cada marca con método y hora y puede reclamarla; el reclamo congela la foto de evidencia hasta cerrar el caso.
8. **Sin bloqueo por plan.** Kiosco y relojes en todos los planes; queda preparado (apagado) un posible límite por número de equipos.

---

## 2. Lo que ya existe (verificado el 2026-11-16 en `taqjemqjtumhwptchcxk` y en el código)

| Pieza | Estado | Qué hacemos con ella |
|---|---|---|
| `attendance_events` | 0 filas. `source` (CHECK: `app`, `qr`, `biometric`, `nfc`, `rfid`, `manual`, `auto`), `time_clock_id`, `geo`, `geo_validated`, `device_info`, `photo_path`, `work_date`, `work_mode`, `is_manual_entry`. Triggers `trg_attendance_events_validar` (antes de insertar **y de actualizar**) y `trg_attendance_event_process`. RLS: **UPDATE y DELETE permitidos a `hr.attendance.manage`**. | Se reutiliza. Columnas nuevas y opcionales (§6). **R1:** se cierran UPDATE y DELETE (§6.3). |
| `time_clocks` | 0 filas. `type` (CHECK: `app`, `qr_static`, `qr_dynamic`, `biometric`, `nfc`, `rfid`, `manual`), `code` único por organización, `branch_id`, `geo_fence`, `require_geo_validation`, `settings`, `current_qr_token`, `qr_token_expires_at`, `is_active`. | **Es la tabla de dispositivos.** No se crea otra. Columnas nuevas (§6). |
| `fn_hr_marcar(actor, org, datos, ip, ua)` | Solo `service_role`. Valida pertenencia, vínculo, mecanismo, QR en la base, cerca virtual con consentimiento, ubicación contra la sede (`branches.features->>'radio_marcacion_m'`, 150 m), marca sin señal con hora del servidor, alterna entrada y salida, rechaza el doble toque en 60 s. | Misma firma y comportamiento. Su parte final se extrae a `fn_hr_registrar_marca`. |
| `timesheet_adjustments` + `fn_hr_ajuste_solicitar` + `fn_hr_ajustes_aplicar_interno` | Lo usa Asistencia › Ajustes («Registrar marca manual», `DialogoAjuste.tsx`) y «Solicitar un ajuste» de Mi asistencia. El ajuste nace pendiente (`novedad_asistencia`), se aprueba y al aplicarse **inserta una marca nueva** (`source='manual'`, `is_manual_entry`, `applied_event_id`); no toca la original. El empleado puede pedirlo para sí. | Es el mecanismo de R1 y R2. Se amplía para apuntar a una marca concreta y para excluirla del cálculo sin borrarla (§6). |
| `fn_hr_marcacion_manual` + `POST /api/hrm/marcacion/manual` | Inserta una marca con hora elegida **sin aprobación** (solo exige `hr.attendance.manage`). | Contradice R1 y D14: pasa a crear un ajuste (`fn_hr_ajuste_solicitar`). |
| `src/lib/services/attendanceService.ts` (`create`) | Lo usa la página vieja `/app/hrm/marcacion`: inserta en `attendance_events` desde el navegador. | Se retira con la página vieja. |
| `fn_hr_aprobacion_plan` | Sin regla configurada: **jefe directo**; si no tiene jefe o es quien pide, RR. HH. Con regla: los pasos de la regla. | Base de R3 (§12). |
| `fn_hr_jornada_lista_nomina` | Un día pasa a «lista para nómina» solo si está clasificado con la última versión y **sin novedades pendientes**. Las horas extra no aprobadas no van a nómina. | Base de R3. |
| `fn_hr_reloj_qr_rotar`, `fn_hr_marcacion_estado`, `fn_hr_mi_asistencia`, `fn_hr_asistencia_hoy` | Existen. «Cómo» en `fn_hr_asistencia_hoy`: `remoto`, `qr`, `manual` o ubicación, según `source`. | Se amplía el `CASE` (§8). |
| `hr_attendance_settings` | 0 filas. `mecanismos` con CHECK `app`, `qr`, `sin_marcacion`. | Sigue por persona para **quitar** métodos. Las excepciones temporales van aparte (§6). |
| `hr_geo_consents` | Solo inserción. | Modelo para `hr_marcacion_consents`. |
| `marcacion.ts`, `marcarLogica.ts`, `marcacionService.server.ts`, `src/app/api/hrm/marcacion/**` | Validación pura, reglas de pantalla, servicio y rutas. | Se amplían, no se reescriben. |
| `MarcarTurno.tsx` (/marcar), `TurnoInicio.tsx`, `MiAsistencia.tsx`, `src/components/hrm/asistencia/**` | En producción (fase 2). | Se contextualizan (§8). Nada se quita. |
| `src/app/app/hrm/marcacion/**`, `src/components/hrm/marcacion/**`, `src/app/qr-display/[deviceId]` | Pantallas viejas. | Se reemplazan por 20.26–20.29 en la misma ruta. |
| `gym_access_devices`, `customer_biometrics` (Gimnasio) | 0 filas. `customer_biometrics.template_data` **guarda la plantilla en la base**. | No se reutilizan. Ver riesgo R6. |
| `electron/` y `mobile/` (Capacitor) | Existen. | Escritorio: «modo lector» USB y puente de red local. Móvil: base del kiosco y lectura NFC en iPhone. |

---

## 3. Los métodos

| Método | Cómo funciona | Qué se compra | Decisión |
|---|---|---|---|
| **Celular con ubicación** (existe) | Marca en el celular; el servidor compara la ubicación con la sede. **La ubicación solo se toma en el momento de marcar; nunca se rastrea** (se dice en la pantalla de permiso, 20.30.9). | Nada. | Se queda. |
| **QR de la sede** (se mejora) | Una pantalla o el kiosco muestra un QR que **cambia cada 30 s y sirve una sola vez**: lleva el punto, el paso de tiempo y un código firmado con la clave del punto (TOTP). El servidor anota cada código usado y rechaza el segundo uso (`qr_ya_usado`). Según la sede, pide **además la ubicación o el PIN** (20.30.10). | Nada. | M0. Reemplaza el token de 5 min en la base. |
| **Etiqueta NFC en la sede** | El celular lee la etiqueta y abre GO Admin con el código del punto. NTAG 424 DNA (código distinto en cada lectura, no clonable) donde haya riesgo; NTAG213/215 con ubicación obligatoria en el resto. Web NFC solo en Android con Chrome; en iPhone, la app. | Etiquetas. | M0. |
| **Carné NFC o QR en el kiosco o en un lector USB** | Se guarda solo el hash del UID. Foto de evidencia. | Carnés; tablet con NFC o lector USB. | M1. |
| **Kiosco con PIN** | PIN de 6 dígitos, guardado con hash, **nunca visible**. Tras 5 intentos fallidos, **bloqueo de 15 min o desbloqueo por un supervisor** (20.29.8). Foto de evidencia. | Tablet. | M1. |
| **Rostro** | **Lo compara el reloj facial** (cámara infrarroja, prueba de vida). La tablet del kiosco **no reconoce rostros: solo toma la foto de evidencia**, y lo dice en pantalla (20.29.1, 20.29.3). | Reloj facial. | M2. |
| **Huella** | La compara el lector; envía «usuario 3, 6:02». | Lector de huella. | M2. |
| **Marca manual con aprobación** (existe) | Es un ajuste con motivo que se aprueba (R1). | Nada. | Siempre activa, no se apaga. |

**Remoto** sigue siendo de la persona (modalidad `remoto` o `hibrido`).

---

## 4. Integración con hardware comercial

### 4.1 Lo que se usa en Colombia y cómo habla

| Marca | Cómo envía las marcas | Lo que importa |
|---|---|---|
| **ZKTeco** (MB160, MB20, SpeedFace, ProFace, iClock) | **PUSH / ADMS**: el equipo llama a un servidor configurado (dirección y puerto). Rutas fijas: `GET /iclock/cdata?SN=…` (saludo y opciones), `POST /iclock/cdata?SN=…&table=ATTLOG` (marcas: usuario, fecha y hora, estado, modo de verificación), `GET /iclock/getrequest` (órdenes pendientes) y `POST /iclock/devicecmd` (respuestas). | Se identifica por su número de serie; el protocolo no trae clave. La ruta es fija y va en la raíz del dominio. Muchos modelos viejos solo hablan HTTP. Guarda y reintenta sin red. |
| **Hikvision** (DS-K1T343, DS-K1T671, MinMoe) | **ISAPI**: (a) «HTTP listening»: envía cada evento a una URL configurada; (b) consulta en la red local: `POST /ISAPI/AccessControl/AcsEvent?format=json` (Digest). | La URL admite la clave en la ruta. No todos los firmwares traen HTTPS ni escucha. |
| **Anviz** | CrossChex Cloud (API). | Por adaptador, si un cliente lo pide. |
| **Suprema** | BioStar 2 (API local) o BioStar Air (nube). | Ídem. |
| **Genéricos sin red** | Archivo por USB. | Importación manual que entra como ajustes con aprobación. |

### 4.2 Adaptadores (conexión genérica)

- Una interfaz común en `src/lib/hrm/dispositivos/adaptadores/` (puro, probado con Jest): `identificar(petición) → reloj`, `leerEventos(cuerpo) → EventoReloj[]` (usuario del equipo, hora del equipo, modo de verificación, tipo si lo trae), `responder(resultado)`, `ordenes(reloj) → texto` (crear usuario, borrar plantilla, ajustar hora) y `leerRespuestaOrden`.
- `zkteco-adms.ts` y `hikvision-isapi.ts` son los dos primeros. Sumar Anviz o Suprema es escribir un adaptador más; el receptor, la bandeja y el núcleo no cambian.
- Los adaptadores **nunca** leen ni reenvían plantillas biométricas, aunque el equipo las ofrezca (ZKTeco `FINGERTMP`, `BIODATA`; Hikvision `FaceDataRecord`): se descartan al leer y quedan prohibidas en la prueba del adaptador.

### 4.3 Receptor y clave por equipo

- **Subdominio propio** (`marcacion.<dominio>`), con HTTPS. **Cada equipo tiene su propia clave**, revocable y regenerable si se pierde o se cambia el equipo:
  - **ZKTeco:** la clave va **en el nombre del servidor** que se escribe en el equipo: `<clave>.marcacion.<dominio>` (DNS y certificado comodín). El receptor exige que la clave del host corresponda al número de serie registrado. Revocar la clave corta al equipo aunque alguien copie la serie.
  - **Hikvision:** `https://marcacion.<dominio>/hik/<clave>`.
  - **Kiosco y lector de escritorio:** clave que reciben al vincularse (20.29.7), guardada en el almacenamiento seguro.
- Las claves se guardan con hash (`time_clocks.secret_hash`) y se muestran una sola vez al crearlas o regenerarlas.
- Ninguna ruta usa sesión de usuario: **la organización sale del equipo registrado, nunca del cuerpo** (la versión para equipos de la regla 5). Límite de peticiones por equipo y por IP.
- Los equipos que solo hablan HTTP, o que solo se consultan en la red local, van por el **puente de GO Admin Escritorio** (M3): Vercel redirige HTTP a HTTPS y los equipos viejos no siguen la redirección.

### 4.4 Personas del equipo ↔ empleados

- `hr_clock_device_users`: cada usuario del equipo, enlazado a un vínculo o marcado «no enlazar». Lo único que guardamos del equipo es **su número de usuario, la hora y el equipo** (D4).
- Al conectar se proponen enlaces por documento, por nombre o a mano (20.28.5). Las marcas de un usuario sin enlazar **quedan en espera**.
- GO Admin puede crear el usuario en el equipo para que la persona registre allí su huella o su rostro, y ordena borrarla al retirar la autorización. Nunca la descarga.

### 4.5 Hora, marcas sin conexión, repetidas e idempotencia

- **Hora.** Del celular, siempre la del servidor. De un equipo, la del equipo **si su desfase es de 2 min o menos** (se mide en cada conexión, `clock_offset_s`). Si es mayor: la marca entra **a revisión** y **se alerta al administrador** en En vivo (aviso arriba, 20.26.1) y en el detalle del equipo (20.28.6), con «Sincronizar la hora». Marcas de más de 7 días o en el futuro (más de 2 min) también a revisión.
- **Sin conexión.** Equipo y kiosco guardan y reenvían; la marca conserva su hora y se ve «Llegó al reconectar».
- **Idempotencia.** Cada evento lleva una clave única: en el reloj (`time_clock_id`, usuario, hora del equipo, tipo); en el kiosco, un `id_local` (UUID generado en la tablet) único por equipo. Reenviar el mismo lote no duplica. La respuesta al equipo («OK: n») se da después de guardar en la bandeja, en la misma transacción.

---

## 5. Seguridad y ley

### 5.1 Ley colombiana

- Los biométricos son **datos sensibles** (Ley 1581 de 2012, art. 5); su tratamiento exige autorización explícita (art. 6).
- La autorización debe ser previa, expresa e informada, con la finalidad, y advertir que **es facultativa**: no se condiciona el empleo (Decreto 1377 de 2013, art. 6, compilado en el Decreto 1074 de 2015). Cada método biométrico tiene alternativa.
- **Nunca huellas ni rostros en GO Admin.** Solo el número de usuario del equipo, la hora y el equipo. Al retirar la autorización se ordena borrar la plantilla en el equipo.
- Cada autorización y cada retiro queda en `hr_marcacion_consents` (solo inserción, con versión del texto, IP y agente). El empleado descarga lo que aceptó.
- La organización cliente incluye la marcación (biometría y foto) en su política de tratamiento y, si le aplica, en el Registro Nacional de Bases de Datos. GO Admin entrega el texto base y **el letrero** (§5.2).
- Ubicación: solo al marcar, con autorización, **nunca para rastrear**.

### 5.2 Foto de evidencia

- La toma el kiosco en cada marca con PIN o carné. Es dato personal.
- **Requiere autorización expresa del empleado** (`hr_marcacion_consents`, tipo `foto_evidencia`) y **aviso con letrero en la sede**. Métodos por sede trae el recordatorio y una **plantilla de letrero para imprimir** (20.27.1 y 20.27.10). Sin esa autorización, el kiosco no toma la foto y la marca queda «Sin foto» (no se rechaza).
- Bucket privado `hr-marcacion-evidencia`. **Retención: 30 días por defecto, configurable de 7 a 90.** **Retención por caso:** si la marca está a revisión o tiene un reclamo o un ajuste abierto, la foto no se borra hasta cerrar el caso (`photo_hold_until` nulo mientras el caso siga abierto; la tarea de borrado lo respeta).
- La ven solo `hr.attendance.view` y quien revisa el caso; cada vista queda en `hr_access_log`.

### 5.3 Antifraude

| Riesgo | Medida |
|---|---|
| Marcar por otro | Biometría del reloj con autorización; foto de evidencia; alerta si un mismo celular marca a dos personas en 10 min (`user_devices`). |
| Foto o reenvío del QR | QR de 30 s y **de un solo uso**; según la sede, además ubicación o PIN. |
| Ubicación falsa | Detección de ubicación simulada en la app (Android); en sedes con problemas, exigir QR o NFC. |
| Etiqueta NFC clonada | NTAG 424 DNA, o NTAG215 con ubicación obligatoria. |
| Reloj del equipo adulterado | Desfase medido en cada conexión; más de 2 min → a revisión y alerta. |
| Equipo suplantado o perdido | Clave propia por equipo, en el host o en la ruta; revocable; HTTPS; límites por equipo e IP; IP de la última conexión visible. |
| PIN | 6 dígitos, hash con `crypt()` (pgcrypto), nunca visible; 5 intentos → bloqueo de 15 min o desbloqueo por un supervisor con `hr.attendance.manage` (queda registrado). |
| Corregir marcas en silencio | **R1**: la marca no se edita ni se borra; correcciones como ajuste con motivo y aprobación. |
| Intentos rechazados | `hr_marcacion_intentos` (90 días); se ven en En vivo («Rechazada: fuera de la sede»). |

---

## 6. Modelo de datos (aditivo)

Todo con `organization_id`, RLS por pertenencia con `IN (SELECT …)` y `(select auth.uid())`, funciones `SECURITY DEFINER` con `search_path` fijo y sin `EXECUTE` para `anon`. Columnas nuevas nulas o con valor por defecto. Ningún `DROP` de tablas ni columnas.

### 6.1 Tablas

| Objeto | Cambio | Para qué |
|---|---|---|
| `time_clocks` | Columnas: `kind` (CHECK: `terminal_huella`, `terminal_facial`, `kiosco`, `lector_escritorio`, `etiqueta_nfc`, `pantalla_qr`), `vendor`, `adapter` (`zkteco_adms`, `hikvision_isapi`, `kiosco`, `escritorio`, `ninguno`), `model`, `serial_number` (único por organización), `secret_hash`, `secret_rotated_at`, `secret_revoked_at`, `qr_secret` (cifrado), `last_seen_at`, `last_ip`, `firmware`, `clock_offset_s`, `paired_at`, `disabled_at`. `type` queda como legado. | Dispositivos. |
| `hr_branch_clock_methods` (nueva) | `organization_id`, `branch_id`, `method` (`celular_ubicacion`, `qr`, `nfc_etiqueta`, `carne`, `pin`, `rostro`, `huella`), `enabled`, `rules` (jsonb: radio, segundos del QR, «pedir además» `ubicacion`/`pin`, intentos y minutos de bloqueo, días de retención de la foto), `updated_by`, `updated_at`. PK (`branch_id`, `method`). | Métodos por sede (20.27). |
| `hr_attendance_settings.mecanismos` | Se amplía el CHECK con los métodos nuevos (tabla con 0 filas; actualizar `enums.ts`, guardarraíl 9). | **Quitar** métodos a una persona. |
| `hr_clock_method_exceptions` (nueva) | `organization_id`, `employment_id`, `method` (que se habilita), `valid_from`, `valid_to` (fechas de la sede), `reason` (obligatorio), `approval_instance_id`, `approved_by`, `approved_at`, `revoked_at`, `revoked_by`. CHECK `valid_to >= valid_from`; tope de 90 días por excepción. | **Excepción temporal** aprobada por RR. HH. (D14, 20.27.11). Solo cuenta si está aprobada y vigente. |
| `hr_clock_device_users` (nueva) | `organization_id`, `time_clock_id`, `device_user_id`, `device_name`, `employment_id` (nulo), `status` (`enlazado`, `sin_enlazar`, `ignorado`), `enrolled` (jsonb: huella, rostro, tarjeta: solo sí o no). Único (`time_clock_id`, `device_user_id`). | Mapeo (20.28.5, 20.28.7). |
| `hr_clock_raw_events` (nueva) | `organization_id`, `time_clock_id`, `device_user_id`, `device_time`, `local_id` (kiosco), `received_at`, `verify_mode`, `raw` (jsonb sin plantillas), `status` (`aceptada`, `repetida`, `en_espera`, `a_revision`, `rechazada`), `reason`, `attendance_event_id`. Únicos: (`time_clock_id`, `device_user_id`, `device_time`, `event_kind`) y (`time_clock_id`, `local_id`). Retención 180 días. | Bandeja idempotente y registro de eventos (20.28.8). |
| `hr_qr_codes_used` (nueva) | `time_clock_id`, `time_step`, `used_at`, `attendance_event_id`. PK (`time_clock_id`, `time_step`). Se purga a las 24 h. | QR de un solo uso (D9). |
| `hr_credentials` (nueva) | `organization_id`, `employment_id`, `kind` (`pin`, `carne_nfc`, `carne_qr`), `secret_hash`, `active`, `failed_attempts`, `locked_until`, `unlocked_by`, `created_by`, `revoked_at`. | PIN y carnés (D11). |
| `hr_marcacion_consents` (nueva) | Como `hr_geo_consents`: `granted`, `kinds` (`huella`, `rostro`, `foto_evidencia`), `policy_version`, `ip`, `user_agent`. Solo inserción. | Autorizaciones (20.32). |
| `hr_marcacion_intentos` (nueva) | `organization_id`, `employment_id` (nulo), `time_clock_id`, `method`, `reason`, `created_at`. 90 días. | Antifraude. |
| `attendance_events` | Columnas: `method` (CHECK con los métodos de arriba más `remoto` y `manual`), `device_time`, `raw_event_id`, `photo_expires_at`, `photo_hold` (bool, por defecto `false`). | «Cómo» exacto; retención por caso. |
| `timesheet_adjustments` | Columnas: `attendance_event_id` (la marca reclamada o corregida), `origin` (`gestor`, `empleado_reclamo`, `kiosco`, `dispositivo`), y un valor más en el uso: `adjustment_type = 'excluir_marca'` (la marca queda en la base pero el motor la ignora). | R1 y R2 sobre el mecanismo que ya existe. |
| Bucket `hr-marcacion-evidencia` | Privado, `org/<id>/…`. | Foto de evidencia. |
| Límite por plan | Clave `max_dispositivos_marcacion` en las características del plan, **nula = sin límite**, leída por `fn_hr_dispositivo_vincular`. Nace nula en todos los planes. | D13: preparado, sin activar. |
| Permisos | `hr.attendance.view` (ver) y `hr.attendance.manage` (métodos, dispositivos, PIN, carnés, desbloqueos, excepciones). | Sin permisos nuevos. |

### 6.2 Funciones

| Función | Quién | Qué hace |
|---|---|---|
| `fn_hr_registrar_marca` (interna) | Solo las de abajo | Lo que hoy hacen las últimas líneas de `fn_hr_marcar`: tipo por alternancia, duplicado en 60 s, `insert`. Recibe vínculo validado, método, punto y hora. |
| `fn_hr_metodo_permitido(emp, metodo, fecha)` | Interna | Método activo en la sede, no quitado a la persona, **o** con excepción aprobada y vigente. |
| `fn_hr_marcar` | `service_role` | **Misma firma.** Agrega `nfc` y el QR por TOTP de un solo uso (+ ubicación o PIN según la sede), valida con `fn_hr_metodo_permitido`, registra intentos rechazados y termina en `fn_hr_registrar_marca`. |
| `fn_hr_marcar_dispositivo(reloj, lote)` | `service_role` | Bandeja, deduplicación, enlace, autorización biométrica vigente, desfase de hora, `fn_hr_registrar_marca`. |
| `fn_hr_marcar_kiosco(reloj, lote)` | `service_role` | Lote con `local_id` (idempotente); identifica por PIN o carné; bloqueo; foto según autorización; `fn_hr_registrar_marca`. |
| `fn_hr_pin_desbloquear(actor, org, emp)` | `service_role` + `hr.attendance.manage` | Desbloqueo por supervisor, con registro. |
| `fn_hr_excepcion_solicitar` / aprobación | `service_role` | Crea la excepción con motivo; la aprueba RR. HH. por el motor de aprobaciones (tipo nuevo `excepcion_marcacion`). |
| `fn_hr_dispositivo_vincular`, `…_regenerar_clave`, `…_revocar_clave`, `…_enlazar_usuario` | `service_role` + `hr.attendance.manage` | Alta, clave y mapeo. |
| `fn_hr_marcacion_manual` | — | **Cambia:** crea un ajuste pendiente vía `fn_hr_ajuste_solicitar` (deja de insertar directo). |
| Tarea `hrm-fotos-evidencia` | `pg_cron` | Borra fotos vencidas salvo `photo_hold` o caso abierto. |

### 6.3 R1 · La marca original no se edita

- Hoy el flujo de la app ya cumple (los ajustes insertan una marca nueva), pero **la base no lo garantiza**: RLS permite UPDATE y DELETE a `hr.attendance.manage`, `fn_hr_marcacion_manual` inserta sin aprobación y la página vieja inserta desde el navegador.
- Se cierra en M0: se quitan las políticas `attendance_events_update` y `attendance_events_delete`; un trigger `BEFORE UPDATE OR DELETE` rechaza cualquier cambio salvo las columnas técnicas que escribe la base (`work_date`, `photo_*`, `raw_event_id`), y solo desde funciones `SECURITY DEFINER`. «Invalidar» una marca pasa a ser un ajuste `excluir_marca` con motivo y aprobación (20.26.2).

---

## 7. Flujos

```
Celular (ubicación · QR · NFC)  ──POST /api/hrm/marcacion──────────────►  fn_hr_marcar ─────────────┐
Kiosco / lector de escritorio   ──POST /api/hrm/kiosco/marcas (lote)───►  fn_hr_marcar_kiosco ──────┤
Reloj ZKTeco (ADMS)             ──<clave>.marcacion…/iclock/cdata───────►  fn_hr_marcar_dispositivo ─┤──► fn_hr_registrar_marca ──► attendance_events ──► Asistencia, novedades, nómina
Reloj Hikvision (escucha)       ──marcacion…/hik/<clave>───────────────►  fn_hr_marcar_dispositivo ─┘
Correcciones y reclamos         ──fn_hr_ajuste_solicitar → aprobación → marca nueva o exclusión (la original no cambia)
```

- **Alta de un reloj (20.28.3–20.28.5):** tipo → datos y número de serie → qué escribir en el equipo (con su clave) → primera conexión → enlazar personas.
- **Kiosco (20.29):** vínculo con código de 6 caracteres → QR, carné y PIN → foto de evidencia si hay autorización → confirma. Sin internet guarda con `id_local` y sincroniza sin duplicar.
- **Reclamo (R2, 20.31.5–20.31.7):** el empleado abre la marca en Mi asistencia → «Reclamar» → elige qué está mal y explica → nace un ajuste `origen = empleado_reclamo` ligado a la marca → la foto queda retenida → el jefe aprueba o rechaza → si se aprueba, se agrega o excluye una marca; la original queda.

---

## 8. Contexto en Asistencia e Inicio — sin romper lo que existe

**Nada se quita.** Campos nuevos en las respuestas, ramas nuevas, acciones nuevas en menús existentes.

| Pieza existente | Cambio | Por qué no rompe |
|---|---|---|
| `fn_hr_marcacion_estado` | Agrega `metodos_sede`, `metodo_preferido`, `excepciones_vigentes` y `pide_ademas` (`ubicacion`/`pin`). | Campos nuevos. |
| `marcarLogica.ts` | Cruza persona, sede y excepciones; agrega `nfc`. Un solo método → sin selector (20.30.6). Sede de reloj → aviso (20.30.8). Sin `metodos_sede` se comporta como hoy. | Pruebas actuales intactas, casos nuevos. |
| `MarcarTurno.tsx` | Pestaña NFC; `?metodo=`; tras el QR, PIN si la sede lo pide (20.30.10). El texto de permiso de ubicación dice que nunca se rastrea (20.30.9). | Ubicación, QR, remoto y sin señal no cambian. |
| `TurnoInicio.tsx`, `MiAsistencia.tsx` | Botón con el método de la sede y `?metodo=`. En Mi asistencia cada marca muestra método y hora y tiene «Reclamar» (R2). | Mismos estados y enlaces; «Solicitar un ajuste» se conserva. |
| `fn_hr_asistencia_hoy`, `fn_hr_mi_asistencia` | «Cómo» usa `attendance_events.method` cuando existe; si no, lo de hoy. `fn_hr_mi_asistencia` devuelve además `evento_id` y el reclamo abierto. | Las marcas viejas se ven igual. |
| `asistenciaLogica.ts` (`ComoMarco`), `VistaHoy.tsx` | `ComoMarco` suma `nfc`, `carne`, `pin`, `rostro`, `huella`; columna con icono + texto; claves nuevas en los 4 idiomas. | El tipo crece. |
| `AsistenciaPage.tsx` | «Registrar marca manual» igual. El «⋯» suma, si aplican a la sede: QR, kiosco, métodos y dispositivos. Aviso si un equipo está sin conexión o desfasado. | Acciones nuevas en un menú que existe. |

**Navegación:** pestaña «Marcación» entre Turnos y Asistencia, menú lateral (`AlarmClockCheck`), buscador, asistente y enlaces; `/app/hrm/marcacion/dispositivos`, `/nuevo` y `/[id]/editar` redirigen; `/qr-display/[deviceId]` redirige a la Pantalla de QR.

---

## 9. Pantallas (Figma, página «20 Recursos humanos»)

Todas con instancias del kit, colores con variables y textos con estilos. Iconos nuevos en «02 Componentes › Iconos»: `Fingerprint`, `ScanFace`, `Nfc`, `KeyRound`, `MonitorSmartphone`, `TabletSmartphone`, `PenLine`, `FilePenLine`.

| Sección | Qué muestra |
|---|---|
| 20.26 En vivo | Indicadores, «Hoy por método», avisos de equipo sin conexión y **desfasado**, tabla de marcas; menú de la fila con «Corregir con un ajuste»; celular; estados. |
| 20.27 Métodos por sede | Métodos con reglas (QR de un solo uso + ubicación o PIN; PIN con bloqueo de 15 min), **foto de evidencia y letrero**, **excepciones temporales**; cambios sin guardar; **nueva excepción**; **letrero para imprimir**; celular; estados. |
| 20.28 Dispositivos | Lista, menú, alta en 3 pasos (clave en el host), detalle con **alerta de desfase** y clave **revocable**, personas, eventos, confirmaciones, celular, estados. |
| 20.29 Kiosco | Inicio (texto: «esta tablet no reconoce rostros»), PIN, **foto de evidencia** (20.29.3), marca registrada, PIN incorrecto, sin internet, vincular, **PIN bloqueado** (20.29.8) y **desbloqueo por un supervisor** (20.29.9). |
| 20.30 Celular | Métodos de la sede, NFC, NFC no disponible, marca con NFC, etiqueta de otra sede, solo QR, Inicio contextual, **permiso de ubicación** (20.30.9), **QR + PIN** (20.30.10), **QR ya usado** (20.30.11). |
| 20.31 Asistencia e Inicio | Método en «Cómo», menú «⋯», celular, Mi asistencia con método y **Reclamar**: menú de la marca (20.31.5), formulario (20.31.6), celular (20.31.7) y reclamo en revisión (20.31.8). |
| 20.32 Autorizaciones | Pedir (biometría y foto por separado), vigente, retirar, escritorio. |

---

## 10. Fases

| Fase | Qué entra | Compras | Pantallas |
|---|---|---|---|
| **M0 · Base, sin hardware** | Migraciones de §6 (salvo bandeja y adaptadores), **R1 en la base** (§6.3), `fn_hr_registrar_marca`, `fn_hr_metodo_permitido`, QR TOTP de 30 s y un solo uso (+ ubicación o PIN), Pantalla de QR, etiquetas NFC, métodos por sede, excepciones temporales, intentos rechazados, En vivo, contexto en Asistencia e Inicio, **reclamo del empleado (R2)**, `fn_hr_marcacion_manual` vía ajuste, retiro de las páginas viejas y de `attendanceService.create`. Pruebas: guardarraíles, `marcarLogica`, `marcacion.ts`, RLS con otra organización, QR reusado, UPDATE/DELETE rechazados. | Ninguna. | 20.26, 20.27, 20.28 (pantalla de QR y etiqueta), 20.30, 20.31 |
| **M1 · Kiosco** | App Capacitor en modo kiosco, vinculación, PIN y carnés, bloqueo y desbloqueo, foto con autorización y retención por caso, cola sin conexión idempotente, letrero, modo lector USB en Escritorio. | Tablet Android 10" con NFC; carnés; lector USB opcional. | 20.29, 20.28, 20.32 (foto) |
| **M2 · Relojes** | Adaptadores ZKTeco y Hikvision, subdominio con clave por equipo, bandeja, mapeo, órdenes al equipo, hora y alertas de desfase, registro de eventos, autorización biométrica. Lista pública de modelos probados. | Un reloj de prueba de cada marca. | 20.28 completo, 20.32 |
| **M3 · Opcional** | Puente de red local en Escritorio, Anviz o Suprema si un cliente lo pide, verificación SUN de NTAG 424 DNA. | Según el caso. | — |

---

## 11. Qué necesita comprar o configurar el dueño

- **M0:** nada. Opcional: etiquetas NFC (NTAG 424 DNA, aprox. COP 8.000–15.000 c/u; NTAG215, aprox. COP 1.000–3.000). Para M2 hará falta el subdominio con DNS comodín apuntado a Vercel.
- **M1 (piloto):** tablet Android de 10" con NFC y cámara frontal (aprox. COP 700.000–1.200.000), soporte de pared con candado, carnés NFC; opcional lector USB tipo ACR122U (aprox. COP 150.000–250.000).
- **M2 (piloto):** un reloj ZKTeco con ADMS sobre HTTPS y uno facial Hikvision con «HTTP listening» (aprox. COP 600.000–2.000.000 cada uno). Confirmar con el vendedor HTTPS y servidor en la nube.
- **Legal:** textos de autorización (biometría y foto) y letrero revisados por el abogado de la plataforma.

Precios aproximados del mercado colombiano a noviembre de 2026.

---

## 12. Decisiones del dueño (aprobadas el 2026-11-16)

| # | Decisión | Estado y texto final |
|---|---|---|
| D1 | Dónde vive Marcación | **Aprobada.** Pestaña propia del módulo, entre Turnos y Asistencia, en `/app/hrm/marcacion`. Le pasa las marcas a Asistencia **sin duplicar datos**: las dos leen `attendance_events`. |
| D2 | Marcas de hardware | **Aprobada.** ZKTeco (ADMS) y Hikvision (ISAPI) primero, sobre **adaptadores** (§4.2) para sumar otras marcas sin tocar el núcleo. |
| D3 | Rostro | **Aprobada.** **Lo compara el reloj.** La tablet del kiosco solo toma la foto de evidencia, y el kiosco lo dice con un texto visible para el empleado. |
| D4 | Datos biométricos | **Aprobada.** Nunca huellas ni rostros en GO Admin (Ley 1581): solo el número del empleado en el equipo, la hora y el equipo. |
| D5 | Foto de evidencia | **Aprobada.** 30 días por defecto, configurable de 7 a 90. **Retención por caso:** si la marca está a revisión o hay un reclamo, la foto no se borra hasta cerrar el caso. Requiere **autorización expresa** del empleado y **aviso con letrero** en la sede (plantilla para imprimir en Métodos por sede). |
| D6 | Hora del equipo | **Aprobada.** Desfase de 2 min o menos se acepta; si no, a revisión. **Alerta al administrador** cuando un equipo se desfasa, en En vivo y en el detalle del dispositivo. |
| D7 | Kiosco | **Aprobada.** App Capacitor en modo kiosco; guarda marcas sin internet y sincroniza después **sin duplicar** (idempotencia por `id_local`). |
| D8 | Receptor | **Aprobada.** Subdominio propio; **cada equipo con su propia clave**, revocable si se pierde o se cambia. |
| D9 | QR | **Aprobada.** Firmado, cambia cada 30 s y es **de un solo uso**; según la sede, combinado con la ubicación o con el PIN. |
| D10 | NFC y ubicación | **Aprobada.** NTAG 424 DNA donde haya riesgo; NTAG215 con ubicación obligatoria en el resto. La ubicación **solo se usa en el momento de marcar, nunca para rastrear**, y la pantalla de permiso lo dice. |
| D11 | PIN | **Aprobada.** 6 dígitos con hash, nunca visible; tras 5 intentos, **bloqueo de 15 minutos o desbloqueo por un supervisor** (pantalla y acción). |
| D12 | Modelos | **Aprobada.** Lista pública solo con modelos que GO Admin haya probado. |
| D13 | Planes | **Aprobada con cambio.** Kiosco y relojes en **todos los planes** (todos los planes tienen todos los módulos; lo que cambia es cuántos pueden estar encendidos). Sin bloqueo por plan; queda preparado un límite por número de equipos (`max_dispositivos_marcacion`), **sin activar**. |
| D14 | Sede y persona | **Aprobada con agregado.** La sede define los métodos y a una persona se le pueden quitar. **Excepción temporal** aprobada por RR. HH. (p. ej., no puede usar la huella por una lesión: se le habilita otro método por un rango de fechas), con registro de quién la aprobó, motivo y vigencia. |

### Reglas nuevas

| # | Regla | Cómo está hoy y qué falta |
|---|---|---|
| R1 | La marca original nunca se edita; las correcciones son un ajuste aparte con motivo y quién lo aprobó. | **Cumple en la app, no en la base.** Asistencia › Ajustes (`fn_hr_ajuste_solicitar` → aprobación → `fn_hr_ajustes_aplicar_interno`) inserta una marca nueva y deja la original. Pero: RLS permite UPDATE y DELETE a `hr.attendance.manage`; `fn_hr_marcacion_manual` (`POST /api/hrm/marcacion/manual`) inserta sin aprobación; y la página vieja inserta desde el navegador (`attendanceService.create`). Se cierra en M0 (§6.3). |
| R2 | El empleado ve sus marcas y reclama. | **Parcial.** Mi asistencia ya muestra las marcas con «Cómo» y tiene «Solicitar un ajuste» (el empleado puede pedirlo para sí). Falta: método exacto, «Reclamar» sobre una marca concreta (ajuste con `attendance_event_id` y `origen = empleado_reclamo`) y la retención de la foto mientras el caso esté abierto. M0. |
| R3 | Antes de pasar una novedad a nómina, el jefe la aprueba. | **Cumple con el plan por defecto, con dos salvedades.** Las novedades nacen pendientes y un día solo pasa a «lista para nómina» sin novedades pendientes (`fn_hr_jornada_lista_nomina`); nunca se aprueba por omisión. Sin regla configurada aprueba el **jefe directo**. Salvedades: (1) si la persona no tiene jefe (o el jefe es quien pide), aprueba RR. HH.; (2) una regla configurada en el motor puede no incluir al jefe. **Recomendación:** que el editor de reglas no permita quitar el paso «jefe directo» en `horas_extra` y `novedad_asistencia` cuando la persona tiene jefe; el respaldo de RR. HH. sin jefe se mantiene. |

---

## 13. Riesgos y pendientes

- **R1 · HTTP de equipos viejos.** Vercel fuerza HTTPS. Solo modelos probados con HTTPS, o el puente de Escritorio.
- **R2 · Protocolo por firmware.** Se prueba modelo por modelo (D12).
- **R3 · Web NFC** solo en Android con Chrome; en iPhone, la app.
- **R4 · Regla 5 para equipos.** Los receptores no tienen sesión; la organización sale del equipo registrado. Documentarlo en el guardarraíl de rutas.
- **R5 · CHECK de `mecanismos`.** Ampliarlo exige tocar `enums.ts` (guardarraíl 9).
- **R6 · Gimnasio guarda plantillas.** `customer_biometrics.template_data` (0 filas) choca con D4. Revisar aparte.
- **R7 · Carga.** El saludo de ZKTeco llega cada pocos segundos: responder sin tocar la base cuando no hay marcas (caché).
- **R8 · Datos del cliente.** El kiosco y el letrero muestran el nombre de la organización: es dato del cliente y no va al repositorio.
- **R9 · DNS comodín** para la clave en el host de ZKTeco: confirmar que Vercel emite el certificado comodín del subdominio.

---

## 14. Fuentes

- ZKTeco, «General Introduction of PUSH SDK Protocol»: https://cdn.tvc.mx/media/92189/General-Introduction-of-PUSH-SDK-Protocol.pdf
- Integraciones ADMS (`/iclock/cdata`, `/iclock/getrequest`, `/iclock/devicecmd`): https://packagist.org/packages/dewanlab/laravel-zkteco-adms-core · https://webkul.com/blog/erpnext-zkteco-attendance-integration/
- Hikvision ISAPI y modo escucha: https://github.com/Shaykhnazar/hikvision-isapi · https://tpp.hikvision.com/solutions/TimeAttendance-Integration · https://downloads.evtrack.com/website/docs/Hikvision_Integration_Note_Rev1.pdf
- Web NFC: https://developer.chrome.com/docs/capabilities/nfc · https://developer.mozilla.org/docs/Web/API/NDEFReader
- Ley 1581 de 2012 (arts. 5 y 6), Decreto 1377 de 2013 (art. 6), Decreto 1074 de 2015.
- Código y base del repositorio, consultados el 2026-11-16 (§2 y §12).
