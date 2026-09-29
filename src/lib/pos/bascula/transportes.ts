/**
 * Transportes de la báscula (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.8 y §4):
 * un adaptador común para que el lector no sepa de dónde vienen los bytes.
 *
 * - `transporteDesktop`: Go Admin Desktop (`window.goAdminDesktop.scale`,
 *   serialport en el proceso principal).
 * - `transporteWebSerial`: Chrome/Edge de computador (`navigator.serial`). La
 *   primera vez el usuario elige el puerto con un gesto (`elegirPuertoWebSerial`);
 *   después `getPorts()` lo recuerda en ese navegador. Dentro del Desktop NO se
 *   usa (su política de dispositivos lo bloquea a propósito).
 * - `transporteManual`: sin bytes (peso a mano).
 */

import type { DesktopScaleBridge, DesktopScaleState } from '@/lib/utils/desktop';
import type { ConfigBascula } from './tipos';

export type CodigoErrorTransporte = 'no_soportado' | 'sin_puerto' | 'puerto_ocupado' | 'permiso' | 'io' | 'no_disponible';

export class ErrorTransporte extends Error {
  constructor(
    public readonly codigo: CodigoErrorTransporte,
    mensaje?: string,
  ) {
    super(mensaje ?? codigo);
    this.name = 'ErrorTransporte';
  }
}

export interface TransporteBascula {
  abrir(cfg: ConfigBascula): Promise<void>;
  cerrar(): Promise<void>;
  escribir(bytes: Uint8Array): Promise<void>;
  alRecibir(cb: (chunk: Uint8Array) => void): () => void;
  /** Error del transporte después de abrir (cable desconectado, puerto perdido). */
  alFallar?(cb: (codigo: CodigoErrorTransporte) => void): () => void;
}

function aBytes(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (Array.isArray(chunk)) return Uint8Array.from(chunk as number[]);
  if (chunk && typeof chunk === 'object' && 'data' in (chunk as Record<string, unknown>)) {
    const data = (chunk as { data: unknown }).data;
    if (Array.isArray(data)) return Uint8Array.from(data as number[]);
  }
  return new Uint8Array(0);
}

class Oyentes<T> {
  private lista = new Set<(v: T) => void>();
  agregar(cb: (v: T) => void): () => void {
    this.lista.add(cb);
    return () => {
      this.lista.delete(cb);
    };
  }
  emitir(v: T): void {
    for (const cb of this.lista) cb(v);
  }
}

// ── Go Admin Desktop ───────────────────────────────────────────────────────

export function codigoDesdeEstadoDesktop(error: DesktopScaleState['error']): CodigoErrorTransporte {
  switch (error) {
    case 'port_not_found':
      return 'sin_puerto';
    case 'port_busy':
      return 'puerto_ocupado';
    case 'permission':
      return 'permiso';
    case 'unavailable':
      return 'no_disponible';
    default:
      return 'io';
  }
}

export function transporteDesktop(scale: DesktopScaleBridge): TransporteBascula {
  return {
    async abrir(cfg) {
      const path = (cfg.dispositivo ?? '').trim();
      if (!path) throw new ErrorTransporte('sin_puerto');
      const estado = await scale.open({
        scaleId: cfg.id,
        path,
        baudRate: cfg.baudios,
        dataBits: cfg.bitsDatos,
        parity: cfg.paridad,
        stopBits: cfg.bitsParada,
      });
      if (estado.status !== 'open') throw new ErrorTransporte(codigoDesdeEstadoDesktop(estado.error), estado.detail);
    },
    async cerrar() {
      await scale.close();
    },
    async escribir(bytes) {
      await scale.write(bytes);
    },
    alRecibir(cb) {
      return scale.onData((chunk) => cb(aBytes(chunk)));
    },
    alFallar(cb) {
      return scale.onState((estado) => {
        if (estado.status === 'error') cb(codigoDesdeEstadoDesktop(estado.error));
      });
    },
  };
}

// ── Web Serial ─────────────────────────────────────────────────────────────

