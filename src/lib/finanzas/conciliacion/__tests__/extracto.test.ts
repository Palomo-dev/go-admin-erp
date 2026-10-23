import * as XLSX from 'xlsx';
import {
  parsearNumeroColombiano,
  parsearFechaExtracto,
  parsearExtractoCsv,
  sugerirCategoria,
  emparejarExtracto,
  claveCategoria,
  matrizDesdeArchivo,
  type LineaExtracto,
  type MovimientoCandidato,
} from '../extracto';

describe('número y fecha de extracto', () => {
  it('lee el formato colombiano y el anglosajón', () => {
    expect(parsearNumeroColombiano('1.234.567,89')).toBeCloseTo(1234567.89);
    expect(parsearNumeroColombiano('-1,200.50')).toBeCloseTo(-1200.5);
    expect(parsearNumeroColombiano('(500)')).toBe(-500);
    expect(parsearNumeroColombiano('1.200')).toBe(1200);
  });

  it('guarda el día calendario sin pasar por UTC', () => {
    expect(parsearFechaExtracto('01/10/2026')).toBe('2026-10-01');
    expect(parsearFechaExtracto('2026-10-01')).toBe('2026-10-01');
    expect(parsearFechaExtracto('31/02/2026')).toBeNull();
  });
});

describe('formatos de bancos', () => {
  it('lee un CSV con punto y coma, débito y crédito', () => {
    const csv = [
      'Banco',
      'Fecha;Descripcion;Documento;Debito;Credito',
      '02/10/2026;GMF 4X1000;99;4.000,00;',
      '03/10/2026;Abono nomina;AB-1;;1.200.000,50',
    ].join('\n');
    const lineas = parsearExtractoCsv(csv);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatchObject({ fecha: '2026-10-02', valor: -4000, categoria: 'gmf', referencia: '99' });
    expect(lineas[1].valor).toBeCloseTo(1200000.5);
    expect(lineas[1].categoria).toBeNull();
  });

  it('sugiere comisión e intereses', () => {
    expect(sugerirCategoria('Cuota de manejo')).toBe('comision');
    expect(sugerirCategoria('Intereses de ahorros')).toBe('interes');
    expect(claveCategoria('interes', 10)).toBe('intereses_recibidos');
    expect(claveCategoria('interes', -10)).toBe('intereses_pagados');
    expect(claveCategoria('gmf', -4)).toBe('gmf');
  });
});

describe('archivo de extracto', () => {
  it('lee CSV y XLSX, y rechaza otro formato', async () => {
    const csv = new File(
      ['Fecha;Descripcion;Valor\n02/10/2026;Abono;1.500,00\n'],
      'extracto.csv',
      { type: 'text/csv' },
    );
    const desdeCsv = await matrizDesdeArchivo(csv);
    expect(desdeCsv[0]).toEqual(['Fecha', 'Descripcion', 'Valor']);
    expect(desdeCsv[1]).toEqual(['02/10/2026', 'Abono', '1.500,00']);

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.aoa_to_sheet([
        ['Fecha', 'Descripcion', 'Valor'],
        ['02/10/2026', 'Abono', '1.500,00'],
      ]),
      'Extracto',
    );
    const bytes = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const desdeXlsx = await matrizDesdeArchivo(new File([bytes], 'extracto.xlsx'));
    expect(desdeXlsx[0]).toEqual(['Fecha', 'Descripcion', 'Valor']);
    expect(desdeXlsx[1][2]).toBe('1.500,00');

    await expect(matrizDesdeArchivo(new File(['x'], 'extracto.pdf'))).rejects.toThrow(
      'formato_no_soportado',
    );
  });
});

describe('empareje', () => {
  const linea = (parcial: Partial<LineaExtracto>): LineaExtracto => ({
    fecha: '2026-10-05',
    descripcion: 'Pago',
    referencia: '',
    valor: -1500,
    categoria: null,
    ...parcial,
  });
  const mov = (parcial: Partial<MovimientoCandidato>): MovimientoCandidato => ({
    id: 1,
    fecha: '2026-10-05',
    valor: -1500,
    referencia: null,
    ...parcial,
  });

  it('casa por valor y fecha, y no reutiliza el movimiento', () => {
    const parejas = emparejarExtracto(
      [linea({}), linea({ fecha: '2026-10-06', valor: -1500 })],
      [mov({ id: 7 })],
    );
    expect(parejas).toEqual([{ linea: 0, movimientoId: 7 }]);
  });

  it('prefiere la referencia exacta aunque la otra fecha esté más cerca', () => {
    const parejas = emparejarExtracto(
      [linea({ referencia: 'FAC-10' })],
      [
        mov({ id: 1, fecha: '2026-10-05', referencia: 'otra' }),
        mov({ id: 2, fecha: '2026-10-07', referencia: 'FAC-10' }),
      ],
    );
    expect(parejas).toEqual([{ linea: 0, movimientoId: 2 }]);
  });

  it('no casa si las dos referencias vienen y no se parecen', () => {
    const parejas = emparejarExtracto(
      [linea({ referencia: 'AAA' })],
      [mov({ referencia: 'ZZZ' })],
    );
    expect(parejas).toEqual([]);
  });

  it('rechaza un valor distinto o una fecha a más de tres días', () => {
    expect(emparejarExtracto([linea({ valor: -10 })], [mov({ valor: -11 })])).toEqual([]);
    expect(emparejarExtracto([linea({ fecha: '2026-10-01' })], [mov({ fecha: '2026-10-05' })])).toEqual([]);
  });
});
