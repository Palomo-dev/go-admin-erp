# Auditoría del Chat: funciones perdidas en el rediseño del 2026-11-13

Fecha: 2026-11-14. Compara el tag `backup/antes-chat-roles-2026-11-13` con
`main` (commits fda0c4c3c, 944888d11, 1903ebf5d, 08d1940d4, 5494ea017,
a1c55d551, 7834e0286, c93754aeb, 731684d47) y con lo que había en disco ese
día. Para leer el código anterior: `git show backup/antes-chat-roles-2026-11-13:<ruta>`.

Leyenda: **Igual** (existe igual) · **Movido** (existe en otro lugar) ·
**PERDIDO** · **Restaurado** (se perdió y volvió en este trabajo) ·
**Sin pérdida** (en el respaldo no funcionaba o no se mostraba).

## Resumen

- **El reporte del dueño** («la posición vertical y horizontal ya no está»)
  corresponde a los **márgenes del widget del sitio web**. La página nueva del
  canal Sitio web solo dejó elegir la esquina; los márgenes en px
  (`brand_config.position.offsetX/offsetY`) ya no se podían editar.
  **Restaurado**, junto con el resto de la personalización del widget
  (ver § 1).
- **En la Bandeja no había preferencias de posición ni de disposición.** El
  respaldo no guardaba nada en `localStorage`, no tenía paneles
  redimensionables ni vista compacta/normal elegible. Lo que sí se perdió en la
  Bandeja es poder **ocultar el panel derecho** y algunos datos de la fila y del
  cliente (§ 3, para el agente 1).
- La configuración del chat (etiquetas, respuestas rápidas, llaves API, IA)
  **sigue completa** en el diálogo de Configuración. Lo que se perdió es la
  **pestaña para llegar a ella desde el Chat** (§ 3).

## 1. Canal Sitio web (`/app/chat/canales/sitio-web/[id]`) — restaurado en esta zona

Respaldo: `src/app/app/chat/canales/sitio-web/[id]/page.tsx` y
`src/components/chat/channels/website/id/*`. Estos componentes siguen en el
repositorio porque Configuración › CRM los usa (`ChannelDetailContent`).

El widget público (`supabase/functions/chat-widget/cliente.ts`, reglas en
`supabase/functions/_shared/chat-widget/reglas.ts › normalizarConfiguracion`)
lee todo `brand_config`: esquina, márgenes (0–200 px), estilo completo, logo,
vista inicial, botones (mensaje o enlace) y fuera de horario. **El formato
guardado no cambió.**

