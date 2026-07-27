# GO Admin Desktop — Plan Completo de Ejecución

> Documento de planeación técnica basado en el **estado real verificado** de los repositorios
> `go-admin-erp` (web) y `go-admin-desktop` (escritorio) a fecha 2026-07-26.
>
> Complementa `GO_ADMIN_DESKTOP.md` (arquitectura conceptual). Este documento define
> **qué está hecho, qué falta, qué archivos se tocan y qué cambia en Supabase.**

---

## 1. Estado real verificado

Antes de planear, se auditó el código de ambos repositorios. Esto es lo que **realmente existe**.

### 1.1 Ya implementado en `go-admin-desktop` (v0.1.6)

| Ítem | Evidencia en código |
|---|---|
| Proyecto Electron funcional | `package.json` → `main: dist/main/index.js`, Electron 31.3.0 |
| Proceso principal completo | `src/main/index.ts` (78 líneas): ventana, instancia única, ciclo de vida |
| Handlers IPC | `src/main/ipc.ts` (86 líneas): `session:*`, `autostart:*`, `printing:list`, `printing:discover` |
| Preload bridge seguro | `src/preload/index.ts`: `contextBridge.exposeInMainWorld('goAdminDesktop', …)` con `contextIsolation: true`, `nodeIntegration: false` |
| Icono en bandeja | `src/main/tray.ts` + cierre = minimizar (`win.on('close')` con `preventDefault`) |
| Arranque con Windows | `src/main/autostart.ts` + `wasOpenedHidden()` |
| Config persistente | `src/main/store.ts` → `userData/config.json` |
| Agente de impresión embebido | `src/agent/` sincronizado desde `print-agent/src` vía `scripts/sync-agent.js` |
| Orquestador del agente | `src/main/agentRunner.ts`: login, realtime, polling, heartbeat, `markOffline()` |
| Config del instalador | `electron-builder.yml`: NSIS, `artifactName: GoAdminDesktop-Setup.exe`, español, instalación configurable |
| Recursos gráficos | `build/icon.ico`, `build/header.bmp`, `build/sidebar.bmp`, `build/logo.png` |
| **Instalador ya generado** | `release/GoAdminDesktop-Setup.exe` + `release/latest.yml` + `release/win-unpacked/` |

### 1.2 Ya implementado en `go-admin-erp` (web)

| Ítem | Archivo |
|---|---|
| Botón "Descargar Go Admin Desktop" | `src/components/pos/configuracion/printers/PrintAgentStatusCard.tsx:52-55` |
| Diálogo de descarga con instrucciones | `src/components/pos/configuracion/printers/DownloadDesktopDialog.tsx` |
| URL apuntando a `releases/latest` | `DownloadDesktopDialog.tsx:25-26` → `github.com/Palomo-dev/go-admin-desktop/releases/latest/download/GoAdminDesktop-Setup.exe` |
| Estado del agente en línea/offline | `PrintAgentStatusCard.tsx` + `PrintJobsService.getAgentsStatus()` |
| Umbral de heartbeat (45s) | `src/lib/services/printJobsService.ts:56` |
| Tablas de impresión | `printers` (2), `printer_station_assignments` (2), `print_jobs` (51), `print_agents` (4) |

### 1.3 Lo que NO está hecho (verificado)

| Ítem | Evidencia |
|---|---|
| **Auto-update** | `electron-updater` **no está** en `package.json` de desktop. `latest.yml` se genera pero nadie lo consume. |
| **Detección de Desktop en la web** | `PrinterFormDialog.tsx:27` tiene `const DISCOVERY_URL = 'http://localhost:3456'` **hardcodeado**. Usa `fetch()` a HTTP local, no el bridge IPC. |
| **Wrapper del POS** | `src/main/index.ts:27` hace `win.loadFile(…/renderer/index.html)`. **No existe ningún `BrowserWindow` que cargue `app.goadmin.io`.** |
| **Firma de código** | Sin `certificateFile`/`certificateSubjectName` en `electron-builder.yml`. |
| **CI/CD del desktop** | No hay `.github/workflows/` en `go-admin-desktop`. El build es manual (`npm run dist`). |
| **Capa offline** | Inexistente en ambos repos. |
| **Impresión nativa por IPC** | `ipc.ts:65-66` hace un salto extra: llama por HTTP a `127.0.0.1:3456` (el discovery server del propio agente) en vez de invocar el driver directamente. |

> **Conclusión**: la Fase 1 está ~80% hecha. Lo que queda de Fase 1 es **auto-update**, **bridge en `PrinterFormDialog`** y **CI/CD**. El trabajo grande real es la Fase 2 (wrapper multi-módulo) y la Fase 3 (offline).

---

## 2. Respuestas directas a las dudas planteadas

### 2.1 ¿Vercel sirve para desplegar Electron?

