/**
 * P5 y P8 del Contador (rondas 1 y 2): renta e IVA separados, calidades con
 * soporte, combinaciones contradictorias (bloqueo) y dudosas (advertencia),
 * cambio de periodicidad pendiente de soporte, vigencias dentro de un período,
 * decisiones que cierran la alerta y obligaciones del RTE y de no
 * contribuyentes. Los bloqueos de la base (`fn_perfil_tributario_bloqueos`)
 * deben ser los mismos que los de aquí.
 */
import fs from 'fs';
import path from 'path';
import {
  ADVERTENCIAS,
  BLOQUEOS,
  advertenciasSinAceptar,
  desdeRegimenCombinado,
  evaluarCombinacion,
  hayCambioPeriodicidad,
  type DatosCombinacion,
} from '../combinaciones';
import { analizarPeriodo, huellaVigencias, validarSolicitudDecision, vigenciasEnRango } from '../vigenciasPeriodo';
import { derivarObligaciones, obligacionesDelCorte, vencimientoDe } from '../obligaciones';
import type { VigenciaPerfil } from '../perfil';

const base: DatosCombinacion = {
  regimenRenta: 'ordinario',
  condicionIva: 'responsable',
  periodicidadIva: 'bimestral',
  granContribuyente: false,
  granContribuyenteActo: null,
  granContribuyenteDesde: null,
  autorretenedor: false,
  autorretenedorActo: null,
  autorretenedorActoFecha: null,
  autorretencionEspecial: false,
  agenteRetencionIva: false,
  agenteRetencion: false,
  responsableInc: false,
  incActividad: null,
  rteTipo: null,
  rteIngresosSuperan160000Uvt: null,
  noContribuyenteNaturaleza: null,
  motivoCambioPeriodicidad: null,
  cambioPeriodicidadHecho: null,
  cambioPeriodicidadNorma: null,
  cambioPeriodicidadFecha: null,
  responsabilidades: [],
  responsabilidadesRut: [],
};
const gran = { granContribuyente: true, granContribuyenteActo: 'Resolución 000123', granContribuyenteDesde: '2025-01-01' };
const ev = (extra: Partial<DatosCombinacion>) => evaluarCombinacion({ ...base, ...extra });

