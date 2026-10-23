import { armarArbolContable, anidarResultado, importeDeGrupo, presentarNiif } from '../arbolBalance';
import { codigoEnNivel } from '../reportes/nivelesPuc';
import {
  ancestrosDe,
  cuentasBajoPrefijo,
  presentacionDeCodigo,
  saldoConsolidado,
  totalPropio,
} from '../pucPrefijo';

describe('jerarquía por prefijo', () => {
  const plan = ['1', '11', '14', '1405', '1405-01', '1435', '2', '3', '36'];

  it('un código con guion cuelga de 1405, 14 y 1', () => {
    const existentes = new Set(plan);
    expect(ancestrosDe('1405-01', existentes)).toEqual(['1405', '14', '1']);
    expect(cuentasBajoPrefijo('14', plan)).toEqual(['14', '1405', '1405-01', '1435']);
    const propios = new Map([
      ['1405-01', { debitos: 10, creditos: 4 }],
      ['1435', { debitos: 3, creditos: 1 }],
    ]);
    expect(saldoConsolidado('14', plan, propios)).toEqual({ debitos: 13, creditos: 5 });
    expect(saldoConsolidado('1', plan, propios)).toEqual({ debitos: 13, creditos: 5 });
    expect(totalPropio(propios.values())).toEqual({ debitos: 13, creditos: 5 });
  });

  it('si falta el grupo, la cuenta sube a la clase', () => {
    const arbol = armarArbolContable(
      [
        { account_code: '1', name: 'Activo', type: 'asset', parent_code: null },
        { account_code: '1405', name: 'Materias primas', type: 'asset', parent_code: '11' },
      ],
      (codigo) => (codigo === '1405' ? 8 : 0),
    );
    expect(arbol.map((nodo) => nodo.account_code)).toEqual(['1']);
    expect(importeDeGrupo(arbol, '1')).toBe(8);
    expect(arbol[0].children.map((nodo) => nodo.account_code)).toEqual(['1405']);
  });

  it('un padre errado no cambia el total', () => {
    const cuentas = [
      { account_code: '1', name: 'Activo', type: 'asset', parent_code: null },
      { account_code: '14', name: 'Inventarios', type: 'asset', parent_code: '1' },
      { account_code: '1405', name: 'Materias primas', type: 'asset', parent_code: '11' },
      { account_code: '1405-01', name: 'Sede', type: 'asset', parent_code: '11' },
    ];
    const bien = armarArbolContable(cuentas, (codigo) => (codigo === '1405-01' ? 20 : 0));
    const mal = armarArbolContable(
      cuentas.map((cuenta) => ({ ...cuenta, parent_code: cuenta.account_code === '1' ? null : '99' })),
      (codigo) => (codigo === '1405-01' ? 20 : 0),
    );
    expect(importeDeGrupo(bien, '14')).toBe(20);
    expect(importeDeGrupo(bien, '1')).toBe(20);
    expect(importeDeGrupo(mal, '14')).toBe(importeDeGrupo(bien, '14'));
    expect(importeDeGrupo(mal, '1')).toBe(importeDeGrupo(bien, '1'));
    expect(codigoEnNivel('1405-01', 'cuenta')).toBe('1405');
    expect(codigoEnNivel('1405-01', 'grupo')).toBe('14');
    expect(codigoEnNivel('1405-01', 'auxiliar')).toBe('1405-01');
  });

  it('el resultado sin cerrar suma en 36 y en el patrimonio', () => {
    const raices = armarArbolContable(
      [
        { account_code: '3', name: 'Patrimonio', type: 'equity', parent_code: null },
        { account_code: '36', name: 'Resultados del ejercicio', type: 'equity', parent_code: '3' },
        { account_code: '3605', name: 'Utilidad', type: 'equity', parent_code: '36' },
      ],
      (codigo) => (codigo === '3605' ? 4 : 0),
    );
    anidarResultado(raices, 7);
    expect(importeDeGrupo(raices, '36')).toBe(11);
    expect(importeDeGrupo(raices, '3')).toBe(11);
    expect(raices.reduce((suma, nodo) => suma + nodo.amount, 0)).toBe(11);
    const grupo = raices[0].children.find((nodo) => nodo.account_code === '36');
    expect(grupo?.children.map((nodo) => nodo.account_code)).toContain('RESULTADO');
  });

  it('la presentación NIIF no renombra el grupo 11', () => {
    const raices = armarArbolContable(
      [
        { account_code: '1', name: 'Activo', type: 'asset', parent_code: null },
        { account_code: '11', name: 'Disponible', type: 'asset', parent_code: '1' },
        { account_code: '15', name: 'Propiedades, planta y equipo', type: 'asset', parent_code: '1' },
      ],
      (codigo) => (codigo === '11' ? 5 : codigo === '15' ? 2 : 0),
    );
    const niif = presentarNiif(raices, new Map([['11', 'corriente'], ['15', 'no_corriente']]));
    expect(niif[0].children.map((nodo) => nodo.name)).toEqual(['Corriente', 'No corriente']);
    expect(niif[0].children[0].children[0].name).toBe('Disponible');
    expect(niif[0].amount).toBe(7);
    expect(presentacionDeCodigo('12')).toBe('segun_plazo');
    expect(presentacionDeCodigo('11', 'no_corriente')).toBe('no_corriente');
  });
});