**No. Vercel no tiene nada que ver con Electron.** Son dos canales de distribución distintos que conviven:

```
┌─────────────────────────────────────────────────────────────┐
│  go-admin-erp (repo web)                                    │
│    git push main → Vercel build → https://app.goadmin.io    │
│    Sirve: HTML/JS/CSS + API routes + middleware             │
└────────────────────────┬────────────────────────────────────┘
                         │ el desktop CARGA esta URL
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  go-admin-desktop (repo escritorio)                         │
│    git tag v0.2.0 → GitHub Actions → electron-builder       │
│    → GitHub Releases → GoAdminDesktop-Setup.exe             │
│    Sirve: el binario que el cliente instala una vez         │
└─────────────────────────────────────────────────────────────┘
```

- **Vercel** = hosting del web app. Ya lo usas (`vercel.json` existe en el repo web).
- **GitHub Releases** = hosting del instalador `.exe`. Ya apuntas ahí desde `DownloadDesktopDialog.tsx:26`.
- `electron-updater` consulta `latest.yml` en GitHub Releases para auto-actualizarse.

**Vercel nunca compila ni sirve el `.exe`.**

### 2.2 ¿Si cambio la web, se ve en Electron?

**Sí, automáticamente y sin reinstalar nada** — porque el enfoque wrapper carga la URL remota.

```
Haces cambio en src/components/pos/mesas/… → git push
   → Vercel despliega en ~2 min
   → El cliente recarga (o reabre) Go Admin Desktop
   → Ya ve el cambio. CERO redistribución de instalador.
```

**Qué SÍ requiere publicar un nuevo `.exe`:**
- Cambios en `src/main/*` (proceso principal, IPC, tray, autostart)
- Cambios en `src/preload/index.ts` (nuevas APIs nativas)
- Cambios en `src/agent/*` (lógica de impresión)
- Subir versión de Electron

Esto es exactamente **por qué el wrapper gana**: el 95% de tu desarrollo (POS, mesas, inventario, caja) vive en la web y se despliega por Vercel. El `.exe` solo cambia cuando toques hardware o el shell.

### 2.3 ¿Cómo se reutiliza el código para tener POS y mesas?

**No se reutiliza: se carga el mismo código.** No hay copia, no hay port, no hay duplicación.

El desktop abre un `BrowserWindow` apuntando a `https://app.goadmin.io/app/pos/mesas`. Ese `BrowserWindow` es Chromium: ejecuta exactamente los mismos componentes React que el navegador.

Los módulos que pediste ya existen en la web y quedan disponibles el día 1 del wrapper:

| Módulo solicitado | Ruta existente | Componentes |
|---|---|---|
| POS | `/app/pos` (`page.tsx`, 24 KB) | `src/components/pos/*` |
| Mesas | `/app/pos/mesas` y `/app/pos/mesas/[id]` | `src/components/pos/mesas/*` (ej. `OrderItemCard.tsx`) |
| Comandas | `/app/pos/comandas` | `src/components/pos/comandas/*` |
| Caja | `/app/pos/cajas` | `src/components/pos/cajas/*` |
| Inventario | `/app/inventario` | `src/components/inventario/*` |
| Ventas | `/app/pos/ventas` | — |
| Reservas de mesa | `/app/pos/reservas-mesas` | — |
| Propinas / Devoluciones / Cupones | `/app/pos/propinas`, `/devoluciones`, `/cupones` | — |
| Configuración e impresoras | `/app/pos/configuracion` | `src/components/pos/configuracion/*` |

**Autenticación: buena noticia verificada.** El middleware (`src/middleware.ts:121`) lee la cookie
`sb-jgmgphmzusbluqhuqihj-auth-token`. Un `BrowserWindow` de Electron tiene un almacén de cookies
persistente real, así que el login con email/contraseña **funciona sin cambios**. Solo el OAuth de
Google requiere manejo especial (ver 4.2.3).

### 2.4 ¿Cómo funciona el acceso a hardware vía preload/IPC?

Ya existe el patrón completo. Es un canal de 3 capas:

```
[Web React]  window.goAdminDesktop.listPrinters()
                        │  (contextBridge — único puente permitido)
[preload]    ipcRenderer.invoke('printing:list')
                        │  (IPC)
[main/Node]  ipcMain.handle('printing:list', …) → driver ESC/POS → impresora USB
```

Código real actual:

```ts
// go-admin-desktop/src/preload/index.ts:26-27
listPrinters: () => ipcRenderer.invoke('printing:list'),
discoverNetwork: () => ipcRenderer.invoke('printing:discover'),
```

