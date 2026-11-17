/**
 * Reglas de presentación de Nómina (Figma 20.16–20.25): estados del período, qué
 * acción se ofrece en cada estado y rol (con la nómina apagada o encendida), cómo
 * se agrupa y se lee la colilla y las filas de préstamos y embargos. Datos inventados.
 */
import {
  CONCEPTOS_AJUSTE,
  accionesPeriodo,
  agruparItems,
  claveAlerta,
  claveBloqueo,
  claveError,
  claveNombrePeriodo,
  contarAlertas,
  estaCerrado,
  estadoPeriodo,
  filaDeEmbargo,
  filaDePrestamo,
  filtrarDeducciones,
  filtrarPeriodos,
  proximoPago,
  puntosRevision,
  textoLinea,
  siguientePeriodo,
  suma,
  totalesDeducciones,
  validarAjuste,
  variacionNeto,
  FILTROS_DEDUCCIONES_VACIOS,
  FILTROS_PERIODOS_VACIOS,
  SIN_PERMISOS,
  TONO_ESTADO_PERIODO,
  type ContextoAcciones,
  type FilaPeriodo,
  type PermisosNomina,
} from '../nominaLogica';

const RRHH: PermisosNomina = { ver: true, procesar: true, cerrar: false, pagar: false, salario: true };
const GERENCIA: PermisosNomina = { ver: true, procesar: false, cerrar: true, pagar: true, salario: false };
const SOLO_VER: PermisosNomina = { ...SIN_PERMISOS, ver: true };

function ctx(p: Partial<ContextoAcciones>): ContextoAcciones {
  return { estado: 'abierto', permisos: RRHH, habilitada: true, bloqueos: 0, conCalculo: false, revisionAprobada: true, ...p };
}

describe('estados del período', () => {
  test('cada estado de la base tiene su estado visible (ADR-003 §1)', () => {
    expect(estadoPeriodo('open')).toBe('abierto');
    expect(estadoPeriodo('calculated')).toBe('preliquidado');
    expect(estadoPeriodo('reviewing')).toBe('en_revision');
    expect(estadoPeriodo('approved')).toBe('cerrado');
    expect(estadoPeriodo('paid')).toBe('pagado');
    expect(estadoPeriodo('closed')).toBe('contabilizado');
    expect(estadoPeriodo('cualquier_cosa')).toBe('abierto');
    expect(estadoPeriodo(null)).toBe('abierto');
  });

  test('cerrado, pagado y contabilizado ya no se editan', () => {
    expect(estaCerrado('cerrado')).toBe(true);
    expect(estaCerrado('pagado')).toBe(true);
    expect(estaCerrado('contabilizado')).toBe(true);
    expect(estaCerrado('preliquidado')).toBe(false);
    expect(estaCerrado('en_revision')).toBe(false);
  });

  test('los tonos son los de la adenda de SISTEMA-BADGES', () => {
    expect(TONO_ESTADO_PERIODO.abierto).toBe('neutro');
    expect(TONO_ESTADO_PERIODO.preliquidado).toBe('informacion');
    expect(TONO_ESTADO_PERIODO.en_revision).toBe('advertencia');
    expect(TONO_ESTADO_PERIODO.cerrado).toBe('marca');
    expect(TONO_ESTADO_PERIODO.pagado).toBe('exito');
    expect(TONO_ESTADO_PERIODO.contabilizado).toBe('exito');
  });
});

