# Plan · Marcación con varios métodos y dispositivos

- **Fecha:** 2026-11-16.
- **Estado:** propuesta para que el dueño la apruebe. No hay código ni migraciones: solo este plan y el diseño en Figma.
- **Encargo del dueño (2026-11-16):** «Quiero que mejoremos esa página vieja [Marcación de RR. HH.] con el nuevo diseño en Figma y le demos completamente funcionamiento. La marcación no siempre se va a poder manual, debería manejar diferentes dispositivos: huella, QR, reconocimiento facial, NFC, etc.»
- **Pedido adicional del mismo día:** «Contextualizar asistencia con la página de marcación: si la marcación el admin la puso por QR, que aparezca así, como aparece en /app/inicio. No quiero que dañes lo que ya tenemos construido.»
- **Diseño:** Figma `EAvjINVRnlzFM70GVoWXgl`, página «20 Recursos humanos», secciones 20.26 a 20.32 (x = 24000). Capturas en `docs/design/figma/98-hrm-marcacion-*.png`.
- **Parte de:** `PLAN-GESTION-HUMANA.md` (fase 2) y `ADR-002-jornadas-asistencia-ausencias.md` §2, que ya dejó la biometría «para una fase posterior».

---

## 1. En una página

1. **Hoy se marca de dos formas, las dos por el servidor:** desde el celular con la ubicación de la sede y con el QR de la sede. Todo entra por `fn_hr_marcar` a `attendance_events`, y de ahí lo leen Asistencia, las novedades y la nómina. Eso **no cambia**.
2. **Se suman cinco formas más:** etiqueta NFC en la sede (el celular la lee), kiosco en una tablet (QR que cambia, PIN, carné NFC y, más adelante, rostro), lector de carnés en un computador con GO Admin Escritorio, y terminales comerciales de huella o rostro (ZKTeco, Hikvision). La marca manual con motivo y aprobación sigue siendo la salida de emergencia.
3. **Un solo camino.** Todas las formas terminan en el mismo núcleo que hoy usa `fn_hr_marcar` (se extrae a una función interna). Los dispositivos no escriben en `attendance_events` por su cuenta: dejan cada evento en una bandeja (`hr_clock_raw_events`) que lo deduplica, lo enlaza con la persona y lo pasa al núcleo. Así no hay una segunda implementación (regla 7 de `CLAUDE.md`).
4. **La biometría no entra a nuestra base.** La huella y el rostro se quedan en el terminal o en la tablet; GO Admin recibe «el usuario 3 marcó a las 6:02». Se pide autorización expresa, voluntaria y revocable (Ley 1581 de 2012, Decreto 1377 de 2013), y quien no la da marca con PIN, carné o QR.
5. **La sede manda.** Cada sede activa sus métodos y reglas (20.27). Asistencia muestra con qué método se hizo cada marca, y el botón «Marcar» de Inicio y de Mi asistencia abre directamente el método de la sede (20.30, 20.31).
6. **Se puede empezar sin comprar nada** (fase M0: QR que cambia cada 30 s, pantalla de QR, métodos por sede, tablero en vivo y contexto en Asistencia e Inicio). El kiosco necesita una tablet; los terminales, el equipo.

---

## 2. Lo que ya existe (verificado el 2026-11-16 en `taqjemqjtumhwptchcxk` y en el código)