| Capacidad del respaldo | Antes de hoy | Ahora |
|---|---|---|
| Esquina (4 posiciones) — `WidgetPositionSection` | Igual (lista «Posición») | Igual |
| **Margen horizontal (px)** y **margen vertical (px)** — `WidgetPositionSection` l.105-137 | **PERDIDO** | **Restaurado** en Apariencia: guarda `position.offsetX/offsetY` al salir del campo, 0–200 px como el widget, con ayuda según la esquina |
| Mini vista previa de la posición con márgenes | PERDIDO (la vista previa ignoraba los márgenes) | **Restaurado**: la vista previa pone el botón y la ventana en la esquina con los márgenes reales en px |
| Color principal (selector + hex) | Igual | Igual |
| **Colores sugeridos** — `WidgetStyleSection` | Solo en «Más opciones de estilo», en español y con el aspecto viejo | **Restaurado** con el diseño aprobado y en 4 idiomas (`EstiloAvanzadoWidget`) |
| Color del ícono, ícono del botón (chat, mensaje, soporte, ayuda, imagen propia + URL), contorno/relleno, tamaño exacto, redondeo, grosor y color del borde, sombra y su fuerza | Igual de funcional, pero componente viejo solo en español | **Restaurado** con el diseño aprobado y en 4 idiomas; mismos límites que el widget (tamaño 40–80, redondeo 0–40, borde 0–6) |
| **Logo del chat** (`brand_config.logo_url`, avatar de la cabecera) — `BrandingSection` (no estaba montado en la página del respaldo, pero el widget lo usa) | PERDIDO | **Restaurado** en Apariencia: enlace https con miniatura; vacío = logo de la organización (como hace el widget) |
| Título, bienvenida, mensaje fuera de línea | Igual | Igual |
| **Vista inicial al abrir** (chat directo, formulario primero, preguntas frecuentes) — `WidgetBehaviorSection` l.115-151 | PERDIDO | **Restaurado** en «Al abrir el chat»; la vista previa la refleja |
| **Interruptor «Acciones rápidas»** (`showQuickActions`) | PERDIDO (se encendía solo al agregar un botón; no se podía apagar) | **Restaurado** («Mostrar los botones rápidos») |
| **Mensaje o URL de cada botón rápido** (`quickActions[].action`) | PERDIDO (la acción quedaba igual al texto del botón) | **Restaurado**: campo opcional; si es un enlace https el botón lo abre; los botones con enlace muestran un ícono |
| **Capturar datos de contacto fuera de horario** (`offlineCollectData`) | PERDIDO | **Restaurado** (casilla con ayuda) |
| Recolección de nombre, correo y teléfono | Igual (casillas) | Igual |
| Modo de IA | Igual (en «Datos del visitante») | Igual |
| Código del widget y copiar | Igual | Igual |
| **Copiar la clave pública** — `WidgetCodeSection` l.106-112 | PERDIDO | **Restaurado** en el menú ⋯ de Instalación |
| **Confirmación antes de rotar la clave** (AlertDialog) | PERDIDO (rotaba al primer clic) | **Restaurado** con `ConfirmDialog` |
| Dominios permitidos (agregar, quitar) | Igual | Igual |
| «Mostrar en el sitio» (`website_settings.chat_widget_enabled`) | Igual | Igual |
| **Activar / desactivar el canal** — `WebsiteSettingsHeader` l.60-67 | PERDIDO (había que volver a Canales) | **Restaurado** en el menú ⋯ de la cabecera |
| Cifras: sesiones, activas, visitantes, dispositivo | Movido (Sesiones, En línea, Visitantes, % desde celular) | Igual |
| Vista previa: formulario y luego chat, reiniciar | Igual | Mejorada: logo, ícono, borde, sombra, vista inicial y caja de mensaje como el widget |

Correcciones hechas de paso (mismo archivo, mismo dato):

- **Valores por defecto iguales a los del widget.** La página nueva completaba
  lo no guardado con el azul de la marca GO (`#4361EE`) y el nombre del canal
  como título; el widget usa `#3B82F6` y «Chat». Como cada guardado escribe el
  `brand_config` completo, guardar solo la posición cambiaba el color y el
  título que ve el visitante. Ahora la página usa `configuracionDelWidget()`,
  que toma los valores de `reglas.ts` (una sola fuente).
- **Rotar la clave con el chat visible en el sitio GO Admin** dejaba
  `website_settings.chat_widget_public_key` con la clave vieja (pasaba también
  en el respaldo). Ahora se actualiza al rotar.

## 2. Canales (`/app/chat/canales` y detalle de WhatsApp, Instagram, Facebook)