describe('acciones por estado y rol', () => {
  test('abierto: RR. HH. preliquida y puede eliminar si nunca se calculó', () => {
    const a = accionesPeriodo(ctx({ estado: 'abierto' }));
    expect(a.preliquidar).toEqual({ visible: true, habilitada: true, motivo: null });
    expect(a.eliminar.habilitada).toBe(true);
    expect(a.cerrar.visible).toBe(false);
    expect(a.pagar.visible).toBe(false);
  });

  test('preliquidado: recalcular siempre; enviar a revisión solo sin bloqueos', () => {
    expect(accionesPeriodo(ctx({ estado: 'preliquidado', conCalculo: true })).enviar_revision).toEqual({ visible: true, habilitada: true, motivo: null });
    const b = accionesPeriodo(ctx({ estado: 'preliquidado', conCalculo: true, bloqueos: 2 }));
    expect(b.enviar_revision).toEqual({ visible: true, habilitada: false, motivo: 'bloqueos' });
    expect(b.recalcular.habilitada).toBe(true);
  });

  test('quien solo ve la nómina no tiene acciones', () => {
    for (const estado of ['abierto', 'preliquidado', 'en_revision', 'cerrado', 'pagado'] as const) {
      const a = accionesPeriodo(ctx({ estado, permisos: SOLO_VER, conCalculo: true }));
      expect(Object.entries(a).filter(([k, v]) => k !== 'colillas' && v.visible)).toEqual([]);
    }
  });

  test('en revisión: RR. HH. devuelve; la gerencia cierra solo con la revisión aprobada (decisión 7)', () => {
    const rrhh = accionesPeriodo(ctx({ estado: 'en_revision', conCalculo: true }));
    expect(rrhh.devolver.visible).toBe(true);
    expect(rrhh.cerrar.visible).toBe(false);
    expect(accionesPeriodo(ctx({ estado: 'en_revision', permisos: GERENCIA, conCalculo: true, revisionAprobada: false })).cerrar).toEqual({
      visible: true,
      habilitada: false,
      motivo: 'revision_pendiente',
    });
    expect(accionesPeriodo(ctx({ estado: 'en_revision', permisos: GERENCIA, conCalculo: true })).cerrar.habilitada).toBe(true);
  });

  test('con la nómina apagada, cerrar, pagar y ajustar se ven deshabilitados y dicen por qué (20.25)', () => {
    const cerrar = accionesPeriodo(ctx({ estado: 'en_revision', permisos: GERENCIA, habilitada: false, conCalculo: true }));
    expect(cerrar.cerrar).toEqual({ visible: true, habilitada: false, motivo: 'solo_preliquidacion' });
    const pagar = accionesPeriodo(ctx({ estado: 'cerrado', permisos: GERENCIA, habilitada: false, conCalculo: true }));
    expect(pagar.pagar.motivo).toBe('solo_preliquidacion');
    expect(pagar.archivo_banco.motivo).toBe('solo_preliquidacion');
    expect(accionesPeriodo(ctx({ estado: 'pagado', permisos: RRHH, habilitada: false, conCalculo: true })).ajustar.motivo).toBe('solo_preliquidacion');
    // Preliquidar sigue disponible.
    expect(accionesPeriodo(ctx({ estado: 'abierto', habilitada: false })).preliquidar.habilitada).toBe(true);
  });

  test('después del cierre no se recalcula: solo ajustes con motivo (decisión 5)', () => {
    for (const estado of ['cerrado', 'pagado', 'contabilizado'] as const) {
      const a = accionesPeriodo(ctx({ estado, conCalculo: true }));
      expect(a.recalcular.visible).toBe(false);
      expect(a.preliquidar.visible).toBe(false);
      expect(a.ajustar).toEqual({ visible: true, habilitada: true, motivo: null });
    }
  });

  test('pagar solo un período cerrado; contabilizar solo uno pagado', () => {
    expect(accionesPeriodo(ctx({ estado: 'cerrado', permisos: GERENCIA, conCalculo: true })).pagar.habilitada).toBe(true);
    expect(accionesPeriodo(ctx({ estado: 'en_revision', permisos: GERENCIA, conCalculo: true })).pagar.visible).toBe(false);
    expect(accionesPeriodo(ctx({ estado: 'pagado', permisos: GERENCIA, conCalculo: true })).contabilizar.habilitada).toBe(true);
    expect(accionesPeriodo(ctx({ estado: 'pagado', permisos: GERENCIA, conCalculo: true })).pagar.visible).toBe(false);
  });

  test('un período que ya se calculó no se elimina', () => {
    expect(accionesPeriodo(ctx({ estado: 'abierto', conCalculo: true })).eliminar).toEqual({ visible: true, habilitada: false, motivo: 'con_calculo' });
  });
});

