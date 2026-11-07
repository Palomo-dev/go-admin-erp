import {
  indexarCatalogo,
  tasaCatalogo,
  tasaManualEnBase,
  serieTasas,
  tasaVigente,
  historico,
  puntosGrafica,
  rangoLectura,
  rangoPorDefecto,
  monedaPorDefecto,
  decimalesTasa,
  variacionPorcentual,
  filasCsvHistorico,
  nombreArchivoCsv,
  validarTasaManual,
  claveErrorTasa,
  nombrePerfil,
  type TasaCatalogo,
  type TasaManualFila,
} from '../tasasLogica';
import { aCsv } from '@/lib/finanzas/csv';

// Forma real de `currency_rates` (MCP 2026-11-07): base USD, una fila por moneda y día.
const CATALOGO: TasaCatalogo[] = [
  { code: 'COP', rate: '3236.347251', rate_date: '2026-11-06', created_at: '2026-11-07T02:00:03Z' },
  { code: 'EUR', rate: '0.897150', rate_date: '2026-11-06', created_at: '2026-11-07T02:00:03Z' },
  { code: 'USD', rate: '1.000000', rate_date: '2026-11-06', created_at: '2026-11-07T02:00:03Z' },
  { code: 'COP', rate: '3221.504866', rate_date: '2026-11-05', created_at: '2026-11-06T02:00:19Z' },
  { code: 'EUR', rate: '0.892092', rate_date: '2026-11-05', created_at: '2026-11-06T02:00:19Z' },
  { code: 'USD', rate: '1.000000', rate_date: '2026-11-05', created_at: '2026-11-06T02:00:19Z' },
  { code: 'COP', rate: '3244.322340', rate_date: '2026-11-04' },
  { code: 'EUR', rate: '0.888482', rate_date: '2026-11-04' },
];

const manual = (p: Partial<TasaManualFila>): TasaManualFila => ({
  id: 1,
  base_currency: 'USD',
  target_currency: 'COP',
  rate: 3905,
  effective_date: '2026-11-07',
  source: 'manual',
  created_by: 'u-1',
  reason: 'TRM del contador',
  created_at: '2026-11-07T14:00:00Z',
  updated_at: '2026-11-07T14:00:00Z',
  ...p,
});

describe('cruce del catálogo (base USD)', () => {
  const cat = indexarCatalogo(CATALOGO);

  test('1 USD en COP es la tasa de COP', () => {
    expect(tasaCatalogo(cat.get('2026-11-06'), 'USD', 'COP')).toBeCloseTo(3236.347251, 6);
  });

  test('1 EUR en COP es COP / EUR', () => {
    expect(tasaCatalogo(cat.get('2026-11-06'), 'EUR', 'COP')).toBeCloseTo(3236.347251 / 0.89715, 6);
  });

  test('base USD: 1 COP en USD es 1 / COP', () => {
    expect(tasaCatalogo(cat.get('2026-11-06'), 'COP', 'USD')).toBeCloseTo(1 / 3236.347251, 10);
  });

  test('USD sin fila cuenta como 1; moneda sin fila → null; misma moneda → 1', () => {
    expect(tasaCatalogo(cat.get('2026-11-04'), 'USD', 'COP')).toBeCloseTo(3244.32234, 5);
    expect(tasaCatalogo(cat.get('2026-11-06'), 'MXN', 'COP')).toBeNull();
    expect(tasaCatalogo(undefined, 'USD', 'COP')).toBeNull();
    expect(tasaCatalogo(undefined, 'COP', 'cop ')).toBe(1);
  });

  test('ignora tasas no numéricas o en cero', () => {
    const c = indexarCatalogo([{ code: 'COP', rate: 'x', rate_date: '2026-11-06' }, { code: 'EUR', rate: 0, rate_date: '2026-11-06' }]);
    expect(c.get('2026-11-06')?.size ?? 0).toBe(0);
  });
});