| Pieza | Estado | Qué hacemos con ella |
|---|---|---|
| `attendance_events` | 0 filas. Columnas `source` (CHECK: `app`, `qr`, `biometric`, `nfc`, `rfid`, `manual`, `auto`), `time_clock_id`, `geo`, `geo_validated`, `device_info` (jsonb), `photo_path`, `work_date`, `work_mode`, `is_manual_entry`. | Se reutiliza. Columnas nuevas y opcionales: `method`, `device_time`, `raw_event_id`, `photo_expires_at` (§6). |
| `time_clocks` | 0 filas. `type` (CHECK: `app`, `qr_static`, `qr_dynamic`, `biometric`, `nfc`, `rfid`, `manual`), `code` único por organización, `branch_id`, `geo_fence`, `require_geo_validation`, `settings`, `current_qr_token`, `qr_token_expires_at`, `is_active`. Solo la leen `hr.attendance.view` y `.manage`. | **Es la tabla de dispositivos.** No se crea otra. Se le agregan columnas (marca, modelo, serie, protocolo, clave, última conexión, desfase de hora). |
| `fn_hr_marcar(actor, org, datos, ip, ua)` | Solo `service_role`. Valida pertenencia, vínculo activo, mecanismo permitido, QR contra la base (token y vencimiento), cerca virtual con consentimiento, ubicación contra la sede (`branches.features->>'radio_marcacion_m'`, 150 m por defecto), marca sin señal con hora del servidor, alterna entrada y salida y rechaza el doble toque en 60 s. | Se conserva su firma y su comportamiento. Su parte final (decidir el tipo, deduplicar e insertar) se extrae a `fn_hr_registrar_marca` para que la usen también el kiosco y los dispositivos. |
| `fn_hr_marcacion_manual`, `fn_hr_reloj_qr_rotar`, `fn_hr_marcacion_estado`, `fn_hr_mi_asistencia`, `fn_hr_asistencia_hoy` | Existen. `fn_hr_asistencia_hoy` calcula «Cómo» con `remoto`, `qr`, `manual` y, si no, ubicación. | Se amplía el `CASE` de «Cómo» con los métodos nuevos (§8). |
| `hr_attendance_settings` | 0 filas. `mecanismos` con CHECK `app`, `qr`, `sin_marcacion`. | Sigue por persona. La sede define qué se ofrece; la persona solo puede restringir (§6). |
| `hr_geo_consents` | Solo inserción. | Modelo para `hr_biometric_consents`. |
| `src/lib/hrm/jornada/marcacion.ts`, `marcarLogica.ts`, `marcacionService.server.ts`, `src/app/api/hrm/marcacion/**` | Validación pura del cuerpo, reglas de la pantalla, servicio y rutas. | Se amplían (método `nfc`, `kiosco`), no se reescriben. |
| `src/components/marcar/MarcarTurno.tsx` (/marcar), `src/components/inicio/TurnoInicio.tsx`, `MiAsistencia.tsx`, `src/components/hrm/asistencia/**` | Pantallas de la fase 2 en producción. | Se contextualizan (§8). Nada se quita. |
| `src/app/app/hrm/marcacion/**` y `src/components/hrm/marcacion/**` | Pantallas viejas (lista de marcas, dispositivos, alta y edición, diálogo de QR) sobre `timeClocksService`. | Se reemplazan por 20.26–20.28 en la misma ruta. |
| `src/app/qr-display/[deviceId]` | Pantalla pública del QR. | La reemplaza la «Pantalla de QR» y el kiosco (20.29), con clave de dispositivo. |
| `gym_access_devices`, `customer_biometrics` (módulo Gimnasio) | 0 filas. `customer_biometrics.template_data` **guarda la plantilla biométrica en la base**. | No se reutilizan para empleados (otra finalidad y otro titular). Ver riesgo R6. |
| `electron/` (GO Admin Escritorio) y `mobile/` (Capacitor) | Existen. | Escritorio: «modo lector» de carnés y QR por USB y, más adelante, puente en la red local. Móvil: base del kiosco y de la lectura NFC en iPhone. |

---

## 3. Los métodos, uno por uno

| Método | Cómo funciona | Qué hay que comprar | A favor | En contra | Recomendación |
|---|---|---|---|---|---|
| **Celular con ubicación** (existe) | La persona marca en su celular; el servidor compara la ubicación con la sede. | Nada. | Cero costo. | La ubicación se puede falsear con apps; en interiores es imprecisa. | Se queda. En sedes con problemas, combinarlo con QR o NFC. |
| **QR de la sede** (existe, se mejora) | Una pantalla o el kiosco muestra un QR **que cambia cada 30 s**; la persona lo escanea desde «Marcar turno». El QR lleva el punto y un código firmado por tiempo (TOTP con la clave del punto), que el servidor valida. | Nada (una pantalla o tablet que ya tengan). | Una foto del código no sirve; la pantalla no necesita internet para generar el código. | Necesita que el celular tenga datos. | **Sí, en la fase M0.** Reemplaza el token guardado en la base cada 5 min (`fn_hr_reloj_qr_rotar`), que obliga a escribir en la base y no funciona sin conexión. |
| **Carné con QR** | El kiosco o el lector de escritorio lee el QR impreso en el carné. | Carnés impresos. | Barato. | Un carné se presta: necesita foto de evidencia. | Como variante del carné NFC, con foto. |
| **Etiqueta NFC en la sede** | Una etiqueta pegada en la entrada; el celular la lee y abre GO Admin con el código del punto. | Etiquetas. **NTAG 424 DNA** generan un código distinto en cada lectura (SUN) y no se pueden clonar; las NTAG213/215 son fijas y clonables. | Más rápido que el QR. | El navegador solo lee NFC en **Android con Chrome** (Web NFC); en iPhone hace falta la app GO Admin (Core NFC). | Fase M0 con NTAG 424 DNA donde haya riesgo; con NTAG215, exigir además la ubicación. 20.30.2–20.30.5. |
| **Carné NFC en el kiosco o en un lector** | La persona acerca su carné (13,56 MHz) a la tablet o a un lector USB en un computador. Se guarda solo el hash del UID. | Carnés NFC; tablet con NFC o lector USB (por ejemplo ACR122U). | Rápido, no depende del celular. | Un carné se presta: foto de evidencia obligatoria. | Fase M1. |
| **Kiosco con PIN** | La persona escribe su PIN de 6 dígitos en la tablet; se toma una foto de evidencia. | Tablet. | Respaldo universal para quien no tiene celular ni biometría. | Un PIN se comparte: foto de evidencia y bloqueo por intentos. | Fase M1. 20.29.2 y 20.29.5. |
| **Rostro en un terminal comercial** | El terminal (Hikvision, ZKTeco SpeedFace) reconoce a la persona con cámara infrarroja y prueba de vida, y envía la marca. | Terminal facial. | La prueba de vida de los terminales es mejor que la de una tablet. | Necesita autorización biométrica. | Fase M2. |
| **Rostro en la tablet** | Tras el carné o el PIN, la tablet compara el rostro con la plantilla guardada **en esa tablet** (1 a 1) y pide parpadear. | Tablet con buena cámara frontal. | Sin terminal extra. | La prueba de vida por software es más débil que la infrarroja. | Fase M3, opcional. En M1 el kiosco solo toma la foto de evidencia. 20.29.3. |
| **Huella en un terminal comercial** | El lector guarda la huella y envía «usuario 3, 6:02». | Lector de huella. | Barato y conocido en Colombia. | Necesita autorización biométrica; algunas personas no registran bien la huella. | Fase M2. |
| **Marca manual con aprobación** (existe) | RR. HH. o el jefe registra la hora con motivo; pasa por aprobación. | Nada. | Siempre disponible. | Es la puerta del fraude si se abusa. | Se queda, siempre activa, sin poderse apagar (20.27.1). |

