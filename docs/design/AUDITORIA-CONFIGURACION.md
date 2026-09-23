# Auditoría control por control — el módulo de Configuración

Insumo para rediseñar en Figma («GO Admin — Sistema de diseño», `EAvjINVRnlzFM70GVoWXgl`,
página `10 Configuración`) el módulo completo de Configuración: el contenedor
`/app/configuracion`, el asistente `/app/configuracion/asistente` y los **16 paneles** de
`src/components/configuracion/panels/` (60 archivos). Mismo nivel de detalle que
`docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md`: cada control —botón, pestaña, campo,
toggle, chip, badge, tabla, diálogo, tooltip, estado— con su etiqueta exacta, lo que hace,
cuándo aparece y `archivo:línea`.

Fecha: 2026-09-22. Solo lectura de código. Esquema, políticas RLS y **datos reales**
verificados con el MCP de Supabase (`jgmgphmzusbluqhuqihj`, solo `SELECT`) el 2026-09-22.
Sin nombres de organizaciones cliente: se usa el id (`org 120`) o una descripción.
Rutas relativas a `src/` salvo que se indique.

Leyenda de **Tipo**: botón · menú (trigger o ítem) · pestaña · campo · toggle (switch/checkbox/
segmento) · chip (píldora clicable) · badge (solo lectura) · tabla · diálogo · tooltip · atajo ·
estado (vacío/cargando/error/aviso/sin permiso) · texto · stat (KPI) · paginación · toast ·
cálculo (regla sin control visible). **Etiqueta exacta** es el literal del código con su
acentuación **o su falta** —este módulo tiene mucho texto sin tildes («Configuracion CRM»,
«Razones de Perdida», «Comision»)—; casi nada pasa por `messages/es.json` salvo el panel de
Sitio Web (claves `org.branding.*`). **Cuándo aparece**: «Siempre» = incondicional dentro de su
panel.

**Convención de guardado** en las tablas de persistencia: **«instante»** = el control escribe en
la base en cuanto se acciona; **«botón»** = el control solo cambia estado local hasta pulsar
Guardar. La mezcla de ambos en la misma pantalla es uno de los hallazgos principales.

Índice: A. El contenedor y su navegación · B. Dónde vive cada ajuste (mapa de almacenamiento,
con datos reales) · C–R. Los 16 paneles, uno por sección · S. Conteo de controles por panel ·
T. Lo roto o sin efecto · U. Ajustes que existen en la base y no tienen interfaz, y al revés ·
V. Duplicidades · W. Propuesta de estructura (Parte 2 del encargo).

**Configuración › POS no se reaudita.** Está en `AUDITORIA-CONTROLES-PRODUCTOS-POS.md` §D.17
(13 tarjetas, 6 diálogos, 11 hallazgos) y diseñada en la Sección «Configuración › POS» de la
página `05 POS y ventas`. Aquí solo aparece en §H, con lo que hay que alinear.

---

## A. El contenedor: `/app/configuracion`

### A.1 La página y el layout

`app/app/configuracion/page.tsx` son 28 líneas: un `Suspense` con un esqueleto propio
(cabecera de 2 líneas + una barra + un bloque de 256 px, `:10-25`) que envuelve
`<ConfiguracionLayout/>` (`:27`). No hay `PageHeader` del kit, ni migas, ni comprobación de
sesión, ni de permiso.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | *(esqueleto sin texto: 1 línea de 24 px, 1 de 16, 1 barra de 40, 1 bloque de 256)* | Fallback de `Suspense` | Primer render | `app/app/configuracion/page.tsx:10-25` |
| 2 | estado | *(esqueleto con caja de icono 40×40 + 2 líneas + barra + bloque)* | Carga de módulos | `loading` de `useActiveConfigModules` | `configuracion/layout/ConfiguracionLayout.tsx:21-39` |
| 3 | estado | «No hay configuraciones disponibles» · «Activa módulos en la sección de Organización para ver sus configuraciones aquí.» (icono `Settings` gris) | Vacío | `availableModules.length === 0` | `layout/ConfiguracionEmpty.tsx:10-21`; disparo en `ConfiguracionLayout.tsx:41-47` |
| 4 | estado | «Módulo no encontrado» · «Selecciona un módulo de las pestañas superiores para ver su configuración.» | Vacío | `!effectiveModuleId` — **inalcanzable**: si hay módulos, `displayModules[0]?.id` siempre existe | `ConfiguracionLayout.tsx:85-88` |
| 5 | estado | «Este panel estará disponible en una próxima fase.» | Módulo sin panel en `PANEL_MAP` | `!PANEL_MAP[moduleId]` — **inalcanzable**: los 16 ids del registro están en el mapa | `layout/ConfiguracionPanelRenderer.tsx:132-140` |
| 6 | texto | `{module.title}` (20 px semibold) · `{module.description}` (14 px gris) + caja de icono 40×40 azul | Cabecera del panel activo | Siempre | `layout/ConfiguracionHeader.tsx:14-23` |
| 7 | pestaña | 16 pestañas: «General» · «Sitio Web» · «CRM» · «Recursos Humanos» · «PMS Hotel» · «POS» · «Chat» · «Integraciones» · «Parking» · «Calendario» · «Timeline» · «Roles» · «Facturación Electrónica» · «Gym» · «Notificaciones» · «Datos sin conexión» | `setModule(id)` → `router.replace(?modulo=id)` | Las que pasen el filtro (§A.2) | `ConfiguracionLayout.tsx:58-78`; títulos en `config/configModulesRegistry.ts:32-150` |
| 8 | badge | caja de 24×24 con el icono del módulo dentro de cada pestaña (azul; blanco sobre azul cuando está activa) | Decorativo | Por pestaña | `ConfiguracionLayout.tsx:69-71` |
| 9 | estado | *(esqueleto de panel: 1 botón 36×36 + 2 bloques de 192 px con su título)* | Carga diferida del panel (`next/dynamic`, `ssr:false`) | Al abrir cada pestaña la primera vez | `ConfiguracionPanelRenderer.tsx:88-104` |

**Comportamiento de la barra de pestañas.** Es un `Tabs` de shadcn dentro de un
`div.overflow-x-auto` (`ConfiguracionLayout.tsx:59`): con 16 pestañas a ~140 px cada una son
**~2.240 px**, así que en 1440 hay desplazamiento horizontal **sin ninguna afordancia** —no hay
flechas, ni degradado, ni contador—. En 390 px se ven dos pestañas y media.

**No hay estado «sin permiso» en el contenedor.** Ni aquí ni en ningún panel salvo «General»
(§C). Ver §A.2.

### A.2 Cómo se decide qué paneles se ven

Tres capas, y **ninguna de ellas mira permisos del usuario**:

1. **Middleware** (`middleware.ts:574-633`). `/app/configuracion` mapea al módulo `configuracion`
   (`lib/config/modulePages.ts:259`). Comprueba (a) que la organización lo tenga activo en
   `organization_modules` y (b) que el **cargo** del usuario lo tenga en
   `job_position_module_access`. Verificado en base: **las 84 organizaciones tienen
   `configuracion` activo**, y `job_position_module_access` tiene **41 filas** frente a **1.325
   cargos** en 63 organizaciones, así que la rama (b) hace *fail-open* (`:617-621`,
   `:626-627`) para prácticamente todo el mundo.
2. **Registro de paneles** (`config/configModulesRegistry.ts:32-150`). 16 entradas con
   `moduleCode`, y cuatro marcadas `isCore: true` —`general`, `sitioweb`, `roles`,
   `datos-offline`— que **se ven siempre**, contratadas o no.
3. **Filtro de cliente** (`hooks/useActiveConfigModules.ts:20-27`). Deja pasar: lo `isCore`, lo
   `desktopOnly` solo dentro de Go Admin Desktop (`isDesktop()`, `:22`) y lo que esté en
   `organizationStatus.active_modules`.

**Lo que esto implica, comprobado contra la base:**

- `useActiveModules` **sí calcula** los módulos accesibles por permiso del usuario
  (`permissionService.getUserAccessibleModules`, `hooks/useActiveModules.ts:54`) y los expone
  como `accessibleModules`. **`useActiveConfigModules` no los usa**: solo mira
  `organizationStatus.active_modules` (`:25`). Un cajero ve la pestaña de CRM, la de
  Facturación Electrónica y la de Roles.
- El `moduleCode` de «Sitio Web» es `website` y el de «General»/«Datos sin conexión» es
  `general`; **ninguno de los dos existe en la tabla `modules`** (20 códigos, ninguno es
  `website` ni `general`). Da igual porque ambos son `isCore`, pero significa que **el panel de
  Sitio Web se muestra a las 84 organizaciones**, tengan o no el módulo de sitios web.
- El fallback `availableModules.length > 0 ? availableModules : CONFIG_MODULES`
  (`ConfiguracionLayout.tsx:17-19`) es **código muerto**: la rama vacía ya devolvió
  `<ConfiguracionEmpty/>` en `:41-47`. No es un *fail-open* vivo, pero invita a uno.

### A.3 Navegación: `?modulo=`, y el menú lateral que nadie monta

`hooks/useConfiguracionState.ts` lee `?modulo=` (`:19-23`), valida contra el registro, y si
falta cae en el **primer módulo `isCore`**, que es «General» (`:21-22`). `setModule` usa
`router.replace(..., { scroll:false })` (`:31`), así que **el cambio de pestaña no deja
historial**: el botón «atrás» del navegador sale de Configuración.

**Tres componentes construidos y nunca montados** (código muerto verificado por grep: solo se
exportan en `index.ts`):

| Componente | Qué es | Archivo |
|---|---|---|
| `ConfiguracionSidebar` | Menú lateral con encabezado «Módulos» y `ScrollArea` | `layout/ConfiguracionSidebar.tsx:13-35` |
| `ConfiguracionSidebarItem` | Ítem del menú: icono + título + descripción cuando está activo | `layout/ConfiguracionSidebarItem.tsx:12-33` |
| `ConfiguracionSearch` | Buscador «Buscar configuración...» que filtra por título y descripción | `layout/ConfiguracionSearch.tsx:13-41` |

`ConfiguracionSearch` además tiene un defecto de cierre: `handleChange` llama a `onResults(filtered)`
con el `filtered` **del render anterior** (`:26-29`), así que siempre devuelve los resultados de
la pulsación previa. No se nota porque nadie lo monta.

**No existe búsqueda de ajustes.** El buscador muerto solo filtraría 16 títulos de módulo; no
hay índice de los ~400 ajustes individuales.

### A.4 El asistente: `/app/configuracion/asistente`

158 líneas. **Es el único trozo de todo el módulo construido como debe hacerse.**

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | botón | «Volver a configuración» | Enlace a `/app/configuracion` | Siempre | `app/app/configuracion/asistente/page.tsx:33` |
| 2 | texto | «Configuración de GO Assistant» · «Los cambios se aplican únicamente a tu organización activa, no a las demás organizaciones.» | Cabecera | Siempre | `:34-35` |
| 3 | estado | «Selecciona una organización para consultar su configuración.» (`role="status"`) | Vacío | `!organization?.id` | `:38` |
| 4 | estado | «Cargando configuración…» (`role="status"`) | Cargando | `loading` | `:102` |
| 5 | estado | `{error}` (`role="alert"`) + botón «Reintentar» | Error con acción | Fallo del `GET` | `:104` |
| 6 | texto | «Qué puede hacer el asistente» + párrafo de 300 caracteres | Explicación | Cargado | `:110-111` |
| 7 | estado | «Solo un administrador de esta organización puede cambiar esta configuración.» (`role="status"`) | Sin permiso | `!settings.can_manage` | `:114` |
| 8 | campo | «Nivel de capacidad» → «Solo orientación (off)» · «Consultar datos (read)» · «Crear registros de catálogo (write_low)» · «Operación completa (predeterminado) (write_full)» | Elige nivel (estado local) | Cargado; `disabled` sin permiso | `:119-123`, opciones `:22-27` |
| 9 | texto | Descripción larga del nivel elegido | Ayuda contextual | Cargado | `:129` |
| 10 | botón | «Guardar nivel» / «Guardando…» | Abre el diálogo de confirmación | `can_manage` y valor distinto del guardado | `:135-137` |
| 11 | diálogo | «¿Cambiar el nivel de esta organización?» + resumen del cambio · «Cancelar» · «Confirmar cambio» | Confirma y hace `PATCH` | Al pulsar #10 | `:141-146` |
| 12 | estado | «Configuración guardada para esta organización. Se aplicará en los próximos mensajes del asistente.» (`aria-live="polite"`) | Éxito | Tras el `PATCH` | `:94`, `:154` |

**Destino:** `ai_assistant_settings.capability_level` (+ `updated_at`), `upsert` con
`onConflict: organization_id`, desde `app/api/ai-assistant/settings/route.ts:75-79`.
**Guarda:** con botón **y** confirmación. **Valida:** Zod `strict()` en cliente
(`page.tsx:17-19`) **y** en servidor (`route.ts:12-14`, `:69-72`). **Permiso:** `isOrgAdminLike(ctx)`
en servidor, 403 (`route.ts:66-68`), y el `42501` de RLS se mapea a 403 (`:80-82`).
**Límite de tasa:** 10/min en `PATCH`, 60/min en `GET` (`route.ts:31-38`). **Al fallar:**
`role="alert"` y el valor tecleado se conserva; `AbortController` evita actualizar tras
desmontar (`page.tsx:51`, `:57`, `:73`, `:81`).

Único defecto: usa un `<select>` nativo (`:121-123`) en vez del `Select` del kit.

**Y no está enlazado desde ningún sitio.** Grep de `configuracion/asistente` en `src/`: solo
aparece en su propio archivo. No hay pestaña, ni tarjeta, ni entrada de menú.

---

## B. Dónde vive cada ajuste — mapa de almacenamiento con datos reales

No hay **una** tabla de ajustes: hay **nueve**, más columnas sueltas en `organizations`.

### B.1 `organization_settings` — clave/valor por organización

`organization_settings(id uuid, organization_id int, key text, settings jsonb, created_at,
updated_at)`. Es el patrón dominante del ERP… sobre el papel.

**Claves que el código escribe (17), contrastadas con las filas que existen de verdad
(2026-09-22):**

| Clave | Quién la escribe | Filas en la base | Organizaciones |
|---|---|---|---|
| `pos_categories_display` | `components/pos/configuracion/configuracionService.ts:101` | 9 | 9 |
| `pos_blind_cash_count` | `configuracionService.ts:117` | 3 | 3 |
| `pos_customer_display` | `lib/pos/display/settings.ts:272` | 3 | 3 |
| `pos_cash_session_mode` | `configuracionService.ts:135` | 2 | 2 |
| `pos_require_cash_session` | `configuracionService.ts:107` | 1 | 1 |
| `calendar` | `components/calendario/configuracion/useCalendarSettings.ts:122-152` | 1 | 1 |
| `timeline` | `lib/services/timelineSettingsService.ts:98-133` | **0** | 0 |
| `integrations` | `lib/services/integrationsService.ts:3065-3093` | **0** | 0 |
| `parking_config` | `lib/services/parkingConfigService.ts:151-179` | **0** | 0 |
| `pms_settings` | `lib/services/pmsSettingsService.ts:86-95` | **0** | 0 |
| `gym_settings` | `lib/services/gymSettingsService.ts:128-156` (tabla `settings`, no esta) | **0** | 0 |
| `roles_configuration` | `components/admin/RolesConfigurationSettings.tsx:101-128` | **0** | 0 |
| `operating_hours` | `lib/services/organizationOperatingHoursService.ts:95-98` y directo desde `pos/configuracion/ConfiguracionPage.tsx:287` | **0** | 0 |
| `web_commerce` | `lib/services/webCommerceSettingsService.ts:39` | **0** | 0 |
| `crm_lead_assignment` | `lib/services/crm/leadAssignmentConfig.ts:74-77` | **0** | 0 |
| `crm_revenue_math` | `lib/services/crm/revenueOs/revenueInputs.ts:72-86` | **0** | 0 |
| `instructor_availability_{user_id}` | `components/gym/instructores/InstructorAvailabilityDialog.tsx:115-149` | **0** | 0 |

**19 filas en total, repartidas en 6 claves.** Once de las diecisiete claves que el código sabe
escribir **no tienen ni una sola fila** en toda la base. No es que nadie las lea (que tampoco,
§U): es que nadie las ha guardado nunca.

### B.2 Las otras ocho tablas y las columnas sueltas

| Tabla | Filas | Qué guarda | Qué panel la escribe |
|---|---|---|---|
| `organizations` (columnas) | 84 | `name`, `legal_name`, `nit`, `tax_id`, `city`, `country`, `country_code`, **`timezone`** (NOT NULL, default `America/Bogota`) | General (§C), Calendario (§L) |
| `organization_preferences` | 84 | jsonb con 6 grupos (`finance`, `system`, `ui`, `business`, `integrations`, `security`) + `default_currency_code`, `auto_sync_exchange_rates`, `facebook_feed_token`, `electronic_invoicing.always_enabled` | **Ninguno** para los 6 grupos (§U); Facturación escribe `electronic_invoicing.always_enabled` |
| `website_settings` | 84 | **127 columnas**: tema, SEO, checkout, header, footer, countdown, envíos, impuestos del sitio | Sitio Web (§D) |
| `ai_assistant_settings` | 84 | `capability_level`, herramientas, voz, límites | Asistente (§A.4) |
| `comm_settings` | 84 | Twilio, grabación, consentimiento, caller id, créditos de SMS/WhatsApp/voz | CRM › Telefonía (§E.3) |
| `settings` | **0** | Gemela de `organization_settings` (`id int`, `key`, `settings`) | Gym (§P) |
| `provider_configs` | 384 (12 categorías × 32 organizaciones) | `is_active`, `settings` jsonb, `credentials` jsonb | CRM › Proveedores e IA (§E.2), WhatsApp (§E.4), Email (§E.5) |
| `ai_settings` | 39 | Modelo, tono, créditos de IA | Ninguno de Configuración (se edita en Chat) |
| `scoring_configs` | 53 | `config` jsonb del scoring GOC | CRM › Scoring (§E.11) |
| `user_notification_preferences` | 54 | `mute`, `allowed_types[]`, `dnd_start`, `dnd_end` — **por usuario, sin `organization_id`** | Notificaciones (§Q) |
| `electronic_invoicing_config` | **0** | `client_id`, `client_secret`, `username`, `password` **en texto plano** | Facturación (§O) |
| `invoice_sequences` | 10 (2 organizaciones) | Rangos DIAN, resolución, clave técnica, consecutivo | Facturación (§O) |

**`provider_configs.credentials` está vacío en las 384 filas.** Ninguna organización tiene
claves propias: todas usan las de la plataforma.

### B.3 RLS — lo que la base permite de verdad

| Tabla | Política | Quién puede escribir |
|---|---|---|
| `organization_settings` | `organization_settings_org_access` (ALL, `public`) | **Cualquier miembro activo** de la organización |
| `settings` | `settings_org_isolation` (ALL, `public`) | Cualquier miembro activo |
| `scoring_configs` | `org_member_all` (ALL, `authenticated`) | Cualquier miembro activo |
| `provider_configs` | `provider_configs_select` — **solo SELECT** | Nadie desde el cliente: las escrituras van por route handler |
| `comm_settings` | `comm_settings_update` con `is_super_admin OR role_id IN (1,2)` | **Solo administradores** |
| `organization_preferences` | `organization_preferences_all_for_admins` (`role_id = 2`) | Solo administradores |
| `electronic_invoicing_config` | `Users can manage their org e-invoicing config` (ALL, `public`) | **Cualquier miembro, incluidos los desactivados**: la política no filtra `om.is_active` |
| `user_notification_preferences` | `user_id = auth.uid()` | Solo el propio usuario |

La fila de `electronic_invoicing_config` es la peor del sistema y se detalla en §O.

---

## C. Panel «General» — `panels/general/GeneralConfigPanel.tsx` (142 líneas)

Icono del registro: `Settings`. Es un **contenedor de 5 pestañas**; no escribe ni un ajuste
propio.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | *(5 píldoras de 40×112 + `OrganizationInfoSkeleton`)* | Cargando | `loading` de `useOrgAdmin` | `:44-52` |
| 2 | estado | `{error}` — «No hay sesión activa» / «Error al cargar la organización» / «No perteneces a ninguna organización» / «Error inesperado» | Error **sin acción**: `useOrgAdmin` expone `refresh()` y no se usa | `error !== null` | `:57-63`; textos en `hooks/useOrgAdmin.ts:39,64,69,112` |
| 3 | estado | «No tienes permisos de administrador para ver esta configuración.» | **Sin permiso — el único de los 16 paneles** | `isOrgAdmin === false` | `:65-73` |
| 4 | estado | «No se pudo determinar la organización activa.» | Vacío | `orgId === null` | `:75-83` |
| 5 | pestaña | «Información» (`Building2`) | Monta `OrganizationInfoTab` | Siempre | `:33`, `:110-114` |
| 6 | pestaña | «Miembros» (`Users`) | Monta `MembersTab` | Siempre | `:34`, `:116-120` |
| 7 | pestaña | «Invitaciones» (`Mail`) | Monta `InvitationsTab` | Siempre | `:35`, `:122-126` |
| 8 | pestaña | «Sucursales» (`MapPin`) | Monta `BranchesTab` | Siempre | `:36`, `:128-132` |
| 9 | pestaña | «Mis Organizaciones» (`Layers`) | Monta `ManageOrganizationsTab` | Siempre | `:37`, `:134-138` |
| 10 | estado | 5 esqueletos por pestaña, **duplicados**: uno en `dynamic({loading})` y otro en `<Suspense fallback>` | Carga del chunk | Primera visita a cada pestaña | `:16-30` y `:111,117,123,129,135` |

**Permiso:** `isOrgAdmin` es `userRole === 2 || userRole === 1` (`hooks/useOrgAdmin.ts:121`) —
**por id numérico de rol**, no por permiso (`get_user_permission_codes` existe y no se usa), y
es una guarda **solo de interfaz**.

**Lo que NO edita, y la gente espera aquí:** `OrganizationInfoTab` tiene `country`
(`:19,116,245,566-575`) pero **no tiene zona horaria ni moneda**. La zona horaria canónica se
edita en el panel de **Calendario** (§L) y la moneda en **Finanzas › Monedas**.

**Prop mal nombrada:** `<OrganizationInfoTab orgData={orgId}/>` recibe un `number`, no datos
(`:112`).

---

## D. Panel «Sitio Web» — `panels/sitioweb/WebsiteConfigPanel.tsx` (380 líneas)

