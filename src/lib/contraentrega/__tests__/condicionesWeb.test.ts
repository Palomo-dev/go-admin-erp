import {
  condicionesIniciales,
  erroresCondiciones,
  leerCuerpoCondiciones,
  resumenReglas,
  resumenUnaLinea,
  sinRestricciones,
  soloDeLaOrganizacion,
  soloDevolverAnticipo,
  vistaPrevia,
  type NombresCatalogo,
} from '../condicionesWeb';
import { CONDICIONES_POR_DEFECTO, normalizarCondiciones, type CondicionesContraentrega } from '../reglaContraentrega';
import { textoPieza, traductorCanonico } from '@/components/sitio-web/ventas/contraentrega/textosContraentrega';

const fmt = (n: number) => `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n)}`;
const texto = (piezas: { clave: string; valores?: Record<string, string | number> }[]) => piezas.map((p) => textoPieza(traductorCanonico, p));

const nombres: NombresCatalogo = {
  zonas: { z1: 'Chapinero', z2: 'Zona Norte', z3: 'Zona Centro' },
  categorias: { 7: 'Licores' },
  productos: { 101: 'Canasta de regalo premium', 102: 'Queso parmesano 1 kg' },
  pasarelas: { wompi_co: 'Wompi' },
};

/** El ejemplo del Figma (pantallas 01–03). */
const figma: CondicionesContraentrega = normalizarCondiciones({
  montoMinimo: 80000,
  montoMaximo: 600000,
  zonas: { modo: 'algunas', ids: ['z1', 'z2', 'z3'] },
  productos: { modo: 'excepto', categorias: [7], productos: [101, 102] },
  anticipo: { tipo: 'envio', pasarela: 'wompi_co', siEnvioGratis: 'valor_fijo', valorEnvioGratis: 9000 },
});

describe('resumen en una línea (fila de la tarjeta, Figma 01)', () => {
  it('el ejemplo del Figma', () => {
    expect(texto(resumenUnaLinea(figma, nombres, fmt)).join(' · ')).toBe(
      'Desde $ 80.000 hasta $ 600.000 · 3 zonas · todo menos Licores y 2 más · anticipo: el envío',
    );
  });

  it('sin condiciones y apagada', () => {
    expect(texto(resumenUnaLinea(CONDICIONES_POR_DEFECTO, nombres, fmt))).toEqual(['Sin condiciones: se cobra todo al recibir']);
    expect(texto(resumenUnaLinea({ ...CONDICIONES_POR_DEFECTO, ofrecer: false }, nombres, fmt))).toEqual(['Apagada a domicilio']);
  });

  it('solo mínimo, porcentaje, solo algunos y sin transportadora', () => {
    const c = normalizarCondiciones({
      montoMinimo: 50000,
      transportadora: false,
      productos: { modo: 'solo', categorias: [7] },
      anticipo: { tipo: 'porcentaje', porcentaje: 20 },
    });
    expect(texto(resumenUnaLinea(c, nombres, fmt)).join(' · ')).toBe('Desde $ 50.000 · sin transportadora · solo Licores · anticipo: 20 %');
  });
});

describe('resumen de las reglas (columna derecha, Figma 02/03)', () => {
  it('el ejemplo del Figma', () => {
    expect(texto(resumenReglas(figma, nombres, fmt))).toEqual([
      'Pedidos de $ 80.000 a $ 600.000',
      'Chapinero, Zona Norte, Zona Centro',
      'También con transportadora',
      'todo menos Licores y 2 más',
      'Anticipo: el envío, con Wompi, 30 min',
    ]);
  });

  it('sin anticipo ni límites', () => {
    expect(texto(resumenReglas(CONDICIONES_POR_DEFECTO, nombres, fmt))).toEqual([
      'Cualquier monto',
      'Todas las zonas de domicilio',
      'También con transportadora',
      'Todos los productos',
      'Sin anticipo: todo se cobra al recibir',
    ]);
  });
});

describe('validación del formulario', () => {
  it('el defecto y el Figma son válidos; el defecto no restringe nada', () => {
    expect(erroresCondiciones(CONDICIONES_POR_DEFECTO)).toEqual([]);
    expect(erroresCondiciones(figma)).toEqual([]);
    expect(sinRestricciones(CONDICIONES_POR_DEFECTO)).toBe(true);
    expect(sinRestricciones(figma)).toBe(false);
  });

  it('detecta cada error', () => {
    const malo: CondicionesContraentrega = {
      ...CONDICIONES_POR_DEFECTO,
      montoMinimo: 10,
      montoMaximo: 5,
      zonas: { modo: 'algunas', ids: [] },
      productos: { modo: 'solo', categorias: [], productos: [] },
      medios: [],
      anticipo: { ...CONDICIONES_POR_DEFECTO.anticipo, tipo: 'porcentaje', porcentaje: null },
      texto: 'x'.repeat(161),
    };
    expect(erroresCondiciones(malo)).toEqual(['monto_rango', 'zonas_vacias', 'productos_vacios', 'medios_vacios', 'porcentaje_invalido', 'texto_largo']);
    expect(erroresCondiciones({ ...CONDICIONES_POR_DEFECTO, anticipo: { ...CONDICIONES_POR_DEFECTO.anticipo, tipo: 'fijo' } })).toEqual(['valor_fijo_invalido']);
    // Porcentaje: 1–100 (0,5 % no vale; 1 y 100 sí).
    const conPorcentaje = (porcentaje: number) => ({ ...CONDICIONES_POR_DEFECTO, anticipo: { ...CONDICIONES_POR_DEFECTO.anticipo, tipo: 'porcentaje' as const, porcentaje } });
    expect(erroresCondiciones(conPorcentaje(0.5))).toEqual(['porcentaje_invalido']);
    expect(erroresCondiciones(conPorcentaje(1))).toEqual([]);
    expect(erroresCondiciones(conPorcentaje(100))).toEqual([]);
    expect(
      erroresCondiciones({ ...CONDICIONES_POR_DEFECTO, anticipo: { ...CONDICIONES_POR_DEFECTO.anticipo, tipo: 'envio', siEnvioGratis: 'valor_fijo' } }),
    ).toEqual(['valor_envio_gratis_invalido']);
  });
});