```ts
// go-admin-desktop/src/main/ipc.ts:65-66
ipcMain.handle('printing:list', () => fetchLocalJson(`http://127.0.0.1:${DISCOVERY_PORT}/printers`));
ipcMain.handle('printing:discover', () => fetchLocalJson(`http://127.0.0.1:${DISCOVERY_PORT}/discover`));
```

**Por qué esto es seguro**: `contextIsolation: true` y `nodeIntegration: false`
(`src/main/index.ts:22-23`). La web **nunca** ve `require`, `fs` ni `process`. Solo puede llamar
la lista blanca de funciones que expone el preload.

**Deuda técnica identificada**: los handlers dan un salto innecesario por HTTP a
`127.0.0.1:3456`. Cuando el `BrowserWindow` cargue la web remota, conviene que el handler llame
al driver directamente (los módulos ya están en `src/agent/printerDrivers.ts`), eliminando la
dependencia del puerto local.

### 2.5 ¿Offline real es posible?

Sí, y el esquema actual **ya está preparado mejor de lo esperado**. Hallazgo clave verificado:

```
sales.id            → uuid   ✅ generable en el cliente
table_sessions.id   → uuid   ✅ generable en el cliente
kitchen_tickets.id  → uuid   ✅
print_jobs.id       → uuid   ✅
cash_sessions.id    → integer (serial)  ⚠️ pero tiene columna `uuid` aparte
```

Esto significa que una venta creada sin internet puede generar su UUID localmente y
**conservar el mismo ID al sincronizar**. No hace falta remapeo de IDs ni reescritura de
referencias — el problema más caro del offline-first ya está resuelto por diseño.

Ver Fase 4 para el plan detallado.

---

## 3. Decisión de arquitectura (y por qué)

### 3.1 Se descarta empaquetar Next.js dentro de Electron

Auditoría de seguridad del repo web:

- **41 archivos** usan `SUPABASE_SERVICE_ROLE_KEY`
- **42 archivos** de `src/app/api/**` usan secretos server-only (`STRIPE_SECRET`, `OPENAI_API_KEY`, `TWILIO_AUTH`)
- **153+ API routes** en `src/app/api/`

Empaquetar el servidor Next.js en el `.exe` distribuiría esos secretos al PC de cada cliente.
Un `.asar` de Electron se descomprime con un comando; no es ofuscación.

**Impacto concreto si se hiciera:**

| Secreto filtrado | Consecuencia |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasea **todas** las políticas RLS. Lectura/borrado de datos de **todas** las organizaciones, no solo la del cliente. Fuga multi-tenant. |
| `STRIPE_SECRET` | Crear cargos y reembolsos, leer clientes de toda la plataforma. |
| `OPENAI_API_KEY` | Consumo libre a tu cuenta. |

Además, embeber Next.js **no aporta offline**: las API routes seguirían llamando a
Supabase/Stripe/OpenAI en la nube. El servidor local solo serviría HTML.

### 3.2 Arquitectura elegida: wrapper + preload bridge

```
┌──────────────────────────────────────────────────────────────┐
│ Go Admin Desktop (Electron)                                  │
│                                                              │
│  Main Process (Node) — solo anon key, cero secretos          │
│  ├─ agentRunner.ts     agente de impresión (realtime+poll)   │
│  ├─ tray.ts            bandeja del sistema                   │
│  ├─ autostart.ts       arranque con Windows                  │
│  ├─ updater.ts         [NUEVO] electron-updater              │
│  └─ ipc.ts             handlers nativos (impresión, hardware) │
│                    │ preload (contextBridge)                  │
│  ┌─────────────────┴────────────────────────────────────┐    │
│  │ Ventana Agente    │ Ventana App [NUEVA]              │    │
│  │ renderer/index.   │ carga https://app.goadmin.io     │    │
│  │ html (login,      │ → POS, mesas, comandas, caja,    │    │
│  │ estado, printers) │   inventario (código existente)  │    │
│  └───────────────────┴──────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
                              │ HTTPS (anon key + RLS)
                              ▼
              Supabase  +  Vercel (API routes con secretos)
```

**Principio de seguridad**: los secretos **nunca** salen del servidor. El desktop es un cliente
más, con los mismos privilegios que un navegador: anon key + RLS + JWT del usuario.

---

## 4. Fases de ejecución

### FASE 1 — Cerrar v1 (queda ~20%)

Los puntos 1 y 3 del plan anterior **ya están hechos**. Queda:

#### 1.1 Auto-update con `electron-updater`

**Repo**: `go-admin-desktop`

| Acción | Archivo |
|---|---|
| Agregar dependencia `electron-updater` | `package.json` → `dependencies` |
| Crear módulo de actualización | `src/main/updater.ts` **(nuevo)** |
| Invocar al arrancar | `src/main/index.ts` (dentro de `app.whenReady()`) |
| Configurar canal de publicación | `electron-builder.yml` → bloque `publish` |
| Exponer estado a la UI | `src/preload/index.ts` + `src/main/ipc.ts` |
| Mostrar "Actualización disponible" | `src/renderer/index.html` |

Config a añadir en `electron-builder.yml`:

```yaml
publish:
  - provider: github
    owner: Palomo-dev
    repo: go-admin-desktop
```

> `release/latest.yml` ya se está generando, así que el mecanismo funcionará en cuanto se
> publiquen los releases en GitHub.

#### 1.2 `PrinterFormDialog` debe usar el bridge IPC

**Repo**: `go-admin-erp` · **Archivo**: `src/components/pos/configuracion/printers/PrinterFormDialog.tsx`

Estado actual (línea 27 y 72-75): `fetch('http://localhost:3456/printers')` hardcodeado.
Esto falla si el puerto cambia o si hay bloqueo de mixed-content (HTTPS → HTTP local).

Cambio: detectar Desktop y preferir IPC, con fallback al print-agent de consola.

```ts
const isDesktop = typeof window !== 'undefined' && 'goAdminDesktop' in window;

const [printersRes, discoverRes] = isDesktop
  ? await Promise.allSettled([
      window.goAdminDesktop.listPrinters(),
      window.goAdminDesktop.discoverNetwork(),
    ])
  : await Promise.allSettled([
      fetch(`${DISCOVERY_URL}/printers`).then((r) => r.json()),
      fetch(`${DISCOVERY_URL}/discover`).then((r) => r.json()),
    ]);
```

| Archivo | Cambio |
|---|---|
| `src/types/desktop.d.ts` **(nuevo)** | Declarar `window.goAdminDesktop` para TypeScript |
| `src/lib/utils/desktop.ts` **(nuevo)** | `isDesktop()`, `getDesktopVersion()` reutilizables |
| `PrinterFormDialog.tsx` | Usar IPC cuando exista el bridge |
| `DownloadDesktopDialog.tsx` | Ocultar el botón de descarga si ya corre en Desktop |

#### 1.3 CI/CD del instalador

**Repo**: `go-admin-desktop` · **Archivo**: `.github/workflows/release.yml` **(nuevo)**

Disparador: push de tag `v*`. Pasos: `npm ci` → `npm run build` → `electron-builder --win --publish always`.
Requiere secret `GH_TOKEN`.

Beneficio: elimina el build manual y garantiza que `latest.yml` y el `.exe` queden publicados juntos
(requisito de `electron-updater`).

#### 1.4 Registrar versión y plataforma del agente

**Cambio en Supabase** (ver 5.1): añadir `app_version` y `platform` a `print_agents` para poder
diagnosticar qué versión tiene instalada cada local.

#### 1.5 🔴 Corregir almacenamiento de contraseña en texto plano

Hallazgo de la auditoría de seguridad. **Se sube a Fase 1 por criticidad.**
Detalle completo, evidencia y plan de remediación en la sección **3.1.1**.

Resumen: `agentRunner.ts:81` guarda la contraseña del usuario sin cifrar en `config.json`.
Debe reemplazarse por un refresh token cifrado con `safeStorage`.

> Debe corregirse **junto con** el auto-update (1.1), porque la nueva versión también tiene
> que borrar el `password` que quedó guardado en las instalaciones existentes.

---

### FASE 2 — Wrapper de módulos (POS, mesas, comandas, caja, inventario)

Objetivo: que el desktop **contenga la operación completa**, no solo el agente.

#### 2.1 Nueva ventana de aplicación

**Repo**: `go-admin-desktop`

| Archivo | Propósito |
|---|---|
| `src/main/windows/appWindow.ts` **(nuevo)** | `BrowserWindow` grande (1280×800, maximizable) que carga `WEB_APP_URL`. Reusa el mismo `preload`. |
| `src/main/windows/agentWindow.ts` **(nuevo)** | Extraer la ventana actual de `index.ts` para separar responsabilidades |
| `src/main/index.ts` | Orquestar ambas ventanas |
| `src/main/tray.ts` | Ítems nuevos: "Abrir POS", "Abrir Mesas", "Abrir Inventario", "Panel del agente" |
| `src/main/constants.ts` | Rutas de acceso rápido (`/app/pos`, `/app/pos/mesas`, `/app/pos/comandas`, `/app/pos/cajas`, `/app/inventario`) |

`WEB_APP_URL` ya existe en `src/main/constants.ts:9` = `https://app.goadmin.io`.

#### 2.2 Endurecer la ventana que carga contenido remoto

Al cargar una URL remota, hay que restringir el `BrowserWindow` explícitamente:

| Medida | Implementación |
|---|---|
| Bloquear navegación externa | `webContents.on('will-navigate')` → permitir solo el host de `WEB_APP_URL` |
| Abrir enlaces externos en el navegador | `setWindowOpenHandler` → `shell.openExternal` |
| Sin integración Node | `nodeIntegration: false`, `contextIsolation: true` (ya es el patrón actual) |
| Bloquear permisos no usados | `session.setPermissionRequestHandler` → denegar salvo impresión/notificaciones |
| Content-Security-Policy | Verificar cabeceras servidas por Vercel |

#### 2.3 Autenticación dentro de Electron

- **Email + contraseña**: funciona sin cambios (cookies persistentes de Chromium + middleware actual).
- **OAuth Google**: el proveedor bloquea webviews embebidos. Solución:
  1. Registrar protocolo `goadmin://` (`app.setAsDefaultProtocolClient`)
  2. Abrir el consentimiento en el navegador del sistema (`shell.openExternal`)
  3. Capturar el retorno vía `app.on('open-url')` / `second-instance`
  4. Inyectar la sesión en la ventana

| Archivo | Cambio |
|---|---|
| `src/main/protocol.ts` **(nuevo)** | Registrar y manejar `goadmin://` |
| `src/main/index.ts` | Enlazar deep links con la ventana de app |
| `go-admin-erp` → `src/app/auth/callback/` | Aceptar redirección al esquema `goadmin://` cuando el origen sea Desktop |

> El middleware excluye `/auth/callback` (`src/middleware.ts:87`), así que no interferirá con PKCE.

#### 2.4 Impresión nativa directa (eliminar el salto HTTP)

| Archivo | Cambio |
|---|---|
| `src/main/ipc.ts` | `printing:list` / `printing:discover` deben invocar `src/agent/printerDrivers.ts` directamente en vez de `http://127.0.0.1:3456` |
| `src/main/ipc.ts` | Nuevo handler `printing:test` (imprimir ticket de prueba) |
| `src/preload/index.ts` | Exponer `printTest(printerId)` |
| `go-admin-erp` → `PrinterFormDialog.tsx` | Botón "Imprimir prueba" visible solo en Desktop |

#### 2.5 Indicador de "modo escritorio" en la web

| Archivo | Cambio |
|---|---|
| `src/components/app-layout/` | Badge discreto "Escritorio v0.2.0" usando `getDesktopVersion()` |
| `src/components/pos/configuracion/printers/PrintAgentStatusCard.tsx` | Si corre en Desktop, mostrar "Este equipo es el agente" en lugar de invitar a descargar |

---

### FASE 3 — Seguridad, instalador y mantenimiento

#### 3.1 Seguridad

| Capa | Medida | Estado |
|---|---|---|
| Secretos | Solo anon key en el cliente; todo secreto server-only queda en Vercel | ✅ Ya se cumple (`constants.ts:6` documenta que la anon key es pública) |
| Aislamiento del renderer | `contextIsolation: true`, `nodeIntegration: false` | ✅ Ya se cumple |
| Superficie del bridge | Lista blanca explícita en `preload` | ✅ Ya se cumple |
| Navegación | Whitelist de host en `will-navigate` + `setWindowOpenHandler` | ⬜ Pendiente (Fase 2.2) |
| Permisos Chromium | `setPermissionRequestHandler` restrictivo | ⬜ Pendiente |
| Credenciales locales | **La contraseña se guarda en texto plano.** Migrar a `safeStorage` + refresh token | 🔴 **Vulnerabilidad confirmada** — ver 3.1.1 |
| RLS | Las políticas de Supabase son la única frontera de datos | ✅ RLS activo en todas las tablas consultadas |
| Firma de código | Certificado Authenticode (evita SmartScreen) | ⬜ Pendiente — costo anual |
| Integridad del update | `electron-updater` valida firma/hash contra `latest.yml` | ⬜ Pendiente (Fase 1.1) |

#### 3.1.1 🔴 Hallazgo de seguridad confirmado: contraseña en texto plano

La auditoría de código encontró una vulnerabilidad real que debe corregirse **antes** de
distribuir a más clientes.

**Evidencia:**

```ts
// go-admin-desktop/src/main/store.ts:9-18
export interface DesktopConfig {
  email?: string;
  password?: string;   // ← contraseña en la interfaz de config
  …
}
```

```ts
// go-admin-desktop/src/main/store.ts:37
fs.writeFileSync(CONFIG_PATH(), JSON.stringify(updated, null, 2));  // ← JSON sin cifrar
```

```ts
// go-admin-desktop/src/main/agentRunner.ts:81
saveConfig({ email, password });   // ← persiste la contraseña tras el login
```

```ts
// go-admin-desktop/src/main/agentRunner.ts:264-267
if (!cfg.email || !cfg.password) return false;
const orgs = await login(cfg.email, cfg.password);   // ← la relee para auto-login
```

```ts
// go-admin-desktop/src/main/agentRunner.ts:66
process.env.AGENT_PASSWORD = cfg.password || 'desktop';  // ← también va a process.env
```

**Impacto:** la contraseña de GO Admin del empleado queda legible en
`C:\Users\<usuario>\AppData\Roaming\go-admin-desktop\config.json`. Cualquier persona con acceso
al PC del local (o cualquier malware sin privilegios de administrador) puede leerla. Como es la
**misma credencial de la web**, el atacante obtiene acceso completo a la organización, no solo a
la impresión.

**Remediación propuesta:**

| Paso | Archivo | Cambio |
|---|---|---|
| 1 | `src/main/store.ts` | Eliminar `password` de `DesktopConfig`. Añadir `encryptedRefreshToken?: string` |
| 2 | `src/main/store.ts` | Cifrar con `safeStorage.encryptString()` de Electron (usa DPAPI en Windows, ligado al usuario del SO) |
| 3 | `src/main/agentRunner.ts:81` | Tras `signInWithPassword`, guardar **solo** el refresh token cifrado — nunca la contraseña |
| 4 | `src/main/agentRunner.ts:262-267` | `tryAutoStart()` debe usar `client.auth.refreshSession({ refresh_token })` en lugar de re-login con contraseña |
| 5 | `src/main/agentRunner.ts:51` | Cambiar `persistSession: false` a `true` con un storage adapter cifrado, o gestionar el refresh manualmente |
| 6 | `src/main/agentRunner.ts:66` | Dejar de inyectar la contraseña en `process.env`. Adaptar `src/agent/config.ts` para aceptar un token |
| 7 | Migración | Al arrancar una versión nueva, borrar el campo `password` de los `config.json` existentes |

> Nota: `src/main/ipc.ts:14-23` guarda `rememberedEmail`, lo cual **no** representa riesgo.
> El problema es exclusivamente la persistencia de `password`.

**Prioridad: alta.** Se recomienda subirlo a Fase 1 en lugar de Fase 3, porque cada instalación
nueva agrava la exposición y la corrección requiere publicar un `.exe` actualizado (que además
debe limpiar el dato viejo).

#### 3.2 Instalador

Config actual en `electron-builder.yml` ya cubre lo esencial: NSIS, español, acceso directo en
escritorio y menú inicio, `oneClick: false`, cambio de directorio permitido, nombre fijo
`GoAdminDesktop-Setup.exe` (para que `releases/latest/download/…` siempre funcione).

Mejoras pendientes:

| Mejora | Cambio |
|---|---|
| Publicación automática | Bloque `publish: github` (Fase 1.1) |
| Firma de código | `win.certificateFile` + secret en CI |
| Instalación por máquina | `nsis.perMachine: true` si el PC del local es multiusuario |
| Script post-instalación | `build/installer.nsh` para abrir firewall del puerto de descubrimiento |

#### 3.3 Mantenimiento

**Modelo de dos velocidades** — clave para entender el costo operativo:

| Tipo de cambio | Canal | Frecuencia esperada | Acción del cliente |
|---|---|---|---|
| UI/lógica de POS, mesas, inventario, caja | Vercel | Diaria | Ninguna (recargar) |
| Componentes, servicios, queries Supabase | Vercel | Diaria | Ninguna |
| Migraciones de Supabase | Supabase MCP / CLI | Semanal | Ninguna |
| Proceso principal, IPC, preload, agente | GitHub Release | Mensual | Auto-update silencioso |
| Versión de Electron | GitHub Release | Trimestral | Auto-update |

**Compatibilidad entre versiones**: cuando la web use una API nueva del bridge, debe degradar
con elegancia si el cliente tiene un `.exe` viejo.

```ts
if (isDesktop() && typeof window.goAdminDesktop.printTest === 'function') {
  await window.goAdminDesktop.printTest(id);
} else {
  // fallback o mensaje "actualiza Go Admin Desktop"
}
```

Recomendación: exponer `version` en el bridge y validar mínimos con comparación semver.

**Sincronización del agente**: `print-agent/src` sigue siendo la fuente única de verdad.
`npm run sync-agent` copia a `go-admin-desktop/src/agent/`. Riesgo: divergencia silenciosa si se
olvida ejecutar. Mitigación: incluir `sync-agent` en el paso de build de CI (ya está encadenado en
`package.json:9` → `"build": "npm run sync-agent && tsc -p ."`). ✅ Cubierto.

---

### FASE 4 — Offline real (solo POS primero)

#### 4.1 Por qué el esquema actual ayuda

`sales.id`, `table_sessions.id`, `kitchen_tickets.id` y `print_jobs.id` son **UUID**.
Una venta creada sin internet genera su UUID en el cliente y **conserva el mismo ID al subir**.
Se evita el remapeo de IDs y la reescritura de claves foráneas — el problema más costoso del
offline-first.

Excepción: `cash_sessions.id` es `integer` serial, pero la tabla ya tiene columna `uuid`,
que sirve como clave de idempotencia.

#### 4.2 Alcance realista por módulo

| Módulo | Offline | Razón |
|---|---|---|
| Mesas: abrir, agregar ítems, mover, cerrar | ✅ Sí | Estado local + cola; UUID client-side |
| Comandas (kitchen tickets) | ✅ Sí | Impresión es local; `print_jobs` se encola |
| Venta en efectivo | ✅ Sí | No requiere red |
| Caja: apertura, movimientos, cierre | ✅ Sí | Con `uuid` como clave de idempotencia |
| Catálogo de productos/precios/modificadores | ✅ Solo lectura | Cache de `products` (3810), `product_prices` (3807), `product_modifier_groups` (91), `product_modifiers` (766), `categories` (290) |
| Inventario: consultar stock | ✅ Solo lectura | Cache de `stock_levels` (1455) |
| Inventario: ajustes/movimientos | ⚠️ Riesgoso | Stock es dato disputado entre terminales; alto riesgo de conflicto |
| Clientes | ⚠️ Parcial | 20 072 filas — cachear solo los recientes/frecuentes, no todo |
| Pago con tarjeta (Stripe) | ❌ No | Requiere red por definición |
| Facturación electrónica (Factus/DIAN) | ❌ No | Requiere red; encolar y emitir al reconectar |
| Notificaciones (Twilio/WhatsApp) | ❌ No | Requiere red |
| Módulos IA | ❌ No | Requiere red |

#### 4.3 Arquitectura de la capa offline

```
[Componentes POS existentes]  ← sin cambios en la UI
          │
          ▼
[posRepository]  capa nueva de acceso a datos
   ├─ lectura:   IndexedDB primero → refresco desde Supabase en background
   └─ escritura: IndexedDB + encolar mutación → flush al reconectar
          │
          ▼
[syncEngine]  detecta conectividad, procesa cola FIFO, resuelve conflictos
          │
          ▼
[Supabase]
```

#### 4.4 Archivos nuevos (repo web, dentro del scope de POS)

| Archivo | Responsabilidad |
|---|---|
| `src/lib/offline/db.ts` | Esquema IndexedDB (Dexie): stores `products`, `prices`, `modifiers`, `tables`, `sessions`, `mutations`, `meta` |
| `src/lib/offline/mutationQueue.ts` | Encolar, listar, marcar aplicada/fallida, reintentos con backoff |
| `src/lib/offline/syncEngine.ts` | Detección de conectividad (ping a Supabase, no solo `navigator.onLine`), flush FIFO, resolución de conflictos |
| `src/lib/offline/catalogCache.ts` | Descarga y refresco incremental del catálogo por `updated_at` |
| `src/lib/offline/types.ts` | Tipos de mutación y estados de sync |
| `src/hooks/useOnlineStatus.ts` | Hook de estado de conexión |
| `src/hooks/usePendingSync.ts` | Contador de mutaciones pendientes |
| `src/components/pos/offline/OfflineBanner.tsx` | Aviso "Sin conexión — los cambios se guardarán y subirán solos" |
| `src/components/pos/offline/SyncStatusBadge.tsx` | "3 cambios pendientes" / "Sincronizado" |

#### 4.5 Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/pos/mesas/**` | Consumir `posRepository` en vez de llamar a Supabase directo |
| `src/app/app/pos/mesas/[id]/page.tsx` | Igual |
| `src/lib/services/printJobsService.ts` | Encolar `print_jobs` localmente si no hay red |
| `src/components/app-layout/` | Montar `OfflineBanner` y `SyncStatusBadge` |

#### 4.6 Resolución de conflictos

| Escenario | Estrategia |
|---|---|
| Venta creada offline, ID no existe online | Insert directo (UUID ya asignado) |
| Ítems agregados offline y online a la misma mesa | Merge aditivo (los ítems son filas independientes) |
| Mesa cerrada offline y también online | Gana el cierre más antiguo; el otro se marca conflicto y se notifica |
| Stock divergente | El servidor es la fuente de verdad; se recalcula al sincronizar |
| Precio cambiado en la nube mientras estaba offline | Se respeta el precio con el que se vendió (guardado en `sale_items`) |

#### 4.7 Caching de assets

- **En Electron**: Chromium ya cachea JS/CSS. Para garantizar arranque sin red se necesita un
  Service Worker o `protocol.interceptFileProtocol`.
- **En web (PWA)**: Workbox + `manifest.json`.

> `src/middleware.ts:91` ya excluye `/manifest.json` del middleware, así que el terreno está
> preparado para PWA.

#### 4.8 Advertencia de esfuerzo

Esta fase es la más costosa: reescribir la capa de datos del POS, testing exhaustivo de
conflictos y garantizar que no se dupliquen ventas. **Recomendación: no iniciarla hasta que
Fases 1 y 2 estén en producción y validadas con clientes reales.** Muchos negocios se conforman
con que la impresión no se caiga, y eso ya lo resuelve el agente actual.

---

## 5. Cambios en Supabase

Solo cambios **necesarios y verificados**. Todas las tablas mencionadas ya existen con RLS activo.

### 5.1 Fase 1 — Telemetría del agente

Permite saber qué versión tiene cada local instalada (hoy imposible).

```sql
ALTER TABLE public.print_agents
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS platform    text;

COMMENT ON COLUMN public.print_agents.app_version IS
  'Versión de Go Admin Desktop / print-agent que reporta el heartbeat';
COMMENT ON COLUMN public.print_agents.platform IS
  'desktop | console — origen del agente';
```

Esquema actual verificado de `print_agents`: `id` (uuid), `organization_id` (int, NOT NULL),
`branch_id` (int), `agent_name` (text, NOT NULL), `status` (text, default `'offline'`),
`last_seen_at` (timestamptz), `created_at` (timestamptz).

**Código a ajustar**: `go-admin-desktop/src/main/agentRunner.ts` (enviar `app_version` y
`platform: 'desktop'` en el heartbeat) y `src/lib/services/printJobsService.ts` +
`PrintAgentStatusCard.tsx` para mostrarlo.

### 5.2 Fase 4 — Idempotencia para offline

Evita ventas duplicadas si un reintento se ejecuta dos veces.

```sql
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS client_mutation_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS sales_client_mutation_id_key
  ON public.sales (client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

COMMENT ON COLUMN public.sales.client_mutation_id IS
  'ID de mutación generado en el cliente para garantizar idempotencia al sincronizar ventas creadas sin conexión';
```

Mismo patrón para `cash_movements` y `kitchen_tickets` si se confirma que necesitan encolarse.

> Nota: `sales.id` ya es `uuid`, así que en la mayoría de casos basta con reusar el ID como clave
> de idempotencia mediante `upsert` con `onConflict: 'id'`. `client_mutation_id` es la red de
> seguridad para mutaciones que no crean fila nueva (ej. actualizar una venta existente).

### 5.3 Fase 4 — Soporte de refresco incremental del catálogo

Para que el cache descargue solo lo que cambió, las tablas cacheadas necesitan `updated_at`
indexado. **Verificar antes de migrar** cuáles ya lo tienen:

```sql
SELECT table_name,
       bool_or(column_name = 'updated_at') AS tiene_updated_at
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('products','product_prices','product_modifier_groups',
                     'product_modifiers','categories','restaurant_tables','stock_levels')
GROUP BY table_name;
```

Solo agregar `updated_at` + índice donde falte. **No** modificar tablas que ya lo tengan.

### 5.4 Lo que NO cambia

- No se toca ninguna política RLS: el desktop usa la misma anon key y el mismo JWT que el navegador.
- No se crean tablas para la cola offline: **la cola vive en IndexedDB del cliente**, no en el servidor.
- No se crean tablas para el auto-update: `electron-updater` usa GitHub Releases.

---

## 6. Resumen ejecutivo

| Fase | Alcance | Estado | Riesgo |
|---|---|---|---|
| **1** | Auto-update, bridge IPC en `PrinterFormDialog`, CI/CD, telemetría de versión, **fix de contraseña en claro** | ~80% hecho | Bajo |
| **2** | Ventana que carga la web: POS, mesas, comandas, caja, inventario. Endurecimiento. OAuth. Impresión nativa directa | No iniciado | Medio (OAuth) |
| **3** | Firma de código, permisos Chromium, política de compatibilidad | No iniciado | Bajo (costo del certificado) |
| **4** | Offline-first del POS | No iniciado | **Alto** |

### Hallazgo que exige atención inmediata

🔴 **La contraseña del usuario se guarda sin cifrar** en `config.json`
(`go-admin-desktop/src/main/agentRunner.ts:81`). Es la misma credencial de la web, así que su
filtración compromete la organización completa. Ver **3.1.1**.

### Recomendación de orden

1. **Fase 1** — cierra el círculo de distribución y corrige la vulnerabilidad. Sin auto-update,
   cada corrección exige que el cliente reinstale a mano; y el fix de la contraseña **necesita**
   el canal de auto-update para llegar a los equipos ya instalados.
2. **Fase 2** — entrega el valor que pediste (POS, mesas, inventario en escritorio) reutilizando
   el 100% del código existente.
3. **Fase 3** — endurecimiento antes de escalar a muchos clientes.
4. **Fase 4** — solo con demanda real validada.

### Puntos a decidir antes de arrancar

- ¿Se compra certificado de firma de código? Sin él, Windows SmartScreen muestra advertencia en
  cada instalación, lo que genera desconfianza en el cliente final.
- ¿El PC del local es multiusuario? Define `nsis.perMachine`.
- ¿Se necesita soporte para macOS/Linux, o solo Windows? Hoy `electron-builder.yml` solo define `win`.
- ¿Qué hace `src/main/store.ts` con la sesión? Requiere auditoría antes de Fase 3.
