# GO Asistente en escritorio: análisis y propuesta (2026-09-23)

- **Archivo de Figma:** `EAvjINVRnlzFM70GVoWXgl`.
- **Capturas:** `docs/design/figma/40-asistente-*.png`.
- **Estado:** propuesta para que el dueño la apruebe. No se tocó código; esto es solo diseño y
  análisis.
- **Para quién es:** la sesión que desarrolla GO Asistente (ver §5).
- **Nombres:** el repositorio es público. Todos los datos de ejemplo son inventados (Ana Gómez,
  Laura Méndez, «Mi empresa S.A.S.»). La BD solo se consultó con agregados.

---

## 1. Qué hace hoy

### 1.1 Funcionalidad

| Capacidad | Cómo funciona hoy | Dónde |
|---|---|---|
| Preguntar | Respuesta en streaming SSE con los eventos `meta`, `token`, `tool_start`, `tool_end`, `action`, `question`, `usage`, `error` y `done`. Máximo 4 vueltas por turno. | `api/ai-assistant/stream`, `lib/ai/agent/runAgent.ts` |
| Consultar datos | Herramientas de riesgo *low* que se ejecutan sin confirmar: `buscar_productos`, `consultar_stock`, `buscar_clientes`, `buscar_proveedores`, `listar_sucursales`, `leer_documento`, `estado_configuracion`… | `lib/ai/agent/tools/*` |
| Ejecutar acciones | Las de riesgo *medium* o *high* generan una **propuesta** en `ai_agent_actions` (caduca a los 30 min) y se muestran en una tarjeta. Se ejecutan en el servidor solo con `{actionId}`, y los permisos se vuelven a evaluar al ejecutar. Hay una sola propuesta por turno. | `execute-action`, `reject-action`, `ActionConfirmationForm.tsx` |
| Corregir | «Corregir» rechaza la propuesta en el servidor, y el siguiente mensaje la reabre como dato. | `correction.ts` |
| Deshacer | Disponible dentro de `undo_window_minutes` (15). Compensa el cambio, no borra. `registrar_venta` no se puede deshacer. | `undo-action`, `undoService.ts` |
| Carga masiva | Excel o CSV leído sin IA, con detección de duplicados por SKU, código de barras o nombre. Tope de `bulk_max_rows` (500). Se ejecuta en una sola RPC transaccional: todo o nada. | `cargaMasiva.ts`, `BulkPreviewTable.tsx` |
| Pregunta de aclaración | 2 a 4 opciones (A–D) más «Otro». La opción elegida se envía como mensaje. | `QuestionCard.tsx` |
| Voz de entrada | Nota de voz → transcripción. El texto queda en el composer para revisarlo antes de enviar. Cuesta 1 crédito por minuto. | `transcribe`, `Composer.tsx` |
| Voz de salida (TTS) | «Escuchar» cada respuesta. Requiere `tts_enabled` y cuesta 1 crédito por cada 500 caracteres. | `tts` |
| Adjuntos | Botón, arrastrar y soltar, o pegar una captura. Hasta 10 archivos de 20 MB cada uno (imagen, PDF, CSV, XLS, XLSX). | `attachments`, `Composer.tsx` |
| Historial | Hilos persistidos que se pueden retomar. «Archivar» cambia el estado, no borra. | `conversations`, `ConversationHistory.tsx` |
| Créditos | El saldo se comprueba **antes** (`checkAICredits`) y se cobra **después**, una sola vez por turno (`chargeAiCredits`, `assistant_chat`). | `runAgent.ts:314-337`, `aiCostService.ts:219` |

### 1.2 Cómo se ve hoy en escritorio

El panel está en `AIAssistantPanel.tsx`. Se abre desde `AppLayout.tsx` y `AppHeader.tsx`.

**Colocación**
- Es una columna *flex* hermana de todo el shell, incluido el header.
- Mide `w-80 xl:w-96` (320/384 px) y **empuja el contenido**, no lo tapa.
- No se puede redimensionar ni ampliar.

**Cabecera**
- `bg-blue-600` con `min-h-60`, el icono `Bot` y el título **«GO Assistant»** (en inglés). El botón
  del header dice «GO Asistente».
