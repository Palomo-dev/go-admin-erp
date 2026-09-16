export const meta = {
  name: 'pos-doble-pantalla-f1',
  description: 'Fase 1 del POS de doble pantalla: ventana Electron en el monitor del cliente (builder → tester → qa, rondas hasta ≥ 9,5)',
  phases: [{ title: 'Fase 1 Electron', detail: 'displayWindow, IPC, persistencia, monitores, atajo' }],
}

const PLAN = args.plan
const DATE = args.date
const UMBRAL = 9.5
const MAX_RONDAS = 3

const REGLAS = `
Reglas del repositorio (además del CLAUDE.md que ya tienes):
- Español de Colombia en código, comentarios y textos. Nunca el nombre de una organización cliente.
- Sin archivos .sql: esta fase no toca la base de datos.
- Deja limpios de ESLint los archivos web que toques (npx eslint <archivo>). Para electron/: cd electron && npx tsc -p . (es su build) debe pasar sin errores nuevos.
- No edites PROGRESS.md ni ${PLAN}: los actualiza el orquestador. No hagas git commit ni push.
- Trabaja sobre el árbol tal cual está (hay cambios sin commitear de otras sesiones: no los toques ni reviertas).
`

const CONTEXTO = `
Contexto verificado (úsalo, no lo re-descubras):
- Plan completo en ${PLAN}: lee §9 (Electron), §10 (web), §5.2 (tarjeta de configuración) y §12 Fase 1.
- La Fase 0 ya existe y está aprobada: src/lib/pos/display/ (protocolo, proyección, transporte, terminal, emitter), ruta src/app/pos-display/, indicador en src/app/app/pos/page.tsx y tarjeta "Pantalla del cliente" en src/components/pos/configuracion/ConfiguracionPage.tsx (+ ConfigModals.tsx). Léelos antes de tocar nada.
- Electron: electron/src/main/windows/mainWindow.ts (crea mainWindow y splash; tiene isPositionVisible() y usa screen.getAllDisplays(); carga WEB_APP_URL de electron/src/main/constants.ts con allowedHosts). IPC en electron/src/main/ipc.ts (ipcMain.handle 'dominio:accion'). Persistencia en electron/src/main/store.ts (interface DesktopConfig, loadConfig/saveConfig). Preload en electron/src/preload/index.ts expone window.goAdminDesktop via contextBridge (contextIsolation: true, nodeIntegration: false).
- Lado web: src/lib/utils/desktop.ts tiene isDesktopApp() y getDesktopBridge(); el tipo del bridge está en src/types/go-admin-desktop.d.ts (interface GoAdminDesktopBridge). El bridge se llama goAdminDesktop, NO electronAPI.
- ERROR HEREDADO A CORREGIR: en la Fase 0, el botón de pantalla completa de /pos-display y el botón "Abrir" del indicador/tarjeta pueden estar comprobando window.electronAPI. Debe ser el bridge real (isDesktopApp() / getDesktopBridge().posDisplay). Búscalo con grep electronAPI en src/ y corrígelo.
`

