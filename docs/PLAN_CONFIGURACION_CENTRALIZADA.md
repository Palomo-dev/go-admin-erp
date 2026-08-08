# Plan de Centralización: Página de Configuración Unificada

## Objetivo
Centralizar todas las configuraciones de módulos en **una sola página** `/app/configuracion` (sin subrutas), usando **tabs horizontales + modales**, mostrando solo las configuraciones de módulos activos.

---

## Decisión de Arquitectura

### Patrón elegido: Tabs horizontales de módulos + Modales para sub-configuraciones

**Inspiración**: Settings de Stripe (modal para sub-páginas), Vercel, Linear.

```
┌─────────────────────────────────────────────────────────────┐
│  [HRM] [POS] [PMS] [Chat] [Parking] [Calendario] [Roles]…  │  ← Tabs módulos (scroll horizontal)
├─────────────────────────────────────────────────────────────┤
│  🛒 POS                                                      │  ← Icono + título módulo
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ ⚙️ General    │  │ 🖨️ Impresiones│  │ # Consecutivos│      │  ← Cards/botones
│  │ Config básica │  │ Previsualizar │  │ Prefijos...  │      │     Click → MODAL
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────┐                                           │
│  │ 💻 Agente    │                                           │
│  │ Estado agente│                                           │
│  └──────────────┘                                           │
│                                                             │
│  ─── Configuración general inline ───                       │
│  [Toggle: Requerir caja]  [Toggle: Arqueo ciego]           │
│  [Métodos de pago]  [Impuestos]  [Cargos servicio]         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

  Al click en una card → MODAL (estilo Stripe):
  ┌────────────────────────────────────────────┐
  │  Previsualización de Impresiones      [X]  │
  │  ────────────────────────────────────────  │
  │                                            │
  │  <ImpresionesPage /> (componente completo) │
  │                                            │
  └────────────────────────────────────────────┘
```

### ¿Por qué NO sidebar?
- El sidebar ocupaba espacio permanente y duplicaba navegación
- Los tabs horizontales son más limpios y familiares (estilo Stripe/Vercel)
- No hay búsqueda: con pocos módulos activos, los tabs son suficientes

### ¿Por qué NO tabs de secciones?
- Los tabs de secciones del `ConfiguracionHeader` eran cosméticos: no controlaban qué se renderizaba
- Cada panel tenía sus propias tabs internas → doble sistema de tabs confuso
- Las sub-configuraciones (Impresiones, Consecutivos, Agente) se abren como **modales** al click

### ¿Cuándo usar cada patrón de UI?

| Patrón | Uso | Ejemplo |
|--------|-----|---------|
| **Tabs horizontales** | Navegación entre módulos | [HRM] [POS] [PMS] [Chat]… |
| **Modal (Dialog grande)** | Sub-configuraciones de un módulo | POS: Impresiones, Consecutivos, Agente |
| **Drawer (Sheet)** | Vistas de detalle/edición complejas | Detalle de canal CRM (603 líneas) |
| **Dialog** | Formularios cortos de crear/editar | Crear etiqueta, crear canal (ya existen) |
| **AlertDialog** | Confirmaciones destructivas | Eliminar, restablecer (ya existen) |

### Hallazgo clave del análisis
La mayoría de subpáginas **ya son componentes reutilizables**:
- POS: `impresiones/page.tsx` es solo `<ImpresionesPage />`, igual `consecutivos-ventas` → `<ConsecutivosPage />` y `agente-impresion` → `<DesktopAgentPanel />`
- Chat: ya usa `TagDialog`, `CreateChannelDialog`, `WidgetCodeDialog` (dialogs nativos)
- CRM canales: lista con dialogs ya lista para embeber

**Trabajo de refactor**:
1. CRM canal detalle `[id]` (603 líneas) → convertir a componente `<ChannelDetailDrawer channelId={...} />` dentro de un `Sheet`
2. Sub-páginas de POS (`ImpresionesPage`, `ConsecutivosPage`, `DesktopAgentPanel`) → envolver en modales al click en cards
3. Componentes con `min-h-screen` y `ArrowLeft` → agregar prop `embedded` para ocultar headers