describe('tasa manual de exchange_rates', () => {
  test('acepta los dos sentidos del par', () => {
    expect(tasaManualEnBase(manual({}), 'USD', 'COP')).toBe(3905);
    expect(tasaManualEnBase(manual({ base_currency: 'COP', target_currency: 'USD', rate: 0.0002 }), 'USD', 'COP')).toBeCloseTo(5000, 6);
    expect(tasaManualEnBase(manual({ base_currency: 'EUR' }), 'USD', 'COP')).toBeNull();
  });
});

describe('serie: la manual manda ese día', () => {
  const cat = indexarCatalogo(CATALOGO);

  test('día con manual y automática: gana la manual y conserva la automática para el aviso', () => {
    const cat2 = indexarCatalogo([...CATALOGO, { code: 'COP', rate: 3889.4, rate_date: '2026-11-07', created_at: '2026-11-08T02:00:00Z' }]);
    const serie = serieTasas({ moneda: 'USD', base: 'COP', catalogo: cat2, manuales: [manual({})] });
    expect(serie[0]).toMatchObject({ dia: '2026-11-07', tasa: 3905, fuente: 'manual', autorId: 'u-1', motivo: 'TRM del contador' });
    expect(serie[0].automatica).toBeCloseTo(3889.4, 4);
    expect(serie.map((p) => p.dia)).toEqual(['2026-11-07', '2026-11-06', '2026-11-05', '2026-11-04']);
  });

  test('días solo del catálogo salen como automáticas con su hora de escritura', () => {
    const serie = serieTasas({ moneda: 'USD', base: 'COP', catalogo: cat, manuales: [] });
    expect(serie[0]).toMatchObject({ dia: '2026-11-06', fuente: 'automatica', registradaEn: '2026-11-07T02:00:03Z' });
  });

  test('con dos manuales el mismo día, la última actualizada', () => {
    const serie = serieTasas({
      moneda: 'USD',
      base: 'COP',
      catalogo: cat,
      manuales: [manual({ id: 1, rate: 3900, updated_at: '2026-11-07T10:00:00Z' }), manual({ id: 2, rate: 3950, updated_at: '2026-11-07T12:00:00Z' })],
    });
    expect(serie[0].tasa).toBe(3950);
  });

  test('filas de exchange_rates que no son manuales no cuentan', () => {
    const serie = serieTasas({ moneda: 'USD', base: 'COP', catalogo: cat, manuales: [manual({ source: 'calculated' })] });
    expect(serie[0].dia).toBe('2026-11-06');
  });
});

describe('tasa vigente y variación (M1)', () => {
  const serie = serieTasas({ moneda: 'USD', base: 'COP', catalogo: indexarCatalogo(CATALOGO), manuales: [] });

  test('día con tasa: variación frente al anterior', () => {
    const v = tasaVigente(serie, '2026-11-06');
    expect(v.delDia).toBe(true);
    expect(v.variacion).toBeCloseTo(((3236.347251 - 3221.504866) / 3221.504866) * 100, 6);
  });

  test('día sin tasa: usa la última anterior y no muestra variación', () => {
    const v = tasaVigente(serie, '2026-11-07');
    expect(v.delDia).toBe(false);
    expect(v.punto?.dia).toBe('2026-11-06');
    expect(v.variacion).toBeNull();
  });

  test('sin nada anterior: vacía', () => {
    expect(tasaVigente(serie, '2026-01-01')).toEqual({ punto: null, delDia: false, variacion: null });
  });

  test('variacionPorcentual', () => {
    expect(variacionPorcentual(110, 100)).toBeCloseTo(10);
    expect(variacionPorcentual(110, 0)).toBeNull();
    expect(variacionPorcentual(null, 100)).toBeNull();
  });
});

