/**
 * P5 y P8 del Contador: renta e IVA separados, combinaciones contradictorias
 * (bloqueo) y dudosas (advertencia), cambio de periodicidad a mitad de año y
 * vigencias dentro de un periodo. Los bloqueos de la base
 * (`fn_perfil_tributario_bloqueos`) deben ser los mismos que los de aquí.
 */
import fs from 'fs';
import path from 'path';
import {
  ADVERTENCIAS,
  BLOQUEOS,
  advertenciasSinAceptar,
  cambioPeriodicidad,
  desdeRegimenCombinado,
  evaluarCombinacion,
  type DatosCombinacion,
} from '../combinaciones';
import { analizarPeriodo, vigenciasEnRango } from '../vigenciasPeriodo';
import { obligacionesDelCorte } from '../obligaciones';
import type { VigenciaPerfil } from '../perfil';

const base: DatosCombinacion = {
  regimenRenta: 'ordinario',
  condicionIva: 'responsable',
  periodicidadIva: 'bimestral',
  granContribuyente: false,
  autorretenedor: false,
  agenteRetencionIva: false,
  agenteRetencion: false,
  responsableInc: false,
  responsabilidades: [],
  responsabilidadesRut: [],
};
const ev = (extra: Partial<DatosCombinacion>) => evaluarCombinacion({ ...base, ...extra });

