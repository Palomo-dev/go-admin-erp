/**
 * Ciclo de vida del proceso principal: segunda instancia, cierre acotado y
 * registro en userData/agent.log.
 *
 * POR QUÉ (reporte del 2026-10-06: «la app se abre y se cierra sola»)
 * -------------------------------------------------------------------
 * 1. El cierre no tenía tope. `before-quit` esperaba `markOffline()` (una
 *    petición a Supabase por sucursal, sin timeout) y el servidor Next
 *    embebido. Con la red caída o colgada (lo habitual cuando la barra dice
 *    «Sin conexión») ese proceso podía quedarse vivo minutos con la ventana
 *    en pantalla y, sobre todo, con el bloqueo de instancia única. Abrir la
 *    app en ese rato lanzaba una segunda instancia que salía al instante (no
 *    obtiene el bloqueo) mientras la vieja, al recibir `second-instance`,
 *    volvía a mostrar su ventana… y la cerraba al terminar su limpieza. Para
 *    el usuario: «se abre y se cierra sola».
 * 2. Una segunda instancia durante el arranque de la primera (la de
 *    autoarranque `--hidden`, esperando hasta 30 s al servidor Next) se
 *    perdía: aún no había ventana que mostrar.
 * 3. agent.log no registraba nada del ciclo de vida: ni la versión, ni el
 *    bloqueo, ni quién pedía salir, ni los procesos hijos que morían (GPU,
 *    renderer), ni el actualizador. Diagnosticar exigía una consola.
 *
 * Este módulo no importa `electron` en tiempo de ejecución (solo tipos): la
 * lógica se prueba con jest sin el binario (src/__tests__/electron/lifecycle.test.ts).
 */

export type Registro = (mensaje: string) => void;

// ── Segunda instancia ──

export type AccionSegundaInstancia =
  /** Hay ventana y la app no está saliendo: traerla al frente. */
  | 'mostrar'
  /** La primera instancia aún arranca (sin ventana): mostrarla en cuanto exista. */
  | 'mostrarAlCrear'
  /** La app está saliendo: no resucitar la ventana; relanzar al terminar de salir. */
  | 'relanzarTrasSalir'
  /**
   * La app está saliendo y el actualizador va a instalar al salir: el
   * instalador cierra cualquier `Go Admin ERP.exe` que encuentre, así que
   * relanzar ahora solo produciría otra ventana que se cierra sola.
   */
  | 'esperarInstalacion';

export interface EstadoSegundaInstancia {
  hayVentana: boolean;
  saliendo: boolean;
  actualizacionPendiente: boolean;
}

export function decidirSegundaInstancia(e: EstadoSegundaInstancia): AccionSegundaInstancia {
  if (e.saliendo) return e.actualizacionPendiente ? 'esperarInstalacion' : 'relanzarTrasSalir';
  return e.hayVentana ? 'mostrar' : 'mostrarAlCrear';
}

// ── Cierre acotado ──

export interface PasoCierre {
  nombre: string;
  /** Tope de este paso en ms. */
  limiteMs: number;
  ejecutar: () => unknown;
}

export interface ResultadoPaso {
  nombre: string;
  resultado: 'ok' | 'error' | 'tiempo';
  ms: number;
  error?: string;
}

const espera = (ms: number) =>
  new Promise<'tiempo'>((resolve) => {
    const t = setTimeout(() => resolve('tiempo'), ms);
    (t as { unref?: () => void }).unref?.();
  });

/**
 * Ejecuta los pasos de limpieza en orden, cada uno con su tope, y todos
 * juntos con `limiteTotalMs`. Nunca rechaza ni se queda esperando: un paso
 * que falla o no responde se registra y se pasa al siguiente. Cuando se
 * agota el total, los pasos restantes se marcan como «tiempo» sin ejecutarse.
 */
