/**
 * Forma del manifiesto que el sitio publica y host que el servidor puede pedir.
 */
import { hostPublicoSeguro, manifiestoDeCuerpo, manifiestoValido } from '../manifiestoSitio';

const VALIDO = {
  version: '1',
  sections: [{ type: 'hero', variants: ['banner'], contentKeys: ['title'] }],
};

describe('manifiesto del sitio', () => {
  it('acepta el contrato y rechaza HTML u otra forma', () => {
    expect(manifiestoDeCuerpo(VALIDO)).toEqual(VALIDO);
    expect(manifiestoValido(VALIDO)).toBe(true);
    expect(manifiestoDeCuerpo('<html></html>')).toBeNull();
    expect(manifiestoDeCuerpo({ version: '1' })).toBeNull();
    expect(manifiestoDeCuerpo({ version: '', sections: [] })).toBeNull();
    expect(manifiestoDeCuerpo({ version: '1', sections: [{ type: 'hero', variants: [1], contentKeys: [] }] })).toBeNull();
    expect(manifiestoDeCuerpo(null)).toBeNull();
  });

  it('solo deja pasar un host DNS, sin puerto ni ruta', () => {
    expect(hostPublicoSeguro('Tienda.GoAdmin.io')).toBe('tienda.goadmin.io');
    expect(hostPublicoSeguro('tienda.goadmin.io.')).toBe('tienda.goadmin.io');
    expect(hostPublicoSeguro('localhost')).toBeNull();
    expect(hostPublicoSeguro('tienda.goadmin.io:443')).toBeNull();
    expect(hostPublicoSeguro('tienda.goadmin.io/api')).toBeNull();
    expect(hostPublicoSeguro('user@tienda.goadmin.io')).toBeNull();
    expect(hostPublicoSeguro('169.254.169.254')).toBeNull();
    expect(hostPublicoSeguro('..goadmin.io')).toBeNull();
    expect(hostPublicoSeguro('')).toBeNull();
    expect(hostPublicoSeguro(null)).toBeNull();
  });
});