describe('combinaciones del perfil (P5)', () => {
  test('combinaciones coherentes: sin bloqueos ni advertencias', () => {
    expect(ev({ ...gran, agenteRetencionIva: true, responsabilidades: ['O-13', 'O-23'], responsabilidadesRut: ['05', '13', '23', '48'] })).toMatchObject({
      bloqueos: [],
      advertencias: [],
    });
    expect(ev({ regimenRenta: 'simple', periodicidadIva: 'anual', responsabilidades: ['O-47'] })).toMatchObject({ bloqueos: [], advertencias: [] });
    expect(ev({ regimenRenta: 'especial', rteTipo: 'calificada_art19', rteIngresosSuperan160000Uvt: false, condicionIva: 'no_responsable', periodicidadIva: 'no_aplica' })).toMatchObject({
      bloqueos: [],
      advertencias: [],
    });
  });

  test('contradicciones claras: bloqueo', () => {
    expect(ev({ regimenRenta: null, condicionIva: null }).bloqueos).toEqual(['falta_regimen_renta', 'falta_condicion_iva']);
    expect(ev({ condicionIva: 'no_responsable' }).bloqueos).toEqual(['no_responsable_con_periodicidad']);
    expect(ev({ periodicidadIva: 'no_aplica' }).bloqueos).toEqual(['responsable_sin_periodicidad']);
    expect(ev({ periodicidadIva: 'anual' }).bloqueos).toEqual(['periodicidad_anual_fuera_de_simple']);
    expect(ev({ regimenRenta: 'simple', responsabilidades: ['O-47'] }).bloqueos).toEqual(['simple_responsable_no_anual']);
    expect(ev({ responsabilidades: ['O-47'] }).bloqueos).toEqual(['fe_o47_sin_simple']);
    expect(ev({ responsabilidades: ['O-13', 'O-15', 'O-23'] }).bloqueos).toEqual(['fe_o13_sin_gran_contribuyente', 'fe_o15_sin_autorretenedor', 'fe_o23_sin_agente_iva']);
  });

  test('O-48 y O-49 no se validan como códigos de FE', () => {
    expect(ev({ responsabilidades: ['O-48'] }).bloqueos).toEqual(['fe_codigo_no_validado']);
    expect(ev({ condicionIva: 'no_responsable', periodicidadIva: 'no_aplica', responsabilidades: ['O-49'] }).bloqueos).toEqual(['fe_codigo_no_validado']);
  });

  test('R-99-PN es residual: no se combina; nunca significa «no responsable de IVA»', () => {
    expect(ev({ responsabilidades: ['R-99-PN'] })).toMatchObject({ bloqueos: [], advertencias: [] });
    expect(ev({ ...gran, responsabilidades: ['R-99-PN', 'O-13'] }).bloqueos).toEqual(['fe_r99_con_otros', 'fe_r99_con_calidades']);
    expect(ev({ regimenRenta: 'simple', periodicidadIva: 'anual', responsabilidades: ['R-99-PN'] }).bloqueos).toEqual(['fe_r99_con_calidades']);
  });

  test('SIMPLE: autorretención ordinaria o especial activa se resuelve por el art. 911 (bloqueo)', () => {
    const simple = { regimenRenta: 'simple' as const, periodicidadIva: 'anual', responsabilidades: ['O-47'] };
    expect(ev({ ...simple, autorretenedor: true, autorretenedorActo: 'Res. 1', autorretenedorActoFecha: '2024-01-01', responsabilidades: ['O-47', 'O-15'] }).bloqueos).toEqual([
      'simple_con_autorretencion',
    ]);
    expect(ev({ ...simple, autorretencionEspecial: true }).bloqueos).toEqual(['simple_con_autorretencion']);
    // Gran contribuyente en el SIMPLE: sin incompatibilidad automática.
    expect(ev({ ...simple, ...gran, responsabilidades: ['O-47', 'O-13'] }).bloqueos).toEqual([]);
    // INC en el SIMPLE: depende de la actividad.
    expect(ev({ ...simple, responsableInc: true }).bloqueos).toEqual(['inc_sin_actividad']);
    expect(ev({ ...simple, responsableInc: true, incActividad: 'restaurantes_bares' }).bloqueos).toEqual([]);
  });

  test('calidades con acto: gran contribuyente y autorretenedor exigen resolución y fecha', () => {
    expect(ev({ granContribuyente: true }).bloqueos).toEqual(['gran_contribuyente_sin_acto']);
    expect(ev({ autorretenedor: true, autorretenedorActo: 'Res. 1' }).bloqueos).toEqual(['autorretenedor_sin_acto']);
    expect(ev({ ...gran, responsabilidades: ['O-13'], periodicidadIva: 'cuatrimestral' }).advertencias).toEqual(['gran_contribuyente_no_bimestral']);
    expect(ev({ ...gran, responsabilidades: ['O-13'], periodicidadIva: 'cuatrimestral', motivoCambioPeriodicidad: 'designacion_gran_contribuyente' }).bloqueos).toEqual([
      'cambio_gran_contribuyente_no_bimestral',
    ]);
  });

  test('RTE y no contribuyentes: clasificación sustentada y parametrizada', () => {
    expect(ev({ regimenRenta: 'especial', condicionIva: 'no_responsable', periodicidadIva: 'no_aplica' })).toMatchObject({
      bloqueos: ['rte_sin_tipo'],
      advertencias: ['rte_memoria_por_confirmar'],
    });
    expect(ev({ regimenRenta: 'no_contribuyente_no_declarante', condicionIva: 'no_responsable', periodicidadIva: 'no_aplica' })).toMatchObject({
      bloqueos: ['no_contribuyente_sin_naturaleza'],
      advertencias: ['no_contribuyente_clasificacion_inicial'],
    });
    const art22 = { regimenRenta: 'no_contribuyente_no_declarante' as const, noContribuyenteNaturaleza: 'Junta de acción comunal', condicionIva: 'no_responsable' as const, periodicidadIva: 'no_aplica' };
    expect(ev({ ...art22, responsabilidadesRut: ['05'] }).bloqueos).toEqual(['rut_art22_con_renta']);
  });

  test('RUT (IN-CAC-0237): 47 y 05 excluyentes; 53 solo SIMPLE; otra obligación no implica otro régimen (B14 revisado)', () => {
    expect(ev({ regimenRenta: 'simple', periodicidadIva: 'anual', responsabilidades: ['O-47'], responsabilidadesRut: ['05', '47', '48'] }).bloqueos).toEqual(['rut_47_y_05']);
    expect(ev({ condicionIva: 'no_responsable', periodicidadIva: 'no_aplica', responsabilidadesRut: ['05', '53'] }).bloqueos).toEqual(['rut_53_sin_simple']);
    // ESAL inscrita con 05 hasta su calificación: solo advertencias.
    const esal = ev({ regimenRenta: 'especial', rteTipo: 'calificada_art19', rteIngresosSuperan160000Uvt: false, condicionIva: 'no_responsable', periodicidadIva: 'no_aplica', responsabilidadesRut: ['04', '05'] });
    expect(esal.bloqueos).toEqual([]);
    expect(esal.advertencias).toEqual(expect.arrayContaining(['rut_varios_regimenes_renta', 'rut_regimen_renta_distinto']));
    expect(ev({ responsabilidadesRut: ['49'] }).bloqueos).toEqual(['rut_iva_contradictorio']);
    expect(ev({ responsabilidadesRut: ['05', '48', '59'] }).bloqueos).toEqual(['rut_59_sin_autorretencion_especial']);
    expect(ev({ responsabilidadesRut: ['05', '48', '11'] }).advertencias).toEqual(['rut_codigo_no_vigente']);
  });

  test('aceptar advertencias', () => {
    expect(advertenciasSinAceptar(['rut_falta_codigo', 'rte_memoria_por_confirmar'], ['rut_falta_codigo'])).toEqual(['rte_memoria_por_confirmar']);
  });
});