describe('cuerpo del PUT (lista blanca)', () => {
  it('acepta sede + condiciones y sede + null', () => {
    const r = leerCuerpoCondiciones({ branchId: 3, condiciones: { montoMinimo: 80000 } });
    expect(r.ok && r.branchId === 3 && r.condiciones?.montoMinimo === 80000).toBe(true);
    expect(leerCuerpoCondiciones({ branchId: 3, condiciones: null })).toEqual({ ok: true, branchId: 3, condiciones: null });
  });

  it('rechaza claves ajenas, sede inválida y condiciones con errores', () => {
    expect(leerCuerpoCondiciones({ branchId: 3, condiciones: null, organizationId: 9 })).toEqual({ ok: false, campos: ['organizationId'] });
    expect(leerCuerpoCondiciones({ branchId: 'x', condiciones: null })).toEqual({ ok: false, campos: ['branchId'] });
    expect(leerCuerpoCondiciones({ branchId: 3, condiciones: { montoMinimo: 10, montoMaximo: 1 } })).toEqual({ ok: false, campos: ['monto_rango'] });
    expect(leerCuerpoCondiciones([])).toEqual({ ok: false, campos: ['cuerpo'] });
  });
});

describe('solo de la organización', () => {
  it('descarta zonas, categorías y productos ajenos', () => {
    const r = soloDeLaOrganizacion(figma, { zonas: new Set(['z1']), categorias: new Set(), productos: new Set([101]) });
    expect(r.zonas).toEqual({ modo: 'algunas', ids: ['z1'] });
    expect(r.productos).toEqual({ modo: 'excepto', categorias: [], productos: [101] });
  });
});

describe('«Así lo ve tu cliente»', () => {
  it('Figma: hoy $ 9.000 (el envío) y $ 142.000 al recibir, con los motivos', () => {
    const v = vistaPrevia(figma, ['wompi_co'], nombres, fmt);
    expect(v.ejemplo.disponible).toBe(true);
    expect(v.ejemplo.anticipo?.monto).toBe(9000);
    expect(v.ejemplo.alRecibir).toBe(142000);
    expect(texto(v.motivos)).toEqual([
      'Disponible desde $ 80.000 — te faltan $ 12.000',
      'Solo para pedidos hasta $ 600.000',
      'No disponible para 2 productos de tu carrito · Ver cuáles',
      'No llega a tu dirección: solo Chapinero, Zona Norte, Zona Centro',
    ]);
    // Envío gratis con «pedir un valor fijo de $ 9.000».
    expect(v.anticipoEnvioGratis).toBe(9000);
  });

  it('sin pasarela conectada el anticipo no se puede cobrar: no se ofrece', () => {
    expect(vistaPrevia(figma, [], nombres, fmt).ejemplo.disponible).toBe(false);
  });

  it('sin condiciones: todo al recibir', () => {
    const v = vistaPrevia(CONDICIONES_POR_DEFECTO, [], nombres, fmt);
    expect(v.ejemplo.disponible).toBe(true);
    expect(v.ejemplo.anticipo).toBeNull();
    expect(v.ejemplo.alRecibir).toBe(151000);
    expect(v.motivos).toEqual([]);
  });
});

describe('anticipo: solo devolución (criterio del Contador 2026-11-25)', () => {
  test('«la tienda se lo queda» nunca se ofrece ni se guarda: lo guardado como retener se lee como devolver', () => {
    const viejo = normalizarCondiciones({ anticipo: { tipo: 'envio' }, siNoRecibe: 'retener' });
    expect(viejo.siNoRecibe).toBe('retener'); // la regla compartida con la tienda lo sigue leyendo
    expect(condicionesIniciales(viejo).siNoRecibe).toBe('devolver');
    expect(soloDevolverAnticipo(viejo).siNoRecibe).toBe('devolver');
    expect(soloDevolverAnticipo(viejo).anticipo).toEqual(viejo.anticipo);
    expect(condicionesIniciales(null).siNoRecibe).toBe('devolver');
  });
});
