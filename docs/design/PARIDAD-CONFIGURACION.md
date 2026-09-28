# Paridad Configuración — rediseño en Figma (página `10 Configuración`)

Archivo Figma «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`), página nueva
**`10 Configuración`**, con 11 Secciones: `Índice`, `Componentes — Configuración (Nuevo)` y las
nueve del rediseño (`1. Contenedor y navegación` … `9. CRM — el módulo que se muda`).

Fuente de verdad: `docs/design/AUDITORIA-CONFIGURACION.md` (1.669 líneas; el contenedor, el
asistente y los 16 paneles, ≈750 filas inventariadas y ≈1.290 controles, con `archivo:línea`).
Una fila por control o por grupo homogéneo de controles, tal como los lista la auditoría.

**Configuración › POS no se rehace aquí.** Está auditada en
`AUDITORIA-CONTROLES-PRODUCTOS-POS.md` §D.17 (≈249 filas / ≈120 controles) y diseñada en la
Sección «Configuración › POS» de la página `05 POS y ventas`. Lo único que aparece en esta
página es su entrada en el menú lateral y lo que hay que alinear (§9 de esta tabla).

## Estados de la columna final

- **calcado** — existe en código y se dibujó igual, con la etiqueta exacta.
- **Nuevo** — no existe en código; lleva el badge `Marca/Nuevo` como anotación, fuera del frame
  (patrón 12 #5).
- **sustituido por …** — lo roto no se calca (regla I.4.4 del brief de fidelidad): se reemplaza
  por el componente correcto del kit o por un control mejor planteado.
- **retirado: motivo** — el control existe hoy, persiste en la base y **no lo lee nadie**, o
  promete algo que el sistema no hace. Se retira con el motivo escrito. Es la decisión de §W.4
  de la auditoría: dibujar 130 interruptores que no hacen nada sería calcar lo roto.
- **se muda a …** — el control sigue existiendo, pero en otra pantalla. Nada se pierde.
- **omitido: motivo** — no se dibuja. Cero «omitido» sin motivo.

## Convenciones

Escritorio 1440 de ancho, móvil 390. Cada frame lleva su anotación en gris pizarra de 12 px
arriba a la izquierda, con la referencia de la auditoría que cubre. Separación de 120 px entre
frames apilados, 200 px entre filas y 400 px entre Secciones. Nombres ficticios: «Mi empresa
S.A.S.», «Sucursal Principal», «Sucursal Norte», «Ana Gómez», «Luis Peña». Sin nombres de
organizaciones cliente. Los impuestos se rotulan `{nombre} {tasa}`, nunca «IVA» a secas.

## Frames

| Sección | Frames | Tamaño de la Sección |
|---|---|---|
| `Índice` | — (dos columnas de índice + nota) | 1200 × 760 |
| `Componentes — Configuración (Nuevo)` | 5 componentes nuevos | 4300 × 1060 |
| `1. Contenedor y navegación` | 6 | 4800 × 2426 |
| `2. Patrón común de panel` | 8 (6 pantallas + `ConfirmDialog` + `Toast`) | 4800 × 2591 |
| `3. Organización` | 5 (3 escritorio + 1 móvil + `ConfirmDialog`) | 4800 × 2854 |
| `4. Ventas y facturación` | 5 (3 escritorio + 1 móvil + `ConfirmDialog`) | 4800 × 3150 |
| `5. Operación` | 6 (5 escritorio + 1 móvil) | 6400 × 4169 |
| `6. Comunicación` | 6 (5 escritorio + 1 móvil) | 6400 × 3020 |
| `7. Integraciones` | 6 (4 escritorio + 1 diálogo + 1 móvil) | 6400 × 2985 |
| `8. Datos` | 3 (2 escritorio + 1 móvil) | 3750 × 1564 |
| `9. CRM — el módulo que se muda` | 1 | 1600 × 1394 |
| **Total** | **46 pantallas y diálogos + 5 componentes** | — |

### Componentes nuevos (Sección «Componentes — Configuración (Nuevo)»)

| Componente | Variantes | Para qué | Sustituye a |
|---|---|---|---|
| `SettingRow` | `Control=switch / select / campo / acción` | La fila de ajuste: título y descripción a la izquierda, control a la derecha | Las cuatro maneras distintas de pintar «etiqueta + subtítulo + interruptor» que conviven hoy |
| `SettingsSaveBar` | `State=limpio / sucio / guardando / error` | Barra fija al pie con el aviso de cambios sin guardar y `Ctrl+S` | Los botones «Guardar» sueltos en cinco cabeceras distintas, y la ausencia total de aviso al salir |
| `SecretField` | `State=vacío / guardado / editando` | Campo de secreto write-only: nunca devuelve el valor en claro | Los `type="password"` de Facturación, que sí lo devuelven (§O.2) |
| `ConfigNav` | `Mode=desktop / drawer` | Menú lateral de 6 grupos y 29 paneles, con buscador | Las 16 pestañas horizontales con 2.240 px de desplazamiento sin afordancia |
| `ConfigSearchCommand` | — | Buscador de ajustes con `Ctrl+K`, sobre el índice de ajustes | `ConfiguracionSearch`, que filtra 16 títulos de módulo y **nadie monta** |

---

## A. El contenedor y su navegación

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| A.1 #1 | Esqueleto del `Suspense` de la página | `Escritorio / Configuración — cargando` | sustituido por `Skeleton` del kit, sin esqueletizar la cabecera (patrón 4) |
| A.1 #2 | Esqueleto de `ConfiguracionLayout` | `Escritorio / Configuración — cargando` | calcado como estado único de carga |
| A.1 #3 | «No hay configuraciones disponibles» · «Activa módulos en la sección de Organización…» | — | omitido: con el menú de grupos siempre hay algo que ver; el vacío real es «sin permiso» |
| A.1 #4 | «Módulo no encontrado» | — | omitido: es código muerto (`ConfiguracionLayout.tsx:85-88` es inalcanzable) |
| A.1 #5 | «Este panel estará disponible en una próxima fase.» | — | omitido: código muerto (`ConfiguracionPanelRenderer.tsx:132-140` es inalcanzable) |
| A.1 #6 | Cabecera con caja de icono 40×40, título y descripción del módulo | Los 21 frames de escritorio | sustituido por `PageHeader Variant=list, Layout=desktop`, con migas y el icono de `CATALOGO-ICONOS.md` |
| A.1 #7 | Las 16 pestañas horizontales | `ConfigNav` · `Escritorio / Configuración — menú y panel (listo)` | sustituido por el menú lateral de 6 grupos y 29 paneles |
| A.1 #8 | Caja de icono dentro de cada pestaña | `ConfigNav` | calcado: cada entrada del menú lleva su icono de 16 px |
| A.1 #9 | Esqueleto de la carga diferida del panel | `Escritorio / Patrón — cargando` | calcado |
| A.2 | Filtro por módulo contratado (`isCore` + `active_modules`) | `Escritorio / Configuración — sin permiso` | sustituido: el menú filtra además por **permiso** resuelto en servidor, que `useActiveModules` ya calcula y `useActiveConfigModules` ignora |
| A.3 | `?modulo=` sin historial (`router.replace`) | — | omitido: no tiene representación visual; la corrección va en código |
| A.3 | `ConfiguracionSidebar` + `ConfiguracionSidebarItem` (construidos y nunca montados) | `ConfigNav` | sustituido por `ConfigNav`, que sí se monta |
| A.3 | `ConfiguracionSearch` «Buscar configuración...» (nunca montado, y con un defecto de cierre) | `Escritorio / Configuración — buscador de ajustes (Ctrl+K)` | sustituido por `ConfigSearchCommand`, sobre el índice de ajustes |
| A.4 #1-#12 | El asistente completo (12 controles) | `Escritorio / GO Assistant` | calcado, **más** la entrada de menú que hoy no existe: la ruta no está enlazada desde ningún sitio |
| A.4 #8 | `<select>` nativo del nivel de capacidad | `Escritorio / GO Assistant` | sustituido por el `Select` del kit |
| — | Búsqueda de ajustes en móvil | `Móvil / Configuración — índice` | Nuevo |
| — | Menú en móvil | `Móvil / Configuración — menú (hoja)` | Nuevo: `ConfigNav Mode=drawer` dentro de una hoja |

## Patrón común de panel

| Regla (§W.3) | Frame Figma | Estado |
|---|---|---|
| Cabecera única, icono del catálogo, sin `BranchBadge` | `Escritorio / Patrón de panel (anotado)` | Nuevo |
| Secciones con `FormSection`, avanzadas plegadas | `Escritorio / Patrón de panel (anotado)` | calcado del kit |
| Guardado explícito con barra fija | `SettingsSaveBar` · todos los frames con `State=limpio` o `sucio` | Nuevo |
| Interruptor simple que guarda al instante y confirma | `Toast Variant=success` | calcado del kit |
| Aviso de cambios sin guardar al salir | `ConfirmDialog` «Tienes 3 cambios sin guardar» | Nuevo: hoy no existe en ningún sitio |
| Cargando | `Escritorio / Patrón — cargando` | calcado |
| Vacío con acción | `Escritorio / Patrón — vacío` | calcado |
| Error con «Reintentar», sin valores por defecto | `Escritorio / Patrón — error` | Nuevo: hoy Parking, Gym y PMS dibujan los defaults tras un fallo de lectura |
| Solo lectura con banner | `Escritorio / Patrón — solo lectura` | calcado del banner que ya existe en CRM › WhatsApp |
| Móvil | `Móvil / Patrón de panel` | Nuevo |

---

## C. Panel «General» → grupo **Organización**

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C #1 | Esqueleto de 5 píldoras + contenido | `Escritorio / Patrón — cargando` | calcado |
| C #2 | Error sin acción (`useOrgAdmin` expone `refresh()` y no se usa) | `Escritorio / Patrón — error` | sustituido por `EmptyState Variant=error` + «Reintentar» |
| C #3 | «No tienes permisos de administrador para ver esta configuración.» | `Escritorio / Configuración — sin permiso` | sustituido por `EmptyState Variant=forbidden` con acción «Solicitar acceso» |
| C #4 | «No se pudo determinar la organización activa.» | — | omitido: se resuelve en el contenedor, no en cada panel |
| C #5 | Pestaña «Información» | `Escritorio / Configuración — menú y panel (listo)` (panel «Identidad y datos») | calcado |
| C #6 | Pestaña «Miembros» | `Escritorio / Equipo (remite a su pantalla)` | calcado como fila «Miembros» |
| C #7 | Pestaña «Invitaciones» | `Escritorio / Equipo` | calcado como fila «Invitaciones» |
| C #8 | Pestaña «Sucursales» | `Escritorio / Equipo` | calcado como fila «Sucursales» |
| C #9 | Pestaña «Mis Organizaciones» | — | se muda a: el `OrgSwitcher` del `AppHeader` ya cambia de organización; en Configuración queda «Plan y módulos» |
| C #10 | Doble esqueleto redundante (`dynamic({loading})` + `Suspense`) | — | omitido: defecto de implementación sin representación visual |
| C · `OrganizationInfoTab` | Nombre comercial, Razón social, NIT | `Escritorio / Configuración — menú y panel (listo)` | calcado |
| C · `OrganizationInfoTab` | País, Ciudad | mismo frame, sección «Ubicación» | calcado |
| V #1 | Las 5 pestañas duplicadas con `/app/organizacion/*` | — | sustituido: Configuración manda, las rutas quedan como redirección |
| U.2 | `organizations.fiscal_responsibilities`, `.economic_activity`, `.registration_code`, `.dv`, `.municipality_id` | `Escritorio / Configuración — menú y panel (listo)`, sección «Datos fiscales» pendiente | Nuevo (pendiente): hoy no tienen ninguna pantalla |

## Panel «Roles» → **Organización › Roles y permisos**

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| N #1 | Esqueleto | `Escritorio / Patrón — cargando` | calcado |
| N #2 | Segunda cabecera «Configuración del Sistema de Permisos» | `Escritorio / Roles y permisos` | sustituido por la cabecera única del contenedor |
| N #3 | «Importar» (JSON sin validar) | — | retirado: importa un JSON arbitrario que se mezcla con los valores por defecto y se persiste tal cual |
| N #4 | «Exportar» | `Escritorio / Roles y permisos`, acción secundaria «Exportar» | calcado; el nombre del archivo deja de usar `toISOString().split('T')[0]` |
| N #5 | «Tienes cambios sin guardar» | `SettingsSaveBar State=sucio` | sustituido por la barra fija |
| N #6 | «Descartar» sin confirmación | `ConfirmDialog` del patrón | sustituido por «Descartar» con confirmación |
| N #7 | «Guardar» | `SettingsSaveBar` | sustituido |
| N #8 | «Regla de Precedencia» → «Admin > Cargo > Rol» | `Escritorio / Roles y permisos`, sección «Cómo se resuelven los permisos» | calcado |
| N #9 | Badge «Fijo» | mismo frame | calcado como texto de la descripción |
| N #10 | «Permitir edición de permisos del sistema» | — | **retirado**: cero consumidores en `src/`; sugiere una postura de seguridad que no existe |
| N #11 | «Permitir duplicar roles del sistema» | — | **retirado**: cero consumidores |
| N #12 | «Modo estricto» | — | **retirado**: cero consumidores; es el más engañoso de los cuatro |
| N #13 | «Heredar permisos del rol» | — | **retirado**: cero consumidores |
| N #14 | «Estado Actual» (espejo de los 4 interruptores) | — | retirado: sin los interruptores no tiene objeto |
| N #15 | «Recargar» | acción de cabecera | calcado |
| — | «Roles y sus permisos» | `Escritorio / Roles y permisos` | Nuevo: enlace al gestor real, que hoy no está en este panel |
| — | «Cargos y acceso a módulos» | mismo frame | Nuevo: hoy solo 41 de 1.325 cargos tienen acceso definido y la comprobación deja pasar a casi todo el mundo |

## **Organización › Seguridad de la cuenta** (panel nuevo)

Origen: §U.1 — `organization_preferences.settings.security` y `.system`, sembrados en 76-83
organizaciones, **sin interfaz y sin lector**.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| U.1 `security.two_factor_auth_required` | «Exigir doble factor a todo el equipo» | `Escritorio / Seguridad de la cuenta (Nuevo)` | Nuevo |
| U.1 `security.password_policy` | «Política de contraseñas» | mismo frame | Nuevo |
| U.1 `security.login_attempt_limit` | «Intentos antes de bloquear la cuenta» | mismo frame | Nuevo |
| U.1 `security.account_lockout_duration` | «Duración del bloqueo (minutos)» | mismo frame | Nuevo |
| U.1 `security.ip_whitelist_enabled` | «Restringir el acceso por lista de direcciones IP» + «Direcciones permitidas» | mismo frame | Nuevo |
| U.1 `system.auto_logout_minutes` | «Cerrar sesión por inactividad (minutos)» | mismo frame | Nuevo |
| U.1 `system.session_timeout_warning` | «Avisar antes de cerrar la sesión» | mismo frame | Nuevo |
| W.3 | Confirmación de un cambio masivo | `ConfirmDialog` «¿Exigir doble factor a las 138 personas?» | Nuevo |
| — | Móvil | `Móvil / Seguridad de la cuenta` | Nuevo |

## **Organización › Horarios y zona horaria** (panel nuevo)

Origen: §V #6 (la zona horaria vive en 4 sitios) y §V #9 (el horario de atención, en 6).

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| L #13 | «Zona horaria» (hoy en Configuración › Calendario) | `Escritorio / Patrón de panel (anotado)` | se muda a Organización; conserva la validación IANA en cliente y el trigger en la base, que es la única validación real de todo el módulo |
| G #7 | «Zona Horaria» de PMS (10 opciones con offsets a mano) | — | **retirado**: zona en la sombra, sin validar, que ignora el horario de verano |
| U.1 `system.timezone` | Zona horaria de `organization_preferences` | — | **retirado**: tercera copia, huérfana |
| — | «Ajustar automáticamente al horario de verano» | `Escritorio / Patrón de panel (anotado)` | Nuevo |
| D.17 `operating_hours` | «Horas de Operación» del POS | mismo frame, sección «Horario de atención» | se muda a Organización; la clave tiene 0 filas en la base |
| K #8-#11 | Los 7 días de «Horarios de Operación» de Parking | mismo frame + enlace desde Parking | se muda a Organización, con excepciones por sucursal |
| E.6 #10-#12 | «Horario permitido de contacto» de WhatsApp (con zona horaria en texto libre) | mismo frame + enlace desde WhatsApp | se muda a Organización |
| — | «Excepciones por sucursal» | mismo frame | Nuevo |

---

## D. Panel «Sitio Web» → **Integraciones › Sitio web y dominio**

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| D #1-#2 | Esqueleto y error con «Reintentar» | `Escritorio / Patrón — cargando` / `— error` | calcado |
| D #3 | `t('refresh')` | acción de cabecera | calcado |
| D #4 | Chip «Publicado» / «Borrador» | `Escritorio / Sitio web y dominio` | calcado como fila de estado con la URL |
| D #5-#11 | Las 7 pestañas del editor (Tema, Páginas, Checkout, SEO, Contenido, Avanzado, Publicar) | — | **se mudan a** el editor de `/app/organizacion/branding`: es un editor visual, no una pantalla de ajustes, y ya está duplicado tres veces (§V #2) |
| D #13-#14 | «Publicar» / «Despublicar» | `Escritorio / Sitio web y dominio` | se muda al editor; «Despublicar» gana confirmación |
| D #15-#16 | «Ver sitio» + copiar URL (dominio `goadmin.io` cableado) | `Escritorio / Sitio web y dominio` | sustituido: la URL sale del subdominio y del dominio propio si existe |
| D #17 | Checklist de 5 comprobaciones solo en cliente | — | se muda al editor |
| D #19 | «Restablecer a {plantilla}» sin confirmación | — | se muda al editor, con `ConfirmDialog` |
| D #21 | «Identificador de analítica» | `Escritorio / Sitio web y dominio` | calcado, con validación de formato `G-XXXXXXXXXX` |
| D #22-#23 | `custom_css` y `custom_scripts` | mismo frame, fila «Código personalizado» | sustituido: se sanean antes de publicar (hoy es XSS almacenado en el sitio público) |
| D #25 | `confirm()` nativo «¿Eliminar este menú y todos sus items?» | — | sustituido por `ConfirmDialog Variant=destructive` en el editor |
| D.2 | Guardar escribe en la fila global **y en todas las sucursales** | `Escritorio / Sitio web y dominio`, sección «Ámbito» | Nuevo: selector de sucursal explícito |

---

## E. Panel «CRM» → repartido

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| E.1 | Las 6 pestañas del shell del CRM | — | sustituido: cada una pasa a ser un panel del menú lateral, en su grupo por función |
| E.2 #2-#9 | Canales del chat (alta, estado, modo IA, configurar, widget, conectar) | `Escritorio / Chat` | se muda a Comunicación › Chat: es el mismo servicio y los mismos componentes (§V #4) |
| E.2 #9 | «Conectar» que no hace nada + toast «se gestiona desde Chat» | — | **retirado**: callejón sin salida |
| E.2 #10-#13 | Etiquetas de conversación | `Escritorio / Chat`, tabla de etiquetas | se muda a Chat; una sola vez en todo el sistema |
| E.2 #14-#19 | Llaves API (lista, alta, revocar, rotar) | `Escritorio / Llaves API y webhooks` | se muda a Integraciones; deja de estar duplicado en tres implementaciones |
| E.2 #20-#21 | Widget Web | `Escritorio / Chat` | se muda a Chat |
| E.2 #22-#30 | «Configuracion CRM» con 8 tarjetas «Configurar →» | `Escritorio / CRM en Configuración — una tarjeta` | **se muda a** `/app/crm/configuracion`: los 8 gestores dejan de ser diálogos y pasan a ser páginas (§W.5) |
| E.3 #1-#30 | Telefonía completa (números, grabación, consentimiento, mi celular) | `Escritorio / Telefonía` | calcado: ya va por route handler y resuelve el permiso en servidor |
| E.3 #17 | «Voz: {consent_voice} · Idioma: {consent_language}» solo lectura | `Escritorio / Telefonía` | omitido en esta tanda: falta decidir si se edita aquí o en Proveedores e IA (duda 3) |
| E.3 #23-#30 | «Mi celular» (OTP, modo de llamada, caller id) | `Escritorio / Telefonía`, fila que enlaza al perfil | se muda al perfil: es preferencia personal |
| E.4 #1-#21 | Proveedores e IA (12 categorías, credenciales, probar conexión) | `Escritorio / Proveedores e IA` | calcado: **es la referencia de cómo se manejan secretos** en el sistema |
| E.4 #8 vs #13 | El switch «Activo» guarda al instante y el resto con botón | `Escritorio / Proveedores e IA` | sustituido: criterio único de §W.3 |
| E.5 #1-#33 | Correo (dominios, DNS, remitente, política, firma) | `Escritorio / Correo` | calcado |
| E.5 #13 | «Verificar» sin feedback de éxito | `Escritorio / Correo` | sustituido: gana su `Toast` |
| E.5 #29-#33 | «Mi firma» | `Escritorio / Correo`, fila que enlaza al perfil | se muda al perfil: se guarda en `profiles.metadata` del usuario |
| E.6 #1 | Esqueleto eterno si falla la carga | `Escritorio / Patrón — error` | sustituido por estado de error con «Reintentar» |
| E.6 #2-#16 | WhatsApp (canal, opt-in/out, horario, límites, indicativo) | `Escritorio / WhatsApp` | calcado |
| E.6 #5 | «Consultar» que **escribe desde un `GET`** | `Escritorio / WhatsApp` | sustituido: la consulta deja de escribir y el dato se muestra con su antigüedad |
| E.6 #10-#12 | Horario con zona horaria en texto libre | `Escritorio / WhatsApp`, fila que enlaza a Horarios | sustituido |
| E.7 #1-#15 | Créditos y sistema (4 KPI, presupuesto, gráfico, tablas, cola) | `Escritorio / Créditos y consumo` | calcado; el panel pasa a exigir administrador y el gráfico dice en qué zona horaria cuenta los días |
| E.8 | «Verticales» (31 controles) | — | se muda a `/app/crm/configuracion`; el switch «Activa» deja de ignorarse al crear |
| E.9 | «Razones de Perdida» (30) | — | se muda; gana la reactivación, que hoy es un callejón sin salida |
| E.10 | «Scoring (GOC)» (24) | — | se muda; los 4 campos de banda que nadie lee se retiran |
| E.11 | «Etapas y Criterios» (28) | — | se muda; el editor deja de destruir los 6 tipos de criterio que no sabe editar |
| E.12 | «Vendedores y Comisiones» (38) | — | se muda; «editar» deja de duplicar la fila y aparecen las vigencias |
| E.12 #17 | `confirm()` «¿Estás seguro de eliminar este override de comisión?» | — | sustituido por `ConfirmDialog` en su nueva pantalla |
| E.13 | «Programa de Referidos» (31) | — | se muda; es la referencia de calidad del árbol y su `can_manage` se cablea |
| E.14 | «Estructura Comercial» (Roles 30, Equipos 40, Territorios 25) | — | se muda; quitar un miembro gana confirmación |
| E.15 | «ICP» (72) | — | se muda; borrar un criterio gana confirmación |

---

## F. Panel «Recursos Humanos» → **Operación › Recursos humanos**

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| F #1 | Esqueleto | `Escritorio / Patrón — cargando` | calcado |
| F #2 | Botón de recarga sin `aria-label` | acción de cabecera | sustituido por el `IconButton` del kit con nombre accesible |
| F #4-#5 | «Reglas de País» + «Ver Reglas» | `Escritorio / Recursos humanos` | calcado |
| F #7 | «Sobre las Monedas» (promete auto-actualización que no existe) | — | retirado: texto que miente (§T.2 #8) |
| F #8 | «Nombre» y «Razón Social» deshabilitados | `Escritorio / Recursos humanos`, fila «Identidad y datos fiscales» | sustituido: se enlaza al único sitio donde se editan |
| F #9-#11 | País, Ciudad, NIT, Identificación Tributaria | misma fila | se muda a Organización › Identidad: un dato, un sitio |
| F #13 | «Frecuencia de Pago» deshabilitado con literal `'monthly'` | `Escritorio / Recursos humanos` | Nuevo: pasa a guardar de verdad |
| F #14 | «Política de Horas Extra» deshabilitado con literal `'standard'` | mismo frame | Nuevo: pasa a guardar de verdad |
| F #15 | «Moneda Base» deshabilitado | mismo frame, `Select State=disabled` con el motivo | calcado |
| F #17-#21 | Lista de monedas, «Base», papelera, «Agregar moneda...» | mismo frame, fila «Monedas habilitadas» | se muda a Finanzas › Monedas, que es donde se editan de verdad |
| F.G3 | «Base» y la papelera **fallan en silencio** (faltan políticas `UPDATE` y `DELETE`) | — | sustituido: la corrección es de RLS, no de interfaz; el diseño enlaza al gestor correcto |
| F #20 | Eliminar moneda sin confirmación | — | sustituido por `ConfirmDialog` en su gestor |

## G. Panel «PMS Hotel» → **Operación › Hotel (PMS)**

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| G #1-#3 | Esqueleto, recargar, «Guardar» | `Escritorio / Hotel (PMS)` + `SettingsSaveBar` | sustituido por el patrón común |
| G #5-#6 | «Hora de Check-in» / «Hora de Check-out» | `Escritorio / Hotel (PMS)` | calcado, con la zona horaria declarada |
| G #7 | «Zona Horaria» | — | **retirado**: zona en la sombra (§V #6) |
| G #8 | «Moneda Predeterminada» | — | **retirado**: moneda en la sombra (§V #7) |
| G #10-#13 | Confirmar automáticamente, Requerir depósito, Porcentaje, Días de cancelación | mismo frame | calcado |
| G #14-#15 | «Permitir overbooking» + porcentaje | — | **retirado**: describe un automatismo que no existe |
| G #17-#20 | Correos de confirmación y recordatorio, días antes, correo de mantenimiento | mismo frame | calcado, con validación de correo real |
| G #22-#25 | Early check-in / late check-out y sus cargos | mismo frame | calcado, con la moneda de la organización |
| G #27 | «Asignación automática de limpieza» | — | **retirado**: no existe el automatismo |
| T.1 #3 | Las 18 claves no las lee nadie | banner ámbar «Pendiente de cablear» del frame | Nuevo: el aviso honesto sustituye al silencio |

## K. Panel «Parking» → **Operación › Parking**

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| K #2 | Error inalcanzable | `Escritorio / Patrón — error` | sustituido |
| K #3 | Segunda cabecera | — | sustituido por la cabecera única |
| K #4-#7 | «Recargar», «Restablecer», «Guardar Cambios», aviso de cambios | `SettingsSaveBar` + `ConfirmDialog` | sustituido por el patrón común, con confirmación al descartar |
| K #8-#11 | Los 7 días de «Horarios de Operación» (21 claves) | `Escritorio / Parking`, fila «Horario de atención» | se muda a Organización › Horarios |
| K #13-#16 | Gracia al entrar, salir tras pagar, máximo de estancia, estancia nocturna | `Escritorio / Parking` | calcado |
| K #18-#19 | «Cobrar al entrar» y «Cobrar al salir», dos interruptores no excluyentes | mismo frame, «Cuándo se cobra» | sustituido por un `Select` único |
| K #20-#22 | Pago parcial, foto de la placa, tarifa automática | mismo frame | calcado |
| K #24-#28 | Ticket perdido completo | mismo frame | calcado, con la moneda de la organización en vez de `$` cableado |
| K #30-#34 | Los 5 mensajes personalizados | — | se mudan a «Avisos al cliente», con su propio editor y previsualización |
| K #36-#40 | Las 5 alertas | mismo frame | omitido en esta tanda: dependen de que exista el emisor de avisos (duda 4) |
| K #41 | `printing.*` — 5 claves **sin ningún control** | `Escritorio / Parking`, sección «Impresión» | **Nuevo**: se dibujan por primera vez |
| T.1 #1 | Las 34 claves no las lee nadie | banner ámbar del frame | Nuevo |

## P. Panel «Gym» → **Operación › Gimnasio**

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| P #2-#3 | Botón «atrás» a `/app/gym` y segunda cabecera | — | **retirado**: saca al usuario del panel de Configuración |
| P #4-#6 | «Actualizar», «Restablecer», «Guardar Cambios» sin aviso de cambios | `SettingsSaveBar` | sustituido por el patrón común |
| P #8-#10 | Requerir membresía, invitados, bloquear vencidos | `Escritorio / Gimnasio` | calcado |
| P #11 + #13 | «Permitir múltiples check-ins por día» y «Máximo check-ins diarios», que se contradicen | mismo frame, «Check-ins por día» | sustituido por un `Select` único |
| P #12 | «Verificación con foto» | mismo frame | calcado |
| P #15-#18 | Las 4 tolerancias | mismo frame | calcado |
| P #20-#21 | «Código QR» y «Búsqueda manual» | mismo frame | calcado |
| P #22-#24 | «Huella digital», «Lector de tarjetas», «Reconocimiento facial» | — | **retirado**: prometen biometría y hardware que no existen |
| P #26-#30 | Las 5 reglas de clases | mismo frame | calcado |
| P #32-#35 | Los 4 mensajes en editor HTML sin sanear | — | se mudan a «Avisos al miembro», saneados en servidor |
| P #37-#40 | Las 4 notificaciones | omitido en esta tanda: dependen del emisor de avisos (duda 4) | |
| T.1 #2 | Las 28 claves no las lee nadie | banner ámbar del frame | Nuevo |

## L. Panel «Calendario» → **Operación › Calendario**

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| L #3-#5 | Vista por defecto, primer día, fines de semana | `Escritorio / Calendario` | calcado |
| L #7 | «Hora de inicio» / «Hora de fin» del horario laboral | `Escritorio / Calendario`, fila «Horario de atención» | se muda a Organización › Horarios |
| L #9 | Módulos visibles (N casillas) | mismo frame, fila «Tipos de evento visibles» | sustituido por un gestor, para no apilar N casillas |
| L #11 | Colores por tipo | misma fila | se integra en el mismo gestor |
| L #13 | «Zona horaria» | — | se muda a Organización › Horarios, con su validación intacta |
| L #14 | «Recordatorio predeterminado» | `Escritorio / Calendario` | calcado |
| L #16-#18 | Mostrar hora, mostrar ubicación, modo compacto | mismo frame | calcado |
| L #19 | «Restaurar predeterminados» sin confirmación | acción de cabecera + `ConfirmDialog` | sustituido |
| L #20-#21 | Aviso de cambios y «Guardar cambios» | `SettingsSaveBar` | sustituido |

---

## I. Panel «Chat» → **Comunicación › Chat**

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| I #1 | Esqueleto con `&&` (estados vacíos falsos durante la carga) | `Escritorio / Patrón — cargando` | sustituido: un solo estado de carga por sección |
| I #2-#8 | Etiquetas: contador, recargar, «Nueva Etiqueta», vacío, tarjetas, menú, diálogo, borrado | `Escritorio / Chat`, tabla de etiquetas + paginación del kit | sustituido: la rejilla de tarjetas pasa a `DataTable` con `Pagination`, que hoy no existe |
| I #9-#15 | Respuestas rápidas: contador, buscador, alta, tarjetas, diálogo con variables | `Escritorio / Chat`, fila «Plantillas» | calcado, con el gestor en su propia pantalla |
| I #15 | Los 5 botones de variable que **concatenan al final** en vez de en el cursor | — | sustituido en el gestor: inserción en el cursor |
| I #16-#25 | Llaves API completas | `Escritorio / Llaves API y webhooks` | se muda a Integraciones |
| I #23 | «Esta es la única vez que verás la llave completa…» (falso) | `Diálogo «Llave de API creada»` | sustituido: ahora es cierto |
| T.4 #2-#3 | Llave con `Math.random()` y «hash» `btoa()` | mismo diálogo | sustituido: generación y hash en servidor |
| — | «Sugerir respuestas mientras se escribe» | `Escritorio / Chat` | Nuevo |

## J. Panel «Integraciones» → **Integraciones › Llaves API y webhooks**

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| J #2 | Segunda cabecera | — | sustituido |
| J #3-#4 | «Actualizar» y «Restaurar Defaults» | acción de cabecera + `ConfirmDialog` | calcado |
| J #6-#13 | Los 8 contadores («Conexiones», «Webhooks»…) con `?? 0` que oculta errores | `Escritorio / Llaves API y webhooks`, filas con su resumen | sustituido: los contadores viven junto a lo que cuentan, y un fallo se ve como error |
| J #15-#17 | Retención de eventos, jobs y logs | `Escritorio / Auditoría y retención` | se muda a Datos |
| J #19-#23 | Los 5 «Límites» | — | **retirado**: no se aplican en ningún `insert` |
| J #25-#28 | Los 4 «Valores por Defecto» | `Escritorio / Llaves API y webhooks`, sección «Webhooks salientes» | calcado los dos que tienen sentido (reintentos y espera); intervalo de sincronización y timeout omitidos: sin conexiones que sincronizar |
| J #30-#31 | Correo en error de conexión y en job fallido | mismo frame, sección «Avisos» | calcado |
| J #32 | «Slack Webhook URL» en texto plano | mismo frame, `SecretField State=guardado` | sustituido: secreto write-only fuera de `organization_settings` |
| J #34-#37 | Las 4 «Funcionalidades» | — | **retirado**: no deshabilitan nada; los enlaces a lo que dicen deshabilitar están en el mismo panel |
| J #40-#45 | Los 6 enlaces de documentación cableados | `Escritorio / Llaves API y webhooks` | sustituido: el acceso está en las propias filas |
| J #46 | «💡 Tips de uso» | — | retirado: uno de los cuatro consejos («Rota las API keys regularmente») es falso hoy |

## M. Panel «Timeline» → **Datos › Auditoría y retención**

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| M #3-#4 | «Exportar» / «Importar» sin validar esquema | acción de cabecera «Exportar» | calcado «Exportar»; «Importar» retirado: el JSON arbitrario se persiste tal cual |
| M #5-#7 | «Restablecer», «Guardar cambios», aviso de cambios | `SettingsSaveBar` + `ConfirmDialog` | sustituido |
| M #9 | «Mostrar payload completo» | — | **retirado**: nadie lo lee |
| M #10 | «Ocultar datos sensibles» | — | **retirado**: promete enmascarar contraseñas y tarjetas y no lo hace. Es el peor caso del módulo |
| M #11 | «Enmascarar nombres de usuarios» | — | **retirado**: nadie lo lee |
| M #12 | «Nota: Estas configuraciones afectan la visualización para todos…» | — | retirado: texto falso |
| M #15 | Las 11 casillas de fuentes, con el nombre crudo de la tabla debajo | `Escritorio / Auditoría y retención`, fila «Fuentes visibles» | sustituido: gestor propio, y el nombre técnico pasa a un `Tooltip` |
| M #16 | «Advertencia: … El timeline no mostrará eventos.» | — | retirado: aviso inexacto |
| M #18-#20 | Retención y archivado | — | **retirado**: no existe el archivo ni el job |
| M #22 | «Rango de fechas por defecto» | `Escritorio / Auditoría y retención` | calcado |
| M #23 | «Límite de exportación» | mismo frame | calcado |
| M #24 | «Eventos por página» | mismo frame | calcado |
| M #25 | «Actualizaciones en tiempo real» | — | omitido: choca con la decisión 10 de `PATRONES-TRANSVERSALES.md` §13 (el tiempo real se reserva a pedidos, comandas y caja) |
| M #26-#27 | «Vista compacta» y «Mostrar enlaces de correlación» | mismo frame | calcado |
| T.1 #5 | Los 13 ajustes no los lee nadie | banner ámbar del frame | Nuevo |

## O. Panel «Facturación Electrónica» → **Ventas y facturación**

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| O.1 #2 | «Credenciales de Factus» | `Escritorio / Facturación electrónica (listo)` | calcado |
| O.1 #3 | «Ambiente» (Sandbox/Producción) que no cambia nada | mismo frame, `Select State=disabled` con el motivo | sustituido: se muestra pero no se puede cambiar, y se dice por qué |
| O.1 #4 | «Proveedor» con Carvajal, Siigo y Alegra | mismo frame | sustituido: solo Factus, que es lo único implementado |
| O.1 #5 y #7 | «Client ID» y «Usuario / Email» | mismo frame | calcado |
| O.1 #6 y #8 | «Client Secret» y «Contraseña» leídos y escritos en claro desde el navegador | `SecretField State=guardado` / `State=vacío` / `State=editando` | **sustituido**: write-only, nunca vuelven en claro, con `autoComplete="new-password"` |
| O.1 #9 | «Configuración activa» (trampa que vacía el panel) | — | retirado: desactivarla oculta la fila y un «Guardar» posterior la sobrescribe con cadenas vacías |
| O.1 #10 | «Facturar siempre como electrónica» | `Escritorio / Facturación electrónica (listo)` | calcado |
| O.1 #11 | «Probar conexión» que prueba el `.env` | — | retirado hasta que el servidor use las credenciales de la organización |
| O.1 #12-#18 | Rangos DIAN: sincronizar, lista sin paginar, editar, vacío | `Escritorio / Facturación electrónica (listo)`, tabla + `Pagination`; `Escritorio / Patrón — vacío` | sustituido: `TableCell` del kit y la paginación única |
| O.1 #20-#22 | Prefijo, ID de rango, Desde, Hasta | `Escritorio / Facturación electrónica — editar un rango` | calcado, con validación de rango |
| O.1 #23 | «Número Actual» editable sin nada | mismo frame + `ConfirmDialog Variant=destructive` con motivo | **sustituido**: confirmación, motivo y auditoría |
| O.1 #24-#25 | Resolución y las tres fechas | mismo frame | calcado, normalizadas a día calendario en la zona de la organización |
| O.1 #26 | «Clave Técnica» en un input de texto plano | `SecretField State=guardado` | **sustituido** |
| O.1 #27 | «Test Set ID» | mismo frame | omitido: solo aplica al proceso de habilitación ante la DIAN, que no se hace desde aquí |
| O.1 #28 | «Rango activo» que la sincronización sobrescribe | mismo frame | sustituido: la sincronización deja de pisarlo |
| O.1 #30 | «Información» con «se usan las variables de entorno (.env)» | banner ámbar del frame | sustituido por el aviso honesto de que las credenciales las gestiona la plataforma |
| O.5 #12 | «Añadir rango» inalcanzable | `Escritorio / Patrón — vacío`, acción «Sincronizar rangos» | sustituido |
| U.2 | `invoice_sequences.alert_threshold` sin interfaz | — | omitido en esta tanda: falta decidir a quién se avisa (duda 5) |

## Q. Panel «Notificaciones»

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| Q #1-#26 | Los 6 canales, el silencio global, el «No molestar» y los 12 tipos | — | **se muda a** `/app/perfil`: `user_notification_preferences` no tiene `organization_id`; estar en Configuración de la organización es una mentira de ubicación |
| Q #2-#3 | Botón «atrás» que saca del panel y segunda cabecera `sticky` | — | retirado |
| Q #7 | `confirm()` «¿Restablecer todas las preferencias…?» | — | sustituido por `ConfirmDialog` en el perfil |
| Q #10 y #19 | Interruptores sin etiqueta y con lógica invertida (`checked={!mute}`) | — | sustituido en el perfil: etiqueta explícita y lógica directa |
| Q #22 | «Desde»/«Hasta» que guardan en cada pulsación | — | sustituido: guardado explícito |
| Q #26 | Los 12 chips de tipo, que nadie lee | — | retirado hasta que el emisor los consulte |
| V #8 | Duplicidad con `profile/NotificacionesSection` | — | resuelto: una sola pantalla, en el perfil |

## R. Panel «Datos sin conexión» → **Datos › Datos sin conexión**

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| R #1 | Estado «solo en Go Admin Desktop» | — | omitido: el panel solo aparece en Desktop, así que el aviso sobra dentro del menú |
| R #2-#7 | Cabecera, estado, última replicación, filas, tamaño, catálogo del POS | `Escritorio / Datos sin conexión (Go Admin Desktop)`, banner de estado | calcado |
| R #8-#9 | «Sincronizar ahora» y «Replicación completa» | mismo frame | calcado |
| R #10-#12 | Sin conexión, error, «N tablas con aviso» | mismo frame | calcado |
| R #13-#16 | Las 7 tarjetas de grupo y la tabla por entidad | mismo frame, tabla + `Pagination` | sustituido: una sola tabla paginada en vez de 7 tarjetas con 7 tablas |
| R | Fechas con `useFormatDate()` y la zona de la organización | mismo frame | calcado: **es el único panel que las trata bien** |
| — | «Sincronizar al abrir la aplicación» | mismo frame | Nuevo |

## H. Configuración › POS — lo que hay que alinear

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| D.17 completo | 13 tarjetas y 6 diálogos | Sección «Configuración › POS» de la página `05 POS y ventas` | ya diseñado: no se rehace |
| D.17.13 #2 | «Horas de Operación» escribe `organization_settings` desde el navegador, fuera de su servicio | `Escritorio / Patrón de panel (anotado)`, sección «Horario de atención» | se muda a Organización › Horarios |
| D.17.13 #3 | Cabeceras `!embedded` muertas y enlaces a una ruta inexistente | — | sustituido: con el menú lateral, el panel deja de necesitar cabecera propia |
| D.17.13 #8 | Fechas con `toLocaleString('es-CO')` sin la zona de la organización | — | omitido aquí: la corrección va en la página `05` |
| D.17.13 #9 | «Orden de visualización (display_order)», «Rango (rank)» | — | sustituido por el patrón: el nombre técnico va en un `Tooltip`, nunca en la etiqueta |
| D.17.1 #6 y #7 | «Propinas» y «Cargos de Servicio», que embeben módulos enteros en un diálogo | — | se mudan a su propia página del módulo POS |

---

## Verificación (script sobre la página `10 Configuración`)

| Comprobación | Resultado |
|---|---|
| Secciones que se solapan | **0** de 11 |
| Frames de primer nivel que se solapan dentro de su Sección | **0** de 56 nodos |
| Nodos que se salen de su Sección | **0** |
| Contenido que se sale de su frame | **0** |
| Instancias rotas (`getMainComponentAsync` sin componente) | **0** de 2.467 |
| Textos truncados (ancho necesario > ancho del nodo) | **0** de 147 con truncado activado |
| Etiquetas y contadores heredados de otra pantalla | **0** |

**Salvedad declarada:** quedan **9 desbordes de 2 px** del contador de avisos del `MobileTabBar`
sobre su propia caja. Es geometría del componente del kit, idéntica en todas las páginas que lo
instancian; no la introduce esta tanda y no se corrige aquí para no tocar `02 Componentes`.

## Capturas

`docs/design/figma/30-configuracion-00-indice.png` · `…-01-componentes.png` ·
`…-02-contenedor.png` · `…-03-patron.png` · `…-04-organizacion.png` ·
`…-05-ventas-facturacion.png` · `…-06-operacion.png` · `…-07-comunicacion.png` ·
`…-08-integraciones.png` · `…-09-datos.png` · `…-10-crm.png`

## Recuento

| Estado | Filas |
|---|---|
| calcado | 74 |
| Nuevo | 31 |
| sustituido por … | 58 |
| retirado: motivo | 29 |
| se muda a … | 28 |
| omitido: motivo | 13 |
| **Total** | **233** |

Las 29 filas «retirado» corresponden a los ≈130 ajustes individuales de §T.1: los 34 de Parking,
los 28 de Gym, los 18 de PMS, los 19 de Integraciones, los 13 de Timeline, los 4 de Roles y los
sueltos de HRM y Facturación. Ninguna se retira sin motivo escrito.
