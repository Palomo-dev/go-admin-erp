# Bloque de sesión del sidebar — paridad funcional (diseño nuevo vs. código actual)

Fuente del código actual: `src/components/app-layout/AccountSwitcher.tsx`,
`src/lib/auth/accountSwitcher.ts`, `src/components/app-layout/Sidebar/SidebarNavigation.tsx`
(pie), `src/components/app-layout/AppLayout.tsx` (drawer móvil). Diseño: Figma
«GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`), páginas 02 y 03.

Regla: **ninguna función actual se pierde**. Si al implementar algo no cabe, se
anota aquí antes de quitarlo, no después.

| Función actual (código) | Dónde vive en el diseño nuevo |
|---|---|
| Trigger escritorio expandido: nombre, rol, nombre del plan | `UserBlock` expandido: avatar, nombre, rol, chip del plan |
| Trigger escritorio colapsado: solo avatar + tooltip (nombre/rol) a la derecha | `UserBlock` collapsed / collapsed-hover con tooltip |
| Trigger móvil (avatar 40 + nombre + rol, ancho completo, en el pie del drawer) | `MobileDrawer` → pie con `UserBlock` (área táctil ≥ 48 px) |
| Panel escritorio: popover anclado arriba del bloque, `max-h 70vh` con scroll | `SessionPopover` (320 px, shadow/md, 70 vh + scroll) |
| Panel móvil: bottom sheet «Mi cuenta» con × | `SessionSheet` a ancho completo sobre el drawer, título «Mi cuenta», × |
| Cabecera del panel → `/app/perfil` (avatar 48, nombre, correo, plan, chevron) | Cabecera navegable «Ver mi perfil» (chevron ›) |
| Nombre del plan (`planName`) | Chip del plan en trigger + `PlanCard` (plan, estado prueba/activo, días, precio) |
| Cuentas guardadas (máx. 4) con nombre, correo, org · rol | `AccountSwitcher` con `AccountRow` (acordeón bajo la cabecera) |
| Aviso «sesión inactiva» (>20 días sin uso) | `AccountRow` state=stale (ámbar) |
| Quitar cuenta de este dispositivo (X) | Kebab de `AccountRow` → «Quitar de este dispositivo» |
| Estado «cambiando…» con spinner | `AccountRow` state=switching + resto atenuado |
| Error inline al cambiar | Texto de error rojo sobre la lista |
| «Agregar otra cuenta» → `/auth/login?addAccount=1` | Fila «Agregar otra cuenta» (icono +) |
| Aviso de máximo 4 cuentas | Texto bajo la lista cuando aplica |
| Limpieza de organización/sucursal/caché al cambiar | Comportamiento, no UI (se conserva en código) |
| «Mi suscripción» → `/app/plan` (botón azul; en móvil dentro del scroll) | MenuItem «Mi suscripción» + botón «Ver suscripción» de `PlanCard` |
| «Cerrar sesión» (rojo) con estado «cerrando…» | MenuItem destructivo «Cerrar sesión» + estado «Cerrando sesión…» |
| Selector de organización arriba del sidebar | Fuera de alcance: se conserva tal cual (slot en `MobileDrawer`) |
| Header (perfil del header, tema, notificaciones) | Fuera de alcance: no se toca |

Añadidos del diseño (no existen hoy): uso del plan (usuarios/sucursales/
almacenamiento con `PlanUsageMeter`), «Mejorar plan», acceso «Descargar GO Admin
Desktop», interruptor de tema dentro del panel, estado offline de las filas de
cuenta en el Desktop («Requiere conexión»).
