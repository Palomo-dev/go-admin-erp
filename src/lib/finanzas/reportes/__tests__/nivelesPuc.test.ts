import {
  agruparPorNivel,
  colapsarImportes,
  cuadreSituacion,
  auxiliarPorTercero,
  type HojaSaldo,
  type NodoImporte,
} from '../nivelesPuc';

function hoja(codigo: string, debito: number, credito: number): HojaSaldo {
  return {
    codigo,
    nombre: codigo,
    debitoInicial: 0,
    creditoInicial: 0,
    debitoPeriodo: debito,
    creditoPeriodo: credito,
    debitoFinal: Math.max(0, debito - credito),
    creditoFinal: Math.max(0, credito - debito),
  };
}

describe('niveles del PUC', () => {
  const hojas = [
    hoja('110505', 100, 40),
    hoja('110510', 20, 0),
    hoja('2205', 0, 50),
    hoja('4135', 0, 80),
  ];

  it('la clase suma lo mismo que las hojas', () => {
    const clases = agruparPorNivel(hojas, 'clase');
    const debito = (filas: HojaSaldo[]) => filas.reduce((s, f) => s + f.debitoPeriodo, 0);
    expect(debito(clases)).toBe(debito(hojas));
    expect(clases.map((c) => c.codigo)).toEqual(['1', '2', '4']);
    expect(clases.find((c) => c.codigo === '1')?.debitoPeriodo).toBe(120);
  });

  it('cuenta y auxiliar no pierden el saldo', () => {
    const cuentas = agruparPorNivel(hojas, 'cuenta');
    expect(cuentas.find((c) => c.codigo === '1105')?.debitoFinal).toBe(80);
    const aux = agruparPorNivel(hojas, 'auxiliar');
    expect(aux).toHaveLength(4);
  });

  it('el árbol colapsado cuadra con el resultado del ejercicio', () => {
    const activo: NodoImporte[] = [{
      account_code: '1',
      name: 'Activo',
      amount: 80,
      children: [{ account_code: '110505', name: 'Caja', amount: 80, children: [] }],
    }];
    const pasivo: NodoImporte[] = [{ account_code: '2', name: 'Pasivo', amount: 50, children: [] }];
    const patrimonio: NodoImporte[] = [{ account_code: '3', name: 'Patrimonio', amount: 0, children: [] }];
    const clase1 = colapsarImportes(activo, 'clase');
    expect(clase1).toEqual([{ codigo: '1', nombre: 'Activo', importe: 80 }]);
    expect(colapsarImportes(pasivo, 'clase')[0].importe).toBe(50);
    expect(colapsarImportes(patrimonio, 'clase')).toEqual([]);
    const cuadre = cuadreSituacion(80, 50, 0, 30);
    expect(cuadre.cuadra).toBe(true);
  });

  it('el auxiliar agrupa por NIT y cuenta', () => {
    const filas = auxiliarPorTercero([
      { terceroNit: '900', terceroNombre: 'A', cuenta: '2205', debito: 10, credito: 0 },
      { terceroNit: '900', terceroNombre: '', cuenta: '2205', debito: 5, credito: 40 },
      { terceroNit: '', terceroNombre: '', cuenta: '1105', debito: 3, credito: 0 },
    ]);
    expect(filas[0]).toMatchObject({ terceroNit: '—', cuenta: '1105', saldo: 3 });
    expect(filas[1]).toMatchObject({ terceroNit: '900', terceroNombre: 'A', debito: 15, credito: 40, saldo: -25 });
  });
});