**Remoto** sigue siendo de la persona (modalidad `remoto` o `hibrido` en `hr_attendance_settings`), no de la sede.

---

## 4. Integración con hardware comercial

### 4.1 Lo que se usa en Colombia y cómo habla

| Marca | Cómo envía las marcas | Lo que importa |
|---|---|---|
| **ZKTeco** (MB160, MB20, SpeedFace, ProFace, iClock) | **PUSH / ADMS**: el equipo hace peticiones HTTP a un servidor que se le configura (dirección y puerto). Rutas fijas: `GET /iclock/cdata?SN=…` (saludo y opciones), `POST /iclock/cdata?SN=…&table=ATTLOG` (marcas, una por línea: número de usuario, fecha y hora, estado, modo de verificación), `GET /iclock/getrequest` (el equipo pregunta si hay órdenes: crear usuario, cambiar la hora) y `POST /iclock/devicecmd` (respuesta a la orden). | El equipo **se identifica por su número de serie**, sin clave. Muchos modelos solo hablan HTTP (sin TLS); los recientes admiten HTTPS. La ruta `/iclock/...` es fija: hay que servirla en la raíz de un dominio. El equipo reintenta y guarda las marcas si no hay red. |
| **Hikvision** (DS-K1T343, DS-K1T671, MinMoe) | **ISAPI**: (a) «HTTP listening»: el equipo envía cada evento de control de acceso (`AcsEvent`) a una URL que se le configura; (b) consulta: un programa en la red local pide los eventos con `POST /ISAPI/AccessControl/AcsEvent?format=json` (autenticación Digest). | La URL de escucha admite un token en la ruta. No todos los firmwares traen HTTPS ni la opción de escucha; la consulta exige estar en la red de la sede. |
| **Anviz** | CrossChex Cloud (su nube, con API). | Requiere cuenta del cliente en la nube de Anviz. |
| **Suprema** | BioStar 2 (servidor local con API REST) o BioStar Air (nube). | Pensado para empresas grandes con su propio servidor. |
| **Genéricos sin red** | Exportan un archivo por USB. | Solo como importación manual, con aprobación. |

Fuentes en §14. Los detalles finos del protocolo cambian por firmware: antes de certificar un modelo hay que probarlo con el equipo real.

### 4.2 Ruta recomendada

1. **Receptor por protocolo, con el dispositivo registrado antes.**
   - ZKTeco: `https://marcacion.<dominio>/iclock/*` → reescrito a `src/app/api/hrm/dispositivos/zk/iclock/**`. Solo acepta números de serie registrados en `time_clocks`; los desconocidos se descartan y quedan en el registro de seguridad.
   - Hikvision: `https://marcacion.<dominio>/hik/<clave>` → `src/app/api/hrm/dispositivos/hik/[clave]`. La clave se guarda con hash.
   - Ninguno usa sesión de usuario. **La organización sale del dispositivo registrado, nunca del cuerpo** (es la versión para equipos de la regla 5 de `CLAUDE.md`). Límite de peticiones por equipo y por IP.
2. **Puente en GO Admin Escritorio** (fase M3) para equipos que solo hablan HTTP o solo se consultan en la red local: el computador de la sede lee el equipo (TCP 4370 de ZKTeco, ISAPI de Hikvision) y reenvía por HTTPS con la clave del puente. Vercel redirige HTTP a HTTPS y muchos equipos viejos no siguen la redirección: por eso los equipos solo-HTTP van por el puente.
3. **Kiosco y lector de escritorio** usan la API del kiosco (`/api/hrm/kiosco/*`) con la clave que reciben al vincularse (20.29.7). La tablet guarda la clave en el almacenamiento seguro del sistema.

### 4.3 Personas del equipo ↔ empleados

- Cada usuario del equipo (número y nombre corto) es una fila de `hr_clock_device_users`, enlazada a un vínculo (`employment_id`) o marcada «no enlazar».
- Al conectar un equipo se proponen enlaces por número de documento, por nombre o a mano (20.28.5). Las marcas de un usuario sin enlazar **quedan en espera**, no se pierden; al enlazarlo, se procesan.
- GO Admin puede **crear los usuarios en el equipo** (orden `DATA UPDATE USERINFO` en ZKTeco; `UserInfo/Record` en Hikvision) para que la persona registre su huella allí. Nunca descarga plantillas.

### 4.4 Hora, marcas sin conexión, repetidas e idempotencia

