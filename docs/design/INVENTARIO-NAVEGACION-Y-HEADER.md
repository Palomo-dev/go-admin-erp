# Navegación, selector de organización/sucursal y header — inventario funcional y propuesta

Insumo para rediseñar en Figma («GO Admin — Sistema de diseño», `EAvjINVRnlzFM70GVoWXgl`)
las tres áreas del layout sin perder ninguna función. Complementa a
`docs/design/PARIDAD-BLOQUE-SESION.md` (bloque de sesión del sidebar, ya diseñado).

Fecha del inventario: 2026-09-21. Solo lectura de código; verificación de BD con
`SELECT` por el MCP de Supabase (proyecto `jgmgphmzusbluqhuqihj`). Sin nombres de
organizaciones cliente.

Regla: **ninguna función actual se pierde**. Lo que no quepa en el diseño se anota
en la tabla de paridad (§4) antes de quitarlo, no después.

---

## 0. Qué se usa realmente (verificado por imports)

| Componente | ¿Se usa? | Evidencia |
|---|---|---|
| `src/components/app-layout/AppLayout.tsx` | **Sí**: shell de toda `/app/**` | `src/app/app/layout.tsx`, `src/app/app/inicio/page.tsx` y 6 archivos más lo importan |
| `src/components/app-layout/Sidebar/{SidebarNavigation,NavSection,NavItem,SubMenuPanel}.tsx` | **Sí** | `AppLayout.tsx:87-88` |
| `src/components/layout/DynamicSidebar.tsx` y `src/components/layout/sidebar/{ModuleItem,SubrouteItem,UserProfile}.tsx` | **No**: cero imports fuera de su carpeta | `grep -rn "DynamicSidebar\|layout/sidebar/" src` → sin resultados. Código muerto (~500 líneas) |
| `src/components/app-layout/ThemeToggle.tsx` | **No**: `AppHeader` inlinea su propio botón (`AppHeader.tsx:83-94`) | sin imports |
| `src/components/app-layout/ProfileManager.tsx` | **No** | sin imports |
| `src/components/app-layout/Header/Notifications/*` (carpeta modular) | **Parcial**: `AppHeader` usa el monolito `Header/NotificationsMenu.tsx`; de la carpeta solo `NotificationService.ts` y `types.ts` los importa `components/inicio/EmployeeDashboard.tsx:45-46`. `Notifications/NotificationsMenu.tsx`, `NotificationsHeader.tsx`, `NotificationsList.tsx`, `NotificationItem.tsx` están muertos | `AppHeader.tsx:10` |
| `src/components/app-layout/ProfileDropdownMenu.tsx` | **Sí, solo en el header** (`isSidebar=false`). Las ramas `isSidebar=true` (líneas 290-420) son código muerto: el sidebar usa `AccountSwitcher` | `AppHeader.tsx:7,100-105`; `SidebarNavigation.tsx:95,566` |

---

## 1. Inventario de funciones actuales por área

### 1.1 Shell (`AppLayout.tsx`)

| Función | Archivo:línea | Detalle |
|---|---|---|
| Contenedor `flex h-dynamic-screen` con sidebar + panel de submenú + contenido + panel IA | `AppLayout.tsx:1366-1612` | `h-dynamic-screen` definido en `src/app/globals.css:62` (100dvh con fallback) |
| Overlay oscuro móvil al abrir el drawer | `AppLayout.tsx:1368-1374` | `lg:hidden`, cierra al tocar |
| Sidebar: `fixed` en móvil (drawer `w-72 max-w-[85vw]`, `translate-x`), `sticky` en escritorio (`lg:w-20` colapsado / `lg:w-64` expandido) | `AppLayout.tsx:1377-1385` | Punto de corte móvil/escritorio: **1024 px** (`lg`) |
| Estado inicial: **colapsado por defecto**, no persistido | `AppLayout.tsx:521` | `useState(true)`; no hay `localStorage` para la preferencia |
| Detección de viewport móvil (<1024) para no pintar la vista «icono colapsado» en móvil | `AppLayout.tsx:524-530` | |
| Cabecera del sidebar: «GO Admin ERP» / «GO», botón contraer/expandir (escritorio), botón × (móvil) | `AppLayout.tsx:1388-1410` | Franja azul `bg-blue-600` de 60 px, misma altura que el header |
| Tarjeta de organización (org card): logo o inicial con color determinístico, tooltip flotante con nombre cuando está colapsado | `AppLayout.tsx:1413-1468` | Color por `getOrgColor(orgId)` (`src/lib/utils/organizationColors.ts:132`, paleta cíclica por id). Logo desde `localStorage.organizacionActiva.logo_url` (`:561-575`) |
| Selector de organización interactivo dentro de la org card (siempre en móvil; en escritorio solo expandido) | `AppLayout.tsx:1461-1466` | `OrganizationSelectorWrapper` → `common/OrganizationSelector` |
| Panel de submenú «Multi-Column» (segunda columna) para el módulo activo, solo escritorio y solo si hay >1 página activa | `AppLayout.tsx:1489-1510` | Se cierra automáticamente al cambiar de módulo (`:542-553`); botón flotante para reabrirlo (`:1513-1535`) a `left: 80px/256px` |
| Detección del módulo activo por ruta (prefijo de `href` del módulo o de cualquiera de sus subpáginas) | `AppLayout.tsx:446-467` | Usa la lista `MODULES_WITH_SUBMENU` (`:149-443`), **duplicada** de la de `SidebarNavigation` |
| Header | `AppLayout.tsx:1540-1550` | Ver §1.6 |
| Aviso «datos locales» del Desktop (fase 4C) | `AppLayout.tsx:1556` | `LocalDataNotice` |
| Skeleton mientras `useSubscriptionGuard` valida | `AppLayout.tsx:1557-1563` | |
| Panel GO Assistant a la derecha + botón flotante lateral (solo escritorio) | `AppLayout.tsx:1569-1590` | Ver §1.9 |
| `ModuleLimitNotification` (toast fijo abajo-derecha, solo admin de la org) | `AppLayout.tsx:1593-1597`; `components/notifications/ModuleLimitNotification.tsx:121` | |
| Softphone dock + toast de llamada entrante si el CRM está activo | `AppLayout.tsx:1605-1610` | |
| `NavigationProgress` (barra superior 1 px, z-100) y `OfflineIndicator` (franja ámbar fija arriba, z-9999) | `AppLayout.tsx:1362-1364`; `NavigationProgress.tsx:15`; `OfflineIndicator.tsx:259` | Ambos se superponen al header: hay que reservarles sitio en el diseño |
| Carga de perfil (nombre, correo, rol, avatar) con caché `localStorage` 5 min + fallback + Realtime sobre `profiles` | `AppLayout.tsx:469-483, 776-1179` | Alimenta sidebar, header y contexto del asistente |
| Carga de módulos activos y páginas activas por org; acceso por cargo (`job_position_*`) | `AppLayout.tsx:590-643` | Ver §1.3 |
| Evento `modules-updated` (refresco optimista al activar/desactivar módulos) | `AppLayout.tsx:729-749` | |
| Evento `organization-changed` (cambio de org sin recarga) | `AppLayout.tsx:1249-1257` | Lo emite `guardarOrganizacionActiva` (`useOrganization.ts:671`) |
| Verificación de suscripción cancelada → `/app/organizacion/plan` | `AppLayout.tsx:753-774` | |
| Cierre de sesión (limpieza de storage, `removeSavedAccount`, `signOut` con timeout 5 s, `replace('/auth/login')`) | `AppLayout.tsx:1266-1330` | Compartido por sidebar y header |
| Tema (next-themes + `themeService` con override manual y sync remoto) | `AppLayout.tsx:1182-1199, 1333-1343` | |
| Registro de push token (Capacitor) y de dispositivo | `AppLayout.tsx:680-726` | Comportamiento, no UI |
| Sin layout en `/app/cuenta-congelada` | `AppLayout.tsx:1353-1355` | |

### 1.2 Sidebar (`Sidebar/*`)