| Capacidad del respaldo | Estado |
|---|---|
| Lista: nombre, tipo, activo/inactivo, conectado/sin conectar | Igual (tabla con estado de conexión) |
| Interruptor activo, modo de IA por canal | Igual |
| Configurar (ir al detalle) | Igual |
| **«Instalar widget»** (código desde la lista) — `ChannelCard` l.237-240 | **Restaurado**: «Código de instalación» en el menú ⋯ de los canales de sitio web (`WidgetCodeDialog`) |
| «Conectar» canales sin conectar | Movido: Configurar lleva al detalle; aviso «Reconectar» para token vencido o suspendido |
| Buscar por nombre y filtrar por tipo (6 tipos) y estado (activos / inactivos) — `ChannelsList` l.58-93 | **Restaurado** (decisión del dueño: devolver todo): `FiltrosCanales` con `ListToolbar`, `SearchInput`, `FilterPanel` y chips del kit; busca sin tildes al teclear; «sin resultados» con «Limpiar filtros». «Inactivos» incluye los suspendidos |
| Cifras Total, Activos, Website, IA Auto — `ChannelsHeader` | Movido a otras cifras (Conectados, Conversaciones hoy, Abiertas, Primera respuesta). Las cuentas por tipo y por modo «Auto» ya no se muestran (menor) |
| Diálogo «Crear nuevo canal» — `CreateChannelDialog` del respaldo: tipo (sitio web, WhatsApp, Messenger, Instagram; Telegram y correo deshabilitados), nombre con valor sugerido por tipo, modo de IA, avisos de qué sigue y métodos de conexión de WhatsApp | Igual (`DialogoNuevoCanal`): mismos tipos (Telegram y correo como «Próximamente» en «Conectar otro canal»), nombre sugerido, modo de IA; los avisos pasan a ser la elección de forma de conexión de WhatsApp (Cloud API, coexistencia, QR con riesgo) y el botón «Continuar con Meta». Sin pérdidas |
| Detalle Meta: Actualizar, Activar/Desactivar, cifras (mensajes, enviados hoy, tasa de entrega, fallidos), credenciales con «Ver» (WhatsApp, Instagram y Facebook con los mismos campos), guardar, validar, webhook (URL, token, campos a suscribir, nota), eventos recientes con error | Igual (`PantallaCanalMeta`, `CredencialesMeta`, `WebhookCanal`, `EventosRecientesCanal`) |
| **Copiar el token de verificación** del webhook — `*WebhookCard` l.74 | **Restaurado** («Copiar token», sin tener que mostrarlo) |
| **Enlace a Meta for Developers** (`developers.facebook.com/apps`, donde se configura el webhook) | **Restaurado** (el rediseño solo enlazaba a Meta Business; quedan los dos) |
| **Fecha y hora exactas** de cada evento (`dd/MM HH:mm`) — `*EventsCard` l.90 | **Restaurado** al pasar el mouse sobre la hora relativa, en la zona horaria de la organización |
| WhatsApp: conexión en 1 clic (Embedded Signup), manual, coexistencia (requisitos, pasos), QR (iniciar, detener, cerrar sesión) | Igual (`ConexionWhatsApp`, `PanelQrWhatsApp`, `useRegistroMetaWhatsApp`) |
| Botón «Avanzado» de la cabecera de WhatsApp | Sin pérdida (no hacía nada) |

## 3. Para otros agentes (fuera de esta zona; no se editó)

Origen: auditoría de solo lectura del 2026-11-14 contra el respaldo. «R:» es
`backup/antes-chat-roles-2026-11-13:<ruta>`.

### Agente 1 — Bandeja y conversación

