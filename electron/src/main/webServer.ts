import { app, utilityProcess, UtilityProcess } from 'electron';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import * as crypto from 'crypto';
import { appendLog, flushLog } from './crashReporter';
import { getWebRoot as resolveWebRoot, readPublicEnvFile } from './publicEnv';

/**
 * Servidor Next.js embebido (fase 3 del desktop).
 *
 * POR QUÉ
 * -------
 * La web es Next.js App Router con middleware: cada navegación pide al
 * servidor un documento o un payload RSC. Cargando https://app.goadmin.io,
 * sin internet no hay a dónde navegar por muchos datos que haya cacheados
 * (docs/AUDITORIA-DESKTOP-OFFLINE-UI-INSTALADOR.md §1). Se decidió la opción
 * B2 de esa auditoría: empaquetar el build `standalone` de Next como
 * extraResource (`resources/web/`, fuera del asar) y arrancar su `server.js`
 * en 127.0.0.1. SSR y middleware siguen intactos.
 *
 * ORIGEN ESTABLE
 * --------------
 * localStorage, cookies e IndexedDB (la cache offline y la sesión) viven por
 * origen, y el origen incluye el puerto. Si el puerto cambiara entre
 * arranques, cada apertura de la app sería un "navegador nuevo" sin sesión
 * ni datos. Por eso el puerto se elige una vez, se persiste en
 * userData/web-server.json (el "puerto de casa") y no se vuelve a cambiar:
 * si un arranque lo encuentra ocupado, esa sesión corre en otro puerto pero
 * el siguiente arranque vuelve a intentar el de casa.
 *
 * CÓMO
 * ----
 * `utilityProcess.fork(webLauncher.js)` corre el servidor con el Node
 * embebido de Electron (sin `ELECTRON_RUN_AS_NODE` ni ejecutable aparte);
 * el envoltorio carga `server.js` y vigila al main para cerrarse si este
 * muere de golpe. Los logs del hijo van al log del main
 * (userData/agent.log). Se espera a que responda al primer `GET /` (hasta
 * 30 s) antes de dar la URL. Si el hijo muere con la app abierta, se
 * reintenta el arranque y se emite `exit` para que la ventana recargue.
 *
 * En desarrollo (`!app.isPackaged`) la ventana sigue cargando la web remota
 * salvo que `GOADMIN_DESKTOP_LOCAL_WEB=1`, en cuyo caso se usa
 * electron/resources/web (producido por `npm run build:web`).
 *
 * VARIABLES
 * ---------
 * El hijo recibe `HOSTNAME=127.0.0.1`, `PORT`, `NODE_ENV=production` y las
 * variables públicas (`NEXT_PUBLIC_*`) leídas de `resources/web/.env`, que
 * escribe scripts/build-web.js con una allow-list. Ninguna clave de servidor
 * (service role, Stripe, cron...) viaja en el instalador: las API routes que
 * las necesitan no funcionan contra el servidor local (ver
 * docs/desktop/FASE-3-NEXT-EMBEBIDO.md).
 */

/** Interfaz en la que escucha el servidor (y a la que se sondea). */
export const LOCAL_WEB_HOST = '127.0.0.1';
/**
 * Host de la URL que carga la ventana. Es `localhost` y no `127.0.0.1` a
 * propósito: `NextURL` (next/dist/server/web/next-url.js) reescribe
 * 127.0.0.1 y [::1] a `localhost` en `request.url` del middleware, así que
 * toda redirección (`NextResponse.redirect(new URL('/auth/login',
 * request.url))`) apunta a `http://localhost:<puerto>`. Si la ventana viviera
 * en `127.0.0.1`, cada redirección cambiaría de origen (otro localStorage,
 * otras cookies) y `will-navigate` la bloquearía. Chromium resuelve
 * `localhost` al loopback sin DNS, así que funciona sin red.
 */
export const LOCAL_WEB_URL_HOST = 'localhost';
/**
 * Puerto preferido. Fijo (y poco habitual) para que el origen sea el mismo en
 * todas las instalaciones y entre arranques. Si está ocupado se prueban los
 * siguientes y, en última instancia, uno libre que asigne el sistema.
 */
export const PREFERRED_PORT = 47800;
const PORT_CANDIDATES = 10;
/**
 * Si el puerto "de casa" (el persistido, o el preferido la primera vez) está
 * ocupado, se reintenta durante unos segundos antes de pasar al siguiente.
 * Cubre el caso real de un `server.js` huérfano de la sesión anterior: si el
 * main murió de golpe (crash, Stop-Process, apagado), Electron mata al hijo
 * al cerrar el job object pero tarda unos segundos, y mientras tanto sigue
 * escuchando. Sin esta espera la app arrancaba en 47801 y cambiaba de origen
 * (visto el 2026-09-16 en la prueba de fase 3).
 */
