/**
 * Domiciliarios: el alta (externo sin Recursos humanos o empleado), la fila que se escribe, el
 * estado (libre, en ruta, fuera de turno) y la carga del día.
 */
import {
  altaDomiciliarioSchema,
  cargaDelDia,
  cobraContraentrega,
  codigoErrorAlta,
  estadoDomiciliario,
  filaAlta,
  nombreDomiciliario,
  normalizarDocumento,
} from '../domiciliarios';

const EMPLEO = '7b0f2a52-6d0b-4c64-9e1a-3c1c5e9d2f11';
const USUARIO = '0d5f7d16-27a3-4b1e-8f39-9b6f1c2d3e4f';

const altaExterno = {
  nombre: 'Luisa Martínez',
  celular: '315 220 41 87',
  tipoDocumento: 'CC' as const,
  documento: '1.020.456.789',
  branchId: 3,
  tipoVehiculo: 'motorcycle' as const,
  cobraContraentrega: true,
};

describe('alta rápida', () => {
  test('un externo sin contrato pasa con nombre, celular, documento y sede', () => {
    expect(altaDomiciliarioSchema.safeParse(altaExterno).success).toBe(true);
  });

  test('el externo necesita documento; el empleado no', () => {
    expect(altaDomiciliarioSchema.safeParse({ ...altaExterno, documento: '' }).success).toBe(false);
    expect(altaDomiciliarioSchema.safeParse({ ...altaExterno, documento: '', employmentId: EMPLEO }).success).toBe(true);
  });

  test('rechaza celular corto, sede vacía, vehículo fuera del CHECK y campos de más (organización)', () => {
    expect(altaDomiciliarioSchema.safeParse({ ...altaExterno, celular: '123' }).success).toBe(false);
    expect(altaDomiciliarioSchema.safeParse({ ...altaExterno, branchId: 0 }).success).toBe(false);
    expect(altaDomiciliarioSchema.safeParse({ ...altaExterno, tipoVehiculo: 'drone' }).success).toBe(false);
    expect(altaDomiciliarioSchema.safeParse({ ...altaExterno, organization_id: 999 }).success).toBe(false);
  });

  test('la fila lleva la organización de la sesión, documento limpio y metadata de contraentrega', () => {
    const a = altaDomiciliarioSchema.parse({ ...altaExterno, nombre: '  Luisa   Martínez ', userId: USUARIO });
    const fila = filaAlta(a, 120);
    expect(fila).toMatchObject({
      organization_id: 120,
      branch_id: 3,
      full_name: 'Luisa Martínez',
      document_type: 'CC',
      document_number: '1020456789',
      vehicle_type: 'motorcycle',
      employment_id: null,
      user_id: USUARIO,
      is_active: true,
      metadata: { cobra_contraentrega: true, origen_alta: 'logistica' },
    });
  });

  test('con empleo, el usuario lo pone el disparador (no el formulario)', () => {
    const a = altaDomiciliarioSchema.parse({ ...altaExterno, documento: '', employmentId: EMPLEO, userId: USUARIO });
    const fila = filaAlta(a, 120);
    expect(fila.employment_id).toBe(EMPLEO);
    expect(fila.user_id).toBeNull();
    expect(fila.document_number).toBeNull();
    expect(fila.document_type).toBeNull();
  });

  test('errores de la base', () => {
    expect(codigoErrorAlta({ code: '23505' })).toBe('duplicado');
    expect(codigoErrorAlta({ message: 'EMPLEO_DE_OTRA_ORGANIZACION' })).toBe('empleo_ajeno');
    expect(codigoErrorAlta(null)).toBe('error');
    expect(normalizarDocumento('1.020 456-789')).toBe('1020456789');
  });
});

describe('estado y carga del día', () => {
  const HOY = '2026-11-22';
  const BOG = 'America/Bogota';

  test('carga: asignados, con paquete, entregados hoy (zona de la sede), novedades y por cuadrar', () => {
    const c = cargaDelDia(
      [
        { status: 'assigned' },
        { status: 'out_for_delivery' },
        { status: 'picked' },
        { status: 'failed_attempt' },
        { status: 'delivered', delivered_at: '2026-11-23T01:00:00Z', cod_status: 'collected', cod_collected_amount: '128900.50' },
        { status: 'delivered', delivered_at: '2026-11-21T15:00:00Z', cod_status: 'remitted', cod_collected_amount: 5000 },
      ],
      HOY,
      BOG,
    );
    expect(c).toEqual({ asignados: 3, enCamino: 2, entregadosHoy: 1, novedades: 1, porCuadrar: 128900.5 });
  });

  test('estado: inactivo > en ruta > fuera de turno (cerró hoy) > libre', () => {
    const sin = { enCamino: 0 };
    expect(estadoDomiciliario({ is_active: false }, { enCamino: 2 }, HOY, BOG)).toBe('inactivo');
    expect(estadoDomiciliario({ is_active: true }, { enCamino: 1 }, HOY, BOG)).toBe('en_ruta');
    expect(estadoDomiciliario({ is_active: true, metadata: { fin_jornada_at: '2026-11-22T23:30:00Z' } }, sin, HOY, BOG)).toBe('fuera_de_turno');
    // Cerró ayer: hoy vuelve a estar libre.
    expect(estadoDomiciliario({ is_active: true, metadata: { fin_jornada_at: '2026-11-21T23:30:00Z' } }, sin, HOY, BOG)).toBe('libre');
    expect(estadoDomiciliario({ is_active: true, metadata: null }, sin, HOY, BOG)).toBe('libre');
  });

  test('cobra contraentrega por defecto; nombre propio o del empleado', () => {
    expect(cobraContraentrega(null)).toBe(true);
    expect(cobraContraentrega({ cobra_contraentrega: false })).toBe(false);
    expect(nombreDomiciliario({ full_name: ' Pedro Gil ' })).toBe('Pedro Gil');
    expect(nombreDomiciliario({ full_name: null, employee: { first_name: 'Ana', last_name: 'Gómez' } })).toBe('Ana Gómez');
  });
});