---

## Cambios aplicados (sesiones recientes)

### Módulo "General" como default ✅ DONE

**Objetivo**: Reemplazar el tab "Organización" por un tab "General" que contenga literalmente los mismos componentes de `/app/organizacion/*`, evitando duplicación.

**Archivos creados**:
1. `src/components/organization/useOrgAdmin.ts` — Hook compartido que centraliza fetch de `orgId`, `userRole`, `isOrgAdmin`, `userBranches`, `loading`, `error` y `refresh`. Elimina ~80 líneas duplicadas por página.
2. `src/components/configuracion/panels/general/GeneralConfigPanel.tsx` — Panel con tabs internos (Información, Miembros, Invitaciones, Sucursales, Mis Organizaciones) que reutilizan exactamente los mismos componentes: `OrganizationInfoTab`, `MembersTab`, `InvitationsTab`, `BranchesTab`, `ManageOrganizationsTab`.

**Archivos modificados**:
1. `src/components/configuracion/config/configModulesRegistry.ts` — Agregado módulo `general` como primer `isCore`. **Eliminado** módulo `organizacion` (redundante con `general`). Import de `Building2` removido.
2. `src/components/configuracion/layout/ConfiguracionPanelRenderer.tsx` — Agregado `GeneralConfigPanel` al `PANEL_MAP` con import dinámico.
3. `src/components/configuracion/hooks/useConfiguracionState.ts` — Fallback cambiado de `'crm'` a `'general'` (primer módulo core).
4. `src/components/configuracion/layout/ConfiguracionLayout.tsx` — Lógica de `effectiveModuleId` para renderizar siempre el panel correcto aunque el moduleId no esté en displayModules.
5. `src/components/configuracion/layout/ConfiguracionHeader.tsx` — Icono envuelto en cuadrado redondeado con fondo azul claro (estilo POS).
6. `src/app/app/organizacion/informacion/page.tsx` — Refactorizado para usar `useOrgAdmin` (de 157 a 63 líneas).
7. `src/app/app/organizacion/miembros/page.tsx` — Refactorizado para usar `useOrgAdmin` (de 157 a 63 líneas).
8. `src/app/app/organizacion/invitaciones/page.tsx` — Refactorizado para usar `useOrgAdmin` (de 157 a 63 líneas).
9. `src/app/app/organizacion/sucursales/page.tsx` — Refactorizado para usar `useOrgAdmin` (de 214 a 78 líneas).
10. `src/app/app/organizacion/mis-organizaciones/page.tsx` — Refactorizado para usar `useOrgAdmin` (de 155 a 63 líneas).

**Estilo POS aplicado a los tabs**:
- Iconos en cuadrados redondeados (`p-1.5 rounded-lg`)
- Fondo azul claro cuando inactivo (`bg-blue-100 dark:bg-blue-900/30`)
- Fondo azul marca + icono blanco cuando activo (`group-data-[state=active]:bg-primary` + `group-data-[state=active]:text-white`)
- Tab activo con fondo suave (`data-[state=active]:bg-primary/10`)
- Sin sombra en tab activo (`data-[state=active]:shadow-none`)

**Resultado**:
- Al entrar a `/app/configuracion` abre **General** por defecto (no CRM)
- El tab "Organización" fue eliminado — su contenido vive dentro de "General"
- Cambios en `OrganizationInfoTab`, `MembersTab`, etc. se reflejan en ambos lugares (organización app + configuración general)
- Las 5 páginas de organización pasaron de ~150 líneas a ~63, eliminando código duplicado

---

## Estado Actual (inventario completo)

### 14 páginas de configuración reales