const HOME_PORT_RETRIES = 6;
const HOME_PORT_RETRY_MS = 500;
const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 250;
const STOP_TIMEOUT_MS = 5_000;
const RESTART_DELAY_MS = 1_500;
const MAX_RESTARTS = 3;

type WebServerEvents = {
  ready: (url: string) => void;
  /** El servidor murió sin que se le pidiera. Se emite ANTES de intentar reiniciarlo. */
  exit: (code: number | undefined) => void;
  /** Reinicio tras una caída completado; la ventana debe recargar. */
  restarted: (url: string) => void;
  error: (err: Error) => void;
};

/** Estado persistido entre arranques (userData/web-server.json). */
interface PersistedState {
  /**
   * Puerto de casa: el primero en el que arrancó bien esta instalación. Se
   * intenta siempre primero y no se sobreescribe (ver doStart).
   */
  port?: number;
  /**
   * Secreto con el que el middleware firma la cookie `ga_gate` (cache del
   * veredicto de acceso por organización/módulo). Solo la verifica este mismo
   * servidor local, así que basta con que sea estable por instalación: si
   * cambiara en cada arranque, la primera navegación a cada módulo sin
   * internet esperaría el timeout del gate (2,5 s) antes de mostrar la página.
   */
  gateSecret?: string;
}

class WebServer extends EventEmitter {
  private child: UtilityProcess | null = null;
  private port: number | null = null;
  private starting: Promise<string> | null = null;
  private stopping = false;
  private restarts = 0;

  on<K extends keyof WebServerEvents>(event: K, listener: WebServerEvents[K]): this {
    return super.on(event, listener);
  }

  /** true si la ventana debe cargar el servidor local en lugar de app.goadmin.io. */
  shouldUseLocalWeb(): boolean {
    return app.isPackaged || process.env.GOADMIN_DESKTOP_LOCAL_WEB === '1';
  }

  /** Carpeta con server.js, .next/, public/ y .env (la resuelve publicEnv, compartida con el main). */
  getWebRoot(): string {
    return resolveWebRoot();
  }

  /** true si hay un build empaquetado que se pueda arrancar. */
  hasLocalWeb(): boolean {
    return fs.existsSync(path.join(this.getWebRoot(), 'server.js'));
  }

  getUrl(): string | null {
    return this.port ? `http://${LOCAL_WEB_URL_HOST}:${this.port}` : null;
  }

  /** Hosts (`host:puerto`) que cuentan como el servidor local, para isInternalUrl(). */
  getHosts(): string[] {
    if (!this.port) return [];
    return [`${LOCAL_WEB_URL_HOST}:${this.port}`, `${LOCAL_WEB_HOST}:${this.port}`];
  }

  isRunning(): boolean {
    return this.child !== null && this.port !== null;
  }

