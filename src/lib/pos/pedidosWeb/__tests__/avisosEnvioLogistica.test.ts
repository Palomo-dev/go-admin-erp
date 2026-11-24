/**
 * Avisos «en camino», «entregado» y «novedad» con los datos de logística (Figma 2805:5220):
 * domiciliario, código de entrega solo en contraentrega, «Pagas al recibir» y el enlace de rastreo.
 */
import { asuntoAvisoNovedad, motivoNovedadCliente, textoAviso, textoAvisoNovedad, type DatosAviso } from '../avisosCliente';
import { armarCorreoEstado, armarCorreoNovedad } from '@/lib/services/orderStatusEmailService';
import { primerNombre } from '@/lib/services/logistica/avisosEnvioService';

jest.mock('@/lib/services/crm/email/resendClient', () => ({ getMasterResend: jest.fn(), getMasterResendKey: jest.fn(), getResendClient: jest.fn() }));
jest.mock('@/lib/services/crm/email/domainsService', () => ({ resolveSender: jest.fn() }));
jest.mock('@/lib/website/urlPublicaOrg.server', () => ({ hostPublicoOrg: jest.fn() }));

const base: DatosAviso = { cliente: 'Laura Gómez', numero: 'WO-000412', negocio: 'Mi tienda', url: 'https://mi-tienda.co/pedido/WO-000412?t=abc' };

describe('aviso en camino', () => {
  it('con contraentrega: domiciliario, código, valor a pagar y enlace', () => {
    const t = textoAviso('en_camino', { ...base, conductor: 'Andrés', codigoEntrega: '4821', pagaAlRecibir: '$ 128.900' });
    expect(t).toContain('Andrés lleva tu pedido WO-000412.');
    expect(t).toContain('Tu código de entrega es 4821.');
    expect(t).toContain('Pagas al recibir: $ 128.900.');
    expect(t).toContain('Sigue tu pedido aquí: https://mi-tienda.co/pedido/WO-000412?t=abc');
  });

  it('pagado: sin código ni «pagas al recibir»', () => {
    const t = textoAviso('en_camino', { ...base, conductor: 'Andrés' });
    expect(t).not.toMatch(/código de entrega|Pagas al recibir/);
  });
});

describe('aviso entregado', () => {
  it('quién recibió y cómo pagó en la puerta', () => {
    const t = textoAviso('entregado', { ...base, recibio: 'Laura', pagaAlRecibir: '$ 128.900', medioCobro: 'efectivo' });
    expect(t).toContain('lo recibió Laura');
    expect(t).toContain('Pagaste $ 128.900 en efectivo.');
  });
});

describe('aviso novedad', () => {
  it('motivo en palabras del cliente, nuevo intento y enlace', () => {
    const t = textoAvisoNovedad({ cliente: 'Laura Gómez', numero: 'WO-000412', negocio: 'Mi tienda', motivo: 'not_home', nuevoIntento: 'el mar 24 nov', url: 'https://x.co/p' });
    expect(t).toContain('Hola Laura,');
    expect(t).toContain('no pudimos: no había nadie para recibirlo.');
    expect(t).toContain('Lo intentamos de nuevo el mar 24 nov.');
    expect(t).toContain('entra a https://x.co/p');
    expect(asuntoAvisoNovedad('WO-000412')).toBe('No pudimos entregar tu pedido WO-000412');
    expect(motivoNovedadCliente('desconocido')).toBe('tuvimos un inconveniente');
  });

  it('sin fecha: la tienda contacta', () => {
    expect(textoAvisoNovedad({ cliente: '', numero: 'W', negocio: 'N', motivo: null })).toContain('Te contactamos para acordar una nueva entrega.');
  });
});

describe('correo', () => {
  it('en camino con «Pagas al recibir» y el código', () => {
    const c = armarCorreoEstado({
      estado: 'in_delivery',
      numeroPedido: 'WO-000412',
      nombreCliente: 'Laura',
      nombreNegocio: 'Mi tienda',
      urlSeguimiento: 'https://mi-tienda.co/pedido/WO-000412?t=abc',
      envio: { domiciliario: 'Andrés', codigo: '4821', pagaAlRecibir: '$ 128.900' },
    });
    expect(c.html).toContain('Pagas al recibir: $ 128.900');
    expect(c.html).toContain('Código de entrega');
    expect(c.text).toContain('Te lo lleva: Andrés');
    expect(c.text).toContain('Seguimiento: https://mi-tienda.co/pedido/WO-000412?t=abc');
  });

  it('novedad con botón para cambiar dirección u hora', () => {
    const c = armarCorreoNovedad({ numeroPedido: 'WO-1', nombreCliente: 'Laura Gómez', nombreNegocio: 'Mi tienda', motivo: 'wrong_address', nuevoIntento: null, urlSeguimiento: 'https://x.co/p' });
    expect(c.asunto).toBe('No pudimos entregar tu pedido WO-1 · Mi tienda');
    expect(c.html).toContain('Cambiar dirección u hora');
    expect(c.text).toContain('la dirección no corresponde');
  });

  it('del domiciliario, solo el primer nombre', () => {
    expect(primerNombre('Andrés Felipe Gómez')).toBe('Andrés');
    expect(primerNombre('  ')).toBeNull();
  });
});