- Botones:
  - Voz: se pone **verde** cuando está activa.
  - Historial.
  - **Papelera «Limpiar conversación»**: en realidad abre un hilo nuevo y no borra nada.
  - Cerrar.

**Bienvenida**
- Círculo con *sparkles*, «¡Hola, {nombre}!» y un párrafo genérico.
- Las sugerencias se piden con `POST /suggestions {}`, **sin la página actual**.

**Mensajes**
- Avatares de 32 px. El del asistente lleva un degradado **azul → morado**, fuera de marca.
- Mientras responde se ven los pasos de las herramientas con una llave inglesa, o tres puntos
  rebotando.
- Resultado de una acción: se muestra como un mensaje con `✅ **Acción completada:**` o
  `❌ **Error:**`.
- Deshacer: aparece como una píldora suelta.

**Composer**
- Área de texto de 1 a 8 líneas, botones de clip y micrófono, y enviar/detener.
- Ayuda: «Enter envía · Shift+Enter salta de línea».
- **No muestra el saldo de créditos.**

**Pie**
- «GO Assistant puede cometer errores…».
- «Modelo: gpt-…»: expone el nombre del proveedor al cliente.
- Enlace «Configurar permisos del asistente».

**Cómo se abre**
- Botón del header: secundario en Tinte GO; cuando el panel está abierto pasa a Azul acción con
  `aria-pressed`.
- Pestaña flotante `fixed right-0 top-1/2` de 40×40, solo cuando el panel está cerrado.
- Botón central de la barra inferior en móvil.
- **No hay atajo de teclado.** `Ctrl+K` es del buscador global; el plan §11.1 lo proponía para el
  asistente.
- El estado es un `useState` local en `AppLayout`: no hay contexto ni evento global, y el panel no
  recuerda si estaba abierto al recargar.

### 1.3 BD (consulta del 2026-09-23, solo agregados)

| Tabla | Volumen | Observaciones |
|---|---|---|
| `ai_assistant_conversations` | 26 hilos | 5 organizaciones y 4 usuarios. Todos `active` y `channel=text`. |
| `ai_assistant_messages` | 101 mensajes (51 del usuario y 50 del asistente) | Del 2026-09-10 al 2026-09-20. Latencia media de 5,95 s (p90 de 9,9 s). La columna `credits` está vacía en todas las filas. El modelo que se registra es `gpt-5.6-luna`. |
| `ai_agent_actions` | 23 propuestas | **Todas `create_customer`** y de riesgo medium: 20 ejecutadas, 1 rechazada, 1 deshecha y 1 caducada. |
| `ai_attachments` | 2 | Las dos son imágenes. |
| `ai_assistant_settings` | 85 organizaciones | Todas con `write_full`, `tts_enabled=false`, `voice_enabled=false`, deshacer de 15 min y tope de 500 filas. `daily_credit_cap_per_user` está vacío y el código no lo usa. |
| `ai_settings` | 40 organizaciones con saldo | 2 con saldo 0; el resto con 50 o más (mediana de unos 20.000). |
| `ai_usage_logs` | 27 cobros `assistant_chat` y 2 `assistant_stt` | Media de 4,74 créditos por turno (128 en total). La transcripción cuesta 1 crédito. |
| `ai_credit_purchases` | 4 | 2 completadas y 2 pendientes. |

**Lectura:**
- El uso real todavía es de prueba.
- La única acción que se ha usado es crear clientes.
- Nadie tiene activada la voz de salida.
- Una respuesta cuesta **≈5 créditos**: es el dato para el aviso de «créditos bajos».
- Hay 50 respuestas y solo 27 cobros. Las 20 respuestas «resultado de acción» se escriben sin
  modelo y cuadran casi todo. Queda una diferencia de unas 3, que conviene revisar.

### 1.4 Qué falla o confunde (escritorio)

1. **Poco ancho para el contenido rico.** En 384 px, con avatares y burbujas al 80 %, una tabla
   markdown o la vista previa de carga masiva (5 columnas en una rejilla fija) quedan apretadas.
   Tampoco hay forma de ampliar el panel. El plan §11 pedía tres modos (acoplado, flotante y
   pantalla completa).
