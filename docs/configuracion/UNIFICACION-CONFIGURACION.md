# Configuración unificada: un solo lugar para todos los ajustes

Decisión del dueño (2026-10-07): todas las configuraciones viven en
`/app/configuracion`. Cada módulo tiene allí su sección; el buscador lleva
directo a cualquier ajuste; las pantallas de los módulos solo tienen un atajo
«Configurar»; los enlaces viejos redirigen y avisan una vez.

Cambio de alcance del mismo día: **todo lo de Sitio web se queda en su
módulo**. En Configuración solo hay una entrada que enlaza a
`/app/sitio-web/configuracion`.

- Figma: archivo `EAvjINVRnlzFM70GVoWXgl`, página «10 Configuración», sección
  «10. Configuración unificada» (láminas 01–10, aprobadas por el dueño).
- Registro único: `src/components/configuracion/config/configSectionsRegistry.ts`.
- Permisos y plan, resueltos en el servidor: `GET /api/configuracion/secciones`.
- Redirecciones: `next.config.js › REDIRECCIONES_CONFIGURACION`.

## Cómo funciona

| Pieza | Dónde | Qué hace |
|---|---|---|
| Registro | `config/configSectionsRegistry.ts` | Id estable `<módulo>.<sección>`, permiso de edición, ajustes con ancla y, si aplica, enlace a una pantalla que se queda donde está. De aquí salen el menú, el buscador, los deep links y las redirecciones. |
| Textos y palabras clave | `messages/{es,en,fr,pt}.json › configuracionUnificada` | Título, descripción y palabras clave de cada sección y ajuste. El buscador busca en el idioma de quien busca. |
| Buscador | `config/buscadorConfiguracion.ts` | Sin tildes ni mayúsculas («interes» encuentra «interés»). Cada palabra de la consulta tiene que aparecer. Muestra «Módulo › Sección». |
| Plan y permisos | `config/permisosSecciones.ts` + `app/api/configuracion/secciones/route.ts` | Módulo fuera del plan → la sección no aparece. Sin permiso → solo lectura (aviso y `<fieldset disabled>`). Un ajuste con permiso propio se evalúa aparte (el desinterés pide `crm.stages.manage`). Falla cerrado: sin módulos, 503 y nada que mostrar. |
| Deep link | `rutaSeccion(id, { ancla })` | `/app/configuracion?modulo=crm&seccion=agente-voz#desinteres`. El ajuste también se acepta en `?ajuste=` (lo usan las redirecciones). Al llegar, la página baja hasta el ajuste dentro de Configuración, le da el foco y lo resalta 2 s (sin desplazamiento suave con «reducir movimiento»). |
| Aviso de mudanza | `layout/AvisoMovido.tsx` | `?movido=<origen>` → «Esta configuración se movió aquí», una sola vez por origen (localStorage con try/catch). Queda fijo arriba mientras se baja al ajuste. |
| Atajo | `AtajoConfigurar.tsx` | Engranaje «Configurar» en las pantallas de módulo que tenían ajustes. |

No hizo falta tocar la base de datos. El pie «quién y cuándo» se muestra donde
el ajuste ya lo guarda: la tarjeta del desinterés dice cuándo se guardó
(`crm_voice_disinterest_settings.updated_at`; también existe `updated_by`) y cada
número de prueba, cuándo se agregó. `comm_settings` no guarda quién cambió el
interruptor, así que esa tarjeta no muestra pie. Un registro común de cambios de
configuración queda como propuesta.

## Auditoría (2026-10-07)