const ALCANCE = `
1. electron/src/main/windows/displayWindow.ts (nuevo):
   - openDisplayWindow(displayId?: number): elige el monitor secundario (todo display cuyo id !== screen.getPrimaryDisplay().id; si hay varios y no se pasa displayId, el primero; si no hay secundario, devuelve { ok: false, reason: 'sin-monitor-secundario' } sin abrir nada).
   - BrowserWindow con fullscreen: true, frame: false, autoHideMenuBar: true, backgroundColor gris neutro, x/y/width/height del display elegido, webPreferences IGUALES a mainWindow (mismo preload, misma partition/session para compartir localStorage y BroadcastChannel), y carga la MISMA base URL que mainWindow + '/pos-display' con los mismos allowedHosts.
   - closeDisplayWindow(), getDisplayStatus() -> { open, displayId, displays: [{id, label, bounds, isPrimary}] }.
   - screen.on('display-removed'): si el monitor de la ventana desaparece, ciérrala (reutiliza la idea de isPositionVisible). screen.on('display-added'): si posDisplay.enabled en el store, reábrela.
   - La ventana del cliente nunca debe robar el foco de la caja al abrirse (focusable/show sin activar; documenta cómo).
   - Atajo global Ctrl+Shift+D (globalShortcut) que cierra la ventana del cliente desde cualquier sitio; desregístralo al salir.
2. store.ts: añade a DesktopConfig posDisplay?: { enabled: boolean; displayId?: number }. Al arrancar la app (donde se crea mainWindow tras 'ready'), si posDisplay.enabled, abrir la ventana con ese displayId.
3. ipc.ts: handlers 'pos-display:open' (displayId?), 'pos-display:close', 'pos-display:status', 'pos-display:list-displays', 'pos-display:set-enabled' (persiste en store). preload: window.goAdminDesktop.posDisplay = { open, close, status, listDisplays, setEnabled }. Actualiza src/types/go-admin-desktop.d.ts con el tipo.
4. Web: en la tarjeta "Pantalla del cliente" (ConfiguracionPage/ConfigModals), cuando isDesktopApp(): selector de monitor (listDisplays) y el botón "Abrir ahora" usa el bridge; cuando no, el window.open de la Fase 0. En /pos-display, el botón de pantalla completa se oculta si isDesktopApp(). Corrige cualquier referencia a electronAPI.
5. Sin lógica de negocio en Electron: solo abrir y colocar.
`

const BUILD_SCHEMA = { type: 'object', properties: {
  resumen: { type: 'string' }, archivos: { type: 'array', items: { type: 'string' } },
  feedbackAtendido: { type: 'array', items: { type: 'string' } }, decisiones: { type: 'array', items: { type: 'string' } },
  pendientes: { type: 'array', items: { type: 'string' } } },
  required: ['resumen', 'archivos', 'feedbackAtendido', 'decisiones', 'pendientes'] }

const TEST_SCHEMA = { type: 'object', properties: {
  ejecutados: { type: 'number' }, pasaron: { type: 'number' }, fallaron: { type: 'number' },
  fallos: { type: 'array', items: { type: 'object', properties: {
    severidad: { type: 'string', enum: ['crítico', 'alto', 'medio', 'bajo'] }, descripcion: { type: 'string' },
    reproducir: { type: 'string' }, esperado: { type: 'string' }, obtenido: { type: 'string' } },
    required: ['severidad', 'descripcion', 'reproducir', 'esperado', 'obtenido'] } },
  noProbado: { type: 'array', items: { type: 'string' } }, robustez: { type: 'number' }, evidencia: { type: 'string' },
  testsAgregados: { type: 'array', items: { type: 'string' } } },
  required: ['ejecutados', 'pasaron', 'fallaron', 'fallos', 'noProbado', 'robustez', 'evidencia', 'testsAgregados'] }

const QA_SCHEMA = { type: 'object', properties: {
  calificacion: { type: 'number' }, fortalezas: { type: 'array', items: { type: 'string' } },
  problemas: { type: 'array', items: { type: 'object', properties: {
    severidad: { type: 'string', enum: ['crítico', 'alto', 'medio', 'bajo'] }, descripcion: { type: 'string' }, accion: { type: 'string' } },
    required: ['severidad', 'descripcion', 'accion'] } },
  paraElDiez: { type: 'array', items: { type: 'string' } }, veredicto: { type: 'string', enum: ['aprobado', 'requiere-nueva-ronda'] } },
  required: ['calificacion', 'fortalezas', 'problemas', 'paraElDiez', 'veredicto'] }

function fb(test, qa) {
  const a = (qa?.problemas || []).map((p, i) => `${i + 1}. [qa · ${p.severidad}] ${p.descripcion}\n   Acción: ${p.accion}`)
  const b = (test?.fallos || []).map((f, i) => `${i + 1}. [tester · ${f.severidad}] ${f.descripcion}\n   Reproducir: ${f.reproducir}\n   Esperado: ${f.esperado} | Obtenido: ${f.obtenido}`)
  return [...a, ...b].join('\n')
}