2. **El nombre no coincide.** El botón dice «GO Asistente» y la cabecera dice «GO Assistant».
3. **La papelera no borra**: abre un hilo nuevo. El icono sugiere algo destructivo.
4. **No hay atajo de teclado**, y la pestaña flotante (40×40) casi no se ve.
5. **Las sugerencias no dependen del contexto**, porque no se envía la página actual. En cambio,
   el chat sí recibe `currentPath`.
6. **Los créditos no se ven.** Sin saldo, el usuario escribe y solo entonces recibe el error
   `NO_CREDITS` como texto. Tampoco hay aviso de saldo bajo ni enlace para comprar.
7. **El resultado de una acción es texto con emojis** (`✅`/`❌`). El botón de deshacer vive aparte
   y desaparece al enviar otro mensaje.
8. **Los errores del stream se mezclan con la respuesta** («La respuesta quedó incompleta…» dentro
   de la misma burbuja) y no hay botón de reintentar.
9. **«Sin permiso» no se distingue.** Cuando el servidor no ofrece una herramienta, el modelo lo
   explica con sus palabras, sin un estado visual reconocible.
10. **El pie muestra el nombre del modelo del proveedor** al cliente final.
11. **Estilo fuera de marca:** degradado morado en los avatares, voz activa en verde y
    `bg-blue-600` en vez de Azul GO.
12. **`branchId` y `branchName` no llegan** en el `context` que `AppLayout` pasa al panel. Por eso
    `CustomerFormDialog` recibe `branchId=null`.
13. Con el panel abierto a 1280–1440 px, **el header del contenido no cabe**: organización con
    plan, buscador «Buscar Ctrl K», reportar, campana y botón suman unos 830 px sobre unos 776
    disponibles.

---

## 2. Propuesta para escritorio

Las capturas están en `docs/design/figma/40-asistente-*.png`. La propuesta es coherente con la
versión móvil (`AssistantPanel` Variant=mobile) y con el manual de marca:
- Cabecera en Azul GO, de 64 px.
- Acción principal en Azul acción.
- *Sparkles* solo en el círculo de bienvenida.
- Todo con variables Light/Dark e Inter.

### 2.1 Reglas

- **Panel acoplado de 400 px** a la derecha de **todo** el shell, igual que hoy: el contenido se
  estrecha y nada queda tapado.
- **Panel ampliado de 720 px** para tablas y cargas masivas. El sidebar pasa a *rail*. Se entra con
  «Ampliar» en la cabecera o con «Ver en grande» en una tarjeta. La preferencia se recuerda por
  usuario.
- **Cabecera:** robot + «GO Asistente» (H3, blanco) y botones blancos al 20 %:
  - Nueva conversación (lápiz, **sustituye a la papelera**).
  - Historial.
  - Voz (VolumeX o Volume2 en estado activo, blanco sólido).
  - Ampliar o Reducir.
  - Cerrar (Esc).
- **Tres formas de abrirlo:**
  - Botón «GO Asistente» del header: secundario en Tinte GO; abierto, en Azul acción.
  - Pestaña lateral (`AssistantLauncher` edge-tab de 28×96).
  - **Ctrl+J** (Nuevo): abre, cierra y enfoca el composer. El tooltip del botón enseña el atajo.
- **Con el panel abierto, el header se compacta:**
  - El buscador pasa a icono (Ctrl+K sigue funcionando).
  - Se oculta el chip del plan.
  - En el modo ampliado, además, «Reportar problema» pasa al menú de sesión y el botón queda solo
    con el icono.
- **Sin avatares**, como en móvil:
  - Usuario: burbuja en Azul acción, alineada a la derecha, con adjunto opcional.
  - Asistente: burbuja en Fondo suave a todo el ancho, con markdown y un *slot* para tablas y
    tarjetas.
  - «Escuchar» solo si la organización tiene la voz activada.
