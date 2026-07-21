# Go Admin Desktop — Arquitectura y Plan

Aplicación de escritorio (Electron) para GO Admin ERP. Evolución del `print-agent` hacia una app instalable con interfaz gráfica que en el futuro contendrá los módulos POS y PMS completos.

---

## 1. Estrategia general

```
FASE 0 (HOY) ──────── print-agent + instalar.bat/iniciar.bat
                       Consola, sin GUI. Valida el core con hardware real.

FASE 1 ────────────── Go Admin Desktop v1 (Electron shell + agente)
                       GUI mínima: login, estado, impresoras, system tray.
                       El agente de impresión corre embebido.

FASE 2 ────────────── Go Admin Desktop v2 (módulo POS)
                       POS completo dentro de Electron (offline-first opcional).

FASE 3 ────────────── Go Admin Desktop v3 (módulo PMS)
                       Recepción, check-in/out, housekeeping.
```

**Decisión clave**: la app web (`app.goadmin.io` en Vercel) sigue siendo la principal. Desktop complementa donde el navegador no llega: impresión, hardware local, y (futuro) operación offline.

---

## 2. Enfoque técnico recomendado: Electron + Next.js embebido

Hay dos formas de construir la GUI de Electron:

| Enfoque | Cómo funciona | Reutilización |
|---|---|---|
| **A. Wrapper de la web** | Electron abre `app.goadmin.io/app/pos` en un BrowserWindow | 100% — cero código duplicado |
| B. App React independiente | UI nueva dentro de Electron | Baja — duplica componentes |

**Recomendación: Enfoque A (wrapper) + preload bridge.**

El BrowserWindow carga la web de producción, y un script `preload` expone APIs nativas (impresión, hardware) via `window.goAdminDesktop`. Así:

- El POS y PMS **ya existen** — no se reescriben.
- Un solo codebase: cada mejora en la web llega a Desktop automáticamente.
- La web detecta si corre dentro de Desktop (`window.goAdminDesktop !== undefined`) y habilita funciones nativas (ej. imprimir directo sin print-agent separado).

```
┌───────────────────────────────────────────────┐
│ Go Admin Desktop (Electron)                   │
│                                               │
│  Main Process (Node.js)                       │
│  ├─ agente de impresión (código actual)       │
│  ├─ system tray + auto-start                  │
│  ├─ auto-update (electron-updater)            │
│  └─ IPC handlers (imprimir, detectar, etc.)   │
│                    │ preload bridge           │
│  BrowserWindow ────┴─────────────────────────  │
│  └─ carga https://app.goadmin.io              │
│     (los componentes POS/PMS existentes)      │
└───────────────────────────────────────────────┘
```

---

## 3. Estructura del proyecto

```
go-admin-desktop/
├── package.json               # electron, electron-builder, deps del agente
├── electron-builder.yml       # config del instalador (.exe NSIS)
├── tsconfig.json
├── build/
│   ├── icon.ico               # icono de la app
│   └── installer.nsh          # personalización del instalador
├── src/
│   ├── main/                  # ── Proceso principal (Node) ──
│   │   ├── index.ts           # crea ventana, arranca módulos
│   │   ├── tray.ts            # icono bandeja (estado, abrir, salir)
│   │   ├── autostart.ts       # arranque con Windows
│   │   ├── updater.ts         # auto-actualización
│   │   ├── ipc/               # handlers expuestos a la web
│   │   │   ├── printing.ts    # imprimir, listar, detectar impresoras
│   │   │   └── session.ts     # login/estado del agente
│   │   └── windows/
│   │       ├── mainWindow.ts  # carga app.goadmin.io
│   │       └── setupWindow.ts # ventana de login/configuración inicial
│   ├── preload/
│   │   └── index.ts           # expone window.goAdminDesktop (contextBridge)
│   ├── agent/                 # ── COPIADO DE print-agent/src (mismo código) ──
│   │   ├── index.ts
│   │   ├── agentSetup.ts      # detección dinámica org/sucursal
│   │   ├── config.ts
│   │   ├── supabaseClient.ts
│   │   ├── discoveryServer.ts
│   │   ├── printerDrivers.ts
│   │   ├── escposFormatter.ts
│   │   └── types.ts
│   └── setup-ui/              # ── UI mínima de configuración (HTML/React ligero) ──
│       ├── Login.tsx          # email + password
│       ├── Status.tsx         # conectado/desconectado, org, sucursal
│       └── Printers.tsx       # impresoras detectadas
└── dist/                      # salida del build (.exe)
```

