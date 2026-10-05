# CRM en Figma — pantallas nuevas pendientes de aprobación

> **Estado: alcance aprobado por el dueño para implementación en el PR 280.** El orden acordado es integridad y cifras, ficha y conexiones comerciales, y adaptación de las áreas nuevas al sistema visual. El estado de implementación y verificación se registra en [PLAN-FIGMA-A-CODIGO.md](PLAN-FIGMA-A-CODIGO.md).
> Archivo Figma `EAvjINVRnlzFM70GVoWXgl` (GO Admin), página «11 CRM» (`759:17`).
> Actualizado el 2026-09-30. Datos de ejemplo inventados («Mi empresa», clientes ficticios); ningún nombre de organización cliente.

## Resumen

| Grupo | Sección | Frames | Hechos por agentes anteriores | Hechos en esta ronda |
|---|---|---|---|---|
| 1 · Telefonía y llamadas | [`1300:85046`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1300-85046) | 42 | 19 (softphone del navegador y contexto) | 23 (Electron, app móvil, Llamadas) |
| 2 · IA y automatización | [`1295:767945`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1295-767945) | 50 | 10 (Agentes IA) | 40 (Automatizaciones, Segmentos, Campañas, Plantillas, Secuencias, Objeciones) |
| 3 · Red y gestión | [`1295:767955`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1295-767955) | 43 | 14 (Referidos, Partners) | 29 (estados de Partners, Equipo, Salud, Pronósticos, Identidades) |
| **Total** | | **135** | 43 | 92 |

Las tres secciones están en «11 CRM», una al lado de la otra (x = 31.600 / 41.600 / 51.600), sin solaparse con
«CRM — Leads…» (x = 20.000) ni con «CRM — Pipeline y oportunidades» (`768:454425`, que no se tocó).
Cada frame lleva debajo una «Anotación» con el comportamiento y la tabla/API real (verificada por MCP el 2026-09-30).
Verificación: 0 solapamientos entre hijos de cada sección y 0 instancias rotas (script de solo lectura).

Convenciones: escritorio 1440 × 960 (sidebar + AppHeader + PageHeader del kit), móvil 390 × 844
(MobileHeader + MobileTabBar del kit). Nombres `CRM/<grupo>/<pantalla>/<estado>`.

## Frames

### 1 · CRM · Telefonía y llamadas (Nuevo) — sección [`1300:85046`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1300-85046) · 42 frames


**Navegador**

- [`1301:769613`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1301-769613) CRM/Telefonía/Navegador/Marcador/listo · _(agente anterior)_
- [`1301:769715`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1301-769715) CRM/Telefonía/Navegador/Permiso de micrófono/pedido · _(agente anterior)_
- [`1301:769793`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1301-769793) CRM/Telefonía/Navegador/Permiso de micrófono/bloqueado · _(agente anterior)_
- [`1303:770806`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1303-770806) CRM/Telefonía/Navegador/Aviso previo/Ley 2300 fuera de horario · _(agente anterior)_
- [`1303:770890`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1303-770890) CRM/Telefonía/Navegador/Aviso previo/número en RNE · _(agente anterior)_
- [`1303:770976`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1303-770976) CRM/Telefonía/Navegador/Aviso previo/tope semanal alcanzado · _(agente anterior)_
- [`1311:771329`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-771329) CRM/Telefonía/Navegador/Llamada saliente/conectando · _(agente anterior)_
- [`1311:771377`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-771377) CRM/Telefonía/Navegador/Llamada saliente/timbrando · _(agente anterior)_
- [`1311:771430`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-771430) CRM/Telefonía/Navegador/En llamada/cliente reconocido · _(agente anterior)_
- [`1311:773865`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-773865) CRM/Telefonía/Navegador/En llamada/silenciado con teclado DTMF · _(agente anterior)_
- [`1311:774019`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-774019) CRM/Telefonía/Navegador/En llamada/en espera · _(agente anterior)_
- [`1311:774119`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-774119) CRM/Telefonía/Navegador/En llamada/transferir · _(agente anterior)_
- [`1313:774306`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-774306) CRM/Telefonía/Navegador/Llamada entrante/cliente conocido · _(agente anterior)_
- [`1313:774365`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-774365) CRM/Telefonía/Navegador/Llamada entrante/número desconocido · _(agente anterior)_
- [`1313:774413`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-774413) CRM/Telefonía/Navegador/No disponible/telefonía no configurada · _(agente anterior)_
- [`1316:89805`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1316-89805) CRM/Telefonía/Navegador/Fin de llamada/registrar resultado · _(agente anterior)_
- [`1316:89961`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1316-89961) CRM/Telefonía/Navegador/Fin de llamada/no volver a llamar · _(agente anterior)_
- [`1318:777486`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-777486) CRM/Telefonía/Navegador/Contexto/marcador abierto desde el header · _(agente anterior)_
- [`1318:777573`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-777573) CRM/Telefonía/Navegador/Contexto/«Llamar» desde la ficha del cliente · _(agente anterior)_

