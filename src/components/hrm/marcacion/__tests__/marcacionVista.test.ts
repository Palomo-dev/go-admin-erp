import {
  accionesDispositivo,
  agregarDeParametro,
  claveTipoFila,
  coincideDispositivo,
  conteoPorMetodo,
  cuerpoAlta,
  estadoDispositivo,
  filasEnVivo,
  filtrarVivo,
  grupoVerificacion,
  haceCuanto,
  marcaParaAjuste,
  metodosDeFilas,
  minutosDesde,
  motivosPorRevisar,
  puntoDeFila,
  tipoDispositivo,
  tonoEstadoDispositivo,
  validarAlta,
  verificacionFila,
  vistaDeParametro,
  type AltaPunto,
  type IntentoVivo,
  type MarcaVivo,
} from '../marcacionVista';

const PERSONA = {
  employment_id: '0b3234e0-eb69-4b72-8853-1bb84184a22e',
  person_id: null,
  nombre: 'Ana Pérez',
  cargo: 'Cocinera',
  area: 'Cocina',
  sede: 'Sede Centro',
  branch_id: 1,
};

function marca(p: Partial<MarcaVivo> = {}): MarcaVivo {
  return {
    ...PERSONA,
    id: 'm1',
    tipo: 'check_in',
    hora: '2026-11-16T11:02:00Z',
    metodo: 'celular_ubicacion',
    punto: null,
    punto_id: null,
    punto_tipo: null,
    sede_marca: 'Sede Centro',
    distancia_m: 24,
    ubicacion_validada: true,
    revisar: null,
    manual: false,
    registrada_por: null,
    tarde_minutos: null,
    ...p,
  };
}

function intento(p: Partial<IntentoVivo> = {}): IntentoVivo {
  return { ...PERSONA, id: 'i1', hora: '2026-11-16T13:20:00Z', metodo: 'celular_ubicacion', motivo: 'fuera_de_rango', distancia_m: 410, punto: null, ...p };
}

