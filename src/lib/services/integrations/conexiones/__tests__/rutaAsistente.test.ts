/**
 * Toda entrada «Conectar» lleva al asistente NUEVO de Conexiones (Frente INT, fallo del dueño
 * 2026-11-07: desde Métodos de pago se abría el formulario viejo, con el logo de Mastercard para
 * Mercado Pago). `/app/integraciones/conexiones/nueva` redirige en el servidor; el formulario
 * viejo solo queda para Bold, los QR propios, WhatsApp y Twilio.
 */
const redirect = jest.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { url });
});
jest.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }));

let proveedores: Record<string, string> = {};
let conexiones: Record<string, string> = {};
jest.mock('@/lib/supabase/server-user', () => ({
  getServerUserClient: async () => ({
    from: (tabla: string) => {
      let id = '';
      const q = {
        select: () => q,
        eq: (_c: string, v: string) => ((id = v), q),
        maybeSingle: async () =>
          tabla === 'integration_providers'
            ? { data: proveedores[id] ? { code: proveedores[id] } : null, error: null }
            : { data: conexiones[id] ? { connector: { provider: { code: conexiones[id] } } } : null, error: null },
      };
      return q;
    },
  }),
}));
jest.mock('@/app/app/integraciones/conexiones/nueva/AsistenteViejo', () => ({ __esModule: true, default: () => null }));

import fs from 'fs';
import path from 'path';
import NuevaConexionPage from '@/app/app/integraciones/conexiones/nueva/page';
import { destinoDelAsistenteViejo, rutaConectar, servicioDelAsistenteNuevo } from '../rutaAsistente';

const MP = 'ef7a28a1-f698-4518-91ed-c15166728bd3';
const BOLD = '67e3749b-d8e5-4c0a-ab23-309e46064cad';
const CONEXION = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const VOLVER = '/app/finanzas/metodos-pago';

async function abrir(params: Record<string, string>): Promise<string | null> {
  redirect.mockClear();
  try {
    await NuevaConexionPage({ searchParams: Promise.resolve(params) });
    return null;
  } catch (e) {
    return (e as { url?: string }).url ?? null;
  }
}

describe('rutaAsistente', () => {
  it('el código de método de pago «mp» es Mercado Pago, en el asistente nuevo', () => {
    expect(servicioDelAsistenteNuevo('mp')?.id).toBe('mercadopago');
    expect(rutaConectar('MP', { volver: VOLVER })).toBe('/app/integraciones/conexiones?conectar=mercadopago&return=%2Fapp%2Ffinanzas%2Fmetodos-pago');
  });

  it('Bold y los QR propios siguen en el formulario viejo', () => {
    for (const c of ['bold', 'bold_link', 'bancolombia_qr', 'breb_qr', 'redeban_qr', 'whatsapp', 'twilio']) {
      expect(rutaConectar(c)).toBeNull();
    }
  });

  it('nunca devuelve a otro origen', () => {
    expect(rutaConectar('wompi', { volver: 'https://otro.co/x' })).toBe('/app/integraciones/conexiones?conectar=wompi');
    expect(rutaConectar('wompi', { volver: '//otro.co' })).toBe('/app/integraciones/conexiones?conectar=wompi');
  });

  it('logística va a su propio flujo; editar una conexión cubierta va a su detalle', () => {
    expect(rutaConectar('coordinadora')).toBe('/app/integraciones/conexiones/logistica?proveedor=coordinadora');
    expect(destinoDelAsistenteViejo({ mode: 'edit', id: CONEXION, proveedorDeConexion: 'wompi' })).toBe(`/app/integraciones/conexiones/${CONEXION}`);
    expect(destinoDelAsistenteViejo({ mode: 'edit', id: CONEXION, proveedorDeConexion: 'bold' })).toBeNull();
  });
});

describe('/app/integraciones/conexiones/nueva redirige en el servidor', () => {
  beforeEach(() => {
    proveedores = { [MP]: 'mercadopago', [BOLD]: 'bold' };
    conexiones = { [CONEXION]: 'wompi' };
  });

  it('Mercado Pago (por uuid, como lo pedía el formulario de método) → asistente nuevo con regreso', async () => {
    expect(await abrir({ provider: MP, return: VOLVER })).toBe('/app/integraciones/conexiones?conectar=mercadopago&return=%2Fapp%2Ffinanzas%2Fmetodos-pago');
  });

  it('por código de método de pago y con sucursal', async () => {
    expect(await abrir({ provider: 'mp', return: VOLVER, sucursal: '3' })).toBe(
      '/app/integraciones/conexiones?conectar=mercadopago&return=%2Fapp%2Ffinanzas%2Fmetodos-pago&sucursal=3',
    );
  });

  it('Bold se queda en el formulario viejo (no redirige)', async () => {
    expect(await abrir({ provider: BOLD })).toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('editar una conexión de Wompi → su detalle; sin proveedor → catálogo', async () => {
    expect(await abrir({ mode: 'edit', id: CONEXION })).toBe(`/app/integraciones/conexiones/${CONEXION}`);
    expect(await abrir({})).toBe('/app/integraciones/conexiones');
  });

  it('si la consulta falla no redirige a ciegas', async () => {
    proveedores = {};
    expect(await abrir({ provider: MP })).toBeNull();
  });
});

describe('las entradas de la app usan el asistente nuevo', () => {
  const fuente = (r: string) => fs.readFileSync(path.join(process.cwd(), r), 'utf8');
  it.each([
    'src/components/finanzas/metodos-pago/PaymentMethodsList.tsx',
    'src/components/finanzas/metodos-pago/PaymentMethodForm.tsx',
    'src/app/app/pms/channel-manager/page.tsx',
  ])('%s llama a rutaConectar', (r) => {
    expect(fuente(r)).toMatch(/rutaConectar\(/);
  });

  it('ningún logo de proveedor apunta al de Mastercard', () => {
    for (const r of [
      'src/components/integraciones/conexiones/AvailableProviders.tsx',
      'src/components/integraciones/conexiones/nueva/StepProviderConnector.tsx',
      'src/app/app/integraciones/conexiones/nueva/AsistenteViejo.tsx',
    ]) {
      expect(fuente(r)).not.toMatch(/Mastercard-logo/);
    }
  });
});
