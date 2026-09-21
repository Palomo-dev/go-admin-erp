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
- LA PARTE ELECTRON YA ESTÁ HECHA por otra sesión (commit a923cc57): electron/src/main/posDisplayIpc.ts (relay 'pos-display:message' a todos menos el emisor; open/close/status/list-displays/set-enabled), electron/src/main/windows/posDisplayWindow.ts (ventana hija con la misma session en el monitor secundario, display-removed/added, Ctrl+Shift+D), store.ts (posDisplay {enabled, displayId}) y preload/index.ts que expone window.goAdminDesktop.posDisplay = { send, onMessage, open, close, status, onStatus, listDisplays, setEnabled }. NO toques electron/**: si algo del puente no te sirve, dilo en pendientes.
- Lado web YA hecho: src/lib/pos/display/desktopChannel.ts (canal por el relay, elegido automáticamente por posDisplay.ts y useDisplayReceiver.ts), openDisplay.ts llama a nativeApi.open({ origin }) si el puente existe, y el contrato tipado está en src/lib/utils/desktop.ts (DesktopPosDisplayBridge, DesktopDisplayInfo, DesktopPosDisplayStatus). isDesktopApp() y getDesktopBridge() viven en src/lib/utils/desktop.ts. El bridge se llama goAdminDesktop, NO electronAPI.
- Fase 0 (aprobada/en cierre): tarjeta "Pantalla del cliente" en src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx (+ ConfigModals/ConfiguracionPage), indicador en src/components/pos/display/CustomerDisplayIndicator.tsx con useCustomerDisplayPresence, botón de pantalla completa en src/components/pos-display/FullscreenButton.tsx, ruta src/app/pos-display/.
- Prueba manual del puente documentada por la otra sesión en electron/scripts/smoke-pos-display.md.
`

const ALCANCE = `
Integrar el puente de escritorio en la web (sin tocar electron/**):
1. Tarjeta "Pantalla del cliente" (PantallaClienteContent.tsx): cuando isDesktopApp() y el puente expone listDisplays, mostrar un selector de monitor (etiqueta + tamaño + "principal"), persistirlo con setEnabled(enabled, displayId) además del interruptor de organization_settings (el interruptor de la organización sigue mandando; el displayId es de esta máquina), y "Abrir ahora" por el puente con open({ origin: window.location.origin, displayId }). Mostrar el estado de la ventana (abierta/cerrada, en qué monitor) con status() + onStatus(). Si el puente no expone listDisplays (Desktop < 0.2.1), comportamiento web actual sin errores.
2. Indicador del POS (CustomerDisplayIndicator + useCustomerDisplayPresence): "Cerrar" usa close() del puente cuando existe (ya hay canCloseViaNativeBridge: úsalo con el nombre real goAdminDesktop); la presencia sigue viniendo de display_alive por el relay. Si status() dice abierta pero no hay display_alive en 3 s, etiqueta "Pantalla abierta, sin señal" (i18n) para distinguir ventana viva de canal roto.
3. /pos-display: FullscreenButton se oculta si isDesktopApp(). El botón "Actualice la pantalla" y el resto no cambian.
4. Limpieza: grep -rn electronAPI src/ debe quedar en cero (todo por goAdminDesktop / getDesktopBridge()). Corrige src/lib/pos/display/openDisplay.ts si aún acepta electronAPI.
5. Tests (jest, .ts en src/__tests__/pos-display/): lógica pura extraída (elección de etiqueta del monitor, estado "abierta sin señal", fallback cuando el puente no tiene listDisplays) con un puente falso; sin renderizar React.
6. Prueba de humo: si existe electron/release/win-unpacked (la otra sesión avisa cuando genere la 0.2.1), sigue electron/scripts/smoke-pos-display.md y reporta; si no existe, dilo en pendientes: NO lo simules.
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
1. cd electron && npx tsc -p . debe seguir en exit 0 (el builder NO debía tocar electron/**: si git status muestra cambios ahí, es un fallo alto). Lee electron/src/main/posDisplayIpc.ts y windows/posDisplayWindow.ts solo para verificar que la web usa el contrato correctamente (open con origin, onStatus, setEnabled con displayId).
2. Revisa que la tarjeta y el indicador degraden sin errores cuando el puente no existe (navegador) o no expone listDisplays (Desktop viejo), y que el interruptor de la organización siga mandando sobre el displayId local.
3. Web: npx eslint de los archivos tocados; grep -rn electronAPI src/ debe dar cero; el tipo GoAdminDesktopBridge debe incluir posDisplay; npx jest src/__tests__/pos-display en verde.
4. Si existe electron/release/win-unpacked, intenta la prueba de humo de electron/scripts/smoke-pos-display.md y reporta con evidencia; si no existe o no puedes ejecutarla, dilo en noProbado sin simularla.
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