- **Hora.** Del celular nunca se usa la hora (ya es así). De un equipo sí, porque guarda marcas sin conexión: se usa la hora del equipo **si su desfase con el servidor es de 2 min o menos** (medido en cada conexión); si es mayor, la marca entra «a revisión» y se ordena al equipo sincronizar la hora. Marcas con más de 7 días o en el futuro (más de 2 min) entran a revisión.
- **Sin conexión.** El equipo y el kiosco guardan y reenvían. Al llegar, la marca conserva su hora y se ve como «Llegó al reconectar» (20.28.8).
- **Repetidas.** La bandeja tiene una clave única (`time_clock_id`, `device_user_id`, `device_time`, tipo). Reenviar el mismo lote no duplica nada. Además se aplica la regla actual de 60 s del núcleo.
- **Idempotencia.** La respuesta al equipo («OK: n») se da después de guardar en la bandeja, en la misma transacción; si se cae a la mitad, el equipo reenvía y la clave única absorbe lo repetido.

---

## 5. Seguridad y ley

### 5.1 Ley colombiana

- **Datos sensibles.** Los biométricos son datos sensibles (Ley 1581 de 2012, art. 5). Su tratamiento está prohibido salvo autorización explícita del titular (art. 6).
- **Autorización.** Debe ser previa, expresa e informada, decir la finalidad y advertir que **es facultativa**: no se puede obligar a nadie a darla ni condicionar el empleo (Decreto 1377 de 2013, art. 6, compilado en el Decreto 1074 de 2015). Por eso cada método biométrico tiene alternativa (PIN, carné, QR) y la pantalla lo dice (20.32.1).
- **Prueba.** Se guarda cada autorización y cada retiro, con la versión del texto, la IP y el agente, en una tabla de solo inserción (`hr_biometric_consents`). El empleado puede descargar lo que aceptó (20.32.2).
- **Finalidad y minimización.** Solo para registrar la jornada. **La plantilla biométrica nunca entra a nuestra base**: vive en el equipo. Al retirar la autorización se ordena al equipo borrarla.
- **Política de tratamiento.** La organización cliente debe incluir el control de asistencia biométrico en su política y, si le aplica, en el Registro Nacional de Bases de Datos de la SIC. GO Admin entrega un texto base; la responsabilidad de publicarlo es del cliente (es el responsable; GO Admin es encargado).
- **Ubicación.** Se mantiene lo de la fase 2: solo al marcar y con autorización.

### 5.2 Foto de evidencia

- La toma el kiosco en cada marca con PIN o carné. Es dato personal (la imagen permite identificar).
- Bucket privado `hr-marcacion-evidencia`, por organización. **Se borra a los 30 días** (tarea programada; configurable de 7 a 90). La ven solo `hr.attendance.view` y quien está revisando una novedad; cada vista queda en `hr_access_log`.

### 5.3 Antifraude

| Riesgo | Medida |
|---|---|
| Marcar por otro | Biometría con autorización; foto de evidencia en PIN y carné; alerta si el mismo celular marca a dos personas en 10 min (`user_devices`). |
| Foto del QR enviada por chat | QR que cambia cada 30 s, con ubicación opcional en la sede. |
| Ubicación falsa | En la app se detecta la ubicación simulada (Android); en sedes con problemas, exigir QR o NFC. |
| Etiqueta NFC clonada | NTAG 424 DNA (código distinto por lectura) o NTAG215 con ubicación obligatoria. |
| Reloj del equipo adulterado | Desfase medido en cada conexión; más de 2 min → a revisión y orden de sincronizar. |
| Equipo suplantado | Solo números de serie registrados; Hikvision y kiosco con clave (hash); HTTPS; límites por equipo e IP; IP de la última conexión visible (20.28.6). |
| PIN adivinado | 6 dígitos, hash con `crypt()` de pgcrypto, bloqueo tras 5 intentos por 10 min. |
| Abuso de la marca manual | Motivo obligatorio, aprobación y reporte de marcas manuales por persona. |
| Intentos rechazados | Se guardan en `hr_marcacion_intentos` (90 días) y aparecen en «En vivo» (fila «Rechazada: fuera de la sede»). Hoy `fn_hr_marcar` lanza el error y no deja rastro. |

---

## 6. Modelo de datos propuesto (aditivo)

Todo con `organization_id`, RLS por pertenencia con `IN (SELECT …)` y `(select auth.uid())` (sin `EXISTS` anidado), funciones `SECURITY DEFINER` con `search_path` fijo y sin `EXECUTE` para `anon`. Columnas nuevas, nulas o con valor por defecto. Ningún `DROP`.