### Módulos futuros POS / PMS (Fase 2-3)

Con el enfoque wrapper **no hay carpetas pos/ ni pms/ en Desktop** — viven en el proyecto web y se cargan por URL:

| Módulo | URL cargada | Componentes reutilizados |
|---|---|---|
| POS | `app.goadmin.io/app/pos` | `src/components/pos/*` (CartView, CheckoutDialog, mesas, comandas, cajas...) |
| PMS | `app.goadmin.io/app/pms` | `src/components/pms/*` (reservas, checkin, checkout, housekeeping, parking...) |

Si más adelante se necesita **modo offline**, se evalúa empaquetar el build de Next.js dentro de Electron (`next build` + servidor local), manteniendo los mismos componentes.

---

## 4. Reutilización desde go-admin-erp

| Recurso del proyecto actual | Reutilizable en Desktop | Cómo |
|---|---|---|
| `print-agent/src/*` (todo el agente) | ✅ 100% | Se copia a `src/agent/` sin cambios |
| `src/components/pos/*` | ✅ 100% | Via wrapper (se cargan desde la web) |
| `src/components/pms/*` | ✅ 100% | Via wrapper |
| `src/components/ui/*` (shadcn) | ✅ 100% | Via wrapper |
| `src/lib/services/*` | ✅ 100% | Via wrapper |
| Supabase Auth/RLS | ✅ 100% | Misma anon key, mismas políticas |
| `PrinterFormDialog` (detección) | ✅ Mejorable | En Desktop puede llamar IPC nativo en vez de `localhost:3456` |

**Único código nuevo**: `src/main/`, `src/preload/` y `src/setup-ui/` (~500-800 líneas).

---

## 5. Bridge web ↔ desktop (preload)

La web detecta Desktop y usa capacidades nativas:

```ts
// preload/index.ts
contextBridge.exposeInMainWorld('goAdminDesktop', {
  version: app.getVersion(),
  listPrinters: () => ipcRenderer.invoke('printing:list'),
  discoverNetwork: () => ipcRenderer.invoke('printing:discover'),
  printTest: (printerId: string) => ipcRenderer.invoke('printing:test', printerId),
  agentStatus: () => ipcRenderer.invoke('session:status'),
});
```

```ts
// En la web (ej. PrinterFormDialog.tsx)
const isDesktop = typeof window !== 'undefined' && 'goAdminDesktop' in window;
const printers = isDesktop
  ? await window.goAdminDesktop.listPrinters()      // IPC nativo
  : await fetch('http://localhost:3456/printers');  // fallback print-agent
```

---

## 6. Distribución e instalación

| Ítem | Herramienta |
|---|---|
| Empaquetado | `electron-builder` → instalador NSIS (.exe) |
| Auto-update | `electron-updater` + GitHub Releases |
| Firma de código | Certificado code-signing (evita alerta SmartScreen) — opcional al inicio |
| Descarga | Botón "Descargar Go Admin Desktop" en Configuración → Impresoras de la web |

Experiencia del dueño del local:

```
Descarga GoAdminDesktop-Setup.exe desde la web
  → Siguiente → Siguiente → Finalizar
  → Se abre ventana de login (email + password de GO Admin)
  → Auto-detecta organización/sucursal (mismo agentSetup.ts)
  → Icono en bandeja del sistema, arranca con Windows
  → Listo: impresión automática funcionando
```

---

## 7. Orden de trabajo sugerido

1. **Validar print-agent con hardware real** usando `instalar.bat`/`iniciar.bat` (ya creados).
2. Mostrar **estado del agente** (online/offline desde `print_agents`) en Configuración → Impresoras de la web.
3. Crear repo/carpeta `go-admin-desktop` con Electron + wrapper + agente embebido.
4. Bridge preload + adaptación de `PrinterFormDialog` para detectar Desktop.
5. Instalador con electron-builder + botón de descarga en la web.
6. (Futuro) Evaluar modo offline para POS.
