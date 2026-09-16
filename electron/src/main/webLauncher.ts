/**
 * Punto de entrada del utilityProcess que corre el servidor Next embebido.
 *
 * No es el `server.js` de Next directamente: es este envoltorio, que lo
 * carga y además vigila al proceso main. Si el main muere de golpe (crash,
 * `Stop-Process`, apagado), Electron no siempre mata al hijo enseguida:
 * en la prueba del 2026-09-16 el `server.js` huérfano siguió escuchando en
 * 47800 más de 5 s, el siguiente arranque lo encontró ocupado y tuvo que
 * correr en 47801 (otro origen: otra sesión y otra cache offline). Con esta
 * vigilancia el huérfano se cierra solo en ≤ 1 s.
 *
 * Variables (las pone webServer.ts):
 *   GOADMIN_WEB_SERVER_JS  ruta absoluta del server.js del standalone
 *   GOADMIN_PARENT_PID     pid del main de Electron
 */
const serverJs = process.env.GOADMIN_WEB_SERVER_JS;
const parentPid = Number(process.env.GOADMIN_PARENT_PID);
const PARENT_CHECK_MS = 1000;

if (!serverJs) {
  console.error('[webLauncher] Falta GOADMIN_WEB_SERVER_JS');
  process.exit(2);
}

if (Number.isInteger(parentPid) && parentPid > 0) {
  const timer = setInterval(() => {
    try {
      // Señal 0: solo comprueba que el proceso existe (también en Windows).
      process.kill(parentPid, 0);
    } catch {
      console.error(`[webLauncher] El main (pid ${parentPid}) ya no existe; se cierra el servidor Next`);
      process.exit(0);
    }
  }, PARENT_CHECK_MS);
  timer.unref();
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
require(serverJs);