| Módulo | Ruta actual | Tipo | Reutilización |
|--------|------------|------|---------------|
| **CRM** | `/app/crm/configuracion` | Hub → links | Panel nuevo con tabs |
| **CRM canales** | `/app/crm/configuracion/canales` | Lista + dialogs | **Reutilizable directo** (`ChannelsList`, `CreateChannelDialog`) |
| **CRM canal detalle** | `/app/crm/configuracion/canales/[id]` | Página 603 líneas con tabs | **Requiere refactor** → `Sheet` drawer |
| **CRM etiquetas** | `/app/crm/configuracion/etiquetas` | Lista + dialog | Reutilizable directo |
| **HRM** | `/app/hrm/configuracion` | Tabs (general, monedas) | **Reutilizable directo** (`SettingsForm`, `CurrenciesCard`) |
| **PMS** | `/app/pms/configuracion` | Grid de 5 secciones | **Reutilizable directo** (5 componentes) |
| **POS** | `/app/pos/configuracion` | `<ConfiguracionPage />` | **Reutilizable directo** |
| **POS impresiones** | `/app/pos/configuracion/impresiones` | `<ImpresionesPage />` | **Reutilizable directo** |
| **POS consecutivos** | `/app/pos/configuracion/consecutivos-ventas` | `<ConsecutivosPage />` | **Reutilizable directo** |
| **POS agente** | `/app/pos/configuracion/agente-impresion` | `<DesktopAgentPanel />` | **Reutilizable directo** |
| **Chat** | `/app/chat/configuracion/*` | 3 páginas + `ConfigNavTabs` | **Reutilizable directo** (Tags, API keys, respuestas) |
| **Chat IA** | `/app/chat/ia/configuracion` | Formulario | Reutilizable |
| **Integraciones** | `/app/integraciones/configuracion` | Formulario + stats | **Reutilizable directo** |
| **Parking** | `/app/parking/configuracion` | Grid 6 secciones | **Reutilizable directo** |
| **Calendario** | `/app/calendario/configuracion` | Formulario | **Reutilizable directo** (`CalendarSettingsForm` + hook) |
| **Timeline** | `/app/timeline/configuracion` | 4 secciones | **Reutilizable directo** |
| **Roles** | `/app/roles/configuracion` | `<RolesConfigurationSettings />` | **Reutilizable directo** |
| **Finanzas FE** | `/app/finanzas/facturacion-electronica/configuracion` | Formulario + rangos | Reutilizable (764 líneas, subdividir en componentes) |
| **Gym** | `/app/gym/ajustes` | Grid 6 cards | **Reutilizable directo** |
| **Notificaciones** | `/app/notificaciones/preferencias` | Lista canales | **Reutilizable directo** |

### Páginas que PARECEN configuración pero NO lo son (excluir)

| Ruta | Qué es realmente |
|------|------------------|
| `/app/inventario/ajustes` | Gestión **operativa** de ajustes de stock (CRUD con aprobaciones) |
| `/app/hrm/asistencia/ajustes` | Gestión **operativa** de correcciones de marcaciones |

### Integrado en Configuración (ya no fuera de scope)
- `/app/organizacion/*` → ahora compartido via `useOrgAdmin` + `GeneralConfigPanel` con tabs internos. Las páginas siguen existiendo en `/app/organizacion/*` pero usan el mismo hook y componentes.
- `/app/perfil` → config a nivel usuario personal

---

## Arquitectura Propuesta

### Estructura de archivos (máxima subdivisión en componentes)

