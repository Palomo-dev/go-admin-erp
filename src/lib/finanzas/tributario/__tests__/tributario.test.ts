/**
 * Lógica del tributario (Finanzas R4-A): periodos, perfil, obligaciones con
 * vencimientos que nunca se adivinan, lectura del borrador del IVA y estado de
 * los certificados de retención.
 */
import {
  esDiaValido,
  etiquetaPeriodo,
  mesAnterior,
  periodoCerradoAl,
  periodoDeRango,
  periodoDelMes,
  periodosRecientes,
} from '../periodos';
import {
  bloqueosDeError,
  codigoErrorGuardarPerfil,
  esObjetoInexistente,
  faltantesPerfil,
  inicioPropuesto,
  leerVigencias,
  parametrosGuardarPerfil,
  validarSolicitudPerfil,
  vigenciaEn,
  type VigenciaPerfil,
} from '../perfil';
import { anioCalendario, derivarObligaciones, digitosNit, vencimientoDe, type FilaCalendario } from '../obligaciones';
import { filasCsvBorradorIva, leerBorradorIva, saldoDefinitivo } from '../borradorIva';
import { cruzarCertificados, filtrarCertificados, leerRetencionesPorTercero, porExpedir, resumirCertificados } from '../certificados';

const UUID = '6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f';
const UUID2 = '7f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f';

function vigencia(extra: Partial<VigenciaPerfil> = {}): VigenciaPerfil {
  return {
    id: UUID,
    vigenteDesde: '2026-01-01',
    vigenteHasta: null,
    regimenRenta: 'ordinario',
    condicionIva: 'responsable',
    granContribuyente: false,
    autorretenedor: false,
    agenteRetencionIva: false,
    responsabilidades: [],
    responsabilidadesRut: [],
    agenteRetencion: true,
    responsableInc: false,
    periodicidadIva: 'bimestral',
    motivoCambioPeriodicidad: null,
    advertenciasAceptadas: [],
    requiereRevision: false,
    regimenOrigen: null,
    notas: null,
    ica: [],
    ...extra,
  };
}

describe('periodos fiscales', () => {
  test('último periodo cerrado al mes de corte', () => {
    expect(periodoCerradoAl('bimestral', '2026-10')).toMatchObject({ desde: '2026-09-01', hasta: '2026-10-31', indice: 5 });
    expect(periodoCerradoAl('bimestral', '2026-11')).toMatchObject({ desde: '2026-09-01', hasta: '2026-10-31' });
    expect(periodoCerradoAl('mensual', '2026-10')).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(periodoCerradoAl('cuatrimestral', '2026-10')).toMatchObject({ desde: '2026-05-01', hasta: '2026-08-31', indice: 2 });
    expect(periodoCerradoAl('anual', '2026-10')).toMatchObject({ desde: '2025-01-01', hasta: '2025-12-31', anio: 2025 });
    expect(periodoCerradoAl('bimestral', '2026-01')).toMatchObject({ desde: '2025-11-01', hasta: '2025-12-31', anio: 2025, indice: 6 });
    expect(periodoCerradoAl('anual', '2026-12')).toMatchObject({ anio: 2026 });
    expect(periodoCerradoAl('mensual', '2026-13')).toBeNull();
  });

  test('febrero bisiesto y días válidos', () => {
    expect(periodoDelMes('bimestral', 2028, 2)).toMatchObject({ desde: '2028-01-01', hasta: '2028-02-29' });
    expect(esDiaValido('2028-02-29')).toBe(true);
    expect(esDiaValido('2026-02-29')).toBe(false);
    expect(esDiaValido('2026-13-01')).toBe(false);
    expect(esDiaValido(null)).toBe(false);
  });

  test('mes anterior, periodos recientes y rango exacto', () => {
    expect(mesAnterior('2026-11-07')).toBe('2026-10');
    expect(mesAnterior('2026-01-15')).toBe('2025-12');
    const ultimos = periodosRecientes('bimestral', '2026-10', 7);
    expect(ultimos.map((p) => p.desde)).toEqual(['2026-09-01', '2026-07-01', '2026-05-01', '2026-03-01', '2026-01-01', '2025-11-01', '2025-09-01']);
    expect(periodoDeRango('bimestral', '2026-09-01', '2026-10-31')).not.toBeNull();
    expect(periodoDeRango('bimestral', '2026-10-01', '2026-11-30')).toBeNull();
  });

  test('etiqueta con los nombres de mes del idioma', () => {
    expect(etiquetaPeriodo({ desde: '2026-09-01', hasta: '2026-10-31' }, 'es')).toBe('sept–oct 2026');
    expect(etiquetaPeriodo({ desde: '2026-10-01', hasta: '2026-10-31' }, 'es')).toBe('octubre 2026');
    expect(etiquetaPeriodo({ desde: '2025-01-01', hasta: '2025-12-31' }, 'en')).toBe('2025');
    expect(etiquetaPeriodo({ desde: '2026-10-01', hasta: '2026-10-31' }, 'en')).toBe('October 2026');
  });
});

