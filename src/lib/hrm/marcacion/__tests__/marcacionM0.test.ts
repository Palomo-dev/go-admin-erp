/**
 * Marcación M0 (docs/hrm/PLAN-MARCACION-DISPOSITIVOS.md): QR de 30 s y un solo uso,
 * etiqueta NFC, métodos por sede, excepción temporal, reclamo y lo que decide la
 * pantalla «Marcar turno». Lo que valida de verdad está en la base (probado con
 * transacciones revertidas); aquí, lo que el navegador y el servidor arman.
 */
import { webcrypto } from 'node:crypto';
import { contenidoQr, desfaseServidor, firmaQr, pasoDe, segundosRestantes, siguienteCodigo } from '../qrTotp';
import {
  cambiosMetodos,
  cuerpoMetodos,
  cuerpoReclamo,
  leerEtiqueta,
  MOTIVOS_INTENTO,
  urlEtiqueta,
  validarExcepcion,
  verificacionDeMarca,
} from '../metodos';
import { datosDeMarcacion, leerQr, MarcacionInvalida } from '@/lib/hrm/jornada/marcacion';
import { metodoDeParametro, metodoInicial, metodosDisponibles } from '@/lib/hrm/jornada/marcarLogica';

beforeAll(() => {
  if (!(globalThis as { crypto?: Crypto }).crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

const RELOJ = '0b3234e0-eb69-4b72-8853-1bb84184a22e';

describe('QR que cambia cada 30 s (D9)', () => {
  it('la firma es la misma que calcula Postgres (extensions.hmac)', async () => {
    // select left(encode(extensions.hmac(convert_to('<reloj>.59000000.3','UTF8'), decode(repeat('ab',32),'hex'), 'sha256'),'hex'), 20)
    await expect(firmaQr('ab'.repeat(32), RELOJ, 59000000, 3)).resolves.toBe('5a8c518d75e21aaa6c70');
  });

  it('otro paso u otro número dan otra firma', async () => {
    const a = await firmaQr('ab'.repeat(32), RELOJ, 59000000, 3);
    expect(await firmaQr('ab'.repeat(32), RELOJ, 59000001, 3)).not.toBe(a);
    expect(await firmaQr('ab'.repeat(32), RELOJ, 59000000, 4)).not.toBe(a);
  });

  it('paso de 30 s y segundos que quedan', () => {
    expect(pasoDe(1_770_000_000_000)).toBe(59_000_000);
    expect(pasoDe(1_770_000_029_999)).toBe(59_000_000);
    expect(pasoDe(1_770_000_030_000)).toBe(59_000_001);
    expect(segundosRestantes(1_770_000_000_000)).toBe(30);
    expect(segundosRestantes(1_770_000_024_000)).toBe(6);
  });

  it('un solo uso: tras usar el código n, la pantalla muestra n + 1', () => {
    expect(siguienteCodigo(null)).toBe(0);
    expect(siguienteCodigo(0)).toBe(1);
    expect(siguienteCodigo(7)).toBe(8);
    expect(siguienteCodigo(-1)).toBe(0);
  });

  it('el contenido lo lee el mismo lector de siempre (leerQr) y viaja a la base sin cambios', () => {
    const c = contenidoQr({ relojId: RELOJ, org: 135, paso: 59000000, n: 2, firma: '5a8c518d75e21aaa6c70' });
    expect(leerQr(c)).toEqual({ relojId: RELOJ, token: '59000000.2.5a8c518d75e21aaa6c70', org: 135 });
    const d = datosDeMarcacion({ qr: c }, 135);
    expect(d).toMatchObject({ metodo: 'qr', reloj_id: RELOJ, token: '59000000.2.5a8c518d75e21aaa6c70' });
    expect(() => datosDeMarcacion({ qr: c }, 136)).toThrow(MarcacionInvalida);
  });

  it('la pantalla usa la hora del servidor (desfase)', () => {
    expect(desfaseServidor('2026-11-16T12:00:10.000Z', Date.parse('2026-11-16T12:00:00.000Z'))).toBe(10_000);
    expect(desfaseServidor(null, 0)).toBe(0);
  });
});

describe('Etiqueta NFC', () => {
  const codigo = 'Ab_cd-EfGhIjKlMnOpQrStUv';

  it('lo que se graba se vuelve a leer: URL, parámetro o «reloj.código»', () => {
    const url = urlEtiqueta('https://app.ejemplo.co/', RELOJ, codigo);
    expect(url).toBe(`https://app.ejemplo.co/marcar?nfc=${RELOJ}.${codigo}`);
    expect(leerEtiqueta(url)).toEqual({ relojId: RELOJ, codigo });
    expect(leerEtiqueta(`?nfc=${RELOJ}.${codigo}`)).toEqual({ relojId: RELOJ, codigo });
    expect(leerEtiqueta(`${RELOJ}.${codigo}`)).toEqual({ relojId: RELOJ, codigo });
  });

  it('rechaza lo que no es una etiqueta de marcación', () => {
    expect(leerEtiqueta('https://otro.sitio/promo')).toBeNull();
    expect(leerEtiqueta(`no-uuid.${codigo}`)).toBeNull();
    expect(leerEtiqueta(`${RELOJ}.corto`)).toBeNull();
    expect(leerEtiqueta(42)).toBeNull();
  });

  it('el cuerpo de la marca solo lleva el punto y el código; la hora y la sede las pone la base', () => {
    const d = datosDeMarcacion({ nfc: urlEtiqueta('https://x.co', RELOJ, codigo), ubicacion: { lat: 4.6, lng: -74.08 }, hora: '2020-01-01T00:00:00Z' }, 1);
    expect(d).toMatchObject({ metodo: 'nfc', reloj_id: RELOJ, token: codigo, ubicacion: { lat: 4.6, lng: -74.08 } });
    expect(d).not.toHaveProperty('hora');
    expect(() => datosDeMarcacion({ nfc: 'basura' }, 1)).toThrow('etiqueta_invalida');
  });
});

describe('Métodos por sede (20.27)', () => {
  const base = {
    celular_ubicacion: { activo: true, reglas: { radio_m: 150, permitir_computador: true } },
    qr: { activo: true, reglas: { exigir_ubicacion: false } },
    nfc_etiqueta: { activo: true, reglas: {} },
  };

  it('arma el cuerpo solo con los métodos de M0 y sus reglas', () => {
    const r = cuerpoMetodos({ ...base, qr: { activo: true, reglas: { exigir_ubicacion: true, otra: 1 } } });
    expect(r).toEqual({
      ok: true,
      metodos: {
        celular_ubicacion: { activo: true, reglas: { radio_m: 150, permitir_computador: true } },
        qr: { activo: true, reglas: { exigir_ubicacion: true } },
        nfc_etiqueta: { activo: true, reglas: {} },
      },
    });
  });

  it('la sede necesita al menos un método; radio entre 20 y 2000 m; kiosco y relojes aún no', () => {
    expect(cuerpoMetodos({ celular_ubicacion: { activo: false, reglas: {} }, qr: { activo: false, reglas: {} }, nfc_etiqueta: { activo: false, reglas: {} } })).toEqual({ ok: false, error: 'sin_metodos' });
    expect(cuerpoMetodos({ ...base, celular_ubicacion: { activo: true, reglas: { radio_m: 5 } } })).toEqual({ ok: false, error: 'radio_invalido' });
    expect(cuerpoMetodos({ ...base, huella: { activo: true, reglas: {} } })).toEqual({ ok: false, error: 'metodo_no_disponible' });
  });

  it('cuenta los métodos cambiados para «Cambios sin guardar»', () => {
    expect(cambiosMetodos(base, base)).toBe(0);
    expect(cambiosMetodos(base, { ...base, qr: { activo: false, reglas: { exigir_ubicacion: false } } })).toBe(1);
  });
});

describe('Excepción temporal (20.27.11)', () => {
  const ok = { vinculoId: 'x', metodo: 'pin', desde: '2026-11-10', hasta: '2026-11-30', motivo: 'Lesión en la mano' };

  it('válida con persona, método, fechas de hasta 90 días y motivo', () => {
    expect(validarExcepcion(ok, '2026-11-16')).toBeNull();
  });

  it('errores en orden de la pantalla', () => {
    expect(validarExcepcion({ ...ok, vinculoId: null }, '2026-11-16')).toBe('persona');
    expect(validarExcepcion({ ...ok, metodo: 'telepatia' }, '2026-11-16')).toBe('metodo');
    expect(validarExcepcion({ ...ok, hasta: '2026-11-01' }, '2026-11-16')).toBe('fechas');
    expect(validarExcepcion({ ...ok, desde: '2026-11-01', hasta: '2027-02-15' }, '2026-11-16')).toBe('tope');
    expect(validarExcepcion({ ...ok, desde: '2026-10-01', hasta: '2026-10-10' }, '2026-11-16')).toBe('pasado');
    expect(validarExcepcion({ ...ok, motivo: 'no' }, '2026-11-16')).toBe('motivo');
  });
});

describe('Reclamo de una marca (R2, 20.31.6)', () => {
  const ev = '4566cdd4-519c-47b6-a5f8-a6f9e65583f0';

  it('«no es mía» pide excluir la marca; con hora correcta se propone otra; la original no cambia', () => {
    expect(cuerpoReclamo({ eventoId: ev, que: 'no_es_mia', motivo: 'No vine ese día' })).toEqual({
      ok: true,
      cuerpo: { evento_id: ev, que: 'no_es_mia', motivo: 'No vine ese día', excluir: true },
    });
    expect(cuerpoReclamo({ eventoId: ev, que: 'hora', motivo: 'Llegué a las 5:58', hora: '2026-11-14T10:58:00Z' })).toEqual({
      ok: true,
      cuerpo: { evento_id: ev, que: 'hora', motivo: 'Llegué a las 5:58', hora: '2026-11-14T10:58:00Z' },
    });
  });

  it('valida qué está mal, el motivo y una hora con zona', () => {
    expect(cuerpoReclamo({ eventoId: ev, que: 'x', motivo: 'Algo pasó' })).toEqual({ ok: false, error: 'que' });
    expect(cuerpoReclamo({ eventoId: ev, que: 'hora', motivo: 'no' })).toEqual({ ok: false, error: 'motivo' });
    expect(cuerpoReclamo({ eventoId: ev, que: 'hora', motivo: 'Llegué antes', hora: '05:58' })).toEqual({ ok: false, error: 'hora' });
  });
});

describe('En vivo: verificación de cada marca (20.26)', () => {
  it('cada caso con su insignia', () => {
    expect(verificacionDeMarca({ metodo: 'celular_ubicacion', ubicacion_validada: true })).toEqual({ clave: 'dentro', tono: 'exito' });
    expect(verificacionDeMarca({ metodo: 'qr' })).toEqual({ clave: 'verificada', tono: 'exito' });
    expect(verificacionDeMarca({ metodo: 'qr', tarde_minutos: 18 })).toEqual({ clave: 'tarde', tono: 'advertencia', minutos: 18 });
    expect(verificacionDeMarca({ metodo: 'remoto' })).toEqual({ clave: 'remoto', tono: 'informacion' });
    expect(verificacionDeMarca({ metodo: 'manual', manual: true })).toEqual({ clave: 'pendiente_aprobacion', tono: 'advertencia' });
    expect(verificacionDeMarca({ metodo: 'celular_ubicacion', revisar: 'fuera_de_linea' })).toEqual({ clave: 'sin_senal', tono: 'neutro' });
    expect(verificacionDeMarca({ metodo: 'celular_ubicacion', revisar: 'computador_sin_qr' })).toEqual({ clave: 'computador', tono: 'advertencia' });
  });

  it('los rechazos que se guardan como intento incluyen el QR ya usado y la etiqueta de otra sede', () => {
    expect(MOTIVOS_INTENTO.has('qr_ya_usado')).toBe(true);
    expect(MOTIVOS_INTENTO.has('etiqueta_otra_sede')).toBe(true);
    expect(MOTIVOS_INTENTO.has('marcacion_duplicada')).toBe(false);
  });
});

describe('«Marcar turno» según la sede (20.30)', () => {
  it('sin metodos_sede (respuesta anterior) se comporta como antes', () => {
    expect(metodosDisponibles({ mecanismos: ['app', 'qr'], modalidad: 'presencial' }, 1)).toEqual(['ubicacion', 'qr']);
  });

  it('con la sede: suma NFC y quita lo que la sede no ofrece', () => {
    const e = { mecanismos: ['app', 'qr', 'nfc'], modalidad: 'presencial' as const };
    expect(metodosDisponibles({ ...e, metodos_sede: { ubicacion: true, qr: true, nfc: true } }, 1)).toEqual(['ubicacion', 'qr', 'nfc']);
    expect(metodosDisponibles({ ...e, metodos_sede: { ubicacion: false, qr: true, nfc: false } }, 1)).toEqual(['qr']);
    expect(metodosDisponibles({ mecanismos: ['app'], modalidad: 'remoto', metodos_sede: { ubicacion: true, qr: true, nfc: true } }, 1)).toEqual(['remoto']);
  });

  it('abre el método pedido (?metodo=) o el preferido de la sede', () => {
    expect(metodoDeParametro('qr')).toBe('qr');
    expect(metodoDeParametro('otro')).toBeNull();
    expect(metodoInicial(['ubicacion', 'qr'], 'presencial', 'ubicacion', 'qr')).toBe('qr');
    expect(metodoInicial(['qr', 'nfc'], 'presencial', 'qr', null)).toBe('qr');
    expect(metodoInicial(['ubicacion', 'qr'], 'presencial', null, 'nfc')).toBe('ubicacion');
    expect(metodoInicial(['ubicacion', 'remoto'], 'remoto', 'ubicacion', null)).toBe('remoto');
  });
});
