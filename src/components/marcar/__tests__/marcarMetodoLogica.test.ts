/**
 * «Celular según la sede» (Figma 20.30) y el botón de «Tu turno» (20.30.7,
 * 20.31.4): reglas puras. Identificadores ficticios.
 */
import {
  claveAccionMetodo,
  claveMetodoMarca,
  contenidoNdef,
  etiquetaDeUrl,
  hrefMarcarCon,
  leerMetodoTurno,
  metodoEspecial,
  sedeDelError,
  type MetodoTurno,
} from '../marcarMetodoLogica';
import { urlEtiqueta } from '@/lib/hrm/marcacion/metodos';

const RELOJ = '0f8fad5b-d9cb-469f-a165-70867728950e';
const CODIGO = 'abcdefghijklmnop1234';

const metodos = (m: Partial<MetodoTurno['metodos']>, preferido: MetodoTurno['preferido']): MetodoTurno => ({
  preferido,
  metodos: { ubicacion: false, qr: false, nfc: false, remoto: false, ...m },
});

describe('leerMetodoTurno', () => {
  test('valida la respuesta de fn_hr_mi_metodo_marcacion', () => {
    expect(leerMetodoTurno({ preferido: 'qr', metodos: { ubicacion: false, qr: true, nfc: true, remoto: false } })).toEqual(
      metodos({ qr: true, nfc: true }, 'qr')
    );
  });
  test('null, forma rara o preferido desconocido: no rompe', () => {
    expect(leerMetodoTurno(null)).toBeNull();
    expect(leerMetodoTurno('x')).toBeNull();
    expect(leerMetodoTurno({ preferido: 'qr' })).toBeNull();
    expect(leerMetodoTurno({ preferido: 'huella', metodos: { qr: 'si' } })).toEqual(metodos({}, null));
  });
});

describe('metodoEspecial: el botón de Tu turno solo cambia cuando hace falta', () => {
  test('sede solo con QR → qr', () => {
    expect(metodoEspecial(metodos({ qr: true }, 'qr'))).toBe('qr');
  });
  test('sede solo con etiqueta → nfc', () => {
    expect(metodoEspecial(metodos({ nfc: true }, 'nfc'))).toBe('nfc');
  });
  test('varios métodos y el preferido no es ubicación → el preferido', () => {
    expect(metodoEspecial(metodos({ qr: true, nfc: true }, 'qr'))).toBe('qr');
  });
  test('con ubicación preferida no cambia nada (como hoy)', () => {
    expect(metodoEspecial(metodos({ ubicacion: true, qr: true, nfc: true }, 'ubicacion'))).toBeNull();
    expect(metodoEspecial(metodos({ ubicacion: true }, 'ubicacion'))).toBeNull();
  });
  test('remoto, sin datos o un preferido que la sede no ofrece → null', () => {
    expect(metodoEspecial(metodos({ qr: true, remoto: true }, 'remoto'))).toBeNull();
    expect(metodoEspecial(null)).toBeNull();
    expect(metodoEspecial(metodos({ ubicacion: true, qr: true }, 'nfc'))).toBeNull();
  });
  test('único método presencial manda sobre el preferido', () => {
    expect(metodoEspecial(metodos({ qr: true }, 'ubicacion'))).toBe('qr');
  });
});

test('hrefMarcarCon: /marcar?metodo=qr solo con método especial', () => {
  expect(hrefMarcarCon('/marcar', 'qr')).toBe('/marcar?metodo=qr');
  expect(hrefMarcarCon('/marcar?x=1', 'nfc')).toBe('/marcar?x=1&metodo=nfc');
  expect(hrefMarcarCon('/marcar', null)).toBe('/marcar');
  expect(hrefMarcarCon('/marcar', undefined)).toBe('/marcar');
});

