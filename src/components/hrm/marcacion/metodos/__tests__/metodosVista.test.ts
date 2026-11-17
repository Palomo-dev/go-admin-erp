import {
  METODOS_EXCEPCION,
  cambiosFormulario,
  claveErrorGuardar,
  configDe,
  contadorMetodos,
  cuerpoGuardar,
  errorLocalExcepcion,
  errorServidorExcepcion,
  estadoExcepcion,
  excepcionesDeSede,
  formularioDesde,
  metodosLetrero,
  puedeRevocar,
  radioValido,
  resumenExcepciones,
  rutaLetrero,
  rutaPantallaQr,
  urlAgregarDispositivo,
  urlEnVivo,
  type FormMetodos,
} from '../metodosVista';

const HOY = '2026-11-16';

const BASE: FormMetodos = {
  celular: { activo: true, radio: 150, computador: true },
  qr: { activo: true, exigirUbicacion: false },
  nfc: { activo: true },
};

describe('formularioDesde', () => {
  test('lee lo que devuelve la base, con sus reglas', () => {
    const f = formularioDesde({
      celular_ubicacion: { activo: true, reglas: { radio_m: 200, permitir_computador: false } },
      qr: { activo: false, reglas: { exigir_ubicacion: true, segundos: 30 } },
      nfc_etiqueta: { activo: true, reglas: { exigir_ubicacion: true } },
      pin: { activo: false, reglas: {} },
    });
    expect(f).toEqual({
      celular: { activo: true, radio: 200, computador: false },
      qr: { activo: false, exigirUbicacion: true },
      nfc: { activo: true },
    });
  });

  test('sin datos usa los valores por defecto de la base (todo activo, 150 m, computador permitido)', () => {
    expect(formularioDesde(null)).toEqual(BASE);
    expect(formularioDesde({})).toEqual(BASE);
  });
});

describe('cambios y cuerpo del guardado', () => {
  test('sin cambios cuenta 0 y cada método cambiado cuenta uno', () => {
    expect(cambiosFormulario(BASE, BASE)).toBe(0);
    const otro: FormMetodos = { ...BASE, celular: { ...BASE.celular, radio: 300, computador: false }, qr: { activo: true, exigirUbicacion: true } };
    expect(cambiosFormulario(BASE, otro)).toBe(2);
  });

  test('arma el cuerpo con solo las reglas que entiende la base', () => {
    const r = cuerpoGuardar({ ...BASE, qr: { activo: true, exigirUbicacion: true } });
    expect(r).toEqual({
      ok: true,
      metodos: {
        celular_ubicacion: { activo: true, reglas: { radio_m: 150, permitir_computador: true } },
        qr: { activo: true, reglas: { exigir_ubicacion: true } },
        nfc_etiqueta: { activo: true, reglas: {} },
      },
    });
  });

  test('un radio vacío o fuera de 20–2000 no se guarda (nunca cae al 150 por defecto)', () => {
    expect(cuerpoGuardar({ ...BASE, celular: { ...BASE.celular, radio: null } })).toEqual({ ok: false, error: 'radio_invalido' });
    expect(cuerpoGuardar({ ...BASE, celular: { ...BASE.celular, radio: 10 } })).toEqual({ ok: false, error: 'radio_invalido' });
    expect(configDe({ ...BASE, celular: { ...BASE.celular, radio: null } }).celular_ubicacion?.reglas.radio_m).toBe(0);
  });

  test('la sede necesita al menos un método activo', () => {
    expect(cuerpoGuardar({ ...BASE, celular: { ...BASE.celular, activo: false }, qr: { activo: false, exigirUbicacion: false }, nfc: { activo: false } })).toEqual({
      ok: false,
      error: 'sin_metodos',
    });
  });

  test('radioValido', () => {
    expect(radioValido(20)).toBe(true);
    expect(radioValido(2000)).toBe(true);
    expect(radioValido(19)).toBe(false);
    expect(radioValido(150.5)).toBe(false);
    expect(radioValido(null)).toBe(false);
  });

  test('errores de la API al guardar', () => {
    expect(claveErrorGuardar('sin_metodos')).toBe('sin_metodos');
    expect(claveErrorGuardar('radio_invalido')).toBe('radio_invalido');
    expect(claveErrorGuardar('sin_permiso')).toBe('sin_permiso');
    expect(claveErrorGuardar('error_hrm')).toBe('generico');
  });
});

describe('contadorMetodos', () => {
  test('«6 de 8»: los tres de M0, el remoto si alguien lo tiene y la marca manual', () => {
    expect(contadorMetodos(BASE, 1)).toEqual({ activos: 5, total: 8 });
    expect(contadorMetodos(BASE, 0)).toEqual({ activos: 4, total: 8 });
    expect(contadorMetodos({ ...BASE, nfc: { activo: false } }, 0)).toEqual({ activos: 3, total: 8 });
  });
});

describe('destinos', () => {
  test('pantalla del QR: la primera, o null si no hay', () => {
    expect(rutaPantallaQr([{ id: 'a1' }, { id: 'b2' }])).toBe('/marcacion/pantalla/a1');
    expect(rutaPantallaQr([])).toBeNull();
  });

  test('letrero y vista Dispositivos con el diálogo de agregar', () => {
    expect(rutaLetrero(7)).toBe('/marcacion/letrero?sede=7');
    expect(urlAgregarDispositivo('/app/hrm/marcacion', 'vista=metodos&x=1', 'etiqueta_nfc')).toBe('/app/hrm/marcacion?vista=dispositivos&x=1&agregar=etiqueta_nfc');
    expect(urlEnVivo('/app/hrm/marcacion', 'vista=metodos')).toBe('/app/hrm/marcacion');
    expect(urlEnVivo('/app/hrm/marcacion', 'vista=metodos&y=2')).toBe('/app/hrm/marcacion?y=2');
  });
});