| Función | Archivo:línea | Detalle |
|---|---|---|
| 5 secciones con título: Principal, Gestión, Ventas, Organización, Sistema | `SidebarNavigation.tsx:117-465`; textos `messages/es.json` → `nav.sectionMain…sectionSystem` | En colapsado el título se sustituye por «•» (`NavSection.tsx:31`) |
| Ítem «Inicio» siempre visible (sin `moduleCode`) | `SidebarNavigation.tsx:121, 477` | |
| Ítems por módulo con `moduleCode` y submenú de páginas (lista cableada; CRM desde `src/config/crmNav.ts`) | `SidebarNavigation.tsx:127-462` | Tamaños: Finanzas 29 páginas, Inventario 22, CRM 20, PMS 17, Transporte 17, POS 13, HRM 11, Parqueadero 9, Organización 9, Gimnasio 7, Notificaciones 7, Integraciones 6, Chat 6, Calendario 3, Proyectos 3, Timeline 2, Roles 1; sin submenú: Clientes, Reportes, Configuración |
| Filtro por módulos activos de la org, por páginas activas (`organization_module_pages`) y por acceso del cargo (`jobPositionVisibleModules/Pages`) | `SidebarNavigation.tsx:468-522` | Si queda 1 sola página, el módulo se vuelve enlace directo (`:505-512`) |
| Submenú de «Notificaciones» distinto según **nombre de rol** en cliente (admin/owner/super admin → 7 páginas; resto → solo Bandeja) | `SidebarNavigation.tsx:418-431` | Viola la regla 6 de `CLAUDE.md` (permisos por nombre de rol y en cliente). Ver §2 |
| Ítem sin submenú: `Link` con icono en «chip» azul, estado activo por prefijo de ruta, tooltip a la derecha cuando colapsado, prefetch on hover | `NavItem.tsx:270-315` | |
| Ítem con submenú, **escritorio (≥768 px)**: `DropdownMenu` de shadcn que se abre a la derecha (`side="right"`, `w-52`) con las páginas; chevron rota; se cierra al navegar | `NavItem.tsx:184-266, 95-99` | Es el «flyout»; convive con el `SubMenuPanel` |
| Ítem con submenú, **móvil (<768 px)**: acordeón clásico (`max-h-[40vh]` con scroll interno) | `NavItem.tsx:121-181` | Nota: entre 768 y 1023 px el drawer móvil muestra la versión DropdownMenu (ver §2) |
| Resaltado de subpágina por «longest-prefix-match» (evita doble resaltado en rutas anidadas) | `NavItem.tsx:62-73`; `SubMenuPanel.tsx:328-355` | Lógica duplicada en ambos |
| Mapa de iconos de respaldo por nombre de página | `NavItem.tsx:26-42`; `SubMenuPanel.tsx:89-301` | Duplicado; el de `SubMenuPanel` tiene ~150 entradas |
| `SubMenuPanel` (segunda columna, `w-56`, `hidden lg:flex`): cabecera azul con icono + nombre del módulo + botón cerrar; lista de páginas con indicador activo (barra 1×6 px); pie «N opciones» | `SubMenuPanel.tsx:357-442` | |
| Pie del sidebar: `AccountSwitcher` (bloque de sesión) + «Mi Suscripción» (`/app/plan`, azul) + «Cerrar sesión» (rojo) con tooltips cuando colapsado; en móvil los dos botones van dentro del scroll | `SidebarNavigation.tsx:543-639` | Ya cubierto por `PARIDAD-BLOQUE-SESION.md` |
| Área táctil mínima 44 px en ítems móviles | `NavItem.tsx:129, 167, 278` | |

### 1.3 Resolución de módulos y páginas (qué ve cada organización)

| Función | Archivo:línea | Detalle |
|---|---|---|
| Catálogo de módulos: `modules(code, name, description, is_core, icon, rank, is_active)` | BD verificada | 20 módulos. Core (no cuentan para el plan): `organizations`(rank 100), `clientes`(125), `roles`(140), `configuracion`(150). Pagados: `pm`(0), `gym`(10), `chat`(14), `pos`(200), `inventory`(300), `pms_hotel`(400), `parking`(410), `transport`(500), `crm`(600), `hrm`(700), `finance`(800), `reports`(900), `notifications`(910), `integrations`(920), `calendar`(930), `operations`(940) |
| Iconos en BD (`modules.icon`): nombres lucide en kebab-case, **inconsistentes** (`Settings` en PascalCase, `building-library` no existe en lucide, `pm` tiene `null`) y **no se usan** en el sidebar (los iconos están cableados en JSX) | BD + `SidebarNavigation.tsx` | El orden `rank` tampoco se usa: el sidebar ordena a mano por secciones |
| Módulos activos por org: `organization_modules(organization_id, module_code, is_active, enabled_at, disabled_at, activated_at)` ∪ módulos core | `moduleManagementService.ts:449-471` | Media observada: 12,5 módulos pagados activos por org |
| Páginas activas por módulo: `organization_module_pages(organization_id, module_code, page_href, page_name, is_active, enabled_at, disabled_at)` | `moduleManagementService.ts:565-588`; catálogo de páginas en `src/lib/config/modulePages.ts:12-229` (`MODULE_PAGES`) y `MODULE_HREF_TO_CODE` (`:238`) | Si un módulo no tiene filas, todas sus páginas se consideran activas |
| Límite de módulos por plan (`get_current_plan` RPC + `subscriptions.metadata`) | `moduleManagementService.ts:112-183` | Solo afecta a `/app/organizacion/modulos`; el sidebar no lo muestra |
| Acceso por cargo: `job_position_module_access` / `job_position_page_access` | `src/lib/services/jobPositionModuleAccessService.ts:29-35` | `null` = sin restricciones |
| Hook alternativo `useOptimizedModules(orgId).canAccessModule(code)` usado por la campana y la portada | `src/hooks/useOptimizedModules.ts:14` | Tercera vía de resolver módulos |

### 1.4 Selector de organización (`common/OrganizationSelector.tsx`)

| Función | Archivo:línea | Detalle |
|---|---|---|
| Trigger: avatar (logo o inicial con color por id, borde de color) + nombre + chevron, ancho completo de la org card | `OrganizationSelector.tsx:293-319` | |
| Lista de organizaciones del usuario (miembro activo) con nombre, **rol** y barra lateral de color; check en la activa | `OrganizationSelector.tsx:190-231`; datos `organizationService.getUserOrganizations` (`organizationService.ts:59-68`: `id, name, description, logo_url, status, primary_color, secondary_color, subdomain, legal_name` + `roles.name`) | BD: máximo observado 7 organizaciones por usuario, media 1,14 |
| Búsqueda por nombre (`autoFocus`) | `OrganizationSelector.tsx:57-62, 170-182` | |
| Escritorio (≥1024): panel anclado bajo el trigger vía portal (`fixed`, ancho ≥260, `max-h-80`) | `OrganizationSelector.tsx:344-356` | Cierre por clic fuera (`:150-164`) |
| Móvil (<1024): **bottom sheet** a pantalla completa «Seleccionar organización» con × | `OrganizationSelector.tsx:325-342` | |
| «Crear Organización» al final de la lista (y como único botón si el usuario no tiene ninguna) | `OrganizationSelector.tsx:233-246, 262-288` | |
| Diálogo real de creación: `CreateOrganizationDialog` (portal, z-9999, título «Crear Nueva Organización» de `org.createOrgDialog.title`) que envuelve `CreateOrganizationWizard` de **4 pasos**: datos de la org → sucursal (`auth/BranchStep`) → suscripción (`auth/SubscriptionStep`) → método de pago (`auth/PaymentMethodStep`) | `organization/CreateOrganizationDialog.tsx:76-99`; `CreateOrganizationWizard.tsx:6-8, 346-412` | El mismo wizard se muestra inline en «Mis Organizaciones» (`ManageOrganizationsTab.tsx:24, 140`) |
| Al crear: refetch de la lista y selección de la nueva org | `OrganizationSelector.tsx:360-371` | |
| Cambio de org: `cambiarOrganizacionActiva` limpia sucursal/`branchFilterAll`/caché, escribe cookies `org_id`/`goadmin_org_id`, persiste `profiles.last_org_id` y **recarga la página** (`window.location.reload()`) | `src/lib/hooks/useOrganization.ts:258-289` | |
| Fallback: si no hay org guardada, toma la primera y la persiste | `OrganizationSelector.tsx:110-122` | |
| Skeleton de carga | `OrganizationSelector.tsx:252-260` | |
| Textos **sin i18n** («Buscar organización...», «Crear Organización», «No se encontraron organizaciones.», «Seleccionar organización») | `OrganizationSelector.tsx:178, 187, 244, 332` | `messages/es.json` solo tiene `org.createOrgDialog.title` |

### 1.5 Selector de sucursal (`common/BranchSelector.tsx`, vía `Header/BranchSelectorWrapper.tsx`)