  /**
   * Arranca el servidor y resuelve con su URL cuando responde al primer
   * `GET /`. Idempotente: llamadas concurrentes comparten la misma promesa.
   * Rechaza si no hay build empaquetado, si no encuentra puerto libre tras
   * varios intentos o si el servidor no responde en 30 s.
   */
  start(): Promise<string> {
    if (this.getUrl() && this.child) return Promise.resolve(this.getUrl()!);
    if (this.starting) return this.starting;
    this.starting = this.doStart().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async doStart(): Promise<string> {
    const webRoot = this.getWebRoot();
    const serverJs = path.join(webRoot, 'server.js');
    if (!fs.existsSync(serverJs)) {
      throw new Error(
        `No existe ${serverJs}. Ejecuta \`npm run build:web\` en electron/ (o reinstala la app).`
      );
    }

    const packagedEnv = readPackagedEnv(path.join(webRoot, '.env'));
    const state = readState();
    const gateSecret = state.gateSecret || crypto.randomBytes(32).toString('hex');
    if (!state.gateSecret) writeState({ ...state, gateSecret });

    let lastError: Error | null = null;
    const tried = new Set<number>();
    // Puerto "de casa": el persistido o, la primera vez, el preferido. Es el
    // único que se reintenta si está ocupado (ver HOME_PORT_RETRIES).
    const homePort = state.port ?? PREFERRED_PORT;

    for (const candidate of portCandidates(state.port)) {
      if (tried.has(candidate)) continue;
      tried.add(candidate);
      const port = await this.reservePortWithRetry(candidate, candidate === homePort);
      if (port === null) {
        this.log(`Puerto ${candidate} ocupado; se prueba el siguiente`);
        continue;
      }
      try {
        await this.spawnAndWait(serverJs, webRoot, port, packagedEnv, gateSecret);
        this.port = port;
        const url = this.getUrl()!;
        if (!state.port) {
          // Primera vez: este pasa a ser el puerto de casa de la instalación.
          writeState({ ...readState(), port });
        } else if (state.port !== port) {
          // El puerto de casa estaba ocupado. NO se persiste el nuevo: si se
          // hiciera, un huérfano o una colisión puntual cambiarían el origen
          // para siempre (otra sesión, otra cache offline). En el próximo
          // arranque se vuelve a intentar el de casa; si sigue ocupado, el
          // orden de candidatos es fijo y se acaba en el mismo puerto.
          this.log(
            `AVISO: el puerto de casa ${state.port} está ocupado; esta sesión corre en ${port} (otro origen: la sesión/cache offline de ${state.port} no se ven y esta no se persistirá)`
          );
        }
        this.log(`Servidor Next listo en ${url}`);
        this.emit('ready', url);
        return url;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.log(`Arranque en el puerto ${port} falló: ${lastError.message}`);
        await this.killChild();
        // Solo tiene sentido reintentar con otro puerto si el hijo murió
        // pronto (puerto ocupado entre la reserva y el listen). Un timeout
        // de 30 s no lo arregla otro puerto.
        if (/timeout/i.test(lastError.message)) break;
      }
    }

    const error = lastError ?? new Error('No se encontró ningún puerto libre para el servidor Next');
    this.emit('error', error);
    throw error;
  }

  /**
   * Reserva el puerto; si es el de casa y está ocupado, insiste unos segundos
   * (huérfano de la sesión anterior que aún no ha muerto).
   */
  private async reservePortWithRetry(candidate: number, isHome: boolean): Promise<number | null> {
    const attempts = isHome && candidate !== 0 ? HOME_PORT_RETRIES : 1;
    for (let i = 0; i < attempts; i++) {
      const port = await tryReservePort(candidate);
      if (port !== null) return port;
      if (i === 0 && attempts > 1) {
        this.log(`Puerto ${candidate} ocupado; se espera hasta ${(attempts * HOME_PORT_RETRY_MS) / 1000} s a que se libere`);
      }
      if (i < attempts - 1) await sleep(HOME_PORT_RETRY_MS);
    }
    return null;
  }

  private spawnAndWait(
    serverJs: string,
    cwd: string,
    port: number,
    packagedEnv: Record<string, string>,
    gateSecret: string
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        ...packagedEnv,
        NODE_ENV: 'production',
        HOSTNAME: LOCAL_WEB_HOST,
        PORT: String(port),
        GATE_COOKIE_SECRET: gateSecret,
        // Sin telemetría ni comprobación de versiones desde el escritorio.
        NEXT_TELEMETRY_DISABLED: '1',
        // Marca para que el código de la web pueda distinguir el servidor
        // embebido si algún día lo necesita.
        GOADMIN_DESKTOP_EMBEDDED: '1',
        // Para webLauncher.ts: qué cargar y a quién vigilar.
        GOADMIN_WEB_SERVER_JS: serverJs,
        GOADMIN_PARENT_PID: String(process.pid),
      };
      // Que el hijo no herede la marca de "modo Node" si el main la tuviera.
      delete env.ELECTRON_RUN_AS_NODE;

      // Se arranca a través de webLauncher.js (dist/main), que hace
      // require(server.js) y cierra el hijo si el main desaparece; ver ese
      // archivo para el porqué.
      const child = utilityProcess.fork(path.join(__dirname, 'webLauncher.js'), [], {
        cwd,
        env,
        stdio: 'pipe',
        serviceName: 'go-admin-web',
      });
      this.child = child;

      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        fn();
      };

      child.stdout?.on('data', (chunk: Buffer) => this.pipeLog('stdout', chunk));
      child.stderr?.on('data', (chunk: Buffer) => this.pipeLog('stderr', chunk));

      child.once('exit', (code) => {
        this.log(`El servidor Next terminó (código ${code})`);
        const wasRunning = this.port !== null && this.child === child;
        if (this.child === child) {
          this.child = null;
          this.port = null;
        }
        if (wasRunning && !this.stopping) {
          this.emit('exit', code);
          this.scheduleRestart();
        }
        finish(() => reject(new Error(`server.js terminó con código ${code} antes de responder`)));
      });