```
src/
├── app/app/configuracion/
│   └── page.tsx                            # ÚNICA ruta - thin wrapper
│
└── components/configuracion/
    ├── index.ts                            # Barrel exports
    │
    ├── layout/
    │   ├── ConfiguracionLayout.tsx         # Layout principal: tabs módulos + content
    │   ├── ConfiguracionHeader.tsx         # Icono + título del módulo (sin tabs de secciones)
    │   ├── ConfiguracionPanelRenderer.tsx  # Lazy load del panel según moduleId
    │   └── ConfiguracionEmpty.tsx          # Estado vacío / módulo no activo
    │
    ├── config/
    │   └── configModulesRegistry.ts        # Registro central: módulos, iconos, moduleCode
    │
    ├── hooks/
    │   ├── useConfiguracionState.ts        # Estado URL (modulo) via useSearchParams
    │   └── useActiveConfigModules.ts       # Filtrado por módulos activos de la org
    │
    └── panels/
        ├── general/
        │   └── GeneralConfigPanel.tsx     # Tabs internos con componentes de organización
        ├── crm/
        │   ├── CRMConfigPanel.tsx          # Cards: Canales, Etiquetas, API Keys, Widget
        │   └── drawers/ChannelDetailDrawer.tsx  # REFACTOR de canales/[id]
        ├── hrm/
        │   └── HRMConfigPanel.tsx          # SettingsForm + CurrenciesCard inline
        ├── pms/
        │   └── PMSConfigPanel.tsx          # 5 settings components en grid inline
        ├── pos/
        │   ├── POSConfigPanel.tsx          # ConfiguracionPage embedded + cards con modales
        │   └── modals/{ImpresionesModal, ConsecutivosModal, AgenteModal}.tsx
        ├── chat/
        │   └── ChatConfigPanel.tsx         # Etiquetas + Llaves API + Respuestas inline
        ├── integraciones/
        │   └── IntegracionesConfigPanel.tsx
        ├── parking/
        │   └── ParkingConfigPanel.tsx
        ├── calendario/
        │   └── CalendarioConfigPanel.tsx
        ├── timeline/
        │   └── TimelineConfigPanel.tsx
        ├── roles/
        │   └── RolesConfigPanel.tsx
        ├── facturacion/
        │   ├── FacturacionConfigPanel.tsx
        │   └── sections/{CredencialesFactusSection, RangosDianSection, RangoEditForm}.tsx
        ├── gym/
        │   └── GymConfigPanel.tsx
        └── notificaciones/
            └── NotificacionesConfigPanel.tsx
```

### Archivos eliminados (ya no necesarios)
- `ConfiguracionSidebar.tsx` — reemplazado por tabs horizontales
- `ConfiguracionSidebarItem.tsx` — reemplazado por tabs horizontales
- `ConfiguracionSearch.tsx` — eliminado (no hay búsqueda con tabs)

### Registro central de módulos

`config/configModulesRegistry.ts` — fuente única de verdad:

```typescript
export interface ConfigModule {
  id: string;                    // 'crm', 'hrm', etc.
  moduleCode: string;            // código en BD ('crm', 'pms_hotel', 'operations'...)
  title: string;
  description: string;
  icon: LucideIcon;
  isCore?: boolean;              // roles siempre visible
  // SIN sections — las sub-configs se manejan dentro de cada panel con modales
}

export const CONFIG_MODULES: ConfigModule[] = [
  { id: 'general', moduleCode: 'general', title: 'General', isCore: true, ... },
  { id: 'crm', moduleCode: 'crm', title: 'CRM', ... },
  { id: 'hrm', moduleCode: 'hrm', ... },
  // ...
];
```

### Manejo de estado por URL

`useConfiguracionState.ts`:
```typescript
// /app/configuracion?modulo=crm
const searchParams = useSearchParams();
const modulo = searchParams.get('modulo') ?? 'general';
// SIN seccion — las sub-configs se abren con modales internos del panel
// router.replace con nuevos params al cambiar módulo (sin recargar página)
```

### Performance: lazy loading de paneles

Cada panel se carga con `next/dynamic` — solo se descarga el código del módulo cuando el usuario lo selecciona:

```typescript
const CRMConfigPanel = dynamic(() => import('./panels/crm/CRMConfigPanel'), {
  loading: () => <PanelSkeleton />
});
```

---

## Mapeo completo de módulos → contenido del panel

