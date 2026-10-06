/**
 * Nombres de dominio y reglas de la compra (Figma B/07-06, 07-13…07-19).
 * Puro; hosts y datos ficticios.
 */
import { errorSubdominio, esApex, esHostValido, nombreBaseBusqueda, nombreRelativo, normalizarHost, textoRegistros, zonaDe } from '../nombreDns';
import {
  alternativas,
  candidatosBusqueda,
  contactoRegistrador,
  esOferta,
  falloDeCompra,
  recomendada,
  validarTitular,
  type OpcionDominio,
} from '../busquedaDominio';

describe('nombreDns', () => {
  test('normaliza lo que la persona escribe', () => {
    expect(normalizarHost('  https://www.TuMarca.com.co/inicio?x=1 ')).toBe('tumarca.com.co');
    expect(normalizarHost('tumarca.com.')).toBe('tumarca.com');
    expect(normalizarHost('http://shop.tumarca.co:8080')).toBe('shop.tumarca.co');
  });

  test('valida la forma (sin rutas ni caracteres que viajarían a la API de Vercel)', () => {
    expect(esHostValido('tumarca.com.co')).toBe(true);
    expect(esHostValido('tumarca')).toBe(false);
    expect(esHostValido('../tumarca.com')).toBe(false);
    expect(esHostValido('tu marca.com')).toBe(false);
  });

  test('zona y nombre relativo como se escriben en el proveedor', () => {
    expect(zonaDe('tumarca.com.co')).toBe('tumarca.com.co');
    expect(zonaDe('shop.tumarca.com.co')).toBe('tumarca.com.co');
    expect(zonaDe('shop.tumarca.com')).toBe('tumarca.com');
    expect(esApex('tumarca.com.co')).toBe(true);
    expect(esApex('shop.tumarca.com')).toBe(false);
    expect(nombreRelativo('tumarca.com', 'tumarca.com')).toBe('@');
    expect(nombreRelativo('www.tumarca.com', 'tumarca.com')).toBe('www');
    expect(nombreRelativo('_vercel.tumarca.com.', 'tumarca.com')).toBe('_vercel');
  });

  test('nombre base para buscar', () => {
    expect(nombreBaseBusqueda('Tu Marca')).toBe('tumarca');
    expect(nombreBaseBusqueda('tumarca.co')).toBe('tumarca');
    expect(nombreBaseBusqueda('Cafetería Ñandú')).toBe('cafeterianandu');
  });
});

describe('búsqueda', () => {
  test('el dominio escrito primero y luego las extensiones sugeridas, sin repetir', () => {
    expect(candidatosBusqueda('tumarca')).toEqual(['tumarca.com', 'tumarca.co', 'tumarca.com.co', 'tumarca.shop', 'tumarca.store']);
    expect(candidatosBusqueda('tumarca.co')).toEqual(['tumarca.co', 'tumarca.com', 'tumarca.com.co', 'tumarca.shop', 'tumarca.store']);
    expect(candidatosBusqueda('a')).toEqual([]);
  });

  const op = (dominio: string, disponible: boolean, precio: number | null, renovacion: number | null = precio): OpcionDominio => ({ dominio, disponible, precio, renovacion, moneda: 'USD' });

  test('recomendada, oferta del primer año y alternativas', () => {
    const lista = [op('tumarca.com', false, null), op('tumarca.co', true, 30), op('tumarca.shop', true, 3, 40)];
    expect(recomendada(lista)).toBe('tumarca.co');
    expect(esOferta(lista[2])).toBe(true);
    expect(esOferta(lista[1])).toBe(false);
    expect(alternativas(lista, 'tumarca.co').map((o) => o.dominio)).toEqual(['tumarca.shop']);
  });
});

describe('titular y contacto del registrador', () => {
  const titular = {
    nombre: 'Mi empresa S.A.S.',
    correo: 'admin@tumarca.com',
    telefono: '+57 300 000 0000',
    direccion: 'Calle 00 # 00-00',
    ciudad: 'Ciudad',
    departamento: 'Departamento',
    codigoPostal: '000000',
    pais: 'CO',
  };

  test('valida obligatorios, correo y teléfono con indicativo', () => {
    expect(validarTitular(titular)).toEqual({});
    expect(validarTitular({ ...titular, correo: 'sin-arroba', telefono: '3000000000', ciudad: ' ' })).toEqual({
      correo: 'correoInvalido',
      telefono: 'telefonoInvalido',
      ciudad: 'obligatorio',
    });
  });

  test('arma nombre y apellido para el registrador', () => {
    expect(contactoRegistrador(titular)).toMatchObject({ firstName: 'Mi', lastName: 'empresa S.A.S.', country: 'CO', email: 'admin@tumarca.com' });
    expect(contactoRegistrador({ ...titular, nombre: 'Unanombre' })).toMatchObject({ firstName: 'Unanombre', lastName: 'Unanombre' });
  });

  test('traduce los errores de /api/domains/purchase a su pantalla', () => {
    expect(falloDeCompra(409, 'DOMAIN_ALREADY_REGISTERED', null)).toEqual({ tipo: 'no_disponible' });
    expect(falloDeCompra(400, 'DOMAIN_REGISTRATION_FAILED', null)).toEqual({ tipo: 'registrador', reembolsado: true });
    expect(falloDeCompra(502, 'REFUND_PENDING', null)).toEqual({ tipo: 'registrador', reembolsado: false });
    expect(falloDeCompra(400, 'INVALID_PHONE', null)).toEqual({ tipo: 'telefono' });
    expect(falloDeCompra(503, null, 'no disponible')).toEqual({ tipo: 'sin_servicio' });
    expect(falloDeCompra(400, null, 'El pago no pudo ser procesado.')).toEqual({ tipo: 'rechazado', codigo: null, mensaje: null });
    expect(falloDeCompra(500, null, 'otra cosa')).toEqual({ tipo: 'general', mensaje: 'otra cosa' });
  });
});

describe('piezas de los diálogos', () => {
  test('«Copiar todo» deja una línea por registro', () => {
    expect(
      textoRegistros([
        { tipo: 'A', nombre: '@', valor: '192.0.2.1' },
        { tipo: 'CNAME', nombre: 'www', valor: 'destino.example.net' },
      ]),
    ).toBe('A\t@\t192.0.2.1\nCNAME\twww\tdestino.example.net');
  });

  test('pista del subdominio', () => {
    expect(errorSubdominio('tu-marca', 'tu-marca')).toBe('igual');
    expect(errorSubdominio('-mal', null)).toBe('invalido');
    expect(errorSubdominio('ab', null)).toBe('invalido');
    expect(errorSubdominio('a--b', null)).toBe('invalido');
    expect(errorSubdominio('mi-tienda', 'otra')).toBeNull();
  });
});
