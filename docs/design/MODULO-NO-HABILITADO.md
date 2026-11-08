# Acceso a un módulo no habilitado — propuesta (2026-11-08)

Estado: **propuesta en Figma, sin aprobar.** El código no cambia hasta que el dueño la apruebe.

- Figma: archivo `EAvjINVRnlzFM70GVoWXgl`, página «08 Acceso y organización», sección
  `2416:62653` «Acceso a un módulo no habilitado (propuesta 2026-11-08)».
- Capturas: `docs/design/figma/90-modulo-no-habilitado-NN-*.png`.
- Antecedente en la misma página: sección `2058:953191` «Sistema · Módulo no disponible
  (propuesta)». Esta propuesta reutiliza su shell y su `DetalleItem (propuesta)`, y **corrige
  su caso A**, que supone que el plan elige qué módulos trae (`plans.module_config`). El
  código dice que no (ver causa B).

## 1. Qué pasa hoy

| Paso | Dónde | Qué hace |
|---|---|---|
| Ruta → módulo | `src/middleware.ts:487-517` (`routeToModuleMap`), `:522` (`getModuleFromPath`) | Mapa de prefijos cableado en el middleware, aparte de `src/lib/navigation/catalog.ts`. |
| Orden de las verificaciones | `src/middleware.ts:938-946` (`runAppGate`) | Primero organización y suscripción; después el módulo. |
| Suscripción o prueba vencida | `src/middleware.ts:805-888` | Redirige toda la app a `/app/cuenta-congelada?reason=canceled\|payment_failed\|trial_expired\|suspended\|deleted`. |
| Módulo activo | `src/middleware.ts:724-752` | Consulta `organization_modules` (`is_active = true`) y `modules.is_core`. Sin fila activa y sin ser básico: **redirige** a `/app/inicio?error=module_not_activated&module=<código>`. |
| Cargo | `src/middleware.ts:754-781`, `src/lib/navigation/accesoCargo.ts:66-69` | Si el cargo tiene filas en `job_position_module_access` y ninguna del módulo tiene `can_access`: **redirige** a `/app/inicio?error=job_position_no_access&module=<código>`. |
| Fallo de consulta | `src/middleware.ts:745`, `:765`, `:942-946` | Deja pasar (fail open). |
| Pantalla del módulo apagado | `src/app/app/inicio/page.tsx:301-303` → `src/components/modules/ModuleAccessDenied.tsx` | Se monta **sin `organizationId`**. `useModuleAccessInfo` (`src/hooks/useActiveModules.ts:158-161`) no carga nada sin él: sin nombre de módulo, sin plan y sin acción. Queda «Módulo No Activado — Este módulo no está activado para tu organización» (`ModuleAccessDenied.tsx:84`, `:99`), «Volver al Inicio» (`:170`) y «¿Necesitas ayuda?» (`:269`). Textos cableados en español, fuera de next-intl y del kit. |
| Cargo sin acceso | `src/app/app/inicio/page.tsx:357-369` | Un `Alert` genérico encima del inicio normal, sin nombrar el módulo. |
| Página oculta | `src/lib/navigation/paginaActiva.ts:75-77`, `src/components/app-layout/AppLayout.tsx:893-913` | `organization_module_pages.is_active = false` solo la saca del menú y del buscador. **El middleware no mira páginas: por URL la página abre normal.** |
| Menú | `src/lib/navigation/filtrar.ts:82-90` | Un módulo inactivo, vetado por el cargo o sin páginas visibles no aparece. Igual en el buscador global (`paginasBuscables`). |
| Quién enciende módulos | `src/app/api/modules/route.ts:13-19`, `src/lib/utils/orgContext.ts:333-348` | `POST /api/modules` y `POST /api/modules/pages` exigen administrador: super admin, rol 1/2 por id o `admin.full_access` vía `check_user_permission`. Nunca por el nombre del rol. |
| Cupo del plan | `src/lib/organizacion/modulos.ts:47-52`, `:80-98` | **Cualquier plan trae todos los módulos.** El límite es la cantidad de opcionales: `plans.max_modules` (`NULL` = sin límite) o `subscriptions.metadata.custom_config`, menos los básicos. `available_modules` no bloquea nada. |