| Módulo | moduleCode BD | Contenido del panel | Sub-configs (modales) |
|--------|---------------|---------------------|----------------------|
| CRM | `crm` | Cards: Canales, Etiquetas, API Keys, Widget | Detalle de canal (Sheet drawer) |
| HRM | `hrm` | SettingsForm + CurrenciesCard inline | — |
| PMS | `pms_hotel` | 5 settings components en grid inline | — |
| POS | `pos` | ConfiguracionPage embedded (general, toggles, stats) | Impresiones, Consecutivos, Agente (modales) |
| Chat | `chat` | Etiquetas + Llaves API + Respuestas inline | — |
| Integraciones | `integrations` | Form + stats inline | — |
| Parking | `parking` | 6 secciones inline | — |
| Calendario | `calendar` | CalendarSettingsForm inline | — |
| Timeline | `operations` | 4 secciones inline | — |
| Roles | `roles` | RolesConfigurationSettings inline | — |
| Facturación | `finance` | Credenciales + Rangos DIAN inline | — |
| Gym | `gym` | 6 cards inline | — |
| Notificaciones | `notifications` | Preferencias de canales inline | — |
| General | `general` (core) | Tabs internos: OrganizationInfoTab, MembersTab, InvitationsTab, BranchesTab, ManageOrganizationsTab | — |

---

## Plan de Implementación por Fases

### FASE 1: Infraestructura base ✅ DONE

**Archivos creados**:
1. `src/app/app/configuracion/page.tsx` — thin wrapper
2. `src/components/configuracion/layout/ConfiguracionLayout.tsx`
3. `src/components/configuracion/layout/ConfiguracionHeader.tsx`
4. `src/components/configuracion/layout/ConfiguracionPanelRenderer.tsx`
5. `src/components/configuracion/layout/ConfiguracionEmpty.tsx`
6. `src/components/configuracion/config/configModulesRegistry.ts`
7. `src/components/configuracion/hooks/useConfiguracionState.ts`
8. `src/components/configuracion/hooks/useActiveConfigModules.ts`

**Estado actual**: Funciona con sidebar + búsqueda + tabs de secciones.

---

### FASE 1b: Refactor del layout — Tabs horizontales ✅ DONE

**Objetivo**: Eliminar sidebar, búsqueda y tabs de secciones. Reemplazar por tabs horizontales de módulos.

**Cambios**:
1. `ConfiguracionLayout.tsx` — Reescribir:
   - Eliminar `<aside>` con sidebar y búsqueda
   - Agregar `<Tabs>` horizontal con scroll para los módulos activos
   - Al seleccionar un tab → `setModule(moduleId)` (actualiza URL)
   - El header muestra solo icono + título (sin tabs de secciones)
   - El contenido renderiza el panel directamente
2. `ConfiguracionHeader.tsx` — Simplificar:
   - Eliminar `sections`, `section`, `onSectionChange` de props
   - Solo mostrar icono + título + descripción
3. `ConfiguracionPanelRenderer.tsx` — Simplificar:
   - Solo recibe `moduleId` (sin `sectionId`)
4. `configModulesRegistry.ts` — Simplificar:
   - Eliminar `sections` de `ConfigModule`
   - Eliminar `ConfigSection` interface
   - Eliminar `getDefaultSection`
5. `useConfiguracionState.ts` — Simplificar:
   - Eliminar `sectionId`, `currentSection`, `setSection`
   - Solo manejar `moduleId` y `setModule`
6. **Eliminar archivos**:
   - `ConfiguracionSidebar.tsx`
   - `ConfiguracionSidebarItem.tsx`
   - `ConfiguracionSearch.tsx`

---

### FASE 2: Paneles simples reutilizables ✅ DONE (8 módulos)

Paneles creados: Parking, Timeline, Integraciones, Roles, Calendario, Gym, Notificaciones, Facturación.

**Cambio pendiente**: Quitar headers con `ArrowLeft` y `min-h-screen` (agregar prop `embedded` donde aplique).

---

### FASE 3: Paneles con sub-configuraciones (4 módulos) — REVISIÓN

**Nuevo enfoque**: Sin tabs internas. Las sub-configuraciones se muestran como **cards/botones** que abren **modales** (estilo Stripe).