test('claveAccionMetodo: texto del botón según estado y método', () => {
  expect(claveAccionMetodo('sinMarcar', 'qr')).toBe('qr.entrada');
  expect(claveAccionMetodo('antes', 'nfc')).toBe('nfc.entrada');
  expect(claveAccionMetodo('sinTurno', 'qr')).toBe('qr.entrada');
  expect(claveAccionMetodo('enTurno', 'qr')).toBe('qr.salida');
  expect(claveAccionMetodo('enDescanso', 'qr')).toBeNull();
  expect(claveAccionMetodo('cerrado', 'qr')).toBeNull();
  expect(claveAccionMetodo('enTurno', null)).toBeNull();
});

describe('etiquetaDeUrl: ?nfc= marca una sola vez', () => {
  test('etiqueta válida → contenido', () => {
    expect(etiquetaDeUrl(`${RELOJ}.${CODIGO}`, false)).toEqual({ contenido: `${RELOJ}.${CODIGO}` });
  });
  test('ya usada o sin parámetro → nada', () => {
    expect(etiquetaDeUrl(`${RELOJ}.${CODIGO}`, true)).toBeNull();
    expect(etiquetaDeUrl(null, false)).toBeNull();
    expect(etiquetaDeUrl('', false)).toBeNull();
  });
  test('parámetro que no es una etiqueta → inválida (se limpia y se avisa, no se manda)', () => {
    expect(etiquetaDeUrl('cualquier-cosa', false)).toEqual({ invalida: true });
  });
});

describe('contenidoNdef', () => {
  const codificar = (s: string) => {
    const b = new TextEncoder().encode(s);
    return new DataView(b.buffer, b.byteOffset, b.byteLength);
  };
  const decodificar = (d: DataView, c: string) => new TextDecoder(c).decode(d);
  const url = urlEtiqueta('https://app.ejemplo.test', RELOJ, CODIGO);

  test('registro de URL de GO Admin', () => {
    expect(contenidoNdef([{ recordType: 'url', data: codificar(url) }], decodificar)).toBe(url);
  });
  test('registro de texto con el código', () => {
    expect(contenidoNdef([{ recordType: 'text', encoding: 'utf-8', data: codificar(`${RELOJ}.${CODIGO}`) }], decodificar)).toBe(`${RELOJ}.${CODIGO}`);
  });
  test('salta registros ajenos y toma el primero válido', () => {
    expect(
      contenidoNdef(
        [
          { recordType: 'mime', data: codificar(url) },
          { recordType: 'url', data: codificar('https://otra.ejemplo.test/') },
          { recordType: 'absolute-url', data: codificar(url) },
        ],
        decodificar
      )
    ).toBe(url);
  });
  test('sin nada útil → null', () => {
    expect(contenidoNdef([], decodificar)).toBeNull();
    expect(contenidoNdef([{ recordType: 'url', data: null }], decodificar)).toBeNull();
    expect(
      contenidoNdef([{ recordType: 'text', data: codificar('x') }], () => {
        throw new Error('codificación');
      })
    ).toBeNull();
  });
});

test('sedeDelError: la sede de etiqueta_otra_sede', () => {
  expect(sedeDelError({ code: 'etiqueta_otra_sede', sede: ' Sede Norte ' })).toBe('Sede Norte');
  expect(sedeDelError({ code: 'etiqueta_otra_sede', sede: null })).toBeNull();
  expect(sedeDelError(null)).toBeNull();
});

test('claveMetodoMarca: la entrada con NFC ya no se muestra como «ubicación»', () => {
  expect(claveMetodoMarca({ metodo: 'nfc' })).toBe('nfc');
  expect(claveMetodoMarca({ metodo: 'qr' })).toBe('qr');
  expect(claveMetodoMarca({ metodo: 'app', modo: 'remoto' })).toBe('remoto');
  expect(claveMetodoMarca({ metodo: 'app', modo: 'presencial' })).toBe('ubicacion');
  expect(claveMetodoMarca(null)).toBeNull();
});