**Electron**

- [`1334:94961`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1334-94961) CRM/Telefonía/Electron/Ventana compacta/marcador
- [`1334:95037`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1334-95037) CRM/Telefonía/Electron/Ventana compacta/en llamada
- [`1334:95105`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1334-95105) CRM/Telefonía/Electron/Ventana compacta/sin conexión
- [`1334:95196`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1334-95196) CRM/Telefonía/Electron/Notificación nativa/llamada entrante
- [`1334:95334`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1334-95334) CRM/Telefonía/Electron/Bandeja/menú con teléfono
- [`1334:95420`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1334-95420) CRM/Telefonía/Electron/Notificación nativa/llamada perdida

**Móvil**

- [`1336:95991`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1336-95991) CRM/Telefonía/Móvil/Marcador/listo
- [`1336:96171`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1336-96171) CRM/Telefonía/Móvil/Llamada/conectando por puente
- [`1336:96331`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1336-96331) CRM/Telefonía/Móvil/Llamada/en curso
- [`1336:96518`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1336-96518) CRM/Telefonía/Móvil/Llamada entrante/cliente conocido
- [`1341:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1341-17) CRM/Telefonía/Móvil/Historial/listo
- [`1341:359`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1341-359) CRM/Telefonía/Móvil/Historial/cargando
- [`1341:579`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1341-579) CRM/Telefonía/Móvil/Historial/vacío
- [`1341:806`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1341-806) CRM/Telefonía/Móvil/Historial/sin conexión
- [`1341:988`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1341-988) CRM/Telefonía/Móvil/Fin de llamada/registrar resultado

**Llamadas**

- [`1351:18`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1351-18) CRM/Telefonía/Llamadas/Listado/listo
- [`1358:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1358-17) CRM/Telefonía/Llamadas/Listado/cargando
- [`1358:1082`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1358-1082) CRM/Telefonía/Llamadas/Listado/vacío
- [`1358:1687`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1358-1687) CRM/Telefonía/Llamadas/Listado/error
- [`1363:20`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1363-20) CRM/Telefonía/Llamadas/Detalle/listo
- [`1365:800947`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1365-800947) CRM/Telefonía/Llamadas/Detalle/transcribiendo
- [`1365:801445`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1365-801445) CRM/Telefonía/Llamadas/Detalle/sin grabación
- [`1368:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1368-17) CRM/Telefonía/Llamadas/Detalle/móvil

### 2 · CRM · IA y automatización (Nuevo) — sección [`1295:767945`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1295-767945) · 50 frames


**Agentes**

- [`1298:84133`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1298-84133) CRM/IA/Agentes/Listado — listo · _(agente anterior)_
- [`1311:86823`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-86823) CRM/IA/Agentes/Detalle — métricas · _(agente anterior)_
- [`1313:773321`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-773321) CRM/IA/Agentes/Editor — 1 propósito e identidad · _(agente anterior)_
- [`1313:773766`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-773766) CRM/IA/Agentes/Editor — 2 guion por etapas · _(agente anterior)_
- [`1316:774933`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1316-774933) CRM/IA/Agentes/Editor — 3 voz e idioma · _(agente anterior)_
- [`1316:775504`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1316-775504) CRM/IA/Agentes/Editor — 4 herramientas y cumplimiento · _(agente anterior)_
- [`1318:775924`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-775924) CRM/IA/Agentes/Editor — 5 prueba de conversación · _(agente anterior)_
- [`1318:776412`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-776412) CRM/IA/Agentes/Listado — cargando · _(agente anterior)_
- [`1318:776789`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-776789) CRM/IA/Agentes/Listado — vacío · _(agente anterior)_
- [`1318:777124`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-777124) CRM/IA/Agentes/Listado — error · _(agente anterior)_

**Automatizaciones**

- [`1373:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1373-17) CRM/IA/Automatizaciones/Listado — listo
- [`1373:1161`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1373-1161) CRM/IA/Automatizaciones/Historial de ejecuciones
- [`1375:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1375-17) CRM/IA/Automatizaciones/Constructor — disparador, condiciones y acciones
- [`1379:776`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1379-776) CRM/IA/Automatizaciones/Constructor — prueba en seco
- [`1379:1336`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1379-1336) CRM/IA/Automatizaciones/Listado — vacío
- [`1379:1891`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1379-1891) CRM/IA/Automatizaciones/Listado — cargando
- [`1379:2446`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1379-2446) CRM/IA/Automatizaciones/Listado — error

**Segmentos**

- [`1384:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1384-17) CRM/IA/Segmentos/Listado — listo
- [`1384:1045`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1384-1045) CRM/IA/Segmentos/Miembros
- [`1384:825677`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1384-825677) CRM/IA/Segmentos/Constructor — conteo en vivo
- [`1388:632`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1388-632) CRM/IA/Segmentos/Listado — vacío
- [`1388:1079`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1388-1079) CRM/IA/Segmentos/Listado — cargando
- [`1388:1532`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1388-1532) CRM/IA/Segmentos/Listado — error
- [`1388:1979`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1388-1979) CRM/IA/Segmentos/Constructor — conteo no disponible

