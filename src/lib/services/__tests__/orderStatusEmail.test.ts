/// <reference types="jest" />
/**
 * Paquete E — correo de estado del pedido web desde el ERP.
 * El token del enlace tiene que ser el MISMO que emite el sitio
 * (goadmin-websites/lib/orders/tokenSeguimiento.ts): se recalcula aquí con el
 * algoritmo literal del sitio.
 */
jest.mock('@/lib/services/crm/email/resendClient', () => ({
  getMasterResend: jest.fn(),
  getMasterResendKey: jest.fn(() => null),
  getResendClient: jest.fn(),
}));
jest.mock('@/lib/services/crm/email/domainsService', () => ({
  resolveSender: jest.fn(),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: jest.fn(async () => 'America/Bogota'),
}));

import { createHash, createHmac } from 'crypto';
import { hostSitio } from '@/lib/website/hostSitio';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getMasterResend, getMasterResendKey, getResendClient } from '@/lib/services/crm/email/resendClient';
import { resolveSender } from '@/lib/services/crm/email/domainsService';
import {
  armarCorreoEstado,
  avisarPagoConfirmadoPasarela,
  enviarAvisoEstado,
  esEstadoConAviso,
  logoPublico,
  marcaDelNegocio,
  normalizarColor,
  tokenSeguimiento,
  urlSeguimiento,
  type EstadoConAviso,
} from '../orderStatusEmailService';

const AZUL_GENERICO = '#3B82F6';
const ROJO = '#EF4444';
const VERDE_MARCA = '#4A7C59';
const LOGO = 'https://cdn.ejemplo.co/logos/org-900.png';

function correo(estado: EstadoConAviso, marca?: { logoUrl?: string | null; color?: string | null } | null) {
  return armarCorreoEstado({
    estado,
    numeroPedido: 'WO-900-1',
    nombreCliente: 'Ana',
    nombreNegocio: 'Tienda de prueba',
    urlSeguimiento: 'https://tienda.ejemplo.co/pedido/WO-900-1',
    marca,
  });
}

