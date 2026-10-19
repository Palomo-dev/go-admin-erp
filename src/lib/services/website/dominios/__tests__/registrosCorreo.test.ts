import type { DnsRecord } from '@/lib/services/crm/email/types';
import { hostsPendientes, nombreEnZona, registroYaPublicado, registrosDeProveedor } from '../registrosCorreo';

const ZONA = 'tienda.example';

function reg(parcial: Partial<DnsRecord>): DnsRecord {
  return { record: 'SPF', name: '', type: 'TXT', value: '', ...parcial };
}

describe('registros de correo en la zona del dominio', () => {
  test('el nombre queda relativo a la zona y un dominio ajeno no se publica', () => {
    expect(nombreEnZona(ZONA, 'send.tienda.example')).toBe('send');
    expect(nombreEnZona(ZONA, 'resend._domainkey.tienda.example.')).toBe('resend._domainkey');
    expect(nombreEnZona(ZONA, '_dmarc.tienda.example')).toBe('_dmarc');
    expect(nombreEnZona(ZONA, ZONA)).toBe('');
    expect(nombreEnZona(ZONA, '@')).toBe('');
    expect(nombreEnZona(ZONA, 'send')).toBe('send');
    expect(nombreEnZona(ZONA, 'otro.com')).toBeNull();
    expect(nombreEnZona(ZONA, 'mail.otro.com')).toBeNull();
  });

  test('MX, TXT y CNAME se traducen; el DKIM no cambia de mayúsculas', () => {
    const registros = registrosDeProveedor(ZONA, [
      reg({ record: 'SPF', name: `send.${ZONA}`, type: 'MX', value: 'feedback-smtp.us-east-1.amazonses.com.', priority: 10 }),
      reg({ record: 'SPF', name: 'send', type: 'TXT', value: '"v=spf1 include:amazonses.com ~all"' }),
      reg({ record: 'DKIM', name: `resend._domainkey.${ZONA}`, type: 'TXT', value: 'p=ClaveDKIM' }),
      reg({ record: 'DMARC', name: `_dmarc.${ZONA}`, type: 'TXT', value: `v=DMARC1; p=none; rua=mailto:dmarc@${ZONA}` }),
      reg({ name: 'mail.otro.com', type: 'CNAME', value: 'destino.example' }),
    ]);
    expect(registros).toEqual([
      { name: 'send', type: 'MX', value: 'feedback-smtp.us-east-1.amazonses.com', mxPriority: 10 },
      { name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all' },
      { name: 'resend._domainkey', type: 'TXT', value: 'p=ClaveDKIM' },
      { name: '_dmarc', type: 'TXT', value: `v=DMARC1; p=none; rua=mailto:dmarc@${ZONA}` },
    ]);
  });

  test('un registro ya publicado no se vuelve a crear', () => {
    const nuevo = { name: 'send', type: 'TXT' as const, value: 'v=spf1 include:amazonses.com ~all' };
    expect(registroYaPublicado([{ name: 'send', type: 'TXT', value: '"v=spf1 include:amazonses.com ~all"' }], nuevo)).toBe(true);
    expect(registroYaPublicado([{ name: 'send', type: 'TXT', value: 'otro' }], nuevo)).toBe(false);
  });

  test('solo entran dominios comprados que la organización tiene y que aún no verifican correo', () => {
    const pendientes = hostsPendientes(
      [
        { organizationId: 10, host: 'principal.example' },
        { organizationId: 10, host: 'secundario.example' },
        { organizationId: 11, host: 'ajeno.example' },
      ],
      [
        { organizationId: 10, host: 'secundario.example', principal: false },
        { organizationId: 10, host: 'principal.example', principal: true },
        { organizationId: 10, host: 'sin-compra.example', principal: true },
        { organizationId: 11, host: 'ajeno.example', principal: true },
      ],
      [{ organizationId: 11, host: 'ajeno.example', verificado: true }],
    );
    expect(pendientes).toEqual([
      { organizationId: 10, host: 'principal.example' },
      { organizationId: 10, host: 'secundario.example' },
    ]);
  });
});