| Objeto | Cambio | Para qué |
|---|---|---|
| `time_clocks` | Columnas: `kind` (nuevo CHECK: `terminal_huella`, `terminal_facial`, `kiosco`, `lector_escritorio`, `etiqueta_nfc`, `pantalla_qr`), `vendor`, `model`, `serial_number` (único por organización), `protocol` (`adms`, `isapi_push`, `isapi_pull`, `kiosco`, `escritorio`, `ninguno`), `secret_hash`, `qr_secret` (cifrado, para el TOTP), `last_seen_at`, `last_ip`, `firmware`, `clock_offset_s`, `paired_at`, `disabled_at`. | La tabla de dispositivos que ya existe. `type` queda como legado. |
| `hr_branch_clock_methods` (nueva) | `organization_id`, `branch_id`, `method` (`celular_ubicacion`, `qr`, `nfc_etiqueta`, `carne_nfc`, `pin`, `rostro`, `huella`), `enabled`, `rules` (jsonb: radio, foto, segundos del QR, intentos…), `updated_by`, `updated_at`. PK (`branch_id`, `method`). | Métodos por sede (20.27). El radio sigue leyéndose de `branches.features` hasta migrarlo. |
| `hr_attendance_settings.mecanismos` | Se amplía el CHECK con los métodos nuevos (solo agrega valores; tabla con 0 filas). Hay que actualizar `enums.ts` (guardarraíl 9). | La persona puede restringir lo que la sede permite, nunca ampliarlo. |
| `hr_clock_device_users` (nueva) | `organization_id`, `time_clock_id`, `device_user_id`, `device_name`, `employment_id` (nulo), `status` (`enlazado`, `sin_enlazar`, `ignorado`), `enrolled` (jsonb: huella, rostro, tarjeta), fechas. Único (`time_clock_id`, `device_user_id`). | Mapeo equipo ↔ persona (20.28.5, 20.28.7). |
| `hr_clock_raw_events` (nueva) | `organization_id`, `time_clock_id`, `device_user_id`, `device_time`, `received_at`, `verify_mode`, `raw` (jsonb), `status` (`aceptada`, `repetida`, `en_espera`, `a_revision`, `rechazada`), `reason`, `attendance_event_id`. Único (`time_clock_id`, `device_user_id`, `device_time`, `event_kind`). Retención 180 días. | Bandeja idempotente y registro de eventos (20.28.8). |
| `hr_credentials` (nueva) | `organization_id`, `employment_id`, `kind` (`pin`, `carne_nfc`, `carne_qr`), `secret_hash`, `active`, `created_by`, `revoked_at`. Único por organización para el hash del carné. | PIN y carnés del kiosco. |
| `hr_biometric_consents` (nueva) | Como `hr_geo_consents`: `granted`, `kinds` (`huella`, `rostro`), `policy_version`, `ip`, `user_agent`. Solo inserción. | Autorización y retiro (20.32). |
| `hr_marcacion_intentos` (nueva) | `organization_id`, `employment_id` (nulo), `time_clock_id`, `method`, `reason`, `created_at`. Retención 90 días. | Antifraude y fila «Rechazada» en vivo. |
| `attendance_events` | Columnas: `method` (CHECK con los métodos de arriba más `remoto` y `manual`), `device_time`, `raw_event_id`, `photo_expires_at`. | «Cómo» exacto en Asistencia; `source` sigue igual para lo viejo. |
| Bucket `hr-marcacion-evidencia` | Privado, ruta `org/<id>/…`. | Foto de evidencia con vencimiento. |
| Permisos | Se reutilizan `hr.attendance.view` (ver) y `hr.attendance.manage` (configurar métodos, dispositivos, PIN y carnés). | Sin permisos nuevos. |

### Funciones

| Función | Quién la ejecuta | Qué hace |
|---|---|---|
| `fn_hr_registrar_marca` (interna, sin `EXECUTE` para nadie más que las de abajo) | — | Lo que hoy hacen las últimas 30 líneas de `fn_hr_marcar`: tipo por alternancia, duplicado en 60 s, `insert` en `attendance_events`. Recibe el vínculo ya validado, el método, el punto y la hora (servidor o equipo). |
| `fn_hr_marcar` | `service_role` | **La misma firma de hoy.** Se agrega la rama `nfc` (código de la etiqueta) y la validación del QR por TOTP, y al final llama a `fn_hr_registrar_marca`. Valida que el método esté activo en la sede. Registra intentos rechazados. |
| `fn_hr_marcar_dispositivo(reloj, lote jsonb)` | `service_role` (la llama el receptor) | Guarda cada evento en la bandeja, deduplica, enlaza la persona, revisa la autorización biométrica y la hora, y llama a `fn_hr_registrar_marca`. Devuelve cuántos aceptó. |
| `fn_hr_marcar_kiosco(reloj, credencial jsonb, foto)` | `service_role` | Identifica por PIN o carné, aplica bloqueo por intentos y llama a `fn_hr_registrar_marca`. |
| `fn_hr_dispositivo_vincular`, `…_regenerar_clave`, `…_enlazar_usuario` | `service_role` con `hr.attendance.manage` | Alta, clave y mapeo. |
| `fn_hr_metodos_sede` | `service_role` | Lectura para Inicio, Mi asistencia y Asistencia. |

---

## 7. Flujos

```
Celular (ubicación · QR · NFC)  ──POST /api/hrm/marcacion──────────►  fn_hr_marcar ──┐
Kiosco / lector de escritorio   ──POST /api/hrm/kiosco/marcar──────►  fn_hr_marcar_kiosco ──┤
Terminal ZKTeco (ADMS)          ──/iclock/cdata (serie registrada)──►  fn_hr_marcar_dispositivo ──┤──► fn_hr_registrar_marca ──► attendance_events
Terminal Hikvision (escucha)    ──/hik/<clave>──────────────────────►  fn_hr_marcar_dispositivo ──┤        (un solo núcleo)            │
RR. HH. (manual con motivo)     ──POST /api/hrm/marcacion/manual───►  fn_hr_marcacion_manual ─────┘                                    ▼
                                                                              motor de horas → novedades → nómina (sin cambios)
```

