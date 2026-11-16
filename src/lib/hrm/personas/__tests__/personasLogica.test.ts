import {
  FILTROS_INICIALES,
  alertaPrincipal,
  antiguedad,
  conteoFiltros,
  diasEntre,
  diferenciaSalario,
  edad,
  filtrarEmpleados,
  iniciales,
  primerDiaMesSiguiente,
  puedeReenviarInvitacion,
  resumenEmpleados,
  type EmpleadoFila,
} from '../logica';
import {
  carpetaDeCategoria,
  formatearNumeroDocumento,
  grupoDeCategoria,
  normalizarNumeroDocumento,
} from '../catalogo';

function fila(p: Partial<EmpleadoFila>): EmpleadoFila {
  return {
    persona_id: 'p',
    vinculo_id: 'v',
    nombre: 'Andrés Felipe Morales',
    doc_tipo: 'CC',
    doc_numero: '1036654321',
    cargo_id: 'c1',
    cargo: 'Cocinero/a',
    area_id: 'a1',
    area: 'Cocina',
    sede_id: 1,
    sede: 'Sede Centro',
    tipo_contrato: 'indefinite',
    fin_contrato: null,
    ingreso: '2025-02-03',
    retiro: null,
    estado: 'activo',
    acceso: 'activo',
    alertas: [],
    ...p,
  };
}

describe('lista de empleados', () => {
  const filas = [
    fila({ persona_id: '1' }),
    fila({ persona_id: '2', nombre: 'Carolina Ruiz', doc_numero: '1036456789', tipo_contrato: 'fixed_term', estado: 'periodo_prueba' }),
    fila({ persona_id: '3', nombre: 'Sara Montoya', estado: 'retirado' }),
  ];

  it('busca sin tildes y por documento con puntos', () => {
    expect(filtrarEmpleados(filas, { ...FILTROS_INICIALES, texto: 'andres' }).map((f) => f.persona_id)).toEqual(['1']);
    expect(filtrarEmpleados(filas, { ...FILTROS_INICIALES, texto: '1.036.456' }).map((f) => f.persona_id)).toEqual(['2']);
  });

  it('por defecto oculta a los retirados y el conteo de filtros no cuenta el estado por defecto', () => {
    expect(filtrarEmpleados(filas, FILTROS_INICIALES)).toHaveLength(2);
    expect(conteoFiltros(FILTROS_INICIALES)).toBe(0);
    expect(conteoFiltros({ ...FILTROS_INICIALES, contratos: ['fixed_term'] })).toBe(1);
  });

  it('resume activos, prueba, por ingresar y retirados', () => {
    expect(resumenEmpleados(filas)).toEqual({ activos: 2, prueba: 1, porIngresar: 0, retirados: 1 });
  });

  it('la alerta principal es la vencida antes que la que vence', () => {
    const a = alertaPrincipal([
      { tipo: 'contrato_vence', nivel: 'advertencia', fecha: '2026-12-15' },
      { tipo: 'certificacion_vencida', nivel: 'peligro', fecha: '2026-10-15' },
    ]);
    expect(a?.tipo).toBe('certificacion_vencida');
  });
});

describe('fechas planas', () => {
  it('antigüedad en años y meses cumplidos', () => {
    expect(antiguedad('2025-02-03', '2026-11-15')).toEqual({ anios: 1, meses: 9 });
    expect(antiguedad('2025-02-20', '2026-11-15')).toEqual({ anios: 1, meses: 8 });
    expect(antiguedad('2027-01-01', '2026-11-15')).toBeNull();
  });
  it('edad y días entre fechas', () => {
    expect(edad('1996-08-14', '2026-11-15')).toBe(30);
    expect(diasEntre('2026-11-15', '2026-12-03')).toBe(18);
  });
  it('primer día del mes siguiente, también en diciembre', () => {
    expect(primerDiaMesSiguiente('2026-11-15')).toBe('2026-12-01');
    expect(primerDiaMesSiguiente('2026-12-31')).toBe('2027-01-01');
  });
});

describe('salario e identificación', () => {
  it('diferencia y porcentaje del cambio', () => {
    expect(diferenciaSalario(2250000, 2400000)).toEqual({ diferencia: 150000, pct: 6.7 });
    expect(diferenciaSalario(null, 2400000)).toBeNull();
  });
  it('documento con y sin puntos', () => {
    expect(normalizarNumeroDocumento('1.036.654.321')).toBe('1036654321');
    expect(formatearNumeroDocumento('1036654321')).toBe('1.036.654.321');
    expect(formatearNumeroDocumento('PA12345')).toBe('PA12345');
  });
  it('iniciales del avatar', () => {
    expect(iniciales('Andrés Felipe Morales Rincón')).toBe('AM');
    expect(iniciales('Carolina Ruiz')).toBe('CR');
  });
});

describe('documentos: el grupo lo decide la categoría', () => {
  it('el contrato va con salario y el concepto médico con salud', () => {
    expect(grupoDeCategoria('contrato_trabajo')).toBe('salario_pago');
    expect(grupoDeCategoria('concepto_aptitud')).toBe('salud');
    expect(grupoDeCategoria('certificado_bancario')).toBe('banco');
    expect(grupoDeCategoria('historia_clinica')).toBeNull();
    expect(carpetaDeCategoria('afiliacion_eps')).toBe('seguridad_social');
  });
});

describe('reenviar invitación (revisión 2026-11-15: empleado siempre con usuario)', () => {
  it('solo con la invitación pendiente o vencida, y no a un retirado', () => {
    expect(puedeReenviarInvitacion(fila({ acceso: 'invitacion_pendiente' }))).toBe(true);
    expect(puedeReenviarInvitacion(fila({ acceso: 'invitacion_vencida' }))).toBe(true);
    expect(puedeReenviarInvitacion(fila({ acceso: 'activo' }))).toBe(false);
    expect(puedeReenviarInvitacion(fila({ acceso: 'desactivado' }))).toBe(false);
    expect(puedeReenviarInvitacion(fila({ acceso: 'invitacion_pendiente', estado: 'retirado' }))).toBe(false);
  });
});
