# Inventario para Figma: módulo Chat y Roles y permisos (2026-11-13)

Base para la sección 91 del archivo de Figma (`EAvjINVRnlzFM70GVoWXgl`).
Las pantallas se dibujan primero en Figma; el código cambia solo tras aprobación.

## Hallazgos que afectan al diseño

- Rutas vigentes de Chat: las de español. `channels/*` y `conversations/*` en inglés son legado (`return null` o redirección).
- La vista completa de una conversación ("Asignado a") muestra «Agente #id», no el nombre.
- En móvil, la vista completa de conversación no tiene el panel lateral (Info, Acciones, Notas, IA): hueco a diseñar.
- La bandeja no tiene asignar, notas internas ni IA; solo la vista completa.
- La bandeja envía WhatsApp por `/api/crm/whatsapp/send`; la vista completa guarda directo (`conversationDetailService.sendMessage`).
- `ChatNavTabs` solo aparece en Auditoría y Widget.
- «Volver» de las cabeceras de canal y «Gestionar canales» apuntan a `/app/chat/channels`; `canales/page.tsx:194` apunta a `/canales/{id}/settings`, que no existe; `ConfigNavTabs.tsx` apunta a rutas inexistentes.
- Las páginas de Chat no tienen pantalla «sin permiso» propia: el middleware reescribe a `/app/modulo-no-habilitado`.
- Roles ya se diseñó como «Organización › Equipo › Roles y permisos», pero en el menú sigue como módulo aparte (`catalog.ts:605-610`, marcado PENDIENTE).
- `HojaQuePuedeHacer` dice abrirse desde Miembros, pero `MiembrosPantalla.tsx` no la usa.

## 1. Chat — pantallas

Menú (`src/lib/navigation/catalog.ts:318-333`): Bandeja, Canales, Conocimiento, IA (→ laboratorio), Widget (sesiones), Auditoría.
`/app/chat` → primera página activa. `/app/chat/ia/configuracion` → `/app/configuracion?modulo=chat&seccion=ia`.

1. **Bandeja** `/app/chat/bandeja`: lista «Chats» (buscador, filtros Estado/Prioridad/Canal/Etiqueta, fila con avatar, último mensaje, ✓✓, no leídos, prioridad, carga infinita, tiempo real) + hilo `inbox/ChatView.tsx` (cabecera con prioridad y etiquetas, menú Acciones: vista completa, perfil, buscar, cerrar/pendiente/reabrir; burbujas texto/imagen/archivo/audio; `ChatInput` con adjuntos, emojis, respuestas rápidas «/», audio; cerrada → aviso) + panel `CustomerProfilePanel` y `SearchPanel`. Estados: sin selección, vacío, sin resultados, esqueletos. Móvil: lista ↔ hilo.
2. **Conversación completa** `/conversaciones/[id]`: `ConversationHeader` (estado, prioridad, IA Auto/Híbrido, asignado; archivos, actividad, menú) · `MessageTimeline` · `MessageInput` (respuesta sugerida «Usar») · panel derecho con pestañas Info (cliente + respuestas rápidas), Acciones (estado, prioridad, asignado, etiquetas, «Marcar como resuelta»), Notas (internas, fijar, eliminar), IA (resumen, respuesta sugerida, enviar/editar, 👍👎).
3. **Actividad** `/conversaciones/[id]/actividad`: KPIs (Total, Estado, Asignaciones, Etiquetas, Trabajos IA, Auditoría), buscador, filtro de tipo, «Exportar CSV».
4. **Archivos** `/conversaciones/[id]/archivos`: KPIs, buscador, Tipo, Enviado por; tarjeta con abrir, descargar, copiar enlace (expira 1 h), eliminar con confirmación.
5. **Nueva conversación** `/conversaciones/nueva`: canal (sin canales → aviso), cliente (buscar o «Crear Cliente Rápido»), asunto, mensaje inicial, prioridad, asignar, etiquetas; validaciones y «sin permiso para crear».
6. **Canales** `/canales`: cabecera con KPIs y «Nuevo Canal»; «Canales Disponibles» (WhatsApp, Instagram, Facebook, Sitio web; Telegram y Email próximamente); «Mis Canales» con interruptor, Modo IA y menú; `CreateChannelDialog` (tipo, nombre, modo IA, conexión WhatsApp Cloud API / Coexistence / QR ⚠️); `WidgetCodeDialog`.
7. **WhatsApp** `/canales/whatsapp/[id]`: estadísticas; pestañas Cloud API (Embedded Signup o credenciales manuales), Coexistence, QR (aviso de riesgo, iniciar/detener/borrar sesión); webhook; eventos recientes.
8. **Instagram / Facebook** `/canales/{instagram,facebook}/[id]`: estadísticas, credenciales, webhook, eventos.
9. **Sitio web** `/canales/sitio-web/[id]`: KPIs de sesiones; mostrar en sitio, código e instalación (rotar clave), dominios permitidos, modo IA, posición, estilo, comportamiento al abrir, recolección de datos; vista previa en vivo.
10. **Conocimiento** `/conocimiento`: KPIs, «Config. IA», «Importar», «Nueva Fuente»; pestañas Fuentes y Todos los fragmentos; diálogos de fuente, fragmento y eliminar.
11. **Fuente** `/conocimiento/fuentes/[id]`: KPIs, tabla de fragmentos, reindexar, configuración de la fuente.
12. **Fragmento** `/conocimiento/fragmentos/[id]`: editor (título, contenido, etiquetas) y metadatos (prioridad, indexación, hash, votos, versión).
13. **Importar** `/conocimiento/importar`: CSV o texto plano («---»), ajustes, vista previa, resultado.
14. **IA**: Configurar (en Configuración › Chat › IA: Modelo, Comportamiento, Canales), **Laboratorio** (consulta, respuesta con tokens/tiempo/costo, ajustes de prueba, fragmentos recuperados), **Trabajos** (KPIs, filtros, tabla, detalle con Información/Respuesta/Logs/Error, reintentar/cancelar).
15. **Widget · Sesiones** `/widget/sesiones`: KPIs, filtros, tarjetas de sesión, detalle, paginación.
16. **Auditoría** `/auditoria`: KPIs, filtros (acción, entidad, actor), tarjetas, detalle, exportar.

