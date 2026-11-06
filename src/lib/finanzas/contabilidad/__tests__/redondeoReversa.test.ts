import { readFileSync } from 'fs';
import { join } from 'path';
import {
  auxiliaresPara,
  ladoDeLaDiferencia,
  leerAsientoPropuesto,
  lineasPorResolver,
  reversaEsCopiaExacta,
} from '../redondeoReversa';

describe('asiento propuesto de un pendiente de redondeo', () => {
  test('lee lo que guardó la base', () => {
    const p = leerAsientoPropuesto({
      memo: 'Venta V-20881',
      fecha: '2026-11-05T17:00:00+00:00',
      clave: 'redondeo_en_contra',
      diferencia: 1,
      lineas: [{ cuenta: '11050501', descripcion: 'Venta', debito: 50000, credito: 0 }],
    });
    expect(p).toMatchObject({ memo: 'Venta V-20881', clave: 'redondeo_en_contra', diferencia: 1 });
    expect(p?.lineas[0]).toEqual({ cuenta: '11050501', descripcion: 'Venta', debito: 50000, credito: 0 });
  });

  test('lo que no es un asiento no se pinta', () => {
    expect(leerAsientoPropuesto(null)).toBeNull();
    expect(leerAsientoPropuesto({ memo: 'x' })).toBeNull();
    expect(leerAsientoPropuesto('texto')).toBeNull();
  });

  test('la diferencia va al lado que falta', () => {
    expect(ladoDeLaDiferencia('redondeo')).toBe('credito');
    expect(ladoDeLaDiferencia('redondeo_en_contra')).toBe('debito');
  });
});

describe('reversa pendiente', () => {
  const titulo = (c: string) => c === '5195';

  test('solo pide cuenta para las líneas con valor en título o sin cuenta', () => {
    const lineas = [
      { id: 1, account_code: '5195', debit: 500, credit: 0 },
      { id: 2, account_code: '11050501', debit: 0, credit: 500 },
      { id: 3, account_code: '5195', debit: 0, credit: 0 },
      { id: 4, account_code: ' ', debit: 10, credit: 0 },
    ];
    expect(lineasPorResolver(lineas, titulo).map((l) => l.id)).toEqual([1, 4]);
  });

  test('ofrece solo los auxiliares del título', () => {
    const cuentas = [{ account_code: '51950501' }, { account_code: '51951001' }, { account_code: '11050501' }];
    expect(auxiliaresPara('5195', cuentas).map((c) => c.account_code)).toEqual(['51950501', '51951001']);
    expect(auxiliaresPara('', cuentas)).toHaveLength(3);
  });
});

describe('textos', () => {
  const claves = (o: Record<string, unknown>, prefijo = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null ? claves(v as Record<string, unknown>, `${prefijo}${k}.`) : [`${prefijo}${k}`],
    );
  const namespace = (idioma: string) =>
    JSON.parse(readFileSync(join(process.cwd(), 'messages', `${idioma}.json`), 'utf8')).redondeoReversa as Record<string, unknown>;

  test('los cuatro idiomas tienen las mismas claves', () => {
    const es = claves(namespace('es')).sort();
    expect(es.length).toBeGreaterThan(40);
    for (const idioma of ['en', 'fr', 'pt']) {
      expect(claves(namespace(idioma)).sort()).toEqual(es);
    }
  });
});

describe('copia exacta', () => {
  const original = [
    { account_code: '22050501', debit: 860000, credit: 0 },
    { account_code: '11100501', debit: 0, credit: 860000 },
  ];

  test('misma cuenta e importe invertido', () => {
    expect(reversaEsCopiaExacta(original, [
      { account_code: '11100501', debit: 860000, credit: 0 },
      { account_code: '22050501', debit: 0, credit: 860000 },
    ])).toBe(true);
  });

  test('con un auxiliar ya no es copia', () => {
    expect(reversaEsCopiaExacta(original, [
      { account_code: '11100501', debit: 860000, credit: 0 },
      { account_code: '22050502', debit: 0, credit: 860000 },
    ])).toBe(false);
  });

  test('una línea de menos tampoco', () => {
    expect(reversaEsCopiaExacta(original, [{ account_code: '11100501', debit: 860000, credit: 0 }])).toBe(false);
  });
});