- **Alta de un terminal (20.28.3–20.28.5):** elegir el tipo → datos y número de serie → GO Admin muestra qué escribir en el menú del equipo y espera la primera conexión → enlazar personas y, si se quiere, crearlas en el equipo.
- **Kiosco (20.29):** la tablet se vincula con un código de 6 caracteres que vence en 10 min → muestra QR, carné, PIN y (si está activo) rostro → confirma y vuelve al inicio en 5 s. Sin internet guarda las marcas y las envía al volver.
- **Retiro de la autorización (20.32.3):** se ordena borrar la plantilla en los equipos de la sede; desde ese momento sus marcas biométricas se rechazan con aviso a RR. HH.

---

## 8. Contexto en Asistencia e Inicio (pedido adicional) — sin romper lo que existe

**Principio: nada se quita.** Los cambios son aditivos: un campo más en las respuestas, una rama más en un `switch`, una acción más en un menú. Las pantallas de 20.9 y 20.10 siguen como están; 20.31 muestra las variantes.

| Pieza existente | Cambio | Por qué no rompe |
|---|---|---|
| `fn_hr_marcacion_estado` | Devuelve además `metodos_sede` (lista de la sede del vínculo) y `metodo_preferido`. | Campos nuevos; quien no los lee no cambia. |
| `marcarLogica.ts` (`metodosDisponibles`, `metodoInicial`) | Cruza los métodos de la persona con los de la sede; agrega `nfc`. Si queda un solo método, la pantalla no muestra el selector (20.30.6). Si la sede marca en un dispositivo, muestra el aviso (20.30.8). Sin `metodos_sede` (respuesta vieja), se comporta como hoy. | Las pruebas de `marcarLogica.test.ts` se conservan y se agregan casos. |
| `MarcarTurno.tsx` (/marcar) | Pestaña «NFC» (Web NFC en Android; en iPhone, aviso y alternativas, 20.30.3). Acepta `?metodo=qr|nfc|ubicacion` para abrir directo. El `POST` sigue igual; `nfc` es un método más del cuerpo que ya valida `datosDeMarcacion`. | Ubicación, QR, remoto y sin señal no cambian. |
| `TurnoInicio.tsx` y `MiAsistencia.tsx` (Inicio y /app/inicio/mi-asistencia) | `hrefMarcar` lleva `?metodo=` según `metodo_preferido`, y el texto del botón dice el método («Escanear el QR de la sede», 20.30.7; «Marcar salida con el QR», 20.31.4). Si la sede marca en dispositivo, «Ver dónde marcar» (20.30.8). El aviso de Mi asistencia explica los métodos de la sede. | Mismos estados y mismos enlaces; solo cambia el texto y un parámetro. |
| `fn_hr_asistencia_hoy` y `fn_hr_mi_asistencia` | El `CASE` de «Cómo» usa `attendance_events.method` cuando existe y, si no, las reglas de hoy (`remoto`, `qr`, `manual`, ubicación). | Las marcas viejas se muestran igual. |
| `asistenciaLogica.ts` (`ComoMarco`) y `VistaHoy.tsx` | `ComoMarco` suma `nfc`, `carne`, `pin`, `rostro`, `huella`. La columna «Cómo» pasa de texto a icono + texto (20.31.1), con los iconos del catálogo. Claves nuevas en `hrm.asistencia.hoy.como.*` en los cuatro idiomas. | El tipo crece; el `t()` de los valores viejos sigue. |
| `AsistenciaPage.tsx` (cabecera) | «Registrar marca manual» se queda donde está. El «⋯» (`masAcciones`) suma, solo si aplica a la sede: «Mostrar el QR de la sede», «Abrir kiosco en esta pantalla», «Métodos de marcación de la sede» y «Dispositivos · N sin conexión» (20.31.2). Si hay un dispositivo sin conexión, aviso arriba de la tabla con «Ver dispositivo». | Acciones nuevas en un menú que ya existe. |

**Navegación** (regla del dueño: cambiar una página limpia la navegación): la pestaña «Marcación» del módulo, el menú lateral (`AlarmClockCheck`, ya en el catálogo), el buscador, el asistente y los enlaces de `/app/hrm/marcacion`, `/dispositivos`, `/dispositivos/nuevo` y `/dispositivos/[id]/editar` (redirigen a la pestaña nueva). `/qr-display/[deviceId]` redirige a la «Pantalla de QR».

---

## 9. Pantallas (Figma, página «20 Recursos humanos»)

Todas con instancias del kit (`PageHeader`, `MobileHeader`, `TableCell`, `ListCard`, `StatCard`, `SegmentedControl`, `TabItem`, `PopoverCard` + `MenuItem`, `BottomSheet`, `ConfirmDialog`, `EmptyState`, `Skeleton`, `Aviso`, `AvisoConAccion`, `FilaDato`, `FormField`, `Select`, `NumberInput`, `Checkbox`, `Switch`, `Badge`, `IconoDestacado`, `ProgresoPasos`, `QRCard`, `TurnoCard`, `Toast`, `Isotipo`). Colores y textos con variables y estilos. Ocho iconos nuevos de lucide en «02 Componentes › Iconos»: `Fingerprint`, `ScanFace`, `Nfc`, `KeyRound`, `MonitorSmartphone`, `TabletSmartphone`, `PenLine`, `FilePenLine`.