describe('cambio de periodicidad del IVA (P8, ronda 2)', () => {
  const ant = { vigenteDesde: '2026-01-01', periodicidadIva: 'bimestral', regimenRenta: 'ordinario' as const };
  const ctx = (vigenteDesde: string) => ({ vigenteDesde, anterior: ant, siguiente: null });

  test('a mitad de año queda pendiente hasta documentar hecho, norma y fecha efectiva', () => {
    const pendiente = evaluarCombinacion({ ...base, periodicidadIva: 'cuatrimestral', motivoCambioPeriodicidad: 'otro' }, ctx('2026-07-01'));
    expect(pendiente).toMatchObject({ bloqueos: [], advertencias: ['periodicidad_cambio_pendiente_soporte'], cambioPeriodicidad: 'pendiente_soporte' });
    const documentado = evaluarCombinacion(
      {
        ...base,
        periodicidadIva: 'cuatrimestral',
        motivoCambioPeriodicidad: 'otro',
        cambioPeriodicidadHecho: 'Hecho',
        cambioPeriodicidadNorma: 'ET art. 600',
        cambioPeriodicidadFecha: '2026-07-01',
      },
      ctx('2026-07-01'),
    );
    expect(documentado).toMatchObject({ bloqueos: [], advertencias: ['periodicidad_cambio_documentado'], cambioPeriodicidad: 'documentado' });
    expect(evaluarCombinacion({ ...base, periodicidadIva: 'cuatrimestral', cambioPeriodicidadFecha: '2026-07-02' }, ctx('2026-07-01')).bloqueos).toEqual([
      'cambio_fecha_efectiva_distinta',
    ]);
    expect(evaluarCombinacion({ ...base, periodicidadIva: 'cuatrimestral' }, ctx('2027-01-01')).cambioPeriodicidad).toBe('no_aplica');
  });

  test('entrar al SIMPLE a mitad de año también pide soporte; empezar a declarar no es cambio', () => {
    expect(hayCambioPeriodicidad(ant, { vigenteDesde: '2026-05-01', periodicidadIva: 'anual', regimenRenta: 'simple' })).toBe(true);
    expect(hayCambioPeriodicidad({ ...ant, periodicidadIva: 'no_aplica' }, { vigenteDesde: '2026-07-01', periodicidadIva: 'bimestral', regimenRenta: 'ordinario' })).toBe(false);
    const r = evaluarCombinacion(base, { vigenteDesde: '2026-01-01', anterior: null, siguiente: { vigenteDesde: '2026-07-01', periodicidadIva: 'cuatrimestral', regimenRenta: 'ordinario' } });
    expect(r.advertencias).toEqual(['periodicidad_cambio_siguiente']);
  });
});

