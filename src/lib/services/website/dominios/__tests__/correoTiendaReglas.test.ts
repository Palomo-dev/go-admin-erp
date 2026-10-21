import {
  debePublicar,
  dominioDeEnvio,
  hostDeZona,
  nombreRelativo,
  registrosDeProveedor,
  yaTieneRemitenteVerificado,
} from '../correoTiendaReglas';

describe('correo de pedidos de la tienda', () => {
  test('el envío sale de send. y no de un subdominio de la plataforma', () => {
    expect(hostDeZona('tienda.example', 'custom_domain')).toBe('tienda.example');
    expect(hostDeZona('www.tienda.example', 'www_alias')).toBe('tienda.example');
    expect(hostDeZona('tienda.goadmin.io', 'system_subdomain')).toBeNull();
    expect(hostDeZona('otro.goadmin.io', 'custom_domain')).toBeNull();
    expect(dominioDeEnvio('tienda.example')).toBe('send.tienda.example');
    expect(dominioDeEnvio('send.tienda.example')).toBe('send.tienda.example');
  });

  test('un dominio ya verificado no se vuelve a crear', () => {
    const filas = [{ domain: 'tienda.example', status: 'verified' }];
    expect(yaTieneRemitenteVerificado(filas, 'tienda.example')).toBe(true);
    expect(yaTieneRemitenteVerificado([{ domain: 'send.tienda.example', status: 'verified' }], 'tienda.example')).toBe(true);
    expect(yaTieneRemitenteVerificado([{ domain: 'tienda.example', status: 'pending' }], 'tienda.example')).toBe(false);
  });

  test('el nombre DNS queda relativo a la zona y el DMARC existente no se pisa', () => {
    expect(nombreRelativo('send.tienda.example', 'tienda.example')).toBe('send');
    expect(nombreRelativo('resend._domainkey.send.tienda.example', 'tienda.example')).toBe('resend._domainkey.send');
    const registros = registrosDeProveedor([
      { type: 'TXT', name: 'send.tienda.example', value: 'v=spf1 include:amazonses.com ~all' },
      { type: 'MX', name: 'send.tienda.example', value: 'feedback-smtp.amazonses.com', priority: 10 },
    ], 'tienda.example');
    expect(registros.map((r) => r.nombre)).toContain('_dmarc.tienda.example');
    expect(debePublicar(
      [{ tipo: 'TXT', nombre: '_dmarc', valor: 'v=DMARC1; p=reject;' }],
      { tipo: 'TXT', nombre: '_dmarc.tienda.example', valor: 'v=DMARC1; p=none;', prioridad: null },
      'tienda.example',
    )).toBe(false);
    expect(debePublicar([], registros[0], 'tienda.example')).toBe(true);
  });
});