      const url = `http://${LOCAL_WEB_HOST}:${port}`;
      const pollTimer = setInterval(() => {
        probe(url).then((ok) => {
          if (ok) finish(() => resolve(url));
        });
      }, READY_POLL_MS);

      const timeoutTimer = setTimeout(() => {
        finish(() => reject(new Error(`timeout: el servidor no respondió en ${READY_TIMEOUT_MS / 1000} s`)));
      }, READY_TIMEOUT_MS);
    });
  }

  /** Reintenta arrancar tras una caída inesperada (máx. MAX_RESTARTS por sesión). */
  private scheduleRestart(): void {
    if (this.restarts >= MAX_RESTARTS) {
      this.log(`El servidor Next cayó ${this.restarts} veces; no se reintenta más`);
      return;
    }
    this.restarts += 1;
    this.log(`Reiniciando el servidor Next en ${RESTART_DELAY_MS} ms (intento ${this.restarts}/${MAX_RESTARTS})`);
    setTimeout(() => {
      if (this.stopping) return;
      this.start()
        .then((url) => this.emit('restarted', url))
        .catch((err) => this.log(`El reinicio falló: ${err instanceof Error ? err.message : String(err)}`));
    }, RESTART_DELAY_MS);
  }

  /** Para el servidor. Seguro de llamar aunque no esté arrancado. */
  async stop(): Promise<void> {
    this.stopping = true;
    try {
      if (this.child) this.log('Parando el servidor Next');
      await this.killChild();
      flushLog();
    } finally {
      this.stopping = false;
    }
  }

  private killChild(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.port = null;
    if (!child) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, STOP_TIMEOUT_MS);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        if (!child.kill()) resolve();
      } catch {
        resolve();
      }
    });
  }

  private pipeLog(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    const text = chunk.toString('utf-8').trimEnd();
    if (!text) return;
    for (const line of text.split(/\r?\n/)) {
      if (stream === 'stderr') console.error(`[web] ${line}`);
      else console.log(`[web] ${line}`);
      appendLog(`[web:${stream}] ${line}`);
    }
  }

  private log(message: string): void {
    console.log(`[webServer] ${message}`);
    appendLog(`[webServer] ${message}`);
  }
}

// ── Estado persistido ──

function getStatePath(): string {
  return path.join(app.getPath('userData'), 'web-server.json');
}

function readState(): PersistedState {
  try {
    const raw = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8')) as PersistedState;
    const out: PersistedState = {};
    if (Number.isInteger(raw.port) && raw.port! > 0 && raw.port! < 65536) out.port = raw.port;
    if (typeof raw.gateSecret === 'string' && raw.gateSecret.length >= 32) out.gateSecret = raw.gateSecret;
    return out;
  } catch {
    return {};
  }
}

function writeState(state: PersistedState): void {
  try {
    fs.mkdirSync(path.dirname(getStatePath()), { recursive: true });
    fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('[webServer] No se pudo guardar web-server.json:', err);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Puertos ──

/** Orden de prueba: el persistido, el preferido y sus siguientes, y por último uno del sistema (0). */
function* portCandidates(saved?: number): Generator<number> {
  if (saved) yield saved;
  for (let i = 0; i < PORT_CANDIDATES; i++) yield PREFERRED_PORT + i;
  yield 0;
}

/**
 * Comprueba que el puerto está libre en 127.0.0.1 reservándolo un instante.
 * Con 0 devuelve el que asigne el sistema. null si está ocupado.
 */
function tryReservePort(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(null));
    server.listen(port, LOCAL_WEB_HOST, () => {
      const address = server.address();
      const chosen = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(chosen || null));
    });
  });
}

/**
 * true si hay un servidor HTTP respondiendo en la URL. Cualquier código de
 * estado vale (la raíz suele redirigir al login con 307); solo cuenta que
 * conteste. No sigue redirecciones ni lee el cuerpo.
 */
function probe(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2_000, headers: { 'user-agent': 'go-admin-desktop/webServer' } }, (res) => {
      res.resume();
      resolve(typeof res.statusCode === 'number' && res.statusCode > 0);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

/**
 * Lee resources/web/.env y devuelve solo las claves públicas (parser y
 * allow-list `NEXT_PUBLIC_*` en publicEnv.ts, compartidos con el main).
 */
function readPackagedEnv(file: string): Record<string, string> {
  const rec = readPublicEnvFile(file);
  if (!rec) {
    console.warn(`[webServer] No se encontró ${file}; el servidor arranca sin variables públicas`);
    return {};
  }
  return rec;
}

export const webServer = new WebServer();
