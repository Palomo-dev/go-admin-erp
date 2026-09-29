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