## 2. Organización y Roles

Organización (`catalog.ts:600-621`): Equipo (Miembros, Invitaciones) · Sedes (Sucursales) · Plan y facturación (Plan, Compras, Módulos) · Marca (Información, Mis organizaciones). Marco común `PantallaOrganizacion.tsx`; pestañas Miembros · Invitaciones en `PestanasEquipo.tsx`.

Roles (`src/components/roles/`):
- `/app/roles` (`PantallaRoles.tsx`): pestañas Roles · Cargos · Comparar; «¿Qué puede hacer esta persona?», «Comparar roles», «Nuevo rol».
- Diálogos: `DialogoNuevoRol`, `DialogoEliminarRol` (reasignar), `DialogoAsignarRol`, `SelectorPersona`, `HojaQuePuedeHacer` (rol + cargo, origen de cada permiso, alcance por sucursal).
- `/app/roles/[id]` (`EditorRol.tsx`): datos del rol, `MatrizPermisos` (Ver/Crear/Editar/Eliminar/Aprobar/Otras, sensibles), panel de cambios, personas con el rol, revisión, conflicto, salir sin guardar; rol del sistema en solo lectura.
- `/app/roles/cargos/[id]` (`EditorCargo.tsx`): matriz con «Ya lo da el rol».

### Para mover Roles dentro de Organización (cuando se apruebe)

1. `catalog.ts`: página «Roles y permisos» en grupo Equipo de `organizations`; quitar el módulo `roles`.
2. `rutasModulos.ts` (copia del middleware) igual.
3. BD: migrar `job_position_module_access` (`module_code='roles'`) y `organization_module_pages` (`/app/roles`); decidir el registro `roles` de `modules`; revisar `MODULOS_BASE` (`inicio.server.ts:207`) y `MODULOS_CORE` (`reportes/types.ts:242`).
4. Tests: `filtrar.test.ts:211`, `rutasModulos.test.ts:43`, `rutasModuloSinFantasmas.test.ts:31`, `redirecciones.test.ts`.
5. `PestanasEquipo.tsx`: tercera pestaña «Roles y permisos».
6. Si cambia la URL a `/app/organizacion/roles`: redirecciones 308 en `next.config.js` y enlaces en `PantallaRoles.tsx`, `EditorRol.tsx`, `EditorCargo.tsx`, `ListaCargos.tsx`, `src/lib/ai/agent/guias/guias.ts`, `middleware.ts:780`, `useSubscriptionGuard.ts:11`; clave `nav.paginas.*` en los 4 idiomas.
7. El buscador global toma el menú: no requiere cambio propio.
8. Añadir «¿Qué puede hacer?» al menú de fila de Miembros.