Icono del registro: `Globe`. Es el único panel con i18n (`org.branding.*`).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | *(7 píldoras + 4 tarjetas)* | Cargando | `isLoading` | `:227-242` |
| 2 | estado | `t('errorLoadingConfigEmpty')` + botón `t('retry')` | Error con acción | `!settings` tras cargar | `:244-253` |
| 3 | botón | `t('refresh')` (`RefreshCw` girando) | Recarga los ajustes | Siempre; `disabled={isRefreshing}` | `:259-268` |
| 4 | badge | `t('published')` (verde, `Globe`) / `t('draft')` (gris) | Estado del sitio, **solo lectura** | Según `is_published` | `:269-279` |
| 5 | pestaña | «Tema» | `BrandingThemeTab` | Siempre | `:45`, `:305-316` |
| 6 | pestaña | «Páginas» | `BrandingPagesTab` **solo si hay `organizationId`**; si no, la pestaña queda vacía sin mensaje | Siempre | `:46`, `:318-324` |
| 7 | pestaña | «Checkout» | `BrandingCheckoutTab` — **no recibe props**: carga y guarda por su cuenta e ignora `settings`/`onSave` | Siempre | `:47`, `:326-330` |
| 8 | pestaña | «SEO» | `BrandingSEOTab` | Siempre | `:48`, `:332-341` |
| 9 | pestaña | «Contenido» | `BrandingContentTab` | Siempre | `:49`, `:343-352` |
| 10 | pestaña | «Avanzado» | `BrandingAdvancedTab` | Siempre | `:50`, `:354-362` |
| 11 | pestaña | «Publicar» | `BrandingPublishTab` | Siempre | `:51`, `:364-376` |
| 12 | estado | Esqueleto de 384 px por pestaña (`Suspense`) | Carga diferida | Al abrir cada pestaña | `:22-42` |
| 13 | botón | `t('publishSite')` | Publica el sitio | **`disabled` hasta pasar los 5 checks** | `branding/BrandingPublishTab.tsx:167-178` |
| 14 | botón | `t('unpublish')` (destructivo) | Despublica, **sin confirmación** | Si está publicado | `BrandingPublishTab.tsx:153-164` |
| 15 | botón | `t('viewSite')` (`ExternalLink`) | Abre `https://{subdomain}.goadmin.io` — **dominio cableado** | Publicado con subdominio | `BrandingPublishTab.tsx:39,141-152` |
| 16 | botón | *(icono `Copy`/`Check`)* | Copia la URL | Con subdominio | `BrandingPublishTab.tsx:109-111` |
| 17 | estado | Checklist: `t('checkTemplate')` · `t('checkMetaTitle')` · `t('checkMetaDesc')` · `t('checkPrimaryColor')` · `t('checkSections')` | Valida completitud **solo en cliente** | Siempre | `BrandingPublishTab.tsx:59-65` |
| 18 | chip | 28 tarjetas de plantilla | Selecciona plantilla (estado local) | Siempre | `BrandingPublishTab.tsx:238-253` |
| 19 | botón | `t('resetTo', {name})` | **Sobrescribe colores y fuentes sin confirmación ni deshacer** | Siempre | `BrandingPublishTab.tsx:262-274` |
| 20 | texto | `t('publishedAt') {published_at}` y `{updated_at}` | Fechas | Según haya valor | `BrandingPublishTab.tsx:123-133`, `:298-300` |
| 21 | campo | `t('measurementId')` (placeholder `G-XXXXXXXXXX`) | `analytics_id` | Pestaña Avanzado | `branding/BrandingAdvancedTab.tsx:56-62` |
| 22 | campo | `t('customCssTitle')` (textarea) | `custom_css` | Avanzado | `BrandingAdvancedTab.tsx:91-104` |
| 23 | campo | `t('customScriptsTitle')` (textarea) | `custom_scripts` — **HTML/JS arbitrario en el sitio público, sin sanear** | Avanzado | `BrandingAdvancedTab.tsx:142-157` |
| 24 | botón | `tc('saveChanges')` / `tc('saving')` | Guarda el grupo de la pestaña | Avanzado | `BrandingAdvancedTab.tsx:206-218` |
| 25 | diálogo | **`confirm()` nativo**: «¿Eliminar este menú y todos sus items?» | Borra menú + ítems | Páginas → `MenuGroupManager` | `branding/editor/MenuGroupManager.tsx:92`, montado en `BrandingPagesTab.tsx:595` |

### D.1 Destino, guardado, validación, fallo

Todo va a **`website_settings`** (una fila por `organization_id` + `branch_id`), nunca a
`organization_settings`.

| Grupo | Columnas | Guarda | Valida | Al fallar |
|---|---|---|---|---|
| Tema | `template_id`, `theme_mode`, 5 colores, 2 fuentes, `logo_height`, `show_currency_code`, `currency_position` | Botón | **Ninguna** (ni formato de color ni fuente) | Mensaje literal «No se pudo actualizar el tema. Verifica permisos (rol owner o admin).» (`lib/services/websiteSettingsService.ts:577-579`) |
| SEO | `meta_title`, `meta_description`, `meta_keywords[]`, `og_image_url`, `favicon_url`, `canonical_url`, `google_site_verification`, `bing_site_verification` | Botón | Sin límite de longitud | Toast `errorSaving` |
| Contenido | `social_links`, `business_hours`, `gallery_images`, `testimonials`, `faq_items`, `footer_text`, `footer_links`, `show_powered_by` | Botón | Sin validación de URL | Toast |
| Avanzado | `custom_css`, `custom_scripts`, `analytics_id` | Botón | **Ninguna** | Toast |
| Publicar | `is_published`, `published_at` | Botón | Checklist de cliente | Toast |
| Reset de plantilla | `template_id` + 5 colores + 2 fuentes + `updated_at` | Botón | — | Toast |
| Imágenes | Bucket `organization-assets`, ruta `{orgId}/{type}_{Date.now()}.{ext}`, `upsert:true` | Al elegir archivo | **Sin límite de tamaño ni de tipo MIME** | `handleUploadImage` **no tiene `try/catch`** (`:156-159`) |

### D.2 Dos defectos graves propios de este panel

1. **El despacho de `handleSave` va por presencia de clave** (`:127-137`). Un guardado de SEO
   que solo mande `canonical_url` cae en el `else` y se envía por `updateTheme`. Funciona por
   accidente porque todos escriben la misma tabla.
2. **Guardar escribe en TODAS las sucursales.** El panel nunca pasa `branchId`
   (`:85,128-136,166,211`), y con `branchId === undefined` `applyBranchFilterStrict` **no filtra
   nada** (`lib/services/branchFilterHelper.ts:92-93`). Consecuencia en una organización con
   varias sucursales: el `UPDATE ... WHERE organization_id = X` toca la fila global **y la de
   todos los outlets**, y el `.select().maybeSingle()` posterior falla por devolver más de una
   fila → **el usuario ve un toast de error después de haber escrito en todas las filas**
   (`websiteSettingsService.ts:564-581`, `:769-793`, `:921-951`).

---

## E. Panel «CRM» — 19 archivos, 4.616 líneas

Es, con diferencia, el panel más grande: **un módulo entero dentro de Configuración**.
`layout/ConfiguracionPanelRenderer.tsx:67` monta `CrmConfigTabs`, que abre **6 pestañas**, y la
primera de ellas («General») contiene **8 tarjetas que abren 8 modales**, cada uno con su propio
gestor completo. Son **14 pantallas anidadas a tres niveles**.

### E.1 El shell — `panels/crm/CrmConfigTabs.tsx` (88 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | texto | `aria-label="Secciones de configuración del CRM"` | Contenedor de pestañas | Siempre | `:60` |
| 2-7 | pestaña | «General» (`Settings2`) · «Telefonía» (`Phone`) · «Proveedores e IA» (`Sparkles`) · «Email» (`Mail`) · «WhatsApp» (`MessageCircle`) · «Créditos y sistema» (`Coins`) | `router.replace(?tab=…)` | Siempre | `:30-35`, `:62-83` |

**Persistencia:** ninguna; la pestaña vive en la URL (`:49-56`). **Radix desmonta la pestaña
inactiva**, así que cambiar de pestaña con cambios sin guardar **los pierde sin avisar** (§T).

### E.2 Pestaña «General» — `panels/crm/CRMConfigPanel.tsx` (838 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `CardListSkeleton cards={6} columns="3"` | Cargando | **`channelsLoading && tagsLoading && keysLoading`** — con `&&`: si una carga termina antes, no hay esqueleto y se pintan estados vacíos falsos | `:381-390` |
| 2 | texto | «Canales» | Título de sección | Siempre | `:398` |
| 3 | botón | `<AvailableChannels/>` — tarjetas «conectar» por tipo | Abre `CreateChannelDialog` | Siempre | `:401-404` |
| 4 | texto | «Mis Canales» · «Canales configurados en tu organización» | Título | `channels.length > 0` | `:409-414` |
| 5 | toggle | Switch por canal | `toggleChannelStatus` — **instante** | Por canal | `:419`, handler `:196-220` |
| 6 | campo | Select de modo IA: «Desactivado» / «Híbrido» / «Automático» | `ai_mode` — **instante** | Por canal | `:420`, handler `:222-239` |
| 7 | botón | «Configurar» por canal | Website → drawer; el resto → toast «La configuración de este tipo de canal se gestiona desde Chat» | Por canal | `:241-251` |
| 8 | botón | «Instalar widget» | Abre `WidgetCodeDialog` | Por canal | `:253-256` |
| 9 | botón | «Conectar» | **No hace nada**: `void channel` + toast «La conexión de canales externos se gestiona desde Chat» | Por canal | `:258-264` |
| 10 | texto | «Etiquetas» | Título | Siempre | `:433` |
| 11 | estado | «No hay etiquetas configuradas» · «Crea etiquetas para organizar y clasificar tus conversaciones» (🏷️) | Vacío — **también durante la carga** | `tags.length === 0` | `:437-444` |
| 12 | diálogo | `TagDialog` (nombre, 10 colores, descripción en editor HTML, vista previa) | Alta/edición | `tagDialogOpen` | `:786` |
| 13 | diálogo | «¿Eliminar etiqueta?» · «Esta acción eliminará la etiqueta "X" y la removerá de todas las conversaciones. Esta acción no se puede deshacer.» · «Cancelar» · «Eliminar» | Confirma borrado | `deleteTagDialogOpen` | `:790-803` |
| 14 | texto | «Llaves API» | Título | Siempre | `:458` |
| 15 | badge | `{activas} de {total} llave(s) activa(s)` | Contador | Siempre | `:460-466`, cálculo `:315` |
| 16 | estado | «No hay llaves de API configuradas» · «Crea llaves de API para integrar el CRM con servicios externos» (🔑) | Vacío | `apiKeys.length === 0` | `:468-475` |
| 17 | diálogo | `ApiKeyDialog` (nombre, canal, 7 scopes, expiración) | Alta | `keyDialogOpen` | `:787` |
| 18 | diálogo | «¿Revocar llave de API?» · «Cancelar» · «Revocar» | Confirma | `revokeDialogOpen` | `:806-819` |
| 19 | diálogo | «¿Rotar llave de API?» · «Cancelar» · «Rotar Llave» | Confirma | `rotateDialogOpen` | `:822-835` |
| 20 | texto | «Widget Web» · «Widget activo» / «Sin widget configurado» · «Canal: {name}» / «Crea un canal de tipo Sitio Web para configurar el widget» | Estado | Siempre | `:489-501` |
| 21 | botón | «Configurar Widget» | Abre el drawer; si no hay canal, toast «Crea y activa un canal de tipo Sitio Web primero» | Siempre | `:503-509`, `:374-378` |
| 22 | texto | «Configuracion CRM» *(sin tilde)* | Título de la rejilla de 8 tarjetas | Siempre | `:517` |
| 23-30 | botón | 8 tarjetas «Configurar →»: «Verticales» · «Razones de Perdida» · «Scoring (GOC)» · «Etapas y Criterios» · «Vendedores y Comisiones» · «Programa de Referidos» · «Estructura Comercial» · «ICP (Ideal Customer Profile)» | Abren 8 `Dialog` | Siempre | `:521-662`, modales `:667-761` |

**Destino y persistencia (pestaña General):**

| Ajuste | Tabla · columna | Guarda | Valida | Al fallar |
|---|---|---|---|---|
| Canal: estado, modo IA, alta | Tabla de canales de chat, vía `chatChannelsService` (**Supabase de navegador**) | Instante / diálogo | No | `console.error` + toast |
| Etiqueta | `conversation_tags(organization_id, name, color, description)` (**Supabase de navegador**) | Botón del diálogo | Solo `name` no vacío | Toast + `throw` |
| Llave API | `channel_api_keys(name, channel_id, key_hash, key_prefix, scopes[], expires_at, is_active, revoked_at)` (**Supabase de navegador**) | Botón | `name` + ≥1 scope | `console.error` + toast |

**Sin ninguna comprobación de permiso en 838 líneas.** Cualquier miembro puede revocar las
llaves de producción.

### E.3 Pestaña «Telefonía» — `crm/TelefoniaTab.tsx` + 3 secciones (623 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Cargando telefonía…» (`role="status"`) | Cargando | `loading && !settings` | `TelefoniaTab.tsx:23-29` |
| 2 | estado | `{error}` (`role="alert"`) + «Reintentar» | Error con acción | `error || !settings` | `:30-39` |
| 3 | estado | «El softphone del navegador está deshabilitado: faltan {X} en las credenciales de telefonía de tu organización.» + enlace «Proveedores e IA › Telefonía» | Aviso con claves propias | `missing.length>0 && source==='org'` | `:57-67` |
| 4 | estado | «El softphone del navegador aún no está habilitado para tu organización.» · «La telefonía la habilita el soporte de la plataforma; no necesitas configurar nada…» | Aviso con claves de plataforma | `missing.length>0 && source!=='org'` | `:69-78` |
| 5 | texto | «Números» · «Cuenta Twilio (clave propia\|plataforma)» / «Sin cuenta Twilio configurada (pestaña Proveedores e IA)» + « · Cuentas trial solo marcan a Verified Caller IDs.» | Estado | Siempre | `telefonia/PhoneNumbersSection.tsx:67-73` |
| 6 | botón | «Importar de Twilio» | `POST /api/crm/phone-numbers/import` | `disabled` sin cuenta o sin permiso | `PhoneNumbersSection.tsx:75-78` |
| 7 | estado | «Aún no hay números en esta organización.» · «Compra un número en Twilio (Colombia exige bundle regulatorio) y pulsa "Importar de Twilio"; se cablearán los webhooks de voz automáticamente.» | Vacío con instrucción | `numbers.length === 0` | `:81-86` |
| 8 | tabla | «Número» · «Etiqueta» · «Asignado a» · «Capacidades» · «Primario» · «Activo» | Lista de números | Con números | `:92-97` |
| 9 | campo | Select «Asignar {e164}» → «Ring group (todos)» + miembros | `assigned_user_id` — **instante** | Por fila | `:109-122` |
| 10 | toggle | Radio «Marcar {e164} como primario» | `is_primary` — **instante** | Por fila | `:132-139` |
| 11 | toggle | Switch «Activar {e164}» | `is_active` — **instante** | Por fila | `:142` |
| 12 | campo | Select «Caller ID de salida» → «Automático (número primario activo)» + activos | `comm_settings.voice_caller_id` — **instante** | Siempre | `:154-170` |
| 13 | stat | «Minutos de voz» → `∞` o número + «Se reserva 1 minuto al marcar y se liquida el resto al colgar (pestaña Créditos).» | Solo lectura | Siempre | `:174-176` |
| 14 | texto | «Grabación y consentimiento» | Título | Siempre | `telefonia/RecordingConsentSection.tsx:108-110` |
| 15 | toggle | «Grabar llamadas (dual-channel)» + «El cliente oye el aviso antes de conectarse y queda en `call_consents`.» | Estado local | Siempre | `:114-117` |
| 16 | campo | «Mensaje de consentimiento» (textarea, `maxLength=500`) + contador `{len}/500 · mínimo 20` | Estado local | Siempre | `:122-135` |
| 17 | texto | «Voz: {consent_voice} · Idioma: {consent_language} (es-CO no existe en Twilio)» | **Solo lectura**: vive en `provider_configs(voice).settings` y **no hay control para editarlo** | Siempre | `:137-139` |
| 18 | botón | «Escuchar» / «Detener» (`aria-pressed`) | `POST …/consent-preview`; con 501 cae a la voz del navegador | `disabled` con mensaje vacío | `:140-143` |
| 19 | campo | «Retención (días)» (`min=7 max=730`) + «Se borran de Twilio y Storage al vencer (job diario).» | Estado local | Siempre | `:149-151` |
| 20 | campo | «Timeout de timbre (s)» (`min=10 max=60`) | Estado local | Siempre | `:154-155` |
| 21 | campo | «Llamadas simultáneas» (`min=1 max=50`) | Estado local | Siempre | `:158-159` |
| 22 | botón | «Guardar» | `PATCH /api/crm/settings/telephony` con los 5 campos | Solo con permiso; `disabled` si `!dirty` o el consentimiento es inválido | `:163-169` |
| 23 | texto | «Mi celular» · «Para "Llamar desde mi celular": Twilio te llama primero y luego marca al cliente con el caller id de la organización.» | Título | Siempre | `telefonia/MyMobileSection.tsx:91-94` |
| 24 | campo | «Número (E.164)» (placeholder `+57 310 123 4567`) | Estado local | Siempre | `:98-100` |
| 25 | badge | «Verificado» | Confirma la verificación | `mobile_verified_at` y número igual | `:101-105` |
| 26 | botón | «Enviar código» / «Verificado» | `POST …/verify/send` | `step==='idle'` | `:109-112` |
| 27 | campo | «Código SMS» (`maxLength=8`, solo dígitos) | Estado local | `step==='sent'` | `:116-117` |
| 28 | botón | «Verificar» · «Cancelar» | `POST …/verify/check` | `step==='sent'` | `:119-125` |
| 29 | campo | Select «Modo de llamada por defecto»: «Navegador (softphone)» / «Mi celular» (deshabilitado con « (verifica tu número)») | **Instante** | Siempre | `:132-143` |
| 30 | campo | Select «Mi caller id (opcional)»: «El de la organización» + números activos | **Instante** | Siempre | `:146-160` |

**Destino:** números → `PATCH /api/crm/phone-numbers/[id]`; grabación y límites →
`comm_settings.voice_recording_enabled`, `.voice_consent_message`,
`.voice_recording_retention_days`, `.voice_ring_timeout_seconds`, `.voice_max_concurrent_calls`;
caller id → `comm_settings.voice_caller_id`; preferencias personales →
`user_comm_preferences.{mobile_phone_e164, mobile_verified_at, default_call_mode,
default_caller_id_id}`. **Todo por route handler**, con `can_edit` resuelto en servidor por id
de rol (`lib/.../rbac.ts:12-14`). **Valida:** solo el mínimo de 20 caracteres del
consentimiento; los `min`/`max` de los `<input type=number>` **no bloquean**: un campo vacío
produce `NaN` (`RecordingConsentSection.tsx:150,155,159`) y el servidor responde 400 genérico.

### E.4 Pestaña «Proveedores e IA» — `crm/ProveedoresTab.tsx` + `ProviderCard.tsx` + `ProviderCredentialForm.tsx` (487 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | *(8 tarjetas, `aria-label="Cargando proveedores"`)* | Cargando | `loading && items.length===0` | `ProveedoresTab.tsx:61-67` |
| 2 | estado | «No se pudo cargar la configuración» + «Reintentar» | Error con acción | `error && items.length===0` | `:71-81` |
| 3 | texto | «Proveedores e IA» · «Cada organización puede usar sus propias claves o las de la plataforma. Las claves se guardan en el servidor y no vuelven a mostrarse.» | Cabecera | Siempre | `:88-91` |
| 4 | badge | «Solo lectura (administradores)» | Modo lectura | `!canEdit` | `:94-98` |
| 5 | botón | `aria-label="Recargar"` | `refresh()` | Siempre | `:99-101` |
| 6 | texto | 8 encabezados de categoría con su ayuda: llm «Redacción con IA, clasificación y cerebro del agente de voz.» · analysis · stt «ElevenLabs Scribe v2 es el primario; Gemini es el respaldo.» · tts · voice · sms · email · whatsapp | Agrupación | Con items | `:21-28`, `:114-116` |
| 7 | badge | «Clave propia» (éxito) / «Clave de la plataforma» (neutro) / «Sin configurar» (advertencia) | Estado del proveedor | Por tarjeta | `ProviderCard.tsx:32-34` |
| 8 | toggle | Switch `aria-label="Activar {provider}"` + etiqueta «Activo» | `is_active` — **instante** | Por tarjeta | `:93-103`, `:60-67` |
| 9 | toggle/campo/select | Campos dinámicos de `SETTING_FIELDS` (p. ej. «Presupuesto mensual» del LLM) | **Estado local** | Por tarjeta | `:113-152` |
| 10 | texto | «Claves guardadas: {k}=••••» | Lista **enmascarada** | `credential_keys.length>0` | `:157-161` |
| 11 | botón | «Usar mi clave» / «Cambiar clave» | Abre `ProviderCredentialForm`; `title="Solo administradores"` si no puede | Siempre | `:164-167` |
| 12 | botón | «Probar conexión» | `POST /api/crm/config/providers/test` | Siempre | `:168-171` |
| 13 | botón | «Guardar ajustes» | Persiste solo `SETTING_FIELDS` | **Solo si `dirty`** | `:172-177` |
| 14 | estado | `{result.detail}` + «({latencyMs} ms, clave propia\|clave plataforma)» (`role="status"`, verde/rojo) | Resultado del test | Tras probar | `:180-196` |
| 15 | diálogo | «Credenciales de {provider}» · «Las claves se guardan en el servidor y nunca se muestran de nuevo. Deja un campo vacío para conservar la clave actual.» | Alta de secreto | `credOpen` | `ProviderCredentialForm.tsx:77-80` |
| 16 | estado | «Este proveedor no requiere credenciales.» | Vacío | `fields.length===0` | `:83-85` |
| 17 | botón | «Borrar» / «No borrar» (`aria-pressed`) | Marca la clave para eliminación | Si ya existe | `:98-106` |
| 18 | campo | `type="password"`, placeholder `•••••••••••• (guardada)`, `autoComplete="new-password"` | Captura el secreto | Por campo | `:108-120` |
| 19 | texto | «Se eliminará al guardar.» / «Ya hay una clave guardada. Escribe una nueva para reemplazarla.» / «Sin clave propia: se usará la de la plataforma si existe.» | Ayuda por estado | Por campo | `:123-126` |
| 20 | estado | «Faltan campos obligatorios: {labels}» · «No hay cambios que guardar» (`role="alert"`) | Validación local | Al enviar | `:47`, `:56`, `:131-133` |
| 21 | botón | «Cancelar» · «Guardar» | Envía `{clave: valor\|null}` | Siempre | `:135-141` |

**Destino:** `provider_configs(organization_id, category, provider)` → `is_active`, `settings`
jsonb, `credentials` jsonb (cifrado en servidor), vía `PUT /api/crm/config/providers`.
**Guarda:** `Activo` al instante; el resto con botón — **inconsistencia dentro de la misma
tarjeta**. **Valida:** el servidor con Zod y catálogo (422 con claves desconocidas).
**Permiso:** `can_edit` del servidor por id de rol. ✔

**Esta es la referencia de cómo se manejan secretos en el sistema**: nunca se releen en claro
(`ProviderConfigSafe` solo expone `credential_keys`, `useProviderConfigs.ts:6-7`), se envían a
un route handler y se muestran como `clave=••••`.

**Defecto:** `settings` se inicializa con `useState(item.settings)` (`ProviderCard.tsx:42`) y no
tiene `useEffect` de resincronización: tras un `refresh()` la tarjeta muestra valores viejos y
«Guardar ajustes» aparece sin que nadie haya tocado nada.