describe('combinaciones del perfil (P5)', () => {
  test('una combinación coherente no tiene bloqueos ni advertencias', () => {
    expect(ev({ granContribuyente: true, agenteRetencionIva: true, responsabilidades: ['O-13', 'O-23'], responsabilidadesRut: ['05', '13', '23', '48'] })).toEqual({
      bloqueos: [],
      advertencias: [],
    });
    expect(ev({ regimenRenta: 'simple', periodicidadIva: 'anual', responsabilidades: ['O-47'] })).toEqual({ bloqueos: [], advertencias: [] });
    expect(ev({ regimenRenta: 'especial', condicionIva: 'no_responsable', periodicidadIva: 'no_aplica' })).toEqual({ bloqueos: [], advertencias: [] });
  });

  test('renta e IVA son independientes: SIMPLE no responsable, ESAL responsable y no contribuyente responsable son válidos', () => {
    expect(ev({ regimenRenta: 'simple', condicionIva: 'no_responsable', periodicidadIva: 'no_aplica', responsabilidades: ['O-47'] }).bloqueos).toEqual([]);
    expect(ev({ regimenRenta: 'especial' }).bloqueos).toEqual([]);
    expect(ev({ regimenRenta: 'no_contribuyente_declarante' }).bloqueos).toEqual([]);
  });

  test('contradicciones claras: bloqueo', () => {
    expect(ev({ regimenRenta: null, condicionIva: null }).bloqueos).toEqual(['falta_regimen_renta', 'falta_condicion_iva']);
    expect(ev({ condicionIva: 'no_responsable' }).bloqueos).toEqual(['no_responsable_con_periodicidad']);
    expect(ev({ periodicidadIva: 'no_aplica' }).bloqueos).toEqual(['responsable_sin_periodicidad']);
    expect(ev({ periodicidadIva: 'anual' }).bloqueos).toEqual(['periodicidad_anual_fuera_de_simple']);
    expect(ev({ regimenRenta: 'simple', responsabilidades: ['O-47'] }).bloqueos).toEqual(['simple_responsable_no_anual']);
    expect(ev({ responsabilidades: ['O-48', 'O-49'] }).bloqueos).toEqual(['fe_o48_y_o49', 'fe_o49_responsable']);
    expect(ev({ condicionIva: 'no_responsable', periodicidadIva: 'no_aplica', responsabilidades: ['O-48'] }).bloqueos).toEqual(['fe_o48_no_responsable']);
    expect(ev({ responsabilidades: ['O-47'] }).bloqueos).toEqual(['fe_o47_sin_simple']);
    expect(ev({ responsabilidades: ['O-13', 'O-15', 'O-23'] }).bloqueos).toEqual(['fe_o13_sin_gran_contribuyente', 'fe_o15_sin_autorretenedor', 'fe_o23_sin_agente_iva']);
    expect(ev({ regimenRenta: 'simple', periodicidadIva: 'anual', responsabilidades: ['O-47'], responsabilidadesRut: ['05', '47'] }).bloqueos).toEqual([
      'rut_varios_regimenes_renta',
      'rut_regimen_renta_contradictorio',
    ]);
    expect(ev({ responsabilidadesRut: ['49'] }).bloqueos).toEqual(['rut_iva_contradictorio']);
    expect(ev({ responsabilidadesRut: ['48', '53'] }).bloqueos).toEqual(['rut_iva_contradictorio']);
    expect(ev({ responsabilidadesRut: ['05', '48', '13', '15', '23', '07', '33'] }).bloqueos).toEqual([
      'rut_13_sin_gran_contribuyente',
      'rut_15_sin_autorretenedor',
      'rut_23_sin_agente_iva',
      'rut_07_sin_agente_retencion',
      'rut_33_sin_inc',
    ]);
  });

  test('R-99-PN no equivale a «no responsable de IVA»: con responsable no bloquea', () => {
    expect(ev({ responsabilidades: ['R-99-PN'] })).toEqual({ bloqueos: [], advertencias: [] });
    expect(ev({ granContribuyente: true, responsabilidades: ['R-99-PN', 'O-13'] }).advertencias).toEqual(['fe_r99_con_otros']);
  });

  test('lo dudoso es advertencia (pregunta al Contador), no bloqueo', () => {
    const simple = { regimenRenta: 'simple' as const, periodicidadIva: 'anual', responsabilidades: ['O-47'] };
    expect(ev({ ...simple, autorretenedor: true, responsabilidades: ['O-47', 'O-15'] })).toEqual({ bloqueos: [], advertencias: ['simple_con_autorretenedor'] });
    expect(ev({ ...simple, granContribuyente: true, responsabilidades: ['O-47', 'O-13'] }).advertencias).toEqual(['simple_con_gran_contribuyente']);
    expect(ev({ ...simple, responsableInc: true }).advertencias).toEqual(['simple_con_inc']);
    expect(ev({ ...simple, responsabilidades: [] }).advertencias).toEqual(['simple_sin_fe_o47']);
    expect(ev({ granContribuyente: true, autorretenedor: true, agenteRetencionIva: true }).advertencias).toEqual([
      'gran_contribuyente_sin_fe_o13',
      'autorretenedor_sin_fe_o15',
      'agente_iva_sin_fe_o23',
    ]);
    expect(ev({ responsabilidades: ['O-48'] }).advertencias).toEqual(['fe_codigo_por_validar']);
    expect(ev({ responsabilidadesRut: ['48'] }).advertencias).toEqual(['rut_falta_codigo']);
    expect(ev({ responsabilidadesRut: ['05', '48', '11'] }).advertencias).toEqual(['rut_codigo_no_vigente']);
  });

  test('aceptar advertencias', () => {
    expect(advertenciasSinAceptar(['simple_con_inc', 'fe_codigo_por_validar'], ['simple_con_inc'])).toEqual(['fe_codigo_por_validar']);
    expect(advertenciasSinAceptar([], [])).toEqual([]);
  });
});

