/**
 * Venta por peso en un paso (§11 de PRODUCTOS-POR-PESO-BASCULA.md): la
 * decisión al escanear, el auto-agregar, el escaneo con «Pesar» abierto, la
 * lectura nueva tras agregar y la tara recordada en la sesión.
 */
import {
  armadoInicial,
  armadoTrasAgregar,
  debeAutoAgregar,
  decidirEscaneoConPesarAbierto,
  decidirPesada,
  entradaParaProducto,
  observarLectura,
  recordarTara,
  taraInicial,
  taraRecordada,
  vistaLectura,
} from '@/lib/pos/bascula';

const QUESO = { id: 31, sale_mode: 'weight', unit_code: 'KG  ', qty_decimals: 3, min_sale_qty: 0.05, default_tare_qty: 0.015, tare_required: false };
const lecturaEstable = (peso: number) => ({
  fase: 'leyendo' as const,
  error: null,
  lectura: { neto: peso, bruto: peso, tara: null, unidad: 'KG', estable: true, estado: 'ok' as const, netoDeBascula: false },
  peso,
  unidad: 'KG',
  estable: true,
});
const CONFIG = { capacidad: 15, unidad: 'KG' };

describe('decidirPesada', () => {
  const base = { porPeso: true, hayBascula: true, agregarAlEstabilizar: true, armada: true };

  it('lectura estable, válida y nueva → directo al carrito', () => {
    const vista = vistaLectura(entradaParaProducto({ lector: lecturaEstable(0.75), producto: QUESO, config: CONFIG, tara: 0.015 }));
    expect(vista).toMatchObject({ neto: 0.735, puedeAgregar: true });
    expect(decidirPesada({ ...base, vista })).toEqual({ tipo: 'agregar_directo' });
  });

  it('inestable, bajo el mínimo, sin lector o con el peso anterior → abrir «Pesar» esperando', () => {
    const inestable = vistaLectura(entradaParaProducto({ lector: { ...lecturaEstable(0.75), estable: false }, producto: QUESO, config: CONFIG, tara: 0 }));
    expect(decidirPesada({ ...base, vista: inestable }).tipo).toBe('abrir_esperando');
    const bajo = vistaLectura(entradaParaProducto({ lector: lecturaEstable(0.02), producto: QUESO, config: CONFIG, tara: 0 }));
    expect(decidirPesada({ ...base, vista: bajo }).tipo).toBe('abrir_esperando');
    expect(decidirPesada({ ...base, vista: null }).tipo).toBe('abrir_esperando');
    const valida = vistaLectura(entradaParaProducto({ lector: lecturaEstable(0.75), producto: QUESO, config: CONFIG, tara: 0 }));
    expect(decidirPesada({ ...base, vista: valida, armada: false }).tipo).toBe('abrir_esperando');
  });

  it('regla apagada → «Pesar» con Enter; sin báscula o por medida → el flujo de siempre', () => {
    const vista = { puedeAgregar: true };
    expect(decidirPesada({ ...base, agregarAlEstabilizar: false, vista }).tipo).toBe('abrir_confirmar');
    expect(decidirPesada({ ...base, hayBascula: false, vista }).tipo).toBe('abrir_manual');
    expect(decidirPesada({ ...base, porPeso: false, vista }).tipo).toBe('abrir_manual');
  });
});

describe('auto-agregar', () => {
  it('solo esperando, con lectura válida y nueva, una vez', () => {
    const ok = { puedeAgregar: true };
    expect(debeAutoAgregar({ esperando: true, vista: ok, armada: true, yaEnviado: false })).toBe(true);
    expect(debeAutoAgregar({ esperando: true, vista: ok, armada: true, yaEnviado: true })).toBe(false);
    expect(debeAutoAgregar({ esperando: true, vista: ok, armada: false, yaEnviado: false })).toBe(false);
    expect(debeAutoAgregar({ esperando: false, vista: ok, armada: true, yaEnviado: false })).toBe(false);
    expect(debeAutoAgregar({ esperando: true, vista: { puedeAgregar: false }, armada: true, yaEnviado: false })).toBe(false);
  });

  it('secuencia: inestable → estable agrega; el mismo peso no se repite hasta que la báscula cambie', () => {
    const division = 0.005;
    let armado = armadoInicial();
    const pasos: string[] = [];
    const lecturas: [number, boolean][] = [
      [0.4, false],
      [0.75, false],
      [0.75, true], // estable: se agrega
      [0.75, true], // sigue encima: no se repite
      [0.752, true], // dentro de una división: tampoco
      [0, true], // se retiró: se rearma
      [1.2, true], // el siguiente producto
    ];
    for (const [peso, estable] of lecturas) {
      armado = observarLectura(armado, peso, division);
      const vista = vistaLectura(entradaParaProducto({ lector: { ...lecturaEstable(peso), estable }, producto: QUESO, config: CONFIG, tara: 0 }));
      if (debeAutoAgregar({ esperando: true, vista, armada: armado.armada, yaEnviado: false })) {
        pasos.push(`agrega ${vista.neto}`);
        armado = armadoTrasAgregar(peso);
      }
    }
    expect(pasos).toEqual(['agrega 0.75', 'agrega 1.2']);
  });

  it('observarLectura devuelve el mismo objeto si no cambia (no re-renderiza)', () => {
    const a = armadoTrasAgregar(0.75);
    expect(observarLectura(a, 0.751, 0.005)).toBe(a);
    expect(observarLectura(a, null, 0.005)).toBe(a);
    expect(observarLectura(a, 0.8, 0.005)).toEqual({ armada: true, pesoAgregado: 0.75 });
    expect(armadoTrasAgregar(null)).toEqual(armadoInicial());
  });
});

describe('escaneo con «Pesar» abierto', () => {
  it('otro producto cancela la pesada pendiente y sigue; el mismo producto se ignora', () => {
    expect(decidirEscaneoConPesarAbierto({ productoAbiertoId: 31, productoNuevoId: 32, modo: 'agregar' })).toBe('cancelar_y_seguir');
    expect(decidirEscaneoConPesarAbierto({ productoAbiertoId: 31, productoNuevoId: 31, modo: 'agregar' })).toBe('ignorar');
    expect(decidirEscaneoConPesarAbierto({ productoAbiertoId: 31, productoNuevoId: 31, modo: 'cambiar' })).toBe('cancelar_y_seguir');
  });
});

describe('tara recordada en la sesión', () => {
  beforeEach(() => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  });

  it('abre con la recordada; si no hay, con la predefinida del producto', () => {
    expect(taraInicial(QUESO)).toBe(0.015);
    recordarTara(31, 0.02);
    expect(taraRecordada(31)).toBe(0.02);
    expect(taraInicial(QUESO)).toBe(0.02);
    recordarTara(31, 0);
    expect(taraInicial(QUESO)).toBe(0);
    expect(taraInicial({ id: 99 })).toBe(0);
    recordarTara(31, -1);
    expect(taraRecordada(31)).toBe(0);
  });
});