### E.5 Pestaña «Email» — `crm/EmailTab.tsx` + 7 archivos de `crm/email/` (555 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | *(3 bloques, `aria-label="Cargando configuración de email"`)* | Cargando | `loading && !settings` | `EmailTab.tsx:22-30` |
| 2 | estado | «No se pudo cargar la configuración de email» + `{api.error ?? 'Sin datos'}` + «Reintentar» | Error con acción | `error \|\| !settings` | `:31-42` |
| 3 | estado | «Solo los administradores pueden gestionar dominios y la política de envío. Puedes editar tu firma.» | Sin permiso, parcial | `!settings.is_admin` | `:47-49` |
| 4 | texto | «Dominios de envío» · «Cada organización envía desde su propio dominio verificado. Sin dominio verificado se usa el remitente global según la política de abajo.» | Título | Siempre | `email/EmailDomainsCard.tsx:42-43` |
| 5 | botón | «Añadir dominio» | Abre `AddDomainDialog` | Solo con permiso | `:45` |
| 6 | estado | «Aún no hay dominios. Añade uno para enviar desde tu marca.» / «… Pide a un administrador que añada uno.» | Vacío según rol | `domains.length===0` | `:48-51` |
| 7 | badge | «Verificado» / «Verificando» / «Pendiente DNS» / «Falló» | Estado del dominio | Por dominio | `:21-26`, `:62` |
| 8 | badge | «Por defecto» (estrella) · «API key ilegible — regenerar» (con `title` explicativo) · «Sin API key propia» | Avisos | Según estado | `:63-67` |
| 9 | botón | «Por defecto» | `POST /api/email/domains/[id]/default` — **instante, sin confirmación** | Verificado y no predeterminado | `:73` |
| 10 | botón | `aria-label="Eliminar {domain}"` | Abre `ConfirmDialog` | Con permiso | `:75` |
| 11 | diálogo | «Eliminar dominio» · «Se eliminará {domain} en Resend (dominio y API key) y en el CRM. Los correos ya enviados conservan su historial.» · «Eliminar» | Confirma | `pendingDelete` | `:91-100` |
| 12 | tabla | «Registro» · «Tipo» · «Nombre» · «Valor» · «Prioridad» · «Estado» | Registros DNS | Dominio expandido | `email/DnsRecordsTable.tsx:64-69` |
| 13 | botón | «Verificar» + «Publica estos registros en el DNS del dominio y pulsa "Verificar". La propagación puede tardar hasta 72 h.» | `POST …/verify` — **sin feedback de éxito** | Siempre | `DnsRecordsTable.tsx:55-58`; `email/useEmailSettings.ts:58` |
| 14 | botón | `aria-label="Copiar nombre {record}"` / `…valor…` | `navigator.clipboard` + ✓ 1,5 s | Por fila | `DnsRecordsTable.tsx:79-80` |
| 15 | estado | «Sin registros. Pulsa "Verificar" para sincronizar con el proveedor.» | Vacío | `records.length===0` | `:74` |
| 16 | diálogo | «Añadir dominio de envío» · «Recomendado: un subdominio dedicado (p. ej. crm.tuempresa.com). Necesitarás acceso al DNS.» | Alta | `addOpen` | `email/AddDomainDialog.tsx:64-65` |
| 17 | campo | «Dominio *» + error inline «Dominio inválido» | Valida con regex | Siempre | `AddDomainDialog.tsx:69-72` |
| 18 | campo | «Nombre del remitente *» · «Usuario del remitente *» + sufijo `@{dominio}` · «Responder a (opcional)» | Alta | Siempre | `:75-88` |
| 19 | campo | Select «Región» → «Estados Unidos (us-east-1)» · «Sudamérica (sa-east-1)» · «Europa (eu-west-1)» · «Asia (ap-northeast-1)» | Región de envío | Siempre | `:91-95` |
| 20 | toggle | «Recibir respuestas en el CRM (MX)» · «Seguimiento de aperturas (marketing)» · «Seguimiento de clics (marketing)» | Alta | Siempre | `:98-100` |
| 21 | botón | «Cancelar» · «Crear dominio» | `POST /api/email/domains` | `disabled` si no es válido | `:104-107` |
| 22 | campo | «Nombre del remitente» · «Correo remitente» (+ error «Debe pertenecer a @{domain}») · «Responder a» | Remitente del dominio | Dominio expandido | `email/DomainSendersForm.tsx:53-63` |
| 23 | toggle | «Recibir respuestas (crm+id@{domain})» · «DMARC publicado» *(autodeclarado, nadie lo comprueba)* · «Aperturas (solo marketing/secuencias)» · «Clics (solo marketing/secuencias)» | Estado local | Dominio expandido | `:67-70` |
| 24 | botón | «Guardar remitente» | `PATCH /api/email/domains/[id]` (envío diferencial) | `disabled` si no hay cambios o hay error | `:73-75` |
| 25 | texto | «Política de envío» · «Remitente global disponible: {from_name} <noreply@{domain}>.» / «No hay remitente global configurado en la plataforma: sin dominio verificado los envíos fallarán.» | Título | Siempre | `email/EmailPolicyCard.tsx:41-43` |
| 26 | toggle | Radios: «Usar remitente global con aviso» (+ «Se envía como "Tu empresa vía GoAdmin" e incluye una nota en el pie.») · «Usar remitente global sin aviso» · «Bloquear envíos» (+ «Exige un dominio propio verificado; los envíos fallan con NO_SENDER.») | Estado local | Siempre | `:20-22`, `:48-54` |
| 27 | toggle | «Seguimiento de aperturas/clics en correos transaccionales» + «Por defecto solo marketing y secuencias llevan tracking (mejor entregabilidad).» | Estado local | Siempre | `:61-64` |
| 28 | botón | «Guardar política» | `PATCH /api/email/settings` | Solo con permiso; `disabled` si no hay cambios | `:67-72` |
| 29 | texto | «Mi firma» · «Se añade automáticamente con el bloque "Firma". Si la dejas vacía se usa nombre, cargo, empresa, teléfono y correo.» | Título | Siempre | `email/SignatureEditor.tsx:33-34` |
| 30 | botón | `VariablePicker` | Inserta `{{var}}` al final | Siempre | `:41` |
| 31 | campo | `RichTextEditor` (placeholder «Ana Gómez · Ejecutiva comercial · {{org.name}}») | Estado local | Siempre | `:43` |
| 32 | texto | «Vista previa (datos de ejemplo)» / «Sin firma personalizada: se usará la firma automática.» | Previsualización en vivo | Siempre | `:46-48` |
| 33 | botón | «Guardar firma» | `PATCH /api/email/settings {signature_html}` | `disabled` si no hay cambios | `:53-55` |

**Destino:** dominios → `email_domains` + Resend + `provider_configs(email).credentials.RESEND_API_KEY_<id>`;
remitente y tracking por dominio → `email_domains.{from_name,from_email,reply_to}` +
`provider_configs(email).settings.email_domains[<id>]`; política →
`provider_configs(email:resend).settings.email_fallback_policy` y `.email_tracking_transactional`;
firma → `profiles.metadata.email_signature_html` **del usuario**, saneada y truncada a 10.000
caracteres en servidor (`app/api/email/settings/route.ts:48-56`). **Todo por route handler**,
con `is_admin` resuelto con `requireOrgAdmin(ctx)` por id de rol. ✔

**Defectos:** la política **no revierte el estado local al fallar** (`EmailPolicyCard.tsx` no
tiene rollback, el mensaje lo da `useEmailSettings.ts:43`); «Verificar» no tiene toast de éxito
(`useEmailSettings.ts:58`) y es la acción que más parece «no pasó nada»; el `catch` del
portapapeles está **vacío** (`DnsRecordsTable.tsx:30-32`).

### E.6 Pestaña «WhatsApp» — `crm/WhatsAppTab.tsx` (146 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | *(2 bloques, sin `aria-busy`)* | Cargando | `!settings` — **si la carga falla se queda aquí para siempre**: no hay estado de error ni «Reintentar» | `:52`, fallo en `:49` |
| 2 | estado | «Solo lectura: requiere rol de administrador.» | Sin permiso | `!canEdit` | `:69` |
| 3 | texto | «Canales y capacidades» | Título | Siempre | `:71` |
| 4 | campo | Select «Canal por defecto del CRM» (placeholder «Primer canal activo») | Estado local | Siempre | `:75-79` |
| 5 | botón | «Consultar» (para «Límite del WABA (usuarios únicos / 24 h)») | `GET /api/crm/whatsapp/settings?limit=1` — **el GET escribe `messaging_limit` en la base** | Siempre, **incluso sin permiso** | `:82-85`; escritura en `app/api/crm/whatsapp/settings/route.ts:26` |
| 6 | tabla | «Canal» · «Tipo» · «Plantillas» · «Adjuntos» · «Texto libre» · «Estado» | Capacidades por canal | Siempre | `:90-91` |
| 7 | estado | «Sin canales de WhatsApp. Conéctalos en Chat › Canales.» | Vacío | `channels.length===0` | `:91` |
| 8 | texto | «Consentimiento y horario (Habeas Data)» | Título | Siempre | `:97` |
| 9 | chip | «Palabras de baja (opt-out)» · «Palabras de alta (opt-in)» (chips con «×» + campo «Añadir + Enter») | Estado local | Siempre | `:99-100`, `:25-37` |
| 10 | toggle | Checkbox «Activo» de «Horario permitido de contacto» | Al activarlo impone `America/Bogota`, L-S, 08:00-20:00 | Siempre | `:104` |
| 11 | campo | «Desde» · «Hasta» (`type=time`) · «Zona horaria» — **texto libre sin validar** | Estado local | Horario activo | `:107-110` |
| 12 | toggle | 7 botones «Dom» · «Lun» · «Mar» · «Mié» · «Jue» · «Vie» · «Sáb» (`aria-pressed`) | Estado local | Horario activo | `:111`, `:23` |
| 13 | texto | «Fuera del horario, los envíos individuales piden programar (utility puede forzar) y las campañas esperan al siguiente tramo.» | Ayuda | Siempre | `:115` |
| 14 | campo | «Límite diario propio de mensajes salientes (vacío = solo el de Meta)» | Estado local | Siempre | `:118-119` |
| 15 | campo | «Indicativo del país por defecto (vacío = 57, Colombia)» con prefijo `+`, `maxLength=4` | Estado local | Siempre | `:122-135` |
| 16 | botón | «Guardar» | `PUT /api/crm/whatsapp/settings` con todo el objeto | Solo con permiso | `:141` |

**Destino:** `provider_configs(category='whatsapp').settings.{default_channel_id,
optout_keywords, optin_keywords, allowed_hours, daily_limit, default_country_code,
messaging_limit}`. **Guarda:** todo con botón. **Valida:** el servidor (`HH:MM`, días 0-6,
máximo 30 palabras). **Al fallar:** toast; `checkLimit` **no tiene `catch`** (`:62-65`) →
rechazo de promesa no capturado y silencio.

### E.7 Pestaña «Créditos y sistema» — `crm/CreditosTab.tsx` (228 líneas) — solo lectura

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | *(4 KPI + 1 bloque, `aria-busy="true"`)* | Cargando | `loading && !data` | `:86-95` |
| 2 | estado | «No se pudo cargar el estado de créditos» + «Reintentar» | Error con acción | `error && !data` | `:99-107` |
| 3 | texto | «Créditos y sistema» · «Saldos, consumo del mes en curso y precios de referencia de los proveedores.» | Cabecera | Con datos | `:119-120` |
| 4 | botón | `aria-label="Recargar"` | Re-fetch | Con datos | `:122-124` |
| 5-8 | stat | «Créditos de IA» (+ «Consumidos este mes: N») · «SMS restantes» · «WhatsApp restantes» · «Minutos de voz» | KPI; `null` → «Ilimitado» | Con datos | `:128-131` |
| 9 | texto | «Presupuesto mensual de IA» · «Gasto estimado: $X de $Y» + `{pct}%` (ámbar ≥80) | Contexto | Con datos | `:135-139` |
| 10 | estado | «Define un presupuesto en Proveedores e IA › OpenAI › Presupuesto mensual.» | Vacío con ruta | `pct == null` | `:144` |
| 11 | estado | «Has usado el {pct}% del presupuesto del mes.» (`role="status"`) | Aviso | `overBudget` | `:147` |
| 12 | texto | «Consumo diario de IA (créditos)» + gráfico de barras / «Sin consumo registrado este mes.» | Gráfico | Con datos | `:154-167` |
| 13 | tabla | «Modelo / canal» · «Llamadas» · «Créditos» · «USD» / «Sin consumo este mes.» | Consumo | Con datos | `:177-187` |
| 14 | tabla | «Proveedor» · «SKU» · «Unidad» · «USD» + tooltip «No verificado» (`*`) / «La tabla de precios (provider_pricing) aún no está cargada.» | Precios | Con datos | `:196-210` |
| 15 | texto | «Cola de trabajos» + `<JobsMonitor/>` | Monitor | Siempre | `:223-224` |

**Persistencia:** ninguna. Lee `GET /api/crm/config/credits`. **El endpoint no exige
administrador** (`app/api/crm/config/credits/route.ts:37`): cualquier miembro ve el presupuesto,
el gasto en dólares y la tabla de precios de proveedor. **Al fallar en una recarga manual con
datos ya en pantalla, el error es silencioso** (`:75-77`, `:97`).

### E.8–E.15 Los 8 modales de «Configuracion CRM»

Se listan aquí resumidos; cada uno es una pantalla completa. Ninguno comprueba permisos y
**ninguno avisa de cambios sin guardar al cerrar el modal**.

| § | Modal | Archivo · líneas | Controles | Destino | Guarda |
|---|---|---|---|---|---|
| E.8 | «Verticales» | `sections/VerticalsManager.tsx` · 305 | 31: contador, recargar, «Nueva Vertical», lista con switch por fila, editar, desactivar, diálogo (Nombre * / Descripcion / Activa), `AlertDialog` «¿Desactivar vertical?» | `verticals(name, description, is_active)` — Supabase de navegador | Switch de la lista: **instante**; el resto: botón |
| E.9 | «Razones de Perdida» | `sections/LossReasonsManager.tsx` · 282 | 30: contador, recargar, «Nueva Razon», grupos «Globales» / «De la organizacion», chip «Inactiva», badge «Global», diálogo (Razon *), `AlertDialog` «¿Desactivar razon de perdida?» | `loss_reasons(code, reason, label, is_active, is_global)` | Botón |
| E.10 | «Scoring (GOC)» | `sections/ScoringConfigurator.tsx` · 340 | 24: «Indicadores» con indicador «Total: {n}%», «Indicador», nombre + peso + papelera por indicador, «Agregar opcion» con etiqueta + score + papelera por opción, «Umbrales (Bandas)» con Min/Max de «Frio»/«Tibio»/«Caliente», dos botones «Guardar» idénticos | `scoring_configs.config` jsonb | Botón (todo local hasta entonces) |
| E.11 | «Etapas y Criterios» | `sections/ExitGatesEditor.tsx` · 311 | 28: contador de etapas, «Stage Manager» (abre pestaña nueva), recargar, lista de etapas con color/probabilidad **solo lectura**, «{n} criterio(s)» / «Sin criterios», diálogo «Criterios de salida - {stage.name}» con Tipo/Min. actividades/Campo/Mensaje por requisito, «Agregar requisito», «Guardar Criterios» | `stages.exit_criteria` jsonb | Botón |
| E.12 | «Vendedores y Comisiones» | `sections/CommissionsPanel.tsx` · 359 | 38: «Tasa General de Comision» con campo + «Guardar», «Overrides por Vendedor» + «Nuevo Override», lista con UUID recortado, «Simulador de Comisiones» con «Monto de cierre (COP)» / «Tasa aplicable» / «Comision estimada», diálogo (ID del vendedor * / Tasa de comision (%)) | `vendor_commission_rates(salesperson_id, rate)` | Botón |
| E.13 | «Programa de Referidos» | `sections/ReferralsProgramCard.tsx` · 127 + `ReferralProgramForm` | 31: «Programa activo»/«Programa inactivo», «Nombre del programa», «Descripción (opcional)», «Tipo de recompensa», «Porcentaje»/«Valor», «Recompensa para», previsualización «Así se verá: …» (`aria-live`), «Guardar configuración», lista de referidos con transiciones «Marcar contactado»/«Marcar calificado»/«Rechazar»/«Volver a pendiente» | `referral_programs` y `referrals.status` vía **route handler** | Programa: botón; estado de referido: **instante** |
| E.14 | «Estructura Comercial» | `sections/EstructuraComercialManager.tsx` · 59 + 16 archivos | 3 sub-pestañas: «Roles» (30 controles), «Equipos» (40), «Territorios» (25) | `sales_roles`, `sales_teams`, `sales_team_members`, `territories` — Supabase de navegador | Botón; quitar miembro: **instante y sin confirmación** |
| E.15 | «ICP (Ideal Customer Profile)» | `sections/ICPManager.tsx` · 793 | 72: lista de perfiles con banda A/B/C, tabla de criterios («Campo»·«Operador»·«Valor»·«Peso»·«Req»), diálogo de perfil (Nombre */Band */Color/Prioridad/SLA primera contacto (h)/Descripción/Activo), diálogo de criterio (Campo (field_key) */Operador */Valor/Peso/Obligatorio), diálogo «Evaluar cliente contra ICP», `AlertDialog` «¿Eliminar perfil ICP?» | `icp_profiles` e `icp_criteria` vía **route handler** | Botón |

**`ReferralsProgramCard` es la referencia del módulo**: rutas de servidor, validación inline
junto al campo, el mensaje real del servidor en un `Alert` con foco, `role="alert"` /
`aria-live` / `aria-busy`, y nunca ofrece transiciones de estado inválidas. **Y es la única que
recibe `can_manage` del servidor… y no lo usa** (`useReferrals.ts:49,69` frente a `:27`).

---

## F. Panel «Recursos Humanos» — `panels/hrm/HRMConfigPanel.tsx` (184 líneas)

Icono del registro: `Users` — **choca con el catálogo**, donde `Users` es «Cliente»
(`CATALOGO-ICONOS.md` §2).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `CardListSkeleton cards={4}` | Cargando | `orgLoading \|\| isLoading` | `:102-109` |
| 2 | botón | *(icono `RefreshCw`, **sin `aria-label`**)* | `loadData()` | Siempre | `:114-116` |
| 3 | texto | «Configuración General» | Título | Siempre | `:121` |
| 4 | texto | «Reglas de País» · «Consulta las reglas legales de nómina por país (salario mínimo, aportes, etc.)» | Tarjeta informativa | Siempre | `:139-142` |
| 5 | botón | «Ver Reglas» | Navega a `/app/hrm/reglas-pais` | Siempre | `:145-147` |
| 6 | texto | «Monedas» | Título | Siempre | `:155` |
| 7 | texto | «Sobre las Monedas» + 4 viñetas, una de ellas «Las tasas de cambio se pueden configurar manualmente o auto-actualizar» — **no existe interfaz para `auto_update`** | Tarjeta informativa | Siempre | `:165-180` |
| 8 | campo | «Nombre» (`disabled`) · «Razón Social» (`disabled`) | Solo lectura | Siempre | `hrm/configuracion/SettingsForm.tsx:75-88` |
| 9 | campo | Select «País» | Fija `country_code` **y** `country` | Siempre | `SettingsForm.tsx:96-119` |
| 10 | campo | «Ciudad» (placeholder «Ciudad principal») | `organizations.city` | Siempre | `:122-131` |
| 11 | campo | «NIT» (placeholder «NIT de la empresa») · «Identificación Tributaria» (placeholder «ID Tributario») | `organizations.nit` / `.tax_id` | Siempre | `:138-159` |
| 12 | texto | «Configuración de Nómina» | Título | Siempre | `:165-167` |
| 13 | campo | Select «Frecuencia de Pago» (`disabled`) + nota «Configurable en próxima versión» | **Decorativo**: el valor es el literal `'monthly'` inyectado por el servicio | Siempre | `:170-188`; literal en `lib/services/hrmConfigService.ts:180` |
| 14 | campo | Select «Política de Horas Extra» (`disabled`) + misma nota | **Decorativo**: literal `'standard'` | Siempre | `:191-209`; `hrmConfigService.ts:181` |
| 15 | campo | «Moneda Base» (`disabled`) + nota «Ver pestaña Monedas» | Espejo de `organization_currencies.is_base` | Siempre | `:212-220` |
| 16 | botón | «Guardar Cambios» / «Guardando...» | Persiste los 5 campos editables | Siempre | `:227-243` |
| 17 | estado | «No hay monedas configuradas» | Vacío | Sin monedas | `hrm/configuracion/CurrenciesCard.tsx:86-89` |
| 18 | badge | «Base» (con estrella) | Marca la moneda base | `is_base` | `CurrenciesCard.tsx:113-116` |
| 19 | botón | «Base» | `is_base = true` — **instante** | Por moneda no base | `:119-133` |
| 20 | botón | *(icono `Trash2`, **sin etiqueta**)* | **Borra al instante, sin confirmación** | Por moneda | `:134-146` |
| 21 | campo | Select «Agregar moneda...» + botón *(icono `Plus`, sin etiqueta)* | `INSERT` — **instante** | Si quedan monedas por añadir | `:159-181` |

**Destino y persistencia**

| Ajuste | Tabla · columna | Guarda | Valida | Al fallar |
|---|---|---|---|---|
| País, Ciudad, NIT, Id. tributaria | `organizations.{country_code, country, city, nit, tax_id}` | Botón | **No** | Toast «No se pudo guardar la configuración»; el formulario conserva lo tecleado |
| Moneda base | `organization_currencies.is_base` | Instante | No | **Falla en silencio** (ver abajo) |
| Añadir moneda | `organization_currencies` (INSERT) | Instante | No duplica (filtra la lista) | Toast |
| Eliminar moneda | `organization_currencies` (DELETE con `is_base = false`) | Instante, **sin diálogo** | — | **Falla en silencio** |

**El fallo silencioso.** `organization_currencies` **solo tiene políticas de `SELECT` e
`INSERT`**; no hay `UPDATE` ni `DELETE`. Un `UPDATE`/`DELETE` que afecta a 0 filas **no devuelve
error** en PostgREST, así que el panel muestra el toast de éxito y recarga mostrando el valor
viejo (`hrmConfigService.ts:209-242`, `:257-266`).

**Otros defectos:** `setBaseCurrency` no es atómico ni comprueba los errores intermedios —si el
primer `UPDATE` (poner todas a `false`) pasa y el segundo falla, la organización queda **sin
moneda base** (`hrmConfigService.ts:209-242`); el formulario no se reinicializa al recargar
(`SettingsForm.tsx:35-41`); posible desajuste ISO2/ISO3 en el select de país (`:37` arranca en
`'CO'`, el fallback usa `'COL'`, `hrmConfigService.ts:298`) y los helpers de conversión
(`:333-342`) no se llaman nunca; `updateCountryRule`/`createCountryRule` llevan el comentario
`// Super Admin only` y son invocables desde el cliente sin ninguna verificación
(`hrmConfigService.ts:132-157`).

---