**Campañas**

- [`1395:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1395-17) CRM/IA/Campañas/Listado — listo
- [`1395:1065`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1395-1065) CRM/IA/Campañas/Asistente — 1 audiencia y canal
- [`1402:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1402-17) CRM/IA/Campañas/Asistente — 2 agente y guion
- [`1402:821`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1402-821) CRM/IA/Campañas/Asistente — 3 horario Ley 2300, RNE y datos
- [`1404:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-17) CRM/IA/Campañas/Panel — en curso
- [`1404:831178`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-831178) CRM/IA/Campañas/Panel — detenida por emergencia
- [`1404:829863`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-829863) CRM/IA/Campañas/Listado — vacío
- [`1404:830283`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-830283) CRM/IA/Campañas/Listado — cargando
- [`1404:830739`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-830739) CRM/IA/Campañas/Listado — error

**Plantillas**

- [`1404:831575`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-831575) CRM/IA/Plantillas/Biblioteca — listo
- [`1404:832164`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-832164) CRM/IA/Plantillas/Editor de correo — variables y vista previa
- [`1405:118336`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1405-118336) CRM/IA/Plantillas/Editor de WhatsApp — en revisión de Meta
- [`1405:832049`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1405-832049) CRM/IA/Plantillas/Biblioteca — vacío (WhatsApp)
- [`1405:832447`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1405-832447) CRM/IA/Plantillas/Biblioteca — cargando
- [`1405:832838`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1405-832838) CRM/IA/Plantillas/Biblioteca — error de Meta

**Secuencias**

- [`1406:117444`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1406-117444) CRM/IA/Secuencias/Listado — listo
- [`1406:118109`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1406-118109) CRM/IA/Secuencias/Inscritos
- [`1407:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1407-17) CRM/IA/Secuencias/Editor — pasos, esperas y condiciones de salida
- [`1408:117970`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1408-117970) CRM/IA/Secuencias/Listado — vacío
- [`1408:118427`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1408-118427) CRM/IA/Secuencias/Listado — cargando
- [`1408:118914`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1408-118914) CRM/IA/Secuencias/Listado — error