| Función | Archivo:línea | Detalle |
|---|---|---|
| Ubicación: en el **header**, a la izquierda del hamburguesa en móvil y a la derecha (antes del botón IA) en escritorio | `AppHeader.tsx:49-51, 65-67` | Único punto de la app donde se cambia de sucursal |
| Trigger: icono determinístico por id (10 iconos: Building, Store, Warehouse, Factory, Hotel, Landmark, Home, Tent, ShoppingBag, Briefcase) en «chip» de color determinístico (10 colores) + nombre (escritorio, `max-w-[140px]`, con salto de línea) / **iniciales de 3 letras** (móvil) + chevron | `BranchSelector.tsx:42-92, 164-196` | `title` con el nombre completo |
| Opción «Todas las sucursales» (icono Layers) solo si `canSelectAll` | `BranchSelector.tsx:217-238` | `canSelectAll` = admin (por `is_super_admin` **o nombre de rol** «Super Admin»/«Admin de organización») o >1 sucursal asignada: `branchService.ts:87-135` |
| Lista con icono, nombre, dirección; check en la seleccionada; búsqueda por nombre o dirección | `BranchSelector.tsx:119-128, 240-282` | BD: 89 sucursales en 84 orgs, media 1,1, **máximo 3 por org** |
| Escritorio: dropdown `absolute right-0 w-72`; móvil: panel `fixed top-[60px]` a ancho completo (no es bottom sheet) | `BranchSelector.tsx:199` | Inconsistente con el selector de organización (bottom sheet) |
| Persistencia: `currentBranchId` (local+session+storage móvil) y `branchFilterAll` = '1'/'0'; evento `branch-changed`; sin recarga | `src/lib/context/BranchContext.tsx:48, 139-162`; también `AccountSwitcher.tsx` y `useOrganization.ts:265-269` limpian `branchFilterAll` | Al arrancar, restaura la guardada o toma `is_main` / la primera (`BranchContext.tsx:78-103`) |
| Se recarga con `branches-updated` (CRUD en Sucursales) y `organization-changed` | `BranchContext.tsx:113-135` | |
| Si no hay sucursales devuelve `null` (desaparece del header) | `BranchSelector.tsx:158-160` | |
| **No existe «Crear sucursal» en el selector.** La creación vive solo en `/app/organizacion/sucursales` → `organization/BranchesTab.tsx`: `handleCreate` valida `max_branches` del plan, genera `branch_code` y abre un **modal inline** (no es un componente diálogo reutilizable) con `branches/BranchForm.tsx` (`ref.submitForm()`, `noFormWrapper`) | `BranchesTab.tsx:197-211, 899-977`; `BranchForm.tsx` | Para «Crear sucursal» en el switcher hay que **extraer** ese modal a `BranchFormDialog` (ver §3.1) |
| Campos de `branches` que usa la UI del selector: `id, name, address, is_main, is_active` (+ `organization_id`) | BD verificada: además `city, state, country, phone, email, manager_id, branch_type, zone, branch_code, latitude/longitude, opening_hours, features, capacity, is_web_published, slug, subdomain…` | Candidatos a subtítulo del ítem: `city` o `branch_type` |
| Badge «Sucursal X / Todas las sucursales» en la portada | `components/inventario/BranchBadge.tsx:16-28` | Consumidor del contexto, no selector |
| Textos sin i18n («Todas las sucursales», «Buscar sucursal...», «Seleccionar sucursal», «Cargando...») | `BranchSelector.tsx:109-110, 153, 209, 232` | |

### 1.6 Header (`Header/AppHeader.tsx`)

| Función | Archivo:línea | Detalle |
|---|---|---|
| Barra `sticky top-0 z-30`, 60 px, clase `mobile-safe-top` (safe-area iOS) | `AppHeader.tsx:36-37`; `globals.css:23` | |
| Hamburguesa (solo <1024) abre el drawer | `AppHeader.tsx:40-47` | Botón azul sólido 44×44 |
| Selector de sucursal: izquierda en móvil, derecha en escritorio | `AppHeader.tsx:49-51, 65-67` | |
| Buscador global centrado (`max-w-md`) en escritorio; en móvil (<768) **segunda fila** con barra completa (`forceFullBar`) | `AppHeader.tsx:55-61, 109-113` | Punto de corte del header: **768 px**, distinto del drawer (1024) |
| Botón GO Assistant (Bot) con estado «abierto» (azul sólido) | `AppHeader.tsx:69-80` | |
| Botón de tema (Luna/Sol) con `title` «Cambiar a modo oscuro/claro» | `AppHeader.tsx:83-94` | |
| Campana `NotificationsMenu` | `AppHeader.tsx:97` | §1.8 |
| Perfil `UserMenu` (= `ProfileDropdownMenu`) | `AppHeader.tsx:100-105` | §1.10 |
| `TrialBanner` bajo la barra: estados `trial_active`, `trial_warning`, `trial_expired`, `payment_past_due`, `subscription_canceled`, con días restantes y descarte en `localStorage` | `Header/TrialBanner.tsx:23-30, 68-110` | |
| `EmailVerificationBanner`: correo sin confirmar, «Reenviar correo» con temporizador de 60 s, descarte por horas | `Header/EmailVerificationBanner.tsx:7-104` | La misma acción existe dentro del menú de perfil (`ProfileDropdownMenu.tsx:70-86, 514-527`) |
| Textos i18n en `nav.*`: `openMenu`, `aiAssistant`, `aiAssistantTitle`, `toggleTheme`, `switchToDark`, `switchToLight` | `messages/es.json` | |

### 1.7 Buscador global (`Header/GlobalSearch.tsx`)

| Función | Archivo:línea | Detalle |
|---|---|---|
| Atajo **Ctrl+K / ⌘K** global | `GlobalSearch.tsx:311-322` | `kbd` visible solo `lg+` (`:349-351`) |
| Trigger: barra falsa «Buscar páginas, clientes, sucursales...» (escritorio) o icono lupa redondo (móvil sin `forceFullBar`) | `GlobalSearch.tsx:327-353` | |
| Diálogo `CommandDialog` (shadcn `command` sobre cmdk) con `DialogTitle` sr-only; input «Buscar organizaciones, clientes, productos...» | `GlobalSearch.tsx:356-370` | |
| Estado vacío: páginas iniciales (Productos, Proveedores, Categorías, Organización, Mi Perfil) | `GlobalSearch/types.ts:66-71` | Proveedores apunta a `/app/proveedores` (la ruta real es `/app/inventario/proveedores`) |
| Búsqueda en páginas predefinidas (15 cableadas: Inicio, Clientes, Organización, Finanzas, Facturas de Venta, Inventario, Pedidos Online, Reservas, Espacios, Membresías, Parqueadero, Reportes, Calendario, Notificaciones, Configuración) — **no** filtra por módulos activos ni por cargo | `GlobalSearch/types.ts:47-62`; `GlobalSearch.tsx:96-101` | |
| Búsqueda en datos (debounce, `limit 5` por grupo, `AbortController`, watchdog 7 s): sucursales, productos (nombre/sku/barcode), proveedores (nombre/nit/email), clientes (8 campos), categorías, facturas de venta (número), pedidos web, reservas PMS (por nombre de cliente), espacios, membresías gym, vehículos de parqueadero | `GlobalSearch/searchService.ts:55-65`; grupos `GlobalSearch.tsx:400-486` | **Sin filtro por `organization_id` en `branches`** (`searchService.ts:55`): depende solo de RLS. Ver §2 |
| Grupos con cabecera: Páginas, Sucursales, Clientes, Productos, Proveedores, Categorías, Facturas, Pedidos Online, Reservas, Espacios, Membresías, Parqueadero | `GlobalSearch.tsx:400-486`; `SearchResultGroup.tsx`, `SearchResultItem.tsx` (avatar de cliente `UserAvatar.tsx`, imagen de producto `ProductImage.tsx`) | Los grupos por módulo aparecen aunque el módulo no esté activo (la query devuelve vacío) |
| Navegación: cierra el diálogo y navega con un `<a>` creado dinámicamente (`data-from-search`) | `GlobalSearch.tsx:283-308` | Hard navigation, no `router.push` |
| Sin historial de búsquedas recientes, sin acciones («Crear cliente»), sin filtros por tipo | — | Oportunidad §3.3 |

### 1.8 Campana (`Header/NotificationsMenu.tsx`)

| Función | Archivo:línea | Detalle |
|---|---|---|
| Botón campana con badge rojo = `allUnreadCount + recordatorios de tareas` (si módulo `pm` activo). **Sin tope «99+»**: se pinta el número completo | `NotificationsMenu.tsx:378-391` | |
| Panel: escritorio `absolute right-0 w-96 max-h-600`; móvil `fixed top-[60px]` ancho completo, `max-h-[calc(100vh-60px)]` | `NotificationsMenu.tsx:394-397` | Tampoco es bottom sheet |
| Cabecera «Notificaciones y Recordatorios» + «N pendientes» | `NotificationsMenu.tsx:400-409` | |
| Pestañas: **Notificaciones / Tareas** (Tareas solo si `pm` activo) | `NotificationsMenu.tsx:57, 411-446` | |
| Sub-pestañas **Mías / Todas** (scope `mine`/`all`) | `NotificationsMenu.tsx:58, 448-480` | |
| «Marcar todas como leídas» por scope (RPC) | `NotificationsMenu.tsx:483-528` | |
| Fuente: `notifications` (15 mías / 20 todas, excluyendo tipos `task_*`), contador por RPC `get_unread_notifications_count`; lectura por usuario en `notification_reads` (`is_read_by_me`) | `NotificationsMenu.tsx:101-160`; `Notifications/types.ts:5-20` | |
| Realtime: canal por org (`notifications`) y por usuario (`notification_reads`) | `NotificationsMenu.tsx:224-275` | |
| Ítem: icono por canal (`email`→Mail, `sms`→Smartphone, `whatsapp`→MessageSquare, resto Bell), título, contenido, fecha; clic abre `NotificationDetailSheet` (`components/notificaciones/NotificationDetailSheet.tsx`) con navegación | `NotificationsMenu.tsx:546-600, 640-650` | Marcar leída individual `:329`; quitar de la lista `:364` |
| Recordatorios de tareas (`useTaskReminders`) → `TaskReminders` → `/app/pm/tareas?taskId=` | `Header/TaskReminders.tsx`; `NotificationsMenu.tsx:615` | |
| Pie: «Ver todas» → `/app/notificaciones` (o `/app/pm/tareas` en la pestaña Tareas) | `NotificationsMenu.tsx:622-636` | |
| Textos sin i18n | todo el archivo | |