## G. Panel «PMS Hotel» — `panels/pms/PMSConfigPanel.tsx` (112 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `CardListSkeleton cards={4} columns="2"` | Cargando | `isLoading \|\| !settings` | `:82-89` |
| 2 | botón | *(icono `RefreshCw`, **sin texto ni `aria-label`**)* | `handleRefresh()` | Siempre | `:94-96` |
| 3 | botón | «Guardar» / «Guardando...» (`Save`) | Persiste | `disabled={isSaving \|\| !hasChanges}` | `:97-100` |
| 4 | texto | «Configuración General» (`Clock`) · «Horarios, zona horaria y moneda predeterminada» | Tarjeta | Siempre | `pms/configuracion/GeneralSettings.tsx:28-34` |
| 5 | campo | «Hora de Check-in» + «Hora estándar de entrada de huéspedes» | `checkinTime` | Siempre | `GeneralSettings.tsx:39-48` |
| 6 | campo | «Hora de Check-out» + «Hora límite de salida de huéspedes» | `checkoutTime` | Siempre | `:52-61` |
| 7 | campo | Select «Zona Horaria» (`Globe`) — 10 opciones «Bogotá (GMT-5)» … «Londres (GMT+0)» | `timezone` — **zona en la sombra** (§V) | Siempre | `:67-85`; opciones en `lib/services/pmsSettingsService.ts:138-151` |
| 8 | campo | Select «Moneda Predeterminada» (`DollarSign`) — 8 opciones «Peso Colombiano (COP)» … «Real Brasileño (BRL)» | `defaultCurrency` — **moneda en la sombra** | Siempre | `:89-107` |
| 9 | texto | «Reservas» (`CalendarCheck`) · «Políticas de reservas, depósitos y cancelaciones» | Tarjeta | Siempre | `pms/configuracion/ReservationSettings.tsx:20-26` |
| 10 | toggle | «Confirmar reservas automáticamente» · «Las reservas se confirman al crearlas sin revisión manual» | `autoConfirmReservations` | Siempre | `:31-39` |
| 11 | toggle | «Requerir depósito» · «Solicitar pago anticipado para confirmar reservas» | `requireDeposit` | Siempre | `:44-52` |
| 12 | campo | «Porcentaje de depósito» (`Percent`) | `depositPercentage` | **Solo si `requireDeposit`** | `:55-71` |
| 13 | campo | «Días para cancelación gratuita» + «Días antes del check-in para cancelar sin penalización» | `cancellationPolicyDays` | Siempre | `:74-86` |
| 14 | toggle | «Permitir overbooking» · «Aceptar más reservas que la capacidad disponible» | `overbookingAllowed` | Siempre | `:90-98` |
| 15 | campo | «Porcentaje de overbooking» | `overbookingPercentage` | Solo si #14 | `:101-117` |
| 16 | texto | «Notificaciones» (`Bell`) · «Configuración de emails y alertas automáticas» | Tarjeta | Siempre | `pms/configuracion/NotificationSettings.tsx:20-26` |
| 17 | toggle | «Enviar email de confirmación» · «Notificar al huésped cuando se confirma su reserva» | `sendConfirmationEmail` | Siempre | `:31-39` |
| 18 | toggle | «Enviar email recordatorio» · «Recordar al huésped antes de su llegada» | `sendReminderEmail` | Siempre | `:44-52` |
| 19 | campo | «Días antes del check-in» | `reminderDaysBefore` | Solo si #18 | `:55-68` |
| 20 | campo | «Email para alertas de mantenimiento» (`Mail`, placeholder `mantenimiento@hotel.com`) + «Recibir notificaciones de órdenes de mantenimiento urgentes» | `maintenanceAlertEmail` — `type="email"` **sin `<form>`: no valida** | Siempre | `:71-84` |
| 21 | texto | «Check-in / Check-out» (`LogIn`) · «Políticas de entrada anticipada y salida tardía» | Tarjeta | Siempre | `pms/configuracion/CheckinCheckoutSettings.tsx:20-26` |
| 22 | toggle | «Permitir early check-in» · «Huéspedes pueden llegar antes de la hora estándar» | `allowEarlyCheckin` | Siempre | `:31-42` |
| 23 | campo | «Cargo por early check-in» (`DollarSign`) + «Costo adicional (0 = gratis según disponibilidad)» | `earlyCheckinFee` | Solo si #22 | `:45-63` |
| 24 | toggle | «Permitir late check-out» · «Huéspedes pueden salir después de la hora estándar» | `allowLateCheckout` | Siempre | `:67-78` |
| 25 | campo | «Cargo por late check-out» | `lateCheckoutFee` | Solo si #24 | `:81-99` |
| 26 | texto | «Operaciones» (`Wrench`) · «Configuración de housekeeping y mantenimiento» | Tarjeta | Siempre | `pms/configuracion/OperationsSettings.tsx:19-25` |
| 27 | toggle | «Asignación automática de limpieza» (`Sparkles`) · «Crear tareas de limpieza automáticamente al hacer check-out» | `housekeepingAutoAssign` | Siempre | `:30-41` |

**Destino:** `organization_settings` con `key = 'pms_settings'`, columna `settings` jsonb, las
**18 claves**. **Guarda:** botón. **Valida:** solo los `min`/`max` de HTML, que no bloquean.
**Al fallar:** `getSettings` **se traga el error** y devuelve los valores por defecto
(`lib/services/pmsSettingsService.ts:66-79`), así que el `catch` del panel (`:38-41`) **nunca se
ejecuta** y el toast «No se pudieron cargar las configuraciones» es código muerto. Peor:
`handleRefresh` muestra «Actualizado» **siempre**, incluso sobre un fallo (`:54`), y
`saveSettings` relee antes de fusionar (`:83-84`) → **guardar después de un fallo de lectura
sobrescribe la configuración real con los valores por defecto**.

**Cero filas de `pms_settings` en toda la base** (§B.1) y **cero lectores** de las 18 claves
(§U).

---

## H. Panel «POS» — `panels/pos/POSConfigPanel.tsx` (7 líneas)

Monta `components/pos/configuracion/ConfiguracionPage.tsx` con `embedded`. **Ya auditado y
diseñado**: `AUDITORIA-CONTROLES-PRODUCTOS-POS.md` §D.17 (13 tarjetas, 6 diálogos, 11
hallazgos) y Sección «Configuración › POS» de la página `05 POS y ventas` (43 nodos).

**Lo único que hay que alinear aquí** (§W): es el único panel que **no** dibuja una segunda
cabecera porque la suya está oculta por `embedded`; su tarjeta «Horas de Operación» escribe
`organization_settings` con clave `operating_hours` directamente desde el navegador
(`ConfiguracionPage.tsx:281-295`), fuera de su propio servicio, y esa clave **tiene 0 filas** en
la base. Es el mismo patrón de §G, §J y §K.

---

## I. Panel «Chat» — `panels/chat/ChatConfigPanel.tsx` (422 líneas)

Tres secciones apiladas: Etiquetas, Respuestas Rápidas, Llaves API.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `CardListSkeleton cards={6}` | Cargando | Las **tres** cargas activas **y** las tres listas vacías | `:249-256` |
| 2 | texto | «Etiquetas» / «Etiquetas de Conversación» + «{n} etiqueta(s) configurada(s)» | Título + contador | Siempre | `:264`; `chat/configuracion/etiquetas/TagsHeader.tsx:28-33` |
| 3 | botón | *(icono `RefreshCw`, sin etiqueta)* · «Nueva Etiqueta» | Recarga / abre `TagDialog` | Siempre | `TagsHeader.tsx:38-53` |
| 4 | estado | «No hay etiquetas configuradas» · «Crea etiquetas para organizar y clasificar tus conversaciones» (🏷️) | Vacío | `tags.length===0` | `:268-275` |
| 5 | menú | «Editar» · «Eliminar» (kebab por tarjeta) | Acciones | Por etiqueta | `etiquetas/TagCard.tsx:47-57` |
| 6 | badge | «{n} conversación(es)» | `usage_count` | Por etiqueta | `TagCard.tsx:62-67` |
| 7 | diálogo | «Nueva Etiqueta» / «Editar Etiqueta»: «Nombre *», «Color» (10 muestras con `title` Azul/Verde/Amarillo/Naranja/Rojo/Púrpura/Rosa/Índigo/Teal/Gris), «Descripción (opcional)» (editor HTML), «Vista previa:», «Cancelar», «Crear Etiqueta»/«Guardar Cambios» | Alta/edición | `tagDialogOpen` | `etiquetas/TagDialog.tsx:68-150` |
| 8 | diálogo | «¿Eliminar etiqueta?» · «Esta acción eliminará la etiqueta "{name}" y la removerá de todas las conversaciones...» | Confirma | — | `:358-371` |
| 9 | texto | «Respuestas Rápidas» + «{n} plantilla(s) configurada(s)» | Título + contador | Siempre | `:289`; `respuestas-rapidas/QuickRepliesHeader.tsx:33-38` |
| 10 | campo | «Buscar...» | Filtra **en cliente** por título/contenido/atajo/tags | Siempre | `QuickRepliesHeader.tsx:45-50`; `:202-208` |
| 11 | botón | *(recargar)* · «Nueva Respuesta» | — | Siempre | `QuickRepliesHeader.tsx:52-67` |
| 12 | estado | «No hay respuestas rápidas configuradas» · «Crea plantillas de respuesta para agilizar la atención al cliente» (💬) / «No se encontraron respuestas que coincidan con "{searchTerm}"» | Vacío / sin resultados | Según caso | `:300-311` |
| 13 | badge | «Inactivo» · chip `#{shortcut}` (`Hash`, mono) · «Usado {n} veces» | Estado | Por tarjeta | `respuestas-rapidas/QuickReplyCard.tsx:40-51`, `:99` |
| 14 | menú | «Copiar contenido» · «Editar» · «Eliminar» | Acciones | Por tarjeta | `QuickReplyCard.tsx:61-75` |
| 15 | diálogo | «Nueva Respuesta Rápida» / «Editar Respuesta Rápida»: «Título *», «Atajo (opcional)» + «Escribe /{shortcut} para usar», «Contenido *», «Variables disponibles» con 5 botones `{{customer_name}}` `{{agent_name}}` `{{organization_name}}` `{{current_date}}` `{{current_time}}` (**se concatenan al final, no en el cursor**), «Tags internos (opcional)» + «Agregar», «Respuesta activa» + «Las respuestas inactivas no aparecen en sugerencias» | Alta/edición | — | `respuestas-rapidas/QuickReplyDialog.tsx:96-236` |
| 16 | texto | «Llaves API» / «Llaves de API» + «{activas} de {total} llave(s) activa(s)» | Título + contador | Siempre | `:325`; `llaves-api/ApiKeysHeader.tsx:30-35` |
| 17 | estado | «No hay llaves de API configuradas» · «Crea llaves de API para integrar el chat con tu aplicación o servicios externos» (🔑) | Vacío | `apiKeys.length===0` | `:335-342` |
| 18 | badge | «Activa» / «Revocada» / «Expirada» / «Inactiva» | Estado | Por llave | `llaves-api/ApiKeyCard.tsx:53-67` |
| 19 | botón | `{key_prefix}...` + copiar | Copia **solo el prefijo** | Por llave | `ApiKeyCard.tsx:70-86` |
| 20 | menú | «Rotar llave» · «Revocar» | Acciones | Activa y no revocada | `ApiKeyCard.tsx:103-113` |
| 21 | badge | «Permisos:» + scopes crudos · «Creada {hace X}» / «Último uso: {hace X}» / «Expira»/«Expiró: {...}» | Metadatos | Por llave | `ApiKeyCard.tsx:119-155` |
| 22 | diálogo | «Nueva Llave de API»: «Nombre *», «Canal (opcional)» + «Todos los canales» + «Limita el acceso a un canal específico», «Permisos (scopes) *» con 7 casillas («Leer mensajes», «Enviar mensajes», «Leer conversaciones», «Gestionar conversaciones», «Leer contactos», «Gestionar contactos», «Webhooks»), «Expiración» («Nunca expira»/«30 días»/«90 días»/«6 meses»/«1 año») | Alta | `keyDialogOpen` | `llaves-api/ApiKeyDialog.tsx:166-241` |
| 23 | estado | «Llave de API Creada» · «Guarda esta llave ahora» · «Esta es la única vez que verás la llave completa...» + «Tu llave de API:» + «Entendido, ya la guardé» | Éxito con secreto | Tras crear | `ApiKeyDialog.tsx:107-159` |
| 24 | diálogo | «¿Revocar llave de API?» · «...Cualquier integración que use esta llave dejará de funcionar inmediatamente.» | Confirma | — | `:374-387` |
| 25 | diálogo | «¿Rotar llave de API?» · «...creará una nueva llave con los mismos permisos y revocará la llave actual "{name}"...» | Confirma | — | `:390-403` |

**Destino:** `conversation_tags`, `conversation_tag_relations`, `quick_replies`,
`channel_api_keys` y `chat_audit_logs`, **todo con el cliente Supabase del navegador**
(`lib/services/inboxConfigService.ts:1`), precedido de `supabase.rpc('set_org_context', {org_id})`
— es decir, **el propio cliente declara su tenant** (`:95-97`). **Guarda:** botón de cada
diálogo. **Valida:** solo campos no vacíos; **sin unicidad de nombre de etiqueta ni de atajo**.
**Al fallar:** toast y `throw`; el borrado de etiqueta **no comprueba el error del primer
`delete`** de relaciones (`:194-198`) y puede dejar el estado a medias; la rotación **no es
atómica** (`:399-406`).

**Auditoría no fiable por construcción:** `chat_audit_logs` la escribe el mismo cliente que hace
la acción, con `actor_id: null` y `ip_address: null`, y **el error se traga** (`:99-116`).

---

## J. Panel «Integraciones» — `panels/integraciones/IntegracionesConfigPanel.tsx` (150 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | *(3 tarjetas `animate-pulse`)* | Cargando | `loading` | `:99-114` |
| 2 | texto | «Configuración de Integraciones» (`<h1>`) · «Parámetros del módulo, límites y preferencias» | **Segunda cabecera**, apilada bajo la del contenedor | Siempre | `integraciones/configuracion/ConfigHeader.tsx:28-33` |
| 3 | botón | «Actualizar» (`RefreshCw` girando) | `loadData()` | `disabled={refreshing}` | `ConfigHeader.tsx:39-48` |
| 4 | botón | «Restaurar Defaults» (naranja, `RotateCcw`) | Abre `AlertDialog` | Siempre | `ConfigHeader.tsx:49-57` |
| 5 | texto | «Estado del Módulo» | Tarjeta de contadores | Siempre | `ModuleStats.tsx:27-29` |
| 6-13 | stat | «Conexiones» · «Webhooks» · «API Keys» · «Mapeos» · «Total Jobs» · «Jobs Ejecutando» · «Jobs Fallidos» · «Eventos» | Solo lectura; `?? 0` → **un fallo de red se ve como «0», no como error** | Siempre | `ModuleStats.tsx:45-102` |
| 14 | texto | «Retención de Datos» · «Tiempo de almacenamiento de eventos, jobs y logs» | Tarjeta | Siempre | `SettingsForm.tsx:76-80` |
| 15-17 | campo | «Eventos (días)» · «Jobs (días)» · «Logs (días)» | `retention.*` | Siempre | `SettingsForm.tsx:84-120` |
| 18 | texto | «Límites» · «Restricciones de uso del módulo» | Tarjeta | Siempre | `:130-134` |
| 19-23 | campo | «Máx. Conexiones» · «Máx. Webhooks» · «Máx. API Keys» · «Jobs Concurrentes» · «Rate Limit (req/min)» | `limits.*` | Siempre | `:138-200` |
| 24 | texto | «Valores por Defecto» · «Configuración predeterminada para sincronización» | Tarjeta | Siempre | `:210-214` |
| 25-28 | campo | «Intervalo Sync (min)» · «Reintentos» · «Delay Reintento (seg)» · «Timeout (seg)» | `defaults.*` | Siempre | `:218-267` |
| 29 | texto | «Notificaciones» · «Alertas y notificaciones del módulo» | Tarjeta | Siempre | `:277-281` |
| 30 | toggle | «Email en error de conexión» · «Recibir email cuando una conexión falle» | `notifications.emailOnConnectionError` | Siempre | `:286-294` |
| 31 | toggle | «Email en job fallido» · «Recibir email cuando un job falle» | `notifications.emailOnJobFailure` | Siempre | `:298-306` |
| 32 | campo | «Slack Webhook URL (opcional)» (placeholder `https://hooks.slack.com/services/...`) | **Secreto de portador en texto plano** | Siempre | `:309-319` |
| 33 | texto | «Funcionalidades» · «Habilitar o deshabilitar características del módulo» | Tarjeta | Siempre | `:329-333` |
| 34-37 | toggle | «Auto-sincronización» · «Webhooks Salientes» · «API Keys» · «Mapeos de Objetos» (con sus subtítulos) | `features.*` — **no deshabilitan nada** | Siempre | `:338-374` |
| 38 | botón | «Guardar Cambios» / «Guardando...» (barra `sticky`) | Persiste | **Solo si `hasChanges`** | `:380-391` |
| 39 | texto | «Documentación y Accesos Rápidos» · «Guías internas y enlaces útiles del módulo de integraciones» | Tarjeta | Siempre | `DocumentationSection.tsx:74-80` |
| 40-45 | botón | «Crear una Conexión» · «Configurar API Keys» · «Webhooks Salientes» · «Mapeos de Objetos» · «Monitor de Eventos» · «Gestión de Jobs» | Enlaces **cableados** a `/app/integraciones/...` | Siempre | `DocumentationSection.tsx:26-69` |
| 46 | texto | «💡 Tips de uso» + 4 viñetas («Rota las API keys regularmente por seguridad», …) | Estático | Siempre | `DocumentationSection.tsx:109-117` |
| 47 | diálogo | «¿Restaurar configuración por defecto?» · «Esta acción sobrescribirá toda la configuración actual con los valores predeterminados del sistema. Los cambios no guardados se perderán.» · «Cancelar» · «Restaurar Defaults» | Confirma | `resetDialogOpen` | `:137-144` |

**Destino:** `organization_settings` con `key = 'integrations'`, las **19 claves**.
**Guarda:** botón. **Valida:** solo `min`/`max` de HTML; el `type="url"` del webhook de Slack
**no valida nada** porque no hay `<form>`. **Al fallar:** `updateIntegrationSettings` devuelve
`false` (`lib/services/integrationsService.ts:3082,3096`) → toast genérico, **el formulario no
revierte**; y `handleSave` **no tiene `catch`** (`:68-82`), solo `finally`.

**0 filas de `integrations` en la base** y **0 lectores de las 19 claves** (§U).

**Riesgos propios:** el servicio importado es `'use client'` y expone, en el mismo módulo que
baja al navegador, escrituras de `integration_credentials` con `secret_ref`
(`integrationsService.ts:655-665`, `:1392-1442`) y **generación de secretos de webhook en el
cliente** (`:2966-2976`); `testWebhookEndpoint` (`:2935-2962`) **es una simulación**: no hace
`fetch` y devuelve `statusCode: 200`; `getModuleStats` repite tres veces la misma subconsulta
(`:3132,3138,3145`) y los contadores de eventos y mapeos **topan en 1.000** por un `.limit(1000)`.

---

## K. Panel «Parking» — `panels/parking/ParkingConfigPanel.tsx` (160 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `CardListSkeleton cards={4}` | Cargando | `orgLoading \|\| isLoading` | `:94-101` |
| 2 | estado | «No se pudo cargar la configuración del parqueadero.» | Error — **inalcanzable**: `getConfig` nunca devuelve `null` | `!config` | `:103-110` |
| 3 | texto | «Configuración del Parqueadero» · «Personaliza horarios, políticas y parámetros operativos» | **Segunda cabecera** | Siempre | `parking/configuracion/ConfigHeader.tsx:31-36` |
| 4 | botón | «Recargar» | `loadConfig()` — **descarta cambios sin avisar** | `disabled={isLoading}` | `ConfigHeader.tsx:41-50` |
| 5 | botón | «Restablecer» | Abre `AlertDialog` | Siempre | `:51-60` |
| 6 | botón | «Guardar Cambios» | `saveConfig` | `disabled` si no hay cambios | `:61-73` |
| 7 | estado | «Tienes cambios sin guardar. No olvides guardar antes de salir.» | Aviso — **sin `beforeunload` ni bloqueo de navegación** | `hasChanges` | `:123-129` |
| 8 | texto | «Horarios de Operación» + cabeceras «Día» · «Apertura» · «Cierre» · «Activo» | Tarjeta | Siempre | `parking/configuracion/ScheduleSection.tsx:49-59` |
| 9-11 | campo/toggle | 7 filas «Lunes»…«Domingo» con hora de apertura, hora de cierre y switch | `schedule.<día>.{open,close,enabled}` — **21 claves**; no valida que apertura < cierre | Siempre | `ScheduleSection.tsx:75-93` |
| 12 | texto | «Tolerancias y Tiempos» | Tarjeta | Siempre | `TolerancesSection.tsx:29` |
| 13 | campo | «Período de gracia al entrar (min)» + «Tiempo sin cobro al inicio de la estadía» | `tolerances.grace_period_minutes` | Siempre | `:35-48` |
| 14 | campo | «Tiempo para salir después de pagar (min)» + «Tiempo extra para salir sin cobro adicional» | `tolerances.exit_grace_minutes` | Siempre | `:52-65` |
| 15 | campo | «Máximo tiempo de estancia (horas)» + «Tiempo máximo permitido antes de alertar» | `tolerances.max_stay_hours` | Siempre | `:69-82` |
| 16 | toggle | «Permitir estancia nocturna» · «Vehículos pueden quedarse durante la noche» | `tolerances.overnight_allowed` | Siempre | `:87-97` |
| 17 | texto | «Políticas de Cobro» | Tarjeta | Siempre | `PoliciesSection.tsx:56` |
| 18-22 | toggle | «Cobrar al entrar (prepago)» · «Cobrar al salir» · «Permitir pago parcial» · «Requerir foto de placa» · «Calcular tarifa automáticamente» (con sus subtítulos) | `policies.*` — **#18 y #19 no son excluyentes y se pueden apagar los dos** | Siempre | `:25-48`, `:69-72` |
| 23 | texto | «Ticket Perdido» | Tarjeta | Siempre | `LostTicketSection.tsx:29` |
| 24 | toggle | «Habilitar política de ticket perdido» · «Permite cobrar tarifa especial cuando no se presenta ticket» | `lost_ticket.enabled` | Siempre | `:35-45` |
| 25 | campo | «Tarifa fija ($)» + «Monto fijo a cobrar por ticket perdido» — **`$` cableado, ignora la moneda de la organización** | `lost_ticket.fixed_fee` | Solo si #24 | `:51-61` |
| 26 | campo | «Máximo horas a cobrar» + «Alternativa: cobrar tarifa normal por este máximo de horas» | `lost_ticket.max_hours_fee` | Solo si #24 | `:65-78` |
| 27-28 | toggle | «Requerir identificación» · «Requerir prueba del vehículo» | `lost_ticket.require_id` / `.require_vehicle_proof` | Solo si #24 | `:83-108` |
| 29 | texto | «Mensajes Personalizados» | Tarjeta | Siempre | `MessagesSection.tsx:61` |
| 30-34 | campo | 5 textareas: «Mensaje de bienvenida» (+ «Variables: {max_hours}») · «Mensaje de salida» · «Pie del ticket de entrada» · «Pie del recibo de pago» · «Aviso de ticket perdido» | `messages.*` | Siempre | `MessagesSection.tsx:25-53` |
| 35 | texto | «Alertas y Notificaciones» | Tarjeta | Siempre | `AlertsSection.tsx:29` |
| 36 | toggle | «Notificar cuando esté lleno» · «Alerta cuando la ocupación supere el umbral» | `alerts.notify_when_full` | Siempre | `:37-47` |
| 37 | campo | «Umbral de capacidad:» + `%` (`min=50 max=100` **sin enforcement**: se puede guardar 999) | `alerts.full_capacity_threshold` | Solo si #36 | `:51-64` |
| 38 | toggle | «Notificar estancias largas» · «Alerta cuando un vehículo lleva mucho tiempo» | `alerts.notify_long_stay` | Siempre | `:73-83` |
| 39 | campo | «Alertar después de:» + `horas` | `alerts.long_stay_hours` | Solo si #38 | `:87-97` |
| 40 | toggle | «Notificar salida sin pagar» · «Alerta cuando se intenta salir sin realizar el pago» | `alerts.notify_unpaid_exit` | Siempre | `:106-115` |
| 41 | *(sin interfaz)* | — | `printing.{print_entry_ticket, print_exit_receipt, ticket_copies, receipt_copies, include_qr_code}` — **5 claves que se persisten con sus valores por defecto en cada guardado y no tienen ningún control** | Siempre | `lib/services/parkingConfigService.ts:45-52`, `:100-106` |
| 42 | diálogo | «¿Restablecer configuración?» · «Esta acción restaurará todos los valores a la configuración por defecto. Perderás cualquier personalización actual.» · «Cancelar» · «Restablecer» | Confirma; **escribe los defaults en la base al instante** | `showResetDialog` | `:144-154` |