**Objeciones**

- [`1409:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1409-17) CRM/IA/Objeciones/Biblioteca — listo
- [`1410:118018`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1410-118018) CRM/IA/Objeciones/Detalle — respuestas y llamadas
- [`1410:118600`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1410-118600) CRM/IA/Objeciones/Móvil — consulta rápida en llamada
- [`1410:835968`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1410-835968) CRM/IA/Objeciones/Biblioteca — sin resultados
- [`1410:836476`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1410-836476) CRM/IA/Objeciones/Biblioteca — cargando

### 3 · CRM · Red y gestión (Nuevo) — sección [`1295:767955`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1295-767955) · 43 frames


**Referidos**

- [`1298:768716`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1298-768716) CRM/Red/Referidos/Listo · _(agente anterior)_
- [`1301:85046`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1301-85046) CRM/Red/Referidos/Programa · _(agente anterior)_
- [`1303:85692`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1303-85692) CRM/Red/Referidos/Registrar · _(agente anterior)_
- [`1303:85899`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1303-85899) CRM/Red/Referidos/Convertir a lead · _(agente anterior)_
- [`1311:771575`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-771575) CRM/Red/Referidos/Recompensas · _(agente anterior)_
- [`1311:772386`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-772386) CRM/Red/Referidos/Vacío · _(agente anterior)_
- [`1311:772852`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-772852) CRM/Red/Referidos/Cargando · _(agente anterior)_
- [`1311:773405`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-773405) CRM/Red/Referidos/Error · _(agente anterior)_
- [`1313:88789`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-88789) CRM/Red/Referidos/Móvil — listo · _(agente anterior)_
- [`1313:89380`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-89380) CRM/Red/Referidos/Móvil — registrar (hoja) · _(agente anterior)_

**Partners**

- [`1316:773848`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1316-773848) CRM/Red/Partners/Directorio · _(agente anterior)_
- [`1316:776081`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1316-776081) CRM/Red/Partners/Ficha del partner · _(agente anterior)_
- [`1318:91569`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-91569) CRM/Red/Partners/Registrar deal · _(agente anterior)_
- [`1319:94585`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1319-94585) CRM/Red/Partners/Comisiones y niveles · _(agente anterior)_
- [`1411:41956`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1411-41956) CRM/Red/Partners/Vacío
- [`1411:42449`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1411-42449) CRM/Red/Partners/Cargando
- [`1411:42968`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1411-42968) CRM/Red/Partners/Error
- [`1438:1908`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1438-1908) CRM/Red/Partners/Móvil — ficha del partner

**Equipo**

- [`1411:837770`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1411-837770) CRM/Red/Equipo/Equipos y miembros
- [`1411:838455`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1411-838455) CRM/Red/Equipo/Territorios
- [`1412:837868`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1412-837868) CRM/Red/Equipo/Asignación automática
- [`1412:838392`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1412-838392) CRM/Red/Equipo/Desempeño
- [`1413:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1413-17) CRM/Red/Equipo/Territorios — vacío
- [`1413:726`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1413-726) CRM/Red/Equipo/Territorios — cargando
- [`1413:1051`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1413-1051) CRM/Red/Equipo/Móvil — mi cuota y ranking

**Salud**

- [`1415:19`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1415-19) CRM/Red/Salud/Panel — lista priorizada
- [`1424:17`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1424-17) CRM/Red/Salud/Detalle — factores, tendencia y acciones
- [`1424:932`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1424-932) CRM/Red/Salud/Configuración de factores
- [`1424:840685`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1424-840685) CRM/Red/Salud/Panel — sin datos suficientes
- [`1424:841103`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1424-841103) CRM/Red/Salud/Panel — cargando
- [`1424:841631`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1424-841631) CRM/Red/Salud/Móvil — clientes en riesgo

