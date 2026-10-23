import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { interpretarFilas } from '../pucExcel';
import { armarArbolPlan, esMovimientoVisible, padreEnPlan } from '../planCuentasVista';
import { PLANTILLA_PUC, cuentaPlantilla } from '../pucPlantilla';
import {
  esCodigoPuc,
  naturalezaDe,
  nivelDe,
  siguienteCodigo,
  validarHijo,
} from '../pucJerarquia';

const RAIZ = join(__dirname, '..', '..', '..', '..');
const sembradoOriginal = readFileSync(
  join(RAIZ, 'supabase/migrations/20261021224002_puc_jerarquia.sql'),
  'utf8',
);
const migracionesNuevas = readdirSync(join(RAIZ, 'supabase/migrations'))
  .filter((nombre) => nombre.endsWith('.sql') && nombre !== '20261021224002_puc_jerarquia.sql')
  .map((nombre) => readFileSync(join(RAIZ, 'supabase/migrations', nombre), 'utf8'));
const migracion = [sembradoOriginal, ...migracionesNuevas].join('\n');
const propuesta = readFileSync(
  join(RAIZ, 'supabase/propuestas/20261021233000_puc_reclasificacion.sql'),
  'utf8',
);

describe('plantilla PUC', () => {
  it('cubre las nueve clases y el tamaño de un plan base', () => {
    expect(PLANTILLA_PUC.length).toBeGreaterThanOrEqual(160);
    expect(PLANTILLA_PUC.length).toBeLessThanOrEqual(280);
    for (const clase of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(cuentaPlantilla(clase)).toBeTruthy();
    }
    expect(PLANTILLA_PUC.some((c) => c.codigo === '1000' || c.codigo === '2000' || c.codigo === '4000')).toBe(false);
  });

  it('trae las cuentas que el decreto usa en este ERP', () => {
    expect(cuentaPlantilla('1105')?.nombre).toBe('Caja');
    expect(cuentaPlantilla('1110')?.nombre).toBe('Bancos');
    expect(cuentaPlantilla('1305')?.nombre).toBe('Clientes');
    expect(cuentaPlantilla('1435')?.nombre).toMatch(/mercanc/i);
    expect(cuentaPlantilla('1405')?.nombre).toMatch(/materias primas/i);
    expect(cuentaPlantilla('2205')?.nombre).toMatch(/proveedor/i);
    expect(cuentaPlantilla('2105')?.nombre).toMatch(/bancos nacionales/i);
    expect(cuentaPlantilla('2105')?.nombre).not.toMatch(/proveedor/i);
    expect(cuentaPlantilla('2365')?.nombre).toMatch(/retención en la fuente/i);
    expect(cuentaPlantilla('2408')?.nombre).toMatch(/ventas por pagar/i);
    expect(cuentaPlantilla('3105')?.nombre).toMatch(/capital/i);
    expect(cuentaPlantilla('4135')?.nombre).toMatch(/comercio al por mayor/i);
    expect(cuentaPlantilla('4105')?.nombre).toMatch(/agricultura/i);
    expect(cuentaPlantilla('4175')?.naturaleza).toBe('debito');
    expect(cuentaPlantilla('5105')?.nombre).toBe('Gastos de personal');
    expect(cuentaPlantilla('5135')?.nombre).toBe('Servicios');
    expect(cuentaPlantilla('5305')?.nombre).toBe('Financieros');
    expect(cuentaPlantilla('6135')?.nombre).toMatch(/comercio al por mayor/i);
    expect(cuentaPlantilla('6105')?.nombre).toMatch(/agricultura/i);
  });

  it('el hijo cuelga del nivel anterior y solo la hoja se mueve', () => {
    const codigos = new Set(PLANTILLA_PUC.map((c) => c.codigo));
    for (const cuenta of PLANTILLA_PUC) {
      expect(esCodigoPuc(cuenta.codigo)).toBe(true);
      expect(cuenta.nivel).toBe(nivelDe(cuenta.codigo));
      if (cuenta.padre) {
        expect(codigos.has(cuenta.padre)).toBe(true);
        expect(validarHijo(cuenta.padre, cuenta.codigo)).toBeNull();
      } else {
        expect(cuenta.nivel).toBe('clase');
      }
      const tieneHijos = PLANTILLA_PUC.some((otra) => otra.padre === cuenta.codigo);
      expect(cuenta.esMovimiento).toBe(!tieneHijos);
    }
    expect(cuentaPlantilla('4175')?.esMovimiento).toBe(true);
    expect(cuentaPlantilla('1')?.esMovimiento).toBe(false);
    expect(cuentaPlantilla('1305')?.requiereTercero).toBe(true);
    expect(cuentaPlantilla('1105')?.requiereTercero).toBe(false);
    expect(cuentaPlantilla('5105')?.requiereCentroCosto).toBe(true);
    expect(cuentaPlantilla('6135')?.requiereCentroCosto).toBe(true);
    expect(cuentaPlantilla('11')?.requiereCentroCosto).toBe(false);
    expect(cuentaPlantilla('15')?.nombre).toBe('Propiedades, planta y equipo');
    expect(cuentaPlantilla('4110')?.nombre).toBe('Pesca');
    expect(cuentaPlantilla('4115')?.nombre).toBe('Explotación de minas y canteras');
    expect(cuentaPlantilla('414005')?.nombre).toBe('Hotelería');
    expect(cuentaPlantilla('414015')?.nombre).toBe('Restaurantes');
    expect(cuentaPlantilla('4140')?.esMovimiento).toBe(false);
    expect(cuentaPlantilla('5235')?.nombre).toBe('Servicios');
    expect(cuentaPlantilla('5235')?.esMovimiento).toBe(false);
    expect(cuentaPlantilla('529505')?.nombre).toBe('Comisiones');
    expect(cuentaPlantilla('1599')?.nombre).toBe('Provisiones');
    expect(cuentaPlantilla('1599')?.naturaleza).toBe('credito');
    expect(cuentaPlantilla('3205')?.nombre).toMatch(/cuotas o partes de interés social/);
    expect(cuentaPlantilla('8')?.tipo).toBe('order');
    expect(cuentaPlantilla('8')?.naturaleza).toBe('debito');
    expect(cuentaPlantilla('9')?.naturaleza).toBe('credito');
    expect(cuentaPlantilla('84')?.naturaleza).toBe('credito');
    expect(cuentaPlantilla('8405')?.naturaleza).toBe('credito');
    expect(cuentaPlantilla('94')?.naturaleza).toBe('debito');
    expect(cuentaPlantilla('9405')?.naturaleza).toBe('debito');
  });
});

