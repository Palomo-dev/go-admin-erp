import { compararKpis, lecturaDelReporte, tablaComparada } from '../comparativo';
import type { ReportData } from '../types';

function datos(kpis: ReportData['kpis'], filas: ReportData['filas'] = [{ a: 1 }]): ReportData {
  return {
    id: 'x',
    titulo: 'X',
    modulo: 'pos',
    kpis,
    columnas: [],
    filas,
    generadoEn: '2026-09-30T12:00:00.000Z',
    periodo: { tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', etiqueta: '' },
  };
}

describe('compararKpis', () => {
  it('cruza por título y calcula diferencia y porcentaje', () => {
    const v = compararKpis(
      datos([{ titulo: 'Ventas', valor: 120 }, { titulo: 'Tickets', valor: 10 }]),
      datos([{ titulo: 'Tickets', valor: 8 }, { titulo: 'Ventas', valor: 100 }]),
    );
    expect(v[0]).toEqual({ titulo: 'Ventas', actual: 120, anterior: 100, diferencia: 20, porcentaje: 20 });
    expect(v[1]).toMatchObject({ anterior: 8, diferencia: 2, porcentaje: 25 });
  });

  it('sin base (0) no inventa porcentaje, y los textos no se comparan', () => {
    const v = compararKpis(
      datos([{ titulo: 'Ventas', valor: 50 }, { titulo: 'Estado', valor: 'Abierto' }]),
      datos([{ titulo: 'Ventas', valor: 0 }, { titulo: 'Estado', valor: 'Cerrado' }]),
    );
    expect(v[0]).toMatchObject({ diferencia: 50, porcentaje: null });
    expect(v[1]).toMatchObject({ actual: null, diferencia: null });
  });

  it('sin periodo comparado deja todo en null', () => {
    expect(compararKpis(datos([{ titulo: 'Ventas', valor: 1 }]), null)[0]).toMatchObject({ anterior: null, porcentaje: null });
  });
});

describe('lecturaDelReporte', () => {
  it('menciona solo variaciones sobre el umbral, las mayores primero', () => {
    const actual = datos([{ titulo: 'Ventas', valor: 130 }, { titulo: 'Tickets', valor: 101 }, { titulo: 'Gastos', valor: 50 }]);
    const anterior = datos([{ titulo: 'Ventas', valor: 100 }, { titulo: 'Tickets', valor: 100 }, { titulo: 'Gastos', valor: 100 }]);
    const l = lecturaDelReporte(actual, compararKpis(actual, anterior), 'agosto 2026');
    expect(l.map((x) => x.texto)).toEqual([
      'Gastos baja 50,0 % frente a agosto 2026.',
      'Ventas sube 30,0 % frente a agosto 2026.',
    ]);
  });

  it('sin datos lo dice, y conserva la lectura propia del reporte primero', () => {
    const vacio = { ...datos([{ titulo: 'Ventas', valor: 0 }], []), lectura: [{ tono: 'alerta' as const, texto: 'Caja abierta' }] };
    expect(lecturaDelReporte(vacio, null, null).map((x) => x.texto)).toEqual(['Caja abierta', 'No hay movimientos en este periodo.']);
  });
});

describe('tablaComparada', () => {
  const columnas = [
    { key: 'concepto', titulo: 'Concepto', tipo: 'texto' as const },
    { key: 'valor', titulo: 'Valor', tipo: 'moneda' as const },
    { key: 'pct', titulo: '% ingresos', tipo: 'porcentaje' as const },
    { key: 'nota', titulo: 'Nota', tipo: 'texto' as const },
  ];
  const titulos = { anterior: 'Agosto', variacion: 'Variación' };

  it('cruza por concepto y agrega referencia y variación tras la cifra y su porcentaje', () => {
    const t = tablaComparada(
      { columnas, filas: [{ concepto: 'Ingresos', valor: 150, pct: 100 }, { concepto: 'Costos', valor: -60, pct: 40 }], totales: { concepto: 'Total', valor: 90 } },
      { columnas, filas: [{ concepto: 'Costos', valor: -50 }, { concepto: 'Ingresos', valor: 120 }], totales: { concepto: 'Total', valor: 70 } },
      titulos,
    );
    expect(t?.columnas.map((c) => c.key)).toEqual(['concepto', 'valor', 'pct', 'valor__anterior', 'valor__variacion', 'nota']);
    expect(t?.filas[0]).toMatchObject({ valor__anterior: 120, valor__variacion: 30 });
    expect(t?.filas[1]).toMatchObject({ valor__anterior: -50, valor__variacion: -10 });
    expect(t?.totales).toMatchObject({ valor__anterior: 70, valor__variacion: 20 });
  });

  it('un concepto que no estaba en la referencia queda sin variación', () => {
    const t = tablaComparada({ columnas, filas: [{ concepto: 'Nuevo', valor: 5 }] }, { columnas, filas: [] }, titulos);
    expect(t?.filas[0]).toMatchObject({ valor__anterior: null, valor__variacion: null });
  });

  it('con claves repetidas no empareja: devuelve null', () => {
    const filas = [{ concepto: 'Venta', valor: 1 }, { concepto: 'Venta', valor: 2 }];
    expect(tablaComparada({ columnas, filas }, { columnas, filas }, titulos)).toBeNull();
  });
});