phase('Fase 1 Electron')
const rondas = []
let feedback = null
for (let ronda = 1; ronda <= MAX_RONDAS; ronda++) {
  log(`Fase 1 — ronda ${ronda}`)
  const build = await agent(`Eres el BUILDER de la Fase 1 (Electron en la segunda pantalla) del POS de doble pantalla, ronda ${ronda}.
${CONTEXTO}${REGLAS}
Alcance exacto:
${ALCANCE}
${feedback ? `RONDA DE CORRECCIÓN. Lista obligatoria en orden de severidad:\n${feedback}` : ''}
Al terminar: cd electron && npx tsc -p . sin errores; npx eslint de los archivos web tocados limpio; npx jest src/__tests__/pos-display sigue en verde. No declares la fase lista.`, { label: `builder:F1:r${ronda}`, phase: 'Fase 1 Electron', schema: BUILD_SCHEMA })
  if (!build) break

  const test = await agent(`Eres el TESTER de la Fase 1 (Electron) del POS de doble pantalla, ronda ${ronda}. Rompe, no defiendas; no arregles nada.
${CONTEXTO}
Alcance que debía cumplirse:
${ALCANCE}
Lo que el builder dice que hizo (verifícalo):
${JSON.stringify(build, null, 2)}
Qué hacer:
1. cd electron && npx tsc -p . : reporta errores. Revisa que displayWindow use EXACTAMENTE las mismas webPreferences/partition que mainWindow (si no, localStorage y BroadcastChannel no se comparten y la pantalla nunca conecta: eso sería crítico).
2. Revisa allowedHosts, que la ventana no robe foco, display-removed/added, el atajo Ctrl+Shift+D y su desregistro, y que al arrancar con posDisplay.enabled se abra sola.
3. Web: npx eslint de los archivos tocados; grep -rn electronAPI src/ debe dar cero; el tipo GoAdminDesktopBridge debe incluir posDisplay; npx jest src/__tests__/pos-display en verde.
4. No puedes ejecutar Electron aquí: dilo explícitamente en noProbado (arranque real, colocación en monitor, foco). Si puedes extraer lógica pura (elección de monitor a partir de una lista de displays) a una función y probarla con jest en electron/ o en src/__tests__/, hazlo y lístalo en testsAgregados.
Calificación de robustez 1-10 con justificación en evidencia.`, { label: `tester:F1:r${ronda}`, phase: 'Fase 1 Electron', schema: TEST_SCHEMA })

  const qa = await agent(`Eres el QA-REVIEWER de la Fase 1 (Electron) del POS de doble pantalla, ronda ${ronda}. No construyes: auditas, calificas 1-10 y das acciones concretas. Verifica el código tú mismo.
${CONTEXTO}
Alcance:
${ALCANCE}
Builder: ${JSON.stringify(build, null, 2)}
Tester: ${JSON.stringify(test, null, 2)}
Rubric de 5 dimensiones (2 puntos cada una): funcionalidad completa; robustez (monitor que desaparece, sin monitor secundario, atajo, arranque); consistencia con mainWindow (webPreferences, partition, allowedHosts, store, patrón de IPC/preload/tipos); resultados del tester (un crítico limita a 6); trazabilidad. Ten en cuenta que Electron no se pudo ejecutar: califica el código y las pruebas posibles, y anota en paraElDiez qué debe verificarse en el hardware real. Nunca 10 automático. Si < 9,5, acciones concretas y verificables.`, { label: `qa:F1:r${ronda}`, phase: 'Fase 1 Electron', schema: QA_SCHEMA, effort: 'high' })

  rondas.push({ ronda, build, test, qa })
  const nota = qa?.calificacion ?? 0
  log(`Fase 1 — ronda ${ronda}: QA ${nota}/10, tester ${test?.robustez ?? '?'}/10, ${qa?.veredicto ?? '?'}`)
  if (nota >= UMBRAL) break
  feedback = fb(test, qa)
}
return { fecha: DATE, fase: 'F1', rondas }
