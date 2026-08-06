# Plan de Centralización: Página de Configuración Unificada

## Objetivo
Centralizar todas las configuraciones de módulos en **una sola página** `/app/configuracion` (sin subrutas), usando **tabs + drawers + dialogs**, mostrando solo las configuraciones de módulos activos.

---

## Decisión de Arquitectura

### Patrón elegido: Single Page con Sidebar interno + Tabs + Drawers

**Inspiración**: Settings de Stripe, Vercel, Linear.

```
┌─────────────────────────────────────────────────────────────┐
│  Configuración                              [Buscar...]     │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  MÓDULOS     │  [Tab1] [Tab2] [Tab3] [Tab4]                 │
│              │  ──────────────────────────────────────────  │
│  ● CRM       │                                              │
│  ○ HRM       │   Contenido de la sección activa             │
│  ○ POS       │   (componentes existentes reutilizados)      │
│  ○ PMS       │                                              │
│  ○ Chat      │                                              │
│  ○ Parking   │                                              │
│  ...         │                                              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### ¿Por qué NO subrutas?
- Una sola URL: `/app/configuracion?modulo=crm&seccion=canales`
- Estado en `searchParams` → URLs compartibles y botón "atrás" funciona
- No hay que crear 14 directorios de rutas
- Navegación instantánea entre módulos (sin page reload)

### ¿Cuándo usar cada patrón de UI?

| Patrón | Uso | Ejemplo |
|--------|-----|---------|
| **Tabs** | Secciones de config del mismo módulo | PMS: General / Reservas / Notificaciones |
| **Drawer (Sheet)** | Vistas de detalle/edición complejas | Detalle de canal CRM (603 líneas con tabs internos) |
| **Dialog** | Formularios cortos de crear/editar | Crear etiqueta, crear canal (ya existen) |
| **AlertDialog** | Confirmaciones destructivas | Eliminar, restablecer (ya existen) |

### Hallazgo clave del análisis
La mayoría de subpáginas **ya son componentes reutilizables**:
- POS: `impresiones/page.tsx` es solo `<ImpresionesPage />`, igual `consecutivos-ventas` → `<ConsecutivosPage />` y `agente-impresion` → `<DesktopAgentPanel />`
- Chat: ya usa `TagDialog`, `CreateChannelDialog`, `WidgetCodeDialog` (dialogs nativos)
- CRM canales: lista con dialogs ya lista para embeber

**Único trabajo real de refactor**: CRM canal detalle `[id]` (603 líneas) → convertir a componente `<ChannelDetailDrawer channelId={...} />` dentro de un `Sheet`.

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

### Fuera del scope
- `/app/organizacion/*` → ya es hub de config organizacional (se enlaza desde el sidebar del hub)
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
    │   ├── ConfiguracionLayout.tsx         # Layout principal: sidebar + content
    │   ├── ConfiguracionSidebar.tsx        # Lista de módulos (filtrada por activos)
    │   ├── ConfiguracionSidebarItem.tsx    # Item individual del sidebar
    │   ├── ConfiguracionHeader.tsx         # Header del módulo seleccionado
    │   ├── ConfiguracionSearch.tsx         # Buscador de configuraciones
    │   └── ConfiguracionEmpty.tsx          # Estado vacío / módulo no activo
    │
    ├── config/
    │   └── configModulesRegistry.ts        # Registro central: módulos, secciones, iconos, moduleCode
    │
    ├── hooks/
    │   ├── useConfiguracionState.ts        # Estado URL (modulo/seccion) via useSearchParams
    │   └── useActiveConfigModules.ts       # Filtrado por módulos activos de la org
    │
    └── panels/
        ├── index.ts                        # Exports + lazy loading (next/dynamic)
        ├── crm/
        │   ├── CRMConfigPanel.tsx          # Panel con tabs
        │   ├── tabs/CanalesTab.tsx         # Embebe ChannelsList + dialogs existentes
        │   ├── tabs/EtiquetasTab.tsx
        │   ├── tabs/ApiKeysTab.tsx
        │   ├── tabs/WidgetTab.tsx
        │   └── drawers/ChannelDetailDrawer.tsx  # REFACTOR de canales/[id]
        ├── hrm/
        │   └── HRMConfigPanel.tsx          # Reutiliza SettingsForm + CurrenciesCard
        ├── pms/
        │   └── PMSConfigPanel.tsx          # Reutiliza los 5 settings components
        ├── pos/
        │   ├── POSConfigPanel.tsx          # Tabs
        │   └── tabs/{GeneralTab, ImpresionesTab, ConsecutivosTab, AgenteTab}.tsx
        ├── chat/
        │   ├── ChatConfigPanel.tsx
        │   └── tabs/{EtiquetasTab, LlavesApiTab, RespuestasTab, IaTab}.tsx
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
        │   ├── FacturacionConfigPanel.tsx  # SUBDIVIDIR la página de 764 líneas
        │   ├── sections/CredencialesFactusSection.tsx
        │   ├── sections/RangosDianSection.tsx
        │   └── sections/RangoEditForm.tsx
        ├── gym/
        │   └── GymConfigPanel.tsx
        └── notificaciones/
            └── NotificacionesConfigPanel.tsx
```

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
  sections: ConfigSection[];     // tabs del módulo
}

export const CONFIG_MODULES: ConfigModule[] = [
  { id: 'crm', moduleCode: 'crm', title: 'CRM', sections: [...] },
  { id: 'hrm', moduleCode: 'hrm', ... },
  // ...
];
```

### Manejo de estado por URL

`useConfiguracionState.ts`:
```typescript
// /app/configuracion?modulo=crm&seccion=canales
const searchParams = useSearchParams();
const modulo = searchParams.get('modulo') ?? 'general';
const seccion = searchParams.get('seccion') ?? defaultSection(modulo);
// router.replace con nuevos params al cambiar (sin recargar página)
```

### Performance: lazy loading de paneles

Cada panel se carga con `next/dynamic` — solo se descarga el código del módulo cuando el usuario lo selecciona:

```typescript
const CRMConfigPanel = dynamic(() => import('./panels/crm/CRMConfigPanel'), {
  loading: () => <PanelSkeleton />
});
```

---

## Mapeo completo de módulos → tabs/secciones

| Módulo | moduleCode BD | Tabs/Secciones | Drawer |
|--------|---------------|----------------|--------|
| CRM | `crm` | Canales, Etiquetas, API Keys, Widget | Detalle de canal (Sheet) |
| HRM | `hrm` | General, Monedas | — |
| PMS | `pms_hotel` | General, Reservas, Notificaciones, Check-in/out, Operaciones | — |
| POS | `pos` | General, Impresiones, Consecutivos, Agente de impresión | — |
| Chat | `chat` | Etiquetas, Llaves API, Respuestas rápidas, IA | — |
| Integraciones | `integrations` | General (form + stats) | — |
| Parking | `parking` | Horarios, Tolerancias, Políticas, Ticket perdido, Mensajes, Alertas | — |
| Calendario | `calendar` | General | — |
| Timeline | `operations` | Privacidad, Fuentes, Retención, Rendimiento | — |
| Roles | `roles` | General | — |
| Facturación | `finance` | Credenciales, Rangos DIAN | — |
| Gym | `gym` | Acceso, Tolerancias, Check-in, Clases, Mensajes, Notificaciones | — |
| Notificaciones | `notifications` | Preferencias de canales | — |
| Organización | `organizations` (core) | Link a `/app/organizacion` | — |

---

## Plan de Implementación por Fases

### FASE 1: Infraestructura base (layout + estado + registry)

**Archivos a crear** (11):
1. `src/app/app/configuracion/page.tsx` — thin wrapper
2. `src/components/configuracion/layout/ConfiguracionLayout.tsx`
3. `src/components/configuracion/layout/ConfiguracionSidebar.tsx`
4. `src/components/configuracion/layout/ConfiguracionSidebarItem.tsx`
5. `src/components/configuracion/layout/ConfiguracionHeader.tsx`
6. `src/components/configuracion/layout/ConfiguracionSearch.tsx`
7. `src/components/configuracion/layout/ConfiguracionEmpty.tsx`
8. `src/components/configuracion/config/configModulesRegistry.ts`
9. `src/components/configuracion/hooks/useConfiguracionState.ts`
10. `src/components/configuracion/hooks/useActiveConfigModules.ts`
11. `src/components/configuracion/index.ts`

**Funcionalidad**:
- Layout responsive (sidebar colapsable en mobile → dropdown/sheet)
- Filtrado por módulos activos (`moduleManagementService.getActiveModules`)
- Estado en URL con `useSearchParams`
- Panel placeholder "Selecciona un módulo"

---

### FASE 2: Paneles simples reutilizables (8 módulos, refactor mínimo)

Cada panel es un wrapper que **copia la lógica del page.tsx actual** y reutiliza sus componentes:

| Panel | Reutiliza de | Esfuerzo |
|-------|-------------|----------|
| `ParkingConfigPanel` | `@/components/parking/configuracion` (6 sections) | Copiar page.tsx → panel |
| `TimelineConfigPanel` | `@/components/timeline/configuracion` (4 sections) | Copiar page.tsx → panel |
| `IntegracionesConfigPanel` | `@/components/integraciones/configuracion` | Copiar page.tsx → panel |
| `RolesConfigPanel` | `@/components/admin/RolesConfigurationSettings` | Solo envolver componente |
| `CalendarioConfigPanel` | `@/components/calendario/configuracion` | Copiar page.tsx → panel |
| `GymConfigPanel` | `@/components/gym/ajustes` (6 cards) | Copiar page.tsx → panel |
| `NotificacionesConfigPanel` | `@/components/notificaciones/preferencias` | Copiar page.tsx → panel |
| `FacturacionConfigPanel` | página de 764 líneas | **Subdividir en 3 sections** |

**Cambio común en todos**: quitar headers con `ArrowLeft` (ya no hay "volver", el sidebar es la navegación) y paddings de página completa.

---

### FASE 3: Paneles con tabs (4 módulos)

| Panel | Tabs | Componentes reutilizados |
|-------|------|--------------------------|
| `HRMConfigPanel` | General, Monedas | `SettingsForm`, `CurrenciesCard` (ya tiene tabs internos, simplificar) |
| `PMSConfigPanel` | General, Reservas, Notif, Check-in, Operaciones | Los 5 settings components (grid → tabs) |
| `POSConfigPanel` | General, Impresiones, Consecutivos, Agente | `ConfiguracionPage`, `ImpresionesPage`, `ConsecutivosPage`, `DesktopAgentPanel` |
| `ChatConfigPanel` | Etiquetas, Llaves API, Respuestas, IA | Páginas de `@/components/chat/configuracion/*` (reemplaza `ConfigNavTabs`) |

---

### FASE 4: Panel CRM + Drawer de detalle de canal (el único refactor real)

1. `CRMConfigPanel` con tabs: Canales, Etiquetas, API Keys, Widget
2. `CanalesTab`: embebe `ChannelsList` + `CreateChannelDialog` + `WidgetCodeDialog` (ya existen)
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
- Los componentes en `src/components/{modulo}/configuracion|ajustes|preferencias/` **no se modifican** (excepto quitar headers con "volver")
- Los page.tsx actuales son la "receta" para cada panel: misma lógica de carga, mismos handlers

### 2. Carga de datos por panel
- Cada panel carga sus datos solo cuando se monta (al seleccionar el módulo)
- No se cargan datos de módulos no seleccionados → performance óptima
- `next/dynamic` para code splitting por panel

### 3. Estado en URL
- `useSearchParams` + `router.replace` (sin `scroll`)
- URLs compartibles: `/app/configuracion?modulo=pos&seccion=impresiones`
- El drawer de canal: `&canal={id}` (abrir/cerrar actualiza URL)

### 4. Permisos y filtrado
- Sidebar filtrado por `getActiveModules(orgId)` (módulos activos de la org)
- Respeta `jobPositionVisiblePages` si `/app/configuracion` se agrega a `MODULE_PAGES`
- Módulos inactivos: no aparecen (o aparecen deshabilitados con link al marketplace)

### 5. Responsive
- Desktop: sidebar fijo izquierdo + contenido
- Mobile: selector de módulo en dropdown o Sheet superior; tabs con scroll horizontal

### 6. i18n
- Usar `next-intl` como el resto: namespace `org.configuracion`

---

## Estimación de esfuerzo

| Fase | Descripción | Archivos nuevos | Refactors | Complejidad |
|------|------------|-----------------|-----------|-------------|
| 1 | Infraestructura base | 11 | 0 | Media |
| 2 | Paneles simples | 8+ | 0 (copiar lógica) | Baja |
| 3 | Paneles con tabs | 10+ | 0 | Baja |
| 4 | CRM + drawer canal | 6 | 1 (canales/[id]) | **Media-Alta** |
| 5 | Navegación sidebar | 0 | 3 archivos | Baja |
| 6 | Redirects | 0 | 16 rutas | Baja |
| 7 | Eliminar rutas | 0 | 14 dirs | Baja |

**Total**: ~35 archivos nuevos (máxima subdivisión), 1 refactor real, ~20 modificados

**Riesgo principal**: Fase 4 (drawer de canal CRM). Todo lo demás es reutilización directa.