## 2. Causas que de verdad se pueden distinguir

| | Causa | Dato | ¿Se distingue hoy? |
|---|---|---|---|
| A | Módulo apagado o nunca encendido, **con cupo** | `organization_modules` sin fila activa; `estadoModulo()` → `disponible` | El middleware lo detecta, pero no separa «apagado» (fila con `is_active = false`) de «nunca encendido» (sin fila). Para la persona es lo mismo: se tratan igual. |
| B | Módulo apagado **sin cupo** en el plan | `estadoModulo()` → `limite` (o `otroPlan` si la organización no tiene plan) | Solo en Organización › Módulos. El middleware no lo sabe. «No incluido en el plan» como tal **no existe**: lo real es «no cabe». |
| C | Página oculta en un módulo activo | `organization_module_pages.is_active = false` | Solo el menú. La URL no se bloquea. |
| D | Sin permiso por cargo | `job_position_module_access` | Sí, con redirección y aviso genérico. |
| E | Suscripción o prueba vencida | `subscriptions.status`, `trial_end`, `organizations.status` | Sí, va antes que todo y ya tiene pantalla (`/app/cuenta-congelada`). |
| — | Error o tiempo agotado al comprobar | — | Fail open: entra. La sección `2058:953191` ya dibuja el caso G (cargando / error). |

Quién resuelve: A y B, un administrador (encender o cambiar de plan). C, un administrador
(mostrar la página). D, quien pueda editar cargos. E, el dueño o administrador (pagar).

## 3. Matriz causa × rol → pantalla y acción

En todas, **la URL no cambia** (no se redirige al inicio): migas y `PageHeader` del módulo,
ilustración del kit, la causa en una frase y una acción principal.

| Causa | Rol | Frame | Acción principal | Secundarias |
|---|---|---|---|---|
| A · apagado con cupo | Administrador | `2417:62653` (01) · móvil `2420:64540` (09) | «Encender {módulo}» → `/app/organizacion/modulos?resaltar={código}` con la tarjeta resaltada; allí se confirma | «Volver al inicio». Paneles: páginas que trae y qué pasa al encender (cupo usado, precio igual, reversible). |
| A · apagado con cupo | Miembro | `2418:62930` (02) | «Avisar a los administradores» → notificación interna (1 por persona, módulo y día) | Lista de administradores (nombre y papel, sin contacto). |
| B · sin cupo | Administrador | `2418:63336` (03) · móvil `2420:64699` (10) | «Ver planes» → `/app/organizacion/plan` con el plan siguiente preseleccionado | «Configuración a medida», «Apagar otro módulo». Paneles: opcionales encendidos (n de n) y planes con cupo. |
| B · sin cupo | Miembro | `2418:63757` (04) | «Avisar a los administradores» (la notificación lleva a Ver planes) | Sin precios ni nombres de plan. |
| C · página oculta | Administrador | `2419:63711` (05) | «Mostrar página» → `POST /api/modules/pages` y recarga la ruta | «Ir a {primera página visible}». |
| C · página oculta | Miembro | `2419:64154` (06) | «Ir a {módulo}» (primera página visible) | «Avisar a los administradores». |
| D · cargo | Miembro con cargo | `2419:64568` (07) · móvil `2420:64828` (11) | «Pedir acceso» → notificación a quien edita cargos, que abre Equipo › Cargos › {cargo} | «Volver al inicio». Coherente con `646:31926`: el módulo no sale en el menú. El administrador nunca la ve. |
| E · vencida | Todos | Nota `2419:65004` (08) → enlaces a `1909:937047`, `1910:936678`, `2078:17` | Se mantiene `/app/cuenta-congelada`; solo cambia el texto si se llegó desde un módulo | — |

## 4. Menú lateral y buscador (frame `2421:65004`, captura 12)

- **Menú lateral: sin cambios.** Solo muestra lo que la persona puede usar, para todos los
  roles. Nada de candados ni módulos en gris: con hasta 15 opcionales el menú se llena de
  puertas cerradas, y el administrador ya tiene Organización › Módulos.