describe('perfil tributario', () => {
  const valido = {
    vigenteDesde: '2026-01-01',
    regimenRenta: 'ordinario',
    condicionIva: 'responsable',
    responsabilidades: ['o-13', 'O-23', 'O-23'],
    responsabilidadesRut: ['05', '48', '05'],
    granContribuyente: true,
    agenteRetencion: true,
    periodicidadIva: 'bimestral',
    advertenciasAceptadas: ['fe_codigo_por_validar', 'DROP TABLE x'],
    ica: [{ municipioId: UUID, periodicidad: 'bimestral', tarifaPorMil: '9,66'.replace(',', '.') }],
    organization_id: 999,
  };

  test('lista blanca: normaliza, deduplica y descarta lo que no es del contrato', () => {
    const r = validarSolicitudPerfil(valido);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.responsabilidades).toEqual(['O-13', 'O-23']);
    expect(r.datos.responsabilidadesRut).toEqual(['05', '48']);
    expect(r.datos.advertenciasAceptadas).toEqual(['fe_codigo_por_validar']);
    expect(r.datos.ica[0].tarifaPorMil).toBe(9.66);
    expect(r.datos).toMatchObject({ regimenRenta: 'ordinario', condicionIva: 'responsable', granContribuyente: true, autorretenedor: false, responsableInc: false });
    expect(Object.keys(r.datos)).not.toContain('organization_id');
    // La organización de los parámetros es la que se pasa (la de la sesión).
    const p = parametrosGuardarPerfil(7, r.datos, ['fe_codigo_por_validar']);
    expect(p.p_organization_id).toBe(7);
    expect(p).toMatchObject({ p_regimen_renta: 'ordinario', p_condicion_iva: 'responsable', p_responsabilidades_rut: ['05', '48'], p_advertencias_aceptadas: ['fe_codigo_por_validar'] });
    expect(p.p_ica[0]).toEqual({ municipality_id: UUID, periodicidad: 'bimestral', tarifa_por_mil: 9.66, actividad: null });
    // Renta e IVA sin definir pasan la forma (la combinación los bloquea después).
    const sinDefinir = validarSolicitudPerfil({ ...valido, regimenRenta: '', condicionIva: null });
    expect(sinDefinir.ok && sinDefinir.datos.regimenRenta === null && sinDefinir.datos.condicionIva === null).toBe(true);
  });

  test('rechaza lo que no tiene la forma del contrato', () => {
    expect(validarSolicitudPerfil(null)).toEqual({ ok: false, error: 'datos_invalidos' });
    expect(validarSolicitudPerfil({ ...valido, vigenteDesde: '2026-02-30' })).toEqual({ ok: false, error: 'vigencia_invalida' });
    expect(validarSolicitudPerfil({ ...valido, regimenRenta: 'no_responsable_iva' })).toEqual({ ok: false, error: 'regimen_invalido' });
    expect(validarSolicitudPerfil({ ...valido, condicionIva: 'exento' })).toEqual({ ok: false, error: 'condicion_iva_invalida' });
    expect(validarSolicitudPerfil({ ...valido, motivoCambioPeriodicidad: 'capricho' })).toEqual({ ok: false, error: 'motivo_invalido' });
    expect(validarSolicitudPerfil({ ...valido, responsabilidades: ['DROP TABLE'] })).toEqual({ ok: false, error: 'responsabilidad_invalida' });
    expect(validarSolicitudPerfil({ ...valido, responsabilidadesRut: ['5'] })).toEqual({ ok: false, error: 'responsabilidad_rut_invalida' });
    expect(validarSolicitudPerfil({ ...valido, ica: [{ municipioId: UUID, periodicidad: 'diaria' }] })).toEqual({ ok: false, error: 'ica_invalido' });
    expect(validarSolicitudPerfil({ ...valido, ica: [{ municipioId: UUID, periodicidad: 'anual' }, { municipioId: UUID, periodicidad: 'anual' }] })).toEqual({
      ok: false,
      error: 'ica_invalido',
    });
    expect(validarSolicitudPerfil({ ...valido, id: 'no-es-uuid' })).toEqual({ ok: false, error: 'datos_invalidos' });
  });

  test('errores de la RPC → códigos; solo «inexistente» es pendiente de activar', () => {
    expect(codigoErrorGuardarPerfil({ code: 'PGRST202' })).toBe('pendiente_activar');
    expect(codigoErrorGuardarPerfil({ code: '42883' })).toBe('pendiente_activar');
    expect(codigoErrorGuardarPerfil({ code: '42501' })).toBe('sin_permiso');
    expect(codigoErrorGuardarPerfil({ code: '23505' })).toBe('vigencia_duplicada');
    expect(codigoErrorGuardarPerfil({ code: 'P0002' })).toBe('no_encontrado');
    expect(codigoErrorGuardarPerfil({ code: 'XX000' })).toBe('desconocido');
    expect(esObjetoInexistente({ code: 'PGRST205' })).toBe(true);
    expect(esObjetoInexistente({ message: "Could not find the table 'public.tax_calendar_dates' in the schema cache" })).toBe(true);
    expect(esObjetoInexistente({ code: '42501', message: 'permission denied' })).toBe(false);
  });

  test('vigencias: orden, municipio y la que cubre un día', () => {
    const vigencias = leerVigencias(
      [
        { id: UUID, vigente_desde: '2025-01-01', vigente_hasta: '2025-12-31', regimen: 'ordinario', responsabilidades: ['O-48'], agente_retencion: false, responsable_inc: false, periodicidad_iva: 'cuatrimestral', notas: null },
        { id: UUID2, vigente_desde: '2026-01-01', vigente_hasta: null, regimen: 'ordinario', responsabilidades: ['O-48', 'O-15'], agente_retencion: true, responsable_inc: false, periodicidad_iva: 'bimestral', notas: null },
      ],
      [{ profile_id: UUID2, municipality_id: 'm1', periodicidad: 'bimestral', tarifa_por_mil: '9.660', actividad: null }],
      new Map([['m1', { nombre: 'Municipio uno', departamento: 'Departamento uno' }]]),
    );
    expect(vigencias.map((v) => v.id)).toEqual([UUID2, UUID]);
    expect(vigencias[0].ica[0]).toMatchObject({ municipio: 'Municipio uno', tarifaPorMil: 9.66 });
    expect(vigenciaEn(vigencias, '2025-06-30')?.periodicidadIva).toBe('cuatrimestral');
    expect(vigenciaEn(vigencias, '2026-11-07')?.id).toBe(UUID2);
    expect(vigenciaEn(vigencias, '2024-12-31')).toBeNull();
    expect(inicioPropuesto(vigencias, '2026-11-07')).toBe('2027-01-01');
    expect(inicioPropuesto([], '2026-11-07')).toBe('2026-01-01');
    // Filas del campo combinado viejo (sin la migración): la misma regla conservadora de la migración.
    expect(vigencias[1]).toMatchObject({ regimenRenta: null, condicionIva: 'responsable', requiereRevision: true, regimenOrigen: 'ordinario' });
    expect(vigencias[0]).toMatchObject({ regimenRenta: null, condicionIva: 'responsable', autorretenedor: true, requiereRevision: true });
  });

  test('vigencias con renta e IVA separados (con la migración)', () => {
    const [v] = leerVigencias(
      [
        {
          id: UUID,
          vigente_desde: '2026-01-01',
          vigente_hasta: null,
          regimen: 'ordinario',
          regimen_renta: 'ordinario',
          condicion_iva: 'no_responsable',
          gran_contribuyente: false,
          autorretenedor: null,
          agente_retencion_iva: false,
          responsabilidades_rut: ['05', '49'],
          motivo_cambio_periodicidad: null,
          advertencias_aceptadas: ['rut_falta_codigo'],
          requiere_revision: false,
          regimen_origen: null,
          responsabilidades: ['R-99-PN'],
          agente_retencion: false,
          responsable_inc: false,
          periodicidad_iva: 'no_aplica',
          notas: null,
        },
      ],
      [],
      new Map(),
    );
    expect(v).toMatchObject({ regimenRenta: 'ordinario', condicionIva: 'no_responsable', responsabilidadesRut: ['05', '49'], requiereRevision: false, advertenciasAceptadas: ['rut_falta_codigo'] });
  });

  test('qué le falta al perfil', () => {
    expect(faltantesPerfil({ nit: null, dv: null, responsabilidadesRut: [] }, null)).toEqual(['perfil', 'nit']);
    expect(faltantesPerfil({ nit: '900111222', dv: 3, responsabilidadesRut: [] }, vigencia())).toEqual([]);
    expect(faltantesPerfil({ nit: '900111222', dv: 3, responsabilidadesRut: [] }, vigencia({ requiereRevision: true }))).toEqual(['revisar_perfil']);
    expect(faltantesPerfil({ nit: '900111222', dv: 3, responsabilidadesRut: [] }, vigencia({ periodicidadIva: 'no_aplica' }))).toEqual(['periodicidad_iva']);
  });

  test('errores de combinación de la base: código y lista de bloqueos', () => {
    expect(codigoErrorGuardarPerfil({ code: '22023', message: 'COMBINACION_CONTRADICTORIA' })).toBe('combinacion_contradictoria');
    expect(codigoErrorGuardarPerfil({ code: '22023', message: 'REGIMEN_INVALIDO' })).toBe('datos_invalidos');
    expect(bloqueosDeError({ details: 'fe_o47_sin_simple,rut_iva_contradictorio, <script>' })).toEqual(['fe_o47_sin_simple', 'rut_iva_contradictorio']);
    expect(bloqueosDeError(null)).toEqual([]);
  });
});

