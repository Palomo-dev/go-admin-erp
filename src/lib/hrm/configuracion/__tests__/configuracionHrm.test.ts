/**
 * Lógica pura de Configuración › Recursos humanos (diseños 10.RH.1–3):
 * vigencias, período que cruza dos vigencias, presentación de los valores de
 * ley, condiciones de las reglas, delegaciones y el agente del registro.
 */
import type { FilaParametro } from '../tipos';
import { metaProgramada, periodoQueCruza, proximoDesde, tramos, vigenteEn } from '../parametrosVista';
import { CATALOGO_PARAMETROS, estadoEn, filasOtros, lectorEn, type Formato } from '../parametrosCatalogo';
import { condicionesA, condicionesDe, estadoDelegacion, mover } from '../reglasVista';
import { agenteCorto } from '../registroVista';

const fila = (code: string, value: number | null, desde: string, hasta: string | null, status: FilaParametro['status'] = 'vigente', value_json: unknown = null): FilaParametro => ({
  code,
  value,
  value_json,
  effective_from: desde,
  effective_to: hasta,
  status,
  verificacion: 'V',
  legal_source: 'norma',
  source_url: null,
  notes: null,
});

const LEY: FilaParametro[] = [
  fila('jornada_max_semanal', 44, '2025-07-15', '2026-07-14'),
  fila('jornada_max_semanal', 42, '2026-07-15', null),
  fila('divisor_hora_mensual', 220, '2025-07-15', '2026-07-14'),
  fila('divisor_hora_mensual', 210, '2026-07-15', null),
  fila('smmlv', 1750905, '2026-01-01', '2026-02-18', 'suspendido'),
  fila('smmlv', 1750905, '2026-02-19', '2026-12-31', 'transitorio'),
  fila('smmlv', null, '2027-01-01', null, 'por_confirmar'),
  fila('recargo_dominical_festivo', 0.9, '2026-07-01', '2027-06-30'),
  fila('recargo_dominical_festivo', 1, '2027-07-01', null),
  fila('ibc_tope_smmlv', 25, '2026-01-01', null),
  fila('fsp_tabla', null, '2026-01-01', null, 'vigente', [{ tarifa: 0.01 }, { tarifa: 0.02 }]),
  fila('codigo_nuevo', 3, '2026-01-01', null),
];

const F: Formato = { dinero: (n) => `$${n}`, pct: (n) => `${Math.round(n * 1000) / 10}%`, numero: (n) => String(n), hora: (h) => `${h}h` };
const leer = (id: string, fecha: string) => CATALOGO_PARAMETROS.find((c) => c.id === id)!.leer(lectorEn(LEY, fecha), F);

describe('vigencias', () => {
  test('la fila que rige en una fecha y la que viene', () => {
    expect(vigenteEn(LEY, 'jornada_max_semanal', '2026-07-14')?.value).toBe(44);
    expect(vigenteEn(LEY, 'jornada_max_semanal', '2026-07-15')?.value).toBe(42);
    expect(proximoDesde(LEY, 'recargo_dominical_festivo', '2026-11-15')?.value).toBe(1);
  });

  test('julio de 2026 se parte en 1–14 (44 h) y 15–31 (42 h)', () => {
    const t = tramos(LEY, 'jornada_max_semanal', '2026-07-01', '2026-07-31');
    expect(t.map((x) => [x.desde, x.hasta, x.dias, x.fila?.value])).toEqual([
      ['2026-07-01', '2026-07-14', 14, 44],
      ['2026-07-15', '2026-07-31', 17, 42],
    ]);
    expect(periodoQueCruza(LEY, 'jornada_max_semanal', '2026-11-15')?.length).toBe(2);
  });

  test('la meta programada no cuenta lo «por confirmar»', () => {
    expect(metaProgramada(LEY, 'recargo_dominical_festivo', '2026-11-15')).toEqual({ valor: 1, desde: '2027-07-01' });
    expect(metaProgramada(LEY, 'smmlv', '2026-11-15')).toBeNull();
  });
});

describe('presentación de los valores de ley', () => {
  test('el SMMLV transitorio se muestra con su valor y su estado', () => {
    expect(leer('smmlv', '2026-11-15')).toEqual({ clave: 'simple.dinero', params: { valor: '$1750905' } });
    expect(estadoEn(LEY, 'smmlv', '2026-11-15')).toBe('transitorio');
    expect(estadoEn(LEY, 'smmlv', '2026-01-20')).toBe('suspendido');
  });

  test('en 2027 el SMMLV está por confirmar y no tiene valor', () => {
    expect(leer('smmlv', '2027-01-15')).toBeNull();
    expect(estadoEn(LEY, 'smmlv', '2027-01-15')).toBe('por_confirmar');
    // El tope del IBC depende del SMMLV: sin él, se muestra en veces el SMMLV.
    expect(leer('ibc_tope', '2027-01-15')?.clave).toBe('vecesSmmlv');
  });

  test('jornada con divisor, tope del IBC calculado y rango del FSP', () => {
    expect(leer('jornada', '2026-11-15')).toEqual({ clave: 'jornada', params: { h: '42', divisor: '210' } });
    expect(leer('ibc_tope', '2026-11-15')?.params?.valor).toBe(`$${25 * 1750905}`);
    expect(leer('fsp', '2026-11-15')?.params).toEqual({ min: '1%', max: '2%' });
  });

  test('un código sin presentación sale en «Otros» con su valor', () => {
    const otros = filasOtros(LEY);
    expect(otros.map((o) => o.id)).toEqual(['codigo_nuevo']);
    expect(otros[0].leer(lectorEn(LEY, '2026-11-15'), F)).toEqual({ clave: 'simple.numero', params: { valor: '3' } });
  });
});

describe('reglas de aprobación', () => {
  test('condiciones ida y vuelta; las sedes son enteros; las incompletas no se guardan', () => {
    const json = { branch_ids: [3, 5], aumento_pct_gt: 10, dias_lt: 30 };
    const filas = condicionesDe(json);
    expect(condicionesA(filas)).toEqual(json);
    expect(condicionesA([...filas, { campo: 'monto', op: 'gt', valor: null }, { campo: 'area', valores: [] }])).toEqual(json);
  });

  test('estado de una delegación', () => {
    const d = { activa: true, desde: '2026-12-20', hasta: '2027-01-10' };
    expect(estadoDelegacion(d, '2026-11-15')).toBe('programada');
    expect(estadoDelegacion(d, '2026-12-25')).toBe('activa');
    expect(estadoDelegacion(d, '2027-01-11')).toBe('terminada');
    expect(estadoDelegacion({ ...d, activa: false }, '2026-12-25')).toBe('terminada');
  });

  test('mover una regla en el orden', () => {
    expect(mover(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(mover(['a', 'b', 'c'], 'a', 9)).toEqual(['b', 'c', 'a']);
  });
});

describe('registro de accesos', () => {
  test('navegador y sistema a partir del agente', () => {
    expect(agenteCorto('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36')).toBe('Chrome · Windows');
    expect(agenteCorto('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0')).toBe('Edge · Windows');
    expect(agenteCorto('Mozilla/5.0 (Linux; Android 14) GoAdmin Capacitor')).toBe('App · Android');
    expect(agenteCorto(null)).toBeNull();
  });
});