| Archivo actual | Qué falta | De dónde sale |
|---|---|---|
| `src/app/app/chat/bandeja/page.tsx` (l.~450) | **Ocultar/mostrar el panel derecho** en escritorio (en xl quedó fijo; antes se abría a demanda y se cerraba con `PanelRightClose`) | R: `src/components/chat/inbox/ChatSidePanel.tsx`, `ChatView.tsx` l.~320-334 |
| `src/components/chat/inbox/bandejaLogica.ts` | Ver **todos los estados a la vez** (filtro «Todos») | R: `src/app/app/chat/bandeja/page.tsx` l.~557-571 |
| `src/components/chat/ui/ConversacionFila.tsx` | **Etiquetas** en la fila (2 y «+N»), **punto en línea** (`last_seen_at` < 2 min), **✓/✓✓** del último mensaje del agente | R: `src/components/chat/inbox/ConversationItemCompact.tsx` l.~33-44, 109-114, 143-151, 187-208 |
| `src/components/chat/conversations/panel/PestanaCliente.tsx`, `src/lib/services/chat/fichaClienteChat.ts` | **Editar el cliente en línea** (nombre, apellido, correo, teléfono, dirección, ciudad); **ocultar `@widget.local` y usar `metadata.real_email`**; **cliente vinculado en CRM** (`metadata.linked_customer_id`); total de mensajes, primer/último contacto, 5 conversaciones recientes, `customers.notes`, «en línea / visto hace» | R: `src/components/chat/inbox/CustomerProfilePanel.tsx` l.~107-114, 158-205, 247-264, 252-334, 379-479 |
| `src/components/chat/conversations/HiloConversacion.tsx` / `ui/Burbuja.tsx` | **Estado de entrega Entregado / Leído / Fallido** por mensaje (`message_events`); nombre y avatar del remitente al cambiar de autor; resaltado del resultado de búsqueda; tipo `location` | R: `src/components/chat/conversations/id/MessageTimeline.tsx` l.~72-84, 161-171; `inbox/MessageBubble.tsx` l.~229-255; `inbox/ChatView.tsx` l.~266-275 |
| `src/components/chat/conversations/CabeceraConversacion.tsx` (l.~384) | **Buscar en la conversación** en la vista completa (`MenuMasAcciones` se monta sin `onBuscar`) | Igual que en la bandeja (`SearchPanel`) |
| `src/components/chat/conversations/panel/*` | **Panel de respuestas rápidas navegable** (buscador, etiquetas, «Usado N veces», Usar); **puntos clave y sentimiento** del resumen de IA (el servicio ya trae `key_points` y `sentiment`) | R: `src/components/chat/conversations/id/QuickRepliesPanel.tsx`; `id/AIAssistantPanel.tsx` l.~127-151 |
| `src/components/chat/ui/ComposerChat.tsx` | Botón **Negrilla** (`**texto**`); ayuda «Enter para enviar, Shift+Enter…»; Ctrl/⌘+Enter en notas | R: `src/components/chat/inbox/ChatInput.tsx` l.~169-187, 345-354, 439-441; `conversations/id/NotesPanel.tsx` l.~58 |
| `src/app/app/chat/conversaciones/nueva/page.tsx` | Campo **«Asunto (opcional)»** (`metadata.subject`; el servicio aún lo acepta) | R: `src/components/chat/conversations/nuevo/ConversationOptions.tsx` l.~74-80 |
| `src/app/app/chat/ia/trabajos/page.tsx`, `src/components/chat/ia/trabajos/*` | Rango **Desde/Hasta** libre (ahora presets y 7 días por defecto); columnas **ID, Duración, Confianza**; en el detalle **copiar ID, Iniciado/Completado/Duración, tokens de entrada y salida, costo USD, IDs de fragmentos**; botón Actualizar | R: `src/components/chat/ia/trabajos/JobsFilters.tsx` l.~76-95; `JobsTable.tsx` l.~117-122; `JobDetailDialog.tsx` l.~84-240 |

### Agente 2 — Navegación, actividad/archivos, diálogos de conocimiento

| Archivo actual | Qué falta | De dónde sale |
|---|---|---|
| `src/components/chat/ChatNavTabs.tsx` | **Pestaña «Configuración»** del Chat (iba a la configuración del módulo: etiquetas, respuestas rápidas, llaves API). `src/components/chat/configuracion/ConfigNavTabs.tsx` se reescribió con `chat.general` y `chat.ia` pero no se usa en ninguna parte | R: `src/components/chat/ChatNavTabs.tsx` l.~47-49 |
| `src/components/chat/conocimiento/*` (diálogos) y páginas de Conocimiento | Filtro por **varias etiquetas** en «Todos los fragmentos» (en la fuente quedó de una sola); **prioridad y 👍/👎** en la lista; insignia **«Indexada»** por fuente; botón Actualizar y «Mostrando X de Y» en el detalle de fuente; emoji de la fuente; en el fragmento **modelo del embedding, hash y fecha de creación** | R: `src/components/chat/conocimiento/FragmentsList.tsx` l.~50-150, 222-234; `SourcesList.tsx` l.~120-181; `fuentes/id/FragmentsTable.tsx` l.~70-165, 320; `fuentes/id/SourceDetailHeader.tsx` l.~60, 94-102; `fragmentos/id/FragmentMetadataPanel.tsx` l.~99-138, 213-218 |
| `src/app/app/chat/conocimiento/importar/page.tsx` | **Lista de errores por fila**, **«Nueva importación»**, columna **Tags** en la vista previa, aviso **«embeddings en cola»** | R: `src/components/chat/conocimiento/importar/ImportActions.tsx` l.~56-86; `PreviewTable.tsx` l.~65-100 |