describe('alertas y variación', () => {
  const alertas = [
    { codigo: 'neto_negativo', severidad: 'bloqueo' },
    { codigo: 'variacion_contra_anterior', severidad: 'aviso', detalle: { neto_anterior: 1000000, neto: 1380000 } },
  ];

  test('cuenta bloqueos y avisos', () => {
    expect(contarAlertas(alertas)).toEqual({ bloqueos: 1, avisos: 1 });
    expect(contarAlertas(null)).toEqual({ bloqueos: 0, avisos: 0 });
  });

  test('la variación sale del detalle del motor; sin período anterior es «Ingresó»', () => {
    expect(variacionNeto(alertas)).toBeCloseTo(0.38);
    expect(variacionNeto([{ codigo: 'sin_periodo_anterior', severidad: 'aviso' }])).toBeNull();
    expect(variacionNeto([])).toBe(0);
  });

  test('códigos sin texto propio caen en «otra»', () => {
    expect(claveAlerta('embargo_limitado')).toBe('embargo_limitado');
    expect(claveAlerta('algo_nuevo')).toBe('otra');
    expect(claveBloqueo('dias_no_listos')).toBe('dias_no_listos');
    expect(claveBloqueo('revision_pendiente')).toBe('revision_pendiente');
    expect(claveError('nomina_no_habilitada')).toBe('nomina_no_habilitada');
    expect(claveError('desconocido')).toBe('generico');
  });
});

describe('colilla', () => {
  const items = [
    { tipo: 'earning', codigo: 'SALARIO', nombre: 'Salario', valor: 1050000, cantidad: 15 },
    { tipo: 'earning', codigo: 'HORA_EXTRA_DIURNA', nombre: 'Hora extra diurna', valor: 75000, cantidad: 6 },
    { tipo: 'deduction', codigo: 'SALUD_EMPLEADO', nombre: 'Salud (trabajador)', valor: 59360, tasa: 0.04 },
    { tipo: 'employer_cost', codigo: 'PENSION_EMPLEADOR', nombre: 'Pensión (empleador)', valor: 178080 },
    { tipo: 'employer_cost', codigo: 'PROVISION_PRIMA', nombre: 'Provisión de prima', valor: 95000 },
    { tipo: 'info', codigo: 'CESANTIAS_CONSIGNAR', nombre: 'Cesantías por consignar', valor: 0 },
  ];

  test('separa devengados, deducciones, aportes, provisiones e informativos', () => {
    const g = agruparItems(items);
    expect(g.devengados.map((i) => i.codigo)).toEqual(['SALARIO', 'HORA_EXTRA_DIURNA']);
    expect(g.deducciones.map((i) => i.codigo)).toEqual(['SALUD_EMPLEADO']);
    expect(g.aportes.map((i) => i.codigo)).toEqual(['PENSION_EMPLEADOR']);
    expect(g.provisiones.map((i) => i.codigo)).toEqual(['PROVISION_PRIMA']);
    expect(g.informativos.map((i) => i.codigo)).toEqual(['CESANTIAS_CONSIGNAR']);
    expect(suma(g.devengados)).toBe(1125000);
  });

  test('las líneas dicen días, horas o tarifa como en el comprobante (23.1)', () => {
    const u = { dias: (n: number) => `${n} días`, horas: (n: number) => `${n} h` };
    expect(textoLinea(items[0], u)).toBe('Salario · 15 días');
    expect(textoLinea(items[1], u)).toBe('Hora extra diurna · 6 h');
    expect(textoLinea(items[2], u)).toBe('Salud (trabajador) · 4 %');
  });
});