/** Cliente falso: devuelve `website_settings` y deja ver si la consulta falló. */
function dbFalsa(sitio: { primary_color: string | null } | null | 'falla'): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (sitio === 'falla') throw new Error('sin red');
            return { data: sitio, error: null };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('orderStatusEmailService', () => {
  const ANTES = { ...process.env };
  afterEach(() => {
    process.env = { ...ANTES };
  });

  it('el token coincide con el del sitio (secreto derivado de la service role)', () => {
    delete process.env.ORDER_TRACKING_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba';
    const sitio = createHmac('sha256', createHash('sha256').update('seguimiento-pedido:clave-de-prueba').digest())
      .update('140:wo-1').digest('base64url').slice(0, 32);
    expect(tokenSeguimiento(140, 'wo-1')).toBe(sitio);
  });

  it('con ORDER_TRACKING_SECRET usa ese secreto', () => {
    process.env.ORDER_TRACKING_SECRET = 'secreto-propio-de-16+';
    const sitio = createHmac('sha256', Buffer.from('secreto-propio-de-16+')).update('140:wo-1').digest('base64url').slice(0, 32);
    expect(tokenSeguimiento(140, 'wo-1')).toBe(sitio);
  });

  it('la URL usa el host público ya resuelto, con el número del pedido', () => {
    process.env.ORDER_TRACKING_SECRET = 'secreto-propio-de-16+';
    expect(urlSeguimiento({ id: 140, host: 'pedidos.ejemplo.co' }, { id: 'wo-1', order_number: 'WO 1' }))
      .toMatch(/^https:\/\/pedidos\.ejemplo\.co\/pedido\/WO%201\?t=/);
    expect(urlSeguimiento({ id: 140, host: hostSitio([], 'demo') }, { id: 'wo-1', order_number: 'W-1' }))
      .toMatch(/^https:\/\/demo\.goadmin\.io\/pedido\/W-1/);
    expect(urlSeguimiento({ id: 140, host: null }, { id: 'wo-1', order_number: 'W-1' })).toBeNull();
  });

  it('arma el correo con el negocio, escapa el HTML y no avisa de pending', () => {
    const c = armarCorreoEstado({
      estado: 'ready',
      numeroPedido: 'W-1',
      nombreCliente: '<b>Ana</b>',
      nombreNegocio: 'Restaurante de prueba',
      urlSeguimiento: 'https://demo.goadmin.io/pedido/W-1',
    });
    expect(c.asunto).toBe('¡Tu pedido está listo! — Pedido W-1 · Restaurante de prueba');
    expect(c.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(c.html).toContain('Ver estado de mi pedido');
    expect(esEstadoConAviso('pending')).toBe(false);
    expect(esEstadoConAviso('in_delivery')).toBe(true);
  });

  describe('marca del negocio en el correo', () => {
    it('sin marca: los colores de siempre y sin logo', () => {
      const c = correo('confirmed');
      expect(c.html).toContain(AZUL_GENERICO);
      expect(c.html).not.toContain('<img');
    });

    it('con logo público: se muestra en la cabecera con el nombre del negocio como alt', () => {
      const c = correo('confirmed', { logoUrl: LOGO });
      expect(c.html).toContain(`<img src="${LOGO}" alt="Tienda de prueba"`);
      // El logo va en la cabecera, antes del título.
      expect(c.html.indexOf('<img')).toBeLessThan(c.html.indexOf('<h1'));
    });

    it('un logo que no es https público no se muestra', () => {
      for (const logoUrl of ['organizations/temp/logo.png', 'http://cdn.ejemplo.co/l.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '', null]) {
        expect(correo('confirmed', { logoUrl }).html).not.toContain('<img');
      }
    });

    it.each(['confirmed', 'preparing', 'ready', 'in_delivery', 'delivered'] as const)(
      '%s usa el color del negocio en la cabecera y en el botón',
      (estado) => {
        const c = correo(estado, { color: VERDE_MARCA, logoUrl: LOGO });
        expect(c.html).toContain(`border-top:4px solid ${VERDE_MARCA}`);
        expect(c.html).toContain(`<h1 style="margin:0;color:${VERDE_MARCA};`);
        expect(c.html).toContain(`background:${VERDE_MARCA};color:#FFFFFF;`);
        expect(c.html).not.toContain(AZUL_GENERICO);
      },
    );

    it.each(['cancelled', 'rejected'] as const)('%s conserva el rojo aunque el negocio tenga color', (estado) => {
      const c = correo(estado, { color: VERDE_MARCA, logoUrl: LOGO });
      expect(c.html).toContain(`<h1 style="margin:0;color:${ROJO};`);
      expect(c.html).toContain(`background:${ROJO};`);
      expect(c.html).not.toContain(VERDE_MARCA);
      // El logo sí se mantiene.
      expect(c.html).toContain(`<img src="${LOGO}"`);
    });

    it('un color que no es hexadecimal no llega al CSS', () => {
      const c = correo('confirmed', { color: 'red;background:url(https://x.co/a)' });
      expect(c.html).not.toContain('url(');
      expect(c.html).toContain(AZUL_GENERICO);
    });

    it('un color muy claro se usa de fondo, pero el título y la letra del botón quedan legibles', () => {
      const c = correo('confirmed', { color: '#fff59d' });
      expect(c.html).toContain('border-top:4px solid #FFF59D');
      expect(c.html).toContain('<h1 style="margin:0;color:#333333;');
      expect(c.html).toContain('background:#FFF59D;color:#111111;');
    });

    it('normaliza #RGB y valida el logo', () => {
      expect(normalizarColor('#8a8')).toBe('#88AA88');
      expect(normalizarColor(' #889d81 ')).toBe('#889D81');
      expect(normalizarColor('889D81')).toBeNull();
      expect(normalizarColor('#12345')).toBeNull();
      expect(logoPublico(LOGO)).toBe(LOGO);
      expect(logoPublico('ftp://cdn.ejemplo.co/l.png')).toBeNull();
    });

    it('el color del sitio web manda sobre el de la organización', async () => {
      const m = await marcaDelNegocio(dbFalsa({ primary_color: '#E8892B' }), 900, { logo_url: LOGO, primary_color: AZUL_GENERICO });
      expect(m).toEqual({ logoUrl: LOGO, color: '#E8892B' });
    });

    it('sin color en el sitio, el de la organización; si la lectura falla, también', async () => {
      expect(await marcaDelNegocio(dbFalsa({ primary_color: null }), 900, { logo_url: null, primary_color: VERDE_MARCA }))
        .toEqual({ logoUrl: null, color: VERDE_MARCA });
      expect(await marcaDelNegocio(dbFalsa(null), 900, { primary_color: '#abc' })).toEqual({ logoUrl: null, color: '#AABBCC' });
      expect(await marcaDelNegocio(dbFalsa('falla'), 900, { primary_color: VERDE_MARCA }))
        .toEqual({ logoUrl: null, color: VERDE_MARCA });
    });
  });
});

describe('remitente del aviso de estado (dominio verificado de la org)', () => {
  const ANTES = { ...process.env };
  const db = {} as SupabaseClient;
  const mensaje = { to: 'ana@correo.co', subject: 'Pedido confirmado', html: '<p>x</p>', text: 'x' };
  const enviarOrg = jest.fn(async () => ({ data: { id: 'org-1' }, error: null }));
  const enviarMaestro = jest.fn(async () => ({ data: { id: 'master-1' }, error: null }));

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EMAIL_FROM_ADDRESS = 'notificaciones@goadmin.io';
    delete process.env.EMAIL_FROM_NAME;
    (getMasterResendKey as jest.Mock).mockReturnValue('re_maestra');
    (getMasterResend as jest.Mock).mockReturnValue({ emails: { send: enviarMaestro } });
    (getResendClient as jest.Mock).mockReturnValue({ emails: { send: enviarOrg } });
  });
  afterEach(() => {
    process.env = { ...ANTES };
  });

  const dominioOrg = (fromName: string | null = null) => ({
    mode: 'org',
    domain: { domain: 'tienda-prueba.co', from_name: fromName, status: 'verified', is_default: true },
    fromEmail: 'pedidos@tienda-prueba.co',
    from: 'pedidos@tienda-prueba.co',
    replyTo: 'dominio@tienda-prueba.co',
    apiKey: 're_dominio',
  });

  it('con dominio verificado y por defecto sale desde pedidos@<dominio> con el Reply-To de los ajustes', async () => {
    (resolveSender as jest.Mock).mockResolvedValue(dominioOrg());
    const r = await enviarAvisoEstado(db, 900, { nombreOrg: 'Casa de Prueba', nombreVisible: null, responderA: 'ventas@tienda-prueba.co' }, mensaje);
    expect(r).toEqual({ ok: true, id: 'org-1' });
    expect(resolveSender).toHaveBeenCalledWith(900, { kind: 'transactional', orgName: 'Casa de Prueba' }, db);
    expect(getResendClient).toHaveBeenCalledWith('re_dominio');
    expect(enviarMaestro).not.toHaveBeenCalled();
    expect(enviarOrg).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Casa de Prueba <pedidos@tienda-prueba.co>',
      replyTo: 'ventas@tienda-prueba.co',
      to: 'ana@correo.co',
    }));
  });

  it('sin Reply-To en los ajustes usa el del dominio', async () => {
    (resolveSender as jest.Mock).mockResolvedValue(dominioOrg());
    await enviarAvisoEstado(db, 900, { nombreOrg: 'Casa de Prueba', nombreVisible: null, responderA: null }, mensaje);
    expect(enviarOrg).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'dominio@tienda-prueba.co' }));
  });

  it('sin dominio propio (resolveSender global) sale con el remitente de siempre', async () => {
    (resolveSender as jest.Mock).mockResolvedValue({ mode: 'global', domain: null, fromEmail: 'avisos@goadmin.io', from: 'x', replyTo: null, apiKey: 're_maestra' });
    const r = await enviarAvisoEstado(db, 900, { nombreOrg: 'Casa de Prueba', nombreVisible: null, responderA: null }, mensaje);
    expect(r).toEqual({ ok: true, id: 'master-1' });
    expect(getResendClient).not.toHaveBeenCalled();
    const enviado = (enviarMaestro.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(enviado.from).toBe('Casa de Prueba <notificaciones@goadmin.io>');
    expect(enviado).not.toHaveProperty('replyTo');
  });

  it('si resolveSender lanza (NO_SENDER u otro), sale con el remitente de siempre y devuelve ok', async () => {
    (resolveSender as jest.Mock).mockRejectedValue(Object.assign(new Error('La organización exige dominio propio'), { code: 'NO_SENDER' }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await enviarAvisoEstado(db, 900, { nombreOrg: 'Casa de Prueba', nombreVisible: null, responderA: 'ventas@tienda-prueba.co' }, mensaje);
    warn.mockRestore();
    expect(r).toEqual({ ok: true, id: 'master-1' });
    expect(enviarMaestro).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Casa de Prueba <notificaciones@goadmin.io>',
      replyTo: 'ventas@tienda-prueba.co',
    }));
  });

  it('el nombre visible de los ajustes manda sobre el from_name del dominio', async () => {
    (resolveSender as jest.Mock).mockResolvedValue(dominioOrg('Nombre del dominio'));
    await enviarAvisoEstado(db, 900, { nombreOrg: 'Casa de Prueba', nombreVisible: 'Tienda Casa Prueba', responderA: null }, mensaje);
    expect(resolveSender).toHaveBeenCalledWith(900, { kind: 'transactional', orgName: 'Tienda Casa Prueba' }, db);
    expect(enviarOrg).toHaveBeenCalledWith(expect.objectContaining({ from: 'Tienda Casa Prueba <pedidos@tienda-prueba.co>' }));
  });

  it('sin key maestra ni dominio no lanza: devuelve sin_proveedor', async () => {
    (getMasterResendKey as jest.Mock).mockReturnValue(null);
    (resolveSender as jest.Mock).mockRejectedValue(new Error('sin red'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await enviarAvisoEstado(db, 900, { nombreOrg: 'Casa de Prueba', nombreVisible: null, responderA: null }, mensaje);
    warn.mockRestore();
    expect(r).toEqual({ ok: false, error: 'sin_proveedor' });
  });
});

