# Go Admin Desktop (Electron)

Aplicación de escritorio para GO Admin ERP. Wrapper de la web + agente de impresión embebido.

## Estructura

```
electron/
├── package.json              # Deps independientes (no afecta a Vercel)
├── tsconfig.json             # TS config separado
├── electron-builder.yml      # Config del instalador NSIS (.exe)
└── src/
    ├── main/                 # Proceso principal (Node)
    │   ├── index.ts          # Entry point: ventana, tray, IPC
    │   ├── agentRunner.ts    # Fork del print-agent (child process)
    │   ├── tray.ts           # System tray
    │   ├── updater.ts        # Auto-update (electron-updater)
    │   ├── autostart.ts      # Arranque con Windows
    │   ├── ipc/
    │   │   ├── printing.ts   # Handlers: listar, imprimir, descubrir
    │   │   └── session.ts    # Handlers: estado, updates
    │   └── windows/
    │       ├── mainWindow.ts     # Carga app.goadmin.io (wrapper)
    │       └── setupWindow.ts    # Login/config inicial
    └── preload/
        └── index.ts          # Bridge: window.goAdminDesktop (contextBridge)
```

## Cómo funciona

1. **Wrapper**: El `mainWindow` carga `https://app.goadmin.io` — la misma web de producción.
2. **Print-agent embebido**: Se hace fork del `print-agent/dist/index.js` como child process.
3. **Bridge preload**: `window.goAdminDesktop` expone IPC nativo a la web.
4. **La web detecta Desktop**: `isDesktop()` → usa IPC en lugar de `fetch(localhost:3456)`.

## Desarrollo

```bash
# 1. Buildar el print-agent primero
cd ../print-agent && npm install && npm run build

# 2. Instalar deps de Electron
cd ../electron && npm install

# 3. Compilar TS de Electron
npm run build

# 4. Ejecutar
npm run dev
```

## Empaquetar (.exe)

```bash
# Build completo + instalador NSIS
npm run package

# Solo directorio (sin instalador, más rápido para pruebas)
npm run package:dir
```

El instalador se genera en `electron/release/Go Admin Desktop-Setup-0.1.0.exe`.

### Icono de ventana vs. icono del instalador

El icono del instalador/ejecutable se configura en `electron-builder.yml` (`win.icon`,
`nsis.installerIcon`, etc.) y funciona porque electron-builder lo copia fuera del
asar. Sin embargo, el **icono de la ventana** (`BrowserWindow.icon`) y el de la
**bandeja del sistema** (`Tray`) se cargan en runtime desde el filesystem.

Windows no puede leer archivos `.ico` desde dentro de un `.asar` para usarlos como
icono nativo de ventana/taskbar (las APIs de Win32 requieren acceso real al
filesystem). Por eso, sin desempaquetar el icono, la ventana muestra el icono por
defecto de Electron (una "hoja en blanco") aunque el `.exe` y el instalador
tengan el icono correcto.

**Solución aplicada:**

1. `electron-builder.yml` incluye `asarUnpack: [build/icon.ico]` → el icono se
   copia a `resources/app.asar.unpacked/build/icon.ico` (fuera del asar).
2. `src/main/icon.ts` expone `getIconPath()` / `getIconImage()` que resuelven la
   ruta según `app.isPackaged` (desarrollo vs. `app.asar.unpacked`).
3. `mainWindow.ts` (ventana principal + splash) y `tray.ts` usan `getIconImage()`
   y pasan un `NativeImage` a la opción `icon` en vez de un string de ruta.

## Relación con el repo principal

- **Vercel** solo lee `package.json` del raíz — **nunca** toca `electron/`.
- El `print-agent/` se comparte: Electron lo forkea, el standalone lo ejecuta directamente.
- Los tipos del bridge viven en `src/lib/utils/desktop.ts` (repo raíz) — TypeScript los usa en ambos lados.
- Un cambio en la web → deploy en Vercel → Desktop lo ve al recargar (sin nuevo .exe).
- Un cambio en el bridge o print-agent → requiere nuevo .exe.
