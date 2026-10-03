# Verificación visual de las 135 pantallas del CRM

Registro UTC: 2026-10-03T00:04:07.611772+00:00. Inventario: [FIGMA-CRM-NUEVO.md](FIGMA-CRM-NUEVO.md). Archivo Figma: `EAvjINVRnlzFM70GVoWXgl`. Hashes y dimensiones por ID: [VERIFICACION-VISUAL-135.json](VERIFICACION-VISUAL-135.json).

**Cobertura: 135 IDs únicos, con 132 capturas locales de componentes reales comparadas con Figma y 3 contratos de interfaz nativa del sistema operativo sin PNG. Se verificaron 0 pantallas con sesión autenticada real.** Esta evidencia no certifica entrega de proveedores, dispositivos físicos, integración en producción ni igualdad píxel a píxel.

La auditoría estricta encontró 0 IDs faltantes, duplicados o ajenos al inventario, 0 archivos de referencia/captura ausentes, 0 divergencias entre hashes declarados y artefactos, 0 errores de ejecución inesperados y 0 desbordes horizontales. Tres mensajes HTTP esperados corresponden a estados de error controlados, no a fallos de producción.

Doce referencias usadas están reducidas a 1024 px de ancho y sus exports canónicos miden 1440 px. El JSON conserva las dos referencias y la captura con sus hashes y dimensiones. Los márgenes de sombra, el viewport local y la geometría nativa del sistema operativo también pueden variar; las dimensiones diferentes no se presentan como paridad visual.

Los hashes de fuente capturados y actuales permanecen separados. Hay45 registros con delta documentado:27 de telefonía por extracción del polling o ampliación del ámbito de fuentes,12 de Plantillas/Secuencias por actualización exclusiva de pruebas, y6 de Partners por corregir un token de una propiedad no consumida por los renders. Detalle y Comisiones de Partners se recapturaron. Las otras modificaciones conservaron JSX/PNG; los hashes históricos no se sustituyeron por los actuales.

## Cobertura por grupo

| Grupo | IDs | Capturas de componentes | Contratos OS sin PNG |
|---|---:|---:|---:|
| Agentes | 10 | 10 | 0 |
| Automatizaciones | 7 | 7 | 0 |
| Campañas | 9 | 9 | 0 |
| Electron | 6 | 3 | 3 |
| Equipo | 7 | 7 | 0 |
| Identidades | 6 | 6 | 0 |
| Llamadas | 8 | 8 | 0 |
| Móvil | 9 | 9 | 0 |
| Navegador | 19 | 19 | 0 |
| Objeciones | 5 | 5 | 0 |
| Partners | 8 | 8 | 0 |
| Plantillas | 6 | 6 | 0 |
| Pronósticos | 6 | 6 | 0 |
| Referidos | 10 | 10 | 0 |
| Salud | 6 | 6 | 0 |
| Secuencias | 6 | 6 | 0 |
| Segmentos | 7 | 7 | 0 |

## Límites funcionales y visuales

- **Telefonía y Electron:** el contexto se limita a campos canónicos; grabación exige prueba de habilitación, consentimiento e inicio. Las tres notificaciones/bandeja de Electron sólo tienen contrato de API comprobado; necesitan revisión en un sistema operativo real.
- **Móvil:** el puente PSTN utiliza la llamada del sistema; safe-area y controles dependen del dispositivo. El historial cubre el conjunto leído y la caché exige sesión vigente y el mismo ámbito.
- **Campañas y Segmentos:** se preservan el lenguaje de reglas y los lectores existentes. La planificación admite un intervalo diario; RNE necesita un borrador guardado. Costes y desgloses sin soporte de API se omiten.
- **Plantillas y Secuencias:** correo/WhatsApp están soportados; SMS no. Se conserva el editor HTML/bloques. Las salidas por reunión/cambio manual de etapa y la planificación por días hábiles de Figma no están soportadas por el motor; las métricas ausentes siguen desconocidas.
- **Referidos:** la decisión D2 convierte o vincula un cliente lead, sin crear automáticamente pipeline/etapa/oportunidad. Las recompensas usan importes mensuales reales; registrar un pago no transfiere dinero.
- **Partners:** ajustes de comisión usan permisos y registro atómico auditado. El Portal del partner es una propuesta sin backend/enlace revocable y no está implementado. La ficha conserva la política nativa de navegación inferior.
- **Equipo, Objeciones, Salud e Identidades:** se conserva el alcance de los contratos existentes, sin períodos históricos, días de adelanto, filtros de llamadas por objeción o puntuaciones inventadas. La evidencia local no acredita fusiones en producción.
- **Pronósticos:** `stages.probability` alimenta el ponderado; el mensual usa el snapshot completo. Sólo las metas mensuales explícitas generan cuota mensual; metas y ajustes trimestrales permanecen separados.