describe('obligaciones y vencimientos', () => {
  test('derivadas del perfil, con el último periodo cerrado', () => {
    const o = derivarObligaciones(
      vigencia({ autorretenedor: true, responsabilidades: ['O-15'], ica: [{ municipioId: 'm1', municipio: 'Municipio uno', departamento: null, periodicidad: 'anual', tarifaPorMil: null, actividad: null }] }),
      '2026-10',
    );
    expect(o.map((x) => x.id)).toEqual(['iva:bimestral', 'retencion', 'ica:m1', 'renta', 'conciliacion_fiscal', 'exogena']);
    expect(o.find((x) => x.clave === 'iva')).toMatchObject({ formulario: '300', calendario: 'iva_bimestral', fuente: 'borrador_iva', periodo: { desde: '2026-09-01' } });
    expect(o.find((x) => x.id === 'retencion')).toMatchObject({ calendario: 'retencion_fuente', notas: ['sin_autorretencion'], periodo: { desde: '2026-10-01' } });
    expect(o.find((x) => x.id === 'ica:m1')).toMatchObject({ calendario: null, municipio: 'Municipio uno', periodo: { anio: 2025 } });
  });

  test('SIMPLE: declaración anual, anticipo bimestral e IVA anual consolidado aparte; no responsable sin IVA; INC si responde', () => {
    const simple = derivarObligaciones(
      vigencia({ regimenRenta: 'simple', periodicidadIva: 'anual', responsabilidades: ['O-47'], agenteRetencion: false, responsableInc: true }),
      '2026-10',
    );
    expect(simple.map((x) => x.clave)).toEqual(['iva', 'inc', 'simple', 'simple_anticipo', 'exogena']);
    expect(simple.find((x) => x.clave === 'iva')).toMatchObject({ calendario: 'iva_anual', notas: ['iva_anual_simple'], periodo: { anio: 2025 } });
    expect(simple.find((x) => x.clave === 'simple_anticipo')).toMatchObject({ formulario: '2593', calendario: 'simple_anticipo', periodo: { desde: '2026-09-01' } });
    const noResp = derivarObligaciones(vigencia({ condicionIva: 'no_responsable', periodicidadIva: 'no_aplica', agenteRetencion: false }), '2026-10');
    expect(noResp.map((x) => x.clave)).not.toContain('iva');
    // Un dato sin definir no borra la obligación: la muestra «por revisar».
    const sinDefinir = derivarObligaciones(vigencia({ regimenRenta: null, condicionIva: null, requiereRevision: true }), '2026-10');
    expect(sinDefinir.map((x) => x.clave)).toEqual(['iva', 'retencion', 'renta', 'conciliacion_fiscal', 'exogena']);
    expect(sinDefinir.every((x) => x.notas.includes('perfil_por_revisar'))).toBe(true);
    // No contribuyente declarante: ingresos y patrimonio, sin renta ni conciliación.
    const noContribuyente = derivarObligaciones(vigencia({ regimenRenta: 'no_contribuyente_declarante', agenteRetencion: false }), '2026-10');
    expect(noContribuyente.map((x) => x.clave)).toEqual(['iva', 'ingresos_patrimonio', 'exogena']);
  });

  test('dígitos del NIT sin dígito de verificación', () => {
    expect(digitosNit('900.111.227-3', 1)).toBe(7);
    expect(digitosNit('900111205', 2)).toBe(5);
    expect(digitosNit(null, 1)).toBeNull();
    expect(digitosNit('abc', 1)).toBeNull();
  });

  test('el año de calendario de cada periodo', () => {
    expect(anioCalendario(periodoCerradoAl('bimestral', '2026-10')!)).toBe(2026);
    expect(anioCalendario(periodoCerradoAl('bimestral', '2026-12')!)).toBe(2027);
    expect(anioCalendario(periodoCerradoAl('anual', '2026-10')!)).toBe(2026);
  });

  test('vencimiento: solo del calendario cargado, nunca supuesto', () => {
    const iva = derivarObligaciones(vigencia(), '2026-10').find((x) => x.clave === 'iva')!;
    const fila = (extra: Partial<FilaCalendario>): FilaCalendario => ({
      anio: 2026,
      obligacion: 'iva_bimestral',
      periodo: 5,
      cuota: 1,
      cantidad_digitos: 1,
      digitos_desde: 7,
      digitos_hasta: 7,
      fecha_vencimiento: '2026-11-20',
      norma: 'Decreto de calendario 2026',
      ...extra,
    });
    expect(vencimientoDe(iva, '900111227', null)).toEqual({ estado: 'pendiente_activar' });
    expect(vencimientoDe(iva, '900111227', [])).toEqual({ estado: 'sin_cargar', anio: 2026 });
    expect(vencimientoDe(iva, null, [fila({})])).toEqual({ estado: 'sin_nit' });
    expect(vencimientoDe(iva, '900111221', [fila({})])).toEqual({ estado: 'no_encontrado', anio: 2026 });
    expect(vencimientoDe(iva, '900111227-3', [fila({}), fila({ digitos_desde: 1, digitos_hasta: 1, fecha_vencimiento: '2026-11-10' })])).toEqual({
      estado: 'fecha',
      fecha: '2026-11-20',
      norma: 'Decreto de calendario 2026',
      cuotas: 1,
    });
    const ica = derivarObligaciones(vigencia({ ica: [{ municipioId: 'm', municipio: null, departamento: null, periodicidad: 'bimestral', tarifaPorMil: null, actividad: null }] }), '2026-10').find((x) => x.clave === 'ica')!;
    expect(vencimientoDe(ica, '900111227', [fila({})])).toEqual({ estado: 'municipal' });
  });
});