**Destino:** `organization_settings` con `key = 'parking_config'`, **34 claves**. **Guarda:**
botón. **Valida:** nada en JavaScript. **Al fallar en el guardado:** toast, y `originalConfig`
no se toca, así que el aviso de cambios permanece (correcto). **Al fallar en la lectura:**
`getConfig` **se traga el error** y devuelve `DEFAULT_CONFIG`
(`parkingConfigService.ts:139-142`) → mismo riesgo de pérdida silenciosa que en PMS.

**0 filas y 0 lectores de las 34 claves.** Lo que usa la operación real: el período de gracia
sale de `parking_rates.grace_period_min` (`lib/services/parkingRateService.ts:12`) y la tarifa
de ticket perdido de `parking_rates.lost_ticket_fee` con una **constante de 50.000 en código**
(`components/parking/operacion/ExitDialog.tsx:67`, `:124`).

---

## L. Panel «Calendario» — `panels/calendario/CalendarioConfigPanel.tsx` (50 líneas)

El panel son 2 handlers y 4 toasts; monta `CalendarSettingsForm`.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | *(3 tarjetas de esqueleto)* | Cargando | `loading` | `calendario/configuracion/CalendarSettingsForm.tsx:68-85` |
| 2 | texto | «Vista y Navegación» · «Configura cómo se muestra el calendario por defecto» | Tarjeta | Siempre | `:110-114` |
| 3 | campo | Select «Vista por defecto» | `defaultView` | Siempre | `:120-135` |
| 4 | campo | Select «Primer día de la semana» | `weekStartDay` | Siempre | `:140-155` |
| 5 | toggle | «Mostrar fines de semana» · «Incluir sábado y domingo en la vista semanal» | `showWeekends` | Siempre | `:162-171` |
| 6 | texto | «Horario Laboral» · «Define las horas de trabajo que se resaltarán en el calendario» | Tarjeta | Siempre | `:181-185` |
| 7 | campo | «Hora de inicio» · «Hora de fin» | `workingHours.{start,end}` | Siempre | `:190-213` |
| 8 | texto | «Módulos Visibles» · «Selecciona qué tipos de eventos mostrar por defecto» | Tarjeta | Siempre | `:223-228` |
| 9 | toggle | N casillas, una por `SOURCE_TYPE_OPTIONS` | `visibleSourceTypes[]` | Siempre | `:242-251` |
| 10 | texto | «Colores por Tipo» · «Personaliza los colores para cada tipo de evento» | Tarjeta | Siempre | `:263-267` |
| 11 | campo | N selectores `<input type="color">` | `sourceTypeColors.{tipo}` | Siempre | `:273-283` |
| 12 | texto | «Zona Horaria y Recordatorios» | Tarjeta | Siempre | `:296` |
| 13 | campo | Select «Zona horaria» | **`organizations.timezone` (canónica) + `organization_settings.calendar.timezone`** | Siempre | `:305-320` |
| 14 | campo | Select «Recordatorio predeterminado» | `defaultReminder` | Siempre | `:324-339` |
| 15 | texto | «Opciones de Visualización» · «Ajusta cómo se muestran los eventos en el calendario» | Tarjeta | Siempre | `:351-354` |
| 16 | toggle | «Mostrar hora del evento» · «Muestra la hora de inicio en las tarjetas de evento» | `showEventTime` | Siempre | `:359-368` |
| 17 | toggle | «Mostrar ubicación» · «Muestra la ubicación en las tarjetas de evento» | `showEventLocation` | Siempre | `:373-382` |
| 18 | toggle | «Modo compacto» · «Reduce el tamaño de los eventos para mostrar más información» | `compactMode` | Siempre | `:387-396` |
| 19 | botón | «Restaurar predeterminados» (`RotateCcw`) | Solo estado local; **sin confirmación** | Siempre | `:403-410` |
| 20 | estado | «Hay cambios sin guardar» | Aviso | `hasChanges` | `:413-417` |
| 21 | botón | «Guardar cambios» / «Guardando...» | Persiste | Siempre | `:418-431` |

**Destino:** escribe en **dos** sitios y en este orden: primero `organizations.timezone`
(`configuracion/useCalendarSettings.ts:113-116`) y después `organization_settings` con
`key='calendar'` (`:122-152`). **Guarda:** botón. **Valida:** es **el único panel del módulo que
valida de verdad** — `isSupportedTimeZone` en cliente (`:97-101`) y el trigger
`trg_validate_org_timezone` contra `pg_timezone_names` en base; si la zona es inválida lanza
**antes** de tocar `organization_settings` para no dejarla a medias (`:93-111`). El resto de
campos no se valida.

**Riesgo:** llamadas directas a Supabase desde el navegador y **sin comprobación de permiso**;
cualquier miembro puede cambiar `organizations.timezone`, que es la fuente de verdad de
`fn_today_for_org` y por tanto de cierres de caja e informes de toda la organización.

---

## M. Panel «Timeline» — `panels/timeline/TimelineConfigPanel.tsx` (209 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | *(4 bloques de 256 px)* | Cargando | `loading` | `:133-141` |
| 2 | estado | «No se pudo cargar la configuración» + «Reintentar» | Error — **inalcanzable**: el servicio nunca devuelve `null` | `!settings` | `:143-155` |
| 3 | botón | «Exportar» | Descarga `timeline-config-{YYYY-MM-DD}.json` con el estado **en memoria**, incluidos los cambios sin guardar | Siempre | `:160-163`, `:99-111` |
| 4 | botón | «Importar» | `<input type=file>` → `JSON.parse` → reemplaza los ajustes y marca `hasChanges`. **Sin validación de esquema** | Siempre | `:164-167`, `:113-131` |
| 5 | botón | «Restablecer» | Abre `AlertDialog` | Siempre | `:168-171` |
| 6 | botón | «Guardar cambios» / «Guardando...» | Persiste | `disabled={!hasChanges \|\| saving}` | `:172-175` |
| 7 | estado | «Tienes cambios sin guardar. Haz clic en "Guardar cambios" para aplicarlos.» | Aviso | `hasChanges` | `:178-184` |
| 8 | texto | «Privacidad y Seguridad» · «Controla qué información se muestra en el timeline de auditoría.» | Tarjeta | Siempre | `timeline/configuracion/PrivacySettings.tsx:19-26` |
| 9 | toggle | «Mostrar payload completo» · «Permite ver todos los datos en el detalle de cada evento, incluyendo campos JSON.» | `showFullPayload` | Siempre | `:33-45` |
| 10 | toggle | «Ocultar datos sensibles» · «Enmascara automáticamente campos como contraseñas, tokens, tarjetas de crédito, etc.» | `hideSensitiveData` — **promete un enmascarado que no ocurre** | Siempre | `:53-65` |
| 11 | toggle | «Enmascarar nombres de usuarios» · «Muestra solo iniciales o IDs...» | `maskActorNames` | Siempre | `:73-85` |
| 12 | texto | «Nota: Estas configuraciones afectan la visualización para todos los usuarios de la organización...» | **Falso** (§T) | Siempre | `:89-94` |
| 13 | texto | «Fuentes Visibles» · «Selecciona qué tipos de eventos se muestran por defecto en el timeline.» + badge «{n} de {total}» | Tarjeta | Siempre | `SourcesSettings.tsx:44-54` |
| 14 | botón | «Seleccionar todas» · «Deseleccionar todas» | Marca/desmarca | Según estado | `:60-79` |
| 15 | toggle | 11 casillas: `ops_audit_log`, `finance_audit_log`, `products_audit_log`, `chat_audit_logs`, `roles_audit_log`, `transport_events`, `integration_events`, `electronic_invoicing_events`, `membership_events`, `attendance_events`, `message_events` (etiqueta visible + **nombre de tabla crudo** debajo) | `visibleSources[]` | Siempre | `:84-121` |
| 16 | estado | «Advertencia: No hay fuentes seleccionadas. El timeline no mostrará eventos.» | Aviso — **inexacto**: nada lo aplica | `visibleSources.length===0` | `:125-131` |
| 17 | texto | «Retención de Datos» | Tarjeta | Siempre | `RetentionSettings.tsx:20-26` |
| 18 | campo | «Período de retención» + `días` (`min=30 max=3650`) + «≈ {n} año(s)» / «≈ {n} meses» | `retentionDays` | Siempre | `:34-56` |
| 19 | toggle | «Archivar eventos antiguos» · «Los eventos que excedan el período de retención se mueven a un archivo de solo lectura.» | `archiveOldEvents` — **no existe ese archivo** | Siempre | `:66-78` |
| 20 | texto | «Importante: La retención de datos de auditoría puede estar sujeta a regulaciones legales...» + tiles «Retención actual» / «Archivado» («Activo»/«Inactivo») | Aviso + resumen | Siempre | `:82-107` |
| 21 | texto | «Rendimiento y UI» | Tarjeta | Siempre | `PerformanceSettings.tsx:27-33` |
| 22 | campo | Select «Rango de fechas por defecto»: «Hoy (1 día)» · «Última semana (7 días)» · «Últimas 2 semanas» · «Último mes (30 días)» · «Últimos 3 meses» | `defaultDateRangeDays` | Siempre | `:41-61` |
| 23 | campo | «Límite de exportación» + `registros` (`min=100 max=100000 step=1000`) | `maxExportRecords` | Siempre | `:71-88` |
| 24 | campo | Select «Eventos por página»: «25 eventos» · «50 eventos» · «100 eventos» · «200 eventos» | `defaultPageSize` | Siempre | `:99-118` |
| 25 | toggle | «Actualizaciones en tiempo real» | `enableRealTimeUpdates` | Siempre | `:128-140` |
| 26 | toggle | «Vista compacta» | `compactView` | Siempre | `:148-160` |
| 27 | toggle | «Mostrar enlaces de correlación» · «Muestra botones para ver eventos relacionados por correlation_id.» | `showCorrelationLinks` | Siempre | `:168-180` |
| 28 | diálogo | «¿Restablecer configuración?» · «Esto restablecerá todas las configuraciones del timeline a sus valores por defecto. Esta acción no se puede deshacer.» · «Cancelar» · «Restablecer» | Confirma | `resetDialogOpen` | `:193-206` |

**Destino:** `organization_settings` con `key='timeline'`, **13 claves + un `updatedAt` extra**.
**Guarda:** botón. **Valida:** **nada** en el servicio; los `min`/`max` son solo HTML, así que
`retentionDays: 1` y `maxExportRecords: 999999` se persisten tal cual. **Al fallar:** toast y
**`hasChanges` se queda en `true`**, de modo que los cambios se pierden al recargar; el diálogo
de restablecer **no se cierra** si falla (`:89`).

**Es el panel más engañoso del módulo: los 13 ajustes son escritura pura.**
`app/app/timeline/page.tsx:53-55` fija el rango con `subDays(new Date(), 7)` cableado y `:70`
pide `getEvents(orgId, filters, 1, 50)` con tamaño de página **50 cableado**. No importa
`timelineSettingsService` en ninguna parte. Y hay **0 filas** de la clave en toda la base.

**`organizationId` sin validar:** `getOrganizationId()` devuelve `0` como centinela y el panel
no comprueba `> 0` (`:30`), así que con `0` se insertaría una fila con `organization_id: 0`.

---

## N. Panel «Roles» — `panels/roles/RolesConfigPanel.tsx` (20 líneas)

Monta `components/admin/RolesConfigurationSettings.tsx` (521 líneas). Si `organization` es
`null` se queda en esqueleto indefinido (`:10-17`).

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `CardListSkeleton cards={4} columns="2"` | Cargando | `isLoading \|\| !organization` | `RolesConfigPanel.tsx:10-17` |
| 2 | texto | «Configuración del Sistema de Permisos» · «Gestiona las políticas y comportamiento del sistema de roles y permisos» | **Segunda cabecera** | Siempre | `admin/RolesConfigurationSettings.tsx:238-243` |
| 3 | botón | «Importar» (`Upload`) | `<input type=file>` → `JSON.parse` → `setConfig({...DEFAULT, ...imported})`. **Sin validación de esquema** pese al comentario que dice lo contrario | Siempre | `:246-254`, `:185-215` |
| 4 | botón | «Exportar» (`Download`) | Descarga `roles-config-{orgId}-{YYYY-MM-DD}.json` | Siempre | `:255-263`, `:169-183` |
| 5 | estado | «Tienes cambios sin guardar» · «Recuerda guardar los cambios para que se apliquen en el sistema» (`AlertTriangle`) | Aviso | `hasChanges` | `:268-280` |
| 6 | botón | «Descartar» (`RotateCcw`) | `setConfig(originalConfig)` — **sin confirmación** | `hasChanges` | `:282-290` |
| 7 | botón | «Guardar» / «Guardando...» | Persiste + escribe en `roles_audit_log` | `hasChanges` | `:291-308`, `:96-163` |
| 8 | texto | «Regla de Precedencia» → «Admin > Cargo > Rol» + «Los permisos de Admin tienen prioridad sobre Cargo, y Cargo sobre Rol» | Tarjeta informativa | Siempre | `:316-344` |
| 9 | badge | «Fijo» | Marca que la regla no es editable | Siempre | `:339-341` |
| 10 | toggle | «Permitir edición de permisos del sistema» | `allowEditSystemPermissions` | Siempre | `:363-376` |
| 11 | toggle | «Permitir duplicar roles del sistema» | `allowDuplicateSystemRoles` | Siempre | `:382-395` |
| 12 | toggle | «Modo estricto» | `strictMode` | Siempre | `:401-414` |
| 13 | toggle | «Heredar permisos del rol» | `inheritFromRole` | Siempre | `:420-433` |
| 14 | texto | «Estado Actual» + 4 indicadores «Permitido»/«Bloqueado»/«Activado»/«Desactivado» | Espejo de los 4 interruptores | Siempre | `:439-504` |
| 15 | botón | «Recargar» (`RotateCcw`) | `loadConfiguration()` | **Solo si `!hasChanges`** | `:507-518` |

**Destino:** `organization_settings` con `key='roles_configuration'`, columna `settings`, más un
`INSERT` en `roles_audit_log` (`entity='configuration'`, `entity_id=crypto.randomUUID()`,
`diff{old,new}`) en `:134-146`. **Guarda:** botón. **Valida:** nada. **Al fallar:** toast
genérico y `originalConfig` no se actualiza.

**Los 4 interruptores no tienen ningún efecto.** Grep de `roles_configuration`,
`allowEditSystemPermissions`, `allowDuplicateSystemRoles`, `inheritFromRole` y `strictMode` en
todo `src/`: **cero consumidores** fuera de este archivo. «Modo estricto» y «Permitir edición
de permisos del sistema» dan la falsa impresión de endurecer la seguridad. Y **0 filas** de la
clave en la base.

**Sin comprobación de permiso:** cualquier miembro puede cambiar «la configuración del sistema
de permisos» y escribir en el registro de auditoría de roles (`:65-146`, todo con el cliente
Supabase del navegador).

---

## O. Panel «Facturación Electrónica» — 4 archivos, 681 líneas

**Es el panel con el problema de seguridad más grave del módulo.**

### O.1 Los controles

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `CardListSkeleton cards={3}` | Cargando | `loading` | `FacturacionConfigPanel.tsx:217-224` |
| 2 | texto | «Credenciales de Factus» (`ShieldCheck`) · «Las credenciales se obtienen desde el panel de Factus. Use el ambiente sandbox para pruebas.» | Tarjeta | Siempre | `sections/CredencialesFactusSection.tsx:49-55` |
| 3 | campo | Select «Ambiente» → «Sandbox (Pruebas)» / «Producción» | `environment` — **no cambia nada real** (§O.3) | Siempre | `:60-70` |
| 4 | campo | Select «Proveedor» → «Factus» / «Carvajal» / «Siigo» / «Alegra» | `provider` — **tres opciones sin implementación** | Siempre | `:73-82` |
| 5 | campo | «Client ID» (placeholder `Ej: a2443431-24c0-4e4b-8289-dd7913d7d5a0`) | Texto plano visible | Siempre | `:87-88` |
| 6 | campo | «Client Secret» (`type="password"`, placeholder «Client Secret de Factus») | **Secreto, solo ofuscado visualmente** | Siempre | `:91-92` |
| 7 | campo | «Usuario / Email» (placeholder `Ej: sandboxv2@factus.com.co`) | Texto plano visible | Siempre | `:95-96` |
| 8 | campo | «Contraseña» (`type="password"`, placeholder «Contraseña de Factus») | **Secreto**; sin `autoComplete="new-password"` → el gestor de contraseñas puede ofrecer la personal | Siempre | `:99-100` |
| 9 | toggle | «Configuración activa» | `is_active` — **trampa**: al desactivarlo, `getConfig` filtra `is_active=true` y el panel aparece vacío; un «Guardar» posterior sobrescribe la fila con cadenas vacías | Siempre | `:104-105`; filtro en `lib/services/electronicInvoicingConfigService.ts:26` |
| 10 | toggle | «Facturar siempre como electrónica» + «Activa automáticamente el toggle de factura electrónica en POS, pre-cuenta y nuevas facturas» | `organization_preferences.settings.electronic_invoicing.always_enabled` — **instante** | Siempre | `:112-116` |
| 11 | botón | «Guardar» (`Save`) · «Probar conexión» (`TestTube`) | Upsert / `POST /api/factus/auth` | Siempre | `:120-127` |
| 12 | texto | «Rangos de Numeración DIAN» (`FileText`) · «Rangos de numeración para facturas, notas crédito, notas débito y documentos soporte.» | Tarjeta | Siempre | `sections/RangosDianSection.tsx:56-62` |
| 13 | texto | «Sincronizar rangos desde Factus» · «Consulta la API de Factus y guarda automáticamente todos los rangos.» | Banner | Siempre | `:68-69` |
| 14 | botón | «Sincronizar» (`Download`) | `GET /api/factus/numbering-ranges` + upsert fila a fila | `disabled={fetchingRanges}` | `:71-74` |
| 15 | texto | «Rangos configurados ({n}):» | Contador | Con rangos | `:79` |
| 16 | tabla | Lista **sin paginar**: badge «Activo»/«Inactivo», «{prefix} - {tipo}», «ID Factus: … \| Res: … \| {desde} - {hasta} \| Actual: {n}» | Rangos | Con rangos | `:81-103` |
| 17 | botón | *(icono `Edit`, **sin etiqueta accesible**)* | Abre el formulario de edición | Por fila | `:99-101` |
| 18 | estado | «No hay rangos configurados.» · «Presiona "Sincronizar" para obtener los rangos desde Factus automáticamente.» | Vacío — **también cuando el `select` falla** | Sin rangos | `:119-125` |
| 19 | texto | «Editando: {prefix} - {tipo}» + botón «Cancelar» (**descarta sin avisar**) | Cabecera del formulario | Editando | `sections/RangoEditForm.tsx:46-50` |
| 20 | campo + tooltip | «Prefijo» + tooltip «Prefijo del rango de numeración» / «Prefijo alfanumérico de máximo 4 caracteres que identifica el rango. Ej: FE, FV, SETP.» — **el tooltip dice 4 y la columna admite 10; no se valida** | `prefix` | Editando | `:55-65` |
| 21 | campo + tooltip | «ID de Rango en Factus» + tooltip «Identificador único que devuelve Factus al crear o listar rangos de numeración.» | `factus_numbering_range_id` | Editando | `:68-78` |
| 22 | campo | «Desde» · «Hasta» | `range_start` / `range_end` | Editando | `:84-89` |
| 23 | campo | «Número Actual» | `current_number` — **el consecutivo fiscal en uso, editable libremente** | Editando | `:92-93` |
| 24 | campo | «Número de Resolución DIAN» (placeholder `Ej: 18764000000000`) | `resolution_number` | Editando | `:99-100` |
| 25 | campo | «Fecha de Resolución» · «Válido Desde» · «Válido Hasta» (`type=date`) | `resolution_date`, `valid_from`, `valid_until` | Editando | `:103-115` |
| 26 | campo | «Clave Técnica» (placeholder «Clave técnica DIAN») | **Secreto DIAN en un input de texto plano** | Editando | `:121-122` |
| 27 | campo | «Test Set ID» | `test_set_id` | Editando | `:125-126` |
| 28 | toggle | «Rango activo» | `is_active` — **se sobrescribe en cada «Sincronizar»** con `!fr.is_expired` | Editando | `:131-132` |
| 29 | botón | «Guardar cambios» (`Save`) | `UPDATE invoice_sequences` | Editando | `:136-139` |
| 30 | texto | «Información» + 4 viñetas, una de ellas «Si no hay configuración por organización, se usan las variables de entorno (.env).» — **engañoso: SIEMPRE se usa el `.env`** | Tarjeta | Siempre | `FacturacionConfigPanel.tsx:264-274` |

### O.2 Las credenciales se leen y se escriben desde el navegador, en claro

| Aspecto | Hallazgo | Archivo:línea |
|---|---|---|
| Cliente Supabase | **Del navegador** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) | `lib/supabase/config.ts:182`, `:625` |
| Lectura | `select('*')` de `electronic_invoicing_config` | `lib/services/electronicInvoicingConfigService.ts:23-28` |
| Lectura → estado de React | `clientSecret: existing.client_secret`, `password: existing.password` | `FacturacionConfigPanel.tsx:76-81` |
| Escritura | `upsert({client_id, client_secret, username, password})` | `electronicInvoicingConfigService.ts:37-49` |
| ¿Se enmascaran? | **No.** Solo `type="password"`: el valor está en el DOM y en el estado | `CredencialesFactusSection.tsx:92`, `:100` |
| ¿Se releen en claro? | **Sí**, en cada montaje del panel | `FacturacionConfigPanel.tsx:74` → `:78-79` |
| ¿Permiso? | **Ninguno.** Solo `if (!orgId) return` | `:73`, `:104` |
| RLS | `ALL` para `public`, cualquier miembro de la organización **incluidos los desactivados** (no filtra `om.is_active`) | Política `Users can manage their org e-invoicing config` |
| Cifrado | **Ninguno**: `client_secret` y `password` son `text` | Esquema de `electronic_invoicing_config` |

### O.3 Y no sirven para nada: el panel es un almacén de secretos inútil

`factusTokenManager.getCredentials()` devuelve **solo variables de entorno**
(`lib/services/factusTokenManager.ts:17-21`, `:88-90`) y **ninguna ruta de `/api/factus/*` lee
`electronic_invoicing_config`**. Consecuencias:

1. Lo que se escribe en el panel **nunca autentica contra Factus**.
2. «Probar conexión» prueba las credenciales del `.env`, no las del formulario
   (`electronicInvoicingConfigService.ts:57-73` → `POST /api/factus/auth` sin cuerpo). **Se puede
   teclear cualquier cosa y obtener «Conexión exitosa».**
3. El selector «Ambiente» no cambia la URL base, que sale de `process.env.FACTUS_ENVIRONMENT`
   (`app/api/factus/numbering-ranges/route.ts:24-26`). El valor guardado solo etiqueta el ticket
   impreso (`components/pos/CheckoutDialog.tsx:1374-1388`).