describe('periodicidad del IVA por año (P8)', () => {
  const ant = { vigenteDesde: '2026-01-01', periodicidadIva: 'bimestral', regimenRenta: 'ordinario' as const };
  const ctx = (vigenteDesde: string, motivo: 'otro' | null = null) => ({ vigenteDesde, motivoCambioPeriodicidad: motivo, anterior: ant, siguiente: null });

  test('cambio a mitad de año: sin motivo bloquea, con motivo advierte; el 1 de enero no cuenta', () => {
    expect(evaluarCombinacion({ ...base, periodicidadIva: 'cuatrimestral' }, ctx('2026-07-01')).bloqueos).toEqual(['periodicidad_cambio_sin_motivo']);
    expect(evaluarCombinacion({ ...base, periodicidadIva: 'cuatrimestral' }, ctx('2026-07-01', 'otro'))).toEqual({
      bloqueos: [],
      advertencias: ['periodicidad_cambio_a_mitad_de_anio'],
    });
    expect(evaluarCombinacion({ ...base, periodicidadIva: 'cuatrimestral' }, ctx('2027-01-01'))).toEqual({ bloqueos: [], advertencias: [] });
  });

  test('inicio como responsable (desde «no aplica») no es cambio; entrar al SIMPLE es tratamiento propio', () => {
    expect(cambioPeriodicidad({ ...ant, periodicidadIva: 'no_aplica' }, { vigenteDesde: '2026-07-01', periodicidadIva: 'bimestral', regimenRenta: 'ordinario' })).toBe('ninguno');
    expect(cambioPeriodicidad(ant, { vigenteDesde: '2026-05-01', periodicidadIva: 'anual', regimenRenta: 'simple' })).toBe('por_simple');
    expect(
      evaluarCombinacion({ ...base, regimenRenta: 'simple', periodicidadIva: 'anual', responsabilidades: ['O-47'] }, ctx('2026-05-01')).advertencias,
    ).toEqual(['periodicidad_cambio_por_simple']);
  });

  test('la vigencia siguiente que cambia a mitad de año se advierte al editar la anterior', () => {
    const r = evaluarCombinacion(base, {
      vigenteDesde: '2026-01-01',
      motivoCambioPeriodicidad: null,
      anterior: null,
      siguiente: { vigenteDesde: '2026-07-01', periodicidadIva: 'cuatrimestral', regimenRenta: 'ordinario' },
    });
    expect(r).toEqual({ bloqueos: [], advertencias: ['periodicidad_cambio_siguiente'] });
  });
});

describe('migración del campo combinado (misma regla que la migración SQL)', () => {
  test('solo lo inequívoco; lo demás queda sin definir', () => {
    expect(desdeRegimenCombinado('simple', ['O-47', 'O-48'])).toMatchObject({ regimenRenta: 'simple', condicionIva: 'responsable' });
    expect(desdeRegimenCombinado('ordinario', ['O-48', 'O-13'])).toMatchObject({ regimenRenta: null, condicionIva: 'responsable', granContribuyente: true });
    expect(desdeRegimenCombinado('no_responsable_iva', ['R-99-PN'])).toMatchObject({ regimenRenta: null, condicionIva: 'no_responsable' });
    expect(desdeRegimenCombinado('no_responsable_iva', ['O-48'])).toMatchObject({ regimenRenta: null, condicionIva: null });
    expect(desdeRegimenCombinado('especial', [])).toMatchObject({ regimenRenta: 'especial', condicionIva: null, granContribuyente: null });
    // R-99-PN solo no dice nada del IVA.
    expect(desdeRegimenCombinado('ordinario', ['R-99-PN']).condicionIva).toBeNull();
  });
});

describe('los bloqueos de la base son los mismos', () => {
  test('fn_perfil_tributario_bloqueos + periodicidad_cambio_sin_motivo = BLOQUEOS', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261108160500_tributario_perfil_renta_iva.sql'), 'utf8');
    const funcion = sql.slice(sql.indexOf('create or replace function public.fn_perfil_tributario_bloqueos'), sql.indexOf('create or replace function public.fn_perfil_tributario_guardar_v2'));
    const enSql = new Set(Array.from(funcion.matchAll(/select '([a-z0-9_]+)'/g)).map((m) => m[1]));
    expect(sql).toContain("'periodicidad_cambio_sin_motivo'");
    enSql.add('periodicidad_cambio_sin_motivo');
    expect([...enSql].sort()).toEqual([...BLOQUEOS].sort());
    // Ningún código es a la vez bloqueo y advertencia.
    expect(BLOQUEOS.filter((b) => (ADVERTENCIAS as readonly string[]).includes(b))).toEqual([]);
  });
});