| Ruta actual | Qué configura | Destino en Configuración | Permiso que exige hoy | ¿Se mueve? |
|---|---|---|---|---|
| CRM › Agentes IA › pestaña «Ajustes» (`/app/crm/agentes-ia?pestana=ajustes`) | Qué hace el agente de voz ante el desinterés definitivo (tarjeta «Cuando el cliente no tiene interés», 545fe572) | CRM › Agente de voz `#desinteres` | Leer: miembro. Guardar: `crm.stages.manage` (ruta y RLS) | **Se movió.** La pestaña desaparece; queda el atajo «Configurar». La URL vieja redirige (308) con aviso. |
| Configuración › CRM › Telefonía (interruptor del agente y números de prueba) | `comm_settings.voice_agent_enabled` y números exentos del tope de la Ley 2300 | CRM › Agente de voz `#interruptor` y `#numeros-prueba` | Interruptor: admin (`can_edit` de la ruta, RLS rol 1/2). Números: admin (`requireOrgAdminOrPermission`) | **Se movió** dentro de Configuración, junto a lo demás del agente. Telefonía enlaza a la sección nueva. |
| `/app/chat/ia/configuracion` | IA del chat: modelo, comportamiento y modo por canal (`ai_settings`, `channels.ai_mode`) | Chat › IA del chat | Ninguno propio: cualquier miembro activo (RLS de `ai_settings` solo exige pertenencia) | **Se movió** (mismo componente, ahora `ConfiguracionIAChat`). Redirige (308) con aviso. En Configuración se edita con `admin.full_access`; ver «Hallazgos». |
| `/app/finanzas/facturacion-electronica/configuracion` | Estado del servicio FE, rangos, cola y retenidos (`/api/factus/config`) | Facturación electrónica › Servicio | Ver: `finance.view`. Acciones: admin o `finance.approve` | **Se movió** (`ConfiguracionServicioFE` con `incrustado`). Redirige (308) con aviso. El botón «Configuración» de la bandeja lleva a la sección. |
| `/app/sitio-web/configuracion` | Datos del negocio, legales, código, chat, idioma, mantenimiento del sitio | Sitio web (solo enlace) | Editar y publicar, resueltos en el servidor (`permisos.editar/publicar`) | **Se queda (decisión del dueño, 2026-10-07).** En Configuración hay una entrada que solo enlaza. |
| `/app/sitio-web/primera-configuracion` | Asistente de alta del sitio (pasos 1–6) | — | El del módulo Sitio web | **Se queda (decisión del dueño, 2026-10-07).** Además no es un ajuste: es el asistente de creación. |
| `/app/hrm/asistencia/ajustes` | Correcciones de marcaciones (registros con aprobación sobre `timesheet_adjustments`) | — | RLS por pertenencia | **Se queda.** Son registros de operación, no configuración. Propuesta: llamarlo «Correcciones de asistencia» en la UI. |
| `/app/inventario/ajustes` | Ajustes de stock (entradas, salidas, conteos) | — | Los del módulo inventario | **Se queda.** Son ajustes de STOCK. Propuesta: rotularlo «Ajustes de stock» con i18n (`nav.paginas.inventario_ajustes` y `inventarioAjustes.*`); no se cambia en esta ronda. |
| POS › Reservas de mesas › pestaña «Configuración» (`?tab=configuracion`) | Horario, anticipo y reglas de reservas por sede | POS › Reservas de mesas (solo enlace) | Leer: miembro. Guardar: `website.sites.edit` | **Se queda por ahora.** El módulo Sitio web la enlaza como «Reservas web» (redirección `/app/sitio-web/reservas`) y ese flujo no se toca. Aparece en el buscador. |
| `/app/configuracion/asistente` | GO Assistant: nivel de capacidades | General › GO Assistant (enlace) | Admin (`can_manage`) | **Se queda** como subpágina de Configuración; ya vivía aquí. Aparece en el menú y el buscador. |
| `/app/configuracion/pos/avisos-cliente` | Avisos al cliente de los pedidos en línea | POS › Avisos al cliente (enlace) | El de su ruta | **Se queda** como subpágina de Configuración; aparece en el menú y el buscador. |
| `/app/notificaciones/reglas`, `/canales`, `/plantillas` | Reglas de alertas, canales de envío y plantillas | — | `gestionarNotificaciones` | **Se quedan.** Son contenido que el módulo gestiona (listas de reglas y plantillas), no ajustes de la organización. Las preferencias de canal ya estaban en Configuración › Notificaciones. |
| `/app/finanzas/impuestos`, `/metodos-pago`, `/comisiones` | Catálogos de finanzas | — | Los de finanzas | **Se quedan.** Son catálogos de registros. |
| `/app/finanzas/monedas` (tarjeta «Preferencias») | Actualización automática de tasas | — | Finanzas | **Se queda en esta ronda.** Propuesta: mover la tarjeta de preferencias a Configuración › Facturación/Finanzas cuando exista la sección. |
| `/app/hrm/reglas-pais` | Reglas de nómina por país | — | HRM | **Se queda.** Es un catálogo normativo del módulo. |
| PMS, Parking, Membresías, Calendario, Timeline, Integraciones, Roles, Notificaciones, HRM | Sus ajustes generales | Su sección «general» | `admin.full_access` (Roles: `roles.manage`; Notificaciones: `notifications.manage`) | **Ya estaban** en Configuración (paneles existentes); ahora con registro, buscador, permisos del servidor y deep link. |
| `/app/pos/configuracion`, `/app/hrm/configuracion`, `/app/roles/configuracion`, `/app/finanzas/configuracion/secuencias` | — | POS, Recursos humanos, Roles, Facturación electrónica › Resumen | — | **Nunca existieron** (404) pero el código las enlazaba. Ahora redirigen a su sección y los enlaces del código usan `rutaSeccion`. `/app/organizacion/sucursales/configuracion` solo aparece en `src/config/moduleConfig.ts`, que no importa nadie. |

## Hallazgos para otra ronda

1. **RLS de `ai_settings`.** `UPDATE` solo exige ser miembro activo: cualquier
   miembro puede cambiar el modelo o el prompt de la IA del chat escribiendo
   directo desde el navegador. En Configuración la sección ya se pinta en solo
   lectura sin `admin.full_access`, pero la barrera real es la base. Propuesta:
   mover la escritura a un route handler con `requireOrgAdminOrPermission` y
   endurecer la política (migración aditiva + rollback).
2. **Ajustes finos en el buscador.** Hoy tienen ancla los tres ajustes del agente
   de voz. Siguiente paso: anclas en Facturación (rangos DIAN, «siempre
   electrónica»), Chat › IA (modelo, mensaje de respaldo) y Telefonía.
3. **Registro común de cambios** (quién y cuándo) para las tarjetas cuyo origen
   no guarda autor (`comm_settings`).

## Pruebas

`src/components/configuracion/__tests__/`: registro, buscador, permisos (y la
ruta), redirecciones y deep links, y la página (menú por plan, resaltado, solo
lectura, aviso una vez). `panels/crm/__tests__/agenteVozSeccion.render.test.tsx`:
la tarjeta del desinterés guarda igual desde su nuevo sitio.