describe('migración del campo combinado (misma regla que la migración SQL)', () => {
  test('solo lo inequívoco; R-99-PN no dice nada del IVA', () => {
    expect(desdeRegimenCombinado('simple', ['O-47', 'O-48'])).toMatchObject({ regimenRenta: 'simple', condicionIva: 'responsable' });
    expect(desdeRegimenCombinado('ordinario', ['O-48', 'O-13'])).toMatchObject({ regimenRenta: null, condicionIva: 'responsable', granContribuyente: true });
    expect(desdeRegimenCombinado('no_responsable_iva', ['O-48'])).toMatchObject({ regimenRenta: null, condicionIva: null });
    expect(desdeRegimenCombinado('ordinario', ['R-99-PN']).condicionIva).toBeNull();
  });
});

describe('los bloqueos de la base son los mismos', () => {
  test('fn_perfil_tributario_bloqueos + cambio_fecha_efectiva_distinta = BLOQUEOS', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261108160500_tributario_perfil_renta_iva.sql'), 'utf8');
    const funcion = sql.slice(sql.indexOf('create or replace function public.fn_perfil_tributario_bloqueos'), sql.indexOf('create or replace function public.fn_perfil_tributario_guardar_v2'));
    const enSql = new Set(Array.from(funcion.matchAll(/select '([a-z0-9_]+)'/g)).map((m) => m[1]));
    expect(sql).toContain("'cambio_fecha_efectiva_distinta'");
    enSql.add('cambio_fecha_efectiva_distinta');
    expect([...enSql].sort()).toEqual([...BLOQUEOS].sort());
    expect(BLOQUEOS.filter((b) => (ADVERTENCIAS as readonly string[]).includes(b))).toEqual([]);
  });
});

function v(id: string, desde: string, hasta: string | null, extra: Partial<VigenciaPerfil> = {}): VigenciaPerfil {
  return {
    ...base,
    id,
    vigenteDesde: desde,
    vigenteHasta: hasta,
    periodicidadIva: 'bimestral',
    responsabilidades: [],
    responsabilidadesRut: [],
    cambioPeriodicidadEstado: 'no_aplica',
    advertenciasAceptadas: [],
    requiereRevision: false,
    regimenOrigen: null,
    actualizadoEn: '2026-07-01T00:00:00Z',
    notas: null,
    ica: [],
    ...extra,
  };
}