describe('borrador del IVA', () => {
  const crudo = {
    periodo: { desde: '2026-09-01', hasta: '2026-10-31' },
    renglones: [
      { lado: 'generado', clave: 'gravadas', tarifa: 19, base: 88404.2, valor: 16796.8, estado: 'ok', asientos: [3, 4], total_asientos: 2, total_documentos: 2 },
      { lado: 'generado', clave: 'tarifa_sin_identificar', tarifa: null, base: 3872956, valor: 618372, estado: 'revisar', asientos: [5], total_asientos: 73, total_documentos: 73 },
      { lado: 'generado', clave: 'inventada', valor: 1 },
      { lado: 'otros', clave: 'otros_movimientos', base: null, valor: -500, estado: 'revisar', asientos: [9, 'x'], total_asientos: 1, total_documentos: 0 },
    ],
    totales: { iva_generado: 635168.8, iva_descontable: 0, otros_movimientos: -500, saldo: 635168.8, documentos: 75, por_revisar: 2 },
    cuentas: ['24080501'],
  };

  test('lee el jsonb de la función y descarta lo que no entiende', () => {
    const b = leerBorradorIva(crudo);
    expect(b.renglones).toHaveLength(3);
    expect(b.renglones[0]).toMatchObject({ lado: 'generado', clave: 'gravadas', tarifa: 19, estado: 'ok', asientos: [3, 4] });
    expect(b.renglones[2].asientos).toEqual([9]);
    expect(b).toMatchObject({ desde: '2026-09-01', saldo: 635168.8, porRevisar: 2, cuentas: ['24080501'] });
    expect(saldoDefinitivo(b)).toBe(false);
    expect(leerBorradorIva(null)).toMatchObject({ renglones: [], saldo: 0 });
  });

  test('CSV: importes sin formato y el saldo marcado si hay que revisar', () => {
    const filas = filasCsvBorradorIva(leerBorradorIva(crudo), {
      encabezado: ['Concepto', 'Base', 'Valor', 'Estado', 'Asientos'],
      etiqueta: (r) => r.clave,
      estado: (e) => e,
      generado: 'IVA generado',
      descontable: 'IVA descontable',
      saldo: 'Saldo a pagar',
    });
    expect(filas[1]).toEqual(['gravadas', 88404.2, 16796.8, 'ok', '3 4']);
    expect(filas[filas.length - 1]).toEqual(['Saldo a pagar', null, 635168.8, 'revisar', null]);
  });
});

