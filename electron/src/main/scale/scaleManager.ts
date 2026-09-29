import type { WebContents } from 'electron';
import { saveConfig } from '../store';
import { cargarSerialPort } from './serialLoader';

/**
 * Báscula del equipo (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.8 (a), §4).
 *
 * El proceso principal SOLO abre el puerto, entrega bytes crudos y escribe
 * comandos cortos. El intérprete de protocolos vive una sola vez en la web
 * (src/lib/pos/bascula) y lo comparten Desktop, Web Serial y BLE.
 *
 * Reglas:
 * - Un único puerto abierto por equipo. Abrir otro cierra el anterior.
 * - Los bytes van SOLO al webContents que abrió el puerto (no se difunden a
 *   la pantalla del cliente ni a otras ventanas) y el puerto se cierra cuando
 *   esa ventana se destruye o navega fuera de la app.
 * - `write` limita a 64 bytes por llamada (Toledo «W», SICS «SI\r\n», CAS ENQ…).
 * - Nada de esto pasa por el servidor local de impresión (:3456), que responde
 *   a cualquier origen.
 */

export interface ScaleOpenConfig {
  scaleId: string;
  path: string;
  baudRate: number;
  dataBits: 7 | 8;
  parity: 'none' | 'even' | 'odd';
  stopBits: 1 | 2;
}

export type ScaleError = 'port_not_found' | 'port_busy' | 'permission' | 'io' | 'unavailable';

export interface ScaleState {
  scaleId: string | null;
  status: 'closed' | 'opening' | 'open' | 'error';
  error?: ScaleError;
  /** Texto técnico del último error (soporte). */
  detail?: string;
  path?: string;
  bytesPerSecond?: number;
}

export interface SerialPortInfoOut {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
}

export const MAX_WRITE_BYTES = 64;
const BAUDIOS = new Set([1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]);

/** Valida lo que llega del renderer (no confiable aunque sea la web propia). */
export function parseOpenConfig(value: unknown): ScaleOpenConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('config debe ser un objeto');
  const raw = value as Record<string, unknown>;
  const scaleId = raw.scaleId;
  const path = raw.path;
  if (typeof scaleId !== 'string' || scaleId.length < 1 || scaleId.length > 64) throw new TypeError('scaleId inválido');
  if (typeof path !== 'string' || path.length < 1 || path.length > 200 || /[\0\r\n]/.test(path)) {
    throw new TypeError('path inválido');
  }
  const baudRate = Number(raw.baudRate);
  if (!BAUDIOS.has(baudRate)) throw new TypeError('baudRate inválido');
  const dataBits = Number(raw.dataBits);
  if (dataBits !== 7 && dataBits !== 8) throw new TypeError('dataBits inválido');
  const parity = raw.parity;
  if (parity !== 'none' && parity !== 'even' && parity !== 'odd') throw new TypeError('parity inválido');
  const stopBits = Number(raw.stopBits);
  if (stopBits !== 1 && stopBits !== 2) throw new TypeError('stopBits inválido');
  return { scaleId, path, baudRate, dataBits, parity, stopBits };
}

/** Bytes a escribir: Uint8Array/Buffer/array de enteros 0–255, 1 a 64. */
export function parseWriteBytes(value: unknown): Buffer {
  let bytes: number[];
  if (value instanceof Uint8Array) bytes = Array.from(value);
  else if (Array.isArray(value)) bytes = value as number[];
  else throw new TypeError('bytes debe ser un Uint8Array');
  if (bytes.length < 1 || bytes.length > MAX_WRITE_BYTES) throw new RangeError(`bytes: entre 1 y ${MAX_WRITE_BYTES}`);
  for (const b of bytes) {
    if (!Number.isInteger(b) || b < 0 || b > 255) throw new TypeError('bytes fuera de rango');
  }
  return Buffer.from(bytes);
}

/** Traduce el mensaje de serialport (Windows, Linux, macOS) a un código estable. */
export function clasificarError(err: unknown): ScaleError {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (/file not found|no such file|enoent|cannot find|not exist/.test(msg)) return 'port_not_found';
  if (/access denied|resource busy|ebusy|cannot lock|temporarily unavailable|in use/.test(msg)) return 'port_busy';
  if (/permission denied|eacces|eperm/.test(msg)) return 'permission';
  return 'io';
}

type SerialPortInstance = InstanceType<ReturnType<typeof cargarModulo>['SerialPort']>;

function cargarModulo() {
  const r = cargarSerialPort();
  if (!r.ok) throw Object.assign(new Error(r.error), { scaleError: 'unavailable' as ScaleError });
  return r.mod;
}

export class ScaleManager {
  private port: SerialPortInstance | null = null;
  private owner: WebContents | null = null;
  private config: ScaleOpenConfig | null = null;
  private state: ScaleState = { scaleId: null, status: 'closed' };
  private bytesEnVentana = 0;
  private medidor: NodeJS.Timeout | null = null;
  private quitarOyentesOwner: (() => void) | null = null;

  status(): ScaleState {
    return { ...this.state };
  }

