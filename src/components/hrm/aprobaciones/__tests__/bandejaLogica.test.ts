import { FILTROS_BANDEJA, claveTitulo, conteoFiltrosBandeja, diasDesde, diferencia, excepcionMarcacion, filtrarSolicitudes, grupoDeTipo, tieneSalarioOculto, type EventoSolicitud, type Solicitud } from '../bandejaLogica';

const ev = (p: Partial<EventoSolicitud>): EventoSolicitud => ({
  id: 'e',
  campo: 'salario',
  desde: '2026-12-01',
  motivo: 'Ajuste',
  estado: 'pendiente',
  oculto: false,
  anterior: 2250000,
  nuevo: 2400000,
  anterior_nombre: null,
  nuevo_nombre: null,
  ...p,
});

describe('bandeja de aprobaciones', () => {
  it('agrupa los tipos como los chips del diseño', () => {
    expect(grupoDeTipo('cambio_salario')).toBe('salario_cargo');
    expect(grupoDeTipo('cambio_cuenta_bancaria')).toBe('salario_cargo');
    expect(grupoDeTipo('plaza_nueva')).toBe('plazas');
    expect(grupoDeTipo('cambio_seguridad_social')).toBe('seguridad');
    expect(grupoDeTipo('cambio_jornada')).toBe('sede_jornada');
  });

  it('cargo y salario enlazados se titulan juntos', () => {
    expect(claveTitulo({ tipo: 'cambio_salario', eventos: [ev({ campo: 'cargo' }), ev({})] })).toBe('cargo_salario');
    expect(claveTitulo({ tipo: 'cambio_seguridad_social', eventos: [ev({ campo: 'eps' })] })).toBe('seguridad_social');
  });

  it('la diferencia solo sale con el monto visible', () => {
    expect(diferencia({ eventos: [ev({})] })).toEqual({ diferencia: 150000, pct: 6.7, nuevo: 2400000 });
    expect(diferencia({ eventos: [ev({ oculto: true, anterior: null, nuevo: null })] })).toBeNull();
    expect(tieneSalarioOculto({ eventos: [ev({ oculto: true })] })).toBe(true);
  });

  it('días desde que se pidió', () => {
    expect(diasDesde('2026-11-12T10:00:00Z', new Date('2026-11-15T12:00:00Z'))).toBe(3);
  });
});

describe('filtros de la bandeja', () => {
  const base = {
    estado: 'pendiente',
    creado: '2026-11-14T10:00:00Z',
    decidido: null,
    es_propia: false,
    regla: null,
    eventos: [],
    cuenta: null,
    nota: null,
    soporte_documento_id: null,
    contexto: null,
    decision: null,
  };
  const lista: Solicitud[] = [
    { ...base, id: '1', tipo: 'cambio_salario', solicito: 'Ana Gómez', efecto: '2026-11-20', persona: { id: 'p1', nombre: 'Andrés Rincón', cargo: 'Cocinero', area: null, sede: null } },
    { ...base, id: '2', tipo: 'cambio_seguridad_social', solicito: 'Luis Pérez', efecto: '2026-12-01', persona: { id: 'p2', nombre: 'Daniela Vélez', cargo: 'Mesera', area: null, sede: null } },
  ];
  const etiqueta = (s: Solicitud) => (s.tipo === 'cambio_salario' ? 'Cambio de salario' : 'Seguridad social');

  it('sin filtros devuelve todo y el conteo es 0', () => {
    expect(filtrarSolicitudes(lista, FILTROS_BANDEJA, '2026-11-15', etiqueta)).toHaveLength(2);
    expect(conteoFiltrosBandeja(FILTROS_BANDEJA)).toBe(0);
  });
  it('busca por persona o tipo, sin importar tildes', () => {
    expect(filtrarSolicitudes(lista, { ...FILTROS_BANDEJA, texto: 'velez' }, '2026-11-15', etiqueta).map((s) => s.id)).toEqual(['2']);
    expect(filtrarSolicitudes(lista, { ...FILTROS_BANDEJA, texto: 'salario' }, '2026-11-15', etiqueta).map((s) => s.id)).toEqual(['1']);
  });
  it('filtra por tipo, por quién pidió y por efecto en el mes de la organización', () => {
    expect(filtrarSolicitudes(lista, { ...FILTROS_BANDEJA, grupo: 'seguridad' }, '2026-11-15', etiqueta).map((s) => s.id)).toEqual(['2']);
    expect(filtrarSolicitudes(lista, { ...FILTROS_BANDEJA, solicito: 'Ana Gómez' }, '2026-11-15', etiqueta).map((s) => s.id)).toEqual(['1']);
    const f = { ...FILTROS_BANDEJA, esteMes: true };
    expect(filtrarSolicitudes(lista, f, '2026-11-15', etiqueta).map((s) => s.id)).toEqual(['1']);
    expect(filtrarSolicitudes(lista, f, '2026-12-03', etiqueta).map((s) => s.id)).toEqual(['2']);
    expect(conteoFiltrosBandeja(f)).toBe(1);
  });
});

describe('excepción temporal de marcación (Marcación M0)', () => {
  it('va en «Sede y jornada», con su propio título', () => {
    expect(grupoDeTipo('excepcion_marcacion')).toBe('sede_jornada');
    expect(claveTitulo({ tipo: 'excepcion_marcacion', eventos: [] })).toBe('excepcion_marcacion');
  });
  it('lee método, fechas y motivo del contexto', () => {
    const contexto = { metodo: 'celular_ubicacion', desde: '2026-11-16', hasta: '2026-11-30', motivo: ' Lesión en la mano ', branch_id: 3 };
    expect(excepcionMarcacion({ tipo: 'excepcion_marcacion', contexto })).toEqual({
      metodo: 'celular_ubicacion',
      desde: '2026-11-16',
      hasta: '2026-11-30',
      motivo: 'Lesión en la mano',
    });
    expect(excepcionMarcacion({ tipo: 'excepcion_marcacion', contexto: { desde: '16/11/2026', motivo: '' } })).toEqual({ metodo: null, desde: null, hasta: null, motivo: null });
    expect(excepcionMarcacion({ tipo: 'horas_extra', contexto })).toBeNull();
    expect(excepcionMarcacion({ tipo: 'excepcion_marcacion', contexto: null })).toBeNull();
  });
});