**Pronósticos**

- [`1431:19`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1431-19) CRM/Red/Pronósticos/Trimestre — por vendedor
- [`1434:648`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1434-648) CRM/Red/Pronósticos/Vendedor — oportunidades por categoría
- [`1434:1185`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1434-1185) CRM/Red/Pronósticos/Ajuste con motivo (diálogo)
- [`1434:842149`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1434-842149) CRM/Red/Pronósticos/Sin cuotas definidas
- [`1434:842588`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1434-842588) CRM/Red/Pronósticos/Cargando
- [`1434:843089`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1434-843089) CRM/Red/Pronósticos/Móvil — mi pronóstico

**Identidades**

- [`1436:19`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1436-19) CRM/Red/Identidades/Duplicados — listo
- [`1436:843123`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1436-843123) CRM/Red/Identidades/Comparar y fusionar
- [`1436:843665`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1436-843665) CRM/Red/Identidades/Historial y deshacer
- [`1438:721`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1438-721) CRM/Red/Identidades/Duplicados — vacío
- [`1438:1130`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1438-1130) CRM/Red/Identidades/Duplicados — buscando
- [`1438:1553`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1438-1553) CRM/Red/Identidades/Fusión — error, nada cambió

## Componentes

**No se crearon componentes nuevos en esta ronda.** Todo se armó con instancias de «02 Componentes»:

- Kit: `Sidebar`, `AppHeader`, `PageHeader`, `Breadcrumbs`, `Button`, `IconButton`, `Badge`, `Chip`, `StatCard`,
  `SegmentedControl`, `SearchBar`, `Select`, `SearchSelect`, `DateRange`, `FilterButton`, `FormField`,
  `NumberInput`, `Checkbox`, `Switch`, `Progress`, `Skeleton`, `EmptyState`, `Pagination`, `Avatar`,
  `IconoDestacado`, `Isotipo`, `MobileHeader`, `MobileTabBar` e íconos `Icon/*`.
- «CRM — Telefonía y llamadas (Nuevo)» (`1295:36609`, creados por el agente anterior): `Softphone/Tecla`,
  `Softphone/Control`, `Softphone/BotonLlamada`, `Llamada/ResultadoOpcion`, `Llamada/Reproductor`,
  `Llamada/SegmentoTranscripcion` y los 12 íconos de telefonía.
- Frames de CRM existentes como base: el shell de `CRM/IA/Agentes/Listado — listo` (`1298:84133`), el móvil de
  `CRM/Red/Referidos/Móvil — listo` (`1313:88789`), el marcador y «en llamada» del navegador (dentro de la ventana
  de Electron) y «marcador abierto desde el header» (fondo de la notificación nativa).

Candidatos a componente si se aprueban (se repiten en varias pantallas): pasos de asistente, tarjeta de requisito
de cumplimiento (rojo/verde con acción), tarjeta de canal seleccionable, barra de cobertura apilada, fila de factor
con peso, fila de comparación de fusión, burbuja de WhatsApp.

Defectos del kit encontrados (no corregidos, fuera del alcance):
- `Badge`: en algunas variantes (p. ej. Tono=peligro, Size=sm) el texto no está conectado a la propiedad «Texto»;
  hubo que sobrescribir el nodo de texto.
- `SegmentedControl` y `EmptyState` no exponen como propiedad las etiquetas ni el ícono.
- `Progress`: el relleno no depende de «Valor»; hay que ajustar el ancho a mano.

## Decisiones de diseño

- **Un solo softphone.** Electron y la app móvil no reimplementan la llamada: Electron abre una ventana compacta
  con la misma ruta web (SoftphoneProvider) y amplía el menú de bandeja existente (`electron/src/main/tray.ts`,
  hoy solo agente de impresión); la app móvil usa el **modo puente** ya construido (`mobileBridgeService`, FASE-05):
  Twilio llama al celular verificado del vendedor, que marca 1, y luego al cliente. En puente, silencio y altavoz
  son del marcador nativo; la app muestra contexto, cronómetro y notas.