4. Todas las organizaciones emiten con **la misma cuenta de Factus**, la de la plataforma.
5. La tabla tiene **0 filas**: el riesgo está latente, no materializado. Pero el panel invita a
   materializarlo.

Además, **`GET /api/factus/numbering-ranges` no tiene sesión** (`route.ts:5-53`): cualquier
visitante obtiene los rangos DIAN, las resoluciones y las claves técnicas. Es la ruta que
consume este panel, y quedó fuera del endurecimiento del 2026-09-22 que sí recibió
`/api/factus/auth` (`auth/route.ts:12-18`).

### O.4 Destino, guardado, validación, fallo

| Ajuste | Tabla · columna | Guarda | Valida | Al fallar |
|---|---|---|---|---|
| Credenciales Factus | `electronic_invoicing_config` (`provider, environment, client_id, client_secret, username, password, is_active`), `upsert` con `onConflict: organization_id,provider` | Botón «Guardar» | **Nada** (ni campos vacíos, ni formato de correo) | Toast destructivo con el `error.message` crudo de Postgres |
| «Facturar siempre» | `organization_preferences.settings.electronic_invoicing.always_enabled` | **Instante** | No | Toast; el interruptor parpadea y revierte sin explicación |
| Rango DIAN (manual) | `invoice_sequences` (15 columnas) | Botón «Guardar cambios» | **Nada** en cliente; solo los CHECK de la base | Toast con el error crudo |
| Sincronización Factus | `invoice_sequences`, fila a fila | Botón «Sincronizar» | No | **Los errores de `update`/`insert` se ignoran** (`:152`, `:155`): el toast de éxito miente |

### O.5 Otros defectos del panel

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | **Esqueleto eterno sin organización**: `if (!orgId) return;` sale de `loadConfig` **sin** `setLoading(false)`, y `getOrganizationId()` devuelve `0` como centinela | `FacturacionConfigPanel.tsx:73` frente a `:98` |
| 2 | **Esqueleto eterno ante error de red**: `loadConfig` no tiene `try/catch` y no hay estado de error en todo el panel | `:71-101` |
| 3 | **`branch_id` cableado a `2`**: `parseInt(localStorage.getItem('currentBranchId') \|\| '2', 10)` | `:138`, `:189` |
| 4 | **`adjustment_note` viola el CHECK de la base** (`invoice_sequences_document_type_check` solo admite 4 valores) y el error se descarta | `:17` frente al esquema; error ignorado en `:155` |
| 5 | Fallback silencioso a `'invoice'` para cualquier documento no mapeado → colisión con la clave única | `:141` |
| 6 | `is_active` lo decide el proveedor: `!fr.is_expired` sobrescribe cualquier activación manual | `:148` |
| 7 | Fechas de vigencia **sin normalizar**: `valid_from: fr.start_date` se escribe cruda desde la API de Factus; si no llega como `YYYY-MM-DD`, el `<input type=date>` queda vacío y un guardado posterior escribe `null` y **borra la vigencia DIAN en silencio** | `:146-147`, `:179`; `RangoEditForm.tsx:111`, `:115`; `\|\| null` en `:194-195` |
| 8 | Sin validación de `validFrom <= validUntil`, `rangeStart <= rangeEnd` ni `currentNumber` dentro del rango | `RangoEditForm.tsx:85-115` |
| 9 | `Number(e.target.value)` con el campo vacío produce `0`: un campo borrado se guarda como cero | `RangoEditForm.tsx:85,89,93` |
| 10 | Sin campo para `alert_threshold`, que existe en la tabla | `invoice_sequences` |
| 11 | Sin paginación: `select('*')` sin `.limit()` y la lista se renderiza entera | `:84`, `:159`, `:212`; render `RangosDianSection.tsx:81-103` |
| 12 | La rama de `insert` de un rango (`range.id === null`) es **código inalcanzable**: no hay botón «Añadir rango» | `:204`; `:174` |

---

## P. Panel «Gym» — `panels/gym/GymConfigPanel.tsx` (156 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `CardListSkeleton cards={4}` | Cargando — **puede quedarse para siempre**: si no hay organización, `loadSettings` sale antes de tocar `isLoading` | `isLoading` | `:111-118`, `:41-54` |
| 2 | botón | *(icono `ArrowLeft`, **sin `aria-label`**)* | Navega a `/app/gym` — **saca al usuario del panel de Configuración** | Siempre | `gym/ajustes/SettingsHeader.tsx:27-31` |
| 3 | texto | «Ajustes» + miga «Gimnasio / Ajustes» | **Segunda cabecera** | Siempre | `SettingsHeader.tsx:37-40` |
| 4 | botón | «Actualizar» | `loadSettings()` — **descarta cambios sin avisar** | Siempre | `:45-53` |
| 5 | botón | «Restablecer» | Abre diálogo | Siempre | `:54-62` |
| 6 | botón | «Guardar Cambios» / «Guardando...» | Persiste | `disabled={!hasChanges \|\| isSaving}` | `:63-71` |
| 7 | texto | «Reglas de Acceso» · «Configura las políticas de acceso al gimnasio» | Tarjeta | Siempre | `ajustes/AccessRulesCard.tsx:21-25` |
| 8 | toggle | «Requerir membresía activa» · «Solo permite check-in a miembros con membresía vigente» | `accessRules.requireActiveMembreship` *(typo en la clave)* | Siempre | `:30-38` |
| 9 | toggle | «Permitir acceso de invitados» · «Permite registro de invitados sin membresía» | `allowGuestAccess` | Siempre | `:43-51` |
| 10 | toggle | «Bloquear miembros expirados» · «Impide el acceso a miembros con membresía vencida» | `blockExpiredMembers` | Siempre | `:56-64` |
| 11 | toggle | «Permitir múltiples check-ins por día» · «Permite que un miembro haga check-in más de una vez al día» | `allowMultipleCheckinsPerDay` — **contradice #13 sin validación cruzada** | Siempre | `:69-77` |
| 12 | toggle | «Verificación con foto» · «Requiere verificar la foto del miembro en el check-in» | `requirePhotoVerification` | Siempre | `:82-90` |
| 13 | campo | «Máximo check-ins diarios» · «Límite de check-ins por miembro al día» | `maxDailyCheckins` | Siempre | `:95-107` |
| 14 | texto | «Tolerancias» · «Configura los tiempos de tolerancia para accesos y vencimientos» | Tarjeta | Siempre | `ToleranceCard.tsx:20-24` |
| 15 | campo | «Check-in anticipado (minutos)» · «Minutos antes de la hora de apertura para permitir check-in» | `earlyCheckinMinutes` | Siempre | `:29-39` |
| 16 | campo | «Check-in tardío (minutos)» · «Minutos después de la hora de cierre para permitir check-in» | `lateCheckinMinutes` | Siempre | `:43-53` |
| 17 | campo | «Período de gracia (días)» · «Días de gracia después del vencimiento de membresía» | `gracePeroidDays` *(typo en la clave)* | Siempre | `:57-67` |
| 18 | campo | «Aviso de vencimiento (días)» · «Días antes del vencimiento para mostrar alertas» | `expirationWarningDays` | Siempre | `:71-81` |
| 19 | texto | «Métodos de Check-in» · «Habilita los métodos de check-in disponibles en tu gimnasio» | Tarjeta | Siempre | `CheckinMethodsCard.tsx:53-57` |
| 20-24 | toggle | «Código QR» · «Búsqueda manual» · «Huella digital» · «Lector de tarjetas» · «Reconocimiento facial» (con sus subtítulos) | `checkinMethods.*` — **tres prometen biometría y hardware que no existen** | Siempre | `:17-45`, `:75-78` |
| 25 | texto | «Reglas de Clases» · «Configura las políticas para reservaciones de clases grupales» | Tarjeta | Siempre | `ClassRulesCard.tsx:21-25` |
| 26 | campo | «Máximo reservaciones por semana» · «Límite de clases que un miembro puede reservar por semana» | `maxReservationsPerWeek` | Siempre | `:30-40` |
| 27 | campo | «Límite de cancelación (horas)» · «Horas antes de la clase para permitir cancelación sin penalización» | `cancellationHoursLimit` | Siempre | `:44-54` |
| 28 | campo | «Penalización por no asistir (días)» · «Días de bloqueo de reservaciones por no asistir» | `noShowPenaltyDays` | Siempre | `:58-68` |
| 29 | toggle | «Habilitar lista de espera» · «Permite a los miembros unirse a lista de espera cuando la clase está llena» | `waitlistEnabled` | Siempre | `:74-82` |
| 30 | toggle | «Auto-confirmar reservaciones» · «Las reservaciones se confirman automáticamente sin aprobación» | `autoConfirmReservations` | Siempre | `:87-95` |
| 31 | texto | «Mensajes Personalizados» · «Configura los mensajes que se muestran a los miembros» | Tarjeta | Siempre | `MessagesCard.tsx:20-24` |
| 32-35 | campo | 4 `RichTextEditor`: «Mensaje de bienvenida» · «Mensaje de membresía expirada» · «Mensaje de acceso bloqueado» · «Recordatorio de renovación» | `messages.*` — **guardan HTML sin sanear** | Siempre | `:28-64` |
| 36 | texto | «Notificaciones» · «Configura las notificaciones automáticas para los miembros» | Tarjeta | Siempre | `NotificationsCard.tsx:21-25` |
| 37-39 | toggle | «Recordatorio de vencimiento» · «Confirmación de check-in» · «Recordatorio de clases» | `notifications.*` | Siempre | `:30-64` |
| 40 | campo | «Horas de anticipación para recordatorio» · «Cuántas horas antes enviar el recordatorio de clases» | `reminderHoursBefore` | Siempre | `:69-77` |
| 41 | diálogo | «Restablecer Configuración» · «¿Estás seguro de que deseas restablecer toda la configuración a los valores por defecto? Esta acción no se puede deshacer.» · «Cancelar» · «Restablecer» | Confirma; **persiste los defaults al instante** | `showResetDialog` | `:140-150` |

**Destino:** la tabla **`settings`** (no `organization_settings`) con `key='gym_settings'`, **28
claves**. **Guarda:** botón, **y sin aviso de cambios sin guardar** (Parking sí lo tiene).
**Valida:** nada. **Al fallar en la lectura:** se traga el error y devuelve los defaults
(`lib/services/gymSettingsService.ts:115-118`).

**0 filas y 0 lectores.** El check-in real tiene las reglas cableadas: el aviso de vencimiento
está fijado en 7 días (`lib/services/gymCheckinService.ts:265`) y la decisión se toma con
`m.status` y `end_date` (`:266-283`), sin mirar ni un ajuste.

**Defecto adicional:** `getGymSettings` hace un `merge` de un solo nivel
(`gymSettingsService.ts:111-114`); si el JSON guardado tiene un grupo incompleto, los campos
faltantes quedan `undefined` y los `Switch`/`Input` pasan de controlados a no controlados.
Parking sí mergea dos niveles (`parkingConfigService.ts:220-230`).

---

## Q. Panel «Notificaciones» — `panels/notificaciones/NotificacionesConfigPanel.tsx` (132 líneas)

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | `PageHeaderSkeleton` + `CardListSkeleton cards={4} columns="2"` | Bloquea el panel | `!organizationId \|\| !userId` | `:87-94` |
| 2 | botón | *(icono `ArrowLeft`, sin texto accesible)* → `/app/notificaciones` | **Saca al usuario del panel** | Siempre | `notificaciones/preferencias/PreferenciasHeader.tsx:28-33` |
| 3 | texto | «Preferencias de Notificación» · «Configura cómo y cuándo recibir notificaciones» | **Segunda cabecera**, además `sticky` dentro de un `<main overflow-y-auto>` | Siempre | `PreferenciasHeader.tsx:24`, `:38-42` |
| 4 | texto | « · Todas silenciadas» (rojo) | Indicador | `isMutedAll` | `:43-45` |
| 5 | botón | «Actualizar» (`RefreshCw`) | Recarga | `disabled` mientras carga | `:50-59` |
| 6 | botón | «Restablecer» (ámbar, `RotateCcw`) | **`confirm()` nativo** | Siempre | `:60-68` |
| 7 | diálogo | **`confirm()` del navegador**: «¿Restablecer todas las preferencias a sus valores por defecto?» | Bloquea el hilo | Al pulsar #6 | **`NotificacionesConfigPanel.tsx:75`** |
| 8 | estado | «No hay preferencias configuradas» (`Settings2`) | Vacío | `preferences.length===0` | `:112-116` |
| 9 | texto | «Todas las notificaciones silenciadas» / «Notificaciones activas» + «No recibirás ninguna notificación en ningún canal» / «Recibes notificaciones según la configuración de cada canal» | Tarjeta global | Con preferencias | `preferencias/MuteGlobal.tsx:33-39` |
| 10 | toggle | Switch global, **sin etiqueta y con lógica invertida** (`checked={!isMutedAll}`) | `mute` de **todas** las filas — instante | Con preferencias | `MuteGlobal.tsx:43-47` |
| 11 | texto | «Configuración por canal» | Título | Siempre | `:121` |
| 12-17 | texto | 6 tarjetas: «In-App» («Notificaciones dentro de la aplicación») · «Email» («Correos electrónicos») · «SMS» («Mensajes de texto») · «Push» («Notificaciones push en el navegador») · «WhatsApp» («Mensajes por WhatsApp») · «Webhook» («Llamadas HTTP a endpoints externos») | Una por canal | Por fila | `preferencias/types.ts:21-28`; render `CanalPreferencia.tsx:92,109` |
| 18 | badge | «Mute» (`VolumeX`) · «DND» (`Clock`) · «{n} tipos» | Estado | Según el canal | `CanalPreferencia.tsx:93-107` |
| 19 | toggle | Switch por canal, **sin etiqueta, invertido** | `mute` — instante | Por canal | `:114-117` |
| 20 | botón | *(chevron, sin texto)* | Abre el detalle | Por canal | `:118-125` |
| 21 | texto | «Horario No Molestar» (`Clock`) | Título | Expandido | `:135-138` |
| 22 | campo | «Desde» · «Hasta» (`type=time`) | `dnd_start`/`dnd_end` — **instante, en cada pulsación, sin `debounce`** | Expandido | `:141-157` |
| 23 | botón | «Limpiar» (rojo) | Pone ambos a `null` | Expandido con DND | `:159-163` |
| 24 | texto | «No recibirás notificaciones de este canal durante ese horario.» | Ayuda | Expandido | `:165-167` |
| 25 | texto | «Tipos de notificación permitidos» · «Si no seleccionas ninguno, recibirás todos los tipos. Si seleccionas algunos, solo recibirás esos.» | Título | Expandido | `:172-177` |
| 26 | chip | 12 chips: «Alertas del sistema» · «Stock bajo» · «Pagos y cobros» · «Facturas» · «Reservaciones» · «Tareas asignadas» · «Calendario» · «CRM / Oportunidades» · «HRM / Nómina» · «POS / Caja» · «Miembros y roles» · «Pruebas de canal» | `allowed_types[]` — instante, **un viaje al servidor por chip** | Expandido | `types.ts:30-43`; render `:179-195` |

**Destino:** `user_notification_preferences`, clave `(user_id, channel)`. **La tabla no tiene
`organization_id`.** El panel obtiene `organizationId` (`:18`) y **solo lo usa como guarda de
render** (`:87`). **Guarda:** todo al instante. **Valida:** nada (no comprueba `dnd_start <
dnd_end`, ni formato, ni que ambos estén puestos). **Al fallar:** toast «No se pudo
actualizar.»; `handleMuteAll` actualiza el array entero de forma optimista sin recargar, así que
si el `UPDATE` afectó a 0 filas por RLS **la interfaz miente hasta el siguiente refresco**
(`:62-71`).

**Escribe en la base solo por abrirse:** `ensureAllChannels` siembra las 6 filas del usuario en
un bucle secuencial de hasta 6 `upsert` (`preferencias/PreferenciasService.ts:23-51`, disparo en
`:31`).

**Nada de esto se aplica.** `allowed_types` no lo lee nadie; `mute` y `dnd_*` solo los lee
`components/profile/NotificacionesSection.tsx` **para repintarlos**. Los RPC
`get_user_notification_preferences` y `save_user_notification_preferences` no tienen ni un
llamante, y `BandejaService.getUserPreferences` (`BandejaService.ts:211`) tampoco.

---

## R. Panel «Datos sin conexión» — `panels/datos-offline/DatosOfflinePanel.tsx` (190 líneas)

`desktopOnly: true` y `isCore: true`: solo aparece dentro de Go Admin Desktop. **No escribe
ningún ajuste**; es lectura y dos acciones.

| # | Tipo | Etiqueta exacta | Qué hace | Cuándo aparece | Archivo:línea |
|---|---|---|---|---|---|
| 1 | estado | «Datos sin conexión» · «Esta función es de Go Admin Desktop. Desde el navegador la aplicación siempre necesita internet.» | Corta el render | En el navegador | `:65-74` |
| 2 | texto | «Datos sin conexión» · «Copia local de los datos de la organización... los últimos {WINDOW_MONTHS} meses...» | Cabecera | Desktop | `:85-90` |
| 3 | texto | «Estado» → «Con conexión» / «Sin conexión (leyendo datos locales)» | Dato | Siempre | `:95-96` |
| 4 | texto | «Última replicación» (`—` si nunca) | Dato | Siempre | `:99-100` |
| 5 | texto | «Filas locales» → «N en X/Y tablas» | Dato | Siempre | `:103-104` |
| 6 | texto | «Tamaño estimado» | Dato | Siempre | `:107-108` |
| 7 | texto | «Catálogo del POS: N productos · N clientes · actualizado ...» | Estado del catálogo | Con catálogo | `:111-115` |
| 8 | botón | «Sincronizar ahora» / «Sincronizando…» | Réplica incremental | `disabled` sin conexión | `:117-120` |
| 9 | botón | «Replicación completa» | Pasada completa con poda | Ídem | `:121-123` |
| 10 | estado | «Sin conexión: se actualizará al volver la red.» | Aviso | `!isOnline` | `:124` |
| 11 | estado | `{offline.error}` (`role="alert"`) | Error | Con error | `:125` |
| 12 | badge | «N tabla con aviso» / «N tablas con aviso» | Contador | `tablesWithError > 0` | `:126-130` |
| 13 | texto | 7 tarjetas de grupo: «Inventario» · «Ventas» · «Finanzas» · «Compras» · «Clientes» · «Organización» · «Catálogos» | Agrupa el manifiesto | Por grupo presente | `:15-25`, `:135-139` |
| 14 | tabla | «Entidad» · «Filas» · «Última replicación» · «Ventana / tope» · «Estado» | Detalle por tabla | Por grupo | `:144-148` |
| 15 | badge + tooltip | Chip de error con `title={meta.error}` (`line-clamp-2`) / «Al día» / «Pendiente» | Estado por tabla | Por fila | `:167-177` |
| 16 | texto | «{n} meses · máx. {N}» | Ventana y tope | Por fila | `:163-165` |

**Es el único panel que muestra fechas y lo hace bien**: `when()` usa `useFormatDate()` (zona
de la organización) y compara con `getToday()` (`:47-53`). No hay `toISOString().split('T')[0]`
ni `toLocaleDateString` sin zona.

**Al fallar:** `syncNow` captura el error y lo expone en el hook
(`lib/offline/useOfflineData.ts:91-93`), renderizado en `:125`. Sin toast.

---

## S. Conteo de controles por panel

«Filas» = filas de las tablas de esta auditoría (varios controles homogéneos —los 7 días del
horario de Parking, las 12 categorías de proveedor— van en una sola fila). «Controles» =
estimación desagregada de elementos accionables o visibles distintos. «Escrituras» = ajustes
que el panel persiste.

| § | Panel | Archivos | Líneas | Filas | Controles | Escrituras | Diálogos |
|---|---|---|---|---|---|---|---|
| A | Contenedor `/app/configuracion` | 10 | 631 | 9 | 25 (16 pestañas + 9) | 0 | 0 |
| A.4 | Asistente `/app/configuracion/asistente` | 1 | 158 | 12 | 12 | 1 | 1 |
| C | General *(shell de 5 pestañas)* | 1 | 142 | 10 | 10 | 0 propias | 0 propios |
| D | Sitio Web | 1 + 7 pestañas | 380 | 25 | ≈95 | ≈40 columnas | 3 (+1 `confirm()`) |
| E | **CRM** | **19** | **4.616** | **≈150** | **≈504** | **≈90** | **20** |
| E.1 | · shell de 6 pestañas | 1 | 88 | 7 | 7 | 0 | 0 |
| E.2 | · General (canales, etiquetas, llaves, widget, 8 tarjetas) | 1 | 838 | 30 | ≈60 | 8 | 7 |
| E.3 | · Telefonía | 4 | 623 | 30 | ≈45 | 12 | 0 |
| E.4 | · Proveedores e IA | 4 | 487 | 21 | ≈60 (12 categorías) | 4 + N | 1 |
| E.5 | · Email | 8 | 555 | 33 | ≈55 | 18 | 3 |
| E.6 | · WhatsApp | 1 | 146 | 16 | ≈40 | 7 | 0 |
| E.7 | · Créditos y sistema *(solo lectura)* | 1 | 228 | 15 | 15 | 0 | 0 |
| E.8-15 | · los 8 modales | 25 | ≈2.400 | ≈52 | ≈352 | ≈40 | 9 |
| F | Recursos Humanos | 1 + 2 | 184 | 21 | 21 | 8 | 0 |
| G | PMS Hotel | 1 + 5 | 112 | 27 | 27 | 18 | 0 |
| H | POS *(ver §D.17 de la auditoría de POS)* | 1 + ~25 | 7 (+ el módulo) | ≈249 | ≈120 | 6 claves + 5 tablas | 6 |
| I | Chat | 1 + 9 | 422 | 25 | ≈75 | 12 | 6 |
| J | Integraciones | 1 + 4 | 150 | 47 | 47 | 19 | 1 |
| K | Parking | 1 + 6 | 160 | 42 | ≈60 | 34 (+5 sin interfaz) | 1 |
| L | Calendario | 1 + 1 | 50 | 21 | ≈35 | 11 | 0 |
| M | Timeline | 1 + 4 | 209 | 28 | ≈40 | 13 | 1 |
| N | Roles | 1 + 1 | 20 | 15 | 15 | 5 | 0 |
| O | Facturación Electrónica | 4 | 681 | 30 | 30 | 6 + 15 columnas | 0 |
| P | Gym | 1 + 6 | 156 | 41 | ≈45 | 28 | 1 |
| Q | Notificaciones | 1 + 3 | 132 | 26 | ≈45 (6 canales × …) | 4 × 6 canales | 1 (`confirm()`) |
| R | Datos sin conexión | 1 | 190 | 16 | ≈30 | 0 | 0 |
| — | **Total** | **≈110** | **≈8.400** | **≈750** | **≈1.290** | **≈320** | **≈41** |

**Lo que dice el conteo:** CRM concentra **el 55 % de la superficie** (4.616 de 8.400 líneas,
≈504 de ≈1.290 controles) y los ocho paneles pequeños —Roles, Calendario, HRM, PMS, Gym,
Parking, Integraciones, Timeline— suman ≈275 controles de los cuales **≈130 no los lee nadie**
(§U).

---

## T. Lo roto o sin efecto

### T.1 Interruptores y ajustes que persisten pero no hacen nada

