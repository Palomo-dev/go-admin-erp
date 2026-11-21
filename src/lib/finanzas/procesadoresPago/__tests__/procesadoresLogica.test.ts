/**
 * Procesadores de pago: el cuadre del abono, cuándo la factura es obligatoria, los
 * errores de la base y las claves de texto en los 4 idiomas (Figma 2704:150133;
 * reglas del Contador del 2026-11-21).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  codigoDeError,
  cuadreAbono,
  erroresAbono,
  facturaObligatoria,
  moverMes,
  ordenarSaldos,
  totalesSaldos,
  tratamientoDelIva,
  type SaldoProcesador,
} from '../procesadoresLogica';
import { cambiosDeFila } from '@/components/finanzas/procesadores-pago/DatosProcesadoresDialog';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const valores = (v: Partial<Parameters<typeof cuadreAbono>[0]>) => ({
  bruto: null,
  neto: null,
  comision: null,
  ivaComision: null,
  retencionFuente: null,
  retencionIva: null,
  retencionIca: null,
  ...v,
});

describe('cuadre del abono: bruto = neto + comisión + IVA + retenciones', () => {
  it('cuadra con los valores del diseño (Wompi)', () => {
    const c = cuadreAbono(valores({ bruto: 1_000_000, neto: 945_279, comision: 29_900, ivaComision: 5_681, retencionFuente: 15_000, retencionIca: 4_140 }));
    expect(c).toMatchObject({ netoCalculado: 945_279, retenciones: 19_140, diferencia: 0, cuadra: true });
  });

  it('no cuadra y dice la diferencia (Bold)', () => {
    const c = cuadreAbono(valores({ bruto: 1_500_000, neto: 1_428_000, comision: 40_350, ivaComision: 7_667, retencionFuente: 22_500, retencionIca: 6_210 }));
    expect(c).toMatchObject({ netoCalculado: 1_423_273, diferencia: 4_727, cuadra: false });
  });

  it('redondea a pesos como la base', () => {
    // 100,4 → 100; 0,6 → 1; 99,4 → 99: 100 − 1 = 99.
    expect(cuadreAbono(valores({ bruto: 100.4, neto: 99.4, comision: 0.6 })).cuadra).toBe(true);
  });

  it('sin neto escrito todavía no hay diferencia, pero tampoco cuadra', () => {
    expect(cuadreAbono(valores({ bruto: 1000 }))).toMatchObject({ neto: null, diferencia: 0, cuadra: false });
  });
});

describe('IVA de la comisión y factura del procesador', () => {
  it('exterior manda sobre el perfil: pendiente, factura opcional', () => {
    expect(tratamientoDelIva('exterior', true, 5000)).toBe('exterior');
    expect(facturaObligatoria('exterior')).toBe(false);
  });

  it('responsable → descontable y factura obligatoria; no responsable → gasto y opcional', () => {
    expect(tratamientoDelIva('nacional', true, 5000)).toBe('descontable');
    expect(facturaObligatoria('descontable')).toBe(true);
    expect(tratamientoDelIva('nacional', false, 5000)).toBe('gasto');
    expect(facturaObligatoria('gasto')).toBe(false);
  });

  it('sin IVA no hay nada que descontar; sin perfil no se puede decidir', () => {
    expect(tratamientoDelIva('nacional', true, 0)).toBe('sin_iva');
    expect(tratamientoDelIva('nacional', null, 100)).toBe('sin_perfil');
  });

  it('errores: descuadre, factura y NIT bloquean el guardado', () => {
    const v = valores({ bruto: 1000, neto: 990, comision: 5, ivaComision: 1 });
    const ctx = { procesador: 'bold' as const, fecha: '2026-11-21', factura: '', nit: null, tratamiento: 'descontable' as const };
    expect(erroresAbono(v, ctx)).toEqual(expect.arrayContaining(['nit', 'descuadre', 'factura']));
    expect(erroresAbono(valores({ bruto: 1000, neto: 994, comision: 5, ivaComision: 1 }), { ...ctx, nit: '901281572-4', factura: 'FE 1' })).toEqual([]);
  });
});

describe('errores de la base', () => {
  it('lee el código al inicio del mensaje', () => {
    expect(codigoDeError('NETO_DESCUADRADO: bruto 1000 menos descuentos da 900')).toBe('NETO_DESCUADRADO');
    expect(codigoDeError('NIT_PROCESADOR_REQUERIDO: falta el NIT de Bold')).toBe('NIT_PROCESADOR_REQUERIDO');
    expect(codigoDeError('SESION_REQUERIDA')).toBe('SESION_REQUERIDA');
    expect(codigoDeError('algo raro')).toBe('DESCONOCIDO');
  });
});

describe('saldos y meses', () => {
  const s = (p: Partial<SaldoProcesador>): SaldoProcesador => ({
    procesador: 'wompi',
    nombre: 'Wompi',
    nit: null,
    cuenta: '13802002',
    origen: 'nacional',
    retiene_saldo: false,
    mes: '2026-11-01',
    cobrado_mes: 0,
    abonado_mes: 0,
    saldo: 0,
    ultimo_cobro: null,
    ultimo_abono: null,
    cobro_pendiente_desde: null,
    dias_habiles_sin_abono: null,
    dias_sin_retiro: null,
    alerta: false,
    motivo_alerta: null,
    estado: 'al_dia',
    ...p,
  });

  it('las alertas van primero y luego el saldo mayor', () => {
    const orden = ordenarSaldos([s({ procesador: 'wompi', saldo: 900 }), s({ procesador: 'bold', saldo: 100, alerta: true }), s({ procesador: 'payu', saldo: 500 })]);
    expect(orden.map((x) => x.procesador)).toEqual(['bold', 'wompi', 'payu']);
  });

  it('totales', () => {
    expect(totalesSaldos([s({ cobrado_mes: 10, abonado_mes: 4, saldo: 6, alerta: true }), s({ cobrado_mes: 5, saldo: 5 })])).toEqual({ cobrado: 15, abonado: 4, saldo: 11, alertas: 1 });
  });

  it('mover de mes cruza el año sin pasar por Date', () => {
    expect(moverMes('2026-01-01', -1)).toBe('2025-12-01');
    expect(moverMes('2026-12-01', 1)).toBe('2027-01-01');
  });
});

describe('datos de los procesadores: solo se envía lo que cambió', () => {
  const p = {
    codigo: 'wompi' as const,
    cuenta: '13802002',
    etiqueta: 'Wompi',
    nit: '900499068-7',
    nombre: 'WOMPI S.A.S.',
    nitPropio: null,
    nombrePropio: null,
    nitDeFabrica: true,
    origen: 'nacional' as const,
    retieneSaldo: false,
  };
  it('sin cambios no envía nada', () => {
    expect(cambiosDeFila(p, { nit: '', nombre: '', origen: 'nacional', retiene: false })).toBeNull();
  });
  it('solo el interruptor', () => {
    expect(cambiosDeFila(p, { nit: '', nombre: '', origen: 'nacional', retiene: true })).toEqual({ procesador: 'wompi', retiene_saldo: true });
  });
  it('borrar el NIT propio vuelve al de fábrica (null)', () => {
    expect(cambiosDeFila({ ...p, nitPropio: '123' }, { nit: ' ', nombre: '', origen: 'exterior', retiene: false })).toEqual({ procesador: 'wompi', nit: null, origen: 'exterior' });
  });
});

describe('textos en 4 idiomas', () => {
  const RAIZ = path.resolve(__dirname, '../../../../..');
  const leer = (l: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'messages', `${l}.json`), 'utf8')).finanzasProcesadores;
  const claves = (o: Record<string, unknown>, pre = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? claves(v as Record<string, unknown>, `${pre}${k}.`) : [`${pre}${k}`]));

  it('es, en, fr y pt tienen exactamente las mismas claves', () => {
    const es = claves(leer('es')).sort();
    for (const l of ['en', 'fr', 'pt']) expect(claves(leer(l)).sort()).toEqual(es);
  });

  it('cada t(\'…\') literal de las pantallas existe', () => {
    const es = new Set(claves(leer('es')));
    const dir = path.join(RAIZ, 'src/components/finanzas/procesadores-pago');
    const faltan: string[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) if (!es.has(m[1])) faltan.push(`${f}: ${m[1]}`);
    }
    expect(faltan).toEqual([]);
  });

  it('las claves dinámicas también existen', () => {
    const es = new Set(claves(leer('es')));
    const dinamicas = [
      ...['descontable', 'proporcional', 'gasto', 'exterior', 'sin_iva', 'sin_perfil'].map((x) => `abono.ivaInsignia.${x}`),
      ...['sinAbono', 'sinRetiro', 'negativo'].map((x) => `estado.${x}`),
      'origen.nacional',
      'origen.exterior',
      'abonos.estado.registrado',
      'abonos.estado.anulado',
      'errores.DESCONOCIDO',
      'errores.NIT_PROCESADOR_REQUERIDO',
      'errores.NETO_DESCUADRADO',
    ];
    expect(dinamicas.filter((k) => !es.has(k))).toEqual([]);
  });
});