### 1.9 GO Assistant (`Header/AIAssistantPanel.tsx`)

| Función | Archivo:línea | Detalle |
|---|---|---|
| Escritorio: columna derecha `w-80 xl:w-96` (0 cuando cerrado), `hidden lg:flex` | `AIAssistantPanel.tsx:947-952` | Botón flotante en el borde derecho para abrir (`AppLayout.tsx:1581-1590`) |
| Móvil (<1024): `Sheet` de shadcn a pantalla completa desde la derecha | `AIAssistantPanel.tsx:78, 960-975` | |
| Cabecera azul: Bot + «GO Assistant»; botones: «Responder en audio» (TTS, toggle verde), «Conversaciones anteriores» (`ConversationHistory`), «Limpiar conversación», cerrar (× móvil / PanelRightClose escritorio) | `AIAssistantPanel.tsx:652-711` | |
| Zona de mensajes: saludo «¡Hola, {userName}!» con sugerencias; burbujas con Markdown (`MarkdownRenderer.tsx`); streaming con pasos de herramienta; botón «Escuchar respuesta» por mensaje | `AIAssistantPanel.tsx:714-900` | |
| Confirmación de acciones (`ActionConfirmationForm.tsx`, `QuestionCard.tsx`, `BulkPreviewTable.tsx`, `CustomerFormDialog.tsx`), rechazar/corregir, **Deshacer «…»** | `AIAssistantPanel.tsx:381-552, 800-812`; `assistant/*` | |
| Composer: textarea autoexpandible (Enter envía en escritorio), adjuntos (clip + arrastrar/soltar + pegar captura), dictado por micrófono con transcripción | `assistant/Composer.tsx:11-16, 232-301`; `AIAssistantPanel.tsx:645-651` | |
| Contexto que recibe: `organizationId`, `organizationName`, `userName`, `userRole` | `AppLayout.tsx:1572-1577` | |

### 1.10 Perfil del header (`ProfileDropdownMenu.tsx`, `isSidebar=false`)

| Función | Archivo:línea | Detalle |
|---|---|---|
| Trigger escritorio: avatar 36 + nombre + rol + chevron; móvil: solo avatar (44×44) | `ProfileDropdownMenu.tsx:424-480` | |
| Escritorio: `DropdownMenu`; móvil: **modal centrado** vía portal (z-9998/9999) titulado «Mi Cuenta» con × | `ProfileDropdownMenu.tsx:113-286, 424-580` | |
| Cabecera del panel: avatar, nombre, correo, aviso «Correo sin confirmar» + «Reenviar» (60 s), nombre del plan (`subscriptions→plans.name`, `active`/`trialing`) | `ProfileDropdownMenu.tsx:46-111, 160-210, 514-527` | |
| Opciones: **Facturación** → `/app/plan` (botón azul) · **Ver perfil** → `/app/perfil` · **Configuración** → `/app/configuracion` (escritorio) / `/app/organizacion/informacion` (móvil) · **Notificaciones** → `/app/notificaciones` · **Cerrar sesión** (rojo, estado «Cerrando sesión...») | `ProfileDropdownMenu.tsx:214-277, 532-575` | Textos `nav.billing`, `nav.viewProfile`, `nav.settings`, `nav.notifications`, `nav.signOut`, `nav.signingOut`, `nav.myAccount` |
| Escucha `storage` para recargar el plan si cambia la org en otra pestaña | `ProfileDropdownMenu.tsx:105-110` | |

### 1.11 Portada `/app/inicio` (`src/app/app/inicio/page.tsx`)

| Función | Archivo:línea | Detalle |
|---|---|---|
| Cabecera: icono Home, saludo dinámico (`useDynamicGreeting`), fecha, `BranchBadge` | `inicio/page.tsx:241-254` | |
| Acciones: `PeriodoSelector` (hoy/…/personalizado + horas) solo para roles con dashboard financiero; **«Marcar turno»** (QR) → `/marcar` para todos; «Actualizar» | `inicio/page.tsx:257-298`; `components/inicio/PeriodoSelector.tsx`, `HorasPresets.tsx` | |
| `canSeeFinancialDashboard`: admin/manager por `role_id` 1/2/5, `STAGE_MANAGER_ROLE_IDS` o `is_super_admin` | `inicio/page.tsx:68-75` | |
| `OnboardingBanner` para organizaciones nuevas | `inicio/page.tsx:300-303` | |
| **`DashboardAtajos`**: rejilla de accesos rápidos filtrada por módulos activos (POS, Inventario, Finanzas, Hotel, CRM, Reportes, Mesas, Parqueadero, Calendario, Configuración) | `components/inicio/DashboardAtajos.tsx:20-86, 142` | Es el embrión del `MobileHomeNav` |
| KPIs, Alertas, Actividad, Tendencia 30 días, `WebCommerceObservability`, **`DashboardModulos`** (secciones consolidadas por módulo activo: finance, inventory, pos, crm, pms_hotel, parking, gym, hrm, transport, pm, notifications, integrations, calendar, operations, chat; con índice de anclas `#code` y enlace «Activar más módulos» → `/app/organizacion/modulos`) | `inicio/page.tsx:305-372`; `DashboardModulos.tsx:93-215, 243, 305` | Realtime `useDashboardRealtime` |
| Empleado (sin dashboard financiero): `EmployeeDashboard` = tarjeta «Marcar turno», atajos, «Mis tareas» (pm), «Mis notificaciones» con contador | `components/inicio/EmployeeDashboard.tsx:157-290` | |

### 1.12 Móvil (`src/lib/utils/mobile.ts`)

| Función | Archivo:línea |
|---|---|
| `isMobile()` = corre dentro del bridge Capacitor (no es «viewport estrecho»); `getMobilePlatform()` ios/android/web; `isIOS()`, `isAndroid()` | `mobile.ts:223-264` |
| Plugins: cámara, escáner de códigos, geolocalización, push, notificaciones locales, red, preferencias (storage), haptics, biometría, BLE, NFC, app, navegador, filesystem, share, **teclado** (`MobileKeyboardPlugin`, útil para bottom sheets) | `mobile.ts:91-192` |
| El layout **no** usa `isMobile()` para decidir UI; solo `window.innerWidth` (1024/768). `isMobile()` se usa para push (`AppLayout.tsx:704`) y storage móvil (`BranchContext`) | — |

---

## 2. Hallazgos de UX y de código

### 2.1 Duplicados

1. **Perfil del usuario en dos sitios**: header (`ProfileDropdownMenu`) y pie del sidebar (`AccountSwitcher`). Ambos consultan `subscriptions→plans.name` por separado (`ProfileDropdownMenu.tsx:88-111` y `AccountSwitcher.tsx:61-99`), ambos enlazan a `/app/perfil` y `/app/plan`, ambos cierran sesión. El header añade «Configuración», «Notificaciones» y «Reenviar correo», que el bloque de sesión aún no tiene.
2. **Dos listas de navegación cableadas** que deben mantenerse a mano y ya divergen: `AppLayout.tsx:149-443` (`MODULES_WITH_SUBMENU`, para el `SubMenuPanel`) y `SidebarNavigation.tsx:117-465` (para el sidebar). Diferencias detectadas: «Roles y Permisos» vs «Gestión de Roles»; Transporte con icono `Truck` vs `Bus`; Notificaciones con submenú por rol solo en el sidebar; `Clientes` y `Configuración` no existen en la lista del panel; nombres de módulo traducidos (`t('hrm')` = «Recursos Humanos») en el sidebar y en español fijo («HRM») en el panel. Además `src/lib/config/modulePages.ts` (`MODULE_PAGES`) es una **tercera** copia (páginas activables) y `GlobalSearch/types.ts` una **cuarta** (páginas buscables).
3. **Lógica de «subpágina activa» y mapas de iconos** duplicados entre `NavItem.tsx` y `SubMenuPanel.tsx`.
4. **Tres formas de resolver «módulo activo»**: `moduleManagementService.getActiveModules` (sidebar), `useOptimizedModules` (campana, portada), y `canAccessModule` en servidor.
5. **Dos submenús de escritorio** a la vez para el mismo módulo: flyout `DropdownMenu` en el ítem del sidebar y `SubMenuPanel` en segunda columna.
6. **Reenviar correo de confirmación** en el banner y en el menú de perfil.
7. **Sidebars muertos** (`layout/DynamicSidebar.tsx`, `layout/sidebar/*`, `Header/Notifications/NotificationsMenu.tsx`, `ThemeToggle.tsx`, `ProfileManager.tsx`, ramas `isSidebar` de `ProfileDropdownMenu`).