describe('nombres y fechas de los períodos', () => {
  test('quincenas, mes, prima y cesantías', () => {
    expect(claveNombrePeriodo({ tipo: 'ordinaria', desde: '2026-11-01', hasta: '2026-11-15' })).toEqual({ clave: 'quincena', numero: 1, mes: '2026-11', anio: 2026 });
    expect(claveNombrePeriodo({ tipo: 'ordinaria', desde: '2026-02-16', hasta: '2026-02-28' })).toMatchObject({ clave: 'quincena', numero: 2 });
    expect(claveNombrePeriodo({ tipo: 'ordinaria', desde: '2026-11-01', hasta: '2026-11-30' })).toMatchObject({ clave: 'mes' });
    expect(claveNombrePeriodo({ tipo: 'prima', desde: '2026-07-01', hasta: '2026-12-31' })).toEqual({ clave: 'prima', semestre: 2, anio: 2026 });
    expect(claveNombrePeriodo({ tipo: 'cesantias', desde: '2026-01-01', hasta: '2026-12-31' })).toEqual({ clave: 'cesantias', anio: 2026 });
    expect(claveNombrePeriodo({ tipo: 'ordinaria', desde: '2026-11-03', hasta: '2026-11-09' })).toMatchObject({ clave: 'rango' });
  });

  test('el siguiente período sigue al último, sin pasar por la zona horaria', () => {
    expect(siguientePeriodo({ hasta: '2026-11-15' }, 'biweekly', '2026-11-16')).toEqual({ desde: '2026-11-16', hasta: '2026-11-30' });
    expect(siguientePeriodo({ hasta: '2026-11-30' }, 'biweekly', '2026-12-01')).toEqual({ desde: '2026-12-01', hasta: '2026-12-15' });
    expect(siguientePeriodo({ hasta: '2027-01-31' }, 'monthly', '2027-02-01')).toEqual({ desde: '2027-02-01', hasta: '2027-02-28' });
    expect(siguientePeriodo(null, 'biweekly', '2026-11-20')).toEqual({ desde: '2026-11-16', hasta: '2026-11-30' });
    expect(siguientePeriodo(null, 'weekly', '2026-11-20')).toEqual({ desde: '2026-11-20', hasta: '2026-11-26' });
  });

  const base: FilaPeriodo = {
    id: 'p1', nombre: null, tipo: 'ordinaria', frecuencia: 'biweekly', desde: '2026-11-01', hasta: '2026-11-15', fecha_pago: '2026-11-15',
    estado: 'calculated', empleados: 3, devengado: 1, deducciones: 1, neto: 1, costo_empleador: 1, version: 1, calculado_en: null, bloqueos: 0, avisos: 0, ajustes: 0,
  };
  const filas: FilaPeriodo[] = [
    base,
    { ...base, id: 'p2', tipo: 'prima', estado: 'open', desde: '2026-07-01', hasta: '2026-12-31', fecha_pago: '2026-12-20' },
    { ...base, id: 'p3', estado: 'paid', fecha_pago: '2026-10-31' },
  ];

  test('filtra por texto, estado y tipo', () => {
    expect(filtrarPeriodos(filas, { ...FILTROS_PERIODOS_VACIOS, estados: ['pagado'] }, () => '').map((p) => p.id)).toEqual(['p3']);
    expect(filtrarPeriodos(filas, { ...FILTROS_PERIODOS_VACIOS, tipos: ['prima'] }, () => '').map((p) => p.id)).toEqual(['p2']);
    expect(filtrarPeriodos(filas, { ...FILTROS_PERIODOS_VACIOS, texto: 'prima' }, (p) => (p.tipo === 'prima' ? 'Prima del 2.º semestre' : 'Quincena')).map((p) => p.id)).toEqual(['p2']);
  });

  test('el próximo pago es el de un período sin cerrar', () => {
    expect(proximoPago(filas, '2026-11-10')).toBe('2026-11-15');
    expect(proximoPago(filas, '2026-11-16')).toBe('2026-12-20');
  });
});