describe('En vivo: filas', () => {
  it('mezcla marcas e intentos por hora, la primera del día arriba (Figma 20.26.1)', () => {
    const filas = filasEnVivo({
      marcas: [marca({ id: 'b', hora: '2026-11-16T15:00:00Z' }), marca({ id: 'a', hora: '2026-11-16T11:00:00Z' })],
      intentos: [intento({ id: 'x', hora: '2026-11-16T13:00:00Z' })],
    });
    expect(filas.map((f) => f.clave)).toEqual(['m:a', 'i:x', 'm:b']);
    expect(filasEnVivo(null)).toEqual([]);
  });

  it('«Marca» dice el tipo y los rechazados son «Intento»', () => {
    const [m, i] = filasEnVivo({ marcas: [marca({ tipo: 'break_start' })], intentos: [intento()] });
    expect(claveTipoFila(m)).toBe('inicioDescanso');
    expect(claveTipoFila(i)).toBe('intento');
  });

  it('verificación: la de la marca y «Rechazada: <motivo>» para el intento', () => {
    const [m, i] = filasEnVivo({ marcas: [marca()], intentos: [intento({ motivo: 'algo_raro' })] });
    expect(verificacionFila(m)).toEqual({ clave: 'dentro', tono: 'exito' });
    expect(verificacionFila(i)).toEqual({ clave: 'rechazada', tono: 'peligro', motivo: 'otro' });
    expect(grupoVerificacion(verificacionFila(m))).toBe('correctas');
    expect(grupoVerificacion(verificacionFila(i))).toBe('rechazadas');
    const [manual] = filasEnVivo({ marcas: [marca({ manual: true, metodo: 'manual' })], intentos: [] });
    expect(grupoVerificacion(verificacionFila(manual))).toBe('por_revisar');
  });

  it('punto o dispositivo: registrada por, punto, sede a N m, distancia del intento o nada', () => {
    const filas = filasEnVivo({
      marcas: [
        marca({ id: '1', manual: true, metodo: 'manual', registrada_por: 'Ana Gómez' }),
        marca({ id: '2', metodo: 'qr', punto: 'Pantalla de la entrada', punto_id: 'p1' }),
        marca({ id: '3' }),
        marca({ id: '4', metodo: 'remoto', sede_marca: null }),
      ],
      intentos: [intento({ id: '5', distancia_m: '410' }), intento({ id: '6', distancia_m: null })],
    });
    const porClave = Object.fromEntries(filas.map((f) => [f.clave, puntoDeFila(f)]));
    expect(porClave['m:1']).toEqual({ tipo: 'registrada', por: 'Ana Gómez' });
    expect(porClave['m:2']).toEqual({ tipo: 'punto', nombre: 'Pantalla de la entrada' });
    expect(porClave['m:3']).toEqual({ tipo: 'sede', sede: 'Sede Centro', metros: 24 });
    expect(porClave['m:4']).toEqual({ tipo: 'ninguno' });
    expect(porClave['i:5']).toEqual({ tipo: 'distancia', metros: 410 });
    expect(porClave['i:6']).toEqual({ tipo: 'ninguno' });
  });

  it('búsqueda sin tildes por persona o punto, y filtros por método y verificación', () => {
    const filas = filasEnVivo({
      marcas: [marca({ id: '1' }), marca({ id: '2', metodo: 'qr', punto: 'Pantalla Recepción', nombre: 'Luis Mejía' })],
      intentos: [intento({ id: '3', metodo: 'desconocido' })],
    });
    expect(filtrarVivo(filas, { texto: 'perez', metodo: null, verificacion: null }).map((f) => f.clave)).toEqual(['m:1', 'i:3']);
    expect(filtrarVivo(filas, { texto: 'recepcion', metodo: null, verificacion: null }).map((f) => f.clave)).toEqual(['m:2']);
    expect(filtrarVivo(filas, { texto: '', metodo: 'qr', verificacion: null }).map((f) => f.clave)).toEqual(['m:2']);
    expect(filtrarVivo(filas, { texto: '', metodo: null, verificacion: 'rechazadas' }).map((f) => f.clave)).toEqual(['i:3']);
    expect(metodosDeFilas(filas)).toEqual(['celular_ubicacion', 'qr', 'desconocido']);
  });

  it('«Hoy por método»: del más usado al menos usado, sin ceros ni métodos inventados', () => {
    expect(conteoPorMetodo({ qr: 4, celular_ubicacion: 7, manual: 1, huella: 1, raro: 2, nfc_etiqueta: 0 })).toEqual([
      { metodo: 'celular_ubicacion', n: 7 },
      { metodo: 'qr', n: 4 },
      { metodo: 'desconocido', n: 2 },
      { metodo: 'huella', n: 1 },
      { metodo: 'manual', n: 1 },
    ]);
    expect(conteoPorMetodo(null)).toEqual([]);
  });

  it('motivos de «Por revisar» en orden fijo', () => {
    expect(
      motivosPorRevisar([
        { revisar: null, manual: true, metodo: 'manual' },
        { revisar: 'sin_ubicacion', manual: false, metodo: 'celular_ubicacion' },
        { revisar: 'fuera_de_linea', manual: false, metodo: 'qr' },
      ])
    ).toEqual(['sin_ubicacion', 'sin_senal', 'manual']);
  });

  it('el ajuste propone la marca que se corrige (R1: la original no se edita)', () => {
    expect(marcaParaAjuste('check_in')).toBe('check_in');
    expect(marcaParaAjuste('break_end')).toBe('descanso');
    expect(marcaParaAjuste('check_out')).toBe('check_out');
  });
});