### 2.2 Inconsistencias

1. **Puntos de corte distintos**: drawer/colapsado a 1024 px (`AppLayout.tsx:526`), buscador y submenú móvil a 768 px (`AppHeader.tsx:29`, `NavItem.tsx:121,184`), org selector/perfil/asistente a 1024. Entre 768 y 1023 px el drawer móvil muestra ítems con `DropdownMenu` que se abre a la derecha (fuera del drawer) en lugar del acordeón.
2. **Paneles móviles de tres formas**: bottom sheet (organización), panel `fixed top-60` a ancho completo (sucursal, campana), modal centrado (perfil), `Sheet` lateral (asistente).
3. **«Configuración» del perfil lleva a rutas distintas** según viewport (`/app/configuracion` vs `/app/organizacion/informacion`).
4. **Dos rutas de plan**: `/app/plan` (Mi suscripción, Facturación) y `/app/organizacion/plan` (Mi Plan en el submenú de Organización, y destino de la redirección por suscripción cancelada).
5. **Nombres de módulo**: sidebar «Ventas» (`nav.pos`) vs panel «POS» vs BD «Ventas»; sidebar «Recursos Humanos» vs panel «HRM»; sidebar «Operaciones» (`nav.operations`, ruta `/app/timeline`) vs panel «Timeline».
6. **Iconos y orden de la BD (`modules.icon`, `modules.rank`) no se usan**: el orden lo dicta el JSX y los iconos están cableados; `modules.icon` tiene valores inválidos.
7. **Colores**: la organización tiene paleta por id (`organizationColors.ts`) y también `primary_color`/`secondary_color` en BD (`organizationService.ts:64`) que el selector no usa; la sucursal tiene otra paleta e iconos por id (`BranchSelector.tsx:42-92`).
8. **Textos sin i18n** en org selector, branch selector, campana, buscador y asistente, mientras el resto del layout usa `nav.*`.

### 2.3 Lo que falla o pesa en móvil

1. **Header de dos filas** (<768): fila de iconos (hamburguesa, sucursal, IA, tema, campana, perfil = 6 controles de 44 px) + fila de buscador → ~110 px fijos más `TrialBanner`/`EmailVerificationBanner`. En una pantalla de 375 px la primera fila no cabe cómodamente.
2. **La organización solo se cambia abriendo el drawer** (org card arriba del sidebar); la sucursal solo desde el header: el par «Org › Sucursal» está partido en dos superficies.
3. **Sucursal en móvil se muestra por iniciales** («SUC», «ALL»): poco legible con 1,1 sucursales de media (casi siempre es «Sucursal Principal»).
4. **Cambio de organización = recarga completa** de la página (`window.location.reload()`); en Capacitor se nota.
5. **`/app/inicio` no tiene navegación tipo app**: los atajos (`DashboardAtajos`) solo se ven en el dashboard financiero (`rolResuelto && canSeeFinancialDashboard`, `inicio/page.tsx:303`); el empleado ve otra rejilla distinta (`EmployeeDashboard.tsx:186-200`).
6. **Botón flotante del asistente y del panel de submenú** ocultos en móvil (`hidden lg:flex`); correcto, pero deja el asistente solo en el header.
7. **`OfflineIndicator` y `NavigationProgress`** se superponen al header sin desplazarlo (z-9999 / z-100).
8. Área táctil: `BranchSelector` trigger es `px-2 py-1` (~28 px de alto) — por debajo de 44 px.

### 2.4 Seguridad / reglas del repo detectadas de paso

- Submenú de Notificaciones y `canSelectAll` decididos por **nombre de rol en cliente** (`SidebarNavigation.tsx:418-431`, `branchService.ts:119`) — regla 6 de `CLAUDE.md`.
- `searchService.ts:55` busca `branches` **sin `.eq('organization_id')`** (solo RLS). Las demás queries sí filtran. Conviene un ticket aparte; no afecta al diseño.

### 2.5 `src/components/ui/**` — qué se usa en estas áreas y qué no

| Usado hoy | Dónde |
|---|---|
| `tooltip` | `NavItem`, `SidebarNavigation` (colapsado) |
| `dropdown-menu` | `NavItem` (flyout escritorio), `ProfileDropdownMenu` |
| `command` + `dialog` | `GlobalSearch` (Ctrl+K) |
| `sheet` | `AIAssistantPanel` móvil, `NotificationDetailSheet` |
| `button`, `badge` | `NotificationsMenu`, `inicio/page.tsx` |
| `alert`, `card`, `use-toast` | `inicio/page.tsx`, `EmployeeDashboard` |

| Disponible y **no usado** en estas áreas (pero pertinente) | Para qué |
|---|---|
| `popover` | `OrgSwitcher`/`BranchSwitcher` escritorio (hoy: portal manual con `getBoundingClientRect`) |
| `avatar` | Avatares de org, sucursal y usuario (hoy: `div` + `Image` a mano en 4 sitios) |
| `scroll-area` | Listas largas del sidebar y del panel de submenú |
| `separator` | Separadores de secciones y de «Crear…» |
| `collapsible` / `accordion` | Acordeón móvil de submenús (hoy: `max-h` animado a mano) |
| `tabs` | Pestañas Notificaciones/Tareas y Mías/Todas (hoy: botones a mano) |
| `skeleton` | Estados de carga de los selectores (hoy: `animate-pulse` a mano) |
| `confirm-dialog`, `alert-dialog` | Confirmar cambio de organización si hay trabajo sin guardar (nuevo) |
| `search-select` | No aplica (es para formularios) |

**No existen** en `ui/`: `sidebar` (shadcn Sidebar), `breadcrumb`, `drawer` (vaul, bottom sheet nativo), `kbd`. Si el diseño los necesita, se añaden con el CLI de shadcn; el bottom sheet puede hacerse con `sheet side="bottom"`.

---

## 3. Propuesta de arquitectura de componentes

Principio: **una sola fuente de navegación** y componentes «tontos» que la pintan.
Todo lo de abajo son nombres y contratos para Figma y para el código; no hay
código nuevo en este documento.

### 3.0 `NAV_REGISTRY` (fuente única, `src/config/navigation.ts`)

```ts
type NavModule = {
  code: string;            // = modules.code (BD)
  labelKey: string;        // nav.<code> en messages/*.json
  icon: LucideIcon;        // cableado aquí; opcionalmente modules.icon → mapa lucide
  section: 'main' | 'management' | 'sales' | 'organization' | 'system';
  href: string;            // ruta raíz del módulo
  pages: { href: string; labelKey: string; icon?: LucideIcon; exactMatch?: boolean }[];
  homeTile?: boolean;      // aparece en MobileHomeNav / DashboardAtajos
  searchable?: boolean;    // aparece como «Página» en el buscador
};
```

Sustituye a las cuatro copias (§2.1-2) y alimenta sidebar, `SubMenuPanel`,
`MobileHomeNav`, `DashboardAtajos`, `GlobalSearch` (páginas) y `MODULE_PAGES`.
El filtrado (módulos activos, páginas activas, cargo) se hace una vez en un hook
`useVisibleNavigation()` que devuelve el registro ya podado; **los permisos que hoy
dependen del nombre del rol** (Notificaciones, «Todas las sucursales») pasan a un
flag calculado en servidor (`/api/me/nav-capabilities` o RPC) y expuesto por el
mismo hook. `exactMatch` reemplaza la lista cableada de `SubMenuPanel.tsx:329`.

### 3.1 `OrgSwitcher` — Organización ▾ › Sucursal ▾ (estilo Vercel/Supabase)

**Ubicación**: extremo izquierdo del header en escritorio (donde Vercel pone
«Team › Project»), y en `MobileHeader` como texto compacto. Deja de vivir dentro
del sidebar (la org card se reduce al logo/inicial como marca del sidebar, sin
interacción). Justificación con datos: media 1,14 orgs por usuario (máx. 7) y 1,1
sucursales por org (máx. 3): el par cabe holgado en un breadcrumb y el 90 % de
usuarios verá un solo nombre por lado.

```
[◉ Org actual  ▾]  ›  [▣ Sucursal Principal ▾]
```

**Composición** (todos con `Popover` + `Command` de shadcn en escritorio; `Sheet
side="bottom"` con el mismo `Command` dentro en móvil):