| # | Qué | Cuántos | Archivo:línea |
|---|---|---|---|
| 1 | **Parking** — toda la configuración. La operación usa `parking_rates.grace_period_min` y `parking_rates.lost_ticket_fee`, con una constante de 50.000 en código | **34 claves** | `lib/services/parkingConfigService.ts:116`; consumidor real `components/parking/operacion/ExitDialog.tsx:67`, `:124` |
| 2 | **Gym** — toda la configuración. El check-in cablea el aviso de vencimiento a 7 días y decide con `m.status` y `end_date` | **28 claves** | `lib/services/gymSettingsService.ts:100`; `lib/services/gymCheckinService.ts:265`, `:266-283` |
| 3 | **PMS** — toda la configuración. «Confirmar reservas automáticamente», «Permitir overbooking», «Asignación automática de limpieza» y los dos correos describen automatismos que no existen | **18 claves** | `lib/services/pmsSettingsService.ts:55` |
| 4 | **Integraciones** — las 19 claves. Los 4 interruptores de «Funcionalidades» prometen deshabilitar características y **no deshabilitan nada**: los enlaces a webhooks, API keys y mapeos están en el mismo panel. Los 5 «Límites» no se aplican en ningún `insert` | **19 claves** | `lib/services/integrationsService.ts:2996`; enlaces en `DocumentationSection.tsx:42-54` |
| 5 | **Timeline** — las 13 claves. `app/app/timeline/page.tsx:53-55` cablea el rango a 7 días y `:70` el tamaño de página a 50 | **13 claves** | `lib/services/timelineSettingsService.ts` frente a `app/app/timeline/page.tsx:53-70` |
| 6 | **Roles** — los 4 interruptores. Cero consumidores de `strictMode`, `allowEditSystemPermissions`, `allowDuplicateSystemRoles` e `inheritFromRole` en todo `src/` | **4 claves** | `components/admin/RolesConfigurationSettings.tsx:370,389,408,427` |
| 7 | **Notificaciones** — `allowed_types` (12 chips) no lo lee nadie; `mute` y `dnd_*` solo los repinta el perfil. Los RPC `get_user_notification_preferences` y `save_user_notification_preferences` no tienen llamantes | **3 columnas × 6 canales** | `preferencias/PreferenciasService.ts`; perfil `components/profile/NotificacionesSection.tsx:36-44` |
| 8 | **Facturación** — las credenciales de Factus. El servidor usa **solo variables de entorno** | **6 campos** | `lib/services/factusTokenManager.ts:17-21`, `:88-90` |
| 9 | **Facturación** — «Ambiente» (Sandbox/Producción). La URL base sale de `FACTUS_ENVIRONMENT` | 1 | `app/api/factus/numbering-ranges/route.ts:24-26` |
| 10 | **Facturación** — «Proveedor» ofrece «Carvajal», «Siigo» y «Alegra», **sin implementación**; además cambiar de proveedor crea una fila paralela por el `onConflict: organization_id,provider` | 3 opciones | `CredencialesFactusSection.tsx:74-82` |
| 11 | **HRM** — «Frecuencia de Pago» y «Política de Horas Extra» son `disabled` y su valor es un literal inyectado; no hay columna ni DTO | 2 | `hrm/configuracion/SettingsForm.tsx:170-209`; `lib/services/hrmConfigService.ts:180-181` |
| 12 | **Parking** — la sección `printing` (5 claves) **se persiste en cada guardado y no tiene ningún control** | 5 | `parkingConfigService.ts:45-52`, `:100-106` |
| 13 | **Verticales (CRM)** — el switch «Activa» del diálogo **se ignora al crear**: `verticalsService.create` cablea `is_active: true` | 1 | `VerticalsManager.tsx:265-270` + `lib/services/.../verticalsService.ts:111` |
| 14 | **Scoring (CRM)** — los campos `Max` de «Frio», «Tibio» y «Caliente» y el `Min` de «Frio» son editables y **`deriveTemperature` solo usa `hot.min` y `warm.min`** | 4 | `ScoringConfigurator.tsx:313-322` frente a `scoringService.ts:368-380` |
| 15 | **Roles (CRM)** — `sales_roles.sort_order` se envía siempre y **no hay control para editarlo**: todo queda en 0 | 1 | `useRoles.ts:104`; sin control en `RoleDialog.tsx` |

**Total: ≈130 ajustes que el usuario acciona, que la aplicación guarda y que no cambian nada.**

### T.2 Textos que mienten

| # | Texto | Por qué miente | Archivo:línea |
|---|---|---|---|
| 1 | «Nota: Estas configuraciones afectan la visualización para todos los usuarios de la organización...» | Nadie lee los ajustes de Timeline | `timeline/configuracion/PrivacySettings.tsx:89-94` |
| 2 | «Enmascara automáticamente campos como contraseñas, tokens, tarjetas de crédito, etc.» | No hay ningún enmascarado | `PrivacySettings.tsx:53-65` |
| 3 | «Advertencia: No hay fuentes seleccionadas. El timeline no mostrará eventos.» | Los muestra igual | `SourcesSettings.tsx:125-131` |
| 4 | «Los eventos que excedan el período de retención se mueven a un archivo de solo lectura.» | No existe ese archivo ni el job | `RetentionSettings.tsx:66-78` |
| 5 | «Si no hay configuración por organización, se usan las variables de entorno (.env).» | **Siempre** se usan las variables de entorno | `FacturacionConfigPanel.tsx:272` |
| 6 | «Conexión exitosa» tras «Probar conexión» | Prueba las credenciales del `.env`, no las tecleadas | `electronicInvoicingConfigService.ts:57-73` |
| 7 | «Esta es la única vez que verás la llave completa...» | El «hash» es `btoa()`, reversible: la llave se recupera con un `atob` | `llaves-api/ApiKeyDialog.tsx:124` frente a `inboxConfigService.ts:418-423` |
| 8 | «Las tasas de cambio se pueden configurar manualmente o auto-actualizar» | No hay interfaz para `auto_update` | `HRMConfigPanel.tsx:174` |
| 9 | «Override actualizado» | El servicio siempre hace `INSERT`: se crea una fila duplicada | `CommissionsPanel.tsx:131` frente a `commissionService.ts:271-276` |
| 10 | «Esta acción eliminará el equipo "{name}" y todos sus miembros.» | `deleteTeam` solo borra la fila del equipo; depende de un `ON DELETE CASCADE` que esta capa no declara | `TeamsSection.tsx:79` frente a `dbTeams.ts:79` |
| 11 | «{n} rangos sincronizados» | Los errores de `update`/`insert` del bucle se ignoran | `FacturacionConfigPanel.tsx:152`, `:155`, `:161` |
| 12 | «Actualizado · Las configuraciones han sido recargadas» | Se muestra también cuando la carga falló | `PMSConfigPanel.tsx:54` |
| 13 | Tooltip «Prefijo alfanumérico de máximo 4 caracteres» | La columna admite 10 y no se valida | `RangoEditForm.tsx:57-63` |
| 14 | «Referidos registrados ({n})» con `n` hasta 200 | Solo se pintan 10, sin «ver más» ni aviso | `ReferralsProgramCard.tsx:87` frente a `:100` |
| 15 | «Rota las API keys regularmente por seguridad» | Ningún endpoint valida las llaves emitidas: `key_hash` se escribe y nunca se lee | `DocumentationSection.tsx:109-117`; grep de `key_hash` |

### T.3 `confirm()` y `alert()` del navegador

| Archivo:línea | Texto | Alcanzable desde |
|---|---|---|
| `panels/notificaciones/NotificacionesConfigPanel.tsx:75` | «¿Restablecer todas las preferencias a sus valores por defecto?» | Configuración › Notificaciones, botón «Restablecer» |
| `panels/crm/sections/CommissionsPanel.tsx:105` | «¿Estás seguro de eliminar este override de comisión?» | Configuración › CRM › «Vendedores y Comisiones» |
| `components/organization/branding/editor/MenuGroupManager.tsx:92` | «¿Eliminar este menú y todos sus items?» | Configuración › Sitio Web › Páginas |
| `components/organization/MembersTab.tsx:301` | `confirm(t('confirmRemove'))` | Configuración › General › Miembros |
| `components/organization/PaymentMethodCard.tsx:83` | `confirm(t('confirmDelete'))` | Árbol de organización |
| `components/organization/PlanTab.tsx:383`, `:446` | `alert(t('reactivated'))`, `alert(result.message)` | Árbol de organización |

**Siete diálogos nativos**, en un módulo donde el resto ya usa `AlertDialog`/`ConfirmDialog`.

### T.4 Secretos y credenciales en el navegador

| # | Severidad | Hallazgo | Archivo:línea |
|---|---|---|---|
| 1 | **Crítico** | **Credenciales de Factus (`client_secret`, `password`) se leen con `select('*')` y se escriben con `upsert` desde el navegador, en claro, sin permiso, y se releen en claro en cada montaje.** La RLS permite `ALL` a cualquier miembro **incluidos los desactivados** | `lib/services/electronicInvoicingConfigService.ts:23-49`; `FacturacionConfigPanel.tsx:76-81` |
| 2 | **Crítico** | **Las llaves de API del chat y del CRM se generan con `Math.random()`** (no CSPRNG) **en el navegador** | `lib/services/inboxConfigService.ts:409-416` |
| 3 | **Crítico** | **`key_hash` no es un hash: es `btoa(key)`**, Base64 reversible. Quien pueda leer `channel_api_keys` recupera la llave en claro | `inboxConfigService.ts:418-423` |
| 4 | **Alto** | **Webhook de Slack en texto plano** dentro de `organization_settings.settings`, tabla cuya RLS permite leer y escribir a **cualquier miembro activo** | `integraciones/configuracion/SettingsForm.tsx:309-319` |
| 5 | **Alto** | **Clave técnica DIAN** en un `<input>` de texto plano (ni siquiera `type="password"`) | `sections/RangoEditForm.tsx:121-122` |
| 6 | **Alto** | **`GET /api/factus/numbering-ranges` sin sesión**: expone rangos, resoluciones y claves técnicas a cualquiera | `app/api/factus/numbering-ranges/route.ts:5-53` |
| 7 | **Alto** | `integrationsService` es `'use client'` y contiene, en el bundle del navegador, escrituras de `integration_credentials` con `secret_ref` y **generación de secretos de webhook en el cliente** | `integrationsService.ts:655-665`, `:1392-1442`, `:2966-2976` |
| 8 | **Alto** | **`custom_scripts` sin sanear** → XSS almacenado en el sitio público de la organización | `branding/BrandingAdvancedTab.tsx:142-157`; `websiteSettingsService.ts:742-766` |
| 9 | Medio | **Rotación de llave no atómica** (revoca y luego crea) y, en el CRM, **la nueva `rawKey` se descarta**: el usuario revoca su llave de producción y nunca ve la nueva | `inboxConfigService.ts:399-406`; `CRMConfigPanel.tsx:349-364` |
| 10 | Medio | El campo «Contraseña» de Factus **no lleva `autoComplete="new-password"`**: el gestor de contraseñas puede ofrecer la personal del usuario | `CredencialesFactusSection.tsx:99-100` |

**Contraejemplo correcto, que debe ser el patrón:** `ProviderCredentialForm` +
`ProviderCard` + `PUT /api/crm/config/providers` — `type="password"`,
`autoComplete="new-password"`, **nunca se releen en claro**, se muestran como `clave=••••`, y el
servidor cifra y valida (§E.4).

### T.5 Permisos

| Panel | Comprobación | Veredicto |
|---|---|---|
| Contenedor | Solo módulo activo | **Ninguna de permiso** |
| General | `isOrgAdmin` = `userRole === 1 \|\| 2` (`useOrgAdmin.ts:121`) | Por **id de rol**, solo en interfaz |
| Sitio Web | Ninguna; el motivo se **adivina** en un mensaje: «Verifica permisos (rol owner o admin).» | Ninguna |
| CRM › General y los 8 modales | Ninguna en 838 + 2.400 líneas | **Ninguna** |
| CRM › Telefonía, Proveedores, Email, WhatsApp | `can_edit`/`is_admin` del servidor por id de rol | ✔ |
| CRM › Créditos | El endpoint **no exige administrador** | Ninguna |
| CRM › Referidos | El servidor devuelve `can_manage` y **el componente no lo usa** | Disponible y sin cablear |
| HRM, PMS, Chat, Integraciones, Parking, Calendario, Timeline, Roles, Gym, Facturación | Ninguna | **Ninguna** |
| Notificaciones | Ninguna, pero la RLS es `user_id = auth.uid()` | Inocuo |
| Asistente | `isOrgAdminLike(ctx)` en servidor, 403 | ✔ |

**Ningún panel comprueba permisos por nombre de rol** —el antipatrón que prohíbe la regla 6 de
`CLAUDE.md`— pero **once de los dieciséis no comprueban nada**. La contención real es la RLS, y
para `organization_settings`, `settings` y `electronic_invoicing_config` la RLS es de nivel
*miembro*, no de administrador.

### T.6 Fechas sin zona horaria

| # | Patrón | Archivo:línea | Efecto en Colombia (UTC-5) |
|---|---|---|---|
| 1 | `toISOString().split('T')[0]` en el nombre del archivo exportado | `admin/RolesConfigurationSettings.tsx:175`; `TimelineConfigPanel.tsx:105` | Después de las 19:00 el archivo lleva la fecha del día siguiente |
| 2 | `new Date(d.verified_at).toLocaleString('es-CO')` **sin `timeZone`** | `crm/email/EmailDomainsCard.tsx:82` | Se muestra en la zona del navegador, no en la de la organización |
| 3 | `toLocaleDateString(undefined, {...})` sin zona | `branding/BrandingPublishTab.tsx:126-133`, `:299` | Ídem |
| 4 | `formatDistanceToNow(new Date(created_at))` sin normalizar | `llaves-api/ApiKeyCard.tsx:142,147,152` | «hace 5 horas» para algo recién creado si la columna no lleva zona |
| 5 | Expiración de llave calculada con el reloj del navegador y comparada en el cliente | `llaves-api/ApiKeyDialog.tsx:61-67`; `ApiKeyCard.tsx:38` | Una llave puede verse «Activa» con el reloj atrasado; el servidor no revalida |
| 6 | `updated_at: new Date().toISOString()` **desde el cliente** en 7 servicios | `pmsSettingsService.ts:92`, `integrationsService.ts:3077`, `PreferenciasService.ts:63,79,100,119`, `parkingConfigService.ts:164`, `gymSettingsService.ts:141`, `hrmConfigService.ts:137,190,228`, `timelineSettingsService.ts:108` | El reloj del usuario como fuente de verdad de la auditoría, pisando el `DEFAULT now()` de la columna |
| 7 | `dnd_start`/`dnd_end` son `time without time zone` y se teclean en hora local | `CanalPreferencia.tsx:141-157` | Un «No molestar» de 22:00 a 08:00 en Bogotá significaría 22:00-08:00 **UTC** si alguien lo implementara |
| 8 | `checkinTime`/`checkoutTime` de PMS son cadenas `"15:00"` **sin zona**, con un selector de zona horaria al lado que no se les aplica | `pms/configuracion/GeneralSettings.tsx:39-61` frente a `:67-85` | Ambigüedad estructural |
| 9 | Lista de 10 zonas con offsets **escritos a mano** («Nueva York (GMT-5)», «Madrid (GMT+1)») | `pmsSettingsService.ts:138-151` | Ignoran el horario de verano |
| 10 | Fechas de vigencia DIAN escritas crudas desde la API de Factus | `FacturacionConfigPanel.tsx:146-147`, `:179` | Si no llegan como `YYYY-MM-DD`, un guardado posterior **borra la vigencia** |
| 11 | Vigencias de comisión: `now < new Date(validFrom)` | `commissionService.ts:169-173` | `new Date('2026-09-22')` es medianoche **UTC**: un override «hasta hoy» caduca a las 19:00 del día anterior |

**Los dos usos correctos** son `DatosOfflinePanel` (`useFormatDate()` con la zona de la
organización, `:47-53`) y el gráfico de Créditos (el servidor calcula el día con la zona de la
organización, `app/api/crm/config/credits/route.ts:65`) — aunque este último **no muestra en
qué zona está leyendo**.

### T.7 Estados rotos, callejones sin salida y código muerto

| # | Hallazgo | Archivo:línea |
|---|---|---|
| 1 | **Esqueleto eterno** cuando no hay organización o falla la red, en 5 paneles: Facturación (`:73`, `:71-101`), Gym (`:41-54`), Integraciones (`:45`), PMS (`:32`), Roles (`:10-17`) | — |
| 2 | **Estados de error inalcanzables** porque el servicio se traga el fallo y devuelve valores por defecto: Parking (`:103-110`), Timeline (`:143-155`), PMS (`:38-41`) | — |
| 3 | **Fallo de lectura → pérdida de datos**: Parking, Gym y PMS muestran los defaults como si fueran los del usuario; un «Guardar» posterior los persiste encima de la configuración real | `parkingConfigService.ts:139-142`, `gymSettingsService.ts:115-118`, `pmsSettingsService.ts:66-79` |
| 4 | **Estado vacío que en realidad es un error**: Rangos DIAN, Razones de pérdida, Verticales, Scoring, Etapas y Comisiones capturan el error y devuelven `[]`/`null` | `RangosDianSection.tsx:119-125`; `lossReasonsService.ts:78-81`; `verticalsService.ts:88-95`; `scoringService.ts:165-169`; `stageGateService.ts:196-199`; `commissionService.ts:327-330` |
| 5 | **Cambios sin guardar que se pierden sin avisar** al cambiar de pestaña —el shell y `CrmConfigTabs` desmontan el contenido— o al cerrar cualquiera de los 8 modales del CRM. Ninguno tiene `beforeunload` ni bloqueo de navegación | `ConfiguracionLayout.tsx:81-90`; `CrmConfigTabs.tsx:60-83` |
| 6 | **«Recargar»/«Actualizar» descarta cambios sin preguntar** en Parking (`ConfigHeader.tsx:41-50`), Gym (`SettingsHeader.tsx:45-53`) y Scoring (`:199-201`) | — |
| 7 | **Tres componentes construidos y nunca montados**: `ConfiguracionSidebar`, `ConfiguracionSidebarItem`, `ConfiguracionSearch` | `layout/*` |
| 8 | **El asistente no está enlazado desde ningún sitio** | `app/app/configuracion/asistente/page.tsx` |
| 9 | **Cinco paneles dibujan una segunda cabecera** bajo la del contenedor: Integraciones, Notificaciones, Parking, Gym, Roles. La de Notificaciones es además `sticky` dentro de un `<main overflow-y-auto>` | `ConfigHeader.tsx:28`, `PreferenciasHeader.tsx:24,38`, `SettingsHeader.tsx:37` |
| 10 | **Dos paneles tienen un botón «atrás» que saca de Configuración**: Gym → `/app/gym`, Notificaciones → `/app/notificaciones` | `SettingsHeader.tsx:27-31`; `PreferenciasHeader.tsx:28-33` |
| 11 | **Callejón sin salida**: las razones de pérdida inactivas se listan con el chip «Inactiva» y **no hay forma de reactivarlas**; el servicio expone `toggleActive` y nadie lo llama | `LossReasonsManager.tsx:140-144`; `lossReasonsService.ts:192-221` |
| 12 | **Borrado sin confirmación de algo irreversible**: quitar un miembro de un equipo del CRM (con su cuota y territorio) y eliminar una moneda de la organización | `TeamCard.tsx:124-128`; `CurrenciesCard.tsx:134-146` |
| 13 | **Tres semánticas de borrado con la misma papelera roja**: borrado duro (roles, equipos, territorios, overrides, perfiles ICP), desactivación etiquetada «Desactivar» (verticales, razones) y reescritura de un JSONB (criterios de etapa) | — |
| 14 | **≈30 botones de icono sin nombre accesible** en el árbol del CRM, más los de HRM, PMS y Notificaciones. Única excepción correcta: `aria-label="Actualizar"` en Referidos | `ReferralsProgramCard.tsx:57` |
| 15 | **Interruptores sin etiqueta y con lógica invertida** (`checked={!mute}`) en Notificaciones | `MuteGlobal.tsx:43-47`; `CanalPreferencia.tsx:114-117` |
| 16 | **Escritura en la base por el mero hecho de abrir la pestaña**: Notificaciones siembra 6 filas (`ensureAllChannels`); WhatsApp escribe `messaging_limit` **desde un `GET`** | `PreferenciasService.ts:23-51`; `app/api/crm/whatsapp/settings/route.ts:26` |
| 17 | **Un viaje al servidor por pulsación**: los `<input type="time">` del «No molestar» guardan en cada tecla, sin `debounce` | `CanalPreferencia.tsx:145,155` |
| 18 | **Sin paginación en ninguna lista del módulo**, y con contadores que mienten: Rangos DIAN, ICP, Razones de pérdida, Verticales, Overrides, Equipos+miembros, Roles, Territorios, Etapas, Referidos (`slice(0,10)` sobre 200) | §O.5 #11; §E.8-15 |
| 19 | **`hasChanges` por `JSON.stringify`**: depende del orden de las claves; en PMS puede salir `true` nada más cargar si la fila guardada tiene claves extra | `IntegracionesConfigPanel.tsx:40-42`; `PMSConfigPanel.tsx:78-80` |
| 20 | **`organization_id` desde `localStorage`** en 9 `INSERT` del árbol de Estructura Comercial y los servicios del CRM; y **5 `UPDATE`/`DELETE` sin filtro de organización** | `dbRoles.ts:8-12,64,71`; `dbTeams.ts:72,79`; `dbTerritories.ts:44,51`; `stageGateService.ts:213`; `commissionService.ts:446` |

---

## U. Ajustes que existen en la base y no tienen interfaz, y al revés

### U.1 En la base y sin interfaz — `organization_preferences`

**84 filas, 6 grupos, ≈35 ajustes. Ninguno tiene control en Configuración y ninguno tiene
lector en el código** (grep de los 16 nombres más significativos en `src/`: **0 archivos**).

| Grupo | Organizaciones | Claves | ¿Interfaz? | ¿Lector? |
|---|---|---|---|---|
| `security` | 76 | `two_factor_auth_required`, `password_policy`, `ip_whitelist_enabled`, `login_attempt_limit`, `account_lockout_duration` | **No** | **No** |
| `system` | 83 | `timezone`, `language`, `auto_logout_minutes`, `session_timeout_warning`, `notifications_enabled`, `email_notifications`, `sms_notifications` | **No** | **No** |
| `ui` | 83 | `theme`, `compact_mode`, `default_page_size`, `date_picker_format`, `sidebar_collapsed`, `show_help_tips` | **No** | **No** |
| `finance` | 83 | `default_currency`, `currency_format`, `date_format`, `decimal_separator`, `thousands_separator`, `tax_included_by_default`, `auto_calculate_taxes` | Solo `default_currency` (en Finanzas › Monedas) | Solo `default_currency` |
| `business` | 76 | `business_hours`, `default_payment_terms`, `invoice_numbering_format`, `quote_numbering_format` | **No** | **No** |
| `integrations` | 76 | `email_provider`, `sms_provider`, `payment_gateways`, `accounting_software`, `backup_frequency` | **No** | **No** |

Es el inventario de lo que alguien pensó que debía configurarse y sembró en el registro de
cada organización. **La seguridad de la cuenta —2FA obligatorio, política de contraseñas, lista
blanca de IP, bloqueo por intentos— está sembrada en 76 organizaciones y no se puede ni ver.**

### U.2 En la base y sin interfaz — columnas sueltas