function v(id: string, desde: string, hasta: string | null, extra: Partial<VigenciaPerfil> = {}): VigenciaPerfil {
  return {
    id,
    vigenteDesde: desde,
    vigenteHasta: hasta,
    regimenRenta: 'ordinario',
    condicionIva: 'responsable',
    granContribuyente: false,
    autorretenedor: false,
    agenteRetencionIva: false,
    agenteRetencion: false,
    responsableInc: false,
    periodicidadIva: 'bimestral',
    responsabilidades: [],
    responsabilidadesRut: [],
    motivoCambioPeriodicidad: null,
    advertenciasAceptadas: [],
    requiereRevision: false,
    regimenOrigen: null,
    notas: null,
    ica: [],
    ...extra,
  };
}

describe('vigencias dentro de un periodo (P8)', () => {
  const vigencias = [v('a', '2026-01-01', '2026-06-30'), v('b', '2026-07-01', null, { periodicidadIva: 'cuatrimestral', motivoCambioPeriodicidad: 'otro' })];

  test('dos vigencias en el cuatrimestre may–ago: cambio de vigencia; jul–ago: una sola', () => {
    expect(analizarPeriodo(vigencias, '2026-05-01', '2026-08-31')).toMatchObject({ cambioDeVigencia: true, sinPerfilCompleto: false });
    expect(analizarPeriodo(vigencias, '2026-05-01', '2026-08-31').vigencias.map((x) => x.id)).toEqual(['a', 'b']);
    expect(analizarPeriodo(vigencias, '2026-07-01', '2026-08-31')).toMatchObject({ cambioDeVigencia: false, sinPerfilCompleto: false });
    expect(vigenciasEnRango(vigencias, '2025-01-01', '2025-12-31')).toEqual([]);
  });

  test('parte del periodo sin perfil', () => {
    expect(analizarPeriodo(vigencias, '2025-11-01', '2026-02-28')).toMatchObject({ cambioDeVigencia: false, sinPerfilCompleto: true });
    expect(analizarPeriodo([], '2026-01-01', '2026-02-28')).toMatchObject({ cambioDeVigencia: false, sinPerfilCompleto: true, vigencias: [] });
    // Un hueco entre vigencias también cuenta.
    expect(analizarPeriodo([v('a', '2026-01-01', '2026-01-31'), v('b', '2026-02-15', null)], '2026-01-01', '2026-02-28').sinPerfilCompleto).toBe(true);
  });

  test('obligaciones del corte: no se usa solo el perfil del último día', () => {
    const o = obligacionesDelCorte(vigencias, '2026-10');
    const iva = o.filter((x) => x.clave === 'iva');
    expect(iva.map((x) => `${x.periodo.desde}|${x.notas.join(',')}`)).toEqual(['2026-05-01|cambio_vigencia_en_periodo']);
    // La renta de 2025 no tenía perfil: se muestra igual, señalada.
    expect(o.find((x) => x.clave === 'renta')!.notas).toContain('periodo_sin_perfil_completo');
    // Si la vigencia nueva deja de declarar IVA: con corte octubre no hay bimestre de IVA cerrado bajo la vieja;
    // con corte agosto, el bimestre jul–ago de la vieja sí aparece (la vigencia de hoy no lo borra).
    const dejaDeDeclarar = [v('a', '2026-01-01', '2026-08-31'), v('b', '2026-09-01', null, { condicionIva: 'no_responsable', periodicidadIva: 'no_aplica' })];
    const o2 = obligacionesDelCorte(dejaDeDeclarar, '2026-10').filter((x) => x.clave === 'iva');
    expect(o2.map((x) => x.periodo.desde)).toEqual([]);
    const o3 = obligacionesDelCorte(dejaDeDeclarar, '2026-08').filter((x) => x.clave === 'iva');
    expect(o3.map((x) => x.periodo.desde)).toEqual(['2026-07-01']);
  });
});
