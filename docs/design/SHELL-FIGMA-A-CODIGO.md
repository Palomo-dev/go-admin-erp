# «03 Navegación y shell» — de Figma a código (2026-09-29)

Archivo «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`), página **`03 Navegación y shell`
(`3:3`)**. Solo lectura de Figma y de la base (MCP de Supabase, proyecto `jgmgphmzusbluqhuqihj`,
consultas `select`). Sin nombres de organizaciones cliente: el diseño usa «Mi empresa S.A.S.» y
«Sucursal Principal», que son ficticios.

> **Por qué otro agente no vio la página.** `get_metadata` sin `nodeId` devuelve solo las páginas
> cargadas (`01 Sistema` y `02 Componentes`). Las 16 páginas aparecen con un script de solo lectura
> de `use_figma` (`figma.root.children`); la `03` es `3:3`. Con su id, `get_metadata` y
> `get_screenshot` funcionan normalmente.

Documentos previos que este análisis actualiza (no los reemplaza):
`INVENTARIO-NAVEGACION-Y-HEADER.md`, `PARIDAD-BLOQUE-SESION.md`, `SHELL-MOVIL-Y-DETALLES.md`,
`PARIDAD-DASHBOARD-INICIO.md`, `AUDITORIA-DASHBOARD-INICIO.md`, `PARIDAD-PERFIL-CAJAS.md`,
`DASHBOARD-POR-MODULO.md`, `GO-ASISTENTE-ESCRITORIO.md`.

---

## 1. Inventario de frames

Estado: **aprobado** (sección sin «propuesta») o **propuesta** (sección marcada). «Código» dice si ya
existe en `main` antes de esta tanda.

### 1.1 Escritorio — shell y navegación (`166:38184`) · aprobado

| Frame | node-id | Plataforma | Código |
|---|---|---|---|
| Shell — expandido | `52:3175` | escritorio | sí (`shell/sidebar/Sidebar.tsx` `expanded`, `shell/header/AppHeader.tsx`) |
| Shell — rail | `52:3654` | escritorio | sí (`Sidebar` `rail` + vista previa flotante del submenú) |
| SubMenuPanel — Finanzas por grupos | `52:4650` | escritorio | sí (`shell/sidebar/SubMenuPanel.tsx`, grupos de `catalog.ts`) |

### 1.2 Escritorio — header (`166:38186`) · aprobado

| Frame | node-id | Código |
|---|---|---|
| OrgSwitcher — org abierto | `58:6761` | sí (`shell/header/OrgSwitcher.tsx`, chip de plan) |
| OrgSwitcher — sucursal abierta | `58:7058` | sí (crear sucursal `n/max`, «Principal», «Todas») |
| Reportar problema | `69:8844` | sí (`shell/header/ReportarProblema.tsx`) |
| Ctrl+K abierto | `52:5117` | sí — **se reutiliza tal cual** el buscador global (`Header/GlobalSearch*`, `lib/busquedaGlobal/**`), hecho hoy según `02 Componentes › SearchCommand`. Sin diferencias funcionales con este frame |
| Notificaciones abiertas | `52:5524` | sí (`shell/header/Notificaciones.tsx`, «99+») |
| Cambiando de organización… | `53:6876` | sí (recarga tras `cambiarOrganizacionActiva`) |

### 1.3 Escritorio — sesión (`166:38182`) · aprobado

| Frame | node-id | Código |
|---|---|---|
| Sidebar sesión — cerrado | `14:17` | sí (`shell/sesion/BloqueSesion.tsx`) |
| Sidebar sesión — popover abierto | `14:238` | sí (`shell/sesion/PanelSesion.tsx`: plan, uso, créditos, Desktop, tema, idioma, cuentas, cerrar sesión) |
| Sidebar colapsado — popover | `14:717` | sí |
| Sidebar sesión — cambiar de cuenta | `27:2274` | sí |
| Sidebar sesión — cambiando… | `27:2724` | sí |
| Sesión — idioma | `79:11660` | sí |

«Sesión vencida» no tiene frame en esta página: vive en `08 Acceso y organización` y en código
(`app/auth/session-expired/route.ts`, `lib/auth/avisosAcceso.ts`). Sin cambios.

### 1.4 Móvil — shell (`166:38194`) · aprobado

| Frame | node-id | Código |
|---|---|---|
| Móvil / Inicio | `58:7355` | sí (`MobileHeader` raíz + `MobileTabBar`) |
| Móvil / Notificaciones | `79:10977` | sí (hoja inferior) |
| Móvil / Ctrl+K | `79:11154` | sí (buscador global móvil) |
| Móvil / Reportar problema (sheet) | `79:11337` | sí |
| Móvil / Asistente abierto | `79:11488` | sí (panel del asistente; **no se toca**: es de otra sesión) |
| Móvil / OrgSwitcher — org abierto | `58:7835` | sí |
| Móvil / Detalle — header modo página | `60:7483` | sí (`cabeceraMovil.tsx`, modo `page`) |
| Móvil / Formulario — sin tab bar | `60:7630` | sí (`barraInferiorVisible`) |

### 1.5 Móvil — sesión (`166:38192`) · aprobado

`79:8996` drawer abierto · `79:9234` SessionSheet · `79:9639` cambiar de cuenta · `79:10078`
cambiando… · `79:10538` idioma. **Todo en código** (`Sidebar modo="drawer"`, `DrawerNivel2`,
`PanelSesion` en hoja).

### 1.6 Perfil de usuario (`344:9278`) · aprobado (con marcas «Nuevo» dentro)

| Frame | node-id | Plataforma | Código |
|---|---|---|---|
| Perfil — listo (Datos personales) | `344:9281` | escritorio | parcial: la página existe (`app/app/perfil/page.tsx`) con otro contenedor |
| Perfil — cargando | `344:9761` | escritorio | parcial |
| Perfil — vacío (sin organización) | `344:10091` | escritorio | no |
| Perfil — error | `344:10460` | escritorio | no (hoy un toast) |
| Perfil — Seguridad | `346:19975` | escritorio | parcial (`profile/SeguridadSection.tsx`) |
| Perfil — Preferencias (Nuevo) | `346:20440` | escritorio | no (tema e idioma viven solo en el bloque de sesión) |
| Perfil — Sesiones y dispositivos | `346:20900` | escritorio | parcial (`profile/DeviceSessions.tsx`) |
| Perfil — Organización y roles | `346:21440` | escritorio | parcial (dos secciones separadas) |
| Diálogos: cambiar contraseña / foto / correo / 2 pasos / códigos de respaldo | `347:11920` `347:11988` `347:12134` `347:12179` `347:12267` | ambos | parcial (formularios en línea, no diálogos) |
| Toasts del perfil | `347:12358` | ambos | parcial (`react-hot-toast`) |
| Móvil / Perfil — listo, cargando, vacío, error, Seguridad, contraseña (sheet) | `348:12239` `348:12423` `348:12517` `348:12666` `348:12765` `348:12898` | móvil | parcial (lista → sección con «Volver») |

### 1.7 Inicio — dashboard (`445:137182`) · aprobado

| Frame | node-id | Plataforma | Código |
|---|---|---|---|
| Inicio — listo (dueño · administrador) | `445:137185` | escritorio | parcial: cabecera, periodo, KPIs y secciones viejas |
| Inicio — cargando | `445:137401` | escritorio | parcial |
| Inicio — vacío (organización nueva) | `445:137617` | escritorio | parcial (franja de onboarding aparte) |
| Inicio — error | `445:137833` | escritorio | sí (`EmptyState variante="error"`) |
| Inicio — sin sucursal asignada | `445:138049` | escritorio | sí (`EmptyState variante="sinSucursal"`) |
| Diálogo — Detalle de KPI | `448:196680` | escritorio | parcial (`KpiDetailDialog.tsx`) |
| Popover — Periodo personalizado | `448:196736` | escritorio | sí (`PeriodoSelector.tsx`) |
| Diálogo — Personalizar el inicio (Nuevo) | `448:196794` | escritorio | no — necesita tabla nueva |
| Móvil / Inicio — listo, cargando, vacío, detalle de KPI (Sheet) | `448:205216` `448:205458` `448:205616` `448:205745` | móvil | parcial |

### 1.8 Componentes — Inicio (Nuevo) (`445:195322`) · aprobado

`TarjetaHoy` (`445:195385`, `Tono` éxito/peligro/advertencia/neutro) · `ChipModulo` (`445:195400`) ·
`FilaModulo` (`445:195568`) · `SelectorPeriodo` (`445:195599`, ya es `PeriodoSelector.tsx`).

### 1.9 Inicio — panel de empleado (`448:208216`) · aprobado

`448:209010` escritorio · `448:213637` móvil. Código: `components/inicio/EmployeeDashboard.tsx`,
con las correcciones E.4–E.11 de `PARIDAD-DASHBOARD-INICIO.md` pendientes.

### 1.10 Analítica web (Nuevo) (`464:237482`) · aprobado (sección «Nuevo», no «propuesta»)

`464:237485` listo · `465:241025` sin ubicación · `465:241434` cargando · `465:241800` móvil listo ·
`465:241980` móvil sin ubicación. Ruta de diseño: `/app/inicio/analitica-web`
(`CATALOGO-ICONOS.md`). **No existe en código.**

### 1.11 Secciones «propuesta» — no se implementan (decisión del dueño)

| Sección | node-id | Frames | Estado en código |
|---|---|---|---|
| Inicio — Marcar turno (propuesta) | `631:21816` | 12 (`631:21819` … `638:391686`, nota `631:385119`) | no; hoy «Marcar turno» es un botón a `/marcar` |
| Propuestas — shell móvil y detalles (Nuevo) | `627:17020` | 22 | **ya implementada en tandas anteriores**: menú por niveles (`DrawerNivel2.tsx`), POS con «←» (`cabeceraMovil.tsx` modo `pos`), detalle de notificación (`DetalleNotificacion`), vista rápida de tarea (`VistaRapidaTarea.tsx`). Se deja constancia: el código va por delante de la marca «propuesta» del Figma |
| Inicio — Dashboard por módulo (propuesta) | `642:25956` | 14 | no (ver `DASHBOARD-POR-MODULO.md`) |
| GO Asistente — escritorio (propuesta) | `667:34452` | 16 | lo trabaja otra sesión; aquí no se toca |

---

## 2. Código actual (mapa)

| Pieza | Archivo | Qué hace |
|---|---|---|
| Montaje del shell | `components/app-layout/AppLayout.tsx` | carga perfil (caché 5 min), organización, módulos activos (`moduleManagementService.getActiveModules` + `getHiddenModulePages`), acceso por cargo (`jobPositionModuleAccessService`), capacidades del servidor (`useCapacidades` → `/api/me/capacidades`), tema, cierre de sesión |
| Menú | `lib/navigation/catalog.ts` + `filtrar.ts` (`filtrarNavegacion`, `rutaActiva`) | catálogo único; filtra por módulos activos, páginas ocultas, cargo y capacidades. Nada cableado en el shell |
| Sidebar | `components/shell/sidebar/*` | rail/expandido persistido (`shell.sidebar`), submenú fijable (`shell.submenuFijado`), drawer por niveles |
| Header | `components/shell/header/*` | OrgSwitcher (org › sucursal), buscador, reportar problema, campana, disparador del asistente; móvil: raíz/página/POS y `MobileTabBar` |
| Sesión | `components/shell/sesion/*` | bloque y panel de sesión (plan, uso, cuentas, tema, idioma, cerrar sesión) |
| Organización/sucursal | `lib/hooks/useOrganization.ts`, `lib/context/BranchContext.tsx` | `guardarOrganizacionActiva`, `branch-changed`, `currentBranchId`/`branchFilterAll` |
| Middleware | `src/middleware.ts` | redirecciones de sesión y suscripción (sin cambios) |
| Inicio | `app/app/inicio/page.tsx` + `components/inicio/*` | dos paneles (`veePanelCompleto`): completo (KPIs, alertas, actividad, tendencia, observabilidad web, secciones por módulo) y empleado |
| Perfil | `app/app/perfil/page.tsx` + `components/profile/*` | 8 secciones en lista lateral |

## 3. Base de datos (verificado por MCP, solo lectura)

| Tema | Hallazgo |
|---|---|
| Módulos | `modules(code, is_core, rank, is_active)`, `organization_modules(organization_id, module_code, is_active)`. Códigos: `pos`, `inventory`, `finance`, `crm`, `pm`, `pms_hotel`, … |
| Preferencias del inicio | **no existe** `user_dashboard_preferences` (P4 de la auditoría) |
| Preferencias del usuario | `profiles.preferred_language` existe; **no hay zona horaria del usuario** (el frame la marca «Nuevo»); el tema se guarda por `themeService` |
| Sesiones y dispositivos | `user_devices(device_name, browser, os, ip_address, location, is_active, is_trusted, last_active_at, revoked_at)` |
| Notificaciones | `notifications(recipient_user_id, channel, status, read_at, …)` |
| Cargo | `organization_members.job_position_id` → `job_positions.name` |
| Bloque «Hoy» | cartera: RPC `fn_cxc_listado` (resumen `vencida`, `cuentas_vencidas`, `monedas`; permiso resuelto en la base); stock: RPC `fn_stock_listado` (`kpis.bajo_minimo`, `agotados`); pedidos web: `web_orders` (`status='pending'`: hoy 1 fila en toda la base); tareas: `tasks(assigned_to, status ∈ open/in_progress/done/canceled, due_date)`; cajas: `cash_sessions(status ∈ open/closed, opened_at, branch_id)` |
| No existe | RPC `get_home_today`, `get_module_summary`, ventas por canal para la tarjeta del inicio. Sí existe `fn_inicio_ventas_rango` (criterio de caja), ya usada por `/api/pos/ventas/cifras` |
| Analítica web | `website_visits` **no tiene** `city`, `region`, `latitude`, `longitude`, y `country` llega nulo; no hay RPC de visitantes únicos (sesiones distintas); `get_web_conversion_stats` **cablea `America/Bogota`** |

## 4. Mapa frame ↔ componente ↔ datos (lo que se toca en esta tanda)

| Frame | Componente | Datos |
|---|---|---|
| `445:137185` bloque «Hoy» | `components/inicio/TarjetaHoy.tsx` + `BloqueHoy.tsx` | `GET /api/inicio/hoy?sucursal=N` → `lib/inicio/bloqueHoy.server.ts` (reutiliza `listadoCartera` y `listarStock`; cuenta `web_orders`, `tasks`, `cash_sessions` con el cliente de la sesión) → `lib/inicio/bloqueHoy.ts` (regla pura de casillas, tono, orden y tope de 5) |
| `448:209010` panel de empleado | `EmployeeDashboard.tsx` | mismas tablas; fechas con la zona de la organización |
| `344:9281` y hermanos, contenedor del perfil | `app/app/perfil/page.tsx` + `components/profile/CabeceraPerfil.tsx` | `profiles`, `organization_members` (cargo), `member_branches` |
| `346:20440` Preferencias | `components/profile/PreferenciasSection.tsx` | tema (`themeService`) e idioma (`profiles.preferred_language`); **zona horaria del usuario: hueco** |

## 5. Brechas y riesgos

1. **Personalizar el inicio** y «Reordenar y ocultar»: sin `user_dashboard_preferences` no se pueden
   guardar entre dispositivos. No se inventa: botón no se pinta. Requiere migración (política en
   `docs/POLITICA-MIGRACIONES.md`).
2. **Bloque «Hoy» — pedidos que expiran en 30 min**: la regla de expiración vive dentro de
   `/api/web-orders/observability` (configuración `web_commerce.order_expiration_minutes` y métodos
   manuales). No se duplica: la casilla muestra los pendientes sin la subcuenta de expiración.
3. **Bloque «Hoy» — casilla de caja**: el dueño la sustituyó por «Ventas del periodo» (V.9b) y el
   bloque queda solo con avisos. Se pinta «Cajas abiertas desde días anteriores» cuando las hay.
4. **Ventas del periodo por canal / Tienda web / Módulos plegados (`FilaModulo`)**: necesitan
   `get_module_summary` y una RPC de ventas por canal. Quedan como están (KPIs y secciones actuales).
5. **Analítica web**: sin geolocalización (4 columnas + cambio en `goadmin-websites`) ni RPC de
   visitantes únicos con la zona de la organización. Se deja para una tanda con migración.
6. **Perfil — zona horaria del usuario**: no existe columna; el frame la marca «Nuevo». Hueco.
7. **Perfil — permisos efectivos (Nuevo)**: no hay endpoint que devuelva la lista legible de permisos
   del usuario. (`RolesSection` deducía «admin» por el nombre del rol — regla 6 —; corregido en
   40d82a1a con `isOrgAdminLike` por `role_id` e `is_super_admin`.)
8. **Perfil — «Cerrar sesión» en la cabecera (Nuevo)**: la lógica de cierre vive dentro de
   `AppLayout.handleSignOut`; duplicarla viola la regla 7. Queda para cuando se extraiga a un módulo.
9. **`/api/become-seller`**: el perfil manda `auth_user_id` en el body, pero la ruta ya toma el
   usuario de la sesión y responde 403 si el body trae otro. Verificado; sin riesgo.
10. `inicioService.getAlertas` suma cartera sin moneda y no filtra sucursal: el bloque «Hoy» la
    reemplaza en el inicio.

## 6. Plan por pasos

1. Lógica pura del bloque «Hoy» (`lib/inicio/bloqueHoy.ts`) con pruebas.
2. Lectura en servidor (`bloqueHoy.server.ts`) y ruta `GET /api/inicio/hoy` con `withOrg`.
3. `TarjetaHoy` y `BloqueHoy`; sustituyen a `DashboardAlertas` en el panel completo.
4. Panel de empleado: fechas con zona de la organización, tareas abiertas por vencimiento, enlace a
   `/app/pm/tareas`, estados `open`/`canceled`, frase de por qué no ve cifras.
5. Perfil: cabecera del Figma, navegación en el orden del diseño («Organización y roles» junta dos
   secciones), sección «Preferencias» con tema e idioma.
6. i18n es/en/fr/pt, pruebas y `tsc` acotado.

---

## 7. Estado de la implementación (2026-09-29)

Sin commit ni push. Sin cambios de esquema (la base solo se leyó).

### 7.1 Hecho

| Frame | Qué | Archivos |
|---|---|---|
| `445:137185` / `448:205300` bloque «Hoy» | Hasta cinco `TarjetaHoy` ordenadas por urgencia: por cobrar vencido, stock crítico, pedidos web, cajas abiertas de días anteriores (solo si las hay) y mis tareas. Sin nada urgente, tono neutro «Al día» con su acción de consulta. Nunca suma monedas distintas. Obedece a la sucursal del header. En móvil, las tres más urgentes y «Ver las N». Refresco con «Actualizar», cada 2 min con la pestaña visible y al volver a ella. Sustituye a `DashboardAlertas` y queda arriba de los KPIs | `src/lib/dashboard/bloqueHoy.ts` (regla pura), `src/lib/dashboard/bloqueHoy.server.ts`, `src/app/api/inicio/hoy/route.ts`, `src/components/inicio/TarjetaHoy.tsx`, `src/components/inicio/BloqueHoy.tsx`, `src/app/app/inicio/page.tsx` |
| `448:209010` panel de empleado | Tareas abiertas por vencimiento (antes: las 5 últimas creadas, incluidas completadas); `open` con su etiqueta; enlaces a `/app/pm/tareas` (antes `/app/pm`, que redirigía); vencimiento y fecha de aviso con la zona de la organización (antes el `timestamptz` crudo y `toLocaleString()`); frase «Los indicadores financieros son solo para la administración de la organización» | `src/components/inicio/EmployeeDashboard.tsx` |
| `344:9281` y hermanos, contenedor del perfil | Cabecera del diseño (avatar 80, nombre, cargo desde `job_positions`, correo · «Se unió el…» con zona de la organización, organización activa y sucursales asignadas, «Editar»); navegación de texto en el orden del frame; «Organización y roles» junta las dos secciones; textos del contenedor y del panel de vendedor en los 4 idiomas; se quitó una consulta a `user_devices` cuyo resultado no se usaba; roles y sucursales en una sola consulta | `src/app/app/perfil/page.tsx`, `src/components/profile/CabeceraPerfil.tsx`, `src/components/profile/NavPerfil.tsx`, `src/components/shell/sesion/AvatarUsuario.tsx` (tamaño 80) |
| `346:20440` Preferencias | Tema Claro · Oscuro · Sistema (misma persistencia que el bloque de sesión), idioma y zona horaria de la organización de solo lectura | `src/components/profile/PreferenciasSection.tsx`, `src/lib/i18n/idiomaPreferido.ts` (una sola función para cambiar y guardar el idioma; `PanelSesion.tsx` la usa ahora) |
| i18n | `home.hoy.*`, `home.panel.soloAdministracion`, `perfil.*` en es/en/fr/pt (añadidas por script, sin reescribir el resto) | `messages/{es,en,fr,pt}.json` |

Shell de escritorio, header, sesión y shell móvil (§1.1–1.5): **ya estaban en código** y coinciden con
los frames; no se tocaron. El buscador global coincide con `52:5117` (Recientes, Acciones con
«Reportar un problema», Páginas, Clientes, Productos, Sucursales) y no se reescribió. El disparador
del GO Asistente no se movió.

Decisiones al pasar a código:

- La casilla «Caja» del frame se sustituyó por «Cajas sin cerrar» (solo aviso), según la decisión del
  dueño V.9b de `PARIDAD-DASHBOARD-INICIO.md`.
- «Actualizado hace 2 min» se muestra como «Actualizado a las h:mm» (hora de la organización).
- El detalle de cada casilla va en pizarra (`text/secondary`) y no en `text/muted`: el manual no admite
  ese gris para texto (2,6:1).
- Las marcas «Nuevo» de los frames del perfil son anotaciones de diseño; no se muestran.

### 7.2 Pruebas

| Suite | Resultado |
|---|---|
| `src/lib/dashboard/__tests__/bloqueHoy.test.ts` (regla pura) | 11/11 |
| `src/lib/dashboard/__tests__/bloqueHoyServidor.test.ts` (módulos, organización del contexto, fallo parcial) | 4/4 |
| `src/app/api/inicio/hoy/__tests__/hoyRoute.test.ts` (403 empleado, 400 sucursal ajena, org de la sesión) | 6/6 |
| `src/components/inicio/__tests__/bloqueHoy.test.tsx` (render, móvil, error, 4 idiomas) | 10/10 |
| `src/components/profile/__tests__/contenedorPerfil.test.tsx` (cabecera, navegación, 4 idiomas) | 8/8 |
| `guardrails`, `guardrail-rutas-sin-cliente-navegador`, `src/__tests__/i18n`, `src/__tests__/timezone`, `src/lib/navigation`, `src/components/shell`, `src/components/inicio`, `src/components/profile`, `src/components/app-layout`, `src/lib/busquedaGlobal` | 40 suites, 1.625 pruebas, todas en verde |

`tsc` acotado a los 20 archivos tocados (tsconfig temporal que extiende el del repo): 0 errores.
ESLint sin avisos en todos los archivos tocados (el perfil tenía 21 errores previos; quedó limpio).
No se corrió el `tsc` completo ni `next build` (lo corre el dueño).

### 7.3 Pendiente y brechas

- **Sin backend todavía** (necesitan migración o RPC nueva): «Personalizar el inicio» y «Reordenar y
  ocultar» (`user_dashboard_preferences`); filas de módulo plegadas `FilaModulo` con resumen
  (`get_module_summary`); tarjeta «Tienda web» con miniaturas reales; **vista «Analítica web»**
  completa (visitantes únicos con la zona de la organización —hoy `get_web_conversion_stats` cablea
  `America/Bogota`—, y geolocalización: 4 columnas en `website_visits` + cambio en `goadmin-websites`);
  zona horaria propia del usuario; permisos efectivos legibles en el perfil.
- **Sin tocar por regla 7**: subcuenta «expiran en menos de 30 min» de pedidos web (la regla vive en
  `/api/web-orders/observability`); «Cerrar sesión» en la cabecera del perfil (la lógica vive en
  `AppLayout.handleSignOut`; hay que extraerla antes). `AppLayout.toggleTheme` y
  `PreferenciasSection` repiten las cuatro llamadas a `themeService`: candidato a extraer.
- «Mi turno» en el panel de empleado depende de «Inicio — Marcar turno (propuesta)».
- Perfil: diálogos del diseño (contraseña, foto, correo, 2 pasos, códigos) y estados vacío/error de la
  página; el interior de cada sección conserva su estilo anterior. El idioma sigue también en «Datos
  personales» (se guarda con el formulario).
- `DashboardAlertas.tsx` e `inicioService.getAlertas` quedan sin uso en el inicio (se exportan aún);
  la alerta «Reservas confirmadas» de PMS pasa a la fila del módulo cuando exista (D.3).
- `RolesSection.tsx` decidía «es admin» por el nombre del rol (regla 6): corregido en 40d82a1a.

### 7.4 Secciones «propuesta» — pendientes de decisión del dueño

| Sección | node-id | Nota |
|---|---|---|
| Inicio — Marcar turno (propuesta) | `631:21816` | 12 frames; necesita turnos (`shift_assignments`, `attendance_events`) en el inicio |
| Propuestas — shell móvil y detalles (Nuevo) | `627:17020` | ya está en código desde tandas anteriores (menú por niveles, POS con «←», detalle de notificación, vista rápida de tarea): conviene quitarle la marca de propuesta en Figma o confirmar |
| Inicio — Dashboard por módulo (propuesta) | `642:25956` | 14 frames; ver `DASHBOARD-POR-MODULO.md` |
| GO Asistente — escritorio (propuesta) | `667:34452` | 16 frames; lo trabaja otra sesión |

---

## Tanda 2 — perfil y analítica (2026-09-30)

Sin commit ni push. Lo aprobado por el dueño de `344:9278` (perfil) y `464:237482` (analítica web).

### Zona horaria — regla única (cambia lo aprobado: no hay zona por persona)

El dueño sustituyó «zona horaria propia del usuario» por: **la de la sucursal si la tiene; si no, la de la
organización; `America/Bogota` solo como último recurso**. No se creó ninguna columna en `profiles`.

| Pieza | Qué | Archivos |
|---|---|---|
| Punto único cliente | `useTimezoneFor` / `useFormatDate` sin argumento usan la **sucursal activa del header** (con «Todas», la organización); con `branch_id` del dato, ese; con `null`, la organización. Mostrar y calcular (`getToday`, `toDate`, `toInstant`) usan la misma zona | `lib/utils/sucursalParaZona.ts` (puro), `lib/context/OrganizationTimezoneContext.tsx`, `lib/context/BranchContext.tsx` (`useBranchOpcional`) |
| Punto único servidor | `zonaHorariaEnServidor(ctx, branchId?)` delega en `fn_timezone_for` | `lib/utils/zonaHorariaServidor.ts` |
| `346:20440` Preferencias | Zona de solo lectura con su origen («De la sucursal X» / «De la organización») | `components/profile/PreferenciasSection.tsx` |
| Edición | Ya existía: `BranchTimezoneField` en Organización › Sucursales, `PUT /api/organization/timezone` con permiso en el servidor | sin cambios |
| Regla escrita | §9 de `docs/reglas-fechas-timezone.md` | — |

Las 94 sucursales tienen `timezone` vacío (verificado por MCP): hoy todo resuelve igual que antes. El contrato
A3 de `timezoneForContract.test.ts` («el contexto no importa el BranchContext») se actualizó con la decisión.

### `346:21440` Permisos efectivos

`GET /api/me/permisos` (`withOrg`: organización y usuario de la sesión) → `get_user_permission_codes` (rol +
cargo, precedencia del cargo) + catálogo `permissions`, agrupados por módulo con nombre legible
(`description` sin «Permite…»). «Acceso total» por `isOrgAdminContext` (id de rol / super admin), nunca por
nombre. UI `components/profile/PermisosEfectivos.tsx` en «Organización y roles» (`<details>` por módulo,
«No incluye» con lo que falta del módulo, estados cargando/error/vacío). Lógica pura en
`lib/organizacion/permisosEfectivos.ts`. Las descripciones de `permissions` solo existen en español.

### `464:237482` Analítica web

| Pieza | Qué |
|---|---|
| Migraciones (aplicadas por MCP) | `20260930180010_analitica_web_geolocalizacion` (`website_visits.city`, `.region` NULL-ables + índice `(organization_id, ip_hash, created_at)`), `20260930180020_web_conversion_stats_zona_organizacion` (`get_web_conversion_stats` usa `fn_timezone_for`, misma firma), `20260930180030_analitica_web_rpc` (`fn_analitica_web`, SECURITY INVOKER). Cada una con rollback |
| Ruta | `GET /api/analitica-web?desde&hasta[&sucursal][&pais]`: `withOrg`; ve el panel completo o `reports.sales`; exporta con `reports.export`; sucursal ajena 400 |
| Pantalla | `/app/inicio/analitica-web` (`components/analiticaWeb/*`): cabecera, periodo (atajos + personalizado), «vs periodo anterior», 5 indicadores, embudo, serie diaria, «De dónde entran» (países → ciudades), estados cargando / error / sin permiso / sin ubicación, CSV |
| Sitio (`goadmin-websites`, PR aparte) | `app/api/track-visit/route.ts` guarda país/región/ciudad de las cabeceras de Vercel (`lib/geo/ubicacionVisita.ts`); la organización sale del host (`getOrgIdDelHost` en `lib/get-org-context.ts`), un body con otra da 403; `types/database.ts` declara las columnas y el insert deja de ser `as any` |

Definiciones: visitante = persona distinta (hash de IP o sesión); sesión = `session_id` distinto; conversión =
pedidos / sesiones; embudo visitantes → pedidos → completados (misma regla de «completado» que
`get_web_conversion_stats`). Días con `fn_timezone_for(org, sucursal)`.

Privacidad: solo país, región y ciudad aproximados; nunca IP en claro ni coordenadas (no se añadieron
`latitude`/`longitude`; las cabeceras de coordenadas se ignoran). Valores malformados se descartan.

Decisiones al pasar a código:

- El **mapa** (topojson del mundo y de Colombia) se sustituye por tabla con barra de intensidad: no hay
  geometrías en el repo y añadirlas es otra decisión.
- **Conversión y venta media por país/ciudad** no se muestran: `web_orders` no guarda la sesión de la visita.
  Hacerlo exige guardar `session_id` en el pedido desde el checkout del sitio (archivo sensible).
- La página no sale en el menú (`enMenu: false` en `catalog.ts`, así «Inicio» sigue sin submenú); el enlace
  «Ver analítica web» de la tarjeta «Tienda web» del inicio queda para la sesión que lleva el inicio.

### Pruebas (TZ=UTC y TZ=America/Bogota)

| Suite | Resultado |
|---|---|
| `__tests__/timezone/zonaUnicaSucursalOrganizacion.test.tsx` (regla, hook, servidor; sucursal en America/Mexico_City) | 16/16 (también en México, Madrid, Katmandú) |
| `__tests__/timezone/guardarrailZonaUnica.test.ts` (sin zona por persona; trinquete del literal `America/Bogota`) | 8/8 |
| `lib/organizacion` + `api/me/permisos` + `profile/permisosEfectivos` | 8 + 6 + 8 |
| `lib/analiticaWeb` + `api/analitica-web` + `components/analiticaWeb` | 14 + 7 + 8 |
| guardrails, i18n, timezone, context, navigation, shell, profile, busquedaGlobal y las nuevas | 41 suites, 1.701 pruebas en verde |

`tsc` acotado a los 25 archivos tocados: 0 errores. ESLint limpio. Sitio: `npm run typecheck` en verde;
`verify:tracking` no se pudo correr (no hay `.env.local`).

### Pendiente

- Enlace «Ver analítica web» desde el inicio (sesión del inicio).
- Mapa con geometrías reales y conversión por país (necesita `session_id` en `web_orders`).
- ~~`get_user_permission_codes` acepta cualquier `p_user_id` (SECURITY DEFINER): un miembro podría leer los
  códigos de otra persona. La ruta nueva solo la llama con el usuario de la sesión; conviene endurecerla.~~
  **Resuelto** en la Tanda 3 (2026-09-30): migración `20260930220000_permisos_codigos_solo_propios`.
- `fn_analitica_web` tarda ~1,6 s con 90 días en la organización con más visitas (315 000 filas): suficiente
  para una pantalla de administración; si crece, agregar por día en una tabla. *(Tanda 3: con el índice parcial
  por país baja a ~1,1–1,2 s con `pais=CO`; la agregación diaria sigue pendiente si crece.)*

---

## Tanda 2 — inicio (2026-09-30)

Sin commit ni push. Lo aprobado por el dueño para el inicio: personalizar y reordenar, ventas del periodo
por canal, tarjeta «Tienda web», filas de módulo con resumen, «Inicio — Marcar turno» (`631:21816`) e
«Inicio — Dashboard por módulo» (`642:25956`), estas dos antes «propuesta».

### Migraciones (aplicadas por MCP, cada una con su rollback)

| Migración | Qué |
|---|---|
| `20260930170000_inicio_preferencias_usuario` | Tabla `user_dashboard_preferences` (usuario + organización, único): `bloques_ocultos`, `modulos_orden`, `modulos_ocultos` (`text[]` con tope de tamaño). RLS: solo el propio usuario y solo si es miembro activo de la organización; sin grant a anon |
| `20260930170100_inicio_ventas_periodo_y_tienda_web` | `fn_inicio_ventas_periodo` (llama dos veces a `fn_inicio_ventas_rango` —la regla única de ventas con criterio de caja— para comparar con el periodo anterior que elige el inicio, y añade `monedas`) y `fn_inicio_tienda_web` (visitantes, sesiones, pedidos, pagados, pendientes ahora; sin importes). SECURITY DEFINER, `fn_assert_acceso_org`, sucursal con `app_branch_access`, permiso de ventas en la base |
| `20260930170200_inicio_modulos_resumen` | `fn_inicio_modulos_resumen` (el `get_module_summary` del diseño): una fila por módulo activo **y** con permiso de lectura (`fn_caja_puede`); reutiliza `fn_cxc_listado`, `fn_stock_listado` y `fn_inicio_ventas_periodo`; el fallo de un módulo llega como `error: true` sin tumbar los demás |
| `20260930170300_inicio_modulos_resumen_omitir` | Parámetro `p_omitir`: los módulos que la persona ocultó **no se consultan** («al ocultar un módulo dejan de lanzarse sus consultas») |

Probadas en seco con `DO … RAISE EXCEPTION` simulando a un administrador (`request.jwt.claims`): 23–145 ms el
resumen por módulo; la tienda web bajó de 3 s a 0,4 s (60 días, organización con más visitas) contando
distintos con `GROUP BY` en vez de `count(distinct)`. `get_advisors`: solo el aviso esperado de SECURITY
DEFINER ejecutable por `authenticated` (patrón del repo, con guarda de pertenencia y sin anon).

### Rutas

| Ruta | Quién | Qué |
|---|---|---|
| `GET /api/inicio/ventas` | panel completo (`veePanelCompleto`) + permiso de ventas en la base | cobrado del periodo, variación, n.º de ventas, ticket, reintegros; desglose por canal (una sucursal) o por sucursal («Todas») |
| `GET /api/inicio/tienda-web` | ídem; caché de 60 s por organización, usuario, periodo y sucursal | tarjeta «Tienda web» con «Ver pedidos» y «Ver analítica web» |
| `GET /api/inicio/modulos` | ídem | filas con resumen: módulos del **menú visible** (`seccionesVisiblesServidor` → `filtrarNavegacion`) ∩ los que la base resume; orden y ocultos de las preferencias; badge sólido único |
| `GET/PUT /api/inicio/preferencias` | cualquier miembro, su propio inicio | `readOrgBody` (organización ajena en body o query → 403), validación contra el menú visible, upsert con RLS |
| `GET /api/inicio/turno` | cualquier miembro, su propio turno | estado de «Tu turno»; sin módulo HRM o sin contrato activo → `visible: false` |

Todas con `withOrg` (organización de la sesión), periodo validado (`leerPeriodo`), sucursal validada contra la
organización (400), 42501 → 403, 22023 → 400, `Cache-Control: private, no-store`.

Nueva pieza compartida: `lib/navigation/navegacionServidor.ts` (el menú visible resuelto en el servidor). El
buscador global (`busquedaGlobal.server.ts`) pasó a usarla en vez de repetir las tres lecturas.

### Pantallas

| Frame | Qué | Archivos |
|---|---|---|
| `445:137185` «Ventas del periodo» | `TarjetaVentas` encabeza la columna de la tendencia: neto cobrado (criterio de caja), variación, «N ventas cobradas · ticket promedio», reintegros, desglose por canal o por sucursal (máx. 3 + «otros»). Con cobros en varias monedas no hay total | `components/inicio/TarjetaVentas.tsx`, `lib/dashboard/ventasInicio.ts` |
| `445:137185` bloque `463:15506` «Tienda web» | Visitantes, pedidos web y conversión con variación; badge en vivo (`LiveVisitorsBadge`); «Ver pedidos» y «Ver analítica web» (`/app/inicio/analitica-web`, de la otra sesión) | `components/inicio/TarjetaTiendaWeb.tsx` |
| `445:195568` `FilaModulo` y `642:25956` «Dashboard por módulo» (`642:25959`, `643:26987`…`644:31259`, `646:30871`, `646:31926`, `647:32595`…) | Filas plegadas con icono, nombre, badge (uno sólido, el más grave) y línea de resumen; desplegadas: KPIs del **mismo** resumen, pie con alcance/periodo/hora y «Ver módulo →» (primera página visible del menú). Escritorio varios abiertos; móvil acordeón. Error por módulo con «Reintentar». Sin permiso el módulo no aparece | `components/inicio/ModulosInicio.tsx`, `lib/dashboard/resumenModulos.ts` |
| `646:32649` «Reordenar y ocultar» | Flechas subir/bajar (accesibles con teclado; el asa del diseño queda decorativa), interruptor «En el inicio», Restablecer · Cancelar · Listo | ídem, `lib/dashboard/preferenciasInicio.ts` |
| `448:196794` «Personalizar el inicio» | Botón «Personalizar» en la cabecera; «Hoy» fijo; bloques Indicadores · Ventas del periodo · Actividad reciente · Tienda web; módulos | `components/inicio/DialogoPersonalizar.tsx`, `usePreferenciasInicio.ts` |
| `631:21816` «Marcar turno» (`631:23113`, `638:391286`, `631:23505`, `631:23911`, `638:391686`, `631:21819`…`631:22542`) | Escritorio, panel completo: el botón del encabezado cambia con el estado (antes · sin marcar + «N min tarde» · en turno «Marcar salida · 3 h 12 min» · cerrado no se muestra); sin contrato no se dibuja. Móvil: `TurnoCard` arriba. Panel de empleado: `TurnoCard` compacta en lugar de la tarjeta fija «Marcar turno» | `components/inicio/TurnoInicio.tsx`, `lib/dashboard/turno.ts` |

Página: `app/app/inicio/page.tsx` (bloques según preferencias; `DashboardModulos` deja de montarse).
Lecturas en servidor: `lib/dashboard/inicio.server.ts`; común de rutas: `lib/dashboard/rutasInicio.server.ts`.
i18n: `home.ventasPeriodo.*`, `home.tiendaWeb.*`, `home.modulos.*`, `home.personalizar.*`, `home.turno.*` en
es/en/fr/pt (añadidas por script, sin reescribir el resto).

### Decisiones al pasar a código

- **Una sola regla de periodo**: `lib/dashboard/periodo.ts` (`calcularRangoPeriodo`) sale de
  `inicioService.rangoPeriodo`, que ahora delega en ella; las rutas del servidor usan la misma, con la zona de la
  regla única (`zonaHorariaEnServidor`: sucursal → organización).
- **Marcar turno no se reimplementa**: los botones llevan al flujo existente `/marcar`
  (`QRAttendanceService.validateAndRecord`); el inicio solo lee el estado (turno de hoy en
  `shift_assignments` + plantilla, y `attendance_events`).
- **Permiso para «Tu turno»**: módulo HRM activo + contrato activo en la organización (el mismo requisito de
  `/marcar`). No se exige `hr.attendance.mark`: hoy solo lo tiene el rol 2, y exigirlo dejaría sin marcar a
  todos los empleados. Con contrato pero sin turno asignado hoy (solo hay 12 turnos en toda la base) se muestra
  «Sin turno asignado hoy» con «Marcar turno», porque la marcación por QR no exige turno.
- **Módulos con resumen**: finanzas, ventas, inventario, CRM, RRHH, hotel, membresías y transporte. Chat y
  parqueadero no tienen permiso de lectura propio en `permissions`; proyectos, calendario, notificaciones,
  integraciones y operaciones no tienen cifra de negocio (§2.11 de `DASHBOARD-POR-MODULO.md`): no aparecen en
  «Módulos».
- **CRM**: oportunidades `record_type='deal'` de toda la organización (casi ninguna tiene sucursal); pipeline
  por moneda, nunca sumado.
- **Tienda web**: visitante = hash de IP o sesión (misma definición que la analítica web); las visitas no
  tienen sucursal y se dice en la tarjeta cuando hay una elegida.
- **Monedas**: `fn_inicio_ventas_rango` suma `amount` sin mirar `currency` (una organización cobra en COP y
  USD): la tarjeta y la fila de ventas no muestran total cuando hay más de una moneda.

### Figma

Secciones renombradas sin la marca de propuesta y con la nota junto al título (nodos de texto nuevos):
`631:21816` «Inicio — Marcar turno» (nota `1363:17`), `642:25956` «Inicio — Dashboard por módulo»
(`1363:18`) y, a pedido del coordinador, `627:17020` «Shell móvil y detalles» con «Aprobada por el dueño
2026-09-30 · en código» (`1363:19`). Nada más del archivo se tocó (las descripciones antiguas de esas
secciones siguen diciendo «propuesta»: cambiarlas no estaba pedido).

### Pruebas (TZ=UTC y TZ=America/Bogota)

| Suite | Resultado |
|---|---|
| `lib/dashboard/__tests__/periodo.test.ts` (rangos, query) | 10/10 |
| `lib/dashboard/__tests__/resumenModulos.test.ts` (monedas, badge sólido, error, desglose de ventas) | 13/13 |
| `lib/dashboard/__tests__/preferenciasTurno.test.ts` (validación, orden, estados del turno, nocturno) | 13/13 |
| `app/api/inicio/__tests__/rutasTanda2.test.ts` (401, 403, 400, organización de la sesión, body ajeno 403) | 20/20 |
| `components/inicio/__tests__/inicioTanda2.test.tsx` (render sin jest-dom, 4 idiomas) | 29/29 |
| guardrails, guardrail de rutas, i18n, timezone, inicio, dashboard, navegación, shell, buscador, analítica web | 47 suites, 1.853 pruebas en verde |

`tsc` acotado a los archivos tocados y a sus pruebas: 0 errores. ESLint limpio. La prueba de estas rutas
encontró un fallo real (la validación rechazaba `tiendaWeb` por la mayúscula), corregido.
Fuera de esta tanda fallan `__tests__/pos/venta/catalogo/productSearch.test.tsx` (archivos del POS con cambios
de otra sesión) y, de forma intermitente, `pos-display/tester-f2b-r1`.

### Pendiente

- `fn_inicio_modulos_resumen` calcula «hoy» con `organizations.timezone`; la regla única nueva
  (`fn_timezone_for`, sucursal → organización) llegó el mismo día. Hoy da igual (ninguna sucursal tiene zona);
  cambiarla es otra migración.
- Miniaturas de la tarjeta «Tienda web» y de los KPI de módulo (hacen falta series diarias en las RPC).
- Panel desplegado sin «Requiere atención» ni desglose (`AtencionItem`, `BarraDesglose`): necesitan las RPC de
  detalle por módulo (`get_inicio_modulo`, §6.2 de `DASHBOARD-POR-MODULO.md`).
- Resumen de chat y parqueadero (falta un permiso de lectura propio para cada uno).
- Reordenar con arrastre (hoy con flechas) y orden de los bloques (hoy solo mostrar/ocultar).
- `DashboardModulos.tsx` y `components/inicio/sections/*` quedan sin montar en el inicio (se exportan aún).

## Analítica web — mapas

2026-09-30. «De dónde entran» (Figma 03 › 464:237485) pasa de tabla sola a coropleta, como en el diseño.
Aprobado por el dueño.

### Qué hay

- **Mundo** («Visitantes por país»): coropleta por `website_visits.country` (ISO 3166-1 alfa-2) junto a la
  tabla «Por país», que sigue siendo la alternativa accesible. Clic en un país (mapa o tabla) pide sus ciudades.
- **Colombia por departamento**: al elegir Colombia, o por defecto si más de la mitad de los visitantes son de
  CO (`debeAbrirColombia`; «Volver al mundo» lo desactiva para el resto de la sesión de la pantalla). Los
  departamentos se agregan desde las ciudades de la RPC usando `region` («ANT» → «CO-ANT»,
  `codigoRegionIso`). Como `fn_analitica_web` devuelve solo las 50 ciudades con más visitantes, con más ciudades
  el departamento es una cota inferior y la tarjeta lo avisa. Clic en un departamento filtra la lista de ciudades.
  San Andrés y Providencia va en un recuadro.
- Otros países: solo la lista de ciudades (no hay geometrías de sus regiones ni coordenadas de ciudad).
- Escala secuencial logarítmica de 5 pasos con tokens: tinte `--brand-tint` → Azul GO `--brand-primary` →
  `--brand-deep` (con `color-mix`); sin visitas en gris claro (`--border-default`). Modo oscuro por los mismos
  tokens. Leyenda «Menos ■■■■■ Más · Sin visitas».
- Teclado: el mapa es una parada de tabulación (tabindex itinerante); flechas recorren las regiones de más a
  menos visitas, Inicio/Fin, Enter/Espacio elige. Cada región lleva `aria-label` (nombre, visitantes, % del
  total); el tooltip aparece al pasar el ratón o al enfocar.

### Geometrías, fuentes y licencias

| Archivo | Fuente | Licencia | Peso (min / gzip) |
|---|---|---|---|
| `world-atlas/countries-110m.json` (npm `world-atlas` 2.0.2) | Natural Earth 1:110m | ISC (paquete); datos de dominio público | 105 KB / 38 KB |
| `src/components/analiticaWeb/mapas/geo/colombia-departamentos.topo.json` | Natural Earth 1:10m Admin 1 (v5.1) | Dominio público | 13 KB / 4,8 KB |
| `d3-geo` + `topojson-client` (lo que se usa) | npm | ISC | 22 KB / 8,7 KB |

Colombia: se filtró el país, se corrigió Bogotá (Natural Earth la etiqueta «CO-CUN»; aquí «CO-DC»), se quitó un
islote sin departamento y se simplificó con mapshaper (`-simplify 10% keep-shapes`, cuantización 1e4). Ids =
ISO 3166-2; la prueba verifica los 32 departamentos + Bogotá D. C. Mundo: el id numérico ISO 3166-1 pasa a
alfa-2 con `lib/analiticaWeb/isoPaises.ts` (tabla de Natural Earth 110m, `ISO_N3_EH`/`ISO_A2_EH`); Kosovo por
nombre («XK»); N. Cyprus y Somaliland quedan sin código (gris). Se omite la Antártida.

Todo se carga diferido: `DeDondeEntran` importa `mapas/MapaVisitas` con `next/dynamic` (`ssr: false`) y la
geometría del mundo baja al abrir la pantalla, la de Colombia solo al elegir CO. Sin servicios externos ni claves.
El bundle de la pantalla solo suma la lógica pura (`lib/analiticaWeb/mapa.ts`, ~2 KB).

### Pruebas

| Suite | Resultado |
|---|---|
| `lib/analiticaWeb/__tests__/mapa.test.ts` (ISO, agregación país/región, escala, geometrías reales) | 11/11 |
| `components/analiticaWeb/__tests__/mapas.test.tsx` (coropleta, teclado, tooltip, filtro por departamento, 4 idiomas) | 11/11 |
| `components/analiticaWeb/__tests__/analiticaWeb.test.tsx` (+ Colombia por defecto) | 10/10 |
| guardrails + i18n (ahora con el namespace `analiticaWeb`) | en verde |

### Pendiente

- ~~Agregar `regiones` a `fn_analitica_web` (visitantes por `region` sin el tope de 50 ciudades) para que el mapa
  de Colombia no dependa de la lista de ciudades.~~ **Resuelto** en la Tanda 3 (2026-09-30): migración
  `20260930220100_analitica_web_regiones`.

## Tanda 3 — permisos y regiones (2026-09-30)

Dos pendientes de las tandas anteriores. Ambas migraciones aplicadas por MCP (`apply_migration`), con su `.sql`
y su rollback; el cuerpo del rollback es el original byte a byte (md5 de `prosrc` comprobado en local y en la base,
dentro de un bloque que se revierte).

### Migraciones

| Migración | Qué hace | md5(prosrc) antes → después |
|---|---|---|
| `20260930220000_permisos_codigos_solo_propios` | `get_user_permission_codes` solo devuelve los permisos propios; los de otra persona, solo a un admin de la organización o a quien tenga `users.view` | `1579f8d7b5eed1a8033cd2e528fe211f` → `8604dddab1e2e6eb3e72cb461b7752c6` |
| `20260930220100_analitica_web_regiones` | `fn_analitica_web` suma la clave `regiones`; índice parcial `idx_website_visits_org_pais_created` | `750b6a406c3c1061766c423dbdf3221e` → `369be070ae3bd1a2e44373917fe61e18` |

### `get_user_permission_codes`: solo los propios

- Con sesión (`auth.uid()` no nulo): `p_user_id = auth.uid()` funciona igual que antes. Para otra persona exige
  pertenencia (`fn_assert_acceso_org`) y, además, ser admin de esa organización (super admin o rol 1/2 **por id**,
  el mismo criterio de `isOrgAdminLike` y `fn_crm_tiene_permiso`) o tener `users.view`
  (`check_user_permission`, rol + cargo). Si no, `42501`.
- Sin sesión: `anon`/`authenticated` sin `sub` reciben `42501`; `service_role` y el trabajo interno siguen igual.
- Se fija `search_path` (no tenía) y `revoke execute … from public, anon` explícito (anon ya no lo tenía).
- Llamadores revisados (todos piden los del usuario de la sesión, así que ninguno cambia): `/api/me/permisos`,
  `/api/crm/permisos`, `lib/ai/assistant/capabilities.ts`, `busquedaGlobal.server.ts`, `membresias.server.ts`,
  `permissionService.checkMultiplePermissions` (vía `useActiveModules` con `user.id`) y
  `lib/middleware/permissions.ts` (vía `usePermissionContext` con `session.user.id`). En SQL solo la llama
  `fn_tiene_permiso`, con `auth.uid()`. Ninguna edge function la usa y el repo del sitio tampoco.
- Pruebas simuladas (`set_config('request.jwt.claims')` + `set local role`, en bloques que se revierten; org 120
  y org 142): propio → OK (17 códigos); otro miembro sin permiso → `42501`; admin de la org → OK; admin de otra
  org pidiendo en la org 120 → `42501` (y en su propia org, donde la persona no es miembro, lista vacía); `service_role`
  → OK; `anon` → sin EXECUTE; `authenticated` sin `sub` → `42501`; `fn_tiene_permiso` del propio usuario → `true`.
  Antes de la migración las ocho llamadas devolvían los códigos (incluido otro usuario y otra organización).
- Guardarraíl 38 (`src/__tests__/guardrails.test.ts`): todo `.rpc('get_user_permission_codes', …)` de `src/`
  pasa `ctx.userId`/`userId`, y la migración conserva la guarda, el `search_path` y el revoke.

### `fn_analitica_web`: clave `regiones`

- Aditiva: `regiones = [{ region, visitantes, sesiones }]` del país pedido (`p_pais`), agrupado por
  `website_visits.region`, sin el tope de 50 ciudades (hasta 100 filas). Sin país pedido: `[]`. Las claves
  existentes no cambian (comprobado: la salida nueva menos `regiones` es igual a la anterior).
- Solo del país pedido, no de todos: la pantalla ya pide el país al abrir Colombia (o cualquier otro), así que
  `regiones` llega exactamente cuando el mapa la necesita y no se paga en la carga del mundo.
- Seguridad igual que antes: la función es **SECURITY INVOKER** (no DEFINER; así estaba y así se queda: lee con
  la RLS de la sesión), `fn_assert_acceso_org` al entrar, `search_path` fijo, EXECUTE solo para `authenticated`
  y `service_role`. Verificado: miembro de otra organización → `42501`; `anon` → sin EXECUTE.
- Rendimiento (organización con más visitas, 90 días, `pais=CO`; `EXPLAIN ANALYZE` de la llamada):
  antes 2 328 ms en frío y 1 513–1 742 ms en caliente; después 1 123–1 198 ms, ya con la consulta de regiones.
  Sin país: 1 242 → 1 131 ms. El índice parcial `(organization_id, country, created_at) where country is not null`
  hace que las consultas por país (ciudades, total de ciudades y regiones) no recorran las ~120 000 visitas sin
  país del rango. Se creó sin `CONCURRENTLY` (apply_migration va en una transacción): en el dry-run tardó
  ~0,7 s y ocupa 16 kB, así que el bloqueo de escrituras sobre `website_visits` fue breve.
- Cliente: `mapearRespuestaRpc` deja `regiones` en `null` si la RPC no la trae; `valoresRegionMapa` usa
  `regiones` cuando viene (normalizada con `codigoRegionIso`, alias «BOG» → «CO-DC», repetidos sumados) y, si no,
  agrega desde las ciudades como antes. El aviso «Los departamentos suman las N ciudades…» solo sale en ese
  respaldo y cuando hay más ciudades que las listadas.

### Pruebas

| Suite | Resultado |
|---|---|
| `lib/analiticaWeb` (+ mapeo de `regiones`, `agregarRegiones`, `valoresRegionMapa` con y sin la clave) | 28/28, TZ=UTC y TZ=America/Bogota |
| `components/analiticaWeb` (+ departamento fuera de las ciudades con `regiones`; respaldo con aviso) | en verde |
| guardrails (con el 38), `api/me/permisos`, `busqueda-global`, membresías, `lib/organizacion`, `api/analitica-web` | 26 suites, 528 pruebas |

`tsc` acotado a los archivos tocados (y lo que importan): 0 errores. ESLint limpio en los archivos tocados.

### Pendiente

- No hay en la base ningún miembro no admin con `users.view` para probar esa rama con datos reales; la rama
  usa `check_user_permission`, la misma función que ya resuelve los demás permisos.
- ~~La lista de ciudades sigue con el tope de 50: al filtrar por un departamento que no tiene ciudades en esa
  lista, el mapa lo pinta pero la tabla dice «sin ciudades».~~ **Resuelto** el 2026-09-30: migración
  `20260930220200_analitica_web_ciudades_region` (ver «Analítica web — límite de ciudades»).

## Analítica web — límite de ciudades (2026-09-30)

`fn_analitica_web` devolvía como mucho 50 ciudades del país pedido. Al filtrar en el mapa un departamento sin
ciudades en ese top, el mapa lo pintaba (clave `regiones`) pero la tabla decía «sin ciudades».

### Migración

| Migración | Qué hace | md5(prosrc) antes → después |
|---|---|---|
| `20260930220200_analitica_web_ciudades_region` | `ciudades` hasta 500; clave nueva `ciudades_region`; campo `regiones[].ciudades` | `369be070ae3bd1a2e44373917fe61e18` → `13d6e20e4144e4bb749acef5910248ba` |

Aplicada con `apply_migration`. El texto guardado en `schema_migrations` es el del archivo, byte a byte (md5 del
archivo `52b4ad3e174dcf9225385e583f735808`). El rollback lleva el cuerpo anterior exacto (md5 `369be070…`,
comprobado en local y en la base, dentro de un bloque que se revierte).

- **Aditiva, con la misma firma** `(integer, date, date, integer, text)`. `ciudades` conserva su forma
  `{ciudad, region, visitantes, sesiones}` y su orden; solo sube el tope de 50 a **500**. Clave nueva
  `ciudades_region`: ciudades fuera de esas 500 que están entre las **50 primeras de su región**, con la misma forma
  y hasta 1 000 filas. Campo nuevo `regiones[].ciudades`: ciudades distintas de la región, para el «y N ciudades
  más» del filtro. `ciudades_total` sale de la misma agregación, sin el segundo recorrido que hacía antes.
  Comprobado con la organización con más visitas (rango cerrado, hasta ayer): la salida nueva, sin las claves
  nuevas, es igual a la anterior.
- **Por qué una clave agrupada y no un parámetro `p_region`**: un parámetro cambia la firma, lo que deja una
  sobrecarga ambigua u obliga a un `DROP`. Además, cada clic en el mapa costaría otra llamada a la RPC. Y un cliente
  nuevo contra una base sin migrar fallaría, mientras que una clave que no viene se ignora. La clave sale de la
  misma agregación por ciudad (dos `row_number()`: global y por región), así que no añade recorridos.
- **Por qué 500 (y 50 por región)**: la geolocalización es reciente y la organización con más visitas tiene hoy
  23 ciudades, así que se midió con datos sintéticos en una tabla temporal: 1 100 ciudades (≈ los municipios de
  Colombia) con distribución Zipf, 61 182 visitas ubicadas y 120 000 sin país.

  | Consulta de ciudades | Tiempo | JSON |
  |---|---|---|
  | Anterior (tope 50 + `count(distinct)` aparte) | 436 ms | 3,9 KB |
  | Anterior con tope 500 / 1 000 | 438 / 442 ms | 38,5 / 77 KB |
  | Nueva (top 500 + 50 por región, una agregación) | **312 ms** | 84 KB en total (500 + 600 extra) |

  El top 500 cubre el 89 % de los visitantes de ese caso. El departamento sin ninguna ciudad en el top recupera
  sus 18 ciudades por `ciudades_region`. El peor caso de Colombia son todas sus ciudades (~84 KB sin comprimir). El
  tope de 1 000 filas extra acota a un país con muchas regiones.
- **Seguridad igual que antes**: SECURITY INVOKER, `fn_assert_acceso_org` al entrar, `search_path` fijo, EXECUTE
  solo para `authenticated` y `service_role` (ACL comprobada tras aplicar; una sola sobrecarga). Dry-run y
  repetición tras aplicar (`set_config('request.jwt.claims')` + `set local role`, bloques que se revierten):
  miembro de la org 137 → OK; miembro de otra org → `42501`; `anon` → `42501`.
- **Rendimiento** (org 137, 90 días; `EXPLAIN ANALYZE` de la llamada, en caliente):

  | | Antes | Después |
  |---|---|---|
  | `pais=CO` | 1 158–1 193 ms | 1 184–1 253 ms |
  | Sin país | 1 181 ms | 1 189 ms |

  Sin cambio apreciable: con datos reales la parte de ciudades es mínima (buffers 256 196 → 256 157, por el
  recorrido que se quita). El coste sigue en los totales y la serie, que no se tocaron.

### Cliente

- `mapearRespuestaRpc` mapea `ciudades_region` → `ciudadesRegion` y `regiones[].ciudades`. Los deja en `null` si la
  RPC no los trae (base atrasada).
- `ciudadesParaTabla` (`lib/analiticaWeb/mapa.ts`):
  - Sin departamento: `ciudades` y «y N más» hasta `ciudades_total`, como antes.
  - Con departamento: une las de `ciudades` y `ciudadesRegion` de ese departamento, sin repetir y de más a menos
    visitantes, con «y N más» desde `regiones[].ciudades`.
  - Sin la clave: filtra solo `ciudades`, igual que antes.
- `DeDondeEntran`: la tabla de ciudades pagina de a 20 (`CIUDADES_POR_PAGINA`) con `PaginationCompact` del kit
  (la variante para tablas dentro de una tarjeta) y vuelve a la página 1 al cambiar de departamento. Sin textos
  nuevos: reutiliza `analiticaWeb.geo.*` y `kit.paginacion.*`.

### Pruebas

| Suite | Resultado |
|---|---|
| `lib/analiticaWeb` + `components/analiticaWeb` (+ mapeo de las claves nuevas, `ciudadesParaTabla`, departamento fuera del top con `ciudades_region` y «N más», respaldo sin la clave, paginación y vuelta a la página 1) | 59/59, TZ=UTC y TZ=America/Bogota |
| guardrails, `api/analitica-web`, i18n | en verde |

`tsc` acotado a los archivos tocados (y lo que importan): 0 errores. ESLint limpio en los archivos tocados.

### Pendiente

- La ciudad se agrupa por nombre con `max(region)` (como antes): dos municipios homónimos de departamentos
  distintos se suman en una fila. Hoy no hay ningún caso en la base; si aparece, agrupar por `(city, region)`.

## Tanda 4 — inicio igual al Figma (2026-09-30)

Sin commit ni push. El dueño abría `/app/inicio` y «seguía lo viejo»: el inicio nuevo de la tanda 2 convivía con
la fila de atajos, la grilla vieja de KPIs, la tendencia aparte, la actividad vieja, el panel suelto de
observabilidad, la franja de onboarding y el selector de periodo viejo (en móvil, siete iconos con etiquetas
cortadas). Se leyeron por MCP de Figma los 13 frames de `445:137182`, sus anotaciones y el texto `445:137184`.

### Frame por frame

| Frame | Lo que pintaba el código | Ahora |
|---|---|---|
| `445:137185` escritorio listo | Cabecera con Personalizar/Actualizar en texto, sin «⋯» ni organización; `PeriodoSelector` (SegmentedControl gris + rango e `HorasPresets` en línea); atajos; KPIs viejos; `TarjetaVentas` sin gráfica y `DashboardTendencia` debajo (30 días fijos, otra regla de ventas, sin sucursal); `DashboardActividad`; `WebCommerceObservability` | Cabecera: saludo, «fecha · organización», Actualizar (solo icono), Marcar turno, Personalizar, «⋯» · sucursal + `SelectorPeriodoInicio` (7 opciones con el aspecto de `SelectorPeriodo` y «Horas») · «Hoy» · «Ventas del periodo» con la gráfica actual/anterior dentro, leyenda y rango \| «Actividad reciente» con filtros y «1–4 de 15» · «Tienda web» con miniaturas · «Módulos» |
| `445:137401` cargando | Esqueletos por bloque, grilla de 6 + KPIs | Cabecera y selector no esperan (§E.1); esqueleto de «Hoy», fila de dos y filas de módulos |
| `445:137617` vacío | Franja `OnboardingBanner` encima de todo, 3 primeros días, estilos fuera del manual | «Primeros pasos» en lugar de «Hoy» (§C.4) con «3 de 7 · 43 %», «Ocultar por ahora», «Ir» solo a páginas del menú; «Todavía no hay movimientos» con «Agregar productos» y «Abrir el POS» en lugar de ventas y actividad |
| `445:137833` error | Una caja roja por bloque | Si fallan ventas y actividad, un solo estado «No se pudieron cargar los datos del inicio» con «Reintentar»; «Actualizar» que falla deja los datos y avisa «Se conservan los últimos datos válidos» con «Reintentar»; cada módulo reintenta por su cuenta |
| `445:138049` sin sucursal | Ya estaba (`EmptyState sinSucursal`) | Igual; no se lanza ninguna lectura del panel |
| `448:196680` detalle de KPI | `KpiDetailDialog` (volvía a lanzar las 41 consultas y dejaba un intervalo de 30 s, §B.2) | `DetalleVentas`: la misma lectura de la tarjeta, una recarga al abrirse; total, variación «frente a … (valor)», desglose por canal o sucursal, transacciones, ticket medio, devoluciones, gráfica, «Exportar CSV» y «Ver ventas» (si la persona ve esa página) |
| `448:196736` periodo personalizado | Campos y horas en línea que empujaban la cabecera | Capa anclada al botón (patrón 11): rango con `CampoFecha`, nota de la zona de la organización, «Horas del día» (Mañana · Tarde · Noche · Todo el día + rango libre), Cancelar/Aplicar |
| `448:196794` / `448:196927` personalizar | Incluía «Indicadores» | «Hoy» fijo + Ventas del periodo · Actividad reciente · Tienda web + módulos (sin «Indicadores»: la grilla salió) |
| `448:205216` móvil listo | Botones de cabecera, selector de 7 iconos truncados, atajos, KPIs viejos | Saludo y fecha; sucursal + `Select` del periodo + «⋯» (Actualizar, Personalizar…); «Hoy» apilado con «Ver las N»; ventas con gráfica; tienda web; módulos. Sin actividad (no está en el frame: ni se consulta) |
| `448:205458` / `448:205616` / `448:205745` móvil cargando, vacío, detalle | — | Mismos componentes; el detalle es hoja inferior (`PanelAdaptable`) |

### Qué se quitó y dónde quedó cada cosa

| Pieza vieja | Destino |
|---|---|
| `DashboardAtajos` (lista cableada de rutas y módulos, contra la regla del mapa de módulos) | Borrada. «Ver módulo →» de cada fila de «Módulos» (menú visible del servidor) y el menú lateral |
| `DashboardKPIs` + `KpiDetailDialog` + `inicioService.getDashboardData` (41 consultas desde el navegador) | Borrados. Ventas → «Ventas del periodo» y su detalle; facturas y cartera → fila Finanzas de «Módulos»; clientes → CRM; productos → Inventario; miembros → RRHH; reservas → Hotel; visitas, compras y conversión web → «Tienda web» (+ `/app/inicio/analitica-web`) |
| `DashboardTendencia` | Borrada; la gráfica vive dentro de «Ventas del periodo» con la regla única de ventas y el periodo/sucursal del selector |
| `DashboardActividad` | Borrada; `ActividadReciente` (servidor). Reservas: chip «Reservas» solo para quien tiene hotel y alguna en el periodo |
| `WebCommerceObservability` en el inicio | Pedidos por expirar → casilla «Pedidos web» de «Hoy» («N expiran en menos de 30 min») y «Tienda web» («N expiran hoy»). Reservas huérfanas → casilla nueva «Reservas de stock sin mover» de «Hoy» (aviso solo si las hay; «Revisar» lleva a Pedidos online). El panel completo (items reservados, stock disponible por producto) se monta ahora en `/app/pos/pedidos-online`, donde se atienden los pedidos |
| `OnboardingBanner` | Borrado; «Primeros pasos» (mismos 7 pasos, conteos en el servidor) |
| `PeriodoSelector` del inicio | Borrado; `SelectorPeriodoInicio`. `HorasPresets` sigue (lo usa Reportes) y exporta sus franjas |
| `useDashboardRealtime` (canal a todas las tablas + intervalo de 30 s) | Borrado. «Hoy» sigue refrescando cada 2 min con la pestaña visible; el resto con «Actualizar» |
| `DashboardAlertas` (sin montar desde la tanda 1) | Borrado |

`DashboardModulos`, `ModuloSection`, `LazySection` y `components/inicio/sections/*` siguen sin montar desde la
tanda 2 pero no se borraron: los leen `guardrails.test.ts` (COP cableado) y las pruebas de comisiones F13.

### Migraciones (por MCP, con `.sql` y rollback)

| Migración | Qué | md5(prosrc) antes → después |
|---|---|---|
| `20260930230000_inicio_pedidos_web_pendientes` | Nueva `fn_inicio_pedidos_web_pendientes(org, sucursal, minutos)`: pendientes, `por_expirar`, `expiran_hoy` (día de `fn_timezone_for`), `hay_pedidos`; criterio de expiración de `expire_pending_web_orders`. La usan «Hoy» y «Tienda web» | — → `2aed560ca16defe5dd36e61b0e72ddc8` |
| `20260930230100_inicio_series_diarias` | `fn_inicio_ventas_rango`: `actual.granularidad` y `actual.serie` (neto por hora si el rango cabe en 2 días, si no por día, en la zona `fn_timezone_for`; sale de los mismos CTE, suma exactamente `neto` —verificado en tres organizaciones—); `fn_inicio_ventas_periodo` la devuelve para el periodo y el anterior sin cambiar. `fn_inicio_tienda_web`: `serie` [{b, visitantes, pedidos, pagados}], `por_expirar`, `expiran_hoy` | ventas_rango `af58f90c…c1f2` → `9259818828e635c04edbbb617f166bd7`; tienda_web `b3619e82…b4c4` → `8c8e5889ab2413db90a5d0be90bfbaae` |
| `20260930230200_inicio_actividad` | Nueva `fn_inicio_actividad`: ventas, facturas, clientes, stock y reservas del periodo y la sucursal, cada tipo solo con su módulo activo y su permiso (`fn_caja_puede`), conteo por tipo y una página | — → `4029dba8c1a7c1b9ff36aae0968f2e7e` |

Todas SECURITY DEFINER con `fn_assert_acceso_org`, `revoke … from public, anon`. El rollback de las series lleva los
cuerpos anteriores byte a byte (md5 comprobado contra la base). `fn_inicio_tienda_web` se aplicó dos veces: la
primera versión agrupaba (hora/día, visitante) sobre las visitas crudas y ordenaba en disco (2,25 s en frío /
656 ms en caliente); el archivo refleja la versión final (visitante por hora/día primero y de ahí el total).
`get_advisors`: solo el aviso esperado de SECURITY DEFINER ejecutable por `authenticated`.

EXPLAIN ANALYZE (organización 137, la de más visitas: 120 mil; 30 días + 30 anteriores): `fn_inicio_tienda_web`
456 ms antes → 530 ms después (la serie cuesta ~25 ms; el resto es el mismo índice de visitas). La ruta mantiene
su caché de 60 s por organización, usuario, periodo y sucursal: una sola llamada por render, sin consultas por
fila. `fn_inicio_ventas_periodo` (organización 135, 30 días): 94 ms en frío / 41 ms. `fn_inicio_actividad` (un año):
93 ms (organización 135) y 208 ms (organización 2, 18 mil clientes).

### Rutas nuevas

| Ruta | Qué |
|---|---|
| `GET /api/inicio/actividad?periodo…&sucursal=&tipo=&pagina=&tamano=` | `withOrg`, panel completo, periodo/sucursal (`pedidoPanel`), filtro y página validados (`leerPedidoActividad`); 42501 → 403 |
| `GET /api/inicio/primeros-pasos` | `withOrg`, panel completo; conteos con el cliente de la sesión y enlaces solo a páginas del menú visible |

`GET /api/inicio/ventas` añade `hrefVentas` (solo si se ve `/app/pos/ventas`). Regla nueva compartida
`lib/pos/reservasStock.ts` (umbral de reserva huérfana), que ahora usan la ruta de observabilidad y «Hoy».

### Decisiones

- «Actualizar» recarga ventas, actividad, tienda y primeros pasos en silencio (`useLecturaInicio` con `refresco`):
  sin esqueleto y, si falla, se conservan los datos y avisa un toast. «Hoy» y «Módulos» recargan como antes.
- «Hoy» y la fila de ventas esperan a saber si la organización es nueva: montarlos antes lanzaba sus consultas y
  parpadeaba. Si la lectura de los pasos falla, se pinta el panel normal.
- «Vacío» = sin ventas, facturas, movimientos de stock ni reservas nunca. «Módulos» y «Tienda web» se pintan igual
  (el frame no los muestra; una organización sin ventas pero con hotel o gimnasio perdería el acceso).
- La casilla «Caja» del frame sigue sustituida por «Cajas sin cerrar» (V.9b). «Hoy» mantiene el tope de cinco.
- La tarjeta «Tienda web» solo lleva «Ver analítica web» (`463:15514`); los pedidos se atienden desde «Hoy».
- Conversión de la tienda: pagados/visitantes (como la tanda 2); el detalle dice «visita → pedido N % · M pagados»
  (el «abandono» del frame no está en la RPC).
- Móvil: las acciones de la cabecera pasan al «⋯» junto al periodo (el frame no tiene botones).
- Bug del dueño en móvil («Hoy» recortado con un hueco debajo): no se reprodujo en Chromium a 390 y 360 px ni con
  el código de producción (`origin/master`, mismo `BloqueHoy`). Se quitó el único recorte del camino
  (`overflow-hidden` de `TarjetaHoy`, el acento va ahora dentro del borde con su radio) y la tarjeta crece con su
  contenido. Verificado con un arnés que renderiza la página real (esbuild + Tailwind del repo + Chromium de
  `/opt/pw-browsers`) a 1440, 390 y 360 px: las casillas se apilan completas y no hay desborde horizontal. Pendiente
  confirmar en el iPhone del dueño (WebKit no está disponible aquí).

### Pruebas (TZ=UTC y TZ=America/Bogota)

| Suite | Qué |
|---|---|
| `lib/dashboard/__tests__/inicioTanda4.test.ts` | series (lectura, alineación, etiquetas de día sin correrse con TZ del proceso, trazo, CSV), actividad (pedido, respuesta, chips, títulos, «hace N min»), primeros pasos |
| `lib/dashboard/__tests__/inicioTanda4Servidor.test.ts` | args de `fn_inicio_actividad` (organización del contexto, desplazamiento), 42501 → 403, conteos de primeros pasos, «Ver ventas» |
| `app/api/inicio/__tests__/rutasTanda4.test.ts` | 401, 403 empleado, 400 (periodo, sucursal ajena, tipo, página, tamaño), organización de la sesión |
| `components/inicio/__tests__/inicioTanda4.test.tsx` | tarjeta de ventas y detalle, recarga silenciosa, actividad (filtro y página al servidor), miniaturas, primeros pasos, selector; 4 idiomas |
| `components/inicio/__tests__/paginaInicio.test.tsx` | la página: orden del Figma, solo `/api/inicio/*` con la organización, Actualizar, vacío, error de fila, sin sucursal, móvil, empleado; 4 idiomas |
| `bloqueHoy*.test.ts` | casilla «Reservas de stock sin mover», «N expiran en menos de 30 min», RPC de pedidos web |

50 suites y 1.821 pruebas en verde en las dos zonas (inicio, dashboard, rutas del inicio, guardrails, guardarraíl
de rutas, i18n, timezone, reportes, pedidos online, `lib/pos`). `guardrails.test.ts`: se cambió el bloque del
inicio (leía `DashboardKPIs.tsx` y la línea de `loadData`), manteniendo la intención: la página no monta bloques
que consulten antes de tener organización, sucursal y rol. `tsc` completo: 0 errores. ESLint limpio en lo tocado.

### Pendiente

- Unificar el criterio de expiración de pedidos web: vive en `expire_pending_web_orders`,
  `fn_inicio_pedidos_web_pendientes` y la ruta de observabilidad (Node).
- Claves i18n de las piezas borradas (`home.kpis`, `home.activity`, `home.onboarding`, `home.quickAccess`…) siguen
  en los cuatro idiomas: quitarlas cuando no haya otra sesión editando `messages/*.json`.
- `posDashboardService.ts` menciona `inicioService` en tres comentarios.
- Borrar `DashboardModulos`, `ModuloSection`, `LazySection` y `sections/*` exige mover antes las pruebas F13 y la
  lista del guardarraíl de COP.