| Sección | Qué muestra |
|---|---|
| 20.26 Marcación › En vivo | Tablero de hoy: indicadores, «Hoy por método», aviso de dispositivo sin conexión, tabla de marcas con método, punto y verificación; menú de la fila; celular; cargando, vacío, error y sin permiso. |
| 20.27 Marcación › Métodos por sede | Ocho métodos con su interruptor y sus reglas; cambios sin guardar con barra fija; celular; estados. |
| 20.28 Marcación › Dispositivos | Lista, menú de la fila, alta guiada en 3 pasos, detalle (resumen, personas, eventos), confirmar «Regenerar clave», celular, estados. |
| 20.29 Kiosco | Inicio con QR, carné, PIN y rostro; PIN; rostro con prueba de vida; marca registrada; PIN incorrecto; sin internet; vincular la tablet. |
| 20.30 Celular según la sede | Selector con los métodos de la sede, NFC, NFC no disponible, marca con NFC, etiqueta de otra sede, sede solo con QR, Inicio con «Tu turno» contextual. |
| 20.31 Asistencia e Inicio | Asistencia «Hoy» con el método de cada marca, menú «⋯» según la sede, celular, Mi asistencia con el método de la sede. |
| 20.32 Autorización biométrica | Pedir, vigente, retirar (hoja) y versión de escritorio. |

Los ids de nodo están en el informe de entrega y en los nombres de los PNG.

---

## 10. Fases

| Fase | Qué entra | Compras | Pantallas |
|---|---|---|---|
| **M0 · Base, sin hardware** | Migraciones de §6 (sin la bandeja de dispositivos), extracción de `fn_hr_registrar_marca` sin cambiar `fn_hr_marcar` hacia afuera, QR por TOTP de 30 s, «Pantalla de QR», etiquetas NFC (Android y app), métodos por sede, intentos rechazados, «En vivo», Asistencia e Inicio con el método, retiro de las páginas viejas. Pruebas: guardarraíles, `marcarLogica`, `marcacion.ts`, RLS con otra organización, idempotencia del QR. | Ninguna (etiquetas NFC si las quieren). | 20.26, 20.27, 20.28 (pantalla de QR y etiqueta), 20.30, 20.31 |
| **M1 · Kiosco** | GO Admin Kiosco (Capacitor, modo kiosco de Android), vinculación, PIN y carnés (`hr_credentials`), foto de evidencia con vencimiento, cola sin conexión, «modo lector» USB en GO Admin Escritorio. | Tablet Android 10" con NFC y soporte; carnés NFC; lector USB opcional. | 20.29, 20.28 (kiosco y lector) |
| **M2 · Terminales** | Receptor ZKTeco ADMS y Hikvision por escucha HTTP, bandeja, mapeo, crear usuarios en el equipo, hora y desfase, registro de eventos, autorización biométrica. Certificar 1 o 2 modelos de cada marca con el equipo en la mano. | Un terminal de prueba de cada marca que se quiera soportar. | 20.28 completo, 20.32 |
| **M3 · Opcional** | Rostro 1 a 1 en la tablet con prueba de vida, puente de red local en Escritorio (equipos solo HTTP o solo consulta), Anviz o Suprema si un cliente lo pide, NTAG 424 DNA con verificación SUN. | Según el caso. | 20.29.3 |

---

## 11. Qué necesita comprar o configurar el dueño

- **Para M0:** nada. Opcional: etiquetas NFC (NTAG 424 DNA, aprox. COP 8.000–15.000 c/u; NTAG215, aprox. COP 1.000–3.000) y un subdominio para el receptor de dispositivos (por ejemplo `marcacion.<dominio>`) apuntado a Vercel.
- **Para M1 (piloto):** una tablet Android de 10" con NFC y cámara frontal (aprox. COP 700.000–1.200.000), soporte de pared con candado, 10 carnés NFC; opcional un lector USB tipo ACR122U (aprox. COP 150.000–250.000).
- **Para M2 (piloto):** un terminal ZKTeco con ADMS sobre HTTPS y un terminal facial Hikvision con «HTTP listening» (cada uno aprox. COP 600.000–2.000.000 según modelo). Antes de comprar, confirmar con el vendedor que el firmware trae HTTPS y servidor en la nube.
- **Legal:** texto de autorización biométrica y de foto de evidencia revisado por el abogado de la plataforma; plantilla de política de tratamiento para los clientes.

Precios aproximados del mercado colombiano a noviembre de 2026; hay que cotizarlos.

---

## 12. Decisiones que necesitan al dueño