describe('préstamos y embargos', () => {
  const prestamo = {
    id: 'l1', employment_id: 'v1', loan_number: 'P-0001', loan_type: 'general', status: 'active', principal: 480000, balance: 320000,
    installment_amount: 80000, installments_total: 6, installments_paid: 2, first_payment_date: '2026-10-31',
  };
  const embargo = {
    id: 'g1', vinculo_id: 'v2', tipo: 'ordinario' as const, modo: 'fijo' as const, valor: 150000, total: 3600000, aplicado: 24910,
    recibido: '2026-11-03', desde: '2026-11-03', hasta: null, oficio: 'Oficio 1', beneficiario: 'Juzgado de prueba', estado: 'activo' as const,
  };

  test('un préstamo activo está al día; uno por empezar, programado; un anticipo es anticipo', () => {
    expect(filaDePrestamo(prestamo, '2026-11-16', 'Persona de prueba')).toMatchObject({ clase: 'prestamo', estado: 'al_dia', saldo: 320000, cuota: 80000 });
    expect(filaDePrestamo({ ...prestamo, first_payment_date: '2026-12-15' }, '2026-11-16', null).estado).toBe('programado');
    expect(filaDePrestamo({ ...prestamo, loan_type: 'advance', status: 'requested' }, '2026-11-16', null)).toMatchObject({ clase: 'anticipo', estado: 'por_aprobar' });
  });

  test('el saldo del embargo es lo ordenado menos lo aplicado; por porcentaje no tiene monto', () => {
    expect(filaDeEmbargo(embargo, null)).toMatchObject({ clase: 'embargo_ordinario', saldo: 3575090, cuota: 150000 });
    expect(filaDeEmbargo({ ...embargo, tipo: 'alimentos', modo: 'porcentaje', valor: 0.25, total: null }, null)).toMatchObject({
      clase: 'embargo_alimentos', porcentaje: 0.25, monto: null, saldo: null,
    });
  });

  test('totales de las tarjetas y filtros', () => {
    const filas = [filaDePrestamo(prestamo, '2026-11-16', 'Ana'), filaDeEmbargo(embargo, 'Diego')];
    expect(totalesDeducciones(filas)).toEqual({ prestamos: { saldo: 320000, n: 1, cuotas: 80000 }, embargos: { saldo: 3575090, activos: 1 } });
    expect(filtrarDeducciones(filas, { ...FILTROS_DEDUCCIONES_VACIOS, texto: 'juzgado' }).map((x) => x.id)).toEqual(['g1']);
    expect(filtrarDeducciones(filas, { ...FILTROS_DEDUCCIONES_VACIOS, clases: ['prestamo'] }).map((x) => x.id)).toEqual(['l1']);
  });
});

describe('ajuste con motivo y revisión', () => {
  test('el ajuste exige persona, concepto de novedad, valor y motivo', () => {
    expect(validarAjuste({ vinculo: 'v1', concepto: 'BONIFICACION_SALARIAL', valor: 100000, motivo: 'Bono olvidado' })).toEqual([]);
    expect(validarAjuste({ vinculo: '', concepto: 'SALARIO', valor: 0, motivo: ' ' }).map((e) => e.campo)).toEqual(['vinculo', 'concepto', 'valor', 'motivo']);
    // Lo que calcula el motor no es una novedad.
    expect(CONCEPTOS_AJUSTE).not.toContain('SALARIO');
    expect(CONCEPTOS_AJUSTE).not.toContain('SALUD_EMPLEADO');
  });

  test('la lista «Antes de cerrar» sale de los bloqueos de la base', () => {
    const p = puntosRevision([{ codigo: 'dias_no_listos', cantidad: 3 }, { codigo: 'revision_pendiente', estado: 'pendiente' }], 'ordinaria', {
      id: 'a', estado: 'pendiente', paso: 1, solicitada: null, decidida: null,
    });
    expect(p.find((x) => x.clave === 'jornada')?.estado).toBe('bloquea');
    expect(p.find((x) => x.clave === 'novedades')?.estado).toBe('listo');
    expect(p.find((x) => x.clave === 'aprobacion')?.estado).toBe('pendiente');
    expect(p.find((x) => x.clave === 'calculo')?.estado).toBe('listo');
    // La prima no mira la jornada ni la asistencia.
    expect(puntosRevision([], 'prima', null).map((x) => x.clave)).toEqual(['calculo', 'novedades', 'parametros', 'aprobacion']);
    expect(puntosRevision([{ codigo: 'neto_negativo' }], 'prima', null)[0]).toEqual({ clave: 'calculo', estado: 'bloquea', codigos: ['neto_negativo'] });
  });
});