- **Composer:**
  - Área de texto, adjuntar y micrófono.
  - **Chip de la página actual** («Inicio»): indica qué contexto recibe el asistente.
  - Enviar en Azul acción (en Tinte cuando está vacío; se convierte en Detener mientras responde).
  - Pie con el atajo y el **saldo discreto**: gris normal, ámbar por debajo de 50 y rojo en 0.
- **Pie del panel:** «Puede equivocarse: revisa lo importante · Permisos del asistente». Sin el
  nombre del modelo.
- **Icono:** robot (`Icon/Bot`), según la decisión 22 del archivo. Ver la pregunta 1 de §7.

### 2.2 Pantallas

Están en **«03 Navegación y shell» › sección «GO Asistente — escritorio (propuesta)»** (`667:34452`).
Todas miden 1440×900 y parten de una copia de «Escritorio / Shell — expandido» (`52:3175`); el
original no se tocó.

| # | Pantalla | Nodo | Captura |
|---|---|---|---|
| 01 | Cerrado: botón, pestaña y tooltip «Ctrl+J» | `667:34455` | `40-asistente-01-cerrado.png` |
| 02 | Bienvenida con sugerencias de la página | `667:34706` | `40-asistente-02-bienvenida.png` |
| 03 | Respuesta en markdown con tabla | `667:35253` | `40-asistente-03-respuesta-tabla.png` |
| 04 | Pensando y consultando (pasos, Detener) | `667:35749` | `40-asistente-04-pensando.png` |
| 05 | Pregunta de aclaración | `667:36162` | `40-asistente-05-pregunta.png` |
| 06 | Confirmación antes de ejecutar | `667:36553` | `40-asistente-06-confirmacion.png` |
| 07 | Acción completada con Deshacer | `667:36967` | `40-asistente-07-completada.png` |
| 08 | Carga masiva (acoplado) | `667:37374` | `40-asistente-08-carga-acoplado.png` |
| 09 | Carga masiva (ampliado, 720 px, sidebar en rail) | `668:37351` | `40-asistente-09-carga-ampliado.png` |
| 10 | Historial de conversaciones | `668:38333` | `40-asistente-10-historial.png` |
| 11 | Créditos bajos | `668:38793` | `40-asistente-11-creditos-bajos.png` |
| 12 | Sin créditos (composer bloqueado) | `668:39178` | `40-asistente-12-sin-creditos.png` |
| 13 | Error: respuesta incompleta, con Reintentar | `668:39619` | `40-asistente-13-error.png` ⚠ ver §6 |
| 14 | Sin permiso | `668:40068` | `40-asistente-14-sin-permiso.png` ⚠ ver §6 |
| 15 | Dictando una nota de voz | `668:40449` | `40-asistente-15-dictando.png` |
| 16 | Pantalla 03 en modo oscuro | `668:40896` | `40-asistente-16-oscuro.png` |

Vistas generales: `40-asistente-seccion.png` (las 16 pantallas) y `40-asistente-componentes.png`.

### 2.3 Componentes

