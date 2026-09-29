/**
 * Carga perezosa de `serialport` (módulo nativo, @serialport/bindings-cpp).
 *
 * Va detrás de un `require` dinámico a propósito: si el binario no está (un
 * instalador armado sin `asarUnpack`, una plataforma sin prebuild, un antivirus
 * que lo puso en cuarentena), el Desktop arranca igual y solo la báscula
 * responde con un error claro, en vez de tumbar el proceso principal al
 * importar. `HARDENING-2026-09-21.md` §5 registra que un módulo nativo ya dio
 * problemas en Windows limpio.
 */

export type SerialPortModule = typeof import('serialport');

export type ResultadoCarga = { ok: true; mod: SerialPortModule } | { ok: false; error: string };

let cache: ResultadoCarga | null = null;

export function cargarSerialPort(): ResultadoCarga {
  if (cache) return cache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('serialport') as SerialPortModule;
    if (!mod || typeof mod.SerialPort !== 'function') {
      cache = { ok: false, error: 'serialport cargó sin la clase SerialPort' };
    } else {
      cache = { ok: true, mod };
    }
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error('[scale] No se pudo cargar serialport (binario nativo). La báscula no estará disponible:', detalle);
    cache = {
      ok: false,
      error: `No se pudo cargar el módulo de puertos serie (serialport): ${detalle}. Reinstala Go Admin Desktop; si persiste, revisa que el antivirus no haya bloqueado bindings-cpp.node.`,
    };
  }
  return cache;
}