| Componente | Props | Variantes / estados |
|---|---|---|
| `OrgSwitcher` | `layout: 'desktop' \| 'mobile'`, `showBranch?: boolean` (false si `branches.length === 0`, hoy `BranchSelector.tsx:158`) | Compone `OrgPicker` + `BranchPicker` con separador «›» |
| `OrgPicker` | `organizations: OrgSummary[]` (id, name, logo_url, role, plan?, status), `currentId`, `onSelect(id)`, `onCreate()`, `canCreate` | trigger `sm` (móvil: logo 24 + nombre truncado 120 px) / `md` (escritorio: logo 24 + nombre + chevron); `loading` (Skeleton); `empty` (solo «Crear organización») |
| `OrgPickerPanel` | `query`, `items`, `selectedId` | `CommandInput` «Buscar organización…», `CommandGroup` «Organizaciones» con `OrgRow`, `CommandSeparator`, `CommandGroup` acciones: «Crear organización» (+), «Ver todas» → `/app/organizacion/mis-organizaciones` |
| `OrgRow` | `org`, `selected` | `Avatar` (logo o inicial con `getOrgColor(id)`; barra de color a la izquierda como hoy), nombre, subtítulo rol; `Badge` del plan (**chip de plan**) y punto de estado (`status`: activa/prueba/suspendida); check a la derecha |
| `BranchPicker` | `branches`, `selection: number \| 'all'`, `canSelectAll`, `onSelect`, `onCreate()`, `canCreate` (admin y `branches.length < max_branches`), `maxBranches` | trigger `sm` (icono + nombre truncado; **nunca iniciales**) / `md`; `loading`; se oculta si no hay sucursales |
| `BranchPickerPanel` | igual que el de org | «Todas las sucursales» (Layers) arriba **solo si `canSelectAll`**; filas `BranchRow` (icono+color determinísticos actuales, nombre, `address` o `city`, `is_main` → chip «Principal»); acción «Crear sucursal» (+) con contador `n/max` y deshabilitada con tooltip al llegar al límite; «Gestionar sucursales» → `/app/organizacion/sucursales` |
| `CreateOrganizationDialog` (existente) | sin cambios | Se abre desde «Crear organización» exactamente como hoy (`OrganizationSelector.tsx:233-246`); al `onSuccess` refetch + `cambiarOrganizacionActiva(nueva)` |
| `BranchFormDialog` (**a extraer** de `BranchesTab.tsx:899-977`) | `open`, `orgId`, `initialData?`, `onSaved(branch)` | Envuelve `BranchForm` con `ref.submitForm()`, valida `max_branches` y genera `branch_code` (lógica de `BranchesTab.tsx:197-211`). `BranchesTab` pasa a usarlo también: una sola implementación |

**Comportamiento conservado**: cambio de org → `cambiarOrganizacionActiva` (limpia
sucursal, cookies, `last_org_id`, recarga); cambio de sucursal → `setSelectedBranch`
(`branch-changed`, sin recarga); persistencia `currentBranchId`/`branchFilterAll`;
refetch con `branches-updated` y `organization-changed`; tooltip con el nombre
completo. **Añadido**: `ConfirmDialog` opcional antes de cambiar de org si la
página declara cambios sin guardar (nuevo, opt-in).

**Móvil**: el trigger muestra `◉ Org › Sucursal` en una línea de 13 px truncada;
tocar cualquiera abre el `Sheet` inferior con dos pestañas (`Tabs`: Organización |
Sucursal) para no apilar dos sheets. «Crear…» dentro del sheet abre el mismo
diálogo/wizard a pantalla completa.

### 3.2 `Sidebar` — rail / expandido / drawer

**Recomendación: mantener el patrón actual de dos columnas (rail + `SubMenuPanel`)
en escritorio y acordeón en el drawer móvil; eliminar el flyout `DropdownMenu`.**

Argumentos:

1. **Tamaño de los submenús**: Finanzas 29, Inventario 22, CRM 20, PMS 17,
   Transporte 17 páginas. Un acordeón con 29 filas dentro de una columna de 256 px
   desplaza todo el resto del menú fuera de la vista y obliga a scroll doble; la
   segunda columna (224 px) da a cada módulo su propia lista con scroll propio y
   deja el rail estable. Es el patrón de Supabase (rail de iconos + panel de
   sección), Linear (settings) y Notion.
2. **El dueño ya está cómodo** con módulos ↔ páginas en dos niveles; el cambio
   es de pulido, no de modelo mental.
3. **El flyout `DropdownMenu` (`NavItem.tsx:184-266`) es redundante** con el
   panel: dos formas de llegar a la misma página en la misma pantalla, y el
   flyout se cierra al pasar el ratón. En el rail colapsado se sustituye por
   *hover-preview* del `SubMenuPanel` (aparece flotante al pasar el ratón sobre
   el icono, se fija al hacer clic).
4. **Acordeón solo en móvil**, donde no hay ancho para dos columnas, con
   `Collapsible` de shadcn, un módulo abierto a la vez y buscador rápido arriba
   del drawer («Ir a página…» filtra módulos y páginas del registro).

| Componente | Props | Variantes |
|---|---|---|
| `Sidebar` | `mode: 'rail' \| 'expanded' \| 'drawer'`, `sections`, `activeModuleCode`, `activePageHref`, `onNavigate`, `footer` (slot para `UserBlock`) | `rail` 80 px (icono + tooltip), `expanded` 256 px, `drawer` 288 px / 85 vw. Preferencia `rail/expanded` **persistida** en `localStorage` (hoy no) |
| `SidebarBrand` | `collapsed`, `orgLogo`, `orgName` | Logo/inicial de la org con color (org card actual sin interacción) + «GO Admin» + botón contraer |
| `NavSection` | `titleKey`, `items`, `collapsed` | En `rail`: separador fino en lugar de «•» |
| `NavItem` | `module`, `active`, `collapsed`, `badge?` (p. ej. conteo de bandeja de chat), `onClick` | `default / hover / active / disabled`; icono en chip azul como hoy |
| `NavItemAccordion` (solo drawer) | `module`, `open`, `pages`, `activeHref` | `Collapsible`; área táctil 48 px |
| `SubMenuPanel` | `module`, `pages`, `activeHref`, `open`, `pinned`, `onTogglePin`, `onClose` | `docked` (columna 224 px, como hoy), `floating` (hover sobre rail), `hidden`. Cabecera con icono + nombre + pin/cerrar; grupos opcionales dentro del módulo (Finanzas: Documentos / Tesorería / Contabilidad / Configuración) usando `NavModule.pages[].group` |
| `SubMenuReopenTab` | `left` | Pestaña flotante actual (`AppLayout.tsx:1526-1533`) pero pegada al borde del rail y con etiqueta del módulo |

Conservado: filtrado por módulos/páginas/cargo; conversión a enlace directo con
1 página; prefetch on hover; `aria-current`; cierre del drawer al navegar; cierre
del panel al cambiar de módulo (ahora con opción `pinned` para dejarlo fijo).

### 3.3 `AppHeader` (escritorio, sin perfil)

```
[◉ Org ▾ › ▣ Sucursal ▾]        [🔍 Buscar…  Ctrl+K]        [☾] [🔔 3] [✦ GO Assistant]
```

| Componente | Props | Notas |
|---|---|---|
| `AppHeader` | `left: OrgSwitcher`, `center: SearchTrigger`, `right: [ThemeToggle, NotificationsBell, AssistantButton]`, `banners: [TrialBanner, EmailVerificationBanner, OfflineIndicator]` | 56–60 px; los banners van **debajo** en un `BannerStack` que empuja el contenido (hoy `OfflineIndicator` flota encima) |
| `SearchTrigger` | `variant: 'bar' \| 'icon'`, `shortcut` | Barra 420 px con `kbd Ctrl+K`; misma `CommandDialog` |
| `CommandPalette` (evolución de `GlobalSearch`) | `groups`, `recent`, `actions` | Añadidos: sección «Recientes» (localStorage), «Acciones» (`Crear cliente`, `Nueva venta`, `Cambiar de sucursal → …`, `Cambiar de organización → …`), páginas del `NAV_REGISTRY` **filtradas por módulos activos y cargo**, grupos de datos solo de módulos activos, chips de filtro por tipo. Conservado: debounce, límite 5, abort/watchdog, todos los grupos actuales |
| `NotificationsBell` | `count`, `max=99` | Badge **«99+»**; panel como `Popover` 384 px; pestañas con `Tabs`; sub-pestañas Mías/Todas; «Marcar todas»; `NotificationDetailSheet`; recordatorios de tareas |
| `ThemeToggle` (reusar `app-layout/ThemeToggle.tsx`) | `theme`, `onToggle` | Igual; además aparece dentro del bloque de sesión (ya diseñado) |
| `AssistantButton` | `open`, `onToggle`, `unreadHint?` | Botón «✦ GO Assistant» con etiqueta en ≥1280 px; el botón flotante lateral se conserva como `AssistantEdgeTab` cuando el panel está cerrado |
| `AIAssistantPanel` | sin cambios funcionales | `docked` (columna 320/384) / `sheet` (móvil) |

