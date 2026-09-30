/**
 * Excel del cierre completo: un libro con portada y una hoja por reporte
 * congelado. Los números quedan como números y una tabla vacía dice
 * «Sin movimientos».
 */
import * as XLSX from 'xlsx';
import { cierreAExcel, type TextosCierreExcel } from '../exportarTabla';
import type { SnapshotCierre } from '../cierres/snapshot';

const textos: TextosCierreExcel = {
  portada: 'Portada',
  indicador: 'Indicador',
  valor: 'Valor',
  capitulo: 'Capítulo',
  reportes: 'Reportes',
  errores: 'No se pudieron calcular',
  sinMovimientos: 'Sin movimientos',
  sinFranja: 'Día completo',
  truncado: (m, t) => `${m} de ${t}`,
};

const snapshot: SnapshotCierre = {
  formato: 1,
  periodo: { tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', etiqueta: 'Septiembre de 2026' },
  plantilla: 'completo',
  sucursal: null,
  moneda: null,
  kpisPortada: [{ titulo: 'Ventas', valor: 1500, formato: 'moneda' }],
  capitulos: [
    {
      grupo: 'ventas',
      titulo: 'Ventas y POS',
      reportes: [
        {
          id: 'ventas-dia',
          titulo: 'Ventas por día',
          modulo: 'pos',
          grupo: 'ventas',
          kpis: [{ titulo: 'Total', valor: 1500, formato: 'moneda' }],
          principal: {
            id: 'principal',
            titulo: null,
            columnas: [
              { key: 'dia', titulo: 'Día', tipo: 'fecha' },
              { key: 'total', titulo: 'Total', tipo: 'moneda' },
            ],
            filas: [{ dia: '2026-09-01', total: 1500 }],
            totales: { dia: 'Total', total: 1500 },
            filasTotales: 1,
          },
          vistas: [],
          lectura: [],
          sinFranja: false,
        },
        {
          id: 'caja',
          titulo: 'Caja',
          modulo: 'pos',
          grupo: 'ventas',
          kpis: [],
          principal: {
            id: 'principal',
            titulo: 'Movimientos',
            columnas: [{ key: 'concepto', titulo: 'Concepto', tipo: 'texto' }],
            filas: [],
            totales: null,
            filasTotales: 0,
          },
          vistas: [],
          lectura: [],
          sinFranja: true,
        },
      ],
    },
  ],
  errores: [{ reportId: 'impuestos', titulo: 'Impuestos' }],
  generadoEn: '2026-09-30T12:00:00.000Z',
};

describe('Excel del cierre', () => {
  test('portada, una hoja por reporte, números y la nota de tabla vacía', () => {
    const libro = XLSX.read(cierreAExcel(snapshot, textos, ['CIERRE-MENSUAL-202609-001', '01/09/2026 – 30/09/2026']), { type: 'array' });
    expect(libro.SheetNames).toEqual(['Portada', 'Ventas por día', 'Caja']);
    const portada = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets.Portada, { header: 1 });
    expect(portada[0]).toEqual(['CIERRE-MENSUAL-202609-001']);
    expect(portada).toEqual(expect.arrayContaining([['Indicador', 'Valor'], ['Ventas', 1500], ['Capítulo', 'Reportes'], ['Ventas y POS', 2], ['Impuestos']]));
    const ventas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets['Ventas por día'], { header: 1 });
    expect(ventas).toEqual(expect.arrayContaining([['Día', 'Total'], ['2026-09-01', 1500], ['Total', 1500]]));
    const caja = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets.Caja, { header: 1 });
    expect(caja[0]).toEqual(['Ventas y POS']);
    expect(caja).toEqual(expect.arrayContaining([['Día completo'], ['Sin movimientos']]));
  });
});
