/**
 * QR de una mesa de una SEDE con sitio propio (bug de la org 326: hotel con la sede 531 de tipo
 * restaurante, servida en `/<slug>`). El QR llevaba al sitio del hotel, que no tiene la página
 * «Carta QR»; tiene que llevar a la carta de la sede de la mesa. Las mesas de la sede principal
 * y las de una sede sin sitio aparte siguen exactamente igual (org 140, una sola sede).
 */
import { baseCartaDeSede, urlCartaGeneral, urlQrMesa } from '../qrMesa';
import { baseWebDeSede } from '@/lib/organizacion/sucursales';

const MESA = 'DFAE6652-3E00-4763-92F5-0BF19F4AFB3A';
const HOST = 'hotel-ejemplo.goadmin.io';

/** Sede 531: restaurante del hotel, publicada en la web con slug. */
const sedeRestaurante = { is_main: false, is_active: true, is_web_published: true, slug: 'restaurante', custom_domain: null };
/** Sede 530: la principal, sin slug ni publicación propia. */
const sedePrincipal = { is_main: true, is_active: true, is_web_published: false, slug: null, custom_domain: null };

describe('QR de la mesa según su sede', () => {
  it('mesa de una sede servida por /<slug>: la carta de ESA sede', () => {
    expect(urlQrMesa(HOST, MESA, sedeRestaurante)).toBe(
      'https://hotel-ejemplo.goadmin.io/restaurante/menu?mesa=dfae6652-3e00-4763-92f5-0bf19f4afb3a',
    );
    expect(urlCartaGeneral(HOST, sedeRestaurante)).toBe('https://hotel-ejemplo.goadmin.io/restaurante/menu');
  });

  it('mesa de una sede con dominio propio: ese dominio', () => {
    const conDominio = { ...sedeRestaurante, custom_domain: 'restaurante.ejemplo.co' };
    expect(urlQrMesa(HOST, MESA, conDominio)).toBe('https://restaurante.ejemplo.co/menu?mesa=dfae6652-3e00-4763-92f5-0bf19f4afb3a');
  });

  it('sin regresión: sin sede, sede principal o sede sin sitio aparte → el principal como antes', () => {
    const antes = 'https://hotel-ejemplo.goadmin.io/menu?mesa=dfae6652-3e00-4763-92f5-0bf19f4afb3a';
    expect(urlQrMesa(HOST, MESA)).toBe(antes);
    expect(urlQrMesa(HOST, MESA, null)).toBe(antes);
    expect(urlQrMesa(HOST, MESA, sedePrincipal)).toBe(antes);
    // Principal publicada con slug: el sitio acepta sus mesas en el principal (resolve), sin cambio.
    expect(urlQrMesa(HOST, MESA, { ...sedeRestaurante, is_main: true })).toBe(antes);
    expect(urlQrMesa(HOST, MESA, { ...sedeRestaurante, is_web_published: false })).toBe(antes);
    expect(urlQrMesa(HOST, MESA, { ...sedeRestaurante, is_active: false })).toBe(antes);
    expect(urlQrMesa(HOST, MESA, { ...sedeRestaurante, slug: null })).toBe(antes);
    expect(urlCartaGeneral(HOST)).toBe('https://hotel-ejemplo.goadmin.io/menu');
  });

  it('datos inseguros nunca arman una URL rara: cae al principal', () => {
    const antes = 'https://hotel-ejemplo.goadmin.io/menu?mesa=dfae6652-3e00-4763-92f5-0bf19f4afb3a';
    expect(urlQrMesa(HOST, MESA, { ...sedeRestaurante, slug: '../x?y=1' })).toBe(antes);
    expect(urlQrMesa(HOST, MESA, { ...sedeRestaurante, custom_domain: 'evil.com/x?<script>' })).toBe(antes);
  });

  it('sin host usable no hay QR, tenga o no sede', () => {
    expect(urlQrMesa(null, MESA, sedeRestaurante)).toBeNull();
    expect(baseCartaDeSede('evil.com/x?y=<script>', sedeRestaurante)).toBeNull();
    expect(urlCartaGeneral(null)).toBeNull();
  });
});

describe('baseWebDeSede (lienzo del editor y QR)', () => {
  it('acepta el host con o sin https:// y devuelve la base de la sede', () => {
    expect(baseWebDeSede('https://hotel-ejemplo.goadmin.io', sedeRestaurante)).toBe('https://hotel-ejemplo.goadmin.io/restaurante');
    expect(baseWebDeSede('hotel-ejemplo.goadmin.io/', sedeRestaurante)).toBe('https://hotel-ejemplo.goadmin.io/restaurante');
  });
  it('null si el sitio no sirve la sede aparte', () => {
    expect(baseWebDeSede('https://hotel-ejemplo.goadmin.io', sedePrincipal)).toBeNull();
    expect(baseWebDeSede('https://hotel-ejemplo.goadmin.io', null)).toBeNull();
    expect(baseWebDeSede(null, sedeRestaurante)).toBeNull();
  });
});