describe('Dispositivos', () => {
  const AHORA = Date.parse('2026-11-16T15:00:00Z');

  it('estado: etiqueta «Activa», pantalla en línea si consultó hace menos de 2 min, desactivado manda', () => {
    expect(estadoDispositivo({ tipo: 'etiqueta_nfc', activo: true, ultima_conexion: null }, AHORA)).toBe('activa');
    expect(estadoDispositivo({ tipo: 'pantalla_qr', activo: true, ultima_conexion: '2026-11-16T14:59:00Z' }, AHORA)).toBe('en_linea');
    expect(estadoDispositivo({ tipo: 'pantalla_qr', activo: true, ultima_conexion: '2026-11-16T14:50:00Z' }, AHORA)).toBe('sin_conexion');
    expect(estadoDispositivo({ tipo: 'pantalla_qr', activo: true, ultima_conexion: null }, AHORA)).toBe('sin_conexion');
    expect(estadoDispositivo({ tipo: 'pantalla_qr', activo: false, ultima_conexion: '2026-11-16T14:59:59Z' }, AHORA)).toBe('desactivado');
    expect(tonoEstadoDispositivo('en_linea')).toBe('exito');
    expect(tonoEstadoDispositivo('sin_conexion')).toBe('peligro');
    expect(tonoEstadoDispositivo('activa')).toBe('neutro');
  });

  it('tipo: los registros de antes de M0 (kind nulo) son «anterior»', () => {
    expect(tipoDispositivo({ tipo: 'pantalla_qr' })).toBe('pantalla_qr');
    expect(tipoDispositivo({ tipo: null })).toBe('anterior');
    expect(tipoDispositivo({ tipo: 'algo' })).toBe('anterior');
  });

  it('hace cuánto', () => {
    expect(haceCuanto('2026-11-16T14:59:40Z', AHORA)).toEqual({ unidad: 'ahora', n: 0 });
    expect(haceCuanto('2026-11-16T14:08:00Z', AHORA)).toEqual({ unidad: 'min', n: 52 });
    expect(haceCuanto('2026-11-16T10:00:00Z', AHORA)).toEqual({ unidad: 'h', n: 5 });
    expect(haceCuanto('2026-10-06T10:00:00Z', AHORA)).toEqual({ unidad: 'd', n: 41 });
    expect(haceCuanto(null, AHORA)).toBeNull();
  });

  it('acciones: abrir solo la pantalla activa; regenerar solo M0; nada sin permiso', () => {
    expect(accionesDispositivo({ tipo: 'pantalla_qr', activo: true }, true)).toEqual({ abrirPantalla: true, regenerar: true, desactivar: true, activar: false });
    expect(accionesDispositivo({ tipo: 'etiqueta_nfc', activo: true }, true)).toEqual({ abrirPantalla: false, regenerar: true, desactivar: true, activar: false });
    expect(accionesDispositivo({ tipo: null, activo: true }, true)).toEqual({ abrirPantalla: false, regenerar: false, desactivar: true, activar: false });
    expect(accionesDispositivo({ tipo: 'pantalla_qr', activo: false }, true)).toEqual({ abrirPantalla: false, regenerar: false, desactivar: false, activar: true });
    expect(accionesDispositivo({ tipo: 'pantalla_qr', activo: true }, false)).toEqual({ abrirPantalla: false, regenerar: false, desactivar: false, activar: false });
  });

  it('búsqueda por nombre, dónde está o sede', () => {
    expect(coincideDispositivo({ nombre: 'Etiqueta', descripcion: 'Puerta principal', sede: 'Centro' }, 'puerta')).toBe(true);
    expect(coincideDispositivo({ nombre: 'Etiqueta', descripcion: null, sede: 'Centro' }, 'norte')).toBe(false);
  });

  it('alta: valida nombre y sede; la etiqueta lleva el chip y la pantalla no', () => {
    const base: AltaPunto = { tipo: 'etiqueta_nfc', nombre: '  Etiqueta · Entrada ', sedeId: 3, descripcion: ' Puerta principal ', chip: 'ntag424' };
    expect(validarAlta({ ...base, tipo: null })).toBe('tipo');
    expect(validarAlta({ ...base, nombre: 'a' })).toBe('nombre');
    expect(validarAlta({ ...base, sedeId: null })).toBe('sede');
    expect(validarAlta({ ...base, descripcion: 'x'.repeat(201) })).toBe('descripcion');
    expect(cuerpoAlta(base)).toEqual({ tipo: 'etiqueta_nfc', nombre: 'Etiqueta · Entrada', sede_id: 3, descripcion: 'Puerta principal', chip: 'ntag424' });
    expect(cuerpoAlta({ ...base, tipo: 'pantalla_qr', descripcion: '' })).toEqual({ tipo: 'pantalla_qr', nombre: 'Etiqueta · Entrada', sede_id: 3 });
    expect(cuerpoAlta({ ...base, nombre: '' })).toBeNull();
  });
});

describe('URL de la pestaña', () => {
  it('vista y alta salen de la URL; lo desconocido cae en «En vivo» y sin alta', () => {
    expect(vistaDeParametro('dispositivos')).toBe('dispositivos');
    expect(vistaDeParametro('metodos')).toBe('metodos');
    expect(vistaDeParametro('kiosco')).toBe('envivo');
    expect(vistaDeParametro(null)).toBe('envivo');
    expect(agregarDeParametro('etiqueta_nfc')).toBe('etiqueta_nfc');
    expect(agregarDeParametro('terminal_huella')).toBeNull();
  });

  it('«actualizado hace N min»', () => {
    expect(minutosDesde(null, 1_000)).toBeNull();
    expect(minutosDesde(0, 59_000)).toBe(0);
    expect(minutosDesde(0, 125_000)).toBe(2);
  });
});
