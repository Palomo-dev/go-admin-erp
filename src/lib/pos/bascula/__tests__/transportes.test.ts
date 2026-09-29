import {
  buscarPuertoAutorizado,
  configDesdeFila,
  convertirPeso,
  crearTransporte,
  elegirBasculaDelEquipo,
  elegirPuertoWebSerial,
  pesajeBascula,
  pistaPuerto,
  transporteDesktop,
  transporteDisponible,
  transporteManual,
  transporteWebSerial,
  vistaLectura,
  ErrorTransporte,
  type ConfigBascula,
  type EntradaVista,
  type EntornoBascula,
  type FilaBascula,
  type PuertoSerieWeb,
  type SerieWeb,
} from '@/lib/pos/bascula';
import type { DesktopScaleBridge, DesktopScaleState } from '@/lib/utils/desktop';
import { TRAMAS } from './fixtures/tramas';

const CFG: ConfigBascula = {
  id: 'b1',
  nombre: 'Mostrador',
  transporte: 'web_serial',
  protocolo: 'continuous_st_gs',
  dispositivo: 'usb:067b:2303',
  baudios: 9600,
  bitsDatos: 8,
  paridad: 'none',
  bitsParada: 1,
  unidad: 'KG',
  decimales: 3,
  capacidad: 15,
  division: 0.005,
  estableMs: 500,
};

/** Puerto Web Serial doble: `readable` entrega los pedazos que se le pongan. */
function puertoDoble(info: { usbVendorId?: number; usbProductId?: number } = { usbVendorId: 0x067b, usbProductId: 0x2303 }) {
  let control: ReadableStreamDefaultController<Uint8Array> | null = null;
  const escritos: Uint8Array[] = [];
  const puerto = {
    abierto: null as null | Record<string, unknown>,
    cerrado: false,
    readable: null as ReadableStream<Uint8Array> | null,
    writable: null as WritableStream<Uint8Array> | null,
    escritos,
    async open(op: Record<string, unknown>) {
      if (puerto.abierto) throw Object.assign(new Error('ya abierto'), { name: 'InvalidStateError' });
      puerto.abierto = op;
      puerto.readable = new ReadableStream<Uint8Array>({ start: (c) => void (control = c) });
      puerto.writable = new WritableStream<Uint8Array>({ write: (b) => void escritos.push(b) });
    },
    async close() {
      puerto.cerrado = true;
    },
    getInfo: () => info,
    empujar: (b: Uint8Array) => control?.enqueue(b),
  };
  return puerto;
}