/** Lo mínimo de la API Web Serial que se usa (no está en la lib DOM de TypeScript). */
export interface PuertoSerieWeb {
  open(opciones: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}

export interface SerieWeb {
  getPorts(): Promise<PuertoSerieWeb[]>;
  requestPort(opciones?: { filters?: { usbVendorId?: number; usbProductId?: number }[] }): Promise<PuertoSerieWeb>;
}

/** `navigator.serial` si existe y el contexto es seguro (HTTPS); si no, null. */
export function serieDelNavegador(): SerieWeb | null {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return null;
  if (window.isSecureContext === false) return null;
  const serial = (navigator as unknown as { serial?: SerieWeb }).serial;
  return serial && typeof serial.getPorts === 'function' && typeof serial.requestPort === 'function' ? serial : null;
}

const hex4 = (n: number) => n.toString(16).padStart(4, '0');

/** Identificador estable del puerto para recordarlo: `usb:067b:2303` o `serial`. */
export function pistaPuerto(puerto: Pick<PuertoSerieWeb, 'getInfo'>): string {
  const info = puerto.getInfo?.() ?? {};
  if (typeof info.usbVendorId === 'number' && typeof info.usbProductId === 'number') {
    return `usb:${hex4(info.usbVendorId)}:${hex4(info.usbProductId)}`;
  }
  return 'serial';
}

/**
 * Puerto ya autorizado en este navegador para la báscula: el de la misma
 * pista; sin pista (o sin coincidencia) y con un solo puerto autorizado, ese.
 */
export async function buscarPuertoAutorizado(serial: SerieWeb, pista: string | null | undefined): Promise<PuertoSerieWeb | null> {
  const puertos = await serial.getPorts();
  if (pista) {
    const igual = puertos.find((p) => pistaPuerto(p) === pista);
    if (igual) return igual;
  }
  return puertos.length === 1 ? puertos[0] : null;
}

/** Pide al usuario el puerto (DEBE llamarse desde un clic). */
export async function elegirPuertoWebSerial(serial: SerieWeb): Promise<{ puerto: PuertoSerieWeb; pista: string } | null> {
  try {
    const puerto = await serial.requestPort();
    return { puerto, pista: pistaPuerto(puerto) };
  } catch (err) {
    // NotFoundError: el usuario cerró el selector sin elegir.
    if (err instanceof Error && err.name === 'NotFoundError') return null;
    throw new ErrorTransporte(err instanceof Error && err.name === 'SecurityError' ? 'permiso' : 'io', (err as Error)?.message);
  }
}

function codigoErrorWebSerial(err: unknown): CodigoErrorTransporte {
  const nombre = err instanceof Error ? err.name : '';
  if (nombre === 'InvalidStateError' || nombre === 'NetworkError') return 'puerto_ocupado';
  if (nombre === 'SecurityError' || nombre === 'NotAllowedError') return 'permiso';
  if (nombre === 'NotFoundError') return 'sin_puerto';
  return 'io';
}

export function transporteWebSerial(serial: SerieWeb, puertoElegido?: PuertoSerieWeb | null): TransporteBascula {
  let puerto: PuertoSerieWeb | null = null;
  let lector: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let activo = false;
  let bucle: Promise<void> | null = null;
  const datos = new Oyentes<Uint8Array>();
  const fallos = new Oyentes<CodigoErrorTransporte>();

  const leer = async (p: PuertoSerieWeb) => {
    while (activo && p.readable) {
      lector = p.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          if (value && value.length) datos.emitir(value);
        }
      } catch (err) {
        // Error recuperable (paridad, desborde): se sigue leyendo; el resto, falla.
        const nombre = err instanceof Error ? err.name : '';
        if (activo && !['BreakError', 'FramingError', 'ParityError', 'BufferOverrunError'].includes(nombre)) {
          fallos.emitir('io');
          break;
        }
      } finally {
        try {
          lector?.releaseLock();
        } catch {
          /* ya liberado */
        }
        lector = null;
      }
    }
    if (activo && !p.readable) fallos.emitir('io'); // se desconectó el cable
  };

  return {
    async abrir(cfg) {
      const p = puertoElegido ?? (await buscarPuertoAutorizado(serial, cfg.dispositivo));
      if (!p) throw new ErrorTransporte('sin_puerto');
      try {
        await p.open({
          baudRate: cfg.baudios,
          dataBits: cfg.bitsDatos,
          stopBits: cfg.bitsParada,
          parity: cfg.paridad,
          bufferSize: 1024,
        });
      } catch (err) {
        throw new ErrorTransporte(codigoErrorWebSerial(err), (err as Error)?.message);
      }
      puerto = p;
      activo = true;
      bucle = leer(p);
    },
    async cerrar() {
      activo = false;
      try {
        await lector?.cancel();
      } catch {
        /* nada que cancelar */
      }
      try {
        await bucle;
      } catch {
        /* el bucle ya terminó */
      }
      bucle = null;
      try {
        await puerto?.close();
      } catch {
        /* ya cerrado */
      }
      puerto = null;
    },
    async escribir(bytes) {
      const w = puerto?.writable?.getWriter();
      if (!w) throw new ErrorTransporte('io', 'puerto sin escritura');
      try {
        await w.write(bytes);
      } finally {
        w.releaseLock();
      }
    },
    alRecibir: (cb) => datos.agregar(cb),
    alFallar: (cb) => fallos.agregar(cb),
  };
}

// ── Manual ─────────────────────────────────────────────────────────────────

/** Sin báscula: no hay bytes; el peso se escribe a mano. */
export function transporteManual(): TransporteBascula {
  return {
    async abrir() {},
    async cerrar() {},
    async escribir() {},
    alRecibir: () => () => undefined,
  };
}

// ── Elección ───────────────────────────────────────────────────────────────

export interface EntornoBascula {
  /** Puente del Desktop si este equipo lo trae (`desktopScaleBridge()`). */
  desktop: DesktopScaleBridge | null;
  /** `navigator.serial` (null dentro del Desktop o en navegadores sin Web Serial). */
  serial: SerieWeb | null;
  /** true dentro de Go Admin Desktop. */
  enDesktop: boolean;
}

/** ¿Se puede leer esta báscula desde aquí? */
export function transporteDisponible(transporte: ConfigBascula['transporte'], entorno: EntornoBascula): boolean {
  if (transporte === 'desktop_serial') return entorno.desktop !== null;
  if (transporte === 'web_serial') return !entorno.enDesktop && entorno.serial !== null;
  return false;
}

export function crearTransporte(
  cfg: ConfigBascula,
  entorno: EntornoBascula,
  opciones: { puertoWebSerial?: PuertoSerieWeb | null } = {},
): TransporteBascula {
  if (cfg.transporte === 'desktop_serial' && entorno.desktop) return transporteDesktop(entorno.desktop);
  if (cfg.transporte === 'web_serial' && !entorno.enDesktop && entorno.serial) {
    return transporteWebSerial(entorno.serial, opciones.puertoWebSerial);
  }
  throw new ErrorTransporte('no_soportado');
}
