/**
 * Ronda del Contador del 2026-11-16 (docs/contador/RESPUESTAS-CONTADOR-NOMINA-2026-11-16.md):
 * lo que no cabe en los 20 casos de motorNominaHrm.test.ts.
 * - Los insumos nuevos llegan al motor (P2, P13 y P20).
 * - La tabla del fondo de solidaridad de la Ley 2381, art. 20 (P11), con su tramo del
 *   2,8 % que incluye los 20 SMMLV exactos.
 */
import { calcularColilla, type ResultadoColilla } from '@/lib/hrm/nomina/motorNomina';
import { entradaDesdeInsumos, type EmpleadoInsumo, type InsumosNomina } from '@/lib/hrm/nomina/insumos';
import { CATALOGO_BASE } from '@/lib/hrm/nomina/conceptos';
import type { ParametrosNomina } from '@/lib/hrm/nomina/base';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { entradaBase, salarioFijo, PARAMETROS_2026, SMMLV_2026 } from './nominaFixture';

const valor = (r: ResultadoColilla, codigo: string) => r.items.filter((i) => i.codigo === codigo).reduce((s, i) => s + i.valor, 0);

/** La tabla de 2027 tal como quedó en la migración hrm_f3_05_nomina_ronda_contador. */
function tablaFsp2027(): unknown {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const archivo = readdirSync(dir).find((f) => f.endsWith('_hrm_f3_05_nomina_ronda_contador.sql'));
  expect(archivo).toBeDefined();
  const sql = readFileSync(join(dir, archivo!), 'utf8');
  const m = sql.match(/value_json = '(\[\{"tarifa": 0\.015[^']+)'::jsonb/);
  expect(m).not.toBeNull();
  return JSON.parse(m![1]);
}

describe('fondo de solidaridad desde el 1-abr-2027 (Ley 2381, art. 20; P11)', () => {
  // El SMMLV de 2027 aún no existe: estas pruebas usan el de 2026 solo para ubicar los tramos.
  const parametros: ParametrosNomina = {
    ...PARAMETROS_2026,
    fsp_tabla: [...PARAMETROS_2026.fsp_tabla, { desde: '2027-04-01', hasta: null, valor: null, valor_json: tablaFsp2027() }],
    smmlv: [{ desde: '2026-01-01', hasta: null, valor: SMMLV_2026 }],
    auxilio_transporte: [{ desde: '2026-01-01', hasta: null, valor: 249_095 }],
    uvt: [{ desde: '2026-01-01', hasta: null, valor: 52_374 }],
  };
  const abril = (salario: number) =>
    calcularColilla(
      entradaBase({
        parametros,
        periodo: { desde: '2027-04-01', hasta: '2027-04-30', tipo: 'ordinaria' },
        salario: salarioFijo(salario, '2027-04-01', '2027-04-30'),
      })
    );

  test.each([
    [4, 0.015],
    [6.99, 0.015],
    [7, 0.018],
    [11, 0.025],
    [19, 0.028],
    [20, 0.028], // «menor o igual a veinte (20) smlmv»
    [21, 0.03],
  ])('%p SMMLV → %p', (smmlv, tarifa) => {
    const r = abril(Math.round(smmlv * SMMLV_2026));
    expect(r.items.find((i) => i.codigo === 'FONDO_SOLIDARIDAD')?.tasa).toBe(tarifa);
  });

  test('por debajo de 4 SMMLV no hay aporte', () => {
    expect(valor(abril(4 * SMMLV_2026 - 1), 'FONDO_SOLIDARIDAD')).toBe(0);
  });
});

describe('insumos nuevos de la base al motor', () => {
  const ins = {
    periodo: { id: 'p', desde: '2026-07-01', hasta: '2026-07-31', tipo: 'ordinaria' },
    nomina_habilitada: false,
    parametros: PARAMETROS_2026,
    conceptos: CATALOGO_BASE,
    exoneracion_114_1: true,
    jornada: null,
    pendientes: { novedades_nomina: 0, novedades_asistencia: 0, dias_no_listos: 0 },
    empleados: [],
    excluidos: [],
  } as unknown as InsumosNomina;
  const emp = {
    vinculo_id: 'v',
    persona_id: null,
    nombre: null,
    sede_id: 1,
    ingreso: '2025-01-01',
    retiro: null,
    remoto: false,
    jornada_semanal: '24.0',
    moneda: 'COP',
    periodo_salario: 'monthly',
    salario: [{ desde: '2026-07-01', hasta: '2026-07-31', valor: 1_750_905 }],
    clase_arl: 1,
    ajustes: {
      integral: false,
      procedimiento: 1,
      porcentaje_fijo: null,
      dependientes: false,
      medicina_prepagada: 0,
      intereses_vivienda: 0,
      aportes_voluntarios: 0,
      pension_en_licencia: 'compartida',
    },
    dependientes_registrados: 0,
    novedades: [],
    comisiones: [],
    prestamos: [],
    embargos: [{ id: 'g', tipo: 'alimentos', recibido: '2026-01-01', modo: 'porcentaje', valor: 0.3, saldo: null, incluye_prestaciones: true }],
    mes_previo: null,
    anterior: null,
    ibc_anterior: '1900000',
    variables_12m: { desde: '2025-07-01', hasta: '2026-06-30', valor: 0 },
    acumulado: null,
  } as unknown as EmpleadoInsumo;

  test('jornada pactada, pensión en licencia, último IBC y embargo con prestaciones', () => {
    const e = entradaDesdeInsumos(ins, emp);
    expect(e.vinculo.jornada_semanal).toBe(24);
    expect(e.vinculo.pension_en_licencia).toBe('compartida');
    expect(e.ibc_anterior).toBe(1_900_000);
    expect(e.embargos[0].incluye_prestaciones).toBe(true);
  });

  test('sin datos, los valores por defecto: pensión en licencia «no» y sin último IBC', () => {
    const e = entradaDesdeInsumos(ins, { ...emp, ajustes: null, ibc_anterior: null, jornada_semanal: null, embargos: [] } as EmpleadoInsumo);
    expect(e.vinculo.pension_en_licencia).toBe('no');
    expect(e.ibc_anterior).toBeNull();
    expect(e.vinculo.jornada_semanal).toBeNull();
  });

  test('el último IBC es la base de la salud del empleador en la licencia (P13)', () => {
    // Último IBC 1.900.000 × 10 / 30 = 633.333,3 → 633.334 × 8,5 % = 53.833,4 → 53.833.
    const r = calcularColilla(
      entradaBase({
        exoneracion_114_1: false,
        ibc_anterior: 1_900_000,
        ausencias: [{ id: 'l', clase: 'licencia_no_remunerada', pagada: false, desde: '2026-07-01', hasta: '2026-07-10', tramos: [] }],
      })
    );
    expect(r.bases.ibc_licencia).toBe(633_334);
    expect(r.items.find((i) => i.codigo === 'SALUD_EMPLEADOR')?.detalle).toMatchObject({ licencia: 53_833 });
  });
});
