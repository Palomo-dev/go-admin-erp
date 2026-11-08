/**
 * Servicio de servidor del tributario (Finanzas R4-A) con un Supabase doble:
 * - lo que depende de migraciones sin aplicar vuelve «pendiente de activar», nunca cero;
 * - la organización de las RPC y consultas es la de la sesión;
 * - el Centro no adivina vencimientos y separa «error» de «sin dato».
 */
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: jest.fn(async () => 'America/Bogota'),
}));
jest.mock('@/lib/utils/dateDisplay', () => {
  const real = jest.requireActual('@/lib/utils/dateDisplay');
  return { ...real, todayInTz: () => '2026-11-07' };
});

import { guardarPerfil, leerBorrador, leerCentro, leerCertificados, leerPerfil, registrarDecisionPeriodo, ErrorTributario } from '../tributario.server';
import { huellaVigencias } from '@/lib/finanzas/tributario/vigenciasPeriodo';

type Respuesta = { data: unknown; error: { code?: string; message?: string } | null };

/** Doble mínimo del query builder: cada `from(tabla)` responde lo que diga `tablas[tabla]`. */
function doble(tablas: Record<string, Respuesta>, rpcs: Record<string, Respuesta | ((p: Record<string, unknown>) => Respuesta)>) {
  const llamadas: { rpc: string; params: Record<string, unknown> }[] = [];
  const filtros: { tabla: string; columna: string; valor: unknown }[] = [];
  const supabase = {
    from(tabla: string) {
      const r = tablas[tabla] ?? { data: [], error: null };
      const builder: Record<string, unknown> = {};
      const encadenar = () => builder;
      for (const m of ['select', 'order', 'in', 'ilike', 'limit']) builder[m] = encadenar;
      builder.eq = (columna: string, valor: unknown) => {
        filtros.push({ tabla, columna, valor });
        return builder;
      };
      builder.maybeSingle = async () => r;
      builder.then = (ok: (v: Respuesta) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(r).then(ok, ko);
      return builder;
    },
    async rpc(nombre: string, params: Record<string, unknown>) {
      llamadas.push({ rpc: nombre, params });
      const r = rpcs[nombre];
      if (!r) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${nombre}` } };
      return typeof r === 'function' ? r(params) : r;
    },
  };
  return { ctx: { organizationId: 42, supabase: supabase as never }, llamadas, filtros };
}

const INEXISTENTE = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.organization_tax_profiles' in the schema cache" } };
const ORG = { data: { nit: '900111227', dv: 3, fiscal_responsibilities: ['O-48'] }, error: null };
const CATALOGO = { data: [{ code: 'O-48', description: 'Responsable de IVA' }], error: null };
const PERFIL = {
  data: [
    {
      id: '6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f',
      vigente_desde: '2026-01-01',
      vigente_hasta: null,
      regimen: 'ordinario',
      regimen_renta: 'ordinario',
      condicion_iva: 'responsable',
      gran_contribuyente: false,
      autorretenedor: false,
      agente_retencion_iva: false,
      responsabilidades_rut: [],
      motivo_cambio_periodicidad: null,
      advertencias_aceptadas: [],
      requiere_revision: false,
      regimen_origen: null,
      responsabilidades: [],
      agente_retencion: true,
      responsable_inc: false,
      periodicidad_iva: 'bimestral',
      notas: null,
    },
  ],
  error: null,
};

/** Dos vigencias: bimestral hasta junio de 2026 y cuatrimestral desde julio (cambio a mitad de año, con motivo). */
const PERFIL_DOS = {
  data: [
    { ...PERFIL.data[0], id: '7f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f', vigente_desde: '2026-07-01', vigente_hasta: null, periodicidad_iva: 'cuatrimestral', motivo_cambio_periodicidad: 'otro' },
    { ...PERFIL.data[0], vigente_hasta: '2026-06-30' },
  ],
  error: null,
};

describe('perfil', () => {
  test('sin la migración: activo false, sin vigencias y con lo que falta', async () => {
    const { ctx, filtros } = doble({ organizations: ORG, dian_fiscal_responsibilities: CATALOGO, organization_tax_profiles: INEXISTENTE, organization_tax_profile_ica: INEXISTENTE }, {});
    const r = await leerPerfil(ctx);
    expect(r).toMatchObject({ activo: false, vigencias: [], vigente: null, faltan: ['perfil'], hoy: '2026-11-07' });
    expect(filtros.filter((f) => f.columna === 'organization_id' || f.columna === 'id').every((f) => f.valor === 42)).toBe(true);
  });

  test('con perfil: la vigente de hoy', async () => {
    const { ctx } = doble({ organizations: ORG, dian_fiscal_responsibilities: CATALOGO, organization_tax_profiles: PERFIL, organization_tax_profile_ica: { data: [], error: null } }, {});
    const r = await leerPerfil(ctx);
    expect(r.activo).toBe(true);
    expect(r.vigente?.periodicidadIva).toBe('bimestral');
    expect(r.faltan).toEqual([]);
  });

  test('otro error de lectura se lanza (no se disfraza de «pendiente»)', async () => {
    const { ctx } = doble({ organizations: ORG, dian_fiscal_responsibilities: CATALOGO, organization_tax_profiles: { data: null, error: { code: '42501', message: 'permission denied' } } }, {});
    await expect(leerPerfil(ctx)).rejects.toMatchObject({ code: '42501' });
  });

  const datos = {
    id: null,
    vigenteDesde: '2027-01-01',
    regimenRenta: 'ordinario' as const,
    condicionIva: 'responsable' as const,
    periodicidadIva: 'bimestral' as const,
    granContribuyente: false,
    granContribuyenteActo: null,
    granContribuyenteDesde: null,
    autorretenedor: false,
    autorretenedorActo: null,
    autorretenedorActoFecha: null,
    autorretencionEspecial: false,
    agenteRetencionIva: false,
    agenteRetencion: true,
    responsableInc: false,
    incActividad: null,
    rteTipo: null,
    rteIngresosSuperan160000Uvt: null,
    noContribuyenteNaturaleza: null,
    responsabilidades: [] as string[],
    responsabilidadesRut: [] as string[],
    motivoCambioPeriodicidad: null as 'otro' | null,
    cambioPeriodicidadHecho: null as string | null,
    cambioPeriodicidadNorma: null as string | null,
    cambioPeriodicidadFecha: null as string | null,
    advertenciasAceptadas: [] as string[],
    notas: null,
    ica: [],
  };

  test('guardar: la organización es la de la sesión, va por la v2 y los errores se traducen', async () => {
    const { ctx, llamadas } = doble({ organization_tax_profiles: PERFIL }, { fn_perfil_tributario_guardar_v2: { data: 'nuevo-id', error: null } });
    await expect(guardarPerfil(ctx, datos)).resolves.toEqual({ id: 'nuevo-id', advertencias: [] });
    expect(llamadas[0]).toMatchObject({ rpc: 'fn_perfil_tributario_guardar_v2', params: { p_organization_id: 42, p_datos: { regimen_renta: 'ordinario', condicion_iva: 'responsable' } } });

    const sinFuncion = doble({ organization_tax_profiles: PERFIL }, {});
    await expect(guardarPerfil(sinFuncion.ctx, datos)).rejects.toMatchObject({ codigo: 'pendiente_activar', status: 501 });
    const duplicada = doble({ organization_tax_profiles: PERFIL }, { fn_perfil_tributario_guardar_v2: { data: null, error: { code: '23505' } } });
    await expect(guardarPerfil(duplicada.ctx, datos)).rejects.toMatchObject({ codigo: 'vigencia_duplicada', status: 409 });
    const enLaBase = doble(
      { organization_tax_profiles: PERFIL },
      { fn_perfil_tributario_guardar_v2: { data: null, error: { code: '22023', message: 'COMBINACION_CONTRADICTORIA', details: 'rut_iva_contradictorio' } as never } },
    );
    await expect(guardarPerfil(enLaBase.ctx, datos)).rejects.toMatchObject({ codigo: 'combinacion_contradictoria', status: 400, detalle: { bloqueos: ['rut_iva_contradictorio'] } });
  });

  test('guardar: sin la separación renta/IVA aplicada no se guarda (ni por la vía vieja)', async () => {
    const { ctx, llamadas } = doble({ rut_responsabilidades: INEXISTENTE }, { fn_perfil_tributario_guardar: { data: 'x', error: null } });
    await expect(guardarPerfil(ctx, datos)).rejects.toMatchObject({ codigo: 'pendiente_activar', status: 501 });
    expect(llamadas).toEqual([]);
  });

  test('guardar: lo contradictorio no llega a la base; lo dudoso exige aceptarlo', async () => {
    const contradictoria = doble({ organization_tax_profiles: PERFIL }, { fn_perfil_tributario_guardar_v2: { data: 'id', error: null } });
    await expect(guardarPerfil(contradictoria.ctx, { ...datos, condicionIva: 'no_responsable' })).rejects.toMatchObject({
      codigo: 'combinacion_contradictoria',
      status: 400,
      detalle: { bloqueos: ['no_responsable_con_periodicidad'] },
    });
    expect(contradictoria.llamadas).toEqual([]);

    // Ronda 2: el SIMPLE con autorretención activa se resuelve por el art. 911 (bloqueo, no advertencia).
    const simpleAuto = { ...datos, regimenRenta: 'simple' as const, periodicidadIva: 'anual' as const, autorretenedor: true, autorretenedorActo: 'Res. 1', autorretenedorActoFecha: '2024-01-01', responsabilidades: ['O-47', 'O-15'] };
    const bloqueada = doble({ organization_tax_profiles: PERFIL }, { fn_perfil_tributario_guardar_v2: { data: 'id', error: null } });
    await expect(guardarPerfil(bloqueada.ctx, simpleAuto)).rejects.toMatchObject({ codigo: 'combinacion_contradictoria', detalle: { bloqueos: ['simple_con_autorretencion'] } });
    expect(bloqueada.llamadas).toEqual([]);

    const dudosa = { ...datos, regimenRenta: 'especial' as const, rteTipo: 'calificada_art19' as const, condicionIva: 'no_responsable' as const, periodicidadIva: 'no_aplica' as const };
    const sinAceptar = doble({ organization_tax_profiles: PERFIL }, { fn_perfil_tributario_guardar_v2: { data: 'id', error: null } });
    await expect(guardarPerfil(sinAceptar.ctx, dudosa)).rejects.toMatchObject({ codigo: 'advertencias_sin_aceptar', status: 409, detalle: { pendientes: ['rte_memoria_por_confirmar'] } });
    expect(sinAceptar.llamadas).toEqual([]);

    const aceptada = doble({ organization_tax_profiles: PERFIL }, { fn_perfil_tributario_guardar_v2: { data: 'id', error: null } });
    await expect(guardarPerfil(aceptada.ctx, { ...dudosa, advertenciasAceptadas: ['rte_memoria_por_confirmar'] })).resolves.toEqual({ id: 'id', advertencias: ['rte_memoria_por_confirmar'] });
    expect((aceptada.llamadas[0].params.p_datos as { advertencias_aceptadas: string[] }).advertencias_aceptadas).toEqual(['rte_memoria_por_confirmar']);
  });

  test('guardar: cambio de periodicidad a mitad de año queda pendiente hasta documentar hecho, norma y fecha', async () => {
    const mitad = { ...datos, vigenteDesde: '2026-07-01', periodicidadIva: 'cuatrimestral' as const };
    const sinSoporte = doble({ organization_tax_profiles: PERFIL }, { fn_perfil_tributario_guardar_v2: { data: 'id', error: null } });
    await expect(guardarPerfil(sinSoporte.ctx, { ...mitad, motivoCambioPeriodicidad: 'otro' })).rejects.toMatchObject({
      codigo: 'advertencias_sin_aceptar',
      detalle: { pendientes: ['periodicidad_cambio_pendiente_soporte'] },
    });
    const fechaDistinta = doble({ organization_tax_profiles: PERFIL }, { fn_perfil_tributario_guardar_v2: { data: 'id', error: null } });
    await expect(guardarPerfil(fechaDistinta.ctx, { ...mitad, cambioPeriodicidadFecha: '2026-07-02' })).rejects.toMatchObject({
      detalle: { bloqueos: ['cambio_fecha_efectiva_distinta'] },
    });
    const documentado = doble({ organization_tax_profiles: PERFIL }, { fn_perfil_tributario_guardar_v2: { data: 'id', error: null } });
    const completo = { ...mitad, motivoCambioPeriodicidad: 'otro' as const, cambioPeriodicidadHecho: 'Hecho', cambioPeriodicidadNorma: 'ET art. 600', cambioPeriodicidadFecha: '2026-07-01' };
    await expect(guardarPerfil(documentado.ctx, { ...completo, advertenciasAceptadas: ['periodicidad_cambio_documentado'] })).resolves.toEqual({
      id: 'id',
      advertencias: ['periodicidad_cambio_documentado'],
    });
  });
});

describe('borrador del IVA', () => {
  test('sin la función: pendiente de activar', async () => {
    const { ctx } = doble({}, {});
    await expect(leerBorrador(ctx, '2026-09-01', '2026-10-31')).resolves.toEqual({ estado: 'pendiente_activar' });
  });

  test('con la función: pasa la organización de la sesión y lee el borrador', async () => {
    const { ctx, llamadas } = doble({}, { fn_tributario_borrador_iva: { data: { totales: { saldo: 1000, por_revisar: 0 }, renglones: [] }, error: null } });
    const r = await leerBorrador(ctx, '2026-09-01', '2026-10-31');
    expect(r).toMatchObject({ estado: 'listo', borrador: { saldo: 1000 } });
    expect(llamadas[0]).toEqual({ rpc: 'fn_tributario_borrador_iva', params: { p_organization_id: 42, p_desde: '2026-09-01', p_hasta: '2026-10-31' } });
  });

  test('sin permiso → 403', async () => {
    const { ctx } = doble({}, { fn_tributario_borrador_iva: { data: null, error: { code: '42501' } } });
    await expect(leerBorrador(ctx, '2026-09-01', '2026-10-31')).rejects.toBeInstanceOf(ErrorTributario);
  });
});

describe('Centro tributario', () => {
  test('sin migraciones: todo «pendiente de activar», sin filas', async () => {
    const { ctx } = doble({ organizations: ORG, dian_fiscal_responsibilities: CATALOGO, organization_tax_profiles: INEXISTENTE, organization_tax_profile_ica: INEXISTENTE }, {});
    const r = await leerCentro(ctx, null);
    expect(r).toMatchObject({ corte: '2026-10', perfil: 'pendiente_activar', calendario: 'pendiente_activar', filas: [] });
  });

  test('con perfil y sin calendario ni borrador: vencimientos y valor del IVA pendientes; retención del reporte', async () => {
    const { ctx, llamadas } = doble(
      {
        organizations: ORG,
        dian_fiscal_responsibilities: CATALOGO,
        organization_tax_profiles: PERFIL,
        organization_tax_profile_ica: { data: [], error: null },
        tax_calendar_dates: { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.tax_calendar_dates'" } },
      },
      { fn_reporte_retenciones_practicadas: { data: { totales: { total: 186000 } }, error: null } },
    );
    const r = await leerCentro(ctx, '2026-10');
    expect(r.perfil).toBe('activo');
    expect(r.calendario).toBe('pendiente_activar');
    const iva = r.filas.find((f) => f.obligacion.clave === 'iva')!;
    expect(iva.vencimiento).toEqual({ estado: 'pendiente_activar' });
    expect(iva.valor).toEqual({ estado: 'pendiente_activar' });
    const ret = r.filas.find((f) => f.obligacion.clave === 'retencion')!;
    expect(ret.valor).toEqual({ estado: 'calculado', valor: 186000, revisar: false });
    const renta = r.filas.find((f) => f.obligacion.clave === 'renta')!;
    expect(renta.valor).toEqual({ estado: 'no_calculable' });
    // La retención se pide por días de la organización (Bogotá), con la organización de la sesión.
    const pedido = llamadas.find((l) => l.rpc === 'fn_reporte_retenciones_practicadas')!;
    expect(pedido.params.p_organization_id).toBe(42);
    expect(new Date(String(pedido.params.p_from)).toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(new Date(String(pedido.params.p_to)).toISOString()).toBe('2026-11-01T04:59:59.999Z');
  });

  test('calendario vacío: «incompleto» en cada obligación nacional, nunca «sin obligaciones»', async () => {
    const { ctx } = doble(
      { organizations: ORG, organization_tax_profiles: PERFIL, organization_tax_profile_ica: { data: [], error: null }, tax_calendar_dates: { data: [], error: null } },
      {
        fn_tributario_borrador_iva: { data: { totales: { saldo: 0, por_revisar: 0 }, renglones: [] }, error: null },
        fn_reporte_retenciones_practicadas: { data: { totales: { total: 0 } }, error: null },
      },
    );
    const r = await leerCentro(ctx, '2026-10');
    expect(r.filas.length).toBeGreaterThan(0);
    expect(r.calendario).toBe('activo');
    expect(r.calendarioIncompleto).toEqual([2026]);
    for (const f of r.filas) expect(f.vencimiento).toEqual({ estado: 'sin_cargar', anio: 2026 });
  });

  test('periodo con dos vigencias: «revisar procedencia», sin calcular ni usar el perfil del último día', async () => {
    const { ctx, llamadas } = doble(
      { organizations: ORG, organization_tax_profiles: PERFIL_DOS, organization_tax_profile_ica: { data: [], error: null }, tax_calendar_dates: { data: [], error: null } },
      {
        fn_tributario_borrador_iva: { data: { totales: { saldo: 5, por_revisar: 0 }, renglones: [] }, error: null },
        fn_reporte_retenciones_practicadas: { data: { totales: { total: 0 } }, error: null },
      },
    );
    const r = await leerCentro(ctx, '2026-10');
    const iva = r.filas.filter((f) => f.obligacion.clave === 'iva');
    // El cuatrimestre may–ago toca las dos vigencias; el bimestre sep–oct de la vigencia vieja no existe (ya no rige).
    expect(iva.map((f) => f.obligacion.periodo.desde)).toEqual(['2026-05-01']);
    expect(iva[0].obligacion.notas).toContain('cambio_vigencia_en_periodo');
    expect(iva[0].valor).toEqual({ estado: 'revisar_procedencia' });
    expect(llamadas.some((l) => l.rpc === 'fn_tributario_borrador_iva')).toBe(false);
    // La retención de octubre solo toca la vigencia de julio: se calcula.
    expect(r.filas.find((f) => f.obligacion.clave === 'retencion')!.valor).toMatchObject({ estado: 'calculado' });
    // Con corte junio, el bimestre may–jun es de una sola vigencia (la bimestral).
    const junio = await leerCentro(ctx, '2026-06');
    const ivaJunio = junio.filas.find((f) => f.obligacion.clave === 'iva')!;
    expect(ivaJunio.obligacion.periodo).toMatchObject({ desde: '2026-05-01', hasta: '2026-06-30' });
    expect(ivaJunio.obligacion.notas).not.toContain('cambio_vigencia_en_periodo');
  });

  test('decisión sustentada: cierra la alerta mientras la huella coincida; si cambian las vigencias, se reabre', async () => {
    const filas = PERFIL_DOS.data.map((p) => ({ id: p.id, vigenteDesde: p.vigente_desde, vigenteHasta: p.vigente_hasta, actualizadoEn: null }));
    const huella = huellaVigencias(filas);
    const decision = (h: string) => ({
      data: [
        {
          id: 'd1',
          obligacion: 'iva:cuatrimestral',
          periodo_desde: '2026-05-01',
          periodo_hasta: '2026-08-31',
          decision: 'Rige la vigencia de julio',
          fundamento: 'Concepto',
          alcance: 'IVA may–ago',
          vigencia_aplicada_id: null,
          huella: h,
          decidido_por: 'u1',
          decidido_en: '2026-11-07T10:00:00Z',
        },
      ],
      error: null,
    });
    const rpcs = {
      fn_tributario_borrador_iva: { data: { totales: { saldo: 5, por_revisar: 0 }, renglones: [] }, error: null },
      fn_reporte_retenciones_practicadas: { data: { totales: { total: 0 } }, error: null },
    };
    const tablas = { organizations: ORG, organization_tax_profiles: PERFIL_DOS, organization_tax_profile_ica: { data: [], error: null }, tax_calendar_dates: { data: [], error: null } };

    const cerrada = doble({ ...tablas, tax_period_decisions: decision(huella), profiles: { data: [{ id: 'u1', first_name: 'Ana', last_name: 'Pérez', email: null }], error: null } }, rpcs);
    const iva = (await leerCentro(cerrada.ctx, '2026-10')).filas.find((f) => f.obligacion.clave === 'iva')!;
    expect(iva.obligacion.notas).toContain('decision_registrada');
    expect(iva.valor).toMatchObject({ estado: 'calculado', valor: 5 });
    expect(iva.decisiones).toMatchObject([{ id: 'd1', aplica: true, decididoPorNombre: 'Ana Pérez' }]);

    const reabierta = doble({ ...tablas, tax_period_decisions: decision('huella-vieja') }, rpcs);
    const iva2 = (await leerCentro(reabierta.ctx, '2026-10')).filas.find((f) => f.obligacion.clave === 'iva')!;
    expect(iva2.obligacion.notas).toContain('decision_reabierta');
    expect(iva2.valor).toEqual({ estado: 'revisar_procedencia' });
    expect(iva2.decisiones?.[0].aplica).toBe(false);
  });

  test('registrar decisión: huella calculada en el servidor; sin cambio de vigencia no hay nada que decidir', async () => {
    const tablas = { organizations: ORG, organization_tax_profiles: PERFIL_DOS, organization_tax_profile_ica: { data: [], error: null } };
    const s = { obligacion: 'iva:cuatrimestral', desde: '2026-05-01', hasta: '2026-08-31', decision: 'Rige julio', fundamento: 'Concepto', alcance: 'IVA', vigenciaAplicadaId: null };
    const ok = doble(tablas, { fn_tributario_decision_periodo_registrar: { data: 'nueva', error: null } });
    await expect(registrarDecisionPeriodo(ok.ctx, s)).resolves.toEqual({ id: 'nueva' });
    const filas = PERFIL_DOS.data.map((p) => ({ id: p.id, vigenteDesde: p.vigente_desde, vigenteHasta: p.vigente_hasta, actualizadoEn: null }));
    expect(ok.llamadas[0].params).toMatchObject({ p_organization_id: 42, p_huella: huellaVigencias(filas), p_desde: '2026-05-01' });
    const sinCambio = doble(tablas, { fn_tributario_decision_periodo_registrar: { data: 'x', error: null } });
    await expect(registrarDecisionPeriodo(sinCambio.ctx, { ...s, desde: '2026-09-01', hasta: '2026-10-31' })).rejects.toMatchObject({ codigo: 'sin_cambio_de_vigencia', status: 400 });
    expect(sinCambio.llamadas).toEqual([]);
    const ajena = doble(tablas, {});
    await expect(registrarDecisionPeriodo(ajena.ctx, { ...s, vigenciaAplicadaId: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({ codigo: 'datos_invalidos' });
  });

  test('un corte futuro o inválido cae al mes anterior', async () => {
    const { ctx } = doble({ organizations: ORG, dian_fiscal_responsibilities: CATALOGO, organization_tax_profiles: INEXISTENTE, organization_tax_profile_ica: INEXISTENTE }, {});
    expect((await leerCentro(ctx, '2026-12')).corte).toBe('2026-10');
    expect((await leerCentro(ctx, 'x')).corte).toBe('2026-10');
    expect((await leerCentro(ctx, '2026-03')).corte).toBe('2026-03');
  });
});

describe('certificados', () => {
  test('cruza el reporte con los certificados del mismo periodo (hasta, nunca después de hoy)', async () => {
    const { ctx, filtros } = doble(
      {
        withholding_certificates: {
          data: [{ id: 'c1', supplier_id: 1, number: 'CR-2026-1', period_from: '2026-01-01', period_to: '2026-11-07', total_withheld: '300000', issued_at: '2026-11-07T10:00:00Z' }],
          error: null,
        },
      },
      {
        fn_reporte_retenciones_practicadas: {
          data: { por_proveedor: [{ proveedor_id: 1, proveedor: 'Proveedor uno', nit: '900111222', facturas: 1, retefuente: 300000, reteiva: 0, reteica: 0, retenido: 300000 }] },
          error: null,
        },
      },
    );
    const r = await leerCertificados(ctx, '2026-01-01', '2026-12-31');
    expect(r.hasta).toBe('2026-11-07');
    expect(r.filas[0].estado).toBe('expedido');
    expect(filtros).toEqual(
      expect.arrayContaining([
        { tabla: 'withholding_certificates', columna: 'organization_id', valor: 42 },
        { tabla: 'withholding_certificates', columna: 'period_to', valor: '2026-11-07' },
      ]),
    );
  });

  test('un periodo que empieza después de hoy es inválido', async () => {
    const { ctx } = doble({}, {});
    await expect(leerCertificados(ctx, '2026-12-01', '2026-12-31')).rejects.toMatchObject({ codigo: 'periodo_invalido' });
  });
});