- **Buscador global, administrador:** un grupo «Módulos que tu organización no usa» con los
  opcionales no activos y su estado («Apagado · ábrelo para encenderlo», «No cabe en tu plan
  · Ver planes»). Elegir uno abre la ruta del módulo, que muestra la pantalla 01 o 03.
- **Buscador global, miembro:** nada nuevo en los resultados; solo una pista en el estado
  vacío («Puede que tu organización no use esa función…»).
- Difiere de la columna «dueño y admin» de `2087:328` (sección anterior), que proponía el
  módulo visible en el menú con insignia. Decide el dueño (pregunta 3).

## 5. Qué cambiaría en código cuando se apruebe (no hecho)

1. **Middleware sin redirección por módulo o cargo.** En `checkModuleAccess`
   (`src/middleware.ts:705-784`) dejar de redirigir: reescribir (`NextResponse.rewrite`) a una
   ruta interna o pasar el veredicto en un encabezado, para que la URL se quede donde llegó.
   Suscripción vencida sigue redirigiendo.
2. **`routeToModuleMap` fuera del middleware.** Derivarlo de `CATALOGO_NAV`
   (`src/lib/navigation/catalog.ts`) para no tener dos listas de rutas (regla «nunca cablees
   una lista de módulos ni de rutas»).
3. **Un solo resolutor en el servidor**, p. ej. `GET /api/modules/acceso?ruta=…`, que empiece
   por `getServerOrgContext()` y devuelva `{ causa: 'apagado'|'limite'|'otroPlan'|'paginaOculta'|'cargo', puedeResolver, modulo, pagina, plan, administradores }`
   reutilizando `estadoModulo()`, `paginaActiva()`, `cargoPuedeEntrarAModulo()` y
   `hasOrgAdminOrPermission()`. Sin lógica nueva de negocio.
4. **Reemplazar `ModuleAccessDenied.tsx`** por un componente del kit (`EmptyState`,
   `PageHeader`, `Button`, ilustraciones) montado en el layout del módulo, en es/en/fr/pt con
   next-intl. Borrar el caso `module_not_activated` de `src/app/app/inicio/page.tsx:301-303`
   y el `Alert` de `:357-369`.
5. **Página oculta (solo si el dueño decide que cierra la URL):** añadir la comprobación de
   `organization_module_pages` al gate, con el mismo fail open.
6. **«Avisar a los administradores» / «Pedir acceso»:** una notificación interna nueva
   (tabla de notificaciones existente), con deduplicación diaria. Requiere un tipo de
   notificación nuevo; si hace falta columna, migración aditiva por MCP.
7. **`/app/organizacion/modulos?resaltar=`** y **plan preseleccionado** en
   `/app/organizacion/plan`: parámetros de solo lectura en la UI.
8. **Buscador global del administrador:** añadir los módulos no activos a `paginasBuscables`
   solo cuando el servidor reconoce la capacidad de encender módulos (nueva `CapacidadNav`
   en `capacidadesNav.server.ts`, nunca por nombre de rol).
9. Tests: middleware sin redirección por módulo, resolutor por causa, y guardrail que impida
   volver a montar `ModuleAccessDenied` sin organización.

## 6. Preguntas para el dueño

1. **Página oculta por URL:** ¿ocultar una página también la cierra por enlace (pantallas 05
   y 06), o solo la saca del menú como hoy?
2. **«Encender» desde la pantalla:** ¿lleva a Organización › Módulos (propuesta) o enciende
   ahí mismo con confirmación (como el prototipo B2/B3 de `2058:953191`)?
3. **Menú del administrador:** ¿nada en el menú y solo el buscador (esta propuesta), o el
   módulo con insignia en el menú (columna «dueño y admin» de `2087:328`)?
4. **Avisos a administradores:** ¿se acepta una notificación interna nueva («X pide encender
   Y»), o basta con mostrar quiénes son los administradores?
5. **`plans.module_config.available_modules`:** el código ya no lo usa como candado. ¿Se
   retira del catálogo de planes o se vuelve a usar? Si vuelve, el caso A de `2058:953191`
   sería válido y habría una causa «no incluido en tu plan» distinta de «sin cupo».
