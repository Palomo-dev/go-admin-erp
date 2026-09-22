import { app, crashReporter } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getPublicEnv } from './publicEnv';

/**
 * Informe de errores del proceso main (auditoría desktop §4.4).
 *
 * Antes: `crashReporter.start({ submitURL: '.../api/crash-report',
 * uploadToServer: false })` → ese endpoint no existía y no recibía nada, y
 * `uncaughtException` solo escribía en userData/agent.log. Nadie se enteraba
 * de un fallo en una instalación.
 *
 * Ahora, con `NEXT_PUBLIC_SENTRY_DSN` (de resources/web/.env o del entorno,
 * ver publicEnv.ts; el mismo DSN que usa la web):
 *
 *   - `@sentry/electron/main` captura `uncaughtException` y
 *     `unhandledRejection` del main, con `release = go-admin-desktop@<versión>`
 *     y `environment` production/development según `app.isPackaged`.
 *   - Su integración `SentryMinidump` arranca ella misma el `crashReporter`
 *     nativo con `uploadToServer: true` hacia el endpoint de minidumps del DSN:
 *     los crashes nativos (renderer, GPU, main) llegan a Sentry.
 *   - No se inyecta el preload de Sentry en ningún renderer ni se toca
 *     `session.defaultSession` (`getSessions: () => []`, `ipcMode: Classic`):
 *     la web ya lleva su propio Sentry (`@sentry/nextjs`) y la barra y la
 *     pantalla del cliente no tienen nada que reportar.
 *
 * Sin DSN: Sentry no se inicializa (sin ruido en el log) y el `crashReporter`
 * nativo arranca con `uploadToServer: false`, solo para que los minidumps
 * queden en `app.getPath('crashDumps')` por si hay que diagnosticar a mano.
 *
 * En ambos casos las excepciones del main se siguen escribiendo en
 * userData/agent.log (menú «Ver logs» de la bandeja).
 *
 * Debe llamarse antes de `app.whenReady()`: Sentry exige inicializarse antes
 * de `ready` y el crashReporter nativo debe existir antes de que se creen
 * procesos hijos (renderers, utilityProcess del servidor Next).
 */

let logBuffer: string[] = [];
const MAX_LOG_LINES = 500;
let sentryEnabled = false;

function getLogPath(): string {
  return path.join(app.getPath('userData'), 'agent.log');
}

export function isSentryEnabled(): boolean {
  return sentryEnabled;
}

function initSentry(dsn: string): boolean {
  try {
    // require en vez de import estático: si el paquete faltara en una
    // instalación rota, la app debe seguir arrancando sin Sentry.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/electron/main') as typeof import('@sentry/electron/main');
    Sentry.init({
      dsn,
      release: `go-admin-desktop@${app.getVersion()}`,
      environment: app.isPackaged ? 'production' : 'development',
      // Solo el proceso main: nada de preloads ni protocolos en los renderers.
      ipcMode: Sentry.IPCMode.Classic,
      getSessions: () => [],
      sendDefaultPii: false,
      // Sin trazas: solo errores y crashes.
      tracesSampleRate: 0,
      beforeSend(event) {
        // Nunca viaja el nombre del equipo ni el usuario del SO.
        delete event.server_name;
        if (event.user) delete event.user;
        return event;
      },
    });
    return true;
  } catch (err) {
    console.error('[crashReporter] No se pudo inicializar Sentry:', err);
    return false;
  }
}

export function initCrashReporter(): void {
  const { sentryDsn } = getPublicEnv();

  if (sentryDsn) {
    sentryEnabled = initSentry(sentryDsn);
  }

  if (!sentryEnabled) {
    // Sin DSN (o si Sentry falló): minidumps solo en disco. `uploadToServer`
    // queda en false porque no hay ningún servidor propio que los reciba; el
    // endpoint https://app.goadmin.io/api/crash-report que figuraba antes
    // nunca existió.
    crashReporter.start({
      productName: 'Go Admin Desktop',
      companyName: 'GO Admin',
      uploadToServer: false,
      compress: true,
    });
  }

  // Capturar excepciones no manejadas (además de Sentry, que las recibe por
  // su propia integración: aquí solo se escriben en agent.log).
  process.on('uncaughtException', (err) => {
    const msg = `[CRASH ${new Date().toISOString()}] Uncaught: ${err.stack || err.message}\n`;
    logBuffer.push(msg);
    flushLog();
    console.error(msg);
  });

  process.on('unhandledRejection', (reason) => {
    const msg = `[CRASH ${new Date().toISOString()}] Unhandled rejection: ${String(reason)}\n`;
    logBuffer.push(msg);
    flushLog();
    console.error(msg);
  });

  console.log(
    `[crashReporter] Inicializado (${sentryEnabled ? 'Sentry activo, minidumps a Sentry' : 'sin DSN: solo log local y minidumps en disco'})`
  );
}

let flushTimer: NodeJS.Timeout | null = null;
const FLUSH_DEBOUNCE_MS = 2_000;

/**
 * Añade una línea al log del main (userData/agent.log). Se escribe a disco
 * con un pequeño retraso (o de inmediato en flushLog(), que llama
 * before-quit y los crashes) para no bloquear el hilo principal por cada
 * línea que emite el servidor Next embebido.
 */
export function appendLog(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}
`;
  logBuffer.push(line);
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer = logBuffer.slice(-MAX_LOG_LINES);
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushLog();
    }, FLUSH_DEBOUNCE_MS);
    flushTimer.unref?.();
  }
}

export function flushLog(): void {
  if (logBuffer.length === 0) return;
  try {
    const logPath = getLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, logBuffer.join('') + '\n');
    logBuffer = [];
  } catch (err) {
    console.warn('[crashReporter] No se pudo escribir log:', err);
  }
}

export function readLog(): string {
  try {
    const logPath = getLogPath();
    if (fs.existsSync(logPath)) {
      return fs.readFileSync(logPath, 'utf-8');
    }
  } catch {}
  return '';
}

export function clearLog(): void {
  try {
    const logPath = getLogPath();
    if (fs.existsSync(logPath)) fs.rmSync(logPath, { force: true });
  } catch {}
}