**Destino del perfil del header**: todo pasa al bloque de sesión del sidebar
(`UserBlock`/`SessionPopover` de `PARIDAD-BLOQUE-SESION.md`). Lo que ese diseño
aún **no** tiene y hay que añadirle: «Configuración» (`/app/configuracion`),
«Notificaciones» (`/app/notificaciones`), aviso «Correo sin confirmar» + «Reenviar»
(60 s) y el nombre del plan se toma de un único hook `useCurrentPlan()`.

### 3.4 `MobileHeader` + `MobileHomeNav`

`MobileHeader` (una sola fila, 56 px + safe-area):

```
[☰]  ◉ Org › Sucursal ▾            [🔍] [🔔 3] [✦]
```

| Componente | Props | Notas |
|---|---|---|
| `MobileHeader` | `onOpenDrawer`, `orgSwitcher: compact`, `actions: [SearchIcon, BellIcon, AssistantIcon]`, `variant: 'default' \| 'home'` | Tema y perfil salen del header móvil (viven en el drawer/bloque de sesión). 4 controles de 44 px + texto central: cabe en 360 px. `variant='home'` oculta el hamburguesa y muestra el avatar (abre el bloque de sesión) porque en `/app/inicio` la navegación la da `MobileHomeNav` |
| `MobileSearchSheet` | — | `CommandDialog` a pantalla completa con teclado (plugin `Keyboard` de `mobile.ts:180` para ajustar la altura) |
| `MobileNotificationsSheet` | — | `Sheet side="bottom"` 90 vh (unifica con el sheet de org) |
| `MobileHomeNav` (en `/app/inicio`) | `tiles: NavModule[]` (del registro, `homeTile`, filtrados por módulos activos y cargo), `columns: 3 \| 4`, `badges?` | Rejilla tipo app: icono en chip de color + etiqueta; primer tile «Marcar turno» (QR) para todos; última «Más…» abre el drawer. Sustituye a `DashboardAtajos` y a los atajos de `EmployeeDashboard` en móvil (misma fuente), y se muestra a **todos los roles**, no solo a los del dashboard financiero |
| `MobileTabBar` (opcional, ver preguntas) | `items: [Inicio, Buscar, Asistente, Notificaciones, Menú]` | Barra inferior fija; alternativa a llevar buscador/campana en el header |

Comportamientos conservados en móvil: drawer con overlay y ×; acordeón de
páginas; org card (ahora como `OrgSwitcher` compacto en header); bloque de sesión
en el pie del drawer; `TrialBanner` y `EmailVerificationBanner` bajo el header.

### 3.5 «Reportar problema» — dónde queda el acceso (revisado 2026-09-22)

Función inventada en el diseño (**no existe en código**: no hay componente,
ruta ni endpoint de feedback en `src/`). El diálogo es `FeedbackDialog`, un
único `COMPONENT_SET` en `02 Componentes` con cuatro variantes —
`Layout=desktop|sheet` × `State=form|sent`—, así que escritorio y móvil
**apuntan al mismo componente**: tipo (Error · Sugerencia · Pregunta),
«¿Qué pasó?», «Fotos o capturas (opcional)» con dropzone y miniaturas,
«Tomar captura de pantalla», bloque de contexto automático de solo lectura,
casilla «Incluir mi correo … para respuesta» y `Cancelar` / `Enviar`.

| Plataforma | Disparador | Dónde vive | Frame en `03 Navegación y shell` |
|---|---|---|---|
| Escritorio | `IconButton` fantasma con `Icon/Bug`, entre `SearchTrigger` y `NotificationsBell` | `AppHeader` (componente maestro), por lo que aparece en **todas** las pantallas de escritorio | `Escritorio / Reportar problema` |
| Móvil (1) | Fila «Reportar problema» con `Icon/Bug` en el **bloque de sesión** («Mi cuenta»), justo encima del divisor de «Cerrar sesión» | `SessionSheet`, ambas variantes (`Accounts=closed` y `Accounts=open`) | `Móvil / Menú — SessionSheet abierto` |
| Móvil (2) | Fila «Reportar problema» **fija al pie del drawer**, fuera de la lista que hace scroll, separada por un divisor y por encima del `UserBlock` | `Sidebar` variante `Mode=drawer` → `Pie` › `Acciones (fijas)` | `Móvil / Menú — drawer abierto` |
| Ambas (3) | Acción «Reportar un problema» (subtítulo «Error, sugerencia o pregunta») en el grupo **Acciones** de la paleta de comandos, encima de «Páginas» | `SearchCommand`, variantes `Layout=desktop` y `Layout=mobile` | `Escritorio / Ctrl+K abierto` · `Móvil / Ctrl+K` |

**Exactamente un disparador por componente** (`AppHeader` 1, `SessionSheet` 1 por
variante, `Sidebar / Mode=drawer` 1, `SearchCommand` 1 por variante `State=results`,
`MobileHeader` 0 en los tres modos: no cabe y no lo lleva).

La marca «Nuevo» de la regla I.4.3 va **como anotación fuera del frame**, en gris
pizarra 12 px sobre cada pantalla — **nunca dentro del componente**. Un badge
metido en el `AppHeader` empuja el `SearchTrigger` y parece un segundo botón al
lado del icono de reportar; se probó, se veía mal y se revirtió el 2026-09-22.

Por qué esas dos entradas y no otra: el `MobileHeader` ya está al límite
(`OrgSwitcher` compacto + buscador) y la `MobileTabBar` está cerrada por decisión
previa (Inicio · Ventas · GO Asistente · Alertas · Menú); meter ahí un icono de
bug rompería cualquiera de las dos. El bloque de sesión es el equivalente móvil
del menú de perfil, que es donde el usuario busca «ayuda / soporte»; el drawer es
la única superficie que se abre desde la tab bar en un toque. **La fila del
drawer estaba antes dentro de `Navegación (scroll)`**, es decir, se leía como una
página más del menú y desaparecía bajo la línea de flotación en organizaciones
con muchos módulos: por eso se movió al pie fijo.

La hoja móvil es `FeedbackDialog / Layout=sheet`, anclada al borde inferior
(390 × 763) — `Móvil / Reportar problema (sheet)`. No hay ningún «Ayuda» ni
«Soporte» en el diseño con el que agruparla; si se añade, su sitio es esa misma
zona `Acciones (fijas)` del pie del drawer.

### 3.6 Nombres de organización en el archivo de Figma (2026-09-22)

El repositorio es público y las capturas de `docs/design/figma/` viajan a él, así
que **ningún nombre de organización cliente puede quedar en el archivo**. Se pasó
un script por las ocho páginas sustituyendo los nombres reales por los ficticios
acordados, editando los **maestros** de `02 Componentes` para que la corrección
se propagara a las instancias:

| Antes | Ahora | Dónde estaba |
|---|---|---|
| (nombre de una ferretería real, org 145) | `Mi empresa S.A.S.` | `OrgPicker`, `OrgSwitcher` (header y header-mobile), `SessionSheet`, `UserBlock`, breadcrumbs, `PageHeader`, contexto automático del `FeedbackDialog` |
| (nombre de una panadería real) | `Comercial Andina S.A.S.` | `AccountSwitcher` (segunda cuenta), chips org·rol, estado «Cambiando a …» |