function serieDoble(puertos: PuertoSerieWeb[], elegido?: PuertoSerieWeb | Error): SerieWeb {
  return {
    getPorts: async () => puertos,
    requestPort: async () => {
      if (elegido instanceof Error) throw elegido;
      if (!elegido) throw Object.assign(new Error('nada'), { name: 'NotFoundError' });
      return elegido;
    },
  };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('Web Serial', () => {
  it('pista del puerto y búsqueda entre los autorizados', async () => {
    const a = puertoDoble();
    const b = puertoDoble({ usbVendorId: 0x1a86, usbProductId: 0x7523 });
    expect(pistaPuerto(a)).toBe('usb:067b:2303');
    expect(pistaPuerto(puertoDoble({}))).toBe('serial');
    expect(await buscarPuertoAutorizado(serieDoble([a, b]), 'usb:1a86:7523')).toBe(b);
    expect(await buscarPuertoAutorizado(serieDoble([a, b]), 'usb:ffff:0000')).toBeNull();
    expect(await buscarPuertoAutorizado(serieDoble([a]), 'usb:ffff:0000')).toBe(a);
  });

  it('elegir puerto: cancelar el selector no es un error', async () => {
    const a = puertoDoble();
    expect(await elegirPuertoWebSerial(serieDoble([], a))).toEqual({ puerto: a, pista: 'usb:067b:2303' });
    expect(await elegirPuertoWebSerial(serieDoble([]))).toBeNull();
    await expect(elegirPuertoWebSerial(serieDoble([], Object.assign(new Error('x'), { name: 'SecurityError' })))).rejects.toMatchObject({ codigo: 'permiso' });
  });

  it('abre con los parámetros, entrega bytes, escribe y cierra', async () => {
    const p = puertoDoble();
    const t = transporteWebSerial(serieDoble([p]));
    const recibidos: number[] = [];
    t.alRecibir((c) => recibidos.push(...c));
    await t.abrir(CFG);
    expect(p.abierto).toMatchObject({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
    p.empujar(TRAMAS.stGs.estable);
    await esperar();
    expect(recibidos).toHaveLength(TRAMAS.stGs.estable.length);
    await t.escribir(Uint8Array.of(0x57));
    expect(p.escritos[0]).toEqual(Uint8Array.of(0x57));
    await t.cerrar();
    expect(p.cerrado).toBe(true);
  });

  it('sin puerto autorizado → sin_puerto; puerto ocupado → puerto_ocupado', async () => {
    await expect(transporteWebSerial(serieDoble([])).abrir(CFG)).rejects.toMatchObject({ codigo: 'sin_puerto' });
    const p = puertoDoble();
    await p.open({});
    await expect(transporteWebSerial(serieDoble([p])).abrir(CFG)).rejects.toMatchObject({ codigo: 'puerto_ocupado' });
  });
});

describe('Go Admin Desktop', () => {
  function puenteDoble(estadoAbrir: DesktopScaleState) {
    let datos: ((c: Uint8Array) => void) | null = null;
    let estado: ((s: DesktopScaleState) => void) | null = null;
    const llamadas: unknown[] = [];
    const puente: DesktopScaleBridge = {
      listPorts: async () => [{ path: 'COM3' }],
      open: async (c) => {
        llamadas.push(['open', c]);
        return estadoAbrir;
      },
      close: async () => ({ scaleId: null, status: 'closed' }),
      status: async () => estadoAbrir,
      write: async (b) => void llamadas.push(['write', Array.from(b)]),
      onData: (h) => {
        datos = h;
        return () => (datos = null);
      },
      onState: (h) => {
        estado = h;
        return () => (estado = null);
      },
    };
    return { puente, llamadas, emitir: (c: Uint8Array) => datos?.(c), cambiar: (s: DesktopScaleState) => estado?.(s) };
  }

  it('abre por el puente con la ruta del puerto y reenvía bytes y fallos', async () => {
    const d = puenteDoble({ scaleId: 'b1', status: 'open' });
    const t = transporteDesktop(d.puente);
    const cfg = { ...CFG, transporte: 'desktop_serial' as const, dispositivo: 'COM3' };
    await t.abrir(cfg);
    expect(d.llamadas[0]).toEqual(['open', { scaleId: 'b1', path: 'COM3', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 }]);
    const recibidos: Uint8Array[] = [];
    t.alRecibir((c) => recibidos.push(c));
    d.emitir(TRAMAS.stGs.estable);
    expect(recibidos[0]).toEqual(TRAMAS.stGs.estable);
    const fallos: string[] = [];
    t.alFallar?.((c) => fallos.push(c));
    d.cambiar({ scaleId: 'b1', status: 'error', error: 'io' });
    expect(fallos).toEqual(['io']);
  });

  it('errores del puerto con código estable; sin ruta no intenta abrir', async () => {
    const casos: [DesktopScaleState['error'], string][] = [
      ['port_not_found', 'sin_puerto'],
      ['port_busy', 'puerto_ocupado'],
      ['permission', 'permiso'],
      ['unavailable', 'no_disponible'],
      ['io', 'io'],
    ];
    for (const [error, codigo] of casos) {
      const t = transporteDesktop(puenteDoble({ scaleId: 'b1', status: 'error', error }).puente);
      await expect(t.abrir({ ...CFG, dispositivo: 'COM9' })).rejects.toMatchObject({ codigo });
    }
    const d = puenteDoble({ scaleId: 'b1', status: 'open' });
    await expect(transporteDesktop(d.puente).abrir({ ...CFG, dispositivo: '' })).rejects.toBeInstanceOf(ErrorTransporte);
    expect(d.llamadas).toHaveLength(0);
  });
});

describe('elección del transporte y de la báscula del equipo', () => {
  const desktop = {} as DesktopScaleBridge;
  const serial = serieDoble([]);
  const enNavegador: EntornoBascula = { desktop: null, serial, enDesktop: false };
  const enDesktop: EntornoBascula = { desktop, serial: null, enDesktop: true };
  const sinNada: EntornoBascula = { desktop: null, serial: null, enDesktop: false };

  it('Web Serial solo fuera del Desktop; Desktop solo con el puente', () => {
    expect(transporteDisponible('web_serial', enNavegador)).toBe(true);
    expect(transporteDisponible('web_serial', { ...enDesktop, serial })).toBe(false);
    expect(transporteDisponible('desktop_serial', enDesktop)).toBe(true);
    expect(transporteDisponible('desktop_serial', enNavegador)).toBe(false);
    expect(() => crearTransporte(CFG, sinNada)).toThrow(ErrorTransporte);
  });

  const fila = (id: string, extra: Partial<FilaBascula> = {}): FilaBascula => ({
    id,
    name: id,
    transport: 'web_serial',
    protocol: 'continuous_st_gs',
    baud_rate: 9600,
    unit_code: 'KG',
    decimals: 3,
    capacity_max: '15.000',
    min_division: '0.0050',
    stable_ms: 500,
    ...extra,
  });

  it('configDesdeFila normaliza números en texto y descarta transportes o protocolos desconocidos', () => {
    expect(configDesdeFila(fila('a'))).toMatchObject({ capacidad: 15, division: 0.005, bitsDatos: 8, paridad: 'none' });
    expect(configDesdeFila(fila('a', { transport: 'bluetooth_le' }))).toBeNull();
    expect(configDesdeFila(fila('a', { protocol: 'xyz' }))).toBeNull();
  });

  it('prefiere la elegida en este navegador; si no, la primera no asignada a otro equipo', () => {
    const filas = [fila('otra-caja', { asignada_a_otro_equipo: true }), fila('libre'), fila('desktop', { transport: 'desktop_serial' })];
    expect(elegirBasculaDelEquipo(filas, enNavegador, null)?.id).toBe('libre');
    expect(elegirBasculaDelEquipo(filas, enNavegador, 'otra-caja')?.id).toBe('otra-caja');
    expect(elegirBasculaDelEquipo(filas, enDesktop, null)?.id).toBe('desktop');
    expect(elegirBasculaDelEquipo(filas, sinNada, null)).toBeNull();
  });

  it('transporte manual no entrega bytes', async () => {
    const t = transporteManual();
    await t.abrir(CFG);
    expect(typeof t.alRecibir(() => undefined)).toBe('function');
  });
});

describe('vista de la lectura y pesada de báscula', () => {
  const lectura = (neto: number | null, extra = {}) => ({ neto, bruto: neto, tara: null, unidad: 'KG', estable: true, estado: 'ok' as const, netoDeBascula: false, ...extra });
  const base = (lector: Partial<EntradaVista['lector']>, extra: Partial<EntradaVista> = {}): EntradaVista => ({
    lector: { fase: 'leyendo', error: null, lectura: lectura(0.75), peso: 0.75, unidad: 'KG', estable: true, ...lector },
    unidadProducto: 'KG',
    decimales: 3,
    tara: 0,
    capacidad: 15,
    unidadBascula: 'KG',
    minimo: null,
    exigeTara: false,
    ...extra,
  });

  it('estable con tara: neto = bruto − tara y se puede agregar', () => {
    expect(vistaLectura(base({}, { tara: 0.015 }))).toMatchObject({ estado: 'estable', bruto: 0.75, tara: 0.015, neto: 0.735, puedeAgregar: true });
  });

  it('inestable, bajo cero, sobrecarga por bandera o por capacidad, conectando y error', () => {
    expect(vistaLectura(base({ estable: false }))).toMatchObject({ estado: 'inestable', puedeAgregar: false, motivo: 'inestable' });
    expect(vistaLectura(base({ peso: -0.015, lectura: lectura(-0.015, { estado: 'bajo_cero' }) }))).toMatchObject({ estado: 'fuera_de_rango', fueraDeRango: 'bajo_cero' });
    expect(vistaLectura(base({ peso: null, lectura: lectura(null, { estado: 'sobrecarga' }) }))).toMatchObject({ fueraDeRango: 'sobrecarga' });
    expect(vistaLectura(base({ peso: 15.2, lectura: lectura(15.2) }))).toMatchObject({ fueraDeRango: 'sobrecarga', puedeAgregar: false });
    expect(vistaLectura(base({ fase: 'conectando', lectura: null, peso: null }))).toMatchObject({ estado: 'conectando' });
    expect(vistaLectura(base({ fase: 'error', error: 'sin_lectura' }))).toMatchObject({ estado: 'error', error: 'sin_lectura' });
  });

  it('bajo el mínimo, peso cero y tara obligatoria no dejan agregar', () => {
    expect(vistaLectura(base({}, { minimo: 1 }))).toMatchObject({ estado: 'estable', puedeAgregar: false, motivo: 'bajo_minimo' });
    expect(vistaLectura(base({ peso: 0, lectura: lectura(0) }))).toMatchObject({ puedeAgregar: false, motivo: 'sin_peso' });
    expect(vistaLectura(base({}, { exigeTara: true }))).toMatchObject({ puedeAgregar: false, motivo: 'sin_tara' });
  });

  it('neto de la báscula (NT): no resta la tara del POS otra vez', () => {
    const v = vistaLectura(base({ lectura: lectura(0.72, { netoDeBascula: true, bruto: null }), peso: 0.72 }, { tara: 0.015 }));
    expect(v).toMatchObject({ neto: 0.72, tara: null, bruto: null, puedeAgregar: true });
  });

  it('báscula en libras vendiendo un producto en kg: convierte', () => {
    expect(convertirPeso(1, 'LB', 'KG')).toBeCloseTo(0.45359237, 9);
    expect(convertirPeso(735, 'G', 'KG')).toBeCloseTo(0.735, 9);
    expect(convertirPeso(1, 'KG', 'UN')).toBeNull();
    const v = vistaLectura(base({ peso: 1.62, unidad: 'LB', lectura: lectura(1.62, { unidad: 'LB' }) }, { unidadBascula: 'LB' }));
    expect(v.neto).toBe(0.735);
  });

  it('notes.pesaje de báscula: origen, bruto, tara, neto, estable y bascula_id', () => {
    const p = pesajeBascula({ basculaId: 'b1', vista: { bruto: 0.75, tara: 0.015, neto: 0.735 }, unidadProducto: 'KG', ahora: new Date('2026-09-29T15:00:00Z') });
    expect(p).toEqual({ origen: 'bascula', neto: 0.735, bruto: 0.75, tara: 0.015, unidad: 'KG', estable: true, bascula_id: 'b1', leido_en: '2026-09-29T15:00:00.000Z' });
  });
});
