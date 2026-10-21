import { hostSitio, urlPublicaDeHost, type DominioDelSitio } from '../hostSitio';

function fila(parcial: Partial<DominioDelSitio> & Pick<DominioDelSitio, 'host' | 'domain_type'>): DominioDelSitio {
  return {
    status: 'verified',
    is_primary: true,
    is_active: true,
    ...parcial,
  };
}

describe('url pública de la tienda', () => {
  it('el dominio propio principal verificado gana', () => {
    const host = hostSitio(
      [
        fila({ host: 'tienda.example', domain_type: 'custom_domain', updated_at: '2026-01-01T00:00:00Z' }),
        fila({ host: 'tienda.goadmin.io', domain_type: 'system_subdomain', is_primary: false }),
      ],
      'tienda',
    );
    expect(host).toBe('tienda.example');
    expect(urlPublicaDeHost(host)).toBe('https://tienda.example');
  });

  it('un principal sin verificar, inactivo o que no es el principal no gana', () => {
    expect(hostSitio([fila({ host: 'pendiente.example', domain_type: 'custom_domain', status: 'pending' })], 'tienda')).toBe('tienda.goadmin.io');
    expect(hostSitio([fila({ host: 'apagado.example', domain_type: 'custom_domain', is_active: false })], 'tienda')).toBe('tienda.goadmin.io');
    expect(hostSitio([fila({ host: 'secundario.example', domain_type: 'custom_domain', is_primary: false })], 'tienda')).toBe('tienda.goadmin.io');
  });

  it('sin dominio propio usa el subdominio del sistema y, si no hay, el de la organización', () => {
    expect(hostSitio([fila({ host: 'marca.goadmin.io', domain_type: 'system_subdomain' })], 'otro')).toBe('marca.goadmin.io');
    expect(hostSitio([], 'tienda')).toBe('tienda.goadmin.io');
    expect(hostSitio([], '')).toBeNull();
    expect(hostSitio([], 'no es un subdominio')).toBeNull();
    expect(urlPublicaDeHost(null)).toBeNull();
  });

  it('si hubiera dos principales, gana el actualizado más reciente', () => {
    expect(
      hostSitio(
        [
          fila({ host: 'viejo.example', domain_type: 'custom_domain', updated_at: '2026-01-01T00:00:00Z' }),
          fila({ host: 'nuevo.example', domain_type: 'custom_domain', updated_at: '2026-06-01T00:00:00Z' }),
        ],
        'tienda',
      ),
    ).toBe('nuevo.example');
  });

  it('no arma la URL con un host basura ni con un esquema pegado', () => {
    expect(hostSitio([fila({ host: 'https://Tienda.Example/ruta', domain_type: 'custom_domain' })], 'tienda')).toBe('tienda.example');
    expect(hostSitio([fila({ host: 'no es un host', domain_type: 'custom_domain' })], 'tienda')).toBe('tienda.goadmin.io');
  });

  it('un host vacío no cuenta, y un alias www tampoco', () => {
    expect(hostSitio([fila({ host: '', domain_type: 'custom_domain' })], 'tienda')).toBe('tienda.goadmin.io');
    expect(hostSitio([fila({ host: '   ', domain_type: 'custom_domain' })], '')).toBeNull();
    expect(hostSitio([fila({ host: 'www.tienda.example', domain_type: 'www_alias' })], 'tienda')).toBe('tienda.goadmin.io');
  });
});