describe('excepciones temporales', () => {
  const e = (estado: 'pendiente' | 'aprobada' | 'rechazada' | 'anulada' | 'revocada', desde: string, hasta: string, vigente = false) => ({
    estado,
    desde,
    hasta,
    vigente,
  });

  test('estado que se muestra', () => {
    expect(estadoExcepcion(e('aprobada', '2026-11-10', '2026-11-30', true), HOY)).toBe('vigente');
    expect(estadoExcepcion(e('aprobada', '2026-11-20', '2026-11-30'), HOY)).toBe('programada');
    expect(estadoExcepcion(e('aprobada', '2026-11-01', '2026-11-10'), HOY)).toBe('vencida');
    expect(estadoExcepcion(e('pendiente', '2026-11-16', '2026-11-20'), HOY)).toBe('pendiente');
    expect(estadoExcepcion(e('revocada', '2026-11-16', '2026-11-20'), HOY)).toBe('revocada');
  });

  test('se revoca lo pendiente y lo aprobado que no venció', () => {
    expect(puedeRevocar(e('pendiente', '2026-11-16', '2026-11-20'), HOY)).toBe(true);
    expect(puedeRevocar(e('aprobada', '2026-11-10', '2026-11-30', true), HOY)).toBe(true);
    expect(puedeRevocar(e('aprobada', '2026-11-20', '2026-11-30'), HOY)).toBe(true);
    expect(puedeRevocar(e('aprobada', '2026-11-01', '2026-11-10'), HOY)).toBe(false);
    expect(puedeRevocar(e('rechazada', '2026-11-16', '2026-11-20'), HOY)).toBe(false);
    expect(puedeRevocar(e('revocada', '2026-11-16', '2026-11-20'), HOY)).toBe(false);
  });

  test('filtra por sede y resume', () => {
    const lista = [
      { branch_id: 1, ...e('aprobada', '2026-11-10', '2026-11-30', true) },
      { branch_id: 1, ...e('pendiente', '2026-11-16', '2026-11-20') },
      { branch_id: 2, ...e('pendiente', '2026-11-16', '2026-11-20') },
    ];
    expect(excepcionesDeSede(lista, 1)).toHaveLength(2);
    expect(excepcionesDeSede(lista, null)).toHaveLength(3);
    expect(resumenExcepciones(excepcionesDeSede(lista, 1), HOY)).toEqual({ vigentes: 1, pendientes: 1 });
  });

  test('solo los métodos de M0 se pueden habilitar hoy', () => {
    expect(METODOS_EXCEPCION.filter((m) => m.disponible).map((m) => m.metodo)).toEqual(['celular_ubicacion', 'qr', 'nfc_etiqueta']);
    expect(METODOS_EXCEPCION.find((m) => m.metodo === 'huella')?.disponible).toBe(false);
  });

  test('validación local: cada error cae en su campo', () => {
    const ok = { vinculoId: 'v1', metodo: 'qr', desde: '2026-11-16', hasta: '2026-11-30', motivo: 'Lesión en la mano' };
    expect(errorLocalExcepcion(ok, HOY)).toBeNull();
    expect(errorLocalExcepcion({ ...ok, vinculoId: '' }, HOY)).toEqual({ campo: 'persona', clave: 'persona' });
    expect(errorLocalExcepcion({ ...ok, metodo: '' }, HOY)).toEqual({ campo: 'metodo', clave: 'metodo' });
    expect(errorLocalExcepcion({ ...ok, metodo: 'huella' }, HOY)).toEqual({ campo: 'metodo', clave: 'metodo' });
    expect(errorLocalExcepcion({ ...ok, hasta: '' }, HOY)).toEqual({ campo: 'hasta', clave: 'fechas' });
    expect(errorLocalExcepcion({ ...ok, hasta: '2027-03-01' }, HOY)).toEqual({ campo: 'hasta', clave: 'tope' });
    expect(errorLocalExcepcion({ ...ok, desde: '2026-11-01', hasta: '2026-11-10' }, HOY)).toEqual({ campo: 'hasta', clave: 'pasado' });
    expect(errorLocalExcepcion({ ...ok, motivo: 'ab' }, HOY)).toEqual({ campo: 'motivo', clave: 'motivo' });
  });

  test('errores del servidor', () => {
    expect(errorServidorExcepcion('no_propio')).toEqual({ campo: 'persona', clave: 'noPropio' });
    expect(errorServidorExcepcion('vigencia_invalida')).toEqual({ campo: 'hasta', clave: 'vigencia' });
    expect(errorServidorExcepcion('excepcion_tope')).toEqual({ campo: 'hasta', clave: 'tope' });
    expect(errorServidorExcepcion('motivo_requerido')).toEqual({ campo: 'motivo', clave: 'motivo' });
    expect(errorServidorExcepcion('metodo_invalido')).toEqual({ campo: 'metodo', clave: 'metodo' });
    expect(errorServidorExcepcion('sin_permiso')).toEqual({ campo: null, clave: 'sinPermiso' });
    expect(errorServidorExcepcion('error_hrm')).toEqual({ campo: null, clave: 'generico' });
  });
});

describe('metodosLetrero', () => {
  test('solo los métodos de M0 activos en la sede', () => {
    expect(metodosLetrero({ qr: { activo: false, reglas: {} } })).toEqual(['celular_ubicacion', 'nfc_etiqueta']);
    expect(metodosLetrero(null)).toEqual(['celular_ubicacion', 'qr', 'nfc_etiqueta']);
  });
});