| Panel | Contenido inline | Sub-configs (modales) |
|-------|-----------------|----------------------|
| `HRMConfigPanel` | SettingsForm + CurrenciesCard (todo visible, sin tabs) | — |
| `PMSConfigPanel` | 5 settings components en grid (sin `SettingsHeader` propio) | — |
| `POSConfigPanel` | `ConfiguracionPage` con `embedded=true` (stats, toggles, métodos de pago) | Modal: `<ImpresionesPage>` Modal: `<ConsecutivosPage>` Modal: `<DesktopAgentPanel>` |
| `ChatConfigPanel` | Etiquetas + Llaves API + Respuestas (todo visible, sin tabs) | — |

**Cambios en componentes existentes** (agregar prop `embedded`):
- `ConfiguracionPage.tsx`: `embedded=true` → ocultar `ArrowLeft`, `min-h-screen`, `p-6`; usar `min-h-[400px]` y `space-y-4`
- `ConsecutivosPage.tsx`: `embedded=true` → ocultar `ArrowLeft`, `min-h-screen`, header con link de volver
- `ImpresionesPage.tsx`: `embedded=true` → ocultar `ArrowLeft`, `min-h-screen`, header con link de volver
- `DesktopAgentPanel.tsx`: `embedded=true` → ocultar `ArrowLeft`, `min-h-screen`, header con link de volver

**Modales del POS** (nuevos):
- `ImpresionesModal.tsx`: `<Dialog>` grande (max-w-4xl) que renderiza `<ImpresionesPage embedded />`
- `ConsecutivosModal.tsx`: `<Dialog>` grande (max-w-4xl) que renderiza `<ConsecutivosPage embedded />`
- `AgenteModal.tsx`: `<Dialog>` grande (max-w-2xl) que renderiza `<DesktopAgentPanel embedded />`

**POSConfigPanel** (reescribir):
```tsx
export function POSConfigPanel() {
  const [modal, setModal] = useState<'impresiones' | 'consecutivos' | 'agente' | null>(null);
  return (
    <div className="space-y-6">
      <ConfiguracionPage embedded />
      {/* Las cards de "Configuración Avanzada" ya existen en ConfiguracionPage */}
      {/* Pero en vez de <Link>, usar onClick={() => setModal('impresiones')} */}
      <ImpresionesModal open={modal === 'impresiones'} onClose={() => setModal(null)} />
      <ConsecutivosModal open={modal === 'consecutivos'} onClose={() => setModal(null)} />
      <AgenteModal open={modal === 'agente'} onClose={() => setModal(null)} />
    </div>
  );
}
```

**HRMConfigPanel** (simplificar):
- Quitar `<Tabs>` internas
- Renderizar `SettingsForm` y `CurrenciesCard` secuencialmente (todo visible)
- Quitar botón de `RefreshCw` suelto (el panel carga solo)

**ChatConfigPanel** (simplificar):
- Quitar `<Tabs>` internas
- Renderizar Etiquetas, Llaves API y Respuestas en secciones con `<Card>` headers
- Cada sección tiene su propio header (`TagsHeader`, `ApiKeysHeader`, `QuickRepliesHeader`)

**PMSConfigPanel** (simplificar):
- Quitar `SettingsHeader` propio (el `ConfiguracionHeader` del layout ya muestra título)
- Mantener grid de 5 settings components
- Los botones Save/Refresh moverlos al `ConfiguracionHeader` o a una barra de acciones

---

### FASE 4: Panel CRM + Drawer de detalle de canal

1. `CRMConfigPanel` con cards: Canales, Etiquetas, API Keys, Widget
2. `CanalesCard`: embebe `ChannelsList` + `CreateChannelDialog` + `WidgetCodeDialog` (ya existen)
3. **`ChannelDetailDrawer`**: refactor de `canales/[id]/page.tsx` (603 líneas):
   - Extraer a `@/components/chat/channels/website/ChannelDetailContent.tsx` que reciba `channelId` como prop
   - Envolver en `<Sheet>` (drawer lateral derecho, ancho completo en mobile)
   - Al hacer click en un canal de la lista → abre drawer (en vez de navegar)
   - Los tabs internos del detalle (general, widget, código) se mantienen dentro del drawer

---

### FASE 5: Actualizar navegación del sidebar

