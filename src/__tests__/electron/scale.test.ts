/**
 * Báscula de Go Admin Desktop (electron/src/main/scale, fase 3 de productos por
 * peso): validación de lo que llega del renderer, clasificación de errores de
 * serialport, un único puerto con bytes solo al dueño, límite de `write` y
 * verificación de origen del IPC. Sin binario de Electron ni de serialport:
 * se usan dobles.
 */

jest.mock('electron', () => ({ ipcMain: { handle: jest.fn() } }), { virtual: true });
jest.mock('../../../electron/src/main/store', () => ({ saveConfig: jest.fn() }));
jest.mock('../../../electron/src/main/windows/mainWindow', () => ({
  getLoadUrl: () => 'http://localhost:3999',
  isInternalUrl: (url: string) => url === 'http://localhost:3999',
}));

type Cb = (err?: Error | null) => void;
class PuertoFalso {
  static fallarAlAbrir: Error | null = null;
  static creados: PuertoFalso[] = [];
  isOpen = false;
  escritos: Buffer[] = [];
  private oyentes: Record<string, ((...a: unknown[]) => void)[]> = {};
  constructor(public opciones: Record<string, unknown>) {
    PuertoFalso.creados.push(this);
  }
  static async list() {
    return [{ path: 'COM3', manufacturer: 'Prolific', vendorId: '067b', productId: '2303' }];
  }
  open(cb: Cb) {
    if (PuertoFalso.fallarAlAbrir) return cb(PuertoFalso.fallarAlAbrir);
    this.isOpen = true;
    cb(null);
  }
  close(cb: Cb) {
    this.isOpen = false;
    this.emitir('close');
    cb(null);
  }
  write(b: Buffer, cb: Cb) {
    this.escritos.push(b);
    cb(null);
  }
  drain(cb: Cb) {
    cb(null);
  }
  on(evento: string, fn: (...a: unknown[]) => void) {
    (this.oyentes[evento] ??= []).push(fn);
    return this;
  }
  emitir(evento: string, ...args: unknown[]) {
    for (const fn of this.oyentes[evento] ?? []) fn(...args);
  }
}

let cargaOk = true;
jest.mock('../../../electron/src/main/scale/serialLoader', () => ({
  cargarSerialPort: () => (cargaOk ? { ok: true, mod: { SerialPort: PuertoFalso } } : { ok: false, error: 'sin binario' }),
}));

import {
  MAX_WRITE_BYTES,
  ScaleManager,
  clasificarError,
  parseOpenConfig,
  parseWriteBytes,
} from '../../../electron/src/main/scale/scaleManager';

function webContentsFalso() {
  const enviados: [string, unknown][] = [];
  const oyentes: Record<string, () => void> = {};
  return {
    enviados,
    id: 1,
    isDestroyed: () => false,
    send: (canal: string, dato: unknown) => enviados.push([canal, dato]),
    once: (evento: string, fn: () => void) => {
      oyentes[evento] = fn;
    },
    removeListener: jest.fn(),
    disparar: (evento: string) => oyentes[evento]?.(),
  };
}

const CFG = { scaleId: 'b1', path: 'COM3', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 };

describe('validación de lo que manda el renderer', () => {
  it('parseOpenConfig acepta la forma del contrato y rechaza lo demás', () => {
    expect(parseOpenConfig(CFG)).toEqual(CFG);
    expect(() => parseOpenConfig({ ...CFG, baudRate: 1234 })).toThrow();
    expect(() => parseOpenConfig({ ...CFG, path: 'COM3\r\nX' })).toThrow();
    expect(() => parseOpenConfig({ ...CFG, parity: 'mark' })).toThrow();
    expect(() => parseOpenConfig({ ...CFG, dataBits: 6 })).toThrow();
    expect(() => parseOpenConfig(null)).toThrow();
  });

  it('parseWriteBytes: 1 a 64 bytes enteros 0–255', () => {
    expect(parseWriteBytes(Uint8Array.of(0x57))).toEqual(Buffer.from([0x57]));
    expect(() => parseWriteBytes(new Uint8Array(MAX_WRITE_BYTES + 1))).toThrow(RangeError);
    expect(() => parseWriteBytes(new Uint8Array(0))).toThrow(RangeError);
    expect(() => parseWriteBytes([300])).toThrow();
    expect(() => parseWriteBytes('W')).toThrow();
  });

  it('clasifica los mensajes de serialport de Windows y Linux', () => {
    expect(clasificarError(new Error('Opening COM9: File not found'))).toBe('port_not_found');
    expect(clasificarError(new Error('Opening COM3: Access denied'))).toBe('port_busy');
    expect(clasificarError(new Error('Error: Resource temporarily unavailable Cannot lock port'))).toBe('port_busy');
    expect(clasificarError(new Error('Error: Permission denied, cannot open /dev/ttyUSB0'))).toBe('permission');
    expect(clasificarError(new Error('otra cosa'))).toBe('io');
  });
});

