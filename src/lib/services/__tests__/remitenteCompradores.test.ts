/**
 * Remitente de los correos a compradores (regla del dueño 2026-11-24): el comprador nunca ve
 * «GO Admin» como nombre ni, con CORREO_RESPALDO_TIENDAS configurada, una dirección de la
 * plataforma.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ENV = { ...process.env };

function cargar() {
  let m: typeof import('../remitenteCompradores');
  jest.isolateModules(() => {
    m = require('../remitenteCompradores');
  });
  return m!;
}

afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

describe('remitenteCompradores', () => {
  it('con CORREO_RESPALDO_TIENDAS: nombre del negocio y la dirección neutra (sin el nombre de la variable)', () => {
    process.env.CORREO_RESPALDO_TIENDAS = 'Cualquier Nombre <Pedidos@Correo-Neutro.example>';
    const { remitenteComprador, correoRespaldoTiendas } = cargar();
    expect(correoRespaldoTiendas('notificaciones@goadmin.io')).toBe('pedidos@correo-neutro.example');
    expect(remitenteComprador('Casa de Prueba')).toBe('Casa de Prueba <pedidos@correo-neutro.example>');
  });

  it('sin la variable: la dirección de siempre, con el nombre del negocio y un aviso una sola vez', () => {
    delete process.env.CORREO_RESPALDO_TIENDAS;
    process.env.EMAIL_FROM_ADDRESS = 'notificaciones@goadmin.io';
    process.env.EMAIL_FROM_NAME = 'GO Admin';
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { remitenteComprador } = cargar();
    expect(remitenteComprador('Casa de Prueba')).toBe('Casa de Prueba <notificaciones@goadmin.io>');
    expect(remitenteComprador('Otra')).toBe('Otra <notificaciones@goadmin.io>');
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it('sin nombre de negocio: solo la dirección, nunca «GO Admin»', () => {
    process.env.CORREO_RESPALDO_TIENDAS = 'pedidos@correo-neutro.example';
    process.env.EMAIL_FROM_NAME = 'GO Admin';
    const { remitenteComprador } = cargar();
    expect(remitenteComprador('')).toBe('pedidos@correo-neutro.example');
    expect(remitenteComprador(null)).not.toMatch(/go ?admin/i);
  });

  it('el nombre no rompe la cabecera', () => {
    process.env.CORREO_RESPALDO_TIENDAS = 'pedidos@correo-neutro.example';
    const { remitenteComprador } = cargar();
    expect(remitenteComprador('Tienda <x>\r\nBcc: y')).toBe('Tienda x Bcc: y <pedidos@correo-neutro.example>');
  });

  it('ningún correo a compradores arma su remitente con EMAIL_FROM_NAME ni «GO Admin»', () => {
    const raiz = join(__dirname, '..', '..', '..', '..');
    for (const ruta of [
      'src/lib/services/orderStatusEmailService.ts',
      'src/lib/services/webOrderChanges/webOrderChangesServer.ts',
      'src/app/api/cron/reservas-mesas/route.ts',
      'src/app/api/pos/reservas-mesas/[id]/aviso/route.ts',
      'src/lib/services/crm/email/domainsService.ts',
    ]) {
      const fuente = readFileSync(join(raiz, ruta), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect({ ruta, nombre: /EMAIL_FROM_NAME|'GO Admin'|vía \$\{g\.fromName\}/.test(fuente) }).toEqual({ ruta, nombre: false });
      expect({ ruta, central: /remitenteComprador\(/.test(fuente) }).toEqual({ ruta, central: true });
    }
  });
});
