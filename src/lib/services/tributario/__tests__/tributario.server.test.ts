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

import { guardarPerfil, leerBorrador, leerCentro, leerCertificados, leerPerfil, ErrorTributario } from '../tributario.server';

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
      responsabilidades: ['O-48'],
      agente_retencion: true,
      responsable_inc: false,
      periodicidad_iva: 'bimestral',
      notas: null,
    },
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

  test('guardar: la organización es la de la sesión y los errores se traducen', async () => {
    const { ctx, llamadas } = doble({}, { fn_perfil_tributario_guardar: { data: 'nuevo-id', error: null } });
    const datos = {
      id: null,
      vigenteDesde: '2026-01-01',
      regimen: 'ordinario' as const,
      responsabilidades: ['O-48'],
      agenteRetencion: true,
      responsableInc: false,
      periodicidadIva: 'bimestral' as const,
      notas: null,
      ica: [],
    };
    await expect(guardarPerfil(ctx, datos)).resolves.toEqual({ id: 'nuevo-id' });
    expect(llamadas[0].params.p_organization_id).toBe(42);

    const sinFuncion = doble({}, {});
    await expect(guardarPerfil(sinFuncion.ctx, datos)).rejects.toMatchObject({ codigo: 'pendiente_activar', status: 501 });
    const duplicada = doble({}, { fn_perfil_tributario_guardar: { data: null, error: { code: '23505' } } });
    await expect(guardarPerfil(duplicada.ctx, datos)).rejects.toMatchObject({ codigo: 'vigencia_duplicada', status: 409 });
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