**`SidebarNavigation.tsx`** — cambiar hrefs de "Configuración" a la página central con search param:

| Módulo | Antes | Después |
|--------|-------|---------|
| CRM | `/app/crm/configuracion` | `/app/configuracion?modulo=crm` |
| HRM | `/app/hrm/configuracion` | `/app/configuracion?modulo=hrm` |
| POS | `/app/pos/configuracion` | `/app/configuracion?modulo=pos` |
| PMS | `/app/pms/configuracion` | `/app/configuracion?modulo=pms` |
| Chat | `/app/chat/configuracion/etiquetas` | `/app/configuracion?modulo=chat` |
| Parking | `/app/parking/configuracion` | `/app/configuracion?modulo=parking` |
| Calendario | `/app/calendario/configuracion` | `/app/configuracion?modulo=calendario` |
| Roles | `/app/roles/configuracion` | `/app/configuracion?modulo=roles` |
| Integraciones | `/app/integraciones/configuracion` | `/app/configuracion?modulo=integraciones` |
| Timeline | `/app/timeline/configuracion` | `/app/configuracion?modulo=timeline` |
| Finanzas FE | `/app/finanzas/facturacion-electronica/configuracion` | `/app/configuracion?modulo=facturacion` |
| Gym | `/app/gym/ajustes` | `/app/configuracion?modulo=gym` |
| Notificaciones | `/app/notificaciones/preferencias` | `/app/configuracion?modulo=notificaciones` |

**Nota**: Sin `seccion` en la URL — las sub-configs se abren con modales internos.

**También**:
- `AppLayout.tsx`: sincronizar `MODULES_WITH_SUBMENU` si aplica
- `modulePages.ts`: agregar `/app/configuracion` a `MODULE_HREF_TO_CODE` y a `MODULE_PAGES` (para que el filtrado por páginas activas lo controle)
- Opción: agregar item global "Configuración" en el sidebar principal

---

### FASE 6: Redirects de compatibilidad

Convertir las 14+ rutas antiguas en redirects (preservando deep-links):

```typescript
// /app/crm/configuracion/page.tsx
import { redirect } from 'next/navigation';
export default function Page() {
  redirect('/app/configuracion?modulo=crm');
}
```

Mapeo de redirects:
- `/app/{modulo}/configuracion` → `/app/configuracion?modulo={modulo}`
- `/app/crm/configuracion/canales` → `/app/configuracion?modulo=crm&seccion=canales`
- `/app/crm/configuracion/canales/[id]` → `/app/configuracion?modulo=crm&seccion=canales&canal=[id]` (abre drawer)
- `/app/gym/ajustes` → `/app/configuracion?modulo=gym`
- `/app/notificaciones/preferencias` → `/app/configuracion?modulo=notificaciones`

---

### FASE 7: Eliminar rutas antiguas

Eliminar directorios de páginas (los componentes en `src/components/**` se MANTIENEN):

```
src/app/app/crm/configuracion/              # ELIMINAR
src/app/app/hrm/configuracion/              # ELIMINAR
src/app/app/pms/configuracion/              # ELIMINAR
src/app/app/pos/configuracion/              # ELIMINAR
src/app/app/chat/configuracion/             # ELIMINAR
src/app/app/chat/ia/configuracion/          # ELIMINAR
src/app/app/integraciones/configuracion/    # ELIMINAR
src/app/app/parking/configuracion/          # ELIMINAR
src/app/app/calendario/configuracion/       # ELIMINAR
src/app/app/timeline/configuracion/         # ELIMINAR
src/app/app/roles/configuracion/            # ELIMINAR
src/app/app/finanzas/facturacion-electronica/configuracion/  # ELIMINAR
src/app/app/gym/ajustes/                    # ELIMINAR
src/app/app/notificaciones/preferencias/    # ELIMINAR
```

---

## Consideraciones técnicas