describe('jerarquía', () => {
  it('14350501 es auxiliar de 143505 y 143505 es subcuenta de 1435', () => {
    expect(validarHijo('1435', '143505')).toBeNull();
    expect(validarHijo('143505', '14350501')).toBeNull();
    expect(nivelDe('14350501')).toBe('auxiliar');
    expect(validarHijo('21', '2805')).toBe('prefijo');
    expect(validarHijo('1405', '1405-01')).toBe('forma');
    expect(siguienteCodigo('1435', [])).toBe('143501');
    expect(siguienteCodigo('1435', ['143501', '143505'])).toBe('143502');
    expect(siguienteCodigo('143505', ['14350501'])).toBe('14350502');
  });

  it('la naturaleza sale de la clase cuando la cuenta no la trae', () => {
    expect(naturalezaDe('4135', null)).toBe('credito');
    expect(naturalezaDe('4175', 'debito')).toBe('debito');
    expect(naturalezaDe('1105', null)).toBe('debito');
    expect(naturalezaDe('8', null)).toBe('debito');
    expect(naturalezaDe('9', null)).toBe('credito');
  });

  it('una cuenta sin padre se ve bajo el prefijo más largo', () => {
    expect(padreEnPlan('2365', null, ['2', '23', '2365'])).toBe('23');
    expect(padreEnPlan('1105', null, ['1', '11', '1105'])).toBe('11');
    const arbol = armarArbolPlan(
      [
        { account_code: '2', parent_code: null },
        { account_code: '23', parent_code: null },
        { account_code: '2365', parent_code: null },
      ],
    );
    expect(arbol.map((n) => n.cuenta.account_code)).toEqual(['2']);
    expect(arbol[0].children[0].cuenta.account_code).toBe('23');
    expect(arbol[0].children[0].children[0].cuenta.account_code).toBe('2365');
    expect(esMovimientoVisible(null, true)).toBe(false);
    expect(esMovimientoVisible(null, false)).toBe(true);
    expect(esMovimientoVisible(false, false)).toBe(false);
  });
});

