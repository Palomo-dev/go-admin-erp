# Telefonía: controlador único, escritorio y móvil

Referencias Figma: espera/transferencia `1311:774019` y `1311:774119`, espejo de escritorio `1334:94961`, notificación de pérdida `1334:95420`, contexto entrante móvil `1336:96518`.

El `SoftphoneProvider` de la ventana principal posee el único Twilio Device. La ventana `/telefono` comparte la sesión para leer contexto autorizado, pero su preload solo expone estado y comandos de teléfono. No recibe tokens, preferencias completas, SID ni el usuario de sesión. El IPC comprueba la ventana exacta y su frame principal, su URL, el scope de organización, la revisión y la forma de cada payload. Una recarga, cierre o cambio de organización invalida el estado, los comandos y las acciones de notificaciones anteriores.

Los comandos esperan la respuesta del controlador. Espera y transferencia usan las operaciones Conference del proveedor; DTMF y silencio se deshabilitan durante la espera o una operación en curso; en consulta el cliente sigue con música y el agente puede hablar y silenciar su micrófono. Una llamada anterior sin Conference no presenta esas capacidades. Ante timeout se muestra el fallo; no se anuncia una operación completada.

Una pérdida entrante sin contestar produce contexto limitado para la notificación nativa y el espejo. «Devolver llamada» abre el marcador con el teléfono; «Crear lead» abre el creador canónico con teléfono E.164 validado, origen llamada entrante y cliente nuevo. Ambas acciones requieren confirmación del usuario en su formulario habitual. La query se consume al abrir, preservando otros filtros; nunca crea datos ni inicia audio automáticamente. Las acciones en la notificación nativa dependen del sistema operativo; los dos botones están disponibles también al abrir el espejo.

## Contexto y transporte móvil

`emitInboundCallContext` verifica la llamada entrante y sus destinatarios activos en la organización. Escribe notificaciones con IDs deterministas por llamada/organización/destinatario; un reintento usa la misma clave y no vuelve a disparar el trigger de inserción. El payload de pantalla bloqueada contiene solo identificadores y el destino de navegación, sin nombre ni teléfono.

La aplicación vuelve a autorizar y cargar `/api/voice/inbound/{id}/context`. La RPC `fn_phone_inbound_context` exige pertenencia activa e invitación propia; devuelve contexto de cliente y modo, sin el destino móvil ni SID. Solo se presenta una invitación móvil pendiente. Rechazar usa la ruta que cancela exclusivamente la invitación propia; contestar se realiza en los controles telefónicos del sistema cuando llega la llamada PSTN al celular verificado. La pantalla no afirma haber conectado audio desde una notificación ni crea otro Device.

Capacitor entrega el token por el evento `registration`; no tiene método `getToken`. Los listeners se instalan antes de registrar y se retiran individualmente. La sesión se vuelve a comprobar antes de guardar el token. Al salir se elimina la asociación de este dispositivo, con un tiempo máximo que no impide cerrar sesión.

La Edge Function requiere la clave de servicio usada por el trigger. Android usa FCM HTTP v1; iOS usa APNs con el token estándar de Capacitor. Solo una respuesta explícita de revocación elimina el token. Una configuración incompleta, una clave incorrecta o un error temporal no elimina registros válidos.

## Activación y verificación física

Conference está habilitada por defecto tras aplicar y verificar por MCP las RPC PHONE (migración `20261002064625`); `CRM_PHONE_CONFERENCE_ENABLED=false` conserva el escape explícito Dial heredado. El proveedor debe estar configurado y el celular debe verificarse mediante la atestación privada generada por el OTP aprobado. Los campos editables de preferencias no sirven como prueba de verificación. Si falta capacidad o RPC, el contexto devuelve 503.

`VOICE_CALLBACK_SECRET` es el mismo secreto HMAC existente de bridge y actas: Conference y los recibos OTP lo reutilizan, sin nueva clave. Debe estar presente en el servidor que ejecuta Next (Railway/Vercel) y no ser el literal de `.env.example`. Conservar la clave existente; para una instalación nueva generar 32 bytes aleatorios y guardarlos sólo como variable del servidor. La ruta token devuelve 409 neutro sin registrar el Device cuando falta esa capacidad. `TWILIO_WEBHOOK_BASE_URL` debe ser el origen HTTPS público exacto, sin ruta ni barra final; se mantienen las credenciales nativas por organización ya usadas por `voiceContextService`.

Android requiere el proyecto FCM y los valores existentes `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`, además de la aplicación firmada con su configuración de Google. iOS requiere entitlement de notificaciones y `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_TOPIC`, `APNS_PRIVATE_KEY`; `APNS_SANDBOX` selecciona el entorno correspondiente al build. No se añadieron secretos ni se cambiaron estas variables.

Las pruebas focales verifican permisos IPC, invalidez al cambiar organización, resultado real de comandos, traducciones de cuatro idiomas, prellenado sin autosave, registro/logout de tokens, idempotencia y transporte APNs/FCM con claves de prueba locales. La comprobación en equipos firmados de notificaciones, audio PSTN, micrófono y acciones del SO requiere esos dispositivos y la configuración del proveedor. No se enviaron llamadas ni pushes reales y no se desplegó la Edge Function durante estas verificaciones.

La ventana privada de grabación pendiente/unknown no se libera al caducar: la retirada espera evidencia nativa y una transacción verificable. Los timeouts de una intención conservan su lease hasta una observación o compensación acreditada; no se vuelve a marcar para resolver incertidumbre. La finalización de una conferencia liquida una sola vez con el servicio existente. Las pruebas locales no sustituyen llamadas, OTP, música y micrófono en el proveedor real; durante este cierre no se hicieron esas operaciones ni nuevas escrituras SQL.