describe('certificados de retención', () => {
  const datos = {
    por_proveedor: [
      { proveedor_id: 1, proveedor: 'Proveedor uno', nit: '900111222-3', facturas: 3, retefuente: 300000, reteiva: 0, reteica: 0, retenido: 300000 },
      { proveedor_id: 2, proveedor: 'Proveedor dos', nit: '800333444-5', facturas: 1, retefuente: 200000, reteiva: 40000, reteica: 0, retenido: 240000 },
      { proveedor_id: 3, proveedor: 'Asesoría jurídica', nit: ' ', facturas: 1, retefuente: 220000, reteiva: 0, reteica: 0, retenido: 220000 },
      { proveedor_id: 4, proveedor: 'Proveedor cuatro', nit: '901000000', facturas: 1, retefuente: 50000, reteiva: 0, reteica: 0, retenido: 50000 },
      { proveedor: 'sin id' },
    ],
  };
  const periodo = { desde: '2025-01-01', hasta: '2025-12-31' };
  const certs = [
    { id: 'c1', proveedorId: 1, numero: 'CR-2026-1', desde: '2025-01-01', hasta: '2025-12-31', totalRetenido: 300000, expedidoEn: '2026-02-01T10:00:00Z' },
    { id: 'c4', proveedorId: 4, numero: 'CR-2026-2', desde: '2025-01-01', hasta: '2025-12-31', totalRetenido: 30000, expedidoEn: '2026-02-01T10:00:00Z' },
    { id: 'otro', proveedorId: 2, numero: 'CR-2026-3', desde: '2025-01-01', hasta: '2025-06-30', totalRetenido: 240000, expedidoEn: null },
  ];

  test('estado por tercero: expedido, cambió, sin expedir, falta tercero', () => {
    const filas = cruzarCertificados(leerRetencionesPorTercero(datos), certs, periodo);
    expect(filas.map((f) => [f.proveedorId, f.estado])).toEqual([
      [1, 'expedido'],
      [2, 'sin_expedir'],
      [3, 'falta_tercero'],
      [4, 'desactualizado'],
    ]);
    expect(resumirCertificados(filas)).toEqual({ terceros: 4, retenido: 810000, expedidos: 1, pendientes: 2, faltaTercero: 1 });
    expect(porExpedir(filas).map((f) => f.proveedorId)).toEqual([2, 4]);
  });

  test('búsqueda por nombre sin tildes o por NIT', () => {
    const filas = cruzarCertificados(leerRetencionesPorTercero(datos), [], periodo);
    expect(filtrarCertificados(filas, 'juridica').map((f) => f.proveedorId)).toEqual([3]);
    expect(filtrarCertificados(filas, '800333').map((f) => f.proveedorId)).toEqual([2]);
    expect(filtrarCertificados(filas, '  ')).toHaveLength(4);
  });
});