### Agente 3 — Configuración e IA

| Archivo actual | Qué falta | De dónde sale |
|---|---|---|
| `src/app/app/chat/ia/laboratorio/page.tsx` | Ajustes **Modelo, Tono, Idioma, Reglas del sistema, Máx. fragmentos**; temperatura y tokens libres (hoy 3 opciones fijas). Parte se quitó a propósito porque la prueba ahora llama a la IA real: decidir cuáles vuelven | R: `src/components/chat/ia/laboratorio/LabSettingsPanel.tsx` l.~57-185 |
| ídem | Panel de fragmentos: **buscador, Todos/Ninguno, contador, prioridad, ver más, etiquetas** (y tope de 50, hoy 20) | R: `…/laboratorio/LabFragmentsPanel.tsx` l.~60-180 |
| ídem | **Copiar respuesta**, mostrar la consulta, **costo estimado**, pie con modelo/temperatura/tono y fecha, cifras del encabezado, botón Actualizar | R: `…/laboratorio/LabResultPanel.tsx` l.~21-175; `LabHeader.tsx` l.~58-110 |

### Sin dueño asignado (Visitantes del widget y Auditoría)

| Archivo actual | Qué falta | De dónde sale |
|---|---|---|
| `src/app/app/chat/widget/sesiones/page.tsx` | **Filtro por canal** (el servicio aún acepta `channelId`); **detalle de la sesión** (ID anónimo, fechas exactas de inicio y última actividad, canal y tipo, correo del cliente) | R: `src/components/chat/widget/sesiones/SessionsFilters.tsx` l.~60-75; `SessionDetailDialog.tsx` l.~57-215 |
| `src/app/app/chat/auditoria/page.tsx` | **Filtro por tipo de actor**; rango **Desde/Hasta** libre; en el detalle **metadata, user agent, IDs de actor, entidad y registro**; botón Actualizar | R: `src/components/chat/auditoria/AuditFilters.tsx` l.~99-150; `AuditDetailDialog.tsx` l.~90-158 |

### Lo que NO se perdió (para no buscarlo)

- Etiquetas, respuestas rápidas, llaves API y Configuración de IA del chat:
  completas en el diálogo de Configuración (`chat.general`, `chat.ia`).
- Horarios de atención, SLA, asignación automática: no existían en el Chat del
  respaldo. El mensaje «fuera de horario» es del widget (§ 1).
- Componentes del respaldo que no se montaban en ninguna pantalla:
  `ConversationItem`, `ConversationList`, `ConversationFilters`,
  `ConversationStats`, `CustomerProfileDrawer`, `SearchInConversation` y, en la
  página del widget, `BrandingSection` (su logo sí lo usa el widget: restaurado).

## 4. Pendientes y riesgos

- `WidgetStyleSection`, `WidgetPositionSection` y el resto de
  `channels/website/id/*` viejos siguen vivos solo por
  `ChannelDetailContent` (Configuración › CRM, `CRMConfigPanel.tsx`). Son una
  segunda pantalla del mismo widget, en español y con el aspecto viejo: conviene
  que ese panel enlace a `/app/chat/canales/sitio-web/[id]` y retirarlos.
- Organizaciones que ya guardaron con la página nueva (13 y 14 de noviembre)
  pueden tener `#4361EE` y el nombre del canal como título escritos en
  `brand_config`: es lo que eligieron ver en la vista previa, no se toca.
- Datos del visitante: el widget también entiende `company` y campos
  obligatorios (`collect_identity.required`), pero ninguna pantalla —ni la del
  respaldo— los ofrece. No es una pérdida; queda como mejora posible.