- **Cumplimiento antes, no después.** Ley 2300 (ventana L–V 7–19, sáb 8–15, sin domingos ni festivos, tope
  semanal), RNE (verificación vigente 30 días + `crm_excluded_numbers`) y URL de política de datos aparecen como
  requisitos en el asistente de campañas y en el aviso previo del softphone, con la misma lógica que ya aplica el
  servidor (`voiceAgent/ley2300.ts`, `rne.ts`, `runCampaignQueue`). Sin requisitos: se puede guardar, no activar.
- **La IA sugiere, la persona decide**: resumen, tareas, cambio de etapa y respuestas a objeciones siempre con
  botón explícito («Crear 2 tareas», «Aplicar», «Agregar como alternativa»); se registra `applied_by`.
- **Estados siempre con kit**: `Skeleton` para cargando, `EmptyState` (empty/search/error/forbidden) para vacío y
  error. Donde la BD real está vacía (secuencias, partners, referidos, territorios) el vacío es el estado de hoy y
  lleva plantilla o acción de arranque.
- **Pronóstico con categorías explícitas** (compromiso / mejor caso / pipeline / omitida) propuestas por
  probabilidad de etapa y ajustables por el vendedor; el supervisor ajusta con motivo, sin tocar oportunidades.
- **Fusión de clientes todo o nada y reversible 30 días**; el error explica la causa y confirma que no se movió nada.
- Móvil solo donde tiene sentido de campo (telefonía, objeciones en llamada, mi cuota, salud de mis clientes,
  mi pronóstico, partner, referidos); constructores y configuraciones quedan en escritorio.

## Qué requiere backend nuevo (si se aprueba)

| Pantalla | Qué falta |
|---|---|
| Electron ventana compacta, bandeja y notificación | `electron/src/main/windows/phoneWindow.ts`, IPC `phone:*`, notificación con acciones; menú de bandeja ampliado |
| Móvil llamada entrante | Push (FCM/APNs) y tabla de tokens de dispositivo; ruta de cancelación del puente (`/api/crm/calls/bridge/[id]/cancel`) |
| Llamadas: listado | Endpoint unificado de llamadas con permiso ver-todas en servidor; índice de texto sobre `call_transcripts.full_text` |
| Campañas: listado | Vista/RPC que una `campaigns` (WhatsApp/correo) y `voice_agent_campaigns` (voz) |
| Automatizaciones: prueba en seco | `POST /api/crm/automations/[id]/dry-run` (el motor ya guarda `dry_run` y `actions_plan`) |
| Segmentos | `POST /api/crm/segments/preview` (conteo en vivo con desglose por canal); tabla `segment_members` para estáticos |
| Plantillas WhatsApp | «Sincronizar con Meta» (el estado ya llega por webhook a `templates.metadata.status`) |
| Objeciones | RPC `crm_objection_frequency`; minería de respuestas exitosas y tabla `objection_responses` |
| Equipo | RPC `crm_territory_counts`; `POST /api/crm/assignment/simulate` |
| Pronósticos | Columna `opportunities.forecast_category` y tabla `forecast_adjustments` (con motivo y auditoría) |
| Identidades | RPC transaccional `crm_merge_customers` / `crm_unmerge_customer`, tablas `customer_merges` y `customer_merge_exclusions`, RPC `crm_find_duplicates`. Hoy `IdentidadesService.mergeCustomers` hace N updates desde el navegador sin transacción ni registro |

El resto se apoya en tablas y servicios que ya existen (`calls`, `call_*`, `voice_agent_*`, `automation_rules/runs`,
`segments`, `campaigns`, `templates`, `sequences*`, `objections`, `partners*`, `sales_teams*`, `territories`,
`health_score_*`, `sales_targets`, `customer_channel_identities`).