describe('aviso de confirmación por pasarela (/auto-confirm)', () => {
  /** Cliente falso por tabla: anota qué tablas se leyeron. */
  function dbPorTabla(pedido: Record<string, unknown> | null, avisosPrevios: unknown[]) {
    const tablas: string[] = [];
    const cadena = (tabla: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.limit = async () => ({ data: tabla === 'web_order_notices' ? avisosPrevios : [], error: null });
      q.maybeSingle = async () => ({ data: tabla === 'web_orders' ? pedido : null, error: null });
      return q;
    };
    const db = { from: (t: string) => { tablas.push(t); return cadena(t); } } as unknown as SupabaseClient;
    return { db, tablas };
  }

  it('un pedido sin pagar o sin confirmar no avisa nada', async () => {
    for (const p of [
      { id: 'o1', organization_id: 900, status: 'pending', payment_status: 'pending' },
      { id: 'o1', organization_id: 900, status: 'confirmed', payment_status: 'pending' },
      null,
    ]) {
      const { db, tablas } = dbPorTabla(p, []);
      await avisarPagoConfirmadoPasarela(db, 'o1');
      expect(tablas).toEqual(['web_orders']);
    }
  });

  it('si ya hubo un aviso «confirmado» (reintento del webhook) no lo repite', async () => {
    const { db, tablas } = dbPorTabla({ id: 'o1', organization_id: 900, status: 'confirmed', payment_status: 'paid' }, [{ id: 'a1' }]);
    await avisarPagoConfirmadoPasarela(db, 'o1');
    expect(tablas).toEqual(['web_orders', 'web_order_notices']);
  });

  it('nunca lanza aunque la base falle', async () => {
    const db = { from: () => { throw new Error('sin red'); } } as unknown as SupabaseClient;
    await expect(avisarPagoConfirmadoPasarela(db, 'o1')).resolves.toBeUndefined();
  });
});