| Tabla · columna | Qué es | ¿Interfaz? |
|---|---|---|
| `organizations.timezone` | Zona horaria canónica (NOT NULL, default `America/Bogota`), validada por trigger | Solo desde **Calendario** (§L), donde nadie la busca |
| `organizations.primary_color`, `.secondary_color`, `.logo_url`, `.subdomain`, `.custom_domain` | Identidad visual y dominio | Repartidas entre `/app/organizacion/informacion` y Sitio Web |
| `organizations.fiscal_responsibilities`, `.economic_activity`, `.registration_code`, `.dv`, `.municipality_id`, `.graphic_representation_name` | Datos fiscales DIAN | **Ninguna** en Configuración |
| `invoice_sequences.alert_threshold` | Umbral de aviso de consecutivo por agotarse | **Ninguna** |
| `website_settings` — ≈90 de sus 127 columnas | Checkout, countdown, envíos, header móvil, footer, iconos… | Solo desde las 7 pestañas del editor, no desde Configuración |
| `restaurant_booking_settings` — 30 columnas | Reservas de mesa: horarios, aforo, depósito, avisos | **Ninguna** en Configuración (vive en Mesas) |
| `ai_assistant_settings` — 12 de sus 13 columnas | Herramientas habilitadas, voz, ventana de deshacer, tope de filas, confianza mínima, retención de adjuntos, tope de créditos por usuario, modelos | Solo `capability_level` (§A.4) |
| `comm_settings.voice_agent_enabled`, `.has_subaccount` | Agente de voz | Llegan al cliente y **no se renderizan** |
| `provider_configs(voice).settings.consent_voice`, `.consent_language` | Voz e idioma del aviso de grabación | **Se muestran y no se pueden editar** (§E.3 #17) |

### U.3 Con interfaz y sin base

| Ajuste | Panel | Problema |
|---|---|---|
| «Frecuencia de Pago», «Política de Horas Extra» | HRM | No existe columna ni clave; el valor es un literal (§T.1 #11) |
| Las 11 claves de `organization_settings` con **0 filas** | Timeline, Integraciones, Parking, PMS, Roles, Gym (en `settings`), Horas de operación, Comercio web, Asignación de leads, Revenue math, Disponibilidad de instructor | Nadie las ha guardado nunca (§B.1) |
| `vendor_commission_rates.valid_from` / `valid_until` | CRM › Comisiones | El servicio **los aplica** (`commissionService.ts:168-173`) y la interfaz los manda siempre `null`; la tarjeta anuncia «con vigencias» (`CRMConfigPanel.tsx:599`) |
| `verticals.slug`, `.color`, `.sort_order`, `.positioning`, `.metadata` | CRM › Verticales | Se leen y se usan (la plantilla deduplica por `slug`) y no hay control; una vertical creada aquí queda sin `slug` y la plantilla la duplicaría |
| 6 de los 9 tipos de criterio de salida (`customer_field`, `discovery`, `score`, `icp_band`, `next_contact`, `custom`) | CRM › Etapas | El `<select>` solo ofrece 3 y **al guardar reescribe el array completo**, destruyendo los demás |
| Esquema GOC canónico (`dimensions` + 5 bandas) | CRM › Scoring | La interfaz escribe el esquema antiguo; `getDefaultGOCConfig()` y `migrateOldConfig()` existen y **no se llaman nunca** |
| `sales_team_members.is_active` | CRM › Equipos | Se inserta `true`, no se muestra ni se cambia, y `getTeams` filtra por él: un miembro desactivado desaparece y se puede volver a añadir duplicado |

---

## V. Duplicidades: el mismo ajuste en dos sitios

| # | Ajuste | Sitio A | Sitio B (y C) | Qué debería mandar |
|---|---|---|---|---|
| 1 | **Datos de la organización, miembros, invitaciones, sucursales, mis organizaciones** | Configuración › General, 5 pestañas (`GeneralConfigPanel.tsx:110-138`) | `/app/organizacion/{informacion,miembros,invitaciones,sucursales,mis-organizaciones}` — **el mismo componente, el mismo hook, los mismos props**; la ruta usa i18n y el panel cadenas en español | **Configuración**. Las rutas `/app/organizacion/*` quedan como redirecciones. Y falta traer `branding`, `dominios`, `modulos` y `plan`, que hoy no están en Configuración |
| 2 | **Todo el sitio web (7 pestañas)** | Configuración › Sitio Web (380 líneas) | `/app/organizacion/branding/page.tsx` (388 líneas, copia casi literal) **y** `GlobalSettingsPanel` dentro del editor de páginas (478 líneas) | **El editor del módulo.** Configuración se queda con una tarjeta: subdominio, estado de publicación y enlace |
| 3 | **Menús de cabecera y pie del sitio** | Configuración › Sitio Web › Páginas → `MenuGroupManager` (con `confirm()` nativo) | El mismo `MenuGroupManager` montado desde el editor | **El editor** |
| 4 | **Etiquetas de conversación** | Configuración › Chat › Etiquetas | Configuración › CRM › General › Etiquetas — **mismo servicio, mismos componentes, misma tabla** | **Chat.** El CRM enlaza |
| 5 | **Llaves API** | Configuración › Chat › Llaves API | (a) Configuración › CRM › General › Llaves API, con los mismos componentes; (b) `integrationsService` tiene **otra implementación paralela** sobre `channel_api_keys` con distinto `key_prefix` y sin `set_org_context` | **Una sola**, en Integraciones, y por route handler |
| 6 | **Zona horaria de la organización** | Configuración › Calendario → `organizations.timezone` (canónica, validada) | (b) `organization_settings.calendar.timezone` (respaldo heredado); (c) `pms_settings.timezone` (sombra, sin validar, offsets a mano); (d) `organization_preferences.settings.system.timezone` (huérfana) | **`organizations.timezone`**, editada desde «Organización › Identidad», no desde Calendario |
| 7 | **Moneda predeterminada** | Finanzas › Monedas → `organization_currencies` + `organization_preferences` | (b) `pms_settings.defaultCurrency` (sombra); (c) HRM muestra la base en un campo `disabled` | **`organization_currencies.is_base`** |
| 8 | **Preferencias de notificación** | Configuración › Notificaciones (6 canales, al instante) | `/app/perfil` → `NotificacionesSection` (3 canales, con botón) — **las mismas filas y columnas**; el perfil propaga el «No molestar» a los 6 canales aunque solo muestre 3 | **El perfil**: son preferencias personales, no de la organización |
| 9 | **Horario de atención** | POS › Configuración → `organization_settings.operating_hours` | (b) `website_settings.business_hours` (sitio web); (c) `organization_preferences.settings.business.business_hours`; (d) `restaurant_booking_settings.service_hours`; (e) el horario de Parking; (f) el de WhatsApp | **Uno por organización** en «Organización › Horarios», con excepciones declaradas por sucursal y por canal |
| 10 | **Impuestos** | Finanzas › Impuestos (`organization_taxes`) | `website_settings.{tax_rate, tax_name, tax_included}` — la tienda web tiene su propio impuesto | **`organization_taxes`** |
| 11 | **Ajustes de Scoring** | CRM › Scoring (esquema antiguo) | `scoringService` define el esquema GOC canónico y lo ignora | **El canónico**, con migración |
| 12 | **Plantilla y colores del sitio** | Sitio Web › Tema | Sitio Web › Publicar → «Restablecer a {plantilla}» sobrescribe colores y fuentes **sin confirmación** | El Tema; el reset debe confirmarse |
| 13 | **Rutas de configuración del chat** | Configuración › Chat | `ConfigNavTabs` sigue enlazando a `/app/chat/configuracion/{etiquetas,respuestas-rapidas,llaves-api}` — **rutas que ya no existen** (404) | Configuración; borrar los enlaces |

---

# Parte 2 — Propuesta de estructura

Todo lo que sigue es la propuesta que se dibuja en la página `10 Configuración` de Figma y se
detalla control a control en `docs/design/PARIDAD-CONFIGURACION.md`.

## W.1 El diagnóstico en una frase

Configuración no es un módulo: es **un cajón de dieciséis módulos ajenos montados con
pestañas**. Cada uno trae su propia cabecera, su propio patrón de guardado, su propio manejo de
errores y su propia idea de dónde viven los datos —nueve tablas distintas—, y **ninguno de los
dieciséis vive realmente aquí**: o duplica una ruta que ya existe (General, Sitio Web), o es la
configuración de otro módulo embebida (POS, CRM, Chat), o escribe ajustes que nadie lee (Parking,
Gym, PMS, Timeline, Integraciones, Roles).

## W.2 Las seis áreas

Se sustituyen las 16 pestañas horizontales por **un menú lateral de 6 grupos y 21 paneles**
(`ConfigNav`, componente nuevo). El menú cabe en 1440 sin desplazamiento y en móvil es un
`BottomSheet`.

| Grupo | Paneles | De dónde salen |
|---|---|---|
| **1. Organización** | Identidad y datos fiscales · Sucursales · Equipo (miembros e invitaciones) · Roles y permisos · **Horarios y zona horaria** *(Nuevo)* · **Seguridad de la cuenta** *(Nuevo)* · Plan y módulos | General (5 pestañas) + Roles + la zona horaria que hoy vive en Calendario + los 5 ajustes de `security` que hoy solo existen en la base + `/app/organizacion/{plan,modulos}` |
| **2. Ventas y facturación** | Punto de venta · Impuestos · **Facturación electrónica** · Documentos e impresión · Consecutivos | POS (§D.17, ya diseñado) + Facturación + lo que hoy son diálogos dentro de POS |
| **3. Operación** | Hotel (PMS) · Parking · Gimnasio · Calendario · Recursos humanos | PMS, Parking, Gym, Calendario, HRM |
| **4. Comunicación** | Chat · Correo · Telefonía · WhatsApp · **GO Assistant** | Chat + las 4 pestañas del CRM que ya están bien construidas + el asistente, que hoy no está enlazado |
| **5. Integraciones** | Proveedores e IA · Créditos y consumo · Llaves API y webhooks · Sitio web y dominio | CRM › Proveedores + CRM › Créditos + Chat › Llaves + Integraciones + una tarjeta de Sitio Web |
| **6. Datos** | Auditoría y retención · Datos sin conexión · Importar y exportar | Timeline + Datos sin conexión |

### Qué sale de Configuración

| Sale | A dónde | Por qué |
|---|---|---|
| **Los 8 gestores del CRM** (Verticales, Razones de pérdida, Scoring, Etapas, Comisiones, Referidos, Estructura Comercial, ICP) | **`/app/crm/configuracion`**, con su propio menú lateral | §W.5 |
| **Las 7 pestañas del editor del sitio web** | El editor de `/app/organizacion/branding` | Es un editor visual, no una pantalla de ajustes; y ya existe duplicado |
| **Preferencias de notificación** | **`/app/perfil`** | Son por usuario (`user_notification_preferences` no tiene `organization_id`): estar en Configuración de la organización es una mentira de ubicación |
| **Propinas y Cargos de servicio** (hoy dos diálogos que embeben módulos enteros dentro de Configuración › POS) | Su propia página del módulo POS | §D.17 #6 y #7 de la auditoría de POS |
| **Reglas de país de nómina** | `/app/hrm/reglas-pais`, donde ya están | Configuración deja el enlace, como hoy |

### Qué entra en Configuración

| Entra | De dónde | Por qué |
|---|---|---|
| **Horarios y zona horaria** *(Nuevo)* | Hoy la zona está en Calendario y los horarios repartidos en 6 sitios (§V #6, #9) | Es un ajuste de la organización, no del calendario |
| **Seguridad de la cuenta** *(Nuevo)* | Los 5 ajustes de `organization_preferences.settings.security`, sembrados en 76 organizaciones y sin interfaz | 2FA obligatorio y política de contraseñas no pueden ser invisibles |
| **Formatos** *(Nuevo)* | `organization_preferences.settings.finance.{date_format, decimal_separator, thousands_separator, currency_format}` y `ui.default_page_size` | Ídem |
| **GO Assistant** | `/app/configuracion/asistente`, que hoy no está enlazado | Ya está bien hecho; solo falta la puerta |
| **Plan y módulos** | `/app/organizacion/{plan,modulos}` | Es donde la gente los busca |

## W.3 El patrón común de panel — obligatorio para los 21

### Cabecera

- **`PageHeader Variant=list Layout=desktop`**, una sola, la del contenedor. **Ningún panel
  dibuja una segunda** (hoy lo hacen cinco: §T.7 #9).
- Icono de 20 px en caja de 40×40 con `brand/tint`, tomado de `CATALOGO-ICONOS.md`. Dos
  correcciones obligadas respecto al registro actual: **HRM deja de usar `Users`** (es
  «Cliente») y pasa a `Briefcase`; **CRM deja de usar `UserCheck`** (es «Miembro del equipo») y
  pasa a `Contact`.
- Migas `Configuración › {Grupo} › {Panel}`.
- **Sin `BranchBadge`**: Configuración es de ámbito organización (patrón 9). **Dos
  excepciones declaradas**, ambas con su propio selector de sucursal **dentro de la sección**,
  no en la cabecera: «Punto de venta › Impresoras» y «Sitio web» (que hoy escribe en todas las
  sucursales a la vez, §D.2).
- Acciones de cabecera: **solo las de mantenimiento** (recargar, exportar, importar) como
  secundarias o dentro de «⋯». **Guardar no vive aquí** (patrón 4.1).

### Cuerpo

- Secciones con **`FormSection`**, una por grupo temático, con título, descripción y estado
  `collapsed` para las avanzadas.
- Filas con **`SettingRow`** *(componente nuevo)*: título 14 semibold + descripción 13 gris a la
  izquierda, control a la derecha. Cuatro variantes: `switch`, `select`, `campo`, `acción`.
  Sustituye las cuatro maneras distintas de pintar «etiqueta + subtítulo + interruptor» que
  conviven hoy.
- **Prohibido el nombre técnico en la etiqueta.** Hoy Timeline muestra `ops_audit_log` debajo de
  cada casilla y POS «Orden de visualización (display_order)». El nombre técnico, si hace falta,
  va en un `Tooltip`.
- **Un ajuste, un sitio.** Los duplicados de §V se resuelven con una fila de solo lectura que
  dice dónde se edita y enlaza allí, nunca con un segundo control.

### Guardado

**Criterio del dueño: guardado explícito con barra fija y aviso de cambios sin guardar, salvo
los interruptores simples, que guardan al instante con su confirmación.**

- **`SettingsSaveBar`** *(componente nuevo)*, fija al pie de la columna de contenido, con cuatro
  estados: `limpio` («Todo guardado · hace un momento»), `sucio` («Tienes cambios sin guardar» +
  badge con el número de cambios), `guardando` y `error` («No se pudo guardar. Tus cambios siguen
  aquí.» + «Reintentar»). Atajo `Ctrl+S` visible con `Kbd`.
- **Interruptor simple** = un booleano sin campos dependientes: guarda al instante y confirma con
  un `Toast` de una línea. Si el interruptor **abre campos** (como «Requerir depósito» → «Porcentaje
  de depósito», o «Habilitar política de ticket perdido» → 4 campos), **no es simple**: entra en
  el guardado explícito.
- **Salir con cambios sin guardar** abre `ConfirmDialog` («Tienes 3 cambios sin guardar» ·
  «Descartar» / «Seguir editando»). Aplica al cambiar de panel en el menú, al cerrar un diálogo y
  al abandonar la página. Hoy no existe en ningún sitio (§T.7 #5).
- **«Recargar» con cambios sin guardar** pasa por la misma confirmación.
- **Al fallar, nunca se pierde lo tecleado ni se revierte a medias.** La barra queda en `error`
  y el formulario conserva los valores.
- **Nada de `confirm()` ni `alert()`**: los siete se sustituyen por `ConfirmDialog`
  (`Variant=destructive` donde toque) y `Toast`.

### Estados

Cinco por panel, todos con instancias del kit y **todos con acción**:

| Estado | Componente | Regla |
|---|---|---|
| Listo | — | — |
| Cargando | `Skeleton` (`line`, `rect`, `card`) | La cabecera **no** se esqueletiza (patrón 4) |
| Vacío | `EmptyState Variant=empty` | Solo donde tiene sentido (sin impresoras, sin rangos DIAN, sin dominios). Siempre con la acción que lo resuelve |
| Error | `EmptyState Variant=error` + «Reintentar» | **Un fallo de lectura nunca se dibuja como estado vacío ni como valores por defecto** (§T.7 #3 y #4) |
| Sin permiso | `EmptyState Variant=forbidden` o, si es parcial, banner de solo lectura | Hoy solo existe en General |

**Regla nueva y dura:** un panel **no puede** mostrar valores por defecto cuando la lectura ha
fallado. Los tres servicios que hoy lo hacen (Parking, Gym, PMS) provocan que el siguiente
«Guardar» destruya la configuración real.

### Permisos

- **Se resuelven en el servidor**, por permiso —no por nombre de rol y, a ser posible, no por id
  numérico—, y llegan al panel como un `can_manage` booleano. El patrón ya existe y funciona en
  cuatro sitios: `isOrgAdminLike(ctx)` (`lib/utils/orgAdmin.ts:41`) en
  `app/api/ai-assistant/settings/route.ts:66-68`, y los `can_edit`/`is_admin` de
  Telefonía, Proveedores, Email y WhatsApp.
- **Tres niveles de visibilidad por panel**: visible y editable · visible y de solo lectura (con
  banner «Solo lectura: requiere rol de administrador», que ya existe en WhatsApp) · oculto.
- **El menú también filtra por permiso**, no solo por módulo contratado: hoy
  `useActiveConfigModules` ignora los `accessibleModules` que `useActiveModules` ya calcula
  (§A.2).
- **Los secretos pasan a ser write-only**: `SecretField` *(componente nuevo)* con tres estados
  —`vacío`, `guardado` (`••••••••  ·  termina en 7d5a0` + «Reemplazar») y `editando`—. **Ningún
  secreto vuelve al navegador en claro**, exactamente como ya hace `ProviderCredentialForm`.

### Búsqueda de ajustes

- **`ConfigSearchCommand`** *(componente nuevo)*: `Ctrl+K` dentro de Configuración abre un
  buscador sobre un **índice de ajustes**, no de módulos. Cada resultado muestra el ajuste, su
  grupo y su panel, y al elegirlo abre el panel y **resalta la fila** durante un segundo.
- El índice se genera del mismo catálogo que dibuja los paneles, así que no se desincroniza.
- Sustituye a `ConfiguracionSearch`, que filtra 16 títulos de módulo y además nadie monta.

### Móvil (390)

- El menú lateral es un `BottomSheet` que abre el botón de la `MobileHeader Mode=page`.
- Las filas de `SettingRow` apilan control debajo del texto.
- La `SettingsSaveBar` es fija abajo y **sustituye al `MobileTabBar`** mientras hay cambios sin
  guardar, igual que hace la `BulkActionBar` (patrón 1).

## W.4 Qué hacer con los ≈130 ajustes que no lee nadie

No se dibujan como están. Para cada bloque, una de tres decisiones, y la decisión se toma
**antes** de dibujar:

| Bloque | Decisión propuesta |
|---|---|
| **Parking (34)**, **Gym (28)**, **PMS (18)** | **Cablear o retirar.** En Figma se dibujan **solo los ajustes que la operación ya consulta** —el período de gracia y la tarifa de ticket perdido, que hoy salen de `parking_rates`— y el resto se marca `Nuevo` con la nota «pendiente de cablear». Dibujar 80 interruptores que no hacen nada sería calcar lo roto (regla I.4.4) |
| **Integraciones (19)** | Los 5 «Límites» y los 4 «Funcionalidades» **se retiran** hasta que existan; se conserva el bloque de «Retención» y las notificaciones, que son plausibles, marcados `Nuevo` |
| **Timeline (13)** | **Se retiran los tres de privacidad** —prometen enmascarar contraseñas y tarjetas y no lo hacen: es el peor de los casos— y los de retención/archivado. Se conservan los de visualización (rango, tamaño de página, vista compacta), marcados `Nuevo`, porque cablearlos es trivial |
| **Roles (4)** | **Se retiran.** «Modo estricto» y «Permitir edición de permisos del sistema» sugieren una postura de seguridad que no existe |
| **Facturación (6 campos de credenciales)** | **Se rediseñan como `SecretField` write-only** y se marca `Nuevo` la advertencia «Las credenciales las gestiona la plataforma» mientras el servidor siga usando variables de entorno |
| **`organization_preferences` (≈35)** | **Se dibujan por primera vez**, en «Organización › Seguridad de la cuenta» y «Organización › Formatos», marcados `Nuevo` |

## W.5 Qué hacer con el CRM

**El panel de CRM no es un panel: son 4.616 líneas, 14 pantallas a tres niveles y el 55 % de
todo el módulo.** Ocho de sus pantallas abren un `Dialog` que contiene un gestor completo con
su propia lista, su formulario y sus confirmaciones —ICP tiene 793 líneas y 72 controles—, y
**ninguna de las ocho comprueba permisos ni avisa de cambios sin guardar**.

**Propuesta, en tres movimientos:**

1. **Los cuatro que ya están bien se quedan, repartidos por función.** Telefonía, Proveedores e
   IA, Email y WhatsApp van por route handler, resuelven permisos en servidor y manejan los
   secretos correctamente. Se mudan al grupo **Comunicación** (Telefonía, Email, WhatsApp) y al
   grupo **Integraciones** (Proveedores e IA, Créditos y consumo). Dejan de llamarse «CRM».
2. **Los ocho gestores se mudan a `/app/crm/configuracion`**, una página del módulo CRM con su
   propio menú lateral de 8 entradas. **Dejan de ser diálogos**: un gestor con lista, formulario
   y borrado necesita una página, no un modal de 1.024 px del que se sale perdiendo los cambios.
   Lo que hoy es «Configuracion CRM» con 8 tarjetas pasa a ser, en Configuración, **una sola
   tarjeta** con el enlace y un resumen («8 verticales · 12 razones de pérdida · scoring
   configurado»).
3. **La pestaña «General» se queda en Configuración › Comunicación › Chat**, porque lo que
   contiene —canales, etiquetas y llaves API— **es literalmente el mismo servicio y los mismos
   componentes que el panel de Chat** (§V #4 y #5). Deja de existir como duplicado.

Resultado: Configuración › CRM pasa de **504 controles en 14 pantallas** a **una tarjeta con un
enlace**, y el CRM gana una pantalla de configuración propia que puede crecer sin estrangular el
contenedor.

## W.6 Orden de trabajo sugerido

| Prioridad | Qué | Por qué |
|---|---|---|
| **P0** | Sacar las credenciales de Factus del navegador (route handler + `isOrgAdminLike` + `SecretField` write-only) y endurecer la RLS de `electronic_invoicing_config` (administradores y `om.is_active`) | §T.4 #1 |
| **P0** | Añadir sesión a `GET /api/factus/numbering-ranges` y al resto de rutas `factus` sin `getServerOrgContext` | §T.4 #6 |
| **P0** | Mover la generación de llaves API a un route handler con `crypto.randomBytes` + hash real | §T.4 #2 y #3 |
| **P1** | `can_manage` resuelto en servidor en los 11 paneles que no comprueban nada, empezando por Facturación, Roles y Calendario (que toca `organizations.timezone`) | §T.5 |
| **P1** | Que Parking, Gym y PMS dejen de devolver valores por defecto cuando falla la lectura | §T.7 #3 |
| **P1** | Aviso y confirmación de cambios sin guardar en todo el módulo | §T.7 #5 |
| **P2** | Decidir, bloque a bloque, los ≈130 ajustes muertos | §W.4 |
| **P2** | Resolver las 13 duplicidades | §V |
| **P3** | Sustituir los 7 `confirm()`/`alert()`, poner nombre accesible a los ≈30 botones de icono y normalizar las fechas | §T.3, §T.6, §T.7 #14 |
