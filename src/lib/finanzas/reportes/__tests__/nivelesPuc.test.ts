import {
  NIVELES_PUC,
  NIVEL_DETALLE,
  agruparPorNivel,
  codigoEnNivel,
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

  describe('subauxiliar de 10 dígitos', () => {
    // 1110 → 111005 → 11100501 → 1110050101 / 1110050102, y un auxiliar hoja 11100502.
    const conSub = [
      hoja('1110050101', 1000, 0),
      hoja('1110050102', 234.5, 0),
      hoja('11100502', 10, 0),
      hoja('4135', 0, 1244.5),
    ];
    const debito = (filas: HojaSaldo[], codigo: string) =>
      filas.find((f) => f.codigo === codigo)?.debitoPeriodo;

    it('suma en su auxiliar (8), subcuenta (6), cuenta (4), grupo (2) y clase (1)', () => {
      expect(debito(agruparPorNivel(conSub, 'auxiliar'), '11100501')).toBe(1234.5);
      expect(debito(agruparPorNivel(conSub, 'auxiliar'), '11100502')).toBe(10);
      expect(debito(agruparPorNivel(conSub, 'subcuenta'), '111005')).toBe(1244.5);
      expect(debito(agruparPorNivel(conSub, 'cuenta'), '1110')).toBe(1244.5);
      expect(debito(agruparPorNivel(conSub, 'grupo'), '11')).toBe(1244.5);
      expect(debito(agruparPorNivel(conSub, 'clase'), '1')).toBe(1244.5);
    });

    it('el auxiliar ya no deja el subauxiliar suelto', () => {
      const codigos = agruparPorNivel(conSub, 'auxiliar').map((f) => f.codigo);
      expect(codigos).toEqual(['11100501', '11100502', '4135']);
      expect(codigos.some((c) => c.length > 8)).toBe(false);
    });

    it('el subauxiliar es el detalle completo', () => {
      expect(NIVELES_PUC).toContain('subauxiliar');
      expect(NIVEL_DETALLE).toBe('subauxiliar');
      expect(agruparPorNivel(conSub, 'subauxiliar').map((f) => f.codigo))
        .toEqual(['1110050101', '1110050102', '11100502', '4135']);
    });

    it('cada nivel conserva el total de las hojas', () => {
      const total = (filas: HojaSaldo[]) => filas.reduce((s, f) => s + f.debitoPeriodo - f.creditoPeriodo, 0);
      for (const nivel of NIVELES_PUC) {
        expect(total(agruparPorNivel(conSub, nivel))).toBeCloseTo(total(conSub), 6);
      }
    });

    it('el auxiliar respeta el código con guion que ya cabe en 8 dígitos', () => {
      expect(codigoEnNivel('1405-01', 'auxiliar')).toBe('1405-01');
      expect(codigoEnNivel('1110050101', 'auxiliar')).toBe('11100501');
      expect(codigoEnNivel('111005010101', 'subauxiliar')).toBe('111005010101');
    });

    it('el árbol colapsado al auxiliar suma el subauxiliar en su padre', () => {
      const arbol: NodoImporte[] = [{
        account_code: '1', name: 'Activo', amount: 1244.5, children: [{
          account_code: '11', name: 'Disponible', amount: 1244.5, children: [{
            account_code: '1110', name: 'Bancos', amount: 1244.5, children: [{
              account_code: '111005', name: 'Moneda nacional', amount: 1244.5, children: [
                { account_code: '11100501', name: 'Banco A', amount: 1234.5, children: [
                  { account_code: '1110050101', name: 'Cuenta corriente', amount: 1000, children: [] },
                  { account_code: '1110050102', name: 'Cuenta de ahorros', amount: 234.5, children: [] },
                ] },
                { account_code: '11100502', name: 'Banco B', amount: 10, children: [] },
              ],
            }],
          }],
        }],
      }];
      expect(colapsarImportes(arbol, 'auxiliar')).toEqual([
        { codigo: '11100501', nombre: 'Banco A', importe: 1234.5 },
        { codigo: '11100502', nombre: 'Banco B', importe: 10 },
      ]);
      expect(colapsarImportes(arbol, 'subcuenta')).toEqual([
        { codigo: '111005', nombre: 'Moneda nacional', importe: 1244.5 },
      ]);
    });
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