Están en **«02 Componentes» › sección «GO Asistente — escritorio (Nuevo)»** (`660:15723`). Los
componentes de producción `AssistantPanel` (`77:3275`) y `AssistantLauncher` (`45:2223`) no se
modificaron: la propuesta los reutiliza (la pestaña *edge-tab* y el botón *button*/*button-open*).

| Componente | Nodo | Variantes y propiedades |
|---|---|---|
| `AsistentePanelEscritorio` | `665:399342` | Ancho = acoplado (400) / ampliado (720). SLOT «Conversación». Cabecera y Composer expuestos. |
| `AsistenteCabecera` | `660:16002` | Vista = chat / historial × Ampliado = no / sí. |
| `AsistenteBotonCabecera` | `660:15791` | Estado = default / activo. Icono intercambiable. |
| `AsistenteBienvenida` | `660:16014` | Saludo y Contexto (texto). 4 × `AsistenteSugerencia`. |
| `AsistenteSugerencia` | `660:16009` | Texto e Icono. |
| `AsistenteContexto` | `660:16003` | Página (texto). |
| `AsistenteMensaje` | `662:15899` | Rol = usuario / asistente. Texto, Mostrar adjunto, Archivo, SLOT Contenido, Mostrar contenido, Mostrar acciones. |
| `AsistenteTablaRespuesta` | `662:15900` | Hecha con `TableCell` Density=compact. |
| `AsistentePasos` | `662:16000` | Estado = pensando / consultando / escribiendo. |
| `AsistentePregunta` | `662:16001` | Pregunta y Opción A, B y C. |
| `AsistenteConfirmacion` | `663:16182` | Estado = pendiente / ejecutando / completada / error. Mostrar aviso contable. |
| `AsistenteCargaMasiva` | `663:16533` | Layout = acoplado / ampliado. Hecha con `TableCell` y `Badge`. |
| `AsistenteComposer` | `664:16404` | Estado = vacío / escribiendo / con adjunto / grabando / respondiendo / sin créditos. Créditos (texto). |
| `AsistenteAviso` | `664:16499` | Tipo = créditos bajos / sin créditos / error / sin permiso. |
| `AsistenteHistorialFila` | `664:16539` | Estado = default / activa / hover. Título y Detalle. |
| `AsistenteHistorial` | `664:16540` | Buscador y grupos Hoy / Ayer / Esta semana. |
| Iconos nuevos (Lucide) | `660:15726` Volume2, `660:15735` Maximize2, `660:15745` Minimize2, `660:15755` Square, `660:15762` Archive, `660:15771` SquarePen | Conviene consolidarlos en Fundamentos › Iconos. |

Deuda de Figma:
- La compactación del header (buscador en icono, sin chip de plan) está hecha con *overrides* en
  cada pantalla. Si se aprueba, debería ser una propiedad de `AppHeader` («Asistente abierto»).
- Los botones blancos al 20 % usan un blanco sin variable, igual que la cabecera móvil del kit. Las
  instancias pierden la opacidad cuando la pintura está enlazada a una variable.

---

## 3. Comportamiento por estado

- **Bienvenida:**
  - Las sugerencias dependen de la página. Ejemplos para Inicio: ventas de hoy frente a ayer,
    productos sin stock, facturas vencidas, crear un cliente.
  - Si el saldo es 0, el aviso aparece **al abrir el panel**, no después de escribir, porque el
    saldo ya se comprueba antes de llamar al modelo.
- **Pensando:**
  - Los pasos reales (`tool_start`/`tool_end`) aparecen con su resultado («→ 12»).
  - Cuando llegan tokens, los pasos se pliegan («2 pasos · Ver») y el texto se escribe con cursor.
  - Esc detiene la respuesta.
- **Pregunta:** además de hacer clic, en escritorio las teclas A, B y C eligen la opción.
- **Confirmación:**
  - Tarjeta de solo lectura con la estimación («≈1 crédito»).
  - Ctrl+Enter confirma y Esc rechaza.
  - «Abrir el formulario completo» sustituye al botón «Formulario completo».
  - El aviso contable aparece en las acciones de riesgo *high*.
  - La tarjeta cambia de estado en el mismo sitio: pendiente → ejecutando → completada (con
    «Ver cliente» y «Deshacer · 15 min») o error. Desaparecen los mensajes con ✅ y ❌.
- **Carga masiva:**
  - En el panel acoplado: resumen con contadores, las filas con problemas primero y «Ver las 51
    filas en grande».
  - En el ampliado: tabla completa virtualizada, sin cambiar de conversación.
- **Historial:** es una vista del propio panel, con la cabecera «Conversaciones» y una flecha para
  volver. Tiene búsqueda, grupos por fecha en la zona horaria de la organización y «Archivar» al
  pasar el ratón.
- **Error:** el aviso va aparte de la burbuja. El mensaje vuelve al composer y «Reintentar» es
  manual; no se reintenta solo porque el turno pudo cobrar o dejar una propuesta.
- **Sin permiso:** el asistente propone lo que sí puede hacer, y el aviso lleva a «Ver mis
  permisos».

---

## 4. Decisiones que no cambian

- Los permisos se resuelven en el servidor y nunca por el nombre del rol (`toolRegistry.evaluateTool`).
- La propuesta vive en el servidor y el cliente solo envía `actionId`.
- El saldo se comprueba antes y se cobra después (`chargeAiCredits`). Una respuesta fallida no se
  cobra.
- Los modelos no se cablean (`ai_assistant_settings.model_overrides` → `ai_settings` → variable de
  entorno → valor por defecto). El nombre del modelo **no se muestra** al cliente.

---

## 5. Cambios de código que implicaría (para la sesión de GO Asistente)

No se tocó nada. Van en orden de impacto.

1. **Ancho y modos** (`AIAssistantPanel.tsx:947-958`):
   - `w-80 xl:w-96` → `w-[400px]` en modo acoplado y `w-[720px]` en ampliado.
   - Guardar el modo en `localStorage` (`go-assistant:modo`), con `try/catch`.
   - En ampliado, pedir al shell que ponga el sidebar en *rail*. Hace falta exponer ese estado desde
     `SidebarShell`.
2. **Estado global y atajo** (`AppLayout.tsx:119`):
   - Llevar `aiAssistantOpen` a un contexto (`AssistantProvider`) con `open`, `close`, `toggle`,
     `setModo` y `focusComposer`.
   - Registrar **Ctrl/Cmd+J**, respetando `input` y `contenteditable` como hace el buscador con
     Ctrl+K. Esc cierra si el foco está en el panel.
   - Añadir el tooltip del botón con el atajo.
3. **Pestaña lateral** (`AppLayout.tsx:987-996`): pasar de 40×40 a 28×96 con el robot, como el
   `AssistantLauncher` edge-tab de Figma.
4. **Header compacto con el panel abierto** (`AppHeader.tsx`): recibir `asistenteAbierto` y el
   modo, y aplicar:
   - Buscador en solo icono.
   - Chip del plan oculto.
   - En ampliado: «Reportar problema» al menú de sesión y el botón del asistente solo con icono.
5. **Cabecera** (`AIAssistantPanel.tsx:653-710`):
   - Título `t('assistant')` → «GO Asistente», en los 4 idiomas.
   - `bg-blue-600` → `bg-brand` (Azul GO).
   - Papelera → `SquarePen` «Nueva conversación».
   - Voz activa en blanco sólido con icono Azul GO, no en verde.
   - Botón Ampliar/Reducir.
   - Tooltips con el nombre de cada acción.
6. **Mensajes** (`:746-798`):
   - Quitar los avatares y el degradado morado.
   - Asistente a todo el ancho, usuario en Azul acción.
   - Añadir «Copiar».
7. **Sugerencias con contexto**:
   - `loadSuggestions` debe enviar `{ currentPath }`.
   - `suggestions/route.ts` y `generateQuickSuggestions` deben usarlo.
   - Añadir el chip de página en `Composer.tsx`.
8. **Créditos visibles**:
   - Nuevo `GET /api/ai-assistant/credits` (o incluir el saldo en `meta` y `usage` del stream) con
     `getServerOrgContext`.
   - Mostrar el saldo en el pie del composer.
   - Aviso ámbar por debajo de 50 y aviso rojo en 0, con el composer bloqueado y un enlace a
     comprar.
   - Si al abrir el panel `checkAICredits` da 0, mostrar el aviso sin esperar a que el usuario
     escriba.
9. **Tarjeta de acción con estados** (`ActionConfirmationForm.tsx`):
   - Estados `ejecutando`, `completada` (con «Ver <entidad>» usando `entity_type`/`entity_id` y
     «Deshacer» con los minutos restantes) y `error`.
   - Quitar los mensajes `✅`/`❌` de `handleConfirmAction` (`:406-413`).
   - Atajos Ctrl+Enter y Esc.
10. **Carga masiva ampliable** (`BulkPreviewTable.tsx`):
    - Modo compacto con contadores y filas con problemas.
    - Modo ancho con columnas SKU, Precio, Stock y Estado con `Badge`.
    - Botón «Ver en grande» que llama a `setModo('ampliado')`.
11. **Pasos del stream:** plegarlos cuando empiezan a llegar tokens y mostrar un cursor. El estado
    «pensando» sustituye a los tres puntos.
12. **Errores y permisos:**
    - Aviso aparte con «Reintentar» manual cuando `result.ok === false`.
    - Si el servidor deniega una herramienta por permisos, emitir `error` con
      `code:'FORBIDDEN_TOOL'` (o un evento `notice`) para pintar el aviso «sin permiso».
13. **Pie:** quitar «Modelo: …» (`:937`) y dejar el aviso y el enlace a permisos en una sola línea.
14. **Contexto de sucursal:** pasar `branchId` y `branchName` en el `context` de
    `AppLayout.tsx:978-983`. Hoy no llegan, y `CustomerFormDialog` recibe `null`.
15. **Teclado en QuestionCard:** A, B, C y D eligen la opción mientras la tarjeta tiene el foco.

Sin cambios de BD para lo anterior. Opcional: guardar `credits` por mensaje en
`ai_assistant_messages`, porque hoy está vacío en todas las filas.

---

## 6. Chequeo y lo que quedó pendiente

**Chequeo por script de las dos secciones:**
- 0 solapes entre hijos de las secciones.
- 0 nodos fuera de las secciones.
- 0 instancias rotas: 1.342 en las pantallas y 275 en los componentes.
- 0 anotaciones dentro de frames: las 16 anotaciones son hermanas de los frames.
- 0 textos recortados contra sus ancestros con recorte.
- 0 elipsis activas.
- 0 variantes solapadas.

**Pendiente: se agotó el cupo del MCP de Figma a mitad de la verificación.**
- Los avisos de las pantallas **13** (`668:39619`) y **14** (`668:40068`) todavía **se ven con el
  texto de «Te quedan 18 créditos»** en las capturas `40-asistente-13-error.png` y
  `40-asistente-14-sin-permiso.png`.
- **Causa:** `AsistenteAviso` tenía las propiedades de texto «Título» y «Descripción» compartidas
  entre variantes. Se eliminaron y cada variante tiene ya su texto, pero las instancias conservaron
  el texto anterior como *override*.
- Se lanzó una corrección sobre las 4 instancias; en la pantalla 12 funcionó y en la 13 y la 14 no
  pudo comprobarse.
- **Para cerrarlo:** en el SLOT «Conversación» de cada pantalla, restablecer los *overrides* de
  texto de la instancia `AsistenteAviso` (o fijar el título y la descripción de su variante) y
  volver a exportar las dos capturas.
- Los textos correctos son los de `AsistenteAviso` Tipo=error y Tipo=sin permiso (`664:16499`).

---

## 7. Preguntas para el dueño

1. **Icono.** El encargo decía «icono propio Assistant-A», pero en el archivo la decisión 22
   (posterior a la 19) fija el **robot** en el header, la barra inferior y la cabecera, y
   `Icon/Assistant-A` está en «99 Descartes» como «no elegida». Se usó el robot. Todo es una
   instancia intercambiable, así que cambiarlo es un solo cambio. ¿Robot o Assistant-A?
2. **Ancho acoplado:** ¿400 px (propuesta) o se mantienen los 384 de hoy? Con 400, una tabla de 3
   columnas cabe sin apretarse.
3. **Modo ampliado:** ¿720 px con el sidebar en *rail* (propuesta), o pantalla completa sobre el
   contenido?
4. **Atajo:** ¿Ctrl+J para el asistente? Ctrl+K ya es del buscador.
5. **Créditos:** ¿mostrar el saldo a todos los usuarios o solo a administradores? El aviso de
   «bajos» usa el umbral de 50 (unas 10 respuestas): ¿está bien?
6. **Comprar créditos desde el panel:** ¿el enlace lleva a la página del plan, o se abre allí
   mismo el *checkout* de créditos?
7. **Voz de salida:** hoy está apagada en las 85 organizaciones. ¿Se muestra el botón de la
   cabecera aunque la organización no la tenga (deshabilitado con tooltip), o se oculta?
8. **Header compacto:** con el panel abierto, ¿vale que el buscador pase a icono y que el chip del
   plan se oculte?
9. **Recordar el estado:** ¿el panel debe seguir abierto al cambiar de página o al recargar si el
   usuario lo dejó abierto?