describe('excel', () => {
  it('rechaza un hijo que no cuelga del padre y acepta el auxiliar', () => {
    const mal = interpretarFilas(
      [{ codigo: '2805', nombre: 'Anticipos', tipo: 'liability', padre: '21', naturaleza: 'credito' }],
      ['2', '21'],
    );
    expect(mal.filas).toEqual([]);
    expect(mal.errores.length).toBeGreaterThan(0);

    const bien = interpretarFilas(
      [
        { codigo: '143505', nombre: 'Por sede', tipo: 'asset', padre: '1435', naturaleza: 'debito', es_movimiento: 'no' },
        { codigo: '14350501', nombre: 'Sede 01', tipo: 'asset', padre: '143505', naturaleza: 'debito', es_movimiento: 'si' },
      ],
      ['1', '14', '1435'],
    );
    expect(bien.errores).toEqual([]);
    expect(bien.filas.map((f) => f.codigo)).toEqual(['143505', '14350501']);
    expect(bien.filas[0].esMovimiento).toBe(false);
    expect(bien.filas[1].esMovimiento).toBe(true);
  });

  it('conserva el padre legado y rechaza uno distinto', () => {
    const igual = interpretarFilas(
      [{ codigo: '2365', nombre: 'Retención en la fuente', tipo: 'liability', padre: '21', naturaleza: 'credito' }],
      ['21', '2365'],
      { '2365': '21' },
    );
    expect(igual.errores).toEqual([]);
    expect(igual.filas[0]?.padre).toBe('21');

    const distinto = interpretarFilas(
      [{ codigo: '2365', nombre: 'Retención en la fuente', tipo: 'liability', padre: '22', naturaleza: 'credito' }],
      ['21', '22', '2365'],
      { '2365': '21' },
    );
    expect(distinto.filas).toEqual([]);
    expect(distinto.errores.length).toBeGreaterThan(0);
  });
});

describe('archivos de la fase', () => {
  it('la migración siembra la plantilla y no reescribe organizaciones', () => {
    for (const cuenta of PLANTILLA_PUC) {
      expect(migracion).toContain(`'${cuenta.codigo}'`);
    }
    expect(migracion).toContain('puc_plantilla');
    expect(migracion).toContain('es_movimiento');
    expect(migracion).toContain('requiere_tercero');
    expect(migracion).toContain('requiere_centro_costo');
    expect(sembradoOriginal).toContain('fn_create_default_chart_of_accounts');
    expect(sembradoOriginal).not.toContain("WHEN 'MEX'");
    expect(sembradoOriginal).not.toContain('from organizations');
    expect(sembradoOriginal).not.toContain('from public.organizations');
    expect(sembradoOriginal).not.toContain('update journal_lines');
    expect(sembradoOriginal).not.toContain('update public.journal_lines');
    const consolidacion = migracionesNuevas.find((sql) => sql.includes('fn_saldos_jerarquicos'));
    expect(consolidacion).toBeTruthy();
    expect(consolidacion).not.toMatch(/update\s+(public\.)?journal_lines/i);
  });

  it('la propuesta no se aplica y trae las equivalencias', () => {
    expect(propuesta).toContain('NO APLICAR');
    expect(propuesta).toContain('4105');
    expect(propuesta).toContain('4135');
    expect(propuesta).toContain('2405');
    expect(propuesta).toContain('2408');
    expect(propuesta).toContain('2105');
    expect(propuesta).toContain('2205');
    expect(propuesta).toContain('1405');
    expect(propuesta).toContain('1435');
    expect(propuesta).toContain('6105');
    expect(propuesta).toContain('6135');
    expect(propuesta).toContain('14350501');
    expect(propuesta).not.toContain('update journal_lines');
    expect(propuesta).not.toContain('update public.journal_lines');
  });

  it('la pantalla muestra nivel, naturaleza, auxiliar y excel', () => {
    const pagina = readFileSync(
      join(RAIZ, 'src/components/finanzas/contabilidad/plan-cuentas/PlanCuentasPage.tsx'),
      'utf8',
    );
    expect(pagina).toContain('naturaleza');
    expect(pagina).toContain('xlsx');
    expect(pagina).toContain('Exportar');
    expect(pagina).toContain('Importar');
    expect(pagina).toContain('siguienteCodigo');
    expect(pagina).toContain('Solo movimiento');
  });
});