describe('histórico y gráfica (M2)', () => {
  const serie = serieTasas({ moneda: 'USD', base: 'COP', catalogo: indexarCatalogo(CATALOGO), manuales: [] });

  test('el histórico respeta el rango y calcula la variación con el día anterior aunque quede fuera', () => {
    const filas = historico(serie, '2026-11-05', '2026-11-06');
    expect(filas.map((f) => f.dia)).toEqual(['2026-11-06', '2026-11-05']);
    expect(filas[1].variacion).toBeCloseTo(((3221.504866 - 3244.32234) / 3244.32234) * 100, 6);
  });

  test('la última fila sin anterior no tiene variación', () => {
    const filas = historico(serie, '2026-11-01', '2026-11-06');
    expect(filas[filas.length - 1].variacion).toBeNull();
  });

  test('la gráfica toma 30 días hasta «hasta» en orden ascendente', () => {
    const puntos = puntosGrafica(serie, '2026-11-06');
    expect(puntos.map((p) => p.dia)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06']);
    expect(puntosGrafica(serie, '2026-11-06', 2).map((p) => p.dia)).toEqual(['2026-11-05', '2026-11-06']);
  });

  test('rangos de lectura y por defecto', () => {
    expect(rangoPorDefecto('2026-11-07')).toEqual({ desde: '2026-10-08', hasta: '2026-11-07' });
    expect(rangoLectura('2026-11-01', '2026-11-07')).toEqual({ desde: '2026-10-25', hasta: '2026-11-07' });
    // Con la gráfica, se lee desde 30 días antes de «hasta» aunque el filtro empiece después.
    expect(rangoLectura('2026-11-01', '2026-11-07', { conGrafica: true })).toEqual({ desde: '2026-10-02', hasta: '2026-11-07' });
  });

  test('moneda por defecto: USD, si no la primera que no es la base', () => {
    expect(monedaPorDefecto(['COP', 'EUR', 'USD'], 'COP')).toBe('USD');
    expect(monedaPorDefecto(['COP', 'EUR', 'MXN'], 'COP')).toBe('EUR');
    expect(monedaPorDefecto(['COP'], 'COP')).toBeNull();
  });

  test('decimales de la tasa', () => {
    expect(decimalesTasa(3905)).toBe(2);
    expect(decimalesTasa(0.89)).toBe(4);
    expect(decimalesTasa(0.0003)).toBe(6);
  });
});

describe('exportar CSV (se conserva)', () => {
  test('filas con par, punto decimal, variación y motivo con comillas', () => {
    const serie = serieTasas({
      moneda: 'USD',
      base: 'COP',
      catalogo: indexarCatalogo(CATALOGO),
      manuales: [manual({ reason: 'TRM, cierre "noviembre"' })],
    });
    const filas = historico(serie, '2026-11-06', '2026-11-07');
    const csv = aCsv(
      filasCsvHistorico(filas, 'USD', 'COP', {
        encabezados: ['Fecha', 'Par', 'Tasa', 'Variación %', 'Fuente', 'Registró', 'Motivo'],
        fuente: (f) => (f === 'manual' ? 'Manual' : 'Automática'),
        registro: (f) => (f.fuente === 'manual' ? 'Ana' : 'Plataforma'),
      }),
    );
    const lineas = csv.replace('﻿', '').split('\r\n');
    expect(lineas[0]).toBe('Fecha,Par,Tasa,Variación %,Fuente,Registró,Motivo');
    expect(lineas[1]).toBe('2026-11-07,USD/COP,3905,20.66,Manual,Ana,"TRM, cierre ""noviembre"""');
    expect(lineas[2]).toBe('2026-11-06,USD/COP,3236.347251,0.46,Automática,Plataforma,');
  });

  test('nombre del archivo', () => {
    expect(nombreArchivoCsv('usd', 'COP', '2026-10-01', '2026-11-07')).toBe('tasas_USD_COP_2026-10-01_2026-11-07.csv');
  });
});

describe('registrar tasa manual (M4)', () => {
  const HOY = '2026-11-07';

  test('válida', () => {
    const v = validarTasaManual({ moneda: 'USD', fecha: HOY, tasa: 3905, motivo: '  TRM   del contador ' }, HOY);
    expect(v).toEqual({ valido: true, errores: {}, motivo: 'TRM del contador' });
  });

  test('errores por campo', () => {
    expect(validarTasaManual({ moneda: null, fecha: null, tasa: null, motivo: '' }, HOY).errores).toEqual({
      moneda: 'requerido',
      fecha: 'requerido',
      tasa: 'requerido',
      motivo: 'requerido',
    });
    const v = validarTasaManual({ moneda: 'USD', fecha: '2026-11-08', tasa: 0, motivo: 'TRM' }, HOY);
    expect(v.errores).toEqual({ fecha: 'futura', tasa: 'positiva', motivo: 'corto' });
    expect(v.valido).toBe(false);
  });

  test('errores de la RPC', () => {
    expect(claveErrorTasa({ code: 'PGRST202', message: 'Could not find the function public.fn_finanzas_registrar_tasa_manual' })).toBe('noDisponible');
    expect(claveErrorTasa({ code: '42883', message: 'function does not exist' })).toBe('noDisponible');
    expect(claveErrorTasa({ code: '42501', message: 'sin_permiso' })).toBe('sinPermiso');
    expect(claveErrorTasa({ message: 'tasa_invalida' })).toBe('tasaInvalida');
    expect(claveErrorTasa({ message: 'fecha_futura' })).toBe('fechaFutura');
    expect(claveErrorTasa({ message: 'motivo_corto' })).toBe('motivoCorto');
    expect(claveErrorTasa({ message: 'moneda_es_base' })).toBe('monedaEsBase');
    expect(claveErrorTasa({ message: 'moneda_no_asignada' })).toBe('monedaNoAsignada');
    expect(claveErrorTasa({ message: 'otra' })).toBeNull();
  });

  test('nombre del perfil', () => {
    expect(nombrePerfil({ first_name: 'Ana', last_name: 'Gómez' })).toBe('Ana Gómez');
    expect(nombrePerfil({ first_name: ' ', last_name: null, email: 'a@b.co' })).toBe('a@b.co');
    expect(nombrePerfil(null)).toBeNull();
  });
});

describe('la migración propuesta de la tasa manual', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const path = jest.requireActual('path') as typeof import('path');
  const raiz = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const base = '20261107180000_finanzas_tasa_manual';
  const sql = fs.readFileSync(path.join(raiz, 'supabase', 'migrations', `${base}.sql`), 'utf-8');

  test('tiene su rollback', () => {
    expect(fs.existsSync(path.join(raiz, 'supabase', 'rollbacks', `${base}_rollback.sql`))).toBe(true);
  });

  test('la RPC exige permiso en la base, fija search_path y nace cerrada a anon', () => {
    expect(sql).toMatch(/create or replace function public\.fn_finanzas_registrar_tasa_manual\(/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path to 'public', 'pg_temp'/);
    expect(sql).toMatch(/fn_finanzas_exigir_permiso\(p_org, array\['billing_management', 'organization_settings'\]\)/);
    expect(sql).toMatch(/revoke all on function public\.fn_finanzas_registrar_tasa_manual\(integer, text, date, numeric, text\) from public, anon/);
  });

  test('guarda autor y motivo, y las escrituras directas de miembros se cierran', () => {
    expect(sql).toMatch(/add column if not exists created_by uuid/);
    expect(sql).toMatch(/add column if not exists reason text/);
    expect(sql).toMatch(/auth\.uid\(\)/);
    for (const p of ['exchange_rates_insert_org', 'exchange_rates_update_org', 'exchange_rates_delete_org']) {
      expect(sql).toContain(`drop policy if exists ${p} on public.exchange_rates`);
    }
  });
});