## Inventario de los 135 IDs

«Componente local» indica render real y comparación manual con referencia; «Δ fuente no visual» conserva el delta descrito arriba. «Contrato OS; visual pendiente» no equivale a una captura del escritorio.

| ID Figma | Grupo | Pantalla | Evidencia | Referencia usada → canónica | Captura |
|---|---|---|---|---|---|
| [1301:769613](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1301-769613) | Navegador | CRM/Telefonía/Navegador/Marcador/listo | Componente local · Δ fuente no visual | 416×641 → 416×641 | 360×576 |
| [1301:769715](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1301-769715) | Navegador | CRM/Telefonía/Navegador/Permiso de micrófono/pedido | Componente local · Δ fuente no visual | 416×507 → 416×507 | 360×431 |
| [1301:769793](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1301-769793) | Navegador | CRM/Telefonía/Navegador/Permiso de micrófono/bloqueado | Componente local · Δ fuente no visual | 416×527 → 416×527 | 360×477 |
| [1303:770806](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1303-770806) | Navegador | CRM/Telefonía/Navegador/Aviso previo/Ley 2300 fuera de horario | Componente local · Δ fuente no visual | 416×571 → 416×571 | 360×477 |
| [1303:770890](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1303-770890) | Navegador | CRM/Telefonía/Navegador/Aviso previo/número en RNE | Componente local · Δ fuente no visual | 416×615 → 416×615 | 360×477 |
| [1303:770976](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1303-770976) | Navegador | CRM/Telefonía/Navegador/Aviso previo/tope semanal alcanzado | Componente local · Δ fuente no visual | 416×599 → 416×599 | 360×477 |
| [1311:771329](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-771329) | Navegador | CRM/Telefonía/Navegador/Llamada saliente/conectando | Componente local · Δ fuente no visual | 416×467 → 416×467 | 360×427 |
| [1311:771377](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-771377) | Navegador | CRM/Telefonía/Navegador/Llamada saliente/timbrando | Componente local · Δ fuente no visual | 416×483 → 416×483 | 360×411 |
| [1311:771430](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-771430) | Navegador | CRM/Telefonía/Navegador/En llamada/cliente reconocido | Componente local · Δ fuente no visual | 416×557 → 416×557 | 360×491 |
| [1311:773865](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-773865) | Navegador | CRM/Telefonía/Navegador/En llamada/silenciado con teclado DTMF | Componente local · Δ fuente no visual | 416×693 → 416×693 | 360×649 |
| [1311:774019](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-774019) | Navegador | CRM/Telefonía/Navegador/En llamada/en espera | Componente local · Δ fuente no visual | 416×505 → 416×505 | 360×449 |
| [1311:774119](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-774119) | Navegador | CRM/Telefonía/Navegador/En llamada/transferir | Componente local · Δ fuente no visual | 416×583 → 416×583 | 360×517 |
| [1313:774306](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-774306) | Navegador | CRM/Telefonía/Navegador/Llamada entrante/cliente conocido | Componente local · Δ fuente no visual | 416×518 → 416×518 | 360×463 |
| [1313:774365](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-774365) | Navegador | CRM/Telefonía/Navegador/Llamada entrante/número desconocido | Componente local · Δ fuente no visual | 416×490 → 416×490 | 360×457 |
| [1313:774413](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-774413) | Navegador | CRM/Telefonía/Navegador/No disponible/telefonía no configurada | Componente local · Δ fuente no visual | 416×539 → 416×539 | 360×387 |
| [1316:89805](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1316-89805) | Navegador | CRM/Telefonía/Navegador/Fin de llamada/registrar resultado | Componente local · Δ fuente no visual | 576×809 → 576×809 | 520×762 |
| [1316:89961](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1316-89961) | Navegador | CRM/Telefonía/Navegador/Fin de llamada/no volver a llamar | Componente local · Δ fuente no visual | 576×751 → 576×751 | 520×690 |
| [1318:777486](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-777486) | Navegador | CRM/Telefonía/Navegador/Contexto/marcador abierto desde el header | Componente local · Δ fuente no visual | 1440×977 → 1440×977 | 1440×977 |
| [1318:777573](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-777573) | Navegador | CRM/Telefonía/Navegador/Contexto/«Llamar» desde la ficha del cliente | Componente local · Δ fuente no visual | 1440×900 → 1440×900 | 1440×900 |
| [1334:94961](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1334-94961) | Electron | CRM/Telefonía/Electron/Ventana compacta/marcador | Componente local | 444×685 → 444×685 | 380×621 |
| [1334:95037](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1334-95037) | Electron | CRM/Telefonía/Electron/Ventana compacta/en llamada | Componente local | 444×601 → 444×601 | 380×537 |
| [1334:95105](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1334-95105) | Electron | CRM/Telefonía/Electron/Ventana compacta/sin conexión | Componente local | 444×474 → 444×474 | 380×410 |
| [1334:95196](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1334-95196) | Electron | CRM/Telefonía/Electron/Notificación nativa/llamada entrante | Contrato OS; visual pendiente | 1440×900 → 1440×900 | Sin PNG |
| [1334:95334](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1334-95334) | Electron | CRM/Telefonía/Electron/Bandeja/menú con teléfono | Contrato OS; visual pendiente | 720×560 → 720×560 | Sin PNG |
| [1334:95420](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1334-95420) | Electron | CRM/Telefonía/Electron/Notificación nativa/llamada perdida | Contrato OS; visual pendiente | 420×240 → 420×240 | Sin PNG |
| [1336:95991](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1336-95991) | Móvil | CRM/Telefonía/Móvil/Marcador/listo | Componente local | 390×844 → 390×844 | 390×844 |
| [1336:96171](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1336-96171) | Móvil | CRM/Telefonía/Móvil/Llamada/conectando por puente | Componente local | 390×844 → 390×844 | 390×844 |
| [1336:96331](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1336-96331) | Móvil | CRM/Telefonía/Móvil/Llamada/en curso | Componente local | 390×844 → 390×844 | 390×844 |
| [1336:96518](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1336-96518) | Móvil | CRM/Telefonía/Móvil/Llamada entrante/cliente conocido | Componente local | 390×844 → 390×844 | 390×844 |
| [1341:17](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1341-17) | Móvil | CRM/Telefonía/Móvil/Historial/listo | Componente local | 390×844 → 390×844 | 390×844 |
| [1341:359](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1341-359) | Móvil | CRM/Telefonía/Móvil/Historial/cargando | Componente local | 390×844 → 390×844 | 390×844 |
| [1341:579](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1341-579) | Móvil | CRM/Telefonía/Móvil/Historial/vacío | Componente local | 390×844 → 390×844 | 390×844 |
| [1341:806](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1341-806) | Móvil | CRM/Telefonía/Móvil/Historial/sin conexión | Componente local | 390×844 → 390×844 | 390×844 |
| [1341:988](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1341-988) | Móvil | CRM/Telefonía/Móvil/Fin de llamada/registrar resultado | Componente local | 390×844 → 390×844 | 390×844 |
| [1351:18](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1351-18) | Llamadas | CRM/Telefonía/Llamadas/Listado/listo | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1358:17](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1358-17) | Llamadas | CRM/Telefonía/Llamadas/Listado/cargando | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1358:1082](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1358-1082) | Llamadas | CRM/Telefonía/Llamadas/Listado/vacío | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1358:1687](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1358-1687) | Llamadas | CRM/Telefonía/Llamadas/Listado/error | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1363:20](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1363-20) | Llamadas | CRM/Telefonía/Llamadas/Detalle/listo | Componente local · Δ fuente no visual | 1440×1180 → 1440×1180 | 1440×1180 |
| [1365:800947](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1365-800947) | Llamadas | CRM/Telefonía/Llamadas/Detalle/transcribiendo | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1365:801445](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1365-801445) | Llamadas | CRM/Telefonía/Llamadas/Detalle/sin grabación | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1368:17](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1368-17) | Llamadas | CRM/Telefonía/Llamadas/Detalle/móvil | Componente local · Δ fuente no visual | 390×844 → 390×844 | 390×844 |
| [1298:84133](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1298-84133) | Agentes | CRM/IA/Agentes/Listado — listo | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1311:86823](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-86823) | Agentes | CRM/IA/Agentes/Detalle — métricas | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1313:773321](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-773321) | Agentes | CRM/IA/Agentes/Editor — 1 propósito e identidad | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1313:773766](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-773766) | Agentes | CRM/IA/Agentes/Editor — 2 guion por etapas | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1316:774933](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1316-774933) | Agentes | CRM/IA/Agentes/Editor — 3 voz e idioma | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1316:775504](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1316-775504) | Agentes | CRM/IA/Agentes/Editor — 4 herramientas y cumplimiento | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1318:775924](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-775924) | Agentes | CRM/IA/Agentes/Editor — 5 prueba de conversación | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1318:776412](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-776412) | Agentes | CRM/IA/Agentes/Listado — cargando | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1318:776789](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-776789) | Agentes | CRM/IA/Agentes/Listado — vacío | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1318:777124](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-777124) | Agentes | CRM/IA/Agentes/Listado — error | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1373:17](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1373-17) | Automatizaciones | CRM/IA/Automatizaciones/Listado — listo | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1373:1161](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1373-1161) | Automatizaciones | CRM/IA/Automatizaciones/Historial de ejecuciones | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1375:17](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1375-17) | Automatizaciones | CRM/IA/Automatizaciones/Constructor — disparador, condiciones y acciones | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1379:776](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1379-776) | Automatizaciones | CRM/IA/Automatizaciones/Constructor — prueba en seco | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1379:1336](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1379-1336) | Automatizaciones | CRM/IA/Automatizaciones/Listado — vacío | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1379:1891](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1379-1891) | Automatizaciones | CRM/IA/Automatizaciones/Listado — cargando | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1379:2446](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1379-2446) | Automatizaciones | CRM/IA/Automatizaciones/Listado — error | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1384:17](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1384-17) | Segmentos | CRM/IA/Segmentos/Listado — listo | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1384:1045](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1384-1045) | Segmentos | CRM/IA/Segmentos/Miembros | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1384:825677](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1384-825677) | Segmentos | CRM/IA/Segmentos/Constructor — conteo en vivo | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1388:632](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1388-632) | Segmentos | CRM/IA/Segmentos/Listado — vacío | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1388:1079](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1388-1079) | Segmentos | CRM/IA/Segmentos/Listado — cargando | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1388:1532](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1388-1532) | Segmentos | CRM/IA/Segmentos/Listado — error | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1388:1979](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1388-1979) | Segmentos | CRM/IA/Segmentos/Constructor — conteo no disponible | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1395:17](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1395-17) | Campañas | CRM/IA/Campañas/Listado — listo | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1395:1065](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1395-1065) | Campañas | CRM/IA/Campañas/Asistente — 1 audiencia y canal | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1402:17](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1402-17) | Campañas | CRM/IA/Campañas/Asistente — 2 agente y guion | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1402:821](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1402-821) | Campañas | CRM/IA/Campañas/Asistente — 3 horario Ley 2300, RNE y datos | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1404:17](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-17) | Campañas | CRM/IA/Campañas/Panel — en curso | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1404:831178](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-831178) | Campañas | CRM/IA/Campañas/Panel — detenida por emergencia | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1404:829863](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-829863) | Campañas | CRM/IA/Campañas/Listado — vacío | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1404:830283](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-830283) | Campañas | CRM/IA/Campañas/Listado — cargando | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1404:830739](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-830739) | Campañas | CRM/IA/Campañas/Listado — error | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1404:831575](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-831575) | Plantillas | CRM/IA/Plantillas/Biblioteca — listo | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1404:832164](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1404-832164) | Plantillas | CRM/IA/Plantillas/Editor de correo — variables y vista previa | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1405:118336](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1405-118336) | Plantillas | CRM/IA/Plantillas/Editor de WhatsApp — en revisión de Meta | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1405:832049](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1405-832049) | Plantillas | CRM/IA/Plantillas/Biblioteca — vacío (WhatsApp) | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1405:832447](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1405-832447) | Plantillas | CRM/IA/Plantillas/Biblioteca — cargando | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1405:832838](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1405-832838) | Plantillas | CRM/IA/Plantillas/Biblioteca — error de Meta | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1406:117444](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1406-117444) | Secuencias | CRM/IA/Secuencias/Listado — listo | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1406:118109](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1406-118109) | Secuencias | CRM/IA/Secuencias/Inscritos | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1407:17](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1407-17) | Secuencias | CRM/IA/Secuencias/Editor — pasos, esperas y condiciones de salida | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1408:117970](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1408-117970) | Secuencias | CRM/IA/Secuencias/Listado — vacío | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1408:118427](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1408-118427) | Secuencias | CRM/IA/Secuencias/Listado — cargando | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1408:118914](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1408-118914) | Secuencias | CRM/IA/Secuencias/Listado — error | Componente local · Δ fuente no visual | 1440×960 → 1440×960 | 1440×960 |
| [1409:17](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1409-17) | Objeciones | CRM/IA/Objeciones/Biblioteca — listo | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1410:118018](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1410-118018) | Objeciones | CRM/IA/Objeciones/Detalle — respuestas y llamadas | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1410:118600](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1410-118600) | Objeciones | CRM/IA/Objeciones/Móvil — consulta rápida en llamada | Componente local | 390×844 → 390×844 | 390×844 |
| [1410:835968](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1410-835968) | Objeciones | CRM/IA/Objeciones/Biblioteca — sin resultados | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1410:836476](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1410-836476) | Objeciones | CRM/IA/Objeciones/Biblioteca — cargando | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1298:768716](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1298-768716) | Referidos | CRM/Red/Referidos/Listo | Componente local | 1440×1128 → 1440×1128 | 1440×1128 |
| [1301:85046](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1301-85046) | Referidos | CRM/Red/Referidos/Programa | Componente local | 1440×1128 → 1440×1128 | 1440×1128 |
| [1303:85692](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1303-85692) | Referidos | CRM/Red/Referidos/Registrar | Componente local | 1440×1128 → 1440×1128 | 1440×1128 |
| [1303:85899](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1303-85899) | Referidos | CRM/Red/Referidos/Convertir a lead | Componente local | 1440×1128 → 1440×1128 | 1440×1128 |
| [1311:771575](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-771575) | Referidos | CRM/Red/Referidos/Recompensas | Componente local | 1440×900 → 1440×900 | 1440×900 |
| [1311:772386](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-772386) | Referidos | CRM/Red/Referidos/Vacío | Componente local | 1440×900 → 1440×900 | 1440×900 |
| [1311:772852](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-772852) | Referidos | CRM/Red/Referidos/Cargando | Componente local | 1440×900 → 1440×900 | 1440×900 |
| [1311:773405](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1311-773405) | Referidos | CRM/Red/Referidos/Error | Componente local | 1440×900 → 1440×900 | 1440×900 |
| [1313:88789](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-88789) | Referidos | CRM/Red/Referidos/Móvil — listo | Componente local | 390×844 → 390×844 | 390×844 |
| [1313:89380](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1313-89380) | Referidos | CRM/Red/Referidos/Móvil — registrar (hoja) | Componente local | 390×844 → 390×844 | 390×844 |
| [1316:773848](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1316-773848) | Partners | CRM/Red/Partners/Directorio | Componente local · Δ fuente no visual | 1024×690 → 1440×969 | 1440×960 |
| [1316:776081](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1316-776081) | Partners | CRM/Red/Partners/Ficha del partner | Componente local | 1024×707 → 1440×993 | 1440×960 |
| [1318:91569](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1318-91569) | Partners | CRM/Red/Partners/Registrar deal | Componente local · Δ fuente no visual | 1024×707 → 1440×993 | 1440×960 |
| [1319:94585](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1319-94585) | Partners | CRM/Red/Partners/Comisiones y niveles | Componente local | 1024×771 → 1440×1083 | 1440×960 |
| [1411:41956](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1411-41956) | Partners | CRM/Red/Partners/Vacío | Componente local · Δ fuente no visual | 1024×690 → 1440×969 | 1440×960 |
| [1411:42449](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1411-42449) | Partners | CRM/Red/Partners/Cargando | Componente local · Δ fuente no visual | 1024×690 → 1440×969 | 1440×960 |
| [1411:42968](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1411-42968) | Partners | CRM/Red/Partners/Error | Componente local · Δ fuente no visual | 1024×690 → 1440×969 | 1440×960 |
| [1438:1908](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1438-1908) | Partners | CRM/Red/Partners/Móvil — ficha del partner | Componente local · Δ fuente no visual | 390×844 → 390×844 | 390×844 |
| [1411:837770](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1411-837770) | Equipo | CRM/Red/Equipo/Equipos y miembros | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1411:838455](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1411-838455) | Equipo | CRM/Red/Equipo/Territorios | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1412:837868](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1412-837868) | Equipo | CRM/Red/Equipo/Asignación automática | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1412:838392](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1412-838392) | Equipo | CRM/Red/Equipo/Desempeño | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1413:17](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1413-17) | Equipo | CRM/Red/Equipo/Territorios — vacío | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1413:726](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1413-726) | Equipo | CRM/Red/Equipo/Territorios — cargando | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1413:1051](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1413-1051) | Equipo | CRM/Red/Equipo/Móvil — mi cuota y ranking | Componente local | 390×844 → 390×844 | 390×844 |
| [1415:19](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1415-19) | Salud | CRM/Red/Salud/Panel — lista priorizada | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1424:17](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1424-17) | Salud | CRM/Red/Salud/Detalle — factores, tendencia y acciones | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1424:932](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1424-932) | Salud | CRM/Red/Salud/Configuración de factores | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1424:840685](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1424-840685) | Salud | CRM/Red/Salud/Panel — sin datos suficientes | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1424:841103](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1424-841103) | Salud | CRM/Red/Salud/Panel — cargando | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1424:841631](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1424-841631) | Salud | CRM/Red/Salud/Móvil — clientes en riesgo | Componente local | 390×844 → 390×844 | 390×844 |
| [1431:19](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1431-19) | Pronósticos | CRM/Red/Pronósticos/Trimestre — por vendedor | Componente local | 1024×683 → 1440×960 | 1440×960 |
| [1434:648](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1434-648) | Pronósticos | CRM/Red/Pronósticos/Vendedor — oportunidades por categoría | Componente local | 1024×683 → 1440×960 | 1440×960 |
| [1434:1185](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1434-1185) | Pronósticos | CRM/Red/Pronósticos/Ajuste con motivo (diálogo) | Componente local | 1024×683 → 1440×960 | 1440×960 |
| [1434:842149](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1434-842149) | Pronósticos | CRM/Red/Pronósticos/Sin cuotas definidas | Componente local | 1024×683 → 1440×960 | 1440×960 |
| [1434:842588](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1434-842588) | Pronósticos | CRM/Red/Pronósticos/Cargando | Componente local | 1024×683 → 1440×960 | 1440×960 |
| [1434:843089](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1434-843089) | Pronósticos | CRM/Red/Pronósticos/Móvil — mi pronóstico | Componente local | 390×844 → 390×844 | 390×844 |
| [1436:19](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1436-19) | Identidades | CRM/Red/Identidades/Duplicados — listo | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1436:843123](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1436-843123) | Identidades | CRM/Red/Identidades/Comparar y fusionar | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1436:843665](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1436-843665) | Identidades | CRM/Red/Identidades/Historial y deshacer | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1438:721](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1438-721) | Identidades | CRM/Red/Identidades/Duplicados — vacío | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1438:1130](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1438-1130) | Identidades | CRM/Red/Identidades/Duplicados — buscando | Componente local | 1440×960 → 1440×960 | 1440×960 |
| [1438:1553](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1438-1553) | Identidades | CRM/Red/Identidades/Fusión — error, nada cambió | Componente local | 1440×960 → 1440×960 | 1440×960 |