Nomenclatura ficticia vigente: `Mi empresa S.A.S.` (organización actual),
`Comercial Andina S.A.S.` (segunda cuenta / cliente), `Distribuidora del Norte` y
`Calzado Mayorista S.A.S.` (proveedores), `Sucursal Principal` / `Sucursal Norte`
/ `Bodega Norte` (sucursales). Quedan a propósito los nombres **genéricos de
categoría o de producto** («Calzado», «Panadería», «Tornillo galvanizado 3"»):
describen el giro, no identifican a nadie.

Verificación: 0 coincidencias de nombres reales en las ocho páginas tras la
pasada. **Las capturas anteriores a esta fecha siguen mostrando el nombre viejo**
en el header y en el bloque de sesión y hay que regenerarlas (ver informe de la
tanda 17).

---

## 4. Tabla de paridad — función actual → dónde vive en el diseño nuevo

| Función actual (código) | Dónde vive en el diseño nuevo |
|---|---|
| Org card del sidebar con logo/inicial + color determinístico (`AppLayout.tsx:1413-1468`) | `SidebarBrand` (sin interacción) + avatar del `OrgPicker` en el header |
| Tooltip con nombre de la org en rail colapsado | `SidebarBrand` collapsed-hover |
| Selector de org: lista con rol, barra de color, check, búsqueda (`OrganizationSelector.tsx`) | `OrgPickerPanel` / `OrgRow` (Command) |
| Bottom sheet «Seleccionar organización» en móvil | `OrgSwitcher` móvil → `Sheet` inferior, pestaña Organización |
| «Crear Organización» → `CreateOrganizationDialog` (wizard 4 pasos) | Acción «Crear organización» del `OrgPickerPanel`, mismo diálogo |
| Estado sin organizaciones → solo «Crear Organización» | `OrgPicker` state=empty |
| Skeleton del selector | `OrgPicker` / `BranchPicker` state=loading (`Skeleton`) |
| Cambio de org: limpieza + cookies + `last_org_id` + recarga | Comportamiento, se conserva; `ConfirmDialog` opcional (nuevo) |
| Selector de sucursal en header con icono/color determinísticos, nombre (escritorio) / iniciales (móvil) | `BranchPicker` trigger `md` / `sm` (nombre truncado, nunca iniciales) |
| «Todas las sucursales» solo si `canSelectAll` | Primera fila de `BranchPickerPanel`, condicionada al flag calculado en servidor |
| Búsqueda de sucursal por nombre/dirección; dirección como subtítulo | `CommandInput` + `BranchRow` (subtítulo `address`/`city`, chip «Principal» si `is_main`) |
| Persistencia `currentBranchId` / `branchFilterAll`, evento `branch-changed` | Comportamiento, se conserva |
| Selector de sucursal oculto si no hay sucursales | `OrgSwitcher.showBranch=false` |
| Crear sucursal (solo en `/app/organizacion/sucursales`, modal inline con límite de plan y código automático) | Acción «Crear sucursal n/max» de `BranchPickerPanel` → `BranchFormDialog` (extraído; `BranchesTab` lo reutiliza) |
| Gestión completa de sucursales (editar, gerente, miembros, mapa, publicar web, eliminar) | Sin cambio: `/app/organizacion/sucursales`; enlace «Gestionar sucursales» en el panel |
| Sidebar colapsado por defecto, botón contraer/expandir | `Sidebar mode=rail/expanded` + botón en `SidebarBrand`; preferencia persistida (nuevo) |
| Drawer móvil 288 px / 85 vw con overlay y × | `Sidebar mode=drawer` |
| 5 secciones con títulos (`nav.section*`) y «•» en colapsado | `NavSection` (separador en rail) |
| Ítem con icono en chip azul, activo por prefijo, tooltip en rail, prefetch | `NavItem` |
| Flyout `DropdownMenu` de páginas en escritorio | **Se elimina**; lo cubre `SubMenuPanel floating` (hover en rail) y `docked` (expandido) |
| Acordeón de páginas en móvil (`max-h 40vh`) | `NavItemAccordion` (`Collapsible`, un módulo abierto) |
| `SubMenuPanel`: cabecera azul, lista, indicador activo, «N opciones», cerrar, cierre automático al cambiar de módulo, pestaña para reabrir | `SubMenuPanel docked` + `pinned` + `SubMenuReopenTab`; el pie «N opciones» se sustituye por grupos dentro del módulo |
| Módulo con 1 sola página → enlace directo | Regla del `useVisibleNavigation()` |
| Filtro por módulos activos, páginas activas y cargo | `useVisibleNavigation()` sobre `NAV_REGISTRY` |
| Submenú de Notificaciones según nombre de rol | Flag `canManageNotifications` calculado en servidor, mismo resultado visual |
| Pie del sidebar: `AccountSwitcher`, «Mi Suscripción», «Cerrar sesión» | Ya cubierto por `PARIDAD-BLOQUE-SESION.md` |
| Header: hamburguesa (móvil) | `MobileHeader` (oculto en `variant='home'`) |
| Header: buscador central + `kbd Ctrl+K`; en móvil segunda fila | `SearchTrigger bar` (escritorio) / icono en `MobileHeader` → `MobileSearchSheet` |
| Ctrl+K / ⌘K, `CommandDialog`, páginas iniciales y predefinidas, 11 grupos de datos, abort/watchdog, navegación al seleccionar | `CommandPalette` (todo conservado; páginas ahora desde `NAV_REGISTRY` y filtradas; `/app/proveedores` corregido a `/app/inventario/proveedores`) |
| Botón GO Assistant en header con estado abierto | `AssistantButton` |
| Botón flotante lateral del asistente (escritorio) | `AssistantEdgeTab` |
| Panel asistente docked / Sheet móvil, TTS, historial, limpiar, adjuntos, dictado, confirmar/rechazar/deshacer | Sin cambio funcional |
| Botón de tema en header | `ThemeToggle` en header escritorio; en móvil solo dentro del bloque de sesión |
| Campana con badge numérico sin tope | `NotificationsBell` con «99+» |
| Panel: pestañas Notificaciones/Tareas, Mías/Todas, marcar todas, ítems por canal, detalle en sheet, «Ver todas», recordatorios de tareas | `NotificationsPopover` (escritorio) / `MobileNotificationsSheet`; `Tabs` de shadcn |
| Perfil del header: trigger avatar+nombre+rol | **Sale del header**; `UserBlock` del sidebar |
| Perfil: cabecera con correo, plan, «Correo sin confirmar» + «Reenviar» | `SessionPopover` cabecera (+ aviso de correo, **añadir al diseño del bloque**) |
| Perfil: Facturación → `/app/plan` | `SessionPopover` «Mi suscripción» (ya diseñado) |
| Perfil: Ver perfil → `/app/perfil` | `SessionPopover` cabecera «Ver mi perfil» (ya diseñado) |
| Perfil: Configuración → `/app/configuracion` (y `/app/organizacion/informacion` en móvil) | `SessionPopover` MenuItem «Configuración» → `/app/configuracion` (**añadir**; unificar destino) |
| Perfil: Notificaciones → `/app/notificaciones` | `SessionPopover` MenuItem «Notificaciones» (**añadir**) o se da por cubierto por la campana (decidir, §5) |
| Perfil: Cerrar sesión con estado «Cerrando sesión…» | `SessionPopover` (ya diseñado) |
| Modal móvil «Mi Cuenta» del perfil del header | `SessionSheet` (ya diseñado) |
| `TrialBanner` (5 estados, días, descarte) y `EmailVerificationBanner` (reenviar, temporizador, descarte) | `BannerStack` bajo el header (escritorio y móvil) |
| `OfflineIndicator` (franja ámbar) y `NavigationProgress` (barra 1 px) | `BannerStack` (offline) y línea de progreso en el borde superior del header |
| `ModuleLimitNotification` (toast abajo-derecha, solo admin) | Sin cambio; en móvil abajo-centro sobre `MobileTabBar` si existe |
| `LocalDataNotice`, Softphone dock, `IncomingCallToast` | Sin cambio |
| Portada: saludo, fecha, `BranchBadge`, `PeriodoSelector`, «Marcar turno», «Actualizar», onboarding, KPIs, alertas, actividad, tendencia, `DashboardModulos` | Sin cambio en escritorio |
| Portada: `DashboardAtajos` (solo admin) y atajos de `EmployeeDashboard` | `MobileHomeNav` en móvil para todos los roles; en escritorio se conservan como hoy (misma fuente `NAV_REGISTRY.homeTile`) |
| Textos `nav.*` de `messages/es.json` | Se conservan; se añaden claves para org/sucursal/campana/buscador (hoy sin i18n) |

Añadidos del diseño (no existen hoy): chip de plan y punto de estado en `OrgRow`;
«Crear sucursal» y «Gestionar sucursales» en el switcher; chip «Principal» en
`BranchRow`; preferencia rail/expandido persistida; `SubMenuPanel` fijable y
flotante en hover; grupos dentro de módulos grandes; «Recientes» y «Acciones»
en el `CommandPalette`; badge «99+»; `MobileHomeNav`; buscador «Ir a página…»
en el drawer; `ConfirmDialog` al cambiar de org con cambios sin guardar.

---

## 5. Preguntas abiertas para el dueño (máx. 5)

1. **Cambio de organización sin recarga**: hoy `cambiarOrganizacionActiva` recarga la página entera. ¿Aceptamos mantener la recarga en esta fase (más seguro, cero riesgo de estado cruzado) y dejar la transición sin recarga como fase posterior?
2. **Móvil: ¿barra inferior (`MobileTabBar`: Inicio · Buscar · Asistente · Notificaciones · Menú) o solo header compacto?** La barra libera el header a «☰ + Org › Sucursal», pero tapa 56 px en todas las pantallas, incluido el POS.
3. **«Notificaciones» y «Configuración» en el bloque de sesión**: al quitar el perfil del header desaparecen esos dos accesos. ¿Los añadimos al `SessionPopover` ya diseñado, o damos por cubiertas Notificaciones con la campana y Configuración con el submenú de Organización/Sistema?
4. **Rail colapsado por defecto y sin persistencia** (`AppLayout.tsx:521`): ¿queremos que el diseño parta de **expandido** por defecto en pantallas ≥1280 px y recuerde la elección del usuario?
5. **`SubMenuPanel` con grupos internos** (p. ej. Finanzas: Documentos / Tesorería / Contabilidad / Configuración): ¿definimos los grupos ahora en el `NAV_REGISTRY` para que Figma los muestre, o se mantiene la lista plana de 29 ítems?