  async listPorts(): Promise<SerialPortInfoOut[]> {
    const { SerialPort } = cargarModulo();
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer || undefined,
      vendorId: p.vendorId || undefined,
      productId: p.productId || undefined,
      serialNumber: p.serialNumber || undefined,
    }));
  }

  async open(config: ScaleOpenConfig, owner: WebContents): Promise<ScaleState> {
    // Mismo puerto, misma báscula y misma ventana: no se reabre (el diálogo
    // «Pesar» se abre y cierra muchas veces por venta).
    if (
      this.port?.isOpen &&
      this.owner === owner &&
      this.config &&
      this.config.path === config.path &&
      this.config.scaleId === config.scaleId &&
      this.config.baudRate === config.baudRate &&
      this.config.dataBits === config.dataBits &&
      this.config.parity === config.parity &&
      this.config.stopBits === config.stopBits
    ) {
      return this.status();
    }
    await this.close();

    let mod: ReturnType<typeof cargarModulo>;
    try {
      mod = cargarModulo();
    } catch (err) {
      this.setState({ scaleId: config.scaleId, status: 'error', error: 'unavailable', detail: (err as Error).message, path: config.path }, owner);
      return this.status();
    }

    this.owner = owner;
    this.config = config;
    this.setState({ scaleId: config.scaleId, status: 'opening', path: config.path });
    const port = new mod.SerialPort({
      path: config.path,
      baudRate: config.baudRate,
      dataBits: config.dataBits,
      parity: config.parity,
      stopBits: config.stopBits,
      autoOpen: false,
    });
    try {
      await new Promise<void>((resolve, reject) => port.open((err) => (err ? reject(err) : resolve())));
    } catch (err) {
      this.owner = null;
      this.config = null;
      this.setState(
        { scaleId: config.scaleId, status: 'error', error: clasificarError(err), detail: (err as Error)?.message, path: config.path },
        owner,
      );
      return this.status();
    }

    this.port = port;
    port.on('data', (chunk: Buffer) => {
      this.bytesEnVentana += chunk.length;
      const destino = this.owner;
      if (destino && !destino.isDestroyed()) destino.send('scale:data', new Uint8Array(chunk));
    });
    port.on('error', (err: Error) => {
      console.warn('[scale] Error del puerto:', err.message);
      this.setState({ ...this.state, status: 'error', error: clasificarError(err), detail: err.message });
    });
    port.on('close', () => {
      if (this.port !== port) return;
      this.port = null;
      this.pararMedidor();
      // Cierre no pedido (se desconectó el cable USB): queda en error para que la web avise.
      if (this.state.status === 'open') {
        this.setState({ ...this.state, status: 'error', error: 'io', detail: 'El puerto se cerró' });
      }
    });

    this.vigilarOwner(owner);
    this.iniciarMedidor();
    this.setState({ scaleId: config.scaleId, status: 'open', path: config.path, bytesPerSecond: 0 });
    try {
      saveConfig({ scale: { scaleId: config.scaleId, path: config.path } });
    } catch (err) {
      console.warn('[scale] No se pudo guardar la báscula del equipo en config.json:', err);
    }
    return this.status();
  }

  async close(): Promise<ScaleState> {
    const port = this.port;
    this.port = null;
    this.pararMedidor();
    this.quitarOyentesOwner?.();
    this.quitarOyentesOwner = null;
    const owner = this.owner;
    this.owner = null;
    this.config = null;
    if (port?.isOpen) {
      await new Promise<void>((resolve) => port.close(() => resolve()));
    }
    if (this.state.status !== 'closed') {
      this.setState({ scaleId: this.state.scaleId, status: 'closed', path: this.state.path }, owner);
    }
    return this.status();
  }

  async write(bytes: Buffer, from: WebContents): Promise<void> {
    if (!this.port?.isOpen) throw new Error('La báscula no está abierta');
    if (from !== this.owner) throw new Error('Solo la ventana que abrió la báscula puede escribirle');
    const port = this.port;
    await new Promise<void>((resolve, reject) => {
      port.write(bytes, (err) => {
        if (err) return reject(err);
        port.drain((err2) => (err2 ? reject(err2) : resolve()));
      });
    });
  }

  /** Cierra si la ventana dueña se destruye o recarga (evita un puerto huérfano). */
  private vigilarOwner(owner: WebContents): void {
    const cerrar = () => {
      void this.close();
    };
    // 'did-navigate' es solo del marco principal y no salta con la navegación
    // del cliente de Next (pushState → 'did-navigate-in-page'): recarga o
    // salida de la app, no cambio de ruta.
    owner.once('destroyed', cerrar);
    owner.once('did-navigate', cerrar);
    this.quitarOyentesOwner = () => {
      owner.removeListener('destroyed', cerrar);
      owner.removeListener('did-navigate', cerrar);
    };
  }

  private iniciarMedidor(): void {
    this.pararMedidor();
    this.bytesEnVentana = 0;
    this.medidor = setInterval(() => {
      this.state = { ...this.state, bytesPerSecond: this.bytesEnVentana };
      this.bytesEnVentana = 0;
    }, 1000);
  }

  private pararMedidor(): void {
    if (this.medidor) clearInterval(this.medidor);
    this.medidor = null;
  }

  private setState(next: ScaleState, alsoNotify?: WebContents | null): void {
    this.state = next;
    const destinos = new Set<WebContents>();
    if (this.owner) destinos.add(this.owner);
    if (alsoNotify) destinos.add(alsoNotify);
    for (const wc of destinos) {
      if (!wc.isDestroyed()) wc.send('scale:state', this.status());
    }
  }
}

export const scaleManager = new ScaleManager();