### 1. Reutilización de componentes
- Los componentes en `src/components/{modulo}/configuracion|ajustes|preferencias/` **se modifican mínimamente**: agregar prop `embedded` para ocultar headers con "volver" y `min-h-screen`
- Los page.tsx actuales son la "receta" para cada panel: misma lógica de carga, mismos handlers
- Las sub-páginas (Impresiones, Consecutivos, Agente) se renderizan dentro de modales con `embedded=true`

### 2. Carga de datos por panel
- Cada panel carga sus datos solo cuando se monta (al seleccionar el tab del módulo)
- No se cargan datos de módulos no seleccionados → performance óptima
- `next/dynamic` para code splitting por panel

### 3. Estado en URL
- `useSearchParams` + `router.replace` (sin `scroll`)
- URLs compartibles: `/app/configuracion?modulo=pos`
- SIN `seccion` en URL — las sub-configs son modales internos (estado local del panel)
- El drawer de canal CRM: estado local del panel (abrir/cerrar sin afectar URL)

### 4. Permisos y filtrado
- Tabs filtrados por `getActiveModules(orgId)` (módulos activos de la org)
- Respeta `jobPositionVisiblePages` si `/app/configuracion` se agrega a `MODULE_PAGES`
- Módulos inactivos: no aparecen en los tabs

### 5. Responsive
- Desktop: tabs horizontales con scroll si exceden el ancho
- Mobile: tabs con scroll horizontal (swipe nativo); modales a pantalla completa
- Los modales usan `max-w-4xl` en desktop y `w-full` en mobile

### 6. i18n
- Usar `next-intl` como el resto: namespace `org.configuracion`

---

## Estimación de esfuerzo

| Fase | Descripción | Archivos nuevos | Refactors | Complejidad |
|------|------------|-----------------|-----------|-------------|
| 1 | Infraestructura base | 8 | 0 | Media ✅ |
| 1b | Refactor layout → tabs horizontales | 0 | 6 archivos | Media |
| 2 | Paneles simples | 8+ | 0 (copiar lógica) | Baja ✅ |
| 3 | Paneles con sub-configs + modales | 3 modales + 4 paneles | 4 componentes (embedded) | Media |
| 4 | CRM + drawer canal | 6 | 1 (canales/[id]) | **Media-Alta** |
| 5 | Navegación sidebar | 0 | 3 archivos | Baja |
| 6 | Redirects | 0 | 16 rutas | Baja |
| 7 | Eliminar rutas | 0 | 14 dirs | Baja |

**Total**: ~30 archivos nuevos, 1 refactor real, ~20 modificados

**Riesgo principal**: Fase 4 (drawer de canal CRM). Todo lo demás es reutilización directa.

---

## Problemas identificados en la implementación actual (Fase 3)

### 1. Doble sistema de tabs/secciones
El `ConfiguracionHeader` tiene tabs de secciones definidas en `configModulesRegistry.ts`, pero cada panel ignora esas secciones y crea sus propias tabs internas. Resultado: tabs cosméticos que no controlan nada + tabs internas duplicadas.

### 2. Headers duplicados
Cada panel tiene su propio header (ArrowLeft, título, botones Save/Refresh) además del `ConfiguracionHeader` del layout. Doble header confuso.

### 3. Loading states inconsistentes
Cada panel usa un estilo diferente: spinner centrado, skeleton con animate-pulse, h-screen (rompe layout), Loader2, etc.

### 4. Sub-rutas externas activas en POS
`ConfiguracionPage` tiene 5 links `<Link href="/app/pos/...">` que sacan al usuario de la página centralizada.

### 5. Lógica repetida entre paneles
Cada panel repite: `useOrganization()`, `useToast()`, estado isLoading/isRefreshing/isSaving, función loadData, patrón try/catch con toast, botones de refresh/save.

### Solución aplicada en Fase 1b + Fase 3 revisión
- Eliminar sidebar + búsqueda → tabs horizontales
- Eliminar tabs de secciones → solo icono + título en header
- Eliminar tabs internas de paneles → contenido inline o modales
- Agregar `embedded` a sub-componentes → ocultar headers/paddings
- Sub-configs de POS → modales estilo Stripe