describe('vigencias dentro de un período (P8)', () => {
  const vigencias = [v('a', '2026-01-01', '2026-06-30'), v('b', '2026-07-01', null, { periodicidadIva: 'cuatrimestral', cambioPeriodicidadEstado: 'documentado' })];

  test('cambio de vigencia, período sin perfil y huella', () => {
    const a = analizarPeriodo(vigencias, '2026-05-01', '2026-08-31');
    expect(a).toMatchObject({ cambioDeVigencia: true, sinPerfilCompleto: false, cambioPendienteSoporte: false });
    expect(a.huella).toBe('a|2026-01-01|2026-06-30|2026-07-01T00:00:00Z;b|2026-07-01|-|2026-07-01T00:00:00Z');
    // Si cambia una vigencia, cambia la huella (la decisión registrada deja de aplicar).
    const corregida = [vigencias[0], { ...vigencias[1], actualizadoEn: '2026-08-15T00:00:00Z' }];
    expect(analizarPeriodo(corregida, '2026-05-01', '2026-08-31').huella).not.toBe(a.huella);
    expect(huellaVigencias([])).toBe('');
    expect(analizarPeriodo(vigencias, '2025-11-01', '2026-02-28').sinPerfilCompleto).toBe(true);
    expect(vigenciasEnRango(vigencias, '2025-01-01', '2025-12-31')).toEqual([]);
  });

  test('cambio de periodicidad pendiente de soporte: señalado en el IVA del período', () => {
    const pendiente = [vigencias[0], { ...vigencias[1], cambioPeriodicidadEstado: 'pendiente_soporte' as const }];
    const iva = obligacionesDelCorte(pendiente, '2026-10').filter((x) => x.clave === 'iva');
    expect(iva[0].notas).toEqual(expect.arrayContaining(['cambio_vigencia_en_periodo', 'cambio_periodicidad_pendiente']));
  });

  test('decisión: lista blanca del cuerpo', () => {
    const ok = { obligacion: 'iva:cuatrimestral', desde: '2026-05-01', hasta: '2026-08-31', decision: 'Rige la nueva', fundamento: 'Concepto', alcance: 'IVA may–ago', vigenciaAplicadaId: null };
    expect(validarSolicitudDecision(ok)).toEqual(ok);
    expect(validarSolicitudDecision({ ...ok, fundamento: 'x' })).toBeNull();
    expect(validarSolicitudDecision({ ...ok, hasta: '2026-04-30' })).toBeNull();
    expect(validarSolicitudDecision({ ...ok, obligacion: 'DROP TABLE' })).toBeNull();
    expect(validarSolicitudDecision({ ...ok, vigenciaAplicadaId: 'no-uuid' })).toBeNull();
  });
});

describe('obligaciones del RTE y de no contribuyentes (ronda 2)', () => {
  test('RTE: 110, conciliación evaluada, registro web y memoria según el umbral', () => {
    const rte = (extra: Partial<VigenciaPerfil>) =>
      derivarObligaciones(v('r', '2025-01-01', null, { regimenRenta: 'especial', condicionIva: 'no_responsable', periodicidadIva: 'no_aplica', rteTipo: 'calificada_art19', ...extra }), '2026-10');
    expect(rte({ rteIngresosSuperan160000Uvt: true }).map((x) => x.clave)).toEqual(['renta', 'conciliacion_fiscal', 'rte_registro_web', 'rte_memoria_economica', 'exogena']);
    expect(rte({ rteIngresosSuperan160000Uvt: false }).map((x) => x.clave)).not.toContain('rte_memoria_economica');
    const sinDato = rte({ rteIngresosSuperan160000Uvt: null });
    expect(sinDato.find((x) => x.clave === 'rte_memoria_economica')!.notas).toContain('rte_umbral_por_confirmar');
    expect(sinDato.find((x) => x.clave === 'conciliacion_fiscal')!.notas).toContain('conciliacion_por_evaluar');
    expect(sinDato.find((x) => x.clave === 'renta')).toMatchObject({ formulario: '110' });
    expect(rte({ rteTipo: 'cooperativa_art19_4', rteIngresosSuperan160000Uvt: false }).find((x) => x.clave === 'rte_registro_web')!.notas).toContain('rte_cooperativa_por_confirmar');
  });

  test('no contribuyente: nunca «sin obligaciones»', () => {
    const art22 = derivarObligaciones(
      v('n', '2025-01-01', null, { regimenRenta: 'no_contribuyente_no_declarante', noContribuyenteNaturaleza: 'Junta', condicionIva: 'no_responsable', periodicidadIva: 'no_aplica' }),
      '2026-10',
    );
    expect(art22.map((x) => x.clave)).toEqual(['no_declarante', 'exogena']);
    expect(art22[0].notas).toContain('clasificacion_inicial');
    expect(vencimientoDe(art22[0], '900111227', [])).toEqual({ estado: 'no_aplica' });
  });
});