describe('ScaleManager', () => {
  beforeEach(() => {
    cargaOk = true;
    PuertoFalso.fallarAlAbrir = null;
    PuertoFalso.creados = [];
  });

  it('abre un puerto, entrega bytes solo al dueño y no reabre la misma báscula', async () => {
    const m = new ScaleManager();
    const dueno = webContentsFalso();
    const estado = await m.open(parseOpenConfig(CFG), dueno as never);
    expect(estado).toMatchObject({ scaleId: 'b1', status: 'open', path: 'COM3' });
    const puerto = PuertoFalso.creados[0];
    expect(puerto.opciones).toMatchObject({ path: 'COM3', baudRate: 9600, autoOpen: false });
    puerto.emitir('data', Buffer.from('ST,GS,+00.735kg\r\n'));
    const datos = dueno.enviados.filter(([c]) => c === 'scale:data');
    expect(datos).toHaveLength(1);
    expect(datos[0][1]).toBeInstanceOf(Uint8Array);
    await m.open(parseOpenConfig(CFG), dueno as never);
    expect(PuertoFalso.creados).toHaveLength(1);
    expect(await m.listPorts()).toEqual([{ path: 'COM3', manufacturer: 'Prolific', vendorId: '067b', productId: '2303', serialNumber: undefined }]);
    await m.close();
  });

  it('solo el dueño escribe; al destruirse la ventana se cierra el puerto', async () => {
    const m = new ScaleManager();
    const dueno = webContentsFalso();
    await m.open(parseOpenConfig(CFG), dueno as never);
    await m.write(Buffer.from('W'), dueno as never);
    expect(PuertoFalso.creados[0].escritos[0].toString()).toBe('W');
    await expect(m.write(Buffer.from('W'), webContentsFalso() as never)).rejects.toThrow();
    dueno.disparar('destroyed');
    await new Promise((r) => setTimeout(r, 0));
    expect(m.status().status).toBe('closed');
  });

  it('errores al abrir y sin binario: estado de error con código estable', async () => {
    const m = new ScaleManager();
    PuertoFalso.fallarAlAbrir = new Error('Opening COM9: File not found');
    expect(await m.open(parseOpenConfig({ ...CFG, path: 'COM9' }), webContentsFalso() as never)).toMatchObject({ status: 'error', error: 'port_not_found' });
    cargaOk = false;
    expect(await m.open(parseOpenConfig(CFG), webContentsFalso() as never)).toMatchObject({ status: 'error', error: 'unavailable' });
    await expect(m.listPorts()).rejects.toThrow('sin binario');
  });

  it('cable desconectado (cierre no pedido) → error io', async () => {
    const m = new ScaleManager();
    const dueno = webContentsFalso();
    await m.open(parseOpenConfig(CFG), dueno as never);
    const puerto = PuertoFalso.creados[0];
    puerto.isOpen = false;
    puerto.emitir('close');
    expect(m.status()).toMatchObject({ status: 'error', error: 'io' });
  });
});

describe('IPC scale:* (verificación de origen)', () => {
  it('rechaza una página que no es la web interna', async () => {
    const { ipcMain } = jest.requireMock('electron') as { ipcMain: { handle: jest.Mock } };
    const { registerScaleIpc } = jest.requireActual('../../../electron/src/main/scale/scaleIpc') as typeof import('../../../electron/src/main/scale/scaleIpc');
    registerScaleIpc();
    const handlers = Object.fromEntries(ipcMain.handle.mock.calls.map(([canal, fn]) => [canal, fn]));
    expect(Object.keys(handlers).sort()).toEqual(['scale:close', 'scale:list-ports', 'scale:open', 'scale:status', 'scale:write']);
    const externo = { sender: { id: 9, getURL: () => 'https://malo.example' } };
    await expect(handlers['scale:list-ports'](externo)).rejects.toThrow('origen no permitido');
    const interno = { sender: { id: 1, getURL: () => 'http://localhost:3999/app/pos' } };
    await expect(handlers['scale:list-ports'](interno)).resolves.toHaveLength(1);
  });
});