| # | Decisión | Recomendación |
|---|---|---|
| D1 | ¿Marcación como pestaña propia del módulo (entre Turnos y Asistencia) o dentro de Asistencia? | **Pestaña propia** en `/app/hrm/marcacion`, como está diseñado. Asistencia mira lo que pasó; Marcación configura y vigila los puntos. |
| D2 | Marcas de hardware a soportar primero. | **ZKTeco (ADMS) y Hikvision (escucha HTTP)**: son las más vendidas en Colombia y envían solas por internet. Anviz y Suprema solo si un cliente lo pide. |
| D3 | Rostro en la tablet. | **No en la primera versión.** Rostro con terminal comercial (prueba de vida infrarroja). En la tablet, solo foto de evidencia; la verificación 1 a 1 queda para M3. |
| D4 | ¿Guardar plantillas biométricas en GO Admin? | **No, nunca.** Quedan en el equipo. Menos riesgo legal y de seguridad. |
| D5 | Retención de la foto de evidencia. | **30 días**, configurable entre 7 y 90 por la organización. |
| D6 | Hora de los dispositivos. | Usar la del equipo si se desfasa **2 min o menos**; si más, a revisión. Del celular, siempre la del servidor (como hoy). |
| D7 | Kiosco como app o como página web. | **App** (Capacitor, modo kiosco): NFC, cámara, clave en almacenamiento seguro y funcionamiento sin internet. La página web `/kiosco` como respaldo sin NFC. |
| D8 | Dominio del receptor de dispositivos. | Un **subdominio propio** con HTTPS. Los equipos que solo hablan HTTP, por el puente de Escritorio (M3), no abriendo HTTP en la plataforma. |
| D9 | QR: código firmado que cambia cada 30 s o token en la base cada 5 min (hoy). | **Código firmado (TOTP) de 30 s.** No escribe en la base y la pantalla funciona sin internet. |
| D10 | Etiquetas NFC: no clonables (424 DNA) o baratas con ubicación (215). | **424 DNA** en sedes con antecedentes; 215 con ubicación obligatoria en el resto. |
| D11 | PIN. | **6 dígitos**, asignados por RR. HH., guardados con hash, bloqueo de 10 min tras 5 intentos. |
| D12 | ¿Quién compra el hardware? | El cliente; GO Admin publica una **lista de modelos certificados** y no da soporte a otros. |
| D13 | ¿En qué planes? | Celular, QR y NFC en todos. Kiosco y terminales desde Business. |
| D14 | Métodos por sede o por persona. | **La sede define; la persona solo restringe.** Remoto sigue siendo por persona. |

---

## 13. Riesgos y pendientes

- **R1 · HTTP de equipos viejos.** Vercel fuerza HTTPS; muchos ZKTeco viejos no siguen la redirección. Mitigación: solo modelos certificados con HTTPS, o el puente de Escritorio.
- **R2 · Protocolo por firmware.** ADMS e ISAPI varían por versión; se certifica modelo por modelo con el equipo real.
- **R3 · Web NFC solo en Android con Chrome.** En iPhone hace falta la app (Core NFC); la pantalla ofrece QR o ubicación (20.30.3).
- **R4 · Regla 5 para equipos.** Los receptores no tienen sesión: la organización sale del dispositivo registrado. Hay que documentarlo en el guardarraíl de rutas para que no se lea como una excepción abierta.
- **R5 · CHECK de `mecanismos`.** Ampliarlo exige tocar `enums.ts` (guardarraíl 9). La tabla tiene 0 filas.
- **R6 · Gimnasio guarda plantillas.** `customer_biometrics.template_data` guarda la plantilla biométrica de clientes en la base (0 filas hoy). No es de RR. HH., pero choca con el criterio de D4: conviene revisarlo aparte antes de que se use.
- **R7 · Carga.** Un terminal envía poco (marcas sueltas), pero el saludo de ZKTeco llega cada pocos segundos: el receptor debe responder sin tocar la base cuando no hay marcas (caché de la configuración del equipo). Mismo cuidado que el incidente del 2026-09-14.
- **R8 · Nombre comercial.** La pantalla del kiosco muestra el nombre de la organización: es dato del cliente y no va a ningún archivo del repositorio.

---

## 14. Fuentes

- ZKTeco, «General Introduction of PUSH SDK Protocol» (PDF): https://cdn.tvc.mx/media/92189/General-Introduction-of-PUSH-SDK-Protocol.pdf
- Integraciones ADMS de terceros con las rutas `/iclock/cdata`, `/iclock/getrequest`, `/iclock/devicecmd`: https://packagist.org/packages/dewanlab/laravel-zkteco-adms-core · https://webkul.com/blog/erpnext-zkteco-attendance-integration/
- Hikvision ISAPI, eventos de control de acceso y modo escucha: https://github.com/Shaykhnazar/hikvision-isapi · https://tpp.hikvision.com/solutions/TimeAttendance-Integration · https://downloads.evtrack.com/website/docs/Hikvision_Integration_Note_Rev1.pdf
- Web NFC (solo Chrome para Android): https://developer.chrome.com/docs/capabilities/nfc · https://developer.mozilla.org/docs/Web/API/NDEFReader
- Ley 1581 de 2012 (arts. 5 y 6), Decreto 1377 de 2013 (art. 6), Decreto 1074 de 2015 (compilación). SIC, guías sobre datos sensibles y biométricos.
- Código y base de este repositorio, consultados el 2026-11-16 (§2).