export async function ejecutarCierre(
  pasos: PasoCierre[],
  opciones: { limiteTotalMs: number; log: Registro; ahora?: () => number },
): Promise<ResultadoPaso[]> {
  const ahora = opciones.ahora ?? Date.now;
  const inicio = ahora();
  const resultados: ResultadoPaso[] = [];
  for (const paso of pasos) {
    const restante = opciones.limiteTotalMs - (ahora() - inicio);
    if (restante <= 0) {
      resultados.push({ nombre: paso.nombre, resultado: 'tiempo', ms: 0 });
      opciones.log(`[app] Cierre: «${paso.nombre}» omitido (se agotó el tope total de ${opciones.limiteTotalMs} ms)`);
      continue;
    }
    const tope = Math.min(paso.limiteMs, restante);
    const t0 = ahora();
    let r: ResultadoPaso;
    try {
      const salida = await Promise.race([Promise.resolve().then(paso.ejecutar).then(() => 'ok' as const), espera(tope)]);
      r = { nombre: paso.nombre, resultado: salida, ms: ahora() - t0 };
    } catch (err) {
      r = { nombre: paso.nombre, resultado: 'error', ms: ahora() - t0, error: err instanceof Error ? err.message : String(err) };
    }
    resultados.push(r);
    if (r.resultado !== 'ok') {
      opciones.log(
        `[app] Cierre: «${paso.nombre}» ${r.resultado === 'tiempo' ? `sin respuesta tras ${tope} ms; se continúa` : `falló: ${r.error}`}`,
      );
    }
  }
  opciones.log(`[app] Cierre: limpieza terminada en ${ahora() - inicio} ms`);
  return resultados;
}

// ── Registro del ciclo de vida ──

/** Lo mínimo de `Electron.App` que se escucha (permite un doble en las pruebas). */
export interface AppEventos {
  on(evento: string, oyente: (...args: never[]) => void): unknown;
}

interface DetallesProceso {
  type?: string;
  reason?: string;
  exitCode?: number;
  name?: string;
  serviceName?: string;
}

/**
 * Escucha los eventos de `app` que explican un cierre y los escribe en
 * agent.log. Las líneas empiezan por `[app]` para filtrarlas.
 */
export function registrarCicloDeVida(app: AppEventos, log: Registro): void {
  app.on('before-quit', () => log('[app] before-quit: la app empieza a salir'));
  app.on('will-quit', () => log('[app] will-quit: ventanas cerradas'));
  app.on('quit', ((_e: unknown, exitCode: number) => log(`[app] quit (código ${exitCode})`)) as (...a: never[]) => void);
  app.on('render-process-gone', ((_e: unknown, wc: { getURL?: () => string } | undefined, d: DetallesProceso) => {
    let url = '';
    try {
      url = wc?.getURL?.() ?? '';
    } catch {
      url = '';
    }
    log(`[app] render-process-gone: motivo=${d?.reason} código=${d?.exitCode} url=${resumirUrl(url)}`);
  }) as (...a: never[]) => void);
  app.on('child-process-gone', ((_e: unknown, d: DetallesProceso) => {
    log(
      `[app] child-process-gone: tipo=${d?.type} motivo=${d?.reason} código=${d?.exitCode}${d?.serviceName ? ` servicio=${d.serviceName}` : ''}${d?.name ? ` nombre=${d.name}` : ''}`,
    );
  }) as (...a: never[]) => void);
}

/** Origen + ruta, sin query ni fragmento (pueden llevar tokens). `data:` se resume. */
export function resumirUrl(url: string): string {
  if (!url) return '(sin url)';
  if (url.startsWith('data:')) return 'data:(pantalla propia)';
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '(url no válida)';
  }
}

/** Línea de arranque: versión, pid, si se abrió oculta y si obtuvo el bloqueo. */
export function lineaArranque(d: { version: string; pid: number; argv: string[]; empaquetada: boolean; bloqueo: boolean }): string {
  const oculta = d.argv.includes('--hidden');
  const actualizada = d.argv.some((a) => a === '--updated');
  return (
    `[app] Arranque v${d.version} pid=${d.pid}${d.empaquetada ? '' : ' (desarrollo)'}` +
    `${oculta ? ' --hidden' : ''}${actualizada ? ' --updated' : ''} bloqueo=${d.bloqueo ? 'sí' : 'NO (otra instancia lo tiene; esta sale)'}`
  );
}
